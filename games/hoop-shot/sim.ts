// Three-point contest physics, in metres and seconds. The basket is at the origin: x runs along
// the baseline (right is +x seen from the court), y is up and z points from the baseline to
// half court. Pure code, no Phaser, so it can be tuned from Node.

export interface V3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
export const lerp3 = (a: V3, b: V3, t: number): V3 => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export const G = 9.81;
export const BALL_R = 0.12;
export const RIM_R = 0.2286;        // inner radius of the ring
export const RIM_Y = 3.05;
export const RIM_TUBE = 0.011;
export const RIM_C = v3(0, RIM_Y, 0);
/** Front face of the backboard; the board is 1.83 x 1.07 m, its bottom edge 2.9 m up. */
export const BOARD_Z = -0.38;
export const BOARD_T = 0.05;
export const BOARD = { x0: -0.915, x1: 0.915, y0: 2.9, y1: 3.97 };
export const BASELINE_Z = -1.575;
/** The net hangs this far below the ring; it slows a ball that drops through. */
export const NET_DEPTH = 0.44;

/** The five racks: left corner, left wing, top of the key, right wing, right corner. */
export interface Spot { key: string; x: number; z: number }
const wing = 7.45 * Math.SQRT1_2;
export const SPOTS: Spot[] = [
  { key: 'spotLC', x: -6.85, z: 0.35 },
  { key: 'spotLW', x: -wing, z: wing },
  { key: 'spotTop', x: 0, z: 7.45 },
  { key: 'spotRW', x: wing, z: wing },
  { key: 'spotRC', x: 6.85, z: 0.35 },
];

export interface Ball {
  p: V3; v: V3; w: V3;              // position, velocity, spin (rad/s)
  money: boolean;
  t: number;
  rim: boolean; board: boolean;     // touched this shot
  made: boolean;
  floor: number;                    // floor bounces
  power: number;                    // release power, for the short/long hint
  ideal: number;
}

export interface StepEvents { rim: number; board: number; floor: number; made: boolean; rimX: number }

/** Contact with a surface whose outward normal is n: bounce (e) plus friction (mu) that trades spin and slip. */
function contact(b: Ball, n: V3, e: number, mu: number): number {
  const vn = dot(b.v, n);
  if (vn >= 0) return 0;
  const jn = -(1 + e) * vn;
  b.v = add(b.v, mul(n, jn));
  // contact point velocity: v + w x r, r from the centre to the contact point
  const r = mul(n, -BALL_R);
  const vc = add(b.v, cross(b.w, r));
  const vt = sub(vc, mul(n, dot(vc, n)));
  const slip = len(vt);
  if (slip > 1e-6) {
    const t = mul(vt, 1 / slip);
    // hollow sphere: I = 2/3 m r^2, so stopping the slip takes slip / (1 + 3/2)
    const jt = Math.min(mu * jn, slip / 2.5);
    b.v = sub(b.v, mul(t, jt));
    b.w = add(b.w, mul(cross(r, mul(t, -jt)), 3 / (2 * BALL_R * BALL_R)));
  }
  return -vn;
}

/** Advances one ball by dt seconds (sub-stepped). */
export function stepBall(b: Ball, dt: number): StepEvents {
  const ev: StepEvents = { rim: 0, board: 0, floor: 0, made: false, rimX: 0 };
  const n = 8, h = dt / n;
  for (let s = 0; s < n; s++) {
    const prevY = b.p.y;
    b.v.y -= G * h;
    b.p = add(b.p, mul(b.v, h));
    // ring: the nearest point on the circle of the rim
    const dx = b.p.x, dz = b.p.z, q = Math.hypot(dx, dz);
    const ux = q > 1e-6 ? dx / q : 1, uz = q > 1e-6 ? dz / q : 0;
    const near = v3(ux * RIM_R, RIM_Y, uz * RIM_R);
    let d = sub(b.p, near);
    let dl = len(d);
    if (dl < BALL_R + RIM_TUBE && dl > 1e-6) {
      const nn = mul(d, 1 / dl);
      b.p = add(near, mul(nn, BALL_R + RIM_TUBE));
      const hit = contact(b, nn, 0.52, 0.22);
      if (hit > 0.15) { ev.rim = Math.max(ev.rim, hit); ev.rimX = near.x; }
      b.rim = true;
    }
    // the bracket that holds the ring to the board
    if (b.p.z < -RIM_R + 0.02 && b.p.z > BOARD_Z - 0.02 && Math.abs(b.p.x) < 0.06 + BALL_R && Math.abs(b.p.y - (RIM_Y - 0.03)) < 0.05 + BALL_R) {
      const nn = b.p.y > RIM_Y - 0.03 ? v3(0, 1, 0) : v3(0, -1, 0);
      const hit = contact(b, nn, 0.4, 0.2);
      if (hit > 0.15) { ev.rim = Math.max(ev.rim, hit); ev.rimX = 0; }
      b.rim = true;
    }
    // backboard: a thin plate, so edges and the top bounce too
    const cx = Math.max(BOARD.x0, Math.min(BOARD.x1, b.p.x));
    const cy = Math.max(BOARD.y0, Math.min(BOARD.y1, b.p.y));
    const cz = Math.max(BOARD_Z - BOARD_T, Math.min(BOARD_Z, b.p.z));
    d = v3(b.p.x - cx, b.p.y - cy, b.p.z - cz);
    dl = len(d);
    if (dl < BALL_R && dl > 1e-6) {
      const nn = mul(d, 1 / dl);
      b.p = add(v3(cx, cy, cz), mul(nn, BALL_R));
      const hit = contact(b, nn, 0.58, 0.3);
      if (hit > 0.15) ev.board = Math.max(ev.board, hit);
      b.board = true;
    }
    // floor
    if (b.p.y < BALL_R) {
      b.p.y = BALL_R;
      const hit = contact(b, v3(0, 1, 0), 0.74, 0.45);
      if (hit > 0.6) { ev.floor = Math.max(ev.floor, hit); b.floor++; }
    }
    // a make: the centre drops through the ring from above
    if (!b.made && prevY > RIM_Y && b.p.y <= RIM_Y && b.v.y < 0 && Math.hypot(b.p.x, b.p.z) < RIM_R) {
      b.made = true;
      ev.made = true;
    }
    // the net drags on a ball inside it
    if (b.made && b.p.y < RIM_Y && b.p.y > RIM_Y - NET_DEPTH - 0.1 && Math.hypot(b.p.x, b.p.z) < RIM_R + 0.05) {
      const k = Math.pow(0.02, h);
      b.v.x *= k; b.v.z *= k;
      b.v.y *= Math.pow(0.35, h);
      b.w = mul(b.w, Math.pow(0.1, h));
    }
  }
  b.t += dt;
  return ev;
}

/** Where the ball is aimed: the middle of the ring, a touch past the front rim. */
export function aimPoint(): V3 {
  return v3(0, RIM_Y, 0);
}

/** Launch speed that puts a ball from `from` through `to` at the given angle (deg), or 0. */
export function idealSpeed(from: V3, to: V3, angleDeg: number): number {
  const d = Math.hypot(to.x - from.x, to.z - from.z), hgt = to.y - from.y;
  const th = (angleDeg * Math.PI) / 180;
  const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - hgt);
  return den > 0 ? Math.sqrt((G * d * d) / den) : 0;
}

export interface ShotParams { power: number; ideal: number; spread: number; aimDeg: number; angleDeg: number; spin: number }

/** A new ball released at `from`: power on the meter (ideal = perfect), aim in degrees off the rim. */
export function launch(from: V3, sp: ShotParams, money: boolean): Ball {
  const to = aimPoint();
  const v0 = idealSpeed(from, to, sp.angleDeg) * (1 + (sp.power - sp.ideal) * sp.spread);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z) + (sp.aimDeg * Math.PI) / 180;
  const th = (sp.angleDeg * Math.PI) / 180;
  const dir = v3(Math.sin(yaw), 0, Math.cos(yaw));
  const v = v3(dir.x * Math.cos(th) * v0, Math.sin(th) * v0, dir.z * Math.cos(th) * v0);
  // backspin: the top of the ball turns back towards the shooter
  const w = mul(cross(dir, v3(0, 1, 0)), sp.spin);
  return { p: { ...from }, v, w, money, t: 0, rim: false, board: false, made: false, floor: 0, power: sp.power, ideal: sp.ideal };
}

/** Flight preview (no collisions) for the aim hint: points until the ball falls below the rim. */
export function preview(from: V3, sp: ShotParams, maxT = 2): V3[] {
  const b = launch(from, sp, false);
  const pts: V3[] = [];
  const dt = 1 / 30;
  for (let t = 0; t < maxT; t += dt) {
    b.v.y -= G * dt;
    b.p = add(b.p, mul(b.v, dt));
    pts.push({ ...b.p });
    if (b.v.y < 0 && b.p.y < RIM_Y - 0.2) break;
  }
  return pts;
}
