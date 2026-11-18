// Astro Crew: how public/assets/quaternius/space-kit/*.glb were made from Quaternius's Ultimate
// Space Kit (March 2023, CC0; the .gltf files of the owner-shared Google Drive folder, buffers
// embedded as data URIs, one flat-colour atlas per file). Kept as a record and for a re-import;
// not part of the build.
//
//   node games/astro-crew/import-kit.mjs <kit dir with characters/ vehicles/ items/ environment/>
//        <node_modules with @gltf-transform/core + /extensions + /functions, meshoptimizer and sharp>
//
// What it does (only to the models the game loads):
//   - bakes the atlas into vertex colours: every vertex takes the colour of the swatch its UV
//     points at (the kit is flat colours), so no texture is left and every model shares one
//     vertex-colour material in the game;
//   - the four astronauts (one identical skeleton and clip set) become one file, `astronauts.glb`:
//     the skeleton once, each animal's body as a skinned mesh `a-<animal>` and the `pistol` hung
//     on the right hand's bone, so four heroes cost one set of animations;
//   - the two blob aliens (Enemy_ExtraSmall and Enemy_Small, one skeleton) become `blobs.glb`
//     (`e-xs`, `e-s`); the flying alien, the large alien and the four mechs keep a file each;
//   - keeps only the clips the game plays, resamples them;
//   - simplifies the heavy models, welds, dedups, prunes and quantizes (KHR_mesh_quantization);
//   - writes docs/assets/quaternius-space-kit.txt (every file with its size, box and clips).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync, readdirSync, writeFileSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-kit.mjs <kit dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO, getBounds } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, simplify, weld, joinPrimitives, quantize } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/assets/quaternius/space-kit');
mkdirSync(OUT, { recursive: true });

/** The clips each rig keeps. */
const HERO_CLIPS = ['Idle', 'Idle_Gun', 'Run_Gun', 'Run_Gun_Shoot', 'Duck', 'Punch', 'HitReact', 'Death', 'Wave', 'Yes', 'Jump', 'No'];
const MECH_CLIPS = ['Idle', 'Run', 'Shoot_Big', 'Kick', 'HitRecieve_1', 'Death', 'Hello', 'Yes'];
const BLOB_CLIPS = ['Flying_Idle', 'Fast_Flying', 'Headbutt', 'Punch', 'HitReact', 'Death', 'Yes'];
const BRUTE_CLIPS = ['Idle', 'Walk', 'Run', 'Punch', 'Weapon', 'HitReact', 'Death', 'Jump', 'Jump_Land', 'Yes'];
const ANIMALS = { bee: 'BarbaraTheBee', flamingo: 'FernandoTheFlamingo', frog: 'FinnTheFrog', panda: 'RaeTheRedPanda' };

/** out name → source file (folder/name without .gltf) and an optional simplify ratio. */
const STATIC = {
  // vehicles (the rovers keep their wheels as nodes)
  'rover-1': ['vehicles/Rover_1', 0.35],
  'rover-2': ['vehicles/Rover_2', 0.35],
  'rover-round': ['vehicles/Rover_Round', 0.35],
  'ship-bee': ['vehicles/Spaceship_BarbaraTheBee', 0.45],
  'ship-flamingo': ['vehicles/Spaceship_FernandoTheFlamingo', 0.6],
  'ship-frog': ['vehicles/Spaceship_FinnTheFrog', 0.55],
  'ship-panda': ['vehicles/Spaceship_RaeTheRedPanda'],
  // pickups
  bullets: ['items/Pickup_Bullets', 0.6],
  crate: ['items/Pickup_Crate', 0.5],
  health: ['items/Pickup_Health', 0.6],
  jar: ['items/Pickup_Jar'],
  keycard: ['items/Pickup_KeyCard'],
  sphere: ['items/Pickup_Sphere', 0.3],
  thunder: ['items/Pickup_Thunder'],
  // the base
  'base-large': ['environment/Base_Large', 0.6],
  'building-l': ['environment/Building_L', 0.5],
  connector: ['environment/Connector', 0.6],
  dome: ['environment/GeodesicDome', 0.7],
  'house-cylinder': ['environment/House_Cylinder', 0.6],
  'house-long': ['environment/House_Long', 0.5],
  'house-single': ['environment/House_Single', 0.6],
  'house-support': ['environment/House_Single_Support', 0.6],
  'metal-support': ['environment/MetalSupport', 0.6],
  ramp: ['environment/Ramp'],
  stairs: ['environment/Stairs'],
  'roof-antenna': ['environment/Roof_Antenna', 0.6],
  'roof-radar': ['environment/Roof_Radar', 0.5],
  'roof-vent': ['environment/Roof_VentL'],
  'solar-ground': ['environment/SolarPanel_Ground', 0.6],
  'solar-structure': ['environment/SolarPanel_Structure', 0.45],
  // planets
  ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`planet-${i + 1}`, [`environment/Planet_${i + 1}`, 0.5]])),
  // nature
  'rock-1': ['environment/Rock_1'], 'rock-2': ['environment/Rock_2'], 'rock-3': ['environment/Rock_3'], 'rock-4': ['environment/Rock_4', 0.7],
  'rock-large-1': ['environment/Rock_Large_1'], 'rock-large-2': ['environment/Rock_Large_2', 0.7], 'rock-large-3': ['environment/Rock_Large_3', 0.7],
  'bush-1': ['environment/Bush_1', 0.35], 'bush-2': ['environment/Bush_2', 0.4], 'bush-3': ['environment/Bush_3', 0.6],
  'grass-1': ['environment/Grass_1', 0.6], 'grass-2': ['environment/Grass_2', 0.6], 'grass-3': ['environment/Grass_3', 0.6],
  'plant-1': ['environment/Plant_1', 0.6], 'plant-2': ['environment/Plant_2', 0.6], 'plant-3': ['environment/Plant_3', 0.4],
  'tree-blob-1': ['environment/Tree_Blob_1', 0.25], 'tree-blob-2': ['environment/Tree_Blob_2', 0.25], 'tree-blob-3': ['environment/Tree_Blob_3', 0.4],
  'tree-floating-1': ['environment/Tree_Floating_1', 0.35], 'tree-floating-2': ['environment/Tree_Floating_2', 0.25],
  'tree-lava-1': ['environment/Tree_Lava_1', 0.5], 'tree-lava-2': ['environment/Tree_Lava_2', 0.5], 'tree-lava-3': ['environment/Tree_Lava_3', 0.5],
  'tree-light-1': ['environment/Tree_Light_1', 0.4], 'tree-light-2': ['environment/Tree_Light_2', 0.5],
  'tree-spikes-1': ['environment/Tree_Spikes_1', 0.35], 'tree-spikes-2': ['environment/Tree_Spikes_2', 0.4],
  'tree-spiral-1': ['environment/Tree_Spiral_1', 0.6], 'tree-spiral-2': ['environment/Tree_Spiral_2', 0.45], 'tree-spiral-3': ['environment/Tree_Spiral_3', 0.5],
  'tree-swirl-1': ['environment/Tree_Swirl_1', 0.4], 'tree-swirl-2': ['environment/Tree_Swirl_2', 0.5],
};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function dropClip(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

const atlases = new Map();
async function readAtlas(tex) {
  const img = tex.getImage();
  const key = Buffer.from(img).toString('base64', 0, 64) + img.byteLength;
  let a = atlases.get(key);
  if (a) return a;
  const { data, info } = await sharp(Buffer.from(img)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  a = { data, w: info.width, h: info.height };
  atlases.set(key, a);
  return a;
}

/** Every primitive: its atlas colour baked into COLOR_0, UVs dropped; one material for all. */
async function bakeColours(doc) {
  const lit = doc.createMaterial('space').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial();
      const f = m ? m.getBaseColorFactor() : [1, 1, 1, 1];
      const tex = m?.getBaseColorTexture();
      const uv = prim.getAttribute('TEXCOORD_0');
      const pos = prim.getAttribute('POSITION');
      const n = pos.getCount();
      const out = new Float32Array(n * 3);
      const a = tex ? await readAtlas(tex) : null;
      const t = [0, 0];
      for (let i = 0; i < n; i++) {
        let rgb = [1, 1, 1];
        if (a && uv) {
          uv.getElement(i, t);
          const u = ((t[0] % 1) + 1) % 1, v = ((t[1] % 1) + 1) % 1;
          const x = Math.min(a.w - 1, Math.floor(u * a.w)), y = Math.min(a.h - 1, Math.floor(v * a.h));
          const k = (y * a.w + x) * 4;
          rgb = [srgbToLinear(a.data[k] / 255), srgbToLinear(a.data[k + 1] / 255), srgbToLinear(a.data[k + 2] / 255)];
        }
        out[i * 3] = rgb[0] * f[0]; out[i * 3 + 1] = rgb[1] * f[1]; out[i * 3 + 2] = rgb[2] * f[2];
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer()));
      for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD_')) prim.setAttribute(sem, null);
      prim.setMaterial(lit);
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (m !== lit) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  return lit;
}

/** Skinned primitives get the same attribute types (the kit mixes bytes and shorts). */
function normaliseSkinned(p) {
  const jt = p.getAttribute('JOINTS_0');
  if (jt && !(jt.getArray() instanceof Uint16Array)) jt.setArray(new Uint16Array(jt.getArray()));
  const wt = p.getAttribute('WEIGHTS_0');
  if (wt && !(wt.getArray() instanceof Float32Array)) {
    const a = wt.getArray(), f = new Float32Array(a.length), scale = a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : 1;
    for (let i = 0; i < a.length; i++) f[i] = a[i] / scale;
    wt.setArray(f).setNormalized(false);
  }
  const ix = p.getIndices();
  if (!(ix.getArray() instanceof Uint32Array)) ix.setArray(new Uint32Array(ix.getArray()));
}

/** Copies a primitive (from another document) into `doc`. */
function copyPrim(doc, p, mat, buf) {
  const out = doc.createPrimitive().setMaterial(mat);
  for (const sem of ['POSITION', 'NORMAL', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']) {
    const a = p.getAttribute(sem);
    if (!a) continue;
    out.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized()).setBuffer(buf));
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(p.getIndices().getArray().slice()).setBuffer(buf));
  return out;
}

const docs = [];

async function finish(io, doc, name, ratio) {
  const root = doc.getRoot();
  await doc.transform(weld(), dedup());
  if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: true }));
  await doc.transform(prune(), dedup());
  // the box before quantizing (which moves a scale onto the nodes)
  const b = getBounds(root.listScenes()[0]);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
  for (const b of root.listBuffers().slice(1)) b.dispose();
  const file = join(OUT, name + '.glb');
  await io.write(file, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  const size = [0, 1, 2].map((k) => (b.max[k] - b.min[k]).toFixed(2)).join('x');
  const clips = root.listAnimations().map((a) => {
    let end = 0;
    for (const s of a.listSamplers()) { const t = s.getInput().getArray(); end = Math.max(end, t[t.length - 1]); }
    return `${a.getName()}:${end.toFixed(2)}`;
  });
  const meshes = root.listNodes().filter((n) => n.getMesh() && n.getSkin()).map((n) => n.getName());
  docs.push(`quaternius/space-kit/${name}.glb ${Math.round(statSync(file).size / 1024)}KB ${size}${meshes.length > 1 ? ' meshes: ' + meshes.join(' ') : ''}${clips.length ? ' clips: ' + clips.join(' ') : ''}`);
  console.log(`${name.padEnd(18)} ${String(Math.round(statSync(file).size / 1024)).padStart(5)} KB  ${tris} tris  ${clips.length} clips`);
}

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
await MeshoptSimplifier.ready;

const keepClips = (doc, list) => { for (const a of doc.getRoot().listAnimations()) if (!list.includes(a.getName())) dropClip(a); };

/** One skeleton with several bodies: the first file's rig and clips, every file's skinned body as `names[i]`. */
async function shareRig(files, names, clips, out, ratio, keepRigid = []) {
  const doc = await io.read(join(src, files[0] + '.gltf'));
  const lit = await bakeColours(doc);
  keepClips(doc, clips);
  const root = doc.getRoot();
  const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  const skin = skinned[0].getSkin();
  const parent = skinned[0].getParentNode();
  const buf = root.listBuffers()[0];
  for (const n of skinned) n.dispose();
  for (const n of root.listNodes()) if (n.getMesh() && !n.getSkin()) {
    const nm2 = n.getName().trim();
    if (keepRigid.includes(nm2)) n.setName(nm2.toLowerCase()); else n.dispose();
  }
  for (let i = 0; i < files.length; i++) {
    const vdoc = await io.read(join(src, files[i] + '.gltf'));
    await bakeColours(vdoc);
    const vn = vdoc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
    const prims = [];
    for (const n of vn) for (const p of n.getMesh().listPrimitives()) { normaliseSkinned(p); prims.push(p); }
    const joined = prims.length === 1 ? prims[0] : joinPrimitives(prims);
    const mesh = doc.createMesh(names[i]).addPrimitive(copyPrim(doc, joined, lit, buf));
    parent.addChild(doc.createNode(names[i]).setMesh(mesh).setSkin(skin));
  }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await finish(io, doc, out, ratio);
}

/** A rig of its own: bakes, keeps clips, names the skinned body `body`. */
async function soloRig(file, clips, out, ratio) {
  const doc = await io.read(join(src, file + '.gltf'));
  await bakeColours(doc);
  keepClips(doc, clips);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh() && n.getSkin()) {
    for (const p of n.getMesh().listPrimitives()) normaliseSkinned(p);
    n.setName('body');
  }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await finish(io, doc, out, ratio);
}

// ---------------------------------------------------------------- the crew, the mechs, the aliens
await shareRig(Object.values(ANIMALS).map((a) => 'characters/Astronaut_' + a), Object.keys(ANIMALS).map((k) => 'a-' + k), HERO_CLIPS, 'astronauts', 0.6, ['Pistol']);
for (const [k, a] of Object.entries(ANIMALS)) await soloRig('characters/Mech_' + a, MECH_CLIPS, 'mech-' + k, 0.6);
await shareRig(['characters/Enemy_ExtraSmall', 'characters/Enemy_Small'], ['e-xs', 'e-s'], BLOB_CLIPS, 'blobs', 0.7);
await soloRig('characters/Enemy_Flying', BLOB_CLIPS, 'flyer', 0.6);
await soloRig('characters/Enemy_Large', BRUTE_CLIPS, 'brute', 0.6);

// ---------------------------------------------------------------- the static models
for (const [name, [file, ratio]] of Object.entries(STATIC)) {
  const doc = await io.read(join(src, file + '.gltf'));
  await bakeColours(doc);
  for (const a of doc.getRoot().listAnimations()) dropClip(a);
  await finish(io, doc, name, ratio);
}

const total = readdirSync(OUT).filter((f) => f.endsWith('.glb')).reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);

// ---------------------------------------------------------------- the asset list
const source = [];
for (const dir of ['characters', 'vehicles', 'items', 'environment']) {
  for (const f of readdirSync(join(src, dir)).sort()) source.push(`${dir}/${f} ${Math.round(statSync(join(src, dir, f)).size / 1024)}KB`);
}
writeFileSync(join(ROOT, 'docs/assets/quaternius-space-kit.txt'), [
  '# Quaternius Ultimate Space Kit (March 2023, CC0 1.0): what public/assets/quaternius/space-kit holds',
  '# (games/astro-crew/import-kit.mjs). Each line: file, size, bounding box in model units (x × y × z),',
  '# the skinned meshes of a shared rig and the clips with their length in seconds. Characters face +z.',
  ...docs.sort(),
  '',
  '# The kit as shared by the owner (glTF with embedded buffers and atlas; not in the repository):',
  ...source,
  '',
].join('\n'));
