/**
 * Paint Roll levels.
 *
 * A level is built backwards from a solution: the ball starts in a solid block, takes a random
 * walk of slides and carves every cell it crosses. A slide may only stop where the next cell is
 * a wall that stays a wall for good ("locked"), and it may never carve a locked cell. Carving
 * later never changes an earlier slide, so replaying the walk on the finished maze paints every
 * floor cell: each level is solvable by construction. A bounded search then looks for a shorter
 * solution to set the par.
 */

export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface Level {
  w: number;                // grid width including the border wall
  h: number;
  floor: boolean[];         // index = y * w + x
  start: number;
  par: number;
  walk: number[];           // the generator's solution (directions)
  floorCount: number;
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interior size for a level number (1-based); the mazes grow with the level. */
export function sizeFor(level: number): { iw: number; ih: number } {
  return { iw: Math.min(9, 4 + Math.ceil(level / 3)), ih: Math.min(12, 5 + Math.floor(level / 2)) };
}

/** Where a slide from `pos` in direction `d` stops, and the cells it crosses. */
export function slide(lv: { w: number; floor: boolean[] }, pos: number, d: number): { end: number; path: number[] } {
  const [dx, dy] = DIRS[d];
  const step = dy * lv.w + dx;
  const path: number[] = [];
  let p = pos;
  while (lv.floor[p + step]) {
    p += step;
    path.push(p);
  }
  return { end: p, path };
}

export function generate(level: number): Level {
  const { iw, ih } = sizeFor(level);
  const w = iw + 2, h = ih + 2;
  for (let attempt = 0; attempt < 60; attempt++) {
    const lv = tryGenerate(level, w, h, prng(level * 9973 + 17 + attempt * 7919));
    if (lv) return lv;
  }
  // practically unreachable; a plain open room is always solvable
  const floor = new Array(w * h).fill(false);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) floor[y * w + x] = true;
  return { w, h, floor, start: w + 1, par: ih * 2, walk: [], floorCount: iw * ih };
}

function tryGenerate(level: number, w: number, h: number, rand: () => number): Level | null {
  const n = w * h;
  const floor = new Array<boolean>(n).fill(false);
  const locked = new Array<boolean>(n).fill(false);
  const border = (i: number) => {
    const x = i % w, y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1;
  };
  const interior = (w - 2) * (h - 2);
  const target = Math.round(interior * (0.5 + rand() * 0.14));
  const sx = 1 + Math.floor(rand() * (w - 2)), sy = 1 + Math.floor(rand() * (h - 2));
  let pos = sy * w + sx;
  const start = pos;
  floor[pos] = true;
  let count = 1;
  const walk: number[] = [];
  let last = -1, idle = 0;
  const maxMoves = 14 + level * 2;

  while (count < target && walk.length < maxMoves && idle < 6) {
    const cands: { d: number; len: number; gain: number; stop: number }[] = [];
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      const step = dy * w + dx;
      let gain = 0;
      for (let len = 1; ; len++) {
        const c = pos + step * len;
        if (border(c) || locked[c]) break;
        if (!floor[c]) gain++;
        const s = c + step;
        // the slide may stop at c only if s is (and stays) a wall
        if (border(s) || !floor[s]) cands.push({ d, len, gain, stop: s });
      }
    }
    if (!cands.length) return null;
    const weight = (c: { d: number; len: number; gain: number }) =>
      (c.gain > 0 ? 1 + Math.min(c.gain, 4) * 1.5 : 0.12) * (c.len >= 2 ? 1.4 : 1) * ((c.d ^ 1) === last ? 0.5 : 1);
    let total = 0;
    for (const c of cands) total += weight(c);
    let r = rand() * total;
    let pick = cands[0];
    for (const c of cands) {
      r -= weight(c);
      if (r <= 0) { pick = c; break; }
    }
    const step = DIRS[pick.d][1] * w + DIRS[pick.d][0];
    for (let k = 1; k <= pick.len; k++) {
      const c = pos + step * k;
      if (!floor[c]) { floor[c] = true; count++; }
    }
    if (!border(pick.stop)) locked[pick.stop] = true;
    pos += step * pick.len;
    walk.push(pick.d);
    last = pick.d;
    idle = pick.gain > 0 ? 0 : idle + 1;
  }
  if (walk.length < 3 || count < Math.min(8, interior * 0.4)) return null;

  const lv: Level = { w, h, floor, start, par: walk.length, walk, floorCount: count };
  // verify by replay (and trim the walk to the move that completes the paint)
  const painted = new Set<number>([start]);
  let p = start, used = 0;
  for (const d of walk) {
    const s = slide(lv, p, d);
    s.path.forEach((c) => painted.add(c));
    p = s.end;
    used++;
    if (painted.size === count) break;
  }
  if (painted.size !== count) return null;
  lv.walk = walk.slice(0, used);
  lv.par = Math.min(used, solve(lv) ?? used);
  if (lv.par < 2) return null;
  return crop(lv);
}

/** Trim unused wall rows and columns, keeping a one-cell wall border. */
function crop(lv: Level): Level {
  let x0 = lv.w, y0 = lv.h, x1 = 0, y1 = 0;
  lv.floor.forEach((f, i) => {
    if (!f) return;
    const x = i % lv.w, y = Math.floor(i / lv.w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  const floor = new Array<boolean>(w * h).fill(false);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) floor[(y - y0 + 1) * w + (x - x0 + 1)] = lv.floor[y * lv.w + x];
  const sx = lv.start % lv.w, sy = Math.floor(lv.start / lv.w);
  return { ...lv, w, h, floor, start: (sy - y0 + 1) * w + (sx - x0 + 1) };
}

/** Breadth-first search for the fewest slides; null when the search grows too large. */
export function solve(lv: Level, cap = 40000): number | null {
  const ids = new Map<number, number>();
  lv.floor.forEach((f, i) => { if (f) ids.set(i, ids.size); });
  const full = (1n << BigInt(ids.size)) - 1n;
  const bit = (i: number) => 1n << BigInt(ids.get(i)!);
  const moves = new Map<number, { end: number; mask: bigint }[]>();
  const movesFrom = (p: number) => {
    let m = moves.get(p);
    if (!m) {
      m = [];
      for (let d = 0; d < 4; d++) {
        const s = slide(lv, p, d);
        if (!s.path.length) continue;
        let mask = 0n;
        for (const c of s.path) mask |= bit(c);
        m.push({ end: s.end, mask });
      }
      moves.set(p, m);
    }
    return m;
  };
  let frontier: { p: number; mask: bigint }[] = [{ p: lv.start, mask: bit(lv.start) }];
  const seen = new Set<string>([`${lv.start}|${bit(lv.start)}`]);
  for (let depth = 0; frontier.length; depth++) {
    const next: { p: number; mask: bigint }[] = [];
    for (const st of frontier) {
      if (st.mask === full) return depth;
      for (const mv of movesFrom(st.p)) {
        const mask = st.mask | mv.mask;
        const key = `${mv.end}|${mask}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > cap) return null;
        next.push({ p: mv.end, mask });
      }
    }
    frontier = next;
  }
  return null;
}
