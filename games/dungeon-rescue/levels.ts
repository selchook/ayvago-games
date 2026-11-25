// Dungeon Rescue: the twenty levels, written by hand on the pack's grid (one character per 2 m cell,
// row 0 at the far, top end of the screen), and the parser that turns them into a Level.
//
//   #  wall block               .  floor                    @  start (the first checkpoint)
//   X  exit stairs              E  exit gate (shut until the Jailer Chief is outwitted)
//   +  campfire (checkpoint)    i  wall torch (on a wall block, lighting the floor beside it)
//   B  barrel  C  crate (hide in them with ACT; they block sight)
//   O  column  F  standing banner (block sight)   T  table   H  horse statue
//   =  locked cell door (pick the lock: hold ACT, or use a key)   p  prisoner (from `prisoners`)
//   k  key     G  barred gate (a lever opens it)   L  lever    D  wooden door (swings open, blocks sight shut)
//   ^  spike trap (rises on a rhythm)   o  trapdoor (gives way under the knight)
//   $  coin pile   b  coin bag   *  hidden gold chest (ACT)   v  vase   u  bucket (to throw)
//   P  power (from `powers`, in reading order)
//
// Guards walk their `p` waypoints (ping-pong, or round with `loop`), pausing and looking round at
// each; a guard with one waypoint stands there, turning his head (`face` the way he looks). `sleep`
// guards doze until a noise wakes them. The boss (the Jailer Chief) walks his own round; `trap` ties
// a lever to the gates of a pen (they shut) or to trapdoors (they open) for his set-piece.
// `route` is the autopilot's plan (bot.ts): it walks between the steps itself and waits for a gap
// in the guards' sight before stepping into it.
import { CELL, type GuardKind, type PowerId, type WingId, WING_IDS } from './defs';

export const LEVEL_COUNT = 20;
export const LEVELS_PER_WING = 5;
export type Dir = 'N' | 'S' | 'E' | 'W';
export type C2 = [number, number];

/** A step of the autopilot's plan. */
export type Step =
  | ['go', number, number]
  | ['act', number, number]
  | ['throw', number, number]
  | ['wait', number]
  | ['hide', number, number]
  | ['crew', 'wait' | 'follow']
  | ['power', number?, number?]
  | ['steal']
  /** stand at a cell until the Chief comes for the knight, then run the next steps without fleeing */
  | ['bait', number, number]
  | ['cp']
  | ['exit'];

export interface GuardDef { k: GuardKind; p: C2[]; loop?: boolean; face?: Dir; sleep?: boolean; pause?: number }
export type Trick = 'steal' | 'cell' | 'trap' | 'final';
export interface BossDef { p: C2[]; trick: Trick; loop?: boolean; pause?: number }
export interface TrapDef { lever: C2; gates?: C2[]; area?: [C2, C2]; doors?: C2[] }

export interface LevelDef {
  map: string[];
  guards: GuardDef[];
  boss?: BossDef;
  prisoners: string[];
  powers?: PowerId[];
  /** Par time in seconds (the third star). */
  par: number;
  /** The new idea's hint, shown once (i18n key). */
  hint?: string;
  trap?: TrapDef;
  /** Light everywhere before torches (0..1); the wing's by default. */
  ambient?: number;
  route: Step[];
}

export type CellKind = 'wall' | 'floor' | 'void';
export interface Cell { k: CellKind }

export interface Item { ch: string; c: number; r: number }

export interface Level {
  n: number;
  wing: WingId;
  cols: number;
  rows: number;
  cells: Cell[];
  start: C2;
  exit: C2;
  items: Item[];
  torches: { c: number; r: number; dc: number; dr: number }[];
  guards: GuardDef[];
  boss: BossDef | null;
  prisoners: { id: string; c: number; r: number }[];
  powers: { id: PowerId; c: number; r: number }[];
  par: number;
  hint: string | null;
  trap: TrapDef | null;
  ambient: number | null;
  route: Step[];
  /** At least this many must walk out (the first star is every one of them). */
  need: number;
}

export const wingOf = (n: number): WingId => WING_IDS[Math.floor((n - 1) / LEVELS_PER_WING)];
export const inWingOf = (n: number): number => ((n - 1) % LEVELS_PER_WING) + 1;
export const isBossLevel = (n: number): boolean => inWingOf(n) === LEVELS_PER_WING;
export const cellX = (c: number): number => c * CELL;
export const cellZ = (r: number): number => r * CELL;

const DEFS: LevelDef[] = [
  // ============================================================ Wing 1: the Cellblock
  {
    // 1-1 First Steps: a guard's cone, a key, a cell, the way out
    map: [
      '##############',
      '######X#######',
      '#####...######',
      '####i...i#####',
      '#####...##i###',
      '#.$....k.....#',
      '#.#i#....b##$#',
      '#=###.....##.#',
      '#p###..@..##*#',
      '##############',
    ],
    guards: [{ k: 'soldier', p: [[1, 5], [12, 5]] }],
    prisoners: ['casual'],
    par: 50,
    hint: 'h_cone',
    route: [['go', 7, 6], ['go', 7, 5], ['go', 1, 5], ['act', 1, 7], ['go', 6, 5], ['go', 6, 3], ['exit']],
  },
  {
    // 1-2 Lock Picks: hold ACT at a cell door; the freed follow in a line
    map: [
      '################',
      '#######X########',
      '######..*#######',
      '###i##...###i###',
      '#......$.......#',
      '#.##=######=##.#',
      '#$##p######p##.#',
      '#.############$#',
      '#.b...+@.......#',
      '################',
    ],
    guards: [{ k: 'soldier', p: [[1, 4], [14, 4]] }, { k: 'bluesoldier', p: [[14, 5], [14, 8], [12, 8]] }],
    prisoners: ['worker', 'casual-f'],
    par: 70,
    hint: 'h_pick',
    route: [['go', 1, 8], ['go', 1, 5], ['go', 4, 4], ['act', 4, 5], ['go', 1, 4], ['wait', 2], ['go', 11, 4], ['act', 11, 5], ['go', 7, 4], ['go', 7, 3], ['exit']],
  },
  {
    // 1-3 Hide and Seek: barrels and crates break a guard's view; step into one with ACT
    map: [
      '##################',
      '#########X########',
      '########...#######',
      '#####i##...##i####',
      '#.....B....$C....#',
      '#.C......B.......#',
      '#..$..C...B...Bb.#',
      '#..B........C....#',
      '#######.#####=####',
      '#######.#####p####',
      '####*..@...#######',
      '##################',
    ],
    guards: [{ k: 'soldier-f', p: [[1, 4], [16, 4], [16, 7], [1, 7]], loop: true }, { k: 'goblin', p: [[16, 5], [1, 5]] }],
    prisoners: ['ninja'],
    par: 70,
    hint: 'h_hide',
    route: [['go', 7, 8], ['go', 7, 7], ['go', 11, 7], ['go', 13, 7], ['act', 13, 8], ['go', 11, 6], ['go', 9, 6], ['go', 9, 4], ['go', 9, 3], ['exit']],
  },
  {
    // 1-4 Distraction: throw a vase or a coin to pull a guard off his post; C parks the crew
    map: [
      '#################',
      '########X########',
      '#######...#######',
      '####i##...##i####',
      '#*.............b#',
      '#.B..$........C.#',
      '#..v.........u..#',
      '#.#####.#####.###',
      '#.##p##.###p#.###',
      '#.##=##.###=#.###',
      '#.......@+..$...#',
      '#################',
    ],
    guards: [{ k: 'goblin', p: [[8, 3]], face: 'S' }, { k: 'soldier', p: [[1, 10], [15, 10]] }],
    prisoners: ['chef', 'casual2'],
    par: 80,
    hint: 'h_throw',
    route: [['go', 6, 10], ['act', 4, 9], ['go', 11, 10], ['act', 11, 9], ['go', 13, 8], ['go', 13, 6], ['throw', 8, 6], ['wait', 1.0], ['go', 11, 4], ['go', 8, 2], ['exit']],
  },
  {
    // 1-5 Cellblock Alarm: steal the Jailer Chief's key ring from behind, then run for it
    map: [
      '##################',
      '########X#########',
      '########E#########',
      '######i...i#######',
      '#$...O.......O..*#',
      '#................#',
      '#.B...O.....O..C.#',
      '#........$.......#',
      '##=####.##.####=##',
      '##p####.##.####p##',
      '#######.##.#######',
      '####....@...b#####',
      '##################',
    ],
    guards: [{ k: 'bluesoldier', p: [[1, 7], [16, 7]] }],
    boss: { p: [[3, 5], [14, 5]], trick: 'steal', pause: 2.2 },
    prisoners: ['doctor', 'cow'],
    par: 95,
    hint: 'h_boss1',
    route: [['go', 7, 10], ['go', 7, 8], ['go', 2, 7], ['act', 2, 8], ['go', 15, 7], ['act', 15, 8], ['go', 10, 7], ['steal'], ['cp'], ['go', 8, 3], ['exit']],
  },
  // ============================================================ Wing 2: the Barracks
  {
    // 2-1 Sleeping Barracks: sleepers wake to noise, so walk, don't sprint
    map: [
      '##################',
      '#########X########',
      '########...#######',
      '####i###...###i###',
      '#..T..T.....T..T*#',
      '#$...............#',
      '#..T..T.$...T..T.#',
      '#................#',
      '#######.####=#####',
      '#######.####p#####',
      '#####..@+.b.######',
      '##################',
    ],
    guards: [
      { k: 'soldier', p: [[2, 5]], face: 'S', sleep: true },
      { k: 'viking', p: [[9, 5]], face: 'E', sleep: true },
      { k: 'soldier-f', p: [[14, 5]], face: 'W', sleep: true },
      { k: 'bluesoldier', p: [[1, 7], [16, 7]] },
    ],
    prisoners: ['pug'],
    par: 65,
    hint: 'h_sleep',
    route: [['go', 7, 8], ['go', 7, 7], ['go', 12, 7], ['act', 12, 8], ['go', 10, 7], ['go', 9, 6], ['go', 9, 4], ['go', 9, 2], ['exit']],
  },
  {
    // 2-2 Gates and Levers: a lever opens the barred gate; shut doors block a guard's view
    map: [
      '##################',
      '########X#########',
      '########G#########',
      '####i##...####i###',
      '#*....#.....#.$..#',
      '#.L...D..$..D....#',
      '#.....#.....#..Bb#',
      '#.....#.....#....#',
      '###.####.#######=#',
      '###.####.#######p#',
      '###......@...+####',
      '##################',
    ],
    guards: [
      { k: 'soldier', p: [[7, 4], [11, 4], [11, 7], [7, 7]], loop: true },
      { k: 'goblin-f', p: [[13, 4], [16, 4], [16, 7], [13, 7]], loop: true },
      { k: 'bluesoldier-f', p: [[1, 7], [5, 7]] },
    ],
    prisoners: ['pirate'],
    par: 85,
    hint: 'h_lever',
    route: [['go', 3, 9], ['go', 3, 7], ['act', 2, 5], ['go', 5, 5], ['go', 9, 6], ['go', 14, 5], ['go', 16, 7], ['act', 16, 8], ['go', 13, 5], ['go', 9, 5], ['go', 8, 3], ['exit']],
  },
  {
    // 2-3 Tricks of the Trade: a smoke bomb breaks sight, a disguise walks past
    map: [
      '####################',
      '#########X##########',
      '########...#########',
      '####i###...####i####',
      '#$.................#',
      '#.P..O...O...O..P..#',
      '#......$...........#',
      '##=####.####.####=##',
      '##p####.####.####p##',
      '#######....b*#######',
      '#######..@+..#######',
      '####################',
    ],
    guards: [
      { k: 'goblin', p: [[1, 4], [18, 4]] },
      { k: 'soldier-f', p: [[18, 6], [1, 6]] },
      { k: 'bluesoldier', p: [[9, 3]], face: 'S' },
    ],
    prisoners: ['elf', 'suit'],
    powers: ['smoke', 'disguise'],
    par: 95,
    hint: 'h_power',
    route: [['go', 7, 8], ['go', 7, 6], ['go', 2, 5], ['go', 2, 6], ['act', 2, 7], ['go', 16, 5], ['go', 17, 6], ['act', 17, 7], ['go', 10, 5], ['power'], ['go', 9, 2], ['exit']],
  },
  {
    // 2-4 Mess Hall: guards spot followers too; the heavies look wider
    map: [
      '####################',
      '##########X#########',
      '#p#######...########',
      '#=###i###...###i####',
      '#$......T....T....*#',
      '#.......T....T.....#',
      '#.................$#',
      '#.......T....T.....#',
      '#.......T....T.....#',
      '##=######.#######=##',
      '##p######.#######p##',
      '#######...@+b#######',
      '####################',
    ],
    guards: [
      { k: 'viking', p: [[2, 6], [17, 6]] },
      { k: 'soldier', p: [[6, 4], [6, 8]] },
      { k: 'goblin-f', p: [[15, 8], [15, 4]] },
    ],
    prisoners: ['casual2-f', 'kimono', 'worker-f'],
    par: 120,
    hint: 'h_crowd',
    route: [['go', 9, 9], ['go', 9, 8], ['go', 2, 8], ['act', 2, 9], ['crew', 'wait'], ['go', 17, 8], ['act', 17, 9], ['go', 11, 7], ['go', 3, 7], ['crew', 'follow'], ['go', 1, 4], ['act', 1, 3], ['go', 10, 4], ['go', 10, 2], ['exit']],
  },
  {
    // 2-5 Barracks Alarm: lure the Jailer Chief into the pen, pull the lever, run
    map: [
      '####################',
      '##########X#########',
      '##########E#########',
      '#####i###...####i###',
      '#$...........*#...##',
      '#..O....O...L.G.v.##',
      '#.............#.$.##',
      '#....P......B..#####',
      '##=#####.#####=#####',
      '##p#####.#####p#####',
      '#######..@+.b#######',
      '####################',
    ],
    guards: [{ k: 'soldier-f', p: [[1, 7], [9, 7]] }],
    powers: ['decoy'],
    boss: { p: [[2, 5], [11, 5]], trick: 'cell', pause: 2.4 },
    trap: { lever: [12, 5], gates: [[14, 5]], area: [[15, 4], [17, 6]] },
    prisoners: ['doctor-f', 'cowboy'],
    par: 110,
    hint: 'h_boss2',
    route: [['go', 8, 8], ['go', 8, 7], ['go', 2, 7], ['act', 2, 8], ['go', 5, 7], ['go', 14, 7], ['act', 14, 8], ['go', 8, 9], ['crew', 'wait'], ['go', 12, 5], ['go', 13, 5], ['power', 16, 5], ['hide', 12, 7], ['act', 12, 5], ['cp'], ['go', 8, 8], ['crew', 'follow'], ['go', 10, 3], ['exit']],
  },
  // ============================================================ Wing 3: the Treasury
  {
    // 3-1 Spike Hall: spikes rise on a rhythm; wait for them to sink
    map: [
      '##################',
      '########X#########',
      '#######...########',
      '####i##...###i####',
      '#*......^^.......#',
      '#..$....^^....b..#',
      '#.......^^......$#',
      '###.####^^###.####',
      '###.####..###=####',
      '###......@..#p####',
      '##################',
    ],
    guards: [{ k: 'soldier', p: [[1, 5], [6, 5]] }, { k: 'goblin', p: [[11, 4], [16, 4]] }],
    prisoners: ['lady'],
    par: 70,
    hint: 'h_spikes',
    route: [['go', 3, 8], ['go', 3, 6], ['go', 7, 6], ['go', 10, 6], ['go', 13, 7], ['act', 13, 8], ['go', 10, 6], ['go', 7, 5], ['go', 7, 4], ['go', 8, 3], ['exit']],
  },
  {
    // 3-2 Trapdoors: the boards give way and drop you back to the cells
    map: [
      '##################',
      '########X#########',
      '#######...########',
      '####i##...###i####',
      '#..o..o.$..o..o..#',
      '#$.............o.#',
      '#.o..o...o.....b.#',
      '#*......o...o....#',
      '###.#########=####',
      '###...@+....#p####',
      '##################',
    ],
    guards: [{ k: 'bluesoldier', p: [[1, 5], [13, 5]] }, { k: 'goblin-f', p: [[16, 4], [16, 7]] }],
    prisoners: ['wizard'],
    par: 75,
    hint: 'h_trapdoor',
    route: [['go', 3, 8], ['go', 3, 7], ['go', 13, 7], ['act', 13, 8], ['go', 8, 5], ['go', 8, 3], ['exit']],
  },
  {
    // 3-3 Gold Vault: sleepy powder sends a guard to sleep; the hidden gold chest
    map: [
      '##################',
      '########X#########',
      '#######...########',
      '####i##...###i####',
      '#$...H.....H...*.#',
      '#................#',
      '#.P..H..$..H.....#',
      '#...............b#',
      '#######.####=#####',
      '#######.####p#####',
      '#####..@+...######',
      '##################',
    ],
    guards: [{ k: 'viking-f', p: [[8, 3]], face: 'S' }, { k: 'soldier', p: [[1, 7], [16, 7]] }, { k: 'goblin', p: [[15, 5]], face: 'W' }],
    prisoners: ['suit-f'],
    powers: ['powder'],
    par: 85,
    hint: 'h_powder',
    route: [['go', 7, 8], ['go', 7, 7], ['go', 2, 6], ['go', 12, 7], ['act', 12, 8], ['go', 8, 5], ['go', 8, 4], ['power'], ['go', 8, 2], ['exit']],
  },
  {
    // 3-4 Counting House: a decoy rattles on its own; swift shoes outrun a chase
    map: [
      '####################',
      '##########X#########',
      '#########...########',
      '####i####...####i###',
      '#$...C.....T.....C.#',
      '#..T..........T...*#',
      '#..P.C....b..B.....#',
      '#.P.....T........$.#',
      '##=######.#######=##',
      '##p######.#######p##',
      '#######...@+.#######',
      '####################',
    ],
    guards: [
      { k: 'soldier', p: [[1, 4], [18, 4]] },
      { k: 'viking', p: [[10, 3], [10, 6]], pause: 2.4 },
      { k: 'goblin-f', p: [[18, 7], [3, 7]] },
    ],
    prisoners: ['chef-f', 'casual3'],
    powers: ['decoy', 'swift'],
    par: 110,
    hint: 'h_decoy',
    route: [['go', 9, 8], ['go', 9, 7], ['go', 3, 6], ['go', 2, 7], ['act', 2, 8], ['go', 9, 7], ['go', 17, 7], ['act', 17, 8], ['go', 13, 4], ['go', 10, 4], ['go', 10, 2], ['exit']],
  },
  {
    // 3-5 Treasury Alarm: lure the Jailer Chief onto the trapdoor, pull the lever, run
    map: [
      '####################',
      '##########X#########',
      '##########E#########',
      '#####i###...####i###',
      '#$.................#',
      '#..H.....oo.....H..#',
      '#........oo........#',
      '#*..L.............$#',
      '##=######.#######=##',
      '##p######.#######p##',
      '#######...@+b#######',
      '####################',
    ],
    guards: [{ k: 'bluesoldier-f', p: [[1, 4], [18, 4]] }],
    boss: { p: [[3, 6], [16, 6]], trick: 'trap', pause: 2.2 },
    trap: { lever: [4, 7], doors: [[9, 5], [10, 5], [9, 6], [10, 6]] },
    prisoners: ['witch', 'pirate-f'],
    par: 115,
    hint: 'h_boss3',
    route: [['go', 9, 8], ['go', 9, 7], ['go', 2, 7], ['act', 2, 8], ['go', 17, 7], ['act', 17, 8], ['go', 5, 7], ['throw', 9, 6], ['act', 4, 7], ['cp'], ['go', 10, 3], ['exit']],
  },
  // ============================================================ Wing 4: the Jailer's Tower
  {
    // 4-1 Tower Stairs: the heavies' wide eyes
    map: [
      '##################',
      '#X################',
      '#.################',
      '#.....i#....i...$#',
      '#.O....D....O....#',
      '#..........B.....#',
      '#####.######.#####',
      '#.....B....D....=#',
      '#$.O...........#p#',
      '#*......@+...b.###',
      '##################',
    ],
    guards: [{ k: 'viking', p: [[2, 7], [14, 7]] }, { k: 'viking-f', p: [[16, 3], [8, 3]] }, { k: 'goblin', p: [[3, 5]], face: 'E' }],
    prisoners: ['gent'],
    par: 85,
    hint: 'h_heavy',
    route: [['go', 12, 8], ['go', 15, 7], ['act', 16, 7], ['go', 12, 5], ['go', 9, 4], ['go', 1, 3], ['exit']],
  },
  {
    // 4-2 Guard Room: many rounds to weave between
    map: [
      '####################',
      '##########X#########',
      '#########...########',
      '####i####...####i###',
      '#$..O....T.T....O.*#',
      '#..................#',
      '#..O...C....C...O..#',
      '#..................#',
      '#...O..........O..$#',
      '##########.#####=###',
      '##########.#####p###',
      '#######...@+.b...###',
      '####################',
    ],
    guards: [
      { k: 'soldier', p: [[1, 5], [18, 5]] },
      { k: 'soldier-f', p: [[18, 7], [1, 7]] },
      { k: 'bluesoldier', p: [[6, 4], [6, 8]] },
      { k: 'goblin', p: [[13, 8], [13, 4]] },
    ],
    prisoners: ['ninja-f'],
    par: 95,
    hint: 'h_rounds',
    route: [['go', 10, 9], ['go', 10, 8], ['go', 16, 8], ['act', 16, 9], ['go', 10, 8], ['go', 10, 5], ['go', 10, 2], ['exit']],
  },
  {
    // 4-3 Lantern Walk: a dark floor; put out torches to make shadows
    map: [
      '##################',
      '########X#########',
      '#######...########',
      '##i####...####i###',
      '#$......i.......*#',
      '#..C.........C...#',
      '#.......#i#.....$#',
      '#....B.......B...#',
      '##=###.#####.###=#',
      '##p###.#####.###p#',
      '######...@+b######',
      '##################',
    ],
    guards: [{ k: 'goblin', p: [[1, 5], [16, 5]] }, { k: 'viking-f', p: [[16, 7], [1, 7]] }, { k: 'soldier', p: [[4, 4], [13, 4]], pause: 2 }],
    prisoners: ['kimono-f', 'doctor-old'],
    ambient: 0.14,
    par: 110,
    hint: 'h_dark',
    route: [['go', 6, 8], ['go', 6, 7], ['go', 2, 7], ['act', 2, 8], ['go', 12, 7], ['go', 16, 7], ['act', 16, 8], ['go', 10, 5], ['act', 8, 4], ['go', 7, 4], ['go', 8, 2], ['exit']],
  },
  {
    // 4-4 Last Cells: everything together
    map: [
      '####################',
      '##########X#########',
      '##########G#########',
      '#####i###...####i###',
      '#$....D.....^....D.#',
      '#*.B..#..O..^.O..#.#',
      '#.....#.....^...$#.#',
      '#...L.#..o..o....#.#',
      '##=####.#######.##=#',
      '##p####.#######.##p#',
      '#######...@+..b..###',
      '####################',
    ],
    guards: [
      { k: 'viking', p: [[8, 4], [16, 4]] },
      { k: 'bluesoldier-f', p: [[1, 6], [5, 6]] },
      { k: 'goblin-f', p: [[18, 5]], face: 'N', sleep: true },
      { k: 'soldier', p: [[9, 3], [11, 3]], pause: 2 },
    ],
    prisoners: ['casual3-f', 'cowboy-f'],
    powers: [],
    par: 130,
    hint: 'h_all',
    route: [['go', 7, 8], ['go', 7, 7], ['go', 5, 7], ['act', 4, 7], ['go', 2, 7], ['act', 2, 8], ['go', 7, 6], ['go', 15, 7], ['go', 18, 7], ['act', 18, 8], ['go', 15, 6], ['go', 10, 4], ['go', 10, 2], ['exit']],
  },
  {
    // 4-5 The Jailer Chief: put him to sleep from behind, take his keys, lead him into the barred
    // passage under the hall and shut it on him
    map: [
      '######################',
      '###########X##########',
      '###########E##########',
      '######i###...###i#####',
      '#$.O..............O.*#',
      '#....................#',
      '#..B....O....O....C..#',
      '#...................$#',
      '#..P.....######......#',
      '##=#####.G...G.L#.####',
      '##p###########.##.####',
      '#########....b....####',
      '#######...@+.#########',
      '######################',
    ],
    guards: [{ k: 'viking', p: [[1, 5], [20, 5]] }],
    boss: { p: [[4, 7], [17, 7]], trick: 'final', pause: 2.6 },
    trap: { lever: [15, 9], gates: [[9, 9], [13, 9]], area: [[10, 9], [12, 9]] },
    prisoners: ['doctor-old-f'],
    powers: ['powder'],
    par: 150,
    hint: 'h_boss4',
    route: [['go', 14, 11], ['go', 17, 9], ['go', 17, 8], ['go', 3, 8], ['go', 6, 7], ['power'], ['steal'], ['bait', 8, 8], ['go', 8, 9], ['go', 11, 9], ['go', 14, 9], ['act', 15, 9], ['cp'], ['go', 3, 8], ['act', 2, 9], ['go', 11, 3], ['exit']],
  },
];

// ------------------------------------------------------------------ the parser

const WALLISH = new Set(['#', 'i', ' ']);

export function buildLevel(n: number): Level {
  const d = DEFS[n - 1];
  const rows = d.map.length, cols = Math.max(...d.map.map((l) => l.length));
  const cells: Cell[] = [];
  const items: Item[] = [];
  const torches: Level['torches'] = [];
  const prisoners: Level['prisoners'] = [];
  const powers: Level['powers'] = [];
  let start: C2 = [1, 1], exit: C2 = [1, 1];
  let pi = 0, wi = 0;
  const ch = (c: number, r: number) => d.map[r]?.[c] ?? ' ';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r);
    cells.push({ k: k === ' ' ? 'void' : WALLISH.has(k) ? 'wall' : 'floor' });
    if (k === '@') start = [c, r];
    else if (k === 'X') exit = [c, r];
    else if (k === 'p') prisoners.push({ id: d.prisoners[pi++] ?? 'casual', c, r });
    else if (k === 'P') powers.push({ id: d.powers?.[wi++] ?? 'smoke', c, r });
    else if (k === 'i') {
      // a torch faces the first floor beside it (south first: the camera's side)
      for (const [dc, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as C2[]) {
        if (!WALLISH.has(ch(c + dc, r + dr))) { torches.push({ c, r, dc, dr }); break; }
      }
    } else if (k !== '.' && !WALLISH.has(k)) items.push({ ch: k, c, r });
  }
  return {
    n, wing: wingOf(n), cols, rows, cells, start, exit, items, torches,
    guards: d.guards, boss: d.boss ?? null, prisoners, powers, par: d.par, hint: d.hint ?? null,
    trap: d.trap ?? null, ambient: d.ambient ?? null, route: d.route,
    need: Math.max(1, Math.ceil(prisoners.length / 2)),
  };
}

export const parOf = (n: number): number => DEFS[n - 1].par;
export const prisonersOf = (n: number): string[] => DEFS[n - 1].prisoners;
/** The figures a level shows (guards, the Chief), for loading only what it needs. */
export function castOf(n: number): string[] {
  const d = DEFS[n - 1];
  const set = new Set<string>(d.guards.map((g) => g.k));
  if (d.boss) set.add('chief');
  for (const p of d.prisoners) set.add(p);
  return [...set];
}
