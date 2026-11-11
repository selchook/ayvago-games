// The four-step approach of a right-handed bowler as a timeline (seconds from the start):
//
//   step 1 (right foot)  push-away: the ball goes out in front
//   step 2 (left foot)   the ball drops into the swing, past the leg
//   step 3 (right foot)  top of the backswing
//   step 4 (left foot)   the slide: the forward swing, the release low by the sliding ankle,
//                        then the follow-through up past the shoulder
//
// The walk is driven by distance (the walk clip's phase follows the feet, so they stay planted);
// the steps speed up, the slide decelerates to a stop at the foul line. Pure numbers: the scene
// poses the bowler from it, and the release point is known before the throw starts.
import { Person } from './bowler';

const DEG = Math.PI / 180;

/** Walk phase (in loops of the walk clip) when the bowler starts: feet together, right leg next. */
export const PHASE0 = 0.45;
/** Phase of the fourth step's plant (the left foot lands and slides). */
const PHASE_SLIDE = 2.2;
/** Ground covered by the four steps and by the slide (m). */
export const WALK_D = (PHASE_SLIDE - PHASE0) * Person.WALK_LOOP;
export const SLIDE_D = 0.42;
export const APPROACH_D = WALK_D + SLIDE_D;
/** Walking speed at the start, and the steps' time. */
const V0 = 1.3;
export const WALK_T = 1.15;
const ACC = 2 * (WALK_D - V0 * WALK_T) / (WALK_T * WALK_T);
const V_SLIDE = V0 + ACC * WALK_T;
export const SLIDE_T = 2 * SLIDE_D / V_SLIDE;
/** The ball leaves the hand (the bottom of the forward swing, as the slide ends). */
export const RELEASE_T = WALK_T + SLIDE_T * 0.86;
/** The pose is held in the follow-through until here, then the bowler stands up. */
export const HOLD_T = RELEASE_T + 1.1;
export const RISE_T = HOLD_T + 0.6;

/** Arm swing keyframes (time, degrees: + forward of hanging straight down). */
const SWING: [number, number][] = [
  [0, 55], [0.26, 74], [0.48, 34], [0.64, 0], [0.8, -50], [0.95, -76], [1.1, -58],
  [RELEASE_T - 0.1, -22], [RELEASE_T, 8], [RELEASE_T + 0.16, 95], [RELEASE_T + 0.36, 138], [HOLD_T, 146], [RISE_T, 40], [RISE_T + 0.6, 10],
];

/** Monotone cubic (Fritsch–Carlson) through keyframes. */
function curve(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const slope = (k: number) => (keys[k + 1][1] - keys[k][1]) / (keys[k + 1][0] - keys[k][0]);
  const tan = (k: number) => {
    if (k === 0 || k === n - 1) return 0;
    const a = slope(k - 1), b = slope(k);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const [t0, y0] = keys[i], [t1, y1] = keys[i + 1];
  const h = t1 - t0, s = (t - t0) / h;
  const m0 = tan(i) * h, m1 = tan(i + 1) * h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * m1;
}

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export interface ApproachPose {
  /** Ground covered from the stance (m), and the speed (m/s). */
  d: number;
  v: number;
  /** Walk clip distance for the legs (stops growing at the slide). */
  gait: number;
  /** Right arm swing (rad), out to the side (rad). */
  swing: number;
  abd: number;
  /** Left arm: weight of the procedural pose, swing, out to the side. */
  lw: number;
  lSwing: number;
  lAbd: number;
  /** The slide's lunge (0..1) and the torso's lean (rad). */
  lunge: number;
  pitch: number;
}

/** The bowler's pose `t` seconds into the throw. */
export function approachPose(t: number, out: Partial<ApproachPose> = {}): ApproachPose {
  const o = out as ApproachPose;
  if (t < WALK_T) {
    const tt = Math.max(0, t);
    o.d = V0 * tt + 0.5 * ACC * tt * tt;
    o.v = V0 + ACC * tt;
  } else {
    const s = Math.min(SLIDE_T, t - WALK_T);
    o.d = WALK_D + V_SLIDE * s - 0.5 * (V_SLIDE / SLIDE_T) * s * s;
    o.v = Math.max(0, V_SLIDE - (V_SLIDE / SLIDE_T) * s);
  }
  o.gait = Math.min(o.d, WALK_D);
  o.swing = curve(SWING, t) * DEG;
  // the arm moves out a little from the hip on the way back, in again for the release
  o.abd = (-0.12 + 0.3 * smooth(0.3, 0.7, t) - 0.12 * smooth(1.05, RELEASE_T, t) - 0.06 * smooth(RELEASE_T, RELEASE_T + 0.3, t));
  // left hand under the ball in the stance, then the walk's own swing, then out wide for balance
  o.lw = Math.max(1 - smooth(0.12, 0.45, t), smooth(WALK_T - 0.3, WALK_T, t) * (1 - smooth(HOLD_T, RISE_T, t)));
  const balance = smooth(WALK_T - 0.3, WALK_T, t);
  o.lSwing = (1 - balance) * 52 * DEG + balance * 12 * DEG;
  o.lAbd = (1 - balance) * -0.42 + balance * 1.2;
  o.lunge = smooth(WALK_T - 0.12, WALK_T + 0.1, t) * (1 - smooth(HOLD_T, RISE_T, t));
  o.pitch = (0.1 + 0.1 * smooth(0.2, WALK_T, t) + 0.22 * o.lunge) * (1 - smooth(HOLD_T, RISE_T + 0.3, t) * 0.7);
  return o;
}

/** Puts a bowler in the approach pose (base clip walk; the layers on top). */
export function poseBowler(p: Person, t: number, pose = approachPose(t)): void {
  p.armR.w = 1;
  p.armR.swing = pose.swing;
  p.armR.abd = pose.abd;
  p.armR.twist = -Math.PI / 2;
  p.armL.w = pose.lw;
  p.armL.swing = pose.lSwing;
  p.armL.abd = pose.lAbd;
  p.armL.twist = pose.lSwing > 30 * DEG ? -0.9 : 0;
  p.torso.w = 1;
  p.torso.pitch = pose.pitch;
  p.torso.keep = 0.3;
  p.torso.yaw = 0;
  p.legs.w = pose.lunge;
  p.legs.front = 44 * DEG;
  p.legs.back = 42 * DEG;
  p.legs.cross = 16 * DEG;
  p.legs.spread = 10 * DEG;
  p.headPitch = -pose.pitch * 0.75;
}
