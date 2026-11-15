// Coaster Rush: shared definitions. The six areas of a ride (each built from one of the Coaster Kit's
// track styles, with its own train, palette and town dressing), the power-ups, the Easy / Normal
// tuning side by side, and small math helpers. Kept free of three.js and Phaser so the simulation
// and the headless balance run can use it.

export type Mode = 'easy' | 'normal';
export type Style = 'wood' | 'steel' | 'mouse' | 'hanging' | 'monorail' | 'flume';
export type PieceKind =
  | 'straight' | 'corner-small' | 'corner-large' | 'corner-small-ramp' | 'corner-large-ramp' | 'curve' | 'looping'
  | 'straight-hill-beginning' | 'straight-hill-end' | 'straight-hill-complete' | 'straight-hill-complete-half'
  | 'straight-bump-up' | 'straight-bump-down';

/** Gravity in kit units per second² (a kit unit is about 2.3 m: rides feel brisk, like a toy model). */
export const G = 9.8;
/** Speed shown to the player: kit units per second → km/h. */
export const KMH = 8.3;

/** A train car of a style: its model, length along the track, offset of the model and the seats. */
export interface StyleInfo {
  /** Model of the first car and of the others (Coaster Kit). */
  front: string;
  car: string;
  /** Distance between car centres along the track. */
  pitch: number;
  /** The car model's origin above the track's bottom line (along the track's up). */
  ride: number;
  /** Sideways shift of the car model (the hanging car's pivot sits off centre). */
  shiftX: number;
  /** Seats in a car (model space of the car, the car facing −z): x, y, z. */
  seats: [number, number, number][];
  /** Rider scale. */
  riderScale: number;
  /** Track profile height above the bottom line (where the train's wheels run). */
  top: number;
  /** The car hangs under the track. */
  hang?: boolean;
}

export const STYLES: Record<Style, StyleInfo> = {
  wood: { front: 'coaster-train-wooden', car: 'coaster-train-wooden', pitch: 1.36, ride: 0.3, shiftX: 0, seats: [[0, 0.42, -0.28], [0, 0.42, 0.3]], riderScale: 0.8, top: 0.3 },
  steel: { front: 'coaster-train-front', car: 'coaster-train', pitch: 1.36, ride: 0.3, shiftX: 0, seats: [[0, 0.42, -0.28], [0, 0.42, 0.3]], riderScale: 0.8, top: 0.3 },
  mouse: { front: 'coaster-train-front', car: 'coaster-train', pitch: 1.36, ride: 0.1, shiftX: 0, seats: [[0, 0.42, -0.28], [0, 0.42, 0.3]], riderScale: 0.8, top: 0.1 },
  hanging: { front: 'coaster-train-hanging', car: 'coaster-train-hanging', pitch: 0.82, ride: -0.065, shiftX: 0.325, seats: [[-0.55, -0.42, -0.02], [-0.1, -0.42, -0.02]], riderScale: 0.8, top: 0.1, hang: true },
  monorail: { front: 'train-monorail', car: 'train-monorail', pitch: 1.06, ride: 0.2, shiftX: 0, seats: [[0, 0.3, 0.22], [0, 0.3, -0.24]], riderScale: 0.78, top: 0.2 },
  flume: { front: 'train-log-flume', car: 'train-log-flume', pitch: 1.56, ride: 0.12, shiftX: 0, seats: [[0, 0.36, -0.28], [0, 0.36, 0.3]], riderScale: 0.8, top: 0.4 },
};

export type AreaId = 'square' | 'windmill' | 'market' | 'river' | 'rooftops' | 'splash';

export interface Palette {
  sky: number; horizon: number; fog: number; ground: number; ground2: number; hemi: number; hemiGround: number; sun: number;
  /** Tint of the town's walls and roofs (multiplies the kit's colours a little). */
  wall: number; water: number;
}

export interface AreaDef {
  id: AreaId;
  style: Style;
  pal: Palette;
  /** Lift heights (straights at 45° on the chain) and how many elements the area has. */
  lift: [number, number];
  elements: [number, number];
  /** Element weights: drop, camel (airtime humps), corner, helix, scurve, loop, dip, hill. */
  weights: Partial<Record<Element, number>>;
  /** Small corners allowed (the wild mouse's hairpins). */
  tight: number;
  water?: boolean;
}

export type Element = 'drop' | 'camel' | 'corner' | 'helix' | 'scurve' | 'loop' | 'dip' | 'hill' | 'boost';

export const AREAS: AreaDef[] = [
  {
    id: 'square', style: 'wood', lift: [1, 1], elements: [5, 6], tight: 0.15,
    weights: { drop: 3, camel: 3, corner: 3, scurve: 2, hill: 2, dip: 1 },
    pal: { sky: 0x5aa8e6, horizon: 0xcfe9f7, fog: 0xbfe0f2, ground: 0x7cbf5a, ground2: 0x6aab4c, hemi: 0xe8f6ff, hemiGround: 0x6a7a4a, sun: 0xfff2d8, wall: 0xffffff, water: 0x4fa6d8 },
  },
  {
    id: 'windmill', style: 'steel', lift: [2, 2], elements: [6, 7], tight: 0.2,
    weights: { drop: 3, camel: 3, corner: 3, helix: 2, scurve: 2, loop: 2, hill: 1 },
    pal: { sky: 0x4f98e0, horizon: 0xe0f0f4, fog: 0xcfe6ee, ground: 0x8cc860, ground2: 0x79b552, hemi: 0xf0f8ff, hemiGround: 0x6f8048, sun: 0xfff6e0, wall: 0xfff8f0, water: 0x4fa6d8 },
  },
  {
    id: 'market', style: 'mouse', lift: [1, 2], elements: [7, 8], tight: 0.7,
    weights: { corner: 5, scurve: 3, drop: 2, camel: 2, dip: 2, hill: 1 },
    pal: { sky: 0x6aa6dc, horizon: 0xf6e6c8, fog: 0xf0dfc2, ground: 0xa8b860, ground2: 0x96a654, hemi: 0xfff2e0, hemiGround: 0x7a6a48, sun: 0xffe6b8, wall: 0xfff0e0, water: 0x4f9ad0 },
  },
  {
    id: 'river', style: 'hanging', lift: [2, 2], elements: [6, 7], tight: 0.3, water: true,
    weights: { drop: 3, corner: 3, helix: 3, scurve: 2, loop: 2, camel: 2 },
    pal: { sky: 0x4a8fd2, horizon: 0xd8eef0, fog: 0xc6e2e6, ground: 0x6cb85a, ground2: 0x5ca64c, hemi: 0xe6f6ff, hemiGround: 0x5a7a5a, sun: 0xfff0d0, wall: 0xf4f8ff, water: 0x3f9ad6 },
  },
  {
    id: 'rooftops', style: 'monorail', lift: [2, 3], elements: [7, 8], tight: 0.35,
    weights: { corner: 3, drop: 3, camel: 3, helix: 2, scurve: 2, loop: 1, dip: 1 },
    pal: { sky: 0x7a8fd8, horizon: 0xf8d8c0, fog: 0xecd2c4, ground: 0x8ab460, ground2: 0x78a252, hemi: 0xffeedd, hemiGround: 0x6a5a58, sun: 0xffd8a8, wall: 0xfff0e8, water: 0x4f8ad0 },
  },
  {
    id: 'splash', style: 'flume', lift: [2, 3], elements: [7, 9], tight: 0.3, water: true,
    weights: { drop: 4, camel: 3, corner: 3, helix: 2, scurve: 2, loop: 2, dip: 1 },
    pal: { sky: 0x5c7cc8, horizon: 0xf6c8a8, fog: 0xe6c4b4, ground: 0x78b25a, ground2: 0x68a04e, hemi: 0xffe8d8, hemiGround: 0x5a5a6a, sun: 0xffc890, wall: 0xffece0, water: 0x3a90d8 },
  },
];

export const areaOf = (n: number): AreaDef => AREAS[n % AREAS.length];
/** The lap of an area index (0 for the first time through the six). */
export const lapOf = (n: number): number => Math.floor(n / AREAS.length);

export const POWERS = ['turbo', 'magnet', 'safety', 'slowmo', 'golden', 'balloon'] as const;
export type Power = typeof POWERS[number];
export const isPower = (k: string): k is Power => (POWERS as readonly string[]).includes(k);
/** Seconds a power-up lasts (the safety bar lasts until it saves a derail). */
export const POWER_TIME: Record<Power, number> = { turbo: 6, magnet: 10, safety: 0, slowmo: 6, golden: 10, balloon: 8 };
export const POWER_COLOR: Record<Power, number> = {
  turbo: 0xff7a1a, magnet: 0xe8445a, safety: 0x46c8ff, slowmo: 0x9a7aff, golden: 0xffd23f, balloon: 0xff6ad0,
};

/** Easy and Normal, side by side (Normal is the reference; Easy only ever helps). */
export interface Tuning { hearts: number; grip: number; leanTime: number; happy: number; happyLoss: number; motor: number; motorMax: number; ramp: number; bay: number; stallKick: number }
export const TUNING: Record<Mode, Tuning> = {
  normal: { hearts: 3, grip: 2.45, leanTime: 0.5, happy: 70, happyLoss: 1, motor: 1.5, motorMax: 6.5, ramp: 1, bay: 1, stallKick: 0.5 },
  easy: { hearts: 5, grip: 2.85, leanTime: 0.9, happy: 80, happyLoss: 0.6, motor: 2.4, motorMax: 7.5, ramp: 0.6, bay: 1.5, stallKick: 1 },
};

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => { const x = clamp(k, 0, 1); return x * x * (3 - 2 * x); };

/** A small seeded random generator (mulberry32). */
export class Rng {
  private a: number;
  constructor(seed: number) { this.a = seed >>> 0 || 1; }
  next(): number {
    let t = (this.a = (this.a + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(list: readonly T[]): T { return list[Math.floor(this.next() * list.length) % list.length]; }
  weighted<K extends string>(w: Partial<Record<K, number>>): K {
    const keys = Object.keys(w) as K[];
    let total = 0;
    for (const k of keys) total += w[k] ?? 0;
    let r = this.next() * total;
    for (const k of keys) { r -= w[k] ?? 0; if (r <= 0) return k; }
    return keys[keys.length - 1];
  }
}
