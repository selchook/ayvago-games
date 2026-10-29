import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt } from '@core';

const W = 10, H = 22, HIDDEN = 2;            // 20 visible rows + 2 spawn rows
const CELL = 46, BX = 24, BY = 100 - HIDDEN * CELL;
const PANEL_X = 602;

interface PieceDef { name: string; tex: string; tint?: number; box: number; cells: Array<[number, number]> }
export const PIECES: PieceDef[] = [
  { name: 'I', tex: 'sq-blue', box: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  { name: 'J', tex: 'sq-grey', tint: 0x4f6bff, box: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { name: 'L', tex: 'sq-grey', tint: 0xff9a2e, box: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  { name: 'O', tex: 'sq-yellow', box: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  { name: 'S', tex: 'sq-green', box: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { name: 'T', tex: 'sq-purple', box: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  { name: 'Z', tex: 'sq-red', box: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
];
const COLORS_FX = [0x3ec8ff, 0x4f6bff, 0xff9a2e, 0xffd23f, 0x5dff7a, 0xb36bff, 0xff4040];

/** SHAPES[piece][rotation] = cell list, rotated clockwise inside the piece box. */
export const SHAPES: Array<Array<Array<[number, number]>>> = PIECES.map((p) => {
  const rots: Array<Array<[number, number]>> = [p.cells];
  for (let r = 1; r < 4; r++) {
    rots.push(p.name === 'O' ? p.cells : rots[r - 1].map(([x, y]) => [p.box - 1 - y, x] as [number, number]));
  }
  return rots;
});

// SRS wall kicks (x right, y up) — converted to y-down when applied.
const KICKS: Record<string, Array<[number, number]>> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, Array<[number, number]>> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

interface Active { p: number; rot: number; x: number; y: number }
type Phase = 'play' | 'clearing' | 'spawn';
type Act = 'left' | 'right' | 'down';

export class PlayScene extends ArcadeScene {
  private grid: number[][] = [];                     // -1 empty, else piece index
  private cells: Phaser.GameObjects.Image[][] = [];
  private active: Active | null = null;
  private pieceImgs: Phaser.GameObjects.Image[] = [];
  private ghostImgs: Phaser.GameObjects.Image[] = [];
  private nextImgs: Phaser.GameObjects.Image[] = [];
  private holdImgs: Phaser.GameObjects.Image[] = [];
  private bag: number[] = [];
  private queue: number[] = [];
  private holdP = -1;
  private holdUsed = false;
  private level = 1;
  private lines = 0;
  private combo = -1;
  private b2b = false;
  private fallT = 0;
  private lockT = 0;
  private lockResets = 0;
  private phase: Phase = 'play';
  private phaseT = 0;
  private clearRows: number[] = [];
  private held: Record<Act, number | null> = { left: null, right: null, down: null };
  private touchHeld: Record<Act, boolean> = { left: false, right: false, down: false };
  private levelText!: Phaser.GameObjects.Text;
  private linesText!: Phaser.GameObjects.Text;
  private drag: { x: number; y: number; t: number; mx: number; my: number; moved: boolean } | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  createGame(): void {
    this.grid = []; this.cells = []; this.pieceImgs = []; this.ghostImgs = []; this.nextImgs = []; this.holdImgs = [];
    this.bag = []; this.queue = []; this.holdP = -1; this.holdUsed = false; this.level = 1; this.lines = 0;
    this.danger = false;
    this.combo = -1; this.b2b = false; this.fallT = 0; this.lockT = 0; this.lockResets = 0; this.active = null;
    this.phase = 'play'; this.phaseT = 0; this.clearRows = []; this.drag = null;
    this.held = { left: null, right: null, down: null };
    this.touchHeld = { left: false, right: false, down: false };

    this.drawFrame();
    for (let y = 0; y < H; y++) {
      this.grid.push(new Array(W).fill(-1));
      const row: Phaser.GameObjects.Image[] = [];
      for (let x = 0; x < W; x++) row.push(this.add.image(this.px(x), this.py(y), 'sq-red').setDisplaySize(CELL - 2, CELL - 2).setVisible(false).setDepth(2));
      this.cells.push(row);
    }
    for (let i = 0; i < 4; i++) {
      this.ghostImgs.push(this.add.image(0, 0, 'sq-grey').setDisplaySize(CELL - 2, CELL - 2).setAlpha(0.22).setDepth(1));
      this.pieceImgs.push(this.add.image(0, 0, 'sq-grey').setDisplaySize(CELL - 2, CELL - 2).setDepth(3));
    }
    for (let i = 0; i < 12; i++) this.nextImgs.push(this.add.image(0, 0, 'sq-grey').setDepth(3).setVisible(false));
    for (let i = 0; i < 4; i++) this.holdImgs.push(this.add.image(0, 0, 'sq-grey').setDepth(3).setVisible(false));

    this.buildPanel();
    this.buildButtons();
    this.bindKeys();
    this.bindGestures();
    for (let i = 0; i < 4; i++) this.queue.push(this.fromBag());
    this.updateHud();
    this.spawn();
  }

  // ---------- layout ----------

  private px(x: number): number { return BX + x * CELL + CELL / 2; }
  private py(y: number): number { return BY + y * CELL + CELL / 2; }

  private drawFrame(): void {
    const g = this.add.graphics();
    const top = BY + HIDDEN * CELL;
    g.fillStyle(0x000000, 0.55).fillRect(BX - 8, top - 8, W * CELL + 16, (H - HIDDEN) * CELL + 16);
    g.lineStyle(4, 0x8b5cff, 0.9).strokeRect(BX - 8, top - 8, W * CELL + 16, (H - HIDDEN) * CELL + 16);
    g.lineStyle(1, 0xffffff, 0.05);
    for (let x = 1; x < W; x++) g.lineBetween(BX + x * CELL, top, BX + x * CELL, top + (H - HIDDEN) * CELL);
    for (let y = 1; y < H - HIDDEN; y++) g.lineBetween(BX, top + y * CELL, BX + W * CELL, top + y * CELL);
  }

  private buildPanel(): void {
    const g = this.add.graphics();
    const box = (y: number, h: number) => {
      g.fillStyle(0x000000, 0.45).fillRoundedRect(PANEL_X - 96, y, 192, h, 12);
      g.lineStyle(3, 0x8b5cff, 0.8).strokeRoundedRect(PANEL_X - 96, y, 192, h, 12);
    };
    txt(this, PANEL_X, 128, t('hold'), { title: true, size: 18, color: '#ff4fa3' });
    box(146, 120);
    const holdZone = this.add.zone(PANEL_X, 206, 192, 150).setInteractive();
    holdZone.on('pointerdown', () => this.hold());
    txt(this, PANEL_X, 300, t('next'), { title: true, size: 18, color: '#3ee6ff' });
    box(318, 360);
    txt(this, PANEL_X, 730, t('level'), { title: true, size: 18, color: '#ffd23f' });
    this.levelText = txt(this, PANEL_X, 772, '1', { title: true, size: 34 });
    txt(this, PANEL_X, 840, t('lines'), { title: true, size: 18, color: '#5dff7a' });
    this.linesText = txt(this, PANEL_X, 882, '0', { title: true, size: 34 });
  }

  private buildButtons(): void {
    const y = 1150, w = 108, h = 128, gap = 8;
    const specs: Array<{ icon: string; color: number; down?: () => void; act?: Act }> = [
      { icon: 'left', color: 0x3ee6ff, act: 'left' },
      { icon: 'right', color: 0x3ee6ff, act: 'right' },
      { icon: 'down', color: 0x5dff7a, act: 'down' },
      { icon: 'hold', color: 0xff4fa3, down: () => this.hold() },
      { icon: 'drop', color: 0xffd23f, down: () => this.hardDrop() },
      { icon: 'rot', color: 0xec3013, down: () => this.rotate(1) },
    ];
    const x0 = (720 - (specs.length * w + (specs.length - 1) * gap)) / 2 + w / 2;
    specs.forEach((s, i) => {
      const x = x0 + i * (w + gap);
      const bg = this.add.rectangle(x, y, w, h, s.color, 0.2).setStrokeStyle(4, s.color, 0.9).setInteractive();
      const ic = this.add.graphics({ x, y });
      ic.fillStyle(0xffffff, 0.9).lineStyle(7, 0xffffff, 0.9);
      if (s.icon === 'left') ic.fillTriangle(-22, 0, 16, -24, 16, 24);
      if (s.icon === 'right') ic.fillTriangle(22, 0, -16, -24, -16, 24);
      if (s.icon === 'down') ic.fillTriangle(0, 22, -24, -16, 24, -16);
      if (s.icon === 'drop') { ic.fillTriangle(0, 14, -24, -20, 24, -20); ic.fillRect(-24, 20, 48, 7); }
      if (s.icon === 'rot') { ic.beginPath(); ic.arc(0, 2, 20, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(220)); ic.strokePath(); ic.fillTriangle(6, -30, 24, -16, 4, -6); }
      if (s.icon === 'hold') txt(this, x, y, t('hold'), { title: true, size: 15, strokeThickness: 0, shadow: false });
      const press = () => {
        bg.setFillStyle(s.color, 0.55);
        this.tweens.add({ targets: ic, scale: 0.85, duration: 60, yoyo: true });
        if (s.act) { this.touchHeld[s.act] = true; this.held[s.act] = null; } else s.down?.();
      };
      const release = () => { bg.setFillStyle(s.color, 0.2); if (s.act) this.touchHeld[s.act] = false; };
      bg.on('pointerdown', press);
      bg.on('pointerup', release);
      bg.on('pointerout', release);
    });
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT, true, false), right: kb.addKey(K.RIGHT, true, false), down: kb.addKey(K.DOWN, true, false),
      a: kb.addKey(K.A, true, false), d: kb.addKey(K.D, true, false), s: kb.addKey(K.S, true, false),
    };
    kb.on('keydown-UP', () => this.rotate(1));
    kb.on('keydown-W', () => this.rotate(1));
    kb.on('keydown-X', () => this.rotate(1));
    kb.on('keydown-Z', () => this.rotate(-1));
    kb.on('keydown-Q', () => this.rotate(-1));
    kb.on('keydown-SPACE', () => this.hardDrop());
    kb.on('keydown-C', () => this.hold());
    kb.on('keydown-SHIFT', () => this.hold());
  }

  private bindGestures(): void {
    const top = BY + HIDDEN * CELL, bottom = top + (H - HIDDEN) * CELL;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > BX + W * CELL + 8 || p.y < top - 8 || p.y > bottom + 8) { this.drag = null; return; }
      this.drag = { x: p.x, y: p.y, t: this.time.now, mx: p.x, my: p.y, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown || this.phase !== 'play') return;
      while (p.x - d.mx > CELL * 0.8) { d.mx += CELL * 0.8; this.shift(1); d.moved = true; }
      while (d.mx - p.x > CELL * 0.8) { d.mx -= CELL * 0.8; this.shift(-1); d.moved = true; }
      while (p.y - d.my > CELL) {
        d.my += CELL; d.moved = true;
        if (this.softDrop()) this.addScore(1);
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const dt = this.time.now - d.t, dx = p.x - d.x, dy = p.y - d.y;
      if (dt < 260 && dy > 110 && Math.abs(dy) > Math.abs(dx)) this.hardDrop();
      else if (dt < 300 && dy < -90 && Math.abs(dy) > Math.abs(dx)) this.hold();
      else if (!d.moved && Math.hypot(dx, dy) < 24) this.rotate(1);
    });
  }

  // ---------- pieces ----------

  private fromBag(): number {
    if (!this.bag.length) this.bag = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4, 5, 6]);
    return this.bag.pop()!;
  }

  private fits(p: number, rot: number, x: number, y: number): boolean {
    for (const [cx, cy] of SHAPES[p][rot]) {
      const gx = x + cx, gy = y + cy;
      if (gx < 0 || gx >= W || gy >= H) return false;
      if (gy >= 0 && this.grid[gy][gx] >= 0) return false;
    }
    return true;
  }

  private spawn(p?: number): void {
    const piece = p ?? this.queue.shift()!;
    if (p === undefined) this.queue.push(this.fromBag());
    const a: Active = { p: piece, rot: 0, x: 3, y: 0 };
    this.fallT = 0; this.lockT = 0; this.lockResets = 0;
    if (!this.fits(a.p, a.rot, a.x, a.y)) {
      this.active = a;
      this.render();
      this.gameOver();
      return;
    }
    // drop one row straight away if there is room so the piece shows at the top edge
    if (this.fits(a.p, a.rot, a.x, a.y + 1)) a.y++;
    this.active = a;
    this.renderPreviews();
    this.render();
  }

  private shift(dir: number): boolean {
    const a = this.active;
    if (!a || this.phase !== 'play' || this.isOver) return false;
    if (!this.fits(a.p, a.rot, a.x + dir, a.y)) return false;
    a.x += dir;
    this.touchLock();
    this.sfx('move', { volume: 0.3 });
    this.render();
    return true;
  }

  private softDrop(): boolean {
    const a = this.active;
    if (!a || this.phase !== 'play' || this.isOver) return false;
    if (!this.fits(a.p, a.rot, a.x, a.y + 1)) return false;
    a.y++;
    this.fallT = 0;
    this.render();
    return true;
  }

  private rotate(dir: 1 | -1): void {
    const a = this.active;
    if (!a || this.phase !== 'play' || this.isOver) return;
    if (PIECES[a.p].name === 'O') { this.sfx('rotate', { volume: 0.25 }); return; }
    const to = (a.rot + dir + 4) % 4;
    const table = PIECES[a.p].name === 'I' ? KICKS_I : KICKS;
    for (const [kx, ky] of table[`${a.rot}${to}`]) {
      if (this.fits(a.p, to, a.x + kx, a.y - ky)) {
        a.x += kx; a.y -= ky; a.rot = to;
        this.touchLock();
        this.sfx('rotate', { volume: 0.35 });
        this.render();
        return;
      }
    }
    this.sfx('bad', { volume: 0.25 });
  }

  private hardDrop(): void {
    const a = this.active;
    if (!a || this.phase !== 'play' || this.isOver) return;
    const y0 = a.y;
    while (this.fits(a.p, a.rot, a.x, a.y + 1)) a.y++;
    const n = a.y - y0;
    if (n > 0) this.addScore(n * 2);
    // falling trail
    for (const [cx, cy] of SHAPES[a.p][a.rot]) {
      const tr = this.add.rectangle(this.px(a.x + cx), (this.py(y0 + cy) + this.py(a.y + cy)) / 2, CELL - 10, Math.max(CELL, n * CELL), COLORS_FX[a.p], 0.25).setDepth(1);
      this.tweens.add({ targets: tr, alpha: 0, scaleX: 0.2, duration: 220, onComplete: () => tr.destroy() });
    }
    this.sfx('harddrop', { volume: 0.55 });
    shake(this, 0.004 + Math.min(0.006, n * 0.0004), 90);
    this.lock();
  }

  private hold(): void {
    const a = this.active;
    if (!a || this.phase !== 'play' || this.isOver || this.holdUsed) { if (this.holdUsed) this.sfx('bad', { volume: 0.25 }); return; }
    this.holdUsed = true;
    this.sfx('hold', { volume: 0.45 });
    const prev = this.holdP;
    this.holdP = a.p;
    this.active = null;
    if (prev >= 0) this.spawn(prev); else this.spawn();
    this.renderPreviews();
    burst(this, PANEL_X, 206, COLORS_FX[this.holdP], 10, 160);
  }

  private touchLock(): void {
    const a = this.active!;
    if (!this.fits(a.p, a.rot, a.x, a.y + 1) && this.lockResets < 15) { this.lockT = 0; this.lockResets++; }
  }

  private lock(): void {
    const a = this.active;
    if (!a) return;
    let above = true;
    for (const [cx, cy] of SHAPES[a.p][a.rot]) {
      const gx = a.x + cx, gy = a.y + cy;
      if (gy >= 0) this.grid[gy][gx] = a.p;
      if (gy >= HIDDEN) above = false;
    }
    this.active = null;
    this.holdUsed = false;
    this.sfx(Math.random() < 0.5 ? 'lock1' : 'lock2', { volume: 0.45 });
    this.renderBoard();
    this.render();
    // squash the freshly locked cells
    for (const [cx, cy] of SHAPES[a.p][a.rot]) {
      const gy = a.y + cy;
      if (gy < 0) continue;
      const im = this.cells[gy][a.x + cx];
      im.setTintFill(0xffffff);
      this.time.delayedCall(70, () => { const p = this.grid[gy]?.[a.x + cx]; if (p !== undefined && p >= 0 && !this.clearRows.includes(gy)) this.styleCell(im, p); });
    }
    if (above) { this.gameOver(); return; }

    const full: number[] = [];
    for (let y = 0; y < H; y++) if (this.grid[y].every((c) => c >= 0)) full.push(y);
    if (full.length) {
      this.clearRows = full;
      this.phase = 'clearing';
      this.phaseT = 0.28;
      for (const y of full) for (let x = 0; x < W; x++) {
        const im = this.cells[y][x];
        im.setTintFill(0xffffff);
        this.tweens.add({ targets: im, scaleX: 0, duration: 260, delay: Math.abs(x - 4.5) * 14, ease: 'Back.easeIn' });
      }
      this.scoreLines(full);
    } else {
      this.combo = -1;
      this.phase = 'spawn';
      this.phaseT = 0.05;
      this.checkDanger();
    }
  }

  private scoreLines(full: number[]): void {
    const n = full.length;
    this.combo++;
    const base = [0, 100, 300, 500, 800][n];
    const quad = n === 4;
    let pts = base * this.level;
    const b2b = quad && this.b2b;
    if (b2b) pts = Math.round(pts * 1.5);
    this.b2b = quad;
    if (this.combo > 0) pts += 50 * this.combo * this.level;
    const midY = this.py(full[Math.floor(n / 2)]);
    this.addScore(pts, BX + W * CELL / 2, midY - 40);
    const label = t(['', 'single', 'double', 'triple', 'tetris'][n]);
    const extra = b2b ? `\n${t('b2b')}` : this.combo > 0 ? `\n${t('combo')} x${this.combo}` : '';
    const msg = txt(this, BX + W * CELL / 2, midY + 20, label + extra, { title: true, size: quad ? 34 : 26, color: quad ? '#ffd23f' : '#3ee6ff' }).setDepth(50).setScale(0.3);
    this.tweens.add({ targets: msg, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: msg, alpha: 0, y: midY - 60, delay: 700, duration: 400, onComplete: () => msg.destroy() });
    for (const y of full) for (let x = 0; x < W; x += 2) burst(this, this.px(x), this.py(y), [COLORS_FX[this.grid[y][x]], 0xffffff], 6, 260);
    if (quad) { shake(this, 0.014, 260); flash(this, 0xffd23f, 160); this.sfx('tetris', { volume: 0.75, exact: true }); }
    else { shake(this, 0.004 * n, 140); this.sfx('line', { volume: 0.55, rate: 1 + (n - 1) * 0.12 }); }
    if (this.combo > 0) this.sfx('combo', { volume: 0.5, exact: true, rate: Math.min(1.5, 1 + this.combo * 0.07), delay: 0.18 });

    const before = this.level;
    this.lines += n;
    this.level = Math.floor(this.lines / 10) + 1;
    if (this.level > before) {
      this.time.delayedCall(350, () => {
        this.sfx('levelup', { volume: 0.65 });
        flash(this, 0x8b5cff, 200);
        popup(this, BX + W * CELL / 2, 520, t('levelUp'), '#ff4fa3', 30);
      });
      this.tweens.add({ targets: this.levelText, scale: 1.6, duration: 180, yoyo: true });
    }
    this.updateHud();
  }

  private collapse(): void {
    const rows = new Set(this.clearRows);
    const kept = this.grid.filter((_, y) => !rows.has(y));
    while (kept.length < H) kept.unshift(new Array(W).fill(-1));
    this.grid = kept;
    this.clearRows = [];
    for (const row of this.cells) for (const im of row) im.setScale((CELL - 2) / 32);
    this.renderBoard();
    this.checkDanger();
  }

  /** One warning beep when the stack first climbs near the top; re-arms once it is lower again. */
  private danger = false;
  private checkDanger(): void {
    const top = this.grid.findIndex((row) => row.some((c) => c >= 0));
    const height = top < 0 ? 0 : H - top;
    if (!this.danger && height >= H - HIDDEN - 4) { this.danger = true; this.sfx('danger', { volume: 0.4 }); }
    else if (this.danger && height <= H - HIDDEN - 7) this.danger = false;
  }

  private gameOver(): void {
    if (this.isOver) return;
    this.sfx('topout', { volume: 0.65 });
    shake(this, 0.02, 400);
    flash(this, 0xec3013, 200);
    // grey out the stack row by row
    for (let y = H - 1; y >= 0; y--) {
      this.time.delayedCall((H - y) * 25, () => { for (const im of this.cells[y]) if (im.visible) im.setTint(0x555566); });
    }
    this.endGame({ delay: 900 });
  }

  // ---------- rendering ----------

  private styleCell(im: Phaser.GameObjects.Image, p: number): void {
    const d = PIECES[p];
    im.setTexture(d.tex).setDisplaySize(CELL - 2, CELL - 2);
    if (d.tint) im.setTint(d.tint); else im.clearTint();
  }

  private renderBoard(): void {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = this.grid[y][x], im = this.cells[y][x];
      if (p < 0 || y < HIDDEN) { im.setVisible(false); continue; }
      im.setVisible(true);
      this.styleCell(im, p);
    }
  }

  private render(): void {
    const a = this.active;
    if (!a) {
      for (const im of [...this.pieceImgs, ...this.ghostImgs]) im.setVisible(false);
      return;
    }
    let gy = a.y;
    while (this.fits(a.p, a.rot, a.x, gy + 1)) gy++;
    SHAPES[a.p][a.rot].forEach(([cx, cy], i) => {
      const im = this.pieceImgs[i];
      this.styleCell(im, a.p);
      im.setPosition(this.px(a.x + cx), this.py(a.y + cy)).setVisible(a.y + cy >= HIDDEN);
      const gh = this.ghostImgs[i];
      this.styleCell(gh, a.p);
      gh.setPosition(this.px(a.x + cx), this.py(gy + cy)).setVisible(gy + cy >= HIDDEN && gy !== a.y);
    });
  }

  private drawMini(imgs: Phaser.GameObjects.Image[], p: number, cx: number, cy: number, size: number): void {
    const cells = SHAPES[p][0];
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    cells.forEach(([x, y], i) => {
      const im = imgs[i];
      this.styleCell(im, p);
      im.setDisplaySize(size - 2, size - 2).setVisible(true)
        .setPosition(cx + (x - Math.min(...xs) - (w - 1) / 2) * size, cy + (y - Math.min(...ys) - (h - 1) / 2) * size);
    });
  }

  private renderPreviews(): void {
    for (let i = 0; i < 3; i++) this.drawMini(this.nextImgs.slice(i * 4, i * 4 + 4), this.queue[i], PANEL_X, 384 + i * 116, i === 0 ? 38 : 30);
    if (this.holdP >= 0) {
      this.drawMini(this.holdImgs, this.holdP, PANEL_X, 206, 36);
      for (const im of this.holdImgs) im.setAlpha(this.holdUsed ? 0.4 : 1);
    }
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.levelText.setText(String(this.level));
    this.linesText.setText(String(this.lines));
  }

  private gravity(): number {
    return Math.max(0.03, Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1));
  }

  // ---------- loop ----------

  private repeat(act: Act, dt: number, isDown: boolean, fn: () => void, das: number, arr: number): void {
    if (!isDown) { this.held[act] = null; return; }
    let h = this.held[act];
    if (h === null) { this.held[act] = 0; fn(); return; }
    h += dt;
    for (let i = 0; h >= das && i < 20; i++) { fn(); h -= arr; }
    this.held[act] = h;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.phase === 'clearing') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.collapse(); this.phase = 'spawn'; this.phaseT = 0.08; }
      return;
    }
    if (this.phase === 'spawn') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'play'; this.spawn(); }
      return;
    }
    const a = this.active;
    if (!a) return;
    const k = this.keys;
    const leftDown = !!(k.left?.isDown || k.a?.isDown) || this.touchHeld.left;
    const rightDown = !!(k.right?.isDown || k.d?.isDown) || this.touchHeld.right;
    const downDown = !!(k.down?.isDown || k.s?.isDown) || this.touchHeld.down;
    this.repeat('left', dt, leftDown && !rightDown, () => this.shift(-1), 0.17, 0.05);
    this.repeat('right', dt, rightDown && !leftDown, () => this.shift(1), 0.17, 0.05);
    this.repeat('down', dt, downDown, () => { if (this.softDrop()) this.addScore(1); }, 0.0, 0.035);
    if (!this.active || this.phase !== 'play') return;

    const grounded = !this.fits(a.p, a.rot, a.x, a.y + 1);
    if (grounded) {
      this.lockT += dt;
      // pulse the piece while it is about to lock
      const k2 = 0.6 + 0.4 * Math.cos(this.lockT * 20);
      for (const im of this.pieceImgs) im.setAlpha(k2);
      if (this.lockT >= 0.5) { for (const im of this.pieceImgs) im.setAlpha(1); this.lock(); }
    } else {
      for (const im of this.pieceImgs) im.setAlpha(1);
      this.fallT += dt;
      const g = this.gravity();
      while (this.fallT >= g && this.fits(a.p, a.rot, a.x, a.y + 1)) { this.fallT -= g; a.y++; this.render(); }
      if (!this.fits(a.p, a.rot, a.x, a.y + 1)) this.fallT = 0;
    }
  }
}
