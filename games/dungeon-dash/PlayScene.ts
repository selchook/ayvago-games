import Phaser from 'phaser';
import { ArcadeScene, Button, CHARACTER_FRAME, COLORS, Controls, burst, shake, t, rng, StickDir, type Dir4 } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

// Grid: 11 x 15 tiles of 8 px art scaled x8 = 64 px
const COLS = 11, ROWS = 15, TS = 64, SC = 8;
const OX = (720 - COLS * TS) / 2, OY = 140;
const VIEW = 4.5;                       // light radius in tiles

// The hero is the player's own character (textures 'pc-*'), posed by the way it faces: right and
// left use the side poses (mirrored for left), down `front`, up `back`.
export const HERO_POSES = [
  'stand', 'walk1', 'walk2', 'front', 'walkdown1', 'walkdown2', 'back', 'walkup1', 'walkup2',
  'action1', 'action2', 'hit', 'hold2', 'cheer1', 'cheer2', 'climb1', 'climb2',
] as const;
type HeroPose = (typeof HERO_POSES)[number];
type Facing = 'left' | 'right' | 'up' | 'down';
export const HERO_SCALE = 76 / CHARACTER_FRAME.standHeight;   // a little taller than a tile
const FOOT = 6;                                               // feet this far above the tile's bottom edge
const tileX = (c: number) => OX + c * TS + TS / 2;
const tileY = (r: number) => OY + r * TS + TS / 2;
/** Draw order: lower rows in front. */
const depthAt = (y: number) => 4 + y / 10000;

// micro-roguelike frames
const F = {
  wall: 58, floor: 15, floor2: 60, stairs: 47,
  potion: 119, chest: 82, coin: 78, ring: 79, sword: 62, shield: 94, heart: 90, fire: 120,
};

type Behaviour = 'chase' | 'erratic' | 'slow';
interface MonsterDef { frame: number; hp: number; atk: number; def: number; score: number; beh: Behaviour; minFloor: number }
const MONSTERS: MonsterDef[] = [
  { frame: 23, hp: 2, atk: 1, def: 0, score: 10, beh: 'erratic', minFloor: 1 },   // bat
  { frame: 19, hp: 3, atk: 1, def: 0, score: 10, beh: 'chase', minFloor: 1 },     // rat
  { frame: 22, hp: 5, atk: 2, def: 0, score: 15, beh: 'slow', minFloor: 2 },      // slime
  { frame: 18, hp: 4, atk: 2, def: 0, score: 20, beh: 'chase', minFloor: 2 },     // snake
  { frame: 21, hp: 5, atk: 2, def: 0, score: 25, beh: 'erratic', minFloor: 3 },   // spider
  { frame: 10, hp: 7, atk: 3, def: 1, score: 35, beh: 'chase', minFloor: 4 },     // skeleton
  { frame: 11, hp: 6, atk: 3, def: 0, score: 35, beh: 'chase', minFloor: 4 },     // goblin
  { frame: 12, hp: 10, atk: 3, def: 2, score: 45, beh: 'slow', minFloor: 5 },     // crab
  { frame: 9, hp: 13, atk: 4, def: 1, score: 60, beh: 'chase', minFloor: 6 },     // orc
  { frame: 26, hp: 18, atk: 4, def: 2, score: 70, beh: 'slow', minFloor: 7 },     // treant
  { frame: 25, hp: 14, atk: 5, def: 1, score: 80, beh: 'chase', minFloor: 8 },    // demon
];
const BOSS: MonsterDef = { frame: 13, hp: 20, atk: 4, def: 1, score: 300, beh: 'chase', minFloor: 5 };

type ItemKind = 'potion' | 'chest' | 'coin' | 'heart' | 'fire';
interface Item { kind: ItemKind; c: number; r: number; img: Phaser.GameObjects.Image }
interface Monster { def: MonsterDef; c: number; r: number; hp: number; maxHp: number; atk: number; img: Phaser.GameObjects.Image; awake: boolean; boss: boolean; tick: number }
interface Room { x: number; y: number; w: number; h: number }

const DIRS: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export class PlayScene extends ArcadeScene {
  protected useHud = true;
  private grid: number[][] = [];            // 1 wall, 0 floor
  private seen: boolean[][] = [];
  private vis: boolean[][] = [];
  private tiles: Phaser.GameObjects.Image[][] = [];
  private items: Item[] = [];
  private monsters: Monster[] = [];
  private hero!: Phaser.GameObjects.Image;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private torch!: Phaser.GameObjects.Image;
  private stairsGlow!: Phaser.GameObjects.Image;
  private fxG!: Phaser.GameObjects.Graphics;
  private facing: Facing = 'down';
  private poseUntil = 0;          // a held pose (attack, hurt, potion, cheer) shows until then
  private walkStep = 0;
  private moveEnd = 0;            // the walk pose shows while the step tween runs
  private stairsImg!: Phaser.GameObjects.Image;
  private uiG!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private atkText!: Phaser.GameObjects.Text;
  private defText!: Phaser.GameObjects.Text;
  private lvlText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private potionBtn!: Button;
  private pc = 0; private pr = 0;
  private sc = 0; private sr = 0;
  private hp = 12; private maxHp = 12; private atk = 3; private def = 0;
  private potions = 1;
  private xp = 0;
  private lvl = 1;
  private floor = 1;
  private busyUntil = 0;
  private bossAlive = false;
  private dead = false;
  private turn = 0;
  private holdDir: string | null = null;
  private holdT = 0;
  private controls!: Controls;
  private stick!: StickDir;
  private stickWant: Dir4 | null = null;   // a stick step waiting for the current turn to finish
  private stickWantAt = 0;

  createGame(): void {
    freshTextCanvases(this);
    this.stepFoot = 0; this.lowWarned = false;
    this.grid = []; this.seen = []; this.vis = []; this.tiles = []; this.items = []; this.monsters = [];
    this.hp = 16; this.maxHp = 16; this.atk = 3; this.def = 0; this.potions = 2; this.floor = 1; this.xp = 0; this.lvl = 1;
    this.busyUntil = 0; this.bossAlive = false; this.dead = false; this.turn = 0; this.holdDir = null; this.holdT = 0;
    this.stickWant = null; this.stickWantAt = 0;

    this.add.rectangle(OX - 6, OY - 6, COLS * TS + 12, ROWS * TS + 12, 0x000000).setOrigin(0).setStrokeStyle(4, 0x3a3450);
    for (let r = 0; r < ROWS; r++) {
      this.tiles.push([]);
      for (let c = 0; c < COLS; c++) {
        this.tiles[r].push(this.add.image(OX + c * TS + TS / 2, OY + r * TS + TS / 2, 'mr', F.floor).setScale(SC).setDepth(1));
      }
    }
    this.stairsImg = this.add.image(0, 0, 'mr', F.stairs).setScale(SC).setDepth(2);
    this.makeGlow();
    this.stairsGlow = this.add.image(0, 0, 'dd-glow').setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0x5dff7a).setAlpha(0);
    this.torch = this.add.image(0, 0, 'dd-glow').setDepth(2.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040).setScale(2.6);
    this.heroShadow = this.add.ellipse(0, 0, 44, 14, 0x000000, 0.45).setDepth(3.5);
    this.hero = this.add.image(0, 0, 'pc-front').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(HERO_SCALE).setDepth(5);
    this.fxG = this.add.graphics().setDepth(6);
    this.facing = 'down'; this.poseUntil = 0; this.walkStep = 0; this.moveEnd = 0;
    this.uiG = this.add.graphics().setDepth(20);
    this.hpText = ftxt(this, 154, 100, '', { title: true, size: 18 }).setDepth(21);
    this.add.image(330, 100, 'mrk', F.sword).setScale(5).setDepth(21);
    this.atkText = ftxt(this, 372, 100, '', { title: true, size: 22 }).setDepth(21);
    this.add.image(440, 100, 'mrk', F.shield).setScale(5).setDepth(21);
    this.defText = ftxt(this, 482, 100, '', { title: true, size: 22 }).setDepth(21);
    this.lvlText = ftxt(this, 560, 100, '', { title: true, size: 18, color: '#3ee6ff' }).setDepth(21);
    this.msg = ftxt(this, 360, 1126, '', { title: true, size: 20, color: '#ffd23f' }).setDepth(21);

    new Button(this, 190, 1206, t('wait'), () => this.act('wait'), { width: 300, height: 92, size: 24, color: 0x333344 });
    this.potionBtn = new Button(this, 530, 1206, '', () => this.act('potion'), { width: 300, height: 92, size: 24, color: COLORS.red });

    // keyboard
    const kb = this.input.keyboard!;
    const map: Record<string, string> = { UP: 'up', W: 'up', DOWN: 'down', S: 'down', LEFT: 'left', A: 'left', RIGHT: 'right', D: 'right' };
    for (const [k, d] of Object.entries(map)) {
      kb.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) { this.holdDir = d; this.holdT = 0.28; this.act(d); } });
      kb.on(`keyup-${k}`, () => { if (this.holdDir === d) this.holdDir = null; });
    }
    kb.on('keydown-SPACE', () => this.act('wait'));
    kb.on('keydown-X', () => this.act('potion'));
    kb.on('keydown-Q', () => this.act('potion'));

    // touch: the standard floating stick, anywhere on the screen. A push steps one tile and
    // holding it keeps walking at the same pace as a held key; WAIT and POTION stay as buttons.
    this.controls = new Controls(this, { joystick: true });
    this.stick = new StickDir(this.controls, 280, 160);

    this.buildFloor();
  }

  // ---------------------------------------------------------------- level generation
  private buildFloor(): void {
    for (const it of this.items) it.img.destroy();
    for (const m of this.monsters) m.img.destroy();
    this.items = []; this.monsters = [];
    let rooms: Room[] = [];
    // retry until we get a decent layout
    for (let attempt = 0; attempt < 30; attempt++) {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
      rooms = [];
      for (let k = 0; k < 60 && rooms.length < 7; k++) {
        const w = rng.int(3, 5), h = rng.int(3, 5);
        const x = rng.int(1, COLS - 1 - w), y = rng.int(1, ROWS - 1 - h);
        if (rooms.some((o) => x <= o.x + o.w && x + w >= o.x && y <= o.y + o.h && y + h >= o.y)) continue;
        rooms.push({ x, y, w, h });
      }
      if (rooms.length >= 4) break;
    }
    for (const rm of rooms) for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) this.grid[y][x] = 0;
    const centre = (rm: Room): [number, number] => [rm.x + Math.floor(rm.w / 2), rm.y + Math.floor(rm.h / 2)];
    const dig = (a: [number, number], b: [number, number]) => {
      let [x, y] = a;
      const horizFirst = rng.chance(0.5);
      const stepX = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); this.grid[y][x] = 0; } };
      const stepY = () => { while (y !== b[1]) { y += Math.sign(b[1] - y); this.grid[y][x] = 0; } };
      if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    };
    // connect rooms in order of position (a rough path) plus one extra loop
    rooms.sort((a, b) => (a.y + a.x * 0.3) - (b.y + b.x * 0.3));
    for (let i = 1; i < rooms.length; i++) dig(centre(rooms[i - 1]), centre(rooms[i]));
    if (rooms.length > 3) dig(centre(rooms[0]), centre(rooms[rng.int(2, rooms.length - 1)]));

    // hero in the first room, stairs at the farthest reachable floor tile
    [this.pc, this.pr] = centre(rooms[0]);
    const dist = this.bfs(this.pc, this.pr);
    let best: [number, number] = [this.pc, this.pr], bd = -1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (dist[r][c] > bd && this.isRoomTile(rooms, c, r)) { bd = dist[r][c]; best = [c, r]; }
    [this.sc, this.sr] = best;

    const free = (): [number, number] | null => {
      for (let k = 0; k < 200; k++) {
        const rm = rng.pick(rooms);
        const c = rng.int(rm.x, rm.x + rm.w - 1), r = rng.int(rm.y, rm.y + rm.h - 1);
        if (this.occupied(c, r) || (c === this.sc && r === this.sr)) continue;
        if (Math.abs(c - this.pc) + Math.abs(r - this.pr) < 3) continue;
        return [c, r];
      }
      return null;
    };

    // monsters
    const f = this.floor;
    const pool = MONSTERS.filter((m) => m.minFloor <= f).slice(-5);   // the five toughest unlocked kinds
    const count = Math.min(10, 2 + Math.floor(f * 0.9));
    for (let i = 0; i < count; i++) {
      const spot = free();
      if (!spot) break;
      if (Math.abs(spot[0] - this.pc) + Math.abs(spot[1] - this.pr) < 4) continue;
      // later floors favour the tougher end of the pool
      const def = pool[Math.min(pool.length - 1, Math.floor(Math.pow(Math.random(), 0.7) * pool.length))];
      this.spawnMonster(def, spot[0], spot[1], false);
    }
    this.bossAlive = false;
    if (f % 5 === 0) {
      // the floor guardian waits next to the stairs
      const around = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => [this.sc + dx, this.sr + dy]).filter(([c, r]) => this.grid[r]?.[c] === 0 && !this.occupied(c, r));
      const [bc, br] = around.length ? around[0] : [this.sc, this.sr];
      this.spawnMonster(BOSS, bc, br, true);
      this.bossAlive = true;
    }
    // items
    const place = (kind: ItemKind, frame: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const spot = free();
        if (!spot) return;
        const img = this.add.image(tileX(spot[0]), tileY(spot[1]), 'mrk', frame).setScale(SC).setDepth(3).setVisible(false);
        // treasure floats gently; traps flicker
        if (kind === 'fire') this.tweens.add({ targets: img, scaleY: SC * 1.12, duration: 160 + rng.int(0, 80), yoyo: true, repeat: -1 });
        else this.tweens.add({ targets: img, y: img.y - 5, duration: 700 + rng.int(0, 300), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rng.int(0, 400) });
        this.items.push({ kind, c: spot[0], r: spot[1], img });
      }
    };
    place('coin', F.coin, rng.int(2, 4));
    place('potion', F.potion, rng.chance(0.65) ? 1 : 0);
    place('chest', F.chest, 1 + (rng.chance(0.3) ? 1 : 0));
    place('heart', F.heart, rng.chance(0.4) ? 1 : 0);
    if (f >= 3) place('fire', F.fire, Math.min(4, f - 2));

    // paint tiles
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const img = this.tiles[r][c];
      img.setVisible(true);
      if (this.grid[r][c] === 1) {
        let nearFloor = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.grid[r + dy]?.[c + dx] === 0) nearFloor = true;
        img.setFrame(F.wall).setVisible(nearFloor);
      } else img.setFrame(rng.chance(0.18) ? F.floor2 : F.floor);
      img.setAlpha(0).setTint(0xffffff);
    }
    this.seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.vis = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    this.stairsImg.setPosition(OX + this.sc * TS + TS / 2, OY + this.sr * TS + TS / 2).setAlpha(0);
    this.tweens.killTweensOf(this.hero);
    this.facing = 'down'; this.poseUntil = 0;
    this.hero.setPosition(tileX(this.pc), this.heroFeetY(this.pr)).setScale(HERO_SCALE).setAngle(0).setAlpha(1).clearTint();
    this.setPose(this.idlePose());
    this.stairsGlow.setPosition(tileX(this.sc), tileY(this.sr));
    this.hud.setRight(`${t('floor')} ${f}`);
    this.updateVision();
    this.updateUi();
    this.cameras.main.fadeIn(350, 0, 0, 0);
    if (this.bossAlive) {
      this.say(t('boss'), '#ec3013');
      this.sfx('boss', { volume: 0.6 });
    } else this.say(`${t('floor')} ${f}`, '#ffd23f');
  }

  private isRoomTile(rooms: Room[], c: number, r: number): boolean {
    return rooms.some((rm) => c >= rm.x && c < rm.x + rm.w && r >= rm.y && r < rm.y + rm.h);
  }

  private bfs(sc: number, sr: number): number[][] {
    const d = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    const q: Array<[number, number]> = [[sc, sr]];
    d[sr][sc] = 0;
    while (q.length) {
      const [c, r] = q.shift()!;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nc = c + dx, nr = r + dy;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.grid[nr][nc] === 1 || d[nr][nc] >= 0) continue;
        d[nr][nc] = d[r][c] + 1;
        q.push([nc, nr]);
      }
    }
    return d;
  }

  private spawnMonster(def: MonsterDef, c: number, r: number, boss: boolean): void {
    const scaleHp = 1 + (this.floor - 1) * 0.14;
    const hp = boss ? 8 + this.floor * 2 : Math.round(def.hp * scaleHp);
    const atk = boss ? 2 + Math.floor(this.floor / 5) : def.atk + Math.floor((this.floor - def.minFloor) / 3);
    const img = this.add.image(tileX(c), tileY(r), 'mrk', def.frame).setScale(SC).setDepth(depthAt(tileY(r) + TS / 2 - 1)).setVisible(false);
    if (boss) img.setTint(0xff9090).setScale(SC * 1.15);
    // idle breathing, out of step with the others
    this.tweens.add({ targets: img, scaleY: img.scaleY * 1.07, duration: 380 + rng.int(0, 200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rng.int(0, 300) });
    this.monsters.push({ def, c, r, hp, maxHp: hp, atk, img, awake: boss, boss, tick: 0 });
  }

  private occupied(c: number, r: number): boolean {
    return (c === this.pc && r === this.pr) || this.monsters.some((m) => m.c === c && m.r === r) || this.items.some((i) => i.c === c && i.r === r);
  }

  private monsterAt(c: number, r: number): Monster | undefined {
    return this.monsters.find((m) => m.c === c && m.r === r);
  }

  private walkable(c: number, r: number): boolean {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && this.grid[r][c] === 0;
  }

  // ---------------------------------------------------------------- vision
  private los(c0: number, r0: number, c1: number, r1: number): boolean {
    let x = c0, y = r0;
    const dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0), sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    while (!(x === c1 && y === r1)) {
      if (!(x === c0 && y === r0) && this.grid[y][x] === 1) return false;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return true;
  }

  private updateVision(): void {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const d = Math.hypot(c - this.pc, r - this.pr);
      const v = d <= VIEW && this.los(this.pc, this.pr, c, r);
      this.vis[r][c] = v;
      if (v) this.seen[r][c] = true;
      const img = this.tiles[r][c];
      const a = v ? 1 - Math.max(0, d - 2) * 0.12 : this.seen[r][c] ? 0.28 : 0;
      if (Math.abs(img.alpha - a) > 0.01) this.tweens.add({ targets: img, alpha: a, duration: 120 });
    }
    const sv = this.vis[this.sr][this.sc] ? 1 : this.seen[this.sr][this.sc] ? 0.4 : 0;
    this.stairsImg.setAlpha(sv).setTint(this.bossAlive ? 0x777777 : 0xffffff);
    this.stairsGlowOn = sv > 0 && !this.bossAlive;
    for (const it of this.items) it.img.setVisible(this.vis[it.r][it.c] || (this.seen[it.r][it.c] && it.kind !== 'fire')).setAlpha(this.vis[it.r][it.c] ? 1 : 0.4);
    for (const m of this.monsters) {
      const v = this.vis[m.r][m.c];
      m.img.setVisible(v);
      if (v && !m.awake) m.awake = true;
    }
  }

  // ---------------------------------------------------------------- turns
  /** Sound-only state: alternating footsteps and a single low-health warning until healed. */
  private stepFoot = 0;
  private stairsGlowOn = false;
  private lowWarned = false;

  private heroFeetY(r: number): number {
    return OY + r * TS + TS - FOOT;
  }

  /** Middle of the hero's body (for effects and popups). */
  private get heroMid(): number {
    return this.hero.y - 34;
  }

  private setPose(pose: HeroPose): void {
    const side = this.facing === 'left' || this.facing === 'right';
    this.hero.setTexture(`pc-${pose}`).setFlipX(side && this.facing === 'left' && pose !== 'front' && pose !== 'back');
  }

  private idlePose(): HeroPose {
    return this.facing === 'down' ? 'front' : this.facing === 'up' ? 'back' : 'stand';
  }

  private walkPose(): HeroPose {
    const k = this.walkStep % 2;
    if (this.facing === 'down') return k ? 'walkdown2' : 'walkdown1';
    if (this.facing === 'up') return k ? 'walkup2' : 'walkup1';
    return k ? 'walk2' : 'walk1';
  }

  /** Shows a pose for a while (attack, hurt, potion, cheer); the idle pose returns after it. */
  private holdPose(pose: HeroPose, ms: number): void {
    this.poseUntil = this.time.now + ms;
    this.setPose(pose);
  }

  private face(dx: number, dy: number): void {
    this.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down';
  }

  /** A soft round glow texture for the torch and the open stairs. */
  private makeGlow(): void {
    if (this.textures.exists('dd-glow')) return;
    const tex = this.textures.createCanvas('dd-glow', 128, 128);
    if (!tex) return;
    const c = tex.getContext();
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    tex.refresh();
  }

  /** Little lights rising around the hero (healing, levelling up). */
  private sparkles(color: number): void {
    for (let i = 0; i < 10; i++) {
      const p = this.add.rectangle(this.hero.x + rng.int(-26, 26), this.hero.y - rng.int(0, 30), 6, 6, color).setDepth(6);
      this.tweens.add({ targets: p, y: p.y - rng.int(50, 90), alpha: 0, duration: rng.int(450, 700), delay: i * 30, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
    }
  }

  /** Cheers with both cheer poses for a while. */
  private cheer(ms: number): void {
    this.holdPose('cheer1', ms);
    for (let k = 1; k * 160 < ms; k++) this.time.delayedCall(k * 160, () => { if (this.time.now < this.poseUntil) this.setPose(k % 2 ? 'cheer2' : 'cheer1'); });
  }

  /** A quick sword-swipe arc on the attacked tile. */
  private slash(x: number, y: number, dx: number, dy: number, crit: boolean): void {
    const a = Math.atan2(dy, dx);
    const arc = this.add.graphics().setDepth(6).setPosition(x, y);
    arc.lineStyle(crit ? 10 : 7, crit ? 0xffd23f : 0xffffff, 1).beginPath().arc(0, 0, 30, a - 1.1, a + 1.1).strokePath();
    arc.lineStyle(3, 0xffffff, 0.6).beginPath().arc(0, 0, 40, a - 0.8, a + 0.8).strokePath();
    arc.setAngle(-30).setScale(0.7);
    this.tweens.add({ targets: arc, angle: 30, scale: 1.1, alpha: 0, duration: 200, ease: 'Quad.easeOut', onComplete: () => arc.destroy() });
  }

  private act(a: string): void {
    if (this.isOver || this.dead || this.time.now < this.busyUntil) return;
    if (a === 'wait') {
      this.sfx('wait', { volume: 0.25 });
      this.endTurn(120);
      return;
    }
    if (a === 'potion') {
      if (this.potions <= 0 || this.hp >= this.maxHp) { this.sfx('nope', { volume: 0.4 }); return; }
      this.potions--;
      const heal = Math.max(6, Math.round(this.maxHp * 0.6));
      this.hp = Math.min(this.maxHp, this.hp + heal);
      this.sfx('potion', { volume: 0.6 });
      this.holdPose('hold2', 420);
      burst(this, this.hero.x, this.heroMid, [0xec3013, 0xff8fa3, 0xffffff], 18, 200);
      this.sparkles(0x5dff7a);
      fpopup(this, this.hero.x, this.heroMid - 40, `+${heal}`, '#5dff7a', 24);
      softFlash(this, 0x5dff7a, 160, 0.18);
      this.endTurn(160);
      return;
    }
    const [dx, dy] = DIRS[a];
    const nc = this.pc + dx, nr = this.pr + dy;
    const m = this.monsterAt(nc, nr);
    this.face(dx, dy);
    if (m) { this.heroAttack(m, dx, dy); this.endTurn(170); return; }
    if (!this.walkable(nc, nr)) {
      this.poseUntil = 0;
      this.setPose(this.idlePose());
      this.sfxAt('bump', this.hero.x, { volume: 0.3 });
      this.tweens.add({ targets: this.hero, x: this.hero.x + dx * 8, y: this.hero.y + dy * 8, duration: 50, yoyo: true });
      this.busyUntil = this.time.now + 110;
      return;
    }
    this.pc = nc; this.pr = nr;
    this.walkStep++;
    this.poseUntil = 0;
    this.moveEnd = this.time.now + 150;
    this.setPose(this.walkPose());
    this.tweens.add({ targets: this.hero, x: tileX(nc), y: this.heroFeetY(nr), duration: 120, ease: 'Sine.easeOut' });
    this.stepFoot ^= 1;
    this.sfxAt(this.stepFoot ? 'step1' : 'step2', this.hero.x, { volume: 0.35 });
    this.pickup();
    if (this.dead) return;
    if (nc === this.sc && nr === this.sr) {
      if (this.bossAlive) { this.say(t('locked'), '#ec3013'); this.sfx('locked', { volume: 0.4 }); }
      else { this.descend(); return; }
    }
    this.endTurn(130);
  }

  private pickup(): void {
    const i = this.items.findIndex((it) => it.c === this.pc && it.r === this.pr);
    if (i < 0) return;
    const it = this.items[i];
    const x = it.img.x, y = it.img.y;
    if (it.kind === 'fire') {
      // traps stay put
      const dmg = 2 + Math.floor(this.floor / 4);
      this.sfxAt('trap', x, { volume: 0.45 });
      this.hurt(dmg, 0xff8c00);
      burst(this, x, y, [0xff8c00, 0xffd23f], 14, 200);
      fpopup(this, x, y - 70, t('trap'), '#ff8c00', 18);
      return;
    }
    this.items.splice(i, 1);
    this.tweens.killTweensOf(it.img);
    this.tweens.add({ targets: it.img, y: y - 30, alpha: 0, duration: 250, onComplete: () => it.img.destroy() });
    if (it.kind === 'coin') {
      const v = 10 + this.floor * 5;
      this.addScore(v);
      this.sfxAt('coin', x, { volume: 0.5 });
      fpopup(this, x, y - 30, `+${v}`, '#ffd23f', 22);
      burst(this, x, y, [0xffd23f, 0xffffff], 10, 160);
    } else if (it.kind === 'potion') {
      if (this.potions >= 3) {
        // bag full: drink it on the spot
        const heal = Math.min(this.maxHp - this.hp, 5);
        this.hp += heal;
        fpopup(this, x, y - 30, t('full'), '#ff8fa3', 18);
      } else {
        this.potions++;
        fpopup(this, x, y - 30, `+1 ${t('potion')}`, '#ff8fa3', 20);
      }
      this.sfxAt('item', x, { volume: 0.5 });
    } else if (it.kind === 'heart') {
      const heal = Math.min(this.maxHp - this.hp, 4);
      this.hp += heal;
      this.sfxAt('heart', x, { volume: 0.5 });
      fpopup(this, x, y - 30, `+${heal} ${t('heal')}`, '#5dff7a', 20);
    } else if (it.kind === 'chest') {
      this.sfxAt('chest', x, { volume: 0.6 });
      burst(this, x, y, [0xffd23f, 0xb5651d, 0xffffff], 22, 260);
      shake(this, 0.004, 100);
      const roll = Math.random();
      let label: string, frame: number;
      if (roll < 0.3) { this.atk++; label = `+1 ${t('atk')}`; frame = F.sword; }
      else if (roll < 0.55) { this.def++; label = `+1 ${t('armor')}`; frame = F.shield; }
      else if (roll < 0.78) { this.maxHp += 3; this.hp += 3; label = `+3 ${t('maxhp')}`; frame = F.ring; }
      else if (roll < 0.9 && this.potions < 3) { this.potions++; label = `+1 ${t('potion')}`; frame = F.potion; }
      else { const v = 50 + this.floor * 15; this.addScore(v); label = `+${v}`; frame = F.coin; }
      const icon = this.add.image(x, y, 'mrk', frame).setScale(SC).setDepth(30);
      this.tweens.add({ targets: icon, y: y - 90, scale: SC * 1.3, duration: 450, ease: 'Back.easeOut', onComplete: () => this.tweens.add({ targets: icon, alpha: 0, duration: 250, onComplete: () => icon.destroy() }) });
      fpopup(this, x, y - 110, label, '#3ee6ff', 22);
      this.sfx('loot', { volume: 0.55, delay: 0.15, exact: true });
      this.holdPose('cheer1', 380);
    }
    this.updateUi();
  }

  private damage(atk: number, def: number): { dmg: number; crit: boolean } {
    const crit = rng.chance(0.1);
    const dmg = Math.max(1, atk + rng.int(-1, 1) - def) * (crit ? 2 : 1);
    return { dmg, crit };
  }

  private heroAttack(m: Monster, dx: number, dy: number): void {
    const { dmg, crit } = this.damage(this.atk, m.def.def);
    m.hp -= dmg;
    // the punch: wind-up, then the hit (side poses); up and down lunge in their own facing
    const side = dx !== 0;
    this.holdPose(side ? 'action1' : dy < 0 ? 'walkup1' : 'walkdown1', 230);
    this.time.delayedCall(60, () => { if (this.time.now < this.poseUntil && side) this.setPose('action2'); });
    const hx = tileX(this.pc), hy = this.heroFeetY(this.pr);
    this.tweens.killTweensOf(this.hero);
    this.hero.setPosition(hx, hy);
    this.tweens.add({ targets: this.hero, x: hx + dx * 22, y: hy + dy * 22, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    this.slash(m.img.x, m.img.y, dx, dy, crit);
    m.img.setTintFill(0xffffff);
    this.time.delayedCall(80, () => { if (m.img.active) { m.img.clearTint(); if (m.boss) m.img.setTint(0xff9090); } });
    fpopup(this, m.img.x, m.img.y - 30, crit ? `${dmg}!` : String(dmg), crit ? '#ffd23f' : '#ffffff', crit ? 28 : 22);
    burst(this, m.img.x, m.img.y, [0xec3013, 0xffffff], crit ? 16 : 8, 180);
    this.sfxAt(rng.pick(['slash1', 'slash2', 'slash3']), m.img.x, { volume: 0.5 });
    if (crit) this.sfxAt('crit', m.img.x, { volume: 0.5 });
    if (crit) shake(this, 0.006, 100);
    if (m.hp <= 0) {
      this.monsters.splice(this.monsters.indexOf(m), 1);
      const pts = m.def.score * (m.boss ? 1 : 1 + Math.floor(this.floor / 3));
      this.addScore(pts);
      this.gainXp(Math.ceil(m.def.score / 10) * (m.boss ? 1 : 1));
      if (!m.boss) this.sfxAt(rng.pick(['kill1', 'kill2']), m.img.x, { volume: 0.45 });
      burst(this, m.img.x, m.img.y, [0xec3013, 0xffd23f, 0x5dff7a], m.boss ? 60 : 22, m.boss ? 420 : 260);
      fpopup(this, m.img.x, m.img.y - 70, `+${pts}`, '#ffd23f', 22);
      this.tweens.killTweensOf(m.img);
      this.tweens.add({ targets: m.img, alpha: 0, scale: SC * 1.4, angle: 90, duration: 250, onComplete: () => m.img.destroy() });
      if (m.boss) {
        this.bossAlive = false;
        shake(this, 0.02, 400);
        softFlash(this, 0xffd23f, 300, 0.35);
        this.say(t('down'), '#5dff7a');
        this.sfxAt('bossdown', m.img.x, { volume: 0.8 });
        // the guardian always drops a chest
        const img = this.add.image(m.img.x, m.img.y, 'mrk', F.chest).setScale(SC).setDepth(3);
        this.items.push({ kind: 'chest', c: m.c, r: m.r, img });
      }
    } else if (!m.awake) m.awake = true;
  }

  private gainXp(n: number): void {
    this.xp += n;
    const need = 5 + this.lvl * 5;
    if (this.xp < need) return;
    this.xp -= need;
    this.lvl++;
    this.maxHp += 3;
    this.hp = Math.min(this.maxHp, this.hp + 6);
    if (this.lvl % 2 === 1) this.atk++;
    this.sfx('levelup', { volume: 0.65 });
    burst(this, this.hero.x, this.heroMid, [0x3ee6ff, 0xffd23f, 0xffffff], 30, 260);
    this.sparkles(0x3ee6ff);
    this.cheer(700);
    softFlash(this, 0x3ee6ff, 200, 0.2);
    this.say(t('levelUp', { n: this.lvl }), '#3ee6ff');
  }

  private hurt(dmg: number, color = 0xec3013): void {
    if (this.hp > this.maxHp * 0.4) this.lowWarned = false;
    this.hp -= dmg;
    this.sfx('hurt', { volume: 0.5 });
    if (this.hp > 0 && this.hp <= this.maxHp * 0.25 && !this.lowWarned) { this.lowWarned = true; this.sfx('low', { volume: 0.45, delay: 0.2 }); }
    shake(this, 0.012, 160);
    softFlash(this, color, 160, 0.25);
    this.holdPose('hit', 260);
    this.hero.setTintFill(0xffffff);
    this.time.delayedCall(90, () => this.hero.active && this.hero.clearTint());
    fpopup(this, this.hero.x, this.heroMid - 40, `-${dmg}`, '#ec3013', 24);
    this.updateUi();
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.updateUi();
    this.sfxAt('death', this.hero.x, { volume: 0.7 });
    burst(this, this.hero.x, this.heroMid, [0xec3013, 0x888888], 50, 360);
    this.poseUntil = Infinity;
    this.setPose('hit');
    this.tweens.add({ targets: this.hero, angle: this.facing === 'left' ? -90 : 90, alpha: 0.4, duration: 400, ease: 'Quad.easeIn' });
    this.endGame({ delay: 1200 });
  }

  private endTurn(lock: number): void {
    this.turn++;
    // slow natural regeneration
    if (this.turn % 12 === 0 && this.hp < this.maxHp) this.hp++;
    this.busyUntil = this.time.now + lock;
    this.monstersAct();
    this.updateVision();
    this.updateUi();
  }

  private monstersAct(): void {
    for (const m of [...this.monsters]) {
      if (this.dead) return;
      if (!m.awake) continue;
      m.tick++;
      if (m.def.beh === 'slow' && m.tick % 2 === 0) continue;
      const dx = this.pc - m.c, dy = this.pr - m.r;
      const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
      if (adjacent && !(m.def.beh === 'erratic' && rng.chance(0.25))) {
        // attack
        const { dmg, crit } = this.damage(m.atk, this.def);
        this.tweens.add({ targets: m.img, x: m.img.x + dx * 20, y: m.img.y + dy * 20, duration: 60, yoyo: true });
        this.sfxAt(rng.pick(['punch1', 'punch2', 'punch3']), m.img.x, { volume: 0.45 });
        this.hurt(dmg);
        if (crit) shake(this, 0.02, 200);
        continue;
      }
      // pick a step: erratic monsters wander, others chase when they can see the hero
      let options: Array<[number, number]> = [];
      const far = Math.abs(dx) + Math.abs(dy) > 9;
      if (m.def.beh === 'erratic' && rng.chance(0.5) || far) options = rng.shuffle(Object.values(DIRS).map((d) => [d[0], d[1]] as [number, number]));
      else {
        const prim: Array<[number, number]> = [];
        if (dx) prim.push([Math.sign(dx), 0]);
        if (dy) prim.push([0, Math.sign(dy)]);
        if (Math.abs(dy) > Math.abs(dx)) prim.reverse();
        options = [...prim, ...rng.shuffle([[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>).filter((o) => !prim.some((p) => p[0] === o[0] && p[1] === o[1]))].slice(0, prim.length + 1);
      }
      for (const [sx, sy] of options) {
        const nc = m.c + sx, nr = m.r + sy;
        if (!this.walkable(nc, nr) || this.monsterAt(nc, nr) || (nc === this.pc && nr === this.pr)) continue;
        if (m.boss && Math.hypot(nc - this.sc, nr - this.sr) > 3) continue;   // the guardian stays near the stairs
        m.c = nc; m.r = nr;
        if (sx) m.img.setFlipX(sx < 0);
        m.img.setDepth(depthAt(tileY(nr) + TS / 2 - 1));
        this.tweens.add({ targets: m.img, x: tileX(nc), y: tileY(nr), duration: 100 });
        break;
      }
    }
  }

  private descend(): void {
    this.busyUntil = this.time.now + 900;
    const bonus = 50 * this.floor;
    this.addScore(bonus);
    this.sfx('stairs', { volume: 0.55 });
    fpopup(this, this.hero.x, this.heroMid - 40, `+${bonus}`, '#5dff7a', 24);
    // climbs down the stairs: the climbing poses, sinking into the stairway
    this.poseUntil = Infinity;
    this.facing = 'up';
    this.setPose('climb1');
    for (let k = 1; k < 4; k++) this.time.delayedCall(k * 95, () => this.setPose(k % 2 ? 'climb2' : 'climb1'));
    this.tweens.add({ targets: this.hero, y: this.hero.y + 14, scale: HERO_SCALE * 0.55, alpha: 0, duration: 380, ease: 'Quad.easeIn' });
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.time.delayedCall(420, () => {
      if (this.isOver) return;
      this.floor++;
      this.hp = Math.min(this.maxHp, this.hp + 2);
      this.buildFloor();
    });
  }

  private say(s: string, color: string): void {
    this.msg.setText(s).setColor(color).setAlpha(1).setScale(1.3);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 2200, duration: 400 });
  }

  private updateUi(): void {
    const g = this.uiG;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(24, 84, 262, 32, 8);
    const k = Math.max(0, this.hp) / this.maxHp;
    g.fillStyle(k > 0.5 ? 0x5dff7a : k > 0.25 ? 0xffd23f : 0xec3013, 1).fillRoundedRect(28, 88, 254 * k, 24, 6);
    g.fillStyle(0x000000, 0.6).fillRect(24, 120, 262, 8);
    g.fillStyle(0x3ee6ff, 1).fillRect(25, 121, 260 * Math.min(1, this.xp / (5 + this.lvl * 5)), 6);
    this.hpText.setText(`${Math.max(0, this.hp)}/${this.maxHp}`);
    this.atkText.setText(String(this.atk));
    this.defText.setText(String(this.def));
    this.lvlText.setText(`${t('lv')}${this.lvl}`);
    this.potionBtn.setText(`${t('potion')} ${this.potions}`);
    // health bars over wounded visible monsters
    for (const m of this.monsters) {
      if (m.hp >= m.maxHp || !this.vis[m.r]?.[m.c]) continue;
      const x = OX + m.c * TS + 8, y = OY + m.r * TS + 2;
      g.fillStyle(0x000000, 0.7).fillRect(x, y, TS - 16, 7);
      g.fillStyle(0xec3013, 1).fillRect(x + 1, y + 1, (TS - 18) * (m.hp / m.maxHp), 5);
    }
  }

  updateGame(_time: number, delta: number): void {
    // stick: a step that lands during a monster turn waits for it (briefly) instead of being lost
    this.stick.update(delta);
    if (this.stick.step) { this.stickWant = this.stick.step; this.stickWantAt = this.time.now; }
    if (this.stickWant && this.time.now - this.stickWantAt > 300) this.stickWant = null;
    if (this.stickWant && !this.dead && this.time.now >= this.busyUntil) {
      const d = this.stickWant;
      this.stickWant = null;
      this.act(d);
    }
    // held direction keys repeat steps
    if (this.holdDir) {
      this.holdT -= delta / 1000;
      if (this.holdT <= 0) { this.holdT = 0.16; this.act(this.holdDir); }
    }
    // hero: back to the idle pose after a step or a held pose; draw order, shadow and torch follow
    const now = this.time.now;
    if (!this.dead && this.poseUntil !== Infinity && now >= this.poseUntil && now >= this.moveEnd) {
      const idle = `pc-${this.idlePose()}`;
      if (this.hero.texture.key !== idle) this.setPose(this.idlePose());
    }
    this.hero.setDepth(depthAt(this.hero.y));
    this.heroShadow.setPosition(this.hero.x, this.hero.y - 2).setAlpha(0.45 * this.hero.alpha);
    const flicker = 1 + Math.sin(now / 90) * 0.03 + Math.sin(now / 37) * 0.02;
    this.torch.setPosition(this.hero.x, this.hero.y - 24).setScale(2.6 * flicker).setAlpha(this.dead ? 0.15 : 0.55);
    this.stairsGlow.setAlpha(this.stairsGlowOn ? 0.5 + Math.sin(now / 260) * 0.2 : 0).setScale(1.1 + Math.sin(now / 260) * 0.08);
    // keep monster health bars glued to tweening sprites
    if (this.monsters.some((m) => m.hp < m.maxHp)) this.updateUi();
  }
}
