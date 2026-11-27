// Monster Roundup: what lasts between runs, in the core storage: the credits (the hangar's upgrades are
// paid from them), the upgrade ranks, how far the levels are unlocked, each level's best stars and
// time, the mech in use (picked at the start of every run) and each mech's paint (stars unlock paints),
// and the hints already shown.
import { storage } from '@core';
import { UPGRADE, UPGRADE_IDS, MECH_IDS, PAINTS, PAINT_IDS, noRanks, type Ranks, type UpgradeId, type MechId, type PaintId } from './defs';
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
  /** Each mech's paint. */
  paint: Record<MechId, PaintId>;
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
    mech: MECH_IDS.find((x) => x === m.mech) ?? 'mike',
    paint: { mike: 'factory', leela: 'factory', stan: 'factory', george: 'factory' },
  };
  for (const id of MECH_IDS) {
    const p = PAINT_IDS.find((x) => x === m.paint?.[id]);
    if (p && paintOpen(out, p)) out.paint[id] = p;
  }
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

/** A paint is open once enough stars are earned. */
export const paintOpen = (m: Meta, p: PaintId): boolean => totalStars(m) >= PAINTS[p].stars;

/** Pilots a mech (every mech is open from the start). */
export function pickMech(m: Meta, id: MechId): void {
  m.mech = id;
  saveMeta(m);
}

/** Paints a mech, if the paint's stars are earned. */
export function pickPaint(m: Meta, id: MechId, p: PaintId): boolean {
  if (!paintOpen(m, p)) return false;
  m.paint[id] = p;
  saveMeta(m);
  return true;
}
