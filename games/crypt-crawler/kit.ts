// Crypt Crawler: the Kenney Mini Dungeon, Graveyard Kit and Platformer Kit as shared, instanced
// 3D parts.
//   - One material per kit: Mini Dungeon and the Graveyard Kit each sample their own colormap;
//     the Platformer Kit's few pickups have their material colour baked into vertex colours.
//   - Rooms are merged into one static mesh per kit; repeated props, pickups, doors and traps
//     are InstancedMeshes.
//   - Enemies are rigged figures (the Graveyard Kit's node rigs, Mini Dungeon's skinned orc)
//     instanced per body part from poses sampled once, with sockets for the weapons they hold.
import Phaser from 'phaser';
import { THREE, model, modelClips, loadKenney3d, loadCharacter3d } from '@core/three';
import { kenney } from '@core';

export const MD = 'mini-dungeon';
export const GY = 'graveyard-kit';
export const PK = 'platformer-kit';

/** Every Mini Dungeon model the game loads (tools/import-kenney.py MINI_DUNGEON). */
export const MD_MODELS = [
  'floor', 'floor-detail', 'wall', 'wall-half', 'wall-opening', 'gate', 'chest', 'coin', 'trap', 'barrel',
  'banner', 'column', 'stairs', 'rocks', 'stones', 'weapon-sword', 'weapon-spear', 'shield-round',
  'wood-structure', 'character-orc',
] as const;
/** Every Graveyard Kit model the game loads (tools/import-kenney.py GRAVEYARD_KIT). */
export const GY_MODELS = [
  'character-skeleton', 'character-ghost', 'character-zombie', 'character-vampire', 'candle',
  'candle-multiple', 'fire-basket', 'urn-round', 'urn-square', 'altar-stone', 'lantern-candle',
  'pillar-large', 'debris', 'coffin', 'gravestone-cross',
] as const;
/** Platformer Kit pickups and the saw (already in the repo). */
export const PK_MODELS = ['heart', 'key', 'jewel', 'saw'] as const;

export type MdModel = (typeof MD_MODELS)[number];
export type GyModel = (typeof GY_MODELS)[number];
export type PkModel = (typeof PK_MODELS)[number];

export const md = (n: MdModel) => 'md:' + n;
export const gy = (n: GyModel) => 'gy:' + n;
export const pk = (n: PkModel) => 'pk:' + n;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of MD_MODELS) loadKenney3d(load, md(n), MD, n);
  for (const n of GY_MODELS) loadKenney3d(load, gy(n), GY, n);
  for (const n of PK_MODELS) loadKenney3d(load, pk(n), PK, n);
  loadCharacter3d(load);
  // Mini Dungeon's second palette (deeper floors): a plain image, turned into a texture later
  load.image('cc-variation', kenney('mini-dungeon/models/Textures/variation-a.png'));
}

// ------------------------------------------------------------------ materials

const mats = new Map<string, THREE.Material>();

function mapOf(key: string): THREE.Texture {
  let tex: THREE.Texture | null = null;
  model(key, { shadows: false }).traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.map) tex = m.map;
  });
  return tex as unknown as THREE.Texture;
}

/** Mini Dungeon's material. Palette 1 uses the kit's own "variation-a" colormap (deeper floors). */
export function mdMat(scene: Phaser.Scene, palette = 0): THREE.MeshLambertMaterial {
  const k = 'md' + palette;
  let m = mats.get(k) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    let map = mapOf(md('floor'));
    if (palette === 1 && scene.textures.exists('cc-variation')) {
      const img = scene.textures.get('cc-variation').getSourceImage() as HTMLImageElement;
      const t = new THREE.Texture(img);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = map.magFilter;
      t.minFilter = map.minFilter;
      t.needsUpdate = true;
      map = t;
    }
    m = new THREE.MeshLambertMaterial({ map });
    m.name = 'mini-dungeon';
    mats.set(k, m);
  }
  return m;
}

/** The Graveyard Kit's material. */
export function gyMat(): THREE.MeshLambertMaterial {
  let m = mats.get('gy') as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: mapOf(gy('candle')) });
    m.name = 'graveyard-kit';
    mats.set('gy', m);
  }
  return m;
}

/** Vertex-coloured matte material (Platformer Kit pickups, procedural props). */
export function vcMat(): THREE.MeshLambertMaterial {
  let m = mats.get('vc') as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ vertexColors: true });
    mats.set('vc', m);
  }
  return m;
}

/** Additive glow (flames, magic, slashes, telegraphs): tinted per instance. */
export function glowMat(opacity = 1): THREE.MeshBasicMaterial {
  const k = 'glow' + opacity;
  let m = mats.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    mats.set(k, m);
  }
  return m;
}

/** See-through dark material (shadows of pickups, pits). */
export function shadeMat(): THREE.MeshBasicMaterial {
  let m = mats.get('shade') as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    mats.set('shade', m);
  }
  return m;
}

// ------------------------------------------------------------------ geometry

const geoCache = new Map<string, THREE.BufferGeometry>();

/** position / normal / uv / colour, non-indexed, so any set of parts can be merged. */
export function plain(g: THREE.BufferGeometry, color?: THREE.Color): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const out = new THREE.BufferGeometry();
  const n = src.getAttribute('position').count;
  out.setAttribute('position', src.getAttribute('position'));
  out.setAttribute('normal', src.getAttribute('normal') ?? new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  out.setAttribute('uv', src.getAttribute('uv') ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const c = new Float32Array(n * 3);
  const col = color ?? new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!src.getAttribute('normal')) out.computeVertexNormals();
  return out;
}

/** One geometry for a whole model (all its meshes, node transforms baked in). Cached. */
export function kitGeo(key: string, skip: string[] = []): THREE.BufferGeometry {
  const ck = key + (skip.length ? '|' + skip.join(',') : '');
  let g = geoCache.get(ck);
  if (g) return g;
  const o = model(key, { shadows: false });
  o.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || skip.includes(m.name)) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const p = plain(m.geometry, mat.map ? undefined : mat.color);
    p.applyMatrix4(m.matrixWorld);
    parts.push(p);
  });
  g = merge(parts);
  for (const p of parts) p.dispose();
  geoCache.set(ck, g);
  return g;
}

/** A cached copy of a geometry moved so its box is centred on the origin (Platformer Kit pivots sit in a corner). */
export function centered(key: string): THREE.BufferGeometry {
  const ck = key + '@c';
  let g = geoCache.get(ck);
  if (g) return g;
  g = kitGeo(key).clone();
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  geoCache.set(ck, g);
  return g;
}

/** The geometry of one named node of a model, in that node's own space. */
export function nodeGeo(key: string, node: string): THREE.BufferGeometry {
  const ck = key + '#' + node;
  let g = geoCache.get(ck);
  if (g) return g;
  const o = model(key, { shadows: false });
  let found: THREE.Mesh | null = null;
  o.traverse((c) => { if (c.name === node && (c as THREE.Mesh).isMesh) found = c as THREE.Mesh; });
  const m = found as unknown as THREE.Mesh;
  g = plain(m.geometry);
  geoCache.set(ck, g);
  return g;
}

/** Concatenates position/normal/uv/colour geometries. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set((p.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, o * 3);
    nor.set((p.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array, o * 3);
    uv.set((p.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array, o * 2);
    const cc = p.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (cc) col.set(cc.array as Float32Array, o * 3); else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Collects model geometry at transforms into one merged mesh. */
export class Batch {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();

  add(geo: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, sx = 1, sy = sx, sz = sx): void {
    this.m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, rotY), _s.set(sx, sy, sz));
    this.parts.push(geo.clone().applyMatrix4(this.m));
  }

  addMatrix(geo: THREE.BufferGeometry, m: THREE.Matrix4): void {
    this.parts.push(geo.clone().applyMatrix4(m));
  }

  get empty(): boolean { return this.parts.length === 0; }

  build(mat: THREE.Material, shadows = true): THREE.Mesh {
    const mesh = new THREE.Mesh(merge(this.parts), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = shadows;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return mesh;
  }
}

// ------------------------------------------------------------------ instancing

const _c = new THREE.Color();

/** A pool of one geometry drawn as one InstancedMesh: begin(), put() each frame, end(). */
export class Instances {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, readonly max: number, opts: { shadows?: boolean; colors?: boolean; order?: number } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // every pool has instance colours: one shader variant fewer per material (faster first frame)
    {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.castShadow = opts.shadows ?? false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    if (opts.order !== undefined) this.mesh.renderOrder = opts.order;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }
  begin(): void { this.n = 0; }
  put(m: THREE.Matrix4, color?: THREE.Color | number): boolean {
    if (this.n >= this.max) return false;
    this.mesh.setMatrixAt(this.n, m);
    if (this.mesh.instanceColor) this.mesh.setColorAt(this.n, color === undefined ? _c.setRGB(1, 1, 1) : typeof color === 'number' ? _c.setHex(color) : color);
    this.n++;
    return true;
  }
  /** Shortcut: position, yaw and uniform (or per-axis) scale. */
  at(x: number, y: number, z: number, yaw = 0, s = 1, color?: THREE.Color | number, sy = s, sz = s): boolean {
    _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(UP, yaw), _s.set(s, sy, sz));
    return this.put(_m, color);
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get count(): number { return this.n; }
}
const _m = new THREE.Matrix4();

interface ClipPoses { dur: number; frames: THREE.Matrix4[][] }

/**
 * Many copies of a rigged figure drawn with one InstancedMesh per body part. Works for the
 * skinned Mini Characters (parts = triangles bound to one bone) and for the Graveyard Kit's
 * node rigs (parts = the meshes of each limb node). Every part's geometry sits in the model's
 * rest space; a pose is a matrix per part (rest → posed), sampled once per clip.
 * `sockets` give the posed matrix of a part (weapons held in a hand).
 */
export class FigureRig {
  private parts: { name: string; inst: Instances }[] = [];
  private clips = new Map<string, ClipPoses>();
  private tmp = new THREE.Matrix4();
  /** Rest-space box of every part (for finding the fist). */
  readonly boxes = new Map<string, THREE.Box3>();
  static FRAMES = 24;

  constructor(parent: THREE.Object3D, key: string, clipNames: string[], max: number, mat: THREE.Material) {
    const root = model(key, { shadows: false });
    root.updateMatrixWorld(true);
    const skinned: THREE.SkinnedMesh[] = [];
    const nodes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
      else if ((o as THREE.Mesh).isMesh) nodes.push(o as THREE.Mesh);
    });
    // per part: the pose source (bone or node) and the rest geometry
    const sources: { name: string; obj: THREE.Object3D; restInv: THREE.Matrix4 }[] = [];
    const geos = new Map<string, THREE.BufferGeometry[]>();
    const addPart = (name: string, obj: THREE.Object3D, restInv: THREE.Matrix4, g: THREE.BufferGeometry) => {
      if (!geos.has(name)) { geos.set(name, []); sources.push({ name, obj, restInv }); }
      geos.get(name)!.push(g);
    };
    if (skinned.length) {
      const bones = skinned[0].skeleton.bones;
      for (const sm of skinned) {
        const g = sm.geometry.index ? sm.geometry.toNonIndexed() : sm.geometry;
        const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
        const tris = new Map<number, number[]>();
        for (let t = 0; t < si.count; t += 3) {
          let j = si.getX(t), w = sw.getX(t);
          for (const [jj, ww] of [[si.getY(t), sw.getY(t)], [si.getZ(t), sw.getZ(t)], [si.getW(t), sw.getW(t)]]) if (ww > w) { w = ww; j = jj; }
          const bi = bones.indexOf(sm.skeleton.bones[j]);
          if (!tris.has(bi)) tris.set(bi, []);
          tris.get(bi)!.push(t);
        }
        const p = plain(g);
        for (const [bi, list] of tris) {
          const part = pick(p, list);
          part.applyMatrix4(sm.bindMatrix);
          addPart(bones[bi].name, bones[bi], skinned[0].skeleton.boneInverses[bi], part);
        }
        p.dispose();
      }
    } else {
      for (const m of nodes) {
        const g = plain(m.geometry);
        g.applyMatrix4(m.matrixWorld);
        addPart(m.name, m, m.matrixWorld.clone().invert(), g);
      }
    }
    for (const s of sources) {
      const g = merge(geos.get(s.name)!);
      for (const x of geos.get(s.name)!) x.dispose();
      this.boxes.set(s.name, g.boundingBox!.clone());
      this.parts.push({ name: s.name, inst: new Instances(parent, g, mat, max, { shadows: true, colors: true }) });
    }
    const mixer = new THREE.AnimationMixer(root);
    const all = modelClips(key);
    for (const cn of clipNames) {
      const clip = all.find((c) => c.name === cn);
      if (!clip) continue;
      mixer.stopAllAction();
      const act = mixer.clipAction(clip);
      act.play();
      const frames: THREE.Matrix4[][] = [];
      for (let f = 0; f < FigureRig.FRAMES; f++) {
        mixer.setTime((f / FigureRig.FRAMES) * clip.duration);
        root.updateMatrixWorld(true);
        frames.push(sources.map((s) => new THREE.Matrix4().multiplyMatrices(s.obj.matrixWorld, s.restInv)));
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

  /** One figure: world matrix, clip and time in it (looped unless `hold`). Returns the frame. */
  put(world: THREE.Matrix4, clip: string, t: number, color: THREE.Color, hold = false): THREE.Matrix4[] | null {
    const c = this.clips.get(clip) ?? this.clips.values().next().value;
    if (!c) return null;
    const u = hold ? Math.min(0.999, Math.max(0, t / c.dur)) : ((t / c.dur) % 1 + 1) % 1;
    const f = c.frames[Math.floor(u * FigureRig.FRAMES)];
    this.parts.forEach((p, i) => p.inst.put(this.tmp.multiplyMatrices(world, f[i]), color));
    return f;
  }

  /** Index of a part by name (sockets). */
  partIndex(name: string): number {
    return this.parts.findIndex((p) => p.name === name);
  }

  end(): void { for (const p of this.parts) p.inst.end(); }

  get drawCalls(): number { return this.parts.length; }
}

/** A geometry made of some triangles (vertex index list of first corners) of a plain geometry. */
function pick(g: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]] as const) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(tris.length * 3 * size);
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) for (let s = 0; s < size; s++) arr[(i * 3 + k) * size + s] = (a.array as Float32Array)[(t + k) * size + s];
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/**
 * The fist of a figure's right arm in rest space: the arm part's far end (the arms stand out
 * sideways in the rest pose; the right arm reaches to -x).
 */
export function fistOf(box: THREE.Box3 | undefined, side: 'right' | 'left' = 'right'): THREE.Vector3 {
  if (!box) return new THREE.Vector3(side === 'right' ? -0.3 : 0.3, 0.4, 0);
  const c = box.getCenter(new THREE.Vector3());
  return new THREE.Vector3(side === 'right' ? box.min.x + 0.045 : box.max.x - 0.045, c.y, c.z);
}

// ------------------------------------------------------------------ procedural geometry

/** A unit disc on the floor (y = 0), radius 1. */
export function discGeo(segments = 40): THREE.BufferGeometry {
  return plain(new THREE.CircleGeometry(1, segments).rotateX(-Math.PI / 2));
}
/** A ring on the floor, inner radius `inner` of 1. */
export function ringGeo(inner: number, segments = 48): THREE.BufferGeometry {
  return plain(new THREE.RingGeometry(inner, 1, segments).rotateX(-Math.PI / 2));
}
/** A floor rectangle from z = 0 to z = 1, x −0.5..0.5. */
export function stripGeo(): THREE.BufferGeometry {
  return plain(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5));
}
/** A floor sector (cone telegraph): radius 1, ±`half` radians around +z. */
export function sectorGeo(half: number, segments = 24): THREE.BufferGeometry {
  return plain(new THREE.CircleGeometry(1, segments, Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2).scale(1, 1, -1));
}
/** An arc band (sword slash): radius 1, band from `inner`, ±`half` radians around +z. */
export function arcGeo(inner: number, half: number, segments = 24): THREE.BufferGeometry {
  return plain(new THREE.RingGeometry(inner, 1, segments, 1, Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2).scale(1, 1, -1));
}

/** A small vertex-coloured bone (boss projectile): a shaft with knobs at both ends. */
export function boneGeo(): THREE.BufferGeometry {
  const col = new THREE.Color(0xf2ead8);
  const parts = [
    plain(new THREE.CylinderGeometry(0.045, 0.045, 0.36, 6).rotateX(Math.PI / 2), col),
    plain(new THREE.SphereGeometry(0.07, 6, 4).translate(0.04, 0, 0.18), col),
    plain(new THREE.SphereGeometry(0.07, 6, 4).translate(-0.04, 0, 0.18), col),
    plain(new THREE.SphereGeometry(0.07, 6, 4).translate(0.04, 0, -0.18), col),
    plain(new THREE.SphereGeometry(0.07, 6, 4).translate(-0.04, 0, -0.18), col),
  ];
  const g = merge(parts);
  for (const p of parts) p.dispose();
  return g;
}

/** A low-poly slime: a squashed green gem with two eyes. */
export function slimeGeo(): THREE.BufferGeometry {
  const body = plain(new THREE.IcosahedronGeometry(0.34, 1).scale(1, 0.72, 1).translate(0, 0.24, 0), new THREE.Color(0x5fd36a));
  body.computeVertexNormals();
  const eyeW = new THREE.Color(0xffffff), eyeB = new THREE.Color(0x1c2230);
  const parts = [
    body,
    plain(new THREE.SphereGeometry(0.075, 8, 6).translate(-0.11, 0.33, 0.25), eyeW),
    plain(new THREE.SphereGeometry(0.075, 8, 6).translate(0.11, 0.33, 0.25), eyeW),
    plain(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.11, 0.33, 0.31), eyeB),
    plain(new THREE.SphereGeometry(0.04, 6, 4).translate(0.11, 0.33, 0.31), eyeB),
  ];
  const g = merge(parts);
  for (const p of parts) p.dispose();
  return g;
}

/** A soft round glow texture for sprites. */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** An additive glow material with the soft round texture (billboard quads). */
export function softMat(): THREE.MeshBasicMaterial {
  let m = mats.get('soft') as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    mats.set('soft', m);
  }
  return m;
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when
 * its scene shuts down, which also drops their programs, so the Play scene's first frame would
 * compile them all again (seconds on a slow phone, a frozen first frame). This compiles a copy
 * of every material and object kind of the attract scene behind the menu, under the same lights
 * and fog, into a keeper scene that is never freed: the Play scene then finds its programs ready.
 */
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  const seen = new Set<string>();
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh, sk = o as THREE.SkinnedMesh;
      const kind = sk.isSkinnedMesh ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const key = kind + ':' + mat.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      let k: THREE.Mesh;
      if (kind === 'skin') { k = sk.clone(); k.material = c; }
      else if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      k.castShadow = m.castShadow;
      k.receiveShadow = m.receiveShadow;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}
