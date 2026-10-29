import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, popup, txt, t, rng, storage, COLORS } from '@core';

const BOARD = 640;
const CY = 660;
const TEX = 128;
const SIZES = [3, 4, 5];
const BASE: Record<number, number> = { 3: 500, 4: 1500, 5: 3000 };
const PAR_MOVES: Record<number, number> = { 3: 40, 4: 120, 5: 260 };
const PAR_TIME: Record<number, number> = { 3: 60, 4: 180, 5: 420 };

export function makeTileTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('sp-tile')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.55).fillRoundedRect(2, 8, TEX - 4, TEX - 8, 16);
  g.fillStyle(0xffffff).fillRoundedRect(0, 0, TEX - 4, TEX - 10, 16);
  g.fillStyle(0xd8d8d8).fillRoundedRect(8, 8, TEX - 20, TEX - 26, 12);
  g.fillStyle(0xffffff, 0.9).fillRect(14, 12, TEX - 32, 6);
  g.generateTexture('sp-tile', TEX, TEX);
  g.destroy();
}

/** Rainbow colour of a tile by its solved position, so rows are easy to read. */
export function tileColor(index: number, n: number): number {
  const r = Math.floor(index / n), c = index % n;
  const hue = ((r / n) * 0.75 + (c / n) * 0.12) % 1;
  return Phaser.Display.Color.HSVToRGB(hue, 0.62, 0.95).color;
}

interface Tile { c: Phaser.GameObjects.Container; img: Phaser.GameObjects.Image; value: number }
type Phase = 'select' | 'play' | 'between';

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'select';
  private n = 3;
  private startSize = 3;
  private puzzle = 1;
  private grid: number[] = [];          // grid[pos] = value (0 = gap)
  private tiles = new Map<number, Tile>();
  private cell = 100;
  private x0 = 0;
  private y0 = 0;
  private moves = 0;
  private puzzleTime = 0;
  private selectLayer: Phaser.GameObjects.GameObject[] = [];
  private selectFocus = 0;
  private selectRing!: Phaser.GameObjects.Rectangle;
  private frame!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private downX = 0;
  private downY = 0;
  private downPos = -1;

  createGame(): void {
    makeTileTexture(this);
    this.phase = 'select'; this.n = 3; this.startSize = 3; this.puzzle = 1; this.grid = []; this.tiles = new Map();
    this.moves = 0; this.puzzleTime = 0; this.selectLayer = []; this.selectFocus = 0; this.downPos = -1;
    this.frame = this.add.graphics();
    this.timeText = txt(this, 360, 118, '', { title: true, size: 24, color: '#ffd23f' });
    this.infoText = txt(this, 360, 1060, '', { size: 28, color: '#aab0d0' });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'play') return;
      this.downX = p.x; this.downY = p.y;
      this.downPos = this.posAt(p.x, p.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.updateHud();
    this.showSelect();
  }

  // ---------- size select ----------

  private showSelect(): void {
    this.phase = 'select';
    this.timeText.setText('');
    this.infoText.setText('');
    this.selectLayer.push(txt(this, 360, 250, t('chooseSize'), { title: true, size: 34, color: '#ffd23f' }));
    this.selectRing = this.add.rectangle(360, 0, 500, 160).setStrokeStyle(6, 0xffd23f);
    this.selectLayer.push(this.selectRing);
    SIZES.forEach((n, i) => {
      const y = 420 + i * 210;
      const b = new Button(this, 360, y, `${n}×${n}`, () => this.pick(i), { width: 440, height: 100, size: 36, color: [0x2fa84f, 0xd98a1a, COLORS.red][i] });
      const bm = storage.get<number>(`sp-moves-${n}`, 0), bt = storage.get<number>(`sp-time-${n}`, 0);
      const info = txt(this, 360, y + 82, `${t('bestMoves')}: ${bm || t('none')} · ${t('bestTime')}: ${bt ? this.fmt(bt) : t('none')}`, { size: 24, color: '#aab0d0' });
      b.setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: 300, delay: i * 80, ease: 'Back.easeOut' });
      this.selectLayer.push(b, info);
    });
    this.selectLayer.push(txt(this, 360, 1060, `${t('runInfo')}\n${t('keysHint')}`, { size: 26 }));
    this.selectFocus = 0;
    this.selectRing.setY(420 + 24);
  }

  private pick(i: number): void {
    if (this.phase !== 'select') return;
    this.selectLayer.forEach((o) => o.destroy());
    this.selectLayer = [];
    this.startSize = SIZES[i];
    this.n = SIZES[i];
    this.puzzle = 1;
    this.sfx('pick', { volume: 0.6 });
    this.buildPuzzle();
  }

  // ---------- puzzle ----------

  private buildPuzzle(): void {
    this.tiles.forEach((tl) => tl.c.destroy());
    this.tiles.clear();
    const n = this.n;
    this.cell = BOARD / n;
    this.x0 = 360 - BOARD / 2;
    this.y0 = CY - BOARD / 2;
    this.frame.clear();
    this.frame.fillStyle(0x000000, 0.55).fillRoundedRect(this.x0 - 18, this.y0 - 18, BOARD + 36, BOARD + 36, 20);
    this.frame.lineStyle(6, 0x3ee6ff, 0.9).strokeRoundedRect(this.x0 - 18, this.y0 - 18, BOARD + 36, BOARD + 36, 20);
    this.frame.fillStyle(0xffffff, 0.04);
    for (let p = 0; p < n * n; p++) this.frame.fillRoundedRect(this.x0 + (p % n) * this.cell + 4, this.y0 + Math.floor(p / n) * this.cell + 4, this.cell - 8, this.cell - 8, 10);

    // solvable shuffle: a long random walk of the gap from the solved state
    this.grid = [...Array(n * n).keys()].map((i) => (i + 1) % (n * n));
    let gap = n * n - 1, prev = -1;
    const steps = { 3: 90, 4: 260, 5: 520 }[n] ?? 200;
    for (let s = 0; s < steps || this.isSolved(); s++) {
      const opts = this.adjacent(gap).filter((q) => q !== prev);
      const q = rng.pick(opts);
      this.grid[gap] = this.grid[q]; this.grid[q] = 0;
      prev = gap; gap = q;
    }
    this.grid.forEach((v, pos) => {
      if (!v) return;
      const { x, y } = this.posXY(pos);
      const c = this.add.container(x, y).setDepth(5);
      const img = this.add.image(0, 0, 'sp-tile').setDisplaySize(this.cell - 6, this.cell - 6).setTint(tileColor(v - 1, n));
      const label = this.add.text(0, 2, String(v), {
        fontFamily: '"Press Start 2P", monospace', fontSize: `${Math.round(this.cell * 0.32)}px`, color: '#ffffff', stroke: '#000000', strokeThickness: 7,
      }).setOrigin(0.5);
      c.add([img, label]);
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 260, delay: pos * 18, ease: 'Back.easeOut' });
      this.tiles.set(v, { c, img, value: v });
    });
    this.sfx('shuffle', { volume: 0.5 });
    this.moves = 0;
    this.puzzleTime = 0;
    this.phase = 'play';
    this.refreshCorrect();
    this.updateHud();
  }

  private adjacent(pos: number): number[] {
    const n = this.n, r = Math.floor(pos / n), c = pos % n, out: number[] = [];
    if (r > 0) out.push(pos - n);
    if (r < n - 1) out.push(pos + n);
    if (c > 0) out.push(pos - 1);
    if (c < n - 1) out.push(pos + 1);
    return out;
  }

  private posXY(pos: number): { x: number; y: number } {
    return { x: this.x0 + (pos % this.n) * this.cell + this.cell / 2, y: this.y0 + Math.floor(pos / this.n) * this.cell + this.cell / 2 };
  }

  private posAt(px: number, py: number): number {
    const c = Math.floor((px - this.x0) / this.cell), r = Math.floor((py - this.y0) / this.cell);
    if (c < 0 || r < 0 || c >= this.n || r >= this.n) return -1;
    return r * this.n + c;
  }

  private isSolved(): boolean {
    const L = this.grid.length;
    for (let i = 0; i < L - 1; i++) if (this.grid[i] !== i + 1) return false;
    return true;
  }

  // ---------- input ----------

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play' || this.downPos < 0) return;
    const dx = p.x - this.downX, dy = p.y - this.downY;
    const from = this.downPos;
    this.downPos = -1;
    if (Math.hypot(dx, dy) > 40) {
      // swipe: push the tile next to the gap in the swipe direction
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.push(dir);
    } else this.tapTile(from);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase === 'select') {
      const pickKey = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (pickKey >= 0) { this.pick(pickKey); return; }
      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowDown' || e.code === 'KeyS') {
        this.selectFocus = (this.selectFocus + (e.code === 'ArrowUp' || e.code === 'KeyW' ? 2 : 1)) % 3;
        this.selectRing.setY(420 + this.selectFocus * 210 + 24);
        this.sfx('move', { volume: 0.4 });
      } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') this.pick(this.selectFocus);
      return;
    }
    if (this.phase !== 'play') return;
    const map: Record<string, string> = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    };
    if (map[e.code]) this.push(map[e.code]);
  }

  /** Moves the tile that sits on the opposite side of the gap in direction `dir`. */
  private push(dir: string): void {
    const n = this.n, gap = this.grid.indexOf(0), r = Math.floor(gap / n), c = gap % n;
    let src = -1;
    if (dir === 'left' && c < n - 1) src = gap + 1;
    if (dir === 'right' && c > 0) src = gap - 1;
    if (dir === 'up' && r < n - 1) src = gap + n;
    if (dir === 'down' && r > 0) src = gap - n;
    if (src < 0) { this.bump(); return; }
    this.slide([src]);
  }

  /** Tapping a tile in the gap's row or column slides the whole line toward the gap. */
  private tapTile(pos: number): void {
    if (pos < 0) return;
    const n = this.n, gap = this.grid.indexOf(0);
    if (pos === gap) return;
    const pr = Math.floor(pos / n), pc = pos % n, gr = Math.floor(gap / n), gc = gap % n;
    if (pr !== gr && pc !== gc) { this.bump(pos); return; }
    const step = pr === gr ? (pc > gc ? 1 : -1) : (pr > gr ? n : -n);
    const chain: number[] = [];
    for (let q = gap + step; ; q += step) { chain.push(q); if (q === pos) break; }
    this.slide(chain);
  }

  /** chain[0] is next to the gap; each tile moves one step toward the gap, in order. */
  private slide(chain: number[]): void {
    let gap = this.grid.indexOf(0);
    for (const q of chain) {
      const v = this.grid[q];
      this.grid[gap] = v; this.grid[q] = 0;
      const tl = this.tiles.get(v)!;
      const { x, y } = this.posXY(gap);
      this.tweens.killTweensOf(tl.c);
      tl.c.setScale(1);
      this.tweens.add({ targets: tl.c, x, y, duration: 110, ease: 'Cubic.easeOut' });
      gap = q;
      this.moves++;
    }
    this.sfx(rng.pick(['slide1', 'slide2']), { volume: 0.45 });
    this.refreshCorrect();
    this.updateHud();
    if (this.isSolved()) this.solved();
  }

  private bump(pos = -1): void {
    this.sfx('bump', { volume: 0.35 });
    const tl = pos >= 0 ? this.tiles.get(this.grid[pos]) : undefined;
    if (tl) this.tweens.add({ targets: tl.c, angle: { from: -6, to: 0 }, duration: 160, ease: 'Back.easeOut' });
  }

  private refreshCorrect(): void {
    let gained = false;
    this.grid.forEach((v, pos) => {
      if (!v) return;
      const tl = this.tiles.get(v)!;
      const ok = v === pos + 1;
      if (ok && !tl.c.getData('ok') && this.moves > 0) {
        const { x, y } = this.posXY(pos);
        this.time.delayedCall(110, () => burst(this, x, y, [tileColor(v - 1, this.n), 0xffffff], 6, 120));
        gained = true;
      }
      tl.c.setData('ok', ok);
      tl.img.setAlpha(ok ? 1 : 0.72);
    });
    if (gained && !this.isSolved()) this.time.delayedCall(110, () => this.sfx('correct', { volume: 0.3 }));
  }

  private solved(): void {
    this.phase = 'between';
    const n = this.n, moves = this.moves, secs = this.puzzleTime;
    const mk = `sp-moves-${n}`, tk = `sp-time-${n}`;
    const bm = storage.get<number>(mk, 0), bt = storage.get<number>(tk, 0);
    const record = !bm || moves < bm || !bt || secs < bt;
    if (!bm || moves < bm) storage.set(mk, moves);
    if (!bt || secs < bt) storage.set(tk, Math.round(secs));
    const eff = Phaser.Math.Clamp((PAR_MOVES[n] * 2) / (moves + PAR_MOVES[n]), 0.3, 1.5);
    const pts = Math.round(BASE[n] * eff + Math.max(0, PAR_TIME[n] - secs) * 5 * (n - 2));

    // drop in the missing last tile and celebrate
    const last = n * n;
    const { x, y } = this.posXY(last - 1);
    const c = this.add.container(x, y - 200).setDepth(6).setAlpha(0);
    c.add(this.add.image(0, 0, 'sp-tile').setDisplaySize(this.cell - 6, this.cell - 6).setTint(tileColor(last - 1, n)));
    c.add(this.add.text(0, 2, String(last), { fontFamily: '"Press Start 2P", monospace', fontSize: `${Math.round(this.cell * 0.32)}px`, color: '#fff', stroke: '#000', strokeThickness: 7 }).setOrigin(0.5));
    this.tiles.set(last, { c, img: c.list[0] as Phaser.GameObjects.Image, value: last });
    this.tweens.add({ targets: c, y, alpha: 1, duration: 380, delay: 150, ease: 'Bounce.easeOut', onComplete: () => { this.sfx('place', { volume: 0.6 }); shake(this, 0.008, 120); } });
    this.time.delayedCall(600, () => {
      this.sfx('solved', { volume: 0.7, exact: true });
      softFlash(this, 0x5dff7a);
      let k = 0;
      this.tiles.forEach((tl) => {
        const d = k++ * 25;
        this.tweens.add({ targets: tl.c, scale: 1.12, duration: 140, yoyo: true, delay: d });
        this.time.delayedCall(d, () => burst(this, tl.c.x, tl.c.y, [0xffd23f, 0xffffff, 0x3ee6ff], 4, 160));
      });
      this.addScore(pts, 360, CY);
      const done = n === 5;
      const msg = txt(this, 360, CY - 40, done ? t('allSolved') : t('solved'), { title: true, size: 40, color: '#5dff7a' }).setDepth(30).setScale(0);
      const band = this.add.rectangle(360, CY, 720, 220, 0x000000, 0.75).setDepth(29);
      this.tweens.add({ targets: msg, scale: 1, duration: 360, ease: 'Back.easeOut' });
      const sub = txt(this, 360, CY + 40, `${t('moves')}: ${moves} · ${t('time')}: ${this.fmt(secs)}${record ? '  ' + t('record') : ''}${done ? '' : '\n' + t('nextSize', { n: `${n + 1}×${n + 1}` })}`,
        { size: 28, color: record ? '#ff4fa3' : '#ffd23f' }).setDepth(30);
      if (record) { popup(this, 360, CY - 140, t('record'), '#ff4fa3', 26); this.time.delayedCall(450, () => this.sfx('record', { volume: 0.5, exact: true })); }
      if (done) { this.endGame({ win: true, delay: 2600, title: t('allSolved') }); return; }
      this.time.delayedCall(2800, () => {
        msg.destroy(); sub.destroy(); band.destroy();
        if (this.isOver) return;
        this.n++;
        this.puzzle++;
        this.buildPuzzle();
      });
    });
  }

  // ---------- loop + hud ----------

  updateGame(_time: number, delta: number): void {
    if (this.phase !== 'play') return;
    this.puzzleTime += delta / 1000;
    this.timeText.setText(`${t('time')} ${this.fmt(this.puzzleTime)}`);
  }

  private fmt(s: number): string {
    const v = Math.max(0, Math.floor(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }

  private updateHud(): void {
    if (this.phase === 'select') { this.hud.setCenter(''); return; }
    this.hud.setCenter(`${t('moves')} ${this.moves}`);
    const bm = storage.get<number>(`sp-moves-${this.n}`, 0);
    this.infoText.setText(`${t('puzzle')} ${this.puzzle} · ${this.n}×${this.n} · ${t('best')}: ${bm || t('none')}`);
  }
}

/** Semi-transparent screen flash (the camera flash starts fully opaque). */
function softFlash(scene: Phaser.Scene, color: number, alpha = 0.35, ms = 220): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, alpha).setOrigin(0).setDepth(7000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}
