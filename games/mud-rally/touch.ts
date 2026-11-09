// Car controls for touch screens: steer left / right under the left thumb, GAS, BRAKE and NITRO
// under the right one. Every finger is read on every frame, so any mix of buttons can be held
// at once (steer + gas, gas + nitro) and a thumb may slide from one button onto the next.
// The steering is chosen on the menu (steering.ts): ARROWS are the two steer buttons; WHEEL is a
// steering wheel turned with the thumb that springs back when let go; TILT shows the same wheel
// turning with the phone, and a tap on it takes the current hold as straight ahead.
import { Phaser, txt, t } from '@core';
import type { SteerMode } from './steering';

type Zone = 'left' | 'right' | 'gas' | 'brake' | 'nitro' | 'wheel';

const DEPTH = 9400;
const STEER_Y = 606;
const STEER_R = 78;
const LEFT_X = 106;
const RIGHT_X = 276;
const GAS = { x: 1180, y: 566, w: 150, h: 220 };
const BRAKE = { x: 1018, y: 610, w: 132, h: 132 };
const NITRO = { x: 1018, y: 448, r: 64 };
/** Where the "turn tilt on" button appears when the browser wants a tap first (iOS). */
const ASK = { x: (LEFT_X + RIGHT_X) / 2, y: 438, w: 230, h: 54 };
const WHEEL_X = (LEFT_X + RIGHT_X) / 2;
const WHEEL_Y = STEER_Y - 4;
const WHEEL_R = 78;
/** Degrees the thumb turns the wheel for full lock, and the most it turns at all. */
const WHEEL_LOCK = 100;
const WHEEL_MAX = 130;

interface Btn {
  zone: Zone;
  root: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Graphics;
  draw: (g: Phaser.GameObjects.Graphics, down: boolean) => void;
  down: boolean;
}

export class TouchPad {
  /** -1 (left) .. 1 (right). */
  steer = 0;
  gas = false;
  brake = false;
  private nitroHit = false;
  private held = new Map<number, Zone | null>();
  private btns: Btn[] = [];
  private nitroCount!: Phaser.GameObjects.Text;
  readonly root: Phaser.GameObjects.Container;
  /** How this player steers (from the menu). */
  mode: SteerMode = 'arrows';
  private wheelHit = false;
  private wheel!: Phaser.GameObjects.Container;
  private wheelTip!: Phaser.GameObjects.Text;
  /** The thumb on the WHEEL: where it took hold, and the wheel's angle then (degrees). */
  private grab: { id: number; a0: number; r0: number } | null = null;
  private wheelAngle = 0;
  private ask!: Phaser.GameObjects.Container;
  private askZone!: Phaser.GameObjects.Zone;

  constructor(private scene: Phaser.Scene) {
    scene.input.addPointer(3);
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);
    const arrow = (dir: number) => (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(0x0b1020, down ? 0.55 : 0.35).fillCircle(0, 0, STEER_R);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.55).strokeCircle(0, 0, STEER_R);
      g.fillStyle(0xffffff, down ? 1 : 0.85);
      g.fillTriangle(dir * 34, 0, -dir * 20, -32, -dir * 20, 32);
    };
    const pedal = (w: number, h: number, color: number) => (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(color, down ? 0.75 : 0.4).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
      // tread lines on the pedal
      g.lineStyle(4, 0xffffff, down ? 0.4 : 0.22);
      for (let k = 0; k < 3; k++) g.lineBetween(-w / 2 + 28, h / 2 - 28 - k * 16, w / 2 - 28, h / 2 - 28 - k * 16);
    };
    const nitro = (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(0xff7a1a, down ? 0.8 : 0.42).fillCircle(0, 0, NITRO.r);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.6).strokeCircle(0, 0, NITRO.r);
      g.fillStyle(0xffd23f, down ? 1 : 0.9).fillTriangle(-12, 6, 6, -26, 0, 0).fillTriangle(12, -6, -6, 26, 0, 0);
    };
    this.add('left', LEFT_X, STEER_Y, arrow(-1));
    this.add('right', RIGHT_X, STEER_Y, arrow(1));
    this.add('gas', GAS.x, GAS.y, pedal(GAS.w, GAS.h, 0x2fae5a), t('gas'), -40);
    this.add('brake', BRAKE.x, BRAKE.y, pedal(BRAKE.w, BRAKE.h, 0xe8402f), t('brake'), -22);
    const n = this.add('nitro', NITRO.x, NITRO.y, nitro);
    this.nitroCount = txt(scene, 40, 44, '', { title: true, size: 26, color: '#ffffff', strokeThickness: 6 }).setOrigin(0.5);
    n.root.add(this.nitroCount);
    this.buildWheel();
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
    this.wheel = s.add.container(WHEEL_X, WHEEL_Y, [g]).setVisible(false);
    this.wheelTip = txt(s, WHEEL_X, WHEEL_Y + WHEEL_R + 26, t('tiltCentre'), { size: 18, color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setVisible(false);
    this.root.add([this.wheel, this.wheelTip]);

    const face = s.add.graphics()
      .fillStyle(0x2fae5a, 0.9).fillRoundedRect(-ASK.w / 2, -ASK.h / 2, ASK.w, ASK.h, ASK.h / 2)
      .lineStyle(3, 0xffffff, 0.95).strokeRoundedRect(-ASK.w / 2, -ASK.h / 2, ASK.w, ASK.h, ASK.h / 2);
    const label = txt(s, 0, 0, t('tiltAsk'), { title: true, size: 21, color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5);
    this.ask = s.add.container(ASK.x, ASK.y, [face, label]).setVisible(false);
    this.root.add(this.ask);
    this.askZone = s.add.zone(ASK.x, ASK.y, ASK.w + 24, ASK.h + 24).setScrollFactor(0).setDepth(DEPTH + 1);
    this.askZone.on('pointerup', () => { if (this.ask.visible) this.onAskTilt?.(); });
  }

  /** Called on a tap on the "turn tilt on" button (from inside the tap, as iOS wants). */
  onAskTilt: (() => void) | null = null;

  /**
   * Shows the controls for a steering mode. `waiting` (TILT only): the sensors need a tap first,
   * so the arrows stand in and a button asks for that tap.
   */
  setMode(mode: SteerMode, waiting = false): void {
    this.mode = mode;
    const arrows = mode === 'arrows' || (mode === 'tilt' && waiting);
    for (const b of this.btns) if (b.zone === 'left' || b.zone === 'right') b.root.setVisible(arrows);
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

  /** Tilt drives the wheel picture (-1 .. 1). */
  setWheel(steer: number): void {
    if (this.mode === 'tilt' && this.wheel.visible) this.wheel.setAngle(steer * 90);
  }

  /** True once per tap on the wheel in TILT mode (it re-centres tilt steering). */
  takeWheel(): boolean {
    const v = this.wheelHit;
    this.wheelHit = false;
    return v;
  }

  private add(zone: Zone, x: number, y: number, draw: Btn['draw'], label?: string, ly = 0): Btn {
    const face = this.scene.add.graphics();
    const root = this.scene.add.container(x, y, [face]);
    if (label) root.add(txt(this.scene, 0, ly, label, { title: true, size: label.length > 4 ? 22 : 26, color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5));
    draw(face, false);
    this.root.add(root);
    const b: Btn = { zone, root, face, draw, down: false };
    this.btns.push(b);
    return b;
  }

  private zoneAt(x: number, y: number): Zone | null {
    // generous areas around the drawn buttons, so a thumb that drifts a little still counts
    if (y > STEER_Y - STEER_R - 40 && x < RIGHT_X + STEER_R + 50) {
      if (this.wheel.visible) return 'wheel';
      return x < (LEFT_X + RIGHT_X) / 2 ? 'left' : 'right';
    }
    if (Math.hypot(x - NITRO.x, y - NITRO.y) < NITRO.r + 18) return 'nitro';
    if (x > GAS.x - GAS.w / 2 - 8 && y > GAS.y - GAS.h / 2 - 20) return 'gas';
    if (x > BRAKE.x - BRAKE.w / 2 - 30 && y > BRAKE.y - BRAKE.h / 2 - 16) return 'brake';
    return null;
  }

  /** Reads every finger on the screen. Call once per frame. */
  update(dt = 1 / 60): void {
    let l = false, r = false, gas = false, brake = false, nitro = false;
    let turning = false;
    const seen = new Set<number>();
    for (const p of this.scene.input.manager.pointers) {
      if (!p || !p.isDown) continue;
      seen.add(p.id);
      const z = this.root.visible ? this.zoneAt(p.x, p.y) : null;
      const before = this.held.get(p.id);
      if (z === 'nitro' && before !== 'nitro') this.nitroHit = true;
      if (z === 'wheel' && before !== 'wheel') {
        if (this.mode === 'tilt') this.wheelHit = true;
        else if (!this.grab) this.grab = { id: p.id, a0: this.thumbAngle(p), r0: this.wheelAngle };
      }
      // the thumb holding the wheel keeps it even when it slides off the wheel
      if (this.grab?.id === p.id && this.mode === 'wheel') {
        turning = true;
        if (Math.hypot(p.x - WHEEL_X, p.y - WHEEL_Y) > 16) {
          let d = this.thumbAngle(p) - this.grab.a0;
          d = ((d + 540) % 360) - 180;
          this.wheelAngle = Phaser.Math.Clamp(this.grab.r0 + d, -WHEEL_MAX, WHEEL_MAX);
          // past half a turn the angle would wrap: carry on from here instead
          if (Math.abs(d) > 150) this.grab = { id: p.id, a0: this.thumbAngle(p), r0: this.wheelAngle };
        }
        this.held.set(p.id, 'wheel');
        continue;
      }
      this.held.set(p.id, z);
      if (z === 'left') l = true;
      else if (z === 'right') r = true;
      else if (z === 'gas') gas = true;
      else if (z === 'brake') brake = true;
      else if (z === 'nitro') nitro = true;
    }
    for (const id of [...this.held.keys()]) if (!seen.has(id)) this.held.delete(id);
    if (this.grab && !seen.has(this.grab.id)) this.grab = null;
    if (this.mode === 'wheel') {
      // let go, the wheel springs back to straight
      if (!turning) this.wheelAngle *= Math.exp(-dt * 10);
      this.wheel.setAngle(this.wheelAngle);
      this.steer = Phaser.Math.Clamp(this.wheelAngle / WHEEL_LOCK, -1, 1);
    } else this.steer = (r ? 1 : 0) - (l ? 1 : 0);
    // a thumb on NITRO keeps the gas on: firing the boost never lifts off the pedal
    this.gas = gas || nitro;
    this.brake = brake;
    const state: Record<Zone, boolean> = { left: l, right: r, gas, brake, nitro, wheel: false };
    for (const b of this.btns) {
      const d = state[b.zone];
      if (d === b.down) continue;
      b.down = d;
      b.draw(b.face, d);
      b.root.setScale(d ? 0.94 : 1);
    }
  }

  /** The thumb's angle around the wheel centre, in degrees (0 = straight up, clockwise). */
  private thumbAngle(p: Phaser.Input.Pointer): number {
    return (Math.atan2(p.x - WHEEL_X, -(p.y - WHEEL_Y)) * 180) / Math.PI;
  }

  /** True once per finger landing (or sliding) on NITRO. */
  takeNitro(): boolean {
    const v = this.nitroHit;
    this.nitroHit = false;
    return v;
  }

  setNitro(n: number): void {
    this.nitroCount.setText(`×${n}`);
    const b = this.btns.find((x) => x.zone === 'nitro');
    b?.root.setAlpha(n > 0 ? 1 : 0.5);
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
    if (v && this.ask.visible) this.askZone.setInteractive();
    else this.askZone.disableInteractive();
    if (!v) {
      this.grab = null;
      this.wheelAngle = 0;
    }
    if (!v) {
      this.steer = 0;
      this.gas = this.brake = false;
      this.nitroHit = false;
    }
  }

  /** World positions of the button groups, for the first-race hint. */
  static readonly anchors = {
    steer: { x: (LEFT_X + RIGHT_X) / 2, y: STEER_Y - STEER_R },
    pedals: { x: 1050, y: NITRO.y - NITRO.r - 6 },
  };

  /** A short pulse on every button (first race). */
  pulse(): void {
    this.btns.forEach((b, i) => {
      this.scene.tweens.add({ targets: b.root, scale: { from: 1, to: 1.12 }, duration: 260, yoyo: true, repeat: 2, delay: 120 * i });
    });
  }
}
