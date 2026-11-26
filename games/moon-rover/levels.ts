// Moon Rover: the twenty hand-built missions in four regions, and the parser that turns their maps
// into terrain, objectives and hazards. A map is a grid of 4 m tiles (north is up, row 0):
//   terrain   0-5 ground at that level (2 m a level) · . chasm · ^ v < > a ramp rising north, south,
//             west or east (from the level of the tile behind it; a kicker when the tile ahead is not
//             higher) · _ road · i ice · d dust · c crystal field (slow) · o crater · O big crater ·
//             p pit crater (a hole) · r small rocks · l lamp post · t monorail track (straight lines)
//   places    B base pad (2×2: the start, the return, a charger) · H hangar block · Q habitat dome
//             block · L launch tower and rocket (2×2) · U outpost (a supply drop) · E charging pad
//             (also a checkpoint) · G checkpoint gate · M force-field gate (on and off on a cycle)
//   things    C crystal sample · A stranded astronaut · P power pick-up (the level's `powers` in map
//             order) · X the hidden alien (bonus) · N generator (the miner set-piece) · Z the rogue
//             miner's start
//   obstacles T turret · Y double turret · R boulder · K crystal boulder · S tower · D dish · F fuel
//             barrels · W antenna
// Every non-digit tile takes the level of the nearest digit tile (breadth first).
import { TILE, STEP, type RegionId, type PowerId, REGION_IDS } from './defs';

export type Surf = 'rock' | 'road' | 'ice' | 'dust' | 'field';

export interface Tile {
  k: 'ground' | 'chasm' | 'ramp';
  /** Height level (the low end of a ramp). */
  L: number;
  /** A ramp's rising direction: 0 N, 1 E, 2 S, 3 W. */
  dir: number;
  surf: Surf;
  /** The map character. */
  ch: string;
  /** Something solid stands on it (the bot's planner avoids it). */
  solid: boolean;
}

export interface Crater { x: number; z: number; R: number; H: number; large: boolean; pit: boolean; fresh?: boolean }

export interface Spot { x: number; z: number; y: number; c: number; r: number }

export interface Obstacle {
  kind: 'boulder' | 'crystalRock' | 'tower' | 'dish' | 'fuel' | 'antenna' | 'lamp' | 'hangar' | 'dome' | 'rocket' | 'turret' | 'generator';
  x: number; z: number; y: number;
  /** A circle (r) or a box (hw × hd half sizes, axis-aligned). */
  r: number;
  box?: [number, number];
  /** The top (m above its ground): the rover clears it above this. */
  top: number;
  rot: number;
  /** Size of the block it fills (tiles), for buildings. */
  w?: number; d?: number;
  seed: number;
}

export interface Track { axis: 'x' | 'z'; /** The fixed coordinate (m). */ at: number; from: number; to: number; y: number; period: number; offset: number; speed: number; dir: 1 | -1 }
export interface GateDef extends Spot { axis: 'x' | 'z'; open: number; closed: number; offset: number }
export interface TurretDef extends Spot { double: boolean; pattern: 'aim' | 'sweep'; yaw: number }

export interface RawLevel {
  region: RegionId;
  par: number;
  map: string[];
  powers?: PowerId[];
  /** Meteors strike near the rover every `every` seconds (from `first`). */
  meteors?: { every: number; first?: number };
  /** Solar storms: every `every` seconds for `len` seconds (from `first`). */
  storms?: { every: number; len: number; first: number };
  trains?: { period: number; offset: number; speed?: number; dir?: 1 | -1 }[];
  gates?: { open: number; closed: number; offset?: number }[];
  turrets?: ('aim' | 'sweep')[];
  setpiece?: 'miner' | 'escape';
  /** Escape set-pieces: seconds to reach the rocket. */
  countdown?: number;
  /** The hint shown the first time (strings key). */
  hint?: string;
}

export interface Level {
  n: number;
  region: RegionId;
  par: number;
  cols: number;
  rows: number;
  tiles: Tile[];
  start: { x: number; z: number; yaw: number };
  base: Spot;
  crystals: Spot[];
  astronauts: Spot[];
  outposts: Spot[];
  chargers: Spot[];
  checkpoints: (Spot & { axis: 'x' | 'z' })[];
  gates: GateDef[];
  turrets: TurretDef[];
  powers: (Spot & { id: PowerId })[];
  alien: Spot | null;
  generators: Spot[];
  rocket: Spot | null;
  miner: Spot | null;
  obstacles: Obstacle[];
  decor: { kind: 'rocks' | 'lamp'; x: number; z: number; y: number; seed: number }[];
  craters: Crater[];
  tracks: Track[];
  meteors: { every: number; first: number } | null;
  storms: { every: number; len: number; first: number } | null;
  setpiece: 'miner' | 'escape' | null;
  countdown: number;
  hint: string;
}

export const LEVELS_PER_REGION = 5;

// ------------------------------------------------------------------ the maps

export const RAW: RawLevel[] = [
  // 1-1 First Tracks: the plain below the base, a road north, a kicker, a crater, one astronaut
  {
    region: 'plains', par: 75, hint: 'h_drive',
    map: [
      '5555555555555555',
      '5333333333333335',
      '531111C1111U1135',
      '5311r111111r1135',
      '531111111111C135',
      '53C11o111A111135',
      '5311111_11111135',
      '531C11P_1111C135',
      '5311111_11r11135',
      '5311111^11111135',
      '531111C11C111135',
      '5311111_1111X135',
      '53111C1_11111135',
      '5311111_1C111135',
      '531r111_11111135',
      '5311111_11111135',
      '531111BB11111335',
      '531111BB11111335',
      '531HH11111111335',
      '531HH11111111335',
      '5333333333333335',
      '5555555555555555',
    ],
    powers: ['boost'],
  },
];

// ------------------------------------------------------------------ the parser

const DIGITS = '012345';
const RAMPS = '^>v<';
const SURF: Record<string, Surf> = { _: 'road', i: 'ice', d: 'dust', c: 'field', t: 'road', B: 'road', E: 'road', U: 'road', G: 'road', M: 'road', L: 'road' };
const SOLID = 'HQTYRKSDFWlNL';
const OBST: Record<string, { kind: Obstacle['kind']; r: number; top: number }> = {
  T: { kind: 'turret', r: 1.3, top: 2.4 },
  Y: { kind: 'turret', r: 1.6, top: 2.0 },
  R: { kind: 'boulder', r: 1.8, top: 2.4 },
  K: { kind: 'crystalRock', r: 1.7, top: 2.6 },
  S: { kind: 'tower', r: 1.7, top: 7 },
  D: { kind: 'dish', r: 1.5, top: 3.2 },
  F: { kind: 'fuel', r: 1.4, top: 1.6 },
  W: { kind: 'antenna', r: 1.4, top: 2.4 },
  l: { kind: 'lamp', r: 0.5, top: 5 },
  N: { kind: 'generator', r: 1.5, top: 2.6 },
};

let cache: Map<number, Level> = new Map();

export const LEVEL_COUNT = RAW.length;
export const regionOf = (n: number): RegionId => RAW[n - 1]?.region ?? REGION_IDS[Math.min(3, Math.floor((n - 1) / LEVELS_PER_REGION))];
export const regionIndex = (n: number): number => REGION_IDS.indexOf(regionOf(n));
export const inRegionOf = (n: number): number => ((n - 1) % LEVELS_PER_REGION) + 1;
export const parOf = (n: number): number => RAW[n - 1]?.par ?? 90;

function hash(a: number, b: number, s = 0): number {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A fresh copy of level n (1-based), parsed once and cloned. */
export function buildLevel(n: number): Level {
  let L = cache.get(n);
  if (!L) { L = parse(n, RAW[n - 1]); cache.set(n, L); }
  return structuredClone(L);
}

function parse(n: number, raw: RawLevel): Level {
  const rows = raw.map.length, cols = Math.max(...raw.map.map((s) => s.length));
  const ch = (c: number, r: number): string => (r >= 0 && r < rows && c >= 0 && c < cols ? raw.map[r][c] ?? '5' : '#');
  // heights: digits are given; every other tile takes the level most of its resolved neighbours
  // share (the four sides count twice, the corners once; a tie takes the lower), ramps last
  const H = new Array<number>(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r);
    if (DIGITS.includes(k)) H[r * cols + c] = Number(k);
  }
  for (let pass = 0; pass < cols + rows; pass++) {
    const next = H.slice();
    let left = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = r * cols + c, k = ch(c, r);
      if (H[p] >= 0 || RAMPS.includes(k) || k === '.') continue;
      const votes = new Map<number, number>();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const h = H[nr * cols + nc];
        if (h >= 0) votes.set(h, (votes.get(h) ?? 0) + (dr && dc ? 1 : 2));
      }
      let best = -1, bv = 0;
      for (const [h, n] of votes) if (n > bv || (n === bv && h < best)) { best = h; bv = n; }
      if (best >= 0) next[p] = best; else left++;
    }
    for (let i = 0; i < H.length; i++) H[i] = next[i];
    if (!left) break;
  }
  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r);
    const t: Tile = { k: 'ground', L: Math.max(0, H[r * cols + c]), dir: 0, surf: SURF[k] ?? 'rock', ch: k, solid: SOLID.includes(k) };
    if (k === '.') { t.k = 'chasm'; t.L = 0; }
    const ri = RAMPS.indexOf(k);
    if (ri >= 0) {
      t.k = 'ramp'; t.dir = ri;
      const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][ri];
      const behind = H[(r - dz) * cols + (c - dx)];
      if (behind === undefined || behind < 0) throw new Error(`level ${n}: ramp at ${c},${r} has no ground behind it`);
      t.L = behind;
      t.surf = 'road';
    }
    tiles.push(t);
  }
  const cx = (c: number) => c * TILE + TILE / 2, cz = (r: number) => r * TILE + TILE / 2;
  const spot = (c: number, r: number): Spot => ({ x: cx(c), z: cz(r), y: tiles[r * cols + c].L * STEP, c, r });
  const L: Level = {
    n, region: raw.region, par: raw.par, cols, rows, tiles,
    start: { x: 0, z: 0, yaw: Math.PI }, base: spot(0, 0),
    crystals: [], astronauts: [], outposts: [], chargers: [], checkpoints: [], gates: [], turrets: [], powers: [],
    alien: null, generators: [], rocket: null, miner: null, obstacles: [], decor: [], craters: [], tracks: [],
    meteors: raw.meteors ? { every: raw.meteors.every, first: raw.meteors.first ?? 8 } : null,
    storms: raw.storms ?? null, setpiece: raw.setpiece ?? null, countdown: raw.countdown ?? 0, hint: raw.hint ?? '',
  };
  // blocks (B, H, Q, L): connected rectangles of one letter
  const seen = new Set<number>();
  const block = (c0: number, r0: number, k: string): { c0: number; r0: number; w: number; d: number } => {
    let w = 1, d = 1;
    while (ch(c0 + w, r0) === k) w++;
    while (ch(c0, r0 + d) === k) d++;
    for (let r = r0; r < r0 + d; r++) for (let c = c0; c < c0 + w; c++) seen.add(r * cols + c);
    return { c0, r0, w, d };
  };
  let powerI = 0, gateI = 0, turretI = 0;
  const walls = (c: number, r: number): 'x' | 'z' => {
    // a gate spans the corridor: across x when its east and west sides are walls or solid
    const blockedX = (k: string) => !'_0123456789BEUGMLicdtor'.includes(k) || k === '#';
    const hc = H[r * cols + c];
    const side = (dc: number, dr: number) => { const k = ch(c + dc, r + dr); const h = H[(r + dr) * cols + c + dc]; return blockedX(k) || h > hc; };
    return side(-1, 0) || side(1, 0) ? 'x' : side(0, -1) || side(0, 1) ? 'z' : 'x';
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r), p = r * cols + c;
    const s = spot(c, r);
    const seed = Math.floor(hash(c, r, n) * 1e6);
    if ('BHQL'.includes(k) && !seen.has(p)) {
      const b = block(c, r, k);
      const x = b.c0 * TILE + (b.w * TILE) / 2, z = b.r0 * TILE + (b.d * TILE) / 2, y = s.y;
      if (k === 'B') { L.base = { x, z, y, c: b.c0, r: b.r0 }; L.start = { x, z: z + 0.6, yaw: Math.PI }; }
      else if (k === 'L') { L.rocket = { x, z, y, c: b.c0, r: b.r0 }; L.obstacles.push({ kind: 'rocket', x, z, y, r: 2.4, top: 30, rot: 0, seed, w: b.w, d: b.d }); }
      else L.obstacles.push({ kind: k === 'H' ? 'hangar' : 'dome', x, z, y, r: 0, box: [(b.w * TILE) / 2 - 0.3, (b.d * TILE) / 2 - 0.3], top: k === 'H' ? 4.4 : 5, rot: b.w >= b.d ? 0 : Math.PI / 2, seed, w: b.w, d: b.d });
      continue;
    }
    switch (k) {
      case 'C': L.crystals.push(s); break;
      case 'A': L.astronauts.push(s); break;
      case 'U': L.outposts.push(s); break;
      case 'E': L.chargers.push(s); break;
      case 'G': L.checkpoints.push({ ...s, axis: walls(c, r) }); break;
      case 'M': { const g = raw.gates?.[gateI++] ?? { open: 3, closed: 2.5 }; L.gates.push({ ...s, axis: walls(c, r), open: g.open, closed: g.closed, offset: g.offset ?? 0 }); break; }
      case 'P': L.powers.push({ ...s, id: raw.powers?.[powerI++] ?? 'boost' }); break;
      case 'X': L.alien = s; break;
      case 'N': L.generators.push(s); break;
      case 'Z': L.miner = s; break;
      case 'o': L.craters.push({ x: s.x + (hash(c, r, 3) - 0.5) * 0.8, z: s.z + (hash(c, r, 4) - 0.5) * 0.8, R: 3.6, H: 0.95, large: false, pit: false }); break;
      case 'O': L.craters.push({ x: s.x, z: s.z, R: 6.2, H: 1.5, large: true, pit: false }); break;
      case 'p': L.craters.push({ x: s.x, z: s.z, R: 5.6, H: 1.1, large: true, pit: true }); break;
      case 'r': L.decor.push({ kind: 'rocks', x: s.x, z: s.z, y: s.y, seed }); break;
    }
    const o = OBST[k];
    if (o) {
      const ob: Obstacle = { kind: o.kind, x: s.x, z: s.z, y: s.y, r: o.r, top: o.top, rot: Math.floor(hash(c, r, 7) * 4) * (Math.PI / 2), seed };
      L.obstacles.push(ob);
      if (k === 'T' || k === 'Y') {
        L.turrets.push({ ...s, double: k === 'Y', pattern: raw.turrets?.[turretI++] ?? 'aim', yaw: Math.PI });
      }
      if (k === 'l') L.decor.push({ kind: 'lamp', x: s.x, z: s.z, y: s.y, seed });
    }
  }
  // monorail tracks: straight runs of t (a full row or column)
  const used = new Set<number>();
  let trainI = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (ch(c, r) !== 't' || used.has(r * cols + c)) continue;
    let w = 0, d = 0;
    while (ch(c + w, r) === 't') w++;
    while (ch(c, r + d) === 't') d++;
    const horiz = w >= d;
    const len = horiz ? w : d;
    for (let i = 0; i < len; i++) used.add(horiz ? r * cols + c + i : (r + i) * cols + c);
    const tr = raw.trains?.[trainI++] ?? { period: 12, offset: 0 };
    L.tracks.push({
      axis: horiz ? 'x' : 'z', at: horiz ? cz(r) : cx(c), from: (horiz ? c : r) * TILE, to: (horiz ? c + len : r + len) * TILE, y: tiles[r * cols + c].L * STEP,
      period: tr.period, offset: tr.offset, speed: tr.speed ?? 15, dir: tr.dir ?? 1,
    });
  }
  return L;
}

/** Map centre of a tile (m). */
export const tileX = (c: number): number => c * TILE + TILE / 2;
export const tileZ = (r: number): number => r * TILE + TILE / 2;

/** Drops the parsed copies (tests). */
export function resetLevelCache(): void { cache = new Map(); }
