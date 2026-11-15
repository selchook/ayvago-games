// Coaster Rush: the upgrades in shop order, what each level gives and its price in tokens (kept
// apart from meta.ts so the headless balance run can read them without the core runtime).

export interface Upgrades {
  /** Stronger brakes. */
  brakes: number;
  /** Grip: a higher corner limit before the lean meter fills. */
  grip: number;
  /** Booster strips push harder and faster. */
  booster: number;
  /** A faster chain lift. */
  lift: number;
  /** More cars (two seats each). */
  cars: number;
  /** The magnet lasts longer and reaches further. */
  magnet: number;
  /** Every ride starts with a safety bar. */
  safety: number;
  /** Comfy seats: riders lose happiness more slowly. */
  comfort: number;
}

export type UpgradeId = keyof Upgrades;

export const NO_UPGRADES: Upgrades = { brakes: 0, grip: 0, booster: 0, lift: 0, cars: 0, magnet: 0, safety: 0, comfort: 0 };

/** Price of each level. */
export const UPGRADES: Record<UpgradeId, readonly number[]> = {
  brakes: [60, 140, 260],
  grip: [90, 200, 360],
  booster: [70, 160, 300],
  lift: [50, 120],
  cars: [150, 320],
  magnet: [60, 140, 240],
  safety: [400],
  comfort: [80, 180, 320],
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** What one level adds. */
export const UP = {
  brakes: 1.6,
  grip: 0.22,
  booster: 1.4,
  lift: 0.9,
  cars: 1,
  magnet: 3,
  comfort: 0.18,
};

export const BASE = { brake: 6.5, chain: 3, boostMax: 12.5, boostA: 13, cars: 3, magnetT: 10, magnetR: 3 };
