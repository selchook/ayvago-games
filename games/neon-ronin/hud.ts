// Neon Ronin: the play HUD and the touch pad.
//   - Readouts in the core's HUD chips (new-game skill §4): health cells, blaster heat, gears, data
//     chips, the level clock, the combo and the implants; the boss bar takes the level badge's place.
//   - Touch (landscape thumbs): the core's floating stick on the left half; JUMP, SLASH, SHOOT and
//     ROLL in an arc under the right thumb, neon discs painted once with their labels; every finger
//     is read, so run + jump + slash work together. SLASH fills a ring while the cleave charges.
import Phaser from 'phaser';
import { t, upper, hudChip, labelAt, labelTexture, bake, HUD_MARGIN, HUD_GAP, HUD_ROW_Y, HUD_ROW2_Y, type HudChip, type LabelStyle } from '@core';
import { icon } from './art';
import { INK } from './palette';

const BTN_LABEL: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const BOSS_LABEL: LabelStyle = { size: 20, color: '#ff8aa0', stroke: INK, strokeWidth: 4 };
/** The boss bar: a third row under the HUD's two (the level badge stays). */
const BOSS_Y = HUD_ROW2_Y + 60;

export type PadId = 'jump' | 'attack' | 'shoot' | 'roll';
interface PadDef { id: PadId; x: number; y: number; r: number; color: number; label: string; icon: string }
/** Sized for 1280 × 720 shown on 720 × 405 to 844 × 390 phones. */
export const PAD: PadDef[] = [
  { id: 'jump', x: 1172, y: 604, r: 78, color: 0x7cff6a, label: 'btnJump', icon: 'jump' },
  { id: 'attack', x: 1010, y: 640, r: 70, color: 0x3ff0ff, label: 'btnAttack', icon: 'sword' },
  { id: 'shoot', x: 1032, y: 482, r: 58, color: 0xff3fa8, label: 'btnShoot', icon: 'blaster' },
  { id: 'roll', x: 1180, y: 424, r: 58, color: 0xffe040, label: 'btnRoll', icon: 'roll' },
];

const discKey = (d: PadDef, on: boolean): string => `nr-pad-${d.id}-${on ? 1 : 0}`;

/** Paints the pad's discs and labels (Boot, under the intro). */
export function prebakeHud(scene: Phaser.Scene): void {
  for (const d of PAD) {
    for (const on of [false, true]) {
      const s = d.r * 2 + 24;
      bake(scene, discKey(d, on), s, s, (c) => {
        const cx = s / 2, R = d.r;
        const col = `#${d.color.toString(16).padStart(6, '0')}`;
        c.save();
        c.shadowColor = col; c.shadowBlur = on ? 22 : 10;
        c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2);
        c.fillStyle = on ? 'rgba(30,14,50,0.85)' : 'rgba(10,6,22,0.55)'; c.fill();
        c.restore();
        c.lineWidth = on ? 5 : 3.5; c.strokeStyle = col;
        c.beginPath(); c.arc(cx, cx, R - 2, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 0.45; c.lineWidth = 1.5;
        c.beginPath(); c.arc(cx, cx, R - 9, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        if (on) { const g = c.createRadialGradient(cx, cx, 0, cx, cx, R); g.addColorStop(0, `${col}66`); g.addColorStop(1, `${col}00`); c.fillStyle = g; c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2); c.fill(); }
      });
    }
    labelTexture(scene, t(d.label), BTN_LABEL);
  }
  for (const k of ['lv_1-4', 'lv_2-4', 'lv_3-4', 'lv_4-4']) labelTexture(scene, upper(t(k)), BOSS_LABEL);
}

interface Btn { d: PadDef; disc: Phaser.GameObjects.Image; down: boolean; was: boolean; ptr: number }

export class TouchPad {
  private btns: Btn[] = [];
  private ring: Phaser.GameObjects.Graphics;
  charge = 0;

  constructor(private scene: Phaser.Scene) {
    scene.input.addPointer(3);
    for (const d of PAD) {
      const disc = scene.add.image(d.x, d.y, discKey(d, false)).setScrollFactor(0).setDepth(9400).setAlpha(0.92);
      const ic = scene.add.image(d.x, d.y - d.r * 0.2, icon(d.icon)).setScrollFactor(0).setDepth(9401);
      ic.setScale((d.r * 0.82) / ic.height);
      const lb = labelAt(scene, d.x, d.y + d.r * 0.42, t(d.label), BTN_LABEL).setScrollFactor(0).setDepth(9401);
      if (lb.width > d.r * 1.7) lb.setScale((d.r * 1.7) / lb.width);
      const b: Btn = { d, disc, down: false, was: false, ptr: -1 };
      disc.setInteractive(new Phaser.Geom.Circle(disc.width / 2, disc.height / 2, d.r + 10), Phaser.Geom.Circle.Contains);
      disc.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev?.stopPropagation?.(); b.down = true; b.ptr = p.id; this.look(b); });
      const up = (p: Phaser.Input.Pointer) => { if (p.id === b.ptr || !p.isDown) { b.down = false; b.ptr = -1; this.look(b); } };
      disc.on('pointerup', up);
      disc.on('pointerout', up);
      scene.input.on('pointerup', up);
      this.btns.push(b);
    }
    this.ring = scene.add.graphics().setScrollFactor(0).setDepth(9402);
  }

  private look(b: Btn): void { b.disc.setTexture(discKey(b.d, b.down)); b.disc.setScale(b.down ? 0.94 : 1); }

  held(id: PadId): boolean { return this.btns.find((b) => b.d.id === id)!.down; }
  /** Pressed since the last call of `frame()`. */
  pressed(id: PadId): boolean { const b = this.btns.find((x) => x.d.id === id)!; return b.down && !b.was; }
  /** Call once per frame after reading the presses. */
  frame(): void {
    for (const b of this.btns) b.was = b.down;
    const a = PAD[1];
    this.ring.clear();
    if (this.charge > 0) this.ring.lineStyle(7, this.charge >= 1 ? 0xff3fa8 : 0x3ff0ff, 1).beginPath().arc(a.x, a.y, a.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.charge)).strokePath();
  }

  setVisible(v: boolean): void {
    for (const b of this.btns) { b.disc.setVisible(v); if (!v) { b.down = false; b.ptr = -1; this.look(b); } }
    // the icons and labels sit just above their discs
    for (const o of this.scene.children.list) {
      const d = (o as unknown as { depth: number }).depth;
      if (d === 9401) (o as unknown as Phaser.GameObjects.Image).setVisible(v);
    }
    this.ring.setVisible(v);
  }
}

// ---------------------------------------------------------------- bars in chips

/** Health cells (lime) in a chip; lost cells dark, the last one blinks. */
export class HpChip {
  readonly chip: HudChip;
  private g: Phaser.GameObjects.Graphics;
  private hp = -1;
  private max = -1;
  private shield = false;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.g = scene.add.graphics();
    this.g.setData('chipWidth', 120);
    this.chip = hudChip(scene, x, y, { icon: icon('hp'), iconSize: 30, items: [this.g], minWidth: 150 });
  }

  set(hp: number, max: number, shield: boolean, time: number): void {
    const blink = hp <= 1 && max > 1 && Math.floor(time * 4) % 2 === 0;
    const key = hp + ':' + max + ':' + shield + ':' + blink;
    if (this.g.getData('k') === key) return;
    this.g.setData('k', key);
    const grew = max > this.max && this.max > 0;
    this.hp = hp; this.max = max; this.shield = shield;
    const cw = Math.min(26, Math.floor(150 / Math.max(1, max)) - 4), gap = 4;
    const w = max * (cw + gap) - gap;
    this.g.setData('chipWidth', w + (shield ? 18 : 0));
    this.g.clear();
    const x0 = -w / 2;
    for (let i = 0; i < max; i++) {
      const full = i < Math.ceil(hp);
      const col = full ? (hp <= 1 ? (blink ? 0xff8a8a : 0xff3a5a) : 0x7cff6a) : 0x2a2440;
      this.g.fillStyle(col, 1).fillRect(x0 + i * (cw + gap), -9, cw, 18);
      if (full) this.g.fillStyle(0xffffff, 0.35).fillRect(x0 + i * (cw + gap), -9, cw, 5);
    }
    if (shield) this.g.lineStyle(3, 0x3ff0ff, 1).strokeCircle(x0 + w + 12, 0, 8);
    this.chip.layout();
    if (grew) this.scene.tweens.add({ targets: this.chip, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  pulse(): void { this.scene.tweens.add({ targets: this.chip, scale: { from: 1.2, to: 1 }, duration: 260 }); }
}

/** The blaster's heat: a bar from cyan through yellow to red; locked, it blinks. */
export class HeatChip {
  readonly chip: HudChip;
  private g: Phaser.GameObjects.Graphics;
  private last = -1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.g = scene.add.graphics();
    this.g.setData('chipWidth', 96);
    this.chip = hudChip(scene, x, y, { icon: icon('heat'), iconSize: 28, items: [this.g], minWidth: 132 });
  }

  set(heat: number, hot: boolean, coolant: boolean, time: number): void {
    const k = Math.round(heat) + (hot ? 1000 : 0) + (coolant ? 2000 : 0) + (hot && Math.floor(time * 8) % 2 ? 5000 : 0);
    if (k === this.last) return;
    this.last = k;
    const w = 96, f = Math.max(0, Math.min(1, heat / 100));
    const g = this.g;
    g.clear();
    g.fillStyle(0x1a1530, 1).fillRect(-w / 2, -8, w, 16);
    const col = coolant ? 0x3ff0ff : hot ? (Math.floor(time * 8) % 2 ? 0xff3a5a : 0x801020) : f < 0.5 ? 0x3ff0ff : f < 0.8 ? 0xffe040 : 0xff6a3a;
    g.fillStyle(col, 1).fillRect(-w / 2, -8, w * (coolant ? 1 : f), 16);
    g.lineStyle(1.5, 0xffffff, 0.5).strokeRect(-w / 2, -8, w, 16);
    for (let i = 1; i < 4; i++) g.lineStyle(1, 0x05030f, 0.6).lineBetween(-w / 2 + i * w / 4, -8, -w / 2 + i * w / 4, 8);
  }
}

/** The boss's health across the top centre, its name painted above. */
export class BossBar {
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Image;
  private shown = 0;
  readonly chip: HudChip;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics();
    this.g.setData('chipWidth', 380);
    this.chip = hudChip(scene, scene.scale.width / 2, BOSS_Y, { align: 'center', icon: icon('boss'), iconSize: 30, items: [this.g], minWidth: 440 });
    this.name = labelAt(scene, scene.scale.width / 2, BOSS_Y + 36, '', BOSS_LABEL).setScrollFactor(0).setDepth(9001);
    this.root = scene.add.container(0, 0);
    this.chip.setVisible(false);
    this.name.setVisible(false);
  }

  get active(): boolean { return this.chip.visible; }

  show(name: string): void {
    this.chip.setVisible(true);
    this.name.setTexture(labelTexture(this.scene, upper(name), BOSS_LABEL)).setVisible(true);
    this.chip.setScale(0.6);
    this.scene.tweens.add({ targets: this.chip, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  hide(): void { this.chip.setVisible(false); this.name.setVisible(false); }

  set(hp: number, max: number, vent: boolean, dt: number): void {
    const f = Math.max(0, hp / max);
    this.shown = this.shown > f ? Math.max(f, this.shown - dt * 0.6) : f;
    const w = 380, g = this.g;
    g.clear();
    g.fillStyle(0x1a1020, 1).fillRect(-w / 2, -9, w, 18);
    g.fillStyle(0xffffff, 0.8).fillRect(-w / 2, -9, w * this.shown, 18);
    g.fillStyle(vent ? 0xffe040 : 0xff3a5a, 1).fillRect(-w / 2, -9, w * f, 18);
    for (const k of [1 / 3, 2 / 3]) g.lineStyle(2, 0x05030f, 1).lineBetween(-w / 2 + w * k, -9, -w / 2 + w * k, 9);
    g.lineStyle(1.5, 0xff8aa0, 0.8).strokeRect(-w / 2, -9, w, 18);
  }

  destroy(): void { this.root.destroy(); }
}

export { HUD_MARGIN, HUD_GAP, HUD_ROW2_Y };
