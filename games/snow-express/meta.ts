// Snow Express: what carries over between visits (core storage): stars per level (the best of
// Easy and Normal), the mode and level picked on the map, the best Rush score per difficulty and
// the tutorial steps seen.
import { storage } from '@core';
import { LEVELS, CHAPTERS, type ChapterId } from './levels';

export interface Meta {
  /** 'journey' or 'rush'. */
  mode: 'journey' | 'rush';
  /** The Journey level to play next. */
  level: number;
  stars: Record<number, number>;
  rushRuns: number;
  /** The tutorial was shown (levels 1 and 2). */
  tutorial: boolean;
  /** Seen the keyboard hint. */
  keysSeen: boolean;
}

const KEY = 'snow-express:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  const meta: Meta = {
    mode: m.mode === 'rush' ? 'rush' : 'journey',
    level: LEVELS.some((l) => l.id === m.level) ? m.level! : 1,
    stars: { ...(m.stars ?? {}) },
    rushRuns: m.rushRuns ?? 0,
    tutorial: !!m.tutorial,
    keysSeen: !!m.keysSeen,
  };
  if (!levelOpen(meta, meta.level)) meta.level = 1;
  return meta;
}

export function saveMeta(m: Meta): void { storage.set(KEY, m); }

export const totalStars = (m: Meta): number => Object.values(m.stars).reduce((s, v) => s + v, 0);

export function chapterOf(level: number): ChapterId { return (LEVELS.find((l) => l.id === level)?.chapter ?? 0) as ChapterId; }

export function chapterOpen(m: Meta, c: ChapterId): boolean { return totalStars(m) >= CHAPTERS[c].need; }

/** A level is open when its chapter is and the level before it (in the chapter) has a star. */
export function levelOpen(m: Meta, id: number): boolean {
  const ch = CHAPTERS.find((c) => c.levels.includes(id));
  if (!ch || !chapterOpen(m, ch.id)) return false;
  const i = ch.levels.indexOf(id);
  return i === 0 || (m.stars[ch.levels[i - 1]] ?? 0) > 0;
}

/** Records a cleared level; returns the chapters it opened. */
export function recordLevel(m: Meta, id: number, stars: number): ChapterId[] {
  const before = CHAPTERS.filter((c) => chapterOpen(m, c.id)).map((c) => c.id);
  m.stars[id] = Math.max(m.stars[id] ?? 0, stars);
  const after = CHAPTERS.filter((c) => chapterOpen(m, c.id)).map((c) => c.id);
  saveMeta(m);
  return after.filter((c) => !before.includes(c));
}

/** The level after this one that is open (or null at the end of the Journey). */
export function nextLevel(m: Meta, id: number): number | null {
  for (const l of LEVELS) if (l.id > id && levelOpen(m, l.id)) return l.id;
  return null;
}
