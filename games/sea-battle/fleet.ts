// Sea Battle rules: a 10x10 sea, a fleet of 5-4-3-3-2, shots resolved by the fleet's owner.
export const N = 10;
export const FLEET = [5, 4, 3, 3, 2];

export interface Ship { len: number; x: number; y: number; h: boolean; hits: number }

export function cellsOf(s: { len: number; x: number; y: number; h: boolean }): number[] {
  const out: number[] = [];
  for (let k = 0; k < s.len; k++) out.push((s.y + (s.h ? 0 : k)) * N + s.x + (s.h ? k : 0));
  return out;
}

export function inBounds(len: number, x: number, y: number, h: boolean): boolean {
  return x >= 0 && y >= 0 && (h ? x + len <= N && y < N : y + len <= N && x < N);
}

/** Ship `idx` fits at (x, y, h): inside the sea and not overlapping the others. */
export function fits(ships: Ship[], idx: number, x: number, y: number, h: boolean, noTouch = false): boolean {
  const len = ships[idx].len;
  if (!inBounds(len, x, y, h)) return false;
  const mine = cellsOf({ len, x, y, h });
  const taken = new Set<number>();
  ships.forEach((s, k) => {
    if (k === idx) return;
    for (const c of cellsOf(s)) {
      taken.add(c);
      if (noTouch) {
        const cx = c % N, cy = Math.floor(c / N);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && yy >= 0 && xx < N && yy < N) taken.add(yy * N + xx);
        }
      }
    }
  });
  return mine.every((c) => !taken.has(c));
}

/** A random fleet; ships don't touch when that is possible. */
export function randomFleet(rand: () => number = Math.random): Ship[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const noTouch = attempt < 150;
    const ships: Ship[] = [];
    let ok = true;
    for (const len of FLEET) {
      ships.push({ len, x: -10, y: -10, h: true, hits: 0 });
      const idx = ships.length - 1;
      let placed = false;
      for (let k = 0; k < 300 && !placed; k++) {
        const h = rand() < 0.5;
        const x = Math.floor(rand() * N), y = Math.floor(rand() * N);
        if (fits(ships, idx, x, y, h, noTouch)) { Object.assign(ships[idx], { x, y, h }); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return FLEET.map((len, k) => ({ len, x: 0, y: k * 2, h: true, hits: 0 }));
}

/** Occupancy grid: ship index + 1 per cell. */
export function occupancy(ships: Ship[]): Int8Array<ArrayBuffer> {
  const g = new Int8Array(N * N);
  ships.forEach((s, k) => cellsOf(s).forEach((c) => { g[c] = k + 1; }));
  return g;
}

export interface ShotResult { r: 0 | 1 | 2; cells?: number[]; len?: number; all: boolean }

/** The defender's answer to a shot at cell i (mutates hits and the shot grid). */
export function resolve(ships: Ship[], occ: Int8Array, shots: Int8Array, i: number): ShotResult {
  shots[i] = 1;
  const k = occ[i];
  if (!k) return { r: 0, all: false };
  const s = ships[k - 1];
  s.hits++;
  const all = ships.every((x) => x.hits >= x.len);
  if (s.hits >= s.len) return { r: 2, cells: cellsOf(s), len: s.len, all };
  return { r: 1, all };
}

// ------------------------------------------------------------------ AI gunner
// knowledge per cell: 0 unknown, 1 miss, 2 hit (ship still afloat), 3 sunk

export interface Gunner { level: number; know: Int8Array; left: number[] }

export function newGunner(level: number): Gunner {
  return { level, know: new Int8Array(N * N), left: [...FLEET] };
}

export function learn(g: Gunner, i: number, res: ShotResult): void {
  if (res.r === 0) g.know[i] = 1;
  else if (res.r === 1) g.know[i] = 2;
  else {
    for (const c of res.cells ?? [i]) g.know[c] = 3;
    const k = g.left.indexOf(res.len ?? 0);
    if (k >= 0) g.left.splice(k, 1);
  }
}

const neighbours = (i: number): number[] => {
  const x = i % N, y = Math.floor(i / N), out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < N - 1) out.push(i + 1);
  if (y > 0) out.push(i - N);
  if (y < N - 1) out.push(i + N);
  return out;
};

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function density(g: Gunner): Float64Array {
  const d = new Float64Array(N * N);
  const hits = [];
  for (let i = 0; i < N * N; i++) if (g.know[i] === 2) hits.push(i);
  const target = hits.length > 0;
  for (const len of g.left) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const h of [true, false]) {
      if (!inBounds(len, x, y, h)) continue;
      const cells = cellsOf({ len, x, y, h });
      let covered = 0, bad = false;
      for (const c of cells) {
        const k = g.know[c];
        if (k === 1 || k === 3) { bad = true; break; }
        if (k === 2) covered++;
      }
      if (bad || (target && !covered)) continue;
      const w = target ? Math.pow(8, covered) : 1;
      for (const c of cells) if (!g.know[c]) d[c] += w;
    }
  }
  return d;
}

/** Next cell to shoot at. */
export function aim(g: Gunner): number {
  const unknown: number[] = [];
  for (let i = 0; i < N * N; i++) if (!g.know[i]) unknown.push(i);
  if (!unknown.length) return -1;
  const hits: number[] = [];
  for (let i = 0; i < N * N; i++) if (g.know[i] === 2) hits.push(i);
  const lv = g.level;

  if (lv >= 3) {
    const d = density(g);
    // the admiral also prefers a checkerboard while hunting
    const minLen = Math.min(...g.left);
    let best = -1, bv = -1;
    for (const i of unknown) {
      let v = d[i] + Math.random() * (lv >= 4 ? 0.01 : 0.5);
      if (lv >= 4 && !hits.length && ((i % N) + Math.floor(i / N)) % minLen !== 0) v *= 0.6;
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  }
  if (hits.length && (lv >= 1 || Math.random() < 0.5)) {
    // line through two or more hits: extend it
    if (lv >= 1) {
      for (const a of hits) for (const b of hits) {
        if (a === b) continue;
        const horiz = Math.floor(a / N) === Math.floor(b / N) && Math.abs(a - b) === 1;
        const vert = Math.abs(a - b) === N;
        if (!horiz && !vert) continue;
        const step = horiz ? 1 : N;
        const opts: number[] = [];
        for (const dir of [1, -1]) {
          let c = a;
          while (g.know[c] === 2) {
            const nx = c + step * dir;
            if (horiz && Math.floor(nx / N) !== Math.floor(c / N)) break;
            if (nx < 0 || nx >= N * N) break;
            c = nx;
          }
          if (c !== a && !g.know[c] && (!horiz || Math.floor(c / N) === Math.floor(a / N))) opts.push(c);
        }
        if (opts.length) return pick(opts);
      }
    }
    const opts = hits.flatMap(neighbours).filter((c) => !g.know[c]);
    if (opts.length) return pick(opts);
  }
  if (lv >= 2) {
    const minLen = Math.min(...g.left);
    const par = unknown.filter((i) => ((i % N) + Math.floor(i / N)) % minLen === 0);
    if (par.length) return pick(par);
  }
  return pick(unknown);
}
