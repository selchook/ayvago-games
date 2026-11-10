// Builds the 3D scene of a hole: the kit tiles merged into a few meshes per material, the blocks
// under raised tiles, windmill sails and movers as separate objects, the flag, water, the island
// ground, the sky and the scenery around the course.
import { THREE, model, grounded } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEVEL, rotY, type HoleDef, type ParsedHole, type ModelTris } from './kit';
import { Windmill, Slider, Sweeper } from './movers';
import type { Mover } from './physics';

export interface Theme {
  felt: number;
  border: number;
  wood: number;
  dark: number;
  ground: number;
  groundEdge: number;
  water: number;
  sky: [number, number, number];
  fog: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  ambient: number;
  sunDir: [number, number, number];
  trees: string[];
  bushes: string[];
  rocks: string[];
  extras: string[];
  /** Big kit buildings in the background (castle course). */
  backdrop: boolean;
}

export const THEMES: Record<'meadow' | 'castle', Theme> = {
  meadow: {
    felt: 0x2fbf71, border: 0xff4a5c, wood: 0xd9874a, dark: 0x2b2b2b,
    ground: 0x7cc75b, groundEdge: 0x5fae49, water: 0x3aa7e8,
    sky: [0x4aa8f0, 0x9fd8ff, 0xe8f7ff], fog: 0xcfeeff,
    sun: 0xfff4dc, sunI: 2.4, hemiSky: 0xeaf6ff, hemiGround: 0x6f8f4a, ambient: 1.55, sunDir: [-0.5, 1, 0.55],
    trees: ['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed'],
    bushes: ['plant_bush', 'plant_bushlarge', 'plant_bushdetailed'],
    rocks: ['rock_smalla', 'rock_smallc'],
    extras: ['flower_reda', 'flower_yellowa', 'flower_purplea', 'mushroom_red'],
    backdrop: false,
  },
  castle: {
    felt: 0x1f9e8a, border: 0x8f8fa8, wood: 0xc9773d, dark: 0x1f1f24,
    ground: 0x5d9a4c, groundEdge: 0x4a7d3e, water: 0x2f6fb0,
    sky: [0x2b2f6b, 0xc5608a, 0xffc07a], fog: 0xe9a988,
    sun: 0xffc38a, sunI: 2.3, hemiSky: 0xffd9c4, hemiGround: 0x4b4060, ambient: 1.35, sunDir: [0.75, 0.62, -0.35],
    trees: ['tree_pinedefaulta', 'tree_pinetallc', 'tree_pinerounda', 'tree_cone_dark'],
    bushes: ['plant_bushtriangle', 'plant_bushlargetriangle'],
    rocks: ['rock_largea', 'stone_tallc', 'stone_talli'],
    extras: ['statue_column', 'statue_obelisk', 'mushroom_tan'],
    backdrop: true,
  },
};

/** Every nature-kit model the themes use (loaded in preload). */
export const DECOR_MODELS = [...new Set(Object.values(THEMES).flatMap((t) => [...t.trees, ...t.bushes, ...t.rocks, ...t.extras]))].concat(['lily_large']);

type MatClass = 'border' | 'green' | 'wood' | 'dark' | 'metal';
const matClass = (name: string): MatClass => (name === 'green' || name === '_defaultMat' ? 'green' : name === 'wood' ? 'wood' : name === 'dark' ? 'dark' : name === 'metal' ? 'metal' : 'border');

// ---------------------------------------------------------------- model triangles (for the physics)

const trisCache = new Map<string, Record<string, number[]>>();

/** Triangles of a kit model in its own frame, by material (windmill sails left out). */
export const kitTris: ModelTris = (name: string) => {
  let out = trisCache.get(name);
  if (out) return out;
  out = {};
  const obj = model('mg:' + name, { shadows: false });
  const blades = obj.getObjectByName('blades');
  blades?.parent?.remove(blades);
  obj.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry, pos = g.attributes.position, idx = g.index;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const arr = (out![mat.name] ??= []);
    const n = idx ? idx.count : pos.count;
    for (let k = 0; k < n; k++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, idx ? idx.getX(k) : k).applyMatrix4(m.matrixWorld);
      arr.push(v.x, v.y, v.z);
    }
  });
  trisCache.set(name, out);
  return out;
};

// ---------------------------------------------------------------- materials

/**
 * The nature kit's materials say metalness 1, which renders almost black without an environment
 * map: give each a matte twin once and share it.
 */
const matteCache = new Map<string, THREE.Material>();
export function matte<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const swap = (mat: THREE.Material): THREE.Material => {
      let out = matteCache.get(mat.uuid);
      if (!out) {
        out = mat.clone();
        (out as THREE.MeshStandardMaterial).metalness = 0;
        (out as THREE.MeshStandardMaterial).roughness = 0.9;
        matteCache.set(mat.uuid, out);
      }
      return out;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
  return obj;
}

export function themeMaterials(th: Theme): Record<MatClass, THREE.MeshStandardMaterial> {
  const mk = (color: number, rough = 0.85) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    return m;
  };
  return {
    green: mk(th.felt, 0.95),
    border: mk(th.border, 0.7),
    wood: mk(th.wood, 0.8),
    dark: mk(th.dark, 0.9),
    metal: mk(0xd8e6ee, 0.4),
  };
}

function skyTexture(c: [number, number, number]): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  grad.addColorStop(0, hex(c[0]));
  grad.addColorStop(0.55, hex(c[1]));
  grad.addColorStop(1, hex(c[2]));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small seeded random numbers (the scenery of a hole looks the same every time). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export interface Hole3D {
  root: THREE.Group;
  flag: THREE.Object3D;
  flagBase: THREE.Vector3;
  /** Windmill sail pivots (rotation.z follows the mover's angle). */
  sails: { pivot: THREE.Object3D; mover: Windmill }[];
  sliders: { mesh: THREE.Object3D; mover: Slider }[];
  sweepers: { mesh: THREE.Object3D; mover: Sweeper }[];
  /** Centre and radius of the course (camera framing). */
  center: THREE.Vector3;
  radius: number;
  waterMeshes: THREE.Mesh[];
  /** Trees, rocks and buildings around the course (hidden when the camera is among them). */
  decor: THREE.Object3D[];
  /** Geometries and materials made for this hole (freed with it). */
  owned: { dispose(): void }[];
}

/** Removes a hole from its scene and frees what was made for it (kit geometry is shared). */
export function disposeHole3D(h: Hole3D): void {
  h.root.parent?.remove(h.root);
  for (const o of h.owned) o.dispose();
  h.owned.length = 0;
}

/**
 * Builds the hole into `scene` (the caller owns the scene and clears it between holes).
 * `movers` are the physics movers of the hole, in makeMovers order.
 */
export function buildHole3D(scene: THREE.Scene, def: HoleDef, p: ParsedHole, th: Theme, movers: Mover[], seed: number): Hole3D {
  const root = new THREE.Group();
  scene.add(root);
  const mats = themeMaterials(th);
  const owned: { dispose(): void }[] = [...Object.values(mats)];
  const own = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };
  const geos: Record<MatClass, THREE.BufferGeometry[]> = { border: [], green: [], wood: [], dark: [], metal: [] };
  const sails: Hole3D['sails'] = [];
  const windmills = movers.filter((m): m is Windmill => m instanceof Windmill);

  const addStatic = (obj: THREE.Object3D) => {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
      let g = m.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      g.applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      geos[matClass(mat.name)].push(g);
    });
  };

  for (const t of p.tiles) {
    const obj = model('mg:' + t.model, { shadows: false });
    obj.position.set(t.col, t.level * LEVEL, t.row);
    obj.rotation.y = rotY(t.rot);
    const blades = obj.getObjectByName('blades');
    if (blades) {
      blades.parent?.remove(blades);
      const mover = windmills[sails.length];
      if (mover) {
        const pivot = new THREE.Group();
        pivot.position.set(mover.hx, mover.hy, mover.hz);
        pivot.rotation.y = rotY(t.rot);
        const spin = new THREE.Group();
        blades.position.set(0, 0, 0);
        spin.add(blades);
        spin.scale.setScalar(Windmill.SCALE);
        pivot.add(spin);
        spin.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const name = ((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material).name;
            m.material = mats[matClass(name)];
            m.castShadow = true;
          }
        });
        root.add(pivot);
        sails.push({ pivot: spin, mover });
      }
    }
    addStatic(obj);
    for (let l = 0; l < t.level; l++) {
      const b = model('mg:block', { shadows: false });
      b.position.set(t.col, l * LEVEL, t.row);
      addStatic(b);
    }
  }
  for (const k of Object.keys(geos) as MatClass[]) {
    if (!geos[k].length) continue;
    const merged = mergeGeometries(geos[k], false);
    geos[k].forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(own(merged), mats[k]);
    mesh.castShadow = k !== 'green' && k !== 'dark';
    mesh.receiveShadow = true;
    mesh.userData.ownMaterial = false;
    root.add(mesh);
  }

  // movers
  const sliders: Hole3D['sliders'] = [];
  const sweepers: Hole3D['sweepers'] = [];
  for (const m of movers) {
    if (m instanceof Slider) {
      const b = model('mg:block');
      b.scale.set(m.hw * 2, 0.8, m.hd * 2);
      b.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mats.wood; });
      const g = new THREE.Group();
      g.add(b);
      g.position.set(m.x, m.y0, m.z);
      root.add(g);
      sliders.push({ mesh: g, mover: m });
    } else if (m instanceof Sweeper) {
      const g = new THREE.Group();
      const bar = model('mg:block');   // kit pivots are centred on x/z, so it turns round its middle
      bar.scale.set(m.d.len, 0.55, Sweeper.HALF_T * 2);
      bar.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mats.wood; });
      g.add(bar);
      const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.045, 0.055, 0.2, 14)), mats.border);
      post.position.y = 0.1;
      post.castShadow = true;
      g.add(post);
      const cap = new THREE.Mesh(own(new THREE.SphereGeometry(0.05, 14, 10)), mats.wood);
      cap.position.y = 0.2;
      g.add(cap);
      g.position.set(m.d.col, m.y0, m.d.row);
      root.add(g);
      sweepers.push({ mesh: g, mover: m });
    }
  }

  // the flag in the cup
  const flag = model('mg:flag_red');
  flag.scale.setScalar(0.75);
  const flagBase = new THREE.Vector3(p.cup.x, p.cup.y - 0.03, p.cup.z);
  flag.position.copy(flagBase);
  flag.rotation.y = -0.6;
  root.add(flag);

  // the tee mat
  const mat = new THREE.Mesh(own(new THREE.PlaneGeometry(0.3, 0.22)), own(new THREE.MeshStandardMaterial({ color: new THREE.Color(th.felt).multiplyScalar(0.62), roughness: 1 })));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(p.tee.x, p.tee.y + 0.0015, p.tee.z);
  mat.receiveShadow = true;
  root.add(mat);

  // the island: ground disc, a darker fringe, water around
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const t of p.tiles) {
    minX = Math.min(minX, t.col); maxX = Math.max(maxX, t.col);
    minZ = Math.min(minZ, t.row); maxZ = Math.max(maxZ, t.row);
  }
  const center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const radius = Math.hypot(maxX - minX + 1, maxZ - minZ + 1) / 2;
  const groundMat = own(new THREE.MeshStandardMaterial({ color: th.ground, roughness: 1 }));
  const ground = new THREE.Mesh(own(new THREE.CircleGeometry(radius + 4.5, 48)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.002, center.z);
  ground.receiveShadow = true;
  ground.scale.set(1, 1.15, 1);
  root.add(ground);
  const fringe = new THREE.Mesh(own(new THREE.PlaneGeometry(maxX - minX + 1.5, maxZ - minZ + 1.5)), own(new THREE.MeshStandardMaterial({ color: th.groundEdge, roughness: 1 })));
  fringe.rotation.x = -Math.PI / 2;
  fringe.position.set(center.x, -0.001, center.z);
  fringe.receiveShadow = true;
  root.add(fringe);
  const sea = new THREE.Mesh(own(new THREE.PlaneGeometry(400, 400)), own(new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.35, metalness: 0.1 })));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(center.x, -0.06, center.z);
  root.add(sea);
  const sand = new THREE.Mesh(own(new THREE.RingGeometry(radius + 4.3, radius + 5, 48)), own(new THREE.MeshStandardMaterial({ color: 0xe8d39a, roughness: 1 })));
  sand.rotation.x = -Math.PI / 2;
  sand.scale.set(1, 1.15, 1);
  sand.position.set(center.x, -0.003, center.z);
  root.add(sand);

  // ponds on the course: out of bounds with a splash
  const waterMeshes: THREE.Mesh[] = [];
  const pondMat = own(new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.92 }));
  for (const [x0, z0, x1, z1] of def.water ?? []) {
    const w = new THREE.Mesh(own(new THREE.PlaneGeometry(x1 - x0, z1 - z0)), pondMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    w.receiveShadow = true;
    root.add(w);
    waterMeshes.push(w);
  }

  // scenery, kept clear of the course and the ponds
  const rnd = seeded(seed * 7919 + 13);
  const occupied = (x: number, z: number, m: number) =>
    p.tiles.some((t) => Math.abs(t.col - x) < 0.5 + m && Math.abs(t.row - z) < 0.5 + m) ||
    (def.water ?? []).some(([x0, z0, x1, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
  const decor: THREE.Object3D[] = [];
  const place = (key: string, x: number, z: number, s: number) => {
    const o = grounded(matte(model(key)));
    o.scale.setScalar(s);
    o.position.set(x, 0, z);
    o.rotation.y = rnd() * Math.PI * 2;
    root.add(o);
    decor.push(o);
  };
  const R = radius + 4;
  for (let k = 0; k < 80; k++) {
    const a = rnd() * Math.PI * 2, r = radius * 0.6 + Math.sqrt(rnd()) * (R - radius * 0.6);
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r * 1.15;
    const pick = rnd();
    if (pick < 0.32) {
      if (!occupied(x, z, 1.3)) place(th.trees[Math.floor(rnd() * th.trees.length)], x, z, 1.5 + rnd() * 0.7);
    } else if (pick < 0.55) {
      if (!occupied(x, z, 0.45)) place(th.bushes[Math.floor(rnd() * th.bushes.length)], x, z, 1.1 + rnd() * 0.6);
    } else if (pick < 0.7) {
      if (!occupied(x, z, 0.5)) place(th.rocks[Math.floor(rnd() * th.rocks.length)], x, z, 0.7 + rnd() * 0.6);
    } else if (!occupied(x, z, 0.25)) {
      place(th.extras[Math.floor(rnd() * th.extras.length)], x, z, 1 + rnd() * 0.5);
    }
  }
  for (const [x0, z0, x1, z1] of def.water ?? []) {
    if (x1 - x0 < 0.9 || z1 - z0 < 0.9) continue;   // no lilies in a gap's well
    for (let k = 0; k < 2; k++) {
      const l = grounded(matte(model('lily_large')));
      l.position.set(x0 + 0.2 + rnd() * (x1 - x0 - 0.4), 0.006, z0 + 0.2 + rnd() * (z1 - z0 - 0.4));
      l.scale.setScalar(0.8);
      root.add(l);
    }
  }
  if (th.backdrop) {
    // big castles from the kit behind the course
    for (const [dx, dz, s, ry] of [[-2.6, -3.2, 3.2, 0.3], [3.2, -2.4, 2.4, -0.5], [0.4, -4.6, 4, 0]] as const) {
      const c = model('mg:castle');
      c.scale.setScalar(s);
      decor.push(c);
      c.position.set(center.x + dx, 0, minZ + dz);
      c.rotation.y = ry;
      root.add(c);
    }
  }
  return { root, flag, flagBase, sails, sliders, sweepers, center, radius, waterMeshes, owned, decor };
}

/** Sky gradient, fog and light for a theme. */
export function dressWorld(scene: THREE.Scene, th: Theme): void {
  if (scene.background instanceof THREE.Texture) scene.background.dispose();
  scene.background = skyTexture(th.sky);
  scene.fog = new THREE.Fog(th.fog, 14, 34);
}

/** Puffy low-poly clouds far around the course. */
export function addClouds(scene: THREE.Scene, center: THREE.Vector3, tint = 0xffffff): THREE.Object3D[] {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: tint, flatShading: true });
  const out: THREE.Object3D[] = [];
  const rnd = seeded(99);
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(geo, mat);
    c.scale.set(2 + rnd() * 3, 0.8 + rnd() * 0.6, 1.5 + rnd() * 2);
    const a = rnd() * Math.PI * 2;
    c.position.set(center.x + Math.cos(a) * (14 + rnd() * 6), 5 + rnd() * 4, center.z + Math.sin(a) * (14 + rnd() * 6));
    scene.add(c);
    out.push(c);
  }
  return out;
}
