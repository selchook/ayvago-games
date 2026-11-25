// Dungeon Rescue: how public/assets/quaternius/modular-dungeon/dungeon.glb and
// public/assets/quaternius/ultimate-animated-characters/*.glb were made from two Quaternius packs
// (CC0 1.0, the owner-shared Google Drive folders): the Updated Modular Dungeon (May 2019, its FBX
// sub-folder) and the Ultimate Animated Character Pack (November 2019, its glTF sub-folder). Kept as
// a record and for a re-import; not part of the build.
//
//   node games/dungeon-rescue/import-pack.mjs <dungeon FBX dir> <characters glTF dir>
//        <node_modules with @gltf-transform/core + /extensions + /functions and meshoptimizer>
//
// What it does:
//   - the dungeon: reads each FBX the game uses with three.js's FBXLoader (Node, no network), in
//     metres (the pack is in centimetres: a wall is 2 × 2 m, one cell of the game's grid), bakes the
//     flat material colours into vertex colours (FBXLoader takes the linear FBX colours as sRGB: its
//     conversion is undone), stands every piece on y = 0 (floors: their top at 0), simplifies the
//     heavy ones (the golden chest from 22,500 triangles, the coin pile from 3,200) and writes them as
//     the root nodes of one `dungeon.glb`, with a child node per part the game moves (the chests'
//     lids on their hinges, the flames of the torch and the campfire, the spikes of the spike trap);
//   - the characters: every figure of the pack shares one skeleton (23 bones, the same bind matrices)
//     and one set of 17 clips (identical to 2e-5), so the clips the game plays are stored once in
//     `clips.glb` (the armature and its animations, no mesh) and each figure is its own small GLB:
//     its skinned mesh and armature without animations. Each figure's material colours go into its
//     vertices (one material, flat-shaded: no normals, so the faces' corners are shared), its mesh node is renamed `Mesh` (in the pack it shares the name
//     `Body` with a bone, which would split the clips' bindings), the heavy hair is simplified to
//     about 1,900 triangles a figure, and it is quantized;
//   - skin: the pack draws every person with a near-black skin and white eye shapes. The townsfolk,
//     guards, the hero and the boss get natural skin tones instead (five, from light to deep brown,
//     spread over the cast) with dark eyes; the goblins keep their green, the cow and the pug their
//     own heads;
//   - writes docs/assets/quaternius-modular-dungeon.txt and
//     docs/assets/quaternius-ultimate-animated-characters.txt, and copies each pack's License.txt.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from 'node:fs';

const [srcD, srcC, nm] = process.argv.slice(2);
if (!srcD || !srcC || !nm) throw new Error('usage: node import-pack.mjs <dungeon FBX dir> <characters glTF dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO, Document } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, weld, quantize, resample } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');

const ROOT = join(import.meta.dirname, '../..');
const OUT_D = join(ROOT, 'public/assets/quaternius/modular-dungeon');
const OUT_C = join(ROOT, 'public/assets/quaternius/ultimate-animated-characters');
mkdirSync(OUT_D, { recursive: true });
mkdirSync(OUT_C, { recursive: true });
await MeshoptSimplifier.ready;

globalThis.self ??= globalThis;
globalThis.window ??= globalThis;
const THREE = await import(join(ROOT, 'node_modules/three/build/three.module.js'));
const { FBXLoader } = await import(join(ROOT, 'node_modules/three/examples/jsm/loaders/FBXLoader.js'));

// ================================================================== the dungeon

/**
 * id → [file, simplify ratio (1 = keep), options]. `mats` sends a material to its own part (the
 * flames), `meshes` a mesh (the chests' lids); `pivot` puts a part's node at a point of its box
 * ('hinge': the lid's back bottom edge); `stand`: 'ground' (bottom on y = 0, centred on x/z), 'top'
 * (the top face on y = 0: floors), 'keep' (the pack's origin: wall-hung pieces).
 */
const MODELS = {
  wall: ['Wall_Modular', 0.3, { stand: 'ground' }],
  'wall-deco': ['Decorative_Wall', 0.4, { stand: 'keep' }],
  floor: ['Floor_Modular', 0.25, { stand: 'top' }],
  bricks: ['Floor_BricksSeparate', 1, { stand: 'ground' }],
  door: ['Arch_Door', 0.45, { stand: 'ground' }],
  bars: ['Arch_bars', 0.35, { stand: 'ground' }],
  column: ['Column', 1, { stand: 'ground' }],
  'column-b': ['Column2', 1, { stand: 'ground' }],
  stairs: ['Stairs_Modular', 0.5, { stand: 'ground' }],
  trapdoor: ['Trapdoor', 1, { stand: 'keep' }],
  'spike-trap': ['Trap_spikes', 0.5, { stand: 'ground', mats: { DarkMetal: 'spikes' } }],
  torch: ['Torch', 1, { stand: 'keep', mats: { Fire: 'flame' } }],
  campfire: ['Woodfire', 1, { stand: 'ground', mats: { Fire: 'flame' } }],
  banner: ['Banner', 1, { stand: 'ground' }],
  'banner-wall': ['Banner_wall', 1, { stand: 'keep' }],
  horse: ['Statue_Horse', 0.45, { stand: 'ground' }],
  'table-small': ['Table_Small', 0.6, { stand: 'ground' }],
  chair: ['Chair', 0.5, { stand: 'ground' }],
  'chest-gold': ['Chest_Gold', 0.08, { stand: 'ground', meshes: { Chest_Top: 'lid', Chest_Base: 'base' }, pivot: { lid: 'hinge' } }],
  coins: ['Coin_Pile', 0.12, { stand: 'ground' }],
  'coin-bag': ['Bag_Coins', 0.4, { stand: 'ground' }],
  barrel: ['Barrel', 0.4, { stand: 'ground' }],
  'barrel-b': ['Barrel2', 0.45, { stand: 'ground' }],
  crate: ['Crate', 0.25, { stand: 'ground' }],
  bucket: ['Bucket', 0.6, { stand: 'ground' }],
  vase: ['Vase', 1, { stand: 'ground' }],
  cobweb: ['Cobweb', 0.5, { stand: 'keep' }],
  'cobweb-b': ['Cobweb2', 0.5, { stand: 'keep' }],
};

function readFbx(file) {
  const buf = readFileSync(file);
  const warn = console.warn;
  console.warn = () => {};
  const group = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  console.warn = warn;
  group.updateMatrixWorld(true);
  return group;
}

/** The colour a material draws in, as stored in COLOR_0 (linear): FBXLoader's sRGB → linear undone. */
const matColor = (mat) => mat.color.clone().convertLinearToSRGB();
const CM = 0.01;

/** Triangles of a static FBX by part: { part → [ [x,y,z, nx,ny,nz, r,g,b] × 3 … ] } in metres. */
function gather(file, cfg = {}) {
  const group = readFbx(file);
  const parts = new Map();
  const nmx = new THREE.Matrix3();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    nmx.getNormalMatrix(o.matrixWorld);
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
        n.fromBufferAttribute(N, v).applyMatrix3(nmx).normalize();
        list.push([p.x, p.y, p.z, n.x, n.y, n.z, c.r, c.g, c.b]);
      }
    }
  });
  return parts;
}

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

function simplify(P, N, C, X, ratio, error = 0.02, flat = false) {
  if (ratio >= 1 || X.length < 300) return X;
  const target = Math.max(36, Math.floor((X.length * ratio) / 3) * 3);
  const k = flat ? 3 : 6;
  const attrs = new Float32Array((P.length / 3) * k);
  for (let i = 0; i < P.length / 3; i++) attrs.set(flat ? [C[i * 3], C[i * 3 + 1], C[i * 3 + 2]] : [C[i * 3], C[i * 3 + 1], C[i * 3 + 2], N[i * 3] * 0.5, N[i * 3 + 1] * 0.5, N[i * 3 + 2] * 0.5], i * k);
  const [out] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(X), new Float32Array(P), 3, attrs, k, new Array(k).fill(1), null, target, error, ['Permissive']);
  return Array.from(out);
}

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

function boxOf(list) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of list) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  return { min, max };
}

function emit(id, file, ratio, cfg = {}) {
  const parts = gather(join(srcD, file + '.fbx'), cfg);
  // stand the whole model by its overall box
  const all = [...parts.values()].flat();
  const b = boxOf(all);
  const shift = cfg.stand === 'ground' ? [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]
    : cfg.stand === 'top' ? [-(b.min[0] + b.max[0]) / 2, -b.max[1], -(b.min[2] + b.max[2]) / 2] : [0, 0, 0];
  for (const v of all) { v[0] += shift[0]; v[1] += shift[1]; v[2] += shift[2]; }
  const root = doc.createNode(id);
  scene.addChild(root);
  let tris = 0, verts = 0;
  const partLines = [];
  for (const [name, list] of [...parts].sort((a, c) => a[0].localeCompare(c[0]))) {
    let piv = [0, 0, 0];
    if (cfg.pivot?.[name] === 'hinge') { const pb = boxOf(list); piv = [(pb.min[0] + pb.max[0]) / 2, pb.min[1], pb.min[2]]; }
    else if (parts.size > 1 && name !== 'body') { const pb = boxOf(list); piv = [(pb.min[0] + pb.max[0]) / 2, pb.min[1], (pb.min[2] + pb.max[2]) / 2]; }
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
  const nb = boxOf(all);
  const box = [0, 1, 2].map((k) => (nb.max[k] - nb.min[k]).toFixed(2)).join('x');
  lines.push([`${id} ${box} min(${nb.min.map((v) => v.toFixed(2)).join(',')}) ${tris} tris (${file}.fbx)`, ...partLines].join('\n'));
  console.log(`${id.padEnd(14)} ${box.padEnd(16)} ${String(tris).padStart(5)} tris ${String(verts).padStart(5)} verts`);
}

for (const [id, [file, ratio, cfg]] of Object.entries(MODELS)) emit(id, file, ratio, cfg);
doc.createExtension(KHRMeshQuantization).setRequired(true);
await doc.transform(weld(), dedup(), prune(), quantize({ quantizePosition: 14, quantizeColor: 8 }));
const outD = join(OUT_D, 'dungeon.glb');
await new NodeIO().registerExtensions([KHRMeshQuantization]).write(outD, doc);
const kbD = Math.round(statSync(outD).size / 1024);
console.log(`dungeon.glb ${kbD} KB`);
copyFileSync(join(srcD, 'License.txt'), join(OUT_D, 'license.txt'));

const usedD = Object.values(MODELS).map(([f]) => f + '.fbx').sort();
writeFileSync(join(ROOT, 'docs/assets/quaternius-modular-dungeon.txt'), [
  '# Quaternius Updated Modular Dungeon (May 2019, CC0 1.0): what public/assets/quaternius/modular-dungeon holds',
  '# (games/dungeon-rescue/import-pack.mjs). dungeon.glb: one root node per model below, in metres (a wall is one',
  `# 2 m cell of the game's grid), all drawn with one vertex-coloured material 'lit' (${kbD} KB). Each entry: id,`,
  '# bounding box (x × y × z), its lowest corner after standing it up, triangles after simplifying, the source file',
  '# and, for models with parts the game moves, each part node with its pivot (chest lids, flames, spikes).',
  ...lines,
  '',
  '# The FBX files the import reads (the pack as shared by the owner on Google Drive; not in the repository):',
  ...usedD.map((f) => `FBX/${f} ${statSync(join(srcD, f)).size} bytes`),
  '',
].join('\n'));

// ================================================================== the characters

/** The clips the game plays (the pack's names). */
const CLIPS = ['Idle', 'Walk', 'Run', 'PickUp', 'Punch', 'Victory', 'Defeat', 'SitDown', 'StandUp', 'RecieveHit', 'Jump', 'Shoot_OneHanded'];

/** Skin tones (sRGB) for the people; eyes dark. */
const TONES = ['#f2d0b4', '#e3b18a', '#c98f66', '#a86e48', '#7f5236'];
const EYES = '#2a1c15';

/**
 * file → [game id, skin tone index (-1: keep the pack's colours)]. The game's cast: the hero's three
 * knight looks, the guards, the Jailer Chief and the prisoners (the crew).
 */
const CHARS = {
  Knight_Male: ['knight', 1], Knight_Golden_Male: ['knight-gold', 3], Knight_Golden_Female: ['knight-gold-f', 0],
  Soldier_Male: ['soldier', 2], Soldier_Female: ['soldier-f', 0], BlueSoldier_Male: ['bluesoldier', 3], BlueSoldier_Female: ['bluesoldier-f', 1],
  Goblin_Male: ['goblin', -1], Goblin_Female: ['goblin-f', -1], Viking_Male: ['viking', 1], Viking_Female: ['viking-f', 2],
  VikingHelmet: ['chief', 2],
  Casual_Male: ['casual', 0], Casual_Female: ['casual-f', 3], Casual2_Male: ['casual2', 4], Casual2_Female: ['casual2-f', 1], Casual3_Male: ['casual3', 2], Casual3_Female: ['casual3-f', 4],
  Chef_Male: ['chef', 3], Chef_Female: ['chef-f', 0], Doctor_Male_Young: ['doctor', 4], Doctor_Female_Young: ['doctor-f', 2], Doctor_Male_Old: ['doctor-old', 0], Doctor_Female_Old: ['doctor-old-f', 3],
  Worker_Male: ['worker', 1], Worker_Female: ['worker-f', 4], OldClassy_Male: ['gent', 2], OldClassy_Female: ['lady', 0],
  Suit_Male: ['suit', 3], Suit_Female: ['suit-f', 1], Kimono_Male: ['kimono', 0], Kimono_Female: ['kimono-f', 2],
  Pirate_Male: ['pirate', 4], Pirate_Female: ['pirate-f', 1], Cowboy_Male: ['cowboy', 2], Cowboy_Female: ['cowboy-f', 3],
  Ninja_Male: ['ninja', 3], Ninja_Female: ['ninja-f', 0], Elf: ['elf', 1], Wizard: ['wizard', 0], Witch: ['witch', 4],
  Cow: ['cow', -1], Pug: ['pug', -1],
};
const TRI_TARGET = 1900;

const srgbToLinear = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const charLines = [];
let total = 0;

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

// ---- the shared clips: the Knight's armature and animations, no mesh
{
  const d = await io.read(join(srcC, 'Knight_Male.gltf'));
  const r = d.getRoot();
  for (const a of r.listAnimations()) if (!CLIPS.includes(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
  for (const node of r.listNodes()) if (node.getMesh()) { node.getMesh().dispose(); node.setMesh(null); node.setSkin(null); node.dispose(); }
  for (const s of r.listSkins()) s.dispose();
  await dropRestChannels(d);
  await d.transform(dedup(), prune({ keepLeaves: true }));
  d.createExtension(KHRMeshQuantization).setRequired(true);
  for (const a of r.listAnimations()) for (const ch of a.listChannels()) {
    if (ch.getTargetPath() !== 'rotation') continue;
    const o = ch.getSampler().getOutput(), fa = o.getArray();
    if (!(fa instanceof Float32Array)) continue;
    o.setArray(Int16Array.from(fa, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767))).setNormalized(true);
  }
  for (const x of r.listBuffers().slice(1)) x.dispose();
  const out = join(OUT_C, 'clips.glb');
  await io.write(out, d);
  const kb = Math.round(statSync(out).size / 1024);
  total += statSync(out).size;
  const clips = r.listAnimations().map((a) => { let end = 0; for (const sm of a.listSamplers()) { const t = sm.getInput().getArray(); end = Math.max(end, t[t.length - 1]); } return `${a.getName()}:${end.toFixed(2)}`; });
  charLines.push(`clips.glb ${kb}KB: the armature (23 bones) and ${clips.length} clips shared by every figure: ${clips.join(' ')}`);
  console.log(`clips.glb ${kb} KB ${clips.length} clips`);
}

// ---- one skinned mesh per figure
for (const [file, [id, tone]] of Object.entries(CHARS)) {
  const d = await io.read(join(srcC, file + '.gltf'));
  const r = d.getRoot();
  for (const a of r.listAnimations()) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
  const meshNode = r.listNodes().find((n) => n.getMesh());
  const mesh = meshNode.getMesh();
  meshNode.setName('Mesh');
  // every primitive's colour into the vertices, the primitives merged into one
  const P = [], N = [], J = [], W = [], C = [], X = [];
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(), name = mat?.getName() ?? '';
    let col = (mat?.getBaseColorFactor() ?? [1, 1, 1, 1]).slice(0, 3);
    if (tone >= 0 && name === 'Skin') col = srgbToLinear(TONES[tone]);
    if (tone >= 0 && name === 'Face') col = srgbToLinear(EYES);
    const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), jo = prim.getAttribute('JOINTS_0'), we = prim.getAttribute('WEIGHTS_0');
    const base = P.length / 3, n = pos.getCount(), v = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      P.push(...pos.getElement(i, v).slice(0, 3)); N.push(...nor.getElement(i, v).slice(0, 3));
      J.push(...jo.getElement(i, [0, 0, 0, 0])); W.push(...we.getElement(i, [0, 0, 0, 0]));
      C.push(...col);
    }
    const idx = prim.getIndices();
    for (let i = 0; i < idx.getCount(); i++) X.push(base + idx.getScalar(i));
  }
  // weld identical corners, then simplify (colours and normals keep the seams)
  const map = new Map(), P2 = [], N2 = [], J2 = [], W2 = [], C2 = [], remap = [];
  for (let i = 0; i < P.length / 3; i++) {
    // no normals in the key: the figures draw flat-shaded (normals from the faces), so a face's
    // corners are shared with its neighbours of the same colour
    const key = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], C[i * 3], C[i * 3 + 1], C[i * 3 + 2]].map((x) => x.toFixed(4)).join();
    let o = map.get(key);
    if (o === undefined) { o = P2.length / 3; map.set(key, o); P2.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); N2.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); C2.push(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]); J2.push(...J.slice(i * 4, i * 4 + 4)); W2.push(...W.slice(i * 4, i * 4 + 4)); }
    remap.push(o);
  }
  const X2 = X.map((i) => remap[i]);
  const tris0 = X2.length / 3;
  let S = X2;
  if (tris0 > TRI_TARGET) {
    const k = 3, attrs = new Float32Array((P2.length / 3) * k);
    for (let i = 0; i < P2.length / 3; i++) attrs.set([C2[i * 3], C2[i * 3 + 1], C2[i * 3 + 2]], i * k);
    [S] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(X2), new Float32Array(P2), 3, attrs, k, [1, 1, 1], null, TRI_TARGET * 3, 0.03, []);
    S = Array.from(S);
  }
  // keep only the vertices still used
  const m2 = new Map(), Pf = [], Nf = [], Jf = [], Wf = [], Cf = [], Xf = [];
  for (const i of S) {
    let o = m2.get(i);
    if (o === undefined) { o = Pf.length / 3; m2.set(i, o); Pf.push(P2[i * 3], P2[i * 3 + 1], P2[i * 3 + 2]); Nf.push(N2[i * 3], N2[i * 3 + 1], N2[i * 3 + 2]); Cf.push(C2[i * 3], C2[i * 3 + 1], C2[i * 3 + 2]); Jf.push(...J2.slice(i * 4, i * 4 + 4)); Wf.push(...W2.slice(i * 4, i * 4 + 4)); }
    Xf.push(o);
  }
  const buf = r.listBuffers()[0];
  const litC = d.createMaterial('lit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const prim = d.createPrimitive().setMaterial(litC)
    .setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(Pf)).setBuffer(buf))
    .setAttribute('COLOR_0', d.createAccessor().setType('VEC3').setArray(new Float32Array(Cf)).setBuffer(buf))
    .setAttribute('JOINTS_0', d.createAccessor().setType('VEC4').setArray(new Uint8Array(Jf)).setBuffer(buf))
    .setAttribute('WEIGHTS_0', d.createAccessor().setType('VEC4').setArray(new Float32Array(Wf)).setBuffer(buf))
    .setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint16Array(Xf)).setBuffer(buf));
  for (const p of mesh.listPrimitives()) { mesh.removePrimitive(p); p.dispose(); }
  mesh.addPrimitive(prim);
  for (const m of r.listMaterials()) if (m !== litC) m.dispose();
  await d.transform(prune({ keepLeaves: true }), dedup());
  d.createExtension(KHRMeshQuantization).setRequired(true);
  await d.transform(quantize({ quantizePosition: 14, quantizeColor: 8, quantizeWeight: 8 }));
  for (const x of r.listBuffers().slice(1)) x.dispose();
  const out = join(OUT_C, id + '.glb');
  await io.write(out, d);
  const bytes = statSync(out).size;
  total += bytes;
  charLines.push(`${id}.glb ${Math.round(bytes / 1024)}KB ${Xf.length / 3} tris (from ${tris0}), skin ${tone >= 0 ? TONES[tone] : 'the pack\'s'} (${file}.gltf)`);
  console.log(`${id.padEnd(14)} ${String(Math.round(bytes / 1024)).padStart(4)} KB ${String(Xf.length / 3).padStart(5)} tris (from ${tris0})`);
}
copyFileSync(join(srcC, 'License.txt'), join(OUT_C, 'license.txt'));
console.log(`characters total ${Math.round(total / 1024)} KB`);

writeFileSync(join(ROOT, 'docs/assets/quaternius-ultimate-animated-characters.txt'), [
  '# Quaternius Ultimate Animated Character Pack (November 2019, CC0 1.0): what',
  '# public/assets/quaternius/ultimate-animated-characters holds (games/dungeon-rescue/import-pack.mjs). Every figure',
  '# of the pack shares one 23-bone skeleton and one clip set, so the clips are stored once (clips.glb) and each',
  '# figure is its own GLB: the skinned mesh and the armature, no animations, one vertex-coloured material, about',
  '# 3.4 units tall as exported (the game scales them to about 1.5 m). The people get natural skin tones with dark',
  `# eyes (the pack's near-black skin and white eyes are replaced); goblins, the cow and the pug keep their own. Total ${Math.round(total / 1024)} KB.`,
  ...charLines,
  '',
  '# The glTF files the import reads (the pack as shared by the owner on Google Drive; not in the repository):',
  ...Object.keys(CHARS).sort().map((f) => `glTF/${f}.gltf ${statSync(join(srcC, f + '.gltf')).size} bytes`),
  '',
].join('\n'));
