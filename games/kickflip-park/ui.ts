// Kickflip Park: the touch pad and the HUD pieces of the Play scene.
//   - TouchPad: a floating stick for the left thumb; for the right thumb a big OLLIE button (hold
//     to crouch, let go to pop; in the air holding it asks for a grind), a MANUAL button, a SPECIAL
//     button that shows up when the meter is full, and swipes anywhere else on the right half: a
//     quick swipe is a flip, a swipe held down is a grab (both by direction).
//   - Meter, BalanceBar, banners and toasts for the HUD (every readout in a core hudChip).
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip, HUD_CHIP_H } from '@core';
import { clamp, type Dir } from './defs';

export const UI_DEPTH = 9300;

const PAUSE_ZONE = 120;

export class TouchPad {
  /** Stick: x right, y down (−1 … 1). */
  sx = 0;
  sy = 0;
  big = false;
  private bigId = -1;
  private manualEdge = false;
  private specialEdge = false;
  private flipEdge = -1;
  grab = -1;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private swipe: { id: number; x: number; y: number; t: number; dir: number; at: number; grab: boolean } | null = null;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private bigBtn: Phaser.GameObjects.Container;
  private bigRing: Phaser.GameObjects.Graphics;
  private manBtn: Phaser.GameObjects.Container;
  private spcBtn: Phaser.GameObjects.Container;
  private trail: Phaser.GameObjects.Graphics;
  private trailPts: { x: number; y: number; t: number }[] = [];
  private specialOn = false;
  static readonly BIG = { x: 590, y: 1110, r: 100 };
  static readonly MAN = { x: 628, y: 905, r: 62 };
  static readonly SPC = { x: 432, y: 1150, r: 62 };

  constructor(private scene: Phaser.Scene) {
    const s = scene;
    s.input.addPointer(3);
    const D = UI_DEPTH + 100;
    this.base = s.add.circle(0, 0, 84, 0xffffff, 0.12).setStrokeStyle(4, 0xffffff, 0.4).setScrollFactor(0).setDepth(D).setVisible(false);
    this.knob = s.add.circle(0, 0, 40, 0xffffff, 0.4).setScrollFactor(0).setDepth(D).setVisible(false);
    this.trail = s.add.graphics().setScrollFactor(0).setDepth(D);
    const B = TouchPad.BIG, M = TouchPad.MAN, SP = TouchPad.SPC;
    this.bigRing = s.add.graphics();
    this.bigBtn = this.button(B.x, B.y, B.r, 0xff5a36, t('btnOllie'), 30, this.bigRing);
    this.manBtn = this.button(M.x, M.y, M.r, 0x3ec1ff, t('btnManual'), 20);
    this.spcBtn = this.button(SP.x, SP.y, SP.r, 0xffb020, t('btnSpecial'), 20).setVisible(false);
    s.tweens.add({ targets: this.spcBtn, scale: 1.1, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    s.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    s.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    s.input.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
    s.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.up(p));
  }

  private button(x: number, y: number, r: number, color: number, label: string, size: number, extra?: Phaser.GameObjects.Graphics): Phaser.GameObjects.Container {
    const s = this.scene;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.25).fillCircle(0, 6, r);
    g.fillStyle(color, 0.42).fillCircle(0, 0, r);
    g.lineStyle(5, 0xffffff, 0.75).strokeCircle(0, 0, r - 2);
    g.fillStyle(0xffffff, 0.16).fillEllipse(0, -r * 0.45, r * 1.3, r * 0.6);
    const l = txt(s, 0, 2, label, { title: true, size, color: '#ffffff', strokeThickness: 5 });
    const c = s.add.container(x, y, extra ? [g, extra, l] : [g, l]).setScrollFactor(0).setDepth(UI_DEPTH + 100);
    c.setData('face', g);
    return c;
  }

  private hit(p: Phaser.Input.Pointer, b: { x: number; y: number; r: number }, extra = 14): boolean {
    return Math.hypot(p.x - b.x, p.y - b.y) < b.r + extra;
  }

  private down(p: Phaser.Input.Pointer): void {
    const { width } = this.scene.scale;
    if (p.x > width - PAUSE_ZONE && p.y < PAUSE_ZONE) return;
    if (this.hit(p, TouchPad.BIG)) { this.bigId = p.id; this.big = true; this.bigBtn.setScale(0.94); return; }
    if (this.hit(p, TouchPad.MAN, 8)) { this.manualEdge = true; this.scene.tweens.add({ targets: this.manBtn, scale: { from: 0.86, to: 1 }, duration: 160 }); return; }
    if (this.specialOn && this.hit(p, TouchPad.SPC, 8)) { this.specialEdge = true; return; }
    if (p.x < width * 0.5) {
      if (this.stick.id >= 0) return;
      this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
      this.base.setPosition(p.x, p.y).setVisible(true);
      this.knob.setPosition(p.x, p.y).setVisible(true);
      return;
    }
    if (!this.swipe) this.swipe = { id: p.id, x: p.x, y: p.y, t: this.scene.time.now, dir: -1, at: 0, grab: false };
    this.trailPts = [{ x: p.x, y: p.y, t: this.scene.time.now }];
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id === this.stick.id) {
      this.stick.x = p.x; this.stick.y = p.y;
      const dx = p.x - this.stick.ox, dy = p.y - this.stick.oy, len = Math.hypot(dx, dy), r = 76;
      const k = len > r ? r / len : 1;
      this.knob.setPosition(this.stick.ox + dx * k, this.stick.oy + dy * k);
      return;
    }
    const sw = this.swipe;
    if (sw && p.id === sw.id) {
      this.trailPts.push({ x: p.x, y: p.y, t: this.scene.time.now });
      if (sw.dir < 0) {
        const dx = p.x - sw.x, dy = p.y - sw.y;
        if (Math.hypot(dx, dy) > 38) {
          sw.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
          sw.at = this.scene.time.now;
        }
      }
    }
  }

  private up(p: Phaser.Input.Pointer): void {
    if (p.id === this.bigId) { this.bigId = -1; this.big = false; this.bigBtn.setScale(1); }
    if (p.id === this.stick.id) {
      this.stick.id = -1;
      this.base.setVisible(false); this.knob.setVisible(false);
    }
    const sw = this.swipe;
    if (sw && p.id === sw.id) {
      if (sw.dir >= 0 && !sw.grab) this.flipEdge = sw.dir;
      this.swipe = null;
      this.grab = -1;
    }
  }

  /** Call once per frame before reading. */
  update(crouchK: number): void {
    // the stick
    if (this.stick.id >= 0) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 10) { const k = Math.min(1, len / 76) / len; this.sx = dx * k; this.sy = dy * k; } else { this.sx = 0; this.sy = 0; }
    } else { this.sx = 0; this.sy = 0; }
    // a swipe held down becomes a grab
    const sw = this.swipe;
    if (sw && sw.dir >= 0 && !sw.grab && this.scene.time.now - sw.at > 190) { sw.grab = true; this.grab = sw.dir; }
    // the crouch ring on the big button
    const g = this.bigRing.clear();
    if (this.big) {
      const r = TouchPad.BIG.r + 8;
      g.lineStyle(9, 0xffe14a, 0.95).beginPath().arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(crouchK, 0, 1)).strokePath();
    }
    // the swipe trail
    const now = this.scene.time.now;
    this.trailPts = this.trailPts.filter((q) => now - q.t < 220);
    const tg = this.trail.clear();
    for (let i = 1; i < this.trailPts.length; i++) {
      const a = this.trailPts[i - 1], b = this.trailPts[i];
      const k = 1 - (now - b.t) / 220;
      tg.lineStyle(14 * k + 2, 0xffffff, 0.5 * k).lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  takeManual(): boolean { const v = this.manualEdge; this.manualEdge = false; return v; }
  takeSpecial(): boolean { const v = this.specialEdge; this.specialEdge = false; return v; }
  takeFlip(): number { const v = this.flipEdge; this.flipEdge = -1; return v; }

  setSpecial(on: boolean): void {
    if (on === this.specialOn) return;
    this.specialOn = on;
    this.spcBtn.setVisible(on);
  }

  /** The stick as a 4-way direction (or −1). */
  dir(): number {
    if (Math.hypot(this.sx, this.sy) < 0.5) return -1;
    return Math.abs(this.sx) > Math.abs(this.sy) ? (this.sx > 0 ? 1 : 3) : (this.sy > 0 ? 2 : 0);
  }

  setVisible(v: boolean): void {
    for (const o of [this.bigBtn, this.manBtn]) o.setVisible(v);
    this.spcBtn.setVisible(v && this.specialOn);
  }
}

/** A bar inside a HUD chip (the special meter). */
export class Meter {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private k = 0;
  private shown = -1;
  private full = false;

  constructor(private scene: Phaser.Scene, x: number, y: number, label: string, private w = 150) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', w);
    this.chip = hudChip(scene, x, y, { align: 'right', label, items: [this.bar] });
  }

  set(k: number, full: boolean, time: number): void {
    this.k = clamp(k, 0, 1);
    const kk = Math.round(this.k * 200) / 200;
    if (kk === this.shown && !full && !this.full) return;
    this.shown = kk;
    this.full = full;
    const g = this.bar.clear();
    const w = this.w, h = 16;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (this.k > 0.01) {
      const pulse = full ? 0.75 + 0.25 * Math.sin(time * 10) : 1;
      g.fillStyle(full ? 0xffc23a : 0xff8a3d, pulse).fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * this.k), h, h / 2);
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 2, Math.max(4, w * this.k - 6), 5, 2);
    }
  }
}

/** The balance meter shown under the skater on rails and in manuals. */
export class BalanceBar {
  private c: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
    this.label = txt(scene, 0, -30, t('balance'), { title: true, size: 16, color: '#ffffff', strokeThickness: 4 });
    this.c = scene.add.container(0, 0, [this.g, this.label]).setScrollFactor(0).setDepth(UI_DEPTH).setVisible(false);
  }

  /** `v`: −1 … 1; `vertical` for manuals (the bar stands up). */
  show(x: number, y: number, v: number, vertical: boolean): void {
    this.c.setVisible(true).setPosition(x, y);
    const g = this.g.clear();
    const L = 210, T = 18;
    const danger = Math.abs(v);
    const col = danger > 0.75 ? 0xff4f4f : danger > 0.45 ? 0xffc23f : 0x7dffa0;
    if (vertical) {
      g.fillStyle(0x0b1020, 0.55).fillRoundedRect(-T / 2 - 4, -L / 2 - 4, T + 8, L + 8, 12);
      g.fillStyle(0xff4f4f, 0.35).fillRect(-T / 2, -L / 2, T, L * 0.14).fillRect(-T / 2, L / 2 - L * 0.14, T, L * 0.14);
      g.fillStyle(0xffffff, 0.5).fillRect(-T / 2, -1, T, 2);
      g.fillStyle(col, 1).fillCircle(0, -v * L / 2, 13);
      this.label.setPosition(0, -L / 2 - 26);
    } else {
      g.fillStyle(0x0b1020, 0.55).fillRoundedRect(-L / 2 - 4, -T / 2 - 4, L + 8, T + 8, 12);
      g.fillStyle(0xff4f4f, 0.35).fillRect(-L / 2, -T / 2, L * 0.14, T).fillRect(L / 2 - L * 0.14, -T / 2, L * 0.14, T);
      g.fillStyle(0xffffff, 0.5).fillRect(-1, -T / 2, 2, T);
      g.fillStyle(col, 1).fillCircle(v * L / 2, 0, 13);
      this.label.setPosition(0, -30);
    }
  }

  hide(): void { this.c.setVisible(false); }
}

/** A big word that pops in and floats away. */
export function banner(scene: Phaser.Scene, x: number, y: number, s: string, o: { color?: string; size?: number; hold?: number; sub?: string; subColor?: string } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 50);
  const main = txt(scene, 0, 0, s, { title: true, size: o.size ?? 54, color: o.color ?? '#ffd23f', strokeThickness: 10, wrap: 660 });
  c.add(main);
  if (o.sub) c.add(txt(scene, 0, main.height / 2 + 26, o.sub, { title: true, size: 30, color: o.subColor ?? '#ffffff', strokeThickness: 7 }));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 50, alpha: 0, delay: 220 + (o.hold ?? 0.8) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  return c;
}

let toastSlot = 0;
let toastUntil = 0;

/** A goal toast under the HUD: a glass chip with a check mark (several at once stack). */
export function goalToast(scene: Phaser.Scene, y0: number, title: string, text: string): void {
  const now = scene.time.now;
  if (now > toastUntil) toastSlot = 0;
  const y = y0 + (toastSlot++ % 4) * 66;
  toastUntil = now + 2600;
  const icon = scene.textures.exists('icon-checkmark') ? 'icon-checkmark' : 'icon-star';
  const chip = hudChip(scene, scene.scale.width / 2, y, { align: 'center', icon, iconSize: 32, label: title, text, color: '#7dffa0', size: 24, height: HUD_CHIP_H + 12, depth: UI_DEPTH + 60 });
  chip.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: chip, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: chip, alpha: 0, y: y - 30, delay: 2600, duration: 400, onComplete: () => chip.destroy() });
}

/** Turns a direction key state into a 4-way direction (or −1). */
export function dirOf(up: boolean, right: boolean, down: boolean, left: boolean): number {
  if (up && !down) return 0;
  if (down && !up) return 2;
  if (right && !left) return 1;
  if (left && !right) return 3;
  return -1;
}

export type { Dir };

/** A frosted card for the HUD layer (summary, tutorial): drawn round (0, 0). */
function card(scene: Phaser.Scene, w: number, h: number, rim = 0xffffff, rimA = 0.22): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 24);
  g.fillStyle(0x10162e, 0.86).fillRoundedRect(-w / 2, -h / 2, w, h, 24);
  g.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, Math.min(26, h * 0.3), { tl: 20, tr: 20, bl: 6, br: 6 });
  g.lineStyle(2, rim, rimA).strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
  return g;
}

let lastSummary: Phaser.GameObjects.Container | null = null;

/**
 * The end of a combo: its tricks, points × tricks, how it landed (and what that did to it) and the
 * total, with the praise word for big ones. One at a time: a new combo replaces the card.
 */
export function comboSummary(scene: Phaser.Scene, x: number, y: number, o: { names: string[]; sum: string; count: number; total: string; quality: string; qualityColor: string; mult: string; praise: string; big: boolean; tier: number }): void {
  if (lastSummary?.active) { const old = lastSummary; scene.tweens.killTweensOf(old); scene.tweens.add({ targets: old, alpha: 0, duration: 120, onComplete: () => old.destroy() }); }
  const c = scene.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 45);
  const shown = o.names.length > 5 ? ['…', ...o.names.slice(-5)] : o.names;
  const names = txt(scene, 0, 0, shown.join(' + '), { size: 19, color: '#dfe6ff', strokeThickness: 0, shadow: false, wrap: 560 });
  const line = txt(scene, 0, 0, `${o.sum} × ${o.count}`, { title: true, size: 24, color: '#ffffff', strokeThickness: 0, shadow: false });
  const q = txt(scene, 0, 0, o.mult ? `${o.quality}  ${o.mult}` : o.quality, { title: true, size: 20, color: o.qualityColor, strokeThickness: 0, shadow: false });
  const total = txt(scene, 0, 0, '+' + o.total, { title: true, size: o.big ? 58 : 46, color: o.tier >= 3 ? '#ffb020' : '#7dffa0', strokeThickness: 8 });
  const praise = o.praise ? txt(scene, 0, 0, o.praise, { title: true, size: 26, color: '#ffffff', strokeThickness: 6 }) : null;
  const h = 34 + names.height + 10 + line.height + 6 + q.height + 4 + total.height + (praise ? praise.height : 0) + 22;
  let yy = -h / 2 + 20;
  const place = (t: Phaser.GameObjects.Text) => { t.setY(yy + t.height / 2); yy += t.height + 6; };
  place(names); place(line); place(q); yy += 2; place(total); if (praise) place(praise);
  c.add([card(scene, 600, h, o.qualityColor === '#ffd23f' ? 0xffd23f : 0xffffff, o.qualityColor === '#ffd23f' ? 0.7 : 0.22), names, line, q, total, ...(praise ? [praise] : [])]);
  c.setScale(0.5).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: total, scale: { from: 1.25, to: 1 }, duration: 260, delay: 120, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 40, alpha: 0, delay: 1500 + (o.big ? 300 : 0), duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  lastSummary = c;
}

/** A small word by the rider (a landing's quality). */
export function popWord(scene: Phaser.Scene, x: number, y: number, s: string, color: string, size = 30): void {
  const t = txt(scene, x, y, s, { title: true, size, color, strokeThickness: 7 }).setScrollFactor(0).setDepth(UI_DEPTH + 40);
  t.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 60, alpha: 0, delay: 520, duration: 360, onComplete: () => t.destroy() });
}

/** The tutorial's prompt: step count, what to do, a tick when done, and a SKIP pill. */
export class TutorialCard {
  readonly c: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private g: Phaser.GameObjects.Graphics;
  private tick: Phaser.GameObjects.Graphics;
  readonly skip: Phaser.GameObjects.Container;
  static readonly W = 640;

  constructor(private scene: Phaser.Scene, y: number, skipLabel: string, onSkip: () => void) {
    const s = scene;
    this.c = s.add.container(s.scale.width / 2, y).setScrollFactor(0).setDepth(UI_DEPTH + 30);
    this.g = s.add.graphics();
    this.head = txt(s, -TutorialCard.W / 2 + 28, 0, '', { title: true, size: 20, color: '#ffd23f', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.body = txt(s, -TutorialCard.W / 2 + 28, 0, '', { size: 23, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: TutorialCard.W - 230, align: 'left' }).setOrigin(0, 0.5);
    this.tick = s.add.graphics().setVisible(false);
    // the SKIP pill (an 84 px tall tap target)
    const sg = s.add.graphics();
    sg.fillStyle(0xffffff, 0.14).fillRoundedRect(-70, -36, 140, 72, 36).lineStyle(2, 0xffffff, 0.4).strokeRoundedRect(-70, -36, 140, 72, 36);
    const st = txt(s, 0, 0, skipLabel, { title: true, size: 20, color: '#ffffff', strokeThickness: 0, shadow: false });
    this.skip = s.add.container(TutorialCard.W / 2 - 90, 0, [sg, st]).setSize(150, 84).setInteractive({ useHandCursor: true });
    this.skip.on('pointerup', onSkip);
    this.c.add([this.g, this.head, this.body, this.tick, this.skip]);
  }

  set(head: string, body: string): void {
    this.head.setText(head);
    this.body.setText(body);
    const h = Math.max(110, this.body.height + 64);
    this.head.setY(-h / 2 + 24);
    this.body.setY(-h / 2 + 46 + this.body.height / 2);
    this.g.clear();
    this.g.fillStyle(0x000000, 0.28).fillRoundedRect(-TutorialCard.W / 2, -h / 2 + 6, TutorialCard.W, h, 24);
    this.g.fillStyle(0x10162e, 0.88).fillRoundedRect(-TutorialCard.W / 2, -h / 2, TutorialCard.W, h, 24);
    this.g.lineStyle(3, 0xffd23f, 0.75).strokeRoundedRect(-TutorialCard.W / 2, -h / 2, TutorialCard.W, h, 24);
    this.tick.setVisible(false);
    this.c.setAlpha(0).setScale(0.85);
    this.scene.tweens.add({ targets: this.c, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  /** A green tick over the card (the step is done). */
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
