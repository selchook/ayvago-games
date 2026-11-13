// Kickflip Park: what carries over between sessions, kept in the core storage: the park picked,
// the goals done per park (Normal and Easy both count), the best session score, the board's deck
// and wheels, and whether the first-run control hint was shown.
import { storage } from '@core';
import { PARKS, UNLOCK_GOALS, park, type ParkId } from './parks';
import { DECKS, WHEELS, DECK_GOALS, WHEEL_SCORE, type DeckId, type WheelId } from './defs';

export interface Meta {
  park: ParkId;
  goals: Record<ParkId, string[]>;
  best: Record<ParkId, number>;
  bestAny: number;
  deck: DeckId;
  wheel: WheelId;
  hinted: boolean;
  sessions: number;
}

const KEY = 'kickflip-park:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  const goals = { plaza: [], yard: [], roofs: [], ...(m.goals ?? {}) } as Record<ParkId, string[]>;
  const meta: Meta = {
    park: PARKS.includes(m.park as ParkId) ? m.park as ParkId : 'plaza',
    goals,
    best: { plaza: 0, yard: 0, roofs: 0, ...(m.best ?? {}) },
    bestAny: m.bestAny ?? 0,
    deck: DECKS.includes(m.deck as DeckId) ? m.deck as DeckId : 'classic',
    wheel: WHEELS.includes(m.wheel as WheelId) ? m.wheel as WheelId : 'white',
    hinted: !!m.hinted,
    sessions: m.sessions ?? 0,
  };
  if (!unlocked(meta, meta.park)) meta.park = 'plaza';
  if (!deckOpen(meta, meta.deck)) meta.deck = 'classic';
  if (!wheelOpen(meta, meta.wheel)) meta.wheel = 'white';
  return meta;
}

export function saveMeta(m: Meta): void {
  storage.set(KEY, m);
}

export const goalsDone = (m: Meta): number => PARKS.reduce((s, p) => s + m.goals[p].length, 0);

/** A park is open when the one before it has enough goals done. */
export function unlocked(m: Meta, id: ParkId): boolean {
  const i = PARKS.indexOf(id);
  return i === 0 || m.goals[PARKS[i - 1]].length >= UNLOCK_GOALS;
}

export const deckOpen = (m: Meta, d: DeckId): boolean => goalsDone(m) >= DECK_GOALS[d];
export const wheelOpen = (m: Meta, w: WheelId): boolean => m.bestAny >= WHEEL_SCORE[w];

/** Records a finished session; returns what it newly opened. */
export function bankSession(m: Meta, id: ParkId, score: number, done: Iterable<string>): { goals: string[]; parks: ParkId[]; decks: DeckId[]; wheels: WheelId[] } {
  const before = { parks: PARKS.filter((p) => unlocked(m, p)), decks: DECKS.filter((d) => deckOpen(m, d)), wheels: WHEELS.filter((w) => wheelOpen(m, w)) };
  const fresh: string[] = [];
  const valid = new Set(park(id).goals.map((g) => g.id));
  for (const g of done) if (valid.has(g) && !m.goals[id].includes(g)) { m.goals[id].push(g); fresh.push(g); }
  m.best[id] = Math.max(m.best[id], score);
  m.bestAny = Math.max(m.bestAny, score);
  m.sessions++;
  saveMeta(m);
  return {
    goals: fresh,
    parks: PARKS.filter((p) => unlocked(m, p) && !before.parks.includes(p)),
    decks: DECKS.filter((d) => deckOpen(m, d) && !before.decks.includes(d)),
    wheels: WHEELS.filter((w) => wheelOpen(m, w) && !before.wheels.includes(w)),
  };
}
