// Snow Express: shared definitions (pure: no Phaser, no three.js, so the headless balance runs
// the same code). Cargo colours with their icons, the Easy / Normal tuning side by side, and the
// small maths helpers the simulation and the view share.

export type Mode = 'easy' | 'normal';

/** Cargo colours. Every colour also has its own icon, so the game reads without colour vision. */
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'pink'] as const;
export type ColorId = (typeof COLORS)[number];

/** Display colour of each cargo colour (HUD, icons, glows). */
export const HEX: Record<ColorId, number> = {
  red: 0xe8453c, blue: 0x3f86f0, green: 0x2fbf5f, yellow: 0xffc928, purple: 0x9a5ff0, pink: 0xff6fd8,
};
export const CSS: Record<ColorId, string> = {
  red: '#ff5b50', blue: '#5aa0ff', green: '#46d873', yellow: '#ffd23f', purple: '#b07cff', pink: '#ff86e0',
};
/** The icon drawn for each colour (on wagons, over stops, in the HUD). */
export const ICON: Record<ColorId, 'heart' | 'snowflake' | 'tree' | 'star' | 'bell' | 'moon'> = {
  red: 'heart', blue: 'snowflake', green: 'tree', yellow: 'star', purple: 'bell', pink: 'moon',
};

/**
 * Where each cargo colour sits in the Kenney colormap (512 × 512, one 64 px swatch per colour,
 * flat on the left half, shaded on the right): the top-left corner of the swatch in pixels. The
 * view moves a model's body UVs into these swatches to paint it in a cargo colour.
 */
export const SWATCH: Record<ColorId | 'white' | 'green0', [number, number]> = {
  red: [0, 128], blue: [64, 128], purple: [192, 128], pink: [256, 128],
  green: [320, 256], yellow: [384, 256], white: [0, 256], green0: [320, 256],
};

/** Tuning per difficulty: Normal and Easy side by side (skill §7c). */
export const TUNING: Record<Mode, {
  /** Train speed in tiles per second. */
  speed: number;
  /** Seconds the tunnel lamp blinks before a train comes out. */
  warn: number;
  hearts: number;
  /** A collision ends the run (Normal) or costs a heart (Easy). */
  crashEnds: boolean;
  /** Spacing of the trains in a level's timetable (× the level's gap). */
  gap: number;
  /** Rush: how fast the speed and the timetable tighten (1 = Normal). */
  ramp: number;
}> = {
  normal: { speed: 0.92, warn: 2.4, hearts: 3, crashEnds: true, gap: 1, ramp: 1 },
  easy: { speed: 0.72, warn: 3.6, hearts: 5, crashEnds: false, gap: 1.2, ramp: 0.7 },
};

/** Express trains run this much faster. */
export const EXPRESS = 1.55;
/** The snowplow's speed factor. */
export const PLOW = 1.05;
/** Hot Cocoa: everything runs at this speed for COCOA_TIME seconds. */
export const COCOA_SLOW = 0.45;
export const COCOA_TIME = 5;
/** Snow Globe: trains stand still for GLOBE_TIME seconds. */
export const GLOBE_TIME = 3;
/** A power is earned every POWER_EVERY perfect deliveries in a row. */
export const POWER_EVERY = 5;
export const POWER_MAX = 3;

/** Distance between the centres of two cars of a train (tiles). */
export const CAR_GAP = 0.86;
/** Two cars of different trains closer than this (and at the same height) crash. */
export const CRASH_DIST = 0.6;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => k * k * (3 - 2 * k);
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A small deterministic random generator (mulberry32). The simulation never calls Math.random. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  chance(p: number): boolean { return this.next() < p; }
}
