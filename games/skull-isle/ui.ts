// Skull Isle: the game's own UI pieces in the modern style (glass, rounded buttons): the health
// bar, the power-up chips with their timer rings, the special meter, the touch action buttons,
// the boss bar and the banners. Every always-visible readout sits in a core HUD chip.
import Phaser from 'phaser';
import { txt, hudChip, HudChip } from '@core';
import { POWER_COLOR, TIMED_POWERS, type PowerId, type TimedPower } from './defs';
import { powerArt, HEART, SKULL } from './art';

export const UI_DEPTH = 9100;

/** A glass panel centred on (0, 0) of a container. */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x10202c, o.alpha ?? 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, Math.min(h * 0.4, 60), { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
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
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.7), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 });
    });
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

  setIcon(key: string | null, size = 26): this {
    this.icon?.destroy();
    this.icon = key ? this.scene.add.image(0, 0, key).setDisplaySize(size, size) : null;
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
    this.main.setScale(1);
    this.main.y = sub ? -12 : 0;
    this.sub.y = 20;
    this.sub.setVisible(!!sub);
    if (this.icon) {
      if (sub) {
        const w = this.sub.width + 30;
        this.icon.setPosition(-w / 2 + 12, 20);
        this.sub.x = 15;
      } else {
        const w = this.main.width + 34;
        this.icon.setPosition(-w / 2 + 13, 0);
        this.main.x = 17;
      }
    } else { this.sub.x = 0; this.main.x = 0; }
    if (this.main.width > this.w - 20) this.main.setScale((this.w - 20) / this.main.width);
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

// ------------------------------------------------------------------ health

/** Health: a heart, a bar (green → red, a white ghost of what was lost) and the number. */
export class HpBar {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private heart: Phaser.GameObjects.Image;
  private shown = -1;
  private ghost = 1;
  static W = 190;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.heart = scene.add.image(0, 0, HEART).setDisplaySize(38, 38);
    this.heart.setData('chipWidth', 34);
    this.bar = scene.add.graphics();
    this.label = txt(scene, 0, 0, '', { title: true, size: 20, strokeThickness: 4 });
    const box = scene.add.container(0, 0, [this.bar, this.label]);
    box.setData('chipWidth', HpBar.W);
    this.chip = hudChip(scene, x, y, { items: [this.heart, box], height: 56, depth: UI_DEPTH });
  }

  update(hp: number, max: number, dt: number, time: number): void {
    const W = HpBar.W, H = 22;
    const k = Math.max(0, hp / max);
    this.ghost = Math.max(k, this.ghost - dt * 0.6);
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.75).fillRoundedRect(-W / 2, -H / 2, W, H, 9);
    if (this.ghost > k) g.fillStyle(0xffffff, 0.55).fillRoundedRect(-W / 2, -H / 2, W * this.ghost, H, 9);
    const low = k < 0.3;
    const col = low ? (Math.floor(time * 6) % 2 ? 0xff3b3b : 0xff7a5a) : k < 0.6 ? 0xffc23f : 0x4fe07a;
    if (k > 0) g.fillStyle(col, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(18, W * k), H, 9);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-W / 2 + 3, -H / 2 + 2, Math.max(10, W * k - 6), 6, 3);
    const n = Math.ceil(hp);
    const label = `${Math.max(0, n)}/${Math.round(max)}`;
    if (n !== this.shown || this.label.text !== label) {
      if (n < this.shown) this.scene.tweens.add({ targets: this.chip, scale: 1.07, duration: 70, yoyo: true });
      this.shown = n;
      this.label.setText(label);
    }
    this.heart.setScale((38 / this.heart.width) * (low ? 1 + Math.max(0, Math.sin(time * 9)) * 0.2 : 1));
  }
}

// ------------------------------------------------------------------ power-ups

const RING_R = 25;

/** The power-ups in effect: one chip each, its icon inside a ring that empties as time runs out. */
export class PowerChips {
  private chips = new Map<TimedPower, { chip: HudChip; ring: Phaser.GameObjects.Graphics; max: number }>();

  constructor(private scene: Phaser.Scene, private x: number, private y: number) {}

  update(powers: Record<TimedPower, number>, extra: { shieldHits: number }, time: number): void {
    let x = this.x;
    for (const id of TIMED_POWERS) {
      const left = powers[id];
      let c = this.chips.get(id);
      if (left <= 0) {
        if (c) { c.chip.destroy(); this.chips.delete(id); }
        continue;
      }
      if (!c) {
        const ring = this.scene.add.graphics();
        const img = this.scene.add.image(0, 0, powerArt(id)).setDisplaySize(44, 44);
        const box = this.scene.add.container(0, 0, [ring, img]);
        box.setData('chipWidth', RING_R * 2 + 4);
        const chip = hudChip(this.scene, x, this.y, { items: [box], height: 60, depth: UI_DEPTH, text: '', size: 20 });
        chip.setScale(0.3);
        this.scene.tweens.add({ targets: chip, scale: 1, duration: 260, ease: 'Back.easeOut' });
        c = { chip, ring, max: left };
        this.chips.set(id, c);
      }
      c.max = Math.max(c.max, left);
      const k = left / c.max;
      const g = c.ring.clear();
      g.lineStyle(5, 0x000000, 0.45).strokeCircle(0, 0, RING_R);
      const col = POWER_COLOR[id];
      const blink = left < 2.5 && Math.floor(time * 6) % 2 === 0;
      g.lineStyle(5, blink ? 0xffffff : col, 1);
      g.beginPath();
      g.arc(0, 0, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
      g.strokePath();
      c.chip.setText(id === 'shield' ? `×${extra.shieldHits}` : String(Math.ceil(left)));
      c.chip.setAnchor(x, this.y, 'left');
      x = c.chip.right + 8;
    }
  }

  /** Where the chip of a power is (the pickup's icon flies there), or the row's next slot. */
  slot(id: PowerId): { x: number; y: number } {
    const c = this.chips.get(id as TimedPower);
    if (c) return { x: c.chip.x + c.chip.chipWidth / 2, y: this.y };
    let x = this.x;
    for (const v of this.chips.values()) x = Math.max(x, v.chip.right + 8);
    return { x: x + 40, y: this.y };
  }
}

// ------------------------------------------------------------------ the boss bar

export class BossBar {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private ghost = 1;
  static W = 300;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', BossBar.W);
    this.chip = hudChip(scene, x, y, { align: 'center', icon: SKULL, iconSize: 34, text: '', size: 18, color: '#ffb0a0', items: [this.bar], depth: UI_DEPTH });
    this.chip.setVisible(false);
  }

  show(name: string): void {
    this.chip.setText(name);
    if (this.chip.visible) return;
    this.chip.setVisible(true);
    this.ghost = 1;
    this.chip.setScale(0.4);
    this.chip.scene.tweens.add({ targets: this.chip, scale: 1, duration: 360, ease: 'Back.easeOut' });
  }

  hide(): void { this.chip.setVisible(false); }

  /** k: health 0–1; `shielded` greys it (the Kraken under water, the captain on his ship). */
  update(k: number, shielded: boolean, rage: boolean, dt: number, time: number): void {
    const W = BossBar.W, H = 16;
    this.ghost = Math.max(k, this.ghost - dt * 0.4);
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.8).fillRoundedRect(-W / 2, -H / 2, W, H, 7);
    g.fillStyle(0xffffff, 0.5).fillRoundedRect(-W / 2, -H / 2, W * this.ghost, H, 7);
    if (k > 0) g.fillStyle(shielded ? 0x7a8aa0 : rage ? 0xff2f6a : 0xff7a3a, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(14, W * k), H, 7);
    if (rage) g.lineStyle(2, 0xff5a8a, 0.5 + 0.4 * Math.sin(time * 8)).strokeRoundedRect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4, 9);
  }
}

// ------------------------------------------------------------------ touch buttons

export interface ActionButton {
  x: number; y: number; r: number;
  root: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text | null;
  down: boolean;
  pressed: boolean;
}

/** A round action button drawn by the game (the core's A/B circles do the hit testing for ATTACK and DODGE). */
export function actionButton(scene: Phaser.Scene, x: number, y: number, r: number, label: string, own: boolean, o: { badge?: boolean; size?: number } = {}): ActionButton {
  const root = scene.add.container(x, y).setScrollFactor(0).setDepth(9520);
  const g = scene.add.graphics();
  const lab = txt(scene, 0, 0, label, { title: true, size: o.size ?? 20, strokeThickness: 4 });
  if (lab.width > r * 1.8) lab.setScale((r * 1.8) / lab.width);
  root.add([g, lab]);
  let badge: Phaser.GameObjects.Text | null = null;
  if (o.badge) {
    badge = txt(scene, r * 0.72, -r * 0.72, '', { title: true, size: 22, color: '#1a0c08', strokeThickness: 0, shadow: false });
    root.add(badge);
  }
  const b: ActionButton = { x, y, r, root, g, label: lab, badge, down: false, pressed: false };
  if (own) {
    const zone = scene.add.zone(x, y, r * 2.3, r * 2.3).setScrollFactor(0).setDepth(9519).setInteractive(new Phaser.Geom.Circle(r * 1.15, r * 1.15, r * 1.15), Phaser.Geom.Circle.Contains);
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev?.stopPropagation?.(); b.down = true; b.pressed = true; });
    zone.on('pointerup', () => { b.down = false; });
    zone.on('pointerout', () => { b.down = false; });
  }
  return b;
}

/** Draws a button: its colour, pressed state, an optional ring (0–1 per segment) and readiness. */
export function drawButton(b: ActionButton, color: number, o: { held?: boolean; ring?: number[]; ready?: boolean; dim?: boolean; time?: number } = {}): void {
  const g = b.g.clear();
  const r = b.r;
  const a = o.dim ? 0.28 : o.held ? 0.85 : 0.55;
  g.fillStyle(0x000000, 0.25).fillCircle(0, 5, r);
  g.fillStyle(color, a).fillCircle(0, 0, r);
  g.fillStyle(0xffffff, o.dim ? 0.04 : 0.14).fillCircle(0, -r * 0.3, r * 0.62);
  g.lineStyle(4, 0xffffff, o.dim ? 0.25 : 0.65).strokeCircle(0, 0, r);
  if (o.ring?.length) {
    const n = o.ring.length, gap = n > 1 ? 0.18 : 0;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 + gap / 2, span = Math.PI * 2 / n - gap;
      g.lineStyle(7, 0x000000, 0.5);
      g.beginPath(); g.arc(0, 0, r + 9, a0, a0 + span, false); g.strokePath();
      if (o.ring[i] > 0) {
        g.lineStyle(7, o.ring[i] >= 1 ? 0xffd23f : 0xffffff, o.ring[i] >= 1 ? 1 : 0.8);
        g.beginPath(); g.arc(0, 0, r + 9, a0, a0 + span * Math.min(1, o.ring[i]), false); g.strokePath();
      }
    }
  }
  if (o.ready) {
    const k = 0.5 + Math.sin((o.time ?? 0) * 8) * 0.5;
    g.lineStyle(4, 0xffd23f, 0.4 + k * 0.5).strokeCircle(0, 0, r + 17 + k * 3);
  }
  b.label.setAlpha(o.dim ? 0.55 : 1);
  if (b.badge) b.badge.setAlpha(o.dim ? 0.6 : 1);
}

// ------------------------------------------------------------------ banners

/** A big title that pops in, holds and flies out. */
export function banner(scene: Phaser.Scene, y: number, title: string, sub: string, o: { color?: string; hold?: number; size?: number } = {}): Phaser.GameObjects.Container {
  const { width } = scene.scale;
  const c = scene.add.container(width / 2, y).setScrollFactor(0).setDepth(9400);
  const tt = txt(scene, 0, 0, title, { title: true, size: o.size ?? 54, color: o.color ?? '#ffffff', strokeThickness: 9, wrap: 660 });
  c.add(tt);
  if (sub) c.add(txt(scene, 0, tt.height / 2 + 26, sub, { size: 26, color: '#fff6e6', strokeThickness: 5, wrap: 640 }));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: (o.hold ?? 1.2) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  return c;
}

/** The boss's entrance: dark bands sweep in with a skull, the boss's name and what to do. */
export function bossIntro(scene: Phaser.Scene, name: string, sub: string): void {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(9400);
  const tint = scene.add.rectangle(0, 0, width, height, 0x200010, 0).setOrigin(0);
  scene.tweens.add({ targets: tint, fillAlpha: 0.3, duration: 300, yoyo: true, hold: 1600 });
  const y = height * 0.36;
  const band = scene.add.graphics();
  band.fillStyle(0x12060a, 0.88).fillRect(0, y - 100, width, 200);
  band.fillStyle(0xff6a3a, 1).fillRect(0, y - 100, width, 6).fillRect(0, y + 94, width, 6);
  const skull = scene.add.image(width / 2, y - 58, SKULL).setDisplaySize(72, 72);
  const n = txt(scene, width / 2, y + 10, name, { title: true, size: 52, color: '#ffb04a', strokeThickness: 10, wrap: 680 });
  const s = txt(scene, width / 2, y + 66, sub, { size: 26, color: '#ffe6d8', strokeThickness: 5, wrap: 660 });
  root.add([tint, band, skull, n, s]);
  band.setAlpha(0);
  scene.tweens.add({ targets: band, alpha: 1, duration: 220 });
  n.setScale(2.2).setAlpha(0);
  scene.tweens.add({ targets: n, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut', delay: 120 });
  skull.setScale(0).setAngle(-30);
  scene.tweens.add({ targets: skull, displayWidth: 72, displayHeight: 72, angle: 0, duration: 380, ease: 'Back.easeOut', delay: 60 });
  s.setAlpha(0);
  scene.tweens.add({ targets: s, alpha: 1, duration: 300, delay: 420 });
  scene.tweens.add({ targets: root, alpha: 0, delay: 2600, duration: 420, onComplete: () => root.destroy() });
}

