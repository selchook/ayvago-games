// Trap Trail: the course writer. A stage is written as a run of segments (levels.ts): each one adds
// islands, hazards, pickups and scenery in front of a cursor and moves the cursor on. The cursor
// is the path's centre x, the ground's top y and the z where the next piece begins (the course
// runs towards -z). Every segment also leaves waypoints for the autopilot (tests, store art).
import { topBox, box, type Course, type Solid, type Surf, type Pickup, type Box, type FoeKind } from './course';
import type { GemKind, PowerId, WorldId } from './defs';

/** Model sizes the colliders follow (model units × the scale the game draws them at). */
export const S = {
  saw: 0.5, trap: 0.7, spikes: 0.42, pillar: 0.55, roller: 0.62, cannon: 0.6, ball: 0.55, bomb: 0.58, spiky: 0.82,
  bouncer: 0.62, chest: 0.6, door: 0.7, lever: 0.7, flag: 1.55, number: 1.3, checkNumber: 0.75, tower: 0.62,
  bridge: 0.82, plank: 0.9, pipe: 0.8, fence: 0.75, stairs: 1.25,
};

/** Small deterministic random numbers for the scenery. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Builder {
  readonly c: Course;
  x = 0;
  y = 0;
  z = 0;
  readonly rnd: () => number;
  private cps = 0;
  /** The last isle laid on the path (enemies live on it). */
  last: Solid | null = null;
  private doors = 0;

  constructor(world: WorldId, n: number, inWorld: number) {
    this.rnd = mulberry(n * 7919 + 13);
    this.c = {
      world, n, inWorld, start: { x: 0, y: 0, z: 3 }, goal: { x: 0, y: 0, z: 0 }, par: 60,
      solids: [], movers: [], crumbles: [], bouncers: [], saws: [], traps: [], spikes: [], pillars: [], rollers: [], cannons: [], balls: [],
      bombs: [], droppers: [], pendulums: [], orbiters: [], checkpoints: [], levers: [], doors: [], chests: [], pickups: [], foes: [], bonuses: [], decor: [], waypoints: [],
      floor: 0, tower: false,
    };
  }

  get surf(): Surf { return this.c.world === 'frost' ? 'ground' : 'ground'; }

  // ---------------------------------------------------------------- primitives

  solid(b: Box, surf: Surf = 'ground', island = false): Solid {
    const s: Solid = { b, surf, island, dx: 0, dy: 0, dz: 0 };
    this.c.solids.push(s);
    if (island) this.c.floor = Math.min(this.c.floor, b.y0);
    return s;
  }

  /** A floating island: centre x, from z `near` back `len` metres, `w` wide, its top at `top`. */
  island(x: number, near: number, len: number, w: number, top = this.y, o: { surf?: Surf; depth?: number; decor?: boolean } = {}): Solid {
    const depth = o.depth ?? 3.2 + this.rnd() * 2.2;
    const s = this.solid(topBox(x, near - len / 2, w, len, top, depth), o.surf ?? 'ground', true);
    if (o.decor !== false) this.dress(s.b);
    if (Math.abs(x - this.x) < 0.5) this.last = s;
    return s;
  }

  wp(x: number, y: number, z: number, o: { jump?: boolean; dash?: boolean; hold?: number } = {}): void { this.c.waypoints.push({ x, y, z, ...o }); }

  pick(kind: Pickup['kind'], x: number, y: number, z: number, o: { gem?: GemKind; star?: number; power?: PowerId } = {}): void {
    this.c.pickups.push({ kind, x, y, z, taken: false, pull: false, bob: this.rnd() * 6, ...o });
  }

  coins(x0: number, z0: number, x1: number, z1: number, n: number, y = this.y + 0.85, arc = 0): void {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      this.pick('coin', x0 + (x1 - x0) * k, y + Math.sin(k * Math.PI) * arc, z0 + (z1 - z0) * k);
    }
  }

  star(i: number, x: number, y: number, z: number): void { this.pick('star', x, y + 1, z, { star: i }); }
  gem(g: GemKind, x: number, y: number, z: number): void { this.pick('gem', x, y + 0.9, z, { gem: g }); }
  power(p: PowerId, x: number, y: number, z: number): void { this.pick('power', x, y + 1, z, { power: p }); }
  heart(x: number, y: number, z: number, half = false): void { this.pick(half ? 'half' : 'heart', x, y + 0.9, z); }
  key(x: number, y: number, z: number): void { this.pick('key', x, y + 0.9, z); }

  decor(key: string, x: number, y: number, z: number, rot = 0, s = 1, tint?: number): void { this.c.decor.push({ key, x, y, z, rot, s, tint }); }

  /** Plants, rocks and trees on an island's free edges (never on the path). */
  private dress(b: Box): void {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, look = this.c.world;
    const tries = Math.floor((w * d) / 9);
    for (let i = 0; i < tries; i++) {
      const side = this.rnd() < 0.5 ? -1 : 1;
      const x = side < 0 ? b.x0 + 0.5 + this.rnd() * 0.7 : b.x1 - 0.5 - this.rnd() * 0.7;
      const z = b.z0 + 0.6 + this.rnd() * (d - 1.2);
      if (Math.abs(x - this.x) < 1.9) continue;
      const r = this.rnd();
      // the pack's nature: grass tufts (their files sit one unit up), bushes, rocks, a tree on wide isles, the level pack's plants
      if (r < 0.34) { const sc = 0.9 + this.rnd() * 0.5; this.decor('qp:grass-' + (1 + Math.floor(this.rnd() * 3)), x, b.y1 - 0.93 * sc, z, this.rnd() * 6, sc); }
      else if (r < 0.52) this.decor('qp:plant-small', x, b.y1, z, this.rnd() * 6, 0.5 + this.rnd() * 0.25);
      else if (r < 0.7) this.decor('qp:bush', x, b.y1, z, this.rnd() * 6, 0.32 + this.rnd() * 0.12);
      else if (r < 0.86 || w <= 5) this.decor('qp:rock-' + (1 + Math.floor(this.rnd() * 2)), x, b.y1, z, this.rnd() * 6, 0.45 + this.rnd() * 0.25);
      else this.decor('qp:tree', x, b.y1, z, this.rnd() * 6, 0.36 + this.rnd() * 0.1);
      void look;
    }
  }

  /** A row of fence pieces along an edge (x fixed, from z0 to z1), solid. */
  fence(x: number, z0: number, z1: number, y = this.y): void {
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / (2 * S.fence)));
    const step = (z1 - z0) / n;
    for (let i = 0; i < n; i++) this.decor('qp:fence-middle', x, y, z0 + step * (i + 0.5), Math.PI / 2, S.fence * Math.abs(step) / (2 * S.fence));
    this.solid(box(x - 0.12, y, Math.min(z0, z1), x + 0.12, y + 0.95, Math.max(z0, z1)), 'wood');
  }

  sign(x: number, z: number, kind: 'side' | 'up' | 'left' = 'side', y = this.y): void {
    // the side arrow points +x in model space: turned to point -z (forward), or -x (left)
    const rot = kind === 'side' ? Math.PI / 2 : kind === 'left' ? Math.PI : 0;
    this.decor(kind === 'up' ? 'qp:arrow-up' : 'qp:arrow-side', x, y, z, rot, 0.6);
  }

  /** A flat arrow painted on the ground, pointing forward. */
  groundArrow(x: number, z: number, rot = Math.PI / 2): void { this.decor('qp:arrow', x, this.y + 0.02, z, rot, 0.65); }

  // ---------------------------------------------------------------- the start and the end

  start(): void {
    const n = this.c.inWorld, w = ['meadow', 'canyon', 'frost', 'storm'].indexOf(this.c.world) + 1;
    this.island(0, 7, 13, 8, 0, { depth: 4.5 });
    this.c.start = { x: 0, y: 0, z: 3.5 };
    this.wp(0, 0, 3.5);
    // the stage number on the start island: world and stage
    // world and stage as the pack's big numbers, on the far side of the start isle, facing the camera
    this.decor('qp:n' + w, -2.9, 0.8, -3.6, 0.18, S.number);
    this.decor('qp:n' + n, -1.75, 0.8, -3.9, 0.18, S.number);
    this.decor('qp:plant-small', -2.3, 0, -3.5, 0.5, 0.6);
    this.sign(2.6, 1.2);
    this.groundArrow(0, -2.5);
    this.decor('qp:fence-corner', -3.6, 0, 6.6, 0, S.fence);
    this.decor('qp:fence-corner', 3.6, 0, 6.6, -Math.PI / 2, S.fence);
    this.x = 0; this.y = 0; this.z = -6;
  }

  goal(o: { tower?: boolean } = {}): void {
    const z0 = this.z - 2.5;
    this.gapTo(2.5, 0, 9, 9);
    const gz = z0 - 4.5;
    this.c.goal = { x: this.x, y: this.y, z: gz };
    this.wp(this.x, this.y, gz + 1.5);
    this.wp(this.x, this.y, gz);
    this.coins(this.x - 1.5, z0 - 1.5, this.x + 1.5, z0 - 1.5, 4);
    if (o.tower) { this.c.tower = true; this.solid(topBox(this.x, gz - 5.2, 5.6, 4.2, this.y + 9, 9), 'metal'); }
    this.c.par = Math.round(-gz / 3.4 + 8 + this.c.checkpoints.length * 4);
  }

  checkpoint(len = 6): void {
    this.gapTo(2, 0, len, 5);
    const z = this.z + len / 2;
    this.c.checkpoints.push({ x: this.x + 1.4, y: this.y, z, n: ++this.cps, on: false, wp: this.c.waypoints.length });
    this.wp(this.x + 0.8, this.y, z);
    this.wp(this.x, this.y, this.z + 0.8);
  }

  // ---------------------------------------------------------------- ground pieces

  /** Continues the ground (no gap) for `len` metres. */
  walk(len: number, w = 4, o: { coins?: 'line' | 'zig' | 'none'; surf?: Surf } = {}): Solid {
    const s = this.island(this.x, this.z + 0.05, len + 0.05, w, this.y, { surf: o.surf });
    const c = o.coins ?? 'line';
    if (c === 'line') this.coins(this.x, this.z - 1, this.x, this.z - len + 1, Math.max(2, Math.floor(len / 1.6)));
    if (c === 'zig') for (let i = 0; i < Math.floor(len / 1.4); i++) this.pick('coin', this.x + (i % 2 ? 0.9 : -0.9), this.y + 0.85, this.z - 0.8 - i * 1.4);
    this.wp(this.x, this.y, this.z - len + 0.6);
    this.z -= len;
    return s;
  }

  /** A gap of `gap` metres, then an island `len` long rising by dy (and shifted by dx). */
  gapTo(gap: number, dy: number, len: number, w = 4, dx = 0, o: { coins?: boolean; surf?: Surf } = {}): Solid {
    const x0 = this.x, y0 = this.y;
    this.wp(x0, y0, this.z + 0.5, { jump: true });
    this.x += dx; this.y += dy; this.z -= gap;
    if (o.coins !== false && gap >= 2) this.coins(x0 + dx * 0.25, this.z + gap * 0.75, x0 + dx * 0.75, this.z + gap * 0.25, 2, Math.max(y0, this.y) + 1.7);
    const s = this.island(this.x, this.z, len, w, this.y, { surf: o.surf });
    this.wp(this.x, this.y, this.z - Math.min(1.2, len / 2));
    this.wp(this.x, this.y, this.z - len + 0.6);
    this.z -= len;
    return s;
  }

  /** Stepping stones: n small islands with gaps; dys and dxs per stone. */
  hops(n: number, gap = 2.4, size = 2.4, dys: number[] = [], dxs: number[] = [], o: { surf?: Surf } = {}): Solid[] {
    const out: Solid[] = [];
    for (let i = 0; i < n; i++) out.push(this.gapTo(gap, dys[i] ?? 0, size, size, dxs[i] ?? 0, o));
    return out;
  }

  /** A wooden arched bridge over a gap (the model's deck, stepped for the feet; rails hold you on). */
  bridge(): void {
    const L = 6.94 * S.bridge, x = this.x, y = this.y, z0 = this.z;
    const prof = [0.15, 0.62, 0.86, 1.02, 1.08, 1.08, 1.02, 0.86, 0.62, 0.15];
    this.decor('qp:bridge-small', x, y - 0.15 * S.bridge, z0 - L / 2, Math.PI / 2, S.bridge);
    for (let i = 0; i < prof.length; i++) {
      const a = z0 - (i * L) / prof.length, b = z0 - ((i + 1) * L) / prof.length;
      this.solid(box(x - 0.85, y - 0.4, a, x + 0.85, y + (prof[i] - 0.15) * S.bridge, b), 'wood');
    }
    this.solid(box(x - 1.15, y, z0 - 0.4, x - 0.85, y + 1.4, z0 - L + 0.4), 'wood');
    this.solid(box(x + 0.85, y, z0 - 0.4, x + 1.15, y + 1.4, z0 - L + 0.4), 'wood');
    this.coins(x, z0 - 1, x, z0 - L + 1, 4, y + 1.6);
    this.wp(x, y + 0.8, z0 - L / 2);
    this.z -= L;
    this.island(this.x, this.z + 0.1, 5, 4.5, this.y);
    this.wp(this.x, this.y, this.z - 2.4);
    this.z -= 4.9;
  }

  /** A long plank bridge (the modular bridge's centre pieces), with pendulums or saws on it. */
  planks(n: number): { z0: number; z1: number } {
    const L = 3 * S.plank, x = this.x, y = this.y, z0 = this.z;
    for (let i = 0; i < n; i++) this.decor('qp:bridge-center', x, y - 0.92 * S.plank, z0 - L * (i + 0.5), Math.PI / 2, S.plank);
    this.solid(box(x - 0.9, y - 0.35, z0 + 0.2, x + 0.9, y, z0 - L * n - 0.2), 'wood');
    this.solid(box(x - 1.25, y, z0, x - 0.95, y + 1.1, z0 - L * n), 'wood');
    this.solid(box(x + 0.95, y, z0, x + 1.25, y + 1.1, z0 - L * n), 'wood');
    this.wp(x, y, z0 - L * n);
    this.z -= L * n;
    return { z0, z1: this.z };
  }

  /** Stairs up onto a raised island (+0.85). */
  stairsUp(len = 6): void {
    const x = this.x, y = this.y, z0 = this.z;
    this.walk(2.2, 4.4, { coins: 'none' });
    const zs = this.z;
    const rise = 0.85, L = 2.05;
    this.decor('qp:stairs-small', x, y - 0.1, zs - L / 2 + 0.2, -Math.PI / 2, S.stairs);
    for (let i = 0; i < 3; i++) this.solid(box(x - 1.5, y - 0.4, zs - (i * L) / 3, x + 1.5, y + ((i + 1) * rise) / 3, zs - ((i + 1) * L) / 3), 'wood');
    this.y += rise;
    this.z = zs - L;
    this.island(x, this.z + 0.05, len, 4.6, this.y);
    this.coins(x, this.z - 1, x, this.z - len + 1, 3);
    this.wp(x, this.y, this.z - len + 0.6);
    this.z -= len;
    void z0;
  }

  // ---------------------------------------------------------------- hazards

  /** Saw blades crossing the path side to side on an island `len` long. */
  sawCross(len: number, n: number, o: { period?: number; w?: number; star?: number } = {}): void {
    const w = o.w ?? 5;
    const zs = this.z;
    this.walk(len, w, { coins: 'none' });
    for (let i = 0; i < n; i++) {
      const z = zs - ((i + 1) * len) / (n + 1);
      const span = w / 2 - 0.6;
      this.c.saws.push({ x: 0, y: 0, z, ax: this.x - span, ay: this.y + 0.42, az: z, bx: this.x + span, by: this.y + 0.42, bz: z, period: o.period ?? 2.6, phase: i * 1.7, r: 1.5 * S.saw * 1, normal: 'z', spin: 0 });
      this.decor('px:groove', this.x, this.y + 0.01, z, 0, w - 0.6);
      this.pick('coin', this.x + (i % 2 ? 1 : -1), this.y + 0.85, z + len / (n + 1) / 2);
    }
    if (o.star !== undefined) this.star(o.star, this.x + w / 2 - 0.6, this.y, zs - len / (n + 1));
  }

  /** Saws sliding along the path in two grooves; the safe moment is between them. */
  sawSlide(len: number, o: { period?: number; lanes?: number[] } = {}): void {
    const zs = this.z;
    this.walk(len, 5.2, { coins: 'none' });
    const lanes = o.lanes ?? [-1.3, 1.3];
    lanes.forEach((dx, i) => {
      const x = this.x + dx;
      this.c.saws.push({ x, y: 0, z: 0, ax: x, ay: this.y + 0.42, az: zs - 0.9, bx: x, by: this.y + 0.42, bz: zs - len + 0.9, period: o.period ?? 3, phase: i * Math.PI, r: 1.5 * S.saw, normal: 'z', spin: 0 });
      // the blade faces the camera so it reads from behind; it runs up and down its slot
      this.decor('px:groove', x, this.y + 0.01, zs - len / 2, Math.PI / 2, len - 1.4);
    });
    this.coins(this.x, zs - 1, this.x, zs - len + 1, Math.floor(len / 1.6));
  }

  /** A field of spike traps rising on a rhythm: 'wave' rows rise one after another, 'checker' alternates. */
  traps(rows: number, cols: number, o: { period?: number; up?: number; pattern?: 'wave' | 'checker' | 'all'; star?: number } = {}): void {
    const tile = 2 * S.trap, w = cols * tile + 1.2, len = rows * tile + 1.6;
    const zs = this.z;
    this.walk(len, w, { coins: 'none' });
    const per = o.period ?? 2.4, up = o.up ?? 0.9;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = this.x + (k - (cols - 1) / 2) * tile, z = zs - 0.8 - tile * (r + 0.5);
      const off = o.pattern === 'checker' ? ((r + k) % 2) * (per / 2) : o.pattern === 'all' ? 0 : -r * (per / rows) * 0.9;
      this.c.traps.push({ x, y: this.y, z, half: tile / 2, period: per, up, offset: off, state: 'down', lift: 0 });
      if ((r + k) % 2 === 0) this.pick('coin', x, this.y + 0.85, z);
    }
    if (o.star !== undefined) this.star(o.star, this.x, this.y + 0.4, zs - len / 2);
  }

  /** A narrow zig-zag between fixed spike clusters. */
  spikeRun(len: number, n: number): void {
    const zs = this.z;
    this.walk(len, 5, { coins: 'none' });
    for (let i = 0; i < n; i++) {
      const z = zs - ((i + 0.5) * len) / n, side = i % 2 ? 1 : -1;
      for (const dx of [0.75, 1.65]) this.c.spikes.push({ x: this.x + side * dx, y: this.y, z, r: 0.42, h: 3.4 * S.spikes, scale: S.spikes, rot: i * 1.3 + dx });
      this.pick('coin', this.x - side * 1.3, this.y + 0.85, z);
    }
  }

  /** Spinning spiked columns to weave between. */
  pillars(len: number, n: number, w = 5): void {
    const zs = this.z;
    this.walk(len, w, { coins: 'none' });
    for (let i = 0; i < n; i++) {
      const z = zs - ((i + 0.5) * len) / n, x = this.x + (i % 2 ? 1.1 : -1.1);
      this.c.pillars.push({ x, y: this.y, z, r: 1.14 * S.pillar, h: 3.86 * S.pillar, spin: i });
      this.pick('coin', this.x - (i % 2 ? 1.2 : -1.2), this.y + 0.85, z);
    }
  }

  /** A lane down which spiked logs roll towards the hero. */
  rollers(len: number, o: { every?: number; speed?: number; star?: number; w?: number } = {}): void {
    const w = o.w ?? 3.6;
    const zs = this.z;
    this.walk(len, w, { coins: 'none' });
    const L = 3.88 * S.roller;
    this.c.rollers.push({ x: this.x, y: this.y, z0: zs - len + 0.6, z1: zs + 0.4, len: Math.min(L, w - 0.4), r: 1.14 * S.roller, speed: o.speed ?? 4.2, every: o.every ?? 2.2, offset: 0.4, t: 0, logs: [] });
    this.coins(this.x, zs - 1.5, this.x, zs - len + 1.5, Math.floor(len / 2.2), this.y + 1.9);
    if (o.star !== undefined) this.star(o.star, this.x, this.y + 1.6, zs - len / 2);
    // the logs come from a pipe at the far end
    this.decor('qp:pipe-90', this.x, this.y + 1.2, zs - len - 0.6, Math.PI, S.pipe);
  }

  /** Cannons on side islands firing across the path. */
  cannonCross(len: number, n: number, o: { every?: number; w?: number; star?: number } = {}): void {
    const zs = this.z;
    this.walk(len, o.w ?? 4, { coins: 'zig' });
    for (let i = 0; i < n; i++) {
      const z = zs - ((i + 0.5) * len) / n, side = i % 2 ? 1 : -1, x = this.x + side * 7.5;
      this.island(x, z + 2, 4, 3.4, this.y + 0.6, { decor: false, depth: 3 });
      this.c.cannons.push({ x, y: this.y + 0.6, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, every: o.every ?? 2.6, offset: i * 1.1, speed: 9, range: 18, t: 0, charge: 0, recoil: 0 });
      this.solid(topBox(x + side * 0.2, z, 1.9, 1.5, this.y + 0.6 + 1.25, 1.25), 'metal');
    }
    if (o.star !== undefined) { const x = this.x + 7.5, z = zs - len / (2 * n); this.star(o.star, x - 0.2, this.y + 1.9, z - 1.5); }
  }

  /** A cannon at the far end firing straight down the path; crates to duck behind. */
  cannonHead(len: number, o: { every?: number } = {}): void {
    const zs = this.z;
    this.walk(len, 6.5, { coins: 'none' });
    const z = zs - len + 1.4;
    this.c.cannons.push({ x: this.x, y: this.y, z, yaw: 0, every: o.every ?? 2.2, offset: 0, speed: 8.5, range: len + 6, t: 0, charge: 0, recoil: 0 });
    this.solid(topBox(this.x, z - 0.3, 1.9, 2.2, this.y + 1.3, 1.3), 'metal');
    // cover: the pack's crates, which stop the balls
    for (let i = 0; i < 2; i++) {
      const cz = zs - len * (0.3 + i * 0.32), cx = this.x + (i % 2 ? 1.6 : -1.6);
      this.decor('qp:c-crate', cx, this.y + 0.58, cz, 0, 0.58);
      this.solid(topBox(cx, cz, 1.15, 1.15, this.y + 1.15, 1.15), 'wood');
      this.pick('coin', cx, this.y + 1.95, cz);
    }
    // the path goes round the cannon
    this.wp(this.x - 2.6, this.y, zs - len * 0.5);
    this.wp(this.x - 2.6, this.y, z - 1.5);
    this.wp(this.x, this.y, zs - len + 0.3);
  }

  /** A narrow path with bombs that light when the hero comes near: keep running. */
  bombRun(len: number, n: number): void {
    const zs = this.z;
    this.walk(len, 2.6, { coins: 'line' });
    for (let i = 0; i < n; i++) {
      const z = zs - ((i + 1) * len) / (n + 1), x = this.x + (i % 2 ? 0.8 : -0.8);
      this.c.bombs.push({ x, y: this.y, z, vy: 0, ground: this.y, state: 'idle', fuse: 1, t: 0, dropped: false, back: 0, home: [x, this.y, z] });
    }
  }

  /** Pipes over the path drop bombs onto marked spots. */
  droppers(len: number, n: number, o: { every?: number } = {}): void {
    const zs = this.z;
    this.walk(len, 4.4, { coins: 'zig' });
    for (let i = 0; i < n; i++) {
      const z = zs - ((i + 0.5) * len) / n, x = this.x + (i % 2 ? 0.7 : -0.7);
      this.c.droppers.push({ x, y: this.y + 4.2, z, ground: this.y, every: o.every ?? 2.4, offset: i * 0.8, t: 0, warn: 0 });
      // the pipe on a post at the side, its mouth over the path
      const side = x > this.x ? 1 : -1;
      this.decor('qp:pipe-straight', x + side * 2.6, this.y + 0.8 * S.pipe, z, 0, S.pipe);
      this.decor('qp:pipe-straight', x + side * 2.6, this.y + 2.4 * S.pipe, z, 0, S.pipe);
      this.decor('qp:pipe-straight', x + side * 2.6, this.y + 4.0 * S.pipe, z, 0, S.pipe);
      this.decor('qp:pipe-90', x + side * 1.15, this.y + 4.9 * S.pipe + 0.1, z, side > 0 ? Math.PI : 0, S.pipe);
      this.solid(topBox(x + side * 2.6, z, 1.5, 1.5, this.y + 4.4, 4.4), 'metal');
    }
  }

  /** Spiked balls swinging across a plank bridge. */
  pendulums(n: number, o: { period?: number; star?: number } = {}): void {
    const p = this.planks(n);
    const L = (p.z0 - p.z1) / n;
    for (let i = 0; i < n; i++) {
      const z = p.z0 - L * (i + 0.5);
      this.c.pendulums.push({ px: this.x, py: this.y + 4.6, pz: z, len: 3.7, axis: 'x', amp: 1.0, period: o.period ?? 2.4, phase: i * 1.9, x: 0, y: 0, z: 0, ang: 0 });
      this.decor('px:gallows', this.x, this.y, z, 0, 1);
      this.pick('coin', this.x, this.y + 0.85, z + L / 2);
    }
    if (o.star !== undefined) this.star(o.star, this.x, this.y + 2.2, p.z0 - L * (n - 0.5));
    this.island(this.x, this.z + 0.1, 4.5, 4.4, this.y);
    this.wp(this.x, this.y, this.z - 2.2);
    this.z -= 4.4;
  }

  /** Round isles with spiked balls circling a post on each. */
  orbits(n: number, o: { speed?: number; star?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      const s = this.gapTo(2.4, i % 2 ? 0.4 : -0.4, 5, 5, i % 2 ? 1.2 : -1.2);
      const cz = (s.b.z0 + s.b.z1) / 2;
      this.c.orbiters.push({ x: this.x, y: this.y + 0.75, z: cz, r: 1.9, speed: (o.speed ?? 1.6) * (i % 2 ? -1 : 1), n: 2, phase: i, balls: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] });
      this.solid(topBox(this.x, cz, 0.5, 0.5, this.y + 1.2, 1.2), 'metal');
      this.coins(this.x - 1, cz, this.x + 1, cz, 2, this.y + 0.85);
      this.c.waypoints.splice(this.c.waypoints.length - 1, 0, { x: this.x + 1.0, y: this.y, z: cz });
    }
    if (o.star !== undefined) this.star(o.star, this.x, this.y + 1.8, this.z + 2.5);
  }

  /** A spring at the end of this island throws the hero up onto a higher one. */
  bounceUp(dy = 3.6, len = 6): void {
    const x = this.x, y = this.y;
    this.walk(3, 4, { coins: 'none' });
    const bz = this.z + 1.2;
    const top = y + 0.5;
    const solid = this.solid(topBox(x, bz, 1.25, 1.25, top, 0.8), 'metal');
    const b = { x, y: top - 1.93 * S.bouncer, z: bz, squash: 0, solid };
    solid.bouncer = b;
    this.c.bouncers.push(b);
    this.sign(x + 1.5, bz + 0.6, 'up');
    this.wp(x, top, bz, { hold: 0.2 });
    this.coins(x, bz, x, bz - 2.2, 4, y + 2.4, 1.8);
    this.y = y + dy;
    this.z = bz - 2.4;
    this.island(x, this.z, len, 5, this.y);
    this.wp(x, this.y, this.z - 1.2);
    this.wp(x, this.y, this.z - len + 0.6);
    this.z -= len;
  }

  /** Floating floes moving over a gap (along x, y or z). */
  movers(n: number, axis: 'x' | 'y' | 'z', o: { amp?: number; period?: number; size?: number } = {}): void {
    const size = o.size ?? 2.8, amp = o.amp ?? (axis === 'z' ? 1.4 : 2.2);
    for (let i = 0; i < n; i++) {
      const zc = this.z - 2.2 - size / 2 - (axis === 'z' ? amp : 0);
      const rest = topBox(this.x, zc, size, size, this.y, 0.9);
      const solid = this.solid({ ...rest }, 'wood');
      const k = this.c.movers.length;
      const m = { solid, rest, ax: axis === 'x' ? amp : 0, ay: axis === 'y' ? amp * 0.6 : 0, az: axis === 'z' ? amp : 0, period: o.period ?? 3.4, phase: axis === 'z' ? i * 1.75 : i * 1.6 };
      solid.mover = m;
      this.c.movers.push(m);
      const prev = i > 0 ? k - 1 : undefined;
      // a take-off from the previous floe sits on that floe's own edge (it rides with it)
      this.wp(this.x, this.y, this.z + 0.4 + (prev !== undefined && axis === 'z' ? amp : 0), { jump: true });
      const w = this.c.waypoints[this.c.waypoints.length - 1];
      w.wait = k; w.on = prev;
      this.c.waypoints.push({ x: this.x, y: this.y, z: zc, on: k });
      this.pick('coin', this.x, this.y + 0.85, zc);
      this.z = zc - size / 2 - (axis === 'z' ? amp : 0);
    }
    const last = this.c.movers.length - 1;
    this.gapTo(2.2, 0, 4, 4.4);
    // the take-off from the last floe rides it too
    const j = this.c.waypoints[this.c.waypoints.length - 3];
    if (j?.jump) { j.on = last; if (axis === 'z') j.z += amp; }
  }

  /** Floes that shake and drop a moment after the hero lands. */
  crumbles(n: number, o: { size?: number; gap?: number; dxs?: number[] } = {}): void {
    const size = o.size ?? 2.4, gap = o.gap ?? 1.9;
    for (let i = 0; i < n; i++) {
      const dx = o.dxs?.[i] ?? 0;
      this.wp(this.x, this.y, this.z + 0.4, { jump: true });
      this.x += dx;
      const zc = this.z - gap - size / 2;
      const rest = topBox(this.x, zc, size, size, this.y, 0.7);
      const solid = this.solid({ ...rest }, 'wood');
      const c = { solid, rest, stand: 0, state: 'idle' as const, fallY: 0, vy: 0, back: 0 };
      solid.crumble = c;
      this.c.crumbles.push(c);
      this.wp(this.x, this.y, zc);
      this.pick('coin', this.x, this.y + 0.85, zc);
      this.z = zc - size / 2;
    }
    this.gapTo(gap, 0, 4, 4.4);
  }

  /** Pipe pillars rising out of the void, their tops at different heights. */
  pipes(dys: number[], o: { dxs?: number[] } = {}): void {
    const r = 1.04 * S.pipe;
    dys.forEach((dy, i) => {
      this.wp(this.x, this.y, this.z + 0.4, { jump: true });
      this.y += dy;
      this.x += o.dxs?.[i] ?? 0;
      const zc = this.z - 2.3 - r;
      const top = this.y;
      // the pipe end on top, straight pieces down into the clouds
      this.decor('qp:pipe-end', this.x, top - 1.22 * S.pipe, zc, 0, S.pipe);
      for (let k = 0; k < 3; k++) this.decor('qp:pipe-straight', this.x, top - (2.22 + 2 * k) * S.pipe, zc, 0, S.pipe);
      this.solid(topBox(this.x, zc, r * 1.8, r * 1.8, top, 6.5), 'metal');
      this.c.floor = Math.min(this.c.floor, top - 6.5);
      this.wp(this.x, top, zc);
      this.pick('coin', this.x, top + 0.85, zc);
      this.z = zc - r;
    });
    this.gapTo(2.3, 0, 4.5, 4.4);
  }

  /** A gate blocks the path; its lever waits on a side isle to the left. */
  leverGate(o: { side?: number; guard?: 'saw' | 'traps' | 'none' } = {}): void {
    const side = o.side ?? -1;
    const zs = this.z;
    this.walk(6, 4.2, { coins: 'line' });
    // the side isle with the lever
    const lx = this.x + side * 6.2, lz = zs - 3;
    this.island(lx, lz + 2, 4, 3.4, this.y + 0.5, { decor: false });
    this.wp(this.x + side * 1.4, this.y, lz, { jump: true });
    this.wp(lx - side * 0.6, this.y + 0.5, lz);
    this.wp(lx + side * 0.3, this.y + 0.5, lz, { hold: 0.3 });
    this.wp(lx - side * 1.2, this.y + 0.5, lz, { jump: true });
    this.wp(this.x + side * 1.0, this.y, lz);
    this.c.levers.push({ x: lx + side * 0.3, y: this.y + 0.5, z: lz, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, door: this.doors, on: false, t: 0 });
    this.pick('coin', lx, this.y + 1.35, lz + 1.2);
    if (o.guard === 'saw') this.c.saws.push({ x: 0, y: 0, z: 0, ax: lx, ay: this.y + 0.92, az: lz + 1.4, bx: lx, by: this.y + 0.92, bz: lz - 1.4, period: 2.2, phase: 0, r: 1.5 * S.saw * 0.8, normal: 'z', spin: 0 });
    // the gate: frame posts and a door panel
    const gz = this.z - 0.4;
    const w = 3.7 * S.door, hgt = 4.25 * S.door;
    this.walk(3, 4.2, { coins: 'none' });
    const panel = this.solid(box(this.x - w / 2 + 0.35, this.y, gz - 0.25, this.x + w / 2 - 0.35, this.y + hgt, gz + 0.25), 'wood');
    this.solid(box(this.x - 2.1, this.y, gz - 0.35, this.x - w / 2 + 0.3, this.y + hgt, gz + 0.35), 'metal');
    this.solid(box(this.x + w / 2 - 0.3, this.y, gz - 0.35, this.x + 2.1, this.y + hgt, gz + 0.35), 'metal');
    this.c.doors.push({ x: this.x, y: this.y, z: gz, w, h: hgt, panel, open: 0, opening: false });
    for (const sx of [-1, 1]) this.decor('qp:fence-1', this.x + sx * 1.72, this.y, gz, 0, S.fence);
    this.doors++;
    this.wp(this.x, this.y, gz - 1.6);
  }

  /** A key on a side ledge (guarded), to open a chest further on. */
  keyLedge(side: number, o: { dy?: number; guard?: boolean } = {}): void {
    const kx = this.x + side * 5.4, kz = this.z + 2.2, ky = this.y + (o.dy ?? 1.2);
    this.island(kx, kz + 1.4, 2.8, 2.6, ky, { decor: false, depth: 2.5 });
    this.key(kx, ky, kz);
    if (o.guard) this.c.traps.push({ x: kx, y: ky, z: kz, half: S.trap, period: 2.2, up: 0.8, offset: 0.5, state: 'down', lift: 0 });
    this.wp(this.x + side * 1.4, this.y, kz, { jump: true });
    this.wp(kx, ky, kz, { hold: 0.2 });
    this.wp(kx - side * 1.0, ky, kz, { jump: true });
    this.wp(this.x + side * 0.8, this.y, kz);
  }

  chest(o: { coins?: number; gem?: GemKind | null; heart?: boolean; side?: number } = {}): void {
    const side = o.side ?? 1;
    const x = this.x + side * 1.3, z = this.z + 2;
    const solid = this.solid(topBox(x, z, 2.14 * S.chest, 1.9 * S.chest, this.y + 1.05 * S.chest + 0.05, 1.2), 'wood');
    this.c.chests.push({ x, y: this.y, z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, coins: o.coins ?? 12, gem: o.gem ?? null, heart: !!o.heart, open: 0, opened: false, solid, nag: 0 });
    this.wp(x - side * 1.2, this.y, z, { hold: 0.3 });
  }

  /**
   * A small isle off to one side of the last piece (side -1 left, 1 right), `dy` above the path,
   * with a prize on it: a star, a gem, a power, a heart or a key. The autopilot leaves it alone.
   */
  sideIsle(side: number, prize: { star?: number; gem?: GemKind; power?: PowerId; heart?: boolean; key?: boolean }, o: { dy?: number; dist?: number; dz?: number; size?: number; trap?: boolean } = {}): void {
    const size = o.size ?? 2.6;
    const x = this.x + side * (o.dist ?? 5.2), z = this.z + (o.dz ?? 2.2), y = this.y + (o.dy ?? 0.6);
    this.island(x, z + size / 2, size, size, y, { decor: false, depth: 2.4 });
    if (prize.star !== undefined) this.star(prize.star, x, y, z);
    if (prize.gem) this.gem(prize.gem, x, y, z);
    if (prize.power) this.power(prize.power, x, y, z);
    if (prize.heart) this.heart(x, y, z);
    if (prize.key) this.key(x, y, z);
    if (o.trap) this.c.traps.push({ x, y, z, half: S.trap, period: 2.4, up: 0.9, offset: 0.7, state: 'down', lift: 0 });
    if (this.rnd() < 0.6) this.decor('qp:plant-small', x + side * 0.8, y, z - 0.7, this.rnd() * 6, 0.6);
  }

  /**
   * An enemy on the last isle of the path: `dx`/`dz` from its middle, patrolling `range` metres.
   * Bees hover over it.
   */
  foe(kind: FoeKind, o: { dx?: number; dz?: number; range?: number } = {}): void {
    const s = this.last;
    if (!s) return;
    const b = s.b;
    const x = (b.x0 + b.x1) / 2 + (o.dx ?? 0), z = (b.z0 + b.z1) / 2 + (o.dz ?? 0);
    const area = { x0: b.x0 + 0.5, x1: b.x1 - 0.5, z0: b.z0 + 0.5, z1: b.z1 - 0.5 };
    this.c.foes.push({ kind, x, y: b.y1 + (kind === 'bee' ? 1.5 : 0), z, vx: 0, vy: 0, vz: 0, yaw: 0, hx: x, hz: z, range: o.range ?? Math.min(2.2, (b.x1 - b.x0) / 2 - 0.6), area, ground: b.y1, state: kind === 'bee' ? 'hover' : 'walk', t: this.c.foes.length * 0.37, dir: this.c.foes.length % 2 ? 1 : -1, ax: 0, ay: 0, az: 0 });
  }

  /** "?" blocks over the path, `dz` back from the cursor: jump into them from below for coins. */
  bonus(n = 1, dz = 2.5, dx = 0): void {
    for (let i = 0; i < n; i++) {
      const x = this.x + dx + (i - (n - 1) / 2) * 1.3, z = this.z + dz, y = this.y + 2.9;
      const solid = this.solid(box(x - 0.6, y - 0.6, z - 0.6, x + 0.6, y + 0.6, z + 0.6), 'metal');
      const bn = { x, y, z, solid, used: false, bump: 0, coins: 5 };
      solid.bonus = bn;
      this.c.bonuses.push(bn);
    }
  }

  /** An icy stretch (slides). */
  ice(len: number, w = 4.6): void {
    this.walk(len, w, { surf: 'ice', coins: 'zig' });
  }
}
