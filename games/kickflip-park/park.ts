// Kickflip Park: the deterministic ground model. A park is a list of pieces (Kenney Mini Skate
// models and a few pieces of our own: kickers, ledges, banks, roofs); each solid piece has a height
// profile that matches its mesh, and the ground under the skater is the highest profile there.
// Rails are polylines; ledges grind along their top edges. Nothing here asks the meshes: the
// simulation, the bot and the headless balance run use these functions only.

export type ShapeKind =
  | 'qp'         // quarter pipe (half-pipe.glb / bowl-side.glb): rises towards local −z, radius 0.8, deck 0.2
  | 'cornerIn'   // bowl-corner-inner: the transition round a concave corner
  | 'cornerOut'  // bowl-corner-outer: round a convex corner
  | 'steps'      // steps.glb: four steps rising towards −z
  | 'hip'        // obstacle-middle.glb: a flat spine 0.4 wide with transitions both sides (along z)
  | 'hipEnd'     // obstacle-end.glb: its round cap
  | 'pad'        // obstacle-box.glb: a low hump
  | 'box'        // a flat-topped block (ledges, platforms, roofs, planters, the fountain)
  | 'deck'       // structure-platform.glb: half a tile, 0.8 high
  | 'kicker'     // a launch ramp of our own: a circular arc up to `angle`, rising towards −z
  | 'bank';      // a straight slope rising towards −z

export interface Shape {
  kind: ShapeKind;
  x: number; y: number; z: number;
  /** Quarter turns (three.js rotation.y = rot · π/2). */
  rot: number;
  /** World size of one model unit on each axis. */
  sx: number; sy: number; sz: number;
  /** Kicker launch angle (radians). */
  angle?: number;
  /** For sounds and sparks. */
  surf: Surface;
  /** Footprint in world space (for the quick reject). */
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Vert ramps throw you straight up and back in; other lips launch you along the surface. */
  vert: boolean;
  /** Slope at which this shape's transition becomes a lip. */
  lip: number;
}

export type Surface = 'concrete' | 'wood' | 'metal';

export interface Rail {
  id: string;
  /** Points along the rail top (world). */
  pts: [number, number, number][];
  kind: 'rail' | 'ledge';
  /** Landmark name key (goals: "grind the long rail"). */
  tag?: string;
}

/** The world→model transform of a shape: model coordinates in Kenney units. */
function toModel(s: Shape, x: number, z: number): [number, number] {
  const dx = x - s.x, dz = z - s.z;
  const r = ((s.rot % 4) + 4) % 4;
  // three.js rotation.y = θ maps model (u, v) to world (u cosθ + v sinθ, −u sinθ + v cosθ)
  let u: number, v: number;
  if (r === 0) { u = dx; v = dz; }
  else if (r === 1) { u = -dz; v = dx; }
  else if (r === 2) { u = -dx; v = -dz; }
  else { u = dz; v = -dx; }
  return [u / s.sx, v / s.sz];
}

const qpProf = (t: number): number => (t <= 0 ? 0 : t < 0.8 ? 0.8 - Math.sqrt(0.64 - t * t) : 0.8);
const hipProf = (a: number): number => (a <= 0.2 ? 0.3 : a >= 0.5 ? 0 : 0.3 - Math.sqrt(Math.max(0, 0.09 - (0.5 - a) * (0.5 - a))));

/** Model-unit height of a shape at model coords, or NaN outside it. */
function profile(s: Shape, u: number, v: number): number {
  switch (s.kind) {
    case 'qp':
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      return qpProf(0.5 - v);
    case 'cornerIn':
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      return qpProf(Math.hypot(u - 0.5, v - 0.5));
    case 'cornerOut': {
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      const t = 1 - Math.hypot(u + 0.5, v + 0.5);
      return t <= 0 ? NaN : qpProf(t);
    }
    case 'steps': {
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      const t = 0.5 - v;
      return 0.1 * Math.min(4, Math.max(1, Math.floor(t * 4) + 1));
    }
    case 'hip':
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      return hipProf(Math.abs(u));
    case 'hipEnd': {
      if (u < -1 || u > 0 || v < 0 || v > 0.5) return NaN;
      const r = Math.hypot(u + 0.5, v);
      return r > 0.5 ? NaN : hipProf(r);
    }
    case 'pad': {
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      const a = Math.max(Math.abs(u), Math.abs(v));
      return a <= 0.15 ? 0.15 : a <= 0.193 ? 0.15 - (a - 0.15) * 0.7 : Math.max(0, 0.12 * (0.5 - a) / 0.307);
    }
    case 'box':
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      return 1;
    case 'deck':
      if (Math.abs(u) > 0.5 || v < -0.5 || v > 0) return NaN;
      return 0.8;
    case 'kicker': {
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      // a circle through the foot with its end at `angle`: length 1, so R = 1 / sin(angle)
      const R = 1 / Math.sin(s.angle ?? 0.6);
      const x = 0.5 - v;
      return R - Math.sqrt(R * R - x * x);
    }
    case 'bank':
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return NaN;
      return 0.5 - v;
  }
}

/** Kicker height in model units at its top (for building its mesh). */
export function kickerTop(angle: number): number {
  const R = 1 / Math.sin(angle);
  return R - Math.sqrt(R * R - 1);
}

export function makeShape(kind: ShapeKind, x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number, surf: Surface, angle?: number): Shape {
  // footprint: the model's box in model units, turned
  const ext: Record<ShapeKind, [number, number, number, number]> = {
    qp: [-0.5, 0.5, -0.5, 0.5], cornerIn: [-0.5, 0.5, -0.5, 0.5], cornerOut: [-0.5, 0.5, -0.5, 0.5], steps: [-0.5, 0.5, -0.5, 0.5],
    hip: [-0.5, 0.5, -0.5, 0.5], hipEnd: [-1, 0, 0, 0.5], pad: [-0.5, 0.5, -0.5, 0.5], box: [-0.5, 0.5, -0.5, 0.5],
    deck: [-0.5, 0.5, -0.5, 0], kicker: [-0.5, 0.5, -0.5, 0.5], bank: [-0.5, 0.5, -0.5, 0.5],
  };
  const [u0, u1, v0, v1] = ext[kind];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const th = rot * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
  for (const u of [u0, u1]) for (const v of [v0, v1]) {
    const wx = x + u * sx * c + v * sz * sn, wz = z - u * sx * sn + v * sz * c;
    minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
  }
  const vert = kind === 'qp' || kind === 'cornerIn' || kind === 'cornerOut';
  return { kind, x, y, z, rot, sx, sy, sz, angle, surf, minX: minX - 1e-6, maxX: maxX + 1e-6, minZ: minZ - 1e-6, maxZ: maxZ + 1e-6, vert, lip: vert ? 8 : 1.9 };
}

/** Height of one shape at a world point (NaN when outside). */
export function shapeHeight(s: Shape, x: number, z: number): number {
  if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) return NaN;
  const [u, v] = toModel(s, x, z);
  const p = profile(s, u, v);
  return Number.isNaN(p) ? NaN : s.y + p * s.sy;
}

export interface Ground {
  h: number;
  /** Slope: dh/dx and dh/dz. */
  gx: number;
  gz: number;
  shape: Shape | null;
}

/** The ground of a park: the highest shape at a point, the base level elsewhere. */
export class Terrain {
  /** Base height everywhere no shape is (the street under the roofs is far below). */
  constructor(readonly shapes: Shape[], readonly base: number, readonly baseSurf: Surface, private cell = 6) {
    for (const s of shapes) {
      for (let cx = Math.floor(s.minX / cell); cx <= Math.floor(s.maxX / cell); cx++) {
        for (let cz = Math.floor(s.minZ / cell); cz <= Math.floor(s.maxZ / cell); cz++) {
          const k = cx * 10007 + cz;
          let list = this.grid.get(k);
          if (!list) { list = []; this.grid.set(k, list); }
          list.push(s);
        }
      }
    }
  }
  private grid = new Map<number, Shape[]>();
  private none: Shape[] = [];

  private near(x: number, z: number): Shape[] {
    return this.grid.get(Math.floor(x / this.cell) * 10007 + Math.floor(z / this.cell)) ?? this.none;
  }

  /** Height and the shape that makes it. */
  top(x: number, z: number): { h: number; shape: Shape | null } {
    let h = this.base, shape: Shape | null = null;
    for (const s of this.near(x, z)) {
      const v = shapeHeight(s, x, z);
      if (v > h) { h = v; shape = s; }
    }
    return { h, shape };
  }

  height(x: number, z: number): number {
    return this.top(x, z).h;
  }

  /** Height and slope. The slope comes from the shape that is on top (its own profile only). */
  ground(x: number, z: number): Ground {
    const { h, shape } = this.top(x, z);
    if (!shape) return { h, gx: 0, gz: 0, shape };
    const e = 0.03;
    const f = (px: number, pz: number) => {
      const v = shapeHeight(shape, px, pz);
      return Number.isNaN(v) ? NaN : v;
    };
    const ax = f(x + e, z), bx = f(x - e, z), az = f(x, z + e), bz = f(x, z - e);
    const gx = !Number.isNaN(ax) && !Number.isNaN(bx) ? (ax - bx) / (2 * e) : !Number.isNaN(ax) ? (ax - h) / e : !Number.isNaN(bx) ? (h - bx) / e : 0;
    const gz = !Number.isNaN(az) && !Number.isNaN(bz) ? (az - bz) / (2 * e) : !Number.isNaN(az) ? (az - h) / e : !Number.isNaN(bz) ? (h - bz) / e : 0;
    return { h, gx, gz, shape };
  }

  surface(x: number, z: number): Surface {
    return this.top(x, z).shape?.surf ?? this.baseSurf;
  }
}

// ------------------------------------------------------------------ rails

export interface RailSeg {
  rail: Rail;
  i: number;
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  /** Horizontal length and direction. */
  len: number; dx: number; dz: number;
}

export function railSegments(rails: Rail[]): RailSeg[] {
  const out: RailSeg[] = [];
  for (const r of rails) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, ay, az] = r.pts[i], [bx, by, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      out.push({ rail: r, i, ax, ay, az, bx, by, bz, len, dx: (bx - ax) / len, dz: (bz - az) / len });
    }
  }
  return out;
}

/** The nearest point of a segment to (x, z) in the horizontal plane: t (0…1), distance, height. */
export function onSeg(s: RailSeg, x: number, z: number): { t: number; d: number; y: number } {
  const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len));
  const px = s.ax + (s.bx - s.ax) * t, pz = s.az + (s.bz - s.az) * t;
  return { t, d: Math.hypot(x - px, z - pz), y: s.ay + (s.by - s.ay) * t };
}

// ------------------------------------------------------------------ zones

/** An axis-aligned box on the ground (gaps, landmarks). */
export interface Zone { x0: number; x1: number; z0: number; z1: number; y?: number }

export const inZone = (zn: Zone, x: number, z: number): boolean => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1;

export interface Gap {
  id: string;
  pts: number;
  /** 'jump': leave the ground in `a` and land (or lock onto a rail) in `b` in one air.
   *  'over': fly above `a` higher than its `y`. */
  kind: 'jump' | 'over';
  a: Zone;
  b?: Zone;
}
