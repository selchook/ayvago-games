// Snow Express: the 2D pieces drawn over the 3D board: canvas-made icons (one per cargo colour,
// the two powers), rounded buttons and glass panels in the core's modern look, banners, the power
// buttons, and the Overlay that keeps badges over the cabins, the trains and the switches.
import Phaser from 'phaser';
import { txt, hudChip, HudChip, playSfx } from '@core';
import { CSS, HEX, ICON, COLORS, type ColorId } from './defs';
import type { Sim } from './sim';
import type { View } from './view';

export const UI_DEPTH = 9300;

// ------------------------------------------------------------------ icons

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  scene.textures.addCanvas(key, cv);
}

/** Draws a colour's icon (white) centred at (x, y), `s` = its size. */
export function drawIcon(g: CanvasRenderingContext2D, icon: (typeof ICON)[ColorId], x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.beginPath();
  switch (icon) {
    case 'heart':
      g.moveTo(0, 38); g.bezierCurveTo(-60, 0, -42, -48, 0, -20); g.bezierCurveTo(42, -48, 60, 0, 0, 38); g.fill();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 19 : 44; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 3); }
      g.closePath(); g.fill();
      break;
    case 'tree':
      g.moveTo(0, -44); g.lineTo(26, -10); g.lineTo(14, -10); g.lineTo(36, 22); g.lineTo(-36, 22); g.lineTo(-14, -10); g.lineTo(-26, -10); g.closePath(); g.fill();
      g.fillRect(-8, 20, 16, 18);
      break;
    case 'bell':
      g.moveTo(-34, 24); g.quadraticCurveTo(-28, 16, -26, -6); g.bezierCurveTo(-24, -40, 24, -40, 26, -6); g.quadraticCurveTo(28, 16, 34, 24); g.closePath(); g.fill();
      g.beginPath(); g.arc(0, 30, 9, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(0, -36, 6, 0, Math.PI * 2); g.fill();
      break;
    case 'moon':
      g.arc(0, 0, 38, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(18, -12, 32, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      break;
    case 'snowflake':
      g.lineCap = 'round';
      g.strokeStyle = g.fillStyle as string;
      g.lineWidth = 10;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const c = Math.cos(a), s2 = Math.sin(a);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(c * 40, s2 * 40); g.stroke();
        for (const k of [22, 32]) {
          g.beginPath();
          g.moveTo(c * k, s2 * k);
          g.lineTo(c * k + Math.cos(a + 0.8) * 11, s2 * k + Math.sin(a + 0.8) * 11);
          g.moveTo(c * k, s2 * k);
          g.lineTo(c * k + Math.cos(a - 0.8) * 11, s2 * k + Math.sin(a - 0.8) * 11);
          g.stroke();
        }
      }
      break;
  }
  g.restore();
}

/** Texture keys: the coloured badge of a cargo colour (disc + white icon). */
export const badgeKey = (c: ColorId): string => 'se-badge-' + c;
export const iconKey = (c: ColorId): string => 'se-icon-' + c;

export function makeArt(scene: Phaser.Scene): void {
  for (const c of COLORS) {
    canvasTexture(scene, badgeKey(c), 96, 96, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.arc(48, 52, 42, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(48, 48, 43, 0, Math.PI * 2); g.fill();
      const grd = g.createLinearGradient(0, 8, 0, 88);
      grd.addColorStop(0, CSS[c]);
      grd.addColorStop(1, '#' + Phaser.Display.Color.IntegerToColor(HEX[c]).darken(18).color.toString(16).padStart(6, '0'));
      g.fillStyle = grd;
      g.beginPath(); g.arc(48, 48, 37, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      drawIcon(g, ICON[c], 48, 48, 50);
    });
    canvasTexture(scene, iconKey(c), 64, 64, (g) => { g.fillStyle = CSS[c]; drawIcon(g, ICON[c], 32, 32, 56); });
  }
  canvasTexture(scene, 'se-cocoa', 96, 96, (g) => {
    // a mug of cocoa with steam and a marshmallow
    g.fillStyle = '#ffffff';
    g.beginPath(); g.roundRect(18, 34, 48, 46, 10); g.fill();
    g.lineWidth = 9; g.strokeStyle = '#ffffff';
    g.beginPath(); g.arc(68, 56, 12, -1.2, 1.2); g.stroke();
    g.fillStyle = '#e8453c'; g.fillRect(18, 46, 48, 10);
    g.fillStyle = '#7a4a2a'; g.beginPath(); g.ellipse(42, 36, 22, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4e8'; g.fillRect(32, 28, 14, 10);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.lineCap = 'round';
    for (const x of [30, 46]) { g.beginPath(); g.moveTo(x, 22); g.quadraticCurveTo(x - 7, 14, x, 6); g.stroke(); }
  });
  canvasTexture(scene, 'se-globe', 96, 96, (g) => {
    // a snow globe: a glass ball on a wooden base, a tiny tree inside
    g.fillStyle = '#a0643c'; g.beginPath(); g.roundRect(20, 70, 56, 16, 6); g.fill();
    const grd = g.createRadialGradient(40, 32, 4, 48, 42, 32);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#8fd0ff');
    g.fillStyle = grd; g.beginPath(); g.arc(48, 42, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2fbf5f'; g.beginPath(); g.moveTo(48, 24); g.lineTo(60, 52); g.lineTo(36, 52); g.closePath(); g.fill();
    g.fillStyle = '#ffffff';
    for (const [x, y] of [[34, 30], [62, 34], [44, 58], [58, 60], [30, 50], [52, 22]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4; g.beginPath(); g.arc(48, 42, 30, 3.6, 4.6); g.stroke();
  });
  canvasTexture(scene, 'se-hand', 96, 96, (g) => {
    // a pointing hand (for the tutorial)
    g.fillStyle = '#ffffff'; g.strokeStyle = '#1a2340'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(40, 8); g.quadraticCurveTo(48, 4, 52, 12); g.lineTo(52, 44); g.quadraticCurveTo(64, 38, 70, 46); g.quadraticCurveTo(80, 44, 82, 54);
    g.lineTo(82, 72); g.quadraticCurveTo(80, 90, 60, 90); g.lineTo(46, 90); g.quadraticCurveTo(32, 88, 26, 72); g.lineTo(18, 56);
    g.quadraticCurveTo(16, 46, 28, 50); g.lineTo(36, 58); g.lineTo(36, 14); g.quadraticCurveTo(36, 8, 40, 8);
    g.closePath(); g.fill(); g.stroke();
  });
  canvasTexture(scene, 'se-clock', 64, 64, (g) => {
    g.strokeStyle = '#ffffff'; g.lineWidth = 7;
    g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    g.lineCap = 'round'; g.beginPath(); g.moveTo(32, 32); g.lineTo(32, 18); g.moveTo(32, 32); g.lineTo(42, 38); g.stroke();
  });
  canvasTexture(scene, 'se-gift', 64, 64, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(10, 26, 44, 32); g.fillRect(6, 18, 52, 12);
    g.fillStyle = '#e8453c'; g.fillRect(28, 18, 8, 40);
    g.strokeStyle = '#e8453c'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(24, 12, 9, 6, 0.5, 0, Math.PI * 2); g.ellipse(40, 12, 9, 6, -0.5, 0, Math.PI * 2); g.stroke();
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
    return this;
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

/** A power button: a round glass button with the power's icon, a count and the key it answers to. */
export class PowerButton extends Phaser.GameObjects.Container {
  private ring: Phaser.GameObjects.Graphics;
  private countChip: HudChip;
  private keyTag: Phaser.GameObjects.Text;
  private n = -1;
  private activeK = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly kind: 'cocoa' | 'globe', label: string, key: string, private onTap: () => void) {
    super(scene, x, y);
    const R = 50;
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.28).fillCircle(0, 6, R);
    bg.fillStyle(kind === 'cocoa' ? 0x7a3a22 : 0x1f5f9a, 0.88).fillCircle(0, 0, R);
    bg.fillStyle(0xffffff, 0.12).fillEllipse(0, -R * 0.45, R * 1.4, R * 0.7);
    bg.lineStyle(3, 0xffffff, 0.5).strokeCircle(0, 0, R);
    this.ring = scene.add.graphics();
    const icon = scene.add.image(0, -4, kind === 'cocoa' ? 'se-cocoa' : 'se-globe').setDisplaySize(70, 70);
    const name = txt(scene, 0, R + 18, label, { title: true, size: 17, color: '#ffffff', strokeThickness: 5 });
    this.keyTag = txt(scene, -R + 6, -R + 8, key, { title: true, size: 18, color: '#14204a', strokeThickness: 0, shadow: false });
    const kbg = scene.add.circle(-R + 6, -R + 8, 15, 0xffffff, 0.95);
    this.countChip = hudChip(scene, R - 6, -R + 8, { align: 'center', text: '0', size: 20, height: 34, minWidth: 34, depth: UI_DEPTH + 30 });
    this.countChip.setScrollFactor(0);
    this.add([bg, this.ring, icon, name, kbg, this.keyTag]);
    this.setSize(R * 2 + 20, R * 2 + 30).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { scene.tweens.add({ targets: this, scale: 0.92, duration: 70 }); this.onTap(); });
    this.on('pointerup', () => scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' }));
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.setScrollFactor(0).setDepth(UI_DEPTH + 20);
    scene.add.existing(this);
    this.set(0, 0);
  }

  showKey(on: boolean): void { this.keyTag.setVisible(on); (this.list[4] as Phaser.GameObjects.Arc).setVisible(on); }

  /** Count, and how much of its effect is left (0..1). */
  set(n: number, active: number): void {
    if (n !== this.n) {
      const grew = n > this.n && this.n >= 0;
      this.n = n;
      this.countChip.setText(String(n));
      this.setAlpha(n > 0 || active > 0 ? 1 : 0.55);
      if (grew) this.scene.tweens.add({ targets: this, scale: { from: 1.3, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    }
    this.countChip.setPosition(this.x + 44, this.y - 42);
    this.countChip.setAlpha(this.alpha).setVisible(this.visible);
    if (active !== this.activeK) {
      this.activeK = active;
      const g = this.ring.clear();
      if (active > 0) g.lineStyle(7, 0xffd23f, 1).beginPath().arc(0, 0, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * active).strokePath();
    }
  }
}

// ------------------------------------------------------------------ overlay over the 3D board

interface Badge { img: Phaser.GameObjects.Image; base: number }

/**
 * Keeps 2D badges on 3D things: a colour badge over every cabin and over every train (its first
 * wagon), and in play the switch badges (tap targets with key numbers) and the signals' lamps.
 */
export class Overlay {
  private stops: Badge[] = [];
  private trains = new Map<number, Phaser.GameObjects.Image>();
  private t = 0;
  readonly switches: { c: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Arc; key: Phaser.GameObjects.Text; dot: Phaser.GameObjects.Arc; x: number; y: number }[] = [];
  private closed: boolean[] = [];
  keys = false;
  selected = -1;

  constructor(private scene: Phaser.Scene, private view: View, private play: boolean) {
    const b = view.board;
    for (const st of b.stops) {
      const p = view.toScreen(...pt(view.stopPoint(st.id, 1.75)));
      const img = scene.add.image(p.x, p.y, badgeKey(st.color)).setDisplaySize(play ? 58 : 50, play ? 58 : 50).setDepth(play ? 40 : -50);
      this.stops.push({ img, base: p.y });
      this.closed.push(false);
    }
    if (!play) return;
    b.controls.forEach((ctl, i) => {
      const w = view.controlPoint(i);
      const lp = ctl.kind === 'switch' ? view.leverPos(ctl.id) : null;
      const at = lp ? view.toScreen(lp.x, 0.55, lp.z) : view.toScreen(w.x, w.y + 0.35, w.z);
      const c = scene.add.container(at.x, at.y).setDepth(45);
      const ring = scene.add.circle(0, 0, 23, 0x14204a, 0.45).setStrokeStyle(3, 0xffffff, 0.8);
      const dot = scene.add.circle(0, 0, 9, ctl.kind === 'signal' ? 0x3aff6a : 0xffd23f, 1);
      const key = txt(scene, 0, 1, String(i + 1), { title: true, size: 22, color: '#ffffff', strokeThickness: 0, shadow: false }).setVisible(false);
      c.add([ring, dot, key]);
      this.switches.push({ c, ring, key, dot, x: at.x, y: at.y });
    });
  }

  setVisible(on: boolean): void {
    for (const b of this.stops) b.img.setVisible(on);
    for (const img of this.trains.values()) img.setVisible(on);
    for (const s of this.switches) s.c.setVisible(on);
    this.hidden = !on;
  }
  private hidden = false;

  setClosed(stop: number, closed: boolean): void {
    this.closed[stop] = closed;
    this.stops[stop].img.setAlpha(closed ? 0.25 : 1);
  }

  /** Pops a cabin's badge (after a delivery). */
  pop(stop: number, good: boolean): void {
    const b = this.stops[stop]?.img;
    if (!b) return;
    const s = b.scaleX;
    this.scene.tweens.add({ targets: b, scale: s * (good ? 1.45 : 0.8), duration: 140, yoyo: true, ease: 'Quad.easeOut' });
  }

  sync(sim: Sim, dt: number): void {
    this.t += dt;
    const v = this.view;
    this.stops.forEach((b, i) => {
      const p = v.toScreen(...pt(v.stopPoint(i, 1.75)));
      b.img.setPosition(p.x, p.y + Math.sin(this.t * 2.2 + i) * 4);
    });
    // a badge over every train's first wagon (the locomotive when it has none)
    const live = new Set<number>();
    for (const tr of sim.trains) {
      if (!tr.color || tr.state === 'crashed') continue;
      const car = tr.cars > 1 ? 1 : 0;
      const p = v.carScreen(sim, tr, car) ?? (car ? v.carScreen(sim, tr, 0) : null);
      if (!p) continue;
      live.add(tr.id);
      let img = this.trains.get(tr.id);
      if (!img) {
        img = this.scene.add.image(p.x, p.y, badgeKey(tr.color)).setDisplaySize(34, 34).setDepth(this.play ? 42 : -48).setVisible(!this.hidden);
        this.trains.set(tr.id, img);
        this.scene.tweens.add({ targets: img, scale: { from: img.scale * 1.8, to: img.scale }, duration: 260, ease: 'Back.easeOut' });
      }
      img.setPosition(p.x, p.y - 6);
    }
    for (const [id, img] of this.trains) if (!live.has(id)) { img.destroy(); this.trains.delete(id); }
    // switches and signals
    this.switches.forEach((s, i) => {
      const ctl = v.board.controls[i];
      if (ctl.kind === 'signal') s.dot.setFillStyle(sim.red[ctl.id] ? 0xff3a2a : 0x3aff6a);
      else s.dot.setFillStyle(sim.state[ctl.id] ? 0xffc23a : 0xff7a4a);
      s.key.setVisible(this.keys && i < 9);
      s.dot.setVisible(!this.keys || i >= 9);
      const sel = this.keys && i === this.selected;
      s.ring.setStrokeStyle(sel ? 5 : 3, sel ? 0xffd23f : 0xffffff, sel ? 1 : 0.85);
      s.c.setScale(sel ? 1.15 + Math.sin(this.t * 6) * 0.05 : 1);
    });
  }

  /** The control nearest a tap (screen), within reach; −1 if none. */
  pick(x: number, y: number, reach = 78): number {
    const v = this.view;
    let best = -1, bd = reach;
    v.board.controls.forEach((ctl, i) => {
      const s = this.switches[i];
      const w = v.controlPoint(i);
      const c = v.toScreen(w.x, w.y, w.z);
      for (const p of [s, c]) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = i; }
      }
      void ctl;
    });
    return best;
  }

  shakeSwitch(i: number): void {
    const s = this.switches[i];
    if (!s) return;
    this.scene.tweens.add({ targets: s.c, x: s.x + 8, duration: 40, yoyo: true, repeat: 3, onComplete: () => s.c.setX(s.x) });
  }

  pulseSwitch(i: number): void {
    const s = this.switches[i];
    if (!s) return;
    this.scene.tweens.add({ targets: s.c, scale: { from: 1.35, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }

  destroy(): void {
    for (const b of this.stops) b.img.destroy();
    for (const img of this.trains.values()) img.destroy();
    for (const s of this.switches) s.c.destroy();
  }
}

const pt = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];

export { playSfx };
