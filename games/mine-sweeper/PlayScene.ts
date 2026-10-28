import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, txt, t, rng, storage, COLORS } from '@core';

/** Frames in the onebit colored_transparent_packed sheet (16 px tiles, 48 per row). */
export const OB = { bomb: 477, flag: 401, heart: 519, hourglass: 615, spark: 564 };

const CELL = 80;
const TOP = 150;          // board area top
const BOTTOM = 1110;      // board area bottom
const PENALTY = 15;       // seconds lost per mine hit
const NUM_COLORS = ['', '#3ee6ff', '#5dff7a', '#ff5a5a', '#c38bff', '#ffa53a', '#2fe0c8', '#ffffff', '#aab0d0'];

interface Diff { cols: number; rows: number; mines: number; time: number; mult: number; grow: number }
const DIFFS: Diff[] = [
  { cols: 8, rows: 10, mines: 10, time: 180, mult: 1, grow: 1 },
  { cols: 8, rows: 12, mines: 16, time: 240, mult: 2, grow: 2 },
  { cols: 8, rows: 12, mines: 22, time: 300, mult: 3, grow: 2 },
];
const DIFF_KEYS = ['easy', 'medium', 'hard'];

/** Procedural tile textures (raised cover, opened floor, exploded floor). */
export function makeMineTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('ms-cover')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const S = CELL;
  g.fillStyle(0x1b1e3d).fillRect(0, 0, S, S);
  g.fillStyle(0x6a73c4).fillRect(2, 2, S - 4, S - 4);
  g.fillStyle(0x3b4188).fillRect(8, 8, S - 10, S - 10);
  g.fillStyle(0x4c54a6).fillRect(8, 8, S - 16, S - 16);
  g.fillStyle(0x8c95e8).fillRect(8, 8, 10, 4);
  g.generateTexture('ms-cover', S, S);
  g.clear();
  g.fillStyle(0x0b0c1a).fillRect(0, 0, S, S);
  g.fillStyle(0x1a1c33).fillRect(2, 2, S - 4, S - 4);
  g.generateTexture('ms-open', S, S);
  g.clear();
  g.fillStyle(0x2a0505).fillRect(0, 0, S, S);
  g.fillStyle(0xb3261e).fillRect(2, 2, S - 4, S - 4);
  g.fillStyle(0xec3013).fillRect(10, 10, S - 20, S - 20);
  g.generateTexture('ms-boom', S, S);
  g.destroy();
}

type Phase = 'select' | 'play' | 'between' | 'over';

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'select';
  private diff = 0;
  private level = 1;
  private cols = 8;
  private rows = 10;
  private mineCount = 10;
  private x0 = 0;
  private y0 = 0;
  private mines: boolean[] = [];
  private adj: number[] = [];
  private open: boolean[] = [];
  private flags: boolean[] = [];
  private blown: boolean[] = [];
  private covers: Phaser.GameObjects.Image[] = [];
  private icons: (Phaser.GameObjects.Image | null)[] = [];
  private nums: (Phaser.GameObjects.Text | null)[] = [];
  private boardLayer!: Phaser.GameObjects.Container;
  private selectLayer: Phaser.GameObjects.GameObject[] = [];
  private selectFocus = 0;
  private selectRing!: Phaser.GameObjects.Rectangle;
  private seeded = false;
  private timeLeft = 0;
  private boardTime = 0;
  private flagMode = false;
  private modeBtn!: Button;
  private cursor = 0;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private showCursor = false;
  private downCell = -1;
  private downX = 0;
  private downY = 0;
  private longPressed = false;
  private pressTimer?: Phaser.Time.TimerEvent;
  private timerText!: Phaser.GameObjects.Text;
  private mineText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private lastTick = 0;
  private stun = 0;

  createGame(): void {
    makeMineTextures(this);
    this.textures.get('ob').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.phase = 'select'; this.diff = 0; this.level = 1; this.seeded = false; this.flagMode = false;
    this.cursor = 0; this.showCursor = false; this.downCell = -1; this.longPressed = false; this.pressTimer = undefined;
    this.covers = []; this.icons = []; this.nums = []; this.selectLayer = []; this.lastTick = 0; this.stun = 0;
    this.timeLeft = 0; this.boardTime = 0;
    this.input.mouse?.disableContextMenu();

    this.boardLayer = this.add.container(0, 0).setDepth(2);
    this.cursorBox = this.add.rectangle(0, 0, CELL - 4, CELL - 4).setStrokeStyle(6, 0xffd23f).setDepth(8).setVisible(false);
    this.tweens.add({ targets: this.cursorBox, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });

    // timer + mines counter row
    this.add.image(70, 112, 'ob', OB.hourglass).setScale(3).setTint(0xffd23f).setDepth(9);
    this.timerText = txt(this, 100, 112, '0:00', { title: true, size: 26, color: '#ffd23f' }).setOrigin(0, 0.5).setDepth(9);
    this.add.image(470, 112, 'ob', OB.bomb).setScale(3).setDepth(9);
    this.mineText = txt(this, 500, 112, '0', { title: true, size: 26, color: '#ff5a5a' }).setOrigin(0, 0.5).setDepth(9);
    this.infoText = txt(this, 360, 1144, '', { size: 24, color: '#aab0d0' }).setDepth(9);

    this.modeBtn = new Button(this, 360, 1205, t('modeDig'), () => this.toggleMode(), { width: 420, height: 84, size: 24, color: 0x3b4188 });
    this.modeBtn.setDepth(9).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.downCell >= 0 && Phaser.Math.Distance.Between(p.x, p.y, this.downX, this.downY) > 36) this.cancelPress();
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.hud.setCenter('');
    this.updateHud();
    this.showSelect();
  }

  // ---------- difficulty select ----------

  private showSelect(): void {
    this.phase = 'select';
    this.timerText.setVisible(false); this.mineText.setVisible(false);
    const title = txt(this, 360, 260, t('chooseDiff'), { title: true, size: 32, color: '#ffd23f' }).setDepth(20);
    this.selectLayer.push(title);
    this.selectRing = this.add.rectangle(360, 0, 500, 150).setStrokeStyle(6, 0xffd23f).setDepth(19);
    this.selectLayer.push(this.selectRing);
    DIFFS.forEach((d, i) => {
      const y = 430 + i * 210;
      const b = new Button(this, 360, y, t(DIFF_KEYS[i]), () => this.pickDiff(i), {
        width: 440, height: 96, size: 30, color: [0x2fa84f, 0xd98a1a, COLORS.red][i],
      });
      b.setDepth(20);
      const best = storage.get<number>(`ms-best-${i}`, 0);
      const info = txt(this, 360, y + 78, `${d.cols}×${d.rows} · ${d.mines} ${t('mines')} · ${t('bestTime')}: ${best ? this.fmt(best) : t('none')}`, { size: 24, color: '#aab0d0' }).setDepth(20);
      b.setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: 320, delay: i * 90, ease: 'Back.easeOut' });
      this.selectLayer.push(b, info);
    });
    const hint = txt(this, 360, 1060, `${t('firstSafe')}\n${t('keysHint')}`, { size: 26, color: '#f3f2f2' }).setDepth(20);
    this.selectLayer.push(hint);
    this.selectFocus = 0;
    this.moveSelectRing();
  }

  private moveSelectRing(): void {
    this.selectRing.setY(430 + this.selectFocus * 210 + 22);
  }

  private pickDiff(i: number): void {
    if (this.phase !== 'select') return;
    this.diff = i;
    this.selectLayer.forEach((o) => o.destroy());
    this.selectLayer = [];
    this.timerText.setVisible(true); this.mineText.setVisible(true);
    this.modeBtn.setVisible(true);
    this.sfx('mode');
    this.buildBoard();
  }

  // ---------- board ----------

  private buildBoard(): void {
    const d = DIFFS[this.diff];
    this.boardLayer.removeAll(true);
    this.cols = d.cols; this.rows = d.rows;
    const n = this.cols * this.rows;
    this.mineCount = Math.min(Math.floor(n * 0.3), d.mines + (this.level - 1) * d.grow);
    this.timeLeft = Math.max(d.time * 0.55, d.time - (this.level - 1) * 10);
    this.boardTime = 0;
    this.seeded = false;
    this.stun = 0;
    this.mines = new Array(n).fill(false);
    this.adj = new Array(n).fill(0);
    this.open = new Array(n).fill(false);
    this.flags = new Array(n).fill(false);
    this.blown = new Array(n).fill(false);
    this.covers = []; this.icons = new Array(n).fill(null); this.nums = new Array(n).fill(null);
    this.x0 = 360 - (this.cols * CELL) / 2;
    this.y0 = Math.round((TOP + BOTTOM) / 2 - (this.rows * CELL) / 2);
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 0.5).fillRect(this.x0 - 14, this.y0 - 14, this.cols * CELL + 28, this.rows * CELL + 28);
    frame.lineStyle(6, 0x6a73c4, 1).strokeRect(this.x0 - 14, this.y0 - 14, this.cols * CELL + 28, this.rows * CELL + 28);
    this.boardLayer.add(frame);
    for (let i = 0; i < n; i++) {
      const { x, y } = this.cellPos(i);
      const img = this.add.image(x, y, 'ms-cover');
      img.setScale(0);
      this.tweens.add({ targets: img, scale: 1, duration: 260, delay: (i % this.cols + Math.floor(i / this.cols)) * 22, ease: 'Back.easeOut' });
      this.boardLayer.add(img);
      this.covers.push(img);
    }
    this.cursor = Math.floor(this.rows / 2) * this.cols + Math.floor(this.cols / 2);
    this.moveCursor();
    this.phase = 'play';
    this.infoText.setText(t('firstSafe'));
    this.updateHud();
  }

  private cellPos(i: number): { x: number; y: number } {
    return { x: this.x0 + (i % this.cols) * CELL + CELL / 2, y: this.y0 + Math.floor(i / this.cols) * CELL + CELL / 2 };
  }

  private cellAt(px: number, py: number): number {
    const c = Math.floor((px - this.x0) / CELL), r = Math.floor((py - this.y0) / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private neighbors(i: number): number[] {
    const r = Math.floor(i / this.cols), c = i % this.cols, out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < this.rows && cc < this.cols) out.push(rr * this.cols + cc);
    }
    return out;
  }

  /** Mines are placed on the first reveal, never on or around the first cell. */
  private seed(first: number): void {
    const n = this.cols * this.rows;
    const banned = new Set([first, ...this.neighbors(first)]);
    const pool = rng.shuffle([...Array(n).keys()].filter((i) => !banned.has(i)));
    pool.slice(0, this.mineCount).forEach((i) => (this.mines[i] = true));
    for (let i = 0; i < n; i++) this.adj[i] = this.neighbors(i).filter((j) => this.mines[j]).length;
    this.seeded = true;
    this.infoText.setText('');
  }

  // ---------- input ----------

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play') return;
    const i = this.cellAt(p.x, p.y);
    if (i < 0) return;
    if (p.rightButtonDown()) { this.toggleFlag(i); return; }
    this.downCell = i; this.downX = p.x; this.downY = p.y; this.longPressed = false;
    this.covers[i].setTint(0xc8ccff);
    this.pressTimer?.remove();
    this.pressTimer = this.time.delayedCall(380, () => {
      if (this.downCell !== i || this.phase !== 'play') return;
      this.longPressed = true;
      this.toggleFlag(i);
    });
  }

  private cancelPress(): void {
    if (this.downCell >= 0) this.covers[this.downCell]?.clearTint();
    this.downCell = -1;
    this.pressTimer?.remove();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const i = this.downCell;
    const long = this.longPressed;
    this.cancelPress();
    if (this.phase !== 'play' || i < 0 || long || p.rightButtonReleased()) return;
    if (this.cellAt(p.x, p.y) !== i) return;
    this.showCursor = false; this.cursor = i; this.moveCursor();
    if (this.flagMode && !this.open[i]) this.toggleFlag(i);
    else this.reveal(i);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase === 'select') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.pickDiff(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.pickDiff(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.pickDiff(2);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.selectFocus = (this.selectFocus + 2) % 3; this.moveSelectRing(); this.sfx('move', { volume: 0.4 }); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.selectFocus = (this.selectFocus + 1) % 3; this.moveSelectRing(); this.sfx('move', { volume: 0.4 }); }
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') this.pickDiff(this.selectFocus);
      return;
    }
    if (this.phase !== 'play') return;
    let r = Math.floor(this.cursor / this.cols), c = this.cursor % this.cols;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': c = (c + this.cols - 1) % this.cols; break;
      case 'ArrowRight': case 'KeyD': c = (c + 1) % this.cols; break;
      case 'ArrowUp': case 'KeyW': r = (r + this.rows - 1) % this.rows; break;
      case 'ArrowDown': case 'KeyS': r = (r + 1) % this.rows; break;
      case 'Space': case 'KeyZ': case 'Enter':
        this.showCursor = true; this.moveCursor(); this.reveal(this.cursor); return;
      case 'KeyX': case 'KeyF':
        this.showCursor = true; this.moveCursor(); this.toggleFlag(this.cursor); return;
      case 'KeyM': case 'Tab':
        e.preventDefault(); this.toggleMode(); return;
      default: return;
    }
    this.cursor = r * this.cols + c;
    this.showCursor = true;
    this.moveCursor();
    this.sfx('move', { volume: 0.25 });
  }

  private moveCursor(): void {
    const { x, y } = this.cellPos(this.cursor);
    this.cursorBox.setPosition(x, y).setVisible(this.showCursor && this.phase === 'play');
  }

  private toggleMode(): void {
    if (this.phase !== 'play') return;
    this.flagMode = !this.flagMode;
    this.modeBtn.setText(t(this.flagMode ? 'modeFlag' : 'modeDig'));
    this.sfx('mode');
    this.tweens.add({ targets: this.modeBtn, scale: { from: 1.12, to: 1 }, duration: 220, ease: 'Back.easeOut' });
  }

  // ---------- actions ----------

  private toggleFlag(i: number): void {
    if (this.phase !== 'play' || this.open[i]) return;
    this.flags[i] = !this.flags[i];
    const { x, y } = this.cellPos(i);
    if (this.flags[i]) {
      const f = this.add.image(x, y - 30, 'ob', OB.flag).setScale(3.4).setAlpha(0);
      this.boardLayer.add(f);
      this.icons[i] = f;
      this.tweens.add({ targets: f, y, alpha: 1, duration: 200, ease: 'Bounce.easeOut' });
      this.sfx('flag', { volume: 0.5 });
      burst(this, x, y, [0xec3013, 0xffffff], 6, 120);
    } else {
      const f = this.icons[i];
      this.icons[i] = null;
      if (f) this.tweens.add({ targets: f, scale: 0, duration: 150, onComplete: () => f.destroy() });
      this.sfx('unflag', { volume: 0.45 });
    }
    this.updateHud();
  }

  private reveal(i: number): void {
    if (this.phase !== 'play' || this.stun > 0) return;
    if (this.flags[i]) { this.sfx('nope', { volume: 0.35 }); return; }
    if (!this.seeded) this.seed(i);
    if (this.open[i]) { this.chord(i); return; }
    if (this.mines[i]) { this.explode(i); return; }
    this.flood([i]);
  }

  /** Opening a satisfied number opens all its unflagged neighbours. */
  private chord(i: number): void {
    if (this.blown[i] || this.adj[i] === 0) return;
    const nb = this.neighbors(i);
    const marked = nb.filter((j) => this.flags[j] || this.blown[j]).length;
    if (marked !== this.adj[i]) { this.sfx('nope', { volume: 0.3 }); this.tweens.add({ targets: this.nums[i], scale: { from: 1.3, to: 1 }, duration: 200 }); return; }
    const todo = nb.filter((j) => !this.open[j] && !this.flags[j]);
    const bad = todo.find((j) => this.mines[j]);
    if (bad !== undefined) { this.explode(bad); return; }
    if (todo.length) this.flood(todo);
  }

  private flood(start: number[]): void {
    const dist = new Map<number, number>();
    const q: number[] = [];
    for (const s of start) if (!this.open[s] && !this.mines[s]) { dist.set(s, 0); q.push(s); }
    while (q.length) {
      const c = q.shift()!;
      if (this.adj[c] !== 0) continue;
      for (const j of this.neighbors(c)) {
        if (dist.has(j) || this.open[j] || this.flags[j] || this.mines[j]) continue;
        dist.set(j, dist.get(c)! + 1);
        q.push(j);
      }
    }
    const d = DIFFS[this.diff];
    let gained = 0;
    for (const [j, k] of dist) {
      this.open[j] = true;
      gained += 5 * d.mult;
      const cover = this.covers[j];
      const { x, y } = this.cellPos(j);
      this.time.delayedCall(k * 35, () => {
        cover.setTexture('ms-open').clearTint().setScale(0.6);
        this.tweens.add({ targets: cover, scale: 1, duration: 160, ease: 'Back.easeOut' });
        if (this.adj[j] > 0) {
          const tx = this.add.text(x, y + 2, String(this.adj[j]), {
            fontFamily: '"Press Start 2P", monospace', fontSize: '32px', color: NUM_COLORS[this.adj[j]], stroke: '#000', strokeThickness: 5,
          }).setOrigin(0.5).setScale(0);
          this.boardLayer.add(tx);
          this.nums[j] = tx;
          this.tweens.add({ targets: tx, scale: 1, duration: 200, ease: 'Back.easeOut' });
        }
        if (dist.size > 6 && k % 3 === 0) burst(this, x, y, [0x6a73c4, 0x3ee6ff], 3, 90);
      });
    }
    if (dist.size > 1) this.sfx('flood', { volume: 0.5 });
    else this.sfx('dig', { volume: 0.5, detune: rng.int(-150, 150) });
    if (dist.size) {
      const first = this.cellPos(start[0]);
      this.addScore(gained, first.x, first.y - 30);
    }
    this.updateHud();
    if (this.checkWin()) this.boardClear();
  }

  private explode(i: number): void {
    const { x, y } = this.cellPos(i);
    this.open[i] = true;
    this.blown[i] = true;
    this.covers[i].setTexture('ms-boom').clearTint();
    const b = this.add.image(x, y, 'ob', OB.bomb).setScale(0);
    this.boardLayer.add(b);
    this.icons[i] = b;
    this.tweens.add({ targets: b, scale: 3.4, duration: 300, ease: 'Back.easeOut' });
    burst(this, x, y, [0xec3013, 0xffd23f, 0xffa53a, 0xffffff], 40, 420);
    shake(this, 0.022, 320);
    flash(this, 0xec3013, 160);
    this.sfx('boom', { volume: 0.6 });
    this.sfx('boom2', { volume: 0.45 });
    this.timeLeft = Math.max(0, this.timeLeft - PENALTY);
    popup(this, Phaser.Math.Clamp(x, 140, 580), Math.max(200, y - 40), t('penalty'), '#ff5a5a', 30);
    this.tweens.add({ targets: this.timerText, scale: { from: 1.5, to: 1 }, duration: 400, ease: 'Back.easeOut' });
    this.timerText.setColor('#ff5a5a');
    this.addScore(-25 * DIFFS[this.diff].mult);
    this.stun = 0.9;
    this.updateHud();
    if (this.timeLeft <= 0) this.timeUp();
    else if (this.checkWin()) this.boardClear();
  }

  private checkWin(): boolean {
    for (let i = 0; i < this.mines.length; i++) if (!this.mines[i] && !this.open[i]) return false;
    return true;
  }

  private boardClear(): void {
    this.phase = 'between';
    this.cursorBox.setVisible(false);
    const d = DIFFS[this.diff];
    const t0 = this.boardTime;
    const key = `ms-best-${this.diff}`;
    const prev = storage.get<number>(key, 0);
    const newBest = !prev || t0 < prev;
    if (newBest) storage.set(key, Math.round(t0 * 10) / 10);
    // flag the remaining mines
    this.mines.forEach((m, i) => {
      if (!m || this.flags[i] || this.blown[i]) return;
      const { x, y } = this.cellPos(i);
      const f = this.add.image(x, y, 'ob', OB.flag).setScale(0);
      this.boardLayer.add(f);
      this.tweens.add({ targets: f, scale: 3.4, duration: 250, delay: rng.int(0, 300), ease: 'Back.easeOut' });
    });
    const bonus = 250 * d.mult * this.level + Math.floor(this.timeLeft) * 2 * d.mult;
    this.time.delayedCall(350, () => {
      this.sfx('clear', { volume: 0.6 });
      flash(this, 0x5dff7a, 140);
      this.addScore(bonus, 360, 600);
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(120, 600), rng.int(300, 900), [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xff4fa3], 24, 380));
      const band = this.add.rectangle(360, 590, 720, 190, 0x000000, 0.75).setDepth(29).setScale(1, 0);
      this.tweens.add({ targets: band, scaleY: 1, duration: 200 });
      const msg = txt(this, 360, 560, t('cleared'), { title: true, size: 40, color: '#5dff7a' }).setDepth(30).setScale(0);
      this.tweens.add({ targets: msg, scale: 1, duration: 380, ease: 'Back.easeOut' });
      const sub = txt(this, 360, 640, `${t('time')}: ${this.fmt(t0)}${newBest ? '\n' + t('newBestTime') : ''}`, { title: true, size: 22, color: newBest ? '#ff4fa3' : '#ffd23f' }).setDepth(30);
      this.time.delayedCall(2200, () => {
        msg.destroy(); sub.destroy(); band.destroy();
        if (this.isOver) return;
        this.level++;
        this.buildBoard();
      });
    });
  }

  private timeUp(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.cursorBox.setVisible(false);
    this.sfx('boom', { volume: 0.6 });
    shake(this, 0.03, 500);
    const list = this.mines.map((m, i) => (m && !this.blown[i] ? i : -1)).filter((i) => i >= 0);
    list.forEach((i, k) => this.time.delayedCall(80 + k * 45, () => {
      const { x, y } = this.cellPos(i);
      this.covers[i].setTexture(this.flags[i] ? 'ms-open' : 'ms-boom');
      this.icons[i]?.destroy();
      const b = this.add.image(x, y, 'ob', OB.bomb).setScale(3.4);
      this.boardLayer.add(b);
      if (!this.flags[i]) burst(this, x, y, [0xec3013, 0xffd23f], 8, 200);
    }));
    this.add.rectangle(360, 600, 720, 140, 0x000000, 0.75).setDepth(29);
    const msg = txt(this, 360, 600, t('timeUp'), { title: true, size: 40, color: '#ec3013' }).setDepth(30).setScale(0);
    this.tweens.add({ targets: msg, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.endGame({ delay: 1600 + list.length * 45, title: t('timeUp') });
  }

  // ---------- loop + hud ----------

  updateGame(_time: number, delta: number): void {
    if (this.phase !== 'play' || !this.seeded) return;
    const dt = delta / 1000;
    this.stun = Math.max(0, this.stun - dt);
    this.boardTime += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick) {
      this.lastTick = Math.ceil(this.timeLeft);
      this.sfx('tick', { volume: 0.5 });
      this.tweens.add({ targets: this.timerText, scale: { from: 1.3, to: 1 }, duration: 250 });
    }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.updateHud(); this.timeUp(); return; }
    this.updateHud();
  }

  private fmt(s: number): string {
    const v = Math.max(0, Math.ceil(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }

  private updateHud(): void {
    this.hud.setCenter(this.phase === 'select' ? '' : `${t('field')} ${this.level}`);
    this.hud.setRight('');
    if (!this.timerText) return;
    this.timerText.setText(this.fmt(this.timeLeft));
    if (this.stun <= 0) this.timerText.setColor(this.timeLeft <= 10 && this.seeded ? '#ff5a5a' : '#ffd23f');
    const flagsUsed = this.flags.filter(Boolean).length + this.blown.filter(Boolean).length;
    this.mineText.setText(String(this.mineCount - flagsUsed));
  }
}
