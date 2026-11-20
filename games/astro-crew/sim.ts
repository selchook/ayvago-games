// Astro Crew: one mission as a pure simulation, stepped at 60 Hz (no Phaser, no three.js), so the
// Play scene, the menu's live backdrop and the headless balance check (balance.ts) all run the same
// rules. The view (view.ts) draws its state; the scene reacts to its events (sounds, banners).
//
// The hero runs over a whole planet (world.ts): the stick (or WASD) moves, and attacking is the
// player's: while FIRE is held the gun comes up and fires from its tip at the weapon's rate, and a
// foe in arm's reach gets a punch instead (the mech: a kick). A light aim assist picks the shot's
// target: the nearest alien (else a nest, else a crate) inside a cone of ±35° round the hero's
// facing or within 4.5 m all round, held while FIRE stays down (the hero keeps facing it while it
// runs); standing still it takes the nearest one all round, as the 1.1 gun did; with nothing there
// the shots go straight ahead. DODGE rolls (invulnerable; the next shot after a roll is a power shot), SKILL fires the
// class's signature move, MECH turns the hero into its mech for a few seconds once the meter is
// full (kills and the Thunder pickup charge it).
//
// Encounters instead of fixed waves: nests and hives wake when the hero comes near, send out guards
// and then reinforcements; patrols walk their routes; camps guard the keycards and crystal caches;
// and the hive alert rises on its own and faster near an awake nest until it sends a hunting wave
// at the hero (or, on a defence mission, on a schedule at the dome). Destroying a nest lowers the
// alert and drops loot. Far guards and patrols sleep. The mission's objective decides when it is
// won: destroy the nests, beat back the alerts at the dome, collect the keycards and hold the
// beacon, fix the stranded rovers, or beat the boss in its lair.
import {
  WORLD_R, SLEEP_R, HERO, MOVE, FOE, BOSS, NEST, THREAT, OBJ, TUNING, xpNeed,
  type HeroId, type FoeKind, type MobKind, type BossId, type MissionDef, type Mode, type ShotKind,
} from './defs';
import { mods, type Mods, type CardId, type Ranks } from './powers';
import { planWorld, pushOut, mulberry, type WorldPlan, type Spot, type Camp } from './world';

export { mulberry };

/** `fire` is held (the gun fires while it stays down); the other buttons are presses. */
export interface Input { mx: number; mz: number; fire: boolean; dodge: boolean; skill: boolean; mech: boolean }
export const NO_INPUT: Input = { mx: 0, mz: 0, fire: false, dodge: false, skill: false, mech: false };

/** The aim assist: half the cone round the hero's facing (rad), and how close counts all round. */
export const AIM_CONE = 35 * Math.PI / 180;
const AIM_CLOSE = 4.5;

/** What lasts for the whole run (several missions). */
export interface RunState {
  mode: Mode;
  hero: HeroId;
  cards: CardId[];
  ranks: Ranks;
  level: number;
  xp: number;
  score: number;
  /** Missions played in this run before the current one (the run ramps). */
  depth: number;
  angelUsed: boolean;
  kills: number;
}

export function newRun(mode: Mode, hero: HeroId, ranks: Ranks): RunState {
  return { mode, hero, cards: [], ranks, level: 1, xp: 0, score: 0, depth: 0, angelUsed: false, kills: 0 };
}

/** A point in the hero's own frame: `s` to its left (+) or right (-), `y` up, `f` forward. */
export interface Local { s: number; y: number; f: number }

/**
 * Where the gun's tip is in the hero's frame while it aims (the view measures it every frame from
 * the hand's bone and writes it here; these are the measured values for the headless runs).
 */
export const MUZZLE: Local = { s: -0.34, y: 1.02, f: 0.9 };
export const MECH_MUZZLE: [Local, Local] = [{ s: 0.78, y: 1.62, f: 0.72 }, { s: -0.78, y: 1.62, f: 0.72 }];

export interface Hero {
  x: number; z: number; face: number;
  hp: number; max: number;
  vx: number; vz: number;
  roll: number; rollCd: number; rollDx: number; rollDz: number; rollShot: number;
  invuln: number; fireT: number; punchCd: number; punchT: number;
  skillCd: number; charges: number;
  mech: number; charge: number; kickCd: number; kickT: number; mechFire: number; mechReady: boolean; mechShots: number;
  shots: number; hurtT: number; bubble: number; overdrive: number;
  leap: { t: number; max: number; fx: number; fz: number; tx: number; tz: number } | null;
  alive: boolean; reviveUsed: boolean;
  /** Seconds since the last shot (the view plays the firing clips). */
  firedT: number;
  /** The aim: a unit direction, the point aimed at, whether FIRE is held (the gun is out). */
  aimX: number; aimZ: number; tx: number; tz: number; aiming: boolean;
  /** The alien or nest the aim assist holds (-1: none, shooting straight ahead). */
  lock: number;
  /** Seconds since FIRE was last held (the scene's reminder). */
  idleFire: number;
  /** 0..1: the gun raised and pointed (it rises while there is a target, the shots wait for it). */
  gunUp: number;
  /** Seconds the gun stays up after the last target. */
  gunHold: number;
  /** The gun's tip, the mech's two cannons (the view keeps them measured). */
  muzzle: Local;
  mechMuzzle: [Local, Local];
  /** The last shot's muzzle in the world (the view puts the flash there). */
  mx: number; mz: number; my: number;
  skillT: number;
  novaT: number;
  hits: number;
  lavaT: number;
}

export type FoeState = 'spawn' | 'move' | 'wind' | 'strike' | 'dive' | 'dead';
export type FoeMode = 'hunt' | 'guard' | 'patrol' | 'nest' | 'lair';
export type BossMove = 'slam' | 'charge' | 'summon' | 'fan' | 'ring' | 'quake' | 'dive';

export interface Foe {
  id: number; kind: FoeKind; boss?: BossId;
  x: number; z: number; kx: number; kz: number;
  hp: number; max: number; r: number; speed: number; dmg: number;
  elite: boolean; state: FoeState; t: number; cd: number; face: number;
  target: 'hero' | 'dome';
  /** How it behaves: hunting, guarding a post (a nest, a camp), on patrol, a nest itself, the boss in its lair. */
  mode: FoeMode;
  /** Its post (guards, the boss's lair) and its patrol route. */
  hx: number; hz: number;
  route: Spot[] | null; wp: number;
  /** Chasing the hero right now (a guard or patrol that noticed it); sleeping far away. */
  engaged: boolean; sleep: boolean;
  /** The alert that sent it (0: none). */
  wave: number;
  slow: number; burn: number; burnDps: number;
  /** Seconds since the last hit (the view flashes). */
  hitT: number;
  deadT: number; xp: number; score: number; mech: number; scale: number;
  move?: BossMove; ax: number; az: number; rage: boolean; strafe: number; spitCd: number; diveCd: number;
  /** Idle wandering: where to and for how long. */
  wx: number; wz: number; wt: number;
}

export interface Shot {
  /** `y`: the height above the ground at (gx, gz), where it was fired from (it flies level). */
  id: number; kind: ShotKind; x: number; z: number; y: number; gx: number; gz: number; vx: number; vz: number;
  dmg: number; life: number; r: number; pierce: number; hostile: boolean;
  splash: number; knock: number; hit: number[]; crit: boolean; frost: boolean; burn: boolean; bounce: number; home: boolean; big: boolean;
  /** Not moved yet: drawn at the muzzle on its first frame. */
  fresh: boolean;
}

export type PickKind = 'xp' | 'health' | 'bullets' | 'thunder' | 'jar' | 'key';
export interface Pickup { id: number; kind: PickKind; x: number; z: number; v: number; t: number; pull: boolean }
export interface Crate { id: number; x: number; z: number; hp: number }
export type HazKind = 'slam' | 'charge' | 'meteor' | 'lance' | 'ring' | 'dive';
export interface Hazard {
  id: number; kind: HazKind; x: number; z: number; r: number; ang: number; len: number; w: number;
  t: number; max: number; dmg: number; by: number; hostile: boolean; done: boolean;
  /** The beam's height above the hero's ground (the lance leaves the gun's tip). */
  y: number;
}
export interface Rover { x: number; z: number; face: number; prog: number; fixed: boolean; leave: number; heard: boolean; packT: number }
export interface Decoy { x: number; z: number; t: number }
export interface NestState { id: number; x: number; z: number; hive: boolean; target: boolean; guard: boolean; awake: boolean; alive: boolean; cd: number }
export interface CampState extends Camp { awake: boolean }
export interface Castaway { x: number; z: number; prog: number; saved: boolean; t: number }

export type SimEvent =
  | { type: 'shoot'; kind: ShotKind; x: number; z: number; y: number; big: boolean; side: number; gx: number; gz: number }
  | { type: 'hit'; id: number; x: number; z: number; dmg: number; crit: boolean }
  | { type: 'kill'; id: number; x: number; z: number; kind: FoeKind; elite: boolean; boss?: BossId }
  | { type: 'hurt'; dmg: number }
  | { type: 'blocked' }
  | { type: 'die' }
  | { type: 'revive'; how: 'hull' | 'angel' }
  | { type: 'dodge' }
  | { type: 'punch'; x: number; z: number }
  | { type: 'kick'; x: number; z: number }
  | { type: 'skill'; hero: HeroId }
  | { type: 'boom'; x: number; z: number; r: number; kind: 'ember' | 'meteor' | 'slam' | 'nova' | 'cannon' | 'leap' | 'wave' | 'decoy' | 'mech' | 'lance' | 'blast' | 'nest' }
  | { type: 'mechReady' } | { type: 'mechOn' } | { type: 'mechOff' }
  | { type: 'pickup'; kind: PickKind; x: number; z: number; v: number }
  | { type: 'level'; level: number }
  | { type: 'alert'; n: number; of: number; dome: boolean }
  | { type: 'alertEnd'; n: number }
  | { type: 'nestWake'; i: number; x: number; z: number }
  | { type: 'nestDown'; i: number; left: number; x: number; z: number; hive: boolean }
  | { type: 'portal'; x: number; z: number; big: boolean }
  | { type: 'spit'; x: number; z: number }
  | { type: 'tele'; kind: HazKind; x: number; z: number }
  | { type: 'crate'; x: number; z: number }
  | { type: 'key'; got: number; of: number }
  | { type: 'beacon' }
  | { type: 'fixing'; i: number }
  | { type: 'fixed'; i: number; left: number }
  | { type: 'castaway'; x: number; z: number }
  | { type: 'burn' }
  | { type: 'domeHit'; hp: number; max: number }
  | { type: 'boss'; id: BossId }
  | { type: 'shieldDown' }
  | { type: 'rage' }
  | { type: 'chain'; pts: number[] }
  | { type: 'win' }
  | { type: 'lose'; why: 'hero' | 'dome' };

export interface MissionStats { kills: number; damage: number; jars: number; crystals: number; time: number; taken: number; low: number; nests: number }

interface Queued { at: number; kind: MobKind; elite: boolean; x: number; z: number; mode: FoeMode; hx: number; hz: number; target: 'hero' | 'dome'; wave: number; route?: Spot[] }

export class Mission {
  readonly rnd: () => number;
  readonly m: Mods;
  readonly tune = TUNING.normal;
  readonly hero: Hero;
  readonly plan: WorldPlan;
  foes: Foe[] = [];
  shots: Shot[] = [];
  picks: Pickup[] = [];
  crates: Crate[] = [];
  hazards: Hazard[] = [];
  rovers: Rover[] = [];
  nests: NestState[] = [];
  camps: CampState[] = [];
  castaway: Castaway | null = null;
  decoy: Decoy | null = null;
  events: SimEvent[] = [];
  phase: 'play' | 'won' | 'lost' = 'play';
  time = 0;
  /** The hive alert: 0..1 (an alert goes off at 1). */
  threat = 0;
  /** Alerts so far, beaten back (defend), the one under way (its number; 0 when none), its time, the defence countdown. */
  alerts = { n: 0, done: 0, active: 0, t: 0, next: 0, of: 0 };
  queue: Queued[] = [];
  /** Defend: the dome (at the landing site). Keys: found, the beacon's hold (counts down while the hero is near it). */
  dome = { hp: 0, max: 0, r: 2.6, x: 0, z: 0 };
  keys = { got: 0, of: 0, hold: -1, near: false, packT: 0 };
  bossId = -1;
  /** The boss is awake (the hero came into its lair). */
  bossAwake = false;
  stats: MissionStats = { kills: 0, damage: 0, jars: 0, crystals: 0, time: 0, taken: 0, low: 1, nests: 0 };
  private nextId = 1;
  private hpK: number;
  private dmgK: number;
  private spdK: number;
  private bladeHit = new Map<number, number>();
  /** Levels gained and not yet drafted (the scene opens the draft). */
  pendingLevels = 0;
  /** Seconds of the drones' orbit. */
  orbit = 0;
  /** Living aliens (not nests, not dying), counted once a step. */
  private aliveN = 0;

  constructor(readonly def: MissionDef, readonly run: RunState, seed: number, plan?: WorldPlan) {
    this.rnd = mulberry(seed);
    this.tune = TUNING[run.mode];
    this.m = mods(run.ranks, run.cards);
    this.plan = plan ?? planWorld(def);
    const H = HERO[run.hero];
    const max = Math.round(H.hp * this.m.hp * this.tune.heroHp);
    const st = this.plan.start;
    this.hero = {
      x: st.x, z: st.z, face: Math.PI, hp: max, max, vx: 0, vz: 0,
      roll: 0, rollCd: 0, rollDx: 0, rollDz: 1, rollShot: 0,
      invuln: 1.2, fireT: 0.4, punchCd: 0, punchT: 0,
      skillCd: 0, charges: this.m.skillCharges,
      mech: 0, charge: this.m.mechStart, kickCd: 0, kickT: 0, mechFire: 0, mechReady: false, mechShots: 0,
      shots: 0, hurtT: 9, bubble: 0, overdrive: 0, leap: null, alive: true, reviveUsed: false,
      firedT: 9, aimX: 0, aimZ: -1, tx: st.x, tz: st.z - 5, aiming: false, lock: -1, idleFire: 0, gunUp: 0, gunHold: 0,
      muzzle: { ...MUZZLE }, mechMuzzle: [{ ...MECH_MUZZLE[0] }, { ...MECH_MUZZLE[1] }], mx: st.x, mz: st.z, my: 1,
      skillT: 0, novaT: 7, hits: 0, lavaT: 0,
    };
    const n = def.n, depth = run.depth;
    this.hpK = this.tune.foeHp * (1 + 0.3 * (n - 1)) * (1 + this.tune.depth * depth);
    this.dmgK = this.tune.foeDmg * (1 + 0.12 * (n - 1)) * (1 + 0.05 * depth);
    this.spdK = this.tune.foeSpeed * (1 + 0.015 * (n - 1));
    this.setup();
  }

  // ---------------------------------------------------------------- setup

  private setup(): void {
    const d = this.def, P = this.plan;
    // nests and hives (foes that never move)
    P.nests.forEach((s) => {
      const N = s.hive ? NEST.hive : NEST.nest;
      const hp = Math.round(N.hp * this.tune.foeHp * (1 + NEST.grow * (d.n - 1)) * (1 + this.tune.depth * this.run.depth * 0.5));
      const f = this.makeFoe('nest', false, s.x, s.z, 'nest');
      Object.assign(f, { hp, max: hp, r: N.r, speed: 0, dmg: 0, xp: N.xp, score: N.score, mech: 0.05, scale: s.hive ? 1.3 : 1, state: 'move', t: 0 });
      this.nests.push({ id: f.id, x: s.x, z: s.z, hive: s.hive, target: s.target, guard: s.guard, awake: false, alive: true, cd: NEST.every });
    });
    this.camps = P.camps.map((c) => ({ ...c, awake: false }));
    if (d.kind === 'defend') {
      const hp = Math.round(OBJ.domeHp * this.tune.domeHp * this.dmgK);
      this.dome = { hp, max: hp, r: 2.6, x: P.base.x, z: P.base.z };
      this.alerts.next = OBJ.firstAlert;
      this.alerts.of = d.count;
    }
    if (d.kind === 'keys') {
      this.keys.of = P.keys.length;
      for (const k of P.keys) this.picks.push({ id: this.nextId++, kind: 'key', x: k.x, z: k.z, v: 1, t: 1, pull: false });
    }
    if (d.kind === 'rescue') for (const r of P.rovers) this.rovers.push({ x: r.x, z: r.z, face: r.face, prog: 0, fixed: false, leave: 0, heard: false, packT: 0 });
    if (d.kind === 'boss' && P.lair) {
      const id = d.boss!, B = BOSS[id];
      const hp = Math.round(B.hp * this.tune.foeHp * (1 + this.tune.depth * this.run.depth));
      const f = this.makeFoe('xs', false, P.lair.x, P.lair.z, 'lair');
      Object.assign(f, {
        kind: 'boss', boss: id, hp, max: hp, r: B.r, speed: B.speed * this.tune.foeSpeed, dmg: B.dmg * this.dmgK, state: 'move', t: 0, cd: 2.2,
        xp: B.xp, score: B.score, mech: 0.25, scale: B.scale, strafe: 1, spitCd: 2, diveCd: 6, face: 0,
      });
      this.bossId = f.id;
    }
    // crystal caches: jars lying in the crystal fields
    for (const c of P.caches) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        this.picks.push({ id: this.nextId++, kind: 'jar', x: c.x + Math.sin(a) * 1.6, z: c.z + Math.cos(a) * 1.6, v: 3 + Math.ceil(d.n / 2), t: 1, pull: false });
      }
    }
    if (P.castaway) this.castaway = { x: P.castaway.x, z: P.castaway.z, prog: 0, saved: false, t: 0 };
    for (const c of P.crates) this.crates.push({ id: this.nextId++, x: c.x, z: c.z, hp: 24 });
    // patrols walk from the start
    P.patrols.forEach((route) => {
      const n = 3 + (d.n >= 8 ? 1 : 0);
      const pool = d.foes.filter((k) => k !== 'brute');
      for (let k = 0; k < n; k++) {
        const kind = k === 0 && d.n >= 6 && d.foes.includes('brute') ? 'brute' : pool[Math.floor(this.rnd() * pool.length)];
        const a = (k / n) * Math.PI * 2;
        const f = this.makeFoe(kind, d.n >= 4 && k === 0 && this.rnd() < 0.4, route[0].x + Math.sin(a) * 1.4, route[0].z + Math.cos(a) * 1.4, 'patrol');
        f.state = 'move';
        f.route = route;
        f.wp = 1;
      }
    });
  }

  /** Living aliens (not nests, not dying). */
  get alive(): number { let n = 0; for (const f of this.foes) if (f.state !== 'dead' && f.kind !== 'nest') n++; return n; }
  get boss(): Foe | undefined { return this.bossId >= 0 ? this.foes.find((f) => f.id === this.bossId) : undefined; }
  /** Objective progress for the HUD: [done, of]. */
  progress(): [number, number] {
    switch (this.def.kind) {
      case 'keys': return [this.keys.got, this.keys.of];
      case 'rescue': return [this.rovers.filter((r) => r.fixed).length, this.rovers.length];
      case 'defend': return [this.alerts.done, this.alerts.of];
      case 'clear': { const t = this.nests.filter((n) => n.target); return [t.filter((n) => !n.alive).length, t.length]; }
      default: { const g = this.nests.filter((n) => n.guard); return [g.filter((n) => !n.alive).length, g.length]; }
    }
  }

  /** The boss is shielded while the hives round its lair stand. */
  get shielded(): boolean { return this.def.kind === 'boss' && this.nests.some((n) => n.guard && n.alive); }

  /** Where the objective wants the hero now (for the markers and the bot): the targets, nearest first. */
  objectives(): Spot[] {
    const h = this.hero, P = this.plan;
    let out: Spot[] = [];
    switch (this.def.kind) {
      case 'clear': out = this.nests.filter((n) => n.target && n.alive); break;
      case 'keys': out = this.keys.got >= this.keys.of ? [P.base] : this.picks.filter((p) => p.kind === 'key'); break;
      case 'rescue': out = this.rovers.filter((r) => !r.fixed); break;
      case 'defend': out = [this.dome]; break;
      case 'boss': out = this.shielded ? this.nests.filter((n) => n.guard && n.alive) : P.lair ? [this.boss && this.boss.state !== 'dead' ? this.boss : P.lair] : []; break;
    }
    return out.map((p) => ({ x: p.x, z: p.z })).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
  }

  // ---------------------------------------------------------------- spawning

  private makeFoe(kind: FoeKind, elite: boolean, x: number, z: number, mode: FoeMode): Foe {
    const F = kind === 'boss' || kind === 'nest' ? FOE.xs : FOE[kind];
    const hp = Math.round(F.hp * this.hpK * (elite ? 2.6 : 1));
    const f: Foe = {
      id: this.nextId++, kind, x, z, kx: 0, kz: 0, hp, max: hp, r: F.r * (elite ? 1.18 : 1),
      speed: F.speed * this.spdK * (0.92 + this.rnd() * 0.16), dmg: F.dmg * this.dmgK * (elite ? 1.4 : 1),
      elite, state: 'spawn', t: 0.7, cd: 0.6 + this.rnd(), face: this.rnd() * Math.PI * 2,
      target: 'hero', mode, hx: x, hz: z, route: null, wp: 0, engaged: mode === 'hunt', sleep: false, wave: 0,
      slow: 0, burn: 0, burnDps: 0, hitT: 9, deadT: 0,
      xp: F.xp * (elite ? 3 : 1), score: F.score * (elite ? 3 : 1), mech: F.mech * (elite ? 2 : 1), scale: F.scale * (elite ? 1.2 : 1),
      ax: 0, az: 0, rage: false, strafe: this.rnd() < 0.5 ? 1 : -1, spitCd: 1.5 + this.rnd() * 1.5, diveCd: 4 + this.rnd() * 4,
      wx: x, wz: z, wt: 0,
    };
    this.foes.push(f);
    return f;
  }

  private spawnQueued(q: Queued): void {
    const p = { x: q.x, z: q.z };
    pushOut(p, FOE[q.kind].r, this.plan.solids);
    const f = this.makeFoe(q.kind, q.elite, p.x, p.z, q.mode);
    f.hx = q.hx; f.hz = q.hz; f.target = q.target; f.wave = q.wave;
    if (q.route) { f.route = q.route; f.wp = 1; }
    if (q.mode === 'hunt') f.face = Math.atan2(this.hero.x - p.x, this.hero.z - p.z);
    this.events.push({ type: 'portal', x: p.x, z: p.z, big: q.kind === 'brute' || q.elite });
  }

  /** Queues a pack of aliens worth `budget` at a point (in a few small groups over `span` seconds). */
  private pack(budget: number, at: Spot, o: { mode: FoeMode; spread?: number; span?: number; wave?: number; dome?: boolean; brutes?: boolean } = { mode: 'hunt' }): void {
    const d = this.def;
    const pool = d.foes.filter((k) => k !== 'brute' || o.brutes !== false && (d.n >= 3 || this.alerts.n >= 2));
    if (d.n >= 6 && pool.includes('fly')) pool.push('fly');
    const eliteP = d.n >= 3 ? Math.min(0.28, 0.035 * d.n) : 0;
    const span = o.span ?? 0;
    let t = this.time + 0.3;
    const spread = o.spread ?? 2;
    while (budget >= 1) {
      let kind = pool[Math.floor(this.rnd() * pool.length)];
      if (this.rnd() < 0.35) kind = 'xs';
      if (FOE[kind].cost > budget) kind = 'xs';
      const elite = kind !== 'xs' && this.rnd() < eliteP;
      budget -= FOE[kind].cost * (elite ? 2.5 : 1);
      const a = this.rnd() * Math.PI * 2, rr = this.rnd() * spread;
      const dome = !!o.dome && (kind === 'brute' || kind === 's' || this.rnd() < 0.35);
      this.queue.push({ at: t + this.rnd() * 0.5, kind, elite, x: at.x + Math.sin(a) * rr, z: at.z + Math.cos(a) * rr, mode: o.mode, hx: at.x, hz: at.z, target: dome ? 'dome' : 'hero', wave: o.wave ?? 0 });
      if (span > 0) t += span * 0.12 * this.rnd();
    }
    this.queue.sort((a, b) => a.at - b.at);
  }

  /** A spot `r` metres from (cx, cz), inside the planet, out of the solids, away from the hero's view when it can. */
  private ringPoint(cx: number, cz: number, r: number): Spot {
    const h = this.hero;
    let best = { x: cx, z: cz - r }, bd = -1;
    for (let k = 0; k < 10; k++) {
      const a = this.rnd() * Math.PI * 2;
      let x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const pr = Math.hypot(x, z);
      if (pr > WORLD_R - 2) { x *= (WORLD_R - 2) / pr; z *= (WORLD_R - 2) / pr; }
      const p = { x, z };
      pushOut(p, 0.8, this.plan.solids);
      const dh = Math.hypot(p.x - h.x, p.z - h.z);
      if (dh > 20) return p;
      if (dh > bd) { bd = dh; best = p; }
    }
    return best;
  }

  /** The hive alert: a hunting wave from the nearest nests (or out of the dark) at the hero, or at the dome. */
  private alert(): void {
    const d = this.def, h = this.hero;
    this.alerts.n++;
    this.alerts.active = this.alerts.n;
    this.alerts.t = 0;
    this.threat = 0;
    const dome = d.kind === 'defend';
    const k = dome ? this.alerts.n : Math.min(this.alerts.n, 6);
    const weak = dome ? Math.pow(0.85, this.stats.nests) : 1;
    const budget = this.tune.budget * (dome ? 9 + 3.4 * d.n + 4 * k : 7 + 2.8 * d.n + 2.5 * k) * (1 + 0.08 * this.run.depth) * weak;
    const c = dome ? this.dome : h;
    const near = this.nests.filter((n) => n.alive && Math.hypot(n.x - c.x, n.z - c.z) < 50 && Math.hypot(n.x - h.x, n.z - h.z) > 16)
      .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, 2);
    const sources: Spot[] = near.map((n) => ({ x: n.x, z: n.z }));
    while (sources.length < 2) sources.push(this.ringPoint(c.x, c.z, dome ? 26 : 24));
    for (const s of sources) this.pack(budget / sources.length, s, { mode: 'hunt', wave: this.alerts.n, dome, spread: 2.5, span: 6 });
    this.events.push({ type: 'alert', n: this.alerts.n, of: dome ? this.alerts.of : 0, dome });
  }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    if (this.phase !== 'play') { this.stepDying(dt); this.stepPicks(dt, true); return; }
    this.time += dt;
    this.orbit += dt;
    this.aliveN = this.alive;
    this.stepHero(dt, inp);
    this.stepSpawns();
    this.stepEncounters(dt);
    this.stepFoes(dt);
    this.stepShots(dt);
    this.stepHazards(dt);
    this.stepPicks(dt, false);
    this.stepObjective(dt);
    this.stepDying(dt);
  }

  private stepDying(dt: number): void {
    for (const f of this.foes) if (f.state === 'dead') f.deadT += dt;
    if (this.foes.some((f) => f.state === 'dead' && f.deadT > 1.4)) this.foes = this.foes.filter((f) => f.state !== 'dead' || f.deadT <= 1.4);
    for (const r of this.rovers) if (r.fixed) r.leave += dt;
    if (this.castaway?.saved) this.castaway.t += dt;
  }

  // ---------------------------------------------------------------- the hero

  /** The gun's tip in the world (from the hero's frame), mech cannons by `side`. */
  muzzleAt(side = 0): { x: number; z: number; y: number } {
    const h = this.hero;
    const L = h.mech > 0 ? h.mechMuzzle[side] : h.muzzle;
    const c = Math.cos(h.face), s = Math.sin(h.face);
    // the model faces +z: its local +x is (cos, -sin) in the world, forward is (sin, cos)
    return { x: h.x + L.s * c + L.f * s, z: h.z - L.s * s + L.f * c, y: L.y };
  }

  private stepHero(dt: number, inp: Input): void {
    const h = this.hero, H = HERO[this.run.hero], m = this.m;
    if (!h.alive) return;
    h.invuln = Math.max(0, h.invuln - dt);
    h.rollCd = Math.max(0, h.rollCd - dt);
    h.rollShot = Math.max(0, h.rollShot - dt);
    h.punchCd = Math.max(0, h.punchCd - dt);
    h.punchT = Math.max(0, h.punchT - dt);
    h.kickCd = Math.max(0, h.kickCd - dt);
    h.kickT = Math.max(0, h.kickT - dt);
    h.firedT += dt;
    h.hurtT += dt;
    h.skillT = Math.max(0, h.skillT - dt);
    h.overdrive = Math.max(0, h.overdrive - dt);
    if (m.bubble && h.bubble > 0) h.bubble = Math.max(0, h.bubble - dt);
    if (m.regen && h.hurtT > 3 && h.hp < h.max) h.hp = Math.min(h.max, h.hp + 2 * dt);
    // the skill recharges one charge at a time
    if (h.charges < m.skillCharges) {
      h.skillCd -= dt;
      if (h.skillCd <= 0) { h.charges++; h.skillCd = h.charges < m.skillCharges ? H.skillCd * m.skillCd : 0; }
    }
    // the mech
    if (h.mech > 0) {
      h.mech -= dt;
      if (h.mech <= 0) { h.mech = 0; h.invuln = 1; this.events.push({ type: 'mechOff' }); }
    } else if (h.charge >= 1 && !h.mechReady) { h.mechReady = true; this.events.push({ type: 'mechReady' }); }
    if (inp.mech && h.mech <= 0 && h.charge >= 1 && !h.leap) {
      h.mech = m.mechTime;
      h.charge = 0;
      h.mechReady = false;
      h.roll = 0;
      this.events.push({ type: 'mechOn' });
      this.aoe(h.x, h.z, 4.2, 40 * m.dmg, 9, 'mech');
    }
    const mech = h.mech > 0;
    // the leap (Finn's skill) carries the hero through the air
    if (h.leap) {
      const L = h.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.max);
      h.x = L.fx + (L.tx - L.fx) * k;
      h.z = L.fz + (L.tz - L.fz) * k;
      h.invuln = Math.max(h.invuln, 0.1);
      if (k >= 1) {
        h.leap = null;
        this.clampHero();
        const pw = m.skillPower;
        this.aoe(h.x, h.z, 3.6 * (pw > 1 ? 1.25 : 1), HERO.frog.skillDmg * m.dmg * pw, 9, 'leap');
      }
      return;
    }
    // the dodge
    if (inp.dodge && !mech && h.rollCd <= 0 && h.roll <= 0) {
      const len = Math.hypot(inp.mx, inp.mz);
      if (len > 0.2) { h.rollDx = inp.mx / len; h.rollDz = inp.mz / len; } else { h.rollDx = Math.sin(h.face); h.rollDz = Math.cos(h.face); }
      h.roll = MOVE.rollTime;
      h.rollCd = MOVE.rollCd * m.dodgeCd;
      h.rollShot = MOVE.rollShot + MOVE.rollTime;
      h.face = Math.atan2(h.rollDx, h.rollDz);
      h.gunUp = 0;
      if (m.decoy) this.decoy = { x: h.x, z: h.z, t: 3 };
      this.events.push({ type: 'dodge' });
    }
    if (this.decoy) {
      this.decoy.t -= dt;
      if (this.decoy.t <= 0) { this.aoe(this.decoy.x, this.decoy.z, 2.8, 30 * m.dmg, 6, 'decoy'); this.decoy = null; }
    }
    if (h.roll > 0) {
      h.roll -= dt;
      h.x += h.rollDx * MOVE.rollSpeed * dt;
      h.z += h.rollDz * MOVE.rollSpeed * dt;
      if (h.roll <= 0 && m.dodgeWave) this.aoe(h.x, h.z, 2.6, 15 * m.dmg, 7, 'wave');
    } else {
      const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
      const sp = (mech ? MOVE.mechSpeed : H.speed * m.speed) * len;
      if (len > 0.08) {
        const l = Math.max(1e-6, Math.hypot(inp.mx, inp.mz));
        h.vx = inp.mx / l * sp; h.vz = inp.mz / l * sp;
      } else { h.vx = 0; h.vz = 0; }
      h.x += h.vx * dt;
      h.z += h.vz * dt;
    }
    this.clampHero();
    // lava burns
    if (this.plan.lava && h.roll <= 0 && this.inPool(h.x, h.z)) {
      h.lavaT -= dt;
      if (h.lavaT <= 0) { h.lavaT = 0.5; this.events.push({ type: 'burn' }); this.hurt(OBJ.lava * (1 + 0.06 * (this.def.n - 1)), 0, 0, true); }
    } else h.lavaT = 0;
    // the skill
    if (inp.skill && !mech && h.charges > 0) this.useSkill();
    // aim (only while FIRE is held): the assist's target, else straight ahead; the gun comes up
    const range = (mech ? 11 : H.range * m.range);
    const firing = inp.fire && h.roll <= 0;
    const moving = Math.hypot(h.vx, h.vz) > 0.5 && h.roll <= 0;
    h.idleFire = inp.fire ? 0 : h.idleFire + dt;
    h.aiming = firing;
    const tgt = firing ? this.aimTarget(range, moving) : null;
    h.lock = tgt && 'kind' in tgt ? tgt.id : -1;
    if (firing) {
      if (tgt) {
        const ax = tgt.x - h.x, az = tgt.z - h.z, l = Math.hypot(ax, az) || 1;
        h.aimX = ax / l; h.aimZ = az / l; h.tx = tgt.x; h.tz = tgt.z;
        h.face = turn(h.face, Math.atan2(h.aimX, h.aimZ), 14 * dt);
      } else {
        if (moving) h.face = turn(h.face, Math.atan2(h.vx, h.vz), 12 * dt);
        h.aimX = Math.sin(h.face); h.aimZ = Math.cos(h.face);
        h.tx = h.x + h.aimX * range; h.tz = h.z + h.aimZ * range;
      }
      h.gunHold = 0.5;
      h.gunUp = Math.min(1, h.gunUp + dt / 0.1);
    } else {
      h.gunHold = Math.max(0, h.gunHold - dt);
      if (h.gunHold <= 0) h.gunUp = Math.max(0, h.gunUp - dt / 0.3);
      if (moving) {
        h.face = turn(h.face, Math.atan2(h.vx, h.vz), 12 * dt);
        h.aimX = Math.sin(h.face); h.aimZ = Math.cos(h.face);
      }
    }
    if (h.roll > 0 || h.punchT > 0.15) h.gunUp = Math.min(h.gunUp, 0.3);
    // the same button punches (or the mech kicks) an alien in arm's reach
    if (firing) {
      const near = this.nearestFoe(h.x, h.z, mech ? MOVE.kickR : MOVE.punchR);
      if (near && mech && h.kickCd <= 0) {
        h.kickCd = MOVE.kickCd;
        h.kickT = 0.5;
        h.face = Math.atan2(near.x - h.x, near.z - h.z);
        this.events.push({ type: 'kick', x: near.x, z: near.z });
        this.aoe(h.x + Math.sin(h.face) * 1.2, h.z + Math.cos(h.face) * 1.2, MOVE.kickR, MOVE.kickDmg * m.dmg, 10, null);
      } else if (near && !mech && h.punchCd <= 0) {
        h.punchCd = MOVE.punchCd;
        h.punchT = 0.45;
        h.face = Math.atan2(near.x - h.x, near.z - h.z);
        this.events.push({ type: 'punch', x: near.x, z: near.z });
        const dmg = MOVE.punchDmg * m.dmg * (h.rollShot > 0 ? 2 : 1);
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn' || f.kind === 'nest') continue;
          if (Math.hypot(f.x - near.x, f.z - near.z) < 1.3) this.damage(f, dmg, false, h.aimX, h.aimZ, MOVE.punchKnock, false, false);
        }
      }
    }
    // the weapon: while FIRE is held, once the gun is up and pointing
    const facing = Math.abs(angDiff(h.face, Math.atan2(h.aimX, h.aimZ))) < 0.3;
    h.fireT -= dt * (h.overdrive > 0 ? 1.8 : 1);
    if (mech) {
      h.mechFire -= dt;
      if (firing && facing && h.mechFire <= 0) {
        h.mechFire = MOVE.mechEvery;
        h.mechShots++;
        const big = h.mechShots % 4 === 0;
        this.fire('cannon', MOVE.mechDmg * m.dmg * (big ? 1.8 : 1), 1, 0.08, 20, 0, big ? 5 : 4, MOVE.mechSplash * (big ? 1.3 : 1), 0.6, big, h.mechShots % 2);
      }
    } else if (firing && facing && h.gunUp >= 0.85 && h.fireT <= 0 && h.punchT <= 0.2) {
      h.fireT = H.every / m.rate;
      h.shots++;
      const power = h.rollShot > 0;
      const forced = m.powerShot && h.shots % 6 === 0;
      if (power) h.rollShot = 0;
      const pellets = H.pellets + m.shots;
      const spread = H.spread + (m.shots ? 0.12 * m.shots : 0);
      let dmg = H.dmg * m.dmg * (power ? 2.5 : 1);
      const crit = forced || this.rnd() < m.crit;
      if (crit) dmg *= forced ? 3 : 2.2;
      this.fire(H.shot, dmg, pellets, spread, H.shotSpeed * (0.9 + 0.1 * m.range), H.pierce + m.pierce + (power ? 2 : 0), H.knock * (power ? 1.8 : 1), H.splash, H.range * m.range / H.shotSpeed * 1.15, crit || power, 0);
    }
    // drones and blades and the nova
    if (m.drones > 0) {
      const every = 1.0;
      const k = Math.floor((this.orbit - dt) / every), k2 = Math.floor(this.orbit / every);
      if (k2 !== k) {
        for (let i = 0; i < m.drones; i++) {
          const p = this.dronePos(i);
          const t = this.nearestFoe(p.x, p.z, 9) ?? this.nearestNest(p.x, p.z, 9);
          if (!t) continue;
          const l = Math.hypot(t.x - p.x, t.z - p.z) || 1;
          this.addShot('drone', p.x, p.z, 2.1, (t.x - p.x) / l * 22, (t.z - p.z) / l * 22, 7 * m.dmg, 0.6, 0.25, 0, false, 0, 0.8, false, m.droneFrost, false);
        }
      }
    }
    if (m.blades > 0) {
      for (const [id, t] of this.bladeHit) { if (t - dt <= 0) this.bladeHit.delete(id); else this.bladeHit.set(id, t - dt); }
      for (let i = 0; i < m.blades; i++) {
        const a = this.orbit * 3.2 + (i / m.blades) * Math.PI * 2;
        const bx = h.x + Math.sin(a) * 2.3, bz = h.z + Math.cos(a) * 2.3;
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn' || f.sleep || this.bladeHit.has(f.id)) continue;
          if (Math.hypot(f.x - bx, f.z - bz) < f.r + 0.5) { this.bladeHit.set(f.id, 0.45); this.damage(f, 14 * m.dmg, false, Math.sin(a + 1.6), Math.cos(a + 1.6), 2.5, false, false); }
        }
      }
    }
    if (m.nova) {
      h.novaT -= dt;
      if (h.novaT <= 0) { h.novaT = 7; this.aoe(h.x, h.z, 5, 30 * m.dmg, 5, 'nova'); }
    }
  }

  dronePos(i: number): { x: number; z: number } {
    const h = this.hero, n = Math.max(1, this.m.drones);
    const a = this.orbit * 1.6 + (i / n) * Math.PI * 2;
    return { x: h.x + Math.sin(a) * 1.7, z: h.z + Math.cos(a) * 1.7 };
  }

  /** Inside one of the planet's pools. */
  inPool(x: number, z: number): boolean {
    for (const p of this.plan.pools) if (Math.hypot(x - p.x, z - p.z) < p.r - 0.3) return true;
    return false;
  }

  private clampHero(): void {
    const h = this.hero;
    const r = Math.hypot(h.x, h.z);
    if (r > WORLD_R) { h.x *= WORLD_R / r; h.z *= WORLD_R / r; }
    pushOut(h, 0.5, this.plan.solids);
    // the dome, the beacon, the nests and the stranded rovers are solid too
    const solid = (x: number, z: number, rr: number) => {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < rr) { const k = rr / Math.max(0.01, d); h.x = x + (h.x - x) * k; h.z = z + (h.z - z) * k; if (d < 0.01) h.z = z + rr; }
    };
    if (this.def.kind === 'defend') solid(this.dome.x, this.dome.z, this.dome.r + 0.5);
    if (this.def.kind === 'keys') solid(this.plan.base.x, this.plan.base.z, 1.8);
    for (const n of this.nests) if (n.alive) solid(n.x, n.z, (n.hive ? NEST.hive.r : NEST.nest.r) + 0.5);
    for (const r2 of this.rovers) if (!r2.fixed) solid(r2.x, r2.z, 1.6);
  }

  private useSkill(): void {
    const h = this.hero, m = this.m, H = HERO[this.run.hero];
    const pw = m.skillPower;
    if (h.charges >= m.skillCharges) h.skillCd = H.skillCd * m.skillCd;
    h.charges--;
    h.skillT = 0.6;
    this.events.push({ type: 'skill', hero: this.run.hero });
    switch (this.run.hero) {
      case 'frog': {
        const c = this.crowd(9) ?? { x: h.x + Math.sin(h.face) * 5, z: h.z + Math.cos(h.face) * 5 };
        const p = { x: c.x, z: c.z };
        const r = Math.hypot(p.x, p.z);
        if (r > WORLD_R) { p.x *= WORLD_R / r; p.z *= WORLD_R / r; }
        pushOut(p, 0.6, this.plan.solids);
        h.leap = { t: 0, max: 0.55, fx: h.x, fz: h.z, tx: p.x, tz: p.z };
        h.face = Math.atan2(p.x - h.x, p.z - h.z);
        break;
      }
      case 'bee': {
        // a fan of homing stingers out of the gun's tip
        const n = Math.round(16 * (pw > 1 ? 1.5 : 1));
        const t = this.nearestFoe(h.x, h.z, 14) ?? this.nearestNest(h.x, h.z, 14);
        if (t) h.face = Math.atan2(t.x - h.x, t.z - h.z);
        h.gunUp = 1;
        const mz = this.muzzleAt();
        for (let i = 0; i < n; i++) {
          const a = h.face + (i / (n - 1) - 0.5) * Math.PI * 1.6;
          this.addShot('sting', mz.x, mz.z, mz.y, Math.sin(a) * 12, Math.cos(a) * 12, H.skillDmg * m.dmg * pw, 2.4, 0.3, 0, false, 0, 1, true, false, false, true);
        }
        h.mx = mz.x; h.mz = mz.z; h.my = mz.y;
        h.firedT = 0;
        this.events.push({ type: 'shoot', kind: 'sting', x: mz.x, z: mz.z, y: mz.y, big: true, side: 0, gx: h.x, gz: h.z });
        break;
      }
      case 'flamingo': {
        // the Sun Lance leaves the gun's tip
        const t = this.nearestFoe(h.x, h.z, 16) ?? this.nearestNest(h.x, h.z, 16);
        if (t) { h.face = Math.atan2(t.x - h.x, t.z - h.z); h.tx = t.x; h.tz = t.z; }
        h.gunUp = 1;
        const mz = this.muzzleAt();
        const ang = t ? Math.atan2(t.x - mz.x, t.z - mz.z) : h.face;
        h.firedT = 0;
        h.mx = mz.x; h.mz = mz.z; h.my = mz.y;
        this.hazards.push({ id: this.nextId++, kind: 'lance', x: mz.x, z: mz.z, r: 0, ang, len: 16, w: 1.3 * (pw > 1 ? 1.4 : 1), t: 0, max: 0.22, dmg: H.skillDmg * m.dmg * pw, by: -1, hostile: false, done: false, y: mz.y });
        break;
      }
      case 'panda': {
        h.gunUp = 1;
        const c = this.crowd(11) ?? this.nearestNest(h.x, h.z, 11) ?? { x: h.x + Math.sin(h.face) * 6, z: h.z + Math.cos(h.face) * 6 };
        this.hazards.push({ id: this.nextId++, kind: 'meteor', x: c.x, z: c.z, r: 3.7 * (pw > 1 ? 1.25 : 1), ang: 0, len: 0, w: 0, t: 0, max: 0.7, dmg: H.skillDmg * m.dmg * pw, by: -1, hostile: false, done: false, y: 0 });
        break;
      }
    }
  }

  /** The densest spot of aliens within `range` of the hero. */
  private crowd(range: number): { x: number; z: number } | null {
    const h = this.hero;
    let best: Foe | null = null, bn = 0;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || f.sleep || f.kind === 'nest') continue;
      if (Math.hypot(f.x - h.x, f.z - h.z) > range) continue;
      let n = 0;
      for (const g of this.foes) if (g.state !== 'dead' && !g.sleep && Math.hypot(g.x - f.x, g.z - f.z) < 3.5) n += g.kind === 'boss' ? 6 : g.kind === 'nest' ? 3 : 1;
      if (n > bn) { bn = n; best = f; }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  private fire(kind: ShotKind, dmg: number, n: number, spread: number, speed: number, pierce: number, knock: number, splash: number, life: number, big: boolean, side: number): void {
    const h = this.hero, m = this.m;
    const mz = this.muzzleAt(side);
    // from the gun's tip to the target (the gun points there)
    const base = Math.atan2(h.tx - mz.x, h.tz - mz.z);
    const r = kind === 'bubble' ? 0.32 : kind === 'cannon' ? 0.3 : 0.28;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? base + (this.rnd() - 0.5) * spread : base - spread / 2 + (spread * i) / (n - 1) + (this.rnd() - 0.5) * 0.05;
      this.addShot(kind, mz.x, mz.z, mz.y, Math.sin(a) * speed, Math.cos(a) * speed, dmg, life, r * (big ? 1.4 : 1), pierce, false, splash || (m.blast ? 1.4 : 0), knock, false, m.frost, m.burn, big, kind === 'cannon' ? 0 : m.bounce);
    }
    h.firedT = 0;
    h.mx = mz.x; h.mz = mz.z; h.my = mz.y;
    this.events.push({ type: 'shoot', kind, x: mz.x, z: mz.z, y: mz.y, big, side, gx: h.x, gz: h.z });
  }

  private addShot(kind: ShotKind, x: number, z: number, y: number, vx: number, vz: number, dmg: number, life: number, r: number, pierce: number, hostile: boolean, splash: number, knock: number, home: boolean, frost: boolean, burn: boolean, big = false, bounce = 0): void {
    if (this.shots.length > 260) return;
    const h = this.hero, own = !hostile && kind !== 'drone';
    this.shots.push({ id: this.nextId++, kind, x, z, y, gx: own ? h.x : x, gz: own ? h.z : z, vx, vz, dmg, life, r, pierce, hostile, splash, knock, hit: [], crit: big, frost, burn, bounce, home, big, fresh: true });
  }

  /**
   * The aim assist: the nearest alien inside the cone round the hero's facing (aliens within
   * AIM_CLOSE count all round); standing still, else the nearest alien all round. Only with no
   * alien there: a nest (in the cone, standing: all round), then a crate (else null: the shots go
   * straight ahead).
   */
  aimTarget(range: number, moving: boolean): Foe | Crate | null {
    const h = this.hero;
    // the cone holds a body, not just its centre: a big alien counts once its edge is inside
    const inCone = (x: number, z: number, d: number, r = 0) => d < AIM_CLOSE || Math.abs(angDiff(h.face, Math.atan2(x - h.x, z - h.z))) <= AIM_CONE + Math.atan2(r, Math.max(1, d));
    let best: Foe | null = null, bd = range * 1.05;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || f.kind === 'nest' || f.sleep) continue;
      const dx = f.x - h.x, dz = f.z - h.z;
      if (Math.abs(dx) > bd + f.r || Math.abs(dz) > bd + f.r) continue;
      const d = Math.hypot(dx, dz) - f.r * 0.5;
      if (d < bd && inCone(f.x, f.z, d, f.r)) { bd = d; best = f; }
    }
    if (best) return best;
    if (!moving && (best = this.nearestFoe(h.x, h.z, range * 1.05))) return best;
    bd = range * 1.05;
    for (const n of this.nests) {
      if (!n.alive) continue;
      const f = this.foes.find((g) => g.id === n.id);
      if (!f) continue;
      const d = Math.hypot(f.x - h.x, f.z - h.z) - f.r * 0.8;
      if (d < bd && (!moving || inCone(f.x, f.z, d, f.r))) { bd = d; best = f; }
    }
    if (best) return best;
    let crate: Crate | null = null;
    bd = range * 0.8;
    for (const c of this.crates) { const d = Math.hypot(c.x - h.x, c.z - h.z); if (d < bd && (!moving || inCone(c.x, c.z, d))) { bd = d; crate = c; } }
    return crate;
  }

  /** What holding FIRE right now would aim at (the bot's trigger finger). */
  fireTarget(): Foe | Crate | null {
    const h = this.hero;
    if (!h.alive || this.phase !== 'play' || h.leap) return null;
    return this.aimTarget(h.mech > 0 ? 11 : HERO[this.run.hero].range * this.m.range, Math.hypot(h.vx, h.vz) > 0.5);
  }

  /** The nearest living alien (not a nest) within `range`. */
  nearestFoe(x: number, z: number, range: number, skip?: number[]): Foe | null {
    let best: Foe | null = null, bd = range;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || f.kind === 'nest' || f.sleep) continue;
      if (skip && skip.includes(f.id)) continue;
      const dx = f.x - x, dz = f.z - z;
      if (Math.abs(dx) > bd + f.r || Math.abs(dz) > bd + f.r) continue;
      const d = Math.hypot(dx, dz) - f.r * 0.5;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  /** The nearest standing nest within `range` (measured to its edge). */
  nearestNest(x: number, z: number, range: number): Foe | null {
    let best: Foe | null = null, bd = range;
    for (const n of this.nests) {
      if (!n.alive) continue;
      const f = this.foes.find((g) => g.id === n.id);
      if (!f) continue;
      const d = Math.hypot(f.x - x, f.z - z) - f.r * 0.8;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  private nearestCrate(x: number, z: number, range: number): Crate | null {
    let best: Crate | null = null, bd = range;
    for (const c of this.crates) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /** An area blow from the hero's side. */
  private aoe(x: number, z: number, r: number, dmg: number, knock: number, kind: Extract<SimEvent, { type: 'boom' }>['kind'] | null): void {
    if (kind) this.events.push({ type: 'boom', x, z, r, kind });
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < r + f.r) {
        const l = d || 1;
        this.damage(f, dmg, false, (f.x - x) / l, (f.z - z) / l, knock, this.m.frost && kind === 'meteor', kind === 'meteor' || (kind === 'ember' && this.m.burn));
      }
    }
    for (const c of [...this.crates]) if (Math.hypot(c.x - x, c.z - z) < r) { c.hp -= dmg; if (c.hp <= 0) this.breakCrate(c); }
  }

  // ---------------------------------------------------------------- damage

  damage(f: Foe, dmg: number, crit: boolean, dx: number, dz: number, knock: number, frost: boolean, burn: boolean): void {
    if (f.state === 'dead' || f.state === 'spawn') return;
    if (f.kind === 'boss' && this.shielded) { dmg *= NEST.shield; crit = false; }
    dmg = Math.round(dmg);
    f.hp -= dmg;
    f.hitT = 0;
    this.stats.damage += dmg;
    if (f.kind !== 'nest') {
      const resist = f.kind === 'boss' ? 0.08 : f.kind === 'brute' ? 0.3 : f.elite ? 0.6 : 1;
      f.kx += dx * knock * resist;
      f.kz += dz * knock * resist;
      if (frost) f.slow = 1.5;
      if (burn) { f.burn = 2; f.burnDps = 6 * this.m.dmg; }
      f.engaged = true;
    } else {
      // a nest under fire wakes and calls for help
      const n = this.nests.find((s) => s.id === f.id);
      if (n && !n.awake) this.wakeNest(n);
    }
    this.events.push({ type: 'hit', id: f.id, x: f.x, z: f.z, dmg, crit });
    // a blob stunned by a big blow loses its wind-up
    if (f.state === 'wind' && f.kind !== 'boss' && f.kind !== 'brute' && knock > 5) { f.state = 'move'; f.cd = 0.6; }
    if (f.hp <= 0) this.kill(f);
  }

  private kill(f: Foe, quiet = false): void {
    f.state = 'dead';
    f.deadT = 0;
    f.hp = 0;
    if (quiet) return;
    this.stats.kills += f.kind === 'nest' ? 0 : 1;
    this.run.kills += f.kind === 'nest' ? 0 : 1;
    this.run.score += f.score;
    this.events.push({ type: 'kill', id: f.id, x: f.x, z: f.z, kind: f.kind, elite: f.elite, boss: f.boss });
    const h = this.hero;
    if (h.mech <= 0 && h.charge < 1) h.charge = Math.min(1, h.charge + f.mech * this.m.mechCharge);
    if (this.m.vampire && h.alive) h.hp = Math.min(h.max, h.hp + 1);
    // drops: XP orbs, sometimes health, ammo, thunder, a crystal jar
    let xp = f.xp;
    const wide = f.kind === 'boss' || f.kind === 'nest';
    while (xp > 0) {
      const v = xp >= 8 ? 8 : xp >= 3 ? 3 : 1;
      xp -= v;
      const a = this.rnd() * Math.PI * 2, r = this.rnd() * (wide ? 2.5 : 0.6);
      this.picks.push({ id: this.nextId++, kind: 'xp', x: f.x + Math.sin(a) * r, z: f.z + Math.cos(a) * r, v, t: 0, pull: false });
    }
    if (f.kind === 'nest') { this.nestDown(f); return; }
    const roll = this.rnd();
    const heal = this.tune.healDrop * (f.elite ? 6 : 1) * (f.kind === 'brute' ? 3 : 1);
    if (roll < heal) this.drop('health', f.x, f.z);
    else if (roll < heal + 0.012) this.drop('bullets', f.x, f.z);
    else if (roll < heal + 0.02) this.drop('thunder', f.x, f.z);
    if (f.elite || (f.kind === 'brute' && this.rnd() < 0.3) || (this.m.jars && this.rnd() < 0.04)) this.drop('jar', f.x, f.z);
    if (f.kind === 'boss') { this.drop('jar', f.x + 1, f.z); this.drop('jar', f.x - 1, f.z); this.drop('health', f.x, f.z + 1); }
  }

  /** A nest falls: loot, a lower hive alert, its guards lose heart (they keep fighting but no more come). */
  private nestDown(f: Foe): void {
    const i = this.nests.findIndex((n) => n.id === f.id);
    const n = this.nests[i];
    if (!n) return;
    n.alive = false;
    this.stats.nests++;
    this.threat = Math.max(0, this.threat - THREAT.destroy);
    this.drop('jar', f.x + 1.2, f.z);
    if (n.hive) this.drop('jar', f.x - 1.2, f.z);
    this.drop(this.rnd() < 0.5 ? 'health' : 'thunder', f.x, f.z + 1.2);
    this.events.push({ type: 'boom', x: f.x, z: f.z, r: f.r * 2.2, kind: 'nest' });
    const left = this.nests.filter((s) => (s.target || s.guard) && s.alive).length;
    this.events.push({ type: 'nestDown', i, left, x: f.x, z: f.z, hive: n.hive });
    if (n.guard && !this.shielded) this.events.push({ type: 'shieldDown' });
  }

  private drop(kind: PickKind, x: number, z: number): void {
    const v = kind === 'jar' ? 4 + this.def.n : 1;
    this.picks.push({ id: this.nextId++, kind, x: x + (this.rnd() - 0.5), z: z + (this.rnd() - 0.5), v, t: 0, pull: false });
  }

  private breakCrate(c: Crate): void {
    this.crates = this.crates.filter((o) => o !== c);
    this.events.push({ type: 'crate', x: c.x, z: c.z });
    const r = this.rnd();
    this.drop(r < 0.3 ? 'health' : r < 0.55 ? 'bullets' : r < 0.7 ? 'thunder' : 'jar', c.x, c.z);
    if (this.m.jars) this.drop('jar', c.x, c.z);
  }

  /** The hero takes a blow (unless rolling, invulnerable or shielded; lava ignores the shield's grace). */
  hurt(dmg: number, dx = 0, dz = 0, lava = false): void {
    const h = this.hero;
    if (!h.alive || (!lava && h.invuln > 0) || h.roll > 0 || h.leap || this.phase !== 'play') return;
    if (lava && h.invuln > 1) return;
    if (!lava && this.m.bubble && h.bubble <= 0 && h.mech <= 0) { h.bubble = this.m.bubble; h.invuln = 0.4; this.events.push({ type: 'blocked' }); return; }
    if (h.mech > 0) dmg *= MOVE.mechArmor;
    dmg = Math.max(1, Math.round(dmg));
    h.hp -= dmg;
    this.stats.taken += dmg;
    this.stats.low = Math.min(this.stats.low, Math.max(0, h.hp) / h.max);
    if (!lava) h.invuln = h.mech > 0 ? 0.25 : MOVE.invuln;
    h.hurtT = 0;
    h.x += dx * 0.6; h.z += dz * 0.6;
    this.clampHero();
    this.events.push({ type: 'hurt', dmg });
    if (h.hp > 0) return;
    if (this.m.revive && !h.reviveUsed) { h.reviveUsed = true; this.reviveHero(0.4, 'hull'); return; }
    if (this.m.angel && !this.run.angelUsed) { this.run.angelUsed = true; this.reviveHero(0.5, 'angel'); return; }
    h.hp = 0;
    h.alive = false;
    h.mech = 0;
    this.phase = 'lost';
    this.events.push({ type: 'die' }, { type: 'lose', why: 'hero' });
  }

  private reviveHero(k: number, how: 'hull' | 'angel'): void {
    const h = this.hero;
    h.hp = Math.round(h.max * k);
    h.invuln = 2.2;
    this.events.push({ type: 'revive', how });
    this.aoe(h.x, h.z, 5, 30 * this.m.dmg, 12, 'nova');
  }

  /** A rewarded continue (the run's last loss): the hero is back with half health, the aliens nearby pushed off. */
  revive(): void {
    const h = this.hero;
    h.alive = true;
    h.hp = Math.round(h.max * 0.6);
    h.invuln = 2.5;
    h.leap = null;
    h.roll = 0;
    if (this.def.kind === 'defend' && this.dome.hp <= 0) this.dome.hp = Math.round(this.dome.max * 0.5);
    this.phase = 'play';
    this.hazards = this.hazards.filter((z) => !z.hostile);
    this.shots = this.shots.filter((s) => !s.hostile);
    for (const f of this.foes) {
      if (f.state === 'dead' || f.kind === 'boss' || f.kind === 'nest') continue;
      const d = Math.hypot(f.x - h.x, f.z - h.z);
      if (d < 6) this.damage(f, 9999, false, 0, 0, 0, false, false);
    }
    this.events.push({ type: 'revive', how: 'angel' }, { type: 'boom', x: h.x, z: h.z, r: 6, kind: 'nova' });
  }

  // ---------------------------------------------------------------- encounters

  private stepSpawns(): void {
    while (this.queue.length && this.queue[0].at <= this.time && this.aliveN < 46) {
      this.spawnQueued(this.queue.shift()!);
      this.aliveN++;
    }
  }

  private wakeNest(n: NestState): void {
    n.awake = true;
    n.cd = NEST.every;
    const d = this.def;
    const i = this.nests.indexOf(n);
    this.pack(this.tune.budget * (5 + 1.1 * d.n) * (n.hive ? 1.4 : 1), { x: n.x, z: n.z }, { mode: 'guard', spread: 4, span: 3 });
    this.events.push({ type: 'nestWake', i, x: n.x, z: n.z });
  }

  /** Nests wake and call for help, camps wake, the hive alert rises; the defence's alerts come on time. */
  private stepEncounters(dt: number): void {
    const h = this.hero, d = this.def;
    let hot = false;
    for (const n of this.nests) {
      if (!n.alive) continue;
      const dh = Math.hypot(h.x - n.x, h.z - n.z);
      if (!n.awake && dh < NEST.wake && h.alive) this.wakeNest(n);
      if (!n.awake || dh > NEST.stay) continue;
      hot = true;
      n.cd -= dt;
      if (n.cd <= 0) {
        n.cd = NEST.every * (n.hive ? 0.8 : 1);
        let near = 0;
        for (const f of this.foes) if (f.state !== 'dead' && f.mode === 'guard' && Math.hypot(f.hx - n.x, f.hz - n.z) < 1) near++;
        if (near < NEST.cap) this.pack(this.tune.budget * (2 + 0.35 * d.n) * (n.hive ? 1.3 : 1), { x: n.x, z: n.z }, { mode: 'guard', spread: 2.5 });
      }
    }
    for (const c of this.camps) {
      if (c.awake || !h.alive) continue;
      if (Math.hypot(h.x - c.x, h.z - c.z) < 19) { c.awake = true; this.pack(this.tune.budget * c.budget, c, { mode: 'guard', spread: 3.5, brutes: d.n >= 5 }); }
    }
    // the boss wakes when the hero comes into its lair
    const b = this.boss;
    if (b && !this.bossAwake && b.state !== 'dead' && Math.hypot(h.x - b.hx, h.z - b.hz) < 21) {
      this.bossAwake = true;
      b.engaged = true;
      this.events.push({ type: 'boss', id: d.boss! });
    }
    // the alert under way ends when its aliens are down (or after a while)
    if (this.alerts.active) {
      this.alerts.t += dt;
      let left = 0;
      for (const f of this.foes) if (f.state !== 'dead' && f.wave === this.alerts.active) left++;
      for (const q of this.queue) if (q.wave === this.alerts.active) left++;
      if (left === 0 || (this.alerts.t > 55 && left <= 2)) {
        const n = this.alerts.active;
        this.alerts.active = 0;
        this.alerts.done++;
        for (const f of this.foes) if (f.wave === n) f.wave = 0;
        this.events.push({ type: 'alertEnd', n });
      }
    }
    if (d.kind === 'defend') {
      if (!this.alerts.active && this.alerts.n < this.alerts.of) {
        this.alerts.next -= dt;
        if (this.alerts.next <= 0) { this.alert(); this.alerts.next = OBJ.alertGap; }
      }
      return;
    }
    if (d.kind === 'keys' && this.keys.hold >= 0) return;
    if (this.alerts.active || !h.alive) return;
    this.threat += dt * this.tune.threat * (THREAT.base + (hot ? THREAT.nest : 0));
    if (this.threat >= 1) this.alert();
  }

  private stepFoes(dt: number): void {
    const h = this.hero;
    const list = this.foes;
    const dome = this.def.kind === 'defend' && this.dome.hp > 0;
    for (const f of list) {
      if (f.state === 'dead' || f.kind === 'nest') continue;
      const dh = Math.hypot(h.x - f.x, h.z - f.z);
      // far guards and patrols sleep
      f.sleep = !f.engaged && f.mode !== 'hunt' && dh > SLEEP_R;
      if (f.sleep) continue;
      f.hitT += dt;
      if (f.state === 'spawn') { f.t -= dt; if (f.t <= 0) { f.state = 'move'; f.t = 0; } continue; }
      if (f.burn > 0) {
        f.burn -= dt;
        f.hp -= f.burnDps * dt;
        if (f.hp <= 0) { this.kill(f); continue; }
      }
      if (this.plan.lava && f.kind !== 'boss' && f.kind !== 'fly' && f.burn <= 0 && this.inPool(f.x, f.z)) { f.burn = 1; f.burnDps = 5; }
      f.slow = Math.max(0, f.slow - dt);
      f.cd -= dt;
      // knockback slides off
      f.x += f.kx * dt; f.z += f.kz * dt;
      const decay = Math.exp(-7 * dt);
      f.kx *= decay; f.kz *= decay;
      if (f.kind === 'boss') { this.stepBoss(f, dt, dh); this.keepIn(f); continue; }
      // engaged or not: guards look after their post, patrols after their route
      if (f.mode === 'guard') {
        const dp = Math.hypot(h.x - f.hx, h.z - f.hz);
        if (h.alive && (dp < 22 || dh < 12 || f.hitT < 4)) f.engaged = true;
        else if (dp > 32 && f.hitT > 4) f.engaged = false;
      } else if (f.mode === 'patrol') {
        if (h.alive && (dh < 11 || f.hitT < 4)) f.engaged = true;
        else if (dh > 26 && f.hitT > 4) f.engaged = false;
      } else f.engaged = true;
      if (!h.alive) f.engaged = false;
      const spd = f.speed * (f.slow > 0 ? 0.6 : 1);
      if (!f.engaged) {
        // idle: walk the route or wander round the post
        let gx: number, gz: number;
        if (f.route) {
          const w = f.route[f.wp % f.route.length];
          if (Math.hypot(w.x - f.x, w.z - f.z) < 1.5) f.wp++;
          gx = w.x; gz = w.z;
        } else {
          f.wt -= dt;
          if (f.wt <= 0 || Math.hypot(f.wx - f.x, f.wz - f.z) < 0.6) {
            const a = this.rnd() * Math.PI * 2, r = this.rnd() * 4;
            f.wx = f.hx + Math.sin(a) * r; f.wz = f.hz + Math.cos(a) * r; f.wt = 2 + this.rnd() * 3;
          }
          gx = f.wx; gz = f.wz;
        }
        const dx = gx - f.x, dz = gz - f.z, dd = Math.hypot(dx, dz);
        if (dd > 0.5) {
          const k = f.route ? 0.55 : Math.hypot(f.x - f.hx, f.z - f.hz) > 6 ? 0.9 : 0.35;
          f.x += (dx / dd) * spd * k * dt; f.z += (dz / dd) * spd * k * dt;
          f.face = turn(f.face, Math.atan2(dx, dz), 5 * dt);
        }
        if (f.state !== 'move') { f.t -= dt; if (f.t <= 0) f.state = 'move'; }
        this.keepIn(f);
        continue;
      }
      // the target: the hero, the dome, or the decoy when it is closer
      let tx = h.x, tz = h.z;
      // an alien on its way to the dome turns on the hero who comes close
      const toDome = f.target === 'dome' && dome && !(h.alive && dh < 3.5);
      if (toDome) { tx = this.dome.x; tz = this.dome.z; }
      if (this.decoy && Math.hypot(this.decoy.x - f.x, this.decoy.z - f.z) < Math.hypot(tx - f.x, tz - f.z) + 3) { tx = this.decoy.x; tz = this.decoy.z; }
      const dx = tx - f.x, dz = tz - f.z, dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist, uz = dz / dist;
      const atDome = toDome && tx === this.dome.x && tz === this.dome.z;
      const reach = atDome ? this.dome.r + f.r + 0.2 : f.r + 0.45;
      switch (f.state) {
        case 'move': {
          if (f.kind === 'fly' && !atDome) {
            // keep a spitting distance, circle the hero
            let mx = 0, mz = 0;
            if (dist > 9) { mx = ux; mz = uz; } else if (dist < 6) { mx = -ux; mz = -uz; }
            mx += -uz * f.strafe * 0.7; mz += ux * f.strafe * 0.7;
            const l = Math.hypot(mx, mz) || 1;
            f.x += (mx / l) * spd * dt; f.z += (mz / l) * spd * dt;
            f.face = turn(f.face, Math.atan2(ux, uz), 6 * dt);
            f.spitCd -= dt; f.diveCd -= dt;
            if (f.diveCd <= 0 && dist < 9) { f.state = 'wind'; f.t = 0.7; f.move = 'dive'; f.ax = tx; f.az = tz; this.tele('dive', f, Math.atan2(ux, uz), dist + 2); }
            else if (f.spitCd <= 0 && dist < 11) { f.state = 'wind'; f.t = 0.5; f.move = 'fan'; }
            if (this.rnd() < dt * 0.3) f.strafe = -f.strafe;
          } else {
            if (dist > reach) { f.x += ux * spd * dt; f.z += uz * spd * dt; }
            f.face = turn(f.face, Math.atan2(ux, uz), 8 * dt);
            if (f.cd <= 0) {
              if (f.kind === 'xs' && dist < reach + 0.25) { f.state = 'strike'; f.t = 0.35; f.cd = 0.9; this.contact(f, atDome); }
              else if (f.kind === 's' && dist < reach + 0.9) { f.state = 'wind'; f.t = 0.45; }
              else if (f.kind === 'brute' && dist < reach + 2.0) { f.state = 'wind'; f.t = 0.9; this.tele('slam', f, 0, 0, 2.9); }
              else if (f.kind === 'fly' && dist < reach + 0.3) { f.state = 'strike'; f.t = 0.4; f.cd = 1; this.contact(f, atDome); }
            }
          }
          break;
        }
        case 'wind': {
          f.t -= dt;
          if (f.t > 0) break;
          if (f.kind === 's') {
            f.state = 'strike'; f.t = 0.35; f.cd = 1.2;
            if (atDome ? dist < reach + 0.6 : dh < f.r + 1.4) this.contact(f, atDome);
          } else if (f.kind === 'brute') {
            f.state = 'strike'; f.t = 0.5; f.cd = 2.2;
            this.events.push({ type: 'boom', x: f.x, z: f.z, r: 2.9, kind: 'slam' });
            if (atDome && dist < this.dome.r + 3.2) this.hitDome(f.dmg);
            if (dh < 2.9 + 0.3) this.hurt(f.dmg, ux, uz);
          } else if (f.kind === 'fly') {
            if (f.move === 'dive') {
              f.state = 'dive'; f.t = 0.65; f.cd = 0.5;
              const l = Math.hypot(f.ax - f.x, f.az - f.z) || 1;
              f.kx = 0; f.kz = 0; f.ax = (f.ax - f.x) / l; f.az = (f.az - f.z) / l;
              f.diveCd = 5 + this.rnd() * 3;
            } else {
              f.state = 'strike'; f.t = 0.3; f.spitCd = 2.4 + this.rnd() * 1.2;
              const a = Math.atan2(ux, uz);
              for (const o of f.elite ? [-0.25, 0, 0.25] : [0]) this.addShot('spit', f.x, f.z, 1.3, Math.sin(a + o) * 10, Math.cos(a + o) * 10, f.dmg, 2.2, 0.35, 0, true, 0, 0, false, false, false);
              this.events.push({ type: 'spit', x: f.x, z: f.z });
            }
          }
          break;
        }
        case 'dive': {
          f.t -= dt;
          f.x += f.ax * 13 * this.spdK * dt; f.z += f.az * 13 * this.spdK * dt;
          f.face = Math.atan2(f.ax, f.az);
          if (Math.hypot(h.x - f.x, h.z - f.z) < f.r + 0.6) this.hurt(f.dmg * 1.2, f.ax, f.az);
          if (f.t <= 0) { f.state = 'move'; }
          break;
        }
        case 'strike': {
          f.t -= dt;
          if (f.t <= 0) f.state = 'move';
          break;
        }
      }
      this.keepIn(f);
    }
    // keep apart (and off the hero, the dome, the nests, the rovers)
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'dead' || a.state === 'spawn' || a.sleep || a.kind === 'nest') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'dead' || b.state === 'spawn' || b.sleep || b.kind === 'nest') continue;
        const dx = b.x - a.x, dz = b.z - a.z, min = (a.r + b.r) * 0.85;
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / d * 0.5;
        const wa = a.kind === 'boss' ? 0.05 : 0.5, wb = b.kind === 'boss' ? 0.05 : 0.5;
        a.x -= dx * push * wb * 2; a.z -= dz * push * wb * 2;
        b.x += dx * push * wa * 2; b.z += dz * push * wa * 2;
      }
      const dh = Math.hypot(a.x - h.x, a.z - h.z), mh = a.r + 0.4;
      if (h.alive && dh < mh && dh > 1e-4 && a.state !== 'dive') { const k = (mh - dh) / dh; a.x += (a.x - h.x) * k; a.z += (a.z - h.z) * k; }
      if (this.def.kind === 'defend') {
        const dd = Math.hypot(a.x - this.dome.x, a.z - this.dome.z), md = this.dome.r + a.r * 0.8;
        if (dd < md && dd > 1e-4) { a.x = this.dome.x + (a.x - this.dome.x) * md / dd; a.z = this.dome.z + (a.z - this.dome.z) * md / dd; }
      }
      for (const n of this.nests) {
        if (!n.alive) continue;
        const nr = (n.hive ? NEST.hive.r : NEST.nest.r) + a.r * 0.6;
        const dx = a.x - n.x, dz = a.z - n.z;
        if (Math.abs(dx) > nr || Math.abs(dz) > nr) continue;
        const dd = Math.hypot(dx, dz);
        if (dd < nr && dd > 1e-4) { a.x = n.x + dx * nr / dd; a.z = n.z + dz * nr / dd; }
      }
      if (a.kind !== 'fly' && a.boss !== 'queen') pushOut(a, a.r * 0.8, this.plan.solids);
    }
  }

  /** Inside the planet (and the boss in its lair). */
  private keepIn(f: Foe): void {
    const r = Math.hypot(f.x, f.z);
    if (r > WORLD_R + 1) { f.x *= (WORLD_R + 1) / r; f.z *= (WORLD_R + 1) / r; }
    if (f.mode === 'lair') {
      const dx = f.x - f.hx, dz = f.z - f.hz, d = Math.hypot(dx, dz);
      if (d > 20) { f.x = f.hx + dx * 20 / d; f.z = f.hz + dz * 20 / d; }
    }
  }

  private contact(f: Foe, dome: boolean): void {
    if (dome) { this.hitDome(f.dmg); return; }
    const h = this.hero;
    const d = Math.hypot(h.x - f.x, h.z - f.z) || 1;
    if (d < f.r + 1.2) this.hurt(f.dmg, (h.x - f.x) / d, (h.z - f.z) / d);
  }

  private hitDome(dmg: number): void {
    if (this.dome.hp <= 0 || this.phase !== 'play') return;
    this.dome.hp = Math.max(0, this.dome.hp - dmg * 0.25);
    this.events.push({ type: 'domeHit', hp: this.dome.hp, max: this.dome.max });
    if (this.dome.hp <= 0) { this.phase = 'lost'; this.events.push({ type: 'lose', why: 'dome' }); }
  }

  private tele(kind: HazKind, f: Foe, ang: number, len: number, r = 0): void {
    const max = kind === 'slam' ? (f.kind === 'boss' ? 1.0 : 0.9) : kind === 'dive' ? 0.7 : 0.9;
    this.hazards.push({ id: this.nextId++, kind, x: f.x, z: f.z, r, ang, len, w: kind === 'dive' ? f.r * 2 : 2.2, t: 0, max, dmg: 0, by: f.id, hostile: true, done: false, y: 0 });
    this.events.push({ type: 'tele', kind, x: f.x, z: f.z });
  }

  // ---------------------------------------------------------------- bosses

  private stepBoss(f: Foe, dt: number, dh: number): void {
    const h = this.hero, B = BOSS[f.boss!];
    // asleep in its lair, or back to it when the hero ran off (it heals a little)
    const fromLair = Math.hypot(h.x - f.hx, h.z - f.hz);
    if (this.bossAwake && (fromLair > 40 || !h.alive)) f.engaged = false;
    else if (this.bossAwake && fromLair < 30) f.engaged = true;
    if (!f.engaged) {
      const dx = f.hx - f.x, dz = f.hz - f.z, d = Math.hypot(dx, dz);
      if (d > 1) { f.x += (dx / d) * f.speed * dt; f.z += (dz / d) * f.speed * dt; f.face = turn(f.face, Math.atan2(dx, dz), 3 * dt); }
      if (this.bossAwake) f.hp = Math.min(f.max, f.hp + f.max * 0.02 * dt);
      if (f.state !== 'move') { f.t -= dt; if (f.t <= 0) f.state = 'move'; }
      return;
    }
    const dx = h.x - f.x, dz = h.z - f.z, dist = dh || 1;
    const ux = dx / dist, uz = dz / dist;
    if (!f.rage && f.hp < f.max * 0.5) { f.rage = true; this.events.push({ type: 'rage' }); }
    const pace = f.rage ? 1.35 : 1;
    switch (f.state) {
      case 'move': {
        if (B.kind === 'fly') {
          let mx = 0, mz = 0;
          if (dist > 8) { mx = ux; mz = uz; } else if (dist < 5) { mx = -ux; mz = -uz; }
          mx += -uz * f.strafe * 0.8; mz += ux * f.strafe * 0.8;
          const l = Math.hypot(mx, mz) || 1;
          f.x += (mx / l) * f.speed * dt; f.z += (mz / l) * f.speed * dt;
          if (this.rnd() < dt * 0.25) f.strafe = -f.strafe;
        } else if (dist > f.r + 1.5) { f.x += ux * f.speed * pace * dt; f.z += uz * f.speed * pace * dt; }
        f.face = turn(f.face, Math.atan2(ux, uz), 4 * dt);
        if (f.cd <= 0) this.bossPick(f, dist, ux, uz);
        break;
      }
      case 'wind': {
        f.t -= dt;
        if (f.t > 0) break;
        this.bossStrike(f, ux, uz);
        break;
      }
      case 'dive': {
        f.t -= dt;
        f.x += f.ax * 15 * dt; f.z += f.az * 15 * dt;
        f.face = Math.atan2(f.ax, f.az);
        if (Math.hypot(h.x - f.x, h.z - f.z) < f.r + 0.7) this.hurt(f.dmg * 1.1, f.ax, f.az);
        if (f.t <= 0 || Math.hypot(f.x - f.hx, f.z - f.hz) > 19) { f.state = 'strike'; f.t = 0.5; }
        break;
      }
      case 'strike': {
        f.t -= dt;
        if (f.t <= 0) { f.state = 'move'; f.cd = (f.rage ? 1.5 : 2.2) * (this.run.mode === 'easy' ? 1.3 : 1); }
        break;
      }
    }
  }

  private bossPick(f: Foe, dist: number, ux: number, uz: number): void {
    const B = BOSS[f.boss!];
    const opts: BossMove[] = B.kind === 'fly'
      ? ['fan', 'fan', 'dive', 'summon', ...(f.rage ? ['ring' as BossMove] : [])]
      : ['slam', 'charge', 'charge', 'summon', ...(f.boss === 'king' ? ['ring' as BossMove] : []), ...(f.rage ? ['quake' as BossMove] : [])];
    let mv = opts[Math.floor(this.rnd() * opts.length)];
    if (mv === 'slam' && dist > 6) mv = 'charge';
    if (mv === 'summon' && this.aliveN > 22) mv = B.kind === 'fly' ? 'fan' : 'charge';
    f.move = mv;
    f.state = 'wind';
    switch (mv) {
      case 'slam': f.t = 1.0; this.tele('slam', f, 0, 0, 4.4); break;
      case 'charge': case 'dive': {
        f.t = 0.85;
        f.ax = ux; f.az = uz;
        this.tele('charge', f, Math.atan2(ux, uz), 12);
        break;
      }
      case 'quake': {
        f.t = 1.0;
        const h = this.hero;
        for (let i = 0; i < 3; i++) {
          const a = this.rnd() * Math.PI * 2, r = i === 0 ? 0 : 2 + this.rnd() * 3;
          this.hazards.push({ id: this.nextId++, kind: 'slam', x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r, r: 2.4, ang: 0, len: 0, w: 0, t: -i * 0.35, max: 1.0, dmg: f.dmg, by: f.id, hostile: true, done: false, y: 0 });
        }
        this.events.push({ type: 'tele', kind: 'slam', x: h.x, z: h.z });
        break;
      }
      case 'ring': f.t = 0.8; this.tele('slam', f, 0, 0, 2.2); break;
      default: f.t = 0.6;
    }
  }

  private bossStrike(f: Foe, ux: number, uz: number): void {
    const h = this.hero;
    switch (f.move) {
      case 'slam': {
        f.state = 'strike'; f.t = 0.6;
        this.events.push({ type: 'boom', x: f.x, z: f.z, r: 4.4, kind: 'slam' });
        if (Math.hypot(h.x - f.x, h.z - f.z) < 4.4 + 0.3) this.hurt(f.dmg * 1.2, ux, uz);
        break;
      }
      case 'charge': case 'dive': f.state = 'dive'; f.t = 0.8; break;
      case 'summon': {
        f.state = 'strike'; f.t = 0.6;
        const n = f.boss === 'king' ? 2 : 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + this.rnd();
          const kind: MobKind = f.boss === 'king' ? (i === 0 ? 'brute' : 's') : 'xs';
          this.queue.push({ at: this.time + i * 0.1, kind, elite: false, x: f.x + Math.sin(a) * 3, z: f.z + Math.cos(a) * 3, mode: 'hunt', hx: f.x, hz: f.z, target: 'hero', wave: 0 });
        }
        if (f.boss === 'king') this.queue.push(
          { at: this.time + 0.3, kind: 'xs', elite: false, x: f.x + 2, z: f.z, mode: 'hunt', hx: f.x, hz: f.z, target: 'hero', wave: 0 },
          { at: this.time + 0.4, kind: 'xs', elite: false, x: f.x - 2, z: f.z, mode: 'hunt', hx: f.x, hz: f.z, target: 'hero', wave: 0 },
        );
        this.queue.sort((a, b) => a.at - b.at);
        break;
      }
      case 'fan': {
        f.state = 'strike'; f.t = 0.5;
        const a = Math.atan2(ux, uz), n = f.rage ? 9 : 7;
        for (let i = 0; i < n; i++) {
          const o = -0.7 + (1.4 * i) / (n - 1);
          this.addShot('spit', f.x, f.z, 2.2, Math.sin(a + o) * 9, Math.cos(a + o) * 9, f.dmg * 0.7, 2.5, 0.4, 0, true, 0, 0, false, false, false);
        }
        this.events.push({ type: 'spit', x: f.x, z: f.z });
        break;
      }
      case 'ring': {
        f.state = 'strike'; f.t = 0.5;
        if (f.boss === 'queen') {
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            this.addShot('spit', f.x, f.z, 2.2, Math.sin(a) * 8, Math.cos(a) * 8, f.dmg * 0.6, 2.8, 0.4, 0, true, 0, 0, false, false, false);
          }
          this.events.push({ type: 'spit', x: f.x, z: f.z });
        } else {
          // a ring of fire rolling out from the king: roll through it
          this.hazards.push({ id: this.nextId++, kind: 'ring', x: f.x, z: f.z, r: 0.5, ang: 0, len: 0, w: 0, t: 0, max: 1.8, dmg: f.dmg, by: f.id, hostile: true, done: false, y: 0 });
          this.events.push({ type: 'boom', x: f.x, z: f.z, r: 3, kind: 'slam' });
        }
        break;
      }
      case 'quake': f.state = 'strike'; f.t = 0.8; break;
      default: f.state = 'strike'; f.t = 0.3;
    }
  }

  // ---------------------------------------------------------------- shots

  private stepShots(dt: number): void {
    const h = this.hero;
    const keep: Shot[] = [];
    let chained = false;
    for (const s of this.shots) {
      // a new shot stays at the gun's tip for its first frame
      if (s.fresh) { s.fresh = false; keep.push(s); continue; }
      s.life -= dt;
      if (s.home && !s.hostile) {
        const t = this.nearestFoe(s.x, s.z, 9, s.hit) ?? this.nearestNest(s.x, s.z, 9);
        if (t) {
          const sp = Math.hypot(s.vx, s.vz) + 18 * dt;
          const want = Math.atan2(t.x - s.x, t.z - s.z), cur = Math.atan2(s.vx, s.vz);
          const a = turn(cur, want, 9 * dt);
          s.vx = Math.sin(a) * Math.min(20, sp); s.vz = Math.cos(a) * Math.min(20, sp);
        }
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      let dead = s.life <= 0;
      if (s.hostile) {
        if (h.alive && Math.hypot(h.x - s.x, h.z - s.z) < s.r + 0.45) {
          if (h.roll <= 0 && !h.leap) { this.hurt(s.dmg, s.vx / 9, s.vz / 9); dead = true; }
        }
      } else {
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn' || f.sleep || s.hit.includes(f.id)) continue;
          const lim = f.r + s.r;
          if (Math.abs(f.x - s.x) > lim || Math.abs(f.z - s.z) > lim) continue;
          if (Math.hypot(f.x - s.x, f.z - s.z) > lim) continue;
          const sp = Math.hypot(s.vx, s.vz) || 1;
          s.hit.push(f.id);
          this.damage(f, s.dmg, s.crit, s.vx / sp, s.vz / sp, s.knock, s.frost, s.burn);
          if (s.splash > 0) {
            this.events.push({ type: 'boom', x: s.x, z: s.z, r: s.splash, kind: s.kind === 'cannon' ? 'cannon' : s.kind === 'ember' ? 'ember' : 'blast' });
            for (const g of this.foes) {
              if (g === f || g.state === 'dead' || g.state === 'spawn' || g.sleep) continue;
              const d = Math.hypot(g.x - s.x, g.z - s.z);
              if (d < s.splash + g.r) this.damage(g, s.dmg * (s.kind === 'cannon' ? 0.8 : 0.6), false, (g.x - s.x) / (d || 1), (g.z - s.z) / (d || 1), s.knock * 0.6, false, s.burn || s.kind === 'ember' && this.m.burn);
            }
          }
          if (this.m.chain && !chained && s.kind !== 'drone') {
            h.hits++;
            if (h.hits % 4 === 0) { chained = true; this.chain(f); }
          }
          if (s.pierce > 0 && f.kind !== 'nest') { s.pierce--; continue; }
          if (s.bounce > 0) {
            const t = this.nearestFoe(s.x, s.z, 6, s.hit);
            if (t) {
              s.bounce--;
              const l = Math.hypot(t.x - s.x, t.z - s.z) || 1;
              s.vx = (t.x - s.x) / l * sp; s.vz = (t.z - s.z) / l * sp;
              s.life = Math.max(s.life, 0.5);
              continue;
            }
          }
          dead = true;
          break;
        }
        if (!dead) {
          for (const c of this.crates) {
            if (Math.hypot(c.x - s.x, c.z - s.z) < 0.6 + s.r) {
              c.hp -= s.dmg;
              this.events.push({ type: 'hit', id: -1, x: c.x, z: c.z, dmg: Math.round(s.dmg), crit: false });
              if (c.hp <= 0) this.breakCrate(c);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead) keep.push(s);
    }
    this.shots = keep;
  }

  private chain(from: Foe): void {
    const pts = [from.x, from.z];
    const seen = [from.id];
    let cur = from;
    for (let i = 0; i < 3; i++) {
      const t = this.nearestFoe(cur.x, cur.z, 5, seen);
      if (!t) break;
      seen.push(t.id);
      pts.push(t.x, t.z);
      this.damage(t, 12 * this.m.dmg, false, 0, 0, 0, false, false);
      cur = t;
    }
    if (pts.length > 2) this.events.push({ type: 'chain', pts });
  }

  // ---------------------------------------------------------------- hazards

  private stepHazards(dt: number): void {
    const h = this.hero;
    for (const z of this.hazards) {
      z.t += dt;
      const owner = z.by >= 0 ? this.foes.find((f) => f.id === z.by) : null;
      if (owner && (z.kind === 'slam' && z.r > 2.5 || z.kind === 'charge' || z.kind === 'dive') && z.t < z.max) {
        z.x = owner.x; z.z = owner.z;
        if (owner.state === 'dead') z.done = true;
      }
      if (z.kind === 'ring') {
        // the fire ring rolls outward
        z.r = 0.5 + (z.t / z.max) * 10;
        const d = Math.hypot(h.x - z.x, h.z - z.z);
        if (!z.done && Math.abs(d - z.r) < 0.55) this.hurt(z.dmg, (h.x - z.x) / (d || 1), (h.z - z.z) / (d || 1));
        if (z.t >= z.max) z.done = true;
        continue;
      }
      if (z.t < z.max || z.done) continue;
      z.done = true;
      if (z.kind === 'meteor') {
        this.aoe(z.x, z.z, z.r, z.dmg, 8, 'meteor');
      } else if (z.kind === 'lance') {
        this.events.push({ type: 'boom', x: z.x, z: z.z, r: z.len, kind: 'lance' });
        const ex = Math.sin(z.ang), ez = Math.cos(z.ang);
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn' || f.sleep) continue;
          const px = f.x - z.x, pz = f.z - z.z;
          const along = px * ex + pz * ez;
          const off = Math.abs(px * ez - pz * ex);
          if (along > -0.5 && along < z.len && off < z.w + f.r) this.damage(f, z.dmg, true, ex, ez, 4, false, this.m.burn);
        }
      } else if (z.kind === 'slam' && z.by >= 0 && (!owner || (owner.kind === 'boss' && owner.move === 'quake'))) {
        // a quake ring: the boss's ground strike at the hero's feet
        this.events.push({ type: 'boom', x: z.x, z: z.z, r: z.r, kind: 'slam' });
        if (Math.hypot(h.x - z.x, h.z - z.z) < z.r + 0.3) this.hurt(z.dmg);
      }
    }
    if (this.hazards.some((z) => z.done && z.t > z.max + 0.4)) this.hazards = this.hazards.filter((z) => !(z.done && z.t > z.max + 0.4));
  }

  // ---------------------------------------------------------------- pickups

  private stepPicks(dt: number, all: boolean): void {
    const h = this.hero;
    const mag = MOVE.magnet * this.m.magnet;
    const keep: Pickup[] = [];
    for (const p of this.picks) {
      p.t += dt;
      const dx = h.x - p.x, dz = h.z - p.z;
      if (!all && !p.pull && (Math.abs(dx) > 12 || Math.abs(dz) > 12)) { keep.push(p); continue; }
      const d = Math.hypot(dx, dz);
      const pullable = p.kind !== 'key' || d < OBJ.keyR + 0.6;
      if (h.alive && ((all && d < 30) || (pullable && (d < mag || p.pull)))) p.pull = true;
      if (p.pull && h.alive) {
        const sp = (all ? 22 : 12) + p.t * 4;
        p.x += (dx / (d || 1)) * Math.min(d, sp * dt);
        p.z += (dz / (d || 1)) * Math.min(d, sp * dt);
      }
      if (h.alive && d < 0.7) { this.collect(p); continue; }
      keep.push(p);
    }
    this.picks = keep;
  }

  private collect(p: Pickup): void {
    const h = this.hero;
    this.events.push({ type: 'pickup', kind: p.kind, x: p.x, z: p.z, v: p.v });
    switch (p.kind) {
      case 'xp': {
        this.run.xp += p.v * this.m.xp;
        while (this.run.xp >= xpNeed(this.run.level)) {
          this.run.xp -= xpNeed(this.run.level);
          this.run.level++;
          this.pendingLevels++;
          this.events.push({ type: 'level', level: this.run.level });
        }
        break;
      }
      case 'health': h.hp = Math.min(h.max, h.hp + h.max * 0.3 * this.m.heal); break;
      case 'bullets': h.overdrive = 7; break;
      case 'thunder': h.charge = 1; break;
      case 'jar': this.stats.jars++; this.stats.crystals += p.v; break;
      case 'key': {
        this.keys.got++;
        this.events.push({ type: 'key', got: this.keys.got, of: this.keys.of });
        if (this.keys.got >= this.keys.of) {
          this.keys.hold = OBJ.beaconHold;
          this.keys.packT = 4;
          this.events.push({ type: 'beacon' });
        }
        break;
      }
    }
  }

  /** The store art's stage: a ring of aliens round the hero at once. */
  rush(n: number): void {
    const h = this.hero;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd() * 0.3, r = 4.5 + this.rnd() * 3.5;
      const kind: MobKind = i % 7 === 0 ? 'brute' : i % 3 === 0 ? 'fly' : i % 2 ? 's' : 'xs';
      this.spawnQueued({ at: 0, kind, elite: i % 5 === 0, x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r, mode: 'hunt', hx: h.x, hz: h.z, target: 'hero', wave: 0 });
      this.foes[this.foes.length - 1].t = 0.05;
    }
  }

  /** The drafts took this level-up (the scene calls it after a pick). */
  tookLevel(): void { this.pendingLevels = Math.max(0, this.pendingLevels - 1); }

  /** A card picked mid-mission: the numbers change at once (the hero's health rises with Plating). */
  refreshMods(): void {
    const old = this.hero.max;
    Object.assign(this.m, mods(this.run.ranks, this.run.cards));
    const H = HERO[this.run.hero];
    const max = Math.round(H.hp * this.m.hp * this.tune.heroHp);
    this.hero.max = max;
    this.hero.hp = Math.min(max, this.hero.hp + Math.max(0, max - old));
    if (this.hero.charges > this.m.skillCharges) this.hero.charges = this.m.skillCharges;
  }

  heal(k: number): void { this.hero.hp = Math.min(this.hero.max, this.hero.hp + this.hero.max * k); }

  // ---------------------------------------------------------------- the objective

  private stepObjective(dt: number): void {
    const d = this.def, h = this.hero;
    if (this.phase !== 'play') return;
    // the castaway: stand beside them to beam them up
    const c = this.castaway;
    if (c && !c.saved && h.alive) {
      if (Math.hypot(h.x - c.x, h.z - c.z) < OBJ.castR) c.prog = Math.min(1, c.prog + dt / OBJ.castTime);
      else c.prog = Math.max(0, c.prog - dt * 0.5);
      if (c.prog >= 1) {
        c.saved = true;
        this.run.score += 500;
        this.heal(0.3);
        this.drop('jar', c.x, c.z + 1);
        this.events.push({ type: 'castaway', x: c.x, z: c.z });
      }
    }
    switch (d.kind) {
      case 'clear': {
        if (this.nests.filter((n) => n.target).every((n) => !n.alive)) this.win();
        break;
      }
      case 'defend': {
        if (this.alerts.done >= this.alerts.of) this.win();
        break;
      }
      case 'boss': {
        const b = this.boss;
        if (this.bossId >= 0 && (!b || b.state === 'dead')) this.win();
        break;
      }
      case 'keys': {
        if (this.keys.hold < 0) break;
        // the beacon charges while the hero stands by it; aliens keep coming
        const P = this.plan.base;
        this.keys.near = h.alive && Math.hypot(h.x - P.x, h.z - P.z) < OBJ.beaconR;
        if (this.keys.near) this.keys.hold -= dt;
        this.keys.packT -= dt;
        if (this.keys.packT <= 0) {
          this.keys.packT = 7;
          this.pack(this.tune.budget * (4 + 0.9 * d.n), this.ringPoint(P.x, P.z, 22), { mode: 'hunt', spread: 2.5 });
        }
        if (this.keys.hold <= 0) this.win();
        break;
      }
      case 'rescue': {
        for (const [i, r] of this.rovers.entries()) {
          if (r.fixed) continue;
          const near = h.alive && Math.hypot(h.x - r.x, h.z - r.z) < OBJ.fixR;
          if (near) r.prog = Math.min(1, r.prog + dt / OBJ.fixTime);
          else r.prog = Math.max(0, r.prog - dt * OBJ.fixDecay / OBJ.fixTime);
          if (near) {
            // the tools are loud: packs come while the rover is fixed
            if (!r.heard) { r.heard = true; r.packT = 0; this.events.push({ type: 'fixing', i }); }
            r.packT -= dt;
            if (r.packT <= 0) { r.packT = 6.5; this.pack(this.tune.budget * (3 + 0.9 * d.n), this.ringPoint(r.x, r.z, 20), { mode: 'hunt', spread: 2.5 }); }
          }
          if (r.prog >= 1) {
            r.fixed = true;
            const left = this.rovers.filter((o) => !o.fixed).length;
            this.events.push({ type: 'fixed', i, left });
            this.run.score += 300;
            if (!left) { this.win(); return; }
          }
        }
        break;
      }
    }
  }

  private win(): void {
    if (this.phase !== 'play') return;
    this.phase = 'won';
    this.stats.time = this.time;
    // what is left of the fight nearby pops; the rest of the planet goes quiet; every pickup near flies in
    const h = this.hero;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.kind === 'nest') continue;
      if (Math.hypot(f.x - h.x, f.z - h.z) < 26) { f.score = 0; this.kill(f); } else this.kill(f, true);
    }
    this.queue = [];
    this.hazards = [];
    this.shots = this.shots.filter((s) => !s.hostile);
    this.hero.invuln = 99;
    this.events.push({ type: 'win' });
  }

  /** Stars: cleared; health (and the dome) at half or more; within the par time. */
  stars(): [boolean, boolean, boolean] {
    const h = this.hero;
    const hp = h.hp >= h.max * 0.5 && (this.def.kind !== 'defend' || this.dome.hp >= this.dome.max * 0.5);
    return [this.phase === 'won', this.phase === 'won' && hp, this.phase === 'won' && this.stats.time <= this.def.par];
  }
}

/** Turns angle `a` towards `b` by at most `k` radians. */
export function turn(a: number, b: number, k: number): number {
  const d = angDiff(a, b);
  return a + Math.max(-k, Math.min(k, d));
}

/** b - a, wrapped to -π..π. */
export function angDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

