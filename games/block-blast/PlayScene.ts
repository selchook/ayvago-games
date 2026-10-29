import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng } from '@core';

/** puzzle2 square tiles (the orange set is numbered one higher). */
export const BLOCK_TILES = [
  'tiles_red/tilered_01.png', 'tiles_blue/tileblue_01.png', 'tiles_green/tilegreen_01.png',
  'tiles_yellow/tileyellow_01.png', 'tiles_pink/tilepink_01.png', 'tiles_orange/tileorange_02.png',
];
const TINTS = [0xff4f4f, 0x3ea8ff, 0x5dd65d, 0xffd23f, 0xff79c6, 0xff9a3c];

const N = 8;
const CELL = 78;
const LEFT = (720 - N * CELL) / 2;
const TOP = 176;
const TRAY_Y = 1010;
const SLOTS = [130, 360, 590];
const TRAY_SCALE = 0.48;

type Shape = [number, number][];
const rot = (s: Shape): Shape => s.map(([x, y]) => [-y, x] as [number, number]);
const norm = (s: Shape): Shape => {
  const mx = Math.min(...s.map((p) => p[0])), my = Math.min(...s.map((p) => p[1]));
  return s.map(([x, y]) => [x - mx, y - my] as [number, number]);
};
const rots = (s: Shape, n = 4): Shape[] => {
  const out: Shape[] = [norm(s)];
  for (let i = 1; i < n; i++) out.push(norm(rot(out[i - 1])));
  return out;
};
const line = (n: number): Shape => Array.from({ length: n }, (_, i) => [i, 0] as [number, number]);
const rect = (w: number, h: number): Shape => {
  const s: Shape = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s.push([x, y]);
  return s;
};

/** [shape, weight early, weight late] */
const POOL: [Shape, number, number][] = [
  [[[0, 0]], 3, 1],
  ...rots(line(2), 2).map((s) => [s, 3, 1] as [Shape, number, number]),
  ...rots(line(3), 2).map((s) => [s, 3, 2] as [Shape, number, number]),
  ...rots(line(4), 2).map((s) => [s, 2, 2] as [Shape, number, number]),
  ...rots(line(5), 2).map((s) => [s, 0.5, 2] as [Shape, number, number]),
  [rect(2, 2), 3, 2],
  [rect(3, 3), 0.4, 1.6],
  [rect(2, 3), 0.6, 1.5], [rect(3, 2), 0.6, 1.5],
  ...rots([[0, 0], [1, 0], [0, 1]]).map((s) => [s, 2, 1.2] as [Shape, number, number]),
  ...rots([[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]).map((s) => [s, 0.4, 1.4] as [Shape, number, number]),
  ...rots([[0, 0], [1, 0], [2, 0], [1, 1]]).map((s) => [s, 1, 1.4] as [Shape, number, number]),
  ...rots([[0, 0], [0, 1], [0, 2], [1, 2]]).map((s) => [s, 0.8, 1.3] as [Shape, number, number]),
  ...rots([[0, 0], [1, 0], [1, 1], [2, 1]], 2).map((s) => [s, 0.8, 1.3] as [Shape, number, number]),
  ...rots([[1, 0], [2, 0], [0, 1], [1, 1]], 2).map((s) => [s, 0.8, 1.3] as [Shape, number, number]),
];

interface Piece { shape: Shape; color: number; w: number; h: number; box: Phaser.GameObjects.Container; slot: number }

export class PlayScene extends ArcadeScene {
  private board: number[][] = [];
  private tiles: (Phaser.GameObjects.Image | null)[][] = [];
  private tray: (Piece | null)[] = [];
  private drag: Piece | null = null;
  private sel = -1;
  private cur = { r: 0, c: 0 };
  private ghost: Phaser.GameObjects.Image[] = [];
  private hilite!: Phaser.GameObjects.Graphics;
  private selMark!: Phaser.GameObjects.Rectangle;
  private combo = 0;
  private sinceClear = 0;
  private level = 1;
  private locked = false;

  createGame(): void {
    this.board = []; this.tiles = []; this.tray = [null, null, null]; this.drag = null; this.sel = -1;
    this.combo = 0; this.sinceClear = 0; this.level = 1; this.locked = false; this.ghost = [];

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(LEFT - 14, TOP - 14, N * CELL + 28, N * CELL + 28, 18);
    g.lineStyle(5, 0x8b5cff, 1).strokeRoundedRect(LEFT - 14, TOP - 14, N * CELL + 28, N * CELL + 28, 18);
    for (let r = 0; r < N; r++) {
      this.board.push(new Array(N).fill(-1));
      this.tiles.push(new Array(N).fill(null));
      for (let c = 0; c < N; c++) {
        g.fillStyle((r + c) % 2 ? 0x221d3a : 0x2a2448, 1).fillRoundedRect(LEFT + c * CELL + 3, TOP + r * CELL + 3, CELL - 6, CELL - 6, 8);
      }
    }
    g.fillStyle(0x000000, 0.35).fillRoundedRect(20, TRAY_Y - 130, 680, 260, 22);
    this.hilite = this.add.graphics().setDepth(3);
    for (let i = 0; i < 25; i++) this.ghost.push(this.add.image(0, 0, 'blk0').setDisplaySize(CELL - 4, CELL - 4).setAlpha(0.4).setVisible(false).setDepth(5));
    this.selMark = this.add.rectangle(0, TRAY_Y, 220, 240).setStrokeStyle(5, 0xffd23f).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.updateHud();
    this.refill();
  }

  updateGame(): void { /* event driven */ }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
  }

  // ---------- pieces ----------
  private randomShape(): Shape {
    const k = Math.min(1, (this.level - 1) / 6);
    const weights = POOL.map(([, a, b]) => a + (b - a) * k);
    let x = Math.random() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < POOL.length; i++) { x -= weights[i]; if (x <= 0) return POOL[i][0]; }
    return POOL[0][0];
  }

  private makePiece(shape: Shape, slot: number): Piece {
    const color = rng.int(0, BLOCK_TILES.length - 1);
    const w = Math.max(...shape.map((p) => p[0])) + 1, h = Math.max(...shape.map((p) => p[1])) + 1;
    const box = this.add.container(0, 0).setDepth(10);
    for (const [x, y] of shape) box.add(this.add.image(x * CELL + CELL / 2, y * CELL + CELL / 2, `blk${color}`).setDisplaySize(CELL - 4, CELL - 4));
    const pc: Piece = { shape, color, w, h, box, slot };
    this.toTray(pc, false);
    return pc;
  }

  private toTray(pc: Piece, animate: boolean): void {
    const x = SLOTS[pc.slot] - (pc.w * CELL * TRAY_SCALE) / 2, y = TRAY_Y - (pc.h * CELL * TRAY_SCALE) / 2;
    if (animate) this.tweens.add({ targets: pc.box, x, y, scale: TRAY_SCALE, duration: 180, ease: 'Quad.easeOut' });
    else pc.box.setPosition(x, y).setScale(TRAY_SCALE);
  }

  private refill(): void {
    // make sure at least one of the new pieces fits (fairness), unless the board is hopeless
    let shapes: Shape[] = [];
    for (let tries = 0; tries < 12; tries++) {
      shapes = [this.randomShape(), this.randomShape(), this.randomShape()];
      if (shapes.some((s) => this.fitsAnywhere(s))) break;
    }
    shapes.forEach((s, i) => {
      const pc = this.makePiece(s, i);
      this.tray[i] = pc;
      const ty = pc.box.y;
      pc.box.y += 300;
      this.tweens.add({ targets: pc.box, y: ty, duration: 320, delay: i * 70, ease: 'Back.easeOut' });
    });
    this.sfx('refill', { volume: 0.4 });
  }

  private fits(s: Shape, r: number, c: number): boolean {
    return s.every(([x, y]) => r + y >= 0 && r + y < N && c + x >= 0 && c + x < N && this.board[r + y][c + x] < 0);
  }

  private fitsAnywhere(s: Shape): boolean {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (this.fits(s, r, c)) return true;
    return false;
  }

  // ---------- pointer ----------
  private onDown(p: Phaser.Input.Pointer): void {
    if (this.isOver || this.locked || this.drag) return;
    if (Math.abs(p.y - TRAY_Y) > 140) return;
    const i = SLOTS.findIndex((x) => Math.abs(p.x - x) < 115);
    const pc = i >= 0 ? this.tray[i] : null;
    if (!pc) return;
    this.drag = pc;
    this.setSel(-1);
    this.tweens.killTweensOf(pc.box);
    pc.box.setScale(1).setDepth(20);
    this.follow(p);
    this.sfxAt('pick', p.x, { volume: 0.5 });
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    this.follow(p);
  }

  private follow(p: Phaser.Input.Pointer): void {
    const pc = this.drag!;
    pc.box.setPosition(p.x - (pc.w * CELL) / 2, p.y - pc.h * CELL - 70);
    const c = Math.round((pc.box.x - LEFT) / CELL), r = Math.round((pc.box.y - TOP) / CELL);
    this.cur = { r, c };
    this.showGhost(pc, r, c);
  }

  private onUp(_p: Phaser.Input.Pointer): void {
    const pc = this.drag;
    if (!pc) return;
    this.drag = null;
    pc.box.setDepth(10);
    if (!this.isOver && this.fits(pc.shape, this.cur.r, this.cur.c)) this.place(pc, this.cur.r, this.cur.c);
    else { this.toTray(pc, true); this.clearGhost(); this.sfx('back', { volume: 0.35 }); }
  }

  // ---------- keyboard ----------
  private onKey(e: KeyboardEvent): void {
    if (this.isOver || this.locked || this.drag) return;
    const k = e.code;
    if (k === 'KeyX' || k === 'ShiftLeft' || k === 'ShiftRight' || k === 'Tab') { this.cycle(); return; }
    if (this.sel < 0) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'Enter'].includes(k)) this.cycle();
      return;
    }
    const pc = this.tray[this.sel]!;
    const mv: Record<string, [number, number]> = {
      ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1], ArrowUp: [-1, 0], KeyW: [-1, 0], ArrowDown: [1, 0], KeyS: [1, 0],
    };
    if (mv[k]) {
      this.cur.r = Phaser.Math.Clamp(this.cur.r + mv[k][0], 0, N - pc.h);
      this.cur.c = Phaser.Math.Clamp(this.cur.c + mv[k][1], 0, N - pc.w);
      this.showGhost(pc, this.cur.r, this.cur.c, true);
      this.sfx('nudge', { volume: 0.3 });
    } else if (k === 'Space' || k === 'KeyZ' || k === 'Enter') {
      if (this.fits(pc.shape, this.cur.r, this.cur.c)) this.place(pc, this.cur.r, this.cur.c);
      else { this.sfx('bad', { volume: 0.45 }); shake(this, 0.004, 100); }
    }
  }

  private cycle(): void {
    const avail = [0, 1, 2].filter((i) => this.tray[i]);
    if (!avail.length) return;
    const next = avail.find((i) => i > this.sel) ?? avail[0];
    this.setSel(next);
    const pc = this.tray[next]!;
    this.cur = { r: Math.floor((N - pc.h) / 2), c: Math.floor((N - pc.w) / 2) };
    this.showGhost(pc, this.cur.r, this.cur.c, true);
    this.sfxAt('pick', SLOTS[next], { volume: 0.4 });
  }

  private setSel(i: number): void {
    this.sel = i;
    this.selMark.setVisible(i >= 0);
    if (i >= 0) this.selMark.setX(SLOTS[i]);
  }

  // ---------- ghost ----------
  private showGhost(pc: Piece, r: number, c: number, always = false): void {
    this.clearGhost();
    const ok = this.fits(pc.shape, r, c);
    if (!ok && !always) return;
    pc.shape.forEach(([x, y], i) => {
      const rr = r + y, cc = c + x;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) return;
      this.ghost[i].setTexture(`blk${pc.color}`).setDisplaySize(CELL - 4, CELL - 4).setVisible(true)
        .setPosition(LEFT + cc * CELL + CELL / 2, TOP + rr * CELL + CELL / 2).setAlpha(ok ? 0.45 : 0.2).setTint(ok ? 0xffffff : 0xff3030);
    });
    if (!ok) return;
    const { rows, cols } = this.fullLines(pc.shape, r, c);
    this.hilite.fillStyle(0xffffff, 0.18);
    rows.forEach((rr) => this.hilite.fillRect(LEFT, TOP + rr * CELL, N * CELL, CELL));
    cols.forEach((cc) => this.hilite.fillRect(LEFT + cc * CELL, TOP, CELL, N * CELL));
  }

  private clearGhost(): void {
    this.ghost.forEach((g) => g.setVisible(false));
    this.hilite.clear();
  }

  private fullLines(extra: Shape | null, r: number, c: number): { rows: number[]; cols: number[] } {
    const filled = (rr: number, cc: number) => this.board[rr][cc] >= 0 || (!!extra && extra.some(([x, y]) => r + y === rr && c + x === cc));
    const rows: number[] = [], cols: number[] = [];
    for (let i = 0; i < N; i++) {
      let rf = true, cf = true;
      for (let j = 0; j < N; j++) { if (!filled(i, j)) rf = false; if (!filled(j, i)) cf = false; }
      if (rf) rows.push(i);
      if (cf) cols.push(i);
    }
    return { rows, cols };
  }

  // ---------- placing ----------
  private place(pc: Piece, r: number, c: number): void {
    this.clearGhost();
    this.tray[pc.slot] = null;
    this.setSel(-1);
    pc.box.destroy();
    for (const [x, y] of pc.shape) {
      this.board[r + y][c + x] = pc.color;
      const img = this.add.image(LEFT + (c + x) * CELL + CELL / 2, TOP + (r + y) * CELL + CELL / 2, `blk${pc.color}`).setDepth(4);
      img.setDisplaySize(CELL - 4, CELL - 4);
      const s = img.scale;
      img.setScale(s * 1.25);
      this.tweens.add({ targets: img, scale: s, duration: 160, ease: 'Back.easeOut' });
      this.tiles[r + y][c + x] = img;
    }
    this.sfxAt(rng.pick(['place1', 'place2', 'place3']), LEFT + (c + pc.w / 2) * CELL, { volume: 0.6 });
    this.addScore(pc.shape.length);

    const { rows, cols } = this.fullLines(null, 0, 0);
    const lines = rows.length + cols.length;
    if (lines > 0) {
      this.combo++;
      this.sinceClear = 0;
      this.clearLines(rows, cols, pc.color);
      const pts = (100 * lines + 50 * lines * (lines - 1)) * this.combo;
      const cx = LEFT + (c + pc.w / 2) * CELL, cy = TOP + (r + pc.h / 2) * CELL;
      this.addScore(pts, cx, cy);
      const word = lines >= 3 ? t('amazing') : lines === 2 ? t('great') : t('good');
      popup(this, 360, TOP - 50 + 420, word, '#5dff7a', 34);
      if (this.combo > 1) {
        this.hud.setCenter(`${t('combo')} x${this.combo}`);
        this.sfx('combo', { volume: 0.6, exact: true, rate: Math.min(1.4, 1 + (this.combo - 2) * 0.07), delay: 0.12 });
        this.time.delayedCall(1200, () => !this.isOver && this.updateHud());
      }
    } else if (++this.sinceClear >= 3) this.combo = 0;

    const lvl = 1 + Math.floor(this.score / 1500);
    if (lvl !== this.level) { this.level = lvl; this.updateHud(); this.sfx('level', { volume: 0.6, delay: 0.3 }); }

    if (this.tray.every((x) => !x)) this.refill();
    this.time.delayedCall(lines ? 420 : 50, () => this.checkStuck());
  }

  private clearLines(rows: number[], cols: number[], color: number): void {
    const cells = new Set<string>();
    rows.forEach((r) => { for (let c = 0; c < N; c++) cells.add(`${r},${c}`); });
    cols.forEach((c) => { for (let r = 0; r < N; r++) cells.add(`${r},${c}`); });
    let i = 0;
    for (const k of cells) {
      const [r, c] = k.split(',').map(Number);
      const img = this.tiles[r][c];
      const col = this.board[r][c];
      this.board[r][c] = -1;
      this.tiles[r][c] = null;
      if (!img) continue;
      const delay = (i++ % N) * 30;
      this.tweens.add({
        targets: img, scale: 0, angle: 90, delay, duration: 220, ease: 'Back.easeIn',
        onStart: () => burst(this, img.x, img.y, [TINTS[col], TINTS[color], 0xffffff], 8, 260),
        onComplete: () => img.destroy(),
      });
    }
    const n = rows.length + cols.length;
    this.sfx(n >= 3 ? 'clear3' : n === 2 ? 'clear2' : 'clear1', { volume: n >= 3 ? 0.75 : n === 2 ? 0.65 : 0.55 });
    shake(this, 0.004 + 0.003 * (rows.length + cols.length), 180);
    if (this.board.every((row) => row.every((v) => v < 0))) {
      this.time.delayedCall(300, () => { flash(this, 0x5dff7a, 200); this.addScore(1000, 360, TOP + 300); this.sfx('wipe', { volume: 0.8, exact: true }); });
    }
  }

  private checkStuck(): void {
    if (this.isOver) return;
    const left = this.tray.filter((x): x is Piece => !!x);
    if (!left.length || left.some((pc) => this.fitsAnywhere(pc.shape))) {
      left.forEach((pc) => pc.box.setAlpha(this.fitsAnywhere(pc.shape) ? 1 : 0.35));
      return;
    }
    this.locked = true;
    this.sfx('stuck', { volume: 0.7 });
    shake(this, 0.015, 300);
    left.forEach((pc) => pc.box.setAlpha(0.35));
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const img = this.tiles[r][c];
      if (img) this.tweens.add({ targets: img, alpha: 0.4, delay: (r + c) * 25, duration: 200 });
    }
    const msg = txt(this, 360, TOP + (N * CELL) / 2, t('noFit'), { title: true, size: 34, color: '#ec3013' }).setDepth(50).setScale(0);
    this.tweens.add({ targets: msg, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.endGame({ delay: 1400 });
  }
}
