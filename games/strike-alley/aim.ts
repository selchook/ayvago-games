// Aiming the way bowlers do: a lane is 39 boards, numbered from the right gutter (board 1) for a
// right-hander. The player picks the board the ball is laid down on at the foul line (the stand)
// and a target board at the arrows, 15 ft down the lane; the ball's line runs from one through
// the other. Pure numbers on the game's own simulation, shared by the scene, the bot and tests.
import { LANE_HALF, HEAD_Z, POCKET_X, ballPath, type Release, type SimTune } from './sim';

export const BOARDS = 39;
export const BOARD_W = (2 * LANE_HALF) / BOARDS;
/** Centre x of a board (1 = the right edge). */
export const boardX = (b: number): number => LANE_HALF - (b - 0.5) * BOARD_W;
/** Board under x (fractional). */
export const xBoard = (x: number): number => (LANE_HALF - x) / BOARD_W + 0.5;
/** The seven arrows' boards. */
export const ARROWS = [5, 10, 15, 20, 25, 30, 35];
/** Range of the stand (the ball stays clear of the gutters) and the farthest the target may be from it. */
export const STAND_MIN = 4;
export const STAND_MAX = 36;
export const TARGET_SPREAD = 12;
/** Where the sim lays the ball on the boards (z). */
export const LAY_Z = -0.05;

/** z of the arrows at a board: a shallow V, 15 ft at the outside arrows, a foot further in the middle. */
export function arrowZ(b: number): number {
  const off = Math.min(3, Math.abs(b - 20) / 5);
  return -(4.57 + (3 - off) * 0.3048 / 3);
}

/** The tip of the arrow (the point aimed over). */
export const arrowTipZ = (b: number): number => arrowZ(b) - 0.17;

/** Clamps a stand board and a target board to what the lane allows. */
export function clampAim(stand: number, target: number): [number, number] {
  const s = Math.min(STAND_MAX, Math.max(STAND_MIN, stand));
  const t = Math.min(Math.min(BOARDS, s + TARGET_SPREAD), Math.max(Math.max(1, s - TARGET_SPREAD), target));
  return [s, t];
}

/** The release that lays the ball on `stand` and sends it over `target` at the arrows. */
export function releaseFor(stand: number, target: number, speed: number, hook: number): Release {
  const xs = boardX(stand), xt = boardX(target);
  const angle = Math.atan2(xt - xs, LAY_Z - arrowTipZ(target));
  return { x: xs, angle, speed, hook };
}

/** The target board (fractional) that a release angle crosses at the arrows. */
export function targetFor(stand: number, angle: number): number {
  // iterate: the arrow row's distance depends on the board a little
  let t = stand;
  for (let i = 0; i < 4; i++) t = xBoard(boardX(stand) + Math.tan(angle) * (LAY_Z - arrowTipZ(t)));
  return t;
}

export type PathPt = { x: number; z: number; gutter: boolean };

/**
 * The breakpoint: where the ball turns towards the pocket. For a ball that drifts out first it is
 * the farthest point out; otherwise the point where the hook pulls it a board off its launch line.
 * Returns the index into the path (or -1 for a straight ball).
 */
export function breakpoint(pts: PathPt[], hook: number): number {
  if (pts.length < 4 || Math.abs(hook) < 0.04) return -1;
  const side = Math.sign(hook);   // + hooks left (to -x)
  // farthest out (towards +x for a left hook)
  let best = -1, bestX = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].gutter) break;
    const out = -side * pts[i].x;
    if (out > bestX + 1e-4) { bestX = out; best = i; }
  }
  if (best > 1 && best < pts.length - 2) return best;
  // otherwise: off the launch line by a board
  const a = pts[0], b = pts[1];
  const dxdz = (b.x - a.x) / (b.z - a.z);
  for (let i = 2; i < pts.length; i++) {
    const lin = a.x + dxdz * (pts[i].z - a.z);
    if (Math.abs(pts[i].x - lin) > BOARD_W) return i;
  }
  return -1;
}

/** x where the ball crosses a given z (NaN if it never does on the lane). */
export function xAtZ(tune: SimTune, r: Release, z: number): number {
  const pts = ballPath(tune, r, 0.2);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.gutter) return NaN;
    if (a.z >= z && b.z < z) return a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z);
  }
  return NaN;
}

export interface Tip {
  /** Boards the ball missed by (+ = to the left of where it should be), at the pins. */
  miss: number;
  /** Move the stand by this many boards (+ = to the left, towards higher boards). */
  move: number;
  /** …or (when the feet need not move) the target. */
  moveTarget: number;
}

/**
 * Advice after a ball: how far it missed the pocket (or the key pin of a spare) and the move of
 * the stand (keeping the target) that would have hit it, worked out on the same simulation
 * (bowlers' "move your feet, keep your mark", 3-6-9 style).
 */
export function tipFor(tune: SimTune, stand: number, target: number, speed: number, hook: number, aimX = Math.sign(hook || 1) * POCKET_X, aimZ = HEAD_Z): Tip | null {
  // the lane-only path ends just past the head pin: pins further back are aimed at on its row
  const z = Math.max(aimZ, HEAD_Z - 0.1);
  const at = (s: number, t: number) => xAtZ(tune, releaseFor(s, t, speed, hook), z);
  const x0 = at(stand, target);
  const missX = Number.isNaN(x0) ? NaN : x0 - aimX;
  // search the stand (half boards) with the same target, then the target alone
  let best = 0, bestErr = Infinity;
  for (let d = -12; d <= 12; d += 0.5) {
    const [s, t] = clampAim(stand + d, target);
    if (s !== stand + d || t !== target) continue;
    const x = at(s, t);
    if (Number.isNaN(x)) continue;
    const err = Math.abs(x - aimX) + Math.abs(d) * 0.0005;
    if (err < bestErr) { bestErr = err; best = d; }
  }
  let bestT = 0, errT = Infinity;
  for (let d = -6; d <= 6; d += 0.5) {
    const [s, t] = clampAim(stand, target + d);
    if (t !== target + d || s !== stand) continue;
    const x = at(s, t);
    if (Number.isNaN(x)) continue;
    const err = Math.abs(x - aimX) + Math.abs(d) * 0.0005;
    if (err < errT) { errT = err; bestT = d; }
  }
  if (!Number.isFinite(bestErr) && !Number.isFinite(errT)) return null;
  return {
    miss: Number.isNaN(missX) ? NaN : -missX / BOARD_W,
    move: bestErr <= errT + 0.01 ? best : 0,
    moveTarget: bestErr <= errT + 0.01 ? 0 : bestT,
  };
}
