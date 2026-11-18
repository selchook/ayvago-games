// Neon Ronin: what lasts between sessions, in the core storage: the gears (the currency), the
// cyberware ranks, the levels unlocked, each level's stars, best time and best score, the abilities
// the campaign unlocked and whether the first level's tutorial was seen.
import { storage } from '@core';
import { LEVELS } from './levels';
import { UPGRADE, UPGRADE_IDS, MAX_RANK, ABILITY_IDS, noRanks, type Ranks, type UpgradeId, type AbilityId } from './powers';

const KEY = 'neon-ronin:meta';

export interface Meta {
  gears: number;
  ranks: Ranks;
  /** Highest level index that may be played. */
  unlocked: number;
  /** Per level: the three stars as bits (1 finish, 2 chips / no hit, 4 time). */
  stars: number[];
  /** Per level: best clear time in seconds (0 = never cleared). */
  times: number[];
  scores: number[];
  abilities: AbilityId[];
  tutorial: boolean;
  runs: number;
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(MAX_RANK, Math.floor(Number(m.ranks?.[u]) || 0)));
  const n = LEVELS.length;
  const arr = (a: unknown, f: (v: number) => number): number[] => Array.from({ length: n }, (_, i) => f(Number((a as number[] | undefined)?.[i]) || 0));
  return {
    gears: Math.max(0, Math.floor(Number(m.gears) || 0)),
    ranks,
    unlocked: Math.max(0, Math.min(n - 1, Math.floor(Number(m.unlocked) || 0))),
    stars: arr(m.stars, (v) => v & 7),
    times: arr(m.times, (v) => Math.max(0, v)),
    scores: arr(m.scores, (v) => Math.max(0, Math.floor(v))),
    abilities: ABILITY_IDS.filter((a) => (m.abilities ?? []).includes(a)),
    tutorial: !!m.tutorial,
    runs: Math.max(0, Number(m.runs) || 0),
  };
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

export const starCount = (bits: number): number => (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
export const totalStars = (m: Meta): number => m.stars.reduce((s, b) => s + starCount(b), 0);

/** The next rank's price, or null when maxed. */
export function nextPrice(m: Meta, u: UpgradeId): number | null {
  const r = m.ranks[u];
  return r >= MAX_RANK ? null : UPGRADE[u].price[r];
}

export function buy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  if (p === null || p > m.gears) return false;
  m.gears -= p;
  m.ranks[u]++;
  saveMeta(m);
  return true;
}
