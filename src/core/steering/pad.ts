// Car controls for touch screens. The left thumb steers in the mode chosen on the menu (mode.ts):
// ARROWS are two steer buttons; WHEEL is a steering wheel turned with the thumb that springs back
// when let go; TILT shows the same wheel turning with the phone, and a tap on it takes the current
// hold as straight ahead. The right thumb gets the game's own buttons (GAS, BRAKE, NITRO, JUMP...).
// Every finger is read on every frame, so any mix can be held at once (steer + gas, gas + nitro)
// and a thumb may slide from one button onto the next.
import Phaser from 'phaser';
import { txt } from '../theme';
import { t } from '../i18n';
import type { SteerMode } from './mode';
import { steerCurve, steerCurveInverse } from './curve';

/** One right-thumb button. Positions are world pixels; the label is already localized. */
export interface CarPadButton {
  id: string;
  /** A tall rounded pedal with tread lines, or a round button. */
  shape: 'pedal' | 'round';
  x: number;
  y: number;
  /** Pedal size (default 140 × 200). */
  w?: number;
  h?: number;
  /** Round button radius (default 64). */
  r?: number;
  color: number;
  label?: string;
  /** Label offset from the button centre, and its size (default 26, or 22 for long labels). */
  labelY?: number;
  labelSize?: number;
  /** A drawn icon: a lightning bolt (boost) or an up arrow (jump). */
  icon?: 'bolt' | 'up';
  /** Shows a "×n" badge, set with `setCount`; the button dims at zero. */
  count?: boolean;
  /**
   * Extra room around the drawn button that still counts as a press (default 18). Pedals take
   * margins per side; `Infinity` runs a side to the screen edge. Round buttons are tested first,
   * then pedals in the order given.
   */
  hit?: number | { left?: number; top?: number; right?: number; bottom?: number };
  /** Another button this one also holds down (a thumb on NITRO keeps the GAS on). */
  holds?: string;
}

export interface CarPadOptions {
  buttons: CarPadButton[];
  /** Centre of the left-thumb steering group (default: x 191, 114 px above the bottom edge). */
  steer?: { x?: number; y?: number };
  /** Degrees the thumb turns the on-screen wheel for full lock (default `WHEEL_LOCK`, 155). */
  wheelLock?: number;
}

const DEPTH = 9400;
const STEER_R = 78;
/** Half the distance between the two arrow buttons. */
const ARROW_GAP = 85;
const WHEEL_R = 78;
/**
 * Degrees the thumb turns the wheel for full lock. Wide on purpose: a car wants calm, small
 * corrections, and the response curve (curve.ts) keeps the first part of the turn gentle.
 */
export const WHEEL_LOCK = 155;
/** How far the wheel turns past full lock before it stops, in degrees. */
const WHEEL_OVER = 15;
const ASK_W = 230;
const ASK_H = 54;
const STEER_IDS = ['left', 'right'];

interface Btn {
  id: string;
  root: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Graphics;
  draw: (g: Phaser.GameObjects.Graphics, down: boolean) => void;
  down: boolean;
  cfg?: CarPadButton;
  badge?: Phaser.GameObjects.Text;
}

export class CarPad {
  /** -1 (left) .. 1 (right) from the arrows or the on-screen wheel (tilt is read from `tilt`). */
  steer = 0;
  /** How this player steers (from the menu). */
  mode: SteerMode = 'arrows';
  readonly root: Phaser.GameObjects.Container;
  /** Centre of the steering group, for popups and hints. */
  readonly steerX: number;
  readonly steerY: number;
  /** Called on a tap on the "turn tilt on" button (from inside the tap, as iOS wants). */
  onAskTilt: (() => void) | null = null;

  private held = new Map<number, string | null>();
  private btns: Btn[] = [];
  private order: CarPadButton[];
  private downIds = new Set<string>();
  private hits = new Set<string>();
  private leftX: number;
  private rightX: number;
  private wheelX: number;
  private wheelY: number;
  private wheelLock: number;
  private wheelHit = false;
  private wheel!: Phaser.GameObjects.Container;
  private wheelTip!: Phaser.GameObjects.Text;
  /** The thumb on the WHEEL: where it took hold, and the wheel's angle then (degrees). */
  private grab: { id: number; a0: number; r0: number } | null = null;
  private wheelAngle = 0;
  private ask!: Phaser.GameObjects.Container;
  private askZone!: Phaser.GameObjects.Zone;

  constructor(private scene: Phaser.Scene, o: CarPadOptions) {
    scene.input.addPointer(3);
    this.steerX = o.steer?.x ?? 191;
    this.steerY = o.steer?.y ?? scene.scale.height - 114;
    this.leftX = this.steerX - ARROW_GAP;
    this.rightX = this.steerX + ARROW_GAP;
    this.wheelX = this.steerX;
    this.wheelY = this.steerY - 4;
    this.wheelLock = o.wheelLock ?? WHEEL_LOCK;
    // round buttons sit on top of pedals, so they are hit-tested first
    this.order = [...o.buttons.filter((b) => b.shape === 'round'), ...o.buttons.filter((b) => b.shape !== 'round')];
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);

    const arrow = (dir: number) => (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(0x0b1020, down ? 0.55 : 0.35).fillCircle(0, 0, STEER_R);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.55).strokeCircle(0, 0, STEER_R);
      g.fillStyle(0xffffff, down ? 1 : 0.85);
      g.fillTriangle(dir * 34, 0, -dir * 20, -32, -dir * 20, 32);
    };
    this.add('left', this.leftX, this.steerY, arrow(-1));
    this.add('right', this.rightX, this.steerY, arrow(1));
    for (const b of o.buttons) this.addButton(b);
    this.buildWheel();
  }

  private addButton(c: CarPadButton): void {
    const pedal = c.shape === 'pedal';
    const w = c.w ?? 140, h = c.h ?? 200, r = c.r ?? 64, k = r / 64;
    const draw = (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      if (pedal) {
        g.fillStyle(c.color, down ? 0.75 : 0.4).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
        g.lineStyle(5, 0xffffff, down ? 0.95 : 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
        // tread lines on the pedal
        g.lineStyle(4, 0xffffff, down ? 0.4 : 0.22);
        for (let i = 0; i < 3; i++) g.lineBetween(-w / 2 + 28, h / 2 - 28 - i * 16, w / 2 - 28, h / 2 - 28 - i * 16);
      } else {
        g.fillStyle(c.color, down ? 0.8 : 0.42).fillCircle(0, 0, r);
        g.lineStyle(5, 0xffffff, down ? 0.95 : 0.6).strokeCircle(0, 0, r);
      }
      const ic = 0xffd23f, a = down ? 1 : 0.9;
      if (c.icon === 'bolt') {
        g.fillStyle(ic, a).fillTriangle(-12 * k, 6 * k, 6 * k, -26 * k, 0, 0).fillTriangle(12 * k, -6 * k, -6 * k, 26 * k, 0, 0);
      } else if (c.icon === 'up') {
        // an up arrow above the label
        const y = c.label ? -r * 0.3 : 0;
        g.fillStyle(0xffffff, a).fillTriangle(0, y - 30 * k, -26 * k, y, 26 * k, y);
        g.fillRect(-10 * k, y - 1, 20 * k, 16 * k);
      }
    };
    const b = this.add(c.id, c.x, c.y, draw, c.label, c.labelY ?? 0, c.labelSize);
    b.cfg = c;
    if (c.count) {
      b.badge = txt(this.scene, Math.round(r * 0.625), Math.round(r * 0.69), '', { title: true, size: 26, color: '#ffffff', strokeThickness: 6 }).setOrigin(0.5);
      b.root.add(b.badge);
    }
  }

  /** The steering wheel (WHEEL and TILT modes) and the "turn tilt on" button (iOS). */
  private buildWheel(): void {
    const s = this.scene;
    const g = s.add.graphics();
    // a three-spoke steering wheel with a top marker, so the turn is easy to read
    g.fillStyle(0x0b1020, 0.4).fillCircle(0, 0, WHEEL_R + 8);
    g.lineStyle(13, 0xffffff, 0.85).strokeCircle(0, 0, WHEEL_R - 6);
    g.lineStyle(11, 0xffffff, 0.75).lineBetween(-WHEEL_R + 8, 4, WHEEL_R - 8, 4).lineBetween(0, 4, 0, WHEEL_R - 8);
    g.fillStyle(0xffffff, 0.9).fillCircle(0, 4, 17);
    g.fillStyle(0xffd23f, 1).fillRoundedRect(-8, -WHEEL_R - 2, 16, 20, 4);
    this.wheel = s.add.container(this.wheelX, this.wheelY, [g]).setVisible(false);
    this.wheelTip = txt(s, this.wheelX, this.wheelY + WHEEL_R + 26, t('tiltCentre'), { size: 18, color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setVisible(false);
    this.root.add([this.wheel, this.wheelTip]);

    const ax = this.steerX, ay = this.steerY - 168;
    const face = s.add.graphics()
      .fillStyle(0x2fae5a, 0.9).fillRoundedRect(-ASK_W / 2, -ASK_H / 2, ASK_W, ASK_H, ASK_H / 2)
      .lineStyle(3, 0xffffff, 0.95).strokeRoundedRect(-ASK_W / 2, -ASK_H / 2, ASK_W, ASK_H, ASK_H / 2);
    const label = txt(s, 0, 0, t('tiltAsk'), { title: true, size: 21, color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5);
    this.ask = s.add.container(ax, ay, [face, label]).setVisible(false);
    this.root.add(this.ask);
    this.askZone = s.add.zone(ax, ay, ASK_W + 24, ASK_H + 24).setScrollFactor(0).setDepth(DEPTH + 1);
    this.askZone.on('pointerup', () => { if (this.ask.visible) this.onAskTilt?.(); });
  }

  /**
   * Shows the controls for a steering mode. `waiting` (TILT only): the sensors need a tap first,
   * so the arrows stand in and a button asks for that tap.
   */
  setMode(mode: SteerMode, waiting = false): void {
    this.mode = mode;
    const arrows = mode === 'arrows' || (mode === 'tilt' && waiting);
    for (const b of this.btns) if (STEER_IDS.includes(b.id)) b.root.setVisible(arrows);
    this.wheel.setVisible(!arrows).setAngle(0);
    this.wheelTip.setVisible(mode === 'tilt' && !waiting);
    this.wheelAngle = 0;
    this.grab = null;
    this.ask.setVisible(mode === 'tilt' && waiting);
    if (this.ask.visible) {
      this.askZone.setInteractive();
      this.scene.tweens.add({ targets: this.ask, scale: { from: 1, to: 1.08 }, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.askZone.disableInteractive();
      this.scene.tweens.killTweensOf(this.ask);
      this.ask.setScale(1);
    }
  }

  /** True while the "turn tilt on" button is up. */
  get asking(): boolean {
    return this.ask.visible;
  }

  /** Tilt drives the wheel picture (-1 .. 1): drawn where a thumb would hold it for that steering. */
  setWheel(steer: number): void {
    if (this.mode === 'tilt' && this.wheel.visible) this.wheel.setAngle(steerCurveInverse(steer) * this.wheelLock);
  }

  /** True once per tap on the wheel in TILT mode (it re-centres tilt steering). */
  takeWheel(): boolean {
    const v = this.wheelHit;
    this.wheelHit = false;
    return v;
  }

  private add(id: string, x: number, y: number, draw: Btn['draw'], label?: string, ly = 0, size?: number): Btn {
    const face = this.scene.add.graphics();
    const root = this.scene.add.container(x, y, [face]);
    if (label) root.add(txt(this.scene, 0, ly, label, { title: true, size: size ?? (label.length > 4 ? 22 : 26), color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5));
    draw(face, false);
    this.root.add(root);
    const b: Btn = { id, root, face, draw, down: false };
    this.btns.push(b);
    return b;
  }

  private inside(c: CarPadButton, x: number, y: number): boolean {
    if (c.shape === 'round') {
      const pad = typeof c.hit === 'number' ? c.hit : 18;
      return Math.hypot(x - c.x, y - c.y) < (c.r ?? 64) + pad;
    }
    const w = c.w ?? 140, h = c.h ?? 200;
    const m = typeof c.hit === 'object' ? c.hit : {};
    const d = typeof c.hit === 'number' ? c.hit : 18;
    return x > c.x - w / 2 - (m.left ?? d) && x < c.x + w / 2 + (m.right ?? d)
      && y > c.y - h / 2 - (m.top ?? d) && y < c.y + h / 2 + (m.bottom ?? d);
  }

  private zoneAt(x: number, y: number): string | null {
    // generous areas around the drawn buttons, so a thumb that drifts a little still counts
    if (y > this.steerY - STEER_R - 40 && x < this.rightX + STEER_R + 50) {
      if (this.wheel.visible) return 'wheel';
      return x < this.steerX ? 'left' : 'right';
    }
    for (const c of this.order) if (this.inside(c, x, y)) return c.id;
    return null;
  }

  /** Reads every finger on the screen. Call once per frame. */
  update(dt = 1 / 60): void {
    const down = new Set<string>();
    let turning = false;
    const seen = new Set<number>();
    for (const p of this.scene.input.manager.pointers) {
      if (!p || !p.isDown) continue;
      seen.add(p.id);
      const z = this.root.visible ? this.zoneAt(p.x, p.y) : null;
      const before = this.held.get(p.id);
      if (z && z !== 'wheel' && z !== before) this.hits.add(z);
      if (z === 'wheel' && before !== 'wheel') {
        if (this.mode === 'tilt') this.wheelHit = true;
        else if (!this.grab) this.grab = { id: p.id, a0: this.thumbAngle(p), r0: this.wheelAngle };
      }
      // the thumb holding the wheel keeps it even when it slides off the wheel
      if (this.grab?.id === p.id && this.mode === 'wheel') {
        turning = true;
        if (Math.hypot(p.x - this.wheelX, p.y - this.wheelY) > 16) {
          let d = this.thumbAngle(p) - this.grab.a0;
          d = ((d + 540) % 360) - 180;
          const max = this.wheelLock + WHEEL_OVER;
          this.wheelAngle = Phaser.Math.Clamp(this.grab.r0 + d, -max, max);
          // past half a turn the angle would wrap: carry on from here instead
          if (Math.abs(d) > 150) this.grab = { id: p.id, a0: this.thumbAngle(p), r0: this.wheelAngle };
        }
        this.held.set(p.id, 'wheel');
        continue;
      }
      this.held.set(p.id, z);
      if (z && z !== 'wheel') down.add(z);
    }
    for (const id of [...this.held.keys()]) if (!seen.has(id)) this.held.delete(id);
    if (this.grab && !seen.has(this.grab.id)) this.grab = null;
    if (this.mode === 'wheel') {
      // let go, the wheel springs back to straight
      if (!turning) this.wheelAngle *= Math.exp(-dt * 10);
      this.wheel.setAngle(this.wheelAngle);
      this.steer = steerCurve(this.wheelAngle / this.wheelLock);
    } else this.steer = (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0);
    // the drawn state shows the fingers; `holds` only adds to what `isDown` reports
    for (const b of this.btns) {
      const d = down.has(b.id);
      if (d === b.down) continue;
      b.down = d;
      b.draw(b.face, d);
      b.root.setScale(d ? 0.94 : 1);
    }
    this.downIds = new Set(down);
    for (const b of this.btns) if (b.cfg?.holds && down.has(b.id)) this.downIds.add(b.cfg.holds);
  }

  /** The thumb's angle around the wheel centre, in degrees (0 = straight up, clockwise). */
  private thumbAngle(p: Phaser.Input.Pointer): number {
    return (Math.atan2(p.x - this.wheelX, -(p.y - this.wheelY)) * 180) / Math.PI;
  }

  /** True while a finger is on the button (or on one that `holds` it). */
  isDown(id: string): boolean {
    return this.downIds.has(id);
  }

  /** True once per finger landing (or sliding) on the button. */
  take(id: string): boolean {
    const v = this.hits.has(id);
    this.hits.delete(id);
    return v;
  }

  /** Sets a `count` button's "×n" badge; the button dims at zero. */
  setCount(id: string, n: number): void {
    const b = this.btns.find((x) => x.id === id);
    if (!b) return;
    b.badge?.setText(`×${n}`);
    b.root.setAlpha(n > 0 ? 1 : 0.5);
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
    if (v && this.ask.visible) this.askZone.setInteractive();
    else this.askZone.disableInteractive();
    if (!v) {
      this.grab = null;
      this.wheelAngle = 0;
      this.steer = 0;
      this.downIds.clear();
      this.hits.clear();
    }
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Where the steering group's top edge is, for a first-race hint above it. */
  get steerAnchor(): { x: number; y: number } {
    return { x: this.steerX, y: this.steerY - STEER_R };
  }

  /** A short pulse on every button (first race). */
  pulse(): void {
    this.btns.forEach((b, i) => {
      this.scene.tweens.add({ targets: b.root, scale: { from: 1, to: 1.12 }, duration: 260, yoyo: true, repeat: 2, delay: 120 * i });
    });
  }
}
