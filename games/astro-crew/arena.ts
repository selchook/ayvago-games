// Astro Crew: a mission's planet in 3D, built from its plan (world.ts). The crater floor is a
// faceted ground striped in the theme's colours, with pools (lava glows), rising into a rocky rim;
// the kit's rocks, alien trees and plants are scattered over it, thick along the rim; the landmarks
// stand where the plan says: the outpost and the crew's ship at the landing site, crashed ships,
// rover wrecks, crystal fields, rock formations, the boss's lair. Ground and scenery are merged per
// chunk (one mesh and one draw call each, culled when out of sight) and drawn with the bent
// material, so the planet curves away round the camera like a tiny world. The sky is black with
// stars and two big planets hanging in it.
import { THREE } from '@core/three';
import { WORLD_R, type Theme, type HeroId } from './defs';
import { modelBox, type Placed } from './kit';
import { baseY } from './fx3d';
import { mulberry, dist, type WorldPlan, type Spot } from './world';

export interface ThemeLook {
  ground: [number, number, number];
  /** The rim's rock and the pools' colour (lava glows). */
  rim: number; pool: number; poolEdge: number;
  sky: number; hemiGround: number; sun: number; sunI: number;
  trees: string[]; plants: string[]; rocks: string[]; rockTint: number;
  skyPlanets: [string, string];
  /** The shot glow and portal colours read well on it. */
  portal: number;
  /** The crystals' and the nests' colours. */
  crystal: number; nest: number;
}

export const THEME: Record<Theme, ThemeLook> = {
  desert: {
    ground: [0xe2843a, 0xc9692a, 0xf2a35a], rim: 0x9a4a24, pool: 0xff7a1a, poolEdge: 0x5a2a1a, sky: 0xfff0e0, hemiGround: 0x8a4a2a, sun: 0xfff2dc, sunI: 2.3,
    trees: ['tree-blob-1', 'tree-blob-2', 'tree-blob-3', 'tree-lava-1'], plants: ['grass-1', 'grass-1', 'plant-1', 'bush-3'],
    rocks: ['rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-large-1', 'rock-large-2', 'rock-large-3'], rockTint: 0xffffff,
    skyPlanets: ['planet-8', 'planet-9'], portal: 0xc26aff, crystal: 0x5ae8ff, nest: 0x9a3aff,
  },
  purple: {
    ground: [0x9a58cc, 0x7c40ae, 0xb874e0], rim: 0x4a2a6a, pool: 0x7aff6a, poolEdge: 0x2a5a3a, sky: 0xf2e6ff, hemiGround: 0x4a2a6a, sun: 0xffeefa, sunI: 2.2,
    trees: ['tree-swirl-1', 'tree-swirl-2', 'tree-light-1', 'tree-light-2', 'tree-spiral-1'], plants: ['plant-2', 'plant-1', 'bush-3', 'bush-3'],
    rocks: ['rock-1', 'rock-2', 'rock-3', 'rock-large-1', 'rock-large-2'], rockTint: 0xc0a0d8,
    skyPlanets: ['planet-6', 'planet-7'], portal: 0x6affc8, crystal: 0xffe04a, nest: 0x3aff8a,
  },
  ice: {
    ground: [0xd8eef8, 0xb6d8ee, 0xf2fbff], rim: 0x7a98b8, pool: 0x8ad0ff, poolEdge: 0x4a7aa8, sky: 0xeaf6ff, hemiGround: 0x6a8aa8, sun: 0xffffff, sunI: 2.0,
    trees: ['tree-floating-1', 'tree-floating-2', 'bush-1', 'bush-2'], plants: ['grass-2', 'grass-2', 'bush-3', 'plant-2'],
    rocks: ['rock-1', 'rock-2', 'rock-4', 'rock-large-1', 'rock-large-3'], rockTint: 0xa8c4dc,
    skyPlanets: ['planet-11', 'planet-2'], portal: 0xc26aff, crystal: 0xd06aff, nest: 0xff5a8a,
  },
  lava: {
    ground: [0x4a2a2e, 0x34202a, 0xd8481a], rim: 0x2a1a1e, pool: 0xff6a1a, poolEdge: 0xffd23a, sky: 0xffd8c8, hemiGround: 0x5a1a10, sun: 0xffe0c8, sunI: 2.1,
    trees: ['tree-lava-2', 'tree-lava-3', 'tree-spikes-1', 'tree-spikes-2', 'tree-spiral-2', 'tree-spiral-3'], plants: ['grass-3', 'grass-3', 'plant-2'],
    rocks: ['rock-1', 'rock-3', 'rock-4', 'rock-large-2', 'rock-large-3'], rockTint: 0x6a5450,
    skyPlanets: ['planet-4', 'planet-10'], portal: 0x6affc8, crystal: 0x6affe8, nest: 0xff3a5a,
  },
};

/** The chunk grid: CHUNKS × CHUNKS squares of CHUNK metres covering the crater and its rim. */
export const CHUNK = 40;
export const CHUNKS = 4;
const HALF = (CHUNK * CHUNKS) / 2;
export const chunkOf = (x: number, z: number): number => {
  const cx = Math.max(0, Math.min(CHUNKS - 1, Math.floor((x + HALF) / CHUNK)));
  const cz = Math.max(0, Math.min(CHUNKS - 1, Math.floor((z + HALF) / CHUNK)));
  return cz * CHUNKS + cx;
};
/** A chunk's centre. */
export const chunkCentre = (i: number): Spot => ({ x: -HALF + ((i % CHUNKS) + 0.5) * CHUNK, z: -HALF + (Math.floor(i / CHUNKS) + 0.5) * CHUNK });

/** A model standing on the (unbent) ground; the bent material tilts it with the planet. */
export function onGround(key: string, x: number, z: number, rot: number, s: number, tint?: number, sink = 0): Placed {
  const b = modelBox(key);
  return { key, x, y: baseY(x, z) - b.min.y * s - sink, z, rot, s, tint };
}

/** The ground of one chunk: a faceted grid striped in the theme's colours, with pools and the rim. */
export function groundChunk(theme: Theme, plan: WorldPlan, i: number): { pos: number[]; col: number[] } {
  const L = THEME[theme];
  const cols = L.ground.map((c) => new THREE.Color(c));
  const rim = new THREE.Color(L.rim), pool = new THREE.Color(L.pool), edge = new THREE.Color(L.poolEdge);
  const dark = new THREE.Color(L.ground[1]).multiplyScalar(0.72), lip = new THREE.Color(L.ground[2]).lerp(new THREE.Color(0xffffff), 0.15);
  const c0 = chunkCentre(i);
  const N = 20, step = CHUNK / N;
  const x0 = c0.x - CHUNK / 2, z0 = c0.z - CHUNK / 2;
  const pos: number[] = [], col: number[] = [];
  const tmp = new THREE.Color();
  const jit = (x: number, z: number): [number, number] => {
    // shift the inner vertices a little so the facets look hand-cut (the chunk's edges stay put)
    const onEdge = Math.abs(x - x0) < 0.01 || Math.abs(x - x0 - CHUNK) < 0.01 || Math.abs(z - z0) < 0.01 || Math.abs(z - z0 - CHUNK) < 0.01;
    if (onEdge) return [x, z];
    return [x + Math.sin(x * 1.7 + z * 0.9) * 0.45, z + Math.sin(z * 1.3 - x * 0.7) * 0.45];
  };
  const height = (x: number, z: number): number => {
    let y = baseY(x, z);
    for (const p of plan.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r) y -= 0.28 * Math.min(1, (p.r - d) / 0.8); }
    for (const c of plan.craters) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + 0.8) { y += d < c.r ? -0.35 * (1 - (d / c.r) ** 2) : 0.18 * (1 - (d - c.r) / 0.8); break; } }
    return Math.min(y, 15);
  };
  const shade = (x: number, z: number): THREE.Color => {
    const r = Math.hypot(x, z);
    for (const p of plan.pools) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r - 0.4) return tmp.copy(pool).lerp(edge, theme === 'lava' ? Math.max(0, 0.35 - (p.r - d) * 0.12) : 0.1 + 0.15 * Math.sin(x * 2 + z));
      if (d < p.r + 0.6) return tmp.copy(edge);
    }
    const b = Math.sin(x * 0.16 + z * 0.07 + Math.sin(z * 0.11) * 1.4) * 0.5 + 0.5;
    const n = Math.sin(x * 1.3) * Math.sin(z * 1.7) * 0.12;
    if (theme === 'lava') {
      tmp.copy(cols[0]).lerp(cols[1], b + n);
    } else {
      const k = b + n;
      if (k < 0.45) tmp.copy(cols[1]).lerp(cols[0], k / 0.45); else tmp.copy(cols[0]).lerp(cols[2], Math.min(1, (k - 0.45) / 0.55));
    }
    // old craters: a darker bowl with a pale lip
    for (const c of plan.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.r + 0.8) continue;
      if (d < c.r - 0.5) tmp.lerp(dark, 0.22 + 0.1 * (1 - d / c.r));
      else tmp.lerp(lip, 0.3);
      break;
    }
    // per-facet grain, the rim's rock
    tmp.multiplyScalar(0.94 + 0.12 * (Math.sin(x * 12.9898 + z * 78.233) * 0.5 + 0.5));
    if (r > WORLD_R - 1) tmp.lerp(rim, Math.min(1, (r - WORLD_R + 1) / 6));
    return tmp;
  };
  const P = (gx: number, gz: number): [number, number, number] => {
    const [x, z] = jit(x0 + gx * step, z0 + gz * step);
    return [x, height(x, z), z];
  };
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const cc = shade(cx, cz);
    for (const p of [a, c, b]) { pos.push(p[0], p[1], p[2]); col.push(cc.r, cc.g, cc.b); }
  };
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      const a = P(gx, gz), b = P(gx + 1, gz), c = P(gx, gz + 1), d = P(gx + 1, gz + 1);
      if ((gx + gz) % 2) { tri(a, b, c); tri(b, d, c); } else { tri(a, b, d); tri(a, d, c); }
    }
  }
  return { pos, col };
}

/** Everything static on the planet: the rim, the scatter and the landmarks (positions on the unbent ground). */
export function worldLayout(theme: Theme, plan: WorldPlan, hero: HeroId, kind: string): Placed[] {
  const L = THEME[theme];
  const r = mulberry(plan.seed ^ 0x5ca1ab1e);
  const out: Placed[] = [];
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  // keep clear of what the plan put down
  const busy: (Spot & { r: number })[] = [
    { ...plan.base, r: 12 },
    ...plan.nests.map((n) => ({ ...n, r: 5 })),
    ...plan.landmarks.map((l) => ({ ...l, r: l.r + 2.5 })),
    ...plan.pools.map((p) => ({ ...p, r: p.r + 1 })),
    ...plan.rovers.map((v) => ({ ...v, r: 4 })),
    ...plan.keys.map((k) => ({ ...k, r: 2.5 })),
    ...plan.crates.map((c) => ({ ...c, r: 1.6 })),
    ...(plan.castaway ? [{ ...plan.castaway, r: 3 }] : []),
  ];
  const free = (x: number, z: number, pad = 0) => busy.every((b) => dist({ x, z }, b) > b.r + pad);
  // the rim: big rocks and trees all round, two rows; low on the south, where the camera looks from
  const big = L.rocks.filter((k) => k.startsWith('rock-large'));
  const ring = Math.round((2 * Math.PI * (WORLD_R + 5)) / 6.2);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + r() * 0.05;
    const rad = WORLD_R + 3 + r() * 3;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
    if (z > 18) {
      if (r() < 0.6) out.push(onGround('rock-large-1', x, z, r() * 6.28, 0.45 + r() * 0.3, L.rockTint, 0.4));
      else out.push(onGround(pick(L.plants), x, z, r() * 6.28, 0.5 + r() * 0.3));
      continue;
    }
    if (r() < 0.72) out.push(onGround(pick(big), x, z, r() * 6.28, 1.1 + r() * 0.9, L.rockTint, 0.6));
    else out.push(onGround(pick(L.trees), x, z, r() * 6.28, 0.9 + r() * 0.5));
    if (i % 3 === 0) {
      const a2 = a + 0.02, rad2 = WORLD_R + 9 + r() * 4;
      out.push(onGround(pick(big), Math.sin(a2) * rad2, Math.cos(a2) * rad2, r() * 6.28, 1.6 + r() * 1.2, L.rockTint, 1));
    }
  }
  // the scatter over the crater floor: clumps of plants and pebbles, a few trees
  const pebbles = ['rock-1', 'rock-2', 'rock-3'];
  for (let i = 0; i < 230; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (WORLD_R - 2);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (!free(x, z)) continue;
    const t = r();
    if (t < 0.09) out.push(onGround(pick(L.trees), x, z, r() * 6.28, 0.55 + r() * 0.35));
    else if (t < 0.55) out.push(onGround(pick(pebbles), x, z, r() * 6.28, 0.16 + r() * 0.26, L.rockTint, 0.06));
    else {
      // a clump of two plants
      for (let k = 0; k < 2; k++) {
        const px = x + (r() - 0.5) * 2.4, pz = z + (r() - 0.5) * 2.4;
        if (free(px, pz)) out.push(onGround(pick(L.plants), px, pz, r() * 6.28, 0.3 + r() * 0.25));
      }
    }
  }
  // the landing site: the outpost and the crew's ship
  const B = plan.base;
  out.push(onGround('house-single', B.x - 7, B.z + 3, 0.2, 0.62), onGround('solar-ground', B.x - 3.6, B.z + 6, 0.4, 0.6), onGround('roof-radar', B.x - 9.6, B.z + 0.4, 0.8, 0.52));
  out.push(onGround('solar-ground', B.x + 3.4, B.z + 6.2, -0.3, 0.6), onGround('metal-support', B.x - 4.6, B.z - 1.6, 0.4, 0.5));
  out.push(onGround('ship-' + hero, B.x + 8, B.z + 2.5, -0.5, 0.5, undefined, -0.3));
  if (kind !== 'defend' && kind !== 'keys') out.push(onGround('house-support', B.x, B.z, 0, 0.45));
  // the nests and hives: spines leaning out round the core (the core is the view's, it pulses and breaks)
  for (const n of plan.nests) {
    const k = n.hive ? 7 : 5;
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + r() * 0.3, d = n.hive ? 1.9 : 1.4;
      // horns curving outwards (the shape bends towards its +z: face it away from the core)
      const p = onGround('spike', n.x + Math.sin(a) * d, n.z + Math.cos(a) * d, a, (n.hive ? 1.15 : 0.9) * (0.8 + r() * 0.4), j % 2 ? L.nest : L.crystal, 0.1);
      out.push(p);
    }
    for (let j = 0; j < 4; j++) {
      const a = j * 1.57 + 0.6, d = n.hive ? 3.2 : 2.6;
      out.push(onGround(pick(L.rocks.slice(0, 4)), n.x + Math.sin(a) * d, n.z + Math.cos(a) * d, r() * 6.28, 0.22 + r() * 0.15, L.rockTint, 0.05));
    }
  }
  // the landmarks
  for (const l of plan.landmarks) {
    const c = Math.cos(l.rot), s = Math.sin(l.rot);
    const at = (dx: number, dz: number): [number, number] => [l.x + dx * c + dz * s, l.z - dx * s + dz * c];
    switch (l.kind) {
      case 'ship': {
        // a crashed ship nose down in the dirt, rocks thrown up round it
        const ships = ['ship-bee', 'ship-flamingo', 'ship-frog', 'ship-panda'];
        const p = onGround(ships[l.v % 4], l.x, l.z, l.rot, 0.5, 0xc8b8b0, 0.7);
        p.tilt = 0.32; p.roll = 0.18;
        out.push(p);
        for (let k = 0; k < 4; k++) { const [x, z] = at(Math.cos(k * 1.7) * 4.6, Math.sin(k * 1.7) * 4.6); out.push(onGround(pick(L.rocks.slice(0, 4)), x, z, r() * 6.28, 0.35 + r() * 0.25, L.rockTint, 0.1)); }
        break;
      }
      case 'wreck': {
        const rovers = ['rover-1', 'rover-2', 'rover-round'];
        const p = onGround(rovers[l.v % 3], l.x, l.z, l.rot, 0.4, 0xa89890, 0.2);
        p.roll = 1.2;
        out.push(p);
        break;
      }
      case 'crystals': {
        // a field of crystal shards round the cache
        for (let k = 0; k < 9; k++) {
          const a = k * 2.4 + l.rot, d = 1.9 + (k % 3) * 1.1;
          const [x, z] = [l.x + Math.sin(a) * d, l.z + Math.cos(a) * d];
          const p = onGround('crystal', x, z, r() * 6.28, 0.8 + r() * 0.9, L.crystal, 0.1);
          p.tilt = (r() - 0.5) * 0.5; p.roll = (r() - 0.5) * 0.5;
          out.push(p);
        }
        break;
      }
      case 'rocks': {
        // a low, wide outcrop (it must not hide the hero from the camera) with a spire on its far side
        out.push(onGround('rock-large-1', l.x, l.z, l.rot, l.r / 5, L.rockTint, 0.3));
        out.push(onGround(big[(l.v + 1) % big.length], l.x + 0.4, l.z - l.r * 0.4, r() * 6.28, 0.3, L.rockTint, 0.3));
        const [x, z] = at(l.r * 0.9, l.r * 0.3);
        out.push(onGround(pick(L.rocks.slice(0, 4)), x, z, r() * 6.28, 0.5 + r() * 0.3, L.rockTint, 0.2));
        break;
      }
      case 'lair': {
        // a ring of spikes and boulders round the boss's arena
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + l.rot, d = l.r + 4 + (k % 2) * 1.5;
          const x = l.x + Math.sin(a) * d, z = l.z + Math.cos(a) * d;
          if (k % 4 === 0) continue;
          if (k % 2) out.push(onGround('rock-large-1', x, z, r() * 6.28, 0.5 + r() * 0.3, L.rockTint, 0.3));
          else out.push(onGround('spike', x, z, Math.atan2(x - l.x, z - l.z), 1.5, L.nest, 0.1));
        }
        break;
      }
    }
  }
  return out;
}

/** The base screen's plateau: a little faceted disc curving away. */
export function discMesh(theme: Theme, radius: number): THREE.BufferGeometry {
  const L = THEME[theme];
  const cols = L.ground.map((c) => new THREE.Color(c));
  const curve = (x: number, z: number) => -(x * x + z * z) / (2 * 46);
  const rings = 14, segs = 48;
  const pos: number[] = [], col: number[] = [];
  const pt = (ri: number, si: number): [number, number, number] => {
    const r = radius * Math.pow(ri / rings, 1.25);
    const a = (si / segs) * Math.PI * 2 + (ri % 2) * (Math.PI / segs);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    return [x, curve(x, z), z];
  };
  const tmp = new THREE.Color();
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    if (uz * vx - ux * vz < 0) { const t = b; b = c; c = t; }
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const k = Math.sin(cx * 0.16 + cz * 0.07 + Math.sin(cz * 0.11) * 1.4) * 0.5 + 0.5 + Math.sin(cx * 1.3) * Math.sin(cz * 1.7) * 0.12;
    const cc = k < 0.45 ? tmp.copy(cols[1]).lerp(cols[0], k / 0.45) : tmp.copy(cols[0]).lerp(cols[2], Math.min(1, (k - 0.45) / 0.55));
    for (const p of [a, b, c]) { pos.push(...p); col.push(cc.r, cc.g, cc.b); }
  };
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = pt(ri, si), b = pt(ri, si + 1), c = pt(ri + 1, si), d = pt(ri + 1, si + 1);
      if (ri === 0) { tri(a, d, c); continue; }
      tri(a, b, c);
      tri(b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Stars: points on a far sphere (the view keeps it round the camera). */
export function starField(n = 900): THREE.Points {
  const r = mulberry(77);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, e = -0.25 + r() * 1.45;
    const R = 170;
    pos[i * 3] = Math.cos(e) * Math.sin(a) * R; pos[i * 3 + 1] = Math.sin(e) * R - 20; pos[i * 3 + 2] = Math.cos(e) * Math.cos(a) * R;
    const b = 0.5 + r() * 0.5, tint = r();
    col[i * 3] = b * (tint < 0.15 ? 0.8 : 1); col[i * 3 + 1] = b * (tint > 0.85 ? 0.85 : 1); col[i * 3 + 2] = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}
