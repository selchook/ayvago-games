// Last Convoy: what lasts between runs, in the core storage: scrap and supplies (the garage is paid
// from them), the upgrade ranks, the survivors freed so far and the one last played, the dog, how
// far the campaign is unlocked, the stars of every mission, Last Stand's best wave and the
// first-time hints already shown.
import { storage, playerCharacter } from '@core';
import { HERO_IDS, MISSIONS, START_HERO, type HeroId } from './defs';
import { UPGRADE, UPGRADE_IDS, MAX_RANK, noRanks, type Ranks, type UpgradeId } from './powers';
import type { DogKind } from './sim';

const KEY = 'last-convoy:meta';

export interface Meta {
  scrap: number;
  supplies: number;
  ranks: Ranks;
  /** The survivors in the squad (the first one from the player's platform character). */
  heroes: HeroId[];
  hero: HeroId;
  dog: DogKind;
  /** The pug joins once the docks are cleared (mission 6). */
  pug: boolean;
  /** The highest mission that can be played (1 to 12); 13 once the campaign is beaten. */
  unlocked: number;
  stars: number[];
  bestWave: number;
  runs: number;
  /** The tutorial of mission 1 and the drive's were seen; the combo hints shown. */
  tutorial: boolean;
  driveTaught: boolean;
  hints: string[];
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(MAX_RANK, Math.floor(Number(m.ranks?.[u]) || 0)));
  const first = START_HERO[playerCharacter()] ?? 'sam';
  const heroes = (Array.isArray(m.heroes) ? m.heroes : []).filter((h): h is HeroId => (HERO_IDS as readonly string[]).includes(h));
  if (!heroes.length) heroes.push(first);
  const hero = m.hero && heroes.includes(m.hero) ? m.hero : heroes[0];
  return {
    scrap: Math.max(0, Math.floor(Number(m.scrap) || 0)),
    supplies: Math.max(0, Math.floor(Number(m.supplies) || 0)),
    ranks,
    heroes: [...new Set(heroes)],
    hero,
    dog: m.dog === 'pug' && m.pug ? 'pug' : 'shepherd',
    pug: !!m.pug,
    unlocked: Math.max(1, Math.min(MISSIONS.length + 1, Math.floor(Number(m.unlocked) || 1))),
    stars: MISSIONS.map((_, i) => Math.max(0, Math.min(3, Math.floor(Number(m.stars?.[i]) || 0)))),
    bestWave: Math.max(0, Math.floor(Number(m.bestWave) || 0)),
    runs: Math.max(0, Number(m.runs) || 0),
    tutorial: !!m.tutorial,
    driveTaught: !!m.driveTaught,
    hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === 'string').slice(0, 40) : [],
  };
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

/** The next rank's price (scrap, supplies), or null when maxed. */
export function nextPrice(m: Meta, u: UpgradeId): [number, number] | null {
  const r = m.ranks[u];
  return r >= MAX_RANK ? null : [UPGRADE[u].scrap[r], UPGRADE[u].supplies[r]];
}

export function canBuy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  return !!p && p[0] <= m.scrap && p[1] <= m.supplies;
}

export function buy(m: Meta, u: UpgradeId): boolean {
  const p = nextPrice(m, u);
  if (!p || p[0] > m.scrap || p[1] > m.supplies) return false;
  m.scrap -= p[0];
  m.supplies -= p[1];
  m.ranks[u]++;
  saveMeta(m);
  return true;
}

/** Last Stand opens once mission 2 is cleared (the basics are taught by then). */
export const standOpen = (m: Meta): boolean => m.unlocked > 2;
