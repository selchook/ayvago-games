// City generator: the plan as an open world, for a game with people on foot and vehicles.
// Everything here is derived from the plan (pure data, no three.js):
//
//   walkAreas(plan)   where people walk: every block's sidewalk ring, plazas and parks, the
//                     promenade, the beaches, piers, jetties and the breakwater (outlines and
//                     the height to stand at)
//   doors(plan)       every way into a building (main, shop and back doors), facing out
//   parkingSpots(plan) every parking bay with its height and whether a placeholder car is in it
//   vehicleLanes(plan) the lane graph to drive along (plan.lanes + plan.connectors)
//   spawnAt(plan, kind, near) a spawn point of a kind, nearest to a point
//
// Plus what the plan holds itself: colliders and circles (building masses snapped to the kit's
// facades, walls, railings, poles, trunks, tables), pois (named places with ids and kinds), the
// pedestrian graph (walk) and spawns. cityQuery(plan) answers point questions (surfaceAt,
// groundAt, walkable, drivable, collides, deckAt, pois …).
import { type P, p, dist } from './geom';
import { terrainOf } from './layout';
import type { CityPlan, Door, ParkingSpot, Spawn, SpawnKind, Lane, Connector } from './types';

export type WalkKind = 'sidewalk' | 'plaza' | 'park' | 'promenade' | 'beach' | 'pier' | 'jetty' | 'breakwater';

export interface WalkArea {
  kind: WalkKind;
  /** Outline (positive area) and, for sidewalk rings, the hole inside. */
  outer: P[];
  hole: P[] | null;
  /** Height to stand at (sidewalks: the terrain + 0.15 under each point, given at the centre). */
  y: number;
  /** Block or deck id. */
  ref: number;
}

/** Where people walk. Sidewalks are rings (the kerb outline with the block's inner edge as a hole). */
export function walkAreas(plan: CityPlan): WalkArea[] {
  const T = terrainOf(plan);
  const out: WalkArea[] = [];
  const yAt = (q: P) => Math.round((T.h(q.x, q.z) + 0.15) * 100) / 100;
  for (const b of plan.blocks) {
    if (b.kind === 'void' || (b.kind === 'water' && !b.inner)) continue;
    if (b.kind === 'outer') {
      const land = [...b.curb].reverse();
      const ring = grow(land, 3.5);
      out.push({ kind: 'promenade', outer: ring, hole: land, y: yAt(ring[0]), ref: b.id });
      continue;
    }
    if (b.kind === 'park' || b.kind === 'plaza') {
      out.push({ kind: b.kind, outer: b.curb, hole: null, y: yAt(b.c), ref: b.id });
      continue;
    }
    if (b.inner) out.push({ kind: 'sidewalk', outer: b.curb, hole: b.inner, y: yAt(b.c), ref: b.id });
  }
  plan.water.beaches.forEach((beach, i) => out.push({ kind: 'beach', outer: beach, hole: null, y: -0.4, ref: i }));
  plan.decks.forEach((d, i) => {
    const L = dist(d.a, d.b) || 1;
    const ux = (d.b.x - d.a.x) / L, uz = (d.b.z - d.a.z) / L, nx = -uz, nz = ux;
    const box = (s0: number, s1: number, w: number): P[] => [
      p(d.a.x + ux * s0 + nx * w, d.a.z + uz * s0 + nz * w), p(d.a.x + ux * s1 + nx * w, d.a.z + uz * s1 + nz * w),
      p(d.a.x + ux * s1 - nx * w, d.a.z + uz * s1 - nz * w), p(d.a.x + ux * s0 - nx * w, d.a.z + uz * s0 - nz * w),
    ];
    out.push({ kind: d.kind, outer: box(0, L, d.half), hole: null, y: d.y, ref: i });
    if (d.kind === 'pier' && d.head) out.push({ kind: 'pier', outer: box(L - 5, L + 5, d.head), hole: null, y: d.y, ref: i });
  });
  return out;
}

/** Every way into a building, with the building's id. */
export function doors(plan: CityPlan): (Door & { building: number })[] {
  const out: (Door & { building: number })[] = [];
  for (const b of plan.buildings) for (const d of b.doors) out.push({ ...d, building: b.id });
  return out;
}

/** Every parking bay with the height of the road or lot under it. */
export function parkingSpots(plan: CityPlan): (ParkingSpot & { y: number; id: number })[] {
  const T = terrainOf(plan);
  return plan.parking.map((s, id) => ({ ...s, id, y: Math.round(T.h(s.x, s.z) * 100) / 100 }));
}

/** The lane graph a vehicle drives: lanes, and the connectors through the junctions. */
export function vehicleLanes(plan: CityPlan): { lanes: Lane[]; connectors: Connector[] } {
  return { lanes: plan.lanes, connectors: plan.connectors };
}

/** The spawn point of a kind nearest to a point (or the first of that kind). */
export function spawnAt(plan: CityPlan, kind: SpawnKind, near?: { x: number; z: number }): Spawn | null {
  let best: Spawn | null = null, bd = Infinity;
  for (const s of plan.spawns) {
    if (s.kind !== kind) continue;
    const d = near ? Math.hypot(s.x - near.x, s.z - near.z) : 0;
    if (d < bd) { bd = d; best = s; }
    if (!near) break;
  }
  return best;
}

/** Outward mitred offset of a polygon (positive area). */
function grow(poly: P[], d: number): P[] {
  const n = poly.length;
  return poly.map((b, i) => {
    const a = poly[(i - 1 + n) % n], c = poly[(i + 1) % n];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z) || 1, l2 = Math.hypot(c.x - b.x, c.z - b.z) || 1;
    const n1x = (b.z - a.z) / l1, n1z = -(b.x - a.x) / l1, n2x = (c.z - b.z) / l2, n2z = -(c.x - b.x) / l2;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cos = Math.max(0.35, mx * n1x + mz * n1z);
    return p(b.x + (mx * d) / cos, b.z + (mz * d) / cos);
  });
}
