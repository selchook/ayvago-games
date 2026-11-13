// Delivery Dash: the simulation. Deterministic per seed and separate from the view: the van's
// arcade handling (drift on sharp turns, turbo, suspension and bumps), simple collisions (circles
// against lot boxes and traffic), the traffic on the lane graph (lanes, turns, one car at a time
// through a junction, stopping for the van and for people on crosswalks), the pedestrians, the
// orders (offers, pickups, deliveries, timers, cargo condition, tips) and the shift clock. The
// Play scene, the menu's autopilot and the headless balance script all run it.
import {
  S, LANE, WALK, ROAD_HALF, DX, DZ, HEADING, TUNING, TURBO_TIME, TURBO_MAX, FRAGILE, CARGO_TIME,
  Rng, clamp, wrapAngle, type Cargo, type Handling, type Mode,
} from './defs';
import { town, Town, cx, cz, type Bay, type Cell, type Edge } from './town';
import { RUSH, type ShiftDef } from './shifts';

export interface SimInput { steer: number; gas: number; brake: number; turbo: boolean; horn: boolean }
export const NO_INPUT: SimInput = { steer: 0, gas: 0, brake: 0, turbo: false, horn: false };

export type OrderState = 'offered' | 'carried' | 'done' | 'gone';
export interface Order {
  id: number;
  cargo: Cargo;
  shop: Bay;
  house: Bay;
  /** Seconds on its clock and seconds left. */
  total: number;
  left: number;
  state: OrderState;
  /** Cargo condition 1 (perfect) .. 0 (ruined). */
  cond: number;
  vip: boolean;
  base: number;
  late: boolean;
  /** Path length shop → house (for the Rush's extra time). */
  dist: number;
}

export interface Car {
  id: number;
  model: number;
  edge: number;
  s: number;
  next: number;
  v: number;
  vmax: number;
  x: number; y: number; z: number; h: number;
  /** Seconds it has been waiting (stuck), and how long its horn sounds. */
  wait: number;
  honk: number;
  /** Seconds left of a stop after the van bumped it. */
  halt: number;
  color: number;
  /** Brake lights on. */
  braking: boolean;
}

export interface Ped {
  id: number;
  kind: 'cross' | 'stroll';
  cell: Cell;
  /** Road axis of the cell (0: N–S, 1: E–W). */
  axis: number;
  /** Position along the axis (from the cell centre) and across it (sidewalk ±WALK). */
  along: number;
  side: number;
  state: 'idle' | 'walk' | 'wait' | 'cross' | 'dodge';
  t: number;
  dirAlong: number;
  speed: number;
  x: number; y: number; z: number; h: number;
  /** Dodge: hop velocity across the street and its time; a cooldown for the fine. */
  dvx: number; dvz: number; hop: number; fined: number;
  model: number;
  moving: boolean;
}

export interface Coffee { cell: Cell; x: number; z: number; y: number; ready: boolean; t: number }

export type SimEvent =
  | { type: 'offer'; order: Order }
  | { type: 'pickup'; order: Order }
  | { type: 'full'; bay: Bay }
  | { type: 'deliver'; order: Order; pay: number; tip: number; perfect: boolean; bonusTime: number }
  | { type: 'expire'; order: Order }
  | { type: 'late'; order: Order }
  | { type: 'crash'; x: number; y: number; z: number; speed: number; car: number; damage: number }
  | { type: 'scrape'; x: number; z: number }
  | { type: 'bump'; severity: number; damage: number }
  | { type: 'damage'; order: Order; amount: number }
  | { type: 'scare'; ped: Ped; fine: number }
  | { type: 'hop'; ped: Ped }
  | { type: 'coffee'; x: number; y: number; z: number }
  | { type: 'turbo' }
  | { type: 'horn' }
  | { type: 'honk'; car: Car }
  | { type: 'wrongWay' }
  | { type: 'stop'; bay: Bay; kind: 'shop' | 'house' }
  | { type: 'weather'; kind: 'dusk' | 'night' | 'rain' };

export interface SimOptions {
  shift: ShiftDef;
  rush: boolean;
  mode: Mode;
  seed: number;
  hand: Handling;
  /** Menu backdrop: no clock. */
  endless?: boolean;
}

/** Traffic car models (the view maps them to Car Kit models): half length, colour choices. */
export const CAR_TYPES = [
  { model: 'sedan', len: 1.08, paint: true },
  { model: 'hatchbacksports', len: 1.2, paint: true },
  { model: 'suv', len: 1.16, paint: true },
  { model: 'taxi', len: 1.16, paint: false },
  { model: 'van', len: 1.16, paint: true },
  { model: 'police', len: 1.28, paint: false },
];
export const CAR_PAINTS = [0xe8453c, 0x3c8ce8, 0xf5f5f5, 0xf5c331, 0x2c3550, 0x8a52d8, 0x48b86a, 0xf08a3c];
const CAR_R = 0.66;
const DT = 1 / 60;

export class Sim {
  readonly town: Town;
  readonly shift: ShiftDef;
  readonly rush: boolean;
  readonly mode: Mode;
  readonly hand: Handling;
  readonly tune: (typeof TUNING)['normal'];
  readonly events: SimEvent[] = [];
  private rng: Rng;
  private trafficRng: Rng;
  // the van
  x = 0; z = 0; y = 0; h = 0;
  v = 0; vl = 0; yaw = 0;
  pitch = 0; roll = 0;
  /** Suspension: body offset and its speed (view), ground vertical speed (bumps). */
  bob = 0; bobV = 0;
  private gv = 0;
  private gPrev = 0;
  stun = 0;
  turbo = 0;
  turboT = 0;
  slide = 0;
  braking = false;
  reversing = false;
  steer = 0;
  private hornCd = 0;
  private wrongCd = 0;
  /** The stop in progress: the bay and how long the van has stood in it. */
  stopBay: Bay | null = null;
  stopT = 0;
  private stopDone = false;
  // the world
  readonly cars: Car[] = [];
  readonly peds: Ped[] = [];
  readonly coffees: Coffee[] = [];
  readonly orders: Order[] = [];
  private reserve = new Map<Cell, number>();
  private nextOrder = 1;
  private spawnT = 1.2;
  private carId = 1;
  // the clock and the result
  time = 0;
  clock: number;
  over = false;
  earnings = 0;
  stats = { delivered: 0, tips: 0, crashes: 0, scares: 0, perfect: 0, late: 0, ruined: 0, expired: 0, fines: 0, vip: 0 };
  /** Weather (rain makes the streets slippery; the view darkens for the night). */
  night = 0;
  rain = 0;
  /** Rush: the traffic it wants now. */
  private carTarget: number;

  constructor(readonly opts: SimOptions) {
    this.shift = opts.shift;
    this.rush = opts.rush;
    this.mode = opts.mode;
    this.hand = opts.hand;
    this.tune = TUNING[opts.mode];
    this.rng = new Rng(opts.seed);
    this.trafficRng = new Rng(opts.seed * 7 + 3);
    this.town = town(this.shift.district, this.shift.oneway, this.shift.works);
    this.clock = this.shift.time;
    this.night = this.shift.night ? 1 : 0;
    this.rain = this.shift.night ? 1 : 0;
    // the van starts in the street in front of the first shop (or a random one in the menu)
    const t = this.town;
    const start = opts.endless ? t.shops[this.rng.int(t.shops.length)] : t.shops.find((b) => t.drivable(b.cell)) ?? t.shops[0];
    const e = t.bayEdges(start).find((q) => q.dirIn === start.dir) ?? t.bayEdges(start)[0];
    const p = t.pointOn(e, 1.2);
    this.x = p[0]; this.z = p[2]; this.h = p[3];
    this.y = t.ground(this.x, this.z);
    this.gPrev = this.y;
    for (const c of t.coffees) this.coffees.push({ cell: c, x: cx(c.c), z: cz(c.r), y: t.ground(cx(c.c), cz(c.r)), ready: true, t: 0 });
    this.carTarget = Math.max(0, Math.round(this.shift.cars * this.tune.traffic));
    for (let i = 0; i < this.carTarget; i++) this.spawnCar(true);
    const nPeds = this.shift.peds;
    for (let i = 0; i < nPeds; i++) this.spawnPed(i);
  }

  // ------------------------------------------------------------------ step

  /** Advances the world by `dt` seconds (in fixed 1/60 s steps). */
  step(dt: number, inp: SimInput): void {
    let left = dt;
    while (left > 1e-6) {
      const d = Math.min(DT, left);
      this.tick(d, inp);
      left -= d;
      inp = { ...inp, turbo: false, horn: false };
    }
  }

  private tick(dt: number, inp: SimInput): void {
    if (this.over) return;
    this.time += dt;
    if (!this.opts.endless) {
      this.clock -= dt;
      if (this.clock <= 0) { this.clock = 0; this.over = true; return; }
    }
    if (this.rush) this.rushWeather();
    this.drive(dt, inp);
    this.collide();
    this.traffic(dt);
    this.walkers(dt);
    this.stops(dt);
    this.coffeeAndOrders(dt);
  }

  // ------------------------------------------------------------------ the van

  private drive(dt: number, inp: SimInput): void {
    const H = this.hand;
    const wet = 1 - this.rain * 0.3;
    if (inp.turbo && this.turbo > 0 && this.turboT <= 0) {
      this.turbo--;
      this.turboT = TURBO_TIME;
      this.events.push({ type: 'turbo' });
    }
    if (inp.horn && this.hornCd <= 0) { this.hornCd = 0.5; this.horn(); }
    this.hornCd -= dt;
    this.turboT = Math.max(0, this.turboT - dt);
    this.stun = Math.max(0, this.stun - dt);
    const boost = this.turboT > 0;
    const vmax = H.vmax * (boost ? 1.45 : 1);
    const gas = this.stun > 0 ? inp.gas * 0.3 : inp.gas;
    let v = this.v;
    this.braking = false;
    if (gas > 0.05) {
      if (v < -0.2) { v = Math.min(0, v + H.brake * gas * dt); this.braking = true; }
      else if (v < vmax) v += H.accel * (boost ? 1.8 : 1) * gas * Math.max(0.15, 1 - Math.max(0, v) / vmax) * dt;
    }
    if (inp.brake > 0.05) {
      if (v > 0.25) { v = Math.max(0, v - H.brake * inp.brake * dt); this.braking = true; }
      else v = Math.max(-5, v - 7 * inp.brake * dt);
    }
    if (gas <= 0.05 && inp.brake <= 0.05) {
      const drag = 1.6 + Math.abs(v) * 0.12;
      v -= Math.sign(v) * Math.min(Math.abs(v), drag * dt);
    }
    if (v > vmax) v -= (v - vmax) * 2.5 * dt;
    // slopes: gravity along the heading
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const t = this.town;
    const gF = t.ground(this.x + fx * 0.9, this.z + fz * 0.9), gB = t.ground(this.x - fx * 0.9, this.z - fz * 0.9);
    const slope = (gF - gB) / 1.8;
    v -= slope * 9 * dt;
    this.v = v;
    this.reversing = v < -0.3;

    // steering: the turn rate grows with speed up to a point; reversing turns the other way
    this.steer = inp.steer;
    const sp = Math.abs(v);
    const k = clamp(sp / 3.5, 0, 1) * (1 - 0.32 * clamp(sp / H.vmax, 0, 1));
    let yaw = -inp.steer * H.turn * k * Math.sign(v || 1) * (this.stun > 0 ? 0.6 : 1);
    // the assist straightens the van along a straight street when the player is not steering
    const axis = t.axisAt(this.x, this.z);
    if (axis >= 0 && Math.abs(inp.steer) < 0.18 && sp > 2) {
      const a = axis === 0 ? 0 : Math.PI / 2;
      const err1 = wrapAngle(a - this.h), err2 = wrapAngle(a + Math.PI - this.h);
      const err = Math.abs(err1) < Math.abs(err2) ? err1 : err2;
      if (Math.abs(err) < 0.5) yaw += err * this.tune.assist * 2.2 * clamp(sp / 6, 0, 1);
    }
    this.yaw = yaw;
    this.h = wrapAngle(this.h + yaw * dt);
    // drift: turning at speed pushes the van out of the turn; grip pulls it back
    this.vl += yaw * v * 0.34 * clamp(sp / H.vmax, 0.2, 1.2) * dt;
    this.vl *= Math.exp(-H.grip * wet * dt);
    this.slide = Math.abs(this.vl);
    const rx = -Math.cos(this.h), rz = Math.sin(this.h);
    this.x += (Math.sin(this.h) * v + rx * this.vl) * dt;
    this.z += (Math.cos(this.h) * v + rz * this.vl) * dt;

    // ground, suspension and bumps
    const g = t.ground(this.x, this.z);
    const gv = (g - this.gPrev) / dt;
    const dgv = gv - this.gv;
    const acc = Math.abs(dgv) / dt;
    this.gPrev = g;
    this.gv = gv;
    this.y = g;
    this.pitch = Math.atan2(gF - gB, 1.8);
    // the body lags behind the wheels and springs back
    this.bobV += (-90 * this.bob - 9 * this.bobV) * dt - clamp(dgv, -6, 6) * 0.3;
    if (acc > 30) this.bumped((acc - 30) * dt);
    this.bob = clamp(this.bob + this.bobV * dt, -0.35, 0.35);
    this.roll = clamp(-this.vl * 0.05 - yaw * sp * 0.006, -0.12, 0.12);

    // wrong way down a one-way street
    const cell = t.cellAt(this.x, this.z);
    this.wrongCd -= dt;
    if (cell && cell.oneway >= 0 && v > 4 && this.wrongCd <= 0) {
      const want = HEADING[cell.oneway];
      if (Math.cos(wrapAngle(this.h - want)) < -0.5) { this.events.push({ type: 'wrongWay' }); this.wrongCd = 4; }
    }
  }

  private bumpAcc = 0;
  /** A jolt: fragile cargo loses condition (padding and Easy soften it). */
  private bumped(sev: number): void {
    const loss = sev * 0.045 * this.hand.protect * this.tune.fragile;
    let total = 0;
    for (const o of this.orders) {
      if (o.state !== 'carried' || !FRAGILE[o.cargo]) continue;
      const before = o.cond;
      o.cond = Math.max(0, o.cond - loss);
      total += before - o.cond;
      if (before - o.cond > 0.001) this.events.push({ type: 'damage', order: o, amount: before - o.cond });
    }
    this.bumpAcc += sev;
    if (this.bumpAcc > 1.2) {
      this.events.push({ type: 'bump', severity: this.bumpAcc, damage: total });
      this.bumpAcc = 0;
    }
  }

  private horn(): void {
    this.events.push({ type: 'horn' });
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    for (const p of this.peds) {
      const dx = p.x - this.x, dz = p.z - this.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < 9 && Math.abs(dx * -fz + dz * fx) < 3 && p.state !== 'dodge' && p.state !== 'cross') {
        p.hop = 0.45;
        this.events.push({ type: 'hop', ped: p });
      }
    }
  }

  // ------------------------------------------------------------------ collisions

  private circles(x: number, z: number, h: number, len: number, out: number[]): number[] {
    const fx = Math.sin(h), fz = Math.cos(h), o = len - CAR_R * 0.55;
    out[0] = x + fx * o; out[1] = z + fz * o; out[2] = x - fx * o; out[3] = z - fz * o;
    return out;
  }

  private cv = [0, 0, 0, 0];
  private oc = [0, 0, 0, 0];
  private collide(): void {
    const t = this.town;
    const H = this.hand;
    let pushX = 0, pushZ = 0, carHit: Car | null = null;
    const c = this.circles(this.x, this.z, this.h, H.len, this.cv);
    const r = H.wid + 0.06;
    for (let i = 0; i < 2; i++) {
      const px = c[i * 2], pz = c[i * 2 + 1];
      const cc = Math.floor(px / S), cr = Math.floor(pz / S);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const cell = t.cell(cr + dr, cc + dc);
        if (cell && t.drivable(cell)) continue;
        const x0 = (cc + dc) * S, z0 = (cr + dr) * S;
        const nx = clamp(px, x0, x0 + S), nz = clamp(pz, z0, z0 + S);
        let dx = px - nx, dz = pz - nz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-6) { dx = cx(cc) - (x0 + S / 2); dz = cz(cr) - (z0 + S / 2); }
        const n = Math.hypot(dx, dz) || 1;
        const pen = r - d;
        if (Math.abs(dx / n * pen) > Math.abs(pushX)) pushX = dx / n * pen;
        if (Math.abs(dz / n * pen) > Math.abs(pushZ)) pushZ = dz / n * pen;
      }
    }
    if (pushX || pushZ) this.resolve(pushX, pushZ, 0, 0, null);
    // traffic
    for (const car of this.cars) {
      if (Math.abs(car.x - this.x) > 4 || Math.abs(car.z - this.z) > 4) continue;
      const oc = this.circles(car.x, car.z, car.h, CAR_TYPES[car.model].len, this.oc);
      const vc = this.circles(this.x, this.z, this.h, H.len, this.cv);
      let bx = 0, bz = 0, bp = 0;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const dx = vc[i * 2] - oc[j * 2], dz = vc[i * 2 + 1] - oc[j * 2 + 1];
        const d = Math.hypot(dx, dz);
        const pen = r + CAR_R - d;
        if (pen > bp) { bp = pen; bx = dx / (d || 1); bz = dz / (d || 1); }
      }
      if (bp > 0) {
        carHit = car;
        this.resolve(bx * bp, bz * bp, Math.sin(car.h) * car.v, Math.cos(car.h) * car.v, car);
      }
    }
    void carHit;
  }

  /** Pushes the van out by (px, pz) and takes the speed into the obstacle (moving at ovx, ovz). */
  private resolve(px: number, pz: number, ovx: number, ovz: number, car: Car | null): void {
    this.x += px; this.z += pz;
    const n = Math.hypot(px, pz) || 1;
    const nx = px / n, nz = pz / n;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let vx = fx * this.v + rx * this.vl, vz = fz * this.v + rz * this.vl;
    const rel = (vx - ovx) * nx + (vz - ovz) * nz;
    if (rel >= 0) return;
    const impact = -rel;
    vx -= nx * rel * 1.3; vz -= nz * rel * 1.3;
    this.v = vx * fx + vz * fz;
    this.vl = (vx * rx + vz * rz) * 0.6;
    // a glancing blow turns the van a little
    this.h = wrapAngle(this.h + clamp((nx * rz - nz * rx) * impact * 0.015, -0.2, 0.2));
    if (impact > (car ? 3 : 4.5)) this.crash(impact, car);
    else if (impact > 1.2) this.events.push({ type: 'scrape', x: this.x - nx * 0.8, z: this.z - nz * 0.8 });
  }

  private crash(impact: number, car: Car | null): void {
    this.stun = 0.55;
    this.stats.crashes++;
    let dmg = 0;
    for (const o of this.orders) {
      if (o.state !== 'carried') continue;
      const loss = (FRAGILE[o.cargo] ? 0.16 : 0.06) * clamp(impact / 6, 0.5, 2) * this.hand.protect * this.tune.fragile;
      const before = o.cond;
      o.cond = Math.max(0, o.cond - loss);
      o.left = Math.max(0.5, o.left - this.tune.crashTime);
      dmg += before - o.cond;
      this.events.push({ type: 'damage', order: o, amount: before - o.cond });
    }
    if (car) { car.halt = 1.6; car.honk = 0.8; car.v = 0; this.events.push({ type: 'honk', car }); }
    this.events.push({ type: 'crash', x: this.x, y: this.y, z: this.z, speed: impact, car: car?.id ?? -1, damage: dmg });
  }

  // ------------------------------------------------------------------ traffic

  private spawnCar(initial: boolean): void {
    const t = this.town, r = this.trafficRng;
    for (let tries = 0; tries < 40; tries++) {
      const e = t.edges[r.int(t.edges.length)];
      if (e.turn !== 'straight' || e.cell.bump) continue;
      const s = r.range(0.5, e.len - 0.5);
      const p = t.pointOn(e, s);
      const far = Math.hypot(p[0] - this.x, p[2] - this.z);
      if (far < (initial ? 14 : 26)) continue;
      if (this.cars.some((c) => Math.hypot(c.x - p[0], c.z - p[2]) < 5)) continue;
      const model = r.chance(0.08) ? 5 : r.int(5);
      const hw = e.cell.highway ? 1.35 : 1;
      const base = (this.shift.rushHour ? 5 : 6.4) * this.tune.trafficSpeed;
      this.cars.push({
        id: this.carId++, model, edge: e.id, s, next: -1, v: 0, vmax: base * hw * r.range(0.9, 1.1),
        x: p[0], y: p[1], z: p[2], h: p[3], wait: 0, honk: 0, halt: 0, color: r.pick(CAR_PAINTS), braking: false,
      });
      return;
    }
  }

  private static junction(cell: Cell): boolean {
    let n = 0;
    for (let d = 0; d < 4; d++) if (cell.open & (1 << d)) n++;
    return n >= 3;
  }

  private chooseNext(car: Car, e: Edge): number {
    const outs = this.town.nodes[e.to].out;
    if (!outs.length) return -1;
    const r = this.trafficRng;
    const opts = outs.filter((i) => this.town.edges[i].turn !== 'uturn');
    const list = opts.length ? opts : outs;
    // prefer going straight; on the ring road stay on it
    let total = 0;
    const w = list.map((i) => {
      const q = this.town.edges[i];
      const k = q.turn === 'straight' ? 1.6 : 1;
      const hw = e.cell.highway && q.cell.highway ? 1.5 : 1;
      total += k * hw;
      return k * hw;
    });
    let pick = r.next() * total;
    for (let i = 0; i < list.length; i++) { pick -= w[i]; if (pick <= 0) return list[i]; }
    return list[list.length - 1];
  }

  private pt = [0, 0, 0, 0];
  private traffic(dt: number): void {
    const t = this.town;
    // the Rush grows its traffic with every delivery
    if (this.rush) this.carTarget = Math.round(Math.min(RUSH.carsMax, RUSH.carsStart + this.stats.delivered * 0.7) * this.tune.traffic);
    if (this.cars.length < this.carTarget && this.trafficRng.chance(dt * 0.5)) this.spawnCar(false);
    const fxv = Math.sin(this.h), fzv = Math.cos(this.h);
    for (let ci = this.cars.length - 1; ci >= 0; ci--) {
      const car = this.cars[ci];
      const e = t.edges[car.edge];
      if (car.next < 0) car.next = this.chooseNext(car, e);
      const nx = car.next >= 0 ? t.edges[car.next] : null;
      let vmax = car.vmax;
      if (e.turn === 'left' || e.turn === 'right') vmax = Math.min(vmax, e.turn === 'left' ? 5.2 : 4.4);
      if (e.turn === 'uturn') vmax = Math.min(vmax, 3);
      const rem = e.len - car.s;
      if (nx && nx.turn !== 'straight' && rem < 5) vmax = Math.min(vmax, 4.6 + rem * 0.4);
      if (e.cell.bump || (nx?.cell.bump && rem < 3)) vmax = Math.min(vmax, 3.2);
      // gaps: cars ahead on this lane and the next, the van, people crossing
      let gap = Infinity;
      for (const o of this.cars) {
        if (o === car) continue;
        if (o.edge === car.edge && o.s > car.s) gap = Math.min(gap, o.s - car.s);
        else if (nx && o.edge === nx.id) gap = Math.min(gap, rem + o.s);
      }
      const fx = Math.sin(car.h), fz = Math.cos(car.h);
      {
        const dx = this.x - car.x, dz = this.z - car.z;
        const along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
        // the van in this car's lane (an oncoming van in the other lane is not in the way)
        if (along > 0 && along < 9 && lat < 1.3) gap = Math.min(gap, along - 0.4);
        void fxv; void fzv;
      }
      for (const p of this.peds) {
        if (Math.abs(p.side) > ROAD_HALF + 0.4 && p.state !== 'dodge') continue;
        const dx = p.x - car.x, dz = p.z - car.z;
        const along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
        if (along > 0 && along < 8 && lat < 2) gap = Math.min(gap, along - 0.3);
      }
      // junctions: one car at a time; wait at the line until it is free
      if (nx && Sim.junction(nx.cell) && rem < 2.2 + car.v * car.v / 14) {
        const owner = this.reserve.get(nx.cell);
        if (owner === undefined || owner === car.id) this.reserve.set(nx.cell, car.id);
        else gap = Math.min(gap, rem + 0.6);
      }
      if (car.halt > 0) { car.halt -= dt; gap = 0; }
      const stopAt = 2.5;
      const want = gap === Infinity ? vmax : Math.min(vmax, Math.sqrt(Math.max(0, 2 * 7 * (gap - stopAt))));
      car.braking = want < car.v - 0.3 || (want < 0.5 && car.v < 0.5);
      car.v += clamp(want - car.v, -14 * dt, 3.5 * dt);
      if (car.v < 0) car.v = 0;
      car.wait = car.v < 0.3 ? car.wait + dt : 0;
      car.honk = Math.max(0, car.honk - dt);
      // a car stuck behind the van for a while honks
      if (car.wait > 3 && car.honk <= 0 && Math.hypot(this.x - car.x, this.z - car.z) < 6) {
        car.honk = 0.6;
        car.wait = 1.5;
        this.events.push({ type: 'honk', car });
      }
      car.s += car.v * dt;
      while (car.s >= t.edges[car.edge].len && car.next >= 0) {
        const old = t.edges[car.edge];
        car.s -= old.len;
        car.edge = car.next;
        car.next = -1;
        if (this.reserve.get(old.cell) === car.id && t.edges[car.edge].cell !== old.cell) this.reserve.delete(old.cell);
        car.next = this.chooseNext(car, t.edges[car.edge]);
      }
      const p = t.pointOn(t.edges[car.edge], car.s, this.pt);
      car.x = p[0]; car.y = p[1]; car.z = p[2];
      // turn smoothly
      car.h = wrapAngle(car.h + wrapAngle(p[3] - car.h) * Math.min(1, dt * 14));
      // a car stuck for long out of the van's way leaves and comes back elsewhere
      if (car.wait > 12 && Math.hypot(this.x - car.x, this.z - car.z) > 20) {
        for (const [cell, id] of this.reserve) if (id === car.id) this.reserve.delete(cell);
        this.cars.splice(ci, 1);
      }
    }
    // reservations of cars that left their junction (or vanished)
    for (const [cell, id] of this.reserve) {
      const car = this.cars.find((c) => c.id === id);
      if (!car) { this.reserve.delete(cell); continue; }
      const e = t.edges[car.edge];
      const nx = car.next >= 0 ? t.edges[car.next] : null;
      if (e.cell !== cell && nx?.cell !== cell) this.reserve.delete(cell);
    }
  }

  // ------------------------------------------------------------------ pedestrians

  private spawnPed(i: number): void {
    const t = this.town, r = this.rng;
    const cross = t.crosswalks.length > 0 && i % 2 === 0;
    let cell: Cell | null = null;
    if (cross) cell = t.crosswalks[(i / 2) % t.crosswalks.length | 0];
    else {
      const straights = t.cells.filter((c) => c.road && Town.straight(c) && !c.crosswalk && c.ramp < 0 && !c.bridge && t.drivable(c));
      if (straights.length) cell = r.pick(straights);
    }
    if (!cell) return;
    const p: Ped = {
      id: i, kind: cross ? 'cross' : 'stroll', cell, axis: cell.open === 0b0101 ? 0 : 1,
      along: r.range(-2.5, 2.5), side: r.chance(0.5) ? WALK : -WALK, state: 'idle', t: r.range(0.5, 4),
      dirAlong: r.chance(0.5) ? 1 : -1, speed: r.range(1.1, 1.5), x: 0, y: 0, z: 0, h: 0,
      dvx: 0, dvz: 0, hop: 0, fined: 0, model: i, moving: false,
    };
    this.placePed(p);
    this.peds.push(p);
  }

  private placePed(p: Ped): void {
    const c = p.cell;
    const x0 = cx(c.c), z0 = cz(c.r);
    if (p.axis === 0) { p.x = x0 + p.side; p.z = z0 + p.along; }
    else { p.x = x0 + p.along; p.z = z0 + p.side; }
    p.y = this.town.ground(p.x, p.z) + 0.08;
  }

  private walkers(dt: number): void {
    const t = this.town, r = this.rng;
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const sp = Math.abs(this.v);
    for (const p of this.peds) {
      p.fined = Math.max(0, p.fined - dt);
      p.hop = Math.max(0, p.hop - dt);
      p.moving = false;
      // the van comes at them: hop out of the way
      if (p.state !== 'dodge' && sp > 2) {
        const dx = p.x - this.x, dz = p.z - this.z;
        const along = (dx * fx + dz * fz) * Math.sign(this.v), lat = dx * -fz + dz * fx;
        if (along > -0.6 && along < 2.2 + sp * 0.22 && Math.abs(lat) < 1.55) {
          const s = lat >= 0 ? 1 : -1;
          // across the van's path, away from it
          p.dvx = -fz * s * 3.4; p.dvz = fx * s * 3.4;
          p.state = 'dodge';
          p.t = 0.5;
          p.hop = 0.5;
          if (sp > 4.5 && p.fined <= 0) {
            p.fined = 4;
            this.stats.scares++;
            this.stats.fines += 2;
            this.earnings = Math.max(0, this.earnings - 2);
            this.events.push({ type: 'scare', ped: p, fine: 2 });
          } else this.events.push({ type: 'hop', ped: p });
        }
      }
      if (p.state === 'dodge') {
        p.t -= dt;
        p.x += p.dvx * dt; p.z += p.dvz * dt;
        p.h = Math.atan2(p.dvx, p.dvz);
        p.moving = true;
        // back to the cell's frame
        const c = p.cell;
        const lx = p.x - cx(c.c), lz = p.z - cz(c.r);
        p.along = clamp(p.axis === 0 ? lz : lx, -S / 2 + 0.3, S / 2 - 0.3);
        p.side = clamp(p.axis === 0 ? lx : lz, -S / 2 + 0.4, S / 2 - 0.4);
        if (p.t <= 0) {
          // to the nearer sidewalk
          p.state = 'walk';
          p.t = r.range(1, 3);
        }
        this.placePed(p);
        continue;
      }
      // get back onto a sidewalk after a hop
      if (p.state !== 'cross' && Math.abs(Math.abs(p.side) - WALK) > 0.05) {
        const target = Math.sign(p.side || 1) * WALK;
        const d = target - p.side;
        p.side += Math.sign(d) * Math.min(Math.abs(d), p.speed * dt);
        p.moving = true;
        p.h = p.axis === 0 ? (d > 0 ? Math.PI / 2 : -Math.PI / 2) : (d > 0 ? 0 : Math.PI);
        this.placePed(p);
        continue;
      }
      p.t -= dt;
      if (p.state === 'idle') {
        if (p.t <= 0) {
          if (p.kind === 'cross' && r.chance(0.6)) { p.state = 'wait'; p.t = 0.6; }
          else { p.state = 'walk'; p.t = r.range(2, 5); p.dirAlong = r.chance(0.5) ? 1 : -1; }
        }
      } else if (p.state === 'walk') {
        p.along += p.dirAlong * p.speed * dt;
        p.moving = true;
        p.h = p.axis === 0 ? (p.dirAlong > 0 ? 0 : Math.PI) : (p.dirAlong > 0 ? Math.PI / 2 : -Math.PI / 2);
        const lim = p.kind === 'cross' ? 2.6 : S / 2 - 0.2;
        if (Math.abs(p.along) > lim) {
          if (p.kind === 'stroll') {
            // walk on into the next straight cell of this street, or turn back
            const d = p.axis === 0 ? (p.dirAlong > 0 ? 2 : 0) : (p.dirAlong > 0 ? 1 : 3);
            const n = t.cell(p.cell.r + DZ[d], p.cell.c + DX[d]);
            if (n && n.road && Town.straight(n) && n.open === p.cell.open && n.ramp < 0 && !n.bridge) {
              p.cell = n;
              p.along -= p.dirAlong * S;
            } else { p.along = Math.sign(p.along) * lim; p.dirAlong *= -1; }
          } else { p.along = Math.sign(p.along) * lim; p.dirAlong *= -1; }
        }
        if (p.t <= 0) { p.state = 'idle'; p.t = r.range(1, 3.5); }
      } else if (p.state === 'wait') {
        p.h = p.axis === 0 ? (p.side > 0 ? -Math.PI / 2 : Math.PI / 2) : (p.side > 0 ? Math.PI : 0);
        // a van right at the crossing makes them wait
        const close = Math.hypot(this.x - cx(p.cell.c), this.z - cz(p.cell.r)) < 5 && sp > 1;
        if (p.t <= 0 && !close) { p.state = 'cross'; p.dirAlong = p.side > 0 ? -1 : 1; }
      } else if (p.state === 'cross') {
        p.side += p.dirAlong * p.speed * dt;
        p.moving = true;
        p.h = p.axis === 0 ? (p.dirAlong > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dirAlong > 0 ? 0 : Math.PI);
        if (Math.abs(p.side) >= WALK && Math.sign(p.side) === p.dirAlong) {
          p.side = p.dirAlong * WALK;
          p.state = 'idle';
          p.t = r.range(2, 6);
        }
      }
      this.placePed(p);
    }
  }

  // ------------------------------------------------------------------ stops, pickups, deliveries

  /** The bay the van stands in (its street cell, near the middle, on the asphalt). */
  private bayAt(): Bay | null {
    const cell = this.town.cellAt(this.x, this.z);
    if (!cell) return null;
    const lx = this.x - cx(cell.c), lz = this.z - cz(cell.r);
    const ns = cell.open === 0b0101;
    const along = ns ? lz : lx, lat = ns ? lx : lz;
    if (Math.abs(along) > 3 || Math.abs(lat) > ROAD_HALF + 0.5) return null;
    // the shop or house on the van's side of the street (either lane counts)
    const bays = this.activeBays();
    let best: Bay | null = null, bd = Infinity;
    for (const b of bays) {
      if (b.cell !== cell) continue;
      const d = Math.hypot(this.x - b.x, this.z - b.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Bays with something to do now: shops with offers (and room), houses with carried orders. */
  activeBays(): Bay[] {
    const out: Bay[] = [];
    for (const o of this.orders) {
      if (o.state === 'offered' && !out.includes(o.shop)) out.push(o.shop);
      if (o.state === 'carried' && !out.includes(o.house)) out.push(o.house);
    }
    return out;
  }

  carried(): Order[] { return this.orders.filter((o) => o.state === 'carried'); }
  offered(): Order[] { return this.orders.filter((o) => o.state === 'offered'); }
  active(): Order[] { return this.orders.filter((o) => o.state === 'offered' || o.state === 'carried'); }

  private stops(dt: number): void {
    const b = Math.abs(this.v) < 1.3 ? this.bayAt() : null;
    if (b !== this.stopBay) { this.stopBay = b; this.stopT = 0; this.stopDone = false; }
    if (!b || this.stopDone) return;
    this.stopT += dt;
    if (this.stopT < 0.35) return;
    this.stopDone = true;
    const isShop = this.town.shops.includes(b);
    this.events.push({ type: 'stop', bay: b, kind: isShop ? 'shop' : 'house' });
    if (isShop) {
      let room = this.hand.capacity - this.carried().length;
      let any = false;
      for (const o of this.orders) {
        if (o.state !== 'offered' || o.shop !== b) continue;
        any = true;
        if (room <= 0) continue;
        room--;
        o.state = 'carried';
        this.events.push({ type: 'pickup', order: o });
      }
      if (any && this.offered().some((o) => o.shop === b)) this.events.push({ type: 'full', bay: b });
    } else {
      for (const o of this.orders) {
        if (o.state !== 'carried' || o.house !== b) continue;
        this.deliver(o);
      }
    }
  }

  private deliver(o: Order): void {
    o.state = 'done';
    const frac = clamp(o.left / o.total, 0, 1);
    let pay: number, tip: number;
    if (o.late) { pay = Math.round(o.base * 0.4); tip = 0; this.stats.late++; }
    else if (o.cond < 0.25) { pay = Math.round(o.base * 0.5); tip = 0; this.stats.ruined++; }
    else {
      pay = o.base;
      tip = Math.round(o.base * 0.85 * (0.2 + 0.8 * frac) * Math.pow(o.cond, 1.5));
    }
    const perfect = !o.late && o.cond > 0.95 && frac > 0.45;
    if (perfect) { tip += 2; this.stats.perfect++; }
    if (o.vip) this.stats.vip++;
    this.stats.delivered++;
    this.stats.tips += tip;
    this.earnings += pay + tip;
    let bonusTime = 0;
    if (this.rush) {
      bonusTime = clamp(10 + o.dist / 5, 14, 28) * Math.max(0.5, Math.pow(0.975, this.stats.delivered - 1)) * (this.mode === 'easy' ? 1.25 : 1);
      this.clock += bonusTime;
    }
    this.events.push({ type: 'deliver', order: o, pay, tip, perfect, bonusTime });
  }

  // ------------------------------------------------------------------ coffee, orders, weather

  private coffeeAndOrders(dt: number): void {
    for (const c of this.coffees) {
      if (!c.ready) { c.t -= dt; if (c.t <= 0) c.ready = true; continue; }
      if (this.turbo < TURBO_MAX && Math.hypot(this.x - c.x, this.z - c.z) < 2.1) {
        c.ready = false;
        c.t = 22;
        this.turbo++;
        this.events.push({ type: 'coffee', x: c.x, y: c.y, z: c.z });
      }
    }
    for (const o of this.orders) {
      if (o.state !== 'offered' && o.state !== 'carried') continue;
      o.left -= dt;
      if (o.left > 0) continue;
      o.left = 0;
      if (o.state === 'offered') { o.state = 'gone'; this.stats.expired++; this.events.push({ type: 'expire', order: o }); }
      else if (!o.late) { o.late = true; this.events.push({ type: 'late', order: o }); }
    }
    // new offers
    const sh = this.shift;
    const offers = this.offered().length;
    const busy = sh.tutorial && this.active().length > 0;
    if (offers < sh.offers && !busy) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.offer();
        this.spawnT = sh.tutorial ? 0.8 : this.rng.range(1.5, 4);
      }
    }
  }

  private offer(): void {
    const t = this.town, r = this.rng, sh = this.shift;
    const loc = t.locate(this.x, this.z, this.h);
    for (let tries = 0; tries < 30; tries++) {
      const cargo = r.pick(sh.kinds);
      const shops = t.shops.filter((b) => b.lot.shop === cargo && t.drivable(b.cell));
      if (!shops.length) continue;
      const shop = r.pick(shops);
      const house = r.pick(t.houses);
      if (!t.drivable(house.cell) || this.active().some((o) => o.house === house)) continue;
      const e = t.bayEdges(shop)[0];
      if (!e) continue;
      const dist = t.routeDist(e, e.len / 2, house);
      if (!isFinite(dist) || dist < 22 || dist > (sh.tutorial ? 70 : 120)) continue;
      const toShop = loc ? t.routeDist(loc.edge, loc.s, shop) : 40;
      if (!isFinite(toShop)) continue;
      const vip = !sh.tutorial && r.chance(sh.vip) && !this.active().some((o) => o.vip);
      const total = (20 + (toShop + dist) / 4.6) * CARGO_TIME[cargo] * this.tune.timer * (vip ? 0.7 : 1) * (sh.tutorial ? 1.6 : 1);
      const base = Math.round((6 + dist / 6) * (vip ? 2.2 : 1));
      const o: Order = { id: this.nextOrder++, cargo, shop, house, total, left: total, state: 'offered', cond: 1, vip, base, late: false, dist };
      this.orders.push(o);
      this.events.push({ type: 'offer', order: o });
      return;
    }
  }

  private rushWeather(): void {
    const tt = this.time;
    const was = [this.night, this.rain];
    this.night = clamp((tt - RUSH.dusk) / (RUSH.night - RUSH.dusk), 0, 1);
    this.rain = clamp((tt - RUSH.rain) / 20, 0, 1);
    if (was[0] === 0 && this.night > 0) this.events.push({ type: 'weather', kind: 'dusk' });
    if (was[0] < 1 && this.night >= 1) this.events.push({ type: 'weather', kind: 'night' });
    if (was[1] === 0 && this.rain > 0) this.events.push({ type: 'weather', kind: 'rain' });
  }

  // ------------------------------------------------------------------ results and helpers

  /** Stars for the earnings (shifts). */
  stars(): number {
    const tg = this.shift.targets;
    return this.earnings >= tg[2] ? 3 : this.earnings >= tg[1] ? 2 : this.earnings >= tg[0] ? 1 : 0;
  }

  /** The bay the van should head for next (the arrow, the bot): the most urgent job nearby. */
  target(): Bay | null {
    const t = this.town;
    const loc = t.locate(this.x, this.z, this.h);
    if (!loc) return null;
    let best: Bay | null = null, bs = Infinity;
    const room = this.hand.capacity - this.carried().length;
    for (const o of this.orders) {
      let b: Bay;
      if (o.state === 'carried') b = o.house;
      else if (o.state === 'offered' && room > 0) b = o.shop;
      else continue;
      const d = t.routeDist(loc.edge, loc.s, b);
      // urgent orders first, deliveries a little before pickups, VIPs first of all
      const score = d / 6 + Math.max(0, 18 - o.left) * 0.4 - (o.state === 'carried' ? 2 : 0) - (o.vip ? 6 : 0);
      if (score < bs) { bs = score; best = b; }
    }
    return best;
  }

  /** Test hook: the van at a cell's lane, heading in direction d. */
  place(x: number, z: number, h: number, v = 0): void {
    this.x = x; this.z = z; this.h = h; this.v = v; this.vl = 0;
    this.y = this.town.ground(x, z); this.gPrev = this.y; this.gv = 0;
  }
}

export { LANE };
