// Astro Crew: one mission as a pure simulation, stepped at 60 Hz (no Phaser, no three.js), so the
// Play scene, the menu's live backdrop and the headless balance check (balance.ts) all run the same
// rules. The view (view.ts) draws its state; the scene reacts to its events (sounds, banners).
//
// The hero runs twin-stick style: the stick (or WASD) moves, the weapon aims itself at the nearest
// alien in reach and fires; a foe in arm's reach gets a punch. DODGE rolls (invulnerable; the next
// shot after a roll is a power shot), SKILL fires the class's signature move, MECH turns the hero
// into its mech for a few seconds once the meter is full (kills and the Thunder pickup charge it).
// Aliens come in waves through portals at the edge; the mission's objective decides when it is won:
// clear the waves, defend the dome, find the keycards and hold the beacon, fix the stranded rovers,
// or beat the boss.
import {
  DT, PLAY_R, SPAWN_R, HERO, MOVE, FOE, BOSS, OBJ, TUNING, xpNeed,
  type HeroId, type FoeKind, type BossId, type MissionDef, type Mode, type ShotKind,
} from './defs';
import { mods, type Mods, type CardId, type Ranks } from './powers';

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Input { mx: number; mz: number; dodge: boolean; skill: boolean; mech: boolean }
export const NO_INPUT: Input = { mx: 0, mz: 0, dodge: false, skill: false, mech: false };

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

export type HeroAnim = 'idle' | 'run' | 'roll' | 'punch' | 'leap' | 'hurt' | 'dead' | 'skill' | 'win';

export interface Hero {
  x: number; z: number; face: number;
  hp: number; max: number;
  vx: number; vz: number;
  roll: number; rollCd: number; rollDx: number; rollDz: number; rollShot: number;
  invuln: number; fireT: number; punchCd: number; punchT: number;
  skillCd: number; charges: number;
  mech: number; charge: number; kickCd: number; kickT: number; mechFire: number; mechReady: boolean;
  shots: number; hurtT: number; bubble: number; overdrive: number;
  leap: { t: number; max: number; fx: number; fz: number; tx: number; tz: number } | null;
  alive: boolean; reviveUsed: boolean;
  /** Seconds since the last shot (the view plays Run_Gun_Shoot while firing). */
  firedT: number;
  aimX: number; aimZ: number;
  skillT: number;
  novaT: number;
  hits: number;
}

export type FoeState = 'spawn' | 'move' | 'wind' | 'strike' | 'dive' | 'dead';
export type BossMove = 'slam' | 'charge' | 'summon' | 'fan' | 'ring' | 'quake' | 'dive';

export interface Foe {
  id: number; kind: FoeKind; boss?: BossId;
  x: number; z: number; kx: number; kz: number;
  hp: number; max: number; r: number; speed: number; dmg: number;
  elite: boolean; state: FoeState; t: number; cd: number; face: number;
  target: 'hero' | 'dome';
  slow: number; burn: number; burnDps: number;
  /** Seconds since the last hit (the view flashes). */
  hitT: number;
  deadT: number; xp: number; score: number; mech: number; scale: number;
  move?: BossMove; ax: number; az: number; rage: boolean; strafe: number; spitCd: number; diveCd: number;
}

export interface Shot {
  id: number; kind: ShotKind; x: number; z: number; vx: number; vz: number;
  dmg: number; life: number; r: number; pierce: number; hostile: boolean;
  splash: number; knock: number; hit: number[]; crit: boolean; frost: boolean; burn: boolean; bounce: number; home: boolean; big: boolean;
}

export type PickKind = 'xp' | 'health' | 'bullets' | 'thunder' | 'jar' | 'key';
export interface Pickup { id: number; kind: PickKind; x: number; z: number; v: number; t: number; pull: boolean }
export interface Crate { id: number; x: number; z: number; hp: number }
export type HazKind = 'slam' | 'charge' | 'meteor' | 'lance' | 'ring' | 'dive';
export interface Hazard {
  id: number; kind: HazKind; x: number; z: number; r: number; ang: number; len: number; w: number;
  t: number; max: number; dmg: number; by: number; hostile: boolean; done: boolean;
}
export interface Rover { x: number; z: number; face: number; prog: number; fixed: boolean; leave: number }
export interface Decoy { x: number; z: number; t: number }

export type SimEvent =
  | { type: 'shoot'; kind: ShotKind; x: number; z: number; big: boolean }
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
  | { type: 'boom'; x: number; z: number; r: number; kind: 'ember' | 'meteor' | 'slam' | 'nova' | 'cannon' | 'leap' | 'wave' | 'decoy' | 'mech' | 'lance' | 'blast' }
  | { type: 'mechReady' } | { type: 'mechOn' } | { type: 'mechOff' }
  | { type: 'pickup'; kind: PickKind; x: number; z: number; v: number }
  | { type: 'level'; level: number }
  | { type: 'wave'; n: number; of: number }
  | { type: 'portal'; x: number; z: number; big: boolean }
  | { type: 'spit'; x: number; z: number }
  | { type: 'tele'; kind: HazKind; x: number; z: number }
  | { type: 'crate'; x: number; z: number }
  | { type: 'key'; got: number; of: number }
  | { type: 'beacon' }
  | { type: 'fixed'; i: number; left: number }
  | { type: 'domeHit'; hp: number; max: number }
  | { type: 'boss'; id: BossId }
  | { type: 'rage' }
  | { type: 'chain'; pts: number[] }
  | { type: 'win' }
  | { type: 'lose'; why: 'hero' | 'dome' };

export interface MissionStats { kills: number; damage: number; jars: number; crystals: number; time: number; taken: number; low: number }

export class Mission {
  readonly rnd: () => number;
  readonly m: Mods;
  readonly tune = TUNING.normal;
  readonly hero: Hero;
  foes: Foe[] = [];
  shots: Shot[] = [];
  picks: Pickup[] = [];
  crates: Crate[] = [];
  hazards: Hazard[] = [];
  rovers: Rover[] = [];
  decoy: Decoy | null = null;
  events: SimEvent[] = [];
  phase: 'play' | 'won' | 'lost' = 'play';
  time = 0;
  /** Waves: the current one (1-based), the total (0 = open-ended), the queue of spawns due. */
  wave = 0;
  waves = 0;
  waveT = 0;
  queue: { at: number; kind: Exclude<FoeKind, 'boss'>; elite: boolean; x: number; z: number }[] = [];
  /** Defend: the dome. Keys: found, the beacon's hold. */
  dome = { hp: 0, max: 0, r: 2.6 };
  keys = { got: 0, of: 0, hold: -1 };
  bossId = -1;
  bossDue = false;
  stats: MissionStats = { kills: 0, damage: 0, jars: 0, crystals: 0, time: 0, taken: 0, low: 1 };
  /** Every hit on a foe (a frame's worth) for the view's damage numbers. */
  private nextId = 1;
  private hpK: number;
  private dmgK: number;
  private spdK: number;
  private bladeHit = new Map<number, number>();
  /** Levels gained and not yet drafted (the scene opens the draft). */
  pendingLevels = 0;
  /** Seconds of the drones' orbit. */
  orbit = 0;

  constructor(readonly def: MissionDef, readonly run: RunState, seed: number) {
    this.rnd = mulberry(seed);
    this.tune = TUNING[run.mode];
    this.m = mods(run.ranks, run.cards);
    const H = HERO[run.hero];
    const max = Math.round(H.hp * this.m.hp * this.tune.heroHp);
    this.hero = {
      x: 0, z: 3, face: Math.PI, hp: max, max, vx: 0, vz: 0,
      roll: 0, rollCd: 0, rollDx: 0, rollDz: 1, rollShot: 0,
      invuln: 1.2, fireT: 0.4, punchCd: 0, punchT: 0,
      skillCd: 0, charges: this.m.skillCharges,
      mech: 0, charge: this.m.mechStart, kickCd: 0, kickT: 0, mechFire: 0, mechReady: false,
      shots: 0, hurtT: 9, bubble: 0, overdrive: 0, leap: null, alive: true, reviveUsed: false,
      firedT: 9, aimX: 0, aimZ: -1, skillT: 0, novaT: 7, hits: 0,
    };
    const n = def.n, depth = run.depth;
    this.hpK = this.tune.foeHp * (1 + 0.3 * (n - 1)) * (1 + this.tune.depth * depth);
    this.dmgK = this.tune.foeDmg * (1 + 0.12 * (n - 1)) * (1 + 0.05 * depth);
    this.spdK = this.tune.foeSpeed * (1 + 0.015 * (n - 1));
    this.setup();
  }

  // ---------------------------------------------------------------- setup

  private setup(): void {
    const d = this.def;
    if (d.kind === 'clear' || d.kind === 'defend') this.waves = d.count;
    if (d.kind === 'boss') this.waves = d.count;
    if (d.kind === 'defend') {
      const hp = Math.round(OBJ.domeHp * this.tune.domeHp * this.dmgK);
      this.dome = { hp, max: hp, r: 2.6 };
      this.hero.z = 4.2;
    }
    if (d.kind === 'keys') { this.keys.of = d.count; this.spawnKey(); }
    if (d.kind === 'rescue') {
      for (let i = 0; i < d.count; i++) {
        const a = (i / d.count) * Math.PI * 2 + 0.4 + this.rnd() * 0.5;
        const r = 8.5 + this.rnd() * 2.5;
        this.rovers.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, face: this.rnd() * Math.PI * 2, prog: 0, fixed: false, leave: 0 });
      }
    }
    // supply crates round the arena
    for (let i = 0; i < 4 + Math.floor(d.n / 3); i++) {
      const a = this.rnd() * Math.PI * 2, r = 5 + this.rnd() * 8;
      this.crates.push({ id: this.nextId++, x: Math.sin(a) * r, z: Math.cos(a) * r, hp: 24 });
    }
    this.nextWave();
  }

  /** Living foes (not dying). */
  get alive(): number { let n = 0; for (const f of this.foes) if (f.state !== 'dead') n++; return n; }
  get boss(): Foe | undefined { return this.foes.find((f) => f.id === this.bossId); }
  /** Objective progress for the HUD: [done, of]. */
  progress(): [number, number] {
    switch (this.def.kind) {
      case 'keys': return [this.keys.got, this.keys.of];
      case 'rescue': return [this.rovers.filter((r) => r.fixed).length, this.rovers.length];
      default: return [Math.max(0, this.wave), this.waves];
    }
  }

  // ---------------------------------------------------------------- waves

  private nextWave(): void {
    const d = this.def;
    this.wave++;
    this.waveT = 0;
    const open = d.kind === 'keys' || d.kind === 'rescue';
    if (d.kind === 'boss' && this.wave > this.waves) {
      if (this.bossId < 0) this.bossDue = true;
      else this.summonWave(0.55);
      return;
    }
    this.events.push({ type: 'wave', n: this.wave, of: open ? 0 : this.waves });
    const w = this.wave;
    let budget = this.tune.budget * (12 + 5 * d.n + 6 * Math.min(w, 8)) * (1 + 0.08 * this.run.depth);
    if (d.kind === 'boss') budget *= 0.8;
    if (open) budget *= 0.85;
    this.fill(budget, w, 5 + Math.min(4, w * 0.6));
  }

  /** Queues foes worth `budget` over `span` seconds, in groups from a few edge points. */
  private fill(budget: number, w: number, span: number): void {
    const d = this.def;
    const pool = d.foes.filter((k) => k !== 'brute' || w >= 2 || d.n >= 6);
    if (d.n >= 6 && pool.includes('fly')) pool.push('fly');
    const eliteP = d.n >= 3 ? Math.min(0.28, 0.035 * d.n) : 0;
    let t = this.time + 0.4;
    const groups = Math.max(2, Math.round(span / 3.2));
    const per = span / groups;
    const p0 = this.edgePoint();
    let gx = p0.x, gz = p0.z;
    while (budget >= 1) {
      let kind = pool[Math.floor(this.rnd() * pool.length)];
      // more blobs than anything else
      if (this.rnd() < 0.35) kind = 'xs';
      const cost = FOE[kind].cost;
      if (cost > budget) { kind = 'xs'; }
      const elite = kind !== 'xs' && this.rnd() < eliteP;
      budget -= FOE[kind].cost * (elite ? 2.5 : 1);
      const a = this.rnd() * Math.PI * 2, rr = this.rnd() * 1.6;
      this.queue.push({ at: t + this.rnd() * 0.6, kind, elite, x: gx + Math.sin(a) * rr, z: gz + Math.cos(a) * rr });
      if (this.rnd() < 0.32) { t += per * (0.7 + this.rnd() * 0.6); const p = this.edgePoint(); gx = p.x; gz = p.z; }
    }
    this.queue.sort((a, b) => a.at - b.at);
  }

  private edgePoint(): { x: number; z: number } {
    const h = this.hero;
    for (let k = 0; k < 8; k++) {
      const a = this.rnd() * Math.PI * 2;
      const x = Math.sin(a) * SPAWN_R, z = Math.cos(a) * SPAWN_R;
      if (Math.hypot(x - h.x, z - h.z) > 9) return { x, z };
    }
    const a = Math.atan2(-h.x, -h.z) + (this.rnd() - 0.5);
    return { x: Math.sin(a) * SPAWN_R, z: Math.cos(a) * SPAWN_R };
  }

  private summonWave(k: number): void {
    const d = this.def;
    this.fill(this.tune.budget * (5 + 1.6 * d.n) * k, 3, 4);
  }

  private spawnFoe(kind: Exclude<FoeKind, 'boss'>, elite: boolean, x: number, z: number): Foe {
    const F = FOE[kind];
    const hp = Math.round(F.hp * this.hpK * (elite ? 2.6 : 1));
    const f: Foe = {
      id: this.nextId++, kind, x, z, kx: 0, kz: 0, hp, max: hp, r: F.r * (elite ? 1.18 : 1),
      speed: F.speed * this.spdK * (0.92 + this.rnd() * 0.16), dmg: F.dmg * this.dmgK * (elite ? 1.4 : 1),
      elite, state: 'spawn', t: 0.7, cd: 0.6 + this.rnd(), face: Math.atan2(-x, -z),
      target: this.def.kind === 'defend' && ((kind === 'brute' && this.rnd() < 0.7) || (kind === 's' && this.rnd() < 0.3)) ? 'dome' : 'hero',
      slow: 0, burn: 0, burnDps: 0, hitT: 9, deadT: 0,
      xp: F.xp * (elite ? 3 : 1), score: F.score * (elite ? 3 : 1), mech: F.mech * (elite ? 2 : 1), scale: F.scale * (elite ? 1.2 : 1),
      ax: 0, az: 0, rage: false, strafe: this.rnd() < 0.5 ? 1 : -1, spitCd: 1.5 + this.rnd() * 1.5, diveCd: 4 + this.rnd() * 4,
    };
    this.foes.push(f);
    this.events.push({ type: 'portal', x, z, big: kind === 'brute' || elite });
    return f;
  }

  private spawnBoss(): void {
    const id = this.def.boss!;
    const B = BOSS[id];
    const p = this.edgePoint();
    const hp = Math.round(B.hp * this.tune.foeHp * (1 + this.tune.depth * this.run.depth));
    const f: Foe = {
      id: this.nextId++, kind: 'boss', boss: id, x: p.x * 0.85, z: p.z * 0.85, kx: 0, kz: 0, hp, max: hp, r: B.r,
      speed: B.speed * this.tune.foeSpeed, dmg: B.dmg * this.dmgK, elite: false, state: 'spawn', t: 1.6, cd: 2.2, face: 0,
      target: 'hero', slow: 0, burn: 0, burnDps: 0, hitT: 9, deadT: 0, xp: B.xp, score: B.score, mech: 0.25, scale: B.scale,
      ax: 0, az: 0, rage: false, strafe: 1, spitCd: 2, diveCd: 6,
    };
    this.foes.push(f);
    this.bossId = f.id;
    this.events.push({ type: 'portal', x: f.x, z: f.z, big: true }, { type: 'boss', id });
  }

  /** A keycard somewhere away from the hero, with a guard pack round it (one at a time). */
  private spawnKey(taken?: Pickup): void {
    if (this.keys.got + this.picks.filter((p) => p.kind === 'key' && p !== taken).length >= this.keys.of) return;
    const h = this.hero;
    for (let k = 0; k < 30; k++) {
      const a = this.rnd() * Math.PI * 2, r = 6 + this.rnd() * 7;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.hypot(x - h.x, z - h.z) > 9 || k === 29) {
        this.picks.push({ id: this.nextId++, kind: 'key', x, z, v: 1, t: 0, pull: false });
        const n = 3 + Math.floor(this.def.n / 3);
        for (let i = 0; i < n; i++) {
          const b = (i / n) * Math.PI * 2;
          this.queue.push({ at: this.time + 0.3 + i * 0.15, kind: i === 0 && this.def.n >= 5 ? 'brute' : i % 2 ? 's' : 'xs', elite: i === 0 && this.def.n >= 3, x: x + Math.sin(b) * 2, z: z + Math.cos(b) * 2 });
        }
        this.queue.sort((p, q) => p.at - q.at);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    if (this.phase !== 'play') { this.stepDying(dt); this.stepPicks(dt, true); return; }
    this.time += dt;
    this.waveT += dt;
    this.orbit += dt;
    this.stepHero(dt, inp);
    this.stepSpawns();
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
  }

  // ---------------------------------------------------------------- the hero

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
        const nx = inp.mx / Math.max(1e-6, Math.hypot(inp.mx, inp.mz)), nz = inp.mz / Math.max(1e-6, Math.hypot(inp.mx, inp.mz));
        h.vx = nx * sp; h.vz = nz * sp;
      } else { h.vx = 0; h.vz = 0; }
      h.x += h.vx * dt;
      h.z += h.vz * dt;
    }
    this.clampHero();
    // the skill
    if (inp.skill && !mech && h.charges > 0) this.useSkill();
    // aim: the nearest foe in reach (else a crate), else where the hero runs
    const range = (mech ? 11 : H.range * m.range);
    const tgt = this.nearestFoe(h.x, h.z, range * 1.05);
    let ax = 0, az = 0, aim = false;
    if (tgt) { ax = tgt.x - h.x; az = tgt.z - h.z; aim = true; }
    else {
      const c = this.nearestCrate(h.x, h.z, range * 0.8);
      if (c) { ax = c.x - h.x; az = c.z - h.z; aim = true; }
    }
    if (aim) {
      const l = Math.hypot(ax, az) || 1;
      h.aimX = ax / l; h.aimZ = az / l;
      h.face = turn(h.face, Math.atan2(h.aimX, h.aimZ), 14 * dt);
    } else if (Math.hypot(h.vx, h.vz) > 0.5 && h.roll <= 0) {
      h.face = turn(h.face, Math.atan2(h.vx, h.vz), 12 * dt);
      h.aimX = Math.sin(h.face); h.aimZ = Math.cos(h.face);
    }
    // the punch (or the mech's kick): a foe in arm's reach
    if (h.roll <= 0) {
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
          if (f.state === 'dead' || f.state === 'spawn') continue;
          if (Math.hypot(f.x - near.x, f.z - near.z) < 1.3) this.damage(f, dmg, false, h.aimX, h.aimZ, MOVE.punchKnock, false, false);
        }
      }
    }
    // the weapon
    h.fireT -= dt * (h.overdrive > 0 ? 1.8 : 1);
    if (mech) {
      h.mechFire -= dt;
      if (aim && h.mechFire <= 0) {
        h.mechFire = MOVE.mechEvery;
        this.fire('cannon', MOVE.mechDmg * m.dmg, 1, 0.12, 20, 0, 0, MOVE.mechSplash, 4, 0.6, false);
      }
    } else if (aim && h.fireT <= 0 && h.punchT <= 0.2) {
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
      this.fire(H.shot, dmg, pellets, spread, H.shotSpeed * (0.9 + 0.1 * m.range), H.pierce + m.pierce + (power ? 2 : 0), H.knock * (power ? 1.8 : 1), H.splash, H.range * m.range / H.shotSpeed * 1.15, H.shot === 'bubble' ? 0.32 : 0.28, crit || power);
    }
    // drones and blades and the nova
    if (m.drones > 0) {
      const every = 1.0;
      const k = Math.floor((this.orbit - dt) / every), k2 = Math.floor(this.orbit / every);
      if (k2 !== k) {
        for (let i = 0; i < m.drones; i++) {
          const p = this.dronePos(i);
          const t = this.nearestFoe(p.x, p.z, 9);
          if (!t) continue;
          const l = Math.hypot(t.x - p.x, t.z - p.z) || 1;
          this.addShot('drone', p.x, p.z, (t.x - p.x) / l * 22, (t.z - p.z) / l * 22, 7 * m.dmg, 0.6, 0.25, 0, false, 0, 0.8, false, m.droneFrost, false);
        }
      }
    }
    if (m.blades > 0) {
      for (const [id, t] of this.bladeHit) { if (t - dt <= 0) this.bladeHit.delete(id); else this.bladeHit.set(id, t - dt); }
      for (let i = 0; i < m.blades; i++) {
        const a = this.orbit * 3.2 + (i / m.blades) * Math.PI * 2;
        const bx = h.x + Math.sin(a) * 2.3, bz = h.z + Math.cos(a) * 2.3;
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn' || this.bladeHit.has(f.id)) continue;
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

  private clampHero(): void {
    const h = this.hero;
    const r = Math.hypot(h.x, h.z);
    if (r > PLAY_R) { h.x *= PLAY_R / r; h.z *= PLAY_R / r; }
    // the dome and the beacon are solid
    const solid = this.def.kind === 'defend' ? this.dome.r : this.def.kind === 'keys' ? 1.3 : 0;
    if (solid) {
      const d = Math.hypot(h.x, h.z);
      if (d < solid + 0.5) { const k = (solid + 0.5) / Math.max(0.01, d); h.x *= k; h.z *= k; if (d < 0.01) h.z = solid + 0.5; }
    }
    for (const r2 of this.rovers) {
      if (r2.fixed) continue;
      const d = Math.hypot(h.x - r2.x, h.z - r2.z);
      if (d < 1.6) { const k = 1.6 / Math.max(0.01, d); h.x = r2.x + (h.x - r2.x) * k; h.z = r2.z + (h.z - r2.z) * k; }
    }
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
        const r = Math.hypot(c.x, c.z);
        const tx = r > PLAY_R ? c.x * PLAY_R / r : c.x, tz = r > PLAY_R ? c.z * PLAY_R / r : c.z;
        h.leap = { t: 0, max: 0.55, fx: h.x, fz: h.z, tx, tz };
        h.face = Math.atan2(tx - h.x, tz - h.z);
        break;
      }
      case 'bee': {
        const n = Math.round(16 * (pw > 1 ? 1.5 : 1));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.addShot('sting', h.x, h.z, Math.sin(a) * 12, Math.cos(a) * 12, H.skillDmg * m.dmg * pw, 2.4, 0.3, 0, false, 0, 1, true, false, false, true);
        }
        break;
      }
      case 'flamingo': {
        const t = this.nearestFoe(h.x, h.z, 16);
        const ang = t ? Math.atan2(t.x - h.x, t.z - h.z) : h.face;
        h.face = ang;
        this.hazards.push({ id: this.nextId++, kind: 'lance', x: h.x, z: h.z, r: 0, ang, len: 16, w: 1.3 * (pw > 1 ? 1.4 : 1), t: 0, max: 0.22, dmg: H.skillDmg * m.dmg * pw, by: -1, hostile: false, done: false });
        break;
      }
      case 'panda': {
        const c = this.crowd(11) ?? { x: h.x + Math.sin(h.face) * 6, z: h.z + Math.cos(h.face) * 6 };
        this.hazards.push({ id: this.nextId++, kind: 'meteor', x: c.x, z: c.z, r: 3.7 * (pw > 1 ? 1.25 : 1), ang: 0, len: 0, w: 0, t: 0, max: 0.7, dmg: H.skillDmg * m.dmg * pw, by: -1, hostile: false, done: false });
        break;
      }
    }
  }

  /** The densest spot of foes within `range` of the hero. */
  private crowd(range: number): { x: number; z: number } | null {
    const h = this.hero;
    let best: Foe | null = null, bn = 0;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      if (Math.hypot(f.x - h.x, f.z - h.z) > range) continue;
      let n = 0;
      for (const g of this.foes) if (g.state !== 'dead' && Math.hypot(g.x - f.x, g.z - f.z) < 3.5) n += g.kind === 'boss' ? 6 : 1;
      if (n > bn) { bn = n; best = f; }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  private fire(kind: ShotKind, dmg: number, n: number, spread: number, speed: number, pierce: number, knock: number, splash: number, life: number, r: number, big: boolean): void {
    const h = this.hero, m = this.m;
    const base = Math.atan2(h.aimX, h.aimZ);
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? base + (this.rnd() - 0.5) * spread : base - spread / 2 + (spread * i) / (n - 1) + (this.rnd() - 0.5) * 0.05;
      const sx = h.x + Math.sin(base) * 0.7, sz = h.z + Math.cos(base) * 0.7;
      this.addShot(kind, sx, sz, Math.sin(a) * speed, Math.cos(a) * speed, dmg, life, r * (big ? 1.4 : 1), pierce, false, splash || (m.blast ? 1.4 : 0), knock, false, m.frost, m.burn, big, kind === 'cannon' ? 0 : m.bounce);
    }
    h.firedT = 0;
    this.events.push({ type: 'shoot', kind, x: h.x, z: h.z, big });
  }

  private addShot(kind: ShotKind, x: number, z: number, vx: number, vz: number, dmg: number, life: number, r: number, pierce: number, hostile: boolean, splash: number, knock: number, home: boolean, frost: boolean, burn: boolean, big = false, bounce = 0): void {
    if (this.shots.length > 260) return;
    this.shots.push({ id: this.nextId++, kind, x, z, vx, vz, dmg, life, r, pierce, hostile, splash, knock, hit: [], crit: big, frost, burn, bounce, home, big });
  }

  nearestFoe(x: number, z: number, range: number, skip?: number[]): Foe | null {
    let best: Foe | null = null, bd = range;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      if (skip && skip.includes(f.id)) continue;
      const d = Math.hypot(f.x - x, f.z - z) - f.r * 0.5;
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
    for (const c of this.crates) if (Math.hypot(c.x - x, c.z - z) < r) { c.hp -= dmg; if (c.hp <= 0) this.breakCrate(c); }
  }

  // ---------------------------------------------------------------- damage

  damage(f: Foe, dmg: number, crit: boolean, dx: number, dz: number, knock: number, frost: boolean, burn: boolean): void {
    if (f.state === 'dead' || f.state === 'spawn') return;
    dmg = Math.round(dmg);
    f.hp -= dmg;
    f.hitT = 0;
    this.stats.damage += dmg;
    const resist = f.kind === 'boss' ? 0.08 : f.kind === 'brute' ? 0.3 : f.elite ? 0.6 : 1;
    f.kx += dx * knock * resist;
    f.kz += dz * knock * resist;
    if (frost) f.slow = 1.5;
    if (burn) { f.burn = 2; f.burnDps = 6 * this.m.dmg; }
    this.events.push({ type: 'hit', id: f.id, x: f.x, z: f.z, dmg, crit });
    // a big blob stunned by a big blow loses its wind-up
    if (f.state === 'wind' && f.kind !== 'boss' && f.kind !== 'brute' && knock > 5) { f.state = 'move'; f.cd = 0.6; }
    if (f.hp <= 0) this.kill(f);
  }

  private kill(f: Foe): void {
    f.state = 'dead';
    f.deadT = 0;
    f.hp = 0;
    this.stats.kills++;
    this.run.kills++;
    this.run.score += f.score;
    this.events.push({ type: 'kill', id: f.id, x: f.x, z: f.z, kind: f.kind, elite: f.elite, boss: f.boss });
    const h = this.hero;
    if (h.mech <= 0 && h.charge < 1) h.charge = Math.min(1, h.charge + f.mech * this.m.mechCharge);
    if (this.m.vampire && h.alive) h.hp = Math.min(h.max, h.hp + 1);
    // drops: XP orbs, sometimes health, ammo, thunder, a crystal jar
    let xp = f.xp;
    while (xp > 0) {
      const v = xp >= 8 ? 8 : xp >= 3 ? 3 : 1;
      xp -= v;
      const a = this.rnd() * Math.PI * 2, r = this.rnd() * (f.kind === 'boss' ? 2.5 : 0.6);
      this.picks.push({ id: this.nextId++, kind: 'xp', x: f.x + Math.sin(a) * r, z: f.z + Math.cos(a) * r, v, t: 0, pull: false });
    }
    const roll = this.rnd();
    const heal = this.tune.healDrop * (f.elite ? 6 : 1) * (f.kind === 'brute' ? 3 : 1);
    if (roll < heal) this.drop('health', f.x, f.z);
    else if (roll < heal + 0.012) this.drop('bullets', f.x, f.z);
    else if (roll < heal + 0.02) this.drop('thunder', f.x, f.z);
    if (f.elite || (f.kind === 'brute' && this.rnd() < 0.3) || (this.m.jars && this.rnd() < 0.04)) this.drop('jar', f.x, f.z);
    if (f.kind === 'boss') { this.drop('jar', f.x + 1, f.z); this.drop('jar', f.x - 1, f.z); this.drop('health', f.x, f.z + 1); }
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

  /** The hero takes a blow (unless rolling, invulnerable or shielded). */
  hurt(dmg: number, dx = 0, dz = 0): void {
    const h = this.hero;
    if (!h.alive || h.invuln > 0 || h.roll > 0 || h.leap || this.phase !== 'play') return;
    if (this.m.bubble && h.bubble <= 0 && h.mech <= 0) { h.bubble = this.m.bubble; h.invuln = 0.4; this.events.push({ type: 'blocked' }); return; }
    if (h.mech > 0) dmg *= MOVE.mechArmor;
    dmg = Math.max(1, Math.round(dmg));
    h.hp -= dmg;
    this.stats.taken += dmg;
    this.stats.low = Math.min(this.stats.low, Math.max(0, h.hp) / h.max);
    h.invuln = h.mech > 0 ? 0.25 : MOVE.invuln;
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
      if (f.state === 'dead' || f.kind === 'boss') continue;
      const d = Math.hypot(f.x - h.x, f.z - h.z);
      if (d < 6) this.damage(f, 9999, false, 0, 0, 0, false, false);
    }
    this.events.push({ type: 'revive', how: 'angel' }, { type: 'boom', x: h.x, z: h.z, r: 6, kind: 'nova' });
  }

  // ---------------------------------------------------------------- spawns and foes

  private stepSpawns(): void {
    while (this.queue.length && this.queue[0].at <= this.time && this.alive < 42) {
      const q = this.queue.shift()!;
      this.spawnFoe(q.kind, q.elite, q.x, q.z);
    }
    if (this.bossDue && this.alive < 30) { this.bossDue = false; this.spawnBoss(); }
  }

  private stepFoes(dt: number): void {
    const h = this.hero;
    const list = this.foes;
    for (const f of list) {
      if (f.state === 'dead') continue;
      f.hitT += dt;
      if (f.state === 'spawn') { f.t -= dt; if (f.t <= 0) { f.state = 'move'; f.t = 0; } continue; }
      if (f.burn > 0) {
        f.burn -= dt;
        f.hp -= f.burnDps * dt;
        if (f.hp <= 0) { this.kill(f); continue; }
      }
      f.slow = Math.max(0, f.slow - dt);
      f.cd -= dt;
      // knockback slides off
      f.x += f.kx * dt; f.z += f.kz * dt;
      const decay = Math.exp(-7 * dt);
      f.kx *= decay; f.kz *= decay;
      const spd = f.speed * (f.slow > 0 ? 0.6 : 1);
      // the target: the hero, the dome, or the decoy when it is closer
      let tx = h.x, tz = h.z;
      // a foe on its way to the dome turns on the hero who comes close
      if (f.target === 'dome' && this.dome.hp > 0 && !(h.alive && Math.hypot(h.x - f.x, h.z - f.z) < 3.5)) { tx = 0; tz = 0; }
      if (this.decoy && Math.hypot(this.decoy.x - f.x, this.decoy.z - f.z) < Math.hypot(tx - f.x, tz - f.z) + 3) { tx = this.decoy.x; tz = this.decoy.z; }
      const dx = tx - f.x, dz = tz - f.z, dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist, uz = dz / dist;
      const atDome = tx === 0 && tz === 0 && f.target === 'dome' && this.dome.hp > 0;
      const reach = atDome ? this.dome.r + f.r + 0.2 : f.r + 0.45;
      if (f.kind === 'boss') { this.stepBoss(f, dt, ux, uz, dist); continue; }
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
            if (atDome ? dist < reach + 0.6 : Math.hypot(h.x - f.x, h.z - f.z) < f.r + 1.4) this.contact(f, atDome);
          } else if (f.kind === 'brute') {
            f.state = 'strike'; f.t = 0.5; f.cd = 2.2;
            this.events.push({ type: 'boom', x: f.x, z: f.z, r: 2.9, kind: 'slam' });
            if (atDome && dist < this.dome.r + 3.2) this.hitDome(f.dmg);
            if (Math.hypot(h.x - f.x, h.z - f.z) < 2.9 + 0.3) this.hurt(f.dmg, ux, uz);
          } else if (f.kind === 'fly') {
            if (f.move === 'dive') {
              f.state = 'dive'; f.t = 0.65; f.cd = 0.5;
              const l = Math.hypot(f.ax - f.x, f.az - f.z) || 1;
              f.kx = 0; f.kz = 0; f.ax = (f.ax - f.x) / l; f.az = (f.az - f.z) / l;
              f.diveCd = 5 + this.rnd() * 3;
            } else {
              f.state = 'strike'; f.t = 0.3; f.spitCd = 2.4 + this.rnd() * 1.2;
              const a = Math.atan2(ux, uz);
              for (const o of f.elite ? [-0.25, 0, 0.25] : [0]) this.addShot('spit', f.x, f.z, Math.sin(a + o) * 10, Math.cos(a + o) * 10, f.dmg, 2.2, 0.35, 0, true, 0, 0, false, false, false);
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
      // inside the arena (the edge lets them in)
      const r = Math.hypot(f.x, f.z);
      if (r > SPAWN_R + 1) { f.x *= (SPAWN_R + 1) / r; f.z *= (SPAWN_R + 1) / r; }
    }
    // keep apart (and off the hero, the dome, the rovers)
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'dead' || a.state === 'spawn') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'dead' || b.state === 'spawn') continue;
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
      if (this.def.kind === 'defend' || this.def.kind === 'keys') {
        const sr = this.def.kind === 'defend' ? this.dome.r : 1.3;
        const dd = Math.hypot(a.x, a.z), md = sr + a.r * 0.8;
        if (dd < md && dd > 1e-4) { a.x *= md / dd; a.z *= md / dd; }
      }
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
    this.hazards.push({ id: this.nextId++, kind, x: f.x, z: f.z, r, ang, len, w: kind === 'dive' ? f.r * 2 : 2.2, t: 0, max, dmg: 0, by: f.id, hostile: true, done: false });
    this.events.push({ type: 'tele', kind, x: f.x, z: f.z });
  }

  // ---------------------------------------------------------------- bosses

  private stepBoss(f: Foe, dt: number, ux: number, uz: number, dist: number): void {
    const h = this.hero, B = BOSS[f.boss!];
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
        const r = Math.hypot(f.x, f.z);
        if (f.t <= 0 || r > PLAY_R) { f.state = 'strike'; f.t = 0.5; }
        break;
      }
      case 'strike': {
        f.t -= dt;
        if (f.t <= 0) { f.state = 'move'; f.cd = (f.rage ? 1.5 : 2.2) * (this.run.mode === 'easy' ? 1.3 : 1); }
        break;
      }
    }
    const r = Math.hypot(f.x, f.z);
    if (r > PLAY_R) { f.x *= PLAY_R / r; f.z *= PLAY_R / r; }
  }

  private bossPick(f: Foe, dist: number, ux: number, uz: number): void {
    const B = BOSS[f.boss!];
    const opts: BossMove[] = B.kind === 'fly'
      ? ['fan', 'fan', 'dive', 'summon', ...(f.rage ? ['ring' as BossMove] : [])]
      : ['slam', 'charge', 'charge', 'summon', ...(f.boss === 'king' ? ['ring' as BossMove] : []), ...(f.rage ? ['quake' as BossMove] : [])];
    let mv = opts[Math.floor(this.rnd() * opts.length)];
    if (mv === 'slam' && dist > 6) mv = 'charge';
    if (mv === 'summon' && this.alive > 22) mv = B.kind === 'fly' ? 'fan' : 'charge';
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
          this.hazards.push({ id: this.nextId++, kind: 'slam', x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r, r: 2.4, ang: 0, len: 0, w: 0, t: -i * 0.35, max: 1.0, dmg: f.dmg, by: f.id, hostile: true, done: false });
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
          const kind = f.boss === 'king' ? (i === 0 ? 'brute' : 's') : 'xs';
          this.queue.push({ at: this.time + i * 0.1, kind, elite: false, x: f.x + Math.sin(a) * 3, z: f.z + Math.cos(a) * 3 });
        }
        if (f.boss === 'king') this.queue.push({ at: this.time + 0.3, kind: 'xs', elite: false, x: f.x + 2, z: f.z }, { at: this.time + 0.4, kind: 'xs', elite: false, x: f.x - 2, z: f.z });
        this.queue.sort((a, b) => a.at - b.at);
        break;
      }
      case 'fan': {
        f.state = 'strike'; f.t = 0.5;
        const a = Math.atan2(ux, uz), n = f.rage ? 9 : 7;
        for (let i = 0; i < n; i++) {
          const o = -0.7 + (1.4 * i) / (n - 1);
          this.addShot('spit', f.x, f.z, Math.sin(a + o) * 9, Math.cos(a + o) * 9, f.dmg * 0.7, 2.5, 0.4, 0, true, 0, 0, false, false, false);
        }
        this.events.push({ type: 'spit', x: f.x, z: f.z });
        break;
      }
      case 'ring': {
        f.state = 'strike'; f.t = 0.5;
        if (f.boss === 'queen') {
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            this.addShot('spit', f.x, f.z, Math.sin(a) * 8, Math.cos(a) * 8, f.dmg * 0.6, 2.8, 0.4, 0, true, 0, 0, false, false, false);
          }
          this.events.push({ type: 'spit', x: f.x, z: f.z });
        } else {
          // a ring of fire rolling out from the king: roll through it
          this.hazards.push({ id: this.nextId++, kind: 'ring', x: f.x, z: f.z, r: 0.5, ang: 0, len: 0, w: 0, t: 0, max: 1.8, dmg: f.dmg, by: f.id, hostile: true, done: false });
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
      s.life -= dt;
      if (s.home && !s.hostile) {
        const t = this.nearestFoe(s.x, s.z, 9, s.hit);
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
          if (f.state === 'dead' || f.state === 'spawn' || s.hit.includes(f.id)) continue;
          const lim = f.r + s.r;
          if (Math.abs(f.x - s.x) > lim || Math.abs(f.z - s.z) > lim) continue;
          if (Math.hypot(f.x - s.x, f.z - s.z) > lim) continue;
          const sp = Math.hypot(s.vx, s.vz) || 1;
          s.hit.push(f.id);
          this.damage(f, s.dmg, s.crit, s.vx / sp, s.vz / sp, s.knock, s.frost, s.burn);
          if (s.splash > 0) {
            this.events.push({ type: 'boom', x: s.x, z: s.z, r: s.splash, kind: s.kind === 'cannon' ? 'cannon' : s.kind === 'ember' ? 'ember' : 'blast' });
            for (const g of this.foes) {
              if (g === f || g.state === 'dead' || g.state === 'spawn') continue;
              const d = Math.hypot(g.x - s.x, g.z - s.z);
              if (d < s.splash + g.r) this.damage(g, s.dmg * (s.kind === 'cannon' ? 0.8 : 0.6), false, (g.x - s.x) / (d || 1), (g.z - s.z) / (d || 1), s.knock * 0.6, false, s.burn || s.kind === 'ember' && this.m.burn);
            }
          }
          if (this.m.chain && !chained && s.kind !== 'drone') {
            h.hits++;
            if (h.hits % 4 === 0) { chained = true; this.chain(f); }
          }
          if (s.pierce > 0) { s.pierce--; continue; }
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
        if (!z.done && Math.abs(d - z.r) < 0.55) { this.hurt(z.dmg, (h.x - z.x) / (d || 1), (h.z - z.z) / (d || 1)); if (h.invuln > 0 || h.roll > 0) { /* passed */ } }
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
          if (f.state === 'dead' || f.state === 'spawn') continue;
          const px = f.x - z.x, pz = f.z - z.z;
          const along = px * ex + pz * ez;
          const off = Math.abs(px * ez - pz * ex);
          if (along > -0.5 && along < z.len && off < z.w + f.r) this.damage(f, z.dmg, true, ex, ez, 4, false, this.m.burn);
        }
      } else if (z.kind === 'slam' && z.by >= 0 && !owner) {
        // a quake ring: the boss's ground strike at the hero's feet
        this.events.push({ type: 'boom', x: z.x, z: z.z, r: z.r, kind: 'slam' });
        if (Math.hypot(h.x - z.x, h.z - z.z) < z.r + 0.3) this.hurt(z.dmg);
      } else if (z.kind === 'slam' && owner && owner.kind === 'boss' && owner.move === 'quake') {
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
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
      const pullable = p.kind !== 'key' || d < OBJ.keyR + 0.6;
      if (h.alive && (all || (pullable && (d < mag || p.pull)))) p.pull = true;
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
          this.events.push({ type: 'beacon' });
          // the final rush
          this.fill(this.tune.budget * (10 + 3 * this.def.n), 4, OBJ.beaconHold - 3);
        } else this.spawnKey(p);
        break;
      }
    }
  }

  /** The store art's stage: a ring of aliens round the hero at once. */
  rush(n: number): void {
    const h = this.hero;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd() * 0.3, r = 4.5 + this.rnd() * 3.5;
      const kind = i % 7 === 0 ? 'brute' : i % 3 === 0 ? 'fly' : i % 2 ? 's' : 'xs';
      const f = this.spawnFoe(kind, i % 5 === 0, h.x + Math.sin(a) * r, h.z + Math.cos(a) * r);
      f.t = 0.05;
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
    const quiet = this.queue.length === 0 && this.alive <= 3 + Math.floor(d.n / 2);
    switch (d.kind) {
      case 'clear': case 'defend': {
        if (this.wave < this.waves && (quiet || this.waveT > 28)) this.nextWave();
        else if (this.wave >= this.waves && this.queue.length === 0 && this.alive === 0) this.win();
        break;
      }
      case 'boss': {
        if (this.bossId < 0 && !this.bossDue && (quiet || this.waveT > 26)) this.nextWave();
        else if (this.bossId >= 0 && this.waveT > 18 && this.alive < 12) this.nextWave();
        const b = this.boss;
        if (this.bossId >= 0 && (!b || b.state === 'dead')) this.win();
        break;
      }
      case 'keys': {
        if (this.keys.hold > 0) {
          this.keys.hold -= dt;
          if (this.keys.hold <= 0) this.win();
        } else if (quiet || this.waveT > 18) this.nextWave();
        break;
      }
      case 'rescue': {
        for (const [i, r] of this.rovers.entries()) {
          if (r.fixed) continue;
          const near = h.alive && Math.hypot(h.x - r.x, h.z - r.z) < OBJ.fixR;
          if (near) r.prog = Math.min(1, r.prog + dt / OBJ.fixTime);
          else r.prog = Math.max(0, r.prog - dt * OBJ.fixDecay / OBJ.fixTime);
          if (r.prog >= 1) {
            r.fixed = true;
            const left = this.rovers.filter((o) => !o.fixed).length;
            this.events.push({ type: 'fixed', i, left });
            this.run.score += 300;
            if (!left) { this.win(); return; }
          }
        }
        if (quiet || this.waveT > 16) this.nextWave();
        break;
      }
    }
  }

  private win(): void {
    if (this.phase !== 'play') return;
    this.phase = 'won';
    this.stats.time = this.time;
    // what is left of the swarm pops; every pickup flies to the hero
    for (const f of this.foes) if (f.state !== 'dead') { f.score = 0; this.kill(f); }
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
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-k, Math.min(k, d));
}
