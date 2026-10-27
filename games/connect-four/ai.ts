// Connect Four AI: negamax + alpha-beta with iterative deepening and a hard time budget.
export const COLS = 7;
export const ROWS = 6;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WIN = 1_000_000;

/** All 69 four-in-a-row windows as [col,row] index lists (index = c*ROWS + r, r = 0 bottom). */
export const WINDOWS: number[][] = (() => {
  const w: number[][] = [];
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) for (const [dc, dr] of dirs) {
    const ec = c + dc * 3, er = r + dr * 3;
    if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
    w.push([0, 1, 2, 3].map((k) => (c + dc * k) * ROWS + (r + dr * k)));
  }
  return w;
})();

/** Returns the winning 4 indices that include `idx`, or null. */
export function winLine(cells: ArrayLike<number>, idx: number): number[] | null {
  const p = cells[idx];
  if (!p) return null;
  for (const w of WINDOWS) {
    if (!w.includes(idx)) continue;
    if (cells[w[0]] === p && cells[w[1]] === p && cells[w[2]] === p && cells[w[3]] === p) return w;
  }
  return null;
}

class Abort extends Error {}

export class Brain {
  private cells = new Int8Array(COLS * ROWS);
  private h = new Int8Array(COLS);
  private moves = 0;
  private nodes = 0;
  private deadline = 0;

  constructor(cells: ArrayLike<number>) {
    for (let i = 0; i < cells.length; i++) {
      this.cells[i] = cells[i];
      if (cells[i]) { this.h[Math.floor(i / ROWS)]++; this.moves++; }
    }
  }

  private wins(col: number): boolean {
    return !!winLine(this.cells, col * ROWS + this.h[col] - 1);
  }

  private evaluate(p: number): number {
    const o = 3 - p, c = this.cells;
    let s = 0;
    for (const w of WINDOWS) {
      let a = 0, b = 0;
      for (const i of w) { if (c[i] === p) a++; else if (c[i] === o) b++; }
      if (b === 0) s += a === 3 ? 6 : a === 2 ? 2 : 0;
      else if (a === 0) s -= b === 3 ? 7 : b === 2 ? 2 : 0;
    }
    for (let r = 0; r < ROWS; r++) {
      const v = c[3 * ROWS + r];
      if (v === p) s += 3; else if (v === o) s -= 3;
    }
    return s;
  }

  private negamax(depth: number, alpha: number, beta: number, p: number): number {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) throw new Abort();
    if (this.moves >= COLS * ROWS) return 0;
    if (depth === 0) return this.evaluate(p);
    let best = -Infinity;
    for (const col of ORDER) {
      if (this.h[col] >= ROWS) continue;
      this.play(col, p);
      const sc = this.wins(col) ? WIN + depth : -this.negamax(depth - 1, -beta, -alpha, 3 - p);
      this.undo(col);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  private play(col: number, p: number): void {
    this.cells[col * ROWS + this.h[col]] = p;
    this.h[col]++; this.moves++;
  }

  private undo(col: number): void {
    this.h[col]--; this.moves--;
    this.cells[col * ROWS + this.h[col]] = 0;
  }

  legal(): number[] {
    return ORDER.filter((c) => this.h[c] < ROWS);
  }

  /** Best column for player p. `randomness` = chance of a random legal move (weak levels). */
  choose(p: number, maxDepth: number, randomness: number, budgetMs = 90): number {
    const legal = this.legal();
    if (legal.length === 0) return -1;
    if (Math.random() < randomness) return legal[Math.floor(Math.random() * legal.length)];
    // instant win / instant block
    for (const q of [p, 3 - p]) for (const col of legal) {
      this.play(col, q);
      const w = this.wins(col);
      this.undo(col);
      if (w) return col;
    }
    this.deadline = performance.now() + budgetMs;
    let best = legal[0];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        let alpha = -Infinity, bestHere = legal[0];
        const order = [best, ...legal.filter((c) => c !== best)];
        for (const col of order) {
          this.play(col, p);
          const sc = this.wins(col) ? WIN + d : -this.negamax(d - 1, -Infinity, -alpha, 3 - p);
          this.undo(col);
          if (sc > alpha) { alpha = sc; bestHere = col; }
        }
        best = bestHere;
        if (alpha >= WIN) break;
      } catch (e) {
        if (e instanceof Abort) break;
        throw e;
      }
    }
    return best;
  }
}
