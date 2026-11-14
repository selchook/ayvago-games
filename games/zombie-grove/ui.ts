// Zombie Grove: the game's own UI pieces in the modern style (glass, rounded buttons): the health
// bar, the level and XP chip, the weapon tray with level pips, the boss bar and the banners. Every
// always-visible readout sits in a core HUD chip.
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip } from '@core';
import { MAX_LEVEL, type WeaponId, type PassiveId } from './defs';
import { weaponArt, passiveArt, HEART } from './art';
import type { OwnedWeapon, OwnedPassive } from './cards';

export const UI_DEPTH = 9100;

/** A glass panel centred on (0, 0) of a container. */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x14201a, o.alpha ?? 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
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

  setIcon(key: string | null, size = 24): this {
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
    this.main.y = sub ? -12 : 0;
    this.sub.y = 20;
    this.sub.setVisible(!!sub);
    if (this.icon) {
      this.icon.setVisible(!!sub);
      const w = this.sub.width + 28;
      this.icon.setPosition(-w / 2 + 12, 20);
      this.sub.x = 14;
    } else this.sub.x = 0;
    if (this.main.width > this.w - 16) this.main.setScale((this.w - 16) / this.main.width);
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
  static W = 170;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.heart = scene.add.image(0, 0, HEART).setDisplaySize(34, 34);
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
    if (n !== this.shown) {
      if (n < this.shown) this.scene.tweens.add({ targets: this.chip, scale: 1.07, duration: 70, yoyo: true });
      this.shown = n;
      this.label.setText(String(Math.max(0, n)));
    }
    this.heart.setScale((34 / this.heart.width) * (low ? 1 + Math.max(0, Math.sin(time * 9)) * 0.2 : 1));
  }
}

// ------------------------------------------------------------------ level and XP

export class XpChip {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private shown = 0;
  private flashT = 0;
  static W = 190;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', XpChip.W);
    this.chip = hudChip(scene, x, y, { text: t('hudLv', { n: 1 }), color: '#fff07a', items: [this.bar], minWidth: 120, depth: UI_DEPTH });
  }

  /** k: 0–1 of the way to the next level. */
  update(level: number, k: number, dt: number, time: number): void {
    if (level !== this.shown) {
      if (this.shown) { this.flashT = 0.6; this.scene.tweens.add({ targets: this.chip, scale: 1.15, duration: 120, yoyo: true }); }
      this.shown = level;
      this.chip.setText(t('hudLv', { n: level }));
    }
    this.flashT = Math.max(0, this.flashT - dt);
    const W = XpChip.W, H = 16;
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.75).fillRoundedRect(-W / 2, -H / 2, W, H, 7);
    if (k > 0) g.fillStyle(this.flashT > 0 ? 0xffffff : 0x5affb0, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(12, W * k), H, 7);
    g.fillStyle(0xffffff, 0.3 + 0.1 * Math.sin(time * 3)).fillRoundedRect(-W / 2 + 3, -H / 2 + 2, Math.max(6, W * k - 6), 4, 2);
  }
}

// ------------------------------------------------------------------ the weapon tray

const SLOT = 52;

/** The weapons (and trinkets) carried, as small icons with level pips, in a HUD chip. */
export class WeaponTray {
  readonly chip: HudChip;
  private row: Phaser.GameObjects.Container;
  private sig = '';

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.row = scene.add.container(0, 0);
    this.row.setData('chipWidth', SLOT);
    this.chip = hudChip(scene, x, y, { align: 'center', items: [this.row], height: 64, minWidth: 64, depth: UI_DEPTH });
  }

  sync(weapons: OwnedWeapon[], passives: OwnedPassive[]): void {
    const sig = weapons.map((w) => w.id + w.lv + w.evo).join() + '|' + passives.map((p) => p.id + p.lv).join();
    if (sig === this.sig) return;
    const grew = this.sig !== '';
    this.sig = sig;
    this.row.removeAll(true);
    const items: { key: string; lv: number; evo: boolean; small: boolean }[] = [
      ...weapons.map((w) => ({ key: weaponArt(w.id as WeaponId, w.evo), lv: w.lv, evo: w.evo, small: false })),
      ...passives.map((p) => ({ key: passiveArt(p.id as PassiveId), lv: p.lv, evo: false, small: true })),
    ];
    let x = 0;
    const xs: number[] = [];
    items.forEach((it) => { xs.push(x + (it.small ? 17 : SLOT / 2)); x += it.small ? 36 : SLOT + 2; });
    const total = x;
    items.forEach((it, i) => {
      const cx = xs[i] - total / 2;
      const s = it.small ? 30 : 46;
      const img = this.scene.add.image(cx, it.small ? -4 : -6, it.key).setDisplaySize(s, s);
      this.row.add(img);
      // level pips
      if (!it.evo) {
        const pips = this.scene.add.graphics();
        const n = MAX_LEVEL, pw = it.small ? 4 : 6, gap = 2;
        const w0 = n * pw + (n - 1) * gap;
        for (let k = 0; k < n; k++) {
          pips.fillStyle(k < it.lv ? (it.small ? 0x9fe8ff : 0xfff07a) : 0x2a3340, 1).fillRoundedRect(cx - w0 / 2 + k * (pw + gap), it.small ? 14 : 20, pw, 5, 2);
        }
        this.row.add(pips);
      } else {
        this.row.add(txt(this.scene, cx, 20, '★', { size: 14, color: '#ffd23f', strokeThickness: 3 }));
      }
    });
    this.row.setData('chipWidth', Math.max(SLOT, total));
    this.chip.layout();
    if (grew) this.scene.tweens.add({ targets: this.chip, scale: 1.08, duration: 110, yoyo: true });
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
    this.chip = hudChip(scene, x, y, { align: 'center', text: '', size: 18, color: '#ffb0a0', items: [this.bar], depth: UI_DEPTH });
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

  update(k: number, rage: boolean, dt: number, time: number): void {
    const W = BossBar.W, H = 16;
    this.ghost = Math.max(k, this.ghost - dt * 0.4);
    const g = this.bar.clear();
    g.fillStyle(0x060914, 0.8).fillRoundedRect(-W / 2, -H / 2, W, H, 7);
    g.fillStyle(0xffffff, 0.5).fillRoundedRect(-W / 2, -H / 2, W * this.ghost, H, 7);
    if (k > 0) g.fillStyle(rage ? 0xff2f6a : 0x9aff5a, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(14, W * k), H, 7);
    if (rage) g.lineStyle(2, 0xff5a8a, 0.5 + 0.4 * Math.sin(time * 8)).strokeRoundedRect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4, 9);
  }
}

// ------------------------------------------------------------------ banners

/** A big title that pops in, holds and flies out. */
export function banner(scene: Phaser.Scene, y: number, title: string, sub: string, o: { color?: string; hold?: number; size?: number } = {}): void {
  const { width } = scene.scale;
  const c = scene.add.container(width / 2, y).setScrollFactor(0).setDepth(9400);
  const tt = txt(scene, 0, 0, title, { title: true, size: o.size ?? 54, color: o.color ?? '#ffffff', strokeThickness: 9, wrap: 660 });
  c.add(tt);
  if (sub) c.add(txt(scene, 0, tt.height / 2 + 26, sub, { size: 26, color: '#eef4e6', strokeThickness: 5, wrap: 640 }));
  c.setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: (o.hold ?? 1.2) * 1000, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
}

/** The boss warning: red bands sweep across with WARNING and the boss's name. */
export function bossWarning(scene: Phaser.Scene, name: string): void {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(9400);
  const tint = scene.add.rectangle(0, 0, width, height, 0xff1030, 0).setOrigin(0);
  scene.tweens.add({ targets: tint, fillAlpha: 0.14, duration: 260, yoyo: true, repeat: 4 });
  const y = height * 0.33;
  const band = scene.add.graphics();
  band.fillStyle(0x1a0806, 0.85).fillRect(0, y - 92, width, 184);
  band.fillStyle(0xff3a2a, 1).fillRect(0, y - 92, width, 8).fillRect(0, y + 84, width, 8);
  const stripes = scene.add.graphics();
  for (let i = -2; i < 26; i++) {
    stripes.fillStyle(i % 2 ? 0xff3a2a : 0x1a0806, 1);
    stripes.fillPoints([new Phaser.Math.Vector2(i * 40, y - 92), new Phaser.Math.Vector2(i * 40 + 20, y - 92), new Phaser.Math.Vector2(i * 40 + 4, y - 76), new Phaser.Math.Vector2(i * 40 - 16, y - 76)], true);
    stripes.fillPoints([new Phaser.Math.Vector2(i * 40, y + 76), new Phaser.Math.Vector2(i * 40 + 20, y + 76), new Phaser.Math.Vector2(i * 40 + 4, y + 92), new Phaser.Math.Vector2(i * 40 - 16, y + 92)], true);
  }
  const w = txt(scene, width / 2, y - 22, t('warning'), { title: true, size: 70, color: '#ff4a3a', strokeThickness: 10 });
  const n = txt(scene, width / 2, y + 44, name + ' ' + t('bossComing'), { title: true, size: 32, color: '#ffe6d8', strokeThickness: 6, wrap: 660 });
  root.add([tint, band, stripes, w, n]);
  band.setAlpha(0);
  scene.tweens.add({ targets: band, alpha: 1, duration: 200 });
  stripes.setX(-width);
  scene.tweens.add({ targets: stripes, x: 0, duration: 300, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: stripes, x: 40, duration: 400, repeat: -1, delay: 300 });
  w.setScale(2).setAlpha(0);
  scene.tweens.add({ targets: w, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: w, alpha: 0.35, duration: 220, yoyo: true, repeat: 5, delay: 300 });
  scene.tweens.add({ targets: root, alpha: 0, delay: 2700, duration: 400, onComplete: () => root.destroy() });
}
