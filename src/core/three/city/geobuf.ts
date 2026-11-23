// City generator: a growable triangle buffer with the city's vertex layout (position, normal,
// colour, uv in metres, kind vec4, optional far-LOD centre) and helpers for walls, flat
// polygons, boxes, oriented boxes, cylinders and prisms. Non-indexed, flat normals.
import * as THREE from 'three';
import { type P, type OBB, obbCorners } from './geom';

export type K4 = [number, number, number, number];
const ZERO4: K4 = [0, 0, 0, 0];

const colourCache = new Map<number, [number, number, number]>();
let tmpColour: THREE.Color | null = null;
/** sRGB hex → linear rgb (vertex colours are linear). */
export function lin(hex: number): [number, number, number] {
  let c = colourCache.get(hex);
  if (!c) {
    tmpColour ??= new THREE.Color();
    tmpColour.setHex(hex);
    c = [tmpColour.r, tmpColour.g, tmpColour.b];
    colourCache.set(hex, c);
  }
  return c;
}

class Grow {
  a: Float32Array;
  n = 0;
  constructor(size: number) { this.a = new Float32Array(size); }
  push3(x: number, y: number, z: number): void {
    if (this.n + 3 > this.a.length) this.grow();
    this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z;
  }
  push2(x: number, y: number): void {
    if (this.n + 2 > this.a.length) this.grow();
    this.a[this.n++] = x; this.a[this.n++] = y;
  }
  push4(x: number, y: number, z: number, w: number): void {
    if (this.n + 4 > this.a.length) this.grow();
    this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; this.a[this.n++] = w;
  }
  private grow(): void {
    const b = new Float32Array(this.a.length * 2);
    b.set(this.a);
    this.a = b;
  }
  slice(): Float32Array { return this.a.slice(0, this.n); }
}

export interface GeoArrays { position: Float32Array; normal: Float32Array; color: Float32Array; aUv: Float32Array; aK: Float32Array; aC?: Float32Array }

export class GeoBuf {
  private pos = new Grow(3 * 1024);
  private nor = new Grow(3 * 1024);
  private col = new Grow(3 * 1024);
  private uv = new Grow(2 * 1024);
  private k = new Grow(4 * 1024);
  private c: Grow | null;
  /** Far-LOD centre written with every vertex (when the buffer has one). */
  centre: P = { x: 0, z: 0 };
  /**
   * Terrain: with `lift` set, every vertex is raised by the ground height under it (roads,
   * sidewalks, kerbs drape over the land); with `anchor` set too, by that one height instead
   * (a building or a prop stands level).
   */
  lift: ((x: number, z: number) => number) | null = null;
  anchor: number | null = null;

  constructor(withCentre = false) { this.c = withCentre ? new Grow(2 * 1024) : null; }

  get vertices(): number { return this.pos.n / 3; }
  get triangles(): number { return this.pos.n / 9; }

  /** One triangle; the normal follows the winding (counter-clockwise seen from the front). */
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
    rgb: [number, number, number], k: K4 = ZERO4, uva?: [number, number], uvb?: [number, number], uvc?: [number, number]): void {
    if (this.anchor !== null) { ay += this.anchor; by += this.anchor; cy += this.anchor; }
    else if (this.lift) { ay += this.lift(ax, az); by += this.lift(bx, bz); cy += this.lift(cx, cz); }
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.pos.push3(ax, ay, az); this.pos.push3(bx, by, bz); this.pos.push3(cx, cy, cz);
    for (let i = 0; i < 3; i++) { this.nor.push3(nx, ny, nz); this.col.push3(rgb[0], rgb[1], rgb[2]); this.k.push4(k[0], k[1], k[2], k[3]); }
    this.uv.push2(uva?.[0] ?? 0, uva?.[1] ?? 0); this.uv.push2(uvb?.[0] ?? 0, uvb?.[1] ?? 0); this.uv.push2(uvc?.[0] ?? 0, uvc?.[1] ?? 0);
    if (this.c) for (let i = 0; i < 3; i++) this.c.push2(this.centre.x, this.centre.z);
  }

  /** Quad a b c d (counter-clockwise seen from the front). */
  quad(a: number[], b: number[], c: number[], d: number[], rgb: [number, number, number], k: K4 = ZERO4,
    uv?: [[number, number], [number, number], [number, number], [number, number]]): void {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], rgb, k, uv?.[0], uv?.[1], uv?.[2]);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], rgb, k, uv?.[0], uv?.[2], uv?.[3]);
  }

  /**
   * A vertical wall from a to b, y0 to y1, facing the N side of a→b (seen from above: the
   * right-hand side). uv: metres along (from u0) and height.
   */
  wall(a: P, b: P, y0: number, y1: number, rgb: [number, number, number], k: K4 = ZERO4, u0 = 0, v0 = y0): void {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const h = y1 - y0;
    this.quad([a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], rgb, k,
      [[u0, v0], [u0 + L, v0], [u0 + L, v0 + h], [u0, v0 + h]]);
  }

  /** A horizontal polygon at height y facing up (any orientation), triangulated. uv = world xz. */
  flat(poly: P[], y: number, rgb: [number, number, number], k: K4 = ZERO4, holes: P[][] = [], down = false): void {
    if (poly.length < 3) return;
    if (this.lift && this.anchor === null) {
      // draped: long edges get extra points and big holeless polygons are cut on a grid, so
      // no triangle strays far from the curved ground
      poly = densify(poly, 10);
      holes = holes.map((h) => densify(h, 10));
      if (!holes.length && span(poly) > 24) {
        for (const piece of gridPieces(poly, 16)) this.flat(piece, y, rgb, k, [], down);
        return;
      }
    }
    const contour = poly.map((q) => new THREE.Vector2(q.x, q.z));
    const hs = holes.map((h) => h.map((q) => new THREE.Vector2(q.x, q.z)));
    const all = [...poly, ...holes.flat()];
    const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    for (const [i, j, l] of tris) this.flatTri(all[i], all[j], all[l], y, rgb, k, down);
  }

  /** One horizontal triangle facing up (or down). */
  flatTri(a: P, b: P, c: P, y: number, rgb: [number, number, number], k: K4 = ZERO4, down = false): void {
    // facing up needs a clockwise turn in (x, z)
    const cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const flip = (cr > 0) !== down;
    if (flip) this.tri(a.x, y, a.z, c.x, y, c.z, b.x, y, b.z, rgb, k, [a.x, a.z], [c.x, c.z], [b.x, b.z]);
    else this.tri(a.x, y, a.z, b.x, y, b.z, c.x, y, c.z, rgb, k, [a.x, a.z], [b.x, b.z], [c.x, c.z]);
  }

  /** A box on an oriented footprint: four walls outwards and a top (no bottom unless asked). */
  obb(o: OBB, y0: number, y1: number, rgb: [number, number, number], k: K4 = ZERO4, top: K4 | null = null, topRgb?: [number, number, number], bottom = false): void {
    const c = obbCorners(o);
    let u = 0;
    for (let i = 0; i < 4; i++) {
      const a = c[(i + 1) % 4], b = c[i];
      this.wall(a, b, y0, y1, rgb, k, u);
      u += Math.hypot(b.x - a.x, b.z - a.z);
    }
    this.flatTri(c[0], c[1], c[2], y1, topRgb ?? rgb, top ?? k);
    this.flatTri(c[0], c[2], c[3], y1, topRgb ?? rgb, top ?? k);
    if (bottom) { this.flatTri(c[0], c[1], c[2], y0, rgb, k, true); this.flatTri(c[0], c[2], c[3], y0, rgb, k, true); }
  }

  /** Axis-free small box: centre, half sizes along heading h (local x = across, z = forward). */
  boxH(x: number, y0: number, z: number, hx: number, hy: number, hz: number, h: number, rgb: [number, number, number], k: K4 = ZERO4, bottom = false): void {
    const s = Math.sin(h), c = Math.cos(h);
    // local x → (cos h, -sin h), local z → (sin h, cos h): ux = cos h, uz = -sin h
    this.obb({ x, z, hw: hx, hd: hz, ux: c, uz: -s }, y0, y0 + 2 * hy, rgb, k, null, undefined, bottom);
  }

  /** A vertical cylinder (n sides) with a top cap. */
  cylinder(x: number, z: number, r0: number, r1: number, y0: number, y1: number, n: number, rgb: [number, number, number], k: K4 = ZERO4, cap = true, capRgb?: [number, number, number], capK?: K4): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], p1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
      const q0 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1], q1 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
      this.quad(p0, q0, q1, p1, rgb, k, [[i, y0], [i, y1], [i + 1, y1], [i + 1, y0]]);
      if (cap && r1 > 0.001) this.tri(x, y1, z, q1[0], y1, q1[2], q0[0], y1, q0[2], capRgb ?? rgb, capK ?? k);
    }
  }

  /** Appends another buffer. */
  append(o: GeoBuf): void {
    const a = o.arrays();
    const n = a.position.length / 3;
    for (let i = 0; i < n; i++) {
      this.pos.push3(a.position[i * 3], a.position[i * 3 + 1], a.position[i * 3 + 2]);
      this.nor.push3(a.normal[i * 3], a.normal[i * 3 + 1], a.normal[i * 3 + 2]);
      this.col.push3(a.color[i * 3], a.color[i * 3 + 1], a.color[i * 3 + 2]);
      this.uv.push2(a.aUv[i * 2], a.aUv[i * 2 + 1]);
      this.k.push4(a.aK[i * 4], a.aK[i * 4 + 1], a.aK[i * 4 + 2], a.aK[i * 4 + 3]);
      if (this.c) this.c.push2(a.aC?.[i * 2] ?? 0, a.aC?.[i * 2 + 1] ?? 0);
    }
  }

  arrays(): GeoArrays {
    const out: GeoArrays = { position: this.pos.slice(), normal: this.nor.slice(), color: this.col.slice(), aUv: this.uv.slice(), aK: this.k.slice() };
    if (this.c) out.aC = this.c.slice();
    return out;
  }
}

/** Extra points on edges longer than `step`. */
export function densify(poly: P[], step: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push(a);
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.floor(L / step);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
  }
  return out;
}

function span(poly: P[]): number {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of poly) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z; }
  return Math.max(x1 - x0, z1 - z0);
}

/** A polygon cut into the cells of a grid (Sutherland–Hodgman against each cell). */
export function gridPieces(poly: P[], cell: number): P[][] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of poly) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z; }
  const out: P[][] = [];
  const clip = (pl: P[], inside: (q: P) => boolean, cut: (a: P, b: P) => P): P[] => {
    const r: P[] = [];
    for (let i = 0; i < pl.length; i++) {
      const a = pl[i], b = pl[(i + 1) % pl.length];
      const ia = inside(a), ib = inside(b);
      if (ia) r.push(a);
      if (ia !== ib) r.push(cut(a, b));
    }
    return r;
  };
  const cx = (x: number) => (a: P, b: P): P => { const t = (x - a.x) / (b.x - a.x); return { x, z: a.z + (b.z - a.z) * t }; };
  const cz = (z: number) => (a: P, b: P): P => { const t = (z - a.z) / (b.z - a.z); return { x: a.x + (b.x - a.x) * t, z }; };
  for (let gx = Math.floor(x0 / cell) * cell; gx < x1; gx += cell) {
    const col = clip(clip(poly, (q) => q.x >= gx, cx(gx)), (q) => q.x <= gx + cell, cx(gx + cell));
    if (col.length < 3) continue;
    for (let gz = Math.floor(z0 / cell) * cell; gz < z1; gz += cell) {
      const piece = clip(clip(col, (q) => q.z >= gz, cz(gz)), (q) => q.z <= gz + cell, cz(gz + cell));
      if (piece.length >= 3 && Math.abs(area(piece)) > 0.01) out.push(piece);
    }
  }
  return out;
}

function area(poly: P[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.z - q.x * p.z; }
  return a / 2;
}

/** A BufferGeometry from arrays (the arrays are used as they are, not copied). */
export function toGeometry(a: GeoArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  g.setAttribute('aUv', new THREE.BufferAttribute(a.aUv, 2));
  g.setAttribute('aK', new THREE.BufferAttribute(a.aK, 4));
  if (a.aC) g.setAttribute('aC', new THREE.BufferAttribute(a.aC, 2));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export const arraysBytes = (a: GeoArrays): number =>
  a.position.byteLength + a.normal.byteLength + a.color.byteLength + a.aUv.byteLength + a.aK.byteLength + (a.aC?.byteLength ?? 0);
