import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, txt, t, COLORS, storage } from '@core';
import { generate, rowOf, colOf, boxOf, candidates, popcount } from './generator';

const CELL = 78;
const X0 = (720 - CELL * 9) / 2;   // 9
const Y0 = 168;
const MAX_MISTAKES = 3;
const HINTS = 3;

interface Diff { key: string; givens: number; base: number; par: number; mult: number; color: number }
const DIFFS: Diff[] = [
  { key: 'easy', givens: 38, base: 300, par: 360, mult: 1, color: 0x2fa84f },
  { key: 'medium', givens: 32, base: 600, par: 540, mult: 2, color: 0x2f7fd9 },
  { key: 'hard', givens: 27, base: 1000, par: 780, mult: 3, color: 0xd98a1a },
  { key: 'expert', givens: 24, base: 1600, par: 1020, mult: 4, color: COLORS.red },
];

const C = {
  cell: 0x1b1e3a, cellAlt: 0x20244a, peer: 0x2b3266, same: 0x45509c, sel: 0x6b4fd0, line: 0x6a73c4, thick: 0xd8dcff,
};

interface PadKey { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; sub?: Phaser.GameObjects.Text }

type Phase = 'select' | 'play' | 'between';

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'select';
  private diff = 0;
  private puzzleNo = 1;
  private grid: number[] = [];
  private given: boolean[] = [];
  private hinted: boolean[] = [];
  private solution: number[] = [];
  private notes: number[] = [];
  private sel = 40;
  private notesMode = false;
  private mistakes = 0;
  private hintsLeft = HINTS;
  private hintsUsed = 0;
  private puzzleTime = 0;
  private lastSec = -1;

  private cellBg!: Phaser.GameObjects.Graphics;
  private selBox!: Phaser.GameObjects.Rectangle;
  private digits: Phaser.GameObjects.Text[] = [];
  private noteTexts: Phaser.GameObjects.Text[] = [];
  private pad: PadKey[] = [];
  private notesKey!: PadKey;
  private eraseKey!: PadKey;
  private hintKey!: PadKey;
  private timerText!: Phaser.GameObjects.Text;
  private mistakeText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private gameLayer: Phaser.GameObjects.GameObject[] = [];
  private selectLayer: Phaser.GameObjects.GameObject[] = [];
  private selectFocus = 0;
  private selectRing!: Phaser.GameObjects.Rectangle;

  createGame(): void {
    this.phase = 'select'; this.diff = 0; this.puzzleNo = 1; this.sel = 40; this.notesMode = false;
    this.mistakes = 0; this.hintsLeft = HINTS; this.hintsUsed = 0; this.puzzleTime = 0; this.lastSec = -1;
    this.grid = []; this.given = []; this.hinted = []; this.solution = []; this.notes = [];
    this.digits = []; this.noteTexts = []; this.pad = []; this.gameLayer = []; this.selectLayer = []; this.selectFocus = 0;

    this.buildBoard();
    this.buildPad();
    this.setGameVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.hud.setRight('');
    this.hud.setCenter('');
    this.showSelect();
  }

  // ---------------------------------------------------------------- difficulty select

  private showSelect(): void {
    this.phase = 'select';
    const title = txt(this, 360, 230, t('chooseDiff'), { title: true, size: 30, color: '#ffd23f' });
    this.selectLayer.push(title);
    this.selectRing = this.add.rectangle(360, 0, 500, 124).setStrokeStyle(6, 0xffd23f).setDepth(5);
    this.tweens.add({ targets: this.selectRing, alpha: 0.45, duration: 450, yoyo: true, repeat: -1 });
    this.selectLayer.push(this.selectRing);
    DIFFS.forEach((d, i) => {
      const y = 380 + i * 180;
      const b = new Button(this, 360, y, t(d.key), () => this.pickDiff(i), { width: 460, height: 100, size: 30, color: d.color });
      b.setDepth(6).setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: 320, delay: i * 80, ease: 'Back.easeOut' });
      const best = storage.get<number>(`sudoku-time-${i}`, 0);
      const info = txt(this, 360, y + 74, `${d.givens} ${t('clues')} · ${t('bestTime')}: ${best ? this.fmt(best) : '-'}`, { size: 24, color: '#aab0d0' });
      this.selectLayer.push(b, info);
    });
    const note = txt(this, 360, 1110, `${t('runInfo')}\n${t('keysSelect')}`, { size: 26, color: '#f3f2f2', wrap: 640 });
    this.selectLayer.push(note);
    this.moveRing();
  }

  private moveRing(): void {
    this.selectRing.setY(380 + this.selectFocus * 180 + 3);
  }

  private pickDiff(i: number): void {
    if (this.phase !== 'select') return;
    this.diff = i;
    this.selectLayer.forEach((o) => o.destroy());
    this.selectLayer = [];
    this.sfx('start', { volume: 0.6 });
    this.setGameVisible(true);
    this.newPuzzle();
  }

  // ---------------------------------------------------------------- board

  private buildBoard(): void {
    this.cellBg = this.add.graphics().setDepth(1);
    const lines = this.add.graphics().setDepth(3);
    for (let k = 0; k <= 9; k++) {
      const thick = k % 3 === 0;
      lines.lineStyle(thick ? 5 : 2, thick ? C.thick : C.line, thick ? 1 : 0.55);
      lines.lineBetween(X0 + k * CELL, Y0, X0 + k * CELL, Y0 + 9 * CELL);
      lines.lineBetween(X0, Y0 + k * CELL, X0 + 9 * CELL, Y0 + k * CELL);
    }
    this.gameLayer.push(this.cellBg, lines);
    this.selBox = this.add.rectangle(0, 0, CELL - 4, CELL - 4).setStrokeStyle(5, 0xffd23f).setDepth(4);
    this.tweens.add({ targets: this.selBox, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
    this.gameLayer.push(this.selBox);
    for (let i = 0; i < 81; i++) {
      const { x, y } = this.cellPos(i);
      const d = this.add.text(x, y + 3, '', {
        fontFamily: '"Press Start 2P", monospace', fontSize: '38px', color: '#f3f2f2',
      }).setOrigin(0.5).setDepth(5);
      const n = this.add.text(x, y + 1, '', {
        fontFamily: '"Press Start 2P", monospace', fontSize: '13px', color: '#9fb4ff', align: 'center', lineSpacing: 9,
      }).setOrigin(0.5).setDepth(5);
      this.digits.push(d); this.noteTexts.push(n);
      this.gameLayer.push(d, n);
    }
    this.timerText = txt(this, 30, 128, '0:00', { title: true, size: 22, color: '#ffd23f' }).setOrigin(0, 0.5);
    // EN "MISTAKES 0/3" is wide: the puzzle number sits left of centre so the two never touch.
    this.mistakeText = txt(this, 690, 128, '', { title: true, size: 20, color: '#ff5a5a' }).setOrigin(1, 0.5);
    this.infoText = txt(this, 300, 128, '', { size: 26, color: '#aab0d0' });
    this.gameLayer.push(this.timerText, this.mistakeText, this.infoText);
  }

  private buildPad(): void {
    // tools row
    const ty = 945;
    this.notesKey = this.makeKey(130, ty, 220, 88, t('notes'), 0x3b4188, () => this.toggleNotes(), 20);
    this.eraseKey = this.makeKey(360, ty, 200, 88, t('erase'), 0x3b4188, () => this.erase(), 24);
    this.hintKey = this.makeKey(590, ty, 220, 88, '', 0x8a5a12, () => this.useHint(), 24);
    // digits: 5 + 4
    for (let d = 1; d <= 9; d++) {
      const row = d <= 5 ? 0 : 1;
      const idx = row === 0 ? d - 1 : d - 6;
      const n = row === 0 ? 5 : 4;
      const w = 124, gap = 10;
      const x = 360 - ((n * w + (n - 1) * gap) / 2) + w / 2 + idx * (w + gap);
      const y = 1062 + row * 122;
      const k = this.makeKey(x, y, w, 110, String(d), 0x262b57, () => this.input_(d), 40, true);
      this.pad.push(k);
    }
  }

  private makeKey(x: number, y: number, w: number, h: number, label: string, color: number, onPress: () => void, size: number, sub = false): PadKey {
    const shadow = this.add.rectangle(x, y + 6, w, h, 0x000000, 0.5).setDepth(6);
    const box = this.add.rectangle(x, y, w, h, color).setStrokeStyle(4, 0x000000).setDepth(7).setInteractive({ useHandCursor: true });
    box.setData('color', color);
    const text = this.add.text(x, sub ? y - 8 : y + 2, label, {
      fontFamily: '"Press Start 2P", monospace', fontSize: `${size}px`, color: '#ffffff',
    }).setOrigin(0.5).setDepth(8);
    const key: PadKey = { box, label: text };
    if (sub) {
      key.sub = this.add.text(x, y + 36, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '13px', color: '#aab0d0' }).setOrigin(0.5).setDepth(8);
      this.gameLayer.push(key.sub);
    }
    box.on('pointerdown', () => {
      if (this.phase !== 'play' || this.isOver) return;
      box.y = y + 3; text.y += 3; if (key.sub) key.sub.y += 3;
      this.time.delayedCall(90, () => { box.y = y; text.y -= 3; if (key.sub) key.sub.y -= 3; });
      onPress();
    });
    this.gameLayer.push(shadow, box, text);
    return key;
  }

  private setGameVisible(v: boolean): void {
    for (const o of this.gameLayer) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  private cellPos(i: number): { x: number; y: number } {
    return { x: X0 + colOf(i) * CELL + CELL / 2, y: Y0 + rowOf(i) * CELL + CELL / 2 };
  }

  private cellAt(px: number, py: number): number {
    const c = Math.floor((px - X0) / CELL), r = Math.floor((py - Y0) / CELL);
    if (c < 0 || r < 0 || c > 8 || r > 8) return -1;
    return r * 9 + c;
  }

  // ---------------------------------------------------------------- round flow

  private newPuzzle(): void {
    const d = DIFFS[this.diff];
    const p = generate(d.givens);
    this.grid = p.puzzle.slice();
    this.solution = p.solution;
    this.given = this.grid.map((v) => v > 0);
    this.hinted = new Array(81).fill(false);
    this.notes = new Array(81).fill(0);
    this.mistakes = 0; this.hintsLeft = HINTS; this.hintsUsed = 0; this.puzzleTime = 0; this.lastSec = -1;
    this.notesMode = false;
    this.sel = this.grid.findIndex((v) => v === 0);
    if (this.sel < 0) this.sel = 40;
    this.phase = 'play';
    this.hud.setCenter(t(d.key));
    this.infoText.setText(`${t('puzzle')} ${this.puzzleNo}`);
    for (let i = 0; i < 81; i++) {
      const tx = this.digits[i];
      tx.setScale(0);
      this.tweens.add({ targets: tx, scale: 1, duration: 260, delay: (rowOf(i) + colOf(i)) * 25, ease: 'Back.easeOut' });
    }
    this.refresh();
  }

  private refresh(): void {
    const selVal = this.sel >= 0 ? this.grid[this.sel] : 0;
    const g = this.cellBg;
    g.clear();
    for (let i = 0; i < 81; i++) {
      const { x, y } = this.cellPos(i);
      let col = (Math.floor(rowOf(i) / 3) + Math.floor(colOf(i) / 3)) % 2 ? C.cellAlt : C.cell;
      if (this.sel >= 0 && (rowOf(i) === rowOf(this.sel) || colOf(i) === colOf(this.sel) || boxOf(i) === boxOf(this.sel))) col = C.peer;
      if (selVal && this.grid[i] === selVal) col = C.same;
      if (i === this.sel) col = C.sel;
      g.fillStyle(col).fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);

      const v = this.grid[i];
      const tx = this.digits[i];
      tx.setText(v ? String(v) : '');
      tx.setColor(this.given[i] ? '#f3f2f2' : this.hinted[i] ? '#ffd23f' : '#5ee8ff');
      const m = v ? 0 : this.notes[i];
      if (m) {
        let s = '';
        for (let d = 1; d <= 9; d++) {
          s += m & (1 << d) ? String(d) : ' ';
          if (d % 3 === 0 && d < 9) s += '\n'; else if (d % 3) s += ' ';
        }
        this.noteTexts[i].setText(s);
      } else this.noteTexts[i].setText('');
    }
    const p = this.cellPos(this.sel);
    this.selBox.setPosition(p.x, p.y);

    // digit pad: counts left, dim finished digits, highlight the selected digit
    for (let d = 1; d <= 9; d++) {
      const placed = this.grid.filter((v) => v === d).length;
      const k = this.pad[d - 1];
      const left = 9 - placed;
      k.sub!.setText(left > 0 ? String(left) : '');
      k.box.setAlpha(left > 0 ? 1 : 0.35);
      k.label.setAlpha(left > 0 ? 1 : 0.35);
      k.box.setFillStyle(selVal === d ? 0x45509c : (k.box.getData('color') as number));
    }
    this.notesKey.label.setText(`${t('notes')} ${this.notesMode ? t('on') : t('off')}`);
    this.notesKey.box.setFillStyle(this.notesMode ? 0x8b5cff : 0x3b4188);
    this.notesKey.box.setStrokeStyle(4, this.notesMode ? 0xffd23f : 0x000000);
    this.hintKey.label.setText(`${t('hint')} ${this.hintsLeft}`);
    this.hintKey.box.setAlpha(this.hintsLeft > 0 ? 1 : 0.4);
    this.mistakeText.setText(`${t('mistakes')} ${this.mistakes}/${MAX_MISTAKES}`);
  }

  // ---------------------------------------------------------------- input

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'play' || this.isOver) return;
    const i = this.cellAt(p.x, p.y);
    if (i < 0) return;
    if (i !== this.sel) this.sfx('move', { volume: 0.35 });
    this.sel = i;
    this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    if (this.phase === 'select') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.selectFocus = (this.selectFocus + 3) % 4; this.moveRing(); this.sfx('move', { volume: 0.35 }); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.selectFocus = (this.selectFocus + 1) % 4; this.moveRing(); this.sfx('move', { volume: 0.35 }); }
      else if (e.code === 'Enter' || e.code === 'Space') this.pickDiff(this.selectFocus);
      else if (/^Digit[1-4]$|^Numpad[1-4]$/.test(e.code)) this.pickDiff(Number(e.code.slice(-1)) - 1);
      return;
    }
    if (this.phase !== 'play') return;
    const r = rowOf(this.sel), c = colOf(this.sel);
    let moved = -1;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') moved = ((r + 8) % 9) * 9 + c;
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') moved = ((r + 1) % 9) * 9 + c;
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') moved = r * 9 + (c + 8) % 9;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') moved = r * 9 + (c + 1) % 9;
    if (moved >= 0) {
      this.sel = moved;
      this.sfx('move', { volume: 0.3 });
      this.refresh();
      return;
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) { this.input_(Number(m[1])); return; }
    if (e.code === 'KeyN' || e.code === 'Space') this.toggleNotes();
    else if (e.code === 'KeyH') this.useHint();
    else if (e.code === 'Backspace' || e.code === 'Delete' || e.code === 'Digit0' || e.code === 'Numpad0' || e.code === 'KeyX') this.erase();
  }

  private toggleNotes(): void {
    this.notesMode = !this.notesMode;
    this.sfx('toggle', { volume: 0.5 });
    this.refresh();
  }

  private erase(): void {
    const i = this.sel;
    if (this.given[i] || this.grid[i] || !this.notes[i]) { this.sfx('nope', { volume: 0.35 }); return; }
    this.notes[i] = 0;
    this.sfx('erase', { volume: 0.5 });
    this.refresh();
  }

  private input_(d: number): void {
    if (this.phase !== 'play' || this.isOver) return;
    const i = this.sel;
    if (this.given[i] || this.grid[i]) {
      // filled cell: just highlight that digit elsewhere
      this.sfx('nope', { volume: 0.3 });
      return;
    }
    if (this.notesMode) {
      this.notes[i] ^= 1 << d;
      this.sfx('note', { volume: 0.4 });
      this.refresh();
      return;
    }
    if (d === this.solution[i]) this.place(i, d, false);
    else this.mistake(i, d);
  }

  private place(i: number, d: number, byHint: boolean): void {
    this.grid[i] = d;
    if (byHint) this.hinted[i] = true;
    // clear this digit from notes in the row, column and box
    for (let k = 0; k < 81; k++) {
      if (rowOf(k) === rowOf(i) || colOf(k) === colOf(i) || boxOf(k) === boxOf(i)) this.notes[k] &= ~(1 << d);
    }
    const { x, y } = this.cellPos(i);
    this.refresh();
    const tx = this.digits[i];
    tx.setScale(1.7);
    this.tweens.add({ targets: tx, scale: 1, duration: 260, ease: 'Back.easeOut' });
    burst(this, x, y, byHint ? [0xffd23f, 0xffffff] : [0x5ee8ff, 0xffffff], 10, 180);
    if (!byHint) this.addScore(5 * DIFFS[this.diff].mult, x, y - 30);
    this.sfxAt(byHint ? 'hint' : 'place', x, { volume: 0.55 });

    // completed units
    const units: number[][] = [];
    const rowCells = Array.from({ length: 9 }, (_, k) => rowOf(i) * 9 + k);
    const colCells = Array.from({ length: 9 }, (_, k) => k * 9 + colOf(i));
    const br = Math.floor(rowOf(i) / 3) * 3, bc = Math.floor(colOf(i) / 3) * 3;
    const boxCells = Array.from({ length: 9 }, (_, k) => (br + Math.floor(k / 3)) * 9 + bc + (k % 3));
    for (const u of [rowCells, colCells, boxCells]) if (u.every((k) => this.grid[k])) units.push(u);
    if (this.grid.every((v) => v)) { this.solved(); return; }
    if (units.length) {
      units.forEach((u, n) => this.wave(u, i, n * 120));
      if (!byHint) this.addScore(25 * units.length * DIFFS[this.diff].mult);
      this.sfx('unit', { volume: 0.5 });
    }
    // a digit fully placed
    if (this.grid.filter((v) => v === d).length === 9) {
      const k = this.pad[d - 1];
      this.tweens.add({ targets: k.label, scale: 1.4, duration: 140, yoyo: true });
    }
  }

  private wave(cells: number[], from: number, delay: number): void {
    const o = this.cellPos(from);
    for (const k of cells) {
      const p = this.cellPos(k);
      const dist = Math.hypot(p.x - o.x, p.y - o.y) / CELL;
      const r = this.add.rectangle(p.x, p.y, CELL - 4, CELL - 4, 0xffd23f, 0).setDepth(4);
      this.tweens.add({
        targets: r, fillAlpha: 0.55, duration: 110, delay: delay + dist * 45, yoyo: true,
        onComplete: () => r.destroy(),
      });
    }
  }

  private mistake(i: number, d: number): void {
    this.mistakes++;
    const { x, y } = this.cellPos(i);
    const ghost = this.add.text(x, y + 3, String(d), {
      fontFamily: '"Press Start 2P", monospace', fontSize: '38px', color: '#ff4040', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: ghost, x: { from: x - 8, to: x + 8 }, duration: 50, yoyo: true, repeat: 3 });
    this.tweens.add({ targets: ghost, alpha: 0, delay: 650, duration: 300, onComplete: () => ghost.destroy() });
    const r = this.add.rectangle(x, y, CELL - 4, CELL - 4, 0xff2020, 0.5).setDepth(4);
    this.tweens.add({ targets: r, alpha: 0, duration: 700, onComplete: () => r.destroy() });
    shake(this, 0.008, 160);
    flash(this, 0xff2020, 120, 0.2);
    this.sfxAt('error', x, { volume: 0.6 });
    this.refresh();
    this.tweens.add({ targets: this.mistakeText, scale: 1.35, duration: 120, yoyo: true });
    if (this.mistakes >= MAX_MISTAKES) {
      this.phase = 'between';
      // reveal the solution in red so the player sees what was missing
      for (let k = 0; k < 81; k++) if (!this.grid[k]) {
        this.digits[k].setText(String(this.solution[k])).setColor('#ff7a7a').setAlpha(0);
        this.tweens.add({ targets: this.digits[k], alpha: 0.8, delay: (rowOf(k) + colOf(k)) * 20, duration: 200 });
      }
      this.sfx('fail', { volume: 0.6 });
      shake(this, 0.015, 300);
      this.endGame({ title: t('tooMany'), delay: 1600 });
    }
  }

  private useHint(): void {
    if (this.phase !== 'play') return;
    if (this.hintsLeft <= 0) { this.sfx('nope', { volume: 0.4 }); this.tweens.add({ targets: this.hintKey.label, scale: 1.2, duration: 80, yoyo: true }); return; }
    let i = this.sel;
    if (this.grid[i]) {
      // the empty cell with the fewest candidates
      let best = -1, bc = 10;
      for (let k = 0; k < 81; k++) if (!this.grid[k]) {
        const c = popcount(candidates(this.grid, k));
        if (c < bc) { bc = c; best = k; }
      }
      i = best;
    }
    if (i < 0) return;
    this.hintsLeft--; this.hintsUsed++;
    this.sel = i;
    flash(this, 0xffd23f, 100, 0.15);
    this.place(i, this.solution[i], true);
  }

  private solved(): void {
    this.phase = 'between';
    const d = DIFFS[this.diff];
    const secs = Math.floor(this.puzzleTime);
    const timeBonus = Math.max(0, d.par - secs) * d.mult;
    const hintCut = Math.round(d.base * 0.15 * this.hintsUsed);
    const mistakeCut = Math.round(d.base * 0.1 * this.mistakes);
    const gain = Math.max(50, d.base + timeBonus - hintCut - mistakeCut);
    const bestKey = `sudoku-time-${this.diff}`;
    const prev = storage.get<number>(bestKey, 0);
    if (!prev || secs < prev) storage.set(bestKey, secs);

    for (let k = 0; k < 81; k++) {
      const tx = this.digits[k];
      this.tweens.add({ targets: tx, scale: 1.35, duration: 140, yoyo: true, delay: (rowOf(k) + colOf(k)) * 30 });
    }
    this.wave(Array.from({ length: 81 }, (_, k) => k), this.sel, 0);
    this.sfx('solved', { volume: 0.7, exact: true });
    this.time.delayedCall(350, () => {
      burst(this, 360, Y0 + 4.5 * CELL, [0xffd23f, 0x5ee8ff, 0xff4fa3, 0x5dff7a], 60, 520);
      shake(this, 0.006, 200);
    });
    this.addScore(gain);
    const banner = txt(this, 360, Y0 + 4.5 * CELL - 40, t('solved'), { title: true, size: 44, color: '#5dff7a', strokeThickness: 10 }).setDepth(50).setScale(0);
    const detail = txt(this, 360, Y0 + 4.5 * CELL + 40, `${t('time')} ${this.fmt(secs)}  +${gain}`, { title: true, size: 22, color: '#ffd23f' }).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: detail, alpha: 1, delay: 300, duration: 300 });
    popup(this, 360, Y0 + 4.5 * CELL + 100, `+${gain}`, '#5dff7a', 30);

    const last = this.diff >= DIFFS.length - 1;
    this.time.delayedCall(2400, () => {
      banner.destroy(); detail.destroy();
      if (last) {
        this.endGame({ win: true, title: t('allSolved') });
        return;
      }
      this.diff++;
      this.puzzleNo++;
      this.sfx('start', { volume: 0.6 });
      this.newPuzzle();
    });
  }

  private fmt(s: number): string {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  updateGame(_time: number, delta: number): void {
    if (this.phase !== 'play') return;
    this.puzzleTime += delta / 1000;
    const s = Math.floor(this.puzzleTime);
    if (s !== this.lastSec) { this.lastSec = s; this.timerText.setText(this.fmt(s)); }
  }
}
