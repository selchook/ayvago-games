// Tuning (Normal and Easy side by side) and the ten waves of a voyage.
import { isEasy } from '@core';

export interface Tune {
  /** Hull hearts. */
  hull: number;
  /** Seconds without damage after a hit (a volley costs one heart, not three). */
  invuln: number;
  /** Player reload per side, seconds. */
  reload: number;
  /** Half-angle of the auto-range cone abeam, degrees. */
  aimCone: number;
  /** Enemy reload, speed and hull multipliers. */
  foeReload: number;
  foeSpeed: number;
  foeHp: number;
  /** Enemy aim error (world units at the landing point). */
  foeSpread: number;
  /** How much of the target's motion enemy gunners allow for (1 = perfect lead). */
  foeLead: number;
  /** How much harder each wave plays: wave w plays like 1 + (w - 1) * ramp. */
  ramp: number;
  bossHp: number;
  /** Hearts repaired between waves, and seconds per heart in the cove. */
  waveRepair: number;
  repairEvery: number;
  /** Extra seconds before the storm. */
  stormExtra: number;
  /** Chance a sunk ship drops a barrel (repair). */
  barrelChance: number;
}

export const TUNING: Record<'normal' | 'easy', Tune> = {
  normal: {
    hull: 5, invuln: 1.3, reload: 1.6, aimCone: 24,
    foeReload: 1, foeSpeed: 1, foeHp: 1, foeSpread: 3, foeLead: 0.85, ramp: 0.07,
    bossHp: 30, waveRepair: 1, repairEvery: 1.3, stormExtra: 0, barrelChance: 0.35,
  },
  easy: {
    hull: 5, invuln: 1.8, reload: 1.25, aimCone: 36,
    foeReload: 1.55, foeSpeed: 0.85, foeHp: 0.75, foeSpread: 4, foeLead: 0.6, ramp: 0.035,
    bossHp: 20, waveRepair: 2, repairEvery: 0.8, stormExtra: 25, barrelChance: 0.6,
  },
};

export const tuning = (): Tune => TUNING[isEasy() ? 'easy' : 'normal'];

export type FoeKind = 'sloop' | 'brig' | 'frigate' | 'ghost';

export interface FoeStats {
  model: string;
  scale: number;
  hp: number;
  speed: number;
  /** Turn rate, radians per second at full rudder. */
  turn: number;
  guns: number;
  reload: number;
  range: number;
  points: number;
  gold: number;
  /** Fires from both sides at once. */
  both?: boolean;
}

export const FOES: Record<FoeKind, FoeStats> = {
  sloop: { model: 'ship-small', scale: 0.95, hp: 3, speed: 9.5, turn: 0.75, guns: 2, reload: 4.2, range: 24, points: 100, gold: 20 },
  brig: { model: 'ship-medium', scale: 1, hp: 5, speed: 8, turn: 0.6, guns: 3, reload: 3.8, range: 26, points: 200, gold: 35 },
  frigate: { model: 'ship-large', scale: 1, hp: 8, speed: 7, turn: 0.5, guns: 4, reload: 3.6, range: 28, points: 350, gold: 60 },
  ghost: { model: 'ship-ghost', scale: 1.35, hp: 30, speed: 6.5, turn: 0.45, guns: 4, reload: 4, range: 30, points: 2000, gold: 200, both: true },
};

export type MissionKind = 'sink' | 'treasure' | 'fort' | 'escort' | 'boss';

export interface Spawn {
  kind: FoeKind;
  /** Seconds after the wave starts (or after the previous group has gone, with `after`). */
  at: number;
}

export interface WaveDef {
  mission: MissionKind;
  /** String keys of the title and goal. */
  title: string;
  goal: string;
  foes: Spawn[];
  /** Treasure: chests to collect and seconds before the storm. */
  chests?: number;
  time?: number;
  forts?: number;
  /** 0 day … 1 sunset; 'dusk' for the ghost's fog. */
  light: number | 'dusk';
  /** The hint shown when the wave starts. */
  hint?: string;
}

export const WAVES: WaveDef[] = [
  { mission: 'sink', title: 'm_hunt', goal: 'm_hunt_goal', light: 0, foes: [{ kind: 'sloop', at: 5 }, { kind: 'sloop', at: 22 }] },
  { mission: 'treasure', title: 'm_treasure', goal: 'm_treasure_goal', light: 0.1, chests: 6, time: 85, foes: [{ kind: 'sloop', at: 18 }], hint: 'h_treasure' },
  { mission: 'fort', title: 'm_fort', goal: 'm_fort_goal', light: 0.25, forts: 1, foes: [{ kind: 'sloop', at: 14 }], hint: 'h_fort' },
  { mission: 'sink', title: 'm_convoy', goal: 'm_convoy_goal', light: 0.45, foes: [{ kind: 'sloop', at: 3 }, { kind: 'brig', at: 6 }, { kind: 'sloop', at: 26 }, { kind: 'brig', at: 32 }] },
  { mission: 'boss', title: 'm_boss', goal: 'm_boss_goal', light: 'dusk', foes: [{ kind: 'ghost', at: 2 }], hint: 'h_boss' },
  { mission: 'treasure', title: 'm_treasure', goal: 'm_treasure_goal', light: 0.15, chests: 8, time: 80, foes: [{ kind: 'sloop', at: 8 }, { kind: 'brig', at: 26 }, { kind: 'sloop', at: 44 }] },
  { mission: 'escort', title: 'm_escort', goal: 'm_escort_goal', light: 0.35, foes: [{ kind: 'sloop', at: 6 }, { kind: 'sloop', at: 10 }, { kind: 'brig', at: 28 }, { kind: 'brig', at: 46 }], hint: 'h_escort' },
  { mission: 'fort', title: 'm_forts', goal: 'm_forts_goal', light: 0.55, forts: 2, foes: [{ kind: 'brig', at: 10 }, { kind: 'sloop', at: 30 }] },
  { mission: 'sink', title: 'm_armada', goal: 'm_armada_goal', light: 0.75, foes: [{ kind: 'brig', at: 3 }, { kind: 'sloop', at: 5 }, { kind: 'frigate', at: 20 }, { kind: 'sloop', at: 34 }, { kind: 'frigate', at: 44 }, { kind: 'brig', at: 56 }] },
  { mission: 'boss', title: 'm_final', goal: 'm_final_goal', light: 'dusk', foes: [{ kind: 'ghost', at: 2 }, { kind: 'frigate', at: 12 }, { kind: 'frigate', at: 40 }] },
];

/** Score bonus for clearing wave w (1-based). */
export const waveBonus = (w: number): number => 150 * w;
