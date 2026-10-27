// Reversi rules + AI (alpha-beta, iterative deepening, hard time budget). Board: 64 cells, 0 empty, 1 black, 2 white.
export const N = 8;
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];
const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];

/** Cells flipped if `p` plays at `idx` (empty array = illegal). */
export function flips(b: ArrayLike<number>, idx: number, p: number): number[] {
  if (b[idx]) return [];
  const o = 3 - p, out: number[] = [];
  const x0 = idx % N;
  for (const d of DIRS) {
    const run: number[] = [];
    let i = idx, x = x0;
    const sx = d === -9 || d === -1 || d === 7 ? -1 : d === -7 || d === 1 || d === 9 ? 1 : 0;
    for (;;) {
      i += d; x += sx;
      if (i < 0 || i >= 64 || x < 0 || x >= N) { run.length = 0; break; }
      if (b[i] === o) run.push(i);
      else { if (b[i] !== p) run.length = 0; break; }
    }
    out.push(...run);
  }
  return out;
}

export function legalMoves(b: ArrayLike<number>, p: number): number[] {
  const m: number[] = [];
  for (let i = 0; i < 64; i++) if (!b[i] && flips(b, i, p).length) m.push(i);
  return m;
}

export function count(b: ArrayLike<number>, p: number): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (b[i] === p) n++;
  return n;
}

class Abort extends Error {}

export class Brain {
  private nodes = 0;
  private deadline = 0;

  private evaluate(b: Int8Array, p: number): number {
    const o = 3 - p;
    let empties = 0, pos = 0, disc = 0;
    for (let i = 0; i < 64; i++) {
      if (b[i] === p) { pos += W[i]; disc++; } else if (b[i] === o) { pos -= W[i]; disc--; } else empties++;
    }
    if (empties < 10) return disc * 12 + pos;
    const mob = legalMoves(b, p).length - legalMoves(b, o).length;
    return pos + mob * 6;
  }

  private search(b: Int8Array, depth: number, alpha: number, beta: number, p: number, passed: boolean): number {
    if ((++this.nodes & 255) === 0 && performance.now() > this.deadline) throw new Abort();
    if (depth === 0) return this.evaluate(b, p);
    const moves = legalMoves(b, p);
    if (!moves.length) {
      if (passed) { const d = count(b, p) - count(b, 3 - p); return d * 10000; }
      return -this.search(b, depth - 1, -beta, -alpha, 3 - p, true);
    }
    moves.sort((a, c) => W[c] - W[a]);
    let best = -Infinity;
    for (const m of moves) {
      const nb = b.slice();
      nb[m] = p;
      for (const f of flips(b, m, p)) nb[f] = p;
      const sc = -this.search(nb, depth - 1, -beta, -alpha, 3 - p, false);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Picks a move for p, or -1 when there is none. */
  choose(board: ArrayLike<number>, p: number, maxDepth: number, randomness: number, budgetMs = 90): number {
    const b = Int8Array.from(board);
    const moves = legalMoves(b, p);
    if (!moves.length) return -1;
    if (Math.random() < randomness) return moves[Math.floor(Math.random() * moves.length)];
    moves.sort((a, c) => W[c] - W[a]);
    this.deadline = performance.now() + budgetMs;
    let best = moves[0];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        let alpha = -Infinity, bestHere = best;
        for (const m of [best, ...moves.filter((x) => x !== best)]) {
          const nb = b.slice();
          nb[m] = p;
          for (const f of flips(b, m, p)) nb[f] = p;
          const sc = -this.search(nb, d - 1, -Infinity, -alpha, 3 - p, false);
          if (sc > alpha) { alpha = sc; bestHere = m; }
        }
        best = bestHere;
      } catch (e) {
        if (e instanceof Abort) break;
        throw e;
      }
    }
    return best;
  }
}
