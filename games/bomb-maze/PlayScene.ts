import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';
import { CELL, makeMazeTextures } from './art';

const COLS = 13;
const ROWS = 15;
const X0 = (720 - COLS * CELL) / 2;
const Y0 = 112;
const FUSE = 2.3;
const FLAME = 0.5;
const INF = 1e9;
const WALL = 1;
const CRATE = 2;
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BOT_SPAWNS: Array<[number, number]> = [[11, 13], [11, 1], [1, 13], [6, 7], [11, 7], [1, 7]];
const BOT_SKINS = ['pink', 'blue', 'yellow', 'beige', 'pink', 'blue'];
const DPAD = { x: 172, y: 1088, r: 150 };
const BOMB_BTN = { x: 560, y: 1088, r: 108 };

type PowerKind = 'range' | 'bomb' | 'speed';

interface Actor {
  player: boolean;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  skin: string;
  cx: number; cy: number;    // cell we come from
  tx: number; ty: number;    // cell we go to
  p: number;                 // progress 0..1
  moving: boolean;
  speed: number;             // cells per second
  range: number;
  maxBombs: number;
  placed: number;
  alive: boolean;
  think: number;
  invuln: number;
  bob: number;
}

interface Bomb { c: number; t: number; range: number; owner: Actor; img: Phaser.GameObjects.Image; spark: Phaser.GameObjects.Particles.ParticleEmitter }
interface Power { kind: PowerKind; img: Phaser.GameObjects.Image }

const idx = (x: number, y: number): number => y * COLS + x;
const cx = (x: number): number => X0 + x * CELL + CELL / 2;
const cy = (y: number): number => Y0 + y * CELL + CELL / 2;

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private grid = new Uint8Array(COLS * ROWS);
  private tiles: Array<Phaser.GameObjects.Image | null> = [];
  private bombAt: Array<Bomb | null> = [];
  private bombs: Bomb[] = [];
  private flameUntil = new Float32Array(COLS * ROWS);
  private flameOwner: Array<Actor | null> = [];
  private powers: Array<Power | null> = [];
  private actors: Actor[] = [];
  private player!: Actor;
  private levelObjs: Phaser.GameObjects.GameObject[] = [];
  private level = 1;
  private lives = 3;
  private now = 0;
  private phase: 'play' | 'clear' | 'dead' = 'play';
  private startDelay = 0;
  private respawnAt = -1;
  private marker!: Phaser.GameObjects.Triangle;
  private dpadId = -1;
  private dpadDir: [number, number] | null = null;
  private bombTap = false;
  private arrows: Phaser.GameObjects.Image[] = [];
  private bombBtn!: Phaser.GameObjects.Arc;
  private stats: Phaser.GameObjects.Text[] = [];
  private botText!: Phaser.GameObjects.Text;
  // carried power-ups
  private pRange = 2;
  private pBombs = 1;
  private pSpeed = 3.6;

  createGame(): void {
    makeMazeTextures(this);
    this.level = 1; this.lives = 3; this.now = 0; this.phase = 'play'; this.startDelay = 0; this.respawnAt = -1;
    this.dpadId = -1; this.dpadDir = null; this.bombTap = false; this.arrows = [];
    this.pRange = 2; this.pBombs = 1; this.pSpeed = 3.6;
    this.levelObjs = []; this.actors = []; this.bombs = [];

    this.add.rectangle(0, 0, 720, 1280, 0x1a1626).setOrigin(0).setDepth(-10);
    this.add.rectangle(360, Y0 + (ROWS * CELL) / 2, COLS * CELL + 16, ROWS * CELL + 16, 0x000000, 0.5).setDepth(-5);
    this.buildPad();
    this.marker = this.add.triangle(0, 0, 0, 0, 22, 0, 11, 14, 0xffd23f).setDepth(900).setStrokeStyle(3, 0x000000);
    this.tweens.add({ targets: this.marker, scaleY: 0.7, duration: 300, yoyo: true, repeat: -1 });

    this.add.image(40, 86, 'pu-bomb').setScale(0.62).setDepth(9000);
    this.add.image(120, 86, 'pu-range').setScale(0.62).setDepth(9000);
    this.add.image(200, 86, 'pu-speed').setScale(0.62).setDepth(9000);
    const st = { fontFamily: '"Press Start 2P", monospace', fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 5 };
    const sb = this.add.text(64, 86, '', st).setOrigin(0, 0.5).setDepth(9000);
    const sr = this.add.text(144, 86, '', st).setOrigin(0, 0.5).setDepth(9000);
    const ss = this.add.text(224, 86, '', st).setOrigin(0, 0.5).setDepth(9000);
    const sl = this.add.text(278, 86, '', { ...st, color: '#ffd23f' }).setOrigin(0, 0.5).setDepth(9000);
    this.stats = [sb, sr, ss, sl];
    this.botText = this.add.text(604, 86, '', { ...st, color: '#ff8ac0' }).setOrigin(1, 0.5).setDepth(9000);

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.x, p.y, DPAD.x, DPAD.y) < DPAD.r + 20) { this.dpadId = p.id; this.updateDpad(p); }
      else if (Phaser.Math.Distance.Between(p.x, p.y, BOMB_BTN.x, BOMB_BTN.y) < BOMB_BTN.r + 20) {
        this.bombTap = true;
        this.bombBtn.setFillStyle(0xff5a3a, 0.95);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.id === this.dpadId) this.updateDpad(p); });
    const up = (p: Phaser.Input.Pointer) => {
      if (p.id === this.dpadId) { this.dpadId = -1; this.dpadDir = null; this.paintDpad(); }
      this.bombBtn.setFillStyle(0xec3013, 0.75);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);

    this.buildLevel();
  }

  // ---------------------------------------------------------------- touch pad

  private buildPad(): void {
    this.add.circle(DPAD.x, DPAD.y, DPAD.r, 0xffffff, 0.08).setStrokeStyle(5, 0xffffff, 0.35).setDepth(9000);
    this.add.circle(DPAD.x, DPAD.y, 34, 0xffffff, 0.15).setDepth(9000);
    const rots = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
    DIRS.forEach(([dx, dy], i) => {
      const a = this.add.image(DPAD.x + dx * 92, DPAD.y + dy * 92, 'arrow').setRotation(rots[i]).setAlpha(0.55).setDepth(9001);
      this.arrows.push(a);
    });
    this.bombBtn = this.add.circle(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.r, 0xec3013, 0.75).setStrokeStyle(6, 0xffffff, 0.7).setDepth(9000);
    this.add.image(BOMB_BTN.x, BOMB_BTN.y - 14, 'bomb').setDisplaySize(84, 84).setTint(0x2a2a35).setDepth(9001);
    txt(this, BOMB_BTN.x, BOMB_BTN.y + 58, t('bombBtn'), { title: true, size: 18 }).setDepth(9002);
  }

  private updateDpad(p: Phaser.Input.Pointer): void {
    const dx = p.x - DPAD.x, dy = p.y - DPAD.y;
    if (Math.hypot(dx, dy) < 24) this.dpadDir = null;
    else if (Math.abs(dx) > Math.abs(dy)) this.dpadDir = [Math.sign(dx), 0];
    else this.dpadDir = [0, Math.sign(dy)];
    this.paintDpad();
  }

  private paintDpad(): void {
    DIRS.forEach(([dx, dy], i) => {
      const on = !!this.dpadDir && this.dpadDir[0] === dx && this.dpadDir[1] === dy;
      this.arrows[i].setAlpha(on ? 1 : 0.55).setTint(on ? 0xffd23f : 0xffffff);
    });
  }

  // ---------------------------------------------------------------- level

  private buildLevel(): void {
    for (const o of this.levelObjs) o.destroy();
    this.levelObjs = [];
    for (const b of this.bombs) b.spark.destroy();
    this.bombs = [];
    this.actors = [];
    this.grid = new Uint8Array(COLS * ROWS);
    this.tiles = new Array(COLS * ROWS).fill(null);
    this.bombAt = new Array(COLS * ROWS).fill(null);
    this.powers = new Array(COLS * ROWS).fill(null);
    this.flameUntil = new Float32Array(COLS * ROWS);
    this.flameOwner = new Array(COLS * ROWS).fill(null);
    this.phase = 'play';
    this.respawnAt = -1;
    const L = this.level;
    const nBots = Math.min(6, 1 + L);
    const spawns: Array<[number, number]> = [[1, 1], ...BOT_SPAWNS.slice(0, nBots)];
    const safe = new Set<number>();
    for (const [x, y] of spawns) {
      safe.add(idx(x, y));
      for (const [dx, dy] of DIRS) safe.add(idx(x + dx, y + dy));
    }
    const density = Math.min(0.78, 0.6 + L * 0.03);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y);
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      const floor = this.add.image(cx(x), cy(y), (x + y) % 2 ? 'floor-a' : 'floor-b').setDepth(0);
      this.levelObjs.push(floor);
      if (border || pillar) {
        this.grid[i] = WALL;
        const w = this.add.image(cx(x), cy(y), 'brick').setDisplaySize(CELL, CELL).setDepth(1 + y * 0.01);
        if (border) w.setTint(0x8a8fa8);
        this.levelObjs.push(w);
      } else if (!safe.has(i) && Math.random() < density) {
        this.grid[i] = CRATE;
        const c = this.add.image(cx(x), cy(y), 'crate').setDisplaySize(CELL - 2, CELL - 2).setDepth(1 + y * 0.01);
        c.setScale(0);
        this.tweens.add({ targets: c, scaleX: (CELL - 2) / 128, scaleY: (CELL - 2) / 128, duration: 250, delay: (x + y) * 18, ease: 'Back.easeOut' });
        this.tiles[i] = c;
        this.levelObjs.push(c);
      }
    }
    this.player = this.makeActor(true, 1, 1, 'green');
    this.player.speed = this.pSpeed; this.player.range = this.pRange; this.player.maxBombs = this.pBombs;
    BOT_SPAWNS.slice(0, nBots).forEach(([x, y], k) => {
      const b = this.makeActor(false, x, y, BOT_SKINS[k]);
      b.speed = Math.min(4.6, 2.5 + 0.25 * (L - 1));
      b.range = Math.min(4, 1 + Math.ceil(L / 2));
      b.maxBombs = Math.min(3, 1 + Math.floor((L - 1) / 2));
      b.think = 1.2 + k * 0.2;
    });
    this.startDelay = 1.2;
    this.hud.setCenter('');
    this.updateStats();
    const b = txt(this, 360, Y0 + (ROWS * CELL) / 2, `${t('level')} ${L}`, { title: true, size: 52, color: '#ffd23f', strokeThickness: 12 }).setDepth(1000).setScale(0.2);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1000, duration: 400, onComplete: () => b.destroy() });
    this.sfx('start', { volume: 0.6 });
  }

  private makeActor(player: boolean, x: number, y: number, skin: string): Actor {
    const shadow = this.add.ellipse(cx(x), cy(y) + 20, 38, 14, 0x000000, 0.3).setDepth(2);
    const img = this.add.image(cx(x), cy(y), `al-${skin}`).setOrigin(0.5, 0.86);
    img.setDisplaySize(40, 57);
    const a: Actor = {
      player, img, shadow, skin, cx: x, cy: y, tx: x, ty: y, p: 0, moving: false, speed: 3, range: 2, maxBombs: 1, placed: 0,
      alive: true, think: 0, invuln: player ? 1.5 : 0, bob: Math.random() * 6,
    };
    this.levelObjs.push(img, shadow);
    this.actors.push(a);
    this.place(a);
    return a;
  }

  private place(a: Actor): void {
    const f = a.moving ? a.p : 0;
    const x = Phaser.Math.Linear(cx(a.cx), cx(a.tx), f);
    const y = Phaser.Math.Linear(cy(a.cy), cy(a.ty), f);
    const hop = a.moving ? Math.abs(Math.sin(a.bob * 2)) * 5 : 0;
    a.img.setPosition(x, y + CELL * 0.32 - hop).setDepth(10 + y / 10);
    a.shadow.setPosition(x, y + CELL * 0.32);
  }

  private cellOf(a: Actor): number {
    return a.moving && a.p >= 0.5 ? idx(a.tx, a.ty) : idx(a.cx, a.cy);
  }

  private updateStats(): void {
    const [sb, sr, ss, sl] = this.stats;
    sl.setText(`${t('level')} ${this.level}`);
    sb.setText(String(this.pBombs));
    sr.setText(String(this.pRange));
    ss.setText(String(Math.round((this.pSpeed - 3.6) / 0.5) + 1));
    const bots = this.actors.filter((a) => !a.player && a.alive).length;
    this.botText.setText(`${t('bots')} ${bots}`);
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
  }

  // ---------------------------------------------------------------- movement

  private canEnter(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const i = idx(x, y);
    return this.grid[i] === 0 && !this.bombAt[i];
  }

  private startMove(a: Actor, dx: number, dy: number, carry = 0): boolean {
    const x = a.cx + dx, y = a.cy + dy;
    if (!this.canEnter(x, y)) return false;
    a.tx = x; a.ty = y; a.p = carry; a.moving = true;
    if (dx) a.img.setFlipX(dx < 0);
    return true;
  }

  private advance(a: Actor, dt: number, want: [number, number] | null): void {
    if (a.moving) {
      const dx = a.tx - a.cx, dy = a.ty - a.cy;
      if (want && want[0] === -dx && want[1] === -dy) {
        // reverse mid-step
        [a.cx, a.tx] = [a.tx, a.cx]; [a.cy, a.ty] = [a.ty, a.cy];
        a.p = 1 - a.p;
      }
      a.p += a.speed * dt;
      a.bob += dt * a.speed * 3;
      if (a.p >= 1) {
        const carry = a.p - 1;
        a.cx = a.tx; a.cy = a.ty; a.p = 0; a.moving = false;
        this.onArrive(a);
        if (a.player && want) this.startMove(a, want[0], want[1], carry);
      }
    } else if (want && a.player) {
      this.startMove(a, want[0], want[1]);
    }
    this.place(a);
  }

  private onArrive(a: Actor): void {
    const i = idx(a.cx, a.cy);
    if (a.player) {
      const pw = this.powers[i];
      if (pw) this.collect(pw, i);
    } else a.think = 0;
  }

  private collect(pw: Power, i: number): void {
    this.powers[i] = null;
    if (pw.kind === 'range') this.pRange = Math.min(7, this.pRange + 1);
    else if (pw.kind === 'bomb') this.pBombs = Math.min(6, this.pBombs + 1);
    else this.pSpeed = Math.min(6.1, this.pSpeed + 0.5);
    this.player.range = this.pRange; this.player.maxBombs = this.pBombs; this.player.speed = this.pSpeed;
    burst(this, pw.img.x, pw.img.y, [0xffd23f, 0xffffff, 0x3ee6ff], 18, 260);
    popup(this, pw.img.x, pw.img.y - 30, t(`pu_${pw.kind}`), '#5dff7a', 20);
    this.sfxAt('power', pw.img.x, { volume: 0.7 });
    this.addScore(25);
    const img = pw.img;
    this.tweens.add({ targets: img, scale: 1.4, alpha: 0, duration: 200, onComplete: () => img.destroy() });
    this.updateStats();
  }

  // ---------------------------------------------------------------- bombs

  private dropBomb(a: Actor): boolean {
    if (a.placed >= a.maxBombs || !a.alive) return false;
    const i = this.cellOf(a);
    if (this.bombAt[i] || this.grid[i] !== 0) return false;
    const x = i % COLS, y = Math.floor(i / COLS);
    const img = this.add.image(cx(x), cy(y) + 2, 'bomb').setDisplaySize(46, 46).setTint(0x2c2c38).setDepth(5 + y * 0.01);
    const sx = img.scaleX;
    img.setScale(0);
    this.tweens.add({ targets: img, scaleX: sx, scaleY: sx, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, scaleX: sx * 1.12, scaleY: sx * 0.92, duration: 260, delay: 160, yoyo: true, repeat: -1 });
    const spark = this.add.particles(cx(x) + 12, cy(y) - 18, 'spark', {
      speed: { min: 30, max: 90 }, scale: { start: 0.9, end: 0 }, lifespan: 220, frequency: 40,
      tint: [0xffd23f, 0xff7a1a, 0xffffff], blendMode: 'ADD',
    }).setDepth(6);
    const b: Bomb = { c: i, t: FUSE, range: a.range, owner: a, img, spark };
    this.bombAt[i] = b;
    this.bombs.push(b);
    a.placed++;
    this.levelObjs.push(img);
    this.sfxAt('place', img.x, { volume: 0.6 });
    return true;
  }

  private blastCells(c: number, range: number): number[] {
    const out = [c];
    const x0 = c % COLS, y0 = Math.floor(c / COLS);
    for (const [dx, dy] of DIRS) {
      for (let k = 1; k <= range; k++) {
        const x = x0 + dx * k, y = y0 + dy * k;
        const i = idx(x, y);
        if (this.grid[i] === WALL) break;
        out.push(i);
        if (this.grid[i] === CRATE || this.bombAt[i]) break;
      }
    }
    return out;
  }

  private explode(b: Bomb): void {
    if (!this.bombAt[b.c] || this.bombAt[b.c] !== b) return;
    this.bombAt[b.c] = null;
    this.bombs.splice(this.bombs.indexOf(b), 1);
    b.owner.placed = Math.max(0, b.owner.placed - 1);
    b.img.destroy();
    b.spark.destroy();
    const cells = this.blastCells(b.c, b.range);
    const chain: Bomb[] = [];
    const center = b.c;
    for (const i of cells) {
      const x = i % COLS, y = Math.floor(i / COLS);
      this.flameUntil[i] = this.now + FLAME;
      this.flameOwner[i] = b.owner;
      const f = this.add.image(cx(x), cy(y), 'fire').setDepth(8).setBlendMode('ADD');
      const dist = Math.abs(x - center % COLS) + Math.abs(y - Math.floor(center / COLS));
      const horiz = y === Math.floor(center / COLS) && i !== center;
      f.setScale(horiz ? 1.05 : i === center ? 1.15 : 0.75, horiz ? 0.75 : i === center ? 1.15 : 1.05);
      f.setAlpha(0);
      this.tweens.add({ targets: f, alpha: 1, duration: 40, delay: dist * 25 });
      this.tweens.add({ targets: f, alpha: 0, scaleX: f.scaleX * 0.5, scaleY: f.scaleY * 0.5, delay: FLAME * 1000 - 120, duration: 160, onComplete: () => f.destroy() });
      this.levelObjs.push(f);
      if (this.grid[i] === CRATE) this.breakCrate(i, b.owner);
      const pw = this.powers[i];
      if (pw) {
        this.powers[i] = null;
        burst(this, pw.img.x, pw.img.y, 0xffffff, 8, 140);
        pw.img.destroy();
      }
      const other = this.bombAt[i];
      if (other && other !== b) chain.push(other);
    }
    burst(this, cx(center % COLS), cy(Math.floor(center / COLS)), [0xffd23f, 0xff7a1a, 0xffffff], 26, 360);
    shake(this, 0.008, 160);
    this.sfxAt(rng.pick(['boom1', 'boom2', 'boom3']), cx(center % COLS), { volume: 0.7 });
    for (const o of chain) this.explode(o);
  }

  private breakCrate(i: number, owner: Actor): void {
    this.grid[i] = 0;
    const img = this.tiles[i];
    this.tiles[i] = null;
    const x = i % COLS, y = Math.floor(i / COLS);
    if (img) this.tweens.add({ targets: img, alpha: 0, angle: rng.int(-40, 40), scaleX: img.scaleX * 0.4, scaleY: img.scaleY * 0.4, duration: 260, onComplete: () => img.destroy() });
    burst(this, cx(x), cy(y), [0xb5793c, 0x7a4a1f, 0xe2b77a], 14, 240);
    this.sfxAt('crate', cx(x), { volume: 0.5 });
    if (owner.player) this.addScore(10);
    if (Math.random() < 0.32) {
      const kind: PowerKind = rng.pick(['range', 'range', 'bomb', 'bomb', 'speed'] as PowerKind[]);
      this.time.delayedCall(FLAME * 1000 + 30, () => {
        if (this.grid[i] !== 0 || this.powers[i]) return;
        const pimg = this.add.image(cx(x), cy(y), `pu-${kind}`).setDepth(4).setScale(0);
        this.tweens.add({ targets: pimg, scale: 1, duration: 260, ease: 'Back.easeOut' });
        this.tweens.add({ targets: pimg, y: pimg.y - 4, duration: 500, yoyo: true, repeat: -1, delay: 260, ease: 'Sine.easeInOut' });
        this.levelObjs.push(pimg);
        this.powers[i] = { kind, img: pimg };
      });
    }
  }

  // ---------------------------------------------------------------- danger + AI

  /** Seconds until each cell is in a blast (chains included); 0 for burning cells, INF when safe. */
  private danger(extra?: { c: number; range: number }): Float32Array {
    const d = new Float32Array(COLS * ROWS).fill(INF);
    for (let i = 0; i < d.length; i++) if (this.flameUntil[i] > this.now) d[i] = 0;
    const list = this.bombs.map((b) => ({ c: b.c, range: b.range, t: b.t }));
    if (extra) list.push({ c: extra.c, range: extra.range, t: FUSE });
    // chain reactions: a bomb inside an earlier blast goes off with it
    for (let pass = 0; pass < list.length; pass++) {
      let changed = false;
      for (const b of list) for (const i of this.blastCellsSim(b.c, b.range, list)) {
        const o = list.find((q) => q.c === i && q !== b);
        if (o && o.t > b.t) { o.t = b.t; changed = true; }
      }
      if (!changed) break;
    }
    for (const b of list) for (const i of this.blastCellsSim(b.c, b.range, list)) d[i] = Math.min(d[i], b.t);
    return d;
  }

  private blastCellsSim(c: number, range: number, list: Array<{ c: number }>): number[] {
    const out = [c];
    const x0 = c % COLS, y0 = Math.floor(c / COLS);
    for (const [dx, dy] of DIRS) {
      for (let k = 1; k <= range; k++) {
        const i = idx(x0 + dx * k, y0 + dy * k);
        if (this.grid[i] === WALL) break;
        out.push(i);
        if (this.grid[i] === CRATE || list.some((q) => q.c === i)) break;
      }
    }
    return out;
  }

  /**
   * Breadth-first search from `start`. Cells are passable when free and not burning, and a
   * cell that will blow up is only crossed if we get there well before it does.
   * Returns the first step towards the nearest cell that satisfies `goal`, or null.
   */
  private search(a: Actor, start: number, d: Float32Array, goal: (i: number) => boolean, avoidDanger: boolean, blocked = -1): [number, number] | null {
    const prev = new Int16Array(COLS * ROWS).fill(-1);
    const dist = new Int16Array(COLS * ROWS).fill(-1);
    const q = [start];
    dist[start] = 0;
    while (q.length) {
      const c = q.shift()!;
      if (c !== start && goal(c)) {
        let s = c;
        while (prev[s] !== start) s = prev[s];
        return [(s % COLS) - (start % COLS), Math.floor(s / COLS) - Math.floor(start / COLS)];
      }
      const x = c % COLS, y = Math.floor(c / COLS);
      for (const [dx, dy] of DIRS) {
        const n = idx(x + dx, y + dy);
        if (dist[n] >= 0 || n === blocked) continue;
        if (this.grid[n] !== 0 || this.bombAt[n]) continue;
        const arrive = (dist[c] + 1) / a.speed;
        if (d[n] < INF) {
          if (avoidDanger) continue;
          if (d[n] === 0 || d[n] - arrive < 0.45) continue;
        }
        dist[n] = dist[c] + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    return null;
  }

  private inLine(from: number, range: number, target: number): boolean {
    return this.blastCells(from, range).includes(target);
  }

  private botThink(b: Actor, dt: number): [number, number] | null {
    if (b.moving) return null;
    b.think -= dt;
    if (b.think > 0) return null;
    const L = this.level;
    b.think = Math.max(0.04, 0.42 - 0.06 * (L - 1)) * (0.6 + Math.random() * 0.8);
    const here = idx(b.cx, b.cy);
    const d = this.danger();
    // 1) get out of any blast
    if (d[here] < INF) {
      b.think = 0;
      return this.search(b, here, d, (i) => d[i] >= INF, false);
    }
    // 2) bomb the player or a crate when an escape exists
    const pc = this.player.alive ? this.cellOf(this.player) : -1;
    const aggr = Math.min(0.95, 0.45 + 0.1 * L);
    if (b.placed < b.maxBombs) {
      const hitsPlayer = pc >= 0 && this.inLine(here, b.range, pc) && Math.random() < aggr;
      const nearCrate = DIRS.some(([dx, dy]) => this.grid[idx(b.cx + dx, b.cy + dy)] === CRATE);
      if (hitsPlayer || (nearCrate && Math.random() < 0.4)) {
        const d2 = this.danger({ c: here, range: b.range });
        const esc = this.search(b, here, d2, (i) => d2[i] >= INF, false);
        if (esc && this.dropBomb(b)) {
          b.think = 0;
          return esc;
        }
      }
    }
    // 3) move: hunt the player, else open the way through crates, else wander
    const huntP = Math.min(0.95, 0.35 + 0.12 * (L - 1));
    if (pc >= 0 && Math.random() < huntP) {
      const step = this.search(b, here, d, (i) => i === pc || this.inLine(i, b.range, pc) && Math.random() < 0.15, true);
      if (step) return step;
    }
    if (Math.random() < 0.6) {
      const step = this.search(b, here, d, (i) => DIRS.some(([dx, dy]) => this.grid[i + dx + dy * COLS] === CRATE), true);
      if (step) return step;
    }
    const opts = DIRS.filter(([dx, dy]) => {
      const n = idx(b.cx + dx, b.cy + dy);
      return this.canEnter(b.cx + dx, b.cy + dy) && d[n] >= INF;
    });
    return opts.length ? rng.pick(opts) : null;
  }

  // ---------------------------------------------------------------- deaths

  private kill(a: Actor, i: number): void {
    a.alive = false;
    const { x, y } = a.img;
    burst(this, x, y - 20, a.player ? [0x5dff7a, 0xffffff] : [0xff8ac0, 0xffffff, 0x3ee6ff], 26, 340);
    this.tweens.add({ targets: a.img, angle: 540, scaleX: 0, scaleY: 0, alpha: 0, duration: 600, ease: 'Cubic.easeIn' });
    a.shadow.setVisible(false);
    if (a.player) {
      this.lives--;
      this.sfx('die', { volume: 0.8 });
      shake(this, 0.02, 400);
      flash(this, 0xec3013, 200, 0.4);
      this.updateStats();
      if (this.lives <= 0) {
        this.phase = 'dead';
        this.endGame({ title: t('gameOver'), delay: 1300 });
      } else this.respawnAt = this.now + 1.6;
    } else {
      this.sfx('botdie', { volume: 0.7 });
      const owner = this.flameOwner[i];
      if (owner?.player) this.addScore(200 * this.level, x, y - 50);
      this.updateStats();
      if (this.actors.every((o) => o.player || !o.alive) && this.player.alive) this.levelClear();
    }
  }

  private respawn(): void {
    const p = this.player;
    // first free starting cell, without fire or a bomb
    const d = this.danger();
    const spots: Array<[number, number]> = [[1, 1], [1, 2], [2, 1], ...BOT_SPAWNS];
    const spot = spots.find(([x, y]) => this.grid[idx(x, y)] === 0 && !this.bombAt[idx(x, y)] && d[idx(x, y)] >= INF) ?? [1, 1];
    p.cx = p.tx = spot[0]; p.cy = p.ty = spot[1]; p.p = 0; p.moving = false;
    p.alive = true; p.invuln = 2.5; p.placed = 0;
    p.img.setAngle(0).setAlpha(1).setDisplaySize(40, 57);
    p.shadow.setVisible(true);
    this.place(p);
    this.sfx('start', { volume: 0.5 });
    if (this.phase === 'play' && this.actors.every((o) => o.player || !o.alive)) this.levelClear();
  }

  private levelClear(): void {
    this.phase = 'clear';
    const bonus = 500 * this.level;
    this.addScore(bonus);
    this.sfx('clear', { volume: 0.8, exact: true });
    const b = txt(this, 360, Y0 + (ROWS * CELL) / 2 - 40, t('levelClear'), { title: true, size: 44, color: '#5dff7a', strokeThickness: 12 }).setDepth(1000).setScale(0.2);
    const s = txt(this, 360, Y0 + (ROWS * CELL) / 2 + 40, `+${bonus}`, { title: true, size: 32, color: '#ffd23f' }).setDepth(1000);
    this.tweens.add({ targets: b, scale: 1, duration: 400, ease: 'Back.easeOut' });
    burst(this, 360, Y0 + 300, [0xffd23f, 0x5dff7a, 0xff4fa3, 0x3ee6ff], 50, 520);
    this.time.delayedCall(2200, () => {
      b.destroy(); s.destroy();
      if (this.isOver) return;
      this.level++;
      this.buildLevel();
    });
  }

  // ---------------------------------------------------------------- loop

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.now += dt;

    // input
    const c = this.controls;
    let want: [number, number] | null = this.dpadDir;
    if (!want) {
      if (Math.abs(c.axisX) > 0.3 && Math.abs(c.axisX) >= Math.abs(c.axisY)) want = [Math.sign(c.axisX), 0];
      else if (Math.abs(c.axisY) > 0.3) want = [0, Math.sign(c.axisY)];
    }
    const bombNow = c.justA() || this.bombTap;
    this.bombTap = false;

    const p = this.player;
    if (this.phase !== 'dead') {
      if (p.alive) {
        this.advance(p, dt, want);
        if (bombNow && this.phase === 'play') this.dropBomb(p);
        if (p.invuln > 0) { p.invuln -= dt; p.img.setAlpha(Math.floor(p.invuln * 10) % 2 ? 0.45 : 1); } else p.img.setAlpha(1);
        this.marker.setVisible(true).setPosition(p.img.x - 11, p.img.y - 74);
      } else this.marker.setVisible(false);
      if (!p.alive && this.respawnAt > 0 && this.now >= this.respawnAt) { this.respawnAt = -1; this.respawn(); }
    }

    // bots
    if (this.startDelay > 0) this.startDelay -= dt;
    for (const b of this.actors) {
      if (b.player || !b.alive) continue;
      let dir: [number, number] | null = null;
      if (this.startDelay <= 0 && this.phase === 'play') dir = this.botThink(b, dt);
      if (dir && !b.moving) this.startMove(b, dir[0], dir[1]);
      this.advance(b, dt, null);
    }

    // bombs
    for (const b of [...this.bombs]) {
      b.t -= dt;
      if (b.t < 0.7) b.img.setTint(Math.floor(b.t * 12) % 2 ? 0xff3b3b : 0x2c2c38);
      if (b.t <= 0) this.explode(b);
    }

    // fire hits
    for (const a of this.actors) {
      if (!a.alive || (a.player && (a.invuln > 0 || this.phase !== 'play'))) continue;
      const i = this.cellOf(a);
      if (this.flameUntil[i] > this.now) this.kill(a, i);
    }
  }
}
