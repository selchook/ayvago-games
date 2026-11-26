// Moon Rover: the numbers. The rover's low-gravity feel, Easy beside Normal in one table, the four
// regions' looks, the five powers, the hangar's ranked upgrades and paint skins, and the scoring.
// Everything is in metres and seconds; the sim (sim.ts) runs at a fixed 60 Hz.

export const DT = 1 / 60;

/** One tile of the kit's terrain grid, in metres (the kit's 1-unit tiles drawn 4 m wide). */
export const TILE = 4;
/** One terrain level, in metres (the kit's ramp rises half a tile). */
export const STEP = 2;
/** Moon gravity, game-tuned: floaty but not slow (m/s²). */
export const GRAV = 5.2;

export const ROVER = {
  /** Motor push (m/s²) and top speed (m/s) before upgrades. */
  acc: 8.5,
  top: 13,
  /** Reverse. */
  revAcc: 6,
  revTop: 5,
  /** Braking (m/s²) and rolling friction with no pedal. */
  brake: 15,
  roll: 1.4,
  /** Heading change at full lock (rad/s) once rolling. */
  turn: 2.05,
  /** How fast sideways sliding dies away on firm ground (1/s). */
  grip: 9,
  /** Collision circle (m) and the wheel contacts (half wheelbase, half track). */
  radius: 1.05,
  halfL: 0.95,
  halfT: 0.8,
  /** A step up this tall is climbed; a taller one is a wall (m). */
  stepMax: 0.75,
  /** The body's height for hits (m). */
  height: 2.2,
  /** Air steering share. */
  airSteer: 0.35,
};

/**
 * Air control: the nose eases toward a target pitch (radians, nose up positive): GAS holds it a
 * little up (a clean landing on flat ground), BRAKE dips it (for a downslope), neither lets it follow
 * the flight path (nose down on the way down).
 */
export const AIR = { gas: 0.1, brake: -0.62, spring: 7, damp: 4.2 };

/** Landing quality by the angle between the rover and the ground (radians). */
export const LAND = {
  perfect: 0.21,
  good: 0.5,
  /** Over this the rover flips (Normal). */
  flip: 0.8,
  /** The impact speed (m/s) that counts as a big landing (shake and hit-stop). */
  big: 7.5,
};

/** Battery: units per second. */
export const BATTERY = {
  /** Systems always on while driving. */
  idle: 0.22,
  /** Extra while the motor pulls (GAS or reverse). */
  motor: 0.8,
  /** Extra while BOOST burns. */
  boost: 1.2,
  /** A charging pad refills this much per second. */
  charge: 30,
  /** Seconds on a pad for each half heart it repairs. */
  repair: 2.2,
};

export interface Tuning {
  /** Hearts at the start of a level (each heart is two halves). */
  hearts: number;
  /** Battery units when full (before upgrades). */
  battery: number;
  /** Battery drain multiplier. */
  drain: number;
  /** Meteors: warning time before impact (s) and the gap between them (×). */
  warn: number;
  meteorGap: number;
  /** Turret bolts' speed (m/s) and the gap between shots (×). */
  bolt: number;
  fireGap: number;
  /** The rogue miner's top speed share of the rover's base top speed. */
  miner: number;
  /** A landing at more than this angle flips the rover (radians). */
  flip: number;
  /** Flips cost half a heart (Normal) or only time (Easy). */
  flipHurts: boolean;
  /** Escape countdowns get this many more seconds. */
  extraTime: number;
}

/** Normal and Easy side by side (Easy: more hearts and battery, slower meteors and bolts, forgiving landings). */
export const TUNING: Record<'normal' | 'easy', Tuning> = {
  normal: { hearts: 3, battery: 100, drain: 1, warn: 1.7, meteorGap: 1, bolt: 8, fireGap: 1, miner: 0.78, flip: LAND.flip, flipHurts: true, extraTime: 0 },
  easy: { hearts: 5, battery: 135, drain: 0.8, warn: 2.4, meteorGap: 1.5, bolt: 6, fireGap: 1.45, miner: 0.66, flip: 1.05, flipHurts: false, extraTime: 25 },
};

// ------------------------------------------------------------------ regions

export const REGION_IDS = ['plains', 'canyon', 'polar', 'dark'] as const;
export type RegionId = typeof REGION_IDS[number];

export interface RegionLook {
  /** The sky and the fog (the far terrain fades into space). */
  sky: number;
  fogNear: number;
  fogFar: number;
  /** Terrain colours: the regolith, its dark cliffs, the road tracks, ice and dust patches. */
  rock: number;
  rockDark: number;
  road: number;
  ice: number;
  dust: number;
  /** Crystal colour (samples and fields). */
  crystal: number;
  /** Hemisphere sky / ground and intensity; the sun's colour and intensity. */
  hemi: [number, number, number];
  sun: [number, number];
  /** The Earth's size in the sky (0 hides it: the Dark Side). */
  earth: number;
  /** Stars' brightness. */
  stars: number;
}

export const REGIONS: Record<RegionId, RegionLook> = {
  plains: { sky: 0x05070e, fogNear: 70, fogFar: 150, rock: 0xbdbcc0, rockDark: 0x7d7c84, road: 0xd8d6d2, ice: 0xd6ecff, dust: 0xc8b8a0, crystal: 0x45e0ff, hemi: [0xb8c4e0, 0x3a3a44, 1.25], sun: [0xfff6e8, 2.2], earth: 1, stars: 1 },
  canyon: { sky: 0x070512, fogNear: 60, fogFar: 135, rock: 0xa49caf, rockDark: 0x5e566e, road: 0xc8c0cc, ice: 0xd0e4ff, dust: 0xb8a898, crystal: 0xc070ff, hemi: [0xb0a8d8, 0x302a40, 1.2], sun: [0xffeedd, 2.1], earth: 0.8, stars: 1 },
  polar: { sky: 0x050a14, fogNear: 65, fogFar: 145, rock: 0xc8d0dc, rockDark: 0x7e8a9c, road: 0xe4e8ee, ice: 0xbfe6ff, dust: 0xd0d4dc, crystal: 0x5cf0c8, hemi: [0xc8dcf8, 0x3a4458, 1.3], sun: [0xf0f6ff, 2.1], earth: 1.2, stars: 0.9 },
  dark: { sky: 0x020208, fogNear: 50, fogFar: 120, rock: 0x8a8a98, rockDark: 0x4a4a58, road: 0xa8a8b4, ice: 0xa8c8f0, dust: 0x8a8278, crystal: 0xff6ad0, hemi: [0x8090c8, 0x20202c, 1.0], sun: [0xc8d4ff, 1.25], earth: 0, stars: 1.4 },
};

// ------------------------------------------------------------------ powers

export const POWER_IDS = ['boost', 'shield', 'magnet', 'hover', 'emp'] as const;
export type PowerId = typeof POWER_IDS[number];
export const POWER_COLOR: Record<PowerId, number> = { boost: 0xff8a2a, shield: 0x4ab8ff, magnet: 0xff4a7a, hover: 0x7affc8, emp: 0xc890ff };
/** Seconds each lasts (before the Lasting Powers upgrade); EMP freezes turrets and the miner this long. */
export const POWER_TIME: Record<PowerId, number> = { boost: 3.6, shield: 8, magnet: 10, hover: 8, emp: 6 };
export const POWER = {
  /** Boost: more push and a higher top speed. */
  boostAcc: 2.1,
  boostTop: 1.45,
  /** Magnet: crystals within this radius fly to the rover (metres, before upgrades). */
  magnetR: 15,
  /** Hover jets: gravity share in the air while they burn. */
  hoverGrav: 0.32,
  /** EMP: reach (metres). */
  empR: 40,
};

// ------------------------------------------------------------------ the hangar

export const UPGRADE_IDS = ['battery', 'motor', 'grip', 'seats', 'powers', 'magnet'] as const;
export type UpgradeId = typeof UPGRADE_IDS[number];
export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ battery: 0, motor: 0, grip: 0, seats: 0, powers: 0, magnet: 0 });

export const UPGRADE: Record<UpgradeId, { prices: number[] }> = {
  battery: { prices: [60, 140, 260] },
  motor: { prices: [80, 170, 300] },
  grip: { prices: [60, 140, 260] },
  seats: { prices: [110, 240] },
  powers: { prices: [70, 150, 270] },
  magnet: { prices: [60, 150] },
};

/** What the ranks do. */
export const RANK = {
  battery: [1, 1.2, 1.4, 1.6],
  motor: [1, 1.08, 1.16, 1.24],
  /** Grip: sideways hold and extra landing tolerance (radians). */
  grip: [1, 1.25, 1.5, 1.75],
  gripLand: [0, 0.07, 0.14, 0.21],
  seats: [2, 3, 4],
  powers: [1, 1.25, 1.5, 1.75],
  /** Magnet: the power's radius and a small always-on pick-up reach. */
  magnet: [1, 1.35, 1.7],
  reach: [0, 0.8, 1.6],
};

/** Rover paint, unlocked with stars: the accent (the kit's orange) and the body colour. */
export const SKINS = [
  { id: 'orange', stars: 0, accent: 0xffa033, body: 0xd6dbe8 },
  { id: 'white', stars: 6, accent: 0x3a9cff, body: 0xf4f6fa },
  { id: 'green', stars: 14, accent: 0x5ad66a, body: 0xd6dbe8 },
  { id: 'red', stars: 24, accent: 0xff4a40, body: 0xe6e6ea },
  { id: 'night', stars: 36, accent: 0xb070ff, body: 0x5a5e6e },
  { id: 'gold', stars: 50, accent: 0xffd040, body: 0xfff2c8 },
] as const;
export type SkinId = typeof SKINS[number]['id'];

// ------------------------------------------------------------------ scoring and credits

export const SCORE = {
  crystal: 50,
  astronaut: 300,
  delivery: 200,
  alien: 600,
  perfect: 150,
  good: 40,
  /** Points per second in the air for a landing that is not a flip. */
  airSecond: 60,
  generator: 250,
  clear: 1000,
  perRegion: 250,
  star: 300,
  parSecond: 15,
  unharmed: 400,
};
export const CREDITS = { crystal: 4, astronaut: 18, delivery: 12, alien: 60, generator: 15 };
export const CLEAR_CREDITS = (region: number): number => 35 + region * 12;
export const STAR_CREDITS = 15;
