// Kickflip Park: tuning, the trick list and the shared constants. No three.js and no Phaser here:
// the headless balance run (balance.ts) loads the simulation through this file.

export type Mode = 'easy' | 'normal';

/** A direction on the stick, the arrows or a swipe: up, right, down, left. */
export type Dir = 0 | 1 | 2 | 3;
export const UP: Dir = 0, RIGHT: Dir = 1, DOWN: Dir = 2, LEFT: Dir = 3;

/** Gravity (m/s²): a little lighter than real, so airs read well. */
export const G = 15.5;

export interface Tuning {
  /** Session length (s). */
  session: number;
  /** Landing tolerance: how far the board may point off the travel direction (radians). */
  landTol: number;
  /** A flip may still be finishing by this share when the wheels touch. */
  flipGrace: number;
  /** Grind balance: how fast a lean grows (1/s²), and how much it grows over a long grind. */
  grindTip: number;
  grindTipRamp: number;
  /** Manual balance, the same way. */
  manualTip: number;
  manualTipRamp: number;
  /** Random nudges to the balance (strength). */
  wobble: number;
  /** How far from a rail the board still locks on (m). */
  snap: number;
  /** Seconds a combo waits after a landing for a manual to keep it going. */
  linkWindow: number;
  /** Combo points that fill the special meter once. */
  specialFill: number;
  /** Score goal thresholds are multiplied by this. */
  goalScale: number;
  /** Spins snap to the nearest half turn within this many radians on landing. */
  spinAssist: number;
}

export const TUNING: Record<Mode, Tuning> = {
  normal: {
    session: 120, landTol: 0.62, flipGrace: 0.12, grindTip: 3.2, grindTipRamp: 0.9, manualTip: 2.6, manualTipRamp: 0.7,
    wobble: 1.0, snap: 0.75, linkWindow: 0.3, specialFill: 5200, goalScale: 1, spinAssist: 0.3,
  },
  easy: {
    session: 150, landTol: 0.95, flipGrace: 0.3, grindTip: 1.7, grindTipRamp: 0.35, manualTip: 1.5, manualTipRamp: 0.3,
    wobble: 0.6, snap: 1.1, linkWindow: 0.5, specialFill: 3600, goalScale: 0.7, spinAssist: 0.6,
  },
};

// ------------------------------------------------------------------ riding

export const RIDE = {
  /** Speed a push brings you up to, and the push's kick (m/s). */
  pushTop: 9.2,
  pushKick: 1.7,
  /** Seconds between pushes while push is held. */
  pushEvery: 0.52,
  /** Below this the skater pushes by himself when the stick is not pulled back. */
  cruise: 4.2,
  /** Hard top speed. */
  maxSpeed: 14,
  /** Share of gravity felt riding uphill: skaters pump, so ramps cost less than they give. */
  climb: 0.7,
  /** Rolling resistance (m/s²) and air drag (1/s). */
  roll: 0.22,
  drag: 0.009,
  brake: 7,
  /** Turn rate at a standstill and at speed (rad/s). */
  turnSlow: 2.7,
  turnFast: 1.6,
  /** Ollie take-off speed (m/s) without and with a full crouch, and the crouch time for it (s). */
  ollieMin: 4.7,
  ollieMax: 7.4,
  crouchFull: 0.55,
  /** Spin rate in the air (rad/s) and how quickly it ramps. */
  spinRate: 7.4,
  spinAccel: 26,
  /** Steps higher than this are walls (m). */
  stepUp: 0.14,
  /** Slope (rise per run) where a transition throws you into the air (about 80°). */
  lipSlope: 5.2,
  /** Seconds of tumbling after a bail. */
  bailTime: 1.35,
};

// ------------------------------------------------------------------ tricks

export type TrickKind = 'flip' | 'grab' | 'grind' | 'manual' | 'spin' | 'gap' | 'special' | 'ollie';

export interface TrickDef {
  id: string;
  kind: TrickKind;
  /** Points when landed (grabs, grinds and manuals add `perSec` while held). */
  pts: number;
  perSec?: number;
  /** Flips: how long the board takes to turn (s). */
  dur?: number;
  /** Flips: the board's turn: roll (around its length), yaw (shove-it), pitch (impossible). */
  roll?: number;
  yaw?: number;
  pitch?: number;
}

export const FLIPS: Record<Dir, TrickDef> = {
  [UP]: { id: 'kickflip', kind: 'flip', pts: 100, dur: 0.36, roll: 1 },
  [RIGHT]: { id: 'varial', kind: 'flip', pts: 200, dur: 0.44, roll: 1, yaw: -0.5 },
  [DOWN]: { id: 'shoveit', kind: 'flip', pts: 90, dur: 0.34, yaw: 0.5 },
  [LEFT]: { id: 'heelflip', kind: 'flip', pts: 110, dur: 0.36, roll: -1 },
};

/** A flip done again right after itself becomes a double (and a triple). */
export const FLIP_REPEAT_PTS = [1, 1.6, 2.4];

export const GRABS: Record<Dir, TrickDef> = {
  [UP]: { id: 'nosegrab', kind: 'grab', pts: 140, perSec: 260 },
  [RIGHT]: { id: 'indy', kind: 'grab', pts: 180, perSec: 280 },
  [DOWN]: { id: 'tailgrab', kind: 'grab', pts: 140, perSec: 260 },
  [LEFT]: { id: 'melon', kind: 'grab', pts: 180, perSec: 280 },
};

export const GRINDS: Record<Dir | 4, TrickDef> = {
  4: { id: 'fiftyfifty', kind: 'grind', pts: 100, perSec: 140 },
  [UP]: { id: 'nosegrind', kind: 'grind', pts: 140, perSec: 170 },
  [DOWN]: { id: 'fiveo', kind: 'grind', pts: 140, perSec: 170 },
  [LEFT]: { id: 'boardslide', kind: 'grind', pts: 180, perSec: 180 },
  [RIGHT]: { id: 'smith', kind: 'grind', pts: 200, perSec: 190 },
};

export const MANUALS = {
  manual: { id: 'manual', kind: 'manual', pts: 80, perSec: 160 } as TrickDef,
  nose: { id: 'nosemanual', kind: 'manual', pts: 110, perSec: 180 } as TrickDef,
};

/** Special tricks: only while the special meter is full. Original moves, big points. */
export const SPECIALS = {
  comet: { id: 'comet', kind: 'special', pts: 1500, dur: 0.95, roll: 2, yaw: 1 } as TrickDef,
  pinwheel: { id: 'pinwheel', kind: 'special', pts: 1800, dur: 1.05, yaw: 2 } as TrickDef,
  spark: { id: 'sparkslide', kind: 'special', pts: 1000, perSec: 420 } as TrickDef,
  moon: { id: 'moonwalk', kind: 'special', pts: 900, perSec: 380 } as TrickDef,
};

/** Points for a spin by half turns: 180, 360, 540 … */
export const SPIN_PTS = [0, 100, 260, 480, 760, 1100, 1500, 2000];

/** Seconds of a grab before it counts. */
export const GRAB_MIN = 0.14;

/** Each repeat of the same trick in one combo is worth this much less. */
export const REPEAT_DECAY = 0.7;

/** Praise words by combo size (localized keys praise0 … praise5). */
export const PRAISE = [1200, 3000, 7000, 15000, 30000, 60000];

// ------------------------------------------------------------------ cosmetics

export const DECKS = ['classic', 'flame', 'checker', 'wave', 'galaxy', 'gold'] as const;
export type DeckId = (typeof DECKS)[number];
/** Goals completed (all parks) that unlock each deck. */
export const DECK_GOALS: Record<DeckId, number> = { classic: 0, flame: 2, checker: 5, wave: 9, galaxy: 14, gold: 20 };

export const WHEELS = ['white', 'mint', 'pink', 'sky', 'violet', 'gold'] as const;
export type WheelId = (typeof WHEELS)[number];
/** Best session score (any park, Normal or Easy) that unlocks each wheel colour. */
export const WHEEL_SCORE: Record<WheelId, number> = { white: 0, mint: 15000, pink: 40000, sky: 80000, violet: 130000, gold: 200000 };
export const WHEEL_COLOR: Record<WheelId, number> = { white: 0xf4f1ea, mint: 0x5fe0b0, pink: 0xff6fb5, sky: 0x5ac8ff, violet: 0xa678ff, gold: 0xffc93a };

// ------------------------------------------------------------------ helpers

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** An angle wrapped into −π … π. */
export const wrap = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

/** A small seeded random generator (mulberry32): the simulation never calls Math.random. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
