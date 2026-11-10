// Things that move on their own: windmill sails, sliding blocks and sweeping bars. Pure maths
// (the bot uses them too); the game reads their pose to place the meshes.
import { BALL_R, type Ball, type Mover } from './physics';
import { FLOOR_Y, LEVEL, rotXZ, type MoverDef, type ParsedHole } from './kit';

/** Bounce off a moving surface point with normal n and velocity (ux, uz). */
function bounce(b: Ball, nx: number, nz: number, depth: number, ux: number, uz: number, e: number): number {
  b.x += nx * depth;
  b.z += nz * depth;
  const rvx = b.vx - ux, rvz = b.vz - uz;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return 0;
  b.vx = rvx - (1 + e) * vn * nx + ux;
  b.vz = rvz - (1 + e) * vn * nz + uz;
  return -vn;
}

/**
 * The four sails of a kit windmill, scaled so their tips sweep the felt in front of the arch.
 * Sails are 0.2-wide bands at 45° + i·90° from straight down (rest pose), from radius 0.1 to 0.78
 * (model units).
 */
export class Windmill implements Mover {
  static readonly SCALE = 1.12;
  angle = 0;
  /** Hub position (world). */
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  /** Facing (out of the front) and the in-plane horizontal axis. */
  readonly nx: number;
  readonly nz: number;
  readonly ex: number;
  readonly ez: number;
  private yb: number;

  constructor(col: number, row: number, rot: number, level: number, readonly speed: number, readonly phase = 0) {
    const [ox, oz] = rotXZ(0, 0.4, rot);
    this.hx = col + ox;
    this.hz = row + oz;
    this.hy = level * LEVEL + 0.957;
    [this.nx, this.nz] = rotXZ(0, 1, rot);
    [this.ex, this.ez] = rotXZ(1, 0, rot);
    this.yb = level * LEVEL + FLOOR_Y;
  }

  update(t: number): void {
    this.angle = this.phase + this.speed * t;
  }

  collide(b: Ball): number {
    const S = Windmill.SCALE;
    const cx = b.x - this.hx, cz = b.z - this.hz, cy = b.y + BALL_R - this.hy;
    const dn = cx * this.nx + cz * this.nz;
    const half = 0.0335;
    if (Math.abs(dn - half) > half + BALL_R) return 0;
    if (b.y > this.yb + 0.4) return 0;
    const u = cx * this.ex + cz * this.ez, v = cy;
    const rho = Math.hypot(u, v);
    if (rho < 0.1 * S || rho > 0.8 * S + BALL_R) return 0;
    const phi = Math.atan2(u, -v);
    const halfW = 0.105 * S + BALL_R;
    let hit = false;
    for (let i = 0; i < 4; i++) {
      const a = this.angle + Math.PI / 4 + (i * Math.PI) / 2;
      // perpendicular distance of the ball from the sail's centre line
      const d = rho * Math.sin(phi - a);
      const along = rho * Math.cos(phi - a);
      if (along > 0 && Math.abs(d) < halfW) { hit = true; break; }
    }
    if (!hit) return 0;
    // push out through the nearer face of the sail disc
    const front = dn > half;
    const target = front ? half * 2 + BALL_R : -BALL_R;
    const depth = Math.abs(target - dn);
    const s = front ? 1 : -1;
    return bounce(b, this.nx * s, this.nz * s, depth, 0, 0, 0.45);
  }
}

/** A block sliding to and fro along x or z. */
export class Slider implements Mover {
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  readonly hw: number;
  readonly hd: number;
  readonly y0: number;

  constructor(readonly d: Extract<MoverDef, { kind: 'slider' }>, level: number) {
    this.hw = (d.w ?? 0.26) / 2;
    this.hd = (d.d ?? 0.14) / 2;
    this.y0 = level * LEVEL + FLOOR_Y;
    this.update(0);
  }

  update(t: number): void {
    const d = this.d;
    const a = d.speed * t + (d.phase ?? 0);
    const off = Math.sin(a) * d.amp, vel = Math.cos(a) * d.amp * d.speed;
    this.x = d.col + (d.axis === 'x' ? off : 0);
    this.z = d.row + (d.axis === 'z' ? off : 0);
    this.vx = d.axis === 'x' ? vel : 0;
    this.vz = d.axis === 'z' ? vel : 0;
  }

  collide(b: Ball): number {
    if (b.y > this.y0 + 0.12 || b.y < this.y0 - 0.05) return 0;
    const px = Math.max(this.x - this.hw, Math.min(b.x, this.x + this.hw));
    const pz = Math.max(this.z - this.hd, Math.min(b.z, this.z + this.hd));
    let dx = b.x - px, dz = b.z - pz;
    let dist = Math.hypot(dx, dz);
    if (dist >= BALL_R) return 0;
    if (dist < 1e-6) {
      // centre inside the block: leave by the nearest side
      const ox = this.hw - Math.abs(b.x - this.x), oz = this.hd - Math.abs(b.z - this.z);
      if (ox < oz) { dx = Math.sign(b.x - this.x) || 1; dz = 0; dist = -ox; } else { dx = 0; dz = Math.sign(b.z - this.z) || 1; dist = -oz; }
      return bounce(b, dx, dz, BALL_R - dist, this.vx, this.vz, 0.55);
    }
    return bounce(b, dx / dist, dz / dist, BALL_R - dist, this.vx, this.vz, 0.55);
  }
}

/** A bar turning round a post in the middle of a tile. */
export class Sweeper implements Mover {
  angle = 0;
  readonly y0: number;
  static readonly HALF_T = 0.03;

  constructor(readonly d: Extract<MoverDef, { kind: 'sweeper' }>, level: number) {
    this.y0 = level * LEVEL + FLOOR_Y;
  }

  update(t: number): void {
    this.angle = (this.d.phase ?? 0) + this.d.speed * t;
  }

  collide(b: Ball): number {
    if (b.y > this.y0 + 0.12 || b.y < this.y0 - 0.05) return 0;
    const L = this.d.len / 2;
    const ux = Math.cos(this.angle), uz = Math.sin(this.angle);
    const rx = b.x - this.d.col, rz = b.z - this.d.row;
    const s = Math.max(-L, Math.min(L, rx * ux + rz * uz));
    const px = ux * s, pz = uz * s;
    const dx = rx - px, dz = rz - pz;
    const dist = Math.hypot(dx, dz);
    const R = BALL_R + Sweeper.HALF_T;
    if (dist >= R || dist < 1e-6) return 0;
    // velocity of the bar at the contact point: ω × r
    const w = this.d.speed;
    return bounce(b, dx / dist, dz / dist, R - dist, -w * pz, w * px, 0.6);
  }
}

/** The movers of a hole: its windmills plus the listed sliders and sweepers. */
export function makeMovers(p: ParsedHole, defs: MoverDef[] = [], windmillSpeed = 1.5): Mover[] {
  const out: Mover[] = [];
  const levelAt = (col: number, row: number) => p.tiles.find((t) => t.col === Math.round(col) && t.row === Math.round(row))?.level ?? 0;
  for (const t of p.tiles) if (t.model === 'windmill') out.push(new Windmill(t.col, t.row, t.rot, t.level, windmillSpeed));
  for (const d of defs) {
    if (d.kind === 'slider') out.push(new Slider(d, levelAt(d.col, d.row)));
    else out.push(new Sweeper(d, levelAt(d.col, d.row)));
  }
  return out;
}
