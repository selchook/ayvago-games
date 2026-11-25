// Relic Ruins: the numbers. The hero's feel, the torch, Easy beside Normal in one table, the four
// worlds' moods, the powers, the upgrades of the shop and the scoring.

/** Fixed simulation step (the sim runs at 60 Hz whatever the frame rate). */
export const DT = 1 / 60;

/** One cell of the pack's grid, in metres (a wall piece is 2 × 2 m). */
export const CELL = 2;
/** A raised floor (one flight of the pack's stairs) stands this high. */
export const RAISE = 0.92;
/** The walls' height as drawn (the pack's 2 m walls, squashed a little so corridors stay readable). */
export const WALL_H = 1.7;

/** The hero: a circle this wide on the floor, this tall as drawn. */
export const HERO_R = 0.32;
export const HERO_H = 1.3;

export const MOVE = {
  walk: 4.6,
  acc: 34,
  dec: 40,
  /** Pushing a crate: walk into it this long, then it slides one cell in this time. */
  pushWait: 0.22,
  pushTime: 0.42,
  /** Statues are heavier. */
  statueTime: 0.7,
  /** A roll: this fast for this long, then a short recovery. */
  rollSpeed: 9.5,
  rollTime: 0.36,
  rollCd: 0.75,
  /** Invulnerable after a hit; knocked back this fast. */
  hurtTime: 1.25,
  knock: 7.5,
  /** A bear trap holds the hero this long. */
  trapHold: 1.1,
  /** How far ACT reaches (metres from the hero's centre to the thing). */
  reach: 1.55,
};

export interface Tuning {
  /** Half-hearts at the start (before upgrades). */
  hp: number;
  /** Torch burned per second (out of 100). */
  burn: number;
  /** Creatures move at this rate. */
  pace: number;
  /** Candles burn this long once lit. */
  candle: number;
  /** A pit costs this many half-hearts. */
  fallCost: number;
  /** The torch going out costs this many half-hearts. */
  darkCost: number;
  /** Escape timers are this much longer. */
  escape: number;
  /** Seconds of grace when the torch dies (reach a light to save it). */
  grace: number;
}

/** Normal and Easy side by side (Easy: more hearts, a slower burn, slower creatures, longer candles). */
export const TUNING: Record<'normal' | 'easy', Tuning> = {
  normal: { hp: 6, burn: 1.55, pace: 1, candle: 17, fallCost: 2, darkCost: 2, escape: 1, grace: 2.5 },
  easy: { hp: 10, burn: 1.05, pace: 0.72, candle: 25, fallCost: 1, darkCost: 1, escape: 1.3, grace: 4 },
};

/** The light round the hero: radius in metres from an empty torch to a full one. */
export const LIGHT_MIN = 2.6;
export const LIGHT_MAX = 8.5;
/** A lit sconce or brazier refills the torch this fast (per second) within this distance. */
export const WARM_RATE = 30;
export const WARM_R = 2.6;

// ------------------------------------------------------------------ worlds

export type WorldId = 'courtyard' | 'library' | 'halls' | 'citadel';
export const WORLD_IDS: WorldId[] = ['courtyard', 'library', 'halls', 'citadel'];

export interface WorldLook {
  /** The void's colour (around the ruin and down the pits). */
  bg: number;
  /** Sky light from above and the ground's bounce, its strength. */
  hemi: [number, number, number];
  /** The moon: a dim directional light. */
  moon: [number, number];
  /** Tints multiplied into the kit's stone: floors, walls, wall tops. */
  floor: number;
  wall: number;
  cap: number;
  /** The torch flame's colour. */
  flame: number;
  /** Dust, embers and spores floating in the air. */
  mote: number;
  /** The pits: dark water in the library, a deep shaft elsewhere. */
  water: boolean;
  /** The torch burns this much faster here (the deeper the ruin, the hungrier the dark). */
  burn: number;
}

export const WORLDS: Record<WorldId, WorldLook> = {
  courtyard: { bg: 0x0c1418, hemi: [0x9ac0d8, 0x2a3a24, 0.9], moon: [0xa8c8ff, 0.55], floor: 0xc8ccbc, wall: 0xc4c8b4, cap: 0x4a5040, flame: 0xffa040, mote: 0xb8f070, water: false, burn: 0.85 },
  library: { bg: 0x081420, hemi: [0x7aa8d0, 0x1a2838, 0.82], moon: [0x8ab8ff, 0.5], floor: 0xb4bcc8, wall: 0xb0b8c4, cap: 0x3c4248, flame: 0xffb050, mote: 0xa8d8ff, water: true, burn: 1 },
  halls: { bg: 0x100a18, hemi: [0x9a88c8, 0x281c30, 0.75], moon: [0xb8a0ff, 0.45], floor: 0xb4acbc, wall: 0xb0a8bc, cap: 0x3e3848, flame: 0xffa848, mote: 0xd0b0ff, water: false, burn: 1.12 },
  citadel: { bg: 0x180a06, hemi: [0xd0a080, 0x382014, 0.8], moon: [0xffb080, 0.5], floor: 0xccb8a4, wall: 0xc8b4a0, cap: 0x4a3c30, flame: 0xff9030, mote: 0xffa040, water: false, burn: 1.22 },
};

// ------------------------------------------------------------------ powers

export type PowerId = 'flare' | 'oil' | 'boots' | 'compass' | 'ghost';
export const POWER_IDS: PowerId[] = ['flare', 'oil', 'boots', 'compass', 'ghost'];
/** The timed powers (flares are carried, oil is used at once). */
export const TIMED: PowerId[] = ['boots', 'compass', 'ghost'];
/** Seconds each timed power lasts (before the Long Powers upgrade). */
export const POWER_TIME: Record<'boots' | 'compass' | 'ghost', number> = { boots: 10, compass: 16, ghost: 7 };
export const POWER_COLOR: Record<PowerId, number> = { flare: 0xff5a3a, oil: 0xffc040, boots: 0x5ad0ff, compass: 0x7ae05a, ghost: 0xc89aff };
/** Swift Boots: this much faster. */
export const BOOTS_SPEED = 1.4;
/** Lantern Oil: this much torch back. */
export const OIL = 60;
/** A flare stuns creatures this close, this long, and lights everything for a while. */
export const FLARE_R = 9;
export const FLARE_STUN = 4;
export const FLARE_LIGHT = 3.2;
export const MAX_FLARES = 3;

// ------------------------------------------------------------------ the shop

export type UpgradeId = 'reservoir' | 'wick' | 'heart' | 'stride' | 'powers' | 'flare';
export const UPGRADE_IDS: UpgradeId[] = ['reservoir', 'wick', 'heart', 'stride', 'powers', 'flare'];

export interface UpgradeDef {
  prices: number[];
}

/** Each rank's price in coins (the number of prices is the number of ranks). */
export const UPGRADE: Record<UpgradeId, UpgradeDef> = {
  reservoir: { prices: [70, 150, 260] },
  wick: { prices: [80, 170, 290] },
  heart: { prices: [120, 260] },
  stride: { prices: [60, 130, 230] },
  powers: { prices: [70, 150, 250] },
  flare: { prices: [110, 240] },
};

export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ reservoir: 0, wick: 0, heart: 0, stride: 0, powers: 0, flare: 0 });

/** What the ranks do. */
export const torchMax = (r: Ranks): number => 100 + r.reservoir * 20;
export const burnScale = (r: Ranks): number => 1 - r.wick * 0.12;
export const extraHp = (r: Ranks): number => r.heart * 2;
export const strideScale = (r: Ranks): number => 1 + r.stride * 0.07;
export const pushScale = (r: Ranks): number => 1 - r.stride * 0.15;
export const powerScale = (r: Ranks): number => 1 + r.powers * 0.25;
export const startFlares = (r: Ranks): number => r.flare;

// ------------------------------------------------------------------ scoring

export const SCORE = {
  coin: 10,
  gem: 150,
  relic: 1000,
  clear: 500,
  perWorld: 250,
  star: 300,
  noHit: 500,
  /** Points per second under the level's par time. */
  perSecond: 20,
  pot: 20,
};
/** Coins paid out on a clear (on top of the coins picked up), and for each new star. */
export const CLEAR_COINS = (world: number): number => 12 + world * 6;
export const STAR_COINS = 10;
