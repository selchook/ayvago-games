// The half court in metres. x runs from the half-court line (0) to the baseline (12) on the right
// of the screen, z across the court from the far sideline (-7.5) to the near one (7.5, the
// camera's side). One hoop at the right; FIBA 3x3 sizes with a slightly larger ball and rim so
// the action reads on a phone.

export const COURT_L = 12;             // half-court line to baseline
export const COURT_W = 15;
export const HALF_W = COURT_W / 2;
export const HOOP_X = COURT_L - 1.575; // rim centre
export const HOOP_Z = 0;
export const RIM_Y = 3.05;
export const RIM_R = 0.3;              // inner radius of the ring
export const BALL_R = 0.16;
export const BOARD_X = COURT_L - 1.2;  // face of the backboard
export const BOARD_HALF_W = 0.9;
export const BOARD_Y0 = 2.9;
export const BOARD_Y1 = 3.95;
export const ARC_R = 6.75;             // the 3-point arc
export const ARC_SIDE = 6.6;           // its straight lines along the sidelines
export const KEY_W = 4.9;              // the painted lane
export const KEY_L = 5.8;
export const DUNK_R = 2.7;             // a shot started this close becomes a dunk

/** Where players may stand (a little past the lines: street ball has no out of bounds). */
export const BOUNDS = { x0: -2.4, x1: 12.4, z0: -7.9, z1: 7.9 };

export const hoopDist = (x: number, z: number): number => Math.hypot(x - HOOP_X, z - HOOP_Z);

/** True behind the 3-point line. */
export function isThree(x: number, z: number): boolean {
  if (Math.abs(z) >= ARC_SIDE && x > HOOP_X - 0.5) return true;
  return hoopDist(x, z) > ARC_R;
}

/** True far enough behind the arc to count as a take-back. */
export function isCleared(x: number, z: number): boolean {
  if (Math.abs(z) >= ARC_SIDE + 0.15 && x > HOOP_X - 0.5) return true;
  return hoopDist(x, z) > ARC_R + 0.15;
}

/** The nearest spot just behind the arc (for a take-back). */
export function outsideSpot(x: number, z: number, extra = 0.9): { x: number; z: number } {
  const dx = x - HOOP_X, dz = z - HOOP_Z;
  const d = Math.hypot(dx, dz) || 1;
  let ux = dx / d, uz = dz / d;
  // never towards the baseline: swing the way out round to the top of the arc
  if (ux > -0.25) { ux = -0.25; uz = Math.sign(uz || 1) * Math.sqrt(1 - ux * ux); }
  return { x: HOOP_X + ux * (ARC_R + extra), z: HOOP_Z + uz * (ARC_R + extra) };
}

/** Offence spots round the arc and in the paint (index 0 is the top of the key). */
export const SPOTS: ReadonlyArray<{ x: number; z: number; three: boolean }> = [
  { x: 3.0, z: 0, three: true },        // top
  { x: 5.0, z: -4.6, three: true },     // left wing (far side)
  { x: 5.0, z: 4.6, three: true },      // right wing (near side)
  { x: 10.6, z: -6.9, three: true },    // far corner
  { x: 10.6, z: 6.9, three: true },     // near corner
  { x: 8.6, z: -2.4, three: false },    // far elbow / post
  { x: 8.6, z: 2.4, three: false },     // near elbow / post
  { x: 7.0, z: 0, three: false },       // free-throw line
];

/** Starting spots for the tip-off: the jumpers at the top of the key, the others spread out. */
export const TIP_SPOTS: ReadonlyArray<ReadonlyArray<{ x: number; z: number }>> = [
  [{ x: 3.3, z: 0.15 }, { x: 1.8, z: -3.6 }, { x: 1.8, z: 3.6 }],
  [{ x: 4.7, z: -0.15 }, { x: 6.6, z: -3.2 }, { x: 6.6, z: 3.2 }],
];
export const TIP_BALL = { x: 4.0, z: 0 };
