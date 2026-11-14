// Zombie Grove: what carries over from run to run: the coin purse, the camp upgrades (a few levels
// each), the weapons unlocked for the drafts and the heroes. Pure rules (the balance run uses
// them); save.ts keeps a Meta in the core storage.
import { HEROES, WEAPON_IDS, type HeroId, type WeaponId } from './defs';

export type UpgradeId = 'might' | 'vitality' | 'swiftness' | 'lodestone' | 'greed' | 'reroll' | 'secondWind';
export const UPGRADE_IDS: UpgradeId[] = ['might', 'vitality', 'swiftness', 'lodestone', 'greed', 'reroll', 'secondWind'];

export interface UpgradeDef { max: number; cost: number[] }
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  might: { max: 5, cost: [30, 60, 100, 150, 220] },
  vitality: { max: 5, cost: [25, 50, 85, 130, 190] },
  swiftness: { max: 3, cost: [40, 90, 160] },
  lodestone: { max: 3, cost: [25, 55, 100] },
  greed: { max: 3, cost: [50, 110, 200] },
  reroll: { max: 2, cost: [60, 140] },
  secondWind: { max: 1, cost: [300] },
};

/** Weapons that start locked (the blade and the bow are always in the drafts). */
export const WEAPON_COST: Partial<Record<WeaponId, number>> = { blaster: 120, wards: 160, torch: 220, robot: 320 };

export interface Meta {
  coins: number;
  up: Partial<Record<UpgradeId, number>>;
  weapons: WeaponId[];
  heroes: HeroId[];
  hero: HeroId;
  runs: number;
  wins: number;
  /** Coins earned in all (stats). */
  earned: number;
}

/** What the camp gives a run. */
export interface MetaFx {
  dmgK: number;
  hp: number;
  speedK: number;
  magnetK: number;
  coinK: number;
  rerolls: number;
  revives: number;
  weapons: WeaponId[];
  hero: HeroId;
}

export const NO_META: MetaFx = {
  dmgK: 1, hp: 0, speedK: 1, magnetK: 1, coinK: 1, rerolls: 0, revives: 0, weapons: ['blade', 'bow', 'spear'], hero: 'survivor',
};

export const lvl = (m: Meta, id: UpgradeId): number => m.up[id] ?? 0;

export function metaFx(m: Meta): MetaFx {
  return {
    dmgK: 1 + 0.07 * lvl(m, 'might'),
    hp: 12 * lvl(m, 'vitality'),
    speedK: 1 + 0.05 * lvl(m, 'swiftness'),
    magnetK: 1 + 0.2 * lvl(m, 'lodestone'),
    coinK: 1 + 0.2 * lvl(m, 'greed'),
    rerolls: lvl(m, 'reroll'),
    revives: lvl(m, 'secondWind'),
    weapons: m.weapons,
    hero: m.hero,
  };
}

/** Everything bought: the balance run's "full camp". */
export function fullMeta(hero: HeroId = 'survivor'): MetaFx {
  const m = freshMeta();
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) m.up[id] = UPGRADES[id].max;
  m.weapons = ['blade', 'bow', 'spear', 'blaster', 'wards', 'torch', 'robot'];
  m.hero = hero;
  return metaFx(m);
}

/** Rebuilds a Meta from stored data, dropping anything unknown. */
export function cleanMeta(raw: Partial<Meta>): Meta {
  const m = freshMeta();
  m.coins = Math.max(0, Math.floor(raw.coins ?? 0));
  for (const id of UPGRADE_IDS) {
    const v = raw.up?.[id];
    if (typeof v === 'number') m.up[id] = Math.max(0, Math.min(UPGRADES[id].max, Math.floor(v)));
  }
  for (const w of raw.weapons ?? []) if (WEAPON_IDS.includes(w) && !m.weapons.includes(w)) m.weapons.push(w);
  for (const h of raw.heroes ?? []) if (h in HEROES && !m.heroes.includes(h)) m.heroes.push(h);
  m.hero = raw.hero && m.heroes.includes(raw.hero) ? raw.hero : 'survivor';
  m.runs = raw.runs ?? 0;
  m.wins = raw.wins ?? 0;
  m.earned = raw.earned ?? 0;
  return m;
}

export function freshMeta(): Meta {
  return { coins: 0, up: {}, weapons: ['blade', 'bow', 'spear'], heroes: ['survivor'], hero: 'survivor', runs: 0, wins: 0, earned: 0 };
}

/** Price of the next level of an upgrade (null when maxed). */
export function upgradeCost(m: Meta, id: UpgradeId): number | null {
  const n = lvl(m, id);
  return n >= UPGRADES[id].max ? null : UPGRADES[id].cost[n];
}

export function buyUpgrade(m: Meta, id: UpgradeId): boolean {
  const c = upgradeCost(m, id);
  if (c === null || m.coins < c) return false;
  m.coins -= c;
  m.up[id] = lvl(m, id) + 1;
  return true;
}

export function buyWeapon(m: Meta, id: WeaponId): boolean {
  const c = WEAPON_COST[id];
  if (c === undefined || m.weapons.includes(id) || m.coins < c) return false;
  m.coins -= c;
  m.weapons.push(id);
  return true;
}

/** Buys a hero (or picks one already owned). */
export function chooseHero(m: Meta, id: HeroId): 'picked' | 'bought' | 'poor' {
  if (!m.heroes.includes(id)) {
    if (m.coins < HEROES[id].cost) return 'poor';
    m.coins -= HEROES[id].cost;
    m.heroes.push(id);
    m.hero = id;
      return 'bought';
  }
  m.hero = id;
  return 'picked';
}

/** Coins a finished run earns on top of what was picked up. */
export function runBonus(kills: number, seconds: number, won: boolean, bosses: number): number {
  return Math.floor(kills / 30) + Math.floor(seconds / 20) + bosses * 8 + (won ? 40 : 0);
}

export function bankRun(m: Meta, coins: number, won: boolean): void {
  m.coins += coins;
  m.earned += coins;
  m.runs++;
  if (won) m.wins++;
}
