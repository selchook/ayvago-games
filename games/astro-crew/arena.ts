// Astro Crew: a mission's planet. The ground is a disc that curves away like a small planet
// (groundY in fx3d.ts), striped like the kit's dunes in the theme's colours; rocks, alien trees and
// plants ring the arena; a little outpost and the crew's own spaceship stand outside the ring; the
// sky is black with stars and two big planets hanging in it. Static scenery is merged into one mesh.
import { THREE } from '@core/three';
import type { Theme, HeroId } from './defs';
import { modelBox, type Placed } from './kit';
import { groundY, PLANET_R } from './fx3d';

export interface ThemeLook {
  ground: [number, number, number];
  sky: number; hemiGround: number; sun: number; sunI: number;
  trees: string[]; plants: string[]; rocks: string[]; rockTint: number;
  skyPlanets: [string, string];
  /** The shot glow and portal colours read well on it. */
  portal: number;
}

export const THEME: Record<Theme, ThemeLook> = {
  desert: {
    ground: [0xe2843a, 0xc9692a, 0xf2a35a], sky: 0xfff0e0, hemiGround: 0x8a4a2a, sun: 0xfff2dc, sunI: 2.3,
    trees: ['tree-blob-1', 'tree-blob-2', 'tree-blob-3', 'tree-lava-1'], plants: ['grass-1', 'grass-1', 'plant-1', 'bush-3'],
    rocks: ['rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-large-1', 'rock-large-2', 'rock-large-3'], rockTint: 0xffffff,
    skyPlanets: ['planet-8', 'planet-9'], portal: 0xc26aff,
  },
  purple: {
    ground: [0x9a58cc, 0x7c40ae, 0xb874e0], sky: 0xf2e6ff, hemiGround: 0x4a2a6a, sun: 0xffeefa, sunI: 2.2,
    trees: ['tree-swirl-1', 'tree-swirl-2', 'tree-light-1', 'tree-light-2', 'tree-spiral-1'], plants: ['plant-2', 'plant-1', 'bush-3', 'bush-3'],
    rocks: ['rock-1', 'rock-2', 'rock-3', 'rock-large-1', 'rock-large-2'], rockTint: 0xc0a0d8,
    skyPlanets: ['planet-6', 'planet-7'], portal: 0x6affc8,
  },
  ice: {
    ground: [0xd8eef8, 0xb6d8ee, 0xf2fbff], sky: 0xeaf6ff, hemiGround: 0x6a8aa8, sun: 0xffffff, sunI: 2.0,
    trees: ['tree-floating-1', 'tree-floating-2', 'bush-1', 'bush-2'], plants: ['bush-2', 'grass-2', 'bush-1'],
    rocks: ['rock-1', 'rock-2', 'rock-4', 'rock-large-1', 'rock-large-3'], rockTint: 0xa8c4dc,
    skyPlanets: ['planet-11', 'planet-2'], portal: 0xc26aff,
  },
  lava: {
    ground: [0x4a2a2e, 0x34202a, 0xd8481a], sky: 0xffd8c8, hemiGround: 0x5a1a10, sun: 0xffe0c8, sunI: 2.1,
    trees: ['tree-lava-2', 'tree-lava-3', 'tree-spikes-1', 'tree-spikes-2', 'tree-spiral-2', 'tree-spiral-3'], plants: ['grass-3', 'grass-3', 'tree-spikes-2'],
    rocks: ['rock-1', 'rock-3', 'rock-4', 'rock-large-2', 'rock-large-3'], rockTint: 0x6a5450,
    skyPlanets: ['planet-4', 'planet-10'], portal: 0x6affc8,
  },
};

function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** A model standing on the curved ground, tilted with it. */
export function onGround(key: string, x: number, z: number, rot: number, s: number, tint?: number, sink = 0): Placed {
  const b = modelBox(key);
  const r = Math.hypot(x, z);
  // tilt with the planet's surface: about the axis across the radius
  const tiltA = Math.atan(r / PLANET_R);
  const y = groundY(x, z) - b.min.y * s - sink;
  return { key, x, y, z, rot, s, tint, tilt: r > 0.01 ? tiltA * (z / r) : 0, roll: r > 0.01 ? -tiltA * (x / r) : 0 };
}

/** The ground: a faceted disc curving away, striped in the theme's three colours. */
export function groundMesh(theme: Theme, radius = 44): THREE.BufferGeometry {
  const L = THEME[theme];
  const cols = L.ground.map((c) => new THREE.Color(c));
  const rings = 30, segs = 72;
  const pos: number[] = [], col: number[] = [];
  const pt = (ri: number, si: number): [number, number, number] => {
    const r = radius * Math.pow(ri / rings, 1.25);
    const a = (si / segs) * Math.PI * 2 + (ri % 2) * (Math.PI / segs);
    const jx = ri > 0 && ri < rings ? Math.sin(ri * 7.1 + (si % segs) * 3.3) * 0.25 : 0;
    const x = Math.sin(a) * r + jx, z = Math.cos(a) * r + jx * 0.6;
    return [x, groundY(x, z) + (ri > 0 ? Math.sin(x * 0.7 + z * 0.4) * 0.06 : 0), z];
  };
  const tmp = new THREE.Color();
  const shade = (x: number, z: number): THREE.Color => {
    // dune bands sweeping across, a little noise
    const b = Math.sin(x * 0.16 + z * 0.07 + Math.sin(z * 0.11) * 1.4) * 0.5 + 0.5;
    const n = Math.sin(x * 1.3) * Math.sin(z * 1.7) * 0.12;
    if (theme === 'lava') {
      // dark rock with glowing seams
      const seam = Math.abs(Math.sin(x * 0.33 + Math.sin(z * 0.27) * 2.2)) < 0.07 ? 1 : 0;
      return tmp.copy(cols[0]).lerp(cols[1], b + n).lerp(cols[2], seam * 0.95);
    }
    const k = b + n;
    return k < 0.45 ? tmp.copy(cols[1]).lerp(cols[0], k / 0.45) : tmp.copy(cols[0]).lerp(cols[2], Math.min(1, (k - 0.45) / 0.55));
  };
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    // face up
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    if (uz * vx - ux * vz < 0) { const t = b; b = c; c = t; }
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const cc = shade(cx, cz);
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

/** The ring of scenery round a mission's arena (and a few plants inside). */
export function arenaLayout(theme: Theme, seed: number, hero: HeroId): Placed[] {
  const L = THEME[theme];
  const r = rng(seed);
  const out: Placed[] = [];
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  // the outpost and the crew's ship, behind the arena (away from the camera)
  const ox = -9, oz = -19;
  out.push(onGround('house-single', ox, oz, 0.3, 0.72), onGround('solar-ground', ox + 4.2, oz + 0.6, 0.5, 0.7), onGround('roof-radar', ox - 3.4, oz + 1, 0.8, 0.6));
  out.push(onGround('ship-' + hero, 8.5, -19.5, -0.6, 0.55, undefined, -0.4));
  // the ring: big rocks and trees just outside the play area, more further out
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + r() * 0.1;
    const rad = 17 + r() * 4.5;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
    if (Math.hypot(x - ox, z - oz) < 6 || Math.hypot(x - 8.5, z + 19.5) < 6) continue;
    // the side towards the camera keeps low: pebbles and plants only
    if (z > 6) { out.push(onGround(pick(L.plants), x, z, r() * 6.28, 0.4 + r() * 0.3)); continue; }
    if (r() < 0.62) out.push(onGround(pick(L.rocks), x, z, r() * 6.28, 0.45 + r() * 0.55, L.rockTint, 0.15));
    else out.push(onGround(pick(L.trees), x, z, r() * 6.28, 0.5 + r() * 0.35));
  }
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rad = 23 + r() * 14;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
    if (z > 4) continue;
    if (r() < 0.65) out.push(onGround(pick(L.rocks), x, z, r() * 6.28, 0.8 + r() * 1.2, L.rockTint, 0.3));
    else out.push(onGround(pick(L.trees), x, z, r() * 6.28, 0.8 + r() * 0.5));
  }
  // small plants and pebbles inside the arena (no cover: decoration only)
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, rad = 3 + r() * 11.5;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
    if (Math.hypot(x, z) < 3.5) continue;
    if (r() < 0.6) out.push(onGround(pick(L.plants), x, z, r() * 6.28, 0.35 + r() * 0.2));
    else out.push(onGround(pick(L.rocks.slice(0, 4)), x, z, r() * 6.28, 0.18 + r() * 0.15, L.rockTint, 0.05));
  }
  return out;
}

/** Stars: points on a far sphere above the horizon. */
export function starField(n = 900): THREE.Points {
  const r = rng(77);
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
