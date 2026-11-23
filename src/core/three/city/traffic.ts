// City generator: what moves through the city. The lane graph (right-hand traffic: lanes per
// direction, connectors through every junction with their turn and signal group, U-turns at
// dead ends, roundabouts circulating the right way), the traffic lights and the pedestrian
// graph (sidewalk rings round every block joined by crossings at the junctions). Pure data.
import { type P, p, add, sub, mul, dot, cross, dist, unit, nrm, angleOf, fromAngle, offsetPolyline, polylineLength, alongPolyline, insetPoly, clamp } from './geom';
import type { Network } from './roads';
import { LANE_W } from './roads';
import type { Block, Lane, Connector, Signal, Turn, RoadEdge, RoadNode, Deck } from './types';

const SPEED = { boulevard: 16, avenue: 14, street: 11, alley: 6 };

/** Lateral offset of lane `index` (N side of its own travel direction). */
export function laneOffset(E: RoadEdge, index: number): number {
  if (E.cls === 'alley') return 1.4;
  return E.median / 2 + (E.median ? 0 : 0.15) + (index + 0.5) * LANE_W;
}

/** End of edge e at node n: outward direction. */
function outDir(E: RoadEdge, atA: boolean): P {
  const s = Math.min(6, E.len / 2);
  const a = atA ? E.pts[0] : E.pts[E.pts.length - 1];
  const q = atA ? alongPolyline(E.pts, s).p : alongPolyline(E.pts, E.len - s).p;
  return unit(sub(q, a));
}

function bezier(p0: P, d0: P, p3: P, d3: P, n = 8): P[] {
  const L = dist(p0, p3) * 0.42;
  const p1 = add(p0, mul(d0, L)), p2 = sub(p3, mul(d3, L));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(p(
      u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    ));
  }
  return out;
}

/** Splits a junction's approaches into two signal groups by axis. */
function groupsAt(net: Network, n: RoadNode): Map<string, number> {
  const out = new Map<string, number>();
  let axis: number | null = null;
  for (const e of n.edges) {
    const E = net.edges[e];
    for (const atA of [true, false]) {
      if ((atA ? E.a : E.b) !== n.id) continue;
      const a = angleOf(outDir(E, atA));
      if (axis === null) axis = a;
      let d = Math.abs(((a - axis) % Math.PI + Math.PI) % Math.PI);
      d = Math.min(d, Math.PI - d);
      out.set(e + ':' + atA, d < Math.PI / 4 ? 0 : 1);
    }
  }
  return out;
}

export function makeLanes(net: Network): { lanes: Lane[]; connectors: Connector[]; signals: Signal[] } {
  const lanes: Lane[] = [];
  const connectors: Connector[] = [];
  const signals: Signal[] = [];
  // lanes ending at / starting from each node
  const inbound = new Map<number, number[]>(), outbound = new Map<number, number[]>();
  const push = (m: Map<number, number[]>, k: number, v: number) => { let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(v); };
  for (const E of net.edges) {
    for (const dir of [1, -1] as const) {
      const pts = dir === 1 ? E.pts : [...E.pts].reverse();
      const s0 = dir === 1 ? E.trimA : E.trimB, s1 = E.len - (dir === 1 ? E.trimB : E.trimA);
      for (let k = 0; k < E.lanes; k++) {
        const lp = offsetPolyline(pts, laneOffset(E, k), s0, s1);
        if (lp.length < 2) continue;
        const id = lanes.length;
        const from = dir === 1 ? E.a : E.b, to = dir === 1 ? E.b : E.a;
        lanes.push({ id, edge: E.id, dir, index: k, from, to, pts: lp, len: polylineLength(lp), next: [], speed: SPEED[E.cls] });
        push(outbound, from, id);
        push(inbound, to, id);
      }
    }
  }
  for (const n of net.nodes) {
    const ins = inbound.get(n.id) ?? [], outs = outbound.get(n.id) ?? [];
    const groups = n.signal ? groupsAt(net, n) : null;
    const deg = n.edges.length;
    for (const li of ins) {
      const L = lanes[li];
      const Ein = net.edges[L.edge];
      const dIn = unit(sub(L.pts[L.pts.length - 1], L.pts[L.pts.length - 2]));
      const bend = deg === 2 && !n.island;
      const cands: { lo: number; turn: Turn; strict: boolean }[] = [];
      for (const lo of outs) {
        const O = lanes[lo];
        const same = O.edge === L.edge;
        if (same && deg > 1 && !n.island) continue; // U-turns only at dead ends (and round roundabouts)
        const dOut = unit(sub(O.pts[1], O.pts[0]));
        const c = cross(dIn, dOut), dd = dot(dIn, dOut);
        const turn: Turn = same ? 'uturn' : bend || dd > 0.7 ? 'straight' : c > 0 ? 'right' : 'left';
        const nIn = Ein.lanes, nOut = net.edges[O.edge].lanes;
        // lane discipline: which lane may turn where, and into which lane
        let strict = true;
        if (n.island) strict = true;
        else if (same) strict = O.index === Math.min(L.index, nOut - 1);
        else if (turn === 'straight') strict = O.index === Math.min(L.index, nOut - 1) || (nIn < nOut && O.index >= nIn - 1);
        else if (turn === 'right') strict = L.index === nIn - 1 && O.index === nOut - 1;
        else strict = L.index === 0 && O.index === 0;
        cands.push({ lo, turn, strict });
      }
      // keep the disciplined moves; a lane left without any exit may take any move
      let use = cands.filter((x) => x.strict);
      if (!use.length) use = cands;
      for (const { lo, turn: t0 } of use) {
        const O = lanes[lo];
        const same = O.edge === L.edge;
        const dOut = unit(sub(O.pts[1], O.pts[0]));
        let turn = t0;
        let pts: P[];
        const a = L.pts[L.pts.length - 1], b = O.pts[0];
        if (n.island) {
          // circulate round the island: decreasing angle (anticlockwise seen from above)
          const rc = n.island + LANE_W * (L.index === 0 ? 0.7 : 1.5);
          const a0 = angleOf(sub(a, n));
          let a1 = angleOf(sub(b, n));
          while (a1 > a0 - 0.35) a1 -= Math.PI * 2;
          const arc: P[] = [];
          const steps = Math.max(3, Math.ceil((a0 - a1) / 0.3));
          for (let i = 1; i < steps; i++) arc.push(add(n, fromAngle(a0 + (a1 - a0) * (i / steps), rc)));
          pts = [a, ...arc, b];
          const sweep = a0 - a1;
          turn = sweep < Math.PI * 0.75 ? 'right' : sweep < Math.PI * 1.25 ? 'straight' : sweep < Math.PI * 1.75 ? 'left' : 'uturn';
        } else if (same) {
          // a loop round the dead end
          const c0 = n as P;
          const a0 = angleOf(sub(a, c0));
          let a1 = angleOf(sub(b, c0));
          while (a1 > a0) a1 -= Math.PI * 2;
          const r = Math.max(dist(a, c0), 3);
          pts = [a];
          for (let i = 1; i < 8; i++) pts.push(add(c0, fromAngle(a0 + (a1 - a0) * (i / 8), r + 1.5)));
          pts.push(b);
        } else pts = bezier(a, dIn, b, dOut);
        const id = connectors.length;
        const group = groups ? groups.get(L.edge + ':' + (Ein.a === n.id)) ?? -1 : -1;
        connectors.push({ id, node: n.id, from: li, to: lo, turn, pts, len: polylineLength(pts), group });
        L.next.push(id);
      }
    }
    // traffic light poles: at each approach, on the kerb the traffic drives along
    if (n.signal && groups) {
      for (const e of n.edges) {
        const E = net.edges[e];
        for (const atA of [true, false]) {
          if ((atA ? E.a : E.b) !== n.id) continue;
          const d = outDir(E, atA);
          const t = (atA ? E.trimA : E.trimB) + 2.5;
          const s = atA ? t : E.len - t;
          const at = alongPolyline(E.pts, clamp(s, 0, E.len));
          const dd = atA ? at.d : mul(at.d, -1);
          const q = add(at.p, mul(nrm(dd), -(E.half + 0.9)));
          signals.push({ node: n.id, edge: e, x: q.x, z: q.z, h: Math.atan2(d.x, d.z), group: groups.get(e + ':' + atA) ?? 0 });
        }
      }
    }
  }
  return { lanes, connectors, signals };
}

/**
 * Signal state of a group at a junction at time t (seconds): 'green', 'yellow' or 'red'.
 * A cycle is 30 s: group 0 green 12 s, yellow 3 s, then group 1 the same.
 */
export function signalState(node: RoadNode, group: number, t: number): 'green' | 'yellow' | 'red' {
  if (!node.signal || group < 0) return 'green';
  const c = ((t + node.phase) % 30 + 30) % 30;
  const g = group === 0 ? c : (c + 15) % 30;
  return g < 12 ? 'green' : g < 15 ? 'yellow' : 'red';
}

/** The pedestrian graph: a ring along each block's sidewalk, crossings at the junctions. */
export function makeWalk(net: Network, blocks: Block[], decks: Deck[] = []): { pts: P[]; edges: [number, number, 0 | 1][] } {
  const pts: P[] = [];
  const edges: [number, number, 0 | 1][] = [];
  const rings = new Map<number, number[]>();
  const islands: Block[] = [];
  for (const b of blocks) {
    if (b.kind === 'void') continue;
    // the city's edge: the outer sidewalk (on the coast, the promenade along the sea wall)
    let ring: P[] | null;
    if (b.kind === 'outer') ring = outward([...b.curb].reverse(), 1.75);
    else {
      // leftover islands between tangled roads: a ring when they are big enough to walk round
      if (b.curbEdge.every((e) => e < 0)) { if (b.area < 350) continue; islands.push(b); }
      ring = insetPoly(b.curb, b.walk / 2);
    }
    if (!ring) continue;
    // decimate to ~6 m steps
    const ids: number[] = [];
    let last: P | null = null;
    for (const q of ring) {
      if (last && dist(last, q) < 6) continue;
      ids.push(pts.length);
      pts.push(p(Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100));
      last = q;
    }
    if (ids.length < 3) continue;
    for (let i = 0; i < ids.length; i++) edges.push([ids[i], ids[(i + 1) % ids.length], 0]);
    rings.set(b.id, ids);
  }
  const nearest = (block: number, q: P): number => {
    const ids = rings.get(block);
    if (!ids) return -1;
    let best = -1, bd = 14;
    for (const i of ids) { const d = dist(pts[i], q); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  for (const n of net.nodes) {
    if (n.kind !== 'junction') continue;
    for (const e of n.edges) {
      const E = net.edges[e];
      for (const atA of [true, false]) {
        if ((atA ? E.a : E.b) !== n.id) continue;
        if (E.faceN < 0 || E.faceS < 0) continue;
        const t = (atA ? E.trimA : E.trimB) + 2;
        const s = atA ? t : E.len - t;
        const at = alongPolyline(E.pts, clamp(s, 0, E.len));
        const off = mul(nrm(at.d), E.half + 1.5);
        const qa = add(at.p, off), qb = sub(at.p, off);
        const ia = nearest(E.faceN, qa), ib = nearest(E.faceS, qb);
        if (ia >= 0 && ib >= 0) edges.push([ia, ib, 1]);
      }
    }
  }
  // islands: crossings to the nearest sidewalks round them (their kerbs face no known road)
  if (islands.length) {
    // walk points on a grid, tagged with their block
    const owner = new Int32Array(pts.length).fill(-1);
    for (const [blk, ids] of rings) for (const i of ids) owner[i] = blk;
    const grid = new Map<number, number[]>();
    const gk = (x: number, z: number) => Math.floor(x / 22) * 100003 + Math.floor(z / 22);
    pts.forEach((q, i) => { const k = gk(q.x, q.z); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i); });
    for (const b of islands) {
      const mine = rings.get(b.id);
      if (!mine) continue;
      const links = new Map<number, [number, number, number]>();
      for (const i of mine) {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(gk(pts[i].x + dx * 22, pts[i].z + dz * 22)) ?? []) {
            const other = owner[j];
            if (other < 0 || other === b.id) continue;
            const d = dist(pts[i], pts[j]);
            if (d > 22) continue;
            const cur = links.get(other);
            if (!cur || d < cur[2]) links.set(other, [i, j, d]);
          }
        }
      }
      for (const [i, j] of links.values()) edges.push([i, j, 1]);
    }
  }
  // decks: a path from the promenade out to the end
  const outer = blocks.find((b) => b.kind === 'outer');
  for (const d of decks) {
    const n = Math.max(1, Math.round(dist(d.a, d.b) / 8));
    let prev = -1;
    for (let k = 0; k <= n; k++) {
      const q = p(Math.round((d.a.x + (d.b.x - d.a.x) * (k / n)) * 100) / 100, Math.round((d.a.z + (d.b.z - d.a.z) * (k / n)) * 100) / 100);
      const id = pts.length;
      pts.push(q);
      if (prev >= 0) edges.push([prev, id, 0]);
      else if (outer) { const j = nearest(outer.id, q); if (j >= 0) edges.push([j, id, 0]); }
      prev = id;
    }
  }
  return { pts, edges };
}

/** Outward mitred offset of a positive-area polygon. */
function outward(poly: P[], d: number): P[] {
  const n = poly.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z) || 1, l2 = Math.hypot(c.x - b.x, c.z - b.z) || 1;
    const n1x = (b.z - a.z) / l1, n1z = -(b.x - a.x) / l1, n2x = (c.z - b.z) / l2, n2z = -(c.x - b.x) / l2;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cos = Math.max(0.35, mx * n1x + mz * n1z);
    out.push(p(b.x + (mx * d) / cos, b.z + (mz * d) / cos));
  }
  return out;
}
