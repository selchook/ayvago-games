// The dribble moves and the dunks: what the simulation needs to know about each (timing, the
// burst, the ankle-breaker and steal odds, the dunk's take-off and height). No three.js here; the
// poses that draw them are in poses.ts. The kind travels as a number in the snapshots and events.

export interface MoveDef {
  id: 'cross' | 'btl' | 'btb' | 'spin' | 'hesi';
  /** Length of the move (s). */
  T: number;
  /** The ball ends in the other hand. */
  swap: boolean;
  /** Speed of the burst out of the move (m/s) and the moment it starts (0..1 of T). */
  burst: number;
  go: number;
  /** Base chance a close defender loses his feet. */
  ankles: number;
  /** Base chance a close defender in front picks the ball off while it is exposed (0..1 of T). */
  risk: number;
  expose: [number, number];
  /** Stamina it costs. */
  cost: number;
}

export const MOVES: MoveDef[] = [
  // crossover: the ball snaps across in front of the body, a hard cut the other way
  { id: 'cross', T: 0.4, swap: true, burst: 8.6, go: 0.34, ankles: 0.42, risk: 0.16, expose: [0.15, 0.6], cost: 22 },
  // between the legs: safer (the body shields the ball), a shorter cut
  { id: 'btl', T: 0.42, swap: true, burst: 7.4, go: 0.42, ankles: 0.34, risk: 0.06, expose: [0.3, 0.55], cost: 20 },
  // behind the back: the ball goes round the back, a cut away from the defender
  { id: 'btb', T: 0.46, swap: true, burst: 7.8, go: 0.45, ankles: 0.38, risk: 0.08, expose: [0.35, 0.7], cost: 22 },
  // spin: a full turn round the defender, the ball pulled round in the same hand
  { id: 'spin', T: 0.56, swap: false, burst: 7.2, go: 0.15, ankles: 0.46, risk: 0.13, expose: [0.25, 0.65], cost: 26 },
  // hesitation: stop, rise as if to shoot, then explode past
  { id: 'hesi', T: 0.56, swap: false, burst: 9.4, go: 0.55, ankles: 0.36, risk: 0.04, expose: [0.1, 0.4], cost: 18 },
];
export const MOVE_COUNT = MOVES.length;
export const M_CROSS = 0, M_BTL = 1, M_BTB = 2, M_SPIN = 3, M_HESI = 4;

export interface DunkDef {
  id: 'tomahawk' | 'power' | 'reverse' | 'spin360' | 'windmill' | 'alley' | 'btl' | 'hang';
  /** Distance from the rim's middle where the dunker leaves the floor (m). */
  takeoff: number;
  /** Seconds in the air up to the slam, the hang at the rim after it, and the drop. */
  rise: number;
  hang: number;
  drop: number;
  /** Jump height (m). */
  height: number;
  /** How far from the rim's middle the body ends up at the slam (m). */
  reach: number;
}

export const DUNKS: DunkDef[] = [
  { id: 'tomahawk', takeoff: 2.3, rise: 0.6, hang: 0.26, drop: 0.32, height: 1.42, reach: 0.5 },
  { id: 'power', takeoff: 1.5, rise: 0.52, hang: 0.3, drop: 0.32, height: 1.38, reach: 0.46 },
  { id: 'reverse', takeoff: 1.5, rise: 0.62, hang: 0.26, drop: 0.32, height: 1.42, reach: 0.5 },
  { id: 'spin360', takeoff: 2.0, rise: 0.7, hang: 0.24, drop: 0.32, height: 1.5, reach: 0.5 },
  { id: 'windmill', takeoff: 2.4, rise: 0.7, hang: 0.26, drop: 0.32, height: 1.5, reach: 0.5 },
  { id: 'alley', takeoff: 1.9, rise: 0.6, hang: 0.3, drop: 0.32, height: 1.5, reach: 0.48 },
  { id: 'btl', takeoff: 2.2, rise: 0.74, hang: 0.26, drop: 0.32, height: 1.58, reach: 0.5 },
  { id: 'hang', takeoff: 1.6, rise: 0.54, hang: 0.85, drop: 0.3, height: 1.4, reach: 0.4 },
];
export const D_TOMAHAWK = 0, D_POWER = 1, D_REVERSE = 2, D_360 = 3, D_WINDMILL = 4, D_ALLEY = 5, D_BTL = 6, D_HANG = 7;
/** Speed of the gather steps from where the dunk starts to the take-off (m/s), and their longest time. */
export const GATHER_V = 6.5;
export const GATHER_MAX = 0.3;
