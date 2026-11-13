// Star Squadron: what carries over from run to run: the Stardust bank and the owned talents, kept
// in the core storage. A reset refunds every speck.
import { storage } from '@core';
import { TALENT, type TalentId } from './talents';

export interface Meta {
  dust: number;
  talents: TalentId[];
  /** Stardust earned in all (stats). */
  earned: number;
  /** Best sector reached (1-based). */
  bestSector: number;
  runs: number;
}

const KEY = 'star-squadron:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  return {
    dust: Math.max(0, m.dust ?? 0),
    talents: (m.talents ?? []).filter((t): t is TalentId => t in TALENT),
    earned: m.earned ?? 0,
    bestSector: m.bestSector ?? 0,
    runs: m.runs ?? 0,
  };
}

export function saveMeta(m: Meta): void {
  storage.set(KEY, m);
}

export const owns = (m: Meta, id: TalentId): boolean => m.talents.includes(id);

export type BuyState = 'owned' | 'ok' | 'poor' | 'locked';

export function buyState(m: Meta, id: TalentId): BuyState {
  const t = TALENT[id];
  if (owns(m, id)) return 'owned';
  if (t.req && !owns(m, t.req)) return 'locked';
  return m.dust >= t.cost ? 'ok' : 'poor';
}

export function buy(m: Meta, id: TalentId): boolean {
  if (buyState(m, id) !== 'ok') return false;
  m.dust -= TALENT[id].cost;
  m.talents.push(id);
  saveMeta(m);
  return true;
}

/** Gives every spent speck back. */
export function resetTalents(m: Meta): number {
  const back = m.talents.reduce((s, id) => s + TALENT[id].cost, 0);
  m.dust += back;
  m.talents = [];
  saveMeta(m);
  return back;
}

/** Banks a finished run. */
export function bankRun(m: Meta, dust: number, sector: number): void {
  m.dust += dust;
  m.earned += dust;
  m.runs++;
  m.bestSector = Math.max(m.bestSector, sector);
  saveMeta(m);
}
