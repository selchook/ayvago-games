// The marble on the tilting board: a pure simulation (no Phaser, no three.js), so the game and the
// headless level bot (games/marble-maze/bot.ts) run exactly the same physics.
//
// Units are board cells: cell (cx, cy) spans x cx..cx+1 and y cy..cy+1 (y grows towards the
// player, the screen's "down"). The marble rolls in x/y; `h` is its height while it flies off a
// jump pad.

export const R = 0.3;              // marble radius
const STEP = 1 / 120;              // fixed physics step
const HOLE_RIM = 0.46;             // a hole's visible radius: the rim pulls a little inside it
const BUMPER_R = 0.27;
const GRAVITY_AIR = 22;            // pulls the marble back down after a jump pad
const JUMP_UP = 5.2;               // vertical launch speed of a jump pad (air time ~0.47 s)
const JUMP_SPEED = 6.4;            // speed along the pad's arrow: a jump covers about three cells
const WALL_BOUNCE = 0.38;
const PICK_R = 0.5;
/** Seconds a moving platform rests at each end of its swing. */
export const MOVER_DWELL = 1.3;

/** Floor kinds. */
export const T = { WALL: 0, FLOOR: 1, VOID: 2, HOLE: 3, ICE: 4, SAND: 5, BRIDGE: 6, GATE: 7 } as const;
export type T = (typeof T)[keyof typeof T];

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRV: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface MoverDef {
  /** Top-left cell of the platform at the start of its swing, its size in cells. */
  x: number; y: number; w: number; h: number;
  /** How far it travels (cells) and the time of one full back-and-forth swing (s). */
  dx: number; dy: number; period: number;
  /** 0..1 offset in the swing at t = 0. */
  phase?: number;
}

export interface Tuning {
  /** Acceleration at full tilt (cells/s²). */
  acc: number;
  /** Soft speed cap on the floor. */
  maxSpeed: number;
  /** Distance from a hole's centre at which the marble drops in. */
  holeFall: number;
  /** How quickly the board follows the input (1/s). */
  tiltRate: number;
  /** Rolling friction on ice (Easy grips a little more). */
  ice: number;
}

export const TUNE: Record<'normal' | 'easy', Tuning> = {
  normal: { acc: 11, maxSpeed: 7.5, holeFall: 0.33, tiltRate: 9, ice: 0.12 },
  easy: { acc: 8.4, maxSpeed: 5.8, holeFall: 0.27, tiltRate: 7, ice: 0.45 },
};

/** Rolling friction per floor (1/s): ice barely slows the marble, sand and snow drag it. */
export const FRICTION: Record<number, number> = { [T.FLOOR]: 1.05, [T.BRIDGE]: 1.05, [T.HOLE]: 1.05, [T.ICE]: 0.12, [T.SAND]: 4.2, [T.GATE]: 1.05 };

export interface Item { x: number; y: number; cx: number; cy: number; taken: boolean }
export interface Spring extends Item { dir: Dir }
export interface Switch extends Item { ch: number }
export interface Gate { cx: number; cy: number; ch: number }

export interface ParsedLevel {
  w: number;
  h: number;
  tiles: T[];
  start: { x: number; y: number };
  goal: { x: number; y: number; cx: number; cy: number };
  gems: Item[];
  keys: Item[];
  checkpoints: Item[];
  springs: Spring[];
  switches: Switch[];
  gates: Gate[];
  bumpers: { x: number; y: number; cx: number; cy: number }[];
  holes: { x: number; y: number; cx: number; cy: number }[];
  movers: MoverDef[];
}

/**
 * Map legend:
 *   #  wall            .  floor           _  void (no floor)    =  plank bridge (floor)
 *   o  hole            e  hole on Normal only (floor on Easy)
 *   S  start           G  goal            *  gem (optional)     k  key (all needed for the goal)
 *   C  checkpoint      b  bumper          ^ v < >  jump pad (launches the marble that way)
 *   i  ice             s  sand / snow     1 2 3  switch          7 8 9  gate opened by switch 1 2 3
 */
export function parseLevel(map: string[], movers: MoverDef[] = [], easy = false): ParsedLevel {
  const h = map.length;
  const w = Math.max(...map.map((r) => r.length));
  const tiles: T[] = new Array(w * h).fill(T.VOID);
  const L: ParsedLevel = {
    w, h, tiles, start: { x: 1.5, y: 1.5 }, goal: { x: 1.5, y: 1.5, cx: 1, cy: 1 },
    gems: [], keys: [], checkpoints: [], springs: [], switches: [], gates: [], bumpers: [], holes: [], movers,
  };
  const item = (cx: number, cy: number): Item => ({ x: cx + 0.5, y: cy + 0.5, cx, cy, taken: false });
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const c = map[cy][cx] ?? '_';
      let t: T = T.FLOOR;
      switch (c) {
        case '#': t = T.WALL; break;
        case '_': case ' ': t = T.VOID; break;
        case '=': t = T.BRIDGE; break;
        case 'o': t = T.HOLE; break;
        case 'e': t = easy ? T.FLOOR : T.HOLE; break;
        case 'i': t = T.ICE; break;
        case 's': t = T.SAND; break;
        case 'S': L.start = { x: cx + 0.5, y: cy + 0.5 }; break;
        case 'G': L.goal = item(cx, cy); break;
        case '*': L.gems.push(item(cx, cy)); break;
        case 'k': L.keys.push(item(cx, cy)); break;
        case 'C': L.checkpoints.push(item(cx, cy)); break;
        case 'b': L.bumpers.push(item(cx, cy)); break;
        case '^': L.springs.push({ ...item(cx, cy), dir: 'up' }); break;
        case 'v': L.springs.push({ ...item(cx, cy), dir: 'down' }); break;
        case '<': L.springs.push({ ...item(cx, cy), dir: 'left' }); break;
        case '>': L.springs.push({ ...item(cx, cy), dir: 'right' }); break;
        case '1': case '2': case '3': L.switches.push({ ...item(cx, cy), ch: Number(c) }); break;
        case '7': case '8': case '9': t = T.GATE; L.gates.push({ cx, cy, ch: Number(c) - 6 }); break;
        default: break;
      }
      tiles[cy * w + cx] = t;
      if (t === T.HOLE) L.holes.push(item(cx, cy));
    }
  }
  return L;
}

export type SimEvent =
  | { type: 'wall'; speed: number; x: number; y: number }
  | { type: 'bumper'; x: number; y: number; i: number }
  | { type: 'jump'; i: number }
  | { type: 'land'; speed: number }
  | { type: 'gem'; i: number }
  | { type: 'key'; i: number }
  | { type: 'switch'; i: number; ch: number }
  | { type: 'checkpoint'; i: number }
  | { type: 'locked' }
  | { type: 'fall'; kind: 'hole' | 'void'; x: number; y: number }
  | { type: 'goal' };

export type SimState = 'roll' | 'fall' | 'goal';

export class Sim {
  readonly L: ParsedLevel;
  x = 0; y = 0; vx = 0; vy = 0;
  /** Height above the board and vertical speed (jump pads). */
  h = 0; vh = 0;
  /** Board tilt, -1..1 on each axis (eased towards the input). */
  tiltX = 0; tiltY = 0;
  /** Seconds since the level started (movers keep swinging during falls). */
  t = 0;
  state: SimState = 'roll';
  gems = 0;
  keys = 0;
  falls = 0;
  /** Where a fall puts the marble back. */
  respawnAt: { x: number; y: number };
  open = new Set<number>();
  /** Platform offsets this step (cells), and which mover carries the marble (-1: none). */
  moverPos: { x: number; y: number }[] = [];
  riding = -1;
  /** Distance rolled (cells): the scene turns the marble mesh by it. */
  rolled = 0;
  surface: T = T.FLOOR;
  events: SimEvent[] = [];
  private acc = 0;
  private springCool = 0;
  private lockedCool = 0;
  private lastSpring = -1;

  constructor(L: ParsedLevel, public tune: Tuning) {
    this.L = L;
    this.x = L.start.x;
    this.y = L.start.y;
    this.respawnAt = { ...L.start };
    this.moverPos = L.movers.map(() => ({ x: 0, y: 0 }));
    this.placeMovers();
  }

  tile(cx: number, cy: number): T {
    if (cx < 0 || cy < 0 || cx >= this.L.w || cy >= this.L.h) return T.VOID;
    return this.L.tiles[cy * this.L.w + cx];
  }

  /** Solid for the marble: walls and closed gates. */
  solid(cx: number, cy: number): boolean {
    const t = this.tile(cx, cy);
    if (t === T.WALL) return true;
    if (t === T.GATE) return !this.gateOpen(cx, cy);
    return false;
  }

  gateOpen(cx: number, cy: number): boolean {
    const g = this.L.gates.find((q) => q.cx === cx && q.cy === cy);
    return !!g && this.open.has(g.ch);
  }

  get allKeys(): boolean {
    return this.keys >= this.L.keys.length;
  }

  /**
   * Swing position of a mover at time t (0..1): it waits MOVER_DWELL seconds at each end (time
   * to roll on or off), and eases between the ends.
   */
  moverF(i: number, t = this.t): number {
    const m = this.L.movers[i];
    let u = (t / m.period + (m.phase ?? 0)) % 1;
    if (u < 0) u += 1;
    const half = u < 0.5;
    const local = half ? u * 2 : (u - 0.5) * 2;
    const dw = Math.min(0.45, MOVER_DWELL / (m.period / 2));
    const k = Math.min(1, local / (1 - dw));
    const e = k * k * (3 - 2 * k);
    return half ? e : 1 - e;
  }

  private placeMovers(): void {
    this.L.movers.forEach((m, i) => {
      const f = this.moverF(i);
      this.moverPos[i].x = m.x + m.dx * f;
      this.moverPos[i].y = m.y + m.dy * f;
    });
  }

  /** The mover under (x, y), or -1. */
  moverAt(x: number, y: number): number {
    for (let i = 0; i < this.L.movers.length; i++) {
      const m = this.L.movers[i], p = this.moverPos[i];
      if (x >= p.x - 0.02 && x <= p.x + m.w + 0.02 && y >= p.y - 0.02 && y <= p.y + m.h + 0.02) return i;
    }
    return -1;
  }

  /** Advances by dt seconds with the input (ix, iy) in -1..1 (iy < 0 rolls up the screen). */
  step(dt: number, ix: number, iy: number): void {
    this.events = [];
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP, ix, iy);
    }
  }

  private tick(dt: number, ix: number, iy: number): void {
    const k = Math.min(1, dt * this.tune.tiltRate);
    this.tiltX += (ix - this.tiltX) * k;
    this.tiltY += (iy - this.tiltY) * k;
    this.t += dt;
    const prev = this.moverPos.map((p) => ({ ...p }));
    this.placeMovers();
    this.springCool = Math.max(0, this.springCool - dt);
    this.lockedCool = Math.max(0, this.lockedCool - dt);
    if (this.state !== 'roll') return;

    const air = this.h > 0 || this.vh > 0;
    // carried by a platform (its motion, not the marble's own velocity)
    if (!air) {
      const r = this.moverAt(this.x, this.y);
      this.riding = r;
      if (r >= 0) {
        this.x += this.moverPos[r].x - prev[r].x;
        this.y += this.moverPos[r].y - prev[r].y;
      }
    }

    const cx = Math.floor(this.x), cy = Math.floor(this.y);
    const under: T = this.riding >= 0 ? T.FLOOR : this.tile(cx, cy);
    this.surface = under;
    if (!air) {
      // gravity along the tilted board
      this.vx += this.tiltX * this.tune.acc * dt;
      this.vy += this.tiltY * this.tune.acc * dt;
      const fr = under === T.ICE ? this.tune.ice : FRICTION[under] ?? 1.05;
      const damp = Math.max(0, 1 - fr * dt);
      this.vx *= damp;
      this.vy *= damp;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > this.tune.maxSpeed) {
        const s = Math.max(this.tune.maxSpeed, sp * (1 - 2.5 * dt)) / sp;
        this.vx *= s;
        this.vy *= s;
      }
      // the rim of a nearby hole tips the marble towards it
      for (const ho of this.L.holes) {
        if (this.tile(ho.cx, ho.cy) !== T.HOLE) continue;
        const dx = ho.x - this.x, dy = ho.y - this.y, d = Math.hypot(dx, dy);
        if (d < HOLE_RIM && d > 1e-4) {
          const pull = 5 * (1 - d / HOLE_RIM);
          this.vx += (dx / d) * pull * dt;
          this.vy += (dy / d) * pull * dt;
        }
      }
    } else {
      this.vh -= GRAVITY_AIR * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rolled += Math.hypot(this.vx, this.vy) * dt;
    if (air) {
      this.h += this.vh * dt;
      if (this.h <= 0) {
        this.events.push({ type: 'land', speed: -this.vh });
        this.h = 0;
        this.vh = 0;
      }
    }

    this.collide();
    this.pickups();
    if (this.state !== 'roll') return;
    if (this.h > 0 || this.vh > 0) return;

    // jump pads: fire as the marble crosses the pad's centre line
    const ncx = Math.floor(this.x), ncy = Math.floor(this.y);
    this.L.springs.forEach((s, i) => {
      if (s.cx !== ncx || s.cy !== ncy || this.springCool > 0 && this.lastSpring === i) return;
      const [dx, dy] = DIRV[s.dir];
      const along = (this.x - s.x) * dx + (this.y - s.y) * dy;
      if (along < -0.12) return;
      // straight along the arrow, from the pad's centre line
      if (dx) this.y += (s.y - this.y) * 0.5; else this.x += (s.x - this.x) * 0.5;
      this.vx = dx * JUMP_SPEED + (dx ? 0 : this.vx * 0.15);
      this.vy = dy * JUMP_SPEED + (dy ? 0 : this.vy * 0.15);
      this.vh = JUMP_UP;
      this.h = 0.001;
      this.springCool = 0.4;
      this.lastSpring = i;
      this.events.push({ type: 'jump', i });
    });
    if (this.h > 0) return;

    // falling: off the edge into the void, or into a hole
    if (this.moverAt(this.x, this.y) < 0) {
      const t = this.tile(ncx, ncy);
      if (t === T.VOID) {
        this.fall('void', this.x, this.y);
        return;
      }
    }
    for (const ho of this.L.holes) {
      if (this.tile(ho.cx, ho.cy) !== T.HOLE) continue;
      if (Math.hypot(ho.x - this.x, ho.y - this.y) < this.tune.holeFall) {
        this.fall('hole', ho.x, ho.y);
        return;
      }
    }
  }

  private fall(kind: 'hole' | 'void', x: number, y: number): void {
    this.state = 'fall';
    this.falls++;
    this.events.push({ type: 'fall', kind, x, y });
  }

  private collide(): void {
    const x0 = Math.floor(this.x - R), x1 = Math.floor(this.x + R);
    const y0 = Math.floor(this.y - R), y1 = Math.floor(this.y + R);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.solid(cx, cy)) continue;
        const px = Math.max(cx, Math.min(this.x, cx + 1));
        const py = Math.max(cy, Math.min(this.y, cy + 1));
        let dx = this.x - px, dy = this.y - py;
        let d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d < 1e-6) {
          // centre inside the block (only after a huge step): push out the short way
          const left = this.x - cx, right = cx + 1 - this.x, top = this.y - cy, bottom = cy + 1 - this.y;
          const m = Math.min(left, right, top, bottom);
          dx = m === left ? -1 : m === right ? 1 : 0;
          dy = m === top ? -1 : m === bottom ? 1 : 0;
          d = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        this.x += dx * (R - d);
        this.y += dy * (R - d);
        const vn = this.vx * dx + this.vy * dy;
        if (vn < 0) {
          this.vx -= (1 + WALL_BOUNCE) * vn * dx;
          this.vy -= (1 + WALL_BOUNCE) * vn * dy;
          // a little grip on the wall
          const tx = -dy, ty = dx, vt = this.vx * tx + this.vy * ty;
          this.vx -= vt * tx * 0.04;
          this.vy -= vt * ty * 0.04;
          if (-vn > 1.1) this.events.push({ type: 'wall', speed: -vn, x: this.x - dx * R, y: this.y - dy * R });
        }
      }
    }
    this.L.bumpers.forEach((b, i) => {
      const dx = this.x - b.x, dy = this.y - b.y, d = Math.hypot(dx, dy), min = R + BUMPER_R;
      if (d >= min || d < 1e-6) return;
      const nx = dx / d, ny = dy / d;
      this.x = b.x + nx * min;
      this.y = b.y + ny * min;
      const vn = this.vx * nx + this.vy * ny;
      const out = Math.max(5.2, Math.abs(vn) * 1.1);
      this.vx += (out - vn) * nx;
      this.vy += (out - vn) * ny;
      this.events.push({ type: 'bumper', x: b.x, y: b.y, i });
    });
  }

  private pickups(): void {
    const near = (p: { x: number; y: number }, r: number) => Math.hypot(p.x - this.x, p.y - this.y) < r;
    this.L.gems.forEach((g, i) => {
      if (!g.taken && near(g, PICK_R)) { g.taken = true; this.gems++; this.events.push({ type: 'gem', i }); }
    });
    if (this.h > 0.25) return;
    this.L.keys.forEach((g, i) => {
      if (!g.taken && near(g, PICK_R)) { g.taken = true; this.keys++; this.events.push({ type: 'key', i }); }
    });
    this.L.switches.forEach((s, i) => {
      if (!s.taken && near(s, 0.42)) {
        s.taken = true;
        this.open.add(s.ch);
        this.events.push({ type: 'switch', i, ch: s.ch });
      }
    });
    this.L.checkpoints.forEach((c, i) => {
      if (!c.taken && near(c, PICK_R)) {
        c.taken = true;
        this.respawnAt = { x: c.x, y: c.y };
        this.events.push({ type: 'checkpoint', i });
      }
    });
    if (near(this.L.goal, 0.42)) {
      if (this.allKeys) {
        this.state = 'goal';
        this.events.push({ type: 'goal' });
      } else if (this.lockedCool <= 0) {
        this.lockedCool = 1.6;
        this.events.push({ type: 'locked' });
      }
    }
  }

  /** Back on the board after a fall, at the last checkpoint (or the start), at rest. */
  respawn(): void {
    this.x = this.respawnAt.x;
    this.y = this.respawnAt.y;
    this.vx = this.vy = this.h = this.vh = 0;
    this.state = 'roll';
    this.riding = -1;
  }
}
