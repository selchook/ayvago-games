// Coaster Rush: the track. Rides are laid from the Coaster Kit's real pieces: each piece's centre
// line (pieces.ts, measured from the GLBs) gives its entry and exit frames, and every piece is placed
// so its entry frame lands exactly on the previous piece's exit frame, so the rails join without gaps.
// A piece may be mirrored (left turns) or run backwards (drops are lifts run in reverse).
//
// The placed pieces' centre lines are joined into one smooth path (centripetal Catmull-Rom through
// the measured rings) and sampled every STEP units: position on the track's bottom line, tangent,
// up and the curvature vector (for the g-forces the riders feel).
//
// The course is built one area at a time from a seed: a station, a chain lift, a run of elements
// (drops, camelback humps, corners, helices, S-bends, loops, dips, hills, boosters), and from the
// second area on a junction into a SAFE and a THRILL branch that each end in their own station. An
// occupancy grid keeps new track clear of the old; heights are kept exact (half units plus whole
// 45° straights), so the track always comes back down to station level. Houses, coins and
// power-ups are placed with the track (they are part of the simulation: near-misses, pickups).
import { PIECE_PATHS } from './pieces';
import { AREAS, STYLES, G, Rng, areaOf, lapOf, clamp, type AreaDef, type Element, type PieceKind, type Power, type Style, POWERS } from './defs';

// ------------------------------------------------------------------ vectors

export type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Direction components of the kit's lattice (90° turns, 45° slopes). */
const LATTICE = [0, 0.5, Math.SQRT1_2, 1];
function snapDir(v: V3, tol = 0.02): V3 {
  const out = v.map((c) => {
    const a = Math.abs(c);
    let best = c, bd = tol;
    for (const q of LATTICE) if (Math.abs(a - q) < bd) { bd = Math.abs(a - q); best = Math.sign(c) * q; }
    return best;
  }) as V3;
  return norm(out);
}

/** A frame on the track: a point on its bottom line, the forward tangent and the up vector. */
export interface Frame { p: V3; t: V3; u: V3 }

/** Rigid transform as a 3×4 matrix: columns lat (left), up, forward, position. */
export type Mat = number[];

const frameMat = (f: Frame): Mat => { const l = cross(f.u, f.t); return [...l, ...f.u, ...f.t, ...f.p]; };
const apply = (m: Mat, v: V3): V3 => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2] + m[9], m[1] * v[0] + m[4] * v[1] + m[7] * v[2] + m[10], m[2] * v[0] + m[5] * v[1] + m[8] * v[2] + m[11]];
const rot = (m: Mat, v: V3): V3 => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
function invert(m: Mat): Mat {
  // rotation transposed, translation −Rᵀp
  const r = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  const p: V3 = [m[9], m[10], m[11]];
  const t: V3 = [-(r[0] * p[0] + r[3] * p[1] + r[6] * p[2]), -(r[1] * p[0] + r[4] * p[1] + r[7] * p[2]), -(r[2] * p[0] + r[5] * p[1] + r[8] * p[2])];
  return [...r, ...t];
}
function compose(a: Mat, b: Mat): Mat {
  const c = (i: number): V3 => rot(a, [b[i], b[i + 1], b[i + 2]]);
  return [...c(0), ...c(3), ...c(6), ...apply(a, [b[9], b[10], b[11]])];
}

// ------------------------------------------------------------------ pieces

interface Ring { p: V3; u: V3 }
interface LocalPiece { rings: Ring[]; entry: Frame; exit: Frame; length: number }

const localCache = new Map<string, LocalPiece>();

/** A piece's centre line in its own space, mirrored (x → −x) and/or run backwards. */
export function localPiece(kind: PieceKind, mirror: boolean, reverse: boolean): LocalPiece {
  const key = `${kind}|${mirror}|${reverse}`;
  let lp = localCache.get(key);
  if (lp) return lp;
  const raw = PIECE_PATHS[kind];
  let rings: Ring[] = [];
  for (let i = 0; i < raw.length; i += 6) {
    const p: V3 = [raw[i], raw[i + 1], raw[i + 2]], u: V3 = [raw[i + 3], raw[i + 4], raw[i + 5]];
    if (mirror) { p[0] = -p[0]; u[0] = -u[0]; }
    rings.push({ p, u });
  }
  if (reverse) rings = rings.reverse();
  const endT = (a: Ring, b: Ring): V3 => {
    // a piece's ends always point along the kit's lattice (90° turns, 45° slopes): the chord to the
    // next ring only says which lattice direction
    const d = norm(sub(b.p, a.p));
    return snapDir(sub(d, mul(a.u, dot(d, a.u))), 0.2);
  };
  const n = rings.length;
  const t0 = endT(rings[0], rings[1]);
  const t1 = mul(endT(rings[n - 1], rings[n - 2]), -1);
  let length = 0;
  for (let i = 1; i < n; i++) length += len(sub(rings[i].p, rings[i - 1].p));
  lp = { rings, entry: { p: rings[0].p, t: t0, u: snapDir(rings[0].u) }, exit: { p: rings[n - 1].p, t: t1, u: snapDir(rings[n - 1].u) }, length };
  localCache.set(key, lp);
  return lp;
}

export type Flag = '' | 'lift' | 'boost' | 'brake' | 'station';

/** A piece laid in the world. */
export interface Placed {
  kind: PieceKind;
  style: Style;
  mirror: boolean;
  /** Mesh transform (3×4, includes the mirror). */
  m: Mat;
  flag: Flag;
  /** Arc length along its section where it starts and ends. */
  s0: number;
  s1: number;
  /** Lowest point of the piece (supports, ground). */
  minY: number;
  /** World rings (for supports and scenery checks). */
  pts: V3[];
  /** Index of the section the piece belongs to. */
  sec: number;
  /** Feature the piece belongs to (for the HUD and the bot). */
  feat: Element | 'lift' | 'station' | 'brake' | 'fork' | 'flat';
}

const MIRROR: Mat = [-1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

// ------------------------------------------------------------------ the sampled path

export const STEP = 0.1;

/** One stretch of track sampled every STEP: positions, tangents, ups, curvature vectors. */
export class Seg {
  readonly n: number;
  readonly p: Float32Array;
  readonly t: Float32Array;
  readonly u: Float32Array;
  readonly k: Float32Array;
  /** Flags per sample (index into FLAGS). */
  readonly f: Uint8Array;
  constructor(readonly s0: number, pts: V3[], ups: V3[], flags: number[]) {
    const n = pts.length;
    this.n = n;
    this.p = new Float32Array(n * 3); this.t = new Float32Array(n * 3); this.u = new Float32Array(n * 3); this.k = new Float32Array(n * 3);
    this.f = new Uint8Array(flags);
    for (let i = 0; i < n; i++) this.p.set(pts[i], i * 3);
    // tangents from neighbours, ups made square to them
    const T: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      T.push(norm(sub(b, a)));
    }
    for (let i = 0; i < n; i++) {
      this.t.set(T[i], i * 3);
      const u = ups[i];
      this.u.set(norm(sub(u, mul(T[i], dot(u, T[i])))), i * 3);
    }
    // curvature vector dT/ds, smoothed over ±0.3 units
    const K: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = T[Math.max(0, i - 1)], b = T[Math.min(n - 1, i + 1)];
      const ds = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * STEP || STEP;
      K.push(mul(sub(b, a), 1 / ds));
    }
    const W = 3;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0, c = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { x += K[j][0]; y += K[j][1]; z += K[j][2]; c++; }
      this.k.set([x / c, y / c, z / c], i * 3);
    }
  }
  get s1(): number { return this.s0 + (this.n - 1) * STEP; }
}

/** What a point of the track looks like (filled by Course.at). */
export interface Sample {
  x: number; y: number; z: number;
  tx: number; ty: number; tz: number;
  ux: number; uy: number; uz: number;
  kx: number; ky: number; kz: number;
  flag: Flag;
}
export const newSample = (): Sample => ({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, ux: 0, uy: 1, uz: 0, kx: 0, ky: 0, kz: 0, flag: '' });
const FLAGS: Flag[] = ['', 'lift', 'boost', 'brake', 'station'];

/** Centripetal Catmull-Rom through ring points (with ups), sampled every STEP along the curve. */
function samplePath(rings: Ring[], s0: number, flagAt: (s: number) => number): { seg: Seg; length: number; cum: number[] } {
  const P = rings.map((r) => r.p), U = rings.map((r) => r.u);
  const n = P.length;
  const dense: V3[] = [], denseU: V3[] = [];
  const sub8 = 6;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    // centripetal knots
    const k = (a: V3, b: V3) => Math.max(1e-4, Math.sqrt(len(sub(b, a))));
    const t0 = 0, t1 = t0 + (i === 0 ? k(p1, p2) : k(p0, p1)), t2 = t1 + k(p1, p2), t3 = t2 + (i + 2 >= n ? k(p1, p2) : k(p2, p3));
    const q0 = i === 0 ? sub(mul(p1, 2), p2) : p0;
    const q3 = i + 2 >= n ? sub(mul(p2, 2), p1) : p3;
    for (let j = 0; j < sub8; j++) {
      const t = t1 + (t2 - t1) * (j / sub8);
      const A1 = add(mul(q0, (t1 - t) / (t1 - t0)), mul(p1, (t - t0) / (t1 - t0)));
      const A2 = add(mul(p1, (t2 - t) / (t2 - t1)), mul(p2, (t - t1) / (t2 - t1)));
      const A3 = add(mul(p2, (t3 - t) / (t3 - t2)), mul(q3, (t - t2) / (t3 - t2)));
      const B1 = add(mul(A1, (t2 - t) / (t2 - t0)), mul(A2, (t - t0) / (t2 - t0)));
      const B2 = add(mul(A2, (t3 - t) / (t3 - t1)), mul(A3, (t - t1) / (t3 - t1)));
      dense.push(add(mul(B1, (t2 - t) / (t2 - t1)), mul(B2, (t - t1) / (t2 - t1))));
      const f = j / sub8;
      denseU.push(norm(add(mul(U[i], 1 - f), mul(U[i + 1], f))));
    }
  }
  dense.push(P[n - 1]); denseU.push(U[n - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + len(sub(dense[i], dense[i - 1])));
  const length = cum[cum.length - 1];
  const count = Math.max(2, Math.round(length / STEP) + 1);
  const pts: V3[] = [], ups: V3[] = [], flags: number[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.min(length, i * STEP);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    pts.push(add(mul(dense[j], 1 - f), mul(dense[j + 1], f)));
    ups.push(norm(add(mul(denseU[j], 1 - f), mul(denseU[j + 1], f))));
    flags.push(flagAt(s0 + s));
  }
  return { seg: new Seg(s0, pts, ups, flags), length, cum };
}

// ------------------------------------------------------------------ course content

export type PickKind = 'coin' | 'ticket' | Power;
export interface Pickup {
  id: number;
  kind: PickKind;
  /** Section and arc length. */
  sec: number;
  s: number;
  /** Height above the riders' line (0: in reach; > 0 only with airtime or the magnet). */
  h: number;
  /** Sideways offset (left +). */
  side: number;
  taken: boolean;
}

export interface House {
  id: number;
  x: number; z: number;
  /** Footprint in cells (1 unit each) along its own axes, and storeys. */
  w: number; d: number; floors: number;
  /** Yaw in quarter turns. */
  rot: number;
  wood: boolean;
  /** Roof top height. */
  top: number;
  seed: number;
}

export interface NearMiss { sec: number; s: number; house: number }

export interface Station {
  sec: number;
  /** Where the train's front should come to rest (the bay's middle) and the bay's half-length. */
  stop: number;
  half: number;
  /** First and last arc length of the station's flat track. */
  s0: number;
  s1: number;
  /** Riders waiting. */
  queue: number;
  /** Side of the platform (left +1, right −1). */
  side: number;
  frame: Frame;
}

export interface Feature { sec: number; kind: Placed['feat']; s0: number; s1: number }

/** A stretch of an area: the main line (to the fork) or one branch. */
export interface Section {
  id: number;
  area: number;
  /** 0 main, 1 left branch, 2 right branch. */
  part: 0 | 1 | 2;
  thrill: boolean;
  s0: number;
  s1: number;
  seg: Seg;
  pieces: Placed[];
  station: Station | null;
  /** The first area's own starting station (the train waits there at the start). */
  start: Station | null;
  pickups: Pickup[];
  features: Feature[];
  nearMiss: NearMiss[];
  end: Frame;
  /** Height bookkeeping and speed estimate at the end (carried into branches). */
  carry: { hA: number; hD: number; v: number };
  /** Occupancy owners of the last pieces (the next section starts against them). */
  lastOwners: number[];
}

export interface Fork {
  area: number;
  /** Arc length of the fork (where the main section ends). */
  s: number;
  left: Section;
  right: Section;
  /** Which branch is the thrill ride (+1 left, −1 right). */
  thrillSide: number;
}

export interface AreaBuilt {
  n: number;
  def: AreaDef;
  sections: Section[];
  fork: Fork | null;
  houses: House[];
  /** Footprint of the area's track for the town (xz points with heights). */
  seed: number;
}

// ------------------------------------------------------------------ the builder

const CELL = 2;

/** Keeps the track's footprint: no new piece may come close to an older one at a similar height. */
class Occupancy {
  private cells = new Map<string, number[]>();
  private key = (cx: number, cz: number) => cx * 73856093 ^ cz * 19349663;
  add(pts: V3[], owner: number): void {
    // fill in between the rings (they are up to half a unit apart)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const k = String(this.key(Math.floor(p[0] / CELL), Math.floor(p[2] / CELL)));
      let l = this.cells.get(k);
      if (!l) this.cells.set(k, (l = []));
      l.push(p[0], p[1], p[2], owner);
    }
  }
  /** Whether the points come within `clear` (sideways) of track of other owners at a similar height. */
  clash(pts: V3[], skip: (owner: number) => boolean, clear = 2.3, vclear = 2.8): boolean {
    for (const p of pts) {
      const cx = Math.floor(p[0] / CELL), cz = Math.floor(p[2] / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const l = this.cells.get(String(this.key(cx + dx, cz + dz)));
        if (!l) continue;
        for (let i = 0; i < l.length; i += 4) {
          if (skip(l[i + 3])) continue;
          if (Math.abs(p[1] - l[i + 1]) > vclear) continue;
          if (Math.hypot(p[0] - l[i], p[2] - l[i + 2]) < clear) return true;
        }
      }
    }
    return false;
  }
}

/**
 * Station level: the lowest the track goes. Every station is a raised platform at this height, so
 * the hanging cars clear the ground and every style can follow every other.
 */
export const STATION_Y = 1.25;
/** The way the whole course progresses (pieces may run sideways but never back). */
export const AHEAD: V3 = [0, 0, -1];


/** Speed needed to clear a loop from its entry. */
export const LOOP_SPEED = 10.2;

export class Course {
  readonly sections: Section[] = [];
  readonly areas: AreaBuilt[] = [];
  private occ = new Occupancy();
  private pieceCount = 0;
  private sectionId = 0;
  private pickupId = 0;
  private houseId = 0;
  /** Number of areas built. */
  get built(): number { return this.areas.length; }

  constructor(readonly seed: number) {}

  /** The section that holds arc length `s` on the route (sections chosen so far). */
  sectionAt(route: Section[], s: number): Section {
    let lo = 0, hi = route.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (route[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return route[lo];
  }

  /** Samples the route at `s` into `out`. */
  at(route: Section[], s: number, out: Sample): Sample {
    const sec = this.sectionAt(route, s);
    const g = sec.seg;
    const x = clamp((s - g.s0) / STEP, 0, g.n - 1);
    const i = Math.min(g.n - 2, Math.floor(x)), f = x - i;
    const j = i + 1;
    const L = (a: Float32Array, c: number) => a[i * 3 + c] * (1 - f) + a[j * 3 + c] * f;
    out.x = L(g.p, 0); out.y = L(g.p, 1); out.z = L(g.p, 2);
    let tx = L(g.t, 0), ty = L(g.t, 1), tz = L(g.t, 2);
    const tl = Math.hypot(tx, ty, tz) || 1;
    out.tx = tx / tl; out.ty = ty / tl; out.tz = tz / tl;
    let ux = L(g.u, 0), uy = L(g.u, 1), uz = L(g.u, 2);
    const ul = Math.hypot(ux, uy, uz) || 1;
    out.ux = ux / ul; out.uy = uy / ul; out.uz = uz / ul;
    out.kx = L(g.k, 0); out.ky = L(g.k, 1); out.kz = L(g.k, 2);
    out.flag = FLAGS[g.f[f < 0.5 ? i : j]];
    void tx; void ty; void ux; void uy;
    return out;
  }

  // -------------------------------------------------------------- building an area

  /**
   * Builds area `n` from `start` (the previous station's frame, or the origin). The first area's
   * route starts with its own station; every later area starts where the previous one stopped.
   */
  buildArea(n: number, from: Section | null, ramp: number): AreaBuilt {
    const start: Frame = from ? from.end : { p: [0, STATION_Y, 0], t: [...AHEAD] as V3, u: [0, 1, 0] };
    const s0 = from ? from.s1 : 0;
    const def = areaOf(n);
    const lap = lapOf(n);
    const seed = (this.seed * 7919 + n * 104729) >>> 0;
    const rng = new Rng(seed);
    const style = def.style;
    const b = new Builder(this, rng, def, style, n, start, s0, ramp, lap);
    const main = b.section(0, false);
    if (from) main.owners.push(...from.lastOwners);
    b.stationRun(main, n === 0 ? 'start' : 'leave');
    b.lift(main, rng.int(def.lift[0], def.lift[1]) + (lap > 0 ? 1 : 0));
    const count = rng.int(def.elements[0], def.elements[1]) + Math.min(3, lap) + (n === 0 ? -1 : 0);
    const forkAt = n === 0 ? count : Math.max(3, count - 2);
    b.elements(main, forkAt, true);
    let fork: Fork | null = null;
    const sections: Section[] = [];
    if (n === 0) {
      b.descend(main);
      b.stationRun(main, 'arrive');
      sections.push(b.finish(main));
    } else {
      const mainSec = b.finish(main);
      sections.push(mainSec);
      const thrillSide = rng.chance(0.5) ? 1 : -1;
      const left = b.branch(mainSec, 1, thrillSide === 1, count - forkAt);
      const right = b.branch(mainSec, 2, thrillSide === -1, count - forkAt, left);
      sections.push(left, right);
      fork = { area: n, s: mainSec.s1, left, right, thrillSide };
    }
    const area: AreaBuilt = { n, def, sections, fork, houses: [], seed };
    b.town(area);
    this.areas.push(area);
    return area;
  }

  /** @internal */ nextSection(): number { return this.sectionId++; }
  /** @internal */ nextPiece(): number { return this.pieceCount++; }
  /** @internal */ nextPickup(): number { return this.pickupId++; }
  /** @internal */ nextHouse(): number { return this.houseId++; }
  /** @internal */ get occupancy(): Occupancy { return this.occ; }
}

interface Draft {
  id: number;
  part: 0 | 1 | 2;
  thrill: boolean;
  s0: number;
  frame: Frame;
  rings: Ring[];
  pieces: Placed[];
  owners: number[];
  pickups: Pickup[];
  features: Feature[];
  station: Station | null;
  start: Station | null;
  /** Heights: half units and whole 45° straights above the area's base. */
  hA: number;
  hD: number;
  /** Energy estimate: speed (units/s) at the end of the draft (careful riding). */
  v: number;
  len: number;
  /** Arc length intervals of flags. */
  flags: { s0: number; s1: number; f: number }[];
  /** Owner of a branch's sibling's first piece (they share the fork). */
  forkTwin: number;
}

/** Lays out one area's sections. */
class Builder {
  private base: number;

  constructor(private c: Course, private rng: Rng, private def: AreaDef, private style: Style, private n: number,
    private start: Frame, private s0: number, private ramp: number, private lap: number) {
    this.base = STATION_Y;
  }

  /** Which mirror makes a piece turn right (towards +x when heading along AHEAD). */
  private wantRight(d: Draft): boolean {
    const x = d.frame.p[0];
    return x < -7 ? true : x > 7 ? false : this.rng.chance(0.5);
  }

  private y(d: Draft): number { return this.base + d.hA + d.hD * 2 * Math.SQRT2; }

  section(part: 0 | 1 | 2, thrill: boolean, from?: Section): Draft {
    const f = from ? from.end : this.start;
    return {
      id: this.c.nextSection(), part, thrill, s0: from ? from.s1 : this.s0, frame: { p: [...f.p] as V3, t: [...f.t] as V3, u: [...f.u] as V3 },
      rings: [], pieces: [], owners: [], pickups: [], features: [], station: null, start: null,
      hA: from ? from.carry.hA : 0, hD: from ? from.carry.hD : 0, v: from ? from.carry.v : 0, len: 0, flags: [], forkTwin: -1,
    };
  }

  /** Lays a piece if it fits; returns false (and lays nothing) when it would clash. */
  private place(d: Draft, kind: PieceKind, o: { mirror?: boolean; reverse?: boolean; flag?: '' | 'lift' | 'boost' | 'brake' | 'station'; feat?: Placed['feat']; force?: boolean } = {}): boolean {
    const lp = localPiece(kind, !!o.mirror, !!o.reverse);
    const M = compose(frameMat(d.frame), invert(frameMat(lp.entry)));
    const pts = lp.rings.map((r) => apply(M, r.p));
    if (!o.force) {
      const recent = new Set(d.owners.slice(-3));
      const clash = this.c.occupancy.clash(pts.slice(1), (ow) => recent.has(ow) || ow === d.forkTwin);
      if (clash) return false;
      for (const p of pts) if (p[1] < this.base - 0.02) return false;
      // never back the way the course came
      const t = rot(M, lp.exit.t);
      if (t[0] * AHEAD[0] + t[2] * AHEAD[2] < -0.05) return false;
    }
    const owner = this.c.nextPiece();
    this.c.occupancy.add(pts, owner);
    d.owners.push(owner);
    const skipFirst = d.rings.length > 0;
    lp.rings.forEach((r, i) => { if (i > 0 || !skipFirst) d.rings.push({ p: apply(M, r.p), u: norm(rot(M, r.u)) }); });
    const exitP = apply(M, lp.exit.p);
    d.frame = { p: exitP, t: snapDir(rot(M, lp.exit.t)), u: snapDir(rot(M, lp.exit.u)) };
    const s0 = d.s0 + d.len;
    d.len += lp.length;
    const mesh = o.mirror ? compose(M, MIRROR) : M;
    const minY = Math.min(...pts.map((p) => p[1]));
    d.pieces.push({ kind, style: this.style, mirror: !!o.mirror, m: mesh, flag: o.flag ?? '', s0, s1: d.s0 + d.len, minY, pts, sec: d.id, feat: o.feat ?? 'flat' });
    if (o.flag) d.flags.push({ s0, s1: d.s0 + d.len, f: FLAGS.indexOf(o.flag) });
    return true;
  }

  /** Lays a run of pieces, all or nothing (rolls the draft back when one does not fit). */
  private run(d: Draft, list: [PieceKind, { mirror?: boolean; reverse?: boolean; flag?: '' | 'lift' | 'boost' | 'brake' | 'station' }?][], feat: Placed['feat'], force = false): boolean {
    const snap = { frame: d.frame, rings: d.rings.length, pieces: d.pieces.length, owners: d.owners.length, len: d.len, flags: d.flags.length };
    const s0 = d.s0 + d.len;
    for (const [k, o] of list) {
      if (!this.place(d, k, { ...(o ?? {}), feat, force })) {
        d.frame = snap.frame; d.rings.length = snap.rings; d.pieces.length = snap.pieces; d.owners.length = snap.owners; d.len = snap.len; d.flags.length = snap.flags;
        return false;
      }
    }
    d.features.push({ sec: d.id, kind: feat, s0, s1: d.s0 + d.len });
    return true;
  }

  /** Friction and drag eat speed along a stretch (careful estimate). */
  private coast(d: Draft, dist: number, dy: number): void {
    const e = d.v * d.v / 2 - G * dy - 0.45 * dist;
    d.v = Math.sqrt(Math.max(0, 2 * e));
  }

  // -------------------------------------------------------------- stations and lifts

  stationRun(d: Draft, kind: 'start' | 'leave' | 'arrive'): void {
    if (kind === 'arrive') {
      // a brake run, then the station's three flat straights; the bay is the middle one
      this.run(d, [['straight', { flag: 'brake' }]], 'brake', true);
    }
    const s0 = d.s0 + d.len;
    const frame = { p: [...d.frame.p] as V3, t: [...d.frame.t] as V3, u: [...d.frame.u] as V3 };
    const n = kind === 'leave' ? 1 : 3;
    const list: [PieceKind, { flag: 'station' }][] = [];
    for (let i = 0; i < n; i++) list.push(['straight', { flag: 'station' }]);
    this.run(d, list, 'station', true);
    if (kind !== 'leave') {
      const s1 = d.s0 + d.len;
      const queue = 2 + this.rng.int(0, 2) + Math.min(4, this.n);
      const st: Station = { sec: d.id, stop: s1 - 2.2, half: 1.6, s0, s1, queue, side: this.rng.chance(0.5) ? 1 : -1, frame };
      if (kind === 'start') d.start = st; else d.station = st;
    }
    d.v = 0;
  }

  /** A chain lift: up at 45°, `n` straights on the slope, and over the top. */
  lift(d: Draft, n: number): void {
    const list: [PieceKind, { flag: 'lift' }][] = [['straight-hill-beginning', { flag: 'lift' }]];
    for (let i = 0; i < n; i++) list.push(['straight', { flag: 'lift' }]);
    list.push(['straight-hill-end', { flag: 'lift' }]);
    if (!this.run(d, list, 'lift')) {
      // a short lift always fits better; as the last resort, lay it regardless
      if (!this.run(d, [['straight-hill-beginning', { flag: 'lift' }], ['straight-hill-end', { flag: 'lift' }]], 'lift')) {
        this.run(d, list, 'lift', true);
      } else { d.hA += 2; d.v = 3; return; }
    }
    d.hA += 2; d.hD += n; d.v = 3;
  }

  // -------------------------------------------------------------- elements

  // Heights: every lift adds 2 units (hA += 2) and its 45° straights (hD += n); a drop
  // takes 2 half units and all the 45° straights back, so the track can always return exactly to
  // station level. Hills and descending helices move whole and half units, but only above the
  // 2 units a pending drop needs.
  private canLower(d: Draft, dy: number): boolean { return d.hD > 0 ? d.hA - dy >= 2 : d.hA - dy >= 0; }

  elements(d: Draft, count: number, allowLift: boolean): void {
    let laid = 0, tries = 0;
    let last: Element | '' = '';
    while (laid < count && tries < count * 8) {
      tries++;
      // low and slow with work left: another chain lift
      if (allowLift && d.hA < 1 && d.hD === 0 && d.v < 7 && laid < count - 1 && this.rng.chance(0.6)) {
        this.flat(d, 1);
        this.lift(d, this.rng.int(1, 2));
        last = '';
        continue;
      }
      const w: Partial<Record<Element, number>> = { ...this.def.weights };
      if (last) w[last] = (w[last] ?? 0) * 0.25;
      if (d.hA < 2) delete w.drop;
      else w.drop = (w.drop ?? 1) * (d.hD > 0 ? 4 : 1.5);
      if (!this.canLower(d, 1)) delete w.helix;
      if (d.v < 5) { delete w.camel; if (d.hD > 0) delete w.hill; }
      if (!Object.keys(w).length) { this.flat(d, 1); continue; }
      const el = this.rng.weighted(w);
      if (this.element(d, el)) {
        laid++;
        last = el;
        this.pickupsFor(d, el);
        if (this.rng.chance(0.25)) this.flat(d, 1);
      }
    }
  }

  private flat(d: Draft, n: number): void {
    for (let i = 0; i < n; i++) if (!this.run(d, [['straight']], 'flat')) this.run(d, [['straight']], 'flat', true);
    this.coast(d, 4 * n, 0);
  }

  private booster(d: Draft): boolean {
    if (!this.run(d, [['straight', { flag: 'boost' }], ['straight', { flag: 'boost' }]], 'boost')) return false;
    d.v = Math.max(d.v, 12.5);
    return true;
  }

  /** Lays one element; false when nothing of that kind fits here. */
  element(d: Draft, el: Element): boolean {
    const r = this.rng;
    const m = r.chance(0.5);
    switch (el) {
      case 'drop': {
        if (d.hA < 2) return false;
        const k = d.hD;
        const list: [PieceKind, { reverse: boolean }?][] = [['straight-hill-end', { reverse: true }]];
        for (let i = 0; i < k; i++) list.push(['straight']);
        list.push(['straight-hill-beginning', { reverse: true }]);
        // a run-out after a big drop: room to brake before whatever comes next
        list.push(['straight']);
        if (!this.run(d, list, 'drop')) return false;
        const dy = 2 + k * 2 * Math.SQRT2;
        d.hA -= 2; d.hD = 0;
        this.coast(d, 8 + k * 4, -dy);
        return true;
      }
      case 'camel': {
        if (d.v < 5.5 && !this.booster(d)) return false;
        const k = r.int(1, 2);
        const list: [PieceKind][] = [];
        for (let i = 0; i < k; i++) list.push(['straight-bump-up']);
        if (!this.run(d, list, 'camel')) return false;
        this.coast(d, 4 * k, 0);
        return true;
      }
      case 'dip':
        if (!this.run(d, [['straight-bump-down']], 'dip')) return false;
        this.coast(d, 4, 0);
        return true;
      case 'hill': {
        const half = r.chance(0.4);
        const dy = half ? 0.5 : 1;
        const up = d.v > 7.5 && d.hA < 3 && (r.chance(0.6) || !this.canLower(d, dy));
        if (!up && !this.canLower(d, dy)) return false;
        const kind: PieceKind = half ? 'straight-hill-complete-half' : 'straight-hill-complete';
        if (!this.run(d, [[kind, { reverse: !up }]], 'hill')) return false;
        d.hA += up ? dy : -dy;
        this.coast(d, 4, up ? dy : -dy);
        return true;
      }
      case 'corner': {
        const small = r.chance(this.def.tight);
        const kind: PieceKind = small ? 'corner-small' : 'corner-large';
        const m = !this.wantRight(d);
        if (!this.run(d, [[kind, { mirror: m }]], 'corner') && !this.run(d, [[kind, { mirror: !m }]], 'corner')) return false;
        // careful riders brake to the corner's limit
        d.v = Math.min(d.v, Math.sqrt(2.2 * G * (small ? 2 : 4)) * 0.9);
        this.coast(d, small ? 3.1 : 6.3, 0);
        return true;
      }
      case 'helix': {
        if (!this.canLower(d, 1)) return false;
        const small = r.chance(this.def.tight * 0.6);
        const kind: PieceKind = small ? 'corner-small-ramp' : 'corner-large-ramp';
        // a descending turn: the ramp corner run backwards (it turns right when mirrored)
        const m = this.wantRight(d);
        if (!this.run(d, [[kind, { mirror: m, reverse: true }]], 'helix') && !this.run(d, [[kind, { mirror: !m, reverse: true }]], 'helix')) return false;
        d.hA -= 1;
        d.v = Math.min(d.v, Math.sqrt(2.2 * G * (small ? 2 : 4)) * 0.9);
        this.coast(d, small ? 3.3 : 6.5, -1);
        return true;
      }
      case 'scurve':
        if (!this.run(d, [['curve', { mirror: m }]], 'scurve') && !this.run(d, [['curve', { mirror: !m }]], 'scurve')) return false;
        d.v = Math.min(d.v, Math.sqrt(2.2 * G * 2.6) * 0.92);
        this.coast(d, 4.6, 0);
        return true;
      case 'loop': {
        if (d.v < LOOP_SPEED + 0.6) {
          if (!this.booster(d) || d.v < LOOP_SPEED + 0.6) return false;
        }
        if (!this.run(d, [['looping', { mirror: m }], ['straight']], 'loop') && !this.run(d, [['looping', { mirror: !m }], ['straight']], 'loop')) return false;
        this.coast(d, 17, 0);
        return true;
      }
      case 'boost':
        return this.booster(d);
    }
  }

  /** Down to station level: the pending drop, more drops, then hills and half hills. */
  descend(d: Draft): void {
    let guard = 0;
    while (d.hA > 0.01 && guard++ < 24) {
      let ok = false;
      if (d.hA >= 2) ok = this.element(d, 'drop');
      else if (d.hA >= 1) {
        ok = this.run(d, [['straight-hill-complete', { reverse: true }]], 'hill') || this.helixDown(d);
        if (ok && d.features[d.features.length - 1].kind === 'hill') d.hA -= 1;
      } else {
        ok = this.run(d, [['straight-hill-complete-half', { reverse: true }]], 'hill');
        if (ok) d.hA -= 0.5;
      }
      if (!ok) this.turnAway(d);
    }
    // nothing fitted: force the last steps down
    if (d.hA >= 2) {
      const list: [PieceKind, { reverse: boolean }?][] = [['straight-hill-end', { reverse: true }]];
      for (let i = 0; i < d.hD; i++) list.push(['straight']);
      list.push(['straight-hill-beginning', { reverse: true }]);
      this.run(d, list, 'drop', true);
      d.hA -= 2; d.hD = 0;
    }
    while (d.hA >= 0.99) { this.run(d, [['straight-hill-complete', { reverse: true }]], 'hill', true); d.hA -= 1; }
    while (d.hA >= 0.49) { this.run(d, [['straight-hill-complete-half', { reverse: true }]], 'hill', true); d.hA -= 0.5; }
    d.v = Math.min(d.v, 9);
  }

  private helixDown(d: Draft): boolean {
    const m = this.rng.chance(0.5);
    if (this.run(d, [['corner-large-ramp', { mirror: m, reverse: true }]], 'helix') || this.run(d, [['corner-large-ramp', { mirror: !m, reverse: true }]], 'helix')) { d.hA -= 1; return true; }
    return false;
  }

  /** A corner to get away from whatever blocks the way. */
  private turnAway(d: Draft): void {
    const m = this.rng.chance(0.5);
    for (const k of ['corner-large', 'corner-small'] as PieceKind[]) {
      if (this.run(d, [[k, { mirror: m }]], 'corner') || this.run(d, [[k, { mirror: !m }]], 'corner')) return;
    }
    if (!this.run(d, [['straight']], 'flat')) this.run(d, [['straight']], 'flat', true);
  }

  /** A branch from the fork: an S-bend to its side, a few elements, down and into its station. */
  branch(main: Section, part: 1 | 2, thrill: boolean, count: number, twin?: Section): Section {
    const d = this.section(part, thrill, main);
    d.owners.push(...main.lastOwners);
    if (twin) d.forkTwin = this.firstOwner.get(twin.id) ?? -1;
    const mirror = part === 1;
    this.run(d, [['curve', { mirror }]], 'fork', true);
    this.firstOwner.set(d.id, d.owners[d.owners.length - 1]);
    // turn away from the other branch (a right S-bend shifts right, so the right branch turns right)
    if (!this.run(d, [['corner-large', { mirror }]], 'corner')) this.run(d, [['corner-small', { mirror }]], 'corner');
    this.coast(d, 10, 0);
    if (thrill) {
      // the thrill ride: big moves and a power-up
      const list: Element[] = this.def.weights.loop ? ['loop', 'camel', 'drop'] : ['drop', 'camel', 'corner'];
      if (d.v < 8) list.unshift('boost');
      let laid = 0;
      for (const el of list) {
        if (laid >= Math.max(2, count)) break;
        if (this.element(d, el)) { laid++; this.pickupsFor(d, el, true); }
      }
      this.elements(d, Math.max(0, count - laid), false);
    } else {
      // the safe ride: gentle bends and hills past the houses, coins along the way
      for (const el of ['scurve', 'hill', 'corner'] as Element[]) if (this.element(d, el)) this.pickupsFor(d, el);
    }
    this.descend(d);
    this.stationRun(d, 'arrive');
    return this.finish(d);
  }
  private firstOwner = new Map<number, number>();

  /** Turns a draft into a sampled section. */
  finish(d: Draft): Section {
    const flags = d.flags;
    const flagAt = (s: number): number => { for (const f of flags) if (s >= f.s0 && s <= f.s1) return f.f; return 0; };
    const { seg, length } = samplePath(d.rings, d.s0, flagAt);
    // the sampled length differs a hair from the summed chords: stretch piece ranges to match
    const k = length / Math.max(1e-6, d.len);
    for (const p of d.pieces) { p.s0 = d.s0 + (p.s0 - d.s0) * k; p.s1 = d.s0 + (p.s1 - d.s0) * k; }
    for (const f of d.features) { f.s0 = d.s0 + (f.s0 - d.s0) * k; f.s1 = d.s0 + (f.s1 - d.s0) * k; }
    for (const p of d.pickups) p.s = d.s0 + (p.s - d.s0) * k;
    for (const st of [d.station, d.start]) {
      if (!st) continue;
      st.s0 = d.s0 + (st.s0 - d.s0) * k; st.s1 = d.s0 + (st.s1 - d.s0) * k; st.stop = d.s0 + (st.stop - d.s0) * k;
    }
    const sec: Section = {
      id: d.id, area: this.n, part: d.part, thrill: d.thrill, s0: d.s0, s1: d.s0 + length, seg, pieces: d.pieces,
      station: d.station, start: d.start, pickups: d.pickups, features: d.features, nearMiss: [], end: d.frame,
      carry: { hA: d.hA, hD: d.hD, v: d.v }, lastOwners: d.owners.slice(-3),
    };
    this.c.sections.push(sec);
    return sec;
  }

  // -------------------------------------------------------------- pickups

  private pickupsFor(d: Draft, el: Element, rich = false): void {
    const f = d.features[d.features.length - 1];
    if (!f || f.kind !== el) return;
    const r = this.rng;
    const add = (s: number, kind: PickKind, h = 0) => d.pickups.push({ id: this.c.nextPickup(), kind, sec: d.id, s, h, side: 0, taken: false });
    const span = f.s1 - f.s0;
    switch (el) {
      case 'camel': {
        // a line of coins up the hump and a high one over each crest (airtime)
        for (let s = f.s0 + 0.8; s < f.s1 - 0.5; s += 4) {
          add(s + 0.6, 'coin'); add(s + 1.2, 'coin');
          add(s + 2.0, rich && r.chance(0.5) ? 'ticket' : 'coin', 1.1);
          add(s + 2.8, 'coin'); add(s + 3.4, 'coin');
        }
        break;
      }
      case 'drop':
        for (let s = f.s0 + 2; s < f.s1 - 1; s += 1.1) add(s, 'coin');
        break;
      case 'loop':
        // around the top of the loop
        for (let s = f.s0 + span * 0.38; s < f.s0 + span * 0.62; s += 0.8) add(s, 'coin');
        add(f.s0 + span * 0.5, 'ticket', 0);
        break;
      case 'corner': case 'helix': case 'scurve': case 'hill': case 'dip':
        if (r.chance(rich ? 0.9 : 0.6)) for (let s = f.s0 + 0.6; s < f.s1 - 0.4; s += 1.0) add(s, 'coin');
        break;
      case 'boost': break;
    }
    // power-ups: one now and then, always one on a thrill branch
    const want = rich ? d.pickups.every((p) => !POWERS.includes(p.kind as Power)) : r.chance(0.16 + Math.min(0.1, this.n * 0.02));
    if (want && span > 3) {
      const kinds = this.n === 0 ? (['magnet', 'turbo', 'golden'] as Power[]) : POWERS;
      add(f.s0 + span * 0.5 + 0.3, r.pick(kinds), 0);
    }
  }

  // -------------------------------------------------------------- the town

  /** Houses along the track (near-misses), clear of it and of each other. */
  town(area: AreaBuilt): void {
    const r = new Rng(area.seed ^ 0x5bd1e995);
    const pts: { p: V3; sec: Section; s: number }[] = [];
    for (const sec of area.sections) {
      const g = sec.seg;
      for (let i = 0; i < g.n; i += 5) pts.push({ p: [g.p[i * 3], g.p[i * 3 + 1], g.p[i * 3 + 2]], sec, s: g.s0 + i * STEP });
    }
    const houses: House[] = [];
    const clearOf = (x: number, z: number, rad: number, top: number): boolean => {
      for (const q of pts) {
        const dx = q.p[0] - x, dz = q.p[2] - z;
        const dist = Math.hypot(dx, dz);
        // the track may pass over a roof with room to spare (the hanging cars need more)
        const room = STYLES[this.style].hang ? 2.2 : 1.3;
        if (dist < rad + 0.9 && q.p[1] < top + room) return false;
      }
      for (const h of houses) if (Math.hypot(h.x - x, h.z - z) < (Math.max(h.w, h.d) + rad * 2) * 0.62 + 0.5) return false;
      return true;
    };
    const want = this.def.id === 'rooftops' ? 70 : 46;
    for (const sec of area.sections) {
      const g = sec.seg;
      for (let i = 20; i < g.n && houses.length < want * (sec.part ? 1.3 : 1); i += 14 + r.int(0, 14)) {
        const p: V3 = [g.p[i * 3], g.p[i * 3 + 1], g.p[i * 3 + 2]];
        const t: V3 = [g.t[i * 3], 0, g.t[i * 3 + 2]];
        const tl = Math.hypot(t[0], t[2]);
        if (tl < 0.3) continue;
        const side = r.chance(0.5) ? 1 : -1;
        const lx = -t[2] / tl * side, lz = t[0] / tl * side;
        const w = r.int(1, 3), dd = r.int(1, 2);
        const floors = this.def.id === 'rooftops' ? r.int(2, 3) : r.int(1, 2);
        const rad = Math.max(w, dd) * 0.72;
        const off = rad + (this.def.id === 'rooftops' ? r.range(0.3, 1.6) : r.range(1.2, 3));
        const x = p[0] + lx * off, z = p[2] + lz * off;
        const top = floors + 0.9;
        if (!clearOf(x, z, rad, top)) continue;
        // face the track: rotation in quarter turns
        const yaw = Math.atan2(-lx, -lz);
        const rot = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
        houses.push({ id: this.c.nextHouse(), x, z, w, d: dd, floors, rot, wood: r.chance(0.5), top, seed: r.int(0, 1e9) });
      }
    }
    area.houses = houses;
    // near-misses: the track passing close beside a house or just over its roof
    for (const h of houses) {
      let best: { sec: Section; s: number; d: number } | null = null;
      for (const q of pts) {
        const dist = Math.hypot(q.p[0] - h.x, q.p[2] - h.z) - Math.max(h.w, h.d) * 0.55;
        const over = q.p[1] - h.top;
        const close = (dist < 1.25 && q.p[1] < h.top + 0.6) || (dist < 0.6 && over > -0.2 && over < 2.0);
        if (close && (!best || dist < best.d)) best = { sec: q.sec, s: q.s, d: dist };
      }
      if (best) best.sec.nearMiss.push({ sec: best.sec.id, s: best.s, house: h.id });
    }
    for (const sec of area.sections) sec.nearMiss.sort((a, b) => a.s - b.s);
  }
}

export { AREAS };
