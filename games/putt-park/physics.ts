// Ball physics on the Minigolf Kit tiles. Pure TypeScript (no three.js, no Phaser), so the
// solvability bot runs it in Node as well as in the game.
//
// The course is rasterised from the real tile triangles into a 2.5D field with 1 cm cells:
//   - floor: the height of the playing surface (the green felt; the cup is a flat lid at rim
//     height, the cup itself is handled analytically);
//   - low / high: the vertical span of everything else above the floor in that cell (walls,
//     tunnel roofs, castle and windmill houses). A cell with no floor but some geometry is a
//     solid column (the inside of a wall).
// The ball is a sphere of radius BALL_R. On the ground it follows the floor (slopes push it),
// rolls with friction and bounces off blocked cells; off a ledge or a ramp it flies
// ballistically and lands again. Falling below the course is out of bounds.

export const BALL_R = 0.035;
export const G = 9.8;
/** A floor this much higher than the ball's bottom is a wall, not a slope. */
const STEP = 0.028;
const NONE = -1e9;
const FAR = 1e9;

export interface Tune {
  /** Constant rolling deceleration (units/s²). */
  friction: number;
  /** Speed-proportional deceleration (1/s). */
  drag: number;
  /** Restitution of wall bounces. */
  wallE: number;
  /** Cup radius multiplier for the capture test (Easy is more forgiving). */
  cupScale: number;
  /** Pull towards the cup of a slow ball near it (units/s², 0 = none). */
  magnet: number;
}

export const NORMAL_TUNE: Tune = { friction: 1.05, drag: 0.32, wallE: 0.68, cupScale: 1, magnet: 0 };
export const EASY_TUNE: Tune = { friction: 1.05, drag: 0.32, wallE: 0.68, cupScale: 1.3, magnet: 0.9 };

/** Rasterised course surface. */
export class Field {
  readonly nx: number;
  readonly nz: number;
  readonly floor: Float32Array;
  readonly low: Float32Array;
  readonly high: Float32Array;
  /** Lowest floor of the course (anything far below it is out of bounds). */
  minFloor = FAR;
  private offsets: { di: number; dj: number; dx: number; dz: number }[] = [];

  constructor(readonly x0: number, readonly z0: number, x1: number, z1: number, readonly res = 0.01) {
    this.nx = Math.ceil((x1 - x0) / res) + 1;
    this.nz = Math.ceil((z1 - z0) / res) + 1;
    const n = this.nx * this.nz;
    this.floor = new Float32Array(n).fill(NONE);
    this.low = new Float32Array(n).fill(FAR);
    this.high = new Float32Array(n).fill(NONE);
    const R = Math.ceil(BALL_R / res) + 1;
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const dx = di * res, dz = dj * res;
        if (Math.hypot(dx, dz) <= BALL_R + res * 0.75) this.offsets.push({ di, dj, dx, dz });
      }
    }
  }

  /** Pass 1: upward triangles of the playing surface. `flat` forces one height (the cup lid). */
  rasterFloor(pos: ArrayLike<number>, flat?: number, minY = -FAR): void {
    const { res, x0, z0, nx, nz } = this;
    for (let k = 0; k + 8 < pos.length; k += 9) {
      const ax = pos[k], ay = pos[k + 1], az = pos[k + 2];
      const bx = pos[k + 3], by = pos[k + 4], bz = pos[k + 5];
      const cx = pos[k + 6], cy = pos[k + 7], cz = pos[k + 8];
      if (Math.max(ay, by, cy) < minY) continue;   // the underside of a tile
      // normal y (up) of the triangle; only clearly upward faces are floor
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
      const len = Math.hypot(nX, nY, nZ) || 1;
      if (Math.abs(nY) / len < 0.3) continue;   // either winding (some kit parts are mirrored)
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / res));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / res));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / res));
      const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / res));
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + j * res - az;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + i * res - ax;
          // barycentric (s along u, t along v) in the xz projection
          const s = (px * vz - pz * vx) / det;
          const t = (ux * pz - uz * px) / det;
          const e = -1e-4;
          if (s < e || t < e || s + t > 1 - e) continue;
          const y = flat ?? ay + s * uy + t * vy;
          const c = j * nx + i;
          if (y > this.floor[c]) this.floor[c] = y;
        }
      }
    }
  }

  /** Between the passes: closes hairline gaps in the felt where two tiles meet. */
  fillSeams(): void {
    const { nx, nz, floor } = this;
    for (let j = 1; j < nz - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const c = j * nx + i;
        if (floor[c] > NONE) continue;
        for (const [a, b] of [[c - 1, c + 1], [c - nx, c + nx], [c - 1, c + 2], [c - nx, c + 2 * nx]]) {
          if (b >= floor.length) continue;
          const fa = floor[a], fb = floor[b];
          if (fa > NONE && fb > NONE && Math.abs(fa - fb) < 0.01) {
            floor[c] = (fa + fb) / 2;
            if (b === c + 2) floor[c + 1] = floor[c];
            if (b === c + 2 * nx) floor[c + nx] = floor[c];
            break;
          }
        }
      }
    }
  }

  /** Pass 2: everything else (walls, roofs, houses), sampled densely. */
  rasterSolid(pos: ArrayLike<number>, skipFloorUp = false): void {
    const { res, x0, z0, nx, nz } = this;
    const step = res * 0.5;
    for (let k = 0; k + 8 < pos.length; k += 9) {
      let A = [pos[k], pos[k + 1], pos[k + 2]], B = [pos[k + 3], pos[k + 4], pos[k + 5]], C = [pos[k + 6], pos[k + 7], pos[k + 8]];
      if (skipFloorUp) {
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
        if (Math.abs(nY) / (Math.hypot(nX, nY, nZ) || 1) >= 0.3) continue;
      }
      // sample on a grid along the two edges that meet at the vertex facing the longest edge
      const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const ab = d(A, B), bc = d(B, C), ca = d(C, A);
      if (ab >= bc && ab >= ca) [A, B, C] = [C, A, B];
      else if (ca >= ab && ca >= bc) [A, B, C] = [B, C, A];
      const nu = Math.max(1, Math.ceil(d(A, B) / step)), nv = Math.max(1, Math.ceil(d(A, C) / step));
      for (let a = 0; a <= nu; a++) {
        const s = a / nu;
        const vmax = Math.floor((1 - s) * nv + 1e-6);
        for (let b = 0; b <= vmax; b++) {
          const t = b / nv;
          const x = A[0] + (B[0] - A[0]) * s + (C[0] - A[0]) * t;
          const y = A[1] + (B[1] - A[1]) * s + (C[1] - A[1]) * t;
          const z = A[2] + (B[2] - A[2]) * s + (C[2] - A[2]) * t;
          const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const c = j * nx + i;
          const f = this.floor[c];
          if (f > NONE && y <= f + 0.006) continue;
          if (y < this.low[c]) this.low[c] = y;
          if (y > this.high[c]) this.high[c] = y;
        }
      }
    }
  }

  /** After both passes: a cell without floor but with geometry is solid all the way down. */
  finish(): void {
    for (let c = 0; c < this.floor.length; c++) {
      const f = this.floor[c];
      if (f <= NONE && this.high[c] > NONE) this.low[c] = -FAR;
      if (f > NONE && f < this.minFloor) this.minFloor = f;
    }
  }

  cell(x: number, z: number): number {
    const i = Math.round((x - this.x0) / this.res), j = Math.round((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** Floor height under a point (bilinear where all four cells have floor), or NONE. */
  floorAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nz - 1) return NONE;
    const tx = fx - i, tz = fz - j;
    const c = j * this.nx + i;
    const a = this.floor[c], b = this.floor[c + 1], cc = this.floor[c + this.nx], d = this.floor[c + this.nx + 1];
    if (a > NONE && b > NONE && cc > NONE && d > NONE && Math.max(a, b, cc, d) - Math.min(a, b, cc, d) < STEP) {
      return (a * (1 - tx) + b * tx) * (1 - tz) + (cc * (1 - tx) + d * tx) * tz;
    }
    const n = this.cell(x, z);
    return n < 0 ? NONE : this.floor[n];
  }

  /** Floor slope (dh/dx, dh/dz) around a point at height y. */
  slope(x: number, z: number, y: number): [number, number] {
    const e = this.res * 1.5;
    const ok = (h: number) => h > NONE && Math.abs(h - y) < STEP;
    const hxp = this.floorAt(x + e, z), hxm = this.floorAt(x - e, z);
    const hzp = this.floorAt(x, z + e), hzm = this.floorAt(x, z - e);
    let gx = 0, gz = 0;
    if (ok(hxp) && ok(hxm)) gx = (hxp - hxm) / (2 * e);
    else if (ok(hxp)) gx = (hxp - y) / e;
    else if (ok(hxm)) gx = (y - hxm) / e;
    if (ok(hzp) && ok(hzm)) gz = (hzp - hzm) / (2 * e);
    else if (ok(hzp)) gz = (hzp - y) / e;
    else if (ok(hzm)) gz = (y - hzm) / e;
    return [gx, gz];
  }

  private blocked(c: number, yb: number): boolean {
    const f = this.floor[c];
    if (f > NONE && f > yb + STEP) return true;
    const hi = this.high[c];
    if (hi <= NONE) return false;
    const lo = this.low[c];
    // a wall (a solid column with no felt under it) also stops a ball that climbed a bank above
    // its top: the rims of the kit are meant to keep the ball in
    if (lo < -1e8) return hi > yb - 0.15;
    return hi > yb + STEP && lo < yb + 2 * BALL_R - 0.004;
  }

  /**
   * Contact of a ball (bottom at yb) with blocked cells: the push-out normal and depth,
   * or null when it touches nothing.
   */
  contact(x: number, z: number, yb: number): { nx: number; nz: number; depth: number } | null {
    const fi = (x - this.x0) / this.res, fj = (z - this.z0) / this.res;
    const ci = Math.round(fi), cj = Math.round(fj);
    let sx = 0, sz = 0, depth = 0, any = false;
    for (const o of this.offsets) {
      const i = ci + o.di, j = cj + o.dj;
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      const c = j * this.nx + i;
      if (!this.blocked(c, yb)) continue;
      const px = this.x0 + i * this.res, pz = this.z0 + j * this.res;
      const dx = x - px, dz = z - pz;
      const dist = Math.hypot(dx, dz);
      const pen = BALL_R + this.res * 0.5 - dist;
      if (pen <= 0) continue;
      any = true;
      if (dist > 1e-6) {
        sx += (dx / dist) * pen;
        sz += (dz / dist) * pen;
      }
      if (pen > depth) depth = pen;
    }
    if (!any) return null;
    const l = Math.hypot(sx, sz);
    if (l < 1e-9) return null;
    return { nx: sx / l, nz: sz / l, depth };
  }

  /** True when a ball standing at (x, z) on the floor touches no wall. */
  clearAt(x: number, z: number): boolean {
    const f = this.floorAt(x, z);
    return f > NONE && !this.contact(x, z, f);
  }
}

export const hasFloor = (h: number): boolean => h > NONE;

export interface Ball {
  x: number;
  /** Height of the ball's bottom (the contact point). */
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  air: boolean;
}

export interface Cup {
  x: number;
  z: number;
  /** Radius of the hole. */
  r: number;
  /** Rim height. */
  y: number;
}

/** Something that moves on its own (windmill blades, sliding blocks, sweepers). */
export interface Mover {
  /** Pose at hole time t (seconds). */
  update(t: number): void;
  /** Pushes the ball out and bounces it; returns the impact speed (0 = no contact). */
  collide(b: Ball): number;
}

export interface StepEvents {
  wall: number;
  land: number;
  mover: number;
  lip: boolean;
}

export type BallResult = 'roll' | 'stop' | 'sunk' | 'out';

const MAX_SUB = 0.012;   // the ball moves at most this far per substep (well under its radius)

/** Advances the ball by dt; `t` is the hole clock (for the movers). */
export class Sim {
  /** Set while the ball is over the cup after a pass that did not drop it (no double tests). */
  private overCup = false;

  constructor(readonly field: Field, readonly cup: Cup, readonly movers: Mover[], public tune: Tune) {}

  reset(): void {
    this.overCup = false;
  }

  step(b: Ball, t: number, dt: number, ev?: StepEvents): BallResult {
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    const n = Math.max(1, Math.min(40, Math.ceil((sp * dt) / MAX_SUB)));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      const tt = t + h * (k + 1);
      for (const m of this.movers) m.update(tt);
      const r = this.sub(b, h, ev);
      if (r !== 'roll') return r;
    }
    return 'roll';
  }

  private sub(b: Ball, dt: number, ev?: StepEvents): BallResult {
    const f = this.field;
    const tune = this.tune;
    if (!b.air) {
      const [gx, gz] = f.slope(b.x, b.z, b.y);
      const g2 = gx * gx + gz * gz;
      // gravity along the slope (horizontal part)
      let ax = (-G * gx) / (1 + g2), az = (-G * gz) / (1 + g2);
      const sp = Math.hypot(b.vx, b.vz);
      // a slow ball near the cup is pulled in (Easy)
      if (tune.magnet > 0 && sp < 1.6) {
        const dx = this.cup.x - b.x, dz = this.cup.z - b.z, d = Math.hypot(dx, dz);
        if (d < this.cup.r * 3.2 && d > 1e-4) {
          ax += (dx / d) * tune.magnet;
          az += (dz / d) * tune.magnet;
        }
      }
      const slopeAcc = Math.hypot(ax, az);
      if (sp < 0.045 && slopeAcc < 0.5) {
        b.vx = b.vz = b.vy = 0;
        return 'stop';
      }
      b.vx += ax * dt;
      b.vz += az * dt;
      const sp2 = Math.hypot(b.vx, b.vz);
      if (sp2 > 1e-6) {
        const dec = Math.min(sp2, (tune.friction + tune.drag * sp2) * dt);
        b.vx -= (b.vx / sp2) * dec;
        b.vz -= (b.vz / sp2) * dec;
      }
      const vyS = gx * b.vx + gz * b.vz;   // the surface carries the ball up or down
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      const hNew = f.floorAt(b.x, b.z);
      const ballistic = b.y + vyS * dt - 0.5 * G * dt * dt;
      if (!hasFloor(hNew) || hNew < ballistic - 0.004) {
        // off a ledge or over a crest: fly
        b.air = true;
        b.vy = vyS;
        b.y += vyS * dt;
      } else if (hNew > b.y + STEP) {
        // a step up we cannot climb: handled as a wall by the contact test (stay at our height)
      } else {
        b.vy = (hNew - b.y) / dt;
        b.y = hNew;
      }
    } else {
      b.vy -= G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const hNew = f.floorAt(b.x, b.z);
      if (hasFloor(hNew) && b.y <= hNew && b.y > hNew - STEP * 1.5) {
        const [gx, gz] = f.slope(b.x, b.z, hNew);
        const vn = b.vy - (gx * b.vx + gz * b.vz);   // speed into the surface (negative)
        b.y = hNew;
        if (ev) ev.land = Math.max(ev.land, -vn);
        if (vn < -0.9) {
          b.vy = -vn * 0.32 + (gx * b.vx + gz * b.vz);
          // landing scrubs a little speed
          b.vx *= 0.94;
          b.vz *= 0.94;
        } else {
          b.air = false;
          b.vy = gx * b.vx + gz * b.vz;
          b.vx *= 0.97;
          b.vz *= 0.97;
        }
      }
    }

    // walls
    const c = f.contact(b.x, b.z, b.y);
    if (c) {
      b.x += c.nx * c.depth;
      b.z += c.nz * c.depth;
      const vn = b.vx * c.nx + b.vz * c.nz;
      if (vn < 0) {
        const e = tune.wallE;
        b.vx -= (1 + e) * vn * c.nx;
        b.vz -= (1 + e) * vn * c.nz;
        // a little tangential scrub
        b.vx *= 0.985;
        b.vz *= 0.985;
        if (ev) ev.wall = Math.max(ev.wall, -vn);
      }
    }
    for (const m of this.movers) {
      const hit = m.collide(b);
      if (hit > 0 && ev) ev.mover = Math.max(ev.mover, hit);
    }

    // out of bounds: below the course or outside the field
    if (b.y < Math.min(0.02, f.minFloor - 0.05) || f.cell(b.x, b.z) < 0) return 'out';

    // the cup
    return this.cupTest(b, ev);
  }

  private cupTest(b: Ball, ev?: StepEvents): BallResult {
    const cup = this.cup;
    const R = cup.r * this.tune.cupScale;
    const dx = b.x - cup.x, dz = b.z - cup.z;
    const d = Math.hypot(dx, dz);
    if (d >= R || b.air || Math.abs(b.y - cup.y) > 0.03) {
      if (d >= R) this.overCup = false;
      return 'roll';
    }
    if (this.overCup) return 'roll';
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < 0.25) return 'sunk';
    // the time the ball spends over the hole along its line decides whether it drops in
    const ux = b.vx / sp, uz = b.vz / sp;
    const p = ux * -dz + uz * dx;            // signed distance of the line from the cup centre
    const along = -(ux * dx + uz * dz);      // distance to the closest point along the line
    const half = Math.sqrt(Math.max(0, R * R - p * p));
    const chord = Math.max(0, along + half);
    const tOver = chord / sp;
    const drop = 0.5 * G * tOver * tOver;
    if (drop > BALL_R * 0.55) return 'sunk';
    // lip out: the ball rides the rim, loses speed and is turned away from the centre
    this.overCup = true;
    if (ev) ev.lip = true;
    const turn = (p >= 0 ? 1 : -1) * (0.25 + 0.45 * (1 - Math.abs(p) / R));
    const cs = Math.cos(turn), sn = Math.sin(turn);
    const vx = b.vx * cs - b.vz * sn, vz = b.vx * sn + b.vz * cs;
    b.vx = vx * 0.8;
    b.vz = vz * 0.8;
    return 'roll';
  }
}

/** Runs a whole shot to rest (bot, aim preview). */
export function simulateShot(sim: Sim, start: Ball, t0: number, maxT = 14, dt = 1 / 120, onStep?: (b: Ball, t: number) => boolean | void): { ball: Ball; result: BallResult; t: number } {
  const b = { ...start };
  sim.reset();
  let t = t0;
  let result: BallResult = 'roll';
  while (t - t0 < maxT) {
    result = sim.step(b, t, dt);
    t += dt;
    if (onStep && onStep(b, t) === true) break;
    if (result !== 'roll') break;
  }
  if (result === 'roll' && t - t0 >= maxT) result = 'stop';
  return { ball: b, result, t };
}
