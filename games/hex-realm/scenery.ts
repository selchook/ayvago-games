// Hex Realm 1.3: the battle scenery. Two Quaternius kits, made by import-scenery.mjs:
//   - the Medieval Village MegaKit (public/assets/quaternius/medieval-village/village.glb): walls,
//     floors, roofs, doors, windows, stairs, fences, crates, the wagon; its ten textures (256 px base
//     colours) become the layers of one array texture, so each piece keeps its repeating brick,
//     plaster, tile and wood;
//   - the Ultimate Nature Pack (public/assets/quaternius/nature-pack/nature.glb): trees, bushes,
//     rocks, stumps, logs, grass, crops, in vertex colours (they sample the white layer).
// Nothing here loads at boot: loadScenery() fetches both files once the menu is up (main.ts) and an
// arena shown before they arrive is rebuilt when they do (battleview.ts). An arena merges every piece
// into one indexed mesh (position, uv, colour, layer; no normals: the scenery is drawn flat-shaded),
// drawn with one material: Lambert on the array texture, walls between the camera and the hero
// dithered away.
import { THREE } from '@core/three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset } from '@core';
import type { Placed } from './keys';

/** The array texture's layers: white (vertex-coloured nature), the village kit's materials, a flat window glass. */
export const LAYERS = ['white', 'WoodTrim', 'Plaster', 'Brick', 'UnevenBrick', 'RockTrim', 'RoundTiles', 'RedBrick', 'Metal', 'Vine', 'Glass'] as const;
const LAYER_INDEX = new Map<string, number>(LAYERS.map((n, i) => [n, i]));
/** The material of the nature models (vertex colours on white). */
LAYER_INDEX.set('Color', 0);
const TEX = 256;
const GLASS = [64, 82, 96];

const KITS: [string, string][] = [['mv', 'quaternius/medieval-village/village.glb'], ['nt', 'quaternius/nature-pack/nature.glb']];

/** A model as plain arrays, in its own space (placed and merged by mergeScenery). */
interface Piece { pos: Float32Array; uv: Float32Array; col: Uint8Array; layer: Uint8Array; idx: Uint32Array }
const pieces = new Map<string, Piece>();
let promise: Promise<void> | null = null;
let ready = false;
/** The layers' pixels (LAYERS.length × 256 × 256 RGBA), painted once per page. */
let layerData: Uint8Array | null = null;
/** Bumped when the kits arrive (views rebuild what they showed without them). */
export let sceneryVersion = 0;

/** Starts loading the two kits (once per page); resolves when they are parsed. */
export function loadScenery(): Promise<void> {
  if (promise) return promise;
  promise = Promise.all(KITS.map(([prefix, path]) => loadKit(prefix, path))).then(() => {
    ready = true;
    sceneryVersion++;
  }, (err) => {
    console.error('[hex-realm] scenery failed to load', err);
    promise = null; // the next battle tries again
  });
  return promise;
}

export const sceneryReady = (): boolean => ready;

async function loadKit(prefix: string, path: string): Promise<void> {
  const res = await fetch(asset(path));
  if (!res.ok) throw new Error(path + ': ' + res.status);
  const data = await res.arrayBuffer();
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => new GLTFLoader().parse(data, '', resolve as never, reject));
  gltf.scene.updateMatrixWorld(true);
  for (const node of gltf.scene.children) pieces.set(prefix + ':' + node.name, extract(node));
  if (prefix === 'mv') paintLayers(gltf.scene);
  // the parsed copies were only read: let go of their images
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const map = (mat as THREE.MeshStandardMaterial).map;
      (map?.image as ImageBitmap | undefined)?.close?.();
      map?.dispose();
      mat.dispose();
    }
  });
}

/** One root node's meshes as one piece (their matrices, quantization included, applied). */
function extract(root: THREE.Object3D): Piece {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.geometry.getAttribute('position').count; ni += m.geometry.index!.count; }
  const out: Piece = { pos: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), col: new Uint8Array(nv * 3), layer: new Uint8Array(nv), idx: new Uint32Array(ni) };
  const v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), col = g.getAttribute('color');
    const layer = LAYER_INDEX.get((m.material as THREE.Material).name) ?? 0;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
      const k = vo + i;
      out.pos[k * 3] = v.x; out.pos[k * 3 + 1] = v.y; out.pos[k * 3 + 2] = v.z;
      if (uv) { out.uv[k * 2] = uv.getX(i); out.uv[k * 2 + 1] = uv.getY(i); }
      // vertex colours are linear; the shader takes them as they are
      out.col[k * 3] = col ? Math.round(col.getX(i) * 255) : 255;
      out.col[k * 3 + 1] = col ? Math.round(col.getY(i) * 255) : 255;
      out.col[k * 3 + 2] = col ? Math.round(col.getZ(i) * 255) : 255;
      out.layer[k] = layer;
    }
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) out.idx[io + i] = idx.getX(i) + vo;
    vo += pos.count; io += idx.count;
  }
  return out;
}

/** Paints the village kit's base colours (and the white and glass layers) into the layer pixels. */
function paintLayers(scene: THREE.Object3D): void {
  const data = layerData ?? new Uint8Array(LAYERS.length * TEX * TEX * 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const done = new Set<number>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const i = LAYER_INDEX.get(mat.name);
    const img = mat.map?.image as CanvasImageSource | undefined;
    if (i === undefined || done.has(i) || !img) return;
    done.add(i);
    g.clearRect(0, 0, TEX, TEX);
    g.drawImage(img, 0, 0, TEX, TEX);
    data.set(g.getImageData(0, 0, TEX, TEX).data, i * TEX * TEX * 4);
  });
  fill(data, 0, [255, 255, 255]);
  fill(data, LAYER_INDEX.get('Glass')!, GLASS);
  layerData = data;
}

function fill(data: Uint8Array, layer: number, c: number[]): void {
  for (let p = layer * TEX * TEX * 4, end = p + TEX * TEX * 4; p < end; p += 4) { data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255; }
}

// ------------------------------------------------------------------ the texture and the material

/**
 * The layers as an array texture (each view wraps the shared pixels in its own texture, freed with
 * its world). Before the kits arrive it is a flat grey; `refresh` uploads the pixels once they are in.
 */
export function sceneryTexture(): THREE.DataArrayTexture & { painted: boolean; refresh(): void } {
  const t = new THREE.DataArrayTexture((layerData ?? new Uint8Array(LAYERS.length * 4 * 4 * 4).fill(150)) as unknown as BufferSource, layerData ? TEX : 4, layerData ? TEX : 4, LAYERS.length) as THREE.DataArrayTexture & { painted: boolean; refresh(): void };
  t.painted = !!layerData;
  t.refresh = () => {
    if (t.painted || !layerData) return;
    t.image = { data: layerData, width: TEX, height: TEX, depth: LAYERS.length } as never;
    // a new size needs a new GPU texture: free the old one, three.js makes it again on the next draw
    t.dispose();
    t.painted = true;
    t.needsUpdate = true;
  };
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * The scenery's material: flat-shaded Lambert, the vertex colour times its layer of the array
 * texture (repeating), leaves cut out by their alpha. `hero` and `cam` dither away what stands
 * between the camera and the hero (above knee height).
 */
export function sceneryMaterial(tex: THREE.DataArrayTexture, hero: THREE.Vector3, cam: THREE.Vector3): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, alphaTest: 0.5 });
  // an own property, so the world's cleanup finds and frees the texture with the material
  (mat as unknown as { sceneryLayers: THREE.Texture }).sceneryLayers = tex;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLayers = { value: tex };
    sh.uniforms.uHero = { value: hero };
    sh.uniforms.uCam = { value: cam };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nvarying float vLayer;\nvarying vec2 vRep;\nvarying vec3 vGp;')
      // no normals in the scenery: an up vector keeps the shadow's normal bias finite
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRep = uv;\nvLayer = aLayer;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uLayers;\nvarying float vLayer;\nvarying vec2 vRep;\nvarying vec3 vGp;\nuniform vec3 uHero;\nuniform vec3 uCam;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture(uLayers, vec3(vRep, floor(vLayer + 0.5)));')
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        'vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);',
        'float th = fract((cell.x * 4.0 + cell.y + mod(cell.x + cell.y, 2.0) * 7.0) / 16.0);',
        'vec3 sl = uHero - uCam;',
        'float sll = length(sl);',
        'vec3 sd = sl / max(sll, 0.001);',
        'float along = dot(vGp - uCam, sd);',
        'if (uHero.y > -50.0 && along < sll - 0.8 && vGp.y > 0.5) {',
        '  float side = length(vGp - uCam - sd * along);',
        '  float k = smoothstep(2.4, 1.2, side) * smoothstep(sll - 0.8, sll - 2.6, along);',
        '  if (th < k * 0.85) discard;',
        '}',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'hr-scenery';
  return mat;
}

// ------------------------------------------------------------------ merging

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpV = new THREE.Vector3();

/** Extra flat pieces an arena adds (its ground): positions, colours, indices; drawn on the white layer. */
export interface Extra { pos: Float32Array; col: Uint8Array; idx: Uint32Array }

/**
 * Merges placed pieces (and extras) into one indexed geometry: position, uv, colour (× each
 * placement's tint), layer. Pieces not loaded yet are skipped.
 */
export function mergeScenery(list: Placed[], extras: Extra[] = []): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  const jobs: [Piece, Placed][] = [];
  for (const p of list) {
    const pc = pieces.get(p.key);
    if (!pc) continue;
    jobs.push([pc, p]);
    nv += pc.pos.length / 3; ni += pc.idx.length;
  }
  for (const e of extras) { nv += e.pos.length / 3; ni += e.idx.length; }
  const P = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Uint8Array(nv * 3), L = new Uint8Array(nv);
  const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const [pc, p] of jobs) {
    tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ.setFromEuler(tmpE.set(p.tilt ?? 0, p.rot, 0, 'YXZ')), tmpS.set(p.s, p.sy ?? p.s, p.s));
    const n = pc.pos.length / 3;
    const tr = p.tint === undefined ? 1 : ((p.tint >> 16) & 255) / 255, tg = p.tint === undefined ? 1 : ((p.tint >> 8) & 255) / 255, tb = p.tint === undefined ? 1 : (p.tint & 255) / 255;
    for (let i = 0; i < n; i++) {
      tmpV.set(pc.pos[i * 3], pc.pos[i * 3 + 1], pc.pos[i * 3 + 2]).applyMatrix4(tmpM);
      const k = vo + i;
      P[k * 3] = tmpV.x; P[k * 3 + 1] = tmpV.y; P[k * 3 + 2] = tmpV.z;
      U[k * 2] = pc.uv[i * 2]; U[k * 2 + 1] = pc.uv[i * 2 + 1];
      C[k * 3] = pc.col[i * 3] * tr; C[k * 3 + 1] = pc.col[i * 3 + 1] * tg; C[k * 3 + 2] = pc.col[i * 3 + 2] * tb;
      L[k] = pc.layer[i];
    }
    for (let i = 0; i < pc.idx.length; i++) I[io + i] = pc.idx[i] + vo;
    vo += n; io += pc.idx.length;
  }
  for (const e of extras) {
    const n = e.pos.length / 3;
    P.set(e.pos, vo * 3);
    C.set(e.col, vo * 3);
    for (let i = 0; i < e.idx.length; i++) I[io + i] = e.idx[i] + vo;
    vo += n; io += e.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setAttribute('aLayer', new THREE.BufferAttribute(L, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * A ground of `w` × `d` cells of `cell` units round the middle, coloured by `paint(x, z)` (linear
 * RGB 0…1) per vertex: meadows with worn patches, a cave's dirt, the rift's dark stone.
 */
export function groundExtra(w: number, d: number, cell: number, y: number, paint: (x: number, z: number) => [number, number, number]): Extra {
  const nx = Math.ceil(w / cell), nz = Math.ceil(d / cell);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Uint8Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, x = -w / 2 + i * cell, z = -d / 2 + j * cell;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const c = paint(x, z);
    col[k * 3] = Math.round(Math.min(1, c[0]) * 255); col[k * 3 + 1] = Math.round(Math.min(1, c[1]) * 255); col[k * 3 + 2] = Math.round(Math.min(1, c[2]) * 255);
  }
  const idx = new Uint32Array(nx * nz * 6);
  let o = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = e;
  }
  return { pos, col, idx };
}

/** Test hook: how many pieces are loaded. */
export const sceneryCount = (): number => pieces.size;
