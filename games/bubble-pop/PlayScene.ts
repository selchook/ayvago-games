import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';

export const BUBBLE_COLORS = ['red', 'blue', 'green', 'yellow', 'pink', 'orange'] as const;
const TINTS = [0xff4f4f, 0x3ea8ff, 0x5dd65d, 0xffd23f, 0xff79c6, 0xff9a3c];

const R = 32;                 // bubble radius
const D = R * 2;
const COLS = 10;              // 10 cells on normal rows, 9 on shifted rows
const LEFT = 40;              // left wall x
const RIGHT = LEFT + COLS * D; // right wall x
const TOP = 144;              // ceiling y (the frame stays clear of the pause button)
const ROW_H = R * Math.sqrt(3);
const MAXR = 15;              // a bubble stuck on row >= MAXR ends the game
const SHOOT_X = 360;
const SHOOT_Y = 1150;
const SPEED = 1500;
const BOTTOM = SHOOT_Y + 86;  // board floor
const DECK_Y = 1086;          // top of the launcher deck
const HOLD_X = SHOOT_X - 165; // next-bubble holder
const HOLD_Y = 1166;
const BARREL_LEN = 58 * 2.75; // tanks barrel, scaled
const BARREL_BASE = 24;       // barrel base sits this far behind the pivot, under the hub
const MUZZLE = BARREL_LEN - BARREL_BASE;
const AMMO_X = SHOOT_X + 118;
/** Board backgrounds, one per level (cycled). */
export const BOARD_BGS = ['colored_grass', 'colored_desert', 'colored_shroom', 'colored_land', 'blue_grass', 'blue_shroom'] as const;
/** Accent per background: deck rim, holder ring and the danger line glow. */
const BG_ACCENT = [0x8fd14f, 0xe8c170, 0xd08a4e, 0x6fcf6a, 0x7fd8ff, 0x9fd6ff];

interface Cell { color: number; img: Phaser.GameObjects.Image }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private grid: (Cell | null)[][] = [];
  private parity = 0;
  private level = 1;
  private colors = 4;
  private shotsPerRow = 7;
  private misses = 0;
  private aim = -Math.PI / 2;
  private aiming = false;
  private cur = 0;
  private next = 0;
  private curImg!: Phaser.GameObjects.Image;
  private nextImg!: Phaser.GameObjects.Image;
  private ball: { img: Phaser.GameObjects.Image; color: number; vx: number; vy: number } | null = null;
  private guide!: Phaser.GameObjects.Graphics;
  private turret!: Phaser.GameObjects.Container;
  private barrel!: Phaser.GameObjects.Image;
  private hub!: Phaser.GameObjects.Image;
  private holder!: Phaser.GameObjects.Image;
  private rim!: Phaser.GameObjects.Graphics;
  private bg: Phaser.GameObjects.Image | null = null;
  private stage = -1;
  private shotDots: Phaser.GameObjects.Image[] = [];
  private busy = false;

  createGame(): void {
    this.grid = []; this.parity = 0; this.level = 1; this.misses = 0; this.aim = -Math.PI / 2;
    this.aiming = false; this.ball = null; this.busy = false; this.shotDots = [];

    this.bg = null; this.stage = -1;
    this.buildBoard();
    this.buildLauncher();

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.isOver) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, HOLD_X, HOLD_Y) < 64) { this.swap(); return; }
      if (p.y < SHOOT_Y - 30) { this.aiming = true; this.setAimTo(p.x, p.y); }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.aiming && p.isDown) this.setAimTo(p.x, p.y);
    });
    this.input.on('pointerup', () => {
      if (this.aiming) { this.aiming = false; this.fire(); }
    });

    this.upReady = true;
    this.startLevel();
  }

  // ---------- board ----------
  /** Wooden frame, launcher deck and the danger line. The background image is set per level. */
  private buildBoard(): void {
    const w = RIGHT - LEFT, h = BOTTOM - TOP, F = 20;
    // wooden frame (shooting-gallery wood): four strips around the board, bevelled edges
    for (const [x, y, fw, fh] of [[LEFT - F, TOP - F, w + F * 2, F], [LEFT - F, BOTTOM, w + F * 2, F], [LEFT - F, TOP, F, h], [RIGHT, TOP, F, h]]) {
      this.add.tileSprite(x, y, fw, fh, 'wood').setOrigin(0).setTileScale(0.5).setTilePosition(x * 2, y * 2).setDepth(1.7);
    }
    const g = this.add.graphics().setDepth(1.75);
    g.lineStyle(4, 0x2a1608, 1).strokeRect(LEFT - F, TOP - F, w + F * 2, h + F * 2);
    g.lineStyle(2, 0xffd9a0, 0.45).strokeRect(LEFT - F + 4, TOP - F + 4, w + F * 2 - 8, h + F * 2 - 8);
    g.lineStyle(5, 0x2a1608, 0.9).strokeRect(LEFT - 2, TOP - 2, w + 4, h + 4);
    g.lineStyle(2, 0x000000, 0.35).strokeRect(LEFT + 3, TOP + 3, w - 6, h - 6);
    for (const [x, y] of [[LEFT - F / 2, TOP - F / 2], [RIGHT + F / 2, TOP - F / 2], [LEFT - F / 2, BOTTOM + F / 2], [RIGHT + F / 2, BOTTOM + F / 2]]) {
      this.add.image(x, y, 'bolt').setDisplaySize(15, 15).setDepth(1.8);
    }
    // readability: dark gradient + vignette over the background
    this.makeDim();
    this.add.image(LEFT, TOP, 'bp-dim').setOrigin(0).setDisplaySize(w, h).setDepth(1);
    // launcher deck
    const deck = this.add.graphics().setDepth(1.5);
    deck.fillStyle(0x120e24, 0.78).fillRect(LEFT, DECK_Y, w, BOTTOM - DECK_Y);
    deck.fillStyle(0x000000, 0.25).fillRect(LEFT, DECK_Y, w, 6);
    this.rim = this.add.graphics().setDepth(1.55);
    const dangerY = TOP + R + MAXR * ROW_H - R + 4;
    const dl = this.add.graphics().setDepth(1.6);
    dl.lineStyle(7, 0x000000, 0.3);
    for (let x = LEFT; x < RIGHT; x += 28) dl.lineBetween(x, dangerY, x + 14, dangerY);
    dl.lineStyle(3, 0xff4f4f, 0.9);
    for (let x = LEFT; x < RIGHT; x += 28) dl.lineBetween(x, dangerY, x + 14, dangerY);
  }

  /** Dark top-to-bottom gradient plus a vignette that keeps bubbles readable on bright art. */
  private makeDim(): void {
    if (this.textures.exists('bp-dim')) return;
    const W = 320, H = 546;
    const tex = this.textures.createCanvas('bp-dim', W, H);
    if (!tex) return;
    const ctx = tex.getContext();
    const lin = ctx.createLinearGradient(0, 0, 0, H);
    lin.addColorStop(0, 'rgba(14,10,38,0.34)');
    lin.addColorStop(0.55, 'rgba(14,10,38,0.16)');
    lin.addColorStop(1, 'rgba(14,10,38,0.12)');
    ctx.fillStyle = lin;
    ctx.fillRect(0, 0, W, H);
    const rad = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.35, W / 2, H * 0.45, H * 0.62);
    rad.addColorStop(0, 'rgba(8,6,24,0)');
    rad.addColorStop(1, 'rgba(8,6,24,0.42)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
    tex.refresh();
  }

  /** Cross-fades the board background for this level and recolours the accents. */
  private setStage(level: number): void {
    const i = (level - 1) % BOARD_BGS.length;
    if (i === this.stage) return;
    this.stage = i;
    const h = BOTTOM - TOP, sc = h / 1024, cw = (RIGHT - LEFT) / sc;
    const img = this.add.image((LEFT + RIGHT) / 2, (TOP + BOTTOM) / 2, `bg-${i}`).setScale(sc).setDepth(0.5)
      .setCrop((1024 - cw) / 2, 0, cw, 1024);
    const old = this.bg;
    this.bg = img;
    if (old) {
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 700, ease: 'Sine.easeInOut', onComplete: () => old.destroy() });
    }
    const a = BG_ACCENT[i];
    this.rim.clear();
    this.rim.lineStyle(4, a, 0.9).lineBetween(LEFT, DECK_Y, RIGHT, DECK_Y);
    this.rim.lineStyle(4, a, 0.85).strokeCircle(HOLD_X, HOLD_Y, 45);
  }

  /** Kenney turret: steel mount, rotating tank barrel, round hub with the loaded bubble. */
  private buildLauncher(): void {
    this.add.image(SHOOT_X, SHOOT_Y + 12, 'mount').setDisplaySize(140, 140).setDepth(4).setTint(0xc4cfe0);
    this.barrel = this.add.image(0, BARREL_BASE, 'barrel').setOrigin(0.5, 1).setScale(2.7, 2.75);
    const band = this.add.image(0, BARREL_BASE - BARREL_LEN + 10, 'barrel').setOrigin(0.5, 0.5).setScale(3.3, 0.42);
    this.barrel.setData('band', band);
    this.turret = this.add.container(SHOOT_X, SHOOT_Y, [this.barrel, band]).setDepth(5);
    this.hub = this.add.image(SHOOT_X, SHOOT_Y, 'hub').setDisplaySize(92, 92).setDepth(6);
    this.holder = this.add.image(HOLD_X, HOLD_Y, 'holder').setDisplaySize(86, 86).setDepth(4).setTint(0xc4cfe0);
    this.guide = this.add.graphics().setDepth(4.5);

    txt(this, HOLD_X, HOLD_Y + 58, t('next'), { title: true, size: 13, color: '#3ee6ff' }).setDepth(6);
    txt(this, AMMO_X + 75, HOLD_Y + 58, t('shots'), { title: true, size: 13, color: '#ffd23f' }).setDepth(6);

    this.curImg = this.add.image(SHOOT_X, SHOOT_Y, 'b0').setDisplaySize(D, D).setDepth(7);
    this.nextImg = this.add.image(HOLD_X, HOLD_Y, 'b0').setDisplaySize(52, 52).setDepth(6);
  }

  private aimTurret(): void {
    this.turret.setRotation(this.aim + Math.PI / 2);
  }

  /** Barrel kick-back, muzzle smoke and a little shake. */
  private recoil(): void {
    const band = this.barrel.getData('band') as Phaser.GameObjects.Image;
    this.tweens.killTweensOf([this.barrel, band, this.hub]);
    this.barrel.y = BARREL_BASE; band.y = BARREL_BASE - BARREL_LEN + 10;
    this.tweens.add({ targets: [this.barrel, band], y: '+=24', duration: 55, ease: 'Quad.easeOut', yoyo: true, hold: 25 });
    this.hub.setDisplaySize(104, 104);
    this.tweens.add({ targets: this.hub, displayWidth: 92, displayHeight: 92, duration: 260, ease: 'Back.easeOut' });
    const mx = SHOOT_X + Math.cos(this.aim) * (MUZZLE + 8), my = SHOOT_Y + Math.sin(this.aim) * (MUZZLE + 8);
    const flashImg = this.add.image(mx, my, 'spark').setDepth(5.6).setTint(TINTS[this.ballColor()]).setScale(0.22).setAlpha(0.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flashImg, scale: 0.5, alpha: 0, duration: 160, ease: 'Quad.easeOut', onComplete: () => flashImg.destroy() });
    for (let i = 0; i < 4; i++) {
      const puff = this.add.image(mx, my, 'smoke').setDepth(5.5).setScale(0.3).setAlpha(0.75);
      const d = 26 + i * 14, a = this.aim + (i - 1.5) * 0.55;
      this.tweens.add({
        targets: puff, x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d,
        scale: 0.62 + i * 0.06, alpha: 0, angle: rng.int(-60, 60), duration: 420 + i * 50, ease: 'Quad.easeOut', onComplete: () => puff.destroy(),
      });
    }
    burst(this, mx, my, [TINTS[this.ballColor()], 0xffffff], 10, 220);
    shake(this, 0.003, 90);
  }

  private ballColor(): number { return this.ball?.color ?? this.cur; }

  // ---------- grid helpers ----------
  private shifted(r: number): boolean { return (r + this.parity) % 2 === 1; }
  private rowLen(r: number): number { return this.shifted(r) ? COLS - 1 : COLS; }
  private cx(r: number, c: number): number { return LEFT + R + c * D + (this.shifted(r) ? R : 0); }
  private cy(r: number): number { return TOP + R + r * ROW_H; }
  private get(r: number, c: number): Cell | null {
    return r >= 0 && r < this.grid.length && c >= 0 && c < this.rowLen(r) ? this.grid[r][c] : null;
  }
  private neighbors(r: number, c: number): [number, number][] {
    const s = this.shifted(r) ? 1 : 0;
    const out: [number, number][] = [[r, c - 1], [r, c + 1], [r - 1, c - 1 + s], [r - 1, c + s], [r + 1, c - 1 + s], [r + 1, c + s]];
    return out.filter(([rr, cc]) => rr >= 0 && rr < this.grid.length && cc >= 0 && cc < this.rowLen(rr));
  }
  private emptyRow(): (Cell | null)[] { return new Array(COLS).fill(null); }

  private place(r: number, c: number, color: number, fromY?: number): Cell {
    const img = this.add.image(this.cx(r, c), fromY ?? this.cy(r), `b${color}`).setDisplaySize(D, D).setDepth(2);
    const cell = { color, img };
    this.grid[r][c] = cell;
    return cell;
  }

  private startLevel(): void {
    for (const row of this.grid) for (const cell of row) cell?.img.destroy();
    this.grid = [];
    this.parity = 0;
    for (let r = 0; r < MAXR + 2; r++) this.grid.push(this.emptyRow());
    this.colors = Math.min(6, 3 + Math.ceil(this.level / 2));
    this.shotsPerRow = Math.max(3, 8 - this.level);
    this.misses = 0;
    const rows = Math.min(10, 4 + this.level);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < this.rowLen(r); c++) {
        const nb = this.neighbors(r, c).map(([a, b]) => this.grid[a][b]).filter(Boolean) as Cell[];
        const color = nb.length && rng.chance(0.45) ? rng.pick(nb).color : rng.int(0, this.colors - 1);
        const cell = this.place(r, c, color, this.cy(r) - 500);
        cell.img.setScale(0);
        this.tweens.add({ targets: cell.img, y: this.cy(r), scale: D / 149, duration: 450, delay: r * 50 + c * 15, ease: 'Back.easeOut' });
      }
    }
    this.setStage(this.level);
    this.cur = this.pickColor();
    this.next = this.pickColor();
    this.refreshShooter();
    this.hud.setLevel(this.level);
    this.refreshShots();
  }

  private presentColors(): number[] {
    const set = new Set<number>();
    for (const row of this.grid) for (const cell of row) if (cell) set.add(cell.color);
    return [...set];
  }

  private pickColor(): number {
    const p = this.presentColors();
    return p.length ? rng.pick(p) : rng.int(0, this.colors - 1);
  }

  private refreshShooter(): void {
    this.curImg.setTexture(`b${this.cur}`).setDisplaySize(D, D);
    this.nextImg.setTexture(`b${this.next}`).setDisplaySize(52, 52);
  }

  private refreshShots(): void {
    this.shotDots.forEach((d) => d.destroy());
    this.shotDots = [];
    const left = this.shotsPerRow - this.misses;
    const step = Math.min(24, 168 / Math.max(1, this.shotsPerRow - 1));
    for (let i = 0; i < this.shotsPerRow; i++) {
      const d = this.add.image(AMMO_X + 6 + i * step, HOLD_Y + 6, i < left ? 'ammo' : 'ammo-empty').setDisplaySize(19, 33).setDepth(6);
      if (i >= left) d.setAlpha(0.55);
      this.shotDots.push(d);
    }
  }

  // ---------- input ----------
  private setAimTo(x: number, y: number): void {
    const a = Math.atan2(y - SHOOT_Y, x - SHOOT_X);
    this.aim = Phaser.Math.Clamp(a, -Math.PI + 0.12, -0.12);
  }

  private swap(): void {
    if (this.ball || this.busy) return;
    [this.cur, this.next] = [this.next, this.cur];
    this.refreshShooter();
    this.tweens.killTweensOf([this.curImg, this.nextImg]);
    this.curImg.setPosition(HOLD_X, HOLD_Y).setDisplaySize(52, 52);
    this.nextImg.setPosition(SHOOT_X, SHOOT_Y).setDisplaySize(D, D);
    this.tweens.add({ targets: this.curImg, x: SHOOT_X, y: SHOOT_Y, scale: D / 149, duration: 170, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.nextImg, x: HOLD_X, y: HOLD_Y, scale: 52 / 149, duration: 170, ease: 'Back.easeOut' });
    this.sfx('swap', { volume: 0.45 });
  }

  private fire(): void {
    if (this.ball || this.busy || this.isOver) return;
    // the ball starts inside the barrel (drawn under it) and slides out of the muzzle
    const img = this.add.image(SHOOT_X, SHOOT_Y, `b${this.cur}`).setDisplaySize(D * 0.82, D * 0.82).setDepth(3);
    this.tweens.add({ targets: img, scale: D / 149, duration: 90 });
    this.ball = { img, color: this.cur, vx: Math.cos(this.aim) * SPEED, vy: Math.sin(this.aim) * SPEED };
    this.recoil();
    this.cur = this.next;
    this.next = this.pickColor();
    this.refreshShooter();
    // feed: the held bubble rolls from the holder into the hub, a new one pops into the holder
    this.tweens.killTweensOf([this.curImg, this.nextImg]);
    this.curImg.setPosition(HOLD_X, HOLD_Y).setDisplaySize(52, 52);
    this.tweens.add({ targets: this.curImg, x: SHOOT_X, y: SHOOT_Y, scale: D / 149, duration: 220, delay: 60, ease: 'Cubic.easeOut' });
    this.nextImg.setPosition(HOLD_X, HOLD_Y).setScale(0);
    this.tweens.add({ targets: this.nextImg, scale: 52 / 149, duration: 220, delay: 220, ease: 'Back.easeOut' });
    this.sfx(Math.random() < 0.5 ? 'shoot1' : 'shoot2', { volume: 0.4 });
    this.sfx('cannon', { volume: 0.32 });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    if (c.axisX) this.aim = Phaser.Math.Clamp(this.aim + c.axisX * 1.8 * dt, -Math.PI + 0.12, -0.12);
    if (c.justA() || (c.up && !this.ball && this.upReady)) this.fire();
    this.upReady = !c.up;
    if (c.justB()) this.swap();

    this.aimTurret();
    this.drawGuide();

    if (this.ball) this.moveBall(dt);
  }
  private upReady = true;

  private drawGuide(): void {
    const g = this.guide;
    g.clear();
    if (this.ball || this.busy) return;
    let x = SHOOT_X, y = SHOOT_Y, vx = Math.cos(this.aim), vy = Math.sin(this.aim);
    const tint = TINTS[this.cur];
    let dist = 0, end = false;
    for (let i = 0; i < 300; i++) {
      x += vx * 6; y += vy * 6; dist += 6;
      if (x < LEFT + R) { x = LEFT + R; vx = -vx; }
      if (x > RIGHT - R) { x = RIGHT - R; vx = -vx; }
      if (y < TOP + R || this.hits(x, y)) { end = true; break; }
      if (dist % 30 === 0 && dist > MUZZLE + 20) {
        const a = Math.max(0.25, 1 - dist / 2600);
        g.fillStyle(0x0b0920, 0.55 * a).fillCircle(x, y, 7.5);
        g.fillStyle(tint, a).fillCircle(x, y, 5);
        g.fillStyle(0xffffff, 0.7 * a).fillCircle(x - 1.5, y - 1.5, 1.6);
      }
    }
    if (end) {
      g.lineStyle(5, 0x0b0920, 0.45).strokeCircle(x, y, R - 6);
      g.lineStyle(3, tint, 0.9).strokeCircle(x, y, R - 6);
    }
  }

  private hits(x: number, y: number): boolean {
    const r0 = Math.round((y - TOP - R) / ROW_H);
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      if (r < 0 || r >= this.grid.length) continue;
      for (let c = 0; c < this.rowLen(r); c++) {
        if (this.grid[r][c] && Phaser.Math.Distance.Between(x, y, this.cx(r, c), this.cy(r)) < D - 10) return true;
      }
    }
    return false;
  }

  private moveBall(dt: number): void {
    const b = this.ball!;
    const steps = Math.ceil((SPEED * dt) / 8);
    for (let i = 0; i < steps; i++) {
      b.img.x += (b.vx * dt) / steps;
      b.img.y += (b.vy * dt) / steps;
      if (b.img.x < LEFT + R) { b.img.x = LEFT + R; b.vx = Math.abs(b.vx); this.sfxAt('bounce', b.img.x, { volume: 0.4 }); }
      if (b.img.x > RIGHT - R) { b.img.x = RIGHT - R; b.vx = -Math.abs(b.vx); this.sfxAt('bounce', b.img.x, { volume: 0.4 }); }
      if (b.img.y <= TOP + R || this.hits(b.img.x, b.img.y)) { this.snap(); return; }
    }
  }

  private snap(): void {
    const b = this.ball!;
    this.ball = null;
    const { x, y } = b.img;
    // nearest empty cell that is attached (row 0 or touching a bubble)
    let best: [number, number] | null = null, bestD = Infinity;
    const r0 = Phaser.Math.Clamp(Math.round((y - TOP - R) / ROW_H), 0, this.grid.length - 1);
    for (let r = Math.max(0, r0 - 1); r <= Math.min(this.grid.length - 1, r0 + 1); r++) {
      for (let c = 0; c < this.rowLen(r); c++) {
        if (this.grid[r][c]) continue;
        if (r > 0 && !this.neighbors(r, c).some(([a, cc]) => this.grid[a][cc])) continue;
        const d = Phaser.Math.Distance.Between(x, y, this.cx(r, c), this.cy(r));
        if (d < bestD) { bestD = d; best = [r, c]; }
      }
    }
    b.img.destroy();
    if (!best) { this.afterShot(false); return; }
    const [r, c] = best;
    const cell = this.place(r, c, b.color);
    cell.img.setPosition(x, y);
    this.tweens.add({ targets: cell.img, x: this.cx(r, c), y: this.cy(r), duration: 60 });
    this.sfxAt('stick', x, { volume: 0.5 });
    this.wobble(r, c);

    const group = this.flood(r, c, (n) => n.color === b.color);
    if (group.length >= 3) {
      group.forEach(([gr, gc], i) => this.popCell(gr, gc, i));
      this.addScore(group.length * 10 * this.level, this.cx(r, c), this.cy(r));
      const dropped = this.dropFloating();
      if (group.length >= 6) this.sfx('combo', { volume: 0.6, delay: 0.2 });
      if (dropped > 0) {
        this.time.delayedCall(250, () => { this.addScore(dropped * 25 * this.level, SHOOT_X, this.cy(r) + 80); if (!this.isOver) this.sfx('coins', { volume: 0.5 }); });
        if (dropped >= 4) shake(this, 0.008, 160);
      }
      this.afterShot(true);
    } else {
      if (r >= MAXR) { this.lose(); return; }
      this.afterShot(false);
    }
  }

  private wobble(r: number, c: number): void {
    for (const [a, b] of this.neighbors(r, c)) {
      const n = this.grid[a][b];
      if (!n) continue;
      const dx = this.cx(a, b) - this.cx(r, c), dy = this.cy(a) - this.cy(r);
      this.tweens.add({ targets: n.img, x: this.cx(a, b) + dx * 0.08, y: this.cy(a) + dy * 0.08, duration: 70, yoyo: true });
    }
  }

  private flood(r: number, c: number, ok: (n: Cell) => boolean): [number, number][] {
    const seen = new Set<string>([`${r},${c}`]);
    const out: [number, number][] = [];
    const stack: [number, number][] = [[r, c]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      out.push([a, b]);
      for (const [na, nb] of this.neighbors(a, b)) {
        const n = this.grid[na][nb];
        const k = `${na},${nb}`;
        if (n && !seen.has(k) && ok(n)) { seen.add(k); stack.push([na, nb]); }
      }
    }
    return out;
  }

  private popCell(r: number, c: number, i: number): void {
    const cell = this.grid[r][c]!;
    this.grid[r][c] = null;
    this.time.delayedCall(i * 40, () => {
      burst(this, cell.img.x, cell.img.y, [TINTS[cell.color], 0xffffff], 14, 300);
      this.sfxAt('pop', cell.img.x, { volume: 0.45, detune: Math.min(1200, i * 120), exact: true });
      this.tweens.add({ targets: cell.img, scale: cell.img.scale * 1.5, alpha: 0, duration: 160, onComplete: () => cell.img.destroy() });
    });
  }

  private dropFloating(): number {
    const attached = new Set<string>();
    for (let c = 0; c < this.rowLen(0); c++) {
      if (this.grid[0][c] && !attached.has(`0,${c}`)) {
        for (const [a, b] of this.flood(0, c, () => true)) attached.add(`${a},${b}`);
      }
    }
    let n = 0;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.rowLen(r); c++) {
        const cell = this.grid[r][c];
        if (!cell || attached.has(`${r},${c}`)) continue;
        this.grid[r][c] = null;
        n++;
        this.tweens.add({
          targets: cell.img, y: 1400, x: cell.img.x + rng.int(-60, 60), angle: rng.int(-180, 180), duration: 700 + rng.int(0, 250),
          ease: 'Quad.easeIn', onComplete: () => { burst(this, cell.img.x, 1240, TINTS[cell.color], 6, 200); cell.img.destroy(); },
        });
      }
    }
    if (n) this.sfx('drop', { volume: 0.45 });
    return n;
  }

  private afterShot(popped: boolean): void {
    if (this.isOver) return;
    if (this.presentColors().length === 0) { this.levelClear(); return; }
    if (!this.presentColors().includes(this.cur)) this.cur = this.pickColor();
    if (!this.presentColors().includes(this.next)) this.next = this.pickColor();
    this.refreshShooter();
    if (!popped) {
      this.misses++;
      if (this.misses >= this.shotsPerRow) { this.misses = 0; this.addRow(); }
    }
    this.refreshShots();
  }

  private addRow(): void {
    const last = this.grid.pop()!;
    last.forEach((cell) => cell?.img.destroy());
    this.parity ^= 1;
    this.grid.unshift(this.emptyRow());
    const present = this.presentColors();
    for (let c = 0; c < this.rowLen(0); c++) {
      const cell = this.place(0, c, present.length && rng.chance(0.8) ? rng.pick(present) : rng.int(0, this.colors - 1), TOP - R);
      cell.img.setScale(0);
      this.tweens.add({ targets: cell.img, scale: D / 149, duration: 250, ease: 'Back.easeOut' });
    }
    for (let r = 1; r < this.grid.length; r++) {
      for (let c = 0; c < this.rowLen(r); c++) {
        const cell = this.grid[r][c];
        if (cell) this.tweens.add({ targets: cell.img, x: this.cx(r, c), y: this.cy(r), duration: 250, ease: 'Quad.easeOut' });
      }
    }
    this.sfx('row', { volume: 0.55 });
    let lowest = -1;
    for (let r = 0; r < this.grid.length; r++) if (this.grid[r].some(Boolean)) lowest = r;
    if (lowest >= MAXR - 2 && lowest < MAXR) this.sfx('danger', { volume: 0.4, delay: 0.3 });
    shake(this, 0.012, 200);
    popup(this, 360, TOP + 300, t('newRow'), '#ec3013', 26);
    for (let r = MAXR; r < this.grid.length; r++) if (this.grid[r].some(Boolean)) { this.time.delayedCall(260, () => this.lose()); return; }
  }

  private levelClear(): void {
    this.busy = true;
    const bonus = 500 * this.level;
    this.addScore(bonus);
    this.sfx('level', { volume: 0.75, exact: true });
    flash(this, 0x5dff7a, 200);
    const msg = txt(this, 360, 560, t('clear'), { title: true, size: 40, color: '#5dff7a' }).setDepth(50).setScale(0);
    const sub = txt(this, 360, 630, `+${bonus}`, { title: true, size: 30, color: '#ffd23f' }).setDepth(50);
    this.tweens.add({ targets: msg, scale: 1, duration: 400, ease: 'Back.easeOut' });
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 150, () => burst(this, rng.int(100, 620), rng.int(300, 800), TINTS, 24, 380));
    this.time.delayedCall(1700, () => {
      msg.destroy(); sub.destroy();
      if (this.isOver) return;
      this.level++;
      this.busy = false;
      this.startLevel();
    });
  }

  private lose(): void {
    if (this.isOver) return;
    this.sfx('lose', { volume: 0.65 });
    shake(this, 0.025, 400);
    flash(this, 0xec3013, 200);
    for (const row of this.grid) for (const cell of row) if (cell) this.tweens.add({ targets: cell.img, alpha: 0.35, duration: 400 });
    this.endGame({ delay: 900 });
  }
}
