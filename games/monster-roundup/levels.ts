// Monster Roundup: the twenty levels, four sectors of five, each drawn as a block map (one character
// per 4 m block; row 0 is the far, north side, the camera looks north). Walls rise on every edge
// between a floor block and a solid one; solid blocks get a roof cap.
//   #  solid        .  floor        P  the mech's start      m  a monster (the level's list, in order)
//   C  containment pod (bank a towed monster in its ring)    F  the boss's containment field (also a pod)
//   E  the exit lift (opens at the quota)                    B  the boss
//   D  a door (opens for the mech)    L  a locked door        K  the terminal that unlocks the locked doors
//   z  a laser gate across a passage (on, off, on ...)       r  a sweeping laser turret
//   > < ^ v  conveyor belts           o  a vent (monsters hop in and pop out of another)
//   t  teleporter pads (in pairs, in reading order)          i  ice
//   x  a crate (two bolts break it: a power or a snack inside)  c  a chest (a power)
//   s  a snack (energy cells: monsters eat them to evolve)   p  a power on the floor
//   +  a stack of crates and shelves (solid)
import { BLOCK, SECTOR_IDS, type BossId, type MonsterId, type SectorId } from './defs';

export const LEVELS_PER_SECTOR = 5;

interface RawLevel {
  map: string[];
  monsters: MonsterId[];
  /** Captures needed to open the exit (a boss level: the boss). */
  quota: number;
  /** Seconds for the third star. */
  par: number;
  boss?: BossId;
  /** The first-time hints shown in this level (strings: h_<hint>), one after the other. */
  hint?: string | string[];
}

export const RAW: RawLevel[] = [
  // ---------------------------------------------------------------- 1: the containment lab
  {
    map: [
      '#########',
      '#.m...E.#',
      '#.......#',
      '#...C...#',
      '#.m...m.#',
      '#...s...#',
      '#.P...m.#',
      '#########',
    ],
    monsters: ['frog', 'frog', 'frog', 'frog'], quota: 4, par: 75, hint: 'tow',
  },
  {
    map: [
      '###########',
      '#.m..#..m.#',
      '#....#....#',
      '#.s..D..C.#',
      '#....#....#',
      '#.P..#.m..#',
      '#..m.#..E.#',
      '###########',
    ],
    monsters: ['frog', 'monkroose', 'monkroose', 'frog'], quota: 3, par: 95, hint: 'runner',
  },
  {
    map: [
      '############',
      '#.m..x#.m..#',
      '#.....#....#',
      '#..C..D..s.#',
      '#.....#....#',
      '##D####.m..#',
      '#.....#....#',
      '#.P.p.D..E.#',
      '#..m..#.x..#',
      '############',
    ],
    monsters: ['fish', 'fish', 'frog', 'monkroose'], quota: 5, par: 125, hint: 'split',
  },
  {
    map: [
      '#############',
      '#.m..C#..m..#',
      '#.....#.....#',
      '#.>>>.L..C..#',
      '#.....#.....#',
      '#..K..#.m.s.#',
      '#.....#######',
      '#.P.m.#..m..#',
      '#..x..D..E..#',
      '#############',
    ],
    monsters: ['frog', 'monkroose', 'fish', 'frog', 'monkroose'], quota: 5, par: 150, hint: 'terminal',
  },
  {
    map: [
      '###########',
      '#....B....#',
      '#.........#',
      '#..+...+..#',
      '#....F....#',
      '#.........#',
      '#.p.....p.#',
      '#....P....#',
      '###########',
    ],
    monsters: [], quota: 1, par: 120, boss: 'mushroom-king', hint: 'boss',
  },
  // ---------------------------------------------------------------- 2: the hydroponic gardens
  {
    map: [
      '#############',
      '#.m..o#..m..#',
      '#.....D.....#',
      '#..C..#.s.o.#',
      '##D####.....#',
      '#..m..#..m..#',
      '#.o...D.....#',
      '#.P.s.#..E..#',
      '#############',
    ],
    monsters: ['birb', 'frog', 'birb', 'frog'], quota: 3, par: 130, hint: 'caller',
  },
  {
    map: [
      '############',
      '#.m.....m..#',
      '#..........#',
      '#..+..C.+..#',
      '#.s........#',
      '#....m...s.#',
      '#.P......m.#',
      '#..E.......#',
      '############',
    ],
    monsters: ['bunny', 'bunny', 'frog', 'birb'], quota: 3, par: 115, hint: 'leaper',
  },
  {
    map: [
      '#############',
      '#.m...#...m.#',
      '#.....D.....#',
      '#.vvv.#.<<<.#',
      '#.....#.....#',
      '#.C.x.#.m.s.#',
      '###D#####D###',
      '#..m.......E#',
      '#.P....p....#',
      '#############',
    ],
    monsters: ['mushroom-king', 'dino', 'frog', 'dino'], quota: 3, par: 150, hint: ['spore', 'bite'],
  },
  {
    map: [
      '#############',
      '#.m..#...m..#',
      '#....z......#',
      '#C...#..s...#',
      '##z###..+...#',
      '#.....#.....#',
      '#.m.s.D..m..#',
      '#.P...#..E..#',
      '#############',
    ],
    monsters: ['bunny', 'birb', 'mushroom-king', 'bunny'], quota: 3, par: 150, hint: 'laser',
  },
  {
    map: [
      '###########',
      '#....B....#',
      '#.........#',
      '#.+.....+.#',
      '#....F....#',
      '#.+.....+.#',
      '#..p...p..#',
      '#....P....#',
      '###########',
    ],
    monsters: [], quota: 1, par: 140, boss: 'cactoro',
  },
  // ---------------------------------------------------------------- 3: the cryo deck
  {
    map: [
      '#############',
      '#.m..iii..m.#',
      '#...iiiii...#',
      '#.C.iiiii.s.#',
      '#...iiiii...#',
      '#.m..iii..m.#',
      '#.P.......E.#',
      '#############',
    ],
    monsters: ['monkroose', 'orc', 'monkroose', 'frog'], quota: 3, par: 120, hint: 'ice',
  },
  {
    map: [
      '#############',
      '#.m.t.#.t.m.#',
      '#.....#.....#',
      '#..C..#..s..#',
      '#.....#.....#',
      '###D#####D###',
      '#.m.......m.#',
      '#.P..iii..E.#',
      '#############',
    ],
    monsters: ['ninja', 'ninja', 'monkroose', 'orc'], quota: 3, par: 150, hint: 'blinker',
  },
  {
    map: [
      '##############',
      '#.m...#....m.#',
      '#.....z......#',
      '#..C..#..ii..#',
      '#.....#..ii..#',
      '###z######D###',
      '#..m...s.....#',
      '#.P........m.#',
      '#.....E......#',
      '##############',
    ],
    monsters: ['alien', 'alien', 'orc', 'ninja'], quota: 3, par: 160, hint: 'lobber',
  },
  {
    map: [
      '##############',
      '#.m....#..m..#',
      '#..r...L.....#',
      '#......#..r..#',
      '#.C..K.#..C..#',
      '####D#########',
      '#.m.....s..m.#',
      '#.P..x.....E.#',
      '##############',
    ],
    monsters: ['orc', 'cactoro', 'ninja', 'monkroose'], quota: 3, par: 170, hint: ['spiky', 'sweeper'],
  },
  {
    map: [
      '############',
      '#....B.....#',
      '#..i....i..#',
      '#.+......+.#',
      '#....F.....#',
      '#..i....i..#',
      '#.p......p.#',
      '#....P.....#',
      '############',
    ],
    monsters: [], quota: 1, par: 150, boss: 'yeti',
  },
  // ---------------------------------------------------------------- 4: the reactor core
  {
    map: [
      '#############',
      '#.m...#..m..#',
      '#..r..D.....#',
      '#.....#..C..#',
      '#.s...#...r.#',
      '##D######D###',
      '#..m.....m..#',
      '#.P...x...E.#',
      '#############',
    ],
    monsters: ['yeti', 'yeti', 'cactoro', 'dino'], quota: 3, par: 160, hint: 'evolve',
  },
  {
    map: [
      '##############',
      '#.m.>>>>>..m.#',
      '#............#',
      '#..C..++..s..#',
      '#............#',
      '#.m.<<<<<..m.#',
      '#.P........E.#',
      '##############',
    ],
    monsters: ['bunny', 'bunny', 'fish', 'ninja'], quota: 4, par: 150,
  },
  {
    map: [
      '##############',
      '#.m..o#.m..o.#',
      '#.....L......#',
      '#..C..#..s...#',
      '##D#######D###',
      '#..m..z...m..#',
      '#.K..o#.o..r.#',
      '#.P...#..x.E.#',
      '##############',
    ],
    monsters: ['yeti', 'cactoro', 'mushroom-king', 'ninja'], quota: 3, par: 175,
  },
  {
    map: [
      '###############',
      '#.m..r..#..m..#',
      '#.......z.....#',
      '#.C..s..#.x...#',
      '#.+.....#...C.#',
      '###D#######D###',
      '#.m..>>>>>..m.#',
      '#.......r.....#',
      '#.P...p...E.m.#',
      '###############',
    ],
    monsters: ['dino', 'yeti', 'cactoro', 'birb', 'fish'], quota: 4, par: 200,
  },
  {
    map: [
      '#############',
      '#.....B.....#',
      '#...........#',
      '#...+...+...#',
      '#.....F.....#',
      '#...+...+...#',
      '#.p.......p.#',
      '#.....P.....#',
      '#############',
    ],
    monsters: [], quota: 1, par: 170, boss: 'alien',
  },
];

export const LEVEL_COUNT = RAW.length;
export const sectorIndex = (n: number): number => Math.floor((n - 1) / LEVELS_PER_SECTOR);
export const sectorOf = (n: number): SectorId => SECTOR_IDS[sectorIndex(n)];
export const inSectorOf = (n: number): number => ((n - 1) % LEVELS_PER_SECTOR) + 1;
export const parOf = (n: number): number => RAW[n - 1].par;

// ------------------------------------------------------------------ the built level

export interface Pt { x: number; z: number }
export interface Door extends Pt { id: number; /** The passage runs along x ('x') or z ('z'). */ axis: 'x' | 'z'; locked: boolean }
export interface Spawn extends Pt { id: MonsterId }
export interface Conveyor { c: number; r: number; dx: number; dz: number }
/** Furniture against the walls (solid: a circle of radius r). */
export type DecorKind = 'shelf' | 'computer' | 'capsule' | 'container' | 'vessels' | 'crates';
export interface Decor extends Pt { kind: DecorKind; rot: number; r: number }

export interface Level {
  n: number;
  sector: SectorId;
  cols: number;
  rows: number;
  map: string[];
  start: Pt;
  pods: Pt[];
  field: Pt | null;
  exit: Pt | null;
  doors: Door[];
  terminals: Pt[];
  lasers: (Pt & { axis: 'x' | 'z' })[];
  turrets: Pt[];
  conveyors: Conveyor[];
  vents: Pt[];
  teles: (Pt & { to: number })[];
  crates: Pt[];
  chests: Pt[];
  snacks: Pt[];
  powers: Pt[];
  stacks: Pt[];
  decor: Decor[];
  spawns: Spawn[];
  boss: (Pt & { id: BossId }) | null;
  quota: number;
  par: number;
  hints: string[];
  /** Total monsters to capture (a fish splits into two). */
  total: number;
}

const centre = (c: number, r: number): Pt => ({ x: (c + 0.5) * BLOCK, z: (r + 0.5) * BLOCK });

const cache = new Map<number, Level>();

/** The mech select's bay (level 0): a wide lab room, two pods at the back, no monsters. */
const BAY: RawLevel = {
  map: [
    '###########',
    '#.........#',
    '#.C.....C.#',
    '#.........#',
    '#....P....#',
    '#.........#',
    '###########',
  ],
  monsters: [], quota: 0, par: 0,
};

/** A level (1..LEVEL_COUNT), or the mech select's bay (0). */
export function buildLevel(n: number): Level {
  const hit = cache.get(n);
  if (hit) return hit;
  const raw = n === 0 ? BAY : RAW[n - 1];
  const map = raw.map;
  const rows = map.length, cols = map[0].length;
  const at = (c: number, r: number): string => (r < 0 || r >= rows || c < 0 || c >= cols ? '#' : map[r][c]);
  const floor = (c: number, r: number): boolean => at(c, r) !== '#';
  const L: Level = {
    n, sector: n === 0 ? 'lab' : sectorOf(n), cols, rows, map, start: centre(1, rows - 2), pods: [], field: null, exit: null, doors: [], terminals: [], lasers: [], turrets: [],
    conveyors: [], vents: [], teles: [], crates: [], chests: [], snacks: [], powers: [], stacks: [], decor: [], spawns: [], boss: null,
    quota: raw.quota, par: raw.par, hints: raw.hint ? (Array.isArray(raw.hint) ? raw.hint : [raw.hint]) : [], total: 0,
  };
  let mi = 0;
  const teleIdx: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = map[r][c];
    const p = centre(c, r);
    const passage = (): 'x' | 'z' => (floor(c - 1, r) && floor(c + 1, r) && !(floor(c, r - 1) && floor(c, r + 1)) ? 'x' : 'z');
    switch (ch) {
      case 'P': L.start = p; break;
      case 'C': L.pods.push(p); break;
      case 'F': L.field = p; break;
      case 'E': L.exit = p; break;
      case 'D': case 'L': L.doors.push({ ...p, id: L.doors.length, axis: passage(), locked: ch === 'L' }); break;
      case 'K': L.terminals.push(p); break;
      case 'z': L.lasers.push({ ...p, axis: passage() }); break;
      case 'r': L.turrets.push(p); break;
      case '>': L.conveyors.push({ c, r, dx: 1, dz: 0 }); break;
      case '<': L.conveyors.push({ c, r, dx: -1, dz: 0 }); break;
      case '^': L.conveyors.push({ c, r, dx: 0, dz: -1 }); break;
      case 'v': L.conveyors.push({ c, r, dx: 0, dz: 1 }); break;
      case 'o': L.vents.push(p); break;
      case 't': teleIdx.push(L.teles.length); L.teles.push({ ...p, to: -1 }); break;
      case 'x': L.crates.push(p); break;
      case 'c': L.chests.push(p); break;
      case 's': L.snacks.push(p); break;
      case 'p': L.powers.push(p); break;
      case '+': L.stacks.push(p); break;
      case 'm': {
        const id = raw.monsters[mi++];
        if (id) L.spawns.push({ ...p, id });
        break;
      }
      case 'B': if (raw.boss) L.boss = { ...p, id: raw.boss }; break;
    }
  }
  // furniture: against the far (north) walls and in corners, only in plain floor blocks away from passages
  let seed = n * 977 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const plain = (c: number, r: number) => at(c, r) === '.';
  const nearPassage = (c: number, r: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => 'DLz'.includes(at(c + dc, r + dr)));
  const solid = (c: number, r: number) => at(c, r) === '#';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!plain(c, r) || nearPassage(c, r)) continue;
    const p = centre(c, r), h = BLOCK / 2;
    const N = solid(c, r - 1), W = solid(c - 1, r), E = solid(c + 1, r), S = solid(c, r + 1);
    if (S) continue;
    if (N && (W || E) && rnd() < 0.75) {
      const sx = W ? -1 : 1;
      const kinds: DecorKind[] = ['capsule', 'container', 'vessels', 'crates'];
      L.decor.push({ x: p.x + sx * (h - 1.0), z: p.z - (h - 1.0), kind: kinds[Math.floor(rnd() * kinds.length)], rot: 0, r: 0.8 });
    } else if (N && !W && !E && rnd() < 0.4) {
      const kinds: DecorKind[] = ['shelf', 'computer', 'shelf', 'vessels'];
      L.decor.push({ x: p.x + (rnd() - 0.5) * 0.8, z: p.z - (h - 0.75), kind: kinds[Math.floor(rnd() * kinds.length)], rot: 0, r: 0.75 });
    }
  }
  for (let i = 0; i + 1 < teleIdx.length; i += 2) { L.teles[teleIdx[i]].to = teleIdx[i + 1]; L.teles[teleIdx[i + 1]].to = teleIdx[i]; }
  L.total = L.spawns.reduce((s, m) => s + (m.id === 'fish' ? 2 : 1), 0) + (L.boss ? 1 : 0);
  cache.set(n, L);
  return L;
}

/** Is the block solid (a wall's other side, or outside the map)? */
export function solidBlock(L: Level, c: number, r: number): boolean {
  return r < 0 || r >= L.rows || c < 0 || c >= L.cols || L.map[r][c] === '#';
}

export const blockAt = (x: number): number => Math.floor(x / BLOCK);

/**
 * The level checks: equal row widths, a start, every door and laser gate in a one-block passage
 * with plain floor (no prop) on both ends, every monster's and the boss's block reachable from
 * the start (locked doors open), a pod or a field, an exit unless it is a boss level. Returns the
 * problems found.
 */
export function validate(n: number): string[] {
  const raw = RAW[n - 1], L = buildLevel(n), out: string[] = [];
  const w = raw.map[0].length;
  raw.map.forEach((row, r) => { if (row.length !== w) out.push(`row ${r} is ${row.length} wide, not ${w}`); });
  if (!raw.map.some((row) => row.includes('P'))) out.push('no start');
  if (!L.pods.length && !L.field) out.push('no pod');
  if (!L.boss && !L.exit) out.push('no exit');
  const props = 'CKrx+cFE';
  const ends = (c: number, r: number, axis: 'x' | 'z') => (axis === 'x' ? [[c - 1, r], [c + 1, r]] : [[c, r - 1], [c, r + 1]]);
  for (const d of [...L.doors, ...L.lasers]) {
    const c = Math.floor(d.x / BLOCK), r = Math.floor(d.z / BLOCK);
    for (const [ec, er] of ends(c, r, d.axis)) {
      const ch = charAt(L, ec, er);
      if (ch === '#') out.push(`passage at (${c}, ${r}) runs into a wall`);
      else if (props.includes(ch)) out.push(`passage at (${c}, ${r}) is blocked by '${ch}' at (${ec}, ${er})`);
    }
    const side = d.axis === 'x' ? [[c, r - 1], [c, r + 1]] : [[c - 1, r], [c + 1, r]];
    for (const [sc, sr] of side) if (charAt(L, sc, sr) !== '#') out.push(`passage at (${c}, ${r}) is open at the side (${sc}, ${sr})`);
  }
  // reachability over blocks
  const seen = new Set<string>();
  const sc = Math.floor(L.start.x / BLOCK), sr = Math.floor(L.start.z / BLOCK);
  const q: [number, number][] = [[sc, sr]];
  seen.add(sc + ',' + sr);
  while (q.length) {
    const [c, r] = q.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
      if (seen.has(k) || charAt(L, nc, nr) === '#' || charAt(L, nc, nr) === '+') continue;
      seen.add(k);
      q.push([nc, nr]);
    }
  }
  for (const m of [...L.spawns, ...(L.boss ? [L.boss] : []), ...L.pods, ...(L.exit ? [L.exit] : [])]) {
    const c = Math.floor(m.x / BLOCK), r = Math.floor(m.z / BLOCK);
    if (!seen.has(c + ',' + r)) out.push(`(${c}, ${r}) cannot be reached`);
  }
  if (raw.monsters.length !== L.spawns.length) out.push(`${raw.monsters.length} monsters for ${L.spawns.length} spots`);
  return out;
}
export const charAt = (L: Level, c: number, r: number): string => (r < 0 || r >= L.rows || c < 0 || c >= L.cols ? '#' : L.map[r][c]);
