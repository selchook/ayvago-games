// Dungeon Rescue: the rules, as a pure simulation at a fixed 60 Hz (no Phaser, no three.js), shared by
// the play scene, the autopilot (bot.ts), the menu's live backdrop and the headless balance check.
//
//   - the knight walks quietly and sprints loudly (his armour clanks: a noise ring), slides along
//     walls, hides inside barrels and crates, picks up keys, coins, vases and buckets (to throw) and
//     tricks, picks cell locks (hold ACT; a guard's eye on him breaks it), pulls levers, puts out
//     torches, opens the hidden gold chest;
//   - guards walk their rounds, pause and look round; each sees a cone (longer into lit cells,
//     shorter into shadow, blocked by walls, columns, banners, barrels, crates and shut doors); seen,
//     their suspicion fills: at "?" they come to look, at "!" they chase; they hear noises (sprint
//     steps, thrown things landing, a decoy) and go to look; sleepers wake to noise; a touch catches;
//   - freed prisoners cheer and follow the knight in a line along his trail; guards spot them too;
//     WAIT sits them down (harder to spot), FOLLOW brings them back;
//   - caught: a heart is lost and everyone goes back to the last campfire; the last heart ends the run;
//   - hazards: spike traps on a rhythm, trapdoors that give way, barred gates and levers;
//   - the Jailer Chief (the boss): a wide sweeping cone, a lantern, sharper ears, calling guards,
//     lane charges and ground slams by wing; outwitted (never fought) by stealing his key ring from
//     behind, shutting him in a pen with a lever, dropping him through a trapdoor, or all of it with
//     sleepy powder in the Tower; then the alarm rings and the crowd races out against the clock.
import {
  CELL, MOVE, GUARD, CHIEF, DETECT, NOISE, THROW, POWER, TUNING, HEAVY, RANK, SCORE, COINS, WINGS, WING_IDS,
  type Tuning, type Ranks, type Perks, type PowerId, type GuardKind, NO_PERKS,
} from './defs';
import { type Level, type C2, type GuardDef, cellX, cellZ } from './levels';

export { cellX, cellZ };

export interface Input {
  mx: number;
  mz: number;
  sprint: boolean;
  act: boolean;
  actPressed: boolean;
  throwHeld: boolean;
  throwReleased: boolean;
  /** The autopilot aims at a point; players throw where the knight faces. */
  aim?: [number, number] | null;
  powerPressed: boolean;
  crewPressed: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, sprint: false, act: false, actPressed: false, throwHeld: false, throwReleased: false, powerPressed: false, crewPressed: false };

export type ThingKind = 'key' | 'coins' | 'bag' | 'chest' | 'vase' | 'bucket' | 'power' | 'torch' | 'lever' | 'celldoor' | 'gate' | 'exitgate' | 'door'
  | 'barrel' | 'crate' | 'column' | 'banner' | 'table' | 'statue' | 'campfire' | 'spikes' | 'trapdoor' | 'coin';

export interface Thing {
  id: number;
  kind: ThingKind;
  c: number;
  r: number;
  x: number;
  z: number;
  taken: boolean;
  /** Doors, gates, chests and trapdoors: how open (0..1); target in `want`. */
  open: number;
  want: number;
  /** Torches lit, levers pulled. */
  on: boolean;
  power?: PowerId;
  /** A torch's wall side (the floor it lights is at c + dc, r + dr). */
  dc: number;
  dr: number;
  t: number;
  /** Trapdoors and gates tied to the boss's lever. */
  linked: boolean;
}

export type FollowMode = 'cell' | 'cheer' | 'join' | 'trail' | 'wait' | 'out';
export interface Follower {
  id: string;
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  mode: FollowMode;
  /** The cell door that holds this prisoner. */
  door: number;
  t: number;
  stun: number;
  path: C2[];
  pathT: number;
  speed: number;
  /** Rescued before (the crew): shown as a townsperson this time. */
  known: boolean;
}

export type GuardState = 'patrol' | 'search' | 'chase' | 'return' | 'sleep' | 'doze' | 'daze' | 'charge' | 'slam' | 'check' | 'locked' | 'fallen' | 'stolen';
export interface Guard {
  i: number;
  k: GuardKind;
  boss: boolean;
  def: GuardDef;
  x: number;
  z: number;
  yaw: number;
  /** Head turn on top of the body's yaw (the cone follows yaw + head). */
  head: number;
  state: GuardState;
  susp: number;
  ri: number;
  dir: number;
  wait: number;
  path: C2[];
  pathT: number;
  poi: [number, number];
  t: number;
  hold: number;
  seen: [number, number];
  seenT: number;
  /** -1: the knight; else a follower's index. */
  target: number;
  speed: number;
  hurry: boolean;
  checkBarrel: number;
  /** Boss: the charge direction, slam and charge cooldowns, the hiding spots left to check. */
  cdir: [number, number];
  ccd: number;
  scd: number;
  checks: number[];
  sleeping0: boolean;
  /** What the view shows over the head: '', '?', '!', 'z'. */
  mark: '' | '?' | '!' | 'z';
  moving: number;
}

export interface Noise { x: number; z: number; r: number; t: number; kind: 'step' | 'land' | 'decoy' | 'slam' | 'moo' | 'gate' }

export interface Projectile { x0: number; z0: number; x1: number; z1: number; t: number; kind: 'vase' | 'bucket' | 'coin' }

export type SimEvent =
  | { e: 'step'; x: number; z: number; sprint: boolean }
  | { e: 'pickup'; kind: ThingKind; x: number; z: number; power?: PowerId; n?: number }
  | { e: 'full'; x: number; z: number }
  | { e: 'unlock'; x: number; z: number; key: boolean }
  | { e: 'pickTick'; k: number }
  | { e: 'pickBreak' }
  | { e: 'gate'; x: number; z: number; open: boolean }
  | { e: 'lever'; x: number; z: number }
  | { e: 'torchOut'; x: number; z: number }
  | { e: 'hide'; x: number; z: number }
  | { e: 'unhide'; x: number; z: number }
  | { e: 'throw'; x: number; z: number }
  | { e: 'land'; x: number; z: number; kind: Projectile['kind'] }
  | { e: 'mark'; g: number; mark: Guard['mark'] }
  | { e: 'caught'; x: number; z: number; by: number }
  | { e: 'die' }
  | { e: 'respawn' }
  | { e: 'fall'; x: number; z: number }
  | { e: 'freed'; id: string; x: number; z: number; known: boolean }
  | { e: 'crew'; mode: 'wait' | 'follow' }
  | { e: 'power'; id: PowerId; x: number; z: number }
  | { e: 'powerEnd'; id: PowerId }
  | { e: 'noPower' }
  | { e: 'noThrow' }
  | { e: 'decoy'; x: number; z: number; moo: boolean }
  | { e: 'spikes'; x: number; z: number; up: boolean }
  | { e: 'spiked'; x: number; z: number }
  | { e: 'creak'; x: number; z: number }
  | { e: 'trapdoor'; x: number; z: number }
  | { e: 'guardFall'; g: number; x: number; z: number }
  | { e: 'locked'; g: number; x: number; z: number }
  | { e: 'wake'; g: number }
  | { e: 'doze'; g: number }
  | { e: 'shrug'; g: number }
  | { e: 'chiefCall'; x: number; z: number }
  | { e: 'chiefWind'; kind: 'charge' | 'slam'; x: number; z: number }
  | { e: 'chiefCharge'; x: number; z: number }
  | { e: 'chiefDaze'; x: number; z: number }
  | { e: 'chiefSlam'; x: number; z: number }
  | { e: 'chiefCheck'; x: number; z: number }
  | { e: 'stealTick'; k: number }
  | { e: 'stolen'; x: number; z: number }
  | { e: 'keysBack' }
  | { e: 'outwit'; x: number; z: number; how: string }
  | { e: 'alarm' }
  | { e: 'alarmLow' }
  | { e: 'timeUp' }
  | { e: 'chest'; x: number; z: number }
  | { e: 'needMore'; n: number }
  | { e: 'checkpoint'; x: number; z: number }
  | { e: 'door'; x: number; z: number; open: boolean }
  | { e: 'clear'; x: number; z: number };

export interface Stats {
  time: number;
  coins: number;
  chest: boolean;
  rescued: number;
  freed: number;
  total: number;
  spotted: boolean;
  caught: number;
  outwit: boolean;
}

export interface Hero {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  max: number;
  state: 'play' | 'hidden' | 'caught' | 'fall' | 'clear' | 'dead';
  hideIn: number;
  sprinting: boolean;
  t: number;
  keys: number;
  throws: number;
  bag: PowerId[];
  /** Running powers: seconds left. */
  disguise: number;
  swift: number;
  /** In a smoke cloud: unseen this long. */
  smoke: number;
  invul: number;
  /** The lock or the boss's key ring being worked on (0..1). */
  pick: number;
  pickId: number;
  steal: number;
  aiming: boolean;
  /** An animation the view plays once: 'throw', 'act', 'powder', 'caught', 'cheer'. */
  anim: string;
  animT: number;
  stepT: number;
  safe: [number, number];
  /** On the exit with some left behind: ACT leaves. */
  atExit: boolean;
  needT: number;
  /** The Cow's free decoy moos (one a level). */
  moo: number;
}

const NB4: C2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BLOCK_MOVE = new Set<ThingKind>(['barrel', 'crate', 'column', 'banner', 'table', 'statue', 'chest']);
const BLOCK_SIGHT = new Set<ThingKind>(['barrel', 'crate', 'column', 'banner', 'statue']);
const ITEM: Record<string, ThingKind> = {
  B: 'barrel', C: 'crate', O: 'column', F: 'banner', T: 'table', H: 'statue', k: 'key', '=': 'celldoor', G: 'gate', E: 'exitgate',
  L: 'lever', D: 'door', '^': 'spikes', o: 'trapdoor', $: 'coins', b: 'bag', '*': 'chest', v: 'vase', u: 'bucket', '+': 'campfire',
};
/** Spike timing: down, rattling, up (seconds). */
export const SPIKE = { down: 2.2, warn: 0.45, up: 0.9 };
const SPIKE_CYCLE = SPIKE.down + SPIKE.warn + SPIKE.up;

const ang = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Sim {
  readonly c: Level;
  readonly tune: Tuning;
  readonly perks: Perks;
  readonly ranks: Ranks;
  readonly easy: boolean;
  /** The wing's number (1..4): the Chief learns a trick each wing. */
  readonly wing: number;
  hero: Hero;
  things: Thing[] = [];
  guards: Guard[] = [];
  followers: Follower[] = [];
  noises: Noise[] = [];
  shots: Projectile[] = [];
  smokes: { x: number; z: number; t: number; r: number }[] = [];
  decoys: { x: number; z: number; t: number; next: number; moo: boolean }[] = [];
  events: SimEvent[] = [];
  stats: Stats;
  points = 0;
  clock = 0;
  /** Store art and the menu backdrop: nobody catches anybody. */
  god = false;
  light: Float32Array;
  /** The thing (or -1) blocking each cell. */
  private occ: Int32Array;
  private trail: [number, number][] = [];
  checkpoint: [number, number];
  checkpointId = -1;
  alarm = false;
  alarmT = 0;
  /** The final's phase: 0 stealth, 1 keys taken (he hunts you), 2 locked in. */
  phase = 0;
  boss: Guard | null = null;
  /** Spike state for the view (0 down, 1 rising/up). */
  spikeUp = 0;
  /** Derived numbers (ranks and perks). */
  readonly k: { pick: number; steal: number; sprintNoise: number; throwRange: number; tricks: number; walk: number; lure: number; smokeR: number; coins: number };
  private crewT = 0;

  constructor(level: Level, ranks: Ranks, easy: boolean, perks: Perks = NO_PERKS) {
    this.c = level;
    this.tune = TUNING[easy ? 'easy' : 'normal'];
    this.easy = easy;
    this.ranks = ranks;
    this.perks = perks;
    this.wing = WING_IDS.indexOf(level.wing) + 1;
    const t = this.tune;
    this.k = {
      pick: t.pick * RANK.hands[ranks.hands] * perks.pick,
      steal: CHIEF.steal * RANK.hands[ranks.hands] * perks.pick,
      sprintNoise: NOISE.sprint * RANK.soft[ranks.soft] * perks.quiet,
      throwRange: THROW.range * RANK.arm[ranks.arm] * perks.arm,
      tricks: RANK.tricks[ranks.tricks] * perks.tricks,
      walk: MOVE.walk * perks.walk,
      lure: perks.lure,
      smokeR: POWER.smokeR * perks.smoke,
      coins: perks.coins,
    };
    const [sc, sr] = level.start;
    const max = t.hearts + ranks.heart + perks.hearts;
    const bag: PowerId[] = [];
    if (ranks.smoke > 0) bag.push('smoke');
    if (perks.moo) bag.push('decoy');
    this.hero = {
      x: cellX(sc), z: cellZ(sr), vx: 0, vz: 0, yaw: Math.PI, hp: max, max, state: 'play', hideIn: -1, sprinting: false, t: 0, keys: 0, throws: 1,
      bag, disguise: 0, swift: 0, smoke: 0, invul: 0, pick: 0, pickId: -1, steal: 0, aiming: false, anim: '', animT: 0, stepT: 0, safe: [cellX(sc), cellZ(sr)], atExit: false, needT: 0, moo: perks.moo ? 1 : 0,
    };
    this.checkpoint = [cellX(sc), cellZ(sr)];
    this.stats = { time: 0, coins: 0, chest: false, rescued: 0, freed: 0, total: level.prisoners.length, spotted: false, caught: 0, outwit: false };
    // things from the map
    for (const it of level.items) {
      const kind = ITEM[it.ch];
      if (!kind) continue;
      this.addThing(kind, it.c, it.r);
    }
    for (const tc of level.torches) { const th = this.addThing('torch', tc.c, tc.r); th.on = true; th.dc = tc.dc; th.dr = tc.dr; }
    for (const p of level.powers) { const th = this.addThing('power', p.c, p.r); th.power = p.id; }
    // the trap's gates start open (a pen), its trapdoors are tied to the lever
    const trap = level.trap;
    for (const th of this.things) {
      if (th.kind === 'gate' && trap?.gates?.some(([c, r]) => c === th.c && r === th.r)) { th.linked = true; th.open = th.want = 1; }
      if (th.kind === 'trapdoor' && trap?.doors?.some(([c, r]) => c === th.c && r === th.r)) th.linked = true;
      if (th.kind === 'exitgate' && !level.boss) th.open = th.want = 1;
    }
    this.occ = new Int32Array(level.cols * level.rows).fill(-1);
    for (const th of this.things) if (BLOCK_MOVE.has(th.kind) || BLOCK_SIGHT.has(th.kind) || th.kind === 'celldoor' || th.kind === 'gate' || th.kind === 'exitgate' || th.kind === 'door') this.occ[th.r * level.cols + th.c] = th.id;
    // prisoners, each held by the nearest cell door
    for (const p of level.prisoners) {
      let best = -1, bd = Infinity;
      for (const th of this.things) if (th.kind === 'celldoor') { const d = Math.abs(th.c - p.c) + Math.abs(th.r - p.r); if (d < bd) { bd = d; best = th.id; } }
      this.followers.push({ id: p.id, x: cellX(p.c), z: cellZ(p.r), yaw: 0, vx: 0, vz: 0, mode: 'cell', door: best, t: Math.random() * 3, stun: 0, path: [], pathT: 0, speed: 0, known: false });
    }
    // guards and the boss
    level.guards.forEach((d) => this.addGuard(d, false));
    if (level.boss) this.boss = this.addGuard({ k: 'chief', p: level.boss.p, loop: level.boss.loop, pause: level.boss.pause }, true);
    this.light = new Float32Array(level.cols * level.rows);
    this.relight();
    this.trail = [[this.hero.x, this.hero.z]];
  }

  private addThing(kind: ThingKind, c: number, r: number): Thing {
    const th: Thing = { id: this.things.length, kind, c, r, x: cellX(c), z: cellZ(r), taken: false, open: 0, want: 0, on: false, dc: 0, dr: 0, t: 0, linked: false };
    this.things.push(th);
    return th;
  }

  private addGuard(d: GuardDef, boss: boolean): Guard {
    const [c, r] = d.p[0];
    const face = d.face === 'N' ? Math.PI : d.face === 'E' ? Math.PI / 2 : d.face === 'W' ? -Math.PI / 2 : 0;
    const yaw = d.p.length > 1 ? Math.atan2(d.p[1][0] - c, d.p[1][1] - r) : face;
    const g: Guard = {
      i: this.guards.length, k: d.k, boss, def: d, x: cellX(c), z: cellZ(r), yaw, head: 0, state: d.sleep ? 'sleep' : 'patrol', susp: 0, ri: d.p.length > 1 ? 1 : 0, dir: 1,
      wait: 0, path: [], pathT: 0, poi: [0, 0], t: Math.random() * 4, hold: 0, seen: [0, 0], seenT: 99, target: -1, speed: 0, hurry: false, checkBarrel: -1,
      cdir: [0, 0], ccd: 2, scd: 3, checks: [], sleeping0: !!d.sleep, mark: d.sleep ? 'z' : '', moving: 0,
    };
    this.guards.push(g);
    return g;
  }

  // ---------------------------------------------------------------- the grid

  cell(c: number, r: number): { k: string } | null { return c >= 0 && r >= 0 && c < this.c.cols && r < this.c.rows ? this.c.cells[r * this.c.cols + c] : null; }
  thingAt(c: number, r: number): Thing | null { const i = c >= 0 && r >= 0 && c < this.c.cols && r < this.c.rows ? this.occ[r * this.c.cols + c] : -1; return i >= 0 ? this.things[i] : null; }
  static toC(x: number): number { return Math.round(x / CELL); }

  /** Can the knight (or a guard) stand in this cell? */
  walkable(c: number, r: number, guard = false): boolean {
    const k = this.cell(c, r);
    if (!k || k.k !== 'floor') return false;
    const th = this.thingAt(c, r);
    if (th) {
      if (BLOCK_MOVE.has(th.kind)) return false;
      if ((th.kind === 'celldoor' || th.kind === 'gate' || th.kind === 'exitgate') && th.open < 0.9) return false;
    }
    if (guard) for (const s of this.things) if (s.kind === 'spikes' && s.c === c && s.r === r) return false;
    return true;
  }

  /** Does this cell stop a guard's eye? */
  blocksSight(c: number, r: number): boolean {
    const k = this.cell(c, r);
    if (!k || k.k !== 'floor') return true;
    const th = this.thingAt(c, r);
    if (!th) return false;
    if (BLOCK_SIGHT.has(th.kind)) return true;
    if (th.kind === 'door') return th.open < 0.5;
    return false;
  }

  /** A clear line between two points (sampled every 0.25 m; the end cells do not count). */
  los(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / 0.25);
    const c0 = Sim.toC(x0), r0 = Sim.toC(z0), c1 = Sim.toC(x1), r1 = Sim.toC(z1);
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const c = Sim.toC(x), r = Sim.toC(z);
      if ((c === c0 && r === r0) || (c === c1 && r === r1)) continue;
      if (this.blocksSight(c, r)) return false;
    }
    return true;
  }

  /** Torches and campfires light the cells round them (the guards see farther there). */
  relight(): void {
    const L = this.c, amb = L.ambient ?? WINGS[L.wing].ambient;
    this.light.fill(amb);
    const add = (x: number, z: number, R: number, k: number) => {
      for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
        const d = Math.hypot(cellX(c) - x, cellZ(r) - z);
        if (d >= R) continue;
        const i = r * L.cols + c;
        this.light[i] = Math.max(this.light[i], Math.min(1, (1 - d / R) * k + amb * 0.5));
      }
    };
    for (const th of this.things) {
      if (th.kind === 'torch' && th.on) add(th.x + th.dc * CELL * 0.6, th.z + th.dr * CELL * 0.6, 5.4, 1.35);
      if (th.kind === 'campfire') add(th.x, th.z, 3.6, 1.1);
    }
  }

  /** How lit a point is (the Chief's lantern included). */
  lightAt(x: number, z: number): number {
    const c = Sim.toC(x), r = Sim.toC(z);
    let L = c >= 0 && r >= 0 && c < this.c.cols && r < this.c.rows ? this.light[r * this.c.cols + c] : 0;
    const b = this.boss;
    if (b && b.state !== 'fallen' && b.state !== 'locked') { const d = Math.hypot(b.x - x, b.z - z); if (d < CHIEF.lantern) L = Math.max(L, 1 - (d / CHIEF.lantern) * 0.55); }
    return L;
  }

  /** A guard's sight reaches this far toward a point (light and Easy/Normal included). */
  rangeAt(g: Guard, x: number, z: number, hero = true): number {
    const heavy = HEAVY[g.k];
    let R = (g.boss ? CHIEF.range : GUARD.range) * this.tune.sight * (heavy?.range ?? 1) * (this.alarm ? 1.2 : 1);
    const L = this.lightAt(x, z);
    const shadow = DETECT.shadow * (hero ? this.perks.shadow : 1);
    const mid = (DETECT.darkAt + DETECT.litAt) / 2;
    const k = L <= DETECT.darkAt ? shadow : L < mid ? shadow + (1 - shadow) * (L - DETECT.darkAt) / (mid - DETECT.darkAt) : L < DETECT.litAt ? 1 + (DETECT.lit - 1) * (L - mid) / (DETECT.litAt - mid) : DETECT.lit;
    R *= k;
    return R;
  }

  /** Where a patrolling guard will face next: toward his next waypoint (after a pause, or near the turn). */
  nextHeading(g: Guard): number | null {
    const p = g.def.p;
    if (g.state !== 'patrol' || p.length < 2) return null;
    const [tc, tr] = p[g.ri];
    const near = Math.hypot(cellX(tc) - g.x, cellZ(tr) - g.z) < 3;
    if (g.wait <= 0 && !near) return null;
    let ni = g.ri;
    if (g.def.loop) ni = (g.ri + 1) % p.length;
    else { const d = g.ri + g.dir >= p.length || g.ri + g.dir < 0 ? -g.dir : g.dir; ni = g.ri + d; }
    const [nc, nr] = p[ni];
    return Math.atan2(cellX(nc) - cellX(tc), cellZ(nr) - cellZ(tr));
  }

  /**
   * Where a guard will be and look over the next `horizon` seconds (every `step`), for the autopilot:
   * a patrolling guard walks his round on a copy; any other stays where he is.
   */
  predict(g: Guard, horizon: number, step: number): { x: number; z: number; look: number; awake: boolean }[] {
    const out: { x: number; z: number; look: number; awake: boolean }[] = [];
    const awake = this.awake(g) && g.state !== 'daze';
    if (g.state !== 'patrol' && g.state !== 'return') {
      for (let t = 0; t <= horizon + 1e-6; t += step) out.push({ x: g.x, z: g.z, look: g.yaw + Math.sin(g.t + t) * (g.state === 'search' ? 1.15 : 0.4), awake });
      return out;
    }
    const c: Guard = { ...g, path: [...g.path], poi: [...g.poi] as [number, number], seen: [...g.seen] as [number, number], cdir: [...g.cdir] as [number, number], checks: [] };
    const pace = this.tune.pace * (HEAVY[g.k]?.pace ?? 1);
    const walk = (this.alarm ? GUARD.alarmWalk : GUARD.walk) * pace * (g.boss ? 0.92 : 1);
    const sub = 4, dt = step / sub;
    out.push({ x: c.x, z: c.z, look: c.yaw + c.head, awake });
    for (let t = step; t <= horizon + 1e-6; t += step) {
      for (let k = 0; k < sub; k++) {
        c.t += dt;
        if (c.state === 'return') { if (this.follow(c, this.routeCell(c), walk, dt, true)) { c.state = 'patrol'; c.wait = 0; } }
        else this.patrol(c, dt, walk);
      }
      out.push({ x: c.x, z: c.z, look: c.yaw + c.head, awake });
    }
    return out;
  }

  fovOf(g: Guard): number { return (g.boss ? CHIEF.fov : GUARD.fov) * (HEAVY[g.k]?.fov ?? 1); }
  lookOf(g: Guard): number { return g.yaw + g.head; }
  /** Can this guard use his eyes now? */
  awake(g: Guard): boolean { return g.state !== 'sleep' && g.state !== 'doze' && g.state !== 'daze' && g.state !== 'fallen' && g.state !== 'locked' && g.state !== 'stolen'; }

  /** Does the guard see this point now? */
  sees(g: Guard, x: number, z: number, hero = true): boolean {
    if (!this.awake(g)) return false;
    const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
    if (d < 0.9) return true;
    if (d > this.rangeAt(g, x, z, hero)) return false;
    if (Math.abs(ang(Math.atan2(dx, dz) - this.lookOf(g))) > this.fovOf(g)) return false;
    return this.los(g.x, g.z, x, z);
  }

  /** The cone's reach along a direction (for the view): stops at walls and where the light ends. */
  coneRay(g: Guard, a: number): number {
    const sx = Math.sin(a), sz = Math.cos(a);
    const max = (g.boss ? CHIEF.range : GUARD.range) * this.tune.sight * (HEAVY[g.k]?.range ?? 1) * (this.alarm ? 1.2 : 1) * DETECT.lit;
    let d = 0;
    const c0 = Sim.toC(g.x), r0 = Sim.toC(g.z);
    while (d < max) {
      const nd = d + 0.25;
      const x = g.x + sx * nd, z = g.z + sz * nd;
      const c = Sim.toC(x), r = Sim.toC(z);
      if (!(c === c0 && r === r0) && this.blocksSight(c, r)) break;
      if (nd > this.rangeAt(g, x, z)) break;
      d = nd;
    }
    return d;
  }

  // ---------------------------------------------------------------- paths

  /** Breadth-first path between cells (4-way), or null. */
  findPath(from: C2, to: C2, guard: boolean, allowGoal = true, avoid?: (c: number, r: number) => boolean): C2[] | null {
    const L = this.c, W = L.cols;
    if (from[0] === to[0] && from[1] === to[1]) return [to];
    const prev = new Int32Array(W * L.rows).fill(-1);
    const start = from[1] * W + from[0], goal = to[1] * W + to[0];
    prev[start] = start;
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      if (cur === goal) break;
      const c = cur % W, r = (cur / W) | 0;
      for (const [dc, dr] of NB4) {
        const nc = c + dc, nr = r + dr, ni = nr * W + nc;
        if (nc < 0 || nr < 0 || nc >= W || nr >= L.rows || prev[ni] >= 0) continue;
        if (!this.walkable(nc, nr, guard) && !(allowGoal && ni === goal && this.cell(nc, nr)?.k === 'floor')) continue;
        if (avoid && ni !== goal && avoid(nc, nr)) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (prev[goal] < 0) return null;
    const out: C2[] = [];
    for (let cur = goal; cur !== start; cur = prev[cur]) out.push([cur % W, (cur / W) | 0]);
    out.reverse();
    return out;
  }

  /** The walkable cell nearest a point (for goals inside blocked cells). */
  nearestWalkable(x: number, z: number, guard: boolean): C2 {
    const c0 = Sim.toC(x), r0 = Sim.toC(z);
    if (this.walkable(c0, r0, guard)) return [c0, r0];
    let best: C2 = [c0, r0], bd = Infinity;
    for (let r = r0 - 2; r <= r0 + 2; r++) for (let c = c0 - 2; c <= c0 + 2; c++) {
      if (!this.walkable(c, r, guard)) continue;
      const d = Math.hypot(cellX(c) - x, cellZ(r) - z);
      if (d < bd) { bd = d; best = [c, r]; }
    }
    return best;
  }

  /** Seconds until the spikes next rise (0 while they are up or rattling). */
  spikeIn(): number {
    const sp = this.clock % SPIKE_CYCLE;
    return sp >= SPIKE.down ? 0 : SPIKE.down - sp;
  }

  isSpikes(c: number, r: number): boolean { return this.things.some((t) => t.kind === 'spikes' && t.c === c && t.r === r); }
  isTrapdoor(c: number, r: number): boolean { return this.things.some((t) => t.kind === 'trapdoor' && t.c === c && t.r === r); }

  // ---------------------------------------------------------------- one step

  step(dt: number, inp: Input): void {
    const h = this.hero;
    this.clock += dt;
    if (h.state === 'clear' || h.state === 'dead') { this.updateFollowers(dt); this.updateThings(dt); return; }
    this.stats.time += dt;
    // spikes share one rhythm
    const sp = this.clock % SPIKE_CYCLE;
    const up = sp >= SPIKE.down + SPIKE.warn ? 1 : sp >= SPIKE.down ? 0.5 : 0;
    if (up !== this.spikeUp) {
      if (up > 0 && this.spikeUp === 0 || up === 1) for (const th of this.things) if (th.kind === 'spikes' && Math.hypot(th.x - h.x, th.z - h.z) < 14) { this.events.push({ e: 'spikes', x: th.x, z: th.z, up: up === 1 }); break; }
      this.spikeUp = up;
    }
    h.invul = Math.max(0, h.invul - dt);
    h.animT = Math.max(0, h.animT - dt);
    if (h.animT <= 0) h.anim = '';
    h.disguise = Math.max(0, h.disguise - dt);
    h.swift = Math.max(0, h.swift - dt);
    h.smoke = Math.max(0, h.smoke - dt);
    h.needT = Math.max(0, h.needT - dt);
    if (h.state === 'caught' || h.state === 'fall') {
      h.t -= dt;
      h.vx = h.vz = 0;
      if (h.t <= 0) this.respawn();
    } else this.moveHero(dt, inp);
    this.updateThings(dt);
    this.updateShots(dt);
    this.updateFollowers(dt);
    this.updateGuards(dt);
    this.updateAlarm(dt);
    this.noises = this.noises.filter((n) => (n.t += dt) < 0.8);
    this.smokes = this.smokes.filter((s) => (s.t += dt) < 3.2);
  }

  // ---------------------------------------------------------------- the knight

  private moveHero(dt: number, inp: Input): void {
    const h = this.hero;
    // crew command
    this.crewT = Math.max(0, this.crewT - dt);
    if (inp.crewPressed && this.crewT <= 0) this.toggleCrew();
    if (h.state === 'hidden') {
      h.vx = h.vz = 0;
      const pushing = Math.hypot(inp.mx, inp.mz) > 0.5;
      if (inp.actPressed || (pushing && h.t > 0.4)) this.unhide(inp);
      h.t += dt;
      return;
    }
    // power
    if (inp.powerPressed) this.usePower(inp.aim ?? null);
    // aiming and throwing
    h.aiming = inp.throwHeld;
    if (inp.throwReleased) this.throwNow(inp.aim ?? null);
    // walking
    let mx = inp.mx, mz = inp.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const busy = h.pick > 0 && inp.act || h.steal > 0 && inp.act;
    const sprint = inp.sprint && m > 0.3 && !busy;
    const base = sprint ? MOVE.sprint : this.k.walk;
    const speed = base * (h.swift > 0 ? POWER.swiftK : 1) * (busy ? 0 : 1);
    const tx = mx * speed, tz = mz * speed;
    const a = m > 0.05 ? MOVE.acc : MOVE.dec;
    h.vx += Math.max(-a * dt, Math.min(a * dt, tx - h.vx));
    h.vz += Math.max(-a * dt, Math.min(a * dt, tz - h.vz));
    const v = Math.hypot(h.vx, h.vz);
    if (m > 0.1 && !busy) h.yaw = Math.atan2(mx, mz);
    else if (inp.aim && (inp.throwHeld || inp.throwReleased)) h.yaw = Math.atan2(inp.aim[0] - h.x, inp.aim[1] - h.z);
    this.moveCircle(h, h.vx * dt, h.vz * dt, MOVE.radius);
    h.sprinting = sprint && v > MOVE.walk * 1.05;
    // footsteps (a sprint clanks: a noise ring)
    if (v > 0.6) {
      h.stepT += dt;
      const every = h.sprinting ? NOISE.sprintEvery : 0.42;
      if (h.stepT >= every) {
        h.stepT = 0;
        this.events.push({ e: 'step', x: h.x, z: h.z, sprint: h.sprinting });
        if (h.sprinting && h.swift <= 0) this.noise(h.x, h.z, this.k.sprintNoise, 'step');
      }
    }
    // the trail the followers walk
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(h.x - last[0], h.z - last[1]) > 0.3) { this.trail.push([h.x, h.z]); if (this.trail.length > 80) this.trail.shift(); }
    this.touch();
    this.act(inp);
  }

  /** Slides a circle through the grid (walls, blocking props, shut gates). */
  moveCircle(o: { x: number; z: number }, dx: number, dz: number, R: number, guard = false): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
    for (let s = 0; s < steps; s++) {
      o.x += dx / steps;
      o.z += dz / steps;
      for (let it = 0; it < 2; it++) {
        const c0 = Sim.toC(o.x), r0 = Sim.toC(o.z);
        for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
          if (this.walkable(c, r, guard)) continue;
          const half = CELL / 2;
          const cx = Math.max(cellX(c) - half, Math.min(o.x, cellX(c) + half));
          const cz = Math.max(cellZ(r) - half, Math.min(o.z, cellZ(r) + half));
          let ddx = o.x - cx, ddz = o.z - cz;
          const d = Math.hypot(ddx, ddz);
          if (d >= R) continue;
          if (d < 1e-5) { ddx = o.x - cellX(c); ddz = o.z - cellZ(r); const dd = Math.hypot(ddx, ddz) || 1; ddx /= dd; ddz /= dd; o.x = cx + ddx * R; o.z = cz + ddz * R; continue; }
          o.x = cx + (ddx / d) * R;
          o.z = cz + (ddz / d) * R;
        }
      }
    }
  }

  /** Walking over things: pick-ups, campfires, spikes, trapdoors, the exit. */
  private touch(): void {
    const h = this.hero;
    const hc = Sim.toC(h.x), hr = Sim.toC(h.z);
    let onSpikes = false;
    for (const th of this.things) {
      if (th.taken) continue;
      const d = Math.hypot(th.x - h.x, th.z - h.z);
      switch (th.kind) {
        case 'key': case 'coins': case 'bag': case 'coin': case 'vase': case 'bucket': case 'power':
          if (d < MOVE.grab) this.pick(th);
          break;
        case 'campfire':
          if (d < 1.8 && this.checkpointId !== th.id) {
            this.checkpointId = th.id;
            this.checkpoint = [th.x + (h.x - th.x) * 0.6, th.z + (h.z - th.z) * 0.6];
            this.events.push({ e: 'checkpoint', x: th.x, z: th.z });
          }
          break;
        case 'spikes':
          if (th.c === hc && th.r === hr) { onSpikes = true; if (this.spikeUp === 1 && h.invul <= 0) this.spiked(); }
          break;
        case 'trapdoor':
          if (!th.linked && th.c === hc && th.r === hr && th.t === 0 && th.open === 0) { th.t = 0.001; this.events.push({ e: 'creak', x: th.x, z: th.z }); }
          break;
      }
    }
    if (!onSpikes) h.safe = [h.x, h.z];
    // the exit
    const ex = cellX(this.c.exit[0]), ez = cellZ(this.c.exit[1]);
    h.atExit = Math.hypot(ex - h.x, ez - h.z) < 1.1;
    if (h.atExit) {
      const freed = this.followers.filter((f) => f.mode !== 'cell').length;
      const with_ = this.followers.filter((f) => f.mode === 'trail' || f.mode === 'join' || f.mode === 'cheer').length;
      if (freed < this.c.need) { if (h.needT <= 0) { this.events.push({ e: 'needMore', n: this.c.need - freed }); h.needT = 4; } }
      else if (with_ === this.followers.length) this.clear();
    }
  }

  private pick(th: Thing): void {
    const h = this.hero;
    switch (th.kind) {
      case 'key': h.keys++; break;
      case 'coins': case 'bag': case 'coin': {
        const n = th.kind === 'coin' ? 1 : Math.round((th.kind === 'bag' ? COINS.bag : COINS.pile) * this.k.coins);
        this.stats.coins += n;
        this.points += n * SCORE.coin;
        th.taken = true;
        this.events.push({ e: 'pickup', kind: th.kind, x: th.x, z: th.z, n });
        return;
      }
      case 'vase': case 'bucket':
        if (h.throws >= THROW.maxCarry) { if (h.needT <= 0) { this.events.push({ e: 'full', x: th.x, z: th.z }); h.needT = 3; } return; }
        h.throws++;
        break;
      case 'power':
        if (h.bag.length >= 3) { if (h.needT <= 0) { this.events.push({ e: 'full', x: th.x, z: th.z }); h.needT = 3; } return; }
        h.bag.push(th.power!);
        break;
    }
    th.taken = true;
    this.events.push({ e: 'pickup', kind: th.kind, x: th.x, z: th.z, power: th.power });
  }

  private spiked(): void {
    const h = this.hero;
    h.invul = 1.6;
    h.x = h.safe[0]; h.z = h.safe[1];
    h.vx = h.vz = 0;
    this.events.push({ e: 'spiked', x: h.x, z: h.z });
    if (this.god) return;
    h.hp -= 1;
    this.stats.caught++;
    if (h.hp <= 0) { h.state = 'dead'; this.events.push({ e: 'die' }); }
  }

  /** What ACT would use now (the nearest thing in front within reach). */
  target(): { kind: string; th: Thing | null; g: Guard | null } | null {
    const h = this.hero;
    if (h.state !== 'play') return null;
    const b = this.boss;
    if (b && this.canSteal(b)) return { kind: 'steal', th: null, g: b };
    let best: Thing | null = null, bs = Infinity;
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    for (const th of this.things) {
      let ok = false;
      let px = th.x, pz = th.z;
      switch (th.kind) {
        case 'celldoor': ok = th.open < 0.5; break;
        case 'lever': ok = true; break;
        case 'torch': ok = th.on; px = th.x + th.dc * CELL * 0.5; pz = th.z + th.dr * CELL * 0.5; break;
        case 'chest': ok = th.open < 0.5; break;
        case 'barrel': case 'crate': ok = true; break;
      }
      if (!ok) continue;
      const dx = px - h.x, dz = pz - h.z, d = Math.hypot(dx, dz);
      // things that fill a cell are reached from the next cell's middle
      if (d > MOVE.reach + (th.kind === 'barrel' || th.kind === 'crate' || th.kind === 'celldoor' || th.kind === 'chest' ? 0.65 : 0)) continue;
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (dot < -0.3) continue;
      const s = d - dot * 0.9 + (th.kind === 'barrel' || th.kind === 'crate' ? 0.6 : 0);
      if (s < bs) { bs = s; best = th; }
    }
    if (best) return { kind: best.kind, th: best, g: null };
    if (h.atExit) return { kind: 'exit', th: null, g: null };
    return null;
  }

  /** Behind the Chief (or beside him while he dozes), close enough, unseen: his key ring can be lifted. */
  canSteal(b: Guard): boolean {
    const h = this.hero;
    if (this.stats.outwit) return false;
    const trick = this.c.boss?.trick;
    if (trick !== 'steal' && trick !== 'final') return false;
    if (trick === 'final' && this.phase !== 0) return false;
    const d = Math.hypot(h.x - b.x, h.z - b.z);
    if (d > 1.75 * CHIEF.scale) return false;
    if (b.state === 'doze') return true;
    if (b.state === 'chase' || b.state === 'charge' || b.state === 'slam' || b.state === 'search') return false;
    const behind = Math.abs(ang(Math.atan2(h.x - b.x, h.z - b.z) - b.yaw));
    return behind > 1.9;
  }

  private act(inp: Input): void {
    const h = this.hero;
    let tg = this.target();
    // holding ACT works the locked cell door in front, even with a lever under the knight's feet
    if (inp.act && tg?.kind !== 'celldoor' && tg?.kind !== 'steal') {
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
      const door = this.things.find((th) => th.kind === 'celldoor' && th.open < 0.5 && Math.hypot(th.x - h.x, th.z - h.z) < MOVE.reach + 0.65 && ((th.x - h.x) * fx + (th.z - h.z) * fz) / Math.max(0.01, Math.hypot(th.x - h.x, th.z - h.z)) > 0.3);
      if (door) tg = { kind: 'celldoor', th: door, g: null };
    }
    // holding ACT on a locked cell door or the Chief's belt
    if (inp.act && tg?.kind === 'celldoor' && tg.th && h.keys <= 0) {
      if (h.pickId !== tg.th.id) { h.pickId = tg.th.id; h.pick = 0; }
      const before = h.pick;
      h.pick += 1 / 60 / this.k.pick;
      if (Math.floor(before * 4) !== Math.floor(h.pick * 4)) this.events.push({ e: 'pickTick', k: h.pick });
      h.yaw = Math.atan2(tg.th.x - h.x, tg.th.z - h.z);
      if (h.pick >= 1) { h.pick = 0; h.pickId = -1; this.openCell(tg.th, false); }
      return;
    }
    if (!inp.act && h.pick > 0 && tg?.th?.id !== h.pickId) { h.pick = 0; h.pickId = -1; }
    if (inp.act && tg?.kind === 'steal' && tg.g) {
      const before = h.steal;
      h.steal += 1 / 60 / this.k.steal;
      if (Math.floor(before * 4) !== Math.floor(h.steal * 4)) this.events.push({ e: 'stealTick', k: h.steal });
      if (h.steal >= 1) { h.steal = 0; this.stealKeys(tg.g); }
      return;
    }
    if (tg?.kind !== 'steal') h.steal = 0;
    if (!inp.actPressed || !tg) return;
    const th = tg.th;
    switch (tg.kind) {
      case 'celldoor': if (th && h.keys > 0) { h.keys--; this.openCell(th, true); } break;
      case 'lever': if (th) this.pullLever(th); break;
      case 'torch':
        if (th) { th.on = false; this.relight(); this.events.push({ e: 'torchOut', x: th.x + th.dc, z: th.z + th.dr }); h.anim = 'act'; h.animT = 0.5; }
        break;
      case 'chest':
        if (th) {
          th.want = 1;
          const n = Math.round(COINS.chest * this.k.coins);
          this.stats.coins += n;
          this.stats.chest = true;
          this.points += SCORE.chest + n * SCORE.coin;
          this.events.push({ e: 'chest', x: th.x, z: th.z });
          h.anim = 'act'; h.animT = 0.8;
        }
        break;
      case 'barrel': case 'crate': if (th) this.hide(th); break;
      case 'exit': this.clear(); break;
    }
  }

  private openCell(th: Thing, key: boolean): void {
    th.want = 1;
    this.events.push({ e: 'unlock', x: th.x, z: th.z, key });
    const h = this.hero;
    h.anim = 'act'; h.animT = 0.6;
    for (const f of this.followers) if (f.door === th.id && f.mode === 'cell') {
      f.mode = 'cheer'; f.t = 1.1;
      this.stats.freed++;
      this.points += SCORE.rescue;
      this.events.push({ e: 'freed', id: f.id, x: f.x, z: f.z, known: f.known });
    }
  }

  private pullLever(th: Thing): void {
    th.on = !th.on;
    this.events.push({ e: 'lever', x: th.x, z: th.z });
    const h = this.hero;
    h.anim = 'act'; h.animT = 0.5;
    const trap = this.c.trap;
    const isTrap = trap && trap.lever[0] === th.c && trap.lever[1] === th.r;
    if (isTrap && trap!.doors?.length) {
      // the boss's trapdoors open under whoever stands on them
      for (const d of this.things) if (d.kind === 'trapdoor' && d.linked) { d.want = 1; d.t = 2.6; this.events.push({ e: 'trapdoor', x: d.x, z: d.z }); }
      return;
    }
    if (isTrap && trap!.gates?.length) {
      const shut = th.on;
      for (const g of this.things) if (g.kind === 'gate' && g.linked) { g.want = shut ? 0 : 1; this.events.push({ e: 'gate', x: g.x, z: g.z, open: !shut }); }
      if (shut) this.shutPen();
      return;
    }
    for (const g of this.things) if (g.kind === 'gate' && !g.linked) { g.want = g.want > 0.5 ? 0 : 1; this.events.push({ e: 'gate', x: g.x, z: g.z, open: g.want > 0.5 }); }
  }

  /** The pen's gates shut: whoever is inside stays inside (followers are let out first). */
  private shutPen(): void {
    const area = this.c.trap?.area;
    if (!area) return;
    const [[c0, r0], [c1, r1]] = area;
    const inside = (x: number, z: number) => { const c = Sim.toC(x), r = Sim.toC(z); return c >= c0 && c <= c1 && r >= r0 && r <= r1; };
    for (const f of this.followers) if (inside(f.x, f.z)) { const p = this.nearestWalkable(cellX(c1 + 1), cellZ(r1), false); f.x = cellX(p[0]); f.z = cellZ(p[1]); }
    for (const g of this.guards) {
      if (g.state === 'fallen' || g.state === 'locked' || !inside(g.x, g.z)) continue;
      g.state = 'locked'; g.mark = '';
      g.path = [];
      this.events.push({ e: 'locked', g: g.i, x: g.x, z: g.z });
      if (g.boss) this.outwit(g, 'cell');
    }
  }

  private hide(th: Thing): void {
    const h = this.hero;
    const watchers = this.guards.filter((g) => (g.state === 'chase' || g.state === 'search') && this.sees(g, h.x, h.z));
    h.state = 'hidden';
    h.hideIn = th.id;
    h.x = th.x; h.z = th.z;
    h.vx = h.vz = 0;
    h.t = 0;
    h.pick = 0;
    this.events.push({ e: 'hide', x: th.x, z: th.z });
    // a guard who sees him climb in knows where to look
    for (const g of watchers) { g.checkBarrel = th.id; g.state = 'chase'; g.target = -1; g.seenT = 0; }
  }

  private unhide(inp: Input): void {
    const h = this.hero, th = this.things[h.hideIn];
    // out on the side pushed toward, else any free side
    const dirs = [...NB4].sort((a, b) => (b[0] * inp.mx + b[1] * inp.mz) - (a[0] * inp.mx + a[1] * inp.mz));
    for (const [dc, dr] of dirs) {
      if (!this.walkable(th.c + dc, th.r + dr)) continue;
      h.x = cellX(th.c + dc) - dc * 0.4; h.z = cellZ(th.r + dr) - dr * 0.4;
      break;
    }
    h.state = 'play';
    h.hideIn = -1;
    h.t = 0;
    this.events.push({ e: 'unhide', x: h.x, z: h.z });
  }

  private toggleCrew(): void {
    this.crewT = 0.3;
    const out = this.followers.filter((f) => f.mode === 'trail' || f.mode === 'join' || f.mode === 'cheer');
    const waiting = this.followers.filter((f) => f.mode === 'wait');
    if (out.length) { for (const f of out) { f.mode = 'wait'; f.vx = f.vz = 0; } this.events.push({ e: 'crew', mode: 'wait' }); }
    else if (waiting.length) { for (const f of waiting) { f.mode = 'join'; f.path = []; } this.events.push({ e: 'crew', mode: 'follow' }); }
  }

  get crewWaiting(): boolean { return this.followers.some((f) => f.mode === 'wait'); }

  // ---------------------------------------------------------------- throwing and powers

  /** Where a throw toward (dx, dz) lands: its range, or just short of a wall. */
  landing(yaw: number, aim: [number, number] | null): [number, number] {
    const h = this.hero;
    let range = this.k.throwRange;
    if (aim) range = Math.min(range, Math.hypot(aim[0] - h.x, aim[1] - h.z));
    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    let d = 0;
    while (d < range) {
      const nd = Math.min(range, d + 0.2);
      const c = Sim.toC(h.x + sx * nd), r = Sim.toC(h.z + sz * nd);
      const k = this.cell(c, r);
      const th = this.thingAt(c, r);
      if (!k || k.k !== 'floor' || (th && (th.kind === 'column' || th.kind === 'banner' || (th.kind === 'door' && th.open < 0.5)))) break;
      d = nd;
    }
    return [h.x + sx * Math.max(0.6, d - 0.15), h.z + sz * Math.max(0.6, d - 0.15)];
  }

  private throwNow(aim: [number, number] | null): void {
    const h = this.hero;
    let kind: Projectile['kind'];
    if (h.throws > 0) { h.throws--; kind = Math.random() < 0.5 ? 'vase' : 'bucket'; }
    else if (this.stats.coins > 0) { this.stats.coins--; kind = 'coin'; }
    else { this.events.push({ e: 'noThrow' }); return; }
    if (aim) h.yaw = Math.atan2(aim[0] - h.x, aim[1] - h.z);
    const [x1, z1] = this.landing(h.yaw, aim);
    this.shots.push({ x0: h.x, z0: h.z, x1, z1, t: 0, kind });
    h.anim = 'throw'; h.animT = 0.5;
    this.events.push({ e: 'throw', x: h.x, z: h.z });
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      s.t += dt;
      if (s.t < THROW.flight) continue;
      this.noise(s.x1, s.z1, NOISE.land * this.k.lure, 'land');
      this.events.push({ e: 'land', x: s.x1, z: s.z1, kind: s.kind });
      if (s.kind === 'coin') { const th = this.addThing('coin', Sim.toC(s.x1), Sim.toC(s.z1)); th.x = s.x1; th.z = s.z1; }
    }
    this.shots = this.shots.filter((s) => s.t < THROW.flight);
    // decoys rattle
    for (const d of this.decoys) {
      d.t += dt;
      d.next -= dt;
      if (d.next <= 0 && d.t < POWER.decoyTime * this.k.tricks) {
        d.next = POWER.decoyEvery;
        this.noise(d.x, d.z, NOISE.decoy * this.k.lure, d.moo ? 'moo' : 'decoy');
        this.events.push({ e: 'decoy', x: d.x, z: d.z, moo: d.moo });
      }
    }
    this.decoys = this.decoys.filter((d) => d.t < POWER.decoyTime * this.k.tricks + 0.5);
  }

  private usePower(aim: [number, number] | null = null): void {
    const h = this.hero;
    const id = h.bag.shift();
    if (!id) { this.events.push({ e: 'noPower' }); return; }
    const k = this.k.tricks;
    switch (id) {
      case 'smoke': {
        h.smoke = POWER.smokeHide * k;
        this.smokes.push({ x: h.x, z: h.z, t: 0, r: 2.4 * this.perks.smoke });
        for (const g of this.guards) {
          if (Math.hypot(g.x - h.x, g.z - h.z) > this.k.smokeR || !this.awake(g) && g.state !== 'daze') continue;
          // everyone in the cloud coughs and rubs his eyes for a moment: the way past a post
          g.susp = 0;
          g.state = 'daze'; g.t = GUARD.confused - POWER.smokeDaze * this.k.tricks; g.path = [];
          if (g.mark !== '?') { g.mark = '?'; this.events.push({ e: 'mark', g: g.i, mark: '?' }); }
        }
        break;
      }
      case 'disguise': h.disguise = POWER.disguise * k; break;
      case 'swift': h.swift = POWER.swift * k; break;
      case 'decoy': {
        // tossed where the knight faces (or aims), it rattles where it lands
        const moo = h.moo > 0;
        if (moo) h.moo--;
        if (aim) h.yaw = Math.atan2(aim[0] - h.x, aim[1] - h.z);
        const [x, z] = this.landing(h.yaw, aim);
        this.decoys.push({ x, z, t: -THROW.flight, next: THROW.flight + 0.1, moo });
        h.anim = 'throw'; h.animT = 0.5;
        break;
      }
      case 'powder': {
        h.anim = 'powder'; h.animT = 0.6;
        let best: Guard | null = null, bd = Infinity;
        for (const g of this.guards) {
          if (g.state === 'fallen' || g.state === 'locked' || g.state === 'sleep' || g.state === 'doze') continue;
          const dx = g.x - h.x, dz = g.z - h.z, d = Math.hypot(dx, dz);
          if (d > POWER.powderR * (g.boss ? CHIEF.scale : 1)) continue;
          if (Math.abs(ang(Math.atan2(dx, dz) - h.yaw)) > 1.2 && d > 1.2) continue;
          if (d < bd) { bd = d; best = g; }
        }
        if (best) {
          const g = best;
          const behind = Math.abs(ang(Math.atan2(h.x - g.x, h.z - g.z) - g.yaw)) > 1.9;
          if (g.boss && !behind) {
            g.susp = Math.min(0.95, g.susp + 0.7);
            this.events.push({ e: 'shrug', g: g.i });
          } else {
            g.state = 'doze'; g.hold = POWER.powderSleep * k * (g.boss ? 0.85 : 1); g.mark = 'z'; g.susp = 0; g.path = [];
            this.events.push({ e: 'doze', g: g.i });
          }
        }
        break;
      }
    }
    this.events.push({ e: 'power', id, x: h.x, z: h.z });
  }

  /** A noise ring: guards in it come to look; sleepers wake. */
  noise(x: number, z: number, r: number, kind: Noise['kind']): void {
    this.noises.push({ x, z, r, t: 0, kind });
    for (const g of this.guards) {
      if (g.state === 'fallen' || g.state === 'locked' || g.state === 'doze' || g.state === 'daze' || g.state === 'stolen') continue;
      const hear = g.boss && this.wing >= 2 ? CHIEF.hearing : 1;
      let R = r * hear;
      if (!this.los(x, z, g.x, g.z)) R *= 0.62;
      const d = Math.hypot(g.x - x, g.z - z);
      if (g.state === 'sleep') {
        if (d < R * NOISE.wake) { g.state = 'search'; g.poi = [x, z]; g.t = 0; g.path = []; g.susp = Math.max(g.susp, 0.5); g.mark = '?'; g.hold = GUARD.search; this.events.push({ e: 'wake', g: g.i }); this.events.push({ e: 'mark', g: g.i, mark: '?' }); }
        continue;
      }
      if (d > R) continue;
      if (g.state === 'chase' || g.state === 'charge' || g.state === 'slam' || g.state === 'check') continue;
      const lure = kind === 'land' || kind === 'decoy' || kind === 'moo' ? this.k.lure : 1;
      g.state = 'search'; g.poi = [x, z]; g.t = 0; g.path = []; g.hold = GUARD.search * lure; g.susp = Math.max(g.susp, 0.5); g.hurry = false;
      if (g.mark !== '?') { g.mark = '?'; this.events.push({ e: 'mark', g: g.i, mark: '?' }); }
    }
  }

  // ---------------------------------------------------------------- things over time

  private updateThings(dt: number): void {
    const h = this.hero;
    for (const th of this.things) {
      switch (th.kind) {
        case 'celldoor': case 'gate': case 'exitgate': case 'chest':
          th.open += Math.max(-dt * 2.2, Math.min(dt * 1.6, th.want - th.open));
          break;
        case 'door': {
          let near = Math.hypot(h.x - th.x, h.z - th.z) < 1.9 && h.state !== 'hidden';
          for (const g of this.guards) if (!near && g.state !== 'fallen' && g.state !== 'locked' && Math.hypot(g.x - th.x, g.z - th.z) < 1.9) near = true;
          for (const f of this.followers) if (!near && f.mode !== 'cell' && Math.hypot(f.x - th.x, f.z - th.z) < 1.9) near = true;
          if (near) th.t = 1.1; else th.t = Math.max(0, th.t - dt);
          const want = th.t > 0 ? 1 : 0;
          if (want !== th.want) { th.want = want; this.events.push({ e: 'door', x: th.x, z: th.z, open: want > 0 }); }
          th.open += Math.max(-dt * 2.5, Math.min(dt * 3.2, th.want - th.open));
          break;
        }
        case 'trapdoor':
          if (th.linked) {
            if (th.t > 0) {
              th.t -= dt;
              th.open = Math.min(1, th.open + dt * 5);
              this.dropOn(th);
              if (th.t <= 0) th.want = 0;
            } else th.open = Math.max(0, th.open - dt * 2);
          } else if (th.t > 0) {
            th.t += dt;
            if (th.t > 0.45 && th.t < 2.4) { if (th.open === 0) this.events.push({ e: 'trapdoor', x: th.x, z: th.z }); th.open = Math.min(1, th.open + dt * 6); this.dropOn(th); }
            if (th.t >= 2.4) { th.open = Math.max(0, th.open - dt * 2); if (th.open === 0) th.t = 0; }
          }
          break;
      }
    }
  }

  /** An open trapdoor drops whoever stands on it. */
  private dropOn(th: Thing): void {
    if (th.open < 0.6) return;
    const h = this.hero;
    if (h.state === 'play' && Sim.toC(h.x) === th.c && Sim.toC(h.z) === th.r) {
      h.state = 'fall'; h.t = 1.3; h.vx = h.vz = 0;
      this.events.push({ e: 'fall', x: h.x, z: h.z });
    }
    for (const g of this.guards) {
      if (g.state === 'fallen' || g.state === 'locked' || Sim.toC(g.x) !== th.c || Sim.toC(g.z) !== th.r) continue;
      g.state = 'fallen'; g.mark = ''; g.path = [];
      this.events.push({ e: 'guardFall', g: g.i, x: g.x, z: g.z });
      if (g.boss) this.outwit(g, 'trap');
    }
  }

  // ---------------------------------------------------------------- the followers

  private updateFollowers(dt: number): void {
    const h = this.hero;
    let slot = 0;
    for (const f of this.followers) {
      f.t -= dt;
      f.stun = Math.max(0, f.stun - dt);
      if (f.mode === 'cell' || f.mode === 'wait' || f.mode === 'out') { f.vx = f.vz = 0; continue; }
      if (f.mode === 'cheer') { f.vx = f.vz = 0; if (f.t <= 0) { f.mode = 'join'; f.path = []; } continue; }
      if (h.state === 'clear') {
        // into the stairs after the knight
        this.walkTo(f, cellX(this.c.exit[0]), cellZ(this.c.exit[1]), 3, dt);
        continue;
      }
      if (f.stun > 0) { f.vx = f.vz = 0; continue; }
      const mine = slot++;
      if (f.mode === 'join') {
        if (Math.hypot(f.x - h.x, f.z - h.z) < 2.4) { f.mode = 'trail'; }
        else {
          f.pathT -= dt;
          if (f.pathT <= 0 || !f.path.length) { f.pathT = 0.5; f.path = this.findPath([Sim.toC(f.x), Sim.toC(f.z)], [Sim.toC(h.x), Sim.toC(h.z)], false) ?? []; }
          const nx = f.path[0];
          if (nx) {
            const tx = cellX(nx[0]), tz = cellZ(nx[1]);
            if (Math.hypot(tx - f.x, tz - f.z) < 0.25) f.path.shift();
            this.walkTo(f, tx, tz, MOVE.sprint * 0.95, dt);
          }
          continue;
        }
      }
      // trail: a point behind the knight along his path
      const [tx, tz] = this.trailPoint(0.95 + mine * 0.95);
      const d = Math.hypot(tx - f.x, tz - f.z);
      if (d > 7) { f.mode = 'join'; f.path = []; continue; }
      // spikes up ahead: wait
      const spikeAhead = this.spikeUp > 0 && this.things.some((s) => s.kind === 'spikes' && s.c === Sim.toC(tx) && s.r === Sim.toC(tz)) && !this.things.some((s) => s.kind === 'spikes' && s.c === Sim.toC(f.x) && s.r === Sim.toC(f.z));
      if (spikeAhead) { f.vx = f.vz = 0; continue; }
      const speed = d > 1.6 ? MOVE.sprint * 1.05 : d > 0.4 ? Math.max(2, Math.hypot(h.vx, h.vz) * 1.1) : 0;
      this.walkTo(f, tx, tz, speed, dt);
    }
  }

  /** A point this far behind the knight along his trail. */
  trailPoint(dist: number): [number, number] {
    const h = this.hero;
    let px = h.x, pz = h.z, left = dist;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const [x, z] = this.trail[i];
      const seg = Math.hypot(x - px, z - pz);
      if (seg >= left) { const k = left / seg; return [px + (x - px) * k, pz + (z - pz) * k]; }
      left -= seg; px = x; pz = z;
    }
    return [px, pz];
  }

  private walkTo(f: Follower, tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
    if (d < 0.05 || speed <= 0) { f.vx *= 0.7; f.vz *= 0.7; f.speed = Math.hypot(f.vx, f.vz); return; }
    const s = Math.min(speed, d / dt);
    f.vx = (dx / d) * s; f.vz = (dz / d) * s;
    f.x += f.vx * dt; f.z += f.vz * dt;
    f.speed = s;
    f.yaw = Math.atan2(dx, dz);
  }

  // ---------------------------------------------------------------- the guards

  private updateGuards(dt: number): void {
    for (const g of this.guards) this.updateGuard(g, dt);
  }

  private routeCell(g: Guard): C2 { return g.def.p[g.ri % g.def.p.length]; }

  private updateGuard(g: Guard, dt: number): void {
    g.t += dt;
    g.ccd = Math.max(0, g.ccd - dt);
    g.scd = Math.max(0, g.scd - dt);
    const pace = this.tune.pace * (HEAVY[g.k]?.pace ?? 1);
    const walk = (this.alarm ? GUARD.alarmWalk : GUARD.walk) * pace * (g.boss ? 0.92 : 1);
    const run = GUARD.run * pace * (g.boss ? 0.95 : 1);
    g.moving = 0;
    switch (g.state) {
      case 'fallen': case 'locked': return;
      case 'sleep': g.head = Math.sin(g.t * 0.6) * 0.1; return;
      case 'doze':
        g.hold -= dt;
        g.head = Math.sin(g.t * 0.7) * 0.15;
        if (g.hold <= 0) {
          g.state = 'search'; g.poi = [g.x, g.z]; g.hold = GUARD.search; g.t = 0; g.mark = '?';
          this.events.push({ e: 'wake', g: g.i });
          this.events.push({ e: 'mark', g: g.i, mark: '?' });
        }
        return;
      case 'daze':
        g.head = Math.sin(g.t * 5) * 0.9;
        if (g.t > GUARD.confused) { g.state = 'return'; g.path = []; g.mark = ''; this.events.push({ e: 'mark', g: g.i, mark: '' }); }
        return;
      case 'stolen':
        g.head = Math.sin(g.t * 6) * 1.1;
        if (g.t > 3.2) { g.state = 'return'; g.path = []; }
        return;
    }
    // eyes first
    this.look(g, dt);
    // the final, keys taken: the Chief follows the jingle of his keys wherever the knight goes
    if (g.boss && this.phase === 1 && (g.state === 'patrol' || g.state === 'return') && this.hero.state === 'play') {
      g.state = 'search'; g.poi = [this.hero.x, this.hero.z]; g.hold = 0.6; g.hurry = false; g.path = []; g.checks = [];
      if (g.mark !== '?') { g.mark = '?'; this.events.push({ e: 'mark', g: g.i, mark: '?' }); }
    }
    switch (g.state) {
      case 'patrol': this.patrol(g, dt, walk); break;
      case 'return': {
        const goal = this.routeCell(g);
        if (this.follow(g, goal, walk, dt, true)) { g.state = 'patrol'; g.wait = 0; }
        g.head = Math.sin(g.t * 1.2) * 0.25;
        break;
      }
      case 'search': {
        const goal = this.nearestWalkable(g.poi[0], g.poi[1], true);
        const there = this.follow(g, goal, g.hurry ? run : walk * 1.1, dt, true);
        if (there) {
          g.hold -= dt;
          g.head = Math.sin(g.t * 2.2) * 1.15;
          // the Chief opens the hiding spots near where he looked (the Tower)
          if (g.boss && this.wing >= 4 && g.checks.length === 0 && g.hold > GUARD.search - 0.1) g.checks = this.things.filter((t) => (t.kind === 'barrel' || t.kind === 'crate') && Math.hypot(t.x - g.poi[0], t.z - g.poi[1]) < 4.5).map((t) => t.id);
          if (g.boss && g.checks.length) { g.state = 'check'; g.t = 0; g.path = []; break; }
          if (g.hold <= 0) { g.state = 'return'; g.path = []; g.hurry = false; if (g.mark) { g.mark = ''; this.events.push({ e: 'mark', g: g.i, mark: '' }); } }
        } else g.head = Math.sin(g.t * 1.4) * 0.35;
        break;
      }
      case 'check': {
        const id = g.checks[0];
        if (id === undefined) { g.state = 'return'; g.path = []; break; }
        const th = this.things[id];
        const goal = this.nearestWalkable(th.x, th.z, true);
        if (this.follow(g, goal, walk, dt, true)) {
          g.yaw = Math.atan2(th.x - g.x, th.z - g.z);
          if (g.hold <= 0) { g.hold = 0.9; this.events.push({ e: 'chiefCheck', x: th.x, z: th.z }); }
          g.hold -= dt;
          if (g.hold <= 0.05) {
            if (this.hero.state === 'hidden' && this.hero.hideIn === id) { this.caught(g); return; }
            g.checks.shift(); g.hold = 0;
          }
        }
        break;
      }
      case 'chase': this.chase(g, dt, run); break;
      case 'charge': this.charge(g, dt); break;
      case 'slam':
        g.hold -= dt;
        if (g.hold <= 0) {
          this.events.push({ e: 'chiefSlam', x: g.x, z: g.z });
          this.noise(g.x, g.z, NOISE.slam, 'slam');
          for (const f of this.followers) if ((f.mode === 'trail' || f.mode === 'join') && Math.hypot(f.x - g.x, f.z - g.z) < CHIEF.slamR) f.stun = CHIEF.slamStun;
          g.state = 'chase'; g.scd = CHIEF.slamCd;
        }
        break;
    }
  }

  /** Walks a guard toward a cell along a grid path; true when there. */
  private follow(g: Guard, goal: C2, speed: number, dt: number, guard: boolean): boolean {
    const gx = cellX(goal[0]), gz = cellZ(goal[1]);
    if (Math.hypot(gx - g.x, gz - g.z) < 0.12) { g.x = gx; g.z = gz; return true; }
    g.pathT -= dt;
    const last = g.path[g.path.length - 1];
    if (!g.path.length || g.pathT <= 0 || !last || last[0] !== goal[0] || last[1] !== goal[1]) {
      g.pathT = 0.6;
      g.path = this.findPath([Sim.toC(g.x), Sim.toC(g.z)], goal, guard) ?? [];
      if (!g.path.length) { g.path = [goal]; }
    }
    let nx = g.path[0];
    // skip the cell he is already centred on
    while (nx && g.path.length > 1 && Math.hypot(cellX(nx[0]) - g.x, cellZ(nx[1]) - g.z) < 0.15) { g.path.shift(); nx = g.path[0]; }
    if (!nx) return true;
    const tx = cellX(nx[0]), tz = cellZ(nx[1]);
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    const s = Math.min(speed * dt, d);
    if (d > 1e-4) {
      g.x += (dx / d) * s; g.z += (dz / d) * s;
      const want = Math.atan2(dx, dz);
      g.yaw += ang(want - g.yaw) * Math.min(1, dt * 9);
    }
    g.moving = speed;
    if (d - s < 0.02) { g.path.shift(); if (!g.path.length && Math.hypot(gx - g.x, gz - g.z) < 0.15) return true; }
    return false;
  }

  private patrol(g: Guard, dt: number, walk: number): void {
    const p = g.def.p;
    if (p.length === 1) {
      // a post: stand and turn the head round
      const [c, r] = p[0];
      if (Math.hypot(cellX(c) - g.x, cellZ(r) - g.z) > 0.2) { this.follow(g, [c, r], walk, dt, true); return; }
      const face = g.def.face === 'N' ? Math.PI : g.def.face === 'E' ? Math.PI / 2 : g.def.face === 'W' ? -Math.PI / 2 : 0;
      g.yaw += ang(face - g.yaw) * Math.min(1, dt * 4);
      g.head = Math.sin(g.t * (g.boss ? 0.9 : 0.75)) * (g.boss ? 1.3 : 1.05);
      return;
    }
    if (g.wait > 0) {
      g.wait -= dt;
      g.head = Math.sin((g.def.pause ?? GUARD.pause) - g.wait) * 1.2 * Math.sin(g.t * 2.1);
      if (g.boss) g.head = Math.sin(g.t * 1.8) * CHIEF.sweep * 1.3;
      if (g.wait <= 0) {
        if (g.def.loop) g.ri = (g.ri + 1) % p.length;
        else { if (g.ri + g.dir >= p.length || g.ri + g.dir < 0) g.dir = -g.dir; g.ri += g.dir; }
        g.path = [];
      }
      return;
    }
    g.head = g.boss ? Math.sin(g.t * 1.6) * CHIEF.sweep : Math.sin(g.t * 1.1) * 0.3;
    if (this.follow(g, p[g.ri], walk, dt, true)) g.wait = (g.def.pause ?? GUARD.pause) * (this.alarm ? 0.5 : 1);
  }

  /** The eyes: suspicion grows while the knight or a follower is in sight. */
  private look(g: Guard, dt: number): void {
    const h = this.hero;
    if (!this.awake(g)) return;
    let best = 0, bx = 0, bz = 0, who = -2;
    const range0 = (g.boss ? CHIEF.range : GUARD.range);
    const consider = (x: number, z: number, factor: number, id: number, hero: boolean) => {
      if (factor <= 0 || !this.sees(g, x, z, hero)) return;
      const d = Math.hypot(x - g.x, z - g.z);
      const R = Math.max(1, this.rangeAt(g, x, z, hero));
      const rate = DETECT.rate * (DETECT.near - (DETECT.near - DETECT.far) * Math.min(1, d / R)) * factor * (range0 / range0);
      if (rate > best) { best = rate; bx = x; bz = z; who = id; }
    };
    if (h.state === 'play' && h.smoke <= 0) {
      let f = this.perks.small * (h.sprinting ? DETECT.sprinting : 1);
      if (h.disguise > 0 && !h.sprinting) f = 0;
      consider(h.x, h.z, f, -1, true);
    }
    this.followers.forEach((fo, i) => {
      if (fo.mode !== 'trail' && fo.mode !== 'join' && fo.mode !== 'wait' && fo.mode !== 'cheer') return;
      consider(fo.x, fo.z, DETECT.follower * this.perks.crowd * (fo.mode === 'wait' ? DETECT.sitting : 1), i, true);
    });
    if (who > -2) {
      g.susp = Math.min(1, g.susp + best * this.tune.susp * (this.alarm ? 1.6 : 1) * dt);
      g.seen = [bx, bz]; g.seenT = 0; g.target = who;
      if (g.state === 'chase' || g.state === 'charge' || g.state === 'slam') return;
      if (g.susp >= 1) this.startChase(g);
      else if (g.susp >= DETECT.question && (g.state === 'patrol' || g.state === 'return' || g.state === 'search' || g.state === 'check')) {
        g.state = 'search'; g.poi = [bx, bz]; g.hold = GUARD.search; g.path = []; g.hurry = false;
        if (g.mark !== '?') { g.mark = '?'; this.events.push({ e: 'mark', g: g.i, mark: '?' }); }
      }
    } else {
      g.seenT += dt;
      if (g.state !== 'chase' && g.state !== 'search') g.susp = Math.max(0, g.susp - DETECT.decay * this.perks.calm * dt);
      else if (g.state === 'search') g.susp = Math.max(DETECT.question * 0.5, g.susp - DETECT.decay * 0.5 * this.perks.calm * dt);
    }
  }

  private startChase(g: Guard): void {
    g.state = 'chase'; g.path = []; g.hurry = true;
    this.stats.spotted = true;
    if (g.mark !== '!') { g.mark = '!'; this.events.push({ e: 'mark', g: g.i, mark: '!' }); }
    if (g.boss && this.wing >= 2) {
      this.events.push({ e: 'chiefCall', x: g.x, z: g.z });
      for (const o of this.guards) {
        if (o === g || !this.awake(o) && o.state !== 'sleep' || o.state === 'chase') continue;
        if (Math.hypot(o.x - g.x, o.z - g.z) > CHIEF.call) continue;
        o.state = 'search'; o.poi = [...g.seen] as [number, number]; o.hold = GUARD.search; o.hurry = true; o.susp = Math.max(o.susp, 0.7); o.path = [];
        if (o.mark !== '?') { o.mark = '?'; this.events.push({ e: 'mark', g: o.i, mark: '?' }); }
      }
    }
  }

  private chase(g: Guard, dt: number, run: number): void {
    const h = this.hero;
    const tgt = g.target >= 0 ? this.followers[g.target] : null;
    const tx = tgt ? tgt.x : h.x, tz = tgt ? tgt.z : h.z;
    const targetHere = tgt ? (tgt.mode === 'trail' || tgt.mode === 'join' || tgt.mode === 'wait') : h.state === 'play';
    // checking the barrel he saw the knight climb into
    if (!tgt && h.state === 'hidden' && g.checkBarrel === h.hideIn) {
      const th = this.things[h.hideIn];
      if (Math.hypot(th.x - g.x, th.z - g.z) < 1.9) { this.caught(g); return; }
      this.follow(g, this.nearestWalkable(th.x, th.z, true), run, dt, true);
      return;
    }
    g.head *= 0.8;
    if (targetHere && Math.hypot(tx - g.x, tz - g.z) < GUARD.catchR * (g.boss ? 1.2 : 1)) { this.caught(g); return; }
    if (g.seenT > GUARD.lost || !targetHere) {
      g.state = 'search'; g.poi = [...g.seen] as [number, number]; g.hold = GUARD.search; g.susp = 0.7; g.path = []; g.hurry = false; g.checkBarrel = -1;
      g.mark = '?'; this.events.push({ e: 'mark', g: g.i, mark: '?' });
      return;
    }
    // the Chief's lane charge (wing 3 on) and ground slam (wing 4)
    if (g.boss && this.wing >= 4 && g.scd <= 0 && this.followers.some((f) => (f.mode === 'trail' || f.mode === 'join') && Math.hypot(f.x - g.x, f.z - g.z) < CHIEF.slamR * 0.8)) {
      g.state = 'slam'; g.hold = CHIEF.slamWind; this.events.push({ e: 'chiefWind', kind: 'slam', x: g.x, z: g.z }); return;
    }
    // (no charges while he hunts his keys in the final: the barred passage is the knight's lure)
    if (g.boss && this.wing >= 3 && g.ccd <= 0 && g.seenT < 0.1 && this.phase !== 1) {
      const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
      const axisX = Math.abs(dz) < 0.9, axisZ = Math.abs(dx) < 0.9;
      if (d > 2.6 && d < 12 && (axisX || axisZ)) {
        const dir: [number, number] = axisX ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
        g.state = 'charge'; g.cdir = dir; g.hold = CHIEF.chargeWind / this.tune.chief; g.t = 0; g.yaw = Math.atan2(dir[0], dir[1]);
        this.events.push({ e: 'chiefWind', kind: 'charge', x: g.x, z: g.z });
        return;
      }
    }
    const goal = this.nearestWalkable(g.seen[0], g.seen[1], true);
    this.follow(g, goal, run, dt, true);
  }

  private charge(g: Guard, dt: number): void {
    if (g.hold > 0) { g.hold -= dt; return; }
    const h = this.hero;
    const sp = CHIEF.chargeSpeed * this.tune.chief;
    const nx = g.x + g.cdir[0] * sp * dt, nz = g.z + g.cdir[1] * sp * dt;
    const ahead = [Sim.toC(nx + g.cdir[0] * 0.7), Sim.toC(nz + g.cdir[1] * 0.7)] as C2;
    if (!this.walkable(ahead[0], ahead[1], true) || g.t > 2.2) {
      g.state = 'daze'; g.t = GUARD.confused - CHIEF.chargeDaze; g.ccd = CHIEF.chargeCd; g.mark = '';
      this.events.push({ e: 'chiefDaze', x: g.x, z: g.z });
      return;
    }
    g.x = nx; g.z = nz; g.moving = sp;
    if (g.t > 0.05 && Math.abs(g.t % 0.3) < dt) this.events.push({ e: 'chiefCharge', x: g.x, z: g.z });
    if (h.state === 'play' && Math.hypot(h.x - g.x, h.z - g.z) < 1.1) { this.caught(g); return; }
    for (const f of this.followers) if ((f.mode === 'trail' || f.mode === 'join') && Math.hypot(f.x - g.x, f.z - g.z) < 1) { this.caught(g); return; }
  }

  // ---------------------------------------------------------------- caught, falls, the checkpoint

  private caught(g: Guard): void {
    const h = this.hero;
    if (this.god || h.state === 'caught' || h.state === 'dead') { if (this.god) { g.state = 'return'; g.susp = 0; g.path = []; g.mark = ''; } return; }
    this.stats.caught++;
    this.stats.spotted = true;
    h.hp -= 1;
    h.pick = 0; h.steal = 0;
    if (h.state === 'hidden') { h.hideIn = -1; }
    this.events.push({ e: 'caught', x: h.x, z: h.z, by: g.i });
    if (h.hp <= 0) { h.state = 'dead'; this.events.push({ e: 'die' }); return; }
    h.state = 'caught'; h.t = 1.5; h.anim = 'caught'; h.animT = 1.5;
  }

  /** Back to the last campfire: followers with the knight, guards back on their rounds. */
  private respawn(): void {
    const h = this.hero;
    h.state = 'play';
    h.x = this.checkpoint[0]; h.z = this.checkpoint[1];
    h.vx = h.vz = 0; h.invul = 1.2; h.pick = 0; h.steal = 0; h.hideIn = -1;
    this.trail = [[h.x, h.z]];
    // caught with his keys: the Chief takes them back and the final starts over from the sneaking
    if (this.phase === 1) { this.phase = 0; this.events.push({ e: 'keysBack' }); }
    let k = 0;
    for (const f of this.followers) {
      if (f.mode === 'cell' || f.mode === 'out') continue;
      const a = k++ * 1.9;
      const p = this.nearestWalkable(h.x + Math.cos(a) * 1.2, h.z + Math.sin(a) * 1.2, false);
      f.x = cellX(p[0]) + Math.cos(a) * 0.3; f.z = cellZ(p[1]) + Math.sin(a) * 0.3;
      f.mode = 'trail'; f.stun = 0; f.path = [];
    }
    for (const g of this.guards) {
      if (g.state === 'fallen' || g.state === 'locked') continue;
      if (g.boss && this.stats.outwit) continue;
      // guards stay where they are and walk back to their rounds (sleepers doze off again where they lay)
      g.state = g.sleeping0 && !this.alarm ? 'sleep' : 'return';
      if (g.state === 'sleep') { const [c, r] = g.def.p[0]; g.x = cellX(c); g.z = cellZ(r); }
      g.mark = g.state === 'sleep' ? 'z' : '';
      g.susp = 0; g.path = []; g.wait = 0; g.hurry = false; g.checkBarrel = -1; g.checks = []; g.seenT = 99;
    }
    this.shots = []; this.decoys = [];
    if (this.alarm) this.alarmT = this.tune.alarm;
    this.events.push({ e: 'respawn' });
  }

  // ---------------------------------------------------------------- the Chief and the alarm

  private stealKeys(b: Guard): void {
    const h = this.hero;
    h.anim = 'act'; h.animT = 0.7;
    this.events.push({ e: 'stolen', x: b.x, z: b.z });
    if (this.c.boss?.trick === 'steal') { this.outwit(b, 'steal'); return; }
    // the Tower: he wakes at once and hunts the knight; the pen is the way out
    // a moment of fumbling for the missing ring, then he hunts the knight (the jingle gives him away)
    this.phase = 1;
    b.state = 'stolen'; b.t = 3.2 - 1.4; b.susp = 1; b.seen = [h.x, h.z]; b.seenT = 0; b.target = -1; b.mark = '!'; b.hurry = true; b.ccd = 1.2; b.scd = 2;
    this.events.push({ e: 'mark', g: b.i, mark: '!' });
    this.events.push({ e: 'chiefCall', x: b.x, z: b.z });
  }

  private outwit(b: Guard, how: string): void {
    if (this.stats.outwit) return;
    this.stats.outwit = true;
    this.points += SCORE.outwit;
    this.phase = 2;
    if (b.state !== 'locked' && b.state !== 'fallen') { b.state = 'stolen'; b.t = 0; b.mark = '?'; }
    this.events.push({ e: 'outwit', x: b.x, z: b.z, how });
    for (const th of this.things) if (th.kind === 'exitgate') { th.want = 1; this.events.push({ e: 'gate', x: th.x, z: th.z, open: true }); }
    // the alarm: every guard awake and hurrying, the clock running
    this.alarm = true;
    this.alarmT = this.tune.alarm;
    this.checkpoint = [this.hero.x, this.hero.z];
    this.checkpointId = -1;
    for (const g of this.guards) {
      if (g === b || g.state === 'fallen' || g.state === 'locked') continue;
      if (g.state === 'sleep' || g.state === 'doze') { g.state = 'patrol'; g.mark = ''; }
    }
    this.events.push({ e: 'alarm' });
  }

  private updateAlarm(dt: number): void {
    if (!this.alarm || this.hero.state !== 'play' && this.hero.state !== 'hidden') return;
    const before = this.alarmT;
    this.alarmT -= dt;
    if (before > 15 && this.alarmT <= 15) this.events.push({ e: 'alarmLow' });
    if (this.alarmT <= 0) {
      this.events.push({ e: 'timeUp' });
      if (this.god) { this.alarmT = this.tune.alarm; return; }
      const g = this.guards.find((x) => x.state !== 'fallen' && x.state !== 'locked') ?? this.guards[0];
      this.caught(g);
    }
  }

  // ---------------------------------------------------------------- the way out

  private clear(): void {
    const h = this.hero;
    if (h.state !== 'play') return;
    let n = 0;
    for (const f of this.followers) if (f.mode === 'trail' || f.mode === 'join' || f.mode === 'cheer') { n++; }
    if (this.followers.filter((f) => f.mode !== 'cell').length < this.c.need) return;
    this.stats.rescued = n;
    h.state = 'clear';
    h.vx = h.vz = 0;
    h.anim = 'cheer'; h.animT = 3;
    this.events.push({ e: 'clear', x: h.x, z: h.z });
  }

  /** The detection readout: 'hidden', 'unseen', 'seen' (a "?" on someone), 'spotted' (a chase). */
  detection(): 'hidden' | 'unseen' | 'seen' | 'spotted' {
    const h = this.hero;
    if (this.guards.some((g) => g.state === 'chase' || g.state === 'charge')) return 'spotted';
    if (this.guards.some((g) => g.susp > 0.12 && this.awake(g) && g.seenT < 0.3)) return 'seen';
    if (h.state === 'hidden' || h.smoke > 0 || this.lightAt(h.x, h.z) <= DETECT.darkAt) return 'hidden';
    return 'unseen';
  }

  /** A rewarded continue: full hearts at the last campfire. */
  revive(): void {
    const h = this.hero;
    h.hp = h.max;
    h.state = 'caught';
    h.t = 0.01;
  }
}
