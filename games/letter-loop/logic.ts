// Letter Loop rules without Phaser: the dictionary, level bases and the crossword layout.
// Kept free of browser APIs so scripts can exercise it in Node.

export type Counts = Map<string, number>;

export interface Dict {
  /** Answer words (everyday). */
  common: string[];
  /** Every accepted word: common plus the bonus-only extras. */
  all: Set<string>;
  allList: string[];
  counts: Map<string, Counts>;
}

export interface Placed {
  word: string;
  r: number;
  c: number;
  /** 0 = across, 1 = down */
  dir: 0 | 1;
}

export interface Puzzle {
  base: string;
  /** The wheel letters in their starting order. */
  letters: string[];
  words: Placed[];
  rows: number;
  cols: number;
  /** Valid words from the wheel that are not in the grid (bonus words). */
  bonus: Set<string>;
}

export interface Shape {
  /** Wheel size (letters in the base word). */
  len: number;
  minWords: number;
  maxWords: number;
}

const split = (s: string): string[] => s.split(/\s+/).filter(Boolean);

export function countLetters(w: string): Counts {
  const m: Counts = new Map();
  for (const ch of w) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

export function fits(sub: Counts, base: Counts): boolean {
  for (const [ch, n] of sub) if ((base.get(ch) ?? 0) < n) return false;
  return true;
}

export function buildDict(common: string, extra: string): Dict {
  const c = [...new Set(split(common))];
  const all = new Set([...c, ...split(extra)]);
  const allList = [...all];
  const counts = new Map<string, Counts>();
  for (const w of allList) counts.set(w, countLetters(w));
  return { common: c, all, allList, counts };
}

/** Common words that can be spelled from the letters of `base` (3+ letters, base included). */
export function commonSubwords(dict: Dict, base: string): string[] {
  const bc = countLetters(base);
  return dict.common.filter((w) => w.length >= 3 && w.length <= base.length && fits(dict.counts.get(w)!, bc));
}

/** Every accepted word that can be spelled from `letters`. */
export function allSubwords(dict: Dict, letters: string): string[] {
  const bc = countLetters(letters);
  return dict.allList.filter((w) => w.length >= 3 && w.length <= letters.length && fits(dict.counts.get(w)!, bc));
}

type Rnd = () => number;
const shuffled = <T>(arr: T[], rnd: Rnd): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface Cell { ch: string; across: boolean; down: boolean }

/** Greedy crossword: the base word across, then each word crossing what is already placed. */
function layout(words: string[], base: string, maxCols: number, maxRows: number, target: number, rnd: Rnd): Placed[] {
  const cells = new Map<string, Cell>();
  const key = (r: number, c: number) => `${r},${c}`;
  const placed: Placed[] = [];
  let minR = 0, maxR = 0, minC = 0, maxC = base.length - 1;

  const put = (p: Placed) => {
    const [dr, dc] = p.dir ? [1, 0] : [0, 1];
    for (let i = 0; i < p.word.length; i++) {
      const r = p.r + dr * i, c = p.c + dc * i;
      const cell = cells.get(key(r, c)) ?? { ch: p.word[i], across: false, down: false };
      if (p.dir) cell.down = true; else cell.across = true;
      cells.set(key(r, c), cell);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
    placed.push(p);
  };

  // Returns the number of crossings, or -1 when the word cannot go there.
  const check = (w: string, r0: number, c0: number, dir: 0 | 1): number => {
    const [dr, dc] = dir ? [1, 0] : [0, 1];
    if (cells.has(key(r0 - dr, c0 - dc))) return -1;
    if (cells.has(key(r0 + dr * w.length, c0 + dc * w.length))) return -1;
    let crossings = 0;
    for (let i = 0; i < w.length; i++) {
      const r = r0 + dr * i, c = c0 + dc * i;
      const cell = cells.get(key(r, c));
      if (cell) {
        if (cell.ch !== w[i] || (dir ? cell.down : cell.across)) return -1;
        crossings++;
      } else {
        // a new cell may not touch a parallel neighbour
        if (cells.has(key(r + dc, c + dr)) || cells.has(key(r - dc, c - dr))) return -1;
      }
    }
    if (!crossings) return -1;
    const r1 = r0 + dr * (w.length - 1), c1 = c0 + dc * (w.length - 1);
    const rows = Math.max(maxR, r1) - Math.min(minR, r0) + 1;
    const cols = Math.max(maxC, c1) - Math.min(minC, c0) + 1;
    if (rows > maxRows || cols > maxCols) return -1;
    return crossings;
  };

  put({ word: base, r: 0, c: 0, dir: 0 });
  for (const w of words) {
    if (placed.length >= target) break;
    if (w === base) continue;
    let best: { p: Placed; score: number } | null = null;
    for (const [k, cell] of cells) {
      const [r, c] = k.split(',').map(Number);
      for (let i = 0; i < w.length; i++) {
        if (w[i] !== cell.ch) continue;
        for (const dir of [0, 1] as const) {
          if (dir ? cell.down : cell.across) continue;
          const r0 = dir ? r - i : r, c0 = dir ? c : c - i;
          const crossings = check(w, r0, c0, dir);
          if (crossings < 0) continue;
          const r1 = r0 + (dir ? w.length - 1 : 0), c1 = c0 + (dir ? 0 : w.length - 1);
          const area = (Math.max(maxR, r1) - Math.min(minR, r0) + 1) * (Math.max(maxC, c1) - Math.min(minC, c0) + 1);
          // more crossings, a squarer and smaller grid, a little randomness
          const score = crossings * 40 - area + rnd() * 6 + (dir === 1 ? 4 : 0);
          if (!best || score > best.score) best = { p: { word: w, r: r0, c: c0, dir }, score };
        }
      }
    }
    if (best) put(best.p);
  }
  // normalise to start at 0,0
  return placed.map((p) => ({ ...p, r: p.r - minR, c: p.c - minC }));
}

function bounds(words: Placed[]): { rows: number; cols: number } {
  let rows = 0, cols = 0;
  for (const p of words) {
    rows = Math.max(rows, p.r + (p.dir ? p.word.length : 1));
    cols = Math.max(cols, p.c + (p.dir ? 1 : p.word.length));
  }
  return { rows, cols };
}

/**
 * Builds one level: picks a base word of the shape's length that spells enough common words,
 * lays the words out as a crossword and lists the rest as bonus words.
 */
export function makePuzzle(dict: Dict, shape: Shape, used: Set<string>, rnd: Rnd, maxCols = 9, maxRows = 8): Puzzle | null {
  const candidates = shuffled(dict.common.filter((w) => w.length === shape.len && !used.has(w)), rnd);
  let tries = 0;
  for (const base of candidates) {
    if (++tries > 400) break;
    const subs = commonSubwords(dict, base);
    if (subs.length < shape.minWords) continue;
    let best: Placed[] = [];
    for (let attempt = 0; attempt < 14; attempt++) {
      // longer words first, shuffled within each length; a few shorter ones get a chance early
      const order = subs
        .map((w) => ({ w, k: w.length + (rnd() < 0.15 ? 1.5 : 0) + rnd() * 0.9 }))
        .sort((a, b) => b.k - a.k)
        .map((x) => x.w);
      const words = layout(order, base, maxCols, maxRows, shape.maxWords, rnd);
      const { rows, cols } = bounds(words);
      const better = words.length > best.length || (words.length === best.length && rows * cols < bounds(best).rows * bounds(best).cols);
      if (better) best = words;
      if (best.length >= shape.maxWords) break;
    }
    if (best.length < shape.minWords) continue;
    const { rows, cols } = bounds(best);
    const inGrid = new Set(best.map((p) => p.word));
    const bonus = new Set(allSubwords(dict, base).filter((w) => !inGrid.has(w)));
    let letters = shuffled([...base], rnd);
    for (let i = 0; i < 6 && letters.join('') === base; i++) letters = shuffled([...base], rnd);
    used.add(base);
    return { base, letters, words: best, rows, cols, bonus };
  }
  return null;
}

/** Level shapes: a gentle start, then six and seven letters with more words. */
export function shapeFor(level: number): Shape {
  if (level <= 1) return { len: 4, minWords: 3, maxWords: 4 };
  if (level <= 3) return { len: 5, minWords: 4, maxWords: 5 };
  if (level <= 6) return { len: 6, minWords: 5, maxWords: 7 };
  if (level <= 10) return { len: 6, minWords: 6, maxWords: 8 };
  return { len: 7, minWords: 6, maxWords: 9 };
}

/** Folds the Turkish letters with dots and cedillas onto their plain forms (for typing on a US keyboard). */
const FOLD: Record<string, string> = { Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
export const fold = (ch: string): string => FOLD[ch] ?? ch;
