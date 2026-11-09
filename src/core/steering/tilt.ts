// Tilt steering: the phone's sideways tilt read from the motion sensors (deviceorientation).
// It works however the phone is held, upright like a steering wheel or tipped back towards
// flat: what counts is how far the right edge dips below the left one. The game page runs in
// ayvago.com's iframe, which allows the sensors (allow="accelerometer; gyroscope"). Where the
// browser has a permission step (iOS asks the player once, and only from a tap), the first
// enable() must come from a tap; later ones may succeed without it.

import { steerCurve } from './curve';

/**
 * Degrees of tilt ignored around the centre, and the default tilt that gives full lock: wide, so
 * the car turns calmly (with the gentle centre curve, a small wobble is only a small correction).
 */
const DEADZONE = 3;
export const TILT_FULL_LOCK = 34;
/** The centre taken at calibration never strays further than this from level. */
const MAX_NEUTRAL = 18;

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export type TiltResult = 'on' | 'denied' | 'unsupported';

export class Tilt {
  /** True while sensor readings arrive. */
  active = false;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  steer = 0;
  /** Degrees of tilt for full lock (a game may set its own, see CarSteering's `tiltLock`). */
  fullLock = TILT_FULL_LOCK;
  private angle = 0;
  private neutral = 0;
  private fresh = false;
  private listener = (e: DeviceOrientationEvent) => this.onOrientation(e);

  /** Whether the browser offers motion sensors at all (desktop browsers often do, with none fitted). */
  static get available(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Starts reading the sensors (call from a tap). Resolves once readings arrive, or why not. */
  async enable(): Promise<TiltResult> {
    if (!Tilt.available) return 'unsupported';
    const api = DeviceOrientationEvent as unknown as PermissionApi;
    if (typeof api.requestPermission === 'function') {
      try {
        if ((await api.requestPermission()) !== 'granted') return 'denied';
      } catch {
        return 'denied';
      }
    }
    window.addEventListener('deviceorientation', this.listener);
    // a browser without a sensor never sends a reading with angles in it
    const got = await new Promise<boolean>((resolve) => {
      const t0 = Date.now();
      const check = () => {
        if (this.fresh) resolve(true);
        else if (Date.now() - t0 > 1500) resolve(false);
        else setTimeout(check, 50);
      };
      check();
    });
    if (!got) {
      this.disable();
      return 'unsupported';
    }
    this.active = true;
    this.calibrate();
    return 'on';
  }

  disable(): void {
    window.removeEventListener('deviceorientation', this.listener);
    this.active = false;
    this.fresh = false;
    this.steer = 0;
  }

  /** Takes the way the phone is held now as straight ahead (within a sane range). */
  calibrate(): void {
    this.neutral = Math.max(-MAX_NEUTRAL, Math.min(MAX_NEUTRAL, this.angle));
  }

  /** Call once per frame: eases the steering towards the current tilt. */
  update(dt: number): void {
    if (!this.active) return;
    let d = this.angle - this.neutral;
    const s = Math.sign(d);
    d = Math.max(0, Math.abs(d) - DEADZONE) / (this.fullLock - DEADZONE);
    const want = steerCurve(s * d);
    // a light filter takes the shake out of the sensor without making the wheel feel late
    this.steer += (want - this.steer) * Math.min(1, dt * 14);
  }

  private onOrientation(e: DeviceOrientationEvent): void {
    if (e.beta === null || e.gamma === null) return;
    this.fresh = true;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    // "up" in the phone's own axes (x right, y towards the top, z out of the screen)
    const ux = -Math.sin(g) * Math.cos(b);
    const uy = Math.sin(b);
    // turned into the screen's axes as the player sees them. At an angle of 90 the phone lies
    // turned a quarter anticlockwise (its top on the player's left), so the screen's right is the
    // phone's -y; at 270 it is +y.
    const o = ((screenAngle() % 360) + 360) % 360;
    const r = (o * Math.PI) / 180;
    const sx = ux * Math.cos(r) - uy * Math.sin(r);
    // the right edge dipping (a turn to the right) tips "up" towards the screen's left
    this.angle = (Math.asin(Math.max(-1, Math.min(1, -sx))) * 180) / Math.PI;
  }
}

function screenAngle(): number {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/** One sensor reader for the whole page: the menu turns it on (from a tap), the race reads it. */
export const tilt = new Tilt();
