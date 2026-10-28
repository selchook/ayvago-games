import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, popup, txt, t, rng } from '@core';

type Kind = 'bronze' | 'silver' | 'gold' | 'gem' | 'star' | 'heart' | 'bomb';
interface Item {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  vy: number;
  vx: number;
  value: number;
  r: number;
  sway: number;
  t: number;
  done: boolean;
}

const GROUND_Y = 1168;
const BASKET_W = 150;
const MAX_LIVES = 3;
const CATCHES_PER_LEVEL = 15;


/** Screen flash that never fully covers the view (the core camera flash starts opaque). */
function softFlash(scene: Phaser.Scene, color: number, ms = 120): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, 0.4).setOrigin(0).setScrollFactor(0).setDepth(8000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms * 2, onComplete: () => r.destroy() });
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.GameObjects.Image;
  private basket!: Phaser.GameObjects.Image;
  private magnetFx!: Phaser.GameObjects.Arc;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hearts: Phaser.GameObjects.Image[] = [];
  private comboText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private items: Item[] = [];
  private lives = MAX_LIVES;
  private level = 1;
  private catches = 0;
  private combo = 0;
  private spawnCd = 0;
  private magnet = 0;
  private hurtT = 0;
  private walkT = 0;
  private targetX: number | null = null;
  private rainT = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.items = []; this.hearts = [];
    this.lives = MAX_LIVES; this.level = 1; this.catches = 0; this.combo = 0;
    this.spawnCd = 1; this.magnet = 0; this.hurtT = 0; this.walkT = 0; this.targetX = null; this.rainT = 0;

    this.add.image(width / 2, GROUND_Y + 30 - 640, 'cc-bg').setDisplaySize(1280, 1280).setDepth(-10);
    for (let x = 48; x < width + 96; x += 96) this.add.image(x, GROUND_Y + 48, 'cc-grass').setScale(0.75).setDepth(-5);
    this.add.rectangle(width / 2, GROUND_Y + 110, width, 120, 0xb07c4f).setDepth(-6);

    if (!this.textures.exists('cc-basket')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x6b3e1f).fillRoundedRect(0, 4, 160, 16, 6);                 // rim
      g.fillStyle(0xa8642e);
      g.beginPath(); g.moveTo(8, 18); g.lineTo(152, 18); g.lineTo(134, 70); g.lineTo(26, 70); g.closePath(); g.fillPath();
      g.lineStyle(4, 0x7a4520);
      for (let i = 0; i < 5; i++) { g.lineBetween(30 + i * 25, 20, 36 + i * 22, 68); }
      g.lineBetween(14, 36, 146, 36); g.lineBetween(20, 53, 140, 53);
      g.fillStyle(0xc98a4a).fillRoundedRect(0, 0, 160, 10, 5);
      g.generateTexture('cc-basket', 160, 74);
      g.destroy();
    }

    this.player = this.add.image(width / 2, GROUND_Y + 4, 'cc-alien-front').setOrigin(0.5, 1).setScale(0.72).setDepth(10);
    this.basket = this.add.image(width / 2, 0, 'cc-basket').setDepth(11);
    this.magnetFx = this.add.circle(width / 2, 0, 120, 0xff4fa3, 0.12).setStrokeStyle(4, 0xff4fa3, 0.7).setDepth(9).setVisible(false);
    this.sparks = this.add.particles(0, 0, 'cc-spark', {
      speed: { min: 80, max: 260 }, angle: { min: 200, max: 340 }, scale: { start: 0.14, end: 0 }, lifespan: 500,
      tint: [0xffd23f, 0xffffff], blendMode: 'ADD', emitting: false,
    }).setDepth(20);

    for (let i = 0; i < MAX_LIVES; i++) this.hearts.push(this.add.image(44 + i * 50, 92, 'cc-heart').setScale(0.36).setScrollFactor(0).setDepth(9000));
    this.comboText = txt(this, width - 130, 92, '', { title: true, size: 26, color: '#ffd23f' }).setOrigin(1, 0.5).setDepth(9000);
    this.hint = txt(this, width / 2, height * 0.62, t('dragHint'), { size: 40 }).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 1800, duration: 600 });

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!(p.x > width - 130 && p.y < 130)) this.targetX = p.x; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown && this.targetX !== null) this.targetX = p.x; });
    this.input.on('pointerup', () => { this.targetX = null; });

    this.updateHud();
  }

  private get mult(): number {
    return Math.min(5, 1 + Math.floor(this.combo / 5));
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? 'cc-heart' : 'cc-heart-empty'));
    this.comboText.setText(this.mult > 1 ? `x${this.mult}` : '');
  }

  // ---------- spawning ----------
  private spawn(x?: number, forced?: Kind): void {
    const { width } = this.scale;
    const lvl = this.level;
    const bombChance = Math.min(0.4, 0.12 + 0.03 * (lvl - 1));
    let kind: Kind;
    if (forced) kind = forced;
    else if (rng.chance(bombChance)) kind = 'bomb';
    else if (this.lives < MAX_LIVES && rng.chance(0.015)) kind = 'heart';
    else if (rng.chance(0.025)) kind = 'star';
    else if (rng.chance(0.08 + lvl * 0.01)) kind = 'gem';
    else kind = rng.pick<Kind>(['bronze', 'bronze', 'silver', 'silver', 'gold']);

    const key = kind === 'gem' ? `cc-gem-${rng.pick(['blue', 'green', 'red', 'yellow'])}`
      : kind === 'bomb' ? 'cc-bomb' : kind === 'star' ? 'cc-star' : kind === 'heart' ? 'cc-heart' : `cc-coin-${kind}`;
    const value = { bronze: 5, silver: 10, gold: 20, gem: 50, star: 25, heart: 0, bomb: 0 }[kind];
    const px = x ?? rng.int(50, width - 50);
    const img = this.add.image(px, -60, key).setDepth(8);
    const scale = kind === 'bomb' ? 0.7 : kind === 'heart' ? 0.55 : kind === 'gem' ? 0.8 : 0.85;
    img.setScale(0);
    this.tweens.add({ targets: img, scale, duration: 200, ease: 'Back.easeOut' });
    if (kind === 'bomb') img.setTint(0x4a4a5a);
    if (kind === 'bronze' || kind === 'silver' || kind === 'gold') {
      // coins spin
      this.tweens.add({ targets: img, scaleX: { from: scale, to: 0.1 }, duration: 260, yoyo: true, repeat: -1, delay: 200 });
    }
    const speed = Math.min(760, 250 + 42 * (lvl - 1)) * rng.int(88, 115) / 100;
    this.items.push({
      img, kind, value, vy: kind === 'star' || kind === 'heart' ? speed * 0.75 : speed, vx: 0, r: 30,
      sway: kind === 'gem' || kind === 'star' || (kind === 'bomb' && lvl >= 4 && rng.chance(0.4)) ? rng.int(40, 90) : 0, t: rng.int(0, 100) / 10, done: false,
    });
  }

  private bombRain(): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.35, t('bombs'), { title: true, size: 34, color: '#ec3013' }).setDepth(60).setScale(0.4);
    this.tweens.add({ targets: b, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1100, duration: 300, onComplete: () => b.destroy() });
    // a line of bombs with one safe gap holding gold
    const n = 6, gap = rng.int(0, n - 1);
    for (let i = 0; i < n; i++) {
      const x = 60 + i * ((width - 120) / (n - 1));
      this.time.delayedCall(700, () => { if (!this.isOver) this.spawn(x, i === gap ? 'gold' : 'bomb'); });
    }
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width } = this.scale;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.magnet = Math.max(0, this.magnet - dt);

    // movement: keyboard axis, or follow the finger
    let vx = this.controls.axisX * 820;
    if (this.targetX !== null) {
      const d = this.targetX - this.player.x;
      vx = Phaser.Math.Clamp(d * 14, -1150, 1150);
      if (Math.abs(d) < 4) vx = 0;
    }
    this.player.x = Phaser.Math.Clamp(this.player.x + vx * dt, 70, width - 70);
    if (this.hurtT > 0) this.player.setTexture('cc-alien-hit');
    else if (Math.abs(vx) > 30) {
      this.walkT += dt;
      this.player.setTexture(Math.floor(this.walkT * 9) % 2 ? 'cc-alien-walk1' : 'cc-alien-walk2').setFlipX(vx < 0);
    } else this.player.setTexture('cc-alien-front');
    const by = this.player.y - this.player.displayHeight - 20;
    this.basket.setPosition(this.player.x, by);
    this.basket.setAngle(Phaser.Math.Clamp(vx / 120, -6, 6));
    this.magnetFx.setVisible(this.magnet > 0).setPosition(this.basket.x, by);
    if (this.magnet > 0) this.magnetFx.setAlpha(this.magnet < 1.5 ? (Math.floor(this.magnet * 8) % 2 ? 0.3 : 1) : 1);

    // spawn pacing ramps with level
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      this.spawn();
      this.spawnCd = Math.max(0.3, 0.95 - 0.07 * (this.level - 1)) * rng.int(80, 120) / 100;
    }
    if (this.level >= 3) {
      this.rainT += dt;
      if (this.rainT > Math.max(9, 18 - this.level)) { this.rainT = 0; this.bombRain(); }
    }

    const top = by - 30;
    for (const it of this.items) {
      it.t += dt;
      it.img.y += it.vy * dt;
      if (it.sway) it.img.x += Math.cos(it.t * 3) * it.sway * dt;
      if (this.magnet > 0 && it.kind !== 'bomb' && it.img.y < top + 10 && it.img.y > top - 520) {
        it.img.x += Phaser.Math.Clamp(this.basket.x - it.img.x, -1, 1) * Math.min(Math.abs(this.basket.x - it.img.x), 600 * dt);
      }
      it.img.x = Phaser.Math.Clamp(it.img.x, 30, width - 30);
      if (it.img.y + it.r > top && it.img.y - it.r < top + 34 && Math.abs(it.img.x - this.basket.x) < BASKET_W / 2 + 6) {
        this.catchItem(it);
      } else if (it.img.y > GROUND_Y - 16) {
        this.landItem(it);
      }
    }
    this.items = this.items.filter((it) => !it.done);
  }

  private finish(it: Item): void {
    it.done = true;
    this.tweens.killTweensOf(it.img);
  }

  private catchItem(it: Item): void {
    this.finish(it);
    const { x, y } = it.img;
    if (it.kind === 'bomb') {
      it.img.destroy();
      this.explode(x, y, true);
      return;
    }
    // squash the basket
    this.tweens.add({ targets: this.basket, scaleY: 0.8, scaleX: 1.1, duration: 70, yoyo: true });
    this.tweens.add({ targets: it.img, y: y + 20, scale: 0, alpha: 0, duration: 140, onComplete: () => it.img.destroy() });
    if (it.kind === 'heart') {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
      popup(this, x, y - 40, t('life'), '#ff4fa3');
      this.sfx('heart', { volume: 0.5 });
      burst(this, x, y, [0xff4fa3, 0xffffff], 20, 260);
      this.updateHud();
      return;
    }
    if (it.kind === 'star') {
      this.magnet = 7;
      popup(this, x, y - 70, t('magnet'), '#ff4fa3', 24);
      this.sfx('magnet', { volume: 0.45 });
      softFlash(this, 0xff4fa3, 90);
    }
    const prevMult = this.mult;
    this.combo++;
    this.catches++;
    this.addScore(it.value * this.mult, x, y - 40);
    this.sparks.explode(it.kind === 'gem' ? 14 : 8, x, y);
    if (it.kind === 'gem') { this.sfx('gem', { volume: 0.55 }); burst(this, x, y, [0x3ee6ff, 0xffffff, 0x5dff7a], 14, 240); }
    else this.sfx('coin', { volume: 0.3, detune: Math.min(this.combo, 20) * 20 });
    if (this.mult > prevMult) {
      this.sfx('combo', { volume: 0.4 });
      this.tweens.add({ targets: this.comboText, scale: 1.6, duration: 120, yoyo: true });
      popup(this, this.player.x, this.basket.y - 110, `${t('combo')} x${this.mult}`, '#3ee6ff', 26);
    }
    if (this.catches % CATCHES_PER_LEVEL === 0) this.levelUp();
    this.updateHud();
  }

  private landItem(it: Item): void {
    this.finish(it);
    const { x } = it.img;
    if (it.kind === 'bomb') {
      it.img.destroy();
      this.explode(x, GROUND_Y - 20, false);
      return;
    }
    // missed valuables break the combo
    if (it.kind !== 'heart' && it.kind !== 'star') {
      if (this.combo >= 5) popup(this, x, GROUND_Y - 60, `${t('combo')} 0`, '#ec3013', 18);
      this.combo = 0;
      this.updateHud();
    }
    this.sfx('thud', { volume: 0.3 });
    burst(this, x, GROUND_Y - 10, [0x8bc34a, 0xffffff], 6, 120);
    this.tweens.add({ targets: it.img, y: GROUND_Y - 4, alpha: 0, scale: 0.2, duration: 220, onComplete: () => it.img.destroy() });
  }

  private explode(x: number, y: number, caught: boolean): void {
    const smoke = this.add.particles(x, y, 'cc-smoke', {
      speed: { min: 40, max: 160 }, scale: { start: 0.25, end: 0.6 }, alpha: { start: 0.7, end: 0 }, lifespan: 700,
      tint: [0x555555, 0x333333], emitting: false,
    }).setDepth(19);
    smoke.explode(caught ? 10 : 5);
    this.time.delayedCall(900, () => smoke.destroy());
    burst(this, x, y, [0xffd23f, 0xec3013, 0xff8c00], caught ? 36 : 16, caught ? 420 : 240);
    this.sfx('boom', { volume: caught ? 0.7 : 0.35 });
    if (!caught) { shake(this, 0.004, 100); return; }
    this.lives--;
    this.combo = 0;
    this.hurtT = 0.6;
    popup(this, x, y - 50, t('boom'), '#ec3013', 30);
    this.sfx('hurt', { volume: 0.5 });
    shake(this, 0.022, 320);
    softFlash(this, 0xec3013, 160);
    this.tweens.add({ targets: this.hearts[this.lives], scale: 0.6, duration: 120, yoyo: true });
    this.updateHud();
    if (this.lives <= 0) {
      this.player.setTexture('cc-alien-hit');
      this.tweens.add({ targets: this.basket, y: GROUND_Y, angle: 120, duration: 500, ease: 'Bounce.easeOut' });
      this.endGame({ delay: 1000 });
    }
  }

  private levelUp(): void {
    const { width, height } = this.scale;
    this.level++;
    this.sfx('level', { volume: 0.5 });
    const b = txt(this, width / 2, height * 0.42, `${t('level')} ${this.level}`, { title: true, size: 46, color: '#ffd23f' }).setDepth(60).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 900, duration: 400, onComplete: () => b.destroy() });
    burst(this, width / 2, height * 0.42, [0xffd23f, 0xffffff], 24, 380);
  }
}
