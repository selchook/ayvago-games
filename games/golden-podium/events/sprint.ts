// 100 m sprint: a clean start after the gun, then LEFT / RIGHT in turn. Speed follows the rate
// of alternating taps up to a useful rate (more is wasted), an even rhythm adds a little, and
// the same side twice is a stumble. Hurdles extends this race.
import { t } from '@core';
import { THREE } from '@core/three';
import { SportEvent, Cadence, StartCalls, racePlan, planSpeed, stride } from './base';
import { laneZ } from '../stadium';
import { Meter, RaceStrip } from '../panels';
import { rivalMark, type EventId } from '../scoring';
import { secs, num } from '../strings';
import type { PadButton } from '../pad';
import { celebrate, type Athlete } from '../athlete';
import type { Shot } from '../portraits';

/** Normal and Easy side by side. */
export const SPRINT_TUNE = {
  normal: { useful: 6.0, vmax: 11.2, acc: 1.7 },
  easy: { useful: 4.8, vmax: 11.2, acc: 1.9 },
};

/** Slowing down past the line, m/s². */
const EASE_OFF = 4.5;

export class Sprint extends SportEvent {
  readonly id: EventId = 'sprint';
  protected len = 100;
  protected tau = 1.1;
  protected calls!: StartCalls;
  protected state: 'start' | 'run' | 'after' = 'start';
  protected raceT = 0;
  protected x = [0, 0, 0, 0];
  protected v = 0;
  protected times: number[] = [NaN, NaN, NaN, NaN];
  protected plans: ((t: number) => number)[] = [];
  protected cad = new Cadence();
  protected dq = false;
  protected moved = false;
  protected afterT = 0;
  private lastSide: 'L' | 'R' | null = null;
  private stumbleT = 0;
  protected strip!: RaceStrip;
  protected meter!: Meter;
  protected hitT = 0;

  protected get tune() {
    return this.easy ? SPRINT_TUNE.easy : SPRINT_TUNE.normal;
  }

  protected lane(i: number): number {
    return laneZ(i + 1);
  }

  buttons(): PadButton[] {
    return [
      { id: 'L', label: t('b_left'), x: 150, y: 590, color: 0x22c3b5, keys: ['ArrowLeft', 'KeyA'] },
      { id: 'R', label: t('b_right'), x: 1130, y: 590, color: 0xff6b4a, keys: ['ArrowRight', 'KeyD'] },
    ];
  }

  picture(): Shot {
    return { clip: 'sprint', at: 0.2, yaw: 0.35 };
  }

  setup(): void {
    const s = this.s;
    s.useVenue(s.venues.track);
    s.entrants.forEach((e, i) => {
      e.athlete.root.position.set(-0.6, 0, this.lane(i));
      e.athlete.face(0).play('idle', { fade: 0 });
    });
    this.placeExtras();
    s.cut(new THREE.Vector3(-7, 2.2, this.lane(0) + 7), new THREE.Vector3(2, 0.9, this.lane(2)));
    s.fov(50, true);
  }

  /** Hurdles add their hurdles here. */
  protected placeExtras(): void {}

  idle(rdt: number): void {
    // a slow drift round the start while the card is up
    this.s.camTo(new THREE.Vector3(-6, 2.0, this.lane(0) + 7.5), new THREE.Vector3(2, 0.9, this.lane(2)), 0.5);
    void rdt;
  }

  begin(): void {
    const s = this.s;
    // the rivals' marks are decided now; the race shows them
    this.plans = [];
    for (let i = 1; i < 4; i++) {
      const e = s.entrants[i];
      const weak = e.base + (Math.random() - 0.5) * 0.6;
      const mark = rivalMark(this.id, weak, this.easy);
      this.times[i] = mark;
      this.plans[i] = racePlan(mark, this.len, 0.13 + Math.random() * 0.08, this.tau);
    }
    this.strip = new RaceStrip(s, s.entrants);
    this.meter = new Meter(s, 640, 636, 340, t('speed'));
    s.ui.add([this.strip.root, this.meter.root]);
    this.calls = new StartCalls(s, (st) => {
      // on your marks: standing at the blocks; set: down in the crouch
      for (const e of s.entrants) e.athlete.play(st === 'marks' ? 'idle' : 'crouch', { fade: 0.35 });
      if (st === 'marks') {
        // the TV start shot: from down the track, the athletes' faces in their lanes
        s.camTo(new THREE.Vector3(7.5, 2.3, this.lane(0) + 4.2), new THREE.Vector3(-0.2, 0.7, this.lane(1.6)), 1.5);
        this.reset();
      }
    });
    this.calls.begin();
    s.eventHud(secs(0));
  }

  protected reset(): void {
    this.state = 'start';
    this.raceT = 0;
    this.v = 0;
    this.x = [0, 0, 0, 0];
    this.moved = false;
    this.lastSide = null;
    this.cad.reset();
    this.s.entrants.forEach((e, i) => e.athlete.root.position.set(0, 0, this.lane(i)));
    this.s.pad.reset();
  }

  /** Run taps this frame (with the sprint's alternation rule). Returns how many count. */
  protected runTaps(): number {
    let n = 0;
    for (const side of ['L', 'R'] as const) {
      while (this.s.pad.pressed(side)) {
        if (this.lastSide === side && this.moved) {
          // the same side twice: a stumble
          this.v *= 0.86;
          if (this.stumbleT <= 0) {
            this.s.popAt(this.playerPos().add(new THREE.Vector3(0, 2.4, 0)), t('stumble'), '#ff9a7a', 24);
            this.s.sfx('stumble', { volume: 0.5 });
            this.stumbleT = 0.6;
          }
        } else n++;
        this.lastSide = side;
      }
    }
    return n;
  }

  protected playerPos(): THREE.Vector3 {
    return new THREE.Vector3(this.x[0], 0, this.lane(0));
  }

  update(dt: number): void {
    const s = this.s;
    this.stumbleT -= dt;
    if (this.state === 'start') {
      const taps = this.runTaps() + this.jumpTapsEarly();
      const r = this.calls.update(dt, taps > 0);
      if (r === 'gun') {
        this.state = 'run';
        this.raceT = 0;
        this.s.pad.reset();
        this.lastSide = null;
      } else if (r === 'dq') {
        this.dq = true;
        this.state = 'run';
        this.raceT = 0;
        s.entrants[0].athlete.play('emote-no');
      }
      return;
    }
    this.raceT += dt;
    const now = this.raceT;
    // ---- the player
    if (!this.dq && Number.isNaN(this.times[0])) {
      const taps = this.runTaps();
      for (let k = 0; k < taps; k++) {
        if (!this.moved) {
          this.moved = true;
          this.calls.reaction = now;
          s.popAt(this.playerPos().add(new THREE.Vector3(0, 2.5, 0)), t('reaction', { s: num(now, 2) }), now < 0.2 ? '#7dff9a' : '#ffffff', 22);
          this.v = 2.5;
        }
        this.cad.tap(now);
        if (k === 0) s.sfx('step', { volume: 0.25 });
      }
      this.playerInput(now);
      const tn = this.tune;
      const f = this.moved ? stride(this.cad.rate(now), tn.useful, this.cad.evenness()) : 0;
      const target = tn.vmax * f * this.speedCap();
      this.v += (target - this.v) * Math.min(1, dt * (target > this.v ? tn.acc : 1.3));
      const prev = this.x[0];
      this.x[0] += this.v * dt;
      this.afterMove(prev, this.x[0], now);
      this.meter.set(this.v / tn.vmax);
      s.eventHud(secs(now));
      if (this.x[0] >= this.len) {
        const over = (this.x[0] - this.len) / Math.max(0.1, this.v);
        this.times[0] = Math.round((now - over) * 100) / 100;
        this.playerFinished();
      } else if (now > 40) {
        this.dq = true;
      }
    } else if (!this.dq) {
      // past the line: ease off
      this.v = Math.max(0, this.v - dt * EASE_OFF);
      this.x[0] += this.v * dt;
    }
    // ---- the rivals
    for (let i = 1; i < 4; i++) this.x[i] = this.rivalAt(i, now).x;
    // ---- animation and positions
    s.entrants.forEach((e, i) => {
      const a = e.athlete;
      const speed = i === 0 ? this.v : this.rivalAt(i, now).v;
      const done = !Number.isNaN(this.times[i]) && this.x[i] >= this.len;
      if (i === 0 && this.dq) a.play(this.raceT < 1.4 ? 'emote-no' : 'idle', { fade: 0.3 });
      else if (done && speed < 2.2) {
        // past the line and stopped: the winner celebrates, the rest get their breath back
        if (this.finishOrder(i) === 1) celebrate(a, this.raceT - this.times[i]);
        else a.play('idle', { fade: 0.4 });
      } else if (speed < 0.3 && this.x[i] < 0.5) a.play('crouch', { fade: 0.2 });
      else this.animate(i, a, speed, this.x[i]);
      a.root.position.x = this.x[i];
      this.strip.set(i, this.x[i] / this.len);
    });
    this.camera();
    // ---- the end
    if (this.state === 'run' && (!Number.isNaN(this.times[0]) || this.dq)) this.state = 'after';
    if (this.state === 'after') {
      this.afterT += dt;
      const last = Math.max(this.times[1], this.times[2], this.times[3]);
      if (now > last + 0.4 && this.afterT > 1.6) s.finishEvent();
    }
  }

  /** Hurdles: jump presses before the gun count as a false start too. */
  protected jumpTapsEarly(): number {
    return 0;
  }

  /** Hurdles: the jump button. */
  protected playerInput(_now: number): void {}

  /** Hurdles: lower top speed while recovering from a hit. */
  protected speedCap(): number {
    return 1;
  }

  /** Hurdles: hurdle checks. */
  protected afterMove(_prev: number, _x: number, _now: number): void {}

  /** The running animation: the sprint clip at the athlete's speed; a stumble shows the fall clip. */
  protected animate(i: number, a: Athlete, speed: number, _x: number): void {
    if (i === 0 && this.stumbleT > 0.3) a.play('fall', { fade: 0.08 });
    else a.run(speed);
  }

  /** A rival's place and speed: the race plan up to the line, then easing off. */
  protected rivalAt(i: number, now: number): { x: number; v: number } {
    const T = this.times[i];
    if (now <= T) return { x: this.plans[i](now), v: planSpeed(this.plans[i], now) };
    const v0 = planSpeed(this.plans[i], T - 0.02);
    const d = Math.min(now - T, v0 / EASE_OFF);
    return { x: this.len + v0 * d - (EASE_OFF / 2) * d * d, v: Math.max(0, v0 - EASE_OFF * d) };
  }

  /** Place of entrant i among the finished times (1 = first). */
  protected finishOrder(i: number): number {
    return 1 + [0, 1, 2, 3].filter((k) => k !== i && this.times[k] < this.times[i]).length;
  }

  /** The player's place among the finished times (1 = first). */
  protected place(): number {
    return 1 + [1, 2, 3].filter((i) => this.times[i] < this.times[0]).length;
  }

  protected playerFinished(): void {
    const s = this.s;
    const place = this.place();
    s.eventHud(secs(this.times[0]));
    s.slowMo(0.3, 900);
    s.cheer(place === 1 ? 1 : 0.7);
    s.call(t('finish'), '#ffd23f', { size: 64, hold: 900 });
    s.popAt(new THREE.Vector3(this.len, 2.8, this.lane(0)), secs(this.times[0]), '#ffffff', 34);
    s.sfx('finish', { volume: 0.6 });
    this.meter.set(0);
  }

  protected camera(): void {
    const s = this.s;
    if (this.state === 'start') return;
    let cx = this.dq ? Math.max(...this.x.slice(1)) - 3 : this.x[0];
    if (!Number.isNaN(this.times[0])) cx = this.len;
    cx = Math.min(cx, this.len + 2);
    s.camTo(new THREE.Vector3(cx - 0.8, 3.4, this.lane(0) + 8.6), new THREE.Vector3(cx + 2.6, 0.75, this.lane(1.6)), this.raceT < 0.6 ? 2.5 : 5);
  }

  marks(): number[] {
    const m = [...this.times];
    if (this.dq) m[0] = NaN;
    return m;
  }

  cleanup(): void {
    this.s.eventHud('');
  }
}
