// Ultimate tic-tac-toe rules and a time-sliced Monte Carlo tree search.
// Cells are numbered b * 9 + c: b is the small board (0..8, row-major), c the cell inside it.

export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
/** Lines through each cell of a 3x3 grid. */
const LINES_AT: number[][][] = Array.from({ length: 9 }, (_, c) => LINES.filter((l) => l.includes(c)));

export interface State {
  cells: Int8Array;   // 81: 0 empty, 1 X, 2 O
  macro: Int8Array;   // 9: 0 open, 1 X won, 2 O won, 3 full without a winner
  next: number;       // small board the mover must play in, -1 = anywhere
  turn: 1 | 2;
  winner: number;     // 0 running, 1 / 2 winner, 3 draw
}

export function newState(): State {
  return { cells: new Int8Array(81), macro: new Int8Array(9), next: -1, turn: 1, winner: 0 };
}

export function clone(s: State): State {
  return { cells: s.cells.slice(), macro: s.macro.slice(), next: s.next, turn: s.turn, winner: s.winner };
}

export function legal(s: State, out: number[] = []): number[] {
  out.length = 0;
  if (s.winner) return out;
  if (s.next >= 0) {
    const base = s.next * 9;
    for (let c = 0; c < 9; c++) if (!s.cells[base + c]) out.push(base + c);
    return out;
  }
  for (let b = 0; b < 9; b++) {
    if (s.macro[b]) continue;
    const base = b * 9;
    for (let c = 0; c < 9; c++) if (!s.cells[base + c]) out.push(base + c);
  }
  return out;
}

export function isLegal(s: State, m: number): boolean {
  if (s.winner || m < 0 || m >= 81 || s.cells[m]) return false;
  const b = (m / 9) | 0;
  if (s.macro[b]) return false;
  return s.next < 0 || s.next === b;
}

/** Plays move m for s.turn. Returns what happened to its small board: 0 nothing, 1/2 won, 3 filled. */
export function play(s: State, m: number): number {
  const p = s.turn;
  const b = (m / 9) | 0, c = m % 9, base = b * 9;
  s.cells[m] = p;
  let closed = 0;
  for (const l of LINES_AT[c]) {
    if (s.cells[base + l[0]] === p && s.cells[base + l[1]] === p && s.cells[base + l[2]] === p) { closed = p; break; }
  }
  if (!closed) {
    let full = true;
    for (let k = 0; k < 9; k++) if (!s.cells[base + k]) { full = false; break; }
    if (full) closed = 3;
  }
  if (closed) {
    s.macro[b] = closed;
    if (closed === p) {
      for (const l of LINES_AT[b]) {
        if (s.macro[l[0]] === p && s.macro[l[1]] === p && s.macro[l[2]] === p) { s.winner = p; break; }
      }
    }
    if (!s.winner) {
      let open = false;
      for (let k = 0; k < 9; k++) if (!s.macro[k]) { open = true; break; }
      if (!open) s.winner = 3;
    }
  }
  s.next = s.macro[c] ? -1 : c;
  s.turn = p === 1 ? 2 : 1;
  return closed;
}

/** The winning line of small boards, if any. */
export function winLine(s: State): number[] | null {
  if (s.winner !== 1 && s.winner !== 2) return null;
  for (const l of LINES) if (l.every((k) => s.macro[k] === s.winner)) return l;
  return null;
}

// ---------------------------------------------------------------- MCTS

interface Node {
  move: number;
  parent: Node | null;
  children: Node[];
  untried: number[];
  wins: number;      // from the point of view of the player who made `move`
  visits: number;
  mover: number;
}

/** Search budget per level (ms) and the chance of a careless random move. */
export interface AiLevel { ms: number; slip: number }
export const LEVELS: AiLevel[] = [
  { ms: 60, slip: 0.3 },
  { ms: 160, slip: 0.12 },
  { ms: 350, slip: 0.04 },
  { ms: 650, slip: 0 },
  { ms: 1000, slip: 0 },
  { ms: 1500, slip: 0 },
];
/** Easy (practice): a short ladder with a tiny search budget and many careless moves. */
export const EASY_LEVELS: AiLevel[] = [
  { ms: 25, slip: 0.5 },
  { ms: 40, slip: 0.4 },
  { ms: 80, slip: 0.3 },
];

export class Mcts {
  private root: Node;
  private scratch: number[] = [];
  spent = 0;

  constructor(private state: State) {
    this.root = { move: -1, parent: null, children: [], untried: legal(state).slice(), wins: 0, visits: 0, mover: state.turn === 1 ? 2 : 1 };
  }

  /** Runs iterations for about `ms` milliseconds. */
  run(ms: number): void {
    const t0 = performance.now();
    while (true) {
      for (let k = 0; k < 40; k++) this.iterate();
      const dt = performance.now() - t0;
      if (dt >= ms) { this.spent += dt; return; }
    }
  }

  private iterate(): void {
    const s = clone(this.state);
    let node = this.root;
    // selection
    while (node.untried.length === 0 && node.children.length) {
      const lnN = Math.log(node.visits);
      let best = node.children[0], bestV = -1;
      for (const ch of node.children) {
        const v = ch.wins / ch.visits + 1.25 * Math.sqrt(lnN / ch.visits);
        if (v > bestV) { bestV = v; best = ch; }
      }
      node = best;
      play(s, node.move);
    }
    // expansion
    if (node.untried.length && !s.winner) {
      const i = (Math.random() * node.untried.length) | 0;
      const m = node.untried[i];
      node.untried[i] = node.untried[node.untried.length - 1];
      node.untried.pop();
      const mover = s.turn;
      play(s, m);
      const child: Node = { move: m, parent: node, children: [], untried: s.winner ? [] : legal(s).slice(), wins: 0, visits: 0, mover };
      node.children.push(child);
      node = child;
    }
    // rollout: random play to the end
    const moves = this.scratch;
    while (!s.winner) {
      legal(s, moves);
      play(s, moves[(Math.random() * moves.length) | 0]);
    }
    // backpropagation
    for (let n: Node | null = node; n; n = n.parent) {
      n.visits++;
      if (s.winner === 3) n.wins += 0.5;
      else if (s.winner === n.mover) n.wins += 1;
    }
  }

  best(): number {
    let best = -1, bv = -1;
    for (const ch of this.root.children) if (ch.visits > bv) { bv = ch.visits; best = ch.move; }
    if (best < 0) {
      const l = legal(this.state);
      best = l[(Math.random() * l.length) | 0] ?? -1;
    }
    return best;
  }
}

/** A move that wins the whole game at once, if there is one. */
export function tactical(s: State): number {
  const moves = legal(s);
  for (const m of moves) {
    const c = clone(s);
    play(c, m);
    if (c.winner === s.turn) return m;
  }
  return -1;
}
