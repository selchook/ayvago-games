// Zombie Grove: what carries over from run to run: the coin purse, the camp upgrades (a few levels
// each), the weapons unlocked for the drafts, the heroes and the records their milestones read.
// Pure rules (the balance run uses them); save.ts keeps a Meta in the core storage.
import { HEROES, HERO_IDS, WEAPON_IDS, ENDLESS, type HeroId, type WeaponId, type Milestone } from './defs';

export type UpgradeId =
  | 'might' | 'vitality' | 'swiftness' | 'lodestone' | 'greed' | 'reroll' | 'secondWind'
  | 'toughness' | 'growth' | 'precision' | 'breadth' | 'quickHands' | 'drill' | 'banish' | 'curse';
export const UPGRADE_IDS: UpgradeId[] = [
  'might', 'vitality', 'toughness', 'swiftness', 'precision', 'breadth', 'quickHands', 'growth',
  'lodestone', 'greed', 'reroll', 'banish', 'drill', 'secondWind', 'curse',
];

export interface UpgradeDef {
  max: number;
  cost: number[];
  /** The effect at a level, as the number its text shows ({v}). */
  v: (lv: number) => number;
}
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  might: { max: 5, cost: [30, 60, 100, 150, 220], v: (n) => 7 * n },
  vitality: { max: 5, cost: [25, 50, 85, 130, 190], v: (n) => 12 * n },
  toughness: { max: 3, cost: [80, 160, 260], v: (n) => 3 * n },
  swiftness: { max: 3, cost: [40, 90, 160], v: (n) => 5 * n },
  precision: { max: 2, cost: [80, 180], v: (n) => 2 * n },
  breadth: { max: 2, cost: [90, 200], v: (n) => 4 * n },
  quickHands: { max: 2, cost: [100, 220], v: (n) => 2 * n },
  growth: { max: 3, cost: [50, 110, 190], v: (n) => 4 * n },
  lodestone: { max: 3, cost: [25, 55, 100], v: (n) => 20 * n },
  greed: { max: 3, cost: [50, 110, 200], v: (n) => 20 * n },
  reroll: { max: 2, cost: [60, 140], v: (n) => n },
  banish: { max: 3, cost: [60, 120, 200], v: (n) => n },
  drill: { max: 1, cost: [240], v: (n) => 1 + n },
  secondWind: { max: 1, cost: [300], v: (n) => n },
  // opt-in and free: a tap sets the next level (and from the top back to off)
  curse: { max: 3, cost: [0, 0, 0], v: (n) => 25 * n },
};

/** The Curse: per level, more zombies and tougher ones, and more coins. */
export const CURSE = { horde: 0.15, hp: 0.15, dmg: 0.08, coins: 0.25 };

/** Weapons that start locked (the blade, the bow and the spear are always in the drafts). */
export const WEAPON_COST: Partial<Record<WeaponId, number>> = { blaster: 120, wards: 160, torch: 220, shield: 260, robot: 320 };
export const LOCKABLE: WeaponId[] = ['blaster', 'wards', 'torch', 'shield', 'robot'];

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
  /** Records the heroes' milestones read: best level and longest night (s), zombies in all. */
  bestLevel: number;
  bestTime: number;
  kills: number;
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
  /** Damage taken multiplier (Toughness). */
  takenK: number;
  xpK: number;
  /** Extra crit chance. */
  crit: number;
  areaK: number;
  /** Cooldown multiplier. */
  cdK: number;
  /** Levels the hero's own weapon starts at. */
  startLv: number;
  banishes: number;
  /** Curse level (0–3). */
  curse: number;
  weapons: WeaponId[];
  hero: HeroId;
}

export const NO_META: MetaFx = {
  dmgK: 1, hp: 0, speedK: 1, magnetK: 1, coinK: 1, rerolls: 0, revives: 0, takenK: 1, xpK: 1, crit: 0, areaK: 1, cdK: 1,
  startLv: 1, banishes: 0, curse: 0, weapons: ['blade', 'bow', 'spear'], hero: 'survivor',
};

export const lvl = (m: Meta, id: UpgradeId): number => m.up[id] ?? 0;

export function metaFx(m: Meta): MetaFx {
  const L = (id: UpgradeId) => UPGRADES[id].v(lvl(m, id));
  const curse = lvl(m, 'curse');
  return {
    dmgK: 1 + L('might') / 100,
    hp: L('vitality'),
    speedK: 1 + L('swiftness') / 100,
    magnetK: 1 + L('lodestone') / 100,
    coinK: (1 + L('greed') / 100) * (1 + CURSE.coins * curse),
    rerolls: L('reroll'),
    revives: L('secondWind'),
    takenK: 1 - L('toughness') / 100,
    xpK: 1 + L('growth') / 100,
    crit: L('precision') / 100,
    areaK: 1 + L('breadth') / 100,
    cdK: 1 - L('quickHands') / 100,
    startLv: L('drill'),
    banishes: L('banish'),
    curse,
    weapons: m.weapons,
    hero: m.hero,
  };
}

/** Everything bought: the balance run's "full camp" (the Curse at `curse`, off by default). */
export function fullMeta(hero: HeroId = 'survivor', curse = 0): MetaFx {
  const m = freshMeta();
  for (const id of UPGRADE_IDS) m.up[id] = UPGRADES[id].max;
  m.up.curse = curse;
  m.weapons = [...WEAPON_IDS];
  m.hero = hero;
  return metaFx(m);
}

/** The camp as it was in 1.0 (its seven upgrades at their top): the balance run's comparison. */
export function oldFullMeta(): MetaFx {
  const m = freshMeta();
  for (const id of ['might', 'vitality', 'swiftness', 'lodestone', 'greed', 'reroll', 'secondWind'] as UpgradeId[]) m.up[id] = UPGRADES[id].max;
  m.weapons = ['blade', 'bow', 'spear', 'blaster', 'wards', 'torch', 'robot'];
  return metaFx(m);
}

/** Rebuilds a Meta from stored data, dropping anything unknown (1.0 saves keep everything). */
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
  m.bestLevel = raw.bestLevel ?? 0;
  m.bestTime = raw.bestTime ?? 0;
  m.kills = raw.kills ?? 0;
  return m;
}

export function freshMeta(): Meta {
  return { coins: 0, up: {}, weapons: ['blade', 'bow', 'spear'], heroes: ['survivor'], hero: 'survivor', runs: 0, wins: 0, earned: 0, bestLevel: 0, bestTime: 0, kills: 0 };
}

/** Price of the next level of an upgrade (null when maxed; the Curse is free and cycles). */
export function upgradeCost(m: Meta, id: UpgradeId): number | null {
  const n = lvl(m, id);
  if (id === 'curse') return 0;
  return n >= UPGRADES[id].max ? null : UPGRADES[id].cost[n];
}

export function buyUpgrade(m: Meta, id: UpgradeId): boolean {
  if (id === 'curse') { m.up.curse = (lvl(m, 'curse') + 1) % (UPGRADES.curse.max + 1); return true; }
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

/** How far a milestone is: [have, need]. */
export function milestoneProgress(m: Meta, ms: Milestone): [number, number] {
  const have = ms.kind === 'level' ? m.bestLevel : ms.kind === 'time' ? Math.floor(m.bestTime) : m.wins;
  return [Math.min(have, ms.n), ms.n];
}

export const milestoneMet = (m: Meta, ms: Milestone): boolean => { const [a, b] = milestoneProgress(m, ms); return a >= b; };

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

/** Coins a finished run earns on top of what was picked up (`endless`: seconds past the dawn). */
export function runBonus(kills: number, seconds: number, won: boolean, bosses: number, endless = 0): number {
  return Math.floor(kills / 30) + Math.floor(seconds / 20) + bosses * 8 + (won ? 40 : 0) + Math.floor((endless / 60) * ENDLESS.coinsPerMin);
}

/** Banks a run: coins and records; returns the heroes its milestones just earned. */
export function bankRun(m: Meta, coins: number, won: boolean, rec: { level: number; time: number; kills: number } = { level: 0, time: 0, kills: 0 }): HeroId[] {
  m.coins += coins;
  m.earned += coins;
  m.runs++;
  if (won) m.wins++;
  m.bestLevel = Math.max(m.bestLevel, rec.level);
  m.bestTime = Math.max(m.bestTime, rec.time);
  m.kills += rec.kills;
  const fresh: HeroId[] = [];
  for (const id of HERO_IDS) {
    const ms = HEROES[id].milestone;
    if (ms && !m.heroes.includes(id) && milestoneMet(m, ms)) { m.heroes.push(id); fresh.push(id); }
  }
  return fresh;
}
