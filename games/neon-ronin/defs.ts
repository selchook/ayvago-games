// Neon Ronin: the numbers. Units are metres and seconds; the world is a grid of 1 m cells (x right,
// y up), the play plane is z = 0. Easy and Normal tuning side by side (TUNING), the hero's moves
// (MOVE, ATTACKS), the foes (FOE) and the score values. Pure data: the simulation (sim.ts), the
// autopilot (bot.ts) and the headless balance check (balance.ts) read it without Phaser or three.js.

export type Mode = 'easy' | 'normal';
export const DT = 1 / 60;

export interface Tuning {
  /** Lives for a district run. */
  lives: number;
  /** The hero's base hit points. */
  hp: number;
  /** Foe health and damage factors. */
  foeHp: number;
  bossHp: number;
  /** Foe projectile speed and the pause between foe attacks (bigger = slower). */
  shotSpeed: number;
  cooldown: number;
  /** Telegraph length factor (bigger = more warning). */
  tell: number;
  /** Gun heat per shot factor. */
  heat: number;
  /** Extra seconds on the par time (the third star). */
  parBonus: number;
  /** A fall into the void costs this much health. */
  pitDamage: number;
}

export const TUNING: Record<Mode, Tuning> = {
  normal: { lives: 3, hp: 4, foeHp: 1, bossHp: 1, shotSpeed: 1, cooldown: 1, tell: 1, heat: 1, parBonus: 0, pitDamage: 1 },
  easy: { lives: 5, hp: 6, foeHp: 0.75, bossHp: 0.7, shotSpeed: 0.8, cooldown: 1.35, tell: 1.3, heat: 0.8, parBonus: 15, pitDamage: 1 },
};

/** The hero's movement. */
export const MOVE = {
  w: 0.62, h: 1.32, rollH: 0.8,
  run: 7.4, accel: 70, airAccel: 42, friction: 60,
  gravity: 40, maxFall: 22, jump: 15.6, airJump: 13.4, jumpCut: 0.45,
  coyote: 0.1, buffer: 0.13,
  wallSlide: 3.2, wallJumpX: 8.5, wallJumpY: 14,
  roll: 0.42, rollSpeed: 11.5, rollIframes: 0.36, rollCooldown: 0.28,
  dash: 0.18, dashSpeed: 17,
  hurtIframes: 1.1, hurt: 0.28, knock: 7,
  slamSpeed: 26,
};

/**
 * Every blade move. The chain (A: punch, kick, slash), the charged cleave (B), the roll lunge (C), the
 * ground slam, and since 1.1: the cyclone (attack while sprinting), the rising dragon (launcher), the
 * sky rend air string (air1, air2, air3), the falcon dive, the iaido flash (roll, then hold), the
 * blade & bolt finisher (tap, tap, SHOOT). `stop` is the hit-stop, `knock` the push, `lift` the
 * upward throw of a light foe (a juggle), `back` the reach behind the hero (spins hit all round).
 */
export interface AttackDef { clip: string; dur: number; on: number; off: number; reach: number; up: number; dmg: number; knock: number; stop: number; lunge: number; lift?: number; back?: number; low?: number }
export type AttackKind = 'punch' | 'kick' | 'slash' | 'single' | 'air' | 'air2' | 'air3' | 'cleave' | 'lunge' | 'slam' | 'spin' | 'rise' | 'dive' | 'iaido' | 'burst';
export const ATTACKS: Record<AttackKind, AttackDef> = {
  punch: { clip: 'Punch_Right', dur: 0.27, on: 0.06, off: 0.16, reach: 1.35, up: 0.9, dmg: 1, knock: 2.5, stop: 0.03, lunge: 1.2 },
  kick: { clip: 'Kick_Left', dur: 0.31, on: 0.08, off: 0.19, reach: 1.55, up: 0.6, dmg: 1, knock: 3.5, stop: 0.04, lunge: 1.6 },
  slash: { clip: 'Sword_Slash', dur: 0.44, on: 0.1, off: 0.24, reach: 2.25, up: 1.4, dmg: 2.5, knock: 9, stop: 0.085, lunge: 2.2 },
  single: { clip: 'Sword_Slash', dur: 0.36, on: 0.08, off: 0.2, reach: 2.0, up: 1.2, dmg: 1.5, knock: 5, stop: 0.04, lunge: 1.0 },
  // the air string: two quick cuts that keep a juggled foe up, then the finisher that spikes it down
  air: { clip: 'Sword_Slash', dur: 0.26, on: 0.04, off: 0.16, reach: 1.9, up: 1.5, dmg: 1.3, knock: 2, stop: 0.04, lunge: 0, lift: 3.5, low: 0.9 },
  air2: { clip: 'Kick_Left', dur: 0.26, on: 0.05, off: 0.16, reach: 1.65, up: 1.3, dmg: 1.3, knock: 2, stop: 0.045, lunge: 0, lift: 3.5, low: 0.9 },
  air3: { clip: 'Sword_Slash', dur: 0.4, on: 0.08, off: 0.24, reach: 2.3, up: 1.7, dmg: 2.8, knock: 7, stop: 0.1, lunge: 0, lift: -15, low: 1.2 },
  cleave: { clip: 'Sword_Slash', dur: 0.52, on: 0.12, off: 0.3, reach: 2.6, up: 1.6, dmg: 4, knock: 12, stop: 0.13, lunge: 1.4 },
  lunge: { clip: 'Sword_Slash', dur: 0.36, on: 0.0, off: 0.26, reach: 1.3, up: 1.0, dmg: 2, knock: 7, stop: 0.06, lunge: 0 },
  slam: { clip: 'Kick_Right', dur: 0.3, on: 0, off: 0.12, reach: 2.6, up: 1.2, dmg: 2, knock: 8, stop: 0.08, lunge: 0 },
  // a full turn of the blade while sprinting: hits in front and behind, twice
  spin: { clip: 'Sword_Slash', dur: 0.44, on: 0.05, off: 0.34, reach: 1.9, up: 1.3, dmg: 1.4, knock: 5.5, stop: 0.05, lunge: 0, back: 1.9 },
  // the launcher: an upward cut that throws a light foe into the air, the hero hopping after it
  rise: { clip: 'Kick_Right', dur: 0.38, on: 0.05, off: 0.22, reach: 1.75, up: 2.2, dmg: 1.5, knock: 1.5, stop: 0.07, lunge: 0, lift: 13 },
  // the dive: a plunging cut down and forward until the ground
  dive: { clip: 'Sword_Slash', dur: 2.0, on: 0.04, off: 2.0, reach: 1.35, up: 0.9, dmg: 2.2, knock: 6, stop: 0.05, lunge: 0, low: 0.6 },
  // the iaido flash: a dash through the line, the cuts land a beat later
  iaido: { clip: 'Sword_Slash', dur: 0.46, on: 0.0, off: 0.14, reach: 1.0, up: 1.2, dmg: 4.5, knock: 9, stop: 0.14, lunge: 0, back: 0.6 },
  // blade & bolt: a point-blank plasma blast that ends the chain
  burst: { clip: 'Gun_Shoot', dur: 0.4, on: 0.07, off: 0.16, reach: 3.2, up: 1.2, dmg: 2.6, knock: 11, stop: 0.1, lunge: 0 },
};
/** The air string's first hit hangs the hero this long under light gravity (once per jump). */
export const AIR_HANG = 0.1;
export const AIR_HANG_GRAVITY = 0.3;
/** Air control while swinging in the air (a share of the normal air acceleration). */
export const AIR_ATTACK_CONTROL = 0.55;
/** Most blows in one jump (the air string's three). */
export const AIR_MAX = 3;
/** The launcher: the hero's hop, and how long after a jump ATTACK + up still launches. */
export const RISE_HOP = 12.5;
export const RISE_WINDOW = 0.16;
/** A juggled foe falls under this share of gravity. */
export const JUGGLE_GRAVITY = 0.6;
/** The dive's speed (forward, down). */
export const DIVE_V = { x: 10.5, y: -19 };
/** Sprinting this long (seconds) turns ATTACK into the cyclone. */
export const SPIN_RUN = 0.3;
/** The iaido: hold ATTACK this long after the lunge to draw; the dash's length; the cut's delay. */
export const IAIDO_HOLD = 0.32;
export const IAIDO_DIST = 6.5;
export const IAIDO_DELAY = 0.3;
/** Mirror Cut: a sword blow that meets a bolt this early in its swing sends it back. */
export const MIRROR_WINDOW = 0.11;
export const MIRROR_DMG = 3;
/** Holding ATTACK this long after the second blow charges the cleave. */
export const CHARGE_TIME = 0.35;
/** ATTACK this soon after a roll is the lunge. */
export const LUNGE_WINDOW = 0.3;
/** The lunge's dash (Sword II: longer). */
export const LUNGE_DIST = [4.2, 4.2, 5.6, 5.6];
/** A foe this close, a foe winding up or a blow dealt or taken this recently: in combat. */
export const COMBAT_RANGE = 7;
export const COMBAT_MEMORY = 2.5;

/** The blaster: heat per shot, cooling and the overheat lockout. */
export const GUN = { speed: 24, range: 15, dmg: 0.65, heat: 17, cool: 42, coolDelay: 0.35, lockout: 1.7, rate: 0.2, coolantTime: 4 };

export type FoeKind = 'walker' | 'gunner' | 'drone' | 'gdrone' | 'brute' | 'turret' | 'cannon' | 'double' | 'tele' | 'boss';

export interface FoeDef {
  hp: number;
  w: number;
  h: number;
  /** Contact damage. */
  touch: number;
  score: number;
  /** Gears dropped. */
  gears: number;
  flies?: boolean;
  fixed?: boolean;
  armour?: number;
}
export const FOE: Record<FoeKind, FoeDef> = {
  walker: { hp: 3, w: 0.95, h: 1.0, touch: 1, score: 100, gears: 1 },
  gunner: { hp: 3, w: 0.95, h: 1.25, touch: 1, score: 150, gears: 2 },
  drone: { hp: 2, w: 0.9, h: 0.8, touch: 1, score: 120, gears: 1, flies: true },
  gdrone: { hp: 2, w: 0.9, h: 0.85, touch: 1, score: 160, gears: 2, flies: true },
  brute: { hp: 10, w: 1.6, h: 2.0, touch: 1, score: 450, gears: 5, armour: 6 },
  turret: { hp: 4, w: 1.1, h: 0.9, touch: 1, score: 200, gears: 2, fixed: true },
  cannon: { hp: 5, w: 1.1, h: 0.9, touch: 1, score: 250, gears: 3, fixed: true },
  double: { hp: 6, w: 1.1, h: 0.9, touch: 1, score: 300, gears: 3, fixed: true },
  tele: { hp: 6, w: 1.2, h: 0.4, touch: 0, score: 300, gears: 3, fixed: true },
  boss: { hp: 60, w: 2.8, h: 3.6, touch: 1, score: 5000, gears: 40 },
};
/** Each boss's health by district (×TUNING.bossHp). */
export const BOSS_HP = [60, 85, 100, 115];

/** Model scale of each foe in the view (the kit's robots are small). */
export const FOE_SCALE: Record<FoeKind, number> = {
  walker: 1.45, gunner: 1.45, drone: 1.5, gdrone: 1.5, brute: 2.1, turret: 1.05, cannon: 1.05, double: 1.05, tele: 1.1, boss: 2.9,
};

export const SCORE = { gear: 10, chip: 500, clear: 1000, noHit: 1000, timeBonus: 25, boss: 5000 };
/** Combo: the chain resets this long after the last hit; the score factor grows every 5 hits up to ×2. */
export const COMBO_TIME = 2.5;
export const comboMult = (n: number): number => 1 + Math.min(4, Math.floor(n / 5)) * 0.25;

/** Hazard cycles: off, warn, on (seconds). */
export const HAZARD = {
  cable: [1.5, 0.55, 1.2],
  steam: [1.7, 0.55, 1.0],
  laser: [1.25, 0.45, 1.4],
};
export const FALL_SHAKE = 0.45;
export const FALL_RESPAWN = 4.5;

export const DISTRICTS = 4;

/** The ramp across the districts (both difficulties): tougher foes, shorter warnings, quicker attacks, faster bolts. */
export const DISTRICT_SCALE = {
  hp: [1, 1.2, 1.4, 1.6],
  tell: [1, 0.94, 0.88, 0.82],
  cooldown: [1, 0.9, 0.82, 0.74],
  shot: [1, 1.06, 1.12, 1.2],
};
