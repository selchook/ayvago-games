// Coaster Rush: the touch pad and the HUD pieces of the Play scene.
//   - TouchPad: a big GO pedal under the right thumb (hold: chain lift, booster, motor) and a
//     BRAKE pedal under the left; at a junction two arrow buttons on the screen's sides pick the
//     branch, and a small camera button switches to the ride camera. Every finger is read each
//     frame, so GO and BRAKE and an arrow work together.
//   - The speed panel (speed, the band of what comes next, the lean meter), the riders' happiness
//     and seat chips, the active power-ups (PowerBar: a ring running down round each icon), the
//     tutorial card, the first-time hint card, banners and floating words. Every always-visible
//     readout sits in a core hudChip.
import Phaser from 'phaser';
import { txt, hudChip, HudChip, HUD_GAP, labelAt, fitWidth, type LabelStyle } from '@core';
import { INK } from './menu';

// ------------------------------------------------------------------ the callouts' looks

/** The size banners are painted at (scaled to each banner's size). */
export const BANNER_PX = 56;
/** The size floating words are painted at. */
export const WORD_PX = 32;

/** `c` mixed toward `to` by k (both #rrggbb). */
function mix(c: string, to: string, k: number): string {
  const a = parseInt(c.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/**
 * A callout in the theme's circus face (Sancreek): a marquee-bright top fading into the callout's
 * colour, outlined in the theme's deep red ink, as the menu's and the shop's labels.
 */
export function calloutStyle(color: string, size = BANNER_PX): LabelStyle {
  return { size, fill: [mix(color, '#fffbe8', 0.62), color, mix(color, INK, 0.3)], stroke: INK, strokeWidth: Math.round(size * 0.17) };
}
/** A banner's second line (in its own colour, flat). */
export const subStyle = (color: string): LabelStyle => ({ size: 26, color, stroke: INK, strokeWidth: 6 });
/** The tutorial's and the hints' headings on the night-blue cards. */
export const HEAD_STYLE: LabelStyle = { size: 24, fill: ['#fffbe8', '#ffe27a', '#f6b21c'], stroke: INK, strokeWidth: 5 };
import { clamp } from './defs';

export const UI_DEPTH = 9300;
const PAUSE_ZONE = 120;

interface Btn { x: number; y: number; r: number }

export class TouchPad {
  static readonly GO: Btn = { x: 598, y: 1128, r: 98 };
  static readonly BRAKE: Btn = { x: 122, y: 1128, r: 98 };
  static readonly LEFT: Btn = { x: 92, y: 720, r: 74 };
  static readonly RIGHT: Btn = { x: 628, y: 720, r: 74 };
  static readonly CAM: Btn = { x: 360, y: 1196, r: 40 };
  private down = new Map<number, string>();
  private go: Phaser.GameObjects.Container;
  private brake: Phaser.GameObjects.Container;
  private left: Phaser.GameObjects.Container;
  private right: Phaser.GameObjects.Container;
  private cam: Phaser.GameObjects.Container;
  private pickT = 0;
  private picked = 0;
  private camTap = false;
  private forkShown = false;

  constructor(private scene: Phaser.Scene, labels: { go: string; brake: string; left: string; right: string }) {
    const s = scene;
    s.input.addPointer(3);
    this.go = this.pedal(TouchPad.GO, 0x2fae5a, labels.go, 'up');
    this.brake = this.pedal(TouchPad.BRAKE, 0xe0523a, labels.brake, 'down');
    this.left = this.arrow(TouchPad.LEFT, -1, labels.left);
    this.right = this.arrow(TouchPad.RIGHT, 1, labels.right);
    this.cam = this.camButton(TouchPad.CAM);
    this.left.setVisible(false); this.right.setVisible(false);
    s.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(p));
    s.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    s.input.on('pointerup', (p: Phaser.Input.Pointer) => this.release(p));
    s.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.release(p));
  }

  private pedal(b: Btn, color: number, label: string, arrow: 'up' | 'down'): Phaser.GameObjects.Container {
    const s = this.scene, r = b.r;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.25).fillCircle(0, 7, r);
    g.fillStyle(color, 0.55).fillCircle(0, 0, r);
    g.lineStyle(5, 0xffffff, 0.8).strokeCircle(0, 0, r - 2);
    g.fillStyle(0xffffff, 0.16).fillEllipse(0, -r * 0.45, r * 1.3, r * 0.6);
    const up = arrow === 'up';
    const ay = up ? -r * 0.42 : r * 0.42, h = r * 0.15, w = r * 0.24;
    g.fillStyle(0xffffff, 0.92).fillTriangle(-w, ay + (up ? h : -h), w, ay + (up ? h : -h), 0, ay + (up ? -h : h));
    const l = txt(s, 0, up ? r * 0.12 : -r * 0.1, label, { title: true, size: 30, color: '#ffffff', strokeThickness: 5 });
    return s.add.container(b.x, b.y, [g, l]).setScrollFactor(0).setDepth(UI_DEPTH + 100);
  }

  private arrow(b: Btn, dir: number, label: string): Phaser.GameObjects.Container {
    const s = this.scene, r = b.r;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.25).fillCircle(0, 6, r);
    g.fillStyle(0x1c1838, 0.72).fillCircle(0, 0, r);
    g.lineStyle(4, 0xffffff, 0.85).strokeCircle(0, 0, r - 2);
    g.fillStyle(0xffffff, 1).fillTriangle(dir * 30, -14, dir * 30, 14, dir * 52, 0);
    g.fillRect(dir > 0 ? -6 : -24, -7, 32, 14);
    const l = txt(s, -dir * 8, 38, label, { title: true, size: 18, color: '#ffffff', strokeThickness: 4 });
    const c = s.add.container(b.x, b.y, [g, l]).setScrollFactor(0).setDepth(UI_DEPTH + 100);
    c.setData('label', l);
    return c;
  }

  private camButton(b: Btn): Phaser.GameObjects.Container {
    const s = this.scene;
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.35).fillCircle(0, 0, b.r);
    g.lineStyle(3, 0xffffff, 0.6).strokeCircle(0, 0, b.r - 2);
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(-18, -10, 30, 22, 4).fillTriangle(12, 1, 22, -8, 22, 10);
    return s.add.container(b.x, b.y, [g]).setScrollFactor(0).setDepth(UI_DEPTH + 100);
  }

  private hit(p: Phaser.Input.Pointer, b: Btn, extra = 18): boolean { return Math.hypot(p.x - b.x, p.y - b.y) < b.r + extra; }

  private zone(p: Phaser.Input.Pointer): string {
    const { width } = this.scene.scale;
    if (p.x > width - PAUSE_ZONE && p.y < PAUSE_ZONE) return '';
    if (this.forkShown && this.hit(p, TouchPad.LEFT, 30)) return 'left';
    if (this.forkShown && this.hit(p, TouchPad.RIGHT, 30)) return 'right';
    if (this.hit(p, TouchPad.CAM, 10)) return 'cam';
    if (this.hit(p, TouchPad.GO, 40) || (p.y > 900 && p.x > width * 0.62)) return 'go';
    if (this.hit(p, TouchPad.BRAKE, 40) || (p.y > 900 && p.x < width * 0.38)) return 'brake';
    return '';
  }

  private press(p: Phaser.Input.Pointer): void {
    const z = this.zone(p);
    if (!z) return;
    this.down.set(p.id, z);
    if (z === 'left' || z === 'right') { this.picked = z === 'left' ? 1 : -1; this.pickT = 0.3; }
    if (z === 'cam') this.camTap = true;
    this.refresh();
  }

  private move(p: Phaser.Input.Pointer): void {
    if (!this.down.has(p.id)) return;
    // a thumb may slide from one pedal onto the other
    const z = this.zone(p);
    const was = this.down.get(p.id);
    if ((z === 'go' || z === 'brake') && (was === 'go' || was === 'brake') && z !== was) { this.down.set(p.id, z); this.refresh(); }
  }

  private release(p: Phaser.Input.Pointer): void {
    if (this.down.delete(p.id)) this.refresh();
  }

  private refresh(): void {
    const held = new Set(this.down.values());
    this.go.setScale(held.has('go') ? 0.92 : 1);
    this.brake.setScale(held.has('brake') ? 0.92 : 1);
  }

  get power(): boolean { for (const z of this.down.values()) if (z === 'go') return true; return false; }
  get brakeHeld(): boolean { for (const z of this.down.values()) if (z === 'brake') return true; return false; }
  /** The branch tapped this frame (+1 left, −1 right, 0 none). */
  get pick(): number { return this.pickT > 0 ? this.picked : 0; }
  takeCam(): boolean { const c = this.camTap; this.camTap = false; return c; }

  /** Shows the junction's arrows (`chosen`: the branch picked now), or hides them. */
  setFork(on: boolean, chosen = 0, leftLabel = '', rightLabel = ''): void {
    this.forkShown = on;
    this.left.setVisible(on); this.right.setVisible(on);
    if (!on) return;
    (this.left.getData('label') as Phaser.GameObjects.Text).setText(leftLabel);
    (this.right.getData('label') as Phaser.GameObjects.Text).setText(rightLabel);
    this.left.setAlpha(chosen > 0 ? 1 : 0.55).setScale(chosen > 0 ? 1.08 : 0.92);
    this.right.setAlpha(chosen < 0 ? 1 : 0.55).setScale(chosen < 0 ? 1.08 : 0.92);
  }

  update(dt: number): void { this.pickT = Math.max(0, this.pickT - dt); }

  setVisible(v: boolean): void { this.go.setVisible(v); this.brake.setVisible(v); this.cam.setVisible(v); if (!v) { this.left.setVisible(false); this.right.setVisible(false); } }
}

/**
 * The speed panel: the speed in km/h, a bar with the band the coming element asks for (green: a
 * safe window; its right end is a corner's or the station's limit, its left end what a loop
 * needs) and under it the lean meter, which turns red and flashes near the limit.
 */
export class SpeedPanel {
  readonly chip: HudChip;
  private g: Phaser.GameObjects.Graphics;
  private num: Phaser.GameObjects.Text;
  private unitT: Phaser.GameObjects.Text;
  private leanT: Phaser.GameObjects.Text;
  private last = '';
  static readonly W = 300;

  constructor(private scene: Phaser.Scene, x: number, y: number, private unit: string, private leanLabel: string) {
    this.g = scene.add.graphics();
    this.unitT = txt(scene, 0, 0, unit, { size: 15, color: '#c8cce0', strokeThickness: 0, shadow: false });
    this.leanT = txt(scene, 0, 0, leanLabel, { title: true, size: 15, color: '#ffffff', strokeThickness: 0, shadow: false });
    const panel = scene.add.container(0, 0, [this.g, this.leanT]);
    panel.setData('chipWidth', SpeedPanel.W);
    this.leanT.setPosition(-SpeedPanel.W / 2 + 30, 12);
    this.num = txt(scene, 0, -8, '0', { title: true, size: 30, color: '#ffffff', strokeThickness: 0, shadow: false });
    this.unitT.setPosition(0, 20);
    const speedBox = scene.add.container(0, 0, [this.num, this.unitT]);
    speedBox.setData('chipWidth', 96);
    this.chip = hudChip(scene, x, y, { align: 'center', items: [speedBox, panel], height: 78 });
  }

  /** `v` and the band in km/h; `lean` 0 … 1+; `max` the gauge's top. */
  set(v: number, bandMin: number, bandMax: number, lean: number, time: number, max = 140): void {
    const key = `${Math.round(v)}|${Math.round(bandMin)}|${Math.round(bandMax)}|${Math.round(lean * 50)}|${lean > 0.85 ? Math.floor(time * 8) % 2 : 0}`;
    if (key === this.last) return;
    this.last = key;
    this.num.setText(String(Math.max(0, Math.round(v))));
    const g = this.g.clear(), W = SpeedPanel.W, h = 14;
    const x0 = -W / 2;
    // speed bar
    g.fillStyle(0x000000, 0.4).fillRoundedRect(x0, -24, W, h, 7);
    const k = (u: number) => clamp(u / max, 0, 1) * W;
    if (bandMax > 0 || bandMin > 0) {
      const a = k(bandMin), b = bandMax > 0 ? k(bandMax) : W;
      g.fillStyle(0x3ad26a, 0.55).fillRect(x0 + a, -24, Math.max(4, b - a), h);
      if (bandMax > 0) g.fillStyle(0xffffff, 0.95).fillRect(x0 + b - 2, -28, 4, h + 8);
      if (bandMin > 0) g.fillStyle(0x7fe0ff, 0.95).fillRect(x0 + a - 2, -28, 4, h + 8);
    }
    const over = bandMax > 0 && v > bandMax;
    const under = bandMin > 0 && v < bandMin;
    g.fillStyle(over ? 0xff5a4f : under ? 0x7fe0ff : 0xffd23f, 1).fillRoundedRect(x0, -21, Math.max(8, k(v)), 8, 4);
    // lean meter
    const warn = lean > 0.85;
    const blink = warn && Math.floor(time * 8) % 2 === 0;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(x0 + 62, 4, W - 62, 16, 8);
    const lk = clamp(lean, 0, 1.15) / 1.15;
    const col = lean > 1 ? 0xff2a2a : warn ? (blink ? 0xff5a4f : 0xffffff) : lean > 0.6 ? 0xffb02a : 0x7dffa0;
    g.fillStyle(col, 1).fillRoundedRect(x0 + 62, 4, Math.max(10, (W - 62) * lk), 16, 8);
    g.fillStyle(0xffffff, 0.8).fillRect(x0 + 62 + (W - 62) / 1.15 - 1, 0, 3, 24);
    this.num.setColor(over ? '#ff7a6a' : '#ffffff');
    this.leanT.setColor(warn ? (blink ? '#ff7a6a' : '#ffffff') : '#ffffff');
    void this.unit; void this.leanLabel; void this.scene;
  }
}

/** One active power-up in the HUD: its icon inside a ring that runs down as it wears off. */
export interface PowerShown { id: string; icon: string; color: number; k: number; left: number; text?: string }

/** The active power-ups as a row of small chips, right-aligned (each with its timer ring). */
export class PowerBar {
  private chips = new Map<string, { chip: HudChip; ring: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Container; leaving: boolean }>();
  private order: string[] = [];
  left: number;

  constructor(private scene: Phaser.Scene, private x: number, private y: number) { this.left = x; }

  update(list: PowerShown[], time: number): void {
    const want = new Set(list.map((p) => p.id));
    for (const [id, c] of this.chips) {
      if (want.has(id) || c.leaving) continue;
      c.leaving = true;
      this.scene.tweens.add({ targets: c.chip, scale: 0.3, alpha: 0, duration: 200, ease: 'Back.easeIn', onComplete: () => { c.chip.destroy(); this.chips.delete(id); this.layout(); } });
    }
    for (const p of list) {
      let c = this.chips.get(p.id);
      if (c?.leaving) { this.scene.tweens.killTweensOf(c.chip); c.chip.destroy(); this.chips.delete(p.id); c = undefined; }
      if (!c) {
        const ring = this.scene.add.graphics();
        const icon = this.scene.add.image(0, 0, p.icon).setDisplaySize(30, 30);
        const badge = this.scene.add.container(0, 0, [ring, icon]);
        badge.setData('chipWidth', 42);
        const chip = hudChip(this.scene, this.x, this.y, { align: 'right', text: p.text ?? '', size: 22, color: '#ffffff', items: [badge] });
        c = { chip, ring, badge, leaving: false };
        this.chips.set(p.id, c);
        chip.setScale(0.3).setAlpha(0);
        this.scene.tweens.add({ targets: chip, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
        this.layout();
      }
      if (p.text !== undefined) { const before = c.chip.chipWidth; c.chip.setText(p.text); if (c.chip.chipWidth !== before) this.layout(); }
      const g = c.ring.clear();
      const warn = p.left > 0 && p.left < 2;
      const blink = warn ? 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(time * Math.PI * 6)) : 1;
      g.lineStyle(4, 0xffffff, 0.18).strokeCircle(0, 0, 19);
      const k = clamp(p.k, 0, 1);
      if (k > 0.001) g.lineStyle(4, p.color, blink).beginPath().arc(0, 0, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
    }
    const ids = list.map((p) => p.id);
    if (ids.join() !== this.order.join()) { this.order = ids; this.layout(); }
  }

  private layout(): void {
    let x = this.x;
    for (const id of this.order) {
      const c = this.chips.get(id);
      if (!c || c.leaving) continue;
      c.chip.setAnchor(x, this.y, 'right');
      x -= c.chip.chipWidth + HUD_GAP;
    }
    this.left = x + HUD_GAP;
  }
}

/** A big word that pops in and floats away. */
export function banner(scene: Phaser.Scene, x: number, y: number, s: string, o: { color?: string; size?: number; hold?: number; sub?: string; subColor?: string } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 50);
  const size = o.size ?? 54;
  c.add(fitWidth(labelAt(scene, 0, 0, s, calloutStyle(o.color ?? '#ffd23f')), 660, size / BANNER_PX));
  if (o.sub) c.add(fitWidth(labelAt(scene, 0, size * 0.55 + 22, o.sub, subStyle(o.subColor ?? '#ffffff')), 640));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 50, alpha: 0, delay: 220 + (o.hold ?? 0.8) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  return c;
}

/** The screen band the current centre banner covers (floating words keep out of it). */
const zone = { y0: 0, y1: 0, on: false };

/**
 * The centre banners, strictly one at a time: a new one waits until the current has been read a
 * moment (the current then goes at once), an urgent one (a derail) or a new area's title replaces
 * the current at once, and at most two wait. Short words never come here (popWord, below it).
 */
export class Banners {
  private cur: { c: Phaser.GameObjects.Container; pri: number; at: number; tag: string } | null = null;
  private queue: { s: string; o: Parameters<typeof banner>[4]; pri: number; tag: string }[] = [];

  constructor(private scene: Phaser.Scene, private x: number, private y: number) {}

  show(s: string, o: Parameters<typeof banner>[4] = {}, pri = 1, tag = ''): void {
    if (this.cur && this.cur.c.active) {
      const replace = (pri >= 3 && this.cur.pri < 3) || (tag && tag === this.cur.tag);
      if (replace) {
        this.drop();
        this.queue = this.queue.filter((q) => q.pri >= 2 && q.tag !== tag);
      } else {
        this.queue = this.queue.filter((q) => !tag || q.tag !== tag);
        this.queue.push({ s, o, pri, tag });
        this.queue.sort((a, b) => b.pri - a.pri);
        if (this.queue.length > 2) this.queue.length = 2;
        return;
      }
    }
    this.open(s, o, pri, tag);
  }

  private open(s: string, o: Parameters<typeof banner>[4], pri: number, tag: string): void {
    const c = banner(this.scene, this.x, this.y, s, o);
    this.cur = { c, pri, at: this.scene.time.now, tag };
    // the band at full size (the banner is still popping in): the title, and the line under it
    const size = o?.size ?? 54;
    zone.y0 = this.y - size * 0.8 - 10;
    zone.y1 = this.y + size * 0.8 + (o?.sub ? 62 : 10);
    zone.on = true;
  }

  /** The current banner goes at once (never two on screen together). */
  private drop(): void {
    const c = this.cur?.c;
    if (c && c.active) { this.scene.tweens.killTweensOf(c); c.destroy(); }
    this.cur = null;
    zone.on = false;
  }

  update(): void {
    if (this.cur && !this.cur.c.active) { this.cur = null; zone.on = false; }
    if (!this.queue.length) return;
    if (this.cur && this.scene.time.now - this.cur.at > 900) this.drop();
    if (!this.cur) { const n = this.queue.shift()!; this.open(n.s, n.o, n.pri, n.tag); }
  }

  clear(): void { this.drop(); this.queue = []; }
}

const words: { t: Phaser.GameObjects.Image; at: number }[] = [];

/**
 * A small word (points, a move, "ended"): a lane of its own. It keeps out of the centre banner's
 * band and of the other words (moving down), and at most three are in the air at once.
 */
export function popWord(scene: Phaser.Scene, x: number, y: number, s: string, color: string, size = 28): void {
  const now = scene.time.now;
  for (let i = words.length - 1; i >= 0; i--) if (!words[i].t.active || now - words[i].at > 900) words.splice(i, 1);
  // at most three words in the air at once: the oldest makes room
  while (words.length >= 3) { const w = words.shift()!; scene.tweens.killTweensOf(w.t); w.t.destroy(); }
  const gap = size * 1.5;
  for (let k = 0; k < 8; k++) {
    let moved = false;
    if (zone.on && y > zone.y0 - size && y < zone.y1 + size) { y = zone.y1 + size; moved = true; }
    for (const w of words) if (Math.abs(w.t.y - y) < gap && Math.abs(w.t.x - x) < 300) { y = w.t.y + gap; moved = true; }
    if (!moved) break;
  }
  y = Math.min(y, 900);
  const t = fitWidth(labelAt(scene, x, y, s, calloutStyle(color, WORD_PX)), scene.scale.width - 40, size / WORD_PX).setScrollFactor(0).setDepth(UI_DEPTH + 40);
  const k = t.scale;
  words.push({ t, at: now });
  t.setScale(k * 0.4).setAlpha(0);
  scene.tweens.add({ targets: t, scale: k, alpha: 1, duration: 150, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 520, duration: 380, onComplete: () => t.destroy() });
}

/** The tutorial's prompt: step count, what to do, a tick when done, and a SKIP pill. */
export class TutorialCard {
  readonly c: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Image | null = null;
  private body: Phaser.GameObjects.Text;
  private g: Phaser.GameObjects.Graphics;
  private tick: Phaser.GameObjects.Graphics;
  static readonly W = 660;

  constructor(private scene: Phaser.Scene, y: number, skipLabel: string, onSkip: () => void) {
    const s = scene;
    this.c = s.add.container(s.scale.width / 2, y).setScrollFactor(0).setDepth(UI_DEPTH + 30);
    this.g = s.add.graphics();
    this.body = txt(s, -TutorialCard.W / 2 + 28, 0, '', { size: 23, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: TutorialCard.W - 270, align: 'left' }).setOrigin(0, 0.5);
    this.tick = s.add.graphics().setVisible(false);
    const sg = s.add.graphics();
    sg.fillStyle(0xffffff, 0.14).fillRoundedRect(-70, -40, 140, 80, 40).lineStyle(2, 0xffffff, 0.4).strokeRoundedRect(-70, -40, 140, 80, 40);
    const st = txt(s, 0, 0, skipLabel, { title: true, size: 20, color: '#ffffff', strokeThickness: 0, shadow: false });
    const skip = s.add.container(TutorialCard.W / 2 - 88, 0, [sg, st]).setSize(150, 90).setInteractive({ useHandCursor: true });
    skip.on('pointerup', onSkip);
    this.c.add([this.g, this.body, this.tick, skip]);
  }

  set(head: string, body: string): void {
    this.body.setText(body);
    const h = Math.max(116, this.body.height + 64);
    // the heading in the theme's face (one painted label per step, cached)
    this.head?.destroy();
    this.head = labelAt(this.scene, -TutorialCard.W / 2 + 28, -h / 2 + 26, head, HEAD_STYLE, 0);
    this.c.addAt(this.head, 1);
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
    const t = this.tick.clear().setVisible(true).setPosition(TutorialCard.W / 2 - 202, 0);
    t.fillStyle(0x2fae5a, 1).fillCircle(0, 0, 30).lineStyle(7, 0xffffff, 1).beginPath().moveTo(-13, 0).lineTo(-3, 10).lineTo(14, -10).strokePath();
    t.setScale(0.3);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  destroy(): void {
    const c = this.c;
    this.scene.tweens.add({ targets: c, alpha: 0, y: c.y - 30, duration: 260, onComplete: () => c.destroy() });
  }
}

/** A one-line hint the first time something turns up: its icon, a heading and what it does. */
export class HintCard {
  readonly c: Phaser.GameObjects.Container;
  static readonly W = 640;

  constructor(private scene: Phaser.Scene, y: number, icon: string, head: string, body: string, hold = 3.6) {
    const s = scene, W = HintCard.W;
    this.c = s.add.container(s.scale.width / 2, y).setScrollFactor(0).setDepth(UI_DEPTH + 30);
    const ht = fitWidth(labelAt(s, -W / 2 + 104, 0, head, HEAD_STYLE, 0), W - 130);
    const bt = txt(s, -W / 2 + 104, 0, body, { size: 23, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: W - 130, align: 'left' }).setOrigin(0, 0.5);
    const h = Math.max(104, bt.height + 62);
    ht.setY(-h / 2 + 26);
    bt.setY(-h / 2 + 44 + bt.height / 2);
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.28).fillRoundedRect(-W / 2, -h / 2 + 6, W, h, 24);
    g.fillStyle(0x14112a, 0.9).fillRoundedRect(-W / 2, -h / 2, W, h, 24);
    g.lineStyle(3, 0x7fe0ff, 0.8).strokeRoundedRect(-W / 2, -h / 2, W, h, 24);
    g.fillStyle(0xffffff, 0.08).fillCircle(-W / 2 + 54, 0, 38);
    const ic = s.add.image(-W / 2 + 54, 0, icon).setDisplaySize(54, 54);
    this.c.add([g, ic, ht, bt]);
    this.c.setAlpha(0).setScale(0.85);
    s.tweens.add({ targets: this.c, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });
    s.tweens.add({ targets: this.c, alpha: 0, y: y - 24, delay: 240 + hold * 1000, duration: 320, onComplete: () => this.c.destroy() });
  }
}
