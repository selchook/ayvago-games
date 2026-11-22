// City generator: street furniture and the rest of the dressing, placed by rules: lamps along
// every road (both kerbs on wide roads), traffic lights from the signals, street trees on the
// leafy districts' sidewalks and in boulevard medians, benches, bins, hydrants and bus stops,
// parking spots on streets with a parking strip and in lots (some taken by parked cars), yard
// trees and pools, container stacks and dock cranes, park trees, ponds and fountains. Pure data.
import { type P, p, add, sub, mul, dist, nrm, alongPolyline, obbPoint, obbInPoly, pointInPoly, insetPoly, signedArea, bounds, clamp, headingOf, unit, polyEdgeDist } from './geom';
import { type Rng, hash01 } from './rng';
import type { Network, Site } from './roads';
import { LANE_W, PARK_W } from './roads';
import type { Block, Lot, Building, Prop, PropKind, ParkingSpot, Signal, Wall } from './types';

const CAR_COLOURS = [0xc0392b, 0x2e4053, 0xf4f6f7, 0x1c2833, 0x7f8c8d, 0x2471a3, 0xd4ac0d, 0x196f3d, 0x922b21, 0xaeb6bf, 0x5b2c6f, 0xe67e22];
const CONTAINER_COLOURS = [0xb03a2e, 0x1f618d, 0x117a65, 0xd68910, 0x6c3483, 0x839192, 0xa04000, 0x1e8449];

export interface PropOut { props: Prop[]; parking: ParkingSpot[]; walls: Wall[] }

export function makeProps(net: Network, blocks: Block[], lots: Lot[], buildings: Building[], signals: Signal[], site: Site, rnd: Rng): PropOut {
  const props: Prop[] = [];
  const parking: ParkingSpot[] = [];
  const walls: Wall[] = [];
  const add1 = (kind: PropKind, x: number, z: number, h = 0, s = 1, c = 0, y = 0) => props.push({ kind, x, z, h, y, s, c });
  // spatial occupancy so props keep clear of each other
  const occ = new Map<number, P[]>();
  const okey = (x: number, z: number) => Math.floor(x / 8) * 100000 + Math.floor(z / 8);
  const free = (q: P, r: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const o of occ.get(okey(q.x + dx * 8, q.z + dz * 8)) ?? []) if (dist(o, q) < r) return false;
    }
    return true;
  };
  const take = (q: P) => { const k = okey(q.x, q.z); let l = occ.get(k); if (!l) occ.set(k, (l = [])); l.push(q); };
  const palms = site.style.trees === 'palm';
  const treeKind = (h: number): PropKind => palms ? (h < 0.75 ? 'palm' : 'tree') : site.style.trees === 'conifer' ? 'conifer' : site.style.trees === 'mixed' && h < 0.25 ? 'conifer' : 'tree';

  // signals first: they own their corners
  for (const s of signals) { add1('signal', s.x, s.z, s.h, 1, s.group + 2 * s.node); take(s); }
  // hydrants by the junctions
  for (const n of net.nodes) {
    if (n.kind !== 'junction' || !n.poly.length) continue;
    const E = net.edges[n.edges[0]];
    const atA = E.a === n.id;
    const t = (atA ? E.trimA : E.trimB) + 5;
    const at = alongPolyline(E.pts, clamp(atA ? t : E.len - t, 0, E.len));
    const q = add(at.p, mul(nrm(at.d), E.half + 0.7));
    if (E.bridge || !onLand(q, blocks, E)) continue;
    if (free(q, 2)) { add1('hydrant', q.x, q.z, 0); take(q); }
  }
  for (const E of net.edges) {
    const fN = E.faceN >= 0 ? blocks[E.faceN] : null, fS = E.faceS >= 0 ? blocks[E.faceS] : null;
    const s0 = E.trimA + 4, s1 = E.len - E.trimB - 4;
    if (s1 - s0 < 4) continue;
    for (const side of [1, -1] as const) {
      const face = side === 1 ? fN : fS;
      if (!face) continue;
      const water = face.kind === 'water';
      const dk = face.district;
      const leafy = !water && (dk === 'residential' || dk === 'suburban' || dk === 'commercial' || dk === 'park' || (dk === 'downtown' && E.cls !== 'alley'));
      // lamps
      if (E.cls !== 'alley') {
        const step = E.cls === 'street' ? 32 : 27;
        const wide = E.cls !== 'street';
        const phase = side === 1 || wide ? 0 : step / 2;
        for (let s = s0 + phase + 2; s < s1 - 1; s += step) {
          const at = alongPolyline(E.pts, s);
          const q = add(at.p, mul(nrm(at.d), side * (E.half + 0.6)));
          if (!free(q, 3)) continue;
          if (!E.bridge && face.kind === 'outer' && !onOuterWalk(q)) continue;
          add1('lamp', q.x, q.z, headingOf(mul(nrm(at.d), -side)), E.bridge ? 0.85 : 1);
          take(q);
        }
      }
      // street trees
      if (leafy && !E.bridge && face.kind !== 'outer' && E.cls !== 'alley' && face.walk >= 2.8) {
        const step = rnd.range(10, 14);
        for (let s = s0 + 5; s < s1 - 3; s += step) {
          const at = alongPolyline(E.pts, s);
          const q = add(at.p, mul(nrm(at.d), side * (E.half + Math.min(1.3, face.walk * 0.35))));
          if (!free(q, 4.5)) continue;
          if (hash01(site.seed, Math.floor(q.x), Math.floor(q.z)) < (dk === 'downtown' ? 0.45 : 0.15)) continue;
          add1(treeKind(hash01(site.seed, Math.floor(q.x * 3), 5)), q.x, q.z, rnd.range(0, 6.28), rnd.range(0.8, 1.15));
          take(q);
        }
      }
      // benches, bins, bus stops downtown and in the shopping streets
      if (!water && face.kind !== 'outer' && (dk === 'downtown' || dk === 'commercial') && !E.bridge) {
        for (let s = s0 + 9; s < s1 - 6; s += rnd.range(26, 40)) {
          const at = alongPolyline(E.pts, s);
          const q = add(at.p, mul(nrm(at.d), side * (E.half + 1.1)));
          if (!free(q, 3.5)) continue;
          const r = rnd();
          const face2road = headingOf(mul(nrm(at.d), -side));
          if (E.cls === 'avenue' && r < 0.12) add1('busstop', q.x, q.z, face2road + Math.PI);
          else add1(r < 0.55 ? 'bench' : 'bin', q.x, q.z, face2road + Math.PI);
          take(q);
        }
      }
      // parking strip
      if (E.parking) {
        for (let s = s0 + 6; s < s1 - 6; s += 6.2) {
          const at = alongPolyline(E.pts, s);
          const off = LANE_W + 0.15 + PARK_W / 2;
          const q = add(at.p, mul(nrm(at.d), side * off));
          const h = headingOf(side === 1 ? at.d : mul(at.d, -1));
          const taken = hash01(site.seed, Math.floor(q.x * 2), Math.floor(q.z * 2)) < 0.42;
          parking.push({ x: q.x, z: q.z, h, kind: 'street', edge: E.id, taken });
          if (taken) add1('car', q.x, q.z, h, 1, CAR_COLOURS[Math.floor(hash01(site.seed, Math.floor(q.x), Math.floor(q.z), 3) * CAR_COLOURS.length)]);
        }
      }
    }
    // boulevard median trees
    if (E.median > 0 && !E.bridge) {
      for (let s = s0 + 4; s < s1 - 4; s += 11) {
        const at = alongPolyline(E.pts, s);
        add1(palms ? 'palm' : 'tree', at.p.x, at.p.z, rnd.range(0, 6.28), rnd.range(0.75, 1));
      }
    }
  }
  // lots: parking lots, yards, container yards, gas stations
  for (const lot of lots) {
    const o = lot.obb;
    const b = lot.building >= 0 ? buildings[lot.building] : null;
    if (lot.use === 'parking') {
      // rows of bays in front of the shop (or the whole lot)
      const depth = b ? Math.max(0, (b.obb.x - o.x) * (-o.uz) + (b.obb.z - o.z) * o.ux + o.hd - b.obb.hd) : o.hd * 2;
      const rows = Math.max(1, Math.floor((depth - 1) / 6));
      for (let r = 0; r < Math.min(rows, 4); r++) {
        const v = -o.hd + 3.2 + r * 6;
        if (v > -o.hd + depth - 2.5) break;
        for (let u = -o.hw + 2; u <= o.hw - 2; u += 2.8) {
          const q = obbPoint(o, u, v);
          const h = headingOf(p(r % 2 ? o.uz : -o.uz, r % 2 ? -o.ux : o.ux));
          const taken = hash01(site.seed, Math.floor(q.x * 3), Math.floor(q.z * 3)) < 0.5;
          parking.push({ x: q.x, z: q.z, h, kind: 'lot', edge: lot.edge, taken });
          if (taken) add1('car', q.x, q.z, h, 1, CAR_COLOURS[Math.floor(hash01(site.seed, Math.floor(q.x), Math.floor(q.z), 7) * CAR_COLOURS.length)]);
        }
      }
    } else if (lot.use === 'containers') {
      const block = blocks[lot.block];
      const dock = lot.district === 'docks' || site.waterDist(o) < 60;
      for (let u = -o.hw + 4; u <= o.hw - 4; u += 3.2) {
        for (let v = -o.hd + 6; v <= o.hd - 7; v += 7.4) {
          const r = hash01(site.seed, lot.id, Math.round(u * 10), Math.round(v * 10));
          if (r < 0.2) continue;
          const stack = 1 + Math.floor(r * (dock ? 4 : 2.5));
          const q = obbPoint(o, u, v);
          const h = headingOf(p(-o.uz, o.ux));
          for (let k = 0; k < stack; k++) add1('container', q.x, q.z, h, 1, CONTAINER_COLOURS[Math.floor(hash01(r * 1e6, k) * CONTAINER_COLOURS.length)], k * 2.6);
        }
      }
      if (dock && block.inner) {
        // a gantry crane at the water end of the yard
        const q = obbPoint(o, 0, o.hd - 6);
        if (site.waterDist(q) < 90 && free(q, 40)) { add1('crane', q.x, q.z, headingOf(p(-o.uz, o.ux)), 1, 0xd35400); take(q); }
      }
      walls.push({ kind: 'chainlink', a: obbPoint(o, -o.hw + 0.5, -o.hd + 0.6), b: obbPoint(o, -2, -o.hd + 0.6), h: 2.4 });
      walls.push({ kind: 'chainlink', a: obbPoint(o, 6, -o.hd + 0.6), b: obbPoint(o, o.hw - 0.5, -o.hd + 0.6), h: 2.4 });
    } else if (lot.use === 'gas' && b) {
      const can = b.parts.find((q) => q.kind === 'canopy');
      if (can) {
        for (const u of [-0.45, 0.45]) for (const v of [-0.3, 0.3]) {
          const q = obbPoint(can.obb, can.obb.hw * u, can.obb.hd * v);
          add1('pump', q.x, q.z, headingOf(p(can.obb.ux, can.obb.uz)));
        }
      }
    } else if (b && b.type === 'house') {
      // a tree in the back yard, sometimes a pool
      const r = hash01(site.seed, lot.id, 99);
      const back = obbPoint(o, (r - 0.5) * o.hw, o.hd - 3.5);
      add1(treeKind(r), back.x, back.z, r * 6.28, 0.8 + r * 0.5);
      if (r > 0.72 && o.hd > 13) {
        const q = obbPoint(o, -(r - 0.5) * o.hw * 0.8, o.hd - 6.5);
        add1('pool', q.x, q.z, headingOf(p(-o.uz, o.ux)), 1, 0);
      }
      // the driveway car
      if (r < 0.55) {
        const gar = b.parts.find((q) => q.kind === 'garage');
        if (gar) {
          const q = obbPoint(gar.obb, 0, -gar.obb.hd - 3.2);
          add1('car', q.x, q.z, headingOf(p(o.uz, -o.ux)), 1, CAR_COLOURS[Math.floor(r * 97) % CAR_COLOURS.length]);
        }
      }
    }
  }
  // parks and plazas
  for (const b of blocks) {
    if ((b.kind !== 'park' && b.kind !== 'plaza') || !b.inner) continue;
    const poly = b.inner;
    const bb = bounds(poly);
    const area = signedArea(poly);
    const c = b.c;
    if (b.kind === 'plaza') {
      if (area > 500 && pointInPoly(c, poly) && polyEdgeDist(c, poly) > 6) add1(area > 2500 ? 'fountain' : 'statue', c.x, c.z, 0, area > 5000 ? 1.4 : 1);
      // trees in a loose grid
      for (let x = bb.x0 + 6; x < bb.x1; x += 11) for (let z = bb.z0 + 6; z < bb.z1; z += 11) {
        const q = p(x, z);
        if (!pointInPoly(q, poly) || polyEdgeDist(q, poly) < 3 || dist(q, c) < 9) continue;
        if (hash01(site.seed, Math.floor(x), Math.floor(z)) < 0.45) continue;
        add1(b.district === 'suburban' || b.district === 'residential' ? treeKind(0.5) : 'planter', x, z, 0, 1);
      }
      continue;
    }
    // park: a pond, a fountain, trees scattered
    const inner = insetPoly(poly, 8);
    let pond: P | null = null;
    if (area > 9000 && inner && pointInPoly(c, inner) && polyEdgeDist(c, poly) > 24) {
      const r = clamp(Math.sqrt(area) * 0.12, 9, 22);
      if (polyEdgeDist(c, poly) > r + 10) { pond = c; add1('pond', c.x, c.z, rnd.range(0, 6), r); }
    }
    let n = 0;
    const want = area / 190;
    for (let tries = 0; tries < want * 4 && n < want; tries++) {
      const q = p(rnd.range(bb.x0, bb.x1), rnd.range(bb.z0, bb.z1));
      if (!pointInPoly(q, poly) || polyEdgeDist(q, poly) < 2.5) continue;
      if (pond && dist(q, pond) < clamp(Math.sqrt(area) * 0.12, 9, 22) + 4) continue;
      // keep the paths (centre crosses) open
      if (Math.abs(q.x - c.x) < 2.5 || Math.abs(q.z - c.z) < 2.5) continue;
      if (!free(q, 4)) continue;
      add1(treeKind(rnd()), q.x, q.z, rnd.range(0, 6.28), rnd.range(0.8, 1.35));
      take(q);
      n++;
    }
    // benches along the paths
    for (let k = 0; k < Math.min(10, area / 1500); k++) {
      const t = rnd.range(-1, 1);
      const alongX = rnd.chance(0.5);
      const q = alongX ? p(c.x + t * (bb.x1 - bb.x0) * 0.4, c.z + 3) : p(c.x + 3, c.z + t * (bb.z1 - bb.z0) * 0.4);
      if (!pointInPoly(q, poly) || polyEdgeDist(q, poly) < 3 || !free(q, 3)) continue;
      add1('bench', q.x, q.z, alongX ? Math.PI : -Math.PI / 2);
      take(q);
    }
  }
  // the beach: umbrellas
  for (const beach of site.beaches) {
    const bb = bounds(beach);
    for (let k = 0; k < (bb.x1 - bb.x0 + bb.z1 - bb.z0) / 9; k++) {
      const q = p(rnd.range(bb.x0, bb.x1), rnd.range(bb.z0, bb.z1));
      if (!pointInPoly(q, beach) || site.inWater(q) || polyEdgeDist(q, beach) < 4) continue;
      if (!free(q, 6)) continue;
      add1('umbrella', q.x, q.z, rnd.range(0, 6), 1, [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xffffff][rnd.int(0, 4)]);
      take(q);
    }
  }
  void sub; void unit; void obbInPoly;
  return { props, parking, walls };

  function onLand(q: P, bl: Block[], E: { faceN: number }): boolean {
    const f = bl[E.faceN];
    return !!f && f.kind !== 'water' && f.kind !== 'outer' && pointInPoly(q, f.curb);
  }
  function onOuterWalk(q: P): boolean { return !site.inWater(q); }
}
