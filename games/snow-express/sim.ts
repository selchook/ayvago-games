// Snow Express: the simulation. Deterministic (seeded, no Math.random) and free of Phaser and
// three.js, so the menu's autopilot, the Play scene and the headless balance runs share it.
//
// Trains are a head distance along the chain of segments they have run (their path history); every
// car sits a fixed gap behind the locomotive on that same chain, so wagons bend through curves and
// switches exactly where the locomotive went. A train picks its next segment when its nose reaches
// the edge of the next tile, reading the switch there at that moment. Red signals and snow drifts
// stop a train at the tile edge; a train runs up behind a slower or stopped one and waits; anything
// else that brings two cars together is a crash.
import { Board, W, poseOn, type Pose, type LevelMap } from './graph';
import {
  TUNING, EXPRESS, PLOW, COCOA_SLOW, COCOA_TIME, GLOBE_TIME, POWER_EVERY, POWER_MAX, CAR_GAP, CRASH_DIST,
  Rng, clamp, type ColorId, type Mode,
} from './defs';
import { findRoute, reachable } from './route';

export type TrainKind = 'normal' | 'express' | 'plow';

export interface Spawn {
  /** Seconds after the start the train leaves the tunnel. */
  t: number;
  tunnel: number;
  color: ColorId | null;
  cars: number;
  kind: TrainKind;
}

export interface PathEntry { seg: number; fwd: boolean; start: number }

export type TrainState = 'run' | 'deliver' | 'lost' | 'crashed' | 'stuck';

export interface Train {
  id: number;
  color: ColorId | null;
  kind: TrainKind;
  /** Cars including the locomotive. */
  cars: number;
  path: PathEntry[];
  /** Distance of the locomotive's centre along the path. */
  head: number;
  speed: number;
  /** Cruising speed (tiles per second). */
  cruise: number;
  state: TrainState;
  /** Waiting at a red signal / a drift / behind another train. */
  held: 'signal' | 'drift' | 'queue' | null;
  /** Where it ends: the stop it runs into, or the tunnel it got lost in. */
  stop: number;
  tunnel: number;
  correct: boolean;
  /** Cars already inside the cabin (or the tunnel). */
  gone: number;
  /** Seconds since it crashed / got stuck (removed after a while). */
  outT: number;
  /** Poses of the cars this step (index 0 = locomotive). */
  poses: Pose[];
  /** Tunnel it came from. */
  from: number;
  /** Seconds since it came out. */
  age: number;
}

export type SimEvent =
  | { type: 'warn'; tunnel: number; color: ColorId | null; kind: TrainKind; at: number }
  | { type: 'spawn'; train: Train }
  | { type: 'flip'; control: number; junction: number; opt: number }
  | { type: 'signal'; control: number; signal: number; red: boolean }
  | { type: 'blocked'; control: number }
  | { type: 'enter'; train: Train; junction: number }
  | { type: 'deliver'; train: Train; stop: number; correct: boolean; points: number; mult: number }
  | { type: 'carIn'; train: Train; car: number; stop: number; correct: boolean }
  | { type: 'lost'; train: Train; tunnel: number }
  | { type: 'stuck'; train: Train; tile: number }
  | { type: 'clear'; train: Train; tile: number }
  | { type: 'plowDone'; train: Train; points: number }
  | { type: 'crash'; a: Train; b: Train; x: number; y: number; z: number; ends: boolean }
  | { type: 'remove'; train: Train }
  | { type: 'heart'; hearts: number }
  | { type: 'power'; kind: 'cocoa' | 'globe' }
  | { type: 'usePower'; kind: 'cocoa' | 'globe' }
  | { type: 'open'; stop: number }
  | { type: 'held'; train: Train; why: 'signal' | 'drift' }
  | { type: 'win' }
  | { type: 'fail'; reason: 'hearts' | 'crash' };

export interface SimInput {
  /** Controls (switches and signals, by control index) toggled this step. */
  flips: number[];
  power: 'cocoa' | 'globe' | null;
}
export const NO_INPUT: SimInput = { flips: [], power: null };

/** Rush: the timetable is made as the run goes (see rushSpawn). */
export interface RushSpec { colors: number; tunnels: number }

export interface SimSetup {
  map: LevelMap;
  mode: Mode;
  seed: number;
  /** Journey: the timetable. Rush: null (made on the fly). */
  spawns: Spawn[] | null;
  /** Level speed factor. */
  speed?: number;
  /** Rush only: the order the stops' colours open in. */
  rushOrder?: ColorId[];
}

const NOSE = 0.42;
const tmp: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

export class Sim {
  readonly board: Board;
  readonly mode: Mode;
  readonly rush: boolean;
  readonly rng: Rng;
  readonly tune: (typeof TUNING)['normal'];
  time = 0;
  trains: Train[] = [];
  /** Switch settings (0/1) by junction, signal states by signal. */
  readonly state: number[];
  readonly red: boolean[];
  /** Drift tiles still covered. */
  readonly drifts: Set<number>;
  events: SimEvent[] = [];
  hearts: number;
  readonly maxHearts: number;
  score = 0;
  /** Correct deliveries in a row (Rush combo) and perfect deliveries in a row (powers). */
  streak = 0;
  perfect = 0;
  mult = 1;
  powers = { cocoa: 0, globe: 0 };
  private nextPower: 'cocoa' | 'globe' = 'cocoa';
  cocoaT = 0;
  globeT = 0;
  over = false;
  won = false;
  failReason: 'hearts' | 'crash' | null = null;
  private endT = -1;
  readonly spawns: Spawn[];
  /** Index of the next timetable entry to come out, and warnings already sent. */
  private spawnIdx = 0;
  private warned = 0;
  /** The clock trains run on (Snow Globe stops it, Hot Cocoa slows it). */
  clock = 0;
  private nextId = 1;
  stats = { delivered: 0, correct: 0, wrong: 0, crashes: 0, lost: 0, stuck: 0, plows: 0 };
  /** Rush: colours open so far, and how far into the run (0..1+) the ramp is. */
  open: ColorId[] = [];
  private rushOrder: ColorId[] = [];
  private rushNext = 4;
  private rushCount = 0;
  /** Colours each tunnel can reach. */
  private reach: ColorId[][] = [];
  private lastOut: Spawn[] = [];
  readonly speedFactor: number;
  /** Seconds a crashed / stuck train stays before it is cleared. */
  static readonly WRECK_T = 1.8;

  constructor(setup: SimSetup) {
    this.board = new Board(setup.map);
    this.mode = setup.mode;
    this.rng = new Rng(setup.seed);
    this.tune = TUNING[setup.mode];
    this.rush = !setup.spawns;
    this.state = this.board.junctions.map(() => 0);
    this.red = this.board.signals.map(() => false);
    this.drifts = new Set(this.board.drifts);
    this.hearts = this.maxHearts = this.tune.hearts;
    this.speedFactor = setup.speed ?? 1;
    this.spawns = setup.spawns ? [...setup.spawns] : [];
    if (this.rush) {
      this.reach = this.board.tunnels.map((_, i) => reachable(this.board, i));
      this.rushOrder = setup.rushOrder ?? this.board.stops.map((s) => s.color);
      this.open = this.rushOrder.slice(0, 3);
      this.rushNext = 4;
      this.spawns.push(this.rushSpawn(3));
    }
  }

  // ------------------------------------------------------------------ helpers

  /** How far a Rush run has ramped up (0 at the start, 1 after about four minutes on Normal). */
  rushRamp(): number { return this.rush ? (this.clock / 240) * this.tune.ramp : 0; }

  /** Train speed for a kind right now. */
  private cruiseFor(kind: TrainKind): number {
    let v = this.tune.speed * this.speedFactor;
    if (this.rush) v *= Math.min(2.4, 1 + this.rushRamp() * 0.5);
    if (kind === 'express') v *= EXPRESS;
    if (kind === 'plow') v *= PLOW;
    return v;
  }

  /** The next Rush train, `after` seconds from now on the train clock. */
  private rushSpawn(after: number): Spawn {
    const r = this.rng, k = this.rushRamp();
    this.rushCount++;
    // a new colour opens every few trains
    if (this.rushCount >= this.rushNext && this.open.length < this.rushOrder.length) {
      const c = this.rushOrder[this.open.length];
      this.open.push(c);
      this.events.push({ type: 'open', stop: this.board.stops.findIndex((s) => s.color === c) });
      this.rushNext = this.rushCount + 7 + this.open.length;
    }
    // a tunnel with an open colour to send
    let tunnel = r.int(0, this.board.tunnels.length - 1);
    let colors = this.open.filter((c) => this.reach[tunnel].includes(c));
    for (let i = 0; i < this.board.tunnels.length && !colors.length; i++) {
      tunnel = (tunnel + 1) % this.board.tunnels.length;
      colors = this.open.filter((c) => this.reach[tunnel].includes(c));
    }
    const color = colors.length ? r.pick(colors) : r.pick(this.open);
    const kind: TrainKind = r.chance(0.08 + k * 0.22) ? 'express' : 'normal';
    const cars = clamp(1 + Math.floor(r.next() * (1.6 + k * 2.2)), 1, 3);
    const n = kind === 'express' ? Math.min(cars, 2) : cars;
    let t = this.clock + after;
    // a fair headway behind the last train out of the same tunnel (see levels.timetable)
    const prev = this.lastOut[tunnel];
    if (prev) {
      const head = ((prev.cars + 1) * CAR_GAP + Math.max(0.9, 2.6 - k * 1.1)) / this.cruiseFor('normal') * (kind === 'express' && prev.kind !== 'express' ? 1.7 : 1);
      t = Math.max(t, prev.t + head);
    }
    const s: Spawn = { t, tunnel, color, cars: n, kind };
    this.lastOut[tunnel] = s;
    return s;
  }

  private rushGap(): number {
    const k = this.rushRamp();
    return Math.max(1.6, (6.6 - Math.min(1.3, k) * 3.6) * this.tune.gap * this.rng.range(0.85, 1.2));
  }

  /** Where a car is: its distance along the path. */
  carDist(tr: Train, i: number): number { return tr.head - i * CAR_GAP; }

  /** The pose of a point `d` along a train's path (clamped to the path). */
  poseAt(tr: Train, d: number, out: Pose): Pose {
    const p = tr.path;
    let i = p.length - 1;
    while (i > 0 && p[i].start > d) i--;
    const e = p[i];
    const s = this.board.segs[e.seg];
    return poseOn(s, e.fwd, clamp(d - e.start, 0, s.len), out);
  }

  /** The path entry a distance falls on. */
  entryAt(tr: Train, d: number): PathEntry {
    const p = tr.path;
    let i = p.length - 1;
    while (i > 0 && p[i].start > d) i--;
    return p[i];
  }

  private pathEnd(tr: Train): number {
    const e = tr.path[tr.path.length - 1];
    return e.start + this.board.segs[e.seg].len;
  }

  /** Tiles a train covers (from the nose to the tail). */
  occupied(tr: Train, into: Set<number>): void {
    const from = tr.head - (tr.cars - 1) * CAR_GAP - NOSE, to = tr.head + NOSE;
    for (const e of tr.path) {
      const s = this.board.segs[e.seg];
      if (e.start > to || e.start + s.len < from) continue;
      if (s.tile >= 0) into.add(s.tile);
    }
  }

  /** Is a switch tile free (no car on it)? */
  switchFree(j: number): boolean {
    const tile = this.board.junctions[j].tile;
    const set = new Set<number>();
    for (const tr of this.trains) {
      if (tr.state === 'crashed' || tr.state === 'stuck') { this.occupied(tr, set); continue; }
      this.occupied(tr, set);
    }
    return !set.has(tile);
  }

  /** Visible cars (out of the tunnel, not yet in the cabin). */
  carVisible(tr: Train, i: number): boolean {
    if (i < tr.gone) return false;
    const d = this.carDist(tr, i);
    const e = this.entryAt(tr, d);
    const s = this.board.segs[e.seg];
    if (s.kind !== 'lead') return true;
    const u = d - e.start;
    // a cabin lead: until the car is inside (counted by `gone`)
    if (s.a !== -1) return true;
    // a tunnel lead: coming out once past the portal, going in until past it
    return e.fwd ? u > s.len - 0.4 : u < 0.35;
  }

  // ------------------------------------------------------------------ input

  private applyInput(inp: SimInput): void {
    for (const ci of inp.flips) {
      const ctl = this.board.controls[ci];
      if (!ctl || this.over) continue;
      if (ctl.kind === 'signal') {
        this.red[ctl.id] = !this.red[ctl.id];
        this.events.push({ type: 'signal', control: ci, signal: ctl.id, red: this.red[ctl.id] });
        continue;
      }
      if (!this.switchFree(ctl.id)) { this.events.push({ type: 'blocked', control: ci }); continue; }
      this.state[ctl.id] = 1 - this.state[ctl.id];
      this.events.push({ type: 'flip', control: ci, junction: ctl.id, opt: this.state[ctl.id] });
    }
    if (inp.power && !this.over) {
      const k = inp.power;
      if (this.powers[k] > 0 && !(k === 'cocoa' ? this.cocoaT > 0 : this.globeT > 0)) {
        this.powers[k]--;
        if (k === 'cocoa') this.cocoaT = COCOA_TIME; else this.globeT = GLOBE_TIME;
        this.events.push({ type: 'usePower', kind: k });
      }
    }
  }

  // ------------------------------------------------------------------ step

  step(dt: number, inp: SimInput = NO_INPUT): void {
    if (this.over) return;
    this.time += dt;
    this.applyInput(inp);
    // powers: the train clock slows or stops
    let k = 1;
    if (this.globeT > 0) { this.globeT = Math.max(0, this.globeT - dt); k = 0; }
    else if (this.cocoaT > 0) { this.cocoaT = Math.max(0, this.cocoaT - dt); k = COCOA_SLOW; }
    const tdt = dt * k;
    this.clock += tdt;
    this.spawnTrains();
    for (const tr of this.trains) this.move(tr, tdt, dt);
    this.poses();
    if (tdt > 0) this.collisions();
    // wrecks and finished trains leave
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const tr = this.trains[i];
      let done = false;
      if (tr.state === 'crashed' || tr.state === 'stuck') { tr.outT += dt; done = tr.outT > Sim.WRECK_T; }
      else if ((tr.state === 'deliver' || tr.state === 'lost') && tr.gone >= tr.cars) done = true;
      if (done) {
        this.trains.splice(i, 1);
        this.events.push({ type: 'remove', train: tr });
      }
    }
    this.checkEnd(dt);
  }

  private spawnTrains(): void {
    // warnings
    while (this.warned < this.spawns.length && this.spawns[this.warned].t - this.tune.warn <= this.clock) {
      const s = this.spawns[this.warned++];
      this.events.push({ type: 'warn', tunnel: s.tunnel, color: s.color, kind: s.kind, at: s.t });
    }
    while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].t <= this.clock) {
      const s = this.spawns[this.spawnIdx];
      if (!this.tunnelClear(s.tunnel)) {
        // the portal is busy: everything waiting slides back a little
        for (let i = this.spawnIdx; i < this.spawns.length; i++) this.spawns[i].t += 0.25;
        break;
      }
      this.spawnIdx++;
      const tn = this.board.tunnels[s.tunnel];
      const lead = this.board.segs[tn.lead];
      const tr: Train = {
        id: this.nextId++, color: s.color, kind: s.kind, cars: s.cars + 1,
        path: [{ seg: tn.lead, fwd: true, start: 0 }], head: lead.len - NOSE - 0.25,
        speed: 0, cruise: this.cruiseFor(s.kind), state: 'run', held: null, stop: -1, tunnel: -1, correct: false,
        gone: 0, outT: 0, poses: [], from: s.tunnel, age: 0,
      };
      tr.speed = tr.cruise;
      for (let i = 0; i < tr.cars; i++) tr.poses.push({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      this.trains.push(tr);
      this.events.push({ type: 'spawn', train: tr });
      if (this.rush) this.spawns.push(this.rushSpawn(this.rushGap()));
    }
  }

  private tunnelClear(t: number): boolean {
    const lead = this.board.tunnels[t].lead;
    for (const tr of this.trains) {
      const tail = tr.head - (tr.cars - 1) * CAR_GAP - NOSE;
      for (const e of tr.path) {
        if (e.seg !== lead) continue;
        // a train still on the lead, or one that went into this tunnel
        if (!e.fwd) return false;
        if (tail < e.start + this.board.segs[lead].len + 0.7) return false;
      }
    }
    return true;
  }

  /** Grows a train's path so it reaches past its nose (reading switches as it goes). */
  private extend(tr: Train): boolean {
    const b = this.board;
    while (this.pathEnd(tr) < tr.head + NOSE + 0.02) {
      const last = tr.path[tr.path.length - 1];
      const s = b.segs[last.seg];
      let nx: ReturnType<Board['next']>;
      if (s.tile < 0) {
        const tn = b.tunnels.find((t) => t.lead === last.seg);
        if (!tn || !last.fwd) return false; // the end of a cabin or tunnel lead: nothing beyond
        nx = b.enter(tn.tc + tn.tr * W, tn.edge, (j) => this.state[j]);
      } else nx = b.next(s.tile, b.exitEdge(last.seg, last.fwd), (j) => this.state[j]);
      if (!nx) return false;
      const ns = b.segs[nx.seg];
      // red signals and drifts hold a running train at the edge of their tile
      if (tr.state === 'run' && ns.tile >= 0) {
        const sg = b.signalAt[ns.tile];
        if (sg >= 0 && this.red[sg]) {
          if (tr.held !== 'signal') this.events.push({ type: 'held', train: tr, why: 'signal' });
          tr.held = 'signal';
          return false;
        }
        if (this.drifts.has(ns.tile)) {
          if (tr.kind === 'plow') {
            this.drifts.delete(ns.tile);
            this.events.push({ type: 'clear', train: tr, tile: ns.tile });
          } else {
            tr.state = 'stuck';
            tr.speed = 0;
            this.stats.stuck++;
            this.events.push({ type: 'stuck', train: tr, tile: ns.tile });
            this.mistake();
            return false;
          }
        }
      }
      if (tr.held === 'signal') tr.held = null;
      tr.path.push({ seg: nx.seg, fwd: nx.fwd, start: this.pathEnd(tr) });
      if (nx.junction !== undefined) this.events.push({ type: 'enter', train: tr, junction: nx.junction });
      if ('stop' in nx && nx.stop !== undefined) this.arrive(tr, nx.stop);
      if ('tunnel' in nx && nx.tunnel !== undefined) {
        tr.state = 'lost';
        tr.tunnel = nx.tunnel;
        this.stats.lost++;
        this.events.push({ type: 'lost', train: tr, tunnel: nx.tunnel });
        this.mistake();
      }
    }
    return true;
  }

  /** The nose reached a cabin. */
  private arrive(tr: Train, stop: number): void {
    tr.state = 'deliver';
    tr.stop = stop;
    const st = this.board.stops[stop];
    if (tr.kind === 'plow') {
      tr.correct = true;
      this.stats.plows++;
      const pts = this.rush ? 50 : 50;
      this.score += pts;
      this.events.push({ type: 'plowDone', train: tr, points: pts });
      return;
    }
    tr.correct = st.color === tr.color;
    this.stats.delivered++;
    if (tr.correct) {
      this.stats.correct++;
      this.streak++;
      this.perfect++;
      this.mult = this.rush ? Math.min(8, 1 + Math.floor((this.streak - 1) / 3)) : 1;
      const base = tr.kind === 'express' ? 150 : 100;
      const pts = base * this.mult;
      this.score += pts;
      this.events.push({ type: 'deliver', train: tr, stop, correct: true, points: pts, mult: this.mult });
      if (this.perfect % POWER_EVERY === 0) {
        const kind = this.nextPower;
        if (this.powers[kind] < POWER_MAX) {
          this.powers[kind]++;
          this.events.push({ type: 'power', kind });
        }
        this.nextPower = kind === 'cocoa' ? 'globe' : 'cocoa';
      }
    } else {
      this.stats.wrong++;
      this.events.push({ type: 'deliver', train: tr, stop, correct: false, points: 0, mult: 1 });
      this.mistake();
    }
  }

  private mistake(): void {
    this.streak = 0;
    this.perfect = 0;
    this.mult = 1;
    this.hearts = Math.max(0, this.hearts - 1);
    this.events.push({ type: 'heart', hearts: this.hearts });
  }

  /** Moves a train along its path, braking for red signals and for trains ahead. */
  private move(tr: Train, tdt: number, dt: number): void {
    if (tr.state === 'crashed' || tr.state === 'stuck') return;
    tr.age += tdt;
    if (tr.state === 'run' && this.rush) tr.cruise = this.cruiseFor(tr.kind);
    let want = tr.cruise;
    if (tr.state === 'run' && this.blockedAhead(tr)) { want = 0; tr.held = tr.held ?? 'queue'; }
    else if (tr.held === 'queue') tr.held = null;
    const acc = want < tr.speed ? 6 : 2.2;
    tr.speed += clamp(want - tr.speed, -acc * dt, acc * dt);
    if (tdt <= 0) return;
    const step = tr.speed * tdt;
    if (step <= 0) return;
    tr.head += step;
    if (!this.extend(tr)) {
      // the path ends here: a red signal, a drift, or the far end of a cabin / tunnel lead
      const end = this.pathEnd(tr) - NOSE - 0.02;
      if (tr.head > end) { tr.head = end; if (tr.state === 'run') tr.speed = 0; }
    } else if (tr.held === 'signal') tr.held = null;
    if (tr.state === 'deliver' || tr.state === 'lost') {
      // cars vanish into the cabin (or the tunnel) one by one
      const e = tr.path[tr.path.length - 1];
      const cut = e.start + (tr.state === 'deliver' ? 0.32 : 0.35);
      while (tr.gone < tr.cars && this.carDist(tr, tr.gone) > cut) {
        this.events.push({ type: 'carIn', train: tr, car: tr.gone, stop: tr.stop, correct: tr.correct });
        tr.gone++;
      }
      // keep running in at a steady pace
      tr.speed = Math.max(tr.speed, 0.6);
    }
    // forget the path behind the last car
    const tail = tr.head - (tr.cars - 1) * CAR_GAP - 2;
    while (tr.path.length > 1 && tr.path[1].start < tail) tr.path.shift();
  }

  /** A point ahead of the nose, following the switches as they are now (not committed). */
  private peek(tr: Train, ahead: number, out: Pose): Pose | null {
    const d = tr.head + ahead;
    const end = this.pathEnd(tr);
    if (d <= end) return this.poseAt(tr, d, out);
    const b = this.board;
    let last = tr.path[tr.path.length - 1];
    let start = end;
    for (let n = 0; n < 4; n++) {
      const s = b.segs[last.seg];
      let nx: ReturnType<Board['next']>;
      if (s.tile < 0) {
        const tn = b.tunnels.find((t) => t.lead === last.seg);
        if (!tn || !last.fwd) return null;
        nx = b.enter(tn.tc + tn.tr * W, tn.edge, (j) => this.state[j]);
      } else nx = b.next(s.tile, b.exitEdge(last.seg, last.fwd), (j) => this.state[j]);
      if (!nx) return null;
      const ns = b.segs[nx.seg];
      if (d <= start + ns.len) return poseOn(ns, nx.fwd, d - start, out);
      start += ns.len;
      last = { seg: nx.seg, fwd: nx.fwd, start };
    }
    return null;
  }

  /** A train ahead on the same line (going the same way or standing): wait behind it. */
  private blockedAhead(tr: Train): boolean {
    for (const ahead of [0.62, 0.86, 1.1]) {
      const p = this.peek(tr, ahead, tmp);
      if (!p) continue;
      for (const o of this.trains) {
        if (o === tr) continue;
        for (let i = 0; i < o.cars; i++) {
          if (i < o.gone) continue;
          const q = o.poses[i];
          if (!q) continue;
          if (Math.abs(q.y - p.y) > 0.25) continue;
          if (Math.hypot(q.x - p.x, q.z - p.z) > 0.42) continue;
          const still = o.speed < 0.05 || o.state === 'crashed' || o.state === 'stuck';
          if (still || Math.cos(q.yaw - p.yaw) > 0.8) return true;
        }
      }
    }
    return false;
  }

  private poses(): void {
    for (const tr of this.trains) {
      for (let i = 0; i < tr.cars; i++) this.poseAt(tr, this.carDist(tr, i), tr.poses[i]);
    }
  }

  private collisions(): void {
    const ts = this.trains;
    for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) {
      const A = ts[a], B = ts[b];
      if (A.state === 'crashed' && B.state === 'crashed') continue;
      let hit: Pose | null = null;
      for (let i = 0; i < A.cars && !hit; i++) {
        if (!this.carVisible(A, i)) continue;
        const p = A.poses[i];
        for (let k = 0; k < B.cars; k++) {
          if (!this.carVisible(B, k)) continue;
          const q = B.poses[k];
          if (Math.abs(p.y - q.y) > 0.25) continue;
          if (Math.hypot(p.x - q.x, p.z - q.z) < CRASH_DIST) { hit = p; break; }
        }
      }
      if (!hit) continue;
      const ends = this.tune.crashEnds;
      for (const t of [A, B]) {
        if (t.state !== 'crashed') t.outT = 0;
        t.state = 'crashed';
        t.speed = 0;
      }
      this.stats.crashes++;
      this.streak = 0;
      this.perfect = 0;
      this.mult = 1;
      this.events.push({ type: 'crash', a: A, b: B, x: hit.x, y: hit.y, z: hit.z, ends });
      if (ends) {
        this.failReason = 'crash';
        this.endT = 1.8;
      } else {
        this.hearts = Math.max(0, this.hearts - 1);
        this.events.push({ type: 'heart', hearts: this.hearts });
      }
    }
  }

  private checkEnd(dt: number): void {
    if (this.endT >= 0) {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.over = true;
        this.events.push({ type: 'fail', reason: this.failReason ?? 'hearts' });
      }
      return;
    }
    if (this.hearts <= 0) {
      this.failReason = 'hearts';
      this.endT = 1.4;
      return;
    }
    if (!this.rush && this.spawnIdx >= this.spawns.length && this.trains.length === 0) {
      this.over = true;
      this.won = true;
      this.events.push({ type: 'win' });
    }
  }

  // ------------------------------------------------------------------ queries

  /** Trains still to come (Journey), including those on the board. */
  remaining(): number {
    if (this.rush) return 0;
    return this.spawns.length - this.spawnIdx + this.trains.filter((t) => t.state === 'run' && t.kind !== 'plow').length;
  }

  /** Deliveries still to make (Journey): trains to come and trains on their way. */
  toDeliver(): number {
    if (this.rush) return 0;
    let n = 0;
    for (let i = this.spawnIdx; i < this.spawns.length; i++) if (this.spawns[i].kind !== 'plow') n++;
    for (const t of this.trains) if (t.kind !== 'plow' && (t.state === 'run')) n++;
    return n;
  }

  /** Trains announced (the tunnel lamp blinks) but not out yet, with their timetable index. */
  announced(): { spawn: Spawn; index: number }[] {
    const out: { spawn: Spawn; index: number }[] = [];
    for (let i = this.spawnIdx; i < this.warned; i++) out.push({ spawn: this.spawns[i], index: i });
    return out;
  }

  /** Where a train starts on its tunnel lead. */
  static readonly START_BACK = NOSE + 0.25;

  /** Cruising speed a train of this kind will have. */
  speedOf(kind: TrainKind): number { return this.cruiseFor(kind); }

  /** The next trains in the timetable (for the preview). */
  upcoming(n: number): Spawn[] { return this.spawns.slice(this.spawnIdx, this.spawnIdx + n); }

  /** Seconds (train clock) until the next train comes out, or −1. */
  nextIn(): number {
    const s = this.spawns[this.spawnIdx];
    return s ? s.t - this.clock : -1;
  }

  /** Journey stars: 3 = no mistakes and in time, 2 = at most one mistake, 1 = cleared. */
  stars(par: number): number {
    if (!this.won) return 0;
    const lost = this.maxHearts - this.hearts;
    if (lost === 0 && this.stats.crashes === 0 && this.time <= par) return 3;
    if (lost <= 1) return 2;
    return 1;
  }

  /** Time the level should take (the last train out plus its run to the stop, with some slack). */
  static par(board: Board, spawns: Spawn[], mode: Mode, speed = 1): number {
    const v = TUNING[mode].speed * speed;
    let end = 0;
    for (const s of spawns) {
      const tn = board.tunnels[s.tunnel];
      let len = 8;
      const st = board.stops.findIndex((p) => p.color === s.color);
      if (st >= 0) {
        const r = findRoute(board, tn.lead, true, board.segs[tn.lead].len, { stop: st });
        if (r) len = r.len;
      }
      const sp = v * (s.kind === 'express' ? EXPRESS : s.kind === 'plow' ? PLOW : 1);
      end = Math.max(end, s.t + len / sp + (s.cars + 1) * CAR_GAP / sp);
    }
    return Math.ceil(end * 1.08 + 6);
  }
}
