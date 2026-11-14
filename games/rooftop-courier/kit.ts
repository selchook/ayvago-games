// Rooftop Courier: the 3D kit. The Retro Urban Kit's GLBs are read straight from their bytes into
// flat triangle lists (position, normal, uv and which of the kit's 22 textures each triangle
// uses), and the textures go into one texture array, so a whole building, alley and its clutter
// merge into two meshes (opaque and cut-out) drawn with one material: a Lambert shader that picks
// the texture layer per vertex, tints per vertex (district palettes, awning colours) and lights
// windows from a per-vertex threshold as the dusk turns to night (uNight).
//
// The skyline's far buildings (City Kit Commercial / Industrial / Suburban, already in the repo)
// and the player's Mini Character come through the core loader as usual.
import Phaser from 'phaser';
import { THREE, model, loadKenney3d, loadCharacter3d } from '@core/three';
import { kenney } from '@core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Retro Urban Kit models the city is built from (tools/import-kenney.py RETRO_URBAN_KIT). */
export const KIT_MODELS = [
  'wall-a', 'wall-a-window', 'wall-a-door', 'wall-a-garage', 'wall-a-detail', 'wall-a-painted',
  'wall-a-corner-painted', 'wall-a-roof', 'wall-a-roof-slant', 'wall-a-roof-detailed', 'wall-a-column',
  'wall-b', 'wall-b-window', 'wall-b-door', 'wall-b-garage', 'wall-b-roof', 'wall-b-roof-slant', 'wall-b-column',
  'wall-c-flat', 'wall-c-flat-low', 'wall-type-a', 'wall-type-b', 'wall-broken-type-a', 'wall-fence',
  'balcony-type-a', 'balcony-ladder-bottom', 'balcony-ladder-top', 'detail-awning-wide', 'detail-awning-small',
  'detail-cables-type-a', 'detail-cables-type-b', 'detail-beam', 'planks', 'pallet', 'pallet-small',
  'detail-barrier-strong-type-a', 'detail-barrier-strong-type-b', 'detail-barrier-type-a', 'detail-dumpster-closed',
  'detail-dumpster-open', 'detail-block', 'detail-light-single', 'detail-light-double', 'roof-metal-type-a',
  'roof-metal-type-b', 'roof-metal-poles', 'scaffolding-structure', 'scaffolding-floor', 'scaffolding-poles',
  'tree-large', 'tree-park-large', 'tree-pine-large', 'tree-small', 'truck-grey', 'truck-green', 'truck-flat',
  'truck-grey-cargo', 'road-asphalt-straight', 'road-asphalt-center', 'road-asphalt-pavement', 'road-asphalt-side',
] as const;
export type KitModel = typeof KIT_MODELS[number];

/** The kit's textures, in texture-array layer order (the last layer is plain white). */
export const KIT_TEXTURES = [
  'asphalt', 'bars', 'concrete', 'dirt', 'doors', 'grass', 'metal', 'metal_wall', 'planks', 'rock', 'roof',
  'roof_plates', 'signs', 'tiles', 'treea', 'treeb', 'truck', 'truck_alien', 'wall', 'wall_garage', 'wall_lines', 'windows',
] as const;
const WHITE = KIT_TEXTURES.length;
export const WINDOWS_LAYER = KIT_TEXTURES.indexOf('windows');
const LAYER_SIZE = 128;

/** Far skyline buildings (other Kenney city kits). */
export const SKYLINE = {
  com: ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'low-detail-building-a', 'low-detail-building-c', 'low-detail-building-wide-a'],
  ind: ['building-h', 'building-k', 'chimney-large', 'chimney-medium'],
} as const;
const SKY_KITS = { com: 'city-kit-commercial', ind: 'city-kit-industrial' } as const;
export type SkyKit = keyof typeof SKYLINE;
export const skyKey = (k: SkyKit, name: string): string => `${k}:${name}`;

const KIT_DIR = 'retro-urban-kit/models/gltf_format/';

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of KIT_MODELS) load.binary('ru:' + n, kenney(KIT_DIR + n + '.glb'));
  for (const t of KIT_TEXTURES) load.image('rutex:' + t, kenney(KIT_DIR + 'Textures/' + t + '.png'));
  for (const k of Object.keys(SKYLINE) as SkyKit[]) for (const n of SKYLINE[k]) loadKenney3d(load, skyKey(k, n), SKY_KITS[k], n);
  loadCharacter3d(load);
}

// ------------------------------------------------------------------ GLB → triangle lists

interface Part { pos: Float32Array; nor: Float32Array; uv: Float32Array; layer: Uint8Array; count: number }
export interface KitGeo { opaque: Part; cut: Part; min: THREE.Vector3; max: THREE.Vector3 }

const parsed = new Map<string, KitGeo>();

function readGlb(buf: ArrayBuffer): { json: any; bin: DataView } {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const binLen = dv.getUint32(20 + jsonLen, true);
  return { json, bin: new DataView(buf, binStart, binLen) };
}

function accessor(json: any, bin: DataView, i: number): { get: (k: number, c: number) => number; count: number; size: number } {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
  const csize = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 || a.componentType === 5122 ? 2 : 1;
  const stride = bv.byteStride ?? size * csize;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const get = (k: number, c: number): number => {
    const o = base + k * stride + c * csize;
    switch (a.componentType) {
      case 5126: return bin.getFloat32(o, true);
      case 5125: return bin.getUint32(o, true);
      case 5123: return bin.getUint16(o, true);
      case 5122: return bin.getInt16(o, true);
      case 5121: return bin.getUint8(o);
      default: return bin.getInt8(o);
    }
  };
  return { get, count: a.count, size };
}

function parseKit(buf: ArrayBuffer): KitGeo {
  const { json, bin } = readGlb(buf);
  const out = { opaque: { pos: [] as number[], nor: [] as number[], uv: [] as number[], layer: [] as number[] }, cut: { pos: [] as number[], nor: [] as number[], uv: [] as number[], layer: [] as number[] } };
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  const layerOf = (matIdx: number | undefined): { layer: number; cut: boolean } => {
    const m = matIdx !== undefined ? json.materials?.[matIdx] : null;
    const ti = m?.pbrMetallicRoughness?.baseColorTexture?.index;
    let layer: number = WHITE;
    if (ti !== undefined) {
      const uri: string = json.images?.[json.textures[ti].source]?.uri ?? '';
      const name = uri.split('/').pop()!.replace(/\.png$/i, '').toLowerCase();
      const k = (KIT_TEXTURES as readonly string[]).indexOf(name);
      if (k >= 0) layer = k;
    }
    return { layer, cut: m?.alphaMode === 'BLEND' || m?.alphaMode === 'MASK' };
  };
  const visit = (i: number, parent: THREE.Matrix4) => {
    const node = json.nodes[i];
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(
      new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
    );
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      nm.getNormalMatrix(world);
      for (const prim of json.meshes[node.mesh].primitives) {
        const P = accessor(json, bin, prim.attributes.POSITION);
        const N = prim.attributes.NORMAL !== undefined ? accessor(json, bin, prim.attributes.NORMAL) : null;
        const T = prim.attributes.TEXCOORD_0 !== undefined ? accessor(json, bin, prim.attributes.TEXCOORD_0) : null;
        const I = prim.indices !== undefined ? accessor(json, bin, prim.indices) : null;
        const { layer, cut } = layerOf(prim.material);
        const dst = cut ? out.cut : out.opaque;
        const count = I ? I.count : P.count;
        for (let k = 0; k < count; k++) {
          const idx = I ? I.get(k, 0) : k;
          v.set(P.get(idx, 0), P.get(idx, 1), P.get(idx, 2)).applyMatrix4(world);
          dst.pos.push(v.x, v.y, v.z);
          min.min(v); max.max(v);
          if (N) n.set(N.get(idx, 0), N.get(idx, 1), N.get(idx, 2)).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
          dst.nor.push(n.x, n.y, n.z);
          dst.uv.push(T ? T.get(idx, 0) : 0, T ? T.get(idx, 1) : 0);
          dst.layer.push(layer);
        }
      }
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  for (const i of json.scenes[json.scene ?? 0].nodes) visit(i, new THREE.Matrix4());
  const part = (p: typeof out.opaque): Part => ({ pos: new Float32Array(p.pos), nor: new Float32Array(p.nor), uv: new Float32Array(p.uv), layer: new Uint8Array(p.layer), count: p.pos.length / 3 });
  return { opaque: part(out.opaque), cut: part(out.cut), min, max };
}

/** Parses every kit model once (the Phaser cache keeps the bytes). */
export function kitReady(scene: Phaser.Scene): void {
  if (parsed.size) return;
  for (const n of KIT_MODELS) {
    const buf = scene.cache.binary.get('ru:' + n) as ArrayBuffer | undefined;
    if (buf) parsed.set(n, parseKit(buf));
  }
}

export const kitGeo = (n: KitModel): KitGeo | undefined => parsed.get(n);

// ------------------------------------------------------------------ the texture array

let arrayData: Uint8Array | null = null;
let arrayTex: THREE.DataArrayTexture | null = null;

/**
 * The kit's textures as one texture array, made once and shared by every world like the loaded
 * models' own textures (it is only referenced from the shader, so a world's cleanup leaves it): the
 * Play scene finds it already on the GPU.
 */
export function kitTexture(scene: Phaser.Scene): THREE.DataArrayTexture {
  if (arrayTex) return arrayTex;
  if (!arrayData) {
    const S = LAYER_SIZE, L = KIT_TEXTURES.length + 1;
    const data = new Uint8Array(S * S * 4 * L);
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    KIT_TEXTURES.forEach((t, i) => {
      g.clearRect(0, 0, S, S);
      const src = scene.textures.get('rutex:' + t).getSourceImage() as HTMLImageElement;
      g.imageSmoothingEnabled = true;
      g.drawImage(src, 0, 0, S, S);
      const px = g.getImageData(0, 0, S, S).data;
      // rows in order: glTF UVs have v = 0 at the top, which is the first row (flipY off)
      for (let y = 0; y < S; y++) data.set(px.subarray(y * S * 4, (y + 1) * S * 4), i * S * S * 4 + y * S * 4);
    });
    data.fill(255, WHITE * S * S * 4);
    arrayData = data;
  }
  const tex = new THREE.DataArrayTexture(arrayData as unknown as BufferSource, LAYER_SIZE, LAYER_SIZE, KIT_TEXTURES.length + 1);
  tex.format = THREE.RGBAFormat;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.needsUpdate = true;
  arrayTex = tex;
  return tex;
}

/** Shared uniforms of the kit material: the night (window lights) and the warm light colour. */
export interface KitUniforms { uNight: { value: number }; uWarm: { value: THREE.Color } }

/** The kit's one material (opaque, or cut-out for bars, signs and trees). */
export function kitMaterial(tex: THREE.DataArrayTexture, uni: KitUniforms, cut: boolean): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: cut ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKit = { value: tex };
    sh.uniforms.uNight = uni.uNight;
    sh.uniforms.uWarm = uni.uWarm;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nattribute float aLit;\nvarying float vLayer;\nvarying float vLit;\nvarying vec2 vKitUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvKitUv = uv;\nvLayer = aLayer;\nvLit = aLit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uKit;\nuniform float uNight;\nuniform vec3 uWarm;\nvarying float vLayer;\nvarying float vLit;\nvarying vec2 vKitUv;')
      .replace('#include <map_fragment>', `vec4 kitTexel = texture(uKit, vec3(vKitUv, floor(vLayer + 0.5)));\ndiffuseColor *= kitTexel;${cut ? '\nif (diffuseColor.a < 0.5) discard;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float kitWin = step(${WINDOWS_LAYER}.5, vLayer + 1.0) * step(vLayer, ${WINDOWS_LAYER}.5);
float kitOn = step(vLit, uNight) * kitWin;
float kitGlass = clamp((kitTexel.b - kitTexel.r) * 3.0 + 0.1, 0.0, 1.0);
totalEmissiveRadiance += uWarm * kitOn * (0.06 + kitGlass * 0.75) * (0.55 + dot(kitTexel.rgb, vec3(0.3, 0.5, 0.2)));`);
  };
  m.customProgramCacheKey = () => 'rc-kit-' + (cut ? 'cut' : 'opaque');
  return m;
}

// ------------------------------------------------------------------ batching

/** Collects kit placements and builds them into merged meshes. */
export class KitBatch {
  private parts = { opaque: new Grow(), cut: new Grow() };
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();

  /**
   * Places a model: at (x, y, z), turned `rot` radians round y, scaled. `tint` multiplies its
   * colour; `lit` is the night level at which its windows light up (2: never).
   */
  add(name: KitModel, x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx, tint: [number, number, number] = [1, 1, 1], lit = 2): void {
    const g = parsed.get(name);
    if (!g) return;
    this.m.compose(this.v.set(x, y, z), _q.setFromAxisAngle(_up, rot), _s.set(sx, sy, sz));
    this.nm.getNormalMatrix(this.m);
    const flip = sx * sy * sz < 0;
    for (const key of ['opaque', 'cut'] as const) {
      const p = g[key];
      if (!p.count) continue;
      const dst = this.parts[key];
      dst.reserve(p.count);
      for (let i = 0; i < p.count; i++) {
        // mirrored placements flip the winding
        const j = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
        _p.set(p.pos[j * 3], p.pos[j * 3 + 1], p.pos[j * 3 + 2]).applyMatrix4(this.m);
        _n.set(p.nor[j * 3], p.nor[j * 3 + 1], p.nor[j * 3 + 2]).applyMatrix3(this.nm).normalize();
        dst.push(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, p.uv[j * 2], p.uv[j * 2 + 1], tint, p.layer[j], lit);
      }
    }
  }

  /** A plain textured box (custom pieces: cable tubes are separate). Layer by texture name. */
  box(tex: typeof KIT_TEXTURES[number], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tint: [number, number, number] = [1, 1, 1], tile = 3): void {
    const layer = KIT_TEXTURES.indexOf(tex);
    const dst = this.parts.opaque;
    const quad = (a: number[], b: number[], c: number[], d: number[], nx: number, ny: number, nz: number, uvOf: (p: number[]) => [number, number]) => {
      dst.reserve(6);
      for (const p of [a, b, c, a, c, d]) { const [u, v] = uvOf(p); dst.push(p[0], p[1], p[2], nx, ny, nz, u, v, tint, layer, 2); }
    };
    const k = 1 / tile;
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, (p) => [p[0] * k, p[2] * k]);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, (p) => [p[0] * k, -p[1] * k]);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, (p) => [p[0] * k, -p[1] * k]);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, (p) => [p[2] * k, -p[1] * k]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, (p) => [p[2] * k, -p[1] * k]);
  }

  get empty(): boolean { return !this.parts.opaque.n && !this.parts.cut.n; }

  /** Builds the meshes into `parent` (opaque casts shadows, cut-outs do not). */
  build(parent: THREE.Object3D, mats: { opaque: THREE.Material; cut: THREE.Material }, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const key of ['opaque', 'cut'] as const) {
      const p = this.parts[key];
      if (!p.n) continue;
      const g = p.geometry();
      const mesh = new THREE.Mesh(g, mats[key]);
      mesh.castShadow = shadows && key === 'opaque';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts = { opaque: new Grow(), cut: new Grow() };
    return out;
  }
}

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Growable vertex arrays. */
class Grow {
  n = 0;
  private cap = 0;
  private pos = new Float32Array(0);
  private nor = new Float32Array(0);
  private uv = new Float32Array(0);
  private col = new Float32Array(0);
  private layer = new Float32Array(0);
  private lit = new Float32Array(0);

  reserve(k: number): void {
    if (this.n + k <= this.cap) return;
    const cap = Math.max(1024, (this.n + k) * 2);
    const grow = (a: Float32Array, w: number) => { const b = new Float32Array(cap * w); b.set(a.subarray(0, this.n * w)); return b; };
    this.pos = grow(this.pos, 3); this.nor = grow(this.nor, 3); this.uv = grow(this.uv, 2);
    this.col = grow(this.col, 3); this.layer = grow(this.layer, 1); this.lit = grow(this.lit, 1);
    this.cap = cap;
  }

  push(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: [number, number, number], layer: number, lit: number): void {
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nor[i * 3] = nx; this.nor[i * 3 + 1] = ny; this.nor[i * 3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.layer[i] = layer;
    this.lit[i] = lit;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3));
    g.setAttribute('aLayer', new THREE.BufferAttribute(this.layer.slice(0, n), 1));
    g.setAttribute('aLit', new THREE.BufferAttribute(this.lit.slice(0, n), 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ skyline (other kits)

/** One Lambert material per source material of the other kits (per world). */
export class Mats {
  private cache = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  of(src: THREE.Material): THREE.MeshLambertMaterial {
    let m = this.cache.get(src);
    if (m) return m;
    const s = src as THREE.MeshStandardMaterial;
    if (s.map) s.map.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshLambertMaterial({ map: s.map ?? null, color: s.map ? 0xffffff : s.color?.getHex() ?? 0xffffff });
    this.cache.set(src, m);
    return m;
  }
}

const meshCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[]>();

function meshesOf(key: string) {
  let out = meshCache.get(key);
  if (out) return out;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  out = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.length === 1 || !m.geometry.groups.length) out!.push({ geo: m.geometry, mat: mats[0], matrix: m.matrixWorld.clone() });
    else for (const gr of m.geometry.groups) {
      const sub = m.geometry.clone();
      sub.clearGroups();
      if (sub.index) sub.setIndex(Array.from(sub.index.array).slice(gr.start, gr.start + gr.count));
      out!.push({ geo: sub, mat: mats[gr.materialIndex ?? 0], matrix: m.matrixWorld.clone() });
    }
  });
  meshCache.set(key, out);
  return out;
}

/** Merges placements of other kits' models into one mesh per kit material (by kit and name). */
export function mergeModels(items: { key: string; matrix: THREE.Matrix4 }[], mats: Mats, parent: THREE.Object3D, tint?: THREE.Color): THREE.Mesh[] {
  const byMat = new Map<string, { src: THREE.Material; list: THREE.BufferGeometry[] }>();
  const m = new THREE.Matrix4();
  for (const it of items) {
    const kit = it.key.split(':')[0];
    for (const p of meshesOf(it.key)) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      m.multiplyMatrices(it.matrix, p.matrix);
      g.applyMatrix4(m);
      // every model of a kit has its own copy of the shared colormap material: group by name
      const src = p.mat as THREE.MeshStandardMaterial;
      const key = kit + ':' + (src.map ? 'map:' + src.name : 'col:' + src.color?.getHexString());
      const e = byMat.get(key) ?? { src, list: [] };
      e.list.push(g);
      byMat.set(key, e);
    }
  }
  const out: THREE.Mesh[] = [];
  for (const { src, list } of byMat.values()) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mat = mats.of(src);
    if (tint) mat.color.copy(tint);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    out.push(mesh);
  }
  return out;
}
