// Pinball table geometry and ball physics. Plain maths, no Phaser: the scene draws what is here.
// The ball is a circle; walls are capsules (segments with a radius); flippers are tapered capsules
// that rotate around a pivot. Every frame is split into small substeps, so neither the ball nor a
// flipper tip moves more than a few pixels per step and the ball can never tunnel through them.
//
// The table is taller than the screen (TH) and the camera scrolls along with the ball. From top to
// bottom: the arch with four rollover lanes, the pop bumpers, the two orbit lanes along the sides
// (with a spinner in the left one), the ramp entrance, the saucer and a bank of drop targets, an
// upper flipper on the left, then the slingshots, inlanes and the main flippers.

export const BALL_R = 14;
export const MAX_SPEED = 2900;
const STEP = 1 / 960;              // longest substep (s)

export type Kind = 'wall' | 'sling' | 'target' | 'post' | 'gate';

export interface Seg {
  ax: number; ay: number; bx: number; by: number;
  r: number;                        // capsule radius
  e: number;                        // restitution
  kind: Kind;
  kick?: number;                    // slingshots push the ball off at this speed
  id?: number;
  active?: boolean;                 // drop targets fall (inactive) when hit
}

export interface Bumper { x: number; y: number; r: number; kick: number; id: number }

export interface Flipper {
  px: number; py: number;           // pivot
  len: number; r0: number; r1: number;
  rest: number; up: number;         // angles (rad, screen space: clockwise positive)
  angle: number; omega: number;
  held: boolean;
  dir: 1 | -1;                      // +1: angle grows when raised (right flipper), -1: shrinks (left)
  scale: number;                    // drawn size relative to the main flippers
}

export interface Ball { x: number; y: number; vx: number; vy: number }

export interface Hit { kind: 'bumper' | 'sling' | 'target' | 'wall' | 'flipper'; id: number; x: number; y: number; speed: number }

// ---------------------------------------------------------------- layout

export const W = 720;
export const TH = 2100;             // table height
export const PIVOT_Y = 1870;
export const LANE_X = 678;          // shooter lane centre
export const PLUNGER_Y = 1970;      // ball rest height in the shooter lane
export const DRAIN_Y = 2020;        // below this the ball is lost
export const LANES = [240, 320, 400, 480];
export const LANE_Y = 200;

const TOP_CX = 368, TOP_CY = 330, TOP_RX = 338, TOP_RY = 240;

/** Points of the upper arch, from the right wall over the top to the left wall. */
export function archPoints(n = 28): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    pts.push([TOP_CX + TOP_RX * Math.cos(a), TOP_CY - TOP_RY * Math.sin(a)]);
  }
  return pts;
}

export const SLING_L = { a: [110, 1610], b: [110, 1715], c: [165, 1765] } as const;
export const SLING_R = { a: [570, 1610], b: [570, 1715], c: [515, 1765] } as const;
// the inlane guides end on the top surface of the resting flippers, so the ball rolls straight on
export const GUIDE_L = [[30, 1710], [198, 1848]] as const;
export const GUIDE_R = [[650, 1710], [482, 1848]] as const;

/** Orbit lanes: between the outer walls and these inner rails, from ORBIT_TOP to ORBIT_BOT. */
export const ORBIT_L = 92, ORBIT_R = 588, ORBIT_TOP = 430, ORBIT_BOT = 1180;
/** The ramp entrance: a short lane open at the bottom; a fast ball rides the ramp from its top. */
export const RAMP = { x0: 172, x1: 238, top: 900, bot: 1010 } as const;
export const SAUCER = { x: 430, y: 760, r: 17, hold: 1.1 } as const;
export const BANK_X = 560;
export const BANK_Y = [722, 768, 814, 860];
export const SPINNER = { x: 61, y: 1080 } as const;
export const GATE = [[650, 470], [706, 418]] as const;
export const BUMPER4 = { x: 340, y: 300, r: 30 } as const;
export const GUARD = { y: 1120, cx: 390, sweep: 90, half: 44 } as const;

/** The ramp's centre line, from the top of its entrance lane over the table to the right inlane. */
const RAMP_KEYS: [number, number][] = [
  [205, 935], [205, 780], [214, 690], [242, 636], [292, 604], [390, 592], [482, 606], [546, 642],
  [590, 702], [614, 790], [622, 900], [622, 1300], [621, 1560], [619, 1668],
];

/** The ramp sampled every ~8 px (Catmull-Rom through RAMP_KEYS). */
export function rampPath(): [number, number][] {
  const k = RAMP_KEYS, out: [number, number][] = [];
  for (let i = 0; i < k.length - 1; i++) {
    const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(k.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 8));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(k[k.length - 1]);
  return out;
}

export function buildWalls(): Seg[] {
  const segs: Seg[] = [];
  const wall = (ax: number, ay: number, bx: number, by: number, r = 4, e = 0.45, kind: Kind = 'wall'): Seg => {
    const s: Seg = { ax, ay, bx, by, r, e, kind };
    segs.push(s);
    return s;
  };
  const arch = archPoints();
  for (let i = 0; i < arch.length - 1; i++) wall(arch[i][0], arch[i][1], arch[i + 1][0], arch[i + 1][1]);
  wall(706, TOP_CY, 706, PLUNGER_Y + 16);                  // outer right wall (shooter lane)
  wall(650, PLUNGER_Y + 16, 706, PLUNGER_Y + 16);          // shooter lane floor (plunger tip)
  // one-way gate over the shooter lane: a launched ball passes, a falling one goes to the right orbit
  wall(GATE[0][0], GATE[0][1], GATE[1][0], GATE[1][1], 4, 0.4, 'gate');
  wall(650, 470, 650, GUIDE_R[0][1]);                      // shooter lane / playfield divider
  wall(650, GUIDE_R[0][1], 650, PLUNGER_Y + 16);
  wall(30, TOP_CY, 30, GUIDE_L[0][1]);                     // left wall
  wall(GUIDE_L[0][0], GUIDE_L[0][1], GUIDE_L[1][0], GUIDE_L[1][1], 5, 0.3);
  wall(GUIDE_R[0][0], GUIDE_R[0][1], GUIDE_R[1][0], GUIDE_R[1][1], 5, 0.3);
  // the drain channel under the flippers (hidden by the apron)
  wall(176, PIVOT_Y + 12, 176, DRAIN_Y + 60, 4, 0.3);
  wall(504, PIVOT_Y + 12, 504, DRAIN_Y + 60, 4, 0.3);
  // orbit rails
  wall(ORBIT_L, ORBIT_TOP, ORBIT_L, ORBIT_BOT, 6, 0.4);
  wall(ORBIT_R, ORBIT_TOP, ORBIT_R, ORBIT_BOT, 6, 0.4);
  // ramp entrance lane and its back stop
  wall(RAMP.x0, RAMP.top, RAMP.x0, RAMP.bot, 5, 0.35);
  wall(RAMP.x1, RAMP.top, RAMP.x1, RAMP.bot, 5, 0.35);
  wall(RAMP.x0, RAMP.top, RAMP.x1, RAMP.top, 5, 0.25);
  // a roof over the drop target bank, so nothing rests on it
  wall(BANK_X - 4, BANK_Y[0] - 24, ORBIT_R, BANK_Y[0] - 44, 5, 0.4);
  // slingshots: the long inner face kicks, the other two sides are plain walls
  for (const [s, id] of [[SLING_L, 0], [SLING_R, 1]] as const) {
    wall(s.a[0], s.a[1], s.b[0], s.b[1], 6, 0.4);
    wall(s.b[0], s.b[1], s.c[0], s.c[1], 6, 0.4);
    segs.push({ ax: s.a[0], ay: s.a[1], bx: s.c[0], by: s.c[1], r: 6, e: 0.5, kind: 'sling', kick: 820, id });
  }
  // rollover lane dividers
  for (let i = 0; i <= LANES.length; i++) {
    const x = LANES[0] - 40 + i * 80;
    segs.push({ ax: x, ay: LANE_Y - 35, bx: x, by: LANE_Y + 30, r: 6, e: 0.5, kind: 'post' });
  }
  return segs;
}

export function buildTargets(): Seg[] {
  return BANK_Y.map((y, id) => ({ ax: BANK_X, ay: y - 18, bx: BANK_X, by: y + 18, r: 8, e: 0.35, kind: 'target' as const, id, active: true }));
}

export function buildBumpers(): Bumper[] {
  return [
    { x: 250, y: 385, r: 36, kick: 880, id: 0 },
    { x: 430, y: 385, r: 36, kick: 880, id: 1 },
    { x: 340, y: 505, r: 36, kick: 880, id: 2 },
  ];
}

/** Left, right and the upper-left flipper (worked by the left button too). */
export function buildFlippers(): Flipper[] {
  const base = { py: PIVOT_Y, len: 120, r0: 16, r1: 9, omega: 0, held: false, scale: 1 };
  const left: Flipper = { ...base, px: 196, rest: 0.52, up: -0.46, angle: 0.52, dir: -1 };
  const right: Flipper = { ...base, px: 484, rest: Math.PI - 0.52, up: Math.PI + 0.46, angle: Math.PI - 0.52, dir: 1 };
  const s = 0.72;
  const upper: Flipper = { px: 104, py: 1212, len: 120 * s, r0: 16 * s, r1: 9 * s, omega: 0, held: false, scale: s, rest: 0.5, up: -0.42, angle: 0.5, dir: -1 };
  return [left, right, upper];
}

export function flipperTip(f: Flipper): [number, number] {
  return [f.px + Math.cos(f.angle) * f.len, f.py + Math.sin(f.angle) * f.len];
}

// ---------------------------------------------------------------- physics

export interface World {
  ball: Ball;
  walls: Seg[];
  targets: Seg[];
  bumpers: Bumper[];
  flippers: Flipper[];
  gravity: number;
}

const UP_SPEED = 26;      // rad/s while raising
const DOWN_SPEED = 14;    // rad/s while falling back

function moveFlipper(f: Flipper, dt: number): void {
  const target = f.held ? f.up : f.rest;
  const diff = target - f.angle;
  if (Math.abs(diff) < 1e-6) { f.omega = 0; return; }
  const speed = f.held ? UP_SPEED : DOWN_SPEED;
  const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
  f.angle += step;
  f.omega = step / dt;
}

/** Closest point on segment ab to p, and its parameter t in [0, 1]. */
function closest(ax: number, ay: number, bx: number, by: number, px: number, py: number): [number, number, number] {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, ay + dy * t, t];
}

/**
 * Pushes the ball out of a contact and reflects its velocity relative to the moving surface.
 * Returns the impact speed (0 when the ball was already moving away).
 */
function resolve(b: Ball, nx: number, ny: number, pen: number, e: number, svx = 0, svy = 0): number {
  b.x += nx * pen;
  b.y += ny * pen;
  const rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  // a little friction along the surface
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  const nvn = -vn * e, nvt = vt * 0.985;
  b.vx = svx + nx * nvn + tx * nvt;
  b.vy = svy + ny * nvn + ty * nvt;
  return -vn;
}

function stepOnce(w: World, dt: number, hits: Hit[], moveBall: boolean): void {
  const b = w.ball;
  for (const f of w.flippers) moveFlipper(f, dt);
  if (!moveBall) return;
  b.vy += w.gravity * dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  for (const s of w.walls) collideSeg(b, s, hits);
  for (const s of w.targets) if (s.active) collideSeg(b, s, hits);

  for (const bu of w.bumpers) {
    const dx = b.x - bu.x, dy = b.y - bu.y;
    const d = Math.hypot(dx, dy), min = bu.r + BALL_R;
    if (d >= min || d === 0) continue;
    const nx = dx / d, ny = dy / d;
    const v = resolve(b, nx, ny, min - d, 0.6);
    // the bumper fires: the ball always leaves at least at kick speed
    const vn = b.vx * nx + b.vy * ny;
    if (vn < bu.kick) { b.vx += nx * (bu.kick - vn); b.vy += ny * (bu.kick - vn); }
    hits.push({ kind: 'bumper', id: bu.id, x: bu.x + nx * bu.r, y: bu.y + ny * bu.r, speed: v });
  }

  for (let i = 0; i < w.flippers.length; i++) {
    const f = w.flippers[i];
    const [tx, ty] = flipperTip(f);
    const [cx, cy, t] = closest(f.px, f.py, tx, ty, b.x, b.y);
    const rr = f.r0 + (f.r1 - f.r0) * t;
    const dx = b.x - cx, dy = b.y - cy;
    const d = Math.hypot(dx, dy), min = rr + BALL_R;
    if (d >= min || d === 0) continue;
    const nx = dx / d, ny = dy / d;
    // velocity of the flipper surface at the contact point
    const svx = -f.omega * (cy - f.py), svy = f.omega * (cx - f.px);
    const v = resolve(b, nx, ny, min - d, 0.28, svx, svy);
    if (v > 60) hits.push({ kind: 'flipper', id: i, x: cx, y: cy, speed: v });
  }
}

function collideSeg(b: Ball, s: Seg, hits: Hit[]): void {
  if (s.kind === 'gate' && b.vy < 0) return;   // one way: only a falling ball meets the gate
  const [cx, cy] = closest(s.ax, s.ay, s.bx, s.by, b.x, b.y);
  const dx = b.x - cx, dy = b.y - cy;
  const d = Math.hypot(dx, dy), min = s.r + BALL_R;
  if (d >= min || d === 0) return;
  const nx = dx / d, ny = dy / d;
  const v = resolve(b, nx, ny, min - d, s.e);
  if (s.kind === 'sling' && v > 90 && s.kick) {
    b.vx += nx * s.kick; b.vy += ny * s.kick;
    hits.push({ kind: 'sling', id: s.id ?? 0, x: cx, y: cy, speed: v });
  } else if (s.kind === 'target' && (v > 120 || ny < -0.5)) {
    // struck hard, or touched from above: a ball must never come to rest on a target
    hits.push({ kind: 'target', id: s.id ?? 0, x: cx, y: cy, speed: v });
  } else if (v > 260) {
    hits.push({ kind: 'wall', id: 0, x: cx, y: cy, speed: v });
  }
}

/** Advances the world by dt seconds in substeps; returns everything the ball hit. With moveBall false only the flippers move. */
export function step(w: World, dt: number, moveBall = true): Hit[] {
  const hits: Hit[] = [];
  const n = Math.max(1, Math.ceil(dt / STEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) stepOnce(w, h, hits, moveBall);
  return hits;
}
