// Sushi Rush: what lasts between runs, in the core storage: the purse (every day's takings go in;
// upgrades are paid from it), the upgrade ranks, the chosen chef, and the run count.
import { storage } from '@core';
import { CHEF_IDS, type ChefId } from './defs';
import { UPGRADE, UPGRADE_IDS, MAX_RANK, noRanks, type Ranks, type UpgradeId } from './powers';

const KEY = 'sushi-rush:meta';

export interface Meta {
  coins: number;
  ranks: Ranks;
  chef: ChefId;
  runs: number;
  /** Furthest day reached. */
  bestDay: number;
  /** The first day's coaching was seen. */
  coached: boolean;
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(MAX_RANK, Math.floor(Number(m.ranks?.[u]) || 0)));
  return {
    coins: Math.max(0, Math.floor(Number(m.coins) || 0)),
    ranks,
    chef: m.chef && (CHEF_IDS as readonly string[]).includes(m.chef) ? m.chef : 'panda',
    runs: Math.max(0, Number(m.runs) || 0),
    bestDay: Math.max(0, Number(m.bestDay) || 0),
    coached: !!m.coached,
  };
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

/** The next rank's price, or null when maxed. */
export function nextPrice(m: Meta, u: UpgradeId): number | null {
  const r = m.ranks[u];
  return r >= MAX_RANK ? null : UPGRADE[u].price[r];
}

export function buy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  if (p === null || p > m.coins) return false;
  m.coins -= p;
  m.ranks[u]++;
  saveMeta(m);
  return true;
}
