// Coaster Rush: the ride, simulated. Deterministic (seeded course, fixed steps, no clocks or
// Math.random) and free of three.js and Phaser, so the view, the menu's autopilot and the headless
// balance run all play the very same rules.
//
// The train is a chain of cars along the track's arc length. Gravity pulls along the average slope
// under its cars (a long train is pulled over a crest by its front), rolling friction and air drag
// slow it, and the player's three inputs act through the track: POWER engages the chain on a lift
// (release and the anti-rollback dogs hold the train), pushes on a booster strip and gives a weak
// motor anywhere else; BRAKE slows the train; at a junction LEFT / RIGHT pick the branch.
//
// The riders feel the track: the curvature vector times the speed squared plus gravity gives the
// g-force along the track's up (airtime when it drops near zero, crushing in a loop's bottom) and
// sideways. Too much sideways pull for the train's grip fills the lean meter; past its limit for
// long enough the train derails (a safety bar forgives one). Too little speed for a hill or a loop
// and the train rolls back; once it settles the park's launch pushes it on again. Every station
// asks for a stop inside its glowing bay: the riders get off (they pay their fare, more when happy)
// and the queue boards. Thrill (speed, airtime, drops, loops, near-misses past the houses) is the
// score; scaring the riders (hard leans, harsh braking, stalls, derails) costs their happiness, and
// when it runs out they all walk off. Hearts are trains: a derail costs one.
import { Course, LOOP_SPEED, STEP, newSample, type Fork, type Section, type Station, type Pickup, type Sample, type Feature } from './track';
import { G, TUNING, POWER_TIME, POWERS, STYLES, areaOf, clamp, lapOf, type Mode, type Power, type Tuning, type Style } from './defs';
import { BASE, NO_UPGRADES, UP, type Upgrades } from './upgrades';

export interface Input {
  power: boolean;
  brake: boolean;
  /** Branch wanted at the next junction: +1 left, −1 right, 0 no change. */
  pick: number;
}
export const NO_INPUT: Input = { power: false, brake: false, pick: 0 };

export type OverReason = 'derail' | 'refund';

export type SimEvent =
  | { type: 'chain'; on: boolean }
  | { type: 'crest' }
  | { type: 'drop'; height: number }
  | { type: 'airtime'; t: number; pts: number }
  | { type: 'loop'; pts: number }
  | { type: 'nearMiss'; pts: number; house: number }
  | { type: 'pickup'; p: Pickup; value: number }
  | { type: 'power'; kind: Power; again: boolean }
  | { type: 'powerEnd'; kind: Power }
  | { type: 'leanWarn' }
  | { type: 'derail'; hearts: number }
  | { type: 'saved' }
  | { type: 'respawn' }
  | { type: 'stall' }
  | { type: 'launch' }
  | { type: 'boost' }
  | { type: 'brakeHarsh' }
  | { type: 'stationNear'; station: Station }
  | { type: 'stop'; quality: 'perfect' | 'good' | 'ok'; off: number; on: number; fare: number; pts: number; station: Station }
  | { type: 'boarded'; station: Station }
  | { type: 'missed'; station: Station }
  | { type: 'area'; n: number }
  | { type: 'forkNear'; fork: Fork }
  | { type: 'fork'; side: number; thrill: boolean }
  | { type: 'splash'; speed: number }
  | { type: 'over'; reason: OverReason };

export interface Stats {
  areas: number;
  stations: number;
  perfect: number;
  missed: number;
  airtime: number;
  loops: number;
  nearMiss: number;
  coins: number;
  topSpeed: number;
  derails: number;
  stalls: number;
  powers: number;
  riders: number;
  thrillRides: number;
}

/** Train state for the view. */
export type State = 'ride' | 'board' | 'derail' | 'over';

export class Sim {
  readonly course: Course;
  readonly tune: Tuning;
  /** Chosen sections, in order (the train runs along these). */
  readonly route: Section[] = [];
  fork: Fork | null = null;
  /** Branch picked for the pending junction: +1 left, −1 right. */
  choice = 1;
  /** Arc length of the front car, its speed (negative: rolling back). */
  s = 0;
  v = 0;
  state: State = 'ride';
  stateT = 0;
  time = 0;
  score = 0;
  tokens = 0;
  hearts: number;
  maxHearts: number;
  happy: number;
  riders = 0;
  seats: number;
  cars: number;
  style: Style;
  /** The area the front car is in. */
  area = 0;
  readonly stats: Stats = { areas: 0, stations: 0, perfect: 0, missed: 0, airtime: 0, loops: 0, nearMiss: 0, coins: 0, topSpeed: 0, derails: 0, stalls: 0, powers: 0, riders: 0, thrillRides: 0 };
  /** Power-up timers (the safety bar is 1 while it is on). */
  readonly power: Record<Power, number> = { turbo: 0, magnet: 0, safety: 0, slowmo: 0, golden: 0, balloon: 0 };
  readonly powerMax: Record<Power, number> = { turbo: POWER_TIME.turbo, magnet: POWER_TIME.magnet, safety: 1, slowmo: POWER_TIME.slowmo, golden: POWER_TIME.golden, balloon: POWER_TIME.balloon };
  /** G-forces the riders feel (in g): along the track's up and sideways (left +). */
  vg = 1;
  lg = 0;
  /** Lateral pull over the grip (1 = the limit) and how long it has been over. */
  lean = 0;
  derailT = 0;
  grip: number;
  /** Seconds of the current airtime. */
  airT = 0;
  /** Inputs as last applied (the view shows sparks and the chain). */
  powerOn = false;
  braking = false;
  onLift = false;
  onBoost = false;
  /** The park's launch after a stall: target speed (0 when off). */
  launch = 0;
  rollT = 0;
  over = false;
  overReason: OverReason | null = null;
  events: SimEvent[] = [];
  /** Recommended speed band for what comes next (kit units per second; 0: none). */
  band = { min: 0, max: 0, kind: '' as '' | 'corner' | 'loop' | 'hill' | 'station' };
  /** Time scale the slow-mo brakes ask for. */
  get timeScale(): number { return this.power.slowmo > 0 ? 0.62 : 1; }
  /** The grip right now: it tightens a little with every area (the difficulty ramp). */
  get gripNow(): number { return this.grip * (1 - Math.min(0.2, this.area * 0.022 * this.tune.ramp)); }
  /** Derail: where the train left the track (for the view). */
  derailAt = { s: 0, v: 0, side: 1 };

  private sample = newSample();
  private carSample = newSample();
  private nextPick = 0;
  private nextNear = 0;
  private stationDone = new Set<Station>();
  private nearWarned = new Set<Station>();
  private forkWarned = new Set<Fork>();
  private loopsDone = new Set<Feature>();
  private dropsDone = new Set<Feature>();
  private leanWarned = false;
  private harshT = 0;
  private bandT = 0;
  private boardT = 0;
  private boardStation: Station | null = null;
  private wasRolling = false;
  private lastFlag = '';

  constructor(readonly mode: Mode, readonly seed: number, readonly up: Upgrades = NO_UPGRADES, o: { startArea?: number } = {}) {
    this.tune = TUNING[mode];
    this.course = new Course(seed);
    this.hearts = this.maxHearts = this.tune.hearts;
    this.happy = this.tune.happy;
    this.cars = BASE.cars + up.cars * UP.cars;
    this.seats = this.cars * 2;
    this.grip = this.tune.grip + up.grip * UP.grip;
    if (up.safety) this.power.safety = 1;
    // the first area and the next one (the course is always built up to the coming junction)
    const a0 = this.course.buildArea(o.startArea ?? 0, null, 1);
    this.route.push(a0.sections[0]);
    this.area = a0.n;
    this.style = a0.def.style;
    this.extend();
    // the train waits in the first station with its first riders on board
    const st = a0.sections[0].start ?? a0.sections[0].station!;
    this.s = st.stop;
    this.stationDone.add(st);
    this.riders = Math.min(this.seats, st.queue + 2);
    this.stats.riders = this.riders;
  }

  // -------------------------------------------------------------- route

  /** Builds the next area after the route's last section (when no junction is pending). */
  private extend(): void {
    if (this.fork) return;
    const last = this.route[this.route.length - 1];
    const a = this.course.buildArea(this.course.built, last, 1);
    this.route.push(a.sections[0]);
    this.fork = a.fork;
    if (this.fork) this.choice = -this.fork.thrillSide; // the safe ride unless the player asks
    else this.extend();
  }

  get routeEnd(): number { return this.route[this.route.length - 1].s1; }
  /** Length from the front car to the back of the last car. */
  get length(): number { return (this.cars - 1) * STYLES[this.style].pitch; }

  /** Samples the route (or the branch the player picked, past the junction) at `s`. */
  at(s: number, out: Sample = this.sample): Sample {
    if (this.fork && s > this.fork.s) {
      const b = this.choice > 0 ? this.fork.left : this.fork.right;
      return this.course.at([b], Math.min(s, b.s1), out);
    }
    return this.course.at(this.route, clamp(s, this.route[0].s0, this.routeEnd), out);
  }

  /** The section under `s` on the route (or the picked branch). */
  sectionAt(s: number): Section {
    if (this.fork && s > this.fork.s) return this.choice > 0 ? this.fork.left : this.fork.right;
    return this.course.sectionAt(this.route, s);
  }

  /** The next station ahead (on the route or the picked branch) not yet served. */
  nextStation(): Station | null {
    for (const sec of this.route) if (sec.station && !this.stationDone.has(sec.station) && sec.station.s1 > this.s - 1) return sec.station;
    if (this.fork) { const b = this.choice > 0 ? this.fork.left : this.fork.right; return b.station; }
    return null;
  }

  private decideFork(): void {
    const f = this.fork!;
    const b = this.choice > 0 ? f.left : f.right;
    const thrill = this.choice === f.thrillSide;
    this.route.push(b);
    this.fork = null;
    if (thrill) this.stats.thrillRides++;
    this.events.push({ type: 'fork', side: this.choice, thrill });
    this.extend();
  }

  // -------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    if (this.over) return;
    this.time += dt;
    this.events.length = this.events.length; // events are read and cleared by the caller
    for (const k of POWERS) {
      if (k === 'safety' || this.power[k] <= 0) continue;
      this.power[k] = Math.max(0, this.power[k] - dt);
      if (this.power[k] === 0) this.events.push({ type: 'powerEnd', kind: k });
    }
    if (inp.pick && this.fork) this.choice = inp.pick > 0 ? 1 : -1;
    if (this.state === 'derail') return this.derailStep(dt);
    if (this.state === 'board') return this.boardStep(dt);
    this.ride(dt, inp);
  }

  private ride(dt: number, inp: Input): void {
    const T = this.tune, up = this.up;
    const front = this.at(this.s, this.sample);
    // gravity along the average slope under the cars; flags under any car
    let slope = 0, lift = false, boost = false;
    const pitch = STYLES[this.style].pitch;
    for (let i = 0; i < this.cars; i++) {
      const c = i === 0 ? front : this.at(this.s - i * pitch, this.carSample);
      slope += c.ty;
      if (c.flag === 'lift') lift = true;
      if (i === 0 && c.flag === 'boost') boost = true;
    }
    slope /= this.cars;
    let g = G;
    if (this.power.balloon > 0 && slope > 0) g *= 0.45;
    let a = -g * slope;
    const v = this.v;
    a -= (0.25 + 0.0042 * v * v) * Math.sign(v);
    const power = inp.power, brake = inp.brake;
    this.powerOn = power;
    this.braking = brake && Math.abs(v) > 0.05;
    this.onBoost = boost && power;
    const chainV = BASE.chain + up.lift * UP.lift;
    if (lift !== this.onLift) this.events.push({ type: 'chain', on: lift });
    this.onLift = lift;
    if (lift) {
      // the chain: pulls at its own speed while POWER is held; the dogs never let it roll back
      if (power && v < chainV) a = Math.max(a, 7);
      else if (!power && v < chainV + 0.5) a = Math.min(a, -4);
    } else if (boost && power) {
      const top = BASE.boostMax + up.booster * UP.booster + (this.power.turbo > 0 ? 3 : 0);
      if (v < top) a += BASE.boostA + up.booster * UP.booster;
    } else if (power) {
      const turbo = this.power.turbo > 0;
      const top = turbo ? 17 : T.motorMax;
      if (v < top) a += turbo ? 9 : T.motor;
    }
    if (boost && power && this.lastFlag !== 'boost') this.events.push({ type: 'boost' });
    this.lastFlag = boost && power ? 'boost' : '';
    // the park's launch after a stall
    if (this.launch > 0) {
      if (v < this.launch) a = Math.max(a, 0) + 9;
      else this.launch = 0;
    }
    const brakeA = (BASE.brake + up.brakes * UP.brakes) * (this.power.slowmo > 0 ? 1.4 : 1);
    let nv = v + a * dt;
    if (brake) {
      const b = brakeA * dt;
      nv = nv > 0 ? Math.max(0, nv - b) : Math.min(0, nv + b);
    }
    if (lift && !power) nv = Math.max(0, nv);
    // a train at rest in a station or on the flat stays put
    if (Math.abs(nv) < 0.06 && Math.abs(slope) < 0.02 && !power && this.launch === 0) nv = 0;
    this.v = nv;
    const s0 = this.s;
    this.s += nv * dt;
    const minS = this.route[0].s0 + this.length + 0.05;
    if (this.s < minS) { this.s = minS; this.v = Math.max(0, this.v); }
    if (this.fork && this.s >= this.fork.s - 0.05) this.decideFork();
    if (!this.fork && this.s > this.routeEnd - 0.01) { this.s = this.routeEnd - 0.01; this.v = 0; }
    this.stats.topSpeed = Math.max(this.stats.topSpeed, Math.abs(this.v));
    this.forces();
    this.leanCheck(dt);
    this.rollback(dt, lift);
    this.thrill(dt, brake, lift);
    this.pickups(s0);
    this.features(s0);
    this.stations();
    this.areaCheck();
    this.bandT -= dt;
    if (this.bandT <= 0) { this.bandT = 0.1; this.updateBand(); }
  }

  /** The g-forces at the front car. */
  private forces(): void {
    const f = this.at(this.s, this.sample);
    const v2 = this.v * this.v;
    const fx = f.kx * v2, fy = f.ky * v2 + G, fz = f.kz * v2;
    // lateral axis (left) = up × forward
    const lx = f.uy * f.tz - f.uz * f.ty, ly = f.uz * f.tx - f.ux * f.tz, lz = f.ux * f.ty - f.uy * f.tx;
    this.vg = (fx * f.ux + fy * f.uy + fz * f.uz) / G;
    this.lg = (fx * lx + fy * ly + fz * lz) / G;
  }

  private leanCheck(dt: number): void {
    const T = this.tune;
    const grip = this.gripNow;
    this.lean = Math.abs(this.lg) / grip;
    if (this.lean > 0.85 && !this.leanWarned) { this.leanWarned = true; this.events.push({ type: 'leanWarn' }); }
    if (this.lean < 0.6) this.leanWarned = false;
    if (this.lean > 1) this.derailT += dt * (1 + (this.lean - 1) * 4);
    else this.derailT = Math.max(0, this.derailT - dt * 1.5);
    if (this.derailT > T.leanTime) {
      if (this.power.safety > 0) {
        this.power.safety = 0;
        this.derailT = 0;
        this.v *= 0.62;
        this.events.push({ type: 'saved' });
        this.events.push({ type: 'powerEnd', kind: 'safety' });
        return;
      }
      this.derail();
    }
  }

  private derail(): void {
    this.state = 'derail';
    this.stateT = 0;
    this.derailAt = { s: this.s, v: this.v, side: Math.sign(this.lg) || 1 };
    this.hearts--;
    this.stats.derails++;
    this.happy = Math.max(0, this.happy - 18 * this.tune.happyLoss);
    this.events.push({ type: 'derail', hearts: this.hearts });
  }

  private derailStep(dt: number): void {
    this.stateT += dt;
    if (this.stateT < 2.1) return;
    if (this.hearts <= 0) return this.end('derail');
    // the park's crane puts the train back just past the element it flew off, rolling gently
    const sec = this.sectionAt(this.derailAt.s);
    const f = sec.features.find((q) => q.s0 <= this.derailAt.s && q.s1 >= this.derailAt.s);
    const past = Math.min((f ? f.s1 : this.derailAt.s) + 1.5 + this.length, this.routeEnd - 1);
    this.place(past, 3);
    this.v = 3;
    this.derailT = 0;
    this.lean = 0;
    this.launch = 0;
    this.state = 'ride';
    this.stateT = 0;
    // anything past the respawn point that was collected stays collected; near-misses rewind
    this.events.push({ type: 'respawn' });
  }

  /** Too slow for a hill or a loop: the train rolls back, settles and gets launched again. */
  private rollback(dt: number, lift: boolean): void {
    const rolling = this.v < -0.15 && !lift;
    if (rolling) {
      this.rollT += dt;
      if (!this.wasRolling && this.rollT > 0.25) {
        this.wasRolling = true;
        this.stats.stalls++;
        this.happy = Math.max(0, this.happy - 10 * this.tune.happyLoss);
        this.events.push({ type: 'stall' });
      }
    } else if (this.wasRolling && this.v >= -0.05) {
      // it has settled: launch it at what the next climb needs
      this.wasRolling = false;
      this.rollT = 0;
      this.launch = Math.min(14, this.needSpeed(this.s) + 1.2);
      this.events.push({ type: 'launch' });
    } else if (!rolling) this.rollT = 0;
  }

  /** Speed needed at `s` to clear what comes in the next 30 units (a crest or a loop). */
  needSpeed(s: number): number {
    const here = this.at(s, this.carSample).y;
    let top = here, need = 0;
    const sec = this.sectionAt(s);
    for (const f of sec.features) if (f.kind === 'loop' && f.s0 > s && f.s0 - s < 30) need = Math.max(need, LOOP_SPEED);
    for (let d = 0.5; d < 30; d += 0.5) {
      const p = this.at(s + d, this.carSample);
      if (p.flag === 'lift' || p.flag === 'station') break;
      top = Math.max(top, p.y);
    }
    return Math.max(need, Math.sqrt(Math.max(0, 2 * G * (top - here))) + 1.5);
  }

  // -------------------------------------------------------------- thrill, happiness, pickups

  private thrill(dt: number, brake: boolean, lift: boolean): void {
    const T = this.tune, v = Math.abs(this.v);
    const comfort = 1 - this.up.comfort * UP.comfort;
    const loss = T.happyLoss * comfort;
    const lap = lapOf(this.area);
    const golden = this.power.golden > 0 ? 2 : 1;
    const happyK = 0.5 + this.happy / 100;
    const air = this.vg < 0.35 && v > 2;
    let rate = Math.max(0, v - 4.5) * 0.7 + (air ? 9 : 0) + Math.max(0, this.vg - 2.2) * 1.5 + (this.lean > 0.35 && this.lean < 0.85 ? this.lean * 4 : 0);
    rate *= this.riders * happyK * golden * (1 + lap * 0.25);
    this.score += rate * dt;
    // happiness
    let dh = 0;
    if (this.lean > 0.85) dh -= 16 * (this.lean - 0.85) / 0.15 * loss;
    if (this.vg > 5.6) dh -= 5 * loss;
    if (brake && v > 8.5) {
      dh -= 3 * loss;
      this.harshT += dt;
      if (this.harshT > 0.5) { this.harshT = -3; this.events.push({ type: 'brakeHarsh' }); }
    } else this.harshT = Math.min(0, this.harshT + dt);
    const st = this.at(this.s, this.carSample).flag;
    if (v < 2.2 && !lift && st !== 'station' && st !== 'brake' && this.launch === 0) dh -= 1.4 * loss;
    if (air) dh += 2.5;
    if (v > 8) dh += 0.5;
    this.happy = clamp(this.happy + dh * dt, 0, 100);
    // airtime moments
    if (air) this.airT += dt;
    else if (this.airT > 0) {
      if (this.airT > 0.12) {
        const pts = Math.round(this.riders * 6 * (1 + this.airT * 4) * golden * happyK);
        this.score += pts;
        this.stats.airtime += this.airT;
        this.happy = Math.min(100, this.happy + 2);
        this.events.push({ type: 'airtime', t: this.airT, pts });
      }
      this.airT = 0;
    }
    if (this.happy <= 0) this.end('refund');
  }

  private pickups(s0: number): void {
    const s1 = this.s;
    if (s1 <= s0) return;
    const mag = this.power.magnet > 0;
    const reach = mag ? BASE.magnetR + this.up.magnet * 1 : 0;
    const floating = this.vg < 0.45 || this.power.balloon > 0;
    const golden = this.power.golden > 0 ? 2 : 1;
    const check = (sec: Section) => {
      for (const p of sec.pickups) {
        if (p.taken || p.s > s1 + reach || p.s < s0 - 0.2) continue;
        if (p.h > 0 && !floating && !mag) continue;
        p.taken = true;
        if (p.kind === 'coin' || p.kind === 'ticket') {
          const value = p.kind === 'coin' ? 1 : 5;
          this.tokens += value;
          this.stats.coins += value;
          this.score += value * 4 * golden * Math.max(1, this.riders) / 2;
          this.happy = Math.min(100, this.happy + 0.3);
          this.events.push({ type: 'pickup', p, value });
        } else {
          this.grant(p.kind);
          this.events.push({ type: 'pickup', p, value: 0 });
        }
      }
    };
    const sec = this.sectionAt(s1);
    check(sec);
    if (reach > 0) { const nxt = this.sectionAt(s1 + reach); if (nxt !== sec) check(nxt); }
  }

  /** Starts a power-up (or tops it up). */
  grant(k: Power): void {
    const again = k === 'safety' ? this.power.safety > 0 : this.power[k] > 0;
    if (k === 'safety') this.power.safety = 1;
    else {
      const t = POWER_TIME[k] + (k === 'magnet' ? this.up.magnet * UP.magnet : 0);
      this.power[k] = t;
      this.powerMax[k] = t;
    }
    this.stats.powers++;
    this.events.push({ type: 'power', kind: k, again });
  }

  /** Near-misses, loops and drops passed this step. */
  private features(s0: number): void {
    const s1 = this.s;
    if (s1 <= s0) return;
    const sec = this.sectionAt(s1);
    const golden = this.power.golden > 0 ? 2 : 1;
    const happyK = 0.5 + this.happy / 100;
    for (const n of sec.nearMiss) {
      if (n.s <= s0 || n.s > s1 || Math.abs(this.v) < 3) continue;
      const pts = Math.round(this.riders * 12 * golden * happyK);
      this.score += pts;
      this.stats.nearMiss++;
      this.happy = Math.min(100, this.happy + 2);
      this.events.push({ type: 'nearMiss', pts, house: n.house });
    }
    for (const f of sec.features) {
      if (f.kind === 'loop' && f.s1 - 1.5 > s0 && f.s1 - 1.5 <= s1 && !this.loopsDone.has(f)) {
        this.loopsDone.add(f);
        const pts = Math.round(this.riders * 40 * golden * happyK);
        this.score += pts;
        this.stats.loops++;
        this.happy = Math.min(100, this.happy + 4);
        this.events.push({ type: 'loop', pts });
      }
      if (f.kind === 'drop' && f.s0 + 0.5 > s0 && f.s0 + 0.5 <= s1 && !this.dropsDone.has(f)) {
        this.dropsDone.add(f);
        const top = this.at(f.s0, this.carSample).y, bottom = this.at(f.s1, this.carSample).y;
        this.events.push({ type: 'drop', height: top - bottom });
      }
      if (f.kind === 'drop' && f.s1 - 1 > s0 && f.s1 - 1 <= s1 && this.style === 'flume') this.events.push({ type: 'splash', speed: Math.abs(this.v) });
      if (f.kind === 'lift' && f.s1 - 0.5 > s0 && f.s1 - 0.5 <= s1) this.events.push({ type: 'crest' });
    }
  }

  // -------------------------------------------------------------- stations

  private stations(): void {
    const st = this.nextStation();
    if (st && !this.nearWarned.has(st) && st.stop - this.s < 26) { this.nearWarned.add(st); this.events.push({ type: 'stationNear', station: st }); }
    if (this.fork && !this.forkWarned.has(this.fork) && this.fork.s - this.s < 30) { this.forkWarned.add(this.fork); this.events.push({ type: 'forkNear', fork: this.fork }); }
    if (!st) return;
    const half = st.half * this.tune.bay;
    const off = this.s - st.stop;
    if (Math.abs(this.v) < 0.2 && Math.abs(off) <= half) {
      // stopped in the bay
      this.stationDone.add(st);
      const quality = Math.abs(off) < 0.35 ? 'perfect' : Math.abs(off) < half * 0.6 ? 'good' : 'ok';
      const golden = this.power.golden > 0 ? 2 : 1;
      const happyK = 0.5 + this.happy / 100;
      const offN = this.riders;
      const fare = Math.round(offN * (1 + this.happy / 45));
      const onN = Math.min(this.seats, st.queue);
      const pts = Math.round((offN * 30 * happyK + (quality === 'perfect' ? 300 : quality === 'good' ? 150 : 50)) * golden);
      this.score += pts;
      this.tokens += fare;
      this.stats.stations++;
      if (quality === 'perfect') this.stats.perfect++;
      this.happy = clamp((this.happy + 80) / 2 + (quality === 'perfect' ? 8 : quality === 'good' ? 4 : 0), 0, 100);
      this.events.push({ type: 'stop', quality, off: offN, on: onN, fare, pts, station: st });
      this.riders = onN;
      this.stats.riders += onN;
      this.v = 0;
      this.state = 'board';
      this.boardT = 0;
      this.boardStation = st;
      return;
    }
    if (off > half && this.v > 0) {
      this.stationDone.add(st);
      this.stats.missed++;
      this.happy = Math.max(0, this.happy - 10 * this.tune.happyLoss);
      this.events.push({ type: 'missed', station: st });
    }
  }

  private boardStep(dt: number): void {
    this.boardT += dt;
    this.v = 0;
    if (this.boardT > 2.0) {
      this.state = 'ride';
      this.events.push({ type: 'boarded', station: this.boardStation! });
      this.boardStation = null;
    }
  }

  /** The area banner once the front car is in a new area. */
  private areaCheck(): void {
    const sec = this.sectionAt(this.s);
    if (sec.area !== this.area && sec.part === 0) {
      this.area = sec.area;
      this.style = areaOf(sec.area).style;
      this.stats.areas++;
      this.events.push({ type: 'area', n: sec.area });
    }
  }

  // -------------------------------------------------------------- what comes next

  /** Speed limit for the train's grip at `s` (Infinity on straights). */
  limitAt(s: number, out = this.carSample): number {
    const f = this.at(s, out);
    const lx = f.uy * f.tz - f.uz * f.ty, ly = f.uz * f.tx - f.ux * f.tz, lz = f.ux * f.ty - f.uy * f.tx;
    const kl = f.kx * lx + f.ky * ly + f.kz * lz;
    if (Math.abs(kl) < 0.03) return Infinity;
    const grip = this.gripNow;
    // |v² kl + G ly| ≤ grip G (a banked piece lets gravity take some of the pull)
    const side = Math.sign(kl);
    return Math.sqrt(Math.max(0.5, (grip * G - side * G * ly) / Math.abs(kl)));
  }

  private updateBand(): void {
    let max = Infinity, kind: typeof this.band.kind = '';
    for (let d = 0; d < 26; d += 0.5) {
      const lim = this.limitAt(this.s + d);
      if (lim < max) { max = lim; kind = 'corner'; }
    }
    const st = this.nextStation();
    if (st && st.stop - this.s < 22 && st.stop - this.s > -1) { max = Math.min(max, Math.sqrt(Math.max(0, 2 * 6 * (st.stop - this.s)))); kind = 'station'; }
    let min = 0;
    const sec = this.sectionAt(this.s);
    for (const f of sec.features) if (f.kind === 'loop' && f.s0 > this.s - 0.5 && f.s0 - this.s < 24) { min = LOOP_SPEED; if (kind !== 'station') kind = 'loop'; }
    this.band = { min, max: isFinite(max) ? max : 0, kind };
  }

  // -------------------------------------------------------------- the end

  private end(reason: OverReason): void {
    if (this.over) return;
    this.over = true;
    this.overReason = reason;
    this.state = 'over';
    this.events.push({ type: 'over', reason });
  }

  /** A rewarded continue: one more train, the riders calmed, back on the track before the trouble. */
  revive(): void {
    this.over = false;
    this.overReason = null;
    this.hearts = Math.max(1, this.hearts + 1);
    this.happy = Math.max(this.happy, 55);
    this.state = 'ride';
    this.stateT = 0;
    this.s = Math.max(this.route[0].s0 + this.length + 0.1, this.s - 10);
    this.v = 3.5;
    this.derailT = 0;
    this.launch = 0;
    this.events.push({ type: 'respawn' });
  }

  /** Test hook: moves the train to `s` at speed `v`. */
  place(s: number, v: number): void {
    while (this.fork && s > this.fork.s) this.decideFork();
    this.s = s; this.v = v; this.state = 'ride'; this.derailT = 0;
    this.areaCheck();
  }
}
