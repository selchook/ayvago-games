// Trap Trail: the 3D kit. What the game loads and how it is drawn with few draw calls:
//   - `platformer.glb` (import-pack.mjs): every model of Quaternius's Ultimate Platformer Pack as a
//     root node, the moving pieces as child nodes (the chest's lid, the bouncer's spring and top, the
//     spike trap's spikes, the lever's handle, the door's panel …), one vertex-coloured material;
//     the pack's modular platform pieces, cubes and nature models are in the same file;
//   - the pack's own hero (`hero.glb`) and its four enemies (`crab`, `skull`, `gob`, `bee`), rigged,
//     each with its clips; every copy shares the file's geometry (SkeletonUtils clone).
// Static scenery is merged into one geometry per stage (Merger); repeated moving pieces are
// instanced; geometries made from the models are cached for the page's life (shared, never freed
// by hand: a World3D frees them at shutdown and three.js uploads them again on the next use).
import Phaser from 'phaser';
import { THREE, model, loadModel } from '@core/three';
import { asset } from '@core';

export const PACK = 'tt:pack';
export const RIGS = ['hero', 'crab', 'skull', 'gob', 'bee'] as const;
export type RigId = (typeof RIGS)[number];
export const rigKey = (id: RigId): string => 'tt:' + id;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  loadModel(load, PACK, asset('quaternius/ultimate-platformer-pack/platformer.glb'));
  for (const r of RIGS) loadModel(load, rigKey(r), asset(`quaternius/ultimate-platformer-pack/${r}.glb`));
}

// ------------------------------------------------------------------ model geometry

const cache = new Map<string, THREE.BufferGeometry>();
let packRoot: THREE.Object3D | null = null;
const tv = new THREE.Vector3(), tn = new THREE.Vector3(), tnm = new THREE.Matrix3(), tc = new THREE.Color();

/**
 * One model (or one part of it) as a single non-indexed geometry with position, normal and
 * colour: `qp:<id>` or `qp:<id>#<part>` from the pack. The part keeps its own pivot (the lid's
 * hinge, the spring's base).
 */
export function geo(key: string): THREE.BufferGeometry {
  let g = cache.get(key);
  if (g) return g;
  const rest = key.slice(3);
  const jobs: { g: THREE.BufferGeometry; m: THREE.Matrix4; color?: THREE.Color }[] = [];
  if (!packRoot) { packRoot = model(PACK, { shadows: false }); packRoot.updateMatrixWorld(true); }
  const [id, part] = rest.split('#');
  const node = packRoot.getObjectByName(id);
  if (node) {
    const base = part ? childNamed(node, part) ?? node : node;
    const inv = base.matrixWorld.clone().invert();
    base.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) jobs.push({ g: m.geometry, m: inv.clone().multiply(m.matrixWorld) }); });
  }
  g = bake(jobs);
  cache.set(key, g);
  return g;
}

const rests = new Map<string, THREE.Matrix4>();
/**
 * Where a moving part's pivot sits in its model (the lid's hinge, the door leaf's hinge, the
 * lever's axle, the bouncer's top): draw the part with place(...) × partRest × its own motion.
 */
export function partRest(id: string, part: string): THREE.Matrix4 {
  const k = id + '#' + part;
  let m = rests.get(k);
  if (m) return m;
  geo('qp:' + k);
  const node = packRoot!.getObjectByName(id), p = node ? childNamed(node, part) : undefined;
  m = node && p ? node.matrixWorld.clone().invert().multiply(p.matrixWorld) : new THREE.Matrix4();
  rests.set(k, m);
  return m;
}

/**
 * A model's part by name: the loader makes repeated node names unique (`top`, `top_1`, `base_2` …),
 * so the stem is matched among the node's direct children.
 */
function childNamed(node: THREE.Object3D, part: string): THREE.Object3D | undefined {
  return node.children.find((c) => c.name === part || (c.name.startsWith(part + '_') && /^\d+$/.test(c.name.slice(part.length + 1))));
}

/** True for a geometry from the model cache (shared by every build; not freed mid-scene). */
export function isKitGeo(g: THREE.BufferGeometry): boolean {
  for (const v of cache.values()) if (v === g) return true;
  return false;
}

/** Merges geometries (with their matrices and an optional flat colour) into one non-indexed one. */
function bake(jobs: { g: THREE.BufferGeometry; m: THREE.Matrix4; color?: THREE.Color }[]): THREE.BufferGeometry {
  const m = new Merger();
  for (const j of jobs) m.add(j.g, j.m, j.color ? j.color.getHex() : undefined, !!j.color);
  return m.build();
}

/** Accumulates placed geometries into one (position, normal, colour; non-indexed). */
export class Merger {
  private P: number[] = [];
  private N: number[] = [];
  private C: number[] = [];

  get empty(): boolean { return this.P.length === 0; }

  /** Adds `g` placed by `m`, its colours multiplied by `tint` (or replaced by it with `flat`). */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, tint?: number, flat = false): void {
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = g.getAttribute('color');
    tnm.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    if (tint !== undefined) tc.setHex(tint); else tc.setRGB(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const ii = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      const v = idx ? idx.getX(ii) : ii;
      tv.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      this.P.push(tv.x, tv.y, tv.z);
      if (nor) { tn.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(tnm).normalize(); this.N.push(tn.x, tn.y, tn.z); }
      else this.N.push(0, 1, 0);
      if (flat || !col) this.C.push(tc.r, tc.g, tc.b);
      else this.C.push(col.getX(v) * tc.r, col.getY(v) * tc.g, col.getZ(v) * tc.b);
    }
  }

  /** Adds raw triangles (flat normals computed): positions and one colour per triangle. */
  tri(a: number[], b: number[], c: number[], color: number): void {
    tc.setHex(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { this.P.push(p[0], p[1], p[2]); this.N.push(nx, ny, nz); this.C.push(tc.r, tc.g, tc.b); }
  }

  /** A quad a-b-c-d (counter-clockwise seen from its front). */
  quad(a: number[], b: number[], c: number[], d: number[], color: number): void { this.tri(a, b, c, color); this.tri(a, c, d, color); }

  /** An axis-aligned box with one colour per face group (top, sides, bottom). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: number, side = top, bottom = side): void {
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], bottom);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** A matrix from a place, a turn about y and a uniform scale. */
export function place(x: number, y: number, z: number, rot = 0, s = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
}

/** The one material every vertex-coloured model draws with. */
export const litMaterial = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });
