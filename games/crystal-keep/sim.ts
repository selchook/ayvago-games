// Crystal Keep: the pure tower-defense simulation (no three.js, no Phaser), shared by the game
// and the headless balance bot. Units: one map tile = 1, time in seconds. The view reads the
// state and the per-step `events`; it never changes the rules.

export type TowerKind = 'ballista' | 'cannon' | 'catapult' | 'turret';
export type EnemyKind = 'zombie' | 'runner' | 'brute' | 'ufo' | 'gunship' | 'giant' | 'mothership';
export type Ammo = 'arrow' | 'cannonball' | 'boulder' | 'bullet';
export type Difficulty = 'easy' | 'normal';
/** Which enemy in range a tower shoots: the one furthest along the path, the toughest, or the nearest. */
export type TargetMode = 'first' | 'strong' | 'close';
export const TARGET_MODES: TargetMode[] = ['first', 'strong', 'close'];

export const TOWER_KINDS: TowerKind[] = ['ballista', 'cannon', 'catapult', 'turret'];

export interface TierStats {
  /** Gold to build (tier 1) or to upgrade into this tier. */
  cost: number;
  range: number;
  dmg: number;
  /** Seconds between shots. */
  every: number;
  /** Splash radius (0 = single target). */
  splash: number;
}

export interface TowerDef {
  ammo: Ammo;
  air: boolean;
  ground: boolean;
  /** 'pierce' is halved by armour; 'blast' ignores it. */
  dmgType: 'pierce' | 'blast';
  /** Damage factor against flying enemies. */
  airK: number;
  /** Projectile speed (tiles/s) and lob height per tile of distance (0 = straight, homing). */
  speed: number;
  lob: number;
  tiers: [TierStats, TierStats, TierStats];
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  ballista: {
    ammo: 'arrow', air: true, ground: true, dmgType: 'pierce', airK: 1, speed: 11, lob: 0,
    tiers: [
      { cost: 70, range: 2.6, dmg: 13, every: 0.9, splash: 0 },
      { cost: 65, range: 2.9, dmg: 24, every: 0.8, splash: 0 },
      { cost: 120, range: 3.2, dmg: 42, every: 0.7, splash: 0 },
    ],
  },
  cannon: {
    ammo: 'cannonball', air: false, ground: true, dmgType: 'blast', airK: 0, speed: 6.5, lob: 0.22,
    tiers: [
      { cost: 90, range: 2.4, dmg: 24, every: 1.35, splash: 0.85 },
      { cost: 80, range: 2.6, dmg: 42, every: 1.25, splash: 0.95 },
      { cost: 145, range: 2.9, dmg: 72, every: 1.15, splash: 1.1 },
    ],
  },
  catapult: {
    ammo: 'boulder', air: false, ground: true, dmgType: 'blast', airK: 0, speed: 4.6, lob: 0.45,
    tiers: [
      { cost: 125, range: 3.7, dmg: 40, every: 2.5, splash: 1.2 },
      { cost: 110, range: 4.1, dmg: 70, every: 2.3, splash: 1.3 },
      { cost: 175, range: 4.6, dmg: 115, every: 2.1, splash: 1.45 },
    ],
  },
  turret: {
    ammo: 'bullet', air: true, ground: true, dmgType: 'pierce', airK: 1.8, speed: 15, lob: 0,
    tiers: [
      { cost: 100, range: 2.2, dmg: 6, every: 0.24, splash: 0 },
      { cost: 85, range: 2.4, dmg: 10, every: 0.21, splash: 0 },
      { cost: 150, range: 2.7, dmg: 16, every: 0.18, splash: 0 },
    ],
  },
};

export interface EnemyDef {
  hp: number;
  /** Tiles per second. */
  speed: number;
  reward: number;
  score: number;
  /** Share of 'pierce' damage blocked (0..1). */
  armor: number;
  flying: boolean;
  /** Lives lost when it reaches the keep. */
  leak: number;
  boss: boolean;
  /** Seconds between two of this kind in a group. */
  gap: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  zombie: { hp: 42, speed: 0.85, reward: 6, score: 10, armor: 0, flying: false, leak: 1, boss: false, gap: 0.95 },
  runner: { hp: 24, speed: 1.55, reward: 5, score: 8, armor: 0, flying: false, leak: 1, boss: false, gap: 0.65 },
  brute: { hp: 150, speed: 0.58, reward: 14, score: 25, armor: 0.55, flying: false, leak: 2, boss: false, gap: 1.6 },
  ufo: { hp: 48, speed: 0.95, reward: 8, score: 15, armor: 0, flying: true, leak: 1, boss: false, gap: 1.15 },
  gunship: { hp: 160, speed: 0.7, reward: 16, score: 30, armor: 0.4, flying: true, leak: 2, boss: false, gap: 1.7 },
  giant: { hp: 1000, speed: 0.42, reward: 100, score: 300, armor: 0.3, flying: false, leak: 10, boss: true, gap: 3 },
  mothership: { hp: 1100, speed: 0.36, reward: 120, score: 400, armor: 0.3, flying: true, leak: 10, boss: true, gap: 3 },
};

/** Normal and Easy side by side (new-game skill §7c). Normal is the real challenge. */
export const TUNING = {
  normal: { gold: 230, lives: 20, hp: 1, speed: 1, reward: 1, countdown: 14, refund: 0.7, earlyGold: 2, ramp: 1 },
  easy: { gold: 300, lives: 30, hp: 0.72, speed: 0.88, reward: 1.2, countdown: 18, refund: 0.8, earlyGold: 2, ramp: 0.75 },
};
export type Tuning = typeof TUNING.normal;

// ------------------------------------------------------------------ maps

/**
 * Map legend: `.` grass (build), `#` path, `=` bridge (path over the river), `~` river,
 * `S` spawn, `K` the crystal keep, `t` trees, `r` rocks, `c` crystals, `h` hill (all blocked).
 */
export interface MapDef {
  id: string;
  /** 'green' (the kit's colours), 'autumn' (the kit's variation-a texture) or 'snow' (snow tiles). */
  theme: 'green' | 'autumn' | 'snow';
  rows: string[];
  /** One string per wave: groups in order, a kind letter and a count (`z8 r6`). */
  waves: string[];
  /** Enemy hit points grow by this share per wave. */
  growth: number;
  /** Hit points multiplier of the whole map. */
  hpK: number;
  /** Extra starting gold on this map. */
  gold: number;
}

export const KIND_OF: Record<string, EnemyKind> = { z: 'zombie', r: 'runner', b: 'brute', u: 'ufo', g: 'gunship', G: 'giant', M: 'mothership' };

export const MAPS: MapDef[] = [
  {
    id: 'valley', theme: 'green', growth: 0.19, hpK: 1.43, gold: 0,
    rows: [
      't..S..r.',
      '...#....',
      '.###..t.',
      '.#......',
      '.#####..',
      '.....#..',
      't....#.h',
      '..####..',
      '..#.....',
      '..#####.',
      'r.....#.',
      '.c....#.',
      '.K#####.',
      '...t....',
    ],
    waves: [
      'z6', 'z9', 'r8 z4', 'z6 b2', 'u5 z6', 'r10 z6', 'b4 z8', 'u7 r8', 'b5 u5 z6', 'G1 z8', 'r12 b4 u6', 'G1 b4 u6 r10',
    ],
  },
  {
    id: 'river', theme: 'autumn', growth: 0.17, hpK: 1.52, gold: 40,
    rows: [
      '..t.~.S..',
      '....~.#..',
      '.###=##.r',
      '.#..~....',
      '.#.t~..t.',
      '.#..~....',
      '.#..~.r..',
      '.#..~....',
      '.###=###.',
      '....~..#.',
      't...~..#.',
      '....~..#.',
      '..##=###.',
      '..#.~....',
      '..#.~.t..',
      'h.K.~...r',
    ],
    waves: [
      'z8', 'r8 z4', 'z8 b2', 'u6 z6', 'r12 b2', 'b4 u6', 'G1 z8', 'g3 u6', 'r14 b4', 'g4 b4 z8', 'u10 r10', 'b6 g4', 'G1 r12 u6', 'M1 g4 b6 r10',
    ],
  },
  {
    id: 'pass', theme: 'snow', growth: 0.155, hpK: 1.53, gold: 90,
    rows: [
      't.S...S.t',
      '..#...#..',
      '..#.r.#..',
      '..#...#..',
      '..#####..',
      '....#....',
      '..t.#..t.',
      '.####....',
      '.#.......',
      '.#..r..c.',
      '.######..',
      '......#..',
      '.t....#..',
      '..#####..',
      '..#....t.',
      '..#......',
      '..####K..',
      'r......t.',
    ],
    waves: [
      'z8', 'z6 r6', 'b2 z8', 'u6 z4', 'r12 z6', 'G1 z8', 'g4 r10', 'b6 u8', 'r16 z8', 'g6 b4', 'M1 u8', 'b8 r12', 'g6 u10 b4', 'G2 z12', 'M1 G1 b4 g4 r12',
    ],
  },
];

export interface Cell { c: number; r: number }
export interface Pt { x: number; z: number }

/** World position of a cell centre (the map is centred on the origin, rows run towards +z). */
export const cellX = (W: number, c: number): number => c - (W - 1) / 2;
export const cellZ = (H: number, r: number): number => r - (H - 1) / 2;

/** A route along the path: points and their running length. */
export class Route {
  readonly len: number;
  private cum: number[];
  constructor(readonly pts: Pt[]) {
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.len = this.cum[this.cum.length - 1];
  }
  /** Position and heading (unit vector) at distance d. */
  at(d: number, out: { x: number; z: number; dx: number; dz: number } = { x: 0, z: 0, dx: 0, dz: 1 }) {
    const dd = Math.max(0, Math.min(this.len, d));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= dd) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const k = (dd - this.cum[lo]) / seg;
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.dx = (b.x - a.x) / seg;
    out.dz = (b.z - a.z) / seg;
    return out;
  }
}

export interface ParsedMap {
  def: MapDef;
  W: number;
  H: number;
  grid: string[][];
  spawns: Cell[];
  keep: Cell;
  /** Cells of every route, spawn first, keep last. */
  cellRoutes: Cell[][];
  /** Ground routes (cell centres, corners rounded) and flying routes (straight to the keep). */
  routes: Route[];
  airRoutes: Route[];
  /** Path connections per cell: bit 1 N, 2 E, 4 S, 8 W. */
  links: Map<string, number>;
  buildable: (c: number, r: number) => boolean;
}

export const N = 1, E = 2, S = 4, Wb = 8;
const DIRS: [number, number, number][] = [[0, -1, N], [1, 0, E], [0, 1, S], [-1, 0, Wb]];
const OPP: Record<number, number> = { [N]: S, [S]: N, [E]: Wb, [Wb]: E };
const isPath = (ch: string) => ch === '#' || ch === '=' || ch === 'S' || ch === 'K';
const key = (c: number, r: number) => `${c},${r}`;

export function parseMap(def: MapDef): ParsedMap {
  const H = def.rows.length, W = def.rows[0].length;
  const grid = def.rows.map((row) => row.split(''));
  const spawns: Cell[] = [];
  let keep: Cell = { c: 0, r: 0 };
  grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch === 'S') spawns.push({ c, r });
    if (ch === 'K') keep = { c, r };
  }));
  // breadth-first from the keep: every spawn follows its parents home (shortest route)
  const dist = new Map<string, number>();
  const parent = new Map<string, Cell>();
  const q: Cell[] = [keep];
  dist.set(key(keep.c, keep.r), 0);
  while (q.length) {
    const cur = q.shift()!;
    for (const [dc, dr] of DIRS) {
      const c = cur.c + dc, r = cur.r + dr;
      if (c < 0 || r < 0 || c >= W || r >= H || !isPath(grid[r][c]) || dist.has(key(c, r))) continue;
      // a bridge only links along the path, never along the river
      dist.set(key(c, r), dist.get(key(cur.c, cur.r))! + 1);
      parent.set(key(c, r), cur);
      q.push({ c, r });
    }
  }
  const links = new Map<string, number>();
  const link = (a: Cell, b: Cell) => {
    for (const [dc, dr, bit] of DIRS) {
      if (a.c + dc === b.c && a.r + dr === b.r) {
        links.set(key(a.c, a.r), (links.get(key(a.c, a.r)) ?? 0) | bit);
        links.set(key(b.c, b.r), (links.get(key(b.c, b.r)) ?? 0) | OPP[bit]);
      }
    }
  };
  const cellRoutes: Cell[][] = [];
  for (const s of spawns) {
    const cells: Cell[] = [s];
    let cur = s;
    while (!(cur.c === keep.c && cur.r === keep.r)) {
      const p = parent.get(key(cur.c, cur.r));
      if (!p) throw new Error(`map ${def.id}: spawn ${s.c},${s.r} has no path to the keep`);
      link(cur, p);
      cells.push(p);
      cur = p;
    }
    cellRoutes.push(cells);
  }
  const X = (c: number) => cellX(W, c), Z = (r: number) => cellZ(H, r);
  const routes = cellRoutes.map((cells) => {
    const pts: Pt[] = [];
    // enemies come out of the spawn pad's back edge
    const first = cells[0], second = cells[1];
    pts.push({ x: X(first.c) - (second.c - first.c) * 0.45, z: Z(first.r) - (second.r - first.r) * 0.45 });
    for (let i = 1; i < cells.length - 1; i++) {
      const a = cells[i - 1], b = cells[i], c = cells[i + 1];
      const straight = (a.c === c.c) || (a.r === c.r);
      if (straight) { pts.push({ x: X(b.c), z: Z(b.r) }); continue; }
      // a corner: a quarter arc between the two edge midpoints (the kit's round corners)
      const inX = (a.c + b.c) / 2, inZ = (a.r + b.r) / 2, outX = (c.c + b.c) / 2, outZ = (c.r + b.r) / 2;
      const cx = inX + outX - b.c, cz = inZ + outZ - b.r; // the corner the arc turns around
      const a0 = Math.atan2(inZ - cz, inX - cx), a1 = Math.atan2(outZ - cz, outX - cx);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      for (let k = 0; k <= 6; k++) {
        const ang = a0 + (da * k) / 6;
        pts.push({ x: X(cx + Math.cos(ang) * 0.5), z: Z(cz + Math.sin(ang) * 0.5) });
      }
    }
    const last = cells[cells.length - 1];
    pts.push({ x: X(last.c), z: Z(last.r) });
    return new Route(pts);
  });
  const airRoutes = cellRoutes.map((cells) => {
    const s = cells[0], k = cells[cells.length - 1];
    const sx = X(s.c), sz = Z(s.r), kx = X(k.c), kz = Z(k.r);
    // a gentle S-curve so flyers sweep over the field instead of a ruler line
    const pts: Pt[] = [];
    const nx = -(kz - sz), nz = kx - sx, nl = Math.hypot(nx, nz) || 1;
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const off = Math.sin(u * Math.PI * 2) * 1.1 * (1 - u * 0.3);
      pts.push({ x: sx + (kx - sx) * u + (nx / nl) * off, z: sz + (kz - sz) * u + (nz / nl) * off });
    }
    return new Route(pts);
  });
  const buildable = (c: number, r: number) => c >= 0 && r >= 0 && c < W && r < H && grid[r][c] === '.';
  return { def, W, H, grid, spawns, keep, cellRoutes, routes, airRoutes, links, buildable };
}

export function parseWave(s: string): { kind: EnemyKind; count: number }[] {
  return s.trim().split(/\s+/).map((g) => ({ kind: KIND_OF[g[0]], count: parseInt(g.slice(1), 10) || 1 }));
}

// ------------------------------------------------------------------ powers, cards and talents

/**
 * The keep's active powers (RPG specials). The Meteor is there from the start; the others unlock
 * on the talent board (meta.ts). A run equips up to two (three with a talent).
 */
export type PowerId = 'meteor' | 'frost' | 'lightning' | 'knights';
export const POWER_IDS: PowerId[] = ['meteor', 'frost', 'lightning', 'knights'];
export interface PowerDef {
  cooldown: number;
  /** Aimed at a point of the map (mouse hover + click, two taps, cursor + Enter); else cast at once. */
  aimed: boolean;
  /** Area radius of an aimed power (the aim ring). */
  radius: number;
  /** Its key on the keyboard. */
  key: string;
}
export const POWERS: Record<PowerId, PowerDef> = {
  meteor: { cooldown: 50, aimed: true, radius: 1.3, key: 'Q' },
  frost: { cooldown: 60, aimed: true, radius: 2.0, key: 'W' },
  lightning: { cooldown: 50, aimed: false, radius: 0, key: 'E' },
  knights: { cooldown: 70, aimed: false, radius: 0, key: 'R' },
};

/** Share of its cooldown a power (not the Meteor) still needs when a map starts. */
export const POWER_WARMUP = 1;
/** Cooldown factor with three powers equipped (the third slot is a talent). */
export const THREE_POWERS_CD = 1.3;

/** The keep's meteor strike: aimed by the player, lands after a short fall, hits ground and air. */
export const METEOR = { radius: 1.3, fall: 0.75, cooldown: 50, dmg: 40, airK: 0.6 };
/** Frost Nova: freezes everything in the circle (bosses for a shorter time); the ice shatters for a little damage. */
export const FROST = { radius: 2.0, dur: 3, bossK: 0.35, shatter: 8 };
/** Lightning Storm: strikes the enemy closest to the keep and jumps to the nearest next one. */
export const LIGHTNING = { jumps: 8, hop: 2.4, dmg: 22, falloff: 0.9 };
/** Reinforcements: knights march out of the keep up the path, block enemies and fight. */
export const KNIGHTS = { n: 2, life: 10, dmg: 11, swing: 0.6, speed: 1.6, reach: 0.62, hold: 2 };

export type CardId =
  | 'ballistaMastery' | 'siegeEngineer' | 'overclock' | 'eagleEye'
  | 'goldRush' | 'interest' | 'cheapMasonry' | 'salvage' | 'goldRain'
  | 'crystalShield' | 'regeneration' | 'thorns'
  | 'frostAura' | 'weakeningCurse'
  | 'meteorStorm' | 'quickRecharge' | 'deepFreeze' | 'overcharge' | 'veterans'
  | 'chainReaction' | 'criticalStrikes' | 'goldenTouch' | 'armourPiercer';

/** The numbers behind the cards (cards.ts lists them; the texts in strings.ts quote these). */
export const CARD_FX = {
  ballistaMastery: 0.25, siegeEngineer: 0.3, overclock: 0.2, eagleEye: 0.15,
  goldRush: 0.2, interest: { k: 0.05, cap: 40 }, cheapMasonry: 0.15, salvage: 0.9, goldRain: { base: 40, wave: 12 },
  crystalShield: 5, regeneration: 3, thorns: { r: 2.4, dmg: 45 },
  frostAura: { r: 2.6, k: 0.75 }, weakeningCurse: 0.5,
  quickRecharge: 0.75, deepFreeze: { dur: 1.5, r: 0.25 }, overcharge: { jumps: 4, dmg: 0.3 }, veterans: { n: 1, life: 5 },
  chainReaction: { r: 1.0, k: 0.3, cap: 60 }, criticalStrikes: { p: 0.1, k: 3 }, goldenTouch: 150,
};

/** What the talent board (meta.ts) changes in a run. */
export interface TalentFx {
  gold: number;
  lives: number;
  /** Power cooldown factor. */
  cdK: number;
  /** Cards to choose from in a draft. */
  draftN: number;
  /** Free rerolls per draft. */
  rerolls: number;
  /** Rare and Epic cards come more often. */
  luck: boolean;
}
export const NO_TALENTS: TalentFx = { gold: 0, lives: 0, cdK: 1, draftN: 3, rerolls: 1, luck: false };

export interface SimOpts {
  /** The equipped powers (default: the Meteor). */
  powers?: PowerId[];
  talents?: Partial<TalentFx>;
}

// ------------------------------------------------------------------ state

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  /** Distance along its route. */
  d: number;
  route: Route;
  x: number;
  z: number;
  dx: number;
  dz: number;
  alive: boolean;
  wave: number;
  /** Seconds since the last hit (for the hit flash). */
  hitT: number;
  /** Mothership: seconds to its next drop. */
  dropT: number;
  /** A small sideways offset so a group doesn't walk in one file. */
  lane: number;
  /** Seconds of Frost Nova ice left. */
  frozen: number;
  /** Held up by a knight this step. */
  blocked: boolean;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  tier: number; // 0..2
  c: number;
  r: number;
  x: number;
  z: number;
  cool: number;
  /** Yaw towards the current target. */
  aim: number;
  target: number;
  spent: number;
  kills: number;
  /** Damage dealt so far (the upgrade panel shows it). */
  dealt: number;
  mode: TargetMode;
}

/** A knight of the Reinforcements power. */
export interface Ally {
  id: number;
  route: Route;
  /** Distance along the route (they walk it backwards, from the keep towards the spawn). */
  d: number;
  lane: number;
  x: number;
  z: number;
  /** Facing (unit vector). */
  fx: number;
  fz: number;
  life: number;
  max: number;
  /** The enemy it fights (0 = walking). */
  fight: number;
  /** Enemies it holds up this step. */
  holding: number;
  /** Seconds to its next sword swing. */
  swing: number;
  alive: boolean;
}

export interface Meteor { x: number; z: number; t: number; dmg: number }

export interface Shot {
  id: number;
  ammo: Ammo;
  tower: number;
  /** Homing shots follow `target`; lobbed shots fly to (tx, tz) over `T` seconds. */
  target: number;
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  tx: number; tz: number;
  t: number;
  T: number;
  arc: number;
  dmg: number;
  splash: number;
  dmgType: 'pierce' | 'blast';
  airK: number;
  alive: boolean;
  /** Critical Strikes: this shot hits three times as hard. */
  crit?: boolean;
}

export type SimEvent =
  | { type: 'spawn'; e: Enemy }
  | { type: 'fire'; tower: Tower; shot: Shot }
  | { type: 'hit'; e: Enemy; dmg: number; shot: Shot }
  | { type: 'impact'; shot: Shot; x: number; z: number; r: number }
  | { type: 'kill'; e: Enemy; gold: number; score: number }
  | { type: 'leak'; e: Enemy; lives: number }
  | { type: 'drop'; boss: Enemy; e: Enemy }
  | { type: 'meteorCast'; m: Meteor }
  | { type: 'meteorHit'; m: Meteor; hits: number; kills: number }
  | { type: 'waveStart'; wave: number; early: number }
  | { type: 'waveSpawned'; wave: number }
  | { type: 'waveClear'; wave: number; gold: number; score: number }
  | { type: 'draft'; wave: number }
  | { type: 'frost'; x: number; z: number; r: number; hits: number }
  | { type: 'thaw'; e: Enemy }
  | { type: 'lightning'; pts: { x: number; y: number; z: number }[]; hits: number }
  | { type: 'allySpawn'; a: Ally }
  | { type: 'allyHit'; a: Ally; e: Enemy }
  | { type: 'allyGone'; a: Ally }
  | { type: 'thorns'; hits: number }
  | { type: 'blast'; x: number; z: number; r: number }
  | { type: 'crit'; x: number; z: number; fly: boolean }
  | { type: 'goldShower'; e: Enemy; gold: number }
  | { type: 'interest'; gold: number }
  | { type: 'regen'; lives: number }
  | { type: 'win' }
  | { type: 'lose' };

interface Spawner { wave: number; queue: EnemyKind[]; t: number; next: number }

export class Sim {
  readonly map: ParsedMap;
  readonly tune: Tuning;
  readonly talents: TalentFx;
  /** The equipped powers, in dock order. */
  readonly powers: PowerId[];
  gold: number;
  lives: number;
  /** Grows with Crystal Shield. */
  maxLives: number;
  /** Waves started so far (1-based index of the newest). */
  wave = 0;
  readonly totalWaves: number;
  /** Seconds to the next wave (-1 = waiting for the player before wave 1, or no wave left). */
  countdown = -1;
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  shots: Shot[] = [];
  allies: Ally[] = [];
  events: SimEvent[] = [];
  time = 0;
  score = 0;
  kills = 0;
  leaked = 0;
  over: 'win' | 'lose' | null = null;
  /** Seconds until each power is ready again (0 = ready). */
  cd: Record<PowerId, number> = { meteor: 0, frost: 0, lightning: 0, knights: 0 };
  meteors: Meteor[] = [];
  /** Cards picked in this map and how many of each. */
  cards: Partial<Record<CardId, number>> = {};
  /** The order they were picked in (the tray shows them so). */
  cardOrder: CardId[] = [];
  /** Card drafts waiting to be chosen (the game stops while one is open). */
  drafts = 0;
  private spawners: Spawner[] = [];
  private aliveByWave = new Map<number, number>();
  private spawnedDone = new Set<number>();
  private nextId = 1;
  private spawnFlip = 0;
  private tmp = { x: 0, z: 0, dx: 0, dz: 1 };
  private stat = new Map<string, TierStats>();
  private blasts: { x: number; z: number; dmg: number }[] = [];
  private keepX: number;
  private keepZ: number;

  constructor(mapIndex: number, difficulty: Difficulty, opts: SimOpts = {}) {
    this.map = parseMap(MAPS[mapIndex]);
    this.tune = TUNING[difficulty];
    this.talents = { ...NO_TALENTS, ...opts.talents };
    this.powers = (opts.powers ?? ['meteor']).slice(0, 3);
    this.gold = this.tune.gold + this.map.def.gold + this.talents.gold;
    this.lives = this.maxLives = this.tune.lives + this.talents.lives;
    this.totalWaves = this.map.def.waves.length;
    this.keepX = cellX(this.map.W, this.map.keep.c);
    this.keepZ = cellZ(this.map.H, this.map.keep.r);
    // the keep's energy split three ways: every power recharges slower
    if (this.powers.length >= 3) this.talents.cdK *= THREE_POWERS_CD;
    // the new powers charge up during the first waves; the Meteor is ready with wave 1
    for (const id of this.powers) if (id !== 'meteor') this.cd[id] = this.cooldown(id) * POWER_WARMUP;
  }

  /** Stacks of a picked card (0 = not picked). */
  stacks(id: CardId): number {
    return this.cards[id] ?? 0;
  }

  // ---------------------------------------------------------------- player actions

  towerAt(c: number, r: number): Tower | undefined {
    return this.towers.find((t) => t.c === c && t.r === r);
  }

  canBuild(c: number, r: number): boolean {
    return this.map.buildable(c, r) && !this.towerAt(c, r);
  }

  /** Gold for a new tower (Cheap Masonry takes some off). */
  buildCost(kind: TowerKind): number {
    return Math.round(TOWERS[kind].tiers[0].cost * (1 - CARD_FX.cheapMasonry * this.stacks('cheapMasonry')));
  }

  build(kind: TowerKind, c: number, r: number): Tower | null {
    const cost = this.buildCost(kind);
    if (!this.canBuild(c, r) || this.gold < cost || this.over) return null;
    this.gold -= cost;
    const t: Tower = {
      id: this.nextId++, kind, tier: 0, c, r, x: cellX(this.map.W, c), z: cellZ(this.map.H, r),
      cool: 0.3, aim: Math.PI, target: 0, spent: cost, kills: 0, dealt: 0, mode: 'first',
    };
    this.towers.push(t);
    return t;
  }

  upgradeCost(t: Tower): number | null {
    return t.tier >= 2 ? null : Math.round(TOWERS[t.kind].tiers[t.tier + 1].cost * (1 - CARD_FX.cheapMasonry * this.stacks('cheapMasonry')));
  }

  upgrade(t: Tower): boolean {
    const cost = this.upgradeCost(t);
    if (cost === null || this.gold < cost || this.over) return false;
    this.gold -= cost;
    t.spent += cost;
    t.tier++;
    return true;
  }

  refund(t: Tower): number {
    return Math.floor(t.spent * (this.stacks('salvage') ? Math.max(this.tune.refund, CARD_FX.salvage) : this.tune.refund));
  }

  sell(t: Tower): number {
    const i = this.towers.indexOf(t);
    if (i < 0 || this.over) return 0;
    const g = this.refund(t);
    this.gold += g;
    this.towers.splice(i, 1);
    return g;
  }

  /** Switches a tower to the next targeting mode. */
  cycleMode(t: Tower): TargetMode {
    t.mode = TARGET_MODES[(TARGET_MODES.indexOf(t.mode) + 1) % TARGET_MODES.length];
    return t.mode;
  }

  /** A tower's numbers with the picked cards applied. */
  towerStats(kind: TowerKind, tier: number): TierStats {
    const key = kind + tier;
    let s = this.stat.get(key);
    if (s) return s;
    const b = TOWERS[kind].tiers[tier];
    s = { ...b };
    if (kind === 'ballista') s.dmg = Math.round(b.dmg * (1 + CARD_FX.ballistaMastery * this.stacks('ballistaMastery')));
    if (kind === 'cannon' || kind === 'catapult') s.splash = b.splash * (1 + CARD_FX.siegeEngineer * this.stacks('siegeEngineer'));
    if (kind === 'turret') s.every = b.every / (1 + CARD_FX.overclock * this.stacks('overclock'));
    s.range = b.range * (1 + CARD_FX.eagleEye * this.stacks('eagleEye'));
    this.stat.set(key, s);
    return s;
  }

  /** Takes a card from a draft: its instant part happens now, the rest lasts for this map. */
  pickCard(id: CardId): void {
    this.cards[id] = this.stacks(id) + 1;
    if (!this.cardOrder.includes(id)) this.cardOrder.push(id);
    this.stat.clear();
    if (this.drafts > 0) this.drafts--;
    if (id === 'crystalShield') { this.maxLives += CARD_FX.crystalShield; this.lives += CARD_FX.crystalShield; }
    if (id === 'goldRain') this.gold += this.goldRainGold();
  }

  /** Gold of the Gold Rain card at the current wave. */
  goldRainGold(): number {
    return CARD_FX.goldRain.base + CARD_FX.goldRain.wave * Math.max(1, this.wave);
  }

  /** Damage factor of the powers at the current wave (they grow with the enemies' hit points). */
  powerScale(): number {
    return this.hpScale(Math.max(1, this.wave)) / this.tune.hp;
  }

  /** Meteor damage at the current wave. */
  meteorDmg(): number {
    return Math.round(METEOR.dmg * this.powerScale());
  }

  /** A power's full cooldown with the talents and Quick Recharge. */
  cooldown(id: PowerId): number {
    return POWERS[id].cooldown * this.talents.cdK * Math.pow(CARD_FX.quickRecharge, this.stacks('quickRecharge'));
  }

  powerReady(id: PowerId): boolean {
    return this.powers.includes(id) && this.cd[id] <= 0 && !this.over && this.wave > 0;
  }

  /** The radius of an aimed power's circle. */
  powerRadius(id: PowerId): number {
    return id === 'frost' ? FROST.radius * (1 + CARD_FX.deepFreeze.r * this.stacks('deepFreeze')) : POWERS[id].radius;
  }

  /** Casts a power (aimed ones at x, z); false while it recharges or (Lightning) with no target. */
  castPower(id: PowerId, x = 0, z = 0): boolean {
    if (!this.powerReady(id)) return false;
    let ok = true;
    if (id === 'meteor') this.castMeteorAt(x, z);
    else if (id === 'frost') this.castFrost(x, z);
    else if (id === 'lightning') ok = this.castLightning();
    else this.castKnights();
    if (ok) this.cd[id] = this.cooldown(id);
    return ok;
  }

  // the meteor (kept for the menu's autopilot and older callers)
  get meteorCd(): number { return this.cd.meteor; }
  meteorReady(): boolean { return this.powerReady('meteor'); }
  castMeteor(x: number, z: number): boolean { return this.castPower('meteor', x, z); }

  private castMeteorAt(x: number, z: number): void {
    const add = (mx: number, mz: number, delay: number) => {
      const m: Meteor = { x: mx, z: mz, t: METEOR.fall + delay, dmg: this.meteorDmg() };
      this.meteors.push(m);
      this.events.push({ type: 'meteorCast', m });
    };
    add(x, z, 0);
    // Meteor Storm: two more rocks around the first, a moment later
    if (this.stacks('meteorStorm')) {
      const a = Math.random() * Math.PI * 2;
      add(x + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1, 0.22);
      add(x + Math.cos(a + 2.4) * 1.1, z + Math.sin(a + 2.4) * 1.1, 0.44);
    }
  }

  private castFrost(x: number, z: number): void {
    const r = this.powerRadius('frost');
    const dur = FROST.dur + CARD_FX.deepFreeze.dur * this.stacks('deepFreeze');
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - x, e.z - z) > r) continue;
      e.frozen = Math.max(e.frozen, dur * (ENEMIES[e.kind].boss ? FROST.bossK : 1));
      hits++;
    }
    this.events.push({ type: 'frost', x, z, r, hits });
  }

  private castLightning(): boolean {
    let cur: Enemy | null = null;
    for (const e of this.enemies) if (e.alive && (!cur || this.progress(e) > this.progress(cur))) cur = e;
    if (!cur) return false;
    const over = this.stacks('overcharge');
    const jumps = LIGHTNING.jumps + CARD_FX.overcharge.jumps * over;
    let dmg = LIGHTNING.dmg * this.powerScale() * (1 + CARD_FX.overcharge.dmg * over);
    const pts = [{ x: cur.x + 0.8, y: 7, z: cur.z - 1.6 }];
    const hit = new Set<number>();
    const shot = this.powerShot(0, 1);
    while (cur && hit.size < jumps) {
      const e: Enemy = cur;
      hit.add(e.id);
      pts.push({ x: e.x, y: ENEMIES[e.kind].flying ? 1.45 : 0.55, z: e.z });
      this.damage(e, dmg, 'blast', 1, shot);
      dmg *= LIGHTNING.falloff;
      let next: Enemy | null = null, best = LIGHTNING.hop;
      for (const o of this.enemies) {
        if (!o.alive || hit.has(o.id)) continue;
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        if (d < best) { best = d; next = o; }
      }
      cur = next;
    }
    this.events.push({ type: 'lightning', pts, hits: hit.size });
    this.flushBlasts();
    return true;
  }

  private castKnights(): void {
    const vets = this.stacks('veterans');
    const n = KNIGHTS.n + CARD_FX.veterans.n * vets;
    const life = KNIGHTS.life + CARD_FX.veterans.life * vets;
    const routes = this.map.routes;
    for (let i = 0; i < n; i++) {
      const route = routes[i % routes.length];
      const row = Math.floor(i / routes.length);
      const a: Ally = {
        id: this.nextId++, route, d: route.len - 0.3 - row * 0.4, lane: ((i % 2) - 0.5) * 0.36,
        x: 0, z: 0, fx: 0, fz: -1, life, max: life, fight: 0, holding: 0, swing: 0.2 + i * 0.1, alive: true,
      };
      this.placeAlly(a);
      this.allies.push(a);
      this.events.push({ type: 'allySpawn', a });
    }
  }

  private placeAlly(a: Ally): void {
    const p = a.route.at(a.d, this.tmp);
    a.x = p.x - p.dz * a.lane;
    a.z = p.z + p.dx * a.lane;
    if (!a.fight) { a.fx = -p.dx; a.fz = -p.dz; }
  }

  /** Gold for calling the next wave now. */
  earlyBonus(): number {
    return this.countdown > 0 ? Math.ceil(this.countdown) * this.tune.earlyGold : 0;
  }

  canCallWave(): boolean {
    return !this.over && this.wave < this.totalWaves && (this.wave === 0 || this.countdown >= 0);
  }

  /** Starts the next wave (early: bonus gold and score for the seconds left). */
  callWave(): number {
    if (!this.canCallWave()) return 0;
    const early = this.wave > 0 ? this.earlyBonus() : 0;
    this.gold += early;
    this.score += early * 5;
    this.startWave(early);
    return early;
  }

  /** True when a wave brings a boss (a card draft follows when it is cleared). */
  bossWave(wave: number): boolean {
    const s = this.map.def.waves[wave - 1];
    return !!s && parseWave(s).some((g) => ENEMIES[g.kind].boss);
  }

  /** Enemy kinds still to come after the current wave (cards that would do nothing are not offered). */
  kindsAhead(): Set<EnemyKind> {
    const out = new Set<EnemyKind>();
    for (let w = Math.max(1, this.wave); w <= this.totalWaves; w++) for (const g of parseWave(this.map.def.waves[w - 1])) out.add(g.kind);
    return out;
  }

  // ---------------------------------------------------------------- internals

  private hpScale(wave: number, boss = false): number {
    const d = this.map.def;
    return d.hpK * (1 + d.growth * (wave - 1) * this.tune.ramp * (boss ? 0.5 : 1)) * this.tune.hp;
  }

  private startWave(early: number): void {
    this.wave++;
    this.countdown = -1;
    const queue: EnemyKind[] = [];
    for (const g of parseWave(this.map.def.waves[this.wave - 1])) for (let i = 0; i < g.count; i++) queue.push(g.kind);
    this.spawners.push({ wave: this.wave, queue, t: 0, next: 0.2 });
    this.aliveByWave.set(this.wave, 0);
    this.events.push({ type: 'waveStart', wave: this.wave, early });
    // Interest: a share of the banked gold
    if (this.stacks('interest') && this.wave > 1) {
      const g = Math.min(CARD_FX.interest.cap, Math.floor(this.gold * CARD_FX.interest.k));
      if (g > 0) { this.gold += g; this.events.push({ type: 'interest', gold: g }); }
    }
  }

  spawn(kind: EnemyKind, wave: number, routeIx?: number, d = 0): Enemy {
    const def = ENEMIES[kind];
    const ix = routeIx ?? (this.spawnFlip++ % this.map.routes.length);
    const route = def.flying ? this.map.airRoutes[ix] : this.map.routes[ix];
    const hp = Math.round(def.hp * this.hpScale(Math.max(1, wave), def.boss));
    const e: Enemy = {
      id: this.nextId++, kind, hp, maxHp: hp, speed: def.speed * this.tune.speed * (0.96 + Math.random() * 0.08),
      d, route, x: 0, z: 0, dx: 0, dz: 1, alive: true, wave, hitT: 9, dropT: 5, lane: def.boss ? 0 : (Math.random() - 0.5) * 0.3,
      frozen: 0, blocked: false,
    };
    route.at(d, this.tmp);
    e.x = this.tmp.x; e.z = this.tmp.z; e.dx = this.tmp.dx; e.dz = this.tmp.dz;
    this.enemies.push(e);
    this.aliveByWave.set(wave, (this.aliveByWave.get(wave) ?? 0) + 1);
    this.events.push({ type: 'spawn', e });
    return e;
  }

  /** Where an enemy will be after `t` seconds (lobbed shots lead their target). */
  predict(e: Enemy, t: number): Pt {
    const moving = e.frozen > 0 || e.blocked ? Math.max(0, t - e.frozen) * (e.blocked ? 0 : 1) : t;
    const p = e.route.at(e.d + e.speed * moving, this.tmp);
    return { x: p.x - p.dz * e.lane, z: p.z + p.dx * e.lane };
  }

  /** A shot that stands for a power or a blast (no tower gets the credit). */
  private powerShot(dmg: number, splash: number): Shot {
    return {
      id: 0, ammo: 'boulder', tower: 0, target: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0,
      t: 0, T: 0, arc: 0, dmg, splash, dmgType: 'blast', airK: 1, alive: false,
    };
  }

  private damage(e: Enemy, raw: number, type: 'pierce' | 'blast', airK: number, shot: Shot): void {
    if (!e.alive) return;
    const def = ENEMIES[e.kind];
    let dmg = raw * (def.flying ? airK : 1);
    if (type === 'pierce') {
      const tk = shot.tower ? this.towerKindOf(shot) : null;
      const pierced = this.stacks('armourPiercer') && (tk === 'ballista' || tk === 'turret');
      const armor = pierced ? 0 : def.armor * (this.stacks('weakeningCurse') ? CARD_FX.weakeningCurse : 1);
      dmg *= 1 - armor;
    }
    dmg = Math.max(1, Math.round(dmg));
    const tw = shot.tower ? this.towers.find((t) => t.id === shot.tower) : undefined;
    if (tw) tw.dealt += Math.min(dmg, e.hp);
    e.hp -= dmg;
    e.hitT = 0;
    this.events.push({ type: 'hit', e, dmg, shot });
    if (e.hp <= 0) {
      e.alive = false;
      const gold = Math.round(def.reward * this.tune.reward * (1 + 0.04 * (e.wave - 1)) * (1 + CARD_FX.goldRush * this.stacks('goldRush')));
      this.gold += gold;
      this.score += def.score;
      this.kills++;
      if (tw) tw.kills++;
      this.events.push({ type: 'kill', e, gold, score: def.score });
      if (def.boss && this.stacks('goldenTouch')) {
        const g = CARD_FX.goldenTouch * this.stacks('goldenTouch');
        this.gold += g;
        this.events.push({ type: 'goldShower', e, gold: g });
      }
      // Chain Reaction: the fallen burst and hurt their neighbours
      if (this.stacks('chainReaction')) {
        const fx = CARD_FX.chainReaction;
        this.blasts.push({ x: e.x, z: e.z, dmg: Math.min(e.maxHp * fx.k, fx.cap * this.powerScale()) * this.stacks('chainReaction') });
      }
      this.removed(e);
    }
  }

  /** Chain Reaction blasts (one may set off the next; a cap keeps a huge chain finite). */
  private flushBlasts(): void {
    let n = 0;
    const r = CARD_FX.chainReaction.r;
    while (this.blasts.length && n++ < 120 && !this.over) {
      const b = this.blasts.shift()!;
      this.events.push({ type: 'blast', x: b.x, z: b.z, r });
      const shot = this.powerShot(b.dmg, r);
      for (const e of this.enemies) {
        if (!e.alive || Math.hypot(e.x - b.x, e.z - b.z) > r) continue;
        this.damage(e, b.dmg, 'blast', 1, shot);
      }
    }
    this.blasts.length = 0;
  }

  private removed(e: Enemy): void {
    const n = (this.aliveByWave.get(e.wave) ?? 1) - 1;
    this.aliveByWave.set(e.wave, n);
    this.checkWaveClear(e.wave);
  }

  private checkWaveClear(wave: number): void {
    if (this.over) return;
    if ((this.aliveByWave.get(wave) ?? 0) > 0 || !this.spawnedDone.has(wave) || this.over) return;
    this.aliveByWave.delete(wave);
    const gold = 15 + wave * 3;
    const score = 50 + wave * 10;
    this.gold += gold;
    this.score += score;
    this.events.push({ type: 'waveClear', wave, gold, score });
    if (this.wave === this.totalWaves && this.aliveByWave.size === 0 && this.spawners.length === 0) {
      this.over = 'win';
      this.events.push({ type: 'win' });
      return;
    }
    // Regeneration: lives back every few waves
    const regen = this.stacks('regeneration');
    if (regen && wave % CARD_FX.regeneration === 0 && this.lives < this.maxLives) {
      const n = Math.min(regen, this.maxLives - this.lives);
      this.lives += n;
      this.events.push({ type: 'regen', lives: n });
    }
    // a card draft after every third wave and after every boss
    if (wave < this.totalWaves && (wave % 3 === 0 || this.bossWave(wave))) {
      this.drafts++;
      this.events.push({ type: 'draft', wave });
    }
  }

  private inRange(t: Tower, e: Enemy, range: number): boolean {
    return (e.x - t.x) ** 2 + (e.z - t.z) ** 2 <= range * range;
  }

  /** Progress share of an enemy along its route (towers shoot the one closest to the keep). */
  private progress(e: Enemy): number {
    return e.d / e.route.len;
  }

  step(dt: number): void {
    if (this.over) return;
    this.time += dt;
    if (this.wave > 0) for (const id of POWER_IDS) this.cd[id] = Math.max(0, this.cd[id] - dt);
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t -= dt;
      if (m.t > 0) continue;
      this.meteors.splice(i, 1);
      this.meteorHit(m);
      if (this.over) return;
    }
    // waves
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave(0);
    }
    for (let i = this.spawners.length - 1; i >= 0; i--) {
      const sp = this.spawners[i];
      sp.t += dt;
      while (sp.queue.length && sp.t >= sp.next) {
        const kind = sp.queue.shift()!;
        this.spawn(kind, sp.wave);
        const nextKind = sp.queue[0];
        const gap = nextKind ? (nextKind === kind ? ENEMIES[kind].gap : 1.8) : 0;
        sp.next += gap / Math.min(1.25, this.tune.speed + 0.12);
      }
      if (!sp.queue.length) {
        this.spawners.splice(i, 1);
        this.spawnedDone.add(sp.wave);
        this.events.push({ type: 'waveSpawned', wave: sp.wave });
        if (sp.wave === this.wave && this.wave < this.totalWaves) this.countdown = this.tune.countdown;
        this.checkWaveClear(sp.wave);
      }
    }
    // knights: hold the path and fight
    for (const a of this.allies) a.holding = 0;
    const aura = this.stacks('frostAura') ? CARD_FX.frostAura : null;
    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.hitT += dt;
      e.blocked = false;
      if (e.frozen > 0) {
        e.frozen -= dt;
        if (e.frozen <= 0) {
          e.frozen = 0;
          this.events.push({ type: 'thaw', e });
          this.damage(e, FROST.shatter * this.powerScale(), 'blast', 1, this.powerShot(0, 0));
          if (!e.alive) continue;
        } else continue;
      }
      const def = ENEMIES[e.kind];
      let sp = e.speed;
      if (aura && Math.hypot(e.x - this.keepX, e.z - this.keepZ) < aura.r) sp *= aura.k;
      if (!def.flying && !def.boss) {
        for (const a of this.allies) {
          if (!a.alive || a.holding >= KNIGHTS.hold) continue;
          const ax = a.x - e.x, az = a.z - e.z;
          if (ax * ax + az * az < KNIGHTS.reach * KNIGHTS.reach && ax * e.dx + az * e.dz > -0.15) { a.holding++; e.blocked = true; break; }
        }
      }
      if (e.blocked) continue;
      e.d += sp * dt;
      const p = e.route.at(e.d, this.tmp);
      e.x = p.x - p.dz * e.lane;
      e.z = p.z + p.dx * e.lane;
      e.dx = p.dx; e.dz = p.dz;
      if (e.kind === 'mothership') {
        e.dropT -= dt;
        if (e.dropT <= 0 && e.d < e.route.len - 2) {
          e.dropT = 6.5;
          for (let k = 0; k < 2; k++) {
            const ix = this.map.airRoutes.indexOf(e.route);
            const m = this.spawn('ufo', e.wave, ix, Math.max(0, e.d - 0.3 - k * 0.5));
            m.lane = (k - 0.5) * 0.6;
            this.events.push({ type: 'drop', boss: e, e: m });
          }
        }
      }
      if (e.d >= e.route.len) {
        e.alive = false;
        this.lives = Math.max(0, this.lives - def.leak);
        this.leaked += def.leak;
        this.events.push({ type: 'leak', e, lives: def.leak });
        if (this.lives <= 0) {
          this.over = 'lose';
          this.events.push({ type: 'lose' });
          this.removed(e);
          return;
        }
        this.removed(e);
        this.thorns();
      }
    }
    if (this.over) return;
    this.stepAllies(dt);
    // towers
    const critP = CARD_FX.criticalStrikes.p * this.stacks('criticalStrikes');
    for (const t of this.towers) {
      const def = TOWERS[t.kind];
      const st = this.towerStats(t.kind, t.tier);
      t.cool -= dt;
      let best: Enemy | null = null;
      let bestP = -Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const fly = ENEMIES[e.kind].flying;
        if (fly ? !def.air : !def.ground) continue;
        if (!this.inRange(t, e, st.range)) continue;
        const pr = this.progress(e) + (ENEMIES[e.kind].boss ? 0.02 : 0);
        const v = t.mode === 'strong' ? e.hp + pr : t.mode === 'close' ? -Math.hypot(e.x - t.x, e.z - t.z) + pr * 0.01 : pr;
        if (v > bestP) { bestP = v; best = e; }
      }
      t.target = best ? best.id : 0;
      if (!best) continue;
      t.aim = Math.atan2(best.x - t.x, best.z - t.z);
      if (t.cool > 0) continue;
      t.cool = st.every;
      const fly = ENEMIES[best.kind].flying;
      const muzzleY = 0.9 + t.tier * 0.55;
      const crit = critP > 0 && Math.random() < critP;
      const shot: Shot = {
        id: this.nextId++, ammo: def.ammo, tower: t.id, target: best.id,
        x: t.x, y: muzzleY, z: t.z, sx: t.x, sy: muzzleY, sz: t.z, tx: best.x, tz: best.z,
        t: 0, T: 0, arc: 0, dmg: st.dmg * (crit ? CARD_FX.criticalStrikes.k : 1), splash: st.splash, dmgType: def.dmgType, airK: def.airK, alive: true, crit,
      };
      if (def.lob > 0 && !fly) {
        // lobbed: aim where the target will be when the shot lands
        let T = Math.hypot(best.x - t.x, best.z - t.z) / def.speed + 0.15;
        let p = this.predict(best, T);
        T = Math.hypot(p.x - t.x, p.z - t.z) / def.speed + 0.15;
        p = this.predict(best, T);
        shot.tx = p.x; shot.tz = p.z; shot.T = T;
        shot.arc = 0.4 + Math.hypot(p.x - t.x, p.z - t.z) * def.lob * 2;
        shot.target = 0;
      }
      this.shots.push(shot);
      this.events.push({ type: 'fire', tower: t, shot });
    }
    // shots
    for (const s of this.shots) {
      if (!s.alive) continue;
      const def = TOWERS[this.towerKindOf(s)];
      if (s.target) {
        const e = this.enemies.find((q) => q.id === s.target);
        if (e && e.alive) {
          s.tx = e.x; s.tz = e.z;
        }
        const ty = e && ENEMIES[e.kind].flying ? 1.45 : 0.45;
        const dx = s.tx - s.x, dz = s.tz - s.z, dy = ty - s.y;
        const dist = Math.hypot(dx, dy, dz);
        const stepLen = def.speed * dt;
        if (dist <= stepLen + 0.05) {
          s.alive = false;
          if (e && e.alive) {
            if (s.crit) this.events.push({ type: 'crit', x: e.x, z: e.z, fly: ENEMIES[e.kind].flying });
            this.damage(e, s.dmg, s.dmgType, s.airK, s);
          } else this.events.push({ type: 'impact', shot: s, x: s.tx, z: s.tz, r: 0 });
          continue;
        }
        s.x += (dx / dist) * stepLen;
        s.y += (dy / dist) * stepLen;
        s.z += (dz / dist) * stepLen;
        s.t += dt;
      } else {
        s.t += dt;
        const u = Math.min(1, s.t / s.T);
        s.x = s.sx + (s.tx - s.sx) * u;
        s.z = s.sz + (s.tz - s.sz) * u;
        s.y = s.sy + (0.2 - s.sy) * u + s.arc * 4 * u * (1 - u);
        if (u >= 1) {
          s.alive = false;
          this.events.push({ type: 'impact', shot: s, x: s.tx, z: s.tz, r: s.splash });
          if (s.crit) this.events.push({ type: 'crit', x: s.tx, z: s.tz, fly: false });
          for (const e of this.enemies) {
            if (!e.alive || ENEMIES[e.kind].flying) continue;
            const d = Math.hypot(e.x - s.tx, e.z - s.tz);
            if (d > s.splash) continue;
            this.damage(e, s.dmg * (1 - 0.45 * (d / s.splash)), s.dmgType, s.airK, s);
          }
        }
      }
    }
    this.flushBlasts();
    // tidy up
    if (this.enemies.length > 80 || this.shots.length > 120) {
      this.enemies = this.enemies.filter((e) => e.alive);
      this.shots = this.shots.filter((s) => s.alive);
    }
  }

  /** Knights walk up the path, stop at the first enemy and swing at it until their time is up. */
  private stepAllies(dt: number): void {
    if (!this.allies.length) return;
    const shot = this.powerShot(0, 0);
    for (const a of this.allies) {
      if (!a.alive) continue;
      a.life -= dt;
      if (a.life <= 0) {
        a.alive = false;
        this.events.push({ type: 'allyGone', a });
        continue;
      }
      let tgt: Enemy | null = null, best = KNIGHTS.reach + 0.12;
      for (const e of this.enemies) {
        if (!e.alive || ENEMIES[e.kind].flying) continue;
        const d = Math.hypot(e.x - a.x, e.z - a.z);
        if (d < best) { best = d; tgt = e; }
      }
      if (tgt) {
        a.fight = tgt.id;
        const l = Math.hypot(tgt.x - a.x, tgt.z - a.z) || 1;
        a.fx = (tgt.x - a.x) / l; a.fz = (tgt.z - a.z) / l;
        a.swing -= dt;
        if (a.swing <= 0) {
          a.swing = KNIGHTS.swing;
          this.events.push({ type: 'allyHit', a, e: tgt });
          this.damage(tgt, KNIGHTS.dmg * this.powerScale(), 'pierce', 1, shot);
        }
      } else {
        a.fight = 0;
        a.swing = Math.min(a.swing, 0.25);
        a.d = Math.max(0.8, a.d - KNIGHTS.speed * dt);
        this.placeAlly(a);
      }
    }
    if (this.allies.some((a) => !a.alive)) this.allies = this.allies.filter((a) => a.alive);
  }

  /** Thorns: an enemy that reaches the keep sets off a blast around it. */
  private thorns(): void {
    if (!this.stacks('thorns')) return;
    const fx = CARD_FX.thorns;
    const shot = this.powerShot(0, fx.r);
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - this.keepX, e.z - this.keepZ) > fx.r) continue;
      hits++;
      this.damage(e, fx.dmg * this.powerScale(), 'blast', 1, shot);
    }
    this.events.push({ type: 'thorns', hits });
  }

  private meteorHit(m: Meteor): void {
    const shot = this.powerShot(m.dmg, METEOR.radius);
    shot.x = shot.tx = shot.sx = m.x;
    shot.z = shot.tz = shot.sz = m.z;
    let hits = 0, kills = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - m.x, e.z - m.z);
      if (d > METEOR.radius) continue;
      hits++;
      this.damage(e, m.dmg * (1 - 0.35 * (d / METEOR.radius)), 'blast', METEOR.airK, shot);
      if (!e.alive) kills++;
    }
    this.events.push({ type: 'meteorHit', m, hits, kills });
    this.flushBlasts();
  }

  private towerKindOf(s: Shot): TowerKind {
    return s.ammo === 'arrow' ? 'ballista' : s.ammo === 'cannonball' ? 'cannon' : s.ammo === 'boulder' ? 'catapult' : 'turret';
  }

  /** Drops dead enemies and spent shots (the view calls this after reading the events). */
  compact(): void {
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.shots.some((s) => !s.alive)) this.shots = this.shots.filter((s) => s.alive);
  }

  /** Stars for a cleared map: by the share of lives left. */
  stars(): number {
    if (this.over !== 'win') return 0;
    const k = this.lives / this.maxLives;
    return k >= 0.85 ? 3 : k >= 0.5 ? 2 : 1;
  }

  /** Points for clearing the map (lives and stars). */
  clearBonus(): number {
    return this.lives * 20 + this.stars() * 250;
  }

  /** Enemy kinds of a wave (1-based), for previews. */
  waveKinds(wave: number): { kind: EnemyKind; count: number }[] {
    const s = this.map.def.waves[wave - 1];
    if (!s) return [];
    const m = new Map<EnemyKind, number>();
    for (const g of parseWave(s)) m.set(g.kind, (m.get(g.kind) ?? 0) + g.count);
    return [...m.entries()].map(([kind, count]) => ({ kind, count }));
  }

  /** Revive (rewarded continue): lives back and the enemies closest to the keep cleared. */
  revive(lives: number): Enemy[] {
    this.over = null;
    this.lives = Math.min(this.maxLives, lives);
    const gone: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.alive && (e.d / e.route.len > 0.6 || ENEMIES[e.kind].boss && e.d / e.route.len > 0.8)) {
        if (ENEMIES[e.kind].boss) { e.d = e.route.len * 0.5; continue; }
        e.alive = false;
        gone.push(e);
        this.removed(e);
      }
    }
    return gone;
  }
}
