// Dots and Boxes on a 5x5 box grid (6x6 dots). 60 lines:
//   horizontal h(r, c) = r * 5 + c        r 0..5, c 0..4
//   vertical   v(r, c) = 30 + r * 6 + c   r 0..4, c 0..5
// Box b = r * 5 + c has sides h(r,c), h(r+1,c), v(r,c), v(r,c+1).
export const B = 5;
export const LINES = 60;
export const BOXES = B * B;

export const hLine = (r: number, c: number): number => r * B + c;
export const vLine = (r: number, c: number): number => 30 + r * (B + 1) + c;
export const isH = (l: number): boolean => l < 30;

export const BOX_LINES: number[][] = [];
export const LINE_BOXES: number[][] = [];
for (let r = 0; r < B; r++) for (let c = 0; c < B; c++) BOX_LINES.push([hLine(r, c), hLine(r + 1, c), vLine(r, c), vLine(r, c + 1)]);
for (let l = 0; l < LINES; l++) LINE_BOXES.push([]);
BOX_LINES.forEach((ls, b) => ls.forEach((l) => LINE_BOXES[l].push(b)));

export function sides(lines: ArrayLike<number>, b: number): number {
  const s = BOX_LINES[b];
  return lines[s[0]] + lines[s[1]] + lines[s[2]] + lines[s[3]];
}

/** Boxes that drawing l would complete. */
export function completes(lines: ArrayLike<number>, l: number): number[] {
  return LINE_BOXES[l].filter((b) => sides(lines, b) === 3);
}

/** Drawing l completes nothing and gives no box its third side. */
function isSafe(lines: ArrayLike<number>, l: number): boolean {
  return LINE_BOXES[l].every((b) => sides(lines, b) < 2);
}

function free(lines: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let l = 0; l < LINES; l++) if (!lines[l]) out.push(l);
  return out;
}

/** Draws every capturing line in turn (mutates); returns the number of boxes taken. */
function greedyTake(lines: Uint8Array): number {
  let got = 0, again = true;
  while (again) {
    again = false;
    for (let l = 0; l < LINES; l++) {
      if (lines[l]) continue;
      const k = completes(lines, l).length;
      if (k) { lines[l] = 1; got += k; again = true; }
    }
  }
  return got;
}

/** Boxes the opponent can grab right after we draw l. */
function giveaway(lines: ArrayLike<number>, l: number): number {
  const s = Uint8Array.from(lines as ArrayLike<number>);
  s[l] = 1;
  return greedyTake(s);
}

/** Exact solve of the rest of the game: best (mine - theirs) for the player to move. */
function solve(lines: ArrayLike<number>): { line: number; value: number } {
  const rest = free(lines);
  const n = rest.length;
  const cnt = new Int8Array(BOXES);
  for (let b = 0; b < BOXES; b++) cnt[b] = sides(lines, b);
  const memo = new Map<number, number>();
  const f = (mask: number): number => {
    if (mask === 0) return 0;
    const m = memo.get(mask);
    if (m !== undefined) return m;
    let best = -999;
    for (let k = 0; k < n; k++) {
      if (!(mask & (1 << k))) continue;
      const l = rest[k];
      let got = 0;
      for (const b of LINE_BOXES[l]) if (++cnt[b] === 4) got++;
      const v = got ? got + f(mask & ~(1 << k)) : -f(mask & ~(1 << k));
      for (const b of LINE_BOXES[l]) cnt[b]--;
      if (v > best) best = v;
    }
    memo.set(mask, best);
    return best;
  };
  let line = rest[0], value = -999;
  const full = (1 << n) - 1;
  for (let k = 0; k < n; k++) {
    const l = rest[k];
    let got = 0;
    for (const b of LINE_BOXES[l]) if (++cnt[b] === 4) got++;
    const v = got ? got + f(full & ~(1 << k)) : -f(full & ~(1 << k));
    for (const b of LINE_BOXES[l]) cnt[b]--;
    if (v > value) { value = v; line = l; }
  }
  return { line, value };
}

/** Rival levels: [take boxes chance, safe-line preference, minimise giveaways, chain control, exact endgame size]. */
export interface Level { take: number; safe: number; minGive: boolean; control: boolean; exact: number }
export const LEVELS: Level[] = [
  { take: 0.6, safe: 0.35, minGive: false, control: false, exact: 0 },
  { take: 1, safe: 0.8, minGive: false, control: false, exact: 0 },
  { take: 1, safe: 1, minGive: true, control: false, exact: 0 },
  { take: 1, safe: 1, minGive: true, control: true, exact: 11 },
  { take: 1, safe: 1, minGive: true, control: true, exact: 16 },
];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export function choose(linesIn: ArrayLike<number>, lv: Level): number {
  const lines = Uint8Array.from(linesIn as ArrayLike<number>);
  const all = free(lines);
  if (!all.length) return -1;
  if (lv.exact && all.length <= lv.exact) return solve(lines).line;

  const caps = all.filter((l) => completes(lines, l).length > 0);
  if (caps.length && Math.random() < lv.take) {
    if (lv.control) {
      const dd = doubleDeal(lines, caps);
      if (dd >= 0) return dd;
    }
    // a line that closes two boxes at once first
    return caps.reduce((a, l) => (completes(lines, l).length > completes(lines, a).length ? l : a), caps[0]);
  }
  const safe = all.filter((l) => isSafe(lines, l));
  if (safe.length && Math.random() < lv.safe) return pick(safe);
  if (!lv.minGive) return pick(all);
  // hand over as little as possible; among equals prefer lines that leave the boxes split
  // (opening a short chain in the middle stops the opponent from declining it)
  let best: number[] = [], bestCost = 1e9;
  for (const l of all) {
    if (caps.includes(l)) continue;
    const cost = giveaway(lines, l) * 10 - (lv.control ? threeSided(lines, l) : 0);
    if (cost < bestCost) { bestCost = cost; best = [l]; } else if (cost === bestCost) best.push(l);
  }
  return best.length ? pick(best) : pick(all);
}

function threeSided(lines: Uint8Array, l: number): number {
  lines[l] = 1;
  let n = 0;
  for (let b = 0; b < BOXES; b++) if (sides(lines, b) === 3) n++;
  lines[l] = 0;
  return n;
}

/**
 * Chain control: when the boxes on offer end in a two-box tail and taking everything would
 * leave only long chains to open, decline the last two (draw the tail's far side) so the
 * opponent has to open the next long chain for us. Returns the line, or -1 to just take.
 */
function doubleDeal(lines: Uint8Array, caps: number[]): number {
  for (const l of caps) {
    const done = completes(lines, l);
    if (done.length !== 1) continue;
    const b = done[0];
    const b2 = LINE_BOXES[l].find((x) => x !== b);
    if (b2 === undefined || sides(lines, b2) !== 2) continue;
    // b2's other open side ends the chain (no box beyond it gets a third side)
    const far = BOX_LINES[b2].find((x) => x !== l && !lines[x]);
    if (far === undefined) continue;
    const beyond = LINE_BOXES[far].find((x) => x !== b2);
    if (beyond !== undefined && sides(lines, beyond) >= 2) continue;
    // other boxes on offer elsewhere are taken first
    if (caps.some((o) => o !== l && !BOX_LINES[b].includes(o))) return caps.find((o) => o !== l && !BOX_LINES[b].includes(o))!;
    // what is left after taking these two?
    const s = Uint8Array.from(lines);
    s[l] = 1; s[far] = 1;
    greedyTake(s);
    const rest = free(s);
    if (!rest.length || rest.some((x) => isSafe(s, x))) return -1;
    let left = 0;
    for (let k = 0; k < BOXES; k++) if (sides(s, k) < 4) left++;
    const minOpen = Math.min(...rest.map((x) => giveaway(s, x)));
    if (left >= 5 && minOpen >= 3) return far;
    return -1;
  }
  return -1;
}
