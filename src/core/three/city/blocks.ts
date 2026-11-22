// City generator: blocks, lots and buildings. Every block gets a district, a sidewalk and an
// inner outline; lots are cut along its street fronts (oriented boxes, front on the sidewalk,
// so every lot touches a road); each lot gets a building drawn from its district's rules:
// podium towers with setbacks downtown, shops with awnings and signs, brick apartments with
// balconies and fire escapes, houses with gabled or hipped roofs and yards, warehouses with
// loading doors, gas stations. Pure data.
import {
  type P, type OBB, p, add, sub, mul, dist, unit, nrm, lerp, centroid, pointInPoly, signedArea, insetPoly, insetPolySrc, firstCrossing, obbInPoly, obbInPolyFast, polyIndex, obbOverlap,
  obbPoint, obbCorners, headingOf, arcLengths, alongPolyline, clamp, cleanPoly,
} from './geom';
import { type Rng, hash01 } from './rng';
import type { Site, Network } from './roads';
import type { Block, Lot, Building, Part, DistrictKind, Ground, BuildingType, FacadeStyle, RoofKind, Wall } from './types';

export const WALK: Record<DistrictKind, number> = {
  downtown: 4.6, commercial: 4, residential: 3.4, suburban: 2.8, industrial: 2.6, docks: 2.6, park: 3.2,
};

const GROUND: Record<DistrictKind, Ground> = {
  downtown: 'paving', commercial: 'asphalt', residential: 'grass', suburban: 'grass', industrial: 'gravel', docks: 'concrete', park: 'grass',
};

/** Lot frontage [min, max], depth max and the gap between lots. */
const LOTS: Record<DistrictKind, { w: [number, number]; d: number; gap: number }> = {
  downtown: { w: [26, 46], d: 34, gap: 0 },
  commercial: { w: [18, 34], d: 34, gap: 0.5 },
  residential: { w: [15, 24], d: 26, gap: 0 },
  suburban: { w: [17, 23], d: 30, gap: 0 },
  industrial: { w: [34, 64], d: 60, gap: 3 },
  docks: { w: [40, 72], d: 60, gap: 4 },
  park: { w: [20, 30], d: 20, gap: 0 },
};

/** A point inside a polygon (the centroid when it is inside). */
export function interiorPoint(poly: P[]): P {
  const c = centroid(poly);
  if (pointInPoly(c, poly)) return c;
  // the middle of the widest span on the horizontal line through the centroid
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.z > c.z) !== (b.z > c.z)) xs.push(a.x + ((c.z - a.z) / (b.z - a.z)) * (b.x - a.x));
  }
  xs.sort((a, b) => a - b);
  let best = c, bw = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = p((xs[i] + xs[i + 1]) / 2, c.z); }
  return best;
}

export function makeBlocks(net: Network, site: Site, rnd: Rng): Block[] {
  const blocks: Block[] = net.faces.map((f, id) => {
    const c = f.outer ? centroid(f.curb) : interiorPoint(f.curb);
    const wet = !f.outer && site.inWater(c);
    const district = site.district(c);
    return {
      id, kind: f.outer ? 'outer' : f.bad ? 'void' : wet ? 'water' : 'block', district, curb: f.curb, curbEdge: f.curbEdge, inner: null, innerEdge: [],
      walk: f.outer ? 3 : wet ? 4 : WALK[district], ground: GROUND[district], area: Math.abs(signedArea(f.curb)), c, lots: [],
    };
  });
  // a leftover tangle: its kerb outline split into simple loops, each a small paved plaza
  for (const b of [...blocks]) {
    if (b.kind !== 'void') continue;
    const loops = splitLoops(b.curb);
    b.curb = [];
    for (const lp of loops) {
      const area = signedArea(lp);
      if (area < 60) continue;
      const lawn = b.district === 'suburban' || b.district === 'residential' || b.district === 'park';
      if (!b.curb.length) { b.curb = lp; b.area = area; b.kind = 'plaza'; b.ground = lawn ? 'grass' : 'paving'; b.c = interiorPoint(lp); b.curbEdge = lp.map(() => -1); continue; }
      blocks.push({ ...b, id: blocks.length, curb: lp, curbEdge: lp.map(() => -1), area, c: interiorPoint(lp), lots: [] });
    }
    if (!b.curb.length) b.kind = 'void';
  }
  // parks: a share of the land blocks, a big one near downtown
  const land = blocks.filter((b) => b.kind === 'block');
  const R = site.S * site.style.downtown;
  const wantParks = Math.round(land.length * 0.055 * site.weights.park);
  const scored = land.filter((b) => b.area > 6000 && b.area < 60000).map((b) => {
    const d = dist(b.c, site.centre) / R;
    return { b, s: (d > 0.6 && d < 2.2 ? 2 : 0) + (site.waterDist(b.c) < 90 ? 1 : 0) + rnd() * 2.2 + (b.area > 15000 ? 0.6 : 0) };
  }).sort((x, y) => y.s - x.s);
  const parks: Block[] = [];
  for (const { b } of scored) {
    if (parks.length >= wantParks) break;
    if (parks.some((o) => dist(o.c, b.c) < site.S * 0.12)) continue;
    b.kind = 'park'; b.district = 'park'; b.ground = 'grass'; b.walk = WALK.park;
    parks.push(b);
  }
  // a plaza in the heart of downtown
  const heart = land.filter((b) => b.kind === 'block' && b.area > 2500 && b.area < 12000 && b.district === 'downtown')
    .sort((x, y) => dist(x.c, site.centre) - dist(y.c, site.centre))[0];
  if (heart) { heart.kind = 'plaza'; heart.ground = 'paving'; }
  for (const b of blocks) {
    if (b.kind === 'outer' || b.kind === 'void') continue;
    let ins = insetPolySrc(b.curb, b.walk);
    // a river face keeps its water: a narrower quay, or none
    for (const w of [2.5, 1.2]) {
      if (ins || b.kind !== 'water') break;
      b.walk = w;
      ins = insetPolySrc(b.curb, w);
    }
    if (!ins && b.kind === 'water') { b.walk = 0; ins = { poly: b.curb, src: b.curb.map((_, i) => i) }; }
    if (!ins) { if (b.kind === 'block') { b.kind = 'plaza'; b.ground = 'paving'; } continue; }
    const inner = ins.poly;
    b.inner = inner;
    // a segment keeps its road when both its ends come from the same kerb segment run
    b.innerEdge = inner.map((_, i) => {
      const s0 = ins.src[i], s1 = ins.src[(i + 1) % inner.length];
      const e = b.curbEdge[s0];
      if (e < 0) return -1;
      const nn = b.curb.length;
      for (let k = s0; k !== s1; k = (k + 1) % nn) if (b.curbEdge[k] !== e) return -1;
      return e;
    });
    const ia = signedArea(inner);
    // big blocks of the shopping strips keep their lawns (no sea of asphalt)
    if (b.kind === 'block' && b.district === 'commercial' && ia > 12000) b.ground = 'grass';
    // big squares become parks, plazas in the suburbs lawns
    if (b.kind === 'plaza' && ia > 6000) { b.kind = 'park'; b.ground = 'grass'; }
    else if (b.kind === 'plaza' && (b.district === 'suburban' || b.district === 'residential')) b.ground = 'grass';
    if (b.kind === 'block' && ia < 1400) { b.kind = 'plaza'; b.ground = b.district === 'suburban' || b.district === 'residential' ? 'grass' : 'paving'; }
  }
  return blocks;
}

// ------------------------------------------------------------------ lots

export function makeLots(blocks: Block[], net: Network, site: Site, rnd: Rng): Lot[] {
  const lots: Lot[] = [];
  for (const b of blocks) {
    if (b.kind !== 'block' || !b.inner) continue;
    const spec = LOTS[b.district];
    const inner = b.inner;
    const n = inner.length;
    // street sides: runs of inner segments along the same road
    const sides: { pts: P[]; edge: number; len: number }[] = [];
    let start = 0;
    // start the scan at a corner so runs do not wrap
    for (let i = 0; i < n; i++) if (b.innerEdge[i] !== b.innerEdge[(i - 1 + n) % n]) { start = i; break; }
    let run: P[] = [], runEdge = -2;
    const flush = () => {
      if (runEdge >= 0 && run.length >= 2) {
        const L = arcLengths(run);
        sides.push({ pts: run, edge: runEdge, len: L[L.length - 1] });
      }
      run = []; runEdge = -2;
    };
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const e = b.innerEdge[i];
      if (e !== runEdge) { flush(); runEdge = e; run = [inner[i]]; }
      run.push(inner[(i + 1) % n]);
    }
    flush();
    sides.sort((x, y) => {
      const ax = net.edges[x.edge].cls === 'alley' ? 1 : 0, ay = net.edges[y.edge].cls === 'alley' ? 1 : 0;
      return ax - ay || y.len - x.len;
    });
    const mine: OBB[] = [];
    const pidx = polyIndex(inner);
    const cidx = polyIndex(b.curb);
    for (const side of sides) {
      if (side.len < spec.w[0] * 0.8) continue;
      const alley = net.edges[side.edge].cls === 'alley';
      let s = 0.2;
      while (s < side.len - spec.w[0] * 0.7) {
        let w = rnd.range(spec.w[0], spec.w[1]);
        if (side.len - s - w < spec.w[0] * 0.6) w = side.len - s - 0.2; // last lot takes the rest
        let placed: OBB | null = null;
        for (const wf of [1, 0.75, 0.55]) {
          const ww = w * wf;
          if (ww < spec.w[0] * 0.5) break;
          const a = alongPolyline(side.pts, s).p, c = alongPolyline(side.pts, Math.min(side.len, s + ww)).p;
          const u = unit(sub(c, a));
          const v = nrm(u);
          const fl = dist(a, c);
          for (const depth of [spec.d, spec.d * 0.8, spec.d * 0.62, spec.d * 0.48]) {
            if (depth < 9) break;
            for (const shift of [0.05, 0.8, 2]) {
              const m = add(lerp(a, c, 0.5), mul(v, depth / 2 + shift));
              const box: OBB = { x: m.x, z: m.z, hw: fl / 2 - spec.gap / 2, hd: depth / 2, ux: u.x, uz: u.z };
              if (box.hw < 4) continue;
              if (!obbInPolyFast(box, pidx)) continue;
              if (mine.some((o) => obbOverlap(o, box, 0.02))) continue;
              if (!obbInPolyFast(box, cidx)) continue;
              placed = box;
              break;
            }
            if (placed) break;
          }
          if (placed) { w = ww; break; }
        }
        if (placed && !alley) {
          mine.push(placed);
          const id = lots.length;
          lots.push({ id, block: b.id, district: b.district, obb: placed, edge: side.edge, use: 'building', building: -1 });
          b.lots.push(id);
          s += w;
        } else if (placed && alley) {
          // alleys get back doors, not fronts: leave the space to the main streets' lots
          s += w;
        } else s += w * 0.5;
      }
    }
  }
  return lots;
}

// ------------------------------------------------------------------ buildings

const pick = <T>(list: readonly T[], h: number): T => list[Math.floor(h * list.length) % list.length];

/** A box in a lot's frame: u from u0 to u1, v from v0 to v1 (v inwards from the street). */
function sub2(o: OBB, u0: number, u1: number, v0: number, v1: number): OBB {
  const c = obbPoint(o, (u0 + u1) / 2, (v0 + v1) / 2);
  return { x: c.x, z: c.z, hw: (u1 - u0) / 2, hd: (v1 - v0) / 2, ux: o.ux, uz: o.uz };
}

function shrink(o: OBB, fu: number, fv: number, dv = 0): OBB {
  const c = obbPoint(o, 0, dv);
  return { x: c.x, z: c.z, hw: o.hw * fu, hd: o.hd * fv, ux: o.ux, uz: o.uz };
}

function tint(c: number, f: number): number {
  const r = clamp(Math.round(((c >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((c >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((c & 255) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}

const SIGN_COLOURS = [0xff3b6b, 0x3bd6ff, 0xffd23b, 0x7dff5a, 0xff7a2b, 0xc46bff, 0xffffff, 0x2bffb8];
const AWNING_COLOURS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7d3c98, 0x1f618d, 0xb03a2e, 0x117a65];

export interface BuildOut { buildings: Building[]; walls: Wall[] }

export function makeBuildings(lots: Lot[], blocks: Block[], net: Network, site: Site, rnd: Rng, heightMul: number): BuildOut {
  const buildings: Building[] = [];
  const walls: Wall[] = [];
  const R = site.S * site.style.downtown;
  const pal = site.style.palette;
  let gasCount = 0;
  const gasWant = Math.max(1, Math.round(site.S / 700));
  for (const lot of lots) {
    const o = lot.obb;
    const W = o.hw * 2, D = o.hd * 2;
    const hs = hash01(site.seed, lot.id, 17);
    const h2 = hash01(site.seed, lot.id, 29);
    const h3 = hash01(site.seed, lot.id, 41);
    const dC = dist(o, site.centre) / R;
    const dk = lot.district;
    const edge = net.edges[lot.edge];
    const arterial = edge.cls === 'avenue' || edge.cls === 'boulevard';
    let type: BuildingType;
    switch (dk) {
      case 'downtown': type = W > 22 && D > 22 && hs < 0.82 ? 'tower' : 'office'; break;
      case 'commercial': type = hs < 0.35 ? 'office' : hs < 0.62 ? 'midrise' : 'shop'; break;
      case 'residential': type = hs < 0.6 ? 'apartment' : 'rowhouse'; break;
      case 'suburban': type = arterial && hs < 0.3 ? 'shop' : 'house'; break;
      case 'industrial': type = hs < 0.7 ? 'warehouse' : 'factory'; break;
      case 'docks': type = 'warehouse'; break;
      default: type = 'kiosk';
    }
    if (arterial && (dk === 'commercial' || dk === 'suburban') && gasCount < gasWant && W > 26 && D > 24 && h2 < 0.25) { type = 'gas'; gasCount++; }
    // yards and parking instead of a building
    if ((dk === 'industrial' || dk === 'docks') && h2 < 0.3) { lot.use = 'containers'; continue; }
    if (dk === 'commercial' && h2 > 0.93) { lot.use = 'parking'; continue; }
    if (type === 'gas') lot.use = 'gas';

    const parts: Part[] = [];
    const palette = pal[dk === 'park' ? 'commercial' : dk];
    const colour = tint(pick(palette, h3), 0.92 + hs * 0.16);
    const roofCol = pick(site.style.roofs, h2);
    let floors = 1, floorH = 3.4, H = 4;
    let roofAccess: Building['roofAccess'] = null;
    let landmark = '';
    let lit = 0.45;
    // front setback (v), side gaps (u) and back gap, in the lot's frame
    let fv = 0, su = 0, bv = 0;
    switch (type) {
      case 'tower': {
        fv = hs < 0.3 ? 4 : 0.3; su = 0.3; bv = 0.5;
        const t = Math.exp(-dC * dC * 1.4);
        H = (34 + (site.style.towerMax - 34) * Math.pow(t, 1.3) * (0.45 + 0.55 * h2)) * heightMul;
        floorH = 3.8;
        floors = Math.max(8, Math.round(H / floorH));
        H = floors * floorH;
        const fp = sub2(o, -o.hw + su, o.hw - su, -o.hd + fv, o.hd - bv);
        const podH = floorH * (2 + Math.floor(h3 * 3)) + 0.8;
        const facade: FacadeStyle = pick(['glass', 'glass', 'ribbon', 'punched'] as const, h3);
        const tcol = facade === 'glass' ? tint(pick(pal.downtown, hs * 0.7 + 0.1), 0.9) : colour;
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: podH, color: tint(colour, 1.05), roof: 'flat', facade: 'punched', shop: true, n: Math.round(podH / floorH) });
        const fu = 0.72 + h2 * 0.16, fvv = 0.7 + hs * 0.18;
        let tw = shrink(fp, fu, fvv, fp.hd * (1 - fvv) * 0.4);
        const steps = H > 110 ? 3 : H > 70 ? 2 : 1;
        let y = podH;
        for (let k = 0; k < steps; k++) {
          const top = k === steps - 1 ? H : y + (H - podH) * (k === 0 ? 0.62 : 0.24) * (steps === 2 ? 1.25 : 1);
          parts.push({ kind: 'mass', obb: tw, y0: y, y1: top, color: tcol, roof: 'flat', facade });
          y = top;
          tw = shrink(tw, 0.8, 0.8);
        }
        if (H > 90 && h3 < 0.5) {
          parts.push({ kind: 'crown', obb: shrink(tw, 0.9, 0.9), y0: H, y1: H + 6, color: tint(tcol, 0.8) });
          parts.push({ kind: 'spire', obb: { ...tw, hw: 0.6, hd: 0.6 }, y0: H + 6, y1: H + 22 + h2 * 20, color: 0xb0b6bf });
        } else if (H > 60 && h3 > 0.7) {
          parts.push({ kind: 'helipad', obb: shrink(tw, 0.7, 0.7), y0: H, y1: H + 0.5, color: 0x3a3f45 });
        } else addRoofBoxes(parts, tw, H, hs, 3 + Math.floor(h2 * 4));
        parts.push({ kind: 'antenna', obb: { ...obbOff(tw, -0.6, 0.5), hw: 0.2, hd: 0.2 }, y0: H, y1: H + 8 + h3 * 10, color: 0x9aa0a8 });
        lit = 0.42;
        break;
      }
      case 'office':
      case 'midrise': {
        fv = dk === 'downtown' ? 0.3 : 0.5 + h2; su = dk === 'downtown' ? 0.2 : 0.6; bv = 1;
        floorH = 3.6;
        const base = dk === 'downtown' ? 6 + (site.style.towerMax * 0.3 / 3.6) * Math.exp(-dC * dC) : type === 'office' ? 5 : 3;
        floors = Math.max(2, Math.round((base + h2 * base * 0.8) * heightMul));
        H = floors * floorH + 0.6;
        const fp = sub2(o, -o.hw + su, o.hw - su, -o.hd + fv, o.hd - bv);
        const facade: FacadeStyle = type === 'office' ? pick(['ribbon', 'glass', 'punched'] as const, h3) : 'punched';
        const setback = floors > 5 && h3 > 0.5;
        const top = setback ? H - floorH * 2 : H;
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: top, color: colour, roof: 'flat', facade, shop: true });
        if (setback) parts.push({ kind: 'mass', obb: shrink(fp, 0.85, 0.75, fp.hd * 0.2), y0: top, y1: H, color: tint(colour, 0.95), roof: 'flat', facade });
        const roofBox = setback ? shrink(fp, 0.85, 0.75, fp.hd * 0.2) : fp;
        addRoofBoxes(parts, roofBox, H, hs, 2 + Math.floor(h2 * 3));
        if (floors <= 8 && h3 > 0.35) {
          const st = obbOff(roofBox, 0.55, 0.45);
          parts.push({ kind: 'stairs', obb: { ...st, hw: 1.6, hd: 1.4 }, y0: H, y1: H + 2.8, color: tint(colour, 0.8) });
          roofAccess = { door: frontDoor(fp, 0.35), roof: obbPoint(roofBox, -roofBox.hw * 0.3, 0), y: H };
        }
        if (dk !== 'downtown') addShopfront(parts, fp, hs, h2, site);
        lit = 0.38;
        break;
      }
      case 'shop': {
        const strip = D > 26 && hs < 0.5;
        fv = strip ? Math.min(18, D - 14) : 0.5; su = 1; bv = 1;
        floors = 1 + (h3 < 0.4 ? 1 : 0);
        floorH = 4.2;
        H = floors * floorH + 0.8;
        const fp = sub2(o, -o.hw + su, o.hw - su, -o.hd + fv, o.hd - bv);
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: H, color: colour, roof: 'flat', facade: 'punched', shop: true });
        addShopfront(parts, fp, hs, h2, site, true);
        addRoofBoxes(parts, fp, H, hs, 1 + Math.floor(h2 * 3));
        if (strip) lot.use = 'parking';
        lit = 0.6;
        break;
      }
      case 'apartment':
      case 'rowhouse': {
        fv = type === 'rowhouse' ? 1.2 : 0.4 + h2 * 2; su = type === 'rowhouse' ? 0 : 0.4; bv = 2;
        floorH = 3.1;
        floors = type === 'rowhouse' ? 2 + Math.floor(h3 * 2) : 3 + Math.floor((h3 * 3 + (dC < 2 ? 1.5 : 0)) * heightMul);
        H = floors * floorH + 0.8;
        const fp = sub2(o, -o.hw + su, o.hw - su, -o.hd + fv, o.hd - bv);
        const brick = colour;
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: H, color: brick, roof: 'flat', facade: hs < 0.55 ? 'brick' : 'punched', shop: type === 'apartment' && dC < 2 && h2 < 0.35 });
        if (type === 'apartment' && floors >= 3 && h2 > 0.4) parts.push({ kind: 'balconies', obb: fp, y0: floorH, y1: H - 0.8, color: tint(brick, 0.7), n: floors - 1, color2: 0x30343a });
        if (floors >= 3 && hs < 0.6) {
          // fire escape on the front, near one end
          const side = h3 < 0.5 ? -1 : 1;
          const fe = sub2(fp, side * fp.hw * 0.5 - 2.2, side * fp.hw * 0.5 + 2.2, -fp.hd - 1.3, -fp.hd);
          parts.push({ kind: 'fireescape', obb: fe, y0: floorH, y1: H - 0.4, color: 0x2a2d31, n: floors - 1 });
          roofAccess = { door: obbPoint(fe, 0, -1.5), roof: obbPoint(fp, side * fp.hw * 0.5, -fp.hd + 2), y: H };
        }
        if (h3 > 0.45) parts.push({ kind: 'tank', obb: { ...obbOff(fp, 0.5 - h2, 0.3), hw: 1.6, hd: 1.6 }, y0: H, y1: H + 5.5, color: 0x6b5440 });
        addRoofBoxes(parts, fp, H, hs, 1 + Math.floor(h2 * 2));
        if (type === 'rowhouse' && h2 < 0.5) parts.push({ kind: 'chimney', obb: { ...obbOff(fp, 0.8, 0.6), hw: 0.5, hd: 0.7 }, y0: H, y1: H + 1.6, color: tint(brick, 0.8) });
        lit = 0.34;
        break;
      }
      case 'house': {
        fv = 6 + h2 * 3; su = 2.2 + hs; bv = 7 + h3 * 3;
        if (D - fv - bv < 8) { fv = Math.max(3, D * 0.22); bv = Math.max(3, D * 0.25); }
        floors = h3 < 0.45 ? 1 : 2;
        floorH = 3;
        H = floors * floorH + 0.3;
        const fp = sub2(o, -o.hw + su + (h2 < 0.5 ? 3.5 : 0), o.hw - su - (h2 >= 0.5 ? 3.5 : 0), -o.hd + fv, o.hd - bv);
        const roof: RoofKind = hs < 0.55 ? 'gable' : 'hip';
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: H, color: colour, roof, facade: 'house', color2: roofCol });
        // garage beside the house (the side the house left free)
        const gs = h2 < 0.5 ? -1 : 1;
        const gx0 = gs < 0 ? -o.hw + su : o.hw - su - 3.5 - 0.1;
        const gp = sub2(o, gx0 - (gs < 0 ? 0 : 0) + (gs < 0 ? -0.0 : 0), gx0 + 3.6, -o.hd + fv + 0.6, -o.hd + fv + 6.6);
        if (gp.hw > 1) parts.push({ kind: 'garage', obb: gp, y0: 0, y1: 2.8, color: tint(colour, 0.95), roof: 'flat', facade: 'blank', color2: 0xe8e8e4 });
        if (h3 > 0.6) parts.push({ kind: 'chimney', obb: { ...obbOff(fp, 0.7, 0.5), hw: 0.45, hd: 0.45 }, y0: H, y1: H + 3.4, color: 0x8a5a48 });
        // yard: fence or hedge round the sides and the back
        const kind = h3 < 0.5 ? 'fence' : 'hedge';
        const c = obbCorners(shrink(o, 1 - 0.3 / o.hw, 1 - 0.3 / o.hd));
        // c: 0 front-left, 1 front-right, 2 back-right, 3 back-left
        walls.push({ kind, a: lerp(c[1], c[2], 0.25), b: c[2], h: kind === 'fence' ? 1.1 : 1.3 });
        walls.push({ kind, a: c[2], b: c[3], h: kind === 'fence' ? 1.1 : 1.3 });
        walls.push({ kind, a: c[3], b: lerp(c[0], c[3], 0.75), h: kind === 'fence' ? 1.1 : 1.3 });
        lit = 0.4;
        break;
      }
      case 'warehouse':
      case 'factory': {
        fv = 6 + h2 * 8; su = 3; bv = 3;
        floors = 1;
        floorH = 7 + h3 * 5;
        H = floorH;
        const fp = sub2(o, -o.hw + su, o.hw - su, -o.hd + fv, o.hd - bv);
        const roof: RoofKind = hs < 0.35 ? 'sawtooth' : hs < 0.7 ? 'gable' : 'flat';
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: H, color: colour, roof, facade: 'shed', color2: tint(colour, 0.7) });
        const doors = Math.max(1, Math.floor(fp.hw * 2 / 12));
        parts.push({ kind: 'loading', obb: fp, y0: 0, y1: 4.2, color: 0x3d4248, n: doors, color2: 0xd4a017 });
        if (type === 'factory') {
          const ch = obbOff(fp, 0.7, 0.6);
          parts.push({ kind: 'chimney', obb: { ...ch, hw: 1.4, hd: 1.4 }, y0: 0, y1: H + 16 + h2 * 18, color: 0x8a4b3a });
          if (h3 > 0.4) parts.push({ kind: 'tank', obb: { ...obbOff(fp, -0.6, 0.65), hw: 3, hd: 3 }, y0: H, y1: H + 4, color: 0xa7a9ab });
        }
        if (roof === 'flat') addRoofBoxes(parts, fp, H, hs, 2 + Math.floor(h2 * 3));
        walls.push(...chainlinkFront(o, fv));
        lit = 0.12;
        break;
      }
      case 'gas': {
        fv = 2; su = 2; bv = 2;
        floors = 1; floorH = 3.6; H = 4.2;
        const shopBox = sub2(o, -o.hw + su, -o.hw + su + Math.min(14, W * 0.45), o.hd - bv - 9, o.hd - bv);
        parts.push({ kind: 'mass', obb: shopBox, y0: 0, y1: H, color: 0xf2f2f0, roof: 'flat', facade: 'punched', shop: true });
        const can = sub2(o, -o.hw + su + Math.min(14, W * 0.45) + 1.5, o.hw - su, -o.hd + 4, -o.hd + 4 + Math.min(14, D * 0.5));
        parts.push({ kind: 'canopy', obb: can, y0: 4.6, y1: 5.6, color: 0xf4f4f2, color2: pick(SIGN_COLOURS, h3) });
        parts.push({ kind: 'sign', obb: { ...sub2(o, o.hw - 2, o.hw - 0.5, -o.hd + 0.6, -o.hd + 1.2) }, y0: 4, y1: 8, color: pick(SIGN_COLOURS, h2) });
        landmark = 'gas';
        lit = 0.9;
        break;
      }
      default: {
        fv = 2; su = 2; bv = 2;
        H = 3.2; floorH = 3.2;
        const fp = sub2(o, -o.hw + su, o.hw - su, -o.hd + fv, o.hd - bv);
        parts.push({ kind: 'mass', obb: fp, y0: 0, y1: H, color: colour, roof: 'flat', facade: 'punched', shop: true });
      }
    }
    const main = parts[0].obb;
    const id = buildings.length;
    const door = frontDoor(main, type === 'house' ? (h2 < 0.5 ? 0.25 : -0.25) : 0);
    buildings.push({
      id, lot: lot.id, block: lot.block, type, district: dk, obb: main, h: H, floors, floorH, parts,
      door: { x: door.x, z: door.z, h: headingOf(mul(unitV(main), -1)) },
      roofAccess, landmark, lit, seed: hs,
    });
    lot.building = id;
  }
  // the tallest tower is the city's landmark
  let tallest: Building | null = null;
  for (const b of buildings) if (b.type === 'tower' && (!tallest || b.h > tallest.h)) tallest = b;
  if (tallest) {
    tallest.landmark = 'tower';
    if (!tallest.parts.some((q) => q.kind === 'spire')) {
      const top = tallest.parts.filter((q) => q.kind === 'mass').slice(-1)[0];
      tallest.parts.push({ kind: 'spire', obb: { ...top.obb, hw: 0.8, hd: 0.8 }, y0: tallest.h, y1: tallest.h + 30, color: 0xc0c6cf });
    }
  }
  void blocks; void cleanPoly;
  return { buildings, walls };
}

/** The +v axis of a box (inwards from the street for lots). */
const unitV = (o: OBB): P => p(-o.uz, o.ux);

function obbOff(o: OBB, fu: number, fv: number): OBB {
  const c = obbPoint(o, o.hw * fu * 0.9, o.hd * fv * 0.9);
  return { ...o, x: c.x, z: c.z };
}

function frontDoor(fp: OBB, fu: number): P {
  return obbPoint(fp, fp.hw * fu, -fp.hd - 0.2);
}

function addRoofBoxes(parts: Part[], fp: OBB, H: number, h: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = hash01(Math.floor(h * 1e6), i, 3), b = hash01(Math.floor(h * 1e6), i, 7);
    const s = 0.9 + a * 1.4;
    if (fp.hw < 4 || fp.hd < 4) return;
    const c = obbPoint(fp, (a * 2 - 1) * (fp.hw - 2.5), (b * 2 - 1) * (fp.hd - 2.5));
    parts.push({ kind: 'roofbox', obb: { x: c.x, z: c.z, hw: s, hd: s * (0.7 + b * 0.6), ux: fp.ux, uz: fp.uz }, y0: H, y1: H + 1.2 + a * 1.2, color: 0xb9bcc0 });
  }
}

function addShopfront(parts: Part[], fp: OBB, hs: number, h2: number, site: Site, big = false): void {
  // awnings and signs along the front, one per shop bay
  const bays = Math.max(1, Math.floor((fp.hw * 2) / (big ? 14 : 9)));
  const bw = (fp.hw * 2) / bays;
  for (let i = 0; i < bays; i++) {
    const u0 = -fp.hw + i * bw + 0.6, u1 = -fp.hw + (i + 1) * bw - 0.6;
    const r = hash01(Math.floor(hs * 1e6), i);
    if (r < 0.65) parts.push({ kind: 'awning', obb: sub2(fp, u0, u1, -fp.hd - 1.6, -fp.hd), y0: 2.9, y1: 3.7, color: pick(AWNING_COLOURS, r), color2: 0xf4f1ea });
    if (r > 0.3 || big) parts.push({ kind: 'sign', obb: sub2(fp, u0 + bw * 0.12, u1 - bw * 0.12, -fp.hd - 0.35, -fp.hd), y0: 3.9, y1: 4.9, color: pick(SIGN_COLOURS, hash01(r * 1e6, 5)) });
  }
  void h2; void site;
}

function chainlinkFront(o: OBB, fv: number): Wall[] {
  const c = obbCorners(o);
  const a = lerp(c[0], c[3], Math.min(0.5, (fv - 1) / (o.hd * 2)));
  const b = lerp(c[1], c[2], Math.min(0.5, (fv - 1) / (o.hd * 2)));
  return [
    { kind: 'chainlink', a, b: lerp(a, b, 0.35), h: 2.2 },
    { kind: 'chainlink', a: lerp(a, b, 0.65), b, h: 2.2 },
  ];
}

/** Splits a self-crossing outline into simple loops (positive ones are kept by the caller). */
function splitLoops(poly: P[]): P[][] {
  const out: P[][] = [];
  const stack = [poly];
  while (stack.length && out.length < 16) {
    const pl = stack.pop()!;
    const x = firstCrossing(pl);
    if (!x) { out.push(pl); continue; }
    const [i, j, q] = x;
    stack.push([q, ...pl.slice(i + 1, j + 1)], [...pl.slice(0, i + 1), q, ...pl.slice(j + 1)]);
  }
  return out.filter((l) => l.length >= 3);
}
