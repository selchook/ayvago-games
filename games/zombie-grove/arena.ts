// Zombie Grove: the grove, laid out once from a fixed seed so every run plays in the same forest.
// The camp sits in the middle (campfire, tents, two watchtowers joined by a rope bridge, fences
// with gaps, a flag and an archery target); groves of trees, rocks and clearings fill the rest,
// with a rocky ridge or two and a dense wall of trees round the edge. The simulation reads the
// colliders (circles); the view builds the props from the same list.
import { ARENA } from './defs';

export type ForestModel =
  | 'tree' | 'tree-high' | 'plant' | 'rocks-low' | 'rocks-high' | 'rocks-ramp' | 'stones' | 'patch-grass' | 'patch-dirt'
  | 'tent' | 'building-platform' | 'building-structure' | 'building-roof' | 'platform' | 'ladder' | 'bridge' | 'fence'
  | 'flag' | 'target';

export const FOREST_MODELS: ForestModel[] = [
  'tree', 'tree-high', 'plant', 'rocks-low', 'rocks-high', 'rocks-ramp', 'stones', 'patch-grass', 'patch-dirt',
  'tent', 'building-platform', 'building-structure', 'building-roof', 'platform', 'ladder', 'bridge', 'fence', 'flag', 'target',
];

export interface Prop { m: ForestModel; x: number; y: number; z: number; rot: number; s: number; sy?: number }
export interface Collider { x: number; z: number; r: number }

export interface Arena {
  props: Prop[];
  colliders: Collider[];
  fire: { x: number; z: number };
  start: { x: number; z: number };
}

/** A small seeded random generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The camp's clear radius: no forest inside it. */
export const CAMP_R = 11;

let cached: Arena | null = null;

export function arena(): Arena {
  if (cached) return cached;
  const rnd = seeded(20261113);
  const props: Prop[] = [];
  const colliders: Collider[] = [];
  const add = (m: ForestModel, x: number, z: number, rot: number, s: number, r = 0, y = 0) => {
    // ground patches stay flat however wide they are
    props.push({ m, x, y, z, rot, s, sy: m === 'patch-dirt' || m === 'patch-grass' ? Math.min(s, 1.2) : undefined });
    if (r > 0) colliders.push({ x, z, r });
  };
  const free = (x: number, z: number, r: number) => colliders.every((c) => (c.x - x) ** 2 + (c.z - z) ** 2 > (c.r + r) ** 2);

  // ---- the camp
  const fire = { x: 0, z: 0 };
  colliders.push({ x: 0, z: 0, r: 0.75 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add('stones', Math.cos(a) * 0.95, Math.sin(a) * 0.95, a * 2.3, 0.62);
  }
  add('patch-dirt', 0, 0, 0.3, 9.5);
  add('patch-dirt', -4.2, -5.6, 1.1, 6.5);
  // tents round the fire, doors facing it
  for (const [x, z] of [[-5.6, 0.6], [5.4, -1.2], [3.2, 5.6]] as [number, number][]) {
    add('tent', x, z, Math.atan2(-x, -z), 2.3, 1.25);
  }
  // two watchtowers joined by a rope bridge (zombies walk under it)
  const towers: [number, number][] = [[-7.0, -6.2], [-1.6, -6.2]];
  for (const [x, z] of towers) {
    add('building-structure', x, z, 0, 2.2, 0);
    add('building-platform', x, z, 0, 2.2, 0, 2.2);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) colliders.push({ x: x + dx * 0.95, z: z + dz * 0.95, r: 0.32 });
  }
  add('building-roof', towers[1][0], towers[1][1], 0, 2.2, 0, 2.2 + 1.05);
  add('bridge', (towers[0][0] + towers[1][0]) / 2, towers[0][1], Math.PI / 2, 2.4, 0, 2.2 + 0.2);
  add('ladder', towers[0][0] + 0.1, towers[0][1] + 1.55, 0, 2.3, 0);
  add('flag', towers[0][0], towers[0][1], 0.4, 2.4, 0, 2.2 + 1.1);
  add('flag', 2.8, -2.6, -0.5, 2.6, 0.25);
  // a little archery range and a wooden deck
  add('target', 7.4, 3.6, -1.9, 2.4, 0.45);
  add('target', 8.2, 1.4, -1.6, 2.4, 0.45);
  add('platform', 6.4, -6.2, 0.1, 2.3, 1.35);
  // fences round the camp with gaps (the gaps are chokepoints)
  const fenceR = 9.6;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    if (i % 6 === 2 || i % 6 === 3) continue; // gaps
    const x = Math.cos(a) * fenceR, z = Math.sin(a) * fenceR;
    add('fence', x, z, -a + Math.PI / 2, 2.15);
    for (const k of [-0.75, 0, 0.75]) colliders.push({ x: x - Math.sin(a) * k, z: z + Math.cos(a) * k, r: 0.3 });
  }

  // ---- ridges: lines of tall rocks with a gap to slip through
  const ridges: [number, number, number, number, number][] = [[-34, 15, -12, 19, 0.45], [12, -24, 33, -15, 0.55], [18, 22, 26, 36, 0.5]];
  for (const [x0, z0, x1, z1, gap] of ridges) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / 2.1);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      if (Math.abs(k - gap) < 0.09) continue;
      const x = x0 + (x1 - x0) * k + (rnd() - 0.5) * 0.6, z = z0 + (z1 - z0) * k + (rnd() - 0.5) * 0.6;
      const tall = rnd() < 0.65;
      const s = 2.2 + rnd() * 0.6;
      add(tall ? 'rocks-high' : 'rocks-low', x, z, Math.floor(rnd() * 4) * Math.PI / 2, s, s * 0.5);
    }
  }

  // ---- the forest: groves and clearings from a smooth noise, plus scattered rocks
  const noise = (x: number, z: number) =>
    Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.13 - 0.7) * 0.6 + Math.sin(x * 0.27 + z * 0.19 + 2.1) * 0.4;
  const inner = ARENA - 5;
  for (let tries = 0; tries < 5200; tries++) {
    const x = (rnd() * 2 - 1) * inner, z = (rnd() * 2 - 1) * inner;
    const d = Math.hypot(x, z);
    if (d < CAMP_R + 1.5) continue;
    const dens = noise(x, z);
    const roll = rnd();
    if (dens > 0.22 && roll < 0.4) {
      if (!free(x, z, 1.45)) continue;
      const high = rnd() < 0.4;
      const s = 2.1 + rnd() * 1.1;
      add(high ? 'tree-high' : 'tree', x, z, rnd() * Math.PI * 2, s, 0.2 * s);
    } else if (dens < -0.35 && roll < 0.06) {
      if (!free(x, z, 1.3)) continue;
      const s = 1.8 + rnd() * 0.9;
      const k = rnd();
      add(k < 0.4 ? 'rocks-low' : k < 0.7 ? 'stones' : 'rocks-ramp', x, z, rnd() * Math.PI * 2, s, s * 0.42);
    } else if (roll < 0.035) {
      if (!free(x, z, 1.1)) continue;
      add('tree', x, z, rnd() * Math.PI * 2, 2 + rnd() * 0.8, 0.46);
    }
  }
  // undergrowth: plants and grass tufts (no colliders)
  for (let i = 0; i < 260; i++) {
    const x = (rnd() * 2 - 1) * inner, z = (rnd() * 2 - 1) * inner;
    if (Math.hypot(x, z) < 3) continue;
    if (!free(x, z, 0.4)) continue;
    if (rnd() < 0.75) add('plant', x, z, rnd() * 6.28, 1.6 + rnd() * 1.2);
    else add('patch-grass', x, z, rnd() * 6.28, 1 + rnd() * 0.9);
  }
  // the edge: a dense wall of trees
  for (let side = 0; side < 4; side++) {
    for (let row = 0; row < 2; row++) {
      const off = ARENA - 4.2 + row * 2.6;
      for (let t = -ARENA - 4; t <= ARENA + 4; t += 2.3) {
        const j = t + (rnd() - 0.5) * 1.2, o = off + (rnd() - 0.5) * 1;
        const [x, z] = side === 0 ? [j, -o] : side === 1 ? [j, o] : side === 2 ? [-o, j] : [o, j];
        const s = 2.4 + rnd() * 1.2;
        add(rnd() < 0.5 ? 'tree-high' : 'tree', x, z, rnd() * 6.28, s, row === 0 ? 0.9 : 0);
      }
    }
  }
  cached = { props, colliders, fire, start: { x: 0, z: 3.2 } };
  return cached;
}
