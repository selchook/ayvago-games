// Turkish Mangala rules (pure functions, shared by the board, the AI and the online check).
//
// Board: 14 cells in sowing (counter-clockwise) order.
//   0..5   side 0 pits (left to right from side 0's seat)
//   6      side 0 store (hazine)
//   7..12  side 1 pits
//   13     side 1 store
// Pit i faces pit 12 - i.

export const N = 14;
export const STONES = 4;
export type Side = 0 | 1;
export type Board = number[];

export const store = (s: Side): number => (s === 0 ? 6 : 13);
export const pitsOf = (s: Side): number[] => (s === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
export const ownerOf = (i: number): Side => (i <= 6 ? 0 : 1);
export const isStore = (i: number): boolean => i === 6 || i === 13;
export const opposite = (i: number): number => 12 - i;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export function initial(): Board {
  const b = new Array(N).fill(STONES);
  b[6] = 0;
  b[13] = 0;
  return b;
}

export function sideCount(b: Board, s: Side): number {
  let n = 0;
  for (const i of pitsOf(s)) n += b[i];
  return n;
}

export function legal(b: Board, s: Side): number[] {
  return pitsOf(s).filter((i) => b[i] > 0);
}

export interface Capture {
  /** Cells emptied into the store, with how many stones each gave. */
  from: Array<{ i: number; n: number }>;
  total: number;
  kind: 'even' | 'empty';
}

export interface Result {
  board: Board;
  /** Cell that receives each stone, in order (the first is the picked pit unless it held one stone). */
  path: number[];
  again: boolean;
  capture: Capture | null;
  /** Game end: the side whose pits ran out and the stones it took from the other side. */
  sweep: { to: Side; from: Array<{ i: number; n: number }>; total: number } | null;
  over: boolean;
}

function next(i: number, s: Side): number {
  let j = (i + 1) % N;
  if (j === store(other(s))) j = (j + 1) % N;
  return j;
}

/** Plays pit `pit` for side `s` (assumed legal) and returns the new board and what happened. */
export function play(src: Board, s: Side, pit: number): Result {
  const b = src.slice();
  let n = b[pit];
  b[pit] = 0;
  const path: number[] = [];
  let at = pit;
  if (n === 1) {
    at = next(pit, s);
    b[at]++;
    path.push(at);
  } else {
    // the first stone goes back into the picked pit
    b[pit]++;
    path.push(pit);
    n--;
    while (n-- > 0) {
      at = next(at, s);
      b[at]++;
      path.push(at);
    }
  }
  const last = at;
  let again = false;
  let capture: Capture | null = null;
  const home = store(s);
  if (last === home) again = true;
  else if (!isStore(last) && ownerOf(last) !== s && b[last] % 2 === 0) {
    capture = { from: [{ i: last, n: b[last] }], total: b[last], kind: 'even' };
    b[home] += b[last];
    b[last] = 0;
  } else if (!isStore(last) && ownerOf(last) === s && b[last] === 1 && b[opposite(last)] > 0) {
    const o = opposite(last);
    capture = { from: [{ i: last, n: 1 }, { i: o, n: b[o] }], total: 1 + b[o], kind: 'empty' };
    b[home] += 1 + b[o];
    b[last] = 0;
    b[o] = 0;
  }
  let sweep: Result['sweep'] = null;
  let over = false;
  for (const side of [s, other(s)] as Side[]) {
    if (sideCount(b, side) !== 0) continue;
    // this side ran out of stones: it takes everything left on the other side
    over = true;
    const from = pitsOf(other(side)).filter((i) => b[i] > 0).map((i) => ({ i, n: b[i] }));
    const total = from.reduce((a, f) => a + f.n, 0);
    for (const f of from) b[f.i] = 0;
    b[store(side)] += total;
    sweep = { to: side, from, total };
    break;
  }
  return { board: b, path, again: again && !over, capture, sweep, over };
}

// ---------------------------------------------------------------- AI

/** Search depth and the chance of a careless random move, per AI level. */
export const LEVELS = [
  { depth: 1, slip: 0.4 },
  { depth: 2, slip: 0.2 },
  { depth: 3, slip: 0.1 },
  { depth: 4, slip: 0.04 },
  { depth: 6, slip: 0 },
  { depth: 8, slip: 0 },
];

function evaluate(b: Board, me: Side): number {
  const diff = b[store(me)] - b[store(other(me))];
  // stones still on a side are worth a little to its owner (they tend to end up there)
  return diff * 10 + (sideCount(b, me) - sideCount(b, other(me)));
}

function search(b: Board, turn: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const moves = legal(b, turn);
  if (depth <= 0 || !moves.length) return evaluate(b, me);
  const maxing = turn === me;
  let best = maxing ? -Infinity : Infinity;
  for (const m of moves) {
    const r = play(b, turn, m);
    let v: number;
    if (r.over) {
      const d = r.board[store(me)] - r.board[store(other(me))];
      v = d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0;
    } else v = search(r.board, r.again ? turn : other(turn), me, depth - 1, alpha, beta);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return best;
}

/** Picks a pit for side `s` at AI level `level`; `rand` gives 0..1. */
export function choose(b: Board, s: Side, level: number, rand: () => number = Math.random): number {
  const moves = legal(b, s);
  const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];
  if (moves.length === 1) return moves[0];
  if (rand() < L.slip) return moves[Math.floor(rand() * moves.length)];
  let best = -Infinity;
  let picks: number[] = [];
  for (const m of moves) {
    const r = play(b, s, m);
    let v: number;
    if (r.over) {
      const d = r.board[store(s)] - r.board[store(other(s))];
      v = d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0;
    } else v = search(r.board, r.again ? s : other(s), s, L.depth - 1, -Infinity, Infinity);
    if (v > best + 1e-9) { best = v; picks = [m]; }
    else if (Math.abs(v - best) < 1e-9) picks.push(m);
  }
  return picks[Math.floor(rand() * picks.length)];
}
