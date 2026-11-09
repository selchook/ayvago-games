// Hex on an 11x11 rhombus: rules, two-distance evaluation and a shallow alpha-beta search.
// Cell index = r * N + c. RED (1) joins the c = 0 edge to the c = N - 1 edge (top to bottom on
// screen); BLUE (2) joins r = 0 to r = N - 1 (left to right).

export const N = 11;
export const CELLS = N * N;
export const RED = 1, BLUE = 2;
/** Neighbour offsets (dr, dc). */
export const DIRS: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];

export const NB: number[][] = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const list: number[] = [];
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N) list.push(rr * N + cc);
    }
    NB.push(list);
  }
}

const rowOf = (i: number) => (i / N) | 0;
const colOf = (i: number) => i % N;
/** Edge test: side 0 = start edge, 1 = end edge for player p. */
function onEdge(i: number, p: number, side: number): boolean {
  const v = p === RED ? colOf(i) : rowOf(i);
  return side === 0 ? v === 0 : v === N - 1;
}

/** Stones of the winning chain from edge to edge, or null. */
export function winPath(board: Int8Array, p: number): number[] | null {
  const prev = new Int16Array(CELLS).fill(-2);
  const q: number[] = [];
  for (let i = 0; i < CELLS; i++) if (board[i] === p && onEdge(i, p, 0)) { prev[i] = -1; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (onEdge(i, p, 1)) {
      const path: number[] = [];
      for (let k = i; k >= 0; k = prev[k]) path.push(k);
      return path.reverse();
    }
    for (const j of NB[i]) if (board[j] === p && prev[j] === -2) { prev[j] = i; q.push(j); }
  }
  return null;
}

// ---------------------------------------------------------------- two-distance

const BIG = 99;

interface Pot { map: Int16Array; min: number; count: number; connected: boolean }

const gid = new Int16Array(CELLS);
const stack: number[] = [];

/**
 * Two-distance potentials for player p. Own stones are transparent (an empty cell next to a
 * chain neighbours every empty cell around that chain). A cell's distance to an edge is one
 * more than its SECOND best neighbour's, so a single blocking stone does not cut a path.
 */
function potentials(board: Int8Array, p: number): Pot {
  // own chains
  gid.fill(-1);
  const groupCells: number[][] = [];
  const touch: number[] = [];   // bit 1 = start edge, bit 2 = end edge
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== p || gid[i] >= 0) continue;
    const g = groupCells.length, cells: number[] = [];
    let tch = 0;
    gid[i] = g; stack.length = 0; stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      if (onEdge(k, p, 0)) tch |= 1;
      if (onEdge(k, p, 1)) tch |= 2;
      for (const j of NB[k]) if (board[j] === p && gid[j] < 0) { gid[j] = g; stack.push(j); }
    }
    groupCells.push(cells); touch.push(tch);
  }
  const empty = new Int16Array(CELLS).fill(BIG);
  for (const t of touch) if (t === 3) return { map: empty.fill(0), min: 0, count: 1, connected: true };
  // empty cells around each chain
  const libs: number[][] = groupCells.map((cells) => {
    const seen = new Set<number>();
    for (const k of cells) for (const j of NB[k]) if (board[j] === 0) seen.add(j);
    return [...seen];
  });
  // extended neighbour lists of empty cells + edge contact through chains
  const ext: number[][] = new Array(CELLS);
  const edge = new Int8Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 0) continue;
    const s = new Set<number>();
    let e = (onEdge(i, p, 0) ? 1 : 0) | (onEdge(i, p, 1) ? 2 : 0);
    for (const j of NB[i]) {
      if (board[j] === 0) s.add(j);
      else if (board[j] === p) {
        const g = gid[j];
        e |= touch[g];
        for (const l of libs[g]) if (l !== i) s.add(l);
      }
    }
    ext[i] = [...s];
    edge[i] = e;
  }
  const dist = (bit: number): Int16Array => {
    const d = new Int16Array(CELLS).fill(BIG);
    const cnt = new Int8Array(CELLS);
    let level: number[] = [];
    for (let i = 0; i < CELLS; i++) if (board[i] === 0 && edge[i] & bit) { d[i] = 1; level.push(i); }
    let k = 1;
    while (level.length) {
      const next: number[] = [];
      for (const i of level) {
        for (const j of ext[i]) {
          if (d[j] !== BIG) continue;
          if (++cnt[j] === 2) { d[j] = k + 1; next.push(j); }
        }
      }
      level = next; k++;
    }
    return d;
  };
  const a = dist(1), b = dist(2);
  let min = BIG * 2, count = 0;
  const map = new Int16Array(CELLS).fill(BIG * 2);
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 0) continue;
    const v = Math.min(BIG * 2, a[i] + b[i]);
    map[i] = v;
    if (v < min) { min = v; count = 1; } else if (v === min) count++;
  }
  return { map, min, count, connected: false };
}

/** Static value for player p (higher = better for p). */
function evaluate(board: Int8Array, p: number): { v: number; me: Pot; op: Pot } {
  const me = potentials(board, p), op = potentials(board, 3 - p);
  if (me.connected) return { v: 100000, me, op };
  if (op.connected) return { v: -100000, me, op };
  const v = 40 * (op.min - me.min) + Math.min(me.count, 30) - Math.min(op.count, 30);
  return { v, me, op };
}

/** Candidate moves: empty cells on (or close to) either side's best paths. */
function candidates(board: Int8Array, me: Pot, op: Pot, k: number): number[] {
  const list: Array<[number, number]> = [];
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 0) continue;
    const a = me.map[i] - me.min, b = op.map[i] - op.min;
    list.push([i, Math.min(a, b) * 10 + (a + b)]);
  }
  list.sort((x, y) => x[1] - y[1]);
  return list.slice(0, k).map((x) => x[0]);
}

/** Search depth, candidate width per ply, the chance of a non-best move and how many top moves it picks from (default 4). */
export interface Level { depth: number; width: number[]; noise: number; pool?: number }
export const LEVELS: Level[] = [
  { depth: 1, width: [8], noise: 0.45 },
  { depth: 1, width: [12], noise: 0.15 },
  { depth: 2, width: [10, 8], noise: 0.05 },
  { depth: 2, width: [16, 12], noise: 0 },
  { depth: 3, width: [16, 12, 9], noise: 0 },
  { depth: 4, width: [18, 12, 9, 7], noise: 0 },
];
/** Easy (practice): a short ladder that looks one move ahead and often plays a lesser candidate. */
export const EASY_LEVELS: Level[] = [
  { depth: 1, width: [8], noise: 0.7, pool: 8 },
  { depth: 1, width: [8], noise: 0.55, pool: 6 },
  { depth: 1, width: [10], noise: 0.45, pool: 5 },
];

class Timeout extends Error {}

/** Best move for player p. Answers within about `budgetMs` (iterative deepening). */
export function chooseMove(board: Int8Array, p: number, lvl: Level, budgetMs = 650, rand: () => number = Math.random): number {
  const t0 = performance.now();
  const b = board.slice();
  const root = evaluate(b, p);
  let order = candidates(b, root.me, root.op, lvl.width[0]);
  if (!order.length) return -1;
  // a move that wins at once
  for (const m of order) {
    b[m] = p;
    const w = winPath(b, p);
    b[m] = 0;
    if (w) return m;
  }
  let best = order[0];
  const scores = new Map<number, number>();
  const search = (depth: number, ply: number, who: number, alpha: number, beta: number): number => {
    if (performance.now() - t0 > budgetMs) throw new Timeout();
    const e = evaluate(b, who);
    if (depth === 0 || Math.abs(e.v) >= 100000) return e.v;
    const moves = candidates(b, e.me, e.op, lvl.width[Math.min(ply, lvl.width.length - 1)]);
    let bestV = -Infinity;
    for (const m of moves) {
      b[m] = who;
      const v = -search(depth - 1, ply + 1, 3 - who, -beta, -alpha);
      b[m] = 0;
      if (v > bestV) bestV = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return bestV;
  };
  try {
    for (let depth = 1; depth <= lvl.depth; depth++) {
      let alpha = -Infinity, bestHere = order[0];
      for (const m of order) {
        b[m] = p;
        const v = -search(depth - 1, 1, 3 - p, -Infinity, -alpha);
        b[m] = 0;
        scores.set(m, v);
        if (v > alpha) { alpha = v; bestHere = m; }
      }
      best = bestHere;
      order = [...order].sort((x, y) => (scores.get(y) ?? 0) - (scores.get(x) ?? 0));
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
    b.set(board);
  }
  // weaker levels sometimes pick one of the next-best candidates
  if (lvl.noise && rand() < lvl.noise) {
    const pool = order.slice(0, Math.min(lvl.pool ?? 4, order.length));
    best = pool[(rand() * pool.length) | 0];
  }
  return best;
}

/** Opening stone for the first player: fair enough that a swap is not an easy decision. */
export function openingMove(level: number, rand: () => number = Math.random): number {
  if (level < 2) {
    const r = 3 + ((rand() * 5) | 0), c = 3 + ((rand() * 5) | 0);
    return r * N + c;
  }
  // near the red player's own edges, away from the acute corners
  const r = 2 + ((rand() * 7) | 0);
  const c = rand() < 0.5 ? 1 : N - 2;
  return r * N + c;
}

/** Should the second player swap after the first stone at `i`? */
export function wantsSwap(i: number, level: number, rand: () => number = Math.random): boolean {
  const r = rowOf(i), c = colOf(i);
  const central = Math.min(c, N - 1 - c) >= 2 && Math.min(r, N - 1 - r) >= 1;
  if (!central) return false;
  return level >= 2 || rand() < 0.5;
}

/** The swap: the first (red) stone at (r, c) becomes a blue stone at (c, r). */
export function swapCell(i: number): number {
  return colOf(i) * N + rowOf(i);
}
