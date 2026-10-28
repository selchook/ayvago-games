import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';

// '#' wall, 'X' void (wall, not drawn), '.' dot, 'o' power pellet, ' ' empty,
// '-' ghost-house door, 'B'/'P'/'I'/'C' ghost starts, 'M' muncher start, 'F' fruit spot.
const MAZE = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  'XXX#.#   B   #.#XXX',
  '####.# ##-## #.####',
  '    .  #PIC#  .    ',
  '####.# ##### #.####',
  'XXX#.#   F   #.#XXX',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....M.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
const COLS = 19, ROWS = 21, CELL = 36, OX = (720 - COLS * CELL) / 2, OY = 92;
const TUNNEL_ROW = 9;
const DOOR = { x: 9, y: 8 }, OUTSIDE = { x: 9, y: 7 }, HOUSE_Y = 9;
const FRUIT_CELL = { x: 9, y: 11 };
const FRUITS = [897, 898, 994, 801, 802, 897, 898, 994];
const FRUIT_PTS = [100, 300, 500, 700, 1000, 2000, 3000, 5000];
export const GHOST_COLORS = [0xff3b3b, 0xff8ad8, 0x3ee6ff, 0xffa53b];
const SCATTER = [{ x: 17, y: -2 }, { x: 1, y: -2 }, { x: 18, y: 22 }, { x: 0, y: 22 }];

type Dir = { x: number; y: number };
const DIRS: Dir[] = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }]; // classic tie order: up, left, down, right
const NONE: Dir = { x: 0, y: 0 };

interface Mover { x: number; y: number; dx: number; dy: number }
type GState = 'house' | 'leaving' | 'active' | 'eaten' | 'entering';
interface Ghost extends Mover {
  id: number; state: GState; scared: boolean; release: number; homeX: number;
  body: Phaser.GameObjects.Image; eyes: Phaser.GameObjects.Image;
}
type Phase = 'ready' | 'play' | 'freeze' | 'dying' | 'clear';

/** Procedural ghost / eye textures (shared with the menu). */
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('mm-ghost0')) return;
  for (let f = 0; f < 2; f++) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillCircle(16, 15, 14).fillRect(2, 15, 28, 11);
    const off = f ? 3.5 : 0;
    for (let i = 0; i < 4; i++) {
      const x0 = 2 + i * 7 - off;
      g.fillTriangle(Math.max(2, x0), 25, Math.min(30, x0 + 7), 25, Phaser.Math.Clamp(x0 + 3.5, 2, 30), 31);
    }
    if (f) g.fillTriangle(26.5, 25, 30, 25, 30, 31);
    g.generateTexture(`mm-ghost${f}`, 32, 32);
    g.destroy();
  }
  DIRS.forEach((d, i) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (const ex of [10, 22]) {
      g.fillStyle(0xffffff).fillEllipse(ex + d.x * 1.5, 13 + d.y * 1.5, 9, 11);
      g.fillStyle(0x1d3cff).fillCircle(ex + d.x * 3.5, 13 + d.y * 3.5, 2.8);
    }
    g.generateTexture(`mm-eyes${i}`, 32, 32);
    g.destroy();
  });
  for (const [key, col] of [['mm-scared', 0xffd0a0], ['mm-scared2', 0xff3b3b]] as const) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(col).fillRect(9, 10, 5, 5).fillRect(18, 10, 5, 5);
    g.lineStyle(2, col);
    g.beginPath(); g.moveTo(6, 22);
    for (let i = 1; i <= 8; i++) g.lineTo(6 + i * 2.5, i % 2 ? 19 : 22);
    g.strokePath();
    g.generateTexture(key, 32, 32);
    g.destroy();
  }
}

const cx = (x: number) => OX + (x + 0.5) * CELL;
const cy = (y: number) => OY + (y + 0.5) * CELL;

export class PlayScene extends ArcadeScene {
  private walls!: Phaser.GameObjects.Graphics;
  private pac!: Phaser.GameObjects.Graphics;
  private dots = new Map<string, Phaser.GameObjects.Arc>();
  private pellets = new Map<string, Phaser.GameObjects.Arc>();
  private ghosts: Ghost[] = [];
  private me: Mover = { x: 9, y: 15, dx: 0, dy: 0 };
  private want: Dir = NONE;
  private facing: Dir = { x: -1, y: 0 };
  private phase: Phase = 'ready';
  private phaseT = 0;
  private level = 1;
  private lives = 3;
  private totalDots = 0;
  private eatenDots = 0;
  private fright = 0;
  private ghostChain = 0;
  private modeIdx = 0;
  private modeT = 0;
  private lifeT = 0;
  private mouth = 0;
  private wakaT = 0;
  private fruit: Phaser.GameObjects.Image | null = null;
  private fruitT = 0;
  private fruitsShown = 0;
  private extraGiven = false;
  private banner!: Phaser.GameObjects.Text;
  private livesGfx!: Phaser.GameObjects.Graphics;
  private levelIcons: Phaser.GameObjects.Image[] = [];
  private swipe: { x: number; y: number } | null = null;

  createGame(): void {
    makeTextures(this);
    this.textures.get('onebit').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.dots = new Map(); this.pellets = new Map(); this.ghosts = []; this.levelIcons = [];
    this.level = 1; this.lives = 3; this.fright = 0; this.ghostChain = 0; this.extraGiven = false;
    this.fruit = null; this.fruitT = 0; this.swipe = null; this.want = NONE; this.mouth = 0; this.wakaT = 0;

    this.add.rectangle(OX - 6, OY - 6, COLS * CELL + 12, ROWS * CELL + 12, 0x000000).setOrigin(0);
    this.walls = this.add.graphics();
    this.drawWalls(0x3a5bff, 0x0b0b40);
    this.pac = this.add.graphics().setDepth(5);
    for (let i = 0; i < 4; i++) {
      const body = this.add.image(0, 0, 'mm-ghost0').setDepth(6).setScale(CELL / 32 * 1.05);
      const eyes = this.add.image(0, 0, 'mm-eyes1').setDepth(7).setScale(CELL / 32 * 1.05);
      this.ghosts.push({ id: i, x: 0, y: 0, dx: 0, dy: 0, state: 'house', scared: false, release: 0, homeX: 9, body, eyes });
    }
    this.banner = txt(this, cx(9), cy(11), '', { title: true, size: 26, color: '#ffd23f' }).setDepth(20);
    this.livesGfx = this.add.graphics().setDepth(5);

    this.buildDpad();
    this.bindInput();
    this.startLevel(true);
  }

  // ---------- setup ----------

  private startLevel(first: boolean): void {
    for (const d of this.dots.values()) d.destroy();
    for (const p of this.pellets.values()) p.destroy();
    this.dots.clear(); this.pellets.clear();
    this.totalDots = 0; this.eatenDots = 0; this.fruitsShown = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = MAZE[r][c];
      if (ch === '.') {
        const d = this.add.circle(cx(c), cy(r), 4, 0xffe0b0).setDepth(2);
        if (!first) { d.setScale(0); this.tweens.add({ targets: d, scale: 1, duration: 250, delay: (r + c) * 12 }); }
        this.dots.set(`${c},${r}`, d); this.totalDots++;
      } else if (ch === 'o') {
        const p = this.add.circle(cx(c), cy(r), 11, 0xffe0b0).setDepth(2);
        this.tweens.add({ targets: p, scale: 0.6, duration: 260, yoyo: true, repeat: -1 });
        this.pellets.set(`${c},${r}`, p); this.totalDots++;
      }
    }
    this.levelIcons.forEach((i) => i.destroy());
    this.levelIcons = [];
    for (let i = 0; i < Math.min(this.level, 6); i++) {
      const lv = this.level - i;
      this.levelIcons.push(this.add.image(680 - i * 44, 1236, 'onebit', FRUITS[(lv - 1) % FRUITS.length]).setScale(2.2).setDepth(5));
    }
    this.updateHud();
    this.resetActors();
  }

  private resetActors(): void {
    this.me = { x: 9, y: 15, dx: 0, dy: 0 };
    this.want = NONE; this.facing = { x: -1, y: 0 };
    this.fright = 0; this.ghostChain = 0; this.modeIdx = 0; this.modeT = 0; this.lifeT = 0;
    const releases = [0, 1, Math.max(1.5, 5 - this.level * 0.5), Math.max(2.5, 9 - this.level)];
    const homes = [9, 8, 9, 10];
    this.ghosts.forEach((g, i) => {
      g.state = i === 0 ? 'active' : 'house';
      g.homeX = homes[i];
      g.x = i === 0 ? OUTSIDE.x : homes[i]; g.y = i === 0 ? OUTSIDE.y : HOUSE_Y;
      g.dx = i === 0 ? -1 : 0; g.dy = 0;
      g.scared = false; g.release = releases[i];
      g.body.setVisible(true).setAlpha(1); g.eyes.setVisible(true);
    });
    if (this.fruit) { this.fruit.destroy(); this.fruit = null; }
    this.setPhase('ready', this.level === 1 && this.lives === 3 && this.eatenDots === 0 ? 2.2 : 1.6);
    this.banner.setText(t('ready')).setVisible(true).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.sfx('ready', { volume: 0.5 });
    this.drawActors();
  }

  private setPhase(p: Phase, time = 0): void {
    this.phase = p; this.phaseT = time;
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.livesGfx.clear();
    for (let i = 0; i < this.lives - 1; i++) {
      this.livesGfx.fillStyle(0xffd23f).slice(36 + i * 44, 1236, 16, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(150), false).fillPath();
    }
  }

  // ---------- drawing ----------

  private isWallCh(c: number, r: number): boolean {
    if (r < 0 || r >= ROWS) return false;
    if (c < 0 || c >= COLS) return false;
    const ch = MAZE[r][c];
    return ch === '#';
  }

  private drawWalls(outer: number, inner: number): void {
    const g = this.walls;
    g.clear();
    const layer = (inset: number, color: number) => {
      g.fillStyle(color);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!this.isWallCh(c, r)) continue;
        const x = OX + c * CELL, y = OY + r * CELL;
        const L = this.isWallCh(c - 1, r) ? 0 : inset, R = this.isWallCh(c + 1, r) ? 0 : inset;
        const U = this.isWallCh(c, r - 1) ? 0 : inset, D = this.isWallCh(c, r + 1) ? 0 : inset;
        g.fillRect(x + L, y + U, CELL - L - R, CELL - U - D);
        // fill inner corners so diagonal joins look solid
        if (!L && !U && !this.isWallCh(c - 1, r - 1)) g.fillRect(x, y, inset, inset);
      }
    };
    layer(6, outer);
    layer(10, inner);
    // ghost-house door
    g.fillStyle(0xff8ad8).fillRect(OX + DOOR.x * CELL + 2, OY + DOOR.y * CELL + CELL / 2 - 3, CELL - 4, 6);
  }

  private drawActors(): void {
    const g = this.pac;
    g.clear();
    if (this.phase !== 'dying' || this.phaseT > 0) {
      const x = cx(this.me.x), y = cy(this.me.y);
      const ang = Math.atan2(this.facing.y, this.facing.x);
      let open = 0.08 + Math.abs(Math.sin(this.mouth)) * 0.62;
      if (this.phase === 'dying') open = Phaser.Math.Clamp(Math.PI * (1 - this.phaseT / 1.4), 0.1, Math.PI);
      g.fillStyle(0xffd23f).slice(x, y, CELL * 0.48, ang + open, ang - open + Math.PI * 2, false).fillPath();
    }
    const flashing = this.fright > 0 && this.fright < 2 && Math.floor(this.fright * 6) % 2 === 0;
    for (const gh of this.ghosts) {
      const x = cx(gh.x), y = cy(gh.y);
      const frame = Math.floor(this.elapsed * 8 + gh.id) % 2;
      gh.body.setPosition(x, y).setTexture(`mm-ghost${frame}`);
      gh.eyes.setPosition(x, y);
      if (gh.state === 'eaten' || gh.state === 'entering') {
        gh.body.setVisible(false);
        gh.eyes.setTexture(`mm-eyes${this.dirIndex(gh)}`);
      } else if (gh.scared) {
        gh.body.setVisible(true).setTint(flashing ? 0xffffff : 0x2a3bff);
        gh.eyes.setTexture(flashing ? 'mm-scared2' : 'mm-scared');
      } else {
        gh.body.setVisible(true).setTint(GHOST_COLORS[gh.id]);
        gh.eyes.setTexture(`mm-eyes${this.dirIndex(gh)}`);
      }
    }
  }

  private dirIndex(m: Mover): number {
    const i = DIRS.findIndex((d) => d.x === m.dx && d.y === m.dy);
    return i < 0 ? 2 : i;
  }

  // ---------- input ----------

  private bindInput(): void {
    const kb = this.input.keyboard;
    const map: Record<string, Dir> = { UP: DIRS[0], LEFT: DIRS[1], DOWN: DIRS[2], RIGHT: DIRS[3], W: DIRS[0], A: DIRS[1], S: DIRS[2], D: DIRS[3] };
    for (const [k, d] of Object.entries(map)) kb?.on(`keydown-${k}`, () => this.steer(d));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.swipe = p.y < 900 || p.x < 120 ? { x: p.x, y: p.y } : null; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.swipe) return;
      const dx = p.x - this.swipe.x, dy = p.y - this.swipe.y;
      if (Math.hypot(dx, dy) < 28) return;
      this.steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS[3] : DIRS[1]) : (dy > 0 ? DIRS[2] : DIRS[0]));
      this.swipe = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', () => { this.swipe = null; });
  }

  private buildDpad(): void {
    const c = { x: 360, y: 1068 };
    const spots: Array<[Dir, number, number, number]> = [
      [DIRS[0], c.x, c.y - 112, -90], [DIRS[2], c.x, c.y + 112, 90], [DIRS[1], c.x - 150, c.y, 180], [DIRS[3], c.x + 150, c.y, 0],
    ];
    this.add.circle(c.x, c.y, 46, 0xffffff, 0.06).setStrokeStyle(3, 0x3a5bff, 0.5);
    for (const [d, x, y, ang] of spots) {
      const w = d.x ? 130 : 120, h = d.x ? 110 : 104;
      const btn = this.add.rectangle(x, y, w, h, 0x3a5bff, 0.22).setStrokeStyle(4, 0x3a5bff, 0.85).setInteractive();
      const arrow = this.add.triangle(x, y, 0, -22, 0, 22, 30, 0, 0xffffff, 0.85).setAngle(ang);
      btn.on('pointerdown', () => {
        this.steer(d);
        btn.setFillStyle(0x3a5bff, 0.6);
        this.tweens.add({ targets: arrow, scale: 0.8, duration: 70, yoyo: true });
      });
      const up = () => btn.setFillStyle(0x3a5bff, 0.22);
      btn.on('pointerup', up); btn.on('pointerout', up);
    }
  }

  private steer(d: Dir): void {
    if (this.isOver) return;
    this.want = d;
    // instant reversal mid-corridor
    if (this.me.dx === -d.x && this.me.dy === -d.y && (d.x || d.y)) { this.me.dx = d.x; this.me.dy = d.y; this.facing = d; }
  }

  // ---------- grid movement ----------

  private open(c: number, r: number, door = false): boolean {
    if (r < 0 || r >= ROWS) return false;
    if (r === TUNNEL_ROW) c = (c + COLS) % COLS;
    if (c < 0 || c >= COLS) return false;
    const ch = MAZE[r][c];
    if (ch === '#' || ch === 'X') return false;
    if (ch === '-') return door;
    return true;
  }

  /** Moves along the grid; `choose` runs at every tile centre to pick the next direction. */
  private step(m: Mover, dist: number, choose: (m: Mover) => void, door = false): void {
    for (let guard = 0; guard < 12 && dist > 1e-6; guard++) {
      const atCentre = m.x === Math.round(m.x) && m.y === Math.round(m.y);
      if (atCentre && (!(m.dx || m.dy) || !this.open(m.x + m.dx, m.y + m.dy, door))) {
        choose(m);
        if (!(m.dx || m.dy) || !this.open(m.x + m.dx, m.y + m.dy, door)) { m.dx = 0; m.dy = 0; return; }
      }
      let d: number;
      if (m.dx) {
        const nx = m.dx > 0 ? Math.floor(m.x) + 1 : Math.ceil(m.x) - 1;
        d = Math.abs(nx - m.x);
        if (dist < d) { m.x += m.dx * dist; return; }
        m.x = nx;
      } else {
        const ny = m.dy > 0 ? Math.floor(m.y) + 1 : Math.ceil(m.y) - 1;
        d = Math.abs(ny - m.y);
        if (dist < d) { m.y += m.dy * dist; return; }
        m.y = ny;
      }
      dist -= d;
      if (m.x < 0) m.x += COLS;
      if (m.x >= COLS) m.x -= COLS;
      choose(m);
      if (!(m.dx || m.dy)) return;
    }
  }

  private choosePac = (m: Mover): void => {
    if ((this.want.x || this.want.y) && this.open(m.x + this.want.x, m.y + this.want.y)) {
      if (m.dx !== this.want.x || m.dy !== this.want.y) this.sfx('turn', { volume: 0.08 });
      m.dx = this.want.x; m.dy = this.want.y;
    } else if (!this.open(m.x + m.dx, m.y + m.dy)) { m.dx = 0; m.dy = 0; }
    if (m.dx || m.dy) this.facing = { x: m.dx, y: m.dy };
  };

  private ghostTarget(g: Ghost): Dir {
    if (g.state === 'eaten') return OUTSIDE;
    const scatter = this.modeIdx % 2 === 0 && this.modeIdx < 7;
    if (scatter && !(g.id === 0 && this.dotsLeft() < 20)) return SCATTER[g.id];
    const p = { x: Math.round(this.me.x), y: Math.round(this.me.y) };
    const f = this.facing;
    switch (g.id) {
      case 0: return p;
      case 1: return { x: p.x + f.x * 4, y: p.y + f.y * 4 };
      case 2: {
        const b = this.ghosts[0];
        const ax = p.x + f.x * 2, ay = p.y + f.y * 2;
        return { x: ax * 2 - Math.round(b.x), y: ay * 2 - Math.round(b.y) };
      }
      default:
        return Math.hypot(g.x - p.x, g.y - p.y) > 6 ? p : SCATTER[3];
    }
  }

  private chooseGhost = (m: Mover): void => {
    const g = m as Ghost;
    if (g.state === 'eaten' && g.x === OUTSIDE.x && g.y === OUTSIDE.y) { g.state = 'entering'; g.dx = 0; g.dy = 0; return; }
    const opts = DIRS.filter((d) => !(d.x === -g.dx && d.y === -g.dy && (g.dx || g.dy)) && this.open(g.x + d.x, g.y + d.y));
    if (!opts.length) { g.dx = -g.dx; g.dy = -g.dy; return; }
    let pick: Dir;
    if (g.scared && g.state === 'active') pick = rng.pick(opts);
    else {
      const tg = this.ghostTarget(g);
      pick = opts[0];
      let best = Infinity;
      for (const d of opts) {
        const dd = (g.x + d.x - tg.x) ** 2 + (g.y + d.y - tg.y) ** 2;
        if (dd < best - 1e-9) { best = dd; pick = d; }
      }
    }
    g.dx = pick.x; g.dy = pick.y;
  };

  // ---------- rules ----------

  private dotsLeft(): number {
    return this.totalDots - this.eatenDots;
  }

  private pacSpeed(): number {
    return Math.min(8.4, 6 + (this.level - 1) * 0.3) + (this.fright > 0 ? 0.4 : 0);
  }

  private ghostSpeed(g: Ghost): number {
    if (g.state === 'eaten' || g.state === 'entering') return 13;
    if (g.state === 'house' || g.state === 'leaving') return 3;
    if (g.y === TUNNEL_ROW && (g.x < 4 || g.x > 14)) return 3;
    if (g.scared) return 3.4 + this.level * 0.05;
    let s = Math.min(8.6, 5.5 + (this.level - 1) * 0.38);
    if (g.id === 0 && this.dotsLeft() < 20) s *= 1.1;
    return s;
  }

  private schedule(): number[] {
    return this.level === 1 ? [7, 20, 7, 20, 5, 20, 5] : this.level < 5 ? [7, 20, 7, 20, 5, 40, 1] : [5, 20, 5, 20, 5, 40, 1];
  }

  private reverseActive(): void {
    for (const g of this.ghosts) if (g.state === 'active') { g.dx = -g.dx; g.dy = -g.dy; }
  }

  private eatAt(c: number, r: number): void {
    const key = `${c},${r}`;
    const d = this.dots.get(key);
    if (d) {
      d.destroy(); this.dots.delete(key); this.eatenDots++;
      this.addScore(10);
      if (this.wakaT <= 0) { this.sfx('waka', { volume: 0.25, rate: 1 + (this.eatenDots % 2) * 0.25 }); this.wakaT = 0.09; }
    }
    const p = this.pellets.get(key);
    if (p) {
      p.destroy(); this.pellets.delete(key); this.eatenDots++;
      this.addScore(50, cx(c), cy(r) - 20);
      this.sfx('pellet', { volume: 0.5 });
      flash(this, 0x2a3bff, 120);
      burst(this, cx(c), cy(r), [0xffe0b0, 0x3a5bff], 18, 220);
      this.fright = Math.max(1.5, 7 - this.level * 0.7);
      this.ghostChain = 0;
      for (const g of this.ghosts) if (g.state !== 'eaten' && g.state !== 'entering') g.scared = true;
      this.reverseActive();
    }
    if ((d || p) && (this.eatenDots === 50 || this.eatenDots === 120) && !this.fruit && this.fruitsShown < 2) this.spawnFruit();
    if (this.extraGiven === false && this.score >= 10000) {
      this.extraGiven = true; this.lives++; this.updateHud();
      this.sfx('life'); popup(this, cx(9), cy(13), t('extraLife'), '#5dff7a', 26);
    }
    if ((d || p) && this.dotsLeft() <= 0) this.levelClear();
  }

  private spawnFruit(): void {
    this.fruitsShown++;
    const lv = (this.level - 1) % FRUITS.length;
    this.fruit = this.add.image(cx(FRUIT_CELL.x), cy(FRUIT_CELL.y), 'onebit', FRUITS[lv]).setScale(0).setDepth(4);
    this.tweens.add({ targets: this.fruit, scale: 2.3, duration: 300, ease: 'Back.easeOut' });
    this.fruitT = 9;
  }

  private levelClear(): void {
    this.setPhase('clear', 2.2);
    if (this.fruit) { this.fruit.destroy(); this.fruit = null; }
    this.sfx('clear', { volume: 0.6 });
    this.banner.setText(t('levelClear')).setVisible(true).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 350, ease: 'Back.easeOut' });
    for (const g of this.ghosts) { g.body.setVisible(false); g.eyes.setVisible(false); }
    let n = 0;
    this.time.addEvent({ delay: 220, repeat: 7, callback: () => this.drawWalls(n++ % 2 ? 0x3a5bff : 0xffffff, 0x0b0b40) });
    this.addScore(this.level * 250, cx(9), cy(9));
  }

  private die(): void {
    this.setPhase('dying', 1.4);
    this.sfx('die', { volume: 0.6 });
    shake(this, 0.015, 300);
    flash(this, 0xec3013, 150);
    for (const g of this.ghosts) { g.body.setVisible(false); g.eyes.setVisible(false); }
  }

  private afterDeath(): void {
    burst(this, cx(this.me.x), cy(this.me.y), [0xffd23f, 0xffffff], 30, 300);
    this.lives--;
    this.updateHud();
    if (this.lives <= 0) {
      this.pac.clear();
      this.endGame();
      return;
    }
    this.resetActors();
  }

  private eatGhost(g: Ghost): void {
    this.ghostChain++;
    const pts = 200 * 2 ** Math.min(3, this.ghostChain - 1);
    g.scared = false; g.state = 'eaten';
    burst(this, cx(g.x), cy(g.y), [0x2a3bff, 0xffffff, GHOST_COLORS[g.id]], 26, 320);
    shake(this, 0.008, 120);
    this.sfx('eatghost', { volume: 0.55 });
    this.addScore(pts, cx(g.x), cy(g.y));
    this.setPhase('freeze', 0.45);
    // snap eyes to the grid so the pathing stays exact
    g.x = Math.round(g.x) % COLS; g.y = Math.round(g.y);
    g.dx = 0; g.dy = 0;
  }

  // ---------- loop ----------

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.wakaT -= dt;
    if (this.phase !== 'play') {
      this.phaseT -= dt;
      if (this.phase === 'dying') { this.drawActors(); }
      if (this.phaseT > 0) return;
      if (this.phase === 'ready') { this.banner.setVisible(false); this.setPhase('play'); }
      else if (this.phase === 'freeze') this.setPhase('play');
      else if (this.phase === 'dying') { this.afterDeath(); return; }
      else if (this.phase === 'clear') {
        this.level++;
        this.drawWalls(0x3a5bff, 0x0b0b40);
        this.banner.setVisible(false);
        this.startLevel(false);
        return;
      }
    }

    this.lifeT += dt;
    // scatter/chase schedule pauses while ghosts are frightened
    if (this.fright > 0) {
      this.fright -= dt;
      if (this.fright <= 0) { this.fright = 0; for (const g of this.ghosts) g.scared = false; }
    } else {
      const sch = this.schedule();
      if (this.modeIdx < sch.length) {
        this.modeT += dt;
        if (this.modeT >= sch[this.modeIdx]) { this.modeT = 0; this.modeIdx++; this.reverseActive(); }
      }
    }

    // muncher
    const moving = this.me.dx || this.me.dy;
    this.step(this.me, this.pacSpeed() * dt, this.choosePac);
    if (moving || this.me.dx || this.me.dy) this.mouth += dt * 16;
    this.eatAt(Math.round(this.me.x) % COLS, Math.round(this.me.y));
    if (this.phase !== 'play') { this.drawActors(); return; }

    // fruit
    if (this.fruit) {
      this.fruitT -= dt;
      if (Math.abs(this.me.x - FRUIT_CELL.x) < 0.5 && Math.abs(this.me.y - FRUIT_CELL.y) < 0.5) {
        const pts = FRUIT_PTS[Math.min(FRUIT_PTS.length - 1, this.level - 1)];
        this.addScore(pts, this.fruit.x, this.fruit.y - 20);
        this.sfx('fruit', { volume: 0.5 });
        burst(this, this.fruit.x, this.fruit.y, [0xff3b3b, 0x5dff7a, 0xffd23f], 20, 260);
        this.fruit.destroy(); this.fruit = null;
      } else if (this.fruitT <= 0) {
        const f = this.fruit; this.fruit = null;
        this.tweens.add({ targets: f, scale: 0, duration: 200, onComplete: () => f.destroy() });
      }
    }

    // ghosts
    for (const g of this.ghosts) {
      const sp = this.ghostSpeed(g) * dt;
      switch (g.state) {
        case 'house':
          g.y = HOUSE_Y + Math.sin(this.elapsed * 6 + g.id) * 0.25;
          if (this.lifeT >= g.release) { g.state = 'leaving'; }
          break;
        case 'leaving':
          if (Math.abs(g.x - 9) > 1e-3) {
            g.dx = Math.sign(9 - g.x); g.dy = 0;
            g.x += Phaser.Math.Clamp(9 - g.x, -sp, sp);
            g.y += Phaser.Math.Clamp(HOUSE_Y - g.y, -sp, sp);
          } else {
            g.x = 9; g.y -= sp; g.dx = 0; g.dy = -1;
            if (g.y <= OUTSIDE.y) { g.y = OUTSIDE.y; g.state = 'active'; g.dx = rng.chance(0.5) ? -1 : 1; g.dy = 0; }
          }
          break;
        case 'entering':
          g.dx = 0; g.dy = 1;
          g.y = Math.min(HOUSE_Y, g.y + sp);
          if (g.y >= HOUSE_Y) { g.state = 'leaving'; g.scared = false; g.release = 0; }
          break;
        case 'eaten':
          this.step(g, sp, this.chooseGhost, false);
          break;
        default:
          this.step(g, sp, this.chooseGhost);
      }
      const sameTile = Math.round(g.x) % COLS === Math.round(this.me.x) % COLS && Math.round(g.y) === Math.round(this.me.y);
      if (g.state === 'active' && (sameTile || Math.hypot(g.x - this.me.x, g.y - this.me.y) < 0.65)) {
        if (g.scared) this.eatGhost(g);
        else { this.die(); break; }
      }
    }
    this.drawActors();
  }
}
