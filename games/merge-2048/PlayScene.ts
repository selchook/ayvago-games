import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, t, txt, rng, COLORS, FONT_TITLE } from '@core';

type Dir = 'up' | 'down' | 'left' | 'right';
interface Tile { v: number; r: number; c: number; obj: Phaser.GameObjects.Container; dead?: boolean; merged?: boolean }

const N = 4, CELL = 150, GAP = 12;
const SIZE = N * CELL + (N + 1) * GAP;
const X0 = (720 - SIZE) / 2, Y0 = 330;
const PALETTE: Record<number, number> = {
  2: 0x5b6ee1, 4: 0x3ea6ff, 8: 0x2fc9b3, 16: 0x5dff7a, 32: 0xb6ff3e, 64: 0xffd23f, 128: 0xffa53a,
  256: 0xff6b3a, 512: 0xec3013, 1024: 0xff4fa3, 2048: 0x8b5cff,
};
const DARK_TEXT = new Set([16, 32, 64, 128]);
const UNDOS = 3;

export class PlayScene extends ArcadeScene {
  private grid: (Tile | null)[][] = [];
  private busy = false;
  private queued: Dir | null = null;
  private undoLeft = UNDOS;
  private snapshot: { vals: number[][]; score: number } | null = null;
  private reached = false;
  private overlayOpen = false;
  private maxTile = 2;
  private swipe: { x: number; y: number } | null = null;
  private undoTxt!: Phaser.GameObjects.Text;
  private maxTxt!: Phaser.GameObjects.Text;
  private layer!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;
  private gen = 0;

  createGame(): void {
    this.gen++;
    this.grid = Array.from({ length: N }, () => new Array<Tile | null>(N).fill(null));
    this.busy = false; this.queued = null; this.undoLeft = UNDOS; this.snapshot = null;
    this.reached = false; this.overlayOpen = false; this.maxTile = 2; this.swipe = null; this.overlay = undefined;
    this.makeTexture();

    // board
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(X0 + 6, Y0 + 10, SIZE, SIZE, 22);
    g.fillStyle(0x2b2540, 1).fillRoundedRect(X0, Y0, SIZE, SIZE, 22);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g.fillStyle(0x3a3354, 1).fillRoundedRect(this.cx(c) - CELL / 2, this.cy(r) - CELL / 2, CELL, CELL, 14);
    this.layer = this.add.container(0, 0);

    // top: max tile + undo
    this.add.rectangle(200, 200, 300, 120, 0x000000, 0.4).setStrokeStyle(3, 0xffffff, 0.25);
    txt(this, 200, 168, t('maxTile'), { title: true, size: 16, color: '#3ee6ff' });
    this.maxTxt = txt(this, 200, 218, '2', { title: true, size: 34, color: '#ffd23f' });
    const ub = this.add.container(520, 200);
    const ubg = this.add.rectangle(0, 0, 300, 120, COLORS.purple, 0.85).setStrokeStyle(4, 0x000000);
    const uic = this.add.image(-90, 0, 'icon-return').setDisplaySize(52, 52);
    this.undoTxt = txt(this, 30, 2, '', { title: true, size: 22, strokeThickness: 0, shadow: false });
    ub.add([ubg, uic, this.undoTxt]).setSize(300, 120).setInteractive({ useHandCursor: true });
    ub.on('pointerdown', () => ubg.setFillStyle(COLORS.purple, 0.5));
    ub.on('pointerout', () => ubg.setFillStyle(COLORS.purple, 0.85));
    ub.on('pointerup', () => { ubg.setFillStyle(COLORS.purple, 0.85); this.undo(); });
    this.updateUndo();
    txt(this, 360, Y0 + SIZE + 70, t('goal'), { title: true, size: 22, color: '#ff4fa3' });
    txt(this, 360, Y0 + SIZE + 130, t('hint'), { size: 30, color: '#d8c8ff', wrap: 640 });

    // input
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.swipe = { x: p.x, y: p.y }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.checkSwipe(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { this.checkSwipe(p); this.swipe = null; });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const m: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
      if (m[e.code]) this.move(m[e.code]);
      else if (e.code === 'KeyZ' || e.code === 'KeyU' || e.code === 'Backspace') this.undo();
    });

    this.spawn(); this.spawn();
  }

  private makeTexture(): void {
    if (this.textures.exists('m2-tile')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xb8b8b8).fillRoundedRect(0, 6, CELL, CELL - 6, 16);
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, CELL, CELL - 10, 16);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(10, 8, CELL - 20, 14, 7);
    g.generateTexture('m2-tile', CELL, CELL);
    g.destroy();
  }

  private cx(c: number): number { return X0 + GAP + c * (CELL + GAP) + CELL / 2; }
  private cy(r: number): number { return Y0 + GAP + r * (CELL + GAP) + CELL / 2; }

  private makeTile(r: number, c: number, v: number): Tile {
    const obj = this.add.container(this.cx(c), this.cy(r));
    const bg = this.add.image(0, 0, 'm2-tile');
    const label = this.add.text(0, -2, '', { fontFamily: FONT_TITLE, fontSize: '40px', color: '#fff' }).setOrigin(0.5);
    obj.add([bg, label]);
    this.layer.add(obj);
    const tile: Tile = { v, r, c, obj };
    this.paint(tile);
    return tile;
  }

  private paint(tile: Tile): void {
    const [bg, label] = tile.obj.list as [Phaser.GameObjects.Image, Phaser.GameObjects.Text];
    bg.setTint(PALETTE[tile.v] ?? 0xf3f2f2);
    const digits = String(tile.v).length;
    label.setText(String(tile.v)).setFontSize([0, 54, 50, 42, 32, 26, 22][digits] ?? 20)
      .setColor(DARK_TEXT.has(tile.v) || tile.v > 2048 ? '#201e1d' : '#ffffff')
      .setStroke(DARK_TEXT.has(tile.v) || tile.v > 2048 ? '#ffffff' : '#000000', 4);
  }

  private spawn(): void {
    const empty: Array<[number, number]> = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!this.grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = rng.pick(empty);
    const tile = this.makeTile(r, c, rng.chance(0.9) ? 2 : 4);
    this.grid[r][c] = tile;
    tile.obj.setScale(0);
    this.tweens.add({ targets: tile.obj, scale: 1, duration: 140, ease: 'Back.easeOut' });
  }

  private checkSwipe(p: Phaser.Input.Pointer): void {
    if (!this.swipe) return;
    const dx = p.x - this.swipe.x, dy = p.y - this.swipe.y;
    if (Math.hypot(dx, dy) < 50) return;
    this.swipe = null;
    this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  // ---------- moves ----------
  private lines(d: Dir): Array<Array<[number, number]>> {
    const out: Array<Array<[number, number]>> = [];
    for (let i = 0; i < N; i++) {
      const line: Array<[number, number]> = [];
      for (let j = 0; j < N; j++) {
        if (d === 'left') line.push([i, j]);
        else if (d === 'right') line.push([i, N - 1 - j]);
        else if (d === 'up') line.push([j, i]);
        else line.push([N - 1 - j, i]);
      }
      out.push(line);
    }
    return out;
  }

  private values(): number[][] {
    return this.grid.map((row) => row.map((tl) => tl?.v ?? 0));
  }

  private move(d: Dir): void {
    if (this.isOver || this.overlayOpen) return;
    if (this.busy) { this.queued = d; return; }
    const before = { vals: this.values(), score: this.score };
    const next: (Tile | null)[][] = Array.from({ length: N }, () => new Array<Tile | null>(N).fill(null));
    const moving: Tile[] = [];
    let moved = false, gained = 0;
    for (const line of this.lines(d)) {
      let slot = 0;
      let last: Tile | null = null;
      for (const [r, c] of line) {
        const tile = this.grid[r][c];
        if (!tile) continue;
        if (last && !last.merged && last.v === tile.v) {
          last.merged = true;
          last.v *= 2;
          gained += last.v;
          tile.dead = true;
          tile.r = last.r; tile.c = last.c;
          moving.push(tile);
          moved = true;
          continue;
        }
        const [nr, nc] = line[slot++];
        if (nr !== r || nc !== c) moved = true;
        tile.r = nr; tile.c = nc;
        next[nr][nc] = tile;
        moving.push(tile);
        last = tile;
      }
    }
    if (!moved) {
      for (const m of moving) m.merged = false;
      this.sfx('bump', { volume: 0.25 });
      return;
    }
    this.snapshot = before;
    this.grid = next;
    this.busy = true;
    this.sfx('slide', { volume: 0.35 });
    const gen = this.gen;
    for (const m of moving) this.tweens.add({ targets: m.obj, x: this.cx(m.c), y: this.cy(m.r), duration: 100, ease: 'Quad.easeOut' });
    this.time.delayedCall(110, () => {
      if (gen !== this.gen) return;
      let biggest = 0;
      for (const m of moving) {
        if (m.dead) { m.obj.destroy(); continue; }
        if (m.merged) {
          m.merged = false;
          this.paint(m);
          biggest = Math.max(biggest, m.v);
          this.tweens.add({ targets: m.obj, scale: 1.18, duration: 80, yoyo: true });
          burst(this, m.obj.x, m.obj.y, PALETTE[m.v] ?? 0xffffff, 10 + Math.min(30, Math.log2(m.v) * 2), 200 + Math.log2(m.v) * 15);
        }
      }
      if (gained) {
        this.addScore(gained, 360, Y0 - 30);
        this.sfx('merge', { volume: 0.45, detune: Math.min(1400, (Math.log2(biggest) - 2) * 120) });
        if (biggest >= 256) shake(this, 0.004 + Math.log2(biggest) * 0.0006, 140);
        if (biggest > this.maxTile) {
          this.maxTile = biggest;
          this.maxTxt.setText(String(biggest));
          this.tweens.add({ targets: this.maxTxt, scale: 1.4, duration: 120, yoyo: true });
          if (biggest >= 128) { this.sfx('level', { volume: 0.4 }); flash(this, PALETTE[biggest] ?? 0xffffff, 90); }
        }
      }
      this.spawn();
      this.busy = false;
      if (biggest >= 2048 && !this.reached) { this.reached = true; this.showWin(); return; }
      if (!this.canMove()) { this.noMoves(); return; }
      const q = this.queued;
      this.queued = null;
      if (q) this.move(q);
    });
  }

  private canMove(): boolean {
    const v = this.values();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!v[r][c]) return true;
      if (c < N - 1 && v[r][c] === v[r][c + 1]) return true;
      if (r < N - 1 && v[r][c] === v[r + 1][c]) return true;
    }
    return false;
  }

  private noMoves(): void {
    if (this.undoLeft > 0 && this.snapshot) {
      const m = txt(this, 360, Y0 + SIZE / 2, t('stuckUndo'), { title: true, size: 26, color: '#ffd23f', wrap: 600 }).setDepth(40);
      this.tweens.add({ targets: m, alpha: 0, delay: 1600, duration: 400, onComplete: () => m.destroy() });
      this.tweens.add({ targets: this.undoTxt, scale: 1.3, duration: 200, yoyo: true, repeat: 3 });
      this.sfx('bump', { volume: 0.5 });
      this.time.delayedCall(2600, () => { if (!this.canMove() && !this.isOver) this.finishNoMoves(); });
      return;
    }
    this.finishNoMoves();
  }

  private finishNoMoves(): void {
    const m = txt(this, 360, Y0 + SIZE / 2, t('noMoves'), { title: true, size: 40, color: '#ec3013' }).setDepth(40).setScale(0.3);
    this.tweens.add({ targets: m, scale: 1, duration: 300, ease: 'Back.easeOut' });
    shake(this, 0.012, 250);
    this.sfx('over', { volume: 0.5 });
    this.endGame({ win: this.reached, delay: 1300 });
  }

  private undo(): void {
    if (this.busy || this.isOver || this.overlayOpen || !this.snapshot || this.undoLeft <= 0) {
      if (!this.busy) this.sfx('bump', { volume: 0.3 });
      return;
    }
    this.undoLeft--;
    for (const row of this.grid) for (const tl of row) tl?.obj.destroy();
    const vals = this.snapshot.vals;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) this.grid[r][c] = vals[r][c] ? this.makeTile(r, c, vals[r][c]) : null;
    this.setScore(this.snapshot.score);
    this.snapshot = null;
    this.updateUndo();
    this.sfx('undo', { volume: 0.5 });
    this.layer.setAlpha(0.4);
    this.tweens.add({ targets: this.layer, alpha: 1, duration: 200 });
  }

  private updateUndo(): void {
    this.undoTxt.setText(`${t('undo')} ${this.undoLeft}`);
  }

  // ---------- 2048 reached ----------
  private showWin(): void {
    this.overlayOpen = true;
    this.sfx('win', { volume: 0.6 });
    flash(this, 0x8b5cff, 250);
    for (let i = 0; i < 8; i++) this.time.delayedCall(i * 100, () => burst(this, rng.int(80, 640), rng.int(300, 1000), [0xffd23f, 0x8b5cff, 0xff4fa3], 30, 420));
    const o = this.add.container(0, 0).setDepth(80);
    const dim = this.add.rectangle(0, 0, 720, 1280, 0x0e0d12, 0.75).setOrigin(0).setInteractive();
    const h = txt(this, 360, 420, t('made2048'), { title: true, size: 44, color: '#ffd23f', wrap: 640 });
    const s = txt(this, 360, 540, t('keepGoing'), { size: 32, wrap: 600 });
    const cont = new Button(this, 360, 700, t('continue'), () => this.closeWin(true), { color: COLORS.purple, width: 420 });
    const fin = new Button(this, 360, 840, t('finish'), () => this.closeWin(false), { color: COLORS.red, width: 420 });
    o.add([dim, h, s, cont, fin]);
    this.overlay = o;
    this.input.keyboard?.once('keydown-ENTER', () => this.closeWin(true));
  }

  private closeWin(keepPlaying: boolean): void {
    if (!this.overlayOpen) return;
    this.overlayOpen = false;
    this.overlay?.destroy();
    this.overlay = undefined;
    if (!keepPlaying) { this.endGame({ win: true, delay: 200 }); return; }
    if (!this.canMove()) this.noMoves();
  }

  updateGame(): void { /* turn-based */ }
}
