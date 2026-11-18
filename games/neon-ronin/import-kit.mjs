// Neon Ronin: how public/assets/quaternius/cyberpunk-kit/ was made from Quaternius's Cyberpunk Game
// Kit (CC0 1.0, the kit's own License.txt; the .gltf files of the owner-shared folder, buffers
// embedded as data URIs, flat material colours plus one shared 1000 px "Texture_Signs" image for
// the neon signs and the hazard stripes). Kept as a record and for a re-import; not part of the build.
//
//   node games/neon-ronin/import-kit.mjs <kit dir with character/ enemies/ pickups-and-objects/
//        platforms/ textures/> <node_modules with @gltf-transform/core + /extensions + /functions,
//        meshoptimizer and sharp>
//
// What it does (only to the models the game loads):
//   - bakes every flat material colour into vertex colours, so a model draws with at most three
//     shared materials in the game: `lit` (vertex colours), `glow` (the kit's lights, screens, eyes
//     and the katana's blade: drawn unlit) and `sign` (the prims that sample Texture_Signs keep
//     their UVs; the image itself is not embedded: the game loads `sign.png` once and gives every
//     sign the same texture);
//   - recolours the hero for the game: magenta armour accents and a cyan neon katana;
//   - the rigs: `hero` (the Character, its body and the `sword` as two skinned meshes), and one file
//     per enemy family sharing one skeleton and one clip set: `walker` (Enemy_2Legs as the skinned
//     mesh `plain`, Enemy_2Legs_Gun as `gun`), `drone` (Enemy_Flying `plain`, Enemy_Flying_Gun
//     `gun`, the plain body re-indexed onto the gun rig's joints), and `brute` (Enemy_Large) and
//     `mech` (Enemy_Large_Gun, the boss) on their own, because their rigs differ; the clips the
//     game does not play are dropped, the rest resampled;
//   - every static piece (platforms, supports, rails, pipes, cables, signs, AC units, screens,
//     lights, the door, turrets, pickups, the lever, the lootbox) goes into one `props.glb`, each
//     model under a root node of its own name (multi-part ones keep `base` and `top` children);
//   - the props lose their normals (the game draws them flat-shaded), so their faces weld and the
//     heavy platforms simplify; everything is welded, deduped, pruned and quantized
//     (KHR_mesh_quantization).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync, readdirSync, writeFileSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-kit.mjs <kit dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, simplify, weld, joinPrimitives, quantize, mergeDocuments, unpartition } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const OUT = join(import.meta.dirname, '../../public/assets/quaternius/cyberpunk-kit');
mkdirSync(OUT, { recursive: true });

const HERO_CLIPS = [
  'Death', 'Gun_Shoot', 'HitRecieve', 'HitRecieve_2', 'Idle_Sword', 'Idle_Neutral', 'Interact', 'Kick_Left', 'Kick_Right',
  'Punch_Left', 'Punch_Right', 'Roll', 'Run', 'Run_Shoot', 'Sword_Slash', 'Wave',
];
const WALKER_CLIPS = ['Attack', 'Death', 'Idle', 'Jump', 'Run', 'Shoot', 'Walk'];
const DRONE_CLIPS = ['Attack', 'Dead', 'Idle', 'Run', 'Shoot'];
const BRUTE_CLIPS = ['Attack', 'Attack.001', 'Death', 'Idle', 'Jump', 'Run', 'Shoot', 'Walk'];

/** Materials drawn unlit (they glow in the night). */
const GLOW = new Set(['Light', 'Screen', 'Eye', 'LightGreen', 'Blade', 'Blade_Edge', 'Red']);
/** The game's recolours (linear RGB). */
const RECOLOUR = {
  Accent: [0.95, 0.05, 0.42], Accent_Dark: [0.28, 0.02, 0.14], Blade: [0.05, 0.75, 1.0], Blade_Edge: [0.75, 1.0, 1.0],
  Screen: [0.08, 0.7, 0.85], Light: [1.0, 0.92, 0.75],
};

/** out name → source file (folder/name without .gltf) and an optional simplify ratio. */
const PROPS = {
  'plat-4x4': ['platforms/Platform_4x4', 0.14],
  'plat-4x2': ['platforms/Platform_4x2', 0.14],
  'plat-2x2': ['platforms/Platform_2x2', 0.16],
  'plat-4x1': ['platforms/Platform_4x1', 0.3],
  'slab-4x1': ['platforms/Platform_4x1_Empty'],
  'slab-2x1': ['platforms/Platform_2x1_Empty'],
  'slab-1x1': ['platforms/Platform_1x1_Empty'],
  'slab-4x4': ['platforms/Platform_4x4_Empty'],
  support: ['platforms/Support'],
  'support-long': ['platforms/Support_Long'],
  'support-short': ['platforms/Support_Short'],
  'rail-long': ['platforms/Rail_Long'],
  'rail-short': ['platforms/Rail_Short'],
  fence: ['platforms/Fence'],
  door: ['platforms/Door'],
  'pipe-1': ['platforms/Pipe_1'],
  'pipe-2': ['platforms/Pipe_2'],
  'cable-long': ['platforms/Cable_Long'],
  'cable-small': ['platforms/Cable_Small'],
  'cable-thick': ['platforms/Cable_Thick'],
  ac: ['platforms/AC'],
  'ac-side': ['platforms/AC_Side'],
  'ac-stacked': ['platforms/AC_Stacked'],
  'antenna-1': ['platforms/Antenna_1'],
  'antenna-2': ['platforms/Antenna_2'],
  computer: ['platforms/Computer'],
  'computer-large': ['platforms/Computer_Large', 0.6],
  'tv-1': ['platforms/TV_1'],
  'tv-2': ['platforms/TV_2'],
  'tv-3': ['platforms/TV_3'],
  'light-square': ['platforms/Light_Square'],
  'light-street-1': ['platforms/Light_Street_1'],
  'light-street-2': ['platforms/Light_Street_2'],
  'sign-1': ['platforms/Sign_1'],
  'sign-2': ['platforms/Sign_2'],
  'sign-3': ['platforms/Sign_3'],
  'sign-4': ['platforms/Sign_4'],
  'sign-corner-1': ['platforms/Sign_Corner_1'],
  'sign-corner-2': ['platforms/Sign_Corner_2'],
  'sign-corner-3': ['platforms/Sign_Corner_3'],
  'sign-hazard': ['platforms/Sign_Corner_Hazard'],
  'sign-small-1': ['platforms/Sign_Small_1'],
  'sign-small-2': ['platforms/Sign_Small_2'],
  'sign-small-3': ['platforms/Sign_Small_3'],
  'turret-cannon': ['enemies/Turret_Cannon', 0.6],
  'turret-gun': ['enemies/Turret_Gun', 0.6],
  'turret-double': ['enemies/Turret_GunDouble', 0.6],
  teleporter: ['enemies/Turret_Teleporter', 0.6],
  chip: ['pickups-and-objects/Collectible_Board'],
  gear: ['pickups-and-objects/Collectible_Gear', 0.6],
  lever: ['pickups-and-objects/Lever'],
  lootbox: ['pickups-and-objects/Lootbox', 0.6],
  health: ['pickups-and-objects/Pickup_Health', 0.5],
  heart: ['pickups-and-objects/Pickup_Heart', 0.5],
  tank: ['pickups-and-objects/Pickup_Tank', 0.6],
  barrel: ['pickups-and-objects/Tank', 0.5],
};

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
await MeshoptSimplifier.ready;

function dropClip(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
const keepClips = (doc, clips) => { for (const a of doc.getRoot().listAnimations()) if (!clips.includes(a.getName())) dropClip(a); };

/** Every primitive: its material colour baked into COLOR_0; three shared materials (lit, glow, sign). */
function bakeColours(doc) {
  const mk = (n) => doc.createMaterial(n).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  // the three differ in a property, so dedup() keeps them apart
  const lit = mk('lit'), glow = mk('glow').setEmissiveFactor([1, 1, 1]), sign = mk('sign').setEmissiveFactor([0.5, 0.5, 0.5]);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial();
      const name = m?.getName() ?? '';
      const textured = !!m?.getBaseColorTexture() || !!m?.getEmissiveTexture() || name.startsWith('Texture_');
      const f = RECOLOUR[name] ?? (m ? m.getBaseColorFactor() : [1, 1, 1, 1]);
      const pos = prim.getAttribute('POSITION');
      const n = pos.getCount();
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        out[i * 3] = textured ? 1 : f[0]; out[i * 3 + 1] = textured ? 1 : f[1]; out[i * 3 + 2] = textured ? 1 : f[2];
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer()));
      for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD_') && !(textured && sem === 'TEXCOORD_0')) prim.setAttribute(sem, null);
      prim.setMaterial(textured ? sign : GLOW.has(name) ? glow : lit);
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (m !== lit && m !== glow && m !== sign) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  return { lit, glow, sign };
}

/** Skinned primitives get the same attribute types (the kit mixes bytes and shorts). */
function normaliseSkinned(p) {
  const jt = p.getAttribute('JOINTS_0');
  if (!(jt.getArray() instanceof Uint16Array)) jt.setArray(new Uint16Array(jt.getArray()));
  const wt = p.getAttribute('WEIGHTS_0');
  if (!(wt.getArray() instanceof Float32Array)) {
    const a = wt.getArray(), f = new Float32Array(a.length), scale = a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : 1;
    for (let i = 0; i < a.length; i++) f[i] = a[i] / scale;
    wt.setArray(f).setNormalized(false);
  }
  const ix = p.getIndices();
  if (!(ix.getArray() instanceof Uint32Array)) ix.setArray(new Uint32Array(ix.getArray()));
  for (const sem of p.listSemantics()) if (sem.startsWith('TEXCOORD_')) p.setAttribute(sem, null);
}

/** The skinned prims of some nodes joined per material: one prim per material. */
function joinByMaterial(nodes) {
  const groups = new Map();
  for (const n of nodes) for (const p of n.getMesh().listPrimitives()) {
    normaliseSkinned(p);
    const m = p.getMaterial();
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(p);
  }
  return [...groups.values()].map((ps) => (ps.length === 1 ? ps[0] : joinPrimitives(ps)));
}

/** Copies a primitive (from another document) into `doc`, its joints re-indexed by `remap`. */
function copyPrim(doc, p, mat, buf, remap) {
  const out = doc.createPrimitive().setMaterial(mat);
  for (const sem of ['POSITION', 'NORMAL', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']) {
    const a = p.getAttribute(sem);
    let arr = a.getArray().slice();
    if (sem === 'JOINTS_0' && remap) arr = arr.map((j) => remap[j]);
    out.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(arr).setNormalized(a.getNormalized()).setBuffer(buf));
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(p.getIndices().getArray().slice()).setBuffer(buf));
  return out;
}

/** Replaces skinned nodes by one node `name` (one mesh, a prim per material) on the same skin. */
function collapse(doc, nodes, name) {
  const skin = nodes[0].getSkin(), parent = nodes[0].getParentNode();
  const mesh = doc.createMesh(name);
  for (const p of joinByMaterial(nodes)) mesh.addPrimitive(p);
  const node = doc.createNode(name).setMesh(mesh).setSkin(skin);
  (parent ?? doc.getRoot().listScenes()[0]).addChild(node);
  for (const n of nodes) n.dispose();
  return node;
}

async function finish(doc, name, ratio) {
  const root = doc.getRoot();
  await doc.transform(weld(), dedup());
  if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002, lockBorder: true }));
  await doc.transform(prune({ keepAttributes: true }), dedup()); // the signs' UVs stay (their texture is the game's)
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8, quantizeTexcoord: 12 }));
  await doc.transform(unpartition());
  const file = join(OUT, name + '.glb');
  await io.write(file, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  console.log(`${name.padEnd(16)} ${String(Math.round(statSync(file).size / 1024)).padStart(5)} KB  ${tris} tris  ${root.listAnimations().map((a) => a.getName()).join(' ')}`);
}

// ---------------------------------------------------------------- the hero
{
  const doc = await io.read(join(src, 'character/Character.gltf'));
  bakeColours(doc);
  keepClips(doc, HERO_CLIPS);
  const skinned = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
  collapse(doc, skinned.filter((n) => n.getName() !== 'Sword'), 'body');
  collapse(doc, skinned.filter((n) => n.getName() === 'Sword'), 'sword');
  await doc.transform(resample({ tolerance: 1e-4 }));
  await finish(doc, 'hero');
}

// ---------------------------------------------------------------- the enemy families
async function family(name, gunFile, plainFile, clips) {
  const doc = await io.read(join(src, gunFile));
  const { lit, glow } = bakeColours(doc);
  keepClips(doc, clips);
  const root = doc.getRoot();
  const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  const skin = skinned[0].getSkin();
  const gunNode = collapse(doc, skinned, plainFile ? 'gun' : 'body');
  if (plainFile) {
    const pdoc = await io.read(join(src, plainFile));
    bakeColours(pdoc);
    const pn = pdoc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
    const names = skin.listJoints().map((j) => j.getName());
    const remap = pn[0].getSkin().listJoints().map((j) => {
      const i = names.indexOf(j.getName());
      if (i < 0) throw new Error(`${name}: joint ${j.getName()} missing on the gun rig`);
      return i;
    });
    const buf = root.listBuffers()[0];
    const mesh = doc.createMesh('plain');
    for (const p of joinByMaterial(pn)) mesh.addPrimitive(copyPrim(doc, p, p.getMaterial().getName() === 'glow' ? glow : lit, buf, remap));
    gunNode.getParentNode().addChild(doc.createNode('plain').setMesh(mesh).setSkin(skin));
  }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await finish(doc, name);
}
await family('walker', 'enemies/Enemy_2Legs_Gun.gltf', 'enemies/Enemy_2Legs.gltf', WALKER_CLIPS);
await family('drone', 'enemies/Enemy_Flying_Gun.gltf', 'enemies/Enemy_Flying.gltf', DRONE_CLIPS);
await family('brute', 'enemies/Enemy_Large.gltf', null, BRUTE_CLIPS);
await family('mech', 'enemies/Enemy_Large_Gun.gltf', null, BRUTE_CLIPS);

// ---------------------------------------------------------------- the props (one file)
{
  const docs = [];
  for (const [name, [file, ratio]] of Object.entries(PROPS)) {
    const doc = await io.read(join(src, file + '.gltf'));
    bakeColours(doc);
    // flat-shaded in the game (the kit is faceted): no normals, so faces weld and simplify
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
    await doc.transform(weld(), dedup());
    if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: ratio < 0.2 ? 0.02 : 0.004, lockBorder: false }));
    if (ratio) console.log(`  ${name}: ${doc.getRoot().listMeshes().reduce((s2, m) => s2 + m.listPrimitives().reduce((t2, p) => t2 + p.getIndices().getCount() / 3, 0), 0)} tris`);
    // every model under one root named after it; two-part models name their parts base / top
    const scene = doc.getRoot().listScenes()[0];
    const group = doc.createNode(name);
    for (const n of [...scene.listChildren()]) {
      const nn = n.getName();
      if (/_Base$/.test(nn)) n.setName('base');
      else if (/_Top$/.test(nn)) n.setName('top');
      scene.removeChild(n);
      group.addChild(n);
    }
    scene.addChild(group);
    docs.push(doc);
  }
  const doc = docs[0];
  for (const d of docs.slice(1)) mergeDocuments(doc, d);
  // one scene, one buffer, one material of each kind
  const root = doc.getRoot();
  const [scene, ...rest] = root.listScenes();
  for (const s of rest) { for (const n of [...s.listChildren()]) { s.removeChild(n); scene.addChild(n); } s.dispose(); }
  const buf = root.listBuffers()[0];
  for (const a of root.listAccessors()) a.setBuffer(buf);
  for (const b of root.listBuffers().slice(1)) b.dispose();
  await doc.transform(dedup());
  await finish(doc, 'props');
}

// ---------------------------------------------------------------- the shared sign image
await sharp(join(src, 'textures/Texture_Sign.png')).resize(512, 512).png({ palette: true, colours: 128, dither: 0.4 }).toFile(join(OUT, 'sign.png'));
writeFileSync(join(OUT, 'license.txt'), `Cyberpunk Game Kit by Quaternius (quaternius.com), CC0 1.0 Universal (public domain). Obtained as the .gltf files of the folder shared by the project owner, with the pack's own License.txt:

  Cyberpunk Game Kit by @Quaternius
  License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
  https://creativecommons.org/publicdomain/zero/1.0/

The GLB files here are converted from those models by games/neon-ronin/import-kit.mjs (vertex colours, merged rigs, simplified and quantized props); sign.png is the kit's Texture_Signs image at 512 px.
`);

const total = readdirSync(OUT).reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
