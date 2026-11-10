// A putting bot: it proves every hole can be played at par (scratchpad runner in Node) and plays
// the menu's fly-over demo. Pure TypeScript on top of physics.ts.
import { Field, hasFloor, simulateShot, type Ball, type Cup, type Sim, BALL_R } from './physics';

/** Ball speed for a putt power 0..1 (gentle at the bottom for touch control). */
export const MAX_SPEED = 6.2;
export const MIN_SPEED = 0.35;
export const shotSpeed = (power: number): number => MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.pow(Math.max(0, Math.min(1, power)), 1.35);
/** Aim angle 0 points north (-z); angles grow clockwise seen from above. */
export const aimDir = (a: number): [number, number] => [Math.sin(a), -Math.cos(a)];

export function shotBall(from: { x: number; y: number; z: number }, angle: number, power: number): Ball {
  const [dx, dz] = aimDir(angle);
  const v = shotSpeed(power);
  return { x: from.x, y: from.y, z: from.z, vx: dx * v, vy: 0, vz: dz * v, air: false };
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number { return this.k.length; }
  push(key: number, val: number): void {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Walking distance to the cup over the felt (gaps cost extra), on a coarse grid. */
export class DistanceMap {
  readonly res = 0.04;
  readonly nx: number;
  readonly nz: number;
  readonly d: Float64Array;

  constructor(readonly field: Field, cup: Cup) {
    const f = field, res = this.res;
    this.nx = Math.floor(((f.nx - 1) * f.res) / res) + 1;
    this.nz = Math.floor(((f.nz - 1) * f.res) / res) + 1;
    const n = this.nx * this.nz;
    const h = new Float32Array(n);
    const kind = new Uint8Array(n);   // 0 wall, 1 felt, 2 gap
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = f.x0 + i * res, z = f.z0 + j * res, c = j * this.nx + i;
        const y = f.floorAt(x, z);
        if (hasFloor(y)) {
          h[c] = y;
          kind[c] = f.contact(x, z, y) ? 0 : 1;
        } else {
          h[c] = 0;
          kind[c] = f.contact(x, z, f.minFloor) ? 0 : 2;
        }
      }
    }
    this.d = new Float64Array(n).fill(1e9);
    const heap = new Heap();
    const ci = Math.round((cup.x - f.x0) / res), cj = Math.round((cup.z - f.z0) / res);
    const start = cj * this.nx + ci;
    this.d[start] = 0;
    heap.push(0, start);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.size) {
      const [dc, c] = heap.pop();
      if (dc > this.d[c]) continue;
      const i = c % this.nx, j = (c / this.nx) | 0;
      for (const [di, dj, w] of nb) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        const cc = jj * this.nx + ii;
        if (kind[cc] === 0) continue;
        if (kind[cc] === 1 && kind[c] === 1 && Math.abs(h[cc] - h[c]) > 0.035) continue;
        const cost = w * res * (kind[cc] === 2 || kind[c] === 2 ? 5 : 1);
        if (dc + cost < this.d[cc]) {
          this.d[cc] = dc + cost;
          heap.push(dc + cost, cc);
        }
      }
    }
  }

  at(x: number, z: number): number {
    const i = Math.round((x - this.field.x0) / this.res), j = Math.round((z - this.field.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 1e9;
    let best = this.d[j * this.nx + i];
    // a ball resting against a wall may sit in a wall cell of the coarse grid
    if (best >= 1e9) {
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        best = Math.min(best, this.d[jj * this.nx + ii] + Math.hypot(di, dj) * this.res);
      }
    }
    return best;
  }
}

/** Expected strokes still needed from a resting spot this far (walking) from the cup. */
export function strokesFrom(d: number): number {
  if (d < 0.25) return 1.02;
  if (d < 1) return 1.2 + d * 0.2;
  return 1.4 + d * 0.3;
}

export interface Plan {
  angle: number;
  power: number;
  wait: number;
  value: number;
  result: string;
  end: Ball;
}

export interface PlanOptions {
  angleStep?: number;
  powers?: number[];
  waits?: number[];
  /** Cheap pass first, then refine around the best candidates. */
  refine?: boolean;
}

/** Picks the putt that leaves the fewest expected strokes. */
export function planShot(sim: Sim, dist: DistanceMap, ball: Ball, t: number, o: PlanOptions = {}): Plan {
  const step = o.angleStep ?? (2.5 * Math.PI) / 180;
  const powers = o.powers ?? Array.from({ length: 20 }, (_, i) => 0.05 + i * 0.05);
  const waits = o.waits ?? [0];
  const startD = dist.at(ball.x, ball.z);
  const evalShot = (angle: number, power: number, wait: number): Plan => {
    const r = simulateShot(sim, shotBall(ball, angle, power), t + wait);
    let value: number;
    if (r.result === 'sunk') value = 0;
    else if (r.result === 'out') value = 1 + strokesFrom(startD) + 0.5;
    else value = strokesFrom(dist.at(r.ball.x, r.ball.z));
    // prefer softer, earlier putts on ties
    value += power * 0.002 + wait * 0.001;
    return { angle, power, wait, value, result: r.result, end: r.ball };
  };
  const cands: Plan[] = [];
  for (const wait of waits) {
    for (let a = 0; a < Math.PI * 2 - 1e-9; a += step) {
      for (const p of powers) cands.push(evalShot(a, p, wait));
    }
  }
  cands.sort((a, b) => a.value - b.value);
  let best = cands[0];
  if (o.refine !== false) {
    // look around the best few for a sinking putt (more robust: neighbours that sink too)
    for (const c of cands.slice(0, 6)) {
      for (const da of [-step / 3, step / 3, -step / 6, step / 6]) {
        for (const dp of [-0.02, 0, 0.02]) {
          const p = evalShot(c.angle + da, Math.max(0.02, Math.min(1, c.power + dp)), c.wait);
          if (p.value < best.value) best = p;
        }
      }
    }
  }
  return best;
}

export { BALL_R };
