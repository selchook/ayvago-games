// Plinko Drop board model: layouts, ball physics and scoring rules.
// No Phaser in here, so the same code runs in the game and in headless balance runs.

export const L = 40, R = 680, W = R - L;
export const BALL_R = 15, SHARD_R = 12, HEAVY_R = 17;
export const PEG_R = 8, GOLD_R = 10, BUMP_R = 26, BAR_R = 9, SPIN_R = 8;
export const PEG_TOP = 300, ROW_H = 60, ROWS = 11;
export const DIV_TOP = 1000, FLOOR = 1150;
export const SLOTS = 9, SLOT_W = W / SLOTS;
export const DROP_Y = 205;
/** A ghost ball passes through everything above this line. */
export const GHOST_Y = PEG_TOP + ROW_H * 3.5;
const GRAV = 2300, MAX_V = 1250, SUB = 5;

export type Rand = () => number;
export type BoardKind = 'classic' | 'diamonds' | 'bumpers' | 'sliders' | 'spinner' | 'waves' | 'funnel';
export const BOARD_KINDS: BoardKind[] = ['classic', 'diamonds', 'bumpers', 'sliders', 'spinner', 'waves', 'funnel'];
export type BallKind = 'normal' | 'gold' | 'heavy' | 'split' | 'ghost' | 'shard';
export const SPECIALS: BallKind[] = ['gold', 'ghost', 'split', 'heavy'];
export type PegKind = 'n' | 'gold' | 'bump';

export interface Peg {
  id: number; x: number; y: number; x0: number; r: number; kind: PegKind; alive: boolean;
  row: number; vx: number; amp: number; speed: number; phase: number;
}
export interface Bar { id: number; x0: number; y: number; half: number; amp: number; speed: number; phase: number; x: number; vx: number }
export interface Spinner { id: number; x: number; y: number; len: number; angle: number; omega: number }
export interface Slot { kind: 'pts' | 'ball' | 'zero'; value: number }
export interface Ball {
  id: number; x: number; y: number; vx: number; vy: number; r: number; kind: BallKind;
  smash: number; ghost: boolean; lastSpin: number; landed: boolean;
  /** Stuck check: position at the last checkpoint, its time, and how often the ball was freed. */
  cx: number; cy: number; ct: number; freed: number;
  /** Seconds left in which the ball passes through obstacles (frees a wedged ball). */
  pass: number;
}

export type SimEvent =
  | { t: 'peg'; b: Ball; p: Peg }
  | { t: 'gold'; b: Ball; p: Peg; pts: number }
  | { t: 'allGold'; pts: number }
  | { t: 'bump'; b: Ball; p: Peg; pts: number }
  | { t: 'smash'; b: Ball; p: Peg; pts: number }
  | { t: 'bar'; b: Ball; bar: Bar }
  | { t: 'spin'; b: Ball; s: Spinner; pts: number }
  | { t: 'split'; b: Ball; kids: Ball[] }
  | { t: 'solid'; b: Ball }
  | { t: 'land'; b: Ball; i: number; slot: Slot; pts: number; gate: number; combo: number; jackpot: boolean }
  | { t: 'extra'; b: Ball; i: number }
  | { t: 'gate'; i: number }
  | { t: 'goal' }
  | { t: 'star'; n: number };

// ------------------------------------------------------------------ board configs

export interface BoardConfig {
  n: number;
  kind: BoardKind;
  /** 0 for the first pass through the seven boards, 1 for the second, ... */
  tier: number;
  goal: number;
  balls: number;
  zeros: number;
  gateMult: number;
  gateEvery: number;
  golds: number;
  queue: BallKind[];
  /** A ball type that appears for the first time on this board. */
  newBall?: BallKind;
}

/** Typical 10-ball score per board kind (random aim); the goal is a share of it that grows. */
const KIND_PAR: Record<BoardKind, number> = {
  classic: 550, diamonds: 520, bumpers: 700, sliders: 620, spinner: 740, waves: 610, funnel: 600,
};
/** Share of the par a board asks for: generous at first, then above par from the second pass. */
export function goalShare(n: number): number {
  return n <= 7 ? 0.45 + 0.06 * (n - 1) : Math.min(1.25, 0.82 + 0.04 * (n - 7));
}
/** Score needed for 1, 2 and 3 stars, as a share of the goal. */
export const STAR_AT = [1, 1.4, 1.8];
/** Combo multiplier by streak of hot landings (index = streak). */
export const COMBO = [1, 1, 1.5, 2, 2.5, 3];

export function unlockedBalls(n: number): BallKind[] {
  return SPECIALS.slice(0, Math.min(SPECIALS.length, n));
}

export function boardConfig(n: number, extraBalls: number, rand: Rand): BoardConfig {
  const kind = BOARD_KINDS[(n - 1) % BOARD_KINDS.length];
  const tier = Math.floor((n - 1) / BOARD_KINDS.length);
  const goal = Math.round((KIND_PAR[kind] * goalShare(n)) / 10) * 10;
  const balls = 10 + extraBalls;
  const zeros = Math.min(3, (n >= 3 ? 1 : 0) + (n >= 6 ? 1 : 0) + (tier >= 1 ? 1 : 0));
  const gateMult = n >= 5 ? 3 : 2;
  const gateEvery = Math.max(0.45, 1.5 - n * 0.08);
  const golds = Math.min(10, 5 + Math.floor(n / 2));
  const types = unlockedBalls(n);
  const newBall = n <= SPECIALS.length ? SPECIALS[n - 1] : undefined;
  const specials = Math.min(4, n === 1 ? 1 : n <= 3 ? 2 : 3 + tier);
  const queue: BallKind[] = Array(balls).fill('normal');
  // the first ball is always a plain one; specials go to random later spots
  const spots = shuffle(rand, Array.from({ length: balls - 1 }, (_, i) => i + 1)).slice(0, specials);
  spots.forEach((s, k) => { queue[s] = k === 0 && newBall ? newBall : types[Math.floor(rand() * types.length)]; });
  return { n, kind, tier, goal, balls, zeros, gateMult, gateEvery, golds, queue, newBall };
}

export function makeSlots(cfg: BoardConfig, rand: Rand): Slot[] {
  const values = shuffle(rand, [5, 10, 10, 20, 25, 25, 50, 50, 100]);
  const slots: Slot[] = values.map((v) => ({ kind: 'pts', value: v }));
  const jack = values.indexOf(100);
  // zero traps sit right next to the jackpot first: the big pocket is a risk
  const near = shuffle(rand, [jack - 1, jack + 1].filter((i) => i >= 0 && i < SLOTS));
  const rest = shuffle(rand, slots.map((_, i) => i).filter((i) => i !== jack && !near.includes(i) && values[i] < 50));
  const zeroAt = [...near, ...rest].slice(0, cfg.zeros);
  for (const i of zeroAt) slots[i] = { kind: 'zero', value: 0 };
  if (cfg.n === 1 || rand() < 0.6) {
    const free = slots.map((s, i) => i).filter((i) => slots[i].kind === 'pts' && slots[i].value <= 20);
    if (free.length) slots[free[Math.floor(rand() * free.length)]] = { kind: 'ball', value: 0 };
  }
  return slots;
}

function shuffle<T>(rand: Rand, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------------ layouts

interface Layout { pegs: Peg[]; bars: Bar[]; spinners: Spinner[] }

function buildLayout(kind: BoardKind, tier: number, rand: Rand): Layout {
  const pegs: Peg[] = [];
  const bars: Bar[] = [];
  const spinners: Spinner[] = [];
  let id = 0;
  const peg = (x: number, y: number, k: PegKind = 'n', mover?: { amp: number; speed: number; phase: number }) => {
    pegs.push({
      id: id++, x, y, x0: x, r: k === 'bump' ? BUMP_R : PEG_R, kind: k, alive: true,
      row: Math.max(0, Math.round((y - PEG_TOP) / ROW_H)), vx: 0,
      amp: mover?.amp ?? 0, speed: mover?.speed ?? 0, phase: mover?.phase ?? 0,
    });
  };
  const gridRow = (row: number, skip?: (x: number, y: number) => boolean, mover?: { amp: number; speed: number; phase: number }) => {
    const y = PEG_TOP + row * ROW_H;
    const odd = row % 2 === 1;
    const n = odd ? 9 : 10;
    for (let i = 0; i < n; i++) {
      const x = odd ? L + 64 + i * 64 : L + 32 + i * 64;
      if (!skip?.(x, y)) peg(x, y, 'n', mover);
    }
  };

  switch (kind) {
    case 'classic':
      for (let r = 0; r < ROWS; r++) gridRow(r);
      break;
    case 'diamonds': {
      // solid diamonds in a staggered pattern, single pegs between them
      const rows = [320, 440, 560, 680, 800];
      rows.forEach((y, ri) => {
        const odd = ri % 2 === 1;
        const xs = odd ? [200, 360, 520] : [120, 280, 440, 600];
        for (const cx of xs) {
          peg(cx, y - 28); peg(cx - 28, y); peg(cx + 28, y); peg(cx, y + 28);
        }
        const singles = odd ? [120, 280, 440, 600] : [200, 360, 520];
        for (const sx of singles) peg(sx, y);
        if (odd) { peg(L + 16, y); peg(R - 16, y); }
      });
      gridRow(10);
      break;
    }
    case 'bumpers': {
      const bumps: Array<[number, number]> = [[200, 510], [520, 510], [360, 690]];
      if (tier >= 1) bumps.push([360, 390]);
      const near = (x: number, y: number) => bumps.some(([bx, by]) => Math.hypot(x - bx, y - by) < BUMP_R + 46);
      for (let r = 0; r < ROWS; r++) gridRow(r, near);
      for (const [x, y] of bumps) peg(x, y, 'bump');
      break;
    }
    case 'sliders': {
      const barRows = tier >= 1 ? [2, 5, 8] : [3, 7];
      for (let r = 0; r < ROWS; r++) if (!barRows.includes(r)) gridRow(r);
      barRows.forEach((r, k) => {
        const x0 = 360;
        bars.push({ id: k, x0, y: PEG_TOP + r * ROW_H, half: 58, amp: 215, speed: 1.0 + k * 0.25 + tier * 0.2, phase: k * 2.1 + rand() * 0.6, x: x0, vx: 0 });
      });
      break;
    }
    case 'spinner': {
      for (const r of [0, 1, 2]) gridRow(r);
      for (const r of [8, 9, 10]) gridRow(r);
      const w = 1.7 + tier * 0.3;
      spinners.push({ id: 0, x: 360, y: 600, len: 105, angle: 0, omega: w });
      spinners.push({ id: 1, x: 145, y: 590, len: 62, angle: 0.4, omega: -w * 1.3 });
      spinners.push({ id: 2, x: 575, y: 590, len: 62, angle: 0.9, omega: -w * 1.3 });
      // side pegs keep balls from sliding down the walls untouched
      for (const y of [500, 680]) { peg(L + 24, y); peg(R - 24, y); }
      peg(260, 720); peg(460, 720);
      break;
    }
    case 'waves':
      for (let r = 0; r < ROWS; r++) {
        const moving = r % 3 === 2;
        gridRow(r, undefined, moving ? { amp: 30, speed: 1.8 + tier * 0.3, phase: r * 1.3 } : undefined);
      }
      break;
    case 'funnel': {
      for (const r of [0, 1, 2, 3]) gridRow(r);
      // three V funnels over slots 1, 4 and 7
      for (const cx of [L + SLOT_W * 1.5, L + SLOT_W * 4.5, L + SLOT_W * 7.5]) {
        for (let k = 0; k < 5; k++) {
          const f = k / 4;
          const dx = 82 - f * 54, y = 560 + f * 140;
          peg(cx - dx, y); peg(cx + dx, y);
        }
      }
      // scatter rows below
      for (const y of [790, 850]) {
        const off = y === 790 ? 0 : 40;
        for (let x = L + 40 + off; x < R - 20; x += 80) peg(x, y);
      }
      gridRow(10);
      break;
    }
  }
  return { pegs, bars, spinners };
}

// ------------------------------------------------------------------ round

const ballR = (k: BallKind) => (k === 'heavy' ? HEAVY_R : k === 'shard' ? SHARD_R : BALL_R);

export class Round {
  pegs: Peg[];
  bars: Bar[];
  spinners: Spinner[];
  slots: Slot[];
  balls: Ball[] = [];
  queue: BallKind[];
  events: SimEvent[] = [];
  score = 0;
  stars = 0;
  streak = 0;
  goldLeft = 0;
  gateSlot = -1;
  gateDir = 1;
  gateT = 0;
  t = 0;
  dropped = 0;
  private nextId = 1;

  constructor(readonly cfg: BoardConfig, private rand: Rand = Math.random) {
    const lay = buildLayout(cfg.kind, cfg.tier, rand);
    this.pegs = lay.pegs; this.bars = lay.bars; this.spinners = lay.spinners;
    this.slots = makeSlots(cfg, rand);
    this.queue = cfg.queue.slice();
    // gold pegs: plain, still pegs spread over the field
    const plain = shuffle(rand, this.pegs.filter((p) => p.kind === 'n' && p.amp === 0 && p.y < 880));
    for (const p of plain.slice(0, cfg.golds)) { p.kind = 'gold'; p.r = GOLD_R; }
    this.goldLeft = Math.min(cfg.golds, plain.length);
    this.gateSlot = cfg.n >= 2 ? Math.floor(rand() * SLOTS) : -1;
  }

  get ballsLeft(): number { return this.queue.length; }
  get done(): boolean { return this.queue.length === 0 && this.balls.length === 0; }

  drop(x: number): Ball | null {
    const kind = this.queue.shift();
    if (!kind) return null;
    const r = ballR(kind);
    const b: Ball = {
      id: this.nextId++, x: x + (this.rand() - 0.5) * 4, y: DROP_Y, vx: 0, vy: 40, r, kind,
      smash: kind === 'heavy' ? 3 : 0, ghost: kind === 'ghost', lastSpin: -1, landed: false,
      cx: x, cy: DROP_Y, ct: this.t, freed: 0, pass: 0,
    };
    this.balls.push(b);
    this.dropped++;
    return b;
  }

  private gain(pts: number): void {
    const before = this.score;
    this.score += pts;
    const g = this.cfg.goal;
    for (let s = 0; s < 3; s++) {
      const need = Math.round(g * STAR_AT[s]);
      if (before < need && this.score >= need) {
        this.stars = s + 1;
        this.events.push(s === 0 ? { t: 'goal' } : { t: 'star', n: s + 1 });
      }
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (const p of this.pegs) {
      if (!p.amp) continue;
      const nx = p.x0 + Math.sin(this.t * p.speed + p.phase) * p.amp;
      p.vx = (nx - p.x) / Math.max(dt, 0.001);
      p.x = nx;
    }
    for (const bar of this.bars) {
      const nx = bar.x0 + Math.sin(this.t * bar.speed + bar.phase) * bar.amp;
      bar.vx = (nx - bar.x) / Math.max(dt, 0.001);
      bar.x = nx;
    }
    for (const s of this.spinners) s.angle += s.omega * dt;
    if (this.gateSlot >= 0) {
      this.gateT += dt;
      if (this.gateT >= this.cfg.gateEvery) {
        this.gateT = 0;
        if (this.gateSlot + this.gateDir < 0 || this.gateSlot + this.gateDir >= SLOTS) this.gateDir *= -1;
        this.gateSlot += this.gateDir;
        this.events.push({ t: 'gate', i: this.gateSlot });
      }
    }

    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (let i = 0; i < this.balls.length; i++) this.stepBall(this.balls[i], h);
      this.ballVsBall();
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      // a ball that barely moved for 0.6 s is wedged: kick it, and let it slip through if that fails
      if (b.pass > 0) b.pass -= dt;
      if (this.t - b.ct >= 0.6) {
        if (Math.hypot(b.x - b.cx, b.y - b.cy) < 14) {
          b.freed++;
          b.vx = (this.rand() < 0.5 ? -1 : 1) * 190; b.vy = -140;
          if (b.freed >= 2) b.pass = 0.3;
        }
        b.cx = b.x; b.cy = b.y; b.ct = this.t;
      }
      if (b.y >= FLOOR - b.r - 2) {
        this.balls.splice(i, 1);
        b.landed = true;
        this.land(b);
      }
    }
  }

  private ballVsBall(): void {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (a.ghost || b.ghost) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0 && d < min) {
        const ma = a.r * a.r, mb = b.r * b.r, wa = mb / (ma + mb), wb = ma / (ma + mb);
        const nx = dx / d, ny = dy / d, o = min - d;
        a.x -= nx * o * wa; a.y -= ny * o * wa; b.x += nx * o * wb; b.y += ny * o * wb;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j2 = 1.8 * vn;
          a.vx += j2 * nx * wa; a.vy += j2 * ny * wa; b.vx -= j2 * nx * wb; b.vy -= j2 * ny * wb;
        }
      }
    }
  }

  /** Circle contact against a (possibly moving) point obstacle. Returns true on an approaching hit. */
  private contact(b: Ball, cx: number, cy: number, cr: number, rest: number, kick = 0, ovx = 0, ovy = 0, resolve = true): boolean {
    const dx = b.x - cx, dy = b.y - cy;
    const min = b.r + cr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) return false;
    if (!resolve) return true;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = cx + nx * min; b.y = cy + ny * min;
    const rvx = b.vx - ovx, rvy = b.vy - ovy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
      // a little random spin keeps balls from balancing on a peg
      const spin = b.kind === 'heavy' ? 6 : 18;
      b.vx += (this.rand() * 2 - 1) * spin;
      if (kick > 0) { b.vx += nx * kick; b.vy += ny * kick; }
      return true;
    }
    return false;
  }

  private stepBall(b: Ball, dt: number): void {
    if (b.landed) return;
    b.vy += GRAV * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < L + b.r) { b.x = L + b.r; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > R - b.r) { b.x = R - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.ghost) {
      if (b.y < GHOST_Y) return;
      b.ghost = false;
      this.events.push({ t: 'solid', b });
    }
    if (b.pass > 0) return;
    const heavy = b.kind === 'heavy';
    const rest = heavy ? 0.15 : 0.32;
    for (const p of this.pegs) {
      if (!p.alive || Math.abs(p.y - b.y) > 50) continue;
      if (p.kind === 'bump') {
        if (this.contact(b, p.x, p.y, p.r, 0.9, 280)) {
          this.gain(3);
          this.events.push({ t: 'bump', b, p, pts: 3 });
          this.trySplit(b);
        }
        continue;
      }
      if (heavy && b.smash > 0 && this.contact(b, p.x, p.y, p.r, 0, 0, 0, 0, false)) {
        // the heavy ball crashes straight through its first pegs
        b.smash--;
        p.alive = false;
        b.vy *= 0.85;
        if (p.kind === 'gold') this.collectGold(b, p);
        this.gain(5);
        this.events.push({ t: 'smash', b, p, pts: 5 });
        continue;
      }
      if (this.contact(b, p.x, p.y, p.r, rest, 0, p.vx)) {
        if (p.kind === 'gold') { this.collectGold(b, p); p.kind = 'n'; p.r = PEG_R; }
        else this.events.push({ t: 'peg', b, p });
        this.trySplit(b);
      }
    }
    for (const bar of this.bars) {
      if (Math.abs(bar.y - b.y) > 40) continue;
      const cx = Math.max(bar.x - bar.half, Math.min(bar.x + bar.half, b.x));
      if (this.contact(b, cx, bar.y, BAR_R, 0.55, 0, bar.vx)) {
        b.vx += bar.vx * 0.5;
        this.events.push({ t: 'bar', b, bar });
        this.trySplit(b);
      }
    }
    for (const s of this.spinners) {
      if (Math.abs(s.y - b.y) > s.len + 30 || Math.abs(s.x - b.x) > s.len + 30) continue;
      for (let arm = 0; arm < 2; arm++) {
        const a = s.angle + arm * Math.PI / 2;
        const ux = Math.cos(a), uy = Math.sin(a);
        const proj = Math.max(-s.len, Math.min(s.len, (b.x - s.x) * ux + (b.y - s.y) * uy));
        const px = s.x + ux * proj, py = s.y + uy * proj;
        const ovx = -s.omega * (py - s.y), ovy = s.omega * (px - s.x);
        if (this.contact(b, px, py, SPIN_R, 0.6, 0, ovx, ovy)) {
          let pts = 0;
          if (this.t - b.lastSpin > 0.25) { pts = 2; this.gain(pts); b.lastSpin = this.t; }
          this.events.push({ t: 'spin', b, s, pts });
          this.trySplit(b);
        }
      }
    }
    if (b.y > DIV_TOP - b.r - 6) {
      for (let i = 1; i < SLOTS; i++) {
        const dx = L + i * SLOT_W;
        if (Math.abs(b.x - dx) > b.r + 6) continue;
        this.contact(b, dx, Math.max(DIV_TOP, Math.min(FLOOR, b.y)), 4, 0.35);
      }
    }
  }

  private collectGold(b: Ball, p: Peg): void {
    this.goldLeft--;
    this.gain(10);
    this.events.push({ t: 'gold', b, p, pts: 10 });
    if (this.goldLeft === 0) {
      const pts = 100 + this.cfg.n * 20;
      this.gain(pts);
      this.events.push({ t: 'allGold', pts });
    }
  }

  private trySplit(b: Ball): void {
    if (b.kind !== 'split') return;
    b.kind = 'shard';
    b.r = SHARD_R;
    const kids: Ball[] = [];
    for (const dir of [-1, 1]) {
      const k: Ball = {
        id: this.nextId++, x: b.x + dir * 8, y: b.y - 4, vx: b.vx + dir * 230, vy: Math.min(b.vy, 0) - 120,
        r: SHARD_R, kind: 'shard', smash: 0, ghost: false, lastSpin: -1, landed: false,
        cx: b.x, cy: b.y, ct: this.t, freed: 0, pass: 0,
      };
      kids.push(k);
      this.balls.push(k);
    }
    this.events.push({ t: 'split', b, kids });
  }

  private land(b: Ball): void {
    const i = Math.max(0, Math.min(SLOTS - 1, Math.floor((b.x - L) / SLOT_W)));
    const slot = this.slots[i];
    if (slot.kind === 'ball') {
      // the extra-ball pocket pays once, then it is a plain 10 pocket
      this.slots[i] = { kind: 'pts', value: 10 };
      this.queue.push('normal');
      this.events.push({ t: 'extra', b, i });
      return;
    }
    const gate = i === this.gateSlot ? this.cfg.gateMult : 1;
    if (slot.kind === 'zero') {
      this.streak = 0;
      this.events.push({ t: 'land', b, i, slot, pts: 0, gate: 1, combo: 1, jackpot: false });
      return;
    }
    const hot = slot.value >= 50 || gate > 1;
    this.streak = hot ? this.streak + 1 : 0;
    const combo = COMBO[Math.min(this.streak, COMBO.length - 1)];
    const mult = b.kind === 'gold' ? 2 : 1;
    const pts = Math.round(slot.value * mult * gate * combo);
    const jackpot = slot.value === 100 && pts >= 200;
    this.gain(pts);
    this.events.push({ t: 'land', b, i, slot, pts, gate, combo, jackpot });
  }

  /** Board bonus for the stars earned. */
  bonus(): number {
    return Math.round(([0, 60, 140, 260][this.stars] * (1 + (this.cfg.n - 1) * 0.25)) / 10) * 10;
  }
}
