// Snow Express: the Journey (24 handcrafted levels in three chapters) and the Holiday Rush boards.
//
// A board is 8 × 12 tiles, row 0 at the back (the mountains), row 11 at the front. Grid characters:
//   |  -          straight track          L J F 7   corners (N-E, N-W, S-E, S-W)
//   +             crossing (tracks cross without joining)
//   #  %          overpass crossing: the N-S (#) or E-W (%) track runs over on a bridge
//   =  _          raised straight (N-S / E-W)    ^  >   ramp (N-S / E-W) up to a raised piece
//   1 … 9         a switch: its two pieces in `j` (e.g. '|L': straight on or turn east)
//   M N O Q       a merge: two pieces in `m`, no switch (trains only trail through)
//   T             a tunnel in the mountain (trains come out of it)
//   r b g y p k   a cabin taking that colour (red, blue, green, yellow, purple, pink)
// `deco` paints the ground: w = frozen lake (track over it runs on a wooden bridge), m = rocks.
import type { LevelMap } from './graph';
import { Board } from './graph';
import { findRoute, reachable } from './route';
export { reachable };
import type { Spawn, TrainKind } from './sim';
import { Rng, TUNING, CAR_GAP, type ColorId, type Mode } from './defs';

export type ChapterId = 0 | 1 | 2;

export interface LevelSpec {
  /** Trains in the level (plows not counted). */
  n: number;
  /** Seconds between trains (Normal). */
  gap: number;
  cars: [number, number];
  /** Share of express trains. */
  express?: number;
  /** Timetable positions that are snowplows. */
  plows?: number[];
  /** Train speed factor. */
  speed?: number;
}

export interface LevelDef extends LevelMap {
  id: number;
  chapter: ChapterId;
  /** New mechanic shown on the level's banner (a strings key), if any. */
  intro?: string;
  deco?: string[];
  spec: LevelSpec;
  /** A fixed timetable (the tutorial levels). */
  trains?: Spawn[];
}

const E = '........';

/** Colour of a stop letter, for the fixed timetables. */
const C = (c: ColorId): ColorId => c;
const tr = (t: number, color: ColorId, cars = 1, tunnel = 0, kind: TrainKind = 'normal'): Spawn => ({ t, tunnel, color, cars, kind });

const LAKE_A = [E, E, E, E, '..wwwww.', '.wwwwwww', '.wwwwww.', '..wwww..', E, E, E, E];
const LAKE_B = [E, E, E, E, E, 'www.....', 'wwww....', 'wwwww...', '.www....', E, E, E];
const LAKE_C = [E, E, E, '...ww...', '..wwww..', '.wwwwww.', '.wwwww..', '..www...', E, E, E, E];
const ROCKS = ['mm.mm.mm', 'm..m...m', E, E, E, E, E, E, E, E, E, E];

export const LEVELS: LevelDef[] = [
  // ------------------------------------------------------------ chapter 1: Snowy Village
  {
    id: 1, chapter: 0, intro: 'intro_switch',
    grid: ['...T....', '...|....', '...|....', '...1-7..', '...|.|..', '...|.|..', '...|.|..', '...|.|..', '...r.b..', E, E, E],
    j: { 1: '|L' },
    spec: { n: 5, gap: 10, cars: [1, 1] },
    trains: [tr(4, C('blue')), tr(15, C('red')), tr(24, C('blue')), tr(33, C('red'), 2), tr(40, C('blue'), 2)],
  },
  {
    id: 2, chapter: 0, intro: 'intro_hearts',
    grid: ['..T.....', '..|.....', '..1--7..', '..|..|..', '..|..2-7', '..|..|.|', '..|..|.|', '..g..b.|', '.......r', E, E, E],
    j: { 1: '|L', 2: '|L' },
    spec: { n: 6, gap: 9, cars: [1, 1] },
    trains: [tr(4, C('red')), tr(13, C('green')), tr(20, C('blue')), tr(26, C('red'), 2), tr(32, C('blue')), tr(38, C('green'), 2)],
  },
  {
    id: 3, chapter: 0,
    grid: ['....T...', '....|...', '..F-1-7.', '..|...|.', '..2-7.37', '..|.|.||', '..|.|.||', '..|.|.||', '..g.y.br', E, E, E],
    j: { 1: 'JL', 2: '|L', 3: '|L' },
    spec: { n: 8, gap: 7.5, cars: [1, 2] },
  },
  {
    id: 4, chapter: 0,
    grid: ['T.......', '|.......', '1-----7.', '|.....|.', '|....F2.', '3-7..||.', '|.|..||.', '|.|..||.', 'r.b..gy.', E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|L' },
    spec: { n: 9, gap: 7, cars: [1, 2] },
  },
  {
    id: 5, chapter: 0, intro: 'intro_tunnels',
    grid: ['.T....T.', '.|....|.', '.1-7F-2.', '.|.||.|.', 'F4.MJ.37', '||.|..||', '||.|..||', 'br.g..yp', E, E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|L', 4: '|J' }, m: { M: '|F' },
    spec: { n: 10, gap: 6.6, cars: [1, 2] },
  },
  {
    id: 6, chapter: 0, intro: 'intro_crossing',
    grid: ['.T....T.', '.|....|.', '.1-7F-2.', '.|.||.|.', '.|F++-3.', '.||||.|.', '.||||.|.', '.rgby.p.', E, E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|J' },
    spec: { n: 10, gap: 6.4, cars: [1, 2] },
  },
  {
    id: 7, chapter: 0, intro: 'intro_signal',
    grid: ['.T....T.', '.|....|.', '.|....|.', '.L-M--J.', '...|....', '.F-1....', '.|.2-7..', '.|.|.|..', '.|.|.|..', '.r.b.g..', E, E],
    j: { 1: '|J', 2: '|L' }, m: { M: '7F' }, sig: [[2, 3], [5, 3]],
    spec: { n: 10, gap: 6, cars: [1, 2] },
  },
  {
    id: 8, chapter: 0,
    grid: ['..T..T..', '..|..|..', '.F1..|..', '.||..|..', '.|3--+7.', '.||..||.', '.||.F4|.', '.||.|||.', '.rb.gyp.', E, E, E],
    j: { 1: '|J', 3: '|L', 4: '|J' }, sig: [[5, 3]],
    spec: { n: 12, gap: 5.8, cars: [1, 2] },
  },
  // ------------------------------------------------------------ chapter 2: Frozen Lake
  {
    id: 9, chapter: 1, intro: 'intro_lake',
    grid: ['...T....', '...|....', '.F-1-7..', '.|...|..', '.|...2-7', '.|...|.|', '.3-7.|.|', '.|.|.|.|', '.|.|.|.|', '.r.b.g.y', E, E],
    j: { 1: 'JL', 2: '|L', 3: '|L' }, deco: LAKE_A,
    spec: { n: 10, gap: 6, cars: [1, 2], speed: 1.02 },
  },
  {
    id: 10, chapter: 1, intro: 'intro_loop',
    grid: ['...T...T', '...|...|', '...1-7.|', '...|.|.|', '...|.|F4', '...M-J||', '...2-7||', '.F-3.|||', '.|.|.|||', '.r.b.gpy', E, E],
    j: { 1: '|L', 2: '|L', 3: '|J', 4: '|J' }, m: { M: '|F' }, deco: LAKE_B,
    spec: { n: 11, gap: 5.6, cars: [1, 2], speed: 1.02 },
  },
  {
    id: 11, chapter: 1, intro: 'intro_express',
    grid: ['.T....T.', '.|....|.', '.1-7.F2.', '.|.|.||.', '.|.3-M|.', '.|.|.||.', 'F4.|.||.', '||.|.||.', '||.|.||.', 'br.g.yp.', E, E],
    j: { 1: '|L', 2: '|J', 3: '|L', 4: '|J' }, m: { M: '|7' }, deco: LAKE_C,
    spec: { n: 12, gap: 5.6, cars: [1, 2], express: 0.3, speed: 1.02 },
  },
  {
    id: 12, chapter: 1,
    grid: ['T.....T.', '|.....|.', '1--7..|.', '|F-+--2.', '||.|..|.', '||.3-7|.', '||.|.||.', '||.|.||.', 'br.g.yp.', E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|L' }, sig: [[3, 2]], deco: LAKE_C,
    spec: { n: 12, gap: 5.4, cars: [1, 2], express: 0.15, speed: 1.04 },
  },
  {
    id: 13, chapter: 1,
    grid: ['..T..T..', '..|..|..', 'F-1..2-7', '|.|..|.|', '|.3--M.|', '|.|..|.|', '|.|F-4.|', '|.||.|.|', '|.||.|.|', 'b.rg.y.p', E, E],
    j: { 1: '|J', 2: '|L', 3: '|L', 4: '|J' }, m: { M: '|7' }, sig: [[4, 4]], deco: LAKE_A,
    spec: { n: 12, gap: 5.6, cars: [1, 2], express: 0.25, speed: 1.05 },
  },
  {
    id: 14, chapter: 1, intro: 'intro_six',
    grid: ['...T....', '...|....', '.F-1-7..', '.|...|..', '.2-7.3-7', '.|.|.|.|', 'F4.|F5.|', '||.|||.|', '||.|||.|', 'br.gyp.k', E, E],
    j: { 1: 'JL', 2: '|L', 3: '|L', 4: '|J', 5: '|J' }, deco: LAKE_B,
    spec: { n: 13, gap: 6, cars: [1, 2], express: 0.15, speed: 1.05 },
  },
  {
    id: 15, chapter: 1,
    grid: ['.T....T.', '.|....|.', '.1-7..|.', '.|F+--2.', '.|||..|.', '.M+J.F4.', 'F3|..||.', '|||..||.', '|||..||.', 'brg..yp.', E, E],
    j: { 1: '|L', 2: '|J', 3: '|J', 4: '|J' }, m: { M: '|F' }, sig: [[5, 3]], deco: LAKE_C,
    spec: { n: 13, gap: 5, cars: [1, 2], express: 0.3, speed: 1.06 },
  },
  {
    id: 16, chapter: 1,
    grid: ['..T..T..', '..|..|..', 'F-1..2-7', '|.|..|.|', '|.3--M.|', '|.|..|F6', '|.|F-4||', '|.||.|||', '|.||.|||', 'b.rg.ykp', E, E],
    j: { 1: '|J', 2: '|L', 3: '|L', 4: '|J', 6: '|J' }, m: { M: '|7' }, sig: [[5, 3], [4, 4]], deco: LAKE_A,
    spec: { n: 13, gap: 6.2, cars: [1, 2], express: 0.25, speed: 1.06 },
  },
  // ------------------------------------------------------------ chapter 3: Mountain Pass
  {
    id: 17, chapter: 2, intro: 'intro_bridge',
    grid: ['.T....T.', '.|....|.', '.1-7..|.', '.|.^..|.', '.|F#--2.', '.||^..|.', '.|||.F3.', '.|||.||.', '.rgb.yp.', E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|J' }, deco: ROCKS,
    spec: { n: 12, gap: 5, cars: [1, 2], express: 0.15, speed: 1.08 },
  },
  {
    id: 18, chapter: 2, intro: 'intro_plow',
    grid: ['...T....', '...|....', '.F-1-7..', '.|...|..', '.2-7.3-7', '.|.|.|.|', '.|.|.|.|', '.|.|.|.|', '.r.b.g.y', E, E, E],
    j: { 1: 'JL', 2: '|L', 3: '|L' }, drift: [[3, 6], [7, 6]], deco: ROCKS,
    spec: { n: 12, gap: 5, cars: [1, 2], plows: [0, 5], speed: 1.08 },
  },
  {
    id: 19, chapter: 2, intro: 'intro_long',
    grid: ['T......T', '|......|', '1--7...|', '|..|..F2', '|..|..||', '|F>%>-3|', '||.|..||', '||.4-7||', '||.|.|||', 'br.g.ypk', E, E],
    j: { 1: '|L', 2: '|J', 3: '|J', 4: '|L' }, deco: ROCKS,
    spec: { n: 12, gap: 5.6, cars: [2, 3], express: 0.1, speed: 1.08 },
  },
  {
    id: 20, chapter: 2, intro: 'intro_three',
    grid: ['T..T..T.', '|..|..|.', '|.F1-7|.', '|.|..||.', '2-M..N3.', '|.|..||.', '|.4-7||.', '|.|.|||.', 'b.r.pgy.', E, E, E],
    j: { 1: 'JL', 2: '|L', 3: '|J', 4: '|L' }, m: { M: '|7', N: '|F' }, sig: [[1, 4], [6, 3]], deco: ROCKS,
    spec: { n: 14, gap: 4.4, cars: [1, 2], express: 0.2, speed: 1.1 },
  },
  {
    id: 21, chapter: 2,
    grid: ['.T....T.', '.|....|.', 'F1..F-2.', '||..|.|.', '|3-7|.47', '||.||.||', '||.||.||', '||.||.||', 'kb.ry.gp', E, E, E],
    j: { 1: '|J', 2: '|J', 3: '|L', 4: '|L' }, drift: [[3, 6], [7, 6]], deco: ROCKS,
    spec: { n: 14, gap: 4.6, cars: [1, 3], plows: [0, 7], speed: 1.1 },
  },
  {
    id: 22, chapter: 2,
    grid: ['..T..T..', '..|..|..', 'F-1..|..', '|.|..^..', '|.2--#7.', '|.|..^|.', '|.|.F3|.', '|.|.|||.', 'b.r.gyp.', E, E, E],
    j: { 1: '|J', 2: '|L', 3: '|J' }, sig: [[2, 3], [5, 2]], drift: [[0, 5]], deco: ROCKS,
    spec: { n: 14, gap: 4.4, cars: [1, 3], express: 0.2, plows: [0], speed: 1.12 },
  },
  {
    id: 23, chapter: 2,
    grid: ['T..T...T', '|..|...|', '1-7|...|', '|.||..F2', '|.|3-7||', '|.||.|||', '4-++7|||', '|.||||||', 'b.rgpkyg', E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|L', 4: '|L' }, sig: [[1, 6]], deco: ROCKS,
    spec: { n: 15, gap: 4.2, cars: [1, 3], express: 0.35, speed: 1.12 },
  },
  {
    id: 24, chapter: 2, intro: 'intro_final',
    grid: ['T..T..T.', '|..|..|.', '1-7|..|.', '|.|^F-2.', '3-+#+7|.', '|.|^|||.', '|.|||||.', '|.|||||.', 'b.rgypk.', E, E, E],
    j: { 1: '|L', 2: '|J', 3: '|L' }, sig: [[1, 4], [4, 3]], drift: [[2, 6]], deco: ROCKS,
    spec: { n: 16, gap: 4.1, cars: [2, 3], express: 0.3, plows: [0], speed: 1.14 },
  },
];

/** Holiday Rush boards (one per run, in turn): every colour has a cabin; they open as the run goes. */
export const RUSH: LevelDef[] = [
  { ...LEVELS[15], id: 101, drift: [], spec: { n: 0, gap: 0, cars: [1, 3] } },
  { ...LEVELS[20], id: 102, drift: [], spec: { n: 0, gap: 0, cars: [1, 3] } },
  { ...LEVELS[13], id: 103, drift: [], spec: { n: 0, gap: 0, cars: [1, 3] } },
];

export const CHAPTERS: { id: ChapterId; levels: number[]; need: number }[] = [
  { id: 0, levels: [1, 2, 3, 4, 5, 6, 7, 8], need: 0 },
  { id: 1, levels: [9, 10, 11, 12, 13, 14, 15, 16], need: 14 },
  { id: 2, levels: [17, 18, 19, 20, 21, 22, 23, 24], need: 32 },
];

export const level = (id: number): LevelDef => LEVELS.find((l) => l.id === id) ?? RUSH.find((l) => l.id === id) ?? LEVELS[0];

/** A level's timetable for a difficulty (fixed for the tutorial levels, seeded otherwise). */
export function timetable(def: LevelDef, mode: Mode, seed: number): Spawn[] {
  const k = TUNING[mode].gap;
  if (def.trains) return def.trains.map((s) => ({ ...s, t: 2 + (s.t - 2) * k }));
  const b = new Board(def);
  const r = new Rng(seed * 7919 + def.id * 104729);
  const sp = def.spec;
  // tunnels that can reach a drift send the plows; until a plow has cleared a drift (and one more
  // train has gone by), the cabins behind it get no trains
  const drifts = new Set(def.drift?.map(([c, rr]) => c + rr * 8) ?? []);
  const plowTunnels = b.tunnels.map((t, i) => i).filter((i) => {
    const tn = b.tunnels[i];
    return drifts.size > 0 && !!findRoute(b, tn.lead, true, b.segs[tn.lead].len, { drift: drifts });
  });
  let pendingClear = -1, clearIn = 0;
  const out: Spawn[] = [];
  const plows = new Set(sp.plows ?? []);
  let t = 4;
  let last: ColorId | null = null, last2: ColorId | null = null;
  let lastTunnel = -1;
  const lastOut = new Map<number, Spawn>();
  const total = sp.n + plows.size;
  for (let i = 0; i < total; i++) {
    if (pendingClear >= 0 && --clearIn <= 0) { drifts.delete(pendingClear); pendingClear = -1; }
    if (plows.has(i) && plowTunnels.length) {
      const tunnel = r.pick(plowTunnels);
      const tn = b.tunnels[tunnel];
      const route = drifts.size ? findRoute(b, tn.lead, true, b.segs[tn.lead].len, { drift: drifts }) : null;
      if (route) { pendingClear = route.tiles[route.tiles.length - 1]; clearIn = 2; }
      out.push({ t, tunnel, color: null, cars: 0, kind: 'plow' });
      t += sp.gap * k * 0.9;
      continue;
    }
    // alternate tunnels loosely
    let tunnel = r.int(0, b.tunnels.length - 1);
    if (tunnel === lastTunnel && b.tunnels.length > 1 && r.chance(0.5)) tunnel = (tunnel + 1) % b.tunnels.length;
    lastTunnel = tunnel;
    let colors = reachable(b, tunnel, drifts);
    for (let n = 0; n < b.tunnels.length && !colors.length; n++) {
      tunnel = (tunnel + 1) % b.tunnels.length;
      colors = reachable(b, tunnel, drifts);
    }
    let color = r.pick(colors);
    for (let tries = 0; tries < 6 && colors.length > 2 && color === last && color === last2; tries++) color = r.pick(colors);
    last2 = last; last = color;
    const express = r.chance(sp.express ?? 0);
    const cars = express ? Math.min(2, r.int(sp.cars[0], sp.cars[1])) : r.int(sp.cars[0], sp.cars[1]);
    // keep a fair headway behind the last train out of the same tunnel: room to flip a switch
    // between them (an express catches up, so it waits longer)
    const prev = lastOut.get(tunnel);
    if (prev) {
      const v = TUNING[mode].speed * (sp.speed ?? 1);
      const head = ((prev.cars + 1) * CAR_GAP + 2.6) / v * (express && prev.kind !== 'express' ? 1.7 : 1);
      t = Math.max(t, prev.t + head);
    }
    const sp1: Spawn = { t, tunnel, color, cars, kind: express ? 'express' : 'normal' };
    lastOut.set(tunnel, sp1);
    out.push(sp1);
    t += sp.gap * k * r.range(0.8, 1.2) * (express ? 1.1 : 1) + (cars - 1) * 0.6;
  }
  return out;
}
