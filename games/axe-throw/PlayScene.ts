import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';

const W = 720, H = 1280;
const CX = 360, CY = 440, R = 150;
const THROW_Y = 1090;
const AXE_LEN = 190;
const EMBED = 34;              // how deep the blade sinks into the log
const MIN_GAP = 0.24;          // radians between two axes before they clash
const BOSSES = ['target_colored', 'target_red1', 'target_red3', 'target_red2'];

export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('log')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // forest backdrop
  g.fillGradientStyle(0x0d1a24, 0x0d1a24, 0x1f3a2a, 0x1f3a2a, 1).fillRect(0, 0, W, H);
  g.fillStyle(0xffffff, 0.04).fillCircle(360, 440, 330);
  g.fillStyle(0xffffff, 0.04).fillCircle(360, 440, 250);
  g.fillStyle(0x2c4a2e).fillRect(0, 1180, W, 100);
  g.fillStyle(0x3d6b3a).fillRect(0, 1180, W, 10);
  g.generateTexture('forest', W, H);
  g.clear();
  // log face (320x320)
  g.fillStyle(0x4a2a12).fillCircle(160, 160, 160);
  g.fillStyle(0x6b3d1c).fillCircle(160, 160, 152);
  g.fillStyle(0xd9a066).fillCircle(160, 160, 140);
  g.lineStyle(5, 0xb57d45, 1);
  for (const r of [118, 94, 70, 46, 24]) g.strokeCircle(160 + (140 - r) * 0.04, 160, r);
  g.fillStyle(0x8b5a2b).fillCircle(162, 160, 8);
  g.lineStyle(4, 0x8b5a2b, 0.8).lineBetween(160, 30, 168, 80).lineBetween(270, 190, 220, 175).lineBetween(90, 250, 120, 215);
  g.generateTexture('log', 320, 320);
  g.clear();
  // axe (blade up), 80x190
  g.fillStyle(0x5a3418).fillRoundedRect(33, 40, 14, 150, 6);
  g.fillStyle(0x8b5a2b).fillRoundedRect(35, 40, 8, 148, 4);
  g.fillStyle(0x2b1a10).fillRect(32, 150, 16, 6).fillRect(32, 162, 16, 6).fillRect(32, 174, 16, 6);
  g.fillStyle(0x6c7380).fillPoints([
    new Phaser.Geom.Point(4, 6), new Phaser.Geom.Point(76, 6), new Phaser.Geom.Point(54, 58), new Phaser.Geom.Point(26, 58),
  ], true);
  g.fillStyle(0xc8ccd6).fillPoints([
    new Phaser.Geom.Point(6, 4), new Phaser.Geom.Point(74, 4), new Phaser.Geom.Point(56, 46), new Phaser.Geom.Point(24, 46),
  ], true);
  g.fillStyle(0xffffff).fillRect(6, 2, 68, 6);
  g.fillStyle(0x3a3f48).fillRect(32, 34, 16, 18);
  g.generateTexture('axe', 80, 190);
  g.clear();
  // small axe icon for the ammo column
  g.fillStyle(0xffffff).fillRect(13, 10, 6, 34).fillTriangle(2, 2, 30, 2, 16, 16);
  g.generateTexture('axeIcon', 32, 46);
  g.clear();
  // apple
  g.fillStyle(0x7a1010).fillCircle(24, 28, 19);
  g.fillStyle(0xd62828).fillCircle(22, 27, 18);
  g.fillStyle(0xff8a80).fillCircle(15, 21, 5);
  g.fillStyle(0x5a3418).fillRect(23, 2, 4, 12);
  g.fillStyle(0x4caf50).fillEllipse(33, 9, 16, 8);
  g.generateTexture('apple', 48, 48);
  g.destroy();
}

interface Stuck { img: Phaser.GameObjects.Image; phi: number; }
interface AppleObj { img: Phaser.GameObjects.Image; phi: number; }

type Pattern = 'steady' | 'wobble' | 'reverse' | 'jerk';

export class PlayScene extends ArcadeScene {
  private logC!: Phaser.GameObjects.Container;
  private logImg!: Phaser.GameObjects.Image;
  private hand!: Phaser.GameObjects.Image;
  private flying: Phaser.GameObjects.Image | null = null;
  private stuck: Stuck[] = [];
  private apples: AppleObj[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private stage = 1;
  private toThrow = 0;
  private thrown = 0;
  private boss = false;
  private pattern: Pattern = 'steady';
  private baseSpeed = 1.6;
  private speed = 1.6;
  private patT = 0;
  private dirSign = 1;
  private busy = true;
  private failed = false;
  private lives = 3;

  createGame(): void {
    makeTextures(this);
    this.flying = null; this.stuck = []; this.apples = []; this.icons = [];
    this.stage = 1; this.busy = true; this.failed = false; this.lives = 3;
    this.add.image(W / 2, H / 2, 'forest');
    for (const [x, k, s] of [[60, 'pine', 1.3], [660, 'pine', 1.2], [130, 'oak', 0.9], [600, 'oak', 1]] as const) {
      this.add.image(x, 1190, k, undefined).setOrigin(0.5, 1).setScale(s).setTint(0x2a4a35).setAlpha(0.9);
    }
    this.logC = this.add.container(CX, CY).setDepth(10);
    this.logImg = this.add.image(0, 0, 'log');
    this.logC.add(this.logImg);
    this.hand = this.add.image(CX, THROW_Y, 'axe').setDepth(20);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > W - 130 && p.y < 130) return;
      this.throwAxe();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.throwAxe());
    this.input.keyboard?.on('keydown-UP', () => this.throwAxe());
    this.input.keyboard?.on('keydown-Z', () => this.throwAxe());
    this.setupStage();
  }

  private setupStage(): void {
    this.boss = this.stage % 5 === 0;
    // clear old pieces
    for (const s of this.stuck) s.img.destroy();
    for (const a of this.apples) a.img.destroy();
    for (const i of this.icons) i.destroy();
    this.stuck = []; this.apples = []; this.icons = [];
    this.logC.setRotation(0).setScale(0).setAlpha(1);
    if (this.boss) {
      const key = BOSSES[(this.stage / 5 - 1) % BOSSES.length];
      this.logImg.setTexture(key).setScale((R * 2 + 16) / 128);
    } else this.logImg.setTexture('log').setScale(1);

    this.toThrow = this.boss ? Math.min(12, 8 + this.stage / 5) : Math.min(11, 5 + Math.floor(this.stage / 2));
    this.thrown = 0;
    this.baseSpeed = Math.min(3.4, 1.5 + this.stage * 0.09) * (this.boss ? 1.15 : 1);
    const pats: Pattern[] = this.stage < 3 ? ['steady'] : this.stage < 6 ? ['steady', 'wobble', 'reverse'] : ['wobble', 'reverse', 'jerk'];
    this.pattern = this.boss ? rng.pick(['reverse', 'jerk'] as Pattern[]) : rng.pick(pats);
    this.dirSign = rng.pick([-1, 1]);
    this.patT = 0;
    this.speed = this.baseSpeed;

    // obstacles already in the log
    const pre = this.boss ? Math.min(5, 2 + Math.floor(this.stage / 10)) : Math.min(5, Math.floor((this.stage - 1) * 0.7));
    const taken: number[] = [];
    for (let i = 0; i < pre; i++) {
      let phi = 0, ok = false;
      for (let k = 0; k < 30 && !ok; k++) {
        phi = rng.int(0, 628) / 100;
        ok = taken.every((p) => Math.abs(Phaser.Math.Angle.Wrap(p - phi)) > 0.6);
      }
      if (!ok) continue;
      taken.push(phi);
      this.addStuck(phi, false);
    }
    const nApples = rng.chance(this.boss ? 0.9 : 0.55) ? rng.int(1, this.boss ? 3 : 2) : 0;
    for (let i = 0; i < nApples; i++) {
      let phi = 0, ok = false;
      for (let k = 0; k < 30 && !ok; k++) {
        phi = rng.int(0, 628) / 100;
        ok = taken.every((p) => Math.abs(Phaser.Math.Angle.Wrap(p - phi)) > 0.5);
      }
      if (!ok) continue;
      taken.push(phi);
      const img = this.add.image(Math.cos(phi) * (R + 20), Math.sin(phi) * (R + 20), 'apple').setRotation(phi + Math.PI / 2).setScale(1.1);
      this.logC.add(img);
      this.apples.push({ img, phi });
    }

    // ammo column
    for (let i = 0; i < this.toThrow; i++) {
      this.icons.push(this.add.image(46, 1150 - i * 52, 'axeIcon').setDepth(30).setTint(0xffd23f));
    }
    this.hud.setCenter(`${t('stage')} ${this.stage}`);
    this.hud.setRight(`${t('lives')} ${this.lives}`);
    this.hand.setPosition(CX, THROW_Y + 200).setAlpha(1).setAngle(0);
    this.tweens.add({ targets: this.hand, y: THROW_Y, duration: 220, ease: 'Back.easeOut' });

    const title = this.boss ? t('boss') : t('stageN', { n: this.stage });
    const b = txt(this, W / 2, 760, title, { title: true, size: this.boss ? 46 : 40, color: this.boss ? '#ec3013' : '#ffd23f' }).setDepth(50).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1000, duration: 350, onComplete: () => b.destroy() });
    if (this.boss) { this.sfx('boss', { volume: 0.6, exact: true }); shake(this, 0.01, 300); }
    this.tweens.add({
      targets: this.logC, scale: 1, duration: 420, ease: 'Back.easeOut',
      onComplete: () => { this.busy = false; },
    });
  }

  private addStuck(phi: number, fresh: boolean): void {
    const dist = R - EMBED + AXE_LEN / 2;
    const img = this.add.image(Math.cos(phi) * dist, Math.sin(phi) * dist, 'axe').setRotation(phi - Math.PI / 2);
    if (!fresh) img.setTint(0xb0b0b0);
    this.logC.addAt(img, 0);
    this.stuck.push({ img, phi });
  }

  private throwAxe(): void {
    if (this.busy || this.flying || this.failed || this.isOver || !this.scene.isActive()) return;
    if (this.thrown >= this.toThrow) return;
    this.thrown++;
    const icon = this.icons[this.thrown - 1];
    if (icon) { icon.setTint(0x333333); this.tweens.add({ targets: icon, scale: 1.4, duration: 80, yoyo: true }); }
    this.flying = this.add.image(CX, THROW_Y, 'axe').setDepth(20);
    this.hand.setAlpha(0);
    this.sfx(rng.pick(['throw1', 'throw2', 'throw3']), { volume: 0.45 });
  }

  private land(): void {
    const axe = this.flying!;
    this.flying = null;
    const phi = Phaser.Math.Angle.Wrap(Math.PI / 2 - this.logC.rotation);
    const clash = this.stuck.some((s) => Math.abs(Phaser.Math.Angle.Wrap(s.phi - phi)) < MIN_GAP);
    if (clash) { this.fail(axe); return; }

    axe.destroy();
    this.addStuck(phi, true);
    this.sfx('thunk' + Math.floor(Math.random() * 3), { volume: 0.65 });
    if (this.boss) this.sfx('plate', { volume: 0.25 });
    this.addScore(10);
    burst(this, CX, CY + R, this.boss ? [0xffffff, 0xec3013] : [0xd9a066, 0x8b5a2b, 0xffe0b0], 14, 260);
    this.logImg.setTintFill(0xffffff);
    this.time.delayedCall(50, () => this.logImg.clearTint());
    this.tweens.add({ targets: this.logC, y: CY - 14, duration: 50, yoyo: true });
    shake(this, 0.004, 60);

    // apples near the impact are sliced
    for (const a of this.apples) {
      if (!a.img.active) continue;
      if (Math.abs(Phaser.Math.Angle.Wrap(a.phi - phi)) < 0.28) this.sliceApple(a);
    }

    if (this.thrown >= this.toThrow) this.clearStage();
    else {
      this.hand.setPosition(CX, THROW_Y + 60).setAlpha(1);
      this.tweens.add({ targets: this.hand, y: THROW_Y, duration: 90 });
    }
  }

  private sliceApple(a: AppleObj): void {
    const m = a.img.getWorldTransformMatrix();
    const x = m.tx, y = m.ty;
    a.img.destroy();
    this.addScore(50, x, y - 30);
    popup(this, x, y - 80, t('apple'), '#ff4fa3', 22);
    this.sfxAt('apple', x, { volume: 0.6 });
    this.sfxAt('bonus', x, { volume: 0.5, delay: 0.05 });
    burst(this, x, y, [0xd62828, 0xfff2b3, 0x4caf50], 22, 300);
    for (const dir of [-1, 1]) {
      const half = this.add.image(x, y, 'apple').setDepth(40).setCrop(dir < 0 ? 0 : 24, 0, 24, 48);
      this.tweens.add({ targets: half, x: x + dir * 160, y: y + 500, angle: dir * 200, alpha: 0, duration: 900, ease: 'Quad.easeIn', onComplete: () => half.destroy() });
    }
  }

  private fail(axe: Phaser.GameObjects.Image): void {
    this.lives--;
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.sfx('clang', { volume: 0.75 });
    this.sfx('hurt', { volume: 0.45, delay: 0.08 });
    if (this.lives === 1) this.sfx('low', { volume: 0.4, delay: 0.5 });
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 160);
    burst(this, axe.x, axe.y - 80, [0xffffff, 0xffd23f], 24, 340);
    const dir = rng.pick([-1, 1]);
    this.tweens.add({ targets: axe, x: axe.x + dir * 260, y: H + 200, angle: dir * 720, duration: 900, ease: 'Quad.easeIn', onComplete: () => axe.destroy() });
    if (this.lives <= 0) {
      this.failed = true;
      this.endGame({ delay: 1100 });
      return;
    }
    // the bounced axe is lost; a short pause before the next one
    this.busy = true;
    this.time.delayedCall(450, () => {
      if (this.isOver) return;
      if (this.thrown >= this.toThrow) { this.clearStage(); return; }
      this.busy = false;
      this.hand.setPosition(CX, THROW_Y + 80).setAlpha(1);
      this.tweens.add({ targets: this.hand, y: THROW_Y, duration: 120 });
    });
  }

  private clearStage(): void {
    this.busy = true;
    const bossWas = this.boss;
    this.time.delayedCall(180, () => {
      if (this.isOver) return;
      this.sfx('shatter', { volume: 0.75 });
      this.sfx('crunch', { volume: 0.55 });
      this.sfx('clear', { volume: 0.6, exact: true, delay: 0.3 });
      shake(this, 0.018, 280);
      flash(this, 0xffffff, 120);
      const bonus = bossWas ? 150 + this.stage * 20 : 20 * this.stage;
      this.addScore(bonus, CX, CY);
      popup(this, CX, CY - 90, bossWas ? t('bossDown') : t('clear'), '#5dff7a', bossWas ? 26 : 30);
      burst(this, CX, CY, [0xd9a066, 0x8b5a2b, 0xffd23f], 50, 520);
      // debris chunks
      for (let i = 0; i < 9; i++) {
        const a = rng.int(0, 628) / 100;
        const d = this.add.image(CX + Math.cos(a) * 60, CY + Math.sin(a) * 60, 'debris' + rng.int(1, 3)).setDepth(40).setScale(rng.int(9, 15) / 10);
        if (bossWas) d.setTint(0xff9b6b);
        this.tweens.add({
          targets: d, x: d.x + Math.cos(a) * rng.int(200, 400), y: d.y + Math.sin(a) * 200 + 900, angle: rng.int(-400, 400),
          duration: rng.int(900, 1300), ease: 'Quad.easeIn', onComplete: () => d.destroy(),
        });
      }
      // stuck axes fly off
      for (const s of this.stuck) {
        const m = s.img.getWorldTransformMatrix();
        const fly = this.add.image(m.tx, m.ty, 'axe').setRotation(s.phi + this.logC.rotation - Math.PI / 2).setDepth(41);
        const ang = s.phi + this.logC.rotation;
        this.tweens.add({
          targets: fly, x: fly.x + Math.cos(ang) * 300, y: fly.y + Math.sin(ang) * 150 + 1000, angle: fly.angle + rng.int(-540, 540),
          duration: 1100, ease: 'Quad.easeIn', onComplete: () => fly.destroy(),
        });
        s.img.destroy();
      }
      this.stuck = [];
      for (const a of this.apples) a.img.destroy();
      this.apples = [];
      this.logC.setScale(0);
      this.time.delayedCall(950, () => {
        if (this.isOver) return;
        this.stage++;
        if (this.stage % 5 !== 0) this.sfx('stage', { volume: 0.45 });
        this.setupStage();
      });
    });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    // rotation patterns
    this.patT += dt;
    let sp = this.baseSpeed;
    switch (this.pattern) {
      case 'wobble': sp = this.baseSpeed * (1 + 0.75 * Math.sin(this.patT * 1.6)); break;
      case 'reverse':
        if (this.patT > 2.2) { this.patT = 0; this.dirSign = -this.dirSign; }
        sp = this.baseSpeed * Math.min(1, this.patT * 1.6) * 1.15;
        break;
      case 'jerk': {
        const ph = this.patT % 2.4;
        sp = ph < 0.7 ? this.baseSpeed * 2.1 : ph < 1.4 ? this.baseSpeed * 0.25 : this.baseSpeed;
        if (this.patT > 7.2) { this.patT = 0; this.dirSign = -this.dirSign; }
        break;
      }
    }
    this.speed = Phaser.Math.Linear(this.speed, sp * this.dirSign, Math.min(1, dt * 5));
    if (!this.failed) this.logC.rotation += this.speed * dt;

    if (this.flying) {
      this.flying.y -= 3000 * dt;
      if (this.flying.y - AXE_LEN / 2 <= CY + R - EMBED) {
        this.flying.y = CY + R - EMBED + AXE_LEN / 2;
        this.land();
      }
    }
  }
}
