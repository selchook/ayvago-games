// Snack Shack: the Kenney Food Kit 2.0, Furniture Kit 2.1 and Mini Characters as shared,
// instanced 3D parts.
//   - Every Food Kit model shares one material (the kit's colormap); every Furniture Kit model
//     shares one vertex-colour material (each part's own colour is baked into its vertices).
//   - The diner's static furniture and decor are merged into two meshes (one per kit).
//   - Food on the stations and food in flight are InstancedMeshes, one per food model.
//   - Customers are rigged Mini Characters instanced per body part from poses sampled once.
import Phaser from 'phaser';
import { THREE, model, modelClips, loadKenney3d, loadMiniCharacter, miniKey } from '@core/three';

export const FOOD_KIT = 'food-kit';
export const FURNITURE_KIT = 'furniture-kit';

/** Every Food Kit model the game loads (the import keeps only these: tools/import-kenney.py FOOD_KIT). */
export const FOOD_MODELS = [
  'burger', 'burger-cheese', 'meat-patty', 'meat-sausage', 'hot-dog', 'fries', 'soda',
  'ice-cream', 'ice-cream-cne', 'cabbage', 'tomato', 'plate', 'pot', 'bread', 'bottle-ketchup',
  'bottle-musterd', 'cupcake', 'shaker-salt', 'shaker-pepper',
] as const;
export type FoodModel = (typeof FOOD_MODELS)[number];

/** Every Furniture Kit model the game loads (tools/import-kenney.py FURNITURE_KIT). */
export const FURNITURE_MODELS = [
  'kitchenBar', 'kitchenBarEnd', 'kitchenCabinet', 'kitchenStove', 'kitchenStoveElectric',
  'kitchenCoffeeMachine', 'kitchenFridgeLarge', 'kitchenMicrowave',
  'stoolBar', 'wall', 'wallWindow', 'wallDoorway', 'pottedPlant', 'plantSmall1', 'trashcan', 'radio',
  'televisionModern', 'rugRectangle', 'tableRound', 'chair',
] as const;
export type FurnitureModel = (typeof FURNITURE_MODELS)[number];

/** The customers' figures (Mini Characters); the chef is the player's own character. */
export const CUSTOMER_FIGURES = ['character-male-a', 'character-female-f', 'character-male-c', 'character-male-e'] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of FOOD_MODELS) loadKenney3d(load, 'food:' + n, FOOD_KIT, n);
  for (const n of FURNITURE_MODELS) loadKenney3d(load, 'furn:' + n, FURNITURE_KIT, n);
  for (const n of CUSTOMER_FIGURES) loadMiniCharacter(load, n);
}

// ------------------------------------------------------------------ materials

let foodMatShared: THREE.MeshLambertMaterial | null = null;
let furnMatShared: THREE.MeshLambertMaterial | null = null;

/** The Food Kit's one material (its colormap). Kept for the whole game: models share it. */
export function foodMat(): THREE.MeshLambertMaterial {
  if (!foodMatShared) {
    let tex: THREE.Texture | null = null;
    model('food:burger', { shadows: false }).traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.map) tex = m.map;
    });
    foodMatShared = new THREE.MeshLambertMaterial({ map: tex });
  }
  return foodMatShared;
}

/** The Furniture Kit's one material: colours live in the vertices. */
export function furnMat(): THREE.MeshLambertMaterial {
  furnMatShared ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  return furnMatShared;
}

// The shared materials outlive a scene; World3D frees every material in its scene on shutdown,
// and three.js uploads a freed one again on its next render, so a restart adds nothing new.

// ------------------------------------------------------------------ geometry

const geoCache = new Map<string, THREE.BufferGeometry>();

/** One non-indexed geometry for a whole model: position, normal, and uv (food) or colour (furniture). */
function bake(key: string, colors: boolean): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (g) return g;
  const o = model(key, { shadows: false });
  o.updateMatrixWorld(true);
  const P: number[] = [], N: number[] = [], U: number[] = [], C: number[] = [];
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = src.getAttribute('position'), nor = src.getAttribute('normal'), uv = src.getAttribute('uv');
    nm.getNormalMatrix(m.matrixWorld);
    const mat = m.material as THREE.MeshStandardMaterial;
    col.copy(mat.color ?? new THREE.Color(1, 1, 1));
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      N.push(v.x, v.y, v.z);
      if (colors) C.push(col.r, col.g, col.b);
      else U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (src !== m.geometry) src.dispose();
  });
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  else g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/** A Food Kit model as one cached geometry, centred on x/z and standing on y = 0. */
export function foodGeo(name: FoodModel): THREE.BufferGeometry {
  const k = 'c:food:' + name;
  let g = geoCache.get(k);
  if (!g) {
    g = bake('food:' + name, false).clone();
    centre(g);
    geoCache.set(k, g);
  }
  return g;
}

/** A Furniture Kit model as one cached geometry (the kit's pivot: corner at the back-left, front at z = 0). */
export function furnGeo(name: FurnitureModel): THREE.BufferGeometry {
  return bake('furn:' + name, true);
}

function centre(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/** Size of a cached food geometry. */
export function foodSize(name: FoodModel): THREE.Vector3 {
  return foodGeo(name).boundingBox!.getSize(new THREE.Vector3());
}

/** Size of a furniture geometry. */
export function furnSize(name: FurnitureModel): THREE.Vector3 {
  const g = furnGeo(name);
  g.computeBoundingBox();
  return g.boundingBox!.getSize(new THREE.Vector3());
}

/** Concatenates non-indexed geometries with the same attributes. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  if (!parts.length) return out;
  for (const name of Object.keys(parts[0].attributes)) {
    const size = parts[0].getAttribute(name).itemSize;
    let n = 0;
    for (const p of parts) n += p.getAttribute(name).count;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const p of parts) {
      const a = p.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

/** Collects kit models at transforms into two merged meshes: furniture and food decor. */
export class StaticBatch {
  private furn: THREE.BufferGeometry[] = [];
  private food: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /** A furniture piece: `x, z` is where the kit's pivot goes; rotY turns it around that point. */
  furniture(name: FurnitureModel, x: number, y: number, z: number, rotY = 0, scale: number | [number, number, number] = 1): void {
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s[0], s[1], s[2]));
    this.furn.push(furnGeo(name).clone().applyMatrix4(this.m));
  }

  /** A food decor piece centred at x, z standing on y. */
  foodItem(name: FoodModel, x: number, y: number, z: number, rotY = 0, scale = 1): void {
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale, scale, scale));
    this.food.push(foodGeo(name).clone().applyMatrix4(this.m));
  }

  /** Any other geometry with a vertex colour (floor, walls): baked into the furniture mesh. */
  painted(g: THREE.BufferGeometry, color: number): void {
    const src = g.index ? g.toNonIndexed() : g;
    const n = src.getAttribute('position').count;
    const c = new THREE.Color(color);
    const C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) C.set([c.r, c.g, c.b], i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', src.getAttribute('position'));
    out.setAttribute('normal', src.getAttribute('normal'));
    out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.furn.push(out);
  }

  build(parent: THREE.Object3D): void {
    const f = new THREE.Mesh(merge(this.furn), furnMat());
    f.castShadow = f.receiveShadow = true;
    const d = new THREE.Mesh(merge(this.food), foodMat());
    d.castShadow = d.receiveShadow = true;
    parent.add(f, d);
    for (const p of [...this.furn, ...this.food]) p.dispose();
    this.furn = [];
    this.food = [];
  }
}

// ------------------------------------------------------------------ instancing

const _c = new THREE.Color();

/** A pool of one geometry drawn as one InstancedMesh: begin(), put() each frame, end(). */
export class Instances {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, readonly max: number, opts: { shadows?: boolean; colors?: boolean } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (opts.colors) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.castShadow = opts.shadows ?? false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }
  begin(): void { this.n = 0; }
  put(m: THREE.Matrix4, color?: THREE.Color | number): boolean {
    if (this.n >= this.max) return false;
    this.mesh.setMatrixAt(this.n, m);
    if (this.mesh.instanceColor) {
      if (color === undefined) this.mesh.setColorAt(this.n, _c.setRGB(1, 1, 1));
      else this.mesh.setColorAt(this.n, typeof color === 'number' ? _c.setHex(color) : color);
    }
    this.n++;
    return true;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get count(): number { return this.n; }
}

/** Poses of a rigged Mini Character, sampled per clip: frames × parts matrices (model space). */
interface ClipPoses { dur: number; frames: THREE.Matrix4[][] }

interface BakedRig { parts: { joint: number; geo: THREE.BufferGeometry }[]; mat: THREE.MeshLambertMaterial; clips: Map<string, ClipPoses> }
const rigCache = new Map<string, BakedRig>();

/** Splits a rigged Mini Character into rigid body parts and samples its clips (see RigInstances). */
function bakeRig(name: string, clipNames: string[]): BakedRig {
  const FRAMES = RigInstances.FRAMES;
  const key = miniKey(name);
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
  const bones = skinned[0].skeleton.bones;
  const srcMat = skinned[0].material as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshLambertMaterial({ map: srcMat.map });
  const byJoint = new Map<number, THREE.BufferGeometry[]>();
  for (const sm of skinned) {
    const g = sm.geometry.index ? sm.geometry.toNonIndexed() : sm.geometry;
    const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
    const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const tris = new Map<number, number[]>();
    for (let t = 0; t < pos.count; t += 3) {
      let j = si.getX(t), w = sw.getX(t);
      for (const [jj, ww] of [[si.getY(t), sw.getY(t)], [si.getZ(t), sw.getZ(t)], [si.getW(t), sw.getW(t)]]) if (ww > w) { w = ww; j = jj; }
      const bi = bones.indexOf(sm.skeleton.bones[j]);
      if (!tris.has(bi)) tris.set(bi, []);
      tris.get(bi)!.push(t);
    }
    for (const [bi, list] of tris) {
      const P = new Float32Array(list.length * 9), Nn = new Float32Array(list.length * 9), U = new Float32Array(list.length * 6);
      list.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          const v = t + k, o = i * 3 + k;
          P.set([pos.getX(v), pos.getY(v), pos.getZ(v)], o * 3);
          Nn.set([nor.getX(v), nor.getY(v), nor.getZ(v)], o * 3);
          U.set([uv.getX(v), uv.getY(v)], o * 2);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      geo.applyMatrix4(sm.bindMatrix);
      if (!byJoint.has(bi)) byJoint.set(bi, []);
      byJoint.get(bi)!.push(geo);
    }
    if (g !== sm.geometry) g.dispose();
  }
  const parts: BakedRig['parts'] = [];
  for (const [joint, geos] of byJoint) {
    parts.push({ joint, geo: merge(geos) });
    for (const g of geos) g.dispose();
  }
  const inverses = skinned[0].skeleton.boneInverses;
  const mixer = new THREE.AnimationMixer(root);
  const all = modelClips(key);
  const clips = new Map<string, ClipPoses>();
  for (const cn of clipNames) {
    const clip = all.find((c) => c.name === cn);
    if (!clip) continue;
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    act.play();
    const frames: THREE.Matrix4[][] = [];
    for (let f = 0; f < FRAMES; f++) {
      mixer.setTime((f / FRAMES) * clip.duration);
      root.updateMatrixWorld(true);
      frames.push(parts.map((p) => new THREE.Matrix4().multiplyMatrices(bones[p.joint].matrixWorld, inverses[p.joint])));
    }
    clips.set(cn, { dur: clip.duration, frames });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return { parts, mat, clips };
}

/**
 * Draws many copies of a rigged Mini Character with one InstancedMesh per body part (one draw
 * call per part for any number of figures). Each part is the triangles skinned to one bone; a
 * figure's part matrix is its own transform times the bone's pose at the figure's clip time.
 * Every move is one of the model's own clips (walk, sit, emote-yes, emote-no …).
 */
export class RigInstances {
  private parts: { joint: number; inst: Instances }[] = [];
  private clips: Map<string, ClipPoses>;
  private tmp = new THREE.Matrix4();
  static FRAMES = 24;

  constructor(parent: THREE.Object3D, name: string, clipNames: string[], max: number) {
    // the baked parts and poses are made once per figure and shared by every scene (menu, play)
    const key = name + '|' + clipNames.join(',');
    let baked = rigCache.get(key);
    if (!baked) { baked = bakeRig(name, clipNames); rigCache.set(key, baked); }
    this.clips = baked.clips;
    for (const p of baked.parts) {
      this.parts.push({ joint: p.joint, inst: new Instances(parent, p.geo, baked.mat, max, { shadows: true, colors: true }) });
    }
  }

  clipDuration(clip: string): number {
    return this.clips.get(clip)?.dur ?? 1;
  }

  begin(): void { for (const p of this.parts) p.inst.begin(); }

  /** One figure: its world matrix, a clip and the time in it (looped unless `hold`). */
  put(world: THREE.Matrix4, clip: string, t: number, color: THREE.Color, hold = false): void {
    const c = this.clips.get(clip);
    if (!c) return;
    const u = hold ? Math.min(0.999, t / c.dur) : ((t / c.dur) % 1 + 1) % 1;
    const f = c.frames[Math.floor(u * RigInstances.FRAMES)];
    this.parts.forEach((p, i) => p.inst.put(this.tmp.multiplyMatrices(world, f[i]), color));
  }

  end(): void { for (const p of this.parts) p.inst.end(); }

  get drawCalls(): number { return this.parts.length; }
}
