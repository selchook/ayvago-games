// Monster Roundup: the numbers. The mech's feel, Easy beside Normal in one table, the monster
// families and their evolved forms, the four bosses' phases, the five powers, the hangar's ranked
// upgrades and the four mechs, the sectors' looks and the scoring. Metres and seconds; the sim
// (sim.ts) runs at a fixed 60 Hz. One floor tile of the station kit is 2 m; a map block is 4 m.

export const DT = 1 / 60;
/** A map block (two floor tiles a side; one wall piece long). */
export const BLOCK = 4;
/** The fine grid for paths and floor features (one floor tile). */
export const CELL = 2;
/** The station's wall height (the kit's 4.43). */
export const WALL_H = 4.43;

export const MECH = {
  /** Walking and sprinting speed (m/s) before the mech's own factor and upgrades. */
  walk: 4.4,
  sprint: 7.8,
  /** How fast the mech reaches its speed (1/s) on deck, and on ice. */
  accel: 12,
  iceAccel: 2.2,
  /** Collision circle (m). */
  radius: 1.0,
  /** Sprint energy: units, drain per second, refill per second after a short pause. */
  energy: 100,
  drain: 30,
  refill: 24,
  refillDelay: 0.6,
  /** Stun blaster: seconds between quick shots; holding STUN this long charges a big shot. */
  fireGap: 0.3,
  charge: 0.55,
  /** The bolt: speed (m/s), reach (m) and the aim cone the soft assist looks in (radians either side). */
  bolt: 24,
  reach: 13,
  cone: 0.62,
  /** The tractor beam: reach to grab a dizzy monster (m), towed monsters ride this far behind. */
  grab: 4.6,
  towGap: 2.3,
  /** Each towed monster slows the mech this much (share). */
  towSlow: 0.1,
  /** After a hit: seconds of blinking safety and the knock-back speed. */
  safe: 1.1,
  knock: 9,
};

export interface Tuning {
  /** Hull hearts at the start of a level. */
  hull: number;
  /** Seconds a stunned monster stays dizzy (a towed one's clock runs slower). */
  dizzy: number;
  /** Share of the dizzy clock that runs while a monster is towed. */
  towClock: number;
  /** Monster speed multiplier. */
  speed: number;
  /** How fast loose monsters grow toward evolving (×). */
  evolve: number;
  /** Seconds before a monster's attack lands (its telegraph) ×. */
  windup: number;
  /** Laser gates: seconds on and off. */
  laserOn: number;
  laserOff: number;
  /** Sweeping laser: degrees per second. */
  sweep: number;
  /** Bosses: stun bar ×, seconds between attacks ×, projectile speed ×. */
  bossBar: number;
  bossGap: number;
  bossShot: number;
  /** Seconds before a stunned monster's daze points start to come back. */
  regen: number;
}

/** Normal and Easy side by side (Easy: more hull, longer dizzy spells, slower monsters and lasers, gentler bosses). */
export const TUNING: Record<'normal' | 'easy', Tuning> = {
  normal: { hull: 5, dizzy: 7, towClock: 0.35, speed: 1, evolve: 1, windup: 1, laserOn: 2.2, laserOff: 1.7, sweep: 46, bossBar: 1, bossGap: 1, bossShot: 1, regen: 3 },
  easy: { hull: 7, dizzy: 10, towClock: 0.2, speed: 0.85, evolve: 0.6, windup: 1.35, laserOn: 1.6, laserOff: 2.5, sweep: 32, bossBar: 0.75, bossGap: 1.35, bossShot: 0.8, regen: 4.5 },
};

// ------------------------------------------------------------------ monsters

/** How a family moves and what makes it tricky. */
export type Behaviour = 'hopper' | 'runner' | 'flyer' | 'spiky' | 'splitter' | 'blinker' | 'caller' | 'brute';

export const MONSTER_IDS = ['mushnub', 'cat', 'dog', 'chicken', 'green-blob', 'spiky-blob', 'wizard', 'yeti-blob', 'glub', 'armabee', 'goleling', 'dragon'] as const;
export type MonsterId = typeof MONSTER_IDS[number];

export interface MonsterDef {
  /** The model file (public/assets/quaternius/monsters) and its evolved form's (null: it grows instead). */
  model: string;
  evolved: string | null;
  kind: Behaviour;
  /** Daze points: stun hits to make it dizzy (an evolved one has twice as many). */
  hp: number;
  /** Wandering and fleeing speed (m/s). */
  speed: number;
  flee: number;
  /** Height in metres (the model scaled to it) and the collision radius. */
  height: number;
  radius: number;
  /** Does it go for the mech (only once evolved unless true)? */
  bites: boolean;
  /** Points and credits when captured (an evolved one is worth 2.5×). */
  points: number;
  /** Its colour for sparks and the map's icon. */
  color: number;
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  mushnub: { model: 'mushnub', evolved: 'mushnub-evolved', kind: 'hopper', hp: 2, speed: 2.4, flee: 3.6, height: 1.81, radius: 0.69, bites: false, points: 100, color: 0x3aa8d8 },
  cat: { model: 'cat', evolved: null, kind: 'runner', hp: 2, speed: 3, flee: 6.1, height: 1.45, radius: 0.62, bites: false, points: 120, color: 0xffa040 },
  dog: { model: 'dog', evolved: null, kind: 'runner', hp: 3, speed: 3.2, flee: 5.4, height: 1.45, radius: 0.62, bites: true, points: 130, color: 0xd08a4a },
  chicken: { model: 'chicken', evolved: null, kind: 'caller', hp: 2, speed: 2.8, flee: 5.2, height: 1.59, radius: 0.62, bites: false, points: 120, color: 0xffffff },
  'green-blob': { model: 'green-blob', evolved: null, kind: 'splitter', hp: 2, speed: 2.2, flee: 3.4, height: 1.81, radius: 0.75, bites: false, points: 90, color: 0x5ad66a },
  'spiky-blob': { model: 'spiky-blob', evolved: null, kind: 'spiky', hp: 3, speed: 1.9, flee: 2.6, height: 1.96, radius: 0.88, bites: true, points: 170, color: 0x3a8a3a },
  wizard: { model: 'wizard', evolved: null, kind: 'blinker', hp: 3, speed: 2.4, flee: 3.8, height: 1.74, radius: 0.69, bites: false, points: 160, color: 0x7a4ad8 },
  'yeti-blob': { model: 'yeti-blob', evolved: null, kind: 'brute', hp: 4, speed: 2.2, flee: 3.2, height: 1.96, radius: 0.81, bites: true, points: 180, color: 0x8ad0ff },
  glub: { model: 'glub', evolved: 'glub-evolved', kind: 'flyer', hp: 2, speed: 2.6, flee: 4.2, height: 1.45, radius: 0.69, bites: false, points: 150, color: 0xc070ff },
  armabee: { model: 'armabee', evolved: 'armabee-evolved', kind: 'flyer', hp: 2, speed: 3, flee: 4.6, height: 1.38, radius: 0.69, bites: true, points: 160, color: 0xffd040 },
  goleling: { model: 'goleling', evolved: 'goleling-evolved', kind: 'flyer', hp: 3, speed: 2.7, flee: 4.2, height: 1.38, radius: 0.75, bites: false, points: 170, color: 0x9ae04a },
  dragon: { model: 'dragon', evolved: 'dragon-evolved', kind: 'flyer', hp: 3, speed: 3.1, flee: 4.8, height: 1.38, radius: 0.75, bites: true, points: 190, color: 0xff7a3a },
};

/** Flyers cruise this high; a normal bolt glances off them up there (a charged one does not). */
export const FLY_HIGH = 2.1;
/** Loose monsters grow toward evolving by this much each second (×Tuning.evolve) and by SNACK per snack. */
export const EVOLVE_RATE = 1 / 95;
export const EVOLVE_SNACK = 0.42;
/** An evolved monster: daze points ×, speed ×, size ×, points ×. */
export const EVOLVED = { hp: 2, speed: 1.15, size: 1.3, points: 2.5 };

// ------------------------------------------------------------------ bosses

export const BOSS_IDS = ['mushroom-king', 'cactoro', 'yeti', 'alien'] as const;
export type BossId = typeof BOSS_IDS[number];
export type BossAttack = 'slam' | 'leap' | 'volley' | 'ring' | 'charge' | 'lob' | 'summon' | 'blink' | 'beam';

export interface BossDef {
  height: number;
  radius: number;
  speed: number;
  /** Stun bar per phase (a charged bolt deals 3, a quick one 1). */
  bar: number[];
  /** The attacks each phase draws from, in turn. */
  phases: BossAttack[][];
  /** Seconds between attacks (phase 1; later phases are quicker). */
  gap: number;
  /** What it summons. */
  minion: MonsterId;
  color: number;
}

export const BOSSES: Record<BossId, BossDef> = {
  'mushroom-king': { height: 5.22, radius: 1.69, speed: 2.1, bar: [16, 20, 24], phases: [['slam', 'slam'], ['slam', 'summon', 'slam'], ['leap', 'summon', 'slam', 'leap']], gap: 2.6, minion: 'mushnub', color: 0x3aa8d8 },
  cactoro: { height: 5.22, radius: 1.62, speed: 2.2, bar: [18, 22, 26], phases: [['volley', 'volley'], ['charge', 'volley'], ['ring', 'charge', 'volley']], gap: 2.5, minion: 'green-blob', color: 0x5ad66a },
  yeti: { height: 4.93, radius: 1.69, speed: 2.4, bar: [20, 24, 28], phases: [['lob', 'slam'], ['charge', 'lob', 'lob'], ['ring', 'charge', 'lob', 'slam']], gap: 2.4, minion: 'yeti-blob', color: 0x8ad0ff },
  alien: { height: 5.37, radius: 1.62, speed: 2.3, bar: [22, 26, 30], phases: [['beam', 'blink', 'volley'], ['summon', 'beam', 'blink', 'lob'], ['ring', 'blink', 'beam', 'charge', 'summon']], gap: 2.3, minion: 'glub', color: 0xc070ff },
};
/** Between phases the boss is dizzy this long (and cannot be towed); after the last it is dizzy for DIZZY_LAST. */
export const BOSS_DAZE = 3.5;
export const BOSS_DIZZY_LAST = 15;
/** Towing a boss: the mech's speed share. */
export const BOSS_TOW = 0.62;

// ------------------------------------------------------------------ powers

export const POWER_IDS = ['freeze', 'shield', 'spread', 'magnet', 'decoy'] as const;
export type PowerId = typeof POWER_IDS[number];
export const POWER_COLOR: Record<PowerId, number> = { freeze: 0x7ae8ff, shield: 0x4ab8ff, spread: 0xffb03a, magnet: 0xff5a9a, decoy: 0x8aff6a };
/** Seconds each lasts (before the Power Cells upgrade). Freeze is at once: its reach in metres. */
export const POWER_TIME: Record<PowerId, number> = { freeze: 0, shield: 8, spread: 10, magnet: 10, decoy: 7 };
export const POWER = { freezeR: 9.5, magnetR: 13, decoyR: 15 };

// ------------------------------------------------------------------ the hangar

export const UPGRADE_IDS = ['blaster', 'beam', 'stasis', 'hull', 'thrusters', 'cells'] as const;
export type UpgradeId = typeof UPGRADE_IDS[number];
export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ blaster: 0, beam: 0, stasis: 0, hull: 0, thrusters: 0, cells: 0 });

export const UPGRADE: Record<UpgradeId, { prices: number[] }> = {
  blaster: { prices: [80, 180, 320] },
  beam: { prices: [90, 200, 360] },
  stasis: { prices: [70, 170] },
  hull: { prices: [100, 240] },
  thrusters: { prices: [70, 160, 300] },
  cells: { prices: [80, 210] },
};

/**
 * What the ranks do. Blaster: I quicker shots, II the charged shot pierces, III a hit arcs to the
 * next monster. Beam: I longer reach, II tows two, III tows three and towed monsters stay dizzy.
 * Stasis: longer dizzy spells. Hull: a heart each. Thrusters: I more energy, II quicker refill,
 * III a sprinting mech dazes the monsters it rams. Cells: I powers last longer, II every level
 * starts with a power.
 */
export const RANK = {
  fireGap: [1, 0.78, 0.78, 0.7],
  grab: [1, 1.4, 1.4, 1.5],
  tows: [1, 1, 2, 3],
  dizzy: [1, 1.35, 1.7],
  energy: [1, 1.4, 1.4, 1.6],
  refill: [1, 1, 1.6, 1.8],
  cells: [1, 1.4, 1.4],
};

export const MECH_IDS = ['mike', 'leela', 'stan', 'george'] as const;
export type MechId = typeof MECH_IDS[number];

export interface MechDef {
  /** Stars needed to unlock. */
  stars: number;
  /** Height in metres (the model scaled to it). */
  height: number;
  speed: number;
  hull: number;
  /** Extra tow slots, sprint energy ×, charge time ×, bolt daze bonus. */
  tows: number;
  energy: number;
  charge: number;
  power: number;
  /** The colour the hangar and the HUD use for it. */
  color: number;
}

export const MECHS: Record<MechId, MechDef> = {
  mike: { stars: 0, height: 3.4, speed: 1, hull: 0, tows: 0, energy: 1, charge: 1, power: 0, color: 0x4ab0e8 },
  leela: { stars: 8, height: 3.3, speed: 1.17, hull: -1, tows: 0, energy: 1.35, charge: 1, power: 0, color: 0x9aa4b4 },
  stan: { stars: 20, height: 3.5, speed: 0.97, hull: 0, tows: 0, energy: 1, charge: 0.6, power: 1, color: 0xe0483a },
  george: { stars: 36, height: 3.8, speed: 0.92, hull: 2, tows: 1, energy: 0.9, charge: 1.1, power: 0, color: 0x5ab87a },
};

// ------------------------------------------------------------------ sectors

export const SECTOR_IDS = ['lab', 'garden', 'cryo', 'core'] as const;
export type SectorId = typeof SECTOR_IDS[number];

export interface SectorLook {
  /** The kit palette swapped per sector: panels, light trim, dark grey, accent, dark accent, glass. */
  main: number;
  light: number;
  dark: number;
  accent: number;
  darkAccent: number;
  glass: number;
  /** The roof caps over solid blocks and the void colour. */
  cap: number;
  sky: number;
  /** Hemisphere sky / ground and intensity; the key light's colour and intensity. */
  hemi: [number, number, number];
  sun: [number, number];
  /** The capture rings' and beams' colour. */
  glow: number;
}

export const SECTORS: Record<SectorId, SectorLook> = {
  lab: { main: 0xdfe4ea, light: 0xf4f6f8, dark: 0x6e7684, accent: 0xff9a2a, darkAccent: 0xa8581a, glass: 0x10284a, cap: 0x1e2430, sky: 0x0a0e18, hemi: [0xf0f4ff, 0x5a6070, 1.35], sun: [0xfff4e6, 1.6], glow: 0x3ae0c8 },
  garden: { main: 0xdde8d8, light: 0xf2f8ee, dark: 0x5e7262, accent: 0x6ad84a, darkAccent: 0x3a7a2a, glass: 0x0e3a2a, cap: 0x1c2620, sky: 0x08120c, hemi: [0xeaffea, 0x4a5a48, 1.35], sun: [0xfff8e0, 1.55], glow: 0xffd23a },
  cryo: { main: 0xdbe8f4, light: 0xf2f8ff, dark: 0x5a6e86, accent: 0x3ab4ff, darkAccent: 0x1a5a9a, glass: 0x0a2850, cap: 0x1a2232, sky: 0x060c18, hemi: [0xe0f0ff, 0x4a5870, 1.4], sun: [0xe8f4ff, 1.55], glow: 0x7af0ff },
  core: { main: 0xb8bcc8, light: 0xd8dce4, dark: 0x40444e, accent: 0xff4a6a, darkAccent: 0x8a1a34, glass: 0x2a0a26, cap: 0x18161e, sky: 0x08060c, hemi: [0xe8dcff, 0x40384a, 1.2], sun: [0xffd8e8, 1.45], glow: 0xc07aff },
};

// ------------------------------------------------------------------ scoring and credits

export const SCORE = {
  snack: 20,
  clear: 500,
  perSector: 150,
  star: 300,
  parSecond: 10,
  unharmed: 400,
  boss: 2500,
  /** Captures within COMBO_TIME of each other raise the multiplier, up to COMBO_MAX. */
  comboTime: 6,
  comboMax: 4,
  crate: 15,
};
export const CREDITS = { capture: 5, evolved: 12, boss: 80, snack: 1 };
export const CLEAR_CREDITS = (sector: number): number => 30 + sector * 12;
export const STAR_CREDITS = 15;
