// Perspective camera and the arena drawing for the three-point contest. The camera stands
// behind the shooter and looks at the basket, so every rack shows the hoop from its own angle:
// the corners see the backboard almost edge-on, the top of the key sees it square.
import Phaser from 'phaser';
import {
  type V3, v3, add, sub, mul, dot, cross, norm, BOARD, BOARD_Z, BOARD_T, RIM_R, RIM_Y, BASELINE_Z, type Spot,
} from './sim';

export const SCREEN_W = 720;
export const SCREEN_H = 1280;
const NEAR = 0.12;

export interface Proj { x: number; y: number; z: number; s: number }

export class Cam {
  pos = v3(0, 2.6, 10);
  look = v3(0, 2.4, 0);
  f = 1250;
  cx = SCREEN_W / 2;
  cy = SCREEN_H * 0.5;
  private r = v3(1, 0, 0);
  private u = v3(0, 1, 0);
  private fw = v3(0, 0, -1);

  set(pos: V3, look: V3): void {
    this.pos = pos;
    this.look = look;
    this.fw = norm(sub(look, pos));
    this.r = norm(cross(this.fw, v3(0, 1, 0)));
    this.u = cross(this.r, this.fw);
  }

  /** World point -> camera space (x right, y up, z depth). */
  toCam(p: V3): V3 {
    const d = sub(p, this.pos);
    return v3(dot(d, this.r), dot(d, this.u), dot(d, this.fw));
  }

  /** Camera space -> screen; `s` is pixels per metre at that depth. */
  fromCam(c: V3): Proj {
    const z = Math.max(NEAR, c.z);
    return { x: this.cx + (this.f * c.x) / z, y: this.cy - (this.f * c.y) / z, z, s: this.f / z };
  }

  project(p: V3): Proj | null {
    const c = this.toCam(p);
    return c.z < NEAR ? null : this.fromCam(c);
  }

  depth(p: V3): number {
    return this.toCam(p).z;
  }

  get right(): V3 { return this.r; }
  get up(): V3 { return this.u; }
  get forward(): V3 { return this.fw; }

  /** Polygon clipped to the near plane, in screen space (empty when fully behind). */
  poly(pts: V3[]): Phaser.Math.Vector2[] {
    const cs = pts.map((p) => this.toCam(p));
    const out: V3[] = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length];
      const ain = a.z >= NEAR, bin = b.z >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.z) / (b.z - a.z);
        out.push(v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, NEAR));
      }
    }
    return out.map((c) => { const p = this.fromCam(c); return new Phaser.Math.Vector2(p.x, p.y); });
  }
}

/** Camera placement for a rack: behind the shooter, a little above head height. */
export function camFor(spot: Spot): { pos: V3; look: V3 } {
  const toHoop = norm(v3(-spot.x, 0, -spot.z));
  const pos = add(v3(spot.x, 2.45, spot.z), mul(toHoop, -2.6));
  const look = v3(0, 2.05, 0);
  return { pos, look };
}

/** Camera between two racks, swinging around the basket (t 0..1). */
export function camBetween(a: Spot, b: Spot, t: number): { pos: V3; look: V3 } {
  const A = camFor(a), B = camFor(b);
  const ra = Math.hypot(A.pos.x, A.pos.z), rb = Math.hypot(B.pos.x, B.pos.z);
  const aa = Math.atan2(A.pos.x, A.pos.z), ab = Math.atan2(B.pos.x, B.pos.z);
  const ang = aa + (ab - aa) * t, r = ra + (rb - ra) * t;
  const lift = Math.sin(Math.PI * t) * 0.6;
  return { pos: v3(Math.sin(ang) * r, A.pos.y + (B.pos.y - A.pos.y) * t + lift, Math.cos(ang) * r), look: A.look };
}

// ---------------------------------------------------------------- arena

interface Prim { pts: V3[]; color: number; alpha: number }
interface Dot { p: V3; r: number; color: number }

const WALL_X = 12.5, WALL_Z = -5.2, FAR_Z = 19;
const COURT_X = 7.5, HALF_Z = BASELINE_Z + 14;

/** Seeded pseudo random for the static crowd. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const floorQuad = (x0: number, z0: number, x1: number, z1: number, y = 0): V3[] =>
  [v3(x0, y, z0), v3(x1, y, z0), v3(x1, y, z1), v3(x0, y, z1)];

/** A painted line on the floor along a path of (x, z) points. */
function strip(path: [number, number][], w: number, y = 0.003): V3[][] {
  const quads: V3[][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i], [x1, z1] = path[i + 1];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
    quads.push([v3(x0 + nx, y, z0 + nz), v3(x1 + nx, y, z1 + nz), v3(x1 - nx, y, z1 - nz), v3(x0 - nx, y, z0 - nz)]);
  }
  return quads;
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 28): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]); }
  return out;
}

/** Arena geometry, built once. */
export class Arena {
  private stands: Prim[] = [];
  private crowd: Dot[] = [];
  private floor: Prim[] = [];
  private lines: V3[][] = [];
  private props: Prim[] = [];

  constructor() {
    const rnd = rand(7);
    // stands: rows rising back from the ad boards on three sides
    const rows = 9;
    const side = (pt: (u: number, row: number) => V3, from: number, to: number) => {
      for (let r = 0; r < rows; r++) {
        const a = pt(from, r), b = pt(to, r), c = pt(to, r + 1), d = pt(from, r + 1);
        this.stands.push({ pts: [a, b, c, d], color: r % 2 ? 0x2a2140 : 0x30264a, alpha: 1 });
        const seats = Math.floor(Math.abs(to - from) / 0.55);
        for (let i = 0; i < seats; i++) {
          if (rnd() < 0.12) continue;
          const u = from + (to - from) * ((i + 0.5 + (rnd() - 0.5) * 0.4) / seats);
          const p = pt(u, r + 0.55);
          this.crowd.push({ p: v3(p.x, p.y + 0.16, p.z), r: 0.13, color: [0xb0322a, 0xc9c3d6, 0x2d5cb8, 0xc9a23a, 0x5e4aa8, 0x3a2f55, 0x45365e, 0x52466e, 0x3a2f55][Math.floor(rnd() * 9)] });
        }
      }
    };
    const rise = 0.62, step = 0.85, base = 1.1;
    side((u, r) => v3(u, base + r * rise, WALL_Z - 0.4 - r * step), -WALL_X, WALL_X);
    side((u, r) => v3(-WALL_X - 0.4 - r * step, base + r * rise, u), WALL_Z, FAR_Z);
    side((u, r) => v3(WALL_X + 0.4 + r * step, base + r * rise, u), WALL_Z, FAR_Z);
    // ad boards along the walls
    const ads = [0xec3013, 0x3ee6ff, 0xffd23f, 0x5dff7a, 0xff4fa3];
    const board = (a: V3, b: V3, i: number) => this.stands.push({ pts: [a, b, add(b, v3(0, base, 0)), add(a, v3(0, base, 0))], color: i % 2 ? 0x141022 : ads[(i / 2) % ads.length | 0], alpha: 1 });
    for (let i = 0, x = -WALL_X; x < WALL_X - 0.01; x += 3, i++) board(v3(x, 0, WALL_Z), v3(Math.min(WALL_X, x + 3), 0, WALL_Z), i);
    for (let i = 0, z = WALL_Z; z < FAR_Z - 0.01; z += 3, i++) {
      board(v3(-WALL_X, 0, z), v3(-WALL_X, 0, Math.min(FAR_Z, z + 3)), i);
      board(v3(WALL_X, 0, z), v3(WALL_X, 0, Math.min(FAR_Z, z + 3)), i + 1);
    }

    // floor: apron, court, paint
    this.floor.push({ pts: floorQuad(-WALL_X, WALL_Z, WALL_X, FAR_Z), color: 0x5a3a2a, alpha: 1 });
    this.floor.push({ pts: floorQuad(-COURT_X, BASELINE_Z, COURT_X, HALF_Z + 6), color: 0xd29a5a, alpha: 1 });
    // planks: alternating tone strips running toward half court
    for (let x = -COURT_X, i = 0; x < COURT_X - 0.01; x += 0.75, i++) {
      if (i % 2) this.floor.push({ pts: floorQuad(x, BASELINE_Z, x + 0.75, HALF_Z + 6, 0.001), color: 0xc68d4f, alpha: 1 });
    }
    this.floor.push({ pts: floorQuad(-2.45, BASELINE_Z, 2.45, BASELINE_Z + 5.8, 0.002), color: 0xb0322a, alpha: 1 });
    // three-point zone tint: the arc area is a slightly lighter wood
    const zone: V3[] = [v3(-6.6, 0.0015, BASELINE_Z)];
    const cornerZ = Math.sqrt(6.75 ** 2 - 6.6 ** 2);
    for (const [x, z] of arc(0, 0, 6.75, -Math.asin(6.6 / 6.75), Math.asin(6.6 / 6.75), 36)) zone.push(v3(x, 0.0015, z));
    zone.push(v3(6.6, 0.0015, BASELINE_Z));
    zone[1] = v3(-6.6, 0.0015, cornerZ);
    this.floor.push({ pts: zone, color: 0xdfae72, alpha: 0.5 });
    this.floor.push({ pts: floorQuad(-2.45, BASELINE_Z, 2.45, BASELINE_Z + 5.8, 0.0025), color: 0xb0322a, alpha: 1 });

    // lines
    const W = 0.07;
    const add_ = (path: [number, number][], w = W) => this.lines.push(...strip(path, w));
    add_([[-COURT_X, BASELINE_Z], [COURT_X, BASELINE_Z]]);
    add_([[-COURT_X, BASELINE_Z], [-COURT_X, HALF_Z + 6]]);
    add_([[COURT_X, BASELINE_Z], [COURT_X, HALF_Z + 6]]);
    add_([[-COURT_X, HALF_Z], [COURT_X, HALF_Z]]);
    add_(arc(0, HALF_Z, 1.8, Math.PI / 2, Math.PI * 1.5, 24));
    add_([[-6.6, BASELINE_Z], [-6.6, cornerZ]]);
    add_([[6.6, BASELINE_Z], [6.6, cornerZ]]);
    add_(arc(0, 0, 6.75, -Math.asin(6.6 / 6.75), Math.asin(6.6 / 6.75), 48));
    add_([[-2.45, BASELINE_Z], [-2.45, BASELINE_Z + 5.8], [2.45, BASELINE_Z + 5.8], [2.45, BASELINE_Z]]);
    add_(arc(0, BASELINE_Z + 5.8, 1.8, -Math.PI / 2, Math.PI / 2, 24));
    add_(arc(0, 0, 1.25, -Math.PI / 2, Math.PI / 2, 20), 0.05);

    // basket support: padded base behind the baseline, post and arm
    const bz = -2.9;
    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, top: number, front: number, sideC: number) => {
      this.props.push({ pts: [v3(x0, y1, z0), v3(x1, y1, z0), v3(x1, y1, z1), v3(x0, y1, z1)], color: top, alpha: 1 });
      this.props.push({ pts: [v3(x0, y0, z1), v3(x1, y0, z1), v3(x1, y1, z1), v3(x0, y1, z1)], color: front, alpha: 1 });
      this.props.push({ pts: [v3(x0, y0, z0), v3(x0, y0, z1), v3(x0, y1, z1), v3(x0, y1, z0)], color: sideC, alpha: 1 });
      this.props.push({ pts: [v3(x1, y0, z0), v3(x1, y0, z1), v3(x1, y1, z1), v3(x1, y1, z0)], color: sideC, alpha: 1 });
    };
    box(-0.8, 0.8, 0, 1.0, bz - 1.2, bz + 0.25, 0x2d6cdf, 0x1f4fae, 0x173e8a);
    box(-0.12, 0.12, 1.0, 3.55, bz - 0.35, bz - 0.11, 0x8a8f9e, 0x6c7180, 0x555a68);
    box(-0.05, 0.05, 3.4, 3.48, bz - 0.35, BOARD_Z - BOARD_T, 0x8a8f9e, 0x6c7180, 0x555a68);
  }

  draw(g: Phaser.GameObjects.Graphics, cam: Cam): void {
    g.clear();
    // arena dark above, lit glow behind the basket
    g.fillGradientStyle(0x0b0818, 0x0b0818, 0x221a36, 0x221a36).fillRect(0, 0, SCREEN_W, SCREEN_H);
    const sorted = this.stands.map((p) => ({ p, d: cam.depth(centroid(p.pts)) })).sort((a, b) => b.d - a.d);
    for (const { p } of sorted) fillPoly(g, cam.poly(p.pts), p.color, p.alpha);
    for (const c of this.crowd) {
      const pr = cam.project(c.p);
      if (!pr || pr.y < -20 || pr.y > SCREEN_H + 20 || pr.x < -20 || pr.x > SCREEN_W + 20) continue;
      const r = c.r * pr.s;
      if (r < 0.6) continue;
      g.fillStyle(c.color, 0.8).fillRect(pr.x - r * 1.1, pr.y + r * 0.6, r * 2.2, r * 2.2);
      g.fillStyle(0xe0b48a, 0.85).fillCircle(pr.x, pr.y, r * 0.8);
    }
    for (const p of this.floor) fillPoly(g, cam.poly(p.pts), p.color, p.alpha);
    for (const q of this.lines) fillPoly(g, cam.poly(q), 0xf6f0e6, 0.92);
    const props = this.props.map((p) => ({ p, d: cam.depth(centroid(p.pts)) })).sort((a, b) => b.d - a.d);
    for (const { p } of props) fillPoly(g, cam.poly(p.pts), p.color, p.alpha);
    // soft light pool under the basket
    const c = cam.project(v3(0, 0, 0.5));
    if (c) g.fillStyle(0xfff3c8, 0.06).fillEllipse(c.x, c.y, 7 * c.s, 2.2 * c.s);
  }
}

function centroid(pts: V3[]): V3 {
  let s = v3();
  for (const p of pts) s = add(s, p);
  return mul(s, 1 / pts.length);
}

export function fillPoly(g: Phaser.GameObjects.Graphics, pts: Phaser.Math.Vector2[], color: number, alpha = 1): void {
  if (pts.length < 3) return;
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

// ---------------------------------------------------------------- hoop

export interface NetState { stretch: number; sway: number; swayZ: number; bulge: { p: V3 } | null; t: number }

const NET_RINGS = 5, NET_NODES = 14;

/** Net node (ring k, node i) in world space. */
function netNode(k: number, i: number, ns: NetState): V3 {
  const f = k / (NET_RINGS - 1);
  const drop = 0.11 * (1 + ns.stretch * 0.55);
  const y = RIM_Y - k * drop;
  let r = RIM_R + (0.135 - RIM_R) * Math.pow(f, 0.85);
  const a = ((i + (k % 2) * 0.5) / NET_NODES) * Math.PI * 2 + Math.sin(ns.t * 9 + k) * ns.stretch * 0.12;
  let x = Math.sin(a) * r, z = Math.cos(a) * r;
  // a ball inside the net pushes it out
  if (ns.bulge && k > 0) {
    const b = ns.bulge.p;
    const dy = Math.abs(b.y - y);
    if (dy < 0.2) {
      const q = Math.hypot(b.x - 0, b.z - 0);
      const need = 0.125 * (1 - dy / 0.2) + q * 0.6;
      if (need > r) { r = need; x = Math.sin(a) * r; z = Math.cos(a) * r; }
    }
  }
  x += ns.sway * f * f; z += ns.swayZ * f * f;
  return v3(x, y, z);
}

/** Draws the backboard, ring and net into back/front layers (split by depth around the ring). */
export function drawHoop(
  gBoard: Phaser.GameObjects.Graphics, gBack: Phaser.GameObjects.Graphics, gFront: Phaser.GameObjects.Graphics,
  cam: Cam, ns: NetState, rimGlow: number,
): void {
  gBoard.clear(); gBack.clear(); gFront.clear();
  // backboard: glass, white frame, shooter's square, padding along the bottom
  const z = BOARD_Z;
  const q = (x0: number, y0: number, x1: number, y1: number, zz = z) => [v3(x0, y0, zz), v3(x1, y0, zz), v3(x1, y1, zz), v3(x0, y1, zz)];
  const { x0, x1, y0, y1 } = BOARD;
  // edge (thickness) seen from the side
  fillPoly(gBoard, cam.poly([v3(x0, y0, z), v3(x0, y1, z), v3(x0, y1, z - BOARD_T), v3(x0, y0, z - BOARD_T)]), 0xb8c4d6, 1);
  fillPoly(gBoard, cam.poly([v3(x1, y0, z), v3(x1, y1, z), v3(x1, y1, z - BOARD_T), v3(x1, y0, z - BOARD_T)]), 0xb8c4d6, 1);
  fillPoly(gBoard, cam.poly([v3(x0, y1, z), v3(x1, y1, z), v3(x1, y1, z - BOARD_T), v3(x0, y1, z - BOARD_T)]), 0xdfe6f0, 1);
  fillPoly(gBoard, cam.poly(q(x0, y0, x1, y1)), 0xcfe6ff, 0.28);
  const fr = 0.05;
  for (const r of [q(x0, y1 - fr, x1, y1), q(x0, y0, x1, y0 + fr), q(x0, y0, x0 + fr, y1), q(x1 - fr, y0, x1, y1)]) fillPoly(gBoard, cam.poly(r), 0xffffff, 0.95);
  const sx = 0.295, sy0 = RIM_Y + 0.0, sy1 = RIM_Y + 0.45, sw = 0.05;
  for (const r of [q(-sx, sy1 - sw, sx, sy1), q(-sx, sy0, sx, sy0 + sw), q(-sx, sy0, -sx + sw, sy1), q(sx - sw, sy0, sx, sy1)]) fillPoly(gBoard, cam.poly(r), 0xec3013, 0.95);
  fillPoly(gBoard, cam.poly(q(x0, y0 - 0.06, x1, y0 + 0.01, z + 0.012)), 0x1f4fae, 1);
  // glass glint
  fillPoly(gBoard, cam.poly([v3(x0 + 0.15, y1 - 0.1, z + 0.002), v3(x0 + 0.45, y1 - 0.1, z + 0.002), v3(x0 + 0.2, y0 + 0.15, z + 0.002), v3(x0 - 0.1 + 0.15, y0 + 0.15, z + 0.002)]), 0xffffff, 0.12);
  // bracket from the board to the ring
  fillPoly(gBoard, cam.poly([v3(-0.07, RIM_Y - 0.01, z), v3(0.07, RIM_Y - 0.01, z), v3(0.07, RIM_Y - 0.01, -RIM_R), v3(-0.07, RIM_Y - 0.01, -RIM_R)]), 0xb0480f, 1);

  // net: back strands behind the ring centre, front strands in front
  const rc = cam.depth(v3(0, RIM_Y, 0));
  const strand = (a: V3, b: V3) => {
    const pa = cam.project(a), pb = cam.project(b);
    if (!pa || !pb) return;
    const mid = (cam.depth(a) + cam.depth(b)) / 2;
    const g = mid > rc ? gBack : gFront;
    g.lineStyle(Math.max(1.5, 0.014 * pa.s), 0xffffff, mid > rc ? 0.55 : 0.9).lineBetween(pa.x, pa.y, pb.x, pb.y);
  };
  for (let k = 0; k < NET_RINGS - 1; k++) {
    for (let i = 0; i < NET_NODES; i++) {
      const a = netNode(k, i, ns);
      const off = k % 2 ? 1 : 0;
      strand(a, netNode(k + 1, (i + off) % NET_NODES, ns));
      strand(a, netNode(k + 1, (i + off - 1 + NET_NODES) % NET_NODES, ns));
    }
  }
  // ring: 36 tube segments, coloured by depth (back half darker)
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = v3(Math.sin(a0) * RIM_R, RIM_Y, Math.cos(a0) * RIM_R), p1 = v3(Math.sin(a1) * RIM_R, RIM_Y, Math.cos(a1) * RIM_R);
    const s0 = cam.project(p0), s1 = cam.project(p1);
    if (!s0 || !s1) continue;
    const back = (cam.depth(p0) + cam.depth(p1)) / 2 > rc;
    const g = back ? gBack : gFront;
    const w = Math.max(3, 0.03 * s0.s);
    const col = rimGlow > 0 ? Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(back ? 0xb34a0c : 0xff6a10), Phaser.Display.Color.ValueToColor(0xffe27a), 100, rimGlow * 100) : null;
    const c = col ? Phaser.Display.Color.GetColor(col.r, col.g, col.b) : back ? 0xb34a0c : 0xff6a10;
    g.lineStyle(w, c, 1).lineBetween(s0.x, s0.y, s1.x, s1.y);
    g.fillStyle(c, 1).fillCircle(s1.x, s1.y, w / 2);
  }
}

// ---------------------------------------------------------------- ball

export interface BallLook { phase: number; roll: number; money: boolean }

/** A basketball with seams that turn with its backspin (phase) and roll (in-plane angle). */
export function drawBall(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, look: BallLook, alpha = 1): void {
  const base = look.money ? 0xf2c230 : 0xe0702a;
  const dark = look.money ? 0xa9761a : 0x8a3c12;
  const seam = look.money ? 0x9b2020 : 0x2a1408;
  g.fillStyle(dark, alpha).fillCircle(x, y, r);
  g.fillStyle(base, alpha).fillCircle(x - r * 0.06, y - r * 0.06, r * 0.93);
  g.fillStyle(0xffffff, 0.22 * alpha).fillCircle(x - r * 0.32, y - r * 0.36, r * 0.42);
  if (r < 3) return;
  const lw = Math.max(1, r * 0.09);
  g.lineStyle(lw, seam, 0.9 * alpha);
  const cr = Math.cos(look.roll), sr = Math.sin(look.roll);
  const rot = (px: number, py: number) => new Phaser.Math.Vector2(x + px * cr - py * sr, y + px * sr + py * cr);
  // the seam through the spin axis never moves; two rings around the axis turn with the spin
  g.strokePoints([rot(0, -r * 0.92), rot(0, r * 0.92)], false);
  for (const ph of [look.phase, look.phase + Math.PI / 2]) {
    const pts: Phaser.Math.Vector2[] = [];
    const c = Math.cos(ph), s = Math.sin(ph);
    for (let i = 0; i <= 18; i++) {
      const t = (i / 18) * Math.PI;
      // great circle through the x axis tilted by ph; keep the half that faces the camera
      const px = Math.cos(t) * r * 0.92, py = Math.sin(t) * c * r * 0.92 * (s >= 0 ? 1 : -1);
      pts.push(rot(px, py));
    }
    g.strokePoints(pts, false);
  }
}

/** The floor shadow of a ball at world position p. */
export function drawShadow(g: Phaser.GameObjects.Graphics, cam: Cam, p: V3, rBall: number): void {
  const h = Math.max(0, p.y - rBall);
  const k = 1 + h * 0.12;
  const a = 0.42 * Math.max(0.12, 1 - h / 5);
  const pts: V3[] = [];
  for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2; pts.push(v3(p.x + Math.sin(t) * rBall * k, 0.004, p.z + Math.cos(t) * rBall * k)); }
  fillPoly(g, cam.poly(pts), 0x000000, a);
}

export { RIM_Y as HOOP_Y };
