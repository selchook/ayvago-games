// Last Convoy: how public/assets/quaternius/zombie-kit/*.glb were made from Quaternius's Zombie
// Apocalypse Kit (March 2024, CC0; the .gltf files of the owner-shared Google Drive folder, buffers
// and the 512 px flat-colour atlas embedded). Kept as a record and for a re-import; not part of the
// build.
//
//   node games/last-convoy/import-kit.mjs <kit dir with Characters/ Vehicles/ Environment/>
//        <node_modules with @gltf-transform/core + /extensions + /functions, meshoptimizer and sharp>
//
// What it does:
//   - bakes the atlas into vertex colours: every vertex takes the colour of the swatch its UV points
//     at (the kit is flat colours), so no texture is left; the lit parts keep a material of their own
//     by name (`head` the headlights, `brake` the brake lights, `lamp` the street lamp's bulb) so the
//     game can make them glow;
//   - the four survivors (one identical skeleton and clip set) become one file, `heroes.glb`: the
//     skeleton once, each body as a skinned mesh `h-<name>`, Lis's shoulder pad (`shoulder`) and the
//     ten weapons hung on the left hand's bone `Middle1.L` (`axe`, `guitar`, `knife`, `pistol`,
//     `rifle`, `shotgun`, `smg`, `spear`, `bat-barbed`, `bat-saw`; the game shows one);
//   - each zombie and each dog keeps a file (their skeletons differ), with only the clips the game
//     plays, resampled;
//   - the six vehicles go into `vehicles.glb` (a root node each: `body`, `wheel-fl`, `wheel-fr`,
//     `wheels-back`), the environment into `props.glb` (a root node per model);
//   - welds, simplifies the heavy models, prunes and quantizes (KHR_mesh_quantization);
//   - writes docs/assets/quaternius-zombie-kit.txt (every file with its size, boxes and clips).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync, readdirSync, writeFileSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-kit.mjs <kit dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO, Document, getBounds } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, simplify, weld, joinPrimitives, quantize } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/assets/quaternius/zombie-kit');
mkdirSync(OUT, { recursive: true });

const HEROES = { lis: 'Lis', matt: 'Matt', sam: 'Sam', shaun: 'Shaun' };
const HERO_CLIPS = ['Death', 'Duck', 'HitReact', 'Idle', 'Idle_Gun', 'Jump', 'Jump_Idle', 'Jump_Land', 'No', 'Punch', 'Run', 'Run_Gun', 'Run_Slash', 'Run_Stab', 'Slash', 'Stab', 'Walk', 'Walk_Gun', 'Wave', 'Yes'];
const WEAPONS = { Axe: 'axe', Guitar: 'guitar', Knife: 'knife', Pistol: 'pistol', Rifle: 'rifle', Shotgun: 'shotgun', SMG: 'smg', Spear: 'spear', WoodenBat_Barbed: 'bat-barbed', WoodenBat_Saw: 'bat-saw', Shoulder: 'shoulder' };
const ZOMBIE_CLIPS = ['Crawl', 'Death', 'HitReact', 'Idle', 'Idle_Attack', 'Punch', 'Run', 'Run_Attack', 'Walk', 'Jump_Land', 'No'];
const DOG_CLIPS = ['Attack', 'Death', 'Eating', 'HitReact_Left', 'Idle', 'Idle_2_HeadLow', 'Run', 'Run_Jump', 'Walk'];
const RIGS = {
  'zombie-basic': ['Characters/Zombie_Basic', 0.55],
  'zombie-chubby': ['Characters/Zombie_Chubby', 0.55],
  'zombie-arm': ['Characters/Zombie_Arm', 0.6],
  'zombie-ribcage': ['Characters/Zombie_Ribcage', 0.6],
  'dog-shepherd': ['Characters/Characters_GermanShepherd', 0.55],
  'dog-pug': ['Characters/Characters_Pug', 0.6],
};
const VEHICLES = { pickup: 'Pickup', 'pickup-armored': 'Pickup_Armored', truck: 'Truck', 'truck-armored': 'Truck_Armored', sports: 'Sports', 'sports-armored': 'Sports_Armored' };
const PARTS = { FrontWheel_L: 'wheel-fl', FrontWheel_R: 'wheel-fr', BackWheels: 'wheels-back' };
const PROPS = {
  barrel: 'Barrel', 'blood-1': 'Blood_1', 'blood-2': 'Blood_2', 'blood-3': 'Blood_3', chest: 'Chest', 'chest-special': 'Chest_Special',
  'cinder-block': 'CinderBlock', 'container-green': 'Container_Green', 'container-red': 'Container_Red', couch: 'Couch', hydrant: 'FireHydrant',
  pallet: 'Pallet', 'pallet-broken': 'Pallet_Broken', pipes: 'Pipes', 'plastic-barrier': 'PlasticBarrier', 'street-light': 'StreetLights',
  'street-4way': 'Street_4Way', 'street-straight': 'Street_Straight', 'street-crack-1': 'Street_Straight_Crack1', 'street-crack-2': 'Street_Straight_Crack2',
  'street-t': 'Street_T', 'street-turn': 'Street_Turn', 'town-sign': 'TownSign', 'traffic-barrier-1': 'TrafficBarrier_1', 'traffic-barrier-2': 'TrafficBarrier_2',
  'cone-1': 'TrafficCone_1', 'cone-2': 'TrafficCone_2', 'traffic-light-1': 'TrafficLight_1', 'traffic-light-2': 'TrafficLight_2',
  'trash-1': 'TrashBag_1', 'trash-2': 'TrashBag_2', 'water-tower': 'WaterTower', wheel: 'Wheel', tyres: 'Wheels_Stack',
};
/** Materials that stay their own (by the kit's name → ours); everything else is `lit`. */
const GLOW = { Headlights: 'head', BrakeLight: 'brake', Light: 'lamp' };

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

/** Every primitive: its atlas colour baked into COLOR_0 (times any colour it had), UVs dropped. */
async function bakeColours(doc) {
  const mats = new Map();
  const matFor = (name) => {
    let m = mats.get(name);
    if (!m) { m = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0); mats.set(name, m); }
    return m;
  };
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial();
      const f = m ? m.getBaseColorFactor() : [1, 1, 1, 1];
      const tex = m?.getBaseColorTexture();
      const uv = prim.getAttribute('TEXCOORD_0');
      const pos = prim.getAttribute('POSITION');
      const old = prim.getAttribute('COLOR_0');
      const n = pos.getCount();
      const out = new Float32Array(n * 3);
      const a = tex ? await readAtlas(tex) : null;
      const t = [0, 0], oc = [1, 1, 1, 1];
      for (let i = 0; i < n; i++) {
        let rgb = [1, 1, 1];
        if (a && uv) {
          uv.getElement(i, t);
          const u = ((t[0] % 1) + 1) % 1, v = ((t[1] % 1) + 1) % 1;
          const x = Math.min(a.w - 1, Math.floor(u * a.w)), y = Math.min(a.h - 1, Math.floor(v * a.h));
          const k = (y * a.w + x) * 4;
          rgb = [srgbToLinear(a.data[k] / 255), srgbToLinear(a.data[k + 1] / 255), srgbToLinear(a.data[k + 2] / 255)];
        }
        if (old) { old.getElement(i, oc); rgb = [rgb[0] * oc[0], rgb[1] * oc[1], rgb[2] * oc[2]]; }
        out[i * 3] = rgb[0] * f[0]; out[i * 3 + 1] = rgb[1] * f[1]; out[i * 3 + 2] = rgb[2] * f[2];
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer()));
      for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD_')) prim.setAttribute(sem, null);
      prim.setMaterial(matFor(GLOW[m?.getName()] ?? 'lit'));
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (![...mats.values()].includes(m)) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  return matFor('lit');
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
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
await MeshoptSimplifier.ready;

const tris = (root) => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
const box = (b) => [0, 1, 2].map((k) => (b.max[k] - b.min[k]).toFixed(2)).join('x');

async function finish(doc, name, ratio, note = '', solid = false) {
  const root = doc.getRoot();
  await doc.transform(weld(), dedup());
  if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: solid ? 0.006 : 0.004, lockBorder: !solid }));
  await doc.transform(prune(), dedup());
  const b = getBounds(root.listScenes()[0]);
  const parts = root.listScenes()[0].listChildren().length > 1
    ? root.listScenes()[0].listChildren().map((n) => `${n.getName()} ${box(getBounds(n))}`) : [];
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
  for (const x of root.listBuffers().slice(1)) x.dispose();
  // rotation keys as normalized shorts (KHR_mesh_quantization allows it; three.js reads them)
  for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
    if (ch.getTargetPath() !== 'rotation') continue;
    const out = ch.getSampler().getOutput();
    const f = out.getArray();
    if (!(f instanceof Float32Array)) continue;
    const q = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, f[i])) * 32767);
    out.setArray(q).setNormalized(true);
  }
  const file = join(OUT, name + '.glb');
  await io.write(file, doc);
  const clips = root.listAnimations().map((a) => {
    let end = 0;
    for (const s of a.listSamplers()) { const t = s.getInput().getArray(); end = Math.max(end, t[t.length - 1]); }
    return `${a.getName()}:${end.toFixed(2)}`;
  });
  const kb = Math.round(statSync(file).size / 1024);
  docs.push([`quaternius/zombie-kit/${name}.glb ${kb}KB ${box(b)} ${tris(root)} tris${note}`, ...(clips.length ? ['  clips: ' + clips.join(' ')] : []), ...parts.map((p) => '  ' + p)].join('\n'));
  console.log(`${name.padEnd(16)} ${String(kb).padStart(5)} KB  ${tris(root)} tris  ${clips.length} clips`);
}

const keepClips = (doc, list) => { for (const a of doc.getRoot().listAnimations()) if (!list.includes(a.getName())) dropClip(a); };

/**
 * Drops the channels that hold a bone at its rest pose all clip long (three.js blends a missing
 * track with the rest pose, so nothing moves differently): most of a rig's tracks are such, and
 * each costs two accessors of JSON in the file.
 */
async function dropRestChannels(doc) {
  await doc.transform(resample({ tolerance: 1e-3 }));
  let dropped = 0;
  for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath();
    const rest = path === 'rotation' ? node.getRotation() : path === 'translation' ? node.getTranslation() : path === 'scale' ? node.getScale() : null;
    if (!rest) continue;
    const out = ch.getSampler().getOutput(), n = out.getCount(), v = [0, 0, 0, 0];
    let same = true;
    for (let i = 0; i < n && same; i++) {
      out.getElement(i, v);
      // q and -q are one rotation
      const sign = path === 'rotation' && v[0] * rest[0] + v[1] * rest[1] + v[2] * rest[2] + v[3] * rest[3] < 0 ? -1 : 1;
      for (let k = 0; k < rest.length; k++) if (Math.abs(v[k] * sign - rest[k]) > 2e-3) { same = false; break; }
    }
    if (same) { const smp = ch.getSampler(); ch.dispose(); if (!smp.listParents().some((p) => p !== doc.getRoot() && p.propertyType === 'AnimationChannel')) smp.dispose(); dropped++; }
  }
  return dropped;
}

// ---------------------------------------------------------------- the survivors: one skeleton, four bodies, the weapons
{
  const files = Object.values(HEROES).map((h) => `Characters/Characters_${h}`);
  const doc = await io.read(join(src, files[0] + '.gltf'));
  const lit = await bakeColours(doc);
  keepClips(doc, HERO_CLIPS);
  const root = doc.getRoot();
  const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  const skin = skinned[0].getSkin();
  const parent = skinned[0].getParentNode();
  const buf = root.listBuffers()[0];
  for (const n of skinned) n.dispose();
  for (const n of root.listNodes()) if (n.getMesh() && !n.getSkin()) {
    const id = WEAPONS[n.getName().trim()];
    if (id) n.setName(id); else n.dispose();
  }
  const keys = Object.keys(HEROES);
  for (let i = 0; i < files.length; i++) {
    const vdoc = await io.read(join(src, files[i] + '.gltf'));
    await bakeColours(vdoc);
    const vn = vdoc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
    const prims = [];
    for (const n of vn) for (const p of n.getMesh().listPrimitives()) { normaliseSkinned(p); prims.push(p); }
    const joined = prims.length === 1 ? prims[0] : joinPrimitives(prims);
    const mesh = doc.createMesh('h-' + keys[i]).addPrimitive(copyPrim(doc, joined, lit, buf));
    parent.addChild(doc.createNode('h-' + keys[i]).setMesh(mesh).setSkin(skin));
  }
  await dropRestChannels(doc);
  await finish(doc, 'heroes', 0.55, ' (meshes: h-lis h-matt h-sam h-shaun, shoulder on Shoulder.L; axe guitar knife pistol rifle shotgun smg spear bat-barbed bat-saw on Middle1.L)');
}

// ---------------------------------------------------------------- zombies and dogs: a rig each
for (const [name, [file, ratio]] of Object.entries(RIGS)) {
  const doc = await io.read(join(src, file + '.gltf'));
  await bakeColours(doc);
  keepClips(doc, name.startsWith('dog') ? DOG_CLIPS : ZOMBIE_CLIPS);
  const skinned = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
  // several skinned parts (the chubby's face and tongue, the pug's three) become one body
  const prims = [];
  for (const n of skinned) for (const p of n.getMesh().listPrimitives()) { normaliseSkinned(p); prims.push(p); }
  const joined = prims.length === 1 ? prims[0] : joinPrimitives(prims);
  const keep = skinned[0];
  const mesh = doc.createMesh('body').addPrimitive(joined);
  keep.setMesh(mesh).setName('body');
  for (const n of skinned.slice(1)) n.dispose();
  await dropRestChannels(doc);
  await finish(doc, name, ratio);
}

// ---------------------------------------------------------------- static models gathered into one file
/** Copies every mesh of `file` (with its node matrix baked) under a new root node `name` of `doc`. */
async function gather(doc, scene, lit, file, name, partNames) {
  const vdoc = await io.read(join(src, file + '.gltf'));
  await bakeColours(vdoc);
  const buf = doc.getRoot().listBuffers()[0];
  const group = doc.createNode(name);
  scene.addChild(group);
  const mats = new Map(doc.getRoot().listMaterials().map((m) => [m.getName(), m]));
  for (const n of vdoc.getRoot().listNodes()) {
    if (!n.getMesh()) continue;
    const child = doc.createNode(partNames?.[n.getName()] ?? 'body');
    const m = doc.createMesh(child.getName());
    for (const p of n.getMesh().listPrimitives()) {
      const mn = p.getMaterial().getName();
      let mat = mats.get(mn);
      if (!mat) { mat = doc.createMaterial(mn).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0); mats.set(mn, mat); }
      m.addPrimitive(copyPrim(doc, p, mat, buf));
    }
    child.setMesh(m).setMatrix(n.getWorldMatrix());
    group.addChild(child);
  }
  void lit;
}

async function pack(name, map, dir, ratio, partNames, note) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('scene');
  doc.getRoot().setDefaultScene(scene);
  const lit = doc.createMaterial('lit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  for (const [id, file] of Object.entries(map)) await gather(doc, scene, lit, `${dir}/${dir === 'Vehicles' ? 'Vehicle_' : ''}${file}`, id, partNames);
  await finish(doc, name, ratio, note, true);
}

await pack('vehicles', VEHICLES, 'Vehicles', 0.45, PARTS, ' (a root node per vehicle: body, wheel-fl, wheel-fr, wheels-back; facing +z)');
await pack('props', PROPS, 'Environment', 0.6, null, ' (a root node per model)');

const total = readdirSync(OUT).filter((f) => f.endsWith('.glb')).reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);

// ---------------------------------------------------------------- the asset list
const source = [];
for (const dir of ['Characters', 'Vehicles', 'Environment']) {
  for (const f of readdirSync(join(src, dir)).sort()) source.push(`${dir}/${f} ${Math.round(statSync(join(src, dir, f)).size / 1024)}KB`);
}
writeFileSync(join(ROOT, 'docs/assets/quaternius-zombie-kit.txt'), [
  '# Quaternius Zombie Apocalypse Kit (March 2024, CC0 1.0): what public/assets/quaternius/zombie-kit holds',
  '# (games/last-convoy/import-kit.mjs). Each entry: file, size, bounding box in metres (x × y × z), triangles,',
  '# the clips with their length in seconds and, for packed files, each root node with its box. Characters,',
  '# dogs and vehicles face +z.',
  ...docs.sort(),
  '',
  '# The kit as shared by the owner (glTF with embedded buffers and atlas; not in the repository):',
  ...source,
  '',
].join('\n'));
