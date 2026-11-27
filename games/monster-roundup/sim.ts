// Monster Roundup: the simulation, at a fixed 60 Hz, with no three.js and no Phaser (the view draws it,
// the autopilot and the headless checks drive it).
//   - The mech walks (sprints while DASH is held, on an energy bar), shoots its own weapon (a tap: the
//     quick shot; held: the charged one), tows dizzy monsters on its tractor beam and banks them in a
//     containment pod's ring (or the boss's field), uses the carried power. The four mechs: Mike's
//     twin blaster (the quickest bolts), Leela's charge beam (charged: a beam through every monster
//     in line), Stan's spread shot (three short pellets; charged: a stun pulse all round him) and
//     George's plasma lobber (a slow ball that splashes; charged: a shell lobbed onto the target).
//   - Monsters (the pack's legged Big set) wander, flee, hop, leap, eat snacks and grow toward
//     evolving; each family has its trick: hoppers hop, leapers jump so high quick bolts glance off,
//     runners outrun a walking mech, the caller spooks the room, the splitter falls into two small
//     ones, the blinker vanishes when hit, the spiky one hurts to touch, brutes punch (a short,
//     readable wind-up), the lobber throws orbs from afar (a ring where they land), the spore monster
//     puffs a cloud that slows the mech. An evolved monster is bigger and tougher and goes for the mech.
//   - The station: doors that open for the mech, locked doors and their terminal, laser gates on a
//     cycle, sweeping laser turrets, conveyor belts, ice, vents monsters hide in, teleporter pads,
//     crates and chests with powers, snacks.
//   - Bosses: three phases, each a stun bar to empty; between phases the boss is dazed, after the last
//     it is dizzy and heavy to tow into its field. Attacks: slam, leap, spike volley, spike ring,
//     charge (dazed when it hits a wall), lob, summon, blink and a sweeping beam, each telegraphed.
import {
  BLOCK, CELL, MECH, TUNING, MONSTERS, AIR_HIGH, LOBBER, SPORE, EVOLVE_RATE, EVOLVE_SNACK, EVOLVED, BOSSES, BOSS_DAZE, BOSS_DIZZY_LAST, BOSS_TOW,
  POWER_IDS, POWER_TIME, POWER, RANK, MECHS, SCORE, CREDITS, PULSE_R, SPLASH_R, SHELL_R, LANCE,
  type Tuning, type MonsterId, type MonsterDef, type BossId, type BossAttack, type PowerId, type Ranks, type MechId, type MechDef, type WeaponKind,
} from './defs';
import { solidBlock, charAt, type Level, type Pt } from './levels';

export interface Input {
  /** Move, world axes (x east, z south), -1..1. */
  mx: number;
  mz: number;
  /** STUN held (a tap fires a quick bolt on release; held past the charge, a charged one). */
  stun: boolean;
  /** TOW pressed this step (grab the nearest dizzy monster, or drop the last one). */
  tow: boolean;
  /** POWER pressed this step. */
  power: boolean;
  /** DASH held (sprint). */
  dash: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, stun: false, tow: false, power: false, dash: false };

export type MonState = 'wander' | 'flee' | 'eat' | 'chase' | 'windup' | 'recover' | 'dizzy' | 'towed' | 'captured' | 'vent' | 'blink' | 'evolve' | 'lure' | 'gone'
  | 'b-idle' | 'b-windup' | 'b-act' | 'b-daze' | 'b-roar';

export interface Mon {
  i: number;
  kind: MonsterId | null;
  boss: BossId | null;
  def: MonsterDef | null;
  x: number; z: number; y: number;
  vx: number; vz: number;
  yaw: number;
  radius: number;
  height: number;
  hp: number; maxHp: number;
  state: MonState;
  t: number;
  dizzy: number;
  dizzyMax: number;
  evolved: boolean;
  evolveK: number;
  warned: boolean;
  small: boolean;
  hurtT: number;
  sinceHit: number;
  regenT: number;
  alert: number;
  hopT: number;
  dir: number;
  dirT: number;
  /** A leaper's clock: counts up to its next jump; `air` is the time left in the air. */
  leap: number;
  air: number;
  /** What a wind-up ends in: a bite, a lobbed orb or a spore cloud. */
  act: 'bite' | 'lob' | 'spore';
  attackCd: number;
  callCd: number;
  blinkCd: number;
  teleCd: number;
  /** Captured: where it flies to. */
  to: Pt | null;
  minion: boolean;
  // the boss
  phase: number;
  bar: number;
  barMax: number;
  attack: BossAttack | null;
  attackI: number;
  nextAttack: number;
  aim: Pt;
  from: Pt;
  aimYaw: number;
  wakes: number;
  /** A boss that ran into a wall stands dazed this long (free hits). */
  stun: number;
}

/** A shot in flight: a bolt (Mike, Leela), a pellet (Stan) or a plasma ball that splashes (George). */
export interface Bolt { x: number; z: number; vx: number; vz: number; life: number; charged: boolean; hit: number[]; arc: boolean; dmg: number; splash: number; kind: 'bolt' | 'pellet' | 'plasma' }
/** George's charged shell, lobbed onto a spot. */
export interface Shell { x: number; z: number; fx: number; fz: number; t: number; total: number; dmg: number }
/** Leela's beam, drawn for a moment. */
export interface Lance { ax: number; az: number; bx: number; bz: number; t: number }
/** The spore monster's cloud: the mech walks slowly inside it. */
export interface Cloud { x: number; z: number; r: number; t: number; max: number }
export interface Shot { x: number; z: number; y: number; vx: number; vz: number; life: number; kind: 'spike' | 'orb' }
export interface Lob { x: number; z: number; fx: number; fz: number; t: number; total: number; kind: 'ice' | 'orb' }
export interface Wave { x: number; z: number; r: number; max: number; speed: number; hit: boolean; color: 'boss' | 'freeze' | 'pulse' }
export interface IcePatch { x: number; z: number; r: number; t: number }
export interface DoorS { open: number; locked: boolean }
export interface Snack { x: number; z: number; on: boolean; t: number }
export interface Crate { x: number; z: number; hp: number; broken: boolean; t: number }
export interface Pickup { x: number; z: number; id: PowerId; on: boolean; t: number }

export type SimEvent =
  | { e: 'shot'; x: number; z: number; charged: boolean; spread: boolean; weapon: WeaponKind }
  | { e: 'lance'; ax: number; az: number; bx: number; bz: number; hits: number }
  | { e: 'pulse'; x: number; z: number; hits: number }
  | { e: 'shell'; x: number; z: number; hits: number }
  | { e: 'splash'; x: number; z: number }
  | { e: 'leap'; i: number; x: number; z: number }
  | { e: 'throw'; i: number; x: number; z: number }
  | { e: 'spore'; i: number; x: number; z: number }
  | { e: 'hit'; i: number; x: number; z: number; y: number; glance: boolean; charged: boolean }
  | { e: 'dizzy'; i: number; x: number; z: number }
  | { e: 'wake'; i: number; x: number; z: number; free: boolean }
  | { e: 'grab'; i: number; x: number; z: number }
  | { e: 'drop'; i: number }
  | { e: 'full' }
  | { e: 'heavy' }
  | { e: 'capture'; i: number; x: number; z: number; pts: number; combo: number; boss: boolean }
  | { e: 'split'; i: number; x: number; z: number }
  | { e: 'blink'; i: number; fx: number; fz: number; x: number; z: number }
  | { e: 'evolveWarn'; i: number }
  | { e: 'evolve'; i: number; x: number; z: number }
  | { e: 'eat'; i: number; x: number; z: number }
  | { e: 'snack'; x: number; z: number }
  | { e: 'hurt'; by: string; x: number; z: number }
  | { e: 'shielded'; x: number; z: number }
  | { e: 'squawk'; i: number; x: number; z: number }
  | { e: 'vent'; i: number; x: number; z: number; out: boolean }
  | { e: 'tele'; x: number; z: number; tx: number; tz: number }
  | { e: 'door'; i: number; open: boolean }
  | { e: 'unlock'; x: number; z: number }
  | { e: 'crate'; x: number; z: number; broken: boolean }
  | { e: 'pickup'; id: PowerId; x: number; z: number }
  | { e: 'handsFull' }
  | { e: 'use'; id: PowerId }
  | { e: 'powerEnd'; id: PowerId }
  | { e: 'freeze'; x: number; z: number }
  | { e: 'attack'; i: number; x: number; z: number }
  | { e: 'bite'; i: number }
  | { e: 'bossWindup'; attack: BossAttack }
  | { e: 'bossAttack'; attack: BossAttack; x: number; z: number }
  | { e: 'bossLand'; x: number; z: number }
  | { e: 'bossThud'; x: number; z: number }
  | { e: 'bossDaze'; phase: number }
  | { e: 'bossPhase'; phase: number }
  | { e: 'bossDizzy' }
  | { e: 'summon'; x: number; z: number }
  | { e: 'lobLand'; x: number; z: number; kind: 'ice' | 'orb' }
  | { e: 'exitOpen' }
  | { e: 'clear'; x: number; z: number }
  | { e: 'die' };

export interface MechS {
  id: MechId;
  x: number; z: number;
  vx: number; vz: number;
  yaw: number;
  hp: number; max: number;
  safe: number;
  energy: number; emax: number;
  sprint: boolean;
  tired: number;
  charge: number;
  stunWas: boolean;
  fireCd: number;
  shootT: number;
  hitT: number;
  grabT: number;
  towing: Mon[];
  power: PowerId | null;
  active: Record<PowerId, number>;
  decoy: Pt | null;
  state: 'play' | 'dead' | 'clear';
  teleCd: number;
  term: number;
  speed: number;
  moving: number;
  onIce: boolean;
  /** The target the blaster locks on while STUN is held. */
  lock: Mon | null;
  lockT: number;
  /** Mike's twin blaster: the arm the next bolt leaves from (±1). */
  side: number;
  /** In a spore cloud this step. */
  inCloud: boolean;
}

const rnd = (seed: number) => { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/** The distance from p to the segment a–b. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const k = L2 ? clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}

export const POD_R = 2.3;
export const FIELD_R = 3.3;
const DOOR_NEAR = 3.8;
const TERMINAL_R = 2.1;
const TERMINAL_TIME = 1.1;
const SNACK_BACK = 24;
const CONVEYOR = 3.2;
/** The Alien's beam: half the wedge it sweeps (radians) and the sweep's seconds. */
export const BEAM = { amp: 0.5, time: 1.3 };
/** A spike volley's spread between two spikes (radians): wide enough to stand between two lines. */
export const VOLLEY_GAP = 0.3;
/** How close an enemy shot must pass to hit the mech (its body, not its arms). */
export const SHOT_HIT = MECH.radius * 0.75 + 0.3;

export class Sim {
  readonly tune: Tuning;
  readonly mech: MechS;
  mons: Mon[] = [];
  bolts: Bolt[] = [];
  shells: Shell[] = [];
  lances: Lance[] = [];
  clouds: Cloud[] = [];
  shots: Shot[] = [];
  lobs: Lob[] = [];
  waves: Wave[] = [];
  ice: IcePatch[] = [];
  doors: DoorS[];
  snacks: Snack[];
  crates: Crate[];
  pickups: Pickup[] = [];
  turretA: number[];
  events: SimEvent[] = [];
  clock = 0;
  points = 0;
  combo = 1;
  comboT = 0;
  captured = 0;
  exitOpen = false;
  unlocked = false;
  god = false;
  /** Seconds since every monster was banked (the level ends a moment later). */
  allT = -1;
  stats = { time: 0, captures: 0, evolved: 0, hurt: 0, snacks: 0, credits: 0, shots: 0, best: 1 };
  readonly rand: () => number;
  private grid: Uint8Array;
  private iceCells: Uint8Array;
  readonly cols: number;
  readonly rows: number;
  readonly md: MechDef;

  constructor(readonly c: Level, readonly ranks: Ranks, readonly easy: boolean, readonly mechId: MechId = 'mike', seed = 1) {
    this.tune = TUNING[easy ? 'easy' : 'normal'];
    this.rand = rnd(c.n * 7919 + seed * 104729);
    this.cols = c.cols * 2; this.rows = c.rows * 2;
    const md = this.md = MECHS[mechId];
    const hull = this.tune.hull + ranks.hull + md.hull;
    const emax = MECH.energy * RANK.energy[ranks.thrusters] * md.energy;
    this.mech = {
      id: mechId, x: c.start.x, z: c.start.z, vx: 0, vz: 0, yaw: Math.PI, hp: hull, max: hull, safe: 0, energy: emax, emax, sprint: false, tired: 0,
      charge: 0, stunWas: false, fireCd: 0, shootT: 0, hitT: 0, grabT: 0, towing: [], power: null, active: { freeze: 0, shield: 0, spread: 0, magnet: 0, decoy: 0 },
      decoy: null, state: 'play', teleCd: 0, term: 0, speed: 0, moving: 0, onIce: false, lock: null, lockT: 0, side: 1, inCloud: false,
    };
    // the fine grid: 0 floor, 1 solid
    this.grid = new Uint8Array(this.cols * this.rows);
    this.iceCells = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) for (let q = 0; q < this.cols; q++) {
      const bc = q >> 1, br = r >> 1;
      this.grid[r * this.cols + q] = solidBlock(c, bc, br) ? 1 : 0;
      if (charAt(c, bc, br) === 'i') this.iceCells[r * this.cols + q] = 1;
    }
    this.doors = c.doors.map((d) => ({ open: 0, locked: d.locked }));
    this.snacks = c.snacks.map((p) => ({ x: p.x, z: p.z, on: true, t: 0 }));
    this.crates = c.crates.map((p) => ({ x: p.x, z: p.z, hp: 2, broken: false, t: 0 }));
    for (const p of c.powers) this.pickups.push({ x: p.x, z: p.z, id: POWER_IDS[Math.floor(this.rand() * POWER_IDS.length)], on: true, t: 0 });
    for (const p of c.chests) this.pickups.push({ x: p.x, z: p.z, id: POWER_IDS[Math.floor(this.rand() * POWER_IDS.length)], on: true, t: 0 });
    this.turretA = c.turrets.map((_, i) => i * 2.1);
    for (const sp of c.spawns) this.addMon(sp.id, sp.x + (this.rand() - 0.5) * 1.5, sp.z + (this.rand() - 0.5) * 1.5);
    if (c.boss) this.addBoss(c.boss.id, c.boss.x, c.boss.z);
    if (ranks.cells >= 2) this.mech.power = POWER_IDS[Math.floor(this.rand() * POWER_IDS.length)];
  }

  // ---------------------------------------------------------------- set-up

  private blank(i: number): Mon {
    return {
      i, kind: null, boss: null, def: null, x: 0, z: 0, y: 0, vx: 0, vz: 0, yaw: 0, radius: 0.5, height: 1, hp: 1, maxHp: 1, state: 'wander', t: 0, dizzy: 0, dizzyMax: 1,
      evolved: false, evolveK: 0, warned: false, small: false, hurtT: 0, sinceHit: 99, regenT: 0, alert: 0, hopT: 0, dir: 0, dirT: 0, leap: 0, air: 0, act: 'bite', attackCd: 1, callCd: 0,
      blinkCd: 0, teleCd: 0, to: null, minion: false, phase: 0, bar: 0, barMax: 0, attack: null, attackI: 0, nextAttack: 2, aim: { x: 0, z: 0 }, from: { x: 0, z: 0 }, aimYaw: 0, wakes: 0, stun: 0,
    };
  }

  addMon(id: MonsterId, x: number, z: number, o: { small?: boolean; minion?: boolean } = {}): Mon {
    const d = MONSTERS[id];
    const m = this.blank(this.mons.length);
    m.kind = id; m.def = d; m.x = x; m.z = z;
    m.small = !!o.small; m.minion = !!o.minion;
    m.radius = d.radius * (m.small ? 0.7 : 1);
    m.height = d.height * (m.small ? 0.7 : 1);
    m.maxHp = m.hp = m.small ? 1 : d.hp;
    m.y = 0;
    m.dir = this.rand() * Math.PI * 2;
    m.yaw = m.dir;
    m.dirT = 1 + this.rand() * 2;
    m.leap = this.rand() * 1.5;
    m.attackCd = 1.5 + this.rand() * 2;
    m.evolveK = this.rand() * 0.15;
    this.mons.push(m);
    return m;
  }

  private addBoss(id: BossId, x: number, z: number): void {
    const d = BOSSES[id];
    const m = this.blank(this.mons.length);
    m.boss = id; m.x = x; m.z = z; m.radius = d.radius; m.height = d.height;
    m.barMax = m.bar = d.bar[0] * this.tune.bossBar;
    m.hp = m.maxHp = 1;
    m.state = 'b-idle';
    m.nextAttack = 2.5;
    m.yaw = 0;
    this.mons.push(m);
  }

  /** How many monsters the mech can tow at once. */
  get towCap(): number { return RANK.tows[this.ranks.beam] + this.md.tows; }
  get grabR(): number { return MECH.grab * RANK.grab[this.ranks.beam]; }
  get dizzyTime(): number { return this.tune.dizzy * RANK.dizzy[this.ranks.stasis] * this.md.dizzy; }
  get chargeTime(): number { return this.md.charge * (this.ranks.blaster >= 3 ? 0.5 : 1); }
  /** Daze points of a charged shot (Blaster II: one more). */
  get bigDmg(): number { return this.md.big + (this.ranks.blaster >= 2 ? 1 : 0); }
  /** How far the quick shot reaches (m). */
  get reach(): number { return this.md.reach; }
  get boss(): Mon | null { return this.mons.find((m) => m.boss) ?? null; }
  /** Monsters still loose (not banked, not minions). */
  get left(): number { return this.c.total - this.captured; }

  stars(): boolean[] {
    return [this.captured >= this.c.total, this.stats.hurt === 0, this.stats.time <= this.c.par];
  }

  // ---------------------------------------------------------------- the grid

  solidAt(x: number, z: number): boolean {
    const q = Math.floor(x / CELL), r = Math.floor(z / CELL);
    if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) return true;
    return this.grid[r * this.cols + q] === 1;
  }

  iceAt(x: number, z: number): boolean {
    const q = Math.floor(x / CELL), r = Math.floor(z / CELL);
    if (q >= 0 && r >= 0 && q < this.cols && r < this.rows && this.iceCells[r * this.cols + q]) return true;
    for (const p of this.ice) if (Math.hypot(x - p.x, z - p.z) < p.r) return true;
    return false;
  }

  laserOn(i: number): boolean {
    const T = this.tune.laserOn + this.tune.laserOff;
    return ((this.clock + i * 0.9) % T) < this.tune.laserOn;
  }

  /** A laser gate's beam as a segment. */
  laserSeg(i: number): [number, number, number, number] {
    const l = this.c.lasers[i], h = BLOCK / 2;
    return l.axis === 'x' ? [l.x, l.z - h, l.x, l.z + h] : [l.x - h, l.z, l.x + h, l.z];
  }

  /** A sweeping turret's beam end (it stops at walls). */
  turretEnd(i: number): [number, number] {
    const t = this.c.turrets[i], a = this.turretA[i];
    const dx = Math.sin(a), dz = Math.cos(a);
    let d = 1.2;
    while (d < 11 && !this.solidAt(t.x + dx * d, t.z + dz * d)) d += 0.25;
    return [t.x + dx * d, t.z + dz * d];
  }

  /** Closed doors as boxes (a door lets things through once it is mostly open). */
  private doorBox(i: number): [number, number, number, number] | null {
    if (this.doors[i].open > 0.75) return null;
    const d = this.c.doors[i], h = BLOCK / 2;
    return d.axis === 'x' ? [d.x - 0.3, d.z - h, d.x + 0.3, d.z + h] : [d.x - h, d.z - 0.3, d.x + h, d.z + 0.3];
  }

  /** Solid round props: pods, terminals, turrets, the exit's frame, chests. */
  private props(): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const p of this.c.pods) out.push([p.x, p.z, 0.95]);
    for (const p of this.c.terminals) out.push([p.x, p.z, 0.55]);
    for (const p of this.c.turrets) out.push([p.x, p.z, 1.05]);
    for (const p of this.c.decor) out.push([p.x, p.z, p.r]);
    return out;
  }
  private propCache: [number, number, number][] | null = null;

  /** Pushes a circle out of walls, closed doors, stacks, crates and props. Returns true when it touched anything. */
  collide(o: { x: number; z: number }, r: number, laserWall = false): boolean {
    let touched = false;
    // a centre inside a wall (a knock-back, a teleport, a test drop): out to the nearest open floor
    // first, so the face-by-face pushes below cannot bounce it between two solid cells
    if (this.solidAt(o.x, o.z)) {
      touched = true;
      let found = false;
      for (let rad = 0.25; rad <= 6 && !found; rad += 0.25) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2, x = o.x + Math.sin(a) * rad, z = o.z + Math.cos(a) * rad;
          if (!this.solidAt(x, z)) { o.x = x; o.z = z; found = true; break; }
        }
      }
    }
    const boxes: [number, number, number, number][] = [];
    const q0 = Math.floor((o.x - r) / CELL) - 1, q1 = Math.floor((o.x + r) / CELL) + 1;
    const r0 = Math.floor((o.z - r) / CELL) - 1, r1 = Math.floor((o.z + r) / CELL) + 1;
    for (let rr = r0; rr <= r1; rr++) for (let q = q0; q <= q1; q++) {
      if (q < 0 || rr < 0 || q >= this.cols || rr >= this.rows || this.grid[rr * this.cols + q]) boxes.push([q * CELL, rr * CELL, (q + 1) * CELL, (rr + 1) * CELL]);
    }
    for (let i = 0; i < this.doors.length; i++) { const b = this.doorBox(i); if (b && Math.abs(this.c.doors[i].x - o.x) < 5 && Math.abs(this.c.doors[i].z - o.z) < 5) boxes.push(b); }
    for (const s of this.c.stacks) if (Math.abs(s.x - o.x) < 4 && Math.abs(s.z - o.z) < 4) boxes.push([s.x - 1.25, s.z - 1.25, s.x + 1.25, s.z + 1.25]);
    for (const c of this.crates) if (!c.broken && Math.abs(c.x - o.x) < 3 && Math.abs(c.z - o.z) < 3) boxes.push([c.x - 0.5, c.z - 0.5, c.x + 0.5, c.z + 0.5]);
    if (laserWall) for (let i = 0; i < this.c.lasers.length; i++) if (this.laserOn(i)) {
      const [ax, az, bx, bz] = this.laserSeg(i);
      boxes.push([Math.min(ax, bx) - 0.25, Math.min(az, bz) - 0.25, Math.max(ax, bx) + 0.25, Math.max(az, bz) + 0.25]);
    }
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const [x0, z0, x1, z1] of boxes) {
        const cx = clamp(o.x, x0, x1), cz = clamp(o.z, z0, z1);
        let dx = o.x - cx, dz = o.z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        touched = true; moved = true;
        if (d < 1e-6) {
          // the centre is inside the box: out through the nearest face
          const l = o.x - x0, rr = x1 - o.x, t = o.z - z0, b = z1 - o.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) o.x = x0 - r; else if (m === rr) o.x = x1 + r; else if (m === t) o.z = z0 - r; else o.z = z1 + r;
          continue;
        }
        dx /= d; dz /= d;
        o.x = cx + dx * r; o.z = cz + dz * r;
      }
      for (const [px, pz, pr] of (this.propCache ??= this.props())) {
        const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz), need = pr + r;
        if (d >= need) continue;
        touched = true; moved = true;
        if (d < 1e-6) { o.x = px + need; continue; }
        o.x = px + (dx / d) * need; o.z = pz + (dz / d) * need;
      }
      if (!moved) break;
    }
    // still squeezed (a pocket between a prop and two walls has no room for this body): the nearest
    // spot where it fits, so no position can hold it
    if (touched && !this.fits(o.x, o.z, r, boxes)) {
      for (let rad = 0.2; rad <= 4; rad += 0.2) {
        let done = false;
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2, x = o.x + Math.sin(a) * rad, z = o.z + Math.cos(a) * rad;
          if (this.fits(x, z, r, boxes)) { o.x = x; o.z = z; done = true; break; }
        }
        if (done) break;
      }
    }
    return touched;
  }

  /** No overlap with the given boxes, the walls or the round props (a small tolerance). */
  private fits(x: number, z: number, r: number, boxes: [number, number, number, number][]): boolean {
    const rr = r - 0.03;
    if (this.solidAt(x, z)) return false;
    for (const [x0, z0, x1, z1] of boxes) if (Math.hypot(x - Math.max(x0, Math.min(x1, x)), z - Math.max(z0, Math.min(z1, z))) < rr) return false;
    for (let q = Math.floor((x - r) / CELL); q <= Math.floor((x + r) / CELL); q++) for (let w = Math.floor((z - r) / CELL); w <= Math.floor((z + r) / CELL); w++) {
      if (q >= 0 && w >= 0 && q < this.cols && w < this.rows && !this.grid[w * this.cols + q]) continue;
      if (Math.hypot(x - Math.max(q * CELL, Math.min((q + 1) * CELL, x)), z - Math.max(w * CELL, Math.min((w + 1) * CELL, z))) < rr) return false;
    }
    for (const [px, pz, pr] of (this.propCache ??= this.props())) if (Math.hypot(x - px, z - pz) < pr + rr) return false;
    return true;
  }

  /** A straight line between two points crosses no wall or closed door (sampled). */
  clearLine(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      if (this.solidAt(x, z)) return false;
      for (let i = 0; i < this.doors.length; i++) {
        if (this.doors[i].open > 0.75) continue;
        const dd = this.c.doors[i];
        if (Math.abs(x - dd.x) < 2 && Math.abs(z - dd.z) < 2) return false;
      }
      for (const s of this.c.stacks) if (Math.abs(x - s.x) < 1.25 && Math.abs(z - s.z) < 1.25) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    const v = this.mech;
    if (v.state === 'play') { this.clock += dt; this.stats.time += dt; } else this.clock += dt;
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 1;
    this.stepWorld(dt);
    if (v.state === 'play') this.stepMech(dt, inp);
    else { v.vx *= 0.9; v.vz *= 0.9; v.moving = 0; }
    for (const m of this.mons) if (m.state !== 'gone') { if (m.boss) this.stepBoss(m, dt); else this.stepMon(m, dt); }
    this.separate();
    this.stepBolts(dt);
    this.stepShots(dt);
    this.stepCaptures(dt);
    if (v.state === 'play') this.checkEnd(dt);
  }

  private emit(e: SimEvent): void { this.events.push(e); }

  private stepWorld(dt: number): void {
    const v = this.mech;
    // doors open for the mech (unless locked), and close when it has gone
    this.c.doors.forEach((d, i) => {
      const s = this.doors[i];
      const near = !s.locked && Math.hypot(v.x - d.x, v.z - d.z) < DOOR_NEAR;
      const was = s.open > 0.5;
      // a door never shuts on a monster in its frame
      const blocked = this.mons.some((m) => m.state !== 'gone' && m.state !== 'captured' && Math.abs(m.x - d.x) < 2.2 && Math.abs(m.z - d.z) < 2.2);
      s.open = clamp(s.open + (near || (blocked && s.open > 0.3) ? dt * 2.6 : -dt * 1.6), 0, 1);
      if (was !== s.open > 0.5) this.emit({ e: 'door', i, open: s.open > 0.5 });
    });
    // the terminal: stand at it for a moment
    if (!this.unlocked && this.c.terminals.length) {
      const near = this.c.terminals.some((t) => Math.hypot(v.x - t.x, v.z - t.z) < TERMINAL_R);
      v.term = near ? v.term + dt : Math.max(0, v.term - dt * 2);
      if (v.term >= TERMINAL_TIME) {
        this.unlocked = true;
        v.term = 0;
        for (const s of this.doors) s.locked = false;
        const t = this.c.terminals[0];
        this.emit({ e: 'unlock', x: t.x, z: t.z });
      }
    }
    // turrets sweep
    for (let i = 0; i < this.turretA.length; i++) this.turretA[i] += (this.tune.sweep * Math.PI / 180) * dt * (i % 2 ? -1 : 1);
    // snacks come back; crates' debris settles
    for (const s of this.snacks) if (!s.on) { s.t -= dt; if (s.t <= 0) s.on = true; }
    for (const p of this.pickups) if (!p.on && p.t > 0) { p.t -= dt; if (p.t <= 0) p.on = true; }
    for (let k = this.ice.length - 1; k >= 0; k--) { this.ice[k].t -= dt; if (this.ice[k].t <= 0) this.ice.splice(k, 1); }
    for (let k = this.clouds.length - 1; k >= 0; k--) { this.clouds[k].t -= dt; if (this.clouds[k].t <= 0) this.clouds.splice(k, 1); }
    for (let k = this.lances.length - 1; k >= 0; k--) { this.lances[k].t -= dt; if (this.lances[k].t <= 0) this.lances.splice(k, 1); }
    // shockwaves spread
    for (let k = this.waves.length - 1; k >= 0; k--) {
      const w = this.waves[k];
      w.r += w.speed * dt;
      if (w.color === 'boss' && !w.hit && v.state === 'play') {
        const d = Math.hypot(v.x - w.x, v.z - w.z);
        if (Math.abs(d - w.r) < 0.9) { w.hit = true; this.hurt(1, 'wave', w.x, w.z); }
      }
      if (w.r >= w.max) this.waves.splice(k, 1);
    }
  }

  // ---------------------------------------------------------------- the mech

  private stepMech(dt: number, inp: Input): void {
    const v = this.mech, md = this.md;
    v.safe = Math.max(0, v.safe - dt);
    v.teleCd = Math.max(0, v.teleCd - dt);
    v.fireCd = Math.max(0, v.fireCd - dt);
    v.shootT = Math.max(0, v.shootT - dt);
    v.hitT = Math.max(0, v.hitT - dt);
    v.grabT = Math.max(0, v.grabT - dt);
    for (const id of POWER_IDS) if (v.active[id] > 0) { v.active[id] -= dt; if (v.active[id] <= 0) { v.active[id] = 0; if (id === 'decoy') v.decoy = null; this.emit({ e: 'powerEnd', id }); } }
    // move: walk by default, sprint while DASH is held and there is energy
    let mx = inp.mx, mz = inp.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const want = Math.min(1, len);
    v.tired = Math.max(0, v.tired - dt);
    v.sprint = inp.dash && want > 0.2 && v.energy > 0 && v.tired <= 0;
    if (v.sprint) {
      v.energy = Math.max(0, v.energy - MECH.drain * dt);
      if (v.energy <= 0) v.tired = 0.8;
      v.term = 0;
    } else if (v.tired <= 0 || !inp.dash) {
      v.energy = Math.min(v.emax, v.energy + MECH.refill * md.refill * RANK.refill[this.ranks.thrusters] * dt * (inp.dash ? 0 : 1));
    }
    const boss = v.towing.some((m) => m.boss);
    const slow = boss ? BOSS_TOW : 1 - md.towSlow * v.towing.length;
    const charging = v.charge > 0.15;
    v.inCloud = this.clouds.some((c) => Math.hypot(v.x - c.x, v.z - c.z) < c.r);
    const top = (v.sprint ? MECH.sprint : MECH.walk) * md.speed * slow * (charging ? 0.8 : 1) * (v.inCloud ? SPORE.slow : 1);
    v.onIce = this.iceAt(v.x, v.z);
    const acc = v.onIce ? MECH.iceAccel : MECH.accel;
    const k = 1 - Math.exp(-acc * dt);
    v.vx += (mx * top * want - v.vx) * k;
    v.vz += (mz * top * want - v.vz) * k;
    // conveyors
    const cv = this.conveyorAt(v.x, v.z);
    const px = v.x, pz = v.z;
    v.x += (v.vx + cv[0] * CONVEYOR) * dt;
    v.z += (v.vz + cv[1] * CONVEYOR) * dt;
    this.collide(v, MECH.radius);
    v.speed = Math.hypot(v.x - px, v.z - pz) / dt;
    v.moving = want;
    // facing: the stick, or the locked target while STUN is held (the mech aims as it charges)
    if (inp.stun) {
      v.lockT -= dt;
      if (v.lockT <= 0) { v.lock = this.aimTarget(); v.lockT = 0.12; }
      if (v.lock && !this.shootable(v.lock)) v.lock = null;
    } else v.lock = null;
    if (v.lock) v.yaw += angDiff(v.yaw, Math.atan2(v.lock.x - v.x, v.lock.z - v.z)) * Math.min(1, dt * 16);
    else if (want > 0.2 && v.shootT <= 0) v.yaw += angDiff(v.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 14);
    // the stun blaster: a tap fires on release; held past the charge, a charged bolt
    if (inp.stun) v.charge += dt;
    if (!inp.stun && v.stunWas) {
      const charged = v.charge >= this.chargeTime;
      if (charged || v.fireCd <= 0) this.fire(charged);
      v.charge = 0;
    }
    if (!inp.stun) v.charge = 0;
    v.stunWas = inp.stun;
    // the tractor beam
    if (inp.tow) this.towPress();
    // the magnet: dizzy monsters nearby drift to the mech and onto the beam (two more than it can tow)
    if (v.active.magnet > 0) for (const m of this.mons) {
      if (m.state !== 'dizzy' || m.boss) continue;
      const dx = v.x - m.x, dz = v.z - m.z, d = Math.hypot(dx, dz);
      if (d > POWER.magnetR) continue;
      if (d < this.grabR && v.towing.length < this.towCap + 2) { m.state = 'towed'; v.towing.push(m); this.emit({ e: 'grab', i: m.i, x: m.x, z: m.z }); continue; }
      m.x += (dx / d) * 6 * dt; m.z += (dz / d) * 6 * dt;
      this.collide(m, m.radius);
    }
    // the power
    if (inp.power) this.usePower();
    // snacks: the mech takes them (the monsters can't eat them then)
    for (const s of this.snacks) if (s.on && Math.hypot(v.x - s.x, v.z - s.z) < 1.4) {
      s.on = false; s.t = SNACK_BACK;
      this.points += SCORE.snack; this.stats.snacks++; this.stats.credits += CREDITS.snack;
      this.emit({ e: 'snack', x: s.x, z: s.z });
    }
    // pick-ups
    for (const p of this.pickups) if (p.on && Math.hypot(v.x - p.x, v.z - p.z) < 1.5) {
      if (v.power) { if (p.t > -1) { p.t = -1.5; this.emit({ e: 'handsFull' }); } continue; }
      p.on = false; p.t = 0;
      v.power = p.id;
      this.emit({ e: 'pickup', id: p.id, x: p.x, z: p.z });
    }
    for (const p of this.pickups) if (p.on && p.t < 0 && Math.hypot(v.x - p.x, v.z - p.z) > 2.5) p.t = 0;
    // teleporter pads
    if (v.teleCd <= 0) for (const t of this.c.teles) {
      if (t.to < 0 || Math.hypot(v.x - t.x, v.z - t.z) > 1.1) continue;
      const to = this.c.teles[t.to];
      const fx = v.x, fz = v.z;
      v.x = to.x + Math.sin(v.yaw) * 1.6; v.z = to.z + Math.cos(v.yaw) * 1.6;
      this.collide(v, MECH.radius);
      v.teleCd = 1.6;
      for (const m of v.towing) { m.x = to.x; m.z = to.z; }
      this.emit({ e: 'tele', x: fx, z: fz, tx: to.x, tz: to.z });
      break;
    }
    // hazards: laser gates and sweeping turrets
    for (let i = 0; i < this.c.lasers.length; i++) {
      if (!this.laserOn(i)) continue;
      const [ax, az, bx, bz] = this.laserSeg(i);
      if (segDist(v.x, v.z, ax, az, bx, bz) < MECH.radius + 0.1) this.hurt(1, 'laser', (ax + bx) / 2, (az + bz) / 2);
    }
    for (let i = 0; i < this.c.turrets.length; i++) {
      const t = this.c.turrets[i], [ex, ez] = this.turretEnd(i);
      if (segDist(v.x, v.z, t.x, t.z, ex, ez) < MECH.radius + 0.1) this.hurt(1, 'turret', v.x - (ex - t.x) * 0.05, v.z - (ez - t.z) * 0.05);
    }
    // the exit
    if (this.exitOpen && this.c.exit && Math.hypot(v.x - this.c.exit.x, v.z - this.c.exit.z) < 1.6) this.finish();
  }

  conveyorAt(x: number, z: number): [number, number] {
    const c = Math.floor(x / BLOCK), r = Math.floor(z / BLOCK);
    for (const cv of this.c.conveyors) if (cv.c === c && cv.r === r) return [cv.dx, cv.dz];
    return [0, 0];
  }

  /** The best monster to aim at: in the cone ahead, in reach, in sight. */
  aimTarget(): Mon | null {
    const v = this.mech;
    let best: Mon | null = null, bs = Infinity;
    for (const m of this.mons) {
      if (!this.shootable(m)) continue;
      const dx = m.x - v.x, dz = m.z - v.z, d = Math.hypot(dx, dz);
      if (d > Math.max(this.reach, 10) + 2 || d < 0.1) continue;
      const a = Math.abs(angDiff(v.yaw, Math.atan2(dx, dz)));
      // the cone ahead first; a big target (a boss) or one close by is found further round
      const wide = m.boss || d < 6;
      if (a > (wide ? 1.75 : MECH.cone) && d > 2.2) continue;
      if (!this.clearLine(v.x, v.z, m.x, m.z)) continue;
      const sc = d * (1 + a * 1.5) + (m.state === 'flee' ? 0 : 0.5) + (a > MECH.cone ? 8 : 0);
      if (sc < bs) { bs = sc; best = m; }
    }
    return best;
  }

  shootable(m: Mon): boolean {
    return m.state !== 'gone' && m.state !== 'captured' && m.state !== 'dizzy' && m.state !== 'towed' && m.state !== 'vent' && m.state !== 'blink' && m.state !== 'b-daze' && m.state !== 'evolve';
  }

  /** Where to aim at a target: a shot this fast meets it there (a lead on its walk). */
  private leadOn(tg: Mon, speed: number): [number, number] {
    const v = this.mech, d = Math.hypot(tg.x - v.x, tg.z - v.z), k = Math.min(0.8, d / speed);
    return [tg.x + tg.vx * k, tg.z + tg.vz * k];
  }

  private fire(charged: boolean): void {
    const v = this.mech, md = this.md, w = md.weapon;
    const tg = v.lock && this.shootable(v.lock) ? v.lock : this.aimTarget();
    const speed = charged && w === 'mortar' ? 14 : md.bolt;
    let aim: [number, number] | null = tg ? this.leadOn(tg, speed) : null;
    if (aim) v.yaw = Math.atan2(aim[0] - v.x, aim[1] - v.z);
    v.fireCd = md.gap * RANK.fireGap[this.ranks.blaster];
    v.shootT = 0.32;
    const spread = v.active.spread > 0;
    this.stats.shots++;
    this.emit({ e: 'shot', x: v.x, z: v.z, charged, spread, weapon: w });
    const bolt = (a: number, o: Partial<Bolt> & { dmg: number }, off = 0) => {
      const ox = Math.cos(a) * off, oz = -Math.sin(a) * off;
      const sp = o.charged ? 24 : md.bolt;
      const reach = o.charged ? 13 : md.reach;
      this.bolts.push({ x: v.x + Math.sin(a) * 0.9 + ox, z: v.z + Math.cos(a) * 0.9 + oz, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, life: reach / sp, charged: !!o.charged, hit: [], arc: false, splash: 0, kind: 'bolt', ...o });
    };
    if (!charged) {
      const dirs = spread ? [-0.24, 0, 0.24] : [0];
      for (const da of dirs) {
        const a = v.yaw + da;
        if (w === 'twin') bolt(a, { dmg: md.dmg }, 0.55 * v.side);
        else if (w === 'lance') bolt(a, { dmg: md.dmg });
        else if (w === 'scatter') for (const f of [-0.2, 0, 0.2]) bolt(a + f, { dmg: md.dmg, kind: 'pellet' });
        else bolt(a, { dmg: md.dmg, kind: 'plasma', splash: SPLASH_R });
      }
      v.side = -v.side;
      return;
    }
    const big = this.bigDmg;
    if (w === 'twin') { for (const da of spread ? [-0.24, 0, 0.24] : [0]) bolt(v.yaw + da, { dmg: big, charged: true }); return; }
    if (w === 'lance') { this.lance(big); return; }
    if (w === 'scatter') { this.pulse(big); return; }
    // the mortar: a shell onto the target (or ahead)
    if (!aim) aim = [v.x + Math.sin(v.yaw) * 9, v.z + Math.cos(v.yaw) * 9];
    let [tx, tz] = aim;
    const d = Math.hypot(tx - v.x, tz - v.z);
    if (d > 13) { tx = v.x + ((tx - v.x) / d) * 13; tz = v.z + ((tz - v.z) / d) * 13; }
    this.shells.push({ x: tx, z: tz, fx: v.x, fz: v.z, t: 0, total: 0.45 + Math.min(13, d) * 0.03, dmg: big });
    if (spread) for (const sg of [-1, 1]) {
      const a = v.yaw + sg * 0.5, r = Math.min(9, d);
      this.shells.push({ x: v.x + Math.sin(a) * r, z: v.z + Math.cos(a) * r, fx: v.x, fz: v.z, t: 0, total: 0.5 + r * 0.03, dmg: big });
    }
  }

  /** Leela's charged beam: through every monster along the facing, up to a wall, a closed door or a stack. */
  private lance(dmg: number): void {
    const v = this.mech, dx = Math.sin(v.yaw), dz = Math.cos(v.yaw);
    let d = 1;
    while (d < LANCE.reach && !this.solidAt(v.x + dx * d, v.z + dz * d) && this.clearLine(v.x, v.z, v.x + dx * d, v.z + dz * d)) d += 0.3;
    const ax = v.x + dx * 0.9, az = v.z + dz * 0.9, bx = v.x + dx * d, bz = v.z + dz * d;
    let hits = 0;
    for (const m of this.mons) {
      if (!this.shootable(m)) continue;
      if (segDist(m.x, m.z, ax, az, bx, bz) > m.radius + LANCE.half) continue;
      hits++;
      if (m.boss) this.bossHit(m, dmg, true); else this.daze(m, dmg, true);
    }
    for (const c of this.crates) if (!c.broken && segDist(c.x, c.z, ax, az, bx, bz) < 0.9) this.breakCrate(c);
    this.lances.push({ ax, az, bx, bz, t: 0.3 });
    this.emit({ e: 'lance', ax, az, bx, bz, hits });
  }

  /** Stan's charged pulse: every monster round him in sight. */
  private pulse(dmg: number): void {
    const v = this.mech;
    let hits = 0;
    for (const m of this.mons) {
      if (!this.shootable(m)) continue;
      if (Math.hypot(m.x - v.x, m.z - v.z) > PULSE_R + m.radius || !this.clearLine(v.x, v.z, m.x, m.z)) continue;
      hits++;
      if (m.boss) this.bossHit(m, dmg, true); else this.daze(m, dmg, true);
    }
    for (const c of this.crates) if (!c.broken && Math.hypot(c.x - v.x, c.z - v.z) < PULSE_R) { c.hp -= 1; if (c.hp <= 0) this.breakCrate(c); }
    this.waves.push({ x: v.x, z: v.z, r: 0.6, max: PULSE_R, speed: 26, hit: true, color: 'pulse' });
    this.emit({ e: 'pulse', x: v.x, z: v.z, hits });
  }

  /** A splash (a plasma ball, a shell) dazes every monster in reach but the ones already hit. */
  private splash(x: number, z: number, r: number, dmg: number, skip: number[], charged: boolean): number {
    let hits = 0;
    for (const m of this.mons) {
      if (!this.shootable(m) || skip.includes(m.i)) continue;
      if (Math.hypot(m.x - x, m.z - z) > r + m.radius * 0.6) continue;
      hits++;
      if (m.boss) this.bossHit(m, dmg, charged); else this.daze(m, dmg, charged);
    }
    return hits;
  }

  private stepBolts(dt: number): void {
    for (let k = this.bolts.length - 1; k >= 0; k--) {
      const b = this.bolts[k];
      b.life -= dt;
      const n = 3;
      let dead = b.life <= 0;
      for (let s = 0; s < n && !dead; s++) {
        b.x += (b.vx * dt) / n; b.z += (b.vz * dt) / n;
        if (this.solidAt(b.x, b.z)) { dead = true; if (b.kind === 'plasma') this.plasmaPop(b, []); break; }
        // doors and stacks stop bolts
        for (let i = 0; i < this.doors.length && !dead; i++) {
          if (this.doors[i].open > 0.75) continue;
          const d = this.c.doors[i];
          if (Math.abs(b.x - d.x) < (d.axis === 'x' ? 0.4 : 2) && Math.abs(b.z - d.z) < (d.axis === 'x' ? 2 : 0.4)) dead = true;
        }
        for (const st of this.c.stacks) if (Math.abs(b.x - st.x) < 1.3 && Math.abs(b.z - st.z) < 1.3) dead = true;
        // crates
        for (const c of this.crates) if (!c.broken && Math.abs(b.x - c.x) < 0.6 && Math.abs(b.z - c.z) < 0.6) {
          dead = true;
          c.hp -= b.charged || b.kind === 'plasma' ? 2 : 1;
          if (c.hp <= 0) this.breakCrate(c);
          else this.emit({ e: 'crate', x: c.x, z: c.z, broken: false });
        }
        if (dead) break;
        for (const m of this.mons) {
          if (!this.shootable(m) || b.hit.includes(m.i)) continue;
          if (Math.hypot(b.x - m.x, b.z - m.z) > m.radius + (b.charged ? 0.6 : b.kind === 'plasma' ? 0.45 : 0.3)) continue;
          b.hit.push(m.i);
          const landed = this.boltHit(m, b);
          if (landed && b.kind === 'plasma') this.plasmaPop(b, [m.i]);
          dead = true;
          break;
        }
      }
      if (dead) { if (b.kind === 'plasma' && b.life <= 0 && !b.hit.length) this.plasmaPop(b, []); this.bolts.splice(k, 1); }
    }
    // George's shells
    for (let k = this.shells.length - 1; k >= 0; k--) {
      const sh = this.shells[k];
      sh.t += dt;
      if (sh.t < sh.total) continue;
      this.shells.splice(k, 1);
      const hits = this.splash(sh.x, sh.z, SHELL_R, sh.dmg, [], true);
      for (const c of this.crates) if (!c.broken && Math.hypot(c.x - sh.x, c.z - sh.z) < SHELL_R) this.breakCrate(c);
      this.emit({ e: 'shell', x: sh.x, z: sh.z, hits });
    }
  }

  /** A plasma ball bursts: a small splash round where it ended. */
  private plasmaPop(b: Bolt, skip: number[]): void {
    this.splash(b.x, b.z, b.splash, 1, skip, false);
    this.emit({ e: 'splash', x: b.x, z: b.z });
  }

  private breakCrate(c: Crate): void {
    c.broken = true;
    this.points += SCORE.crate;
    this.emit({ e: 'crate', x: c.x, z: c.z, broken: true });
    this.pickups.push({ x: c.x, z: c.z, id: POWER_IDS[Math.floor(this.rand() * POWER_IDS.length)], on: true, t: 0 });
  }

  /** A shot meets a monster. Returns false when it glanced off (a leaper in the air, a quick shot). */
  private boltHit(m: Mon, b: Bolt): boolean {
    if (m.boss) { this.bossHit(m, b.dmg, b.charged); return true; }
    // a leaper in the air shrugs off a quick shot
    if (m.def!.kind === 'leaper' && m.y > AIR_HIGH && !b.charged) {
      this.emit({ e: 'hit', i: m.i, x: m.x, z: m.z, y: m.y, glance: true, charged: false });
      if (m.state !== 'flee') { m.state = 'flee'; m.alert = 2; }
      return false;
    }
    this.daze(m, b.dmg, b.charged);
    // blaster III: the hit arcs to the next monster
    if (this.ranks.blaster >= 3 && !b.arc) {
      let best: Mon | null = null, bd = 6.5;
      for (const o of this.mons) {
        if (o === m || !this.shootable(o) || o.boss) continue;
        const d = Math.hypot(o.x - m.x, o.z - m.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        const a = Math.atan2(best.x - m.x, best.z - m.z);
        this.bolts.push({ x: m.x, z: m.z, vx: Math.sin(a) * 24, vz: Math.cos(a) * 24, life: 0.4, charged: false, hit: [m.i], arc: true, dmg: 1, splash: 0, kind: 'bolt' });
      }
    }
    return true;
  }

  /** Daze points off a monster: at zero it goes dizzy (a big fish splits; a ninja blinks away when it is not). */
  daze(m: Mon, dmg: number, charged: boolean): void {
    const d = m.def!;
    m.hp -= dmg;
    m.hurtT = 0.25;
    m.sinceHit = 0;
    m.regenT = 0;
    this.emit({ e: 'hit', i: m.i, x: m.x, z: m.z, y: m.y, glance: false, charged });
    if (d.kind === 'caller' && m.callCd <= 0) this.squawk(m);
    if (m.hp <= 0) {
      if (d.kind === 'splitter' && !m.small && !m.evolved) { this.split(m); return; }
      this.makeDizzy(m);
      return;
    }
    if (d.kind === 'blinker' && m.blinkCd <= 0) { m.state = 'blink'; m.t = 0; m.blinkCd = 2.6; return; }
    // the spore monster answers a hit with a cloud when it can
    if (d.kind === 'spore' && m.attackCd <= 0 && m.state !== 'windup') { m.state = 'windup'; m.act = 'spore'; m.t = 0; this.emit({ e: 'attack', i: m.i, x: m.x, z: m.z }); return; }
    if (m.state === 'windup') return;
    m.state = d.bites || m.evolved ? m.state : 'flee';
    m.alert = Math.max(m.alert, 2.5);
  }

  private makeDizzy(m: Mon): void {
    m.hp = 0;
    m.air = 0;
    m.state = 'dizzy';
    m.dizzyMax = m.dizzy = this.dizzyTime * (m.small ? 1.1 : 1);
    m.vx = m.vz = 0;
    m.t = 0;
    this.emit({ e: 'dizzy', i: m.i, x: m.x, z: m.z });
  }

  private split(m: Mon): void {
    m.state = 'gone';
    for (const s of [-1, 1]) {
      const a = m.yaw + s * Math.PI / 2;
      const c = this.addMon(m.kind!, m.x + Math.sin(a) * 0.9, m.z + Math.cos(a) * 0.9, { small: true });
      this.collide(c, c.radius);
      c.dir = a; c.state = 'flee'; c.alert = 2; c.evolveK = m.evolveK;
      c.vx = Math.sin(a) * 5; c.vz = Math.cos(a) * 5;
    }
    this.emit({ e: 'split', i: m.i, x: m.x, z: m.z });
  }

  private squawk(m: Mon): void {
    m.callCd = 9;
    for (const o of this.mons) if (!o.boss && o !== m && this.loose(o) && Math.hypot(o.x - m.x, o.z - m.z) < 13) { o.alert = 4.5; if (o.state === 'wander' || o.state === 'eat') o.state = 'flee'; }
    m.alert = 4.5;
    this.emit({ e: 'squawk', i: m.i, x: m.x, z: m.z });
  }

  loose(m: Mon): boolean { return m.state !== 'gone' && m.state !== 'captured' && m.state !== 'dizzy' && m.state !== 'towed' && m.state !== 'vent'; }

  private towPress(): void {
    const v = this.mech;
    // grab the nearest dizzy monster in reach
    let best: Mon | null = null, bd = this.grabR;
    for (const m of this.mons) {
      if (m.state !== 'dizzy' || v.towing.includes(m)) continue;
      const d = Math.hypot(m.x - v.x, m.z - v.z) - m.radius;
      if (d < bd) { bd = d; best = m; }
    }
    if (best) {
      if (best.boss && v.towing.length) { this.emit({ e: 'heavy' }); return; }
      if (v.towing.some((m) => m.boss)) { this.emit({ e: 'heavy' }); return; }
      if (v.towing.length >= this.towCap && !best.boss) { this.emit({ e: 'full' }); return; }
      best.state = 'towed';
      v.towing.push(best);
      v.grabT = 0.5;
      this.emit({ e: 'grab', i: best.i, x: best.x, z: best.z });
      return;
    }
    if (v.towing.length) {
      const m = v.towing.pop()!;
      m.state = 'dizzy';
      m.y = 0;
      this.emit({ e: 'drop', i: m.i });
    }
  }

  private usePower(): void {
    const v = this.mech, id = v.power;
    if (!id) return;
    v.power = null;
    const k = RANK.cells[this.ranks.cells];
    this.emit({ e: 'use', id });
    if (id === 'freeze') {
      for (const m of this.mons) {
        if (!this.shootable(m) || Math.hypot(m.x - v.x, m.z - v.z) > POWER.freezeR) continue;
        if (m.boss) this.bossHit(m, m.barMax * 0.4, true);
        else { m.y = 0; this.makeDizzy(m); }
      }
      this.waves.push({ x: v.x, z: v.z, r: 0.5, max: POWER.freezeR, speed: 22, hit: true, color: 'freeze' });
      this.emit({ e: 'freeze', x: v.x, z: v.z });
      return;
    }
    v.active[id] = POWER_TIME[id] * k;
    if (id === 'decoy') v.decoy = { x: v.x + Math.sin(v.yaw) * 2.5, z: v.z + Math.cos(v.yaw) * 2.5 };
    if (v.decoy) this.collide(v.decoy, 0.4);
  }

  /** Damage to the mech (none while safe, shielded or in god mode). */
  hurt(n: number, by: string, fx: number, fz: number, force = false): void {
    const v = this.mech;
    if (v.state !== 'play') return;
    if (!force && (v.safe > 0 || this.god)) return;
    if (!force && v.active.shield > 0) { this.emit({ e: 'shielded', x: v.x, z: v.z }); v.safe = 0.5; this.knock(fx, fz, 0.6); return; }
    v.hp -= n;
    v.safe = MECH.safe;
    v.hitT = 0.4;
    v.charge = 0;
    this.stats.hurt += n;
    this.knock(fx, fz, 1);
    this.emit({ e: 'hurt', by, x: v.x, z: v.z });
    if (v.hp <= 0) {
      v.hp = 0;
      v.state = 'dead';
      for (const m of v.towing) m.state = 'dizzy';
      v.towing = [];
      this.emit({ e: 'die' });
    }
  }

  private knock(fx: number, fz: number, k: number): void {
    const v = this.mech;
    let dx = v.x - fx, dz = v.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    v.vx = dx * MECH.knock * k; v.vz = dz * MECH.knock * k;
  }

  // ---------------------------------------------------------------- monsters

  private speedOf(m: Mon, fleeing: boolean): number {
    const d = m.def!;
    return (fleeing ? d.flee : d.speed) * this.tune.speed * (m.evolved ? EVOLVED.speed : 1) * (m.small ? 1.15 : 1);
  }

  /** Seconds a monster's wind-up lasts (its telegraph) before the bite, the throw or the cloud. */
  windupTime(m: Mon): number {
    const base = m.act === 'lob' ? LOBBER.windup : m.act === 'spore' ? SPORE.windup : 0.55;
    return base * this.tune.windup;
  }

  /** Does this monster go for the mech? */
  biter(m: Mon): boolean { return !!m.def && (m.def.bites || m.evolved); }

  private stepMon(m: Mon, dt: number): void {
    const v = this.mech, d = m.def!;
    m.t += dt;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.attackCd = Math.max(0, m.attackCd - dt);
    m.callCd = Math.max(0, m.callCd - dt);
    m.blinkCd = Math.max(0, m.blinkCd - dt);
    m.teleCd = Math.max(0, m.teleCd - dt);
    m.alert = Math.max(0, m.alert - dt);
    m.sinceHit += dt;
    const dx = v.x - m.x, dz = v.z - m.z, dist = Math.hypot(dx, dz);
    switch (m.state) {
      case 'captured': return;
      case 'dizzy': {
        m.vx *= 0.85; m.vz *= 0.85;
        m.y = Math.max(0, m.y - dt * 4);
        m.dizzy -= dt;
        if (m.dizzy <= 0) this.wake(m, false);
        this.moveMon(m, dt, false);
        return;
      }
      case 'towed': {
        const slot = v.towing.indexOf(m);
        if (slot < 0) { m.state = 'dizzy'; return; }
        m.dizzy -= dt * (this.ranks.beam >= 3 ? 0 : this.tune.towClock);
        if (m.dizzy <= 0) { v.towing.splice(slot, 1); this.wake(m, true); return; }
        const gap = MECH.towGap + (m.boss ? 1.4 : 0) + m.radius;
        const tx = v.x - Math.sin(v.yaw) * gap * (slot + 1), tz = v.z - Math.cos(v.yaw) * gap * (slot + 1);
        const k = 1 - Math.exp(-6 * dt);
        m.x += (tx - m.x) * k; m.z += (tz - m.z) * k;
        m.y += (0.9 + Math.sin(this.clock * 3 + slot) * 0.15 - m.y) * k;
        this.collide(m, m.radius * 0.8);
        m.yaw += dt * 1.2;
        return;
      }
      case 'vent': {
        if (m.t > 1.7) {
          const vents = this.c.vents.filter((p) => Math.hypot(p.x - m.x, p.z - m.z) > 3);
          const to = vents.length ? vents[Math.floor(this.rand() * vents.length)] : { x: m.x, z: m.z };
          m.x = to.x; m.z = to.z; m.state = 'flee'; m.t = 0; m.alert = 1.5; m.teleCd = 4;
          this.emit({ e: 'vent', i: m.i, x: m.x, z: m.z, out: true });
        }
        return;
      }
      case 'blink': {
        // a short duck, then gone
        m.vx *= 0.7; m.vz *= 0.7;
        if (m.t >= 0.3) {
          const fx = m.x, fz = m.z;
          for (let tries = 0; tries < 30; tries++) {
            const a = this.rand() * Math.PI * 2, r = 6 + this.rand() * 4;
            const x = m.x + Math.sin(a) * r, z = m.z + Math.cos(a) * r;
            if (this.solidAt(x, z) || !this.clearLine(m.x, m.z, x, z) || Math.hypot(x - v.x, z - v.z) < 4) continue;
            m.x = x; m.z = z;
            break;
          }
          this.collide(m, m.radius);
          m.state = 'flee'; m.t = 0; m.alert = 2;
          this.emit({ e: 'blink', i: m.i, fx, fz, x: m.x, z: m.z });
        }
        return;
      }
      case 'evolve': {
        if (m.t > 1.2) { m.state = 'wander'; m.t = 0; }
        return;
      }
      case 'windup': {
        m.vx *= 0.8; m.vz *= 0.8;
        m.y = Math.max(0, m.y - dt * 6);
        m.yaw += angDiff(m.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
        if (m.t >= this.windupTime(m)) {
          if (m.act === 'lob') {
            // the orb lands where the mech is heading (an evolved lobber throws two)
            const lead = 0.6;
            this.lobs.push({ x: v.x + v.vx * lead, z: v.z + v.vz * lead, fx: m.x, fz: m.z, t: 0, total: LOBBER.flight / this.tune.bossShot, kind: 'orb' });
            if (m.evolved) { const a = Math.atan2(dx, dz) + Math.PI / 2; this.lobs.push({ x: v.x + Math.sin(a) * 2.4, z: v.z + Math.cos(a) * 2.4, fx: m.x, fz: m.z, t: 0, total: LOBBER.flight * 1.15 / this.tune.bossShot, kind: 'orb' }); }
            this.emit({ e: 'throw', i: m.i, x: m.x, z: m.z });
            m.attackCd = LOBBER.gap * this.tune.windup;
          } else if (m.act === 'spore') {
            this.clouds.push({ x: m.x, z: m.z, r: SPORE.r * (m.evolved ? 1.35 : 1), t: SPORE.life, max: SPORE.life });
            this.emit({ e: 'spore', i: m.i, x: m.x, z: m.z });
            m.attackCd = SPORE.gap;
            m.alert = 3;
          } else {
            if (dist < m.radius + MECH.radius + 1.0) this.hurt(1, 'bite', m.x, m.z);
            this.emit({ e: 'bite', i: m.i });
            m.attackCd = m.evolved && d.kind === 'brute' ? 0.9 : 1.6;
          }
          m.state = 'recover'; m.t = 0; m.act = 'bite';
        }
        this.moveMon(m, dt, false);
        return;
      }
      case 'recover': {
        m.vx *= 0.9; m.vz *= 0.9;
        if (m.t > 0.7) { m.state = 'wander'; m.t = 0; m.alert = 0.8; }
        this.moveMon(m, dt, false);
        return;
      }
    }
    // daze points come back after a while
    if (m.hp < m.maxHp && m.sinceHit > this.tune.regen) { m.regenT += dt; if (m.regenT > 1.2) { m.regenT = 0; m.hp++; } }
    // evolving: time and snacks
    if (!m.evolved && !m.small && !m.minion) {
      m.evolveK += EVOLVE_RATE * this.tune.evolve * dt;
      if (m.evolveK > 0.78 && !m.warned) { m.warned = true; this.emit({ e: 'evolveWarn', i: m.i }); }
      if (m.evolveK >= 1) { this.evolve(m); return; }
    }
    // what to do
    const decoy = v.decoy && v.active.decoy > 0 && Math.hypot(v.decoy.x - m.x, v.decoy.z - m.z) < POWER.decoyR ? v.decoy : null;
    const biter = this.biter(m);
    const scared = d.kind === 'runner' || d.kind === 'caller' ? 7.5 : d.kind === 'spiky' || d.kind === 'brute' ? 3.5 : 5.5;
    let tx = 0, tz = 0, speed = this.speedOf(m, false), hop = d.kind === 'hopper';
    if (decoy) {
      m.state = 'lure';
      const ddx = decoy.x - m.x, ddz = decoy.z - m.z, dd = Math.hypot(ddx, ddz);
      if (dd > 1.6) { tx = ddx / dd; tz = ddz / dd; } else { tx = 0; tz = 0; }
      speed = this.speedOf(m, true);
    } else if (d.kind === 'lobber' && v.state === 'play' && m.air <= 0 && dist < LOBBER.far && dist > 2.5 && m.attackCd <= 0 && this.clearLine(m.x, m.z, v.x, v.z)) {
      // the lobber throws from where it stands
      m.state = 'windup'; m.act = 'lob'; m.t = 0;
      this.emit({ e: 'attack', i: m.i, x: m.x, z: m.z });
      return;
    } else if (d.kind === 'spore' && v.state === 'play' && dist < SPORE.near && m.attackCd <= 0) {
      m.state = 'windup'; m.act = 'spore'; m.t = 0;
      this.emit({ e: 'attack', i: m.i, x: m.x, z: m.z });
      return;
    } else if (biter && dist < 8 && v.state === 'play' && m.air <= 0) {
      m.state = 'chase';
      if (dist < m.radius + MECH.radius + 0.8 && m.attackCd <= 0) { m.state = 'windup'; m.act = 'bite'; m.t = 0; this.emit({ e: 'attack', i: m.i, x: m.x, z: m.z }); return; }
      tx = dx / (dist || 1); tz = dz / (dist || 1);
      speed = this.speedOf(m, false) * 1.15;
    } else if ((dist < scared || m.alert > 0) && v.state === 'play' && !(biter && m.alert <= 0)) {
      if (d.kind === 'caller' && dist < 6.5 && m.callCd <= 0) this.squawk(m);
      m.state = 'flee';
      tx = -dx / (dist || 1); tz = -dz / (dist || 1);
      speed = this.speedOf(m, true);
      // dive into a vent
      if (m.teleCd <= 0 && m.air <= 0) for (const p of this.c.vents) if (Math.hypot(p.x - m.x, p.z - m.z) < 1.4) {
        m.state = 'vent'; m.t = 0; m.x = p.x; m.z = p.z;
        this.emit({ e: 'vent', i: m.i, x: p.x, z: p.z, out: false });
        return;
      }
      // a fleeing monster that sees a vent near goes for it
      if (m.teleCd <= 0) for (const p of this.c.vents) {
        const pd = Math.hypot(p.x - m.x, p.z - m.z);
        if (pd < 7 && (p.x - m.x) * dx + (p.z - m.z) * dz < 0) { tx = (p.x - m.x) / pd; tz = (p.z - m.z) / pd; break; }
      }
    } else {
      // hungry: a snack in sight
      let snack: Snack | null = null, sd = 11;
      for (const s of this.snacks) if (s.on) { const q = Math.hypot(s.x - m.x, s.z - m.z); if (q < sd && this.clearLine(m.x, m.z, s.x, s.z)) { sd = q; snack = s; } }
      if (snack) {
        if (sd < 0.9 + m.radius) {
          if (m.state !== 'eat') { m.state = 'eat'; m.t = 0; }
          if (m.t > 1.5) {
            snack.on = false; snack.t = SNACK_BACK;
            m.evolveK += EVOLVE_SNACK * (this.easy ? 0.75 : 1);
            this.emit({ e: 'eat', i: m.i, x: snack.x, z: snack.z });
            m.state = 'wander'; m.t = 0;
          }
          m.vx *= 0.8; m.vz *= 0.8;
          this.moveMon(m, dt, false);
          return;
        }
        m.state = 'wander';
        tx = (snack.x - m.x) / sd; tz = (snack.z - m.z) / sd;
      } else {
        m.state = 'wander';
        m.dirT -= dt;
        if (m.dirT <= 0) { m.dir += (this.rand() - 0.5) * 2.4; m.dirT = 1.2 + this.rand() * 2.2; }
        tx = Math.sin(m.dir); tz = Math.cos(m.dir);
        speed *= 0.7;
      }
    }
    // steer round walls: try the wanted way, then turn till the way is open
    if (tx || tz) {
      const look = 1.2 + m.radius;
      let a = Math.atan2(tx, tz);
      for (let k = 0; k < 8; k++) {
        const ta = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
        if (!this.blockedAhead(m, Math.sin(ta), Math.cos(ta), look)) { a = ta; break; }
      }
      tx = Math.sin(a); tz = Math.cos(a);
      if (m.state === 'wander') m.dir = a;
    }
    // leapers jump high now and then (quick bolts glance off them up there)
    if (d.kind === 'leaper' && (tx || tz)) {
      if (m.air > 0) {
        m.air -= dt;
        const k = 1 - Math.max(0, m.air) / 0.8;
        m.y = Math.sin(k * Math.PI) * 2.5;
        speed *= 1.9;
        if (m.air <= 0) { m.y = 0; m.leap = 0; }
      } else {
        m.y = 0;
        m.leap += dt;
        if (m.leap > (m.state === 'flee' ? 1.3 : 2.4)) { m.air = 0.8; this.emit({ e: 'leap', i: m.i, x: m.x, z: m.z }); }
      }
    } else if (d.kind === 'leaper' && m.air > 0) { m.air -= dt; m.y = Math.max(0, m.y - dt * 5); if (m.air <= 0) m.y = 0; }
    // hoppers move in hops
    if (hop) {
      m.hopT -= dt;
      if (m.hopT <= 0) { m.hopT = m.state === 'flee' ? 0.55 : 0.85; }
      const phase = m.hopT / (m.state === 'flee' ? 0.55 : 0.85);
      const on = phase > 0.35;
      speed *= on ? 1.6 : 0.05;
      m.y = on ? Math.sin(((phase - 0.35) / 0.65) * Math.PI) * 0.45 : 0;
    }
    const k = 1 - Math.exp(-(this.iceAt(m.x, m.z) ? 2 : 8) * dt);
    m.vx += (tx * speed - m.vx) * k;
    m.vz += (tz * speed - m.vz) * k;
    if (Math.hypot(m.vx, m.vz) > 0.3) m.yaw += angDiff(m.yaw, Math.atan2(m.vx, m.vz)) * Math.min(1, dt * 8);
    this.moveMon(m, dt, true);
    // the spiky cactoro, and anything rammed
    if (dist < m.radius + MECH.radius + 0.05) {
      if (d.kind === 'spiky') this.hurt(1, 'spikes', m.x, m.z);
      else if (this.ranks.thrusters >= 3 && v.sprint && m.attackCd <= 0) { m.attackCd = 0.6; this.daze(m, 1, false); }
      if (v.active.shield > 0 && m.attackCd <= 0) { m.attackCd = 0.8; this.daze(m, 1, false); m.vx = -dx / (dist || 1) * 7; m.vz = -dz / (dist || 1) * 7; }
    }
    // teleporter pads carry monsters too
    if (m.teleCd <= 0 && m.air <= 0) for (const t of this.c.teles) {
      if (t.to < 0 || Math.hypot(m.x - t.x, m.z - t.z) > 0.8) continue;
      const to = this.c.teles[t.to];
      m.x = to.x + Math.sin(m.yaw) * 1.4; m.z = to.z + Math.cos(m.yaw) * 1.4; m.teleCd = 5;
      this.emit({ e: 'tele', x: t.x, z: t.z, tx: to.x, tz: to.z });
      break;
    }
  }

  private blockedAhead(m: Mon, dx: number, dz: number, look: number): boolean {
    const x = m.x + dx * look, z = m.z + dz * look;
    if (this.solidAt(x, z)) return true;
    for (const s of this.c.stacks) if (Math.abs(x - s.x) < 1.6 && Math.abs(z - s.z) < 1.6) return true;
    for (let i = 0; i < this.doors.length; i++) if (this.doors[i].open < 0.75 && Math.hypot(x - this.c.doors[i].x, z - this.c.doors[i].z) < 2.2) return true;
    for (let i = 0; i < this.c.lasers.length; i++) if (this.laserOn(i)) { const [ax, az, bx, bz] = this.laserSeg(i); if (segDist(x, z, ax, az, bx, bz) < 0.8) return true; }
    return false;
  }

  private moveMon(m: Mon, dt: number, conveyors: boolean): void {
    const cv = conveyors || m.state === 'dizzy' ? this.conveyorAt(m.x, m.z) : [0, 0];
    m.x += (m.vx + cv[0] * CONVEYOR) * dt;
    m.z += (m.vz + cv[1] * CONVEYOR) * dt;
    this.collide(m, m.radius, m.state !== 'dizzy');
  }

  private wake(m: Mon, free: boolean): void {
    m.state = 'flee';
    m.air = 0;
    m.hp = m.maxHp;
    m.alert = 3;
    m.t = 0;
    m.y = 0;
    m.wakes++;
    this.emit({ e: 'wake', i: m.i, x: m.x, z: m.z, free });
  }

  private evolve(m: Mon): void {
    m.evolved = true;
    m.evolveK = 1;
    m.hp = m.maxHp = m.def!.hp * EVOLVED.hp;
    m.radius *= EVOLVED.size * 0.9;
    m.height *= EVOLVED.size;
    m.state = 'evolve';
    m.t = 0;
    this.stats.evolved++;
    this.emit({ e: 'evolve', i: m.i, x: m.x, z: m.z });
  }

  /** Soft pushes: monsters off each other and off the mech. */
  private separate(): void {
    const v = this.mech;
    const live = this.mons.filter((m) => m.state !== 'gone' && m.state !== 'captured' && m.state !== 'vent' && m.state !== 'towed');
    for (let a = 0; a < live.length; a++) {
      const A = live[a];
      for (let b = a + 1; b < live.length; b++) {
        const B = live[b];
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), need = A.radius + B.radius;
        if (d >= need || d < 1e-4) continue;
        const push = (need - d) / 2, nx = dx / d, nz = dz / d;
        A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
      }
      if (A.y > AIR_HIGH) continue;
      const dx = A.x - v.x, dz = A.z - v.z, d = Math.hypot(dx, dz), need = A.radius + MECH.radius;
      if (d < need && d > 1e-4) {
        const push = need - d, nx = dx / d, nz = dz / d;
        if (A.boss) { v.x -= nx * push; v.z -= nz * push; this.collide(v, MECH.radius); }
        else { A.x += nx * push * 0.8; A.z += nz * push * 0.8; v.x -= nx * push * 0.2; v.z -= nz * push * 0.2; this.collide(A, A.radius); this.collide(v, MECH.radius); }
      }
    }
  }

  // ---------------------------------------------------------------- the boss

  private bossHit(m: Mon, dmg: number, charged: boolean): void {
    if (m.state === 'b-daze' || m.state === 'dizzy' || m.state === 'towed' || m.state === 'b-roar') return;
    // a charged shot counts one less against a boss, but breaks its guard: while it walks about (not
    // winding up, attacking or dazed from a wall) it takes half of a quick shot
    if (charged && dmg >= 3) dmg -= 1;
    const guard = m.state === 'b-idle' && m.stun <= 0 && !charged;
    m.bar -= guard ? dmg * 0.5 : dmg;
    m.hurtT = 0.2;
    this.emit({ e: 'hit', i: m.i, x: m.x, z: m.z, y: m.height * 0.5, glance: guard, charged });
    if (m.bar > 0) return;
    m.bar = 0;
    m.attack = null;
    if (m.phase < 2) {
      m.state = 'b-daze'; m.t = 0;
      this.emit({ e: 'bossDaze', phase: m.phase });
    } else {
      m.state = 'dizzy';
      m.dizzyMax = m.dizzy = BOSS_DIZZY_LAST * RANK.dizzy[this.ranks.stasis] * (this.easy ? 1.25 : 1);
      this.emit({ e: 'bossDizzy' });
      this.emit({ e: 'dizzy', i: m.i, x: m.x, z: m.z });
    }
  }

  private stepBoss(m: Mon, dt: number): void {
    const v = this.mech, bd = BOSSES[m.boss!];
    m.t += dt;
    m.hurtT = Math.max(0, m.hurtT - dt);
    const dx = v.x - m.x, dz = v.z - m.z, dist = Math.hypot(dx, dz);
    switch (m.state) {
      case 'captured': return;
      case 'towed': {
        const slot = v.towing.indexOf(m);
        if (slot < 0) { m.state = 'dizzy'; return; }
        m.dizzy -= dt * this.tune.towClock;
        if (m.dizzy <= 0) { v.towing.splice(slot, 1); this.bossWake(m); return; }
        const gap = MECH.towGap + m.radius + 0.6;
        const tx = v.x - Math.sin(v.yaw) * gap, tz = v.z - Math.cos(v.yaw) * gap;
        const k = 1 - Math.exp(-4 * dt);
        m.x += (tx - m.x) * k; m.z += (tz - m.z) * k;
        m.y += (0.6 - m.y) * k;
        this.collide(m, m.radius * 0.7);
        return;
      }
      case 'dizzy': {
        m.y = Math.max(0, m.y - dt * 3);
        m.dizzy -= dt;
        if (m.dizzy <= 0) this.bossWake(m);
        return;
      }
      case 'b-daze': {
        if (m.t > BOSS_DAZE) { m.state = 'b-roar'; m.t = 0; m.phase++; m.barMax = m.bar = bd.bar[m.phase] * this.tune.bossBar; m.attackI = 0; this.emit({ e: 'bossPhase', phase: m.phase }); }
        return;
      }
      case 'b-roar': {
        if (m.t > 1.3) { m.state = 'b-idle'; m.t = 0; m.nextAttack = 1.2; }
        return;
      }
      case 'b-windup': {
        this.bossWindup(m, dt, dist);
        return;
      }
      case 'b-act': {
        this.bossAct(m, dt);
        return;
      }
    }
    // dazed after running into a wall
    if (m.stun > 0) { m.stun -= dt; m.vx = m.vz = 0; return; }
    // idle: keep a fighting distance, turn to the mech, attack on the clock
    const want = 5.5;
    const spd = bd.speed * this.tune.speed * (1 + m.phase * 0.12);
    let tx = 0, tz = 0;
    if (dist > want + 1) { tx = dx / dist; tz = dz / dist; } else if (dist < want - 1.5) { tx = -dx / dist * 0.5; tz = -dz / dist * 0.5; }
    const k = 1 - Math.exp(-6 * dt);
    m.vx += (tx * spd - m.vx) * k; m.vz += (tz * spd - m.vz) * k;
    m.x += m.vx * dt; m.z += m.vz * dt;
    this.collide(m, m.radius);
    m.yaw += angDiff(m.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
    // touching it hurts
    if (dist < m.radius + MECH.radius + 0.1) this.hurt(1, 'boss', m.x, m.z);
    m.nextAttack -= dt;
    if (m.nextAttack <= 0 && v.state === 'play') {
      const list = bd.phases[m.phase];
      let a = list[m.attackI % list.length];
      m.attackI++;
      if (a === 'summon' && this.mons.filter((o) => o.minion && this.loose(o)).length >= 3) a = list[m.attackI++ % list.length];
      if (a === 'summon' && this.mons.filter((o) => o.minion && this.loose(o)).length >= 3) a = 'slam';
      m.attack = a;
      m.state = 'b-windup';
      m.t = 0;
      m.aim = { x: v.x, z: v.z };
      m.from = { x: m.x, z: m.z };
      m.aimYaw = Math.atan2(dx, dz);
      m.vx = m.vz = 0;
      this.emit({ e: 'bossWindup', attack: a });
    }
  }

  /** How long each attack's wind-up (its telegraph) lasts. */
  windupOf(a: BossAttack): number {
    const w = { slam: 1.0, leap: 0.6, volley: 0.75, ring: 0.95, charge: 0.85, lob: 0.65, summon: 0.8, blink: 0.35, beam: 0.95 }[a];
    return w * this.tune.windup;
  }

  private bossWindup(m: Mon, dt: number, dist: number): void {
    const a = m.attack!, v = this.mech;
    if (a === 'volley' || a === 'beam' || a === 'lob' || a === 'charge') {
      // keep turning a little to the mech while winding up (not for the charge's line or the beam's wedge)
      if (a !== 'charge' && a !== 'beam') { m.aimYaw += angDiff(m.aimYaw, Math.atan2(v.x - m.x, v.z - m.z)) * Math.min(1, dt * 2); m.aim = { x: v.x, z: v.z }; }
      m.yaw = m.aimYaw;
    }
    if (dist < m.radius + MECH.radius + 0.1) this.hurt(1, 'boss', m.x, m.z);
    if (m.t < this.windupOf(a)) return;
    m.state = 'b-act';
    m.t = 0;
    const bs = this.tune.bossShot;
    const fire = (yaw: number, kind: Shot['kind'], speed: number) => this.shots.push({ x: m.x + Math.sin(yaw) * m.radius, z: m.z + Math.cos(yaw) * m.radius, y: 1.4, vx: Math.sin(yaw) * speed * bs, vz: Math.cos(yaw) * speed * bs, life: 3.2, kind });
    switch (a) {
      case 'slam':
        this.waves.push({ x: m.x, z: m.z, r: m.radius, max: 4.4, speed: 9, hit: false, color: 'boss' });
        if (Math.hypot(v.x - m.x, v.z - m.z) < 3.4) this.hurt(1, 'slam', m.x, m.z);
        break;
      case 'volley': for (let k = -2; k <= 2; k++) fire(m.aimYaw + k * VOLLEY_GAP, m.boss === 'alien' ? 'orb' : 'spike', 9); break;
      case 'ring': for (let k = 0; k < 12; k++) fire((k / 12) * Math.PI * 2 + m.phase * 0.1, m.boss === 'alien' ? 'orb' : 'spike', 7.5); break;
      case 'lob': this.lobs.push({ x: m.aim.x, z: m.aim.z, fx: m.x, fz: m.z, t: 0, total: 1.05 / bs, kind: m.boss === 'yeti' ? 'ice' : 'orb' }); break;
      case 'summon': {
        const id = BOSSES[m.boss!].minion;
        for (const s of [-1, 1]) {
          const ang = m.yaw + s * 1.2;
          const o = this.addMon(id, m.x + Math.sin(ang) * 2.4, m.z + Math.cos(ang) * 2.4, { minion: true });
          this.collide(o, o.radius);
          o.state = 'flee'; o.alert = 1;
        }
        this.emit({ e: 'summon', x: m.x, z: m.z });
        break;
      }
      case 'blink': {
        const fx = m.x, fz = m.z;
        for (let tries = 0; tries < 40; tries++) {
          const x = (1 + this.rand() * (this.c.cols - 2)) * BLOCK, z = (1 + this.rand() * (this.c.rows - 2)) * BLOCK;
          if (this.solidAt(x, z) || Math.hypot(x - v.x, z - v.z) < 7) continue;
          m.x = x; m.z = z;
          break;
        }
        this.collide(m, m.radius);
        this.emit({ e: 'blink', i: m.i, fx, fz, x: m.x, z: m.z });
        break;
      }
    }
    this.emit({ e: 'bossAttack', attack: a, x: m.x, z: m.z });
  }

  private bossAct(m: Mon, dt: number): void {
    const a = m.attack!, v = this.mech;
    const end = () => { m.state = 'b-idle'; m.t = 0; m.attack = null; m.nextAttack = BOSSES[m.boss!].gap * this.tune.bossGap * (1 - m.phase * 0.15); };
    switch (a) {
      case 'leap': {
        const T = 0.85;
        const k = Math.min(1, m.t / T);
        m.x = m.from.x + (m.aim.x - m.from.x) * k;
        m.z = m.from.z + (m.aim.z - m.from.z) * k;
        m.y = Math.sin(k * Math.PI) * 3.2;
        if (k >= 1) {
          m.y = 0;
          this.collide(m, m.radius);
          this.waves.push({ x: m.x, z: m.z, r: m.radius, max: 4.2, speed: 10, hit: false, color: 'boss' });
          if (Math.hypot(v.x - m.x, v.z - m.z) < 3.2) this.hurt(1, 'slam', m.x, m.z);
          this.emit({ e: 'bossLand', x: m.x, z: m.z });
          end();
        }
        return;
      }
      case 'charge': {
        const sp = 13 * this.tune.bossShot;
        const px = m.x, pz = m.z;
        m.x += Math.sin(m.aimYaw) * sp * dt; m.z += Math.cos(m.aimYaw) * sp * dt;
        const hitWall = this.collide(m, m.radius) && Math.hypot(m.x - px, m.z - pz) < sp * dt * 0.5;
        if (Math.hypot(v.x - m.x, v.z - m.z) < m.radius + MECH.radius + 0.2) this.hurt(1, 'charge', m.x, m.z);
        if (hitWall || m.t > 1.4) {
          if (hitWall) {
            // it ran into the wall: dazed for a moment (free hits)
            this.emit({ e: 'bossThud', x: m.x, z: m.z });
            end();
            m.stun = 1.8 * this.tune.windup;
            return;
          }
          end();
        }
        return;
      }
      case 'beam': {
        // one sweep across the wedge drawn during the wind-up
        const T = BEAM.time;
        m.yaw = m.aimYaw + BEAM.amp * (2 * Math.min(1, m.t / T) - 1) * (m.attackI % 2 ? 1 : -1);
        const [ex, ez] = this.beamEnd(m);
        if (segDist(v.x, v.z, m.x, m.z, ex, ez) < MECH.radius + 0.25) this.hurt(1, 'beam', m.x, m.z);
        if (m.t > T) end();
        return;
      }
      default:
        if (m.t > (a === 'summon' ? 0.9 : 0.55)) end();
    }
  }

  /** The alien's beam: from the boss along its facing until a wall. */
  beamEnd(m: Mon): [number, number] {
    const dx = Math.sin(m.yaw), dz = Math.cos(m.yaw);
    let d = m.radius;
    while (d < 16 && !this.solidAt(m.x + dx * d, m.z + dz * d)) d += 0.3;
    return [m.x + dx * d, m.z + dz * d];
  }

  private bossWake(m: Mon): void {
    const bd = BOSSES[m.boss!];
    m.state = 'b-roar';
    m.t = 0;
    m.y = 0;
    m.wakes++;
    m.barMax = bd.bar[2] * this.tune.bossBar;
    m.bar = m.barMax * 0.5;
    this.emit({ e: 'wake', i: m.i, x: m.x, z: m.z, free: true });
  }

  private stepShots(dt: number): void {
    const v = this.mech;
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const s = this.shots[k];
      s.life -= dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      let dead = s.life <= 0 || this.solidAt(s.x, s.z);
      if (!dead && Math.hypot(v.x - s.x, v.z - s.z) < SHOT_HIT) { this.hurt(1, s.kind, s.x - s.vx * 0.1, s.z - s.vz * 0.1); dead = true; }
      if (dead) this.shots.splice(k, 1);
    }
    for (let k = this.lobs.length - 1; k >= 0; k--) {
      const l = this.lobs[k];
      l.t += dt;
      if (l.t >= l.total) {
        if (Math.hypot(v.x - l.x, v.z - l.z) < 1.8) this.hurt(1, 'lob', l.x, l.z);
        if (l.kind === 'ice') this.ice.push({ x: l.x, z: l.z, r: 2.2, t: 7 });
        this.emit({ e: 'lobLand', x: l.x, z: l.z, kind: l.kind });
        this.lobs.splice(k, 1);
      }
    }
  }

  // ---------------------------------------------------------------- captures and the end

  private stepCaptures(dt: number): void {
    const v = this.mech;
    const pods: [number, number, number][] = this.c.pods.map((p) => [p.x, p.z, POD_R]);
    if (this.c.field) pods.push([this.c.field.x, this.c.field.z, FIELD_R]);
    for (const m of this.mons) {
      if (m.state === 'captured') {
        m.t += dt;
        if (m.to) { const k = 1 - Math.exp(-7 * dt); m.x += (m.to.x - m.x) * k; m.z += (m.to.z - m.z) * k; m.y += ((m.boss ? 1.2 : 2.6) - m.y) * k; }
        if (m.t > 0.9) m.state = 'gone';
        continue;
      }
      if (m.state !== 'towed' && m.state !== 'dizzy') continue;
      for (const [px, pz, pr] of pods) {
        // the boss only goes into its field
        if (m.boss && pr !== FIELD_R) continue;
        // in the ring itself, or on the beam of a mech that stands in the ring
        const mechIn = m.state === 'towed' && Math.hypot(v.x - px, v.z - pz) < pr + 0.6;
        if (!mechIn && Math.hypot(m.x - px, m.z - pz) > pr + (m.state === 'towed' ? 1.0 : 0.2) + (m.boss ? 0.6 : 0)) continue;
        const slot = v.towing.indexOf(m);
        if (slot >= 0) v.towing.splice(slot, 1);
        m.state = 'captured';
        m.t = 0;
        m.to = { x: px, z: pz };
        const base = m.boss ? SCORE.boss : Math.round(m.def!.points * (m.evolved ? EVOLVED.points : 1) * (m.small ? 0.6 : 1));
        if (this.comboT > 0) this.combo = Math.min(SCORE.comboMax, this.combo + 1);
        this.comboT = SCORE.comboTime;
        this.stats.best = Math.max(this.stats.best, this.combo);
        const pts = base * this.combo;
        this.points += pts;
        this.stats.credits += m.boss ? CREDITS.boss : m.evolved ? CREDITS.evolved : CREDITS.capture;
        if (!m.minion) { this.captured++; this.stats.captures++; }
        this.emit({ e: 'capture', i: m.i, x: px, z: pz, pts, combo: this.combo, boss: !!m.boss });
        if (!this.exitOpen && this.captured >= this.c.quota && this.c.exit) { this.exitOpen = true; this.emit({ e: 'exitOpen' }); }
        break;
      }
    }
  }

  private checkEnd(dt: number): void {
    // every monster banked: the level ends by itself a moment later (a boss level when the boss is in)
    const done = this.captured >= this.c.total;
    if (done) {
      if (this.allT < 0) this.allT = 0;
      this.allT += dt;
      if (this.allT > 1.4) this.finish();
    }
  }

  private finish(): void {
    const v = this.mech;
    if (v.state !== 'play') return;
    v.state = 'clear';
    for (const m of v.towing) m.state = 'dizzy';
    v.towing = [];
    this.emit({ e: 'clear', x: v.x, z: v.z });
  }

  /** A rewarded continue: full hull where the mech fell, every loose monster nudged away. */
  revive(): void {
    const v = this.mech;
    v.hp = v.max;
    v.state = 'play';
    v.safe = 2.5;
    v.vx = v.vz = 0;
    v.energy = v.emax;
    for (const m of this.mons) if (!m.boss && this.loose(m) && Math.hypot(m.x - v.x, m.z - v.z) < 6) { m.state = 'flee'; m.alert = 2; }
    this.shots = [];
    this.lobs = [];
    this.waves = [];
  }
}

export { MONSTERS, BOSSES };
