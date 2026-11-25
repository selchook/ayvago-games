// Dungeon Rescue: the 3D kit. What the game loads and how it is drawn with few draw calls:
//   - `dungeon.glb` (import-pack.mjs): every model of Quaternius's Modular Dungeon the game uses as a
//     root node, the moving pieces as child nodes (chest lids on their hinges, the flames of the torch
//     and the campfire, the spikes of the trap), flat-shaded with one vertex-coloured material;
//   - the Ultimate Animated Character Pack: one `clips.glb` with the twelve clips every figure shares
//     (one skeleton for all), and one small GLB per figure (its skinned mesh). Boot loads the dungeon,
//     the clips, the knight's chosen look and the disguise; each level loads only the figures it shows
//     (its guards, the Chief, its prisoners) before it starts, and keeps them for the rest of the visit.
// Static scenery is merged into a few geometries per level (Merger); repeated moving pieces are
// instanced; geometries made from the models are cached for the page's life.
import Phaser from 'phaser';
import { THREE, model, loadModel, hasModel, modelClips } from '@core/three';
import { asset } from '@core';

export const PACK = 'dr:dungeon';
export const CLIPS = 'dr:clips';
export const charKey = (id: string): string => 'dr:ch:' + id;
const charUrl = (id: string): string => asset(`quaternius/ultimate-animated-characters/${id}.glb`);

export function loadKit(load: Phaser.Loader.LoaderPlugin, figures: string[]): void {
  loadModel(load, PACK, asset('quaternius/modular-dungeon/dungeon.glb'));
  loadModel(load, CLIPS, asset('quaternius/ultimate-animated-characters/clips.glb'));
  for (const id of figures) loadModel(load, charKey(id), charUrl(id));
}

/** Loads the figures a level needs (those not loaded yet); resolves once every one is parsed. */
export function loadFigures(scene: Phaser.Scene, ids: string[]): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !hasModel(charKey(id)));
  if (!missing.length) return Promise.resolve();
  return new Promise((resolve) => {
    for (const id of missing) loadModel(scene.load, charKey(id), charUrl(id));
    const t0 = performance.now();
    const check = () => {
      if (missing.every((id) => hasModel(charKey(id))) || performance.now() - t0 > 20000) { resolve(); return; }
      setTimeout(check, 40);
    };
    scene.load.once(Phaser.Loader.Events.COMPLETE, check);
    scene.load.start();
  });
}

export const figureReady = (id: string): boolean => hasModel(charKey(id));

/** The shared clips by name. */
let clipMap: Map<string, THREE.AnimationClip> | null = null;
export function clip(name: string): THREE.AnimationClip | undefined {
  if (!clipMap) clipMap = new Map(modelClips(CLIPS).map((c) => [c.name, c]));
  return clipMap.get(name);
}

/** A new copy of a figure (skinned, its own skeleton), drawn with `mat`. */
export function figure(id: string, mat: THREE.Material): THREE.Object3D {
  const key = hasModel(charKey(id)) ? charKey(id) : charKey('casual');
  const o = model(key, { shadows: false });
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) { m.material = mat; m.frustumCulled = false; }
  });
  return o;
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
 * One model's static part (or one moving part, `id#part`) as a single non-indexed geometry with
 * position and colour: the static part in the model's space, a moving part round its own pivot (draw
 * it with partRest()).
 */
export function geo(key: string): THREE.BufferGeometry {
  let g = cache.get(key);
  if (g) return g;
  const [id, part] = key.split('#');
  const node = root().getObjectByName(id);
  const m = new Merger();
  if (node) {
    // the model's static part is its `body` child (models with moving parts have no `body`: all of it)
    const want = part ?? 'body';
    const base = node.children.find((c) => c.name === want || c.name.startsWith(want + '_')) ?? node;
    const inv = (part ? base : node).matrixWorld.clone().invert();
    base.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) m.add(mesh.geometry, inv.clone().multiply(mesh.matrixWorld)); });
  }
  g = m.build();
  cache.set(key, g);
  return g;
}

/** A model with every part as it stands (lid shut, flame lit). */
export function wholeGeo(id: string): THREE.BufferGeometry {
  const key = 'whole:' + id;
  let g = cache.get(key);
  if (g) return g;
  const node = root().getObjectByName(id);
  const m = new Merger();
  if (node) {
    const inv = node.matrixWorld.clone().invert();
    node.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) m.add(mesh.geometry, inv.clone().multiply(mesh.matrixWorld)); });
  }
  g = m.build();
  cache.set(key, g);
  return g;
}

const rests = new Map<string, THREE.Matrix4>();
/** Where a moving part's pivot sits in its model (a chest lid's hinge, a flame). */
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
