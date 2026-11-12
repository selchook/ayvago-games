// Crystal Keep: the Kenney Tower Defense Kit 2.0 and Mini Characters as shared, instanced 3D parts.
//   - One material per palette for every kit model (they all sample the kit's colormap).
//   - The map is merged into one mesh; the river's water into another (animated).
//   - Enemies, projectiles and effects are InstancedMeshes; the rigged Mini Characters are
//     instanced per body part from poses sampled once (their skins are rigid: one bone per vertex).
import Phaser from 'phaser';
import { THREE, model, modelClips, loadKenney3d, loadMiniCharacter, miniKey } from '@core/three';

export const KIT = 'tower-defense-kit';

/** Every kit model the game loads (the import keeps only these: tools/import-kenney.py PICK). */
export const KIT_MODELS = [
  'tile', 'tile-straight', 'tile-corner-round', 'tile-end-round', 'tile-spawn-end-round', 'tile-split',
  'tile-tree', 'tile-tree-double', 'tile-tree-quad', 'tile-rock', 'tile-crystal', 'tile-hill',
  'tile-river-straight', 'tile-river-bridge',
  'snow-tile', 'snow-tile-straight', 'snow-tile-corner-round', 'snow-tile-end-round', 'snow-tile-spawn-end-round', 'snow-tile-split',
  'snow-tile-tree', 'snow-tile-tree-double', 'snow-tile-tree-quad', 'snow-tile-rock', 'snow-tile-crystal', 'snow-tile-hill',
  'detail-tree', 'detail-tree-large', 'detail-rocks', 'detail-crystal', 'detail-crystal-large',
  'snow-detail-tree', 'snow-detail-tree-large', 'snow-detail-rocks', 'snow-detail-crystal',
  'tower-round-bottom-a', 'tower-round-bottom-c', 'tower-round-middle-a', 'tower-round-middle-c', 'tower-round-top-b',
  'tower-round-crystals',
  'tower-square-bottom-a', 'tower-square-bottom-b', 'tower-square-bottom-c', 'tower-square-middle-a', 'tower-square-middle-b',
  'tower-square-top-a',
  'weapon-ballista', 'weapon-cannon', 'weapon-catapult', 'weapon-turret',
  'weapon-ammo-arrow', 'weapon-ammo-cannonball', 'weapon-ammo-boulder', 'weapon-ammo-bullet',
  'enemy-ufo-a', 'enemy-ufo-b-weapon', 'enemy-ufo-d-weapon',
  'selection-a',
] as const;
export type KitModel = (typeof KIT_MODELS)[number];

export const ZOMBIE = 'character-zombie';
export const SOLDIER = 'character-soldier';
/** The keep's guards (the Reinforcements power). */
export const GUARD = 'character-male-c';

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of KIT_MODELS) loadKenney3d(load, 'td:' + n, KIT, n);
  loadMiniCharacter(load, ZOMBIE);
  loadMiniCharacter(load, SOLDIER);
  loadMiniCharacter(load, GUARD);
}

// ------------------------------------------------------------------ materials

export type Palette = 'green' | 'autumn' | 'snow';
const mats = new Map<string, THREE.Material>();

function kitTexture(): THREE.Texture {
  const src = model('td:tile', { shadows: false }) as THREE.Object3D;
  let tex: THREE.Texture | null = null;
  src.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.map) tex = m.map; });
  const t = tex as unknown as THREE.Texture;
  // the water's UVs sit exactly on the texture's bottom edge: clamp, or they wrap into the black top
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * An autumn copy of the kit's colormap: the grass and foliage swatch (x 192–255, y 256–383 of the
 * 512 px map) turns gold; paths, stone and water keep their colours, so the path still reads.
 */
function autumnTexture(): THREE.Texture {
  const src = kitTexture().image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const k = cv.width / 512;
  const x0 = Math.round(192 * k), y0 = Math.round(256 * k), w = Math.round(64 * k), h = Math.round(128 * k);
  const img = g.getImageData(x0, y0, w, h);
  const d = img.data;
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < d.length; i += 4) {
    c.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    c.getHSL(hsl, THREE.SRGBColorSpace);
    c.setHSL(0.11 + (hsl.l - 0.5) * 0.06, Math.min(1, hsl.s * 1.05), hsl.l * 1.02, THREE.SRGBColorSpace);
    const o = { r: 0, g: 0, b: 0 };
    c.getRGB(o, THREE.SRGBColorSpace);
    d[i] = o.r * 255; d[i + 1] = o.g * 255; d[i + 2] = o.b * 255;
  }
  g.putImageData(img, x0, y0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The kit's shared material, in the kit's own colours or the autumn ones. */
export function kitMat(_scene: Phaser.Scene, palette: Palette = 'green'): THREE.MeshLambertMaterial {
  const k = 'kit:' + (palette === 'autumn' ? 'autumn' : 'green');
  let m = mats.get(k) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: palette === 'autumn' ? autumnTexture() : kitTexture() });
    mats.set(k, m);
  }
  return m;
}

/** A see-through copy of the kit material for build previews. */
export function ghostMat(scene: Phaser.Scene): THREE.MeshLambertMaterial {
  let m = mats.get('ghost') as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: kitMat(scene).map, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0x335577 });
    mats.set('ghost', m);
  }
  return m;
}

/** A copy of a kit model with the shared material. */
export function kitModel(name: KitModel, mat: THREE.Material, shadows = true): THREE.Object3D {
  const o = model('td:' + name, { shadows });
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = mat; });
  return o;
}

// ------------------------------------------------------------------ geometry

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Strips a geometry to position / normal / uv, non-indexed (so any set can be merged). */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  out.setAttribute('normal', src.getAttribute('normal'));
  out.setAttribute('uv', src.getAttribute('uv'));
  return out;
}

/** One geometry for a whole kit model (all its meshes, node transforms baked in). Cached. */
export function kitGeo(name: KitModel): THREE.BufferGeometry {
  let g = geoCache.get(name);
  if (g) return g;
  const o = model('td:' + name, { shadows: false });
  o.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const p = plain(m.geometry);
    p.applyMatrix4(m.matrixWorld);
    parts.push(p);
  });
  g = merge(parts);
  geoCache.set(name, g);
  return g;
}

/** Concatenates non-indexed position/normal/uv geometries. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set((p.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, o * 3);
    nor.set((p.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array, o * 3);
    uv.set((p.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array, o * 2);
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** Collects kit models at transforms into one merged mesh; the river's water goes to its own geometry. */
export class StaticBatch {
  private parts: THREE.BufferGeometry[] = [];
  private water: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  add(name: KitModel, x: number, y: number, z: number, rotY = 0, scale = 1): void {
    this.q.setFromAxisAngle(this.up, rotY);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale, scale, scale));
    const g = kitGeo(name).clone().applyMatrix4(this.m);
    if (name.includes('river')) {
      const [land, water] = splitWater(g);
      this.parts.push(land);
      if (water) this.water.push(water);
    } else this.parts.push(g);
  }

  build(mat: THREE.Material): { land: THREE.Mesh; water: THREE.BufferGeometry | null } {
    const land = new THREE.Mesh(merge(this.parts), mat);
    land.receiveShadow = true;
    land.castShadow = true;
    for (const p of this.parts) p.dispose();
    const water = this.water.length ? merge(this.water) : null;
    this.parts = [];
    this.water = [];
    return { land, water };
  }
}

/** Splits off the triangles that sample the water colour (uv = 0,1 in this kit). */
function splitWater(g: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry | null] {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const keep: number[] = [], wet: number[] = [];
  for (let t = 0; t < uv.count; t += 3) {
    let w = true;
    for (let k = 0; k < 3; k++) if (uv.getX(t + k) > 0.01 || uv.getY(t + k) < 0.99) w = false;
    (w ? wet : keep).push(t);
  }
  if (!wet.length) return [g, null];
  const pick = (tris: number[]) => {
    const out = new THREE.BufferGeometry();
    const P = new Float32Array(tris.length * 9), Nn = new Float32Array(tris.length * 9), U = new Float32Array(tris.length * 6);
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const v = t + k, o = i * 3 + k;
        P[o * 3] = pos.getX(v); P[o * 3 + 1] = pos.getY(v); P[o * 3 + 2] = pos.getZ(v);
        Nn[o * 3] = nor.getX(v); Nn[o * 3 + 1] = nor.getY(v); Nn[o * 3 + 2] = nor.getZ(v);
        U[o * 2] = uv.getX(v); U[o * 2 + 1] = uv.getY(v);
      }
    });
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    return out;
  };
  const res: [THREE.BufferGeometry, THREE.BufferGeometry] = [pick(keep), pick(wet)];
  g.dispose();
  return res;
}

// ------------------------------------------------------------------ instancing

const _m = new THREE.Matrix4();
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
    if (color !== undefined && this.mesh.instanceColor) this.mesh.setColorAt(this.n, typeof color === 'number' ? _c.setHex(color) : color);
    this.n++;
    return true;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get count(): number { return this.n; }
}

/** Poses of a rigged Mini Character, sampled per clip: frames × joints matrices (model space). */
interface ClipPoses { dur: number; frames: THREE.Matrix4[][] }

/**
 * Draws many copies of a rigged Mini Character with one InstancedMesh per body part (six draw
 * calls for any number of figures). Each part is the triangles skinned to one bone; a figure's
 * part matrix is its own transform times the bone's pose at the figure's clip time.
 */
export class RigInstances {
  private parts: { joint: number; inst: Instances }[] = [];
  private clips = new Map<string, ClipPoses>();
  private tmp = new THREE.Matrix4();
  static FRAMES = 24;

  constructor(parent: THREE.Object3D, name: string, clipNames: string[], max: number) {
    const key = miniKey(name);
    const root = model(key, { shadows: false });
    root.updateMatrixWorld(true);
    const skinned: THREE.SkinnedMesh[] = [];
    root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    const bones = skinned[0].skeleton.bones;
    const srcMat = skinned[0].material as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshLambertMaterial({ map: srcMat.map });
    // body parts: triangles grouped by bone, in bind space
    const byJoint = new Map<number, THREE.BufferGeometry[]>();
    for (const sm of skinned) {
      const g = sm.geometry.index ? sm.geometry.toNonIndexed() : sm.geometry;
      const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
      const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const tris = new Map<number, number[]>();
      for (let t = 0; t < pos.count; t += 3) {
        let j = si.getX(t), w = sw.getX(t);
        for (const [jj, ww] of [[si.getY(t), sw.getY(t)], [si.getZ(t), sw.getZ(t)], [si.getW(t), sw.getW(t)]]) if (ww > w) { w = ww; j = jj; }
        // the joint index into this mesh's own skeleton → the bone object → its index in bones
        const bone = sm.skeleton.bones[j];
        const bi = bones.indexOf(bone);
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
        // bake the bind matrix in, so a part only needs bone.matrixWorld × boneInverse
        geo.applyMatrix4(sm.bindMatrix);
        if (!byJoint.has(bi)) byJoint.set(bi, []);
        byJoint.get(bi)!.push(geo);
      }
    }
    for (const [joint, geos] of byJoint) {
      this.parts.push({ joint, inst: new Instances(parent, merge(geos), mat, max, { shadows: true, colors: true }) });
      for (const g of geos) g.dispose();
    }
    // poses: every clip sampled at FRAMES steps
    const inverses = skinned[0].skeleton.boneInverses;
    const mixer = new THREE.AnimationMixer(root);
    const all = modelClips(key);
    for (const cn of clipNames) {
      const clip = all.find((c) => c.name === cn);
      if (!clip) continue;
      mixer.stopAllAction();
      const act = mixer.clipAction(clip);
      act.play();
      const frames: THREE.Matrix4[][] = [];
      for (let f = 0; f < RigInstances.FRAMES; f++) {
        mixer.setTime((f / RigInstances.FRAMES) * clip.duration);
        root.updateMatrixWorld(true);
        frames.push(this.parts.map((p) => new THREE.Matrix4().multiplyMatrices(bones[p.joint].matrixWorld, inverses[p.joint])));
      }
      this.clips.set(cn, { dur: clip.duration, frames });
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
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

  /** Draw calls (one per part). */
  get drawCalls(): number { return this.parts.length; }
}

export { _m as scratchMatrix };
