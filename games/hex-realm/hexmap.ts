// Hex Realm: the overworld as data. An 11 x 17 map of pointy-top hexes (odd rows shifted right)
// laid out by hand: the village in the south, farms, a mine in the western hills, a ruined fort, a
// wizard's spire, a port on the lake, and across the river the dark castle. Roads are found once
// between the places over flat ground and drawn as the Hexagon Kit's path pieces; rivers take the
// kit's river pieces. Pure logic: neighbours, travel costs, A* paths, fog and the encounter table.
import type { FoeKind, PlaceId, Wave } from './defs';

export const COLS = 11;
export const ROWS = 17;
/** Hex size: 1 unit across the flat sides, rows 0.866 apart. */
export const ROW_H = Math.sqrt(3) / 2;

export type Terrain = 'grass' | 'forest' | 'hill' | 'stone' | 'rhill' | 'mount' | 'rocks' | 'water' | 'island' | 'wrocks'
  | 'river' | 'bridge' | 'dirt' | 'lumber' | 'sand' | 'srocks';

/** Legend of the layout below; capitals are places and buildings on their own tile. */
const LEGEND: Record<string, Terrain> = {
  '.': 'grass', f: 'forest', h: 'hill', s: 'stone', H: 'rhill', M: 'mount', r: 'rocks', w: 'water', i: 'island', q: 'wrocks',
  '~': 'river', b: 'bridge', d: 'dirt', l: 'lumber', S: 'sand', R: 'srocks',
};

/** Buildings (the kit's building-* tiles) by letter. */
export const BUILDING: Record<string, string> = {
  C: 'building-castle', T: 'building-wizard-tower', X: 'building-walls', N: 'building-mine', O: 'building-port', D: 'building-dock',
  V: 'building-village', K: 'building-market', Q: 'building-house', F: 'building-farm', P: 'building-sheep', L: 'building-mill',
  W: 'building-watermill', Y: 'building-tower', Z: 'building-cabin', A: 'building-archery', G: 'building-smelter',
};

const LAYOUT = [
  'MMMHrCrHMMM',
  'MMHr...rHMM',
  'MHs.s.s.sHM',
  'Hf.s.d.s.fH',
  '~~~~~b~~~~~',
  'hf..f..f.fh',
  'HTh.f.f.fXh',
  'hh...f...ww',
  'Hf.f.Y..ODw',
  'MH.f.f.f.ww',
  'MNh.f..lf.w',
  'MHh..f.F.qw',
  'Hh.fGL.FP.w',
  'f.f.QVK..ff',
  'ww.f..AW.ff',
  'wwi.f.f.fff',
  'wwwff.fhMMM',
];

/** The places a hex opens (any village building opens the village). */
const PLACE_AT: Record<string, PlaceId> = { V: 'village', K: 'village', Q: 'village', F: 'farm', N: 'mine', X: 'fort', T: 'tower', O: 'port', C: 'castle' };
/** Where each place's entrance stands (its marker). */
export const PLACE_HEX: Record<PlaceId, [number, number]> = {
  village: [5, 13], farm: [7, 11], mine: [1, 10], fort: [9, 6], tower: [1, 6], port: [8, 8], castle: [5, 0],
};
export const BRIDGE: [number, number] = [5, 4];
export const START: [number, number] = [5, 13];

export interface Hex {
  c: number;
  r: number;
  i: number;
  x: number;
  z: number;
  terrain: Terrain;
  building: string | null;
  place: PlaceId | null;
  road: boolean;
  /** Road and river pieces: which of the six edges they reach (bit k: 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE). */
  roadEdges: number;
  riverEdges: number;
  /** The camp on it (a placed fight), if any. */
  camp: number;
}

export const hexIndex = (c: number, r: number): number => r * COLS + c;
export const inMap = (c: number, r: number): boolean => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/** World position of a hex's centre. */
export function hexPos(c: number, r: number): { x: number; z: number } {
  return { x: c + (r & 1 ? 0.5 : 0) - (COLS - 1) / 2 - 0.25, z: (r - (ROWS - 1) / 2) * ROW_H };
}

/** The six neighbours in edge order (E, SE, SW, W, NW, NE); off-map ones are null. */
export function neighbours(c: number, r: number): ([number, number] | null)[] {
  const odd = r & 1;
  const d: [number, number][] = odd
    ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]]
    : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  return d.map(([dc, dr]) => (inMap(c + dc, r + dr) ? [c + dc, r + dr] : null));
}

/** Hex distance (cube coordinates). */
export function hexDist(c1: number, r1: number, c2: number, r2: number): number {
  const cube = (c: number, r: number) => { const x = c - (r - (r & 1)) / 2; return [x, r, -x - r]; };
  const a = cube(c1, r1), b = cube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** The hex nearest a world point. */
export function hexAt(x: number, z: number): [number, number] | null {
  let best: [number, number] | null = null, bd = 0.62;
  const r0 = Math.round(z / ROW_H + (ROWS - 1) / 2);
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!inMap(c, r)) continue;
      const p = hexPos(c, r), d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = [c, r]; }
    }
  }
  return best;
}

const FLAT: Terrain[] = ['grass', 'dirt', 'sand', 'stone'];
const IMPASSABLE: Terrain[] = ['mount', 'water', 'island', 'wrocks', 'river'];
/** Terrain that hides foes: random encounters happen there (and on the dark side of the river). */
export const WILD: Terrain[] = ['forest', 'hill', 'rhill', 'rocks', 'srocks', 'lumber'];

export class HexMap {
  readonly hexes: Hex[] = [];

  constructor() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = LAYOUT[r][c];
        const building = BUILDING[ch] ?? null;
        const p = hexPos(c, r);
        this.hexes.push({
          c, r, i: hexIndex(c, r), x: p.x, z: p.z,
          terrain: LEGEND[ch] ?? (ch === 'D' ? 'water' : 'grass'),
          building, place: PLACE_AT[ch] ?? null, road: false, roadEdges: 0, riverEdges: 0, camp: -1,
        });
      }
    }
    this.layRivers();
    this.layRoads();
    CAMPS.forEach((cp, k) => { this.at(cp.hex[0], cp.hex[1]).camp = k; });
  }

  at(c: number, r: number): Hex { return this.hexes[hexIndex(c, r)]; }

  /** Can the party stand here? (The bridge is open or not: the campaign decides.) */
  passable(h: Hex): boolean {
    if (h.building === 'building-dock') return false;
    return !IMPASSABLE.includes(h.terrain);
  }

  /** Seconds to walk onto a hex (roads are quicker). */
  stepCost(h: Hex): number {
    if (h.road || h.place) return 0.26;
    if (h.terrain === 'forest' || h.terrain === 'hill' || h.terrain === 'rhill' || h.terrain === 'rocks') return 0.42;
    return 0.32;
  }

  private layRivers(): void {
    for (const h of this.hexes) {
      if (h.terrain !== 'river' && h.terrain !== 'bridge') continue;
      let e = 0;
      neighbours(h.c, h.r).forEach((n, k) => {
        // a river runs off the map's edge, or on into the next river hex
        if (!n) { if (k === 0 || k === 3) e |= 1 << k; return; }
        const t = this.at(n[0], n[1]).terrain;
        if (t === 'river' || t === 'bridge' || t === 'water') e |= 1 << k;
      });
      h.riverEdges = e;
    }
  }

  /** Roads between the places over flat ground (found once, deterministic). */
  private layRoads(): void {
    const links: [PlaceId | 'bridge', PlaceId | 'bridge'][] = [
      ['village', 'farm'], ['village', 'mine'], ['village', 'port'], ['port', 'fort'], ['village', 'bridge'],
      ['bridge', 'castle'], ['mine', 'tower'],
    ];
    const hexOf = (p: PlaceId | 'bridge') => (p === 'bridge' ? BRIDGE : PLACE_HEX[p]);
    for (const [a, b] of links) {
      const [ac, ar] = hexOf(a), [bc, br] = hexOf(b);
      const path = this.findPath(ac, ar, bc, br, (h) => {
        if (h.place || h.terrain === 'bridge' || h.road) return 1;
        if (h.building) return 1e6;
        return FLAT.includes(h.terrain) ? 2 : 1e6;
      });
      if (!path) continue;
      const full: [number, number][] = [[ac, ar], ...path];
      for (let i = 0; i < full.length; i++) {
        const h = this.at(full[i][0], full[i][1]);
        if (!h.place && h.terrain !== 'bridge') h.road = true;
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= full.length) continue;
          const k = neighbours(h.c, h.r).findIndex((n) => !!n && n[0] === full[j][0] && n[1] === full[j][1]);
          if (k >= 0) h.roadEdges |= 1 << k;
        }
      }
    }
  }

  /**
   * A* from (c0, r0) to (c1, r1); returns the hexes after the start, or null. `cost` gives the cost
   * of entering a hex (≥ 1e6 = blocked); the goal may be blocked to others (a place).
   */
  findPath(c0: number, r0: number, c1: number, r1: number, cost: (h: Hex) => number): [number, number][] | null {
    const start = hexIndex(c0, r0), goal = hexIndex(c1, r1);
    const g = new Map<number, number>([[start, 0]]);
    const from = new Map<number, number>();
    const open: number[] = [start];
    const f = new Map<number, number>([[start, hexDist(c0, r0, c1, r1)]]);
    const closed = new Set<number>();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if ((f.get(open[i]) ?? 1e9) < (f.get(open[bi]) ?? 1e9)) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) {
        const out: [number, number][] = [];
        let k = cur;
        while (k !== start) { const h = this.hexes[k]; out.unshift([h.c, h.r]); k = from.get(k)!; }
        return out;
      }
      closed.add(cur);
      const h = this.hexes[cur];
      for (const n of neighbours(h.c, h.r)) {
        if (!n) continue;
        const ni = hexIndex(n[0], n[1]);
        if (closed.has(ni)) continue;
        const nh = this.hexes[ni];
        const step = ni === goal ? Math.min(1, cost(nh)) : cost(nh);
        if (step >= 1e6) continue;
        const ng = (g.get(cur) ?? 0) + step;
        if (ng < (g.get(ni) ?? Infinity)) {
          g.set(ni, ng);
          from.set(ni, cur);
          f.set(ni, ng + hexDist(n[0], n[1], c1, r1));
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    return null;
  }

  /** Hexes within `rad` of a hex. */
  around(c: number, r: number, rad: number): Hex[] {
    return this.hexes.filter((h) => hexDist(c, r, h.c, h.r) <= rad);
  }
}

// ------------------------------------------------------------------ camps and encounters

export interface Camp {
  id: string;
  hex: [number, number];
  level: number;
  waves: Wave[];
}

/** Placed fights (skull banners on the map): cleared once per cycle, each with a chest. */
export const CAMPS: Camp[] = [
  { id: 'den', hex: [3, 12], level: 2, waves: [[['bandit', 3]], [['bandit', 2], ['archer', 1]]] },
  { id: 'brutes', hex: [2, 10], level: 4, waves: [[['bandit', 2], ['archer', 2]], [['brute', 1], ['bandit', 2]]] },
  { id: 'bones', hex: [1, 8], level: 5, waves: [[['skeleton', 3], ['ghoul', 1]], [['ghoul', 3], ['skeleton', 2]]] },
  { id: 'ruins', hex: [6, 5], level: 7, waves: [[['skeleton', 2], ['acolyte', 2]], [['knight', 1], ['ghoul', 3]]] },
  { id: 'cult', hex: [3, 2], level: 10, waves: [[['cultist', 2], ['acolyte', 2]], [['cultist', 2], ['brute', 1], ['ghoul', 2]]] },
  { id: 'guard', hex: [7, 2], level: 11, waves: [[['knight', 2], ['archer', 2]], [['knight', 2], ['cultist', 2]]] },
];

/** The level of foes met at random on a row of the map, and who they are. */
export function regionOf(r: number): { level: number; pool: FoeKind[]; arena: 'field' | 'forest' } {
  if (r <= 3) return { level: 10, pool: ['knight', 'cultist', 'acolyte', 'brute', 'ghoul', 'archer'], arena: 'field' };
  if (r <= 8) return { level: 6, pool: ['skeleton', 'ghoul', 'archer', 'acolyte', 'bandit', 'brute'], arena: 'forest' };
  if (r <= 11) return { level: 3, pool: ['bandit', 'archer', 'skeleton', 'ghoul'], arena: 'forest' };
  return { level: 1, pool: ['bandit', 'bandit', 'archer'], arena: 'field' };
}
