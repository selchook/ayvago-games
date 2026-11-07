// Letter Rain rules without Phaser: the dictionary, letter frequencies and values, the letter bag
// that keeps the board spellable, and a word finder for hints. Kept free of browser APIs.
import { COMMON as TR_COMMON, EXTRA as TR_EXTRA } from '../../src/words/tr';
import { COMMON as EN_COMMON, EXTRA as EN_EXTRA } from '../../src/words/en';

export type Lang = 'tr' | 'en';

export const MIN_WORD = 3;
export const MAX_WORD = 8;

// ---------------------------------------------------------------- letters

interface Letter { ch: string; weight: number; value: number; vowel: boolean }

// letter:weight:value. Weights follow the letter frequency of the word lists themselves (short
// words), so the board can actually spell them; values run from 1 (common) to 8 (rare).
const TABLES: Record<Lang, string> = {
  tr: 'A:13.4:1 E:8.2:1 K:7.1:1 İ:6.1:1 R:6:1 L:5.5:1 N:4.9:1 T:4.8:1 S:3.7:2 U:3.7:2 M:3.7:2 I:3.3:2 '
    + 'O:3:2 Y:2.9:3 D:2.6:3 B:2.4:3 Ü:2.3:3 Z:2.2:4 Ş:2:4 Ç:1.8:4 P:1.8:5 G:1.5:5 H:1.4:5 V:1.2:6 '
    + 'C:1.1:4 F:1.1:7 Ö:1.1:6 Ğ:0.8:8 J:0.2:8',
  en: 'E:11.8:1 A:8.4:1 O:7:1 I:7:1 S:6.5:1 R:6.5:1 T:6.5:1 L:5.6:1 N:5.6:1 U:3.6:2 D:4.2:2 C:3.2:3 '
    + 'P:3:3 H:2.9:4 M:2.7:3 G:2.5:3 B:2:3 Y:2:4 W:1.8:4 F:1.8:4 K:1.5:5 V:1.1:5 X:0.35:8 Z:0.35:8 '
    + 'J:0.3:8 Q:0.15:8',
};
const VOWELS: Record<Lang, string> = { tr: 'AEIİOÖUÜ', en: 'AEIOU' };
/** Share of vowels the bag aims for on the board. */
export const VOWEL_TARGET: Record<Lang, number> = { tr: 0.4, en: 0.38 };
/** Letters worth this much or more are rare: never two of the same at once. */
export const RARE = 5;

const letters: Record<Lang, Letter[]> = { tr: parse('tr'), en: parse('en') };
const valueMap: Record<Lang, Map<string, number>> = {
  tr: new Map(letters.tr.map((l) => [l.ch, l.value])),
  en: new Map(letters.en.map((l) => [l.ch, l.value])),
};

function parse(lang: Lang): Letter[] {
  return TABLES[lang].split(' ').filter(Boolean).map((s) => {
    const [ch, w, v] = s.split(':');
    return { ch, weight: Number(w), value: Number(v), vowel: VOWELS[lang].includes(ch) };
  });
}

export const valueOf = (lang: Lang, ch: string): number => valueMap[lang].get(ch) ?? 1;
export const isVowel = (lang: Lang, ch: string): boolean => VOWELS[lang].includes(ch);
export const alphabet = (lang: Lang): string[] => letters[lang].map((l) => l.ch);

type Rnd = () => number;

function pickWeighted(list: Letter[], rnd: Rnd): Letter {
  let total = 0;
  for (const l of list) total += l.weight;
  let x = rnd() * total;
  for (const l of list) if ((x -= l.weight) <= 0) return l;
  return list[list.length - 1];
}

/**
 * Draws letters by frequency while watching the board: it steers the vowel share towards the
 * language's target, never puts a second copy of a rare letter on the board (or soon after the
 * last one) and caps how many of one letter there can be.
 */
export class LetterBag {
  private recent: string[] = [];
  private vowels: Letter[];
  private consonants: Letter[];

  constructor(private lang: Lang, private rnd: Rnd = Math.random) {
    this.vowels = letters[lang].filter((l) => l.vowel);
    this.consonants = letters[lang].filter((l) => !l.vowel);
  }

  draw(board: string[]): string {
    const target = VOWEL_TARGET[this.lang];
    const n = board.length;
    const ratio = n ? board.filter((c) => isVowel(this.lang, c)).length / n : target;
    const wantVowel = ratio < target - 0.07 ? true : ratio > target + 0.07 ? false : this.rnd() < target;
    const pool = wantVowel ? this.vowels : this.consonants;
    const count = (ch: string) => board.reduce((k, c) => k + (c === ch ? 1 : 0), 0);
    const rareOnBoard = board.filter((c) => valueOf(this.lang, c) >= RARE).length;
    let pick = pool[0];
    for (let i = 0; i < 10; i++) {
      const l = pickWeighted(pool, this.rnd);
      const same = count(l.ch);
      if (l.value >= RARE && (same > 0 || rareOnBoard >= 3 || this.recent.slice(-8).includes(l.ch))) continue;
      if (same >= (l.vowel ? 7 : 4)) continue;
      pick = l;
      break;
    }
    this.recent.push(pick.ch);
    if (this.recent.length > 12) this.recent.shift();
    return pick.ch;
  }
}

// ---------------------------------------------------------------- dictionary

export interface Dict {
  words: Set<string>;
  /** Every proper prefix of an accepted word (for the word finder). */
  prefixes: Set<string>;
}

export function buildDict(...lists: string[]): Dict {
  const words = new Set<string>();
  const prefixes = new Set<string>();
  for (const list of lists) {
    for (const w of list.split(/\s+/)) {
      if (w.length < MIN_WORD || w.length > MAX_WORD) continue;
      words.add(w);
      for (let i = 1; i < w.length; i++) prefixes.add(w.slice(0, i));
    }
  }
  return { words, prefixes };
}

const dicts: Partial<Record<Lang, Dict>> = {};
/** Every word in COMMON and EXTRA of the shared lists (3 to 8 letters). Built once per language. */
export function dictFor(lang: Lang): Dict {
  return (dicts[lang] ??= lang === 'tr' ? buildDict(TR_COMMON, TR_EXTRA) : buildDict(EN_COMMON, EN_EXTRA));
}

// ---------------------------------------------------------------- word finder

export interface Found {
  word: string;
  /** Cells as [col, row]. */
  path: [number, number][];
}

/**
 * Every word that can be spelled on the grid by joining neighbouring cells (8 directions, each
 * cell once). `grid[c][r]` is a letter or null. Depth-first with the dictionary's prefix set.
 */
export function findWords(grid: (string | null)[][], dict: Dict, limit = 400): Found[] {
  const cols = grid.length, rows = grid[0]?.length ?? 0;
  const seen = new Map<string, Found>();
  const used: boolean[][] = grid.map((col) => col.map(() => false));
  const path: [number, number][] = [];
  const dfs = (c: number, r: number, prefix: string): void => {
    if (seen.size >= limit) return;
    const word = prefix + grid[c][r];
    const isWord = word.length >= MIN_WORD && dict.words.has(word);
    const goOn = word.length < MAX_WORD && dict.prefixes.has(word);
    if (!isWord && !goOn) return;
    used[c][r] = true;
    path.push([c, r]);
    if (isWord && !seen.has(word)) seen.set(word, { word, path: path.map((p) => [p[0], p[1]] as [number, number]) });
    if (goOn) {
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nc = c + dc, nr = r + dr;
          if ((dc || dr) && nc >= 0 && nc < cols && nr >= 0 && nr < rows && !used[nc][nr] && grid[nc][nr]) dfs(nc, nr, word);
        }
      }
    }
    path.pop();
    used[c][r] = false;
  };
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if (grid[c][r]) dfs(c, r, '');
  return [...seen.values()];
}

// ---------------------------------------------------------------- scoring

/** Length multiplier: 3 letters ×1, 4 ×1.5, 5 ×2, 6 ×3, 7 and more ×4. */
export function lengthMultiplier(len: number): number {
  return len >= 7 ? 4 : len === 6 ? 3 : len === 5 ? 2 : len === 4 ? 1.5 : 1;
}

/** Folds the Turkish letters with dots and cedillas onto their plain forms (typing on a US keyboard). */
const FOLD: Record<string, string> = { Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
export const fold = (ch: string): string => FOLD[ch] ?? ch;
