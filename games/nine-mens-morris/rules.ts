// Nine Men's Morris rules and an iterative-deepening alpha-beta (negamax) AI.
// Points 0..23 on the classic board of three nested squares (7x7 grid coordinates below).

export const POS: Array<[number, number]> = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6],
];
const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14], [15, 16], [16, 17], [18, 19], [19, 20], [21, 22], [22, 23],
  [0, 9], [9, 21], [3, 10], [10, 18], [6, 11], [11, 15], [1, 4], [4, 7], [16, 19], [19, 22], [8, 12], [12, 17], [5, 13], [13, 20], [2, 14], [14, 23],
];
export const MILLS: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];
export const ADJ: number[][] = Array.from({ length: 24 }, () => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }
const MILLS_AT: number[][][] = Array.from({ length: 24 }, (_, i) => MILLS.filter((m) => m.includes(i)));

export const STONES = 9;
/** Plies in the moving phase without a capture before the game is called a draw. */
export const DRAW_PLIES = 50;

export interface State {
  board: Int8Array;          // 24 points: 0 empty, 1 / 2 stones
  hand: [number, number, number];   // stones still to place, index by player
  turn: 1 | 2;
  quiet: number;             // plies without a capture once both hands are empty
}
export interface Move { f: number; t: number; x: number }   // from (-1 = place), to, removed (-1 = none)

export function newState(): State {
  return { board: new Int8Array(24), hand: [0, STONES, STONES], turn: 1, quiet: 0 };
}
export function clone(s: State): State {
  return { board: s.board.slice(), hand: [0, s.hand[1], s.hand[2]], turn: s.turn, quiet: s.quiet };
}

export function count(s: State, p: number): number {
  let n = 0;
  for (let i = 0; i < 24; i++) if (s.board[i] === p) n++;
  return n;
}

export function inMill(board: Int8Array, i: number): boolean {
  const p = board[i];
  if (!p) return false;
  for (const m of MILLS_AT[i]) if (board[m[0]] === p && board[m[1]] === p && board[m[2]] === p) return true;
  return false;
}

/** Mill lines through i that are complete for the stone on i. */
export function millsAt(board: Int8Array, i: number): number[][] {
  const p = board[i];
  return p ? MILLS_AT[i].filter((m) => board[m[0]] === p && board[m[1]] === p && board[m[2]] === p) : [];
}

/** Stones of player q that may be taken: those outside mills, or any if all are in mills. */
export function removable(board: Int8Array, q: number): number[] {
  const all: number[] = [], free: number[] = [];
  for (let i = 0; i < 24; i++) if (board[i] === q) { all.push(i); if (!inMill(board, i)) free.push(i); }
  return free.length ? free : all;
}

export function flying(s: State, p: number): boolean {
  return s.hand[p] === 0 && count(s, p) === 3;
}

/** Destinations for the stone on f (move phase), or every empty point when placing. */
export function targets(s: State, p: number, f: number): number[] {
  const out: number[] = [];
  if (f < 0 || flying(s, p)) { for (let i = 0; i < 24; i++) if (!s.board[i]) out.push(i); return out; }
  for (const j of ADJ[f]) if (!s.board[j]) out.push(j);
  return out;
}

/** Steps (from, to) without the capture, for the side to move. */
export function steps(s: State): Array<[number, number]> {
  const p = s.turn, out: Array<[number, number]> = [];
  if (s.hand[p] > 0) { for (let i = 0; i < 24; i++) if (!s.board[i]) out.push([-1, i]); return out; }
  const fly = count(s, p) === 3;
  for (let f = 0; f < 24; f++) {
    if (s.board[f] !== p) continue;
    if (fly) { for (let i = 0; i < 24; i++) if (!s.board[i]) out.push([f, i]); }
    else for (const j of ADJ[f]) if (!s.board[j]) out.push([f, j]);
  }
  return out;
}

/** True when the step (f, t) closes a mill for the mover. */
export function closesMill(s: State, f: number, t: number): boolean {
  const p = s.turn, b = s.board;
  const old = f >= 0 ? b[f] : 0;
  if (f >= 0) b[f] = 0;
  b[t] = p;
  const m = inMill(b, t);
  b[t] = 0;
  if (f >= 0) b[f] = old;
  return m;
}

export function moves(s: State): Move[] {
  const out: Move[] = [];
  const q = s.turn === 1 ? 2 : 1;
  for (const [f, t] of steps(s)) {
    if (closesMill(s, f, t)) {
      const b = s.board;
      if (f >= 0) b[f] = 0;
      b[t] = s.turn;
      const rem = removable(b, q);
      b[t] = 0;
      if (f >= 0) b[f] = s.turn;
      if (rem.length) { for (const x of rem) out.push({ f, t, x }); continue; }
    }
    out.push({ f, t, x: -1 });
  }
  return out;
}

export function apply(s: State, m: Move): void {
  const p = s.turn;
  if (m.f < 0) s.hand[p]--;
  else s.board[m.f] = 0;
  s.board[m.t] = p;
  if (m.x >= 0) s.board[m.x] = 0;
  if (s.hand[1] === 0 && s.hand[2] === 0) s.quiet = m.x >= 0 ? 0 : s.quiet + 1;
  s.turn = p === 1 ? 2 : 1;
}

export function isLegal(s: State, m: Move): boolean {
  return moves(s).some((k) => k.f === m.f && k.t === m.t && k.x === m.x);
}

/** 0 running, 1 / 2 winner, 3 draw. Checked for the side to move after a move. */
export function result(s: State): number {
  const p = s.turn, q = p === 1 ? 2 : 1;
  if (s.hand[p] + count(s, p) < 3) return q;
  if (s.hand[p] === 0 && steps(s).length === 0) return q;
  if (s.quiet >= DRAW_PLIES) return 3;
  return 0;
}

// ---------------------------------------------------------------- AI

function evaluate(s: State, p: number): number {
  const q = p === 1 ? 2 : 1, b = s.board;
  let v = 0;
  const mp = s.hand[p] + count(s, p), mq = s.hand[q] + count(s, q);
  v += (mp - mq) * 120;
  // open two-in-a-rows and complete mills
  for (const m of MILLS) {
    let a = 0, c = 0, e = 0;
    for (const i of m) { if (b[i] === p) a++; else if (b[i] === q) c++; else e++; }
    if (a === 3) v += 14; else if (c === 3) v -= 14;
    if (a === 2 && e === 1) v += 9; else if (c === 2 && e === 1) v -= 9;
  }
  // mobility in the moving phase
  if (s.hand[p] === 0 && mp > 3) {
    let mob = 0, blocked = 0;
    for (let i = 0; i < 24; i++) if (b[i] === p) { let k = 0; for (const j of ADJ[i]) if (!b[j]) k++; mob += k; if (!k) blocked++; }
    v += mob * 3 - blocked * 4;
  }
  if (s.hand[q] === 0 && mq > 3) {
    let mob = 0, blocked = 0;
    for (let i = 0; i < 24; i++) if (b[i] === q) { let k = 0; for (const j of ADJ[i]) if (!b[j]) k++; mob += k; if (!k) blocked++; }
    v -= mob * 3 - blocked * 4;
  }
  return v;
}

export interface Level { depth: number; ms: number; noise: number }
export const LEVELS: Level[] = [
  { depth: 1, ms: 80, noise: 0.35 },
  { depth: 2, ms: 150, noise: 0.12 },
  { depth: 3, ms: 250, noise: 0.04 },
  { depth: 4, ms: 400, noise: 0 },
  { depth: 5, ms: 600, noise: 0 },
  { depth: 7, ms: 700, noise: 0 },
];
/** Easy (practice): a short ladder that looks one or two plies ahead and often plays a near-best move. */
export const EASY_LEVELS: Level[] = [
  { depth: 1, ms: 80, noise: 0.65 },
  { depth: 1, ms: 80, noise: 0.5 },
  { depth: 2, ms: 150, noise: 0.35 },
];

const WIN = 100000;
class Timeout extends Error {}

export function choose(root: State, lvl: Level, rand: () => number = Math.random): Move | null {
  const t0 = performance.now();
  let order = moves(root);
  if (!order.length) return null;
  // captures first
  order.sort((a, b) => (b.x >= 0 ? 1 : 0) - (a.x >= 0 ? 1 : 0));
  let best = order[0];
  let nodes = 0;
  const negamax = (s: State, depth: number, ply: number, alpha: number, beta: number): number => {
    if ((++nodes & 255) === 0 && performance.now() - t0 > lvl.ms) throw new Timeout();
    const r = result(s);
    if (r === 3) return 0;
    if (r) return r === s.turn ? WIN - ply : -(WIN - ply);
    if (depth === 0) return evaluate(s, s.turn);
    const list = moves(s);
    list.sort((a, b) => (b.x >= 0 ? 1 : 0) - (a.x >= 0 ? 1 : 0));
    let bestV = -Infinity;
    for (const m of list) {
      const c = clone(s);
      apply(c, m);
      const v = -negamax(c, depth - 1, ply + 1, -beta, -alpha);
      if (v > bestV) bestV = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return bestV;
  };
  let scored: Array<[Move, number]> = order.map((m) => [m, 0]);
  try {
    for (let depth = 1; depth <= lvl.depth; depth++) {
      let alpha = -Infinity;
      const now: Array<[Move, number]> = [];
      for (const [m] of scored) {
        const c = clone(root);
        apply(c, m);
        const v = -negamax(c, depth - 1, 1, -Infinity, -alpha);
        now.push([m, v]);
        if (v > alpha) alpha = v;
      }
      now.sort((a, b) => b[1] - a[1]);
      scored = now;
      best = scored[0][0];
      if (scored[0][1] >= WIN - 100) break;   // a forced win found
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  }
  if (lvl.noise && rand() < lvl.noise && scored.length > 1) {
    const pool = scored.slice(0, Math.min(4, scored.length));
    best = pool[(rand() * pool.length) | 0][0];
  }
  return best;
}
