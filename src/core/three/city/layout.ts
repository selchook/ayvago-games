// City generator: generateCity() turns a seed and a style into a CityPlan, plain data and fully
// deterministic: the same options always give the same plan (planHash() proves it), another
// seed a clearly different city. No three.js here, so it runs headless in Node for tests and
// bots; CityView (view.ts) draws a plan.
import { type P, p, add, mul, dist, centroid, obbPoint, round2, lerp, alongPolyline, offsetPolyline, signedArea } from './geom';
import { rng, hashString } from './rng';
import { STYLES } from './styles';
import { makeSite, buildNetwork } from './roads';
import { makeBlocks, makeLots, makeBuildings } from './blocks';
import { makeLanes, makeWalk } from './traffic';
import { makeProps } from './props';
import type { CityOptions, CityPlan, DistrictKind, Spawn, Collider, Circle, Water } from './types';
import { DISTRICTS } from './types';

export const PLAN_VERSION = 1;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function generateCity(opts: CityOptions): CityPlan {
  const t0 = now();
  const style = STYLES[opts.style ?? 'metropolis'];
  const S = Math.round(opts.size ?? style.size);
  const seed = opts.seed >>> 0;
  const rnd = rng(seed ^ 0x9e3779b9);
  const weights = {} as Record<DistrictKind, number>;
  for (const d of DISTRICTS) weights[d] = style.weights[d] * (opts.districts?.[d] ?? 1);
  const st = { ...style, ring: opts.ring ?? style.ring };
  const site = makeSite(S, st, rnd.fork(1), seed, weights, opts.water ?? style.water);
  const net = buildNetwork(site, rnd.fork(2));
  const blocks = makeBlocks(net, site, rnd.fork(3));
  const lots = makeLots(blocks, net, site, rnd.fork(4));
  const { buildings, walls } = makeBuildings(lots, blocks, net, site, rnd.fork(5), opts.height ?? 1);
  const { lanes, connectors, signals } = makeLanes(net);
  const walk = makeWalk(net, blocks);
  const pr = makeProps(net, blocks, lots, buildings, signals, site, rnd.fork(6));

  // water outlines
  const water: Water = { polys: [], beaches: site.beaches, level: -0.7 };
  if (site.river) {
    // the river runs on past the city's edges
    const rp = site.river.pts, n = rp.length;
    const ext = (a: P, b: P) => { const d = Math.hypot(a.x - b.x, a.z - b.z) || 1; return p(a.x + ((a.x - b.x) / d) * S, a.z + ((a.z - b.z) / d) * S); };
    const pts = [ext(rp[0], rp[1]), ...rp, ext(rp[n - 1], rp[n - 2])];
    const l = offsetPolyline(pts, site.river.half), r = offsetPolyline(pts, -site.river.half);
    const poly = [...l, ...r.reverse()];
    water.polys.push(signedArea(poly) < 0 ? poly.reverse() : poly);
  }
  if (site.sea) water.polys.push(site.sea);

  // colliders: the ground masses of the buildings, walls, poles and trunks
  const colliders: Collider[] = [];
  buildings.forEach((b) => {
    for (const q of b.parts) {
      if ((q.kind === 'mass' || q.kind === 'garage' || q.kind === 'chimney') && q.y0 < 2) colliders.push({ obb: q.obb, y0: q.y0, y1: q.y1, ref: b.id });
    }
  });
  for (const w of [...walls, ...pr.walls]) {
    const c = lerp(w.a, w.b, 0.5);
    const L = dist(w.a, w.b);
    if (L < 0.2) continue;
    colliders.push({ obb: { x: c.x, z: c.z, hw: L / 2, hd: 0.15, ux: (w.b.x - w.a.x) / L, uz: (w.b.z - w.a.z) / L }, y0: 0, y1: w.h, ref: -1 });
  }
  const circles: Circle[] = [];
  for (const q of pr.props) {
    const r = q.kind === 'lamp' || q.kind === 'signal' || q.kind === 'hydrant' ? 0.25 : q.kind === 'tree' || q.kind === 'palm' || q.kind === 'conifer' ? 0.4
      : q.kind === 'fountain' ? 4 * q.s : q.kind === 'statue' ? 1.6 : q.kind === 'pump' ? 0.6 : q.kind === 'kiosk' ? 2 : 0;
    if (r) circles.push({ x: round2(q.x), z: round2(q.z), r });
  }

  // spawn points
  const spawns: Spawn[] = [];
  const start = net.nodes.filter((n) => n.signal).sort((a, b) => dist(a, site.centre) - dist(b, site.centre))[0] ?? net.nodes[0];
  const lane = lanes.find((l) => l.from === start.id) ?? lanes[0];
  if (lane) {
    const a = alongPolyline(lane.pts, Math.min(8, lane.len / 2));
    spawns.push({ kind: 'start', x: a.p.x, y: 0, z: a.p.z, h: Math.atan2(a.d.x, a.d.z), ref: lane.id, name: 'start' });
  }
  pr.parking.forEach((s, i) => { if (!s.taken) spawns.push({ kind: 'parking', x: s.x, y: 0, z: s.z, h: s.h, ref: i, name: '' }); });
  for (const b of buildings) {
    spawns.push({ kind: 'door', x: b.door.x, y: 0.15, z: b.door.z, h: b.door.h, ref: b.id, name: b.type });
    if (b.roofAccess) spawns.push({ kind: 'rooftop', x: b.roofAccess.roof.x, y: b.roofAccess.y, z: b.roofAccess.roof.z, h: 0, ref: b.id, name: b.type });
    if (b.landmark === 'gas') spawns.push({ kind: 'gas', x: b.obb.x, y: 0.15, z: b.obb.z, h: 0, ref: b.id, name: 'gas station' });
    if (b.landmark === 'tower') {
      spawns.push({ kind: 'landmark', x: b.obb.x, y: b.h, z: b.obb.z, h: 0, ref: b.id, name: 'tallest tower' });
      // its roof is reachable too
      if (!b.roofAccess) b.roofAccess = { door: { x: b.door.x, z: b.door.z }, roof: obbPoint(b.parts[b.parts.length - 1].obb, 0, 0), y: b.h };
    }
  }
  for (const bl of blocks) {
    if (bl.kind === 'park') spawns.push({ kind: 'park', x: bl.c.x, y: 0.15, z: bl.c.z, h: 0, ref: bl.id, name: 'park' });
    if (bl.kind === 'plaza' && bl.area > 2500) spawns.push({ kind: 'plaza', x: bl.c.x, y: 0.15, z: bl.c.z, h: 0, ref: bl.id, name: 'plaza' });
  }
  for (const E of net.edges) if (E.bridge) {
    const m = alongPolyline(E.pts, E.len / 2);
    spawns.push({ kind: 'bridge', x: m.p.x, y: 0, z: m.p.z, h: Math.atan2(m.d.x, m.d.z), ref: E.id, name: E.name });
  }
  for (const q of pr.props) if (q.kind === 'crane') spawns.push({ kind: 'dock', x: q.x, y: 0.15, z: q.z, h: q.h, ref: -1, name: 'crane' });

  const plan: CityPlan = {
    version: PLAN_VERSION, seed, size: S, style: style.id, land: site.land, centre: site.centre,
    nodes: net.nodes, edges: net.edges, blocks, lots, buildings, props: pr.props, walls: [...walls, ...pr.walls], parking: pr.parking,
    lanes, connectors, walk, signals, spawns, colliders, circles, water, ms: 0,
  };
  plan.ms = Math.round((now() - t0) * 10) / 10;
  void p; void add; void mul; void centroid;
  return plan;
}

/** A stable hash of a plan's content (generation time left out). */
export function planHash(plan: CityPlan): string {
  return hashString(JSON.stringify({ ...plan, ms: 0 }));
}

/** Rough numbers for a stats line. */
export function planStats(plan: CityPlan): Record<string, number> {
  const count = (k: string) => plan.blocks.filter((b) => b.kind === k).length;
  return {
    size: plan.size, nodes: plan.nodes.length, edges: plan.edges.length, blocks: count('block'), parks: count('park'), plazas: count('plaza'),
    lots: plan.lots.length, buildings: plan.buildings.length, props: plan.props.length, lanes: plan.lanes.length, connectors: plan.connectors.length,
    bridges: plan.edges.filter((e) => e.bridge).length, signals: plan.nodes.filter((n) => n.signal).length,
    roundabouts: plan.nodes.filter((n) => n.island > 0).length, deadEnds: plan.nodes.filter((n) => n.kind === 'end').length,
    tallest: Math.round(Math.max(0, ...plan.buildings.map((b) => b.h))), ms: plan.ms,
  };
}

export const centreOf = (plan: CityPlan): P => plan.centre;
