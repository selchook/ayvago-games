// Hex Realm: the game's own HUD pieces in the modern style (glass, rounded buttons; adapted from
// Skull Isle's): the health bar with the XP line under it, the power-up chips with their timer
// rings, the touch action buttons with icons and cooldown rings, the boss bar and the banners.
// Every always-visible readout sits in a core HUD chip.
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip, labelAt, labelTexture, fitWidth, shadeColor, glyphAtlas, type LabelStyle } from '@core';
import { icon } from './art';
import { FOE, POWER_IDS, POWER_COLOR, BOSS_KINDS, MINIBOSS_KINDS, PLACE_IDS } from './defs';

const HEART = icon('heart'), SKULL = icon('skull');

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
    this.heart = scene.add.image(0, 0, HEART).setDisplaySize(40, 40);
    this.heart.setData('chipWidth', 34);
    this.bar = scene.add.graphics();
    this.label = txt(scene, 0, -2, '', { title: true, size: 20, strokeThickness: 4 });
    const box = scene.add.container(0, 0, [this.bar, this.label]);
    box.setData('chipWidth', HpBar.W);
    this.chip = hudChip(scene, x, y, { items: [this.heart, box], height: 62, depth: UI_DEPTH });
  }

  /** XP towards the next level, 0–1 (a thin gold line under the bar). */
  xp = 0;

  update(hp: number, max: number, dt: number, time: number): void {
    const W = HpBar.W, H = 22;
    const k = Math.min(1, Math.max(0, hp / max));
    this.ghost = Math.max(k, this.ghost - dt * 0.6);
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.75).fillRoundedRect(-W / 2, -H / 2, W, H, 9);
    if (this.ghost > k) g.fillStyle(0xffffff, 0.55).fillRoundedRect(-W / 2, -H / 2, W * this.ghost, H, 9);
    const low = k < 0.3;
    const col = low ? (Math.floor(time * 6) % 2 ? 0xff3b3b : 0xff7a5a) : k < 0.6 ? 0xffc23f : 0x4fe07a;
    if (k > 0) g.fillStyle(col, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(18, W * k), H, 9);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-W / 2 + 3, -H / 2 + 2, Math.max(10, W * k - 6), 6, 3);
    g.fillStyle(0x060914, 0.75).fillRoundedRect(-W / 2, H / 2 + 4, W, 6, 3);
    if (this.xp > 0) g.fillStyle(0xffd23f, 1).fillRoundedRect(-W / 2, H / 2 + 4, Math.max(6, W * this.xp), 6, 3);
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
export class PowerChips<Id extends string> {
  private chips = new Map<Id, { chip: HudChip; ring: Phaser.GameObjects.Graphics; max: number }>();

  constructor(private scene: Phaser.Scene, private x: number, private y: number, private ids: readonly Id[], private art: (id: Id) => string, private color: (id: Id) => number) {}

  /** Clears every chip (the island's powers wait while the ship sails, and back). */
  clear(): void { for (const c of this.chips.values()) c.chip.destroy(); this.chips.clear(); }

  update(powers: Record<Id, number>, extra: { shieldHits: number }, time: number): void {
    let x = this.x;
    for (const id of this.ids) {
      const left = powers[id];
      let c = this.chips.get(id);
      if (left <= 0) {
        if (c) { c.chip.destroy(); this.chips.delete(id); }
        continue;
      }
      if (!c) {
        const ring = this.scene.add.graphics();
        const img = this.scene.add.image(0, 0, this.art(id)).setDisplaySize(44, 44);
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
      const col = this.color(id);
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
  slot(id: string): { x: number; y: number } {
    const c = this.chips.get(id as Id);
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
  icon: Phaser.GameObjects.Image | null;
  badge: Phaser.GameObjects.Text | null;
  down: boolean;
  pressed: boolean;
  zone: Phaser.GameObjects.Zone | null;
}

/**
 * A round action button drawn by the game (the core's A/B circles do the hit testing for ATTACK and DODGE).
 * `own` gives it its own touch zone: the battle reads `pressed` each frame; a menu button (the map's
 * HERO and MAP) passes `onTap`, called when a press is released on the button.
 */
export function actionButton(scene: Phaser.Scene, x: number, y: number, r: number, label: string, own: boolean, o: { badge?: boolean; size?: number; icon?: string; onTap?: () => void } = {}): ActionButton {
  const root = scene.add.container(x, y).setScrollFactor(0).setDepth(9520);
  const g = scene.add.graphics();
  const ic = o.icon ? scene.add.image(0, label ? -r * 0.18 : 0, o.icon).setDisplaySize(r * (label ? 1.05 : 1.4), r * (label ? 1.05 : 1.4)) : null;
  const lab = txt(scene, 0, ic ? r * 0.5 : 0, label, { title: true, size: o.size ?? 20, strokeThickness: 4 });
  if (lab.width > r * 1.8) lab.setScale((r * 1.8) / lab.width);
  root.add(ic ? [g, ic, lab] : [g, lab]);
  let badge: Phaser.GameObjects.Text | null = null;
  if (o.badge) {
    badge = txt(scene, r * 0.72, -r * 0.72, '', { title: true, size: 22, color: '#1a0c08', strokeThickness: 0, shadow: false });
    root.add(badge);
  }
  const b: ActionButton = { x, y, r, root, g, label: lab, icon: ic, badge, down: false, pressed: false, zone: null };
  if (own) {
    const zone = b.zone = scene.add.zone(x, y, r * 2.3, r * 2.3).setScrollFactor(0).setDepth(9519).setInteractive(new Phaser.Geom.Circle(r * 1.15, r * 1.15, r * 1.15), Phaser.Geom.Circle.Contains);
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev?.stopPropagation?.(); b.down = true; b.pressed = true; });
    zone.on('pointerup', () => {
      const tap = b.down;
      b.down = false;
      if (tap && o.onTap) { scene.tweens.add({ targets: root, scale: { from: 0.9, to: 1 }, duration: 160, ease: 'Back.easeOut' }); o.onTap(); }
    });
    zone.on('pointerout', () => { b.down = false; });
  }
  return b;
}

/** Shows or hides a button (and its own touch zone). */
export function showButton(b: ActionButton, on: boolean): void {
  if (b.root.visible === on) return;
  b.root.setVisible(on);
  if (b.zone) { if (on) b.zone.setInteractive(); else b.zone.disableInteractive(); }
  b.down = false; b.pressed = false;
}

/** Relabels a button (FIRE at sea, ATTACK ashore). */
export function relabel(b: ActionButton, label: string): void {
  if (b.label.text === label) return;
  b.label.setText(label).setScale(1);
  if (b.label.width > b.r * 1.8) b.label.setScale((b.r * 1.8) / b.label.width);
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
  b.icon?.setAlpha(o.dim ? 0.5 : 1);
  if (b.badge) b.badge.setAlpha(o.dim ? 0.6 : 1);
}

// ------------------------------------------------------------------ banners

const INK = '#1a1420';
const hex6 = (n: number): string => '#' + n.toString(16).padStart(6, '0');
/** The banners' gold, as the realm's titles (S_TITLE in screens.ts). */
export const BANNER_GOLD = '#ffd86a';

/** A banner's title in the realm's display face: a gradient from pale to the colour to its shade, inked. */
export function bannerStyle(color: string, size: number): LabelStyle {
  const c = parseInt(color.slice(1), 16);
  return { size, fill: [hex6(shadeColor(c, 0.78)), color, hex6(shadeColor(c, -0.32))], stroke: INK, strokeWidth: Math.round(size * 0.17) };
}
/** A banner's second line (the room, the foe's name) in the display face, parchment on ink. */
const S_BANNER_SUB: LabelStyle = { size: 28, color: '#fff2cc', stroke: INK, strokeWidth: 6 };
/** The boss's line under its name: a sentence, in the body font. */
const S_BOSS_SUB: LabelStyle = { size: 25, color: '#ffe6d8', stroke: INK, strokeWidth: 5, body: true };
const S_BOSS_NAME = bannerStyle('#ffb04a', 52);
/** A word floating up from someone in battle ("Blocked", "Low health!"). */
export function floatStyle(color: string, size: number): LabelStyle {
  // a lighter shade at the foot than the banners': small words stay bright over the grass
  const c = parseInt(color.slice(1), 16);
  return { size, fill: [hex6(shadeColor(c, 0.8)), color, hex6(shadeColor(c, -0.15))], stroke: INK, strokeWidth: Math.max(5, Math.round(size * 0.2)) };
}
/** The floating words of the battle, with their colour and size (PlayScene.floatAt). */
export const FLOATS: Record<string, [string, number]> = {
  lowHp: ['#ff7a6a', 28], blocked: ['#9ad8ff', 24], guardBreak: ['#9ad8ff', 28], sigil: ['#ff9aa8', 28], potion: ['#ff8a9a', 26],
};
/** Damage and healing numbers: a white glyph atlas the numbers tint (crits gold, hurt red, heals green). */
export const S_DMG: LabelStyle = { size: 40, fill: ['#ffffff', '#ffffff', '#d8d0c4'], stroke: INK, strokeWidth: 7 };

/** Paints the battle's banners and callouts ahead (the theme's prebake, under the intro). */
export function prebakeBanners(scene: Phaser.Scene): void {
  const gold = (s: string, size: number): void => { labelTexture(scene, s, bannerStyle(BANNER_GOLD, size)); };
  labelTexture(scene, t('ambush'), bannerStyle('#ff9a6a', 46));
  gold(t('campFight'), 46);
  for (const p of PLACE_IDS) gold(t('p_' + p), 46);
  for (let n = 1; n <= 10; n++) gold(t('enterRift', { n }), 46);
  for (let of = 2; of <= 5; of++) for (let n = 1; n <= of; n++) {
    labelTexture(scene, t('room', { n, of }), S_BANNER_SUB);
    if (n > 1) { gold(t('room', { n, of }), 48); gold(t('wave', { n, of }), 46); }
  }
  gold(t('lastStand'), 50);
  gold(t('victory'), 64);
  gold(t('tut_go'), 44);
  labelTexture(scene, t('roomClear'), bannerStyle('#a8ff9a', 44));
  for (const p of POWER_IDS) labelTexture(scene, t('pw_' + p), bannerStyle(hex6(POWER_COLOR[p]), 40));
  for (const k of Object.keys(FOE)) labelTexture(scene, t('f_' + k), S_BANNER_SUB);
  for (const k of [...BOSS_KINDS, ...MINIBOSS_KINDS]) { labelTexture(scene, t('f_' + k), S_BOSS_NAME); labelTexture(scene, t('bs_' + k), S_BOSS_SUB); }
  glyphAtlas(scene, S_DMG);
  for (const [k, [c, size]] of Object.entries(FLOATS)) labelTexture(scene, k === 'sigil' ? '+1 ' + t('sigil') : t(k), floatStyle(c, size));
}

// One banner at a time: a banner (or the boss's entrance) that comes while another is up waits
// in a short queue, in order (the place's name before its first wave), and the one up is cut short:
// once it has been readable for a moment it fades fast and the next pops in.

/** A banner on screen: its band (screen y, for words to keep out of) and how to cut it short. */
interface Shown { top: number; bottom: number; cut: () => void }
interface Lane { cur: Shown | null; queue: (() => Shown)[] }
const lanes = new WeakMap<Phaser.Scene, Lane>();
/** A banner shows at least this long (ms) before the next cuts it short; the cut fades this fast. */
const MIN_SHOW = 550, CUT_FADE = 150;
/** At most this many banners wait (the oldest waiting one gives way). */
const MAX_QUEUE = 3;

function laneOf(scene: Phaser.Scene): Lane {
  let l = lanes.get(scene);
  if (!l) {
    l = { cur: null, queue: [] };
    lanes.set(scene, l);
    // a restarted scene is the same object: start it with an empty lane
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => lanes.delete(scene));
  }
  return l;
}

function enqueue(scene: Phaser.Scene, make: (done: () => void) => Shown): void {
  const l = laneOf(scene);
  const start = (): void => {
    let shown: Shown | null = null;
    const done = (): void => {
      if (lanes.get(scene) !== l || l.cur !== shown) return;
      l.cur = null;
      const next = l.queue.shift();
      if (next) l.cur = next();
    };
    shown = make(done);
    l.cur = shown;
  };
  if (!l.cur) { start(); return; }
  if (l.queue.length >= MAX_QUEUE) l.queue.shift();
  l.queue.push(() => { start(); return l.cur!; });
  l.cur.cut();
}

/** The screen band of the banner up now (with room for its fly-out), or null. */
export function bannerBand(scene: Phaser.Scene): { top: number; bottom: number } | null {
  const c = lanes.get(scene)?.cur;
  return c ? { top: c.top, bottom: c.bottom } : null;
}

/**
 * Holds a shown banner, then fades it (`out`); `cut` brings the fade forward once the banner has
 * been up MIN_SHOW ms, and makes it quick. Calls `done` once, when it is gone.
 */
function holdThenFade(scene: Phaser.Scene, root: Phaser.GameObjects.Container, holdMs: number, out: (ms: number) => Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets'>, done: () => void): () => void {
  const born = scene.time.now;
  let fading = false;
  let timer: Phaser.Time.TimerEvent | null = null;
  const fade = (fast: boolean): void => {
    if (fading || !root.active) return;
    fading = true;
    timer?.remove();
    scene.tweens.add({ ...out(fast ? CUT_FADE : 380), targets: root, onComplete: () => { root.destroy(); done(); } });
  };
  timer = scene.time.delayedCall(holdMs, () => fade(false));
  return () => {
    if (fading) return;
    timer?.remove();
    timer = scene.time.delayedCall(Math.max(0, MIN_SHOW - (scene.time.now - born)), () => fade(true));
  };
}

/** A big title that pops in, holds and flies out (after the banner before it, see enqueue). */
export function banner(scene: Phaser.Scene, y: number, title: string, sub: string, o: { color?: string; hold?: number; size?: number } = {}): void {
  enqueue(scene, (done) => {
    const { width } = scene.scale;
    const size = o.size ?? 54;
    const c = scene.add.container(width / 2, y).setScrollFactor(0).setDepth(9400);
    const tt = fitWidth(labelAt(scene, 0, 0, title, bannerStyle(o.color ?? BANNER_GOLD, size)), width - 220);
    c.add(tt);
    let bottom = y + tt.displayHeight / 2;
    if (sub) {
      const st = fitWidth(labelAt(scene, 0, size * 0.62 + 22, sub, S_BANNER_SUB), width - 260);
      c.add(st);
      bottom = y + size * 0.62 + 22 + st.displayHeight / 2;
    }
    c.setScale(0.3).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    const cut = holdThenFade(scene, c, 300 + (o.hold ?? 1.2) * 1000, (ms) => ({ alpha: 0, y: y - 40, duration: ms, ease: 'Quad.easeIn' }), done);
    return { top: y - tt.displayHeight / 2 - 40, bottom, cut };
  });
}

/** The boss's entrance: dark bands sweep in with a skull, the boss's name and what to do. */
export function bossIntro(scene: Phaser.Scene, name: string, sub: string): void {
  enqueue(scene, (done) => showBossIntro(scene, name, sub, done));
}

function showBossIntro(scene: Phaser.Scene, name: string, sub: string, done: () => void): Shown {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(9400);
  const tint = scene.add.rectangle(0, 0, width, height, 0x200010, 0).setOrigin(0);
  scene.tweens.add({ targets: tint, fillAlpha: 0.3, duration: 300, yoyo: true, hold: 1600 });
  const y = height * 0.36;
  const band = scene.add.graphics();
  band.fillStyle(0x12060a, 0.88).fillRect(0, y - 100, width, 200);
  band.fillStyle(0xd9a93a, 1).fillRect(0, y - 100, width, 6).fillRect(0, y + 94, width, 6);
  const skull = scene.add.image(width / 2, y - 58, SKULL).setDisplaySize(72, 72);
  const n = fitWidth(labelAt(scene, width / 2, y + 10, name, S_BOSS_NAME), width - 200);
  const s = fitWidth(labelAt(scene, width / 2, y + 64, sub, S_BOSS_SUB), width - 160);
  root.add([tint, band, skull, n, s]);
  band.setAlpha(0);
  scene.tweens.add({ targets: band, alpha: 1, duration: 220 });
  const ns = n.scale;
  n.setScale(ns * 2.2).setAlpha(0);
  scene.tweens.add({ targets: n, scale: ns, alpha: 1, duration: 320, ease: 'Back.easeOut', delay: 120 });
  skull.setScale(0).setAngle(-30);
  scene.tweens.add({ targets: skull, displayWidth: 72, displayHeight: 72, angle: 0, duration: 380, ease: 'Back.easeOut', delay: 60 });
  s.setAlpha(0);
  scene.tweens.add({ targets: s, alpha: 1, duration: 300, delay: 420 });
  const cut = holdThenFade(scene, root, 2600, (ms) => ({ alpha: 0, duration: ms === CUT_FADE ? ms : 420 }), done);
  return { top: y - 100, bottom: y + 100, cut };
}
