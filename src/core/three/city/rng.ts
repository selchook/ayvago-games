// City generator: seeded random numbers and smooth noise. Pure functions, no three.js, so the
// layout runs headless in Node (tests, bots) and gives the same city for the same seed.

export interface Rng {
  (): number;
  /** Integer in [a, b]. */
  int(a: number, b: number): number;
  /** Float in [a, b). */
  range(a: number, b: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  /** An independent stream derived from this one and a salt (stable whatever else is drawn). */
  fork(salt: number): Rng;
}

/** Mulberry32: small, fast and good enough for layout. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  next.fork = (salt) => rng(hash32(seed, salt));
  return next;
}

/** Integer hash of a few integers (stable across runs and engines). */
export function hash32(...ns: number[]): number {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Hash to [0, 1). */
export const hash01 = (...ns: number[]): number => hash32(...ns) / 4294967296;

/** Smooth value noise in [0, 1] (cell size 1). */
export function noise2(seed: number, x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash01(seed, xi, zi), b = hash01(seed, xi + 1, zi);
  const c = hash01(seed, xi, zi + 1), d = hash01(seed, xi + 1, zi + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
}

/** Fractal noise in [0, 1]: `oct` octaves of noise2 at scale `scale` metres. */
export function fbm(seed: number, x: number, z: number, scale: number, oct = 3): number {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let i = 0; i < oct; i++) {
    sum += noise2(seed + i * 101, x * f, z * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** FNV-1a over a string: the plan hash. */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 13);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
