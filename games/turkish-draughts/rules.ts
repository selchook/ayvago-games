// Turkish draughts (Dama) on 8x8. Square i = r * 8 + c, row 0 at the top.
// Pieces: 1 white man, 2 white dama (king), -1 black man, -2 black dama, 0 empty.
// White starts on rows 5-6 and moves up (towards row 0); black starts on rows 1-2 and moves down.
// Men step one square forward or sideways; damas slide any distance orthogonally. Captures jump
// orthogonally (men: forward or sideways over an adjacent piece; damas: at range, landing on any
// empty square beyond). Capturing is compulsory and the sequence that takes the most pieces must
// be played. Each jumped piece leaves the board as soon as it is taken (its square can be crossed
// later in the same sequence), and a dama may not turn back 180° between two captures.
export const W = 1, BL = -1;
export interface Move { from: number; path: number[]; caps: number[] }

const ORTHO: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function initial(): Int8Array<ArrayBuffer> {
  const b = new Int8Array(64);
  for (let c = 0; c < 8; c++) { b[8 + c] = -1; b[16 + c] = -1; b[40 + c] = 1; b[48 + c] = 1; }
  return b;
}

const sideOf = (p: number): number => (p > 0 ? W : p < 0 ? BL : 0);
const isKing = (p: number): boolean => p === 2 || p === -2;

function manDirs(side: number): Array<[number, number]> {
  return [[side === W ? -1 : 1, 0], [0, -1], [0, 1]];
}

function captures(b: Int8Array, from: number, side: number): Move[] {
  const piece = b[from];
  const king = isKing(piece);
  const out: Move[] = [];
  const caps: number[] = [];
  const path: number[] = [];
  b[from] = 0;   // the moving piece has left its square
  // last: index into ORTHO of the previous jump (a dama may not reverse 180° between captures)
  const dfs = (pos: number, last: number) => {
    const r = Math.floor(pos / 8), c = pos % 8;
    let found = false;
    const dirs = king ? ORTHO : manDirs(side);
    for (let k = 0; k < dirs.length; k++) {
      const [dr, dc] = dirs[k];
      if (king && last >= 0 && dr === -ORTHO[last][0] && dc === -ORTHO[last][1]) continue;
      let rr: number, cc: number;
      if (king) {
        rr = r + dr; cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === 0) { rr += dr; cc += dc; }
      } else { rr = r + dr; cc = c + dc; }
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const v = rr * 8 + cc;
      const victim = b[v];
      if (sideOf(victim) !== -side) continue;
      let lr = rr + dr, lc = cc + dc;
      // the jumped piece leaves the board at once: its square is open for the rest of the sequence
      b[v] = 0;
      while (lr >= 0 && lr < 8 && lc >= 0 && lc < 8 && b[lr * 8 + lc] === 0) {
        const land = lr * 8 + lc;
        found = true;
        caps.push(v); path.push(land);
        dfs(land, king ? k : -1);
        caps.pop(); path.pop();
        if (!king) break;          // a man lands right behind the piece it takes
        lr += dr; lc += dc;
      }
      b[v] = victim;
    }
    if (!found && caps.length) out.push({ from, path: path.slice(), caps: caps.slice() });
  };
  dfs(from, -1);
  b[from] = piece;
  return out;
}

/** Every legal move for side (captures compulsory, the longest capture only). */
export function legalMoves(b: Int8Array, side: number): Move[] {
  let caps: Move[] = [];
  for (let i = 0; i < 64; i++) if (sideOf(b[i]) === side) caps.push(...captures(b, i, side));
  if (caps.length) {
    const most = Math.max(...caps.map((m) => m.caps.length));
    caps = caps.filter((m) => m.caps.length === most);
    return caps;
  }
  const out: Move[] = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (sideOf(p) !== side) continue;
    const r = Math.floor(i / 8), c = i % 8;
    for (const [dr, dc] of isKing(p) ? ORTHO : manDirs(side)) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === 0) {
        out.push({ from: i, path: [rr * 8 + cc], caps: [] });
        if (!isKing(p)) break;
        rr += dr; cc += dc;
      }
    }
  }
  return out;
}

/** Applies a move in place; returns true when a man was promoted. */
export function apply(b: Int8Array, m: Move): boolean {
  const p = b[m.from];
  const to = m.path[m.path.length - 1];
  b[m.from] = 0;
  for (const x of m.caps) b[x] = 0;
  const row = Math.floor(to / 8);
  const promote = (p === 1 && row === 0) || (p === -1 && row === 7);
  b[to] = promote ? p * 2 : p;
  return promote;
}

export function count(b: Int8Array, side: number): { men: number; kings: number } {
  let men = 0, kings = 0;
  for (let i = 0; i < 64; i++) if (sideOf(b[i]) === side) { if (isKing(b[i])) kings++; else men++; }
  return { men, kings };
}

export const sameMove = (a: Move, f: number, path: number[]): boolean =>
  a.from === f && a.path.length === path.length && a.path.every((x, k) => x === path[k]);

// ------------------------------------------------------------------ AI

function evaluate(b: Int8Array, side: number): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const r = Math.floor(i / 8), c = i % 8;
    let v: number;
    if (isKing(p)) v = 330;
    else {
      const adv = p > 0 ? 6 - r : r - 1;     // rows advanced from the start
      v = 100 + adv * 7 + (adv >= 4 ? 12 : 0) + (c >= 2 && c <= 5 ? 3 : 0);
    }
    s += p > 0 ? v : -v;
  }
  return side === W ? s : -s;
}

interface Search { nodes: number; deadline: number; stop: boolean }

function negamax(b: Int8Array, side: number, depth: number, alpha: number, beta: number, s: Search, ext: number): number {
  if ((++s.nodes & 1023) === 0 && performance.now() > s.deadline) s.stop = true;
  if (s.stop) return 0;
  const moves = legalMoves(b, side);
  if (!moves.length) return -100000 - depth;   // no move: lost (prefer quicker wins)
  const forced = moves[0].caps.length > 0;
  if (depth <= 0 && (!forced || ext <= 0)) return evaluate(b, side);
  const d = depth <= 0 ? 0 : depth - 1;
  const e = depth <= 0 ? ext - 1 : ext;
  let best = -Infinity;
  for (const m of moves) {
    const saved = Int8Array.from(b);
    apply(b, m);
    const v = -negamax(b, -side, d, -beta, -alpha, s, e);
    b.set(saved);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** [search depth, chance of a random move] per rival level. */
export const LEVELS: Array<[number, number]> = [[1, 0.45], [2, 0.2], [3, 0.08], [4, 0], [5, 0], [6, 0]];

export function choose(board: Int8Array, side: number, level: number): Move | null {
  const moves = legalMoves(board, side);
  if (!moves.length) return null;
  const [depth, rnd] = LEVELS[Math.min(level, LEVELS.length - 1)];
  if (moves.length === 1) return moves[0];
  if (Math.random() < rnd) return moves[Math.floor(Math.random() * moves.length)];
  const b = Int8Array.from(board);
  const s: Search = { nodes: 0, deadline: performance.now() + 800, stop: false };
  for (let i = moves.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [moves[i], moves[j]] = [moves[j], moves[i]]; }
  let bestMoves: Move[] = [moves[0]];
  // iterative deepening: keep the last fully searched depth
  for (let d = 1; d <= depth; d++) {
    let bestV = -Infinity, cur: Move[] = [];
    for (const m of moves) {
      const saved = Int8Array.from(b);
      apply(b, m);
      const v = -negamax(b, -side, d - 1, -Infinity, -(bestV - 1), s, 4);
      b.set(saved);
      if (s.stop) break;
      if (v > bestV + 0.5) { bestV = v; cur = [m]; } else if (Math.abs(v - bestV) <= 0.5) cur.push(m);
    }
    if (s.stop) break;
    if (cur.length) bestMoves = cur;
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
