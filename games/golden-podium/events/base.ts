// Shared pieces of the events: the event interface, the tap-rhythm meter, the start calls with
// false starts, and the rivals' race plans.
import { t } from '@core';
import type { PlayScene } from '../PlayScene';
import type { PadButton } from '../pad';
import type { EventId } from '../scoring';

export abstract class SportEvent {
  abstract readonly id: EventId;
  /** Milliseconds between the last mark and the results board. */
  resultDelay = 1600;

  constructor(protected s: PlayScene) {}

  /** Places the athletes and the camera (the event card is shown over this). */
  abstract setup(): void;
  /** The player pressed READY. */
  abstract begin(): void;
  /** Game time `dt` (slow motion applied) and real time `rdt`, in seconds. */
  abstract update(dt: number, rdt: number): void;
  /** Every entrant's mark (index 0 = the player); NaN = no mark. */
  abstract marks(): number[];
  abstract buttons(): PadButton[];
  /** A texture key for the event card. */
  abstract picture(): string;
  /** While the card is up. */
  idle(_rdt: number): void {}
  /** Every rendered frame (water, flags …). */
  frame(_dt: number, _time: number): void {}
  /** Removes the event's own objects. */
  cleanup(): void {}

  protected get easy(): boolean {
    return this.s.easy;
  }
}

/**
 * Tap rhythm: the rate of the last few taps. Taps faster than the useful rate earn nothing more,
 * and an even rhythm earns a little extra, so steady taps beat frantic mashing.
 */
export class Cadence {
  private times: number[] = [];

  tap(now: number): void {
    this.times.push(now);
    if (this.times.length > 6) this.times.shift();
  }

  reset(): void {
    this.times = [];
  }

  get last(): number {
    return this.times.length ? this.times[this.times.length - 1] : -Infinity;
  }

  /** Taps per second now (falls away when the taps stop). */
  rate(now: number): number {
    const n = this.times.length;
    if (n < 2) return n ? 1.5 : 0;
    const iv = (this.times[n - 1] - this.times[Math.max(0, n - 5)]) / (Math.min(n, 5) - 1);
    const since = now - this.times[n - 1];
    return 1 / Math.max(iv, since * 0.9, 0.02);
  }

  /** 0 (ragged) … 1 (even) over the last taps. */
  evenness(): number {
    const n = this.times.length;
    if (n < 4) return 0.5;
    const iv: number[] = [];
    for (let i = 1; i < n; i++) iv.push(this.times[i] - this.times[i - 1]);
    const m = iv.reduce((a, b) => a + b, 0) / iv.length;
    // several taps in one frame (a slow frame) give no rhythm to measure
    if (!(m > 0.005)) return 0.5;
    const sd = Math.sqrt(iv.reduce((a, b) => a + (b - m) * (b - m), 0) / iv.length);
    return Math.max(0, 1 - (sd / m) * 2.5);
  }
}

/** Speed factor 0..1 from a tap rate: capped at the useful rate, with a small rhythm bonus. */
export function stride(rate: number, useful: number, evenness: number): number {
  const f = Math.min(1, rate / useful);
  return f * (0.94 + 0.06 * evenness);
}

/**
 * A rival's run that ends exactly at `time` over `len` metres: reaction, then speed rising to
 * a top speed with time constant `tau`. Returns position by time since the gun.
 */
export function racePlan(time: number, len: number, reaction: number, tau: number): (t: number) => number {
  const run = Math.max(0.5, time - reaction);
  const vmax = len / (run - tau * (1 - Math.exp(-run / tau)));
  return (tt: number) => {
    const r = tt - reaction;
    if (r <= 0) return 0;
    return vmax * (r - tau * (1 - Math.exp(-r / tau)));
  };
}

/** Speed of such a plan at time t (for the running animation). */
export function planSpeed(plan: (t: number) => number, tt: number): number {
  return (plan(tt + 0.02) - plan(tt)) / 0.02;
}

type StartState = 'marks' | 'set' | 'gun';

/**
 * ON YOUR MARKS → SET → the gun after a random wait. A press before the gun is a false start:
 * the first is a warning, the second disqualifies (Easy: always just a warning).
 */
export class StartCalls {
  state: StartState = 'marks';
  private t = 0;
  private wait = 0;
  falseStarts = 0;
  /** Seconds from the gun until the player's first move. */
  reaction = 0;

  constructor(private s: PlayScene, private onPose: (state: StartState) => void) {}

  begin(): void {
    this.state = 'marks';
    this.t = 0;
    this.wait = 1.1 + Math.random() * 1.3;
    this.s.call(t('marks'), '#ffffff', { size: 50, hold: 900 });
    this.s.crowdLoop.level(0.08, 800);
    this.onPose('marks');
  }

  /**
   * Advances the calls. `early` = the player pressed before the gun. Returns 'gun' on the
   * frame of the shot, 'false' / 'dq' on a false start.
   */
  update(dt: number, early: boolean): 'gun' | 'false' | 'dq' | null {
    if (this.state === 'gun') return null;
    this.t += dt;
    if (early && this.t > 0.25) {
      this.falseStarts++;
      this.s.sfx('whistle', { volume: 0.8 });
      this.s.shake(0.004, 160);
      if (this.falseStarts >= 2 && !this.s.easy) {
        this.s.call(t('dq'), '#ff6b4a', { size: 60, hold: 1400 });
        this.state = 'gun';
        return 'dq';
      }
      this.s.call(t('falseStart'), '#ff6b4a', { size: 56, hold: 1100 });
      if (!this.s.easy) this.s.time.delayedCall(700, () => this.s.call(t('falseWarn'), '#ffffff', { y: 330, size: 28, hold: 1400 }));
      this.s.time.delayedCall(1500, () => this.begin());
      this.state = 'marks';
      this.t = -99;   // frozen until begin() runs again
      return 'false';
    }
    if (this.state === 'marks' && this.t > 1.5) {
      this.state = 'set';
      this.t = 0;
      this.s.call(t('set'), '#ffffff', { size: 50, hold: 600 });
      this.onPose('set');
    } else if (this.state === 'set' && this.t > this.wait) {
      this.state = 'gun';
      this.s.sfx('gun', { volume: 0.9 });
      this.s.flash(0xffffff);
      this.s.call(t('go'), '#7dff9a', { size: 70, hold: 450 });
      this.s.crowdLoop.level(0.3, 400);
      this.s.cheer(0.5, false);
      return 'gun';
    }
    return null;
  }

  get waiting(): boolean {
    return this.t < -1;
  }
}
