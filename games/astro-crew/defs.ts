// Astro Crew: the game's data. The four crew animals (each a class with its own weapon and
// signature skill), the aliens and their nests, the twelve open-world missions of the campaign and
// the Easy / Normal tuning, side by side (§7c). Pure data: the simulation, the world plan, the bot,
// the views and the screens read it.

export const DT = 1 / 60;
/** The planet: the hero roams a disc of WORLD_R metres; the crater's rim rises beyond it. */
export const WORLD_R = 62;
/** Guards and patrols farther than this from the hero sleep (not stepped, not drawn). */
export const SLEEP_R = 44;
/** Aliens are drawn within this distance of the camera's focus. */
export const VIEW_R = 38;

export type HeroId = 'frog' | 'bee' | 'flamingo' | 'panda';
export const HERO_IDS: HeroId[] = ['frog', 'bee', 'flamingo', 'panda'];

export type ShotKind = 'bubble' | 'sting' | 'laser' | 'ember' | 'cannon' | 'drone' | 'spit' | 'orb';

export interface HeroDef {
  hp: number;
  speed: number;
  /** The weapon: damage per projectile, seconds between shots, projectiles, spread (rad), range, speed. */
  dmg: number;
  every: number;
  pellets: number;
  spread: number;
  range: number;
  shotSpeed: number;
  pierce: number;
  knock: number;
  /** Splash radius and its share of the damage (the panda's embers). */
  splash: number;
  shot: ShotKind;
  /** The signature skill's cooldown (s) and power. */
  skillCd: number;
  skillDmg: number;
  /** Clears this mission to unlock (0: from the start). */
  unlock: number;
  /** The shot's colour. */
  color: number;
}

export const HERO: Record<HeroId, HeroDef> = {
  // Finn: a bubble blaster (four pellets, short reach, big knockback); LEAP SLAM lands with a shock ring
  frog: { hp: 120, speed: 6.0, dmg: 7, every: 0.52, pellets: 4, spread: 0.5, range: 8.5, shotSpeed: 19, pierce: 0, knock: 2.6, splash: 0, shot: 'bubble', skillCd: 7, skillDmg: 46, unlock: 0, color: 0x6aff9a },
  // Barbara: a stinger SMG (fast, light); HIVE BURST sends sixteen homing stingers
  bee: { hp: 95, speed: 6.6, dmg: 6, every: 0.15, pellets: 1, spread: 0.07, range: 10, shotSpeed: 26, pierce: 0, knock: 0.6, splash: 0, shot: 'sting', skillCd: 8, skillDmg: 20, unlock: 0, color: 0xffd23a },
  // Fernando: a pink laser (slow, heavy, pierces); SUN LANCE burns a long line through the crowd
  flamingo: { hp: 100, speed: 6.2, dmg: 23, every: 0.6, pellets: 1, spread: 0, range: 13, shotSpeed: 36, pierce: 2, knock: 1.2, splash: 0, shot: 'laser', skillCd: 9, skillDmg: 80, unlock: 4, color: 0xff6ad0 },
  // Rae: an ember launcher (splash); METEOR drops a fireball on the thickest crowd
  panda: { hp: 110, speed: 6.0, dmg: 13, every: 0.7, pellets: 1, spread: 0.04, range: 10, shotSpeed: 16, pierce: 0, knock: 1.4, splash: 1.9, shot: 'ember', skillCd: 9, skillDmg: 90, unlock: 8, color: 0xff8a2a },
};

/** The dodge: roll time, distance, cooldown; the punch and the mech. */
export const MOVE = {
  rollTime: 0.36, rollSpeed: 14, rollCd: 1.6, rollShot: 1.0,
  punchR: 1.7, punchCd: 1.1, punchDmg: 16, punchKnock: 7,
  mechSpeed: 5.4, mechEvery: 0.3, mechDmg: 30, mechSplash: 2.3, kickR: 2.4, kickCd: 0.85, kickDmg: 46, mechArmor: 0.15,
  invuln: 0.5, magnet: 2.6,
};

// ------------------------------------------------------------------ aliens

export type FoeKind = 'xs' | 's' | 'fly' | 'brute' | 'boss' | 'nest';
export type MobKind = Exclude<FoeKind, 'boss' | 'nest'>;
export type BossId = 'titan' | 'queen' | 'king';

export interface FoeDef { hp: number; speed: number; dmg: number; r: number; xp: number; score: number; cost: number; mech: number; scale: number }
export const FOE: Record<MobKind, FoeDef> = {
  // the zippy little blob: swarms and headbutts
  xs: { hp: 13, speed: 5.3, dmg: 9, r: 0.5, xp: 1, score: 10, cost: 1, mech: 0.007, scale: 0.55 },
  // the bigger blob: punches after a short wind-up
  s: { hp: 34, speed: 3.7, dmg: 15, r: 0.66, xp: 2, score: 25, cost: 2, mech: 0.011, scale: 0.62 },
  // the flyer: keeps its distance and spits, now and then dives at the hero
  fly: { hp: 26, speed: 3.3, dmg: 13, r: 0.6, xp: 3, score: 35, cost: 3, mech: 0.014, scale: 0.6 },
  // the brute: slow, tough; a telegraphed ground slam
  brute: { hp: 150, speed: 2.6, dmg: 30, r: 1.0, xp: 8, score: 120, cost: 7, mech: 0.035, scale: 0.62 },
};

export interface BossDef { kind: 'brute' | 'fly'; hp: number; speed: number; dmg: number; r: number; scale: number; tint: number; score: number; xp: number }
export const BOSS: Record<BossId, BossDef> = {
  titan: { kind: 'brute', hp: 3200, speed: 2.4, dmg: 24, r: 1.8, scale: 1.25, tint: 0xffc070, score: 3000, xp: 40 },
  queen: { kind: 'fly', hp: 6400, speed: 3.0, dmg: 20, r: 1.6, scale: 1.7, tint: 0xd890ff, score: 5000, xp: 50 },
  king: { kind: 'brute', hp: 12500, speed: 2.7, dmg: 28, r: 2.0, scale: 1.45, tint: 0xff6a4a, score: 8000, xp: 60 },
};

/**
 * Nests (small, `hive: false`) and hives: alien structures spread over a planet. They wake when the
 * hero comes near and send out guards, then a trickle of reinforcements while the hero stays; every
 * moment near one raises the hive alert. Destroying one lowers the alert and drops loot.
 */
export const NEST = {
  nest: { hp: 1300, r: 1.7, xp: 14, score: 400 },
  hive: { hp: 2000, r: 2.2, xp: 24, score: 700 },
  /** How much tougher per mission (aliens grow 30% a mission; nests less, they are big already). */
  grow: 0.1,
  /** The boss takes this share of the damage while its lair's hives stand. */
  shield: 0.1,
  /** Wakes within, keeps sending reinforcements within (m); seconds between reinforcements; cap of guards near it. */
  wake: 21, stay: 27, every: 5, cap: 10,
};

/** The hive alert: how fast it rises (per second, on its own and while a nest is awake), what a destroyed nest takes off. */
export const THREAT = { base: 1 / 110, nest: 1 / 45, destroy: 0.3 };

// ------------------------------------------------------------------ missions

export type Theme = 'desert' | 'purple' | 'ice' | 'lava';
export type MissionKind = 'clear' | 'rescue' | 'defend' | 'keys' | 'boss';

export interface MissionDef {
  /** 1-based number; also the tier that scales the aliens. */
  n: number;
  theme: Theme;
  kind: MissionKind;
  planet: string;
  /**
   * Clear: the nests and hives to destroy. Defend: the hive alerts to beat back from the dome.
   * Keys: the keycards spread over the planet. Rescue: the stranded rovers. Boss: guard nests round the lair.
   */
  count: number;
  boss?: BossId;
  /** Seconds for the third star. */
  par: number;
  /** Which aliens may come. */
  foes: MobKind[];
}

export const MISSIONS: MissionDef[] = [
  { n: 1, theme: 'desert', kind: 'clear', planet: 'planet-6', count: 4, par: 210, foes: ['xs', 's'] },
  { n: 2, theme: 'desert', kind: 'rescue', planet: 'planet-2', count: 4, par: 220, foes: ['xs', 's', 'fly'] },
  { n: 3, theme: 'desert', kind: 'defend', planet: 'planet-7', count: 4, par: 230, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 4, theme: 'desert', kind: 'boss', planet: 'planet-1', count: 2, boss: 'titan', par: 230, foes: ['xs', 's'] },
  { n: 5, theme: 'purple', kind: 'keys', planet: 'planet-8', count: 6, par: 250, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 6, theme: 'purple', kind: 'clear', planet: 'planet-3', count: 4, par: 260, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 7, theme: 'purple', kind: 'defend', planet: 'planet-10', count: 5, par: 280, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 8, theme: 'purple', kind: 'boss', planet: 'planet-5', count: 2, boss: 'queen', par: 260, foes: ['xs', 'fly'] },
  { n: 9, theme: 'ice', kind: 'rescue', planet: 'planet-9', count: 4, par: 280, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 10, theme: 'ice', kind: 'keys', planet: 'planet-4', count: 6, par: 290, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 11, theme: 'lava', kind: 'clear', planet: 'planet-11', count: 5, par: 300, foes: ['xs', 's', 'fly', 'brute'] },
  { n: 12, theme: 'lava', kind: 'boss', planet: 'planet-11', count: 2, boss: 'king', par: 300, foes: ['xs', 's', 'brute'] },
];

/**
 * Objectives. Rescue: seconds of standing by a rover to fix it, the radius, how fast it undoes.
 * Keys: the beacon's hold and its radius. Defend: the dome, the first alert and the gap after each.
 * The castaway: seconds beside them to beam them up. Lava: damage per tick (0.5 s).
 */
export const OBJ = {
  fixTime: 22, fixR: 3.0, fixDecay: 0.35, beaconHold: 45, beaconR: 7, domeHp: 560, keyR: 1.3,
  firstAlert: 28, alertGap: 28, castTime: 2.4, castR: 2.8, lava: 7,
};

// ------------------------------------------------------------------ tuning (Easy beside Normal)

export type Mode = 'easy' | 'normal';
export interface Tune {
  heroHp: number;
  foeHp: number;
  foeDmg: number;
  foeSpeed: number;
  budget: number;
  /** How much each mission played in this run adds (a run ramps). */
  depth: number;
  /** Health drop chance per kill. */
  healDrop: number;
  domeHp: number;
  /** How fast the hive alert rises. */
  threat: number;
}
// 1.2: the hero's health is 10% higher in both modes (Easy keeps its 40% over Normal), for the time
// manual fire costs (turning to aim, letting go to move); the balance bot kept Normal in the 1.1 spread.
export const TUNING: Record<Mode, Tune> = {
  normal: { heroHp: 1.1, foeHp: 1, foeDmg: 1, foeSpeed: 1, budget: 1, depth: 0.13, healDrop: 0.03, domeHp: 1, threat: 1 },
  easy: { heroHp: 1.54, foeHp: 0.78, foeDmg: 0.62, foeSpeed: 0.88, budget: 0.8, depth: 0.07, healDrop: 0.05, domeHp: 1.4, threat: 0.75 },
};

/** Crystals for a cleared mission (before jars), by tier and stars. */
export const crystalsFor = (n: number, stars: number): number => 25 + 12 * n + 10 * stars;

/** XP to the next level. */
export const xpNeed = (level: number): number => 12 + 11 * (level - 1);
