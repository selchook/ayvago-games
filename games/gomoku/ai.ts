// Gomoku rules + threat-based AI. Board: N*N numbers, 0 empty, 1 black, 2 white.
export const N = 15;
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

// Line shapes through one cell, strongest first.
const FIVE = 7, OPEN4 = 6, FOUR = 5, OPEN3 = 4, THREE = 3, OPEN2 = 2, TWO = 1, ONE = 0, DEAD = -1;

/** The winning line through cell i (5+ stones), or null. */
export function winLine(b: number[], i: number): number[] | null {
  const p = b[i];
  if (!p) return null;
  const x = i % N, y = Math.floor(i / N);
  for (const [dx, dy] of DIRS) {
    const line = [i];
    for (const s of [1, -1]) {
      let xx = x + dx * s, yy = y + dy * s;
      while (xx >= 0 && yy >= 0 && xx < N && yy < N && b[yy * N + xx] === p) {
        line.push(yy * N + xx);
        xx += dx * s; yy += dy * s;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

/** Shape p would make through (x, y) in one direction if it played there. */
function shape(b: number[], x: number, y: number, dx: number, dy: number, p: number): number {
  // cells -5..+5 around the move: 1 own, 0 empty, -1 blocked (opponent or edge); centre = own
  const c: number[] = [];
  for (let k = -5; k <= 5; k++) {
    if (k === 0) { c.push(1); continue; }
    const xx = x + dx * k, yy = y + dy * k;
    if (xx < 0 || yy < 0 || xx >= N || yy >= N) c.push(-1);
    else { const v = b[yy * N + xx]; c.push(v === 0 ? 0 : v === p ? 1 : -1); }
  }
  let best = DEAD;
  // 5-windows containing the centre (index 5)
  for (let s = 1; s <= 5; s++) {
    let own = 0, blocked = false;
    for (let k = s; k < s + 5; k++) { if (c[k] < 0) { blocked = true; break; } own += c[k]; }
    if (blocked) continue;
    const sh = own === 5 ? FIVE : own === 4 ? FOUR : own === 3 ? THREE : own === 2 ? TWO : ONE;
    if (sh > best) best = sh;
  }
  if (best === FIVE) return FIVE;
  // 6-windows with both ends empty: open shapes
  for (let s = 0; s <= 5; s++) {
    if (s + 5 > 10 || c[s] !== 0 || c[s + 5] !== 0) continue;
    let own = 0, blocked = false;
    for (let k = s + 1; k < s + 5; k++) { if (c[k] < 0) { blocked = true; break; } own += c[k]; }
    if (blocked) continue;
    if (own === 4 && best < OPEN4) best = OPEN4;
    else if (own === 3 && best < OPEN3) best = OPEN3;
    else if (own === 2 && best < OPEN2) best = OPEN2;
  }
  return best;
}

/** How strong a move at i is for p (patterns it creates). */
export function cellScore(b: number[], i: number, p: number): number {
  const x = i % N, y = Math.floor(i / N);
  const n = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const [dx, dy] of DIRS) { const s = shape(b, x, y, dx, dy, p); if (s >= 0) n[s]++; }
  if (n[FIVE]) return 1e8;
  if (n[OPEN4] || n[FOUR] >= 2 || (n[FOUR] && n[OPEN3])) return 1e6;
  if (n[OPEN3] >= 2) return 1e5;
  return n[FOUR] * 5000 + n[OPEN3] * 4000 + n[THREE] * 300 + n[OPEN2] * 250 + n[TWO] * 50 + n[ONE] * 5;
}

function makesFour(b: number[], i: number, p: number): boolean {
  const x = i % N, y = Math.floor(i / N);
  for (const [dx, dy] of DIRS) { const s = shape(b, x, y, dx, dy, p); if (s === FOUR || s === OPEN4 || s === FIVE) return true; }
  return false;
}

/** Empty cells within distance 2 of any stone (the centre on an empty board). */
export function candidates(b: number[]): number[] {
  const out: number[] = [];
  const near = new Uint8Array(N * N);
  let any = false;
  for (let i = 0; i < N * N; i++) {
    if (!b[i]) continue;
    any = true;
    const x = i % N, y = Math.floor(i / N);
    for (let yy = Math.max(0, y - 2); yy <= Math.min(N - 1, y + 2); yy++)
      for (let xx = Math.max(0, x - 2); xx <= Math.min(N - 1, x + 2); xx++) near[yy * N + xx] = 1;
  }
  if (!any) return [Math.floor(N / 2) * N + Math.floor(N / 2)];
  for (let i = 0; i < N * N; i++) if (near[i] && !b[i]) out.push(i);
  return out;
}

function fivePoints(b: number[], p: number, cand: number[]): number[] {
  const out: number[] = [];
  for (const i of cand) {
    if (b[i]) continue;
    b[i] = p;
    if (winLine(b, i)) out.push(i);
    b[i] = 0;
  }
  return out;
}

/** Victory by continuous fours: a first move that wins by forcing fours, or -1. */
function vcf(b: number[], p: number, depth: number, budget: { n: number }): number {
  if (depth <= 0 || budget.n <= 0) return -1;
  const opp = 3 - p;
  const cand = candidates(b);
  for (const i of cand) {
    if (budget.n-- <= 0) return -1;
    if (!makesFour(b, i, p)) continue;
    b[i] = p;
    if (winLine(b, i)) { b[i] = 0; return i; }
    const c2 = candidates(b);
    const wins = fivePoints(b, p, c2);
    let ok = false;
    if (fivePoints(b, opp, c2).length === 0) {
      if (wins.length >= 2) ok = true;
      else if (wins.length === 1) {
        const w = wins[0];
        b[w] = opp;
        // the forced block must not give the defender a four of their own
        if (fivePoints(b, opp, candidates(b)).length === 0 && vcf(b, p, depth - 1, budget) >= 0) ok = true;
        b[w] = 0;
      }
    }
    b[i] = 0;
    if (ok) return i;
  }
  return -1;
}

export interface Level { noise: number; defW: number; blunder: number; look: boolean; vcf: number }
export const LEVELS: Level[] = [
  { noise: 1.4, defW: 0.35, blunder: 0.3, look: false, vcf: 0 },
  { noise: 0.7, defW: 0.65, blunder: 0.15, look: false, vcf: 0 },
  { noise: 0.3, defW: 0.9, blunder: 0.05, look: false, vcf: 0 },
  { noise: 0.1, defW: 1, blunder: 0, look: false, vcf: 5 },
  { noise: 0.04, defW: 1, blunder: 0, look: true, vcf: 8 },
  { noise: 0, defW: 1, blunder: 0, look: true, vcf: 12 },
];

/** Picks a move for p. */
export function choose(board: number[], p: number, lv: Level): number {
  const b = board.slice();
  const opp = 3 - p;
  const cand = candidates(b);
  const scored = cand.map((i) => {
    const att = cellScore(b, i, p), def = cellScore(b, i, opp);
    return { i, att, def, s: att * 1.1 + def * lv.defW };
  });
  // forced: win now, block five, make an unstoppable shape, block one
  const win = scored.find((o) => o.att >= 1e8);
  if (win) return win.i;
  const block = scored.find((o) => o.def >= 1e8);
  if (block && Math.random() >= lv.blunder * 0.5) return block.i;
  if (lv.vcf) {
    const v = vcf(b, p, lv.vcf, { n: 6000 });
    if (v >= 0) return v;
  }
  for (const o of scored) o.s *= 1 + lv.noise * Math.random();
  scored.sort((a, c) => c.s - a.s);
  if (lv.blunder && Math.random() < lv.blunder) return scored[Math.min(scored.length - 1, Math.floor(Math.random() * 5))].i;
  if (lv.look && scored[0].att < 1e6 && scored[0].def < 1e6) {
    // one reply deep: avoid moves that hand the opponent a double threat
    let best = scored[0], bestV = -Infinity;
    for (const o of scored.slice(0, 8)) {
      b[o.i] = p;
      let threat = 0;
      for (const j of candidates(b)) threat = Math.max(threat, cellScore(b, j, opp));
      b[o.i] = 0;
      const v = o.s - threat * 0.7;
      if (v > bestV) { bestV = v; best = o; }
    }
    return best.i;
  }
  return scored[0].i;
}
