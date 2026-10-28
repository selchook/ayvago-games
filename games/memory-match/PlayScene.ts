import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng } from '@core';

export const ANIMALS = [
  'bear', 'buffalo', 'chick', 'chicken', 'cow', 'crocodile', 'dog', 'duck', 'elephant', 'frog',
  'giraffe', 'goat', 'gorilla', 'hippo', 'horse', 'monkey', 'moose', 'narwhal', 'owl', 'panda',
  'parrot', 'penguin', 'pig', 'rabbit', 'rhino', 'sloth', 'snake', 'walrus', 'whale', 'zebra',
] as const;

const GRIDS: Array<[number, number]> = [[3, 4], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6]];
const AREA_TOP = 170;
const AREA_BOTTOM = 1170;
const TW = 120;
const TH = 156;

/** Card back / face textures, drawn once. */
export function makeCardTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('mm-back')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // back: brand red with a retro diamond pattern
  g.fillStyle(0x000000, 0.5).fillRoundedRect(2, 6, TW - 4, TH - 6, 14);
  g.fillStyle(0xffffff).fillRoundedRect(0, 0, TW - 4, TH - 6, 14);
  g.fillStyle(0xec3013).fillRoundedRect(6, 6, TW - 16, TH - 18, 10);
  g.fillStyle(0xb3261e);
  for (let y = 14; y < TH - 18; y += 22) for (let x = 14 + ((y / 22) % 2) * 11; x < TW - 14; x += 22) {
    g.fillTriangle(x, y - 7, x + 7, y, x - 7, y);
    g.fillTriangle(x - 7, y, x + 7, y, x, y + 7);
  }
  g.fillStyle(0xffd23f).fillCircle(TW / 2 - 2, TH / 2 - 3, 20);
  g.fillStyle(0xec3013).fillCircle(TW / 2 - 2, TH / 2 - 3, 12);
  g.fillStyle(0xffffff).fillCircle(TW / 2 - 2, TH / 2 - 3, 5);
  g.generateTexture('mm-back', TW, TH);
  g.clear();
  // face: paper card
  g.fillStyle(0x000000, 0.5).fillRoundedRect(2, 6, TW - 4, TH - 6, 14);
  g.fillStyle(0xffffff).fillRoundedRect(0, 0, TW - 4, TH - 6, 14);
  g.fillStyle(0xf3f2f2).fillRoundedRect(6, 6, TW - 16, TH - 18, 10);
  g.fillStyle(0xdfe6f2).fillRoundedRect(6, TH / 2, TW - 16, TH / 2 - 12, 10);
  g.generateTexture('mm-face', TW, TH);
  g.destroy();
}

interface Card {
  c: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  pic: Phaser.GameObjects.Image;
  animal: string;
  up: boolean;
  done: boolean;
  busy: boolean;
}

type Phase = 'preview' | 'play' | 'between' | 'over';

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'preview';
  private level = 1;
  private cards: Card[] = [];
  private cols = 3;
  private rows = 4;
  private cw = 100;
  private ch = 130;
  private open: Card[] = [];
  private pendingBack: Card[] = [];
  private backTimer?: Phaser.Time.TimerEvent;
  private moves = 0;
  private matched = 0;
  private combo = 0;
  private timeLeft = 0;
  private timeMax = 1;
  private lastTick = 0;
  private cursor = 0;
  private showCursor = false;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Rectangle;
  private barBg!: Phaser.GameObjects.Rectangle;
  private timeText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.GameObject[] = [];

  createGame(): void {
    makeCardTextures(this);
    this.level = 1; this.cards = []; this.open = []; this.pendingBack = []; this.backTimer = undefined;
    this.moves = 0; this.matched = 0; this.combo = 0; this.cursor = 0; this.showCursor = false; this.banner = [];
    this.lastTick = 0;

    this.barBg = this.add.rectangle(60, 112, 440, 26, 0x000000, 0.6).setOrigin(0, 0.5).setStrokeStyle(4, 0xffffff, 0.8);
    this.bar = this.add.rectangle(64, 112, 432, 18, 0x5dff7a).setOrigin(0, 0.5);
    this.timeText = txt(this, 520, 112, '', { title: true, size: 22, color: '#ffd23f' }).setOrigin(0, 0.5);
    this.infoText = txt(this, 360, 1215, '', { title: true, size: 20, color: '#3ee6ff' });
    this.cursorBox = this.add.rectangle(0, 0, 10, 10).setStrokeStyle(6, 0xffd23f).setDepth(20).setVisible(false);
    this.tweens.add({ targets: this.cursorBox, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.buildLevel();
  }

  private buildLevel(): void {
    this.cards.forEach((c) => c.c.destroy());
    this.banner.forEach((o) => o.destroy());
    this.banner = [];
    this.cards = []; this.open = []; this.pendingBack = []; this.backTimer?.remove(); this.backTimer = undefined;
    this.moves = 0; this.matched = 0; this.combo = 0;
    const [cols, rows] = GRIDS[Math.min(this.level - 1, GRIDS.length - 1)];
    this.cols = cols; this.rows = rows;
    const pairs = (cols * rows) / 2;
    const perPair = Math.max(2.6, 5.5 - 0.35 * (this.level - 1));
    this.timeMax = Math.round(15 + pairs * perPair);
    this.timeLeft = this.timeMax;
    this.lastTick = 0;

    const cellW = 680 / cols, cellH = (AREA_BOTTOM - AREA_TOP) / rows;
    this.cw = Math.min(cellW - 12, (cellH - 12) * 0.77);
    this.ch = this.cw / 0.77;
    const x0 = 360 - (cellW * cols) / 2 + cellW / 2;
    const y0 = (AREA_TOP + AREA_BOTTOM) / 2 - (cellH * rows) / 2 + cellH / 2;

    const animals = rng.shuffle([...ANIMALS]).slice(0, pairs);
    const deck = rng.shuffle([...animals, ...animals]);
    deck.forEach((a, i) => {
      const x = x0 + (i % cols) * cellW, y = y0 + Math.floor(i / cols) * cellH;
      const c = this.add.container(360, 1400).setDepth(5);
      const back = this.add.image(0, 0, 'mm-back').setDisplaySize(this.cw, this.ch);
      const face = this.add.image(0, 0, 'mm-face').setDisplaySize(this.cw, this.ch).setVisible(false);
      const pic = this.add.image(0, -this.ch * 0.02, 'an-' + a).setVisible(false);
      pic.setScale(Math.min((this.cw * 0.8) / pic.width, (this.ch * 0.72) / pic.height));
      c.add([back, face, pic]);
      c.setSize(this.cw, this.ch).setInteractive({ useHandCursor: true });
      const card: Card = { c, back, face, pic, animal: a, up: false, done: false, busy: false };
      c.on('pointerdown', () => { this.showCursor = false; this.cursorBox.setVisible(false); this.cursor = i; this.tap(card); });
      c.setData('home', { x, y });
      this.cards.push(card);
      this.tweens.add({ targets: c, x, y, angle: { from: rng.int(-40, 40), to: 0 }, duration: 380, delay: i * 25, ease: 'Cubic.easeOut' });
    });
    this.sfx('shuffle', { volume: 0.6 });
    this.cursor = 0;
    this.updateHud();

    // memorize preview: every face shows briefly, then the clock starts
    this.phase = 'preview';
    const dealT = deck.length * 25 + 400;
    const peek = 1300 + pairs * 70 - Math.min(600, (this.level - 1) * 80);
    const msg = txt(this, 360, 1215, t('memorize'), { title: true, size: 28, color: '#ffd23f' }).setDepth(30);
    this.infoText.setText('');
    this.tweens.add({ targets: msg, scale: { from: 1.15, to: 0.95 }, duration: 300, yoyo: true, repeat: -1 });
    this.time.delayedCall(dealT, () => {
      this.cards.forEach((c, k) => this.time.delayedCall(k * 12, () => this.flip(c, true, false)));
      this.sfx('deal', { volume: 0.6 });
    });
    this.time.delayedCall(dealT + peek, () => {
      msg.destroy();
      this.cards.forEach((c) => this.flip(c, false, false));
      this.sfx('flipback', { volume: 0.5 });
      this.time.delayedCall(250, () => {
        if (this.phase !== 'preview') return;
        this.phase = 'play';
        this.updateHud();
      });
    });
  }

  private flip(card: Card, up: boolean, sound = true): void {
    if (card.up === up && !card.busy) return;
    card.up = up;
    card.busy = true;
    this.tweens.killTweensOf(card.c);
    const home = card.c.getData('home') as { x: number; y: number };
    card.c.setPosition(home.x, home.y);
    this.tweens.add({
      targets: card.c, scaleX: 0, scaleY: 1.06, duration: 90, ease: 'Sine.easeIn',
      onComplete: () => {
        card.back.setVisible(!card.up);
        card.face.setVisible(card.up);
        card.pic.setVisible(card.up);
        this.tweens.add({ targets: card.c, scaleX: 1, scaleY: 1, duration: 110, ease: 'Back.easeOut', onComplete: () => { card.busy = false; } });
      },
    });
    if (sound) this.sfx(up ? 'flip' : 'flipback', { volume: 0.5, detune: rng.int(-120, 120) });
  }

  private tap(card: Card): void {
    if (this.phase !== 'play' || card.done || card.up) return;
    if (this.pendingBack.length) this.flipBackNow();
    if (this.open.length >= 2) return;
    this.flip(card, true);
    this.open.push(card);
    if (this.open.length === 2) {
      this.moves++;
      const [a, b] = this.open;
      this.open = [];
      if (a.animal === b.animal) this.match(a, b);
      else this.miss(a, b);
      this.updateHud();
    }
  }

  private match(a: Card, b: Card): void {
    a.done = b.done = true;
    this.combo++;
    this.matched++;
    const pts = 50 * this.combo;
    const finished = this.matched * 2 === this.cards.length;
    if (finished) this.phase = 'between';
    this.time.delayedCall(220, () => {
      this.sfx('match', { volume: 0.55, detune: Math.min(600, (this.combo - 1) * 100) });
      for (const c of [a, b]) {
        this.tweens.add({ targets: c.c, scale: 1.18, duration: 140, yoyo: true, ease: 'Quad.easeOut', onComplete: () => c.face.setTint(0xc8ffd0) });
        burst(this, c.c.x, c.c.y, [0x5dff7a, 0xffd23f, 0xffffff], 18, 260);
      }
      this.addScore(pts, (a.c.x + b.c.x) / 2, (a.c.y + b.c.y) / 2);
      if (this.combo >= 3) popup(this, 360, 150, `${t('combo')} x${this.combo}`, '#ff4fa3', 26);
      if (finished) this.time.delayedCall(250, () => this.levelClear());
    });
  }

  private miss(a: Card, b: Card): void {
    this.combo = 0;
    this.pendingBack = [a, b];
    this.time.delayedCall(220, () => {
      if (!this.pendingBack.includes(a)) return;
      this.sfx('miss', { volume: 0.3 });
      for (const c of [a, b]) {
        c.face.setTint(0xffc8c8);
        const home = c.c.getData('home') as { x: number; y: number };
        this.tweens.add({ targets: c.c, x: home.x + 8, duration: 50, yoyo: true, repeat: 2 });
      }
    });
    this.backTimer = this.time.delayedCall(900, () => this.flipBackNow());
  }

  private flipBackNow(): void {
    this.backTimer?.remove();
    this.backTimer = undefined;
    for (const c of this.pendingBack) {
      c.face.clearTint();
      if (!c.done) this.flip(c, false);
    }
    this.pendingBack = [];
  }

  private levelClear(): void {
    this.phase = 'between';
    this.cursorBox.setVisible(false);
    const pairs = this.cards.length / 2;
    const stars = this.moves <= Math.ceil(pairs * 1.5) ? 3 : this.moves <= Math.ceil(pairs * 2.2) ? 2 : 1;
    const timeBonus = Math.floor(this.timeLeft) * 10;
    const starBonus = stars * 100 * this.level;
    this.sfx('clear', { volume: 0.6 });
    flash(this, 0x5dff7a, 120);
    this.cards.forEach((c, k) => this.tweens.add({ targets: c.c, angle: 360, duration: 500, delay: k * 18, ease: 'Cubic.easeOut' }));

    const panel = this.add.rectangle(360, 640, 600, 420, 0x0b1424, 0.92).setStrokeStyle(6, 0xffd23f).setDepth(40).setScale(0);
    this.tweens.add({ targets: panel, scale: 1, duration: 300, ease: 'Back.easeOut' });
    const title = txt(this, 360, 500, t('levelClear'), { title: true, size: 34, color: '#5dff7a' }).setDepth(41);
    const lines = txt(this, 360, 740, `${t('moves')}: ${this.moves}\n${t('timeBonus')}: +${timeBonus}\n${t('starBonus')}: +${starBonus}`, { size: 30 }).setDepth(41);
    this.banner.push(panel, title, lines);
    for (let s = 0; s < 3; s++) {
      const on = s < stars;
      const st = this.add.image(360 + (s - 1) * 120, 610, 'icon-star').setDisplaySize(96, 96).setDepth(41)
        .setTint(on ? 0xffd23f : 0x333344).setScale(0);
      this.banner.push(st);
      this.time.delayedCall(350 + s * 260, () => {
        this.tweens.add({ targets: st, scale: 96 / st.width, duration: 280, ease: 'Back.easeOut' });
        if (on) {
          this.sfx('star', { volume: 0.5, detune: s * 200 });
          burst(this, st.x, st.y, [0xffd23f, 0xffffff], 16, 260);
        }
      });
    }
    this.time.delayedCall(1200, () => this.addScore(timeBonus + starBonus, 360, 820));
    this.time.delayedCall(3000, () => {
      if (this.isOver) return;
      this.level++;
      this.buildLevel();
    });
  }

  private timeUp(): void {
    this.phase = 'over';
    this.cursorBox.setVisible(false);
    this.sfx('miss', { volume: 0.5 });
    shake(this, 0.02, 400);
    flash(this, 0xec3013, 150);
    this.cards.forEach((c, k) => {
      if (!c.done) this.time.delayedCall(k * 20, () => { this.flip(c, true, false); c.face.setTint(0xffc8c8); });
    });
    const band = this.add.rectangle(360, 640, 720, 140, 0x000000, 0.8).setDepth(40);
    const msg = txt(this, 360, 640, t('timeUp'), { title: true, size: 40, color: '#ec3013' }).setDepth(41).setScale(0);
    this.tweens.add({ targets: msg, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.banner.push(band, msg);
    this.endGame({ delay: 2000, title: t('timeUp') });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase !== 'play') return;
    let r = Math.floor(this.cursor / this.cols), c = this.cursor % this.cols;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': c = (c + this.cols - 1) % this.cols; break;
      case 'ArrowRight': case 'KeyD': c = (c + 1) % this.cols; break;
      case 'ArrowUp': case 'KeyW': r = (r + this.rows - 1) % this.rows; break;
      case 'ArrowDown': case 'KeyS': r = (r + 1) % this.rows; break;
      case 'Space': case 'Enter': case 'KeyZ':
        this.showCursor = true; this.moveCursor(); this.tap(this.cards[this.cursor]); return;
      default: return;
    }
    this.cursor = r * this.cols + c;
    this.showCursor = true;
    this.moveCursor();
    this.sfx('move', { volume: 0.25 });
  }

  private moveCursor(): void {
    const card = this.cards[this.cursor];
    if (!card) return;
    const home = card.c.getData('home') as { x: number; y: number };
    this.cursorBox.setSize(this.cw + 10, this.ch + 10).setOrigin(0.5).setPosition(home.x, home.y).setVisible(this.showCursor);
  }

  updateGame(_time: number, delta: number): void {
    if (this.phase !== 'play') return;
    this.timeLeft -= delta / 1000;
    if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick && this.timeLeft > 0) {
      this.lastTick = Math.ceil(this.timeLeft);
      this.sfx('tick', { volume: 0.5 });
      this.tweens.add({ targets: this.timeText, scale: { from: 1.35, to: 1 }, duration: 250 });
    }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.updateHud(); this.timeUp(); return; }
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    const f = Phaser.Math.Clamp(this.timeLeft / this.timeMax, 0, 1);
    this.bar.width = 432 * f;
    this.bar.fillColor = f > 0.5 ? 0x5dff7a : f > 0.2 ? 0xffd23f : 0xec3013;
    this.timeText.setText(`${Math.ceil(this.timeLeft)}s`).setColor(this.timeLeft <= 10 ? '#ec3013' : '#ffd23f');
    if (this.phase === 'play') this.infoText.setText(`${t('pairs')} ${this.matched}/${this.cards.length / 2}   ${t('moves')} ${this.moves}`);
  }
}
