// The six arenas: hand-authored closed loops (Catmull–Rom through the control points) with
// terrain features placed by distance along the centreline.
import { THREE } from '@core/three';

/** Half size of the fenced arena (world units, x and z). */
export const ARENA = { hx: 32, hz: 19 };

export type FeatureKind = 'hump' | 'ramp' | 'mud' | 'puddle';

export interface Feature {
  kind: FeatureKind;
  /** Where along the lap (0..1 of its length). */
  at: number;
  /** Length along the track (units). */
  len?: number;
  /** Lateral centre for mud and puddles, -1..1 of the half width (default 0). */
  side?: number;
}

export interface Layout {
  name: { tr: string; en: string };
  width: number;
  /** Control points (x, z), driven in this order. */
  points: [number, number][];
  features: Feature[];
  /** Ground tint of the outfield (some arenas are drier than others). */
  grass: number;
}

export const LAYOUTS: Layout[] = [
  {
    name: { tr: 'Toz Çanağı', en: 'Dust Bowl' },
    width: 7.4,
    grass: 0x7fb24e,
    points: [[-20, 11], [0, 12], [20, 11], [26, 4], [25, -6], [18, -12], [0, -12.5], [-18, -12], [-25, -6], [-26, 4]],
    features: [
      { kind: 'ramp', at: 0.16 },
      { kind: 'mud', at: 0.31, len: 7, side: 0.2 },
      { kind: 'hump', at: 0.6 },
      { kind: 'puddle', at: 0.72, side: -0.35 },
      { kind: 'hump', at: 0.88 },
    ],
  },
  {
    name: { tr: 'Sekiz Kavşağı', en: 'Crossroads Eight' },
    width: 6.8,
    grass: 0x88b54f,
    // a figure eight: both loops meet at the centre and cross at ground level
    points: [[12.4, -11.5], [4.6, -5.6], [0, 0], [-4.6, 5.6], [-12.4, 11.5], [-21, 9.4], [-24.6, 1.5], [-23.4, -6.4],
      [-17, -11.6], [-9.2, -8.3], [0, 0], [9.2, 8.3], [17, 11.6], [23.4, 6.4], [24.6, -1.5], [21, -9.4]],
    features: [
      { kind: 'hump', at: 0.2 },
      { kind: 'mud', at: 0.3, len: 6, side: -0.2 },
      { kind: 'ramp', at: 0.4 },
      { kind: 'hump', at: 0.7 },
      { kind: 'puddle', at: 0.79, side: 0.3 },
      { kind: 'ramp', at: 0.86 },
    ],
  },
  {
    name: { tr: 'Yılan Virajı', en: 'Snake Bend' },
    width: 7,
    grass: 0x79ad4a,
    // the far straight snakes through the infield
    points: [[-22, 12], [0, 12.5], [22, 12], [26.5, 4], [24, -8], [16, -12.5], [9, -8], [4, -1], [-3, -1.5], [-8, -8],
      [-15, -12.5], [-23, -9], [-26.5, 2]],
    features: [
      { kind: 'ramp', at: 0.08 },
      { kind: 'hump', at: 0.2 },
      { kind: 'puddle', at: 0.38, side: 0.25 },
      { kind: 'mud', at: 0.53, len: 6.5 },
      { kind: 'hump', at: 0.7 },
      { kind: 'ramp', at: 0.9 },
    ],
  },
  {
    name: { tr: 'Firkete Tepesi', en: 'Hairpin Hill' },
    width: 7,
    grass: 0x8cb350,
    // a long run up the middle ends in a tight hairpin
    points: [[-22, 11.5], [-10, 12], [-4, 6], [-3, -1], [2, -5], [7, -1], [8, 6], [14, 12], [24, 10], [27, -1], [24, -11.5],
      [0, -12.5], [-24, -11.5], [-27, 0]],
    features: [
      { kind: 'hump', at: 0.12 },
      { kind: 'mud', at: 0.24, len: 5, side: 0.15 },
      { kind: 'puddle', at: 0.46, side: -0.3 },
      { kind: 'ramp', at: 0.7 },
      { kind: 'hump', at: 0.79 },
      { kind: 'ramp', at: 0.9 },
    ],
  },
  {
    name: { tr: 'Böbrek Pisti', en: 'Kidney Run' },
    width: 7.4,
    grass: 0x82b04c,
    // a bean with a deep dent on one side
    points: [[-20, 12], [-4, 12], [4, 5.5], [12, 11.5], [24, 10], [26.5, 0], [22, -10], [6, -12.5], [-10, -12.5], [-23, -10],
      [-27, 1]],
    features: [
      { kind: 'puddle', at: 0.05, side: 0.3 },
      { kind: 'hump', at: 0.16 },
      { kind: 'ramp', at: 0.33 },
      { kind: 'mud', at: 0.5, len: 8 },
      { kind: 'hump', at: 0.63 },
      { kind: 'ramp', at: 0.82 },
    ],
  },
  {
    name: { tr: 'Zikzak Vadisi', en: 'Zigzag Valley' },
    width: 6.8,
    grass: 0x8ab34c,
    // the near straight zigzags twice
    points: [[-24, -12], [0, -12.5], [24, -12], [27, -2], [23, 10], [14, 12], [7, 5], [0, 11], [-7, 5], [-14, 12], [-23, 10],
      [-27, -2]],
    features: [
      { kind: 'ramp', at: 0.07 },
      { kind: 'hump', at: 0.17 },
      { kind: 'mud', at: 0.43, len: 5, side: 0.1 },
      { kind: 'puddle', at: 0.6, side: -0.25 },
      { kind: 'hump', at: 0.74 },
      { kind: 'ramp', at: 0.86 },
    ],
  },
];

export interface Sample {
  x: number;
  z: number;
  /** Unit tangent (direction of travel). */
  tx: number;
  tz: number;
  s: number;
}

export interface Near {
  i: number;
  s: number;
  /** Signed lateral offset (positive = left of travel, along (tz, -tx)… see normal()). */
  d: number;
  dist: number;
}

const STEP = 0.25;

/** A sampled closed centreline: nearest-point queries, look-ahead and curvature. */
export class Track {
  readonly samples: Sample[] = [];
  readonly length: number;
  readonly width: number;
  readonly half: number;

  constructor(readonly layout: Layout) {
    const curve = new THREE.CatmullRomCurve3(layout.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    this.length = curve.getLength();
    const n = Math.ceil(this.length / STEP);
    const pts = curve.getSpacedPoints(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n];
      const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
      this.samples.push({ x: p.x, z: p.z, tx: dx / l, tz: dz / l, s: (i / n) * this.length });
    }
    this.width = layout.width;
    this.half = layout.width / 2;
  }

  get count(): number {
    return this.samples.length;
  }

  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** Index of the sample at distance s. */
  index(s: number): number {
    return Math.floor(this.wrap(s) / this.length * this.samples.length) % this.samples.length;
  }

  sampleAt(s: number): Sample {
    return this.samples[this.index(s)];
  }

  /** A point on the track: distance s along it, lateral offset d (left of travel is positive). */
  pointAt(s: number, d = 0): { x: number; z: number; tx: number; tz: number } {
    const p = this.sampleAt(s);
    return { x: p.x + p.tz * d, z: p.z - p.tx * d, tx: p.tx, tz: p.tz };
  }

  /**
   * Nearest centreline sample. With a hint (the sample a truck was at last frame) only a window
   * around it is searched, so a truck on one branch of a crossing stays on it.
   */
  nearest(x: number, z: number, hint = -1, window = 48): Near {
    const S = this.samples, n = S.length;
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      for (let k = -window; k <= window; k++) {
        const i = (hint + k + n) % n, dx = x - S[i].x, dz = z - S[i].z, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    if (best < 0 || Math.sqrt(bd) > this.half + 4) {
      bd = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = x - S[i].x, dz = z - S[i].z, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    const p = S[best];
    const d = (x - p.x) * p.tz - (z - p.z) * p.tx;
    return { i: best, s: p.s, d, dist: Math.sqrt(bd) };
  }

  /** Distance to the nearest point of any part of the track (walls, scenery placement). */
  distance(x: number, z: number): number {
    let bd = Infinity;
    for (const p of this.samples) {
      const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
      if (d2 < bd) bd = d2;
    }
    return Math.sqrt(bd);
  }

  /** How much the track turns (radians) between s and s + ahead. */
  turnAhead(s: number, ahead: number): number {
    let total = 0;
    const steps = 6;
    let prev = this.sampleAt(s);
    for (let k = 1; k <= steps; k++) {
      const q = this.sampleAt(s + (ahead * k) / steps);
      const a = Math.atan2(prev.tx * q.tz - prev.tz * q.tx, prev.tx * q.tx + prev.tz * q.tz);
      total += Math.abs(a);
      prev = q;
    }
    return total;
  }
}
