// Dungeon Rescue: what lasts between runs, in the core storage: the coins (the hideout's upgrades are
// paid from them), the upgrade ranks, how far the dungeon is unlocked, each level's best stars, time
// and whether its hidden chest was found, the crew (every prisoner ever freed), the two companions
// who lend the knight their skills, the knight's armour, and the first-time hints already shown.
import { storage } from '@core';
import { UPGRADE, UPGRADE_IDS, CREW, COMPANIONS, LOOKS, noRanks, type Ranks, type UpgradeId, type LookId } from './defs';
import { LEVEL_COUNT } from './levels';

const KEY = 'dungeon-rescue:meta';

export interface StageBest {
  /** Which of the three stars were ever earned (bit 0..2). */
  stars: number;
  /** Best time in seconds (0 = never cleared). */
  time: number;
  chest: boolean;
}

export interface Meta {
  coins: number;
  ranks: Ranks;
  /** The highest level that can be played (1..20); 21 once every level is cleared. */
  unlocked: number;
  best: StageBest[];
  /** The last level picked on the map. */
  last: number;
  runs: number;
  hints: string[];
  /** The crew: every prisoner freed, by figure id. */
  crew: string[];
  /** The companions chosen in the hideout (crew ids). */
  companions: string[];
  look: LookId;
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(UPGRADE[u].prices.length, Math.floor(Number(m.ranks?.[u]) || 0)));
  const best: StageBest[] = [];
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const b = m.best?.[i];
    best.push({ stars: Math.max(0, Math.min(7, Math.floor(Number(b?.stars) || 0))), time: Math.max(0, Number(b?.time) || 0), chest: !!b?.chest });
  }
  const unlocked = Math.max(1, Math.min(LEVEL_COUNT + 1, Math.floor(Number(m.unlocked) || 1)));
  const crew = Array.isArray(m.crew) ? [...new Set(m.crew.filter((c) => typeof c === 'string' && CREW[c]))] : [];
  const companions = Array.isArray(m.companions) ? m.companions.filter((c) => crew.includes(c)).slice(0, COMPANIONS) : [];
  const out: Meta = {
    coins: Math.max(0, Math.floor(Number(m.coins) || 0)),
    ranks,
    unlocked,
    best,
    last: Math.max(1, Math.min(Math.min(unlocked, LEVEL_COUNT), Math.floor(Number(m.last) || 1))),
    runs: Math.max(0, Math.floor(Number(m.runs) || 0)),
    hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === 'string').slice(0, 40) : [],
    crew,
    companions,
    look: 'knight',
  };
  const look = LOOKS.find((l) => l.id === m.look);
  if (look && totalStars(out) >= look.stars) out.look = look.id;
  return out;
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

/** Adds or removes a companion (two at most: a third replaces the oldest). */
export function toggleCompanion(m: Meta, id: string): void {
  if (!m.crew.includes(id)) return;
  if (m.companions.includes(id)) m.companions = m.companions.filter((c) => c !== id);
  else { m.companions = [...m.companions, id].slice(-COMPANIONS); }
  saveMeta(m);
}

/** The knight's armour, if unlocked by stars. */
export function wear(m: Meta, id: LookId): boolean {
  const l = LOOKS.find((x) => x.id === id);
  if (!l || totalStars(m) < l.stars) return false;
  m.look = id;
  saveMeta(m);
  return true;
}
