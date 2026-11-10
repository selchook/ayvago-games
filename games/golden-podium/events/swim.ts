// 50 m freestyle: dive on the gun, then STROKE on the beat (a ring closes on the target). On-beat
// strokes keep the speed up, off-beat or doubled ones lose it, so rhythm beats mashing. The air
// runs down: BREATHE when it is low (it skips one stroke); with no air the swimmer slows hard.
import Phaser from 'phaser';
import { t, txt } from '@core';
import { THREE } from '@core/three';
import { SportEvent, StartCalls, racePlan, planSpeed } from './base';
import { poolLaneZ, POOL_LEN, WATER_Y, waveWater } from '../stadium';
import { Meter, RaceStrip } from '../panels';
import { rivalMark, type EventId } from '../scoring';
import { secs, num } from '../strings';
import type { PadButton } from '../pad';
import type { Shot } from '../portraits';
import { HIP, celebrate } from '../athlete';

export const SWIM_TUNE = {
  normal: { beat: 0.5, win: [0.065, 0.125, 0.19], vmax: 2.45, airSecs: 7 },
  easy: { beat: 0.6, win: [0.09, 0.16, 0.24], vmax: 2.45, airSecs: 9.5 },
};
const BLOCK_Y = 0.62;
/** Metres per arm stroke (the arms turn over with the swimmer's speed). */
const STROKE_M = 1.2;
/** How deep the body lies: the back and the head just break the surface. */
const FLOAT = -HIP - 0.14;
/** Treading water at the wall after the finish: head and shoulders out. */
const TREAD = -0.85;
const DIVE = 0.55;
const DIVE_X = 3.6;

type Judge = 'perfect' | 'good' | 'ok' | 'miss';
const QUALITY: Record<Judge, number> = { perfect: 1, good: 0.86, ok: 0.6, miss: 0.15 };
const COLOR: Record<Judge, string> = { perfect: '#7dff9a', good: '#3ee6ff', ok: '#ffd23f', miss: '#ff9a7a' };

export class Swim extends SportEvent {
  readonly id: EventId = 'swim';
  private calls!: StartCalls;
  private state: 'start' | 'race' | 'after' = 'start';
  private raceT = 0;
  private x = [0, 0, 0, 0];
  private v = 0;
  private times: number[] = [NaN, NaN, NaN, NaN];
  private plans: ((t: number) => number)[] = [];
  private reacts: number[] = [];
  private dq = false;
  private diveAt = -1;
  private entry = -1;
  private judged = new Map<number, number>();
  private q = 0.75;
  private air = 1;
  private breathT = 0;
  private skipBeat = -1;
  private strokeN = 0;
  private lastTick = 0;
  private afterT = 0;
  private strip!: RaceStrip;
  private airMeter!: Meter;
  private ring!: Phaser.GameObjects.Graphics;
  private judgeText!: Phaser.GameObjects.Text;
  private warnT = 0;
  private inWater = [false, false, false, false];
  private breaths = [0, 0, 0, 0];
  private doneT = [NaN, NaN, NaN, NaN];

  private get tune() {
    return this.easy ? SWIM_TUNE.easy : SWIM_TUNE.normal;
  }

  buttons(): PadButton[] {
    return [
      { id: 'B', label: t('b_breath'), x: 150, y: 590, color: 0x22c3b5, keys: ['ArrowUp', 'KeyW', 'ShiftLeft', 'ShiftRight'] },
      { id: 'S', label: t('b_stroke'), x: 1130, y: 590, color: 0xff6b4a, keys: ['Space', 'ArrowRight', 'KeyD', 'Enter'] },
    ];
  }

  picture(): Shot {
    return { clip: 'static', swim: true, yaw: 0.25 };
  }

  private lane(i: number): number {
    return poolLaneZ(i + 1);
  }

  setup(): void {
    const s = this.s;
    s.useVenue(s.venues.pool);
    s.entrants.forEach((e, i) => {
      e.athlete.root.position.set(-0.45, BLOCK_Y, this.lane(i));
      e.athlete.face(0).play('idle', { fade: 0 });
      e.athlete.showMarks(false);
    });
    s.cut(new THREE.Vector3(-9, 3.2, this.lane(0) + 9), new THREE.Vector3(3, 0, this.lane(2)));
    s.fov(50, true);
  }

  idle(): void {
    this.s.camTo(new THREE.Vector3(-7, 2.8, this.lane(0) + 8.5), new THREE.Vector3(3, 0, this.lane(2)), 0.5);
  }

  begin(): void {
    const s = this.s;
    this.plans = [];
    for (let i = 1; i < 4; i++) {
      const mark = rivalMark('swim', s.entrants[i].base + (Math.random() - 0.5) * 0.6, this.easy);
      this.times[i] = mark;
      this.reacts[i] = 0.14 + Math.random() * 0.1;
      // after the dive the plan covers the rest of the pool
      this.plans[i] = racePlan(mark - this.reacts[i] - DIVE, POOL_LEN - DIVE_X, 0, 1.2);
    }
    this.strip = new RaceStrip(s, 380, 900, 86, s.entrants);
    this.airMeter = new Meter(s, 640, 636, 300, t('air'), [0x3ee6ff, 0x3ee6ff, 0xff6b4a]);
    this.ring = s.add.graphics().setDepth(9000);
    this.judgeText = txt(s, 1110, 270, '', { title: true, size: 30 }).setDepth(9001);
    s.ui.add([this.strip.root, this.airMeter.root, this.ring, this.judgeText]);
    this.calls = new StartCalls(s, (st) => {
      // on the blocks, then bent forward ready to dive
      for (const e of s.entrants) e.athlete.play(st === 'marks' ? 'idle' : 'crouch', { fade: 0.35 });
      if (st === 'marks') {
        s.camTo(new THREE.Vector3(-6.5, 2.4, this.lane(0) + 6.5), new THREE.Vector3(2, 0.2, this.lane(2)), 1.5);
        this.reset();
      }
    });
    this.calls.begin();
    s.eventHud(secs(0));
  }

  private reset(): void {
    this.state = 'start';
    this.raceT = 0;
    this.v = 0;
    this.x = [0, 0, 0, 0];
    this.diveAt = this.entry = -1;
    this.judged.clear();
    this.q = 0.75;
    this.air = 1;
    this.skipBeat = -1;
    this.lastTick = 0;
    this.strokeN = 0;
    this.s.pad.reset();
    this.inWater = [false, false, false, false];
    this.doneT = [NaN, NaN, NaN, NaN];
    this.s.entrants.forEach((e, i) => {
      const a = e.athlete;
      a.root.position.set(-0.45, BLOCK_Y, this.lane(i));
      a.setSwim(false);
      a.lift = 0;
    });
  }

  update(dt: number, rdt: number): void {
    const s = this.s;
    const tn = this.tune;
    if (this.state === 'start') {
      let early = 0;
      while (s.pad.pressed('S')) early++;
      while (s.pad.pressed('B')) { /* ignored */ }
      const r = this.calls.update(dt, early > 0);
      if (r === 'gun') { this.state = 'race'; this.raceT = 0; s.pad.reset(); }
      else if (r === 'dq') { this.dq = true; this.state = 'race'; this.raceT = 0; }
      return;
    }
    this.raceT += dt;
    const now = this.raceT;
    const me = s.player.athlete;
    // ---- the player
    if (!this.dq && Number.isNaN(this.times[0])) {
      if (this.diveAt < 0) {
        if (s.pad.pressed('S')) {
          this.diveAt = now;
          s.popAt(new THREE.Vector3(0, 2.6, this.lane(0)), t('reaction', { s: num(now, 2) }), now < 0.2 ? '#7dff9a' : '#ffffff', 22);
          s.sfx('jump', { volume: 0.5 });
        }
        while (s.pad.pressed('B')) { /* not yet */ }
        if (now > 6) { this.diveAt = now; }
      } else if (this.entry < 0) {
        this.diveStep(0, now - this.diveAt);
        if (now - this.diveAt >= DIVE) {
          this.entry = now;
          this.v = 2.9;
          this.splashIn(0);
        }
      } else {
        this.swimInput(now, rdt);
        const airF = this.air > 0 ? 1 : 0.45;
        const target = tn.vmax * (0.3 + 0.7 * this.q) * airF;
        this.v += (target - this.v) * Math.min(1, dt * 1.6);
        this.x[0] += this.v * dt;
        // the race distance counts from the block; the body is drawn from where it went in
        me.root.position.set(DIVE_X + this.x[0] * (POOL_LEN - DIVE_X) / POOL_LEN, WATER_Y, this.lane(0));
        // the arms turn over with the speed: one arm stroke per STROKE_M metres
        me.setStroke(this.breathT > 0 ? 0.6 : this.v / STROKE_M);
        if (this.x[0] >= POOL_LEN) {
          this.x[0] = POOL_LEN;
          const over = 0;
          this.times[0] = Math.round((now - over) * 100) / 100;
          this.finish();
        }
      }
      s.eventHud(secs(now));
      if (now > 60) this.dq = true;
    } else if (!this.dq) this.atWall(0);
    else if (!this.inWater[0]) me.play(now < 1.4 ? 'emote-no' : 'idle', { fade: 0.3 });
    // ---- the rivals
    for (let i = 1; i < 4; i++) {
      const a = s.entrants[i].athlete;
      const since = now - this.reacts[i];
      if (since < 0) continue;
      if (since < DIVE) {
        this.diveStep(i, since);
        continue;
      }
      if (!this.inWater[i]) this.splashIn(i);
      const xr = Math.min(POOL_LEN, DIVE_X + this.plans[i](since - DIVE));
      this.x[i] = xr;
      a.root.position.set(xr, WATER_Y, this.lane(i));
      if (xr < POOL_LEN) {
        const v = planSpeed(this.plans[i], since - DIVE);
        a.setStroke(v / STROKE_M);
        // a breath every few strokes
        const k = Math.floor((since - DIVE) / 1.6 + i * 0.37);
        if (k !== this.breaths[i]) { this.breaths[i] = k; if (k % 2) a.breath(); }
        if (Math.random() < dt * 4 && v > 0.5) s.emit(new THREE.Vector3(xr + 0.8, WATER_Y + 0.1, this.lane(i)), 3, [0xffffff, 0xcdeeff], { speed: 0.9, up: 1.6, life: 0.45, size: 0.13 });
      } else this.atWall(i);
    }
    s.entrants.forEach((_, i) => this.strip.set(i, this.x[i] / POOL_LEN));
    // camera follows the player (or the leader once the player is out)
    const cx = this.dq ? Math.max(...this.x.slice(1)) : this.x[0];
    if (this.state !== 'after') s.camTo(new THREE.Vector3(Math.min(cx, POOL_LEN - 3) - 0.5, 6.0, this.lane(0) + 8.8), new THREE.Vector3(Math.min(cx, POOL_LEN - 3) + 3.2, -0.5, this.lane(1.4)), now < 1 ? 2 : 4);
    if (this.state === 'race' && (!Number.isNaN(this.times[0]) || this.dq)) this.state = 'after';
    if (this.state === 'after') {
      this.afterT += dt;
      if (this.dq) s.camTo(new THREE.Vector3(POOL_LEN - 3, 6.0, this.lane(0) + 8.8), new THREE.Vector3(POOL_LEN, -0.5, this.lane(1.4)), 2);
      const last = Math.max(this.times[1], this.times[2], this.times[3]);
      if (now > last + 0.3 && this.afterT > 1.8) s.finishEvent();
    }
  }

  /** From the block into the water: the jump clip, the body tipping forward over the arc. */
  private diveStep(i: number, since: number): void {
    const a = this.s.entrants[i].athlete;
    const p = Math.min(1, since / DIVE);
    a.play('jump', { fade: 0.08 });
    a.pitch = (0.35 + 0.65 * p) * Math.PI / 2 + Math.sin(p * Math.PI) * 0.25;
    a.lift = FLOAT * p;
    a.root.position.set(-0.3 + (DIVE_X + 0.3) * p, BLOCK_Y + (WATER_Y - BLOCK_Y) * p + Math.sin(p * Math.PI) * 0.7, this.lane(i));
  }

  private splashIn(i: number): void {
    const a = this.s.entrants[i].athlete;
    this.inWater[i] = true;
    a.setSwim(true);
    a.lift = FLOAT;
    a.root.position.y = WATER_Y;
    this.s.emit(new THREE.Vector3(DIVE_X, WATER_Y + 0.1, this.lane(i)), 18, [0xffffff, 0xcdeeff, 0x9fdcff], { speed: 1.8, up: 3, life: 0.6, size: 0.2 });
    this.s.sfx('splash', { volume: i === 0 ? 0.7 : 0.3 });
  }

  /** At the wall: up out of the flat stroke, treading water; the winner celebrates. */
  private atWall(i: number): void {
    const a = this.s.entrants[i].athlete;
    if (Number.isNaN(this.doneT[i])) {
      this.doneT[i] = this.raceT;
      a.setSwim(false);
      a.face(Math.PI / 2 + 0.6);
      a.lift = TREAD;
      a.play('idle', { fade: 0.2 });
    }
    const first = [0, 1, 2, 3].every((k) => k === i || !(this.doneT[k] < this.doneT[i]));
    if (first) {
      celebrate(a, this.raceT - this.doneT[i], false);
    }
    a.lift = TREAD;
  }

  private beatTime(k: number): number {
    return this.entry + k * this.tune.beat;
  }

  private swimInput(now: number, rdt: number): void {
    const s = this.s;
    const tn = this.tune;
    const me = s.player.athlete;
    // the metronome
    const kNow = Math.floor((now - this.entry) / tn.beat);
    if (kNow > this.lastTick && kNow >= 1) {
      this.lastTick = kNow;
      s.sfx('beat', { volume: 0.14, exact: true });
    }
    // breathing
    if (this.breathT > 0) {
      this.breathT -= rdt;
      this.air = Math.min(1, this.air + rdt / 0.4);
    } else this.air = Math.max(0, this.air - rdt / tn.airSecs);
    while (s.pad.pressed('B')) {
      if (this.breathT <= 0) {
        this.breathT = 0.42;
        this.skipBeat = Math.round((now - this.entry) / tn.beat + 0.5);
        s.sfx('breath', { volume: 0.5 });
        me.breath();
        s.emit(new THREE.Vector3(this.x[0] + 0.7, WATER_Y + 0.2, this.lane(0)), 6, [0xffffff], { speed: 0.4, up: 1.2, life: 0.6, size: 0.1, gravity: -1 });
      }
    }
    this.warnT -= rdt;
    if (this.air < 0.22 && this.warnT <= 0) {
      this.warnT = 1.3;
      s.call(t('noAir'), '#ff6b4a', { y: 420, size: 34, hold: 500 });
      s.sfx('warn', { volume: 0.35 });
    }
    // strokes
    while (s.pad.pressed('S')) {
      const k = Math.max(1, Math.round((now - this.entry) / tn.beat));
      const err = Math.abs(now - this.beatTime(k));
      let j: Judge = err <= tn.win[0] ? 'perfect' : err <= tn.win[1] ? 'good' : err <= tn.win[2] ? 'ok' : 'miss';
      if (this.judged.has(k) || this.breathT > 0) j = 'miss';
      this.judged.set(k, QUALITY[j]);
      this.q = this.q * 0.62 + QUALITY[j] * 0.38;
      this.judge(j);
      if (j !== 'miss') {
        this.strokeN++;
        s.emit(new THREE.Vector3(this.x[0] + 0.8, WATER_Y + 0.1, this.lane(0)), j === 'perfect' ? 8 : 5, [0xffffff, 0xcdeeff], { speed: 1.1, up: 1.9, life: 0.5, size: 0.14 });
        s.sfx('stroke', { volume: 0.4 });
      } else s.sfx('missbeat', { volume: 0.3 });
    }
    // beats that went by without a stroke
    for (let k = Math.max(1, kNow - 2); k <= kNow; k++) {
      if (!this.judged.has(k) && now > this.beatTime(k) + tn.win[2]) {
        this.judged.set(k, 0);
        if (k !== this.skipBeat) this.q *= 0.62;
      }
    }
    this.airMeter.set(this.air);
    this.drawRing(now);
  }

  private judge(j: Judge): void {
    this.judgeText.setText(t(j)).setColor(COLOR[j]).setScale(1.25).setAlpha(1);
    this.s.tweens.killTweensOf(this.judgeText);
    this.s.tweens.add({ targets: this.judgeText, scale: 1, duration: 120 });
    this.s.tweens.add({ targets: this.judgeText, alpha: 0, delay: 350, duration: 200 });
  }

  private drawRing(now: number): void {
    const g = this.ring;
    const tn = this.tune;
    const cx = 1110, cy = 400, r0 = 40;
    const phase = ((now - this.entry) / tn.beat) % 1;     // 0 just after a beat … 1 at the next
    const r = r0 + (1 - phase) * 70;
    g.clear();
    g.fillStyle(0x0b1028, 0.55).fillCircle(cx, cy, r0 + 74);
    const near = Math.min(phase, 1 - phase) * tn.beat;
    g.fillStyle(near <= tn.win[0] ? 0x7dff9a : 0x3ee6ff, near <= tn.win[1] ? 0.85 : 0.45).fillCircle(cx, cy, r0);
    g.lineStyle(6, 0xffffff, 0.9).strokeCircle(cx, cy, r0);
    g.lineStyle(5, 0xffd23f, 0.95).strokeCircle(cx, cy, r);
  }

  private finish(): void {
    const s = this.s;
    const place = 1 + [1, 2, 3].filter((i) => this.times[i] < this.times[0]).length;
    s.eventHud(secs(this.times[0]));
    s.slowMo(0.35, 800);
    s.cheer(place === 1 ? 1 : 0.7);
    s.call(t('finish'), '#ffd23f', { size: 64, hold: 900 });
    s.popAt(new THREE.Vector3(POOL_LEN, 1.8, this.lane(0)), secs(this.times[0]), '#ffffff', 34);
    s.sfx('finish', { volume: 0.6 });
    s.emit(new THREE.Vector3(POOL_LEN - 0.3, WATER_Y + 0.1, this.lane(0)), 16, [0xffffff, 0xcdeeff], { speed: 1.5, up: 2.6, life: 0.6, size: 0.18 });
    this.ring.clear();
  }

  frame(_dt: number, time: number): void {
    if (!this.s.venues.pool.visible) return;
    const wakes = this.s.entrants
      .map((e, i) => ({ x: e.athlete.root.position.x, z: this.lane(i), s: this.inWater[i] && Number.isNaN(this.doneT[i]) ? 1 : 0 }))
      .filter((w) => w.s > 0);
    waveWater(this.s.venues, time, wakes);
  }

  marks(): number[] {
    const m = [...this.times];
    if (this.dq) m[0] = NaN;
    return m;
  }

  cleanup(): void {
    this.s.eventHud('');
    for (const e of this.s.entrants) {
      e.athlete.setSwim(false);
      e.athlete.lift = 0;
    }
  }
}
