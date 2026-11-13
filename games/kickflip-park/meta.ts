// Kickflip Park: what carries over between sessions, kept in the core storage: the park picked,
// the goals done per park (Normal and Easy both count), the best session score, the mixtapes ever
// found per park, the board ridden, and whether the first-session tutorial was done.
//
// Saves from 1.0 had a deck and a wheel colour instead of a board: they map onto the board that
// stands for them (boards.ts `legacy`), and every board's rule reads the same progress the old
// decks (goals) and wheels (best score) did, so nothing unlocked is lost.
import { storage } from '@core';
import { PARKS, UNLOCK_GOALS, park, type ParkId } from './parks';
import { BOARDS, FALLBACK_BOARD, boardOpen, legacyBoard, legacyOwned, type BoardProgress } from './boards';

export interface Meta {
  park: ParkId;
  goals: Record<ParkId, string[]>;
  best: Record<ParkId, number>;
  bestAny: number;
  /** The board ridden (boards.ts id). */
  board: string;
  /** Boards kept open whatever the rules say: what a 1.0 save had opened, and the board it rode. */
  owned: string[];
  /** Mixtapes ever found, by their index in each park. */
  tapes: Record<ParkId, number[]>;
  /** The old control card was shown (1.0). */
  hinted: boolean;
  /** First-session tutorial: steps done (TUTORIAL_STEPS when finished or skipped). */
  tutorial: number;
  sessions: number;
}

/** The tutorial's step count (PlayScene). */
export const TUTORIAL_STEPS = 4;

const KEY = 'kickflip-park:meta';

interface Saved extends Partial<Meta> { deck?: string; wheel?: string }

export function loadMeta(): Meta {
  const m = storage.get<Saved>(KEY, {});
  const goals = { plaza: [], yard: [], roofs: [], ...(m.goals ?? {}) } as Record<ParkId, string[]>;
  const tapes = { plaza: [], yard: [], roofs: [], ...(m.tapes ?? {}) } as Record<ParkId, number[]>;
  const sessions = m.sessions ?? 0;
  const meta: Meta = {
    park: PARKS.includes(m.park as ParkId) ? m.park as ParkId : 'plaza',
    goals,
    best: { plaza: 0, yard: 0, roofs: 0, ...(m.best ?? {}) },
    bestAny: m.bestAny ?? 0,
    board: typeof m.board === 'string' ? m.board : legacyBoard(m.deck, m.wheel),
    owned: Array.isArray(m.owned) ? m.owned.filter((x) => typeof x === 'string') : [],
    tapes,
    hinted: !!m.hinted,
    // players from 1.0 with sessions behind them skip the tutorial
    tutorial: m.tutorial ?? (sessions > 0 ? TUTORIAL_STEPS : 0),
    sessions,
  };
  if (!unlocked(meta, meta.park)) meta.park = 'plaza';
  // a 1.0 save (decks and wheels, no board yet): what it had opened stays open under the new ladder
  if (typeof m.board !== 'string' && (m.deck !== undefined || m.wheel !== undefined)) {
    const goals = PARKS.reduce((s, p) => s + goals0(meta, p), 0);
    meta.owned = [...new Set([...meta.owned, ...legacyOwned(goals, meta.bestAny), meta.board])];
    saveMeta(meta);
  }
  const b = BOARDS.find((q) => q.id === meta.board);
  if (!b || !boardOpen(b, progress(meta))) meta.board = FALLBACK_BOARD;
  return meta;
}

export function saveMeta(m: Meta): void {
  storage.set(KEY, m);
}

const goals0 = (m: Meta, p: ParkId): number => m.goals[p].length;
export const goalsDone = (m: Meta): number => PARKS.reduce((s, p) => s + goals0(m, p), 0);
export const tapesFound = (m: Meta): number => PARKS.reduce((s, p) => s + m.tapes[p].length, 0);
export const progress = (m: Meta): BoardProgress => ({
  goals: goalsDone(m), best: m.bestAny, tapes: tapesFound(m), tapesPark: Math.max(...PARKS.map((p) => m.tapes[p].length)),
  plazaGoals: m.goals.plaza.length, yardGoals: m.goals.yard.length, owned: m.owned,
});

/** A park is open when the one before it has enough goals done. */
export function unlocked(m: Meta, id: ParkId): boolean {
  const i = PARKS.indexOf(id);
  return i === 0 || m.goals[PARKS[i - 1]].length >= UNLOCK_GOALS;
}

export const boardIsOpen = (m: Meta, id: string): boolean => {
  const b = BOARDS.find((q) => q.id === id);
  return !!b && boardOpen(b, progress(m));
};

/** Records a finished session; returns what it newly opened. */
export function bankSession(m: Meta, id: ParkId, score: number, done: Iterable<string>, tapes: readonly boolean[] = []): { goals: string[]; parks: ParkId[]; boards: string[] } {
  const before = { parks: PARKS.filter((p) => unlocked(m, p)), boards: BOARDS.filter((b) => boardOpen(b, progress(m))).map((b) => b.id) };
  const fresh: string[] = [];
  const valid = new Set(park(id).goals.map((g) => g.id));
  for (const g of done) if (valid.has(g) && !m.goals[id].includes(g)) { m.goals[id].push(g); fresh.push(g); }
  tapes.forEach((got, i) => { if (got && !m.tapes[id].includes(i)) m.tapes[id].push(i); });
  m.best[id] = Math.max(m.best[id], score);
  m.bestAny = Math.max(m.bestAny, score);
  m.sessions++;
  saveMeta(m);
  return {
    goals: fresh,
    parks: PARKS.filter((p) => unlocked(m, p) && !before.parks.includes(p)),
    boards: BOARDS.filter((b) => boardOpen(b, progress(m)) && !before.boards.includes(b.id)).map((b) => b.id),
  };
}
