// Delivery Dash: the 2D pieces over the 3D town: canvas-made icons (one per cargo, coffee, coins,
// house, VIP crown), glass panels and rounded buttons in the core's modern look, banners, the
// order panel (one HUD chip per order: cargo, where to, clock, condition bar, pay), the minimap
// chip and the badges that float over the shops and houses with a job (pinned to the screen edge
// when they are off screen).
import Phaser from 'phaser';
import { txt, hudChip, HudChip, HUD_MARGIN, HUD_CHIP_H, t } from '@core';
import { SHOP_COLOR, SHOP_CSS, FRAGILE, VIP_COLOR, S, clamp, type Cargo } from './defs';
import type { Sim, Order } from './sim';
import type { View } from './view';
import type { Bay } from './town';
import { money } from './money';

export const UI_DEPTH = 9300;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  scene.textures.addCanvas(key, cv);
}

/** Draws an icon in the current fill colour, centred on (x, y), `s` = its size. */
export function drawIcon(g: CanvasRenderingContext2D, icon: Cargo | 'coffee' | 'house' | 'vip' | 'shop' | 'clock' | 'coin', x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  const fill = g.fillStyle;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  switch (icon) {
    case 'pizza':
      // a slice: crust arc on top, point down, pepperoni
      g.moveTo(-38, -26); g.quadraticCurveTo(0, -48, 38, -26); g.lineTo(0, 44); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (const [px, py] of [[-12, -14], [12, -12], [0, 12]]) { g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      break;
    case 'flowers':
      for (const [px, py] of [[-18, -14], [18, -14], [0, -30]]) {
        for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; g.beginPath(); g.arc(px + Math.cos(a) * 9, py + Math.sin(a) * 9, 7, 0, Math.PI * 2); g.fill(); }
      }
      g.beginPath(); g.moveTo(-26, 4); g.lineTo(26, 4); g.lineTo(12, 44); g.lineTo(-12, 44); g.closePath(); g.fill();
      break;
    case 'cake':
      g.roundRect(-36, -6, 72, 44, 8); g.fill();
      g.beginPath(); g.roundRect(-26, -30, 52, 26, 6); g.fill();
      g.beginPath(); g.roundRect(-3, -48, 6, 16, 2); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(-36, 8, 72, 5);
      g.globalCompositeOperation = 'source-over';
      break;
    case 'parcel':
      g.roundRect(-38, -30, 76, 66, 6); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(-5, -30, 10, 66); g.fillRect(-38, -12, 76, 6);
      g.globalCompositeOperation = 'source-over';
      break;
    case 'burger':
      g.moveTo(-38, -6); g.quadraticCurveTo(-36, -42, 0, -42); g.quadraticCurveTo(36, -42, 38, -6); g.closePath(); g.fill();
      g.beginPath(); g.roundRect(-40, 2, 80, 12, 6); g.fill();
      g.beginPath(); g.roundRect(-38, 22, 76, 18, 8); g.fill();
      break;
    case 'icecream':
      g.arc(0, -16, 26, Math.PI, 0); g.lineTo(26, -10); g.lineTo(-26, -10); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-22, -6); g.lineTo(22, -6); g.lineTo(0, 46); g.closePath(); g.fill();
      break;
    case 'coffee':
      g.moveTo(-28, -24); g.lineTo(28, -24); g.lineTo(20, 40); g.lineTo(-20, 40); g.closePath(); g.fill();
      g.beginPath(); g.roundRect(-32, -36, 64, 12, 5); g.fill();
      g.strokeStyle = fill; g.lineWidth = 7;
      for (const px of [-10, 10]) { g.beginPath(); g.moveTo(px, -44); g.quadraticCurveTo(px - 8, -52, px, -60); g.stroke(); }
      break;
    case 'house':
      g.moveTo(0, -42); g.lineTo(42, -4); g.lineTo(30, -4); g.lineTo(30, 38); g.lineTo(-30, 38); g.lineTo(-30, -4); g.lineTo(-42, -4); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(-9, 12, 18, 26);
      g.globalCompositeOperation = 'source-over';
      break;
    case 'shop':
      g.roundRect(-36, -10, 72, 48, 6); g.fill();
      g.beginPath(); g.moveTo(-42, -12); g.lineTo(-34, -40); g.lineTo(34, -40); g.lineTo(42, -12); g.closePath(); g.fill();
      break;
    case 'vip':
      g.moveTo(-40, 30); g.lineTo(-44, -26); g.lineTo(-18, 0); g.lineTo(0, -36); g.lineTo(18, 0); g.lineTo(44, -26); g.lineTo(40, 30); g.closePath(); g.fill();
      break;
    case 'clock':
      g.strokeStyle = fill; g.lineWidth = 11;
      g.arc(0, 0, 38, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -24); g.moveTo(0, 0); g.lineTo(16, 10); g.stroke();
      break;
    case 'coin':
      g.arc(0, 0, 42, 0, Math.PI * 2); g.fill();
      break;
  }
  g.restore();
}

const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const dark = (c: number, k = 18): string => css(Phaser.Display.Color.IntegerToColor(c).darken(k).color);

export const badgeKey = (c: Cargo): string => 'dd-badge-' + c;

export function makeArt(scene: Phaser.Scene): void {
  const disc = (key: string, color: number, icon: Parameters<typeof drawIcon>[1], ring = '#ffffff') => canvasTexture(scene, key, 96, 96, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.arc(48, 52, 42, 0, Math.PI * 2); g.fill();
    g.fillStyle = ring;
    g.beginPath(); g.arc(48, 48, 43, 0, Math.PI * 2); g.fill();
    const grd = g.createLinearGradient(0, 8, 0, 88);
    grd.addColorStop(0, css(color));
    grd.addColorStop(1, dark(color));
    g.fillStyle = grd;
    g.beginPath(); g.arc(48, 48, 37, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    drawIcon(g, icon, 48, 49, 50);
  });
  for (const c of Object.keys(SHOP_COLOR) as Cargo[]) disc(badgeKey(c), SHOP_COLOR[c], c);
  disc('dd-coffee', 0x8a5a2a, 'coffee');
  disc('dd-house', 0x2f9f5a, 'house');
  disc('dd-vip', 0xd99a1a, 'vip', '#fff3b0');
  canvasTexture(scene, 'dd-coin', 64, 64, (g) => {
    const grd = g.createRadialGradient(26, 24, 4, 32, 32, 30);
    grd.addColorStop(0, '#fff6c0'); grd.addColorStop(0.6, '#ffd23f'); grd.addColorStop(1, '#d99a1a');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#b07a10'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2); g.stroke();
    // a raised star in the middle: the coin carries no currency sign (TR shows ₺, EN $)
    g.fillStyle = '#b07a10';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6 : 13; g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  for (const [k, ic] of [['dd-clock', 'clock'], ['dd-shop', 'shop'], ['dd-home', 'house'], ['dd-cup', 'coffee']] as const) canvasTexture(scene, k, 64, 64, (g) => { g.fillStyle = '#ffffff'; drawIcon(g, ic, 32, 34, 56); });
  canvasTexture(scene, 'dd-hand', 96, 96, (g) => {
    g.fillStyle = '#ffffff'; g.strokeStyle = '#1a2340'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(40, 8); g.quadraticCurveTo(48, 4, 52, 12); g.lineTo(52, 44); g.quadraticCurveTo(64, 38, 70, 46); g.quadraticCurveTo(80, 44, 82, 54);
    g.lineTo(82, 72); g.quadraticCurveTo(80, 90, 60, 90); g.lineTo(46, 90); g.quadraticCurveTo(32, 88, 26, 72); g.lineTo(18, 56);
    g.quadraticCurveTo(16, 46, 28, 50); g.lineTo(36, 58); g.lineTo(36, 14); g.quadraticCurveTo(36, 8, 40, 8);
    g.closePath(); g.fill(); g.stroke();
  });
  canvasTexture(scene, 'dd-speed', 8, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(2, 0, 4, 64);
  });
}

// ------------------------------------------------------------------ widgets

/** A frosted panel (the core's modern glass look). */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x14204a, o.alpha ?? 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, o.rim ?? 0xffffff, o.rim ? 0.9 : 0.18).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** A rounded, tappable button with a main label and an optional second line. */
export class Pill extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  readonly main: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image | null = null;
  enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, private color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.68), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      if (this.enabled) this.onTap();
    });
    this.draw();
    scene.add.existing(this);
  }

  setIcon(key: string, size = 40): this {
    this.icon?.destroy();
    this.icon = this.scene.add.image(-this.w / 2 + 16 + size / 2, 0, key).setDisplaySize(size, size);
    this.add(this.icon);
    return this;
  }

  setColor(c: number): this { if (c !== this.color) { this.color = c; this.draw(); } return this; }
  setEnabled(on: boolean): this { if (on !== this.enabled) { this.enabled = on; this.draw(); } return this; }

  setLabels(main: string, sub = ''): this {
    this.main.setText(main);
    this.sub.setText(sub).setVisible(!!sub);
    this.main.y = sub ? -13 : 0;
    this.sub.y = 20;
    const shift = this.icon ? 22 : 0;
    this.main.x = this.sub.x = shift;
    const room = this.w - 24 - shift * 2;
    for (const tx of [this.main, this.sub]) tx.setScale(tx.width > room ? room / tx.width : 1);
    return this;
  }

  private draw(): void {
    const { w, h } = this;
    const r = Math.min(26, h / 2);
    const c = this.enabled ? this.color : 0x4a5168;
    const dk = Phaser.Display.Color.IntegerToColor(c).darken(22).color;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(dk, 1).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
    g.fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(-w / 2 + 5, -h / 2 + 4, w - 10, h * 0.42, { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
    g.lineStyle(2, 0xffffff, 0.22).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r);
    this.main.setAlpha(this.enabled ? 1 : 0.7);
  }
}

/** A big word that pops in and floats away. */
export function banner(scene: Phaser.Scene, x: number, y: number, s: string, o: { color?: string; size?: number; hold?: number; sub?: string; subColor?: string } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 50);
  const main = txt(scene, 0, 0, s, { title: true, size: o.size ?? 54, color: o.color ?? '#ffd23f', strokeThickness: 10, wrap: 660 });
  c.add(main);
  if (o.sub) c.add(txt(scene, 0, main.height / 2 + 8, o.sub, { title: true, size: 28, color: o.subColor ?? '#ffffff', strokeThickness: 7, wrap: 640 }).setOrigin(0.5, 0));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 50, alpha: 0, delay: 220 + (o.hold ?? 0.8) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  return c;
}

export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ the order panel

interface OrderRow { chip: HudChip; bar: Phaser.GameObjects.Graphics; pay: Phaser.GameObjects.Text; dest: Phaser.GameObjects.Image; state: string; y: number; lastCond: number; lastSec: number }

/** One chip per active order, stacked down the left side under the HUD. */
export class OrderPanel {
  private rows = new Map<number, OrderRow>();
  constructor(private scene: Phaser.Scene, private x: number, private y0: number) {}

  /** Row height. */
  static readonly ROW = 58;

  sync(sim: Sim): void {
    const list = sim.orders.filter((o) => o.state === 'offered' || o.state === 'carried');
    // carried first, then offers; VIP first in each
    list.sort((a, b) => (a.state === b.state ? (b.vip ? 1 : 0) - (a.vip ? 1 : 0) || a.id - b.id : a.state === 'carried' ? -1 : 1));
    for (const [id, row] of this.rows) {
      if (!list.some((o) => o.id === id)) {
        this.rows.delete(id);
        this.scene.tweens.add({ targets: row.chip, scale: 0.6, alpha: 0, duration: 240, ease: 'Quad.easeIn', onComplete: () => row.chip.destroy() });
      }
    }
    list.forEach((o, i) => {
      let row = this.rows.get(o.id);
      const y = this.y0 + i * OrderPanel.ROW;
      if (!row) { row = this.make(o, y); this.rows.set(o.id, row); }
      if (row.y !== y) { row.y = y; this.scene.tweens.add({ targets: row.chip, y, duration: 220, ease: 'Quad.easeOut' }); }
      this.update(row, o);
    });
  }

  private make(o: Order, y: number): OrderRow {
    const sc = this.scene;
    const bar = sc.add.graphics();
    bar.setData('chipWidth', 0);
    const dest = sc.add.image(0, 0, 'dd-shop').setDisplaySize(26, 26);
    dest.setData('chipWidth', 26);
    const pay = txt(sc, 0, 0, '', { title: true, size: 22, color: '#ffe27a', strokeThickness: 0, shadow: false });
    const chip = hudChip(sc, this.x, y, { icon: o.vip ? 'dd-vip' : badgeKey(o.cargo), iconSize: 40, text: '0:00', size: 24, minWidth: 210, height: 50, depth: UI_DEPTH - 5, items: [dest, bar, pay] });
    // the chip grows from its left edge, which stays HUD_MARGIN inside the frame
    chip.setAlpha(0).setScale(0.6);
    sc.tweens.add({ targets: chip, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    return { chip, bar, pay, dest, state: '', y, lastCond: -1, lastSec: -1 };
  }

  private update(row: OrderRow, o: Order): void {
    const st = o.state + (o.late ? 'L' : '');
    const fragile = FRAGILE[o.cargo] && o.state === 'carried';
    let relayout = false;
    if (row.state !== st) {
      row.state = st;
      row.dest.setTexture(o.state === 'carried' ? 'dd-home' : 'dd-shop').setTint(o.state === 'carried' ? 0x9fffb0 : 0xffffff);
      row.bar.setData('chipWidth', fragile ? 64 : 0);
      if (o.state === 'carried') this.scene.tweens.add({ targets: row.chip, scale: { from: 1.15, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      relayout = true;
    }
    const sec = Math.ceil(o.left);
    if (sec !== row.lastSec) {
      row.lastSec = sec;
      row.chip.setText(o.late ? t('late') : mmss(o.left));
      const hurry = o.left < 10 || o.late;
      row.chip.setTextColor(hurry ? '#ff8a7a' : o.left < 20 ? '#ffd23f' : '#ffffff');
      if (hurry && !o.late) this.scene.tweens.add({ targets: row.chip.text, scale: { from: 1.25, to: 1 }, duration: 200 });
    }
    const payStr = money(o.base);
    if (row.pay.text !== payStr) { row.pay.setText(payStr); row.pay.setData('chipWidth', row.pay.width + 4); relayout = true; }
    if (fragile && Math.abs(o.cond - row.lastCond) > 0.004) {
      const g = row.bar.clear();
      const k = clamp(o.cond, 0, 1);
      const col = k > 0.6 ? 0x5fe07a : k > 0.3 ? 0xffd23f : 0xff5a4f;
      g.fillStyle(0x000000, 0.35).fillRoundedRect(-30, -7, 60, 14, 7);
      g.fillStyle(col, 1).fillRoundedRect(-28, -5, Math.max(4, 56 * k), 10, 5);
      if (row.lastCond >= 0 && o.cond < row.lastCond - 0.02) this.scene.tweens.add({ targets: row.chip, x: { from: this.x + 10, to: this.x }, duration: 160, ease: 'Bounce.easeOut' });
      row.lastCond = o.cond;
    } else if (!fragile && row.lastCond !== -1) { row.bar.clear(); row.lastCond = -1; }
    if (relayout) row.chip.setItems([row.dest, row.bar, row.pay]);
  }

  /** Screen point of an order's chip (coins fly there). */
  pos(id: number): { x: number; y: number } | null {
    const r = this.rows.get(id);
    return r ? { x: r.chip.x + 30, y: r.chip.y } : null;
  }

  get count(): number { return this.rows.size; }
}

// ------------------------------------------------------------------ the minimap

/** A small north-up map of the district in a chip: streets, jobs, the route and the van. */
export class MiniMap {
  readonly chip: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private base: Phaser.GameObjects.Graphics;
  private k: number;
  private ox: number;
  private oy: number;
  private size: number;

  constructor(private scene: Phaser.Scene, sim: Sim, x: number, y: number, size = 156) {
    this.size = size;
    const tw = sim.town;
    this.k = (size - 12) / Math.max(tw.w * S, tw.h * S);
    this.ox = -tw.w * S * this.k / 2;
    this.oy = -tw.h * S * this.k / 2;
    this.base = scene.add.graphics();
    this.g = scene.add.graphics();
    // a square glass chip (the core's chips are pills; a map wants corners)
    const panel = glass(scene, size, size, { r: 22, color: 0x101a30, alpha: 0.55 });
    this.chip = scene.add.container(x - size / 2, y, [panel, this.base, this.g]).setScrollFactor(0, 0, true).setDepth(UI_DEPTH - 5);
    // streets
    const b = this.base;
    for (const c of tw.cells) {
      const px = this.ox + c.c * S * this.k, py = this.oy + c.r * S * this.k, w = S * this.k + 0.5;
      if (c.road) b.fillStyle(c.works && sim.shift.works ? 0xff7a3a : c.level ? 0xd8d0c0 : 0xf2efe8, c.works && sim.shift.works ? 0.8 : 0.9).fillRect(px, py, w, w);
      else if (c.lot?.kind === 'water') b.fillStyle(0x6ab8e8, 0.9).fillRect(px, py, w, w);
      else if (c.level) b.fillStyle(0xa89878, 0.5).fillRect(px, py, w, w);
    }
  }

  private mx(x: number): number { return this.ox + x * this.k; }

  sync(sim: Sim, route: number[]): void {
    const g = this.g.clear();
    // jobs
    for (const o of sim.orders) {
      if (o.state !== 'offered' && o.state !== 'carried') continue;
      const b: Bay = o.state === 'offered' ? o.shop : o.house;
      const c = o.vip ? VIP_COLOR : SHOP_COLOR[o.cargo];
      g.fillStyle(0x000000, 0.5).fillCircle(this.mx(b.x), this.mx(b.z) + (this.oy - this.ox), 6);
      g.fillStyle(c, 1).fillCircle(this.mx(b.x), this.mx(b.z) + (this.oy - this.ox), o.state === 'carried' ? 5 : 4);
      if (o.state === 'carried') g.lineStyle(2, 0xffffff, 1).strokeCircle(this.mx(b.x), this.mx(b.z) + (this.oy - this.ox), 6);
    }
    for (const c of sim.coffees) if (c.ready) g.fillStyle(0x8a5a2a, 1).fillCircle(this.mx(c.x), this.mx(c.z) + (this.oy - this.ox), 3);
    // the route
    if (route.length >= 6) {
      g.lineStyle(3, 0xffd23f, 0.95).beginPath();
      g.moveTo(this.mx(route[0]), this.mx(route[2]) + (this.oy - this.ox));
      for (let i = 3; i < route.length; i += 3) g.lineTo(this.mx(route[i]), this.mx(route[i + 2]) + (this.oy - this.ox));
      g.strokePath();
    }
    // the van: a triangle pointing its way
    const vx = this.mx(sim.x), vy = this.mx(sim.z) + (this.oy - this.ox);
    const f = [Math.sin(sim.h), Math.cos(sim.h)], r = [-f[1], f[0]];
    g.fillStyle(0x1a2340, 1).fillCircle(vx, vy, 7);
    g.fillStyle(0xffffff, 1).fillTriangle(vx + f[0] * 7, vy + f[1] * 7, vx - f[0] * 4 + r[0] * 5, vy - f[1] * 4 + r[1] * 5, vx - f[0] * 4 - r[0] * 5, vy - f[1] * 4 - r[1] * 5);
    void this.size;
  }
}

// ------------------------------------------------------------------ badges over the town

interface Badge { img: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Arc; edge: Phaser.GameObjects.Image; key: string }

/** Badges over the shops and houses that have a job, pinned to the screen edge when off screen. */
export class Badges {
  private list = new Map<string, Badge>();
  private t = 0;
  private visible = true;
  constructor(private scene: Phaser.Scene, private view: View, private play: boolean) {}

  setVisible(v: boolean): void { this.visible = v; for (const b of this.list.values()) { b.img.setVisible(v); b.ring.setVisible(v); b.edge.setVisible(v); } }

  sync(sim: Sim, dt: number): void {
    this.t += dt;
    const want = new Map<string, { bay: Bay; tex: string; color: number }>();
    for (const o of sim.orders) {
      if (o.state === 'offered') want.set('s' + o.shop.id, { bay: o.shop, tex: o.vip ? 'dd-vip' : badgeKey(o.cargo), color: o.vip ? VIP_COLOR : SHOP_COLOR[o.cargo] });
      else if (o.state === 'carried') want.set('h' + o.house.id, { bay: o.house, tex: 'dd-house', color: o.vip ? VIP_COLOR : SHOP_COLOR[o.cargo] });
    }
    for (const [k, b] of this.list) if (!want.has(k)) { this.list.delete(k); this.scene.tweens.add({ targets: [b.img, b.ring, b.edge], scale: 0, duration: 180, onComplete: () => { b.img.destroy(); b.ring.destroy(); b.edge.destroy(); } }); }
    const { width: W, height: H } = this.scene.scale;
    const size = this.play ? 58 : 46;
    for (const [k, w] of want) {
      let b = this.list.get(k);
      if (!b) {
        const img = this.scene.add.image(0, 0, w.tex).setDisplaySize(size, size).setDepth(UI_DEPTH - 20);
        const ring = this.scene.add.circle(0, 0, size * 0.5).setStrokeStyle(4, w.color, 1).setDepth(UI_DEPTH - 21);
        const edge = this.scene.add.image(0, 0, w.tex).setDisplaySize(44, 44).setDepth(UI_DEPTH - 20).setVisible(false);
        const s0 = img.scale;
        img.setScale(0);
        this.scene.tweens.add({ targets: img, scale: s0, duration: 300, ease: 'Back.easeOut' });
        b = { img, ring, edge, key: k };
        this.list.set(k, b);
        if (!this.visible) { img.setVisible(false); ring.setVisible(false); }
      }
      const [x, y, z] = this.view.bayTop(w.bay);
      const p = this.view.toScreen(x, y + Math.sin(this.t * 3 + w.bay.id) * 0.3, z);
      const on = p.visible && p.x > 30 && p.x < W - 30 && p.y > 140 && p.y < H - 40;
      b.img.setVisible(this.visible && on);
      b.ring.setVisible(this.visible && on);
      b.img.setPosition(p.x, p.y);
      const rk = (this.t * 1.2 + w.bay.id * 0.3) % 1;
      b.ring.setPosition(p.x, p.y).setScale(1 + rk * 0.8).setAlpha(1 - rk);
      // off screen (play only): a small badge on the edge pointing at it
      if (this.play && !on) {
        let ex = p.x, ey = p.y;
        if (!p.visible) { ex = W - ex; ey = H + 100; }
        ex = clamp(ex, 40, W - 40);
        ey = clamp(ey, 200, H - 260);
        b.edge.setVisible(this.visible).setPosition(ex, ey).setAlpha(0.85);
      } else b.edge.setVisible(false);
    }
  }
}

export { SHOP_CSS, HUD_MARGIN, HUD_CHIP_H };
