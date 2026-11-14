// Skull Isle: everything that makes the pirate stronger (pure, read by the simulation, the bot and
// the balance run).
//   - the dock shop between islands: the island's loot buys levels of seven upgrades and a patch-up;
//   - the boons: a free pick of one of three after every boss;
//   - the meta board: Doubloons earned by every run buy ten lasting nodes, plus Barbarossa.
import { HERO, PLAYER, type HeroId } from './defs';

// ------------------------------------------------------------------ the dock shop

export type ShopId = 'hp' | 'dmg' | 'combo' | 'dodge' | 'charge' | 'magnet' | 'crit';
export const SHOP_IDS: ShopId[] = ['hp', 'dmg', 'combo', 'dodge', 'charge', 'magnet', 'crit'];
/** Gold for each level of each upgrade (its length is the max level). */
export const SHOP_COST: Record<ShopId, number[]> = {
  hp: [20, 35, 55, 80, 110],
  dmg: [25, 40, 60, 85, 115],
  combo: [45, 90],
  dodge: [20, 35, 55],
  charge: [25, 45, 70],
  magnet: [12, 22, 35],
  crit: [30, 50, 75],
};
/** The patch-up: heals this share of max HP, once per shop, for 12 + 4 × island gold. */
export const PATCH = 0.4;
export const patchCost = (island: number): number => 12 + island * 4;

// ------------------------------------------------------------------ boons (after a boss)

export type BoonId = 'vampire' | 'thunder' | 'ironclad' | 'cursedGold' | 'powder' | 'ernest' | 'rumRunner' | 'quickdraw' | 'whirlwind' | 'secondWind';
export const BOON_IDS: BoonId[] = ['vampire', 'thunder', 'ironclad', 'cursedGold', 'powder', 'ernest', 'rumRunner', 'quickdraw', 'whirlwind', 'secondWind'];

// ------------------------------------------------------------------ the meta board

export type NodeId = 'hardy' | 'whetstone' | 'seaLegs' | 'luckyCoin' | 'nimble' | 'powderMonkey' | 'gunpowder' | 'lootHook' | 'cannonDrill' | 'secondWind';
export interface NodeDef { id: NodeId; cost: number; req?: NodeId; col: number; row: number }
/** Two columns of five; a node below needs the one above it. */
export const NODES: NodeDef[] = [
  { id: 'hardy', cost: 8, col: 0, row: 0 },
  { id: 'whetstone', cost: 10, req: 'hardy', col: 0, row: 1 },
  { id: 'nimble', cost: 12, req: 'whetstone', col: 0, row: 2 },
  { id: 'gunpowder', cost: 16, req: 'nimble', col: 0, row: 3 },
  { id: 'secondWind', cost: 26, req: 'gunpowder', col: 0, row: 4 },
  { id: 'seaLegs', cost: 8, col: 1, row: 0 },
  { id: 'luckyCoin', cost: 10, req: 'seaLegs', col: 1, row: 1 },
  { id: 'lootHook', cost: 12, req: 'luckyCoin', col: 1, row: 2 },
  { id: 'powderMonkey', cost: 16, req: 'lootHook', col: 1, row: 3 },
  { id: 'cannonDrill', cost: 22, req: 'powderMonkey', col: 1, row: 4 },
];
export const NODE: Record<NodeId, NodeDef> = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, NodeDef>;
export const ALL_NODES: NodeId[] = NODES.map((n) => n.id);
/** Barbarossa: free once the Kraken falls, or bought on the board. */
export const BARBAROSSA_COST = 40;

/** What a run starts with: the hero, the meta nodes and (in the run) shop levels and boons. */
export interface Loadout {
  hero: HeroId;
  nodes: NodeId[];
}

/** The player's numbers for a run at a moment: hero × meta × shop levels × boons. */
export interface Stats {
  maxHp: number;
  speed: number;
  dmg: number;
  atkSpeed: number;
  crit: number;
  dodgeCd: number;
  combo: number;
  charge: number;
  magnet: number;
  gold: number;
  hurt: number;
  /** Special pips: 1 (pistol) or 2 (the cannon barrage unlocked). */
  pips: number;
  kegsStart: number;
  /** Kegs given at the start of every wave (boon). */
  kegsPerWave: number;
  parrotStart: number;
  lifesteal: number;
  thunder: boolean;
  rumK: number;
  whirlwind: boolean;
  secondWinds: number;
}

/**
 * The run's stats. `island` (0-based) unlocks the cannon barrage at the third island (from the
 * start with Cannon Drill).
 */
export function stats(load: Loadout, shop: Partial<Record<ShopId, number>>, boons: readonly BoonId[], island: number, hpK: number, magnetK: number): Stats {
  const h = HERO[load.hero];
  const has = (n: NodeId) => load.nodes.includes(n);
  const lv = (s: ShopId) => shop[s] ?? 0;
  const b = (id: BoonId) => boons.filter((x) => x === id).length;
  return {
    maxHp: Math.round((h.hp + (has('hardy') ? 15 : 0) + lv('hp') * 20) * hpK),
    speed: PLAYER.speed * h.speed * (has('seaLegs') ? 1.08 : 1),
    dmg: PLAYER.dmg * h.dmg * (has('whetstone') ? 1.1 : 1) * (1 + lv('dmg') * 0.12),
    atkSpeed: h.atkSpeed * (1 + b('quickdraw') * 0.15),
    crit: PLAYER.crit + lv('crit') * 0.06,
    dodgeCd: PLAYER.dodgeCd * h.dodgeCd * (has('nimble') ? 0.85 : 1) * (1 - lv('dodge') * 0.14),
    combo: PLAYER.combo + lv('combo'),
    charge: h.special * (has('gunpowder') ? 1.25 : 1) * (1 + lv('charge') * 0.22),
    magnet: (PLAYER.magnet + (has('lootHook') ? 1 : 0) + lv('magnet') * 1) * magnetK,
    gold: h.gold * (has('luckyCoin') ? 1.15 : 1) * (1 + b('cursedGold') * 0.5),
    hurt: Math.pow(0.85, b('ironclad')),
    pips: has('cannonDrill') || island >= 2 ? 2 : 1,
    kegsStart: has('powderMonkey') ? 2 : 0,
    kegsPerWave: b('powder'),
    parrotStart: h.parrot + b('ernest') * 8,
    lifesteal: b('vampire') * 1.2,
    thunder: b('thunder') > 0,
    rumK: 1 + b('rumRunner'),
    whirlwind: b('whirlwind') > 0,
    secondWinds: (has('secondWind') ? 1 : 0) + b('secondWind'),
  };
}

/** Doubloons for a run: gold / 40, a foe in 15, 3 per island cleared, 8 per boss (Easy: half, rounded up). */
export function doubloonsFor(goldEarned: number, islands: number, bosses: number, k: number, kills = 0): number {
  const base = Math.floor(goldEarned / 40) + Math.floor(kills / 15) + 3 * islands + 8 * bosses;
  return Math.ceil(base * k);
}
