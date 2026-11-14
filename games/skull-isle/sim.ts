// Skull Isle: the simulation. Pure and seeded (no Phaser, no three.js): the Play scene, the menu's
// autopilot and the headless balance run all drive it with step(dt, input) at 60 Hz and read its
// state and events.
//
// A run raids one island after another. An island is a few waves of skeleton crews rising from
// the sand, with the island's hazards (sharks lunging from the shallows, tentacles slamming from
// the water, rolling barrels, a ship's cannons, rising tide pools) and on some islands a boss: the
// Kraken (its arms first, then its head on the beach) or Captain Bonebeard (his ship's cannons and
// crew, then himself). Between islands the dock shop sells upgrades for the island's loot; after a
// boss a boon is drafted for free. Every attack that can hurt the player is telegraphed on the
// ground first (red circles, lanes and cones that fill up).
import {
  DT, clamp, angDiff, seeded, TUNING, PLAYER, FOES, HERO, comboSteps, islandOf, lapOf,
  POWER_TIME, SHIELD_HITS, FISH_HEAL, POWER_WEIGHTS, TIMED_POWERS,
  type Mode, type FoeKind, type PowerId, type TimedPower, type Cause, type StepDef, type Tuning, type IslandDef,
} from './defs';
import { layout, landD, shoreAt, shorePoint, type Layout } from './island';
import {
  stats, PATCH, patchCost, SHOP_COST, BOON_IDS, doubloonsFor,
  type Loadout, type Stats, type ShopId, type BoonId,
} from './upgrades';

export interface Input {
  /** Move direction on the ground (x right, z towards the camera), length ≤ 1. */
  mx: number;
  mz: number;
  /** Presses this frame. */
  attack: boolean;
  dodge: boolean;
  special: boolean;
  item: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, attack: false, dodge: false, special: false, item: false };

export type PState = 'idle' | 'run' | 'attack' | 'dodge' | 'shoot' | 'signal' | 'hurt' | 'dead' | 'cheer';

export interface Player {
  x: number; z: number; vx: number; vz: number; face: number;
  hp: number; state: PState; t: number;
  step: number; stepDef: StepDef | null; hitDone: boolean;
  chainT: number; invuln: number; dodgeCd: number; dodgeX: number; dodgeZ: number;
  special: number; kegs: number; shieldHits: number;
  powers: Record<TimedPower, number>;
  /** Hits in a row without being hurt (score multiplier), and its fade timer. */
  combo: number; comboT: number;
  secondWinds: number;
  /** Seconds since the last swing (for the view's slash trail). */
  moved: number;
}

export interface Foe {
  id: number; kind: FoeKind;
  x: number; z: number; y: number; vx: number; vz: number; face: number;
  hp: number; maxHp: number; r: number; speed: number; dmg: number;
  state: string; t: number; cd: number;
  /** Aim point of the current attack. */
  tx: number; tz: number;
  flash: number; stun: number;
  /** Tentacles and kraken arms: their base in the water, the direction they reach, their length. */
  bx: number; bz: number; yaw: number; len: number; pitch: number;
  /** Bigger-than-life foes (brutes, the captain). */
  scale: number;
  /** Tutorial dummy: never attacks. */
  passive: boolean;
  /** The telegraph of the attack being wound up. */
  tele: number;
  hitPlayer: boolean;
  /** Seconds since death (the view plays Death, then sinks it). */
  deadT: number;
  elite: boolean;
  /** Tentacles: seconds the player has been out of reach (they dive and come up nearer). */
  away: number;
}

export type TeleKind = 'circle' | 'line' | 'cone';
export interface Tele {
  id: number; kind: TeleKind;
  x: number; z: number; r: number; len: number; w: number; ang: number; arc: number;
  t: number; dur: number;
  dmg: number; cause: Cause; knock: number;
  /** The player's own (gold): hurts foes only. */
  friendly: boolean;
  /** Also hurts foes (cannon fire, barrels). */
  hitsFoes: boolean;
  /** A warning only (a barrel's lane): resolves nothing. */
  lane: boolean;
  owner: number;
}

export type ShotKind = 'skull' | 'cannon' | 'ink' | 'bullet' | 'keg' | 'barrage';
export interface Shot {
  id: number; kind: ShotKind;
  x: number; y: number; z: number;
  x0: number; z0: number; x1: number; z1: number; h: number;
  vx: number; vz: number;
  t: number; dur: number;
  dmg: number; tele: number; hit: number[];
  /** Keg: lying on the sand with its fuse burning. */
  fuse: number;
}

export interface Roller { id: number; x: number; z: number; dx: number; dz: number; speed: number; t: number; tele: number; live: boolean; spin: number; hitPlayer: boolean; hit: number[] }

export interface Loot { id: number; kind: 'coin' | 'bag' | 'power'; power: PowerId | null; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; value: number; pull: boolean }
export interface Chest { id: number; x: number; z: number; open: boolean; t: number }
export interface Pool { x: number; z: number; r: number; state: 'dry' | 'rise' | 'flood'; t: number; level: number }

export type Phase = 'tutorial' | 'intro' | 'fight' | 'breather' | 'cleared' | 'shop' | 'draft' | 'sail' | 'dead';

export type SimEvent =
  | { type: 'swing'; step: number; last: boolean; spin: boolean; anim: string; dur: number }
  | { type: 'hit'; id: number; kind: FoeKind | 'chest' | 'barrel'; x: number; z: number; dmg: number; crit: boolean; heavy: boolean; src: string }
  | { type: 'kill'; id: number; kind: FoeKind; x: number; z: number; boss: boolean }
  | { type: 'hurt'; dmg: number; cause: Cause; x: number; z: number }
  | { type: 'block'; x: number; z: number }
  | { type: 'dodge'; x: number; z: number }
  | { type: 'special'; which: 'pistol' | 'barrage' }
  | { type: 'fire'; kind: ShotKind; x: number; z: number }
  | { type: 'boom'; x: number; z: number; r: number; kind: ShotKind | 'slam' | 'land' }
  | { type: 'splash'; x: number; z: number; big: boolean }
  | { type: 'coin'; x: number; z: number; value: number; bag: boolean }
  | { type: 'power'; power: PowerId; x: number; z: number }
  | { type: 'expire'; power: TimedPower }
  | { type: 'chest'; x: number; z: number }
  | { type: 'spawn'; id: number; kind: FoeKind; x: number; z: number }
  | { type: 'tele'; id: number; friendly: boolean }
  | { type: 'wave'; n: number; of: number }
  | { type: 'waveClear'; n: number }
  | { type: 'island'; k: number }
  | { type: 'cleared'; k: number; bonus: number }
  | { type: 'boss'; kind: 'kraken' | 'captain' }
  | { type: 'bossPhase'; kind: 'kraken' | 'captain'; phase: number }
  | { type: 'bossDown'; kind: 'kraken' | 'captain'; x: number; z: number }
  | { type: 'secondWind' }
  | { type: 'death'; cause: Cause }
  | { type: 'peck'; x: number; z: number }
  | { type: 'keg'; x: number; z: number }
  | { type: 'roll'; id: number }
  | { type: 'tide'; on: boolean }
  | { type: 'heal'; n: number }
  | { type: 'lunge'; x: number; z: number }
  | { type: 'shop' }
  | { type: 'draft'; boons: BoonId[] }
  | { type: 'sail' };

const TAU = Math.PI * 2;
const ON_SCREEN = 25;

export class Sim {
  readonly mode: Mode;
  readonly tune: Tuning;
  readonly load: Loadout;
  rnd: () => number;
  time = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  over = false;
  events: SimEvent[] = [];

  // the run
  k = 0;
  L: Layout;
  isle: IslandDef;
  wave = 0;
  waves = 0;
  score = 0;
  gold = 0;
  goldEarned = 0;
  kills = 0;
  bosses = 0;
  islandsCleared = 0;
  krakenDown = false;
  shop: Partial<Record<ShopId, number>> = {};
  boons: BoonId[] = [];
  patched = false;
  draft: BoonId[] = [];
  cause: Cause | null = null;
  damageBy: Partial<Record<Cause, number>> = {};
  st: Stats;

  p: Player;
  foes: Foe[] = [];
  teles: Tele[] = [];
  shots: Shot[] = [];
  rollers: Roller[] = [];
  loot: Loot[] = [];
  chests: Chest[] = [];
  pools: Pool[] = [];
  /** The parrot companion: where it is (it flies to its targets). */
  parrot = { x: 0, z: 0, y: 2, t: 0, target: -1 };

  // wave state
  private queue: FoeKind[] = [];
  private spawnT = 0;
  private cap = 6;
  private sharkCd = 4;
  private barrelCd = 6;
  private cannonCd = 5;
  private crewT = 0;
  private nextId = 1;
  private bossKind: 'kraken' | 'captain' | null = null;
  /** The boss's phase (kraken: 1 arms, 2 head; captain: 1 ship, 2 fight, 3 enraged). */
  bossPhase = 0;
  private bossT = 0;
  private crewKilled = 0;
  private atkBuf = 0;
  private dodgeBuf = 0;
  private specBuf = 0;
  private itemBuf = 0;
  private peckT = 0;
  /** Tutorial: the practice telegraph's id (and whether the player was inside when it began). */
  tutTele = -1;

  constructor(mode: Mode, seed: number, load: Loadout, opts: { tutorial?: boolean } = {}) {
    this.mode = mode;
    this.tune = TUNING[mode];
    this.load = load;
    this.rnd = seeded(seed);
    this.L = layout(0);
    this.isle = islandOf(0);
    this.st = this.calcStats();
    this.p = {
      x: 0, z: 2, vx: 0, vz: 0, face: Math.PI, hp: this.st.maxHp, state: 'idle', t: 0, step: 0, stepDef: null, hitDone: false,
      chainT: 0, invuln: 0, dodgeCd: 0, dodgeX: 0, dodgeZ: 1, special: 0, kegs: this.st.kegsStart, shieldHits: 0,
      powers: { rum: 0, parrot: 0, shield: 0, gold2: 0, fury: 0 }, combo: 0, comboT: 0, secondWinds: this.st.secondWinds, moved: 0,
    };
    this.startIsland(0, !!opts.tutorial);
  }

  // ------------------------------------------------------------------ helpers

  private calcStats(): Stats {
    return stats(this.load, this.shop, this.boons, this.k, this.tune.hp, this.tune.magnet);
  }

  private get lvl(): number { return this.k * this.tune.ramp; }
  private get lap(): number { return lapOf(this.k); }
  private R(a: number, b: number): number { return a + this.rnd() * (b - a); }
  private emit(e: SimEvent): void { this.events.push(e); }
  /** Telegraph length for this mode. */
  private tl(s: number): number { return s * this.tune.tele; }
  get steps(): StepDef[] { return comboSteps(this.st.combo); }
  get maxSpecial(): number { return PLAYER.pip * this.st.pips; }
  get boss(): Foe | null { return this.foes.find((f) => (f.kind === 'head' || f.kind === 'captain') && f.state !== 'dead') ?? null; }
  get bossActive(): 'kraken' | 'captain' | null { return this.bossKind; }
  /** Foes alive (not dying), hazards included. */
  get alive(): Foe[] { return this.foes.filter((f) => f.state !== 'dead'); }
  get atkMul(): number { return this.st.atkSpeed * (this.p.powers.fury > 0 ? 1.6 : 1); }
  get speed(): number { return this.st.speed * (this.p.powers.rum > 0 ? 1.45 : 1); }

  /** Whether a foe can be hit right now. */
  targetable(f: Foe): boolean {
    if (f.state === 'dead') return false;
    switch (f.kind) {
      case 'tentacle': case 'arm': return f.state === 'down';
      case 'head': return f.state === 'open';
      case 'shark': return f.state === 'beached' || f.state === 'lunge';
      case 'captain': return f.state !== 'ship' && f.state !== 'leap';
      default: return f.state !== 'spawn';
    }
  }

  // ------------------------------------------------------------------ islands and waves

  private startIsland(k: number, tutorial = false): void {
    this.k = k;
    this.L = layout(k);
    this.isle = islandOf(k);
    this.st = this.calcStats();
    this.wave = 0;
    this.waves = this.isle.waves + (this.isle.boss ? 1 : 0);
    this.foes = [];
    this.teles = [];
    this.shots = [];
    this.rollers = [];
    this.loot = [];
    this.chests = [];
    this.queue = [];
    this.bossKind = null;
    this.bossPhase = 0;
    this.patched = false;
    this.pools = this.L.pools.map((q, i) => ({ x: q.x, z: q.z, r: q.r, state: 'dry', t: -i * 2.6, level: 0 }));
    const p = this.p;
    p.x = 0; p.z = this.L.rz * 0.35; p.vx = p.vz = 0; p.face = Math.PI; p.state = 'idle'; p.t = 0; p.stepDef = null;
    p.invuln = 1; p.chainT = 0;
    if (this.st.parrotStart > 0) this.givePower('parrot', this.st.parrotStart, false);
    this.sharkCd = 5;
    this.barrelCd = 7;
    this.cannonCd = 6;
    this.setPhase(tutorial ? 'tutorial' : 'intro');
    this.emit({ type: 'island', k });
  }

  private setPhase(ph: Phase): void {
    this.phase = ph;
    this.phaseT = 0;
  }

  private startWave(): void {
    this.wave++;
    const w = this.wave - 1;
    const bossWave = !!this.isle.boss && this.wave === this.waves;
    this.queue = [];
    if (bossWave) this.startBoss(this.isle.boss!);
    else {
      let budget = (7 + this.lvl * 4.5 + w * 2.5) * this.tune.count * (1 + this.lap * 0.25);
      const pool = this.isle.pool.filter(([, from]) => w >= from).map(([kind]) => kind);
      // every wave leads with plain crews; the specialists come in among them
      let n = 0;
      while (budget > 0.5 && n < 40) {
        let kind: FoeKind = n < 2 ? 'skel' : pool[Math.floor(this.rnd() * pool.length)];
        if (kind === 'tentacle' && this.queue.filter((q) => q === 'tentacle').length >= 1 + Math.floor(this.lvl / 3)) kind = 'skel';
        if (kind === 'brute' && this.queue.filter((q) => q === 'brute').length >= 1 + Math.floor(this.lvl / 4)) kind = 'skel';
        this.queue.push(kind);
        budget -= FOES[kind].cost;
        n++;
      }
    }
    this.cap = Math.round(clamp((5 + this.lvl * 1.2 + w * 1.5) * this.tune.count, 3, 20));
    this.spawnT = 0.3;
    if (this.st.kegsPerWave) this.p.kegs = Math.min(PLAYER.kegsMax, this.p.kegs + this.st.kegsPerWave);
    this.setPhase('fight');
    this.emit({ type: 'wave', n: this.wave, of: this.waves });
  }

  private foeScale(kind: FoeKind): { hp: number; dmg: number; speed: number } {
    const l = this.lvl;
    return {
      hp: (1 + 0.3 * l) * (1 + 0.35 * this.lap) * this.tune.foeHp,
      dmg: (1 + 0.18 * l) * (1 + 0.15 * this.lap),
      speed: this.tune.speed * Math.min(1.25, 1 + 0.025 * l) * (kind === 'runner' || kind === 'skel' ? 1 : 1),
    };
  }

  private makeFoe(kind: FoeKind, x: number, z: number): Foe {
    const d = FOES[kind], s = this.foeScale(kind);
    const f: Foe = {
      id: this.nextId++, kind, x, z, y: 0, vx: 0, vz: 0, face: Math.atan2(this.p.x - x, this.p.z - z),
      hp: Math.round(d.hp * s.hp), maxHp: Math.round(d.hp * s.hp), r: d.r, speed: d.speed * s.speed, dmg: Math.round(d.dmg * s.dmg),
      state: 'spawn', t: 0, cd: this.R(0.6, 1.6), tx: x, tz: z, flash: 0, stun: 0,
      bx: x, bz: z, yaw: 0, len: 0, pitch: 0, scale: kind === 'brute' ? 1.45 : kind === 'captain' ? 2 : 1,
      passive: false, tele: -1, hitPlayer: false, deadT: 0, elite: false, away: 0,
    };
    this.foes.push(f);
    this.emit({ type: 'spawn', id: f.id, kind, x, z });
    return f;
  }

  /** A free spot on land, away from the player. */
  private landSpot(minD: number, maxD = 99): { x: number; z: number } {
    for (let i = 0; i < 40; i++) {
      const th = this.rnd() * TAU, r = Math.sqrt(this.rnd()) * 0.85;
      const x = Math.cos(th) * this.L.rx * r, z = Math.sin(th) * this.L.rz * r;
      const d = Math.hypot(x - this.p.x, z - this.p.z);
      if (d < minD || d > maxD || landD(this.L, x, z) > -1.5 || this.blocked(x, z, 0.8)) continue;
      return { x, z };
    }
    return { x: -this.p.x * 0.5, z: -this.p.z * 0.5 - 2 };
  }

  private blocked(x: number, z: number, r: number): boolean {
    for (const o of this.L.props) if (o.r > 0 && Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
    return false;
  }

  private spawnFromQueue(): void {
    const kind = this.queue.shift()!;
    if (kind === 'tentacle') { this.spawnTentacle(); return; }
    const s = this.landSpot(6.5, 16);
    const f = this.makeFoe(kind, s.x, s.z);
    if (kind === 'brute' || (this.lvl > 3 && this.rnd() < 0.08 + this.lvl * 0.01)) f.elite = kind !== 'brute' ? true : f.elite;
    if (f.elite) { f.hp = f.maxHp = Math.round(f.maxHp * 1.8); f.scale = 1.18; }
  }

  private spawnTentacle(arm = false, at?: { x: number; z: number }): Foe | null {
    const spots = this.L.tentacleSpots;
    let best: { x: number; z: number } | null = at ?? null;
    if (!best) {
      let bd = 1e9;
      for (const s of spots) {
        if (this.foes.some((f) => (f.kind === 'tentacle' || f.kind === 'arm') && f.state !== 'dead' && Math.hypot(f.bx - s.x, f.bz - s.z) < 2.5)) continue;
        const d = Math.abs(Math.hypot(s.x - this.p.x, s.z - this.p.z) - 7) + this.rnd() * 3;
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (!best) return null;
    const f = this.makeFoe(arm ? 'arm' : 'tentacle', best.x, best.z);
    f.bx = best.x; f.bz = best.z;
    f.len = arm ? 10.5 : 8;
    f.yaw = Math.atan2(-best.x, -best.z);
    f.y = -f.len;
    f.state = 'rise';
    this.emit({ type: 'splash', x: best.x, z: best.z, big: true });
    return f;
  }

  // ------------------------------------------------------------------ bosses

  private startBoss(kind: 'kraken' | 'captain'): void {
    this.bossKind = kind;
    this.bossPhase = 1;
    this.bossT = 0;
    this.crewKilled = 0;
    this.crewT = 2;
    this.cap = Math.round(3 * this.tune.count) + 1;
    if (kind === 'kraken') {
      const sp = shorePoint(this.L, -Math.PI / 2, 9);
      const head = this.makeFoe('head', sp.x, sp.z);
      head.state = 'lurk';
      head.y = -3;
      head.face = 0;
      this.krakenArms(4, 1);
    } else {
      const ship = this.L.ship!;
      const c = this.makeFoe('captain', ship.x, ship.z + 0.5);
      c.state = 'ship';
      c.y = 2.6;
      c.face = 0;
    }
    this.emit({ type: 'boss', kind });
  }

  private krakenArms(n: number, hpK: number): void {
    const ths = [-2.45, -0.7, -2.0, -1.15].slice(0, n);
    for (const th of ths) {
      const s = shorePoint(this.L, th + this.R(-0.08, 0.08), 1.8);
      const a = this.spawnTentacle(true, s);
      if (a) { a.hp = a.maxHp = Math.round(a.maxHp * hpK); a.cd = this.R(1.5, 3.5); }
    }
  }

  // ------------------------------------------------------------------ the step

  step(dt: number, inp: Input): void {
    this.time += dt;
    this.phaseT += dt;
    const p = this.p;
    if (inp.attack) this.atkBuf = 0.3;
    if (inp.dodge) this.dodgeBuf = 0.22;
    if (inp.special) this.specBuf = 0.25;
    if (inp.item) this.itemBuf = 0.2;
    this.atkBuf -= dt; this.dodgeBuf -= dt; this.specBuf -= dt; this.itemBuf -= dt;

    switch (this.phase) {
      case 'tutorial': break;
      case 'intro': if (this.phaseT > 1.8) this.startWave(); break;
      case 'fight': this.updateWave(dt); break;
      case 'breather': if (this.phaseT > 2.2) this.startWave(); break;
      case 'cleared': this.magnetAll(dt); if (this.phaseT > 2.6) { this.setPhase('shop'); this.emit({ type: 'shop' }); } break;
      case 'shop': case 'draft': return;
      case 'sail': if (this.phaseT > 1.4) this.startIsland(this.k + 1); return;
      case 'dead': if (this.phaseT > 2.4) this.over = true; break;
    }
    this.updatePlayer(dt, inp);
    this.updateFoes(dt);
    this.updateTeles(dt);
    this.updateShots(dt);
    this.updateRollers(dt);
    this.updateLoot(dt);
    this.updatePools(dt);
    this.updateParrot(dt);
    this.foes = this.foes.filter((f) => !(f.state === 'dead' && f.deadT > 3) && !(f.state === 'gone'));
    this.chests = this.chests.filter((c) => !c.open || c.t < 6);
  }

  private updateWave(dt: number): void {
    // hazards
    if (this.isle.sharks) this.sharkTick(dt);
    if (this.isle.barrels) {
      this.barrelCd -= dt;
      if (this.barrelCd <= 0) { this.barrelCd = this.R(6.5, 9.5) / (1 + this.lvl * 0.04); this.spawnRoller(); }
    }
    if (this.isle.cannon || (this.bossKind === 'captain' && this.bossPhase !== 2)) {
      this.cannonCd -= dt;
      if (this.cannonCd <= 0) {
        this.cannonCd = this.bossKind === 'captain' ? (this.bossPhase === 1 ? 3.4 : 6) : this.R(5, 7);
        this.cannonVolley(this.bossKind === 'captain' && this.bossPhase === 1 ? 4 : 3);
      }
    }
    if (this.bossKind) { this.updateBoss(dt); return; }
    // spawning
    const fighting = this.foes.filter((f) => f.state !== 'dead' && f.kind !== 'shark').length;
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && fighting < this.cap && this.foes.length < ON_SCREEN) {
      this.spawnFromQueue();
      this.spawnT = this.R(0.35, 0.8);
    }
    if (!this.queue.length && fighting === 0) this.waveCleared();
  }

  private waveCleared(): void {
    this.emit({ type: 'waveClear', n: this.wave });
    // a chest after the second wave, sometimes after the others
    if (this.wave === 2 || this.rnd() < 0.35) {
      const s = this.landSpot(2.5, 7);
      this.chests.push({ id: this.nextId++, x: s.x, z: s.z, open: false, t: 0 });
    }
    if (this.wave >= this.waves) this.islandCleared();
    else this.setPhase('breather');
  }

  private islandCleared(): void {
    const bonus = Math.round(300 * (this.k + 1) * (1 + this.lap * 0.5));
    this.score += bonus;
    this.islandsCleared++;
    this.teles = [];
    this.rollers = [];
    for (const f of this.foes) if (f.state !== 'dead') this.killFoe(f, false);
    this.setPhase('cleared');
    this.emit({ type: 'cleared', k: this.k, bonus });
  }

  private updateBoss(dt: number): void {
    this.bossT += dt;
    const fighting = this.foes.filter((f) => f.state !== 'dead' && (f.kind === 'skel' || f.kind === 'runner' || f.kind === 'thrower')).length;
    if (this.bossKind === 'kraken') {
      // small crews keep coming from the sand
      this.crewT -= dt;
      if (this.crewT <= 0 && fighting < this.cap - 1 && this.bossPhase === 1) { this.crewT = this.R(7, 11); const s = this.landSpot(6, 14); this.makeFoe(this.rnd() < 0.6 ? 'skel' : 'runner', s.x, s.z); }
      const head = this.foes.find((f) => f.kind === 'head');
      if (!head || head.state === 'dead') return;
      const arms = this.foes.filter((f) => f.kind === 'arm' && f.state !== 'dead');
      if (this.bossPhase === 1 && !arms.length && head.state === 'lurk') {
        this.bossPhase = 2;
        head.state = 'surface'; head.t = 0;
        this.emit({ type: 'bossPhase', kind: 'kraken', phase: 2 });
      }
      return;
    }
    // the captain
    const cap = this.foes.find((f) => f.kind === 'captain');
    if (!cap || cap.state === 'dead') return;
    if (this.bossPhase === 1) {
      this.crewT -= dt;
      if (this.crewT <= 0 && fighting < this.cap + 1) {
        this.crewT = this.R(1.6, 2.6);
        const ship = this.L.ship!;
        for (let i = 0; i < 2; i++) {
          const s = shorePoint(this.L, -Math.PI / 2 + this.R(-0.5, 0.5), -2.2);
          const f = this.makeFoe(this.rnd() < 0.7 ? 'skel' : 'runner', s.x, s.z);
          f.state = 'spawn';
          void ship;
        }
      }
      if (this.crewKilled >= Math.round(7 * this.tune.count) || this.bossT > 24) {
        this.bossPhase = 2;
        cap.state = 'leap'; cap.t = 0;
        const s = { x: this.p.x + this.R(-1, 1), z: this.p.z - 2.5 };
        cap.bx = cap.x; cap.bz = cap.z; cap.tx = clamp(s.x, -6, 6); cap.tz = clamp(s.z, -8, 8);
        cap.tele = this.addTele({ kind: 'circle', x: cap.tx, z: cap.tz, r: 3, dur: this.tl(1.2), dmg: cap.dmg, cause: 'captain', knock: 8, owner: cap.id });
        this.emit({ type: 'bossPhase', kind: 'captain', phase: 2 });
      }
    } else if (this.bossPhase === 2 && cap.hp < cap.maxHp * 0.5) {
      this.bossPhase = 3;
      cap.speed *= 1.25;
      this.emit({ type: 'bossPhase', kind: 'captain', phase: 3 });
    }
  }

  // ------------------------------------------------------------------ the player

  private updatePlayer(dt: number, inp: Input): void {
    const p = this.p;
    const st = this.st;
    for (const k of TIMED_POWERS) {
      if (p.powers[k] > 0) {
        p.powers[k] -= dt;
        if (p.powers[k] <= 0) {
          p.powers[k] = 0;
          if (k === 'shield') p.shieldHits = 0;
          this.emit({ type: 'expire', power: k });
        }
      }
    }
    p.invuln -= dt;
    p.dodgeCd -= dt * (p.powers.rum > 0 ? 2 : 1);
    p.chainT -= dt;
    p.moved += dt;
    if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
    p.t += dt;
    if (p.state === 'dead') { p.vx *= 0.9; p.vz *= 0.9; this.moveBody(dt); return; }
    if (p.state === 'cheer') { p.vx = p.vz = 0; return; }
    const ml = Math.hypot(inp.mx, inp.mz);
    const mx = ml > 1 ? inp.mx / ml : inp.mx, mz = ml > 1 ? inp.mz / ml : inp.mz;
    const free = p.state === 'idle' || p.state === 'run';
    const canAct = this.phase !== 'cleared' && this.phase !== 'sail';

    if (free && canAct) {
      if (this.dodgeBuf > 0 && p.dodgeCd <= 0) this.startDodge(mx, mz);
      else if (this.specBuf > 0 && p.special >= PLAYER.pip) this.startSpecial();
      else if (this.atkBuf > 0) this.startStep(p.chainT > 0 ? p.step + 1 : 0, mx, mz);
      else if (this.itemBuf > 0 && p.kegs > 0) this.throwKeg();
    }

    switch (p.state) {
      case 'idle': case 'run': {
        const sp = this.speed;
        const ax = mx * sp - p.vx, az = mz * sp - p.vz;
        const k = Math.min(1, dt * (ml > 0.05 ? 16 : 22));
        p.vx += ax * k; p.vz += az * k;
        if (ml > 0.1) { p.face += angDiff(p.face, Math.atan2(mx, mz)) * Math.min(1, dt * 16); p.state = 'run'; }
        else if (Math.hypot(p.vx, p.vz) < 0.4) p.state = 'idle';
        break;
      }
      case 'attack': {
        const s = p.stepDef!;
        const tt = p.t * this.atkMul;
        // lunge forward until the hit
        const lungeV = tt < s.hit ? s.lunge / s.hit : 0;
        p.vx = Math.sin(p.face) * lungeV + mx * this.speed * 0.15;
        p.vz = Math.cos(p.face) * lungeV + mz * this.speed * 0.15;
        if (!p.hitDone && tt >= s.hit) { p.hitDone = true; this.meleeHit(s); }
        if (tt > s.hit && this.dodgeBuf > 0 && p.dodgeCd <= 0) { this.startDodge(mx, mz); break; }
        const next = p.step + 1 < this.steps.length;
        if (next && this.atkBuf > 0 && tt >= s.dur * 0.78) this.startStep(p.step + 1, mx, mz);
        else if (tt >= s.dur) { p.state = 'idle'; p.chainT = next ? PLAYER.chain : 0; if (!next) p.step = -1; }
        break;
      }
      case 'dodge': {
        const k = p.t / PLAYER.dodgeTime;
        const v = PLAYER.dodgeSpeed * (1 - k * k * 0.6);
        p.vx = p.dodgeX * v; p.vz = p.dodgeZ * v;
        if (p.t >= PLAYER.dodgeTime) { p.state = 'idle'; p.vx *= 0.3; p.vz *= 0.3; }
        break;
      }
      case 'shoot': {
        p.vx *= 0.8; p.vz *= 0.8;
        if (p.t >= 0.16 && !p.hitDone) { p.hitDone = true; this.firePistol(); }
        if (p.t >= 0.42) p.state = 'idle';
        break;
      }
      case 'signal': {
        p.vx *= 0.8; p.vz *= 0.8;
        if (p.t >= 0.35 && !p.hitDone) { p.hitDone = true; this.barrage(); }
        if (p.t >= 0.75) p.state = 'idle';
        break;
      }
      case 'hurt': {
        p.vx *= 1 - Math.min(1, dt * 8); p.vz *= 1 - Math.min(1, dt * 8);
        if (p.t >= 0.24) p.state = 'idle';
        break;
      }
    }
    this.moveBody(dt);
  }

  /** Moves the player by its velocity, kept on the sand and out of the props. */
  private moveBody(dt: number): void {
    const p = this.p;
    p.x += p.vx * dt; p.z += p.vz * dt;
    this.keepOnLand(p, PLAYER.radius);
  }

  private keepOnLand(o: { x: number; z: number }, r: number): void {
    const L = this.L;
    const th = Math.atan2(o.z, o.x);
    const lim = shoreAt(L, th) - 0.35 - r;
    const d = Math.hypot(o.x, o.z);
    if (d > lim) { o.x *= lim / d; o.z *= lim / d; }
    for (const pr of L.props) {
      if (pr.r <= 0) continue;
      const dx = o.x - pr.x, dz = o.z - pr.z, dd = Math.hypot(dx, dz), m = pr.r + r;
      if (dd < m && dd > 1e-4) { o.x = pr.x + dx / dd * m; o.z = pr.z + dz / dd * m; }
    }
  }

  private startStep(i: number, mx: number, mz: number): void {
    const p = this.p;
    const steps = this.steps;
    if (i >= steps.length || i < 0) i = 0;
    p.state = 'attack'; p.t = 0; p.step = i; p.stepDef = steps[i]; p.hitDone = false;
    this.atkBuf = 0;
    p.moved = 0;
    // aim: the nearest foe in front of the stick (or the facing), else the stick
    const want = Math.hypot(mx, mz) > 0.2 ? Math.atan2(mx, mz) : p.face;
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const t of this.hittables()) {
      const d = Math.hypot(t.x - p.x, t.z - p.z) - t.r;
      if (d > 4.2) continue;
      const a = Math.abs(angDiff(want, Math.atan2(t.x - p.x, t.z - p.z)));
      if (a > 1.3) continue;
      const score = d + a * 1.5;
      if (score < bd) { bd = score; best = t; }
    }
    // nothing in front: the nearest thing in reach all round (a foe behind is still hit)
    if (!best) {
      bd = 1e9;
      for (const t of this.hittables()) {
        const d = Math.hypot(t.x - p.x, t.z - p.z) - t.r;
        if (d < 2.3 && d < bd) { bd = d; best = t; }
      }
    }
    p.face = best ? Math.atan2(best.x - p.x, best.z - p.z) : want;
    const s = steps[i];
    this.emit({ type: 'swing', step: i, last: i === steps.length - 1, spin: !!s.spin, anim: s.anim, dur: s.dur / this.atkMul });
  }

  /** Everything a swing can land on: foes, chests, barrels. */
  private hittables(): { x: number; z: number; r: number; foe?: Foe; chest?: Chest; roller?: Roller }[] {
    const out: { x: number; z: number; r: number; foe?: Foe; chest?: Chest; roller?: Roller }[] = [];
    for (const f of this.foes) {
      if (!this.targetable(f)) continue;
      if (f.kind === 'tentacle' || f.kind === 'arm') {
        const c = this.armPoint(f, this.p.x, this.p.z);
        out.push({ x: c.x, z: c.z, r: f.r, foe: f });
      } else out.push({ x: f.x, z: f.z, r: f.r * f.scale, foe: f });
    }
    for (const c of this.chests) if (!c.open) out.push({ x: c.x, z: c.z, r: 0.6, chest: c });
    for (const b of this.rollers) if (b.live) out.push({ x: b.x, z: b.z, r: 0.45, roller: b });
    return out;
  }

  /** The point of a slammed tentacle nearest to (x, z). */
  armPoint(f: Foe, x: number, z: number): { x: number; z: number } {
    const dx = Math.sin(f.yaw), dz = Math.cos(f.yaw);
    const u = clamp((x - f.bx) * dx + (z - f.bz) * dz, 0.5, f.len * 0.95);
    return { x: f.bx + dx * u, z: f.bz + dz * u };
  }

  private meleeHit(s: StepDef): void {
    const p = this.p;
    let any = false;
    const finisher = !!s.spin;
    for (const t of this.hittables()) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > s.range + t.r) continue;
      if (s.arc < TAU && Math.abs(angDiff(p.face, Math.atan2(t.x - p.x, t.z - p.z))) > s.arc / 2 + (d < 0.9 ? 1 : 0)) continue;
      any = true;
      if (t.chest) { this.openChest(t.chest); continue; }
      if (t.roller) { this.breakRoller(t.roller); continue; }
      const crit = this.rnd() < this.st.crit;
      const dmg = this.st.dmg * s.dmg * (crit ? 2 : 1) * (p.powers.fury > 0 ? 1.15 : 1);
      this.hurtFoe(t.foe!, dmg, p.x, p.z, s.kb, finisher ? 'finisher' : 'melee', crit);
    }
    if (finisher && this.st.thunder) {
      // Thunder Combo: the finisher's shockwave reaches further
      for (const f of this.foes) {
        if (!this.targetable(f)) continue;
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d > s.range + f.r && d < 4.6) this.hurtFoe(f, this.st.dmg * 0.9, p.x, p.z, 5, 'finisher', false);
      }
      this.emit({ type: 'boom', x: p.x, z: p.z, r: 4.6, kind: 'slam' });
    }
    void any;
  }

  private startDodge(mx: number, mz: number): void {
    const p = this.p;
    const l = Math.hypot(mx, mz);
    if (l > 0.2) { p.dodgeX = mx / l; p.dodgeZ = mz / l; } else { p.dodgeX = Math.sin(p.face); p.dodgeZ = Math.cos(p.face); }
    p.face = Math.atan2(p.dodgeX, p.dodgeZ);
    p.state = 'dodge'; p.t = 0;
    p.dodgeCd = this.st.dodgeCd;
    p.invuln = Math.max(p.invuln, PLAYER.dodgeIframes);
    p.chainT = 0;
    this.dodgeBuf = 0;
    this.emit({ type: 'dodge', x: p.x, z: p.z });
    if (this.st.whirlwind) {
      for (const f of this.foes) if (this.targetable(f) && Math.hypot(f.x - p.x, f.z - p.z) < 2.2) this.hurtFoe(f, this.st.dmg * 0.6, p.x, p.z, 3, 'melee', false);
    }
  }

  private startSpecial(): void {
    const p = this.p;
    const barrage = this.st.pips >= 2 && p.special >= PLAYER.pip * 2;
    p.special -= barrage ? PLAYER.pip * 2 : PLAYER.pip;
    p.state = barrage ? 'signal' : 'shoot';
    p.t = 0; p.hitDone = false;
    this.specBuf = 0;
    p.invuln = Math.max(p.invuln, 0.35);
    // face the nearest foe
    let best: Foe | null = null, bd = 1e9;
    for (const f of this.foes) {
      if (!this.targetable(f) && !(f.kind === 'arm' || f.kind === 'tentacle' || f.kind === 'head')) continue;
      if (f.state === 'dead') continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best && !barrage) p.face = Math.atan2(best.x - p.x, best.z - p.z);
    this.emit({ type: 'special', which: barrage ? 'barrage' : 'pistol' });
  }

  private firePistol(): void {
    const p = this.p;
    const dx = Math.sin(p.face), dz = Math.cos(p.face);
    this.shots.push({
      id: this.nextId++, kind: 'bullet', x: p.x + dx * 0.8, y: 1.1, z: p.z + dz * 0.8, x0: p.x, z0: p.z, x1: 0, z1: 0, h: 0,
      vx: dx * 30, vz: dz * 30, t: 0, dur: 0.6, dmg: this.st.dmg * 4.2, tele: -1, hit: [], fuse: 0,
    });
    this.emit({ type: 'fire', kind: 'bullet', x: p.x, z: p.z });
  }

  private barrage(): void {
    const p = this.p;
    const targets = this.foes.filter((f) => f.state !== 'dead' && f.kind !== 'head' && Math.hypot(f.x - p.x, f.z - p.z) < 15)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 7);
    const pts = targets.map((f) => (f.kind === 'arm' || f.kind === 'tentacle' ? this.armPoint(f, f.bx + Math.sin(f.yaw) * f.len * 0.6, f.bz + Math.cos(f.yaw) * f.len * 0.6) : { x: f.x, z: f.z }));
    const head = this.foes.find((f) => f.kind === 'head' && f.state === 'open');
    if (head) pts.push({ x: head.x, z: head.z }, { x: head.x, z: head.z });
    while (pts.length < 6) pts.push({ x: p.x + this.R(-6, 6), z: p.z + this.R(-7, 3) });
    pts.forEach((q, i) => {
      const tele = this.addTele({ kind: 'circle', x: q.x, z: q.z, r: 2.2, dur: 0.75 + i * 0.09, dmg: this.st.dmg * 5, cause: 'cannon', knock: 6, friendly: true, owner: -1 });
      this.shots.push({ id: this.nextId++, kind: 'barrage', x: q.x, y: 30, z: q.z - 20, x0: q.x + 6, z0: q.z - 30, x1: q.x, z1: q.z, h: 12, vx: 0, vz: 0, t: 0, dur: 0.75 + i * 0.09, dmg: 0, tele, hit: [], fuse: 0 });
    });
    this.emit({ type: 'fire', kind: 'barrage', x: p.x, z: p.z });
  }

  private throwKeg(): void {
    const p = this.p;
    p.kegs--;
    this.itemBuf = 0;
    let tx = p.x + Math.sin(p.face) * 5, tz = p.z + Math.cos(p.face) * 5, bd = 9;
    for (const f of this.foes) {
      if (f.state === 'dead' || !this.targetable(f)) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < bd && Math.abs(angDiff(p.face, Math.atan2(f.x - p.x, f.z - p.z))) < 1) { bd = d; tx = f.x; tz = f.z; }
    }
    const c = { x: tx, z: tz };
    this.keepOnLand(c, 0.3);
    this.shots.push({ id: this.nextId++, kind: 'keg', x: p.x, y: 1.2, z: p.z, x0: p.x, z0: p.z, x1: c.x, z1: c.z, h: 2.6, vx: 0, vz: 0, t: 0, dur: 0.55, dmg: this.st.dmg * 6, tele: -1, hit: [], fuse: 0 });
    this.emit({ type: 'keg', x: p.x, z: p.z });
  }

  /** The player takes a hit (dodge, invulnerability and the ghost shield first). */
  hurtPlayer(dmg: number, cause: Cause, fx: number, fz: number, knock: number): boolean {
    const p = this.p;
    if (p.state === 'dead' || p.invuln > 0 || this.phase === 'cleared' || this.phase === 'sail') return false;
    if (p.powers.shield > 0 && p.shieldHits > 0) {
      p.shieldHits--;
      p.invuln = 0.5;
      if (p.shieldHits <= 0) { p.powers.shield = 0; this.emit({ type: 'expire', power: 'shield' }); }
      this.emit({ type: 'block', x: p.x, z: p.z });
      return false;
    }
    const n = Math.max(1, Math.round(dmg * this.tune.hurt * this.st.hurt));
    if (dmg <= 0) return false;
    p.hp -= n;
    this.damageBy[cause] = (this.damageBy[cause] ?? 0) + n;
    p.invuln = PLAYER.hurtInvuln;
    p.combo = 0; p.comboT = 0;
    p.special = Math.min(this.maxSpecial, p.special + 6 * this.st.charge);
    const dx = p.x - fx, dz = p.z - fz, d = Math.hypot(dx, dz) || 1;
    this.emit({ type: 'hurt', dmg: n, cause, x: p.x, z: p.z });
    if (p.hp <= 0) {
      if (p.secondWinds > 0) {
        p.secondWinds--;
        p.hp = Math.round(this.st.maxHp * 0.4);
        p.invuln = 2.2;
        this.emit({ type: 'secondWind' });
        return true;
      }
      p.hp = 0;
      p.state = 'dead'; p.t = 0;
      p.vx = dx / d * 3; p.vz = dz / d * 3;
      this.cause = cause;
      this.setPhase('dead');
      this.emit({ type: 'death', cause });
      return true;
    }
    if (p.state !== 'shoot' && p.state !== 'signal') { p.state = 'hurt'; p.t = 0; }
    p.vx = dx / d * knock; p.vz = dz / d * knock;
    return true;
  }

  // ------------------------------------------------------------------ foes

  hurtFoe(f: Foe, dmg: number, fx: number, fz: number, kb: number, src: 'melee' | 'finisher' | 'special' | 'keg' | 'parrot' | 'hazard', crit: boolean): void {
    if (f.state === 'dead') return;
    const n = Math.max(1, Math.round(dmg));
    f.hp -= n;
    f.flash = 0.12;
    const p = this.p;
    if (src !== 'hazard') {
      p.special = Math.min(this.maxSpecial, p.special + n * PLAYER.charge * this.st.charge * (src === 'special' ? 0.25 : 1));
      p.combo++; p.comboT = 2.6;
      if (this.st.lifesteal && (src === 'melee' || src === 'finisher')) p.hp = Math.min(this.st.maxHp, p.hp + this.st.lifesteal);
    }
    const heavy = src === 'finisher' || src === 'special' || src === 'keg';
    const def = FOES[f.kind];
    if (!def.poise || heavy) {
      if (f.kind !== 'tentacle' && f.kind !== 'arm' && f.kind !== 'head' && f.kind !== 'shark') {
        const dx = f.x - fx, dz = f.z - fz, d = Math.hypot(dx, dz) || 1;
        const k = kb * def.kb;
        f.vx = dx / d * k; f.vz = dz / d * k;
        if (f.kind !== 'captain' || heavy) {
          if (f.tele >= 0) this.cancelTele(f.tele);
          f.tele = -1;
          f.stun = heavy ? 0.5 : 0.3;
          if (f.state !== 'spawn') { f.state = 'hurt'; f.t = 0; }
        }
      }
    }
    this.emit({ type: 'hit', id: f.id, kind: f.kind, x: f.x, z: f.z, dmg: n, crit, heavy, src });
    if (f.hp <= 0) this.killFoe(f, true);
  }

  private comboMul(): number { return 1 + Math.min(this.p.combo, 60) / 60; }

  private killFoe(f: Foe, reward: boolean): void {
    f.hp = 0;
    f.state = 'dead';
    f.deadT = 0;
    if (f.tele >= 0) this.cancelTele(f.tele);
    f.tele = -1;
    const boss = f.kind === 'head' || f.kind === 'captain';
    if (reward) {
      this.kills++;
      this.score += Math.round(FOES[f.kind].score * this.comboMul() * (1 + this.lap * 0.5));
      const def = FOES[f.kind];
      const coins = Math.round(def.gold * (1 + 0.08 * this.lvl) * (f.elite ? 2.5 : 1));
      this.dropCoins(f.kind === 'tentacle' || f.kind === 'arm' ? this.armPoint(f, this.p.x, this.p.z) : f, coins);
      // power-ups: brutes and elites often, the rest now and then
      const chance = boss ? 1 : f.kind === 'brute' || f.elite ? 0.4 : f.kind === 'shark' ? 1 : 0.055;
      if (this.rnd() < chance) this.dropPower(f.kind === 'shark' ? 'fish' : this.randomPower(), f.x, f.z);
      if (f.kind === 'skel' || f.kind === 'runner') this.crewKilled++;
    }
    this.emit({ type: 'kill', id: f.id, kind: f.kind, x: f.x, z: f.z, boss });
    if (boss && reward) this.bossDown(f);
    if (f.kind === 'head') for (const a of this.foes) if (a.kind === 'arm' && a.state !== 'dead') this.killFoe(a, false);
  }

  private bossDown(f: Foe): void {
    const kind = f.kind === 'head' ? 'kraken' : 'captain';
    this.bosses++;
    if (kind === 'kraken') this.krakenDown = true;
    this.score += Math.round(2500 * (1 + this.lap));
    for (let i = 0; i < 3; i++) this.dropCoins({ x: f.x * 0.6, z: f.z * 0.6 + 2 }, 10, 'bag');
    this.chests.push({ id: this.nextId++, x: clamp(f.x, -5, 5) * 0.5, z: clamp(f.z, -9, 9) * 0.5 + 1, open: false, t: 0 });
    this.emit({ type: 'bossDown', kind, x: f.x, z: f.z });
    for (const o of this.foes) if (o.state !== 'dead') this.killFoe(o, false);
    this.teles = [];
    this.bossKind = null;
    this.queue = [];
  }

  private randomPower(): PowerId {
    const total = POWER_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = this.rnd() * total;
    for (const [p, w] of POWER_WEIGHTS) { r -= w; if (r <= 0) return p; }
    return 'fish';
  }

  private dropCoins(at: { x: number; z: number }, n: number, kind: 'coin' | 'bag' = 'coin'): void {
    const bags = kind === 'bag' ? n : Math.floor(n / 6);
    const coins = kind === 'bag' ? 0 : n - bags * 5;
    const add = (k: 'coin' | 'bag', value: number) => {
      const a = this.rnd() * TAU, v = this.R(1.5, 4);
      this.loot.push({ id: this.nextId++, kind: k, power: null, x: at.x, y: 0.6, z: at.z, vx: Math.cos(a) * v, vy: this.R(4, 7), vz: Math.sin(a) * v, t: 0, value, pull: false });
    };
    for (let i = 0; i < Math.min(coins, 14); i++) add('coin', i < 13 ? 1 : coins - 13);
    for (let i = 0; i < bags; i++) add('bag', 5);
  }

  dropPower(power: PowerId, x: number, z: number): void {
    const c = { x, z };
    this.keepOnLand(c, 0.5);
    this.loot.push({ id: this.nextId++, kind: 'power', power, x: c.x, y: 0.6, z: c.z, vx: 0, vy: 5, vz: 0, t: 0, value: 0, pull: false });
  }

  private openChest(c: Chest): void {
    c.open = true;
    c.t = 0;
    this.score += 100;
    this.dropCoins(c, Math.round(14 + this.lvl * 4));
    this.dropPower(this.randomPower(), c.x + this.R(-1, 1), c.z + 1.2);
    this.emit({ type: 'chest', x: c.x, z: c.z });
  }

  private updateFoes(dt: number): void {
    const p = this.p;
    for (const f of this.foes) {
      f.t += dt;
      f.flash -= dt;
      if (f.state === 'dead') { f.deadT += dt; continue; }
      f.cd -= dt;
      switch (f.kind) {
        case 'skel': case 'runner': case 'thrower': case 'brute': this.walker(f, dt); break;
        case 'tentacle': case 'arm': this.tentacle(f, dt); break;
        case 'shark': this.shark(f, dt); break;
        case 'head': this.head(f, dt); break;
        case 'captain': this.captain(f, dt); break;
      }
    }
    // keep the walkers apart
    const w = this.foes.filter((f) => f.state !== 'dead' && (f.kind === 'skel' || f.kind === 'runner' || f.kind === 'thrower' || f.kind === 'brute' || (f.kind === 'captain' && f.state !== 'ship' && f.state !== 'leap')));
    for (let i = 0; i < w.length; i++) {
      for (let j = i + 1; j < w.length; j++) {
        const a = w[i], b = w[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r * a.scale + b.r * b.scale;
        if (d < m && d > 1e-4) { const k = (m - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
      }
      const a = w[i];
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz), m = a.r * a.scale + PLAYER.radius;
      if (d < m && d > 1e-4 && p.state !== 'dodge') { a.x = p.x + dx / d * m; a.z = p.z + dz / d * m; }
      this.keepOnLand(a, a.r);
    }
  }

  /** Skeleton crews, headless runners, skull throwers and brutes. */
  private walker(f: Foe, dt: number): void {
    const p = this.p;
    const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const playerDown = p.state === 'dead' || this.phase === 'cleared';
    // knockback slides off
    f.x += f.vx * dt; f.z += f.vz * dt;
    f.vx *= 1 - Math.min(1, dt * 7); f.vz *= 1 - Math.min(1, dt * 7);
    const move = (ang: number, sp: number) => {
      f.face += angDiff(f.face, ang) * Math.min(1, dt * 8);
      f.x += Math.sin(f.face) * sp * dt; f.z += Math.cos(f.face) * sp * dt;
    };
    switch (f.state) {
      case 'spawn':
        f.y = -1.5 + Math.min(1, f.t / 0.9) * 1.5;
        if (f.t >= 0.9) { f.y = 0; f.state = 'move'; f.t = 0; }
        return;
      case 'hurt':
        f.stun -= dt;
        if (f.stun <= 0) { f.state = 'move'; f.t = 0; f.cd = Math.max(f.cd, 0.5); }
        return;
    }
    if (playerDown || f.passive) {
      if (f.state !== 'move') { f.state = 'move'; f.t = 0; }
      if (f.passive) f.face += angDiff(f.face, toP) * Math.min(1, dt * 4);
      return;
    }
    switch (f.kind) {
      case 'skel':
        if (f.state === 'move') {
          if (d > 1.55) move(toP, f.speed);
          else if (f.cd <= 0) {
            f.state = 'wind'; f.t = 0; f.face = toP;
            f.tele = this.addTele({ kind: 'cone', x: f.x, z: f.z, r: 2.1, arc: 1.9, ang: f.face, dur: this.tl(0.56), dmg: f.dmg, cause: 'skel', knock: 4, owner: f.id });
          } else move(toP + 1.4, f.speed * 0.4);
        } else if (f.state === 'wind') {
          this.syncTele(f);
          if (f.t >= this.tl(0.56)) { f.state = 'act'; f.t = 0; }
        } else if (f.state === 'act') {
          if (f.t >= 0.35) { f.state = 'move'; f.t = 0; f.cd = this.R(0.8, 1.3); }
        }
        break;
      case 'runner':
        if (f.state === 'move') {
          if (d < 7 && d > 2.2 && f.cd <= 0) {
            f.state = 'wind'; f.t = 0; f.face = toP;
            f.tx = p.x + p.vx * 0.3; f.tz = p.z + p.vz * 0.3;
            const ang = Math.atan2(f.tx - f.x, f.tz - f.z);
            f.face = ang;
            f.tele = this.addTele({ kind: 'line', x: f.x, z: f.z, len: 8, w: 1.3, ang, dur: this.tl(0.6), dmg: f.dmg, cause: 'runner', knock: 6, owner: f.id, lane: true });
          } else if (d > 4.5) move(toP, f.speed);
          else move(toP + 1.5, f.speed * 0.7);
        } else if (f.state === 'wind') {
          f.face += angDiff(f.face, toP) * Math.min(1, dt * 1.5);
          const T = this.teles.find((t) => t.id === f.tele);
          if (T) { T.x = f.x; T.z = f.z; T.ang = f.face; }
          if (f.t >= this.tl(0.6)) { f.state = 'dash'; f.t = 0; f.hitPlayer = false; }
        } else if (f.state === 'dash') {
          const sp = 14 * this.tune.speed;
          f.x += Math.sin(f.face) * sp * dt; f.z += Math.cos(f.face) * sp * dt;
          if (!f.hitPlayer && Math.hypot(p.x - f.x, p.z - f.z) < 1) { f.hitPlayer = true; this.hurtPlayer(f.dmg, 'runner', f.x, f.z, 7); }
          if (f.t >= 8 / sp || landD(this.L, f.x, f.z) > -0.9) {
            if (f.tele >= 0) this.cancelTele(f.tele);
            f.tele = -1; f.state = 'tired'; f.t = 0;
          }
        } else if (f.state === 'tired') {
          if (f.t >= 0.9) { f.state = 'move'; f.t = 0; f.cd = this.R(1.6, 2.6); }
        }
        break;
      case 'thrower':
        if (f.state === 'move') {
          if (d < 5) move(toP + Math.PI, f.speed);
          else if (d > 9) move(toP, f.speed);
          else move(toP + 1.57 * (f.id % 2 ? 1 : -1), f.speed * 0.5);
          f.face += angDiff(f.face, toP) * Math.min(1, dt * 4);
          if (f.cd <= 0 && d < 11) { f.state = 'wind'; f.t = 0; }
        } else if (f.state === 'wind') {
          f.face += angDiff(f.face, toP) * Math.min(1, dt * 8);
          if (f.t >= 0.35) {
            const lead = 0.5;
            const c = { x: p.x + p.vx * lead + this.R(-0.6, 0.6), z: p.z + p.vz * lead + this.R(-0.6, 0.6) };
            this.keepOnLand(c, 0);
            const dur = this.tl(1.05);
            const tele = this.addTele({ kind: 'circle', x: c.x, z: c.z, r: 1.35, dur, dmg: f.dmg, cause: 'skull', knock: 4, owner: -1 });
            this.shots.push({ id: this.nextId++, kind: 'skull', x: f.x, y: 1.4, z: f.z, x0: f.x, z0: f.z, x1: c.x, z1: c.z, h: 3.5, vx: 0, vz: 0, t: 0, dur, dmg: 0, tele, hit: [], fuse: 0 });
            this.emit({ type: 'fire', kind: 'skull', x: f.x, z: f.z });
            f.state = 'act'; f.t = 0;
          }
        } else if (f.state === 'act') {
          if (f.t >= 0.4) { f.state = 'move'; f.t = 0; f.cd = this.R(2.4, 3.4); }
        }
        break;
      case 'brute':
        if (f.state === 'move') {
          if (d > 2.4) move(toP, f.speed);
          else if (f.cd <= 0) {
            f.state = 'wind'; f.t = 0; f.face = toP;
            f.tele = this.addTele({ kind: 'circle', x: f.x, z: f.z, r: 3, dur: this.tl(1), dmg: f.dmg, cause: 'brute', knock: 8, owner: f.id });
          } else move(toP, f.speed * 0.5);
        } else if (f.state === 'wind') {
          this.syncTele(f);
          if (f.t >= this.tl(1)) { f.state = 'act'; f.t = 0; this.emit({ type: 'boom', x: f.x, z: f.z, r: 3, kind: 'slam' }); }
        } else if (f.state === 'act') {
          if (f.t >= 0.7) { f.state = 'move'; f.t = 0; f.cd = this.R(1.4, 2.2); }
        }
        break;
    }
  }

  private syncTele(f: Foe): void {
    const T = this.teles.find((t) => t.id === f.tele);
    if (T) { T.x = f.x; T.z = f.z; }
  }

  /** Tentacles (and the kraken's arms): rise, wave, wind up, slam a lane, lie there (hit them!), lift. */
  private tentacle(f: Foe, dt: number): void {
    const p = this.p;
    const arm = f.kind === 'arm';
    const wind = this.tl(arm ? 1.15 : 1.05);
    f.x = f.bx; f.z = f.bz;
    switch (f.state) {
      case 'rise':
        f.y = -f.len * (1 - Math.min(1, f.t / 1.1));
        f.pitch = 0;
        if (f.t >= 1.1) { f.y = 0; f.state = 'idle'; f.t = 0; f.cd = Math.max(f.cd, this.R(0.8, 1.6)); }
        break;
      case 'idle': {
        const toP = Math.atan2(p.x - f.bx, p.z - f.bz);
        f.yaw += angDiff(f.yaw, toP) * Math.min(1, dt * 2);
        f.pitch = 0.15 + Math.sin(this.time * 1.7 + f.id) * 0.08;
        const reach = Math.hypot(p.x - f.bx, p.z - f.bz) < f.len + 1.5;
        f.away = reach ? 0 : f.away + dt;
        if (f.away > (arm ? 5 : 3.5) && this.phase === 'fight') { f.state = 'sink'; f.t = 0; f.away = 0; break; }
        const busy = arm && this.foes.filter((o) => o !== f && o.kind === 'arm' && (o.state === 'wind' || o.state === 'slam')).length >= (this.mode === 'easy' ? 1 : 2);
        if (f.cd <= 0 && reach && !busy && !f.passive && p.state !== 'dead' && this.phase === 'fight') {
          f.state = 'wind'; f.t = 0;
          f.yaw = Math.atan2(p.x - f.bx, p.z - f.bz);
          f.tele = this.addTele({ kind: 'line', x: f.bx, z: f.bz, len: f.len, w: arm ? 2 : 1.7, ang: f.yaw, dur: wind, dmg: f.dmg, cause: arm ? 'arm' : 'tentacle', knock: 7, owner: f.id, hitsFoes: false });
        }
        break;
      }
      case 'wind':
        f.pitch = 0.15 - Math.min(1, f.t / wind) * 0.45;
        if (f.t >= wind) { f.state = 'slam'; f.t = 0; }
        break;
      case 'slam':
        f.pitch = -0.3 + Math.min(1, f.t / 0.16) * (Math.PI / 2 + 0.3);
        if (f.t >= 0.16) {
          f.state = 'down'; f.t = 0; f.tele = -1;
          const c = this.armPoint(f, f.bx + Math.sin(f.yaw) * f.len * 0.7, f.bz + Math.cos(f.yaw) * f.len * 0.7);
          this.emit({ type: 'boom', x: c.x, z: c.z, r: 2, kind: 'slam' });
          this.emit({ type: 'splash', x: f.bx, z: f.bz, big: false });
        }
        break;
      case 'sink':
        f.y = -f.len * Math.min(1, f.t / 0.8);
        if (f.t >= 0.8) {
          // come up again at the free spot nearest the player
          let best: { x: number; z: number } | null = null, bd = 1e9;
          const spots = arm ? [-2.6, -2.2, -1.8, -1.4, -1, -0.6].map((th) => shorePoint(this.L, th, 1.8)) : this.L.tentacleSpots;
          for (const q of spots) {
            if (this.foes.some((o) => o !== f && (o.kind === 'tentacle' || o.kind === 'arm') && o.state !== 'dead' && Math.hypot(o.bx - q.x, o.bz - q.z) < 2.5)) continue;
            const d = Math.hypot(q.x - p.x, q.z - p.z);
            if (d < bd) { bd = d; best = q; }
          }
          if (best) { f.bx = best.x; f.bz = best.z; }
          f.yaw = Math.atan2(p.x - f.bx, p.z - f.bz);
          f.state = 'rise'; f.t = 0;
          this.emit({ type: 'splash', x: f.bx, z: f.bz, big: true });
        }
        break;
      case 'down':
        f.pitch = Math.PI / 2;
        if (f.t >= (arm ? 1.85 : 1.7) * (this.mode === 'easy' ? 1.2 : 1)) { f.state = 'lift'; f.t = 0; }
        break;
      case 'lift':
        f.pitch = Math.PI / 2 - Math.min(1, f.t / 0.6) * (Math.PI / 2 - 0.15);
        if (f.t >= 0.6) { f.state = 'idle'; f.t = 0; f.cd = this.R(arm ? 0.8 : 2, arm ? 1.8 : 3.4); }
        break;
    }
  }

  private sharkTick(dt: number): void {
    const p = this.p;
    this.sharkCd -= dt;
    const near = landD(this.L, p.x, p.z) > -3.6;
    const sharks = this.foes.filter((f) => f.kind === 'shark' && f.state !== 'dead').length;
    if (this.sharkCd <= 0 && near && sharks < 1 + Math.floor(this.lvl / 4) && p.state !== 'dead') {
      this.sharkCd = this.R(4.5, 8);
      const th = Math.atan2(p.z, p.x) + this.R(-0.3, 0.3);
      const from = shorePoint(this.L, th, 9), to = shorePoint(this.L, th, 3);
      const f = this.makeFoe('shark', from.x, from.z);
      f.state = 'fin'; f.bx = from.x; f.bz = from.z; f.tx = to.x; f.tz = to.z; f.y = -0.5;
      f.face = Math.atan2(to.x - from.x, to.z - from.z);
    } else if (!near) this.sharkCd = Math.max(this.sharkCd, 1.2);
  }

  /** Sharks: a fin closes in, the shark lunges up the beach along a red lane, lies stranded (hit it!), slides back. */
  private shark(f: Foe, dt: number): void {
    const p = this.p;
    switch (f.state) {
      case 'fin': {
        const k = Math.min(1, f.t / 1.4);
        f.x = f.bx + (f.tx - f.bx) * k; f.z = f.bz + (f.tz - f.bz) * k;
        f.y = -0.55;
        if (k >= 1) {
          f.state = 'wind'; f.t = 0;
          const ang = Math.atan2(p.x - f.x, p.z - f.z);
          f.face = ang;
          f.tele = this.addTele({ kind: 'line', x: f.x, z: f.z, len: 7.5, w: 1.6, ang, dur: this.tl(0.8), dmg: f.dmg, cause: 'shark', knock: 6, owner: f.id, lane: true });
        }
        break;
      }
      case 'wind':
        f.y = -0.45 + Math.sin(f.t * 18) * 0.05;
        if (f.t >= this.tl(0.8)) { f.state = 'lunge'; f.t = 0; f.hitPlayer = false; f.bx = f.x; f.bz = f.z; this.emit({ type: 'lunge', x: f.x, z: f.z }); this.emit({ type: 'splash', x: f.x, z: f.z, big: true }); }
        break;
      case 'lunge': {
        const sp = 13;
        f.x += Math.sin(f.face) * sp * dt; f.z += Math.cos(f.face) * sp * dt;
        const k = f.t * sp / 7.5;
        f.y = Math.sin(Math.min(1, k) * Math.PI) * 1.2;
        if (!f.hitPlayer && Math.hypot(p.x - f.x, p.z - f.z) < 1.15) { f.hitPlayer = true; this.hurtPlayer(f.dmg, 'shark', f.x, f.z, 7); }
        if (k >= 1) {
          if (f.tele >= 0) this.cancelTele(f.tele);
          f.tele = -1; f.state = 'beached'; f.t = 0; f.y = 0;
          this.emit({ type: 'boom', x: f.x, z: f.z, r: 1.2, kind: 'land' });
        }
        break;
      }
      case 'beached':
        if (f.t >= (this.mode === 'easy' ? 2.2 : 1.7)) { f.state = 'back'; f.t = 0; }
        break;
      case 'back': {
        f.x -= Math.sin(f.face) * 7 * dt; f.z -= Math.cos(f.face) * 7 * dt;
        if (landD(this.L, f.x, f.z) > 0.6) { f.y -= dt * 2; }
        if (f.t >= 1.6) { f.state = 'gone'; this.emit({ type: 'splash', x: f.x, z: f.z, big: false }); }
        break;
      }
      case 'hurt': f.state = 'beached'; break;
    }
  }

  /** The Kraken's head: lurks offshore while its arms fight, then surfaces on the beach, spits ink, dives. */
  private head(f: Foe, dt: number): void {
    const p = this.p;
    const far = shorePoint(this.L, -Math.PI / 2, 9), near = shorePoint(this.L, -Math.PI / 2, 0.5);
    switch (f.state) {
      case 'lurk':
        f.x = far.x; f.z = far.z; f.y = -2.6 + Math.sin(this.time * 0.8) * 0.3;
        break;
      case 'surface': {
        const k = Math.min(1, f.t / 2);
        f.x = far.x + (near.x - far.x) * k; f.z = far.z + (near.z - far.z) * k; f.y = -2.6 + k * 2.4;
        if (k >= 1) { f.state = 'open'; f.t = 0; f.cd = 0.8; this.emit({ type: 'splash', x: f.x, z: f.z, big: true }); }
        break;
      }
      case 'open':
        f.y = -0.2 + Math.sin(f.t * 2) * 0.12;
        f.face = Math.atan2(p.x - f.x, p.z - f.z);
        if (f.cd <= 0 && p.state !== 'dead') {
          f.cd = this.tl(2.5);
          for (let i = 0; i < 2; i++) {
            const c = { x: p.x + this.R(-2.5, 2.5) * (i ? 1 : 0.2), z: p.z + this.R(-2.5, 2.5) * (i ? 1 : 0.2) };
            this.keepOnLand(c, 0);
            const dur = this.tl(1.15) + i * 0.15;
            const tele = this.addTele({ kind: 'circle', x: c.x, z: c.z, r: 1.7, dur, dmg: f.dmg * 0.85, cause: 'ink', knock: 4, owner: -1 });
            this.shots.push({ id: this.nextId++, kind: 'ink', x: f.x, y: 2.5, z: f.z, x0: f.x, z0: f.z + 1, x1: c.x, z1: c.z, h: 5, vx: 0, vz: 0, t: 0, dur, dmg: 0, tele, hit: [], fuse: 0 });
          }
          this.emit({ type: 'fire', kind: 'ink', x: f.x, z: f.z });
        }
        if (f.t >= (this.mode === 'easy' ? 11 : 9)) { f.state = 'dive'; f.t = 0; }
        break;
      case 'dive': {
        const k = Math.min(1, f.t / 1.4);
        f.x = near.x + (far.x - near.x) * k; f.z = near.z + (far.z - near.z) * k; f.y = -0.2 - k * 2.4;
        if (k >= 1) {
          f.state = 'lurk'; f.t = 0;
          this.bossPhase = 1;
          this.krakenArms(2, 0.6);
          this.emit({ type: 'bossPhase', kind: 'kraken', phase: 1 });
        }
        break;
      }
    }
  }

  /** Captain Bonebeard: on his ship while the crew and the cannons fight, then down on the sand. */
  private captain(f: Foe, dt: number): void {
    const p = this.p;
    const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
    f.x += f.vx * dt; f.z += f.vz * dt;
    f.vx *= 1 - Math.min(1, dt * 6); f.vz *= 1 - Math.min(1, dt * 6);
    switch (f.state) {
      case 'ship':
        f.face = toP;
        f.vx = f.vz = 0;
        break;
      case 'leap': {
        const T = this.tl(1.2);
        const k = Math.min(1, f.t / T);
        f.x = f.bx + (f.tx - f.bx) * k; f.z = f.bz + (f.tz - f.bz) * k;
        f.y = (f.bx === f.tx && f.bz === f.tz ? 0 : 2.6 * (1 - k)) + Math.sin(k * Math.PI) * 5;
        f.face = Math.atan2(f.tx - f.bx, f.tz - f.bz);
        if (k >= 1) {
          f.y = 0; f.state = 'recover'; f.t = 0; f.tele = -1;
          this.emit({ type: 'boom', x: f.x, z: f.z, r: 3, kind: 'slam' });
        }
        break;
      }
      case 'chase':
        if (p.state === 'dead') break;
        f.face += angDiff(f.face, toP) * Math.min(1, dt * 6);
        if (d > 2.8) { f.x += Math.sin(f.face) * f.speed * dt; f.z += Math.cos(f.face) * f.speed * dt; }
        if (f.cd <= 0) {
          if (d > 6.5 || (this.rnd() < 0.25 && d > 3)) {
            f.state = 'leap'; f.t = 0; f.bx = f.x; f.bz = f.z;
            const c = { x: p.x + p.vx * 0.4, z: p.z + p.vz * 0.4 };
            this.keepOnLand(c, 1);
            f.tx = c.x; f.tz = c.z;
            f.tele = this.addTele({ kind: 'circle', x: c.x, z: c.z, r: 3, dur: this.tl(1.2), dmg: f.dmg, cause: 'captain', knock: 8, owner: f.id });
          } else if (d < 3.8) {
            f.state = 'wind'; f.t = 0; f.face = toP;
            f.tele = this.addTele({ kind: 'cone', x: f.x, z: f.z, r: 3.8, arc: 2.7, ang: f.face, dur: this.tl(0.8), dmg: f.dmg, cause: 'captain', knock: 7, owner: f.id });
          }
        }
        this.crewT -= dt;
        if (this.crewT <= 0) {
          this.crewT = this.bossPhase === 3 ? 9 : 13;
          for (let i = 0; i < 2; i++) { const s = this.landSpot(4, 10); this.makeFoe('skel', s.x, s.z); }
        }
        break;
      case 'wind':
        this.syncTele(f);
        if (f.t >= this.tl(0.8)) { f.state = 'recover'; f.t = 0; f.tele = -1; this.emit({ type: 'boom', x: f.x, z: f.z, r: 3.8, kind: 'slam' }); }
        break;
      case 'recover':
        if (f.t >= (this.bossPhase === 3 ? 0.6 : 0.9)) { f.state = 'chase'; f.t = 0; f.cd = this.R(0.6, 1.4); }
        break;
      case 'hurt':
        f.stun -= dt;
        if (f.stun <= 0) { f.state = 'chase'; f.t = 0; f.cd = Math.max(f.cd, 0.4); }
        break;
    }
    if (f.state !== 'ship' && f.state !== 'leap') this.keepOnLand(f, f.r);
  }

  // ------------------------------------------------------------------ telegraphs and shots

  private addTele(o: Partial<Tele> & { kind: TeleKind; x: number; z: number; dur: number; dmg: number; cause: Cause }): number {
    const T: Tele = {
      id: this.nextId++, r: 1, len: 0, w: 0, ang: 0, arc: 0, t: 0, knock: 4, friendly: false, hitsFoes: false, lane: false, owner: -1, ...o,
    };
    this.teles.push(T);
    this.emit({ type: 'tele', id: T.id, friendly: T.friendly });
    return T.id;
  }

  private cancelTele(id: number): void {
    this.teles = this.teles.filter((t) => t.id !== id);
  }

  /** Whether a circle of radius r at (x, z) touches a telegraph's area. */
  inTele(T: Tele, x: number, z: number, r: number): boolean {
    const dx = x - T.x, dz = z - T.z;
    if (T.kind === 'circle') return Math.hypot(dx, dz) < T.r + r;
    if (T.kind === 'cone') {
      const d = Math.hypot(dx, dz);
      return d < T.r + r && (d < 0.6 || Math.abs(angDiff(T.ang, Math.atan2(dx, dz))) < T.arc / 2 + r / Math.max(1, d));
    }
    const ux = Math.sin(T.ang), uz = Math.cos(T.ang);
    const u = dx * ux + dz * uz, v = -dx * uz + dz * ux;
    return u > -r && u < T.len + r && Math.abs(v) < T.w / 2 + r;
  }

  private updateTeles(dt: number): void {
    const p = this.p;
    const done: Tele[] = [];
    for (const T of this.teles) {
      T.t += dt;
      if (T.t >= T.dur) done.push(T);
    }
    if (!done.length) return;
    this.teles = this.teles.filter((t) => t.t < t.dur);
    for (const T of done) {
      if (T.lane) continue;
      if (T.id === this.tutTele) { this.emit({ type: 'boom', x: T.x, z: T.z, r: T.r, kind: 'cannon' }); continue; }
      if (!T.friendly && this.inTele(T, p.x, p.z, PLAYER.radius * 0.6)) this.hurtPlayer(T.dmg, T.cause, T.x, T.z, T.knock);
      if (T.friendly || T.hitsFoes) {
        for (const f of this.foes) {
          if (!this.targetable(f) && !(T.friendly && (f.kind === 'arm' || f.kind === 'tentacle') && f.state !== 'dead' && f.state !== 'rise')) continue;
          const c = f.kind === 'arm' || f.kind === 'tentacle' ? this.armPoint(f, T.x, T.z) : f;
          if (this.inTele(T, c.x, c.z, f.r * f.scale)) this.hurtFoe(f, T.friendly ? T.dmg : 40, T.x, T.z, T.knock, T.friendly ? 'special' : 'hazard', false);
        }
      }
    }
  }

  private updateShots(dt: number): void {
    const p = this.p;
    for (const s of this.shots) {
      s.t += dt;
      if (s.kind === 'bullet') {
        s.x += s.vx * dt; s.z += s.vz * dt;
        for (const t of this.hittables()) {
          if (t.foe && s.hit.includes(t.foe.id)) continue;
          if (Math.hypot(t.x - s.x, t.z - s.z) < t.r + 0.5) {
            if (t.chest) { this.openChest(t.chest); continue; }
            if (t.roller) { this.breakRoller(t.roller); continue; }
            s.hit.push(t.foe!.id);
            this.hurtFoe(t.foe!, s.dmg, s.x - s.vx, s.z - s.vz, 6, 'special', false);
          }
        }
        // the kraken's head takes bullets in the water too
        continue;
      }
      if (s.kind === 'keg' && s.t >= s.dur) {
        if (s.fuse === 0) {
          s.x = s.x1; s.z = s.z1; s.y = 0.3;
          s.fuse = 0.001;
          s.tele = this.addTele({ kind: 'circle', x: s.x, z: s.z, r: 2.7, dur: 0.6, dmg: s.dmg, cause: 'cannon', knock: 7, friendly: true, owner: -1 });
        }
        s.fuse += dt;
        if (s.fuse >= 0.6) { s.t = 99; this.emit({ type: 'boom', x: s.x, z: s.z, r: 2.7, kind: 'keg' }); }
        continue;
      }
      const k = Math.min(1, s.t / s.dur);
      s.x = s.x0 + (s.x1 - s.x0) * k; s.z = s.z0 + (s.z1 - s.z0) * k;
      s.y = (s.kind === 'barrage' ? 0 : 1.2) * (1 - k) + Math.sin(k * Math.PI) * s.h + (s.kind === 'barrage' ? (1 - k) * 20 : 0);
      if (k >= 1) {
        s.t = 99;
        this.emit({ type: 'boom', x: s.x, z: s.z, r: s.kind === 'barrage' ? 2.2 : s.kind === 'cannon' ? 1.9 : s.kind === 'ink' ? 1.6 : 1.35, kind: s.kind });
      }
    }
    this.shots = this.shots.filter((s) => (s.kind === 'bullet' ? s.t < s.dur : s.t < 50));
    void p;
  }

  private cannonVolley(n: number): void {
    const p = this.p;
    const ship = this.L.ship;
    if (!ship || p.state === 'dead') return;
    for (let i = 0; i < n; i++) {
      const c = i === 0 ? { x: p.x + p.vx * 0.6, z: p.z + p.vz * 0.6 } : { x: p.x + this.R(-4, 4), z: p.z + this.R(-4, 4) };
      this.keepOnLand(c, 0);
      const dur = this.tl(1.45) + i * 0.18;
      const tele = this.addTele({ kind: 'circle', x: c.x, z: c.z, r: 1.9, dur, dmg: Math.round(18 * this.foeScale('skel').dmg), cause: 'cannon', knock: 7, owner: -1, hitsFoes: true });
      this.shots.push({ id: this.nextId++, kind: 'cannon', x: ship.x, y: 3, z: ship.z, x0: ship.x, z0: ship.z, x1: c.x, z1: c.z, h: 7, vx: 0, vz: 0, t: 0, dur, dmg: 0, tele, hit: [], fuse: 0 });
    }
    this.emit({ type: 'fire', kind: 'cannon', x: ship.x, z: ship.z });
  }

  private spawnRoller(): void {
    const p = this.p;
    const th = this.rnd() * TAU;
    const a = shorePoint(this.L, th, -0.8);
    const tx = p.x + this.R(-1.5, 1.5), tz = p.z + this.R(-1.5, 1.5);
    const ang = Math.atan2(tx - a.x, tz - a.z);
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const len = this.L.rx * 2.6;
    const tele = this.addTele({ kind: 'line', x: a.x, z: a.z, len, w: 1.3, ang, dur: this.tl(1.1) + len / 8, dmg: 0, cause: 'barrel', lane: true });
    this.rollers.push({ id: this.nextId++, x: a.x, z: a.z, dx, dz, speed: 8, t: -this.tl(1.1), tele, live: true, spin: 0, hitPlayer: false, hit: [] });
    this.emit({ type: 'roll', id: this.rollers[this.rollers.length - 1].id });
  }

  private breakRoller(b: Roller): void {
    b.live = false;
    this.cancelTele(b.tele);
    this.score += 20;
    this.emit({ type: 'boom', x: b.x, z: b.z, r: 1, kind: 'land' });
    if (this.rnd() < 0.4) this.dropPower('keg', b.x, b.z);
    else this.dropCoins(b, 3);
  }

  private updateRollers(dt: number): void {
    const p = this.p;
    for (const b of this.rollers) {
      if (!b.live) continue;
      b.t += dt;
      if (b.t < 0) continue;
      b.x += b.dx * b.speed * dt; b.z += b.dz * b.speed * dt;
      b.spin += b.speed * dt / 0.36;
      if (!b.hitPlayer && Math.hypot(p.x - b.x, p.z - b.z) < 0.95) {
        b.hitPlayer = true;
        this.hurtPlayer(Math.round(14 * this.foeScale('skel').dmg), 'barrel', b.x - b.dx, b.z - b.dz, 7);
      }
      for (const f of this.foes) {
        if (b.hit.includes(f.id) || !this.targetable(f) || f.kind === 'tentacle' || f.kind === 'arm' || f.kind === 'head') continue;
        if (Math.hypot(f.x - b.x, f.z - b.z) < 0.6 + f.r * f.scale) { b.hit.push(f.id); this.hurtFoe(f, 28, b.x - b.dx, b.z - b.dz, 6, 'hazard', false); }
      }
      if (b.t > 0.5 && landD(this.L, b.x, b.z) > -0.2) { b.live = false; this.emit({ type: 'splash', x: b.x, z: b.z, big: false }); }
    }
    this.rollers = this.rollers.filter((b) => b.live);
  }

  private updatePools(dt: number): void {
    const p = this.p;
    for (const q of this.pools) {
      q.t += dt;
      if (q.state === 'dry' && q.t >= 5.5) { q.state = 'rise'; q.t = 0; }
      else if (q.state === 'rise' && q.t >= this.tl(1.6)) { q.state = 'flood'; q.t = 0; this.emit({ type: 'tide', on: true }); }
      else if (q.state === 'flood' && q.t >= 3) { q.state = 'dry'; q.t = 0; }
      q.level += ((q.state === 'flood' ? 1 : q.state === 'rise' ? 0.35 : 0) - q.level) * Math.min(1, dt * 3);
      if (q.state === 'flood' && this.phase === 'fight' && Math.hypot(p.x - q.x, p.z - q.z) < q.r) {
        p.vx *= 0.9; p.vz *= 0.9;
        if (p.invuln <= 0) this.hurtPlayer(Math.round(7 * this.foeScale('skel').dmg), 'tide', q.x, q.z, 3);
      }
    }
  }

  // ------------------------------------------------------------------ loot and powers

  private updateLoot(dt: number): void {
    const p = this.p;
    const mag = this.st.magnet;
    for (const l of this.loot) {
      l.t += dt;
      if (l.y > 0 || l.vy > 0) {
        l.vy -= 22 * dt;
        l.y += l.vy * dt;
        l.x += l.vx * dt; l.z += l.vz * dt;
        if (l.y <= 0) { l.y = 0; l.vy = 0; l.vx = l.vz = 0; this.keepOnLand(l, 0.3); }
      }
      const dx = p.x - l.x, dz = p.z - l.z, d = Math.hypot(dx, dz);
      if (p.state === 'dead') continue;
      if (l.kind !== 'power' && (l.pull || (d < mag && l.t > 0.35))) {
        l.pull = true;
        const sp = 9 + l.t * 3;
        l.x += dx / (d || 1) * Math.min(d, sp * dt); l.z += dz / (d || 1) * Math.min(d, sp * dt);
      }
      if (d < (l.kind === 'power' ? 0.95 : 0.7) && l.t > 0.3) {
        l.t = -99;
        if (l.kind === 'power') this.takePower(l.power!, l.x, l.z);
        else {
          const v = Math.max(1, Math.round(l.value * this.st.gold * (p.powers.gold2 > 0 ? 2 : 1)));
          this.gold += v; this.goldEarned += v;
          this.score += v * 5;
          this.emit({ type: 'coin', x: l.x, z: l.z, value: v, bag: l.kind === 'bag' });
        }
      }
    }
    this.loot = this.loot.filter((l) => l.t >= 0 && (l.kind !== 'power' || l.t < 14));
  }

  private magnetAll(dt: number): void {
    for (const l of this.loot) if (l.kind !== 'power') { l.pull = true; l.t = Math.max(l.t, 0.4); }
    void dt;
  }

  private givePower(k: TimedPower, secs: number, announce: boolean): void {
    const p = this.p;
    p.powers[k] = Math.max(p.powers[k], secs);
    if (k === 'shield') p.shieldHits = SHIELD_HITS;
    if (k === 'parrot') { this.parrot.x = p.x; this.parrot.z = p.z; this.parrot.y = 3; }
    if (announce) this.emit({ type: 'power', power: k, x: p.x, z: p.z });
  }

  takePower(k: PowerId, x: number, z: number): void {
    const p = this.p;
    if (k === 'fish') {
      const n = Math.min(this.st.maxHp - p.hp, FISH_HEAL);
      p.hp += n;
      this.emit({ type: 'heal', n });
      this.emit({ type: 'power', power: k, x, z });
      return;
    }
    if (k === 'keg') { p.kegs = Math.min(PLAYER.kegsMax, p.kegs + 1); this.emit({ type: 'power', power: k, x, z }); return; }
    const secs = POWER_TIME[k] * (k === 'rum' ? this.st.rumK : 1);
    this.givePower(k, secs, true);
  }

  private updateParrot(dt: number): void {
    const p = this.p, b = this.parrot;
    b.t += dt;
    if (p.powers.parrot <= 0) { b.target = -1; return; }
    this.peckT -= dt;
    const tgt = this.foes.find((f) => f.id === b.target && this.targetable(f));
    if (!tgt) {
      b.target = -1;
      let bd = 7;
      for (const f of this.foes) {
        if (!this.targetable(f) || f.kind === 'head') continue;
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d < bd) { bd = d; b.target = f.id; }
      }
    }
    const f = this.foes.find((q) => q.id === b.target);
    const gx = f ? f.x : p.x + Math.cos(b.t * 2) * 1.2, gz = f ? f.z : p.z + Math.sin(b.t * 2) * 1.2;
    const k = Math.min(1, dt * (f ? 5 : 4));
    b.x += (gx - b.x) * k; b.z += (gz - b.z) * k;
    b.y += ((f ? 1.3 : 2.4) + Math.sin(b.t * 6) * 0.2 - b.y) * k;
    if (f && this.peckT <= 0 && Math.hypot(b.x - f.x, b.z - f.z) < 1.2) {
      this.peckT = 0.7;
      this.hurtFoe(f, 7 + this.st.dmg * 0.25, b.x, b.z, 1, 'parrot', false);
      this.emit({ type: 'peck', x: f.x, z: f.z });
    }
  }

  // ------------------------------------------------------------------ between islands

  /** Shop: a level of an upgrade (false when it can't be bought). */
  buy(id: ShopId): boolean {
    const lv = this.shop[id] ?? 0;
    const costs = SHOP_COST[id];
    if (this.phase !== 'shop' || lv >= costs.length || this.gold < costs[lv]) return false;
    this.gold -= costs[lv];
    const before = this.st.maxHp;
    this.shop[id] = lv + 1;
    this.st = this.calcStats();
    if (this.st.maxHp > before) this.p.hp += this.st.maxHp - before;
    return true;
  }

  get patchPrice(): number { return patchCost(this.k); }

  buyPatch(): boolean {
    if (this.phase !== 'shop' || this.patched || this.gold < this.patchPrice || this.p.hp >= this.st.maxHp) return false;
    this.gold -= this.patchPrice;
    this.patched = true;
    const n = Math.min(this.st.maxHp - this.p.hp, Math.round(this.st.maxHp * PATCH));
    this.p.hp += n;
    this.emit({ type: 'heal', n });
    return true;
  }

  /** Leaves the shop: a boon draft after a boss island, else the voyage on. */
  leaveShop(): void {
    if (this.phase !== 'shop') return;
    if (this.isle.boss) {
      const pool = BOON_IDS.filter((b) => b !== 'secondWind' || !this.boons.includes('secondWind'));
      const pick: BoonId[] = [];
      while (pick.length < 3) {
        const b = pool[Math.floor(this.rnd() * pool.length)];
        if (!pick.includes(b)) pick.push(b);
      }
      this.draft = pick;
      this.setPhase('draft');
      this.emit({ type: 'draft', boons: pick });
      return;
    }
    this.sail();
  }

  pickBoon(i: number): void {
    if (this.phase !== 'draft') return;
    const b = this.draft[clamp(i, 0, this.draft.length - 1)];
    this.boons.push(b);
    if (b === 'secondWind') this.p.secondWinds++;
    if (b === 'powder') this.p.kegs = Math.min(PLAYER.kegsMax, this.p.kegs + 2);
    this.st = this.calcStats();
    this.draft = [];
    this.sail();
  }

  private sail(): void {
    // a rest at sea: a quarter of the HP back
    const n = Math.min(this.st.maxHp - this.p.hp, Math.round(this.st.maxHp * 0.25));
    this.p.hp += n;
    this.setPhase('sail');
    this.emit({ type: 'sail' });
  }

  // ------------------------------------------------------------------ the tutorial (the Play scene drives it)

  tutorialDummy(): Foe {
    const f = this.makeFoe('skel', this.p.x + 1.2, this.p.z - 2.7);
    f.passive = true;
    f.hp = f.maxHp = 70;
    return f;
  }

  tutorialTele(): number {
    const p = this.p;
    this.tutTele = this.addTele({ kind: 'circle', x: p.x, z: p.z - 0.3, r: 2.2, dur: 2.6, dmg: 0, cause: 'cannon', owner: -1 });
    return this.tutTele;
  }

  tutorialPower(): void { this.dropPower('rum', this.p.x - 2.5, this.p.z - 1.5); }

  endTutorial(): void {
    if (this.phase !== 'tutorial') return;
    for (const f of this.foes) if (f.passive && f.state !== 'dead') { f.state = 'dead'; f.deadT = 2.5; }
    this.teles = [];
    this.tutTele = -1;
    this.setPhase('intro');
  }

  // ------------------------------------------------------------------ test hooks (screenshots, store art)

  /** Jumps to island k (0-based) with a few shop levels and gold, as if the run got there. */
  testIsland(k: number, gold = 0): void {
    this.gold += gold;
    this.startIsland(k);
  }

  /** Skips the island's waves to its last one (the boss's, when it has one). */
  testLastWave(): void {
    if (this.phase === 'tutorial') this.endTutorial();
    this.wave = this.waves - 1;
    for (const f of this.foes) if (f.state !== 'dead' && f.kind !== 'shark') this.killFoe(f, false);
    this.queue = [];
    this.startWave();
  }

  /** Ends the island's fighting at once (the shop follows). */
  testClear(): void { this.queue = []; for (const f of this.foes) if (f.state !== 'dead') this.killFoe(f, false); this.wave = this.waves; this.islandCleared(); }

  /** Spawns n foes of a kind round the player. */
  testFoes(kind: FoeKind, n: number, near = 5): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3;
      const c = { x: this.p.x + Math.sin(a) * near, z: this.p.z + Math.cos(a) * near * 0.8 };
      this.keepOnLand(c, 0.6);
      const f = this.makeFoe(kind, c.x, c.z);
      f.state = 'move';
      f.cd = 1.5 + i * 0.4;
    }
  }

  /** A telegraph for screenshots. */
  testTele(kind: TeleKind, x: number, z: number): void {
    this.addTele({ kind, x, z, r: kind === 'cone' ? 2.2 : 2.2, len: 7, w: 1.6, ang: Math.PI, arc: 1.9, dur: 3, dmg: 0, cause: 'cannon' });
  }

  /** The run's Doubloons. */
  get doubloons(): number { return doubloonsFor(this.goldEarned, this.islandsCleared, this.bosses, this.tune.doubloons, this.kills); }
}

export { HERO };
