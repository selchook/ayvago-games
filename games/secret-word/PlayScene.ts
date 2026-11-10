import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, txt, t, getLang, upper, type Lang, hudChip, HudChip, HUD_ROW2_Y, HUD_MARGIN } from '@core';
import {
  ALPHABET, KEY_ROWS, LIVES, MAX_JOKERS, REMOVE_COUNT, SOLVES_PER_JOKER, START_JOKERS, TRIES,
  buildDict, chars, evaluate, lengthFor, multiplierFor, pickAnswer, pointsFor, resolveGuess, timeFor,
  type Dict, type Mark,
} from './logic';
import { AMBER, CREAM, GOLD, GREEN, GREY, INK, ROSE, TEAL, backdrop, makeTextures, markColor } from './art';
import { COMMON as TR_COMMON, EXTRA as TR_EXTRA } from '../../src/words/tr';
import { COMMON as EN_COMMON, EXTRA as EN_EXTRA } from '../../src/words/en';

// ---------------------------------------------------------------- layout (720x1280)
const W = 720;
// the clock bar sits in a chip on the second HUD row, the multiplier chip right of it
const TIMER_W = 532;
const TIMER_X0 = -TIMER_W / 2;
const BOARD_TOP = 156;
const TILE = 96;
const GAP = 10;
const BOARD_H = TRIES * TILE + (TRIES - 1) * GAP;
const BOARD_MID = BOARD_TOP + BOARD_H / 2;
const JOKER_Y = 842;
const KEY_Y0 = 944;
const KEY_PITCH_Y = 106;
const KEY_H = 98;
const KB_W = 708;
/** Seconds left when the clock starts to pulse, and when it starts to tick. */
const LOW_TIME = 15;
const TICK_TIME = 10;

const dicts: Partial<Record<Lang, Dict>> = {};
function dictFor(lang: Lang): Dict {
  return (dicts[lang] ??= lang === 'tr' ? buildDict('tr', TR_COMMON, TR_EXTRA) : buildDict('en', EN_COMMON, EN_EXTRA));
}

interface Tile {
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

interface Key {
  ch: string;
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

interface JokerButton {
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
}

/**
 * Secret Word: guess the hidden word in six tries, word after word against the clock.
 * Green = right place, amber = elsewhere in the word, grey = not in the word.
 */
export class PlayScene extends ArcadeScene {
  protected pauseOnP = false;

  private lang: Lang = 'en';
  private dict!: Dict;
  private used = new Set<string>();
  /** The hidden word (public so test scripts can read it). */
  answer = '';
  private ans: string[] = [];
  private len = 4;
  private wordNum = 0;
  private row = 0;
  private cur: (string | null)[] = [];
  /** Positions the reveal joker has fixed for this word. */
  private locked = new Map<number, string>();
  private knownGreen = new Set<number>();
  private keyState = new Map<string, Mark>();
  private lives = LIVES;
  private streak = 0;
  private solves = 0;
  private jokers = START_JOKERS;
  private timeLeft = 0;
  private timeMax = 1;
  private lastTick = 0;
  private busy = true;

  private boardLayer!: Phaser.GameObjects.Container;
  private rows: Phaser.GameObjects.Container[] = [];
  private tiles: Tile[][] = [];
  private tileSize = TILE;
  /** Key objects by letter (public so test scripts can tap them). */
  keys = new Map<string, Key>();
  private enterKey!: Phaser.GameObjects.Container;
  private backKey!: Phaser.GameObjects.Container;
  revealBtn!: JokerButton;
  removeBtn!: JokerButton;
  private pips: Phaser.GameObjects.Image[] = [];
  private timer!: Phaser.GameObjects.Container;
  private timerFill!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private multText!: HudChip;
  private lastFillW = -1;
  private lastFillColor = -1;
  private seenKeys = new WeakSet<KeyboardEvent>();

  createGame(): void {
    this.lang = getLang();
    this.dict = dictFor(this.lang);
    this.used = new Set();
    this.answer = '';
    this.ans = [];
    this.len = 4;
    this.wordNum = 0;
    this.row = 0;
    this.cur = [];
    this.locked = new Map();
    this.knownGreen = new Set();
    this.keyState = new Map();
    this.lives = LIVES;
    this.streak = 0;
    this.solves = 0;
    this.jokers = START_JOKERS;
    this.timeLeft = 0;
    this.timeMax = 1;
    this.lastTick = 0;
    this.busy = true;
    this.rows = [];
    this.tiles = [];
    this.keys = new Map();
    this.pips = [];
    this.lastFillW = -1;
    this.lastFillColor = -1;

    makeTextures(this);
    backdrop(this);
    this.buildTimer();
    this.boardLayer = this.add.container(0, 0).setDepth(2);
    this.buildJokers();
    this.buildKeyboard();
    this.hud.setLives(this.lives, LIVES);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.nextWord();
  }

  // ---------------------------------------------------------------- building

  private buildTimer(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(TIMER_X0 - 4, -15, TIMER_W + 8, 30, 15);
    g.lineStyle(2, 0xffffff, 0.18).strokeRoundedRect(TIMER_X0 - 4, -15, TIMER_W + 8, 30, 15);
    this.timerFill = this.add.graphics();
    this.timerText = txt(this, 0, 0, '', { title: true, size: 20, color: '#ffffff', strokeThickness: 4 });
    this.timer = this.add.container(0, 0, [g, this.timerFill, this.timerText]).setData('chipWidth', TIMER_W + 8);
    hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { items: [this.timer] });
    // the multiplier the next solved word earns
    this.multText = hudChip(this, W - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', text: '×1', color: '#ffd04a', minWidth: 108 });
  }

  private buildJokers(): void {
    const make = (x: number, icon: string, label: string, hint: string, color: number, onClick: () => void): JokerButton => {
      const img = this.add.image(0, 0, 'sw-btn').setDisplaySize(250, 86).setTint(color);
      const ic = this.add.image(-86, -4, icon).setDisplaySize(42, 42);
      const tx = txt(this, 18, -4, label, { title: true, size: 26, color: '#ffffff', strokeThickness: 4 });
      const hb = this.add.circle(108, -30, 15, 0x000000, 0.35).setStrokeStyle(2, 0xffffff, 0.5);
      const ht = txt(this, 108, -31, hint, { size: 18, color: '#ffffff', strokeThickness: 0, shadow: false });
      const c = this.add.container(x, JOKER_Y, [img, ic, tx, hb, ht]).setDepth(4).setSize(250, 86)
        .setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.93, duration: 60 }));
      c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 100 }));
      c.on('pointerup', () => {
        this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
        onClick();
      });
      return { c, img };
    };
    this.revealBtn = make(146, 'sw-eye', t('reveal'), '1', 0x4f7cf0, () => this.useReveal());
    this.removeBtn = make(W - 146, 'sw-eraser', t('remove'), '2', 0xa05be0, () => this.useRemove());
    for (let i = 0; i < MAX_JOKERS; i++) {
      this.pips.push(this.add.image(W / 2, JOKER_Y - 28 + i * 28, 'sw-star').setDisplaySize(30, 30).setDepth(4));
    }
    this.refreshJokers();
  }

  private refreshJokers(): void {
    this.pips.forEach((p, i) => p.setTint(i < this.jokers ? GOLD : 0x8890b8).setAlpha(i < this.jokers ? 1 : 0.45));
    const a = this.jokers > 0 ? 1 : 0.5;
    this.revealBtn.c.setAlpha(a);
    this.removeBtn.c.setAlpha(a);
  }

  private buildKeyboard(): void {
    const rows = KEY_ROWS[this.lang];
    // the bottom row also holds Enter and Backspace, 1.5 keys wide each
    const units = Math.max(...rows.map((r, i) => chars(r).length + (i === rows.length - 1 ? 3 : 0)));
    const pitch = KB_W / units;
    const kw = pitch - 6;
    rows.forEach((r, ri) => {
      const letters = chars(r);
      const last = ri === rows.length - 1;
      const rowUnits = letters.length + (last ? 3 : 0);
      let x = W / 2 - (rowUnits * pitch) / 2;
      const y = KEY_Y0 + ri * KEY_PITCH_Y;
      if (last) {
        this.enterKey = this.specialKey(x + pitch * 0.75, y, pitch * 1.5 - 6, 'sw-enter', () => this.submit());
        x += pitch * 1.5;
      }
      for (const ch of letters) {
        const img = this.add.image(0, 0, 'sw-key').setDisplaySize(kw, KEY_H).setTint(0xe8ebf7);
        const label = txt(this, 0, -4, ch, { title: true, size: 36, color: INK, strokeThickness: 0, shadow: false });
        const c = this.add.container(x + pitch / 2, y, [img, label]).setDepth(4).setSize(kw + 6, KEY_H + 8)
          .setInteractive({ useHandCursor: true });
        const key: Key = { ch, c, img, label };
        c.on('pointerdown', () => {
          this.tweens.add({ targets: c, scale: 0.9, duration: 50, yoyo: true });
          this.typeLetter(ch);
        });
        this.keys.set(ch, key);
        x += pitch;
      }
      if (last) this.backKey = this.specialKey(x + pitch * 0.75, y, pitch * 1.5 - 6, 'sw-back', () => this.backspace());
    });
  }

  private specialKey(x: number, y: number, w: number, icon: string, onPress: () => void): Phaser.GameObjects.Container {
    const img = this.add.image(0, 0, 'sw-wide').setDisplaySize(w, KEY_H).setTint(0x7c86b8);
    const ic = this.add.image(0, -4, icon).setDisplaySize(44, 44);
    const c = this.add.container(x, y, [img, ic]).setDepth(4).setSize(w + 6, KEY_H + 8).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 0.92, duration: 50, yoyo: true });
      onPress();
    });
    return c;
  }

  private buildBoard(): void {
    this.boardLayer.removeAll(true);
    this.rows = [];
    this.tiles = [];
    this.tileSize = this.len >= 6 ? Math.min(TILE, Math.floor((W - 60 - (this.len - 1) * GAP) / this.len)) : TILE;
    const s = this.tileSize;
    const x0 = -((this.len - 1) * (s + GAP)) / 2;
    for (let r = 0; r < TRIES; r++) {
      const y = BOARD_TOP + s / 2 + r * (TILE + GAP);
      const rc = this.add.container(W / 2, y);
      const rowTiles: Tile[] = [];
      for (let i = 0; i < this.len; i++) {
        const img = this.add.image(0, 3, 'sw-slot').setDisplaySize(s, s * 136 / 128);
        const label = txt(this, 0, -1, '', { title: true, size: Math.round(s * 0.56), color: INK, strokeThickness: 0, shadow: false });
        const c = this.add.container(x0 + i * (s + GAP), 0, [img, label]);
        rc.add(c);
        rowTiles.push({ c, img, label });
        c.setScale(0);
        this.tweens.add({ targets: c, scale: 1, duration: 260, delay: 60 + (r * this.len + i) * 14, ease: 'Back.easeOut' });
      }
      this.boardLayer.add(rc);
      this.rows.push(rc);
      this.tiles.push(rowTiles);
    }
  }

  // ---------------------------------------------------------------- words

  private nextWord(): void {
    this.wordNum++;
    const prevLen = this.len;
    this.len = lengthFor(this.wordNum, this.dict.maxLen);
    this.answer = pickAnswer(this.dict, this.len, this.used);
    this.ans = chars(this.answer);
    this.row = 0;
    this.locked = new Map();
    this.knownGreen = new Set();
    this.keyState = new Map();
    this.timeMax = this.timeLeft = timeFor(this.streak);
    this.lastTick = 0;
    this.hud.setLevel(this.wordNum);
    this.multText.setText('×' + this.fmt(multiplierFor(this.streak + 1)));
    this.buildBoard();
    this.refreshKeys();
    this.startRow();
    this.updateTimer();
    this.busy = true;
    if (this.wordNum === 1 || this.len !== prevLen) {
      this.banner(t('letters', { n: this.len }), '#7ff0f4', 44);
      if (this.wordNum > 1) this.sfx('grow');
    }
    this.time.delayedCall(450, () => { this.busy = false; });
  }

  private startRow(): void {
    this.cur = new Array(this.len).fill(null);
    for (const [i, ch] of this.locked) {
      this.cur[i] = ch;
      this.paintTile(this.row, i, ch, 2);
      const tl = this.tiles[this.row][i];
      tl.c.setScale(0.6);
      this.tweens.add({ targets: tl.c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  /** Paints one tile: an empty slot, a typed letter (mark -1) or a marked letter. */
  private paintTile(r: number, i: number, ch: string | null, mark: number): void {
    const tl = this.tiles[r][i];
    const s = this.tileSize;
    if (!ch) {
      tl.img.setTexture('sw-slot').clearTint().setDisplaySize(s, s * 136 / 128);
      tl.label.setText('');
      return;
    }
    tl.img.setTexture('sw-tile').setDisplaySize(s, s * 136 / 128).setTint(mark < 0 ? CREAM : markColor(mark));
    tl.label.setText(ch).setColor(mark < 0 ? INK : '#ffffff');
  }

  // ---------------------------------------------------------------- input

  private onKey(e: KeyboardEvent): void {
    // Phaser re-dispatches its whole key queue for every event that arrives in the same frame
    // (Shift + letter, fast typing), so one native event can reach this handler more than once.
    if (this.seenKeys.has(e)) return;
    this.seenKeys.add(e);
    if (this.isOver || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { this.submit(); return; }
    if (e.key === 'Backspace') { this.backspace(); return; }
    if (e.key === '1') { this.useReveal(); return; }
    if (e.key === '2') { this.useRemove(); return; }
    if (e.key.length !== 1 || !/\p{L}/u.test(e.key)) return;
    const ch = upper(e.key);
    if (ALPHABET[this.lang].includes(ch)) this.typeLetter(ch);
    else this.nudgeRow(2);
  }

  private typeLetter(ch: string): void {
    if (this.busy || this.isOver) return;
    const i = this.cur.findIndex((c, k) => c === null && !this.locked.has(k));
    if (i < 0) { this.nudgeRow(2); return; }
    this.cur[i] = ch;
    this.paintTile(this.row, i, ch, -1);
    const tl = this.tiles[this.row][i];
    this.tweens.killTweensOf(tl.c);
    tl.c.setScale(1.18);
    this.tweens.add({ targets: tl.c, scale: 1, duration: 160, ease: 'Back.easeOut' });
    const filled = this.cur.filter((c) => c !== null).length;
    this.sfx('type', { rate: 0.95 + filled * 0.05, volume: 0.6 });
  }

  private backspace(): void {
    if (this.busy || this.isOver) return;
    let i = -1;
    for (let k = this.len - 1; k >= 0; k--) {
      if (this.cur[k] !== null && !this.locked.has(k)) { i = k; break; }
    }
    if (i < 0) return;
    this.cur[i] = null;
    this.paintTile(this.row, i, null, -1);
    const tl = this.tiles[this.row][i];
    this.tweens.killTweensOf(tl.c);
    tl.c.setScale(0.85);
    this.tweens.add({ targets: tl.c, scale: 1, duration: 140, ease: 'Quad.easeOut' });
    this.sfx('del', { volume: 0.6 });
  }

  private nudgeRow(times = 3, dist = 12): void {
    const rc = this.rows[this.row];
    if (!rc) return;
    this.tweens.killTweensOf(rc);
    rc.x = W / 2;
    this.tweens.add({ targets: rc, x: W / 2 + dist, duration: 45, yoyo: true, repeat: times, ease: 'Sine.easeInOut', onComplete: () => rc.setX(W / 2) });
  }

  // ---------------------------------------------------------------- guesses

  private submit(): void {
    if (this.busy || this.isOver) return;
    if (this.cur.some((c) => c === null)) {
      this.nudgeRow();
      this.sfx('invalid', { volume: 0.5 });
      this.toast(t('tooShort'));
      return;
    }
    const word = resolveGuess(this.dict, this.cur as string[], new Set(this.locked.keys()));
    if (!word) {
      this.nudgeRow(4, 16);
      this.sfx('invalid');
      this.toast(t('notInList'));
      return;
    }
    const guess = chars(word);
    // Turkish typed on a plain keyboard: show the letters the word really has
    guess.forEach((ch, i) => {
      if (ch !== this.cur[i]) this.paintTile(this.row, i, ch, -1);
    });
    this.cur = guess;
    const marks = evaluate(guess, this.ans);
    this.busy = true;
    const r = this.row;
    const step = 190;
    guess.forEach((ch, i) => {
      const tl = this.tiles[r][i];
      this.tweens.killTweensOf(tl.c);
      tl.c.setScale(1);
      this.tweens.add({
        targets: tl.c, scaleY: 0, duration: 120, delay: i * step, ease: 'Quad.easeIn',
        onStart: () => this.sfx('flip', { rate: 0.85 + i * 0.12, volume: 0.7 }),
        onComplete: () => {
          // the colour changes at mid-flip
          this.paintTile(r, i, ch, marks[i]);
          this.tweens.add({
            targets: tl.c, scaleY: 1, duration: 140, ease: 'Quad.easeOut',
            onComplete: () => {
              if (i === guess.length - 1) this.time.delayedCall(160, () => this.afterGuess(guess, marks));
            },
          });
        },
      });
    });
  }

  private afterGuess(guess: string[], marks: Mark[]): void {
    if (this.isOver) return;
    guess.forEach((ch, i) => {
      const prev = this.keyState.get(ch);
      if (prev === undefined || marks[i] > prev) this.keyState.set(ch, marks[i]);
      if (marks[i] === 2) this.knownGreen.add(i);
    });
    this.refreshKeys(true);
    if (marks.every((m) => m === 2)) { this.solved(); return; }
    this.row++;
    if (this.row >= TRIES) { this.missed(t('outOfTries')); return; }
    this.startRow();
    this.busy = false;
  }

  private solved(): void {
    this.streak++;
    this.solves++;
    const { total, mult } = pointsFor(this.row + 1, this.timeLeft, this.streak);
    const rc = this.rows[this.row];
    const s = this.tileSize;
    this.sfx('solve', { exact: true });
    this.time.delayedCall(250, () => this.sfx('coins', { volume: 0.7 }));
    // the row bounces in a wave
    this.tiles[this.row].forEach((tl, i) => {
      this.tweens.add({ targets: tl.c, y: -s * 0.32, duration: 170, delay: i * 80, yoyo: true, ease: 'Sine.easeOut' });
      this.time.delayedCall(i * 80 + 120, () => burst(this, rc.x + tl.c.x, rc.y - s * 0.3, [GREEN, GOLD, 0xffffff], 10, 220));
    });
    shake(this, 0.004, 140);
    this.addScore(total);
    this.pointsPopup(`+${total}`, rc.y - s);
    const praise = this.streak >= 6 ? t('solved3') : this.streak >= 3 ? t('solved2') : t('solved1');
    this.banner(`×${this.fmt(mult)}!`, '#ffd04a', 92, praise);
    // a joker every few solves
    if (this.solves % SOLVES_PER_JOKER === 0 && this.jokers < MAX_JOKERS) {
      this.time.delayedCall(700, () => {
        if (this.isOver) return;
        this.jokers++;
        this.refreshJokers();
        this.sfx('earn');
        const p = this.pips[this.jokers - 1];
        p.setScale(0);
        this.tweens.add({ targets: p, scaleX: 30 / 48, scaleY: 30 / 48, duration: 320, ease: 'Back.easeOut' });
        burst(this, p.x, p.y, [GOLD, 0xffffff], 12, 180);
        this.pointsPopup(t('newJoker'), JOKER_Y - 70, '#ffd04a', 30);
      });
    }
    this.time.delayedCall(1700, () => this.leaveBoard(() => this.nextWord()));
  }

  /** A missed word: the answer is shown, a life is lost and the streak ends. */
  private missed(reason: string): void {
    this.busy = true;
    this.streak = 0;
    this.lives--;
    this.hud.setLives(this.lives, LIVES);
    this.sfx('miss');
    this.time.delayedCall(150, () => this.sfx('life'));
    shake(this, 0.012, 260);
    flash(this, ROSE, 220, 0.25);
    this.multText.setText('×' + this.fmt(multiplierFor(1)));
    // the answer panel
    const pw = 620, ph = 300;
    const g = this.add.graphics();
    g.fillStyle(0x120f2a, 0.92).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 30);
    g.lineStyle(3, ROSE, 0.8).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 30);
    const title = txt(this, 0, -100, reason, { title: true, size: 44, color: '#ff8ea0' });
    const sub = txt(this, 0, -46, t('wordWas'), { size: 28, color: '#ffffff' });
    const panel = this.add.container(W / 2, BOARD_MID, [g, title, sub]).setDepth(40).setScale(0.6).setAlpha(0);
    const s = Math.min(92, Math.floor((pw - 60 - (this.len - 1) * 10) / this.len));
    const x0 = -((this.len - 1) * (s + 10)) / 2;
    this.ans.forEach((ch, i) => {
      const img = this.add.image(0, 3, 'sw-tile').setDisplaySize(s, s * 136 / 128).setTint(CREAM);
      const label = txt(this, 0, -1, '', { title: true, size: Math.round(s * 0.56), color: '#ffffff', strokeThickness: 0, shadow: false });
      const c = this.add.container(x0 + i * (s + 10), 60, [img, label]).setScale(1, 0);
      panel.add(c);
      this.tweens.add({
        targets: c, scaleY: 1, duration: 160, delay: 350 + i * 150, ease: 'Quad.easeOut',
        onStart: () => {
          img.setTint(ROSE);
          label.setText(ch);
          this.sfx('flip', { rate: 0.7 + i * 0.08, volume: 0.6 });
        },
      });
    });
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    if (this.lives <= 0) {
      this.endGame({ delay: 2600 });
      return;
    }
    if (this.lives === 1) this.time.delayedCall(1200, () => this.pointsPopup(t('lastLife'), BOARD_MID + 190, '#ff8ea0', 34));
    this.time.delayedCall(2700, () => {
      this.tweens.add({ targets: panel, alpha: 0, scale: 0.8, duration: 220, onComplete: () => panel.destroy() });
      this.leaveBoard(() => this.nextWord());
    });
  }

  private leaveBoard(then: () => void): void {
    if (this.isOver) return;
    this.tweens.add({
      targets: this.boardLayer, alpha: 0, y: -30, duration: 240, ease: 'Quad.easeIn',
      onComplete: () => {
        if (this.isOver) return;
        this.boardLayer.setAlpha(1).setY(0);
        then();
      },
    });
  }

  // ---------------------------------------------------------------- jokers

  private canUseJoker(btn: JokerButton): boolean {
    if (this.busy || this.isOver) return false;
    if (this.jokers <= 0) {
      this.sfx('deny');
      this.toast(t('noJoker'));
      this.tweens.add({ targets: btn.c, angle: 6, duration: 50, yoyo: true, repeat: 3, onComplete: () => btn.c.setAngle(0) });
      return false;
    }
    return true;
  }

  private spendJoker(btn: JokerButton): void {
    this.jokers--;
    const pip = this.pips[this.jokers];
    burst(this, pip.x, pip.y, [GOLD, 0xffffff], 10, 160);
    this.refreshJokers();
    this.sfx('joker');
    this.tweens.add({ targets: btn.c, scale: 1.1, duration: 100, yoyo: true });
  }

  /** Fixes one letter of the answer in its place for the rest of this word. */
  private useReveal(): void {
    if (!this.canUseJoker(this.revealBtn)) return;
    const open = [...Array(this.len).keys()].filter((i) => !this.locked.has(i));
    const fresh = open.filter((i) => !this.knownGreen.has(i));
    const pool = fresh.length ? fresh : open;
    if (!pool.length) { this.sfx('deny'); this.toast(t('nothingLeft')); return; }
    this.spendJoker(this.revealBtn);
    const pos = pool[Math.floor(Math.random() * pool.length)];
    const ch = this.ans[pos];
    // letters already typed in this row move aside for the fixed one
    const typed = this.cur.filter((c, k) => c !== null && !this.locked.has(k)) as string[];
    this.locked.set(pos, ch);
    this.cur = this.cur.map((_, k) => this.locked.get(k) ?? null);
    for (const c of typed) {
      const k = this.cur.findIndex((x, j) => x === null && !this.locked.has(j));
      if (k < 0) break;
      this.cur[k] = c;
    }
    this.cur.forEach((c, k) => this.paintTile(this.row, k, c, this.locked.has(k) ? 2 : -1));
    if ((this.keyState.get(ch) ?? -1) < 2) this.keyState.set(ch, 2);
    this.refreshKeys(true);
    const tl = this.tiles[this.row][pos];
    const rc = this.rows[this.row];
    this.paintTile(this.row, pos, ch, 2);
    tl.c.setScale(1, 0);
    this.tweens.add({ targets: tl.c, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    // a star flies from the button to the tile
    const star = this.add.image(this.revealBtn.c.x, JOKER_Y, 'sw-star').setTint(GOLD).setDepth(30).setDisplaySize(40, 40);
    this.tweens.add({
      targets: star, x: rc.x + tl.c.x, y: rc.y, angle: 360, duration: 380, ease: 'Cubic.easeInOut',
      onComplete: () => {
        star.destroy();
        burst(this, rc.x + tl.c.x, rc.y, [GREEN, GOLD, 0xffffff], 14, 220);
        this.tweens.add({ targets: tl.c, scale: 1.2, duration: 110, yoyo: true });
      },
    });
  }

  /** Greys out up to five letters that are not in the word. */
  private useRemove(): void {
    if (!this.canUseJoker(this.removeBtn)) return;
    const absent = chars(ALPHABET[this.lang]).filter((ch) => !this.ans.includes(ch) && this.keyState.get(ch) === undefined);
    if (!absent.length) { this.sfx('deny'); this.toast(t('nothingLeft')); return; }
    this.spendJoker(this.removeBtn);
    Phaser.Utils.Array.Shuffle(absent);
    absent.slice(0, REMOVE_COUNT).forEach((ch, i) => {
      const key = this.keys.get(ch);
      this.time.delayedCall(i * 90, () => {
        this.keyState.set(ch, 0);
        if (!key) return;
        burst(this, key.c.x, key.c.y, [GREY, 0xffffff, 0xa05be0], 10, 160);
        this.tweens.add({ targets: key.c, scale: 0.75, duration: 110, yoyo: true, onYoyo: () => this.paintKey(key) });
      });
    });
  }

  // ---------------------------------------------------------------- keyboard colours

  private paintKey(k: Key): void {
    const m = this.keyState.get(k.ch);
    if (m === undefined) {
      k.img.setTint(0xe8ebf7);
      k.label.setColor(INK).setAlpha(1);
    } else {
      k.img.setTint(m === 0 ? 0x3f4560 : markColor(m));
      k.label.setColor('#ffffff').setAlpha(m === 0 ? 0.55 : 1);
    }
  }

  private refreshKeys(pop = false): void {
    for (const k of this.keys.values()) {
      const before = k.img.tintTopLeft;
      this.paintKey(k);
      if (pop && before !== k.img.tintTopLeft) this.tweens.add({ targets: k.c, scale: 1.12, duration: 90, yoyo: true });
    }
  }

  // ---------------------------------------------------------------- feedback

  private fmt(n: number): string {
    const s = String(Number(n.toFixed(2)));
    return this.lang === 'tr' ? s.replace('.', ',') : s;
  }

  private toast(msg: string): void {
    const label = txt(this, 0, 0, msg, { title: true, size: 32, color: '#ffffff', strokeThickness: 0 });
    const w = label.width + 60;
    const g = this.add.graphics();
    g.fillStyle(0x120f2a, 0.9).fillRoundedRect(-w / 2, -34, w, 68, 34);
    g.lineStyle(2, 0xffffff, 0.3).strokeRoundedRect(-w / 2, -34, w, 68, 34);
    const y = Math.min(BOARD_TOP + (this.row + 1) * (TILE + GAP) + 26, BOARD_TOP + BOARD_H - 30);
    const c = this.add.container(W / 2, y, [g, label]).setDepth(45).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, y: y - 20, duration: 260, delay: 1100, onComplete: () => c.destroy() });
  }

  private banner(text: string, color: string, size: number, sub?: string): void {
    const b = txt(this, W / 2, BOARD_MID - 20, text, { title: true, size, color, strokeThickness: 10 }).setDepth(46).setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, y: b.y - 60, alpha: 0, duration: 420, delay: 1000, onComplete: () => b.destroy() });
    if (sub) {
      const s = txt(this, W / 2, BOARD_MID + size * 0.6, sub, { title: true, size: 40, color: '#ffffff', strokeThickness: 8 }).setDepth(46).setAlpha(0);
      this.tweens.add({ targets: s, alpha: 1, duration: 200, delay: 160 });
      this.tweens.add({ targets: s, y: s.y - 60, alpha: 0, duration: 420, delay: 1000, onComplete: () => s.destroy() });
    }
  }

  private pointsPopup(text: string, y: number, color = '#7dffb0', size = 44): void {
    const p = txt(this, W / 2, y, text, { title: true, size, color, strokeThickness: 8 }).setDepth(47).setScale(0.5);
    this.tweens.add({ targets: p, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: p, y: y - 80, alpha: 0, duration: 600, delay: 700, ease: 'Cubic.easeIn', onComplete: () => p.destroy() });
  }

  // ---------------------------------------------------------------- clock

  private updateTimer(): void {
    const f = Phaser.Math.Clamp(this.timeLeft / this.timeMax, 0, 1);
    const w = Math.round(TIMER_W * f);
    const color = this.timeLeft <= LOW_TIME ? ROSE : f < 0.45 ? AMBER : TEAL;
    if (w !== this.lastFillW || color !== this.lastFillColor) {
      this.lastFillW = w;
      this.lastFillColor = color;
      const g = this.timerFill.clear();
      if (w > 0) {
        const h = 22;
        g.fillStyle(color, 1).fillRoundedRect(TIMER_X0, -h / 2, Math.max(w, h), h, h / 2);
        g.fillStyle(0xffffff, 0.28).fillRoundedRect(TIMER_X0 + 6, -h / 2 + 3, Math.max(w - 12, 6), 6, 3);
      }
    }
    const s = Math.max(0, Math.ceil(this.timeLeft));
    this.timerText.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  }

  updateGame(_time: number, delta: number): void {
    if (this.busy) return;
    this.timeLeft -= delta / 1000;
    const whole = Math.ceil(this.timeLeft);
    if (whole <= LOW_TIME && whole > 0 && whole !== this.lastTick) {
      this.lastTick = whole;
      // the bar pulses every second when time runs low, and ticks in the last ten
      this.tweens.add({ targets: this.timer, scaleY: 1.35, duration: 120, yoyo: true, ease: 'Sine.easeOut' });
      if (whole <= TICK_TIME) this.sfx('tick', { rate: 1 + (TICK_TIME - whole) * 0.03, volume: 0.6 });
    }
    this.updateTimer();
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.updateTimer();
      this.missed(t('timeUp'));
    }
  }
}
