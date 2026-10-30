// Head Soccer physics: two players and a ball on a side-view pitch. Pure data and functions, so
// the solo game and the online host run exactly the same simulation (the online guest only draws).
//
// Coordinates: 1280 x 720 world, ground at GROUND, player 0 on the left attacking the right goal,
// player 1 on the right attacking the left goal. A player's (x, y) is the point between the feet.

export const W = 1280;
export const GROUND = 640;
export const GOAL_W = 104;          // depth of each goal from the side edge
export const GOAL_TOP = 418;        // crossbar height
export const BAR_R = 8;
export const BALL_R = 24;
export const CHAR_SCALE = 1.0;      // player characters drawn at their natural 150 px height
export const HEAD_OFF = 118;        // feet -> head centre
export const HEAD_R = 44;
export const BODY_OFF = 42;
export const BODY_R = 32;
export const KICK_T = 0.24;         // seconds of one boot swing

const G_PLAYER = 2300;
const G_BALL = 1500;
const JUMP_V = 960;
const MAX_BALL = 1550;

export interface Player {
  x: number; y: number; vx: number; vy: number;
  ground: boolean;
  face: 1 | -1;
  /** Seconds into the current boot swing, or -1. */
  kickT: number;
  kicked: boolean;
  speed: number;
}

export interface Ball { x: number; y: number; vx: number; vy: number; a: number }

export interface Input { x: number; jump: boolean; kick: boolean }

/** Sound / effect counters; the online guest plays effects when they change. */
export interface Events { kick: [number, number]; swing: [number, number]; head: [number, number]; jump: [number, number]; post: number; bounce: number; power: number }

export interface World { p: [Player, Player]; b: Ball; ev: Events }

export function newWorld(): World {
  return {
    p: [newPlayer(0), newPlayer(1)],
    b: { x: W / 2, y: 220, vx: 0, vy: 0, a: 0 },
    ev: { kick: [0, 0], swing: [0, 0], head: [0, 0], jump: [0, 0], post: 0, bounce: 0, power: 0 },
  };
}

export function newPlayer(i: 0 | 1): Player {
  return { x: i === 0 ? 300 : W - 300, y: GROUND, vx: 0, vy: 0, ground: true, face: i === 0 ? 1 : -1, kickT: -1, kicked: false, speed: 440 };
}

export function resetPlayers(w: World): void {
  for (const i of [0, 1] as const) {
    const s = w.p[i].speed;
    w.p[i] = newPlayer(i);
    w.p[i].speed = s;
  }
}

/** Ball dropped for a kickoff on side `side` (0 = left half, 1 = right half). */
export function dropBall(w: World, side: 0 | 1): void {
  w.b = { x: W / 2 + (side === 0 ? -150 : 150), y: 200, vx: 0, vy: 0, a: 0 };
}

function stepPlayer(w: World, i: 0 | 1, inp: Input, dt: number): void {
  const p = w.p[i];
  p.vx = Math.max(-1, Math.min(1, inp.x)) * p.speed;
  if (inp.jump && p.ground) { p.vy = -JUMP_V; p.ground = false; w.ev.jump[i]++; }
  if (inp.kick && p.kickT < 0) { p.kickT = 0; p.kicked = false; w.ev.swing[i]++; }
  if (p.kickT >= 0) { p.kickT += dt; if (p.kickT > KICK_T) p.kickT = -1; }
  p.vy += G_PLAYER * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.ground = true; }
  p.x = Math.max(44, Math.min(W - 44, p.x));
  // the crossbar stops a jump inside the goal mouth
  const underBar = p.x < GOAL_W + HEAD_R * 0.6 || p.x > W - GOAL_W - HEAD_R * 0.6;
  const headTop = p.y - HEAD_OFF - HEAD_R;
  if (underBar && headTop < GOAL_TOP + BAR_R && p.y > GOAL_TOP) {
    p.y = GOAL_TOP + BAR_R + HEAD_OFF + HEAD_R;
    if (p.vy < 0) p.vy = 0;
  }
}

/** Ball against a circle moving with (pvx, pvy); returns the closing speed of a hit, or 0. */
function bump(b: Ball, cx: number, cy: number, r: number, pvx: number, pvy: number, e: number): number {
  const dx = b.x - cx, dy = b.y - cy, min = BALL_R + r, d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return 0;
  const d = Math.sqrt(d2) || 1, nx = d2 ? dx / d : 0, ny = d2 ? dy / d : -1;
  b.x = cx + nx * min; b.y = cy + ny * min;
  const rvx = b.vx - pvx, rvy = b.vy - pvy, vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  return -vn;
}

/** Ball against a crossbar (segment from x0 to x1 at GOAL_TOP). */
function bar(w: World, x0: number, x1: number): void {
  const b = w.b;
  const cx = Math.max(x0, Math.min(x1, b.x));
  if (bump(b, cx, GOAL_TOP, BAR_R, 0, 0, 0.55) > 120) w.ev.post++;
}

/** Advances the world; returns the player who scored (0 or 1), or -1. */
export function step(w: World, inputs: [Input, Input], dt: number): number {
  stepPlayer(w, 0, inputs[0], dt);
  stepPlayer(w, 1, inputs[1], dt);
  // players push each other apart
  const [a, c] = w.p;
  const dx = c.x - a.x;
  if (Math.abs(dx) < 74 && Math.abs(a.y - c.y) < 150) {
    const push = (74 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
    a.x -= push; c.x += push;
    a.x = Math.max(44, Math.min(W - 44, a.x)); c.x = Math.max(44, Math.min(W - 44, c.x));
  }
  const n = 3, h = dt / n, b = w.b;
  for (let s = 0; s < n; s++) {
    b.vy += G_BALL * h;
    const drag = 1 - 0.12 * h;
    b.vx *= drag; b.vy *= drag;
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.y > GROUND - BALL_R) {
      b.y = GROUND - BALL_R;
      if (b.vy > 0) {
        if (b.vy > 160) w.ev.bounce++;
        b.vy = b.vy > 90 ? -b.vy * 0.66 : 0;
      }
      b.vx *= 1 - 1.2 * h;            // rolling friction
    }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.6; }
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.7; }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.7; }
    bar(w, 0, GOAL_W);
    bar(w, W - GOAL_W, W);
    for (const i of [0, 1] as const) {
      const p = w.p[i];
      const hv = bump(b, p.x, p.y - HEAD_OFF, HEAD_R, p.vx, p.vy, 0.72);
      if (hv > 260) w.ev.head[i]++;
      bump(b, p.x, p.y - BODY_OFF, BODY_R, p.vx, p.vy, 0.5);
      // the boot: live in the middle of the swing, once per swing
      if (p.kickT >= 0.02 && p.kickT <= 0.17 && !p.kicked) {
        const kx = p.x + p.face * 46, ky = p.y - 30;
        const ddx = b.x - kx, ddy = b.y - ky;
        if (ddx * ddx + ddy * ddy < (BALL_R + 40) * (BALL_R + 40)) {
          p.kicked = true;
          const low = b.y > p.y - 62;
          const power = low ? 900 : 1120;
          b.vx = p.face * power + p.vx * 0.35;
          b.vy = low ? -640 : -300 + Math.min(0, p.vy * 0.2);
          w.ev.kick[i]++;
          w.ev.power = Math.round(Math.hypot(b.vx, b.vy));
        }
      }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_BALL) { b.vx *= MAX_BALL / sp; b.vy *= MAX_BALL / sp; }
    if (b.x < GOAL_W - BALL_R && b.y > GOAL_TOP + BAR_R) return 1;
    if (b.x > W - GOAL_W + BALL_R && b.y > GOAL_TOP + BAR_R) return 0;
  }
  b.a += (b.vx * dt) / BALL_R;
  return -1;
}

// ---------------------------------------------------------------- AI

export interface AiLevel { speed: number; think: number; aim: number; jump: number }

/** Rival levels: run speed, reaction time, how well it lines up shots, how keen it is to jump. */
export const AI_LEVELS: AiLevel[] = [
  { speed: 300, think: 0.26, aim: 0.45, jump: 0.35 },
  { speed: 340, think: 0.21, aim: 0.6, jump: 0.5 },
  { speed: 380, think: 0.17, aim: 0.72, jump: 0.65 },
  { speed: 410, think: 0.13, aim: 0.82, jump: 0.75 },
  { speed: 440, think: 0.1, aim: 0.9, jump: 0.85 },
  { speed: 470, think: 0.08, aim: 0.97, jump: 0.95 },
];

/** Where the ball will be after `t` seconds (ignoring players), in a mirrored frame when needed. */
function predict(b: Ball, t: number): { x: number; y: number } {
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const h = 1 / 30;
  for (let k = 0; k < t / h; k++) {
    vy += G_BALL * h; x += vx * h; y += vy * h;
    if (y > GROUND - BALL_R) { y = GROUND - BALL_R; vy = -vy * 0.66; }
    if (x < BALL_R) { x = BALL_R; vx = -vx * 0.7; }
    if (x > W - BALL_R) { x = W - BALL_R; vx = -vx * 0.7; }
  }
  return { x, y };
}

/**
 * The AI's decision for player `i`. Works in a frame where the AI attacks to the right (own goal
 * on the left), so the same logic serves both sides.
 */
export function think(w: World, i: 0 | 1, lv: AiLevel, rand: () => number): Input {
  const flip = i === 1;
  const mx = (x: number) => (flip ? W - x : x);
  const me = w.p[i];
  const u = mx(me.x);
  const fb = predict(w.b, lv.think * 0.8 + 0.08);
  const bu = mx(fb.x), by = fb.y;
  const bvu = flip ? -w.b.vx : w.b.vx;
  let target: number;
  let jump = false, kick = false;
  const behind = bu < u - 10;                 // the ball is between us and our own goal
  if (behind) {
    target = bu - 70;                         // run back round it
    if (Math.abs(bu - u) < 110 && by < me.y - 150 && rand() < lv.jump) jump = true;
  } else {
    target = bu - 40 + (1 - lv.aim) * (rand() * 80 - 40);
    const dx = bu - u, high = me.y - by;
    if (dx > -20 && dx < 92 && high < 110) kick = rand() < 0.45 + lv.aim * 0.5;
    // a ball dropping on us: jump to head it forwards
    if (dx > -30 && dx < 80 && high > 130 && high < 260 && w.b.vy > -100 && rand() < lv.jump) jump = true;
  }
  // a shot racing at our goal while we are far ahead of it: get back
  if (bvu < -500 && bu < u && bu < 640) target = Math.min(target, bu - 50);
  // never wander deep into our own goal
  target = Math.max(GOAL_W - 20, Math.min(W - 160, target));
  const d = target - u;
  let x = Math.abs(d) < 14 ? 0 : Math.sign(d);
  if (flip) x = -x;
  return { x, jump, kick };
}
