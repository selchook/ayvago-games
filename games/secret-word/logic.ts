// Secret Word rules without Phaser: the dictionary, the answer filter, scoring a guess and the
// arcade numbers (word length, clock, points). Kept free of browser APIs and imports so scripts
// can exercise it in Node.

export type Lang = 'tr' | 'en';
/** 0 = not in the word, 1 = in the word elsewhere, 2 = right place. */
export type Mark = 0 | 1 | 2;

export const TRIES = 6;
export const LIVES = 3;
export const MAX_JOKERS = 3;
export const START_JOKERS = 1;
/** A joker is earned after this many solved words. */
export const SOLVES_PER_JOKER = 3;
/** The "remove letters" joker greys out this many absent letters. */
export const REMOVE_COUNT = 5;

export const ALPHABET: Record<Lang, string> = {
  tr: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ',
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
};

/** On-screen keyboard rows (Turkish Q layout without Q/W/X, English QWERTY). */
export const KEY_ROWS: Record<Lang, string[]> = {
  tr: ['ERTYUIOPĞÜ', 'ASDFGHJKLŞİ', 'ZCVBNMÖÇ'],
  en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
};

// ---------------------------------------------------------------- scoring a guess

/** Standard two-pass marking: exact matches first, then the remaining letters left to right. */
export function evaluate(guess: string[], answer: string[]): Mark[] {
  const n = answer.length;
  const marks: Mark[] = new Array(n).fill(0);
  const left = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) marks[i] = 2;
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < n; i++) {
    if (marks[i] === 2) continue;
    const k = left.get(guess[i]) ?? 0;
    if (k > 0) {
      marks[i] = 1;
      left.set(guess[i], k - 1);
    }
  }
  return marks;
}

// ---------------------------------------------------------------- arcade numbers

/** Word length for the n-th word of a run (1-based): 4, then 5 from word 4, then 6 from word 10. */
export function lengthFor(wordNumber: number, maxLen: number): number {
  const len = wordNumber <= 3 ? 4 : wordNumber <= 9 ? 5 : 6;
  return Math.min(len, maxLen);
}

/** Seconds for one word: 120 at the start, 4 fewer per word in the current streak, never under 60. */
export function timeFor(streak: number): number {
  return Math.max(60, 120 - 4 * streak);
}

/** Streak multiplier: 1 + 0.25 per solved word in a row (this one included), capped at ×3. */
export function multiplierFor(streak: number): number {
  return Math.min(3, 1 + 0.25 * streak);
}

/** Points for a solved word: (100 + 50 per unused try + 1 per second left) × streak multiplier. */
export function pointsFor(triesUsed: number, secondsLeft: number, streak: number): { base: number; mult: number; total: number } {
  const base = 100 + 50 * Math.max(0, TRIES - triesUsed) + Math.max(0, Math.floor(secondsLeft));
  const mult = multiplierFor(streak);
  return { base, mult, total: Math.round(base * mult) };
}

// ---------------------------------------------------------------- dictionary

const split = (s: string): string[] => s.split(/\s+/).filter(Boolean);
const chars = (w: string): string[] => [...w];

/** Turkish letters with dots and cedillas fold onto their plain forms (typing on a US keyboard). */
const FOLD: Record<string, string> = { Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
export const fold = (ch: string): string => FOLD[ch] ?? ch;
/** Typed letters that may stand for a Turkish letter (a US keyboard has no Ç Ğ İ/I Ö Ş Ü). */
const AMBIGUOUS = new Set(['C', 'G', 'I', 'İ', 'O', 'S', 'U']);
const foldWord = (w: string): string => chars(w).map(fold).join('');

/**
 * Words that are fine in the list but not as answers: pronoun and adverb forms with suffixes,
 * irregular past forms and comparatives the suffix rules below cannot see.
 */
const SKIP: Record<Lang, string> = {
  tr: `BİRİ ÇOĞU NERE ORASI HEPSİ ONLAR BUNLAR BURASI ŞUNLAR ERTESİ TARİHİ SOYADI ÖTEKİ
    DİLE İSTE GÖRE İŞTE BÖYLE ÖYLE SÖYLE NİYE HANİ YANİ PEKİ HADİ HAYDİ ÖBÜR`,
  en: `BEEN DONE GONE SEEN DOES GOES WERE WENT CAME GAVE TOOK SAID PAID LAID MADE HELD FELT KEPT
    SENT TOLD SOLD LENT BENT SPED FLED BRED SLID SPUN SWAM SANG RANG SANK SUNG SUNK HUNG RODE
    DREW GREW KNEW FLEW BLEW WORE TORE WOKE SEWN SOWN TORN WORN SHOD FROM INTO ONTO UPON THAN
    THEM THEY THIS THAT WHAT WHEN WITH YOUR OURS HERS WHOM SUCH THUS ALSO
    BEGAN BEGUN DRANK DROVE FROZE SHONE SHOOK STOOD STOLE SWORE SWORN THREW SPOKE WROTE TAKEN
    GIVEN EATEN RISEN SWUNG STUNG CLUNG FLUNG SLUNG STUCK AROSE BLOWN DRAWN FLOWN GROWN KNOWN
    SHOWN CHOSE BROKE WOKEN UNDID LEAPT KNELT DEALT SLEPT SWEPT CREPT BUILT BURNT MEANT DWELT
    SPENT BEING DOING GOING AGING DYING LYING OWING TYING USING THEIR THERE THESE THOSE WHICH
    WHOSE WOULD COULD SHALL MIGHT OUGHT NEWER OLDER FEWER SAFER NICER LATER LOWER UPPER
    INNER OUTER OTHER UNDER AFTER AGAIN ABOUT ABOVE AMONG SINCE UNTIL WHILE
    FORGOT SPOKEN STOLEN WRITTEN BITTEN HIDDEN RIDDEN FALLEN DRIVEN BROKEN CHOSEN FROZEN
    TAUGHT CAUGHT BOUGHT BROUGHT THOUGHT FOUGHT SOUGHT SHRUNK STRUNG STRUCK SPRANG
    BIGGER SMALLER HIGHER LONGER BETTER WORSEN FASTER SLOWER BRIGHTER WARMER COLDER DEEPER
    LARGER EASIER HAPPIER TALLER SHORTER CLOSER SOONER RICHER POORER WEAKER STRONGER
    THOUGH ALMOST ALWAYS AROUND BEFORE BEHIND BEYOND DURING EITHER NEARLY RATHER WITHIN
    FEET MICE LICE WEPT OOPS AHOY OUCH YUCK SHOO FREED GIRLS GILLS WATTS ELVES GEESE WIVES WOMEN
    TEETH HEARD FOUND WIDER WISER HACKED MISLED BOLDER DARKER FAIRER HARDER LOUDER LOOSER NEARER
    SOFTER WETTER UGLIER KINDER LESSER BECAME SHRANK SPRUNG THROWN SHAKEN BEATEN PROVEN VARIED
    VARIES KNIVES WOLVES NACHOS UNDONE UNSEEN ELDEST CANNOT ITSELF MYSELF ANYONE ANYWAY UNLESS`,
};

export interface Dict {
  lang: Lang;
  /** Accepted guesses by length (COMMON ∪ EXTRA). */
  valid: Map<number, Set<string>>;
  /** Clean everyday answers by length (COMMON only). */
  answers: Map<number, string[]>;
  /** Folded spelling → accepted words, for Turkish typed on a US keyboard. */
  folded: Map<string, string[]>;
  common: Set<string>;
  /** Longest word length this language has enough answers for (5 or 6). */
  maxLen: number;
}

/** True for an English word that looks like a plural, a past tense or an -ing form of a listed word. */
function inflectedEn(w: string, all: Set<string>): boolean {
  const has = (s: string) => s.length >= 3 && all.has(s);
  const n = w.length;
  if (w.endsWith('S') && !w.endsWith('SS')) {
    if (has(w.slice(0, -1))) return true;
    if (w.endsWith('ES') && has(w.slice(0, -2))) return true;
    if (w.endsWith('IES') && has(w.slice(0, -3) + 'Y')) return true;
  }
  if (w.endsWith('ED')) {
    const stem = w.slice(0, -2);
    if (w.endsWith('EED')) {
      // FREED, AGREED (but not SEED, FEED, NEED)
      if (n >= 5 && has(w.slice(0, -1))) return true;
    } else {
      if (has(stem) || has(w.slice(0, -1))) return true;
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2] && has(stem.slice(0, -1))) return true;
      if (w.endsWith('IED') && has(w.slice(0, -3) + 'Y')) return true;
    }
  }
  if (w.endsWith('ING')) {
    const stem = w.slice(0, -3);
    if (has(stem) || has(stem + 'E')) return true;
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2] && has(stem.slice(0, -1))) return true;
  }
  if (w.endsWith('EST') && n >= 6 && (has(w.slice(0, -3)) || has(w.slice(0, -2)))) return true;
  return false;
}

export function buildDict(lang: Lang, common: string, extra: string): Dict {
  const abc = new Set(chars(ALPHABET[lang]));
  const ok = (w: string) => chars(w).every((c) => abc.has(c));
  const c = split(common).filter(ok);
  const e = split(extra).filter(ok);
  const all = new Set([...c, ...e]);
  const extraSet = new Set(e);
  const skip = new Set(split(SKIP[lang]));
  const valid = new Map<number, Set<string>>();
  const folded = new Map<string, string[]>();
  for (const w of all) {
    const n = chars(w).length;
    if (n < 4 || n > 6) continue;
    if (!valid.has(n)) valid.set(n, new Set());
    valid.get(n)!.add(w);
    const f = foldWord(w);
    if (!folded.has(f)) folded.set(f, []);
    folded.get(f)!.push(w);
  }
  const answers = new Map<number, string[]>();
  for (const w of new Set(c)) {
    const n = chars(w).length;
    if (n < 4 || n > 6) continue;
    if (extraSet.has(w) || skip.has(w)) continue;
    if (lang === 'en' && inflectedEn(w, all)) continue;
    if (!answers.has(n)) answers.set(n, []);
    answers.get(n)!.push(w);
  }
  // a thin six-letter list caps the run at five letters for this language
  const maxLen = (answers.get(6)?.length ?? 0) >= 150 ? 6 : 5;
  return { lang, valid, answers, folded, common: new Set(c), maxLen };
}

/**
 * The accepted word the player meant, or null. Exact spelling first; in Turkish a plain C G I O S U
 * (or İ) may stand for its dotted or cedilla form, so "KOSE" finds "KÖŞE". Letters that are already
 * Turkish, and the positions in `exact` (the joker's letters), must match exactly. Among several
 * matches the closest spelling wins, everyday words first.
 */
export function resolveGuess(dict: Dict, letters: string[], exact: Set<number> = new Set()): string | null {
  const word = letters.join('');
  const set = dict.valid.get(letters.length);
  if (set?.has(word)) return word;
  if (dict.lang !== 'tr') return null;
  const cands = dict.folded.get(foldWord(word)) ?? [];
  let best: string | null = null;
  let bestScore = -1;
  for (const cand of cands) {
    const cc = chars(cand);
    if (cc.length !== letters.length) continue;
    let same = 0;
    let fits = true;
    for (let i = 0; i < cc.length; i++) {
      if (cc[i] === letters[i]) same++;
      else if (exact.has(i) || !AMBIGUOUS.has(letters[i]) || fold(cc[i]) !== fold(letters[i])) { fits = false; break; }
    }
    if (!fits) continue;
    const score = same * 2 + (dict.common.has(cand) ? 1 : 0);
    if (score > bestScore) { best = cand; bestScore = score; }
  }
  return best;
}

/** A random unused answer of the given length (repeats only once the list is exhausted). */
export function pickAnswer(dict: Dict, len: number, used: Set<string>, rnd: () => number = Math.random): string {
  const list = dict.answers.get(len) ?? [];
  const fresh = list.filter((w) => !used.has(w));
  const pool = fresh.length ? fresh : list;
  const w = pool[Math.floor(rnd() * pool.length)];
  used.add(w);
  return w;
}

export { chars };
