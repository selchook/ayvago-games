import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, popup, txt, t, loc, getLang, rng, COLORS } from '@core';
import { THEMES, ALPHABET, type Theme } from './words';

type Cell = [number, number];

interface Level { n: number; words: number; dirs: number; time: number }

/** 10 levels: the grid grows, more words hide in more directions, the clock tightens. */
const LEVELS: Level[] = [
  { n: 8, words: 5, dirs: 2, time: 150 },
  { n: 8, words: 6, dirs: 3, time: 150 },
  { n: 9, words: 7, dirs: 4, time: 165 },
  { n: 10, words: 8, dirs: 6, time: 175 },
  { n: 11, words: 9, dirs: 8, time: 185 },
  { n: 12, words: 10, dirs: 8, time: 190 },
  { n: 12, words: 10, dirs: 8, time: 175 },
  { n: 12, words: 11, dirs: 8, time: 170 },
  { n: 12, words: 11, dirs: 8, time: 160 },
  { n: 12, words: 12, dirs: 8, time: 160 },
];

// [dr, dc]: right, down, down-right, up-right, then the reversed four
const DIRS: Cell[] = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
const FOUND_COLORS = [0xff4fa3, 0x5dff7a, 0xffd23f, 0x3ee6ff, 0x8b5cff, 0xff9a2e, 0xec3013, 0x4fd1c5];

const GRID_TOP = 176;
const GRID_SIZE = 664;
const LIST_TOP = GRID_TOP + GRID_SIZE + 24;

interface Word {
  text: string;
  cells: Cell[];
  found: boolean;
  label: Phaser.GameObjects.Text;
  strike?: Phaser.GameObjects.Rectangle;
}

export class PlayScene extends ArcadeScene {
  private levelIdx = 0;
  private n = 8;
  private cell = 80;
  private x0 = 0;
  private grid: string[][] = [];
  private tiles: Phaser.GameObjects.Image[][] = [];
  private letters: Phaser.GameObjects.Text[][] = [];
  private words: Word[] = [];
  private theme!: Theme;
  private themeOrder: number[] = [];
  private timeLeft = 0;
  private lastTick = 0;
  private hints = 3;
  private combo = 0;
  private lastFoundAt = -99;
  private locked = true;
  private colorIdx = 0;
  private dragStart: Cell | null = null;
  private dragEnd: Cell | null = null;
  private kbCursor: Cell = [0, 0];
  private kbAnchor: Cell | null = null;
  private kbActive = false;

  private capsules: Phaser.GameObjects.Graphics[] = [];
  private selG!: Phaser.GameObjects.Graphics;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private hintRing!: Phaser.GameObjects.Arc;
  private themeText!: Phaser.GameObjects.Text;
  private timeBar!: Phaser.GameObjects.Rectangle;
  private selText!: Phaser.GameObjects.Text;
  private hintBtn!: Button;
  private flashRect!: Phaser.GameObjects.Rectangle;

  createGame(): void {
    this.levelIdx = 0;
    this.hints = 3;
    this.combo = 0;
    this.lastFoundAt = -99;
    this.locked = true;
    this.colorIdx = 0;
    this.dragStart = this.dragEnd = null;
    this.kbAnchor = null;
    this.kbActive = false;
    this.kbCursor = [0, 0];
    this.words = [];
    this.capsules = [];
    this.tiles = [];
    this.letters = [];
    this.themeOrder = rng.shuffle(THEMES.map((_, i) => i));

    const { width, height } = this.scale;
    // backdrop panel behind the grid
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(20, GRID_TOP - 14, width - 40, GRID_SIZE + 28, 22);
    g.lineStyle(4, 0x3ee6ff, 0.5).strokeRoundedRect(20, GRID_TOP - 14, width - 40, GRID_SIZE + 28, 22);
    g.fillStyle(0x000000, 0.3).fillRoundedRect(20, LIST_TOP - 6, width - 40, 250, 18);

    this.themeText = txt(this, width / 2, 118, '', { title: true, size: 30, color: '#ffd23f' });
    this.add.rectangle(width / 2, 156, width - 40, 12, 0x000000, 0.6).setStrokeStyle(2, 0xffffff, 0.4);
    this.timeBar = this.add.rectangle(22, 156, width - 44, 8, COLORS.green).setOrigin(0, 0.5);

    this.selG = this.add.graphics().setDepth(3);
    this.cursorBox = this.add.rectangle(0, 0, 10, 10).setStrokeStyle(5, 0xff4fa3).setDepth(5).setVisible(false);
    this.hintRing = this.add.circle(0, 0, 10).setStrokeStyle(6, 0x5dff7a).setDepth(5).setVisible(false);
    this.tweens.add({ targets: this.hintRing, scale: 1.2, duration: 300, yoyo: true, repeat: -1 });
    this.selText = txt(this, width / 2, 118, '', { title: true, size: 22, color: '#ffffff' }).setDepth(8).setVisible(false);

    this.hintBtn = new Button(this, width / 2, height - 76, '', () => this.useHint(), { width: 340, height: 88, size: 24, color: COLORS.purple });
    this.flashRect = this.add.rectangle(0, 0, width, height, 0xffffff, 0).setOrigin(0).setDepth(7000);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.buildLevel();
  }

  // ---------------------------------------------------------------- level setup

  private buildLevel(): void {
    const L = LEVELS[this.levelIdx];
    this.n = L.n;
    this.cell = Math.floor(GRID_SIZE / L.n);
    this.x0 = Math.round((this.scale.width - this.cell * L.n) / 2);
    this.timeLeft = L.time;
    this.lastTick = 0;
    this.combo = 0;
    this.dragStart = this.dragEnd = null;
    this.kbAnchor = null;
    this.kbCursor = [Math.floor(L.n / 2), Math.floor(L.n / 2)];
    this.hintRing.setVisible(false);
    this.selG.clear();

    // clear previous board
    this.tiles.flat().forEach((o) => o.destroy());
    this.letters.flat().forEach((o) => o.destroy());
    this.capsules.forEach((c) => c.destroy());
    this.capsules = [];
    this.words.forEach((w) => { w.label.destroy(); w.strike?.destroy(); });

    this.theme = THEMES[this.themeOrder[this.levelIdx % this.themeOrder.length]];
    const lang = getLang();
    this.themeText.setText(loc(this.theme.name));
    this.themeText.setScale(0.3);
    this.tweens.add({ targets: this.themeText, scale: 1, duration: 450, ease: 'Back.easeOut' });

    const placed = this.generate(L, this.theme[lang], ALPHABET[lang]);
    this.words = placed.map((p) => ({ text: p.text, cells: p.cells, found: false, label: null as unknown as Phaser.GameObjects.Text }));

    // tiles + letters
    this.tiles = [];
    this.letters = [];
    const fs = Math.round(this.cell * 0.5);
    for (let r = 0; r < this.n; r++) {
      this.tiles.push([]);
      this.letters.push([]);
      for (let c = 0; c < this.n; c++) {
        const [x, y] = this.center([r, c]);
        const tile = this.add.image(x, y, 'tile').setDisplaySize(this.cell - 3, this.cell - 3);
        const letter = txt(this, x, y + 1, this.grid[r][c], { size: fs, color: '#ffffff', strokeThickness: 5, shadow: false });
        tile.setDepth(1);
        letter.setDepth(4);
        this.tiles[r].push(tile);
        this.letters[r].push(letter);
        const sx = tile.scaleX, sy = tile.scaleY;
        tile.setScale(0);
        letter.setScale(0);
        const delay = (r + c) * 22;
        this.tweens.add({ targets: tile, scaleX: sx, scaleY: sy, duration: 260, delay, ease: 'Back.easeOut' });
        this.tweens.add({ targets: letter, scale: 1, duration: 260, delay, ease: 'Back.easeOut' });
      }
    }

    // word list: 3 columns
    const cols = 3, colW = (this.scale.width - 60) / cols;
    const rows = Math.ceil(this.words.length / cols);
    const rowH = Math.min(56, 236 / rows);
    const sorted = [...this.words].sort((a, b) => a.text.length - b.text.length || a.text.localeCompare(b.text, lang));
    sorted.forEach((w, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = 30 + colW * col + colW / 2, y = LIST_TOP + 26 + row * rowH;
      w.label = txt(this, x, y, w.text, { size: w.text.length > 9 ? 26 : 30, color: '#f3f2f2' }).setAlpha(0);
      this.tweens.add({ targets: w.label, alpha: 1, duration: 300, delay: 300 + i * 40 });
    });

    this.refreshHud();
    this.locked = true;
    this.time.delayedCall(450, () => { this.locked = false; });
    this.sfx('start');
  }

  /** Places words (longest first) with overlaps allowed when letters agree, then fills the rest. */
  private generate(L: Level, pool: string[], alphabet: string): Array<{ text: string; cells: Cell[] }> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const n = L.n;
      const grid: string[][] = Array.from({ length: n }, () => Array<string>(n).fill(''));
      const chosen: string[] = [];
      for (const w of rng.shuffle([...pool])) {
        if (chosen.length >= L.words) break;
        if ([...w].length > n) continue;
        const rev = [...w].reverse().join('');
        if (chosen.some((c) => c.includes(w) || w.includes(c) || c.includes(rev) || rev.includes(c))) continue;
        chosen.push(w);
      }
      chosen.sort((a, b) => b.length - a.length);
      const placed: Array<{ text: string; cells: Cell[] }> = [];
      let ok = true;
      for (const w of chosen) {
        const letters = [...w];
        let done = false;
        for (let tries = 0; tries < 300 && !done; tries++) {
          const [dr, dc] = DIRS[rng.int(0, L.dirs - 1)];
          const r0 = rng.int(0, n - 1), c0 = rng.int(0, n - 1);
          const r1 = r0 + dr * (letters.length - 1), c1 = c0 + dc * (letters.length - 1);
          if (r1 < 0 || r1 >= n || c1 < 0 || c1 >= n) continue;
          let fits = true;
          for (let i = 0; i < letters.length && fits; i++) {
            const ch = grid[r0 + dr * i][c0 + dc * i];
            if (ch !== '' && ch !== letters[i]) fits = false;
          }
          if (!fits) continue;
          const cells: Cell[] = [];
          for (let i = 0; i < letters.length; i++) {
            grid[r0 + dr * i][c0 + dc * i] = letters[i];
            cells.push([r0 + dr * i, c0 + dc * i]);
          }
          placed.push({ text: w, cells });
          done = true;
        }
        if (!done) { ok = false; break; }
      }
      if (!ok || placed.length < Math.min(L.words, 4)) continue;
      const abc = [...alphabet];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] === '') grid[r][c] = rng.pick(abc);
      this.grid = grid;
      return placed;
    }
    // practically unreachable: fall back to fewer words
    return this.generate({ ...L, words: Math.max(3, L.words - 2) }, pool, alphabet);
  }

  // ---------------------------------------------------------------- geometry

  private center([r, c]: Cell): [number, number] {
    return [this.x0 + c * this.cell + this.cell / 2, GRID_TOP + r * this.cell + this.cell / 2];
  }

  private cellAt(x: number, y: number): Cell | null {
    const c = Math.floor((x - this.x0) / this.cell), r = Math.floor((y - GRID_TOP) / this.cell);
    if (r < 0 || c < 0 || r >= this.n || c >= this.n) return null;
    return [r, c];
  }

  /** Snaps a drag from `start` toward world point (x, y) onto one of the 8 directions. */
  private snapEnd(start: Cell, x: number, y: number): Cell {
    const [sx, sy] = this.center(start);
    const fx = (x - sx) / this.cell, fy = (y - sy) / this.cell;
    if (Math.hypot(fx, fy) < 0.5) return start;
    const k = Math.round(Math.atan2(fy, fx) / (Math.PI / 4));
    const dc = Math.round(Math.cos(k * Math.PI / 4)), dr = Math.round(Math.sin(k * Math.PI / 4));
    let len = Math.round(dr !== 0 && dc !== 0 ? (Math.abs(fx) + Math.abs(fy)) / 2 : Math.max(Math.abs(fx), Math.abs(fy)));
    while (len > 0) {
      const r = start[0] + dr * len, c = start[1] + dc * len;
      if (r >= 0 && r < this.n && c >= 0 && c < this.n) break;
      len--;
    }
    return [start[0] + dr * len, start[1] + dc * len];
  }

  private line(a: Cell, b: Cell): Cell[] | null {
    const dr = b[0] - a[0], dc = b[1] - a[1];
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    const sr = Math.sign(dr), sc = Math.sign(dc);
    const out: Cell[] = [];
    for (let i = 0; i <= len; i++) out.push([a[0] + sr * i, a[1] + sc * i]);
    return out;
  }

  private drawCapsule(g: Phaser.GameObjects.Graphics, a: Cell, b: Cell, color: number, alpha: number): void {
    const [ax, ay] = this.center(a), [bx, by] = this.center(b);
    const len = Math.hypot(bx - ax, by - ay), rad = this.cell * 0.4;
    g.setPosition(ax, ay).setRotation(Math.atan2(by - ay, bx - ax));
    g.fillStyle(color, alpha).fillRoundedRect(-rad, -rad, len + rad * 2, rad * 2, rad);
    g.lineStyle(3, 0xffffff, Math.min(1, alpha + 0.3)).strokeRoundedRect(-rad, -rad, len + rad * 2, rad * 2, rad);
  }

  // ---------------------------------------------------------------- input

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.locked || this.isOver) return;
    const c = this.cellAt(p.x, p.y);
    if (!c) return;
    this.kbActive = false;
    this.kbAnchor = null;
    this.cursorBox.setVisible(false);
    this.dragStart = c;
    this.dragEnd = c;
    this.sfx('tap', { volume: 0.5 });
    this.drawSelection();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.dragStart || !p.isDown) return;
    const end = this.snapEnd(this.dragStart, p.x, p.y);
    if (end[0] !== this.dragEnd?.[0] || end[1] !== this.dragEnd?.[1]) {
      this.dragEnd = end;
      this.sfx('tick', { volume: 0.25 });
      this.drawSelection();
    }
  }

  private onUp(): void {
    if (!this.dragStart || !this.dragEnd) return;
    const a = this.dragStart, b = this.dragEnd;
    this.dragStart = this.dragEnd = null;
    this.selG.clear();
    this.selText.setVisible(false);
    this.themeText.setVisible(true);
    if (a[0] === b[0] && a[1] === b[1]) return;   // plain tap
    this.trySelection(a, b);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver || this.locked) return;
    const k = e.code;
    const move: Record<string, Cell> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], KeyA: [0, -1], KeyD: [0, 1], KeyW: [-1, 0], KeyS: [1, 0] };
    if (move[k]) {
      this.kbActive = true;
      const [dr, dc] = move[k];
      this.kbCursor = [Phaser.Math.Clamp(this.kbCursor[0] + dr, 0, this.n - 1), Phaser.Math.Clamp(this.kbCursor[1] + dc, 0, this.n - 1)];
      this.sfx('tick', { volume: 0.25 });
    } else if (k === 'Space' || k === 'Enter' || k === 'KeyZ') {
      this.kbActive = true;
      if (!this.kbAnchor) {
        this.kbAnchor = [...this.kbCursor] as Cell;
        this.sfx('tap', { volume: 0.5 });
      } else {
        const a = this.kbAnchor;
        this.kbAnchor = null;
        if (this.line(a, this.kbCursor) && (a[0] !== this.kbCursor[0] || a[1] !== this.kbCursor[1])) this.trySelection(a, this.kbCursor);
        else this.sfx('wrong', { volume: 0.4 });
      }
    } else if (k === 'KeyX' || k === 'Backspace') {
      this.kbAnchor = null;
    } else if (k === 'KeyH') {
      this.useHint();
      return;
    } else return;
    this.drawSelection();
  }

  private drawSelection(): void {
    this.selG.clear();
    let a: Cell | null = null, b: Cell | null = null;
    if (this.dragStart && this.dragEnd) { a = this.dragStart; b = this.dragEnd; }
    else if (this.kbAnchor) { a = this.kbAnchor; b = this.line(this.kbAnchor, this.kbCursor) ? this.kbCursor : this.kbAnchor; }
    if (this.kbActive) {
      const [x, y] = this.center(this.kbCursor);
      this.cursorBox.setPosition(x, y).setSize(this.cell - 2, this.cell - 2).setVisible(true);
    }
    if (!a || !b) { this.selText.setVisible(false); this.themeText.setVisible(true); return; }
    this.themeText.setVisible(false);
    this.drawCapsule(this.selG, a, b, 0xffffff, 0.35);
    const cells = this.line(a, b) ?? [a];
    this.selText.setText(cells.map(([r, c]) => this.grid[r][c]).join('')).setVisible(true);
  }

  // ---------------------------------------------------------------- game logic

  private trySelection(a: Cell, b: Cell): void {
    const cells = this.line(a, b);
    if (!cells) return;
    const s = cells.map(([r, c]) => this.grid[r][c]).join('');
    const rev = [...s].reverse().join('');
    const w = this.words.find((w) => !w.found && (w.text === s || w.text === rev));
    if (!w) {
      this.sfx('wrong', { volume: 0.45 });
      this.combo = 0;
      const g = this.add.graphics().setDepth(3);
      this.drawCapsule(g, a, b, 0xec3013, 0.45);
      this.tweens.add({ targets: g, alpha: 0, duration: 380, onComplete: () => g.destroy() });
      this.cameras.main.shake(90, 0.004);
      return;
    }
    this.foundWord(w, a, b);
  }

  private foundWord(w: Word, a: Cell, b: Cell): void {
    w.found = true;
    this.hintRing.setVisible(false);
    const color = FOUND_COLORS[this.colorIdx++ % FOUND_COLORS.length];
    const g = this.add.graphics().setDepth(2);
    this.drawCapsule(g, a, b, color, 0.6);
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 200 });
    this.capsules.push(g);

    // combo: words found within 8 seconds of each other
    this.combo = this.elapsed - this.lastFoundAt < 8 ? this.combo + 1 : 1;
    this.lastFoundAt = this.elapsed;
    const len = [...w.text].length;
    const pts = (20 + len * 10) * (1 + this.levelIdx * 0.25) * Math.min(this.combo, 4);
    const [mx, my] = this.center([Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]);
    this.addScore(Math.round(pts), mx, my - 30);
    if (this.combo > 1) popup(this, mx, my + 30, `${t('combo')} x${Math.min(this.combo, 4)}`, '#ff4fa3', 22);

    w.cells.forEach(([r, c], i) => {
      const L = this.letters[r][c];
      this.tweens.add({ targets: L, scale: 1.45, duration: 120, delay: i * 40, yoyo: true, ease: 'Quad.easeOut' });
      this.time.delayedCall(i * 40, () => {
        const [x, y] = this.center([r, c]);
        burst(this, x, y, [color, 0xffffff], 6, 160);
      });
    });
    this.sfx('found');

    // strike the word in the list
    w.label.setColor('#' + color.toString(16).padStart(6, '0'));
    w.strike = this.add.rectangle(w.label.x - w.label.width / 2, w.label.y + 2, 0, 4, 0xffffff).setOrigin(0, 0.5);
    this.tweens.add({ targets: w.strike, width: w.label.width, duration: 250 });
    this.tweens.add({ targets: w.label, scale: 1.25, duration: 150, yoyo: true });
    w.label.setAlpha(0.75);

    this.refreshHud();
    if (this.words.every((x) => x.found)) this.levelComplete();
  }

  private levelComplete(): void {
    this.locked = true;
    this.dragStart = this.dragEnd = null;
    this.kbAnchor = null;
    this.selG.clear();
    this.cursorBox.setVisible(false);
    const bonus = Math.ceil(this.timeLeft) * 5 + 150 * (this.levelIdx + 1);
    const { width } = this.scale;
    this.flashLocal(0xffffff, 0.35);
    shake(this, 0.008, 220);
    this.sfx('clear');
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 120, () => burst(this, rng.int(80, width - 80), rng.int(GRID_TOP + 60, GRID_TOP + GRID_SIZE - 60), FOUND_COLORS, 22, 380));
    }
    const banner = txt(this, width / 2, GRID_TOP + GRID_SIZE / 2 - 40, t('levelClear'), { title: true, size: 40, color: '#5dff7a', wrap: width - 60 }).setDepth(50).setScale(0);
    const sub = txt(this, width / 2, GRID_TOP + GRID_SIZE / 2 + 40, `${t('timeBonus')} +${bonus}`, { title: true, size: 22, color: '#ffd23f' }).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 300 });
    this.time.delayedCall(500, () => this.addScore(bonus));

    const last = this.levelIdx >= LEVELS.length - 1;
    if (!last && this.levelIdx % 2 === 1) this.hints++;   // a fresh hint every second level
    this.time.delayedCall(1900, () => {
      banner.destroy();
      sub.destroy();
      if (last) {
        this.endGame({ win: true, title: t('allFound'), delay: 200 });
        return;
      }
      this.levelIdx++;
      this.buildLevel();
    });
  }

  private useHint(): void {
    if (this.locked || this.isOver) return;
    const open = this.words.filter((w) => !w.found);
    if (!open.length || this.hints <= 0) {
      this.sfx('wrong', { volume: 0.4 });
      return;
    }
    this.hints--;
    this.timeLeft = Math.max(1, this.timeLeft - 10);
    const w = rng.pick(open);
    const [x, y] = this.center(w.cells[0]);
    this.hintRing.setPosition(x, y).setRadius(this.cell * 0.46).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.hintRing, alpha: 0.25, duration: 600, delay: 3200, onComplete: () => this.hintRing.setVisible(false) });
    popup(this, x, y - 20, '-10s', '#ec3013', 22);
    burst(this, x, y, 0x5dff7a, 14, 200);
    this.tweens.add({ targets: w.label, scale: 1.3, duration: 180, yoyo: true, repeat: 2 });
    this.sfx('hint');
    this.refreshHud();
  }

  private flashLocal(color: number, alpha: number): void {
    this.flashRect.setFillStyle(color, 1).setAlpha(alpha);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 260 });
  }

  private refreshHud(): void {
    this.hud.setCenter(`${t('level')} ${this.levelIdx + 1}`);
    this.hintBtn.setText(`${t('hint')} (${this.hints})`);
    this.hintBtn.setAlpha(this.hints > 0 ? 1 : 0.5);
  }

  updateGame(_time: number, delta: number): void {
    if (this.locked) return;
    this.timeLeft -= delta / 1000;
    const L = LEVELS[this.levelIdx];
    const frac = Phaser.Math.Clamp(this.timeLeft / L.time, 0, 1);
    this.timeBar.width = (this.scale.width - 44) * frac;
    this.timeBar.fillColor = frac > 0.5 ? COLORS.green : frac > 0.2 ? COLORS.yellow : COLORS.red;
    const secs = Math.max(0, Math.ceil(this.timeLeft));
    this.hud.setRight(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    if (secs <= 10 && secs > 0 && secs !== this.lastTick) {
      this.lastTick = secs;
      this.sfx('warn', { volume: 0.5 });
      this.tweens.add({ targets: this.timeBar, alpha: 0.3, duration: 120, yoyo: true });
    }
    if (this.timeLeft <= 0) {
      this.locked = true;
      this.selG.clear();
      this.dragStart = this.dragEnd = null;
      // reveal the words that were missed
      for (const w of this.words) {
        if (w.found) continue;
        const g = this.add.graphics().setDepth(2);
        this.drawCapsule(g, w.cells[0], w.cells[w.cells.length - 1], 0xec3013, 0.45);
      }
      shake(this, 0.012, 300);
      this.flashLocal(0xec3013, 0.3);
      this.sfx('timeup');
      this.endGame({ title: t('timeUp'), delay: 1400 });
    }
  }
}
