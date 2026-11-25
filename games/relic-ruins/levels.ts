// Relic Ruins: the twenty ruins, written by hand on the pack's grid (one character per 2 m cell, row 0
// at the far, top end of the screen), and the parser that turns them into a Level.
//
//   #  wall block            .  floor                 ~  pit (a deep shaft, dark water in the library)
//   =  bridge over a pit     /  stairs (heights from `hmap`: 0 ground, 1 raised)
//   @  start                 $  the relic (golden chest)   E  the exit gate (opens with the relic)
//   *  brazier (checkpoint, refills the torch)              ^  wall sconce (light it with ACT)
//   !  puzzle sconce         i  candles (lit all at once, they open S)     S  sealed door
//   o  crate (push / pull)   O  statue (heavy)       a b c d  plates of door groups 1–4
//   1 2 3 4  doors           A B C D  levers of door groups 1–4 (a group opens when all its
//            plates are pressed and all its levers pulled)
//   k  key                   K  locked door          h  bookcase that slides away (a secret)
//   H  bookcase (furniture)  p  pot (coins)          P  pot with a gem      u  barrel (coins)
//   c  coin                  g  gem (secret: all of them is the second star)
//   T  trapdoor (opens on a rhythm)   v  bear trap   %  cracked floor (falls when stepped on)
//   r  rail                  m  cart on a rail (push it: it rolls to the rail's end, into a pit)
//   F  flare   Y  lantern oil   W  swift boots   Q  compass   G  ghost step
//   z  shade (creature)      x  wisp               M  guardian statue
//
// `route` is the autopilot's plan (bot.ts) through the puzzle: it walks between the steps itself.
import { WORLD_IDS, type WorldId, type PowerId } from './defs';

export const LEVEL_COUNT = 20;
export const LEVELS_PER_WORLD = 5;

/** A step of the autopilot's plan: go to a cell, use the thing on a cell, push a block, wait. */
export type Step =
  | ['go', number, number]
  | ['act', number, number]
  | ['push', number, number, 'N' | 'S' | 'E' | 'W', number]
  | ['wait', number]
  | ['flare'];

export interface LevelDef {
  map: string[];
  hmap?: string[];
  /** Par time in seconds (the third star). */
  par: number;
  /** The new idea's hint, shown once at the start (i18n key). */
  hint?: string;
  /** An escape level: the ruin falls in behind the hero once the relic is taken. */
  escape?: boolean;
  route: Step[];
}

const DEFS: LevelDef[] = [
  // ------------------------------------------------------------ World 1: the Overgrown Courtyard
  {
    // 1-1 The Gate: the torch, braziers, pots, the relic and the way out
    map: [
      '##########',
      '###.E.####',
      '###...####',
      '####.#####',
      '#p.....*##',
      '#.#####.##',
      '#.#...#.##',
      '#.#.$.#.##',
      '#.#...#.##',
      '#.##.##.##',
      '#c......c#',
      '####.#####',
      '#*..p...P#',
      '#...@....#',
      '##########',
    ],
    par: 55,
    hint: 'h_torch',
    route: [['act', 4, 12], ['act', 8, 12], ['go', 8, 10], ['act', 4, 7], ['go', 1, 10], ['act', 1, 4]],
  },
  {
    // 1-2 Ivy Walk: crates onto plates open doors
    map: [
      '###########',
      '#####E#####',
      '#####2#####',
      '#c.b...b.c#',
      '#...o.o...#',
      '#.........#',
      '#####.#####',
      '###.....###',
      '###*.$.P###',
      '###.....###',
      '#####1#####',
      '#c.......c#',
      '#...a.....#',
      '#...o.....#',
      '#.p..@..p.#',
      '###########',
    ],
    par: 70,
    hint: 'h_push',
    route: [['push', 4, 13, 'N', 1], ['go', 1, 11], ['go', 9, 11], ['act', 7, 8], ['act', 5, 8], ['push', 4, 4, 'W', 1], ['push', 3, 4, 'N', 1], ['push', 6, 4, 'E', 1], ['push', 7, 4, 'N', 1], ['go', 1, 3], ['go', 9, 3]],
  },
  {
    // 1-3 Moss Hall: levers, the first shade, a flare
    map: [
      '###########',
      '####.E.####',
      '#####2#####',
      '##B.....*##',
      '##...$...##',
      '##.......##',
      '#####1#####',
      '#A.......c#',
      '#.#.#.#.#.#',
      '#....z....#',
      '#.#.#.#.#.#',
      '#c........#',
      '###.###.###',
      '#c..#F#..*#',
      '#.........#',
      '#.p..@..P.#',
      '###########',
    ],
    par: 65,
    hint: 'h_lever',
    route: [['act', 8, 15], ['go', 5, 13], ['go', 1, 13], ['go', 1, 11], ['act', 1, 7], ['go', 9, 7], ['act', 5, 4], ['act', 2, 3]],
  },
  {
    // 1-4 The Old Well: keys, locked doors, a crate to bridge a shaft
    map: [
      '###########',
      '####.E.####',
      '#####K#####',
      '##.......##',
      '##.*.$.g.##',
      '##.......##',
      '#####K#####',
      '#c.......c#',
      '#.~~.#.~~.#',
      '#.~k~.~~~.#',
      '#.~~~.~k~.#',
      '#..o..~.~.#',
      '#........*#',
      '#....@....#',
      '###########',
    ],
    par: 60,
    hint: 'h_key',
    route: [['push', 3, 11, 'N', 1], ['go', 3, 9], ['go', 7, 10], ['go', 1, 7], ['go', 9, 7], ['go', 5, 5], ['act', 5, 4], ['go', 7, 4]],
  },
  {
    // 1-5 Courtyard Collapse: the first escape
    map: [
      '###########',
      '###*.$.*###',
      '###.....###',
      '#####.#####',
      '#c...g...c#',
      '#.###.###.#',
      '#.#.....#.#',
      '#.#.###.#.#',
      '#.........#',
      '#####1#####',
      '#A........#',
      '#.#.#.#.#.#',
      '#....z....#',
      '#.#.#.#.#.#',
      '#*...@...P#',
      '#####E#####',
      '###########',
    ],
    par: 70,
    hint: 'h_escape',
    escape: true,
    route: [['act', 9, 14], ['act', 1, 10], ['go', 1, 4], ['go', 9, 4], ['go', 5, 4], ['act', 5, 1]],
  },
  // ------------------------------------------------------------ World 2: the Sunken Library
  {
    // 2-1 Reading Room: bookcases that slide away
    map: [
      '#############',
      '#####.E.#####',
      '#####...#####',
      '###*..$..####',
      '###.....#g..#',
      '#####h###h###',
      '#H.H...H...H#',
      '#...........#',
      '#.HH.....HH.#',
      '#..........Y#',
      '#H.H.....H.H#',
      '#####...#####',
      '#c..p.@.p..c#',
      '#############',
    ],
    par: 100,
    hint: 'h_bookcase',
    route: [['go', 1, 12], ['act', 4, 12], ['act', 8, 12], ['go', 11, 12], ['go', 11, 9], ['act', 9, 5], ['go', 11, 4], ['act', 5, 5], ['act', 6, 3]],
  },
  {
    // 2-2 Candle Watch: light every candle before the first burns out
    map: [
      '#############',
      '#####.E.#####',
      '######.######',
      '####...$.####',
      '####*....####',
      '######S######',
      '#i.........i#',
      '#.###.#.###.#',
      '#.#g#.*.#.#.#',
      '#...........#',
      '#.#.#####.#.#',
      '#i#.......#i#',
      '###.#.@.#.###',
      '#c..#...#..c#',
      '#############',
    ],
    par: 75,
    hint: 'h_candle',
    route: [['go', 1, 13], ['go', 11, 13], ['go', 3, 8], ['act', 1, 11], ['act', 1, 6], ['act', 11, 6], ['act', 11, 11], ['act', 7, 3]],
  },
  {
    // 2-3 The Stacks: guardian statues move only in the dark
    map: [
      '#############',
      '#####.E.#####',
      '######1######',
      '#$.........A#',
      '#.HHH.#.HHH.#',
      '#.....M.....#',
      '#.HHH.#.HHH.#',
      '#*....#.....#',
      '###.#####.###',
      '#Q..........#',
      '#.HHH.H.HHH.#',
      '#.g.....M...#',
      '#.HHH.H.HHH.#',
      '#.....@....*#',
      '#############',
    ],
    par: 55,
    hint: 'h_guardian',
    route: [['go', 1, 9], ['go', 2, 11], ['go', 3, 9], ['go', 3, 7], ['act', 1, 3], ['act', 11, 3]],
  },
  {
    // 2-4 Flooded Archive: bridges, a heavy statue, a crate into the water
    map: [
      '#############',
      '#####.E.#####',
      '######1######',
      '#....a......#',
      '#.~~~.~~~~~.#',
      '#.~$~O~~g~~.#',
      '#.~=~.~~~~~.#',
      '#.....~...M.#',
      '#.H..*..o.H.#',
      '#.....@.....#',
      '#############',
    ],
    par: 55,
    hint: 'h_water',
    route: [['push', 8, 8, 'N', 2], ['go', 8, 5], ['act', 3, 5], ['push', 5, 5, 'N', 2]],
  },
  {
    // 2-5 Library Flood: escape
    map: [
      '###########',
      '###*.$.*###',
      '###.....###',
      '#####h#####',
      '#c.......c#',
      '#.HH.H.HH.#',
      '#....M....#',
      '#.HH.H.HH.#',
      '#.........#',
      '#~~~~=~~~~#',
      '#....g....#',
      '#P..*@....#',
      '#####E#####',
      '###########',
    ],
    par: 50,
    escape: true,
    route: [['act', 1, 11], ['go', 5, 10], ['go', 4, 8], ['go', 1, 4], ['go', 9, 4], ['act', 5, 3], ['act', 5, 1]],
  },
  // ------------------------------------------------------------ World 3: the Shadow Halls
  {
    // 3-1 Pillar Gallery: bear traps, the ghost step
    map: [
      '###########',
      '####.E.####',
      '#####.#####',
      '#*.v...v.g#',
      '#.#v#.#v#.#',
      '#...v$v...#',
      '#.#.#.#.#.#',
      '#.v.....v.#',
      '#####.#####',
      '#c.v...v.c#',
      '#..v.G.v..#',
      '#.vv...vv.#',
      '#....@....#',
      '###########',
    ],
    par: 60,
    hint: 'h_beartrap',
    route: [['go', 5, 10], ['go', 1, 9], ['go', 9, 9], ['go', 5, 7], ['act', 5, 5], ['go', 9, 5], ['go', 9, 3], ['go', 5, 2]],
  },
  {
    // 3-2 Trapdoor Hall: trapdoors that open on a rhythm
    map: [
      '#########',
      '###.E.###',
      '####.####',
      '###~T~###',
      '###~T~###',
      '###~T~###',
      '#*.....*#',
      '#v..$..v#',
      '#...T...#',
      '#.TTTTT.#',
      '#gTTTTT.#',
      '#.#...#.#',
      '#c..@..c#',
      '#########',
    ],
    par: 45,
    hint: 'h_trapdoor',
    route: [['go', 1, 12], ['go', 7, 12], ['go', 1, 9], ['go', 1, 10], ['go', 3, 8], ['act', 4, 7], ['go', 4, 6], ['go', 4, 2]],
  },
  {
    // 3-3 Lamp Room: light every marked sconce; wisps keep to the dark
    map: [
      '###########',
      '####.E.####',
      '####$..g###',
      '#####S#####',
      '#!.......!#',
      '#.#.#.#.#.#',
      '#....x....#',
      '#.#.#.#.#.#',
      '#!.......!#',
      '#####.#####',
      '#*.c.@.c..#',
      '#P.......F#',
      '###########',
    ],
    par: 70,
    hint: 'h_sconce',
    route: [['act', 1, 11], ['go', 9, 11], ['go', 3, 10], ['go', 7, 10], ['act', 1, 8], ['act', 1, 4], ['act', 9, 4], ['act', 9, 8], ['act', 4, 2], ['go', 7, 2]],
  },
  {
    // 3-4 The Deep Hall: levers, keys, traps, wisps and a guardian together
    map: [
      '#############',
      '#####.E.#####',
      '######K######',
      '#*.v.....v.A#',
      '#.###.#.###.#',
      '#.#k..x..#v.#',
      '#.#.#####.#.#',
      '#.v.......v.#',
      '###.##1##.###',
      '#P..#.$.#..g#',
      '#.M.#...#...#',
      '#...........#',
      '#.v...@...v.#',
      '#############',
    ],
    par: 130,
    hint: 'h_mix',
    route: [['act', 1, 9], ['go', 11, 9], ['go', 1, 7], ['go', 1, 3], ['go', 3, 5], ['act', 11, 3], ['go', 9, 7], ['go', 6, 10], ['act', 6, 9]],
  },
  {
    // 3-5 Halls Cave-in: escape over trapdoors
    map: [
      '###########',
      '###*.$.*###',
      '###..g..###',
      '#####S#####',
      '#!.......!#',
      '#.#.#.#.#.#',
      '#....x....#',
      '#.v.T.T.v.#',
      '#!..TTT..!#',
      '#####.#####',
      '#...v.v...#',
      '#P...@...*#',
      '#####E#####',
      '###########',
    ],
    par: 60,
    escape: true,
    route: [['act', 1, 11], ['act', 1, 8], ['act', 1, 4], ['act', 9, 4], ['act', 9, 8], ['go', 5, 2], ['act', 5, 1]],
  },
  // ------------------------------------------------------------ World 4: the Crumbling Citadel
  {
    // 4-1 The Keep: cracked floors fall away behind you; swift boots
    map: [
      '###########',
      '####.E.####',
      '#####.#####',
      '#*.......g#',
      '#.%%%%%%%.#',
      '#.%%%$%%%.#',
      '#.%%%.%%%.#',
      '#....W....#',
      '#.#%%%%%#.#',
      '#c#.....#c#',
      '#.%%%%%%%.#',
      '#....@...*#',
      '###########',
    ],
    par: 60,
    hint: 'h_cracked',
    route: [['go', 5, 7], ['go', 9, 9], ['go', 1, 9], ['go', 5, 6], ['act', 5, 5], ['go', 2, 3], ['go', 9, 3], ['go', 5, 2]],
  },
  {
    // 4-2 Rail Crossing: carts roll along their rails into the chasms and bridge them
    map: [
      '#############',
      '######E######',
      '######1######',
      '#*...A.....g#',
      '#...........#',
      '#~~~~~~~~~~~#',
      '#........m..#',
      '#.....$..r..#',
      '#*.......r..#',
      '#~~~~~~~~~~~#',
      '#..m........#',
      '#..r........#',
      '#c....@....c#',
      '#############',
    ],
    par: 55,
    hint: 'h_cart',
    route: [['go', 1, 12], ['go', 11, 12], ['push', 3, 10, 'N', 1], ['go', 3, 8], ['act', 6, 7], ['push', 9, 6, 'N', 1], ['go', 11, 3], ['act', 5, 3]],
  },
  {
    // 4-3 Tower Stairs: stairs up to raised walks, bridges over the keep's pit
    map: [
      '###########',
      '#####E#####',
      '####...####',
      '#*.......g#',
      '#.#~~=~~#.#',
      '#.#~~$~~#.#',
      '#.#~~=~~#.#',
      '#.........#',
      '#/#######/#',
      '#....W....#',
      '#c.......c#',
      '#*...@....#',
      '###########',
    ],
    hmap: [
      '00000000000',
      '00000100000',
      '00001110000',
      '01111111110',
      '01011111010',
      '01011111010',
      '01011111010',
      '01111111110',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
    ],
    par: 45,
    hint: 'h_stairs',
    route: [['go', 1, 10], ['go', 9, 10], ['go', 5, 9], ['go', 9, 7], ['go', 5, 7], ['act', 5, 5], ['go', 9, 3]],
  },
  {
    // 4-4 The Ramparts: everything at once
    map: [
      '#############',
      '#####.E.#####',
      '######2######',
      '#*.%%%.%%%.B#',
      '#.##.....##.#',
      '#.#..o.a..#.#',
      '#.#.#####.#.#',
      '#.v...x...v.#',
      '###%##1##%###',
      '#.....$.....#',
      '#....u....z.#',
      '#.~~~~~.~~~.#',
      '#A..........#',
      '#P...*@...g.#',
      '#############',
    ],
    par: 75,
    hint: 'h_all',
    route: [['act', 1, 13], ['go', 10, 13], ['act', 5, 10], ['act', 1, 12], ['act', 6, 9], ['go', 3, 7], ['push', 5, 5, 'E', 2], ['go', 5, 3], ['act', 11, 3]],
  },
  {
    // 4-5 Citadel Fall: the last escape
    map: [
      '#############',
      '#####*$*#####',
      '#####...#####',
      '######S######',
      '#i....%....i#',
      '#.%%%.%.%%%.#',
      '#.%.x...x.%.#',
      '#.%%%.%.%%%.#',
      '#.....%.....#',
      '#.###T.T###.#',
      '#.v.TTTTT.v.#',
      '#g..........#',
      '#P...*@*...Y#',
      '######E######',
      '#############',
    ],
    par: 75,
    escape: true,
    route: [['act', 1, 12], ['go', 1, 11], ['go', 11, 12], ['go', 1, 8], ['act', 1, 4], ['go', 11, 8], ['act', 11, 4], ['go', 6, 4], ['go', 6, 2], ['act', 6, 1]],
  },
];

export const LEVEL_DEFS = DEFS;

export const worldOf = (n: number): WorldId => WORLD_IDS[Math.floor((n - 1) / LEVELS_PER_WORLD)];
export const inWorldOf = (n: number): number => ((n - 1) % LEVELS_PER_WORLD) + 1;
export const parOf = (n: number): number => DEFS[n - 1].par;

// ------------------------------------------------------------------ the parsed level

export type CellKind = 'wall' | 'floor' | 'pit' | 'bridge' | 'stairs' | 'door' | 'lock' | 'sealed' | 'exit' | 'bookcase' | 'trapdoor' | 'cracked';

export interface Cell {
  k: CellKind;
  /** Floor height level (0 ground, 1 raised). */
  h: number;
  /** Door group (doors) or plate group (plates), 0 = none. */
  group: number;
  plate: number;
  /** Rail axis ('x' or 'z'), '' when no rail. */
  rail: '' | 'x' | 'z';
  /** Stairs: the direction (dc, dr) from the low side to the high side. */
  sd: [number, number];
  /** Furniture bookcase (solid, never moves). */
  shelf: boolean;
}

export type ThingKind = 'brazier' | 'sconce' | 'puzzle' | 'candles' | 'lever' | 'pot' | 'barrel' | 'beartrap' | 'relic';
export interface ThingDef { kind: ThingKind; c: number; r: number; group: number; gem: boolean }
export type BlockKind = 'crate' | 'statue' | 'cart';
export interface BlockDef { kind: BlockKind; c: number; r: number }
export type PickKind = 'coin' | 'gem' | 'key' | 'power';
export interface PickDef { kind: PickKind; c: number; r: number; power?: PowerId }
export type FoeKind = 'shade' | 'wisp' | 'guardian';
export interface FoeDef { kind: FoeKind; c: number; r: number }

export interface Level {
  n: number;
  world: WorldId;
  cols: number;
  rows: number;
  cells: Cell[];
  start: [number, number];
  relic: [number, number];
  exit: [number, number];
  things: ThingDef[];
  blocks: BlockDef[];
  picks: PickDef[];
  foes: FoeDef[];
  gems: number;
  par: number;
  escape: boolean;
  hint?: string;
  route: Step[];
}

const POWER_CHARS: Record<string, PowerId> = { F: 'flare', Y: 'oil', W: 'boots', Q: 'compass', G: 'ghost' };

export function buildLevel(n: number): Level {
  const d = DEFS[n - 1];
  const rows = d.map.length, cols = Math.max(...d.map.map((l) => l.length));
  const cells: Cell[] = [];
  const L: Level = {
    n, world: worldOf(n), cols, rows, cells, start: [1, 1], relic: [1, 1], exit: [1, 1],
    things: [], blocks: [], picks: [], foes: [], gems: 0, par: d.par, escape: !!d.escape, hint: d.hint, route: d.route,
  };
  const rails: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = d.map[r][c] ?? '#';
      const h = Number(d.hmap?.[r]?.[c] ?? '0') || 0;
      const cell: Cell = { k: 'floor', h, group: 0, plate: 0, rail: '', sd: [0, 0], shelf: false };
      const thing = (kind: ThingKind, group = 0, gem = false) => L.things.push({ kind, c, r, group, gem });
      switch (ch) {
        case '#': cell.k = 'wall'; break;
        case '~': cell.k = 'pit'; break;
        case '=': cell.k = 'bridge'; break;
        case '/': cell.k = 'stairs'; break;
        case '@': L.start = [c, r]; break;
        case '$': L.relic = [c, r]; thing('relic'); break;
        case 'E': cell.k = 'exit'; L.exit = [c, r]; break;
        case '*': thing('brazier'); break;
        case '^': thing('sconce'); break;
        case '!': thing('puzzle'); break;
        case 'i': thing('candles'); break;
        case 'S': cell.k = 'sealed'; break;
        case 'o': L.blocks.push({ kind: 'crate', c, r }); break;
        case 'O': L.blocks.push({ kind: 'statue', c, r }); break;
        case 'a': case 'b': case 'c': case 'd':
          if (ch === 'c') { L.picks.push({ kind: 'coin', c, r }); break; }
          cell.plate = 'abcd'.indexOf(ch) + 1;
          break;
        case '1': case '2': case '3': case '4': cell.k = 'door'; cell.group = Number(ch); break;
        case 'A': case 'B': case 'C': case 'D': thing('lever', 'ABCD'.indexOf(ch) + 1); break;
        case 'k': L.picks.push({ kind: 'key', c, r }); break;
        case 'K': cell.k = 'lock'; break;
        case 'h': cell.k = 'bookcase'; break;
        case 'H': cell.shelf = true; break;
        case 'p': thing('pot'); break;
        case 'P': thing('pot', 0, true); L.gems++; break;
        case 'u': thing('barrel'); break;
        case 'g': L.picks.push({ kind: 'gem', c, r }); L.gems++; break;
        case 'T': cell.k = 'trapdoor'; break;
        case 'v': thing('beartrap'); break;
        case '%': cell.k = 'cracked'; break;
        case 'r': rails.push([c, r]); break;
        case 'm': rails.push([c, r]); L.blocks.push({ kind: 'cart', c, r }); break;
        case 'z': L.foes.push({ kind: 'shade', c, r }); break;
        case 'x': L.foes.push({ kind: 'wisp', c, r }); break;
        case 'M': L.foes.push({ kind: 'guardian', c, r }); break;
        default:
          if (POWER_CHARS[ch]) L.picks.push({ kind: 'power', c, r, power: POWER_CHARS[ch] });
      }
      cells.push(cell);
    }
  }
  // NB: 'c' is a coin; plates use a, b, d (and c only through `plates` below when ever needed)
  const at = (c: number, r: number) => (c >= 0 && r >= 0 && c < cols && r < rows ? cells[r * cols + c] : null);
  const isRail = (c: number, r: number) => rails.some(([x, y]) => x === c && y === r);
  for (const [c, r] of rails) at(c, r)!.rail = isRail(c - 1, r) || isRail(c + 1, r) ? 'x' : 'z';
  // stairs: the raised neighbour is the top
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = at(c, r)!;
    if (cell.k !== 'stairs') continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const nb = at(c + dc, r + dr), back = at(c - dc, r - dr);
      if (nb && nb.k !== 'wall' && nb.h > cell.h && back && back.h === cell.h) { cell.sd = [dc, dr]; break; }
    }
  }
  return L;
}
