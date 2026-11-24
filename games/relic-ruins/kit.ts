// Relic Ruins: the 3D kit. What the game loads and how it is drawn with few draw calls:
//   - `ruins.glb` (import-pack.mjs): every model of Quaternius's Ultimate Modular Ruins Pack the game
//     uses as a root node, the moving pieces as child nodes (door leaves on their hinges, chest lids,
//     the torch's and the candles' flames), flat-shaded with one vertex-coloured material;
//   - the pack's own hero (`hero.glb`), rigged with its clips;
//   - two creatures from the Ultimate Platformer Pack already in the repository (`gob.glb` as the
//     shade, `skull.glb` as the wisp), loaded from their own folder.
// Static scenery is merged into a few geometries per level (Merger); repeated pieces are instanced;
// geometries made from the models are cached for the page's life (a World3D frees them at shutdown
// and three.js uploads them again on the next use).
import Phaser from 'phaser';
import { THREE, model, loadModel } from '@core/three';
import { asset } from '@core';

export const PACK = 'rr:ruins';
export const HERO = 'rr:hero';
export const SHADE = 'rr:shade';
export const WISP = 'rr:wisp';

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  loadModel(load, PACK, asset('quaternius/ultimate-modular-ruins-pack/ruins.glb'));
  loadModel(load, HERO, asset('quaternius/ultimate-modular-ruins-pack/hero.glb'));
  loadModel(load, SHADE, asset('quaternius/ultimate-platformer-pack/gob.glb'));
  loadModel(load, WISP, asset('quaternius/ultimate-platformer-pack/skull.glb'));
}

// ------------------------------------------------------------------ model geometry

const cache = new Map<string, THREE.BufferGeometry>();
let packRoot: THREE.Object3D | null = null;
const tv = new THREE.Vector3(), tc = new THREE.Color();

function root(): THREE.Object3D {
  if (!packRoot) { packRoot = model(PACK, { shadows: false }); packRoot.updateMatrixWorld(true); }
  return packRoot;
}

/**
 * One model (or one part of it, `id#part`) as a single non-indexed geometry with position and
 * colour, in the model's space (a part keeps its own pivot: draw it with partRest()).
 */
export function geo(key: string): THREE.BufferGeometry {
  let g = cache.get(key);
  if (g) return g;
  const [id, part] = key.split('#');
  const node = root().getObjectByName(id);
  const m = new Merger();
  if (node) {
    const base = part ? node.children.find((c) => c.name === part || c.name.startsWith(part + '_')) ?? node : node;
    const inv = base.matrixWorld.clone().invert();
    base.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) m.add(mesh.geometry, inv.clone().multiply(mesh.matrixWorld)); });
  }
  g = m.build();
  cache.set(key, g);
  return g;
}

/** A model's part as it stands in the model (`id#part` placed at its pivot). */
export function partGeo(id: string, part: string): THREE.BufferGeometry {
  const key = 'm:' + id + '#' + part;
  let g = cache.get(key);
  if (g) return g;
  const m = new Merger();
  m.add(geo(id + '#' + part), partRest(id, part));
  g = m.build();
  cache.set(key, g);
  return g;
}

const rests = new Map<string, THREE.Matrix4>();
/** Where a moving part's pivot sits in its model (a door leaf's hinge, a chest lid's). */
export function partRest(id: string, part: string): THREE.Matrix4 {
  const k = id + '#' + part;
  let m = rests.get(k);
  if (m) return m;
  const node = root().getObjectByName(id), p = node?.children.find((c) => c.name === part || c.name.startsWith(part + '_'));
  m = node && p ? node.matrixWorld.clone().invert().multiply(p.matrixWorld) : new THREE.Matrix4();
  rests.set(k, m);
  return m;
}

/** True for a geometry from the model cache (shared by every build; not freed mid-scene). */
export function isKitGeo(g: THREE.BufferGeometry): boolean {
  for (const v of cache.values()) if (v === g) return true;
  return false;
}

/** Accumulates placed geometries into one (position and colour; non-indexed, flat-shaded). */
export class Merger {
  private P: number[] = [];
  private C: number[] = [];

  get empty(): boolean { return this.P.length === 0; }
  get tris(): number { return this.P.length / 9; }

  /** Adds `g` placed by `m`, its colours multiplied by `tint` (or replaced by it with `flat`). */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, tint?: number, flat = false): void {
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    const flip = m.determinant() < 0;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    if (tint !== undefined) tc.setHex(tint); else tc.setRGB(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const ii = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      const v = idx ? idx.getX(ii) : ii;
      tv.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      this.P.push(tv.x, tv.y, tv.z);
      if (flat || !col) this.C.push(tc.r, tc.g, tc.b);
      else this.C.push(col.getX(v) * tc.r, col.getY(v) * tc.g, col.getZ(v) * tc.b);
    }
  }

  /** A triangle (counter-clockwise seen from its front) in one colour. */
  tri(a: number[], b: number[], c: number[], color: number): void {
    tc.setHex(color);
    for (const p of [a, b, c]) { this.P.push(p[0], p[1], p[2]); this.C.push(tc.r, tc.g, tc.b); }
  }

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
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** A matrix from a place, a turn about y and a scale (uniform, or [x, y, z]). */
export function place(x: number, y: number, z: number, rot = 0, s: number | [number, number, number] = 1): THREE.Matrix4 {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), sc);
}
