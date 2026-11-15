// Coaster Rush: the 3D kits. Every Coaster Kit model shares one colour-map texture, and so does
// every Fantasy Town Kit model, so a whole stretch of track with its supports and station, or a
// whole block of the town, merges into one mesh per kit drawn with one material. Placed models
// are baked into those meshes (mirrored pieces get their winding flipped); only moving parts
// (trains, windmill sails, water wheels) and the people stay separate objects.
import Phaser from 'phaser';
import { THREE, model, loadKenney3d, loadMiniCharacter, loadCharacter3d } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceKind, Style } from './defs';

export const STYLE_LIST: Style[] = ['wood', 'steel', 'mouse', 'hanging', 'monorail', 'flume'];
export const PIECE_LIST: PieceKind[] = [
  'straight', 'corner-small', 'corner-large', 'corner-small-ramp', 'corner-large-ramp', 'curve', 'looping',
  'straight-hill-beginning', 'straight-hill-end', 'straight-hill-complete', 'straight-hill-complete-half',
  'straight-bump-up', 'straight-bump-down',
];
export const TRAINS = ['coaster-train', 'coaster-train-front', 'coaster-train-safety', 'coaster-train-wooden', 'coaster-train-hanging', 'train-log-flume', 'train-monorail'];
export const PARK = [
  'station', 'station-gate', 'station-fence', 'support-small', 'support-small-bottom', 'support-large', 'support-large-bottom',
  'park-entrance', 'ride-entrance', 'stall-food', 'stall-drinks', 'stall-information', 'tree', 'flowers', 'bench', 'trash',
];
export const TOWN = [
  'wall', 'wall-door', 'wall-window-shutters', 'wall-window-small', 'wall-window-glass', 'wall-window-round',
  'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-window-small', 'wall-wood-window-glass',
  'wall-wood-detail-cross', 'wall-wood-detail-diagonal', 'roof-gable', 'roof-point', 'roof-high-point', 'roof-high-gable',
  'chimney', 'windmill', 'watermill', 'fountain-round-detail', 'stall-red', 'stall-green', 'stall-bench', 'stall-stool',
  'lantern', 'banner-red', 'banner-green', 'cart', 'cart-high', 'tree', 'tree-high', 'tree-crooked', 'tree-high-round',
  'rock-large', 'rock-wide', 'rock-small', 'hedge', 'hedge-large', 'road', 'pillar-wood', 'stairs-wood',
];
/** Riders and queues (the player's own character drives the front seat). */
export const RIDERS = [
  'character-female-a', 'character-male-a', 'character-female-b', 'character-male-c', 'character-female-c', 'character-male-b',
  'character-female-d', 'character-male-d', 'character-female-e', 'character-male-e', 'character-female-f', 'character-male-f', 'character-male-g',
];

export const pieceKey = (st: Style, k: PieceKind): string => `ck:coaster-${st}-${k}`;
export const ckKey = (n: string): string => 'ck:' + n;
export const ftKey = (n: string): string => 'ft:' + n;
export const riderKey = (n: string): string => 'mini:' + n;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const st of STYLE_LIST) for (const k of PIECE_LIST) loadKenney3d(load, pieceKey(st, k), 'coaster-kit', `coaster-${st}-${k}`);
  for (const n of [...TRAINS, ...PARK]) loadKenney3d(load, ckKey(n), 'coaster-kit', n);
  for (const n of TOWN) loadKenney3d(load, ftKey(n), 'fantasy-town-kit', n);
  for (const n of RIDERS) loadMiniCharacter(load, n);
  loadCharacter3d(load);
}

// ------------------------------------------------------------------ geometry of a model

interface Geo { pos: Float32Array; nor: Float32Array; uv: Float32Array; count: number; map: THREE.Texture | null }
const geoCache = new Map<string, Geo>();

/** A model baked into one flat triangle list (its own space), with the kit's colour map. */
export function geoOf(key: string): Geo {
  let g = geoCache.get(key);
  if (g) return g;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', src.getAttribute('position').clone());
    geo.setAttribute('normal', src.getAttribute('normal') ? src.getAttribute('normal').clone() : new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count * 3), 3));
    geo.setAttribute('uv', src.getAttribute('uv') ? src.getAttribute('uv').clone() : new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count * 2), 2));
    geo.applyMatrix4(m.matrixWorld);
    parts.push(geo);
    src.dispose();
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    if (!map && mat.map) map = mat.map;
  });
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
  g = {
    pos: merged.getAttribute('position').array as Float32Array,
    nor: merged.getAttribute('normal').array as Float32Array,
    uv: merged.getAttribute('uv').array as Float32Array,
    count: merged.getAttribute('position').count,
    map,
  };
  geoCache.set(key, g);
  return g;
}

/** The colour map of a kit (taken from one of its models; shared by every copy). */
export function kitMap(key: string): THREE.Texture | null {
  const map = geoOf(key).map;
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.LinearFilter; }
  return map;
}

// ------------------------------------------------------------------ batching

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

/**
 * Collects placements of kit models (cheap: a matrix each) and bakes them into one mesh when
 * asked, so a block of the town can be listed early and built only when the train comes near.
 */
export class Batch {
  private items: { key: string; m: THREE.Matrix4; tint: THREE.Color | null }[] = [];
  /** A point of the batch (its first placement) for distance checks. */
  x = 0;
  z = 0;

  get empty(): boolean { return this.items.length === 0; }

  /** Places a model with a full matrix (a mirrored matrix flips the winding). */
  addMatrix(key: string, m: THREE.Matrix4, tint: THREE.Color | null = null): void {
    if (!this.items.length) { this.x = m.elements[12]; this.z = m.elements[14]; }
    this.items.push({ key, m: m.clone(), tint });
  }

  /** Places a model at (x, y, z), turned `yaw` round y, scaled. */
  add(key: string, x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx, tint: THREE.Color | null = null): void {
    _m.compose(_s.set(x, y, z), _q.setFromAxisAngle(_y, yaw), new THREE.Vector3(sx, sy, sz));
    this.addMatrix(key, _m, tint);
  }

  /** Bakes the placements into a mesh (or null when nothing was placed). */
  build(mat: THREE.Material, o: { shadows?: boolean; receive?: boolean } = {}): THREE.Mesh | null {
    if (!this.items.length) return null;
    let n = 0;
    for (const it of this.items) n += geoOf(it.key).count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o3 = 0, o2 = 0;
    for (const it of this.items) {
      const g = geoOf(it.key), m = it.m.elements;
      _n.getNormalMatrix(it.m);
      const ne = _n.elements;
      const flip = it.m.determinant() < 0;
      const r = it.tint ? it.tint.r : 1, gg = it.tint ? it.tint.g : 1, b = it.tint ? it.tint.b : 1;
      for (let i = 0; i < g.count; i++) {
        const j = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
        const x = g.pos[j * 3], y = g.pos[j * 3 + 1], z = g.pos[j * 3 + 2];
        pos[o3] = m[0] * x + m[4] * y + m[8] * z + m[12];
        pos[o3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        pos[o3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        const nx = g.nor[j * 3], ny = g.nor[j * 3 + 1], nz = g.nor[j * 3 + 2];
        let ax = ne[0] * nx + ne[3] * ny + ne[6] * nz, ay = ne[1] * nx + ne[4] * ny + ne[7] * nz, az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        ax /= l; ay /= l; az /= l;
        nor[o3] = ax; nor[o3 + 1] = ay; nor[o3 + 2] = az;
        col[o3] = r; col[o3 + 1] = gg; col[o3 + 2] = b;
        uv[o2] = g.uv[j * 2]; uv[o2 + 1] = g.uv[j * 2 + 1];
        o3 += 3; o2 += 2;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = o.shadows ?? true;
    mesh.receiveShadow = o.receive ?? true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** A Lambert material over a kit's colour map, tinted per vertex. */
export function kitMaterial(map: THREE.Texture | null): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map, vertexColors: true });
}
