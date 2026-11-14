// Rooftop Courier: the touch pad and the HUD pieces of the Play scene.
//   - TouchPad: the left thumb drags a floating stick to steer; on the right a JUMP button (held
//     for a longer jump) and a SLIDE button, and swipes anywhere else on the right half: a tap or
//     a swipe up jumps (held while the finger stays down), a swipe down slides or rolls.
//   - FlowMeter, the rubber stamp of a delivery, banners, words and the tutorial card. Every
//     always-visible readout sits in a core hudChip.
import Phaser from 'phaser';
import { txt, hudChip, HudChip, HUD_CHIP_H } from '@core';
import { clamp } from './defs';

export const UI_DEPTH = 9300;
const PAUSE_ZONE = 120;

export class TouchPad {
  /** Steering, −1 … 1. */
  steer = 0;
  private jumpIds = new Set<number>();
  private downT = 0;
  private stick = { id: -1, ox: 0, x: 0, y: 0 };
  private swipe: { id: number; x: number; y: number; t: number; fired: boolean; slid: boolean } | null = null;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private jumpBtn: Phaser.GameObjects.Container;
  private slideBtn: Phaser.GameObjects.Container;
  private trail: Phaser.GameObjects.Graphics;
  private trailPts: { x: number; y: number; t: number }[] = [];
  static readonly JUMP = { x: 598, y: 1112, r: 96 };
  static readonly SLIDE = { x: 618, y: 918, r: 64 };

  constructor(private scene: Phaser.Scene, labels: { jump: string; slide: string }) {
    const s = scene;
    s.input.addPointer(3);
    const D = UI_DEPTH + 100;
    this.base = s.add.circle(0, 0, 84, 0xffffff, 0.1).setStrokeStyle(4, 0xffffff, 0.35).setScrollFactor(0).setDepth(D).setVisible(false);
    this.knob = s.add.circle(0, 0, 40, 0xffffff, 0.38).setScrollFactor(0).setDepth(D).setVisible(false);
    this.trail = s.add.graphics().setScrollFactor(0).setDepth(D);
    this.jumpBtn = this.button(TouchPad.JUMP, 0xff8a3d, labels.jump, 30, 'up');
    this.slideBtn = this.button(TouchPad.SLIDE, 0x3ec1ff, labels.slide, 21, 'down');
    s.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(p));
    s.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    s.input.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
    s.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.up(p));
  }

  private button(b: { x: number; y: number; r: number }, color: number, label: string, size: number, arrow: 'up' | 'down'): Phaser.GameObjects.Container {
    const s = this.scene, r = b.r;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.25).fillCircle(0, 6, r);
    g.fillStyle(color, 0.42).fillCircle(0, 0, r);
    g.lineStyle(5, 0xffffff, 0.75).strokeCircle(0, 0, r - 2);
    g.fillStyle(0xffffff, 0.16).fillEllipse(0, -r * 0.45, r * 1.3, r * 0.6);
    // an arrow: up over the label (jump), down under it (slide)
    const up = arrow === 'up';
    const ay = up ? -r * 0.42 : r * 0.42, h = r * 0.16, w = r * 0.22;
    g.fillStyle(0xffffff, 0.9).fillTriangle(-w, ay + (up ? h : -h), w, ay + (up ? h : -h), 0, ay + (up ? -h : h));
    const l = txt(s, 0, up ? r * 0.1 : -r * 0.08, label, { title: true, size, color: '#ffffff', strokeThickness: 5 });
    return s.add.container(b.x, b.y, [g, l]).setScrollFactor(0).setDepth(UI_DEPTH + 100);
  }

  private hit(p: Phaser.Input.Pointer, b: { x: number; y: number; r: number }, extra = 14): boolean {
    return Math.hypot(p.x - b.x, p.y - b.y) < b.r + extra;
  }

  private press(p: Phaser.Input.Pointer): void {
    const { width } = this.scene.scale;
    if (p.x > width - PAUSE_ZONE && p.y < PAUSE_ZONE) return;
    if (this.hit(p, TouchPad.JUMP)) { this.jumpIds.add(p.id); this.jumpBtn.setScale(0.93); return; }
    if (this.hit(p, TouchPad.SLIDE, 10)) { this.downT = 0.12; this.scene.tweens.add({ targets: this.slideBtn, scale: { from: 0.86, to: 1 }, duration: 160 }); return; }
    if (p.x < width * 0.5) {
      if (this.stick.id >= 0) return;
      this.stick = { id: p.id, ox: p.x, x: p.x, y: p.y };
      this.base.setPosition(p.x, p.y).setVisible(true);
      this.knob.setPosition(p.x, p.y).setVisible(true);
      return;
    }
    if (!this.swipe) this.swipe = { id: p.id, x: p.x, y: p.y, t: this.scene.time.now, fired: false, slid: false };
    this.trailPts = [{ x: p.x, y: p.y, t: this.scene.time.now }];
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id === this.stick.id) {
      this.stick.x = p.x; this.stick.y = p.y;
      const dx = clamp(p.x - this.stick.ox, -80, 80);
      // the base follows a thumb that keeps going, so turning back answers at once
      if (Math.abs(p.x - this.stick.ox) > 80) { this.stick.ox = p.x - Math.sign(p.x - this.stick.ox) * 80; this.base.setX(this.stick.ox); }
      this.knob.setPosition(this.stick.ox + dx, this.base.y);
      return;
    }
    const sw = this.swipe;
    if (sw && p.id === sw.id) {
      this.trailPts.push({ x: p.x, y: p.y, t: this.scene.time.now });
      const dy = p.y - sw.y;
      if (!sw.fired && !sw.slid && dy < -18) { sw.fired = true; this.jumpIds.add(p.id); }
      else if (!sw.slid && dy > 26) { sw.slid = true; this.downT = 0.12; }
    }
  }

  private up(p: Phaser.Input.Pointer): void {
    if (this.jumpIds.has(p.id)) { this.jumpIds.delete(p.id); this.jumpBtn.setScale(1); }
    if (p.id === this.stick.id) {
      this.stick.id = -1;
      this.base.setVisible(false); this.knob.setVisible(false);
    }
    const sw = this.swipe;
    if (sw && p.id === sw.id) {
      // a quick tap that never moved: a short jump
      if (!sw.fired && !sw.slid) { this.tapJump = 2; }
      this.swipe = null;
    }
  }
  private tapJump = 0;

  /** Call once per frame. */
  update(dt: number): void {
    if (this.stick.id >= 0) {
      const dx = this.stick.x - this.stick.ox;
      this.steer = Math.abs(dx) < 8 ? 0 : clamp(dx / 64, -1, 1);
    } else this.steer = 0;
    // a touch on the right half becomes a jump after a moment unless it turned into a swipe down
    const sw = this.swipe;
    if (sw && !sw.fired && !sw.slid && this.scene.time.now - sw.t > 70) { sw.fired = true; this.jumpIds.add(sw.id); }
    this.downT = Math.max(0, this.downT - dt);
    if (this.tapJump > 0) this.tapJump--;
    const now = this.scene.time.now;
    this.trailPts = this.trailPts.filter((q) => now - q.t < 200);
    const tg = this.trail.clear();
    for (let i = 1; i < this.trailPts.length; i++) {
      const a = this.trailPts[i - 1], b = this.trailPts[i];
      const k = 1 - (now - b.t) / 200;
      tg.lineStyle(14 * k + 2, 0xffffff, 0.45 * k).lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  get jump(): boolean { return this.jumpIds.size > 0 || this.tapJump > 0; }
  get down(): boolean { return this.downT > 0; }

  setVisible(v: boolean): void { this.jumpBtn.setVisible(v); this.slideBtn.setVisible(v); }
}

/** The flow meter: a bar and the multiplier inside a HUD chip. */
export class FlowMeter {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private shown = '';

  constructor(scene: Phaser.Scene, x: number, y: number, caption: string, private w = 132) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', w);
    this.label = txt(scene, 0, 0, '×1.0', { title: true, size: 22, color: '#ffffff', strokeThickness: 0, shadow: false });
    this.label.setData('chipWidth', 62);
    this.chip = hudChip(scene, x, y, { align: 'right', label: caption, items: [this.bar, this.label] });
  }

  set(k: number, mult: number, rush: boolean, time: number): void {
    const key = `${Math.round(k * 100)}|${mult.toFixed(2)}|${rush}|${rush ? Math.floor(time * 8) : 0}`;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.bar.clear(), w = this.w, h = 16;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (k > 0.01) {
      const col = rush ? (Math.floor(time * 8) % 2 ? 0x7fe0ff : 0xffffff) : k > 0.8 ? 0x7fe0ff : 0x4aa8ff;
      g.fillStyle(col, 1).fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * clamp(k, 0, 1)), h, h / 2);
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 2, Math.max(4, w * clamp(k, 0, 1) - 6), 5, 2);
    }
    this.label.setText('×' + mult.toFixed(1).replace('.', ','));
    this.label.setColor(mult >= 2 ? '#7fe0ff' : '#ffffff');
  }
}

/** A big word that pops in and floats away. */
export function banner(scene: Phaser.Scene, x: number, y: number, s: string, o: { color?: string; size?: number; hold?: number; sub?: string; subColor?: string } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 50);
  const main = txt(scene, 0, 0, s, { title: true, size: o.size ?? 54, color: o.color ?? '#ffd23f', strokeThickness: 10, wrap: 660 });
  c.add(main);
  if (o.sub) c.add(txt(scene, 0, main.height / 2 + 26, o.sub, { title: true, size: 28, color: o.subColor ?? '#ffffff', strokeThickness: 7, wrap: 640 }));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 50, alpha: 0, delay: 220 + (o.hold ?? 0.8) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  return c;
}

/** A small word by the courier (a move and its points). */
export function popWord(scene: Phaser.Scene, x: number, y: number, s: string, color: string, size = 28): void {
  const t = txt(scene, x, y, s, { title: true, size, color, strokeThickness: 7 }).setScrollFactor(0).setDepth(UI_DEPTH + 40);
  t.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 150, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 480, duration: 380, onComplete: () => t.destroy() });
}

/** The rubber stamp of a delivery: thumps down at an angle in red ink, then fades. */
export function rubberStamp(scene: Phaser.Scene, x: number, y: number, word: string, sub: string): void {
  const c = scene.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 60);
  const t = txt(scene, 0, 0, word, { title: true, size: 64, color: '#e8443a', strokeThickness: 0, shadow: false });
  const w = t.width + 60, h = t.height + 34;
  const g = scene.add.graphics();
  g.lineStyle(9, 0xe8443a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
  g.lineStyle(3, 0xe8443a, 0.8).strokeRoundedRect(-w / 2 + 12, -h / 2 + 12, w - 24, h - 24, 10);
  // a worn ink texture: a few gaps
  g.fillStyle(0xffffff, 0.0);
  c.add([g, t]);
  if (sub) c.add(txt(scene, 0, h / 2 + 30, sub, { title: true, size: 26, color: '#fff3c4', strokeThickness: 6 }));
  c.setAngle(-9).setScale(2.4).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 170, ease: 'Quad.easeIn', onComplete: () => {
    scene.tweens.add({ targets: c, scale: 1.04, duration: 70, yoyo: true });
  } });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: 1250, duration: 400, onComplete: () => c.destroy() });
}

/** A toast chip under the HUD (missions done). */
export function toast(scene: Phaser.Scene, y: number, title: string, text: string, icon: string): void {
  const chip = hudChip(scene, scene.scale.width / 2, y, { align: 'center', icon, iconSize: 32, label: title, text, color: '#7dffa0', size: 24, height: HUD_CHIP_H + 12, depth: UI_DEPTH + 60 });
  chip.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: chip, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: chip, alpha: 0, y: y - 30, delay: 2400, duration: 400, onComplete: () => chip.destroy() });
}

/** The tutorial's prompt: step count, what to do, a tick when done, and a SKIP pill. */
export class TutorialCard {
  readonly c: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private g: Phaser.GameObjects.Graphics;
  private tick: Phaser.GameObjects.Graphics;
  static readonly W = 640;

  constructor(private scene: Phaser.Scene, y: number, skipLabel: string, onSkip: () => void) {
    const s = scene;
    this.c = s.add.container(s.scale.width / 2, y).setScrollFactor(0).setDepth(UI_DEPTH + 30);
    this.g = s.add.graphics();
    this.head = txt(s, -TutorialCard.W / 2 + 28, 0, '', { title: true, size: 20, color: '#ffd23f', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.body = txt(s, -TutorialCard.W / 2 + 28, 0, '', { size: 23, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: TutorialCard.W - 230, align: 'left' }).setOrigin(0, 0.5);
    this.tick = s.add.graphics().setVisible(false);
    const sg = s.add.graphics();
    sg.fillStyle(0xffffff, 0.14).fillRoundedRect(-70, -40, 140, 80, 40).lineStyle(2, 0xffffff, 0.4).strokeRoundedRect(-70, -40, 140, 80, 40);
    const st = txt(s, 0, 0, skipLabel, { title: true, size: 20, color: '#ffffff', strokeThickness: 0, shadow: false });
    const skip = s.add.container(TutorialCard.W / 2 - 90, 0, [sg, st]).setSize(150, 88).setInteractive({ useHandCursor: true });
    skip.on('pointerup', onSkip);
    this.c.add([this.g, this.head, this.body, this.tick, skip]);
  }

  set(head: string, body: string): void {
    this.head.setText(head);
    this.body.setText(body);
    const h = Math.max(116, this.body.height + 64);
    this.head.setY(-h / 2 + 24);
    this.body.setY(-h / 2 + 46 + this.body.height / 2);
    this.g.clear();
    this.g.fillStyle(0x000000, 0.28).fillRoundedRect(-TutorialCard.W / 2, -h / 2 + 6, TutorialCard.W, h, 24);
    this.g.fillStyle(0x14112a, 0.88).fillRoundedRect(-TutorialCard.W / 2, -h / 2, TutorialCard.W, h, 24);
    this.g.lineStyle(3, 0xffb24a, 0.8).strokeRoundedRect(-TutorialCard.W / 2, -h / 2, TutorialCard.W, h, 24);
    this.tick.setVisible(false);
    this.c.setAlpha(0).setScale(0.85);
    this.scene.tweens.add({ targets: this.c, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  done(): void {
    const t = this.tick.clear().setVisible(true).setPosition(TutorialCard.W / 2 - 200, 0);
    t.fillStyle(0x2fae5a, 1).fillCircle(0, 0, 30).lineStyle(7, 0xffffff, 1).beginPath().moveTo(-13, 0).lineTo(-3, 10).lineTo(14, -10).strokePath();
    t.setScale(0.3);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  destroy(): void {
    const c = this.c;
    this.scene.tweens.add({ targets: c, alpha: 0, y: c.y - 30, duration: 260, onComplete: () => c.destroy() });
  }
}
