import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';

export const BUBBLE_COLORS = ['red', 'blue', 'green', 'yellow', 'pink', 'orange'] as const;
const TINTS = [0xff4f4f, 0x3ea8ff, 0x5dd65d, 0xffd23f, 0xff79c6, 0xff9a3c];

const R = 32;                 // bubble radius
const D = R * 2;
const COLS = 10;              // 10 cells on normal rows, 9 on shifted rows
const LEFT = 40;              // left wall x
const RIGHT = LEFT + COLS * D; // right wall x
const TOP = 132;              // ceiling y
const ROW_H = R * Math.sqrt(3);
const MAXR = 15;              // a bubble stuck on row >= MAXR ends the game
const SHOOT_X = 360;
const SHOOT_Y = 1150;
const SPEED = 1500;

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
  private arrow!: Phaser.GameObjects.Triangle;
  private shotDots: Phaser.GameObjects.Arc[] = [];
  private busy = false;

  createGame(): void {
    this.grid = []; this.parity = 0; this.level = 1; this.misses = 0; this.aim = -Math.PI / 2;
    this.aiming = false; this.ball = null; this.busy = false; this.shotDots = [];

    // board frame
    const g = this.add.graphics();
    g.fillStyle(0x0c0a1a, 1).fillRect(LEFT, TOP, RIGHT - LEFT, SHOOT_Y + 80 - TOP);
    g.lineStyle(6, 0x8b5cff, 1).strokeRect(LEFT - 3, TOP - 3, RIGHT - LEFT + 6, SHOOT_Y + 86 - TOP);
    const dangerY = TOP + R + MAXR * ROW_H - R + 4;
    g.lineStyle(3, 0xec3013, 0.7);
    for (let x = LEFT; x < RIGHT; x += 28) g.lineBetween(x, dangerY, x + 14, dangerY);
    this.add.circle(SHOOT_X, SHOOT_Y, 58, 0x2a2440).setStrokeStyle(6, 0x8b5cff);
    this.arrow = this.add.triangle(SHOOT_X, SHOOT_Y, 0, 14, 0, -14, 34, 0, 0xffffff).setOrigin(0, 0.5).setDepth(5);
    this.guide = this.add.graphics().setDepth(4);

    this.add.circle(SHOOT_X - 150, SHOOT_Y + 20, 40, 0x2a2440).setStrokeStyle(4, 0x3ee6ff, 0.7);
    txt(this, SHOOT_X - 150, SHOOT_Y + 82, t('next'), { title: true, size: 14, color: '#3ee6ff' });
    txt(this, SHOOT_X + 170, SHOOT_Y + 82, t('shots'), { title: true, size: 14, color: '#ffd23f' });

    this.curImg = this.add.image(SHOOT_X, SHOOT_Y, 'b0').setDisplaySize(D, D).setDepth(6);
    this.nextImg = this.add.image(SHOOT_X - 150, SHOOT_Y + 20, 'b0').setDisplaySize(48, 48).setDepth(6);

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.isOver) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, SHOOT_X - 150, SHOOT_Y + 20) < 60) { this.swap(); return; }
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
    this.cur = this.pickColor();
    this.next = this.pickColor();
    this.refreshShooter();
    this.hud.setCenter(`${t('level')} ${this.level}`);
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
    this.nextImg.setTexture(`b${this.next}`).setDisplaySize(48, 48);
  }

  private refreshShots(): void {
    this.shotDots.forEach((d) => d.destroy());
    this.shotDots = [];
    const left = this.shotsPerRow - this.misses;
    for (let i = 0; i < this.shotsPerRow; i++) {
      const d = this.add.circle(SHOOT_X + 110 + i * 22, SHOOT_Y + 40, 8, i < left ? 0xffd23f : 0x3a3450).setStrokeStyle(2, 0x000000);
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
    this.curImg.setScale((D / 149) * 1.25);
    this.tweens.add({ targets: this.curImg, scale: D / 149, duration: 160, ease: 'Back.easeOut' });
    this.sfx('swap', { volume: 0.45 });
  }

  private fire(): void {
    if (this.ball || this.busy || this.isOver) return;
    const img = this.add.image(SHOOT_X, SHOOT_Y, `b${this.cur}`).setDisplaySize(D, D).setDepth(3);
    this.ball = { img, color: this.cur, vx: Math.cos(this.aim) * SPEED, vy: Math.sin(this.aim) * SPEED };
    this.cur = this.next;
    this.next = this.pickColor();
    this.refreshShooter();
    this.curImg.setScale(0);
    this.tweens.add({ targets: this.curImg, scale: D / 149, duration: 200, ease: 'Back.easeOut' });
    this.sfx(Math.random() < 0.5 ? 'shoot1' : 'shoot2', { volume: 0.4 });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    if (c.axisX) this.aim = Phaser.Math.Clamp(this.aim + c.axisX * 1.8 * dt, -Math.PI + 0.12, -0.12);
    if (c.justA() || (c.up && !this.ball && this.upReady)) this.fire();
    this.upReady = !c.up;
    if (c.justB()) this.swap();

    this.arrow.setRotation(this.aim).setPosition(SHOOT_X + Math.cos(this.aim) * 44, SHOOT_Y + Math.sin(this.aim) * 44);
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
    let dist = 0;
    for (let i = 0; i < 260; i++) {
      x += vx * 6; y += vy * 6; dist += 6;
      if (x < LEFT + R) { x = LEFT + R; vx = -vx; }
      if (x > RIGHT - R) { x = RIGHT - R; vx = -vx; }
      if (y < TOP + R || this.hits(x, y)) break;
      if (dist % 30 === 0 && dist > 60) g.fillStyle(tint, 0.85 - dist / 2400).fillCircle(x, y, 5);
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
