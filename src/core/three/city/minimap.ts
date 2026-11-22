// City generator: the minimap. A raster (one byte per cell: road, sidewalk, ground by district,
// building, water …) filled by scanline from the plan's polygons, a vector form (road
// polylines with widths, water, blocks, building footprints) and a canvas painter for both.
// Pure data except drawMinimap, which only needs a 2D canvas context.
import { type P, obbCorners, offsetPolyline } from './geom';
import type { CityPlan, DistrictKind } from './types';

/** Raster codes. */
export const MAP = {
  outside: 0, road: 1, sidewalk: 2, water: 3, building: 4, park: 5, plaza: 6, sand: 7,
  downtown: 8, commercial: 9, residential: 10, suburban: 11, industrial: 12, docks: 13, lot: 14, bridge: 15,
} as const;

/** Colours of the raster codes (0xRRGGBB). */
export const MAP_COLOURS: number[] = [
  0x6f8f4e, 0x3a3d42, 0xb9b4aa, 0x3d7fb8, 0x8d8a86, 0x6fae4f, 0xc9c1b0, 0xe2cf9a,
  0xa9a59c, 0xb3ab9b, 0x9fb882, 0x93b878, 0x9a958a, 0x98948c, 0x55585e, 0x7a6a58,
];

const DISTRICT_CODE: Record<DistrictKind, number> = {
  downtown: MAP.downtown, commercial: MAP.commercial, residential: MAP.residential, suburban: MAP.suburban,
  industrial: MAP.industrial, docks: MAP.docks, park: MAP.park,
};

export interface MinimapRaster {
  /** Cells per side; cell (i, j) covers x in [x0 + i·res, …), z in [z0 + j·res, …). */
  w: number; h: number; res: number; x0: number; z0: number;
  data: Uint8Array;
}

/** Fills a polygon into the raster (even-odd scanline at cell centres). */
function fill(r: MinimapRaster, poly: P[], code: number): void {
  if (poly.length < 3) return;
  let z0 = Infinity, z1 = -Infinity;
  for (const q of poly) { if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z; }
  const j0 = Math.max(0, Math.floor((z0 - r.z0) / r.res)), j1 = Math.min(r.h - 1, Math.ceil((z1 - r.z0) / r.res));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const z = r.z0 + (j + 0.5) * r.res;
    xs.length = 0;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[i], b = poly[k];
      if ((a.z > z) !== (b.z > z)) xs.push(a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - r.x0) / r.res - 0.5)), i1 = Math.min(r.w - 1, Math.floor((xs[k + 1] - r.x0) / r.res - 0.5));
      for (let i = i0; i <= i1; i++) r.data[j * r.w + i] = code;
    }
  }
}

/**
 * The plan as a raster of `res` metres per cell over the city plus a margin. Water, then the
 * land (as road), blocks (sidewalk), their insides by district, lots and buildings on top.
 */
export function minimapRaster(plan: CityPlan, res = 4, margin = 0): MinimapRaster {
  const x0 = -margin, z0 = -margin;
  const w = Math.ceil((plan.size + 2 * margin) / res), h = w;
  const r: MinimapRaster = { w, h, res, x0, z0, data: new Uint8Array(w * h) };
  for (const poly of plan.water.polys) fill(r, poly, MAP.water);
  for (const b of plan.water.beaches) fill(r, b, MAP.sand);
  const outer = plan.blocks.find((b) => b.kind === 'outer');
  // the land: the outer kerb, roads everywhere inside it
  if (outer) fill(r, outer.curb, MAP.road);
  else fill(r, plan.land, MAP.road);
  for (const b of plan.blocks) {
    if (b.kind === 'outer' || b.kind === 'void') continue;
    if (b.kind === 'water') { fill(r, b.curb, MAP.sidewalk); if (b.inner) fill(r, b.inner, MAP.water); continue; }
    fill(r, b.curb, MAP.sidewalk);
    if (!b.inner) continue;
    fill(r, b.inner, b.kind === 'park' ? MAP.park : b.kind === 'plaza' ? MAP.plaza : DISTRICT_CODE[b.district]);
  }
  for (const l of plan.lots) if (l.use === 'parking' || l.use === 'containers' || l.use === 'gas') fill(r, obbCorners(l.obb), MAP.lot);
  for (const e of plan.edges) if (e.bridge) {
    const L = offsetPolyline(e.pts, e.half + 1.5), R = offsetPolyline(e.pts, -e.half - 1.5);
    fill(r, [...L, ...R.reverse()], MAP.bridge);
  }
  for (const b of plan.buildings) for (const q of b.parts) if (q.kind === 'mass' && q.y0 < 1) fill(r, obbCorners(q.obb), MAP.building);
  return r;
}

export interface MinimapVector {
  roads: { pts: P[]; w: number; cls: string; bridge: boolean }[];
  water: P[][];
  blocks: { poly: P[]; kind: string; district: DistrictKind }[];
  buildings: { poly: P[]; h: number }[];
}

export function minimapVector(plan: CityPlan): MinimapVector {
  return {
    roads: plan.edges.map((e) => ({ pts: e.pts, w: e.half * 2, cls: e.cls, bridge: e.bridge })),
    water: plan.water.polys,
    blocks: plan.blocks.filter((b) => b.kind !== 'outer' && b.kind !== 'void').map((b) => ({ poly: b.curb, kind: b.kind, district: b.district })),
    buildings: plan.buildings.map((b) => ({ poly: obbCorners(b.obb), h: b.h })),
  };
}

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Paints the raster into a 2D context (one pixel per cell) and returns it as ImageData. */
export function rasterImage(r: MinimapRaster, ctx: CanvasRenderingContext2D): ImageData {
  const img = ctx.createImageData(r.w, r.h);
  for (let i = 0; i < r.data.length; i++) {
    const c = MAP_COLOURS[r.data[i]];
    img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return img;
}

/**
 * Draws a vector map of the plan into a 2D context: `scale` pixels per metre. Optional
 * overlays: the lane graph (arrows by direction), colliders, spawn points.
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, plan: CityPlan, scale: number, opts: { lanes?: boolean; colliders?: boolean; spawns?: boolean; walk?: boolean } = {}): void {
  const X = (q: P) => q.x * scale, Z = (q: P) => q.z * scale;
  const path = (poly: P[], close = true) => {
    ctx.beginPath();
    poly.forEach((q, i) => (i ? ctx.lineTo(X(q), Z(q)) : ctx.moveTo(X(q), Z(q))));
    if (close) ctx.closePath();
  };
  ctx.fillStyle = css(MAP_COLOURS[0]);
  ctx.fillRect(0, 0, plan.size * scale, plan.size * scale);
  ctx.fillStyle = css(MAP_COLOURS[MAP.water]);
  for (const w of plan.water.polys) { path(w); ctx.fill(); }
  ctx.fillStyle = css(MAP_COLOURS[MAP.sand]);
  for (const w of plan.water.beaches) { path(w); ctx.fill(); }
  const outer = plan.blocks.find((b) => b.kind === 'outer');
  ctx.fillStyle = css(MAP_COLOURS[MAP.road]);
  path(outer ? outer.curb : plan.land); ctx.fill();
  for (const b of plan.blocks) {
    if (b.kind === 'outer' || b.kind === 'void') continue;
    ctx.fillStyle = css(MAP_COLOURS[MAP.sidewalk]);
    path(b.curb); ctx.fill();
    if (!b.inner) continue;
    ctx.fillStyle = css(MAP_COLOURS[b.kind === 'water' ? MAP.water : b.kind === 'park' ? MAP.park : b.kind === 'plaza' ? MAP.plaza : DISTRICT_CODE[b.district]]);
    path(b.inner); ctx.fill();
  }
  ctx.fillStyle = css(MAP_COLOURS[MAP.lot]);
  for (const l of plan.lots) if (l.use === 'parking' || l.use === 'containers' || l.use === 'gas') { path(obbCorners(l.obb)); ctx.fill(); }
  for (const e of plan.edges) if (e.bridge) {
    ctx.strokeStyle = css(MAP_COLOURS[MAP.bridge]);
    ctx.lineWidth = (e.half * 2 + 3) * scale;
    path(e.pts, false); ctx.stroke();
    ctx.strokeStyle = css(MAP_COLOURS[MAP.road]);
    ctx.lineWidth = e.half * 2 * scale;
    path(e.pts, false); ctx.stroke();
  }
  // buildings shaded by height
  for (const b of plan.buildings) {
    for (const q of b.parts) {
      if (q.kind !== 'mass' && q.kind !== 'garage') continue;
      const t = Math.min(1, q.y1 / 150);
      const v = Math.round(150 - t * 90);
      ctx.fillStyle = `rgb(${v + 20},${v + 14},${v + 8})`;
      path(obbCorners(q.obb)); ctx.fill();
    }
  }
  ctx.fillStyle = '#2f6e2f';
  for (const p of plan.props) if (p.kind === 'tree' || p.kind === 'palm' || p.kind === 'conifer') { ctx.beginPath(); ctx.arc(X(p), Z(p), Math.max(0.8, 2.2 * scale), 0, Math.PI * 2); ctx.fill(); }
  if (opts.walk) {
    ctx.lineWidth = Math.max(0.5, 0.6 * scale);
    for (const [a, b, c] of plan.walk.edges) {
      ctx.strokeStyle = c ? '#ff4fd8' : '#ffffff88';
      ctx.beginPath(); ctx.moveTo(X(plan.walk.pts[a]), Z(plan.walk.pts[a])); ctx.lineTo(X(plan.walk.pts[b]), Z(plan.walk.pts[b])); ctx.stroke();
    }
  }
  if (opts.lanes) {
    ctx.lineWidth = Math.max(0.6, 0.5 * scale);
    for (const l of plan.lanes) {
      ctx.strokeStyle = l.dir === 1 ? '#ffd21f' : '#29e0ff';
      path(l.pts, false); ctx.stroke();
      // an arrow head at the lane's end
      const a = l.pts[l.pts.length - 2], b = l.pts[l.pts.length - 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L, s = 2.2;
      ctx.beginPath();
      ctx.moveTo(X(b), Z(b));
      ctx.lineTo((b.x - ux * s * 1.6 - uz * s) * scale, (b.z - uz * s * 1.6 + ux * s) * scale);
      ctx.lineTo((b.x - ux * s * 1.6 + uz * s) * scale, (b.z - uz * s * 1.6 - ux * s) * scale);
      ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
    ctx.strokeStyle = '#ff7b2f';
    for (const c of plan.connectors) { path(c.pts, false); ctx.stroke(); }
  }
  if (opts.colliders) {
    ctx.strokeStyle = '#ff2020'; ctx.lineWidth = Math.max(0.6, 0.4 * scale);
    for (const c of plan.colliders) { path(obbCorners(c.obb)); ctx.stroke(); }
    for (const c of plan.circles) { ctx.beginPath(); ctx.arc(X(c), Z(c), Math.max(0.6, c.r * scale), 0, Math.PI * 2); ctx.stroke(); }
  }
  if (opts.spawns) {
    const col: Record<string, string> = { start: '#ffffff', parking: '#4fc3f7', door: '#ffd54f', rooftop: '#ff8a65', gas: '#e53935', landmark: '#ab47bc', park: '#66bb6a', plaza: '#bdbdbd', bridge: '#8d6e63', dock: '#ff7043' };
    for (const s of plan.spawns) {
      if (s.kind === 'door' || s.kind === 'parking') continue;
      ctx.fillStyle = col[s.kind] ?? '#fff';
      ctx.beginPath(); ctx.arc(X(s), Z(s), Math.max(2.5, 5 * scale), 0, Math.PI * 2); ctx.fill();
    }
  }
}
