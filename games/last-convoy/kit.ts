// Last Convoy: the 3D kit. What the game loads and how it is drawn with few draw calls:
//   - the Zombie Apocalypse Kit (import-kit.mjs): `heroes` (four survivors on one skeleton and the
//     ten weapons on the hand bone), the four zombies and two dogs (a rig each), `vehicles` (six
//     bodies with their wheels as parts) and `props` (the street tiles, containers, chests, barriers,
//     lamps, the water tower, the town sign ...); flat vertex colours, materials by name for the parts
//     that glow (`head`, `brake`, `lamp`);
//   - the town packs' `buildings` (quaternius/town-buildings: vertex colours, no normals, `glass`);
//   - static scenery is merged into a few plain geometries (mergeParts), the cast is rigged
//     (figure.ts), pickups and decals are small instanced or copied models.
import Phaser from 'phaser';
import { THREE, model, loadModel } from '@core/three';
import { asset } from '@core';

export const kk = (m: string): string => 'lc:' + m;
export const RIGS = ['heroes', 'zombie-basic', 'zombie-chubby', 'zombie-arm', 'zombie-ribcage', 'dog-shepherd', 'dog-pug'] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const m of [...RIGS, 'vehicles', 'props']) loadModel(load, kk(m), asset(`quaternius/zombie-kit/${m}.glb`));
  loadModel(load, kk('buildings'), asset('quaternius/town-buildings/buildings.glb'));
}

// ------------------------------------------------------------------ materials

export const litMaterial = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });

// ------------------------------------------------------------------ the parts of the packed files

export interface Part { geo: THREE.BufferGeometry; mat: THREE.Matrix4; material: string }
const parts = new Map<string, Part[]>();
const roots = new Map<string, THREE.Object3D>();

function fileRoot(file: string): THREE.Object3D {
  let r = roots.get(file);
  if (!r) { r = model(kk(file), { shadows: false }); r.updateMatrixWorld(true); roots.set(file, r); }
  return r;
}

/**
 * The meshes of one root node of a packed file (`props:barrel`, `vehicles:truck`,
 * `buildings:House1`), with their matrices relative to that node, their material's name, and
 * optionally only the children named `only` (a vehicle's `body`).
 */
export function partsOf(key: string, only?: string): Part[] {
  const ck = only ? key + '#' + only : key;
  let ps = parts.get(ck);
  if (ps) return ps;
  const [file, name] = key.split(':');
  const root = fileRoot(file);
  const node = root.getObjectByName(name);
  ps = [];
  if (node) {
    const inv = node.matrixWorld.clone().invert();
    node.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // the loader makes repeated node names unique (`body`, `body_1` …): match the stem
      const is = (n: string | undefined) => !!n && !!only && (n === only || (n.startsWith(only + '_') && /^\d+$/.test(n.slice(only.length + 1).split('_')[0])));
      if (only && !(is(m.name) || is(m.parent?.name))) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      ps!.push({ geo: m.geometry, mat: inv.clone().multiply(m.matrixWorld), material: mats[0].name });
    });
  }
  parts.set(ck, ps);
  return ps;
}

/** The box of a packed model's node (its own space). */
export function partsBox(key: string, only?: string): THREE.Box3 {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of partsOf(key, only)) {
    const pos = p.geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(p.mat));
  }
  return b;
}

// ------------------------------------------------------------------ merging

export interface MergeJob { key: string; only?: string; m: THREE.Matrix4; tint?: number; material?: string }

const tv = new THREE.Vector3();
const tn = new THREE.Vector3();
const tnm = new THREE.Matrix3();
const tc = new THREE.Color();

/**
 * Merges placed parts into plain geometries, one per material name (position, normal, colour;
 * non-indexed). Parts without normals get flat ones. `filter` keeps only some materials.
 */
export function mergeParts(jobs: MergeJob[], extra?: { pos: number[]; col: number[] }): Map<string, THREE.BufferGeometry> {
  const by = new Map<string, { geo: THREE.BufferGeometry; m: THREE.Matrix4; tint?: number }[]>();
  for (const j of jobs) {
    for (const p of partsOf(j.key, j.only)) {
      const name = j.material ?? p.material;
      let list = by.get(name);
      if (!list) { list = []; by.set(name, list); }
      list.push({ geo: p.geo, m: j.m.clone().multiply(p.mat), tint: j.tint });
    }
  }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [name, list] of by) out.set(name, build(list));
  if (extra && extra.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(extra.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(extra.col, 3));
    g.computeVertexNormals();
    const lit = out.get('lit');
    const merged = build([{ geo: g, m: new THREE.Matrix4() }, ...(lit ? [{ geo: lit, m: new THREE.Matrix4() }] : [])]);
    g.dispose();
    lit?.dispose();
    out.set('lit', merged);
  }
  return out;
}

function build(jobs: { geo: THREE.BufferGeometry; m: THREE.Matrix4; tint?: number }[]): THREE.BufferGeometry {
  let verts = 0;
  for (const j of jobs) verts += j.geo.index ? j.geo.index.count : j.geo.getAttribute('position').count;
  const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3), C = new Float32Array(verts * 3);
  let o = 0;
  for (const { geo, m, tint } of jobs) {
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), col = geo.getAttribute('color');
    tnm.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    if (tint !== undefined) tc.setHex(tint); else tc.setRGB(1, 1, 1);
    const start = o;
    for (let i = 0; i < n; i++, o++) {
      const ii = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      const v = idx ? idx.getX(ii) : ii;
      tv.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      P[o * 3] = tv.x; P[o * 3 + 1] = tv.y; P[o * 3 + 2] = tv.z;
      if (nor) { tn.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(tnm).normalize(); N[o * 3] = tn.x; N[o * 3 + 1] = tn.y; N[o * 3 + 2] = tn.z; }
      const r = col ? col.getX(v) : 1, g = col ? col.getY(v) : 1, b = col ? col.getZ(v) : 1;
      C[o * 3] = r * tc.r; C[o * 3 + 1] = g * tc.g; C[o * 3 + 2] = b * tc.b;
    }
    if (!nor) {
      // flat normals for the parts that have none (the town's buildings)
      for (let t = start; t < o; t += 3) {
        const ax = P[t * 3], ay = P[t * 3 + 1], az = P[t * 3 + 2];
        const ux = P[t * 3 + 3] - ax, uy = P[t * 3 + 4] - ay, uz = P[t * 3 + 5] - az;
        const vx = P[t * 3 + 6] - ax, vy = P[t * 3 + 7] - ay, vz = P[t * 3 + 8] - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (let k = 0; k < 3; k++) { N[(t + k) * 3] = nx; N[(t + k) * 3 + 1] = ny; N[(t + k) * 3 + 2] = nz; }
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}

/** One packed model as a single plain geometry (cached; shared by every copy), optionally centred and standing on y = 0. */
const solo = new Map<string, THREE.BufferGeometry>();
export function soloGeometry(key: string, only?: string, stand = false, scale = 1): THREE.BufferGeometry {
  const ck = key + '#' + (only ?? '') + (stand ? 's' : '') + scale;
  let g = solo.get(ck);
  if (g) return g;
  const m = new THREE.Matrix4().makeScale(scale, scale, scale);
  g = mergeParts([{ key, only, m, material: 'lit' }]).get('lit') ?? new THREE.BufferGeometry();
  if (stand) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  }
  g.computeBoundingSphere();
  solo.set(ck, g);
  return g;
}

/** Shared geometries are kept for the page's life: the world must not free them. */
export const isShared = (g: THREE.BufferGeometry): boolean => [...solo.values()].includes(g);

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive: a World3D frees its materials on
 * shutdown (and with them their programs), so this compiles a copy of every material kind under
 * the same lights and fog into a keeper scene that is never freed (the first Play frame then finds
 * its programs ready).
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
    if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.LineSegments).isLineSegments) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const sk = (o as THREE.SkinnedMesh).isSkinnedMesh, inst = (o as THREE.InstancedMesh).isInstancedMesh;
      const kind = (o as THREE.Points).isPoints ? 'pts' : (o as THREE.LineSegments).isLineSegments ? 'line' : sk ? 'skin' : inst ? 'inst' : 'mesh';
      const a = mat as THREE.MeshLambertMaterial;
      const key = kind + mat.type + [!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, a.flatShading].join() + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      let k: THREE.Object3D;
      if (kind === 'pts') k = new THREE.Points((o as THREE.Points).geometry, c);
      else if (kind === 'line') k = new THREE.LineSegments((o as THREE.LineSegments).geometry, c);
      else if (sk) { const src = o as THREE.SkinnedMesh; const ks = new THREE.SkinnedMesh(src.geometry, c); ks.bind(src.skeleton, src.bindMatrix); k = ks; }
      else if (inst) k = new THREE.InstancedMesh(m.geometry, c, 1);
      else k = new THREE.Mesh(m.geometry, c);
      k.castShadow = o.castShadow;
      k.receiveShadow = o.receiveShadow;
      k.frustumCulled = false;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}
