// Trap Trail: how public/assets/quaternius/ultimate-platformer-pack/*.glb were made from Quaternius's
// Ultimate Platformer Pack (CC0; the owner-shared Google Drive folders: "Level and Mechanics/glTF",
// "Powerups and Pickups/FBX", "Character/glTF", "Enemies/glTF", "Cubes/glTF", the three "Modular
// Platforms" glTF sets and "Nature/glTF"; one sub-folder per source set below <pack dir>: gltf, fbx,
// char, enemies, cubes, modsingle, mod3d, mod2d, nature). Kept as a record and for a re-import; not
// part of the build.
//
//   node games/trap-trail/import-pack.mjs <pack dir with gltf/ and fbx/>
//        <node_modules with @gltf-transform/core + /extensions + /functions and meshoptimizer>
//
// What it does:
//   - every model becomes one root node of a single GLB (`saw`, `cannon`, `coin` …), with a child
//     node per moving part (`chest`: `base` + `lid` on its hinge; `bouncer`: `base`, `spring`, `top`;
//     `spike-trap`: `base` + `spikes`; `lever`: `base` + `handle`; `door`: `frame` + `door`;
//     `cannon`: `body` + `wheels`; `tower`: `body` + `door`) and `body` for the rest;
//   - the kit's flat material colours are baked into vertex colours, so the whole pack draws with
//     one vertex-coloured material; the rigged pieces (bouncer, chest, spike trap, lever) are cut
//     into rigid parts by their bones (each part's vertices in its bone's space, the part node at the
//     bone's pose: the chest closed, the lever off, the spikes down), and the game moves the parts;
//   - the pickups are read from FBX with three.js's FBXLoader (Node, no network), turned upright,
//     centred and scaled to a 1-unit box;
//   - the modular platform pieces, the cubes and the nature models go in the same file (the grass of
//     a piece is a part of its own, `top`, so each world can recolour it);
//   - the hero and the four enemies are rigged: each becomes its own GLB with its material colours
//     baked into the vertices, only the clips the game plays, the still bone channels dropped;
//   - simplifies the heavy models (the chest from ~7,900 triangles), welds, prunes and quantizes
//     (KHR_mesh_quantization); the output is deterministic;
//   - writes docs/assets/quaternius-ultimate-platformer-pack.txt (every model with its size, box,
//     triangles and parts) and copies the pack's License.txt.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync, readdirSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-pack.mjs <pack dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO, Document } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, weld, quantize, resample } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/assets/quaternius/ultimate-platformer-pack');
mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready;

// ------------------------------------------------------------------ the models and their parts

/**
 * id → [file, simplify ratio (1 = keep), parts]. Parts: `nodes` maps a node name to its own part
 * (kept at the node's pose, the pivot for the game), `joints` maps a bone to a part (rigged models),
 * `mats` sends a material to a part of its own regardless of bones (the bouncer's coil), `pose`
 * overrides a node's rest rotation/translation before the cut.
 */
const MODELS = {
  arrow: ['Arrow', 1], 'arrow-side': ['Arrow_Side', 1], 'arrow-up': ['Arrow_Up', 1],
  bomb: ['Bomb', 0.45],
  bouncer: ['Bouncer', 1, { joints: { Root: 'base', Top: 'top' }, mats: { Metal: 'spring' } }],
  'bridge-small': ['Bridge_Small', 0.3], 'bridge-center': ['Bridge_Modular_Center', 0.55],
  cannon: ['Cannon', 0.4, { nodes: { Cannon: 'body', Cannon_Wheels: 'wheels' } }],
  cannonball: ['Cannonball', 0.5],
  // the rest pose is open: the cut is made closed (Chest_Close's last key), the lid opens about x
  chest: ['Chest', 0.1, { joints: { Root: 'base', Chest_Bottom: 'base', Chest_Top: 'lid' }, pose: { Chest_Top: { r: [0.703, 0, 0, 0.712] } } }],
  door: ['Door', 1, { nodes: { Door: 'door', Door_Frame: 'frame' } }],
  'fence-1': ['Fence_1', 1], 'fence-corner': ['Fence_Corner', 1], 'fence-middle': ['Fence_Middle', 1],
  flag: ['Goal_Flag', 1],
  cylinder: ['Hazard_Cylinder', 0.5],
  saw: ['Hazard_Saw', 0.5],
  'spike-trap': ['Hazard_SpikeTrap', 1, { joints: { Root: 'base', Spikes: 'spikes' } }],
  lever: ['Lever', 1, { joints: { Root: 'base', Lever: 'handle' } }],
  // stage and checkpoint numbers: the game counts to five
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`n${n}`, [`Numbers_${n}`, 0.6]])),
  'pipe-90': ['Pipe_90', 1], 'pipe-end': ['Pipe_End', 0.35], 'pipe-straight': ['Pipe_Straight', 0.5],
  'plant-small': ['Plant_Small', 0.6],
  spikes: ['Spikes', 0.35],
  'spiky-ball': ['SpikyBall', 0.45],
  'stairs-small': ['Stairs_Small', 0.4],
  tower: ['Tower', 0.45, { nodes: { Tower: 'body', Tower_Door: 'door' } }],
};
/** The modular platform pieces (2 × 2 × 2 cells, the top at y = 1): the grass is a part of its own ('top') so each world can recolour it. */
const TOP = { mats: { Green_Light: 'top' } };
const TILES = {
  't-g-corner': ['modsingle/Cube_Grass_Corner', TOP], 't-g-side': ['modsingle/Cube_Grass_Side', TOP], 't-g-center': ['modsingle/Cube_Grass_Center', TOP],
  't-d-corner': ['modsingle/Cube_Dirt_Corner'], 't-d-side': ['modsingle/Cube_Dirt_Side'], 't-d-center': ['modsingle/Cube_Dirt_Center'],
  'tt-g-corner': ['mod3d/Cube_Grass_Corner_Tall', TOP], 'tt-g-side': ['mod3d/Cube_Grass_Side_Tall', TOP], 'tt-g-center': ['mod3d/Cube_Grass_Center_Tall', TOP],
  'tt-d-corner': ['mod3d/Cube_Dirt_Corner_Tall'], 'tt-d-side': ['mod3d/Cube_Dirt_Side_Tall'], 'tt-d-center': ['mod3d/Cube_Dirt_Center_Tall'],
  'tm-corner': ['mod3d/Cube_Grass_CornerCenter_Tall'], 'tm-side': ['mod3d/Cube_Grass_SideCenter_Tall'],
  'tb-corner': ['mod3d/Cube_Grass_CornerBottom_Tall'], 'tb-side': ['mod3d/Cube_Grass_SideBottom_Tall'], 'tb-center': ['mod3d/Cube_Grass_Bottom_Tall'],
  'c-grass': ['cubes/Cube_Grass_Single', TOP], 'c-dirt': ['cubes/Cube_Dirt_Single'],
};
const CUBES = { 'c-question': ['cubes/Cube_Question', 0.45], 'c-default': ['cubes/Cube_Default', 1], 'c-crate': ['cubes/Cube_Crate', 1], 'c-spikes': ['cubes/Cube_Spikes', 1] };
const NATURE = {
  tree: ['Tree', 0.25], bush: ['Bush', 0.3],
  'grass-1': ['Grass_1', 1], 'grass-2': ['Grass_2', 1], 'grass-3': ['Grass_3', 1], 'rock-1': ['Rock_1', 1], 'rock-2': ['Rock_2', 1],
  'cloud-1': ['Cloud_1', 0.6], 'cloud-2': ['Cloud_2', 0.6], 'cloud-3': ['Cloud_3', 0.6],
  'rock-tall': ['RockPlatform_Tall', 1], 'rock-medium': ['RockPlatforms_Medium', 1],
};

const PICKUPS = {
  coin: 'Coin', 'gem-blue': 'Gem_Blue', 'gem-green': 'Gem_Green', 'gem-pink': 'Gem_Pink', heart: 'Heart', 'heart-half': 'Heart_Half',
  'heart-outline': 'Heart_Outline', key: 'Key', star: 'Star', 'star-outline': 'Star_Outline', thunder: 'Thunder',
};

// ------------------------------------------------------------------ small matrix helpers (column-major)

const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}
const point = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
function dir(m, x, y, z) {
  // normals: inverse transpose of the 3x3 (the kit has no shear; a uniform-ish scale is renormalised)
  const n = invert(m);
  const v = [n[0] * x + n[1] * y + n[2] * z, n[4] * x + n[5] * y + n[6] * z, n[8] * x + n[9] * y + n[10] * z];
  const l = Math.hypot(...v) || 1;
  return v.map((c) => c / l);
}
const addScaled = (acc, m, w) => { for (let i = 0; i < 16; i++) acc[i] += m[i] * w; };

// ------------------------------------------------------------------ reading a glTF (embedded buffers)

const COMP = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGltf(file) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const bufs = json.buffers.map((b) => (b.uri.startsWith('data:') ? Buffer.from(b.uri.split(',')[1], 'base64') : readFileSync(join(file, '..', b.uri))));
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const T = COMP[a.componentType], n = NCOMP[a.type], size = T.BYTES_PER_ELEMENT;
    const stride = bv.byteStride ?? size * n, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const buf = bufs[bv.buffer], out = [];
    for (let k = 0; k < a.count; k++) {
      const e = [];
      for (let c = 0; c < n; c++) {
        const off = base + k * stride + c * size;
        e.push(T === Float32Array ? buf.readFloatLE(off) : T === Uint32Array ? buf.readUInt32LE(off) : T === Uint16Array ? buf.readUInt16LE(off) : T === Uint8Array ? buf.readUInt8(off) : T === Int16Array ? buf.readInt16LE(off) : buf.readInt8(off));
      }
      if (a.normalized && T !== Float32Array) for (let c = 0; c < n; c++) e[c] /= T === Uint8Array ? 255 : T === Uint16Array ? 65535 : 1;
      out.push(e);
    }
    return out;
  };
  return { json, acc };
}

/** World matrices of every node (rest pose, with optional overrides by node name). */
function worldMatrices(json, pose = {}) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const local = json.nodes.map((n) => {
    if (n.matrix) return n.matrix.slice();
    const o = pose[n.name] && n.skin === undefined && n.mesh === undefined ? pose[n.name] : {};
    return trs(o.t ?? n.translation, o.r ?? n.rotation, n.scale);
  });
  const world = new Array(json.nodes.length);
  const get = (i) => world[i] ?? (world[i] = parent.has(i) ? mul(get(parent.get(i)), local[i]) : local[i]);
  json.nodes.forEach((_, i) => get(i));
  return world;
}

// ------------------------------------------------------------------ geometry gathering

/** A growing part: per material, flat arrays of positions, normals, colours and indices. */
class Part {
  constructor(matrix) { this.matrix = matrix; this.mats = new Map(); }
  sink(mat) {
    let s = this.mats.get(mat);
    if (!s) { s = { pos: [], nor: [], col: [], idx: [] }; this.mats.set(mat, s); }
    return s;
  }
}

function gatherGltf(id, file, cfg = {}) {
  const { json, acc } = readGltf(file);
  const world = worldMatrices(json, cfg.pose ?? {});
  const byName = new Map(json.nodes.map((n, i) => [n.name, i]));
  const parts = new Map();
  const part = (name, matrix) => { let p = parts.get(name); if (!p) { p = new Part(matrix); parts.set(name, p); } return p; };
  json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined) return;
    const mesh = json.meshes[node.mesh];
    const skin = node.skin !== undefined ? json.skins[node.skin] : null;
    const jointMats = skin ? (() => { const ibm = acc(skin.inverseBindMatrices); return skin.joints.map((j, k) => mul(world[j], ibm[k])); })() : null;
    const ownPart = cfg.nodes?.[node.name];
    for (const prim of mesh.primitives) {
      const mat = json.materials[prim.material];
      const color = (mat.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3);
      const P = acc(prim.attributes.POSITION), N = acc(prim.attributes.NORMAL);
      const J = skin ? acc(prim.attributes.JOINTS_0) : null, W = skin ? acc(prim.attributes.WEIGHTS_0) : null;
      const ix = prim.indices !== undefined ? acc(prim.indices).map((e) => e[0]) : P.map((_, i) => i);
      // each vertex: its part and its position/normal in that part's space
      const vPart = [], vPos = [], vNor = [];
      for (let v = 0; v < P.length; v++) {
        let m, pname, pmat;
        if (skin) {
          m = new Array(16).fill(0);
          let best = 0, bw = -1;
          for (let k = 0; k < 4; k++) { if (W[v][k] > 0) addScaled(m, jointMats[J[v][k]], W[v][k]); if (W[v][k] > bw) { bw = W[v][k]; best = J[v][k]; } }
          const jn = json.nodes[skin.joints[best]].name;
          if (cfg.mats?.[mat.name]) { pname = cfg.mats[mat.name]; pmat = I4(); }
          else { pname = cfg.joints?.[jn] ?? 'body'; pmat = world[skin.joints[best]]; }
        } else if (cfg.mats?.[mat.name]) { m = world[ni]; pname = cfg.mats[mat.name]; pmat = I4(); }
        else if (ownPart) { m = I4(); pname = ownPart; pmat = world[ni]; }
        else { m = world[ni]; pname = cfg.rest ?? 'body'; pmat = I4(); }
        const p = part(pname, parts.get(pname)?.matrix ?? pmat);
        const back = invert(p.matrix);
        const wp = point(m, ...P[v]), wn = dir(m, ...N[v]);
        vPart.push(p); vPos.push(point(back, ...wp)); vNor.push(dir(back, ...wn));
      }
      // triangles go to the part of their first vertex (the kit's rigs bind whole pieces rigidly)
      const remap = new Map();
      for (let t = 0; t < ix.length; t += 3) {
        const p = vPart[ix[t]];
        const s = p.sink(mat.name);
        let seen = remap.get(p);
        if (!seen) { seen = new Map(); remap.set(p, seen); }
        for (let k = 0; k < 3; k++) {
          const v = ix[t + k];
          let o = seen.get(v);
          if (o === undefined) {
            o = s.pos.length / 3;
            s.pos.push(...vPos[v]); s.nor.push(...vNor[v]); s.col.push(...color);
            seen.set(v, o);
          }
          s.idx.push(o);
        }
      }
    }
  });
  return parts;
}

// ------------------------------------------------------------------ the pickups (FBX through three.js)

globalThis.self ??= globalThis;
globalThis.window ??= globalThis;
const THREE = await import(join(ROOT, 'node_modules/three/build/three.module.js'));
const { FBXLoader } = await import(join(ROOT, 'node_modules/three/examples/jsm/loaders/FBXLoader.js'));

function gatherFbx(file) {
  const buf = readFileSync(file);
  const group = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  group.updateMatrixWorld(true);
  const tris = [];
  const pos = new THREE.Vector3(), nor = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.matrixWorld.decompose(t, q, s);
    const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const g = o.geometry;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    const P = g.attributes.position, N = g.attributes.normal;
    for (const gr of groups) {
      // the pack's FBX colours are linear already (they match the glTF materials, e.g. Gold
      // 0.787/0.46/0.108); FBXLoader takes them as sRGB, so its conversion is undone here
      const c = mats[gr.materialIndex ?? 0].color.clone().convertLinearToSRGB();
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const v = g.index ? g.index.getX(i) : i;
        pos.fromBufferAttribute(P, v).multiply(s).applyMatrix4(rot);
        nor.fromBufferAttribute(N, v).applyMatrix4(rot).normalize();
        tris.push([pos.x, pos.y, pos.z, nor.x, nor.y, nor.z, c.r, c.g, c.b]);
      }
    }
  });
  // centred, scaled into a 1-unit box (the game sizes each pickup itself)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of tris) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  const c = min.map((m, k) => (m + max[k]) / 2), size = Math.max(...max.map((m, k) => m - min[k]));
  const p = new Part(I4());
  const sinks = new Map();
  for (const v of tris) {
    const key = v.slice(6).map((x) => x.toFixed(4)).join();
    let sk = sinks.get(key);
    if (!sk) { sk = p.sink('c' + sinks.size); sinks.set(key, sk); }
    sk.idx.push(sk.pos.length / 3);
    sk.pos.push((v[0] - c[0]) / size, (v[1] - c[1]) / size, (v[2] - c[2]) / size);
    sk.nor.push(v[3], v[4], v[5]);
    sk.col.push(v[6], v[7], v[8]);
  }
  return new Map([['body', p]]);
}

// ------------------------------------------------------------------ welding, simplifying, writing

/** Welds identical vertices of one sink (position + normal + colour). */
function weldSink(s) {
  const map = new Map(), pos = [], nor = [], col = [], idx = [];
  for (const i of s.idx) {
    const key = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2], s.nor[i * 3], s.nor[i * 3 + 1], s.nor[i * 3 + 2], s.col[i * 3], s.col[i * 3 + 1], s.col[i * 3 + 2]].map((x) => x.toFixed(5)).join();
    let o = map.get(key);
    if (o === undefined) { o = pos.length / 3; map.set(key, o); pos.push(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]); nor.push(s.nor[i * 3], s.nor[i * 3 + 1], s.nor[i * 3 + 2]); col.push(s.col[i * 3], s.col[i * 3 + 1], s.col[i * 3 + 2]); }
    idx.push(o);
  }
  return { pos, nor, col, idx };
}

/**
 * Simplifies one part (all its colours at once): the colours and normals are attributes, so the
 * simplifier keeps the seams between the kit's colour patches and the flat faces' edges.
 */
function simplifyPart(P, N, C, X, ratio, error = 0.02) {
  if (ratio >= 1 || X.length < 300) return X;
  const target = Math.max(36, Math.floor((X.length * ratio) / 3) * 3);
  const attrs = new Float32Array((P.length / 3) * 6);
  for (let i = 0; i < P.length / 3; i++) attrs.set([C[i * 3], C[i * 3 + 1], C[i * 3 + 2], N[i * 3] * 0.5, N[i * 3 + 1] * 0.5, N[i * 3 + 2] * 0.5], i * 6);
  const [out] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(X), new Float32Array(P), 3, attrs, 6, [1, 1, 1, 1, 1, 1], null, target, error, ['Permissive']);
  return Array.from(out);
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('scene');
doc.getRoot().setDefaultScene(scene);
const lit = doc.createMaterial('lit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
const lines = [];

function emit(id, parts, ratio, note, error) {
  const root = doc.createNode(id);
  scene.addChild(root);
  let tris = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const partLines = [];
  for (const [name, p] of [...parts].sort((a, b) => a[0].localeCompare(b[0]))) {
    const P = [], N = [], C = [];
    let X = [];
    for (const [, sink] of [...p.mats].sort((a, b) => a[0].localeCompare(b[0]))) {
      const s = weldSink(sink);
      const base = P.length / 3;
      P.push(...s.pos); N.push(...s.nor); C.push(...s.col);
      for (const i of s.idx) X.push(base + i);
    }
    X = simplifyPart(P, N, C, X, ratio, error);
    tris += X.length / 3;
    for (let i = 0; i < P.length; i += 3) {
      const w = point(p.matrix, P[i], P[i + 1], P[i + 2]);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
    }
    const prim = doc.createPrimitive().setMaterial(lit)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(X)).setBuffer(buffer));
    const child = doc.createNode(name).setMesh(doc.createMesh(`${id}-${name}`).addPrimitive(prim)).setMatrix(p.matrix);
    root.addChild(child);
    const t = p.matrix.slice(12, 15).map((v) => v.toFixed(2)).join(',');
    if (parts.size > 1) partLines.push(`  ${name} at (${t}) ${X.length / 3} tris`);
  }
  const box = [0, 1, 2].map((k) => (max[k] - min[k]).toFixed(2)).join('x');
  lines.push([`${id} ${box} min(${min.map((v) => v.toFixed(2)).join(',')}) ${tris} tris${note ? ' ' + note : ''}`, ...partLines].join('\n'));
  console.log(`${id.padEnd(15)} ${box.padEnd(16)} ${String(tris).padStart(5)} tris`);
}

for (const [id, [file, ratio, cfg]] of Object.entries(MODELS)) emit(id, gatherGltf(id, join(src, 'gltf', file + '.gltf'), cfg), ratio, `(${file}.gltf)`);
for (const [id, [file, cfg]] of Object.entries(TILES)) emit(id, gatherGltf(id, join(src, file + '.gltf'), { rest: 'body', ...cfg }), 1, `(${file.split('/')[1]}.gltf)`);
for (const [id, [file, ratio]] of Object.entries(CUBES)) emit(id, gatherGltf(id, join(src, file + '.gltf')), ratio, `(${file.split('/')[1]}.gltf)`);
for (const [id, [file, ratio]] of Object.entries(NATURE)) emit(id, gatherGltf(id, join(src, 'nature', file + '.gltf')), ratio, `(Nature/${file}.gltf)`, 0.05);
for (const [id, file] of Object.entries(PICKUPS)) emit(id, gatherFbx(join(src, 'fbx', file + '.fbx')), id.startsWith('heart') || id.startsWith('star') || id === 'coin' || id === 'key' ? 0.55 : 1, `(${file}.fbx, centred, 1-unit box)`);

doc.createExtension(KHRMeshQuantization).setRequired(true);
await doc.transform(weld(), dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }));
const out = join(OUT, 'platformer.glb');
await new NodeIO().registerExtensions([KHRMeshQuantization]).write(out, doc);
const kb = Math.round(statSync(out).size / 1024);
console.log(`platformer.glb ${kb} KB`);
copyFileSync(join(src, 'License.txt'), join(OUT, 'license.txt'));

// ------------------------------------------------------------------ the hero and the enemies: rigged, a file each

/** id → [file, the clips the game plays]. */
const RIGGED = {
  hero: ['char/Character', ['Idle', 'Walk', 'Run', 'Jump', 'Jump_Idle', 'Jump_Land', 'HitReact', 'Death', 'Yes', 'Wave', 'Duck']],
  crab: ['enemies/Crab', ['Idle', 'Walk', 'Jump', 'Bite_Front', 'HitRecieve', 'Death', 'No']],
  skull: ['enemies/Skull', ['Idle', 'Walk', 'Jump', 'Bite_Front', 'HitRecieve', 'Death', 'No']],
  gob: ['enemies/Enemy', ['Idle', 'Walk', 'Jump', 'Bite_Front', 'HitRecieve', 'Death', 'No']],
  bee: ['enemies/Bee', ['Flying', 'Bite_Front', 'HitRecieve', 'Death']],
};
const rio = new NodeIO().registerExtensions([KHRMeshQuantization]);

/** Drops the channels that hold a bone still all clip long (three.js blends a missing track with the rest pose). */
async function dropRestChannels(rdoc) {
  await rdoc.transform(resample({ tolerance: 1e-3 }));
  for (const a of rdoc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath();
    const rest = path === 'rotation' ? node.getRotation() : path === 'translation' ? node.getTranslation() : path === 'scale' ? node.getScale() : null;
    if (!rest) continue;
    const out = ch.getSampler().getOutput(), n = out.getCount(), v = [0, 0, 0, 0];
    let same = true;
    for (let i = 0; i < n && same; i++) {
      out.getElement(i, v);
      const sign = path === 'rotation' && v[0] * rest[0] + v[1] * rest[1] + v[2] * rest[2] + v[3] * rest[3] < 0 ? -1 : 1;
      for (let k = 0; k < rest.length; k++) if (Math.abs(v[k] * sign - rest[k]) > 2e-3) { same = false; break; }
    }
    if (same) { const smp = ch.getSampler(); ch.dispose(); if (!smp.listParents().some((q) => q !== rdoc.getRoot() && q.propertyType === 'AnimationChannel')) smp.dispose(); }
  }
}

for (const [id, [file, clips]] of Object.entries(RIGGED)) {
  const rdoc = await rio.read(join(src, file + '.gltf'));
  const root = rdoc.getRoot();
  const lit = rdoc.createMaterial('lit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    // the material colour into the vertices (one material for the whole figure)
    const f = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
    const pos = prim.getAttribute('POSITION'), n = pos.getCount(), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([f[0], f[1], f[2]], i * 3);
    prim.setAttribute('COLOR_0', rdoc.createAccessor().setType('VEC3').setArray(col).setBuffer(pos.getBuffer()));
    for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD_')) prim.setAttribute(sem, null);
    prim.setMaterial(lit);
    const jt = prim.getAttribute('JOINTS_0');
    if (jt && !(jt.getArray() instanceof Uint16Array)) jt.setArray(new Uint16Array(jt.getArray()));
    const wt = prim.getAttribute('WEIGHTS_0');
    if (wt && !(wt.getArray() instanceof Float32Array)) { const a = wt.getArray(), k = a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : 1; wt.setArray(Float32Array.from(a, (x) => x / k)).setNormalized(false); }
  }
  for (const m of root.listMaterials()) if (m !== lit) m.dispose();
  for (const a of root.listAnimations()) if (!clips.includes(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const sm of a.listSamplers()) sm.dispose(); a.dispose(); }
  await dropRestChannels(rdoc);
  await rdoc.transform(weld(), dedup(), prune());
  rdoc.createExtension(KHRMeshQuantization).setRequired(true);
  await rdoc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
  for (const x of root.listBuffers().slice(1)) x.dispose();
  for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
    if (ch.getTargetPath() !== 'rotation') continue;
    const out = ch.getSampler().getOutput(), fa = out.getArray();
    if (!(fa instanceof Float32Array)) continue;
    out.setArray(Int16Array.from(fa, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767))).setNormalized(true);
  }
  const outFile = join(OUT, id + '.glb');
  await rio.write(outFile, rdoc);
  const tris = root.listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((u, p) => u + p.getIndices().getCount() / 3, 0), 0);
  const clipsOut = root.listAnimations().map((a) => { let end = 0; for (const sm of a.listSamplers()) { const t = sm.getInput().getArray(); end = Math.max(end, t[t.length - 1]); } return `${a.getName()}:${end.toFixed(2)}`; });
  const kb2 = Math.round(statSync(outFile).size / 1024);
  lines.push(`${id}.glb ${kb2}KB ${tris} tris, ${root.listSkins()[0]?.listJoints().length ?? 0} bones (${file.split('/')[1]}.gltf)\n  clips: ${clipsOut.join(' ')}`);
  console.log(`${id.padEnd(15)} ${kb2} KB  ${tris} tris  ${clipsOut.length} clips`);
}

const source = [];
const FOLDERS = { gltf: 'Level and Mechanics/glTF', fbx: 'Powerups and Pickups/FBX', char: 'Character/glTF', enemies: 'Enemies/glTF', cubes: 'Cubes/glTF', modsingle: 'Modular Platforms/Single Height/glTF', mod3d: 'Modular Platforms/3D/glTF', mod2d: 'Modular Platforms/2D/glTF', nature: 'Nature/glTF' };
for (const [dir, name] of Object.entries(FOLDERS)) for (const f of readdirSync(join(src, dir)).sort()) source.push(`${name}/${f} ${statSync(join(src, dir, f)).size} bytes`);
writeFileSync(join(ROOT, 'docs/assets/quaternius-ultimate-platformer-pack.txt'), [
  '# Quaternius Ultimate Platformer Pack (CC0 1.0): what public/assets/quaternius/ultimate-platformer-pack holds',
  '# (hero.glb, crab.glb, skull.glb, gob.glb, bee.glb: the rigged hero and enemies, a file each, with the clips',
  '# the game plays; platformer.glb: everything else)',
  '# (games/trap-trail/import-pack.mjs). platformer.glb: one root node per model below, all drawn with one',
  `# vertex-coloured material 'lit' (${kb} KB). Each entry: id, bounding box in model units (x × y × z, about`,
  '# metres), its lowest corner, triangles, the source file and, for models with moving parts, each part',
  '# node with its pivot. Pickups are centred in a 1-unit box. icons.png: the HUD and screen icons, rendered',
  '# from these models (games/trap-trail/make-icons.mjs).',
  ...lines,
  '',
  '# The pack as shared by the owner (Google Drive; not in the repository):',
  ...source,
  '',
].join('\n'));
