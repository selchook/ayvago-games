// The Kenney Minigolf Kit as a grid of tiles, and the course field built from it. Pure TypeScript:
// the game feeds it the triangles of the loaded models, the Node bot feeds it the same GLBs.
//
// Tile conventions (checked against the models): one tile is 1×1 unit, the felt is 0.8 wide
// between 0.1 walls, the floor is at y 0.063 and one level of height is 0.147 (a "block").
// Rotation k turns a tile k quarter turns clockwise seen from above; at k = 0:
//   straight: runs north-south (north = -z, the top of the hole map)
//   end / holeSquare: closed to the north, open to the south
//   corner: walls north and west, open south and east
//   ramp: rises one level (rampB: two) towards the north
//   holeRound: rounded to the north, the cup at the centre
//   windmill / castle / tunnels: enter from the south, leave to the north
import type { Localized } from '@core';
import { Field, type Mover } from './physics';

export const LEVEL = 0.147;
export const FLOOR_Y = 0.063;

/** Hole-map codes → model names. */
export const TILE_CODES: Record<string, string> = {
  s: 'straight', e: 'end', c: 'corner', rc: 'roundCornerC', rk: 'roundCornerB', sd: 'side', o: 'open', g: 'gap',
  ra: 'rampA', rb: 'rampB', hr: 'holeRound', hs: 'holeSquare', ho: 'holeOpen',
  bp: 'bump', bd: 'bumpDown', bw: 'bumpWalls', dw: 'bumpDownWalls', hl: 'hillRound', hq: 'hillSquare', hc: 'hillCorner', cr: 'crest',
  nb: 'narrowBlock', nr: 'narrowRound', ns: 'narrowSquare', ob: 'obstacleBlock', od: 'obstacleDiamond', ot: 'obstacleTriangle',
  sp: 'split', st: 'splitT', sw: 'splitWallsToOpen', ss: 'splitStart', tw: 'tunnelWide', tn: 'tunnelNarrow', td: 'tunnelDouble',
  ca: 'castle', wm: 'windmill', wo: 'wallsToOpen', ic: 'innerCorner', sq: 'squareCornerA', wl: 'wallLeft', wr: 'wallRight',
};

/** Every model the courses use (loaded in preload). */
export const MODELS = [...new Set(Object.values(TILE_CODES))].concat(['block', 'ball_red', 'ball_blue', 'flag_red', 'flag_blue', 'club_red']);

export type MoverDef =
  | { kind: 'slider'; col: number; row: number; axis: 'x' | 'z'; amp: number; speed: number; phase?: number; w?: number; d?: number }
  | { kind: 'sweeper'; col: number; row: number; len: number; speed: number; phase?: number };

export interface HoleDef {
  name: Localized;
  par: number;
  /** Rows of tokens, north first: `<code><rot>[^level][*]`, `*` marks the tee; `.` is empty. */
  map: string[];
  movers?: MoverDef[];
  /** Windmill speed (rad/s) on this hole. */
  windmill?: number;
  /** Water ponds beside the course (tile units: x0, z0, x1, z1), out of bounds with a splash. */
  water?: [number, number, number, number][];
  /** One-line tip shown on the hole card. */
  tip?: Localized;
}

export interface Placement {
  model: string;
  col: number;
  row: number;
  rot: number;
  level: number;
}

export interface ParsedHole {
  tiles: Placement[];
  tee: { x: number; z: number; y: number };
  cup: { x: number; z: number; y: number };
  cols: number;
  rows: number;
}

export function parseHole(h: HoleDef): ParsedHole {
  const tiles: Placement[] = [];
  let tee: ParsedHole['tee'] | null = null, cup: ParsedHole['cup'] | null = null;
  let cols = 0;
  h.map.forEach((line, row) => {
    const toks = line.trim().split(/\s+/);
    cols = Math.max(cols, toks.length);
    toks.forEach((tok, col) => {
      if (tok === '.') return;
      const m = /^([a-z]+)(\d)(?:\^(\d))?(\*)?$/.exec(tok);
      if (!m || !TILE_CODES[m[1]]) throw new Error(`bad tile "${tok}"`);
      const model = TILE_CODES[m[1]];
      const level = m[3] ? Number(m[3]) : 0;
      tiles.push({ model, col, row, rot: Number(m[2]) % 4, level });
      const y = level * LEVEL + FLOOR_Y;
      if (m[4]) tee = { x: col, z: row, y };
      if (model.startsWith('hole')) cup = { x: col, z: row, y };
    });
  });
  if (!tee || !cup) throw new Error('a hole needs a tee (*) and a cup');
  return { tiles, tee, cup, cols, rows: h.map.length };
}

/** Rotates a local tile point by k clockwise quarter turns (seen from above). */
export function rotXZ(x: number, z: number, k: number): [number, number] {
  switch (((k % 4) + 4) % 4) {
    case 1: return [-z, x];
    case 2: return [-x, -z];
    case 3: return [z, -x];
    default: return [x, z];
  }
}

/** The model's rotation.y for k clockwise quarter turns. */
export const rotY = (k: number): number => -k * Math.PI / 2;

/** Triangles of one model in its own frame, by material name (border, green, dark, wood …). */
export type ModelTris = (model: string) => Record<string, ArrayLike<number>>;

const FLOOR_MATS = new Set(['green', '_defaultMat']);

/** Rasterises a parsed hole into a physics field. */
export function buildField(p: ParsedHole, tris: ModelTris, res = 0.01): Field {
  const pad = 0.75;
  const f = new Field(-0.5 - pad, -0.5 - pad, p.cols - 0.5 + pad, p.rows - 0.5 + pad, res);
  const world = (t: Placement, src: ArrayLike<number>): number[] => {
    const out = new Array<number>(src.length);
    const base = t.level * LEVEL;
    for (let k = 0; k < src.length; k += 3) {
      const [x, z] = rotXZ(src[k], src[k + 2], t.rot);
      out[k] = x + t.col;
      out[k + 1] = src[k + 1] + base;
      out[k + 2] = z + t.row;
    }
    return out;
  };
  const all: { t: Placement; mats: Record<string, number[]> }[] = [];
  for (const t of p.tiles) {
    const src = tris(t.model);
    const mats: Record<string, number[]> = {};
    for (const m in src) mats[m] = world(t, src[m]);
    all.push({ t, mats });
  }
  // pass 1: the felt, and the cup as a flat lid at rim height
  for (const { t, mats } of all) {
    const base = t.level * LEVEL;
    for (const m in mats) {
      if (FLOOR_MATS.has(m)) f.rasterFloor(mats[m], undefined, base + 0.02);
      else if (m === 'dark') f.rasterFloor(mats[m], base + FLOOR_Y);
    }
  }
  f.fillSeams();
  // pass 2: walls and buildings; the blocks under raised tiles
  for (const { mats } of all) {
    for (const m in mats) f.rasterSolid(mats[m], FLOOR_MATS.has(m) || m === 'dark');
  }
  const block = tris('block');
  for (const t of p.tiles) {
    for (let l = 0; l < t.level; l++) f.rasterSolid(world({ ...t, level: l }, block.border ?? []));
  }
  f.finish();
  return f;
}

/** A hole ready to play: field, cup, tee and movers. */
export interface HoleWorld {
  def: HoleDef;
  parsed: ParsedHole;
  field: Field;
  movers: Mover[];
}
