// City generator: generateCity() turns a seed and a style into a CityPlan, plain data and fully
// deterministic: the same options always give the same plan (planHash() proves it), another
// seed a clearly different city. No three.js here, so it runs headless in Node for tests and
// bots; CityView (view.ts) draws a plan.
import { type P, p, dist, centroid, obbPoint, round2, alongPolyline, offsetPolyline, signedArea, pointInPoly, unit, sub, dot } from './geom';
import { rng, hashString } from './rng';
import { STYLES } from './styles';
import { makeSite, buildNetwork, type Site, type Network } from './roads';
import { makeBlocks, makeLots, makeBuildings, interiorPoint } from './blocks';
import { makeLanes, makeWalk } from './traffic';
import { makeProps } from './props';
import { makeCoast } from './coast';
import { makeTerrain, TERRAIN, type Terrain, type TerrainParams } from './terrain';
import type { CityOptions, CityPlan, DistrictKind, Spawn, Collider, Circle, Water, Block, Poi, PoiKind, ShopKind } from './types';
import { DISTRICTS } from './types';

export const PLAN_VERSION = 2;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const terrains = new WeakMap<CityPlan, Terrain>();

/** The plan's height field (built once per plan and cached). */
export function terrainOf(plan: CityPlan): Terrain {
  let t = terrains.get(plan);
  if (!t) {
    const sea = plan.terrain.sea ? plan.water.polys[plan.water.polys.length - 1] : null;
    t = makeTerrain(plan.size, plan.terrain, plan.water.polys, sea, plan.land);
    terrains.set(plan, t);
  }
  return t;
}

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

  // water outlines, then the terrain over them
  const water: Water = { polys: [], beaches: site.beaches, level: -0.7 };
  if (site.river) water.polys.push(riverPoly(site));
  if (site.sea) water.polys.push(site.sea);
  const terrainParams: TerrainParams = { ...TERRAIN[style.id], seed: seed ^ 0x7e11, sea: !!site.sea };
  const T = makeTerrain(S, terrainParams, water.polys, site.sea, site.land);

  const mainStreet = pickMainStreet(net, blocks, site);
  const lots = makeLots(blocks, net, site, rnd.fork(4));
  const { buildings, walls } = makeBuildings(lots, blocks, net, site, rnd.fork(5), opts.height ?? 1, T, mainStreet);
  const { lanes, connectors, signals } = makeLanes(net);
  const coast = makeCoast(site, rnd.fork(7));
  const walk = makeWalk(net, blocks, coast.decks);
  const pr = makeProps(net, blocks, lots, buildings, signals, site, rnd.fork(6), coast, mainStreet);
  const H = (x: number, z: number) => Math.round(T.h(x, z) * 100) / 100;

  // colliders: the ground masses of the buildings, walls, poles and trunks (heights absolute)
  const colliders: Collider[] = [];
  buildings.forEach((b) => {
    for (const q of b.parts) {
      if ((q.kind === 'mass' || q.kind === 'garage' || q.kind === 'chimney') && q.y0 < 2) colliders.push({ obb: q.obb, y0: round2(b.y + q.y0), y1: round2(b.y + q.y1), ref: b.id });
    }
  });
  for (const w of [...walls, ...pr.walls]) {
    const c = p((w.a.x + w.b.x) / 2, (w.a.z + w.b.z) / 2);
    const L = dist(w.a, w.b);
    if (L < 0.2) continue;
    const y = w.kind === 'railing' && coast.decks.some((d) => pointInPoly(c, deckPoly(d))) ? deckY(coast.decks, c) : H(c.x, c.z) + 0.15;
    colliders.push({ obb: { x: c.x, z: c.z, hw: L / 2, hd: 0.15, ux: (w.b.x - w.a.x) / L, uz: (w.b.z - w.a.z) / L }, y0: round2(y), y1: round2(y + w.h), ref: -1 });
  }
  const circles: Circle[] = [];
  const RADIUS: Partial<Record<string, number>> = {
    lamp: 0.25, signal: 0.25, hydrant: 0.25, tree: 0.4, palm: 0.4, conifer: 0.4, statue: 1.6, pump: 0.6, kiosk: 2, hut: 1.3, lifeguard: 1.3,
    cafe: 0.9, bollard: 0.15, kplanter: 1, busstop: 0.3,
  };
  for (const q of pr.props) {
    const r = q.kind === 'fountain' ? 4 * q.s : RADIUS[q.kind] ?? 0;
    if (r) circles.push({ x: round2(q.x), z: round2(q.z), r });
  }
  if (coast.lighthouse) circles.push({ x: round2(coast.lighthouse.x), z: round2(coast.lighthouse.z), r: 3.3 });

  // spawn points
  const spawns: Spawn[] = [];
  const start = net.nodes.filter((n) => n.signal).sort((a, b) => dist(a, site.centre) - dist(b, site.centre))[0] ?? net.nodes[0];
  const lane = lanes.find((l) => l.from === start.id) ?? lanes[0];
  if (lane) {
    const a = alongPolyline(lane.pts, Math.min(8, lane.len / 2));
    spawns.push({ kind: 'start', x: a.p.x, y: H(a.p.x, a.p.z), z: a.p.z, h: Math.atan2(a.d.x, a.d.z), ref: lane.id, name: 'start' });
  }
  pr.parking.forEach((s, i) => { if (!s.taken) spawns.push({ kind: 'parking', x: s.x, y: H(s.x, s.z), z: s.z, h: s.h, ref: i, name: '' }); });
  for (const b of buildings) {
    for (const d of b.doors) if (d.kind !== 'back') spawns.push({ kind: 'door', x: d.x, y: d.y, z: d.z, h: d.h, ref: b.id, name: b.type });
    if (b.roofAccess) spawns.push({ kind: 'rooftop', x: b.roofAccess.roof.x, y: round2(b.y + b.roofAccess.y), z: b.roofAccess.roof.z, h: 0, ref: b.id, name: b.type });
    if (b.landmark === 'gas') spawns.push({ kind: 'gas', x: b.obb.x, y: b.y, z: b.obb.z, h: 0, ref: b.id, name: 'gas station' });
    if (b.landmark === 'tower') {
      spawns.push({ kind: 'landmark', x: b.obb.x, y: round2(b.y + b.h), z: b.obb.z, h: 0, ref: b.id, name: 'tallest tower' });
      // its roof is reachable too
      if (!b.roofAccess) b.roofAccess = { door: { x: b.door.x, z: b.door.z }, roof: obbPoint(b.parts[b.parts.length - 1].obb, 0, 0), y: b.h };
    }
  }
  for (const bl of blocks) {
    if (bl.kind === 'park') spawns.push({ kind: 'park', x: bl.c.x, y: H(bl.c.x, bl.c.z) + 0.15, z: bl.c.z, h: 0, ref: bl.id, name: 'park' });
    if (bl.kind === 'plaza' && bl.area > 2500) spawns.push({ kind: 'plaza', x: bl.c.x, y: H(bl.c.x, bl.c.z) + 0.15, z: bl.c.z, h: 0, ref: bl.id, name: 'plaza' });
  }
  for (const E of net.edges) if (E.bridge) {
    const m = alongPolyline(E.pts, E.len / 2);
    spawns.push({ kind: 'bridge', x: m.p.x, y: 0, z: m.p.z, h: Math.atan2(m.d.x, m.d.z), ref: E.id, name: E.name });
  }
  for (const q of pr.props) if (q.kind === 'crane') spawns.push({ kind: 'dock', x: q.x, y: H(q.x, q.z) + 0.15, z: q.z, h: q.h, ref: -1, name: 'crane' });
  coast.decks.forEach((d, i) => {
    const h = Math.atan2(d.b.x - d.a.x, d.b.z - d.a.z);
    if (d.kind === 'pier') spawns.push({ kind: 'pier', x: d.b.x, y: d.y, z: d.b.z, h: h + Math.PI, ref: i, name: 'pier head' });
    if (d.kind === 'jetty') spawns.push({ kind: 'marina', x: d.a.x, y: d.y, z: d.a.z, h, ref: i, name: 'jetty' });
  });
  site.beaches.forEach((b, i) => { const c = interiorPoint(b); spawns.push({ kind: 'beach', x: round2(c.x), y: -0.4, z: round2(c.z), h: 0, ref: i, name: 'beach' }); });

  const plan: CityPlan = {
    version: PLAN_VERSION, seed, size: S, style: style.id, land: site.land, centre: site.centre,
    nodes: net.nodes, edges: net.edges, blocks, lots, buildings, props: pr.props, walls: [...walls, ...pr.walls], parking: pr.parking,
    lanes, connectors, walk, signals, spawns, colliders, circles, water, terrain: terrainParams,
    decks: coast.decks, lighthouse: coast.lighthouse, mainStreet, pois: [], ms: 0,
  };
  plan.pois = makePois(plan, T);
  terrains.set(plan, T);
  plan.ms = Math.round((now() - t0) * 10) / 10;
  return plan;
}

/** The river as one polygon: its centreline runs on past the city; inland ends narrow to a stream. */
function riverPoly(site: Site): P[] {
  const { S } = site;
  const rp = site.river!.pts, half = site.river!.half;
  const n = rp.length;
  const taper = Math.max(150, S * 0.3 - 160);
  const extend = (a: P, b: P, sign: number): { pts: P[]; w: number[] } => {
    // past the end a (b is the point before it): on into the sea, or narrowing inland
    const d = unit(sub(a, b));
    const sea = site.sea && pointInPoly(a, site.sea);
    const pts: P[] = [], w: number[] = [];
    const L = sea ? S : taper;
    const nrmD = p(-d.z, d.x);
    for (let t = 20; t <= L; t += 20) {
      const k = t / L;
      const wig = sea ? 0 : Math.sin(k * Math.PI * 1.6 + sign) * 26 * k;
      pts.push(p(a.x + d.x * t + nrmD.x * wig, a.z + d.z * t + nrmD.z * wig));
      w.push(sea ? half : Math.max(1.2, half * Math.pow(1 - k, 1.4)));
    }
    return { pts, w };
  };
  const e0 = extend(rp[0], rp[1], 1), e1 = extend(rp[n - 1], rp[n - 2], -1);
  const pts = [...e0.pts.reverse(), ...rp, ...e1.pts];
  const ws = [...e0.w.reverse(), ...rp.map(() => half), ...e1.w];
  // offset by each point's own width (mitred at the bends)
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d = unit(sub(b, a));
    const nn = p(-d.z, d.x);
    left.push(p(pts[i].x + nn.x * ws[i], pts[i].z + nn.z * ws[i]));
    right.push(p(pts[i].x - nn.x * ws[i], pts[i].z - nn.z * ws[i]));
  }
  void offsetPolyline;
  const poly = [...left, ...right.reverse()];
  return signedArea(poly) < 0 ? poly.reverse() : poly;
}

/**
 * The main street: a street or avenue between shops near the centre (on the coast, one that runs
 * down towards the sea). Its lots all get shopfronts, awnings and café tables.
 */
function pickMainStreet(net: Network, blocks: Block[], site: Site): number {
  const R = site.S * site.style.downtown;
  const seaDir = site.coast ? unit(sub(site.coast.toWorld(0, -1), site.coast.toWorld(0, 0))) : null;
  let best = -1, bs = -Infinity;
  for (const E of net.edges) {
    if (E.bridge || (E.cls !== 'avenue' && E.cls !== 'street') || E.len < 90) continue;
    const fN = E.faceN >= 0 ? blocks[E.faceN] : null, fS = E.faceS >= 0 ? blocks[E.faceS] : null;
    if (!fN || !fS || fN.kind !== 'block' || fS.kind !== 'block') continue;
    const mid = alongPolyline(E.pts, E.len / 2).p;
    const shoppy = (b: Block) => (b.district === 'downtown' || b.district === 'commercial' ? 1.5 : 0);
    let s = shoppy(fN) + shoppy(fS) - dist(mid, site.centre) / (R * 1.5) + Math.min(E.len, 300) / 300;
    if (seaDir) {
      const d = unit(sub(E.pts[E.pts.length - 1], E.pts[0]));
      s += 1.4 * Math.abs(dot(d, seaDir));
    }
    if (s > bs) { bs = s; best = E.id; }
  }
  return best;
}

const deckPoly = (d: { a: P; b: P; half: number; head: number }): P[] => {
  const L = dist(d.a, d.b) || 1;
  const ux = (d.b.x - d.a.x) / L, uz = (d.b.z - d.a.z) / L, nx = -uz, nz = ux;
  const w = Math.max(d.half, d.head);
  return [p(d.a.x + nx * w, d.a.z + nz * w), p(d.b.x + nx * w + ux * 10, d.b.z + nz * w + uz * 10), p(d.b.x - nx * w + ux * 10, d.b.z - nz * w + uz * 10), p(d.a.x - nx * w, d.a.z - nz * w)];
};
const deckY = (decks: { a: P; b: P; half: number; head: number; y: number }[], q: P): number => decks.find((d) => pointInPoly(q, deckPoly(d)))?.y ?? 0.15;

const SHOP_NAMES: Record<ShopKind, [string, string]> = {
  cafe: ['Café', 'Kafe'], bakery: ['Bakery', 'Fırın'], grocery: ['Grocery', 'Bakkal'], pharmacy: ['Pharmacy', 'Eczane'],
  books: ['Bookshop', 'Kitapçı'], boutique: ['Boutique', 'Butik'], icecream: ['Ice cream parlour', 'Dondurmacı'],
  restaurant: ['Restaurant', 'Lokanta'], bank: ['Bank', 'Banka'], bikes: ['Bike rental', 'Bisiklet kiralama'],
  surf: ['Surf shop', 'Sörf dükkânı'], hardware: ['Hardware store', 'Hırdavatçı'],
};

/** The plan's named places, for missions. */
function makePois(plan: CityPlan, T: Terrain): Poi[] {
  const out: Poi[] = [];
  const H = (x: number, z: number) => Math.round((T.h(x, z) + 0.15) * 100) / 100;
  const add = (id: string, kind: PoiKind, en: string, tr: string, x: number, z: number, h: number, r: number, ref: number, y = H(x, z)) =>
    out.push({ id, kind, name: { en, tr }, x: round2(x), y, z: round2(z), h: round2(h), r: Math.round(r), ref });
  if (plan.lighthouse) add('lighthouse', 'lighthouse', 'Lighthouse', 'Deniz feneri', plan.lighthouse.x, plan.lighthouse.z, plan.lighthouse.h, 8, -1, plan.lighthouse.y);
  plan.decks.forEach((d, i) => {
    const h = Math.atan2(d.b.x - d.a.x, d.b.z - d.a.z);
    if (d.kind === 'pier') {
      add('pier', 'pier', 'Pier', 'İskele', (d.a.x + d.b.x) / 2, (d.a.z + d.b.z) / 2, h, dist(d.a, d.b) / 2, i, d.y);
      add('pier-cafe', 'cafe', 'Pier café', 'İskele kafesi', d.b.x, d.b.z, h, 10, i, d.y);
    }
  });
  const jetties = plan.decks.filter((d) => d.kind === 'jetty');
  if (jetties.length) {
    const c = centroid(jetties.map((d) => p((d.a.x + d.b.x) / 2, (d.a.z + d.b.z) / 2)));
    add('marina', 'marina', 'Marina', 'Marina', c.x, c.z, 0, 60, plan.decks.indexOf(jetties[0]), jetties[0].y);
  }
  plan.water.beaches.forEach((b, i) => {
    const c = interiorPoint(b);
    const n = plan.water.beaches.length > 1 ? ` ${i + 1}` : '';
    add(`beach-${i}`, 'beach', 'Beach' + n, 'Plaj' + n, c.x, c.z, 0, Math.sqrt(Math.abs(signedArea(b))) / 2, i, -0.4);
  });
  const pier = plan.decks.find((d) => d.kind === 'pier');
  if (pier) add('promenade', 'promenade', 'Promenade', 'Sahil yolu', pier.a.x, pier.a.z, 0, 40, -1);
  if (plan.mainStreet >= 0) {
    const E = plan.edges[plan.mainStreet];
    const m = alongPolyline(E.pts, E.len / 2);
    add('main-street', 'mainstreet', 'Main Street', 'Çarşı caddesi', m.p.x, m.p.z, Math.atan2(m.d.x, m.d.z), E.len / 2, E.id);
  }
  const parks = plan.blocks.filter((b) => b.kind === 'park').sort((a, b) => b.area - a.area);
  parks.forEach((b, i) => add(`park-${b.id}`, 'park', i === 0 ? 'City Park' : 'Park', i === 0 ? 'Kent parkı' : 'Park', b.c.x, b.c.z, 0, Math.sqrt(b.area) / 2, b.id));
  const plazas = plan.blocks.filter((b) => b.kind === 'plaza' && b.area > 1500).sort((a, b) => b.area - a.area);
  plazas.forEach((b, i) => add(`plaza-${b.id}`, 'plaza', i === 0 ? 'Town Square' : 'Square', i === 0 ? 'Kent meydanı' : 'Meydan', b.c.x, b.c.z, 0, Math.sqrt(b.area) / 2, b.id));
  plan.props.forEach((q, i) => {
    if (q.kind === 'fountain') add(`fountain-${i}`, 'fountain', 'Fountain', 'Fıskiye', q.x, q.z, 0, 5 * q.s, -1);
    if (q.kind === 'busstop') add(`bus-${i}`, 'busstop', 'Bus stop', 'Otobüs durağı', q.x, q.z, q.h, 3, -1);
    if (q.kind === 'crane') add(`docks-${i}`, 'docks', 'Docks', 'Rıhtım', q.x, q.z, q.h, 30, -1);
  });
  for (const b of plan.buildings) {
    const d = b.doors.find((x) => x.kind !== 'back') ?? b.doors[0];
    if (b.shop && d) {
      const [en, tr] = SHOP_NAMES[b.shop];
      add(`shop-${b.id}`, b.shop === 'cafe' || b.shop === 'restaurant' || b.shop === 'icecream' ? 'cafe' : 'shop', en, tr, d.x, d.z, d.h + Math.PI, 4, b.id, d.y);
    }
    if (b.landmark === 'gas') add(`gas-${b.id}`, 'gas', 'Gas station', 'Benzin istasyonu', b.obb.x, b.obb.z, 0, 15, b.id, b.y);
    if (b.landmark === 'tower') add('tower', 'tower', 'City Tower', 'Kent kulesi', b.door.x, b.door.z, b.door.h + Math.PI, 20, b.id, b.y);
  }
  for (const E of plan.edges) if (E.bridge) {
    const m = alongPolyline(E.pts, E.len / 2);
    add(`bridge-${E.id}`, 'bridge', E.name || 'Bridge', E.name || 'Köprü', m.p.x, m.p.z, Math.atan2(m.d.x, m.d.z), E.len / 2, E.id, 0);
  }
  return out;
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
    lots: plan.lots.length, buildings: plan.buildings.length, kit: plan.buildings.filter((b) => b.kit).length, props: plan.props.length, lanes: plan.lanes.length, connectors: plan.connectors.length,
    bridges: plan.edges.filter((e) => e.bridge).length, signals: plan.nodes.filter((n) => n.signal).length,
    roundabouts: plan.nodes.filter((n) => n.island > 0).length, deadEnds: plan.nodes.filter((n) => n.kind === 'end').length,
    pois: plan.pois.length, decks: plan.decks.length,
    tallest: Math.round(Math.max(0, ...plan.buildings.map((b) => b.h))), ms: plan.ms,
  };
}

export const centreOf = (plan: CityPlan): P => plan.centre;
