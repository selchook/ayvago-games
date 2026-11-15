// Coaster Rush: what carries over between rides, kept in the core storage: tokens (the currency),
// the upgrade levels, the paints and trails bought and the ones in use, whether the first-run
// tutorial was done, which power-ups and moments the player has met (each gets a one-line hint
// the first time) and the best area reached.
import { storage } from '@core';
import { POWERS, type Power } from './defs';
import { NO_UPGRADES, UPGRADES, UPGRADE_IDS, type Upgrades } from './upgrades';

export interface Paint { id: string; hue: number; price: number; swatch: number }
export interface Trail { id: string; color: number; price: number }

/** Paints turn the train's colours round the hue circle (0: the kit's own red). */
export const PAINTS: Paint[] = [
  { id: 'classic', hue: 0, price: 0, swatch: 0xe8553a },
  { id: 'lime', hue: 95, price: 80, swatch: 0x7ac43a },
  { id: 'ocean', hue: 200, price: 140, swatch: 0x3a8ae8 },
  { id: 'grape', hue: 260, price: 220, swatch: 0x8a4ae0 },
  { id: 'candy', hue: 320, price: 320, swatch: 0xe84aa8 },
  { id: 'gold', hue: 35, price: 450, swatch: 0xf0b030 },
];
export const TRAILS: Trail[] = [
  { id: 'white', color: 0xffffff, price: 0 },
  { id: 'sun', color: 0xffc23a, price: 60 },
  { id: 'mint', color: 0x7dffa0, price: 120 },
  { id: 'sky', color: 0x7fd8ff, price: 180 },
  { id: 'rose', color: 0xff7ad8, price: 260 },
];

export interface Meta {
  tokens: number;
  upgrades: Upgrades;
  paints: string[];
  trails: string[];
  paint: string;
  trail: string;
  tutorial: boolean;
  runs: number;
  best: number;
  /** Things the player has been shown a hint for (power-ups, loops, junctions, lean). */
  seen: string[];
  rideCam: boolean;
}

const KEY = 'coaster-rush:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  const meta: Meta = {
    tokens: Math.max(0, Math.floor(Number(m.tokens) || 0)),
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, Math.max(0, Math.min(UPGRADES[id].length, Math.floor(Number(m.upgrades?.[id] ?? NO_UPGRADES[id]) || 0)))])) as unknown as Upgrades,
    paints: Array.isArray(m.paints) ? m.paints.filter((p) => PAINTS.some((q) => q.id === p)) : ['classic'],
    trails: Array.isArray(m.trails) ? m.trails.filter((p) => TRAILS.some((q) => q.id === p)) : ['white'],
    paint: m.paint ?? 'classic',
    trail: m.trail ?? 'white',
    tutorial: !!m.tutorial,
    runs: m.runs ?? 0,
    best: m.best ?? 0,
    seen: Array.isArray(m.seen) ? m.seen : [],
    rideCam: !!m.rideCam,
  };
  if (!meta.paints.includes('classic')) meta.paints.unshift('classic');
  if (!meta.trails.includes('white')) meta.trails.unshift('white');
  if (!meta.paints.includes(meta.paint)) meta.paint = 'classic';
  if (!meta.trails.includes(meta.trail)) meta.trail = 'white';
  return meta;
}

export function saveMeta(m: Meta): void { storage.set(KEY, m); }

export function lookOf(m: Meta): { paint: number; trail: number } {
  return { paint: PAINTS.find((p) => p.id === m.paint)?.hue ?? 0, trail: TRAILS.find((t) => t.id === m.trail)?.color ?? 0xffffff };
}

export const allPowersSeen = (m: Meta): boolean => POWERS.every((p: Power) => m.seen.includes(p));
