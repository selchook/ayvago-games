// Skull Isle: the game's tuning and definitions (pure: the simulation, the bot and the headless
// balance run read them, so nothing here imports Phaser or three.js).

export type Mode = 'easy' | 'normal';
export type HeroId = 'anne' | 'henry' | 'mako' | 'sharky' | 'barbarossa';
export type FoeKind = 'skel' | 'runner' | 'thrower' | 'brute' | 'tentacle' | 'shark' | 'arm' | 'head' | 'captain' | 'hunter';
export type PowerId = 'rum' | 'keg' | 'parrot' | 'shield' | 'gold2' | 'fury' | 'fish';
/** Powers with a timer (HUD chips with a ring); keg is held, fish heals at once. */
export const TIMED_POWERS = ['rum', 'parrot', 'shield', 'gold2', 'fury'] as const;
export type TimedPower = (typeof TIMED_POWERS)[number];
export type Cause = FoeKind | 'skull' | 'cannon' | 'barrel' | 'tide' | 'ink' | 'drown';

export const DT = 1 / 60;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Smallest signed difference between two angles. */
export const angDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** A small seeded generator (mulberry32): the run's randomness, the same on every machine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ difficulty

export interface Tuning {
  /** Player max HP factor. */
  hp: number;
  /** Enemy speed factor. */
  speed: number;
  /** Enemies per wave and on screen at once. */
  count: number;
  /** Telegraph (red warning) length factor: longer is easier. */
  tele: number;
  /** Damage the player takes. */
  hurt: number;
  /** Coin magnet radius factor. */
  magnet: number;
  /** Enemy HP factor. */
  foeHp: number;
  /** How fast the islands ramp up: island k plays like 1 + k × ramp. */
  ramp: number;
  /** Doubloons earned (Easy runs are practice). */
  doubloons: number;
  /** The ship's hull factor, the hull damage taken at sea and how many foes a sea leg brings. */
  hull: number;
  seaHurt: number;
  seaCount: number;
  /** A sunk ship: the share of gold lost, and of max HP the hero loses washing ashore. */
  sinkGold: number;
  sinkHurt: number;
  /** Breath factor in deep water. */
  breath: number;
}

/** Normal and Easy side by side (new-game skill §7c). */
export const TUNING: Record<Mode, Tuning> = {
  normal: { hp: 1, speed: 1, count: 1, tele: 1, hurt: 1, magnet: 1, foeHp: 1, ramp: 1, doubloons: 1, hull: 1, seaHurt: 1, seaCount: 1, sinkGold: 0.25, sinkHurt: 0.15, breath: 1 },
  easy: { hp: 1.25, speed: 0.9, count: 0.88, tele: 1.3, hurt: 0.86, magnet: 1.7, foeHp: 0.92, ramp: 1, doubloons: 0.5, hull: 1.3, seaHurt: 0.75, seaCount: 0.85, sinkGold: 0.1, sinkHurt: 0.05, breath: 1.35 },
};

// ------------------------------------------------------------------ heroes

export interface HeroDef {
  id: HeroId;
  hp: number;
  speed: number;
  dmg: number;
  atkSpeed: number;
  dodgeCd: number;
  gold: number;
  special: number;
  /** Seconds of parrot at the start of every island (Barbarossa's Ernest). */
  parrot: number;
  /** HUD / UI accent. */
  color: number;
}

export const HEROES: HeroDef[] = [
  { id: 'anne', hp: 100, speed: 1, dmg: 1.18, atkSpeed: 0.92, dodgeCd: 1, gold: 1, special: 1, parrot: 0, color: 0xe2553f },
  { id: 'henry', hp: 105, speed: 1, dmg: 1, atkSpeed: 1, dodgeCd: 1, gold: 1.3, special: 1, parrot: 0, color: 0xf2b134 },
  { id: 'mako', hp: 90, speed: 1.04, dmg: 0.96, atkSpeed: 1.2, dodgeCd: 1, gold: 1, special: 1, parrot: 0, color: 0x6aa6d8 },
  { id: 'sharky', hp: 92, speed: 1.16, dmg: 1, atkSpeed: 1.05, dodgeCd: 0.75, gold: 1, special: 1, parrot: 0, color: 0x4cc9b0 },
  { id: 'barbarossa', hp: 130, speed: 0.97, dmg: 1.08, atkSpeed: 1, dodgeCd: 1, gold: 1, special: 1.25, parrot: 10, color: 0xb83a2e },
];
export const HERO: Record<HeroId, HeroDef> = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<HeroId, HeroDef>;
export const HERO_IDS = HEROES.map((h) => h.id);

// ------------------------------------------------------------------ the player

export const PLAYER = {
  hp: 100,
  speed: 5.6,
  radius: 0.45,
  dmg: 14,
  crit: 0.05,
  magnet: 2.2,
  dodgeCd: 0.85,
  dodgeTime: 0.34,
  dodgeSpeed: 13,
  /** Invulnerable for this long from the start of a roll. */
  dodgeIframes: 0.3,
  hurtInvuln: 0.75,
  combo: 3,
  /** The combo chain window after a step ends. */
  chain: 0.32,
  /** Special meter per pip, and what a point of damage dealt adds to it. */
  pip: 100,
  charge: 0.42,
  kegsMax: 3,
};

export interface StepDef {
  anim: 'Sword' | 'Punch';
  /** Seconds (before the attack-speed factor), the moment it hits, damage factor. */
  dur: number;
  hit: number;
  dmg: number;
  /** Hit area: arc (radians, ≥ 2π = all round) and reach. */
  arc: number;
  range: number;
  kb: number;
  /** Forward step while swinging (units). */
  lunge: number;
  spin?: boolean;
}

const A: StepDef = { anim: 'Sword', dur: 0.4, hit: 0.15, dmg: 1, arc: 2.3, range: 2.15, kb: 3, lunge: 1.1 };
const B: StepDef = { anim: 'Punch', dur: 0.36, hit: 0.13, dmg: 0.85, arc: 1.9, range: 1.95, kb: 2.5, lunge: 0.9 };
const C: StepDef = { anim: 'Sword', dur: 0.4, hit: 0.15, dmg: 1.1, arc: 2.4, range: 2.2, kb: 3.5, lunge: 1.1 };
const D: StepDef = { anim: 'Punch', dur: 0.36, hit: 0.13, dmg: 1, arc: 2, range: 2, kb: 3, lunge: 0.9 };
const FIN: StepDef = { anim: 'Sword', dur: 0.56, hit: 0.24, dmg: 1.9, arc: Math.PI * 2.1, range: 2.7, kb: 7.5, lunge: 0.5, spin: true };

/** The steps of a combo of n hits: the first n − 1 of A B C D, then the spinning finisher. */
export function comboSteps(n: number): StepDef[] {
  return [...[A, B, C, D].slice(0, Math.max(1, n - 1)), FIN];
}

// ------------------------------------------------------------------ foes

export interface FoeDef {
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  gold: number;
  score: number;
  /** Threat cost in a wave's budget. */
  cost: number;
  /** Takes a stagger only from finishers, specials and kegs. */
  poise: boolean;
  /** Knockback taken (lower = heavier). */
  kb: number;
}

export const FOES: Record<FoeKind, FoeDef> = {
  skel: { hp: 48, speed: 2.8, dmg: 13, r: 0.45, gold: 2, score: 50, cost: 1, poise: false, kb: 1 },
  runner: { hp: 30, speed: 4.5, dmg: 15, r: 0.45, gold: 3, score: 60, cost: 1.4, poise: false, kb: 1.2 },
  thrower: { hp: 36, speed: 2.5, dmg: 15, r: 0.45, gold: 4, score: 70, cost: 1.6, poise: false, kb: 1 },
  brute: { hp: 210, speed: 2.2, dmg: 26, r: 0.75, gold: 10, score: 160, cost: 4.5, poise: true, kb: 0.35 },
  tentacle: { hp: 120, speed: 0, dmg: 24, r: 0.6, gold: 8, score: 140, cost: 3, poise: true, kb: 0 },
  shark: { hp: 44, speed: 0, dmg: 22, r: 0.7, gold: 6, score: 120, cost: 0, poise: true, kb: 0.2 },
  arm: { hp: 240, speed: 0, dmg: 24, r: 0.8, gold: 15, score: 400, cost: 0, poise: true, kb: 0 },
  head: { hp: 1150, speed: 0, dmg: 26, r: 2.2, gold: 60, score: 3000, cost: 0, poise: true, kb: 0 },
  captain: { hp: 1150, speed: 3.1, dmg: 24, r: 0.95, gold: 60, score: 3500, cost: 0, poise: true, kb: 0.15 },
  /** A shark hunting a swimmer in deep water. */
  hunter: { hp: 44, speed: 0, dmg: 13, r: 0.7, gold: 6, score: 120, cost: 0, poise: true, kb: 0.2 },
};

// ------------------------------------------------------------------ islands

export type IslandId = 'cove' | 'docks' | 'kraken' | 'village' | 'reef';
export const ISLAND_IDS: IslandId[] = ['cove', 'docks', 'kraken', 'village', 'reef'];

export interface IslandDef {
  id: IslandId;
  /** Foe kinds the waves draw from (and from which wave on). */
  pool: [FoeKind, number][];
  waves: number;
  boss: 'kraken' | 'captain' | null;
  sharks: boolean;
  tentacles: boolean;
  barrels: boolean;
  cannon: boolean;
  tide: boolean;
}

export const ISLANDS: Record<IslandId, IslandDef> = {
  cove: { id: 'cove', pool: [['skel', 0], ['runner', 1], ['thrower', 2]], waves: 3, boss: null, sharks: true, tentacles: false, barrels: false, cannon: false, tide: false },
  docks: { id: 'docks', pool: [['skel', 0], ['runner', 0], ['thrower', 1], ['tentacle', 1]], waves: 3, boss: null, sharks: false, tentacles: true, barrels: true, cannon: false, tide: false },
  kraken: { id: 'kraken', pool: [['skel', 0], ['runner', 0], ['thrower', 0], ['tentacle', 0]], waves: 2, boss: 'kraken', sharks: true, tentacles: true, barrels: false, cannon: false, tide: false },
  village: { id: 'village', pool: [['skel', 0], ['runner', 0], ['thrower', 0], ['brute', 0]], waves: 3, boss: null, sharks: false, tentacles: false, barrels: true, cannon: true, tide: false },
  reef: { id: 'reef', pool: [['skel', 0], ['runner', 0], ['thrower', 0], ['brute', 0], ['tentacle', 1]], waves: 2, boss: 'captain', sharks: true, tentacles: true, barrels: false, cannon: false, tide: true },
};

/** Island k of the run (0-based; endless after the fifth, every lap harder). */
export const islandOf = (k: number): IslandDef => ISLANDS[ISLAND_IDS[k % ISLAND_IDS.length]];
export const lapOf = (k: number): number => Math.floor(k / ISLAND_IDS.length);

// ------------------------------------------------------------------ power-ups

export const POWER_TIME: Record<TimedPower, number> = { rum: 8, parrot: 15, shield: 12, gold2: 15, fury: 10 };
export const SHIELD_HITS = 3;
export const FISH_HEAL = 25;
/** Chance weights of a random power-up drop. */
export const POWER_WEIGHTS: [PowerId, number][] = [['rum', 3], ['keg', 4], ['parrot', 2], ['shield', 2], ['gold2', 2], ['fury', 3], ['fish', 4]];
export const POWER_IDS: PowerId[] = POWER_WEIGHTS.map(([p]) => p);
/** Hero/UI colours of the powers (chips, rings, glows). */
export const POWER_COLOR: Record<PowerId, number> = {
  rum: 0xffa94d, keg: 0xff5a3c, parrot: 0x6fe36a, shield: 0x7fe8ff, gold2: 0xffd23f, fury: 0xff4f7b, fish: 0x9fd8ff,
};

// ------------------------------------------------------------------ the sea (voyages between islands)

export type Route = 'calm' | 'storm';
export const ROUTES: Route[] = ['calm', 'storm'];
export type SeaKind = 'rowboat' | 'sloop' | 'ghost' | 'tentacle' | 'shark';
export type FloatKind = 'barrel' | 'crate' | 'bottle' | 'chest';
export type SeaPower = 'wind' | 'chain' | 'mermaid' | 'fire' | 'spyglass';
export const SEA_POWERS: SeaPower[] = ['wind', 'chain', 'mermaid', 'fire', 'spyglass'];
export type SeaCause = 'rowboat' | 'sloop' | 'ghost' | 'tentacle' | 'shark' | 'rock';

/** A sea foe: hit points, damage to the hull, hit radius, score and its cost in a leg's budget (its loot floats where it sinks). */
export interface SeaFoeDef { hp: number; dmg: number; r: number; score: number; cost: number }
export const SEA_FOES: Record<SeaKind, SeaFoeDef> = {
  rowboat: { hp: 40, dmg: 8, r: 1.4, score: 80, cost: 1 },
  sloop: { hp: 150, dmg: 12, r: 2.4, score: 300, cost: 2.6 },
  ghost: { hp: 640, dmg: 11, r: 3, score: 2000, cost: 0 },
  tentacle: { hp: 90, dmg: 18, r: 0.9, score: 150, cost: 1.5 },
  shark: { hp: 30, dmg: 8, r: 1, score: 100, cost: 1 },
};

export const SEA = {
  /** Half the width of the sea lane the ship sails in. */
  lane: 7.5,
  /** Leg lengths (units) by route; the ship makes about 6.2 units a second. */
  length: { calm: 265, storm: 300 } as Record<Route, number>,
  speed: 6.2,
  /** Sideways speed at full stick. */
  side: 7,
  /** Hull damage of a rock. */
  rock: 12,
  /** Evade: a quick sideways dash with a moment of safety. */
  evadeCd: 2.2,
  evadeTime: 0.34,
  evadeSpeed: 15,
  /** Broadside reach and the arc each side covers (from 25° to 155° off the bow). */
  range: 17,
  /** Where the ship stops at the island, offshore of its south beach. */
  dockOff: 4.6,
  /** No new encounters in the last stretch before the island. */
  arrive: 58,
};

export const SEA_POWER_TIME: Record<SeaPower, number> = { wind: 9, chain: 10, mermaid: 6, fire: 10, spyglass: 14 };
export const SEA_POWER_WEIGHTS: [SeaPower, number][] = [['wind', 3], ['chain', 3], ['mermaid', 3], ['fire', 3], ['spyglass', 2]];
export const SEA_POWER_COLOR: Record<SeaPower, number> = { wind: 0xbff6ff, chain: 0xc8c8d8, mermaid: 0x5affd8, fire: 0xff7a2a, spyglass: 0xffe27a };
/** Mermaid's Blessing: hull back at once (share of max) and a repair over its time (per second). */
export const MERMAID = { now: 0.3, regen: 4 };

/** Deep water on the islands: past this distance off the shore the hero swims (and can go 9 units out). */
export const SWIM = { in: 0.6, out: 0.35, reach: 9, speed: 0.6, breath: 9, drain: 4, refill: 3 };
