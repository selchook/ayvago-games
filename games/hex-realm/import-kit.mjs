// Hex Realm: how the game's 3D assets were made. Kept as a record and for a re-import; not part of
// the build. Nothing from the source folders is run: the files are read as data and rewritten.
//
//   node games/hex-realm/import-kit.mjs <rpg dir> <retro-fantasy GLB dir> <hexagon-kit GLB dir> <node_modules>
//     <rpg dir>             the owner-shared Quaternius "RPG Characters" folder (Warrior.gltf ... License.txt)
//     <retro-fantasy dir>   kenney_retro-fantasy-kit/Models/GLB format (the owner's zip, unpacked)
//     <hexagon-kit dir>     kenney_hexagon-kit/Models/GLB format (the owner's zip, unpacked)
//     <node_modules>        with @gltf-transform/core + /extensions + /functions, meshoptimizer and sharp
//
// The six RPG heroes (public/assets/quaternius/rpg-characters/<class>.glb):
//   - every rigid part hung on a bone (the face, shoulder pads, belt, pouch, the weapon) is welded
//     into the skinned body as a rigid part of that bone, so a hero is one mesh and one draw call;
//   - the body's 1024 px texture and the weapon's 512 px one become one 512 x 768 JPEG atlas (the
//     body on top, the weapon below on the left) and the UVs are moved into it: one material;
//   - the clips the game plays are kept and named alike for every class (Idle_Attacking, Run, Hit),
//     the rest dropped, then resampled; the mesh is simplified to about half its triangles (meshopt)
//     and quantized (KHR_mesh_quantization).
// The two Kenney kits are copied as they are (only the models in RETRO / HEX and their textures).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const [rpg, retroDir, hexDir, nm] = process.argv.slice(2);
if (!rpg || !retroDir || !hexDir || !nm) throw new Error('usage: node import-kit.mjs <rpg dir> <retro dir> <hex dir> <node_modules>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, weld, joinPrimitives, quantize, simplify } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const ROOT = join(import.meta.dirname, '../../public/assets');
const OUT = join(ROOT, 'quaternius/rpg-characters');
mkdirSync(OUT, { recursive: true });

const CLASSES = ['warrior', 'rogue', 'ranger', 'monk', 'cleric', 'wizard'];
/** Clips kept (after renaming), per class on top of the common ones. */
const COMMON = ['Idle', 'Idle_Attacking', 'Run', 'Walk', 'Roll', 'Hit', 'Death', 'PickUp', 'Punch'];
const OWN = {
  warrior: ['Sword_Attack', 'Sword_Attack2'],
  rogue: ['Dagger_Attack', 'Dagger_Attack2'],
  ranger: ['Bow_Draw', 'Bow_Shoot'],
  monk: ['Attack', 'Attack2'],
  cleric: ['Spell1', 'Staff_Attack'],
  wizard: ['Spell1', 'Spell2', 'Staff_Attack'],
};
const RENAME = { Attacking_Idle: 'Idle_Attacking', RecieveHit: 'Hit' };

// ---------------------------------------------------------------- 4x4 matrices (column-major)
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function inv(a) {
  const o = new Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
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
const xform = (m, v, w) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * w);
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
function dropClip(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

/** The atlas: the body's texture on top (512 x 512), the weapon's below on the left (256 x 256). */
async function buildAtlas(doc) {
  const images = [...new Set(doc.getRoot().listMaterials().map((m) => m.getBaseColorTexture()).filter(Boolean))];
  const body = await sharp(Buffer.from(images[0].getImage())).resize(512, 512).removeAlpha().toBuffer();
  const parts = [{ input: body, left: 0, top: 0 }];
  let H = 512;
  if (images.length > 1) {
    const weapon = await sharp(Buffer.from(images[1].getImage())).resize(256, 256).removeAlpha().toBuffer();
    parts.push({ input: weapon, left: 0, top: 512 });
    H = 768;
  }
  const jpg = await sharp({ create: { width: 512, height: H, channels: 3, background: '#000000' } })
    .composite(parts).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  // where each source texture's (0..1) square lands in the atlas
  const place = new Map();
  place.set(images[0], { u0: 0, v0: 0, su: 1, sv: 512 / H });
  if (images[1]) place.set(images[1], { u0: 0, v0: 512 / H, su: 0.5, sv: 256 / H });
  return { jpg, place };
}

/** Moves every primitive's UVs into the atlas and gives it the one atlas material. */
function remapUVs(doc, place, mat) {
  let lo = Infinity, hi = -Infinity;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const tex = prim.getMaterial()?.getBaseColorTexture();
      const p = place.get(tex) ?? place.values().next().value;
      const uv = prim.getAttribute('TEXCOORD_0');
      const a = uv.getArray().slice();
      const out = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 2) {
        lo = Math.min(lo, a[i], a[i + 1]); hi = Math.max(hi, a[i], a[i + 1]);
        const u = Math.min(1, Math.max(0, a[i])), v = Math.min(1, Math.max(0, a[i + 1]));
        out[i] = p.u0 + u * p.su;
        out[i + 1] = p.v0 + v * p.sv;
      }
      prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(out).setBuffer(uv.getBuffer()));
      prim.setMaterial(mat);
    }
  }
  return [lo, hi];
}

/** Every rigid mesh hung on a bone becomes part of the skinned body, bound to that bone. */
function weldRigidParts(doc) {
  const root = doc.getRoot();
  const body = root.listNodes().find((n) => n.getSkin() && n.getMesh());
  const skin = body.getSkin();
  const joints = skin.listJoints();
  const bodyPrim = body.getMesh().listPrimitives()[0];
  const buf = bodyPrim.getAttribute('POSITION').getBuffer();
  for (const node of root.listNodes().filter((n) => n.getMesh() && !n.getSkin() && joints.includes(n.getParentNode()))) {
    const j = joints.indexOf(node.getParentNode());
    const ibm = new Array(16);
    skin.getInverseBindMatrices().getElement(j, ibm);
    const M = mul(inv(ibm), node.getMatrix());
    for (const wp of node.getMesh().listPrimitives()) {
      const pos = wp.getAttribute('POSITION'), nor = wp.getAttribute('NORMAL'), uv = wp.getAttribute('TEXCOORD_0');
      const n = pos.getCount();
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
      const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
      const v = [0, 0, 0], t = [0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v); P.set(xform(M, v, 1), i * 3);
        nor.getElement(i, v); N.set(norm(xform(M, v, 0)), i * 3);
        uv.getElement(i, t); U.set(t, i * 2);
        J[i * 4] = j; W[i * 4] = 1;
      }
      const prim = doc.createPrimitive().setMaterial(bodyPrim.getMaterial())
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(U).setBuffer(buf))
        .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf))
        .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(wp.getIndices().getArray())).setBuffer(buf));
      body.getMesh().addPrimitive(prim);
    }
    node.dispose();
  }
  // one primitive (matching attribute types first)
  const prims = body.getMesh().listPrimitives();
  for (const p of prims) {
    const jt = p.getAttribute('JOINTS_0');
    if (!(jt.getArray() instanceof Uint16Array)) jt.setArray(new Uint16Array(jt.getArray()));
    const wt = p.getAttribute('WEIGHTS_0');
    if (!(wt.getArray() instanceof Float32Array)) {
      const a = wt.getArray(), f = new Float32Array(a.length), s = a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : 1;
      for (let i = 0; i < a.length; i++) f[i] = a[i] / s;
      wt.setArray(f).setNormalized(false);
    }
    const ix = p.getIndices();
    if (!(ix.getArray() instanceof Uint32Array)) ix.setArray(new Uint32Array(ix.getArray()));
  }
  const joined = joinPrimitives(prims);
  for (const p of prims) body.getMesh().removePrimitive(p);
  body.getMesh().addPrimitive(joined);
}

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
for (const cls of CLASSES) {
  const file = cls[0].toUpperCase() + cls.slice(1);
  const doc = await io.read(join(rpg, file + '.gltf'));
  const root = doc.getRoot();
  const { jpg, place } = await buildAtlas(doc);
  const mat = doc.createMaterial(cls).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const tex = doc.createTexture(cls + '-atlas').setImage(new Uint8Array(jpg)).setMimeType('image/jpeg').setURI(cls + '.jpg');
  mat.setBaseColorTexture(tex);
  const [lo, hi] = remapUVs(doc, place, mat);
  weldRigidParts(doc);
  for (const m of root.listMaterials()) if (m !== mat) m.dispose();
  for (const t of root.listTextures()) if (t !== tex) t.dispose();
  // the clips: one name for each move in every class
  const names = root.listAnimations().map((a) => a.getName());
  const hasWeaponRun = names.includes('Run_Weapon');
  for (const a of root.listAnimations()) {
    let n = RENAME[a.getName()] ?? a.getName();
    if (cls === 'cleric' && n === 'Idle_Weapon') n = 'Idle_Attacking';
    if (hasWeaponRun && n === 'Run') { dropClip(a); continue; }
    if (n === 'Run_Weapon') n = 'Run';
    if (!COMMON.includes(n) && !OWN[cls].includes(n)) { dropClip(a); continue; }
    a.setName(n);
  }
  await MeshoptSimplifier.ready;
  await doc.transform(resample({ tolerance: 1e-4 }), weld(), dedup(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.003 }), prune());
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
  for (const b of root.listBuffers().slice(1)) b.dispose();
  const out = join(OUT, cls + '.glb');
  await io.write(out, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  console.log(`${cls.padEnd(8)} ${String(Math.round(statSync(out).size / 1024)).padStart(5)} KB  ${tris} tris  uv ${lo.toFixed(3)}..${hi.toFixed(3)}  clips ${root.listAnimations().map((a) => a.getName()).join(' ')}`);
}
writeFileSync(join(OUT, 'license.txt'), readFileSync(join(rpg, 'License.txt')));

// ---------------------------------------------------------------- the Kenney kits, copied as they are

/** Retro Fantasy Kit 2.0: the pieces the arenas are built from. */
export const RETRO = [
  'floor', 'floor-flat', 'floor-steps', 'wall', 'wall-half', 'wall-low', 'wall-detail', 'wall-door', 'wall-window', 'wall-gate',
  'wall-fortified', 'wall-fortified-gate', 'wall-fortified-window', 'wall-fortified-paint', 'wall-fortified-paint-gate',
  'wall-paint', 'wall-paint-window', 'column', 'column-damaged', 'column-wood', 'column-paint', 'tower', 'tower-base', 'tower-top',
  'tower-edge', 'tower-paint-base', 'battlement', 'battlement-corner-outer', 'bricks', 'barrels', 'detail-barrel', 'detail-crate',
  'detail-crate-small', 'detail-crate-ropes', 'fence-wood', 'tree-large', 'tree-shrub', 'wood-floor', 'wood-floor-railing',
  'dock-side', 'dock-corner', 'structure', 'structure-poles', 'pulley-crate', 'ladder', 'stairs-stone', 'overhang-round-railing',
];
const RETRO_TEX = ['barrel', 'cobblestone', 'cobblestoneAlternative', 'cobblestonePainted', 'details', 'fence', 'planks', 'roof', 'tree', 'water'];

/** Hexagon Kit 2.0: the overworld's tiles, rivers, roads, buildings and units. */
export const HEX = [
  'grass', 'grass-forest', 'grass-hill', 'stone', 'stone-hill', 'stone-mountain', 'stone-rocks', 'sand', 'sand-rocks',
  'water', 'water-rocks', 'water-island', 'dirt', 'dirt-lumber', 'river-straight', 'river-corner', 'river-corner-sharp',
  'river-end', 'bridge', 'path-straight', 'path-corner', 'path-corner-sharp', 'path-end', 'path-crossing',
  'path-intersectionA', 'path-intersectionB', 'path-intersectionC', 'path-intersectionD', 'path-intersectionE',
  'path-intersectionF', 'path-intersectionG', 'path-intersectionH', 'building-castle', 'building-village', 'building-market',
  'building-house', 'building-farm', 'building-sheep', 'building-mill', 'building-mine', 'building-wizard-tower',
  'building-tower', 'building-port', 'building-dock', 'building-walls', 'building-wall', 'building-watermill',
  'building-cabin', 'building-smelter', 'building-archery', 'unit-tree', 'unit-ship', 'unit-house', 'unit-wall-tower', 'unit-tower',
];

function copyKit(src, short, models, textures) {
  const dst = join(ROOT, 'kenney', short, 'models', 'gltf_format');
  mkdirSync(join(dst, 'Textures'), { recursive: true });
  for (const m of models) copyFileSync(join(src, m + '.glb'), join(dst, m.toLowerCase() + '.glb'));
  for (const t of textures) copyFileSync(join(src, 'Textures', t + '.png'), join(dst, 'Textures', t + '.png'));
  copyFileSync(join(src, '../../License.txt'), join(ROOT, 'kenney', short, 'license.txt'));
  console.log(`${short}: ${models.length} models, ${textures.length} textures`);
}
copyKit(retroDir, 'retro-fantasy-kit', RETRO, RETRO_TEX);
copyKit(hexDir, 'hexagon-kit', HEX, ['colormap']);
