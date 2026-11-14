// Rooftop Courier: shared constants, the Easy / Normal tuning table, the districts and small
// helpers (a seeded random generator: the simulation never calls Math.random).

/** Metres per kit tile (the Retro Urban Kit's blocks are 1 unit; 1 unit = one storey of 3 m). */
export const TILE = 3;
export const STOREY = 3;
/** Half the width of the rooftops the courier runs across (x ∈ [−HW, HW]). */
export const HW = 4.5;
/** The runner's radius and heights (standing, sliding / rolling). */
export const RAD = 0.32;
export const H_STAND = 1.75;
export const H_LOW = 0.8;
/** Gravity (m/s², a little snappier than the real thing). */
export const GRAV = 26;
/** How far a step up is taken in stride (m). */
export const STEP = 0.5;
/** Hands above the feet when reaching for a ledge or a cable (m). */
export const REACH = 2.15;

export type Mode = 'easy' | 'normal';

export interface Tune {
  /** Hearts (Easy: a fall or a late parcel costs one); 0 = the run ends at once. */
  hearts: number;
  /** Running speed at the start and its ceiling (m/s), and the distance over which it builds (m). */
  speed0: number;
  speedMax: number;
  ramp: number;
  /** Delivery timer: seconds per metre of the route at the expected speed (slack) plus a base. */
  slack: number;
  timerBase: number;
  /** Jump assist: metres the courier is pulled towards a landing that is just out of reach. */
  assist: number;
  /** Extra reach for ledges and cables (m). */
  grab: number;
  /** Deliveries per district. */
  districtEvery: number;
  /** Gap widths scale (1 = Normal). */
  gaps: number;
  /** Obstacle density scale. */
  clutter: number;
  /** Seconds on flat ground before the flow chain breaks. */
  flowWindow: number;
}

export const TUNING: Record<Mode, Tune> = {
  normal: { hearts: 0, speed0: 8.4, speedMax: 13.2, ramp: 2600, slack: 1.22, timerBase: 3, assist: 0, grab: 0, districtEvery: 6, gaps: 1, clutter: 1, flowWindow: 2.2 },
  easy: { hearts: 3, speed0: 7.6, speedMax: 11.2, ramp: 3800, slack: 1.8, timerBase: 7, assist: 1.4, grab: 0.45, districtEvery: 6, gaps: 0.85, clutter: 0.7, flowWindow: 2.8 },
};

/** The four districts (a run cycles through them, harder each round). */
export const THEMES = ['brick', 'market', 'site', 'factory'] as const;
export type Theme = typeof THEMES[number];

/** Each district's sky and light, mixed in as the courier crosses into it. */
export interface Palette { sky: number; horizon: number; fog: number; sun: number; hemi: number; ground: number; tint: [number, number, number] }
export const PALETTES: Record<Theme, Palette> = {
  brick: { sky: 0x1c1f52, horizon: 0xff8a4a, fog: 0x8c5a70, sun: 0xffa860, hemi: 0x9a8cc8, ground: 0x4a3434, tint: [1, 0.96, 0.92] },
  market: { sky: 0x2a1c5a, horizon: 0xff7a5a, fog: 0x93587a, sun: 0xff9a6a, hemi: 0xb092c8, ground: 0x503838, tint: [1.04, 0.97, 0.94] },
  site: { sky: 0x1e2658, horizon: 0xffa04a, fog: 0x8a6670, sun: 0xffb466, hemi: 0x9aa0c8, ground: 0x4a4434, tint: [1, 0.98, 0.9] },
  factory: { sky: 0x181640, horizon: 0xe86a40, fog: 0x704c62, sun: 0xff8a4a, hemi: 0x8a80b8, ground: 0x3c302e, tint: [0.96, 0.92, 0.9] },
};

// ------------------------------------------------------------------ helpers

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => { const t = clamp(k, 0, 1); return t * t * (3 - 2 * t); };

/** A small seeded generator (mulberry32): the same seed gives the same course. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private r: () => number;
  constructor(seed: number) { this.r = seeded(seed); }
  next(): number { return this.r(); }
  range(a: number, b: number): number { return a + (b - a) * this.r(); }
  int(a: number, b: number): number { return a + Math.floor(this.r() * (b - a + 1)); }
  chance(p: number): boolean { return this.r() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.r() * a.length)]; }
  /** Picks a key by weight. */
  weighted<K extends string>(w: Partial<Record<K, number>>): K {
    let sum = 0;
    for (const v of Object.values(w) as number[]) sum += v;
    let x = this.r() * sum;
    for (const [k, v] of Object.entries(w) as [K, number][]) { x -= v; if (x <= 0) return k; }
    return Object.keys(w)[0] as K;
  }
}

// ------------------------------------------------------------------ power-ups

/** The in-run power-ups (picked up on the roofs; the spring and the time bottle are older pickups). */
export const POWERS = ['magnet', 'glide', 'shield', 'double', 'watch', 'express'] as const;
export type Power = typeof POWERS[number];
export const isPower = (k: string): k is Power => (POWERS as readonly string[]).includes(k);
/** Seconds each lasts at upgrade level 0 (simulation time; the shield lasts until it is used). */
export const POWER_T: Record<Power, number> = { magnet: 9, glide: 5.5, shield: 0, double: 10, watch: 4.5, express: 6 };
/** How often each turns up (weights) and its colour (halo, HUD ring, words). */
export const POWER_W: Record<Power, number> = { magnet: 24, glide: 13, shield: 12, double: 18, watch: 14, express: 16 };
export const POWER_COLOR: Record<Power, number> = { magnet: 0xff5a5a, glide: 0xd8f0ff, shield: 0x7fe0ff, double: 0xffd23f, watch: 0x9fb4ff, express: 0xff6aa8 };
/** Time runs at this rate under the slow-motion watch. */
export const WATCH_RATE = 0.6;
/** The paper glider: the fastest sink while it lasts (m/s). */
export const GLIDE_VY = 2.3;

/** Praise words for a growing flow chain (index by tier). */
export const PRAISE_TIERS = [3, 5, 8, 12, 16];
