// The throw's HUD: the aim chip (stand board → target board), the spin control (a ball with a
// curved arrow that grows and bends with the hook, ◀ ▶ to step it), the speed readout in km/h,
// the lane-view button, the oil readout and the coaching tip. Every readout sits in a HUD chip;
// the buttons are interactive, so a tap on them never starts a swipe on the lane.
import Phaser from 'phaser';
import { t, hudChip, HudChip, hudText, getLang } from '@core';
import { ARROWS } from './aim';

const fmtBoard = (v: number): string => {
  const b = Math.round(v * 2) / 2;
  return b % 1 ? `${Math.floor(b) || ''}½` : String(b);
};

/** Stand board → target board, the stage the keys move highlighted. */
export class AimChip {
  readonly chip: HudChip;
  private stand: Phaser.GameObjects.Text;
  private arrow: Phaser.GameObjects.Text;
  private target: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.stand = hudText(scene, '', 24);
    this.arrow = hudText(scene, '→', 24, '#9ff3ff');
    this.target = hudText(scene, '', 24);
    this.chip = hudChip(scene, x, y, { align: 'center', items: [this.stand, this.arrow, this.target], minWidth: 320 });
  }

  set(stand: number, target: number, stage: 'stand' | 'target' | null): void {
    this.stand.setText(t('aimStand', { n: fmtBoard(stand) }));
    const onArrow = ARROWS.includes(target);
    this.target.setText(t(onArrow ? 'aimArrow' : 'aimBoard', { n: fmtBoard(target) }));
    // the stage the keys move is lit and underlined; the other one dims
    const on = '#ffd23f', off = stage ? '#aab4dd' : '#ffffff';
    this.stand.setColor(stage === 'stand' ? on : off);
    this.target.setColor(stage === 'target' ? on : stage ? off : onArrow ? '#7dff9a' : '#ffffff');
    this.stand.setText(stage === 'stand' ? `▸ ${this.stand.text}` : this.stand.text);
    this.target.setText(stage === 'target' ? `▸ ${this.target.text}` : this.target.text);
    this.chip.layout();
  }
}

/** A round icon button in a chip (◀ ▶, the lane view): calls back on tap. */
function tapZone(scene: Phaser.Scene, obj: Phaser.GameObjects.Text, w: number, h: number, onTap: () => void): void {
  // a text's hit area is in its own frame (top-left corner at 0, 0): centre the zone on the glyph
  obj.setInteractive(new Phaser.Geom.Rectangle(obj.width / 2 - w / 2, obj.height / 2 - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  (obj as unknown as Phaser.GameObjects.GameObject).on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e?.stopPropagation?.();
    onTap();
  });
}

/** Draws the spin icon: a ball and its path leaving it, straight or hooking (wider for more spin). */
export function drawSpin(g: Phaser.GameObjects.Graphics, hook: number, r = 11): void {
  g.clear();
  const a = Math.abs(hook);
  const col = a > 0.66 ? 0xff3fa4 : a > 0.33 ? 0xffd23f : a > 0.04 ? 0x7dff9a : 0xffffff;
  // the ball, with its three holes
  const by = 20;
  g.fillStyle(0x2638ff, 1).fillCircle(0, by, r);
  g.lineStyle(2, 0xffffff, 0.75).strokeCircle(0, by, r);
  g.fillStyle(0x0a0a20, 1).fillCircle(-2.6, by - 4, 2).fillCircle(2.6, by - 4, 2).fillCircle(0, by + 1.5, 2.4);
  // the path: out a little the other way, then hooking (left for +), like the ball on the lane
  const dir = hook > 0.04 ? -1 : hook < -0.04 ? 1 : 0;
  const pts: Phaser.Math.Vector2[] = [];
  const y0 = by - r - 2, len = 34;
  for (let k = 0; k <= 14; k++) {
    const s = k / 14;
    const x = dir * a * (16 * s * s * s - 5 * s);
    pts.push(new Phaser.Math.Vector2(x, y0 - s * len));
  }
  g.lineStyle(3 + a * 2, col, 1).strokePoints(pts);
  const e = pts[14], p = pts[11];
  const ang = Math.atan2(e.y - p.y, e.x - p.x);
  const hs = 7 + a * 2;
  g.fillStyle(col, 1).fillTriangle(
    e.x + Math.cos(ang) * hs, e.y + Math.sin(ang) * hs,
    e.x + Math.cos(ang + 2.4) * hs, e.y + Math.sin(ang + 2.4) * hs,
    e.x + Math.cos(ang - 2.4) * hs, e.y + Math.sin(ang - 2.4) * hs,
  );
}

/** The spin control: ◀ [ball + curve, "HOOK LEFT 50%"] ▶. */
export class SpinControl {
  readonly chip: HudChip;
  private icon: Phaser.GameObjects.Graphics;
  private left: Phaser.GameObjects.Text;
  private right: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, onStep: (dir: number) => void) {
    this.left = hudText(scene, '◀', 30, '#9ff3ff');
    this.right = hudText(scene, '▶', 30, '#9ff3ff');
    this.icon = scene.add.graphics();
    this.icon.setData('chipWidth', 40);
    this.label = hudText(scene, '', 21);
    this.left.setData('chipWidth', 40);
    this.right.setData('chipWidth', 40);
    this.chip = hudChip(scene, x, y, { items: [this.left, this.icon, this.label, this.right], height: 76, minWidth: 300 });
    tapZone(scene, this.left, 84, 84, () => onStep(1));
    tapZone(scene, this.right, 84, 84, () => onStep(-1));
  }

  set(hook: number): void {
    drawSpin(this.icon, hook);
    const n = Math.round(Math.abs(hook) * 100);
    this.label.setText(Math.abs(hook) < 0.04 ? t('spinStraight') : hook > 0 ? t('spinLeft', { n }) : t('spinBackup', { n }));
    this.chip.layout();
  }
}

/** Ball speed: a bar and km/h. */
export class SpeedChip {
  readonly chip: HudChip;
  private bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', 120);
    this.chip = hudChip(scene, x, y, { align: 'right', label: t('speed'), items: [this.bar], height: 76, minWidth: 250, size: 24 });
  }

  /** k: 0..1 along the speed range; live: still being chosen (the sweet spot shows). */
  set(kmh: number, k: number, live: boolean): void {
    const g = this.bar;
    g.clear();
    const w = 120, h = 14;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2, w, h, 7);
    const col = Phaser.Display.Color.HSLToColor(0.33 - k * 0.33, 0.95, 0.55).color;
    g.fillStyle(col, live ? 1 : 0.75).fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * k), h, 7);
    g.lineStyle(2, 0xffffff, 0.8).lineBetween(-w / 2 + w * 0.62, -h / 2 - 3, -w / 2 + w * 0.62, h / 2 + 3);
    this.chip.setText(t('kmh', { n: Math.round(kmh) }));
  }
}

/** A small chip button with a drawn eye icon: the lane view on and off. */
export class LaneViewButton {
  readonly chip: HudChip;
  private icon: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, onTap: () => void) {
    this.icon = scene.add.graphics();
    this.icon.setData('chipWidth', 30);
    this.chip = hudChip(scene, x, y, { label: t('laneView'), items: [this.icon], height: 56, size: 22 });
    this.chip.setSize(this.chip.chipWidth + 20, 76);
    this.chip.setInteractive(new Phaser.Geom.Rectangle(-10, -38, this.chip.chipWidth + 20, 76), Phaser.Geom.Rectangle.Contains);
    this.chip.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e?.stopPropagation?.(); onTap(); });
    this.set(false);
  }

  set(on: boolean): void {
    const g = this.icon;
    g.clear();
    const c = on ? 0xffd23f : 0xffffff;
    g.lineStyle(3, c, 1);
    g.beginPath();
    g.arc(0, 8, 13, Math.PI * 1.18, Math.PI * 1.82);
    g.strokePath();
    g.beginPath();
    g.arc(0, -8, 13, Math.PI * 0.18, Math.PI * 0.82);
    g.strokePath();
    g.fillStyle(c, 1).fillCircle(0, 0, on ? 5 : 3.5);
    this.chip.setTextColor(on ? '#ffd23f' : '#ffffff');
    this.chip.caption?.setColor(on ? '#ffd23f' : '#ffffff');
  }
}

/** Oil length readout, e.g. "OIL 12.2 m"; pulses when the pattern changes. */
export class OilChip {
  readonly chip: HudChip;
  private drop: Phaser.GameObjects.Graphics;
  private last = -1;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.drop = scene.add.graphics();
    this.drop.setData('chipWidth', 18);
    this.drop.fillStyle(0xffd86b, 1).fillCircle(0, 4, 7).fillTriangle(-6.2, 1, 6.2, 1, 0, -11);
    this.drop.fillStyle(0xffffff, 0.7).fillCircle(-2.5, 3, 2);
    this.chip = hudChip(scene, x, y, { items: [this.drop], label: t('oil'), size: 22 });
  }

  set(metres: number): void {
    const v = Math.round(metres * 10) / 10;
    const s = v.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    this.chip.setText(`${s} m`);
    if (this.last >= 0 && Math.abs(v - this.last) > 0.05) {
      this.scene.tweens.add({ targets: this.chip, scale: { from: 1.25, to: 1 }, duration: 420, ease: 'Back.easeOut' });
    }
    this.last = v;
  }
}

/** The coaching tip after a ball ("3 boards left of the pocket: move 1 board left"); tap to apply it. */
export class TipChip {
  readonly chip: HudChip;
  private bulb: Phaser.GameObjects.Graphics;
  private onTap: (() => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.bulb = scene.add.graphics();
    this.bulb.setData('chipWidth', 22);
    this.bulb.fillStyle(0xffd23f, 1).fillCircle(0, -3, 8).fillRect(-4, 4, 8, 6);
    this.bulb.fillStyle(0x140a2a, 1).fillRect(-4, 7, 8, 1.5);
    this.chip = hudChip(scene, x, y, { align: 'center', items: [this.bulb], size: 21, height: 52 });
    this.chip.setVisible(false);
    this.chip.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e?.stopPropagation?.(); this.onTap?.(); });
  }

  show(text: string, onTap: (() => void) | null): void {
    this.chip.setText(text);
    this.onTap = onTap;
    this.chip.setVisible(true);
    const w = this.chip.chipWidth;
    this.chip.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -30, w, 60), Phaser.Geom.Rectangle.Contains);
    this.chip.setAlpha(0);
    this.chip.scene.tweens.add({ targets: this.chip, alpha: 1, duration: 300 });
  }

  hide(): void {
    this.chip.setVisible(false);
    this.chip.disableInteractive();
    this.onTap = null;
  }

  get shown(): boolean {
    return this.chip.visible;
  }
}

export { fmtBoard };
