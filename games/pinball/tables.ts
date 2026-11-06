// The five tables. Each one fills the space between the common frame (table.ts) with its own
// layout: ramps, orbit lanes, spinners, saucers and other holes, drop target banks, bumpers, upper
// flippers and a moving guard. A game starts on the first unlocked table the player picks; scoring
// a table's target moves the ball on to the next one, and after the fifth the tour starts again,
// harder. Every table has two or three missions that pay a jackpot when they are all done.

import {
  Seg, Bumper, World, Pt, ORBIT_L, ORBIT_R, ORBIT_TOP, ORBIT_BOT, buildFrame, buildFlippers, wall, smoothPath,
} from './table';

export interface Theme {
  bg: [string, string];       // playfield gradient, top → bottom
  neon: string;               // light core colour of the plastics
  glow: string;               // rail glow and playfield art
  bumper: number; flipper: number; target: number; lamp: number; sling: number;
  accent: string;             // text accent
}

export type Mission = 'ramps' | 'orbits' | 'spinner' | 'bumpers' | 'lanes' | 'banks' | 'saucer' | 'vortex' | 'wormhole' | 'cannon';
export type Motif = 'city' | 'ocean' | 'jungle' | 'forge' | 'space';
type Loc = { tr: string; en: string };

export interface RampDef { lane: { x0: number; x1: number; top: number; bot: number }; keys: Pt[]; exit: Pt }
/** saucer: holds and kicks out; cannon: fires straight up; vortex: pulls the ball in and flings it; wormhole: sends it to `to`. */
export const CATCH_SPEED: Record<HoleDef['kind'], number> = { saucer: 800, cannon: 900, vortex: 99999, wormhole: 1600 };
export interface HoleDef { x: number; y: number; kind: 'saucer' | 'cannon' | 'vortex' | 'wormhole'; eject?: Pt; pull?: number; to?: Pt }
export interface BankDef { x: number; y: number; n: number; vertical: boolean; face?: 'L' | 'R'; roof?: [Pt, Pt] }
export interface SpinnerDef { x: number; y: number; x0: number; x1: number }
export interface GuardDef { y: number; cx: number; sweep: number; half: number; speed: number }

export interface TableDef {
  name: { tr: string[]; en: string[] };     // painted on the table, one word per line
  title: Loc;                               // on the display and the menus
  motif: Motif;
  theme: Theme;
  target: number;                           // points on this table that open the next one
  orbitL: boolean; orbitR: boolean;
  bumpers: [number, number, number][];
  ramps: RampDef[];
  holes: HoleDef[];
  banks: BankDef[];
  spinners: SpinnerDef[];
  uppers: { px: number; py: number; side: 'L' | 'R' }[];
  guard?: GuardDef;
  missions: [Mission, number][];
  labels?: Partial<Record<Mission, Loc>>;   // a table's own name for a feature
}

const SPIN_L: SpinnerDef = { x: 61, y: 1080, x0: 34, x1: 90 };
const SPIN_R: SpinnerDef = { x: 619, y: 1000, x0: 594, x1: 646 };
const BANK_R: BankDef = { x: 560, y: 722, n: 4, vertical: true, face: 'L', roof: [[556, 698], [588, 678]] };
// ramps that end on the right or the left inlane
const TO_RIGHT: Pt[] = [[622, 1300], [621, 1560], [619, 1668]];
const TO_LEFT: Pt[] = [[60, 1300], [60, 1560], [61, 1668]];

export const TABLES: TableDef[] = [
  {
    name: { tr: ['NEON', 'GECE'], en: ['NEON', 'NIGHTS'] },
    title: { tr: 'NEON GECE', en: 'NEON NIGHTS' },
    motif: 'city',
    theme: { bg: ['#24115e', '#07051a'], neon: '#b8f7ff', glow: '#3ee6ff', bumper: 0xff4fa3, flipper: 0xff3b2a, target: 0xff8a1f, lamp: 0xffd23f, sling: 0xff4fa3, accent: '#ffd23f' },
    target: 25000,
    orbitL: true, orbitR: true,
    bumpers: [[250, 385, 36], [430, 385, 36], [340, 505, 36]],
    ramps: [{
      lane: { x0: 172, x1: 238, top: 900, bot: 1010 },
      keys: [[205, 935], [205, 780], [214, 690], [242, 636], [292, 604], [390, 592], [482, 606], [546, 642], [590, 702], [614, 790], [622, 900], ...TO_RIGHT],
      exit: [-60, 280],
    }],
    holes: [{ x: 430, y: 760, kind: 'saucer', eject: [-380, -450] }],
    banks: [BANK_R],
    spinners: [SPIN_L],
    uppers: [{ px: 104, py: 1212, side: 'L' }],
    missions: [['ramps', 3], ['orbits', 2]],
  },
  {
    name: { tr: ['DERİN', 'MAVİ'], en: ['DEEP', 'BLUE'] },
    title: { tr: 'DERİN MAVİ', en: 'DEEP BLUE' },
    motif: 'ocean',
    theme: { bg: ['#073a7a', '#020b1f'], neon: '#c8fdff', glow: '#00c8ff', bumper: 0x3ee6ff, flipper: 0xffd23f, target: 0x5dff7a, lamp: 0x7df9ff, sling: 0x3ee6ff, accent: '#7df9ff' },
    target: 50000,
    orbitL: false, orbitR: false,
    bumpers: [[340, 320, 30], [262, 410, 30], [418, 410, 30], [340, 500, 30]],
    ramps: [
      {
        lane: { x0: 120, x1: 186, top: 820, bot: 930 },
        keys: [[153, 855], [152, 720], [170, 650], [220, 612], [300, 600], [390, 612], [470, 650], [540, 705], [588, 790], [615, 900], ...TO_RIGHT],
        exit: [-60, 280],
      },
      {
        lane: { x0: 494, x1: 560, top: 820, bot: 930 },
        keys: [[527, 855], [528, 700], [516, 612], [470, 560], [390, 540], [300, 548], [220, 580], [160, 640], [110, 740], [75, 880], [62, 1100], ...TO_LEFT],
        exit: [60, 280],
      },
    ],
    holes: [{ x: 340, y: 760, kind: 'vortex', pull: 95 }],
    banks: [{ x: 340, y: 1000, n: 5, vertical: false }],
    spinners: [],
    uppers: [{ px: 576, py: 1212, side: 'R' }],
    missions: [['ramps', 4], ['vortex', 3]],
    labels: { vortex: { tr: 'GİRDAP', en: 'WHIRLPOOL' } },
  },
  {
    name: { tr: ['ORMAN', 'TAPINAĞI'], en: ['JUNGLE', 'TEMPLE'] },
    title: { tr: 'ORMAN TAPINAĞI', en: 'JUNGLE TEMPLE' },
    motif: 'jungle',
    theme: { bg: ['#11542b', '#03140a'], neon: '#e0ffc4', glow: '#5dff7a', bumper: 0xb6ff3e, flipper: 0xff8a1f, target: 0xffd23f, lamp: 0x8dff6a, sling: 0xb6ff3e, accent: '#b6ff3e' },
    target: 80000,
    orbitL: true, orbitR: true,
    bumpers: [[450, 330, 30], [530, 405, 28], [430, 445, 30]],
    ramps: [{
      lane: { x0: 300, x1: 366, top: 880, bot: 990 },
      keys: [[333, 915], [334, 760], [322, 672], [284, 622], [214, 612], [152, 650], [102, 760], [72, 900], [62, 1100], ...TO_LEFT],
      exit: [60, 280],
    }],
    holes: [
      { x: 175, y: 400, kind: 'saucer', eject: [380, -480] },
      { x: 250, y: 525, kind: 'saucer', eject: [420, -420] },
      { x: 150, y: 600, kind: 'saucer', eject: [430, -520] },
    ],
    banks: [
      { x: 130, y: 760, n: 3, vertical: true, face: 'R', roof: [[134, 736], [92, 716]] },
      { x: 550, y: 760, n: 3, vertical: true, face: 'L', roof: [[546, 736], [588, 716]] },
    ],
    spinners: [SPIN_L],
    uppers: [{ px: 576, py: 1212, side: 'R' }],
    guard: { y: 1120, cx: 340, sweep: 110, half: 44, speed: 1 },
    missions: [['saucer', 3], ['banks', 2]],
    labels: { saucer: { tr: 'PUT', en: 'IDOLS' } },
  },
  {
    name: { tr: ['ATEŞ', 'FIRINI'], en: ['FIRE', 'FORGE'] },
    title: { tr: 'ATEŞ FIRINI', en: 'FIRE FORGE' },
    motif: 'forge',
    theme: { bg: ['#661208', '#140302'], neon: '#ffe0b8', glow: '#ff6a1f', bumper: 0xff6a1f, flipper: 0xffd23f, target: 0xff3b3b, lamp: 0xffb13e, sling: 0xff6a1f, accent: '#ffb13e' },
    target: 120000,
    orbitL: true, orbitR: true,
    bumpers: [[230, 365, 28], [340, 330, 30], [450, 365, 28], [285, 465, 28], [395, 465, 28]],
    ramps: [{
      lane: { x0: 470, x1: 536, top: 860, bot: 970 },
      keys: [[503, 895], [504, 730], [515, 640], [490, 580], [420, 555], [330, 560], [240, 590], [160, 650], [108, 750], [72, 880], [62, 1100], ...TO_LEFT],
      exit: [60, 280],
    }],
    holes: [{ x: 200, y: 880, kind: 'cannon', eject: [60, -1550] }],
    banks: [{ x: 340, y: 760, n: 4, vertical: false }],
    spinners: [{ ...SPIN_L, y: 1000 }, SPIN_R],
    uppers: [{ px: 104, py: 1212, side: 'L' }],
    guard: { y: 1120, cx: 340, sweep: 120, half: 40, speed: 1.4 },
    missions: [['spinner', 50], ['bumpers', 40], ['cannon', 2]],
    labels: { cannon: { tr: 'TOP ATAR', en: 'CANNON' } },
  },
  {
    name: { tr: ['YILDIZ', 'GEÇİDİ'], en: ['STAR', 'GATE'] },
    title: { tr: 'YILDIZ GEÇİDİ', en: 'STAR GATE' },
    motif: 'space',
    theme: { bg: ['#420c6b', '#0a0218'], neon: '#ffd1f7', glow: '#ff4fe0', bumper: 0xd36bff, flipper: 0x3ee6ff, target: 0xff4fa3, lamp: 0xff8cf0, sling: 0xd36bff, accent: '#ff8cf0' },
    target: 170000,
    orbitL: true, orbitR: true,
    bumpers: [[250, 420, 30], [430, 420, 30], [340, 320, 28]],
    ramps: [
      {
        lane: { x0: 172, x1: 238, top: 900, bot: 1010 },
        keys: [[205, 935], [205, 780], [214, 690], [242, 636], [292, 604], [390, 592], [482, 606], [546, 642], [590, 702], [614, 790], [622, 900], ...TO_RIGHT],
        exit: [-60, 280],
      },
      {
        lane: { x0: 430, x1: 496, top: 900, bot: 1010 },
        keys: [[463, 935], [463, 790], [452, 700], [420, 650], [340, 628], [260, 640], [190, 680], [130, 760], [88, 880], [64, 1050], ...TO_LEFT],
        exit: [60, 280],
      },
    ],
    holes: [
      { x: 340, y: 560, kind: 'vortex', pull: 105 },
      { x: 150, y: 590, kind: 'wormhole', to: [330, 145] },
    ],
    banks: [BANK_R],
    spinners: [SPIN_L],
    uppers: [{ px: 104, py: 1212, side: 'L' }, { px: 576, py: 1212, side: 'R' }],
    missions: [['ramps', 5], ['wormhole', 2], ['vortex', 3]],
    labels: { vortex: { tr: 'KARA DELİK', en: 'BLACK HOLE' } },
  },
];

/** The target on a table in a given round of the tour (round 1 = the first time through). */
export const targetOf = (def: TableDef, round: number): number => Math.round(def.target * (1 + (round - 1) * 0.75));

export interface Tuning { gravity: number; kick: number; save: number; guard: number }

/** Difficulty grows with every table cleared in the run (stage 0 = the first table played). */
export function tuning(stage: number): Tuning {
  const k = Math.min(stage, 12);
  return { gravity: 1250 * (1 + k * 0.04), kick: Math.min(1200, 880 + k * 35), save: Math.max(3, 8 - k * 0.6), guard: 1 + k * 0.1 };
}

/** One drop target seg per target; `bank` maps target id → bank index. */
export interface BuiltTable { world: World; rampPaths: Pt[][]; bankOf: number[]; guard: Seg | null }

export function buildTable(def: TableDef, gravity: number, kick: number): BuiltTable {
  const walls = buildFrame();
  if (def.orbitL) wall(walls, ORBIT_L, ORBIT_TOP, ORBIT_L, ORBIT_BOT, 6, 0.4);
  if (def.orbitR) wall(walls, ORBIT_R, ORBIT_TOP, ORBIT_R, ORBIT_BOT, 6, 0.4);
  for (const r of def.ramps) {
    const l = r.lane;
    wall(walls, l.x0, l.top, l.x0, l.bot, 5, 0.35);
    wall(walls, l.x1, l.top, l.x1, l.bot, 5, 0.35);
    // a pointed roof: the inside stops a slow ball, the outside sheds a falling one
    const mid = (l.x0 + l.x1) / 2;
    wall(walls, l.x0, l.top, mid, l.top - 26, 5, 0.3);
    wall(walls, mid, l.top - 26, l.x1, l.top, 5, 0.3);
  }
  const targets: Seg[] = [], bankOf: number[] = [];
  def.banks.forEach((b, bi) => {
    for (let i = 0; i < b.n; i++) {
      const id = targets.length;
      if (b.vertical) {
        const y = b.y + i * 46;
        targets.push({ ax: b.x, ay: y - 18, bx: b.x, by: y + 18, r: 8, e: 0.35, kind: 'target', id, active: true });
      } else {
        const x = b.x + (i - (b.n - 1) / 2) * 46;
        targets.push({ ax: x - 18, ay: b.y, bx: x + 18, by: b.y, r: 8, e: 0.35, kind: 'target', id, active: true });
      }
      bankOf.push(bi);
    }
    if (b.roof) wall(walls, b.roof[0][0], b.roof[0][1], b.roof[1][0], b.roof[1][1], 5, 0.4);
  });
  let guard: Seg | null = null;
  if (def.guard) {
    const g = def.guard;
    guard = { ax: g.cx - g.half, ay: g.y, bx: g.cx + g.half, by: g.y, r: 7, e: 0.7, kind: 'post' };
    walls.push(guard);
  }
  const bumpers: Bumper[] = def.bumpers.map(([x, y, r], id) => ({ x, y, r, kick, id }));
  return {
    world: { ball: { x: 0, y: 0, vx: 0, vy: 0 }, walls, targets, bumpers, flippers: buildFlippers(def.uppers), gravity },
    rampPaths: def.ramps.map((r) => smoothPath(r.keys)),
    bankOf,
    guard,
  };
}

/** Bank target centre and the direction a ball must come from to hit it. */
export function bankTargets(b: BankDef): Pt[] {
  return Array.from({ length: b.n }, (_, i) => (b.vertical ? [b.x, b.y + i * 46] : [b.x + (i - (b.n - 1) / 2) * 46, b.y]) as Pt);
}
