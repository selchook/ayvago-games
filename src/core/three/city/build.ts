// City generator: turns a plan into geometry. A CityBuilder indexes the plan by chunk once
// (road strips, junctions, block surfaces and kerbs, lots, buildings, props) and then builds
// any chunk on demand: one merged buffer for everything static in it plus instance records
// for the repeated props (trees, lamps, traffic lights, parked cars, containers) and the lamp
// halos. It also makes the far LOD (every building as an inset box, in big tiles), the ground
// map and the night light map. Pure geometry: no scene, no GPU objects except textures it is
// asked for.
import * as THREE from 'three';
import { type P, type OBB, obbCorners, obbPoint, offsetPolyline, insetPoly, signedArea, dist, lerp, clamp, polyIndex, pointInPoly } from './geom';
import { hash01 } from './rng';
import { GeoBuf, lin, densify, gridPieces, type K4, type GeoArrays } from './geobuf';
import { K, FACADE } from './materials';
import { minimapRaster, MAP } from './minimap';
import type { CityPlan, Building, Part, Prop, Block, Wall, Deck } from './types';
import { terrainOf } from './layout';
import type { Terrain } from './terrain';
import { kitId, type KitPiece } from './kit';
import { STYLES } from './styles';
import { LANE_W } from './roads';

/** Props drawn as InstancedMesh (all others are merged into their chunk). */
export const INSTANCED = ['tree', 'palm', 'conifer', 'lamp', 'signal', 'car', 'container'] as const;
/** Props drawn by the building kit's pieces (when a kit is loaded). */
const KIT_PROPS: Partial<Record<string, KitPiece>> = { bollard: 'bollard', drain: 'drain', manhole: 'manhole', kplanter: 'planter' };
export type InstKind = (typeof INSTANCED)[number];
const isInst = (k: string): k is InstKind => (INSTANCED as readonly string[]).includes(k);
/** Props that stand on the water or the beach (their heights are absolute). */
const WATER_PROPS = new Set(['boat', 'sailboat', 'umbrella', 'lounger', 'hut', 'lifeguard']);
/** Props big enough to keep in far chunks. */
const BIG_PROPS = new Set(['crane', 'fountain', 'pond', 'pool', 'statue', 'busstop', 'kiosk', 'hut', 'boat', 'sailboat', 'lifeguard']);

export interface ChunkData {
  key: number; cx: number; cz: number;
  geo: GeoArrays;
  /** Per instanced kind: records of x, y, z, yaw, scale, r, g, b. */
  inst: Partial<Record<InstKind, number[]>>;
  /** Lamp heads: x, y, z. */
  halos: number[];
  /** Kit props (bollards, drains, manholes, planters): piece, x, y, z, yaw. */
  kitProps: number[];
  /** Detail level it was built at (0 full, 1 without small props). */
  lod: number;
  /** The first triangles are the shadow casters (buildings, decks, props); the ground follows. */
  casterTris: number;
  tris: number;
  ms: number;
}

const COL = {
  asphalt: 0x3e4146, kerb: 0xbdb9b0, walk: 0xb3aea4, quay: 0x8f8a80, grass: 0x6f9a4a, paving: 0xb8b2a6, concrete: 0xa9a7a0,
  gravel: 0x9b9384, sand: 0xd9c99a, dirt: 0x8a7a5a, roofFlat: 0x8b8984, roofDark: 0x5d5f63, trim: 0xd8d4cc, metal: 0x6b6f75,
  railing: 0x5a5e63, hedge: 0x3f6f32, fence: 0xe8e4da, pole: 0x4a4e55, trunk: 0x6b4a32, leaves: 0x4f8a3a, glassDark: 0x1d2630,
};

const GROUND_K: Record<string, [number, number]> = {
  grass: [COL.grass, K.grass], paving: [COL.paving, K.walk], gravel: [COL.gravel, K.gravel], asphalt: [COL.asphalt, K.asphalt],
  concrete: [COL.concrete, K.concrete], sand: [COL.sand, K.sand], dirt: [COL.dirt, K.grass],
};

/** Surface types of the indexed block triangles. */
const SURF: [number, number][] = [
  [COL.walk, K.walk], // 0 sidewalk
  [COL.grass, K.grass], [COL.paving, K.walk], [COL.gravel, K.gravel], [COL.asphalt, K.asphalt], [COL.concrete, K.concrete], [COL.sand, K.sand], [COL.dirt, K.grass],
  [COL.quay, K.walk], // 8 quay
];
const SURF_OF: Record<string, number> = { grass: 1, paving: 2, gravel: 3, asphalt: 4, concrete: 5, sand: 6, dirt: 7 };

const CLS_IDX = { boulevard: 0, avenue: 1, street: 2, alley: 3 };
const STYLE_IDX: Record<string, number> = { punched: FACADE.punched, glass: FACADE.glass, ribbon: FACADE.ribbon, brick: FACADE.brick, shed: FACADE.shed, house: FACADE.house, blank: FACADE.blank };
const BAY: Record<string, number> = { punched: 3.1, glass: 1.7, ribbon: 3.4, brick: 2.5, shed: 4.5, house: 3.2, blank: 4 };

interface Strip { l: P[]; r: P[]; s: number[] }

interface ChunkIndex {
  pieces: [number, number][];
  nodes: number[];
  surf: number[];
  walls: number[];
  rails: number[];
  lots: number[];
  buildings: number[];
  props: number[];
  fences: number[];
  decks: number[];
}

export class CityBuilder {
  readonly size: number;
  private strips: Strip[] = [];
  private index = new Map<number, ChunkIndex>();
  private keys: number[] = [];
  /** Buildings drawn by something else (hybrid landmarks). */
  skip = new Set<number>();
  /** Kit buildings are drawn by the kit (CityView's kit layer): chunks hold their shadow proxy. */
  kit = false;
  readonly terrain: Terrain;
  /** Ground height (the terrain), the same function the plan's queries use. */
  readonly h: (x: number, z: number) => number;

  constructor(readonly plan: CityPlan, readonly chunk = 128) {
    this.size = plan.size;
    this.terrain = terrainOf(plan);
    this.h = this.terrain.max > 0 ? this.terrain.h : () => 0;
    this.makeIndex();
  }

  /** The height a building's parts stand on (its ground floor sits 0.15 lower, under the sidewalk). */
  base(b: Building): number { return b.y - 0.15; }

  key(cx: number, cz: number): number { return (cx + 512) * 1024 + (cz + 512); }
  /** Every chunk that has something in it. */
  chunkKeys(): number[] { return this.keys; }
  has(key: number): boolean { return this.index.has(key); }

  private slot(x: number, z: number): ChunkIndex {
    const k = this.key(Math.floor(x / this.chunk), Math.floor(z / this.chunk));
    let c = this.index.get(k);
    if (!c) {
      c = { pieces: [], nodes: [], surf: [], walls: [], rails: [], lots: [], buildings: [], props: [], fences: [], decks: [] };
      this.index.set(k, c);
      this.keys.push(k);
    }
    return c;
  }

  // ---------------------------------------------------------------- indexing

  private makeIndex(): void {
    const plan = this.plan;
    // road strips, cut in pieces of at most 16 m
    plan.edges.forEach((E, ei) => {
      const s0 = E.trimA, s1 = E.len - E.trimB;
      const l0 = offsetPolyline(E.pts, E.half, s0, s1), r0 = offsetPolyline(E.pts, -E.half, s0, s1), c0 = offsetPolyline(E.pts, 0, s0, s1);
      const l: P[] = [], r: P[] = [], s: number[] = [];
      let acc = s0;
      for (let i = 0; i < c0.length; i++) {
        if (i > 0) {
          const seg = dist(c0[i - 1], c0[i]);
          const n = Math.max(1, Math.ceil(seg / 16));
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            l.push(lerp(l0[i - 1], l0[i], t)); r.push(lerp(r0[i - 1], r0[i], t)); s.push(acc + seg * t);
          }
          acc += seg;
        } else { l.push(l0[0]); r.push(r0[0]); s.push(s0); }
      }
      this.strips.push({ l, r, s });
      for (let i = 0; i < l.length - 1; i++) {
        const m = lerp(lerp(l[i], r[i], 0.5), lerp(l[i + 1], r[i + 1], 0.5), 0.5);
        this.slot(m.x, m.z).pieces.push([ei, i]);
      }
    });
    plan.nodes.forEach((n, i) => { if (n.poly.length || n.island) this.slot(n.x, n.z).nodes.push(i); });
    // block surfaces: triangles with a surface type, assigned by centroid
    const tri = (a: P, b: P, c: P, y: number, surf: number) => {
      const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
      this.slot(cx, cz).surf.push(a.x, a.z, b.x, b.z, c.x, c.z, y, surf);
    };
    const draped = this.terrain.max > 0;
    const tris = (poly: P[], holes: P[][], y: number, surf: number) => {
      if (draped) {
        // over the terrain: no long triangles (extra points on the edges, big areas cut on a grid)
        poly = densify(poly, 10);
        holes = holes.map((hh) => densify(hh, 10));
        if (!holes.length) {
          for (const piece of gridPieces(poly, 16)) {
            const c2 = piece.map((q) => new THREE.Vector2(q.x, q.z));
            for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(c2, [])) tri(piece[i], piece[j], piece[k], y, surf);
          }
          return;
        }
      }
      const contour = poly.map((q) => new THREE.Vector2(q.x, q.z));
      const hs = holes.map((h) => h.map((q) => new THREE.Vector2(q.x, q.z)));
      const all = [...poly, ...holes.flat()];
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, hs)) tri(all[i], all[j], all[k], y, surf);
    };
    // wall records: ax, az, bx, bz, y0, y1, type (0 kerb, 1 quay, 2 bridge side, 3 seawall)
    const wall = (a: P, b: P, y0: number, y1: number, type: number) => {
      const m = lerp(a, b, 0.5);
      this.slot(m.x, m.z).walls.push(a.x, a.z, b.x, b.z, y0, y1, type);
    };
    const rail = (a: P, b: P, type: number) => {
      const m = lerp(a, b, 0.5);
      this.slot(m.x, m.z).rails.push(a.x, a.z, b.x, b.z, type);
    };
    for (const b of plan.blocks) this.indexBlock(b, tris, wall, rail);
    plan.lots.forEach((l) => this.slot(l.obb.x, l.obb.z).lots.push(l.id));
    plan.buildings.forEach((b) => this.slot(b.obb.x, b.obb.z).buildings.push(b.id));
    plan.props.forEach((q, i) => this.slot(q.x, q.z).props.push(i));
    plan.walls.forEach((w, i) => { const m = lerp(w.a, w.b, 0.5); this.slot(m.x, m.z).fences.push(i); });
    // decks: a record per 16 m piece (the chunk of its middle draws it)
    (plan.decks ?? []).forEach((d, i) => {
      const L = dist(d.a, d.b), n = Math.max(1, Math.ceil(L / 16));
      for (let k = 0; k < n; k++) { const m = lerp(d.a, d.b, (k + 0.5) / n); this.slot(m.x, m.z).decks.push(i * 1000 + k); }
      const end = lerp(d.a, d.b, 1);
      this.slot(end.x, end.z).decks.push(i * 1000 + 999);
    });
    if (plan.lighthouse) this.slot(plan.lighthouse.x, plan.lighthouse.z).decks.push(-1);
  }

  /** Is q on the sea wall where a deck starts (its railing leaves a gap)? */
  private gap(q: P): boolean {
    for (const d of this.plan.decks ?? []) if (dist(q, d.a) < Math.max(d.half, 1) + 0.8) return true;
    return false;
  }

  private indexBlock(b: Block, tris: (poly: P[], holes: P[][], y: number, surf: number) => void,
    wall: (a: P, b: P, y0: number, y1: number, type: number) => void, rail: (a: P, b: P, type: number) => void): void {
    const Y = 0.15;
    const plan = this.plan;
    if (b.kind === 'void') return;
    if (b.kind === 'outer') {
      // the land's edge: a sidewalk outside the perimeter road and a wall down to the water or the fields
      const land = [...b.curb].reverse();
      const out = offsetOut(land, 3.5);
      tris(out, [land], Y, 8);
      for (let i = 0; i < land.length; i++) {
        const a = land[i], c = land[(i + 1) % land.length];
        wall(a, c, 0, Y, 0);
        const oa = out[i], oc = out[(i + 1) % out.length];
        wall(oc, oa, -2.6, Y, 3);
        // the railing along the sea wall, open where a pier, jetty or breakwater starts
        const L = dist(oa, oc), n = Math.max(1, Math.ceil(L / 1.5));
        let run: P | null = null;
        for (let k = 0; k <= n; k++) {
          const q = lerp(oc, oa, k / n);
          const open = this.gap(q);
          if (!open && !run) run = q;
          if ((open || k === n) && run) { const end = open ? lerp(oc, oa, Math.max(0, k - 1) / n) : q; if (dist(run, end) > 0.3) rail(run, end, 1); run = null; }
        }
      }
      return;
    }
    const n = b.curb.length;
    if (b.inner && b.walk > 0) tris(b.curb, [b.inner], Y, b.kind === 'water' ? 8 : 0);
    else tris(b.curb, [], Y, b.kind === 'water' ? 8 : SURF_OF[b.ground] ?? 2);
    for (let i = 0; i < n; i++) wall(b.curb[(i + 1) % n], b.curb[i], 0, Y, 0);
    if (!b.inner) return;
    if (b.kind === 'water') {
      const m = b.inner.length;
      for (let i = 0; i < m; i++) {
        const a = b.inner[i], c = b.inner[(i + 1) % m];
        const e = b.innerEdge[i];
        const bridge = e >= 0 && plan.edges[e].bridge;
        wall(a, c, bridge ? -1.25 : -2.6, Y, bridge ? 2 : 1);
        rail(a, c, bridge ? 0 : 1);
      }
      return;
    }
    tris(b.inner, [], Y, SURF_OF[b.ground] ?? 2);
  }

  // ---------------------------------------------------------------- chunks

  /**
   * Builds a chunk. Level 0 is everything; level 1 (far chunks, aerial views) leaves out the
   * small props, fences and railings and the kit buildings' dressing.
   */
  build(key: number, opts: { props: boolean; lod?: number } = { props: true }): ChunkData {
    const t0 = performance.now();
    const lod = opts.lod ?? 0;
    const cx = Math.floor(key / 1024) - 512, cz = (key % 1024) - 512;
    const idx = this.index.get(key);
    // what casts shadows first (buildings, decks, props), the ground after it: the shadow pass
    // draws only the first part
    const buf = new GeoBuf(), gnd = new GeoBuf();
    buf.lift = gnd.lift = this.terrain.max > 0 ? this.h : null;
    const inst: Partial<Record<InstKind, number[]>> = {};
    const halos: number[] = [];
    const kitProps: number[] = [];
    if (idx) {
      for (const [e, i] of idx.pieces) this.roadPiece(gnd, e, i);
      for (const n of idx.nodes) this.junction(gnd, n);
      this.surfaces(gnd, idx, lod);
      for (const id of idx.lots) this.lot(gnd, id);
      for (const id of idx.buildings) if (!this.skip.has(id)) this.building(buf, this.plan.buildings[id], lod);
      for (const id of idx.decks) this.deck(buf, id, lod);
      if (opts.props) {
        if (lod === 0) for (const id of idx.fences) this.fence(buf, this.plan.walls[id]);
        for (const id of idx.props) {
          const q = this.plan.props[id];
          const g = this.propBase(q);
          if (isInst(q.kind)) {
            const list = inst[q.kind] ?? (inst[q.kind] = []);
            this.instRecord(list, q, g);
            if (q.kind === 'lamp') {
              const s = q.s;
              halos.push(q.x + Math.sin(q.h) * 1.7 * s, q.y + g + 0.15 + 6.9 * s, q.z + Math.cos(q.h) * 1.7 * s);
            }
          } else if (KIT_PROPS[q.kind] && this.kit) {
            if (lod === 0) kitProps.push(kitId(KIT_PROPS[q.kind]!), q.x, g + (q.kind === 'drain' || q.kind === 'manhole' ? 0.005 : 0.15), q.z, q.h);
          } else if (lod === 0 || BIG_PROPS.has(q.kind)) {
            buf.anchor = g;
            this.prop(buf, q);
            buf.anchor = null;
          }
        }
      }
    }
    const casterTris = buf.triangles;
    buf.append(gnd);
    const geo = buf.arrays();
    return { key, cx, cz, geo, inst, halos, kitProps, lod, tris: buf.triangles, casterTris, ms: performance.now() - t0 };
  }

  /** The ground a prop stands on: the terrain, except on the water and the sand (sea level). */
  propBase(q: Prop): number {
    if (WATER_PROPS.has(q.kind)) return 0;
    return this.terrain.max > 0 ? this.h(q.x, q.z) : 0;
  }

  private roadPiece(buf: GeoBuf, e: number, i: number): void {
    const E = this.plan.edges[e];
    const st = this.strips[e];
    const l0 = st.l[i], l1 = st.l[i + 1], r0 = st.r[i], r1 = st.r[i + 1];
    const a = this.plan.nodes[E.a], b = this.plan.nodes[E.b];
    const code = E.lanes + 4 * CLS_IDX[E.cls] + 16 * +(a.crosswalks) + 32 * +(b.crosswalks) + 64 * +(a.kind === 'junction' && (a.signal || a.crosswalks))
      + 128 * +(b.kind === 'junction' && (b.signal || b.crosswalks)) + 256 * +E.parking;
    const k: K4 = [K.road, E.trimA, E.len - E.trimB, code];
    const rgb = lin(COL.asphalt);
    const s0 = st.s[i], s1 = st.s[i + 1];
    // uv: x across (N side positive), y along
    buf.quad([r0.x, 0, r0.z], [l0.x, 0, l0.z], [l1.x, 0, l1.z], [r1.x, 0, r1.z], rgb, k, [[-E.half, s0], [E.half, s0], [E.half, s1], [-E.half, s1]]);
    if (E.median > 0 && s1 - s0 > 0.1) {
      const lo = Math.max(s0, E.trimA + 3), hi = Math.min(s1, E.len - E.trimB - 3);
      if (hi - lo > 0.5) {
        const t0 = (lo - s0) / (s1 - s0), t1 = (hi - s0) / (s1 - s0);
        const c0 = lerp(lerp(l0, r0, 0.5), lerp(l1, r1, 0.5), t0), c1 = lerp(lerp(l0, r0, 0.5), lerp(l1, r1, 0.5), t1);
        const nx = (l0.x - r0.x) / (2 * E.half), nz = (l0.z - r0.z) / (2 * E.half);
        const h = E.median / 2;
        const ml0 = { x: c0.x + nx * h, z: c0.z + nz * h }, ml1 = { x: c1.x + nx * h, z: c1.z + nz * h };
        const mr0 = { x: c0.x - nx * h, z: c0.z - nz * h }, mr1 = { x: c1.x - nx * h, z: c1.z - nz * h };
        const g = lin(COL.grass), kerb = lin(COL.kerb);
        buf.flatTri(mr0, mr1, ml1, 0.16, g, [K.grass, 0, 0, 0]);
        buf.flatTri(mr0, ml1, ml0, 0.16, g, [K.grass, 0, 0, 0]);
        buf.wall(ml0, ml1, 0, 0.16, kerb);
        buf.wall(mr1, mr0, 0, 0.16, kerb);
        if (Math.abs(lo - (E.trimA + 3)) < 0.01) buf.wall(mr0, ml0, 0, 0.16, kerb);
        if (Math.abs(hi - (E.len - E.trimB - 3)) < 0.01) buf.wall(ml1, mr1, 0, 0.16, kerb);
      }
    }
    if (E.bridge) {
      const side = lin(0x8c8a84), under = lin(0x6c6a66);
      buf.wall(l0, l1, -1.2, 0, side, [K.concrete, 0, 0, 0]);
      buf.wall(r1, r0, -1.2, 0, side, [K.concrete, 0, 0, 0]);
      buf.flatTri(r0, r1, l1, -1.2, under, [K.concrete, 0, 0, 0], true);
      buf.flatTri(r0, l1, l0, -1.2, under, [K.concrete, 0, 0, 0], true);
      // a pier every few pieces, away from the banks
      const mid = (s0 + s1) / 2;
      if (i % 3 === 1 && mid > E.trimA + 15 && mid < E.len - E.trimB - 15) {
        const c = lerp(lerp(l0, r0, 0.5), lerp(l1, r1, 0.5), 0.5);
        const ux = (l0.x - r0.x) / (2 * E.half), uz = (l0.z - r0.z) / (2 * E.half);
        buf.obb({ x: c.x, z: c.z, hw: E.half * 0.8, hd: 1.1, ux, uz }, -6, -1.2, under, [K.concrete, 0, 0, 0]);
      }
    }
  }

  private junction(buf: GeoBuf, id: number): void {
    const n = this.plan.nodes[id];
    const rgb = lin(COL.asphalt);
    if (n.poly.length >= 3) buf.flat(n.poly, 0, rgb, [K.asphalt, 0, 0, 0]);
    if (n.island) {
      // the roundabout's island: kerb, grass, a ring of shrubs and a monument
      const r = n.island, pts: P[] = [];
      for (let i = 0; i < 24; i++) pts.push({ x: n.x + Math.cos((i / 24) * Math.PI * 2) * r, z: n.z + Math.sin((i / 24) * Math.PI * 2) * r });
      buf.flat(pts, 0.2, lin(COL.grass), [K.grass, 0, 0, 0]);
      for (let i = 0; i < 24; i++) buf.wall(pts[(i + 1) % 24], pts[i], 0, 0.2, lin(COL.kerb));
      buf.cylinder(n.x, n.z, 2.2, 2.2, 0.2, 1.2, 8, lin(0xa8a296));
      buf.cylinder(n.x, n.z, 0.7, 0.35, 1.2, 9, 6, lin(0xc9c3b6));
    }
  }

  private surfaces(buf: GeoBuf, idx: ChunkIndex, lod = 0): void {
    const s = idx.surf;
    for (let i = 0; i < s.length; i += 8) {
      const [col, kind] = SURF[s[i + 7]];
      buf.flatTri({ x: s[i], z: s[i + 1] }, { x: s[i + 2], z: s[i + 3] }, { x: s[i + 4], z: s[i + 5] }, s[i + 6], lin(col), [kind, 0, 0, 0]);
    }
    const w = idx.walls;
    const wallCol = [lin(COL.kerb), lin(0x7d786e), lin(0x8c8a84), lin(0x7d786e)];
    for (let i = 0; i < w.length; i += 7) {
      buf.wall({ x: w[i], z: w[i + 1] }, { x: w[i + 2], z: w[i + 3] }, w[i + 4], w[i + 5], wallCol[w[i + 6]], [w[i + 6] === 0 ? K.plain : K.concrete, 0, 0, 0]);
      if (w[i + 6] === 2) {
        // the bridge sidewalk's underside
        const a = { x: w[i], z: w[i + 1] }, b = { x: w[i + 2], z: w[i + 3] };
        void a; void b;
      }
    }
    const r = idx.rails;
    const rc = lin(COL.railing);
    if (lod === 0) for (let i = 0; i < r.length; i += 5) {
      const a = { x: r[i], z: r[i + 1] }, b = { x: r[i + 2], z: r[i + 3] };
      railing(buf, a, b, 0.15, 1.05, rc, r[i + 4] === 0 ? 2.2 : 3);
    }
  }

  private lot(buf: GeoBuf, id: number): void {
    const l = this.plan.lots[id];
    const o = l.obb;
    const y0 = 0.15, y1 = 0.2;
    if (l.use === 'parking') {
      const b = l.building >= 0 ? this.plan.buildings[l.building] : null;
      // the asphalt in front of the shop (or the whole lot)
      const back = b ? clamp(localV(o, b.obb) - b.obb.hd - 0.5, 4, o.hd * 2) : o.hd * 2;
      const pk = sub2(o, -o.hw + 0.4, o.hw - 0.4, -o.hd + 0.4, -o.hd + back);
      topWithUv(buf, pk, y0, y1, lin(COL.asphalt), K.parking);
    } else if (l.use === 'containers') {
      buf.obb(shrinkObb(o, 0.4), y0, y1, lin(COL.gravel), [K.gravel, 0, 0, 0]);
    } else if (l.use === 'gas') {
      buf.obb(shrinkObb(o, 0.4), y0, y1, lin(COL.concrete), [K.concrete, 0, 0, 0]);
    } else if (l.building >= 0) {
      const b = this.plan.buildings[l.building];
      if (b.type === 'house') {
        const g = b.parts.find((q) => q.kind === 'garage');
        if (g) {
          const gl = localU(o, g.obb);
          const front = localV(o, g.obb) - g.obb.hd;
          const dw = sub2(o, gl - 1.6, gl + 1.6, -o.hd + 0.3, front);
          if (dw.hd > 0.5) buf.obb(dw, y0, 0.19, lin(COL.concrete), [K.concrete, 0, 0, 0]);
        }
        // a path to the door
        const dv = localV(o, b.obb) - b.obb.hd;
        const du = localU(o, { ...b.obb, x: b.door.x, z: b.door.z });
        const path = sub2(o, du - 0.6, du + 0.6, -o.hd + 0.3, dv);
        if (path.hd > 0.5) buf.obb(path, y0, 0.18, lin(COL.paving), [K.walk, 0, 0, 0]);
      } else if (b.district === 'industrial' || b.district === 'docks' || b.type === 'warehouse' || b.type === 'factory') {
        // a concrete apron in front of the loading doors
        const front = localV(o, b.obb) - b.obb.hd;
        const ap = sub2(o, -o.hw + 0.5, o.hw - 0.5, -o.hd + 0.4, front);
        if (ap.hd > 0.5) buf.obb(ap, y0, y1, lin(COL.concrete), [K.concrete, 0, 0, 0]);
      }
    }
  }

  // ---------------------------------------------------------------- buildings

  building(buf: GeoBuf, b: Building, lod = 0): void {
    const base = this.base(b);
    const lifted = buf.lift;
    buf.anchor = base;
    // a plinth down to the lowest corner where the ground falls away
    if (lifted) {
      for (const q of b.parts) {
        if (q.y0 > 0.01 || (q.kind !== 'mass' && q.kind !== 'garage')) continue;
        let low = base;
        for (const c of obbCorners(q.obb)) low = Math.min(low, lifted(c.x, c.z));
        if (base - low > 0.04) buf.obb(shrinkObb(q.obb, -0.06), low - base - 0.4, 0.12, lin(tint(COL.kerb, 0.85)), [K.concrete, 0, 0, 0], null);
      }
    }
    if (this.kit && b.kit) {
      // drawn by the kit: a shadow caster for the sun (never seen) and the dressing
      const q = b.parts[0];
      buf.obb(shrinkObb(q.obb, 0.3), 0, q.y1 + 0.9, lin(0x808080), [K.shadow, 0, 0, 0]);
      if (lod === 0) for (const part of b.parts) if (part.kind !== 'mass') this.part(buf, b, part);
      buf.anchor = null;
      return;
    }
    for (const part of b.parts) this.part(buf, b, part);
    // a door where there is no shopfront
    const main = b.parts[0];
    if (!main.shop && b.type !== 'gas') {
      const o = main.obb;
      const du = localU(o, { ...o, x: b.door.x, z: b.door.z });
      const d = sub2(o, du - 0.7, du + 0.7, -o.hd - 0.12, -o.hd + 0.02);
      buf.obb(d, main.y0, main.y0 + 2.3, lin(0x3a2c22), [K.plain, 0, 0, 0]);
      if (b.type === 'house' || b.type === 'rowhouse') buf.obb(sub2(o, du - 1.2, du + 1.2, -o.hd - 1.2, -o.hd), 0.15, 0.35, lin(0xb0aaa0));
    }
    buf.anchor = null;
  }

  private part(buf: GeoBuf, b: Building, q: Part): void {
    const o = q.obb;
    const rgb = lin(q.color);
    switch (q.kind) {
      case 'mass': case 'garage': {
        const style = q.facade ?? 'punched';
        const lit = Math.round(clamp(b.lit, 0, 0.9) * 10);
        const code = STYLE_IDX[style] + 16 * lit + b.seed * 0.999;
        const c = obbCorners(o);
        for (let i = 0; i < 4; i++) {
          const a = c[(i + 1) % 4], d = c[i];
          const L = dist(a, d);
          const bay = L / Math.max(1, Math.round(L / BAY[style]));
          const shop = q.shop && i === 0 ? 8 : 0;
          const roofless = q.roof === 'gable' || q.roof === 'hip';
          buf.wall(a, d, q.y0, q.y1, rgb, [K.facade, b.floorH, bay, code + shop], bay * 37 * i, q.y0 + (roofless ? 0 : 0));
        }
        this.roof(buf, b, q);
        if (q.kind === 'garage') {
          // its door, on the street side
          buf.obb(sub2(o, -o.hw * 0.8, o.hw * 0.8, -o.hd - 0.08, -o.hd + 0.02), q.y0, q.y0 + 2.3, lin(q.color2 ?? 0xe8e8e4), [K.metal, 0, 0, 0]);
        }
        break;
      }
      case 'roofbox':
        buf.obb(o, q.y0, q.y1, rgb, [K.metal, 0, 0, 0], [K.plain, 0, 0, 0]);
        break;
      case 'tank': {
        const c = { x: o.x, z: o.z };
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const lp = obbPoint(o, u * o.hw * 0.6, v * o.hd * 0.6);
          buf.boxH(lp.x, q.y0, lp.z, 0.09, 0.9, 0.09, 0, lin(0x333333));
        }
        buf.cylinder(c.x, c.z, o.hw, o.hw, q.y0 + 1.8, q.y1 - 1, 8, rgb);
        buf.cylinder(c.x, c.z, o.hw * 1.05, 0.05, q.y1 - 1, q.y1, 8, lin(0x4a3c30));
        break;
      }
      case 'antenna':
        buf.obb(o, q.y0, q.y1, rgb, [K.metal, 0, 0, 0]);
        buf.boxH(o.x, q.y1, o.z, 0.3, 0.3, 0.3, 0, lin(0xff3030), [K.glow, 0.6, 2.5, 0]);
        break;
      case 'spire': {
        const c = obbCorners(o);
        const top = [o.x, q.y1, o.z];
        for (let i = 0; i < 4; i++) {
          const a = c[(i + 1) % 4], d = c[i];
          buf.tri(a.x, q.y0, a.z, d.x, q.y0, d.z, top[0], top[1], top[2], rgb, [K.metal, 0, 0, 0]);
        }
        buf.boxH(o.x, q.y1 - 0.2, o.z, 0.35, 0.35, 0.35, 0, lin(0xff3030), [K.glow, 0.8, 3, 0]);
        break;
      }
      case 'crown': {
        // a lit crown: a glowing band round the top
        buf.obb(o, q.y0, q.y1, rgb, [K.metal, 0, 0, 0], [K.roof, 0, 0, 0], lin(COL.roofFlat));
        const band = shrinkObb(o, -0.08);
        const hue = [0x5ad1ff, 0xff4fa3, 0xffd34f, 0x8cff6a][Math.floor(b.seed * 4)];
        buf.obb(band, q.y0 + 1.2, q.y0 + 1.9, lin(hue), [K.glow, 0.15, 1.6, 0]);
        break;
      }
      case 'helipad':
        buf.obb(o, q.y0, q.y1, rgb, [K.plain, 0, 0, 0]);
        buf.cylinder(o.x, o.z, Math.min(o.hw, o.hd) * 0.8, Math.min(o.hw, o.hd) * 0.8, q.y1, q.y1 + 0.03, 16, lin(0xe8c547), [K.plain, 0, 0, 0], true, lin(0x3a3f45));
        break;
      case 'awning': {
        // a slope from the wall out over the sidewalk, with side flaps
        const c = obbCorners(o); // 0,1 out at the front (−v), 2,3 at the wall
        const k: K4 = [K.awning, 0, 0, 0];
        const col = rgb;
        const lo = q.y0, hi = q.y1;
        buf.quad([c[3].x, hi, c[3].z], [c[2].x, hi, c[2].z], [c[1].x, lo, c[1].z], [c[0].x, lo, c[0].z], col, k,
          [[0, 1], [o.hw * 2, 1], [o.hw * 2, 0], [0, 0]]);
        buf.quad([c[0].x, lo, c[0].z], [c[1].x, lo, c[1].z], [c[2].x, hi, c[2].z], [c[3].x, hi, c[3].z], lin(0x2a2a2a), [K.plain, 0, 0, 0]);
        buf.quad([c[1].x, lo - 0.35, c[1].z], [c[0].x, lo - 0.35, c[0].z], [c[0].x, lo, c[0].z], [c[1].x, lo, c[1].z], col, k,
          [[o.hw * 2, 0], [0, 0], [0, 1], [o.hw * 2, 1]]);
        break;
      }
      case 'sign':
        buf.obb(o, q.y0, q.y1, rgb, [K.glow, 0.12, 1.4, 0]);
        break;
      case 'balconies': {
        const floors = q.n ?? 1;
        const bays = Math.max(1, Math.floor((o.hw * 2) / 4.5));
        const bw = (o.hw * 2) / bays;
        for (let f = 0; f < floors; f++) {
          const y = q.y0 + f * b.floorH;
          if (y > q.y1) break;
          for (let k = 0; k < bays; k++) {
            if ((k + f) % 2) continue;
            const u0 = -o.hw + k * bw + 0.6, u1 = -o.hw + (k + 1) * bw - 0.6;
            buf.obb(sub2(o, u0, u1, -o.hd - 1.2, -o.hd), y, y + 0.18, rgb, [K.concrete, 0, 0, 0]);
            buf.obb(sub2(o, u0, u1, -o.hd - 1.2, -o.hd - 1.12), y + 0.18, y + 1.05, lin(q.color2 ?? 0x30343a));
          }
        }
        break;
      }
      case 'fireescape': {
        const floors = q.n ?? 1;
        const dark = lin(0x26292d);
        for (let f = 0; f < floors; f++) {
          const y = q.y0 + f * b.floorH;
          // a slatted landing and an open railing round it
          buf.obb(o, y - 0.06, y, dark, [K.metal, 0, 0, 0], null, undefined, true);
          const c = obbCorners(o);
          railing(buf, c[0], c[1], y, 0.9, dark, 1.2, 0.025, true);
          railing(buf, c[3], c[0], y, 0.9, dark, 1.2, 0.025);
          railing(buf, c[1], c[2], y, 0.9, dark, 1.2, 0.025);
          // the stair to the floor below: a slanted plank
          if (f > 0) {
            const lo = y - b.floorH;
            const a0 = obbPoint(o, -o.hw * 0.75 * (f % 2 ? 1 : -1), 0), a1 = obbPoint(o, o.hw * 0.75 * (f % 2 ? 1 : -1), 0);
            const vx = -o.uz * 0.3, vz = o.ux * 0.3;
            buf.quad([a0.x - vx, lo, a0.z - vz], [a0.x + vx, lo, a0.z + vz], [a1.x + vx, y, a1.z + vz], [a1.x - vx, y, a1.z - vz], dark);
            buf.quad([a1.x - vx, y, a1.z - vz], [a1.x + vx, y, a1.z + vz], [a0.x + vx, lo, a0.z + vz], [a0.x - vx, lo, a0.z - vz], dark);
          }
        }
        break;
      }
      case 'chimney':
        if (q.y1 - q.y0 > 10) {
          buf.cylinder(o.x, o.z, o.hw, o.hw * 0.75, q.y0, q.y1, 10, rgb, [K.plain, 0, 0, 0], true, lin(0x1a1a1a));
          buf.cylinder(o.x, o.z, o.hw * 0.8, o.hw * 0.8, q.y1 - 3, q.y1 - 2.3, 10, lin(0xd8d0c0));
        } else buf.obb(o, q.y0, q.y1, rgb, [K.plain, 0, 0, 0], null, lin(0x2a2a2a));
        break;
      case 'canopy': {
        buf.obb(o, q.y0, q.y1, rgb, [K.plain, 0, 0, 0], null, undefined, true);
        buf.obb(shrinkObb(o, -0.05), q.y0 + 0.55, q.y1 - 0.1, lin(q.color2 ?? 0xff3030), [K.glow, 0.3, 1.6, 0]);
        for (const [u, v] of [[-0.8, -0.7], [0.8, -0.7], [0.8, 0.7], [-0.8, 0.7]]) {
          const lp = obbPoint(o, u * o.hw, v * o.hd);
          buf.boxH(lp.x, 0.15, lp.z, 0.2, (q.y0 - 0.15) / 2, 0.2, 0, lin(0xdcdcdc));
        }
        // the canopy's lights underneath
        buf.obb(shrinkObb(o, 1.2), q.y0 - 0.04, q.y0, lin(0xfff6e0), [K.glow, 0.4, 1.8, 0], null, undefined, true);
        break;
      }
      case 'stairs':
        buf.obb(o, q.y0, q.y1, rgb, [K.plain, 0, 0, 0], [K.roof, 0, 0, 0], lin(COL.roofDark));
        buf.obb(sub2(o, -0.5, 0.5, -o.hd - 0.06, -o.hd + 0.02), q.y0, q.y0 + 2.1, lin(0x4a3a2c));
        break;
      case 'loading': {
        const doors = q.n ?? 1;
        const w = (o.hw * 2) / doors;
        for (let i = 0; i < doors; i++) {
          const u0 = -o.hw + i * w + w * 0.2, u1 = -o.hw + (i + 1) * w - w * 0.2;
          buf.obb(sub2(o, u0, u1, -o.hd - 0.1, -o.hd + 0.02), 0.15, q.y1, rgb, [K.metal, 0, 0, 0]);
          buf.obb(sub2(o, u0 - 0.3, u1 + 0.3, -o.hd - 0.35, -o.hd), 0.15, 0.6, lin(q.color2 ?? 0xd4a017));
        }
        break;
      }
      default:
        buf.obb(o, q.y0, q.y1, rgb);
    }
  }

  private roof(buf: GeoBuf, b: Building, q: Part): void {
    const o = q.obb;
    const y = q.y1;
    const roofCol = lin(q.color2 ?? 0x8a3b2e);
    switch (q.roof) {
      case 'gable': case 'hip': {
        const alongU = o.hw >= o.hd;
        const A = alongU ? o.hw : o.hd, B = alongU ? o.hd : o.hw;
        const pitch = b.type === 'warehouse' || b.type === 'factory' ? 0.28 : 0.62;
        const rh = B * pitch, ov = b.type === 'house' ? 0.45 : 0.3;
        const ridge = q.roof === 'hip' ? Math.max(0.3, A - B) : A + ov;
        // local (a along the ridge, c across) → world
        const W = (a: number, c: number, yy: number): number[] => {
          const pt = alongU ? obbPoint(o, a, c) : obbPoint(o, c, a);
          return [pt.x, yy, pt.z];
        };
        const k: K4 = b.type === 'house' ? [K.tiles, 0, 0, 0] : [K.metal, 0, 0, 0];
        const ye = y - ov * pitch;
        const flip = !alongU; // keep the winding facing out
        const Q = (p0: number[], p1: number[], p2: number[], p3: number[], col: [number, number, number], kk: K4, uv?: [[number, number], [number, number], [number, number], [number, number]]) =>
          flip ? buf.quad(p3, p2, p1, p0, col, kk, uv ? [uv[3], uv[2], uv[1], uv[0]] : undefined) : buf.quad(p0, p1, p2, p3, col, kk, uv);
        const T = (p0: number[], p1: number[], p2: number[], col: [number, number, number], kk: K4) =>
          flip ? buf.tri(p2[0], p2[1], p2[2], p1[0], p1[1], p1[2], p0[0], p0[1], p0[2], col, kk) : buf.tri(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], col, kk);
        const slope = Math.hypot(B + ov, rh + ov * pitch);
        // the two long slopes
        Q(W(-A - ov, -B - ov, ye), W(-ridge, 0, y + rh), W(ridge, 0, y + rh), W(A + ov, -B - ov, ye), roofCol, k, [[0, 0], [0, slope], [1, slope], [1, 0]]);
        Q(W(A + ov, B + ov, ye), W(ridge, 0, y + rh), W(-ridge, 0, y + rh), W(-A - ov, B + ov, ye), roofCol, k, [[0, 0], [0, slope], [1, slope], [1, 0]]);
        if (q.roof === 'gable') {
          // gable ends: wall triangles, and the roof's thickness
          const wc = lin(q.color);
          T(W(A, B, y), W(A, -B, y), W(A, 0, y + rh), wc, [K.plain, 0, 0, 0]);
          T(W(-A, -B, y), W(-A, B, y), W(-A, 0, y + rh), wc, [K.plain, 0, 0, 0]);
          // undersides of the overhang at the ends
          T(W(A + ov, B + ov, ye), W(A + ov, -B - ov, ye), W(A + ov, 0, y + rh), lin(0x4a3a30), k);
          T(W(-A - ov, -B - ov, ye), W(-A - ov, B + ov, ye), W(-A - ov, 0, y + rh), lin(0x4a3a30), k);
        } else {
          T(W(A + ov, -B - ov, ye), W(ridge, 0, y + rh), W(A + ov, B + ov, ye), roofCol, k);
          T(W(-A - ov, B + ov, ye), W(-ridge, 0, y + rh), W(-A - ov, -B - ov, ye), roofCol, k);
        }
        // the eaves' underside
        const under = lin(0x3a3532);
        Q(W(-A - ov, -B - ov, ye), W(A + ov, -B - ov, ye), W(A, -B, y), W(-A, -B, y), under, [K.plain, 0, 0, 0]);
        Q(W(A + ov, B + ov, ye), W(-A - ov, B + ov, ye), W(-A, B, y), W(A, B, y), under, [K.plain, 0, 0, 0]);
        break;
      }
      case 'sawtooth': {
        const teeth = Math.max(2, Math.round((o.hw * 2) / 9));
        const w = (o.hw * 2) / teeth, h = 2.6;
        const metal = lin(q.color2 ?? 0x6b6f75), glass = lin(0x3c5060);
        for (let i = 0; i < teeth; i++) {
          const u0 = -o.hw + i * w, u1 = u0 + w;
          const P0 = (u: number, v: number, yy: number) => { const pt = obbPoint(o, u, v); return [pt.x, yy, pt.z]; };
          // slope rising towards +u, glass face down at u1 facing +u
          buf.quad(P0(u0, o.hd, y), P0(u1, o.hd, y + h), P0(u1, -o.hd, y + h), P0(u0, -o.hd, y), metal, [K.metal, 0, 0, 0], [[0, 0], [w, 0], [w, 1], [0, 1]]);
          buf.quad(P0(u1, -o.hd, y), P0(u1, -o.hd, y + h), P0(u1, o.hd, y + h), P0(u1, o.hd, y), glass, [K.glow, 0, 0.35, 0]);
          const s0 = obbPoint(o, u0, -o.hd), s1 = obbPoint(o, u1, -o.hd), t0 = obbPoint(o, u0, o.hd), t1 = obbPoint(o, u1, o.hd);
          buf.tri(s0.x, y, s0.z, s1.x, y + h, s1.z, s1.x, y, s1.z, lin(q.color), [K.plain, 0, 0, 0]);
          buf.tri(t1.x, y, t1.z, t1.x, y + h, t1.z, t0.x, y, t0.z, lin(q.color), [K.plain, 0, 0, 0]);
        }
        break;
      }
      default: {
        // flat roof with a parapet (on anything bigger than a shed)
        const c = obbCorners(o);
        const grey = lin(b.district === 'downtown' ? COL.roofDark : COL.roofFlat);
        buf.flatTri(c[0], c[1], c[2], y, grey, [K.roof, 0, 0, 0]);
        buf.flatTri(c[0], c[2], c[3], y, grey, [K.roof, 0, 0, 0]);
        if (o.hw > 2.5 && o.hd > 2.5 && q.kind === 'mass') {
          const ph = b.type === 'house' ? 0.3 : 0.9;
          const inner = obbCorners(shrinkObb(o, 0.35));
          const trim = lin(tint(q.color, 0.78));
          for (let i = 0; i < 4; i++) {
            const a = c[(i + 1) % 4], d = c[i];
            buf.wall(a, d, y, y + ph, trim, [K.plain, 0, 0, 0]);
            const ia = inner[(i + 1) % 4], id = inner[i];
            buf.wall(id, ia, y, y + ph, trim, [K.plain, 0, 0, 0]);
            buf.flatTri(a, d, id, y + ph, trim);
            buf.flatTri(a, id, ia, y + ph, trim);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- props

  private fence(buf: GeoBuf, w: Wall): void {
    switch (w.kind) {
      case 'hedge': {
        const L = dist(w.a, w.b);
        if (L < 0.5) return;
        const m = lerp(w.a, w.b, 0.5);
        buf.obb({ x: m.x, z: m.z, hw: L / 2, hd: 0.45, ux: (w.b.x - w.a.x) / L, uz: (w.b.z - w.a.z) / L }, 0.15, 0.15 + w.h, lin(COL.hedge), [K.leaves, 0, 0, 0]);
        break;
      }
      case 'fence': railing(buf, w.a, w.b, 0.15, w.h, lin(COL.fence), 2, 0.05, true); break;
      case 'chainlink': railing(buf, w.a, w.b, 0.15, w.h, lin(0x8a8e92), 3, 0.04, true); break;
      default: railing(buf, w.a, w.b, 0.15, w.h, lin(COL.railing), 2.5);
    }
  }

  private instRecord(list: number[], q: Prop, ground = 0): void {
    let r = 1, g = 1, b = 1;
    const y = q.y + ground + (q.kind === 'car' ? 0 : 0.15);
    if (q.kind === 'car' || q.kind === 'container') {
      const c = lin(q.c);
      [r, g, b] = c;
    } else if (q.kind === 'signal') {
      r = q.c % 2; g = (this.plan.nodes[Math.floor(q.c / 2)]?.phase ?? 0) / 30; b = 0;
    } else if (q.kind === 'lamp') {
      // the moment this lamp comes on at dusk (the shader compares it with uLampOn)
      b = hash01(Math.floor(q.x * 3), Math.floor(q.z * 3), 21) * 0.95;
    } else if (q.kind === 'tree' || q.kind === 'palm' || q.kind === 'conifer') {
      const h = hash01(Math.floor(q.x * 10), Math.floor(q.z * 10));
      r = 0.8 + h * 0.35; g = 0.85 + hash01(Math.floor(q.z * 7), 3) * 0.3; b = 0.7 + h * 0.3;
    }
    list.push(q.x, y, q.z, q.h, q.s, r, g, b);
  }

  private prop(buf: GeoBuf, q: Prop): void {
    const Y = 0.15;
    switch (q.kind) {
      case 'bench': {
        const s = Math.sin(q.h), c = Math.cos(q.h);
        buf.boxH(q.x, Y + 0.42, q.z, 0.85, 0.04, 0.22, q.h, lin(0x8a5a36));
        buf.boxH(q.x - s * 0.2, Y + 0.5, q.z - c * 0.2, 0.85, 0.22, 0.03, q.h, lin(0x8a5a36));
        for (const k of [-0.7, 0.7]) buf.boxH(q.x + c * k, Y, q.z - s * k, 0.04, 0.21, 0.2, q.h, lin(0x2a2a2a));
        break;
      }
      case 'bin': buf.cylinder(q.x, q.z, 0.3, 0.32, Y, Y + 0.95, 7, lin(0x3d5a3a)); break;
      case 'hydrant':
        buf.cylinder(q.x, q.z, 0.16, 0.16, Y, Y + 0.6, 6, lin(0xc0392b));
        buf.cylinder(q.x, q.z, 0.2, 0.05, Y + 0.6, Y + 0.78, 6, lin(0xc0392b));
        break;
      case 'busstop': {
        const s = Math.sin(q.h), c = Math.cos(q.h);
        buf.boxH(q.x, Y + 2.4, q.z, 1.9, 0.06, 0.8, q.h, lin(0x2f3338), [K.plain, 0, 0, 0], true);
        buf.boxH(q.x - s * 0.7, Y, q.z - c * 0.7, 1.8, 1.2, 0.03, q.h, lin(0x7fa7c0), [K.plain, 0, 0, 0]);
        for (const k of [-1.8, 1.8]) buf.boxH(q.x + c * k - s * 0.7, Y, q.z - s * k - c * 0.7, 0.05, 1.2, 0.05, q.h, lin(0x2f3338));
        buf.boxH(q.x + c * 1.75, Y + 0.6, q.z - s * 1.75, 0.04, 0.9, 0.5, q.h, lin(0xf2f2f2), [K.glow, 0.25, 1.5, 0]);
        break;
      }
      case 'pump':
        buf.boxH(q.x, Y, q.z, 0.35, 0.8, 0.25, q.h, lin(0xe74c3c));
        buf.boxH(q.x, Y + 1.1, q.z, 0.3, 0.15, 0.27, q.h, lin(0xeaf6ff), [K.glow, 0.3, 1.4, 0]);
        break;
      case 'planter':
        buf.boxH(q.x, Y, q.z, 0.8, 0.3, 0.8, 0, lin(0x9a948a));
        buf.cylinder(q.x, q.z, 0.75, 0.25, Y + 0.6, Y + 1.6, 6, lin(COL.leaves), [K.leaves, 0, 0, 0]);
        break;
      case 'statue':
        buf.boxH(q.x, Y, q.z, 1.2, 0.8, 1.2, q.h, lin(0xa8a296));
        buf.cylinder(q.x, q.z, 0.35, 0.25, Y + 1.6, Y + 4.4, 6, lin(0x5d7a6a));
        buf.boxH(q.x, Y + 3.6, q.z, 0.9, 0.12, 0.2, q.h, lin(0x5d7a6a));
        break;
      case 'fountain': {
        const r = 4 * q.s;
        buf.cylinder(q.x, q.z, r, r, Y, Y + 0.6, 20, lin(0xb8b2a6), [K.plain, 0, 0, 0], false);
        buf.cylinder(q.x, q.z, r - 0.3, r - 0.3, Y + 0.2, Y + 0.55, 20, lin(0x2f7fa8), [K.water, 0, 0, 0]);
        buf.cylinder(q.x, q.z, 0.5, 0.4, Y + 0.55, Y + 2.2, 8, lin(0xb8b2a6));
        buf.cylinder(q.x, q.z, 1.4, 0.2, Y + 2.2, Y + 2.5, 10, lin(0xb8b2a6));
        break;
      }
      case 'pond': {
        const pts: P[] = [];
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const r = q.s * (0.85 + 0.25 * Math.sin(a * 3 + q.h));
          pts.push({ x: q.x + Math.cos(a) * r, z: q.z + Math.sin(a) * r });
        }
        buf.flat(pts, Y + 0.02, lin(0x2c6a86), [K.water, 0, 0, 0]);
        const rim = offsetOut(pts, 1.2);
        buf.flat(rim, Y + 0.05, lin(0x9a948a), [K.walk, 0, 0, 0], [pts]);
        break;
      }
      case 'pool': {
        const o: OBB = { x: q.x, z: q.z, hw: 2.4, hd: 4, ux: Math.cos(q.h), uz: -Math.sin(q.h) };
        buf.obb(o, Y, Y + 0.25, lin(0xe8e4dc), [K.plain, 0, 0, 0]);
        buf.obb(shrinkObb(o, 0.35), Y + 0.25, Y + 0.27, lin(0x38b6d8), [K.water, 0, 0, 0]);
        break;
      }
      case 'crane': {
        // a dock gantry crane: legs, beams and the boom over the water
        const col = lin(q.c || 0xd35400);
        const s = Math.sin(q.h), c = Math.cos(q.h);
        const at = (u: number, v: number) => ({ x: q.x + c * u + s * v, z: q.z - s * u + c * v });
        for (const [u, v] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) { const pt = at(u, v); buf.boxH(pt.x, Y, pt.z, 0.6, 14, 0.6, q.h, col); }
        for (const v of [-5, 5]) { const pt = at(0, v); buf.boxH(pt.x, Y + 26, pt.z, 7.6, 1, 0.7, q.h, col); }
        const boom = at(0, 14);
        buf.boxH(boom.x, Y + 30, boom.z, 1.2, 0.9, 30, q.h, col);
        const cab = at(0, 2);
        buf.boxH(cab.x, Y + 27.5, cab.z, 2.2, 1.6, 2.2, q.h, lin(0xe8e4dc));
        break;
      }
      case 'umbrella':
        buf.cylinder(q.x, q.z, 0.04, 0.04, q.y - 0.3, q.y + 2.3, 4, lin(0xdddddd));
        buf.cylinder(q.x, q.z, 1.6, 0.05, q.y + 2.0, q.y + 2.6, 8, lin(q.c || 0xe74c3c), [K.plain, 0, 0, 0], false);
        buf.cylinder(q.x, q.z, 0.05, 1.6, q.y + 2.6, q.y + 2.0, 8, lin(0xbbbbbb), [K.plain, 0, 0, 0], false);
        break;
      case 'kiosk': {
        // a café kiosk: a green booth with a counter window and a striped awning
        buf.boxH(q.x, Y, q.z, 1.6, 1.35, 1.6, q.h, lin(0x2e7d5b));
        const s = Math.sin(q.h), c = Math.cos(q.h);
        buf.boxH(q.x + s * 1.62, Y + 1.0, q.z + c * 1.62, 1.1, 0.45, 0.03, q.h, lin(0xfff1c8), [K.glow, 0.15, 1.2, 0]);
        buf.boxH(q.x + s * 2.1, Y + 2.35, q.z + c * 2.1, 1.7, 0.06, 0.55, q.h, lin(0xe74c3c), [K.awning, 0, 0, 0]);
        buf.boxH(q.x, Y + 2.7, q.z, 1.75, 0.08, 1.75, q.h, lin(0xf4f1ea));
        break;
      }
      case 'cafe': {
        // a round table, chairs and a parasol
        const s = Math.sin(q.h), c = Math.cos(q.h);
        buf.cylinder(q.x, q.z, 0.05, 0.05, Y, Y + 0.72, 4, lin(0x2a2a2a), [K.plain, 0, 0, 0], false);
        buf.cylinder(q.x, q.z, 0.42, 0.42, Y + 0.72, Y + 0.76, 8, lin(0xf2efe8));
        for (const k of [-0.75, 0.75]) {
          // a chair: seat on legs, a back away from the table
          const cx = q.x + c * k, cz = q.z - s * k;
          buf.boxH(cx, Y + 0.42, cz, 0.21, 0.025, 0.21, q.h, lin(0x7a5a3a));
          buf.boxH(cx, Y, cz, 0.03, 0.21, 0.03, q.h, lin(0x2a2a2a));
          buf.boxH(cx + c * Math.sign(k) * 0.19, Y + 0.47, cz - s * Math.sign(k) * 0.19, 0.025, 0.22, 0.2, q.h, lin(0x7a5a3a));
        }
        const pc = [0xc0392b, 0xf4f1ea, 0x1f618d, 0x27ae60, 0xd68910][Math.floor(hash01(Math.floor(q.x * 7), Math.floor(q.z * 7)) * 5)];
        buf.cylinder(q.x, q.z, 0.03, 0.03, Y + 0.76, Y + 2.25, 4, lin(0xdddddd), [K.plain, 0, 0, 0], false);
        buf.cylinder(q.x, q.z, 1.35, 0.04, Y + 1.95, Y + 2.35, 8, lin(pc), [K.plain, 0, 0, 0], false);
        buf.cylinder(q.x, q.z, 0.04, 1.35, Y + 2.35, Y + 1.95, 8, lin(tint(pc, 0.6)), [K.plain, 0, 0, 0], false);
        break;
      }
      case 'hut': {
        // a beach hut on short stilts, gable roof, door to the sea
        const y = q.y;
        const col = lin(q.c || 0x3b8fd1), white = lin(0xf6f3ec);
        const o: OBB = { x: q.x, z: q.z, hw: 1.05, hd: 1.0, ux: Math.cos(q.h), uz: -Math.sin(q.h) };
        buf.obb(shrinkObb(o, 0.1), y - 0.8, y + 0.3, lin(0x8a6a48));
        buf.obb(o, y + 0.3, y + 2.3, col, [K.plain, 0, 0, 0]);
        const c4 = obbCorners(o);
        // front (+v side faces the sea: corners 2, 3 are at +v)
        const door = sub2(o, -0.45, 0.45, o.hd - 0.02, o.hd + 0.04);
        buf.obb(door, y + 0.35, y + 2.0, white);
        const ridge = (a: P, b: P) => [ (a.x + b.x) / 2, y + 3.1, (a.z + b.z) / 2 ];
        const r0 = ridge(c4[0], c4[3]), r1 = ridge(c4[1], c4[2]);
        buf.quad([c4[0].x, y + 2.3, c4[0].z], [c4[1].x, y + 2.3, c4[1].z], r1, r0, white);
        buf.quad([c4[2].x, y + 2.3, c4[2].z], [c4[3].x, y + 2.3, c4[3].z], r0, r1, white);
        buf.tri(c4[1].x, y + 2.3, c4[1].z, c4[2].x, y + 2.3, c4[2].z, r1[0], r1[1], r1[2], col);
        buf.tri(c4[3].x, y + 2.3, c4[3].z, c4[0].x, y + 2.3, c4[0].z, r0[0], r0[1], r0[2], col);
        break;
      }
      case 'lounger': {
        const s = Math.sin(q.h), c = Math.cos(q.h);
        buf.boxH(q.x, q.y + 0.05, q.z, 0.32, 0.12, 0.85, q.h, lin(q.c || 0xffffff));
        buf.boxH(q.x + s * 0.8, q.y + 0.3, q.z + c * 0.8, 0.3, 0.2, 0.1, q.h, lin(q.c || 0xffffff));
        break;
      }
      case 'lifeguard': {
        const y = q.y;
        const s = Math.sin(q.h), c = Math.cos(q.h);
        for (const [u, v] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) buf.boxH(q.x + c * u + s * v, y - 0.5, q.z - s * u + c * v, 0.07, 1.4, 0.07, q.h, lin(0xf6f3ec));
        buf.boxH(q.x, y + 2.3, q.z, 1.0, 0.06, 1.0, q.h, lin(0xf6f3ec));
        buf.boxH(q.x - s * 0.2, y + 2.4, q.z - c * 0.2, 0.85, 0.7, 0.7, q.h, lin(0xd63a2f));
        buf.boxH(q.x, y + 3.85, q.z, 1.05, 0.06, 1.05, q.h, lin(0xf6f3ec));
        buf.boxH(q.x + s * 1.5, y - 0.5, q.z + c * 1.5, 0.35, 0.05, 0.6, q.h + 0.0, lin(0xc8b48a));
        break;
      }
      case 'boat': case 'sailboat':
        boat(buf, q);
        break;
      case 'bollard':
        buf.cylinder(q.x, q.z, 0.1, 0.09, Y, Y + 0.9, 6, lin(0x3d3a36));
        break;
      case 'kplanter':
        buf.boxH(q.x, Y, q.z, 0.9, 0.3, 0.9, q.h, lin(0xb8b2a6));
        buf.cylinder(q.x, q.z, 0.75, 0.3, Y + 0.6, Y + 1.5, 6, lin(COL.leaves), [K.leaves, 0, 0, 0]);
        break;
      case 'drain': case 'manhole':
        break;
      default:
        buf.boxH(q.x, Y, q.z, 0.3, 0.5, 0.3, 0, lin(0x888888));
    }
  }

  // ---------------------------------------------------------------- the seaside

  /** A deck piece (id = deck · 1000 + piece, 999 the far end) or the lighthouse (-1). */
  private deck(buf: GeoBuf, id: number, lod: number): void {
    buf.anchor = 0;
    if (id < 0) { this.lighthouse(buf); buf.anchor = null; return; }
    const d = this.plan.decks[Math.floor(id / 1000)], k = id % 1000;
    const L = dist(d.a, d.b), n = Math.max(1, Math.ceil(L / 16));
    const ux = (d.b.x - d.a.x) / L, uz = (d.b.z - d.a.z) / L;
    // a box along the deck: u across (hw), v along (hd)
    const along = (t0: number, t1: number, half: number): OBB => {
      const m = { x: d.a.x + ux * L * (t0 + t1) / 2, z: d.a.z + uz * L * (t0 + t1) / 2 };
      return { x: m.x, z: m.z, hw: half, hd: (L * (t1 - t0)) / 2, ux: uz, uz: -ux };
    };
    const plank: K4 = [K.deck, ux, uz, 0];
    if (d.kind === 'breakwater') {
      const stone = lin(0x9c968c), rock = lin(0x7f7a72);
      if (k === 999) {
        buf.cylinder(d.b.x, d.b.z, d.head + 3, d.head, -2.6, d.y, 18, rock, [K.concrete, 0, 0, 0], true, stone, [K.concrete, 0, 0, 0]);
        return void (buf.anchor = null);
      }
      const o = along(k / n, (k + 1) / n, d.half);
      const c = obbCorners(o), w = obbCorners({ ...o, hw: o.hw + 3.2 });
      // the walkway and the sloping rock flanks
      buf.flatTri(c[0], c[1], c[2], d.y, stone, [K.concrete, 0, 0, 0]);
      buf.flatTri(c[0], c[2], c[3], d.y, stone, [K.concrete, 0, 0, 0]);
      for (const [i, j] of [[1, 2], [3, 0]]) buf.quad([w[i].x, -2.6, w[i].z], [w[j].x, -2.6, w[j].z], [c[j].x, d.y, c[j].z], [c[i].x, d.y, c[i].z], rock, [K.concrete, 0, 0, 0]);
      if (lod === 0) for (let r = 0; r < 6; r++) {
        const h = hash01(id, r, 3), side = r % 2 ? 1 : -1;
        const q = obbPoint(o, side * (o.hw + 1.4 + h), (h * 2 - 1) * o.hd);
        buf.boxH(q.x, -1.2, q.z, 0.8 + h * 0.6, 0.6 + h * 0.4, 0.7, h * 6, rock, [K.concrete, 0, 0, 0]);
      }
      return void (buf.anchor = null);
    }
    const wood = lin(d.kind === 'pier' ? 0x9b7653 : 0xb08a62), pile = lin(0x5b4632);
    const y = d.y;
    if (k === 999) {
      if (d.kind === 'pier') {
        // the T head
        const o: OBB = { x: d.b.x, z: d.b.z, hw: d.head, hd: 5, ux: -uz, uz: ux };
        buf.obb(o, y - 0.35, y, wood, plank, plank, undefined, true);
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-0.3, -1], [0.3, 1], [0, 0]]) {
          const q = obbPoint(o, u * (o.hw - 0.5), v * (o.hd - 0.5));
          buf.cylinder(q.x, q.z, 0.2, 0.2, -3, y - 0.35, 6, pile, [K.plain, 0, 0, 0], false);
        }
      }
      return void (buf.anchor = null);
    }
    const o = along(k / n, (k + 1) / n, d.half);
    buf.obb(o, y - (d.kind === 'pier' ? 0.35 : 0.25), y, wood, plank, plank, undefined, true);
    if (d.kind === 'jetty') {
      // floats under the boards, a cleat post now and then
      buf.obb(shrinkObb(o, 0.2), y - 0.55, y - 0.25, lin(0xd8d4cc), [K.plain, 0, 0, 0]);
    } else for (const side of [-1, 1]) for (const t of [0.25, 0.75]) {
      const q = obbPoint(o, side * (o.hw - 0.3), (t * 2 - 1) * o.hd);
      buf.cylinder(q.x, q.z, 0.2, 0.2, -3, y - 0.35, 6, pile, [K.plain, 0, 0, 0], false);
    }
    buf.anchor = null;
  }

  /** The lighthouse: a striped tower, its gallery, the lantern room (lit at night) and a dome. */
  private lighthouse(buf: GeoBuf): void {
    const l = this.plan.lighthouse!;
    const { x, z } = l;
    const y = l.y, top = y + 21;
    const white = lin(0xf6f4ee), red = lin(0xc8352b), dark = lin(0x2d3238);
    const r = (t: number) => 3.1 - 1.0 * t;
    for (let i = 0; i < 5; i++) {
      const t0 = i / 5, t1 = (i + 1) / 5;
      buf.cylinder(x, z, r(t0), r(t1), y + 21 * t0, y + 21 * t1, 14, i % 2 ? red : white, [K.plain, 0, 0, 0], false);
    }
    // gallery, railing, lantern, dome, a beacon light on top
    buf.cylinder(x, z, 3.0, 3.0, top, top + 0.35, 16, dark);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      buf.boxH(x + Math.cos(a) * 2.85, top + 0.35, z + Math.sin(a) * 2.85, 0.04, 0.5, 0.04, 0, dark);
    }
    buf.cylinder(x, z, 2.88, 2.88, top + 1.3, top + 1.36, 16, dark, [K.plain, 0, 0, 0], false);
    buf.cylinder(x, z, 1.7, 1.7, top + 0.35, top + 3.2, 12, lin(0xfff1b8), [K.glow, 0.25, 3.5, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      buf.boxH(x + Math.cos(a) * 1.72, top + 0.35, z + Math.sin(a) * 1.72, 0.06, 1.43, 0.06, a, dark);
    }
    buf.cylinder(x, z, 1.95, 0.25, top + 3.2, top + 4.6, 12, red);
    buf.cylinder(x, z, 0.12, 0.05, top + 4.6, top + 5.4, 6, dark);
    // the door and a few slit windows
    const h = l.h + Math.PI;
    buf.boxH(x + Math.sin(h) * 3.02, y, z + Math.cos(h) * 3.02, 0.55, 1.1, 0.08, h, dark);
    for (const yy of [6, 11, 16]) buf.boxH(x + Math.sin(h + 0.4) * r(yy / 21), y + yy, z + Math.cos(h + 0.4) * r(yy / 21), 0.25, 0.45, 0.06, h + 0.4, lin(0xffe2a0), [K.glow, 0.05, 1.5, 0]);
  }

  // ---------------------------------------------------------------- far LOD, maps

  /** Every building as inset boxes (windows still drawn), in tiles of `tile` metres. */
  far(tile = 512): { key: string; geo: GeoArrays; tris: number }[] {
    const tiles = new Map<string, GeoBuf>();
    for (const b of this.plan.buildings) {
      if (this.skip.has(b.id)) continue;
      const k = `${Math.floor(b.obb.x / tile)},${Math.floor(b.obb.z / tile)}`;
      let buf = tiles.get(k);
      if (!buf) tiles.set(k, (buf = new GeoBuf(true)));
      buf.centre = { x: b.obb.x, z: b.obb.z };
      buf.anchor = this.base(b);
      const lit = Math.round(clamp(b.lit, 0, 0.9) * 10);
      // a kit building's far box is its exact footprint up to the cornice, flagged (256) so it
      // gives way to the kit near the camera instead of to the chunks
      const kit = this.kit && !!b.kit;
      for (const q of b.parts) {
        if (q.kind !== 'mass' && q.kind !== 'crown' && !(q.kind === 'chimney' && q.y1 > 12)) continue;
        const o = kit ? shrinkObb(q.obb, 0.12) : shrinkObb(q.obb, 0.3);
        if (o.hw < 0.5 || o.hd < 0.5) continue;
        const style = q.facade ?? 'punched';
        const top = kit ? q.y1 + 0.9 : q.y1 - 0.3 + (q.roof === 'gable' || q.roof === 'hip' ? Math.min(q.obb.hw, q.obb.hd) * 0.3 : 0);
        const c = obbCorners(o);
        for (let i = 0; i < 4; i++) {
          const a = c[(i + 1) % 4], d = c[i];
          const L = dist(a, d) + (kit ? 0.24 : 0.6);
          const bay = kit ? 2 : L / Math.max(1, Math.round(L / BAY[style]));
          const code = STYLE_IDX[style] + 16 * lit + (kit ? 256 + (q.shop && i === 0 ? 8 : 0) : 0) + b.seed * 0.999;
          buf.wall(a, d, q.y0, top, lin(q.color), [q.kind === 'mass' ? K.facade : K.plain, b.floorH, bay, code], kit ? -0.12 + (i % 2) * 0.0 : bay * 37 * i - 0.3);
        }
        const roof = lin(q.roof === 'gable' || q.roof === 'hip' ? (q.color2 ?? 0x8a3b2e) : b.district === 'downtown' ? COL.roofDark : COL.roofFlat);
        buf.flatTri(c[0], c[1], c[2], top, roof, [K.roof, 0, 0, kit ? 256 : 0]);
        buf.flatTri(c[0], c[2], c[3], top, roof, [K.roof, 0, 0, kit ? 256 : 0]);
      }
      buf.anchor = null;
    }
    return [...tiles].map(([key, buf]) => ({ key, geo: buf.arrays(), tris: buf.triangles }));
  }

  /** Beaches and other city-wide pieces drawn as one mesh. */
  extras(): GeoArrays {
    const buf = new GeoBuf();
    for (const beach of this.plan.water.beaches) {
      // the sand slopes from the promenade down under the water
      const n = beach.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const a = beach[i], b = beach[i + 1];
        const c = beach[beach.length - 1 - i], d = beach[beach.length - 2 - i];
        const sand = lin(COL.sand);
        const ya = -0.1, yb = -1.6;
        // facing up whatever the outline's direction
        const cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        if (cr < 0) buf.quad([a.x, ya, a.z], [b.x, ya, b.z], [d.x, yb, d.z], [c.x, yb, c.z], sand, [K.sand, 0, 0, 0]);
        else buf.quad([c.x, yb, c.z], [d.x, yb, d.z], [b.x, ya, b.z], [a.x, ya, a.z], sand, [K.sand, 0, 0, 0]);
      }
    }
    return buf.arrays();
  }

  /**
   * A ring of low hills far out (a skyline for the city), left out over the sea.
   */
  hills(): GeoArrays {
    const buf = new GeoBuf();
    const S = this.size, cx = S / 2, cz = S / 2;
    const r0 = S * 1.6, r1 = S * 2.6;
    const n = 96;
    const sea = this.plan.water.polys.length && (STYLES[this.plan.style].water === 'coast' || STYLES[this.plan.style].water === 'both') ? this.plan.water.polys[this.plan.water.polys.length - 1] : null;
    const terrain = STYLES[this.plan.style].terrain;
    const h = (i: number) => {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r0, z = cz + Math.sin(a) * r0;
      if (sea && pointInPoly({ x, z }, sea)) return 0;
      const k = this.plan.seed * 0.001;
      return Math.max(0, 110 + 130 * Math.sin(a * 3 + k) * Math.sin(a * 5.3 + 1 + k) + 70 * Math.sin(a * 11 + 2 * k) + 35 * Math.sin(a * 23 + k)) + 30;
    };
    const near = lin(tint(terrain, 0.75)), far = lin(tint(terrain, 0.6));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const h0 = h(i), h1 = h(i + 1);
      if (h0 <= 0 && h1 <= 0) continue;
      // the hills' feet stand on the terrain at the map's edge
      const f0 = this.h(cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0) - 0.5, f1 = this.h(cx + Math.cos(a1) * r0, cz + Math.sin(a1) * r0) - 0.5;
      const p0 = [cx + Math.cos(a0) * r0, f0, cz + Math.sin(a0) * r0], p1 = [cx + Math.cos(a1) * r0, f1, cz + Math.sin(a1) * r0];
      const q0 = [cx + Math.cos(a0) * (r0 + (r1 - r0) * 0.22), h0 + f0, cz + Math.sin(a0) * (r0 + (r1 - r0) * 0.22)];
      const q1 = [cx + Math.cos(a1) * (r0 + (r1 - r0) * 0.22), h1 + f1, cz + Math.sin(a1) * (r0 + (r1 - r0) * 0.22)];
      const e0 = [cx + Math.cos(a0) * r1, h0 * 0.6, cz + Math.sin(a0) * r1], e1 = [cx + Math.cos(a1) * r1, h1 * 0.6, cz + Math.sin(a1) * r1];
      // inner slope faces the city, the back slope faces out
      buf.quad(p0, p1, q1, q0, near, [K.grass, 0, 0, 0]);
      buf.quad(q0, q1, e1, e0, far, [K.grass, 0, 0, 0]);
    }
    return buf.arrays();
  }

  /** Map rectangle (x0, z0, size) shared by the ground and light maps. */
  mapRect(): { x0: number; z0: number; size: number } {
    const m = Math.round(this.size * 0.3);
    return { x0: -m, z0: -m, size: this.size + 2 * m };
  }

  /** The ground map: the city from above as RGBA (alpha 0 where water shows through). */
  groundMap(px = 1024): { data: Uint8Array; w: number } {
    const rect = this.mapRect();
    const r = minimapRaster(this.plan, rect.size / px, -rect.x0);
    const terrain = STYLES[this.plan.style].terrain;
    const cols: Record<number, number> = {
      [MAP.outside]: terrain, [MAP.road]: COL.asphalt, [MAP.sidewalk]: COL.walk, [MAP.building]: 0x7b7975, [MAP.park]: 0x5f8f3f,
      [MAP.plaza]: COL.paving, [MAP.downtown]: COL.paving, [MAP.commercial]: COL.concrete, [MAP.residential]: COL.grass,
      [MAP.suburban]: COL.grass, [MAP.industrial]: COL.gravel, [MAP.docks]: COL.concrete, [MAP.lot]: 0x4a4c50, [MAP.bridge]: COL.asphalt,
    };
    const data = new Uint8Array(r.w * r.h * 4);
    // the sea is the water polygon that is not the river (the river is listed first when present)
    const polys = this.plan.water.polys;
    const seaPoly = polys.length && (STYLES[this.plan.style].water === 'coast' || STYLES[this.plan.style].water === 'both' || polys.length > 1) ? polys[polys.length - 1] : null;
    for (let i = 0; i < r.data.length; i++) {
      const code = r.data[i];
      if (code === MAP.water || code === MAP.sand) {
        // rivers (inside the land's square) are told apart from the sea
        const x = rect.x0 + ((i % r.w) + 0.5) * r.res, z = rect.z0 + (Math.floor(i / r.w) + 0.5) * r.res;
        const sea = this.plan.water.polys.length > 0 && seaPoly !== null && pointInPoly({ x, z }, seaPoly);
        const t = (terrain >> 16) & 255, tg = (terrain >> 8) & 255, tb = terrain & 255;
        data[i * 4] = t; data[i * 4 + 1] = tg; data[i * 4 + 2] = tb;
        data[i * 4 + 3] = sea || code === MAP.sand ? 0 : 128;
        continue;
      }
      const c = cols[code] ?? terrain;
      // alpha 200 marks open country (the shader paints fields there)
      data[i * 4] = (c >> 16) & 255; data[i * 4 + 1] = (c >> 8) & 255; data[i * 4 + 2] = c & 255; data[i * 4 + 3] = code === MAP.outside ? 200 : 255;
    }
    // land past the coast's ends keeps the terrain colour (the sea is cut by the shore polygon)
    void pointInPoly; void polyIndex;
    return { data, w: r.w };
  }

  /** The night light map: lamp pools, shop glow, gas station canopies (linear RGB, 0..1). */
  lightMap(px = 1024): { data: Uint8Array; w: number } {
    const rect = this.mapRect();
    const res = rect.size / px;
    const acc = new Float32Array(px * px * 3);
    const splat = (x: number, z: number, radius: number, r: number, g: number, b: number) => {
      const cx = (x - rect.x0) / res, cz = (z - rect.z0) / res, rr = radius / res;
      const i0 = Math.max(0, Math.floor(cx - rr)), i1 = Math.min(px - 1, Math.ceil(cx + rr));
      const j0 = Math.max(0, Math.floor(cz - rr)), j1 = Math.min(px - 1, Math.ceil(cz + rr));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d2 = ((i + 0.5 - cx) ** 2 + (j + 0.5 - cz) ** 2) / (rr * rr);
        if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2);
        const o = (j * px + i) * 3;
        acc[o] += r * f; acc[o + 1] += g * f; acc[o + 2] += b * f;
      }
    };
    for (const q of this.plan.props) {
      // (small lamps over the water, on piers, jetties and bridges, make small pools)
      if (q.kind === 'lamp') splat(q.x + Math.sin(q.h) * 1.7 * q.s, q.z + Math.cos(q.h) * 1.7 * q.s, q.s < 0.9 ? 4.5 : 11 * q.s, q.s < 0.9 ? 0.45 : 0.75, q.s < 0.9 ? 0.32 : 0.52, q.s < 0.9 ? 0.17 : 0.28);
      else if (q.kind === 'busstop' || q.kind === 'pump') splat(q.x, q.z, 5, 0.25, 0.28, 0.3);
    }
    for (const b of this.plan.buildings) {
      for (const q of b.parts) {
        if (q.kind === 'sign') {
          const c = lin(q.color);
          splat(q.obb.x - q.obb.uz * -2.5, q.obb.z + q.obb.ux * -2.5, 6.5, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35);
        } else if (q.kind === 'canopy') splat(q.obb.x, q.obb.z, Math.max(q.obb.hw, q.obb.hd) + 6, 0.55, 0.55, 0.5);
        else if (q.kind === 'mass' && q.shop) {
          // shop windows spill light onto the sidewalk
          const n = Math.max(1, Math.round(q.obb.hw / 5));
          for (let i = 0; i < n; i++) {
            const pt = obbPoint(q.obb, -q.obb.hw + (i + 0.5) * (2 * q.obb.hw / n), -q.obb.hd - 2.2);
            splat(pt.x, pt.z, 6, 0.3, 0.24, 0.16);
          }
        }
      }
    }
    for (const n of this.plan.nodes) if (n.signal) splat(n.x, n.z, 9, 0.12, 0.1, 0.08);
    const data = new Uint8Array(px * px * 4);
    for (let i = 0; i < px * px; i++) {
      // soft clip so overlapping pools saturate gently
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(255 * (1 - Math.exp(-acc[i * 3 + c] * 1.4)));
      // alpha: the ground's height (0..64 m), so the shader lights the walls from their foot
      const x = rect.x0 + ((i % px) + 0.5) * res, z = rect.z0 + (Math.floor(i / px) + 0.5) * res;
      data[i * 4 + 3] = Math.round(clamp(this.h(x, z) / TERRAIN_RANGE, 0, 1) * 255);
    }
    return { data, w: px };
  }
}

// ------------------------------------------------------------------ helpers

/** The light map's alpha holds the ground height over this range (metres). */
export const TERRAIN_RANGE = 64;

/** A moored boat: a pointed hull, a deck, a cabin (and a mast with a furled sail). */
function boat(buf: GeoBuf, q: Prop): void {
  const s = q.s, L = 9 * s, B = 2.7 * Math.sqrt(s);
  const fx = Math.sin(q.h), fz = Math.cos(q.h), rx = Math.cos(q.h), rz = -Math.sin(q.h);
  const at = (f: number, r: number, y: number): number[] => [q.x + fx * f + rx * r, y, q.z + fz * f + rz * r];
  const wl = -0.7, top = wl + 0.75 * Math.sqrt(s), keel = wl - 0.35;
  // deck outline (stern to bow) and the hull's sides down to the waterline
  const outline: [number, number][] = [[-L / 2, -B / 2 * 0.85], [-L * 0.1, -B / 2], [L * 0.22, -B / 2 * 0.92], [L / 2, 0], [L * 0.22, B / 2 * 0.92], [-L * 0.1, B / 2], [-L / 2, B / 2 * 0.85]];
  const hull = lin(q.c || 0xffffff), deck = lin(0xe8dcc4), stripe = lin(q.c === 0xffffff || !q.c ? 0x1f3a5f : 0xffffff);
  for (let i = 0; i < outline.length; i++) {
    const [f0, r0] = outline[i], [f1, r1] = outline[(i + 1) % outline.length];
    buf.quad(at(f1 * 0.92, r1 * 0.7, keel), at(f0 * 0.92, r0 * 0.7, keel), at(f0, r0, top), at(f1, r1, top), hull, [K.paint, 0, 0, 0]);
    buf.quad(at(f1, r1, top - 0.12), at(f0, r0, top - 0.12), at(f0 * 1.003, r0 * 1.01, top), at(f1 * 1.003, r1 * 1.01, top), stripe, [K.plain, 0, 0, 0]);
  }
  for (let i = 1; i < outline.length - 1; i++) {
    const a = outline[0], b = outline[i], c = outline[i + 1];
    const A = at(a[0], a[1], top), Bp = at(b[0], b[1], top), C = at(c[0], c[1], top);
    buf.tri(A[0], A[1], A[2], C[0], C[1], C[2], Bp[0], Bp[1], Bp[2], deck);
  }
  const cab = at(-L * 0.08, 0, top);
  buf.boxH(cab[0], top, cab[2], B * 0.3, 0.45 * s, L * 0.16, q.h, lin(0xf4f1ea));
  buf.boxH(cab[0] + fx * L * 0.165, top + 0.25 * s, cab[2] + fz * L * 0.165, B * 0.28, 0.18 * s, 0.02, q.h, lin(0x2b3a48));
  if (q.kind === 'sailboat') {
    const m = at(L * 0.08, 0, top);
    buf.cylinder(m[0], m[2], 0.08, 0.05, top, top + 10 * s, 5, lin(0xd8d8d8), [K.plain, 0, 0, 0], false);
    const bm = at(-L * 0.12, 0, top + 1.3);
    buf.boxH(bm[0], top + 1.1, bm[2], 0.12, 0.13, L * 0.2, q.h, lin(0x1f3a5f));
  }
}

function tint(c: number, f: number): number {
  const r = clamp(Math.round(((c >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((c >> 8) & 255) * f), 0, 255), b = clamp(Math.round((c & 255) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}

/** A sub-box of a box in its own frame. */
function sub2(o: OBB, u0: number, u1: number, v0: number, v1: number): OBB {
  const c = obbPoint(o, (u0 + u1) / 2, (v0 + v1) / 2);
  return { x: c.x, z: c.z, hw: Math.abs(u1 - u0) / 2, hd: Math.abs(v1 - v0) / 2, ux: o.ux, uz: o.uz };
}

function shrinkObb(o: OBB, d: number): OBB { return { ...o, hw: o.hw - d, hd: o.hd - d }; }

/** Where another box's centre sits along a box's u and v axes. */
const localU = (o: OBB, b: { x: number; z: number }): number => (b.x - o.x) * o.ux + (b.z - o.z) * o.uz;
const localV = (o: OBB, b: { x: number; z: number }): number => -(b.x - o.x) * o.uz + (b.z - o.z) * o.ux;

/** A low box whose top carries uv in the box's frame (parking bays). */
function topWithUv(buf: GeoBuf, o: OBB, y0: number, y1: number, rgb: [number, number, number], kind: number): void {
  const c = obbCorners(o);
  for (let i = 0; i < 4; i++) buf.wall(c[(i + 1) % 4], c[i], y0, y1, rgb, [K.asphalt, 0, 0, 0]);
  const w = o.hw * 2, d = o.hd * 2;
  // corners: 0 (−u,−v) 1 (+u,−v) 2 (+u,+v) 3 (−u,+v); facing up needs the clockwise order in x,z
  const uv: [number, number][] = [[0, 0], [w, 0], [w, d], [0, d]];
  const cr = (c[1].x - c[0].x) * (c[2].z - c[0].z) - (c[1].z - c[0].z) * (c[2].x - c[0].x);
  const k: K4 = [kind, 0, 0, 0];
  const P = (i: number) => [c[i].x, y1, c[i].z];
  if (cr > 0) buf.quad(P(0), P(3), P(2), P(1), rgb, k, [uv[0], uv[3], uv[2], uv[1]]);
  else buf.quad(P(0), P(1), P(2), P(3), rgb, k, [uv[0], uv[1], uv[2], uv[3]]);
}

/** Posts and rails between a and b. */
function railing(buf: GeoBuf, a: P, b: P, y: number, h: number, rgb: [number, number, number], step = 2.5, t = 0.05, mid = false): void {
  const L = dist(a, b);
  if (L < 0.3) return;
  const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
  const n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) {
    const p = lerp(a, b, i / n);
    buf.obb({ x: p.x, z: p.z, hw: t, hd: t, ux, uz }, y, y + h, rgb);
  }
  const m = lerp(a, b, 0.5);
  buf.obb({ x: m.x, z: m.z, hw: L / 2, hd: t * 0.8, ux, uz }, y + h - 0.07, y + h, rgb, [K.plain, 0, 0, 0], null, undefined, true);
  if (mid) buf.obb({ x: m.x, z: m.z, hw: L / 2, hd: t * 0.6, ux, uz }, y + h * 0.45, y + h * 0.45 + 0.06, rgb, [K.plain, 0, 0, 0], null, undefined, true);
}

/** Outward mitred offset of a positive-area polygon (no validity checks). */
export function offsetOut(poly: P[], d: number): P[] {
  const n = poly.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    const e1x = b.x - a.x, e1z = b.z - a.z, e2x = c.x - b.x, e2z = c.z - b.z;
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    // outward normal = -(N side)
    const n1x = e1z / l1, n1z = -e1x / l1, n2x = e2z / l2, n2z = -e2x / l2;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cos = Math.max(0.35, mx * n1x + mz * n1z);
    out.push({ x: b.x + (mx * d) / cos, z: b.z + (mz * d) / cos });
  }
  void signedArea; void insetPoly;
  return out;
}
