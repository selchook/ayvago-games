// City generator: spatial queries on a plan, for games and bots. A grid index over road
// pieces, junctions, blocks, lots, colliders and lanes answers: what surface is here
// (road, sidewalk, lot, building, water …), which road and how far across it, the nearest lane
// (optionally facing a heading), which lot or block, whether a circle hits something solid and
// how high the roof is. Pure data.
import { type P, segDist, pointInPoly, inObb, obbCorners, dist } from './geom';
import type { CityPlan, Lane, Lot, Block, Collider, RoadEdge, Deck, Poi, PoiKind } from './types';
import { terrainOf } from './layout';
import type { Terrain } from './terrain';

export type Surface = 'road' | 'junction' | 'sidewalk' | 'lot' | 'yard' | 'park' | 'plaza' | 'building' | 'water' | 'bridge' | 'outside' | 'pier' | 'jetty' | 'breakwater' | 'beach';

export interface RoadHit {
  /** Road edge (-1 inside a junction). */
  edge: number;
  /** Junction node (-1 on a plain road). */
  node: number;
  /** Arc length along the edge from node a. */
  s: number;
  /** Signed distance from the centreline (N side positive). */
  lateral: number;
}

export interface LaneHit { lane: Lane; s: number; d: number; x: number; z: number; dx: number; dz: number }

const CELL = 32;

export class CityQuery {
  private roads = new Map<number, number[]>(); // [edge, pointIndex] pairs flattened
  private nodes = new Map<number, number[]>();
  private blocks = new Map<number, number[]>();
  private lots = new Map<number, number[]>();
  private solids = new Map<number, number[]>();
  private lanes = new Map<number, number[]>();
  private acc: number[][] = [];
  readonly terrain: Terrain;

  constructor(readonly plan: CityPlan) {
    this.terrain = terrainOf(plan);
    plan.edges.forEach((E, e) => {
      const acc = [0];
      for (let i = 1; i < E.pts.length; i++) acc.push(acc[i - 1] + dist(E.pts[i - 1], E.pts[i]));
      this.acc.push(acc);
      for (let i = 0; i < E.pts.length - 1; i++) this.addBox(this.roads, E.pts[i], E.pts[i + 1], E.half + 6, e * 4096 + i);
    });
    plan.nodes.forEach((n, i) => { if (n.poly.length) this.addPoly(this.nodes, n.poly, i); });
    plan.blocks.forEach((b, i) => { if (b.kind !== 'outer' && b.kind !== 'void') this.addPoly(this.blocks, b.curb, i); });
    plan.lots.forEach((l, i) => this.addPoly(this.lots, obbCorners(l.obb), i));
    plan.colliders.forEach((c, i) => this.addPoly(this.solids, obbCorners(c.obb), i));
    plan.lanes.forEach((l, i) => { for (let k = 0; k < l.pts.length - 1; k++) this.addBox(this.lanes, l.pts[k], l.pts[k + 1], 2, i * 4096 + k); });
  }

  private key(cx: number, cz: number): number { return (cx + 4096) * 8192 + cz + 4096; }

  private addBox(m: Map<number, number[]>, a: P, b: P, pad: number, v: number): void {
    const x0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = this.key(i, j);
      let l = m.get(k);
      if (!l) m.set(k, (l = []));
      l.push(v);
    }
  }

  private addPoly(m: Map<number, number[]>, poly: P[], v: number): void {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of poly) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    this.addBox(m, { x: x0, z: z0 }, { x: x1, z: z1 }, 0, v);
  }

  private at(m: Map<number, number[]>, x: number, z: number): number[] {
    return m.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
  }

  /** The road under a point (asphalt only), or null. */
  roadAt(x: number, z: number): RoadHit | null {
    const q = { x, z };
    for (const n of this.at(this.nodes, x, z)) if (pointInPoly(q, this.plan.nodes[n].poly)) return { edge: -1, node: n, s: 0, lateral: 0 };
    let best: RoadHit | null = null, bd = Infinity;
    for (const v of this.at(this.roads, x, z)) {
      const e = Math.floor(v / 4096), i = v % 4096;
      const E = this.plan.edges[e];
      const a = E.pts[i], b = E.pts[i + 1];
      const r = segDist(q, a, b);
      if (r.d > E.half || r.d >= bd) continue;
      const s = this.acc[e][i] + r.t * dist(a, b);
      if (s < E.trimA - 0.01 || s > E.len - E.trimB + 0.01) continue;
      const side = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
      bd = r.d;
      best = { edge: e, node: -1, s, lateral: side >= 0 ? r.d : -r.d };
    }
    return best;
  }

  /** The block whose kerb outline holds the point. */
  blockAt(x: number, z: number): Block | null {
    const q = { x, z };
    for (const i of this.at(this.blocks, x, z)) if (pointInPoly(q, this.plan.blocks[i].curb)) return this.plan.blocks[i];
    return null;
  }

  lotAt(x: number, z: number): Lot | null {
    for (const i of this.at(this.lots, x, z)) if (inObb({ x, z }, this.plan.lots[i].obb)) return this.plan.lots[i];
    return null;
  }

  /** The solid box at a point (and height, when given). */
  solidAt(x: number, z: number, y?: number): Collider | null {
    for (const i of this.at(this.solids, x, z)) {
      const c = this.plan.colliders[i];
      if (inObb({ x, z }, c.obb) && (y === undefined || (y >= c.y0 && y <= c.y1))) return c;
    }
    return null;
  }

  /** Does a circle (radius r) at a point hit a building, wall, pole or trunk? */
  collides(x: number, z: number, r: number): boolean {
    const seen = new Set<number>();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const i of this.at(this.solids, x + dx * r, z + dz * r)) {
        if (seen.has(i)) continue;
        seen.add(i);
        if (inObb({ x, z }, this.plan.colliders[i].obb, r)) return true;
      }
    }
    for (const c of this.plan.circles) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) return true;
    return false;
  }

  /** The terrain's height at a point (roads lie on it; sidewalks are 0.15 higher). */
  terrainAt(x: number, z: number): number { return this.terrain.h(x, z); }

  /** Where feet or wheels rest: the road, the sidewalk, a deck or the sand (no roofs). */
  groundAt(x: number, z: number): number {
    const d = this.deckAt(x, z);
    if (d) return d.y;
    const s = this.surfaceAt(x, z);
    if (s === 'beach') return this.beachY(x, z);
    if (s === 'water') return this.plan.water.level;
    return this.terrain.h(x, z) + (s === 'road' || s === 'junction' || s === 'bridge' ? 0 : 0.15);
  }

  /** The top of what stands at a point: a building's roof, or the ground. */
  heightAt(x: number, z: number): number {
    let h = -Infinity;
    for (const i of this.at(this.solids, x, z)) {
      const c = this.plan.colliders[i];
      if (c.ref >= 0 && inObb({ x, z }, c.obb)) { const b = this.plan.buildings[c.ref]; h = Math.max(h, b.y - 0.15 + b.h); }
    }
    return h === -Infinity ? this.groundAt(x, z) : h;
  }

  /** The deck (pier, jetty, breakwater) under a point, or null. */
  deckAt(x: number, z: number): Deck | null {
    for (const d of this.plan.decks ?? []) {
      const L = dist(d.a, d.b) || 1;
      const ux = (d.b.x - d.a.x) / L, uz = (d.b.z - d.a.z) / L;
      const s = (x - d.a.x) * ux + (z - d.a.z) * uz, t = Math.abs(-(x - d.a.x) * uz + (z - d.a.z) * ux);
      if (s >= 0 && s <= L && t <= d.half) return d;
      if (d.head && s > L - 5 && s <= L + 5 && t <= d.head) return d;
      if (d.kind === 'breakwater' && Math.hypot(x - d.b.x, z - d.b.z) <= d.head) return d;
    }
    return null;
  }

  private beachY(x: number, z: number): number {
    for (const beach of this.plan.water.beaches) {
      if (!pointInPoly({ x, z }, beach)) continue;
      const n = beach.length / 2;
      const line = (pts: { x: number; z: number }[]) => { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist({ x, z }, pts[i], pts[i + 1]).d); return d; };
      const da = line(beach.slice(0, n)), db = line(beach.slice(n));
      return -0.1 - 1.5 * (da / Math.max(0.01, da + db));
    }
    return 0;
  }

  /** Named places (all, or of a kind), nearest first when a point is given. */
  pois(kind?: PoiKind, near?: { x: number; z: number }): Poi[] {
    const list = kind ? this.plan.pois.filter((p) => p.kind === kind) : [...this.plan.pois];
    if (near) list.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
    return list;
  }

  poi(id: string): Poi | null { return this.plan.pois.find((p) => p.id === id) ?? null; }

  surfaceAt(x: number, z: number): Surface {
    const deck = this.deckAt(x, z);
    if (deck) return deck.kind;
    if (this.plan.water.beaches.some((b) => pointInPoly({ x, z }, b)) && !this.blockAt(x, z)) return 'beach';
    const r = this.roadAt(x, z);
    if (r) return r.node >= 0 ? 'junction' : this.plan.edges[r.edge].bridge ? 'bridge' : 'road';
    if (this.solidAt(x, z)) return 'building';
    const b = this.blockAt(x, z);
    if (!b) return this.inWater(x, z) ? 'water' : 'outside';
    if (b.kind === 'water') return b.inner && pointInPoly({ x, z }, b.inner) ? 'water' : 'sidewalk';
    if (b.inner && !pointInPoly({ x, z }, b.inner)) return 'sidewalk';
    if (b.kind === 'park') return 'park';
    if (b.kind === 'plaza') return 'plaza';
    const lot = this.lotAt(x, z);
    return lot ? (lot.use === 'building' ? 'yard' : 'lot') : 'lot';
  }

  /** Can a car be here? (roads, junctions, bridges) */
  drivable(x: number, z: number): boolean { return !!this.roadAt(x, z); }

  /** Can a person walk here? (anything but buildings and water) */
  walkable(x: number, z: number): boolean {
    const s = this.surfaceAt(x, z);
    return s !== 'building' && s !== 'water' && s !== 'outside';
  }

  inWater(x: number, z: number): boolean {
    return this.plan.water.polys.some((p) => pointInPoly({ x, z }, p));
  }

  /**
   * The nearest lane to a point within `radius`. With a heading (radians, three.js yaw: facing
   * (sin h, cos h)), lanes running the other way count as further.
   */
  nearestLane(x: number, z: number, heading?: number, radius = 24): LaneHit | null {
    const q = { x, z };
    let best: LaneHit | null = null, bd = Infinity;
    const hx = heading === undefined ? 0 : Math.sin(heading), hz = heading === undefined ? 0 : Math.cos(heading);
    const seen = new Set<number>();
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      for (const v of this.lanes.get(this.key(cx + i, cz + j)) ?? []) {
        if (seen.has(v)) continue;
        seen.add(v);
        const lane = this.plan.lanes[Math.floor(v / 4096)], k = v % 4096;
        const a = lane.pts[k], b = lane.pts[k + 1];
        const sd = segDist(q, a, b);
        if (sd.d > radius) continue;
        const L = dist(a, b) || 1;
        const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
        const score = sd.d + (heading === undefined ? 0 : (1 - (dx * hx + dz * hz)) * 6);
        if (score >= bd) continue;
        bd = score;
        let s = sd.t * L;
        for (let m = 0; m < k; m++) s += dist(lane.pts[m], lane.pts[m + 1]);
        best = { lane, s, d: sd.d, x: a.x + (b.x - a.x) * sd.t, z: a.z + (b.z - a.z) * sd.t, dx, dz };
      }
    }
    return best;
  }

  edge(id: number): RoadEdge { return this.plan.edges[id]; }
}

const cache = new WeakMap<CityPlan, CityQuery>();
/** The (cached) query index of a plan. */
export function cityQuery(plan: CityPlan): CityQuery {
  let q = cache.get(plan);
  if (!q) cache.set(plan, (q = new CityQuery(plan)));
  return q;
}
