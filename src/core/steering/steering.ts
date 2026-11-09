// The per-race steering glue every driving game needs, in one place: the touch pad (CarPad) on
// touch screens, the chosen mode applied at the start of each race (starting the tilt sensors or
// asking for them, or falling back to the arrows), the sensors read each frame, the tap that
// re-centres tilt, the calibration at the start signal and one steering value from keys, arrows,
// wheel or tilt.
import Phaser from 'phaser';
import { t } from '../i18n';
import { popup } from '../fx';
import { CarPad, type CarPadOptions } from './pad';
import { steerMode, setSteerMode, touchScreen } from './mode';
import { tilt, TILT_FULL_LOCK } from './tilt';

export interface CarSteeringOptions extends CarPadOptions {
  /** Draw the touch pad (default: on touch screens). */
  touch?: boolean;
  /** Degrees of phone tilt for full lock (default `TILT_FULL_LOCK`, 34). */
  tiltLock?: number;
  /**
   * Keys and arrow buttons ease towards full lock, as a car's front wheels: a tap is a small
   * correction, a held key is full lock. true (the default) takes `RAMP_TIME` (0.4 s) from straight
   * to full lock; a number sets that time in seconds; false gives -1 / 0 / 1 at once.
   */
  ramp?: boolean | number;
  /**
   * The same for the keyboard alone (default: as `ramp`). A game whose car already eases its
   * sideways motion may want the keys at once (`false`) while the arrow buttons keep `ramp`.
   */
  keyRamp?: boolean | number;
  /** Where messages about tilt appear (default: centred, 32 % down the screen). */
  messageY?: number;
}

/** Seconds the keys and arrow buttons take from straight ahead to full lock. */
export const RAMP_TIME = 0.4;
/** Seconds they take from full lock back to straight when let go (quicker: a car self-centres). */
const RETURN_TIME = 0.15;

export class CarSteering {
  /** The touch pad, or null without a touch screen. */
  readonly pad: CarPad | null;
  private value = 0;
  /** Seconds to full lock for keys and arrows (0: at once). */
  private ramp: number;
  /** The same for the keyboard alone. */
  private keyRamp: number;
  private dead = false;
  private msgY: number;
  /** Narrow (portrait) screens get the long tilt messages a little smaller. */
  private msgK: number;

  constructor(private scene: Phaser.Scene, o: CarSteeringOptions) {
    const touch = o.touch ?? touchScreen(scene);
    this.pad = touch ? new CarPad(scene, o) : null;
    const seconds = (r: boolean | number | undefined) => (r === false ? 0 : typeof r === 'number' ? r : RAMP_TIME);
    this.ramp = seconds(o.ramp);
    this.keyRamp = o.keyRamp === undefined ? this.ramp : seconds(o.keyRamp);
    this.msgY = o.messageY ?? Math.round(scene.scale.height * 0.32);
    this.msgK = scene.scale.width >= 1000 ? 1 : 0.75;
    // the sensor reader lives for the whole visit (menu and races), so it is not stopped here
    tilt.fullLock = o.tiltLock ?? TILT_FULL_LOCK;
    if (this.pad) this.pad.onAskTilt = () => this.askTilt();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.dead = true; });
  }

  /** At each race start: shows the pad in the chosen mode, starting the sensors for TILT. */
  begin(): void {
    this.value = 0;
    const tp = this.pad;
    if (!tp) return;
    tp.setVisible(true);
    const mode = steerMode();
    if (mode !== 'tilt') {
      tp.setMode(mode);
      return;
    }
    if (tilt.active) {
      tp.setMode('tilt');
      return;
    }
    // where the sensors may start without a tap (Android) they just do; where the browser wants a
    // tap first (iOS after a reload) the arrows stand in and a button asks for that tap
    tp.setMode('tilt', true);
    void tilt.enable().then((r) => {
      if (!this.live()) return;
      if (r === 'on') tp.setMode('tilt');
      else if (r === 'unsupported') this.dropTilt('tiltNone');
    });
  }

  /** Hides the pad (results, shop, game over). */
  end(): void {
    this.value = 0;
    this.pad?.setVisible(false);
  }

  /** Call once per frame, in every phase: reads the fingers and the sensors. */
  update(dt: number): void {
    this.pad?.update(dt);
    if (!tilt.active) return;
    tilt.update(dt);
    if (this.pad?.takeWheel()) {
      tilt.calibrate();
      popup(this.scene, this.pad.steerX, this.pad.steerY - 166, t('tiltCentred'), '#7dff9a', 24);
    }
    this.pad?.setWheel(tilt.steer);
  }

  /** At the start signal: the way the phone is held now is straight ahead. */
  centre(): void {
    if (tilt.active) tilt.calibrate();
  }

  /**
   * The steering for this frame, -1 (left) .. 1 (right). `keyAxis` is the keyboard's left/right
   * (`controls.axisX`); a pressed key wins over the touch pad. The wheel and tilt are analogue.
   */
  steer(dt: number, keyAxis: number): number {
    const tp = this.pad;
    const keys = Math.sign(keyAxis) * (Math.abs(keyAxis) > 0.3 ? 1 : 0);
    if (tp?.mode === 'tilt' && tilt.active && keys === 0) {
      // tilt steering is analogue and already smoothed: the wheel follows the phone
      this.value = tilt.steer;
    } else if (tp?.mode === 'wheel' && keys === 0) {
      // the on-screen wheel is analogue too: the car follows the thumb
      this.value = tp.steer;
    } else {
      const fromPad = !!tp && tp.steer !== 0;
      const want = fromPad ? tp.steer : keys;
      const ramp = fromPad ? this.ramp : this.keyRamp;
      if (ramp <= 0) this.value = want;
      else {
        // the wheel follows the keys steadily, not at once; letting go centres it quicker
        const back = want === 0 || want * this.value < 0;
        const step = (back ? 1 / Math.min(ramp, RETURN_TIME) : 1 / ramp) * dt;
        this.value += Phaser.Math.Clamp(want - this.value, -step, step);
      }
    }
    return this.value;
  }

  /** The last value `steer()` returned. */
  get current(): number {
    return this.value;
  }

  /** A right-thumb button is held (false without a pad). */
  isDown(id: string): boolean {
    return this.pad?.isDown(id) ?? false;
  }

  /** A finger landed on a right-thumb button since the last call. */
  take(id: string): boolean {
    return this.pad?.take(id) ?? false;
  }

  private live(): boolean {
    return !this.dead && this.scene.sys.isActive();
  }

  /** The "turn tilt on" button: asks for the sensors from inside the tap. */
  private askTilt(): void {
    void tilt.enable().then((r) => {
      if (!this.pad || !this.live()) return;
      if (r === 'on') {
        this.pad.setMode('tilt');
        tilt.calibrate();
        popup(this.scene, this.scene.scale.width / 2, this.msgY, t('tiltOn'), '#7dff9a', Math.round(28 * this.msgK));
      } else this.dropTilt(r === 'denied' ? 'tiltDenied' : 'tiltNone');
    });
  }

  /** Tilt cannot work here: back to the arrows, and the menu shows that choice from now on. */
  private dropTilt(why: 'tiltDenied' | 'tiltNone'): void {
    setSteerMode('arrows');
    this.pad?.setMode('arrows');
    popup(this.scene, this.scene.scale.width / 2, this.msgY, t(why), '#ff9a7a', Math.round(26 * this.msgK));
  }
}
