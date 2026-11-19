// Neon Ronin: the simulation of one level, pure and deterministic (no Phaser, no three.js), stepped
// at 60 Hz by the Play scene, the menu backdrop and the headless balance check.
//   - The hero: run, jump (coyote time, jump buffering, variable height), double jump, wall slide and
//     wall jump (unlocked), the roll (i-frames) and the air-dash (Boots II).
//   - Combat (the sim owns the combo, new-game skill §7g): in combat ATTACK chains punch, kick and
//     the slash finisher (A, Neon Cut); tap, tap, hold charges the overdrive cleave (B, unlocked
//     after the first boss: breaks armour, a shockwave lane); ATTACK right after a roll is the lunge
//     (C, a dash through foes that launches the light ones), and holding ATTACK on through the lunge
//     draws the iaido flash (a long dash, the cuts land a beat later). Sprinting + ATTACK is the
//     cyclone (a full turn that hits all round, twice); up + ATTACK the rising dragon (a launcher:
//     light foes fly up, the hero hops after them); in the air three blows make the sky rend string
//     (the third spikes a juggled foe into the ground), down + ATTACK the falcon dive (or, unlocked,
//     the ground slam straight down); tap, tap, SHOOT the blade & bolt finisher. A sword blow that
//     meets a bolt early in its swing reflects it (Mirror Cut, Katana I). Air blows keep gravity and
//     momentum: only the first hit of a jump hangs the hero for a moment. Out of combat ATTACK is one
//     clean swing. The blaster heats up; overheat locks it.
//   - Foes with telegraphs: walkers charge, gunners and turrets aim a laser first, drones dive,
//     gun drones keep their distance, brutes wear armour that breaks into a stun, cannons mark the
//     ground, teleporters warp foes in; the district boss is a mech with three phases.
//   - Hazards (live cables, steam, lasers, falling ledges), levers with doors and bridges,
//     lootboxes, explosive tanks, pickups, checkpoints, pits, the exit.
// Everything that happens is pushed to `events` for the view and the scene.
import {
  TUNING, MOVE, ATTACKS, CHARGE_TIME, LUNGE_WINDOW, LUNGE_DIST, COMBAT_RANGE, COMBAT_MEMORY, GUN, FOE, BOSS_HP,
  AIR_HANG, AIR_HANG_GRAVITY, AIR_ATTACK_CONTROL, AIR_MAX, RISE_HOP, RISE_WINDOW, JUGGLE_GRAVITY, DIVE_V, SPIN_RUN,
  IAIDO_HOLD, IAIDO_DIST, IAIDO_DELAY, MIRROR_WINDOW, MIRROR_DMG,
  SCORE, COMBO_TIME, comboMult, HAZARD, FALL_SHAKE, FALL_RESPAWN, DISTRICT_SCALE,
  type Mode, type FoeKind, type AttackDef,
} from './defs';
import { LEVELS, ROWS, type LevelDef } from './levels';
import { noRanks, type CardId, type Ranks, type AbilityId, type MoveId } from './powers';

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

export interface Input {
  mx: number;
  down: boolean;
  jump: boolean;
  jumpHeld: boolean;
  /** Up held (W/↑ or the stick pushed up): up + ATTACK is the launcher. */
  up: boolean;
  attack: boolean;
  attackHeld: boolean;
  shoot: boolean;
  shootHeld: boolean;
  roll: boolean;
}
export const NO_INPUT: Input = { mx: 0, down: false, up: false, jump: false, jumpHeld: false, attack: false, attackHeld: false, shoot: false, shootHeld: false, roll: false };

/** What carries over from level to level in a district run. */
export interface RunState {
  mode: Mode;
  lives: number;
  cards: CardId[];
  ranks: Ranks;
  abilities: AbilityId[];
  /** The run's score so far (levels already cleared). */
  score: number;
  /** Max-HP hearts picked up this run. */
  hearts: number;
  /** Implant picks earned and not taken yet (offered on the results screen or from the pause). */
  picks: number;
}
export const newRun = (mode: Mode, ranks: Ranks = noRanks(), abilities: AbilityId[] = []): RunState =>
  ({ mode, lives: TUNING[mode].lives, cards: [], ranks, abilities, score: 0, hearts: 0, picks: 0 });

export type HeroState = 'idle' | 'run' | 'air' | 'wall' | 'roll' | 'dash' | 'attack' | 'charge' | 'slam' | 'hurt' | 'dead' | 'win';
export type AtkKind = keyof typeof ATTACKS;

export interface Hero {
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  face: 1 | -1;
  state: HeroState;
  t: number;
  ground: boolean;
  coyote: number;
  buffer: number;
  airJumps: number;
  wall: 0 | 1 | -1;
  hp: number;
  maxHp: number;
  iframes: number;
  shield: boolean;
  rollCd: number;
  rollEnd: number;
  dashes: number;
  atk: { kind: AtkKind; step: number; t: number; hit: Set<number>; def: AttackDef; dx: number; second?: boolean; landed?: number } | null;
  /** Blows dealt in this jump (the air string), the hang of its first hit, the time of the last ground jump. */
  airAtk: number;
  hangT: number;
  hangUsed: boolean;
  jumpAt: number;
  /** Seconds of sprinting (the cyclone needs a run-up). */
  runT: number;
  /** What the held charge becomes: the cleave or the iaido. */
  chargeKind: 'cleave' | 'iaido';
  /** A press buffered during a blow, with the stick's direction at the press. */
  bufDown: boolean;
  bufUp: boolean;
  chain: number;
  chainT: number;
  atkBuf: number;
  held: number;
  charge: number;
  heat: number;
  hot: boolean;
  coolant: number;
  sinceShot: number;
  fireCd: number;
  shootT: number;
  shots: number;
  deadT: number;
  lastSafe: { x: number; y: number };
  dropT: number;
  secondHeart: boolean;
}

export type FoeState = 'idle' | 'patrol' | 'tell' | 'act' | 'recover' | 'stun' | 'dead' | 'spawn' | 'vent' | 'jump';

export interface Foe {
  id: number;
  kind: FoeKind;
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  hp: number; maxHp: number;
  armour: number; maxArmour: number;
  face: 1 | -1;
  state: FoeState;
  t: number;
  /** What the telegraph or action is (the view shows it). */
  move: string;
  homeX: number; homeY: number;
  flash: number;
  flinch: number;
  ground: boolean;
  aim: { x: number; y: number } | null;
  shots: number;
  spawned: boolean;
  dead: number;
  /** Teleporter: the foes it warped in that live. */
  kids: number;
  bob: number;
  /** Thrown into the air (a launcher, a juggle): no AI, light gravity, until this runs out. */
  juggle: number;
}

export type ShotKind = 'bolt' | 'heavy' | 'foeBolt' | 'shell' | 'wave' | 'crescent' | 'mirror';
export interface Shot {
  id: number; kind: ShotKind; hero: boolean;
  x: number; y: number; vx: number; vy: number;
  dmg: number; life: number; pierce: number; hit: Set<number>; r: number;
  bounce: number;
  tx?: number; ty?: number;
}

export type PickKind = 'gear' | 'chip' | 'health' | 'heart' | 'tank';
export interface Pickup { id: number; kind: PickKind; x: number; y: number; vx: number; vy: number; loose: boolean; idx: number; taken: boolean; t: number }

export type PropKind = 'lever' | 'lootbox' | 'barrel' | 'checkpoint' | 'exit';
export interface Prop { id: number; kind: PropKind; x: number; y: number; on: boolean; hp: number; t: number; link: number }

export interface Hazard { id: number; kind: 'cable' | 'steam' | 'laser'; x: number; y0: number; y1: number; off: number; phase: 'off' | 'warn' | 'on' }
export interface Faller { id: number; x0: number; x1: number; y: number; state: 'idle' | 'shake' | 'fall' | 'gone'; t: number; dy: number }
export interface Gate { id: number; kind: 'door' | 'bridge'; x0: number; x1: number; y0: number; y1: number; open: boolean; t: number }
export interface Wave { id: number; x: number; y: number; dir: number; speed: number; life: number; dmg: number; hero: boolean; hit: Set<number> }
export interface Mark { id: number; x: number; y: number; t: number; r: number }

export type SimEvent =
  | { type: 'jump'; air: boolean; wall?: boolean }
  | { type: 'land'; hard: boolean }
  | { type: 'roll' } | { type: 'dash' }
  | { type: 'swing'; kind: AtkKind; step: number }
  | { type: 'charge'; kind: 'cleave' | 'iaido' } | { type: 'chargeReady' }
  | { type: 'reflect'; x: number; y: number }
  | { type: 'launch'; foe: Foe }
  | { type: 'cut'; foe: Foe; x: number; y: number }
  | { type: 'diveLand'; x: number; y: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'implant'; x: number; y: number }
  | { type: 'move'; id: MoveId }
  | { type: 'shoot'; x: number; y: number; dir: number; heavy: boolean }
  | { type: 'overheat' } | { type: 'cooled' } | { type: 'coolant' }
  | { type: 'hit'; foe: Foe; dmg: number; x: number; y: number; big: boolean; name: string | null }
  | { type: 'armour'; foe: Foe; broken: boolean }
  | { type: 'kill'; foe: Foe; score: number }
  | { type: 'parry'; x: number; y: number }
  | { type: 'tell'; foe: Foe; move: string }
  | { type: 'foeFire'; foe: Foe; move: string }
  | { type: 'hurt'; dmg: number; x: number; y: number }
  | { type: 'blocked'; x: number; y: number }
  | { type: 'die' } | { type: 'respawn' } | { type: 'gameOver' } | { type: 'pit' } | { type: 'secondHeart' }
  | { type: 'pickup'; kind: PickKind; x: number; y: number; n: number }
  | { type: 'chip'; idx: number; x: number; y: number }
  | { type: 'checkpoint'; x: number; y: number; first: boolean }
  | { type: 'lever'; x: number; y: number }
  | { type: 'gate'; gate: Gate }
  | { type: 'loot'; x: number; y: number }
  | { type: 'boom'; x: number; y: number; r: number }
  | { type: 'shell'; x: number; y: number }
  | { type: 'slamLand'; x: number; y: number }
  | { type: 'wave'; x: number; y: number }
  | { type: 'hazard'; h: Hazard }
  | { type: 'fall'; f: Faller }
  | { type: 'tip'; key: string }
  | { type: 'clear' }
  | { type: 'bossStart' } | { type: 'bossPhase'; phase: number } | { type: 'bossDown'; x: number; y: number }
  | { type: 'spawn'; foe: Foe }
  | { type: 'combo'; n: number }
  | { type: 'score'; n: number; x: number; y: number }
  | { type: 'heal'; n: number };

const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_FALL = 3, T_BRIDGE = 4, T_DOOR = 5;

/** Names of the finishers, popped at the impact. */
const FINISHER: Partial<Record<AtkKind, string>> = {
  slash: 'fNeonCut', cleave: 'fCleave', lunge: 'fLunge', slam: 'fSlam', spin: 'fCyclone', rise: 'fRise', air3: 'fSky', dive: 'fDive', iaido: 'fIaido', burst: 'fBurst',
};
/** The move each blow belongs to (the Moves screen, the first-use hints). */
const MOVE_OF: Partial<Record<AtkKind, MoveId>> = {
  slash: 'neonCut', cleave: 'cleave', lunge: 'lunge', slam: 'slam', spin: 'cyclone', rise: 'rise', air3: 'sky', dive: 'dive', iaido: 'iaido', burst: 'burst',
};
/** Blows that happen in the air: landing ends them. */
const AIRBORNE: AtkKind[] = ['air', 'air2', 'air3', 'rise', 'dive'];
/** The light foes a launcher throws and a juggle keeps up. */
const LIGHT: FoeKind[] = ['walker', 'gunner', 'drone', 'gdrone'];

export class Sim {
  readonly L: LevelDef;
  readonly W: number;
  readonly H = ROWS;
  readonly tune;
  grid: Uint8Array;
  time = 0;
  over = false;
  won = false;
  cleared = false;
  hitStop = 0;
  events: SimEvent[] = [];
  p: Hero;
  foes: Foe[] = [];
  shots: Shot[] = [];
  picks: Pickup[] = [];
  props: Prop[] = [];
  hazards: Hazard[] = [];
  fallers: Faller[] = [];
  gates: Gate[] = [];
  waves: Wave[] = [];
  marks: Mark[] = [];
  /** The iaido's cuts, landing a beat after the dash. */
  cuts: Array<{ f: Foe; t: number; dmg: number; dir: number }> = [];
  fallerAt = new Map<number, Faller>();
  gateAt = new Map<number, Gate>();
  check: { x: number; y: number };
  checkFirst = true;
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  lastFight = -9;
  score = 0;
  kills = 0;
  gears = 0;
  chips = [false, false, false];
  hits = 0;
  deaths = 0;
  tipsShown = new Set<string>();
  boss: Foe | null = null;
  bossOn = false;
  bossPhase = 1;
  exitOpen = true;
  /** Infinite lives and health (the menu backdrop). */
  demo = false;
  private nextId = 1;
  private rnd: () => number;
  private killsForHeal = 0;

  constructor(readonly levelIndex: number, readonly run: RunState, seed = 1) {
    this.L = LEVELS[levelIndex];
    this.W = this.L.width;
    this.tune = TUNING[run.mode];
    this.rnd = mulberry(seed * 977 + levelIndex);
    this.grid = new Uint8Array(this.W * this.H);
    const start = { x: 2, y: 3 };
    let chipIdx = 0;
    const L = this.L;
    for (let row = 0; row < this.H; row++) {
      const y = this.H - 1 - row;
      const s = L.rows[row];
      for (let x = 0; x < this.W; x++) {
        const ch = s[x] ?? ' ';
        const cx = x + 0.5;
        switch (ch) {
          case '#': this.set(x, y, T_SOLID); break;
          case '=': this.set(x, y, T_ONEWAY); break;
          case 'F': this.set(x, y, T_FALL); break;
          case 'B': this.set(x, y, T_BRIDGE); break;
          case 'D': this.set(x, y, T_DOOR); break;
          case 'P': start.x = cx; start.y = y; break;
          case 'K': this.prop('checkpoint', cx, y); break;
          case 'X': this.prop('exit', cx, y); break;
          case 'l': this.prop('lever', cx, y); break;
          case 'b': this.prop('lootbox', cx, y, 2); break;
          case 'x': this.prop('barrel', cx, y, 1); break;
          case 'c': this.pick('chip', cx, y + 0.6, chipIdx++); break;
          case 'o': this.pick('gear', cx, y + 0.5); break;
          case 'h': this.pick('health', cx, y + 0.4); break;
          case 'H': this.pick('heart', cx, y + 0.4); break;
          case 't': this.pick('tank', cx, y + 0.3); break;
          case 'w': this.spawn('walker', cx, y); break;
          case 'g': this.spawn('gunner', cx, y); break;
          case 'd': this.spawn('drone', cx, y); break;
          case 'q': this.spawn('gdrone', cx, y); break;
          case 'r': this.spawn('brute', cx, y); break;
          case 'T': this.spawn('turret', cx, y); break;
          case 'C': this.spawn('cannon', cx, y); break;
          case 'U': this.spawn('double', cx, y); break;
          case 'V': this.spawn('tele', cx, y); break;
          case 'M': this.boss = this.spawn('boss', cx, y); break;
        }
      }
    }
    this.buildDynamic();
    this.linkLevers();
    if (this.boss) {
      const b = this.boss;
      b.hp = b.maxHp = Math.round(BOSS_HP[L.district] * this.tune.bossHp);
      b.state = 'idle';
      this.exitOpen = false;
    }
    this.check = { ...start };
    const maxHp = this.maxHp();
    this.p = {
      x: start.x, y: start.y, vx: 0, vy: 0, w: MOVE.w, h: MOVE.h, face: 1, state: 'idle', t: 0, ground: true, coyote: 0, buffer: 0,
      airJumps: this.airJumpsMax(), wall: 0, hp: maxHp, maxHp, iframes: 0, shield: run.ranks.armor >= 3, rollCd: 0, rollEnd: -9, dashes: 0,
      atk: null, airAtk: 0, hangT: 0, hangUsed: false, jumpAt: -9, runT: 0, chargeKind: 'cleave', bufDown: false, bufUp: false,
      chain: 0, chainT: 0, atkBuf: 0, held: 0, charge: 0, heat: 0, hot: false, coolant: 0, sinceShot: 9, fireCd: 0, shootT: 0, shots: 0,
      deadT: 0, lastSafe: { ...start }, dropT: 0, secondHeart: this.has('secondHeart'),
    };
  }

  // ---------------------------------------------------------------- set-up

  private set(x: number, y: number, v: number): void { this.grid[y * this.W + x] = v; }
  tile(x: number, y: number): number {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return x < 0 || x >= this.W ? T_SOLID : T_EMPTY;
    return this.grid[y * this.W + x];
  }
  /** Solid for bodies (walls, closed doors, lowered bridges). */
  solid(x: number, y: number): boolean {
    const t = this.tile(x, y);
    if (t === T_SOLID) return true;
    if (t === T_DOOR) return !this.gateAt.get(y * this.W + x)?.open;
    if (t === T_BRIDGE) return !!this.gateAt.get(y * this.W + x)?.open;
    return false;
  }
  /** One-way tops (ledges and falling ledges that still stand). */
  oneway(x: number, y: number): boolean {
    const t = this.tile(x, y);
    if (t === T_ONEWAY) return true;
    if (t === T_FALL) { const f = this.fallerAt.get(y * this.W + x); return !!f && (f.state === 'idle' || f.state === 'shake'); }
    return false;
  }
  /** Ground (a solid or one-way top) in cell (x, y)? */
  standable(x: number, y: number): boolean { return this.solid(x, y) || this.oneway(x, y); }

  private prop(kind: PropKind, x: number, y: number, hp = 0): Prop {
    const p: Prop = { id: this.nextId++, kind, x, y, on: false, hp, t: 0, link: -1 };
    this.props.push(p);
    return p;
  }

  private pick(kind: PickKind, x: number, y: number, idx = -1, loose = false, vx = 0, vy = 0): Pickup {
    const k: Pickup = { id: this.nextId++, kind, x, y, vx, vy, loose, idx, taken: false, t: 0 };
    this.picks.push(k);
    return k;
  }

  spawn(kind: FoeKind, x: number, y: number, spawned = false): Foe {
    const d = FOE[kind];
    const hp = Math.max(1, Math.round(d.hp * this.tune.foeHp * (kind === 'boss' ? 1 : DISTRICT_SCALE.hp[this.L.district]) * 10) / 10);
    const f: Foe = {
      id: this.nextId++, kind, x, y: d.flies ? y + 0.4 : y, vx: 0, vy: 0, w: d.w, h: d.h, hp, maxHp: hp,
      armour: d.armour ?? 0, maxArmour: d.armour ?? 0, face: -1, state: spawned ? 'spawn' : 'patrol', t: spawned ? 0.6 : this.rnd() * 2,
      move: '', homeX: x, homeY: d.flies ? y + 0.4 : y, flash: 0, flinch: 0, ground: false, aim: null, shots: 0, spawned, dead: 0, kids: 0, bob: this.rnd() * 6, juggle: 0,
    };
    this.foes.push(f);
    return f;
  }

  private buildDynamic(): void {
    const seen = new Set<number>();
    let hz = 0;
    for (let row = 0; row < this.H; row++) {
      const y = this.H - 1 - row;
      const s = this.L.rows[row];
      for (let x = 0; x < this.W; x++) {
        const ch = s[x];
        const key = y * this.W + x;
        if (seen.has(key)) continue;
        if (ch === 'Z' || ch === 'L') {
          // a vertical run, top to bottom
          let y0 = y;
          while (y0 - 1 >= 0 && this.L.rows[this.H - 1 - (y0 - 1)][x] === ch) { y0--; seen.add(y0 * this.W + x); }
          seen.add(key);
          this.hazards.push({ id: this.nextId++, kind: ch === 'Z' ? 'cable' : 'laser', x, y0, y1: y + 1, off: (hz++ * 0.83) % 3, phase: 'off' });
        } else if (ch === 'S') {
          this.hazards.push({ id: this.nextId++, kind: 'steam', x, y0: y, y1: y + 3, off: (hz++ * 0.91) % 3, phase: 'off' });
        } else if (ch === 'F') {
          let x1 = x;
          while (s[x1 + 1] === 'F') { x1++; seen.add(y * this.W + x1); }
          const f: Faller = { id: this.nextId++, x0: x, x1: x1 + 1, y, state: 'idle', t: 0, dy: 0 };
          this.fallers.push(f);
          for (let i = x; i <= x1; i++) this.fallerAt.set(y * this.W + i, f);
        } else if (ch === 'B') {
          let x1 = x;
          while (s[x1 + 1] === 'B') { x1++; seen.add(y * this.W + x1); }
          const g: Gate = { id: this.nextId++, kind: 'bridge', x0: x, x1: x1 + 1, y0: y, y1: y + 1, open: false, t: 0 };
          this.gates.push(g);
          for (let i = x; i <= x1; i++) this.gateAt.set(y * this.W + i, g);
        } else if (ch === 'D') {
          let y0 = y;
          while (y0 - 1 >= 0 && this.L.rows[this.H - 1 - (y0 - 1)][x] === 'D') { y0--; seen.add(y0 * this.W + x); }
          const g: Gate = { id: this.nextId++, kind: 'door', x0: x, x1: x + 1, y0, y1: y + 1, open: false, t: 0 };
          this.gates.push(g);
          for (let i = y0; i <= y; i++) this.gateAt.set(i * this.W + x, g);
        }
        seen.add(key);
      }
    }
  }

  /** Each lever opens the nearest door or bridge to its right. */
  private linkLevers(): void {
    for (const p of this.props) {
      if (p.kind !== 'lever') continue;
      let best = -1, bd = 60;
      this.gates.forEach((g, i) => { const d = g.x0 - p.x; if (d > 0 && d < bd) { bd = d; best = i; } });
      p.link = best;
    }
  }

  // ---------------------------------------------------------------- run rules

  has(c: CardId): boolean { return this.run.cards.includes(c); }
  hasAbility(a: AbilityId): boolean { return this.run.abilities.includes(a); }

  maxHp(): number {
    const r = this.run.ranks.armor;
    return Math.max(1, this.tune.hp + (r >= 1 ? 1 : 0) + (r >= 2 ? 1 : 0) + (this.has('nanoWeave') ? 1 : 0) - (this.has('glassCannon') ? 1 : 0) + this.run.hearts);
  }
  airJumpsMax(): number { return 1 + (this.has('tripleJump') ? 1 : 0); }
  runSpeed(): number { return MOVE.run * (1 + Math.min(1, this.run.ranks.boots) * 0.06) * (this.has('afterburner') ? 1.15 : 1); }
  private jumpV(): number { return MOVE.jump * (this.has('springCoils') ? 1.08 : 1); }
  private meleeMult(f?: Foe): number {
    let m = 1 + (this.run.ranks.sword >= 1 ? 0.25 : 0);
    if (this.has('overclock')) m *= 1.2;
    if (this.has('glassCannon')) m *= 1.5;
    if (this.has('executioner') && f && (f.state === 'stun' || (f.maxArmour > 0 && f.armour <= 0))) m *= 1.5;
    return m;
  }
  private gunMult(): number {
    let m = 1 + (this.run.ranks.gun >= 1 ? 0.3 : 0);
    if (this.has('hotRounds')) m *= 1.25;
    if (this.has('glassCannon')) m *= 1.5;
    return m;
  }
  magnetR(): number { return [0.9, 2.6, 4.6, 4.6][this.run.ranks.magnet] + (this.has('magnetCard') ? 3 : 0); }
  inCombat(): boolean {
    if (this.bossOn) return true;
    if (this.time - this.lastFight < COMBAT_MEMORY) return true;
    const p = this.p;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.kind === 'tele') continue;
      if (Math.abs(f.x - p.x) < COMBAT_RANGE && Math.abs(f.y - p.y) < 3.5) return true;
      if (f.state === 'tell' && Math.abs(f.x - p.x) < 14) return true;
    }
    return false;
  }

  private emit(e: SimEvent): void { this.events.push(e); }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    if (this.over) return;
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.time += dt;
    this.hero(dt, inp);
    this.updateCuts(dt);
    this.updateFoes(dt);
    this.updateShots(dt);
    this.updateWaves(dt);
    this.updateMarks(dt);
    this.updateHazards(dt);
    this.updatePicks(dt);
    this.updateProps(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    for (const tp of this.L.tipsX) if (!this.tipsShown.has(tp.key) && this.p.x >= tp.x) { this.tipsShown.add(tp.key); this.emit({ type: 'tip', key: tp.key }); }
  }

  // ---------------------------------------------------------------- the hero

  private hero(dt: number, inp: Input): void {
    const p = this.p;
    p.t += dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.rollCd > 0) p.rollCd -= dt;
    if (p.chainT > 0) { p.chainT -= dt; if (p.chainT <= 0) p.chain = 0; }
    if (p.atkBuf > 0) p.atkBuf -= dt;
    if (p.shootT > 0) p.shootT -= dt;
    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.dropT > 0) p.dropT -= dt;
    if (p.hangT > 0) p.hangT -= dt;
    p.runT = p.state === 'run' && p.ground ? p.runT + dt : 0;
    p.held = inp.attackHeld ? p.held + dt : 0;
    this.heat(dt, inp);

    if (p.state === 'dead') {
      p.deadT += dt;
      p.vx *= 0.9;
      this.physics(dt, false);
      if (p.deadT > 1.7) this.respawn();
      return;
    }
    if (p.state === 'win') { p.vx *= 0.85; this.physics(dt, false); return; }

    // the buffered jump
    if (inp.jump) p.buffer = MOVE.buffer; else if (p.buffer > 0) p.buffer -= dt;
    if (p.ground) { p.coyote = MOVE.coyote; p.airJumps = this.airJumpsMax(); p.dashes = this.run.ranks.boots >= 3 ? 2 : 1; p.airAtk = 0; p.hangUsed = false; } else if (p.coyote > 0) p.coyote -= dt;

    const busy = p.state === 'roll' || p.state === 'dash' || p.state === 'attack' || p.state === 'charge' || p.state === 'slam' || p.state === 'hurt';

    // facing (not while committed to a move)
    if (!busy && Math.abs(inp.mx) > 0.25) p.face = inp.mx > 0 ? 1 : -1;

    // ---- actions
    if (inp.roll) this.tryRoll(inp);
    if (inp.attack) this.pressAttack(inp);
    if (inp.shoot && this.burstReady()) this.startAttack('burst', 3);
    else if ((inp.shoot || inp.shootHeld) && p.state !== 'roll' && p.state !== 'dash' && p.state !== 'hurt' && p.state !== 'slam' && p.state !== 'charge') this.tryShoot();

    // ---- states
    switch (p.state) {
      case 'roll': {
        p.vx = p.face * MOVE.rollSpeed * (this.has('ghostStep') ? 1.1 : 1);
        if (p.t >= MOVE.roll) this.endRoll();
        break;
      }
      case 'dash': {
        p.vx = p.face * MOVE.dashSpeed;
        p.vy = 0;
        if (p.t >= MOVE.dash) { p.state = 'air'; p.vx = p.face * this.runSpeed(); }
        break;
      }
      case 'attack': this.attackStep(dt, inp); break;
      case 'charge': {
        p.vx *= 0.8;
        const full = p.chargeKind === 'iaido' ? 0.3 : 0.25;
        p.charge = Math.min(1, p.charge + dt / full);
        if (p.charge >= 1 && p.t - dt < full && p.t >= full) this.emit({ type: 'chargeReady' });
        if (!inp.attackHeld || p.t > 1.0) this.startAttack(p.chargeKind === 'iaido' ? 'iaido' : 'cleave', 3);
        break;
      }
      case 'slam': {
        p.vx = 0;
        p.vy = -MOVE.slamSpeed;
        break;
      }
      case 'hurt': {
        if (p.t >= MOVE.hurt) p.state = p.ground ? 'idle' : 'air';
        break;
      }
      default: this.moveFree(dt, inp);
    }

    const wasGround = p.ground;
    const vyBefore = p.vy;
    this.physics(dt, p.state !== 'dash');
    if (p.ground && !wasGround) {
      if (p.state === 'slam') this.slamLand();
      else if (p.state === 'attack' && p.atk?.kind === 'dive') this.diveLand();
      else {
        this.emit({ type: 'land', hard: vyBefore < -16 });
        // an air blow ends cleanly on landing (no skid on a frozen swing)
        if (p.state === 'attack' && p.atk && AIRBORNE.includes(p.atk.kind)) { p.atk = null; p.state = 'idle'; p.chainT = 0; p.chain = 0; }
      }
      if (p.state === 'air' || p.state === 'wall') p.state = 'idle';
    }
    if (!p.ground && (p.state === 'idle' || p.state === 'run')) p.state = 'air';
    this.heroContacts(dt);
    // the void
    if (p.y < -4) this.pitFall();
  }

  private moveFree(dt: number, inp: Input): void {
    const p = this.p;
    const target = inp.mx * this.runSpeed();
    const acc = p.ground ? (Math.abs(target) > 0.1 ? MOVE.accel : MOVE.friction) : MOVE.airAccel;
    p.vx += Phaser_clamp(target - p.vx, -acc * dt, acc * dt);
    // wall slide and wall jump (unlocked)
    p.wall = 0;
    if (!p.ground && this.hasAbility('wall') && p.vy < 2) {
      const dir = inp.mx > 0.3 ? 1 : inp.mx < -0.3 ? -1 : 0;
      if (dir && this.touchesWall(dir as 1 | -1)) {
        p.wall = dir as 1 | -1;
        p.state = 'wall';
        if (p.vy < -MOVE.wallSlide) p.vy = -MOVE.wallSlide;
      } else if (p.state === 'wall') p.state = 'air';
    } else if (p.state === 'wall') p.state = 'air';
    // drop through a ledge: down + jump
    if (p.buffer > 0 && inp.down && p.ground && this.onOneway()) {
      p.buffer = 0;
      p.dropT = 0.25;
      p.ground = false;
      p.y -= 0.05;
      p.state = 'air';
      return;
    }
    // the jump
    if (p.buffer > 0) {
      if (p.ground || p.coyote > 0) {
        p.vy = this.jumpV();
        p.ground = false;
        p.coyote = 0;
        p.buffer = 0;
        p.state = 'air';
        p.jumpAt = this.time;
        this.emit({ type: 'jump', air: false });
      } else if (p.state === 'wall' || (this.hasAbility('wall') && (this.touchesWall(1) || this.touchesWall(-1)))) {
        const away = p.wall ? -p.wall : this.touchesWall(1) ? -1 : 1;
        p.vx = away * MOVE.wallJumpX;
        p.vy = MOVE.wallJumpY;
        p.face = away as 1 | -1;
        p.buffer = 0;
        p.state = 'air';
        p.airJumps = this.airJumpsMax();
        p.airAtk = 0;
        p.hangUsed = false;
        this.emit({ type: 'jump', air: false, wall: true });
      } else if (p.airJumps > 0) {
        p.vy = MOVE.airJump * (this.has('springCoils') ? 1.06 : 1);
        p.airJumps--;
        p.buffer = 0;
        this.emit({ type: 'jump', air: true });
      }
    }
    // variable jump height
    if (!inp.jumpHeld && p.vy > 0 && !p.ground) p.vy *= Math.pow(MOVE.jumpCut, dt * 10);
    if (p.ground) p.state = Math.abs(p.vx) > 0.6 ? 'run' : 'idle';
  }

  private touchesWall(dir: 1 | -1): boolean {
    const p = this.p;
    const x = Math.floor(p.x + dir * (p.w / 2 + 0.06));
    for (const yy of [p.y + 0.3, p.y + p.h - 0.2]) if (this.solid(x, Math.floor(yy))) return true;
    return false;
  }
  private onOneway(): boolean {
    const p = this.p;
    const y = Math.floor(p.y - 0.05);
    for (const xx of [p.x - p.w / 2 + 0.05, p.x + p.w / 2 - 0.05]) if (this.solid(Math.floor(xx), y)) return false;
    return true;
  }

  private tryRoll(inp: Input): void {
    const p = this.p;
    if (p.state === 'roll' || p.state === 'dash' || p.state === 'dead' || p.state === 'slam' || p.state === 'hurt') return;
    if (p.state === 'attack' && p.atk && p.atk.t < p.atk.def.off) return;
    if (Math.abs(inp.mx) > 0.25) p.face = inp.mx > 0 ? 1 : -1;
    if (p.ground) {
      if (p.rollCd > 0) return;
      p.state = 'roll';
      p.t = 0;
      p.atk = null;
      p.h = MOVE.rollH;
      p.iframes = Math.max(p.iframes, MOVE.rollIframes * (this.has('ghostStep') ? 1.5 : 1));
      this.emit({ type: 'roll' });
    } else if (this.run.ranks.boots >= 2 && p.dashes > 0) {
      p.dashes--;
      p.state = 'dash';
      p.t = 0;
      p.atk = null;
      p.iframes = Math.max(p.iframes, MOVE.dash);
      this.emit({ type: 'dash' });
    }
  }

  private endRoll(): void {
    const p = this.p;
    // stand up only where there is room
    if (this.room(p.x, p.y, MOVE.h)) p.h = MOVE.h;
    else { p.t = MOVE.roll - 0.05; return; }
    p.state = p.ground ? 'idle' : 'air';
    p.rollEnd = this.time;
    p.rollCd = MOVE.rollCooldown * (this.has('ghostStep') ? 0.7 : 1);
  }

  private room(x: number, y: number, h: number): boolean {
    const w = MOVE.w / 2 - 0.02;
    for (let yy = Math.floor(y + 0.02); yy <= Math.floor(y + h - 0.02); yy++) {
      if (this.solid(Math.floor(x - w), yy) || this.solid(Math.floor(x + w), yy)) return false;
    }
    return true;
  }

  // ---- melee

  private pressAttack(inp: Input): void {
    const p = this.p;
    if (p.state === 'dead' || p.state === 'hurt' || p.state === 'slam' || p.state === 'charge') return;
    // C: right after (or at the end of) a roll: the lunge
    if (p.state === 'roll' && p.t > MOVE.roll * 0.4) { this.endRollForLunge(); this.startAttack('lunge', 1); return; }
    if (p.state !== 'roll' && this.time - p.rollEnd < LUNGE_WINDOW && p.ground) { this.startAttack('lunge', 1); return; }
    if (p.state === 'roll' || p.state === 'dash') return;
    if (p.state === 'attack') { p.atkBuf = 0.28; p.bufDown = inp.down; p.bufUp = inp.up; return; }
    // the rising dragon: up + ATTACK on the ground, or just after a jump (on the keyboard up is jump)
    if (inp.up && this.hasAbility('rise') && (p.ground || (p.vy > 0 && this.time - p.jumpAt < RISE_WINDOW))) { this.startAttack('rise', 1); return; }
    if (!p.ground) { this.airAttack(inp.down, inp.mx); return; }
    if (!this.inCombat()) { this.startAttack('single', 1); return; }
    // a bolt about to arrive: the blade comes out first, so a timed press can send it back (Katana I)
    if (this.run.ranks.sword >= 1 && p.chainT <= 0 && this.boltAhead()) { this.startAttack('single', 1); return; }
    // the cyclone: ATTACK while sprinting into a fight
    if (p.state === 'run' && p.runT >= SPIN_RUN && Math.abs(inp.mx) > 0.5 && Math.sign(inp.mx) === p.face && p.chainT <= 0) { this.startAttack('spin', 1); return; }
    const step = p.chainT > 0 ? p.chain + 1 : 1;
    this.chainStep(step > 3 ? 1 : step);
  }

  /** A foe bolt flying at the hero from in front, close. */
  private boltAhead(): boolean {
    const p = this.p;
    for (const s of this.shots) {
      if (s.hero || s.life <= 0 || s.kind === 'shell') continue;
      const d = (s.x - p.x) * p.face;
      if (d > -0.3 && d < 3 && Math.sign(s.vx) === -p.face && s.y > p.y - 0.3 && s.y < p.y + p.h + 0.6) return true;
    }
    return false;
  }

  /** In the air: down + ATTACK dives (or slams straight down, unlocked); else the next blow of the air string. */
  private airAttack(down: boolean, mx: number): void {
    const p = this.p;
    if (down) {
      if (this.hasAbility('slam') && Math.abs(mx) < 0.3) {
        p.state = 'slam'; p.t = 0; p.atk = null; p.iframes = Math.max(p.iframes, 0.2);
        this.emit({ type: 'swing', kind: 'slam', step: 1 });
        this.emit({ type: 'move', id: 'slam' });
        return;
      }
      if (Math.abs(mx) > 0.3) p.face = mx > 0 ? 1 : -1;
      this.startAttack('dive', 1);
      return;
    }
    if (p.airAtk >= AIR_MAX) return;
    const step = p.airAtk + 1;
    this.startAttack(step === 1 ? 'air' : step === 2 ? 'air2' : 'air3', step);
  }

  private endRollForLunge(): void {
    const p = this.p;
    if (this.room(p.x, p.y, MOVE.h)) p.h = MOVE.h;
    p.rollEnd = this.time;
  }

  private chainStep(step: number): void {
    const kind: AtkKind = step === 1 ? 'punch' : step === 2 ? 'kick' : 'slash';
    this.startAttack(kind, step);
  }

  /** Blade & bolt: SHOOT on the chain's second blow (Blaster I, in a fight, on the ground). */
  private burstReady(): boolean {
    const p = this.p;
    if (this.run.ranks.gun < 1 || !p.ground) return false;
    const onKick = p.state === 'attack' && p.atk?.kind === 'kick' && p.atk.t >= p.atk.def.on;
    const after = (p.state === 'idle' || p.state === 'run') && p.chainT > 0 && p.chain === 2;
    return (onKick || after) && this.inCombat();
  }

  private startAttack(kind: AtkKind, step: number): void {
    const p = this.p;
    if (kind !== 'dive' && kind !== 'iaido') this.softAim();
    const def = ATTACKS[kind];
    const fast = this.has('momentum') && step > 1 && kind !== 'iaido' && kind !== 'cleave' ? 0.85 : 1;
    p.state = 'attack';
    p.t = 0;
    p.atk = { kind, step, t: 0, hit: new Set(), def: fast !== 1 ? { ...def, dur: def.dur * fast, on: def.on * fast, off: def.off * fast } : def, dx: 0 };
    p.chain = step;
    p.atkBuf = 0;
    p.charge = 0;
    if (kind === 'lunge') {
      p.atk.dx = LUNGE_DIST[this.run.ranks.sword];
      p.iframes = Math.max(p.iframes, 0.3);
    } else if (kind === 'iaido') {
      p.atk.dx = IAIDO_DIST;
      p.iframes = Math.max(p.iframes, 0.55);
    } else if (kind === 'slash' && this.run.ranks.sword >= 2) p.atk.dx = 2.6;
    else if (AIRBORNE.includes(kind) || kind === 'spin') { /* the hero keeps its momentum */ }
    else p.vx = p.face * def.lunge * 3;
    if (kind === 'rise') {
      // the hero hops after the foe it throws (the keyboard's up already jumped: keep the higher)
      p.vy = Math.max(p.vy, RISE_HOP);
      p.ground = false;
      p.coyote = 0;
      p.airAtk = 0;
      p.hangUsed = false;
    }
    if (kind === 'air' || kind === 'air2' || kind === 'air3') p.airAtk = step;
    if (kind === 'dive') { p.airAtk = AIR_MAX; p.iframes = Math.max(p.iframes, 0.12); }
    if (kind === 'burst') {
      // a point-blank plasma round that pierces the line (no heat: the chain paid for it)
      const dmg = 2 * this.gunMult();
      this.shots.push({ id: this.nextId++, kind: 'heavy', hero: true, x: p.x + p.face * 0.8, y: p.y + 0.95, vx: p.face * GUN.speed * 1.1, vy: 0, dmg, life: 0.55, pierce: 4, hit: new Set(), r: 0.5, bounce: 0 });
      p.shootT = 0.4;
      this.emit({ type: 'shoot', x: p.x + p.face * 0.8, y: p.y + 0.95, dir: p.face, heavy: true });
    }
    this.emit({ type: 'swing', kind, step });
    const mv = MOVE_OF[kind];
    if (mv) this.emit({ type: 'move', id: mv });
  }

  /** A soft target assist: turns to the best foe close behind when nothing is ahead. */
  private softAim(): void {
    const p = this.p;
    let ahead = false, behind: Foe | null = null;
    for (const f of this.foes) {
      if (f.state === 'dead' || Math.abs(f.y - p.y) > 2.5) continue;
      const d = (f.x - p.x) * p.face;
      if (d > -0.3 && d < 3.2) ahead = true;
      else if (d < 0 && d > -2.8) behind = f;
    }
    if (!ahead && behind) p.face = (behind.x > p.x ? 1 : -1) as 1 | -1;
  }

  private attackStep(dt: number, inp: Input): void {
    const p = this.p, a = p.atk!;
    a.t += dt;
    const def = a.def;
    // the move's own travel
    if (a.dx > 0 && a.t < def.off + 0.02) {
      const sp = a.dx / Math.max(0.12, def.off);
      p.vx = p.face * sp;
      if (a.kind === 'lunge' || a.kind === 'iaido') p.vy = Math.max(p.vy, 0);
    } else if (a.kind === 'iaido' && !a.second) {
      // the flash stops dead where it ends (no slide on from its speed)
      a.second = true;
      p.vx = p.face * 3;
    } else if (a.kind === 'dive') {
      p.vx = p.face * DIVE_V.x;
      p.vy = DIVE_V.y;
    } else if (a.kind === 'spin') {
      // the cyclone carries the sprint through the turn
      p.vx = p.face * this.runSpeed() * (a.t < def.off ? 0.8 : 0.35);
    } else if (p.ground) p.vx *= Math.pow(0.0005, dt);
    else if (Math.abs(inp.mx) > 0.2) {
      // in the air the hero keeps its momentum; the stick still steers a little
      const acc = MOVE.airAccel * AIR_ATTACK_CONTROL;
      p.vx += Phaser_clamp(inp.mx * this.runSpeed() - p.vx, -acc * dt, acc * dt);
    }
    // the cyclone's second turn hits again
    if (a.kind === 'spin' && !a.second && a.t >= (def.on + def.off) / 2) {
      a.second = true;
      for (const f of this.foes) a.hit.delete(f.id);
    }
    if (a.t <= def.off && a.kind !== 'burst') this.cutBolts(a);
    if (a.t >= def.on && a.t <= def.off) this.meleeHits(a);
    // the heavy chain: holding ATTACK after the second blow charges the cleave
    if (a.kind === 'kick' && inp.attackHeld && p.held >= CHARGE_TIME && this.hasAbility('cleave') && a.t >= def.off) {
      this.startCharge('cleave');
      return;
    }
    // holding ATTACK on through the lunge draws the iaido
    if (a.kind === 'lunge' && inp.attackHeld && p.held >= IAIDO_HOLD && this.hasAbility('iaido') && a.t >= def.off && p.ground) {
      this.startCharge('iaido');
      return;
    }
    if (a.t >= def.dur) {
      const chainable = a.kind === 'punch' || a.kind === 'kick' || a.kind === 'spin';
      const pressed = p.atkBuf > 0 || inp.attackHeld;
      // the air string goes on in the air (a buffered down + ATTACK dives instead)
      if ((a.kind === 'air' || a.kind === 'air2' || a.kind === 'rise') && pressed && !p.ground) {
        const down = p.atkBuf > 0 ? p.bufDown : inp.down;
        if (down || p.airAtk < AIR_MAX) { p.atk = null; p.state = 'air'; this.airAttack(down, inp.mx); return; }
      }
      const more = chainable && pressed && this.inCombat() && p.ground;
      if (more) { this.chainStep(a.kind === 'spin' ? 2 : a.step + 1); return; }
      p.atk = null;
      p.state = p.ground ? 'idle' : 'air';
      p.chainT = chainable ? 0.4 : 0;
      if (a.kind === 'spin') p.chain = 1;
      if (!chainable) p.chain = 0;
      if (a.kind === 'slash' && this.run.ranks.sword >= 3) this.crescent();
    }
  }

  private startCharge(kind: 'cleave' | 'iaido'): void {
    const p = this.p;
    p.state = 'charge'; p.t = 0; p.charge = 0; p.atk = null; p.chainT = 0; p.chargeKind = kind;
    this.emit({ type: 'charge', kind });
  }

  /** The dive meets the ground: a burst of sparks, a short crouch. */
  private diveLand(): void {
    const p = this.p, a = p.atk!;
    a.landed = a.t;
    a.def = { ...a.def, off: a.t, dur: a.t + 0.16 };
    p.vx = p.face * 2;
    this.emit({ type: 'diveLand', x: p.x, y: p.y });
    // the landing's edge hits what is right in front
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || a.hit.has(f.id)) continue;
      if (Math.abs(f.x - (p.x + p.face * 0.8)) < 1.3 + f.w / 2 && Math.abs(f.y - p.y) < 1) { a.hit.add(f.id); this.damage(f, 1.2 * this.meleeMult(f), 'melee', 'dive', p.face * 6); }
    }
  }

  private heroBox(a: AttackDef, kind: AtkKind): [number, number, number, number] {
    const p = this.p;
    const back = a.back ?? (kind === 'cleave' || kind === 'slam' ? 0.9 : 0.3);
    const x0 = p.face > 0 ? p.x - back : p.x - a.reach;
    const x1 = p.face > 0 ? p.x + a.reach : p.x + back;
    const y0 = p.y - (a.low ?? (kind === 'slam' ? 0.9 : 0.15));
    return [x0, y0, x1, p.y + MOVE.h - 0.6 + a.up];
  }

  private meleeHits(a: NonNullable<Hero['atk']>): void {
    const p = this.p;
    const [x0, y0, x1, y1] = this.heroBox(a.def, a.kind);
    let landed = false;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || a.hit.has(f.id)) continue;
      if (!overlap(x0, y0, x1, y1, f.x - f.w / 2, f.y, f.x + f.w / 2, f.y + f.h)) continue;
      a.hit.add(f.id);
      let dmg = a.def.dmg * this.meleeMult(f);
      if (a.kind === 'slash' && this.has('chainEdge')) dmg *= 2;
      const dir = Math.sign(f.x - p.x) || p.face;
      if (a.kind === 'iaido') {
        // the cut lands a beat after the dash
        // (no hit-stop now: the dash runs through clean, the stop comes with the cut)
        this.cuts.push({ f, t: IAIDO_DELAY + Math.max(0, a.def.off - a.t), dmg, dir });
        continue;
      }
      landed = true;
      this.damage(f, dmg, 'melee', a.kind, dir * a.def.knock);
      if (a.kind === 'slash' && this.has('voltBlade')) this.volt(f);
      this.lift(f, a.kind, a.def.lift ?? 0);
    }
    // levers, lootboxes, tanks
    for (const pr of this.props) {
      if (a.hit.has(pr.id)) continue;
      if (!overlap(x0, y0, x1, y1, pr.x - 0.4, pr.y, pr.x + 0.4, pr.y + 0.9)) continue;
      a.hit.add(pr.id);
      this.hitProp(pr);
    }
    if (landed) {
      this.hitStop = Math.max(this.hitStop, a.def.stop);
      if (a.kind === 'cleave') this.wave(p.x + p.face * 1.2, p.y, p.face, 3);
      // the first air hit of a jump hangs the hero for a moment, once; then it falls as usual
      if (!p.ground && (a.kind === 'air' || a.kind === 'air2' || a.kind === 'air3') && !p.hangUsed) {
        p.hangUsed = true;
        p.hangT = AIR_HANG;
        p.vy = Math.max(p.vy, -1);
      }
    }
  }

  /**
   * The blade cuts foe bolts out of the air from the moment it starts to move; met early in a
   * sword's swing (Katana I) a bolt flies back at the line it came from (Mirror Cut).
   */
  private cutBolts(a: NonNullable<Hero['atk']>): void {
    const p = this.p;
    const [x0, y0, x1, y1] = this.heroBox(a.def, a.kind);
    const mirror = this.run.ranks.sword >= 1 && a.def.clip === 'Sword_Slash' && a.t - a.def.on <= MIRROR_WINDOW;
    for (const s of this.shots) {
      if (s.hero || s.life <= 0 || s.kind === 'shell') continue;
      if (!overlap(x0, y0, x1, y1, s.x - 0.2, s.y - 0.2, s.x + 0.2, s.y + 0.2)) continue;
      s.life = 0;
      if (mirror) {
        const sp = Math.max(18, Math.hypot(s.vx, s.vy) * 1.6);
        const d = Math.hypot(s.vx, s.vy) || 1;
        this.shots.push({ id: this.nextId++, kind: 'mirror', hero: true, x: s.x, y: s.y, vx: -s.vx / d * sp, vy: -s.vy / d * sp, dmg: MIRROR_DMG * this.meleeMult(), life: 1.4, pierce: 1, hit: new Set(), r: 0.32, bounce: 0 });
        this.hitStop = Math.max(this.hitStop, 0.07);
        this.lastFight = this.time;
        this.emit({ type: 'reflect', x: s.x, y: s.y });
        this.emit({ type: 'move', id: 'mirror' });
      } else this.emit({ type: 'parry', x: s.x, y: s.y });
    }
  }

  /** Throws a light foe up (the launcher), keeps a juggled one up (air blows) or spikes it down (the finisher). */
  private lift(f: Foe, kind: AtkKind, lift: number): void {
    if (!lift || f.state === 'dead' || !LIGHT.includes(f.kind)) return;
    if (kind === 'rise') {
      f.juggle = 1.3;
      f.vy = FOE[f.kind].flies ? lift * 0.75 : lift;
      f.vx = this.p.face * 1.2;
      f.state = 'recover'; f.t = 9; f.aim = null; f.flinch = 0;
      this.emit({ type: 'launch', foe: f });
    } else if (f.juggle > 0 || FOE[f.kind].flies) {
      if (lift > 0) { f.vy = Math.max(f.vy, lift); f.juggle = Math.max(f.juggle, 0.6); f.vx *= 0.3; }
      else { f.vy = lift; f.juggle = Math.max(f.juggle, 0.8); f.vx = this.p.face * 3; }
      f.state = 'recover'; f.t = 9; f.aim = null;
    }
  }

  private updateCuts(dt: number): void {
    if (!this.cuts.length) return;
    for (const c of this.cuts) {
      c.t -= dt;
      if (c.t > 0) continue;
      if (c.f.state !== 'dead') {
        this.damage(c.f, c.dmg, 'melee', 'iaido', c.dir * ATTACKS.iaido.knock);
        this.emit({ type: 'cut', foe: c.f, x: c.f.x, y: c.f.y + c.f.h * 0.6 });
        this.hitStop = Math.max(this.hitStop, ATTACKS.iaido.stop);
      }
    }
    this.cuts = this.cuts.filter((c) => c.t > 0);
  }

  private volt(from: Foe): void {
    let n = 0;
    for (const f of this.foes) {
      if (n >= 2 || f === from || f.state === 'dead' || Math.hypot(f.x - from.x, f.y - from.y) > 5) continue;
      n++;
      this.damage(f, 1.5 * this.meleeMult(f), 'volt', null, 0);
    }
  }

  private crescent(): void {
    const p = this.p;
    this.shots.push({ id: this.nextId++, kind: 'crescent', hero: true, x: p.x + p.face * 1.2, y: p.y + 0.9, vx: p.face * 16, vy: 0, dmg: 2 * this.meleeMult(), life: 0.5, pierce: 9, hit: new Set(), r: 0.7, bounce: 0 });
    this.emit({ type: 'wave', x: p.x, y: p.y });
  }

  /** A shockwave lane along the ground (the cleave, the slam, the brute and the boss). */
  wave(x: number, y: number, dir: number, dmg: number, hero = true, speed = 13, life = 0.5): void {
    this.waves.push({ id: this.nextId++, x, y, dir, speed, life, dmg, hero, hit: new Set() });
  }

  private slamLand(): void {
    const p = this.p;
    p.state = 'attack';
    p.t = 0;
    p.atk = { kind: 'slam', step: 1, t: ATTACKS.slam.on, hit: new Set(), def: ATTACKS.slam, dx: 0 };
    this.emit({ type: 'slamLand', x: p.x, y: p.y });
    this.wave(p.x + 0.5, p.y, 1, 2 * this.meleeMult());
    this.wave(p.x - 0.5, p.y, -1, 2 * this.meleeMult());
    this.hitStop = 0.06;
  }

  // ---- the blaster

  private heat(dt: number, inp: Input): void {
    const p = this.p;
    void inp;
    p.sinceShot += dt;
    if (p.coolant > 0) { p.coolant -= dt; p.heat = 0; p.hot = false; }
    const rank = this.run.ranks.heat;
    const cool = GUN.cool * (1 + rank * 0.3);
    if (p.hot) {
      // locked: the heat drains over the lockout
      const lock = GUN.lockout * (1 - rank * 0.15);
      p.heat = Math.max(0, 100 * (1 - p.sinceShot / lock));
      if (p.sinceShot >= lock) { p.heat = 0; p.hot = false; this.emit({ type: 'cooled' }); }
    } else if (p.sinceShot > GUN.coolDelay) p.heat = Math.max(0, p.heat - cool * dt);
  }

  private tryShoot(): void {
    const p = this.p;
    if (p.hot || p.fireCd > 0) return;
    if (p.state === 'attack' && p.atk && p.atk.t < p.atk.def.off) return;
    if (p.state === 'attack') { p.atk = null; p.state = p.ground ? 'idle' : 'air'; }
    p.fireCd = GUN.rate;
    p.shootT = 0.28;
    p.sinceShot = 0;
    p.shots++;
    const heavy = this.has('kitsune') && p.shots % 3 === 0;
    const twin = this.run.ranks.gun >= 2 || this.has('twinBarrel');
    const pierce = (this.run.ranks.gun >= 3 ? 2 : 0) + (heavy ? 5 : 0);
    const x = p.x + p.face * 0.75, y = p.y + 0.95;
    // a soft aim at a foe in front, a little above or below
    let vx = p.face * GUN.speed, vy = 0;
    let best: Foe | null = null, bd = GUN.range;
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const dx = (f.x - x) * p.face, dy = f.y + f.h / 2 - y;
      if (dx < 0.5 || dx > GUN.range || Math.abs(dy) > dx * 0.7 + 0.5) continue;
      if (dx < bd) { bd = dx; best = f; }
    }
    if (best) {
      const dx = best.x - x, dy = best.y + best.h / 2 - y, d = Math.hypot(dx, dy);
      vx = dx / d * GUN.speed; vy = dy / d * GUN.speed;
    }
    const dmg = GUN.dmg * this.gunMult() * (heavy ? 3 : 1);
    const mk = (oy: number): void => {
      this.shots.push({ id: this.nextId++, kind: heavy ? 'heavy' : 'bolt', hero: true, x, y: y + oy, vx, vy, dmg: twin ? dmg * 0.7 : dmg, life: GUN.range / GUN.speed, pierce, hit: new Set(), r: heavy ? 0.45 : 0.22, bounce: this.has('ricochet') ? 1 : 0 });
    };
    if (twin) { mk(0.14); mk(-0.14); } else mk(0);
    if (p.coolant <= 0) {
      p.heat += GUN.heat * this.tune.heat * (this.has('cryo') ? 0.7 : 1) * (twin && this.has('twinBarrel') && this.run.ranks.gun >= 2 ? 1.1 : 1);
      if (p.heat >= 100) {
        p.heat = 100;
        p.hot = true;
        this.emit({ type: 'overheat' });
        if (this.run.ranks.heat >= 3 || this.has('ventBurst')) { this.blast(p.x, p.y + 0.7, 2.6, 2, true); }
      }
    }
    this.emit({ type: 'shoot', x, y, dir: p.face, heavy });
  }

  // ---- contacts

  private heroContacts(dt: number): void {
    const p = this.p;
    if (p.state === 'dead' || p.state === 'win') return;
    const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y0 = p.y, y1 = p.y + p.h;
    // foes
    for (const f of this.foes) {
      if (f.state === 'dead' || f.state === 'spawn' || FOE[f.kind].touch <= 0) continue;
      // only a charging walker, a diving drone and the boss hurt by touch
      if (!(f.kind === 'boss' && f.state !== 'vent') && !(f.state === 'act' && (f.kind === 'walker' || f.kind === 'drone'))) continue;
      if (overlap(x0, y0, x1, y1, f.x - f.w / 2 + 0.1, f.y + 0.05, f.x + f.w / 2 - 0.1, f.y + f.h - 0.05)) {
        if (p.state === 'attack' && (p.atk?.kind === 'lunge' || p.atk?.kind === 'iaido')) continue;
        this.hurt(f.kind === 'boss' ? 1 : FOE[f.kind].touch, f.x < p.x ? 1 : -1);
      }
    }
    // hazards
    for (const h of this.hazards) {
      if (h.phase !== 'on') continue;
      const [hx0, hy0, hx1, hy1] = hazardBox(h);
      if (overlap(x0, y0, x1, y1, hx0, hy0, hx1, hy1)) {
        this.hurt(1, p.x < h.x + 0.5 ? -1 : 1);
        if (h.kind === 'steam') p.vy = Math.max(p.vy, 9);
      }
    }
    // falling ledges start shaking under the hero
    if (p.ground) {
      for (const xx of [x0 + 0.05, x1 - 0.05]) {
        const f = this.fallerAt.get(Math.floor(p.y - 0.05) * this.W + Math.floor(xx));
        if (f && f.state === 'idle') { f.state = 'shake'; f.t = 0; this.emit({ type: 'fall', f }); }
      }
      // the last safe place (solid ground, nothing dangerous near)
      if (this.p.state !== 'roll' && this.safeAt(p.x, p.y)) p.lastSafe = { x: p.x, y: p.y };
    }
    // pickups
    const mr = this.magnetR();
    for (const k of this.picks) {
      if (k.taken) continue;
      const dx = p.x - k.x, dy = p.y + 0.7 - k.y, d = Math.hypot(dx, dy);
      if ((k.kind === 'gear' || (k.kind === 'chip' && this.run.ranks.magnet >= 2)) && d < mr && d > 0.01) {
        const pull = Math.min(d, 14 * dt * (1 + (mr - d)));
        k.x += dx / d * pull; k.y += dy / d * pull; k.loose = false;
      }
      if (Math.abs(dx) < 0.7 && Math.abs(dy) < 1.0) this.take(k);
    }
    // props: checkpoints and the exit
    for (const pr of this.props) {
      if (Math.abs(pr.x - p.x) > 0.8 || Math.abs(pr.y - p.y) > 1.5) continue;
      if (pr.kind === 'checkpoint' && !pr.on) {
        pr.on = true;
        this.check = { x: pr.x, y: pr.y };
        p.shield = this.run.ranks.armor >= 3;
        this.emit({ type: 'checkpoint', x: pr.x, y: pr.y, first: this.checkFirst });
        // the level's first checkpoint banks an implant pick; play goes on
        if (this.checkFirst && !this.demo) { this.run.picks++; this.emit({ type: 'implant', x: pr.x, y: pr.y }); }
        this.checkFirst = false;
      } else if (pr.kind === 'exit' && this.exitOpen && !this.cleared) {
        this.cleared = true;
        p.state = 'win';
        p.t = 0;
        p.vx = 0;
        p.face = 1;
        this.emit({ type: 'clear' });
      }
    }
  }

  private safeAt(x: number, y: number): boolean {
    const yy = Math.floor(y - 0.05);
    if (!this.solid(Math.floor(x - 0.3), yy) || !this.solid(Math.floor(x + 0.3), yy)) return false;
    for (const h of this.hazards) if (Math.abs(h.x + 0.5 - x) < 2.2 && y >= h.y0 - 1 && y <= h.y1) return false;
    for (const f of this.foes) if (f.state !== 'dead' && Math.abs(f.x - x) < 2.5 && Math.abs(f.y - y) < 2) return false;
    return true;
  }

  private take(k: Pickup): void {
    const p = this.p;
    k.taken = true;
    switch (k.kind) {
      case 'gear': {
        const n = this.run.ranks.magnet >= 3 ? 2 : 1;
        this.gears += n;
        this.addScore(SCORE.gear * n, k.x, k.y, false);
        break;
      }
      case 'chip':
        if (k.idx >= 0) this.chips[k.idx] = true;
        this.addScore(SCORE.chip, k.x, k.y, false);
        this.emit({ type: 'chip', idx: k.idx, x: k.x, y: k.y });
        return;
      case 'health': p.hp = Math.min(p.maxHp, p.hp + 1); this.emit({ type: 'heal', n: 1 }); break;
      case 'heart': this.run.hearts++; p.maxHp = this.maxHp(); p.hp = p.maxHp; this.emit({ type: 'heal', n: 9 }); break;
      case 'tank': p.coolant = GUN.coolantTime; p.heat = 0; p.hot = false; this.emit({ type: 'coolant' }); break;
    }
    this.emit({ type: 'pickup', kind: k.kind, x: k.x, y: k.y, n: 1 });
  }

  hurt(dmg: number, dir: number): void {
    const p = this.p;
    if (p.iframes > 0 || p.state === 'dead' || p.state === 'win') return;
    if (p.state === 'roll' || p.state === 'dash') return;
    // the menu's backdrop and the store-art stage: untouchable
    if (this.demo) { p.iframes = 0.3; return; }
    if (p.shield || (this.has('reflex') && !this.reflexUsed)) {
      if (p.shield) p.shield = false; else this.reflexUsed = true;
      p.iframes = 0.8;
      this.emit({ type: 'blocked', x: p.x, y: p.y + 1 });
      return;
    }
    const armoured = p.state === 'charge';
    const d = armoured ? Math.max(0.5, dmg * 0.5) : dmg;
    if (!this.demo) p.hp -= d;
    this.hits++;
    this.combo = 0;
    this.comboT = 0;
    this.lastFight = this.time;
    p.iframes = MOVE.hurtIframes;
    this.emit({ type: 'hurt', dmg: d, x: p.x, y: p.y + 1 });
    if (p.hp <= 0) {
      if (p.secondHeart) { p.secondHeart = false; p.hp = 1; this.emit({ type: 'secondHeart' }); return; }
      this.die();
      return;
    }
    if (!armoured) {
      p.state = 'hurt';
      p.t = 0;
      p.atk = null;
      p.vx = dir * MOVE.knock;
      p.vy = Math.max(p.vy, 5);
      p.ground = false;
    }
  }
  private reflexUsed = false;

  private die(): void {
    const p = this.p;
    p.state = 'dead';
    p.deadT = 0;
    p.hp = 0;
    p.atk = null;
    p.vy = 6;
    p.vx = -p.face * 3;
    this.deaths++;
    this.emit({ type: 'die' });
  }

  private respawn(): void {
    const p = this.p;
    this.run.lives--;
    if (this.run.lives <= 0 && !this.demo) {
      this.run.lives = 0;
      this.over = true;
      this.emit({ type: 'gameOver' });
      return;
    }
    if (this.demo) this.run.lives = Math.max(1, this.run.lives);
    this.placeHero(this.check.x, this.check.y);
    this.emit({ type: 'respawn' });
  }

  /** Puts the hero at a checkpoint, full health, foes' shots cleared (respawn, rewarded continue). */
  placeHero(x: number, y: number): void {
    const p = this.p;
    Object.assign(p, { x, y, vx: 0, vy: 0, state: 'idle', t: 0, h: MOVE.h, atk: null, hp: this.maxHp(), maxHp: this.maxHp(), iframes: 2, heat: 0, hot: false, ground: true, deadT: 0, hangT: 0, airAtk: 0, chain: 0, chainT: 0 });
    this.cuts.length = 0;
    p.lastSafe = { x, y };
    p.shield = this.run.ranks.armor >= 3;
    for (const s of this.shots) if (!s.hero) s.life = 0;
    this.waves = this.waves.filter((w) => w.hero);
    // foes right on the checkpoint step back
    for (const f of this.foes) if (f.state !== 'dead' && !FOE[f.kind].fixed && f.kind !== 'boss' && Math.abs(f.x - x) < 4) { f.x = x + (f.x < x ? -4 : 4); f.homeX = f.x; }
  }

  /** The rewarded continue: one more life at the checkpoint. */
  revive(): void {
    this.over = false;
    this.run.lives = 1;
    this.placeHero(this.check.x, this.check.y);
    this.p.iframes = 3;
    this.emit({ type: 'respawn' });
  }

  private pitFall(): void {
    const p = this.p;
    if (p.state === 'dead') {
      p.deadT = Math.max(p.deadT, 1.6);
      return;
    }
    this.emit({ type: 'pit' });
    const dmg = this.has('gravAnchor') ? 0 : this.tune.pitDamage;
    if (!this.demo) p.hp -= dmg;
    this.hits += dmg > 0 ? 1 : 0;
    if (p.hp <= 0) { this.die(); p.y = -4; p.deadT = 1.6; return; }
    Object.assign(p, { x: p.lastSafe.x, y: p.lastSafe.y, vx: 0, vy: 0, state: 'idle', iframes: 1.2, atk: null, h: MOVE.h });
  }

  // ---------------------------------------------------------------- physics (bodies on the grid)

  private physics(dt: number, gravity: boolean): void {
    const p = this.p;
    if (gravity) p.vy = Math.max(-MOVE.maxFall, p.vy - MOVE.gravity * dt * (p.hangT > 0 ? AIR_HANG_GRAVITY : 1));
    const r = this.moveBody(p, p.vx * dt, p.vy * dt, p.dropT > 0);
    if (r.hitX) p.vx = 0;
    p.ground = r.ground;
    if (r.ground || r.hitY) p.vy = r.ground ? 0 : Math.min(p.vy, 0);
  }

  /** Moves a body (centre x, bottom y) through the grid, x then y. */
  moveBody(b: { x: number; y: number; w: number; h: number }, dx: number, dy: number, drop = false): { hitX: boolean; hitY: boolean; ground: boolean } {
    let hitX = false, hitY = false, ground = false;
    const hw = b.w / 2;
    // x, in steps no longer than a cell
    const sx = Math.ceil(Math.abs(dx) / 0.45) || 1;
    for (let i = 0; i < sx; i++) {
      const nx = b.x + dx / sx;
      const edge = dx > 0 ? nx + hw : nx - hw;
      const cx = Math.floor(edge);
      let blocked = false;
      for (let yy = Math.floor(b.y + 0.02); yy <= Math.floor(b.y + b.h - 0.02); yy++) if (this.solid(cx, yy)) { blocked = true; break; }
      if (blocked) { b.x = dx > 0 ? cx - hw - 0.001 : cx + 1 + hw + 0.001; hitX = true; break; }
      b.x = nx;
    }
    const sy = Math.ceil(Math.abs(dy) / 0.45) || 1;
    for (let i = 0; i < sy; i++) {
      const ny = b.y + dy / sy;
      if (dy < 0) {
        const cy = Math.floor(ny);
        let landed = false;
        for (const xx of [b.x - hw + 0.02, b.x, b.x + hw - 0.02]) {
          const cx = Math.floor(xx);
          if (this.solid(cx, cy) || (!drop && this.oneway(cx, cy) && b.y >= cy + 1 - 0.02)) { landed = true; break; }
        }
        if (landed) { b.y = cy + 1; ground = true; hitY = true; break; }
      } else if (dy > 0) {
        const cy = Math.floor(ny + b.h);
        let bump = false;
        for (const xx of [b.x - hw + 0.02, b.x + hw - 0.02]) if (this.solid(Math.floor(xx), cy)) { bump = true; break; }
        if (bump) { b.y = cy - b.h - 0.001; hitY = true; break; }
      }
      b.y = ny;
    }
    // resting on the ground: probe just below
    if (!ground && dy <= 0) {
      const cy = Math.floor(b.y - 0.02);
      if (b.y - cy < 1.03) for (const xx of [b.x - hw + 0.02, b.x, b.x + hw - 0.02]) {
        const cx = Math.floor(xx);
        if ((this.solid(cx, cy) || (!drop && this.oneway(cx, cy))) && Math.abs(b.y - (cy + 1)) < 0.03) { ground = true; break; }
      }
    }
    return { hitX, hitY, ground };
  }

  // ---------------------------------------------------------------- damage

  damage(f: Foe, dmg: number, how: 'melee' | 'shot' | 'wave' | 'blast' | 'volt', kind: AtkKind | null, knock: number): void {
    if (f.state === 'dead' || f.state === 'spawn') return;
    this.lastFight = this.time;
    let d = dmg;
    let broken = false;
    if (f.maxArmour > 0 && f.armour > 0) {
      // armour: the cleave breaks it at once, finishers twice as fast, the rest chips it
      const chip = kind === 'cleave' ? 99 : kind === 'slash' || kind === 'lunge' || kind === 'slam' || kind === 'iaido' || kind === 'air3' || kind === 'dive' || kind === 'burst' ? dmg * 2 : dmg;
      f.armour = Math.max(0, f.armour - chip);
      d = dmg * 0.25;
      if (f.armour <= 0) {
        broken = true;
        f.state = 'stun';
        f.t = 2.4;
        f.move = 'stun';
        this.emit({ type: 'armour', foe: f, broken: true });
      } else this.emit({ type: 'armour', foe: f, broken: false });
    } else if (f.state === 'stun') d *= 1.5;
    if (f.kind === 'boss' && f.state === 'vent') d *= 1.5;
    f.hp -= d;
    f.flash = 0.12;
    this.combo++;
    this.comboT = COMBO_TIME * (this.has('neonStreak') ? 1.6 : 1);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (this.combo >= 2) this.emit({ type: 'combo', n: this.combo });
    const big = (!!kind && !!FINISHER[kind]) || broken;
    this.emit({ type: 'hit', foe: f, dmg: d, x: f.x, y: f.y + f.h * 0.7, big, name: kind ? FINISHER[kind] ?? null : null });
    // knockback and flinch (not the fixed ones, the boss or an armoured brute)
    const def = FOE[f.kind];
    if (!def.fixed && f.kind !== 'boss' && !(f.maxArmour > 0 && f.armour > 0)) {
      f.vx = knock * (f.kind === 'brute' ? 0.4 : 1);
      if (kind === 'lunge' && LIGHT.includes(f.kind)) f.vy = 9;
      if (f.state !== 'stun' && f.juggle <= 0) { f.flinch = 0.3; if (f.state === 'tell' && how !== 'shot') { f.state = 'recover'; f.t = 0.5; } }
    }
    if (f.hp <= 0) this.kill(f);
  }

  private kill(f: Foe): void {
    f.state = 'dead';
    f.dead = 0;
    f.hp = 0;
    this.kills++;
    const def = FOE[f.kind];
    const sc = Math.round((f.spawned ? def.score / 2 : def.score) * comboMult(this.combo));
    this.addScore(sc, f.x, f.y + f.h, true);
    this.emit({ type: 'kill', foe: f, score: sc });
    let g = f.spawned ? 0 : def.gears;
    if (this.has('bounty')) g += 1;
    for (let i = 0; i < g; i++) this.pick('gear', f.x, f.y + f.h * 0.6, -1, true, (this.rnd() - 0.5) * 6, 5 + this.rnd() * 4);
    if (this.has('vampire') && ++this.killsForHeal >= 12) { this.killsForHeal = 0; this.p.hp = Math.min(this.p.maxHp, this.p.hp + 1); this.emit({ type: 'heal', n: 1 }); }
    if (f.kind === 'tele') for (const k of this.foes) if (k.spawned && k.state === 'spawn') k.state = 'dead';
    if (f.kind === 'boss') {
      this.bossOn = false;
      this.exitOpen = true;
      this.addScore(SCORE.boss, f.x, f.y + 3, false);
      this.emit({ type: 'bossDown', x: f.x, y: f.y });
      for (const k of this.foes) if (k !== f && k.state !== 'dead') { k.state = 'dead'; k.dead = 0; this.emit({ type: 'kill', foe: k, score: 0 }); }
      for (const s of this.shots) if (!s.hero) s.life = 0;
      this.marks.length = 0;
    }
  }

  addScore(n: number, x: number, y: number, pop: boolean): void {
    this.score += n;
    if (pop) this.emit({ type: 'score', n, x, y });
  }

  /** An explosion: hurts foes (and the hero unless it is the hero's own vent). */
  blast(x: number, y: number, r: number, dmg: number, heroOwned = false): void {
    this.emit({ type: 'boom', x, y, r });
    for (const f of this.foes) {
      if (f.state === 'dead') continue;
      if (Math.hypot(f.x - x, f.y + f.h / 2 - y) < r + f.w / 2) this.damage(f, dmg, 'blast', null, Math.sign(f.x - x) * 6);
    }
    for (const pr of this.props) if ((pr.kind === 'barrel' || pr.kind === 'lootbox') && Math.hypot(pr.x - x, pr.y + 0.4 - y) < r) this.hitProp(pr);
    const p = this.p;
    if (!heroOwned && Math.hypot(p.x - x, p.y + 0.7 - y) < r * 0.8) this.hurt(1, p.x < x ? -1 : 1);
  }

  private hitProp(pr: Prop): void {
    if (pr.kind === 'lever' && !pr.on) {
      pr.on = true;
      this.emit({ type: 'lever', x: pr.x, y: pr.y });
      const g = this.gates[pr.link];
      if (g && !g.open) { g.open = true; g.t = 0; this.emit({ type: 'gate', gate: g }); }
    } else if (pr.kind === 'lootbox' && !pr.on) {
      pr.hp--;
      if (pr.hp > 0) return;
      pr.on = true;
      this.emit({ type: 'loot', x: pr.x, y: pr.y });
      const n = (4 + Math.floor(this.rnd() * 4)) * (this.has('luckyLoot') ? 2 : 1);
      for (let i = 0; i < n; i++) this.pick('gear', pr.x, pr.y + 0.6, -1, true, (this.rnd() - 0.5) * 5, 5 + this.rnd() * 4);
      if (this.p.hp < this.p.maxHp || this.rnd() < 0.3) this.pick('health', pr.x, pr.y + 0.8, -1, true, 0, 6);
    } else if (pr.kind === 'barrel' && !pr.on) {
      pr.on = true;
      pr.t = 0.4;
    }
  }

  // ---------------------------------------------------------------- foes

  private updateFoes(dt: number): void {
    const p = this.p;
    // the boss fight starts as the hero walks in
    if (this.boss && !this.bossOn && this.boss.state !== 'dead' && p.x > 9) {
      this.bossOn = true;
      this.boss.state = 'tell';
      this.boss.move = 'intro';
      this.boss.t = 1.6;
      this.emit({ type: 'bossStart' });
    }
    for (const f of this.foes) {
      if (f.flash > 0) f.flash -= dt;
      if (f.state === 'dead') {
        f.dead += dt;
        // a wreck thrown into the air falls (a launched or spiked foe, a shot-down drone)
        if (!FOE[f.kind].fixed && f.kind !== 'boss' && !f.ground && f.dead < 2) {
          f.vy = Math.max(-MOVE.maxFall, f.vy - MOVE.gravity * dt);
          f.vx *= Math.pow(0.3, dt);
          const r = this.moveBody(f, f.vx * dt, f.vy * dt);
          f.ground = r.ground;
          if (r.ground) { f.vy = 0; f.vx = 0; }
        }
        continue;
      }
      // sleep far from the hero (not the boss)
      if (f.kind !== 'boss' && Math.abs(f.x - p.x) > 22) continue;
      if (f.state === 'spawn') { f.t -= dt; if (f.t <= 0) { f.state = 'patrol'; f.t = 0.5; } continue; }
      if (f.flinch > 0) f.flinch -= dt;
      if (f.juggle > 0) { this.juggled(f, dt); continue; }
      switch (f.kind) {
        case 'walker': this.aiWalker(f, dt); break;
        case 'gunner': this.aiGunner(f, dt); break;
        case 'drone': this.aiDrone(f, dt); break;
        case 'gdrone': this.aiGunDrone(f, dt); break;
        case 'brute': this.aiBrute(f, dt); break;
        case 'turret': case 'double': case 'cannon': this.aiTurret(f, dt); break;
        case 'tele': this.aiTele(f, dt); break;
        case 'boss': this.aiBoss(f, dt); break;
      }
      // ground foes fall and collide; flying ones float
      if (!FOE[f.kind].flies && !FOE[f.kind].fixed) {
        f.vy = Math.max(-MOVE.maxFall, f.vy - MOVE.gravity * dt);
        const r = this.moveBody(f, f.vx * dt, f.vy * dt);
        f.ground = r.ground;
        if (r.ground) f.vy = 0;
        if (r.hitX && f.kind !== 'boss') f.face = (f.face * -1) as 1 | -1;
        if (f.y < -6) { f.hp = 0; this.kill(f); }
      } else if (FOE[f.kind].flies) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
      }
    }
    this.foes = this.foes.filter((f) => f.state !== 'dead' || f.dead < 3);
  }

  /** A thrown foe: light gravity, no AI; a spiked one crashes into the ground. */
  private juggled(f: Foe, dt: number): void {
    f.juggle -= dt;
    f.vx *= Math.pow(0.25, dt);
    f.vy = Math.max(-MOVE.maxFall, f.vy - MOVE.gravity * JUGGLE_GRAVITY * dt);
    const vy = f.vy;
    const r = this.moveBody(f, f.vx * dt, f.vy * dt);
    if (r.hitX) f.vx = 0;
    f.ground = r.ground;
    if (r.ground) {
      f.vy = 0;
      if (vy < -9) {
        // spiked into the roof
        this.emit({ type: 'crash', x: f.x, y: f.y });
        this.damage(f, 1.5 * this.meleeMult(f), 'wave', null, 0);
        f.juggle = Math.min(f.juggle, 0.35);
      } else f.juggle = Math.min(f.juggle, 0.12);
    } else if (r.hitY) f.vy = Math.min(0, f.vy);
    if (f.y < -6 && f.state !== 'dead') { f.hp = 0; this.kill(f); return; }
    if (f.juggle <= 0 && f.state !== 'dead') {
      f.juggle = 0;
      f.state = 'recover';
      f.t = 0.45;
      if (FOE[f.kind].flies) { f.vx = 0; f.vy = 0; }
    }
  }

  private faceHero(f: Foe): void { f.face = (this.p.x > f.x ? 1 : -1) as 1 | -1; }
  private sees(f: Foe, range: number, dy = 2.5): boolean {
    const p = this.p;
    if (p.state === 'dead') return false;
    return Math.abs(p.x - f.x) < range && Math.abs(p.y - f.y) < dy;
  }
  private edgeAhead(f: Foe): boolean {
    const x = Math.floor(f.x + f.face * (f.w / 2 + 0.2));
    const y = Math.floor(f.y - 0.1);
    return !this.standable(x, y) || this.solid(x, Math.floor(f.y + 0.3));
  }
  private tellTime(base: number): number { return base * this.tune.tell * DISTRICT_SCALE.tell[this.L.district]; }
  private cd(base: number): number { return base * this.tune.cooldown * DISTRICT_SCALE.cooldown[this.L.district]; }

  private aiWalker(f: Foe, dt: number): void {
    f.t -= dt;
    if (f.flinch > 0) { f.vx *= 0.9; return; }
    switch (f.state) {
      case 'patrol':
      case 'idle': {
        f.vx = f.face * 1.6;
        if (f.ground && this.edgeAhead(f)) { f.face = (f.face * -1) as 1 | -1; f.vx = 0; }
        if (this.sees(f, 7.5, 1.6) && f.t <= 0) {
          this.faceHero(f);
          f.state = 'tell'; f.move = 'charge'; f.t = this.tellTime(0.55); f.vx = 0;
          this.emit({ type: 'tell', foe: f, move: 'charge' });
        }
        break;
      }
      case 'tell': f.vx = 0; if (f.t <= 0) { f.state = 'act'; f.t = 1.2; } break;
      case 'act': {
        f.vx = f.face * 8.2 / Math.sqrt(this.tune.cooldown);
        if (f.t <= 0 || (f.ground && this.edgeAhead(f))) { f.state = 'recover'; f.t = this.cd(0.9); f.vx = 0; }
        break;
      }
      case 'recover': f.vx *= 0.8; if (f.t <= 0) { f.state = 'patrol'; f.t = this.cd(0.8); } break;
      case 'stun': f.vx *= 0.9; if (f.t <= 0) f.state = 'patrol'; break;
    }
  }

  private aiGunner(f: Foe, dt: number): void {
    f.t -= dt;
    if (f.flinch > 0) { f.vx *= 0.9; return; }
    switch (f.state) {
      case 'patrol':
      case 'idle': {
        f.vx = f.face * 1.0;
        if (f.ground && this.edgeAhead(f)) { f.face = (f.face * -1) as 1 | -1; f.vx = 0; }
        if (this.sees(f, 11, 3.5) && f.t <= 0) {
          this.faceHero(f);
          f.state = 'tell'; f.move = 'aim'; f.t = this.tellTime(0.75); f.vx = 0;
          f.aim = { x: this.p.x, y: this.p.y + 0.8 };
          this.emit({ type: 'tell', foe: f, move: 'aim' });
        }
        break;
      }
      case 'tell': {
        f.vx = 0;
        this.faceHero(f);
        if (f.t > 0.2) f.aim = { x: this.p.x, y: this.p.y + 0.8 };
        if (f.t <= 0) {
          this.foeShot(f, f.x + f.face * 0.7, f.y + 1.0, f.aim!.x, f.aim!.y, 11);
          // from the third district on, a second bolt follows
          f.shots++;
          if (this.L.district >= 2 && f.shots < 2) { f.t = 0.22; break; }
          f.shots = 0;
          f.state = 'recover'; f.t = this.cd(1.5); f.aim = null;
        }
        break;
      }
      case 'recover': if (f.t <= 0) { f.state = 'patrol'; f.t = 0.3; } break;
      case 'stun': f.vx *= 0.9; if (f.t <= 0) f.state = 'patrol'; break;
    }
  }

  private aiDrone(f: Foe, dt: number): void {
    f.t -= dt;
    f.bob += dt;
    const p = this.p;
    switch (f.state) {
      case 'patrol':
      case 'idle': {
        const tx = f.homeX + Math.sin(f.bob * 0.7) * 2, ty = f.homeY + Math.sin(f.bob * 1.9) * 0.3;
        f.vx = (tx - f.x) * 2; f.vy = (ty - f.y) * 2;
        if (f.flinch > 0) { f.vx *= 0.3; f.vy *= 0.3; }
        if (this.sees(f, 8, 6) && f.t <= 0) {
          this.faceHero(f);
          f.state = 'tell'; f.move = 'dive'; f.t = this.tellTime(0.65);
          f.aim = { x: p.x, y: p.y + 0.6 };
          this.emit({ type: 'tell', foe: f, move: 'dive' });
        }
        break;
      }
      case 'tell': {
        f.vx *= 0.8; f.vy = 1.6;
        if (f.t > 0.25) f.aim = { x: p.x, y: p.y + 0.6 };
        if (f.t <= 0) {
          const dx = f.aim!.x - f.x, dy = f.aim!.y - f.y, d = Math.max(0.1, Math.hypot(dx, dy));
          const sp = 12 / Math.sqrt(this.tune.cooldown);
          f.vx = dx / d * sp; f.vy = dy / d * sp;
          f.state = 'act'; f.t = Math.min(1.1, d / sp + 0.25);
        }
        break;
      }
      case 'act': {
        if (f.t <= 0 || f.y < 0.5 || this.solid(Math.floor(f.x), Math.floor(f.y))) { f.state = 'recover'; f.t = this.cd(1.3); f.aim = null; }
        break;
      }
      case 'recover': {
        f.vx = (f.homeX - f.x) * 1.5; f.vy = (f.homeY - f.y) * 1.5;
        if (f.t <= 0) { f.state = 'patrol'; f.t = this.cd(0.6); }
        break;
      }
      case 'stun': f.vx *= 0.9; f.vy = -1; if (f.t <= 0) f.state = 'recover'; break;
    }
    if (f.flinch > 0 && f.state !== 'act') { f.vx += (f.x < p.x ? -1 : 1) * 2; }
  }

  private aiGunDrone(f: Foe, dt: number): void {
    f.t -= dt;
    f.bob += dt;
    const p = this.p;
    const side = p.x > f.homeX ? -1 : 1;
    switch (f.state) {
      case 'patrol':
      case 'idle':
      case 'recover': {
        const near = this.sees(f, 13, 7);
        const tx = near ? Phaser_clamp(p.x + side * 6, f.homeX - 6, f.homeX + 6) : f.homeX + Math.sin(f.bob * 0.6) * 1.5;
        const ty = near ? Math.max(f.homeY - 1, p.y + 3.2) + Math.sin(f.bob * 2.1) * 0.3 : f.homeY + Math.sin(f.bob * 2) * 0.3;
        f.vx = (tx - f.x) * 1.6; f.vy = (ty - f.y) * 1.6;
        if (near) this.faceHero(f);
        if (near && f.t <= 0) {
          f.state = 'tell'; f.move = 'aim'; f.t = this.tellTime(0.65);
          f.aim = { x: p.x, y: p.y + 0.8 };
          this.emit({ type: 'tell', foe: f, move: 'aim' });
        }
        break;
      }
      case 'tell': {
        f.vx *= 0.85; f.vy *= 0.85;
        this.faceHero(f);
        if (f.t > 0.2) f.aim = { x: p.x, y: p.y + 0.8 };
        if (f.t <= 0) {
          this.foeShot(f, f.x + f.face * 0.5, f.y + 0.3, f.aim!.x, f.aim!.y, 10);
          f.state = 'recover'; f.t = this.cd(1.7); f.aim = null;
        }
        break;
      }
      case 'stun': f.vx *= 0.9; if (f.t <= 0) f.state = 'recover'; break;
    }
  }

  private aiBrute(f: Foe, dt: number): void {
    f.t -= dt;
    const p = this.p;
    switch (f.state) {
      case 'patrol':
      case 'idle': {
        f.vx = f.face * 1.2;
        if (f.ground && this.edgeAhead(f)) { f.face = (f.face * -1) as 1 | -1; f.vx = 0; }
        if (this.sees(f, 9, 2)) { this.faceHero(f); f.vx = f.face * 1.8; }
        if (this.sees(f, 4.2, 2) && f.t <= 0) {
          this.faceHero(f);
          f.state = 'tell'; f.move = 'slam'; f.t = this.tellTime(0.8); f.vx = 0;
          this.emit({ type: 'tell', foe: f, move: 'slam' });
        }
        break;
      }
      case 'tell': f.vx = 0; if (f.t <= 0) {
        // the slam: a hit in front and shockwaves along the ground
        f.state = 'act'; f.t = 0.35;
        this.emit({ type: 'foeFire', foe: f, move: 'slam' });
        const x0 = f.face > 0 ? f.x : f.x - 2.4, x1 = f.face > 0 ? f.x + 2.4 : f.x;
        if (overlap(x0, f.y, x1, f.y + 2, p.x - p.w / 2, p.y, p.x + p.w / 2, p.y + p.h)) this.hurt(1, f.face);
        this.wave(f.x + f.face * 1.4, f.y, f.face, 1, false, 9, 0.7);
        this.emit({ type: 'boom', x: f.x + f.face * 1.4, y: f.y + 0.2, r: 1.2 });
      }
        break;
      case 'act': if (f.t <= 0) { f.state = 'recover'; f.t = this.cd(1.1); } break;
      case 'recover': f.vx *= 0.8; if (f.t <= 0) { f.state = 'patrol'; f.t = this.cd(0.6); } break;
      case 'stun': {
        f.vx *= 0.85;
        if (f.t <= 0) { f.state = 'patrol'; f.armour = f.maxArmour; f.t = 0.4; this.emit({ type: 'armour', foe: f, broken: false }); }
        break;
      }
    }
  }

  private aiTurret(f: Foe, dt: number): void {
    f.t -= dt;
    const p = this.p;
    const range = f.kind === 'cannon' ? 15 : 12.5;
    switch (f.state) {
      case 'patrol':
      case 'idle':
        if (this.sees(f, range, 7) && f.t <= 0) {
          this.faceHero(f);
          f.state = 'tell';
          f.move = f.kind === 'cannon' ? 'lob' : 'aim';
          f.t = this.tellTime(f.kind === 'cannon' ? 0.95 : 0.65);
          f.shots = 0;
          if (f.kind === 'cannon') {
            const gy = this.groundBelow(p.x, p.y + 0.5);
            f.aim = { x: p.x, y: gy };
            this.marks.push({ id: this.nextId++, x: p.x, y: gy, t: f.t + 0.9, r: 1.4 });
          } else f.aim = { x: p.x, y: p.y + 0.8 };
          this.emit({ type: 'tell', foe: f, move: f.move });
        }
        break;
      case 'tell':
        this.faceHero(f);
        if (f.kind !== 'cannon' && f.t > 0.15) f.aim = { x: p.x, y: p.y + 0.8 };
        if (f.t <= 0) { f.state = 'act'; f.t = 0; }
        break;
      case 'act': {
        if (f.t > 0) break;
        const ox = f.x + f.face * 0.5, oy = f.y + 0.6;
        if (f.kind === 'cannon') {
          // a shell lobbed onto the mark
          const a = f.aim!;
          const tt = 0.9;
          const vx = (a.x - ox) / tt, vy = (a.y - oy + 0.5 * MOVE.gravity * 0.5 * tt * tt) / tt;
          this.shots.push({ id: this.nextId++, kind: 'shell', hero: false, x: ox, y: oy, vx, vy, dmg: 1, life: 3, pierce: 0, hit: new Set(), r: 0.3, bounce: 0, tx: a.x, ty: a.y });
          this.emit({ type: 'foeFire', foe: f, move: 'lob' });
          f.state = 'recover'; f.t = this.cd(2.3);
        } else if (f.kind === 'turret') {
          this.foeShot(f, ox, oy, f.aim!.x, f.aim!.y, 12);
          f.shots++;
          f.t = 0.13;
          if (f.shots >= 3) { f.state = 'recover'; f.t = this.cd(1.8); }
        } else {
          for (const dy of [-0.25, 0.25]) this.foeShot(f, ox, oy + dy, f.aim!.x, f.aim!.y + dy, 12);
          f.shots++;
          f.t = 0.45;
          if (f.shots >= 2) { f.state = 'recover'; f.t = this.cd(1.6); }
        }
        break;
      }
      case 'recover': if (f.t <= 0) { f.state = 'patrol'; f.t = 0; f.aim = null; } break;
      case 'stun': if (f.t <= 0) f.state = 'patrol'; break;
    }
  }

  private aiTele(f: Foe, dt: number): void {
    f.t -= dt;
    f.kids = this.foes.filter((k) => k.spawned && k.state !== 'dead' && Math.abs(k.homeX - f.x) < 1).length;
    if (f.state === 'patrol' || f.state === 'idle' || f.state === 'recover') {
      if (f.t <= 0 && f.kids < 2 && this.sees(f, 15, 8)) {
        f.state = 'tell'; f.move = 'warp'; f.t = this.tellTime(1.0);
        this.emit({ type: 'tell', foe: f, move: 'warp' });
      }
    } else if (f.state === 'tell' && f.t <= 0) {
      const kind: FoeKind = f.shots % 2 === 0 ? 'walker' : 'drone';
      f.shots++;
      const k = this.spawn(kind, f.x, f.y + (kind === 'drone' ? 1.8 : 0.3), true);
      k.homeX = f.x;
      k.face = (this.p.x > f.x ? 1 : -1) as 1 | -1;
      this.emit({ type: 'spawn', foe: k });
      f.state = 'recover';
      f.t = this.cd(5.5);
    }
  }

  // ---- the boss: a mech with three phases

  private aiBoss(f: Foe, dt: number): void {
    f.t -= dt;
    const p = this.p;
    const d = this.L.district;
    if (!this.bossOn) return;
    const phase = f.hp > f.maxHp * 0.66 ? 1 : f.hp > f.maxHp * 0.33 ? 2 : 3;
    if (phase !== this.bossPhase) { this.bossPhase = phase; this.emit({ type: 'bossPhase', phase }); }
    const speed = 1 + (phase - 1) * 0.18 + d * 0.06;
    switch (f.state) {
      case 'patrol':
      case 'idle': {
        // walk to keep 5–9 m from the hero, then attack
        this.faceHero(f);
        const dx = p.x - f.x;
        f.vx = Math.abs(dx) > 9 ? Math.sign(dx) * 2.2 * speed : Math.abs(dx) < 5 ? -Math.sign(dx) * 1.6 : 0;
        if (f.t <= 0) this.bossPick(f, phase);
        break;
      }
      case 'tell': {
        f.vx = 0;
        if (f.move === 'volley' || f.move === 'laserLow' || f.move === 'laserHigh') this.faceHero(f);
        if (f.move === 'volley' && f.t > 0.25) f.aim = { x: p.x, y: p.y + 0.8 };
        if (f.t <= 0) this.bossAct(f, phase);
        break;
      }
      case 'jump': {
        // the stomp's arc
        if (f.ground && f.t < 0.6) {
          f.state = 'vent'; f.t = this.cd(1.3) / speed; f.move = 'vent';
          this.emit({ type: 'foeFire', foe: f, move: 'stompLand' });
          this.emit({ type: 'boom', x: f.x, y: f.y + 0.2, r: 2.4 });
          this.wave(f.x + 1.6, f.y, 1, d >= 2 ? 2 : 1, false, 9.5, 1.3);
          this.wave(f.x - 1.6, f.y, -1, d >= 2 ? 2 : 1, false, 9.5, 1.3);
          if (Math.abs(p.x - f.x) < 2.2 && p.y < f.y + 1.5) this.hurt(d >= 2 ? 2 : 1, p.x > f.x ? 1 : -1);
        }
        break;
      }
      case 'act': {
        f.vx = 0;
        if (f.move === 'volley' && f.t <= 0 && f.shots > 0) {
          const n = 3 + phase + (d >= 3 ? 1 : 0);
          const ox = f.x + f.face * 1.5, oy = f.y + 2.4;
          const a = Math.atan2(f.aim!.y - oy, f.aim!.x - ox);
          for (let i = 0; i < n; i++) {
            const ang = a + (i - (n - 1) / 2) * 0.17;
            this.foeShotDir(f, ox, oy, Math.cos(ang), Math.sin(ang), 10);
          }
          f.shots--;
          f.t = 0.35;
          if (f.shots <= 0) { f.state = 'vent'; f.t = this.cd(1.1) / speed; f.move = 'vent'; }
        } else if ((f.move === 'laserLow' || f.move === 'laserHigh') && f.t <= 0) {
          f.state = 'vent'; f.t = this.cd(1.2) / speed; f.move = 'vent';
        } else if (f.move === 'laserLow' || f.move === 'laserHigh') {
          // the beam: across the arena at one height
          const y0 = f.y + (f.move === 'laserLow' ? 0.15 : 1.05), y1 = y0 + 0.55;
          const x0 = f.face > 0 ? f.x : 0, x1 = f.face > 0 ? this.W : f.x;
          if (overlap(x0, y0, x1, y1, p.x - p.w / 2, p.y, p.x + p.w / 2, p.y + p.h)) this.hurt(1, f.face);
        } else if (f.move === 'barrage' && f.t <= 0) {
          f.state = 'vent'; f.t = this.cd(0.9) / speed; f.move = 'vent';
        } else if (f.move === 'summon' && f.t <= 0) {
          f.state = 'patrol'; f.t = this.cd(1.4);
        }
        break;
      }
      case 'vent': f.vx = 0; if (f.t <= 0) { f.state = 'patrol'; f.t = this.cd(0.9) / speed; f.move = ''; } break;
    }
  }

  private bossPick(f: Foe, phase: number): void {
    const d = this.L.district;
    const pool: string[] = ['volley', 'stomp'];
    if (phase >= 2) pool.push('barrage');
    if (d >= 1 && phase >= 2) pool.push(this.rnd() < 0.5 ? 'laserLow' : 'laserHigh');
    if (d >= 2 && phase >= 3 && this.foes.filter((k) => k.spawned && k.state !== 'dead').length < 2) pool.push('summon');
    let m = pool[Math.floor(this.rnd() * pool.length)];
    if (m === f.move && pool.length > 1) m = pool[(pool.indexOf(m) + 1) % pool.length];
    f.move = m;
    f.state = 'tell';
    const tell: Record<string, number> = { volley: 0.85, stomp: 0.6, barrage: 0.75, laserLow: 1.0, laserHigh: 1.0, summon: 0.9 };
    f.t = this.tellTime(tell[m]) / (1 + (phase - 1) * 0.1);
    f.aim = { x: this.p.x, y: this.p.y + 0.8 };
    this.emit({ type: 'tell', foe: f, move: m });
  }

  private bossAct(f: Foe, phase: number): void {
    const p = this.p;
    const d = this.L.district;
    switch (f.move) {
      case 'intro': f.state = 'patrol'; f.t = 0.8; f.move = ''; break;
      case 'volley': f.state = 'act'; f.shots = phase >= 3 ? 2 : 1; f.t = 0; this.emit({ type: 'foeFire', foe: f, move: 'volley' }); break;
      case 'stomp': {
        const tx = Phaser_clamp(p.x, 4, this.W - 4);
        const tt = 0.95;
        f.vx = (tx - f.x) / tt;
        f.vy = 0.5 * MOVE.gravity * tt;
        f.ground = false;
        f.state = 'jump';
        f.t = tt + 0.6;
        this.emit({ type: 'foeFire', foe: f, move: 'stomp' });
        break;
      }
      case 'barrage': {
        const n = 3 + phase + d;
        for (let i = 0; i < n; i++) {
          const x = Phaser_clamp(p.x + (i - (n - 1) / 2) * 3.1 + (this.rnd() - 0.5), 2, this.W - 2);
          const y = this.groundBelow(x, 8);
          this.marks.push({ id: this.nextId++, x, y, t: 0.9 + i * 0.12, r: 1.3 });
          const T = 0.9 + i * 0.12;
          this.shots.push({ id: this.nextId++, kind: 'shell', hero: false, x, y: y + 14, vx: 0, vy: (-14 + 0.25 * MOVE.gravity * T * T) / T, dmg: 1, life: 4, pierce: 0, hit: new Set(), r: 0.3, bounce: 0, tx: x, ty: y });
        }
        f.state = 'act'; f.t = 1.3;
        this.emit({ type: 'foeFire', foe: f, move: 'barrage' });
        break;
      }
      case 'laserLow':
      case 'laserHigh':
        f.state = 'act'; f.t = 0.55;
        this.emit({ type: 'foeFire', foe: f, move: f.move });
        break;
      case 'summon': {
        for (const k of [-1, 1]) {
          const kind: FoeKind = k < 0 ? 'walker' : 'drone';
          const fx = Phaser_clamp(f.x + k * 4, 3, this.W - 3);
          const s = this.spawn(kind, fx, this.groundBelow(fx, 6) + (kind === 'drone' ? 2 : 0), true);
          this.emit({ type: 'spawn', foe: s });
        }
        f.state = 'act'; f.t = 0.6;
        this.emit({ type: 'foeFire', foe: f, move: 'summon' });
        break;
      }
      default: f.state = 'patrol'; f.t = 0.5;
    }
  }

  /** The height of the ground under (x, from y down). */
  groundBelow(x: number, y: number): number {
    const cx = Math.floor(x);
    for (let cy = Math.min(this.H - 1, Math.floor(y)); cy >= 0; cy--) if (this.standable(cx, cy)) return cy + 1;
    return 0;
  }

  private foeShot(f: Foe, x: number, y: number, tx: number, ty: number, speed: number): void {
    const dx = tx - x, dy = ty - y, d = Math.max(0.1, Math.hypot(dx, dy));
    this.foeShotDir(f, x, y, dx / d, dy / d, speed);
    this.emit({ type: 'foeFire', foe: f, move: 'shot' });
  }
  private foeShotDir(_f: Foe, x: number, y: number, ux: number, uy: number, speed: number): void {
    const s = speed * this.tune.shotSpeed * DISTRICT_SCALE.shot[this.L.district];
    this.shots.push({ id: this.nextId++, kind: 'foeBolt', hero: false, x, y, vx: ux * s, vy: uy * s, dmg: 1, life: 2.4, pierce: 0, hit: new Set(), r: 0.22, bounce: 0 });
  }

  // ---------------------------------------------------------------- shots, waves, marks

  private updateShots(dt: number): void {
    const p = this.p;
    for (const s of this.shots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.kind === 'shell') s.vy -= MOVE.gravity * 0.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.kind === 'shell') {
        if (s.vy < 0 && s.ty !== undefined && s.y <= s.ty + 0.1) {
          s.life = 0;
          this.emit({ type: 'shell', x: s.x, y: s.ty });
          this.blast(s.x, s.ty + 0.4, 1.35, 3);
        }
        continue;
      }
      // walls stop bolts (the crescent passes ledges)
      if (this.solid(Math.floor(s.x), Math.floor(s.y))) {
        if (s.bounce > 0 && s.hero) { s.bounce--; s.vx = -s.vx; s.x += s.vx * dt * 2; }
        else { s.life = 0; this.emit({ type: 'parry', x: s.x, y: s.y }); continue; }
      }
      if (s.hero) {
        for (const f of this.foes) {
          if (f.state === 'dead' || f.state === 'spawn' || s.hit.has(f.id)) continue;
          if (!overlap(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, f.x - f.w / 2, f.y, f.x + f.w / 2, f.y + f.h)) continue;
          s.hit.add(f.id);
          this.damage(f, s.dmg, 'shot', s.kind === 'crescent' ? 'slash' : null, Math.sign(s.vx) * (s.kind === 'mirror' ? 6 : 2.5));
          if (s.bounce > 0 && s.kind !== 'crescent') {
            // ricochet to the nearest other foe
            s.bounce--;
            let best: Foe | null = null, bd = 9;
            for (const g of this.foes) { if (g === f || g.state === 'dead') continue; const dd = Math.hypot(g.x - s.x, g.y - s.y); if (dd < bd) { bd = dd; best = g; } }
            if (best) { const dx = best.x - s.x, dy = best.y + best.h / 2 - s.y, d = Math.hypot(dx, dy); s.vx = dx / d * GUN.speed; s.vy = dy / d * GUN.speed; s.life = 0.6; continue; }
          }
          if (s.pierce > 0) s.pierce--; else { s.life = 0; break; }
        }
        for (const pr of this.props) {
          if (s.life <= 0 || s.hit.has(pr.id) || pr.kind === 'checkpoint' || pr.kind === 'exit') continue;
          if (overlap(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, pr.x - 0.4, pr.y, pr.x + 0.4, pr.y + 0.9)) { s.hit.add(pr.id); this.hitProp(pr); if (pr.kind !== 'lever') s.life = 0; }
        }
      } else if (overlap(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, p.x - p.w / 2, p.y, p.x + p.w / 2, p.y + p.h)) {
        if (p.iframes > 0 || p.state === 'roll' || p.state === 'dash' || p.state === 'dead') continue;
        s.life = 0;
        this.hurt(s.dmg, Math.sign(s.vx) || 1);
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0 && s.x > -5 && s.x < this.W + 5 && s.y > -8 && s.y < this.H + 10);
  }

  private updateWaves(dt: number): void {
    const p = this.p;
    for (const w of this.waves) {
      w.life -= dt;
      w.x += w.dir * w.speed * dt;
      // a wave runs along the ground it started on and dies at an edge or a wall
      const below = Math.floor(w.y - 0.1);
      if (!this.standable(Math.floor(w.x), below) || this.solid(Math.floor(w.x), Math.floor(w.y + 0.3))) { w.life = 0; continue; }
      if (w.hero) {
        for (const f of this.foes) {
          if (f.state === 'dead' || w.hit.has(f.id) || FOE[f.kind].flies) continue;
          if (Math.abs(f.x - w.x) < f.w / 2 + 0.5 && Math.abs(f.y - w.y) < 1) { w.hit.add(f.id); this.damage(f, w.dmg, 'wave', null, w.dir * 5); }
        }
      } else if (Math.abs(p.x - w.x) < 0.6 && p.y - w.y < 0.6 && p.y >= w.y - 0.3) {
        if (!w.hit.has(0)) { w.hit.add(0); this.hurt(w.dmg, w.dir); }
      }
    }
    this.waves = this.waves.filter((w) => w.life > 0);
  }

  private updateMarks(dt: number): void {
    for (const m of this.marks) m.t -= dt;
    this.marks = this.marks.filter((m) => m.t > 0);
  }

  // ---------------------------------------------------------------- hazards, pickups, props

  private updateHazards(dt: number): void {
    for (const h of this.hazards) {
      const [off, warn, on] = HAZARD[h.kind];
      const c = (this.time + h.off) % (off + warn + on);
      const ph = c < off ? 'off' : c < off + warn ? 'warn' : 'on';
      if (ph !== h.phase) { h.phase = ph; if (Math.abs(h.x - this.p.x) < 16) this.emit({ type: 'hazard', h }); }
    }
    for (const f of this.fallers) {
      f.t += dt;
      if (f.state === 'shake' && f.t > FALL_SHAKE) { f.state = 'fall'; f.t = 0; this.emit({ type: 'fall', f }); }
      else if (f.state === 'fall') { f.dy -= (4 + f.t * 30) * dt; if (f.t > 1.2) { f.state = 'gone'; f.t = 0; } }
      else if (f.state === 'gone' && f.t > FALL_RESPAWN) {
        // back, unless the hero stands in its place
        const p = this.p;
        if (!(p.x > f.x0 - 0.4 && p.x < f.x1 + 0.4 && Math.abs(p.y - (f.y + 1)) < 1.4)) { f.state = 'idle'; f.dy = 0; f.t = 0; this.emit({ type: 'fall', f }); }
      }
    }
    for (const g of this.gates) if (g.open) g.t += dt;
  }

  private updatePicks(dt: number): void {
    for (const k of this.picks) {
      if (k.taken) continue;
      k.t += dt;
      if (!k.loose) continue;
      k.vy -= MOVE.gravity * 0.6 * dt;
      const b = { x: k.x, y: k.y - 0.2, w: 0.3, h: 0.3 };
      const r = this.moveBody(b, k.vx * dt, k.vy * dt);
      k.x = b.x; k.y = b.y + 0.2;
      if (r.hitX) k.vx = -k.vx * 0.4;
      if (r.ground) { k.vy = Math.abs(k.vy) > 3 ? -k.vy * 0.35 : 0; k.vx *= 0.8; if (k.vy === 0 && Math.abs(k.vx) < 0.3) k.loose = false; }
      if (k.y < -6) k.taken = true;
    }
    this.picks = this.picks.filter((k) => !k.taken);
  }

  private updateProps(dt: number): void {
    for (const pr of this.props) {
      if (pr.kind === 'barrel' && pr.on && pr.t > 0) {
        pr.t -= dt;
        if (pr.t <= 0) { pr.t = -1; pr.hp = 0; this.blast(pr.x, pr.y + 0.5, 2.4, 5); }
      }
    }
  }

  // ---------------------------------------------------------------- read-outs

  /** The three stars this clear earns: [finish, chips (no hit on a boss), time]. */
  stars(): [boolean, boolean, boolean] {
    const par = this.L.par + this.tune.parBonus;
    return [true, this.L.boss ? this.hits === 0 : this.chips.every(Boolean), this.time <= par];
  }

  /** The level's score with the clear, time and no-hit bonuses. */
  clearBonus(): { clear: number; time: number; noHit: number } {
    const par = this.L.par + this.tune.parBonus;
    return { clear: SCORE.clear, time: Math.max(0, Math.round((par - this.time) * SCORE.timeBonus)), noHit: this.hits === 0 ? SCORE.noHit : 0 };
  }
}

function overlap(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
}
export function hazardBox(h: Hazard): [number, number, number, number] {
  if (h.kind === 'steam') return [h.x + 0.15, h.y0, h.x + 0.85, h.y1];
  if (h.kind === 'cable') return [h.x + 0.3, h.y0, h.x + 0.7, h.y1];
  return [h.x + 0.35, h.y0, h.x + 0.65, h.y1];
}
function Phaser_clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
