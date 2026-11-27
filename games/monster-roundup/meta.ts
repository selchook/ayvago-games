// Monster Roundup: what lasts between runs, in the core storage: the credits (the hangar's upgrades are
// paid from them), the upgrade ranks, how far the levels are unlocked, each level's best stars and
// time, the mech in use, and the hints already shown.
import { storage } from '@core';
import { UPGRADE, UPGRADE_IDS, MECHS, MECH_IDS, noRanks, type Ranks, type UpgradeId, type MechId } from './defs';
import { LEVEL_COUNT } from './levels';

const KEY = 'monster-roundup:meta';

export interface StageBest {
  /** Which of the three stars were ever earned (bit 0..2). */
  stars: number;
  /** Best time in seconds (0 = never cleared). */
  time: number;
}

export interface Meta {
  credits: number;
  ranks: Ranks;
  /** The highest level that can be played (1..20); 21 once every one is cleared. */
  unlocked: number;
  best: StageBest[];
  /** The last level picked on the map. */
  last: number;
  runs: number;
  hints: string[];
  mech: MechId;
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(UPGRADE[u].prices.length, Math.floor(Number(m.ranks?.[u]) || 0)));
  const best: StageBest[] = [];
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const b = m.best?.[i];
    best.push({ stars: Math.max(0, Math.min(7, Math.floor(Number(b?.stars) || 0))), time: Math.max(0, Number(b?.time) || 0) });
  }
  const unlocked = Math.max(1, Math.min(LEVEL_COUNT + 1, Math.floor(Number(m.unlocked) || 1)));
  const out: Meta = {
    credits: Math.max(0, Math.floor(Number(m.credits) || 0)),
    ranks,
    unlocked,
    best,
    last: Math.max(1, Math.min(Math.min(unlocked, LEVEL_COUNT), Math.floor(Number(m.last) || 1))),
    runs: Math.max(0, Math.floor(Number(m.runs) || 0)),
    hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === 'string').slice(0, 60) : [],
    mech: 'mike',
  };
  const id = MECH_IDS.find((x) => x === m.mech);
  if (id && totalStars(out) >= MECHS[id].stars) out.mech = id;
  return out;
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

export const starCount = (b: StageBest): number => (b.stars & 1) + ((b.stars >> 1) & 1) + ((b.stars >> 2) & 1);
export const totalStars = (m: Meta): number => m.best.reduce((s, b) => s + starCount(b), 0);

/** The next rank's price in credits, or null when maxed. */
export function nextPrice(m: Meta, u: UpgradeId): number | null {
  const r = m.ranks[u];
  return r >= UPGRADE[u].prices.length ? null : UPGRADE[u].prices[r];
}

export function canBuy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  return p !== null && p <= m.credits;
}

export function buy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  if (p === null || p > m.credits) return false;
  m.credits -= p;
  m.ranks[u]++;
  saveMeta(m);
  return true;
}

export const mechOpen = (m: Meta, id: MechId): boolean => totalStars(m) >= MECHS[id].stars;

/** Pilots a mech, if its stars are earned. */
export function pickMech(m: Meta, id: MechId): boolean {
  if (!mechOpen(m, id)) return false;
  m.mech = id;
  saveMeta(m);
  return true;
}
