// Astro Crew: the 3D kit. What the game loads (Quaternius's Ultimate Space Kit, converted by
// import-kit.mjs) and how it is drawn with few draw calls:
//   - every model is flat vertex colours (the kit's atlas was baked in on import), so the static
//     scenery of a planet merges into one lit mesh (mergeModels);
//   - the cast is rigged: `astronauts` (four animals on one skeleton plus the pistol), the four
//     mechs, the aliens `blobs` (two on one skeleton), `flyer` and `brute`, drawn by figure.ts;
//   - pickups, rovers and ships are small models placed as copies;
//   - keepPrograms() compiles a copy of every material kind behind the menu, so the first Play
//     frame finds its shader programs ready.
import Phaser from 'phaser';
import { THREE, model, loadModel } from '@core/three';
import { asset } from '@core';

export const sk = (m: string): string => 'ac:' + m;

export const PLANET_MODELS = Array.from({ length: 11 }, (_, i) => `planet-${i + 1}`);

/** The kit's models the game loads (public/assets/quaternius/space-kit). */
export const KIT_MODELS = [
  'astronauts', 'mech-bee', 'mech-flamingo', 'mech-frog', 'mech-panda', 'blobs', 'flyer', 'brute',
  'rover-1', 'rover-2', 'rover-round', 'ship-bee', 'ship-flamingo', 'ship-frog', 'ship-panda',
  'bullets', 'crate', 'health', 'jar', 'keycard', 'sphere', 'thunder',
  'base-large', 'building-l', 'connector', 'dome', 'house-cylinder', 'house-long', 'house-single', 'house-support',
  'metal-support', 'ramp', 'stairs', 'roof-antenna', 'roof-radar', 'roof-vent', 'solar-ground', 'solar-structure',
  ...PLANET_MODELS,
  'rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-large-1', 'rock-large-2', 'rock-large-3',
  'bush-1', 'bush-2', 'bush-3', 'grass-1', 'grass-2', 'grass-3', 'plant-1', 'plant-2', 'plant-3',
  'tree-blob-1', 'tree-blob-2', 'tree-blob-3', 'tree-floating-1', 'tree-floating-2',
  'tree-lava-1', 'tree-lava-2', 'tree-lava-3', 'tree-light-1', 'tree-light-2', 'tree-spikes-1', 'tree-spikes-2',
  'tree-spiral-1', 'tree-spiral-2', 'tree-spiral-3', 'tree-swirl-1', 'tree-swirl-2',
] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const m of KIT_MODELS) loadModel(load, sk(m), asset(`quaternius/space-kit/${m}.glb`));
}

// ------------------------------------------------------------------ materials

/** The flat-colour Lambert every model draws with. */
export const litMaterial = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });

// ------------------------------------------------------------------ geometry

interface Part { geo: THREE.BufferGeometry; mat: THREE.Matrix4 }
const partCache = new Map<string, Part[]>();

/** A static model's meshes and their matrices inside the file. */
export function modelParts(key: string): Part[] {
  let parts = partCache.get(key);
  if (parts) return parts;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  parts = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) parts!.push({ geo: m.geometry, mat: m.matrixWorld.clone() });
  });
  partCache.set(key, parts);
  return parts;
}

export interface Placed { key: string; x: number; y: number; z: number; rot: number; s: number; tilt?: number; roll?: number; tint?: number }

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpNM = new THREE.Matrix3();
const tmpC = new THREE.Color();

/** Merges placed models into one plain geometry (position, normal, colour). */
export function mergeModels(list: Placed[]): THREE.BufferGeometry {
  const jobs: { geo: THREE.BufferGeometry; m: THREE.Matrix4; tint?: number }[] = [];
  for (const p of list) {
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt ?? 0, p.rot, p.roll ?? 0, 'XZY')),
      new THREE.Vector3(p.s, p.s, p.s),
    );
    for (const part of modelParts(sk(p.key))) jobs.push({ geo: part.geo, m: place.clone().multiply(part.mat), tint: p.tint });
  }
  return build(jobs);
}

function build(jobs: { geo: THREE.BufferGeometry; m: THREE.Matrix4; tint?: number }[]): THREE.BufferGeometry {
  let verts = 0;
  for (const j of jobs) verts += j.geo.index ? j.geo.index.count : j.geo.getAttribute('position').count;
  const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3), C = new Float32Array(verts * 3);
  let o = 0;
  for (const { geo, m, tint } of jobs) {
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), col = geo.getAttribute('color');
    tmpNM.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    if (tint !== undefined) tmpC.setHex(tint); else tmpC.setRGB(1, 1, 1);
    for (let i = 0; i < n; i++, o++) {
      const ii = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      const v = idx ? idx.getX(ii) : ii;
      tmpV.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      P[o * 3] = tmpV.x; P[o * 3 + 1] = tmpV.y; P[o * 3 + 2] = tmpV.z;
      if (nor) { tmpN.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(tmpNM).normalize(); N[o * 3] = tmpN.x; N[o * 3 + 1] = tmpN.y; N[o * 3 + 2] = tmpN.z; }
      if (col) { C[o * 3] = col.getX(v) * tmpC.r; C[o * 3 + 1] = col.getY(v) * tmpC.g; C[o * 3 + 2] = col.getZ(v) * tmpC.b; }
      else { C[o * 3] = tmpC.r; C[o * 3 + 1] = tmpC.g; C[o * 3 + 2] = tmpC.b; }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}

/** One model as a single plain geometry centred on x/z, standing on y = 0 (or centred in y). Cached. */
const soloCache = new Map<string, THREE.BufferGeometry>();
export function soloGeometry(key: string, scale = 1, mode: 'stand' | 'centre' | 'raw' = 'stand'): THREE.BufferGeometry {
  const ck = key + ':' + scale + ':' + mode;
  let g = soloCache.get(ck);
  if (g) return g;
  const parts = modelParts(sk(key)).map((p) => ({ geo: p.geo, m: new THREE.Matrix4().makeScale(scale, scale, scale).multiply(p.mat) }));
  g = build(parts);
  if (mode !== 'raw') {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, mode === 'stand' ? -b.min.y : -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  }
  g.computeBoundingSphere();
  soloCache.set(ck, g);
  return g;
}

/** Bounding box of a model (model units). */
export function modelBox(key: string): THREE.Box3 {
  const g = soloGeometry(key, 1, 'raw');
  g.computeBoundingBox();
  return g.boundingBox!.clone();
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when its
 * scene shuts down, which drops their programs too, so the Play scene's first frame would compile
 * them all again. This compiles a copy of every material and object kind behind the menu, under
 * the same lights and fog, into a keeper scene that is never freed.
 */
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  const seen = new Set<string>();
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh;
      const sk2 = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const pts = (o as THREE.Points).isPoints;
      const kind = pts ? 'pts' : sk2 ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const a = mat as THREE.MeshBasicMaterial;
      const key = kind + ':' + mat.type + ':' + (mat.customProgramCacheKey?.() ?? '') + ':' + [!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, a.depthWrite].join() + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      let k: THREE.Object3D;
      if (pts) k = new THREE.Points((o as THREE.Points).geometry, c);
      else if (sk2) {
        const src = o as THREE.SkinnedMesh;
        const ks = new THREE.SkinnedMesh(src.geometry, c);
        ks.bind(src.skeleton, src.bindMatrix);
        k = ks;
      } else if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      k.castShadow = o.castShadow;
      k.receiveShadow = o.receiveShadow;
      k.frustumCulled = false;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}
