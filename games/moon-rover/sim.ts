// Moon Rover: the simulation, headless and deterministic (60 Hz). It owns the rover's low-gravity
// driving (motor, grip, slides on dust and ice, ramps and crater lips that throw it into long floaty
// jumps, air control, landings judged by angle: perfect, good, rough or a flip), the battery and its
// charging pads, the mission (crystal samples, stranded astronauts who wave, run over and ride along,
// supply drops at outposts, the return to the base pad), checkpoints and the tow, the powers, and the
// hazards: meteor showers with warning rings that leave fresh craters, turrets firing slow bolts,
// monorail trains on a schedule, force-field gates, solar storms, and the set-pieces (the rogue
// miner and its generators; the escape to the rocket). The view and the HUD only read it.
import { DT, TILE, STEP, GRAV, ROVER, AIR, LAND, BATTERY, TUNING, POWER, POWER_TIME, RANK, SCORE, CREDITS, type Tuning, type Ranks, type PowerId } from './defs';
import { Terrain, ABYSS } from './terrain';
import type { Level, Obstacle, Spot, Track } from './levels';

export interface Input {
  /** -1 (left) .. 1 (right). */
  steer: number;
  gas: boolean;
  brake: boolean;
  /** POWER pressed this step. */
  power: boolean;
}
export const NO_INPUT: Input = { steer: 0, gas: false, brake: false, power: false };

export type RoverState = 'drive' | 'flip' | 'fall' | 'empty' | 'tow' | 'clear' | 'dead';
export type LandQuality = 'perfect' | 'good' | 'rough';

export type SimEvent =
  | { e: 'crystal'; x: number; y: number; z: number; magnet: boolean }
  | { e: 'wave'; i: number }
  | { e: 'board'; i: number; x: number; z: number }
  | { e: 'rescue'; n: number; x: number; z: number }
  | { e: 'deliver'; i: number; x: number; z: number; left: number }
  | { e: 'seatsFull' }
  | { e: 'needCargo' }
  | { e: 'needGenerators' }
  | { e: 'charge'; x: number; z: number }
  | { e: 'charged' }
  | { e: 'repair' }
  | { e: 'checkpoint'; x: number; z: number }
  | { e: 'takeoff'; speed: number }
  | { e: 'land'; q: LandQuality; impact: number; air: number; x: number; z: number }
  | { e: 'bump'; speed: number; x: number; z: number }
  | { e: 'flip'; x: number; z: number }
  | { e: 'fall'; x: number; z: number }
  | { e: 'empty' }
  | { e: 'lowBattery' }
  | { e: 'tow' }
  | { e: 'respawn'; x: number; z: number }
  | { e: 'hurt'; by: string; x: number; z: number }
  | { e: 'shielded'; x: number; z: number }
  | { e: 'meteorWarn'; i: number; x: number; z: number }
  | { e: 'meteor'; x: number; y: number; z: number; crater: boolean }
  | { e: 'fire'; i: number; x: number; y: number; z: number }
  | { e: 'charging'; i: number }
  | { e: 'trainNear'; i: number }
  | { e: 'zap'; x: number; z: number }
  | { e: 'pickup'; id: PowerId; x: number; z: number }
  | { e: 'use'; id: PowerId }
  | { e: 'powerEnd'; id: PowerId }
  | { e: 'emp'; x: number; z: number }
  | { e: 'alien'; x: number; z: number }
  | { e: 'generator'; i: number; left: number; x: number; z: number }
  | { e: 'minerOff'; x: number; z: number }
  | { e: 'minerHit'; x: number; z: number }
  | { e: 'stormStart' }
  | { e: 'stormEnd' }
  | { e: 'timeLow' }
  | { e: 'timeUp' }
  | { e: 'clear'; x: number; z: number }
  | { e: 'die' };

export interface Rover {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number; roll: number; pitchV: number; rollV: number;
  /** Forward speed (m/s, negative in reverse) and the ground's slope under the wheels. */
  speed: number; gPitch: number; gRoll: number;
  air: boolean; airT: number;
  state: RoverState; stateT: number;
  /** Hearts in halves. */
  hp: number; max: number;
  battery: number; bmax: number;
  seats: number; aboard: number; cargo: number;
  power: PowerId | null;
  active: Record<PowerId, number>;
  /** Seconds of safety after a hit or a tow. */
  inv: number;
  throttle: number; steer: number;
  surf: string;
  charging: boolean;
  /** The suspension's last jolt (the view bounces the body). */
  jolt: number;
}

export interface Astronaut { x: number; z: number; y: number; yaw: number; state: 'wait' | 'wave' | 'run' | 'aboard' | 'saved'; t: number; seat: number; home: Spot; speed: number }
export interface Crystal { x: number; y: number; z: number; taken: boolean; pull: number }
export interface Meteor { x: number; z: number; y: number; t: number; warn: number; big: boolean }
export interface Bolt { x: number; y: number; z: number; vx: number; vz: number; life: number }
export interface Turret { x: number; y: number; z: number; yaw: number; double: boolean; pattern: 'aim' | 'sweep'; cd: number; charge: number; frozen: number }
/** The rogue miner: it hunts the rover (chase), winds up when close (a red flash), charges in a straight line, then cools off. */
export interface Miner { x: number; y: number; z: number; yaw: number; speed: number; frozen: number; off: boolean; pause: number; awake: boolean; sink: number; mode: 'chase' | 'wind' | 'charge' | 'cool'; modeT: number }

export interface Stats { crystals: number; rescued: number; delivered: number; alien: boolean; time: number; flips: number; hits: number; perfect: number; credits: number; bestAir: number; generators: number }

/** Train cars and their spacing (m). */
export const TRAIN = { cars: 4, car: 4.4, width: 2.6, height: 3.4 };

const tv = { x: 0, z: 0 };

export class Sim {
  readonly c: Level;
  readonly ter: Terrain;
  readonly tune: Tuning;
  readonly ranks: Ranks;
  readonly easy: boolean;
  rover: Rover;
  astronauts: Astronaut[];
  crystals: Crystal[];
  powers: { x: number; y: number; z: number; id: PowerId; taken: boolean }[];
  meteors: Meteor[] = [];
  bolts: Bolt[] = [];
  turrets: Turret[];
  generators: { x: number; y: number; z: number; off: boolean }[];
  miner: Miner | null;
  delivered: boolean[];
  alienFound = false;
  checkpoint: { x: number; z: number; yaw: number };
  stats: Stats = { crystals: 0, rescued: 0, delivered: 0, alien: false, time: 0, flips: 0, hits: 0, perfect: 0, credits: 0, bestAir: 0, generators: 0 };
  points = 0;
  events: SimEvent[] = [];
  clock = 0;
  /** Seconds left in an escape set-piece (-1 elsewhere). */
  countdown = -1;
  storm = false;
  stormK = 0;
  /** No harm and no battery use (the menu backdrop, store art, tests). */
  god = false;
  /** The rocket has launched (escape won). */
  launched = false;
  private meteorT = 0;
  private meteorI = 0;
  private lowWarned = false;
  private seatsWarnT = 0;
  private needWarnT = 0;
  private trainWarn: number[] = [];
  private rngS: number;
  private wasCharging = false;
  private onPadT = 0;
  private repairT = 0;

  constructor(level: Level, ranks: Ranks, easy: boolean) {
    this.c = level;
    this.ter = new Terrain(level);
    this.tune = TUNING[easy ? 'easy' : 'normal'];
    this.ranks = ranks;
    this.easy = easy;
    this.rngS = level.n * 7919 + 13;
    const s = level.start;
    const bmax = this.tune.battery * RANK.battery[ranks.battery];
    this.rover = {
      x: s.x, y: 0, z: s.z, vx: 0, vy: 0, vz: 0, yaw: s.yaw, pitch: 0, roll: 0, pitchV: 0, rollV: 0, speed: 0, gPitch: 0, gRoll: 0,
      air: false, airT: 0, state: 'drive', stateT: 0, hp: this.tune.hearts * 2, max: this.tune.hearts * 2,
      battery: bmax, bmax, seats: RANK.seats[ranks.seats], aboard: 0, cargo: level.outposts.length,
      power: null, active: { boost: 0, shield: 0, magnet: 0, hover: 0, emp: 0 }, inv: 0, throttle: 0, steer: 0, surf: 'road', charging: false, jolt: 0,
    };
    this.rover.y = this.groundUnder(s.x, s.z, s.yaw).h;
    this.astronauts = level.astronauts.map((a, i) => ({ x: a.x, z: a.z, y: a.y, yaw: (i * 2.1) % (Math.PI * 2), state: 'wait', t: i * 0.7, seat: -1, home: a, speed: 0 }));
    this.crystals = level.crystals.map((c) => ({ x: c.x, y: c.y, z: c.z, taken: false, pull: 0 }));
    this.powers = level.powers.map((p) => ({ x: p.x, y: p.y, z: p.z, id: p.id, taken: false }));
    this.turrets = level.turrets.map((t, i) => ({ x: t.x, y: t.y, z: t.z, yaw: t.yaw, double: t.double, pattern: t.pattern, cd: 2 + i * 0.9, charge: 0, frozen: 0 }));
    this.generators = level.generators.map((g) => ({ x: g.x, y: g.y, z: g.z, off: false }));
    this.miner = level.setpiece === 'miner' && level.miner ? { x: level.miner.x, y: level.miner.y + 2.2, z: level.miner.z, yaw: 0, speed: 0, frozen: 0, off: false, pause: 0, awake: false, sink: 0, mode: 'chase', modeT: 0 } : null;
    this.delivered = level.outposts.map(() => false);
    this.checkpoint = { x: s.x, z: s.z, yaw: s.yaw };
    this.countdown = level.setpiece === 'escape' ? level.countdown + this.tune.extraTime : -1;
    this.meteorT = level.meteors ? level.meteors.first : 1e9;
    this.trainWarn = level.tracks.map(() => -99);
  }

  // ---------------------------------------------------------------- queries

  private rand(): number { this.rngS = (this.rngS * 16807) % 2147483647; return this.rngS / 2147483647; }

  /** The ground under the four wheels: height, slope along and across the rover. */
  groundUnder(x: number, z: number, yaw: number): { h: number; pitch: number; roll: number; center: number } {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const L = ROVER.halfL, T = ROVER.halfT;
    const center = this.ter.ground(x, z);
    // a wheel against a cliff (not on top of it) reads the ground under the middle
    const clampH = (h: number) => (h > center + 1.2 ? center : Math.max(center - 2, h));
    const g = (a: number, b: number) => clampH(this.ter.ground(x + fx * a + rx * b, z + fz * a + rz * b));
    const fl = g(L, -T), fr = g(L, T), bl = g(-L, -T), br = g(-L, T);
    const front = (fl + fr) / 2, back = (bl + br) / 2, left = (fl + bl) / 2, right = (fr + br) / 2;
    const h = center <= ABYSS + 1 ? center : Math.max((fl + fr + bl + br) / 4, center - 0.6);
    return { h, pitch: Math.atan2(front - back, 2 * L), roll: Math.atan2(right - left, 2 * T), center };
  }

  /** The terrain's height without craters (cliff faces are walls; crater rims never are). */
  private wallH(x: number, z: number): number {
    const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
    const t = this.ter.tile(c, r);
    if (!t) return 60;
    return this.ter.base(t, x, z, c, r);
  }

  private blocked(x: number, z: number, ref: number): boolean {
    const R = ROVER.radius;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.wallH(x + Math.cos(a) * R, z + Math.sin(a) * R) > ref) return true;
    }
    return false;
  }

  /** The current power's duration with the Lasting Powers rank. */
  powerTime(id: PowerId): number { return POWER_TIME[id] * RANK.powers[this.ranks.powers]; }

  get topSpeed(): number { return ROVER.top * RANK.motor[this.ranks.motor]; }

  /** Everything the mission needs before the base (or the rocket) takes the rover in. */
  get ready(): boolean {
    return this.delivered.every(Boolean) && this.generators.every((g) => g.off);
  }

  /** Where the rover should go to finish: the rocket in an escape, else the base pad. */
  get goal(): Spot { return this.c.setpiece === 'escape' && this.c.rocket ? this.c.rocket : this.c.base; }

  trainPos(i: number, t = this.clock): { s: number; on: boolean; head: number; tail: number } {
    const tr = this.c.tracks[i];
    const len = tr.to - tr.from, span = len + TRAIN.cars * TRAIN.car + 40;
    const k = ((t + tr.offset) * tr.speed) % (tr.period * tr.speed);
    // the train runs over the span once per period, then is gone until the next
    const s = k - 20;
    const on = k < span;
    const head = tr.dir > 0 ? tr.from + s : tr.to - s;
    const tail = head - tr.dir * TRAIN.cars * TRAIN.car;
    return { s, on, head, tail };
  }

  gateOn(i: number, t = this.clock): boolean {
    const g = this.c.gates[i];
    const cyc = g.open + g.closed;
    const k = (((t + g.offset) % cyc) + cyc) % cyc;
    return k >= g.open;
  }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    const v = this.rover;
    this.clock += dt;
    if (v.state === 'drive') this.stats.time += dt;
    v.inv = Math.max(0, v.inv - dt);
    v.jolt = Math.max(0, v.jolt - dt * 3);
    this.seatsWarnT = Math.max(0, this.seatsWarnT - dt);
    this.needWarnT = Math.max(0, this.needWarnT - dt);
    for (const id of Object.keys(v.active) as PowerId[]) {
      if (v.active[id] > 0) { v.active[id] -= dt; if (v.active[id] <= 0) { v.active[id] = 0; if (id !== 'emp') this.events.push({ e: 'powerEnd', id }); } }
    }
    this.stormStep(dt);
    switch (v.state) {
      case 'drive': this.drive(dt, inp); break;
      case 'flip': this.flipStep(dt); break;
      case 'fall': this.coast(dt); v.vy -= GRAV * dt; v.y += v.vy * dt; if ((v.stateT -= dt) <= 0) this.startTow(); break;
      case 'empty': this.coast(dt); if ((v.stateT -= dt) <= 0) { this.hurt(2, 'battery', true); if (v.state === 'empty') this.startTow(); } break;
      case 'tow': if ((v.stateT -= dt) <= 0) this.respawn(); break;
      case 'clear': this.coast(dt); break;
      case 'dead': break;
    }
    if (v.state !== 'clear' && v.state !== 'dead') {
      this.astronautStep(dt);
      this.crystalStep(dt);
      this.meteorStep(dt);
      this.turretStep(dt);
      this.boltStep(dt);
      this.trainStep();
      this.minerStep(dt);
      this.countdownStep(dt);
    }
  }

  private stormStep(dt: number): void {
    const s = this.c.storms;
    if (!s) return;
    const k = this.clock - s.first;
    const on = k >= 0 && k % s.every < s.len;
    if (on !== this.storm) { this.storm = on; this.events.push({ e: on ? 'stormStart' : 'stormEnd' }); }
    this.stormK += ((on ? 1 : 0) - this.stormK) * Math.min(1, dt * 1.5);
  }

  private countdownStep(dt: number): void {
    if (this.countdown < 0 || this.launched) return;
    const before = this.countdown;
    this.countdown -= dt;
    if (before > 15 && this.countdown <= 15) this.events.push({ e: 'timeLow' });
    if (this.countdown <= 0) {
      // the launch is held for the rover once more, at the price of a heart
      this.countdown = 30;
      this.events.push({ e: 'timeUp' });
      this.hurt(2, 'time', true);
    }
  }

  // ---------------------------------------------------------------- driving

  private drive(dt: number, inp: Input): void {
    const v = this.rover, T = this.tune;
    if (inp.power) this.usePower();
    const boost = v.active.boost > 0;
    const surf = this.ter.surface(v.x, v.z);
    v.surf = surf;
    const ice = surf === 'ice', dust = surf === 'dust', field = surf === 'field';
    const gripK = RANK.grip[this.ranks.grip];
    v.steer = inp.steer;
    // battery
    const motorOn = (inp.gas || inp.brake) && !v.air;
    v.throttle += ((inp.gas ? 1 : inp.brake ? -0.6 : 0) - v.throttle) * Math.min(1, dt * 8);
    if (!this.god && !v.charging) {
      const drain = (BATTERY.idle + (motorOn ? BATTERY.motor : 0) + (boost ? BATTERY.boost : 0)) * T.drain * (1 + this.stormK * 0.9);
      v.battery = Math.max(0, v.battery - drain * dt);
    }
    if (v.battery <= v.bmax * 0.2 && !this.lowWarned) { this.lowWarned = true; this.events.push({ e: 'lowBattery' }); }
    if (v.battery > v.bmax * 0.35) this.lowWarned = false;
    if (v.battery <= 0) { v.state = 'empty'; v.stateT = 1.6; this.events.push({ e: 'empty' }); return; }
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    if (!v.air) {
      // ---- on the ground
      const top = this.topSpeed * (boost ? POWER.boostTop : 1);
      const turnK = Math.min(1, Math.abs(v.speed) / 5) * (1 - 0.3 * Math.min(1, Math.abs(v.speed) / top));
      v.yaw -= inp.steer * ROVER.turn * turnK * Math.sign(v.speed || 1) * (ice ? 0.75 : 1) * dt;
      const nfx = Math.sin(v.yaw), nfz = Math.cos(v.yaw), rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw);
      let fwd = v.vx * nfx + v.vz * nfz, lat = v.vx * rx + v.vz * rz;
      const traction = ice ? 0.45 : dust ? 0.8 : 1;
      let acc = 0;
      if (inp.gas) {
        if (fwd < -0.3) acc += ROVER.brake * traction;
        else acc += ROVER.acc * RANK.motor[this.ranks.motor] * (boost ? POWER.boostAcc : 1) * traction * Math.max(0, 1 - (fwd / top) ** 2);
      } else if (inp.brake) {
        if (fwd > 0.5) acc -= ROVER.brake * traction;
        else acc -= ROVER.revAcc * traction * Math.max(0, 1 - (-fwd / ROVER.revTop) ** 2);
      } else {
        const roll = ROVER.roll * (ice ? 0.35 : 1);
        acc -= Math.sign(fwd) * Math.min(Math.abs(fwd) / dt, roll);
      }
      acc -= GRAV * Math.sin(v.gPitch);
      fwd += acc * dt;
      if (field && Math.abs(fwd) > top * 0.42) fwd *= Math.exp(-3.2 * dt);
      if (!inp.gas && !inp.brake && Math.abs(fwd) < 0.08 && Math.abs(v.gPitch) < 0.05) fwd = 0;
      const grip = ROVER.grip * gripK * (ice ? 0.1 : dust ? 0.35 : 1);
      lat *= Math.exp(-grip * dt);
      v.vx = nfx * fwd + rx * lat;
      v.vz = nfz * fwd + rz * lat;
      v.speed = fwd;
    } else {
      // ---- in the air: a little steering, the pitch under the pedals, roll levels itself
      v.yaw -= inp.steer * ROVER.turn * ROVER.airSteer * dt;
      v.airT += dt;
      // the nose follows the flight path unless GAS holds it up (level for flat ground) or BRAKE
      // dips it (for a landing on a downslope); hover jets keep it level
      const hover = v.active.hover > 0;
      const path = Math.max(-0.95, Math.min(0.5, Math.atan2(v.vy, Math.max(2, Math.hypot(v.vx, v.vz))) * 0.9));
      const target = hover ? (inp.brake ? -0.35 : 0.04) : inp.gas ? AIR.gas : inp.brake ? AIR.brake : path;
      v.pitchV += ((target - v.pitch) * AIR.spring - v.pitchV * AIR.damp) * dt;
      v.pitch += v.pitchV * dt;
      v.rollV += (-v.roll * 1.6 - v.rollV * 1.5) * dt;
      v.roll += v.rollV * dt;
      v.speed = v.vx * fx + v.vz * fz;
    }
    this.move(dt);
    this.places();
  }

  /** Horizontal motion with walls and obstacles, then the vertical: ground, takeoff, flight, landing. */
  private move(dt: number): void {
    const v = this.rover;
    const ref = v.air ? v.y + 0.35 : this.wallH(v.x, v.z) + ROVER.stepMax;
    const px = v.x, pz = v.z;
    let hit = 0;
    const nx = v.x + v.vx * dt;
    if (this.blocked(nx, v.z, ref)) { hit = Math.max(hit, Math.abs(v.vx)); v.vx = -v.vx * 0.3; } else v.x = nx;
    const nz = v.z + v.vz * dt;
    if (this.blocked(v.x, nz, ref)) { hit = Math.max(hit, Math.abs(v.vz)); v.vz = -v.vz * 0.3; } else v.z = nz;
    hit = Math.max(hit, this.obstacles());
    // never pushed into a cliff (an obstacle's push-out next to a wall): back to where it was
    if (this.blocked(v.x, v.z, ref) && !this.blocked(px, pz, ref)) { v.x = px; v.z = pz; v.vx *= -0.3; v.vz *= -0.3; }
    if (hit > 2.5) { this.events.push({ e: 'bump', speed: hit, x: v.x, z: v.z }); v.jolt = Math.min(1, hit / 10); }
    // vertical
    const g = this.groundUnder(v.x, v.z, v.yaw);
    if (!v.air) {
      const gvy = (g.h - v.y) / dt;
      if (g.h <= ABYSS + 1 || gvy < v.vy - GRAV * dt - 0.6) {
        // the ground falls away faster than the moon pulls: off we go
        v.air = true; v.airT = 0;
        v.pitchV = -0.25 - Math.max(0, v.gPitch) * 0.55;
        v.rollV = Math.max(-1.2, Math.min(1.2, (g.roll - v.gRoll) / dt * 0.15));
        v.vy = Math.min(v.vy, 14);
        // a connector ramp's crest (the ground goes on at its top) gives only a small hop: the big
        // flights are for kickers, crater lips and edges
        const behind = this.ter.tileAt(v.x - Math.sin(v.yaw) * 1.4, v.z - Math.cos(v.yaw) * 1.4);
        if (behind && behind.k === 'ramp' && g.h > ABYSS + 1 && Math.abs(g.h - (behind.L + 1) * STEP) < 0.3) v.vy = Math.min(v.vy, 1.4);
        v.y += v.vy * dt;
        if (Math.abs(v.vy) > 1.5 || g.h <= ABYSS + 1) this.events.push({ e: 'takeoff', speed: Math.hypot(v.vx, v.vz) });
      } else {
        v.vy = Math.max(-14, Math.min(9, gvy));
        v.y = g.h;
        v.gPitch = g.pitch; v.gRoll = g.roll;
        v.pitch += (g.pitch - v.pitch) * Math.min(1, dt * 14);
        v.roll += (g.roll - v.roll) * Math.min(1, dt * 14);
        v.pitchV = 0; v.rollV = 0;
      }
    } else {
      const grav = GRAV * (v.active.hover > 0 ? POWER.hoverGrav : 1);
      v.vy -= grav * dt;
      v.y += v.vy * dt;
      if (v.y <= g.h && g.h > ABYSS + 1) this.land(g);
      else if (v.y < -10) this.fall();
    }
    // a pit or a chasm under the rover while on the ground
    if (!v.air && g.center <= ABYSS + 1) this.fall();
  }

  private land(g: { h: number; pitch: number; roll: number }): void {
    const v = this.rover;
    const impact = Math.max(0, -v.vy);
    const err = Math.max(Math.abs(v.pitch - g.pitch), Math.abs(v.roll - g.roll) * 0.8);
    const air = v.airT;
    v.air = false;
    v.y = g.h;
    v.gPitch = g.pitch; v.gRoll = g.roll;
    const flipAt = this.tune.flip + RANK.gripLand[this.ranks.grip];
    if (err > flipAt && v.active.shield <= 0 && !this.god) {
      this.stats.flips++;
      v.state = 'flip'; v.stateT = 1.5;
      v.vx *= 0.25; v.vz *= 0.25; v.vy = 0;
      this.events.push({ e: 'flip', x: v.x, z: v.z });
      return;
    }
    const q: LandQuality = err < LAND.perfect ? 'perfect' : err < LAND.good ? 'good' : 'rough';
    // keep the speed along the ground, drop the part into it
    const nfx = Math.sin(v.yaw), nfz = Math.cos(v.yaw);
    const along = v.vx * nfx + v.vz * nfz;
    const keep = q === 'rough' ? 0.7 : q === 'good' ? 0.92 : 1;
    const lat = (v.vx * -nfz + v.vz * nfx);
    v.vx = (nfx * along + -nfz * lat * 0.5) * keep;
    v.vz = (nfz * along + nfx * lat * 0.5) * keep;
    v.vy = q === 'rough' && impact > 5 ? impact * 0.2 : 0;
    if (v.vy > 0) { v.air = true; v.airT = 0; v.y += 0.02; }
    v.pitch += (g.pitch - v.pitch) * 0.6;
    v.roll += (g.roll - v.roll) * 0.6;
    v.jolt = Math.min(1, impact / 9);
    if (air > 0.35) {
      this.stats.bestAir = Math.max(this.stats.bestAir, air);
      if (q === 'perfect') { this.stats.perfect++; this.points += SCORE.perfect; }
      else if (q === 'good') this.points += SCORE.good;
      this.points += Math.round(SCORE.airSecond * air);
    }
    this.events.push({ e: 'land', q, impact, air, x: v.x, z: v.z });
  }

  private flipStep(dt: number): void {
    const v = this.rover;
    v.stateT -= dt;
    this.coast(dt);
    if (v.stateT <= 0) {
      v.state = 'drive';
      v.pitch = v.gPitch; v.roll = v.gRoll; v.pitchV = v.rollV = 0;
      v.vx = v.vz = 0; v.speed = 0;
      v.inv = Math.max(v.inv, 0.8);
      if (this.tune.flipHurts) this.hurt(1, 'flip', true);
      if (this.ter.isHole(v.x, v.z)) this.fall();
    }
  }

  /** Rolling to a stop (no motor). */
  private coast(dt: number): void {
    const v = this.rover;
    const k = Math.exp(-2.2 * dt);
    v.vx *= k; v.vz *= k;
    if (v.state === 'fall') { v.x += v.vx * dt; v.z += v.vz * dt; return; }
    const ref = this.wallH(v.x, v.z) + ROVER.stepMax;
    const nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
    if (!this.blocked(nx, v.z, ref)) v.x = nx;
    if (!this.blocked(v.x, nz, ref)) v.z = nz;
    const g = this.groundUnder(v.x, v.z, v.yaw);
    if (g.h > ABYSS + 1) { v.y += (g.h - v.y) * Math.min(1, dt * 10); v.gPitch = g.pitch; v.gRoll = g.roll; }
  }

  private fall(): void {
    const v = this.rover;
    if (v.state !== 'drive') return;
    v.state = 'fall'; v.stateT = 1.3; v.air = true;
    this.events.push({ e: 'fall', x: v.x, z: v.z });
  }

  private startTow(): void {
    const v = this.rover;
    if (v.state === 'dead') return;
    if (v.state === 'fall' && this.hurt(1, 'fall', true) && (v.state as RoverState) === 'dead') return;
    v.state = 'tow'; v.stateT = 1.4;
    this.events.push({ e: 'tow' });
  }

  private respawn(): void {
    const v = this.rover, cp = this.checkpoint;
    v.state = 'drive';
    v.x = cp.x; v.z = cp.z; v.yaw = cp.yaw;
    v.vx = v.vy = v.vz = 0; v.speed = 0; v.pitchV = v.rollV = 0;
    const g = this.groundUnder(v.x, v.z, v.yaw);
    v.y = g.h; v.pitch = g.pitch; v.roll = g.roll; v.air = false;
    v.battery = v.bmax;
    v.inv = 2.2;
    // no meteor lands on a rover just put down
    this.meteors = this.meteors.filter((m) => Math.hypot(m.x - v.x, m.z - v.z) > 14);
    this.bolts = [];
    if (this.miner && !this.miner.off) { this.miner.pause = 3; }
    this.events.push({ e: 'respawn', x: v.x, z: v.z });
  }

  /** Hearts in halves. `force` hurts even while safe after a hit (falls, an empty battery). */
  hurt(n: number, by: string, force = false, x = this.rover.x, z = this.rover.z): boolean {
    const v = this.rover;
    if (this.god || v.state === 'dead' || v.state === 'clear') return false;
    if (!force && v.inv > 0) return false;
    if (!force && v.active.shield > 0) { this.events.push({ e: 'shielded', x, z }); return false; }
    v.hp = Math.max(0, v.hp - n);
    v.inv = 2.4;
    this.stats.hits++;
    this.events.push({ e: 'hurt', by, x, z });
    if (v.hp <= 0) { v.state = 'dead'; v.vx *= 0.3; v.vz *= 0.3; this.events.push({ e: 'die' }); return true; }
    return true;
  }

  /** A knock from something: away from (x, z), a little upward. */
  private knock(x: number, z: number, k: number, up = 3): void {
    const v = this.rover;
    const dx = v.x - x, dz = v.z - z, d = Math.hypot(dx, dz) || 1;
    v.vx += (dx / d) * k; v.vz += (dz / d) * k;
    if (up > 0) {
      if (!v.air) { v.air = true; v.airT = 0; v.vy = up; v.pitchV = 0; }
      else v.vy = Math.max(v.vy, up);
    }
  }

  /** Static obstacles, closed gates, the miner and trains push the rover out; returns the impact speed. */
  private obstacles(): number {
    const v = this.rover;
    let hit = 0;
    const R = ROVER.radius;
    const push = (o: { x: number; z: number; r: number; box?: [number, number] }, top: number) => {
      if (v.y > top) return;
      if (o.box) {
        const [hw, hd] = o.box;
        const cx = Math.max(o.x - hw, Math.min(o.x + hw, v.x)), cz = Math.max(o.z - hd, Math.min(o.z + hd, v.z));
        let dx = v.x - cx, dz = v.z - cz, d = Math.hypot(dx, dz);
        if (d >= R) return;
        if (d < 1e-4) {
          // inside: out through the nearest side
          const ox = hw - Math.abs(v.x - o.x), oz = hd - Math.abs(v.z - o.z);
          if (ox < oz) { dx = Math.sign(v.x - o.x) || 1; dz = 0; } else { dz = Math.sign(v.z - o.z) || 1; dx = 0; }
          d = 0;
          v.x = ox < oz ? o.x + dx * (hw + R) : v.x;
          v.z = ox < oz ? v.z : o.z + dz * (hd + R);
        } else { dx /= d; dz /= d; v.x = cx + dx * R; v.z = cz + dz * R; }
        const vn = v.vx * dx + v.vz * dz;
        if (vn < 0) { hit = Math.max(hit, -vn); v.vx -= 1.3 * vn * dx; v.vz -= 1.3 * vn * dz; }
        return;
      }
      const dx = v.x - o.x, dz = v.z - o.z, d = Math.hypot(dx, dz);
      const min = o.r + R;
      if (d >= min || d < 1e-4) return;
      const nx = dx / d, nz = dz / d;
      v.x = o.x + nx * min; v.z = o.z + nz * min;
      const vn = v.vx * nx + v.vz * nz;
      if (vn < 0) { hit = Math.max(hit, -vn); v.vx -= 1.3 * vn * nx; v.vz -= 1.3 * vn * nz; }
    };
    for (const o of this.c.obstacles) {
      if (Math.abs(o.x - v.x) > 12 || Math.abs(o.z - v.z) > 12) continue;
      push(o, o.y + o.top);
    }
    // force-field gates: the field fills the ring while on; the ring's posts always stand
    this.c.gates.forEach((g, i) => {
      if (Math.abs(g.x - v.x) > 8 || Math.abs(g.z - v.z) > 8) return;
      const ax = g.axis === 'x';
      for (const s of [-1, 1]) push({ x: g.x + (ax ? s * 1.9 : 0), z: g.z + (ax ? 0 : s * 1.9), r: 0.35 }, g.y + 4.2);
      if (this.gateOn(i)) {
        const before = hit;
        push({ x: g.x, z: g.z, r: 0, box: ax ? [1.8, 0.25] : [0.25, 1.8] }, g.y + 4);
        if (hit > before || (Math.abs(v.x - g.x) < (ax ? 1.8 : 1.4) && Math.abs(v.z - g.z) < (ax ? 1.4 : 1.8))) {
          if (hit > 1) this.events.push({ e: 'zap', x: g.x, z: g.z });
        }
      }
    });
    return hit;
  }

  // ---------------------------------------------------------------- places on the map

  private places(): void {
    const v = this.rover, L = this.c;
    const near = (s: { x: number; z: number }, r: number) => Math.abs(s.x - v.x) < r && Math.abs(s.z - v.z) < r && Math.hypot(s.x - v.x, s.z - v.z) < r;
    // charging pads (and the base): refill, and a checkpoint
    let charging = false;
    for (const ch of L.chargers) if (near(ch, 2.6) && !v.air) { charging = true; this.setCheckpoint(ch.x, ch.z); }
    const atBase = near(L.base, 4.2) && !v.air;
    if (atBase) charging = true;
    if (charging) {
      v.battery = Math.min(v.bmax, v.battery + BATTERY.charge * (1 / 60));
      // the pad's crew patch the rover up: half a heart every few seconds
      if (v.hp < v.max && v.hp > 0) { this.repairT += 1 / 60; if (this.repairT >= BATTERY.repair) { this.repairT = 0; v.hp++; this.events.push({ e: 'repair' }); } }
      if (!this.wasCharging) this.events.push({ e: 'charge', x: v.x, z: v.z });
      if (v.battery >= v.bmax && this.onPadT >= 0) { this.onPadT = -1; this.events.push({ e: 'charged' }); }
    } else this.onPadT = 0;
    this.wasCharging = charging;
    v.charging = charging;
    // checkpoint gates
    for (const g of L.checkpoints) if (near(g, 2.8)) this.setCheckpoint(g.x, g.z);
    // outposts: a supply drop, and the crew aboard climbs out
    L.outposts.forEach((o, i) => {
      if (!near(o, 3) || v.air) return;
      this.setCheckpoint(o.x, o.z);
      if (!this.delivered[i] && v.cargo > 0) {
        this.delivered[i] = true;
        v.cargo--;
        this.stats.delivered++;
        this.points += SCORE.delivery;
        this.stats.credits += CREDITS.delivery;
        this.events.push({ e: 'deliver', i, x: o.x, z: o.z, left: this.delivered.filter((d) => !d).length });
      }
      this.dropCrew(o.x, o.z);
    });
    // power pick-ups (one carried at a time: the next waits on the ground)
    for (const p of this.powers) {
      if (p.taken || v.power || !near(p, 2.8)) continue;
      p.taken = true;
      v.power = p.id;
      this.events.push({ e: 'pickup', id: p.id, x: p.x, z: p.z });
    }
    // the hidden alien
    if (L.alien && !this.alienFound && near(L.alien, 6)) {
      this.alienFound = true;
      this.stats.alien = true;
      this.points += SCORE.alien;
      this.stats.credits += CREDITS.alien;
      this.events.push({ e: 'alien', x: L.alien.x, z: L.alien.z });
    }
    // generators (the miner set-piece): drive onto the switch plate to shut each down
    this.generators.forEach((g, i) => {
      if (g.off || !near(g, 3.4)) return;
      g.off = true;
      this.stats.generators++;
      this.points += SCORE.generator;
      this.stats.credits += CREDITS.generator;
      const left = this.generators.filter((q) => !q.off).length;
      this.events.push({ e: 'generator', i, left, x: g.x, z: g.z });
      this.setCheckpoint(v.x, v.z);
      if (!left && this.miner && !this.miner.off) { this.miner.off = true; this.events.push({ e: 'minerOff', x: this.miner.x, z: this.miner.z }); }
    });
    // the base: crew out; with the job done, the mission is over
    if (atBase) {
      this.dropCrew(L.base.x, L.base.z);
      if (L.setpiece !== 'escape') {
        if (this.ready) this.finish(L.base.x, L.base.z);
        else if (this.needWarnT <= 0 && this.clock > 4 && Math.hypot(v.vx, v.vz) < 6) {
          this.needWarnT = 6;
          this.events.push({ e: this.delivered.every(Boolean) ? 'needGenerators' : 'needCargo' });
        }
      }
    }
    if (L.setpiece === 'escape' && L.rocket && near(L.rocket, 6.5) && !v.air) {
      this.dropCrew(L.rocket.x, L.rocket.z);
      this.launched = true;
      this.finish(L.rocket.x, L.rocket.z);
    }
  }

  private setCheckpoint(x: number, z: number): void {
    const cp = this.checkpoint, v = this.rover;
    if (Math.hypot(cp.x - x, cp.z - z) < 1) return;
    cp.x = x; cp.z = z; cp.yaw = v.yaw;
    if (this.c.base.x !== x || this.c.base.z !== z) this.events.push({ e: 'checkpoint', x, z });
  }

  private dropCrew(x: number, z: number): void {
    const v = this.rover;
    if (v.aboard <= 0) return;
    let n = 0;
    for (const a of this.astronauts) if (a.state === 'aboard') {
      a.state = 'saved'; a.t = 0;
      a.x = v.x + Math.cos(n * 2) * 1.5; a.z = v.z + Math.sin(n * 2) * 1.5; a.y = v.y;
      a.home = { x, z, y: v.y, c: 0, r: 0 };
      n++;
    }
    v.aboard = 0;
    this.stats.rescued += n;
    this.points += SCORE.astronaut * n;
    this.stats.credits += CREDITS.astronaut * n;
    this.events.push({ e: 'rescue', n, x, z });
  }

  private finish(x: number, z: number): void {
    const v = this.rover;
    v.state = 'clear';
    this.events.push({ e: 'clear', x, z });
  }

  // ---------------------------------------------------------------- powers

  usePower(): void {
    const v = this.rover;
    const id = v.power;
    if (!id || v.state !== 'drive') return;
    v.power = null;
    this.events.push({ e: 'use', id });
    if (id === 'emp') {
      for (const t of this.turrets) if (Math.hypot(t.x - v.x, t.z - v.z) < POWER.empR) { t.frozen = this.powerTime('emp'); t.charge = 0; }
      this.bolts = this.bolts.filter((b) => Math.hypot(b.x - v.x, b.z - v.z) > POWER.empR);
      if (this.miner && !this.miner.off && Math.hypot(this.miner.x - v.x, this.miner.z - v.z) < POWER.empR * 1.5) this.miner.frozen = this.powerTime('emp');
      this.events.push({ e: 'emp', x: v.x, z: v.z });
      return;
    }
    v.active[id] = this.powerTime(id);
    if (id === 'boost' && !v.air) { const f = Math.max(v.speed, 0) + 4; v.vx = Math.sin(v.yaw) * f; v.vz = Math.cos(v.yaw) * f; }
  }

  // ---------------------------------------------------------------- crystals and astronauts

  private crystalStep(dt: number): void {
    const v = this.rover;
    if (v.state !== 'drive') return;
    const reach = 2.6 + RANK.reach[this.ranks.magnet];
    const mag = v.active.magnet > 0 ? POWER.magnetR * RANK.magnet[this.ranks.magnet] : 0;
    for (const c of this.crystals) {
      if (c.taken) continue;
      const dx = v.x - c.x, dz = v.z - c.z, dy = v.y + 1 - (c.y + 1.2), d = Math.hypot(dx, dz);
      if (mag > 0 && d < mag) {
        c.pull = Math.min(1, c.pull + dt * 2);
        const sp = (8 + c.pull * 22) * dt;
        const k = Math.min(1, sp / Math.max(0.01, Math.hypot(d, dy)));
        c.x += dx * k; c.z += dz * k; c.y += dy * k;
      }
      if (d < reach && Math.abs(dy) < 3.2) {
        c.taken = true;
        this.stats.crystals++;
        this.points += SCORE.crystal;
        this.stats.credits += CREDITS.crystal;
        this.events.push({ e: 'crystal', x: c.x, y: c.y + 1.2, z: c.z, magnet: c.pull > 0 });
      }
    }
  }

  private astronautStep(dt: number): void {
    const v = this.rover;
    const sp = Math.hypot(v.vx, v.vz);
    this.astronauts.forEach((a, i) => {
      a.t += dt;
      if (a.state === 'aboard' || a.state === 'saved') {
        if (a.state === 'saved') {
          // they walk off towards where they were left, then are gone (the view fades them)
          const dx = a.home.x - a.x, dz = a.home.z - a.z, d = Math.hypot(dx, dz);
          if (d > 0.3) { a.x += (dx / d) * 2 * dt; a.z += (dz / d) * 2 * dt; a.yaw = Math.atan2(dx, dz); a.speed = 2; } else a.speed = 0;
        }
        return;
      }
      const dx = v.x - a.x, dz = v.z - a.z, d = Math.hypot(dx, dz);
      const free = v.aboard < v.seats;
      const canBoard = v.state === 'drive' && !v.air;
      if (a.state === 'wait') {
        a.speed = 0;
        if (d < 26) { a.state = 'wave'; a.t = 0; this.events.push({ e: 'wave', i }); }
      } else if (a.state === 'wave') {
        a.yaw = Math.atan2(dx, dz);
        a.speed = 0;
        if (d > 34) a.state = 'wait';
        else if (d < 11 && sp < 6.5 && canBoard) {
          if (free) { a.state = 'run'; a.t = 0; }
          else if (this.seatsWarnT <= 0) { this.seatsWarnT = 5; this.events.push({ e: 'seatsFull' }); }
        }
      } else if (a.state === 'run') {
        if (!free || d > 16 || !canBoard) { a.state = 'wave'; return; }
        a.yaw = Math.atan2(dx, dz);
        a.speed = 5.2;
        const step = Math.min(d, a.speed * dt);
        const nx = a.x + (dx / d) * step, nz = a.z + (dz / d) * step;
        const h = this.ter.ground(nx, nz);
        if (h > ABYSS + 1 && h < a.y + 1.2) { a.x = nx; a.z = nz; a.y = h; }
        if (d < 2.3) {
          a.state = 'aboard';
          a.seat = v.aboard;
          v.aboard++;
          this.events.push({ e: 'board', i, x: a.x, z: a.z });
        }
      }
    });
  }

  // ---------------------------------------------------------------- hazards

  private meteorStep(dt: number): void {
    const v = this.rover, M = this.c.meteors;
    if (M && v.state === 'drive' && this.clock >= this.meteorT) {
      const escape = this.c.setpiece === 'escape';
      const gap = M.every * this.tune.meteorGap * (0.7 + this.rand() * 0.6);
      this.meteorT = this.clock + gap;
      const n = escape && this.rand() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        // ahead of the rover, where it will be when the warning runs out (give or take)
        const sp = Math.hypot(v.vx, v.vz);
        const lead = sp * this.tune.warn * (0.55 + this.rand() * 0.5);
        const a = v.yaw + (this.rand() - 0.5) * 1.6;
        const off = 3.5 + this.rand() * 9;
        const x = v.x + Math.sin(v.yaw) * lead + Math.sin(a) * off * (this.rand() < 0.5 ? -1 : 1);
        const z = v.z + Math.cos(v.yaw) * lead + Math.cos(a) * off * (this.rand() < 0.5 ? -1 : 1);
        const g = this.ter.ground(x, z);
        if (g <= ABYSS + 1 || g >= 50) continue;
        const big = escape && this.rand() < 0.35;
        this.meteors.push({ x, z, y: g, t: this.tune.warn, warn: this.tune.warn, big });
        this.events.push({ e: 'meteorWarn', i: this.meteorI++, x, z });
      }
    }
    for (const m of this.meteors) {
      m.t -= dt;
      if (m.t > 0) continue;
      const R = m.big ? 4.6 : 3.4;
      const d = Math.hypot(v.x - m.x, v.z - m.z);
      // a fresh crater where it struck (not on pads, ramps or roads into a wall)
      const t = this.ter.tileAt(m.x, m.z);
      const clearOf = (s: { x: number; z: number }) => Math.hypot(s.x - m.x, s.z - m.z) > 6;
      const crater = !!t && t.k === 'ground' && clearOf(this.c.base) && this.c.outposts.every(clearOf) && this.c.chargers.every(clearOf) && this.ter.craters.filter((c) => c.fresh).length < 40;
      if (crater) this.ter.addCrater({ x: m.x, z: m.z, R: m.big ? 4.4 : 3.3, H: m.big ? 1 : 0.75, large: false, pit: false, fresh: true });
      this.events.push({ e: 'meteor', x: m.x, y: m.y, z: m.z, crater });
      if (d < R && v.y < m.y + 4 && (v.state === 'drive')) {
        if (this.hurt(1, 'meteor', false, m.x, m.z)) this.knock(m.x, m.z, 7, 5);
        else if (v.active.shield > 0) this.knock(m.x, m.z, 4, 2.5);
      }
    }
    this.meteors = this.meteors.filter((m) => m.t > 0);
  }

  /** A clear line from a turret to the rover (no ground higher than the barrel in between). */
  private sees(t: Turret): boolean {
    const v = this.rover, d = Math.hypot(v.x - t.x, v.z - t.z), h = t.y + 1.6;
    for (let k = 2; k < d - 1; k += 1.5) {
      const x = t.x + ((v.x - t.x) * k) / d, z = t.z + ((v.z - t.z) * k) / d;
      if (this.ter.ground(x, z) > h + 0.2) return false;
    }
    return true;
  }

  private turretStep(dt: number): void {
    const v = this.rover;
    this.turrets.forEach((t, i) => {
      if (t.frozen > 0) { t.frozen -= dt; t.charge = 0; return; }
      const dx = v.x - t.x, dz = v.z - t.z, d = Math.hypot(dx, dz);
      const sweep = t.pattern === 'sweep';
      // aiming turrets need the rover in range and in sight; sweeping ones fire on their round anyway
      const live = v.state === 'drive' && d < (sweep ? 34 : 30) && (sweep || this.sees(t));
      if (sweep) t.yaw += dt * 0.75;
      else if (live) {
        // turns towards where the rover is now (no lead: a moving rover is never a sitting duck)
        let da = Math.atan2(dx, dz) - t.yaw;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        t.yaw += Math.max(-1.4 * dt, Math.min(1.4 * dt, da));
      }
      if (!live) { t.charge = 0; t.cd = Math.max(t.cd, 0.9); return; }
      t.cd -= dt;
      if (t.cd <= 0.9 && t.charge === 0) { t.charge = 0.001; this.events.push({ e: 'charging', i }); }
      if (t.charge > 0) t.charge += dt;
      if (t.cd <= 0) {
        t.cd = (sweep ? 1.5 : 3.3) * this.tune.fireGap;
        t.charge = 0;
        const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
        const sides = t.double ? [-0.55, 0.55] : [0];
        for (const s of sides) {
          const x = t.x + fx * 1.4 + Math.cos(t.yaw) * s, z = t.z + fz * 1.4 - Math.sin(t.yaw) * s;
          this.bolts.push({ x, y: t.y + 1.5, z, vx: fx * this.tune.bolt, vz: fz * this.tune.bolt, life: 34 / this.tune.bolt });
        }
        this.events.push({ e: 'fire', i, x: t.x, y: t.y + 1.5, z: t.z });
      }
    });
  }

  private boltStep(dt: number): void {
    const v = this.rover;
    for (const b of this.bolts) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (this.ter.ground(b.x, b.z) > b.y) { b.life = 0; continue; }
      const dx = v.x - b.x, dz = v.z - b.z, dy = v.y + 1 - b.y;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(dy) < 1.6 && v.state === 'drive') {
        b.life = 0;
        if (this.hurt(1, 'bolt', false, b.x, b.z)) this.knock(b.x - b.vx, b.z - b.vz, 5, 2.5);
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  private trainStep(): void {
    const v = this.rover;
    this.c.tracks.forEach((tr, i) => {
      const p = this.trainPos(i);
      if (!p.on) return;
      const lo = Math.min(p.head, p.tail), hi = Math.max(p.head, p.tail);
      const along = tr.axis === 'x' ? v.x : v.z, across = tr.axis === 'x' ? v.z : v.x;
      // a horn when it comes close
      const dist = along < lo ? lo - along : along > hi ? along - hi : 0;
      if (Math.abs(across - tr.at) < 14 && dist < 34 && this.clock - this.trainWarn[i] > 6) { this.trainWarn[i] = this.clock; this.events.push({ e: 'trainNear', i }); }
      if (v.state !== 'drive' || v.y > tr.y + TRAIN.height) return;
      if (along < lo - ROVER.radius || along > hi + ROVER.radius) return;
      const off = across - tr.at;
      if (Math.abs(off) > TRAIN.width / 2 + ROVER.radius) return;
      // pushed off the track to the near side, hard
      const side = Math.sign(off) || 1;
      if (tr.axis === 'x') { v.z = tr.at + side * (TRAIN.width / 2 + ROVER.radius + 0.05); v.vz = side * 9; v.vx += tr.dir * tr.speed * 0.4; }
      else { v.x = tr.at + side * (TRAIN.width / 2 + ROVER.radius + 0.05); v.vx = side * 9; v.vz += tr.dir * tr.speed * 0.4; }
      if (!v.air) { v.air = true; v.airT = 0; v.vy = 4; v.pitchV = 0; }
      this.events.push({ e: 'bump', speed: 10, x: v.x, z: v.z });
      this.hurt(1, 'train', false);
    });
  }

  private minerStep(dt: number): void {
    const m = this.miner, v = this.rover;
    if (!m) return;
    if (m.off) { m.sink = Math.min(1, m.sink + dt * 0.6); m.speed *= Math.exp(-2 * dt); m.y += ((this.ter.ground(m.x, m.z) + 0.4) - m.y) * Math.min(1, dt * 1.5); return; }
    if (!m.awake) { if (this.clock > 3.5 || Math.hypot(v.x - this.c.start.x, v.z - this.c.start.z) > 10) m.awake = true; else return; }
    const dx = v.x - m.x, dz = v.z - m.z, dist = Math.hypot(dx, dz);
    const turn = (want: number, rate: number) => {
      let da = want - m.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      m.yaw += Math.max(-rate * dt, Math.min(rate * dt, da));
      return da;
    };
    const top = ROVER.top * this.tune.miner;
    m.modeT += dt;
    if (m.frozen > 0) { m.frozen -= dt; m.speed *= Math.exp(-3 * dt); }
    else if (m.pause > 0) { m.pause -= dt; m.speed *= Math.exp(-2 * dt); }
    else if (m.mode === 'chase') {
      // closes in at a little under the rover's speed; winds up when near
      const lead = 0.5;
      const da = turn(Math.atan2(dx + v.vx * lead, dz + v.vz * lead), 2);
      m.speed += (top * (Math.abs(da) > 1 ? 0.55 : 0.82) - m.speed) * Math.min(1, dt * 1.2);
      if (dist < 15 && m.modeT > 1.2 && v.state === 'drive') { m.mode = 'wind'; m.modeT = 0; }
    } else if (m.mode === 'wind') {
      // a red flash while it slows and aims
      turn(Math.atan2(dx, dz), 3);
      m.speed *= Math.exp(-3 * dt);
      if (m.modeT > 1.05) { m.mode = 'charge'; m.modeT = 0; m.speed = top * 1.45; }
    } else if (m.mode === 'charge') {
      // straight ahead, fast: steer aside to dodge
      if (m.modeT > 1.15) { m.mode = 'cool'; m.modeT = 0; }
    } else {
      m.speed *= Math.exp(-1.6 * dt);
      if (m.modeT > 2.8) { m.mode = 'chase'; m.modeT = 0; }
    }
    m.x += Math.sin(m.yaw) * m.speed * dt;
    m.z += Math.cos(m.yaw) * m.speed * dt;
    // it hovers over whatever is under it (walls too), lower when slow
    let gh = -1e9;
    for (const [ox, oz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) { const h = this.ter.ground(m.x + ox, m.z + oz); if (h < 50) gh = Math.max(gh, h); }
    if (gh < -1e8) gh = m.y - 2.2;
    m.y += ((Math.max(gh, 0) + 2.2 + Math.sin(this.clock * 2) * 0.25) - m.y) * Math.min(1, dt * 3);
    m.x = Math.max(2, Math.min(this.c.cols * TILE - 2, m.x));
    m.z = Math.max(2, Math.min(this.c.rows * TILE - 2, m.z));
    if (v.state !== 'drive' || m.frozen > 0) return;
    const d = Math.hypot(v.x - m.x, v.z - m.z);
    if (d < 2.8 && Math.abs(v.y + 1 - m.y) < 2.8 && m.mode !== 'charge') {
      // a nudge while it hunts: no harm, it backs off
      this.knock(m.x, m.z, 4, 0);
      m.speed = -3; m.mode = 'cool'; m.modeT = 0;
      this.events.push({ e: 'bump', speed: 6, x: v.x, z: v.z });
    } else if (d < 2.8 && Math.abs(v.y + 1 - m.y) < 2.8) {
      this.events.push({ e: 'minerHit', x: m.x, z: m.z });
      if (this.hurt(1, 'miner', false, m.x, m.z)) this.knock(m.x, m.z, 9, 4);
      else this.knock(m.x, m.z, 6, 2);
      m.pause = 1.2;
      m.speed = -5;
      m.mode = 'cool'; m.modeT = -1.5;
    }
  }

  // ---------------------------------------------------------------- the continue

  /** A rewarded continue: full hearts and battery at the last checkpoint. */
  revive(): void {
    const v = this.rover;
    v.hp = v.max;
    this.checkpointNow();
    this.respawn();
    v.inv = 3;
    if (this.countdown >= 0 && this.countdown < 40) this.countdown = 40;
  }

  private checkpointNow(): void { void tv; }

  /** The star results. */
  stars(): boolean[] {
    return [this.stats.crystals >= this.c.crystals.length, this.stats.rescued >= this.c.astronauts.length, this.stats.time <= this.c.par];
  }
}

/** Points added when a level is cleared. */
export function clearBonus(s: Sim): { time: number; unharmed: number } {
  const under = Math.max(0, s.c.par - s.stats.time);
  return { time: Math.round(under * SCORE.parSecond), unharmed: s.stats.hits === 0 ? SCORE.unharmed : 0 };
}

export { STEP };
export type { Obstacle, Track };
