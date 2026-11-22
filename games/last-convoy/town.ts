// Last Convoy: Northdale's districts as plain data. Each district is a 13 × 13 grid of 8 m cells
// (the kit's street tiles): a road every fourth cell (a ring road round the edge, two crossing
// streets), and between them nine 24 m blocks. A block is either built up (two buildings from the
// town packs, sidewalks round them, solid) or an open lot the fight spills into: the town square,
// a parking lot full of wrecks, a container yard, the gas station forecourt, a park, the water
// tower's hill. Outside the ring a wall of buildings (or the harbour, or the hill's fence) closes
// the map; fog hides it.
//
// The plan gives the simulation its colliders (boxes and posts), a 1 m walk grid the zombies'
// flow field runs on, and the spots missions draw from: open ground for items and chests, doors
// for survivors, the ring road for spawns, wrecks for lurkers, the convoy's parking spot and the
// district's landmark (pump, radio). The view (view.ts) builds the 3D town from the same plan.
import type { DistrictId } from './defs';

export const CELL = 8;
export const N = 13;
/** Half the map's width (m): cells span -52 .. 52. */
export const HALF = (N * CELL) / 2;
/** The walk grid's resolution (m) and size. */
export const WG = 1;
export const WN = Math.round((HALF * 2) / WG);

export type BlockKind = 'bldg' | 'square' | 'lot' | 'yard' | 'gas' | 'park' | 'tower';
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Spot { x: number; z: number }
export interface Post { x: number; z: number; r: number }
export interface Placed { key: string; x: number; z: number; rot: number; s?: number; sx?: number; sy?: number; sz?: number; tint?: number; y?: number }
export interface Building { key: string; x: number; z: number; rot: number; w: number; d: number; h: number; tint: number }
export interface Block { bi: number; bj: number; kind: BlockKind; rect: Rect }
export interface Road { i: number; j: number; kind: 'straight' | 'turn' | 't' | 'cross'; rot: number }

export interface TownPlan {
  district: DistrictId;
  blocks: Block[];
  roads: Road[];
  buildings: Building[];
  /** Scenery models (kit props, wrecks) with or without a collider. */
  props: Placed[];
  solids: Rect[];
  posts: Post[];
  /** 1 = walkable, per WG cell (row-major, z then x). */
  walk: Uint8Array;
  /** Open ground (lots, squares, yards' lanes): items, chests, the boss's arena. */
  open: Spot[];
  /** Sidewalk spots in front of buildings: survivors, chests, lurkers in alleys. */
  doors: Spot[];
  /** The ring road: where zombies wander in from. */
  spawns: Spot[];
  /** Under wrecks: crawlers hide here. */
  lurks: Spot[];
  lamps: { x: number; z: number; rot: number }[];
  convoy: { x: number; z: number; rot: number };
  /** The landmark of the district: the gas pump (gas), the radio (hill). */
  pump: Spot | null;
  radio: Spot | null;
  /** The middle of the biggest open block (boss arena, Last Stand). */
  arena: Spot;
  ground: number;
  outside: 'city' | 'harbour' | 'hill';
}

/** The nine blocks of each district, north row first. */
const LAYOUT: Record<DistrictId, BlockKind[][]> = {
  main: [['bldg', 'bldg', 'bldg'], ['lot', 'square', 'bldg'], ['bldg', 'bldg', 'park']],
  docks: [['yard', 'yard', 'bldg'], ['bldg', 'yard', 'lot'], ['yard', 'bldg', 'yard']],
  gas: [['bldg', 'lot', 'bldg'], ['gas', 'bldg', 'yard'], ['bldg', 'park', 'bldg']],
  hill: [['park', 'bldg', 'park'], ['bldg', 'tower', 'bldg'], ['park', 'lot', 'park']],
};
const GROUND: Record<DistrictId, number> = { main: 0x5a5a62, docks: 0x55585e, gas: 0x5e5850, hill: 0x4a6a44 };
const OUTSIDE: Record<DistrictId, TownPlan['outside']> = { main: 'city', docks: 'harbour', gas: 'city', hill: 'hill' };

/** The town packs' buildings (quaternius/town-buildings): footprint (w along the front, d deep) and height (m). */
export const BUILDINGS: { key: string; w: number; d: number; h: number }[] = [
  { key: 'Building1_Large', w: 23.97, d: 8.23, h: 14.01 },
  { key: 'Building1_Small', w: 11.24, d: 8.17, h: 13.82 },
  { key: 'Building2_Large', w: 17.15, d: 6.66, h: 17.75 },
  { key: 'Building2_Small', w: 10.75, d: 7.46, h: 14.9 },
  { key: 'Building3_Big', w: 14.12, d: 13.17, h: 17.03 },
  { key: 'Building3_Small', w: 9.16, d: 13.19, h: 17.03 },
  { key: 'Building4', w: 13.54, d: 11.49, h: 16.46 },
  { key: 'House1', w: 7.67, d: 11.54, h: 9.49 },
  { key: 'House2', w: 10.87, d: 9.25, h: 8.72 },
];
/** The lighter models (under 3000 triangles). */
const LIGHT = BUILDINGS.filter((b) => ['Building2_Small', 'Building3_Small', 'Building3_Big', 'House2'].includes(b.key));
const TINTS = [0xffffff, 0xf2e6d8, 0xe0e8f2, 0xf4dcc8, 0xdde8d8, 0xf0d8d8];

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cellX = (i: number): number => (i + 0.5) * CELL - HALF;
const isRoad = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < N && j < N && (i % 4 === 0 || j % 4 === 0);

/** Builds a district's plan (the same for every mission there; spots are drawn by the mission). */
export function planTown(district: DistrictId): TownPlan {
  const rnd = mulberry(district.length * 977 + district.charCodeAt(0) * 31);
  const plan: TownPlan = {
    district, blocks: [], roads: [], buildings: [], props: [], solids: [], posts: [], walk: new Uint8Array(WN * WN),
    open: [], doors: [], spawns: [], lurks: [], lamps: [], convoy: { x: cellX(6), z: cellX(12), rot: Math.PI / 2 },
    pump: null, radio: null, arena: { x: 0, z: 0 }, ground: GROUND[district], outside: OUTSIDE[district],
  };
  // roads: the tile kind from the open sides
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!isRoad(i, j)) continue;
    const n = isRoad(i, j - 1), s = isRoad(i, j + 1), w = isRoad(i - 1, j), e = isRoad(i + 1, j);
    const c = +n + +s + +w + +e;
    let kind: Road['kind'] = 'straight', rot = 0;
    if (c >= 4) kind = 'cross';
    else if (c === 3) { kind = 't'; rot = !n ? 0 : !e ? -Math.PI / 2 : !s ? Math.PI : Math.PI / 2; }
    else if ((n || s) && (e || w) && c === 2) { kind = 'turn'; rot = s && e ? 0 : s && w ? -Math.PI / 2 : n && w ? Math.PI : Math.PI / 2; }
    else rot = n || s ? 0 : Math.PI / 2;
    plan.roads.push({ i, j, kind, rot });
  }
  // blocks
  const layout = LAYOUT[district];
  let arenaArea = 0;
  for (let bj = 0; bj < 3; bj++) for (let bi = 0; bi < 3; bi++) {
    const kind = layout[bj][bi];
    const x0 = cellX(bi * 4 + 1) - CELL / 2, z0 = cellX(bj * 4 + 1) - CELL / 2;
    const rect = { x0, z0, x1: x0 + CELL * 3, z1: z0 + CELL * 3 };
    plan.blocks.push({ bi, bj, kind, rect });
    const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    if (kind === 'bldg') buildBlock(plan, rect, rnd);
    else {
      openBlock(plan, kind, rect, rnd);
      const score = kind === 'square' || kind === 'tower' || kind === 'park' ? 2 : 1;
      if (score > arenaArea || (score === arenaArea && Math.hypot(cx, cz) < Math.hypot(plan.arena.x, plan.arena.z))) { arenaArea = score; plan.arena = { x: cx, z: cz }; }
    }
  }
  // lamps along the ring road and the crossing streets (every other cell, alternating sides)
  for (const r of plan.roads) {
    if (r.kind !== 'straight' || (r.i + r.j) % 2) continue;
    const x = cellX(r.i), z = cellX(r.j);
    const side = (r.i + r.j) % 4 ? 1 : -1;
    if (r.rot === 0) plan.lamps.push({ x: x + side * 4.6, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    else plan.lamps.push({ x, z: z + side * 4.6, rot: side > 0 ? Math.PI : 0 });
  }
  for (const l of plan.lamps) plan.posts.push({ x: l.x, z: l.z, r: 0.25 });
  // the outer wall: the map ends half a metre outside the ring road
  const H = HALF;
  plan.solids.push({ x0: -H - 10, z0: -H - 10, x1: H + 10, z1: -H + 0.2 }, { x0: -H - 10, z0: H - 0.2, x1: H + 10, z1: H + 10 });
  plan.solids.push({ x0: -H - 10, z0: -H, x1: -H + 0.2, z1: H }, { x0: H - 0.2, z0: -H, x1: H + 10, z1: H });
  outerRing(plan, rnd);
  // spawns: the ring road
  for (let k = 0; k < N; k += 2) {
    plan.spawns.push({ x: cellX(k), z: cellX(0) }, { x: cellX(k), z: cellX(12) }, { x: cellX(0), z: cellX(k) }, { x: cellX(12), z: cellX(k) });
  }
  // the convoy's spot is clear of everything
  const cv = plan.convoy;
  plan.props = plan.props.filter((p) => Math.hypot(p.x - cv.x, p.z - cv.z) > 7);
  plan.posts = plan.posts.filter((p) => Math.hypot(p.x - cv.x, p.z - cv.z) > 5);
  plan.lamps = plan.lamps.filter((p) => Math.hypot(p.x - cv.x, p.z - cv.z) > 5);
  rasterise(plan);
  // only spots on walkable ground
  const ok = (s: Spot) => walkable(plan, s.x, s.z, 0.6);
  plan.open = plan.open.filter(ok);
  plan.doors = plan.doors.filter(ok);
  plan.spawns = plan.spawns.filter(ok);
  plan.lurks = plan.lurks.filter(ok);
  return plan;
}

/** Two buildings back to back (north and south faces), sidewalks round them, one solid box. */
function buildBlock(plan: TownPlan, r: Rect, rnd: () => number): void {
  const inset = 2;
  const b = { x0: r.x0 + inset, z0: r.z0 + inset, x1: r.x1 - inset, z1: r.z1 - inset };
  plan.solids.push(b);
  const w = b.x1 - b.x0, d = (b.z1 - b.z0) / 2;
  for (const side of [-1, 1]) {
    const def = BUILDINGS[Math.floor(rnd() * BUILDINGS.length)];
    const h = 5.2 + rnd() * 3.6;
    // front faces the road: north face (side -1) looks to -z, south (+1) to +z
    const z = side < 0 ? b.z0 + d / 2 : b.z1 - d / 2;
    plan.buildings.push({ key: def.key, x: (b.x0 + b.x1) / 2, z, rot: side < 0 ? Math.PI : 0, w, d, h, tint: TINTS[Math.floor(rnd() * TINTS.length)] });
    // a door spot on the sidewalk in front of it, and the alleys at the ends
    plan.doors.push({ x: (b.x0 + b.x1) / 2 + (rnd() - 0.5) * 8, z: side < 0 ? b.z0 - 1.1 : b.z1 + 1.1 });
  }
  plan.doors.push({ x: b.x0 - 1.1, z: (b.z0 + b.z1) / 2 + (rnd() - 0.5) * 6 }, { x: b.x1 + 1.1, z: (b.z0 + b.z1) / 2 + (rnd() - 0.5) * 6 });
  // clutter on the sidewalks: trash, hydrants, cones
  for (let k = 0; k < 3; k++) {
    const onX = rnd() < 0.5;
    const x = onX ? b.x0 + rnd() * w : rnd() < 0.5 ? b.x0 - 1 : b.x1 + 1;
    const z = onX ? (rnd() < 0.5 ? b.z0 - 1 : b.z1 + 1) : b.z0 + rnd() * (b.z1 - b.z0);
    const key = ['trash-1', 'trash-2', 'hydrant', 'cone-1', 'tyres'][Math.floor(rnd() * 5)];
    plan.props.push({ key, x, z, rot: rnd() * 6.28 });
    if (key === 'hydrant' || key === 'tyres') plan.posts.push({ x, z, r: 0.35 });
  }
}

/** A wrecked car as scenery and a box collider; a lurk spot beside it. */
function wreck(plan: TownPlan, x: number, z: number, rot: number, rnd: () => number): void {
  const key = rnd() < 0.5 ? 'v:sports' : 'v:pickup';
  plan.props.push({ key, x, z, rot, tint: [0x8a7a6a, 0x6a7a8a, 0x8a6a6a, 0x7a8a6a][Math.floor(rnd() * 4)] });
  const along = Math.abs(Math.sin(rot)) > 0.7;
  const hw = along ? 2.6 : 1.15, hd = along ? 1.15 : 2.6;
  plan.solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
  plan.lurks.push({ x: x + (along ? 0 : 2), z: z + (along ? 2 : 0) });
}

function openBlock(plan: TownPlan, kind: BlockKind, r: Rect, rnd: () => number): void {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const grid = (n: number, m = 2) => { for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) plan.open.push({ x: r.x0 + m + (a + 0.5) * ((r.x1 - r.x0 - 2 * m) / n), z: r.z0 + m + (b + 0.5) * ((r.z1 - r.z0 - 2 * m) / n) }); };
  switch (kind) {
    case 'square': {
      grid(3);
      // a plaza: lamps at the corners, an abandoned couch and trash by the fountain-less middle, a wreck
      for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) plan.lamps.push({ x: cx + dx, z: cz + dz, rot: Math.atan2(-dx, -dz) });
      plan.props.push({ key: 'couch', x: cx - 4, z: cz + 6, rot: Math.PI }, { key: 'trash-2', x: cx + 5, z: cz - 6, rot: 1 }, { key: 'trash-1', x: cx + 6, z: cz - 5, rot: 2 });
      plan.posts.push({ x: cx - 4, z: cz + 6, r: 1.2 });
      plan.props.push({ key: 'traffic-barrier-1', x: cx + 7, z: cz + 3, rot: 0.3 }, { key: 'cone-2', x: cx - 7, z: cz - 3, rot: 0 });
      wreck(plan, cx + 1, cz - 1, 0.5, rnd);
      break;
    }
    case 'lot': {
      grid(3);
      for (let k = 0; k < 4; k++) {
        const x = r.x0 + 5 + (k % 2) * 13 + rnd() * 2, z = r.z0 + 6 + Math.floor(k / 2) * 12 + rnd() * 2;
        wreck(plan, x, z, rnd() < 0.5 ? 0 : Math.PI / 2 + (rnd() - 0.5) * 0.3, rnd);
      }
      plan.props.push({ key: 'cone-1', x: cx, z: cz, rot: 0 }, { key: 'cone-2', x: cx + 2, z: cz + 1, rot: 0 }, { key: 'barrel', x: r.x1 - 2, z: r.z1 - 2, rot: 0 });
      plan.posts.push({ x: r.x1 - 2, z: r.z1 - 2, r: 0.4 });
      break;
    }
    case 'yard': {
      // two rows of containers with a lane between, pallets and barrels
      for (let k = 0; k < 3; k++) {
        const x = r.x0 + 4 + k * 8;
        for (const z of [r.z0 + 4.5, r.z1 - 4.5]) {
          if (rnd() < 0.2) continue;
          const key = rnd() < 0.5 ? 'container-green' : 'container-red';
          plan.props.push({ key, x, z, rot: Math.PI / 2 });
          plan.solids.push({ x0: x - 1.3, z0: z - 2.85, x1: x + 1.3, z1: z + 2.85 });
          if (rnd() < 0.35) { plan.props.push({ key: rnd() < 0.5 ? 'container-red' : 'container-green', x, z, rot: Math.PI / 2, y: 2.6 }); }
        }
      }
      for (let k = 0; k < 4; k++) plan.open.push({ x: r.x0 + 3 + k * 6, z: cz + (rnd() - 0.5) * 3 });
      for (let k = 0; k < 3; k++) {
        const x = r.x0 + 4 + rnd() * 16, z = cz + (rnd() - 0.5) * 5;
        plan.props.push({ key: rnd() < 0.5 ? 'pallet' : 'pallet-broken', x, z, rot: rnd() * 3 });
      }
      plan.props.push({ key: 'barrel', x: r.x0 + 1.5, z: cz, rot: 0 }, { key: 'barrel', x: r.x1 - 1.5, z: cz + 1, rot: 0 });
      plan.posts.push({ x: r.x0 + 1.5, z: cz, r: 0.4 }, { x: r.x1 - 1.5, z: cz + 1, r: 0.4 });
      break;
    }
    case 'gas': {
      grid(3);
      // the canopy over two pumps (the view draws them), a small shop at the back, barrels and tyres
      plan.pump = { x: cx, z: cz + 1 };
      plan.props.push({ key: 'gas:canopy', x: cx, z: cz + 1, rot: 0 });
      for (const dx of [-3.2, 3.2]) plan.posts.push({ x: cx + dx, z: cz + 1, r: 0.6 });
      const shop = BUILDINGS[8];
      plan.buildings.push({ key: shop.key, x: cx, z: r.z0 + 4.5, rot: Math.PI, w: 14, d: 7, h: 6, tint: 0xf2e0c8 });
      plan.solids.push({ x0: cx - 7, z0: r.z0 + 1, x1: cx + 7, z1: r.z0 + 8 });
      plan.props.push({ key: 'tyres', x: r.x0 + 2, z: r.z1 - 2, rot: 0 }, { key: 'tyres', x: r.x0 + 2.7, z: r.z1 - 2.4, rot: 1 }, { key: 'barrel', x: r.x1 - 2, z: r.z1 - 3, rot: 0 }, { key: 'barrel', x: r.x1 - 2.8, z: r.z1 - 2.2, rot: 0 });
      plan.posts.push({ x: r.x0 + 2.3, z: r.z1 - 2.2, r: 0.7 }, { x: r.x1 - 2.4, z: r.z1 - 2.6, r: 0.8 });
      wreck(plan, r.x1 - 4, cz - 3, Math.PI / 2, rnd);
      break;
    }
    case 'park': {
      grid(3, 3);
      plan.props.push({ key: 'couch', x: cx + 3, z: cz - 4, rot: 0.4 }, { key: 'trash-1', x: cx - 5, z: cz + 5, rot: 0 }, { key: 'traffic-cone', x: 0, z: 0, rot: 0 });
      plan.props = plan.props.filter((p) => p.key !== 'traffic-cone');
      plan.posts.push({ x: cx + 3, z: cz - 4, r: 1.2 });
      for (const [dx, dz] of [[-9, -9], [9, 9]]) plan.lamps.push({ x: cx + dx, z: cz + dz, rot: Math.atan2(-dx, -dz) });
      plan.props.push({ key: 'park:tree', x: cx - 7, z: cz - 6, rot: 0 }, { key: 'park:tree', x: cx + 7, z: cz + 6, rot: 1 }, { key: 'park:tree', x: cx + 8, z: cz - 8, rot: 2 });
      for (const [dx, dz] of [[-7, -6], [7, 6], [8, -8]]) plan.posts.push({ x: cx + dx, z: cz + dz, r: 0.5 });
      break;
    }
    case 'tower': {
      grid(3, 3);
      plan.radio = { x: cx + 4, z: cz + 3 };
      plan.props.push({ key: 'water-tower', x: cx - 4, z: cz - 4, rot: 0, s: 1.4 });
      plan.posts.push({ x: cx - 4, z: cz - 4, r: 2.2 });
      plan.props.push({ key: 'hill:radio', x: cx + 4, z: cz + 3, rot: 0 });
      plan.posts.push({ x: cx + 4, z: cz + 3, r: 1.0 });
      plan.props.push({ key: 'barrel', x: cx + 7, z: cz - 6, rot: 0 }, { key: 'pipes', x: cx - 8, z: cz + 7, rot: 0.5 });
      plan.posts.push({ x: cx + 7, z: cz - 6, r: 0.4 });
      for (const [dx, dz] of [[-10, 10], [10, -10]]) plan.lamps.push({ x: cx + dx, z: cz + dz, rot: Math.atan2(-dx, -dz) });
      break;
    }
    default: break;
  }
}

/** Buildings (or the harbour edge, or the hill's trees) beyond the ring road: scenery only. */
function outerRing(plan: TownPlan, rnd: () => number): void {
  if (plan.outside === 'hill') {
    for (let k = -HALF + 6; k < HALF; k += 9) for (const s of [-1, 1]) {
      plan.props.push({ key: 'park:tree', x: k + rnd() * 3, z: s * (HALF + 5 + rnd() * 6), rot: rnd() * 6 });
      plan.props.push({ key: 'park:tree', x: s * (HALF + 5 + rnd() * 6), z: k + rnd() * 3, rot: rnd() * 6 });
    }
    return;
  }
  const sides: [number, number, number][] = [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]];
  for (const [sx, sz, rot] of sides) {
    if (plan.outside === 'harbour' && sz === -1) continue;
    for (let k = -HALF + 10; k < HALF; k += 20) {
      // the outer ring is mostly in the fog: the lighter models
      const def = LIGHT[Math.floor(rnd() * LIGHT.length)];
      const d = 12, off = HALF + 1 + d / 2;
      const x = sx ? sx * off : k, z = sz ? sz * off : k;
      // the front faces the ring road (inwards)
      plan.buildings.push({ key: def.key, x, z, rot: rot + Math.PI, w: 19, d, h: 8 + rnd() * 6, tint: TINTS[Math.floor(rnd() * TINTS.length)] });
    }
  }
}

/** Marks the walk grid: everything off the solids and posts (with half a metre of room). */
function rasterise(plan: TownPlan): void {
  const w = plan.walk;
  w.fill(1);
  const mark = (x0: number, z0: number, x1: number, z1: number) => {
    const a = Math.max(0, Math.floor((x0 + HALF) / WG)), b = Math.min(WN - 1, Math.floor((x1 + HALF) / WG));
    const c = Math.max(0, Math.floor((z0 + HALF) / WG)), d = Math.min(WN - 1, Math.floor((z1 + HALF) / WG));
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) w[j * WN + i] = 0;
  };
  for (const s of plan.solids) mark(s.x0 - 0.3, s.z0 - 0.3, s.x1 + 0.3, s.z1 + 0.3);
  for (const p of plan.posts) mark(p.x - p.r, p.z - p.r, p.x + p.r, p.z + p.r);
}

export function walkable(plan: TownPlan, x: number, z: number, r = 0): boolean {
  if (Math.abs(x) > HALF - 0.4 || Math.abs(z) > HALF - 0.4) return false;
  for (const s of plan.solids) if (x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r) return false;
  for (const p of plan.posts) if (Math.hypot(x - p.x, z - p.z) < p.r + r) return false;
  return true;
}

/** Pushes a circle (x, z, r) out of every solid and post; returns how far it was pushed. */
export function pushOut(plan: TownPlan, o: { x: number; z: number }, r: number, extra?: Rect[]): number {
  let moved = 0;
  const boxes = extra ? plan.solids.concat(extra) : plan.solids;
  for (const s of boxes) {
    if (o.x < s.x0 - r || o.x > s.x1 + r || o.z < s.z0 - r || o.z > s.z1 + r) continue;
    const cx = Math.max(s.x0, Math.min(o.x, s.x1)), cz = Math.max(s.z0, Math.min(o.z, s.z1));
    let dx = o.x - cx, dz = o.z - cz;
    let d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-4) {
      // inside: out through the nearest face
      const l = o.x - s.x0, rr = s.x1 - o.x, t = o.z - s.z0, b = s.z1 - o.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) { dx = -1; dz = 0; d = 0; o.x = s.x0 - r; }
      else if (m === rr) { o.x = s.x1 + r; }
      else if (m === t) { o.z = s.z0 - r; }
      else o.z = s.z1 + r;
      moved += m + r;
      continue;
    }
    const push = r - d;
    o.x += (dx / d) * push; o.z += (dz / d) * push;
    moved += push;
  }
  for (const p of plan.posts) {
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz), m = r + p.r;
    if (d >= m || d < 1e-4) continue;
    o.x += (dx / d) * (m - d); o.z += (dz / d) * (m - d);
    moved += m - d;
  }
  return moved;
}

/** Whether the straight line from a to b crosses no solid (posts are thin: ignored). */
export function lineClear(plan: TownPlan, ax: number, az: number, bx: number, bz: number, extra?: Rect[]): boolean {
  const boxes = extra ? plan.solids.concat(extra) : plan.solids;
  for (const s of boxes) {
    // slab test
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    for (const [p, d, lo, hi] of [[ax, dx, s.x0, s.x1], [az, dz, s.z0, s.z1]] as [number, number, number, number][]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 <= 1) return false;
  }
  return true;
}

// ------------------------------------------------------------------ the flow field

/**
 * Distance (in walk cells) from every walkable cell to the nearest target, by a breadth-first fill
 * over eight neighbours; zombies step down the gradient (`dir`). Rebuilt a few times a second.
 */
export class Flow {
  readonly dist = new Float32Array(WN * WN);
  private queue = new Int32Array(WN * WN);
  private inq = new Uint8Array(WN * WN);
  private blocked: Uint8Array;

  constructor(private plan: TownPlan) { this.blocked = plan.walk; }

  /** Extra blocked cells (barricades) on top of the plan's. */
  setBlocked(extra: Rect[]): void {
    const w = new Uint8Array(this.plan.walk);
    for (const s of extra) {
      const a = Math.max(0, Math.floor((s.x0 + HALF) / WG)), b = Math.min(WN - 1, Math.floor((s.x1 + HALF) / WG));
      const c = Math.max(0, Math.floor((s.z0 + HALF) / WG)), d = Math.min(WN - 1, Math.floor((s.z1 + HALF) / WG));
      for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) w[j * WN + i] = 0;
    }
    this.blocked = w;
  }

  build(targets: Spot[]): void {
    const D = this.dist, Q = this.queue, W = this.blocked, IN = this.inq, L = Q.length;
    D.fill(1e9);
    IN.fill(0);
    let head = 0, count = 0;
    const push = (k: number) => { if (IN[k]) return; IN[k] = 1; Q[(head + count) % L] = k; count++; };
    for (const t of targets) {
      const i = Math.max(0, Math.min(WN - 1, Math.floor((t.x + HALF) / WG))), j = Math.max(0, Math.min(WN - 1, Math.floor((t.z + HALF) / WG)));
      const k = j * WN + i;
      D[k] = 0;
      push(k);
    }
    // a label-correcting fill (diagonals cost 1.41): a cell is queued at most once at a time
    while (count > 0) {
      const k = Q[head];
      head = (head + 1) % L; count--;
      IN[k] = 0;
      const i = k % WN, j = (k - i) / WN, d = D[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= WN || nj >= WN) continue;
        const nk = nj * WN + ni;
        if (!W[nk]) continue;
        // no corner cutting
        if (di && dj && (!W[j * WN + ni] || !W[nj * WN + i])) continue;
        const nd = d + (di && dj ? 1.414 : 1);
        if (nd < D[nk] - 1e-3) { D[nk] = nd; push(nk); }
      }
    }
  }

  /** The direction down the field at (x, z) (a unit vector), or null off the field. */
  dir(x: number, z: number, out: { x: number; z: number }): boolean {
    const i = Math.floor((x + HALF) / WG), j = Math.floor((z + HALF) / WG);
    if (i < 0 || j < 0 || i >= WN || j >= WN) return false;
    const D = this.dist;
    let best = D[j * WN + i], bx = 0, bz = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= WN || nj >= WN) continue;
      const v = D[nj * WN + ni];
      if (v < best) { best = v; bx = di; bz = dj; }
    }
    if (!bx && !bz) return false;
    const l = Math.hypot(bx, bz);
    out.x = bx / l; out.z = bz / l;
    return true;
  }

  at(x: number, z: number): number {
    const i = Math.floor((x + HALF) / WG), j = Math.floor((z + HALF) / WG);
    if (i < 0 || j < 0 || i >= WN || j >= WN) return 1e9;
    return this.dist[j * WN + i];
  }
}
