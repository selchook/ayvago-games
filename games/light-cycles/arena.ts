// Light-cycle arena: a grid of cells, two cycles that move one cell per tick and leave a trail.
export const COLS = 34;
export const ROWS = 50;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const WALL = 3;

export interface Cycle { x: number; y: number; d: number; alive: boolean; q: number[] }

const SPAWN = [{ x: 8, y: ROWS - 9, d: 0 }, { x: COLS - 9, y: 8, d: 2 }];

/** Point-symmetric blocks (so neither side gets a better start), cells marked as walls. */
export function makeObstacles(rand: () => number, count: number): number[] {
  const out = new Set<number>();
  for (let k = 0; k < count; k++) {
    const horiz = rand() < 0.5;
    const w = horiz ? 3 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 2);
    const h = horiz ? 1 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 4);
    const x = 3 + Math.floor(rand() * (COLS - 6 - w));
    const y = 14 + Math.floor(rand() * (ROWS / 2 - 16 - h));
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      out.add(yy * COLS + xx);
      out.add((ROWS - 1 - yy) * COLS + (COLS - 1 - xx));
    }
  }
  // keep the spawn lanes clear
  for (const s of SPAWN) for (let k = -2; k <= 6; k++) out.delete((s.y + DY[s.d] * k) * COLS + s.x);
  return [...out];
}

export class Arena {
  grid = new Uint8Array(COLS * ROWS);
  cycles: Cycle[] = [];

  /** swap: cycle 0 takes the top spawn. */
  reset(swap: boolean, walls: number[]): void {
    this.grid.fill(0);
    for (const w of walls) this.grid[w] = WALL;
    const a = SPAWN[swap ? 1 : 0], b = SPAWN[swap ? 0 : 1];
    this.cycles = [
      { x: a.x, y: a.y, d: a.d, alive: true, q: [] },
      { x: b.x, y: b.y, d: b.d, alive: true, q: [] },
    ];
    this.cycles.forEach((c, k) => { this.grid[c.y * COLS + c.x] = k + 1; });
  }

  free(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS && this.grid[y * COLS + x] === 0;
  }

  /** Queues a turn (absolute direction); reversals and repeats are ignored. */
  turn(k: number, d: number): void {
    const c = this.cycles[k];
    if (!c || !c.alive) return;
    const last = c.q.length ? c.q[c.q.length - 1] : c.d;
    if (d === last || d === (last + 2) % 4 || c.q.length >= 3) return;
    c.q.push(d);
  }

  /** One tick for both cycles; returns which crashed this tick. */
  step(): boolean[] {
    const next = this.cycles.map((c) => {
      if (c.q.length) c.d = c.q.shift()!;
      return { x: c.x + DX[c.d], y: c.y + DY[c.d] };
    });
    const crash = this.cycles.map((c, k) => c.alive && !this.free(next[k].x, next[k].y));
    if (next[0].x === next[1].x && next[0].y === next[1].y) { crash[0] = true; crash[1] = true; }
    this.cycles.forEach((c, k) => {
      if (!c.alive) return;
      if (crash[k]) { c.alive = false; return; }
      c.x = next[k].x; c.y = next[k].y;
      this.grid[c.y * COLS + c.x] = k + 1;
    });
    return crash;
  }
}

// ------------------------------------------------------------------ AI

const queue = new Int32Array(COLS * ROWS);
const seen = new Int32Array(COLS * ROWS);
let stamp = 1;

/** Free cells reachable from (x, y) (which itself must be free), up to cap. */
function flood(grid: Uint8Array, x: number, y: number, cap: number): number {
  stamp++;
  let head = 0, tail = 0, n = 0;
  const s = y * COLS + x;
  queue[tail++] = s; seen[s] = stamp;
  while (head < tail && n < cap) {
    const i = queue[head++];
    n++;
    const cx = i % COLS, cy = (i / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (grid[j] || seen[j] === stamp) continue;
      seen[j] = stamp;
      queue[tail++] = j;
    }
  }
  return n;
}

const distA = new Int32Array(COLS * ROWS);
const distB = new Int32Array(COLS * ROWS);

function bfs(grid: Uint8Array, sx: number, sy: number, dist: Int32Array): void {
  dist.fill(1 << 20);
  let head = 0, tail = 0;
  const s = sy * COLS + sx;
  dist[s] = 0; queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const cx = i % COLS, cy = (i / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (grid[j] || dist[j] <= dist[i] + 1) continue;
      dist[j] = dist[i] + 1;
      queue[tail++] = j;
    }
  }
}

/** Cells closer to a than to b, minus the reverse (territory balance). */
function voronoi(grid: Uint8Array, ax: number, ay: number, bx: number, by: number): number {
  bfs(grid, ax, ay, distA);
  bfs(grid, bx, by, distB);
  let s = 0;
  for (let i = 0; i < COLS * ROWS; i++) {
    if (grid[i]) continue;
    if (distA[i] < distB[i]) s++; else if (distB[i] < distA[i]) s--;
  }
  return s;
}

function run(a: Arena, x: number, y: number, d: number, max: number): number {
  let n = 0;
  while (n < max && a.free(x + DX[d] * (n + 1), y + DY[d] * (n + 1))) n++;
  return n;
}

/** True when the last voronoi() found no path between the two cycles. */
function separated(ox: number, oy: number): boolean {
  return neighboursUnreached(ox, oy);
}

function neighboursUnreached(ox: number, oy: number): boolean {
  for (let d = 0; d < 4; d++) {
    const x = ox + DX[d], y = oy + DY[d];
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
    if (distA[y * COLS + x] < 1 << 20) return false;
  }
  return true;
}

/** Rival brains: 0 reflexes only … 4 territory fights and tight space filling. */
export function aiDir(a: Arena, me: number, level: number): number {
  const c = a.cycles[me], o = a.cycles[1 - me];
  const opts = [c.d, (c.d + 3) % 4, (c.d + 1) % 4];
  const safe = opts.filter((d) => a.free(c.x + DX[d], c.y + DY[d]));
  if (!safe.length) return c.d;
  const pickRand = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
  if (level <= 0) {
    if (Math.random() < 0.1) return pickRand(opts);              // the rookie sometimes misjudges
    if (safe.includes(c.d) && Math.random() > 0.05) return c.d;
    return pickRand(safe);
  }
  if (level === 1) {
    if (Math.random() < 0.04) return pickRand(safe);
    let best = safe[0], bv = -1;
    for (const d of safe) { const v = run(a, c.x, c.y, d, 12) + (d === c.d ? 0.5 : 0) + Math.random() * 0.3; if (v > bv) { bv = v; best = d; } }
    return best;
  }
  const g = a.grid;
  const areas = safe.map((d) => {
    const nx = c.x + DX[d], ny = c.y + DY[d];
    return flood(g, nx, ny, 1200);
  });
  const maxArea = Math.max(...areas);
  // a head-on into the rival's next square is a coin flip at best
  const danger = (d: number) => {
    const nx = c.x + DX[d], ny = c.y + DY[d];
    return o.alive && Math.abs(nx - o.x) + Math.abs(ny - o.y) === 1 ? 1 : 0;
  };
  if (level === 2) {
    let best = safe[0], bv = -1e9;
    safe.forEach((d, k) => { const v = areas[k] + (d === c.d ? 0.5 : 0) - danger(d) * 30 + Math.random() * 0.2; if (v > bv) { bv = v; best = d; } });
    return best;
  }
  // levels 3-4: stay out of small pockets, then fight for territory
  const roomy = safe.filter((_, k) => areas[k] >= maxArea * 0.85);
  if (!o.alive) return roomy[0];
  let best = roomy[0], bv = -1e9;
  for (const d of roomy) {
    const nx = c.x + DX[d], ny = c.y + DY[d];
    g[ny * COLS + nx] = 9;
    let v = voronoi(g, nx, ny, o.x, o.y);
    // the champion: once the rivals are walled apart, fill the own space tightly (hug walls)
    if (level >= 4 && separated(o.x, o.y)) {
      let walls = 0;
      for (let e = 0; e < 4; e++) if (!a.free(nx + DX[e], ny + DY[e])) walls++;
      v = flood(g, nx, ny, 1200) * 10 + walls * 3;
      // look one step further: the best area after the next move
      let ahead = 0;
      for (let e = 0; e < 4; e++) {
        const mx = nx + DX[e], my = ny + DY[e];
        if (a.free(mx, my)) ahead = Math.max(ahead, flood(g, mx, my, 1200));
      }
      v += ahead * 10;
    }
    g[ny * COLS + nx] = 0;
    v += (d === c.d ? 0.5 : 0) - danger(d) * (level >= 4 ? 60 : 40) + Math.random() * 0.2;
    if (v > bv) { bv = v; best = d; }
  }
  return best;
}
