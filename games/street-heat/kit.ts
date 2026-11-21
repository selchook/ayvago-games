// Street Heat: the imported Quaternius packs (import-city.mjs) as plain arrays. Each GLB's root
// nodes become pieces (positions in metres, colours, a layer or a kind per vertex, indices) that the
// city merges into chunk meshes and the vehicles turn into instanced geometry. The cars load under
// the Ayvago intro (the menu shows them); the city, the buildings, the transport pack and the
// nature pack load after the menu is up (loadCity), like Hex Realm's scenery.
import { THREE } from '@core/three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset } from '@core';
import { L, loadLayers, type Layer } from './look';

export interface Piece {
  pos: Float32Array;
  /** Linear colour, 3 bytes per vertex. */
  col: Uint8Array;
  /** City pieces: the texture layer per vertex. Vehicles: the kind per vertex. */
  tag: Uint8Array;
  idx: Uint32Array;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** The stock paint (vehicles), linear RGB. */
  paint?: [number, number, number];
}

const pieces = new Map<string, Piece>();

/** The packs: key prefix, path, and whether their materials are texture layers (city) or kinds. */
const PACKS = {
  cars: ['quaternius/city-cars/cars.glb', 'kind'],
  transport: ['quaternius/public-transport/transport.glb', 'kind'],
  city: ['quaternius/downtown-city/city.glb', 'layer'],
  town: ['quaternius/town-buildings/buildings.glb', 'layer'],
  nature: ['quaternius/nature-pack/nature.glb', 'nature'],
} as const;
export type Pack = keyof typeof PACKS;

const loading = new Map<Pack, Promise<void>>();
const loaded = new Set<Pack>();

/** Loads one pack (once per page); its pieces are then `piece('<pack>:<Name>')`. */
export function loadPack(pack: Pack): Promise<void> {
  let p = loading.get(pack);
  if (p) return p;
  const [path, mode] = PACKS[pack];
  p = fetch(asset(path)).then((r) => {
    if (!r.ok) throw new Error(path + ': ' + r.status);
    return r.arrayBuffer();
  }).then((data) => new Promise<void>((resolve, reject) => {
    new GLTFLoader().parse(data, '', (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      for (const node of gltf.scene.children) pieces.set(pack + ':' + node.name, extract(node, mode));
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      loaded.add(pack);
      resolve();
    }, reject);
  })).catch((err) => {
    console.error('[street-heat] pack failed to load', pack, err);
    loading.delete(pack);
  });
  loading.set(pack, p);
  return p;
}

export const packReady = (pack: Pack): boolean => loaded.has(pack);

let cityPromise: Promise<void> | null = null;
/** Everything the streets need, after the menu is up: textures, buildings, transport, trees. */
export function loadCity(): Promise<void> {
  if (!cityPromise) cityPromise = Promise.all([loadLayers(), loadPack('city'), loadPack('town'), loadPack('transport'), loadPack('nature'), loadPack('cars')]).then(() => undefined);
  return cityPromise;
}
export const cityReady = (): boolean => (['city', 'town', 'transport', 'nature', 'cars'] as Pack[]).every(packReady);

/** A pack loaded under the Ayvago intro by the core's model loader: its root (a model() copy) taken apart once. */
export function adoptPack(pack: Pack, root: THREE.Object3D): void {
  if (loaded.has(pack)) return;
  root.updateMatrixWorld(true);
  for (const node of root.children) pieces.set(pack + ':' + node.name, extract(node, PACKS[pack][1]));
  loaded.add(pack);
  loading.set(pack, Promise.resolve());
}

export function piece(key: string): Piece | undefined { return pieces.get(key); }
export const hasPiece = (key: string): boolean => pieces.has(key);

const NATURE_LAYER = L.white;

/** One root node's meshes as one piece (their matrices, quantization included, applied). */
function extract(root: THREE.Object3D, mode: 'kind' | 'layer' | 'nature'): Piece {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.geometry.getAttribute('position').count; ni += m.geometry.index!.count; }
  const out: Piece = { pos: new Float32Array(nv * 3), col: new Uint8Array(nv * 3), tag: new Uint8Array(nv), idx: new Uint32Array(ni), min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) };
  const paint = root.userData?.paint as number[] | undefined;
  if (paint) out.paint = [paint[0], paint[1], paint[2]];
  const v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color'), kind = g.getAttribute('_kind');
    const layer = mode === 'layer' ? (L[(m.material as THREE.Material).name as Layer] ?? 0) : NATURE_LAYER;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
      const k = vo + i;
      out.pos[k * 3] = v.x; out.pos[k * 3 + 1] = v.y; out.pos[k * 3 + 2] = v.z;
      out.min.min(v); out.max.max(v);
      out.col[k * 3] = col ? Math.round(col.getX(i) * 255) : 255;
      out.col[k * 3 + 1] = col ? Math.round(col.getY(i) * 255) : 255;
      out.col[k * 3 + 2] = col ? Math.round(col.getZ(i) * 255) : 255;
      out.tag[k] = mode === 'kind' ? (kind ? kind.getX(i) : 0) : layer;
    }
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) out.idx[io + i] = idx.getX(i) + vo;
    vo += pos.count; io += idx.count;
  }
  return out;
}

/** Geometry of a vehicle for instancing: position, colour, _kind. */
export function kindGeometry(key: string, scale = 1): THREE.BufferGeometry {
  const p = pieces.get(key);
  const g = new THREE.BufferGeometry();
  if (!p) return g;
  const pos = scale === 1 ? p.pos.slice() : p.pos.map((x) => x * scale);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(p.col.slice(), 3, true));
  g.setAttribute('_kind', new THREE.BufferAttribute(Float32Array.from(p.tag), 1));
  g.setIndex(new THREE.BufferAttribute(p.idx.length > 65535 || p.pos.length / 3 > 65535 ? p.idx.slice() : Uint16Array.from(p.idx), 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ merging (the city's chunks)

/** A piece placed in the city: key, position, yaw, uniform scale, an optional tint (0xrrggbb). */
export interface Placed { key: string; x: number; y: number; z: number; rot: number; s: number; sx?: number; sy?: number; tint?: number }

/** Plain geometry made in code (roads, curbs, lamp posts): positions, colours, layers, decal UVs, indices. */
export class Extra {
  pos: number[] = [];
  col: number[] = [];
  layer: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /** A quad (4 corners in order), one layer and colour; uv per corner for decals. */
  quad(a: number[], b: number[], c: number[], d: number[], layer: number, color = 0xffffff, uv?: number[]): void {
    const base = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    const r = ((color >> 16) & 255), g = ((color >> 8) & 255), bl = color & 255;
    for (let i = 0; i < 4; i++) { this.col.push(r, g, bl); this.layer.push(layer); }
    this.uv.push(...(uv ?? [0, 0, 0, 0, 0, 0, 0, 0]));
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A flat rectangle on y from (x0, z0) to (x1, z1), facing up. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, layer: number, color = 0xffffff, uv?: number[]): void {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], layer, color, uv);
  }

  /** An axis-aligned box (no bottom). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, layer: number, color = 0xffffff, top = true): void {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], layer, color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], layer, color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], layer, color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], layer, color);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], layer, color);
  }

  /** A box turned by `rot` about its centre (cx, cz). */
  rotBox(cx: number, cz: number, w: number, d: number, y0: number, y1: number, rot: number, layer: number, color = 0xffffff): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    const p = (x: number, z: number, y: number) => [cx + x * c + z * s, y, cz - x * s + z * c];
    const hw = w / 2, hd = d / 2;
    const a = [-hw, hd], b = [hw, hd], e = [hw, -hd], f = [-hw, -hd];
    const side = (u: number[], v: number[]) => this.quad(p(u[0], u[1], y0), p(v[0], v[1], y0), p(v[0], v[1], y1), p(u[0], u[1], y1), layer, color);
    side(a, b); side(b, e); side(e, f); side(f, a);
    this.quad(p(a[0], a[1], y1), p(b[0], b[1], y1), p(e[0], e[1], y1), p(f[0], f[1], y1), layer, color);
  }

  get empty(): boolean { return this.idx.length === 0; }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Merges placed pieces and extras into one geometry for the city material. */
export function mergeCity(list: Placed[], extras: Extra[] = []): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  const jobs: [Piece, Placed][] = [];
  for (const p of list) {
    const pc = pieces.get(p.key);
    if (!pc) continue;
    jobs.push([pc, p]);
    nv += pc.pos.length / 3; ni += pc.idx.length;
  }
  for (const e of extras) { nv += e.pos.length / 3; ni += e.idx.length; }
  const P = new Float32Array(nv * 3), C = new Uint8Array(nv * 3), Ly = new Uint8Array(nv), U = new Float32Array(nv * 2);
  const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const [pc, p] of jobs) {
    tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ.setFromAxisAngle(UP, p.rot), tmpS.set(p.s * (p.sx ?? 1), p.sy ?? p.s, p.s));
    const n = pc.pos.length / 3;
    const tr = p.tint === undefined ? 1 : ((p.tint >> 16) & 255) / 255, tg = p.tint === undefined ? 1 : ((p.tint >> 8) & 255) / 255, tb = p.tint === undefined ? 1 : (p.tint & 255) / 255;
    for (let i = 0; i < n; i++) {
      tmpV.set(pc.pos[i * 3], pc.pos[i * 3 + 1], pc.pos[i * 3 + 2]).applyMatrix4(tmpM);
      const k = vo + i;
      P[k * 3] = tmpV.x; P[k * 3 + 1] = tmpV.y; P[k * 3 + 2] = tmpV.z;
      C[k * 3] = pc.col[i * 3] * tr; C[k * 3 + 1] = pc.col[i * 3 + 1] * tg; C[k * 3 + 2] = pc.col[i * 3 + 2] * tb;
      Ly[k] = pc.tag[i];
    }
    for (let i = 0; i < pc.idx.length; i++) I[io + i] = pc.idx[i] + vo;
    vo += n; io += pc.idx.length;
  }
  for (const e of extras) {
    const n = e.pos.length / 3;
    P.set(e.pos, vo * 3);
    C.set(e.col, vo * 3);
    Ly.set(e.layer, vo);
    U.set(e.uv, vo * 2);
    for (let i = 0; i < e.idx.length; i++) I[io + i] = e.idx[i] + vo;
    vo += n; io += e.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
  g.setAttribute('aLayer', new THREE.BufferAttribute(Ly, 1));
  g.setAttribute('aUv', new THREE.BufferAttribute(U, 2));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Test hook: how many pieces are loaded. */
export const pieceCount = (): number => pieces.size;

/** Test hook: the keys of a pack's pieces, in file order. */
export const pieceKeys = (pack: Pack): string[] => [...pieces.keys()].filter((k) => k.startsWith(pack + ':'));
