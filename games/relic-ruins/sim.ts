// Relic Ruins: the rules, a pure simulation at a fixed 60 Hz (no Phaser, no three.js), shared by the
// play scene, the menu's live backdrop, the autopilot (bot.ts) and the headless checks.
//   - The ruin is a grid of 2 m cells (levels.ts). The hero walks freely on it (a box against the
//     solid cells, with a corner nudge into openings), pushes and pulls crates and statues one cell
//     at a time, pushes carts along their rails, rolls, uses things with ACT and throws flares.
//   - The torch burns down; braziers (checkpoints) fill it, lit sconces warm it, oil tops it up. When
//     it dies the hero has a few seconds to reach a light, then loses a heart and wakes at the last
//     brazier. Its light (radius from the torch) slows shades, keeps wisps at bay and freezes the
//     guardian statues.
//   - Doors open by plates and levers, keys, sealed doors by sconces and candles, bookcases slide,
//     trapdoors open on a rhythm, bear traps snap, cracked floors fall away, pits swallow blocks.
//   - Escape levels: once the relic is taken the floor falls in behind the hero, from the relic
//     outwards, and bricks drop round them.
import {
  DT, CELL, RAISE, HERO_R, MOVE, TUNING, LIGHT_MIN, LIGHT_MAX, WARM_RATE, WARM_R, POWER_TIME, BOOTS_SPEED, OIL,
  FLARE_R, FLARE_STUN, FLARE_LIGHT, MAX_FLARES, SCORE, WORLDS,
  torchMax, burnScale, extraHp, strideScale, pushScale, powerScale, startFlares, type Ranks, type Tuning, type PowerId,
} from './defs';
import type { Level, Cell, ThingKind, BlockKind, FoeKind, PickKind } from './levels';

export interface Input {
  /** Movement in world axes (-1..1): x to the right (east), z down the screen (south). */
  mx: number;
  mz: number;
  /** ACT held / pressed this step. */
  act: boolean;
  actPressed: boolean;
  flarePressed: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, act: false, actPressed: false, flarePressed: false };

export interface Thing {
  id: number;
  kind: ThingKind;
  c: number; r: number;
  group: number;
  gem: boolean;
  /** Lit (brazier, sconce, candles), pulled (lever), broken (pot), opened (relic), snapped (trap). */
  on: boolean;
  /** Candles: seconds left lit. Bear trap: seconds until it opens again. */
  t: number;
  /** Seconds since its state last changed (animations). */
  a: number;
  /** Which wall a sconce hangs on (dc, dr). */
  wall: [number, number];
}

export interface Block {
  id: number;
  kind: BlockKind;
  c: number; r: number;
  x: number; z: number; y: number;
  /** Sliding: from (fx, fz) to the cell over `dur`. */
  fx: number; fz: number; t: number; dur: number;
  /** A cart rolling on: its direction. */
  roll: [number, number];
  /** In a pit (it fills it): its top is the floor. */
  sunk: boolean;
  /** Falling into a pit (0..1 progress). */
  fall: number;
}

export interface Pick {
  id: number;
  kind: PickKind;
  power?: PowerId;
  x: number; z: number; y: number;
  taken: boolean;
  /** Spilled from a pot: flies out first. */
  vy: number;
  hidden: boolean;
}

export interface Foe {
  id: number;
  kind: FoeKind;
  x: number; z: number; y: number;
  hx: number; hz: number;
  yaw: number;
  speed: number;
  stun: number;
  /** After a hit it backs off for a moment. */
  rest: number;
  state: 'idle' | 'patrol' | 'chase' | 'hover' | 'dive' | 'frozen' | 'move' | 'stun';
  /** Patrol target cell. */
  tc: number; tr: number;
  t: number;
  moving: boolean;
}

export interface Hero {
  x: number; z: number; y: number;
  vx: number; vz: number;
  yaw: number;
  hp: number; max: number;
  torch: number; tmax: number;
  /** Grace seconds once the torch is out (-1 when it burns). */
  dark: number;
  keys: number;
  flares: number;
  powers: Record<'boots' | 'compass' | 'ghost', number>;
  hurt: number;
  roll: number; rollCd: number; rdx: number; rdz: number;
  /** A bear trap holds the hero. */
  held: number;
  /** Doing something with ACT: the clip plays, the hero stands. */
  busy: number;
  anim: '' | 'pickup' | 'punch' | 'thrust' | 'pull' | 'swing';
  /** Pushing into a block: how long, which. */
  pushT: number;
  pushing: number;
  grab: number;
  state: 'play' | 'fall' | 'dark' | 'dead' | 'clear';
  stateT: number;
  relic: boolean;
  /** Footstep counter for the view. */
  step: number;
  /** Stepping back while pulling a block. */
  glide: { fx: number; fz: number; tx: number; tz: number; t: number; dur: number } | null;
}

export interface Brick { x: number; z: number; t: number; dur: number; hit: boolean }

export type SimEvent =
  | { e: 'step'; x: number; z: number }
  | { e: 'pickup'; p: Pick }
  | { e: 'hurt'; x: number; z: number; by: string }
  | { e: 'fall'; x: number; z: number }
  | { e: 'respawn'; x: number; z: number }
  | { e: 'darkOut' }
  | { e: 'darkWarn' }
  | { e: 'die' }
  | { e: 'brazier'; x: number; z: number; first: boolean }
  | { e: 'light'; x: number; z: number; kind: ThingKind }
  | { e: 'candleOut'; x: number; z: number }
  | { e: 'lever'; x: number; z: number; on: boolean }
  | { e: 'door'; c: number; r: number; open: boolean; kind: string }
  | { e: 'needKey'; x: number; z: number }
  | { e: 'unlock'; x: number; z: number }
  | { e: 'sealed'; c: number; r: number }
  | { e: 'shelf'; c: number; r: number }
  | { e: 'pot'; x: number; z: number; gem: boolean; barrel: boolean }
  | { e: 'relic'; x: number; z: number }
  | { e: 'exitOpen'; c: number; r: number }
  | { e: 'clear'; x: number; z: number }
  | { e: 'push'; x: number; z: number; kind: BlockKind }
  | { e: 'blockFall'; x: number; z: number; kind: BlockKind }
  | { e: 'cartStop'; x: number; z: number }
  | { e: 'plate'; x: number; z: number; on: boolean }
  | { e: 'roll'; x: number; z: number }
  | { e: 'flare'; x: number; z: number }
  | { e: 'snap'; x: number; z: number }
  | { e: 'trapdoor'; c: number; r: number; open: boolean }
  | { e: 'crack'; c: number; r: number }
  | { e: 'collapse'; c: number; r: number }
  | { e: 'brickWarn'; x: number; z: number }
  | { e: 'brick'; x: number; z: number }
  | { e: 'foeAlert'; x: number; z: number; kind: FoeKind }
  | { e: 'foeStun'; x: number; z: number; kind: FoeKind }
  | { e: 'grind'; x: number; z: number }
  | { e: 'powerEnd'; p: PowerId };

export interface Stats { coins: number; gems: number; time: number; hits: number; pots: number }

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Trapdoors: closed, warning, open (seconds) in one cycle. */
export const TRAP_CYCLE = { closed: 2.1, warn: 0.55, open: 1.25 };
const TRAP_PERIOD = TRAP_CYCLE.closed + TRAP_CYCLE.warn + TRAP_CYCLE.open;
/** Escape: the floor starts to fall this long after the relic is taken, then this many cells a second. */
const COLLAPSE_DELAY = 2.2;
const COLLAPSE_SPEED = 1.75;

export const cellX = (c: number): number => c * CELL;
export const cellZ = (r: number): number => r * CELL;

export class Sim {
  readonly c: Level;
  readonly tune: Tuning;
  readonly ranks: Ranks;
  readonly hero: Hero;
  things: Thing[] = [];
  blocks: Block[] = [];
  picks: Pick[] = [];
  foes: Foe[] = [];
  bricks: Brick[] = [];
  events: SimEvent[] = [];
  stats: Stats = { coins: 0, gems: 0, time: 0, hits: 0, pots: 0 };
  /** Points earned in the level (coins, gems, pots, the relic). */
  points = 0;
  clock = 0;
  /** No damage, no torch loss (tests, the menu's backdrop). */
  god = false;
  /** The brazier the hero wakes at (thing id; -1: the start). */
  checkpoint = -1;
  /** Cell states. */
  open: boolean[];
  crack: number[];
  collapsed: boolean[];
  /** Escape: seconds since the relic was taken (-1 before), each cell's fall time. */
  escapeT = -1;
  private fallAt: number[] = [];
  private exitDist: number[] = [];
  /** Group states (doors 1–4). */
  groups = [false, false, false, false, false];
  sealedOpen = false;
  flareT = 0;
  /** The last solid cell the hero stood on (respawn after a fall). */
  safe: [number, number];
  private field: Int16Array;
  private flyField: Int16Array;
  private fieldT = 0;
  private brickT = 2;
  private seed = 1;
  private nextId = 1;

  constructor(level: Level, ranks: Ranks, easy: boolean) {
    this.c = level;
    this.ranks = ranks;
    this.tune = TUNING[easy ? 'easy' : 'normal'];
    const n = level.cols * level.rows;
    this.open = new Array(n).fill(false);
    this.crack = new Array(n).fill(-1);
    this.collapsed = new Array(n).fill(false);
    this.field = new Int16Array(n).fill(-1);
    this.flyField = new Int16Array(n).fill(-1);
    this.seed = level.n * 7919 + 17;
    const [sc, sr] = level.start;
    const max = this.tune.hp + extraHp(ranks);
    const tmax = torchMax(ranks);
    this.hero = {
      x: cellX(sc), z: cellZ(sr), y: this.floorY(sc, sr, cellX(sc), cellZ(sr)), vx: 0, vz: 0, yaw: Math.PI,
      hp: max, max, torch: tmax, tmax, dark: -1, keys: 0, flares: startFlares(ranks), powers: { boots: 0, compass: 0, ghost: 0 },
      hurt: 0, roll: 0, rollCd: 0, rdx: 0, rdz: 0, held: 0, busy: 0, anim: '', pushT: 0, pushing: -1, grab: -1,
      state: 'play', stateT: 0, relic: false, step: 0, glide: null,
    };
    this.safe = [sc, sr];
    for (const t of level.things) {
      const th: Thing = { id: this.nextId++, kind: t.kind, c: t.c, r: t.r, group: t.group, gem: t.gem, on: false, t: 0, a: 9, wall: [0, -1] };
      if (t.kind === 'sconce' || t.kind === 'puzzle') th.wall = this.wallOf(t.c, t.r);
      this.things.push(th);
    }
    for (const b of level.blocks) this.blocks.push({ id: this.nextId++, kind: b.kind, c: b.c, r: b.r, x: cellX(b.c), z: cellZ(b.r), y: this.cell(b.c, b.r)!.h * RAISE, fx: cellX(b.c), fz: cellZ(b.r), t: 1, dur: 1, roll: [0, 0], sunk: false, fall: 0 });
    for (const p of level.picks) this.picks.push({ id: this.nextId++, kind: p.kind, power: p.power, x: cellX(p.c), z: cellZ(p.r), y: this.cell(p.c, p.r)!.h * RAISE, taken: false, vy: 0, hidden: false });
    for (const f of level.foes) {
      const x = cellX(f.c), z = cellZ(f.r);
      this.foes.push({ id: this.nextId++, kind: f.kind, x, z, y: 0, hx: x, hz: z, yaw: 0, speed: 0, stun: 0, rest: 0, state: f.kind === 'guardian' ? 'frozen' : 'patrol', tc: f.c, tr: f.r, t: 0, moving: false });
    }
    // the start's brazier (if there is one beside it) starts lit
    for (const t of this.things) if (t.kind === 'brazier' && Math.abs(t.c - sc) + Math.abs(t.r - sr) <= 4) { t.on = true; this.checkpoint = t.id; break; }
    this.updateGroups(true);
  }

  // ---------------------------------------------------------------- the grid

  idx(c: number, r: number): number { return r * this.c.cols + c; }
  cell(c: number, r: number): Cell | null { return c >= 0 && r >= 0 && c < this.c.cols && r < this.c.rows ? this.c.cells[r * this.c.cols + c] : null; }
  cellOf(x: number, z: number): [number, number] { return [Math.round(x / CELL), Math.round(z / CELL)]; }
  rand(): number { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  private wallOf(c: number, r: number): [number, number] {
    for (const [dc, dr] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as [number, number][]) if (this.cell(c + dc, r + dr)?.k === 'wall') return [dc, dr];
    return [0, -1];
  }

  thingAt(c: number, r: number): Thing | undefined { return this.things.find((t) => t.c === c && t.r === r); }
  blockAt(c: number, r: number): Block | undefined { return this.blocks.find((b) => b.c === c && b.r === r && !b.sunk && b.fall === 0); }
  sunkAt(c: number, r: number): Block | undefined { return this.blocks.find((b) => b.c === c && b.r === r && b.sunk); }

  /** Is the floor gone here (a pit, an open trapdoor, a fallen cracked floor) with nothing in it? */
  hole(c: number, r: number): boolean {
    const cell = this.cell(c, r);
    if (!cell) return false;
    if (this.sunkAt(c, r)) return false;
    const i = this.idx(c, r);
    if (this.collapsed[i]) return true;
    if (cell.k === 'pit') return true;
    if (cell.k === 'trapdoor') return this.trapOpen(c, r);
    return false;
  }

  /** Trapdoor state: 0 closed, 1 warning, 2 open. */
  trapState(c: number, r: number): number {
    const ph = (this.clock + (c * 0.55 + r * 0.35)) % TRAP_PERIOD;
    return ph < TRAP_CYCLE.closed ? 0 : ph < TRAP_CYCLE.closed + TRAP_CYCLE.warn ? 1 : 2;
  }
  trapOpen(c: number, r: number): boolean { return this.trapState(c, r) === 2; }
  /** Seconds until this trapdoor opens next (0 when open). */
  trapUntilOpen(c: number, r: number): number {
    const ph = (this.clock + (c * 0.55 + r * 0.35)) % TRAP_PERIOD;
    const at = TRAP_CYCLE.closed + TRAP_CYCLE.warn;
    return ph >= at ? 0 : at - ph;
  }

  /** Solid for the hero (and blocks): walls, closed doors, furniture, things that stand, blocks. */
  solid(c: number, r: number, forBlock = false, blocks = true): boolean {
    const cell = this.cell(c, r);
    if (!cell) return true;
    const i = this.idx(c, r);
    switch (cell.k) {
      case 'wall': return true;
      case 'door': case 'lock': case 'sealed': case 'exit': case 'bookcase': if (!this.open[i]) return true; break;
    }
    if (cell.shelf) return true;
    const th = this.thingAt(c, r);
    if (th && th.kind !== 'sconce' && th.kind !== 'puzzle' && th.kind !== 'beartrap' && !(th.kind === 'pot' || th.kind === 'barrel' ? th.on : false)) return true;
    if (forBlock && th && th.kind === 'beartrap') return true;
    if (blocks && this.blocks.some((b) => !b.sunk && b.fall === 0 && ((b.c === c && b.r === r) || (b.t < 1 && this.cellOf(b.fx, b.fz)[0] === c && this.cellOf(b.fx, b.fz)[1] === r)))) return true;
    return false;
  }

  /** May one walk straight from cell a to its neighbour b (heights and stairs)? */
  stepOk(ac: number, ar: number, bc: number, br: number): boolean {
    const a = this.cell(ac, ar), b = this.cell(bc, br);
    if (!a || !b) return false;
    if (a.h === b.h && a.k !== 'stairs' && b.k !== 'stairs') return true;
    const dc = bc - ac, dr = br - ar;
    if (a.k === 'stairs') {
      // off the stairs: along their axis only (down to the low side, up to the high side)
      if (dc === a.sd[0] && dr === a.sd[1]) return b.h === a.h + 1 || b.k === 'stairs';
      if (dc === -a.sd[0] && dr === -a.sd[1]) return b.h === a.h;
      return false;
    }
    if (b.k === 'stairs') {
      if (dc === b.sd[0] && dr === b.sd[1]) return a.h === b.h;
      if (dc === -b.sd[0] && dr === -b.sd[1]) return a.h === b.h + 1;
      return false;
    }
    return false;
  }

  /** The floor's height under a point (stairs ramp up along their axis). */
  floorY(c: number, r: number, x: number, z: number): number {
    const cell = this.cell(c, r);
    if (!cell) return 0;
    if (cell.k === 'stairs') {
      const along = ((x - cellX(c)) * cell.sd[0] + (z - cellZ(r)) * cell.sd[1]) / CELL + 0.5;
      return (cell.h + Math.max(0, Math.min(1, along))) * RAISE;
    }
    return cell.h * RAISE;
  }

  // ---------------------------------------------------------------- one step

  step(dt: number, inp: Input): void {
    this.clock += dt;
    const h = this.hero;
    h.stateT += dt;
    if (h.state === 'play' || h.state === 'dark') this.stats.time += dt;
    this.flareT = Math.max(0, this.flareT - dt);
    this.updateThings(dt);
    this.updateBlocks(dt);
    this.updateCells(dt);
    this.updateGroups();
    this.updatePicks(dt);
    this.updateEscape(dt);
    switch (h.state) {
      case 'play': case 'dark': this.updateHero(dt, inp); break;
      case 'fall':
        h.y -= dt * 7 * Math.min(1, h.stateT * 2);
        if (h.stateT > 0.85) this.respawnAfterFall();
        break;
      case 'dead': case 'clear': break;
    }
    this.updateFoes(dt);
    this.fieldT -= dt;
  }

  // ---------------------------------------------------------------- the hero

  lightRadius(): number {
    const h = this.hero;
    if (this.flareT > 0) return 14;
    if (h.dark >= 0) return LIGHT_MIN * 0.55;
    const k = Math.max(0, h.torch / h.tmax);
    return LIGHT_MIN + (LIGHT_MAX - LIGHT_MIN) * Math.pow(k, 0.75);
  }

  /** 0..1: how strongly the hero's light pushes back the dark right now. */
  lightPower(): number {
    if (this.flareT > 0) return 1;
    const h = this.hero;
    return h.dark >= 0 ? 0 : Math.min(1, h.torch / h.tmax / 0.6);
  }

  private updateHero(dt: number, inp: Input): void {
    const h = this.hero;
    for (const k of ['boots', 'compass', 'ghost'] as const) {
      if (h.powers[k] > 0) { h.powers[k] = Math.max(0, h.powers[k] - dt); if (h.powers[k] === 0) this.events.push({ e: 'powerEnd', p: k }); }
    }
    h.hurt = Math.max(0, h.hurt - dt);
    h.rollCd = Math.max(0, h.rollCd - dt);
    h.held = Math.max(0, h.held - dt);
    h.busy = Math.max(0, h.busy - dt);
    if (h.busy === 0) h.anim = '';
    this.updateTorch(dt);
    if (h.state !== 'play' && h.state !== 'dark') return;
    // flare
    if (inp.flarePressed) this.flare();
    // ACT
    if (!inp.act) h.grab = -1;
    if (inp.actPressed && h.held === 0 && h.roll === 0) this.act(inp);
    // movement
    let mx = inp.mx, mz = inp.mz;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const speed = MOVE.walk * strideScale(this.ranks) * (h.powers.boots > 0 ? BOOTS_SPEED : 1);
    if (h.glide) {
      const g = h.glide;
      g.t = Math.min(1, g.t + dt / g.dur);
      h.x = g.fx + (g.tx - g.fx) * g.t; h.z = g.fz + (g.tz - g.fz) * g.t;
      h.vx = h.vz = 0;
      if (g.t >= 1) h.glide = null;
    } else if (h.roll > 0) {
      h.roll = Math.max(0, h.roll - dt);
      h.vx = h.rdx * MOVE.rollSpeed; h.vz = h.rdz * MOVE.rollSpeed;
    } else if (h.held > 0 || h.busy > 0.05) {
      h.vx = 0; h.vz = 0;
    } else {
      const tx = mx * speed, tz = mz * speed;
      const a = l > 0.1 ? MOVE.acc : MOVE.dec;
      h.vx += Math.max(-a * dt, Math.min(a * dt, tx - h.vx));
      h.vz += Math.max(-a * dt, Math.min(a * dt, tz - h.vz));
      if (l > 0.2) h.yaw = Math.atan2(mx, mz);
    }
    const ox = h.x, oz = h.z;
    this.moveAxis('x', h.vx * dt);
    this.moveAxis('z', h.vz * dt);
    // pushing and pulling
    this.pushPull(dt, mx, mz, inp);
    // height and the floor under the hero
    const [c, r] = this.cellOf(h.x, h.z);
    const gy = this.floorY(c, r, h.x, h.z);
    h.y += (gy - h.y) * Math.min(1, dt * 18);
    const moved = Math.hypot(h.x - ox, h.z - oz);
    if (moved > 0.001) {
      const before = Math.floor(h.step);
      h.step += moved / 1.05;
      if (Math.floor(h.step) !== before) this.events.push({ e: 'step', x: h.x, z: h.z });
    }
    this.underFoot(c, r);
    if ((h.state as string) !== 'play' && (h.state as string) !== 'dark') return;
    this.touchPicks();
    this.touchThings();
  }

  private updateTorch(dt: number): void {
    const h = this.hero;
    // warmth from lit braziers and sconces
    let warm = false;
    for (const t of this.things) {
      if (!t.on || (t.kind !== 'brazier' && t.kind !== 'sconce' && t.kind !== 'puzzle')) continue;
      if (Math.hypot(cellX(t.c) - h.x, cellZ(t.r) - h.z) < WARM_R + (t.kind === 'brazier' ? 0.6 : 0)) { warm = true; break; }
    }
    if (warm) {
      h.torch = Math.min(h.tmax, h.torch + WARM_RATE * dt);
      if (h.dark >= 0) { h.dark = -1; h.state = 'play'; }
      return;
    }
    if (h.dark >= 0) {
      h.dark -= dt;
      if (h.dark <= 0) this.darkOut();
      return;
    }
    if (this.god || h.state === 'clear') return;
    const before = h.torch;
    h.torch = Math.max(0, h.torch - this.tune.burn * WORLDS[this.c.world].burn * burnScale(this.ranks) * dt * (this.flareT > 0 ? 0 : 1));
    if (before > h.tmax * 0.25 && h.torch <= h.tmax * 0.25) this.events.push({ e: 'darkWarn' });
    if (h.torch <= 0) { h.dark = this.tune.grace; h.state = 'dark'; this.events.push({ e: 'darkWarn' }); }
  }

  /** The torch died and no light was reached in time: a heart, and back at the last brazier. */
  private darkOut(): void {
    const h = this.hero;
    h.dark = -1;
    this.events.push({ e: 'darkOut' });
    this.damage(this.tune.darkCost, h.x, h.z, 'dark', true);
    if (h.hp <= 0) return;
    const cp = this.things.find((t) => t.id === this.checkpoint);
    const [c, r] = cp ? this.besideOf(cp.c, cp.r) : this.c.start;
    this.placeHero(c, r);
    h.torch = h.tmax;
    h.state = 'play';
    this.events.push({ e: 'respawn', x: h.x, z: h.z });
  }

  /** A free floor cell beside a thing (where the hero wakes by a brazier). */
  private besideOf(c: number, r: number): [number, number] {
    for (const [dc, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as [number, number][]) {
      const nc = c + dc, nr = r + dr;
      if (!this.solid(nc, nr) && !this.hole(nc, nr) && this.thingAt(nc, nr)?.kind !== 'beartrap' && this.cell(nc, nr)?.k !== 'trapdoor' && this.cell(nc, nr)?.k !== 'cracked') return [nc, nr];
    }
    return this.c.start;
  }

  private placeHero(c: number, r: number): void {
    const h = this.hero;
    h.x = cellX(c); h.z = cellZ(r); h.y = this.floorY(c, r, h.x, h.z);
    h.vx = h.vz = 0; h.roll = 0; h.held = 0; h.busy = 0; h.pushT = 0; h.grab = -1; h.glide = null;
    this.safe = [c, r];
    this.fieldT = 0;
  }

  /** Moves the hero along one axis against the solid cells and the height edges. */
  private moveAxis(axis: 'x' | 'z', d: number): void {
    if (d === 0) return;
    const h = this.hero;
    const R = HERO_R;
    const [cc, cr] = this.cellOf(h.x, h.z);
    const nx = axis === 'x' ? h.x + d : h.x, nz = axis === 'z' ? h.z + d : h.z;
    const blocked = (c: number, r: number) => {
      if (c === cc && r === cr) return false;
      if (this.solid(c, r, false, false)) return true;
      // a height edge: only between neighbours along the stairs
      const dc = c - cc, dr = r - cr;
      if (Math.abs(dc) + Math.abs(dr) === 1) return !this.stepOk(cc, cr, c, r);
      // diagonal: both ways round must be open
      return !(this.stepOk(cc, cr, cc + dc, cr) && this.stepOk(cc + dc, cr, c, r)) && !(this.stepOk(cc, cr, cc, cr + dr) && this.stepOk(cc, cr + dr, c, r));
    };
    const half = CELL / 2;
    const x0 = Math.round((nx - R) / CELL), x1 = Math.round((nx + R) / CELL);
    const z0 = Math.round((nz - R) / CELL), z1 = Math.round((nz + R) / CELL);
    let hit = false;
    let lim = axis === 'x' ? nx : nz;
    for (let r = z0; r <= z1; r++) for (let c = x0; c <= x1; c++) {
      if (!blocked(c, r)) continue;
      // overlap of the hero's box with the cell's box
      const cx0 = cellX(c) - half, cx1 = cellX(c) + half, cz0 = cellZ(r) - half, cz1 = cellZ(r) + half;
      if (nx + R <= cx0 || nx - R >= cx1 || nz + R <= cz0 || nz - R >= cz1) continue;
      hit = true;
      if (axis === 'x') lim = d > 0 ? Math.min(lim, cx0 - R - 1e-4) : Math.max(lim, cx1 + R + 1e-4);
      else lim = d > 0 ? Math.min(lim, cz0 - R - 1e-4) : Math.max(lim, cz1 + R + 1e-4);
    }
    // blocks by where they really are (a sliding crate is followed closely)
    const bh = CELL * 0.47;
    for (const b of this.blocks) {
      if (b.sunk || b.fall > 0) continue;
      if (nx + R <= b.x - bh || nx - R >= b.x + bh || nz + R <= b.z - bh || nz - R >= b.z + bh) continue;
      if (Math.abs(h.x - b.x) < bh + R - 0.02 && Math.abs(h.z - b.z) < bh + R - 0.02) continue; // already inside: let it out
      hit = true;
      if (axis === 'x') lim = d > 0 ? Math.min(lim, b.x - bh - R - 1e-4) : Math.max(lim, b.x + bh + R + 1e-4);
      else lim = d > 0 ? Math.min(lim, b.z - bh - R - 1e-4) : Math.max(lim, b.z + bh + R + 1e-4);
    }
    if (axis === 'x') h.x = lim; else h.z = lim;
    if (hit) {
      if (axis === 'x') h.vx = 0; else h.vz = 0;
      // corner nudge: slide round a corner into an opening the hero is slightly off
      const along = axis === 'x' ? h.z - cellZ(cr) : h.x - cellX(cc);
      const dirc = axis === 'x' ? Math.sign(d) : 0, dirr = axis === 'z' ? Math.sign(d) : 0;
      const ahead = () => !this.solid(cc + dirc, cr + dirr) && this.stepOk(cc, cr, cc + dirc, cr + dirr);
      if (Math.abs(along) > 0.02 && Math.abs(along) < 0.75 && ahead()) {
        const k = Math.min(Math.abs(along), Math.abs(d) * 1.2) * Math.sign(along);
        if (axis === 'x') h.z -= k; else h.x -= k;
      }
    }
  }

  private pushPull(dt: number, mx: number, mz: number, inp: Input): void {
    const h = this.hero;
    if (h.roll > 0 || h.held > 0 || h.busy > 0 || h.glide) { h.pushT = 0; return; }
    const [cc, cr] = this.cellOf(h.x, h.z);
    // the dominant direction of the stick
    let dc = 0, dr = 0;
    if (Math.abs(mx) > 0.5 && Math.abs(mx) >= Math.abs(mz)) dc = Math.sign(mx);
    else if (Math.abs(mz) > 0.5) dr = Math.sign(mz);
    if (!dc && !dr) { h.pushT = 0; h.pushing = -1; return; }
    // pull: ACT held on a grabbed block, the stick away from it
    if (inp.act && h.grab >= 0) {
      const b = this.blocks.find((x) => x.id === h.grab);
      if (b && b.t >= 1 && b.kind !== 'cart' && b.c - cc === -dc && b.r - cr === -dr && Math.abs(b.c - cc) + Math.abs(b.r - cr) === 1) {
        const tc = cc + dc, tr = cr + dr;
        h.pushT += dt;
        if (h.pushT >= MOVE.pushWait && !this.solid(tc, tr) && !this.hole(tc, tr) && this.stepOk(cc, cr, tc, tr) && this.cell(tc, tr)?.k !== 'stairs') {
          h.pushT = 0;
          const dur = (b.kind === 'statue' ? MOVE.statueTime : MOVE.pushTime) * pushScale(this.ranks);
          this.slide(b, cc, cr, dur);
          // the hero steps back with it
          h.glide = { fx: h.x, fz: h.z, tx: cellX(tc), tz: cellZ(tr), t: 0, dur };
          h.busy = dur; h.anim = 'pull';
          this.safe = [tc, tr];
          this.events.push({ e: 'push', x: b.x, z: b.z, kind: b.kind });
        }
        return;
      }
    }
    // push: the hero leans on the block ahead, roughly lined up with it
    const bc = cc + dc, br = cr + dr;
    const b = this.blockAt(bc, br);
    const lined = dc ? Math.abs(h.z - cellZ(cr)) < 0.6 : Math.abs(h.x - cellX(cc)) < 0.6;
    const close = dc ? Math.abs(cellX(bc) - h.x) < CELL / 2 + HERO_R + 0.12 : Math.abs(cellZ(br) - h.z) < CELL / 2 + HERO_R + 0.12;
    if (!b || !lined || !close || b.t < 1 || b.roll[0] || b.roll[1]) { h.pushT = 0; h.pushing = -1; return; }
    if (h.pushing !== b.id) { h.pushing = b.id; h.pushT = 0; }
    h.pushT += dt;
    if (h.pushT < MOVE.pushWait) return;
    h.pushT = -0.15;
    const tc = bc + dc, tr = br + dr;
    if (b.kind === 'cart') {
      const cell = this.cell(bc, br)!;
      if ((cell.rail === 'x' && dr) || (cell.rail === 'z' && dc)) return;
      if (!this.cartCan(tc, tr)) return;
      b.roll = [dc, dr];
      this.events.push({ e: 'push', x: b.x, z: b.z, kind: 'cart' });
      this.rollCart(b);
      return;
    }
    if (this.solid(tc, tr, true) || !this.stepOk(bc, br, tc, tr) || this.cell(tc, tr)?.k === 'stairs' || this.cell(tc, tr)?.k === 'exit') return;
    const dur = (b.kind === 'statue' ? MOVE.statueTime : MOVE.pushTime) * pushScale(this.ranks);
    this.slide(b, tc, tr, dur);
    h.anim = 'pull';
    this.events.push({ e: 'push', x: b.x, z: b.z, kind: b.kind });
  }

  private cartCan(c: number, r: number): boolean {
    const cell = this.cell(c, r);
    if (!cell || this.solid(c, r, true)) return false;
    return cell.rail !== '' || this.hole(c, r);
  }

  private rollCart(b: Block): void {
    const tc = b.c + b.roll[0], tr = b.r + b.roll[1];
    if (!this.cartCan(tc, tr)) { b.roll = [0, 0]; this.events.push({ e: 'cartStop', x: b.x, z: b.z }); return; }
    this.slide(b, tc, tr, 0.3);
  }

  private slide(b: Block, c: number, r: number, dur: number): void {
    b.fx = b.x; b.fz = b.z;
    b.c = c; b.r = r;
    b.t = 0; b.dur = dur;
  }

  // ---------------------------------------------------------------- ACT

  /** What ACT would do now: the nearest usable thing the hero faces (or null: a roll). */
  target(): { kind: string; c: number; r: number } | null {
    const h = this.hero;
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    let best: { kind: string; c: number; r: number } | null = null, bd = Infinity;
    const consider = (kind: string, c: number, r: number) => {
      const x = cellX(c), z = cellZ(r);
      const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
      if (d > MOVE.reach + 0.75) return;
      const face = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (d > 1.25 && face < 0.35) return;
      const score = d - face * 0.6;
      if (score < bd) { bd = score; best = { kind, c, r }; }
    };
    for (const t of this.things) {
      if (t.kind === 'relic' && !t.on) consider('relic', t.c, t.r);
      else if (t.kind === 'lever') consider('lever', t.c, t.r);
      else if ((t.kind === 'sconce' || t.kind === 'puzzle' || t.kind === 'candles') && !t.on) consider(t.kind, t.c, t.r);
      else if ((t.kind === 'pot' || t.kind === 'barrel') && !t.on) consider('pot', t.c, t.r);
    }
    const [cc, cr] = this.cellOf(h.x, h.z);
    for (const [dc, dr] of DIRS) {
      const c = cc + dc, r = cr + dr, cell = this.cell(c, r);
      if (cell?.k === 'bookcase' && !this.open[this.idx(c, r)]) consider('bookcase', c, r);
      const b = this.blockAt(c, r);
      if (b && b.kind !== 'cart' && b.t >= 1) consider('grab', c, r);
    }
    return best;
  }

  private act(inp: Input): void {
    const h = this.hero;
    const t = this.target();
    if (!t) {
      // nothing to use: a roll the way the hero faces (or moves)
      if (h.rollCd > 0) return;
      let dx = inp.mx, dz = inp.mz;
      const l = Math.hypot(dx, dz);
      if (l < 0.2) { dx = Math.sin(h.yaw); dz = Math.cos(h.yaw); } else { dx /= l; dz /= l; }
      h.roll = MOVE.rollTime; h.rollCd = MOVE.rollCd; h.rdx = dx; h.rdz = dz; h.yaw = Math.atan2(dx, dz);
      this.events.push({ e: 'roll', x: h.x, z: h.z });
      return;
    }
    // face it
    h.yaw = Math.atan2(cellX(t.c) - h.x, cellZ(t.r) - h.z);
    h.vx = h.vz = 0;
    const x = cellX(t.c), z = cellZ(t.r);
    switch (t.kind) {
      case 'relic': {
        const th = this.thingAt(t.c, t.r)!;
        th.on = true; th.a = 0;
        h.relic = true; h.busy = 1.0; h.anim = 'pickup';
        this.points += SCORE.relic;
        this.events.push({ e: 'relic', x, z });
        const [ec, er] = this.c.exit;
        this.open[this.idx(ec, er)] = true;
        this.events.push({ e: 'exitOpen', c: ec, r: er });
        if (this.c.escape) this.startEscape();
        break;
      }
      case 'lever': {
        const th = this.thingAt(t.c, t.r)!;
        th.on = !th.on; th.a = 0;
        h.busy = 0.55; h.anim = 'swing';
        this.events.push({ e: 'lever', x, z, on: th.on });
        this.updateGroups();
        break;
      }
      case 'sconce': case 'puzzle': case 'candles': {
        const th = this.thingAt(t.c, t.r)!;
        th.on = true; th.a = 0; th.t = t.kind === 'candles' ? this.tune.candle : 0;
        h.busy = 0.45; h.anim = 'thrust';
        this.events.push({ e: 'light', x, z, kind: th.kind });
        this.checkSealed();
        break;
      }
      case 'pot': {
        const th = this.thingAt(t.c, t.r)!;
        th.on = true; th.a = 0;
        h.busy = 0.4; h.anim = 'punch';
        this.stats.pots++;
        this.points += SCORE.pot;
        this.events.push({ e: 'pot', x, z, gem: th.gem, barrel: th.kind === 'barrel' });
        const n = th.kind === 'barrel' ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + this.rand();
          this.picks.push({ id: this.nextId++, kind: 'coin', x: x + Math.cos(a) * 0.5, z: z + Math.sin(a) * 0.5, y: 0.3, taken: false, vy: 4 + this.rand() * 2, hidden: false });
        }
        if (th.gem) this.picks.push({ id: this.nextId++, kind: 'gem', x, z, y: 0.4, taken: false, vy: 6, hidden: false });
        break;
      }
      case 'bookcase': {
        this.open[this.idx(t.c, t.r)] = true;
        h.busy = 0.5; h.anim = 'pull';
        this.events.push({ e: 'shelf', c: t.c, r: t.r });
        break;
      }
      case 'grab': {
        const b = this.blockAt(t.c, t.r);
        if (b) h.grab = b.id;
        break;
      }
    }
  }

  private flare(): void {
    const h = this.hero;
    if (h.flares <= 0) return;
    h.flares--;
    this.flareT = FLARE_LIGHT;
    h.busy = Math.max(h.busy, 0.35); h.anim = 'swing';
    this.events.push({ e: 'flare', x: h.x, z: h.z });
    for (const f of this.foes) {
      if (Math.hypot(f.x - h.x, f.z - h.z) < FLARE_R) { f.stun = FLARE_STUN; f.state = 'stun'; this.events.push({ e: 'foeStun', x: f.x, z: f.z, kind: f.kind }); }
    }
  }

  // ---------------------------------------------------------------- things under and round the hero

  private underFoot(c: number, r: number): void {
    const h = this.hero;
    const cell = this.cell(c, r);
    if (!cell) return;
    // the floor gone? (the hero's middle well inside the hole)
    if (this.hole(c, r) && h.roll === 0) {
      const inX = Math.abs(h.x - cellX(c)), inZ = Math.abs(h.z - cellZ(r));
      if (inX < CELL / 2 - 0.12 && inZ < CELL / 2 - 0.12) { this.fall(); return; }
    }
    // cracked floor starts to give
    const i = this.idx(c, r);
    if (cell.k === 'cracked' && this.crack[i] < 0 && !this.collapsed[i]) { this.crack[i] = 0; this.events.push({ e: 'crack', c, r }); }
    // a safe place to come back to
    if (!this.hole(c, r) && cell.k !== 'trapdoor' && cell.k !== 'cracked' && !this.thingAt(c, r) && !this.collapsed[i] && this.escapeT < 0) this.safe = [c, r];
    if (this.escapeT >= 0 && !this.hole(c, r) && !this.collapsed[i] && cell.k !== 'cracked' && cell.k !== 'trapdoor') this.safe = [c, r];
    // the exit
    if (cell.k === 'exit' && this.open[i] && h.relic) {
      h.state = 'clear'; h.stateT = 0; h.vx = h.vz = 0;
      this.events.push({ e: 'clear', x: h.x, z: h.z });
    }
    // locked doors open with a key when walked into
    for (const [dc, dr] of DIRS) {
      const lc = c + dc, lr = r + dr, lk = this.cell(lc, lr);
      if (lk?.k !== 'lock' || this.open[this.idx(lc, lr)]) continue;
      const dx = cellX(lc) - h.x, dz = cellZ(lr) - h.z;
      const toward = h.vx * dx + h.vz * dz > 0.5 || (Math.abs(dx) + Math.abs(dz) < CELL / 2 + 0.5);
      if (!toward || Math.hypot(dx, dz) > CELL / 2 + HERO_R + 0.1) continue;
      if (h.keys > 0) {
        h.keys--;
        this.open[this.idx(lc, lr)] = true;
        h.busy = 0.45; h.anim = 'thrust';
        this.events.push({ e: 'unlock', x: cellX(lc), z: cellZ(lr) });
        this.events.push({ e: 'door', c: lc, r: lr, open: true, kind: 'lock' });
      } else if (h.stateT > 0.1 && this.clock % 1.5 < DT) this.events.push({ e: 'needKey', x: cellX(lc), z: cellZ(lr) });
    }
  }

  private fall(): void {
    const h = this.hero;
    h.state = 'fall'; h.stateT = 0; h.vx = h.vz = 0;
    this.events.push({ e: 'fall', x: h.x, z: h.z });
  }

  private respawnAfterFall(): void {
    const h = this.hero;
    if (!this.god) this.damage(this.tune.fallCost, h.x, h.z, 'fall', true);
    if (h.hp <= 0) return;
    let [c, r] = this.safe;
    if (this.escapeT >= 0) [c, r] = this.aheadCell();
    if (this.hole(c, r) || this.solid(c, r)) [c, r] = this.c.start;
    this.placeHero(c, r);
    h.state = h.dark >= 0 ? 'dark' : 'play';
    h.hurt = MOVE.hurtTime;
    if (this.escapeT >= 0) this.escapeT -= 2; // the falling floor pauses for a breath
    this.events.push({ e: 'respawn', x: h.x, z: h.z });
  }

  private touchThings(): void {
    const h = this.hero;
    for (const t of this.things) {
      const d = Math.hypot(cellX(t.c) - h.x, cellZ(t.r) - h.z);
      if (t.kind === 'brazier' && d < 1.9) {
        const first = this.checkpoint !== t.id;
        if (!t.on || first) {
          const wasOn = t.on;
          t.on = true; t.a = 0;
          if (first) this.checkpoint = t.id;
          this.events.push({ e: 'brazier', x: cellX(t.c), z: cellZ(t.r), first: !wasOn });
        }
      }
      if (t.kind === 'beartrap' && !t.on && d < 0.55 && h.roll === 0) {
        if (h.powers.ghost > 0) continue;
        t.on = true; t.t = 3; t.a = 0;
        h.held = MOVE.trapHold;
        h.x = cellX(t.c); h.z = cellZ(t.r); h.vx = h.vz = 0;
        this.events.push({ e: 'snap', x: h.x, z: h.z });
        this.damage(1, h.x, h.z, 'trap');
      }
    }
  }

  private touchPicks(): void {
    const h = this.hero;
    for (const p of this.picks) {
      if (p.taken || p.hidden || p.vy > 0.5) continue;
      if (Math.hypot(p.x - h.x, p.z - h.z) > 0.85) continue;
      if (Math.abs(p.y - h.y) > 1.2 && p.y > h.y) continue;
      p.taken = true;
      switch (p.kind) {
        case 'coin': this.stats.coins++; this.points += SCORE.coin; break;
        case 'gem': this.stats.gems++; this.points += SCORE.gem; break;
        case 'key': h.keys++; break;
        case 'power': this.power(p.power!); break;
      }
      this.events.push({ e: 'pickup', p });
    }
  }

  private power(p: PowerId): void {
    const h = this.hero;
    switch (p) {
      case 'flare': h.flares = Math.min(MAX_FLARES, h.flares + 1); break;
      case 'oil': h.torch = Math.min(h.tmax, h.torch + OIL); if (h.dark >= 0) { h.dark = -1; h.state = 'play'; } break;
      default: h.powers[p] = POWER_TIME[p] * powerScale(this.ranks);
    }
  }

  damage(n: number, fx: number, fz: number, by: string, force = false): void {
    const h = this.hero;
    if (this.god || h.state === 'dead' || h.state === 'clear') return;
    if (!force && (h.hurt > 0 || h.powers.ghost > 0)) return;
    h.hp = Math.max(0, h.hp - n);
    h.hurt = MOVE.hurtTime;
    this.stats.hits++;
    this.events.push({ e: 'hurt', x: h.x, z: h.z, by });
    if (by !== 'fall' && by !== 'dark' && by !== 'trap') {
      const dx = h.x - fx, dz = h.z - fz, l = Math.hypot(dx, dz) || 1;
      h.vx = (dx / l) * MOVE.knock; h.vz = (dz / l) * MOVE.knock;
      h.roll = 0.16; h.rdx = dx / l; h.rdz = dz / l;
    }
    if (h.hp <= 0) { h.state = 'dead'; h.stateT = 0; this.events.push({ e: 'die' }); }
  }

  /** The rewarded continue: full hearts, a full torch, back at the last brazier. */
  revive(): void {
    const h = this.hero;
    h.hp = h.max;
    h.torch = h.tmax;
    h.dark = -1;
    const cp = this.things.find((t) => t.id === this.checkpoint);
    const [c, r] = this.escapeT >= 0 ? this.aheadCell() : cp ? this.besideOf(cp.c, cp.r) : this.c.start;
    this.placeHero(c, r);
    h.state = 'play'; h.stateT = 0;
    h.hurt = MOVE.hurtTime * 2;
    if (this.escapeT >= 0) this.escapeT -= 3;
    for (const f of this.foes) if (Math.hypot(f.x - h.x, f.z - h.z) < 8) { f.stun = 4; f.state = 'stun'; }
    this.events.push({ e: 'respawn', x: h.x, z: h.z });
  }

  // ---------------------------------------------------------------- the ruin's moving parts

  private updateThings(dt: number): void {
    for (const t of this.things) {
      t.a += dt;
      if (t.kind === 'candles' && t.on && !this.sealedOpen) {
        t.t -= dt;
        if (t.t <= 0) { t.on = false; t.t = 0; t.a = 0; this.events.push({ e: 'candleOut', x: cellX(t.c), z: cellZ(t.r) }); }
      }
      if (t.kind === 'beartrap' && t.on) {
        t.t -= dt;
        // it sets itself again once nobody stands in it
        if (t.t <= 0 && Math.hypot(this.hero.x - cellX(t.c), this.hero.z - cellZ(t.r)) > 1) { t.on = false; t.t = 0; t.a = 0; }
      }
    }
  }

  private checkSealed(): void {
    if (this.sealedOpen) return;
    const need = this.things.filter((t) => t.kind === 'puzzle' || t.kind === 'candles');
    if (!need.length || need.some((t) => !t.on)) return;
    this.sealedOpen = true;
    for (let r = 0; r < this.c.rows; r++) for (let c = 0; c < this.c.cols; c++) {
      if (this.cell(c, r)!.k === 'sealed') { this.open[this.idx(c, r)] = true; this.events.push({ e: 'sealed', c, r }); this.events.push({ e: 'door', c, r, open: true, kind: 'sealed' }); }
    }
  }

  /** Plates and levers → door groups (doors close again on an empty plate, never on the hero). */
  updateGroups(quiet = false): void {
    for (let g = 1; g <= 4; g++) {
      let has = false, ok = true;
      for (let r = 0; r < this.c.rows; r++) for (let c = 0; c < this.c.cols; c++) {
        const cell = this.cell(c, r)!;
        if (cell.plate !== g) continue;
        has = true;
        if (!this.blockAt(c, r)) ok = false;
      }
      for (const t of this.things) if (t.kind === 'lever' && t.group === g) { has = true; if (!t.on) ok = false; }
      const now = has && ok;
      if (now === this.groups[g]) continue;
      this.groups[g] = now;
      for (let r = 0; r < this.c.rows; r++) for (let c = 0; c < this.c.cols; c++) {
        const cell = this.cell(c, r)!;
        if (cell.k !== 'door' || cell.group !== g) continue;
        const i = this.idx(c, r);
        if (!now) {
          const [hc, hr] = this.cellOf(this.hero.x, this.hero.z);
          if (hc === c && hr === r) { this.groups[g] = true; continue; }
        }
        this.open[i] = now;
        if (!quiet) this.events.push({ e: 'door', c, r, open: now, kind: 'door' });
      }
    }
  }

  private updateBlocks(dt: number): void {
    let platesChanged = false;
    for (const b of this.blocks) {
      if (b.fall > 0) {
        b.fall = Math.min(1, b.fall + dt * 2.4);
        b.y = this.cell(b.c, b.r)!.h * RAISE - b.fall * (b.kind === 'cart' ? 0.9 : 0.82);
        if (b.fall >= 1) { b.sunk = true; b.fall = 0; b.y = this.cell(b.c, b.r)!.h * RAISE - (b.kind === 'cart' ? 0.9 : 0.82); platesChanged = true; }
        continue;
      }
      if (b.sunk || b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / b.dur);
      const k = b.roll[0] || b.roll[1] ? b.t : b.t * b.t * (3 - 2 * b.t);
      b.x = b.fx + (cellX(b.c) - b.fx) * k;
      b.z = b.fz + (cellZ(b.r) - b.fz) * k;
      if (b.t >= 1) {
        b.x = cellX(b.c); b.z = cellZ(b.r);
        // into a hole: it falls and fills it
        if (this.hole(b.c, b.r)) {
          b.fall = 0.01;
          b.roll = [0, 0];
          this.events.push({ e: 'blockFall', x: b.x, z: b.z, kind: b.kind });
          continue;
        }
        const cell = this.cell(b.c, b.r)!;
        if (cell.plate) { platesChanged = true; this.events.push({ e: 'plate', x: b.x, z: b.z, on: true }); }
        else platesChanged = true;
        if (b.roll[0] || b.roll[1]) {
          // a rolling cart knocks creatures out of the way
          for (const f of this.foes) if (Math.hypot(f.x - b.x, f.z - b.z) < 1.3) { f.stun = 3; f.state = 'stun'; this.events.push({ e: 'foeStun', x: f.x, z: f.z, kind: f.kind }); }
          this.rollCart(b);
        }
      }
    }
    void platesChanged;
  }

  private updateCells(dt: number): void {
    for (let i = 0; i < this.crack.length; i++) {
      if (this.crack[i] < 0 || this.collapsed[i]) continue;
      this.crack[i] += dt;
      if (this.crack[i] > 0.65) {
        this.collapsed[i] = true;
        const c = i % this.c.cols, r = Math.floor(i / this.c.cols);
        this.events.push({ e: 'collapse', c, r });
        const b = this.blockAt(c, r);
        if (b) { b.fall = 0.01; this.events.push({ e: 'blockFall', x: b.x, z: b.z, kind: b.kind }); }
      }
    }
    // blocks on cracked floors weigh them down
    for (const b of this.blocks) {
      if (b.sunk || b.fall > 0) continue;
      const i = this.idx(b.c, b.r);
      if (this.cell(b.c, b.r)!.k === 'cracked' && this.crack[i] < 0) this.crack[i] = 0;
    }
    // trapdoor sounds
    for (let r = 0; r < this.c.rows; r++) for (let c = 0; c < this.c.cols; c++) {
      if (this.cell(c, r)!.k !== 'trapdoor') continue;
      const now = this.trapState(c, r), before = (this.clock - DT + (c * 0.55 + r * 0.35) + TRAP_PERIOD) % TRAP_PERIOD;
      const was = before < TRAP_CYCLE.closed ? 0 : before < TRAP_CYCLE.closed + TRAP_CYCLE.warn ? 1 : 2;
      if (now !== was && (now === 2 || now === 0)) this.events.push({ e: 'trapdoor', c, r, open: now === 2 });
    }
  }

  private updatePicks(dt: number): void {
    for (const p of this.picks) {
      if (p.taken || p.vy === 0) continue;
      p.vy -= 18 * dt;
      p.y += p.vy * dt;
      const [c, r] = this.cellOf(p.x, p.z);
      const floor = (this.cell(c, r)?.h ?? 0) * RAISE;
      if (p.y <= floor) { p.y = floor; p.vy = 0; }
    }
  }

  // ---------------------------------------------------------------- escape

  private startEscape(): void {
    this.escapeT = 0;
    const { cols, rows } = this.c;
    // the floor falls in order of its distance from the relic
    const dist = this.bfs(this.c.relic[0], this.c.relic[1], true);
    this.fallAt = Array.from(dist, (d) => (d < 0 ? Infinity : COLLAPSE_DELAY + d / (COLLAPSE_SPEED * (1 / this.tune.escape))));
    this.exitDist = Array.from(this.bfs(this.c.exit[0], this.c.exit[1], true));
    const [ec, er] = this.c.exit;
    // the exit and the cells right before it stand
    this.fallAt[this.idx(ec, er)] = Infinity;
    for (let i = 0; i < cols * rows; i++) if (this.exitDist[i] >= 0 && this.exitDist[i] <= 1) this.fallAt[i] = Infinity;
    this.brickT = 1.5;
  }

  /** Seconds until the falling floor reaches the exit (the escape's clock). */
  escapeLeft(): number {
    if (this.escapeT < 0) return 0;
    let worst = Infinity;
    for (let i = 0; i < this.fallAt.length; i++) if (this.exitDist[i] === 2 && this.fallAt[i] < worst) worst = this.fallAt[i];
    return Math.max(0, (worst === Infinity ? 0 : worst) - this.escapeT);
  }

  private updateEscape(dt: number): void {
    if (this.escapeT < 0 || this.hero.state === 'clear') return;
    this.escapeT += dt;
    for (let i = 0; i < this.fallAt.length; i++) {
      if (this.collapsed[i] || this.fallAt[i] > this.escapeT) continue;
      const c = i % this.c.cols, r = Math.floor(i / this.c.cols), cell = this.cell(c, r)!;
      if (cell.k === 'wall' || cell.k === 'pit') continue;
      if (cell.k !== 'floor' && cell.k !== 'cracked' && cell.k !== 'bridge' && cell.k !== 'trapdoor' && cell.k !== 'door' && cell.k !== 'sealed' && cell.k !== 'bookcase' && cell.k !== 'stairs') continue;
      // the warning: it cracks first
      if (this.crack[i] < 0) { this.crack[i] = 0; this.events.push({ e: 'crack', c, r }); }
    }
    // bricks drop round the hero
    this.brickT -= dt;
    const h = this.hero;
    if (this.brickT <= 0 && (h.state === 'play' || h.state === 'dark')) {
      this.brickT = 0.9 + this.rand() * 0.8;
      for (let k = 0; k < 6; k++) {
        const x = h.x + (this.rand() - 0.5) * 6 + h.vx * 0.5, z = h.z + (this.rand() - 0.5) * 6 + h.vz * 0.5;
        const [c, r] = this.cellOf(x, z);
        if (this.solid(c, r) || this.hole(c, r)) continue;
        this.bricks.push({ x, z, t: 0, dur: 0.95, hit: false });
        this.events.push({ e: 'brickWarn', x, z });
        break;
      }
    }
    for (const b of this.bricks) {
      b.t += dt;
      if (!b.hit && b.t >= b.dur) {
        b.hit = true;
        this.events.push({ e: 'brick', x: b.x, z: b.z });
        if (Math.hypot(h.x - b.x, h.z - b.z) < 0.85 && (h.state === 'play' || h.state === 'dark')) this.damage(1, b.x, b.z, 'brick');
      }
    }
    this.bricks = this.bricks.filter((b) => b.t < b.dur + 0.6);
  }

  /** During an escape: the standing cell nearest the exit side of the hero's way (respawn). */
  private aheadCell(): [number, number] {
    const h = this.hero;
    let best: [number, number] = this.c.exit, bd = Infinity;
    const [hc, hr] = this.cellOf(h.x, h.z);
    for (let r = 0; r < this.c.rows; r++) for (let c = 0; c < this.c.cols; c++) {
      const i = this.idx(c, r);
      if (this.collapsed[i] || this.crack[i] >= 0 || this.hole(c, r) || this.solid(c, r) || this.exitDist[i] < 0) continue;
      const k = this.cell(c, r)!.k;
      if (k !== 'floor' && k !== 'bridge') continue;
      if (this.thingAt(c, r)) continue;
      // close to where the hero was, and not about to fall
      if (this.fallAt[i] - this.escapeT < 2.5) continue;
      const d = Math.abs(c - hc) + Math.abs(r - hr) + this.exitDist[i] * 0.2;
      if (d < bd) { bd = d; best = [c, r]; }
    }
    return best;
  }

  // ---------------------------------------------------------------- creatures

  /** Breadth-first distances (in cells) over the walkable floor; `fly` ignores holes; `light` avoids lit warmth. */
  bfs(c0: number, r0: number, ignoreThings = false, fly = false, avoidLight = false): Int16Array {
    const { cols, rows } = this.c;
    const d = new Int16Array(cols * rows).fill(-1);
    if (!this.cell(c0, r0)) return d;
    const q = [c0, r0];
    d[this.idx(c0, r0)] = 0;
    const lit = avoidLight ? this.things.filter((t) => t.on && (t.kind === 'brazier' || t.kind === 'sconce' || t.kind === 'puzzle')) : [];
    for (let qi = 0; qi < q.length; qi += 2) {
      const c = q[qi], r = q[qi + 1], dd = d[this.idx(c, r)];
      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr, cell = this.cell(nc, nr);
        if (!cell || d[this.idx(nc, nr)] >= 0) continue;
        if (cell.k === 'wall') continue;
        if (!ignoreThings && this.solid(nc, nr)) continue;
        if (!fly && !ignoreThings && this.hole(nc, nr)) continue;
        if (!fly && !this.stepOk(c, r, nc, nr)) continue;
        if (lit.length && lit.some((t) => Math.hypot(cellX(t.c) - cellX(nc), cellZ(t.r) - cellZ(nr)) < WARM_R + 0.4)) continue;
        d[this.idx(nc, nr)] = dd + 1;
        q.push(nc, nr);
      }
    }
    return d;
  }

  private updateFoes(dt: number): void {
    const h = this.hero;
    if (!this.foes.length) return;
    const [hc, hr] = this.cellOf(h.x, h.z);
    if (this.fieldT <= 0) {
      this.fieldT = 0.3;
      this.field = this.bfs(hc, hr, false, false, true);
      this.flyField = this.bfs(hc, hr, false, true, true);
    }
    const alive = h.state === 'play' || h.state === 'dark';
    const lr = this.lightRadius(), lp = this.lightPower();
    for (const f of this.foes) {
      f.t += dt;
      f.rest = Math.max(0, f.rest - dt);
      const dx = h.x - f.x, dz = h.z - f.z, d = Math.hypot(dx, dz);
      if (f.stun > 0) {
        f.stun -= dt;
        f.state = 'stun';
        f.moving = false;
        if (f.stun <= 0) f.state = f.kind === 'guardian' ? 'frozen' : 'patrol';
        continue;
      }
      let speed = 0, tx = f.x, tz = f.z;
      const field = f.kind === 'wisp' ? this.flyField : this.field;
      const [fc, fr] = this.cellOf(f.x, f.z);
      const next = (): [number, number] | null => {
        const here = field[this.idx(fc, fr)];
        let best: [number, number] | null = null, bd = here < 0 ? 999 : here;
        for (const [dc, dr] of DIRS) {
          const v = field[this.idx(fc + dc, fr + dr)] ?? -1;
          if (v >= 0 && v < bd) { bd = v; best = [fc + dc, fr + dr]; }
        }
        return best;
      };
      if (f.kind === 'shade') {
        const sees = alive && d < 8.5 && field[this.idx(fc, fr)] >= 0 && field[this.idx(fc, fr)] < 12;
        if (sees && f.state !== 'chase') { f.state = 'chase'; this.events.push({ e: 'foeAlert', x: f.x, z: f.z, kind: f.kind }); }
        if (!sees) f.state = 'patrol';
        if (f.state === 'chase' && f.rest === 0) {
          // light slows them: deep in a strong light they crawl
          const inLight = d < lr ? lp * (1 - (d / lr) * 0.5) : 0;
          speed = 3.1 * this.tune.pace * (1 - 0.62 * inLight) * (h.powers.ghost > 0 ? 0.6 : 1);
          const n = d < 1.6 ? null : next();
          if (n) { tx = cellX(n[0]); tz = cellZ(n[1]); } else { tx = h.x; tz = h.z; }
        } else {
          speed = 1.3 * this.tune.pace;
          if (Math.hypot(cellX(f.tc) - f.x, cellZ(f.tr) - f.z) < 0.2 || f.t > 4) {
            f.t = 0;
            // wander to a neighbouring open cell
            const opts = DIRS.map(([dc, dr]) => [fc + dc, fr + dr] as [number, number]).filter(([c, r]) => !this.solid(c, r) && !this.hole(c, r) && this.stepOk(fc, fr, c, r) && Math.hypot(cellX(c) - f.hx, cellZ(r) - f.hz) < 7);
            if (opts.length) [f.tc, f.tr] = opts[Math.floor(this.rand() * opts.length)];
          }
          tx = cellX(f.tc); tz = cellZ(f.tr);
        }
      } else if (f.kind === 'wisp') {
        // keeps to the edge of a strong light; dives at a weak one
        const brave = lp < 0.45 || h.dark >= 0;
        const keep = brave ? 0 : lr * 0.8;
        const near = alive && d < 11;
        f.state = !near ? 'patrol' : brave ? 'dive' : 'hover';
        if (f.state === 'dive' && f.rest === 0) {
          speed = 3.4 * this.tune.pace;
          const n = d < 1.6 ? null : next();
          if (n) { tx = cellX(n[0]); tz = cellZ(n[1]); } else { tx = h.x; tz = h.z; }
        } else if (f.state === 'hover') {
          // circle the light's edge
          const a = Math.atan2(f.z - h.z, f.x - h.x) + dt * 0.9;
          const want = Math.max(keep, 2.2);
          tx = h.x + Math.cos(a) * want; tz = h.z + Math.sin(a) * want;
          const [tc, tr] = this.cellOf(tx, tz);
          if (this.solid(tc, tr) || this.cell(tc, tr)?.k === 'wall') { tx = f.x; tz = f.z; }
          speed = d < keep ? 3 * this.tune.pace : 1.8 * this.tune.pace;
        } else {
          speed = 1.4 * this.tune.pace;
          tx = f.hx + Math.cos(f.t * 0.7 + f.id) * 2.2; tz = f.hz + Math.sin(f.t * 0.9 + f.id) * 2.2;
          const [tc, tr] = this.cellOf(tx, tz);
          if (this.solid(tc, tr)) { tx = f.hx; tz = f.hz; }
        }
      } else {
        // guardian statues move only unseen: outside the hero's light, not faced, away from lit fires
        const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
        const faced = d > 0.01 && (-dx * fx + -dz * fz) / d > 0.55 && d < 10 && lp > 0.15;
        const lit = d < lr * 0.92 || this.things.some((t) => t.on && (t.kind === 'brazier' || t.kind === 'sconce' || t.kind === 'puzzle') && Math.hypot(cellX(t.c) - f.x, cellZ(t.r) - f.z) < WARM_R + 0.6) || this.flareT > 0;
        const seen = faced || lit || !alive;
        const was = f.state;
        f.state = seen ? 'frozen' : 'move';
        if (f.state === 'move' && f.rest === 0 && d < 16) {
          speed = 2.9 * this.tune.pace;
          const n = d < 1.6 ? null : next();
          if (n) { tx = cellX(n[0]); tz = cellZ(n[1]); } else { tx = h.x; tz = h.z; }
          if (was !== 'move') this.events.push({ e: 'grind', x: f.x, z: f.z });
        }
      }
      // after a hit it backs off
      if (f.rest > 0 && f.kind !== 'guardian') { speed = 2.2 * this.tune.pace; tx = f.x - dx; tz = f.z - dz; }
      // move toward the target
      const mx = tx - f.x, mz = tz - f.z, ml = Math.hypot(mx, mz);
      f.moving = speed > 0 && ml > 0.05;
      if (f.moving) {
        const s = Math.min(ml, speed * dt);
        const nx = f.x + (mx / ml) * s, nz = f.z + (mz / ml) * s;
        const [nc, nr] = this.cellOf(nx, nz);
        if (!this.solid(nc, nr) && (f.kind === 'wisp' || !this.hole(nc, nr))) { f.x = nx; f.z = nz; }
        f.yaw = Math.atan2(mx, mz);
      }
      f.y = f.kind === 'wisp' ? 0.9 + Math.sin(f.t * 3) * 0.15 : this.floorY(...this.cellOf(f.x, f.z), f.x, f.z);
      // touching the hero
      if (alive && d < 0.8 && f.rest === 0 && Math.abs(f.y - h.y) < 1.6) {
        if (h.powers.ghost > 0) continue;
        this.damage(1, f.x, f.z, f.kind);
        f.rest = f.kind === 'guardian' ? 1.4 : 2.4;
      }
    }
  }
}

/** Score of a cleared level beyond its pickups (the summary shows each part). */
export function clearBonus(s: Sim): { time: number; noHit: number } {
  return { time: Math.round(Math.max(0, s.c.par - s.stats.time) * SCORE.perSecond), noHit: s.stats.hits === 0 ? SCORE.noHit : 0 };
}
