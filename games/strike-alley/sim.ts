// The lane and pin simulation: pure TypeScript, no three.js or Phaser, so the game, the Easy path
// preview, the strike prediction and the headless bot all step exactly the same numbers.
//
// Units are metres, seconds and kilograms. The lane runs along -z: the foul line is z = 0 and
// the head pin stands at HEAD_Z (60 ft down the lane). x grows to the bowler's right.
//
// Ball. While it is on the lane it rolls on the boards (y = BALL_R) with a real skid/hook/roll
// model: the contact point's slip velocity (v + ω × r) is opposed by sliding friction, which
// both slows the ball and spins it up, until it rolls. The front of the lane is oiled (μ 0.04),
// the back end is dry (μ 0.2): a ball released with side rotation skids straight through the
// oil and hooks late on the dry boards, like a real one. A ball whose centre passes the lane
// edge drops into the gutter and rides it to the pit.
//
// Pins. Each pin is a rigid body (mass, inertia, quaternion) whose shape is a column of spheres
// following the real profile (belly, neck, head) plus a ring of tiny feet under its flat base,
// so it stands stably, tips over its base edge, falls, slides and rolls. Contacts (ball-pin,
// pin-pin, pin-floor, kickbacks, the pit and its back cushion, the hood) are solved with
// sequential impulses (accumulated clamping, Coulomb friction, restitution, Baumgarte bias) in
// three sub-steps of each 1/120 s step. Pins that stay still fall asleep (so a rack never
// jitters) and wake when something touches them.

export const SIM_DT = 1 / 120;
const SUB = 3;
const G = 9.81;

export const LANE_HALF = 0.527;
export const GUTTER_W = 0.235;
export const WALL_X = LANE_HALF + GUTTER_W;
export const GUTTER_DEPTH = 0.075;
export const BALL_R = 0.109;
export const BALL_M = 6.8;
export const PIN_H = 0.381;
export const PIN_M = 1.55;
export const HEAD_Z = -18.29;
export const PIN_SPACING = 0.3048;
export const ROW_DZ = PIN_SPACING * Math.sqrt(3) / 2;
/** End of the pin deck: beyond it the pit. */
export const PIT_Z = HEAD_Z - 3 * ROW_DZ - 0.1;
export const PIT_FLOOR = -0.36;
/** The cushion at the back of the pit. */
export const BACK_Z = PIT_Z - 0.85;
/** The hood (masking unit) over the deck. */
const HOOD_Y = 0.9;
const HOOD_FROM_Z = HEAD_Z + 0.7;
/** Distance of oil from the foul line, and the length of the change to the dry back end. */
export const OIL_LEN = 12.2;
const OIL_FADE = 1.6;
const MU_OIL = 0.028;
const MU_DRY = 0.2;
/** Height of a pin's centre of mass above its base. */
const COM = 0.14;
/** Spheres along the pin's axis: [height above the base, radius]. */
export const PIN_HULL: [number, number][] = [
  [0.048, 0.042], [0.085, 0.055], [0.118, 0.06], [0.16, 0.052], [0.2, 0.038], [0.245, 0.025], [0.29, 0.028], [0.345, 0.033],
];
const FOOT_R = 0.004;
const FOOT_RING = 0.026;
const FEET: [number, number][] = Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * FOOT_RING, Math.sin(i * Math.PI / 3) * FOOT_RING]);
/** Inverse inertia of a pin about its own axes (axial, transverse). */
const PIN_INV_I_AX = 1 / 0.0016;
const PIN_INV_I_TR = 1 / 0.0185;

/** Pin spots, pin 1 … 10 (index 0 … 9), x left to right as the bowler sees them. */
export const SPOTS: { x: number; z: number }[] = (() => {
  const s: { x: number; z: number }[] = [];
  for (let k = 0; k < 4; k++) for (let j = 0; j <= k; j++) s.push({ x: (j - k / 2) * PIN_SPACING, z: HEAD_Z - k * ROW_DZ });
  return s;
})();

/** Tuning that differs between Normal and Easy (the physics itself never changes). */
export interface SimTune {
  /** Scale of the side rotation the release puts on the ball. */
  hook: number;
  /** Easy: the last metres steer a ball heading near the pocket into it (m of tolerance, 0 = off). */
  pocketAssist: number;
  /** Length of the oil from the foul line (m); it wears shorter as a game goes on. */
  oil?: number;
}
export const NORMAL_SIM: SimTune = { hook: 1, pocketAssist: 0 };

/** Side rotation (rad/s) of a full hook. */
export const SPIN_MAX = 34;
/** Share of rolling the release already has (the rest is skid). */
const ROLL_START = 0.22;
/** Where the ball should hit the head pin: a little right of centre for a ball hooking left. */
export const POCKET_X = 0.064;

export type BallMode = 'held' | 'lane' | 'gutter' | 'pit' | 'gone';

export interface Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  wx: number; wy: number; wz: number;
  mode: BallMode;
}

export interface Pin {
  /** 0 … 9 for pins 1 … 10. */
  id: number;
  /** In play this ball (false once swept away). */
  live: boolean;
  px: number; py: number; pz: number;
  qx: number; qy: number; qz: number; qw: number;
  vx: number; vy: number; vz: number;
  wx: number; wy: number; wz: number;
  asleep: boolean;
  still: number;
  /** Touched by the ball or another pin during this ball. */
  moved: boolean;
}

/** What happened during one step (for sounds, shakes and the camera). */
export interface StepEvents {
  /** Strongest ball-pin impulse (N·s). */
  ballPin: number;
  /** Strongest pin-pin impulse. */
  pinPin: number;
  /** Strongest pin-floor or pin-wall impulse. */
  pinWall: number;
  /** The ball fell into a gutter this step. */
  gutter: boolean;
  /** The ball reached the pit this step. */
  pit: boolean;
  /** x of the loudest contact (for panning). */
  x: number;
}

export const newEvents = (): StepEvents => ({ ballPin: 0, pinPin: 0, pinWall: 0, gutter: false, pit: false, x: 0 });

interface Contact {
  a: number; b: number;
  nx: number; ny: number; nz: number;
  rax: number; ray: number; raz: number;
  rbx: number; rby: number; rbz: number;
  depth: number;
  e: number; mu: number;
  kn: number; bias: number; target: number;
  t1x: number; t1y: number; t1z: number; t2x: number; t2y: number; t2z: number;
  k1: number; k2: number;
  pn: number; p1: number; p2: number;
  kind: 0 | 1 | 2;   // 0 ball-pin, 1 pin-pin, 2 static
}

/** A small seeded random generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Friction of the boards under z: oil in front, dry back end. */
export function laneMu(z: number, oil = OIL_LEN): number {
  const d = -z;
  if (d < oil) return MU_OIL;
  if (d > oil + OIL_FADE) return MU_DRY;
  const k = (d - oil) / OIL_FADE;
  return MU_OIL + (MU_DRY - MU_OIL) * k * k * (3 - 2 * k);
}

function floorAt(x: number, z: number): number {
  if (z < PIT_Z) return PIT_FLOOR;
  if (Math.abs(x) > LANE_HALF) return -GUTTER_DEPTH;
  return 0;
}

// body index: 0 … 9 pins, 10 the ball
const BALL = 10;

export interface Release {
  /** Start x on the foul line. */
  x: number;
  /** Direction, radians: 0 straight down the lane, positive to the right. */
  angle: number;
  /** m/s. */
  speed: number;
  /** -1 … 1: positive hooks left (the usual right-hander's hook), negative hooks right. */
  hook: number;
}

export class LaneSim {
  ball: Ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, mode: 'held' };
  pins: Pin[] = [];
  /** Seconds since the release. */
  t = 0;
  /** Seconds since the ball reached the head pin row (or -1). */
  deckT = -1;
  /** Seconds everything has been still. */
  calm = 0;
  private contacts: Contact[] = [];
  private inv: Float64Array = new Float64Array(11 * 9);

  constructor(public tune: SimTune = NORMAL_SIM) {
    this.rack(null, 1);
  }

  /** A fresh rack (standing = null) or the given pins left standing where they are. */
  rack(standing: boolean[] | null, seed: number): void {
    const rnd = seeded(seed);
    if (!standing || !this.pins.length) {
      this.pins = SPOTS.map((s, id) => {
        // a few millimetres of play on the spots and a random turn, as on a real deck
        const yaw = rnd() * Math.PI * 2;
        return {
          id, live: true,
          px: s.x + (rnd() - 0.5) * 0.004, py: COM, pz: s.z + (rnd() - 0.5) * 0.004,
          qx: 0, qy: Math.sin(yaw / 2), qz: 0, qw: Math.cos(yaw / 2),
          vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, asleep: true, still: 0, moved: false,
        };
      });
    } else {
      // the pinsetter lifts the standing pins and puts them down upright where they stood
      for (const p of this.pins) {
        p.live = p.live && standing[p.id];
        if (!p.live) continue;
        const yaw = rnd() * Math.PI * 2;
        Object.assign(p, { py: COM, qx: 0, qy: Math.sin(yaw / 2), qz: 0, qw: Math.cos(yaw / 2), vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, asleep: true, still: 0, moved: false });
      }
    }
    this.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, mode: 'held' };
    this.t = 0;
    this.deckT = -1;
    this.calm = 0;
  }

  /** Lets the ball go. */
  release(r: Release): void {
    const b = this.ball;
    const s = r.speed;
    b.x = r.x;
    b.y = BALL_R;
    b.z = -0.05;
    b.vx = Math.sin(r.angle) * s;
    b.vz = -Math.cos(r.angle) * s;
    b.vy = 0;
    // partial forward roll plus side rotation (the hook)
    b.wx = (b.vz / BALL_R) * ROLL_START;
    b.wz = r.hook * SPIN_MAX * this.tune.hook;
    b.wy = r.hook * 8;
    b.mode = 'lane';
    this.t = 0;
    this.deckT = -1;
    this.calm = 0;
  }

  /** Pins standing now (live and upright on the deck). */
  standing(): boolean[] {
    return this.pins.map((p) => p.live && isUp(p));
  }

  /** True when the ball is done and the pins have stopped (or the time is up). */
  done(): boolean {
    const b = this.ball;
    if (b.mode === 'held') return false;
    const ballDone = b.mode === 'pit' || b.mode === 'gone' || (Math.hypot(b.vx, b.vz) < 0.05);
    if (ballDone && this.deckT < 0 && b.mode !== 'gone') this.deckT = 0;
    if (!ballDone) return false;
    if (this.deckT > 3.6) return true;
    return this.calm > 0.35;
  }

  /** One fixed step of SIM_DT. */
  step(ev: StepEvents = newEvents()): StepEvents {
    const b = this.ball;
    if (b.mode === 'held') return ev;
    const anyAwake = this.pins.some((p) => p.live && !p.asleep);
    const nearPins = b.z < HEAD_Z + 1.2 && b.mode !== 'gone';
    const sub = anyAwake || nearPins ? SUB : 1;
    const h = SIM_DT / sub;
    for (let s = 0; s < sub; s++) this.substep(h, ev);
    this.t += SIM_DT;
    if (this.deckT >= 0) this.deckT += SIM_DT;
    else if (b.z < HEAD_Z + 0.2) this.deckT = 0;
    // calm: every live pin asleep or nearly still
    let moving = false;
    for (const p of this.pins) {
      if (!p.live || p.asleep) continue;
      // pins in the pit or a gutter are out of play: they no longer hold up the count
      if (p.pz < PIT_Z - 0.05 || Math.abs(p.px) > LANE_HALF + 0.08) continue;
      // a standing pin that still wobbles may yet fall; a pin lying down only rocks
      const lying = axisOf(p)[1] < 0.5;
      const v = Math.hypot(p.vx, p.vy, p.vz), w = Math.hypot(p.wx, p.wy, p.wz);
      if (lying ? v > 0.1 || w > 1.2 : v > 0.04 || w > 0.4) moving = true;
    }
    this.calm = moving ? 0 : this.calm + SIM_DT;
    return ev;
  }

  private substep(h: number, ev: StepEvents): void {
    const b = this.ball;
    this.moveBallOnLane(h, ev);
    // gravity on awake pins
    for (const p of this.pins) {
      if (!p.live || p.asleep) continue;
      p.vy -= G * h;
    }
    if (b.mode === 'pit') b.vy -= G * h;
    this.collide(ev);
    this.solve(h, ev);
    // integrate
    for (const p of this.pins) {
      if (!p.live || p.asleep) continue;
      p.px += p.vx * h; p.py += p.vy * h; p.pz += p.vz * h;
      integrateQ(p, h);
      // a little air drag and rolling resistance
      // (a pin lying down rocks and rolls to a stop quickly)
      const lying = axisOf(p)[1] < 0.5 && p.py < 0.08;
      const dv = 1 - (lying ? 0.8 : 0.05) * h, dw = 1 - (lying ? 3.5 : 0.6) * h;
      p.vx *= dv; p.vy *= dv; p.vz *= dv;
      p.wx *= dw; p.wy *= dw; p.wz *= dw;
      const slow = Math.hypot(p.vx, p.vy, p.vz) < 0.03 && Math.hypot(p.wx, p.wy, p.wz) < 0.3;
      p.still = slow ? p.still + h : 0;
      if (p.still > 0.3) {
        p.asleep = true;
        p.vx = p.vy = p.vz = p.wx = p.wy = p.wz = 0;
      }
      // fell out of the world (far into the pit): gone
      if (p.py < PIT_FLOOR - 0.5 || p.pz < BACK_Z - 1) { p.asleep = true; p.py = PIT_FLOOR; }
    }
    if (b.mode === 'lane' || b.mode === 'pit' || b.mode === 'gutter') {
      b.x += b.vx * h; b.z += b.vz * h;
      if (b.mode === 'pit') {
        b.y += b.vy * h;
        if (b.y < PIT_FLOOR + BALL_R) { b.y = PIT_FLOOR + BALL_R; b.vy = Math.abs(b.vy) > 0.6 ? -b.vy * 0.2 : 0; b.vx *= 0.97; b.vz *= 0.97; }
        if (b.z < BACK_Z + BALL_R) { b.z = BACK_Z + BALL_R; b.vz = Math.abs(b.vz) * 0.12; b.vx *= 0.5; }
        if (Math.abs(b.x) > WALL_X - BALL_R) { b.x = Math.sign(b.x) * (WALL_X - BALL_R); b.vx = -b.vx * 0.3; }
        if (Math.hypot(b.vx, b.vz) < 0.08 && b.y <= PIT_FLOOR + BALL_R + 0.001) b.mode = 'gone';
      }
    }
  }

  /** Lane friction (skid, hook, roll), the gutters, the pit and Easy's pocket help. */
  private moveBallOnLane(h: number, ev: StepEvents): void {
    const b = this.ball;
    if (b.mode === 'lane') {
      if (Math.abs(b.x) > LANE_HALF) {
        b.mode = 'gutter';
        ev.gutter = true;
      }
    }
    if (b.mode === 'lane') {
      b.y = BALL_R;
      b.vy = 0;
      const mu = laneMu(b.z, this.tune.oil);
      const sx = b.vx + b.wz * BALL_R;
      const sz = b.vz - b.wx * BALL_R;
      const slip = Math.hypot(sx, sz);
      if (slip > 1e-6) {
        // a uniform ball: I = 2/5 m R², so killing slip s takes s·m / (1 + 5/2)
        const jMax = slip * BALL_M / 3.5;
        const j = Math.min(mu * BALL_M * G * h, jMax);
        const jx = -sx / slip * j, jz = -sz / slip * j;
        b.vx += jx / BALL_M;
        b.vz += jz / BALL_M;
        const invI = 1 / (0.4 * BALL_M * BALL_R * BALL_R);
        b.wx += -BALL_R * jz * invI;
        b.wz += BALL_R * jx * invI;
      }
      // rolling resistance
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const k = Math.max(0, 1 - 0.09 * h / Math.max(sp, 0.5));
        b.vx *= k; b.vz *= k; b.wx *= k; b.wz *= k;
      }
      // the side spin slowly bleeds into the forward roll
      b.wy *= 1 - 0.5 * h;
      // Easy: a ball heading near the pocket is steered into it over the last metres
      const tol = this.tune.pocketAssist;
      if (tol > 0 && b.z < HEAD_Z + 5 && b.z > HEAD_Z + 0.25 && b.vz < -0.5) {
        const dz = HEAD_Z - b.z;
        const xAt = b.x + (b.vx / b.vz) * dz;
        const side = b.vx < -0.02 ? 1 : b.vx > 0.02 ? -1 : Math.sign(xAt || 1);
        const target = side * POCKET_X;
        const off = target - xAt;
        if (Math.abs(off) < tol) {
          const want = off / (dz / b.vz);   // lateral speed change that lands on the pocket
          b.vx += want * Math.min(1, h * 3);
        }
      }
      if (b.z < PIT_Z) {
        b.mode = 'pit';
        ev.pit = true;
      }
    } else if (b.mode === 'gutter') {
      // the ball rides the channel to the pit; it can no longer reach a pin
      const cx = Math.sign(b.x) * (LANE_HALF + GUTTER_W / 2);
      b.vx += (cx - b.x) * 40 * h - b.vx * 8 * h;
      b.y += ((BALL_R - GUTTER_DEPTH + 0.03) - b.y) * Math.min(1, 14 * h);
      b.wz *= 1 - 3 * h;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const k = Math.max(0, 1 - 0.12 * h / Math.max(sp, 0.5)); b.vz *= k; }
      b.wx = b.vz / BALL_R;
      if (b.z < PIT_Z) {
        b.mode = 'pit';
        ev.pit = true;
      }
    }
  }

  // ------------------------------------------------------------------ contacts

  private collide(ev: StepEvents): void {
    const cs = this.contacts;
    cs.length = 0;
    const b = this.ball;
    const pins = this.pins;
    const ballHits = b.mode === 'lane' || b.mode === 'pit';
    // world positions of every pin's hull spheres
    const hull: number[][] = [];
    for (const p of pins) {
      if (!p.live) { hull.push([]); continue; }
      const ax = axisOf(p);
      const arr: number[] = [];
      for (const [hgt, r] of PIN_HULL) {
        const d = hgt - COM;
        arr.push(p.px + ax[0] * d, p.py + ax[1] * d, p.pz + ax[2] * d, r);
      }
      hull.push(arr);
    }
    // ball against pins
    if (ballHits) {
      const bSpeed = Math.hypot(b.vx, b.vz);
      for (const p of pins) {
        if (!p.live) continue;
        if (Math.abs(p.px - b.x) > 0.5 || Math.abs(p.pz - b.z) > 0.5) continue;
        const hs = hull[p.id];
        for (let i = 0; i < hs.length; i += 4) {
          const dx = hs[i] - b.x, dy = hs[i + 1] - b.y, dz = hs[i + 2] - b.z;
          const rr = hs[i + 3] + BALL_R;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-6;
          if (p.asleep && bSpeed > 0.05) wake(p);
          if (p.asleep) continue;
          p.moved = true;
          // normal from the ball (b) to the pin (a)
          this.push(p.id, BALL, dx / d, dy / d, dz / d, b.x + dx / d * BALL_R, b.y + dy / d * BALL_R, b.z + dz / d * BALL_R, rr - d, 0.62, 0.12, 0);
        }
      }
    }
    // pin against pin
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      if (!p.live) continue;
      for (let j = i + 1; j < pins.length; j++) {
        const o = pins[j];
        if (!o.live || (p.asleep && o.asleep)) continue;
        const dxc = p.px - o.px, dyc = p.py - o.py, dzc = p.pz - o.pz;
        if (dxc * dxc + dyc * dyc + dzc * dzc > 0.52 * 0.52) continue;
        const ha = hull[i], hb = hull[j];
        for (let s = 0; s < ha.length; s += 4) {
          for (let u = 0; u < hb.length; u += 4) {
            const dx = ha[s] - hb[u], dy = ha[s + 1] - hb[u + 1], dz = ha[s + 2] - hb[u + 2];
            const rr = ha[s + 3] + hb[u + 3];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2) || 1e-6;
            // a sleeping pin wakes when a moving one touches it
            const pa = p.asleep ? 0 : Math.hypot(p.vx, p.vy, p.vz) + Math.hypot(p.wx, p.wy, p.wz) * 0.15;
            const pb = o.asleep ? 0 : Math.hypot(o.vx, o.vy, o.vz) + Math.hypot(o.wx, o.wy, o.wz) * 0.15;
            if (p.asleep && pb > 0.08) wake(p);
            if (o.asleep && pa > 0.08) wake(o);
            if (p.asleep && o.asleep) continue;
            p.moved = o.moved = true;
            const nx = dx / d, ny = dy / d, nz = dz / d;
            const cx = hb[u] + nx * hb[u + 3], cy = hb[u + 1] + ny * hb[u + 3], cz = hb[u + 2] + nz * hb[u + 3];
            this.push(i, j, nx, ny, nz, cx, cy, cz, rr - d, 0.42, 0.18, 1);
          }
        }
      }
    }
    // pins against the floor, walls, pit cushion and hood
    for (const p of pins) {
      if (!p.live || p.asleep) continue;
      const hs = hull[p.id];
      const pts: number[] = [];
      for (let i = 0; i < hs.length; i += 4) pts.push(hs[i], hs[i + 1], hs[i + 2], hs[i + 3]);
      for (const [fx, fz] of FEET) {
        const w = rotate(p, fx, -COM + FOOT_R, fz);
        pts.push(p.px + w[0], p.py + w[1], p.pz + w[2], FOOT_R);
      }
      for (let i = 0; i < pts.length; i += 4) {
        const x = pts[i], y = pts[i + 1], z = pts[i + 2], r = pts[i + 3];
        const fy = floorAt(x, z);
        if (y - r < fy) this.push(p.id, -1, 0, 1, 0, x, fy, z, fy - (y - r), 0.25, 0.32, 2);
        if (x + r > WALL_X) this.push(p.id, -1, -1, 0, 0, WALL_X, y, z, x + r - WALL_X, 0.45, 0.2, 2);
        if (x - r < -WALL_X) this.push(p.id, -1, 1, 0, 0, -WALL_X, y, z, -WALL_X - (x - r), 0.45, 0.2, 2);
        if (z - r < BACK_Z) this.push(p.id, -1, 0, 0, 1, x, y, BACK_Z, BACK_Z - (z - r), 0.12, 0.5, 2);
        if (z < HOOD_FROM_Z && y + r > HOOD_Y) this.push(p.id, -1, 0, -1, 0, x, HOOD_Y, z, y + r - HOOD_Y, 0.3, 0.2, 2);
        // the step down from the deck into the pit
        if (z <= PIT_Z && z + r > PIT_Z && y < -0.005) this.push(p.id, -1, 0, 0, -1, x, y, PIT_Z, z + r - PIT_Z, 0.2, 0.3, 2);
      }
    }
    void ev;
  }

  private push(a: number, b: number, nx: number, ny: number, nz: number, cx: number, cy: number, cz: number, depth: number, e: number, mu: number, kind: 0 | 1 | 2): void {
    const A = this.body(a);
    const c: Contact = {
      a, b, nx, ny, nz,
      rax: cx - A.px, ray: cy - A.py, raz: cz - A.pz,
      rbx: 0, rby: 0, rbz: 0,
      depth, e, mu, kn: 0, bias: 0, target: 0,
      t1x: 0, t1y: 0, t1z: 0, t2x: 0, t2y: 0, t2z: 0, k1: 0, k2: 0,
      pn: 0, p1: 0, p2: 0, kind,
    };
    if (b >= 0) {
      const B = this.body(b);
      c.rbx = cx - B.px; c.rby = cy - B.py; c.rbz = cz - B.pz;
    }
    this.contacts.push(c);
  }

  private body(i: number): { px: number; py: number; pz: number } {
    if (i === BALL) return { px: this.ball.x, py: this.ball.y, pz: this.ball.z };
    return this.pins[i];
  }

  private invMass(i: number): number {
    if (i < 0) return 0;
    if (i === BALL) return this.ball.mode === 'lane' || this.ball.mode === 'pit' ? 1 / BALL_M : 0;
    return this.pins[i].asleep ? 0 : 1 / PIN_M;
  }

  /** World inverse inertia of every awake pin (R · diag · Rᵀ). */
  private updateInertia(): void {
    const m = this.inv;
    m.fill(0);
    for (const p of this.pins) {
      if (!p.live || p.asleep) continue;
      const ax = axisOf(p);
      // diag(tr, ax, tr) in the pin frame = tr·I + (ax - tr)·a·aᵀ
      const tr = PIN_INV_I_TR, d = PIN_INV_I_AX - PIN_INV_I_TR;
      const o = p.id * 9;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[o + r * 3 + c] = (r === c ? tr : 0) + d * ax[r] * ax[c];
    }
  }

  private vel(i: number, rx: number, ry: number, rz: number): [number, number, number] {
    if (i < 0) return [0, 0, 0];
    if (i === BALL) return [this.ball.vx, this.ball.vy, this.ball.vz];
    const p = this.pins[i];
    return [p.vx + p.wy * rz - p.wz * ry, p.vy + p.wz * rx - p.wx * rz, p.vz + p.wx * ry - p.wy * rx];
  }

  /** K along a direction for one body: 1/m + d·((I⁻¹(r×d))×r). */
  private kOf(i: number, rx: number, ry: number, rz: number, dx: number, dy: number, dz: number): number {
    const im = this.invMass(i);
    if (im === 0) return 0;
    if (i === BALL) return im;
    const cx = ry * dz - rz * dy, cy = rz * dx - rx * dz, cz = rx * dy - ry * dx;
    const m = this.inv, o = i * 9;
    const ix = m[o] * cx + m[o + 1] * cy + m[o + 2] * cz;
    const iy = m[o + 3] * cx + m[o + 4] * cy + m[o + 5] * cz;
    const iz = m[o + 6] * cx + m[o + 7] * cy + m[o + 8] * cz;
    // (I⁻¹(r×d)) × r · d
    const ux = iy * rz - iz * ry, uy = iz * rx - ix * rz, uz = ix * ry - iy * rx;
    return im + ux * dx + uy * dy + uz * dz;
  }

  private apply(i: number, rx: number, ry: number, rz: number, jx: number, jy: number, jz: number): void {
    if (i < 0) return;
    const im = this.invMass(i);
    if (im === 0) return;
    if (i === BALL) {
      const b = this.ball;
      b.vx += jx * im; b.vz += jz * im;
      if (b.mode === 'pit') b.vy += jy * im;
      return;
    }
    const p = this.pins[i];
    p.vx += jx * im; p.vy += jy * im; p.vz += jz * im;
    const cx = ry * jz - rz * jy, cy = rz * jx - rx * jz, cz = rx * jy - ry * jx;
    const m = this.inv, o = i * 9;
    p.wx += m[o] * cx + m[o + 1] * cy + m[o + 2] * cz;
    p.wy += m[o + 3] * cx + m[o + 4] * cy + m[o + 5] * cz;
    p.wz += m[o + 6] * cx + m[o + 7] * cy + m[o + 8] * cz;
  }

  private solve(h: number, ev: StepEvents): void {
    const cs = this.contacts;
    if (!cs.length) return;
    this.updateInertia();
    for (const c of cs) {
      c.kn = this.kOf(c.a, c.rax, c.ray, c.raz, c.nx, c.ny, c.nz) + this.kOf(c.b, c.rbx, c.rby, c.rbz, c.nx, c.ny, c.nz);
      // tangent basis
      if (Math.abs(c.nx) < 0.9) { c.t1x = 0; c.t1y = -c.nz; c.t1z = c.ny; } else { c.t1x = c.nz; c.t1y = 0; c.t1z = -c.nx; }
      const l = Math.hypot(c.t1x, c.t1y, c.t1z) || 1;
      c.t1x /= l; c.t1y /= l; c.t1z /= l;
      c.t2x = c.ny * c.t1z - c.nz * c.t1y; c.t2y = c.nz * c.t1x - c.nx * c.t1z; c.t2z = c.nx * c.t1y - c.ny * c.t1x;
      c.k1 = this.kOf(c.a, c.rax, c.ray, c.raz, c.t1x, c.t1y, c.t1z) + this.kOf(c.b, c.rbx, c.rby, c.rbz, c.t1x, c.t1y, c.t1z);
      c.k2 = this.kOf(c.a, c.rax, c.ray, c.raz, c.t2x, c.t2y, c.t2z) + this.kOf(c.b, c.rbx, c.rby, c.rbz, c.t2x, c.t2y, c.t2z);
      const va = this.vel(c.a, c.rax, c.ray, c.raz), vb = this.vel(c.b, c.rbx, c.rby, c.rbz);
      const vn = (va[0] - vb[0]) * c.nx + (va[1] - vb[1]) * c.ny + (va[2] - vb[2]) * c.nz;
      c.target = vn < -0.35 ? -c.e * vn : 0;
      c.bias = 0.25 / h * Math.max(0, c.depth - 0.001);
    }
    for (let it = 0; it < 10; it++) {
      for (const c of cs) {
        if (c.kn <= 0) continue;
        const va = this.vel(c.a, c.rax, c.ray, c.raz), vb = this.vel(c.b, c.rbx, c.rby, c.rbz);
        const rx = va[0] - vb[0], ry = va[1] - vb[1], rz = va[2] - vb[2];
        const vn = rx * c.nx + ry * c.ny + rz * c.nz;
        let dp = (Math.max(c.target, c.bias) - vn) / c.kn;
        const p0 = c.pn;
        c.pn = Math.max(0, p0 + dp);
        dp = c.pn - p0;
        if (dp !== 0) {
          this.apply(c.a, c.rax, c.ray, c.raz, c.nx * dp, c.ny * dp, c.nz * dp);
          this.apply(c.b, c.rbx, c.rby, c.rbz, -c.nx * dp, -c.ny * dp, -c.nz * dp);
        }
        // friction
        if (c.mu > 0 && c.pn > 0) {
          const va2 = this.vel(c.a, c.rax, c.ray, c.raz), vb2 = this.vel(c.b, c.rbx, c.rby, c.rbz);
          const sx = va2[0] - vb2[0], sy = va2[1] - vb2[1], sz = va2[2] - vb2[2];
          const v1 = sx * c.t1x + sy * c.t1y + sz * c.t1z;
          const v2 = sx * c.t2x + sy * c.t2y + sz * c.t2z;
          let n1 = c.p1 - (c.k1 > 0 ? v1 / c.k1 : 0);
          let n2 = c.p2 - (c.k2 > 0 ? v2 / c.k2 : 0);
          const lim = c.mu * c.pn, mag = Math.hypot(n1, n2);
          if (mag > lim) { n1 *= lim / mag; n2 *= lim / mag; }
          const d1 = n1 - c.p1, d2 = n2 - c.p2;
          c.p1 = n1; c.p2 = n2;
          const jx = c.t1x * d1 + c.t2x * d2, jy = c.t1y * d1 + c.t2y * d2, jz = c.t1z * d1 + c.t2z * d2;
          this.apply(c.a, c.rax, c.ray, c.raz, jx, jy, jz);
          this.apply(c.b, c.rbx, c.rby, c.rbz, -jx, -jy, -jz);
        }
      }
    }
    // the loudest contacts of this step, for the sounds
    for (const c of cs) {
      const j = c.pn;
      if (c.kind === 0) { if (j > ev.ballPin) { ev.ballPin = j; ev.x = c.rax + this.pins[c.a].px; } }
      else if (c.kind === 1) { if (j > ev.pinPin) { ev.pinPin = j; if (j > ev.ballPin) ev.x = this.pins[c.a].px; } }
      else if (j > ev.pinWall) ev.pinWall = j;
    }
  }

  // ------------------------------------------------------------------ snapshots

  snapshot(): SimState {
    return { ball: { ...this.ball }, pins: this.pins.map((p) => ({ ...p })), t: this.t, deckT: this.deckT, calm: this.calm };
  }

  restore(s: SimState): void {
    this.ball = { ...s.ball };
    this.pins = s.pins.map((p) => ({ ...p }));
    this.t = s.t;
    this.deckT = s.deckT;
    this.calm = s.calm;
  }
}

export interface SimState {
  ball: Ball;
  pins: Pin[];
  t: number;
  deckT: number;
  calm: number;
}

function wake(p: Pin): void {
  p.asleep = false;
  p.still = 0;
}

/** Unit vector of the pin's axis (base to head). */
export function axisOf(p: { qx: number; qy: number; qz: number; qw: number }): [number, number, number] {
  const { qx: x, qy: y, qz: z, qw: w } = p;
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
}

function rotate(p: Pin, vx: number, vy: number, vz: number): [number, number, number] {
  const { qx: x, qy: y, qz: z, qw: w } = p;
  // v' = q v q*
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

function integrateQ(p: Pin, h: number): void {
  const { wx, wy, wz } = p;
  const { qx, qy, qz, qw } = p;
  const k = 0.5 * h;
  p.qx += k * (wx * qw + wy * qz - wz * qy);
  p.qy += k * (wy * qw + wz * qx - wx * qz);
  p.qz += k * (wz * qw + wx * qy - wy * qx);
  p.qw += k * (-wx * qx - wy * qy - wz * qz);
  const l = Math.hypot(p.qx, p.qy, p.qz, p.qw) || 1;
  p.qx /= l; p.qy /= l; p.qz /= l; p.qw /= l;
}

/** Upright on the deck: the axis within 30° of vertical, on the lane, not in the pit or gutter. */
export function isUp(p: Pin): boolean {
  const a = axisOf(p);
  if (a[1] < 0.86) return false;
  if (p.pz < PIT_Z || Math.abs(p.px) > LANE_HALF + 0.01) return false;
  if (p.py < COM - 0.03) return false;
  return true;
}

/** Base position of a pin (for drawing): the point on its axis at the floor end. */
export const PIN_COM = COM;

/** Pins standing → is it a split? Head pin down and the standing pins fall in two or more groups. */
export function isSplit(standing: boolean[]): boolean {
  if (standing[0]) return false;
  const ids = standing.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  if (ids.length < 2) return false;
  const seen = new Set<number>();
  let groups = 0;
  for (const s of ids) {
    if (seen.has(s)) continue;
    groups++;
    const stack = [s];
    seen.add(s);
    while (stack.length) {
      const a = stack.pop()!;
      for (const b of ids) {
        if (seen.has(b)) continue;
        if (Math.hypot(SPOTS[a].x - SPOTS[b].x, SPOTS[a].z - SPOTS[b].z) < PIN_SPACING * 1.05) { seen.add(b); stack.push(b); }
      }
    }
  }
  return groups >= 2;
}

/**
 * Runs a release to the end on a copy of the state (for the strike preview, the bot and tests).
 * Returns the pins left standing and how long it took.
 */
export function simulate(sim: LaneSim, r: Release, maxT = 14): { standing: boolean[]; t: number; gutter: boolean; headX: number; entry: number } {
  const save = sim.snapshot();
  sim.release(r);
  let gutter = false, headX = NaN, entry = 0;
  const ev = newEvents();
  for (let i = 0; i < maxT / SIM_DT; i++) {
    const z0 = sim.ball.z;
    ev.gutter = false;
    sim.step(ev);
    if (ev.gutter) gutter = true;
    if (Number.isNaN(headX) && z0 >= HEAD_Z && sim.ball.z < HEAD_Z) {
      headX = sim.ball.x;
      entry = Math.atan2(sim.ball.vx, -sim.ball.vz);
    }
    if (sim.done()) break;
  }
  const out = { standing: sim.standing(), t: sim.t, gutter, headX, entry };
  sim.restore(save);
  return out;
}

/** The ball's path down the lane without pins (Easy's preview): points every `every` metres. */
export function ballPath(tune: SimTune, r: Release, every = 0.45): { x: number; z: number; gutter: boolean }[] {
  const sim = new LaneSim(tune);
  sim.pins.forEach((p) => (p.live = false));
  sim.release(r);
  const pts: { x: number; z: number; gutter: boolean }[] = [];
  let next = 0;
  for (let i = 0; i < 1200; i++) {
    sim.step();
    const b = sim.ball;
    if (-b.z >= next) {
      pts.push({ x: b.x, z: b.z, gutter: b.mode === 'gutter' });
      next += every;
    }
    if (b.z < HEAD_Z - 0.2 || b.mode === 'pit' || b.mode === 'gone' || Math.hypot(b.vx, b.vz) < 0.1) break;
  }
  return pts;
}
