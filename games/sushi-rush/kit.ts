// Sushi Rush: the 3D kit. What the game loads (Quaternius's Sushi Restaurant Kit, converted by
// import-kit.mjs) and how it is drawn with few draw calls:
//   - every model is flat vertex colours (the kit's atlas was baked in on import), so the whole
//     restaurant merges into one lit mesh plus one unlit "glow" mesh (shoji paper, lantern paper);
//   - the cast is two rigged files: `rabbits` (seven rabbits on one skeleton, plus a knife and a
//     pan) and `panda` (body, headband, knife, pan), drawn by figure.ts;
//   - food on plates and counters are small models from the same kit (instanced per kind);
//   - keepPrograms() compiles a copy of every material kind behind the menu, so the first Play
//     frame finds its shader programs ready.
import Phaser from 'phaser';
import { THREE, model, loadModel } from '@core/three';
import { asset } from '@core';

export const sk = (m: string): string => 'sk:' + m;

/** The kit's models the game loads (public/assets/quaternius/sushi-kit). */
export const KIT_MODELS = [
  'panda', 'rabbits',
  'floor-wood', 'floor-kitchen', 'wall-shoji', 'wall-normal', 'wall-shelves', 'wall-door',
  'counter', 'counter-bar', 'counter-drawers', 'counter-doors', 'counter-end', 'counter-sink', 'cabinet-shelves', 'cabinet-doors',
  'fridge', 'oven', 'pot1', 'pot2-empty', 'plate', 'bowl', 'cutting-table', 'knives', 'board', 'steamer',
  'stool', 'table', 'chair', 'bottles', 'bottle',
  'lantern', 'sign', 'sakura-tree', 'sakura-flower', 'bamboo', 'plant1', 'plant2', 'carpet', 'bell', 'deco-fish',
  'maguro-nigiri', 'salmon-nigiri', 'ebi-nigiri', 'tamago-nigiri', 'octopus-nigiri', 'roll', 'salmon-roll', 'urchin-roll', 'onigiri', 'gyoza', 'chukaman',
  'dango', 'ramen', 'udon', 'wasabi',
  'rice', 'nori', 'tuna', 'salmon', 'salmon-fish', 'ebi', 'tentacle', 'cucumber', 'cucumber-cut', 'urchin', 'fish-fillet',
] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const m of KIT_MODELS) loadModel(load, sk(m), asset(`quaternius/sushi-kit/${m}.glb`));
}

// ------------------------------------------------------------------ materials

/** The flat-colour Lambert every model draws with. */
export const litMaterial = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });
/** The kit's glowing parts (shoji and lantern paper): vertex colours, unlit, a little brighter. */
export const glowMaterial = (): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.color.setRGB(1.25, 1.12, 0.95);
  return m;
};

// ------------------------------------------------------------------ geometry

interface Part { geo: THREE.BufferGeometry; mat: THREE.Matrix4; glow: boolean }
const partCache = new Map<string, Part[]>();

/** A static model's meshes, their matrices inside the file and whether they glow. */
export function modelParts(key: string): Part[] {
  let parts = partCache.get(key);
  if (parts) return parts;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  parts = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    // multi-material meshes come in as groups; three.js splits glTF primitives into child meshes
    parts!.push({ geo: m.geometry, mat: m.matrixWorld.clone(), glow: mats[0]?.name === 'glow' });
  });
  partCache.set(key, parts);
  return parts;
}

export interface Placed { key: string; x: number; y: number; z: number; rot: number; s: number; tilt?: number; sx?: number; sy?: number }

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpNM = new THREE.Matrix3();

/**
 * Merges placed models into plain geometries (position, normal, colour): one for the lit parts,
 * one for the glowing parts. Reads every attribute through getX…, so quantized files come out right.
 */
export function mergeModels(list: Placed[]): { lit: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const jobs: { lit: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[]; glow: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] } = { lit: [], glow: [] };
  for (const p of list) {
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt ?? 0, p.rot, 0, 'YXZ')),
      new THREE.Vector3(p.s * (p.sx ?? 1), p.s * (p.sy ?? 1), p.s),
    );
    for (const part of modelParts(sk(p.key))) (part.glow ? jobs.glow : jobs.lit).push({ geo: part.geo, m: place.clone().multiply(part.mat) });
  }
  return { lit: build(jobs.lit), glow: build(jobs.glow) };
}

function build(jobs: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[]): THREE.BufferGeometry {
  let verts = 0;
  for (const j of jobs) verts += j.geo.index ? j.geo.index.count : j.geo.getAttribute('position').count;
  const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3), C = new Float32Array(verts * 3);
  let o = 0;
  for (const { geo, m } of jobs) {
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), col = geo.getAttribute('color');
    tmpNM.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++, o++) {
      // a mirrored placement flips the winding: swap two corners of every triangle
      const ii = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      const v = idx ? idx.getX(ii) : ii;
      tmpV.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      P[o * 3] = tmpV.x; P[o * 3 + 1] = tmpV.y; P[o * 3 + 2] = tmpV.z;
      if (nor) { tmpN.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(tmpNM).normalize(); N[o * 3] = tmpN.x; N[o * 3 + 1] = tmpN.y; N[o * 3 + 2] = tmpN.z; }
      if (col) { C[o * 3] = col.getX(v); C[o * 3 + 1] = col.getY(v); C[o * 3 + 2] = col.getZ(v); }
      else C[o * 3] = C[o * 3 + 1] = C[o * 3 + 2] = 1;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}

/** One model as a single plain geometry (lit and glow parts together) centred on x/z, standing on y = 0. */
const soloCache = new Map<string, THREE.BufferGeometry>();
export function soloGeometry(key: string, scale = 1, centre = true): THREE.BufferGeometry {
  const ck = key + ':' + scale + ':' + centre;
  let g = soloCache.get(ck);
  if (g) return g;
  const parts = modelParts(sk(key)).map((p) => ({ geo: p.geo, m: new THREE.Matrix4().makeScale(scale, scale, scale).multiply(p.mat) }));
  g = build(parts);
  if (centre) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  }
  g.computeBoundingSphere();
  soloCache.set(ck, g);
  return g;
}

/** Bounding box of a model (model units). */
export function modelBox(key: string): THREE.Box3 {
  const g = soloGeometry(key, 1, false);
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
      if ((mat as THREE.ShaderMaterial).uniforms) (c as THREE.ShaderMaterial).uniforms = (mat as THREE.ShaderMaterial).uniforms;
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
