// Trap Trail: the numbers. The hero's feel (run, jump, dash, coyote time, jump buffer), Easy beside
// Normal in one table, the four worlds' looks, the upgrades of the shop and the timed powers.

/** Fixed simulation step (the sim runs at 60 Hz whatever the frame rate). */
export const DT = 1 / 60;

/** The hero's body: a box this wide (both ways) and tall, its feet at y. */
export const HERO_R = 0.3;
export const HERO_H = 1.3;

/** Movement in metres and seconds. */
export const MOVE = {
  run: 6.4,
  accGround: 58,
  accAir: 30,
  decGround: 52,
  /** Ice: slow to start, slow to stop. */
  accIce: 11,
  decIce: 3.2,
  gravity: 34,
  /** Falling faster than rising, capped. */
  fallGravity: 1.25,
  maxFall: 24,
  jump: 11.6,
  /** Letting go of JUMP while rising keeps this much of the upward speed (short hops). */
  jumpCut: 0.45,
  airJump: 10.4,
  /** Climbs ledges up to this high without a jump (stairs, bridge planks). */
  stepUp: 0.42,
  dashSpeed: 15.5,
  dashTime: 0.17,
  bounce: 18.5,
  knock: 7.5,
  knockUp: 7,
  /** Invulnerable after a hit. */
  hurtTime: 1.25,
  /** Below this the hero has fallen off the course. */
  voidDepth: 12,
};

export interface Tuning {
  /** Half-hearts at the start (before upgrades). */
  hp: number;
  /** Hazards move and spin at this rate. */
  pace: number;
  /** Cannons, droppers and rollers wait this much longer between shots. */
  fireGap: number;
  /** Spike traps warn this much longer before they rise. */
  warn: number;
  /** A fall off the course costs this many half-hearts. */
  fallCost: number;
  coyote: number;
  buffer: number;
}

/** Normal and Easy side by side (Easy: more health, slower traps, longer warnings, softer falls). */
export const TUNING: Record<'normal' | 'easy', Tuning> = {
  normal: { hp: 6, pace: 1, fireGap: 1, warn: 1, fallCost: 2, coyote: 0.1, buffer: 0.13 },
  easy: { hp: 8, pace: 0.8, fireGap: 1.35, warn: 1.5, fallCost: 1, coyote: 0.15, buffer: 0.17 },
};

// ------------------------------------------------------------------ worlds

export type WorldId = 'meadow' | 'canyon' | 'frost' | 'storm';
export const WORLD_IDS: WorldId[] = ['meadow', 'canyon', 'frost', 'storm'];

export interface WorldLook {
  sky: number;
  fog: number;
  /** Sky gradient for the backdrop (top, horizon). */
  skyTop: number;
  hemi: [number, number, number];
  sun: [number, number];
}

export const WORLDS: Record<WorldId, WorldLook> = {
  meadow: {
    sky: 0x8fd6ff, fog: 0xcdeeff, skyTop: 0x4aa6f0,
    hemi: [0xeaf8ff, 0x8a7a5a, 1.7], sun: [0xfff4e0, 2.3],
  },
  canyon: {
    sky: 0xffc996, fog: 0xffe4c4, skyTop: 0xf08a5a,
    hemi: [0xfff0dc, 0x9a6040, 1.6], sun: [0xffe2b8, 2.4],
  },
  frost: {
    sky: 0xbfe6ff, fog: 0xe6f4ff, skyTop: 0x7ab8ee,
    hemi: [0xf4fbff, 0x7088a8, 1.75], sun: [0xf2f8ff, 2.1],
  },
  storm: {
    sky: 0x58508a, fog: 0x6e6698, skyTop: 0x241f45,
    hemi: [0xb8b0e8, 0x403a50, 1.55], sun: [0xd8d0ff, 1.9],
  },
};

// ------------------------------------------------------------------ pickups and powers

export type GemKind = 'green' | 'blue' | 'pink';
export const GEM_POINTS: Record<GemKind, number> = { green: 100, blue: 250, pink: 500 };

export type PowerId = 'thunder' | 'shield' | 'magnet' | 'spring';
export const POWER_IDS: PowerId[] = ['thunder', 'shield', 'magnet', 'spring'];
/** Seconds each power lasts (the shield lasts until it takes a hit). */
export const POWER_TIME: Record<PowerId, number> = { thunder: 6, shield: 0, magnet: 12, spring: 12 };
/** Thunder: run and dash faster, nothing hurts, hazards touched break. */
export const THUNDER_SPEED = 1.45;
/** Magnet: coins and gems this close fly to the hero. */
export const MAGNET_RANGE = 6.5;
/** Spring: jumps this much higher and one more jump in the air. */
export const SPRING_JUMP = 1.22;
export const POWER_COLOR: Record<PowerId, number> = { thunder: 0xffd23a, shield: 0x5ac8ff, magnet: 0xff5a6a, spring: 0x7ae05a };

// ------------------------------------------------------------------ the shop

export type UpgradeId = 'heart' | 'double' | 'dash' | 'magnet' | 'thunder' | 'shield';
export const UPGRADE_IDS: UpgradeId[] = ['heart', 'double', 'dash', 'magnet', 'thunder', 'shield'];

export interface UpgradeDef {
  prices: number[];
  icon: string;
}

/** Each rank's price in coins (the number of prices is the number of ranks). */
export const UPGRADE: Record<UpgradeId, UpgradeDef> = {
  heart: { prices: [100, 220, 380], icon: 'heart' },
  double: { prices: [220], icon: 'spring' },
  dash: { prices: [80, 160, 280], icon: 'dash' },
  magnet: { prices: [60, 140, 240], icon: 'magnet' },
  thunder: { prices: [80, 160, 260], icon: 'thunder' },
  shield: { prices: [140, 300], icon: 'shield' },
};

export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ heart: 0, double: 0, dash: 0, magnet: 0, thunder: 0, shield: 0 });

/** What the ranks do. */
export const dashCooldown = (r: Ranks): number => [0.9, 0.65, 0.55, 0.45][r.dash];
export const airDashes = (r: Ranks): number => (r.dash >= 2 ? 2 : 1);
export const dashShield = (r: Ranks): boolean => r.dash >= 3;
export const magnetRange = (r: Ranks): number => [0, 1.8, 2.8, 3.8][r.magnet];
export const thunderTime = (r: Ranks): number => POWER_TIME.thunder + r.thunder * 1.5;
export const airJumps = (r: Ranks): number => (r.double >= 1 ? 1 : 0);

// ------------------------------------------------------------------ scoring

export const SCORE = {
  coin: 10,
  star: 300,
  clear: 500,
  perWorld: 250,
  noHit: 750,
  /** Points per second under the stage's par time. */
  perSecond: 25,
};
/** Coins paid out on a clear (on top of the coins picked up), and for each new star. */
export const CLEAR_COINS = (world: number): number => 10 + world * 5;
export const STAR_COINS = 10;
