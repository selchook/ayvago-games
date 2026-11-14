// Skull Isle: the islands' ground plans (pure: the simulation walks on them, the view builds them).
// An island is a blob of sand: an ellipse with a few harmonics on its radius, so every coastline is
// its own. Props stand round the edges; tall ones only on the far (north, −z) half, so nothing
// hides the fight from the camera in the south. Each island adds its landmarks: docks, a wreck,
// cliffs, the cursed village's houses, the reef's giant bones, a ship offshore or run aground.
import { seeded, type IslandId, ISLAND_IDS } from './defs';

export interface Prop {
  model: string;
  x: number;
  z: number;
  rot: number;
  s: number;
  /** Blocking radius on the ground (0: walk through). */
  r: number;
  y?: number;
}

export interface Palette {
  sky: number;
  fog: number;
  sand: number;
  wet: number;
  grass: number;
  deep: number;
  shallow: number;
  foam: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  ambient: number;
}

export interface Layout {
  id: IslandId;
  lap: number;
  rx: number;
  rz: number;
  harm: [number, number, number][];
  props: Prop[];
  /** Water spots a tentacle can rise from (just off the shore, near the docks if any). */
  tentacleSpots: { x: number; z: number }[];
  /** The cannon ship offshore (village) or the captain's ship run aground (reef). */
  ship: { x: number; z: number; rot: number; beached: boolean } | null;
  /** Tide pools (reef). */
  pools: { x: number; z: number; r: number }[];
  /** Grass patches on the sand (centre, radius). */
  grass: { x: number; z: number; r: number }[];
  palette: Palette;
}

export const PALETTES: Record<IslandId, Palette> = {
  cove: { sky: 0x8fd8ff, fog: 0xa9e2fb, sand: 0xf2d79a, wet: 0xc9a86a, grass: 0x8cc152, deep: 0x157fb5, shallow: 0x3fe0cf, foam: 0xffffff, sun: 0xfff4e0, sunI: 2.3, hemiSky: 0xe8f6ff, hemiGround: 0x9a8566, ambient: 1.5 },
  docks: { sky: 0xf6b08a, fog: 0xf0b896, sand: 0xe9d2a8, wet: 0xb89a70, grass: 0x8aa84a, deep: 0x2a6496, shallow: 0x4cbfbf, foam: 0xfff1e0, sun: 0xffdcb8, sunI: 2.0, hemiSky: 0xffdcc4, hemiGround: 0x6a5060, ambient: 1.4 },
  kraken: { sky: 0x5f7f96, fog: 0x6a8a9c, sand: 0xc9b58f, wet: 0x8f7d62, grass: 0x6f8c4c, deep: 0x1c4d6b, shallow: 0x3d8f92, foam: 0xdff4ff, sun: 0xdfeaff, sunI: 1.7, hemiSky: 0xbcd2e2, hemiGround: 0x3c4650, ambient: 1.45 },
  village: { sky: 0x6c5d8f, fog: 0x7a6a92, sand: 0xd2c4a2, wet: 0x8e8070, grass: 0x6e9a5a, deep: 0x2b3f6b, shallow: 0x4f8f8a, foam: 0xd9e6ff, sun: 0xe0f0d0, sunI: 1.9, hemiSky: 0xccc2ec, hemiGround: 0x4a4058, ambient: 1.6 },
  reef: { sky: 0xffa77a, fog: 0xf4a07e, sand: 0xf4e6cc, wet: 0xc9b08e, grass: 0xa0b860, deep: 0x235a8a, shallow: 0x46c8c0, foam: 0xffffff, sun: 0xffd2a6, sunI: 2.2, hemiSky: 0xffe0cc, hemiGround: 0x7a5a5a, ambient: 1.45 },
};

const SIZE: Record<IslandId, [number, number]> = { cove: [10.5, 14], docks: [10, 13.5], kraken: [11, 13], village: [11, 14.5], reef: [11.5, 14] };

/** Distance from the centre to the shore in direction θ (atan2(z, x)). */
export function shoreAt(L: Layout, th: number): number {
  const c = Math.cos(th) / L.rx, s = Math.sin(th) / L.rz;
  let r = 1 / Math.sqrt(c * c + s * s);
  let k = 1;
  for (const [n, a, p] of L.harm) k += a * Math.sin(n * th + p);
  return r * k;
}

/** Signed distance to the shore (negative on land), along the ray from the centre. */
export function landD(L: Layout, x: number, z: number): number {
  return Math.hypot(x, z) - shoreAt(L, Math.atan2(z, x));
}

/** The point on the shore in direction θ, pushed `off` units out to sea (negative: inland). */
export function shorePoint(L: Layout, th: number, off = 0): { x: number; z: number } {
  const r = shoreAt(L, th) + off;
  return { x: Math.cos(th) * r, z: Math.sin(th) * r };
}

/** The island k of a run (0-based), the same every time for the same lap. */
export function layout(k: number): Layout {
  const id = ISLAND_IDS[k % ISLAND_IDS.length];
  const lap = Math.floor(k / ISLAND_IDS.length);
  const rnd = seeded(9137 + k * 7919);
  const [rx, rz] = SIZE[id];
  const L: Layout = {
    id, lap, rx, rz,
    harm: [[3, 0.05 + rnd() * 0.03, rnd() * 6.28], [5, 0.025 + rnd() * 0.02, rnd() * 6.28], [2, 0.03, rnd() * 6.28]],
    props: [], tentacleSpots: [], ship: null, pools: [], grass: [], palette: PALETTES[id],
  };
  const P = L.props;
  const R = (a: number, b: number) => a + rnd() * (b - a);
  /** A point near the edge: angle (radians, −π/2 is north), how far in (0 = shore). */
  const edge = (th: number, inset: number) => shorePoint(L, th, -inset);
  const add = (model: string, th: number, inset: number, s: number, r: number, rot = rnd() * 6.28) => {
    const p = edge(th, inset);
    P.push({ model, x: p.x, z: p.z, rot, s, r });
  };
  // palms round the north half and the sides, rocks scattered, low clutter in the south
  const palms = id === 'village' ? 3 : id === 'reef' ? 3 : 7;
  // the kraken's and the captain's islands keep the north beach clear (the boss comes ashore there)
  const clearNorth = id === 'kraken' || id === 'reef';
  for (let i = 0; i < palms; i++) {
    const th = -Math.PI + (i + 0.5) / palms * Math.PI + R(-0.12, 0.12);
    if (clearNorth && Math.abs(th + Math.PI / 2) < 0.6) continue;
    add('palm' + (1 + (i % 3)), th, R(1.2, 2.6), R(1.5, 1.9), 0.45);
  }
  for (let i = 0; i < 4; i++) add('rock', R(0, 6.28), R(1, 2.2), R(0.9, 1.5), 0.45);
  for (let i = 0; i < 3; i++) add('k:rocks-sand-c', R(0.2, Math.PI - 0.2), R(-1.6, -0.6), R(0.32, 0.45), 0);
  for (let i = 0; i < 2; i++) add('k:rocks-c', R(-Math.PI, 0), R(-2.2, -1.2), R(0.4, 0.6), 0);
  L.grass.push({ x: R(-3, 3), z: R(-6, -3), r: R(2.5, 3.5) }, { x: R(-5, 5), z: R(2, 5), r: R(1.8, 2.6) });

  switch (id) {
    case 'cove':
      add('ship-small', 2.3, -0.2, 1, 1.2, 0.8);
      add('barrel', -2.6, 1.6, 1.1, 0.4);
      add('barrel', -2.4, 1.3, 1.1, 0.4);
      add('bucket-fishes', 0.9, 1.4, 1.1, 0.35);
      add('anchor', -0.5, 2.5, 1.4, 0);
      add('chest-gold', -1.95, 1.4, 0.8, 0.6, 2.2);
      break;
    case 'docks': {
      for (const th of [-1.15, -Math.PI / 2 + 0.25, -2.1]) {
        const p = edge(th, -1.4);
        P.push({ model: 'dock', x: p.x, z: p.z, rot: -th + Math.PI / 2, s: 1.6, r: 0, y: 0.25 });
        const q = edge(th, -1.4 - 2.6);
        P.push({ model: 'dock-broken', x: q.x, z: q.z, rot: -th + Math.PI / 2, s: 1.6, r: 0, y: 0.25 });
        L.tentacleSpots.push(edge(th + 0.32, -1.6), edge(th - 0.32, -1.6));
        const b = edge(th + 0.5, -3.5);
        P.push({ model: 'ship-small', x: b.x, z: b.z, rot: -th, s: 1, r: 0, y: -0.15 });
      }
      for (let i = 0; i < 5; i++) add(i % 2 ? 'barrel' : 'k:crate', R(-Math.PI, 0), R(0.8, 1.8), i % 2 ? 1.1 : 0.7, 0.45);
      add('bucket-fishes', 1.2, 1.2, 1.1, 0.35);
      add('anchor', 2.0, 2.0, 1.4, 0);
      break;
    }
    case 'kraken':
      add('cliff3', -Math.PI / 2 - 1.05, -1.2, 1.1, 2.4, 0.4);
      add('cliff1', -Math.PI / 2 + 1.0, -1, 1.1, 2.2, 2.1);
      add('cliff1', 0.1, -1.2, 0.9, 1.8, 1.2);
      add('dock-broken', 2.4, -1.6, 1.6, 0);
      add('skull', 1.4, 2, 1.6, 0.3);
      add('barrel', 2.6, 1.6, 1.1, 0.4);
      for (let i = 0; i < 8; i++) L.tentacleSpots.push(edge(-Math.PI + (i + 0.5) / 8 * Math.PI * 1.3 - 0.15, -1.5));
      break;
    case 'village':
      add('house1', -Math.PI / 2 - 0.2, 1.4, 0.62, 0, Math.PI);
      add('house2', -Math.PI / 2 - 1.0, 1.4, 0.62, 0, Math.PI * 0.75);
      add('house3', -Math.PI / 2 + 0.75, 1.6, 0.6, 0, Math.PI * 1.2);
      add('sawmill', -0.15, 2.2, 1.3, 1.2, 1.6);
      for (let i = 0; i < 4; i++) add('barrel', R(-Math.PI, 0.3), R(1.6, 2.6), 1.1, 0.4);
      // the cannon ship offshore, to the east
      { const p = edge(0.3, -9); L.ship = { x: p.x, z: p.z, rot: Math.PI / 2 + 0.3, beached: false }; }
      break;
    case 'reef':
      add('bones', -Math.PI / 2 - 0.9, 1.2, 0.85, 0, 0.6);
      add('bones', 0.6, 1.4, 0.7, 0, 2.2);
      add('skulls', -Math.PI + 0.35, 1.0, 0.75, 1.8, 1.3);
      add('skull', 1.2, 2.2, 1.6, 0.3);
      { const p = edge(-Math.PI / 2, -2.5); L.ship = { x: p.x, z: p.z, rot: 0.08, beached: true }; }
      for (let i = 0; i < 3; i++) {
        const th = [-2.4, 0.4, 2.0][i];
        const p = edge(th, 3.2);
        L.pools.push({ x: p.x, z: p.z, r: 2.4 });
      }
      for (let i = 0; i < 6; i++) L.tentacleSpots.push(edge(-Math.PI + (i + 0.5) / 6 * Math.PI * 2, -1.6));
      break;
  }
  // house walls block as a row of circles (their own r is 0)
  for (const p of [...P]) {
    if (p.model.startsWith('house')) {
      const half = p.model === 'house1' ? 3.6 : p.model === 'house3' ? 2.4 : 1;
      const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
      for (let u = -half; u <= half + 0.01; u += 0.9) P.push({ model: '', x: p.x + ca * u, z: p.z - sa * u, rot: 0, s: 1, r: 1.25 });
    }
  }
  if (!L.tentacleSpots.length) for (let i = 0; i < 6; i++) L.tentacleSpots.push(edge(-Math.PI + (i + 0.5) / 6 * Math.PI * 2, -1.6));
  return L;
}
