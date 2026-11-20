// Astro Crew: what lasts between runs, in the core storage: the crystals (every mission's haul goes
// in; base modules are paid from it), the module ranks, the last crew member flown, how far the
// campaign is unlocked, the stars of every planet and the first-time hints seen.
import { storage } from '@core';
import { HERO, HERO_IDS, MISSIONS, type HeroId } from './defs';
import { UPGRADE, UPGRADE_IDS, MAX_RANK, noRanks, type Ranks, type UpgradeId } from './powers';

const KEY = 'astro-crew:meta';

export interface Meta {
  crystals: number;
  ranks: Ranks;
  crew: HeroId;
  /** The highest mission that can be flown (1 to 12); 13 once the campaign is beaten. */
  unlocked: number;
  /** Stars per mission (0 to 3). */
  stars: number[];
  runs: number;
  coached: boolean;
  /** The 1.2 hints (FIRE is held now) were shown. */
  fireCoached: boolean;
  /** Missions cleared in total (for the summary's joins). */
  cleared: number;
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(MAX_RANK, Math.floor(Number(m.ranks?.[u]) || 0)));
  const stars = MISSIONS.map((_, i) => Math.max(0, Math.min(3, Math.floor(Number(m.stars?.[i]) || 0))));
  return {
    crystals: Math.max(0, Math.floor(Number(m.crystals) || 0)),
    ranks,
    crew: m.crew && (HERO_IDS as readonly string[]).includes(m.crew) ? m.crew : 'frog',
    unlocked: Math.max(1, Math.min(MISSIONS.length + 1, Math.floor(Number(m.unlocked) || 1))),
    stars,
    runs: Math.max(0, Number(m.runs) || 0),
    coached: !!m.coached,
    fireCoached: !!m.fireCoached,
    cleared: Math.max(0, Number(m.cleared) || 0),
  };
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

/** A crew member is unlocked once the mission before it is cleared. */
export const crewOpen = (m: Meta, id: HeroId): boolean => m.unlocked > HERO[id].unlock;

/** The next rank's price, or null when maxed. */
export function nextPrice(m: Meta, u: UpgradeId): number | null {
  const r = m.ranks[u];
  return r >= MAX_RANK ? null : UPGRADE[u].price[r];
}

export function buy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  if (p === null || p > m.crystals) return false;
  m.crystals -= p;
  m.ranks[u]++;
  saveMeta(m);
  return true;
}
