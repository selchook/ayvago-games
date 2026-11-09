// The steering response shared by the on-screen wheel and tilt: a gentle centre, so small thumb
// or phone movements make small corrections, while a full turn still gives full lock.

/** Exponent of the centre curve (1 = linear). At a quarter input the car steers about 0.15. */
export const STEER_CURVE = 1.35;

/** Maps a linear input (-1 .. 1, clamped) to steering with a gentle centre. */
export function steerCurve(x: number): number {
  const a = Math.min(1, Math.abs(x));
  return Math.sign(x) * a ** STEER_CURVE;
}

/** The inverse: the linear input that gives this steering (draws the wheel for tilt). */
export function steerCurveInverse(s: number): number {
  const a = Math.min(1, Math.abs(s));
  return Math.sign(s) * a ** (1 / STEER_CURVE);
}
