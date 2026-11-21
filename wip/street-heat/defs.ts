// Street Heat: the numbers. Cars you can own, the garage's upgrades and paints, police tuning,
// Easy and Normal side by side (TUNING), and small helpers shared by the simulation and the view.

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** km/h from m/s (the speedometer). */
export const KMH = 3.6;

export type CarId = 'sedan' | 'hatch' | 'taxi' | 'suv' | 'sports' | 'super';

export interface CarSpec {
  id: CarId;
  /** Piece key in cars.glb. */
  model: string;
  /** Acceleration (m/s²), top speed (m/s), lateral grip, mass (sedan 1), health. */
  accel: number;
  top: number;
  grip: number;
  mass: number;
  hp: number;
  price: number;
  /** Story mission that must be done before it can be bought (0: none). */
  unlock: number;
  length: number;
  width: number;
}

export const CARS: CarSpec[] = [
  { id: 'sedan', model: 'cars:NormalCar1', accel: 8.6, top: 35, grip: 1.0, mass: 1.0, hp: 100, price: 0, unlock: 0, length: 4.2, width: 1.8 },
  { id: 'hatch', model: 'cars:NormalCar2', accel: 9.4, top: 33, grip: 1.14, mass: 0.82, hp: 85, price: 1800, unlock: 0, length: 3.3, width: 1.64 },
  { id: 'taxi', model: 'cars:Taxi', accel: 8.8, top: 36, grip: 1.02, mass: 1.05, hp: 115, price: 3200, unlock: 3, length: 4.2, width: 1.8 },
  { id: 'suv', model: 'cars:SUV', accel: 8.2, top: 34, grip: 0.94, mass: 1.5, hp: 170, price: 6500, unlock: 5, length: 4.2, width: 2.1 },
  { id: 'sports', model: 'cars:SportsCar', accel: 11.5, top: 43, grip: 1.16, mass: 0.95, hp: 95, price: 12000, unlock: 7, length: 4.0, width: 1.8 },
  { id: 'super', model: 'cars:SportsCar2', accel: 13, top: 48, grip: 1.26, mass: 1.0, hp: 105, price: 24000, unlock: 10, length: 3.9, width: 1.87 },
];
export const carSpec = (id: CarId): CarSpec => CARS.find((c) => c.id === id) ?? CARS[0];

export type UpgradeId = 'engine' | 'grip' | 'armour' | 'nitro';
export const UPGRADES: { id: UpgradeId; prices: number[] }[] = [
  { id: 'engine', prices: [1200, 3000, 6500] },
  { id: 'grip', prices: [1000, 2600, 5600] },
  { id: 'armour', prices: [900, 2300, 5200] },
  { id: 'nitro', prices: [1400, 3400, 7000] },
];
export type Upgrades = Record<UpgradeId, number>;

/** The paint shop's colours (sRGB) and what a respray costs. */
export const PAINTS = [0xd8342a, 0x2a6fd8, 0xf2f2f0, 0x1c1d22, 0xf2b81a, 0x2fae5a, 0xff4fa3, 0x7a3ad8];
export const PAINT_PRICE = 300;
/** Free roam: a respray at the spray shop (clears the heat when no cop is looking). */
export const SPRAY_PRICE = 250;
/** Repair at the garage in free roam: per point of health. */
export const REPAIR_PER_HP = 6;

/** A car's handling with its upgrades (and the difficulty's damage factor). */
export interface Handling { accel: number; top: number; grip: number; mass: number; hp: number; nitro: number; armour: number }
export function handling(spec: CarSpec, up: Upgrades): Handling {
  return {
    accel: spec.accel * (1 + 0.08 * up.engine),
    top: spec.top * (1 + 0.05 * up.engine),
    grip: spec.grip * (1 + 0.07 * up.grip),
    mass: spec.mass,
    hp: spec.hp * (1 + 0.18 * up.armour),
    nitro: 2 + up.nitro,
    armour: up.armour,
  };
}

/** Police and traffic NPC cars. */
export const COP_MODEL = 'cars:Cop';
export const TRAFFIC_MODELS = ['cars:NormalCar1', 'cars:NormalCar2', 'cars:SUV', 'cars:Taxi', 'cars:SportsCar', 'cars:SportsCar2', 'transport:Bus', 'transport:SchoolBus', 'transport:Ambulance'];
/** Traffic paints (linear-ish sRGB picks). */
export const TRAFFIC_PAINTS = [0xc8c8cc, 0x2a3a5a, 0x8a1a1a, 0x1c1d22, 0xe8e4dc, 0x3a6a4a, 0x6a6a72, 0xb0702a, 0x2a6fd8, 0xd8342a];

/** Heat: felony points needed for each star. */
export const STARS = [12, 45, 100, 170, 260];

export interface Tuning {
  /** Felony gain factor. */
  heatGain: number;
  /** Cop top speed (× the sedan's) and their grip. */
  copTop: number;
  copAccel: number;
  /** Seconds stopped next to a cop to be busted. */
  bustTime: number;
  /** Damage taken factor. */
  damage: number;
  /** Search time factor (lower: lost sooner). */
  search: number;
  /** Mission time limits factor. */
  time: number;
  /** Pursuit units per star. */
  units: number[];
  /** Stars for roadblocks and spike strips. */
  roadblockAt: number;
  spikesAt: number;
  /** Traffic cars around the player. */
  traffic: number;
  /** Tail missions: suspicion gain factor. */
  suspicion: number;
  /** Ramming: damage dealt to targets factor. */
  ram: number;
}

export const TUNING: Record<'easy' | 'normal', Tuning> = {
  normal: { heatGain: 1, copTop: 1.0, copAccel: 1.0, bustTime: 2.6, damage: 0.85, search: 1, time: 1, units: [0, 1, 2, 3, 4, 5], roadblockAt: 3, spikesAt: 4, traffic: 44, suspicion: 1, ram: 1 },
  easy: { heatGain: 0.6, copTop: 0.91, copAccel: 0.85, bustTime: 3.8, damage: 0.5, search: 0.6, time: 1.3, units: [0, 1, 1, 2, 3, 3], roadblockAt: 4, spikesAt: 5, traffic: 36, suspicion: 0.6, ram: 1.5 },
};

export const fmtMoney = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
export const mmss = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
