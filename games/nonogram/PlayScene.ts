import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, loc, upper, COLORS } from '@core';
import { PUZZLES, PALETTE } from './puzzles';

const EMPTY = 0, FILLED = 1, MARKED = 2, MISTAKE = 3;
type Mode = 'fill' | 'mark';

const TOP = 160;                 // top of the column-clue area
const AREA_W = 690;              // clues + grid must fit this width
const PENALTY = 10;              // seconds lost per wrong fill
const START_TIME = 60;
const ALLOWANCE: Record<number, number> = { 5: 90, 8: 150, 10: 240 };
const FILL_COLOR = 0x3ee6ff;
const CELL_BG = 0x2a2440;

/** Run lengths of filled cells in a line ([0] for an empty line). */
function clueOf(line: boolean[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

export class PlayScene extends ArcadeScene {
  private idx = 0;
  private n = 5;
  private cs = 80;
  private x0 = 0;
  private y0 = 0;
  private sol: boolean[][] = [];
  private state: number[][] = [];
  private rowDone: boolean[] = [];
  private colDone: boolean[] = [];
  private timeLeft = START_TIME;
  private lastWarn = 0;
  private mode: Mode = 'fill';
  private locked = true;
  private mistakes = 0;
  private cursor: [number, number] = [0, 0];
  private kbActive = false;
  private fillHeld = false;
  private drag: { action: 'fill' | 'mark' | 'unmark'; r0: number; c0: number; axis: 'r' | 'c' | null } | null = null;

  private boardObjs: Phaser.GameObjects.GameObject[] = [];
  private rects: Phaser.GameObjects.Rectangle[][] = [];
  private rowClues: Phaser.GameObjects.Text[] = [];
  private colClues: Phaser.GameObjects.Text[] = [];
  private marksG!: Phaser.GameObjects.Graphics;
  private linesG!: Phaser.GameObjects.Graphics;
  private bandR!: Phaser.GameObjects.Rectangle;
  private bandC!: Phaser.GameObjects.Rectangle;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private fillBtn!: Phaser.GameObjects.Container;
  private markBtn!: Phaser.GameObjects.Container;
  private flashRect!: Phaser.GameObjects.Rectangle;

  createGame(): void {
    this.idx = 0;
    this.timeLeft = START_TIME;
    this.lastWarn = 0;
    this.mode = 'fill';
    this.locked = true;
    this.kbActive = false;
    this.fillHeld = false;
    this.drag = null;
    this.boardObjs = [];
    this.rects = [];
    this.rowClues = [];
    this.colClues = [];

    const { width, height } = this.scale;
    this.titleText = txt(this, width / 2, 110, '', { title: true, size: 24, color: '#ffd23f' });
    this.infoText = txt(this, width / 2, 1010, '', { size: 30, color: '#f3f2f2' });
    this.bandR = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0.07).setOrigin(0).setDepth(2).setVisible(false);
    this.bandC = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0.07).setOrigin(0).setDepth(2).setVisible(false);
    this.linesG = this.add.graphics().setDepth(3);
    this.marksG = this.add.graphics().setDepth(4);
    this.cursorBox = this.add.rectangle(0, 0, 10, 10).setStrokeStyle(5, COLORS.magenta).setDepth(6).setVisible(false);
    this.tweens.add({ targets: this.cursorBox, alpha: 0.45, duration: 360, yoyo: true, repeat: -1 });

    this.fillBtn = this.modeButton(width / 2 - 160, height - 150, 'fill');
    this.markBtn = this.modeButton(width / 2 + 160, height - 150, 'mark');
    this.flashRect = this.add.rectangle(0, 0, width, height, 0xffffff, 0).setOrigin(0).setDepth(7000);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') this.fillHeld = false;
    });

    this.buildPuzzle();
  }

  // ---------------------------------------------------------------- UI pieces

  private modeButton(x: number, y: number, m: Mode): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(20);
    const shadow = this.add.rectangle(0, 8, 290, 110, 0x000000, 0.55);
    const face = this.add.rectangle(0, 0, 290, 110, 0x333344).setStrokeStyle(6, 0x000000);
    const icon = this.add.graphics();
    if (m === 'fill') icon.fillStyle(FILL_COLOR, 1).fillRoundedRect(-112, -24, 48, 48, 6);
    else icon.lineStyle(8, 0xf3f2f2, 1).lineBetween(-108, -20, -68, 20).lineBetween(-108, 20, -68, -20);
    const label = txt(this, 30, 2, t(m === 'fill' ? 'fill' : 'markMode'), { title: true, size: 24, strokeThickness: 0, shadow: false });
    c.add([shadow, face, icon, label]);
    c.setData('face', face);
    c.setSize(290, 118).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.setMode(m));
    return c;
  }

  private setMode(m: Mode, silent = false): void {
    this.mode = m;
    const on = (b: Phaser.GameObjects.Container, active: boolean) => {
      (b.getData('face') as Phaser.GameObjects.Rectangle).setFillStyle(active ? (b === this.fillBtn ? 0x1f7a8c : 0x8b5cff) : 0x333344).setStrokeStyle(6, active ? 0xffd23f : 0x000000);
      this.tweens.add({ targets: b, scale: active ? 1.06 : 0.94, duration: 140, ease: 'Back.easeOut' });
    };
    on(this.fillBtn, m === 'fill');
    on(this.markBtn, m === 'mark');
    if (!silent) this.sfx('toggle', { volume: 0.6 });
  }

  private flashLocal(color: number, alpha: number): void {
    this.flashRect.setFillStyle(color, 1).setAlpha(alpha);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 260 });
  }

  // ---------------------------------------------------------------- puzzle setup

  private buildPuzzle(): void {
    this.boardObjs.forEach((o) => o.destroy());
    this.boardObjs = [];
    this.rects = [];
    this.rowClues = [];
    this.colClues = [];
    this.marksG.clear().setAlpha(1);
    this.linesG.clear().setAlpha(1);
    this.drag = null;
    this.mistakes = 0;

    const P = PUZZLES[this.idx];
    const n = (this.n = P.rows.length);
    this.sol = P.rows.map((r) => [...r].map((c) => c !== '.'));
    this.state = this.sol.map((r) => r.map(() => EMPTY));
    this.rowDone = new Array(n).fill(false);
    this.colDone = new Array(n).fill(false);
    this.cursor = [Math.floor(n / 2), Math.floor(n / 2)];

    const rc = this.sol.map(clueOf);
    const cc = this.sol[0].map((_, x) => clueOf(this.sol.map((r) => r[x])));
    const font = n <= 5 ? 34 : n <= 8 ? 26 : 22;
    const step = n <= 5 ? 46 : n <= 8 ? 36 : 30;
    // Press Start 2P is monospaced: the widest row clue string sets the clue column width
    const maxChars = Math.max(3, ...rc.map((c) => c.join(' ').length));
    const maxC = Math.max(2, ...cc.map((c) => c.length));
    const clueW = maxChars * font + 30, clueH = maxC * step + 16;
    this.cs = Math.min(100, Math.floor((AREA_W - clueW) / n));
    this.x0 = Math.round((this.scale.width - (clueW + n * this.cs)) / 2 + clueW);
    this.y0 = TOP + clueH;
    const gw = n * this.cs;

    // clue panels
    const panel = this.add.graphics().setDepth(0);
    panel.fillStyle(0x000000, 0.35).fillRoundedRect(this.x0 - clueW - 6, this.y0 - 6, clueW, gw + 12, 12);
    panel.fillStyle(0x000000, 0.35).fillRoundedRect(this.x0 - 6, this.y0 - clueH - 6, gw + 12, clueH, 12);
    panel.fillStyle(0x000000, 0.6).fillRect(this.x0 - 4, this.y0 - 4, gw + 8, gw + 8);
    this.boardObjs.push(panel);

    for (let r = 0; r < n; r++) {
      this.rects.push([]);
      for (let c = 0; c < n; c++) {
        const rect = this.add.rectangle(this.x0 + c * this.cs + this.cs / 2, this.y0 + r * this.cs + this.cs / 2, this.cs - 2, this.cs - 2, CELL_BG).setDepth(1);
        rect.setScale(0);
        this.tweens.add({ targets: rect, scale: 1, duration: 220, delay: (r + c) * 18, ease: 'Back.easeOut' });
        this.rects[r].push(rect);
        this.boardObjs.push(rect);
      }
    }
    // grid lines: thin, thicker every 5
    const g = this.linesG;
    for (let i = 0; i <= n; i++) {
      const thick = i % 5 === 0;
      g.lineStyle(thick ? 4 : 1, thick ? 0xffd23f : 0x000000, thick ? 0.9 : 0.8);
      g.lineBetween(this.x0 + i * this.cs, this.y0, this.x0 + i * this.cs, this.y0 + gw);
      g.lineBetween(this.x0, this.y0 + i * this.cs, this.x0 + gw, this.y0 + i * this.cs);
    }

    rc.forEach((clue, r) => {
      const tx = txt(this, this.x0 - 14, this.y0 + r * this.cs + this.cs / 2, clue.join(' '), { title: true, size: font, strokeThickness: 4, shadow: false }).setOrigin(1, 0.5);
      this.rowClues.push(tx);
      this.boardObjs.push(tx);
    });
    cc.forEach((clue, c) => {
      const tx = txt(this, this.x0 + c * this.cs + this.cs / 2, this.y0 - 12, clue.join('\n'), { title: true, size: font, strokeThickness: 4, shadow: false }).setOrigin(0.5, 1);
      tx.setLineSpacing(step - font);
      this.colClues.push(tx);
      this.boardObjs.push(tx);
    });
    // empty lines ([0]) are complete from the start
    for (let i = 0; i < n; i++) {
      if (!this.sol[i].some(Boolean)) this.completeLine('r', i, true);
      if (!this.sol.some((row) => row[i])) this.completeLine('c', i, true);
    }

    this.bandR.setSize(gw, this.cs);
    this.bandC.setSize(this.cs, gw);
    this.titleText.setText(`${t('puzzle', { n: this.idx + 1, m: PUZZLES.length })}  ${n}x${n}`).setScale(0.4);
    this.tweens.add({ targets: this.titleText, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.timeLeft += ALLOWANCE[n] ?? 120;
    popup(this, this.scale.width - 140, 90, `+${ALLOWANCE[n] ?? 120}s`, '#5dff7a', 22);
    this.setMode(this.mode, true);
    this.refreshInfo();
    this.showTime();
    this.drawCursor();
    this.locked = true;
    this.time.delayedCall(400, () => { this.locked = false; });
    this.sfx('reveal', { volume: 0.5 });
  }

  // ---------------------------------------------------------------- input

  private cellAt(x: number, y: number): [number, number] | null {
    const c = Math.floor((x - this.x0) / this.cs), r = Math.floor((y - this.y0) / this.cs);
    if (r < 0 || c < 0 || r >= this.n || c >= this.n) return null;
    return [r, c];
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.locked || this.isOver) return;
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    const [r, c] = cell;
    this.kbActive = false;
    this.cursor = [r, c];
    const s = this.state[r][c];
    let action: 'fill' | 'mark' | 'unmark';
    if (this.mode === 'fill') {
      if (s !== EMPTY) { this.drawCursor(); return; }
      action = 'fill';
    } else {
      if (s === MARKED) action = 'unmark';
      else if (s === EMPTY) action = 'mark';
      else { this.drawCursor(); return; }
    }
    this.drag = { action, r0: r, c0: c, axis: null };
    this.apply(r, c, action);
    this.drawCursor();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drag || !p.isDown || this.locked) return;
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    let [r, c] = cell;
    const d = this.drag;
    if (!d.axis) {
      if (r === d.r0 && c === d.c0) return;
      d.axis = Math.abs(r - d.r0) >= Math.abs(c - d.c0) ? 'c' : 'r';
    }
    if (d.axis === 'r') r = d.r0; else c = d.c0;
    if (this.cursor[0] === r && this.cursor[1] === c) return;
    // fill every cell between the previous and the new position (fast drags skip cells)
    const [pr, pc] = this.cursor;
    const steps = Math.max(Math.abs(r - pr), Math.abs(c - pc));
    for (let i = 1; i <= steps && this.drag; i++) {
      const rr = pr + Math.sign(r - pr) * i, cc = pc + Math.sign(c - pc) * i;
      this.cursor = [rr, cc];
      this.apply(rr, cc, d.action);
    }
    this.drawCursor();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const k = e.code;
    const mv: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], KeyA: [0, -1], KeyD: [0, 1], KeyW: [-1, 0], KeyS: [1, 0] };
    if (k === 'Tab' || k === 'KeyM') {
      e.preventDefault();
      this.setMode(this.mode === 'fill' ? 'mark' : 'fill');
      return;
    }
    if (this.locked) return;
    if (mv[k]) {
      if (this.kbActive) {
        this.cursor = [Phaser.Math.Clamp(this.cursor[0] + mv[k][0], 0, this.n - 1), Phaser.Math.Clamp(this.cursor[1] + mv[k][1], 0, this.n - 1)];
        if (this.fillHeld && this.state[this.cursor[0]][this.cursor[1]] === EMPTY) this.apply(this.cursor[0], this.cursor[1], 'fill');
        else this.sfx('move', { volume: 0.25 });
      }
      this.kbActive = true;
    } else if (k === 'Space' || k === 'KeyZ' || k === 'Enter') {
      this.kbActive = true;
      this.fillHeld = true;
      const [r, c] = this.cursor;
      if (this.mode === 'mark') this.toggleMark(r, c);
      else if (this.state[r][c] === EMPTY) this.apply(r, c, 'fill');
    } else if (k === 'KeyX') {
      this.kbActive = true;
      this.toggleMark(...this.cursor);
    } else return;
    this.drawCursor();
  }

  private toggleMark(r: number, c: number): void {
    const s = this.state[r][c];
    if (s === EMPTY) this.apply(r, c, 'mark');
    else if (s === MARKED) this.apply(r, c, 'unmark');
  }

  private drawCursor(): void {
    const [r, c] = this.cursor;
    const show = !this.locked;
    this.bandR.setPosition(this.x0, this.y0 + r * this.cs).setVisible(show);
    this.bandC.setPosition(this.x0 + c * this.cs, this.y0).setVisible(show);
    this.rowClues.forEach((tx, i) => tx.setScale(i === r && show ? 1.12 : 1));
    this.colClues.forEach((tx, i) => tx.setScale(i === c && show ? 1.12 : 1));
    this.cursorBox.setPosition(this.x0 + c * this.cs + this.cs / 2, this.y0 + r * this.cs + this.cs / 2)
      .setSize(this.cs + 4, this.cs + 4).setVisible(this.kbActive && show);
  }

  // ---------------------------------------------------------------- rules

  private apply(r: number, c: number, action: 'fill' | 'mark' | 'unmark'): void {
    const s = this.state[r][c];
    const rect = this.rects[r][c];
    const cx = rect.x, cy = rect.y;
    if (action === 'mark') {
      if (s !== EMPTY) return;
      this.state[r][c] = MARKED;
      this.sfx('mark', { volume: 0.5 });
    } else if (action === 'unmark') {
      if (s !== MARKED) return;
      this.state[r][c] = EMPTY;
      this.sfx('mark', { volume: 0.35, rate: 0.8 });
    } else {
      if (s !== EMPTY) return;
      if (this.sol[r][c]) {
        this.state[r][c] = FILLED;
        rect.setFillStyle(FILL_COLOR);
        rect.setScale(0.6);
        this.tweens.add({ targets: rect, scale: 1, duration: 160, ease: 'Back.easeOut' });
        this.addScore(5);
        this.sfx('fill', { volume: 0.6 });
        this.checkLines(r, c);
      } else {
        this.state[r][c] = MISTAKE;
        this.mistakes++;
        this.drag = null;
        rect.setFillStyle(0x5a1020);
        this.timeLeft = Math.max(0, this.timeLeft - PENALTY);
        popup(this, cx, cy - 20, `-${PENALTY}s`, '#ec3013', 26);
        burst(this, cx, cy, COLORS.red, 14, 220);
        shake(this, 0.008, 160);
        this.flashLocal(COLORS.red, 0.22);
        this.sfx('wrong', { volume: 0.6 });
        this.tweens.add({ targets: rect, angle: 8, duration: 50, yoyo: true, repeat: 2 });
        this.refreshInfo();
      }
    }
    this.drawMarks();
  }

  private drawMarks(): void {
    const g = this.marksG.clear();
    const pad = this.cs * 0.28;
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) {
        const s = this.state[r][c];
        if (s !== MARKED && s !== MISTAKE) continue;
        const x = this.x0 + c * this.cs, y = this.y0 + r * this.cs;
        g.lineStyle(s === MISTAKE ? 6 : 4, s === MISTAKE ? 0xff4040 : 0x8a84a0, 1);
        g.lineBetween(x + pad, y + pad, x + this.cs - pad, y + this.cs - pad);
        g.lineBetween(x + pad, y + this.cs - pad, x + this.cs - pad, y + pad);
      }
    }
  }

  private checkLines(r: number, c: number): void {
    if (!this.rowDone[r] && this.sol[r].every((v, x) => !v || this.state[r][x] === FILLED)) this.completeLine('r', r);
    if (!this.colDone[c] && this.sol.every((row, y) => !row[c] || this.state[y][c] === FILLED)) this.completeLine('c', c);
    if (this.sol.every((row, y) => row.every((v, x) => !v || this.state[y][x] === FILLED))) this.solved();
  }

  /** Greys the clue, auto-crosses the rest of the line and rewards it. */
  private completeLine(axis: 'r' | 'c', i: number, quiet = false): void {
    if (axis === 'r') this.rowDone[i] = true; else this.colDone[i] = true;
    const clue = axis === 'r' ? this.rowClues[i] : this.colClues[i];
    clue.setColor('#5c5870');
    for (let j = 0; j < this.n; j++) {
      const [r, c] = axis === 'r' ? [i, j] : [j, i];
      if (this.state[r][c] === EMPTY) this.state[r][c] = MARKED;
    }
    this.drawMarks();
    if (quiet) return;
    this.addScore(20);
    this.sfx('line', { volume: 0.5 });
    for (let j = 0; j < this.n; j++) {
      const [r, c] = axis === 'r' ? [i, j] : [j, i];
      if (this.sol[r][c]) {
        const rect = this.rects[r][c];
        this.tweens.add({ targets: rect, scale: 1.15, duration: 90, delay: j * 25, yoyo: true });
      }
    }
    const rect = axis === 'r' ? this.rects[i][this.n - 1] : this.rects[this.n - 1][i];
    burst(this, rect.x, rect.y, [0xffd23f, FILL_COLOR], 10, 200);
  }

  private solved(): void {
    this.locked = true;
    this.drag = null;
    this.cursorBox.setVisible(false);
    this.bandR.setVisible(false);
    this.bandC.setVisible(false);
    const P = PUZZLES[this.idx];
    const n = this.n;
    const bonus = 100 * n + (this.mistakes === 0 ? 300 : 0);
    this.sfx('solved');
    this.flashLocal(0xffffff, 0.3);
    shake(this, 0.006, 200);

    // reveal the coloured picture
    this.tweens.add({ targets: [this.marksG, this.linesG], alpha: 0, duration: 300 });
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const rect = this.rects[r][c];
        const ch = P.rows[r][c];
        if (ch === '.') {
          this.tweens.add({ targets: rect, alpha: 0.15, duration: 300, delay: 100 });
          continue;
        }
        this.time.delayedCall(120 + (r * n + c) * 10, () => {
          rect.setFillStyle(PALETTE[ch] ?? FILL_COLOR);
          rect.setScale(1.25);
          this.tweens.add({ targets: rect, scale: 1, duration: 200, ease: 'Back.easeOut' });
        });
      }
    }
    const cx = this.x0 + (n * this.cs) / 2, cy = this.y0 + (n * this.cs) / 2;
    this.time.delayedCall(400, () => burst(this, cx, cy, Object.values(PALETTE), 40, 460));
    const name = txt(this, this.scale.width / 2, this.y0 + n * this.cs + 70, upper(loc(P.name)) + '!', { title: true, size: 40, color: '#5dff7a' }).setDepth(30).setScale(0);
    this.boardObjs.push(name);
    this.tweens.add({ targets: name, scale: 1, duration: 420, delay: 300, ease: 'Back.easeOut' });
    this.infoText.setText(this.mistakes === 0 ? t('perfect') : t('solved'));
    this.time.delayedCall(500, () => this.addScore(bonus, cx, cy));

    this.time.delayedCall(2400, () => {
      if (this.idx >= PUZZLES.length - 1) {
        const tb = Math.ceil(this.timeLeft) * 5;
        this.addScore(tb);
        this.endGame({ win: true, title: t('allDone'), delay: 200 });
        return;
      }
      this.idx++;
      this.buildPuzzle();
    });
  }

  private refreshInfo(): void {
    this.infoText.setText(`${t('mistakes')}: ${this.mistakes}`).setColor(this.mistakes ? '#ff8080' : '#f3f2f2');
  }

  private showTime(): number {
    const secs = Math.max(0, Math.ceil(this.timeLeft));
    this.hud.setRight(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    return secs;
  }

  updateGame(_time: number, delta: number): void {
    if (this.locked) return;
    this.timeLeft -= delta / 1000;
    const secs = this.showTime();
    if (secs <= 10 && secs > 0 && secs !== this.lastWarn) {
      this.lastWarn = secs;
      this.sfx('warn', { volume: 0.5 });
    }
    if (this.timeLeft <= 0) {
      this.locked = true;
      this.drag = null;
      // show the answer
      for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) {
        if (this.sol[r][c] && this.state[r][c] !== FILLED) this.rects[r][c].setFillStyle(0x8b5cff, 0.6);
      }
      shake(this, 0.012, 300);
      this.flashLocal(COLORS.red, 0.3);
      this.sfx('timeup');
      this.endGame({ title: t('timeUp'), delay: 1300 });
    }
  }
}
