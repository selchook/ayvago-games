// Star Squadron: the game's own UI pieces in the modern style (glass, rounded buttons): the power
// buttons with their cooldown sweeps, the hull bar, the boss bar and the banners. Fixed to the camera.
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip } from '@core';
import { powerArt } from './art';
import type { PowerId } from './defs';

export const UI_DEPTH = 9100;

/** A glass panel centred on (0, 0) of a container. */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x121a33, o.alpha ?? 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, o.rim ?? 0xffffff, o.rim ? 0.9 : 0.16).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** A rounded, tappable button with a main label and an optional second line. */
export class Pill extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  readonly main: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  enabled = true;
  private icon: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, private color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.72), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.onTap();
    });
    this.draw();
    scene.add.existing(this);
  }

  setColor(c: number): this { if (c !== this.color) { this.color = c; this.draw(); } return this; }
  setEnabled(on: boolean): this { if (on !== this.enabled) { this.enabled = on; this.draw(); } return this; }

  /** A small icon before the second line (credits, stardust). */
  setIcon(key: string | null): this {
    this.icon?.destroy();
    this.icon = key ? this.scene.add.image(0, 0, key).setDisplaySize(24, 24) : null;
    if (this.icon) this.add(this.icon);
    this.layout();
    return this;
  }

  setLabels(main: string, sub = ''): this {
    if (this.main.text !== main) this.main.setText(main);
    if (this.sub.text !== sub) this.sub.setText(sub);
    this.layout();
    return this;
  }

  private layout(): void {
    const sub = this.sub.text;
    this.main.y = sub ? -12 : 0;
    this.sub.y = 20;
    this.sub.setVisible(!!sub);
    if (this.icon) {
      this.icon.setVisible(!!sub);
      const w = this.sub.width + 28;
      this.icon.setPosition(-w / 2 + 12, 20);
      this.sub.x = 14;
    } else this.sub.x = 0;
  }

  private draw(): void {
    const { w, h } = this;
    const r = Math.min(26, h / 2);
    const c = this.enabled ? this.color : 0x4a5168;
    const dark = Phaser.Display.Color.IntegerToColor(c).darken(22).color;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(dark, 1).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
    g.fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(-w / 2 + 5, -h / 2 + 4, w - 10, h * 0.42, { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
    g.lineStyle(2, 0xffffff, 0.22).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r);
    this.main.setAlpha(this.enabled ? 1 : 0.7);
  }
}

// ------------------------------------------------------------------ power buttons

export const POWER_COLOR: Record<PowerId, number> = { bomb: 0xff8a3d, shield: 0x3fb8ff, overdrive: 0xffd23f };
const POWER_KEY: Record<PowerId, string> = { bomb: 'J', shield: 'K', overdrive: 'L' };

/**
 * A round glass chip with the power's icon. While it recharges a dark sweep covers the icon and
 * the seconds count down; when it is ready the rim glows. A tap (or its key) fires it.
 */
export class PowerButton {
  readonly chip: HudChip;
  private box: Phaser.GameObjects.Container;
  private icon: Phaser.GameObjects.Image;
  private sweep: Phaser.GameObjects.Graphics;
  private rim: Phaser.GameObjects.Graphics;
  private secs: Phaser.GameObjects.Text;
  private key: Phaser.GameObjects.Text;
  private wasReady = true;
  private active = 0;
  static R = 50;

  constructor(private scene: Phaser.Scene, x: number, y: number, readonly id: PowerId, showKey: boolean, onTap: () => void) {
    const R = PowerButton.R;
    this.box = scene.add.container(0, 0);
    this.box.setData('chipWidth', R * 2 - 18);
    this.rim = scene.add.graphics();
    this.icon = scene.add.image(0, 0, powerArt(id)).setDisplaySize(R * 1.25, R * 1.25);
    this.sweep = scene.add.graphics();
    this.secs = txt(scene, 0, 2, '', { title: true, size: 30, strokeThickness: 5 });
    this.key = txt(scene, R * 0.62, R * 0.55, POWER_KEY[id], { title: true, size: 17, color: '#cfe6ff', strokeThickness: 4 }).setVisible(showKey);
    this.box.add([this.rim, this.icon, this.sweep, this.secs, this.key]);
    this.chip = hudChip(scene, x, y, { align: 'center', height: R * 2, minWidth: R * 2, items: [this.box], depth: UI_DEPTH });
    const hit = scene.add.zone(x, y, R * 2 + 12, R * 2 + 12).setScrollFactor(0).setDepth(UI_DEPTH + 1).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      void p;
      onTap();
      scene.tweens.add({ targets: this.chip, scale: 0.9, duration: 60, yoyo: true });
    });
    this.hit = hit;
  }
  readonly hit: Phaser.GameObjects.Zone;

  /** cd: seconds left, max: full cooldown, on: the effect is running (0–1 left). */
  update(cd: number, max: number, on: number, usable: boolean, time: number): void {
    const R = PowerButton.R - 6;
    const ready = cd <= 0;
    const s = this.sweep.clear();
    if (!ready) {
      const k = Math.min(1, cd / Math.max(0.01, max));
      s.fillStyle(0x060914, 0.72);
      s.slice(0, 0, R, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, false).fillPath();
      this.secs.setText(String(Math.ceil(cd)));
    } else this.secs.setText('');
    this.icon.setAlpha(ready && usable ? 1 : 0.55);
    const r = this.rim.clear();
    if (on > 0) {
      r.lineStyle(6, POWER_COLOR[this.id], 1).beginPath().arc(0, 0, R + 1, -Math.PI / 2, -Math.PI / 2 + on * Math.PI * 2).strokePath();
    } else if (ready) {
      r.lineStyle(4, POWER_COLOR[this.id], 0.55 + 0.35 * Math.sin(time * 5)).strokeCircle(0, 0, R + 1);
    }
    if (ready && !this.wasReady) {
      // a pop when it comes back
      this.scene.tweens.add({ targets: this.chip, scale: 1.18, duration: 130, yoyo: true, ease: 'Quad.easeOut' });
    }
    this.wasReady = ready;
    if (on > 0 && this.active <= 0) this.scene.tweens.add({ targets: this.icon, angle: { from: -12, to: 12 }, duration: 90, yoyo: true, repeat: 2 });
    this.active = on;
  }

  setVisible(on: boolean): void {
    this.chip.setVisible(on);
    this.hit.setVisible(on);
    if (on) this.hit.setInteractive(); else this.hit.disableInteractive();
  }
}

// ------------------------------------------------------------------ hull bar

/** The hull (green → red) with the shield (blue) over it, in a glass chip. */
export class HullBar {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private shown = -1;
  private ghost = 1;
  static W = 140;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', HullBar.W);
    this.label = txt(scene, 0, 0, '', { title: true, size: 20, strokeThickness: 4 });
    const box = scene.add.container(0, 0, [this.bar, this.label]);
    box.setData('chipWidth', HullBar.W);
    this.chip = hudChip(scene, x, y, { label: t('hull'), items: [box], height: 56, depth: UI_DEPTH });
  }

  update(hull: number, max: number, shield: number, shieldMax: number, dt: number, time: number): void {
    const W = HullBar.W, H = 18;
    const k = Math.max(0, hull / max);
    this.ghost = Math.max(k, this.ghost - dt * 0.6);
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.75).fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    if (this.ghost > k) g.fillStyle(0xffffff, 0.55).fillRoundedRect(-W / 2, -H / 2, W * this.ghost, H, 8);
    const low = k < 0.3;
    const col = low ? (Math.floor(time * 6) % 2 ? 0xff3b3b : 0xff7a5a) : k < 0.6 ? 0xffc23f : 0x4fe07a;
    if (k > 0) g.fillStyle(col, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(16, W * k), H, 8);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-W / 2 + 3, -H / 2 + 2, Math.max(10, W * k - 6), 5, 3);
    if (shieldMax > 0 && shield > 0) {
      const s = Math.min(1, shield / shieldMax);
      g.fillStyle(0x3fb8ff, 0.95).fillRoundedRect(-W / 2, H / 2 - 6, W * s, 6, 3);
    }
    const n = Math.ceil(hull);
    if (n !== this.shown) {
      if (n < this.shown) this.scene.tweens.add({ targets: this.chip, scale: 1.08, duration: 80, yoyo: true });
      this.shown = n;
      this.label.setText(String(Math.max(0, n)));
    }
  }
}

// ------------------------------------------------------------------ boss bar

export class BossBar {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private ghost = 1;
  static W = 230;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', BossBar.W);
    this.chip = hudChip(scene, x, y, { align: 'center', text: '', size: 18, color: '#ff9a8a', items: [this.bar], depth: UI_DEPTH });
    this.chip.setVisible(false);
  }

  show(name: string): void {
    this.chip.setText(name);
    this.chip.setVisible(true);
    this.ghost = 1;
    this.chip.setScale(0.4);
    this.chip.scene.tweens.add({ targets: this.chip, scale: 1, duration: 360, ease: 'Back.easeOut' });
  }

  hide(): void { this.chip.setVisible(false); }

  update(k: number, armoured: boolean, dt: number, time: number): void {
    const W = BossBar.W, H = 16;
    this.ghost = Math.max(k, this.ghost - dt * 0.4);
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.8).fillRoundedRect(-W / 2, -H / 2, W, H, 7);
    g.fillStyle(0xffffff, 0.5).fillRoundedRect(-W / 2, -H / 2, W * this.ghost, H, 7);
    if (k > 0) g.fillStyle(armoured ? 0x8fa0c0 : 0xff3b5c, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(14, W * k), H, 7);
    // the phase marks at two thirds and one third
    g.fillStyle(0x060914, 0.9).fillRect(-W / 2 + W / 3 - 1, -H / 2, 3, H).fillRect(-W / 2 + (2 * W) / 3 - 1, -H / 2, 3, H);
    if (armoured) {
      g.lineStyle(2, 0x9fe8ff, 0.5 + 0.4 * Math.sin(time * 6)).strokeRoundedRect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4, 9);
    }
  }
}

// ------------------------------------------------------------------ banners

/** A big title that pops in, holds and flies out (waves, sectors, the boss). */
export function banner(scene: Phaser.Scene, y: number, title: string, sub: string, o: { color?: string; hold?: number; size?: number } = {}): void {
  const { width } = scene.scale;
  const c = scene.add.container(width / 2, y).setScrollFactor(0).setDepth(9400);
  const tt = txt(scene, 0, 0, title, { title: true, size: o.size ?? 54, color: o.color ?? '#ffffff', strokeThickness: 9 });
  c.add(tt);
  if (sub) c.add(txt(scene, 0, tt.height / 2 + 26, sub, { size: 26, color: '#e6ecff', strokeThickness: 5, wrap: 640 }));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: (o.hold ?? 1.2) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
}

/** The boss warning: red bands sweep across with WARNING and the boss's name. */
export function bossWarning(scene: Phaser.Scene, name: string): void {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(9400);
  const tint = scene.add.rectangle(0, 0, width, height, 0xff1030, 0).setOrigin(0);
  scene.tweens.add({ targets: tint, fillAlpha: 0.16, duration: 260, yoyo: true, repeat: 4 });
  const y = height * 0.36;
  const band = scene.add.graphics();
  band.fillStyle(0x2a0008, 0.82).fillRect(0, y - 92, width, 184);
  band.fillStyle(0xff2a44, 1).fillRect(0, y - 92, width, 8).fillRect(0, y + 84, width, 8);
  // hazard stripes
  const stripes = scene.add.graphics();
  for (let i = -2; i < 26; i++) {
    stripes.fillStyle(i % 2 ? 0xff2a44 : 0x2a0008, 1);
    stripes.fillPoints([new Phaser.Math.Vector2(i * 40, y - 92), new Phaser.Math.Vector2(i * 40 + 20, y - 92), new Phaser.Math.Vector2(i * 40 + 4, y - 76), new Phaser.Math.Vector2(i * 40 - 16, y - 76)], true);
    stripes.fillPoints([new Phaser.Math.Vector2(i * 40, y + 76), new Phaser.Math.Vector2(i * 40 + 20, y + 76), new Phaser.Math.Vector2(i * 40 + 4, y + 92), new Phaser.Math.Vector2(i * 40 - 16, y + 92)], true);
  }
  const w = txt(scene, width / 2, y - 22, t('warning'), { title: true, size: 72, color: '#ff3b4f', strokeThickness: 10 });
  const n = txt(scene, width / 2, y + 44, name, { title: true, size: 34, color: '#ffe0e4', strokeThickness: 6 });
  root.add([tint, band, stripes, w, n]);
  band.setAlpha(0);
  scene.tweens.add({ targets: band, alpha: 1, duration: 200 });
  stripes.setX(-width);
  scene.tweens.add({ targets: stripes, x: 0, duration: 300, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: stripes, x: 40, duration: 400, repeat: -1, delay: 300 });
  w.setScale(2).setAlpha(0);
  scene.tweens.add({ targets: w, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: w, alpha: 0.35, duration: 220, yoyo: true, repeat: 5, delay: 300 });
  scene.tweens.add({ targets: root, alpha: 0, delay: 2600, duration: 400, onComplete: () => root.destroy() });
}
