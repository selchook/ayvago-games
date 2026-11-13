// Delivery Dash: the 3D kit. Loads the models (Kenney Road Pack tiles, City Kit Suburban /
// Commercial / Roads, Nature Kit, Car Kit, Food Kit, Mini Characters) and builds geometry from
// them:
//   - static scenery merged per material: every textured kit becomes one mesh per kit texture,
//     and everything flat-coloured (the road tiles, trees, Car Kit parts …) one mesh whose
//     material colours are baked into vertex colours, so a whole district is a handful of draw
//     calls;
//   - instanced traffic: each Car Kit model merged into one geometry with vertex colours and a
//     `paint` mask, drawn as one InstancedMesh whose body paint comes from the instance colour.
import Phaser from 'phaser';
import { THREE, model, loadKenney3d, loadMiniCharacter, MINI_MALES } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_TILES } from './tiles';
import { VEHICLES } from './defs';
import { CAR_TYPES } from './sim';

export const SUBURBAN = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-f', 'building-type-k', 'building-type-m', 'building-type-o', 'fence-1x4', 'planter', 'tree-large', 'tree-small'] as const;
export const COMMERCIAL = ['building-a', 'building-c', 'building-e', 'building-g', 'building-h', 'building-k', 'detail-parasol-a', 'low-detail-building-a', 'low-detail-building-c', 'low-detail-building-wide-a'] as const;
export const ROADS = ['light-square', 'light-curved', 'construction-cone'] as const;
export const NATURE = ['tree_default', 'tree_oak', 'tree_simple', 'tree_small', 'plant_bush', 'plant_bushlarge', 'flower_reda', 'flower_yellowa', 'flower_purplea'] as const;
export const FOOD = ['cupcake', 'burger', 'ice-cream', 'soda'] as const;
/** People: the Mini Characters (pedestrians and the residents who open the door). */
export const PEOPLE = [...MINI_MALES, 'character-female-f'];

export const tileKey = (id: number): string => 'rt:' + id;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const id of ROAD_TILES) loadKenney3d(load, tileKey(id), 'road-pack', 'tile' + String(id).padStart(3, '0'));
  for (const n of SUBURBAN) loadKenney3d(load, 'su:' + n, 'city-kit-suburban', n);
  for (const n of COMMERCIAL) loadKenney3d(load, 'co:' + n, 'city-kit-commercial', n);
  for (const n of ROADS) loadKenney3d(load, 'ro:' + n, 'city-kit-roads', n);
  for (const n of NATURE) loadKenney3d(load, 'na:' + n, 'nature-kit', n);
  for (const n of FOOD) loadKenney3d(load, 'fo:' + n, 'food-kit', n);
  const cars = new Set([...VEHICLES.map((v) => v.model), ...CAR_TYPES.map((c) => c.model), 'tractorshovel']);
  for (const n of cars) loadKenney3d(load, 'car:' + n, 'car-kit', n);
  for (const n of PEOPLE) loadMiniCharacter(load, n);
}

// ------------------------------------------------------------------ model parts

export interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; name: string }

const partsCache = new Map<string, Part[]>();

function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = g.attributes[name];
    if (!a) continue;
    const n = a.itemSize, arr = a.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3 * n) for (let k = 0; k < n; k++) { const t = arr[i + n + k]; arr[i + n + k] = arr[i + 2 * n + k]; arr[i + 2 * n + k] = t; }
  }
  return g;
}

/** A model's meshes as non-indexed geometries in model space (position, normal, uv), per material. */
export function partsOf(key: string): Part[] {
  let parts = partsCache.get(key);
  if (parts) return parts;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const add = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      let ng = g.index ? g.toNonIndexed() : g.clone();
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') ng.deleteAttribute(a);
      if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
      if (!ng.attributes.normal) ng.computeVertexNormals();
      ng.applyMatrix4(m.matrixWorld);
      if (m.matrixWorld.determinant() < 0) ng = flipWinding(ng);
      const list = byMat.get(mat) ?? [];
      list.push(ng);
      byMat.set(mat, list);
    };
    if (mats.length === 1 || !m.geometry.groups.length) add(m.geometry, mats[0]);
    else for (const gr of m.geometry.groups) {
      const sub = m.geometry.clone();
      sub.clearGroups();
      if (sub.index) sub.setIndex(Array.from(sub.index.array).slice(gr.start, gr.start + gr.count));
      add(sub, mats[gr.materialIndex ?? 0]);
    }
  });
  parts = [...byMat].map(([mat, list]) => {
    const geo = mergeGeometries(list, false)!;
    list.forEach((g) => g.dispose());
    return { geo, mat, name: mat.name ?? '' };
  });
  partsCache.set(key, parts);
  return parts;
}

/** Bounding box of a model (model units). */
const boxCache = new Map<string, THREE.Box3>();
export function boxOf(key: string): THREE.Box3 {
  let b = boxCache.get(key);
  if (!b) {
    b = new THREE.Box3();
    for (const p of partsOf(key)) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox!); }
    boxCache.set(key, b);
  }
  return b;
}

const texOf = (mat: THREE.Material): THREE.Texture | null => (mat as THREE.MeshStandardMaterial).map ?? null;

/** Bakes a flat material's colour into a geometry's vertex colours (and drops its UVs). */
function bake(g: THREE.BufferGeometry, color: THREE.Color, paint = 0): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (paint >= 0) g.setAttribute('paint', new THREE.Float32BufferAttribute(new Float32Array(n).fill(paint), 1));
  return g;
}

/** A material's flat colour (glTF base colour). */
const colorOf = (mat: THREE.Material): THREE.Color => ((mat as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1)).clone();

// ------------------------------------------------------------------ materials (per world)

export class Mats {
  private cache = new Map<THREE.Texture, THREE.MeshLambertMaterial>();
  /** Every flat-coloured thing: vertex colours. */
  readonly flat = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** Instanced cars: vertex colours, body paint from the instance colour. */
  readonly car: THREE.MeshLambertMaterial;
  /** The water of the river (its own material so it can shimmer). */
  readonly water = new THREE.MeshLambertMaterial({ color: 0x3f9fe0 });

  constructor() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float paint;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.xyz = mix(color.xyz, instanceColor.xyz, paint);\n#endif');
    };
    m.customProgramCacheKey = () => 'dd-car';
    this.car = m;
  }

  of(map: THREE.Texture): THREE.MeshLambertMaterial {
    let m = this.cache.get(map);
    if (m) return m;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    m = new THREE.MeshLambertMaterial({ map });
    this.cache.set(map, m);
    return m;
  }

  all(): THREE.Material[] { return [...this.cache.values(), this.flat, this.car, this.water]; }
}

// ------------------------------------------------------------------ merging

export const mat4 = (x: number, y: number, z: number, rotY = 0, s = 1, sy = s, sz = s): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, sy, sz));

/** Collects transformed model parts per material and builds one mesh per material. */
export class Merger {
  private tex = new Map<THREE.Texture, THREE.BufferGeometry[]>();
  private flat: THREE.BufferGeometry[] = [];
  private water: THREE.BufferGeometry[] = [];

  /** Adds a model; `tint` recolours flat parts by material name (e.g. water). */
  add(key: string, m: THREE.Matrix4, o: { tint?: (name: string, c: THREE.Color) => THREE.Color | 'water' | null } = {}): void {
    for (const p of partsOf(key)) {
      let g = p.geo.clone();
      g.applyMatrix4(m);
      if (m.determinant() < 0) g = flipWinding(g);
      const map = texOf(p.mat);
      if (map) { this.pushTex(map, g); continue; }
      const c = o.tint ? o.tint(p.name, colorOf(p.mat)) : colorOf(p.mat);
      if (c === null) { g.dispose(); continue; }
      if (c === 'water') { g.deleteAttribute('uv'); this.water.push(g); continue; }
      this.flat.push(bake(g, c, -1));
    }
  }

  /** Adds a plain geometry in one colour. */
  addFlat(g: THREE.BufferGeometry, color: number | THREE.Color, m?: THREE.Matrix4): void {
    let ng = g.index ? g.toNonIndexed() : g.clone();
    for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
    if (m) { ng.applyMatrix4(m); if (m.determinant() < 0) ng = flipWinding(ng); }
    this.flat.push(bake(ng, typeof color === 'number' ? new THREE.Color(color) : color, -1));
  }

  private pushTex(map: THREE.Texture, g: THREE.BufferGeometry): void {
    const l = this.tex.get(map) ?? [];
    l.push(g);
    this.tex.set(map, l);
  }

  build(mats: Mats, parent: THREE.Object3D, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    const make = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!list.length) return;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = o.cast ?? true;
      mesh.receiveShadow = o.receive ?? true;
      parent.add(mesh);
      out.push(mesh);
    };
    for (const [map, list] of this.tex) make(list, mats.of(map));
    make(this.flat, mats.flat);
    if (this.water.length) { const before = out.length; make(this.water, mats.water); if (out.length > before) out[out.length - 1].castShadow = false; }
    this.tex.clear();
    this.flat = [];
    this.water = [];
    return out;
  }
}

// ------------------------------------------------------------------ instanced cars

/** A Car Kit model as one geometry: vertex colours, a paint mask for the body, scaled. */
export function carGeometry(key: string, scale: number, painted = true): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const box = boxOf(key);
  const cxm = (box.min.x + box.max.x) / 2, czm = (box.min.z + box.max.z) / 2;
  const m = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-cxm, -box.min.y, -czm));
  for (const p of partsOf(key)) {
    const g = p.geo.clone();
    g.applyMatrix4(m);
    const paint = painted && /^paint/i.test(p.name) ? 1 : 0;
    geos.push(bake(g, colorOf(p.mat), paint));
  }
  const out = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return out;
}
