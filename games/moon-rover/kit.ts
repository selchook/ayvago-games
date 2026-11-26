// Moon Rover: the 3D kit. Kenney's Space Kit (CC0): every model is its own small GLB, loaded under
// the Ayvago intro. The game never draws the loaded scenes as they are: each model becomes one
// non-indexed geometry with its materials' colours as vertex colours (flat-shaded with one shared
// material), recoloured by role where a region wants its own look (the kit's orange regolith turned
// to grey moon dust, its crystals to the region's hue). Static pieces are merged into a few chunks
// per level (Merger); repeated moving pieces are instanced. Geometries made from the models are
// cached for the page's life.
import Phaser from 'phaser';
import { THREE, model, loadModel, hasModel } from '@core/three';
import { kenney } from '@core';

/** Every model the game uses (file names in public/assets/kenney/space-kit/models/gltf_format). */
export const MODELS = [
  // terrain
  'terrain', 'terrain_side', 'terrain_roadstraight', 'terrain_roadcorner', 'terrain_roadcross', 'terrain_roadend', 'terrain_roadsplit',
  'crater', 'craterlarge', 'rock', 'rock_largea', 'rock_largeb', 'rocks_smalla', 'rocks_smallb', 'rock_crystals', 'rock_crystalslargea', 'rock_crystalslargeb',
  'meteor', 'meteor_detailed',
  // the rover, the crew, the alien
  'rover', 'astronauta', 'astronautb', 'alien',
  // the base and the outposts
  'hangar_largea', 'hangar_smalla', 'hangar_roundglass', 'platform_large', 'platform_small', 'gate_simple', 'gate_complex',
  'satellitedish', 'satellitedish_large', 'structure_closed', 'supports_high', 'machine_wireless', 'machine_generator', 'machine_generatorlarge',
  'barrels', 'barrel', 'pipe_supporthigh',
  // hazards and set-pieces
  'turret_single', 'turret_double', 'monorail_trackstraight', 'monorail_trainfront', 'monorail_trainpassenger', 'monorail_traincargo', 'monorail_trainend',
  'craft_miner', 'craft_cargoa', 'rocket_basea', 'rocket_finsa', 'rocket_sidesa', 'rocket_fuela', 'rocket_topa',
] as const;
export type ModelName = typeof MODELS[number];

const key = (n: string): string => 'mr:' + n;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of MODELS) loadModel(load, key(n), kenney(`space-kit/models/gltf_format/${n}.glb`));
}

export const kitReady = (): boolean => MODELS.every((n) => hasModel(key(n)));

// ------------------------------------------------------------------ geometry

/** A colour for each of the kit's material names (a missing name keeps the material's own). */
export type Recolor = Partial<Record<string, number>>;

const roots = new Map<string, THREE.Object3D>();
const cache = new Map<string, THREE.BufferGeometry>();
const tv = new THREE.Vector3(), tc = new THREE.Color();

/** The model's named node (the kit wraps each in `tmpParent`, offset by (2, 0, 1.5)). */
function rootOf(name: string): THREE.Object3D | null {
  let r = roots.get(name);
  if (!r) {
    if (!hasModel(key(name))) return null;
    const scene = model(key(name), { shadows: false });
    scene.updateMatrixWorld(true);
    const tmp = scene.children[0];
    r = tmp?.children[0] ?? tmp ?? scene;
    roots.set(name, r);
  }
  return r;
}

/**
 * A model (or one of its child nodes, `part`) as one geometry with position and colour, in the
 * model's own space (a part round its own pivot). `only` keeps the listed materials, `skip` drops
 * them, `recolor` swaps material colours, `skipParts` leaves those child nodes out, `centre`
 * moves the footprint's middle to the origin.
 */
export function geo(name: string, o: { part?: string; recolor?: Recolor; tag?: string; only?: string[]; skip?: string[]; skipParts?: string[]; centre?: boolean } = {}): THREE.BufferGeometry {
  const k = [name, o.part ?? '', o.tag ?? '', o.only?.join() ?? '', o.skip?.join() ?? '', o.skipParts?.join() ?? '', o.centre ? 'c' : ''].join('|');
  let g = cache.get(k);
  if (g) return g;
  const root = rootOf(name);
  const m = new Merger();
  if (root) {
    const base = o.part ? findNode(root, o.part) ?? root : root;
    const inv = base.matrixWorld.clone().invert();
    const walk = (obj: THREE.Object3D) => {
      if (obj !== base && o.skipParts?.includes(obj.name)) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const mat = mats[0] as THREE.MeshStandardMaterial;
        const nm = mat?.name ?? '';
        if ((!o.only || o.only.includes(nm)) && !o.skip?.includes(nm)) {
          const col = o.recolor?.[nm];
          m.add(mesh.geometry, inv.clone().multiply(mesh.matrixWorld), col ?? (mat?.color ? mat.color.getHex() : 0xffffff), true, col === undefined ? mat?.color : undefined);
        }
      }
      for (const c of obj.children) walk(c);
    };
    walk(base);
  }
  g = m.build();
  if (o.centre) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
    g.computeBoundingSphere();
  }
  cache.set(k, g);
  return g;
}

function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let out: THREE.Object3D | null = null;
  root.traverse((c) => { if (!out && c !== root && c.name === name) out = c; });
  return out;
}

const rests = new Map<string, THREE.Matrix4>();
/** Where a child node's pivot sits in its model. */
export function partRest(name: string, part: string): THREE.Matrix4 {
  const k = name + '#' + part;
  let m = rests.get(k);
  if (m) return m;
  const root = rootOf(name);
  const p = root ? findNode(root, part) : null;
  m = root && p ? root.matrixWorld.clone().invert().multiply(p.matrixWorld) : new THREE.Matrix4();
  rests.set(k, m);
  return m;
}

/** True for a geometry from the model cache (shared by every level; not freed mid-scene). */
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

  /**
   * Adds `g` placed by `m`. A geometry with colours keeps them multiplied by `tint`; `flat` paints
   * it all `tint`; `linear` is a material's own (linear) colour, used as it is.
   */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, tint?: number, flat = false, linear?: THREE.Color): void {
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    const flip = m.determinant() < 0;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    if (linear) tc.copy(linear); else if (tint !== undefined) tc.setHex(tint); else tc.setRGB(1, 1, 1);
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

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** A matrix from a place, a turn about y and a scale (uniform, or [x, y, z]). */
export function place(x: number, y: number, z: number, rot = 0, s: number | [number, number, number] = 1): THREE.Matrix4 {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), sc);
}
