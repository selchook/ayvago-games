// Skull Isle: the 3D kit. What the game loads (the Quaternius Pirate Kit, a few Kenney Pirate Kit
// props) and how it is turned into few draw calls:
//   - Every Quaternius model is flat vertex colours (the kit's atlas was baked in on import), so the
//     whole island's scenery merges into one mesh with one Lambert material; the Kenney props share
//     one texture and merge into a second.
//   - People are the kit's rigged models drawn as themselves (figure.ts).
//   - keepPrograms() compiles a copy of every material kind behind the menu, so the first Play
//     frame finds its shader programs ready.
import Phaser from 'phaser';
import { THREE, model, loadModel, kenney3d } from '@core/three';
import { asset } from '@core';

export const pk = (m: string): string => 'pk:' + m;
export const kk = (m: string): string => 'kk:' + m;

/** The Quaternius models the game uses (public/assets/quaternius/pirate-kit). */
export const PIRATE_MODELS = [
  'anne', 'henry', 'mako', 'sharky', 'barbarossa', 'skeleton', 'headless', 'shark', 'tentacle', 'parrot',
  'anchor', 'barrel', 'bones', 'bucket-fishes', 'cannon', 'chest-closed', 'chest-gold', 'cliff1', 'cliff3', 'coin', 'coins',
  'cutlass', 'dock', 'dock-broken', 'fish', 'goldbag', 'house1', 'house2', 'house3', 'palm1', 'palm2', 'palm3', 'pistol',
  'rock', 'sawmill', 'ship-large', 'ship-small', 'skull', 'skulls', 'sword',
] as const;

/** Kenney Pirate Kit stand-ins for the kit's files that could not be had (rocks, cannonballs, bottles, crates). */
export const KENNEY_MODELS = ['cannon-ball', 'crate', 'rocks-sand-c', 'rocks-c', 'bottle-large'] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const m of PIRATE_MODELS) loadModel(load, pk(m), asset(`quaternius/pirate-kit/${m}.glb`));
  for (const m of KENNEY_MODELS) loadModel(load, kk(m), kenney3d('pirate-kit', m));
}

// ------------------------------------------------------------------ materials

/** The flat-colour Lambert every Quaternius model draws with. */
export const pirateMaterial = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });

/**
 * The scenery's Lambert (vertex colours, or the Kenney map) with a see-through: whatever stands
 * between the camera and the hero (a palm's crown, a house, the ship) is dithered away in a soft
 * cylinder round the line of sight, so the fight always shows. `hero` and `cam` move every frame.
 */
export function sceneryMaterial(hero: THREE.Vector3, cam: THREE.Vector3, map: THREE.Texture | null = null): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial(map ? { map } : { vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHero = { value: hero };
    sh.uniforms.uCam = { value: cam };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGp;\nuniform vec3 uHero;\nuniform vec3 uCam;')
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        'vec3 sl = uHero - uCam;',
        'float sll = length(sl);',
        'vec3 sd = sl / sll;',
        'float along = dot(vGp - uCam, sd);',
        'if (along < sll - 0.6 && vGp.y > 0.9) {',
        '  float side = length(vGp - uCam - sd * along);',
        '  float k = smoothstep(2.6, 1.3, side) * smoothstep(sll - 0.6, sll - 2.5, along);',
        '  vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);',
        '  float th = (cell.x * 4.0 + cell.y + mod(cell.x + cell.y, 2.0) * 7.0) / 16.0;',
        '  if (fract(th) < k * 0.85) discard;',
        '}',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => (map ? 'si-scenery-map' : 'si-scenery');
  return mat;
}

/** The Kenney Pirate Kit's shared colour map. */
export function kenneyMap(): THREE.Texture | null {
  let map: THREE.Texture | null = null;
  model(kk('crate'), { shadows: false }).traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!map && m?.map) map = m.map;
  });
  return map;
}

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

export interface Placed { key: string; x: number; y: number; z: number; rot: number; s: number; tilt?: number }

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpNM = new THREE.Matrix3();

/**
 * Merges placed models into one plain geometry (position, normal, and colour or uv). Reads every
 * attribute through getX…, so quantized files (KHR_mesh_quantization) come out right.
 */
export function mergeModels(list: Placed[], kind: 'color' | 'uv'): THREE.BufferGeometry {
  const jobs: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  let verts = 0;
  for (const p of list) {
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt ?? 0, p.rot, 0, 'YXZ')),
      new THREE.Vector3(p.s, p.s, p.s),
    );
    for (const part of modelParts(p.key)) {
      const m = place.clone().multiply(part.mat);
      jobs.push({ geo: part.geo, m });
      verts += part.geo.index ? part.geo.index.count : part.geo.getAttribute('position').count;
    }
  }
  const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3);
  const C = kind === 'color' ? new Float32Array(verts * 3) : null;
  const U = kind === 'uv' ? new Float32Array(verts * 2) : null;
  let o = 0;
  for (const { geo, m } of jobs) {
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    const col = geo.getAttribute('color'), uv = geo.getAttribute('uv');
    tmpNM.getNormalMatrix(m);
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++, o++) {
      const v = idx ? idx.getX(i) : i;
      tmpV.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      P[o * 3] = tmpV.x; P[o * 3 + 1] = tmpV.y; P[o * 3 + 2] = tmpV.z;
      if (nor) { tmpN.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(tmpNM).normalize(); N[o * 3] = tmpN.x; N[o * 3 + 1] = tmpN.y; N[o * 3 + 2] = tmpN.z; }
      if (C) {
        if (col) { C[o * 3] = col.getX(v); C[o * 3 + 1] = col.getY(v); C[o * 3 + 2] = col.getZ(v); }
        else C[o * 3] = C[o * 3 + 1] = C[o * 3 + 2] = 1;
      }
      if (U && uv) { U[o * 2] = uv.getX(v); U[o * 2 + 1] = uv.getY(v); }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (U) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  return out;
}

/** One model as a single plain geometry centred on x/z and standing on y = 0 (for instancing). */
const soloCache = new Map<string, THREE.BufferGeometry>();
export function soloGeometry(key: string, kind: 'color' | 'uv' = 'color', scale = 1): THREE.BufferGeometry {
  const ck = key + kind + scale;
  let g = soloCache.get(ck);
  if (g) return g;
  g = mergeModels([{ key, x: 0, y: 0, z: 0, rot: 0, s: scale }], kind);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingSphere();
  soloCache.set(ck, g);
  return g;
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when its
 * scene shuts down, which drops their programs too, so the Play scene's first frame would compile
 * them all again. This compiles a copy of every material and object kind behind the menu, under
 * the same lights and fog, into a keeper scene that is never freed. Hidden objects count too
 * (pools are built ahead and shown later).
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
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh;
      const sk = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const kind = sk ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const key = kind + ':' + mat.type + ':' + (mat.customProgramCacheKey?.() ?? '') + ':' + JSON.stringify(materialKey(mat)) + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      if ((mat as THREE.ShaderMaterial).uniforms) (c as THREE.ShaderMaterial).uniforms = (mat as THREE.ShaderMaterial).uniforms;
      let k: THREE.Mesh;
      if (sk) {
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

function materialKey(m: THREE.Material): unknown {
  const a = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [!!a.map, !!a.vertexColors, a.transparent, a.blending, !!a.flatShading, a.side, a.fog, !!a.emissiveMap, a.depthWrite];
}
