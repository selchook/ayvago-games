// A headless bowler on the game's own simulation: finds the release angle that sends a ball
// (start x, speed, hook) through a target x at the head pin. Used by the test hooks and the
// strike-rate check (the same numbers the game steps).
import { ballPath, HEAD_Z, POCKET_X, type Release, type SimTune } from './sim';

/** x of the ball where it crosses the head pin row (NaN in a gutter). */
export function xAtHead(tune: SimTune, r: Release): number {
  const pts = ballPath(tune, r, 0.25);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.gutter) return NaN;
    if (a.z >= HEAD_Z && b.z < HEAD_Z) return a.x + (b.x - a.x) * (HEAD_Z - a.z) / (b.z - a.z);
  }
  return NaN;
}

/** The angle (radians) that sends the ball through `target` at the head pin (bisection). */
export function aimFor(tune: SimTune, x: number, speed: number, hook: number, target = Math.sign(hook || 1) * POCKET_X): number {
  let lo = -0.06, hi = 0.06;
  const f = (a: number) => {
    const v = xAtHead(tune, { x, angle: a, speed, hook });
    return Number.isNaN(v) ? (a > 0 ? 1 : -1) : v - target;
  };
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
