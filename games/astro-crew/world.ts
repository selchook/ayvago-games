// Astro Crew: the plan of a planet, pure and seeded (no three.js), so the simulation, the view, the
// minimap, the bot and the headless balance all read the same world.
//
// A planet is a crater about 124 m across: the crew's landing site in the south (the ship, a little
// outpost, the dome or the beacon), the boss's lair in the north, and between them alien nests and
// hives, crashed ships with supply crates, rover wrecks, crystal fields with jars of crystals, big
// rock formations and pools (lava burns). Patrols walk routes between them; guard camps wait at the
// keycards and the crystal caches. The same planet always has the same plan (the seed is the
// mission's), so a player learns it.
import { WORLD_R, type MissionDef } from './defs';

export interface Spot { x: number; z: number }
export interface NestSpot extends Spot { hive: boolean; target: boolean; guard: boolean }
export type LandKind = 'ship' | 'wreck' | 'crystals' | 'rocks' | 'lair';
export interface Landmark extends Spot { kind: LandKind; r: number; rot: number; v: number }
export interface Solid extends Spot { r: number }
export interface Pool extends Spot { r: number }
export interface Camp extends Spot { budget: number; at: 'key' | 'cache' | 'lair' | 'wreck' }

export interface WorldPlan {
  seed: number;
  /** Old craters on the ground (only painted). */
  craters: (Spot & { r: number })[];
  /** The landing site (the outpost; the dome or the beacon stands there) and where the hero starts. */
  base: Spot;
  start: Spot;
  nests: NestSpot[];
  landmarks: Landmark[];
  /** Round obstacles the hero and the walking aliens slide round. */
  solids: Solid[];
  pools: Pool[];
  /** Burning pools (the lava planets). */
  lava: boolean;
  keys: Spot[];
  rovers: (Spot & { face: number })[];
  lair: Spot | null;
  /** Crystal caches: the jars lying in a crystal field. */
  caches: Spot[];
  castaway: Spot | null;
  crates: Spot[];
  patrols: Spot[][];
  camps: Camp[];
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dist = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The planet of a mission (the same every time it is flown). */
export function planWorld(def: MissionDef, seed = def.n * 7919 + 211): WorldPlan {
  const r = mulberry(seed);
  const used: (Spot & { r: number })[] = [];
  const base = { x: 0, z: 34 };
  const start = { x: 0, z: 43 };
  used.push({ ...base, r: 12 });
  /** A free spot in the ring [minR, maxR] round (cx, cz), `gap` clear of everything placed. */
  const place = (gap: number, o: { cx?: number; cz?: number; minR?: number; maxR?: number; fromBase?: number; north?: boolean; spread?: boolean } = {}): Spot => {
    const cx = o.cx ?? 0, cz = o.cz ?? 0, minR = o.minR ?? 0, maxR = o.maxR ?? WORLD_R - 7;
    let best: Spot = { x: cx, z: cz }, bestD = -1;
    // spread: the freest of many tries (nests far apart, so the fights are apart too)
    if (o.spread) {
      for (let k = 0; k < 40; k++) {
        const a = r() * Math.PI * 2, d = minR + Math.sqrt(r()) * (maxR - minR);
        const p = { x: cx + Math.sin(a) * d, z: cz + Math.cos(a) * d };
        if (Math.hypot(p.x, p.z) > WORLD_R - 6 || dist(p, base) < (o.fromBase ?? 22)) continue;
        let clear = Infinity;
        for (const u of used) clear = Math.min(clear, dist(p, u) - u.r);
        if (clear > bestD) { bestD = clear; best = p; }
      }
      return best;
    }
    for (let k = 0; k < 60; k++) {
      const a = r() * Math.PI * 2, d = minR + Math.sqrt(r()) * (maxR - minR);
      const p = { x: cx + Math.sin(a) * d, z: cz + Math.cos(a) * d };
      if (Math.hypot(p.x, p.z) > WORLD_R - 6) continue;
      if (o.north && p.z > 10) continue;
      if (dist(p, base) < (o.fromBase ?? 22)) continue;
      let clear = Infinity;
      for (const u of used) clear = Math.min(clear, dist(p, u) - u.r);
      if (clear >= gap) return p;
      if (clear > bestD) { bestD = clear; best = p; }
    }
    return best;
  };
  const take = (p: Spot, rad: number): Spot => { used.push({ ...p, r: rad }); return p; };

  // the boss's lair, far in the north
  const lair = def.kind === 'boss' ? take({ x: (r() - 0.5) * 24, z: -40 - r() * 6 }, 15) : null;
  const landmarks: Landmark[] = [];
  const solids: Solid[] = [];
  if (lair) landmarks.push({ ...lair, kind: 'lair', r: 13, rot: r() * 6.28, v: 0 });

  // nests and hives
  const nests: NestSpot[] = [];
  const targets = def.kind === 'clear' ? def.count : 0;
  const guards = def.kind === 'boss' ? def.count : 0;
  const side = def.kind === 'clear' ? 0 : 2 + Math.floor(def.n / 5);
  const hiveAt = (i: number) => def.n >= 9 ? i % 3 !== 2 : def.n >= 5 ? i % 2 === 0 : def.n >= 3 && i === 0;
  for (let i = 0; i < targets + guards + side; i++) {
    const guard = i >= targets && i < targets + guards;
    const p = guard && lair
      ? place(9, { cx: lair.x, cz: lair.z, minR: 17, maxR: 26 })
      : place(15, { fromBase: def.kind === 'defend' ? 30 : 28, spread: true });
    take(p, 14);
    nests.push({ ...p, hive: guard ? def.n >= 8 : hiveAt(i), target: i < targets, guard });
  }

  // landmarks: crashed ships, rover wrecks, crystal fields, rock formations
  const ships = 2, wrecks = 2, fields = 3, rocks = 5;
  for (let i = 0; i < ships; i++) { const p = take(place(9, { fromBase: 20 }), 7); landmarks.push({ ...p, kind: 'ship', r: 4.2, rot: r() * 6.28, v: Math.floor(r() * 4) }); }
  for (let i = 0; i < wrecks; i++) { const p = take(place(8, { fromBase: 18 }), 5); landmarks.push({ ...p, kind: 'wreck', r: 2.4, rot: r() * 6.28, v: Math.floor(r() * 3) }); }
  for (let i = 0; i < fields; i++) { const p = take(place(9, { fromBase: 24 }), 6); landmarks.push({ ...p, kind: 'crystals', r: 3.6, rot: r() * 6.28, v: i }); }
  for (let i = 0; i < rocks; i++) { const p = take(place(7, { fromBase: 16 }), 5); landmarks.push({ ...p, kind: 'rocks', r: 3.4 + r() * 1.6, rot: r() * 6.28, v: Math.floor(r() * 3) }); }
  for (const l of landmarks) {
    if (l.kind === 'ship') solids.push({ x: l.x, z: l.z, r: 3.4 });
    if (l.kind === 'wreck') solids.push({ x: l.x, z: l.z, r: 2.0 });
    if (l.kind === 'rocks') solids.push({ x: l.x, z: l.z, r: l.r * 0.7 });
  }
  // the outpost: a house and the crew's ship beside the landing site
  solids.push({ x: base.x - 7, z: base.z + 3, r: 2.4 }, { x: base.x + 8, z: base.z + 2.5, r: 3.4 });

  // pools (lava burns on the lava planets; elsewhere goo, ice or tar to look at)
  const pools: Pool[] = [];
  const nPools = def.theme === 'lava' ? 6 : 4;
  for (let i = 0; i < nPools; i++) { const p = take(place(6, { fromBase: 20 }), 6); pools.push({ ...p, r: 2.6 + r() * 2.4 }); }

  // keycards at the far landmarks, each with a guard camp
  const keys: Spot[] = [];
  const camps: Camp[] = [];
  if (def.kind === 'keys') {
    const spots = landmarks.filter((l) => l.kind !== 'lair' && dist(l, base) > 26).sort(() => r() - 0.5);
    for (let i = 0; i < def.count; i++) {
      const l = spots[i];
      const p = l ? { x: l.x + Math.sin(l.rot) * (l.r + 2.2), z: l.z + Math.cos(l.rot) * (l.r + 2.2) } : take(place(10, { fromBase: 26 }), 4);
      keys.push(p);
      camps.push({ ...p, budget: 3 + def.n * 0.5, at: 'key' });
    }
  }
  // stranded rovers, spread out
  const rovers: (Spot & { face: number })[] = [];
  if (def.kind === 'rescue') {
    for (let i = 0; i < def.count; i++) {
      const p = take(place(16, { fromBase: 26 }), 6);
      rovers.push({ ...p, face: r() * 6.28 });
      camps.push({ x: p.x + 4, z: p.z - 3, budget: 3 + def.n * 0.5, at: 'wreck' });
    }
  }
  if (lair) camps.push({ ...lair, budget: 4 + def.n * 0.6, at: 'lair' });
  // crystal caches in the fields, guarded
  const caches: Spot[] = landmarks.filter((l) => l.kind === 'crystals').map((l) => ({ x: l.x, z: l.z }));
  for (const c of caches) camps.push({ ...c, budget: 2.5 + def.n * 0.4, at: 'cache' });
  // a castaway by a wreck (from the second planet on)
  const wl = landmarks.filter((l) => l.kind === 'wreck');
  const castaway = def.n >= 2 && wl.length ? { x: wl[0].x + Math.sin(wl[0].rot + 1.6) * 4, z: wl[0].z + Math.cos(wl[0].rot + 1.6) * 4 } : null;
  if (castaway) camps.push({ ...castaway, budget: 2.5 + def.n * 0.35, at: 'wreck' });
  // supply crates round the crashed ships and the wrecks
  const crates: Spot[] = [];
  for (const l of landmarks) {
    const n = l.kind === 'ship' ? 3 : l.kind === 'wreck' ? 1 : 0;
    for (let i = 0; i < n; i++) { const a = l.rot + 2.2 + i * 0.9; crates.push({ x: l.x + Math.sin(a) * (l.r + 1.6), z: l.z + Math.cos(a) * (l.r + 1.6) }); }
  }
  // patrol routes: loops through a landmark or a nest and two more spots near it
  const patrols: Spot[][] = [];
  const anchors = [...nests, ...landmarks.filter((l) => l.kind !== 'lair'), ...rovers];
  const nPat = 2 + Math.floor(def.n / 5);
  for (let i = 0; i < nPat; i++) {
    const a = anchors[Math.floor(r() * anchors.length)] ?? { x: 0, z: 0 };
    const route: Spot[] = [];
    for (let k = 0; k < 3; k++) {
      const ang = r() * Math.PI * 2, d = 8 + r() * 10;
      let p = { x: a.x + Math.sin(ang) * d, z: a.z + Math.cos(ang) * d };
      const pr = Math.hypot(p.x, p.z);
      if (pr > WORLD_R - 5) p = { x: p.x * (WORLD_R - 5) / pr, z: p.z * (WORLD_R - 5) / pr };
      if (dist(p, base) < 18) p = { x: p.x, z: base.z - 18 };
      route.push(p);
    }
    patrols.push(route);
  }
  // craters to break up the plain (painted into the ground's colours)
  const craters: (Spot & { r: number })[] = [];
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (WORLD_R - 3);
    craters.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, r: 1.6 + r() * 3.4 });
  }
  return { seed, craters, base, start, nests, landmarks, solids, pools, lava: def.theme === 'lava', keys, rovers, lair, caches, castaway, crates, patrols, camps };
}

/** Pushes a circle at (x, z) of radius `rad` out of the solids; returns whether it moved. */
export function pushOut(p: { x: number; z: number }, rad: number, solids: Solid[]): boolean {
  let moved = false;
  for (const s of solids) {
    const dx = p.x - s.x, dz = p.z - s.z;
    const min = s.r + rad;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d < 1e-4) { p.x += min; moved = true; continue; }
    p.x = s.x + (dx / d) * min;
    p.z = s.z + (dz / d) * min;
    moved = true;
  }
  return moved;
}
