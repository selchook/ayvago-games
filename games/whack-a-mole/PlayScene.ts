import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng } from '@core';

export const ANIMALS = ['bear', 'chick', 'cow', 'dog', 'duck', 'frog', 'monkey', 'panda', 'penguin', 'pig', 'rabbit', 'owl', 'hippo', 'zebra'];

type Kind = 'animal' | 'gold' | 'bomb';
interface Hole {
  i: number;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
  kind: Kind | null;
  up: boolean;          // fully or partly out and hittable
  hit: boolean;
  timer?: Phaser.Time.TimerEvent;
  fuse?: Phaser.GameObjects.Particles.ParticleEmitter;
}

const XS = [150, 360, 570];
const YS = [520, 760, 1000];
const ROUND_TIME = 30;
const MAX_LIVES = 3;
const ANIMAL_W = 132;

// keyboard: three ways to reach each hole (index 0 = top-left)
const KEYS_LETTERS = ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'];
const KEYS_NUMPAD = ['NUMPAD_SEVEN', 'NUMPAD_EIGHT', 'NUMPAD_NINE', 'NUMPAD_FOUR', 'NUMPAD_FIVE', 'NUMPAD_SIX', 'NUMPAD_ONE', 'NUMPAD_TWO', 'NUMPAD_THREE'];
const KEYS_DIGITS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

export class PlayScene extends ArcadeScene {
  private holes: Hole[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private mallet!: Phaser.GameObjects.Image;
  private cursor!: Phaser.GameObjects.Ellipse;
  private roundText!: Phaser.GameObjects.Text;
  private barFill!: Phaser.GameObjects.Rectangle;
  private barText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private round = 0;
  private quota = 0;
  private hits = 0;
  private timeLeft = 0;
  private lives = MAX_LIVES;
  private combo = 0;
  private spawnCd = 0;
  private playing = false;
  private cursorIdx = 4;
  private lastTick = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.holes = []; this.hearts = [];
    this.round = 0; this.quota = 0; this.hits = 0; this.timeLeft = ROUND_TIME; this.lives = MAX_LIVES;
    this.combo = 0; this.spawnCd = 0; this.playing = false; this.cursorIdx = 4; this.lastTick = 0;

    this.buildScenery(width, height);

    if (!this.textures.exists('wm-mallet')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x8b5a2b).fillRoundedRect(42, 40, 16, 100, 6);          // handle
      g.fillStyle(0x6b3e1f).fillRect(42, 120, 16, 20);
      g.fillStyle(0xc0392b).fillRoundedRect(0, 0, 100, 50, 12);           // head
      g.fillStyle(0xe74c3c).fillRoundedRect(4, 4, 92, 18, 8);
      g.fillStyle(0xf1c40f).fillRect(16, 0, 10, 50).fillRect(74, 0, 10, 50);
      g.generateTexture('wm-mallet', 100, 140);
      g.destroy();
    }

    const touch = this.sys.game.device.input.touch;
    for (let i = 0; i < 9; i++) {
      const x = XS[i % 3], y = YS[Math.floor(i / 3)];
      this.add.ellipse(x, y + 12, 210, 92, 0x8a5a35).setDepth(1);
      this.add.ellipse(x, y + 4, 196, 78, 0x9c6a40).setDepth(1);
      this.add.ellipse(x, y, 162, 56, 0x2a1a0e).setDepth(1);
      const img = this.add.image(x, y + 120, 'wm-bear').setDepth(2).setVisible(false);
      const m = this.make.graphics({ x: 0, y: 0 }, false).fillRect(x - 130, y - 260, 260, 266);
      img.setMask(m.createGeometryMask());
      const hole: Hole = { i, x, y, img, kind: null, up: false, hit: false };
      if (!touch) {
        hole.label = txt(this, x + 92, y + 40, KEYS_LETTERS[i], { title: true, size: 16, color: '#ffffff' }).setAlpha(0.55).setDepth(3);
      }
      this.holes.push(hole);
    }

    this.cursor = this.add.ellipse(XS[1], YS[1], 220, 96).setStrokeStyle(5, 0xffd23f, 0.9).setDepth(1.5).setVisible(false);
    this.mallet = this.add.image(0, 0, 'wm-mallet').setOrigin(0.5, 1).setDepth(30).setVisible(false);
    this.sparks = this.add.particles(0, 0, 'wm-spark', {
      speed: { min: 120, max: 320 }, scale: { start: 0.16, end: 0 }, lifespan: 450, blendMode: 'ADD',
      tint: [0xffd23f, 0xffffff], emitting: false,
    }).setDepth(25);
    this.leaves = this.add.particles(0, 0, 'wm-leaf', {
      speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, gravityY: 500, rotate: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0.2 }, lifespan: 700, emitting: false,
    }).setDepth(25);

    // HUD row 2: hearts left, round + target bar centre
    for (let i = 0; i < MAX_LIVES; i++) this.hearts.push(this.add.image(44 + i * 48, 92, 'wm-heart').setDepth(9000));
    this.roundText = txt(this, width / 2, 92, '', { title: true, size: 20, color: '#ffd23f' }).setDepth(9000);
    this.add.rectangle(width / 2, 134, 380, 26, 0x000000, 0.5).setStrokeStyle(3, 0xffffff, 0.7).setDepth(9000);
    this.barFill = this.add.rectangle(width / 2 - 186, 134, 0, 18, 0x5dff7a).setOrigin(0, 0.5).setDepth(9000);
    this.barText = txt(this, width / 2, 135, '', { size: 20 }).setDepth(9001);

    // input: tap a hole
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;
      for (const h of this.holes) {
        if (Math.abs(p.x - h.x) < 105 && p.y > h.y - 175 && p.y < h.y + 70) { this.whack(h); return; }
      }
    });
    const kb = this.input.keyboard;
    for (const keys of [KEYS_LETTERS, KEYS_NUMPAD, KEYS_DIGITS]) {
      keys.forEach((k, i) => kb?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.whack(this.holes[i]); }));
    }
    const move = (dx: number, dy: number) => {
      const c = this.cursorIdx % 3, r = Math.floor(this.cursorIdx / 3);
      this.cursorIdx = Phaser.Math.Clamp(r + dy, 0, 2) * 3 + Phaser.Math.Clamp(c + dx, 0, 2);
      const h = this.holes[this.cursorIdx];
      this.cursor.setVisible(true).setPosition(h.x, h.y);
    };
    kb?.on('keydown-LEFT', () => move(-1, 0));
    kb?.on('keydown-RIGHT', () => move(1, 0));
    kb?.on('keydown-UP', () => move(0, -1));
    kb?.on('keydown-DOWN', () => move(0, 1));
    for (const k of ['SPACE', 'ENTER']) kb?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) { this.cursor.setVisible(true); this.whack(this.holes[this.cursorIdx]); } });

    this.updateHud();
    this.startRound();
  }

  private buildScenery(width: number, height: number): void {
    if (!this.textures.exists('wm-heart')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x000000).fillCircle(11, 13, 11).fillCircle(29, 13, 11).fillTriangle(1, 18, 39, 18, 20, 38);
      g.fillStyle(0xec3013).fillCircle(11, 13, 8).fillCircle(29, 13, 8).fillTriangle(4, 16, 36, 16, 20, 34);
      g.fillStyle(0xffffff, 0.6).fillCircle(9, 10, 3);
      g.generateTexture('wm-heart', 40, 40);
      g.clear();
      g.fillStyle(0x000000).fillCircle(11, 13, 11).fillCircle(29, 13, 11).fillTriangle(1, 18, 39, 18, 20, 38);
      g.fillStyle(0x444455).fillCircle(11, 13, 8).fillCircle(29, 13, 8).fillTriangle(4, 16, 36, 16, 20, 34);
      g.generateTexture('wm-heart-empty', 40, 40);
      g.destroy();
    }
    this.cameras.main.setBackgroundColor(0x6cbf4f);
    this.add.rectangle(width / 2, 140, width, 280, 0x9ed8f5).setDepth(-10);
    this.add.rectangle(width / 2, 300, width, 60, 0x5aa83f).setDepth(-9);
    const trees: Array<[string, number, number]> = [
      ['wm-f007', 40, 0.9], ['wm-f010', 150, 1], ['wm-f038', 270, 0.85], ['wm-f041', 420, 1], ['wm-f007', 540, 0.8], ['wm-f010', 660, 0.95],
    ];
    for (const [k, x, s] of trees) this.add.image(x, 300, k).setOrigin(0.5, 1).setScale(s).setDepth(-8);
    // stripes of lighter grass
    for (let y = 330; y < height; y += 120) this.add.rectangle(width / 2, y + 30, width, 60, 0x76c958, 0.5).setDepth(-7);
    const deco: Array<[string, number, number]> = [
      ['wm-f001', 22, 665], ['wm-f062', 700, 655], ['wm-f003', 702, 900], ['wm-f001', 20, 905],
      ['wm-f053', 250, 1130], ['wm-f062', 470, 1120], ['wm-f049', 610, 1170], ['wm-f050', 360, 1230],
      ['wm-f051', 110, 1200], ['wm-f001', 690, 1250], ['wm-f003', 40, 1110],
    ];
    for (const [k, x, y] of deco) this.add.image(x, y, k).setOrigin(0.5, 1).setScale(1.1).setDepth(0);
  }

  private updateHud(): void {
    const { width } = this.scale;
    this.hud.setRight(`${t('time')} ${Math.max(0, Math.ceil(this.timeLeft))}`);
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? 'wm-heart' : 'wm-heart-empty'));
    this.roundText.setText(`${t('round')} ${Math.max(1, this.round)}`);
    const f = this.quota ? Math.min(1, this.hits / this.quota) : 0;
    this.barFill.width = 372 * f;
    this.barFill.fillColor = f >= 1 ? 0xffd23f : 0x5dff7a;
    this.barText.setText(`${t('target')} ${Math.min(this.hits, this.quota)}/${this.quota}`);
    void width;
  }

  // ---------- rounds ----------
  private startRound(): void {
    const { width, height } = this.scale;
    this.round++;
    this.quota = 10 + (this.round - 1) * 4;
    this.hits = 0;
    this.timeLeft = ROUND_TIME;
    this.playing = false;
    this.updateHud();
    const banner = txt(this, width / 2, height * 0.32, `${t('round')} ${this.round}`, { title: true, size: 50, color: '#ffd23f' }).setDepth(60).setScale(0.3);
    const sub = txt(this, width / 2, height * 0.32 + 70, `${t('target')}: ${this.quota}`, { title: true, size: 24 }).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 200 });
    this.time.delayedCall(1300, () => {
      banner.setText(t('go')).setColor('#5dff7a');
      sub.destroy();
      this.sfx('go', { volume: 0.4 });
      this.tweens.add({ targets: banner, scale: 1.4, alpha: 0, duration: 450, delay: 250, onComplete: () => banner.destroy() });
      this.playing = true;
      this.spawnCd = 0.3;
    });
  }

  private endRound(): void {
    this.playing = false;
    for (const h of this.holes) this.hide(h, true);
    const { width, height } = this.scale;
    if (this.hits >= this.quota) {
      const bonus = 50 * this.round + this.lives * 20;
      this.addScore(bonus);
      this.sfx('clear', { volume: 0.5 });
      flash(this, 0xffffff, 120);
      const b = txt(this, width / 2, height * 0.32, t('roundClear'), { title: true, size: 40, color: '#5dff7a', wrap: width - 60 }).setDepth(60).setScale(0.3);
      const s = txt(this, width / 2, height * 0.32 + 70, `${t('bonus')} +${bonus}`, { title: true, size: 24, color: '#ffd23f' }).setDepth(60);
      this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
      burst(this, width / 2, height * 0.32, [0x5dff7a, 0xffd23f, 0xffffff], 40, 450);
      this.time.delayedCall(1700, () => {
        b.destroy(); s.destroy();
        if (!this.isOver) this.startRound();
      });
    } else {
      this.endGame({ title: t('timeUp'), delay: 700 });
    }
  }

  // ---------- moles ----------
  private pop(): void {
    const free = this.holes.filter((h) => h.kind === null);
    const r = this.round;
    const maxUp = Math.min(4, 1 + Math.ceil(r / 2));
    if (!free.length || 9 - free.length >= maxUp) return;
    const h = rng.pick(free);
    const bombChance = Math.min(0.3, 0.1 + 0.035 * (r - 1));
    const kind: Kind = rng.chance(bombChance) ? 'bomb' : rng.chance(0.08) ? 'gold' : 'animal';
    h.kind = kind; h.hit = false; h.up = true;
    const img = h.img;
    this.tweens.killTweensOf(img);
    img.clearTint().setAngle(0).setAlpha(1).setVisible(true);
    if (kind === 'bomb') {
      img.setTexture('wm-bomb').setTint(0x4a4a5a);
      img.setScale(1);
      h.fuse = this.add.particles(h.x - 18, h.y - 120, 'wm-spark', {
        speed: { min: 20, max: 90 }, scale: { start: 0.1, end: 0 }, lifespan: 300, frequency: 40, tint: [0xffd23f, 0xff8c00], blendMode: 'ADD',
      }).setDepth(3);
    } else {
      img.setTexture('wm-' + rng.pick(ANIMALS));
      img.setScale(ANIMAL_W / img.width);
      if (kind === 'gold') {
        img.setTint(0xffe27a);
        this.sparks.explode(10, h.x, h.y - 60);
      }
    }
    img.y = h.y + 130;
    img.scaleY = img.scaleX;
    const peak = h.y - 46;
    this.sfx('pop', { volume: 0.3, detune: rng.int(-200, 200) });
    this.tweens.add({ targets: img, y: peak, duration: 170, ease: 'Back.easeOut' });
    const upTime = Math.max(0.5, 1.25 - 0.1 * (r - 1)) * (kind === 'gold' ? 0.7 : kind === 'bomb' ? 1.4 : 1) * rng.int(85, 115) / 100;
    h.timer = this.time.delayedCall(170 + upTime * 1000, () => this.hide(h, false));
  }

  private hide(h: Hole, silent: boolean): void {
    if (h.kind === null) return;
    const escaped = !h.hit && h.kind !== 'bomb' && !silent;
    h.timer?.remove();
    h.timer = undefined;
    h.fuse?.destroy();
    h.fuse = undefined;
    h.up = false;
    this.tweens.add({
      targets: h.img, y: h.y + 130, duration: 140, ease: 'Quad.easeIn',
      onComplete: () => { h.kind = null; h.img.setVisible(false); },
    });
    if (escaped) this.combo = 0;
  }

  private swing(h: Hole): void {
    const m = this.mallet;
    this.tweens.killTweensOf(m);
    m.setVisible(true).setAlpha(1).setPosition(h.x + 92, h.y + 10).setAngle(15);
    this.tweens.add({ targets: m, angle: -58, duration: 70, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: m, alpha: 0, delay: 220, duration: 150, onComplete: () => m.setVisible(false) });
    this.sfx('swish', { volume: 0.2 });
  }

  private whack(h: Hole): void {
    if (this.isOver) return;
    this.swing(h);
    if (!this.playing || h.hit) return;
    if (!h.up || h.kind === null) {
      // whiffed: dirt puff, combo lost
      this.leaves.explode(4, h.x, h.y);
      this.combo = 0;
      return;
    }
    h.hit = true;
    h.timer?.remove();
    const img = h.img;
    if (h.kind === 'bomb') {
      this.explode(h);
      return;
    }
    this.combo++;
    this.hits++;
    const mult = Math.min(4, 1 + Math.floor(this.combo / 5));
    const pts = (h.kind === 'gold' ? 50 : 10) * mult;
    this.addScore(pts, h.x, h.y - 150);
    if (mult > 1 && this.combo % 5 === 0) popup(this, h.x, h.y - 210, `${t('combo')} x${mult}`, '#3ee6ff', 22);
    this.sfx('whack', { volume: 0.55 });
    if (h.kind === 'gold') { this.sfx('gold', { volume: 0.45 }); this.sparks.explode(18, h.x, h.y - 50); }
    this.sparks.explode(8, h.x, h.y - 60);
    this.leaves.explode(5, h.x, h.y);
    shake(this, 0.004, 80);
    // squash, flash, then retreat
    this.tweens.killTweensOf(img);
    const sx = img.scaleX;
    img.setTintFill(0xffffff);
    this.time.delayedCall(60, () => { if (h.kind && h.kind !== 'bomb') { img.clearTint(); if (h.kind === 'gold') img.setTint(0xffe27a); } });
    this.tweens.add({ targets: img, scaleY: sx * 0.65, scaleX: sx * 1.2, y: img.y + 18, duration: 80, yoyo: true });
    this.time.delayedCall(200, () => this.hide(h, true));
    this.updateHud();
    if (this.hits === this.quota) {
      this.sfx('clear', { volume: 0.3 });
      this.tweens.add({ targets: this.barText, scale: 1.4, duration: 120, yoyo: true });
    }
  }

  private explode(h: Hole): void {
    const { x, y } = h;
    h.fuse?.destroy(); h.fuse = undefined;
    this.tweens.killTweensOf(h.img);
    h.img.setVisible(false);
    h.kind = null; h.up = false;
    const smoke = this.add.particles(x, y - 50, 'wm-smoke', {
      speed: { min: 40, max: 170 }, scale: { start: 0.3, end: 0.7 }, alpha: { start: 0.7, end: 0 }, lifespan: 750, tint: 0x444444, emitting: false,
    }).setDepth(26);
    smoke.explode(10);
    this.time.delayedCall(900, () => smoke.destroy());
    burst(this, x, y - 50, [0xffd23f, 0xec3013, 0xff8c00], 40, 450);
    popup(this, x, y - 160, t('boom'), '#ec3013', 32);
    this.sfx('boom', { volume: 0.7 });
    this.sfx('hurt', { volume: 0.4 });
    shake(this, 0.025, 320);
    flash(this, 0xec3013, 160);
    this.lives--;
    this.combo = 0;
    this.addScore(-20);
    this.updateHud();
    this.tweens.add({ targets: this.hearts[Math.max(0, this.lives)], scale: 1.6, duration: 120, yoyo: true });
    if (this.lives <= 0) {
      this.playing = false;
      this.endGame({ delay: 900 });
    }
  }

  updateGame(_time: number, delta: number): void {
    if (!this.playing) return;
    const dt = delta / 1000;
    this.timeLeft -= dt;
    const sec = Math.ceil(this.timeLeft);
    if (sec !== this.lastTick) {
      this.lastTick = sec;
      this.updateHud();
      if (sec <= 5 && sec > 0) this.sfx('tick', { volume: 0.4 });
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.updateHud();
      this.endRound();
      return;
    }
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      this.pop();
      if (this.round >= 4 && rng.chance(0.25)) this.pop();
      this.spawnCd = Math.max(0.32, 0.95 - 0.09 * (this.round - 1)) * rng.int(80, 120) / 100;
    }
  }
}
