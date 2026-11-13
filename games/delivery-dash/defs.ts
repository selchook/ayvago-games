// Delivery Dash: shared numbers, the seeded random generator, cargo, vehicles, upgrades and the
// Easy/Normal tuning. No Phaser or three.js here: the simulation, the bot and the headless
// balance script use it as well.

/** World units per road tile (a tile is 1 × 1 in the pack). */
export const S = 8;
/** Half the asphalt width, the lane centre's offset from the road centre, the sidewalk centre. */
export const ROAD_HALF = 2;
export const LANE = 1;
export const WALK = 3.05;
/** Height of the Hilltop plateau over the streets (0.567 − 0.2 of a tile). */
export const LEVEL_H = (0.567 - 0.2) * S;
/** Display: metres per world unit (the van is about 3.5 m long). */
export const METRES = 1.5;

export const DX = [0, 1, 0, -1];
export const DZ = [-1, 0, 1, 0];
export const opp = (d: number): number => (d + 2) % 4;
/** The side on a driver's right when travelling in direction d (right-hand traffic). */
export const rightOf = (d: number): number => (d + 1) % 4;
/** Heading (radians) of a travel direction: forward = (sin h, cos h) in x/z. */
export const HEADING = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => k * k * (3 - 2 * k);
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A small seeded random generator (mulberry32): the simulation is deterministic per seed. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  chance(p: number): boolean { return this.next() < p; }
}

// ------------------------------------------------------------------ cargo and shops

export type Cargo = 'pizza' | 'flowers' | 'cake' | 'parcel' | 'burger' | 'icecream';
export const CARGO: Cargo[] = ['pizza', 'flowers', 'cake', 'parcel', 'burger', 'icecream'];
/** The map digit of each shop (1 = pizzeria …). */
export const SHOP_OF_DIGIT: Record<string, Cargo> = { 1: 'pizza', 2: 'flowers', 3: 'cake', 4: 'parcel', 5: 'burger', 6: 'icecream' };
export const FRAGILE: Record<Cargo, boolean> = { pizza: false, flowers: true, cake: true, parcel: false, burger: false, icecream: false };
/** Shop colours (signs, beacons, order chips). */
export const SHOP_COLOR: Record<Cargo, number> = {
  pizza: 0xe8453c, flowers: 0xe25aa8, cake: 0xf0a33c, parcel: 0x3c8ce8, burger: 0x8a5a2a, icecream: 0x38c9c0,
};
export const SHOP_CSS: Record<Cargo, string> = {
  pizza: '#ff6a5c', flowers: '#ff8ad0', cake: '#ffc060', parcel: '#7ab8ff', burger: '#d89a5a', icecream: '#6af0e4',
};
/** Ice cream melts: its orders run on a shorter clock. */
export const CARGO_TIME: Record<Cargo, number> = { pizza: 1, flowers: 1.1, cake: 1.1, parcel: 1.25, burger: 1, icecream: 0.8 };
export const VIP_COLOR = 0xffd23f;

// ------------------------------------------------------------------ vehicles and upgrades

export type VehicleId = 'van' | 'flatbed' | 'truck';
export interface Vehicle {
  id: VehicleId;
  /** Car Kit model. */
  model: string;
  price: number;
  capacity: number;
  /** Multipliers on the base handling. */
  speed: number;
  accel: number;
  turn: number;
  grip: number;
  /** Half length and half width of its body (collision circles). */
  len: number;
  wid: number;
}
export const VEHICLES: Vehicle[] = [
  { id: 'van', model: 'delivery', price: 0, capacity: 2, speed: 1, accel: 1, turn: 1, grip: 1, len: 1.36, wid: 0.62 },
  { id: 'flatbed', model: 'deliveryflat', price: 450, capacity: 3, speed: 1.05, accel: 0.95, turn: 0.95, grip: 1, len: 1.36, wid: 0.62 },
  { id: 'truck', model: 'truckflat', price: 1100, capacity: 4, speed: 1.02, accel: 0.82, turn: 0.84, grip: 0.92, len: 1.25, wid: 0.64 },
];
export const vehicle = (id: VehicleId): Vehicle => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];

export type UpgradeId = 'engine' | 'handling' | 'capacity' | 'padding';
export const UPGRADES: { id: UpgradeId; max: number; cost: number[] }[] = [
  { id: 'engine', max: 3, cost: [80, 180, 320] },
  { id: 'handling', max: 3, cost: [70, 160, 300] },
  { id: 'capacity', max: 2, cost: [150, 380] },
  { id: 'padding', max: 3, cost: [60, 140, 260] },
];
export type Upgrades = Record<UpgradeId, number>;

/** Van paints: the body colour (the first is the Car Kit's own green). */
export const PAINTS: { id: string; color: number; price: number }[] = [
  { id: 'mint', color: 0x3fbf6a, price: 0 },
  { id: 'tomato', color: 0xe8453c, price: 60 },
  { id: 'sky', color: 0x3c8ce8, price: 60 },
  { id: 'sun', color: 0xf5c331, price: 60 },
  { id: 'grape', color: 0x8a52d8, price: 90 },
  { id: 'pink', color: 0xf27bb8, price: 90 },
  { id: 'night', color: 0x2c3550, price: 120 },
];

/** The handling a run uses: base numbers, the vehicle and the upgrades. */
export interface Handling {
  vmax: number;
  accel: number;
  brake: number;
  turn: number;
  grip: number;
  capacity: number;
  /** Fragile damage multiplier (padding). */
  protect: number;
  len: number;
  wid: number;
}

export function handling(v: Vehicle, up: Upgrades): Handling {
  return {
    vmax: 13.5 * v.speed * (1 + up.engine * 0.07),
    accel: 8.5 * v.accel * (1 + up.engine * 0.1),
    brake: 20,
    turn: 2.15 * v.turn * (1 + up.handling * 0.07),
    grip: 7 * v.grip * (1 + up.handling * 0.12),
    capacity: v.capacity + up.capacity,
    protect: 1 - up.padding * 0.2,
    len: v.len,
    wid: v.wid,
  };
}

// ------------------------------------------------------------------ difficulty

export type Mode = 'easy' | 'normal';
/** Easy and Normal side by side (Normal stays exactly as tuned). */
export const TUNING: Record<Mode, { timer: number; traffic: number; trafficSpeed: number; fragile: number; assist: number; crashTime: number }> = {
  normal: { timer: 1, traffic: 1, trafficSpeed: 1, fragile: 1, assist: 0.55, crashTime: 3 },
  easy: { timer: 1.4, traffic: 0.6, trafficSpeed: 0.85, fragile: 0.45, assist: 1.6, crashTime: 1.5 },
};

/** Turbo: seconds of boost per coffee, and the most coffees the van holds. */
export const TURBO_TIME = 2.4;
export const TURBO_MAX = 3;
