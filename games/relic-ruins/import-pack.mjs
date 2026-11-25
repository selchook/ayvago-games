// Relic Ruins: how public/assets/quaternius/ultimate-modular-ruins-pack/*.glb were made from
// Quaternius's Ultimate Modular Ruins Pack (August 2021, CC0; the owner-shared Google Drive folder
// "Ultimate Modular Ruins Pack", its FBX sub-folder: the only game-ready format in it). Kept as a
// record and for a re-import; not part of the build.
//
//   node games/relic-ruins/import-pack.mjs <folder with the pack's .fbx files and License.txt>
//        <node_modules with @gltf-transform/core + /extensions + /functions and meshoptimizer>
//
// What it does:
//   - reads each FBX the game uses with three.js's FBXLoader (Node, no network), in metres (the
//     pack is in centimetres: a wall is 2 × 2 m, one cell of the pack's grid);
//   - bakes the flat material colours into vertex colours, so the whole kit draws with one
//     vertex-coloured material (the FBX colours are linear already, FBXLoader takes them as sRGB:
//     its conversion is undone, as in Trap Trail); the two textured materials (leaves and bark)
//     become flat colours;
//   - every model is one root node of `ruins.glb` with a child node per part the game moves on its
//     own: the doors' two leaves on their hinges, the chests' lids on theirs, the flames of the
//     torch and the candles (lit or not), the rest `body`;
//   - simplifies the heavy models (the golden chest from 22,500 triangles), welds, prunes and
//     quantizes (KHR_mesh_quantization); the output is deterministic;
//   - the pack's animated hero (Character_Animated.fbx) becomes `hero.glb`: three.js's
//     GLTFExporter writes the skinned figure (its hair hangs off the Head bone), then the clips the
//     game plays are kept under their plain names, colours go into the vertices, the hair is
//     simplified, the still bone channels are dropped and it is quantized;
//   - writes docs/assets/quaternius-ultimate-modular-ruins-pack.txt and copies the License.txt.
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
const OUT = join(ROOT, 'public/assets/quaternius/ultimate-modular-ruins-pack');
mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready;

globalThis.self ??= globalThis;
globalThis.window ??= globalThis;
const THREE = await import(join(ROOT, 'node_modules/three/build/three.module.js'));
const { FBXLoader } = await import(join(ROOT, 'node_modules/three/examples/jsm/loaders/FBXLoader.js'));
const { GLTFExporter } = await import(join(ROOT, 'node_modules/three/examples/jsm/exporters/GLTFExporter.js'));

// ------------------------------------------------------------------ the models and their parts

/** The textured materials as flat colours (sRGB). */
const FLAT = { Leaf_Texture: '#4f7a34', Texture_Leaves: '#4f7a34', Green: '#5a8a3a', Bark: '#5e4430' };

/**
 * id → [file, simplify ratio (1 = keep), parts]. Parts: `meshes` sends a mesh of the FBX to its own
 * part, `mats` sends a material to its own part; `pivot` puts a part's node at a point of its box
 * ('minx' / 'maxx': the hinge side at the box's back, 'base': the middle of its floor).
 */
const MODELS = {
  // walls and floors (one 2 m cell; walls stand on y = 0 with their thickness on -z)
  wall: ['Wall', 0.22],
  'wall-broken': ['Wall_Broken', 0.25],
  'wall-overgrown': ['Wall_Overgrown', 0.25],
  'wall-hole': ['Wall_Hole', 0.28],
  arch: ['Wall_ArchRound', 0.22],
  'arch-overgrown': ['Wall_ArchRound_Overgrown', 0.22],
  doors: ['Doors_RoundArch', 0.4, { meshes: { Doors_RoundArch_L: 'left', Doors_RoundArch_R: 'right' }, pivot: { left: 'minx', right: 'maxx' } }],
  sealed: ['Doors_RoundArch_Covered', 0.4],
  column: ['Column_Square', 0.18],
  'column-short': ['Column_Round_Short', 0.4],
  'floor-squares': ['Floor_Squares', 0.38],
  'floor-diamond': ['Floor_Diamond', 0.4],
  'floor-large': ['Floor_SquareLarge', 1],
  'floor-tree': ['Floor_Tree', 0.5],
  stairs: ['Stairs', 0.3],
  bridge: ['BridgeSection', 0.3],
  rail: ['Rail_Straight', 0.4],
  // traps and things to use
  trapdoor: ['Trapdoor', 0.7],
  'beartrap-open': ['BearTrap_Open', 0.5],
  'beartrap-closed': ['BearTrap_Closed', 0.5],
  relic: ['Chest_Gold', 0.1, { meshes: { Chest_Gold_Top: 'lid', Chest_Gold_Base: 'base' }, pivot: { lid: 'hinge' } }],
  crate: ['Crate', 0.5],
  barrel: ['Barrel', 0.35],
  pot: ['Pot1', 0.35],
  'pot-small': ['Pot2', 0.35],
  'pot-broken': ['Pot1_Broken', 0.5],
  bookcase: ['Bookcase_Full', 0.3],
  cart: ['Cart', 0.5],
  candles: ['Candles_1', 0.45, { mats: { Light: 'flame' } }],
  torch: ['Torch', 1, { mats: { Fire: 'flame' } }],
  banner: ['Flag_Wall', 1],
  fox: ['Statue_Fox', 0.35],
  stag: ['Statue_Stag', 0.25],
  brick: ['Brick', 1],
  bricks: ['Bricks', 0.8],
  // nature
  bush: ['Bush_Round', 1],
  grass: ['Grass', 1],
  'dead-tree': ['DeadTree_1', 1],
  tree: ['Tree_1', 0.6],
};

// ------------------------------------------------------------------ reading an FBX

function readFbx(file) {
  const buf = readFileSync(file);
  const warn = console.warn;
  console.warn = () => {};
  const group = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  console.warn = warn;
  group.updateMatrixWorld(true);
  return group;
}

/** The colour a material draws in, as stored in COLOR_0 (linear). */
function matColor(mat) {
  if (FLAT[mat.name]) return new THREE.Color(FLAT[mat.name]); // THREE.Color(string) converts sRGB → linear
  return mat.color.clone().convertLinearToSRGB(); // undo FBXLoader's sRGB → linear
}

const CM = 0.01;

/** Triangles of a static FBX by part: { part → [ [x,y,z, nx,ny,nz, r,g,b] × 3 … ] } in metres. */
function gather(file, cfg = {}) {
  const group = readFbx(file);
  const parts = new Map();
  const nm = new THREE.Matrix3();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    nm.getNormalMatrix(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    const P = g.attributes.position, N = g.attributes.normal;
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0];
      const part = cfg.mats?.[mat.name] ?? cfg.meshes?.[o.name] ?? 'body';
      const c = matColor(mat);
      let list = parts.get(part);
      if (!list) { list = []; parts.set(part, list); }
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const v = g.index ? g.index.getX(i) : i;
        p.fromBufferAttribute(P, v).applyMatrix4(o.matrixWorld).multiplyScalar(CM);
        n.fromBufferAttribute(N, v).applyMatrix3(nm).normalize();
        list.push([p.x, p.y, p.z, n.x, n.y, n.z, c.r, c.g, c.b]);
      }
    }
  });
  return parts;
}

// ------------------------------------------------------------------ welding, simplifying, writing

/**
 * Welds identical corners: positions, normals, colours and an index list. `flat`: the normals are
 * left out of the key (the kit draws flat-shaded, normals from the faces), so a face's corners are
 * shared with its neighbours of the same colour.
 */
function weldTris(tris, flat = false) {
  const map = new Map(), P = [], N = [], C = [], X = [];
  for (const v of tris) {
    const key = (flat ? [v[0], v[1], v[2], v[6], v[7], v[8]] : v).map((x) => x.toFixed(4)).join();
    let o = map.get(key);
    if (o === undefined) { o = P.length / 3; map.set(key, o); P.push(v[0], v[1], v[2]); N.push(v[3], v[4], v[5]); C.push(v[6], v[7], v[8]); }
    X.push(o);
  }
  return { P, N, C, X };
}

/** Simplifies one part (colours and normals as attributes keep the seams and the flat faces' edges). */
function simplify(P, N, C, X, ratio, error = 0.02, flat = false) {
  if (ratio >= 1 || X.length < 300) return X;
  const target = Math.max(36, Math.floor((X.length * ratio) / 3) * 3);
  const k = flat ? 3 : 6;
  const attrs = new Float32Array((P.length / 3) * k);
  for (let i = 0; i < P.length / 3; i++) attrs.set(flat ? [C[i * 3], C[i * 3 + 1], C[i * 3 + 2]] : [C[i * 3], C[i * 3 + 1], C[i * 3 + 2], N[i * 3] * 0.5, N[i * 3 + 1] * 0.5, N[i * 3 + 2] * 0.5], i * k);
  const [out] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(X), new Float32Array(P), 3, attrs, k, new Array(k).fill(1), null, target, error, ['Permissive']);
  return Array.from(out);
}

/** Keeps only the vertices the (simplified) index list still uses. */
function compact(P, N, C, X) {
  const map = new Map(), p = [], n = [], c = [], x = [];
  for (const i of X) {
    let o = map.get(i);
    if (o === undefined) { o = p.length / 3; map.set(i, o); p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); c.push(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]); }
    x.push(o);
  }
  return { P: p, N: n, C: c, X: x };
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('scene');
doc.getRoot().setDefaultScene(scene);
const lit = doc.createMaterial('lit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
const lines = [];

function pivotOf(tris, how) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of tris) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  if (how === 'minx') return [min[0], min[1], (min[2] + max[2]) / 2];
  if (how === 'maxx') return [max[0], min[1], (min[2] + max[2]) / 2];
  // a chest lid's hinge: the back edge (-z) at the lid's bottom
  if (how === 'hinge') return [(min[0] + max[0]) / 2, min[1], min[2]];
  return [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
}

function emit(id, file, ratio, cfg = {}) {
  const parts = gather(join(src, file + '.fbx'), cfg);
  const root = doc.createNode(id);
  scene.addChild(root);
  let tris = 0, verts = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const partLines = [];
  for (const [name, list] of [...parts].sort((a, b) => a[0].localeCompare(b[0]))) {
    const piv = cfg.pivot?.[name] ? pivotOf(list, cfg.pivot[name]) : [0, 0, 0];
    for (const v of list) { for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); } }
    const local = list.map((v) => [v[0] - piv[0], v[1] - piv[1], v[2] - piv[2], ...v.slice(3)]);
    const w = weldTris(local, true);
    const { P, C, X } = compact(w.P, w.N, w.C, simplify(w.P, w.N, w.C, w.X, ratio, 0.02, true));
    tris += X.length / 3;
    verts += P.length / 3;
    const prim = doc.createPrimitive().setMaterial(lit)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(X)).setBuffer(buffer));
    root.addChild(doc.createNode(name).setMesh(doc.createMesh(`${id}-${name}`).addPrimitive(prim)).setTranslation(piv));
    if (parts.size > 1) partLines.push(`  ${name} at (${piv.map((v) => v.toFixed(2)).join(',')}) ${X.length / 3} tris`);
  }
  const box = [0, 1, 2].map((k) => (max[k] - min[k]).toFixed(2)).join('x');
  lines.push([`${id} ${box} min(${min.map((v) => v.toFixed(2)).join(',')}) ${tris} tris (${file}.fbx)`, ...partLines].join('\n'));
  console.log(`${id.padEnd(16)} ${box.padEnd(16)} ${String(tris).padStart(5)} tris ${String(verts).padStart(5)} verts`);
}

for (const [id, [file, ratio, cfg]] of Object.entries(MODELS)) emit(id, file, ratio, cfg);

doc.createExtension(KHRMeshQuantization).setRequired(true);
await doc.transform(weld(), dedup(), prune(), quantize({ quantizePosition: 14, quantizeColor: 8 }));
const out = join(OUT, 'ruins.glb');
await new NodeIO().registerExtensions([KHRMeshQuantization]).write(out, doc);
const kb = Math.round(statSync(out).size / 1024);
console.log(`ruins.glb ${kb} KB`);
copyFileSync(join(src, 'License.txt'), join(OUT, 'license.txt'));

// ------------------------------------------------------------------ the hero: skinned, its own file

/** The clips the game plays (the pack names them `CharacterArmature|<name>`). */
const CLIPS = ['Idle', 'Walk', 'Run', 'Roll', 'PickUp', 'Punch', 'Dagger_Attack', 'Dagger_Attack2', 'RecieveHit', 'Death'];

// GLTFExporter reads its blobs with FileReader, which Node lacks
globalThis.FileReader ??= class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = `data:${b.type || 'application/octet-stream'};base64,` + Buffer.from(r).toString('base64'); this.onloadend?.(); this.onload?.({ target: this }); }); }
};

const fig = readFbx(join(src, 'Character_Animated.fbx'));
const clips = [];
for (const a of fig.animations) {
  const m = /^CharacterArmature\|(.+)$/.exec(a.name);
  if (m && CLIPS.includes(m[1])) { a.name = m[1]; clips.push(a); }
}
// one flat colour per vertex from its material; the textures' UVs go
fig.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : n, materialIndex: 0 }];
  for (const gr of groups) {
    const c = matColor(mats[gr.materialIndex ?? 0]);
    for (let i = gr.start; i < gr.start + gr.count; i++) { const v = g.index ? g.index.getX(i) : i; col.set([c.r, c.g, c.b], v * 3); }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.clearGroups();
  const one = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  one.name = 'lit';
  o.material = one;
});
const glb = await new Promise((res, rej) => new GLTFExporter().parse(fig, res, rej, { binary: true, animations: clips }));
const rio = new NodeIO().registerExtensions([KHRMeshQuantization]);
const rdoc = await rio.readBinary(new Uint8Array(glb));
const rroot = rdoc.getRoot();
// the hair, eyes and brows (a mesh hung off the Head bone): simplified
for (const mesh of rroot.listMeshes()) for (const prim of mesh.listPrimitives()) {
  if (prim.getAttribute('JOINTS_0')) continue;
  const P = Array.from(prim.getAttribute('POSITION').getArray()), N = Array.from(prim.getAttribute('NORMAL').getArray()), C = Array.from(prim.getAttribute('COLOR_0').getArray());
  const idx = prim.getIndices();
  const X = idx ? Array.from(idx.getArray()) : P.map((_, i) => i).filter((i) => i < P.length / 3);
  // weld first (the exporter writes each face's corners apart)
  const tris = X.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], C[i * 3], C[i * 3 + 1], C[i * 3 + 2]]);
  const w0 = weldTris(tris);
  const w = compact(w0.P, w0.N, w0.C, simplify(w0.P, w0.N, w0.C, w0.X, 0.3, 0.01));
  const S = w.X;
  prim.setAttribute('POSITION', rdoc.createAccessor().setType('VEC3').setArray(new Float32Array(w.P)).setBuffer(prim.getAttribute('POSITION').getBuffer()));
  prim.setAttribute('NORMAL', rdoc.createAccessor().setType('VEC3').setArray(new Float32Array(w.N)).setBuffer(prim.getAttribute('POSITION').getBuffer()));
  prim.setAttribute('COLOR_0', rdoc.createAccessor().setType('VEC3').setArray(new Float32Array(w.C)).setBuffer(prim.getAttribute('POSITION').getBuffer()));
  prim.setIndices(rdoc.createAccessor().setType('SCALAR').setArray(new Uint16Array(S)).setBuffer(prim.getAttribute('POSITION').getBuffer()));
}
// one plain material for the figure
const rlit = rdoc.createMaterial('lit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
for (const mesh of rroot.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setMaterial(rlit);
for (const m of rroot.listMaterials()) if (m !== rlit) m.dispose();
for (const t of rroot.listTextures()) t.dispose();

/** Drops the channels that hold a bone still all clip long (three.js blends a missing track with the rest pose). */
async function dropRestChannels(d) {
  await d.transform(resample({ tolerance: 1e-3 }));
  for (const a of d.getRoot().listAnimations()) for (const ch of a.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath();
    const rest = path === 'rotation' ? node.getRotation() : path === 'translation' ? node.getTranslation() : path === 'scale' ? node.getScale() : null;
    if (!rest) continue;
    const o = ch.getSampler().getOutput(), n = o.getCount(), v = [0, 0, 0, 0];
    let same = true;
    for (let i = 0; i < n && same; i++) {
      o.getElement(i, v);
      const sign = path === 'rotation' && v[0] * rest[0] + v[1] * rest[1] + v[2] * rest[2] + v[3] * rest[3] < 0 ? -1 : 1;
      for (let k = 0; k < rest.length; k++) if (Math.abs(v[k] * sign - rest[k]) > 2e-3) { same = false; break; }
    }
    if (same) { const smp = ch.getSampler(); ch.dispose(); if (!smp.listParents().some((q) => q !== d.getRoot() && q.propertyType === 'AnimationChannel')) smp.dispose(); }
  }
}
await dropRestChannels(rdoc);
await rdoc.transform(weld(), dedup(), prune());
rdoc.createExtension(KHRMeshQuantization).setRequired(true);
await rdoc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
for (const x of rroot.listBuffers().slice(1)) x.dispose();
for (const a of rroot.listAnimations()) for (const ch of a.listChannels()) {
  if (ch.getTargetPath() !== 'rotation') continue;
  const o = ch.getSampler().getOutput(), fa = o.getArray();
  if (!(fa instanceof Float32Array)) continue;
  o.setArray(Int16Array.from(fa, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767))).setNormalized(true);
}
const heroOut = join(OUT, 'hero.glb');
await rio.write(heroOut, rdoc);
const htris = rroot.listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((u, p) => u + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const hclips = rroot.listAnimations().map((a) => { let end = 0; for (const sm of a.listSamplers()) { const t = sm.getInput().getArray(); end = Math.max(end, t[t.length - 1]); } return `${a.getName()}:${end.toFixed(2)}`; });
const hkb = Math.round(statSync(heroOut).size / 1024);
const hbox = new THREE.Box3().setFromObject(fig);
console.log(`hero.glb ${hkb} KB ${htris} tris ${hclips.length} clips`);

const used = new Set([...Object.values(MODELS).map(([f]) => f + '.fbx'), 'Character_Animated.fbx']);
const source = readdirSync(src).filter((f) => used.has(f)).sort().map((f) => `FBX/${f} ${statSync(join(src, f)).size} bytes`);
writeFileSync(join(ROOT, 'docs/assets/quaternius-ultimate-modular-ruins-pack.txt'), [
  '# Quaternius Ultimate Modular Ruins Pack (CC0 1.0): what public/assets/quaternius/ultimate-modular-ruins-pack holds',
  '# (games/relic-ruins/import-pack.mjs). ruins.glb: one root node per model below, in metres (a wall is one',
  `# 2 m cell of the pack's grid), all drawn with one vertex-coloured material 'lit' (${kb} KB). Each entry: id,`,
  '# bounding box (x × y × z), its lowest corner, triangles after simplifying, the source file and, for models',
  '# with parts the game moves, each part node with its pivot (door leaves on their hinges, chest lids, flames).',
  ...lines,
  `hero.glb ${hkb}KB ${htris} tris, ${(hbox.max.y - hbox.min.y).toFixed(1)} units tall as exported (Character_Animated.fbx: the pack's rogue; the hair hangs off the Head bone)`,
  `  clips: ${hclips.join(' ')}`,
  '',
  '# The FBX files the import reads (the pack as shared by the owner on Google Drive; not in the repository):',
  ...source,
  '',
].join('\n'));
