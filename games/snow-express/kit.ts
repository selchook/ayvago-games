// Snow Express: the 3D kit. Loads the Kenney Holiday Kit and Train Kit models, turns their PBR
// materials into one Lambert material per kit texture, and builds geometry from them:
//   - static scenery merged per material (a whole village is one draw call per kit texture);
//   - the Train Kit `track` piece bent along every track segment (straights, quarter circles,
//     ramps), merged into one mesh;
//   - recolouring by palette: Kenney models are textured from one colour-swatch map, so moving a
//     part's UVs into another swatch paints it in that colour (cabin trims in their cargo colour);
//   - instanced trains whose body colour is chosen per instance (a two-line shader patch moves the
//     body's UVs by a per-instance offset), so every locomotive and present stack is one draw call.
import Phaser from 'phaser';
import { THREE, model, loadKenney3d } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { poseOn, type Seg, type Pose } from './graph';
import { SWATCH, type ColorId } from './defs';

export const HOLIDAY = [
  'cabin-doorway', 'cabin-window-a', 'cabin-window-b', 'cabin-wall', 'cabin-wall-roof-center', 'cabin-roof-snow-point',
  'cabin-corner-logs', 'present-a-cube', 'present-b-round', 'present-a-rectangle', 'tree-snow-a', 'tree-snow-b',
  'tree-snow-c', 'tree-decorated-snow', 'rocks-large', 'rocks-medium', 'rocks-small', 'snow-pile', 'snow-bunker',
  'snow-flat', 'snowman-hat', 'lantern', 'lights-colored', 'reindeer', 'sled', 'bench', 'candy-cane-red',
  'wreath-decorated', 'gingerbread-man', 'nutcracker',
] as const;
export const TRAINS = ['track', 'train-locomotive-a', 'train-electric-bullet-a', 'train-diesel-a', 'train-carriage-flatbed'] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of HOLIDAY) loadKenney3d(load, 'h:' + n, 'holiday-kit', n);
  for (const n of TRAINS) loadKenney3d(load, 't:' + n, 'train-kit', n);
}

/** Train models are scaled to this (a locomotive is about 0.8 tiles long). */
export const TRAIN_S = 0.32;
/** Track: the Train Kit piece's width and height scale. */
const TRACK_W = 0.62, TRACK_H = 0.6;

// ------------------------------------------------------------------ materials

/** One Lambert material per kit texture (per world). */
export class Mats {
  private cache = new Map<THREE.Texture | null, THREE.MeshLambertMaterial>();
  private swap = new Map<THREE.Texture | null, THREE.MeshLambertMaterial>();

  of(src: THREE.Material): THREE.MeshLambertMaterial {
    const s = src as THREE.MeshStandardMaterial;
    const map = s.map ?? null;
    let m = this.cache.get(map);
    if (m) return m;
    if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
    m = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : s.color?.getHex() ?? 0xffffff });
    this.cache.set(map, m);
    return m;
  }

  /** The same, for instanced meshes whose `recol` vertices move by their instance's `swap` UV offset. */
  swapOf(src: THREE.Material): THREE.MeshLambertMaterial {
    const s = src as THREE.MeshStandardMaterial;
    const map = s.map ?? null;
    let m = this.swap.get(map);
    if (m) return m;
    m = this.of(src).clone();
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 swap;\nattribute float recol;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv += swap * recol;\n#endif');
    };
    m.customProgramCacheKey = () => 'se-swap';
    this.swap.set(map, m);
    return m;
  }

  /** A procedural surface (canvas texture). */
  canvas(key: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256, repeat = true): THREE.MeshLambertMaterial {
    let m = this.styles.get(key);
    if (m) return m;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    m = new THREE.MeshLambertMaterial({ map: t });
    this.styles.set(key, m);
    return m;
  }
  private styles = new Map<string, THREE.MeshLambertMaterial>();
}

// ------------------------------------------------------------------ model parts

export interface Part { geo: THREE.BufferGeometry; mat: THREE.Material }

const partsCache = new Map<string, Part[]>();

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
    return { geo, mat };
  });
  partsCache.set(key, parts);
  return parts;
}

function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    if (!a) continue;
    const n = a.itemSize, arr = a.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3 * n) for (let k = 0; k < n; k++) { const t = arr[i + n + k]; arr[i + n + k] = arr[i + 2 * n + k]; arr[i + 2 * n + k] = t; }
  }
  return g;
}

/** Moves the UVs of every vertex in palette swatch `from` (px of its corner) to swatch `to`. */
export function recolour(g: THREE.BufferGeometry, from: [number, number], to: [number, number]): void {
  const uv = g.attributes.uv;
  const du = (to[0] - from[0]) / 512, dv = (to[1] - from[1]) / 512;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u * 512 >= from[0] && u * 512 < from[0] + 64 && v * 512 >= from[1] && v * 512 < from[1] + 128) uv.setXY(i, u + du, v + dv);
  }
  uv.needsUpdate = true;
}

/** Marks the vertices in a swatch (the `recol` attribute the swap material reads). */
export function markSwatch(g: THREE.BufferGeometry, from: [number, number]): void {
  const uv = g.attributes.uv;
  const rc = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i) * 512, v = uv.getY(i) * 512;
    rc[i] = u >= from[0] && u < from[0] + 64 && v >= from[1] && v < from[1] + 128 ? 1 : 0;
  }
  g.setAttribute('recol', new THREE.Float32BufferAttribute(rc, 1));
}

/** The per-instance UV offset that paints a marked swatch in a cargo colour. */
export function swapFor(from: [number, number], color: ColorId | 'white' | 'orange' | null): [number, number] {
  if (!color) return [0, 0];
  const to: [number, number] = color === 'orange' ? [448, 256] : SWATCH[color];
  return [(to[0] - from[0]) / 512, (to[1] - from[1]) / 512];
}

// ------------------------------------------------------------------ merging

/** Collects transformed model parts per material and builds one mesh per material. */
export class Merger {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(key: string, m: THREE.Matrix4, edit?: (g: THREE.BufferGeometry) => void): void {
    for (const p of partsOf(key)) {
      let g = p.geo.clone();
      edit?.(g);
      g.applyMatrix4(m);
      if (m.determinant() < 0) g = flipWinding(g);
      this.push(p.mat, g);
    }
  }

  push(mat: THREE.Material, g: THREE.BufferGeometry): void {
    const l = this.byMat.get(mat) ?? [];
    l.push(g);
    this.byMat.set(mat, l);
  }

  build(mats: Mats, parent: THREE.Object3D, o: { cast?: boolean; receive?: boolean; raw?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [src, list] of this.byMat) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, o.raw ? src : mats.of(src));
      mesh.castShadow = o.cast ?? true;
      mesh.receiveShadow = o.receive ?? true;
      parent.add(mesh);
      out.push(mesh);
    }
    this.byMat.clear();
    return out;
  }
}

export const mat4 = (x: number, y: number, z: number, rotY = 0, s = 1, sy = s): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, sy, s));

// ------------------------------------------------------------------ track

const pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

/**
 * The Train Kit track piece (one tile long, three sleepers) bent along a segment: every vertex
 * moves to its distance along the segment and its offset across it. `from`/`to` pick part of
 * the segment (leads).
 */
export function bentTrack(seg: Seg, from = 0, to = seg.len, lift = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const len = to - from;
  const pieces = Math.max(1, Math.round(len / 0.95));
  for (let p = 0; p < pieces; p++) {
    const a = from + (len * p) / pieces, b = from + (len * (p + 1)) / pieces;
    for (const part of partsOf('t:track')) {
      const g = part.geo.clone();
      const pos = g.attributes.position, nor = g.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const u = a + (b - a) * (z + 0.5);
        poseOn(seg, true, u, pose);
        const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
        const lx = x * TRACK_W;
        pos.setXYZ(i, pose.x + lx * c, pose.y + y * TRACK_H + lift, pose.z - lx * s);
        const nx = nor.getX(i), nz = nor.getZ(i);
        nor.setXYZ(i, nx * c + nz * s, nor.getY(i), -nx * s + nz * c);
      }
      out.push(g);
    }
  }
  return out;
}
