// Moon Rover: the ground under the rover, headless (the sim, the bot and the view share it). A level
// is a grid of the kit's 4 m terrain tiles, each at a height level (2 m a level): flat ground, the
// kit's ramps (a connector up to the next level, or a kicker with a drop at its end), chasms, and the
// kit's craters laid over the tiles as rings of raised rim (a pit crater has a hole in the middle).
// Meteors add fresh craters while a level runs.
import { TILE, STEP } from './defs';
import type { Level, Tile, Crater } from './levels';

/** The ground of a chasm or a pit (m): anything this low is a fall. */
export const ABYSS = -60;
/** Outside the map: a wall. */
export const WALL = 60;

/** Ramp directions: the way each rises, as a unit step on the grid (N = -z). */
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** The kits' crater rims as radial profiles: [share of the outer radius, share of the rim height]. */
const PROFILE = {
  small: [[0.44, 0], [0.56, 1], [0.73, 1], [0.85, 0.31], [1, 0]] as [number, number][],
  large: [[0.34, 0.2], [0.48, 1], [0.59, 1], [1, 0]] as [number, number][],
};
/** The share of the outer radius inside which a pit crater is a hole. */
export const PIT_IN = 0.36;

function profile(p: [number, number][], q: number): number {
  if (q <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (q <= p[i][0]) {
      const [a, ya] = p[i - 1], [b, yb] = p[i];
      return ya + ((yb - ya) * (q - a)) / (b - a);
    }
  }
  return 0;
}

export class Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: Tile[];
  /** Craters by tile (each listed on every tile its rim reaches). */
  private bucket: Crater[][];
  readonly craters: Crater[] = [];

  constructor(L: Level) {
    this.cols = L.cols;
    this.rows = L.rows;
    this.tiles = L.tiles;
    this.bucket = Array.from({ length: L.cols * L.rows }, () => []);
    for (const c of L.craters) this.addCrater({ ...c });
  }

  tile(c: number, r: number): Tile | null {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return this.tiles[r * this.cols + c];
  }

  tileAt(x: number, z: number): Tile | null { return this.tile(Math.floor(x / TILE), Math.floor(z / TILE)); }

  addCrater(cr: Crater): void {
    this.craters.push(cr);
    const c0 = Math.floor((cr.x - cr.R) / TILE), c1 = Math.floor((cr.x + cr.R) / TILE);
    const r0 = Math.floor((cr.z - cr.R) / TILE), r1 = Math.floor((cr.z + cr.R) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
      this.bucket[r * this.cols + c].push(cr);
    }
  }

  /** The tile's own surface height at a point inside it (no craters). */
  base(t: Tile, x: number, z: number, c: number, r: number): number {
    if (t.k === 'chasm') return ABYSS;
    if (t.k !== 'ramp') return t.L * STEP;
    // along the way it rises, 0 at the low edge, 1 at the high edge
    const fx = x / TILE - c, fz = z / TILE - r;
    const u = t.dir === 0 ? 1 - fz : t.dir === 1 ? fx : t.dir === 2 ? fz : 1 - fx;
    return (t.L + Math.max(0, Math.min(1, u))) * STEP;
  }

  /** The ground's height at a point (m): ABYSS over a chasm or a pit, WALL outside the map. */
  ground(x: number, z: number): number {
    const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return WALL;
    const t = this.tiles[r * this.cols + c];
    let h = this.base(t, x, z, c, r);
    if (h <= ABYSS) return h;
    const list = this.bucket[r * this.cols + c];
    for (let i = 0; i < list.length; i++) {
      const cr = list[i];
      const d = Math.hypot(x - cr.x, z - cr.z);
      if (d >= cr.R) continue;
      const q = d / cr.R;
      if (cr.pit && q < PIT_IN) return ABYSS;
      h += profile(cr.large ? PROFILE.large : PROFILE.small, q) * cr.H;
    }
    return h;
  }

  /** The surface kind under a point. */
  surface(x: number, z: number): Tile['surf'] | 'none' {
    const t = this.tileAt(x, z);
    return t ? t.surf : 'none';
  }

  /** A pit crater's hole or a chasm at a point. */
  isHole(x: number, z: number): boolean { return this.ground(x, z) <= ABYSS + 1; }
}
