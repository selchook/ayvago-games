// Street Heat: the simulation (no rendering). One fixed step of 1/60 s moves the player's car
// (arcade handling with weight: grip, power slides on the handbrake, nitro, ramps and air, damage),
// the traffic (lane following, lights, turns, honking, knocked about when hit), the people on the
// sidewalks (walk, cross, dive out of the way: nobody is ever hit), the props (cones, bins,
// hydrants, signs fly when hit) and the police (patrols that witness crimes, the heat and its stars,
// pursuits that escalate with ramming, roadblocks and spike strips, the search when they lose
// sight, busted when boxed in). The jobs (jobs.ts) drive the story and the modes on top of it.
// What happened in a step goes into `events` for the view, the sounds and the HUD.
import { city, City, PITCH, SIZE, halfWidth, SIDEWALK, segBox, along, type Rect, type Circle, type Spot, type PropKind, type Edge } from './city';
import { clamp, CARS, carSpec, handling, STARS, TRAFFIC_MODELS, TRAFFIC_PAINTS, COP_MODEL, type CarId, type Handling, type Tuning, type Upgrades } from './defs';

export const DT = 1 / 60;

export interface DriveInput { steer: number; gas: number; brake: number; handbrake: boolean; nitro: boolean; horn: boolean; /** Stop and stay stopped (no reversing). */ hold?: boolean }
export const NO_INPUT: DriveInput = { steer: 0, gas: 0, brake: 0, handbrake: false, nitro: false, horn: false };

export type Role = 'player' | 'traffic' | 'cop' | 'target' | 'escort' | 'parked';
export type Mode = 'lane' | 'free' | 'parked';
export type CopState = 'patrol' | 'pursue' | 'search' | 'block' | 'out';

export interface Turn { x0: number; z0: number; cx: number; cz: number; x1: number; z1: number; len: number; edge: number; from: number; to: number; lane: number }

export class Car {
  x = 0; z = 0; y = 0; vy = 0; h = 0; vx = 0; vz = 0; w = 0;
  len = 4.2; wid = 1.8; mass = 1;
  hp = 100; health = 100;
  mode: Mode = 'free';
  // lane following
  edge = -1; from = -1; to = -1; lane = 0; s = 0; laneLen = 0; speed = 0; vmax = 11; wait = 0; honkT = 0;
  turn: Turn | null = null; ts = 0;
  // the look
  steer = 0; brakeLight = false; skid = 0; airborne = false; siren = false; smoke = 0; hazard = false;
  nitroT = 0; spikesT = 0; rest = 0; lastHit = 0; airT = 0; jumpX = 0; jumpZ = 0;
  // AI
  cop: CopState | null = null;
  path: number[] = []; pathT = 0; stuckT = 0; revT = 0; aiT = 0; searchX = 0; searchZ = 0;
  disabled = false;
  hand: Handling | null = null;
  vyRamp = 0;
  /** A story car reached its spot. */
  arrived = false;
  /** A story car waits parked until the player comes this close (0: it drives). */
  waitFor = 0;
  /** When ramming this (police) car last counted as a crime. */
  crimeT = -99;
  ai: ((sim: Sim, c: Car, dt: number) => void) | null = null;
  /** Collision circles (x, z, r × 3), refreshed once per tick. */
  readonly cc = new Float32Array(9);
  ccTick = -1;
  constructor(public id: number, public role: Role, public model: string, public paint: number) {}
  get speedAbs(): number { return Math.hypot(this.vx, this.vz); }
  /** Forward speed (negative when reversing). */
  get fwd(): number { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
}

export interface Ped { id: number; block: number; s: number; dir: number; speed: number; x: number; z: number; h: number; model: number; shirt: number; state: 'walk' | 'stand' | 'cross' | 'dive' | 'run'; t: number; tx: number; tz: number; vx: number; vz: number; frame: number; idle: number; nextBlock: number; nextS: number }

export interface PropState { kind: PropKind; x: number; z: number; y: number; rot: number; x0: number; z0: number; rot0: number; vx: number; vy: number; vz: number; spin: number; tilt: number; down: number; hidden: boolean }

export interface Spike { x: number; z: number; rot: number; len: number; t: number }

export type SimEvent =
  | { type: 'crash'; x: number; z: number; impact: number; cop: boolean; car: boolean; wall: boolean }
  | { type: 'scrape'; x: number; z: number }
  | { type: 'prop'; kind: PropKind; x: number; z: number }
  | { type: 'dive'; x: number; z: number }
  | { type: 'honk'; x: number; z: number }
  | { type: 'horn' }
  | { type: 'nitro' }
  | { type: 'stars'; stars: number; prev: number }
  | { type: 'pursuit' }
  | { type: 'search' }
  | { type: 'lost' }
  | { type: 'busted' }
  | { type: 'wrecked' }
  | { type: 'takedown'; x: number; z: number; car: Car }
  | { type: 'roadblock'; x: number; z: number }
  | { type: 'spikes'; x: number; z: number }
  | { type: 'popped' }
  | { type: 'jump'; dist: number; air: number }
  | { type: 'land'; impact: number }
  | { type: 'redLight' }
  | { type: 'smoke'; level: number };

const BOX_TMP: Rect[] = [];
const CIRC_TMP: Circle[] = [];

/** One step of a free car's dynamics (player, cops, targets, knocked traffic). */
function drive(sim: Sim, c: Car, inp: DriveInput, dt: number): void {
  const hand = c.hand ?? DEFAULT_HAND;
  const sh = Math.sin(c.h), ch = Math.cos(c.h);
  // forward and right (right of the driver)
  let vf = c.vx * sh + c.vz * ch;
  let vr = c.vx * -ch + c.vz * sh;
  const spikes = c.spikesT > 0 ? 1 : 0;
  const nitro = c.nitroT > 0 ? 1 : 0;
  const top = hand.top * (1 + 0.32 * nitro) * (spikes ? 0.62 : 1) * (c.disabled ? 0 : 1);
  const accel = hand.accel * (1 + 0.95 * nitro) * (c.health < hand.hp * 0.15 ? 0.7 : 1);
  const off = sim.city.offRoad(c.x, c.z) ? 1 : 0;
  if (!c.airborne) {
    if (inp.gas > 0 && !c.disabled) {
      const k = vf < 0 ? 2.2 : Math.max(0, 1 - (vf / top) ** 2);
      vf += accel * inp.gas * k * dt;
    }
    if (inp.hold) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 16 * dt);
    else if (inp.brake > 0) {
      if (vf > 0.6) vf -= 22 * inp.brake * dt;
      else vf = Math.max(-top * 0.32, vf - accel * 0.7 * inp.brake * dt);
    }
    // rolling and air drag; engine braking off the gas
    vf -= vf * (0.06 + 0.0016 * Math.abs(vf)) * dt + (inp.gas ? 0 : Math.sign(vf) * Math.min(Math.abs(vf), 1.2 * dt));
    if (inp.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5.5 * dt);
    // lateral grip: the handbrake lets the rear go
    const grip = hand.grip * (spikes ? 0.5 : 1) * (off ? 0.85 : 1);
    const k = inp.handbrake ? 1.0 : 7.5 * grip;
    const before = Math.abs(vr);
    vr -= vr * Math.min(1, k * dt);
    c.skid = Math.max(0, before - 2.2) + (inp.brake > 0 && vf > 6 && !inp.handbrake ? 0 : 0) + (inp.handbrake && Math.abs(vf) > 6 ? 2 : 0);
    // yaw: wheels steer harder at walking pace, softer at speed
    const sp = Math.abs(vf);
    const turnK = clamp(sp / 7, 0, 1) * (1 - 0.42 * clamp((sp - 18) / 28, 0, 1));
    let target = -inp.steer * 2.05 * turnK * Math.sign(vf || 1) * (0.9 + 0.1 * grip);
    if (inp.handbrake && sp > 5) target *= 1.75;
    const resp = inp.handbrake ? 5 : 8;
    c.w += (target - c.w) * Math.min(1, resp * dt);
  } else {
    c.w *= 1 - Math.min(1, 0.6 * dt);
    c.skid = 0;
  }
  c.h += c.w * dt;
  // velocity in the new frame: the slide (vr) carries on, the grip pulls it back next step
  const sh2 = Math.sin(c.h), ch2 = Math.cos(c.h);
  c.vx = sh2 * vf - ch2 * vr;
  c.vz = ch2 * vf + sh2 * vr;
  c.steer += (inp.steer - c.steer) * Math.min(1, 10 * dt);
  c.brakeLight = inp.brake > 0 && vf > 0.5;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  // height: curbs, ramps and air
  const g = sim.city.groundAt(c.x, c.z);
  if (c.airborne) {
    c.vy -= 24 * dt;
    c.y += c.vy * dt;
    c.airT += dt;
    if (c.y <= g.y) {
      const impact = -c.vy;
      c.y = g.y; c.vy = 0; c.airborne = false;
      if (c.role === 'player') {
        sim.events.push({ type: 'land', impact });
        if (c.airT > 0.45) sim.events.push({ type: 'jump', dist: Math.hypot(c.x - c.jumpX, c.z - c.jumpZ), air: c.airT });
        if (impact > 10) sim.damage(c, (impact - 10) * 1.6, false);
      }
      c.airT = 0;
    }
  } else if (g.ramp || c.y > 0.2) {
    const vy = (g.y - c.y) / dt;
    if (g.y < c.y - 0.12 && c.y > 0.3) {
      // off the end of a ramp: fly
      c.airborne = true; c.vy = Math.max(0, c.vyRamp); c.airT = 0; c.jumpX = c.x; c.jumpZ = c.z;
    } else { c.vyRamp = vy; c.y = g.y; }
  } else c.y = g.y;
}

const DEFAULT_HAND: Handling = { accel: 8, top: 30, grip: 1, mass: 1, hp: 100, nitro: 0, armour: 0 };

let tickN = 0;
/** The car's three collision circles (back, middle, front): x, z, r each. */
function circles(c: Car): Float32Array {
  if (c.ccTick === tickN) return c.cc;
  c.ccTick = tickN;
  const sh = Math.sin(c.h), ch = Math.cos(c.h), r = c.wid * 0.5, a = c.len * 0.5 - r;
  const o = c.cc;
  o[0] = c.x - sh * a; o[1] = c.z - ch * a; o[2] = r;
  o[3] = c.x; o[4] = c.z; o[5] = r;
  o[6] = c.x + sh * a; o[7] = c.z + ch * a; o[8] = r;
  return o;
}

export interface Witness { seen: boolean; lastX: number; lastZ: number; lastT: number }

export interface SimOptions {
  car: CarId;
  up: Upgrades;
  paint: number;
  tune: Tuning;
  seed: number;
  /** Where the player starts: a spot. */
  start: Spot;
  /** Hours of the night: 0 day … 1 night. */
  night: number;
  /** No police at all (tutorial) / no patrols. */
  police?: boolean;
}

export class Sim {
  readonly city: City = city();
  readonly events: SimEvent[] = [];
  readonly cars: Car[] = [];
  readonly peds: Ped[] = [];
  readonly props: PropState[] = [];
  readonly spikes: Spike[] = [];
  player: Car;
  time = 0;
  rnd: () => number;
  tune: Tuning;
  /** Felony points and the stars they make (or a job's minimum). */
  felony = 0;
  stars = 0;
  minStars = 0;
  maxStars = 5;
  /** The police: someone sees the player now, the search's centre, radius and time left. */
  seen = false;
  seenT = 0;
  pursuit = false;
  searching = false;
  searchX = 0; searchZ = 0; searchR = 0; searchLeft = 0; searchTotal = 1;
  bust = 0;
  busted = false;
  wrecked = false;
  police: boolean;
  /** Cars driven off by the player (takedowns) and other stats. */
  stats = { takedowns: 0, crashes: 0, props: 0, dives: 0, topSpeed: 0, maxStars: 0, jumps: 0, airTime: 0, distance: 0 };
  /** Targets the police chase (the player, or an escorted car). */
  copTarget: Car;
  private nextId = 1;
  private redCheck = { node: -1, edge: -1, inside: false };
  private roadblockT = 12;
  private spikeT = 18;
  private spawnT = 0;
  private witnessT = 0;
  private acc = 0;
  /** A job may freeze the player (briefing, cut scenes). */
  frozen = false;
  /** Hand of the player's car (garage choices). */
  readonly hand: Handling;
  nitro = 0;
  /** Recent player positions for the replay: x, z, h, y, steer (ring of 10 s at 20 Hz). */
  readonly track: Float32Array = new Float32Array(200 * 6);
  trackN = 0;
  private trackAcc = 0;

  constructor(readonly opt: SimOptions) {
    this.rnd = mulberry(opt.seed);
    this.tune = opt.tune;
    this.police = opt.police ?? true;
    const spec = carSpec(opt.car);
    this.hand = handling(spec, opt.up);
    this.player = this.addCar('player', spec.model, opt.paint);
    this.player.hand = this.hand;
    this.player.hp = this.player.health = this.hand.hp;
    this.player.len = spec.length; this.player.wid = spec.width; this.player.mass = spec.mass;
    this.nitro = this.hand.nitro;
    this.place(this.player, opt.start.x, opt.start.z, opt.start.h);
    this.copTarget = this.player;
    for (const p of this.city.props) this.props.push({ kind: p.kind, x: p.x, z: p.z, y: 0, rot: p.rot, x0: p.x, z0: p.z, rot0: p.rot, vx: 0, vy: 0, vz: 0, spin: 0, tilt: 0, down: 0, hidden: false });
    for (const p of this.city.parked) {
      const c = this.addCar('parked', pick(this.rnd, TRAFFIC_MODELS.slice(0, 6)), pick(this.rnd, TRAFFIC_PAINTS));
      c.mode = 'parked';
      this.place(c, p.x, p.z, p.h);
    }
    this.populate(true);
  }

  addCar(role: Role, model: string, paint: number): Car {
    const c = new Car(this.nextId++, role, model, paint);
    const spec = CARS.find((s) => s.model === model);
    if (spec) { c.len = spec.length; c.wid = spec.width; }
    if (model.startsWith('transport:Bus')) { c.len = 10.5; c.wid = 2.7; c.mass = 4; c.vmax = 9; }
    else if (model.startsWith('transport:SchoolBus')) { c.len = 9.5; c.wid = 2.4; c.mass = 3.5; c.vmax = 9; }
    else if (model.startsWith('transport:Ambulance')) { c.len = 6.2; c.wid = 2.4; c.mass = 2.2; }
    else if (model === COP_MODEL) { c.len = 3.73; c.wid = 1.78; c.mass = 1.25; }
    this.cars.push(c);
    return c;
  }

  removeCar(c: Car): void {
    const i = this.cars.indexOf(c);
    if (i >= 0) this.cars.splice(i, 1);
  }

  place(c: Car, x: number, z: number, h: number, v = 0): void {
    c.x = x; c.z = z; c.h = h; c.vx = Math.sin(h) * v; c.vz = Math.cos(h) * v; c.w = 0; c.y = this.city.groundAt(x, z).y; c.vy = 0; c.airborne = false;
  }

  // ---------------------------------------------------------------- the step

  /** Advances by dt (fixed sub-steps of 1/60 s). */
  step(dt: number, inp: DriveInput): void {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= DT && n < 6) { this.acc -= DT; n++; this.tick(inp); }
  }

  private tick(inp: DriveInput): void {
    const dt = DT;
    this.time += dt;
    tickN++;
    const p = this.player;
    // the player
    if (!this.busted && !this.wrecked && !this.frozen) {
      if (inp.nitro && p.nitroT <= 0 && this.nitro > 0 && !p.airborne) { this.nitro--; p.nitroT = 2.6; this.events.push({ type: 'nitro' }); }
      if (inp.horn) { this.events.push({ type: 'horn' }); this.scarePeds(p.x, p.z, 16); }
      drive(this, p, inp, dt);
    } else {
      // stopped: roll out
      drive(this, p, { ...NO_INPUT, hold: true }, dt);
    }
    p.nitroT = Math.max(0, p.nitroT - dt);
    p.spikesT = Math.max(0, p.spikesT - dt);
    this.stats.topSpeed = Math.max(this.stats.topSpeed, p.speedAbs);
    this.stats.distance += p.speedAbs * dt;
    // everyone else
    for (const c of this.cars) {
      if (c === p) continue;
      if (c.mode === 'lane') this.laneStep(c, dt);
      else if (c.mode === 'free') this.aiStep(c, dt);
      c.nitroT = Math.max(0, c.nitroT - dt);
      c.spikesT = Math.max(0, c.spikesT - dt);
      c.honkT = Math.max(0, c.honkT - dt);
    }
    this.collide(dt);
    this.pedStep(dt);
    this.propStep(dt);
    this.policeStep(dt);
    this.spikeStep(dt);
    this.redLights();
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.5; this.populate(false); }
    // the replay track
    this.trackAcc += dt;
    if (this.trackAcc >= 0.05) {
      this.trackAcc = 0;
      const k = (this.trackN % 200) * 6;
      this.track[k] = p.x; this.track[k + 1] = p.z; this.track[k + 2] = p.h; this.track[k + 3] = p.y; this.track[k + 4] = p.steer; this.track[k + 5] = p.speedAbs;
      this.trackN++;
    }
  }

  // ---------------------------------------------------------------- damage

  damage(c: Car, amount: number, witnessed: boolean): void {
    if (amount <= 0 || c.disabled) return;
    const k = c === this.player ? this.tune.damage * (1 - 0.1 * this.hand.armour) : c.role === 'target' ? this.tune.ram : 1;
    c.health = Math.max(0, c.health - amount * k);
    void witnessed;
    if (c === this.player) {
      const lvl = c.health < c.hp * 0.12 ? 3 : c.health < c.hp * 0.3 ? 2 : c.health < c.hp * 0.55 ? 1 : 0;
      if (lvl > c.smoke) this.events.push({ type: 'smoke', level: lvl });
      c.smoke = lvl;
      if (c.health <= 0 && !this.wrecked) { this.wrecked = true; this.events.push({ type: 'wrecked' }); }
    } else if (c.health <= 0) {
      c.disabled = true;
      c.smoke = 3;
      if (c.role === 'cop' && c.cop !== 'out') {
        c.cop = 'out'; c.siren = false; this.stats.takedowns++;
        this.events.push({ type: 'takedown', x: c.x, z: c.z, car: c });
      }
    } else c.smoke = c.health < c.hp * 0.4 ? 2 : c.health < c.hp * 0.7 ? 1 : 0;
  }

  /** Puts the car back in shape (repair, a continue). */
  repair(c: Car, to = 1): void {
    c.health = Math.max(c.health, c.hp * to);
    c.smoke = c.health < c.hp * 0.12 ? 3 : c.health < c.hp * 0.3 ? 2 : c.health < c.hp * 0.55 ? 1 : 0;
    c.disabled = false;
  }

  // ---------------------------------------------------------------- collisions

  private collide(dt: number): void {
    const free = this.cars.filter((c) => c.mode === 'free' || c === this.player);
    for (const c of free) this.staticHits(c);
    // cars against cars (any car near a free one)
    for (const a of free) {
      for (const b of this.cars) {
        if (a === b || (b.mode === 'free' && b.id < a.id)) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = (a.len + b.len) * 0.5 + 0.5;
        if (dx * dx + dz * dz > rr * rr || Math.abs(a.y - b.y) > 1.6) continue;
        this.carHit(a, b);
      }
    }
    // people never get hit: they are pushed clear
    const p = this.player;
    for (const c of free) {
      if (c.speedAbs < 0.5) continue;
      for (const ped of this.peds) {
        const dx = ped.x - c.x, dz = ped.z - c.z;
        if (dx * dx + dz * dz > 16) continue;
        const cc = circles(c);
        for (let k = 0; k < 9; k += 3) {
          const cx = cc[k], cz = cc[k + 1], r = cc[k + 2];
          const ex = ped.x - cx, ez = ped.z - cz, d = Math.hypot(ex, ez), min = r + 0.45;
          if (d < min) {
            const nx = d > 0.01 ? ex / d : -Math.cos(c.h), nz = d > 0.01 ? ez / d : Math.sin(c.h);
            ped.x = cx + nx * min; ped.z = cz + nz * min;
            if (ped.state !== 'dive') this.dive(ped, c, c === p);
          }
        }
      }
    }
    void dt;
  }

  private staticHits(c: Car): void {
    const city = this.city;
    city.near(c.x, c.z, c.len, BOX_TMP, CIRC_TMP);
    let hitN = 0, hitX = 0, hitZ = 0, impact = 0;
    for (let iter = 0; iter < 2; iter++) {
      c.ccTick = -1;
      const cc = circles(c);
      for (let k = 0; k < 9; k += 3) {
        const ox = cc[k], oz = cc[k + 1], r = cc[k + 2];
        for (const b of BOX_TMP) {
          if (c.y > 3.5) continue;
          const px = clamp(ox, b.x0, b.x1), pz = clamp(oz, b.z0, b.z1);
          let dx = ox - px, dz = oz - pz;
          let d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-4) {
            // centre inside the box: out along the shortest way
            const l = ox - b.x0, rr = b.x1 - ox, t = oz - b.z0, bt = b.z1 - oz;
            const m = Math.min(l, rr, t, bt);
            dx = m === l ? -1 : m === rr ? 1 : 0; dz = m === t ? -1 : m === bt ? 1 : 0; d = 0;
            const pen = r + m;
            c.x += dx * pen; c.z += dz * pen;
          } else {
            const nx = dx / d, nz = dz / d, pen = r - d;
            c.x += nx * pen; c.z += nz * pen;
            dx = nx; dz = nz;
          }
          const imp = this.bounce(c, dx, dz, ox, oz);
          if (imp > impact) { impact = imp; hitX = px; hitZ = pz; }
          hitN++;
        }
        for (const ci of CIRC_TMP) {
          const dx = ox - ci.x, dz = oz - ci.z, d = Math.hypot(dx, dz), min = r + ci.r;
          if (d >= min || d < 1e-4) continue;
          const nx = dx / d, nz = dz / d;
          c.x += nx * (min - d); c.z += nz * (min - d);
          const imp = this.bounce(c, nx, nz, ox, oz);
          if (imp > impact) { impact = imp; hitX = ci.x; hitZ = ci.z; }
          hitN++;
        }
      }
    }
    if (hitN && c === this.player) this.hitFx(c, hitX, hitZ, impact, null);
    // walls and poles hurt the police and the traffic, not the story's cars (they would stall the job)
    else if (hitN && impact > 6 && c.role !== 'target' && c.role !== 'escort') this.damage(c, (impact - 6) * 1.5, false);
  }

  /** Velocity response against a static normal; returns the impact speed. */
  private bounce(c: Car, nx: number, nz: number, ox: number, oz: number): number {
    const vn = c.vx * nx + c.vz * nz;
    if (vn >= 0) return 0;
    c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz;
    // scraping along a wall slows the car
    c.vx *= 0.985; c.vz *= 0.985;
    // a hit off the centre line turns the car
    const rx = ox - c.x, rz = oz - c.z;
    c.w += (rx * nz - rz * nx) * vn * 0.06;
    return -vn;
  }

  private carHit(a: Car, b: Car): void {
    let best = 0, nx = 0, nz = 0, px = 0, pz = 0;
    const ca = circles(a), cb = circles(b);
    for (let i = 0; i < 9; i += 3) for (let k = 0; k < 9; k += 3) {
      const ax = ca[i], az = ca[i + 1], ar = ca[i + 2], bx = cb[k], bz = cb[k + 1], br = cb[k + 2];
      const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), min = ar + br;
      if (d >= min || d < 1e-4) continue;
      const pen = min - d;
      if (pen > best) { best = pen; nx = dx / d; nz = dz / d; px = (ax + bx) / 2; pz = (az + bz) / 2; }
    }
    if (best <= 0) return;
    // lane cars become free (knocked about)
    if (b.mode !== 'free') this.knock(b);
    const ma = a.mass, mb = b.mode === 'parked' ? b.mass * 1.2 : b.mass;
    const inv = 1 / ma + 1 / mb;
    a.x += nx * best * (1 / ma) / inv; a.z += nz * best * (1 / ma) / inv;
    b.x -= nx * best * (1 / mb) / inv; b.z -= nz * best * (1 / mb) / inv;
    const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
    const vn = rvx * nx + rvz * nz;
    if (vn >= 0) return;
    const j = -(1 + 0.25) * vn / inv;
    a.vx += j * nx / ma; a.vz += j * nz / ma;
    b.vx -= j * nx / mb; b.vz -= j * nz / mb;
    // spin both a little round their centres
    a.w += ((px - a.x) * nz - (pz - a.z) * nx) * j * 0.02 / ma;
    b.w -= ((px - b.x) * nz - (pz - b.z) * nx) * j * 0.02 / mb;
    const impact = -vn;
    b.lastHit = this.time;
    a.lastHit = this.time;
    if (a === this.player || b === this.player) {
      const other = a === this.player ? b : a;
      this.hitFx(this.player, px, pz, impact, other);
      // the other car takes the hit too (rams)
      if (impact > 3) this.damage(other, (impact - 3) * 2.6 * (this.player.mass / other.mass) * (other.role === 'cop' ? 1.15 : 1), true);
      if (other.role === 'traffic' && impact > 2.5) other.honkT = 0;
    } else if (impact > 5) {
      this.damage(a, (impact - 5) * 1.2, false);
      this.damage(b, (impact - 5) * 1.2, false);
    }
  }

  /** Player hit something: damage, felony, the event. */
  private hitFx(p: Car, x: number, z: number, impact: number, other: Car | null): void {
    if (impact < 1.2) return;
    const cop = other?.role === 'cop';
    if (impact > 3) {
      this.damage(p, Math.min(30, Math.max(0, impact - 6) * 1.15 * (other ? Math.min(1.5, other.mass / p.mass) * (cop ? 0.45 : 1) : 1)), false);
      this.events.push({ type: 'crash', x, z, impact, cop, car: !!other, wall: !other });
      this.stats.crashes++;
      if (other && (other.role === 'traffic' || other.role === 'parked')) this.crime(this.stars ? 3 : 8);
      // ramming a police car: once per car every few seconds
      if (cop && other.cop !== 'out' && impact > 5 && this.time - other.crimeT > 4) { other.crimeT = this.time; this.crime(this.stars ? 10 : 28, true); }
    } else this.events.push({ type: 'scrape', x, z });
  }

  /** A lane or parked car is knocked off its lane: it slides on its own now. */
  knock(c: Car): void {
    if (c.mode === 'lane') {
      c.vx = Math.sin(c.h) * c.speed; c.vz = Math.cos(c.h) * c.speed;
      c.turn = null;
    }
    c.mode = 'free';
    c.rest = 0;
    c.hazard = true;
  }

  // ---------------------------------------------------------------- traffic in lanes

  /** Puts a car on a lane: edge, from node, lane, s; sets laneLen. */
  setLane(c: Car, e: Edge, from: number, lane: number, s: number): void {
    c.edge = e.id; c.from = from; c.to = e.a === from ? e.b : e.a; c.lane = Math.min(lane, e.lanes - 1);
    c.laneLen = e.len - this.city.stopBack(e, from) - this.city.stopBack(e, c.to);
    c.s = s; c.turn = null; c.mode = 'lane';
    this.lanePose(c);
  }

  private lanePose(c: Car): void {
    if (c.turn) {
      const t = clamp(c.ts / c.turn.len, 0, 1), u = 1 - t, T = c.turn;
      const x = u * u * T.x0 + 2 * u * t * T.cx + t * t * T.x1, z = u * u * T.z0 + 2 * u * t * T.cz + t * t * T.z1;
      const dx = 2 * u * (T.cx - T.x0) + 2 * t * (T.x1 - T.cx), dz = 2 * u * (T.cz - T.z0) + 2 * t * (T.z1 - T.cz);
      c.x = x; c.z = z; c.h = Math.atan2(dx, dz);
      return;
    }
    const e = this.city.edges[c.edge], a = this.city.nodes[c.from];
    const [dx, dz] = this.city.dir(e, c.from);
    // traffic keeps right: the right of travel is (−dz, dx)
    const rx = -dz, rz = dx;
    const sb = this.city.stopBack(e, c.from), off = this.city.laneOffset(e, c.lane);
    c.x = a.x + dx * (sb + c.s) + rx * off;
    c.z = a.z + dz * (sb + c.s) + rz * off;
    c.h = Math.atan2(dx, dz);
    c.y = 0;
  }

  /** The start point of a lane (edge from node) and its direction. */
  private laneStart(e: Edge, from: number, lane: number): [number, number, number, number] {
    const a = this.city.nodes[from];
    const [dx, dz] = this.city.dir(e, from);
    const sb = this.city.stopBack(e, from), off = this.city.laneOffset(e, Math.min(lane, e.lanes - 1));
    return [a.x + dx * sb - dz * off, a.z + dz * sb + dx * off, dx, dz];
  }

  private laneStep(c: Car, dt: number): void {
    const city = this.city;
    let vDes = c.vmax;
    const decel = 7;
    if (!c.turn) {
      const e = city.edges[c.edge];
      const left = c.laneLen - c.s;
      // the light ahead
      if (!city.green(c.to, e, this.time, left < 7)) vDes = Math.min(vDes, Math.sqrt(2 * decel * Math.max(0, left - 0.5)));
      else if (left < 16) vDes = Math.min(vDes, 8);
    } else vDes = Math.min(vDes, 7.5);
    // whoever is ahead in the lane, and free cars and people in front
    const sh = Math.sin(c.h), ch = Math.cos(c.h);
    let block = Infinity;
    for (const o of this.cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      if (Math.abs(dx) > 26 || Math.abs(dz) > 26) continue;
      const along = dx * sh + dz * ch;
      if (along <= 0 || along > 24) continue;
      const side = Math.abs(dx * ch - dz * sh);
      if (side > 2.1) continue;
      // a car crossing my path in an intersection counts only when close
      const gap = along - (c.len + o.len) / 2;
      if (gap < block) block = gap;
    }
    for (const ped of this.peds) {
      const dx = ped.x - c.x, dz = ped.z - c.z;
      const along = dx * sh + dz * ch;
      if (along <= 0 || along > 12) continue;
      if (Math.abs(dx * ch - dz * sh) > 2) continue;
      block = Math.min(block, along - c.len / 2 - 1);
    }
    if (block < Infinity) {
      vDes = Math.min(vDes, Math.sqrt(2 * decel * Math.max(0, block - 2.5)));
      // stuck behind the player: honk
      const p = this.player;
      const dpx = p.x - c.x, dpz = p.z - c.z;
      if (c.speed < 0.5 && c.honkT <= 0 && dpx * dpx + dpz * dpz < 120 && (dpx * sh + dpz * ch) > 0) {
        c.wait += dt;
        if (c.wait > 1.4) { c.wait = -2 - this.rnd() * 3; c.honkT = 3; this.events.push({ type: 'honk', x: c.x, z: c.z }); }
      }
    } else c.wait = 0;
    c.speed += clamp(vDes - c.speed, -decel * 1.4 * dt, 3.2 * dt);
    if (c.speed < 0) c.speed = 0;
    c.brakeLight = vDes < c.speed - 0.5 || c.speed < 0.3;
    if (c.turn) {
      c.ts += c.speed * dt;
      if (c.ts >= c.turn.len) {
        const T = c.turn;
        const e = city.edges[T.edge];
        this.setLane(c, e, T.from, T.lane, c.ts - T.len);
      }
    } else {
      c.s += c.speed * dt;
      if (c.s >= c.laneLen) this.enterTurn(c);
    }
    this.lanePose(c);
    c.vx = Math.sin(c.h) * c.speed; c.vz = Math.cos(c.h) * c.speed;
  }

  /** At the end of a lane: picks the next street and the curve through the crossing. */
  private enterTurn(c: Car): void {
    const city = this.city;
    const node = city.nodes[c.to];
    const e = city.edges[c.edge];
    let options = node.edges.filter((id) => id !== c.edge);
    if (!options.length) options = [c.edge];
    // buses and the like prefer straight on
    const [dx, dz] = city.dir(e, c.from);
    const straight = options.find((id) => { const [ex, ez] = city.dir(city.edges[id], node.id); return ex === dx && ez === dz; });
    const next = straight !== undefined && (c.len > 6 || this.rnd() < 0.55) ? straight : options[Math.floor(this.rnd() * options.length)];
    const ne = city.edges[next];
    const end = this.laneEnd(c);
    const [sx, sz, ndx, ndz] = this.laneStart(ne, node.id, c.lane);
    // control point where the two lane lines meet (straight on: the middle)
    let cx = (end[0] + sx) / 2, cz = (end[1] + sz) / 2;
    if (ndx !== dx || ndz !== dz) {
      if (dx !== 0) { cx = sx; cz = end[1]; } else { cx = end[0]; cz = sz; }
    }
    const len = Math.hypot(cx - end[0], cz - end[1]) + Math.hypot(sx - cx, sz - cz);
    c.turn = { x0: end[0], z0: end[1], cx, cz, x1: sx, z1: sz, len: Math.max(1, len * 0.92), edge: next, from: node.id, to: -1, lane: Math.min(c.lane, ne.lanes - 1), };
    c.ts = c.s - c.laneLen;
  }

  private laneEnd(c: Car): [number, number] {
    const e = this.city.edges[c.edge], a = this.city.nodes[c.from];
    const [dx, dz] = this.city.dir(e, c.from);
    const sb = this.city.stopBack(e, c.from), off = this.city.laneOffset(e, c.lane);
    return [a.x + dx * (sb + c.laneLen) - dz * off, a.z + dz * (sb + c.laneLen) + dx * off];
  }

  /** Puts a new traffic car on a random lane `min`..`max` metres from the player, out of sight if it can. */
  private spawnTraffic(role: Role, model: string, min: number, max: number): Car | null {
    const city = this.city, p = this.player;
    for (let tries = 0; tries < 12; tries++) {
      const e = city.edges[Math.floor(this.rnd() * city.edges.length)];
      const from = this.rnd() < 0.5 ? e.a : e.b;
      const lane = Math.floor(this.rnd() * e.lanes);
      const len = e.len - city.stopBack(e, from) - city.stopBack(e, from === e.a ? e.b : e.a);
      const s = this.rnd() * len;
      const a = city.nodes[from];
      const [dx, dz] = city.dir(e, from);
      const x = a.x + dx * (city.stopBack(e, from) + s), z = a.z + dz * (city.stopBack(e, from) + s);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < min || d > max) continue;
      // not right in front of the camera
      const ahead = (x - p.x) * Math.sin(p.h) + (z - p.z) * Math.cos(p.h);
      if (d < min + 30 && ahead > 0 && city.los(p.x, p.z, x, z)) continue;
      // room in that lane
      if (this.cars.some((o) => o.mode === 'lane' && o.edge === e.id && o.from === from && o.lane === lane && Math.abs(o.s - s) < 14)) continue;
      const paint = role === 'cop' ? 0xffffff : pick(this.rnd, TRAFFIC_PAINTS);
      const c = this.addCar(role, model, paint);
      c.vmax = (e.lanes > 1 ? 13.5 : 11) * (0.85 + this.rnd() * 0.3) * (c.len > 6 ? 0.8 : 1);
      c.speed = c.vmax * 0.8;
      this.setLane(c, e, from, lane, s);
      if (role === 'cop') { c.cop = 'patrol'; c.hp = c.health = 120; c.mass = 1.25; }
      else c.hp = c.health = 80;
      return c;
    }
    return null;
  }

  /** Keeps the traffic, the patrols and the people round the player; drops the far ones. */
  private populate(first: boolean): void {
    const p = this.player;
    for (const c of [...this.cars]) {
      if (c.role !== 'traffic' && !(c.role === 'cop' && c.cop !== 'pursue' && c.cop !== 'block')) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const far = c.mode === 'free' ? 140 : 210;
      if (d > far) this.removeCar(c);
      else if (c.mode === 'free' && c.role === 'traffic' && c.rest > 6 && d > 70) this.removeCar(c);
    }
    const traffic = this.cars.filter((c) => c.role === 'traffic').length;
    const want = this.tune.traffic;
    for (let k = 0; k < (first ? want : 3) && traffic + k < want; k++) {
      const model = this.rnd() < 0.07 ? pick(this.rnd, TRAFFIC_MODELS.slice(6)) : pick(this.rnd, TRAFFIC_MODELS.slice(0, 6));
      this.spawnTraffic('traffic', model, first ? 15 : 90, 180);
    }
    if (this.police) {
      const patrols = this.cars.filter((c) => c.role === 'cop' && c.cop === 'patrol').length;
      if (patrols < 3) this.spawnTraffic('cop', COP_MODEL, first ? 60 : 120, 200);
    }
    // people
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const ped = this.peds[i];
      if (Math.hypot(ped.x - p.x, ped.z - p.z) > 130) this.peds.splice(i, 1);
    }
    const wantPeds = 46;
    for (let k = 0; k < (first ? wantPeds : 4) && this.peds.length < wantPeds; k++) this.spawnPed(first ? 8 : 80, 125);
  }

  // ---------------------------------------------------------------- people

  /** A point on a block's walk loop: s in metres round it (clockwise from its north-west corner). */
  walkPoint(block: number, s: number): [number, number, number] {
    const w = this.city.blocks[block].walk;
    const W = w.x1 - w.x0, D = w.z1 - w.z0, P = 2 * (W + D);
    s = ((s % P) + P) % P;
    if (s < W) return [w.x0 + s, w.z0, Math.PI / 2];
    if (s < W + D) return [w.x1, w.z0 + s - W, 0];
    if (s < 2 * W + D) return [w.x1 - (s - W - D), w.z1, -Math.PI / 2];
    return [w.x0, w.z1 - (s - 2 * W - D), Math.PI];
  }

  private loopLen(block: number): number { const w = this.city.blocks[block].walk; return 2 * (w.x1 - w.x0 + w.z1 - w.z0); }

  private spawnPed(min: number, max: number): void {
    const p = this.player;
    for (let tries = 0; tries < 10; tries++) {
      const bi = Math.floor(this.rnd() * this.city.blocks.length);
      const b = this.city.blocks[bi];
      if (b.type === 'K' || b.type === 'S') continue;
      const s = this.rnd() * this.loopLen(bi);
      const [x, z, h] = this.walkPoint(bi, s);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < min || d > max) continue;
      const stand = this.rnd() < 0.18;
      const dir = this.rnd() < 0.5 ? 1 : -1;
      this.peds.push({ id: this.nextId++, block: bi, s, dir, speed: 1.2 + this.rnd() * 0.6, x, z, h: dir > 0 ? h : h + Math.PI, model: Math.floor(this.rnd() * 2), shirt: Math.floor(this.rnd() * 8), state: stand ? 'stand' : 'walk', t: this.rnd() * 3, tx: 0, tz: 0, vx: 0, vz: 0, frame: 0, idle: Math.floor(this.rnd() * 3), nextBlock: -1, nextS: 0 });
      return;
    }
  }

  /** People near (x, z) run off (the horn, a crash). */
  scarePeds(x: number, z: number, r: number): void {
    for (const ped of this.peds) {
      if (ped.state === 'dive' || ped.state === 'cross') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < r) { ped.state = 'run'; ped.t = 2 + this.rnd() * 2; }
    }
  }

  private dive(ped: Ped, c: Car, byPlayer: boolean): void {
    // jump to the side away from the car's path
    const sh = Math.sin(c.h), ch = Math.cos(c.h);
    const side = (ped.x - c.x) * ch - (ped.z - c.z) * sh >= 0 ? 1 : -1;
    ped.vx = ch * side * 6.5; ped.vz = -sh * side * 6.5;
    ped.state = 'dive'; ped.t = 0.6;
    ped.h = Math.atan2(ped.vx, ped.vz);
    if (byPlayer) {
      this.events.push({ type: 'dive', x: ped.x, z: ped.z });
      this.stats.dives++;
      this.crime(6);
    }
  }

  private pedStep(dt: number): void {
    const city = this.city;
    for (const ped of this.peds) {
      ped.t -= dt;
      ped.frame += dt;
      if (ped.state === 'dive') {
        ped.x += ped.vx * dt; ped.z += ped.vz * dt;
        ped.vx *= 1 - Math.min(1, 3 * dt); ped.vz *= 1 - Math.min(1, 3 * dt);
        if (ped.t <= 0) { ped.state = 'run'; ped.t = 1.5; this.rejoin(ped); }
        continue;
      }
      // a car heading at me: dive
      {
        let dived = false;
        for (const c of this.cars) {
          if (c.mode !== 'free' && c !== this.player) continue;
          const sp = c.speedAbs;
          if (sp < 5) continue;
          const dx = ped.x - c.x, dz = ped.z - c.z;
          if (dx * dx + dz * dz > 400) continue;
          const vx = c.vx / sp, vz = c.vz / sp;
          const along = dx * vx + dz * vz;
          if (along < 0 || along > sp * 0.75 + 2) continue;
          if (Math.abs(dx * vz - dz * vx) < c.wid * 0.5 + 1.1) { this.dive(ped, c, c === this.player); dived = true; break; }
        }
        if (dived) continue;
      }
      if (ped.state === 'cross') {
        const dx = ped.tx - ped.x, dz = ped.tz - ped.z, d = Math.hypot(dx, dz);
        const v = ped.speed * 1.3;
        if (d < v * dt + 0.05) {
          ped.block = ped.nextBlock; ped.s = ped.nextS; ped.state = 'walk';
          const [x, z] = this.walkPoint(ped.block, ped.s);
          ped.x = x; ped.z = z;
        } else { ped.x += dx / d * v * dt; ped.z += dz / d * v * dt; ped.h = Math.atan2(dx, dz); }
        continue;
      }
      if (ped.state === 'stand') {
        if (ped.t < -6 - (ped.id % 5)) { ped.state = 'walk'; ped.t = 0; }
        continue;
      }
      const run = ped.state === 'run';
      if (run && ped.t <= 0) ped.state = 'walk';
      const v = ped.speed * (run ? 2.6 : 1);
      ped.s += ped.dir * v * dt;
      const [x, z, h] = this.walkPoint(ped.block, ped.s);
      ped.x = x; ped.z = z; ped.h = ped.dir > 0 ? h : h + Math.PI;
      // at a corner, sometimes cross to the next block
      if (!run && ped.t < -4) {
        ped.t = 0;
        const b = city.blocks[ped.block];
        const corners: [number, number, number, number][] = [[b.walk.x0, b.walk.z0, -1, -1], [b.walk.x1, b.walk.z0, 1, -1], [b.walk.x1, b.walk.z1, 1, 1], [b.walk.x0, b.walk.z1, -1, 1]];
        for (const [cx, cz, sx, sz] of corners) {
          if (Math.hypot(cx - ped.x, cz - ped.z) > 1.2 || this.rnd() < 0.5) continue;
          // across the street along x or z
          const alongX = this.rnd() < 0.5;
          const nbx = b.bx + (alongX ? sx : 0), nbz = b.bz + (alongX ? 0 : sz);
          if (nbx < 0 || nbz < 0 || nbx >= 8 || nbz >= 8) break;
          const nb = nbz * 8 + nbx, w2 = city.blocks[nb].walk;
          const tx = alongX ? (sx > 0 ? w2.x0 : w2.x1) : cx, tz = alongX ? cz : (sz > 0 ? w2.z0 : w2.z1);
          // wait for the cars: only when nobody is coming fast
          if (this.cars.some((c) => c.speedAbs > 3 && segDist(cx, cz, tx, tz, c.x, c.z) < 12)) break;
          ped.state = 'cross'; ped.tx = tx; ped.tz = tz; ped.nextBlock = nb;
          // s of the target corner on the new loop
          const W = w2.x1 - w2.x0, D = w2.z1 - w2.z0;
          const tsx = tx === w2.x0 ? (tz === w2.z0 ? 0 : 2 * W + D) : (tz === w2.z0 ? W : W + D);
          ped.nextS = tsx;
          break;
        }
      }
    }
  }

  /** After a dive: back onto the nearest walk loop point. */
  private rejoin(ped: Ped): void {
    const b = this.city.blockAt(ped.x, ped.z);
    const bi = b ? this.city.blocks.indexOf(b) : ped.block;
    const w = this.city.blocks[bi].walk;
    const W = w.x1 - w.x0, D = w.z1 - w.z0;
    const cx = clamp(ped.x, w.x0, w.x1), cz = clamp(ped.z, w.z0, w.z1);
    const dN = Math.abs(cz - w.z0), dS = Math.abs(cz - w.z1), dW = Math.abs(cx - w.x0), dE = Math.abs(cx - w.x1);
    const m = Math.min(dN, dS, dW, dE);
    ped.block = bi;
    ped.s = m === dN ? cx - w.x0 : m === dE ? W + (cz - w.z0) : m === dS ? W + D + (w.x1 - cx) : 2 * W + D + (w.z1 - cz);
    const [x, z] = this.walkPoint(bi, ped.s);
    // ease back over a few steps would be nicer; the dive ends close to the loop anyway
    ped.x = x; ped.z = z;
  }

  // ---------------------------------------------------------------- props

  private propStep(dt: number): void {
    const p = this.player;
    for (const pr of this.props) {
      if (pr.hidden) {
        if (Math.hypot(pr.x0 - p.x, pr.z0 - p.z) > 70 && this.time - pr.down > 25) { pr.hidden = false; pr.x = pr.x0; pr.z = pr.z0; pr.y = 0; pr.rot = pr.rot0; pr.tilt = 0; pr.down = 0; }
        continue;
      }
      if (pr.down) {
        // flying or lying
        if (pr.y > 0 || pr.vy > 0) {
          pr.vy -= 18 * dt;
          pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
          pr.rot += pr.spin * dt; pr.tilt = Math.min(Math.PI / 2, pr.tilt + dt * 6);
          if (pr.y <= 0) { pr.y = 0; pr.vy = 0; pr.vx *= 0.3; pr.vz *= 0.3; }
        } else { pr.x += pr.vx * dt; pr.z += pr.vz * dt; pr.vx *= 0.9; pr.vz *= 0.9; }
        if (this.time - pr.down > 8 && Math.hypot(pr.x - p.x, pr.z - p.z) > 40) pr.hidden = true;
        continue;
      }
      // hit by a free car
      for (const c of this.cars) {
        if (c.mode !== 'free' && c !== p) continue;
        const dx = pr.x - c.x, dz = pr.z - c.z;
        if (dx * dx + dz * dz > 9) continue;
        let hit = false;
        const cc = circles(c);
        for (let k = 0; k < 9; k += 3) if (Math.hypot(pr.x - cc[k], pr.z - cc[k + 1]) < cc[k + 2] + 0.4) hit = true;
        if (!hit) continue;
        const sp = c.speedAbs;
        if (sp < 1.5) continue;
        pr.down = this.time;
        pr.vx = c.vx * 1.15 + (this.rnd() - 0.5) * 3; pr.vz = c.vz * 1.15 + (this.rnd() - 0.5) * 3; pr.vy = 3 + sp * 0.25;
        pr.spin = (this.rnd() - 0.5) * 12;
        const heavy = pr.kind === 'hydrant' || pr.kind === 'bench' || pr.kind === 'barrier';
        c.vx *= heavy ? 0.82 : 0.95; c.vz *= heavy ? 0.82 : 0.95;
        if (c === p) {
          this.events.push({ type: 'prop', kind: pr.kind, x: pr.x, z: pr.z });
          this.stats.props++;
          this.crime(2);
          if (heavy) this.damage(p, 2, false);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- the police

  /** A crime: felony points if a cop sees it (or `always`). */
  crime(points: number, always = false): void {
    if (!this.police) return;
    if (!this.seen && !always) return;
    // a new star holds for a while before the next can come
    if (this.stars > 0 && this.time < this.starLock) return;
    this.felony += points * this.tune.heatGain;
    if (always && !this.pursuit) this.seenT = this.time;
    this.updateStars();
  }

  /** Sets the felony so that the stars are at least n (getaway jobs). */
  forceStars(n: number): void {
    const need = n > 0 ? STARS[n - 1] + 1 : 0;
    if (this.felony < need) this.felony = need;
    this.updateStars();
    if (n > 0) { this.seen = true; this.seenT = this.time; this.copLastX = this.copTarget.x; this.copLastZ = this.copTarget.z; this.startPursuit(); }
  }

  copLastX = 0;
  private starLock = 0;
  copLastZ = 0;

  private updateStars(): void {
    let s = 0;
    for (const t of STARS) if (this.felony >= t) s++;
    s = clamp(Math.max(s, this.minStars), 0, this.maxStars);
    if (s !== this.stars) {
      const prev = this.stars;
      this.stars = s;
      if (s > prev) { this.events.push({ type: 'stars', stars: s, prev }); this.starLock = this.time + 12; }
      this.stats.maxStars = Math.max(this.stats.maxStars, s);
      if (s > 0 && prev === 0) this.startPursuit();
    }
  }

  private startPursuit(): void {
    if (this.pursuit) return;
    this.pursuit = true;
    this.searching = false;
    this.events.push({ type: 'pursuit' });
    // every patrol that saw it joins
    for (const c of this.cars) if (c.role === 'cop' && c.cop === 'patrol' && Math.hypot(c.x - this.copTarget.x, c.z - this.copTarget.z) < 160) this.toPursuit(c);
  }

  toPursuit(c: Car): void {
    if (c.mode === 'lane') this.knock(c);
    c.hazard = false;
    c.cop = 'pursue';
    c.siren = true;
    c.hand = { accel: 9.5 * this.tune.copAccel * (1 + 0.04 * this.stars), top: 34 * this.tune.copTop * (1 + 0.025 * this.stars), grip: 1.04, mass: 1.25, hp: 120, nitro: 0, armour: 0 };
  }

  private policeStep(dt: number): void {
    if (!this.police) return;
    const tgt = this.copTarget, p = this.player;
    // who sees the player (5 times a second)
    this.witnessT -= dt;
    if (this.witnessT <= 0) {
      this.witnessT = 0.2;
      let seen = false;
      for (const c of this.cars) {
        if (c.role !== 'cop' || c.disabled || c.cop === 'out') continue;
        const dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.hypot(dx, dz);
        if (d > 75) continue;
        const ahead = (dx * Math.sin(c.h) + dz * Math.cos(c.h)) / Math.max(d, 0.01);
        const range = c.cop === 'pursue' || c.cop === 'search' ? 75 : ahead > 0.3 ? 60 : 22;
        if (d > range) continue;
        if (!this.city.los(c.x, c.z, tgt.x, tgt.z)) continue;
        seen = true;
        break;
      }
      this.seen = seen;
      if (seen) { this.seenT = this.time; this.copLastX = tgt.x; this.copLastZ = tgt.z; }
    }
    // crimes seen by a patrol (in a chase only the big ones count: the chase itself raises the heat)
    const sp = p.speedAbs;
    if (this.seen && this.stars === 0) {
      if (sp > 26) this.crime((sp - 26) * 0.35 * dt * 10);
      if (this.city.offRoad(p.x, p.z) && sp > 6) this.crime(5 * dt);
    }
    if (this.stars > 0) {
      // the chase goes on: stars creep up while they see you
      if (this.seen) this.crime(0.55 * dt, true);
      const lost = this.time - this.seenT;
      if (lost > 3.2 && !this.searching) {
        this.searching = true;
        this.searchX = this.copLastX; this.searchZ = this.copLastZ;
        this.searchTotal = this.searchLeft = (7 + 3.2 * this.stars) * this.tune.search;
        this.events.push({ type: 'search' });
      }
      if (this.searching) {
        if (this.seen) { this.searching = false; this.events.push({ type: 'pursuit' }); }
        else {
          this.searchLeft -= dt;
          this.searchR = 35 + 14 * this.stars + (this.searchTotal - this.searchLeft) * 3;
          if (this.searchLeft <= 0) this.loseThem();
        }
      }
    }
    // units
    const want = this.stars > 0 ? this.tune.units[this.stars] : 0;
    const units = this.cars.filter((c) => c.role === 'cop' && (c.cop === 'pursue' || c.cop === 'search') && !c.disabled);
    if (this.stars > 0 && units.length < want) {
      this.spawnT2 -= dt;
      if (this.spawnT2 <= 0) {
        this.spawnT2 = 3.5 - this.stars * 0.4;
        const c = this.spawnTraffic('cop', COP_MODEL, 85, 150);
        if (c) this.toPursuit(c);
      }
    }
    if (this.stars > 0) {
      this.roadblockT -= dt;
      this.spikeT -= dt;
      if (this.stars >= this.tune.roadblockAt && this.roadblockT <= 0 && this.seen) { this.roadblockT = 22; this.roadblock(); }
      if (this.stars >= this.tune.spikesAt && this.spikeT <= 0 && this.seen) { this.spikeT = 26; this.spikeStrip(); }
    }
    // busted: stopped with a cop on you
    if (this.stars > 0 && !this.busted && !this.wrecked && tgt === p) {
      let near = 0;
      for (const c of this.cars) if (c.role === 'cop' && !c.disabled && c.cop !== 'patrol' && c.cop !== 'out' && Math.hypot(c.x - p.x, c.z - p.z) < 8.5 && c.speedAbs < 8) near++;
      if (near > 0 && sp < 3) this.bust += dt * (near >= 2 ? 1.5 : 1);
      else this.bust = Math.max(0, this.bust - dt * 1.6);
      if (this.bust >= this.tune.bustTime) { this.busted = true; this.events.push({ type: 'busted' }); }
    }
  }

  private spawnT2 = 0;

  /** The search ran out: the heat is gone. */
  loseThem(): void {
    this.felony = 0;
    this.minStars = 0;
    this.searching = false;
    this.pursuit = false;
    this.bust = 0;
    const prev = this.stars;
    this.stars = 0;
    if (prev > 0) this.events.push({ type: 'lost' });
    for (const c of this.cars) if (c.role === 'cop' && c.cop !== 'out') { c.cop = 'search'; c.siren = false; c.aiT = 0; }
    // the units drive off: patrols again soon (removed when far)
    for (const c of this.cars) if (c.role === 'cop' && c.cop === 'search') c.cop = 'patrol';
  }

  /** Clears the heat at once (the spray shop, a continue). */
  coolDown(): void { this.loseThem(); for (const c of [...this.cars]) if (c.role === 'cop' && c.mode === 'free' && Math.hypot(c.x - this.player.x, c.z - this.player.z) > 30) this.removeCar(c); }

  /** Two cop cars across the road the player is heading for. */
  private roadblock(): void {
    const p = this.player, city = this.city;
    const sp = Math.max(8, p.speedAbs);
    const ax = p.x + p.vx / sp * 110, az = p.z + p.vz / sp * 110;
    const n = city.nearestNode(ax, az);
    if (Math.hypot(n.x - p.x, n.z - p.z) < 55) return;
    // the street into that node from the player's side
    const eid = n.edges.find((id) => {
      const e = city.edges[id], o = city.nodes[e.a === n.id ? e.b : e.a];
      return (o.x - n.x) * (p.x - n.x) + (o.z - n.z) * (p.z - n.z) > 0;
    });
    if (eid === undefined) return;
    const e = city.edges[eid];
    const [dx, dz] = city.dir(e, n.id);
    const back = city.stopBack(e, n.id) + 4;
    const hw = halfWidth(e.line);
    for (const k of [-1, 1]) {
      const c = this.addCar('cop', COP_MODEL, 0xffffff);
      c.cop = 'block'; c.siren = true; c.mode = 'parked'; c.hp = c.health = 140; c.mass = 1.6;
      // across the street, one each side of the middle
      const x = n.x + dx * back + dz * k * hw * 0.45, z = n.z + dz * back - dx * k * hw * 0.45;
      this.place(c, x, z, Math.atan2(dz, -dx) + (k > 0 ? 0.25 : -0.25));
    }
    this.events.push({ type: 'roadblock', x: n.x + dx * back, z: n.z + dz * back });
  }

  private spikeStrip(): void {
    const p = this.player, city = this.city;
    const sp = Math.max(8, p.speedAbs);
    const ax = p.x + p.vx / sp * 75, az = p.z + p.vz / sp * 75;
    const e = city.edgeNear(ax, az);
    if (!e) return;
    const a = city.nodes[e.a];
    const x = e.horizontal ? ax : a.x, z = e.horizontal ? a.z : az;
    if (!city.los(p.x, p.z, x, z)) return;
    this.spikes.push({ x, z, rot: e.horizontal ? 0 : Math.PI / 2, len: halfWidth(e.line) * 2 - 1, t: 0 });
    this.events.push({ type: 'spikes', x, z });
  }

  private spikeStep(dt: number): void {
    const p = this.player;
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      if (s.t > 30 || Math.hypot(s.x - p.x, s.z - p.z) > 200) { this.spikes.splice(i, 1); continue; }
      // across a street: a thin box
      const along = s.rot === 0 ? Math.abs(p.z - s.z) : Math.abs(p.x - s.x);
      const across = s.rot === 0 ? Math.abs(p.x - s.x) : Math.abs(p.z - s.z);
      if (s.rot === 0 ? (along < s.len / 2 && across < 1.4) : (along < s.len / 2 && across < 1.4)) {
        // (rot 0: the strip lies across a horizontal street, along z)
      }
      const hit = s.rot === 0 ? Math.abs(p.x - s.x) < 1.6 && Math.abs(p.z - s.z) < s.len / 2 : Math.abs(p.z - s.z) < 1.6 && Math.abs(p.x - s.x) < s.len / 2;
      if (hit && p.spikesT <= 0 && !p.airborne) { p.spikesT = 9; this.events.push({ type: 'popped' }); this.damage(p, 6, false); }
    }
  }

  /** Ran a red light under a cop's eyes. */
  private redLights(): void {
    const p = this.player, city = this.city;
    const n = city.nearestNode(p.x, p.z);
    const inside = Math.abs(p.x - n.x) < halfWidth(n.i) + 0.5 && Math.abs(p.z - n.z) < halfWidth(n.j) + 0.5;
    if (inside && !this.redCheck.inside && n.light && p.speedAbs > 6) {
      // which way: the edge we came from
      const horizontal = Math.abs(p.vx) > Math.abs(p.vz);
      const st = city.lightState(n.id, this.time);
      if ((horizontal ? st.ew : st.ns) === 0) {
        this.events.push({ type: 'redLight' });
        this.crime(12);
      }
    }
    this.redCheck.inside = inside;
  }

  // ---------------------------------------------------------------- AI drivers (free mode)

  private aiStep(c: Car, dt: number): void {
    if (c.role === 'traffic' || c.role === 'parked' || c.disabled || (c.role === 'cop' && (c.cop === 'out' || c.cop === 'block' || c.cop === 'patrol'))) {
      // knocked cars roll to a stop
      drive(this, c, { ...NO_INPUT, hold: true }, dt);
      if (c.speedAbs < 0.3) c.rest += dt; else c.rest = 0;
      if (c.role === 'parked' && c.rest > 1) { c.mode = 'parked'; c.vx = c.vz = c.w = 0; }
      if (c.role === 'cop' && c.cop === 'block' && c.rest > 0.5) { c.mode = 'parked'; c.vx = c.vz = c.w = 0; }
      // a patrol knocked about goes back to work
      if (c.role === 'cop' && c.cop === 'patrol' && c.rest > 2) this.toPursuit(c);
      return;
    }
    if (c.role === 'cop') this.copDrive(c, dt);
    else if (c.waitFor > 0) {
      // a story car waiting for the player to turn up
      drive(this, c, { ...NO_INPUT, hold: true }, dt);
      if (Math.hypot(this.player.x - c.x, this.player.z - c.z) < c.waitFor) c.waitFor = 0;
    } else if (c.ai) c.ai(this, c, dt);
  }

  private copDrive(c: Car, dt: number): void {
    const tgt = this.copTarget;
    let tx: number, tz: number, vDes: number;
    if (c.cop === 'pursue' && this.stars > 0 && !this.searching) {
      const d = Math.hypot(tgt.x - c.x, tgt.z - c.z);
      // lead the target a little; ram from three stars, below that pull alongside to box it in
      const lead = Math.min(1.2, d / 30);
      tx = tgt.x + tgt.vx * lead; tz = tgt.z + tgt.vz * lead;
      if (this.stars < 3 && d < 14) {
        const side = ((c.x - tgt.x) * Math.cos(tgt.h) - (c.z - tgt.z) * Math.sin(tgt.h)) >= 0 ? 1 : -1;
        tx += Math.cos(tgt.h) * 3 * side; tz -= Math.sin(tgt.h) * 3 * side;
        vDes = tgt.speedAbs + (d > 6 ? 3 : 0);
      } else vDes = 60;
      if (d > 45 || !this.city.los(c.x, c.z, tgt.x, tgt.z)) [tx, tz] = this.pathAim(c, tgt.x, tgt.z, dt);
    } else if (this.stars > 0) {
      // searching: drive round the area of the last sighting
      c.aiT -= dt;
      if (c.aiT <= 0 || Math.hypot(c.searchX - c.x, c.searchZ - c.z) < 12) {
        c.aiT = 6;
        const a = this.rnd() * Math.PI * 2, r = this.rnd() * this.searchR;
        c.searchX = clamp(this.searchX + Math.cos(a) * r, 0, SIZE); c.searchZ = clamp(this.searchZ + Math.sin(a) * r, 0, SIZE);
      }
      [tx, tz] = this.pathAim(c, c.searchX, c.searchZ, dt);
      vDes = 18;
      c.cop = 'search';
    } else {
      // heat gone: drive away and leave
      c.siren = false;
      [tx, tz] = [c.x + Math.sin(c.h) * 20, c.z + Math.cos(c.h) * 20];
      vDes = 10;
    }
    drive(this, c, this.steerTo(c, tx, tz, vDes, dt), dt);
  }

  /** Aim point on a road route towards (x, z) (recomputed now and then). */
  pathAim(c: Car, x: number, z: number, dt: number): [number, number] {
    c.pathT -= dt;
    if (c.pathT <= 0 || !c.path.length) {
      c.pathT = 1.2;
      c.path = this.city.route(c.x, c.z, x, z).pts;
    }
    // a point along the route ahead of the car (the route starts where the car was)
    const a = along(c.path, 8 + c.speedAbs * 0.3 + Math.hypot(c.path[0] - c.x, c.path[1] - c.z));
    return [a.x, a.z];
  }

  /** Steering, gas and brake to drive at (tx, tz) at up to vDes; backs out when stuck. */
  steerTo(c: Car, tx: number, tz: number, vDes: number, dt: number): DriveInput {
    const want = Math.atan2(tx - c.x, tz - c.z);
    let err = want - c.h;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const sp = c.fwd;
    if (c.revT > 0) {
      c.revT -= dt;
      return { steer: clamp(err * 2, -1, 1), gas: 0, brake: 1, handbrake: false, nitro: false, horn: false };
    }
    if (Math.abs(sp) < 1.2 && c.speedAbs < 1.5) c.stuckT += dt; else c.stuckT = Math.max(0, c.stuckT - dt);
    if (c.stuckT > 1.1) { c.stuckT = 0; c.revT = 0.9; }
    const steer = clamp(-err * 2.4, -1, 1);
    const sharp = Math.abs(err);
    const vTurn = sharp > 1.2 ? 8 : sharp > 0.6 ? 14 : 99;
    const v = Math.min(vDes, vTurn);
    return { steer, gas: sp < v ? 1 : 0, brake: sp > v + 4 ? 1 : 0, handbrake: sharp > 1.4 && sp > 12, nitro: false, horn: false };
  }

  // ---------------------------------------------------------------- jobs' helpers

  /** A car of the story (a target, an escort) at a spot, driven by `ai`. */
  addActor(role: Role, model: string, paint: number, spot: Spot, ai: (sim: Sim, c: Car, dt: number) => void, hand?: Partial<Handling>): Car {
    const c = this.addCar(role, model, paint);
    c.mode = 'free';
    c.hand = { ...DEFAULT_HAND, top: 26, accel: 8, ...hand };
    c.hp = c.health = hand?.hp ?? 100;
    c.ai = ai;
    this.place(c, spot.x, spot.z, spot.h);
    return c;
  }

  /** Drives a car with the same physics as the player's (story cars). */
  driveCar(c: Car, inp: DriveInput, dt: number): void { drive(this, c, inp, dt); }

  /** Is the player stopped in the marker at (x, z)? */
  inMarker(x: number, z: number, r = 5.5, stop = true): boolean {
    const p = this.player;
    return Math.hypot(p.x - x, p.z - z) < r && (!stop || p.speedAbs < 4.5);
  }
}

function pick<T>(rnd: () => number, list: T[]): T { return list[Math.floor(rnd() * list.length)]; }

function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { segBox, PITCH, SIDEWALK };
