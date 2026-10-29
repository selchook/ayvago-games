// Sudoku generator: a random full grid, then symmetric cell removal while the puzzle keeps
// exactly one solution. Digits are stored 1..9, empty cells are 0; candidate sets are bit
// masks with bit d set for digit d.

const ALL = 0x3fe;

export const rowOf = (i: number): number => Math.floor(i / 9);
export const colOf = (i: number): number => i % 9;
export const boxOf = (i: number): number => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

function popcount(m: number): number {
  let c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Depth-first search with the most-constrained cell first. Counts solutions up to `limit`;
 * with `fill` set, the first solution is written back into `g` (digits tried in random order).
 */
function search(g: number[], limit: number, rnd?: () => number, fill = false): number {
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = 1 << v;
    if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & b) return 0;
    rows[rowOf(i)] |= b; cols[colOf(i)] |= b; boxes[boxOf(i)] |= b;
  }
  let count = 0;
  const rec = (): boolean => {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & ALL;
      const c = popcount(m);
      if (c === 0) return false;
      if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c === 1) break; }
    }
    if (best < 0) { count++; return count >= limit; }
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rnd) shuffled(digits, rnd);
    const r = rowOf(best), c = colOf(best), bx = boxOf(best);
    for (const d of digits) {
      const b = 1 << d;
      g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
      if (rec()) { if (!fill) g[best] = 0; if (!fill) { rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b; } return true; }
      g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
    }
    return false;
  };
  rec();
  return count;
}

export function countSolutions(g: number[], limit = 2): number {
  return search(g.slice(), limit);
}

export interface Puzzle {
  puzzle: number[];
  solution: number[];
}

function carve(givens: number, rnd: () => number): Puzzle & { filled: number } {
  const solution = new Array(81).fill(0);
  search(solution, 1, rnd, true);
  const puzzle = solution.slice();
  let filled = 81;
  // Symmetric pairs (i, 80 - i) keep the classic look of a printed sudoku.
  for (const i of shuffled(Array.from({ length: 41 }, (_, k) => k), rnd)) {
    if (filled <= givens) break;
    const j = 80 - i;
    const a = puzzle[i], b = puzzle[j];
    const pair = i !== j;
    if (pair && filled - 2 < givens) continue;
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = a; puzzle[j] = b; continue; }
    filled -= pair ? 2 : 1;
  }
  // Then single cells, for the sparse grids of the harder levels.
  for (const i of shuffled(Array.from({ length: 81 }, (_, k) => k), rnd)) {
    if (filled <= givens) break;
    if (!puzzle[i]) continue;
    const a = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = a; continue; }
    filled--;
  }
  return { puzzle, solution, filled };
}

/** Builds a puzzle with a unique solution and about `givens` clues (never fewer). */
export function generate(givens: number, rnd: () => number = Math.random): Puzzle {
  let best = carve(givens, rnd);
  for (let k = 0; k < 12 && best.filled > givens; k++) {
    const p = carve(givens, rnd);
    if (p.filled < best.filled) best = p;
  }
  return { puzzle: best.puzzle, solution: best.solution };
}

/** Candidate mask for an empty cell given the current grid. */
export function candidates(g: number[], i: number): number {
  let used = 0;
  const r = rowOf(i), c = colOf(i);
  for (let k = 0; k < 9; k++) {
    used |= 1 << g[r * 9 + k];
    used |= 1 << g[k * 9 + c];
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) used |= 1 << g[(br + dr) * 9 + bc + dc];
  return ~used & ALL;
}

export { popcount };
