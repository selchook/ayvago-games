// Moon Rover: what lasts between runs, in the core storage: the credits (the hangar's upgrades are
// paid from them), the upgrade ranks, how far the missions are unlocked, each mission's best stars
// and time and whether its hidden alien was found, the rover's paint, and the hints already shown.
import { storage } from '@core';
import { UPGRADE, UPGRADE_IDS, SKINS, noRanks, type Ranks, type UpgradeId, type SkinId } from './defs';
import { LEVEL_COUNT } from './levels';

const KEY = 'moon-rover:meta';

export interface StageBest {
  /** Which of the three stars were ever earned (bit 0..2). */
  stars: number;
  /** Best time in seconds (0 = never cleared). */
  time: number;
  alien: boolean;
}

export interface Meta {
  credits: number;
  ranks: Ranks;
  /** The highest mission that can be played (1..20); 21 once every one is cleared. */
  unlocked: number;
  best: StageBest[];
  /** The last mission picked on the map. */
  last: number;
  runs: number;
  hints: string[];
  skin: SkinId;
}

export function cleanMeta(m: Partial<Meta>): Meta {
  const ranks = noRanks();
  for (const u of UPGRADE_IDS) ranks[u] = Math.max(0, Math.min(UPGRADE[u].prices.length, Math.floor(Number(m.ranks?.[u]) || 0)));
  const best: StageBest[] = [];
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const b = m.best?.[i];
    best.push({ stars: Math.max(0, Math.min(7, Math.floor(Number(b?.stars) || 0))), time: Math.max(0, Number(b?.time) || 0), alien: !!b?.alien });
  }
  const unlocked = Math.max(1, Math.min(LEVEL_COUNT + 1, Math.floor(Number(m.unlocked) || 1)));
  const out: Meta = {
    credits: Math.max(0, Math.floor(Number(m.credits) || 0)),
    ranks,
    unlocked,
    best,
    last: Math.max(1, Math.min(Math.min(unlocked, LEVEL_COUNT), Math.floor(Number(m.last) || 1))),
    runs: Math.max(0, Math.floor(Number(m.runs) || 0)),
    hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === 'string').slice(0, 40) : [],
    skin: 'orange',
  };
  const sk = SKINS.find((s) => s.id === m.skin);
  if (sk && totalStars(out) >= sk.stars) out.skin = sk.id;
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

/** The rover's paint, if unlocked by stars. */
export function paint(m: Meta, id: SkinId): boolean {
  const s = SKINS.find((x) => x.id === id);
  if (!s || totalStars(m) < s.stars) return false;
  m.skin = id;
  saveMeta(m);
  return true;
}
