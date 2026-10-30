// Water Sort rules, level generator and solver. No Phaser here, so it can be tested in node.
// A tube is an array of colour ids, bottom first. Every colour has exactly CAP layers.

export const CAP = 4;
export type Tubes = number[][];

export interface Move { from: number; to: number; n: number }

export function top(t: number[]): number {
  return t.length ? t[t.length - 1] : -1;
}

/** Length of the single-colour run at the top of a tube. */
export function topRun(t: number[]): number {
  if (!t.length) return 0;
  const c = top(t);
  let n = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === c; i--) n++;
  return n;
}

/** How many layers a pour from `a` to `b` moves (0 = illegal). */
export function pourCount(tubes: Tubes, a: number, b: number): number {
  if (a === b) return 0;
  const A = tubes[a], B = tubes[b];
  if (!A.length || B.length >= CAP) return 0;
  if (B.length && top(B) !== top(A)) return 0;
  return Math.min(topRun(A), CAP - B.length);
}

export function pour(tubes: Tubes, a: number, b: number): Move | null {
  const n = pourCount(tubes, a, b);
  if (!n) return null;
  for (let i = 0; i < n; i++) tubes[b].push(tubes[a].pop()!);
  return { from: a, to: b, n };
}

export function unpour(tubes: Tubes, m: Move): void {
  for (let i = 0; i < m.n; i++) tubes[m.from].push(tubes[m.to].pop()!);
}

export function isDone(t: number[]): boolean {
  return t.length === CAP && topRun(t) === CAP;
}

export function solved(tubes: Tubes): boolean {
  return tubes.every((t) => t.length === 0 || isDone(t));
}

/** Moves that change something: not pouring a whole one-colour tube into an empty one. */
export function usefulMoves(tubes: Tubes): Move[] {
  const out: Move[] = [];
  for (let a = 0; a < tubes.length; a++) {
    const A = tubes[a];
    if (!A.length || isDone(A)) continue;
    const whole = topRun(A) === A.length;
    for (let b = 0; b < tubes.length; b++) {
      const n = pourCount(tubes, a, b);
      if (!n) continue;
      if (whole && tubes[b].length === 0) continue;
      out.push({ from: a, to: b, n });
    }
  }
  return out;
}

/** Lower bound on the number of pours left: every run beyond one per colour needs a pour. */
export function lowerBound(tubes: Tubes): number {
  let runs = 0;
  const colours = new Set<number>();
  for (const t of tubes) {
    for (let i = 0; i < t.length; i++) {
      colours.add(t[i]);
      if (i === 0 || t[i] !== t[i - 1]) runs++;
    }
  }
  return runs - colours.size;
}

function key(tubes: Tubes): string {
  return tubes.map((t) => t.join(',')).sort().join('|');
}

/** Depth-first search with a visited set. Returns a solution, or null if none within the budget. */
export function solve(start: Tubes, budget = 60000): Move[] | null {
  const tubes = start.map((t) => t.slice());
  const seen = new Set<string>();
  const path: Move[] = [];
  let nodes = 0;
  const dfs = (): boolean => {
    if (solved(tubes)) return true;
    if (++nodes > budget) return false;
    const k = key(tubes);
    if (seen.has(k)) return false;
    seen.add(k);
    const moves = usefulMoves(tubes);
    // pours onto a matching colour first, pours into an empty tube last
    moves.sort((m1, m2) => score(m2) - score(m1));
    for (const m of moves) {
      pour(tubes, m.from, m.to);
      path.push(m);
      if (dfs()) return true;
      path.pop();
      unpour(tubes, m);
      if (nodes > budget) return false;
    }
    return false;
  };
  const score = (m: Move): number => {
    const B = tubes[m.to];
    let s = B.length ? 10 : 0;
    if (m.n === topRun(tubes[m.from])) s += 5;          // empties the run completely
    if (m.n === tubes[m.from].length) s += 2;
    return s;
  };
  return dfs() ? path.slice() : null;
}

export interface LevelSpec { colours: number; empty: number }

export function levelSpec(level: number): LevelSpec {
  return { colours: Math.min(10, 3 + Math.floor(level / 2)), empty: 2 };
}

/**
 * A random solvable level: the layers are shuffled into the tubes and the solver checks the
 * result. Shuffles that start nearly solved are thrown away. Falls back to scrambling the solved
 * state with reverse pours, which is always solvable.
 */
export function generate(spec: LevelSpec, rand: () => number = Math.random): Tubes {
  const { colours, empty } = spec;
  for (let attempt = 0; attempt < 40; attempt++) {
    const bag: number[] = [];
    for (let c = 0; c < colours; c++) for (let i = 0; i < CAP; i++) bag.push(c);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const tubes: Tubes = [];
    for (let c = 0; c < colours; c++) tubes.push(bag.slice(c * CAP, c * CAP + CAP));
    for (let e = 0; e < empty; e++) tubes.push([]);
    // no tube may start with three of a kind on top or already done
    if (tubes.some((t) => t.length && topRun(t) >= 3)) continue;
    if (lowerBound(tubes) < colours * 1.5) continue;
    if (solve(tubes)) return tubes;
  }
  return scramble(spec, rand);
}

/** Reverse pours from the solved state: each step lifts layers back where they could have come from. */
export function scramble(spec: LevelSpec, rand: () => number = Math.random): Tubes {
  const { colours, empty } = spec;
  const tubes: Tubes = [];
  for (let c = 0; c < colours; c++) tubes.push(Array(CAP).fill(c));
  for (let e = 0; e < empty; e++) tubes.push([]);
  for (let step = 0; step < colours * 30; step++) {
    // a forward pour a -> b of n layers is undone by moving n layers from b back to a; it was
    // legal if a's new top (after the move back) is not covered and b keeps a matching top
    const b = Math.floor(rand() * tubes.length), a = Math.floor(rand() * tubes.length);
    if (a === b || !tubes[b].length || tubes[a].length >= CAP) continue;
    const run = topRun(tubes[b]);
    const n = 1 + Math.floor(rand() * Math.min(run, CAP - tubes[a].length));
    const c = top(tubes[b]);
    const rest = tubes[b].length - n;
    // after the forward pour b's top was c: b had to be empty or topped with c before it
    if (rest > 0 && tubes[b][rest - 1] !== c && n < run) continue;
    // and the forward pour moved every matching layer that fit: a's top before must differ
    if (tubes[a].length && top(tubes[a]) === c) continue;
    for (let i = 0; i < n; i++) tubes[a].push(tubes[b].pop()!);
  }
  return tubes;
}
