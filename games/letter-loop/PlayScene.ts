import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, getLang, upper, type Lang } from '@core';
import { buildDict, makePuzzle, shapeFor, fold, type Dict, type Placed, type Puzzle } from './logic';
import { COMMON as TR_COMMON, EXTRA as TR_EXTRA } from './words-tr';
import { COMMON as EN_COMMON, EXTRA as EN_EXTRA } from './words-en';

// ---------------------------------------------------------------- layout (720x1280)
const W = 720;
const TIME_Y = 100;
const GRID_TOP = 136;
const GRID_H = 500;
const GRID_W = 636;
const PREVIEW_Y = 690;
const WHEEL_X = 360;
const WHEEL_Y = 930;
const WHEEL_R = 205;
const LETTER_RING = 142;
const LETTER_R = 52;
const BTN_Y = 1196;

const INK = 0x24263a;
const CREAM = 0xfff6e2;
const ACCENT = 0xff8a3d;
const GOOD = 0x3ddc84;
const BAD = 0xff4d6d;
const GOLD = 0xffd23f;
const START_HINTS = 3;
const BONUS_PER_HINT = 5;

const dicts: Partial<Record<Lang, Dict>> = {};
function dictFor(lang: Lang): Dict {
  return (dicts[lang] ??= lang === 'tr' ? buildDict(TR_COMMON, TR_EXTRA) : buildDict(EN_COMMON, EN_EXTRA));
}

interface GridCell {
  ch: string;
  x: number;
  y: number;
  bg: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text | null;
  shown: boolean;
}

interface GridWord {
  p: Placed;
  keys: string[];
  found: boolean;
}

interface WheelLetter {
  ch: string;
  slot: number;
  c: Phaser.GameObjects.Container;
  disc: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** Letter Loop: swipe across the wheel letters to fill a small crossword before time runs out. */
export class PlayScene extends ArcadeScene {
  protected pauseOnP = false;

  private lang: Lang = 'en';
  private dict!: Dict;
  private used = new Set<string>();
  private level = 0;
  private puzzle!: Puzzle;
  private cells = new Map<string, GridCell>();
  private words: GridWord[] = [];
  private bonusFound = new Set<string>();
  private bonusCount = 0;
  private hints = START_HINTS;
  private timeLeft = 0;
  private timeMax = 1;
  private lastTick = 0;
  private locked = true;
  private streak = 0;

  private letters: WheelLetter[] = [];
  private chain: WheelLetter[] = [];
  private dragging = false;
  private pointer = { x: 0, y: 0 };

  private gridLayer!: Phaser.GameObjects.Container;
  private wheelLayer!: Phaser.GameObjects.Container;
  private lineG!: Phaser.GameObjects.Graphics;
  private previewG!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Container;
  private previewText!: Phaser.GameObjects.Text;
  private timeBar!: Phaser.GameObjects.Rectangle;
  private hintBadge!: Phaser.GameObjects.Text;
  private hintBtn!: Phaser.GameObjects.Container;
  private bonusRing!: Phaser.GameObjects.Graphics;
  private bonusText!: Phaser.GameObjects.Text;
  private bonusBtn!: Phaser.GameObjects.Container;

  createGame(): void {
    this.lang = getLang();
    this.dict = dictFor(this.lang);
    this.used = new Set();
    this.level = 0;
    this.cells = new Map();
    this.words = [];
    this.bonusFound = new Set();
    this.bonusCount = 0;
    this.hints = START_HINTS;
    this.timeLeft = 0;
    this.timeMax = 1;
    this.lastTick = 0;
    this.locked = true;
    this.streak = 0;
    this.letters = [];
    this.chain = [];
    this.dragging = false;

    this.makeTextures();
    this.drawBackdrop();

    // time bar
    this.add.rectangle(W / 2, TIME_Y, W - 80, 14, 0x000000, 0.35).setStrokeStyle(2, 0xffffff, 0.2);
    this.timeBar = this.add.rectangle(42, TIME_Y, W - 84, 10, GOOD).setOrigin(0, 0.5);

    this.gridLayer = this.add.container(0, 0).setDepth(2);

    // wheel
    this.add.image(WHEEL_X, WHEEL_Y + 10, 'll-disc').setDisplaySize(WHEEL_R * 2 + 10, WHEEL_R * 2 + 10).setTint(0x000000).setAlpha(0.18);
    this.add.image(WHEEL_X, WHEEL_Y, 'll-disc').setDisplaySize(WHEEL_R * 2, WHEEL_R * 2).setTint(0xffffff).setAlpha(0.14);
    this.add.circle(WHEEL_X, WHEEL_Y, WHEEL_R).setStrokeStyle(3, 0xffffff, 0.28);
    this.lineG = this.add.graphics().setDepth(4);
    this.wheelLayer = this.add.container(0, 0).setDepth(5);

    // the word being spelled
    this.previewG = this.add.graphics();
    this.previewText = txt(this, 0, 0, '', { title: true, size: 46, color: '#ffffff' });
    this.preview = this.add.container(W / 2, PREVIEW_Y, [this.previewG, this.previewText]).setDepth(6);

    this.buildButtons();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    this.input.on('pointerupoutside', () => this.onUp());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.nextLevel();
  }

  // ---------------------------------------------------------------- art

  private makeTextures(): void {
    const gen = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    gen('ll-disc', 256, 256, (g) => g.fillStyle(0xffffff).fillCircle(128, 128, 127));
    gen('ll-cell', 128, 128, (g) => g.fillStyle(0xffffff).fillRoundedRect(2, 2, 124, 124, 24));
    gen('ll-dot', 64, 64, (g) => {
      for (let r = 32; r > 0; r -= 2) g.fillStyle(0xffffff, 0.05 + (1 - r / 32) * 0.12).fillCircle(32, 32, r);
    });
    gen('ll-star', 96, 96, (g) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 19 : 44;
        pts.push(new Phaser.Math.Vector2(48 + Math.cos(a) * r, 50 + Math.sin(a) * r));
      }
      g.fillStyle(0xffffff).fillPoints(pts, true);
    });
    gen('ll-bulb', 96, 96, (g) => {
      g.fillStyle(0xffffff).fillCircle(48, 38, 26);
      g.fillTriangle(30, 50, 66, 50, 48, 70);
      g.fillRoundedRect(36, 64, 24, 10, 3).fillRoundedRect(38, 77, 20, 8, 3);
    });
    gen('ll-shuffle', 96, 96, (g) => {
      g.lineStyle(9, 0xffffff);
      g.beginPath();
      g.arc(48, 48, 28, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
      g.strokePath();
      g.beginPath();
      g.arc(48, 48, 28, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
      g.strokePath();
      g.fillStyle(0xffffff);
      g.fillTriangle(68, 22, 86, 38, 64, 44);
      g.fillTriangle(28, 74, 10, 58, 32, 52);
    });
  }

  private drawBackdrop(): void {
    const H = this.scale.height;
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x1c3b6e, 0x1c3b6e, 0x5b2a86, 0x5b2a86, 1).fillRect(0, 0, W, H);
    // slow floating lights
    for (let i = 0; i < 14; i++) {
      const d = this.add.image(Math.random() * W, Math.random() * H, 'll-dot').setDepth(-9)
        .setScale(1 + Math.random() * 3).setAlpha(0.25 + Math.random() * 0.35)
        .setTint(Phaser.Utils.Array.GetRandom([0xffffff, 0xffd6a5, 0xa0c4ff, 0xffadad]));
      this.tweens.add({ targets: d, y: d.y - 60 - Math.random() * 80, x: d.x + (Math.random() - 0.5) * 60, duration: 6000 + Math.random() * 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // glass panel behind the crossword
    g.fillStyle(0x000000, 0.18).fillRoundedRect(18, GRID_TOP - 10, W - 36, GRID_H + 20, 28);
    g.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(18, GRID_TOP - 10, W - 36, GRID_H + 20, 28);
  }

  private roundButton(x: number, y: number, icon: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
    const shadow = this.add.image(0, 6, 'll-disc').setDisplaySize(100, 100).setTint(0x000000).setAlpha(0.25);
    const face = this.add.image(0, 0, 'll-disc').setDisplaySize(96, 96).setTint(color);
    const sheen = this.add.image(0, -14, 'll-disc').setDisplaySize(70, 40).setAlpha(0.18);
    const img = this.add.image(0, 0, icon).setDisplaySize(54, 54);
    const c = this.add.container(x, y, [shadow, face, sheen, img]).setDepth(7).setSize(100, 100).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.92, duration: 70 }));
    c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 120 }));
    c.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
      onClick();
    });
    return c;
  }

  private buildButtons(): void {
    this.roundButton(110, BTN_Y, 'll-shuffle', 0x4361ee, () => this.shuffleWheel());
    this.hintBtn = this.roundButton(W - 110, BTN_Y, 'll-bulb', 0xf4a261, () => this.useHint());
    const badgeBg = this.add.circle(34, -34, 22, BAD).setStrokeStyle(3, 0xffffff);
    this.hintBadge = txt(this, 34, -35, '', { title: true, size: 24, color: '#ffffff' });
    this.hintBtn.add([badgeBg, this.hintBadge]);

    // bonus words: a star with a ring that fills up to the next free hint
    this.bonusRing = this.add.graphics();
    const star = this.add.image(0, -4, 'll-star').setDisplaySize(64, 64).setTint(GOLD);
    this.bonusText = txt(this, 0, 46, '', { size: 20, color: '#ffffff' });
    this.bonusBtn = this.add.container(W / 2, BTN_Y, [this.bonusRing, star, this.bonusText]).setDepth(7);
    this.refreshButtons();
  }

  private refreshButtons(): void {
    this.hintBadge.setText(String(this.hints));
    this.hintBtn.setAlpha(this.hints > 0 ? 1 : 0.55);
    const k = this.bonusCount % BONUS_PER_HINT;
    this.bonusRing.clear();
    this.bonusRing.lineStyle(8, 0x000000, 0.3).strokeCircle(0, -4, 44);
    if (k > 0) {
      this.bonusRing.lineStyle(8, GOLD, 1);
      this.bonusRing.beginPath();
      this.bonusRing.arc(0, -4, 44, -Math.PI / 2, -Math.PI / 2 + (k / BONUS_PER_HINT) * Math.PI * 2, false);
      this.bonusRing.strokePath();
    }
    this.bonusText.setText(`${t('bonus')} ${this.bonusCount}`);
  }

  // ---------------------------------------------------------------- levels

  private nextLevel(): void {
    this.level++;
    let shape = shapeFor(this.level);
    let puzzle: Puzzle | null = null;
    for (let i = 0; i < 4 && !puzzle; i++) {
      puzzle = makePuzzle(this.dict, shape, this.used, Math.random);
      if (!puzzle) shape = { len: Math.max(4, shape.len - 1), minWords: Math.max(3, shape.minWords - 1), maxWords: shape.maxWords };
    }
    if (!puzzle) {
      // the list ran out of unused bases: allow repeats
      this.used.clear();
      puzzle = makePuzzle(this.dict, shapeFor(this.level), this.used, Math.random)!;
    }
    this.puzzle = puzzle;
    this.hud.setLevel(this.level);
    this.timeMax = this.timeLeft = Math.round((22 + puzzle.words.length * 9 + (puzzle.base.length - 4) * 6) * Math.max(0.72, 1 - (this.level - 1) * 0.02));
    this.lastTick = 0;
    this.streak = 0;
    this.buildGrid();
    this.buildWheel();
    this.clearChain();
    this.updateTimeUi();
    this.time.delayedCall(450, () => { this.locked = false; });
  }

  private buildGrid(): void {
    this.gridLayer.removeAll(true);
    this.cells.clear();
    const { rows, cols, words } = this.puzzle;
    const size = Math.min(84, Math.floor(GRID_W / cols), Math.floor(GRID_H / rows));
    const gap = Math.max(4, Math.round(size * 0.08));
    const x0 = (W - cols * size) / 2 + size / 2;
    const y0 = GRID_TOP + (GRID_H - rows * size) / 2 + size / 2;
    this.words = words.map((p) => {
      const keys: string[] = [];
      for (let i = 0; i < p.word.length; i++) {
        const r = p.r + (p.dir ? i : 0), c = p.c + (p.dir ? 0 : i);
        const k = `${r},${c}`;
        keys.push(k);
        if (!this.cells.has(k)) {
          const x = x0 + c * size, y = y0 + r * size;
          const bg = this.add.image(x, y, 'll-cell').setDisplaySize(size - gap, size - gap).setTint(0xffffff).setAlpha(0.22);
          this.gridLayer.add(bg);
          this.cells.set(k, { ch: p.word[i], x, y, bg, label: null, shown: false });
        }
      }
      return { p, keys, found: false };
    });
    // cells pop in from the centre outwards
    let i = 0;
    for (const cell of this.cells.values()) {
      const s = cell.bg.scale;
      cell.bg.setScale(0);
      this.tweens.add({ targets: cell.bg, scale: s, duration: 260, delay: 80 + i++ * 18, ease: 'Back.easeOut' });
    }
  }

  private buildWheel(): void {
    this.wheelLayer.removeAll(true);
    this.letters = this.puzzle.letters.map((ch, i) => {
      const disc = this.add.image(0, 0, 'll-disc').setDisplaySize(LETTER_R * 2, LETTER_R * 2).setTint(CREAM);
      const label = txt(this, 0, -2, ch, { title: true, size: 54, color: '#24263a', strokeThickness: 0, shadow: false });
      const c = this.add.container(0, 0, [disc, label]);
      this.wheelLayer.add(c);
      const L: WheelLetter = { ch, slot: i, c, disc, label };
      const [x, y] = this.slotPos(i);
      c.setPosition(WHEEL_X, WHEEL_Y).setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: c, x, y, scale: 1, alpha: 1, duration: 380, delay: i * 50, ease: 'Back.easeOut' });
      return L;
    });
  }

  private slotPos(slot: number): [number, number] {
    const n = this.puzzle.letters.length;
    const a = -Math.PI / 2 + (slot / n) * Math.PI * 2;
    return [WHEEL_X + Math.cos(a) * LETTER_RING, WHEEL_Y + Math.sin(a) * LETTER_RING];
  }

  // ---------------------------------------------------------------- input

  private letterAt(x: number, y: number, radius: number): WheelLetter | null {
    for (const L of this.letters) {
      const [lx, ly] = this.slotPos(L.slot);
      if (Phaser.Math.Distance.Between(x, y, lx, ly) <= radius) return L;
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.locked || this.isOver) return;
    const L = this.letterAt(p.x, p.y, LETTER_R + 8);
    if (!L) return;
    this.clearChain();
    this.dragging = true;
    this.pointer = { x: p.x, y: p.y };
    this.add_(L);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    this.pointer = { x: p.x, y: p.y };
    const L = this.letterAt(p.x, p.y, LETTER_R - 6);
    if (L) {
      const idx = this.chain.indexOf(L);
      if (idx < 0) this.add_(L);
      else if (idx === this.chain.length - 2) this.pop_();
    }
    this.drawLine();
  }

  private onUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.submit();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.locked || this.isOver || this.dragging) return;
    if (e.key === 'Enter') { this.submit(); return; }
    if (e.key === 'Backspace') { this.pop_(); this.drawLine(); return; }
    if (e.key === ' ') { this.shuffleWheel(); return; }
    if (e.key === '1' || e.key === '?') { this.useHint(); return; }
    if (e.key.length !== 1) return;
    const ch = upper(e.key);
    const free = this.letters.filter((L) => !this.chain.includes(L));
    const L = free.find((x) => x.ch === ch) ?? (this.lang === 'tr' ? free.find((x) => fold(x.ch) === fold(ch)) : undefined);
    if (L) { this.add_(L); this.drawLine(); }
    else if (/\p{L}/u.test(e.key)) this.nudgePreview();
  }

  private add_(L: WheelLetter): void {
    this.chain.push(L);
    this.tweens.killTweensOf(L.c);
    this.tweens.add({ targets: L.c, scale: 1.14, duration: 120, ease: 'Back.easeOut' });
    L.disc.setTint(ACCENT);
    L.label.setColor('#ffffff');
    this.sfx('sel', { rate: 0.9 + this.chain.length * 0.08 });
    this.refreshPreview();
  }

  private pop_(): void {
    const L = this.chain.pop();
    if (!L) return;
    this.resetLetter(L);
    this.refreshPreview();
  }

  private resetLetter(L: WheelLetter): void {
    this.tweens.killTweensOf(L.c);
    this.tweens.add({ targets: L.c, scale: 1, duration: 140 });
    L.disc.setTint(CREAM);
    L.label.setColor('#24263a');
  }

  private clearChain(): void {
    for (const L of this.chain) this.resetLetter(L);
    this.chain = [];
    this.lineG?.clear();
    this.refreshPreview();
  }

  private drawLine(): void {
    this.lineG.clear();
    if (!this.chain.length) return;
    this.lineG.lineStyle(18, ACCENT, 0.85);
    this.lineG.beginPath();
    const pts = this.chain.map((L) => this.slotPos(L.slot));
    this.lineG.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) this.lineG.lineTo(x, y);
    if (this.dragging) this.lineG.lineTo(this.pointer.x, this.pointer.y);
    this.lineG.strokePath();
    for (const [x, y] of pts) this.lineG.fillStyle(ACCENT, 1).fillCircle(x, y, 9);
  }

  private refreshPreview(color = ACCENT): void {
    const word = this.chain.map((L) => L.ch).join('');
    this.previewText.setText(word);
    this.previewG.clear();
    if (!word) return;
    const w = Math.max(90, this.previewText.width + 48);
    this.previewG.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -32, w, 72, 36);
    this.previewG.fillStyle(color, 1).fillRoundedRect(-w / 2, -36, w, 72, 36);
  }

  private nudgePreview(): void {
    this.tweens.add({ targets: this.preview, x: W / 2 + 10, duration: 40, yoyo: true, repeat: 2, onComplete: () => this.preview.setX(W / 2) });
  }

  // ---------------------------------------------------------------- words

  private submit(): void {
    const word = this.chain.map((L) => L.ch).join('');
    this.lineG.clear();
    if (word.length < 2) { this.clearChain(); return; }
    const gw = this.words.find((w) => w.p.word === word);
    if (gw && !gw.found) this.foundWord(gw);
    else if (gw) this.repeat(t('already'), () => this.pulseWord(gw));
    else if (this.puzzle.bonus.has(word) && !this.bonusFound.has(word)) this.foundBonus(word);
    else if (this.bonusFound.has(word)) this.repeat(t('already'));
    else this.wrong(word.length < 3 ? t('tooShort') : '');
  }

  /** Flies the preview letters into the word's cells, then reveals them. */
  private foundWord(gw: GridWord): void {
    gw.found = true;
    this.streak++;
    const word = gw.p.word;
    const full = word.length === this.puzzle.base.length;
    const pts = word.length * 10 * (full ? 2 : 1) + Math.min(this.streak - 1, 5) * 5;
    this.refreshPreview(GOOD);
    this.sfx('found');
    const startX = W / 2 - this.previewText.width / 2;
    const step = this.previewText.width / word.length;
    gw.keys.forEach((k, i) => {
      const cell = this.cells.get(k)!;
      const fly = txt(this, startX + step * (i + 0.5), PREVIEW_Y - 2, word[i], { title: true, size: 46, color: '#ffffff' }).setDepth(20);
      this.tweens.add({
        targets: fly, x: cell.x, y: cell.y, scale: 0.8, duration: 300, delay: i * 55, ease: 'Cubic.easeIn',
        onComplete: () => { fly.destroy(); this.reveal(k, GOOD); },
      });
    });
    const mid = this.cells.get(gw.keys[Math.floor(gw.keys.length / 2)])!;
    this.time.delayedCall(300 + word.length * 55, () => {
      this.addScore(pts, mid.x, mid.y - 30);
      this.autoComplete();
      const last = this.words.every((w) => w.found);
      if (full && !last) {
        this.banner(t('fullWord'), GOLD);
        shake(this, 0.006, 160);
      } else if (this.streak >= 3 && !last) {
        this.banner(t(this.streak >= 5 ? 'praise3' : this.streak >= 4 ? 'praise2' : 'praise1'), 0xffffff);
      }
      this.checkClear();
    });
    this.time.delayedCall(260, () => this.clearChain());
  }

  private reveal(k: string, tint: number): void {
    const cell = this.cells.get(k)!;
    if (cell.shown) {
      this.tweens.add({ targets: cell.bg, scale: cell.bg.scale * 1.12, duration: 90, yoyo: true });
      return;
    }
    cell.shown = true;
    const size = cell.bg.displayWidth;
    cell.bg.setTint(CREAM).setAlpha(1);
    const ink = tint === BAD ? '#d62839' : '#24263a';
    cell.label = txt(this, cell.x, cell.y - 1, cell.ch, { title: true, size: Math.round(size * 0.58), color: ink, strokeThickness: 0, shadow: false });
    this.gridLayer.add(cell.label);
    const s = cell.bg.scale;
    cell.bg.setScale(s * 1.25);
    this.tweens.add({ targets: cell.bg, scale: s, duration: 240, ease: 'Back.easeOut' });
    burst(this, cell.x, cell.y, [tint, 0xffffff], 6, 120);
  }

  /** Words whose every cell is already shown count as found (half points). */
  private autoComplete(): void {
    for (const gw of this.words) {
      if (gw.found || !gw.keys.every((k) => this.cells.get(k)!.shown)) continue;
      gw.found = true;
      const mid = this.cells.get(gw.keys[Math.floor(gw.keys.length / 2)])!;
      this.addScore(gw.p.word.length * 5, mid.x, mid.y - 30);
      this.pulseWord(gw);
    }
  }

  private foundBonus(word: string): void {
    this.bonusFound.add(word);
    this.bonusCount++;
    this.refreshPreview(GOLD);
    this.sfx('bonus');
    const star = this.add.image(W / 2, PREVIEW_Y, 'll-star').setTint(GOLD).setDisplaySize(56, 56).setDepth(20);
    this.tweens.add({
      targets: star, x: this.bonusBtn.x, y: this.bonusBtn.y - 4, angle: 360, duration: 520, ease: 'Cubic.easeIn',
      onComplete: () => {
        star.destroy();
        burst(this, this.bonusBtn.x, this.bonusBtn.y, [GOLD, 0xffffff], 10, 160);
        this.tweens.add({ targets: this.bonusBtn, scale: 1.18, duration: 110, yoyo: true });
        this.addScore(word.length * 5, this.bonusBtn.x, this.bonusBtn.y - 70);
        if (this.bonusCount % BONUS_PER_HINT === 0) {
          this.hints++;
          this.sfx('hint');
          popup(this, this.hintBtn.x, this.hintBtn.y - 80, t('newHint'), '#ffd23f', 30);
          this.tweens.add({ targets: this.hintBtn, scale: 1.2, duration: 140, yoyo: true });
        }
        this.refreshButtons();
      },
    });
    popup(this, W / 2, PREVIEW_Y - 70, t('bonusWord'), '#ffd23f', 30);
    this.time.delayedCall(300, () => this.clearChain());
  }

  private repeat(msg: string, extra?: () => void): void {
    this.refreshPreview(0x8d99ae);
    this.sfx('dup');
    popup(this, W / 2, PREVIEW_Y - 70, msg, '#e0e7ff', 28);
    extra?.();
    this.time.delayedCall(320, () => this.clearChain());
  }

  private wrong(msg: string): void {
    this.streak = 0;
    this.refreshPreview(BAD);
    this.sfx('wrong');
    if (msg) popup(this, W / 2, PREVIEW_Y - 70, msg, '#ffb3c1', 28);
    this.tweens.add({
      targets: this.preview, x: W / 2 + 14, duration: 45, yoyo: true, repeat: 3,
      onComplete: () => { this.preview.setX(W / 2); this.clearChain(); },
    });
  }

  private pulseWord(gw: GridWord): void {
    gw.keys.forEach((k, i) => {
      const bg = this.cells.get(k)!.bg;
      this.tweens.add({ targets: bg, scale: bg.scale * 1.15, duration: 110, delay: i * 40, yoyo: true });
    });
  }

  private banner(text: string, color: number): void {
    const b = txt(this, W / 2, PREVIEW_Y - 120, text, { title: true, size: 44, color: Phaser.Display.Color.IntegerToColor(color).rgba }).setDepth(30).setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, y: b.y - 50, alpha: 0, duration: 400, delay: 700, onComplete: () => b.destroy() });
  }

  // ---------------------------------------------------------------- helpers: hint, shuffle, clear

  private useHint(): void {
    if (this.locked || this.isOver) return;
    if (this.hints <= 0) {
      this.sfx('dup');
      this.tweens.add({ targets: this.hintBtn, angle: 8, duration: 50, yoyo: true, repeat: 3, onComplete: () => this.hintBtn.setAngle(0) });
      return;
    }
    // the unfound word with the fewest hidden letters gets its first hidden letter
    const open = this.words.filter((w) => !w.found);
    if (!open.length) return;
    const hidden = (w: GridWord) => w.keys.filter((k) => !this.cells.get(k)!.shown).length;
    open.sort((a, b) => hidden(a) - hidden(b));
    const k = open[0].keys.find((key) => !this.cells.get(key)!.shown);
    if (!k) return;
    this.hints--;
    this.refreshButtons();
    this.sfx('hint');
    const cell = this.cells.get(k)!;
    const bulb = this.add.image(this.hintBtn.x, this.hintBtn.y, 'll-bulb').setDisplaySize(50, 50).setTint(GOLD).setDepth(20);
    this.tweens.add({
      targets: bulb, x: cell.x, y: cell.y, duration: 380, ease: 'Cubic.easeInOut',
      onComplete: () => {
        bulb.destroy();
        this.reveal(k, GOLD);
        this.autoComplete();
        this.checkClear();
      },
    });
  }

  private shuffleWheel(): void {
    if (this.locked || this.isOver || this.dragging) return;
    this.clearChain();
    const n = this.letters.length;
    const slots = Phaser.Utils.Array.Shuffle([...Array(n).keys()]);
    if (slots.every((s, i) => s === this.letters[i].slot)) slots.push(slots.shift()!);
    this.sfx('shuffle');
    this.letters.forEach((L, i) => {
      L.slot = slots[i];
      const [x, y] = this.slotPos(L.slot);
      this.tweens.add({ targets: L.c, x: WHEEL_X, y: WHEEL_Y, duration: 140, ease: 'Quad.easeIn', onComplete: () => {
        this.tweens.add({ targets: L.c, x, y, duration: 260, ease: 'Back.easeOut' });
      } });
    });
  }

  private checkClear(): void {
    if (this.isOver || this.locked || !this.words.every((w) => w.found)) return;
    this.locked = true;
    this.dragging = false;
    this.clearChain();
    this.sfx('clear', { exact: true });
    const bonus = Math.ceil(this.timeLeft) * 3 + this.level * 20;
    // a wave across the grid
    let i = 0;
    for (const cell of this.cells.values()) {
      const targets = cell.label ? [cell.bg, cell.label] : [cell.bg];
      this.tweens.add({ targets, y: '-=18', duration: 160, delay: i++ * 25, yoyo: true, ease: 'Sine.easeOut' });
      this.time.delayedCall(i * 25, () => burst(this, cell.x, cell.y, [GOLD, GOOD, 0xffffff], 4, 140));
    }
    const cy = GRID_TOP + GRID_H / 2;
    const band = this.add.graphics().setDepth(29).setAlpha(0);
    band.fillStyle(0x10132e, 0.82).fillRoundedRect(40, cy - 70, W - 80, 170, 34);
    band.lineStyle(3, GOLD, 0.6).strokeRoundedRect(40, cy - 70, W - 80, 170, 34);
    this.tweens.add({ targets: band, alpha: 1, duration: 200 });
    const title = txt(this, W / 2, GRID_TOP + GRID_H / 2, t('levelClear'), { title: true, size: 58, color: '#ffd23f' }).setDepth(30).setScale(0.3);
    const sub = txt(this, W / 2, GRID_TOP + GRID_H / 2 + 64, `${t('timeBonus')} +${bonus}`, { size: 30, color: '#ffffff' }).setDepth(30).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 300 });
    this.time.delayedCall(500, () => this.addScore(bonus));
    this.time.delayedCall(1700, () => {
      this.tweens.add({ targets: [title, sub, band], alpha: 0, duration: 250, onComplete: () => { title.destroy(); sub.destroy(); band.destroy(); } });
      this.tweens.add({
        targets: [this.gridLayer, this.wheelLayer], alpha: 0, duration: 250,
        onComplete: () => {
          this.gridLayer.setAlpha(1);
          this.wheelLayer.setAlpha(1);
          if (!this.isOver) this.nextLevel();
        },
      });
    });
  }

  // ---------------------------------------------------------------- clock

  private updateTimeUi(): void {
    const f = Phaser.Math.Clamp(this.timeLeft / this.timeMax, 0, 1);
    this.timeBar.width = (W - 84) * f;
    this.timeBar.fillColor = this.timeLeft <= 10 ? BAD : f < 0.4 ? GOLD : GOOD;
    const s = Math.max(0, Math.ceil(this.timeLeft));
    this.hud.setRight(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  }

  updateGame(_time: number, delta: number): void {
    if (this.dragging) this.drawLine();
    if (this.locked) return;
    this.timeLeft -= delta / 1000;
    const whole = Math.ceil(this.timeLeft);
    if (whole <= 10 && whole > 0 && whole !== this.lastTick) {
      this.lastTick = whole;
      this.sfx('tick');
      this.tweens.add({ targets: this.timeBar, scaleY: 1.6, duration: 90, yoyo: true });
    }
    this.updateTimeUi();
    if (this.timeLeft <= 0) {
      this.locked = true;
      this.dragging = false;
      this.clearChain();
      this.sfx('timeup');
      // show the missed words before the result screen
      for (const gw of this.words) if (!gw.found) gw.keys.forEach((k) => this.reveal(k, BAD));
      this.endGame({ title: t('timeUp'), delay: 1400 });
    }
  }
}
