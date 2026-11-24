// Trap Trail: what lasts between runs, in the core storage: the coins (the shop is paid from them),
// the upgrade ranks, how far the trail is unlocked, each stage's best stars, time and gems found,
// and the first-time hints already shown.
import { storage } from '@core';
import { UPGRADE, UPGRADE_IDS, noRanks, type Ranks, type UpgradeId } from './defs';
import { STAGE_COUNT } from './levels';

const KEY = 'trap-trail:meta';

export interface StageBest {
  /** Which of the three stars were ever found (bit 0..2). */
  stars: number;
  /** Best time in seconds (0 = never cleared). */
  time: number;
}

export interface Meta {
  coins: number;
  ranks: Ranks;
  /** The highest stage that can be played (1..20); 21 once the trail is beaten. */
  unlocked: number;
  best: StageBest[];
  /** The last stage picked on the map. */
  last: number;
  runs: number;
  hints: string[];
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(UPGRADE[u].prices.length, Math.floor(Number(m.ranks?.[u]) || 0)));
  const best: StageBest[] = [];
  for (let i = 0; i < STAGE_COUNT; i++) {
    const b = m.best?.[i];
    best.push({ stars: Math.max(0, Math.min(7, Math.floor(Number(b?.stars) || 0))), time: Math.max(0, Number(b?.time) || 0) });
  }
  const unlocked = Math.max(1, Math.min(STAGE_COUNT + 1, Math.floor(Number(m.unlocked) || 1)));
  return {
    coins: Math.max(0, Math.floor(Number(m.coins) || 0)),
    ranks,
    unlocked,
    best,
    last: Math.max(1, Math.min(Math.min(unlocked, STAGE_COUNT), Math.floor(Number(m.last) || 1))),
    runs: Math.max(0, Math.floor(Number(m.runs) || 0)),
    hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === 'string').slice(0, 30) : [],
  };
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

export const starCount = (b: StageBest): number => (b.stars & 1) + ((b.stars >> 1) & 1) + ((b.stars >> 2) & 1);
export const totalStars = (m: Meta): number => m.best.reduce((s, b) => s + starCount(b), 0);

/** The next rank's price in coins, or null when maxed. */
export function nextPrice(m: Meta, u: UpgradeId): number | null {
  const r = m.ranks[u];
  return r >= UPGRADE[u].prices.length ? null : UPGRADE[u].prices[r];
}

export function canBuy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  return p !== null && p <= m.coins;
}

export function buy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  if (p === null || p > m.coins) return false;
  m.coins -= p;
  m.ranks[u]++;
  saveMeta(m);
  return true;
}
