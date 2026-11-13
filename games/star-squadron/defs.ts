// Star Squadron: the numbers behind a run. Field size, Easy / Normal tuning side by side, the
// enemy roster, the four sectors and their bosses. Pure data: the simulation (sim.ts), the bot
// and the headless balance run read it without three.js or Phaser.

/** World units. The ship flies "up" the screen, which is −z; x runs left to right. */
export const FIELD = {
  /** Where enemies appear (just above the top of the screen). */
  top: -24,
  /** Below this everything is gone (under the bottom edge). */
  bottom: 4.5,
  /** Lateral room of the enemy lanes. */
  hw: 4.4,
  /** The player's vertical range. */
  pTop: -12,
  pBottom: 0.9,
  /** Where the ship starts and the bot likes to sit. */
  home: -1.2,
};

/** Half the visible width at depth z (the camera looks down at an angle, so the far end is wider). */
export const visibleHalfWidth = (z: number): number => 4.15 + (1.8 - z) * 0.085;
/** How far the player may go sideways at depth z. */
export const playerHalfWidth = (z: number): number => Math.min(4.7, visibleHalfWidth(z) - 0.5);

export type Mode = 'easy' | 'normal';

export interface Tuning {
  /** Starting hull. */
  hull: number;
  /** Enemy and boss hit points. */
  enemyHp: number;
  /** How often enemies shoot. */
  fire: number;
  /** Enemy bullet speed. */
  bulletSpeed: number;
  /** Bullets per ring / spiral arm count (rounded). */
  density: number;
  /** How fast sectors get harder: sector s plays like 1 + (s − 1) · ramp. */
  ramp: number;
  /** Damage of an enemy bullet and of a collision. */
  bulletDmg: number;
  contactDmg: number;
  /** Extra pickups. */
  dropK: number;
}

/** Normal and Easy side by side (new-game skill §7c): Easy has fewer, slower bullets and softer enemies. */
export const TUNING: Record<Mode, Tuning> = {
  normal: { hull: 100, enemyHp: 1, fire: 1, bulletSpeed: 1, density: 1, ramp: 1, bulletDmg: 12, contactDmg: 22, dropK: 1 },
  easy: { hull: 140, enemyHp: 0.7, fire: 0.6, bulletSpeed: 0.8, density: 0.7, ramp: 0.85, bulletDmg: 9, contactDmg: 15, dropK: 1.5 },
};

export type EnemyKind = 'scout' | 'fighter' | 'striker' | 'gunship' | 'bomber' | 'carrier' | 'rock' | 'crystal';

export interface EnemyDef {
  hp: number;
  /** Hit circle. */
  r: number;
  score: number;
  /** Credit coins dropped (5 credits each). */
  coins: number;
  /** Chance of a power-up drop. */
  drop: number;
  /** Rocks tumble and do not shoot. */
  rock?: boolean;
  /** Big ships: a bigger blast, a shake. */
  big?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: { hp: 18, r: 0.62, score: 100, coins: 1, drop: 0.035 },
  fighter: { hp: 48, r: 0.78, score: 250, coins: 2, drop: 0.08 },
  striker: { hp: 30, r: 0.72, score: 200, coins: 1, drop: 0.05 },
  gunship: { hp: 150, r: 1.0, score: 600, coins: 5, drop: 0.3, big: true },
  bomber: { hp: 190, r: 1.05, score: 700, coins: 6, drop: 0.32, big: true },
  carrier: { hp: 340, r: 1.25, score: 1200, coins: 10, drop: 0.55, big: true },
  rock: { hp: 40, r: 0.7, score: 80, coins: 2, drop: 0.06, rock: true },
  crystal: { hp: 70, r: 0.75, score: 160, coins: 7, drop: 0.12, rock: true },
};

export type SectorId = 'ember' | 'belt' | 'station' | 'rift';
export type BossKind = 'dread' | 'hive' | 'fortress' | 'titan';

export interface SectorDef {
  id: SectorId;
  boss: BossKind;
  waves: number;
  /** Weights of the wave groups in this sector (more rocks in the belt …). */
  rocks: number;
}

/** The four sectors of a loop; after the fourth the loop starts again, harder. */
export const SECTORS: SectorDef[] = [
  { id: 'ember', boss: 'dread', waves: 4, rocks: 0.6 },
  { id: 'belt', boss: 'hive', waves: 5, rocks: 2.2 },
  { id: 'station', boss: 'fortress', waves: 5, rocks: 0.4 },
  { id: 'rift', boss: 'titan', waves: 5, rocks: 1 },
];

export type PartKind = 'turret' | 'pod';

export interface BossPartDef {
  kind: PartKind;
  dx: number;
  dz: number;
  r: number;
  hp: number;
  /** Pods circle the core at their distance instead of sitting still. */
  orbit?: boolean;
}

export interface BossDef {
  /** The hull: its hit circle and hit points (armoured while any part lives). */
  r: number;
  hp: number;
  parts: BossPartDef[];
  score: number;
  coins: number;
  /** Where it settles. */
  z: number;
  /** Side-to-side sway. */
  sway: number;
}

export const BOSSES: Record<BossKind, BossDef> = {
  dread: {
    r: 1.9, hp: 1500, score: 5000, coins: 30, z: -14.5, sway: 2.2,
    parts: [
      { kind: 'turret', dx: -2.0, dz: 0.6, r: 0.75, hp: 260 },
      { kind: 'turret', dx: 2.0, dz: 0.6, r: 0.75, hp: 260 },
    ],
  },
  hive: {
    r: 2.0, hp: 1800, score: 6000, coins: 36, z: -14, sway: 1.8,
    parts: [
      { kind: 'pod', dx: 2.9, dz: 0, r: 0.7, hp: 220, orbit: true },
      { kind: 'pod', dx: -2.9, dz: 0, r: 0.7, hp: 220, orbit: true },
      { kind: 'pod', dx: 0, dz: 2.9, r: 0.7, hp: 220, orbit: true },
      { kind: 'pod', dx: 0, dz: -2.9, r: 0.7, hp: 220, orbit: true },
    ],
  },
  fortress: {
    r: 2.2, hp: 2100, score: 7000, coins: 42, z: -14.5, sway: 1.2,
    parts: [
      { kind: 'turret', dx: -2.3, dz: -1.4, r: 0.75, hp: 300 },
      { kind: 'turret', dx: 2.3, dz: -1.4, r: 0.75, hp: 300 },
      { kind: 'turret', dx: -2.3, dz: 1.5, r: 0.75, hp: 300 },
      { kind: 'turret', dx: 2.3, dz: 1.5, r: 0.75, hp: 300 },
    ],
  },
  titan: {
    r: 2.3, hp: 2600, score: 9000, coins: 50, z: -15, sway: 2.0,
    parts: [
      { kind: 'turret', dx: -2.5, dz: 0.4, r: 0.75, hp: 340 },
      { kind: 'turret', dx: 2.5, dz: 0.4, r: 0.75, hp: 340 },
      { kind: 'pod', dx: -1.2, dz: 2.4, r: 0.65, hp: 260 },
      { kind: 'pod', dx: 1.2, dz: 2.4, r: 0.65, hp: 260 },
    ],
  },
};

/** While any part lives the hull takes this share of the damage (the weak points open it up). */
export const ARMOURED = 0.25;

/** Seconds of each run phase. */
export const TIMES = { intro: 2.2, clear: 1.3, warning: 3.0, warp: 3.2, bossDeath: 2.6 };

export type PowerId = 'bomb' | 'shield' | 'overdrive';
export const POWER_IDS: PowerId[] = ['bomb', 'shield', 'overdrive'];
/** Base cooldowns (seconds). */
export const POWER_CD: Record<PowerId, number> = { bomb: 30, shield: 22, overdrive: 26 };

export type PickupKind = 'credit' | 'repair' | 'cell' | 'charge' | 'boost';
