// Rooftop Courier: the upgrades in shop order and the price of each level in stamps (kept apart
// from meta.ts so the headless balance run can read them without the core runtime).
import type { Upgrades } from './sim';

/** The upgrades in shop order and the price of each level (stamps). */
export const UPGRADES: Record<keyof Upgrades, readonly number[]> = {
  time: [100, 200, 350],
  bonus: [120, 240, 380],
  dur: [150, 280, 450],
  magnet: [120, 240, 400],
  shield: [500],
  jump: [180, 360, 600],
  rush: [140, 280, 450],
  stamp: [250, 450, 700],
  flow: [100, 200, 350],
  heart: [200, 400],
};
export type UpgradeId = keyof Upgrades;
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
