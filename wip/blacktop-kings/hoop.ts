// The ball's physics round the hoop: gravity, the rim as a torus (a ring of round steel tube), the
// backboard, the net, the floor and the fence, stepped at a fixed 240 Hz. Pure and deterministic:
// the simulation runs a shot with it, and before the ball leaves the shooter's hands it runs the
// same steps ahead to pick a release that ends the way the shot meter's odds decided (a perfect
// release finds a clean swish, a poor one an arc that hits the rim). No three.js, no Math.random.
import { BALL_R, BOARD_HALF_W, BOARD_X, BOARD_Y0, BOARD_Y1, BOUNDS, HOOP_X, HOOP_Z, RIM_R, RIM_Y } from './court';

export const G = 11;
/** Physics substeps a second. */
export const SUB = 240;
/** The rim: the tube's middle line and its radius (m). */
export const RIM_C = RIM_R + 0.012;
export const RIM_TUBE = 0.02;
/** Restitution (bounce) and the tangential speed kept, per contact. */
const E_RIM = 0.56, F_RIM = 0.9;
const E_BOARD = 0.64, F_BOARD = 0.88;
const E_FLOOR = 0.7;
const BOARD_T = 0.06;

export interface Body { x: number; y: number; z: number; vx: number; vy: number; vz: number }

/** What a step touched: impact speeds into the rim, the board and the floor (0 = none), a basket. */
export interface Hit { rim: number; board: number; floor: number; through: boolean }
export const noHit = (h: Hit): Hit => { h.rim = 0; h.board = 0; h.floor = 0; h.through = false; return h; };

/**
 * One substep of free flight. `net`: the ball dropped through the ring, so the net slows and
 * centres it on the way down.
 */
export function ballStep(b: Body, h: number, net: boolean, hit: Hit): void {
  b.vy -= G * h;
  const py = b.y;
  b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
  const dx = b.x - HOOP_X, dz = b.z - HOOP_Z, r = Math.hypot(dx, dz);
  // down through the ring
  if (py > RIM_Y && b.y <= RIM_Y && r < RIM_C && b.vy < 0) hit.through = true;
  if (net && b.y < RIM_Y && b.y > RIM_Y - 0.6 && r < RIM_C + 0.05) {
    // the net grabs it: slower, pulled to the middle
    const k = Math.max(0, 1 - 9 * h);
    b.vx *= k; b.vz *= k; b.vy *= Math.max(0, 1 - 2.5 * h);
    b.x -= dx * 7 * h; b.z -= dz * 7 * h;
  } else rim(b, dx, dz, r, hit);
  // the backboard's face (and its back, for a ball coming over the top)
  if (Math.abs(b.z - HOOP_Z) < BOARD_HALF_W + BALL_R * 0.5 && b.y > BOARD_Y0 - BALL_R * 0.5 && b.y < BOARD_Y1 + BALL_R * 0.5) {
    if (b.vx > 0 && b.x + BALL_R > BOARD_X && b.x < BOARD_X + BOARD_T * 0.5) {
      b.x = BOARD_X - BALL_R;
      hit.board = Math.max(hit.board, b.vx);
      b.vx = -b.vx * E_BOARD; b.vy *= F_BOARD; b.vz *= F_BOARD;
    } else if (b.vx < 0 && b.x - BALL_R < BOARD_X + BOARD_T && b.x > BOARD_X + BOARD_T * 0.5) {
      b.x = BOARD_X + BOARD_T + BALL_R;
      b.vx = -b.vx * E_BOARD;
    }
  }
  // the floor
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) {
      hit.floor = Math.max(hit.floor, -b.vy);
      b.vy = -b.vy * E_FLOOR;
      if (b.vy < 0.6) b.vy = 0;
      b.vx *= 0.86; b.vz *= 0.86;
    }
  }
  if (b.y <= BALL_R + 0.001) {
    // rolling
    const k = Math.max(0, 1 - 0.9 * h);
    b.vx *= k; b.vz *= k;
  }
  // the fence round the court
  if (b.x < BOUNDS.x0 - 0.6) { b.x = BOUNDS.x0 - 0.6; b.vx = Math.abs(b.vx) * 0.5; }
  if (b.x > BOUNDS.x1 + 1.6) { b.x = BOUNDS.x1 + 1.6; b.vx = -Math.abs(b.vx) * 0.5; }
  if (b.z < BOUNDS.z0 - 1) { b.z = BOUNDS.z0 - 1; b.vz = Math.abs(b.vz) * 0.5; }
  if (b.z > BOUNDS.z1 + 0.8) { b.z = BOUNDS.z1 + 0.8; b.vz = -Math.abs(b.vz) * 0.5; }
}

/**
 * The rim as a torus: the nearest point of the tube's middle circle, the contact normal from it
 * to the ball's middle, push out and bounce (restitution along the normal, a little friction
 * along the tube). A slow ball on the rim rolls round it under gravity until it drops one way.
 */
function rim(b: Body, dx: number, dz: number, r: number, hit: Hit): void {
  const min = BALL_R + RIM_TUBE;
  if (r < RIM_C - min - 0.01 || r > RIM_C + min + 0.01 || Math.abs(b.y - RIM_Y) > min) return;
  const k = r > 1e-6 ? RIM_C / r : 0;
  const qx = HOOP_X + dx * k, qz = HOOP_Z + (r > 1e-6 ? dz * k : RIM_C);
  const nx = b.x - qx, ny = b.y - RIM_Y, nz = b.z - qz;
  const d = Math.hypot(nx, ny, nz);
  if (d >= min || d < 1e-6) return;
  const ux = nx / d, uy = ny / d, uz = nz / d;
  b.x = qx + ux * min; b.y = RIM_Y + uy * min; b.z = qz + uz * min;
  const vn = b.vx * ux + b.vy * uy + b.vz * uz;
  if (vn >= 0) return;
  const tx = b.vx - vn * ux, ty = b.vy - vn * uy, tz = b.vz - vn * uz;
  b.vx = tx * F_RIM - vn * E_RIM * ux;
  b.vy = ty * F_RIM - vn * E_RIM * uy;
  b.vz = tz * F_RIM - vn * E_RIM * uz;
  hit.rim = Math.max(hit.rim, -vn);
}

/** A shot in flight, decided: 1 in, -1 out, 0 not yet. */
export function judge(b: Body, through: boolean): number {
  if (through) return 1;
  if (b.vy < 0 && b.y < RIM_Y - 0.25) return -1;
  const dx = b.x - HOOP_X, dz = b.z - HOOP_Z;
  if (dx * b.vx + dz * b.vz > 0 && Math.hypot(dx, dz) > 2.2) return -1;
  return 0;
}

export interface Plan { made: boolean; rims: number; board: boolean; t: number }

const _b: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const _h: Hit = { rim: 0, board: 0, floor: 0, through: false };

/** Runs a shot ahead, exactly as the simulation will, to see how it ends. */
export function predict(b0: Body, maxT = 4): Plan {
  const b = Object.assign(_b, b0);
  const h = 1 / SUB;
  let rims = 0, board = false, wasRim = false;
  for (let t = 0; t < maxT; t += h) {
    noHit(_h);
    ballStep(b, h, false, _h);
    if (_h.rim > 0 && !wasRim) rims++;
    wasRim = _h.rim > 0;
    if (_h.board > 0) board = true;
    const j = judge(b, _h.through);
    if (j) return { made: j > 0, rims, board, t };
  }
  return { made: false, rims, board, t: maxT };
}

/** The launch velocity that carries the ball from s to p in T seconds. */
export function launch(s: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }, T: number, out: Body): Body {
  out.x = s.x; out.y = s.y; out.z = s.z;
  out.vx = (p.x - s.x) / T; out.vz = (p.z - s.z) / T;
  out.vy = (p.y - s.y + 0.5 * G * T * T) / T;
  return out;
}
