// City generator: the terrain. A gentle height field over the whole map: the land rises from the
// sea and the rivers (which stay at sea level between their quays) towards low hills inland, and
// climbs into real hills past the city's edge. Low curvature everywhere, so roads stay drivable
// and a long flat triangle never strays far from it. Lots are level: a building stands on one
// height (its door's), with a plinth down to the lowest corner.
//
// Pure data: the field is sampled once on a grid (bilinear between samples) and cached per plan,
// so the generator, CityView and the queries all read the same numbers.
import { type P, pointInPoly, clamp } from './geom';
import { fbm } from './rng';
import type { StyleId } from './types';

export interface TerrainParams {
  /** 'coast' rises from the sea, 'hills' rolls, 'flat' is level. */
  kind: 'coast' | 'hills' | 'flat';
  /** Rise from the shore to the far side of the city, metres. */
  rise: number;
  /** Amplitude of the rolling hills, metres. */
  hills: number;
  /** Extra rise past the city's edge (the hills round it), metres. */
  edge: number;
  seed: number;
  /** The last water polygon is the sea. */
  sea: boolean;
}

/** Terrain per style. */
export const TERRAIN: Record<StyleId, Omit<TerrainParams, 'seed' | 'sea'>> = {
  coast: { kind: 'coast', rise: 18, hills: 3.5, edge: 26 },
  metropolis: { kind: 'hills', rise: 0, hills: 5, edge: 22 },
  industrial: { kind: 'hills', rise: 0, hills: 3.5, edge: 18 },
  suburbia: { kind: 'hills', rise: 0, hills: 9, edge: 24 },
  harbor: { kind: 'coast', rise: 10, hills: 5, edge: 24 },
};

export interface Terrain {
  /** Ground height at a point (0 at sea level; the water surface is at -0.7). */
  h(x: number, z: number): number;
  /** Highest sample. */
  max: number;
  /** The grid: origin, cell size, samples per side, heights (row-major, z rows). */
  x0: number; z0: number; cell: number; n: number; data: Float32Array;
}

/** Distance from q to the segment a–b (no allocation). */
function segD(q: P, a: P, b: P): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((q.x - a.x) * dx + (q.z - a.z) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = q.x - a.x - dx * t, ez = q.z - a.z - dz * t;
  return Math.sqrt(ex * ex + ez * ez);
}

const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Builds the height field over the map rectangle (the city plus 0.3 × its size round it).
 * `water`: river and sea polygons; `sea`: the sea polygon (or null); `land`: the land outline.
 */
export function makeTerrain(size: number, params: TerrainParams, water: P[][], sea: P[] | null, land: P[], samples = 97): Terrain {
  const m = Math.round(size * 0.3);
  const x0 = -m, z0 = -m, span = size + 2 * m;
  const n = samples, cell = span / (n - 1);
  const data = new Float32Array(n * n);
  if (params.kind === 'flat' && params.hills === 0 && params.edge === 0) return wrap(x0, z0, cell, n, data);
  // water edges bucketed on a grid: the flattening along the water only looks 170 m out
  const NEAR = 170, CELL = 48, RAMP = 420;
  const buckets = new Map<number, [P, P][]>();
  const bkey = (i: number, j: number) => (i + 500) * 1000 + j + 500;
  const seaSegs: [P, P][] = [], waterSegs: [P, P][] = [];
  for (const poly of water) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.max(a.x, b.x) < x0 - NEAR || Math.min(a.x, b.x) > x0 + span + NEAR || Math.max(a.z, b.z) < z0 - NEAR || Math.min(a.z, b.z) > z0 + span + NEAR) continue;
      if (poly === sea) seaSegs.push([a, b]);
      waterSegs.push([a, b]);
      const i0 = Math.floor((Math.min(a.x, b.x) - NEAR) / CELL), i1 = Math.floor((Math.max(a.x, b.x) + NEAR) / CELL);
      const j0 = Math.floor((Math.min(a.z, b.z) - NEAR) / CELL), j1 = Math.floor((Math.max(a.z, b.z) + NEAR) / CELL);
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
        const k = bkey(ii, jj);
        let l = buckets.get(k);
        if (!l) buckets.set(k, (l = []));
        l.push([a, b]);
      }
    }
  }
  // the slow parts on a coarse grid: distance to the sea (the rise is very smooth) and wet or dry
  const C = 49, cc = span / (C - 1);
  const coarseSea = new Float32Array(C * C), coarseWet = new Uint8Array(C * C), coarseWater = new Float32Array(C * C);
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    const q = { x: x0 + i * cc, z: z0 + j * cc };
    let ds = Infinity, dw = Infinity;
    for (const [a, b] of seaSegs) ds = Math.min(ds, segD(q, a, b));
    for (const [a, b] of waterSegs) dw = Math.min(dw, segD(q, a, b));
    coarseSea[j * C + i] = ds === Infinity ? size : ds;
    coarseWater[j * C + i] = dw === Infinity ? size : dw;
    coarseWet[j * C + i] = water.some((poly) => pointInPoly(q, poly)) ? 1 : 0;
  }
  const coarse = (arr: Float32Array, x: number, z: number) => {
    const fx = clamp((x - x0) / cc, 0, C - 1.0001), fz = clamp((z - z0) / cc, 0, C - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * C + i;
    return (arr[k] + (arr[k + 1] - arr[k]) * tx) * (1 - tz) + (arr[k + C] + (arr[k + C + 1] - arr[k + C]) * tx) * tz;
  };
  const landSegs: [P, P][] = land.map((a, i) => [a, land[(i + 1) % land.length]]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = { x: x0 + i * cell, z: z0 + j * cell };
    let dw = NEAR + 1;
    for (const [a, b] of buckets.get(bkey(Math.floor(q.x / CELL), Math.floor(q.z / CELL))) ?? []) dw = Math.min(dw, segD(q, a, b));
    // further out, the coarse grid's distance (the ramp up from the water is long and gentle)
    if (dw > NEAR) dw = Math.max(NEAR, coarse(coarseWater, q.x, q.z));
    // wet: from the coarse grid where its four corners agree, exact where they don't
    const ci = Math.min(C - 2, Math.floor((q.x - x0) / cc)), cj = Math.min(C - 2, Math.floor((q.z - z0) / cc)), ck = cj * C + ci;
    const sum = coarseWet[ck] + coarseWet[ck + 1] + coarseWet[ck + C] + coarseWet[ck + C + 1];
    const wet = sum === 0 ? false : sum === 4 ? true : water.some((poly) => pointInPoly(q, poly));
    if (wet) { data[j * n + i] = 0; continue; }
    // rolling hills (two octaves, long wavelengths) and the rise from the sea
    const roll = (fbm(params.seed, q.x, q.z, 620, 2) - 0.5) * 2 * params.hills + params.hills * 0.6;
    const rise = params.kind === 'coast' ? params.rise * smooth(0, size * 0.95, coarse(coarseSea, q.x, q.z)) : 0;
    // past the city's edge the land climbs into hills
    let out = 0;
    if (!pointInPoly(q, land)) {
      let dl = Infinity;
      for (const [a, b] of landSegs) dl = Math.min(dl, segD(q, a, b));
      // (a coastal plain stays low along the sea)
      const plain = sea ? smooth(60, 700, coarse(coarseSea, q.x, q.z)) : 1;
      out = params.edge * smooth(20, size * 0.4, dl) * plain * (0.55 + 0.9 * fbm(params.seed + 7, q.x, q.z, 300, 2));
    }
    // flat along the water: the promenade, the beaches and the quays stay at sea level
    const flat = smooth(14, RAMP, dw);
    data[j * n + i] = Math.max(0, (roll + rise + out) * flat);
  }
  return wrap(x0, z0, cell, n, data);
}

function wrap(x0: number, z0: number, cell: number, n: number, data: Float32Array): Terrain {
  let max = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  const h = (x: number, z: number): number => {
    const fx = clamp((x - x0) / cell, 0, n - 1.0001), fz = clamp((z - z0) / cell, 0, n - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const k = j * n + i;
    const a = data[k], b = data[k + 1], c = data[k + n], d = data[k + n + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
  return { h, max, x0, z0, cell, n, data };
}

/** A flat terrain (for plans that predate the terrain, or a level city). */
export const FLAT: Terrain = { h: () => 0, max: 0, x0: 0, z0: 0, cell: 1, n: 2, data: new Float32Array(4) };
