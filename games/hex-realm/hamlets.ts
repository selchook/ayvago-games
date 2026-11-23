// Hex Realm 1.4: the overworld's buildings from the Quaternius Medieval Village Pack. Each building
// hex of the map (hexmap.ts BUILDING) that the pack can show is drawn as a plain ground tile of the
// Hexagon Kit with a small scene on it: the village's houses round the bell tower and the well, the
// market's stalls in front of the inn, the farmhouse, the stable's paddock and a harvested field,
// the windmill, the sawmill, the smithy, the archers' range, the watchtower. The middle of every
// hex stays clear, because the party stands there. Props (fences, hay, barrels, crates, carts,
// rocks) dress the scenes and the grass yards next to them.
// The castle, the wizard's spire, the ruined walls, the mine, the port and the dock stay the
// Hexagon Kit's own tiles: the pack has nothing like them.
import { hexKey, packKey, type Placed } from './keys';
import { PLACE_HEX, type Hex, type HexMap } from './hexmap';

/** One model of a scene: name, x, z (hex units, +z to the south: towards the camera), turn (degrees), scale. */
type Item = [string, number, number, number, number];

/** Scale of the houses, and of the props (drawn larger than life, so a barrel reads on the map). */
const B = 0.155, PR = 0.32;

interface Scene { ground: string; items: Item[] }

// The camera looks from the south (+z), so what stands tall goes to the back and the sides of a hex
// and only low props to its front: nothing hides the party in the middle.
const SCENES: Record<string, Scene> = {
  village: {
    ground: 'grass',
    items: [
      ['Bell_Tower', 0.02, -0.3, 0, 0.105], ['House_1', -0.29, -0.1, 0, B], ['House_2', 0.29, -0.08, 0, B * 0.9],
      ['Well', -0.2, 0.27, 0, 0.21], ['Barrel', 0.2, 0.27, 0, PR], ['Crate', 0.26, 0.31, 20, PR], ['Hay', 0.14, 0.34, 0, PR],
    ],
  },
  market: {
    ground: 'grass',
    items: [
      ['Inn', 0, -0.27, 0, 0.1], ['MarketStand_1', -0.33, 0.06, 0, 0.22], ['MarketStand_2', 0.34, 0.05, 0, 0.22],
      ['Cart', 0.17, 0.32, 30, 0.27], ['Crate', -0.15, 0.32, 0, PR], ['Barrel', -0.21, 0.27, 0, PR], ['Bags', -0.07, 0.37, 0, PR],
    ],
  },
  house: {
    ground: 'grass',
    items: [
      ['House_2', -0.16, -0.22, 0, B], ['House_1', 0.3, -0.04, 0, B * 0.85], ['Fence', -0.2, 0.36, 0, PR],
      ['Fence', 0.06, 0.37, 0, PR], ['Hay', -0.32, 0.18, 0, PR], ['Bench_1', 0.22, 0.3, 0, PR],
    ],
  },
  farmhouse: {
    ground: 'grass',
    items: [
      ['House_1', -0.12, -0.24, 0, B], ['Cart', 0.3, -0.12, -20, 0.27], ['Hay', -0.32, 0.12, 0, PR], ['Hay', -0.26, 0.2, 0, PR],
      ['Fence', -0.12, 0.37, 0, PR], ['Fence', 0.15, 0.37, 0, PR], ['Barrel', 0.3, 0.16, 0, PR],
    ],
  },
  field: {
    ground: 'dirt',
    items: [
      ['Hay', -0.24, -0.22, 0, PR * 1.4], ['Hay', 0.02, -0.3, 0, PR * 1.4], ['Hay', 0.26, -0.2, 0, PR * 1.4],
      ['Hay', -0.32, 0.1, 0, PR * 1.4], ['Hay', 0.32, 0.12, 0, PR * 1.4], ['Hay', -0.1, 0.32, 0, PR * 1.4], ['Hay', 0.14, 0.3, 0, PR * 1.4],
    ],
  },
  stable: {
    ground: 'grass',
    items: [
      ['Stable', 0.03, -0.25, 0, 0.095], ['Fence', -0.15, 0.37, 0, PR], ['Fence', 0.13, 0.37, 0, PR],
      ['Fence', -0.37, 0.1, 60, PR], ['Fence', 0.37, 0.1, -60, PR], ['Hay', -0.2, 0.17, 0, PR], ['Hay', 0.22, 0.2, 0, PR],
    ],
  },
  mill: {
    ground: 'grass',
    items: [['Mill', 0.06, -0.2, 0, 0.12], ['Bags', -0.27, 0.16, 0, PR], ['Package_1', -0.2, 0.25, 30, PR], ['Cart', 0.28, 0.2, -30, 0.27]],
  },
  sawmill: {
    ground: 'grass',
    items: [['Sawmill', 0, -0.2, 0, 0.1], ['Crate', 0.26, 0.22, 0, PR], ['Rock_1', -0.3, 0.2, 0, PR], ['Barrel', 0.18, 0.3, 0, PR]],
  },
  smithy: {
    ground: 'grass',
    items: [['Blacksmith', 0, -0.21, 0, 0.11], ['Cauldron', 0.27, 0.18, 0, PR], ['Barrel', -0.25, 0.2, 0, PR], ['Crate', -0.18, 0.29, 15, PR]],
  },
  archery: {
    ground: 'grass',
    items: [
      ['Gazebo', -0.25, -0.2, 0, 0.23], ['Hay', 0.3, -0.2, 0, PR * 1.25], ['Hay', 0.35, 0, 0, PR * 1.25], ['Hay', 0.3, 0.2, 0, PR * 1.25],
      ['Fence', 0.08, -0.38, 0, PR], ['Bench_1', -0.22, 0.26, 0, PR],
    ],
  },
  tower: {
    ground: 'grass',
    items: [
      ['Bell_Tower', 0, -0.17, 0, 0.13], ['Bonfire', 0.25, 0.2, 0, PR], ['Rock_1', -0.28, 0.17, 0, PR], ['Rock_3', -0.2, 0.27, 40, PR],
      ['Barrel', 0.3, 0.02, 0, PR],
    ],
  },
  cabin: {
    ground: 'grass',
    items: [['House_1', 0, -0.22, 0, B * 0.9], ['Crate', 0.25, 0.2, 0, PR], ['Hay', -0.25, 0.2, 0, PR]],
  },
};

/** The scene of each building the pack shows (the others stay Hexagon Kit tiles). */
const SCENE_OF: Record<string, string> = {
  'building-village': 'village', 'building-market': 'market', 'building-house': 'house', 'building-farm': 'field',
  'building-sheep': 'stable', 'building-mill': 'mill', 'building-watermill': 'sawmill', 'building-smelter': 'smithy',
  'building-archery': 'archery', 'building-tower': 'tower', 'building-cabin': 'cabin',
};

/** Props beside the Hexagon Kit's own places: the mine's crates and barrel, the ruins' rubble. */
const BESIDE: Record<string, Item[]> = {
  'building-mine': [['Crate', 0.3, 0.22, 10, PR], ['Crate', 0.36, 0.14, 40, PR], ['Barrel', 0.22, 0.3, 0, PR], ['Rock_2', -0.3, 0.24, 20, PR]],
  'building-walls': [['Rock_1', -0.32, 0.26, 0, PR], ['Rock_3', 0.3, 0.28, 60, PR]],
};

/** The props beside a Hexagon Kit place (none for the others). */
export function beside(h: Hex): Placed[] {
  const items = h.building ? BESIDE[h.building] : undefined;
  if (!items) return [];
  return items.map(([model, x, z, deg, s]) => ({ key: packKey(model), x: h.x + x, y: 0.2, z: h.z + z, rot: (deg * Math.PI) / 180, s, hex: h.i }));
}

/** Whether the pack draws this building (its ground is then a plain tile). */
export const isHamlet = (h: Hex): boolean => !!h.building && h.building in SCENE_OF;

/** The scene on a building hex: its ground tile and models, placed in world space. */
export function hamlet(h: Hex): Placed[] {
  // the farm's entrance is its farmhouse; the other farm hex, its field
  const farm = PLACE_HEX.farm;
  const name = h.building === 'building-farm' && h.c === farm[0] && h.r === farm[1] ? 'farmhouse' : SCENE_OF[h.building!];
  const sc = SCENES[name];
  // every other hex is mirrored (east for west), so two alike never look the same
  const m = (h.c + h.r) % 2 ? -1 : 1;
  const out: Placed[] = [{ key: hexKey(sc.ground), x: h.x, y: 0, z: h.z, rot: 0, s: 1, hex: h.i }];
  for (const [model, x, z, deg, s] of sc.items) {
    out.push({ key: packKey(model), x: h.x + x * m, y: 0.2, z: h.z + z, rot: (deg * m * Math.PI) / 180, s, hex: h.i });
  }
  return out;
}

/**
 * The yards round the village: on the plain grass hexes next to its buildings, a little of what
 * village life leaves about (hay bales, rocks), towards a corner of the hex, clear of its middle
 * and of the roads (which run to the edges' midpoints). Deterministic.
 */
export function countryside(map: HexMap): Placed[] {
  const out: Placed[] = [];
  const near = (h: Hex) => map.hexes.some((o) => isHamlet(o) && Math.hypot(o.x - h.x, o.z - h.z) < 1.1);
  const SETS: Item[][] = [
    [['Hay', -0.3, -0.16, 0, PR], ['Hay', -0.22, -0.24, 0, PR]],
    [['Rock_1', 0.28, 0.22, 0, PR], ['Rock_3', 0.2, 0.3, 50, PR]],
    [],
    [['Hay', 0.3, 0.2, 0, PR]],
    [['Rock_2', -0.3, 0.18, 30, PR]],
  ];
  for (const h of map.hexes) {
    if (h.building || h.terrain !== 'grass' || !near(h)) continue;
    const side = (h.c + h.r) % 2 ? -1 : 1;
    for (const [model, x, z, deg, s] of SETS[(h.c * 3 + h.r * 5) % SETS.length]) {
      out.push({ key: packKey(model), x: h.x + x * side, y: 0.2, z: h.z + z, rot: (deg * side * Math.PI) / 180, s, hex: h.i });
    }
  }
  return out;
}
