// City generator: the road network. Draws the skeleton (perimeter, coast promenade, river
// banks, ring road, avenues, diagonals, the zones' street grids, alleys, cul-de-sacs) into a
// planar graph, cleans it (stubs, short edges, sharp angles), picks the bridges, collapses
// chains into street polylines and computes the junctions (trims, kerb corners with rounded
// fillets, roundabouts) and the blocks' kerb outlines. Pure data.
import { Graph } from './graph';
import {
  type P, p, add, sub, mul, dot, cross, dist, unit, nrm, lerp, angleOf, fromAngle, signedArea, centroid, pointInPoly,
  segDist, selfIntersects, removeLoops, firstCrossing, clipHalf, clipSegConvex, lineX, polylineLength, offsetPolyline, wrap2pi, alongPolyline, clamp,
} from './geom';
import { type Rng, fbm, noise2 } from './rng';
import type { StyleDef } from './styles';
import type { RoadClass, RoadEdge, RoadNode, DistrictKind } from './types';

export const LANE_W = 3.4;
export const PARK_W = 2.3;

export interface RoadDims { lanes: number; median: number; half: number; parking: boolean }

export function roadDims(cls: RoadClass, parking: boolean, bridge: boolean): RoadDims {
  switch (cls) {
    case 'boulevard': return { lanes: 2, median: 4, half: 2 * LANE_W + 2 + 0.6, parking: false };
    case 'avenue': return { lanes: 2, median: 0, half: 2 * LANE_W + 0.6, parking: false };
    case 'street': {
      const pk = parking && !bridge;
      return { lanes: 1, median: 0, half: LANE_W + (pk ? PARK_W : 0) + 0.4, parking: pk };
    }
    default: return { lanes: 1, median: 0, half: 2.9, parking: false };
  }
}

const PRI: Record<RoadClass, number> = { boulevard: 2, avenue: 3, street: 5, alley: 6 };

/** Everything the layout knows about the land before roads exist. */
export interface Site {
  S: number;
  style: StyleDef;
  centre: P;
  /** Land polygon: the perimeter road's centreline. */
  land: P[];
  river: { pts: P[]; half: number } | null;
  /** Sea polygon (beyond the city as well) and the shore line. */
  sea: P[] | null;
  shore: P[] | null;
  /** Sand strips between the promenade and the sea. */
  beaches: P[][];
  /** District weights after the player's mix. */
  weights: Record<DistrictKind, number>;
  seed: number;
  inWater(q: P): boolean;
  /** Distance to the nearest water (river or sea). */
  waterDist(q: P): number;
  district(q: P): DistrictKind;
}

// ------------------------------------------------------------------ the site

export function makeSite(S: number, style: StyleDef, rnd: Rng, seed: number, weights: Record<DistrictKind, number>, water: StyleDef['water']): Site {
  const m = 26; // perimeter road inset
  const centre = p(S * rnd.range(0.42, 0.58), S * rnd.range(0.42, 0.58));
  const coastSide = rnd.int(0, 3);
  // local (u along the shore, v inland from the coast side) → world
  const toWorld = (u: number, v: number): P => {
    switch (coastSide) {
      case 0: return p(u, v);
      case 1: return p(S - v, u);
      case 2: return p(S - u, S - v);
      default: return p(v, S - u);
    }
  };
  const hasCoast = water === 'coast' || water === 'both';
  const hasRiver = water === 'river' || water === 'both';
  const shoreSeed = rnd.int(1, 1e6);
  const shoreV = (u: number) => S * 0.13 + (fbm(shoreSeed, u, 0, S * 0.35, 3) - 0.5) * S * 0.16 + Math.sin(u / S * Math.PI * 2 + shoreSeed) * S * 0.03;
  const beachW = style.beach ? 26 : 0;
  let land: P[];
  let sea: P[] | null = null, shore: P[] | null = null;
  if (hasCoast) {
    // keep downtown away from the sea: move the centre inland if needed
    land = [];
    const N = 40;
    const prom: P[] = [];
    for (let i = 0; i <= N; i++) {
      const u = m + (S - 2 * m) * (i / N);
      prom.push(toWorld(u, Math.max(m, shoreV(u) + beachW + 10)));
    }
    land = [...prom, toWorld(S - m, S - m), toWorld(m, S - m)];
    shore = [];
    const ext = S * 0.6;
    for (let i = -N; i <= 2 * N; i++) {
      const u = (S * i) / N;
      shore.push(toWorld(u, shoreV(clamp(u, 0, S))));
    }
    sea = [...shore, toWorld(2 * S, -ext * 4), toWorld(-S, -ext * 4)];
    if (signedArea(sea) < 0) sea.reverse();
  } else {
    land = [p(m, m), p(S - m, m), p(S - m, S - m), p(m, S - m)];
  }
  if (signedArea(land) < 0) land.reverse();

  let river: Site['river'] = null;
  if (hasRiver) {
    const half = rnd.range(style.riverWidth[0], style.riverWidth[1]) / 2;
    const pts: P[] = [];
    const rs = rnd.int(1, 1e6);
    const amp = S * rnd.range(0.05, 0.09), wl = S * rnd.range(0.55, 0.9), ph = rnd.range(0, 6.28);
    if (hasCoast) {
      // from inland to the sea, roughly across the coast
      const u0 = S * rnd.range(0.3, 0.7);
      for (let v = S + 120; v >= shoreV(u0) - 160; v -= 20) {
        const u = u0 + Math.sin(v / wl * Math.PI * 2 + ph) * amp + (fbm(rs, v, 0, 260, 2) - 0.5) * 60;
        pts.push(toWorld(u, v));
      }
    } else {
      // across the city, away from the exact centre (downtown sits on one bank)
      const alongX = rnd.chance(0.5);
      const off = S * (rnd.chance(0.5) ? rnd.range(0.32, 0.42) : rnd.range(0.58, 0.68));
      for (let t = -120; t <= S + 120; t += 20) {
        const o = off + Math.sin(t / wl * Math.PI * 2 + ph) * amp + (fbm(rs, t, 0, 260, 2) - 0.5) * 60;
        pts.push(alongX ? p(t, o) : p(o, t));
      }
    }
    river = { pts, half };
  }

  const inSea = (q: P) => !!sea && pointInPoly(q, sea);
  // water segments bucketed on a grid, so distance queries only look near
  const CAP = 320, CELLW = 64;
  const buckets = new Map<number, [P, P, number][]>();
  const addSegs = (pts: P[], kind: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const x0 = Math.floor((Math.min(a.x, b.x) - CAP) / CELLW), x1 = Math.floor((Math.max(a.x, b.x) + CAP) / CELLW);
      const z0 = Math.floor((Math.min(a.z, b.z) - CAP) / CELLW), z1 = Math.floor((Math.max(a.z, b.z) + CAP) / CELLW);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = (cx + 1000) * 4000 + cz + 1000;
        let l = buckets.get(k);
        if (!l) buckets.set(k, (l = []));
        l.push([a, b, kind]);
      }
    }
  };
  if (river) addSegs(river.pts, 0);
  if (shore) addSegs(shore, 1);
  const near = (q: P) => buckets.get((Math.floor(q.x / CELLW) + 1000) * 4000 + Math.floor(q.z / CELLW) + 1000);
  const riverDist = (q: P) => {
    let best = CAP;
    for (const [a, b, k] of near(q) ?? []) if (k === 0) best = Math.min(best, segDist(q, a, b).d - river!.half);
    return best;
  };
  const shoreDist = (q: P) => {
    let best = CAP;
    for (const [a, b, k] of near(q) ?? []) if (k === 1) best = Math.min(best, segDist(q, a, b).d);
    return inSea(q) ? -best : best;
  };
  const beaches: P[][] = [];
  if (hasCoast && style.beach) {
    const N = 40;
    const runs: { a: P; b: P }[][] = [[]];
    for (let i = 0; i <= N; i++) {
      const u = m + (S - 2 * m) * (i / N);
      const vp = Math.max(m, shoreV(u) + beachW + 10);
      // the sand starts under the promenade's outer sidewalk (it slopes down from y = -0.1)
      const a = toWorld(u, vp - 2);
      const b = toWorld(u, shoreV(u) - 8);
      const wet = river && Math.min(...river.pts.map((q) => dist(q, a))) < river.half + 30;
      if (wet || vp - shoreV(u) < beachW) { if (runs[runs.length - 1].length) runs.push([]); continue; }
      runs[runs.length - 1].push({ a, b });
    }
    for (const r of runs) {
      if (r.length < 2) continue;
      // first half along the promenade, second half back along the water (CityView slopes it)
      beaches.push([...r.map((x) => x.a), ...r.map((x) => x.b).reverse()]);
    }
  }
  const site: Site = {
    S, style, centre, land, river, sea, shore, beaches, weights, seed,
    inWater: (q) => inSea(q) || riverDist(q) < 0,
    waterDist: (q) => Math.min(riverDist(q), shoreDist(q)),
    district: () => 'residential',
  };
  // downtown must not sit in the water: walk it inland
  for (let k = 0; k < 30 && site.waterDist(site.centre) < S * style.downtown * 0.6; k++) {
    site.centre = lerp(site.centre, p(S / 2, S / 2), 0.15);
    if (sea) {
      const c = centroid(land);
      site.centre = lerp(site.centre, c, 0.12);
    }
  }
  site.district = districtField(site);
  return site;
}

/** The district field: which district a point belongs to (smooth, noisy borders). */
function districtField(site: Site): (q: P) => DistrictKind {
  const { S, style, weights, seed } = site;
  const R = S * style.downtown;
  const indSeed = seed ^ 0x5151;
  return (q: P) => {
    const d = dist(q, site.centre) / R;
    const n = (fbm(seed ^ 0x77, q.x, q.z, 140, 2) - 0.5) * 0.7;
    const dd = d + n;
    const wd = site.waterDist(q);
    const sc: [DistrictKind, number][] = [
      ['downtown', weights.downtown * 2.2 * Math.exp(-dd * dd * 1.2)],
      ['commercial', weights.commercial * 0.95 * Math.exp(-((dd - 1.35) ** 2) / 0.6)],
      ['residential', weights.residential * 0.85 * Math.exp(-((dd - 2.3) ** 2) / 1.8)],
      ['suburban', weights.suburban * 0.8 * clamp((dd - 2.2) / 1.5, 0, 1)],
      ['industrial', weights.industrial * 1.25 * clamp((fbm(indSeed, q.x, q.z, S * 0.35, 2) - 0.52) * 6, 0, 1) * clamp(dd - 1.1, 0, 1)],
      ['docks', weights.docks * 1.6 * clamp(1 - wd / 140, 0, 1) * clamp(dd - 1.3, 0, 1) * (fbm(indSeed + 9, q.x, q.z, 500, 1) > 0.45 ? 1 : 0.2)],
    ];
    let best: DistrictKind = 'residential', bv = -1;
    for (const [k, v] of sc) if (v > bv) { bv = v; best = k; }
    return best;
  };
}

// ------------------------------------------------------------------ the skeleton

interface Line { pts: P[]; cls: RoadClass; pri: number; closed?: boolean; tag: number }

const TAG = { perimeter: 1, bank: 2, ring: 3, avenue: 4, zone: 5, grid: 6, alley: 7, culdesac: 8 } as const;

function voronoiCells(seeds: P[], box: P[]): P[][] {
  return seeds.map((s, i) => {
    let poly = box;
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const m = lerp(s, seeds[j], 0.5);
      const d = unit(sub(seeds[j], s));
      // keep the side of the bisector towards s: line through m along nrm(d)... N side check
      const a = add(m, mul(nrm(d), -1)), b = add(m, nrm(d));
      // clipHalf keeps the N side of a→b; nrm(b - a) = nrm(nrm(d)) = -d, i.e. towards s
      poly = clipHalf(poly, a, b);
      if (poly.length < 3) break;
    }
    return poly;
  });
}

function skeleton(site: Site, rnd: Rng): Line[] {
  const { S, style } = site;
  const lines: Line[] = [];
  lines.push({ pts: [...site.land, site.land[0]], cls: 'avenue', pri: 0, closed: true, tag: TAG.perimeter });
  if (site.river) {
    const h = site.river.half + 5 + roadDims('street', false, false).half;
    for (const s of [1, -1]) {
      const pts = offsetPolyline(site.river.pts, s * h);
      lines.push({ pts, cls: 'street', pri: 1, tag: TAG.bank });
    }
  }
  if (style.ring) {
    const rx = S * rnd.range(0.2, 0.25), rz = rx * rnd.range(0.72, 0.95), rot = rnd.range(0, Math.PI);
    const pts: P[] = [];
    const ws = rnd.int(1, 1e6);
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const w = 1 + (noise2(ws, Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3) - 0.5) * 0.18;
      const lx = Math.cos(a) * rx * w, lz = Math.sin(a) * rz * w;
      pts.push(p(site.centre.x + lx * Math.cos(rot) - lz * Math.sin(rot), site.centre.z + lx * Math.sin(rot) + lz * Math.cos(rot)));
    }
    pts[64] = pts[0];
    lines.push({ pts, cls: 'boulevard', pri: 2, closed: true, tag: TAG.ring });
  }
  // grid zones
  const theta0 = rnd.range(0, Math.PI / 2);
  const seeds: P[] = [site.centre];
  for (let k = 1; k < style.zones; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rnd.range(0, Math.PI * 2), r = S * rnd.range(0.3, 0.42);
      const q = add(site.centre, fromAngle(a, r));
      if (q.x < S * 0.1 || q.x > S * 0.9 || q.z < S * 0.1 || q.z > S * 0.9) continue;
      if (seeds.some((s) => dist(s, q) < S * 0.3)) continue;
      seeds.push(q);
      break;
    }
  }
  const box = [p(-10, -10), p(S + 10, -10), p(S + 10, S + 10), p(-10, S + 10)];
  const cells = voronoiCells(seeds, box);
  // zone borders become avenues
  const seen = new Set<string>();
  cells.forEach((cell) => {
    for (let i = 0; i < cell.length; i++) {
      const a = cell[i], b = cell[(i + 1) % cell.length];
      const onBox = (q: P) => q.x < -5 || q.z < -5 || q.x > S + 5 || q.z > S + 5;
      if (onBox(a) && onBox(b)) continue;
      const k = [a, b].map((q) => `${Math.round(q.x)},${Math.round(q.z)}`).sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push({ pts: [a, b], cls: 'avenue', pri: 4, tag: TAG.zone });
    }
  });
  // diagonals from the centre
  for (let k = 0; k < style.diagonals; k++) {
    const a = theta0 + Math.PI / 4 + k * Math.PI * rnd.range(0.45, 0.6) + rnd.range(-0.15, 0.15);
    const d = fromAngle(a);
    const pts: P[] = [];
    for (let t = -S; t <= S; t += 40) pts.push(add(site.centre, mul(d, t)));
    lines.push({ pts, cls: 'avenue', pri: 3, tag: TAG.avenue });
  }
  // each zone's grid
  cells.forEach((cell, zi) => {
    if (cell.length < 3) return;
    const th = theta0 + (zi === 0 ? 0 : rnd.range(-style.angleSpread, style.angleSpread) * Math.PI / 180);
    const u = fromAngle(th), v = nrm(u);
    const o = seeds[zi];
    const spacing = (q: P, across: boolean) => {
      const dk = site.district(q);
      const [along, ac] = style.spacing[dk];
      return (across ? ac : along) * rnd.range(0.85, 1.15);
    };
    const wavA = rnd.range(0, 6.28), wavB = rnd.range(0, 6.28), wl = rnd.range(260, 460);
    for (const fam of [0, 1]) {
      const dirL = fam === 0 ? u : v; // the lines run along dirL
      const step = fam === 0 ? v : u; // and are stacked along step
      const offs: number[] = [0];
      for (const sgn of [1, -1]) {
        let off = 0;
        for (let k = 0; k < 40; k++) {
          const q = add(o, mul(step, off + sgn * 40));
          off += sgn * spacing(q, fam === 0);
          if (Math.abs(off) > S * 1.5) break;
          offs.push(off);
        }
      }
      offs.sort((a, b) => a - b);
      const zeroIdx = offs.indexOf(0);
      offs.forEach((off, idx) => {
        const base = add(o, mul(step, off));
        const a = add(base, mul(dirL, -S * 1.5)), b = add(base, mul(dirL, S * 1.5));
        const cl = clipSegConvex(a, b, cell);
        if (!cl) return;
        const pa = lerp(a, b, cl[0]), pb = lerp(a, b, cl[1]);
        const L = dist(pa, pb);
        if (L < 60) return;
        const pts: P[] = [];
        const n = Math.max(1, Math.ceil(L / 24));
        for (let i = 0; i <= n; i++) {
          const q = lerp(pa, pb, i / n);
          const t = dot(sub(q, o), dirL);
          const w = style.curvy ? Math.sin(t / wl * Math.PI * 2 + (fam ? wavB : wavA)) * style.curvy : 0;
          pts.push(add(q, mul(step, w)));
        }
        const major = (idx - zeroIdx) % 4 === 0;
        lines.push({ pts, cls: major ? 'avenue' : 'street', pri: major ? 3 : 5, tag: TAG.grid });
      });
    }
  });
  return lines;
}

// ------------------------------------------------------------------ building the graph

function sepFor(cls: RoadClass): number {
  return roadDims(cls, true, false).half;
}

export interface Network {
  g: Graph;
  nodes: RoadNode[];
  edges: RoadEdge[];
  /** Raw graph edges of each plan edge. */
  raw: number[][];
  /** Raw graph node of each plan node. */
  rawNode: number[];
  faces: Face[];
}

export interface Face {
  edges: { e: number; fwd: boolean }[];
  curb: P[];
  curbEdge: number[];
  /** Polygon of node positions (centrelines). */
  centre: P[];
  outer: boolean;
  bad?: boolean;
}

export function buildNetwork(site: Site, rnd: Rng): Network {
  const g = new Graph(9);
  const lines = skeleton(site, rnd);
  lines.sort((a, b) => a.pri - b.pri);
  lines.forEach((l, i) => {
    const sep = sepFor(l.cls) + 14;
    g.insertPolyline(l.pts, l.cls, l.pri, l.pri <= 1 ? 0 : sep, l.tag * 1000 + i);
  });
  const isPerim = (e: { line: number }) => Math.floor(e.line / 1000) === TAG.perimeter;
  // outside the land: gone
  for (const e of g.aliveEdges()) {
    if (isPerim(e)) continue;
    const m = lerp(g.nodes[e.a], g.nodes[e.b], 0.5);
    if (!pointInPoly(m, site.land)) g.removeEdge(e.id);
  }
  pickBridges(g, site, rnd);
  cleanup(g, site);
  dropSome(g, site, rnd);
  cleanup(g, site);
  addAlleysAndCuldesacs(g, site, rnd);
  cleanup(g, site, true);
  // collapse + junctions, fixing what does not fit
  let net: Network | null = null;
  for (let iter = 0; iter < 12; iter++) {
    net = collapse(g, site, rnd);
    const bad = junctions(net, site);
    const faceFix = bad.length ? [] : makeFaces(net, site);
    if (!bad.length && !faceFix.length) break;
    // after a few rounds a leftover tangle is left unbuilt (its block becomes 'void')
    if (!bad.length && iter >= 5) break;
    const pairs: [number, number][] = [];
    const drop = new Set<number>();
    const cur: Network = net;
    for (const e of bad) {
      const E = cur.edges[e];
      if (E.bridge) continue;
      if (E.len < 26) { pairs.push([cur.rawNode[E.a], cur.rawNode[E.b]]); continue; }
      // the junctions at its ends are too big for it: drop the weakest road there
      const cand = [...cur.nodes[E.a].edges, ...cur.nodes[E.b].edges].map((x) => cur.edges[x])
        .filter((x) => !x.bridge && !cur.raw[x.id].some((r) => Math.floor(g.edges[r].line / 1000) === TAG.perimeter));
      cand.sort((x, y) => PRI[y.cls] - PRI[x.cls] || x.len - y.len);
      if (cand[0]) drop.add(cand[0].id);
    }
    for (const [ra, rb] of pairs) if (g.nodes[ra].alive && g.nodes[rb].alive && ra !== rb) g.mergeNodes(ra, rb);
    for (const e of drop) for (const r of net.raw[e]) g.removeEdge(r);
    for (const e of faceFix) for (const r of net.raw[e]) g.removeEdge(r);
    cleanup(g, site, true);
  }
  return net!;
}


function pickBridges(g: Graph, site: Site, rnd: Rng): void {
  const wet = g.aliveEdges().filter((e) => site.inWater(lerp(g.nodes[e.a], g.nodes[e.b], 0.5)));
  if (!wet.length) return;
  // crossings: chains of wet edges along the same line
  const byLine = new Map<number, number[]>();
  for (const e of wet) {
    let l = byLine.get(e.line);
    if (!l) byLine.set(e.line, (l = []));
    l.push(e.id);
  }
  interface Crossing { ids: number[]; pri: number; mid: P; must: boolean }
  const crossings: Crossing[] = [];
  for (const ids of byLine.values()) {
    // split into connected runs
    const left = new Set(ids);
    while (left.size) {
      const start = left.values().next().value as number;
      const run = [start];
      left.delete(start);
      for (let k = 0; k < run.length; k++) {
        const E = g.edges[run[k]];
        for (const n of [E.a, E.b]) for (const o of g.nodes[n].e) if (left.has(o)) { left.delete(o); run.push(o); }
      }
      const E0 = g.edges[run[0]];
      const pts = run.flatMap((id) => [g.nodes[g.edges[id].a], g.nodes[g.edges[id].b]]);
      const mid = centroid(pts.length >= 3 ? pts : [...pts, pts[0]]);
      const tag = Math.floor(E0.line / 1000);
      crossings.push({ ids: run, pri: E0.pri, mid, must: tag === TAG.perimeter || tag === TAG.ring });
    }
  }
  crossings.sort((a, b) => (Number(b.must) - Number(a.must)) || a.pri - b.pri || rnd() - 0.5);
  const chosen: Crossing[] = [];
  const minGap = site.S / (site.style.bridges + 1) * 0.55;
  let budget = site.style.bridges;
  for (const c of crossings) {
    const total = c.ids.reduce((s, id) => s + dist(g.nodes[g.edges[id].a], g.nodes[g.edges[id].b]), 0);
    if (!c.must) {
      if (budget <= 0 || total > 260) continue;
      if (chosen.some((o) => dist(o.mid, c.mid) < minGap)) continue;
      // bridges must cross cleanly: both ends on dry land
      const ends = endsOf(g, c.ids);
      if (ends.some((n) => site.inWater(g.nodes[n]))) continue;
      // no junctions out on the water with another bridge
      const mine = new Set(c.ids.flatMap((id) => [g.edges[id].a, g.edges[id].b]));
      if (chosen.some((o) => o.ids.some((id) => mine.has(g.edges[id].a) || mine.has(g.edges[id].b)))) continue;
      budget--;
    }
    chosen.push(c);
  }
  const keep = new Set(chosen.flatMap((c) => c.ids));
  for (const e of wet) {
    if (keep.has(e.id)) g.edges[e.id].bridge = true;
    else g.removeEdge(e.id);
  }
}

function endsOf(g: Graph, ids: number[]): number[] {
  const count = new Map<number, number>();
  for (const id of ids) for (const n of [g.edges[id].a, g.edges[id].b]) count.set(n, (count.get(n) ?? 0) + 1);
  return [...count].filter(([, c]) => c === 1).map(([n]) => n);
}

function cleanup(g: Graph, site: Site, keepCuldesacs = false): void {
  const isPerim = (line: number) => Math.floor(line / 1000) === TAG.perimeter;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    // short edges: merge their ends
    for (const e of g.aliveEdges()) {
      if (!e.alive) continue;
      const A = g.nodes[e.a], B = g.nodes[e.b];
      const L = dist(A, B);
      const da = A.e.length, db = B.e.length;
      const minL = (da > 2 && db > 2) ? (e.cls === 'street' || e.cls === 'alley' ? 26 : 32) : 7;
      if (L < minL && !(da === 2 && db === 2)) {
        if (e.bridge) continue;
        // keep a perimeter node where it is
        const keepA = A.e.some((x) => isPerim(g.edges[x].line));
        if (keepA || !B.e.some((x) => isPerim(g.edges[x].line))) g.mergeNodes(e.a, e.b); else g.mergeNodes(e.b, e.a);
        changed = true;
      }
    }
    // dangling stubs shorter than 70 m
    for (const n of g.nodes) {
      if (!n.alive || n.e.length !== 1) continue;
      const chain: number[] = [];
      let cur = n.id, e = n.e[0], L = 0, ok = true;
      while (true) {
        const E = g.edges[e];
        if (keepCuldesacs && Math.floor(E.line / 1000) === TAG.culdesac) { ok = false; break; }
        chain.push(e);
        const o = g.other(E, cur);
        L += dist(g.nodes[cur], g.nodes[o]);
        cur = o;
        if (g.nodes[o].e.length !== 2) break;
        e = g.nodes[o].e[0] === e ? g.nodes[o].e[1] : g.nodes[o].e[0];
        if (chain.length > 200) break;
      }
      if (ok && (L < 70 || g.nodes[cur].e.length === 1)) {
        for (const id of chain) g.removeEdge(id);
        changed = true;
      }
    }
    // sharp angles: drop the weaker road
    for (const n of g.nodes) {
      if (!n.alive || n.e.length < 2) continue;
      const s = g.sorted(n.id);
      for (let i = 0; i < s.length; i++) {
        const x = s[i], y = s[(i + 1) % s.length];
        if (x === y) continue;
        const a = wrap2pi(g.dirAngle(y, n.id) - g.dirAngle(x, n.id));
        if (a < 0.56 || (s.length === 2 && a > Math.PI * 2 - 0.56)) {
          const ex = g.edges[x], ey = g.edges[y];
          const weak = ex.pri > ey.pri ? ex : ey.pri > ex.pri ? ey : (dist(g.nodes[ex.a], g.nodes[ex.b]) < dist(g.nodes[ey.a], g.nodes[ey.b]) ? ex : ey);
          if (isPerim(weak.line) || weak.bridge) continue;
          g.removeEdge(weak.id);
          changed = true;
          break;
        }
      }
    }
    // at most five roads per junction
    for (const n of g.nodes) {
      if (!n.alive || n.e.length <= 5) continue;
      const weak = n.e.map((x) => g.edges[x]).filter((x) => !isPerim(x.line) && !x.bridge).sort((x, y) => y.pri - x.pri)[0];
      if (weak) { g.removeEdge(weak.id); changed = true; }
    }
    if (!changed) break;
  }
  // only the main network: drop pieces that connect to nothing
  {
    const comp = new Map<number, number>();
    let bestC = -1, bestN = 0;
    for (const n of g.nodes) {
      if (!n.alive || comp.has(n.id)) continue;
      const st = [n.id];
      comp.set(n.id, n.id);
      let size = 0;
      while (st.length) {
        const v = st.pop()!;
        size++;
        for (const e of g.nodes[v].e) { const o = g.other(g.edges[e], v); if (!comp.has(o)) { comp.set(o, n.id); st.push(o); } }
      }
      if (size > bestN) { bestN = size; bestC = n.id; }
    }
    for (const e of g.aliveEdges()) if (comp.get(e.a) !== bestC) { g.removeEdge(e.id); }
  }
  void site;
}

function dropSome(g: Graph, site: Site, rnd: Rng): void {
  for (const e of g.aliveEdges()) {
    if (e.cls !== 'street' || e.bridge || !e.alive) continue;
    const A = g.nodes[e.a], B = g.nodes[e.b];
    if (A.e.length < 3 || B.e.length < 3) continue;
    const dk = site.district(lerp(A, B, 0.5));
    const pr = site.style.drop * (dk === 'industrial' || dk === 'docks' ? 2.5 : dk === 'downtown' ? 0.4 : 1);
    if (!rnd.chance(pr)) continue;
    // drop the whole street segment between the two junctions
    g.removeEdge(e.id);
  }
}

function addAlleysAndCuldesacs(g: Graph, site: Site, rnd: Rng): void {
  const { inner } = g.faces();
  let k = 0;
  for (const f of inner) {
    const poly = f.nodes.map((n) => g.nodes[n]);
    const area = signedArea(poly);
    const c = centroid(poly);
    if (!pointInPoly(c, poly) || site.inWater(c)) continue;
    const dk = site.district(c);
    // the face's main axis: its longest edge
    let best = 0, ax = p(1, 0);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = dist(a, b);
      if (L > best) { best = L; ax = unit(sub(b, a)); }
    }
    const hit = (from: P, d: P): P | null => {
      let bt = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const x = lineX(from, d, poly[i], sub(poly[(i + 1) % poly.length], poly[i]));
        if (x && x.t > 0.5 && x.s >= 0 && x.s <= 1 && x.t < bt) bt = x.t;
      }
      return bt < Infinity ? add(from, mul(d, bt)) : null;
    };
    if ((dk === 'downtown' || dk === 'commercial' || dk === 'residential') && area > 9000 && rnd.chance(site.style.alleys)) {
      const a = hit(c, ax), b = hit(c, mul(ax, -1));
      const across = nrm(ax);
      const wa = hit(c, across), wb = hit(c, mul(across, -1));
      if (a && b && wa && wb && dist(wa, wb) > 74 && dist(a, b) > 80) {
        g.insertPolyline([a, b], 'alley', 6, 10, TAG.alley * 1000 + k++);
      }
    } else if ((dk === 'suburban' || dk === 'residential') && area > 14000 && rnd.chance(site.style.culdesacs)) {
      // a stub from the middle of the longest side into the block
      let bi = 0; best = 0;
      for (let i = 0; i < poly.length; i++) {
        const L = dist(poly[i], poly[(i + 1) % poly.length]);
        if (L > best) { best = L; bi = i; }
      }
      const a = poly[bi], b = poly[(bi + 1) % poly.length];
      const m = lerp(a, b, rnd.range(0.4, 0.6));
      const inw = nrm(unit(sub(b, a)));
      const far = hit(add(m, mul(inw, 1)), inw);
      if (!far) continue;
      const depth = dist(m, far);
      const L = depth - 62;
      if (L < 45) continue;
      const end = add(m, mul(inw, Math.min(L, 150)));
      g.insertPolyline([m, end], 'street', 5, 10, TAG.culdesac * 1000 + k++);
    }
  }
}

// ------------------------------------------------------------------ collapsing to streets

function collapse(g: Graph, site: Site, rnd: Rng): Network {
  const key = new Set<number>();
  for (const n of g.nodes) {
    if (!n.alive || !n.e.length) continue;
    if (n.e.length !== 2) { key.add(n.id); continue; }
    const [x, y] = n.e;
    const ex = g.edges[x], ey = g.edges[y];
    if (ex.cls !== ey.cls || ex.bridge !== ey.bridge) { key.add(n.id); continue; }
    if (g.angleBetween(n.id, x, y) < Math.PI * 0.42) key.add(n.id);
  }
  const nodeId = new Map<number, number>();
  const nodes: RoadNode[] = [];
  const rawNode: number[] = [];
  const addNode = (raw: number) => {
    let id = nodeId.get(raw);
    if (id !== undefined) return id;
    id = nodes.length;
    nodeId.set(raw, id);
    rawNode.push(raw);
    const n = g.nodes[raw];
    nodes.push({ id, x: n.x, z: n.z, edges: [], kind: 'junction', signal: false, crosswalks: false, island: 0, poly: [], phase: 0 });
    return id;
  };
  const edges: RoadEdge[] = [];
  const raw: number[][] = [];
  const used = new Set<number>();
  const walk = (start: number, e0: number) => {
    const chain = [e0];
    const pts: P[] = [g.nodes[start]];
    let cur = start, e = e0;
    while (true) {
      used.add(e);
      const o = g.other(g.edges[e], cur);
      pts.push(g.nodes[o]);
      cur = o;
      if (key.has(o)) break;
      const nx = g.nodes[o].e[0] === e ? g.nodes[o].e[1] : g.nodes[o].e[0];
      if (used.has(nx)) break;
      e = nx;
      chain.push(e);
    }
    return { chain, pts, end: cur };
  };
  const emit = (start: number, chain: number[], pts: P[], end: number) => {
    const E = g.edges[chain[0]];
    const a = addNode(start), b = addNode(end);
    const mid = alongPolyline(pts, polylineLength(pts) / 2).p;
    const dk = site.district(mid);
    const parking = dk !== 'industrial' && dk !== 'docks';
    const dims = roadDims(E.cls, parking, E.bridge);
    const id = edges.length;
    edges.push({
      id, a, b, cls: E.cls, pts: pts.map((q) => p(q.x, q.z)), len: polylineLength(pts), half: dims.half, lanes: dims.lanes, median: dims.median,
      parking: dims.parking, bridge: E.bridge, trimA: 0, trimB: 0, faceN: -1, faceS: -1, name: '',
    });
    raw.push(chain);
    nodes[a].edges.push(id);
    if (b !== a) nodes[b].edges.push(id); else nodes[b].edges.push(id);
  };
  for (const k of key) {
    for (const e of g.nodes[k].e) {
      if (used.has(e)) continue;
      const w = walk(k, e);
      emit(k, w.chain, w.pts, w.end);
    }
  }
  // loops without any key node
  for (const e of g.aliveEdges()) {
    if (used.has(e.id)) continue;
    key.add(e.a);
    const w = walk(e.a, e.id);
    emit(e.a, w.chain, w.pts, w.end);
  }
  // self-loop edges (a === b) are split in two so every edge joins two different nodes
  for (const E of [...edges]) {
    if (E.a !== E.b) continue;
    const half = Math.floor(E.pts.length / 2);
    const mp = E.pts[half];
    const mid = nodes.length;
    rawNode.push(rawNode[E.a]);
    nodes.push({ id: mid, x: mp.x, z: mp.z, edges: [], kind: 'bend', signal: false, crosswalks: false, island: 0, poly: [], phase: 0 });
    const tail = E.pts.slice(half);
    E.pts = E.pts.slice(0, half + 1);
    E.len = polylineLength(E.pts);
    const b0 = E.b;
    E.b = mid;
    nodes[b0].edges.splice(nodes[b0].edges.lastIndexOf(E.id), 1);
    nodes[mid].edges.push(E.id);
    const id = edges.length;
    edges.push({ ...E, id, a: mid, b: b0, pts: tail, len: polylineLength(tail) });
    raw.push(raw[E.id]);
    nodes[mid].edges.push(id);
    nodes[b0].edges.push(id);
  }
  // names
  const names = ['Oak', 'Maple', 'Harbor', 'Main', 'Park', 'River', 'Mill', 'Station', 'King', 'Queen', 'Elm', 'Cedar', 'Lake', 'Hill', 'Market', 'Bridge', 'Church', 'Union', 'Liberty', 'Sunset', 'Pine', 'Willow', 'Garden', 'Ocean', 'Iron', 'Canal', 'Grand', 'Spring', 'Rose', 'Victoria'];
  const suffix: Record<RoadClass, string> = { boulevard: 'Boulevard', avenue: 'Avenue', street: 'Street', alley: 'Alley' };
  for (const E of edges) E.name = `${names[(E.a * 7 + E.b * 13 + rnd.int(0, 3)) % names.length]} ${suffix[E.cls]}`;
  return { g, nodes, edges, raw, rawNode, faces: [] };
}

// ------------------------------------------------------------------ junctions

interface End { e: number; atA: boolean; d: P; h: number }

/** The direction and half width of edge e leaving node n. */
function endOf(net: Network, n: number, e: number, atA: boolean): End {
  const E = net.edges[e];
  const pts = E.pts;
  const a = atA ? pts[0] : pts[pts.length - 1];
  // a direction a few metres along, steadier than the first tiny segment
  const s = Math.min(6, E.len / 2);
  const q = atA ? alongPolyline(pts, s).p : alongPolyline(pts, E.len - s).p;
  return { e, atA, d: unit(sub(q, a)), h: E.half };
}

/** Ends at a node, sorted by angle (an edge joining the node twice appears twice). */
function endsAt(net: Network, n: number): End[] {
  const out: End[] = [];
  for (const e of net.nodes[n].edges) {
    const E = net.edges[e];
    if (E.a === n && !out.some((o) => o.e === e && o.atA)) out.push(endOf(net, n, e, true));
    if (E.b === n && !out.some((o) => o.e === e && !o.atA)) out.push(endOf(net, n, e, false));
  }
  out.sort((x, y) => angleOf(x.d) - angleOf(y.d));
  return out;
}

/** Corner paths per node: corner[n][k] runs from end k's N kerb to end k+1's S kerb. */
const cornerStore = new WeakMap<Network, Map<number, { ends: End[]; paths: P[][] }>>();

function arcPts(c: P, r0: number, r1: number, a0: number, a1: number, step = 0.3): P[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(add(c, fromAngle(a0 + (a1 - a0) * t, r0 + (r1 - r0) * t)));
  }
  return out;
}

/**
 * Computes every node's trims, kerb corners and asphalt outline. Returns the edges whose
 * junctions overlap (too short for both ends).
 */
function junctions(net: Network, site: Site): number[] {
  const store = new Map<number, { ends: End[]; paths: P[][] }>();
  cornerStore.set(net, store);
  for (const E of net.edges) { E.trimA = 0; E.trimB = 0; }
  // roundabouts: big avenue crossings, a few per city
  const rb = new Set<number>();
  const cand = net.nodes.filter((n) => n.edges.length >= 4 && n.edges.filter((e) => net.edges[e].cls !== 'street' && net.edges[e].cls !== 'alley').length >= 3 && !n.edges.some((e) => net.edges[e].bridge));
  cand.sort((a, b) => dist(a, site.centre) - dist(b, site.centre));
  for (const n of cand) {
    if (rb.size >= site.style.roundabouts) break;
    if (dist(n, site.centre) < site.S * site.style.downtown * 0.5) continue;
    if (n.edges.some((e) => net.edges[e].len < 70)) continue;
    rb.add(n.id);
  }
  for (const node of net.nodes) {
    const ends = endsAt(net, node.id);
    const deg = ends.length;
    node.kind = deg >= 3 ? 'junction' : deg === 2 ? 'bend' : 'end';
    const cn = deg - 0;
    const tC: number[] = new Array(deg).fill(0); // trims wanted by corners
    const paths: P[][] = [];
    if (rb.has(node.id)) {
      const maxH = Math.max(...ends.map((e) => e.h));
      node.island = 7 + maxH * 0.2;
      const R = node.island + 2 * LANE_W + 1.5;
      for (let k = 0; k < deg; k++) {
        tC[k] = Math.sqrt(Math.max(0, R * R - ends[k].h ** 2)) + 6;
      }
      for (let k = 0; k < deg; k++) {
        const i = ends[k], j = ends[(k + 1) % deg];
        const Li = (t: number) => add(add(node, mul(nrm(i.d), i.h)), mul(i.d, t));
        const Rj = (t: number) => add(sub(node, mul(nrm(j.d), j.h)), mul(j.d, t));
        const ti = Math.sqrt(Math.max(0, R * R - i.h ** 2)), tj = Math.sqrt(Math.max(0, R * R - j.h ** 2));
        const a0 = angleOf(sub(Li(ti), node));
        let a1 = angleOf(sub(Rj(tj), node));
        while (a1 < a0) a1 += Math.PI * 2;
        paths.push([Li(tC[k]), Li(ti + 1.5), ...arcPts(node, R, R, a0, a1, 0.2), Rj(tj + 1.5), Rj(tC[(k + 1) % deg])]);
      }
    } else if (deg === 1) {
      const i = ends[0];
      // street dead ends get a turning bulb
      const cul = net.edges[i.e].cls === 'street' && !net.edges[i.e].bridge;
      const R = cul ? i.h + 5 : i.h;
      const a0 = angleOf(nrm(i.d));
      const back = sub(node, mul(i.d, cul ? 4 : 0));
      const path = [add(node, mul(nrm(i.d), i.h)), ...arcPts(back, R, R, a0 + (cul ? 0.25 : 0), a0 + Math.PI - (cul ? 0.25 : 0), 0.25), sub(node, mul(nrm(i.d), i.h))];
      if (cul) { tC[0] = 0; }
      paths.push(path);
    } else {
      // corners: line intersections with fillets, or arcs round the outside of a bend
      const info: { kind: 'c' | 'a'; ti: number; tj: number; build: (trI: number, trJ: number) => P[] }[] = [];
      const fillet = node.edges.some((e) => net.edges[e].cls === 'alley') ? 2.5 : 5.5;
      for (let k = 0; k < deg; k++) {
        const i = ends[k], j = ends[(k + 1) % deg];
        let th = wrap2pi(angleOf(j.d) - angleOf(i.d));
        if (deg === 1) th = Math.PI * 2;
        if (th === 0) th = Math.PI * 2;
        const Li = (t: number) => add(add(node, mul(nrm(i.d), i.h)), mul(i.d, t));
        const Rj = (t: number) => add(sub(node, mul(nrm(j.d), j.h)), mul(j.d, t));
        if (th < Math.PI - 0.02) {
          const x = lineX(Li(0), i.d, Rj(0), j.d);
          const tci = x ? Math.max(0, x.t) : 0, tcj = x ? Math.max(0, x.s) : 0;
          let a = 0, r = 0;
          if (th < Math.PI * 0.92) {
            r = fillet;
            a = r / Math.tan(th / 2);
            if (a > 8) { a = 8; r = a * Math.tan(th / 2); }
          }
          const C = Li(tci);
          info.push({
            kind: 'c', ti: tci + a, tj: tcj + a,
            build: (trI, trJ) => {
              const out: P[] = [Li(trI)];
              if (a > 0) {
                const bis = unit(add(i.d, j.d));
                const cen = add(C, mul(bis, r / Math.sin(th / 2)));
                const T1 = Li(tci + a), T2 = Rj(tcj + a);
                const a0 = angleOf(sub(T1, cen));
                let a1 = angleOf(sub(T2, cen));
                // the fillet turns the short way round
                let dA = a1 - a0;
                while (dA > Math.PI) dA -= Math.PI * 2;
                while (dA < -Math.PI) dA += Math.PI * 2;
                a1 = a0 + dA;
                out.push(...arcPts(cen, r, r, a0, a1, 0.28));
              } else out.push(C);
              out.push(Rj(trJ));
              return out;
            },
          });
        } else {
          const a0 = angleOf(nrm(i.d));
          let a1 = angleOf(mul(nrm(j.d), -1));
          while (a1 < a0 - 1e-6) a1 += Math.PI * 2;
          info.push({
            kind: 'a', ti: 0, tj: 0,
            build: (trI, trJ) => [Li(trI), ...arcPts(node, i.h, j.h, a0, a1, 0.3), Rj(trJ)],
          });
        }
      }
      for (let k = 0; k < deg; k++) {
        tC[k] = Math.max(tC[k], info[k].ti);
        tC[(k + 1) % deg] = Math.max(tC[(k + 1) % deg], info[k].tj);
      }
      if (deg >= 3) for (let k = 0; k < deg; k++) tC[k] += 0.5;
      for (let k = 0; k < deg; k++) paths.push(info[k].build(tC[k], tC[(k + 1) % deg]));
    }
    void cn;
    for (let k = 0; k < deg; k++) {
      const E = net.edges[ends[k].e];
      if (ends[k].atA) E.trimA = tC[k]; else E.trimB = tC[k];
    }
    // the corner paths end exactly on the edges' real (maybe curved) kerbs
    if (deg >= 2) for (let k = 0; k < deg; k++) {
      const path = paths[k];
      path[0] = kerbPt(net.edges[ends[k].e], ends[k].atA, tC[k], 1);
      const j = (k + 1) % deg;
      path[path.length - 1] = kerbPt(net.edges[ends[j].e], ends[j].atA, tC[j], -1);
    }
    store.set(node.id, { ends, paths });
  }
  // rebuild the paths with the final trims (a corner needs both of its edges' trims)
  const bad: number[] = [];
  for (const E of net.edges) if (E.trimA + E.trimB > E.len - 1.5) bad.push(E.id);
  if (bad.length) return bad;
  for (const node of net.nodes) {
    const st = store.get(node.id)!;
    const deg = st.ends.length;
    // the asphalt outline: each end's S kerb, its N kerb, then the corner to the next end
    if (deg >= 3 || node.island || (deg === 2 && st.paths.some((pp) => pp.length > 3))) {
      const poly: P[] = [];
      for (let k = 0; k < deg; k++) {
        const i = st.ends[k];
        const t = i.atA ? net.edges[i.e].trimA : net.edges[i.e].trimB;
        poly.push(kerbPt(net.edges[i.e], i.atA, t, -1));
        poly.push(...st.paths[k].slice(0, -1));
      }
      node.poly = dedupe(poly);
      if (Math.abs(signedArea(node.poly)) < 1) node.poly = [];
    } else if (deg === 1) {
      const i = st.ends[0];
      node.poly = dedupe([sub(node, mul(nrm(i.d), i.h)), ...st.paths[0]]);
    }
    const nSig = node.edges.filter((e) => net.edges[e].cls !== 'alley').length;
    node.signal = deg >= 3 && !node.island && (nSig >= 4 || node.edges.some((e) => net.edges[e].cls === 'avenue' || net.edges[e].cls === 'boulevard')) && nSig >= 3;
    const dk = site.district(node);
    node.crosswalks = deg >= 3 && !node.island && (node.signal || dk === 'downtown' || dk === 'commercial');
    node.phase = ((node.id * 7919) % 60) / 2;
  }
  return [];
}

/** A point on an edge's kerb, `t` metres from the node at its a (atA) or b end; side 1 = N side seen from that node. */
function kerbPt(E: RoadEdge, atA: boolean, t: number, side: 1 | -1): P {
  const s = atA ? t : E.len - t;
  const a = alongPolyline(E.pts, clamp(s, 0, E.len));
  const d = atA ? a.d : mul(a.d, -1);
  return add(a.p, mul(nrm(d), side * E.half));
}

function dedupe(poly: P[]): P[] {
  const out: P[] = [];
  for (const q of poly) if (!out.length || dist(out[out.length - 1], q) > 0.05) out.push(q);
  if (out.length > 2 && dist(out[0], out[out.length - 1]) < 0.05) out.pop();
  return out;
}

/** Kerb points of an edge seen from s, on the N side of travel s→t, between the trims. */
function edgeKerb(E: RoadEdge, fwd: boolean): P[] {
  const pts = fwd ? E.pts : [...E.pts].reverse();
  const t0 = fwd ? E.trimA : E.trimB, t1 = fwd ? E.trimB : E.trimA;
  return offsetPolyline(pts, E.half, t0, E.len - t1);
}

/** Builds the blocks' kerb outlines from the junction corners. Returns edges to remove. */
function makeFaces(net: Network, site: Site): number[] {
  const store = cornerStore.get(net)!;
  const faces: Face[] = [];
  const used = new Set<string>();
  const fix: number[] = [];
  for (const E of net.edges) {
    for (const fwd of [true, false]) {
      if (used.has(E.id + ':' + fwd)) continue;
      const fe: { e: number; fwd: boolean }[] = [];
      const curb: P[] = [], src: number[] = [], centre: P[] = [];
      let e = E.id, f = fwd, guard = 0;
      while (!used.has(e + ':' + f) && guard++ < 5000) {
        used.add(e + ':' + f);
        fe.push({ e, fwd: f });
        const ed = net.edges[e];
        const from = f ? ed.a : ed.b, to = f ? ed.b : ed.a;
        centre.push(net.nodes[from]);
        for (const q of edgeKerb(ed, f)) { curb.push(q); src.push(e); }
        // at `to`: our end there, then the next end clockwise (index - 1)
        const st = store.get(to)!;
        const k = st.ends.findIndex((x) => x.e === e && x.atA === !f);
        const deg = st.ends.length;
        const m = (k - 1 + deg) % deg;
        const path = [...st.paths[m]].reverse();
        for (let i = 1; i < path.length - 1; i++) { curb.push(path[i]); src.push(-1); }
        const nx = st.ends[m];
        e = nx.e; f = nx.atA;
      }
      // tidy: drop repeated points
      const pc: P[] = [], ps: number[] = [];
      for (let i = 0; i < curb.length; i++) {
        if (pc.length && dist(pc[pc.length - 1], curb[i]) < 0.05) continue;
        pc.push(curb[i]); ps.push(src[i]);
      }
      if (pc.length > 2 && dist(pc[0], pc[pc.length - 1]) < 0.05) { pc.pop(); ps.pop(); }
      const outer = signedArea(centre) <= 0;
      let clean = true;
      if (!outer) {
        clean = removeLoops(pc, ps, 14);
      }
      // a segment between two points of the same edge belongs to that edge
      const curbEdge = pc.map((_, i) => (ps[i] >= 0 && ps[i] === ps[(i + 1) % ps.length] ? ps[i] : -1));
      const area = signedArea(pc);
      const face: Face = { edges: fe, curb: pc, curbEdge, centre, outer };
      faces.push(face);
      if (!outer && (area <= 0 || !clean)) {
        face.bad = true;
        // roads overlap here: drop the weaker of the two roads whose kerbs cross
        const x = firstCrossing(pc);
        const near = (i: number) => { for (let k = 0; k < pc.length; k++) { const a = ps[(i + k) % pc.length], b = ps[(i - k + pc.length) % pc.length]; if (a >= 0) return a; if (b >= 0) return b; } return -1; };
        const perim = (e: number) => net.raw[e].some((r) => Math.floor(net.g.edges[r].line / 1000) === TAG.perimeter);
        let cand = (x ? [near(x[0]), near(x[1])] : fe.map((q) => q.e)).filter((e) => e >= 0 && !perim(e)).map((e) => net.edges[e]).filter((q) => !q.bridge);
        if (!cand.length) cand = fe.map((q) => net.edges[q.e]).filter((q) => !q.bridge && !perim(q.id));
        const weakest = cand.sort((a, b) => PRI[b.cls] - PRI[a.cls] || a.len - b.len)[0];
        if (weakest) fix.push(weakest.id);
      }
    }
  }
  net.faces = faces;
  faces.forEach((f, id) => {
    for (const { e, fwd } of f.edges) {
      if (fwd) net.edges[e].faceN = id; else net.edges[e].faceS = id;
    }
  });
  if (fix.length) return [...new Set(fix)];
  void site; void cross; void clamp;
  return [];
}

/** The asphalt ribbon of an edge: left and right kerb points between the trims. */
export function ribbon(E: RoadEdge): { l: P[]; r: P[]; c: P[]; s0: number; s1: number } {
  const s0 = E.trimA, s1 = E.len - E.trimB;
  return { l: offsetPolyline(E.pts, E.half, s0, s1), r: offsetPolyline(E.pts, -E.half, s0, s1), c: offsetPolyline(E.pts, 0, s0, s1), s0, s1 };
}
