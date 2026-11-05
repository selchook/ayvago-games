// Pure game rules for Tito's Tank: terrain, the shell's flight, craters and the AI's aim.
// Everything here is deterministic for the same inputs, so both screens of an online match
// compute the same flight from the shooter's angle and power.

export const WORLD_W = 3000;
export const GROUND_MAX = 708;          // the deepest a crater can dig (screen is 720 tall)
export const GRAVITY = 0.15;            // px per step², one step = 1/60 s
export const POWER_K = 0.245;           // launch speed per power point
export const BLAST = 36;                // crater radius
export const KILL = 40;                 // a tank this close to the impact is destroyed
export const TANK_HIT = 26;             // a shell this close to a tank's middle hits it directly
export const BARREL = 46;               // pivot -> muzzle
export const PIVOT = 38;                // ground -> turret pivot (in the tank's own frame)
export const PAD = 42;                  // how far a tank may drive from its start

export interface Level { amp: number; sep: [number, number] }
/** Rounds get rougher and the tanks start further apart. */
export const LEVELS: Level[] = [
  { amp: 0.18, sep: [560, 640] },
  { amp: 0.42, sep: [820, 960] },
  { amp: 0.66, sep: [1120, 1320] },
  { amp: 0.84, sep: [1450, 1700] },
  { amp: 1.0, sep: [1800, 2200] },
];

export type Rand = () => number;

export interface TreeSpec { x: number; kind: 0 | 1; size: number }
export interface Round { heights: Float32Array; x: [number, number]; trees: TreeSpec[] }

/** Rolling hills from a few sine waves, two flat pads where the tanks start, trees in between. */
export function makeRound(r: Rand, round: number): Round {
  const lv = LEVELS[Math.min(round, LEVELS.length - 1)];
  const h = new Float32Array(WORLD_W + 1);
  const base = 470;
  const a1 = (80 + r() * 60) * lv.amp, a2 = (40 + r() * 30) * lv.amp, a3 = (14 + r() * 14) * lv.amp;
  const f1 = 0.003 + r() * 0.003, f2 = 0.008 + r() * 0.005, f3 = 0.02 + r() * 0.012;
  const o = r() * 1000;
  for (let x = 0; x <= WORLD_W; x++) {
    const y = base + Math.sin((x + o) * f1) * a1 + Math.sin((x + o) * f2) * a2 + Math.sin((x + o) * f3) * a3;
    h[x] = Math.max(230, Math.min(640, y));
  }
  const sep = lv.sep[0] + Math.floor(r() * (lv.sep[1] - lv.sep[0]));
  const x0 = Math.floor(WORLD_W / 2 - sep / 2), x1 = Math.floor(WORLD_W / 2 + sep / 2);
  for (const cx of [x0, x1]) flatten(h, cx, PAD + 34);
  const trees: TreeSpec[] = [];
  const n = 26 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    const x = 60 + r() * (WORLD_W - 120);
    const kind = r() < 0.55 ? 0 : 1;
    const size = 0.7 + r() * 0.6;
    if (Math.abs(x - x0) < PAD + 60 || Math.abs(x - x1) < PAD + 60) continue;
    trees.push({ x: Math.round(x), kind, size });
  }
  trees.sort((a, b) => a.size - b.size);
  return { heights: h, x: [x0, x1], trees };
}

/** Levels the ground around cx to a pad, blending into the hills at its edges. */
function flatten(h: Float32Array, cx: number, half: number): void {
  const y = h[cx];
  for (let x = Math.max(0, cx - half - 40); x <= Math.min(WORLD_W, cx + half + 40); x++) {
    const d = Math.abs(x - cx);
    const k = d <= half ? 1 : 1 - (d - half) / 40;
    h[x] = h[x] * (1 - k) + y * k;
  }
}

export function groundAt(h: Float32Array, x: number): number {
  const i = Math.max(0, Math.min(WORLD_W, Math.round(x)));
  return h[i];
}

/** Where a tank rests: the highest ground under its treads, and its tilt. */
export function tankPose(h: Float32Array, x: number): { y: number; rot: number } {
  const l = groundAt(h, x - 22), r = groundAt(h, x + 22), m = groundAt(h, x);
  return { y: Math.min(m, (l + r) / 2 + 2), rot: Math.atan2(r - l, 44) * 0.85 };
}

/** The muzzle of a tank at x aiming at angle deg (0 = right, 90 = up). */
export function muzzle(h: Float32Array, x: number, deg: number): { x: number; y: number } {
  const { y, rot } = tankPose(h, x);
  const px = x + PIVOT * Math.sin(rot), py = y - PIVOT * Math.cos(rot);
  const a = (deg * Math.PI) / 180;
  return { x: px + Math.cos(a) * BARREL, y: py - Math.sin(a) * BARREL };
}

export type Outcome = 'ground' | 'tank' | 'out';
export interface Shot { path: Float32Array; x: number; y: number; kind: Outcome; kill: number | null; steps: number }

/**
 * Flies a shell from the muzzle until it lands, hits a tank or leaves the world. `tanks` are the
 * x positions of both tanks; `kill` is the index of the tank the blast destroys (the closer one if
 * both are in reach), or null.
 */
export function fly(h: Float32Array, tanks: number[], shooterX: number, deg: number, power: number, wind: number): Shot {
  const m = muzzle(h, shooterX, deg);
  const a = (deg * Math.PI) / 180;
  const v = power * POWER_K;
  let x = m.x, y = m.y, vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
  const pts: number[] = [x, y];
  const mids = tanks.map((tx) => ({ x: tx, y: tankPose(h, tx).y - 16 }));
  let kind: Outcome = 'out';
  for (let i = 0; i < 4000; i++) {
    vx += wind; vy += GRAVITY;
    x += vx; y += vy;
    pts.push(x, y);
    if (x < -150 || x > WORLD_W + 150 || y > 760) { kind = 'out'; break; }
    // a direct hit on a tank body (not the shooter's own barrel in the first few steps)
    let hitTank = false;
    for (const t of mids) {
      if (i < 4 && t.x === shooterX) continue;
      if (Math.hypot(x - t.x, y - t.y) < TANK_HIT) { hitTank = true; break; }
    }
    if (hitTank) { kind = 'tank'; break; }
    if (x >= 0 && x <= WORLD_W && y >= groundAt(h, x)) { y = groundAt(h, x); pts[pts.length - 1] = y; kind = 'ground'; break; }
  }
  let kill: number | null = null;
  if (kind !== 'out') {
    let best = KILL;
    mids.forEach((t, i) => {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d < best) { best = d; kill = i; }
    });
  }
  return { path: Float32Array.from(pts), x, y, kind, kill, steps: pts.length / 2 };
}

/** Digs a crater at (cx, cy). Returns the columns it changed. */
export function crater(h: Float32Array, cx: number, cy: number, r = BLAST): [number, number] {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(WORLD_W, Math.ceil(cx + r));
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const depth = Math.sqrt(Math.max(0, r * r - dx * dx));
    const bottom = Math.min(GROUND_MAX, cy + depth * 0.72);
    if (h[x] < bottom) h[x] = bottom;
  }
  return [x0, x1];
}

/**
 * The computer's shot: searches angles and powers for the one that lands nearest the target
 * (never one that would hurt itself), then misses by an error that shrinks with skill.
 */
export function aiAim(h: Float32Array, tanks: number[], me: 0 | 1, wind: number, skill: number, r: Rand): { deg: number; power: number } {
  const target = tanks[1 - me], self = tanks[me];
  const dir = target > self ? 1 : -1;
  let best = { deg: dir > 0 ? 45 : 135, power: 60, err: Infinity };
  const lob = r() < 0.35;                       // sometimes a high lob, sometimes a flat shot
  for (let e = 15; e <= 80; e += 2.5) {
    const deg = dir > 0 ? e : 180 - e;
    for (let p = 18; p <= 100; p += 2) {
      const s = fly(h, tanks, self, deg, p, wind);
      if (s.kind === 'out') continue;
      if (Math.hypot(s.x - self, s.y - groundAt(h, self)) < KILL + 30) continue;
      let err = Math.abs(s.x - target);
      if (s.kill === 1 - me) err = 0;
      err += (lob ? (80 - e) : e) * 0.15;       // a light preference for the chosen arc
      if (err < best.err) best = { deg, power: p, err };
    }
  }
  // skill 0 = wild, 1 = sharp
  const spread = 1 - Math.max(0, Math.min(1, skill));
  const dDeg = (r() - 0.5) * 2 * (1 + spread * 7);
  const dPow = (r() - 0.5) * 2 * (1 + spread * 12);
  return {
    deg: Math.max(5, Math.min(175, best.deg + dDeg)),
    power: Math.max(12, Math.min(100, best.power + dPow)),
  };
}
