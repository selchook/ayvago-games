import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, txt, t, getLang, upper } from '@core';
import { makeArt, tileKey, INK, type Kind } from './art';
import {
  dictFor, findWords, fold, lengthMultiplier, LetterBag, valueOf, MIN_WORD, RARE,
  type Dict, type Found, type Lang,
} from './letters';

// ---------------------------------------------------------------- layout (720x1280)
const W = 720;
const COLS = 7;
const ROWS = 9;
const CELL = 92;
const TILE = 86;
const BX = (W - COLS * CELL) / 2;
const BY = 186;
const BOARD_H = ROWS * CELL;
const LANE_Y = BY - 46;
const PREVIEW_Y = BY + BOARD_H + 62;
const BTN_Y = 1186;
const LEVEL_BAR_Y = 78;

const ACCENT = 0xff8a3d;
const GOOD = 0x2fbf71;
const BAD = 0xff4d6d;
const GOLD = 0xffd23f;
const HINT_TINT = 0x7df9ff;

// ---------------------------------------------------------------- tuning
const START_ROWS = 3;
const START_SHUFFLES = 2;
const START_HINTS = 2;
const MAX_HELP = 5;
/** Seconds between two valid words that still count as a combo. */
const COMBO_WINDOW = 6;
/** Words this long earn a hint. */
const LONG_WORD = 5;
/** Fewer tiles than this on the board and the rain comes faster. */
const SPARSE = 16;
/** Seconds between drops. */
const dropInterval = (level: number): number => Math.max(0.75, 2.8 * Math.pow(0.87, level - 1));
/** Words to clear a level. */
const wordsToNext = (level: number): number => 4 + level;
/** Seconds a cracked tile lasts before it hardens into stone. */
const crackLife = (level: number): number => Math.max(10, 20 - (level - 1));
/** Odds that a new tile is special. */
function specialOdds(level: number): { gold: number; bomb: number; cracked: number } {
  return {
    gold: Math.min(0.09, 0.03 + 0.006 * (level - 1)),
    bomb: level < 2 ? 0.012 : Math.min(0.07, 0.02 + 0.007 * (level - 2)),
    cracked: level < 3 ? 0 : Math.min(0.12, 0.035 + 0.012 * (level - 3)),
  };
}

interface Tile {
  ch: string;
  kind: Kind;
  c: number;
  r: number;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  val: Phaser.GameObjects.Text;
  timer: Phaser.GameObjects.Graphics;
  life: number;
  lifeMax: number;
  sel: boolean;
  hinted: boolean;
  dead: boolean;
}

interface Next {
  ch: string;
  kind: Kind;
  col: number;
}

const cellX = (c: number): number => BX + c * CELL + CELL / 2;
const cellY = (r: number): number => BY + r * CELL + CELL / 2;

/**
 * Letter Rain: letters rain onto a 7x9 board. Join neighbouring letters into words to pop them
 * before a column overflows. Gold tiles double a word, bombs clear their neighbours and cracked
 * tiles harden into stone that only a word next to it can break.
 */
export class PlayScene extends ArcadeScene {
  protected pauseOnP = false;

  private lang: Lang = 'en';
  private dict!: Dict;
  private bag!: LetterBag;
  private cols: Tile[][] = [];
  private chain: Tile[] = [];
  private dragging = false;
  private moved = false;
  private downOnLast = false;
  private pointer = { x: 0, y: 0 };
  private lockUntil = 0;

  private level = 1;
  private levelWords = 0;
  private words = 0;
  private combo = 0;
  private lastWordAt = -99;
  private shuffles = START_SHUFFLES;
  private hints = START_HINTS;
  private hintTiles: Tile[] = [];
  private hintUntil = 0;
  private next: Next = { ch: '', kind: 'normal', col: 0 };
  private forceKind: Kind | null = null;
  private dropT = 0;
  private seen = new Set<Kind>();
  private warned = new Set<number>();
  private ending = false;

  private lineG!: Phaser.GameObjects.Graphics;
  private glows: Phaser.GameObjects.Image[] = [];
  private nextBox!: Phaser.GameObjects.Container;
  private nextBg!: Phaser.GameObjects.Image;
  private nextLabel!: Phaser.GameObjects.Text;
  private nextRing!: Phaser.GameObjects.Graphics;
  private nextAlert!: Phaser.GameObjects.Text;
  private preview!: Phaser.GameObjects.Container;
  private previewG!: Phaser.GameObjects.Graphics;
  private previewText!: Phaser.GameObjects.Text;
  private previewPts!: Phaser.GameObjects.Text;
  private previewHelp!: Phaser.GameObjects.Text;
  private levelBar!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private shuffleBtn!: Phaser.GameObjects.Container;
  private shuffleBadge!: Phaser.GameObjects.Text;
  private hintBtn!: Phaser.GameObjects.Container;
  private hintBadge!: Phaser.GameObjects.Text;
  private sendBtn!: Button;

  createGame(): void {
    this.lang = getLang() as Lang;
    this.dict = dictFor(this.lang);
    this.bag = new LetterBag(this.lang);
    this.cols = Array.from({ length: COLS }, () => []);
    this.chain = [];
    this.dragging = false;
    this.moved = false;
    this.downOnLast = false;
    this.lockUntil = 0;
    this.level = 1;
    this.levelWords = 0;
    this.words = 0;
    this.combo = 0;
    this.lastWordAt = -99;
    this.shuffles = START_SHUFFLES;
    this.hints = START_HINTS;
    this.hintTiles = [];
    this.hintUntil = 0;
    this.forceKind = null;
    this.dropT = -1;
    this.seen = new Set();
    this.warned = new Set();
    this.ending = false;
    this.glows = [];

    makeArt(this);
    this.drawBackdrop();
    this.buildBoardUi();
    this.buildButtons();
    this.hud.setLevel(1);
    this.refreshLevelBar();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => this.onDown(p, over));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    this.input.on('pointerupoutside', () => this.onUp());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.fillStartBoard();
    this.pickNext(true);
    this.showPreview();
  }

  // ---------------------------------------------------------------- scene art

  private drawBackdrop(): void {
    const H = this.scale.height;
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x173a5e, 0x173a5e, 0x40235f, 0x40235f, 1).fillRect(0, 0, W, H);
    // slow floating lights
    for (let i = 0; i < 12; i++) {
      const d = this.add.image(Math.random() * W, Math.random() * H, 'lr-dot').setDepth(-9)
        .setScale(1 + Math.random() * 2.5).setAlpha(0.12 + Math.random() * 0.2)
        .setTint(Phaser.Utils.Array.GetRandom([0xffffff, 0xffd6a5, 0xa0c4ff, 0xc3a6ff]));
      this.tweens.add({ targets: d, y: d.y - 60 - Math.random() * 80, x: d.x + (Math.random() - 0.5) * 60, duration: 7000 + Math.random() * 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // faint letters drifting down like distant rain
    const abc = this.lang === 'tr' ? 'ABCÇDEFGĞHIİKLMNOÖPRSŞTUÜVYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 10; i++) {
      const size = 50 + Math.random() * 70;
      const glyph = txt(this, 30 + Math.random() * (W - 60), -100, abc[Math.floor(Math.random() * abc.length)], {
        title: true, size: Math.round(size), color: '#ffffff', strokeThickness: 0, shadow: false,
      }).setDepth(-9).setAlpha(0.05 + Math.random() * 0.04);
      const duration = 22000 + Math.random() * 16000;
      const tw = this.tweens.add({ targets: glyph, y: H + 100, angle: (Math.random() - 0.5) * 40, duration, repeat: -1 });
      tw.seek(Math.random() * duration);
    }
  }

  private buildBoardUi(): void {
    // glass panel with an empty slot for every cell (baked once: a live Graphics redraws every frame)
    const PW = COLS * CELL + 28, PH = BOARD_H + 32;
    if (!this.textures.exists('lr-board')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x000000, 0.18).fillRoundedRect(0, 4, PW, PH - 4, 30);
      g.fillStyle(0x0b1020, 0.34).fillRoundedRect(0, 0, PW, PH - 4, 30);
      g.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(1, 1, PW - 2, PH - 6, 30);
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          g.fillStyle(0xffffff, 0.05).fillRoundedRect(14 + c * CELL + (CELL - TILE) / 2 + 2, 14 + r * CELL + (CELL - TILE) / 2 + 2, TILE - 4, TILE - 8, 18);
        }
      }
      g.generateTexture('lr-board', PW, PH);
      g.destroy();
    }
    this.add.image(BX - 14, BY - 14, 'lr-board').setOrigin(0).setDepth(0);
    // danger glow behind each column
    for (let c = 0; c < COLS; c++) {
      this.glows.push(this.add.image(cellX(c), BY - 8, 'lr-colglow').setOrigin(0.5, 0).setDisplaySize(CELL - 2, BOARD_H * 0.75)
        .setTint(BAD).setAlpha(0).setDepth(1).setBlendMode(Phaser.BlendModes.ADD));
    }
    this.lineG = this.add.graphics().setDepth(7);

    // the next tile waits above its column
    this.nextRing = this.add.graphics();
    const chev = this.add.image(0, 38, 'lr-chevron').setDisplaySize(24, 14).setAlpha(0.8);
    this.nextBg = this.add.image(0, 0, 'lr-t-normal').setDisplaySize(56, 56);
    this.nextLabel = txt(this, 0, -2, '', { title: true, size: 32, color: INK.normal, strokeThickness: 0, shadow: false });
    this.nextAlert = txt(this, 0, 0, t('lookOut'), { title: true, size: 26, color: '#ff8fa3' }).setVisible(false);
    this.nextBox = this.add.container(cellX(3), LANE_Y, [this.nextRing, chev, this.nextBg, this.nextLabel, this.nextAlert]).setDepth(8);
    this.tweens.add({ targets: chev, y: 42, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // level progress under the HUD's level badge
    this.levelBar = this.add.graphics().setDepth(9000);
    this.levelText = txt(this, 466, LEVEL_BAR_Y, '', { size: 18, color: '#dfe6ff', strokeThickness: 0 }).setOrigin(0, 0.5).setDepth(9000);

    // the word being spelled
    this.previewG = this.add.graphics();
    this.previewText = txt(this, 0, 0, '', { title: true, size: 44, color: '#ffffff' });
    this.previewPts = txt(this, 0, 0, '', { title: true, size: 22, color: '#ffffff', strokeThickness: 0 });
    this.previewHelp = txt(this, 0, 0, t('dragHint'), { size: 24, color: '#dfe6ff', wrap: W - 80 }).setAlpha(0.75);
    this.preview = this.add.container(W / 2, PREVIEW_Y, [this.previewG, this.previewText, this.previewPts, this.previewHelp]).setDepth(10);
    this.preview.setSize(560, 84).setInteractive({ useHandCursor: true });
    this.preview.on('pointerup', () => {
      if (!this.dragging && this.chain.length) this.submit();
    });
  }

  private roundButton(x: number, icon: string, color: number, onClick: () => void): [Phaser.GameObjects.Container, Phaser.GameObjects.Text] {
    const shadow = this.add.image(0, 6, 'lr-disc').setDisplaySize(100, 100).setTint(0x000000).setAlpha(0.25);
    const face = this.add.image(0, 0, 'lr-disc').setDisplaySize(96, 96).setTint(color);
    const sheen = this.add.image(0, -14, 'lr-disc').setDisplaySize(70, 40).setAlpha(0.18);
    const img = this.add.image(0, 0, icon).setDisplaySize(54, 54);
    const badgeBg = this.add.circle(34, -34, 21, BAD).setStrokeStyle(3, 0xffffff);
    const badge = txt(this, 34, -35, '', { title: true, size: 22, color: '#ffffff', strokeThickness: 0 });
    const c = this.add.container(x, BTN_Y, [shadow, face, sheen, img, badgeBg, badge]).setDepth(10).setSize(104, 104).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.92, duration: 70 }));
    c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 120 }));
    c.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
      onClick();
    });
    return [c, badge];
  }

  private buildButtons(): void {
    [this.shuffleBtn, this.shuffleBadge] = this.roundButton(96, 'lr-shuffle', 0x4361ee, () => this.useShuffle());
    [this.hintBtn, this.hintBadge] = this.roundButton(W - 96, 'lr-bulb', 0xf4a261, () => this.useHint());
    this.sendBtn = new Button(this, W / 2, BTN_Y, t('send'), () => this.submit(), { width: 300, height: 96, color: 0x2fbf71, size: 36 });
    this.sendBtn.setDepth(10);
    this.refreshButtons();
  }

  private refreshButtons(): void {
    this.shuffleBadge.setText(String(this.shuffles));
    this.hintBadge.setText(String(this.hints));
    this.shuffleBtn.setAlpha(this.shuffles > 0 ? 1 : 0.5);
    this.hintBtn.setAlpha(this.hints > 0 ? 1 : 0.5);
    this.sendBtn?.setAlpha(this.chain.length >= MIN_WORD ? 1 : 0.55);
  }

  private refreshLevelBar(): void {
    const need = wordsToNext(this.level);
    const f = Phaser.Math.Clamp(this.levelWords / need, 0, 1);
    const x = 254, w = 200, h = 10;
    const g = this.levelBar.clear();
    g.fillStyle(0x0b1020, 0.55).fillRoundedRect(x - 2, LEVEL_BAR_Y - h / 2 - 2, w + 4, h + 4, 7);
    if (f > 0) g.fillStyle(GOLD, 1).fillRoundedRect(x, LEVEL_BAR_Y - h / 2, Math.max(h, w * f), h, 5);
    this.levelText.setText(t('levelWords', { n: this.levelWords, m: need }));
  }

  // ---------------------------------------------------------------- tiles

  private tileAt(c: number, r: number): Tile | null {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return this.cols[c][ROWS - 1 - r] ?? null;
  }

  private allTiles(): Tile[] {
    return this.cols.flat();
  }

  private boardLetters(): string[] {
    return this.allTiles().filter((x) => x.kind !== 'stone').map((x) => x.ch);
  }

  private letterGrid(): (string | null)[][] {
    const g: (string | null)[][] = [];
    for (let c = 0; c < COLS; c++) {
      g.push([]);
      for (let r = 0; r < ROWS; r++) {
        const tl = this.tileAt(c, r);
        g[c].push(tl && tl.kind !== 'stone' ? tl.ch : null);
      }
    }
    return g;
  }

  private makeTile(ch: string, kind: Kind, c: number, r: number): Tile {
    const shadow = this.add.image(0, 7, 'lr-shadow').setDisplaySize(TILE * 1.24, TILE * 1.24).setAlpha(0.6);
    const ring = this.add.image(0, -2, 'lr-ring').setDisplaySize(TILE * 1.24, TILE * 1.24).setVisible(false);
    const bg = this.add.image(0, 0, tileKey(kind)).setDisplaySize(TILE, TILE);
    const label = txt(this, 0, -5, ch, { title: true, size: 48, color: INK[kind], strokeThickness: 0, shadow: false });
    const val = txt(this, TILE / 2 - 15, TILE / 2 - 20, '', { size: 18, color: INK[kind], strokeThickness: 0, shadow: false });
    val.setFontStyle('bold');
    const timer = this.add.graphics();
    const box = this.add.container(cellX(c), cellY(r), [shadow, ring, bg, label, val, timer]).setDepth(5);
    const life = kind === 'cracked' ? crackLife(this.level) : 0;
    const tile: Tile = { ch, kind, c, r, box, bg, ring, label, val, timer, life, lifeMax: life, sel: false, hinted: false, dead: false };
    this.refreshTile(tile);
    return tile;
  }

  private refreshTile(tl: Tile): void {
    const stone = tl.kind === 'stone';
    tl.bg.setTexture(tileKey(tl.kind, tl.sel));
    const ink = tl.sel && (tl.kind === 'normal' || tl.kind === 'cracked') ? INK.sel : INK[tl.kind];
    tl.label.setText(stone ? '' : tl.ch).setColor(ink);
    tl.val.setText(stone ? '' : String(valueOf(this.lang, tl.ch))).setColor(ink).setAlpha(0.75);
    tl.ring.setVisible(tl.sel || tl.hinted).setTint(tl.sel ? 0xffd08a : HINT_TINT);
    if (!tl.sel && !tl.hinted) tl.ring.setAlpha(1);
    if (tl.kind !== 'cracked') tl.timer.clear();
  }

  private settleScale(tl: Tile): void {
    this.tweens.add({ targets: tl.box, scale: tl.sel ? 1.07 : 1, duration: 120, ease: 'Back.easeOut' });
  }

  private fillStartBoard(): void {
    // a few attempts: keep the start board with the most words on it
    let best: { letters: string[][]; words: number } | null = null;
    for (let i = 0; i < 24; i++) {
      const bag = new LetterBag(this.lang);
      const letters: string[][] = [];
      const flat: string[] = [];
      const grid: (string | null)[][] = [];
      for (let c = 0; c < COLS; c++) {
        const h = START_ROWS + (Math.random() < 0.4 ? 1 : 0);
        letters.push([]);
        grid.push(Array(ROWS).fill(null));
        for (let k = 0; k < h; k++) {
          const ch = bag.draw(flat);
          flat.push(ch);
          letters[c].push(ch);
          grid[c][ROWS - 1 - k] = ch;
        }
      }
      const n = findWords(grid, this.dict, 60).length;
      if (!best || n > best.words) best = { letters, words: n };
      if (n >= 14) break;
    }
    const gold = [Phaser.Math.Between(1, COLS - 2), Phaser.Math.Between(0, 1)];
    best!.letters.forEach((col, c) => col.forEach((ch, k) => {
      const r = ROWS - 1 - k;
      const kind: Kind = c === gold[0] && k === gold[1] ? 'gold' : 'normal';
      const tl = this.makeTile(ch, kind, c, r);
      this.cols[c].push(tl);
      // a short rain-in, bottom row first (tiles stay visible, so the board is never empty)
      tl.box.setY(cellY(r) - 150 - k * 40).setScale(0.9);
      this.tweens.add({
        targets: tl.box, y: cellY(r), scale: 1, duration: 300, delay: 40 + k * 90 + c * 22, ease: 'Quad.easeIn',
        onComplete: () => this.land(tl, k === 0 && c % 2 === 0),
      });
    }));
    this.time.delayedCall(1200, () => {
      const g = this.allTiles().find((x) => x.kind === 'gold');
      if (g && !this.isOver) this.introduce(g);
    });
  }

  private land(tl: Tile, sound = true): void {
    if (tl.dead) return;
    if (sound) this.sfxAt('land', tl.box.x, { volume: 0.55 });
    this.tweens.add({
      targets: tl.box, scaleY: 0.84, scaleX: 1.12, y: tl.box.y + 4, duration: 70, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => this.settleScale(tl),
    });
    burst(this, tl.box.x, tl.box.y + TILE / 2 - 6, [0xffffff, 0xdfe6ff], 4, 70);
  }

  /** A one-time caption the first time a special tile shows up. */
  private introduce(tl: Tile): void {
    if (this.seen.has(tl.kind) || tl.kind === 'normal' || tl.dead) return;
    this.seen.add(tl.kind);
    const key = { gold: 'introGold', bomb: 'introBomb', cracked: 'introCracked', stone: 'introStone' }[tl.kind];
    const y = Math.max(BY + 50, tl.box.y - 86);
    const label = txt(this, W / 2, y, t(key), { size: 26, color: '#ffffff', strokeThickness: 0, wrap: W - 120 });
    const w = label.width + 40, h = label.height + 22;
    const g = this.add.graphics();
    g.fillStyle(0x0b1020, 0.88).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(3, tl.kind === 'gold' ? GOLD : tl.kind === 'bomb' ? 0xff8c5a : 0xc9b8a6, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    label.setPosition(0, 0);
    const cx = Phaser.Math.Clamp(tl.box.x, w / 2 + 16, W - w / 2 - 16);
    const cap = this.add.container(cx, y, [g, label]).setDepth(30).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: cap, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: cap, alpha: 0, y: y - 20, delay: 2800, duration: 400, onComplete: () => cap.destroy() });
    this.tweens.add({ targets: tl.box, angle: 8, duration: 90, yoyo: true, repeat: 3, onComplete: () => tl.box.setAngle(0) });
  }

  // ---------------------------------------------------------------- rain

  private pickNext(first = false): void {
    let kind: Kind = 'normal';
    if (this.forceKind) {
      kind = this.forceKind;
      this.forceKind = null;
    } else {
      const o = specialOdds(this.level);
      const x = Math.random();
      if (x < o.gold) kind = 'gold';
      else if (x < o.gold + o.bomb) kind = 'bomb';
      else if (x < o.gold + o.bomb + o.cracked) kind = 'cracked';
    }
    const tiles = this.allTiles();
    if (kind === 'bomb' && tiles.filter((x) => x.kind === 'bomb').length >= 2) kind = 'normal';
    if (kind === 'cracked' && tiles.filter((x) => x.kind === 'cracked').length >= 3) kind = 'normal';
    let ch = this.bag.draw(this.boardLetters());
    // specials carry everyday letters, so they can be used
    for (let i = 0; i < 4 && kind !== 'normal' && valueOf(this.lang, ch) >= RARE; i++) ch = this.bag.draw(this.boardLetters());
    // emptier columns are likelier targets
    const weights = this.cols.map((col) => Math.pow(1 + ROWS - col.length, 1.3));
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    let col = 0;
    for (; col < COLS - 1; col++) if ((x -= weights[col]) <= 0) break;
    this.next = { ch, kind, col };

    this.nextBg.setTexture(tileKey(kind));
    this.nextLabel.setText(ch).setColor(INK[kind]);
    // the tile that just fell leaves from here: the next one appears over its column a beat later
    this.tweens.killTweensOf(this.nextBox);
    this.nextBox.setScale(0.3).setAlpha(0);
    if (first) this.nextBox.setX(cellX(col));
    this.tweens.add({ targets: this.nextBox, x: cellX(col), duration: 1, delay: first ? 0 : 220 });
    this.tweens.add({ targets: this.nextBox, scale: 1, alpha: 1, duration: 260, delay: first ? 0 : 240, ease: 'Back.easeOut' });
    this.checkTargetAlert(true);
  }

  /** Red alert when the next tile is aimed at a full column. */
  private checkTargetAlert(fresh = false): void {
    const full = this.cols[this.next.col].length >= ROWS;
    if (full && fresh && !this.isOver) {
      this.sfx('alarm', { volume: 0.5 });
      shake(this, 0.004, 160);
    }
    // beside the waiting tile, on the side with room
    const side = this.next.col <= COLS / 2 ? 1 : -1;
    this.nextAlert.setVisible(full).setOrigin(side > 0 ? 0 : 1, 0.5).setX(side * 50);
  }

  private drop(): void {
    const { ch, kind, col } = this.next;
    if (this.cols[col].length >= ROWS) {
      this.boardFull(col);
      return;
    }
    const r = ROWS - 1 - this.cols[col].length;
    const tl = this.makeTile(ch, kind, col, r);
    this.cols[col].push(tl);
    tl.box.setPosition(cellX(col), LANE_Y).setScale(0.65);
    this.tweens.add({
      targets: tl.box, y: cellY(r), scale: 1, duration: 160 + (r + 1) * 40, ease: 'Quad.easeIn',
      onComplete: () => {
        this.land(tl);
        if (tl.kind !== 'normal') this.introduce(tl);
      },
    });
    const h = this.cols[col].length;
    if (h >= ROWS - 1 && !this.warned.has(col)) {
      this.warned.add(col);
      this.sfx('warn', { volume: 0.6 });
    }
    this.pickNext();
  }

  private boardFull(col: number): void {
    if (this.ending) return;
    this.ending = true;
    this.dragging = false;
    this.clearChain();
    // the overflowing tile smashes on top of the column
    const { ch, kind } = this.next;
    const tl = this.makeTile(ch, kind, col, 0);
    tl.box.setPosition(cellX(col), LANE_Y).setDepth(9);
    tl.bg.setTint(0xff9aa8);
    this.nextBox.setVisible(false);
    this.tweens.add({ targets: tl.box, y: BY - 6, angle: 14, duration: 180, ease: 'Quad.easeIn', onComplete: () => {
      this.tweens.add({ targets: tl.box, y: BY - 30, angle: -10, duration: 160, yoyo: true, ease: 'Sine.easeOut' });
    } });
    this.sfx('over');
    shake(this, 0.018, 450);
    flash(this, BAD, 300, 0.35);
    this.glows[col].setAlpha(1);
    this.tweens.add({ targets: this.glows[col], alpha: 0.4, duration: 220, yoyo: true, repeat: -1 });
    // the board greys out column by column
    this.allTiles().forEach((x) => {
      this.time.delayedCall(250 + Math.abs(x.c - col) * 70 + x.r * 20, () => {
        x.bg.setTint(0x8a8fa3);
        this.tweens.add({ targets: x.box, y: x.box.y + 6, duration: 120, yoyo: true });
      });
    });
    this.endGame({ title: t('boardFull'), delay: 1500 });
  }

  // ---------------------------------------------------------------- input

  private tileAtPoint(x: number, y: number, inner: boolean): Tile | null {
    const c = Math.floor((x - BX) / CELL), r = Math.floor((y - BY) / CELL);
    const tl = this.tileAt(c, r);
    if (!tl || tl.dead || tl.kind === 'stone') return null;
    if (inner && Phaser.Math.Distance.Between(x, y, cellX(c), cellY(r)) > CELL * 0.42) return null;
    return tl;
  }

  private adjacent(a: Tile, b: Tile): boolean {
    return a !== b && Math.abs(a.c - b.c) <= 1 && Math.abs(a.r - b.r) <= 1;
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.isOver || this.ending || over.length) return;
    if (this.elapsed < this.lockUntil) return;
    const tl = this.tileAtPoint(p.x, p.y, false);
    if (!tl) {
      // a tap beside the tiles drops the word being built
      if (this.chain.length) this.clearChain();
      return;
    }
    this.dragging = true;
    this.moved = false;
    this.downOnLast = false;
    this.pointer = { x: p.x, y: p.y };
    const idx = this.chain.indexOf(tl);
    if (idx >= 0) {
      if (idx === this.chain.length - 1) this.downOnLast = true;
      else {
        while (this.chain.length > idx + 1) this.popTile();
        this.sfx('sel', { rate: 0.85 + this.chain.length * 0.07, volume: 0.6 });
      }
    } else if (this.chain.length && this.adjacent(this.chain[this.chain.length - 1], tl)) {
      this.addTile(tl);
    } else {
      this.clearChain();
      this.addTile(tl);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    if (!p.isDown) { this.onUp(); return; }
    this.pointer = { x: p.x, y: p.y };
    const tl = this.tileAtPoint(p.x, p.y, true);
    if (!tl || !this.chain.length) return;
    const idx = this.chain.indexOf(tl);
    if (idx < 0 && this.adjacent(this.chain[this.chain.length - 1], tl)) {
      this.addTile(tl);
      this.moved = true;
    } else if (idx >= 0 && idx === this.chain.length - 2) {
      this.popTile();
      this.moved = true;
    }
  }

  private onUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved) this.submit();
    else if (this.downOnLast) {
      // tapping the last letter again takes it back
      this.popTile();
      this.sfx('deny', { volume: 0.5 });
    }
    this.downOnLast = false;
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver || this.ending || this.dragging || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { this.submit(); return; }
    if (e.key === 'Backspace') { this.popTile(); return; }
    if (e.key === ' ') { this.useShuffle(); return; }
    if (e.key === '1' || e.key === '?') { this.useHint(); return; }
    if (e.key.length !== 1 || !/\p{L}/u.test(e.key)) return;
    const ch = upper(e.key);
    const path = this.findTypedPath([...this.chain.map((x) => x.ch), ch]);
    if (!path) {
      this.nudgePreview();
      this.sfx('deny', { volume: 0.5 });
      return;
    }
    // keep the tiles already chosen where possible; otherwise re-route the whole word
    const keep = this.chain.every((x, i) => path[i] === x);
    if (keep) this.addTile(path[path.length - 1]);
    else {
      this.clearChain();
      for (const x of path) this.addTile(x, false);
      this.sfx('sel', { rate: Math.min(1.7, 0.85 + path.length * 0.07), volume: 0.7 });
    }
  }

  /** A path of neighbouring tiles that spells the typed letters (Turkish letters fold onto plain ones). */
  private findTypedPath(seq: string[]): Tile[] | null {
    const match = (tl: Tile, ch: string): number => (tl.ch === ch ? 2 : this.lang === 'tr' && fold(tl.ch) === fold(ch) ? 1 : 0);
    // extending the current chain first
    if (this.chain.length === seq.length - 1) {
      const last = this.chain[this.chain.length - 1];
      const ch = seq[seq.length - 1];
      const cands = this.allTiles().filter((x) => x.kind !== 'stone' && !this.chain.includes(x) && (!last || this.adjacent(last, x)) && match(x, ch))
        .sort((a, b) => match(b, ch) - match(a, ch));
      if (cands.length && (last || cands.length === 1)) return [...this.chain, cands[0]];
    }
    const tiles = this.allTiles().filter((x) => x.kind !== 'stone');
    const path: Tile[] = [];
    const dfs = (tl: Tile, i: number): boolean => {
      path.push(tl);
      if (i === seq.length - 1) return true;
      const cands = tiles.filter((x) => !path.includes(x) && this.adjacent(tl, x) && match(x, seq[i + 1]))
        .sort((a, b) => match(b, seq[i + 1]) - match(a, seq[i + 1]));
      for (const n of cands) if (dfs(n, i + 1)) return true;
      path.pop();
      return false;
    };
    const starts = tiles.filter((x) => match(x, seq[0])).sort((a, b) => match(b, seq[0]) - match(a, seq[0]));
    // prefer starting where the current chain starts
    if (this.chain[0]) starts.sort((a, b) => (b === this.chain[0] ? 1 : 0) - (a === this.chain[0] ? 1 : 0));
    for (const s of starts) if (dfs(s, 0)) return [...path];
    return null;
  }

  private addTile(tl: Tile, sound = true): void {
    this.chain.push(tl);
    tl.sel = true;
    this.refreshTile(tl);
    this.tweens.killTweensOf(tl.box);
    tl.box.setY(cellY(tl.r));
    this.tweens.add({ targets: tl.box, scale: 1.07, duration: 110, ease: 'Back.easeOut' });
    if (sound) this.sfx('sel', { rate: Math.min(1.7, 0.85 + this.chain.length * 0.07), volume: 0.7 });
    this.showPreview();
  }

  private popTile(): void {
    const tl = this.chain.pop();
    if (!tl) return;
    this.deselect(tl);
    this.showPreview();
  }

  private deselect(tl: Tile): void {
    tl.sel = false;
    if (tl.dead) return;
    this.refreshTile(tl);
    this.settleScale(tl);
  }

  private clearChain(): void {
    for (const tl of this.chain) this.deselect(tl);
    this.chain = [];
    this.lineG?.clear();
    this.showPreview();
  }

  private word(): string {
    return this.chain.map((x) => x.ch).join('');
  }

  private wordPoints(tiles: Tile[]): number {
    const sum = tiles.reduce((a, x) => a + valueOf(this.lang, x.ch), 0);
    const gold = Math.pow(2, tiles.filter((x) => x.kind === 'gold').length);
    return Math.round(sum * lengthMultiplier(tiles.length) * gold * 10);
  }

  // ---------------------------------------------------------------- preview bubble

  private showPreview(word?: string, color?: number): void {
    const w = word ?? this.word();
    const g = this.previewG.clear();
    this.previewHelp.setVisible(!w && !this.ending);
    this.previewText.setText(w);
    this.previewPts.setText('');
    this.refreshButtons();
    if (!w) return;
    let fill = color ?? ACCENT;
    if (color === undefined && w.length >= MIN_WORD && this.dict.words.has(w)) {
      fill = GOOD;
      this.previewPts.setText(`+${this.wordPoints(this.chain)}`);
    }
    const pw = this.previewPts.text ? this.previewPts.width + 22 : 0;
    const bw = Math.max(110, this.previewText.width + 52 + pw);
    this.previewText.setX(-pw / 2);
    this.previewPts.setX(bw / 2 - pw / 2 - 14);
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-bw / 2, -32, bw, 72, 36);
    g.fillStyle(fill, 1).fillRoundedRect(-bw / 2, -36, bw, 72, 36);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(-bw / 2 + 8, -32, bw - 16, 26, 14);
    if (pw) g.fillStyle(0x000000, 0.2).fillRoundedRect(bw / 2 - pw - 8, -24, pw, 48, 24);
  }

  private nudgePreview(): void {
    this.tweens.add({ targets: this.preview, x: W / 2 + 10, duration: 40, yoyo: true, repeat: 2, onComplete: () => this.preview.setX(W / 2) });
  }

  /** Keeps a finished word in the bubble a moment, unless a new word is started. */
  private holdPreview(word: string, color: number): void {
    this.showPreview(word, color);
    this.time.delayedCall(520, () => {
      if (!this.chain.length) this.showPreview();
    });
  }

  // ---------------------------------------------------------------- words

  private submit(): void {
    if (this.isOver || this.ending || !this.chain.length) return;
    this.dragging = false;
    const word = this.word();
    if (word.length < MIN_WORD) {
      if (word.length === 1) { this.clearChain(); return; }
      this.wrong(word, t('tooShort'));
      return;
    }
    if (!this.dict.words.has(word)) {
      this.wrong(word, t('notWord'));
      return;
    }
    this.goodWord(word, [...this.chain]);
  }

  private wrong(word: string, msg: string): void {
    this.combo = 0;
    this.clearChain();
    this.holdPreview(word, BAD);
    this.sfx('wrong', { volume: 0.7 });
    popup(this, W / 2, PREVIEW_Y - 70, msg, '#ffb3c1', 26);
    this.tweens.killTweensOf(this.preview);
    this.preview.setX(W / 2);
    this.tweens.add({ targets: this.preview, x: W / 2 + 14, duration: 45, yoyo: true, repeat: 3, onComplete: () => this.preview.setX(W / 2) });
  }

  private goodWord(word: string, tiles: Tile[]): void {
    this.clearHint();
    this.words++;
    const len = tiles.length;
    let pts = this.wordPoints(tiles);
    const golds = tiles.filter((x) => x.kind === 'gold').length;
    // combo for words in quick succession
    this.combo = this.elapsed - this.lastWordAt <= COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastWordAt = this.elapsed;
    const comboBonus = this.combo >= 2 ? Math.round(pts * Math.min(1, 0.25 * (this.combo - 1))) : 0;

    // everything this word clears: its tiles, stones next to it, and what bombs blow up
    const gone = new Set<Tile>(tiles);
    const stones = new Set<Tile>();
    for (const tl of tiles) this.neighbours(tl).forEach((n) => { if (n.kind === 'stone') stones.add(n); });
    stones.forEach((s) => gone.add(s));
    const blasts: { bomb: Tile; hit: Tile[] }[] = [];
    const queue = tiles.filter((x) => x.kind === 'bomb');
    const blown = new Set<Tile>(queue);
    while (queue.length) {
      const b = queue.shift()!;
      const hit = this.neighbours(b).filter((n) => !gone.has(n));
      hit.forEach((n) => {
        gone.add(n);
        if (n.kind === 'bomb' && !blown.has(n)) { blown.add(n); queue.push(n); }
      });
      blasts.push({ bomb: b, hit });
    }
    let extra = stones.size * 30;
    for (const { hit } of blasts) for (const n of hit) extra += n.kind === 'stone' ? 30 : valueOf(this.lang, n.ch) * 10;
    pts += comboBonus + extra;

    // logic first: the tiles leave the board now
    this.chain = [];
    this.lineG.clear();
    for (const tl of gone) tl.dead = true;
    for (let c = 0; c < COLS; c++) {
      this.cols[c] = this.cols[c].filter((x) => !x.dead);
      this.cols[c].forEach((x, k) => { x.r = ROWS - 1 - k; });
      if (this.cols[c].length < ROWS - 1) this.warned.delete(c);
    }

    // the word pops letter by letter
    this.holdPreview(word, GOOD);
    this.sfx('valid', { volume: 0.8, rate: Math.min(1.4, 0.92 + (len - 3) * 0.06) });
    if (len >= LONG_WORD) this.time.delayedCall(140, () => this.sfx('great', { volume: 0.6 }));
    const tint = golds ? [GOLD, 0xffffff, 0xffb000] : [ACCENT, 0xffffff, 0xffd6a5];
    tiles.forEach((tl, i) => this.burstTile(tl, i * 45, tint));
    const popEnd = len * 45 + 120;
    this.lockUntil = this.elapsed + popEnd / 1000;
    stones.forEach((s) => this.time.delayedCall(popEnd - 60, () => this.crumble(s)));
    blasts.forEach(({ bomb, hit }, i) => this.time.delayedCall(popEnd + i * 160, () => this.explode(bomb, hit)));
    const settle = popEnd + (blasts.length ? 160 * blasts.length + 120 : 0);
    this.time.delayedCall(settle, () => this.gravity());

    // score popup at the middle of the word
    const mid = tiles[Math.floor(len / 2)];
    const mx = Phaser.Math.Clamp(mid.box.x, 90, W - 90), my = mid.box.y - 30;
    this.addScore(pts);
    const big = txt(this, mx, my, `+${pts}`, { title: true, size: len >= 6 ? 56 : 44, color: golds ? '#ffd23f' : '#ffffff' }).setDepth(40).setScale(0.4);
    this.tweens.add({ targets: big, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: big, y: my - 80, alpha: 0, delay: 500, duration: 500, onComplete: () => big.destroy() });
    if (golds) popup(this, mx, my + 40, `×${Math.pow(2, golds)}`, '#ffd23f', 30);
    if (this.combo >= 2) {
      this.banner(`${t('combo')} ×${this.combo}`, this.combo >= 4 ? 0xff7ab8 : 0x7df9ff, BY + BOARD_H * 0.32);
      this.sfx('combo', { volume: 0.6 });
    } else if (len >= LONG_WORD) {
      this.banner(t(len >= 7 ? 'praise3' : len >= 6 ? 'praise2' : 'praise1'), GOLD, BY + BOARD_H * 0.32);
    }
    if (len >= 6) shake(this, 0.006, 160);

    // long words earn a hint
    if (len >= LONG_WORD && this.hints < MAX_HELP) {
      this.hints++;
      this.time.delayedCall(300, () => {
        popup(this, this.hintBtn.x - 40, this.hintBtn.y - 80, t('newHint'), '#7df9ff', 26);
        this.tweens.add({ targets: this.hintBtn, scale: 1.2, duration: 140, yoyo: true });
        this.sfx('hint', { volume: 0.5 });
      });
    }

    this.levelWords++;
    if (this.levelWords >= wordsToNext(this.level)) this.time.delayedCall(settle + 100, () => this.levelUp());
    this.refreshLevelBar();
    this.refreshButtons();
    this.checkTargetAlert();
  }

  private neighbours(tl: Tile): Tile[] {
    const out: Tile[] = [];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue;
      const n = this.tileAt(tl.c + dc, tl.r + dr);
      if (n && !n.dead) out.push(n);
    }
    return out;
  }

  private burstTile(tl: Tile, delay: number, tint: number[]): void {
    this.tweens.killTweensOf(tl.box);
    tl.bg.setTexture(tl.kind === 'gold' ? 'lr-t-gold' : 'lr-t-sel');
    this.tweens.add({
      targets: tl.box, scale: 1.3, duration: 90, delay, ease: 'Quad.easeOut',
      onComplete: () => {
        burst(this, tl.box.x, tl.box.y, tint, 10, 260);
        this.tweens.add({ targets: tl.box, scale: 0, alpha: 0, angle: Phaser.Math.Between(-30, 30), duration: 160, ease: 'Back.easeIn', onComplete: () => tl.box.destroy() });
      },
    });
  }

  private crumble(s: Tile): void {
    this.sfxAt('crumble', s.box.x, { volume: 0.7 });
    burst(this, s.box.x, s.box.y, [0x9aa1b0, 0x6d7382, 0xd0d4dc], 14, 220);
    this.tweens.killTweensOf(s.box);
    this.tweens.add({ targets: s.box, scale: 0.2, alpha: 0, y: s.box.y + 30, angle: 40, duration: 260, ease: 'Quad.easeIn', onComplete: () => s.box.destroy() });
  }

  private explode(bomb: Tile, hit: Tile[]): void {
    this.sfxAt('bomb', bomb.box.x, { volume: 0.8 });
    shake(this, 0.014, 260);
    flash(this, 0xffa040, 160, 0.25);
    burst(this, bomb.box.x, bomb.box.y, [0xffd23f, 0xff7a2f, 0xff4d6d, 0xffffff], 34, 420);
    const ringG = this.add.circle(bomb.box.x, bomb.box.y, 20).setStrokeStyle(10, 0xffc061, 1).setDepth(30);
    this.tweens.add({ targets: ringG, scale: 7, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ringG.destroy() });
    for (const n of hit) {
      this.tweens.killTweensOf(n.box);
      const dx = n.box.x - bomb.box.x, dy = n.box.y - bomb.box.y;
      burst(this, n.box.x, n.box.y, n.kind === 'stone' ? [0x9aa1b0, 0x6d7382] : [0xffd23f, 0xffffff], 8, 200);
      this.tweens.add({
        targets: n.box, x: n.box.x + dx * 0.6, y: n.box.y + dy * 0.6, angle: Phaser.Math.Between(-90, 90), scale: 0.2, alpha: 0,
        duration: 320, ease: 'Quad.easeOut', onComplete: () => n.box.destroy(),
      });
    }
  }

  /** Tiles above the cleared ones fall into place with a bounce (their rows are already set). */
  private gravity(): void {
    if (this.ending) return;
    for (let c = 0; c < COLS; c++) {
      this.cols[c].forEach((tl, k) => {
        const y = cellY(tl.r);
        if (Math.abs(tl.box.y - y) < 1) return;
        const rows = Math.max(0, (y - tl.box.y) / CELL);
        this.tweens.killTweensOf(tl.box);
        this.tweens.add({
          targets: tl.box, y, scale: tl.sel ? 1.07 : 1, alpha: 1, angle: 0, duration: 260 + rows * 50, delay: k * 18, ease: 'Bounce.easeOut',
        });
      });
    }
  }

  private levelUp(): void {
    if (this.isOver || this.ending) return;
    this.level++;
    this.levelWords = 0;
    this.hud.setLevel(this.level);
    this.refreshLevelBar();
    this.sfx('levelup', { exact: true, volume: 0.8 });
    flash(this, 0xffffff, 200, 0.18);
    this.banner(`${t('level')} ${this.level}`, GOLD, BY + BOARD_H * 0.42, t('faster'));
    burst(this, W / 2, BY + BOARD_H * 0.42, [GOLD, 0xffffff, 0x7df9ff], 30, 380);
    if (this.level === 2) this.forceKind = 'bomb';
    if (this.level === 3) this.forceKind = 'cracked';
    if (this.shuffles < MAX_HELP) {
      this.shuffles++;
      this.time.delayedCall(500, () => {
        popup(this, this.shuffleBtn.x + 40, this.shuffleBtn.y - 80, t('newShuffle'), '#a5b4ff', 26);
        this.tweens.add({ targets: this.shuffleBtn, scale: 1.2, duration: 140, yoyo: true });
      });
    }
    this.refreshButtons();
  }

  private banner(text: string, color: number, y: number, sub?: string): void {
    const b = txt(this, W / 2, y, text, { title: true, size: 56, color: Phaser.Display.Color.IntegerToColor(color).rgba }).setDepth(50).setScale(0.4).setAlpha(0);
    const s = sub ? txt(this, W / 2, y + 56, sub, { size: 28, color: '#ffffff' }).setDepth(50).setAlpha(0) : null;
    this.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    if (s) this.tweens.add({ targets: s, alpha: 1, duration: 200, delay: 150 });
    this.tweens.add({ targets: s ? [b, s] : b, y: `-=50`, alpha: 0, duration: 420, delay: sub ? 1200 : 700, onComplete: () => { b.destroy(); s?.destroy(); } });
  }

  // ---------------------------------------------------------------- helpers

  private deny(btn: Phaser.GameObjects.Container): void {
    this.sfx('deny');
    this.tweens.add({ targets: btn, angle: 8, duration: 50, yoyo: true, repeat: 3, onComplete: () => btn.setAngle(0) });
  }

  private useShuffle(): void {
    if (this.isOver || this.ending) return;
    if (this.shuffles <= 0) { this.deny(this.shuffleBtn); return; }
    this.clearChain();
    this.clearHint();
    const tiles = this.allTiles().filter((x) => x.kind !== 'stone');
    if (tiles.length < 2) return;
    const letters = tiles.map((x) => x.ch);
    // a few shuffles; keep the one that spells the most words
    let best = letters, bestN = -1;
    for (let i = 0; i < 10; i++) {
      const order = Phaser.Utils.Array.Shuffle([...letters]);
      const grid = this.letterGrid();
      tiles.forEach((x, k) => { grid[x.c][x.r] = order[k]; });
      const n = findWords(grid, this.dict, 40).length;
      if (n > bestN) { best = order; bestN = n; }
      if (n >= 12) break;
    }
    this.shuffles--;
    this.refreshButtons();
    this.sfx('shuffle');
    tiles.forEach((x, k) => {
      x.ch = best[k];
      this.tweens.killTweensOf(x.box);
      x.box.setY(cellY(x.r)).setScale(1).setAngle(0);
      this.tweens.add({
        targets: x.box, scaleX: 0, duration: 110, delay: (x.c + (ROWS - x.r)) * 22, ease: 'Quad.easeIn',
        onComplete: () => {
          this.refreshTile(x);
          this.tweens.add({ targets: x.box, scaleX: 1, duration: 170, ease: 'Back.easeOut' });
        },
      });
    });
  }

  private useHint(): void {
    if (this.isOver || this.ending) return;
    if (this.hints <= 0) { this.deny(this.hintBtn); return; }
    const found = findWords(this.letterGrid(), this.dict);
    if (!found.length) {
      this.sfx('deny');
      popup(this, W / 2, PREVIEW_Y - 70, t('noWords'), '#ffd23f', 28);
      this.tweens.add({ targets: this.shuffleBtn, scale: 1.2, duration: 140, yoyo: true, repeat: 1 });
      return;
    }
    const value = (f: Found) => f.path.reduce((a, [c, r]) => a + valueOf(this.lang, this.tileAt(c, r)!.ch), 0) * lengthMultiplier(f.word.length);
    found.sort((a, b) => value(b) - value(a));
    // the best word, but not always the longest monster: one of the top three
    const pick = found[Math.floor(Math.random() * Math.min(3, found.length))];
    this.clearChain();
    this.clearHint();
    this.hints--;
    this.refreshButtons();
    this.sfx('hint');
    this.hintTiles = pick.path.map(([c, r]) => this.tileAt(c, r)!);
    this.hintUntil = this.elapsed + 10;
    this.hintTiles.forEach((tl, i) => {
      tl.hinted = true;
      this.refreshTile(tl);
      tl.ring.setAlpha(0.3);
      this.tweens.add({ targets: tl.ring, alpha: 1, duration: 260, delay: i * 140, yoyo: true, repeat: -1, repeatDelay: this.hintTiles.length * 140 });
      this.tweens.add({ targets: tl.box, scale: 1.1, duration: 140, delay: i * 140, yoyo: true });
    });
    const first = this.hintTiles[0];
    burst(this, first.box.x, first.box.y, [HINT_TINT, 0xffffff], 12, 160);
  }

  private clearHint(): void {
    for (const tl of this.hintTiles) {
      tl.hinted = false;
      this.tweens.killTweensOf(tl.ring);
      if (!tl.dead) this.refreshTile(tl);
    }
    this.hintTiles = [];
  }

  // ---------------------------------------------------------------- cracked tiles

  private harden(tl: Tile): void {
    if (this.chain.includes(tl)) this.clearChain();
    if (tl.hinted) this.clearHint();
    tl.kind = 'stone';
    tl.timer.clear();
    tl.box.setAngle(0);
    this.refreshTile(tl);
    this.sfxAt('harden', tl.box.x, { volume: 0.8 });
    burst(this, tl.box.x, tl.box.y, [0x9aa1b0, 0xd0d4dc], 10, 160);
    this.tweens.add({ targets: tl.box, scale: 1.15, duration: 90, yoyo: true });
    this.introduce(tl);
  }

  private drawCrackTimer(tl: Tile, time: number): void {
    const f = Phaser.Math.Clamp(tl.life / tl.lifeMax, 0, 1);
    const g = tl.timer.clear();
    const x = -TILE / 2 + 17, y = -TILE / 2 + 17, R = 10;
    g.fillStyle(0x3b2412, 0.55).fillCircle(x, y, R + 3);
    const col = f > 0.5 ? 0xffd23f : f > 0.25 ? 0xff9a3d : BAD;
    g.fillStyle(col, 1).slice(x, y, R, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false).fillPath();
    // the last seconds wobble
    tl.box.setAngle(tl.life < 4 ? Math.sin(time * 0.03) * 5 : 0);
  }

  // ---------------------------------------------------------------- frame

  private drawLine(): void {
    const g = this.lineG.clear();
    if (!this.chain.length) return;
    const pts = this.chain.map((x) => [x.box.x, x.box.y]);
    if (pts.length > 1 || this.dragging) {
      g.lineStyle(12, 0xffffff, 0.5);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      if (this.dragging && this.moved) g.lineTo(this.pointer.x, this.pointer.y);
      g.strokePath();
    }
  }

  updateGame(time: number, delta: number): void {
    const dt = delta / 1000;
    this.drawLine();
    if (this.ending) return;

    // cracked tiles count down
    for (const tl of this.allTiles()) {
      if (tl.kind !== 'cracked' || tl.dead) continue;
      tl.life -= dt;
      if (tl.life <= 0) this.harden(tl);
      else this.drawCrackTimer(tl, time);
    }

    // column danger glow
    for (let c = 0; c < COLS; c++) {
      const h = this.cols[c].length;
      const target = c === this.next.col;
      let a = 0;
      if (h >= ROWS) a = 0.55 + 0.3 * Math.sin(time * 0.012);
      else if (h === ROWS - 1) a = 0.32 + 0.14 * Math.sin(time * 0.008);
      else if (h === ROWS - 2) a = 0.14 + 0.06 * Math.sin(time * 0.005);
      if (target && h >= ROWS - 1) a = Math.min(1, a + 0.2);
      this.glows[c].setAlpha(a);
    }

    // hint fades after a while
    if (this.hintTiles.length && this.elapsed > this.hintUntil) this.clearHint();

    // the rain
    const sparse = this.allTiles().length < SPARSE;
    const interval = dropInterval(this.level) * (sparse ? 0.45 : 1);
    this.dropT += dt;
    const f = Phaser.Math.Clamp(this.dropT / interval, 0, 1);
    const full = this.cols[this.next.col].length >= ROWS;
    const g = this.nextRing.clear();
    g.lineStyle(5, 0x000000, 0.3).strokeCircle(0, 0, 38);
    if (f > 0) {
      g.lineStyle(5, full ? BAD : 0xffffff, full ? 1 : 0.8);
      g.beginPath();
      g.arc(0, 0, 38, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false);
      g.strokePath();
    }
    if (full) {
      this.nextBg.setTint(Math.sin(time * 0.02) > 0 ? 0xff8095 : 0xffffff);
      this.nextAlert.setScale(1 + 0.08 * Math.sin(time * 0.015));
    } else this.nextBg.clearTint();
    if (this.dropT >= interval) {
      this.dropT = 0;
      this.drop();
    }
  }
}
