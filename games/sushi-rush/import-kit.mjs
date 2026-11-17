// Sushi Rush: how public/assets/quaternius/sushi-kit/*.glb were made from Quaternius's Sushi
// Restaurant Kit (May 2023, CC0; the .gltf files of the official Google Drive folder, buffers
// embedded as data URIs, one shared 512 px flat-colour atlas). Kept as a record and for a
// re-import; not part of the build.
//
//   node games/sushi-rush/import-kit.mjs <kit dir with characters/ characters-knife/ food/
//        environment/ decoration/> <node_modules with @gltf-transform/core + /extensions +
//        /functions, meshoptimizer and sharp>
//
// What it does (only to the models the game loads, see STATIC):
//   - bakes the atlas into vertex colours: every vertex takes the colour of the swatch its UV
//     points at (the kit is flat colours), so no texture is left and every model shares one
//     vertex-colour material in the game. The kit's glowing materials (shoji paper, lantern
//     paper, the truck's lights) keep their own material, named `glow`, drawn unlit;
//   - the eight characters become two files that share their clips:
//       `rabbits.glb`: the rabbits' one skeleton (identical in all seven files) with each rabbit's
//       body, eyes and hair joined into one skinned mesh `r-<colour>`, plus the chef's `knife` and
//       `pan` (from the knife-holding version), so seven rabbits cost one set of animations;
//       `panda.glb`: the panda's body, its `band` (headband), `knife` and `pan`;
//     and keep only the clips the game plays (the customers' and the chefs');
//   - simplifies the heavy models, welds, dedups, prunes and quantizes (KHR_mesh_quantization).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync, readdirSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-kit.mjs <kit dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, simplify, weld, joinPrimitives, quantize } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const OUT = join(import.meta.dirname, '../../public/assets/quaternius/sushi-kit');
mkdirSync(OUT, { recursive: true });

/** The clips the game plays: customers walk in, sit, eat, react; chefs walk, run, chop, roll, cook. */
const CLIPS = [
  'Idle', 'Idle_Holding', 'Walk', 'Walk_Holding', 'Run', 'Run_Holding',
  'Chop_Start', 'Chop_Loop', 'Chop_End', 'Assembly_Start', 'Assembly_Loop', 'Assembly_End', 'Pan_Start', 'Pan_Loop', 'Pan_End',
  'Sitting_Start', 'Sitting_Idle', 'Sitting_Eating', 'Sitting_End', 'Wave', 'Yes', 'No', 'HitReact',
];
const RABBITS = ['Bald', 'Blond', 'Cyan', 'Green', 'Grey', 'Pink', 'Purple'];

/** out name → source file (folder/name without .gltf) and an optional simplify ratio. */
const STATIC = {
  // the room
  'floor-wood': ['environment/Floor_Wood'],
  'floor-kitchen': ['environment/Floor_Kitchen1'],
  'wall-shoji': ['environment/Wall_Shoji'],
  'wall-normal': ['environment/Wall_Normal'],
  'wall-shelves': ['environment/Wall_Shelves'],
  'wall-door': ['environment/Wall_Door'],
  counter: ['environment/Environment_Counter_Straight'],
  'counter-bar': ['environment/Environment_Counter_Straight_2'],
  'counter-drawers': ['environment/Environment_Counter_Drawers'],
  'counter-doors': ['environment/Environment_Counter_Doors'],
  'counter-end': ['environment/Environment_Counter_End'],
  'counter-sink': ['environment/Environment_Counter_Sink'],
  'cabinet-shelves': ['environment/Environment_Cabinet_Shelves'],
  'cabinet-doors': ['environment/Environment_Cabinet_Doors', 0.7],
  fridge: ['environment/Environment_Fridge'],
  oven: ['environment/Environment_Oven', 0.6],
  'pot1': ['environment/Environment_Pot_1_Filled'],
  'pot2-empty': ['environment/Environment_Pot_2_Empty'],
  plate: ['environment/Environment_Plate'],
  bowl: ['environment/Environment_Bowl'],
  'cutting-table': ['environment/Environment_CuttingTable'],
  knives: ['environment/Environment_KitchenKnives', 0.6],
  board: ['environment/Environment_WoodenBoard'],
  steamer: ['environment/Environment_ChukamanSteamer', 0.25],
  stool: ['environment/Environment_Stool'],
  table: ['environment/Environment_Table'],
  chair: ['environment/Environment_Chair2'],
  bottles: ['environment/Environment_Bottles', 0.5],
  bottle: ['environment/Environment_Bottle'],
  // decoration
  lantern: ['decoration/Decoration_Light'],
  sign: ['decoration/Decoration_Sign', 0.7],
  'sakura-tree': ['decoration/Decoration_SakuraTree', 0.3],
  'sakura-flower': ['decoration/Decoration_SakuraFlower', 0.6],
  bamboo: ['decoration/Decoration_Bamboo', 0.6],
  plant1: ['decoration/Decoration_Plant1', 0.6],
  plant2: ['decoration/Decoration_Plant2', 0.6],
  carpet: ['decoration/Decoration_Carpet'],
  bell: ['decoration/Decoration_Bell', 0.4],
  'deco-fish': ['decoration/Decoration_Fish', 0.6],
  // food: the dishes
  'maguro-nigiri': ['food/Food_MaguroNigiri'],
  'salmon-nigiri': ['food/Food_SalmonNigiri'],
  'ebi-nigiri': ['food/Food_EbiNigiri'],
  'tamago-nigiri': ['food/Food_TamagoNigiri'],
  'octopus-nigiri': ['food/Food_OctopusNigiri', 0.6],
  roll: ['food/Food_Roll'],
  'salmon-roll': ['food/Food_SalmonRoll'],
  'urchin-roll': ['food/Food_SeaUrchinRoll', 0.6],
  onigiri: ['food/Food_Onigiri'],
  gyoza: ['food/Food_Gyoza'],
  chukaman: ['food/Food_Chukaman'],
  dango: ['food/Food_Dango', 0.5],
  ramen: ['food/Food_Ramen', 0.3],
  udon: ['food/Food_Udon', 0.35],
  wasabi: ['food/Food_Wasabi'],
  // food: the ingredients
  rice: ['food/FoodIngredient_Rice'],
  nori: ['food/FoodIngredient_Nori'],
  tuna: ['food/FoodIngredient_Tuna', 0.6],
  salmon: ['food/FoodIngredient_Salmon', 0.7],
  'salmon-fish': ['food/FoodIngredient_SalmonFish', 0.7],
  ebi: ['food/FoodIngredient_Ebi'],
  tentacle: ['food/FoodIngredient_Tentacle', 0.6],
  cucumber: ['food/FoodIngredient_Cucumber'],
  'cucumber-cut': ['food/FoodIngredient_SlicedCucumber'],
  urchin: ['food/FoodIngredient_SeaUrchinOpen'],
  'fish-fillet': ['food/FoodIngredient_FishFillet', 0.7],
};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function dropClip(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

let atlas = null;
async function readAtlas(tex) {
  if (atlas) return atlas;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  atlas = { data, w: info.width, h: info.height };
  return atlas;
}

const GLOW = new Set(['Light', 'Lights']);

/** Every primitive: its atlas colours (or flat material colour) baked into COLOR_0, UVs dropped; two materials (lit, glow). */
async function bakeColours(doc) {
  const lit = doc.createMaterial('sushi').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const glow = doc.createMaterial('glow').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
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
      const isGlass = m?.getName() === 'Glass';
      const t = [0, 0];
      for (let i = 0; i < n; i++) {
        let rgb = [1, 1, 1];
        if (a && uv) {
          uv.getElement(i, t);
          const u = ((t[0] % 1) + 1) % 1, v = ((t[1] % 1) + 1) % 1;
          const x = Math.min(a.w - 1, Math.floor(u * a.w)), y = Math.min(a.h - 1, Math.floor(v * a.h));
          const k = (y * a.w + x) * 4;
          rgb = [srgbToLinear(a.data[k] / 255), srgbToLinear(a.data[k + 1] / 255), srgbToLinear(a.data[k + 2] / 255)];
        } else if (isGlass) rgb = [0.55, 0.75, 0.85];
        out[i * 3] = rgb[0] * f[0]; out[i * 3 + 1] = rgb[1] * f[1]; out[i * 3 + 2] = rgb[2] * f[2];
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer()));
      for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD_')) prim.setAttribute(sem, null);
      prim.setMaterial(m && GLOW.has(m.getName()) ? glow : lit);
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (m !== lit && m !== glow) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  return lit;
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
}

/** The skinned primitives of the named nodes joined into one. */
function joinNodes(doc, nodes) {
  const prims = [];
  for (const n of nodes) for (const p of n.getMesh().listPrimitives()) { normaliseSkinned(p); prims.push(p); }
  return prims.length === 1 ? prims[0] : joinPrimitives(prims);
}

/** Copies a primitive (from another document) into `doc`. */
function copyPrim(doc, p, mat, buf) {
  const out = doc.createPrimitive().setMaterial(mat);
  for (const sem of ['POSITION', 'NORMAL', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0']) {
    const a = p.getAttribute(sem);
    out.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized()).setBuffer(buf));
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(p.getIndices().getArray().slice()).setBuffer(buf));
  return out;
}

async function finish(io, doc, name, ratio) {
  const root = doc.getRoot();
  await doc.transform(weld(), dedup());
  if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.003, lockBorder: true }));
  await doc.transform(prune(), dedup());
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
  for (const b of root.listBuffers().slice(1)) b.dispose();
  const file = join(OUT, name + '.glb');
  await io.write(file, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  console.log(`${name.padEnd(16)} ${String(Math.round(statSync(file).size / 1024)).padStart(5)} KB  ${tris} tris  ${root.listAnimations().length} clips`);
}

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
await MeshoptSimplifier.ready;

function keepClips(doc) {
  for (const a of doc.getRoot().listAnimations()) if (!CLIPS.includes(a.getName())) dropClip(a);
}

// ---------------------------------------------------------------- the panda
{
  const doc = await io.read(join(src, 'characters-knife/Panda.gltf'));
  await bakeColours(doc);
  keepClips(doc);
  const names = { Panda: 'body', Headband: 'band', Knife: 'knife', Pan: 'pan' };
  for (const n of doc.getRoot().listNodes()) if (n.getMesh() && n.getSkin()) {
    for (const p of n.getMesh().listPrimitives()) normaliseSkinned(p);
    n.setName(names[n.getName().trim()] ?? n.getName());
  }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await finish(io, doc, 'panda');
}

// ---------------------------------------------------------------- the rabbits (one skeleton, seven bodies)
{
  const doc = await io.read(join(src, 'characters-knife/Rabbit_Bald.gltf'));
  const lit = await bakeColours(doc);
  keepClips(doc);
  const root = doc.getRoot();
  const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  const skin = skinned[0].getSkin();
  const parent = skinned[0].getParentNode();
  const buf = root.listBuffers()[0];
  for (const n of skinned) {
    const nm = n.getName().trim();
    if (nm === 'Knife' || nm === 'Pan') { n.setName(nm.toLowerCase()); for (const p of n.getMesh().listPrimitives()) normaliseSkinned(p); }
    else n.dispose();
  }
  for (const r of RABBITS) {
    const vdoc = await io.read(join(src, `characters/Rabbit_${r}.gltf`));
    await bakeColours(vdoc);
    const vn = vdoc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
    const joined = joinNodes(vdoc, vn);
    const mesh = doc.createMesh('r-' + r.toLowerCase()).addPrimitive(copyPrim(doc, joined, lit, buf));
    const node = doc.createNode('r-' + r.toLowerCase()).setMesh(mesh).setSkin(skin);
    parent.addChild(node);
  }
  await doc.transform(resample({ tolerance: 1e-4 }));
  await finish(io, doc, 'rabbits');
}

// ---------------------------------------------------------------- the static models
for (const [name, [file, ratio]] of Object.entries(STATIC)) {
  const doc = await io.read(join(src, file + '.gltf'));
  await bakeColours(doc);
  await finish(io, doc, name, ratio);
}

const total = readdirSync(OUT).filter((f) => f.endsWith('.glb')).reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
