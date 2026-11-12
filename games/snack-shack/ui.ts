// Snack Shack: the 2D parts drawn over the 3D diner: order bubbles with patience bars, glass
// panels, stars and the upgrade cards.
import Phaser from 'phaser';
import { txt } from '@core';
import type { Customer } from './sim';
import { itemThumb } from './thumbs';

export const UI_DEPTH = 8000;

/** A frosted glass panel (the modern style's look). */
export function glass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 26, tint = 0x101828, alpha = 0.82): Phaser.GameObjects.Graphics {
  g.fillStyle(0x000000, 0.28).fillRoundedRect(x, y + 8, w, h, r);
  g.fillStyle(tint, alpha).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.08).fillRoundedRect(x + 6, y + 5, w - 12, Math.min(h * 0.4, 70), { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
  g.lineStyle(2, 0xffffff, 0.3).strokeRoundedRect(x, y, w, h, r);
  return g;
}

export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, filled: boolean): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.46 : r;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
  }
  g.fillStyle(0x000000, 0.3).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y + 4)), true);
  g.fillStyle(filled ? 0xffd23f : 0x3a4157, 1).fillPoints(pts, true);
  g.lineStyle(3, filled ? 0xfff2b0 : 0x5b6480, 1).strokePoints(pts, true, true);
}

const ICON = 44;

/**
 * A customer's order: item icons in a white bubble (two per row), ticks on what was served, and a
 * patience bar that runs green → amber → red and shakes when it is nearly empty.
 */
export class Bubble {
  readonly box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];
  private ticks: Phaser.GameObjects.Graphics[] = [];
  private done: boolean[] = [];
  readonly w: number;
  readonly h: number;
  private shown = false;

  constructor(private scene: Phaser.Scene, c: Customer) {
    const n = c.order.length;
    const cols = n === 1 ? 1 : 2;
    const rows = Math.ceil(n / cols);
    this.w = cols * (ICON + 4) + 20;
    this.h = rows * (ICON + 4) + 30;
    this.box = scene.add.container(0, 0).setDepth(UI_DEPTH - 50).setScale(0);
    this.bg = scene.add.graphics();
    const { w, h } = this;
    this.bg.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2, -h + 4, w, h, 16);
    this.bg.fillStyle(0xffffff, 0.96).fillRoundedRect(-w / 2, -h, w, h, 16);
    this.bg.fillTriangle(-9, -1, 9, -1, 0, 12);
    this.box.add(this.bg);
    c.order.forEach((o, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = -((cols - 1) * (ICON + 4)) / 2 + col * (ICON + 4);
      const y = -h + 10 + ICON / 2 + row * (ICON + 4);
      const img = scene.add.image(x, y, itemThumb(o.item)).setDisplaySize(ICON + 6, ICON + 6);
      const tick = scene.add.graphics({ x: x + 13, y: y + 12 });
      tick.fillStyle(0x2fae5a, 1).fillCircle(0, 0, 11).lineStyle(4, 0xffffff, 1);
      tick.beginPath(); tick.moveTo(-5, 0); tick.lineTo(-1, 4); tick.lineTo(6, -4); tick.strokePath();
      tick.setVisible(false);
      this.icons.push(img);
      this.ticks.push(tick);
      this.done.push(false);
      this.box.add([img, tick]);
    });
    this.bar = scene.add.graphics();
    this.box.add(this.bar);
  }

  /** Pops the bubble in (when the customer sits down). */
  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.scene.tweens.add({ targets: this.box, scale: 1, duration: 320, ease: 'Back.easeOut' });
  }

  update(c: Customer, x: number, y: number, time: number): void {
    const ratio = c.max ? Math.max(0, c.patience / c.max) : 1;
    const low = ratio < 0.3 && c.phase === 'seated';
    this.box.setPosition(x + (low ? Math.sin(time * 40) * 2.5 : 0), y);
    c.order.forEach((o, i) => {
      if (o.done && !this.done[i]) {
        this.done[i] = true;
        this.ticks[i].setVisible(true).setScale(0);
        this.scene.tweens.add({ targets: this.ticks[i], scale: 1, duration: 260, ease: 'Back.easeOut' });
        this.scene.tweens.add({ targets: this.icons[i], alpha: 0.4, duration: 200 });
      }
    });
    const w = this.w - 22, y0 = -16;
    this.bar.clear();
    this.bar.fillStyle(0xd9dde6, 1).fillRoundedRect(-w / 2, y0, w, 9, 4);
    const col = ratio > 0.55 ? 0x2fae5a : ratio > 0.3 ? 0xf2a33a : 0xe2412f;
    if (ratio > 0) this.bar.fillStyle(col, 1).fillRoundedRect(-w / 2, y0, Math.max(9, w * ratio), 9, 4);
  }

  /** Floats away (served or angry). */
  leave(happy: boolean): void {
    this.scene.tweens.add({
      targets: this.box, y: this.box.y - 40, alpha: 0, scale: happy ? 1.2 : 0.8, duration: 380, ease: 'Quad.easeIn',
      onComplete: () => this.box.destroy(),
    });
  }

  contains(px: number, py: number): boolean {
    const s = this.box.scale || 1;
    return px >= this.box.x - (this.w / 2) * s && px <= this.box.x + (this.w / 2) * s && py >= this.box.y - this.h * s && py <= this.box.y + 12;
  }
}

/** A text label on a station (key number, lock), as a small glass chip. */
export function chipLabel(scene: Phaser.Scene, x: number, y: number, s: string, o: { size?: number; color?: string; icon?: string } = {}): Phaser.GameObjects.Container {
  const t = txt(scene, 0, 0, s, { size: o.size ?? 20, color: o.color ?? '#ffffff', strokeThickness: 0, title: true });
  const iconW = o.icon ? 24 : 0;
  const w = Math.max(34, t.width + 18 + iconW), h = (o.size ?? 20) + 14;
  const g = scene.add.graphics();
  g.fillStyle(0x0b1020, 0.72).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  t.setX(iconW / 2);
  const c = scene.add.container(x, y, [g, t]).setDepth(UI_DEPTH - 40);
  if (o.icon) c.add(scene.add.image(-w / 2 + 18, 0, o.icon).setDisplaySize(20, 20));
  return c;
}
