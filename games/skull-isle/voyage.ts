// Skull Isle: a sea leg between two islands (pure and seeded, driven by the simulation in sim.ts).
//
// After the dock shop the crew picks a route (calm waters or a stormy passage) and sails its ship
// to the next island, which lies at the origin of the world; the ship starts far to the south and
// sails north (−z) up a sea lane, with the island growing on the horizon. The player steers across
// the lane and trims the sails (stick / A-D / arrows, W-S), fires the broadside that faces the
// nearest foe (auto-aim, its impact telegraphed in gold) and evades. On the way: skeleton rowboats
// lobbing skulls, enemy sloops that sail alongside for a cannon duel, a ghost ship on later stormy
// legs, Kraken tentacles slamming across the lane, sharks lunging at the hull and rocks to steer
// round, every blow telegraphed in red like on the islands; barrels, crates, bottles (sea power-ups)
// and chests float by to be salvaged. The hull carries over between legs. At the island the ship
// docks and the hero jumps ashore; a sunk ship throws the hero into the water (the Sim's wreck swim).
import {
  SEA, SEA_FOES, SEA_POWERS, SEA_POWER_TIME, SEA_POWER_WEIGHTS, MERMAID, clamp, seeded,
  type Route, type SeaKind, type FloatKind, type SeaPower, type SeaCause,
} from './defs';
import { shoreAt } from './island';
import type { Sim, Tele, Input } from './sim';

export interface Ship {
  x: number; z: number; vx: number; speed: number;
  /** Heading off straight north (radians, + towards +x) and roll, for the view. */
  yaw: number; roll: number;
  hull: number;
  /** Reload left on the port (−x, index 0) and starboard (+x, index 1) sides. */
  reload: [number, number];
  evadeCd: number; evadeT: number; evadeDir: number;
  invuln: number;
  sunk: boolean;
  /** Seconds since the ship sank / stopped at the dock. */
  t: number;
}

export interface SeaFoe {
  id: number; kind: SeaKind;
  x: number; z: number; y: number; vx: number; vz: number; face: number;
  hp: number; maxHp: number; r: number; dmg: number;
  state: string; t: number; cd: number;
  tele: number;
  /** Fire Shot burn and Chain Shot slow (seconds left). */
  burn: number; slow: number;
  flash: number; deadT: number;
  /** Which side of the lane it keeps to (+1 / −1), its orbit angle (sharks), passes made. */
  side: number; ang: number; passes: number;
  /** Tentacles: base, reach and slam pitch (like the island's). */
  bx: number; bz: number; yaw: number; len: number; pitch: number;
  hitShip: boolean;
}

export interface Rock { id: number; x: number; z: number; r: number; model: number; rot: number; s: number; hitT: number }
export interface Float { id: number; kind: FloatKind; power: SeaPower | null; x: number; z: number; t: number; pull: boolean; spin: number }
export interface Ball {
  id: number; kind: 'ball' | 'skull' | 'ghost';
  friendly: boolean;
  x: number; y: number; z: number; x0: number; z0: number; x1: number; z1: number; h: number;
  t: number; dur: number; tele: number;
  fire: boolean; chain: boolean;
}

interface Plan { d: number; kind: SeaKind | 'rocks' | FloatKind; x: number; done: boolean }

/** The ship's hull as a few circles along its keel (forward offsets from its middle, radius). */
export const HULL_PTS = [3.3, 1.1, -1.1, -3.3];
export const HULL_R = 1.3;

export class Voyage {
  readonly route: Route;
  readonly storm: boolean;
  /** The island the ship sails to (0-based run index). */
  readonly dest: number;
  readonly D: number;
  readonly z0: number;
  readonly dockZ: number;
  readonly lvl: number;
  ship: Ship;
  foes: SeaFoe[] = [];
  rocks: Rock[] = [];
  floats: Float[] = [];
  balls: Ball[] = [];
  powers: Record<SeaPower, number> = { wind: 0, chain: 0, mermaid: 0, fire: 0, spyglass: 0 };
  /** The foe the next broadside aims at, and from which side. */
  aim: { id: number; side: 0 | 1; x: number; z: number } | null = null;
  /** Storm: the wind's sideways push now (units a second). */
  gust = 0;
  private gustTo = 0;
  private gustT = 2;
  private lightT = 4;
  private plan: Plan[] = [];
  private fireBuf = 0;
  private evadeBuf = 0;
  private ghostAt: number;
  ghostId = -1;
  private nextId = 1;
  private rnd: () => number;
  /** Seconds the dock's jump has run (the view moves the hero from the deck to the beach). */
  jumpT = -1;
  readonly landAt: { x: number; z: number };
  /** Gold salvaged and foes sunk on this leg (for the arrival banner). */
  salvaged = 0;
  sunkFoes = 0;

  constructor(private sim: Sim, route: Route, dest: number, seed: number) {
    this.route = route;
    this.storm = route === 'storm';
    this.dest = dest;
    this.rnd = seeded(seed);
    this.lvl = dest * sim.tune.ramp;
    const L = sim.L;
    const south = shoreAt(L, Math.PI / 2);
    this.dockZ = south + SEA.dockOff;
    this.landAt = { x: 0, z: south - 1.3 };
    this.D = SEA.length[route];
    this.z0 = this.dockZ + this.D;
    const st = sim.shipSt;
    this.ship = {
      x: 0, z: this.z0, vx: 0, speed: st.speed, yaw: 0, roll: 0, hull: Math.min(sim.hull, st.maxHull),
      reload: [0, 0], evadeCd: 0, evadeT: 0, evadeDir: 1, invuln: 1.5, sunk: false, t: 0,
    };
    this.ghostAt = this.storm && dest >= 3 ? this.D * 0.42 : -1;
    this.makePlan();
  }

  private R(a: number, b: number): number { return a + this.rnd() * (b - a); }
  private side(): number { return this.rnd() < 0.5 ? -1 : 1; }
  get progress(): number { return clamp((this.z0 - this.ship.z) / (this.z0 - this.dockZ), 0, 1); }
  /** Distance sailed from the start. */
  get d(): number { return this.z0 - this.ship.z; }

  // ------------------------------------------------------------------ the plan of a leg

  /** Lays out the leg: encounters spread evenly up the lane, rock clusters and floating loot between. */
  private makePlan(): void {
    const sim = this.sim, lvl = this.lvl, storm = this.storm;
    const start = 24, end = this.D - SEA.arrive;
    let budget = (storm ? 10.5 : 6.5) * (1 + 0.14 * lvl) * sim.tune.seaCount * (1 + 0.2 * Math.floor(this.dest / 5));
    const pool: [SeaKind, number][] = [['rowboat', 3], ['shark', 2]];
    if (this.dest >= 1) pool.push(['sloop', 1.6]);
    if (this.dest >= 2) pool.push(['tentacle', 2.2]);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    const kinds: SeaKind[] = [];
    let sloops = 0;
    while (budget > 0.5 && kinds.length < 30) {
      let r = this.rnd() * total;
      let k: SeaKind = 'rowboat';
      for (const [kk, w] of pool) { r -= w; if (r <= 0) { k = kk; break; } }
      if (k === 'sloop' && sloops >= (this.dest < 2 ? 1 : 2 + Math.floor(lvl / 4))) k = 'rowboat';
      if (k === 'sloop') sloops++;
      kinds.push(k);
      budget -= SEA_FOES[k].cost;
    }
    const n = kinds.length;
    kinds.forEach((k, i) => {
      const d = start + (end - start) * (i + 0.2 + this.rnd() * 0.6) / n;
      const x = k === 'sloop' ? this.side() * this.R(5, 6.5) : k === 'rowboat' ? this.R(-5.5, 5.5) : this.side();
      this.plan.push({ d, kind: k, x, done: false });
      // rowboats often come in pairs
      if (k === 'rowboat' && this.rnd() < 0.35 + lvl * 0.05) this.plan.push({ d: d + 5, kind: 'rowboat', x: clamp(-x + this.R(-2, 2), -6, 6), done: false });
    });
    // rock clusters between the encounters, always with a gap to sail through
    const rocks = storm ? 7 : 5;
    for (let i = 0; i < rocks; i++) this.plan.push({ d: start + 12 + (end - start - 12) * (i + this.R(0.1, 0.9)) / rocks, kind: 'rocks', x: this.R(-5, 5), done: false });
    // loot afloat: barrels of gold, crates (repairs), bottles (sea power-ups), a chest on a storm
    const luck = sim.shipSt.luck;
    const add = (kind: FloatKind, count: number) => {
      for (let i = 0; i < count; i++) {
        const k = kind === 'barrel' && this.rnd() < 0.06 + luck * 0.25 ? 'bottle' : kind;
        this.plan.push({ d: start + (this.D - 40 - start) * (i + this.R(0.1, 0.9)) / count, kind: k, x: this.R(-6, 6), done: false });
      }
    };
    add('barrel', storm ? 6 : 5);
    add('crate', storm ? 3 : 2);
    add('bottle', storm ? 2 : 1);
    if (storm) this.plan.push({ d: this.D * 0.74, kind: 'chest', x: this.R(-5, 5), done: false });
    this.plan.sort((a, b) => a.d - b.d);
  }

  /** Where the next tentacles will rise (for the spyglass), within `range` ahead of the ship. */
  upcoming(range: number): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const p of this.plan) {
      if (p.done || p.kind !== 'tentacle') continue;
      if (p.d > this.d + range) break;
      out.push({ x: Math.sign(p.x || 1) * (SEA.lane - 1.5), z: this.z0 - p.d });
    }
    return out;
  }

  // ------------------------------------------------------------------ the step

  update(dt: number, inp: Input): void {
    const sim = this.sim, s = this.ship;
    for (const k of SEA_POWERS) {
      if (this.powers[k] > 0) {
        this.powers[k] -= dt;
        if (k === 'mermaid' && sim.phase === 'sea') s.hull = Math.min(sim.shipSt.maxHull, s.hull + MERMAID.regen * dt);
        if (this.powers[k] <= 0) { this.powers[k] = 0; sim.emit({ type: 'seaExpire', power: k }); }
      }
    }
    s.invuln -= dt;
    s.evadeCd -= dt;
    s.reload[0] -= dt; s.reload[1] -= dt;
    if (inp.attack) this.fireBuf = 0.25;
    if (inp.dodge) this.evadeBuf = 0.2;
    this.fireBuf -= dt; this.evadeBuf -= dt;

    if (sim.phase === 'sinking') {
      s.t += dt;
      s.speed *= 1 - Math.min(1, dt * 1.5);
      s.z -= s.speed * dt;
      this.updateFoes(dt);
      this.updateBalls(dt);
      if (s.t >= 2.4) sim.startWreck();
      return;
    }
    if (sim.phase === 'dock') { this.dock(dt); this.updateFoes(dt); this.updateBalls(dt); this.updateFloats(dt); return; }

    // sails: the stick's up/down trims them; Fair Wind fills them
    const wind = this.powers.wind > 0;
    const st = sim.shipSt;
    const thr = clamp(-inp.mz, -1, 1);
    const want = st.speed * (wind ? 1.35 : 1) * (1 + 0.22 * Math.max(0, thr) - 0.35 * Math.max(0, -thr));
    s.speed += (want - s.speed) * Math.min(1, dt * 1.6);
    // the rudder: sideways across the lane, with a little weight
    const ag = st.agility * (wind ? 1.3 : 1);
    if (this.evadeBuf > 0 && s.evadeCd <= 0) this.startEvade(inp.mx);
    if (s.evadeT > 0) {
      s.evadeT -= dt;
      const k = 1 - Math.max(0, s.evadeT) / SEA.evadeTime;
      s.vx = s.evadeDir * SEA.evadeSpeed * (1 - k * 0.6);
    } else {
      const tvx = clamp(inp.mx, -1, 1) * SEA.side * ag + this.gust;
      s.vx += (tvx - s.vx) * Math.min(1, dt * 3.4 * ag);
    }
    s.x += s.vx * dt;
    const lim = SEA.lane;
    if (s.x > lim) { s.x = lim; s.vx = Math.min(0, s.vx); }
    if (s.x < -lim) { s.x = -lim; s.vx = Math.max(0, s.vx); }
    s.z -= s.speed * dt;
    s.yaw += (Math.atan2(s.vx, Math.max(2, s.speed)) * 0.75 - s.yaw) * Math.min(1, dt * 6);
    s.roll += (-s.vx * 0.035 - s.roll) * Math.min(1, dt * 4);

    // the storm: gusts push the ship about, lightning now and then
    if (this.storm) {
      this.gustT -= dt;
      if (this.gustT <= 0) { this.gustT = this.R(2.5, 4.5); this.gustTo = this.side() * this.R(1, 2.2) * (this.rnd() < 0.25 ? 0 : 1); sim.emit({ type: 'gust', dir: Math.sign(this.gustTo) }); }
      this.gust += (this.gustTo - this.gust) * Math.min(1, dt * 0.8);
      this.lightT -= dt;
      if (this.lightT <= 0) { this.lightT = this.R(5, 9); sim.emit({ type: 'lightning', x: s.x + this.R(-14, 14), z: s.z - this.R(30, 60) }); }
    }

    // the broadside facing the nearest foe
    this.aim = this.pickAim();
    if (this.fireBuf > 0) this.fire();

    this.spawn();
    this.updateFoes(dt);
    this.updateBalls(dt);
    this.updateTeles(dt);
    this.updateFloats(dt);
    this.updateRocks(dt);
    this.foes = this.foes.filter((f) => f.state !== 'gone' && !(f.state === 'dead' && f.deadT > 3));
    this.floats = this.floats.filter((f) => f.t >= 0 && f.z - s.z < 16);
    this.rocks = this.rocks.filter((r) => r.z - s.z < 20);

    // land ho: the last stretch is calm, the ship comes in to dock
    if (s.z <= this.dockZ + 16) this.startDock();
  }

  private startEvade(mx: number): void {
    const s = this.ship;
    let dir = Math.abs(mx) > 0.2 ? Math.sign(mx) : 0;
    if (!dir) {
      // away from the nearest red warning, else towards the open side of the lane
      let best: Tele | null = null, bd = 1e9;
      for (const T of this.sim.teles) {
        if (T.friendly) continue;
        const d = Math.hypot(T.x - s.x, T.z - s.z);
        if (d < bd) { bd = d; best = T; }
      }
      dir = best && bd < 12 ? (s.x >= best.x ? 1 : -1) : (s.x > 0 ? -1 : 1);
    }
    s.evadeDir = dir;
    s.evadeT = SEA.evadeTime;
    s.evadeCd = SEA.evadeCd;
    s.invuln = Math.max(s.invuln, 0.3);
    this.evadeBuf = 0;
    this.sim.emit({ type: 'evade', x: s.x, z: s.z, dir });
  }

  // ------------------------------------------------------------------ cannons

  /** Whether the broadside can hit a foe now. */
  targetable(f: SeaFoe): boolean {
    if (f.state === 'dead' || f.state === 'gone' || f.state === 'leave') return false;
    if (f.kind === 'tentacle') return f.state === 'idle' || f.state === 'wind' || f.state === 'down' || f.state === 'slam';
    if (f.kind === 'shark') return f.state !== 'dive';
    if (f.kind === 'ghost') return f.state !== 'rise';
    return true;
  }

  /** Where a foe's body is for a cannonball (a slammed tentacle: halfway along its arm). */
  aimPoint(f: SeaFoe): { x: number; z: number } {
    if (f.kind === 'tentacle') {
      const u = f.state === 'down' ? f.len * 0.55 : 1;
      return { x: f.bx + Math.sin(f.yaw) * u, z: f.bz + Math.cos(f.yaw) * u };
    }
    return { x: f.x, z: f.z };
  }

  private pickAim(): Voyage['aim'] {
    const s = this.ship;
    const range = SEA.range * (this.powers.spyglass > 0 ? 1.3 : 1);
    let best: Voyage['aim'] = null, bd = 1e9;
    for (const f of this.foes) {
      if (!this.targetable(f)) continue;
      const c = this.aimPoint(f);
      const dx = c.x - s.x, dz = c.z - s.z;
      const d = Math.hypot(dx, dz) - f.r * 0.5;
      if (d > range) continue;
      // bearing off the bow (north): the broadsides cover 23°–158° on each side
      const a = Math.abs(Math.atan2(dx, -dz));
      if (a < 0.4 || a > 2.75) continue;
      const side: 0 | 1 = dx >= 0 ? 1 : 0;
      const score = d + (s.reload[side] > 0 ? 6 : 0) + (f.kind === 'ghost' ? -3 : 0);
      if (score < bd) { bd = score; best = { id: f.id, side, x: c.x, z: c.z }; }
    }
    return best;
  }

  private fire(): void {
    const s = this.ship, sim = this.sim, st = sim.shipSt;
    const a = this.aim;
    let side: 0 | 1;
    let tx: number, tz: number, f: SeaFoe | undefined;
    if (a && s.reload[a.side] <= 0) {
      side = a.side;
      f = this.foes.find((o) => o.id === a.id);
      tx = a.x; tz = a.z;
    } else if (!a && (s.reload[0] <= 0 || s.reload[1] <= 0)) {
      // nothing in reach: a broadside into the sea on the loaded side (it still booms)
      side = s.reload[1] <= 0 ? 1 : 0;
      tx = s.x + (side ? 1 : -1) * 9; tz = s.z - 2;
    } else return;
    this.fireBuf = 0;
    const chain = this.powers.chain > 0, fire = this.powers.fire > 0;
    const n = chain ? 3 : 2;
    const sx = side ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const fx = s.x + sx * 1.6, fz = s.z + (i - (n - 1) / 2) * 1.8;
      const dist = Math.hypot(tx - fx, tz - fz);
      const dur = 0.42 + dist / 34;
      const lead = f && f.kind !== 'tentacle' ? 1 : 0;
      const spread = chain ? (i - 1) * 1.3 : (i - (n - 1) / 2) * 0.9;
      const ix = tx + (f ? f.vx : 0) * dur * lead + spread * 0.35, iz = tz + (f ? f.vz : 0) * dur * lead + spread;
      const dmg = st.dmg * (1 + 0.08 * this.lvl) * (fire ? 1.5 : 1);
      const tele = sim.addTele({ kind: 'circle', x: ix, z: iz, r: chain ? 1.6 : 1.45, dur, dmg, cause: 'cannon', knock: 0, friendly: true, owner: -1 });
      this.balls.push({ id: this.nextId++, kind: 'ball', friendly: true, x: fx, y: 1.2, z: fz, x0: fx, z0: fz, x1: ix, z1: iz, h: 2.2 + dist * 0.12, t: -i * 0.07, dur, tele, fire, chain });
    }
    s.reload[side] = st.reload * (this.powers.wind > 0 ? 0.85 : 1);
    sim.emit({ type: 'broadside', side: sx, x: s.x, z: s.z, n, fire, chain });
  }

  // ------------------------------------------------------------------ spawning

  private spawn(): void {
    const d = this.d;
    const ghost = this.foes.some((f) => f.kind === 'ghost' && f.state !== 'dead' && f.state !== 'gone');
    if (this.ghostAt > 0 && d >= this.ghostAt) { this.ghostAt = -1; this.spawnFoe('ghost', this.side() * 7, 62); }
    for (const p of this.plan) {
      if (p.done) continue;
      const ahead = p.kind === 'tentacle' ? this.tentacleLead() : p.kind === 'shark' ? 4 : 58;
      if (d + ahead < p.d) break;
      p.done = true;
      // while the ghost ship fights, only its own rowboats and the sea's loot come
      if (ghost && (p.kind === 'sloop' || p.kind === 'tentacle')) continue;
      switch (p.kind) {
        case 'rocks': this.spawnRocks(p.x, this.z0 - p.d); break;
        case 'barrel': case 'crate': case 'bottle': case 'chest': this.addFloat(p.kind, p.x, this.z0 - p.d); break;
        default: this.spawnFoe(p.kind, p.x, ahead); break;
      }
    }
  }

  /** How far ahead a tentacle rises so its slam lands where the ship will be. */
  private tentacleLead(): number { return this.ship.speed * (1.0 + this.sim.tl(1.25) + 0.15); }

  private spawnFoe(kind: SeaKind, x: number, ahead: number): SeaFoe {
    const s = this.ship, sim = this.sim, def = SEA_FOES[kind];
    const lvl = this.lvl, lap = Math.floor(this.dest / 5);
    const hp = Math.round(def.hp * (1 + 0.22 * lvl) * (1 + 0.35 * lap) * sim.tune.foeHp);
    const f: SeaFoe = {
      id: this.nextId++, kind, x, z: s.z - ahead, y: 0, vx: 0, vz: 0, face: 0, hp, maxHp: hp, r: def.r,
      dmg: def.dmg * (1 + 0.12 * lvl) * (1 + 0.15 * lap), state: 'move', t: 0, cd: this.R(1, 2), tele: -1, burn: 0, slow: 0, flash: 0, deadT: 0,
      side: Math.sign(x) || 1, ang: 0, passes: 0, bx: 0, bz: 0, yaw: 0, len: 0, pitch: 0, hitShip: false,
    };
    if (kind === 'tentacle') {
      f.bx = f.side * (SEA.lane + 0.6); f.bz = f.z; f.x = f.bx; f.len = 12.5;
      f.yaw = f.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      f.y = -f.len; f.state = 'rise'; f.cd = 0;
      sim.emit({ type: 'splash', x: f.bx, z: f.bz, big: true });
    } else if (kind === 'shark') {
      f.ang = f.side > 0 ? 0 : Math.PI;
      f.x = s.x + Math.cos(f.ang) * 7; f.z = s.z - 4;
      f.state = 'circle'; f.y = -0.55;
    } else if (kind === 'ghost') {
      f.state = 'rise'; f.face = Math.PI; f.y = -3;
      sim.emit({ type: 'ghost' });
    } else if (kind === 'sloop') f.face = Math.PI;
    else f.face = 0;
    this.foes.push(f);
    sim.emit({ type: 'seaSpawn', id: f.id, kind, x: f.x, z: f.z });
    return f;
  }

  private spawnRocks(cx: number, z: number): void {
    // one to three rocks across the lane, leaving a gap of at least 5 units somewhere
    const n = 1 + Math.floor(this.rnd() * (this.storm ? 3 : 2.4));
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = i === 0 ? cx : clamp(cx + this.side() * this.R(4.5, 8), -SEA.lane, SEA.lane);
      if (xs.some((o) => Math.abs(o - x) < 3.2)) continue;
      xs.push(x);
    }
    xs.sort((a, b) => a - b);
    const gaps = [xs[0] + SEA.lane, ...xs.slice(1).map((x, i) => x - xs[i]), SEA.lane - xs[xs.length - 1]];
    if (Math.max(...gaps) < 7) xs.pop();
    for (const x of xs) {
      const model = Math.floor(this.rnd() * 3);
      const s = this.R(0.42, 0.6);
      this.rocks.push({ id: this.nextId++, x, z: z + this.R(-2, 2), r: 1.15 + s * 1.3, model, rot: this.rnd() * 6.28, s, hitT: 0 });
    }
  }

  addFloat(kind: FloatKind, x: number, z: number, power: SeaPower | null = null): void {
    this.floats.push({ id: this.nextId++, kind, power: kind === 'bottle' ? power ?? this.randomPower() : kind === 'chest' ? power ?? this.randomPower() : null, x, z, t: 0, pull: false, spin: this.rnd() * 6.28 });
  }

  private randomPower(): SeaPower {
    const hull = this.ship.hull / this.sim.shipSt.maxHull;
    const w = SEA_POWER_WEIGHTS.map(([p, n]) => [p, p === 'mermaid' && hull < 0.5 ? n * 2 : n] as [SeaPower, number]);
    let r = this.rnd() * w.reduce((s, [, n]) => s + n, 0);
    for (const [p, n] of w) { r -= n; if (r <= 0) return p; }
    return 'wind';
  }

  // ------------------------------------------------------------------ foes

  private updateFoes(dt: number): void {
    const s = this.ship, sim = this.sim;
    const quiet = sim.phase !== 'sea';
    for (const f of this.foes) {
      f.t += dt;
      f.flash -= dt;
      if (f.state === 'dead') { f.deadT += dt; continue; }
      if (f.burn > 0) {
        f.burn -= dt;
        if (Math.floor((f.burn + dt) * 2) !== Math.floor(f.burn * 2)) this.hurtFoe(f, 5 + this.lvl, 'burn');
        if (f.state === 'dead') continue;
      }
      f.slow -= dt;
      const slowK = f.slow > 0 ? 0.5 : 1;
      f.cd -= dt * slowK;
      if (quiet && f.state !== 'leave' && f.state !== 'sink' && f.state !== 'gone') {
        // docking or sinking: the sea's foes give up
        if (f.tele >= 0) { sim.cancelTele(f.tele); f.tele = -1; }
        f.state = f.kind === 'tentacle' || f.kind === 'shark' ? 'sink' : 'leave'; f.t = 0;
      }
      const dz = f.z - s.z;
      switch (f.kind) {
        case 'rowboat': {
          if (f.state === 'leave') { f.y -= dt * 0.5; if (f.t > 2) f.state = 'gone'; break; }
          f.vz = 2.4 * slowK;
          const tx = s.x + (f.x >= s.x ? 1 : -1) * 3.6;
          f.vx = clamp((tx - f.x) * 0.6, -1.4, 1.4) * slowK;
          f.x += f.vx * dt; f.z += f.vz * dt;
          f.face = Math.atan2(f.vx, f.vz);
          if (f.state === 'throw' && f.t > 0.5) f.state = 'move';
          if (f.cd <= 0 && dz < -3 && dz > -17 && sim.phase === 'sea') {
            f.cd = this.R(2.6, 3.6);
            f.state = 'throw'; f.t = 0;
            this.lob('skull', f, 1.6, sim.tl(1.15), f.dmg);
          }
          // a rowboat rammed by the ship goes down
          if (this.hullDist(f.x, f.z) < f.r * 0.8 && sim.phase === 'sea') {
            this.hurtShip(5, 'rowboat', f.x, f.z);
            this.killFoe(f, true);
            sim.emit({ type: 'ram', x: f.x, z: f.z });
          }
          if (dz > 14) f.state = 'gone';
          break;
        }
        case 'sloop': case 'ghost': this.warship(f, dt, slowK); break;
        case 'tentacle': this.tentacle(f, dt); break;
        case 'shark': this.shark(f, dt, slowK); break;
      }
    }
  }

  /** Sloops and the ghost ship: close in, sail alongside for a cannon duel, then fall back. */
  private warship(f: SeaFoe, dt: number, slowK: number): void {
    const s = this.ship, sim = this.sim;
    const ghost = f.kind === 'ghost';
    const dz = f.z - s.z;
    switch (f.state) {
      case 'rise':
        f.y = -3 * Math.max(0, 1 - f.t / 2);
        f.vz = -s.speed * 0.6;
        if (f.t >= 2) { f.state = 'move'; f.y = 0; }
        break;
      case 'move':
        f.vz = -s.speed * (ghost ? 0.7 : 0.45);
        // it comes alongside on the open side of the lane (where there is room to see it)
        if (dz > -9) { f.state = 'duel'; f.t = 0; f.side = Math.abs(s.x) > 2 ? -Math.sign(s.x) : f.x >= s.x ? 1 : -1; f.cd = this.R(0.8, 1.6); }
        break;
      case 'duel': {
        const tz = s.z + (ghost ? -1.5 : 0.5) + Math.sin(f.t * 0.4) * 2;
        f.vz = -s.speed + clamp((tz - f.z) * 0.9, -3, 3);
        if (f.cd <= 0) {
          f.cd = ghost ? 3 : 3.3 + this.R(0, 0.6);
          const n = ghost ? 4 : 2 + (this.lvl >= 3 ? 1 : 0);
          for (let i = 0; i < n; i++) this.lob(ghost ? 'ghost' : 'ball', f, 1.85, sim.tl(1.35) + i * 0.16, f.dmg, i === 0 ? 0 : (i % 2 ? 1 : -1) * (1.6 + i * 0.9));
          sim.emit({ type: 'seaFire', id: f.id, kind: f.kind, x: f.x, z: f.z });
        }
        if (ghost && f.t > 7 && Math.floor((f.t - dt) / 8) !== Math.floor(f.t / 8)) this.spawnFoe('rowboat', clamp(s.x + this.side() * 4, -6, 6), 34);
        if (!ghost && f.t > 9) { f.state = 'leave'; f.t = 0; }
        break;
      }
      case 'leave':
        f.vz = -s.speed * 0.4;
        if (ghost) f.y -= dt * 1.2;
        if (dz > 22 || f.t > 6) f.state = 'gone';
        break;
    }
    // alongside, never on top of the ship: when the lane's edge is too close it crosses to the other side
    let tx = clamp(s.x + f.side * (ghost ? 5.8 : 5.2), -SEA.lane - 2, SEA.lane + 2);
    if (Math.abs(tx - s.x) < 4.5 && f.state === 'duel') { f.side = -f.side; tx = clamp(s.x + f.side * (ghost ? 5.8 : 5.2), -SEA.lane - 2, SEA.lane + 2); }
    if (f.state === 'duel' || f.state === 'leave') f.vx = clamp((tx - f.x) * 0.9, -3, 3);
    else f.vx = 0;
    f.x += f.vx * dt; f.z += f.vz * dt * (f.state === 'duel' ? 1 : slowK);
    f.face = Math.PI + Math.atan2(f.vx, 6) * 0.6;
  }

  /** Kraken tentacles: rise at the lane's edge, slam across it along a red lane, lie there, sink. */
  private tentacle(f: SeaFoe, dt: number): void {
    const sim = this.sim;
    const wind = sim.tl(1.25);
    f.x = f.bx; f.z = f.bz;
    switch (f.state) {
      case 'rise':
        f.y = -f.len * (1 - Math.min(1, f.t / 1));
        f.pitch = 0;
        if (f.t >= 1) {
          f.y = 0;
          if (sim.phase !== 'sea') { f.state = 'sink'; f.t = 0; break; }
          f.state = 'wind'; f.t = 0;
          f.tele = sim.addTele({ kind: 'line', x: f.bx, z: f.bz, len: f.len, w: 2.6, ang: f.yaw, dur: wind, dmg: f.dmg, cause: 'tentacle', knock: 0, owner: f.id });
        }
        break;
      case 'wind':
        f.pitch = 0.15 - Math.min(1, f.t / wind) * 0.45;
        if (f.t >= wind) { f.state = 'slam'; f.t = 0; f.tele = -1; }
        break;
      case 'slam':
        f.pitch = -0.3 + Math.min(1, f.t / 0.16) * (Math.PI / 2 + 0.3);
        if (f.t >= 0.16) {
          f.state = 'down'; f.t = 0;
          const c = this.aimPoint(f);
          sim.emit({ type: 'boom', x: c.x, z: c.z, r: 2, kind: 'slam' });
          sim.emit({ type: 'splash', x: c.x, z: c.z, big: true });
        }
        break;
      case 'down':
        f.pitch = Math.PI / 2;
        if (f.t >= 1.8) { f.state = 'lift'; f.t = 0; }
        break;
      case 'lift':
        f.pitch = Math.PI / 2 - Math.min(1, f.t / 0.6) * (Math.PI / 2 - 0.15);
        if (f.t >= 0.6) { f.state = 'sink'; f.t = 0; }
        break;
      case 'sink':
        f.y -= dt * 14;
        if (f.t >= 1) { f.state = 'gone'; sim.emit({ type: 'splash', x: f.bx, z: f.bz, big: false }); }
        break;
    }
  }

  /** Sharks: circle the ship, lunge at the hull along a red lane, dive, maybe come round again. */
  private shark(f: SeaFoe, dt: number, slowK: number): void {
    const s = this.ship, sim = this.sim;
    switch (f.state) {
      case 'circle': {
        f.ang += dt * 0.9 * f.side * slowK;
        const r = 7.2;
        const tx = s.x + Math.cos(f.ang) * r, tz = s.z + Math.sin(f.ang) * r * 0.8;
        const px = f.x, pz = f.z;
        f.x += (tx - f.x) * Math.min(1, dt * 2.5); f.z += (tz - f.z) * Math.min(1, dt * 2.5);
        f.vx = (f.x - px) / dt; f.vz = (f.z - pz) / dt;
        f.face = Math.atan2(f.vx, f.vz);
        f.y = -0.55;
        if (f.t > 2.2 && sim.phase === 'sea') {
          f.state = 'wind'; f.t = 0;
          const lead = sim.tl(0.85) + 0.35;
          const tx2 = s.x + s.vx * lead * 0.4, tz2 = s.z - s.speed * lead;
          f.face = Math.atan2(tx2 - f.x, tz2 - f.z);
          f.tele = sim.addTele({ kind: 'line', x: f.x, z: f.z, len: Math.hypot(tx2 - f.x, tz2 - f.z) + 3, w: 1.8, ang: f.face, dur: sim.tl(0.85), dmg: f.dmg, cause: 'shark', knock: 0, owner: f.id, lane: true });
        }
        break;
      }
      case 'wind': {
        // the shark keeps pace with the ship while it winds up
        f.z -= s.speed * dt;
        const T = sim.teles.find((x) => x.id === f.tele);
        if (T) { T.x = f.x; T.z = f.z; }
        f.y = -0.45 + Math.sin(f.t * 18) * 0.05;
        if (f.t >= sim.tl(0.85)) { f.state = 'lunge'; f.t = 0; f.hitShip = false; sim.emit({ type: 'lunge', x: f.x, z: f.z }); sim.emit({ type: 'splash', x: f.x, z: f.z, big: true }); }
        break;
      }
      case 'lunge': {
        const sp = 15;
        f.x += Math.sin(f.face) * sp * dt; f.z += Math.cos(f.face) * sp * dt - s.speed * dt * 0.5;
        f.y = Math.sin(Math.min(1, f.t / 0.7) * Math.PI) * 1.4;
        if (!f.hitShip && this.hullDist(f.x, f.z) < 0.9) { f.hitShip = true; this.hurtShip(f.dmg, 'shark', f.x, f.z); }
        if (f.t >= 0.7) {
          if (f.tele >= 0) sim.cancelTele(f.tele);
          f.tele = -1; f.state = 'dive'; f.t = 0;
          sim.emit({ type: 'splash', x: f.x, z: f.z, big: false });
        }
        break;
      }
      case 'dive':
        f.y -= dt * 2;
        f.z -= s.speed * dt;
        if (f.t >= 1.6) {
          f.passes++;
          if (f.passes >= 2 || sim.phase !== 'sea') f.state = 'gone';
          else { f.state = 'circle'; f.t = 0; f.ang = this.rnd() * 6.28; f.x = s.x + Math.cos(f.ang) * 7; f.z = s.z + Math.sin(f.ang) * 5.6; f.y = -0.55; }
        }
        break;
      case 'sink':
        f.y -= dt * 2;
        if (f.t > 1.5) f.state = 'gone';
        break;
    }
  }

  /** A foe's shot at the ship: a red circle where the ship will be, a ball (or skull) arcing to it. */
  private lob(kind: Ball['kind'], f: SeaFoe, r: number, dur: number, dmg: number, offZ = 0): void {
    const s = this.ship, sim = this.sim;
    const ix = s.x + s.vx * dur * 0.35 + this.R(-0.6, 0.6), iz = s.z - s.speed * dur + offZ;
    const tele = sim.addTele({ kind: 'circle', x: ix, z: iz, r, dur, dmg, cause: f.kind === 'ghost' ? 'cannon' : 'skull', knock: 0, owner: f.id, hitsFoes: false });
    const T = sim.teles.find((x) => x.id === tele);
    if (T) T.seaCause = f.kind;
    this.balls.push({ id: this.nextId++, kind, friendly: false, x: f.x, y: 1.6, z: f.z, x0: f.x, z0: f.z, x1: ix, z1: iz, h: kind === 'skull' ? 3.5 : 4.5, t: 0, dur, tele, fire: kind === 'ghost', chain: false });
  }

  private updateBalls(dt: number): void {
    for (const b of this.balls) {
      b.t += dt;
      if (b.t < 0) continue;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.x0 + (b.x1 - b.x0) * k; b.z = b.z0 + (b.z1 - b.z0) * k;
      b.y = 1.2 * (1 - k) + Math.sin(k * Math.PI) * b.h - 0.2 * k;
      if (k >= 1) {
        b.t = 99;
        this.sim.emit({ type: 'seaBoom', x: b.x, z: b.z, friendly: b.friendly, fire: b.fire, kind: b.kind });
      }
    }
    this.balls = this.balls.filter((b) => b.t < 50);
  }

  /** The red (and gold) warnings at sea: they resolve against the hull, or the foes for the player's own fire. */
  private updateTeles(dt: number): void {
    const sim = this.sim;
    const done: Tele[] = [];
    for (const T of sim.teles) { T.t += dt; if (T.t >= T.dur) done.push(T); }
    if (!done.length) return;
    sim.teles = sim.teles.filter((t) => t.t < t.dur);
    for (const T of done) {
      if (T.lane) continue;
      if (T.friendly) {
        for (const f of this.foes) {
          if (!this.targetable(f)) continue;
          const c = this.aimPoint(f);
          const hitR = f.kind === 'tentacle' && f.state === 'down' ? 1.2 : f.r;
          let hit = Math.hypot(c.x - T.x, c.z - T.z) < T.r + hitR;
          if (!hit && f.kind === 'tentacle' && f.state === 'down') {
            // a slammed tentacle lies across the water: anywhere along it counts
            const ux = Math.sin(f.yaw), uz = Math.cos(f.yaw);
            const u = clamp((T.x - f.bx) * ux + (T.z - f.bz) * uz, 0, f.len);
            hit = Math.hypot(f.bx + ux * u - T.x, f.bz + uz * u - T.z) < T.r + 1;
          }
          if (!hit) continue;
          this.hurtFoe(f, T.dmg * (f.kind === 'tentacle' && f.state === 'down' ? 1.6 : 1), 'ball');
          if (this.powers.fire > 0 && f.state !== 'dead') f.burn = 3;
          if (this.powers.chain > 0) f.slow = 2.5;
        }
      } else if (this.shipIn(T)) {
        this.hurtShip(T.dmg, (T.seaCause ?? (T.cause === 'tentacle' ? 'tentacle' : 'sloop')) as SeaCause, T.x, T.z);
      } else this.sim.emit({ type: 'miss', x: T.x, z: T.z });
    }
  }

  /** Distance from a point to the hull's keel circles (negative inside). */
  hullDist(x: number, z: number): number {
    const s = this.ship;
    let bd = 1e9;
    for (const u of HULL_PTS) {
      const hx = s.x + Math.sin(s.yaw) * u, hz = s.z - Math.cos(s.yaw) * u;
      bd = Math.min(bd, Math.hypot(x - hx, z - hz) - HULL_R);
    }
    return bd;
  }

  /** Whether a telegraph's area touches the hull. */
  shipIn(T: Tele): boolean {
    const s = this.ship;
    for (const u of HULL_PTS) if (this.sim.inTele(T, s.x + Math.sin(s.yaw) * u, s.z - Math.cos(s.yaw) * u, HULL_R * 0.85)) return true;
    return false;
  }

  hurtShip(dmg: number, cause: SeaCause, x: number, z: number): void {
    const s = this.ship, sim = this.sim;
    if (s.invuln > 0 || s.sunk || sim.phase !== 'sea') return;
    const n = Math.max(1, Math.round(dmg * sim.tune.seaHurt));
    s.hull -= n;
    s.invuln = 0.45;
    sim.emit({ type: 'hullHit', dmg: n, cause, x, z });
    if (s.hull <= 0) {
      s.hull = 0;
      s.sunk = true;
      s.t = 0;
      sim.teles = sim.teles.filter((t) => t.friendly);
      sim.sink(cause);
    }
  }

  hurtFoe(f: SeaFoe, dmg: number, src: 'ball' | 'burn'): void {
    if (f.state === 'dead') return;
    const n = Math.max(1, Math.round(dmg));
    f.hp -= n;
    f.flash = 0.12;
    const c = this.aimPoint(f);
    this.sim.emit({ type: 'seaHit', id: f.id, kind: f.kind, x: c.x, z: c.z, dmg: n, src });
    if (f.hp <= 0) this.killFoe(f, true);
  }

  private killFoe(f: SeaFoe, reward: boolean): void {
    const sim = this.sim;
    f.hp = 0; f.state = 'dead'; f.deadT = 0;
    if (f.tele >= 0) sim.cancelTele(f.tele);
    f.tele = -1;
    const c = this.aimPoint(f);
    if (reward) {
      sim.kills++;
      this.sunkFoes++;
      const def = SEA_FOES[f.kind];
      sim.score += Math.round(def.score * (1 + Math.floor(this.dest / 5) * 0.5));
      // the wreck leaves loot afloat where it went down
      if (f.kind === 'ghost') {
        this.addFloat('chest', c.x, c.z);
        this.addFloat('bottle', c.x - 2, c.z + 1.5);
        this.addFloat('barrel', c.x + 2, c.z - 1.5);
        sim.score += 1500;
      } else if (f.kind === 'sloop') {
        this.addFloat('barrel', c.x - 1, c.z);
        if (this.rnd() < 0.3 + this.sim.shipSt.luck) this.addFloat('bottle', c.x + 1.2, c.z + 1);
      } else if (f.kind !== 'shark' && this.rnd() < 0.3 + this.sim.shipSt.luck * 0.5) this.addFloat('barrel', c.x, c.z);
    }
    sim.emit({ type: 'seaKill', id: f.id, kind: f.kind, x: c.x, z: c.z });
  }

  // ------------------------------------------------------------------ loot afloat and rocks

  private updateFloats(dt: number): void {
    const s = this.ship, sim = this.sim, st = sim.shipSt;
    for (const fl of this.floats) {
      fl.t += dt;
      if (s.sunk) continue;
      const d = this.hullDist(fl.x, fl.z);
      if (d < st.net * 1.7 || fl.pull) {
        fl.pull = true;
        const tx = s.x, tz = s.z;
        const dx = tx - fl.x, dz = tz - fl.z, dd = Math.hypot(dx, dz) || 1;
        const v = 5 + fl.t * 0.5;
        fl.x += dx / dd * Math.min(dd, v * dt); fl.z += dz / dd * Math.min(dd, v * dt) - s.speed * dt * 0.8;
      }
      if (d < st.net) { fl.t = -99; this.collect(fl); }
    }
  }

  private collect(fl: Float): void {
    const sim = this.sim, st = sim.shipSt, s = this.ship;
    const loot = (this.storm ? 1.2 : 1) * (1 + st.luck);
    switch (fl.kind) {
      case 'barrel': {
        const v = Math.max(1, Math.round((4 + this.lvl) * loot * sim.st.gold));
        sim.addGold(v);
        this.salvaged += v;
        sim.emit({ type: 'float', kind: 'barrel', value: v, x: fl.x, z: fl.z });
        break;
      }
      case 'crate': {
        const n = Math.min(st.maxHull - s.hull, Math.round(st.maxHull * 0.12));
        s.hull += n;
        const v = Math.max(1, Math.round(3 * loot * sim.st.gold));
        sim.addGold(v);
        this.salvaged += v;
        sim.emit({ type: 'float', kind: 'crate', value: v, repair: n, x: fl.x, z: fl.z });
        break;
      }
      case 'chest': {
        const v = Math.max(1, Math.round((16 + this.lvl * 5) * loot * sim.st.gold));
        sim.addGold(v);
        this.salvaged += v;
        sim.score += 200;
        sim.emit({ type: 'float', kind: 'chest', value: v, x: fl.x, z: fl.z });
        this.givePower(fl.power ?? this.randomPower());
        break;
      }
      case 'bottle':
        sim.emit({ type: 'float', kind: 'bottle', value: 0, x: fl.x, z: fl.z });
        this.givePower(fl.power ?? this.randomPower());
        break;
    }
  }

  givePower(k: SeaPower): void {
    const s = this.ship, st = this.sim.shipSt;
    this.powers[k] = Math.max(this.powers[k], SEA_POWER_TIME[k]);
    if (k === 'mermaid') {
      const n = Math.min(st.maxHull - s.hull, Math.round(st.maxHull * MERMAID.now));
      s.hull += n;
    }
    this.sim.emit({ type: 'seaPower', power: k });
  }

  private updateRocks(dt: number): void {
    const s = this.ship;
    for (const r of this.rocks) {
      r.hitT -= dt;
      if (r.hitT > 0) continue;
      if (this.hullDist(r.x, r.z) < r.r) {
        r.hitT = 1.2;
        const dir = s.x >= r.x ? 1 : -1;
        s.vx = dir * 7;
        s.x += dir * 0.4;
        this.sim.emit({ type: 'rockHit', x: (s.x + r.x) / 2, z: r.z });
        this.hurtShip(SEA.rock * (1 + 0.1 * this.lvl), 'rock', r.x, r.z);
      }
    }
  }

  // ------------------------------------------------------------------ test hooks

  testSpawn(kind: SeaKind, x: number, ahead: number): SeaFoe { return this.spawnFoe(kind, x, ahead); }
  testRocks(x: number, ahead: number): void { this.spawnRocks(x, this.ship.z - ahead); }

  // ------------------------------------------------------------------ the end of a leg

  private startDock(): void {
    const sim = this.sim;
    sim.teles = sim.teles.filter((t) => t.friendly);
    this.ship.t = 0;
    this.jumpT = -1;
    sim.dockPhase();
  }

  /** Brings the ship in to its spot off the beach, then the hero jumps ashore. */
  private dock(dt: number): void {
    const s = this.ship;
    s.x += (0 - s.x) * Math.min(1, dt * 1.4);
    s.vx = 0;
    const left = s.z - this.dockZ;
    s.speed = Math.max(0, Math.min(s.speed, left * 1.7 + 0.6));
    s.z = Math.max(this.dockZ, s.z - s.speed * dt);
    s.yaw *= 1 - Math.min(1, dt * 3);
    s.roll *= 1 - Math.min(1, dt * 3);
    if (left < 0.08) {
      s.t += dt;
      if (s.t >= 0.35 && this.jumpT < 0) { this.jumpT = 0; this.sim.emit({ type: 'jumpAshore' }); }
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT >= 0.8) this.sim.landFromSea();
    }
  }
}
