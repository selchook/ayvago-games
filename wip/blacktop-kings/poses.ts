// How the dribble moves and the dunks look: poses on the figure's bones (players.ts), the ball's
// path between the hands, the body's lean, turn and footwork. Timing comes from moves.ts.
import type { FigApi, FigState, BallSeen } from './players';
import { DUNKS } from './moves';

export type MovePose = (f: FigApi, u: number, s: FigState, speed: number) => void;
export type DunkPose = (f: FigApi, s: FigState, ball: BallSeen) => void;


const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const smooth = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** A low pound in one hand: the hand at the ball's top, a little bob. */
const pound = (f: FigApi, sd: 1 | -1, y = 0.72, z = 0.38) => {
  f.armAt(sd, sd * 0.42, y + Math.sin(f.t * 22) * 0.04, z, 26, true);
  f.hold(sd);
};
/** The free hand guards the ball: out in front, forearm up. */
const guard = (f: FigApi, sd: 1 | -1) => f.armDir(sd, sd * 0.55, -0.35, 0.8, 10);

/** Crossover: sell one way, snap the ball across low in front, cut hard the other way. */
const crossover: MovePose = (f, u) => {
  const A = f.from, B = f.hand;
  const across = smooth(seg(u, 0.12, 0.55));
  f.set({ lean: 0.3 + 0.12 * seg(u, 0.4, 0.6), hipDrop: 0.22, roll: lerp(-A * 0.2, -B * 0.24, across), twist: lerp(A * 0.2, B * 0.15, across) });
  if (u < 0.5) {
    f.foot(A, A * 0.46, 0, 0.12);
    f.foot((-A) as 1 | -1, -A * 0.16, 0, -0.08);
    f.legK(24);
  }
  if (u < 0.18) {
    pound(f, A, 0.74, 0.34);
    guard(f, (-A) as 1 | -1);
  } else if (u < 0.5) {
    const k = (u - 0.18) / 0.32;
    f.fly(B, k, { x: 0, z: 0.42, at: 0.45 });
    f.armAt(A, B * 0.1, 0.55, 0.45, 26);
    f.armAt(B, B * 0.42, 0.72, 0.38, 26, true);
  } else {
    pound(f, B, 0.7, 0.4);
    guard(f, (-B) as 1 | -1);
  }
};

/** Between the legs: a wide split stance, the ball bounced through under the body. */
const betweenLegs: MovePose = (f, u) => {
  const A = f.from, B = f.hand;
  const st = smooth(seg(u, 0, 0.2));
  f.set({ lean: 0.32, hipDrop: 0.08 + 0.2 * st, roll: -B * 0.1 * seg(u, 0.5, 0.8), twist: -A * 0.12 * st });
  if (u < 0.75) {
    f.foot(B, B * 0.3, 0, lerp(0.05, 0.4, st));
    f.foot(A, A * 0.28, 0, lerp(0, -0.32, st));
    f.legK(24);
  }
  if (u < 0.28) {
    f.armAt(A, A * 0.4, 0.62, 0.08, 24, true);
    f.hold(A);
    guard(f, B);
  } else if (u < 0.62) {
    const k = (u - 0.28) / 0.34;
    f.fly(B, k, { x: 0, z: 0.06, at: 0.45 });
    f.armAt(A, 0, 0.45, 0.1, 22);
    f.armAt(B, B * 0.38, 0.6, -0.02, 26, true);
  } else {
    pound(f, B, 0.7, 0.32);
    guard(f, A);
  }
};

/** Behind the back: the hand wraps the ball round the hips to the other side. */
const behindBack: MovePose = (f, u) => {
  const A = f.from, B = f.hand;
  const wrap = smooth(seg(u, 0.05, 0.35));
  f.set({ lean: 0.24, hipDrop: 0.16, twist: lerp(A * 0.35 * wrap, -B * 0.2, seg(u, 0.4, 0.8)), roll: -B * 0.12 * seg(u, 0.5, 0.8) });
  if (u < 0.32) {
    f.armAt(A, A * 0.42, 0.8, lerp(0.3, -0.38, wrap), 24, true);
    f.hold(A);
    guard(f, B);
  } else if (u < 0.66) {
    const k = (u - 0.32) / 0.34;
    f.fly(B, k, { x: B * 0.42, z: 0.12, at: 0.5 });
    f.armAt(A, -A * 0.1, 0.6, -0.4, 20);
    f.armAt(B, B * 0.45, 0.66, 0.24, 26, true);
  } else {
    pound(f, B, 0.72, 0.38);
    guard(f, A);
  }
};

/** Spin: a full turn on a planted foot, the ball pulled tight to the hip, the free arm swimming over. */
const spin: MovePose = (f, u) => {
  const A = f.from, S = f.side;
  const turn = smooth(seg(u, 0.08, 0.82));
  f.set({ yaw: S * Math.PI * 2 * turn, lean: 0.18 + 0.12 * Math.sin(Math.PI * turn), hipDrop: 0.2 });
  if (u < 0.85) {
    f.foot(A, A * 0.12, 0, 0.02);
    f.foot((-A) as 1 | -1, -A * 0.22, 0.04 * Math.sin(Math.PI * turn), -0.04);
    f.legK(26);
  }
  if (u < 0.85) {
    // pulled in tight to the hip
    f.armAt(A, A * 0.38, 0.95, 0.02, 26, true);
    f.hold(A);
    f.armDir((-A) as 1 | -1, -A * 0.8, 0.25 + 0.5 * Math.sin(Math.PI * turn), 0.5, 14);
  } else {
    pound(f, A, 0.7, 0.4);
    guard(f, (-A) as 1 | -1);
  }
};

/** Hesitation: stop, stand up and look at the rim as if to shoot, then drop and explode past. */
const hesitation: MovePose = (f, u) => {
  const A = f.from;
  const up = smooth(seg(u, 0, 0.25)) * (1 - smooth(seg(u, 0.5, 0.6)));
  const go = smooth(seg(u, 0.5, 0.62));
  f.set({ lean: lerp(0.3, -0.04, up) + 0.3 * go, hipDrop: lerp(0.18, 0, up) + 0.12 * go });
  f.look(10.4, 3.05, 0);
  if (u < 0.5) {
    f.foot(1, 0.2, 0, 0.04);
    f.foot(-1, -0.2, 0, -0.04);
    f.legK(14);
    f.armAt(A, A * 0.42, lerp(0.75, 1.0, up), 0.36, 18, true);
    f.hold(A);
    // the shot fake: the free hand comes up
    f.armDir((-A) as 1 | -1, -A * 0.3, -0.3 + 1.3 * up, 0.8, 10);
  } else if (u < 0.86) {
    const k = (u - 0.5) / 0.36;
    f.fly(A, k, { x: A * 0.48, z: 0.75, at: 0.45 });
    f.armAt(A, A * 0.42, 0.7, 0.6, 22, true);
    guard(f, (-A) as 1 | -1);
  } else {
    pound(f, A, 0.72, 0.42);
    guard(f, (-A) as 1 | -1);
  }
};

// ------------------------------------------------------------------ dunks
//
// actT < 0: the gather steps (the ball in both hands at the chest); 0: take-off; d.rise: the
// slam; then the hang at the rim and the drop. The rim is a world point; the poses aim at it.

const RX = 10.425, RY = 3.05, RZ = 0;

/** Where a dunk is: the gather, the flight (0..1), the slam and after. */
const phase = (s: FigState) => {
  const d = DUNKS[s.kind] ?? DUNKS[0];
  const t = s.actT;
  return { d, t, up: Math.max(0, Math.min(1, t / d.rise)), after: t >= d.rise, hang: Math.max(0, (t - d.rise) / d.hang) };
};

/** The gather and the take-off, common to every dunk: two steps, the ball tucked at the chest, a deep load. */
const gather = (f: FigApi, s: FigState) => {
  f.armAt(1, 0.1, 1.15, 0.42, 18);
  f.armAt(-1, -0.1, 1.15, 0.42, 18);
  f.hold(0);
  f.set({ lean: 0.35, hipDrop: s.actT > -0.12 ? 0.26 : 0.1 });
};

/** The legs in the air: knees up (a short leg), one ahead. */
const tuck = (f: FigApi, a: number, front: 1 | -1 = 1) => {
  f.foot(front, front * 0.16, 0.25 + 0.25 * a, 0.3 * a, false);
  f.foot((-front) as 1 | -1, -front * 0.16, 0.12 + 0.12 * a, -0.15 * a, false);
};

/** After the slam: the slamming arm(s) follow through down past the rim, the body swings under. */
const through = (f: FigApi, s: FigState, two: boolean, k: number) => {
  f.armAtWorld(-1, RX, RY - 0.4 * k, RZ, 20);
  if (two) f.armAtWorld(1, RX, RY - 0.4 * k, RZ, 20);
  else f.armDir(1, 0.8, 0.2, 0.3, 10);
  f.set({ lean: 0.2 - 0.25 * k });
  tuck(f, 1 - k * 0.6);
  void s;
};

/** One-hand tomahawk: the ball cocked far back behind the head, whipped down over the rim. */
const tomahawk: DunkPose = (f, s, ball) => {
  const p = phase(s);
  if (p.t < 0) { gather(f, s); return; }
  if (!p.after) {
    const cock = smooth(p.up / 0.55), whip = smooth((p.up - 0.6) / 0.4);
    if (whip <= 0) f.armDir(-1, -0.15, 1, -0.7 * cock, 14);
    else f.armAtWorld(-1, RX, RY + 0.5 - 0.3 * whip, RZ, 30);
    f.armDir(1, 0.5, 0.6, 0.8, 12);
    f.hold(-1);
    f.set({ lean: -0.3 * cock + 0.55 * whip, roll: 0.1 * cock });
    tuck(f, p.up, -1);
  } else through(f, s, false, smooth(p.hang * 2));
  void ball;
};

/** Two-hand power slam: the ball up high in both hands, thrown straight down. */
const power: DunkPose = (f, s) => {
  const p = phase(s);
  if (p.t < 0) { gather(f, s); return; }
  if (!p.after) {
    const reach = smooth((p.up - 0.7) / 0.3);
    for (const sd of [1, -1] as const) {
      if (reach <= 0) f.armDir(sd, sd * 0.12, 1, -0.1, 14);
      else f.armAtWorld(sd, RX, RY + 0.45, RZ + sd * 0.12, 26);
    }
    f.hold(0);
    f.set({ lean: -0.15 + 0.4 * reach });
    tuck(f, p.up);
  } else through(f, s, true, smooth(p.hang * 2));
};

/** Reverse: the body turns its back to the rim on the way up and slams it backwards over the head. */
const reverse: DunkPose = (f, s) => {
  const p = phase(s);
  if (p.t < 0) { gather(f, s); return; }
  const turn = smooth(p.up / 0.75);
  f.set({ yaw: Math.PI * turn });
  if (!p.after) {
    const reach = smooth((p.up - 0.72) / 0.28);
    for (const sd of [1, -1] as const) {
      if (reach <= 0) f.armDir(sd, sd * 0.15, 1, 0.1, 14);
      else f.armAtWorld(sd, RX, RY + 0.4, RZ + sd * 0.1, 24);
    }
    f.hold(0);
    f.set({ yaw: Math.PI * turn, lean: -0.35 * reach });
    tuck(f, p.up);
  } else {
    f.set({ yaw: Math.PI, lean: -0.3 + 0.2 * p.hang });
    through(f, s, true, smooth(p.hang * 2));
    f.set({ yaw: Math.PI, lean: -0.3 });
  }
};

/** 360: a full turn in the air with the ball tucked, then up and over. */
const spin360: DunkPose = (f, s) => {
  const p = phase(s);
  if (p.t < 0) { gather(f, s); return; }
  const turn = smooth(p.up / 0.85);
  if (!p.after) {
    const reach = smooth((p.up - 0.75) / 0.25);
    f.set({ yaw: Math.PI * 2 * turn, lean: 0.1 - 0.2 * reach });
    if (reach <= 0) { f.armAt(1, 0.1, 1.25, 0.4, 18); f.armAt(-1, -0.1, 1.25, 0.4, 18); f.hold(0); }
    else { f.armAtWorld(-1, RX, RY + 0.45, RZ, 28); f.armDir(1, 0.7, 0.8, 0.2, 14); f.hold(-1); }
    tuck(f, 0.4 + 0.6 * p.up);
  } else through(f, s, false, smooth(p.hang * 2));
};

/** Windmill: the slamming arm makes a full circle (down by the hip, back, up) before it comes over. */
const windmill: DunkPose = (f, s) => {
  const p = phase(s);
  if (p.t < 0) { gather(f, s); return; }
  if (!p.after) {
    const a = smooth(p.up / 0.85) * Math.PI * 1.55;
    if (p.up < 0.85) f.armDir(-1, -0.28, -Math.cos(a), -Math.sin(a), 40);
    else f.armAtWorld(-1, RX, RY + 0.3, RZ, 36);
    f.armDir(1, 0.6, 0.7, 0.5, 12);
    f.hold(-1);
    f.set({ lean: -0.2 * Math.sin(a) + 0.15, roll: 0.15 });
    tuck(f, p.up, -1);
  } else through(f, s, false, smooth(p.hang * 2));
};

/** Alley-oop: both hands up to meet the lob in the air, then straight down. */
const alley: DunkPose = (f, s, ball) => {
  const p = phase(s);
  if (!ball.mine && !p.after) {
    // the lob is coming: hands up to it
    if (p.t < 0) f.set({ lean: 0.3, hipDrop: p.t > -0.12 ? 0.24 : 0.05 });
    f.look(ball.x, ball.y, ball.z);
    if (p.t >= -0.1) { f.armAtWorld(-1, ball.x, ball.y, ball.z, 18); f.armAtWorld(1, ball.x, ball.y, ball.z, 18); }
    else { f.armDir(-1, -0.3, 0.6, 0.6, 10); f.armDir(1, 0.3, 0.6, 0.6, 10); }
    if (p.t >= 0) tuck(f, p.up);
    return;
  }
  if (!p.after) {
    f.armAtWorld(-1, RX, RY + 0.4, RZ, 26);
    f.armAtWorld(1, RX, RY + 0.4, RZ + 0.12, 26);
    f.hold(-1);
    tuck(f, p.up);
  } else through(f, s, true, smooth(p.hang * 2));
};

/** Between the legs: a leg kicks up and the ball passes under it from the right hand to the left. */
const btl: DunkPose = (f, s) => {
  const p = phase(s);
  if (p.t < 0) { gather(f, s); return; }
  if (!p.after) {
    const kick = Math.sin(Math.PI * Math.min(1, p.up / 0.8));
    f.foot(1, 0.18, 0.2 + 0.55 * kick, 0.15 + 0.5 * kick, false);
    f.foot(-1, -0.16, 0.1, -0.2, false);
    f.set({ lean: 0.25 * kick, roll: -0.12 * kick });
    if (p.up < 0.2) { f.armAt(-1, -0.2, 0.9, 0.35, 22); f.hold(-1); f.armAt(1, 0.25, 0.7, 0.3, 22); }
    else if (p.up < 0.55) {
      const k = (p.up - 0.2) / 0.35;
      f.fly(1, k, null, -0.35);
      f.armAt(-1, 0.05, 0.6, 0.45, 26);
      f.armAt(1, 0.3, 0.55, 0.35, 26);
    } else {
      const reach = smooth((p.up - 0.6) / 0.35);
      if (reach <= 0) f.armDir(1, 0.2, 0.6, 0.6, 20); else f.armAtWorld(1, RX, RY + 0.4, RZ, 30);
      f.armDir(-1, -0.6, 0.5, 0.5, 12);
      f.hold(1);
    }
  } else {
    f.armAtWorld(1, RX, RY - 0.4 * smooth(p.hang * 2), RZ, 20);
    f.armDir(-1, -0.8, 0.2, 0.3, 10);
    tuck(f, 1 - smooth(p.hang * 2) * 0.6);
  }
};

/** Rim hang: a two-hand slam, then both hands hold the rim and the body swings under it. */
const hang: DunkPose = (f, s) => {
  const p = phase(s);
  if (p.t < 0 || !p.after) { power(f, s, null as unknown as BallSeen); return; }
  if (p.hang < 1) {
    // gripping the front of the rim, legs swinging
    f.armAtWorld(1, RX - 0.18, RY + 0.02, RZ + 0.2, 30);
    f.armAtWorld(-1, RX - 0.18, RY + 0.02, RZ - 0.2, 30);
    const sw = Math.sin(p.hang * Math.PI * 3) * (1 - p.hang);
    f.foot(1, 0.15, 0.05, 0.35 * sw, false);
    f.foot(-1, -0.15, 0.05, 0.25 * sw - 0.05, false);
    f.set({ lean: -0.15 - 0.2 * sw });
    f.look(0, 1.5, 0);
  } else through(f, s, true, 1);
};

export const MOVE_POSES: MovePose[] = [crossover, betweenLegs, behindBack, spin, hesitation];
export const DUNK_POSES: DunkPose[] = [tomahawk, power, reverse, spin360, windmill, alley, btl, hang];
