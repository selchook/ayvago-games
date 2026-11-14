// Skull Isle: how public/assets/quaternius/pirate-kit/*.glb were made from Quaternius's Pirate Kit
// (CC0, the .gltf files of the official Google Drive folder, buffers embedded as data URIs, one
// shared 1024 px flat-colour atlas). Kept as a record and for a re-import; not part of the build.
//
//   node games/skull-isle/import-kit.mjs <dir with the .gltf files> <node_modules with
//        @gltf-transform/core + /functions, meshoptimizer and sharp>
//
// What it does to every model it imports (only the ones the game loads, see MODELS):
//   - bakes the atlas into vertex colours: every vertex takes the colour of the 32 px swatch its
//     UV points at (the kit is flat colours), so no texture is left and every model can share one
//     vertex-colour material in the game (one shader program, no 1024 px texture per model);
//   - the characters' hand-held weapon (a separate mesh under a finger bone) is welded into the
//     skinned body as a rigid part of that bone, so a character is one mesh and one draw call;
//     Henry's lute becomes Captain Barbarossa's cutlass;
//   - drops the animation clips the game does not play, resamples the rest (drops redundant keys);
//   - simplifies the heavy scenery (cliffs, houses, the large ship) and welds, dedups and prunes;
//   - quantizes (KHR_mesh_quantization, read by three.js).
// Extra models cut out of the characters: `parrot` (Ernest, Barbarossa's parrot, in its bind pose)
// and `cutlass` (Barbarossa's sword).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-kit.mjs <gltf dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, simplify, weld, joinPrimitives, quantize } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const OUT = join(import.meta.dirname, '../../public/assets/quaternius/pirate-kit');
mkdirSync(OUT, { recursive: true });

const HERO_CLIPS = ['Death', 'Duck', 'HitReact', 'Idle', 'Run', 'Sword', 'Punch', 'Wave', 'Yes', 'Jump'];
const FOE_CLIPS = ['Death', 'HitReact', 'Idle', 'Run', 'Walk', 'Sword', 'Punch', 'Jump', 'Yes', 'Duck'];

/** out name → source and treatment. */
const MODELS = {
  anne: { file: 'Characters_Anne', clips: HERO_CLIPS },
  henry: { file: 'Characters_Henry', clips: HERO_CLIPS, weapon: 'cutlass' },
  mako: { file: 'Characters_Mako', clips: HERO_CLIPS },
  sharky: { file: 'Characters_Sharky', clips: HERO_CLIPS },
  barbarossa: { file: 'Characters_Captain_Barbarossa', clips: HERO_CLIPS },
  skeleton: { file: 'Characters_Skeleton', clips: FOE_CLIPS },
  headless: { file: 'Characters_Skeleton_Headless', clips: FOE_CLIPS },
  shark: { file: 'Characters_Shark', clips: ['Swim', 'Swim_Bite', 'Swim_Fast'] },
  tentacle: { file: 'Characters_Tentacle', clips: ['Tentacle_Attack', 'Tentacle_Attack2', 'Tentacle_Idle', 'Tentacle_Poke'] },
  'ship-large': { file: 'Ship_Large', ratio: 0.45 },
  'ship-small': { file: 'Ship_Small', ratio: 0.6 },
  dock: { file: 'Environment_Dock' },
  'dock-broken': { file: 'Environment_Dock_Broken' },
  palm1: { file: 'Environment_PalmTree_1' },
  palm2: { file: 'Environment_PalmTree_2' },
  palm3: { file: 'Environment_PalmTree_3' },
  rock: { file: 'Environment_Rock_2', ratio: 0.5 },
  cliff1: { file: 'Environment_Cliff1', ratio: 0.45 },
  cliff3: { file: 'Environment_Cliff3', ratio: 0.3 },
  house1: { file: 'Environment_House1', ratio: 0.5 },
  house2: { file: 'Environment_House2', ratio: 0.6 },
  house3: { file: 'Environment_House3', ratio: 0.5 },
  sawmill: { file: 'Environment_Sawmill' },
  bones: { file: 'Environment_LargeBones' },
  skulls: { file: 'Environment_Skulls', ratio: 0.6 },
  barrel: { file: 'Prop_Barrel' },
  'chest-closed': { file: 'Prop_Chest_Closed' },
  'chest-gold': { file: 'Prop_Chest_Gold', ratio: 0.4 },
  coins: { file: 'Prop_Coins', ratio: 0.5 },
  goldbag: { file: 'Prop_GoldBag', ratio: 0.4 },
  fish: { file: 'Prop_Fish_Mackerel' },
  skull: { file: 'Prop_Skull' },
  cannon: { file: 'Prop_Cannon', ratio: 0.6 },
  anchor: { file: 'Prop_Anchor' },
  'bucket-fishes': { file: 'Prop_Bucket_Fishes', ratio: 0.4 },
  coin: { file: 'UI_Gold', ratio: 0.6 },
  pistol: { file: 'Weapon_Pistol' },
  sword: { file: 'Weapon_Sword_1' },
};

/** Where the cutlass sits in Henry's hand, relative to the lute it replaces (column-major). */
const CUTLASS_GRIP = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// ---------------------------------------------------------------- 4×4 matrices (column-major)
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function inv(m) {
  const a = m, o = new Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const d = 1 / det;
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
  return o;
}
/** Drops an animation with its channels and samplers (their accessors are pruned after). */
function dropClip(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
const xform = (m, v, w) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * w);
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

// ---------------------------------------------------------------- per-model steps

let atlas = null;
async function readAtlas(tex) {
  if (atlas) return atlas;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  atlas = { data, w: info.width, h: info.height };
  return atlas;
}

/** Every primitive: its atlas colours (or flat material colour) baked into COLOR_0, UVs dropped, one material. */
async function bakeColours(doc, mat) {
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
      const col = doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer());
      prim.setAttribute('COLOR_0', col);
      if (uv) prim.setAttribute('TEXCOORD_0', null);
      prim.setMaterial(mat);
    }
  }
  for (const m of doc.getRoot().listMaterials()) if (m !== mat) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
}

/** World matrix of a node. */
function world(node) {
  let m = node.getMatrix();
  for (let p = node.getParentNode(); p; p = p.getParentNode()) m = mul(p.getMatrix(), m);
  return m;
}

/**
 * The weapon mesh under a finger bone becomes part of the skinned body: its vertices moved into
 * the body's bind space and bound to that bone with weight 1, then joined with the body.
 * `replace`: another weapon mesh (and its own colours) in the same hand.
 */
function weldWeapon(doc, replaceWith) {
  const root = doc.getRoot();
  const body = root.listNodes().find((n) => n.getSkin() && n.getMesh());
  const skin = body.getSkin();
  const joints = skin.listJoints();
  const weaponNode = root.listNodes().find((n) => n.getMesh() && !n.getSkin() && joints.includes(n.getParentNode()));
  if (!weaponNode) return;
  const bone = weaponNode.getParentNode();
  const j = joints.indexOf(bone);
  const ibm = new Array(16);
  skin.getInverseBindMatrices().getElement(j, ibm);
  let local = weaponNode.getMatrix();
  let wPrims = weaponNode.getMesh().listPrimitives();
  if (replaceWith) {
    // the replacement sits in the same grip: its handle at the old weapon's origin
    local = mul(local, replaceWith.offset);
    wPrims = replaceWith.prims;
  }
  const M = mul(inv(ibm), local);
  const bodyPrim = body.getMesh().listPrimitives()[0];
  const buf = bodyPrim.getAttribute('POSITION').getBuffer();
  for (const wp of wPrims) {
    const pos = wp.getAttribute('POSITION'), nor = wp.getAttribute('NORMAL'), col = wp.getAttribute('COLOR_0');
    const n = pos.getCount();
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
    const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v); P.set(xform(M, v, 1), i * 3);
      nor.getElement(i, v); N.set(norm(xform(M, v, 0)), i * 3);
      col.getElement(i, v); C.set(v, i * 3);
      J[i * 4] = j; W[i * 4] = 1;
    }
    const idx = wp.getIndices();
    const prim = doc.createPrimitive().setMaterial(bodyPrim.getMaterial())
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(C).setBuffer(buf))
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx.getArray())).setBuffer(buf));
    body.getMesh().addPrimitive(prim);
  }
  weaponNode.dispose();
}

/** All skinned primitives of the body joined into one (same material and skin). */
function joinBody(doc) {
  const root = doc.getRoot();
  const bodies = root.listNodes().filter((n) => n.getSkin() && n.getMesh());
  const main = bodies[0];
  const prims = [];
  for (const b of bodies) for (const p of b.getMesh().listPrimitives()) prims.push(p);
  // matching attribute types (the kit's JOINTS_0 are bytes or shorts)
  for (const p of prims) {
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
  const joined = joinPrimitives(prims);
  const mesh = main.getMesh();
  for (const p of mesh.listPrimitives()) mesh.removePrimitive(p);
  mesh.addPrimitive(joined);
  for (const b of bodies) if (b !== main) b.dispose();
}

/** A static copy of a mesh (in its own/bind space), as a new document. */
async function extractStatic(io, file, nodeName, name) {
  const doc = await io.read(join(src, file + '.gltf'));
  const mat = doc.createMaterial('pirate').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  await bakeColours(doc, mat);
  const root = doc.getRoot();
  const keep = root.listNodes().find((n) => n.getName().trim() === nodeName);
  const scene = root.listScenes()[0];
  const node = doc.createNode(name).setMesh(keep.getMesh());
  for (const c of scene.listChildren()) scene.removeChild(c);
  scene.addChild(node);
  for (const p of keep.getMesh().listPrimitives()) { p.setAttribute('JOINTS_0', null); p.setAttribute('WEIGHTS_0', null); }
  for (const a of root.listAnimations()) dropClip(a);
  for (const s of root.listSkins()) s.dispose();
  for (const n of root.listNodes()) if (n !== node) n.dispose();
  for (const m of root.listMeshes()) if (m !== node.getMesh()) m.dispose();
  return doc;
}

async function finish(io, doc, name, ratio) {
  const root = doc.getRoot();
  await doc.transform(weld(), dedup());
  if (ratio) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: true }));
  await doc.transform(prune(), dedup());
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
  for (const b of root.listBuffers().slice(1)) b.dispose();
  const file = join(OUT, name + '.glb');
  await io.write(file, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  console.log(`${name.padEnd(14)} ${String(Math.round(statSync(file).size / 1024)).padStart(5)} KB  ${tris} tris  ${root.listAnimations().length} clips`);
}

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
await MeshoptSimplifier.ready;

// Barbarossa's cutlass and parrot as their own static models
const cutlassDoc = await extractStatic(io, 'Characters_Captain_Barbarossa', 'Weapon_Cutlass', 'cutlass');
const cutlassPrims = cutlassDoc.getRoot().listMeshes()[0].listPrimitives();
await finish(io, await extractStatic(io, 'Characters_Captain_Barbarossa', 'Weapon_Cutlass', 'cutlass'), 'cutlass');
await finish(io, await extractStatic(io, 'Characters_Captain_Barbarossa', 'Ernest', 'parrot'), 'parrot');

for (const [name, o] of Object.entries(MODELS)) {
  const doc = await io.read(join(src, o.file + '.gltf'));
  const root = doc.getRoot();
  const mat = doc.createMaterial('pirate').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  await bakeColours(doc, mat);
  if (o.clips) {
    for (const a of root.listAnimations()) if (!o.clips.includes(a.getName())) dropClip(a);
    const skinned = root.listNodes().some((n) => n.getSkin());
    if (skinned && root.listNodes().some((n) => n.getMesh() && !n.getSkin())) {
      let replace = null;
      if (o.weapon === 'cutlass') {
        // copy the cutlass primitives into this document (the lute's grip, turned to point up the arm)
        const prims = cutlassPrims.map((p) => {
          const copy = doc.createPrimitive();
          for (const sem of ['POSITION', 'NORMAL', 'COLOR_0']) {
            const a = p.getAttribute(sem);
            copy.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()));
          }
          copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(p.getIndices().getArray().slice()));
          return copy;
        });
        replace = { prims, offset: CUTLASS_GRIP };
      }
      weldWeapon(doc, replace);
    }
    if (skinned) joinBody(doc);
    await doc.transform(resample({ tolerance: 1e-4 }));
  }
  await finish(io, doc, name, o.ratio);
}
