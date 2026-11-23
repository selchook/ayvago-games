// City generator: 2D geometry on the ground plane (x east, z south, metres). Pure functions.
//
// Conventions used everywhere in the city:
//   - nrm(d) = (-d.z, d.x) is the "N side" of a direction. Seen from above with y up it is the
//     physical right-hand side, so right-hand traffic drives on the N side, and the faces
//     (blocks) of the road graph lie on the N side of their half-edges.
//   - A polygon with positive signedArea() keeps its interior on the N side of its edges.
//   - A heading h faces (sin h, cos h): the same as three.js rotation.y for an object facing +z.

export interface P { x: number; z: number }

/** Oriented box: centre, half sizes along its axes u = (ux, uz) and v = (-uz, ux). */
export interface OBB { x: number; z: number; hw: number; hd: number; ux: number; uz: number }

export const p = (x: number, z: number): P => ({ x, z });
export const add = (a: P, b: P): P => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: P, b: P): P => ({ x: a.x - b.x, z: a.z - b.z });
export const mul = (a: P, s: number): P => ({ x: a.x * s, z: a.z * s });
export const dot = (a: P, b: P): number => a.x * b.x + a.z * b.z;
export const cross = (a: P, b: P): number => a.x * b.z - a.z * b.x;
export const len = (a: P): number => Math.hypot(a.x, a.z);
export const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.z - b.z);
export const dist2 = (a: P, b: P): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
export const nrm = (d: P): P => ({ x: -d.z, z: d.x });
export const unit = (a: P): P => { const l = Math.hypot(a.x, a.z) || 1; return { x: a.x / l, z: a.z / l }; };
export const angleOf = (d: P): number => Math.atan2(d.z, d.x);
export const fromAngle = (a: number, r = 1): P => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
/** Heading (three.js yaw) of a direction: the object's +z faces d. */
export const headingOf = (d: P): number => Math.atan2(d.x, d.z);
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Angle wrapped to [0, 2π). */
export const wrap2pi = (a: number): number => { const t = a % (Math.PI * 2); return t < 0 ? t + Math.PI * 2 : t; };

/** Intersection of two infinite lines p + t·d and q + s·e (null when parallel). */
export function lineX(pp: P, d: P, q: P, e: P): { t: number; s: number } | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(q, pp);
  return { t: cross(w, e) / den, s: cross(w, d) / den };
}

/** Proper intersection of segments ab and cd: parameters along each (0..1) or null. */
export function segX(a: P, b: P, c: P, d: P): { t: number; s: number } | null {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(c, a);
  const t = cross(w, s) / den, u = cross(w, r) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, s: u };
}

/** Distance from point q to segment ab, and the parameter of the closest point. */
export function segDist(q: P, a: P, b: P): { d: number; t: number } {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((q.x - a.x) * abx + (q.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(a.x + abx * t - q.x, a.z + abz * t - q.z), t };
}

export function signedArea(poly: P[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

export function centroid(poly: P[]): P {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p0 = poly[i], p1 = poly[(i + 1) % n];
    const c = p0.x * p1.z - p1.x * p0.z;
    a += c; cx += (p0.x + p1.x) * c; cz += (p0.z + p1.z) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const q of poly) { sx += q.x; sz += q.z; }
    return { x: sx / poly.length, z: sz / poly.length };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export function pointInPoly(q: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > q.z) !== (b.z > q.z) && q.x < ((b.x - a.x) * (q.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function bounds(poly: P[]): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of poly) {
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
  }
  return { x0, z0, x1, z1 };
}

/** Distance from q to the polygon's outline. */
export function polyEdgeDist(q: P, poly: P[]): number {
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) best = Math.min(best, segDist(q, poly[i], poly[(i + 1) % n]).d);
  return best;
}

/** True when two non-adjacent edges of the polygon cross (O(n²), fine for blocks). */
export function selfIntersects(poly: P[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  const bb = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
  });
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const A = bb[i], B = bb[j];
      if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) continue;
      const x = segX(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]);
      if (x && x.t > 1e-6 && x.t < 1 - 1e-6 && x.s > 1e-6 && x.s < 1 - 1e-6) return true;
    }
  }
  return false;
}

/** Removes consecutive points closer than eps and collinear middle points. */
export function cleanPoly(poly: P[], eps = 0.05, colinear = 1e-4): P[] {
  let out: P[] = [];
  for (const q of poly) if (!out.length || dist(out[out.length - 1], q) > eps) out.push(q);
  if (out.length > 1 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    const next: P[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const ab = sub(b, a), bc = sub(c, b);
      const l = len(ab) * len(bc);
      if (l > 0 && Math.abs(cross(ab, bc)) / l < colinear && dot(ab, bc) > 0) { changed = true; continue; }
      next.push(b);
    }
    out = next;
  }
  return out;
}

/**
 * Offsets a polygon (positive area) inwards by d with mitred corners (capped). Corners the
 * offset swallows (tight arcs, short edges) are cut out as loops. Returns the new outline with,
 * per point, the index of the original point it came from; null when nothing valid is left.
 */
export function insetPolySrc(poly: P[], d: number | number[], miterCap = 4): { poly: P[]; src: number[] } | null {
  const n = poly.length;
  const out: P[] = [];
  const dd = (i: number) => (typeof d === 'number' ? d : d[(i + n) % n]);
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    const e1 = unit(sub(b, a)), e2 = unit(sub(c, b));
    const n1 = nrm(e1), n2 = nrm(e2);
    const d1 = dd(i - 1), d2 = dd(i);
    const x = lineX(add(b, mul(n1, d1)), e1, add(b, mul(n2, d2)), e2);
    let q: P;
    if (!x || Math.abs(cross(e1, e2)) < 0.02) q = add(b, mul(unit(add(n1, n2)), (d1 + d2) / 2));
    else q = add(add(b, mul(n1, d1)), mul(e1, x.t));
    const off = sub(q, b);
    const cap = Math.max(d1, d2) * miterCap;
    if (len(off) > cap) q = add(b, mul(unit(off), cap));
    out.push(q);
  }
  const src = out.map((_, i) => i);
  // drop edges that flipped (the offset passed them), then cut the loops left over
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const j = (i + 1) % out.length;
      const e0 = sub(poly[(src[i] + 1) % n], poly[src[i]]);
      const e1 = sub(out[j], out[i]);
      if (src[j] === (src[i] + 1) % n && dot(e0, e1) < 0) {
        // replace both ends by their midpoint
        const m = lerp(out[i], out[j], 0.5);
        out[i] = m;
        out.splice(j, 1); src.splice(j, 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (out.length < 3) return null;
  // a neck pinched shut splits the outline: keep the bigger part
  for (let guard = 0; guard < 8 && !removeLoops(out, src, 24); guard++) {
    const x = firstCrossing(out);
    if (!x) break;
    const [i, j, q] = x;
    const A = [q, ...out.slice(i + 1, j + 1)], As = [src[i], ...src.slice(i + 1, j + 1)];
    const B = [...out.slice(0, i + 1), q, ...out.slice(j + 1)], Bs = [...src.slice(0, i + 1), src[j], ...src.slice(j + 1)];
    const keepA = signedArea(A) > signedArea(B);
    out.length = 0; src.length = 0;
    out.push(...(keepA ? A : B)); src.push(...(keepA ? As : Bs));
  }
  if (firstCrossing(out)) return null;
  const a0 = signedArea(poly), a1 = signedArea(out);
  if (a1 <= 0 || a1 > a0 || out.length < 3) return null;
  return { poly: out, src };
}

export function insetPoly(poly: P[], d: number | number[], miterCap = 4): P[] | null {
  return insetPolySrc(poly, d, miterCap)?.poly ?? null;
}

/** Point at arc length s along a polyline, with the direction there. */
export function alongPolyline(pts: P[], s: number): { p: P; d: P; i: number } {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i], pts[i + 1]);
    if (s <= acc + l || i === pts.length - 2) {
      const t = l > 0 ? clamp((s - acc) / l, 0, 1) : 0;
      return { p: lerp(pts[i], pts[i + 1], t), d: unit(sub(pts[i + 1], pts[i])), i };
    }
    acc += l;
  }
  return { p: pts[0], d: { x: 1, z: 0 }, i: 0 };
}

export function polylineLength(pts: P[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += dist(pts[i], pts[i + 1]);
  return l;
}

/** Cumulative arc lengths of a polyline's points. */
export function arcLengths(pts: P[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + dist(pts[i - 1], pts[i]));
  return out;
}

/**
 * The part of a polyline between arc lengths s0 and s1, offset sideways by `off` (N side
 * positive) with mitred joins.
 */
export function offsetPolyline(pts: P[], off: number, s0 = 0, s1 = Infinity): P[] {
  const acc = arcLengths(pts);
  const total = acc[acc.length - 1];
  s1 = Math.min(s1, total);
  if (s1 <= s0) return [];
  const out: P[] = [];
  const at = (s: number) => {
    const a = alongPolyline(pts, s);
    return add(a.p, mul(nrm(a.d), off));
  };
  out.push(at(s0));
  for (let i = 1; i < pts.length - 1; i++) {
    if (acc[i] <= s0 + 1e-6 || acc[i] >= s1 - 1e-6) continue;
    const e1 = unit(sub(pts[i], pts[i - 1])), e2 = unit(sub(pts[i + 1], pts[i]));
    const m = unit(add(nrm(e1), nrm(e2)));
    const c = Math.max(0.3, dot(m, nrm(e1)));
    out.push(add(pts[i], mul(m, off / c)));
  }
  out.push(at(s1));
  return out;
}

// ------------------------------------------------------------------ oriented boxes

export function obbCorners(b: OBB): P[] {
  const ux = b.ux * b.hw, uz = b.uz * b.hw;
  const vx = -b.uz * b.hd, vz = b.ux * b.hd;
  return [
    { x: b.x - ux - vx, z: b.z - uz - vz },
    { x: b.x + ux - vx, z: b.z + uz - vz },
    { x: b.x + ux + vx, z: b.z + uz + vz },
    { x: b.x - ux + vx, z: b.z - uz + vz },
  ];
}

/** Point in box (with margin). */
export function inObb(q: P, b: OBB, m = 0): boolean {
  const dx = q.x - b.x, dz = q.z - b.z;
  const u = dx * b.ux + dz * b.uz, v = -dx * b.uz + dz * b.ux;
  return Math.abs(u) <= b.hw + m && Math.abs(v) <= b.hd + m;
}

/** Separating-axis test for two oriented boxes (margin shrinks both). */
export function obbOverlap(a: OBB, b: OBB, margin = 0): boolean {
  const rr = Math.hypot(a.hw, a.hd) + Math.hypot(b.hw, b.hd);
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx * dx + dz * dz > rr * rr) return false;
  // separating axes: a's u, a's v, b's u, b's v (no allocations)
  const axes = [a.ux, a.uz, -a.uz, a.ux, b.ux, b.uz, -b.uz, b.ux];
  for (let k = 0; k < 8; k += 2) {
    const ax = axes[k], az = axes[k + 1];
    const ra = a.hw * Math.abs(a.ux * ax + a.uz * az) + a.hd * Math.abs(-a.uz * ax + a.ux * az);
    const rb = b.hw * Math.abs(b.ux * ax + b.uz * az) + b.hd * Math.abs(-b.uz * ax + b.ux * az);
    if (Math.abs(dx * ax + dz * az) >= ra + rb - margin) return false;
  }
  return true;
}

/** Box fully inside a polygon: corners inside and no outline edge crossing the box. */
export function obbInPoly(b: OBB, poly: P[]): boolean {
  const cs = obbCorners(b);
  for (const c of cs) if (!pointInPoly(c, poly)) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], q = poly[(i + 1) % poly.length];
    if (inObb(a, b, -0.01)) return false;
    for (let k = 0; k < 4; k++) {
      const x = segX(a, q, cs[k], cs[(k + 1) % 4]);
      if (x && x.t > 1e-4 && x.t < 1 - 1e-4 && x.s > 1e-4 && x.s < 1 - 1e-4) return false;
    }
  }
  return true;
}

/** Local → world for a box frame: u along the box's width axis, v along its depth axis. */
export const obbPoint = (b: OBB, u: number, v: number): P => ({ x: b.x + b.ux * u - b.uz * v, z: b.z + b.uz * u + b.ux * v });

/** World → box-local (u, v). */
export function obbLocal(b: OBB, q: P): P {
  const dx = q.x - b.x, dz = q.z - b.z;
  return { x: dx * b.ux + dz * b.uz, z: -dx * b.uz + dz * b.ux };
}

/** Heading (three.js yaw) of a box's +v axis. */
export const obbYaw = (b: OBB): number => Math.atan2(-b.uz, b.ux);

/** Sutherland–Hodgman: polygon clipped to the half-plane on the N side of the line a→b. */
export function clipHalf(poly: P[], a: P, b: P): P[] {
  const d = sub(b, a);
  const side = (q: P) => cross(d, sub(q, a));
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i], n = poly[(i + 1) % poly.length];
    const sc = side(c), sn = side(n);
    if (sc >= 0) out.push(c);
    if ((sc >= 0) !== (sn >= 0)) out.push(lerp(c, n, sc / (sc - sn)));
  }
  return out;
}

/** Clips the segment ab to a convex polygon (positive area): [t0, t1] or null. */
export function clipSegConvex(a: P, b: P, poly: P[]): [number, number] | null {
  let t0 = 0, t1 = 1;
  const d = sub(b, a);
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
    const e = sub(p1, p0);
    // inside: cross(e, q - p0) >= 0
    const num = cross(e, sub(a, p0)), den = cross(e, d);
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** First crossing of two non-adjacent edges of a polygon: their indices, or null. */
export function firstCrossing(poly: P[]): [number, number, P] | null {
  const n = poly.length;
  if (n < 4) return null;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = poly[j], d = poly[(j + 1) % n];
      if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.z, d.z) < z0 || Math.min(c.z, d.z) > z1) continue;
      const x = segX(a, b, c, d);
      if (x && x.t > 1e-6 && x.t < 1 - 1e-6 && x.s > 1e-6 && x.s < 1 - 1e-6) return [i, j, lerp(a, b, x.t)];
    }
  }
  return null;
}

/**
 * Cuts small loops out of a polygon outline (two edges at most `span` points apart that
 * cross): the points between them are replaced by the crossing. `src` (one value per point)
 * is kept in step. Returns false when a crossing between distant edges remains.
 */
export function removeLoops(poly: P[], src: number[], span = 10): boolean {
  for (let guard = 0; guard < 50; guard++) {
    const x = firstCrossing(poly);
    if (!x) return true;
    const [i, j, q] = x;
    const n = poly.length;
    if (j - i <= span) {
      poly.splice(i + 1, j - i, q);
      src.splice(i + 1, j - i, src[i]);
    } else if (n - (j - i) <= span) {
      // the loop wraps round the start: keep i+1..j, replace the rest by the crossing
      const keep = poly.slice(i + 1, j + 1), ks = src.slice(i + 1, j + 1);
      poly.length = 0; src.length = 0;
      poly.push(q, ...keep); src.push(src[j] ?? -1, ...ks);
    } else return false;
  }
  return !firstCrossing(poly);
}

/** A polygon packed for fast repeated box tests. */
export interface PolyIndex { xs: Float64Array; zs: Float64Array; n: number; x0: number; z0: number; x1: number; z1: number }

export function polyIndex(poly: P[]): PolyIndex {
  const n = poly.length;
  const xs = new Float64Array(n), zs = new Float64Array(n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    xs[i] = poly[i].x; zs[i] = poly[i].z;
    if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i];
    if (zs[i] < z0) z0 = zs[i]; if (zs[i] > z1) z1 = zs[i];
  }
  return { xs, zs, n, x0, z0, x1, z1 };
}

const segHit = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean => {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return false;
  const wx = cx - ax, wz = cz - az;
  const t = (wx * sz - wz * sx) / den, u = (wx * rz - wz * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4;
};

function pipIdx(x: number, z: number, pi: PolyIndex): boolean {
  let inside = false;
  const { xs, zs, n } = pi;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if ((zs[i] > z) !== (zs[j] > z) && x < ((xs[j] - xs[i]) * (z - zs[i])) / (zs[j] - zs[i]) + xs[i]) inside = !inside;
  }
  return inside;
}

/** obbInPoly without allocations: no outline edge crosses the box, no vertex inside it, a corner inside. */
export function obbInPolyFast(b: OBB, pi: PolyIndex): boolean {
  const ux = b.ux * b.hw, uz = b.uz * b.hw, vx = -b.uz * b.hd, vz = b.ux * b.hd;
  const c0x = b.x - ux - vx, c0z = b.z - uz - vz, c1x = b.x + ux - vx, c1z = b.z + uz - vz;
  const c2x = b.x + ux + vx, c2z = b.z + uz + vz, c3x = b.x - ux + vx, c3z = b.z - uz + vz;
  const bx0 = Math.min(c0x, c1x, c2x, c3x), bx1 = Math.max(c0x, c1x, c2x, c3x);
  const bz0 = Math.min(c0z, c1z, c2z, c3z), bz1 = Math.max(c0z, c1z, c2z, c3z);
  if (bx0 < pi.x0 || bx1 > pi.x1 || bz0 < pi.z0 || bz1 > pi.z1) return false;
  const { xs, zs, n } = pi;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const ax = xs[i], az = zs[i], qx = xs[j], qz = zs[j];
    if (Math.max(ax, qx) < bx0 || Math.min(ax, qx) > bx1 || Math.max(az, qz) < bz0 || Math.min(az, qz) > bz1) continue;
    // vertex inside the box
    const dx = ax - b.x, dz = az - b.z;
    if (Math.abs(dx * b.ux + dz * b.uz) < b.hw - 0.01 && Math.abs(-dx * b.uz + dz * b.ux) < b.hd - 0.01) return false;
    if (segHit(ax, az, qx, qz, c0x, c0z, c1x, c1z) || segHit(ax, az, qx, qz, c1x, c1z, c2x, c2z)
      || segHit(ax, az, qx, qz, c2x, c2z, c3x, c3z) || segHit(ax, az, qx, qz, c3x, c3z, c0x, c0z)) return false;
  }
  return pipIdx(c0x, c0z, pi) && pipIdx(c2x, c2z, pi);
}

/** Radius of a box's bounding circle. */
export const obbRadius = (b: OBB): number => Math.hypot(b.hw, b.hd);
