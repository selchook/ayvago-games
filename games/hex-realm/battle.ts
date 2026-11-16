// Hex Realm: the battle simulation. Deterministic (one seeded generator, a fixed 60 Hz step) and
// free of drawing: the view (battleview.ts) and the Play scene read its state and its events.
//   - The hero: move, a class combo (blows with their own hit time, reach and cone; arrows and
//     bolts for the ranged classes, auto-aimed at the best foe ahead), a dodge with i-frames, two
//     class skills on cooldowns, potions, the power-ups (haste, rage, shield, regen, double gold).
//   - The foes: melee cones, archers, lunging ghouls, slamming brutes, healing acolytes, shielded
//     knights, fire-casting cultists, three mini-bosses and three bosses with telegraphed patterns
//     and phases. Every blow that can hurt the hero is announced first by a red zone on the ground
//     (circle, cone, lane or ring) that fills up as the blow comes.
//   - Rooms of waves in an arena (arena.ts), gold and power-up drops, a shrine, the result.
import {
  CLASS, FOE, TUNING, DODGE, POTION_HEAL, POWER_IDS, POWER_TIME, foeHpAt, foeDmgAt,
  type ClassId, type FoeKind, type Mode, type PowerId, type Room, type Blow,
} from './defs';
import { buildArena, type ArenaLayout } from './arena';

export interface HeroStats {
  cls: ClassId;
  level: number;
  maxHp: number;
  atk: number;
  /** Fractions: damage taken off, crit chance, cooldowns off, life leech, gold found, move speed. */
  def: number;
  crit: number;
  cdr: number;
  leech: number;
  goldf: number;
  speed: number;
  /** Talent ranks of the two skills and of the potion talent. */
  skill1: number;
  skill2: number;
  potion: number;
}

export interface BattleSetup {
  mode: Mode;
  seed: number;
  stats: HeroStats;
  hp: number;
  potions: number;
  rooms: Room[];
  level: number;
  /** Training: foes come but never strike until released. */
  tutorial?: boolean;
}

export interface Input { mx: number; mz: number; attack: boolean; dodge: boolean; skill1: boolean; skill2: boolean; potion: boolean }
export const NO_INPUT: Input = { mx: 0, mz: 0, attack: false, dodge: false, skill1: false, skill2: false, potion: false };

export type Shape = 'circle' | 'cone' | 'line' | 'ring';

export interface Zone {
  id: number;
  owner: number;
  /** 'hero' zones hurt foes; 'foe' zones hurt the hero. */
  side: 'hero' | 'foe';
  shape: Shape;
  x: number; z: number;
  r: number;
  /** Cone arc; ring inner radius; lane width. */
  a: number;
  len: number;
  ang: number;
  delay: number;
  total: number;
  dmg: number;
  knock: number;
  stun: number;
  kind: string;
  /** Zones that go away when their foe is stopped (melee wind-ups). */
  tied: boolean;
  done: boolean;
}

export interface Shot {
  id: number;
  side: 'hero' | 'foe';
  kind: 'arrow' | 'bolt' | 'fireball' | 'orb' | 'farrow' | 'knife' | 'dark';
  x: number; z: number;
  vx: number; vz: number;
  dmg: number;
  r: number;
  life: number;
  pierce: boolean;
  homing: number;
  hit: number[];
  crit: boolean;
  knock: number;
}

export interface Drop { id: number; kind: 'gold' | 'potion' | 'power'; power: PowerId | null; amount: number; x: number; z: number; vx: number; vz: number; t: number; magnet: boolean }
export interface Trap { id: number; x: number; z: number; life: number; sprung: number }

type HeroState = 'idle' | 'run' | 'attack' | 'dodge' | 'skill' | 'hit' | 'dead';

export interface Hero {
  x: number; z: number; face: number;
  vx: number; vz: number;
  hp: number;
  state: HeroState;
  t: number;
  combo: number;
  blow: Blow | null;
  struck: boolean;
  buffered: boolean;
  comboT: number;
  dodgeCd: number;
  dodgeDir: number;
  invuln: number;
  skillCd: [number, number];
  skill: 0 | 1 | 2;
  skillTick: number;
  skillHits: number;
  potions: number;
  potionCd: number;
  powers: Record<PowerId, number>;
  shieldHits: number;
  regen: number;
  hidden: number;
  critNext: number;
  /** The clip to show and a counter that restarts it. */
  anim: string;
  animN: number;
  animSpeed: number;
  moving: number;
}

type FoeState = 'spawn' | 'idle' | 'chase' | 'wind' | 'act' | 'recover' | 'hit' | 'dead';

export interface Foe {
  id: number;
  kind: FoeKind;
  boss: boolean;
  x: number; z: number; face: number;
  hp: number; maxHp: number;
  dmg: number;
  speed: number;
  radius: number;
  state: FoeState;
  t: number;
  cd: number;
  kx: number; kz: number;
  stun: number;
  freeze: number;
  root: number;
  blind: number;
  burn: number;
  /** The attack in progress. */
  atk: string;
  aim: number;
  ax: number; az: number;
  step: number;
  /** Boss: pattern counter, phase (1–3), adds called. */
  pat: number;
  phase: number;
  called: number;
  guard: number;
  blocks: number;
  wander: number;
  anim: string;
  animN: number;
  animSpeed: number;
  deadT: number;
  xp: number;
  gold: number;
  /** Damage taken this fight (the healthbar's ghost reads hp). */
  healCd: number;
}

export type BattleEvent =
  | { type: 'swing'; blow: number; finisher: boolean; x: number; z: number; face: number }
  | { type: 'shot'; kind: Shot['kind']; side: 'hero' | 'foe'; x: number; z: number }
  | { type: 'hit'; id: number; x: number; z: number; dmg: number; crit: boolean; heavy: boolean; src: string }
  | { type: 'kill'; id: number; kind: FoeKind; x: number; z: number; boss: boolean }
  | { type: 'hurt'; dmg: number; x: number; z: number }
  | { type: 'shieldHit'; x: number; z: number }
  | { type: 'block'; x: number; z: number; broke: boolean }
  | { type: 'dodge'; x: number; z: number }
  | { type: 'skill'; id: string; x: number; z: number; face: number }
  | { type: 'boom'; kind: string; x: number; z: number; r: number }
  | { type: 'pickup'; kind: Drop['kind']; amount: number; power: PowerId | null; x: number; z: number }
  | { type: 'potion'; x: number; z: number }
  | { type: 'heal'; amount: number; x: number; z: number }
  | { type: 'spawn'; id: number; kind: FoeKind; x: number; z: number; boss: boolean }
  | { type: 'wave'; n: number; of: number }
  | { type: 'room'; n: number; of: number; arena: string }
  | { type: 'bossPhase'; kind: FoeKind; phase: number }
  | { type: 'tele'; id: number; kind: FoeKind; atk: string }
  | { type: 'cast'; id: number; kind: FoeKind; atk: string; x: number; z: number }
  | { type: 'shrine'; x: number; z: number; power: PowerId }
  | { type: 'trap'; x: number; z: number; sprung: boolean }
  | { type: 'freeze'; x: number; z: number }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'roomClear' };

/** A small seeded generator (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const angDiff = (a: number, b: number): number => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
/** Facing angle of a direction (0 = towards +z, the camera). */
export const faceOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

export class Battle {
  readonly mode: Mode;
  readonly tune;
  readonly st: HeroStats;
  readonly cls;
  readonly rooms: Room[];
  readonly level: number;
  rng: () => number;
  layout!: ArenaLayout;
  hero!: Hero;
  foes: Foe[] = [];
  shots: Shot[] = [];
  zones: Zone[] = [];
  drops: Drop[] = [];
  traps: Trap[] = [];
  shrine: { x: number; z: number; power: PowerId; t: number } | null = null;
  events: BattleEvent[] = [];
  phase: 'fight' | 'between' | 'roomClear' | 'victory' | 'defeat' = 'fight';
  phaseT = 0;
  room = 0;
  wave = 0;
  time = 0;
  gold = 0;
  xp = 0;
  kills = 0;
  bossesKilled: FoeKind[] = [];
  potionsUsed = 0;
  damageTaken = 0;
  over: 'won' | 'lost' | null = null;
  /** Training: foes do not strike until released. */
  passive = false;
  bossUp: Foe | null = null;
  /** The seed the current room's arena was built from (the view builds the same). */
  layoutSeed = 0;
  private nid = 1;
  private seed: number;

  constructor(readonly setup: BattleSetup) {
    this.mode = setup.mode;
    this.tune = TUNING[setup.mode];
    this.st = setup.stats;
    this.cls = CLASS[setup.stats.cls];
    this.rooms = setup.rooms;
    this.level = setup.level;
    this.seed = setup.seed;
    this.rng = makeRng(setup.seed);
    this.passive = !!setup.tutorial;
    const powers = Object.fromEntries(POWER_IDS.map((p) => [p, 0])) as Record<PowerId, number>;
    this.hero = {
      x: 0, z: 0, face: Math.PI, vx: 0, vz: 0, hp: Math.max(1, Math.min(setup.stats.maxHp, setup.hp)), state: 'idle', t: 0,
      combo: 0, blow: null, struck: false, buffered: false, comboT: 0, dodgeCd: 0, dodgeDir: 0, invuln: 0,
      skillCd: [0, 0], skill: 0, skillTick: 0, skillHits: 0, potions: setup.potions, potionCd: 0, powers, shieldHits: 0,
      regen: 0, hidden: 0, critNext: 0, anim: this.cls.idle, animN: 0, animSpeed: 1, moving: 0,
    };
    this.enterRoom(0);
  }

  get roomDef(): Room { return this.rooms[this.room]; }
  get bossFight(): boolean { return !!this.roomDef.boss; }

  private emit(e: BattleEvent): void { this.events.push(e); }

  private enterRoom(n: number): void {
    this.room = n;
    this.wave = 0;
    this.layoutSeed = this.seed + n * 101;
    this.layout = buildArena(this.roomDef.arena, this.layoutSeed);
    this.foes = [];
    this.shots = [];
    this.zones = [];
    this.traps = [];
    this.drops = [];
    this.bossUp = null;
    const h = this.hero;
    h.x = this.layout.hero.x; h.z = this.layout.hero.z; h.face = Math.PI; h.vx = h.vz = 0;
    this.setHeroState('idle');
    this.shrine = null;
    this.emit({ type: 'room', n, of: this.rooms.length, arena: this.roomDef.arena });
    this.spawnWave(true);
    if (this.roomDef.shrine) {
      const p = POWER_IDS[Math.floor(this.rng() * POWER_IDS.length)];
      this.shrine = { x: this.layout.shrine.x, z: this.layout.shrine.z, power: p, t: 0 };
      this.emit({ type: 'shrine', x: this.shrine.x, z: this.shrine.z, power: p });
    }
    this.phase = 'fight';
  }

  private spawnWave(first: boolean): void {
    const room = this.roomDef;
    const wave = room.waves[this.wave];
    const pts = [...this.layout.spawns];
    // shuffle the spawn points
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    let k = 0;
    if (wave) {
      for (const [kind, count] of wave) for (let i = 0; i < count; i++) { const p = pts[k++ % pts.length]; this.spawn(kind, p.x, p.z, k * 0.18); }
      this.emit({ type: 'wave', n: this.wave + 1, of: room.waves.length });
    }
    if (first && room.boss) {
      const b = this.spawn(room.boss, 0, -this.layout.hz + 3.5, 0.2);
      b.boss = true;
      this.bossUp = b;
    }
  }

  /** Brings a foe in (also for summons). */
  spawn(kind: FoeKind, x: number, z: number, delay = 0): Foe {
    const d = FOE[kind];
    const lvl = this.level;
    const major = kind === 'troll' || kind === 'mage' || kind === 'lord';
    const hp = foeHpAt(d.hp, lvl) * this.tune.foeHp * (major ? 1 : 1);
    const f: Foe = {
      id: this.nid++, kind, boss: false, x, z, face: 0, hp, maxHp: hp, dmg: foeDmgAt(d.dmg, lvl) * this.tune.foeDmg,
      speed: d.speed, radius: d.radius * (d.scale / 1), state: 'spawn', t: -delay, cd: 0.8 + this.rng() * 1.2,
      kx: 0, kz: 0, stun: 0, freeze: 0, root: 0, blind: 0, burn: 0, atk: '', aim: 0, ax: 0, az: 0, step: 0,
      pat: 0, phase: 1, called: 0, guard: 0, blocks: 0, wander: this.rng() * TAU, anim: 'Idle', animN: 0, animSpeed: 1, deadT: 0,
      xp: Math.round(d.xp * (1 + 0.25 * (lvl - 1)) * this.tune.xp),
      gold: Math.round(d.gold * (1 + 0.2 * (lvl - 1)) * this.tune.gold), healCd: 4,
    };
    f.radius = d.radius;
    f.face = faceOf(this.hero.x - x, this.hero.z - z);
    this.foes.push(f);
    this.emit({ type: 'spawn', id: f.id, kind, x, z, boss: !!FOE[kind] && ['chief', 'warden', 'captain', 'troll', 'mage', 'lord'].includes(kind) });
    return f;
  }

  // ------------------------------------------------------------------ the step

  step(dt: number, inp: Input): void {
    this.time += dt;
    this.phaseT += dt;
    if (this.over) { this.updateFoes(dt); return; }
    this.updateHero(dt, inp);
    this.updateFoes(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateTraps(dt);
    this.updateDrops(dt);
    this.updateShrine(dt);
    this.separate();
    this.flow(dt);
  }

  private flow(dt: number): void {
    void dt;
    const h = this.hero;
    if (h.state === 'dead') {
      if (this.phase !== 'defeat') { this.phase = 'defeat'; this.phaseT = 0; }
      if (this.phaseT > 1.8 && !this.over) { this.over = 'lost'; this.emit({ type: 'defeat' }); }
      return;
    }
    const alive = this.foes.filter((f) => f.state !== 'dead');
    if (this.phase === 'fight') {
      const room = this.roomDef;
      const adds = alive.filter((f) => !f.boss);
      if (!alive.length || (!adds.length && this.bossUp && this.bossUp.state !== 'dead' && this.wave < room.waves.length - 1 && this.phaseT > 6)) {
        if (this.wave < room.waves.length - 1) { this.phase = 'between'; this.phaseT = 0; return; }
        if (!alive.length) {
          for (const d of this.drops) d.magnet = true;
          this.phase = 'roomClear';
          this.phaseT = 0;
          this.emit({ type: 'roomClear' });
        }
      }
    } else if (this.phase === 'between') {
      if (this.phaseT > 1.3) { this.wave++; this.spawnWave(false); this.phase = 'fight'; this.phaseT = 0; }
    } else if (this.phase === 'roomClear') {
      if (this.phaseT > 2.1 && !this.drops.length) {
        if (this.room < this.rooms.length - 1) this.enterRoom(this.room + 1);
        else { this.phase = 'victory'; this.phaseT = 0; this.over = 'won'; this.emit({ type: 'victory' }); }
      }
    }
  }

  // ------------------------------------------------------------------ the hero

  private setHeroState(s: HeroState, anim?: string, speed = 1, restart = true): void {
    const h = this.hero;
    h.state = s;
    h.t = 0;
    if (anim && (restart || h.anim !== anim)) { h.anim = anim; h.animN++; h.animSpeed = speed; }
  }

  private heroAnim(name: string, speed = 1): void {
    const h = this.hero;
    if (h.anim !== name) { h.anim = name; h.animN++; }
    h.animSpeed = speed;
  }

  /** Damage multiplier of the hero right now. */
  private heroMult(): number { return this.hero.powers.rage > 0 ? 1.5 : 1; }

  private hasteK(): number { return this.hero.powers.haste > 0 ? 1.3 : 1; }

  private updateHero(dt: number, inp: Input): void {
    const h = this.hero;
    h.t += dt;
    h.dodgeCd = Math.max(0, h.dodgeCd - dt);
    h.invuln = Math.max(0, h.invuln - dt);
    h.potionCd = Math.max(0, h.potionCd - dt);
    h.hidden = Math.max(0, h.hidden - dt);
    h.skillCd[0] = Math.max(0, h.skillCd[0] - dt);
    h.skillCd[1] = Math.max(0, h.skillCd[1] - dt);
    for (const p of POWER_IDS) if (h.powers[p] > 0) { h.powers[p] = Math.max(0, h.powers[p] - dt); if (p === 'shield' && h.powers[p] <= 0) h.shieldHits = 0; }
    if (h.state === 'dead') { h.vx = h.vz = 0; return; }
    // regeneration (power-up, the cleric's light)
    const regen = (h.powers.regen > 0 ? 0.03 : 0) + (h.regen > 0 ? 0.03 : 0);
    h.regen = Math.max(0, h.regen - dt);
    if (regen > 0) h.hp = Math.min(this.st.maxHp, h.hp + this.st.maxHp * regen * dt);

    if (inp.potion) this.drinkPotion();
    const mlen = Math.hypot(inp.mx, inp.mz);
    const mx = mlen > 1 ? inp.mx / mlen : inp.mx, mz = mlen > 1 ? inp.mz / mlen : inp.mz;
    const speed = this.cls.speed * (1 + this.st.speed) * this.hasteK();

    // inputs that may start a new action
    const canAct = h.state === 'idle' || h.state === 'run' || (h.state === 'attack' && h.blow !== null && h.t >= h.blow.hit);
    if (inp.dodge && h.dodgeCd <= 0 && (canAct || h.state === 'attack' || (h.state === 'skill' && h.t > 0.25) || h.state === 'hit')) { this.startDodge(mx, mz); }
    else if ((inp.skill1 || inp.skill2) && (canAct || h.state === 'hit')) {
      const k = inp.skill1 ? 0 : 1;
      if (h.skillCd[k] <= 0) this.startSkill((k + 1) as 1 | 2, mx, mz);
    }
    if (inp.attack) {
      if (h.state === 'attack') h.buffered = true;
      else if (h.state === 'idle' || h.state === 'run') this.startBlow(0, mx, mz);
    }

    switch (h.state) {
      case 'idle':
      case 'run': {
        if (mlen > 0.15) {
          h.vx = mx * speed; h.vz = mz * speed;
          h.face = faceOf(mx, mz);
          if (h.state !== 'run') this.setHeroState('run');
          this.heroAnim(mlen > 0.6 ? 'Run' : 'Walk', mlen > 0.6 ? 1.05 * this.hasteK() * (1 + this.st.speed) : 1.3);
          h.moving = mlen;
        } else {
          h.vx = h.vz = 0;
          if (h.state !== 'idle') this.setHeroState('idle');
          this.heroAnim(this.cls.idle);
          h.moving = 0;
        }
        h.comboT += dt;
        if (h.comboT > 0.6) h.combo = 0;
        break;
      }
      case 'attack': {
        const b = h.blow!;
        const k = this.hasteK();
        // a slow step while swinging, the lunge at the start
        const lunge = h.t < 0.12 ? b.lunge * 7 : 0;
        h.vx = Math.sin(h.face) * lunge + mx * speed * 0.22;
        h.vz = Math.cos(h.face) * lunge + mz * speed * 0.22;
        if (!h.struck && h.t >= b.hit / k) { h.struck = true; this.strike(b); }
        if (h.t >= b.dur / k) {
          const next = h.combo + 1;
          if (h.buffered && next < this.cls.combo.length) this.startBlow(next, mx, mz);
          else if (h.buffered) this.startBlow(0, mx, mz);
          else { h.combo = next >= this.cls.combo.length ? 0 : next; h.comboT = 0; this.setHeroState('idle'); h.blow = null; }
        }
        break;
      }
      case 'dodge': {
        const k = 1 - h.t / DODGE.time;
        const v = (DODGE.dist / DODGE.time) * (0.55 + k * 0.9);
        h.vx = Math.sin(h.dodgeDir) * v; h.vz = Math.cos(h.dodgeDir) * v;
        if (h.t >= DODGE.time) { this.setHeroState('idle'); h.vx = h.vz = 0; }
        break;
      }
      case 'skill': this.updateSkill(dt, mx, mz, speed); break;
      case 'hit': {
        h.vx *= 0.8; h.vz *= 0.8;
        if (h.t > 0.28) this.setHeroState('idle');
        break;
      }
    }
    // move with collisions
    this.moveCircle(h, h.vx * dt, h.vz * dt, 0.42);
  }

  private moveCircle(o: { x: number; z: number }, dx: number, dz: number, r: number): void {
    let x = o.x + dx, z = o.z + dz;
    const L = this.layout;
    x = Math.max(-L.hx + r, Math.min(L.hx - r, x));
    z = Math.max(-L.hz + r, Math.min(L.hz - r, z));
    for (const c of L.colliders) {
      const ddx = x - c.x, ddz = z - c.z, d = Math.hypot(ddx, ddz), min = c.r + r;
      if (d < min && d > 1e-4) { x = c.x + (ddx / d) * min; z = c.z + (ddz / d) * min; }
    }
    o.x = x; o.z = z;
  }

  /** The foe the hero should turn to: in reach, ahead of where they look or steer. */
  private aimTarget(range: number, mx: number, mz: number): Foe | null {
    const h = this.hero;
    const dir = Math.hypot(mx, mz) > 0.3 ? faceOf(mx, mz) : h.face;
    let best: Foe | null = null, bs = Infinity;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const d = Math.hypot(f.x - h.x, f.z - h.z) - f.radius;
      if (d > range) continue;
      const a = Math.abs(angDiff(faceOf(f.x - h.x, f.z - h.z), dir));
      const s = d + a * 2.2;
      if (s < bs) { bs = s; best = f; }
    }
    return best;
  }

  private startBlow(i: number, mx: number, mz: number): void {
    const h = this.hero;
    const b = this.cls.combo[i];
    h.combo = i;
    h.blow = b;
    h.struck = false;
    h.buffered = false;
    const t = this.aimTarget(this.cls.ranged ? b.range : 3.4, mx, mz);
    if (t) h.face = faceOf(t.x - h.x, t.z - h.z);
    else if (Math.hypot(mx, mz) > 0.3) h.face = faceOf(mx, mz);
    this.setHeroState('attack', b.anim, b.speed * this.hasteK());
    this.emit({ type: 'swing', blow: i, finisher: i === this.cls.combo.length - 1, x: h.x, z: h.z, face: h.face });
  }

  private rollDamage(mult: number): { dmg: number; crit: boolean } {
    const h = this.hero;
    let crit = this.rng() < this.st.crit;
    if (h.critNext > 0) { crit = true; h.critNext--; }
    const v = 0.9 + this.rng() * 0.2;
    return { dmg: this.st.atk * mult * this.heroMult() * v * (crit ? 1.8 : 1), crit };
  }

  /** The blow lands: a cone for melee, arrows and bolts for the ranged classes. */
  private strike(b: Blow): void {
    const h = this.hero;
    if (b.shots) {
      const n = b.shots;
      for (let i = 0; i < n; i++) {
        const a = h.face + (n > 1 ? (i - (n - 1) / 2) * 0.2 : 0);
        const { dmg, crit } = this.rollDamage(b.dmg);
        this.fire('hero', this.cls.shot ?? 'arrow', h.x + Math.sin(a) * 0.5, h.z + Math.cos(a) * 0.5, a, this.cls.shot === 'bolt' ? 15 : 19, dmg, b.range, { pierce: !!b.pierce, crit, knock: b.knock });
      }
      return;
    }
    this.coneHit(h.x, h.z, h.face, b.range, b.arc, b.dmg, b.knock, 'melee', b.knock >= 1.5 ? 0.35 : 0);
    if (b.burst) {
      this.emit({ type: 'boom', kind: 'holy', x: h.x + Math.sin(h.face) * 1.4, z: h.z + Math.cos(h.face) * 1.4, r: b.burst });
      this.circleHit(h.x + Math.sin(h.face) * 1.4, h.z + Math.cos(h.face) * 1.4, b.burst, b.dmg * 0.5, 1.2, 'holy', 0);
    }
  }

  /** Hits every foe in a cone (melee): returns how many. */
  private coneHit(x: number, z: number, face: number, range: number, arc: number, mult: number, knock: number, src: string, stun: number): number {
    let n = 0;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const dx = f.x - x, dz = f.z - z, d = Math.hypot(dx, dz);
      if (d > range + f.radius) continue;
      if (d > f.radius + 0.3 && Math.abs(angDiff(faceOf(dx, dz), face)) > arc / 2) continue;
      const { dmg, crit } = this.rollDamage(mult);
      this.damageFoe(f, dmg, crit, faceOf(dx, dz), knock, src, stun);
      n++;
    }
    return n;
  }

  private circleHit(x: number, z: number, r: number, mult: number, knock: number, src: string, stun: number, extra?: (f: Foe) => void): number {
    let n = 0;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const dx = f.x - x, dz = f.z - z;
      if (Math.hypot(dx, dz) > r + f.radius) continue;
      if (mult > 0) {
        const { dmg, crit } = this.rollDamage(mult);
        this.damageFoe(f, dmg, crit, faceOf(dx, dz), knock, src, stun);
      } else if (knock) { f.kx += Math.sin(faceOf(dx, dz)) * knock * 3; f.kz += Math.cos(faceOf(dx, dz)) * knock * 3; }
      extra?.(f);
      n++;
    }
    return n;
  }

  /** A blow of the hero's lands on a foe. */
  damageFoe(f: Foe, dmg: number, crit: boolean, dir: number, knock: number, src: string, stun = 0): void {
    if (f.state === 'dead') return;
    // a knight's shield and a lord's guard turn frontal blows
    const front = Math.abs(angDiff(dir + Math.PI, f.face)) < 1.05;
    if ((FOE[f.kind].ai === 'shield' || f.guard > 0) && front && f.stun <= 0 && f.freeze <= 0 && src !== 'burn' && src !== 'trap') {
      dmg *= f.guard > 0 ? 0.15 : 0.4;
      knock *= 0.3;
      // a guard breaks after a few blocked blows: stunned, open
      f.blocks++;
      const broke = f.blocks >= (f.guard > 0 ? 6 : 4);
      if (broke) { f.blocks = 0; f.guard = 0; f.stun = Math.max(f.stun, f.boss ? 1.2 : 1.6); this.cancelZones(f.id); }
      this.emit({ type: 'block', x: f.x, z: f.z, broke });
    }
    f.hp -= dmg;
    const heavy = knock >= 1.5 || crit;
    if (this.st.leech > 0 && src !== 'burn') this.hero.hp = Math.min(this.st.maxHp, this.hero.hp + dmg * this.st.leech);
    const big = f.boss || FOE[f.kind].ai === 'boss';
    const kres = big ? 0.15 : FOE[f.kind].ai === 'slam' ? 0.4 : 1;
    f.kx += Math.sin(dir) * knock * 3 * kres;
    f.kz += Math.cos(dir) * knock * 3 * kres;
    if (stun > 0) f.stun = Math.max(f.stun, big ? stun * 0.35 : stun);
    this.emit({ type: 'hit', id: f.id, x: f.x, z: f.z, dmg: Math.round(dmg), crit, heavy, src });
    if (f.hp <= 0) { this.killFoe(f); return; }
    // a flinch: breaks wind-ups of the small ones on a heavy blow
    const st = FOE[f.kind].stagger;
    if (st > 0 && f.state !== 'act' && (f.state !== 'wind' || (heavy && this.rng() < 0.5)) && this.rng() < st * (heavy ? 1 : 0.55)) {
      this.cancelZones(f.id);
      f.state = 'hit'; f.t = 0; f.anim = 'Hit'; f.animN++; f.animSpeed = 1.6;
    }
  }

  private killFoe(f: Foe): void {
    f.hp = 0;
    f.state = 'dead';
    f.t = 0;
    f.anim = 'Death'; f.animN++; f.animSpeed = 1.2;
    this.cancelZones(f.id);
    this.kills++;
    this.xp += f.xp;
    const isBoss = f.boss;
    if (isBoss) this.bossesKilled.push(f.kind);
    this.emit({ type: 'kill', id: f.id, kind: f.kind, x: f.x, z: f.z, boss: isBoss });
    // gold, now and then a potion or a power-up
    const coins = Math.min(isBoss ? 12 : 4, 1 + Math.floor(f.gold / 6));
    for (let i = 0; i < coins; i++) this.dropAt('gold', f.x, f.z, Math.max(1, Math.round(f.gold / coins)), null);
    const r = this.rng();
    if (r < (isBoss ? 1 : 0.07)) this.dropAt('power', f.x, f.z, 1, POWER_IDS[Math.floor(this.rng() * POWER_IDS.length)]);
    else if (r < 0.1) this.dropAt('potion', f.x, f.z, 1, null);
    if (isBoss) { for (const o of this.foes) if (o !== f && o.state !== 'dead') this.killFoe(o); this.zones = this.zones.filter((z) => z.side === 'hero'); this.shots = this.shots.filter((s) => s.side === 'hero'); }
  }

  private dropAt(kind: Drop['kind'], x: number, z: number, amount: number, power: PowerId | null): void {
    const a = this.rng() * TAU, v = 1.5 + this.rng() * 2.5;
    this.drops.push({ id: this.nid++, kind, power, amount, x, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, t: 0, magnet: false });
  }

  private startDodge(mx: number, mz: number): void {
    const h = this.hero;
    const dir = Math.hypot(mx, mz) > 0.2 ? faceOf(mx, mz) : h.face;
    h.dodgeDir = dir;
    h.face = dir;
    h.blow = null;
    h.buffered = false;
    h.combo = 0;
    h.dodgeCd = DODGE.cd + DODGE.time;
    h.invuln = Math.max(h.invuln, DODGE.iframes);
    this.setHeroState('dodge', this.cls.dodgeAnim, this.cls.dodgeAnim === 'Roll' ? 2.4 : 2.2);
    this.emit({ type: 'dodge', x: h.x, z: h.z });
  }

  drinkPotion(): boolean {
    const h = this.hero;
    if (h.potions <= 0 || h.potionCd > 0 || h.state === 'dead' || h.hp >= this.st.maxHp) return false;
    h.potions--;
    h.potionCd = 1;
    this.potionsUsed++;
    const amount = this.st.maxHp * (POTION_HEAL + 0.1 * this.st.potion);
    h.hp = Math.min(this.st.maxHp, h.hp + amount);
    this.emit({ type: 'potion', x: h.x, z: h.z });
    this.emit({ type: 'heal', amount: Math.round(amount), x: h.x, z: h.z });
    return true;
  }

  // ------------------------------------------------------------------ the skills

  private skillDef(n: 1 | 2) { return this.cls.skills[n - 1]; }
  private rank(n: 1 | 2): number { return n === 1 ? this.st.skill1 : this.st.skill2; }
  private boost(n: 1 | 2): number { return 1 + 0.25 * this.rank(n); }

  private startSkill(n: 1 | 2, mx: number, mz: number): void {
    const h = this.hero;
    const sd = this.skillDef(n);
    h.skillCd[n - 1] = sd.cd * (1 - this.st.cdr);
    h.skill = n;
    h.skillTick = 0;
    h.skillHits = 0;
    h.blow = null;
    h.buffered = false;
    const t = this.aimTarget(sd.id === 'fireball' || sd.id === 'volley' || sd.id === 'smite' ? 11 : 5, mx, mz);
    if (t) h.face = faceOf(t.x - h.x, t.z - h.z);
    else if (Math.hypot(mx, mz) > 0.3) h.face = faceOf(mx, mz);
    this.setHeroState('skill', sd.anim, sd.speed);
    this.emit({ type: 'skill', id: sd.id, x: h.x, z: h.z, face: h.face });
    switch (sd.id) {
      case 'dash': h.invuln = Math.max(h.invuln, 0.4); break;
      case 'smoke': {
        h.hidden = 3 + this.rank(n);
        h.critNext = 3;
        this.circleHit(h.x, h.z, 3.6, 0, 1, 'smoke', 0, (f) => { f.blind = 3 + this.rank(n); this.cancelZones(f.id); if (f.state === 'wind') { f.state = 'idle'; f.t = 0; } });
        this.emit({ type: 'boom', kind: 'smoke', x: h.x, z: h.z, r: 3.6 });
        break;
      }
      case 'heal': {
        const amount = this.st.maxHp * (0.26 + 0.06 * this.rank(n));
        h.hp = Math.min(this.st.maxHp, h.hp + amount);
        h.regen = 4;
        this.emit({ type: 'heal', amount: Math.round(amount), x: h.x, z: h.z });
        this.circleHit(h.x, h.z, 2.8, 0, 1.6, 'holy', 0);
        this.emit({ type: 'boom', kind: 'heal', x: h.x, z: h.z, r: 2.8 });
        break;
      }
      case 'trap': {
        const tx = h.x + Math.sin(h.face) * 2.2, tz = h.z + Math.cos(h.face) * 2.2;
        const p = { x: tx, z: tz };
        this.moveCircle(p, 0, 0, 0.5);
        this.traps.push({ id: this.nid++, x: p.x, z: p.z, life: 16, sprung: 0 });
        if (this.traps.length > 2) this.traps.shift();
        this.emit({ type: 'trap', x: p.x, z: p.z, sprung: false });
        break;
      }
      case 'smite': {
        const tg = this.aimTarget(11, mx, mz);
        const x = tg ? tg.x : h.x + Math.sin(h.face) * 4, z = tg ? tg.z : h.z + Math.cos(h.face) * 4;
        this.heroZone('circle', x, z, 2.5, 0, 0, 0.42, 2.6 * this.boost(n), 1.2, 0.9, 'smite');
        break;
      }
      case 'nova': {
        this.emit({ type: 'boom', kind: 'nova', x: h.x, z: h.z, r: 4.4 });
        this.circleHit(h.x, h.z, 4.4, 1.4 * this.boost(n), 1.2, 'nova', 0, (f) => { if (f.state !== 'dead') { f.freeze = (2.4 + 0.5 * this.rank(n)) * (f.boss ? 0.35 : 1); this.cancelZones(f.id); if (f.state === 'wind') { f.state = 'idle'; f.t = 0; } } });
        this.emit({ type: 'freeze', x: h.x, z: h.z });
        break;
      }
    }
  }

  private updateSkill(dt: number, mx: number, mz: number, speed: number): void {
    const h = this.hero;
    const sd = this.skillDef(h.skill as 1 | 2);
    const n = h.skill as 1 | 2;
    const t = h.t;
    let dur = 0.5;
    h.vx = h.vz = 0;
    switch (sd.id) {
      case 'bash': {
        dur = 0.5;
        if (t < 0.22) { h.vx = Math.sin(h.face) * 10; h.vz = Math.cos(h.face) * 10; }
        if (h.skillHits === 0 && t >= 0.2) { h.skillHits = 1; this.coneHit(h.x, h.z, h.face, 2.5, 1.8, 1.7 * this.boost(n), 3.2, 'bash', 1.3 + 0.3 * this.rank(n)); this.emit({ type: 'boom', kind: 'bash', x: h.x + Math.sin(h.face), z: h.z + Math.cos(h.face), r: 1.6 }); }
        break;
      }
      case 'whirl': {
        dur = 1.6 + 0.3 * this.rank(n);
        h.vx = mx * speed * 0.7; h.vz = mz * speed * 0.7;
        h.skillTick -= dt;
        if (h.skillTick <= 0) { h.skillTick = 0.22; this.circleHit(h.x, h.z, 2.5, 0.55 * this.boost(n), 0.8, 'whirl', 0); this.emit({ type: 'boom', kind: 'whirl', x: h.x, z: h.z, r: 2.5 }); }
        if (h.anim !== 'Sword_Attack2' || h.t % 0.35 < dt) { h.animN++; h.anim = 'Sword_Attack2'; h.animSpeed = 2.4; }
        break;
      }
      case 'dash': {
        dur = 0.42;
        const dist = 5.5 + this.rank(n);
        if (t < 0.24) {
          const v = dist / 0.24;
          const ox = h.x, oz = h.z;
          h.vx = Math.sin(h.face) * v; h.vz = Math.cos(h.face) * v;
          // everyone along the way
          for (const f of this.foes) {
            if (f.state === 'dead' || f.state === 'spawn' || (f as Foe & { dashHit?: number }).dashHit === h.animN) continue;
            const d = segDist(f.x, f.z, ox, oz, ox + h.vx * dt * 1.5, oz + h.vz * dt * 1.5);
            if (d < f.radius + 0.8) {
              (f as Foe & { dashHit?: number }).dashHit = h.animN;
              const r = this.rollDamage(2.0 * this.boost(n));
              this.damageFoe(f, r.dmg, r.crit, h.face, 1, 'dash', 0.4);
            }
          }
        } else if (h.skillHits === 0) { h.skillHits = 1; h.anim = 'Dagger_Attack'; h.animN++; h.animSpeed = 2.4; }
        break;
      }
      case 'smoke': dur = 0.45; break;
      case 'volley': {
        dur = 0.6;
        if (h.skillHits === 0 && t >= 0.2) {
          h.skillHits = 1;
          const k = 7 + 2 * this.rank(n);
          for (let i = 0; i < k; i++) {
            const a = h.face + (i - (k - 1) / 2) * (1.25 / (k - 1));
            const r = this.rollDamage(0.95);
            this.fire('hero', 'arrow', h.x + Math.sin(a) * 0.5, h.z + Math.cos(a) * 0.5, a, 18, r.dmg, 12, { pierce: true, crit: r.crit, knock: 0.6 });
          }
        }
        break;
      }
      case 'trap': dur = 0.42; break;
      case 'flurry': {
        dur = 0.95;
        const hits = 6 + 2 * this.rank(n);
        h.vx = Math.sin(h.face) * 1.6 + mx * speed * 0.2; h.vz = Math.cos(h.face) * 1.6 + mz * speed * 0.2;
        const due = Math.floor((t / dur) * hits);
        while (h.skillHits < Math.min(hits, due + 1) && t > 0.05) {
          h.skillHits++;
          this.coneHit(h.x, h.z, h.face, 2.1, 2.0, 0.5, 0.25, 'flurry', 0);
          h.anim = h.skillHits % 2 ? 'Attack' : 'Attack2'; h.animN++; h.animSpeed = 3;
          this.emit({ type: 'swing', blow: h.skillHits % 3, finisher: false, x: h.x, z: h.z, face: h.face });
        }
        break;
      }
      case 'palm': {
        dur = 0.65;
        if (h.skillHits === 0 && t >= 0.24) {
          h.skillHits = 1;
          this.coneHit(h.x, h.z, h.face, 5.2, 1.5, 2.2 * this.boost(n), 6, 'palm', 0.7);
          this.emit({ type: 'boom', kind: 'palm', x: h.x + Math.sin(h.face) * 2.6, z: h.z + Math.cos(h.face) * 2.6, r: 2.6 });
        }
        break;
      }
      case 'heal': dur = 0.7; break;
      case 'smite': dur = 0.55; break;
      case 'fireball': {
        dur = 0.55;
        if (h.skillHits === 0 && t >= 0.22) {
          h.skillHits = 1;
          this.fire('hero', 'fireball', h.x + Math.sin(h.face) * 0.6, h.z + Math.cos(h.face) * 0.6, h.face, 13, 2.4 * this.boost(n), 10, { pierce: false, crit: false, knock: 2 });
        }
        break;
      }
      case 'nova': dur = 0.6; break;
    }
    if (t >= dur) { this.setHeroState('idle'); h.skill = 0; }
  }

  /** A delayed area of the hero's (smite, the fireball's blast). */
  private heroZone(shape: Shape, x: number, z: number, r: number, a: number, ang: number, delay: number, mult: number, knock: number, stun: number, kind: string): void {
    this.zones.push({ id: this.nid++, owner: 0, side: 'hero', shape, x, z, r, a, len: 0, ang, delay, total: delay, dmg: mult, knock, stun, kind, tied: false, done: false });
  }

  // ------------------------------------------------------------------ shots

  private fire(side: 'hero' | 'foe', kind: Shot['kind'], x: number, z: number, ang: number, speed: number, dmg: number, range: number, o: { pierce?: boolean; crit?: boolean; knock?: number; homing?: number } = {}): void {
    this.shots.push({
      id: this.nid++, side, kind, x, z, vx: Math.sin(ang) * speed, vz: Math.cos(ang) * speed, dmg, r: kind === 'orb' || kind === 'fireball' || kind === 'dark' ? 0.45 : 0.3,
      life: range / speed, pierce: !!o.pierce, homing: o.homing ?? 0, hit: [], crit: !!o.crit, knock: o.knock ?? 0.5,
    });
    this.emit({ type: 'shot', kind, side, x, z });
  }

  private updateShots(dt: number): void {
    const h = this.hero;
    const L = this.layout;
    for (const s of this.shots) {
      s.life -= dt;
      if (s.homing && s.side === 'foe' && h.state !== 'dead') {
        const want = faceOf(h.x - s.x, h.z - s.z), cur = faceOf(s.vx, s.vz), sp = Math.hypot(s.vx, s.vz);
        const na = cur + Math.max(-s.homing * dt, Math.min(s.homing * dt, angDiff(want, cur)));
        s.vx = Math.sin(na) * sp; s.vz = Math.cos(na) * sp;
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      const out = Math.abs(s.x) > L.hx + 1 || Math.abs(s.z) > L.hz + 1 || L.colliders.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < c.r * 0.8);
      if (out) s.life = Math.min(s.life, 0);
      if (s.side === 'hero') {
        for (const f of this.foes) {
          if (s.life <= 0 && !out) break;
          if (f.state === 'dead' || f.state === 'spawn' || s.hit.includes(f.id)) continue;
          if (Math.hypot(f.x - s.x, f.z - s.z) > f.radius + s.r) continue;
          s.hit.push(f.id);
          if (s.kind === 'fireball') { s.life = 0; break; }
          this.damageFoe(f, s.dmg, s.crit, faceOf(s.vx, s.vz), s.knock, s.kind, 0);
          if (!s.pierce) { s.life = 0; break; }
        }
        if (s.kind === 'fireball' && s.life <= 0) {
          const r = 2.7;
          this.emit({ type: 'boom', kind: 'fire', x: s.x, z: s.z, r });
          this.circleHit(s.x, s.z, r, s.dmg, 2, 'fireball', 0, (f) => { f.burn = 3; });
        }
      } else if (h.state !== 'dead' && Math.hypot(h.x - s.x, h.z - s.z) < 0.42 + s.r) {
        if (h.invuln <= 0) { this.hurtHero(s.dmg, faceOf(s.vx, s.vz), 0.6); s.life = 0; }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  // ------------------------------------------------------------------ zones

  private foeZone(f: Foe, shape: Shape, x: number, z: number, r: number, a: number, len: number, ang: number, windup: number, dmgK: number, kind: string, o: { tied?: boolean; knock?: number } = {}): Zone {
    const delay = windup * this.tune.windup * (f.phase >= 3 ? 0.85 : 1);
    const zn: Zone = { id: this.nid++, owner: f.id, side: 'foe', shape, x, z, r, a, len, ang, delay, total: delay, dmg: f.dmg * dmgK, knock: o.knock ?? 1, stun: 0, kind, tied: o.tied ?? true, done: false };
    this.zones.push(zn);
    return zn;
  }

  private cancelZones(owner: number): void {
    this.zones = this.zones.filter((z) => !(z.owner === owner && z.tied && z.side === 'foe'));
  }

  private inZone(z: Zone, x: number, zz: number, pad: number): boolean {
    const dx = x - z.x, dz = zz - z.z, d = Math.hypot(dx, dz);
    switch (z.shape) {
      case 'circle': return d < z.r + pad;
      case 'ring': return d < z.r + pad && d > z.a - pad;
      case 'cone': return d < z.r + pad && (d < 0.6 || Math.abs(angDiff(faceOf(dx, dz), z.ang)) < z.a / 2 + pad / Math.max(1, d));
      case 'line': {
        const ux = Math.sin(z.ang), uz = Math.cos(z.ang);
        const along = dx * ux + dz * uz, side = Math.abs(dx * uz - dz * ux);
        return along > -pad && along < z.len + pad && side < z.a / 2 + pad;
      }
    }
  }

  private updateZones(dt: number): void {
    const h = this.hero;
    for (const z of this.zones) {
      z.delay -= dt;
      if (z.delay > 0 || z.done) continue;
      z.done = true;
      if (z.side === 'hero') {
        this.emit({ type: 'boom', kind: z.kind, x: z.x, z: z.z, r: z.r });
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn') continue;
          if (!this.inZone(z, f.x, f.z, f.radius)) continue;
          const r = this.rollDamage(z.dmg);
          this.damageFoe(f, r.dmg, r.crit, faceOf(f.x - z.x, f.z - z.z), z.knock, z.kind, z.stun);
        }
        continue;
      }
      if (z.kind !== 'charge' && z.kind !== 'aim') this.emit({ type: 'boom', kind: z.kind, x: z.shape === 'line' ? z.x + Math.sin(z.ang) * z.len * 0.5 : z.x, z: z.shape === 'line' ? z.z + Math.cos(z.ang) * z.len * 0.5 : z.z, r: z.shape === 'ring' ? z.r : z.r });
      if (z.dmg > 0 && h.state !== 'dead' && h.invuln <= 0 && this.inZone(z, h.x, h.z, 0.3)) this.hurtHero(z.dmg, faceOf(h.x - z.x, h.z - z.z), z.knock);
    }
    this.zones = this.zones.filter((z) => !z.done || z.delay > -0.25);
  }

  /** The hero is hit. */
  hurtHero(dmg: number, dir: number, knock: number): void {
    const h = this.hero;
    if (h.state === 'dead' || h.invuln > 0) return;
    if (h.shieldHits > 0) {
      h.shieldHits--;
      if (h.shieldHits <= 0) h.powers.shield = 0;
      h.invuln = 0.4;
      this.emit({ type: 'shieldHit', x: h.x, z: h.z });
      return;
    }
    let d = dmg * (1 - this.st.def);
    if (h.state === 'skill' && this.skillDef(h.skill as 1 | 2)?.id === 'whirl') d *= 0.6;
    d = Math.max(1, Math.round(d));
    h.hp -= d;
    this.damageTaken += d;
    h.invuln = 0.45;
    this.emit({ type: 'hurt', dmg: d, x: h.x, z: h.z });
    if (h.hp <= 0) {
      h.hp = 0;
      this.setHeroState('dead', 'Death', 1);
      return;
    }
    h.vx = Math.sin(dir) * knock * 5; h.vz = Math.cos(dir) * knock * 5;
    if (h.state !== 'skill' && h.state !== 'dodge' && d >= this.st.maxHp * 0.06) { h.blow = null; h.buffered = false; this.setHeroState('hit', 'Hit', 1.7); }
  }

  // ------------------------------------------------------------------ traps, drops, the shrine

  private updateTraps(dt: number): void {
    for (const t of this.traps) {
      t.life -= dt;
      if (t.sprung) continue;
      const f = this.foes.find((o) => o.state !== 'dead' && o.state !== 'spawn' && Math.hypot(o.x - t.x, o.z - t.z) < 1.1 + o.radius);
      if (!f) continue;
      t.sprung = 1;
      t.life = Math.min(t.life, 0.6);
      const n = this.rank(2);
      this.emit({ type: 'trap', x: t.x, z: t.z, sprung: true });
      this.circleHit(t.x, t.z, 2.2, 2.2 * (1 + 0.25 * n), 0, 'trap', 0, (o) => { o.root = (3 + 0.5 * n) * (o.boss ? 0.4 : 1); });
    }
    this.traps = this.traps.filter((t) => t.life > 0);
  }

  private updateDrops(dt: number): void {
    const h = this.hero;
    for (const d of this.drops) {
      d.t += dt;
      const dx = h.x - d.x, dz = h.z - d.z, dist = Math.hypot(dx, dz);
      if (d.t > 0.45 && (d.magnet || dist < 2.6) && h.state !== 'dead') {
        const v = 9 + d.t * 4;
        d.vx = (dx / Math.max(0.01, dist)) * v; d.vz = (dz / Math.max(0.01, dist)) * v;
      } else { d.vx *= Math.exp(-4 * dt); d.vz *= Math.exp(-4 * dt); }
      d.x += d.vx * dt; d.z += d.vz * dt;
      const near = dist < 0.6 + Math.hypot(d.vx, d.vz) * dt || (this.phase === 'roomClear' && this.phaseT > 5);
      if (near && d.t > 0.3 && h.state !== 'dead') {
        d.t = -99;
        if (d.kind === 'gold') {
          const g = Math.round(d.amount * (1 + this.st.goldf) * (h.powers.gold > 0 ? 2 : 1));
          this.gold += g;
          this.emit({ type: 'pickup', kind: 'gold', amount: g, power: null, x: d.x, z: d.z });
        } else if (d.kind === 'potion') {
          h.potions++;
          this.emit({ type: 'pickup', kind: 'potion', amount: 1, power: null, x: d.x, z: d.z });
        } else if (d.power) {
          this.givePower(d.power);
          this.emit({ type: 'pickup', kind: 'power', amount: 1, power: d.power, x: d.x, z: d.z });
        }
      }
    }
    this.drops = this.drops.filter((d) => d.t >= 0);
  }

  givePower(p: PowerId): void {
    const h = this.hero;
    h.powers[p] = POWER_TIME[p];
    if (p === 'shield') h.shieldHits = 3;
  }

  private updateShrine(dt: number): void {
    const s = this.shrine;
    if (!s) return;
    s.t += dt;
    const h = this.hero;
    if (h.state !== 'dead' && Math.hypot(h.x - s.x, h.z - s.z) < 1.2) {
      this.givePower(s.power);
      this.emit({ type: 'pickup', kind: 'power', amount: 1, power: s.power, x: s.x, z: s.z });
      this.shrine = null;
    }
  }

  private separate(): void {
    const fs = this.foes;
    const h = this.hero;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (a.state === 'dead') continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (b.state === 'dead') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2, ux = dx / d, uz = dz / d;
          const wa = a.boss ? 0.15 : 1, wb = b.boss ? 0.15 : 1;
          a.x -= ux * push * wa; a.z -= uz * push * wa; b.x += ux * push * wb; b.z += uz * push * wb;
        }
      }
      if (h.state !== 'dead' && h.state !== 'dodge') {
        const dx = h.x - a.x, dz = h.z - a.z, d = Math.hypot(dx, dz), min = a.radius + 0.4;
        if (d < min && d > 1e-4) {
          const push = min - d;
          const wh = a.boss ? 0.9 : 0.5;
          h.x += (dx / d) * push * wh; h.z += (dz / d) * push * wh;
          a.x -= (dx / d) * push * (1 - wh); a.z -= (dz / d) * push * (1 - wh);
        }
      }
    }
    this.moveCircle(h, 0, 0, 0.42);
  }

  // ------------------------------------------------------------------ the foes

  /** How many foes may be winding up or striking at once (the rest circle and wait). */
  private attackers(): number {
    let n = 0;
    for (const f of this.foes) if ((f.state === 'wind' || f.state === 'act') && !f.boss && FOE[f.kind].ai !== 'archer' && FOE[f.kind].ai !== 'caster' && FOE[f.kind].ai !== 'fire') n++;
    return n;
  }

  private foeAnim(f: Foe, name: string, speed = 1, restart = false): void {
    if (f.anim !== name || restart) { f.anim = name; f.animN++; }
    f.animSpeed = speed;
  }

  private updateFoes(dt: number): void {
    const h = this.hero;
    for (const f of this.foes) {
      if (f.state === 'dead') { f.deadT += dt; continue; }
      f.t += dt;
      // pushes fade; burning hurts
      const kd = Math.exp(-7 * dt);
      if (Math.abs(f.kx) + Math.abs(f.kz) > 0.01) { this.moveCircle(f, f.kx * dt, f.kz * dt, f.radius); f.kx *= kd; f.kz *= kd; }
      if (f.burn > 0) {
        f.burn -= dt;
        f.hp -= this.st.atk * 0.3 * dt;
        if (f.hp <= 0) { this.killFoe(f); continue; }
      }
      if (f.state === 'spawn') { if (f.t >= 0.7) { f.state = 'idle'; f.t = 0; } else continue; }
      f.stun = Math.max(0, f.stun - dt);
      f.freeze = Math.max(0, f.freeze - dt);
      f.root = Math.max(0, f.root - dt);
      f.blind = Math.max(0, f.blind - dt);
      f.cd -= dt;
      f.guard = Math.max(0, f.guard - dt);
      if (f.stun > 0 || f.freeze > 0) {
        if (f.state === 'wind' || f.state === 'act') { this.cancelZones(f.id); f.state = 'idle'; f.t = 0; }
        this.foeAnim(f, 'Hit', f.freeze > 0 ? 0.05 : 0.8);
        continue;
      }
      if (f.state === 'hit') { if (f.t > 0.32) { f.state = 'idle'; f.t = 0; } continue; }
      if (h.state === 'dead') { this.foeAnim(f, 'Idle'); continue; }
      if (FOE[f.kind].ai === 'boss') this.bossThink(f, dt);
      else this.think(f, dt);
    }
    this.foes = this.foes.filter((f) => f.state !== 'dead' || f.deadT < 2.5);
  }

  private walk(f: Foe, tx: number, tz: number, dt: number, k = 1): void {
    if (f.root > 0) { this.foeAnim(f, 'Idle'); return; }
    const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const sp = f.speed * k * (f.phase >= 3 ? 1.2 : 1);
    const step = Math.min(d, sp * dt);
    f.face = turn(f.face, faceOf(dx, dz), dt * 9);
    this.moveCircle(f, (dx / d) * step, (dz / d) * step, f.radius);
    this.foeAnim(f, k > 0.7 ? 'Run' : 'Walk', k > 0.7 ? 1.0 * sp / 4 + 0.3 : 1.1);
  }

  private think(f: Foe, dt: number): void {
    const h = this.hero;
    const d = FOE[f.kind];
    const dx = h.x - f.x, dz = h.z - f.z, dist = Math.hypot(dx, dz);
    const toHero = faceOf(dx, dz);
    // blinded or the hero hidden: wander
    if (f.blind > 0 || (h.hidden > 0 && dist > 2.2)) {
      if (f.state === 'wind' || f.state === 'act') { this.cancelZones(f.id); f.state = 'idle'; }
      f.wander += (this.rng() - 0.5) * dt * 3;
      this.walk(f, f.x + Math.sin(f.wander) * 2, f.z + Math.cos(f.wander) * 2, dt, 0.4);
      return;
    }
    switch (f.state) {
      case 'idle':
      case 'chase': {
        f.state = 'chase';
        const ranged = d.ai === 'archer' || d.ai === 'caster' || d.ai === 'fire';
        if (ranged) {
          // keep a distance, sidestep, shoot when ready
          const want = d.ai === 'caster' ? 7 : 6.5;
          if (d.ai === 'caster') {
            f.healCd -= dt;
            const hurt = this.foes.find((o) => o !== f && !o.boss && o.state !== 'dead' && o.hp < o.maxHp * 0.6 && Math.hypot(o.x - f.x, o.z - f.z) < 9);
            if (hurt && f.healCd <= 0 && !this.passive) {
              f.healCd = 9;
              hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * 0.15);
              this.emit({ type: 'heal', amount: Math.round(hurt.maxHp * 0.15), x: hurt.x, z: hurt.z });
              this.emit({ type: 'cast', id: f.id, kind: f.kind, atk: 'heal', x: hurt.x, z: hurt.z });
              this.foeAnim(f, 'Spell1', 1.4, true);
              f.state = 'recover'; f.t = 0;
              break;
            }
          }
          if (dist < want - 1.5) this.walk(f, f.x - dx, f.z - dz, dt, 0.7);
          else if (dist > want + 2.5) this.walk(f, h.x, h.z, dt, 0.8);
          else { f.wander += dt * 0.8; this.walk(f, f.x + Math.cos(toHero) * Math.sin(f.wander) * 2, f.z - Math.sin(toHero) * Math.sin(f.wander) * 2, dt, 0.35); f.face = turn(f.face, toHero, dt * 8); }
          if (f.cd <= 0 && dist < d.reach + 2 && !this.passive && this.shooters() < 2) this.beginAttack(f, toHero, dist);
        } else {
          const reach = d.ai === 'lunge' ? d.reach : d.reach * 0.8;
          if (dist > reach) this.walk(f, h.x, h.z, dt, 1);
          else {
            f.face = turn(f.face, toHero, dt * 10);
            this.foeAnim(f, 'Idle');
            if (f.cd <= 0 && !this.passive && this.attackers() < (this.mode === 'easy' ? 1 : 2)) this.beginAttack(f, toHero, dist);
            else if (f.cd > 0.6) { f.wander += dt; this.walk(f, h.x + Math.sin(f.wander + f.id) * reach * 1.3, h.z + Math.cos(f.wander + f.id) * reach * 1.3, dt, 0.4); }
          }
        }
        break;
      }
      case 'wind': this.windTick(f, dt); break;
      case 'act': this.actTick(f, dt); break;
      case 'recover': {
        if (f.t > (d.ai === 'slam' ? 0.7 : 0.4)) { f.state = 'chase'; f.t = 0; f.cd = d.rate * (0.8 + this.rng() * 0.5); }
        break;
      }
    }
  }

  private shooters(): number {
    let n = 0;
    for (const f of this.foes) if (f.state === 'wind' && (FOE[f.kind].ai === 'archer' || FOE[f.kind].ai === 'caster' || FOE[f.kind].ai === 'fire')) n++;
    return n;
  }

  private beginAttack(f: Foe, toHero: number, dist: number): void {
    const d = FOE[f.kind];
    const h = this.hero;
    f.state = 'wind';
    f.t = 0;
    f.face = toHero;
    f.aim = toHero;
    f.step = 0;
    const w = d.windup;
    switch (d.ai) {
      case 'melee':
        f.atk = 'cut';
        this.foeZone(f, 'cone', f.x, f.z, d.reach + 0.3, 1.9, 0, toHero, w, 1, 'cut');
        break;
      case 'shield':
        f.atk = 'combo';
        this.foeZone(f, 'cone', f.x, f.z, d.reach + 0.3, 1.8, 0, toHero, w, 1, 'cut');
        break;
      case 'lunge':
        f.atk = 'lunge';
        this.foeZone(f, 'line', f.x, f.z, 0, 1.2, Math.min(d.reach + 0.6, dist + 1.4), toHero, w, 0, 'charge');
        f.ax = Math.min(d.reach + 0.6, dist + 1.4);
        break;
      case 'slam': {
        f.atk = 'slam';
        const cx = f.x + Math.sin(toHero) * 1.3, cz = f.z + Math.cos(toHero) * 1.3;
        this.foeZone(f, 'circle', cx, cz, d.reach, 0, 0, 0, w, 1, 'slam', { knock: 1.6 });
        break;
      }
      case 'archer':
        f.atk = 'shoot';
        this.foeZone(f, 'line', f.x, f.z, 0, 0.5, 11, toHero, w, 0, 'aim');
        break;
      case 'caster':
        f.atk = 'orb';
        break;
      case 'fire':
        f.atk = 'fire';
        f.ax = h.x; f.az = h.z;
        this.foeZone(f, 'circle', h.x, h.z, 1.8, 0, 0, 0, w + 0.3, 1, 'fire', { tied: false });
        break;
    }
    this.foeAnim(f, d.ai === 'slam' ? 'Attack2' : d.ai === 'lunge' ? 'Idle' : d.attack, d.ai === 'archer' ? 0.5 : d.ai === 'slam' ? 0.55 : 0.35, true);
    if (d.ai === 'archer') this.foeAnim(f, 'Bow_Draw', 1.1, true);
    this.emit({ type: 'tele', id: f.id, kind: f.kind, atk: f.atk });
  }

  private windTick(f: Foe, dt: number): void {
    void dt;
    const d = FOE[f.kind];
    const w = d.windup * this.tune.windup;
    if (f.t < w) {
      if (d.ai === 'caster' && f.t > w * 0.4 && f.step === 0) { f.step = 1; this.foeAnim(f, 'Spell1', 1.3, true); }
      return;
    }
    f.state = 'act';
    f.t = 0;
    switch (d.ai) {
      case 'melee': case 'shield': case 'slam':
        this.foeAnim(f, d.attack === 'Attack2' ? 'Attack2' : d.attack, 1.6, true);
        if (d.ai === 'slam') this.emit({ type: 'boom', kind: 'slamLand', x: f.x + Math.sin(f.aim) * 1.3, z: f.z + Math.cos(f.aim) * 1.3, r: d.reach });
        break;
      case 'lunge':
        this.foeAnim(f, 'Run', 2.2, true);
        f.step = 0;
        break;
      case 'archer':
        this.foeAnim(f, 'Bow_Shoot', 1.6, true);
        this.fire('foe', 'farrow', f.x + Math.sin(f.aim) * 0.6, f.z + Math.cos(f.aim) * 0.6, f.aim, 16, f.dmg, 12);
        break;
      case 'caster':
        this.fire('foe', 'orb', f.x + Math.sin(f.aim) * 0.6, f.z + Math.cos(f.aim) * 0.6, faceOf(this.hero.x - f.x, this.hero.z - f.z), 5.5, f.dmg, 14, { homing: 1.3 });
        break;
      case 'fire':
        this.foeAnim(f, 'Spell2', 1.4, true);
        this.emit({ type: 'cast', id: f.id, kind: f.kind, atk: 'fire', x: f.ax, z: f.az });
        break;
    }
  }

  private actTick(f: Foe, dt: number): void {
    const d = FOE[f.kind];
    const h = this.hero;
    if (d.ai === 'lunge') {
      const dur = f.ax / 13;
      if (f.t < dur) {
        this.moveCircle(f, Math.sin(f.aim) * 13 * dt, Math.cos(f.aim) * 13 * dt, f.radius);
        if (f.step === 0 && Math.hypot(h.x - f.x, h.z - f.z) < f.radius + 0.5) { f.step = 1; this.hurtHero(f.dmg, f.aim, 1.2); }
        return;
      }
      this.foeAnim(f, 'Punch', 1.4, true);
      f.state = 'recover'; f.t = 0;
      return;
    }
    if (d.ai === 'shield' && f.step === 0 && f.t > 0.35) {
      // the knight's second cut, quicker
      f.step = 1;
      f.t = 0;
      f.state = 'wind';
      const to = faceOf(h.x - f.x, h.z - f.z);
      f.aim = to; f.face = to;
      this.foeZone(f, 'cone', f.x, f.z, d.reach + 0.4, 2.2, 0, to, d.windup * 0.75, 1.2, 'cut');
      this.foeAnim(f, 'Sword_Attack2', 0.6, true);
      return;
    }
    if (f.t > 0.3) { f.state = 'recover'; f.t = 0; }
  }

  // ------------------------------------------------------------------ bosses

  /** Calls in help at a health threshold. */
  private summon(f: Foe, kinds: FoeKind[]): void {
    const L = this.layout;
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * TAU + this.rng();
      const x = Math.max(-L.hx + 1, Math.min(L.hx - 1, f.x + Math.sin(a) * 3.5));
      const z = Math.max(-L.hz + 1, Math.min(L.hz - 1, f.z + Math.cos(a) * 3.5));
      this.spawn(k, x, z, 0.2 + i * 0.15);
    });
  }

  private bossThink(f: Foe, dt: number): void {
    const h = this.hero;
    const d = FOE[f.kind];
    const dx = h.x - f.x, dz = h.z - f.z, dist = Math.hypot(dx, dz);
    const toHero = faceOf(dx, dz);
    const k = f.hp / f.maxHp;
    const nextPhase = k < 0.35 ? 3 : k < 0.66 ? 2 : 1;
    if (nextPhase > f.phase) {
      f.phase = nextPhase;
      this.emit({ type: 'bossPhase', kind: f.kind, phase: f.phase });
      const adds: Partial<Record<FoeKind, FoeKind[]>> = {
        chief: ['bandit', 'bandit'], warden: ['skeleton', 'skeleton'], captain: ['bandit', 'archer'],
        troll: ['skeleton', 'ghoul', 'skeleton'], mage: ['cultist', 'acolyte'], lord: ['knight', 'knight'],
      };
      if (adds[f.kind] && !this.passive) this.summon(f, adds[f.kind]!);
    }
    if (f.state === 'wind' || f.state === 'act') { this.bossAct(f, dt, toHero, dist); return; }
    if (f.state === 'recover') { this.foeAnim(f, 'Idle_Attacking'); if (f.t > 0.5) { f.state = 'chase'; f.t = 0; } return; }
    f.state = 'chase';
    const melee = d.reach < 5;
    if (melee ? dist > d.reach * 0.9 : dist > 9 || dist < 4) {
      if (melee || dist > 9) this.walk(f, h.x, h.z, dt, 1);
      else this.walk(f, f.x - dx, f.z - dz, dt, 0.8);
    } else { f.face = turn(f.face, toHero, dt * 8); this.foeAnim(f, 'Idle_Attacking'); }
    if (f.cd <= 0 && !this.passive) this.bossChoose(f, toHero, dist);
  }

  /** Picks the boss's next move by its kind, distance and phase. */
  private bossChoose(f: Foe, toHero: number, dist: number): void {
    const r = this.rng();
    const p = f.phase;
    let atk = '';
    switch (f.kind) {
      case 'chief': atk = dist > 5 ? (r < 0.6 ? 'dash' : 'knives') : r < 0.55 ? 'stabs' : r < 0.8 ? 'knives' : 'dash'; break;
      case 'warden': atk = dist < 3.5 ? (r < 0.5 ? 'sweep' : 'spin') : r < 0.5 ? 'leap' : 'sweep'; break;
      case 'captain': atk = dist < 3 ? 'kick' : r < 0.45 ? 'volley' : r < 0.8 ? 'snipe' : 'barrels'; break;
      case 'troll': atk = dist < 4 ? (r < 0.5 ? 'slam' : 'quake') : r < 0.45 ? 'charge' : r < 0.8 ? 'rocks' : 'quake'; if (p >= 2 && r > 0.85) atk = 'quake'; break;
      case 'mage':
        atk = r < 0.3 ? 'fire5' : r < 0.5 ? 'bolts' : r < 0.68 ? 'nova' : r < 0.8 ? 'blink' : 'fire5';
        if (p >= 2 && r > 0.72) atk = 'meteors';
        if (dist < 3 && r < 0.6) atk = 'nova';
        break;
      case 'lord':
        atk = dist > 6 ? (r < 0.6 ? 'leap' : 'whirl') : r < 0.35 ? 'sweep' : r < 0.6 ? 'combo' : r < 0.8 ? 'whirl' : 'leap';
        if (p >= 2 && r > 0.9) atk = 'guard';
        break;
    }
    this.bossStart(f, atk, toHero);
  }

  private bossStart(f: Foe, atk: string, toHero: number): void {
    const h = this.hero;
    const d = FOE[f.kind];
    f.state = 'wind';
    f.t = 0;
    f.atk = atk;
    f.aim = toHero;
    f.face = toHero;
    f.step = 0;
    const w = d.windup;
    const fx = f.x, fz = f.z;
    const ahead = (dist: number) => [fx + Math.sin(toHero) * dist, fz + Math.cos(toHero) * dist];
    let anim = d.attack, speed = 0.5;
    switch (atk) {
      case 'stabs': this.foeZone(f, 'cone', fx, fz, 2.6, 1.9, 0, toHero, w, 1, 'cut'); break;
      case 'dash': f.ax = Math.min(9, Math.hypot(h.x - fx, h.z - fz) + 2); this.foeZone(f, 'line', fx, fz, 0, 1.4, f.ax, toHero, w, 0, 'charge'); anim = 'Idle_Attacking'; break;
      case 'knives': this.foeZone(f, 'cone', fx, fz, 7, 1.3, 0, toHero, w * 0.9, 0, 'aim'); anim = 'Punch'; break;
      case 'sweep': this.foeZone(f, 'cone', fx, fz, d.reach + 0.6, f.kind === 'lord' ? 2.9 : 3.4, 0, toHero, w, 1.1, 'cut', { knock: 1.4 }); break;
      case 'spin': this.foeZone(f, 'circle', fx, fz, 3.2, 0, 0, 0, w * 1.1, 1.1, 'slam', { knock: 1.6 }); anim = 'Sword'; break;
      case 'leap': { f.ax = h.x; f.az = h.z; this.foeZone(f, 'circle', h.x, h.z, f.kind === 'lord' ? 3 : 2.6, 0, 0, 0, w * 1.3, 1.3, 'slam', { knock: 1.8, tied: false }); anim = f.kind === 'lord' ? 'Sword_Attack2' : 'Jump'; break; }
      case 'kick': { const [x, z] = ahead(1.2); this.foeZone(f, 'circle', x, z, 2.2, 0, 0, 0, w * 0.8, 1, 'slam', { knock: 2.2 }); anim = 'Punch'; break; }
      case 'volley': this.foeZone(f, 'cone', fx, fz, 9, 1.4, 0, toHero, w, 0, 'aim'); anim = 'Bow_Draw'; break;
      case 'snipe': this.foeZone(f, 'line', fx, fz, 0, 0.7, 13, toHero, w * 0.9, 0, 'aim'); anim = 'Bow_Draw'; break;
      case 'barrels': {
        for (let i = 0; i < 3; i++) {
          const x = h.x + (this.rng() - 0.5) * 4, z = h.z + (this.rng() - 0.5) * 4;
          this.foeZone(f, 'circle', x, z, 1.7, 0, 0, 0, w + 0.5 + i * 0.25, 1, 'blast', { tied: false });
        }
        anim = 'Punch';
        break;
      }
      case 'slam': { const [x, z] = ahead(2); this.foeZone(f, 'circle', x, z, 3.0, 0, 0, 0, w, 1.2, 'slam', { knock: 1.8 }); anim = 'Attack2'; break; }
      case 'quake': {
        for (let i = 0; i < 3; i++) this.foeZone(f, 'ring', fx, fz, 3 + i * 2.6, 1 + i * 2.6, 0, 0, w + i * 0.45, 0.9, 'quake', { knock: 1.2 });
        anim = 'Attack';
        break;
      }
      case 'charge': f.ax = Math.min(12, Math.hypot(h.x - fx, h.z - fz) + 3); this.foeZone(f, 'line', fx, fz, 0, 2.2, f.ax, toHero, w * 1.1, 0, 'charge'); anim = 'Idle_Attacking'; break;
      case 'rocks': {
        const n = f.phase >= 2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? h.x : h.x + (this.rng() - 0.5) * 7, z = i === 0 ? h.z : h.z + (this.rng() - 0.5) * 7;
          this.foeZone(f, 'circle', x, z, 1.8, 0, 0, 0, w + 0.3 + i * 0.2, 1, 'rock', { tied: false });
        }
        anim = 'PickUp';
        break;
      }
      case 'fire5': {
        const n = f.phase >= 2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const x = i === 0 ? h.x : h.x + Math.sin(a) * 3, z = i === 0 ? h.z : h.z + Math.cos(a) * 3;
          this.foeZone(f, 'circle', x, z, 1.7, 0, 0, 0, w + i * 0.12, 1, 'fire', { tied: false });
        }
        anim = 'Spell1';
        break;
      }
      case 'bolts': this.foeZone(f, 'cone', fx, fz, 9, 1.6, 0, toHero, w * 0.8, 0, 'aim'); anim = 'Spell2'; break;
      case 'nova': this.foeZone(f, 'ring', fx, fz, 7.5, 2.6, 0, 0, w * 1.2, 1.2, 'frost', { knock: 1.2 }); anim = 'Spell2'; break;
      case 'meteors': {
        const L = this.layout;
        for (let i = 0; i < 9; i++) {
          const x = i < 2 ? h.x + (i ? 2 : 0) : (this.rng() * 2 - 1) * (L.hx - 1), z = i < 2 ? h.z : (this.rng() * 2 - 1) * (L.hz - 1);
          this.foeZone(f, 'circle', x, z, 1.9, 0, 0, 0, w + 0.4 + i * 0.18, 1.1, 'meteor', { tied: false });
        }
        anim = 'Spell1';
        break;
      }
      case 'blink': anim = 'Spell2'; speed = 1.5; break;
      case 'combo': this.foeZone(f, 'cone', fx, fz, d.reach + 0.3, 2.2, 0, toHero, w * 0.8, 0.9, 'cut'); break;
      case 'whirl': anim = 'Sword_Attack2'; break;
      case 'guard': f.guard = 3; anim = 'Idle_Attacking'; speed = 1; break;
    }
    this.foeAnim(f, anim, speed, true);
    this.emit({ type: 'tele', id: f.id, kind: f.kind, atk });
  }

  private bossAct(f: Foe, dt: number, toHero: number, dist: number): void {
    const h = this.hero;
    const d = FOE[f.kind];
    const w = d.windup * this.tune.windup * (f.phase >= 3 ? 0.85 : 1);
    const done = (rec = 0.6) => { f.state = 'recover'; f.t = 0; f.cd = d.rate * (f.phase >= 3 ? 0.65 : 1) * (0.8 + this.rng() * 0.4) + rec * 0; };
    switch (f.atk) {
      case 'stabs': case 'sweep': case 'slam': case 'spin': case 'kick':
        if (f.state === 'wind' && f.t >= w * (f.atk === 'kick' ? 0.8 : f.atk === 'spin' ? 1.1 : 1)) { f.state = 'act'; f.t = 0; this.foeAnim(f, f.atk === 'slam' ? 'Attack2' : f.atk === 'kick' ? 'Punch' : d.attack, 1.6, true); if (f.atk === 'spin') f.face += Math.PI; }
        if (f.state === 'act' && f.t > 0.45) done();
        break;
      case 'combo': {
        if (f.state === 'wind' && f.t >= w * 0.8) {
          f.step++;
          if (f.step < 3) {
            f.t = 0;
            this.moveCircle(f, Math.sin(f.aim) * 0.9, Math.cos(f.aim) * 0.9, f.radius);
            f.aim = toHero; f.face = toHero;
            this.foeZone(f, 'cone', f.x, f.z, d.reach + 0.3, 2.2, 0, toHero, d.windup * 0.75, 0.9, 'cut');
            this.foeAnim(f, f.step % 2 ? 'Sword_Attack2' : 'Sword_Attack', 1.3, true);
          } else { f.state = 'act'; f.t = 0; }
        }
        if (f.state === 'act' && f.t > 0.4) done();
        break;
      }
      case 'dash': case 'charge': {
        const sp = f.atk === 'charge' ? 15 : 17;
        if (f.state === 'wind') { if (f.t >= w * (f.atk === 'charge' ? 1.1 : 1)) { f.state = 'act'; f.t = 0; this.foeAnim(f, 'Run', 2.6, true); } break; }
        if (f.t < f.ax / sp) {
          this.moveCircle(f, Math.sin(f.aim) * sp * dt, Math.cos(f.aim) * sp * dt, f.radius);
          if (f.step === 0 && Math.hypot(h.x - f.x, h.z - f.z) < f.radius + 0.6) { f.step = 1; this.hurtHero(f.dmg * 1.1, f.aim, 2); }
        } else {
          if (f.atk === 'charge' && f.step < 2) { f.step = 2; this.foeZone(f, 'circle', f.x, f.z, 2.6, 0, 0, 0, 0.35, 0.9, 'slam', { knock: 1.6 }); this.foeAnim(f, 'Attack2', 1.6, true); }
          if (f.t > f.ax / sp + 0.45) done();
        }
        break;
      }
      case 'knives': case 'volley': case 'bolts': {
        if (f.state === 'wind' && f.t >= w * 0.9) {
          f.state = 'act'; f.t = 0;
          const n = f.atk === 'knives' ? 5 : f.atk === 'volley' ? 7 : 7 + (f.phase - 1) * 2;
          const spread = f.atk === 'knives' ? 1.0 : 1.2;
          for (let i = 0; i < n; i++) {
            const a = f.aim + (i - (n - 1) / 2) * (spread / (n - 1));
            this.fire('foe', f.atk === 'knives' ? 'knife' : f.atk === 'volley' ? 'farrow' : 'dark', f.x + Math.sin(a) * 0.8, f.z + Math.cos(a) * 0.8, a, f.atk === 'bolts' ? 9 : 14, f.dmg * 0.75, 13);
          }
          this.foeAnim(f, f.atk === 'volley' ? 'Bow_Shoot' : f.atk === 'bolts' ? 'Spell2' : 'Punch', 1.5, true);
        }
        if (f.state === 'act' && f.t > 0.5) done();
        break;
      }
      case 'snipe': {
        if (f.state === 'wind' && f.t >= w * 0.9) {
          f.state = 'act'; f.t = 0;
          this.fire('foe', 'farrow', f.x + Math.sin(f.aim) * 0.8, f.z + Math.cos(f.aim) * 0.8, f.aim, 22, f.dmg * 1.2, 14);
          this.foeAnim(f, 'Bow_Shoot', 1.6, true);
          f.step++;
        }
        if (f.state === 'act' && f.t > 0.4) {
          if (f.step < 3) { f.state = 'wind'; f.t = w * 0.3; f.aim = toHero; f.face = toHero; this.foeZone(f, 'line', f.x, f.z, 0, 0.7, 13, toHero, w * 0.6, 0, 'aim'); this.foeAnim(f, 'Bow_Draw', 1.4, true); }
          else done();
        }
        break;
      }
      case 'leap': {
        if (f.state === 'wind') {
          const jump = w * 1.3;
          // airborne for the last part of the wind-up, landing on the circle
          if (f.t > jump * 0.45) {
            const k = Math.min(1, (f.t - jump * 0.45) / (jump * 0.55));
            const sx = f.step === 0 ? (f.step = 1, f.x) : f.x;
            void sx;
            f.x += (f.ax - f.x) * Math.min(1, k * 0.4 + dt * 6);
            f.z += (f.az - f.z) * Math.min(1, k * 0.4 + dt * 6);
          }
          if (f.t >= jump) { f.state = 'act'; f.t = 0; f.x = f.ax; f.z = f.az; this.foeAnim(f, 'Attack2', 1.4, true); this.foeAnim(f, d.attack, 1.4, true); }
        }
        if (f.state === 'act' && f.t > 0.55) done();
        break;
      }
      case 'barrels': case 'rocks': case 'fire5': case 'meteors': case 'quake': case 'nova':
        if (f.state === 'wind' && f.t >= w * 0.8) { f.state = 'act'; f.t = 0; }
        if (f.state === 'act' && f.t > (f.atk === 'meteors' ? 1.6 : 0.8)) done();
        break;
      case 'blink': {
        if (f.t > 0.5 && f.step === 0) {
          f.step = 1;
          const L = this.layout;
          this.emit({ type: 'boom', kind: 'blink', x: f.x, z: f.z, r: 1.5 });
          let bx = 0, bz = 0;
          for (let i = 0; i < 8; i++) {
            bx = (this.rng() * 2 - 1) * (L.hx - 2); bz = (this.rng() * 2 - 1) * (L.hz - 3);
            if (Math.hypot(bx - h.x, bz - h.z) > 6) break;
          }
          f.x = bx; f.z = bz;
          this.emit({ type: 'boom', kind: 'blink', x: f.x, z: f.z, r: 1.5 });
        }
        if (f.t > 0.8) done();
        break;
      }
      case 'whirl': {
        const dur = 2.4;
        if (f.state === 'wind') {
          if (f.t >= w * 0.8) { f.state = 'act'; f.t = 0; f.ax = 0; }
          break;
        }
        f.ax -= dt;
        this.walk(f, h.x, h.z, dt, 0.55);
        this.foeAnim(f, 'Sword_Attack2', 2.4);
        f.face += dt * 14;
        if (f.ax <= 0 && f.t < dur) { f.ax = 0.42; this.foeZone(f, 'circle', f.x, f.z, 2.6, 0, 0, 0, 0.32, 0.45, 'whirl', { knock: 1 }); }
        if (f.t > dur) done();
        break;
      }
      case 'guard': {
        this.foeAnim(f, 'Idle_Attacking');
        f.face = turn(f.face, toHero, dt * 6);
        if (f.t > 3) done();
        break;
      }
      default: done();
    }
    void dist;
  }

  // ------------------------------------------------------------------ test and tutorial hooks

  /** A warning circle under the hero (the dodge lesson). */
  lessonSlam(): void {
    const h = this.hero;
    const f = this.foes.find((o) => o.state !== 'dead') ?? null;
    this.zones.push({ id: this.nid++, owner: f?.id ?? 0, side: 'foe', shape: 'circle', x: h.x, z: h.z, r: 2.2, a: 0, len: 0, ang: 0, delay: 1.6, total: 1.6, dmg: (f?.dmg ?? 8) * 0.8, knock: 1, stun: 0, kind: 'slam', tied: false, done: false });
  }
}

function turn(cur: number, want: number, k: number): number {
  return cur + Math.max(-k, Math.min(k, angDiff(want, cur)));
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l)) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
