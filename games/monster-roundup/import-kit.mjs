// Monster Roundup: how the game's models were made from three Quaternius packs the owner shared
// (Google Drive, CC0 1.0). Kept as a record and for a re-import; not part of the build. Nothing from
// the source folders is run: the OBJ/MTL files are read as text, the glTF files parsed as data.
//
//   node games/monster-roundup/import-kit.mjs <pack dir> <node_modules> [--only scifi|mech|monster]
//     <pack dir>      scifi/OBJ/ (Ultimate Modular Sci-Fi, OBJ + MTL), mechs/ (Animated Mech Pack,
//                     flat-colour glTF), monsters/big/ (Ultimate Monsters' Big set, glTF with the
//                     shared Atlas_Monsters.png), each pack's License.txt beside them
//     <node_modules>  with @gltf-transform/core + /extensions + /functions, meshoptimizer and sharp
//     --only          re-import one kind and leave the other files as they are
//
// Writes:
//   public/assets/quaternius/scifi-modular/scifi.glb   every station piece the game builds rooms from,
//       one root node each (source name), the pack's one flat MTL palette baked into vertex colours,
//       no normals (the game merges them flat-shaded), welded, the heavy props simplified, quantized;
//   public/assets/quaternius/mech-pack/<mech>.glb      Stan, Mike, Leela and George: flat material
//       colours baked into vertex colours, only the clips the game plays, simplified, quantized;
//   public/assets/quaternius/monsters/<monster>.glb    the twelve monsters of the pack's Big set, the
//       only ones with legs (UpperLeg / LowerLeg / Foot bones): the atlas baked into vertex colours
//       (no texture), simplified, quantized, skeleton and skin but no clips;
//   public/assets/quaternius/monsters/clips-a.glb, clips-b.glb   the Big set's clips, once: every Big
//       monster has the same 43-bone rig and the same keyframes, except the arms of the four that
//       hold something (Bunny's carrot, the Mushroom King's mushroom, the Ninja's and the Orc's
//       weapons: set B, from Bunny, ears included) and each body's own shoulder width (the game
//       moves every translation track by the bone's rest offset, figure.ts). Skeleton nodes and
//       clips only: no mesh; the finger bones' tracks are dropped (too small to see in play);
//   each folder's license.txt and docs/assets/quaternius-<pack>.txt (every file with its size).
//
// The pack's Blob and Flying sets (no legs), Demon, BlueDemon, Tribal, Ghost, Ghost_Skull and
// Orc_Skull (the owner's rule: no religious imagery) are not imported.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-kit.mjs <pack dir> <node_modules> [--only scifi|mech|monster]');
const onlyAt = process.argv.indexOf('--only');
const ONLY = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
const want = (k) => !ONLY || ONLY === k;
const req = createRequire(join(nm, 'x.js'));
const { Document, NodeIO, getBounds } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { prune, dedup, resample, simplify, weld, quantize } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');
await MeshoptSimplifier.ready;

const ROOT = join(import.meta.dirname, '../..');
const Q = join(ROOT, 'public/assets/quaternius');
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);

// ================================================================== the station kit (OBJ + MTL)

/** Piece → simplify ratio (1 keeps it as modelled). Floors and walls are drawn many times per level. */
const PIECES = {
  FloorTile_Basic: 0.5, FloorTile_Basic2: 0.5, FloorTile_Empty: 1, FloorTile_Side: 0.6, FloorTile_Corner: 0.6, FloorTile_InnerCorner: 0.7,
  FloorTile_Double_Hallway: 0.5,
  Wall_1: 0.45, Wall_2: 0.35, Wall_3: 0.45, Wall_4: 0.45, Wall_5: 0.45, Wall_Empty: 0.8,
  Window_Wall_SideA: 0.8, LongWindow_Wall_SideA: 0.8, SmallWindows_Wall_SideA: 0.6, ThreeWindows_Wall_SideA: 0.6,
  DoorSingle_Wall_SideA: 0.7, DoorDouble_Wall_SideA: 0.7, Door_Single: 0.35, Door_Double: 0.3,
  Column_1: 1, Column_2: 1, Column_3: 0.6, Column_Slim: 0.7,
  Pipes: 0.7, Details_Arrow: 1, Details_Hexagon: 1, Details_Plate_Large: 0.7, Details_Vent_1: 0.8, Details_Pipes_Long: 0.6,
  Props_Base: 0.7, Props_Capsule: 0.5, Props_Chest: 0.18, Props_Computer: 0.7, Props_ComputerSmall: 0.7, Props_ContainerFull: 0.18,
  Props_Crate: 0.2, Props_CrateLong: 0.2, Props_Laser: 0.5, Props_Pod: 0.45, Props_Shelf: 0.8, Props_Shelf_Tall: 0.8,
  Props_Teleporter_1: 0.6, Props_Teleporter_2: 0.5, Props_Vessel: 0.8, Props_Vessel_Short: 0.8, Props_Vessel_Tall: 0.8,
  Staircase: 0.8,
};

/** The pack's palette (every MTL shares it; Kd is linear). */
function palette(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mtl'))) {
    let cur = null;
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'newmtl') cur = t[1];
      else if (t[0] === 'Kd' && cur) out[cur] = t.slice(1, 4).map(Number);
    }
  }
  return out;
}

function weldMesh(pos, col, idx) {
  const map = new Map(), P = [], C = [], remap = new Uint32Array(pos.length / 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const key = Array.from(pos.subarray(v * 3, v * 3 + 3), (x) => x.toFixed(4)).join(',') + '|' + Array.from(col.subarray(v * 3, v * 3 + 3), (x) => x.toFixed(3)).join(',');
    let k = map.get(key);
    if (k === undefined) { k = P.length / 3; map.set(key, k); P.push(...pos.subarray(v * 3, v * 3 + 3)); C.push(...col.subarray(v * 3, v * 3 + 3)); }
    remap[v] = k;
  }
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  return { pos: new Float32Array(P), col: new Float32Array(C), idx: new Uint32Array(keep) };
}

function compact(m, idx) {
  const used = new Map(), P = [], C = [], I = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let k = used.get(idx[i]);
    if (k === undefined) { k = P.length / 3; used.set(idx[i], k); P.push(...m.pos.subarray(idx[i] * 3, idx[i] * 3 + 3)); C.push(...m.col.subarray(idx[i] * 3, idx[i] * 3 + 3)); }
    I[i] = k;
  }
  return { pos: new Float32Array(P), col: new Float32Array(C), idx: I };
}

/** Simplified with the colours weighed in, so colour borders (the orange trim) stay put. */
function simplifyPiece(m, ratio) {
  if (ratio >= 1 || m.idx.length < 90) return m;
  const target = Math.max(12, Math.floor((m.idx.length / 3) * ratio)) * 3;
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(m.idx, m.pos, 3, m.col, 3, [0.5, 0.5, 0.5], null, target, ratio <= 0.3 ? 0.04 : 0.012);
  return compact(m, idx);
}

const scifiLines = [];
async function importScifi() {
  const dir = join(src, 'scifi/OBJ');
  const kd = palette(dir);
  const doc = new Document();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  const buf = doc.createBuffer();
  const mat = doc.createMaterial('station').setMetallicFactor(0).setRoughnessFactor(1);
  const scene = doc.createScene('scifi');
  let total = 0;
  for (const [name, ratio] of Object.entries(PIECES)) {
    const V = [], P = [], C = [];
    let cur = null, before = 0;
    for (const line of readFileSync(join(dir, name + '.obj'), 'utf8').split('\n')) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'v') V.push(+t[1], +t[2], +t[3]);
      else if (t[0] === 'usemtl') cur = t[1];
      else if (t[0] === 'f') {
        const ids = t.slice(1).map((s) => { const k = parseInt(s.split('/')[0], 10); return k < 0 ? V.length / 3 + k : k - 1; });
        const c = kd[cur];
        if (!c) throw new Error(name + ': no colour for ' + cur);
        for (let i = 1; i + 1 < ids.length; i++) for (const v of [ids[0], ids[i], ids[i + 1]]) { P.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]); C.push(...c); }
        before += ids.length - 2;
      }
    }
    let m = weldMesh(new Float32Array(P), new Float32Array(C), Uint32Array.from({ length: P.length / 3 }, (_, i) => i));
    m = simplifyPiece(m, ratio);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let v = 0; v < m.pos.length; v += 3) { x0 = Math.min(x0, m.pos[v]); x1 = Math.max(x1, m.pos[v]); y0 = Math.min(y0, m.pos[v + 1]); y1 = Math.max(y1, m.pos[v + 1]); z0 = Math.min(z0, m.pos[v + 2]); z1 = Math.max(z1, m.pos[v + 2]); }
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buf))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(m.col).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.pos.length / 3 > 65535 ? m.idx : new Uint16Array(m.idx)).setBuffer(buf))
      .setMaterial(mat);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
    const after = m.idx.length / 3;
    total += after;
    scifiLines.push(`  ${name} x[${x0.toFixed(2)},${x1.toFixed(2)}] y[${y0.toFixed(2)},${y1.toFixed(2)}] z[${z0.toFixed(2)},${z1.toFixed(2)}] ${after} tris (source ${before})`);
  }
  await doc.transform(dedup(), prune(), quantize({ pattern: /^(POSITION|COLOR_0)$/, quantizePosition: 14, quantizeColor: 8 }));
  const out = join(Q, 'scifi-modular');
  mkdirSync(out, { recursive: true });
  const bin = await io.writeBinary(doc);
  writeFileSync(join(out, 'scifi.glb'), bin);
  copyFileSync(join(src, 'scifi/License.txt'), join(out, 'license.txt'));
  scifiLines.unshift(`quaternius/scifi-modular/scifi.glb ${Math.round(bin.length / 1024)}KB (${Object.keys(PIECES).length} pieces as root nodes, ${total} tris in all, vertex colours, no normals: flat-shaded, quantized; positions as modelled, pack units)`);
  console.log('scifi.glb', Math.round(bin.length / 1024), 'KB', total, 'tris');
}

// ================================================================== rigged figures (glTF)

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
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

/** Every primitive's colour (material factor × the atlas swatch its UV points at) baked into COLOR_0. */
async function bakeColours(doc, name) {
  const lit = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
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
}

function normaliseSkinned(p) {
  const jt = p.getAttribute('JOINTS_0');
  if (jt && !(jt.getArray() instanceof Uint16Array)) jt.setArray(new Uint16Array(jt.getArray()));
  const wt = p.getAttribute('WEIGHTS_0');
  if (wt && !(wt.getArray() instanceof Float32Array)) {
    const a = wt.getArray(), f = new Float32Array(a.length), scale = a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : 1;
    for (let i = 0; i < a.length; i++) f[i] = a[i] / scale;
    wt.setArray(f).setNormalized(false);
  }
}

function dropClip(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

const MECH_CLIPS = ['Idle', 'Walk', 'Run', 'Shoot', 'Pickup', 'HitRecieve_1', 'Death', 'Hello', 'Dance', 'Yes', 'Jump'];
/** The Big set's clips, all kept (shared by every monster, so they cost little). */
const BIG_CLIPS = ['Idle', 'Walk', 'Run', 'Punch', 'Weapon', 'HitReact', 'Death', 'Jump', 'Wave', 'Yes', 'No', 'Duck'];
/** Bones whose tracks the shared clips leave out: the fingers (a few centimetres at play scale). */
const FINGERS = /^(Pinky|Middle|Index|Thumb)\d/;

/** out name → [source path under the pack dir, clips, simplify ratio]; monsters ship without clips. */
const FIGURES = {
  mech: {
    stan: ['mechs/Stan', MECH_CLIPS, 0.5], mike: ['mechs/Mike', MECH_CLIPS, 0.5], leela: ['mechs/Leela', MECH_CLIPS, 0.8], george: ['mechs/George', MECH_CLIPS, 0.4],
  },
  monster: {
    frog: ['monsters/big/Frog', [], 0.5], bunny: ['monsters/big/Bunny', [], 0.42], monkroose: ['monsters/big/Monkroose', [], 0.45],
    dino: ['monsters/big/Dino', [], 0.5], birb: ['monsters/big/Birb', [], 0.48], fish: ['monsters/big/Fish', [], 0.42],
    ninja: ['monsters/big/Ninja', [], 0.45], cactoro: ['monsters/big/Cactoro', [], 0.42], yeti: ['monsters/big/Yeti', [], 0.45],
    orc: ['monsters/big/Orc', [], 0.4], alien: ['monsters/big/Alien', [], 0.38], 'mushroom-king': ['monsters/big/MushroomKing', [], 0.45],
  },
};
/** The shared clip files: out name → the monster whose skeleton and keyframes they keep. */
const CLIP_SETS = { 'clips-a': 'monsters/big/Alien', 'clips-b': 'monsters/big/Bunny' };
const OUTDIR = { mech: 'mech-pack', monster: 'monsters' };
const LICENSE = { mech: 'mechs/License.txt', monster: 'monsters/License.txt' };
const figLines = { mech: [], monster: [] };

async function importFigure(kind, out, [file, clips, ratio]) {
  const doc = await io.read(join(src, file + '.gltf'));
  await bakeColours(doc, out);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!clips.includes(a.getName())) dropClip(a);
  for (const n of root.listNodes()) if (n.getMesh() && n.getSkin()) for (const p of n.getMesh().listPrimitives()) normaliseSkinned(p);
  await doc.transform(resample({ tolerance: 1e-4 }), weld(), dedup());
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: true }));
  await doc.transform(prune(), dedup());
  const b = getBounds(root.listScenes()[0]);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeWeight: 8 }));
  for (const x of root.listBuffers().slice(1)) x.dispose();
  const dir = join(Q, OUTDIR[kind]);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, out + '.glb');
  await io.write(f, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  const size = [0, 1, 2].map((k) => (b.max[k] - b.min[k]).toFixed(2)).join('x');
  const cl = root.listAnimations().map((a) => {
    let end = 0;
    for (const s of a.listSamplers()) { const t = s.getInput().getArray(); end = Math.max(end, t[t.length - 1]); }
    return `${a.getName()}:${end.toFixed(2)}`;
  });
  const kb = Math.round(statSync(f).size / 1024);
  figLines[kind].push(`quaternius/${OUTDIR[kind]}/${out}.glb ${kb}KB ${size} (min y ${b.min[1].toFixed(2)}) ${tris} tris${cl.length ? ' clips: ' + cl.join(' ') : ''}`);
  console.log(`${out.padEnd(18)} ${String(kb).padStart(5)} KB  ${tris} tris  ${cl.length} clips`);
}

/** One shared clip file: the skeleton's nodes and the clips, no mesh, no skin, no finger tracks. */
async function importClips(out, file) {
  const doc = await io.read(join(src, file + '.gltf'));
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (n.getMesh()) { n.setMesh(null); n.setSkin(null); }
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const a of root.listAnimations()) {
    if (!BIG_CLIPS.includes(a.getName())) { dropClip(a); continue; }
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode();
      if (node && FINGERS.test(node.getName())) { const smp = ch.getSampler(); ch.dispose(); smp.dispose(); }
    }
  }
  await doc.transform(resample({ tolerance: 2e-4 }), dedup(), prune());
  for (const x of root.listBuffers().slice(1)) x.dispose();
  const f = join(Q, 'monsters', out + '.glb');
  await io.write(f, doc);
  const cl = root.listAnimations().map((a) => {
    let end = 0;
    for (const s of a.listSamplers()) { const t = s.getInput().getArray(); end = Math.max(end, t[t.length - 1]); }
    return `${a.getName()}:${end.toFixed(2)}`;
  });
  const kb = Math.round(statSync(f).size / 1024);
  figLines.monster.push(`quaternius/monsters/${out}.glb ${kb}KB (no mesh: ${root.listNodes().length} skeleton nodes, ${root.listAnimations().reduce((n, a) => n + a.listChannels().length, 0)} tracks) clips: ${cl.join(' ')}`);
  console.log(`${out.padEnd(18)} ${String(kb).padStart(5)} KB  ${cl.length} clips`);
}

if (want('scifi')) await importScifi();
for (const kind of Object.keys(FIGURES)) {
  if (!want(kind)) continue;
  for (const [out, spec] of Object.entries(FIGURES[kind])) await importFigure(kind, out, spec);
  if (kind === 'monster') for (const [out, file] of Object.entries(CLIP_SETS)) await importClips(out, file);
  copyFileSync(join(src, LICENSE[kind]), join(Q, OUTDIR[kind], 'license.txt'));
}

// ================================================================== the asset lists
const DOCS = join(ROOT, 'docs/assets');
if (want('scifi')) writeFileSync(join(DOCS, 'quaternius-scifi-modular.txt'), [
  '# Quaternius Ultimate Modular Sci-Fi (Feb 2021, CC0 1.0): what public/assets/quaternius/scifi-modular holds',
  '# (games/monster-roundup/import-kit.mjs). Floor tiles are 2 × 2, walls 4 long and 4.43 tall (pack units).',
  ...scifiLines,
  'quaternius/scifi-modular/license.txt (the pack\'s License.txt: CC0 1.0)',
  '',
].join('\n'));
if (want('mech')) writeFileSync(join(DOCS, 'quaternius-mech-pack.txt'), [
  '# Quaternius Animated Mech Pack (March 2021, CC0 1.0): what public/assets/quaternius/mech-pack holds',
  '# (games/monster-roundup/import-kit.mjs). Each line: file, size, box in model units (x × y × z), triangles, clips',
  '# with their length in seconds. Mechs face +z.',
  ...figLines.mech.sort(),
  'quaternius/mech-pack/license.txt (the pack\'s License.txt: CC0 1.0)',
  '',
].join('\n'));
if (want('monster')) writeFileSync(join(DOCS, 'quaternius-monsters.txt'), [
  '# Quaternius Ultimate Monsters (Oct 2022, CC0 1.0): what public/assets/quaternius/monsters holds',
  '# (games/monster-roundup/import-kit.mjs): the twelve Big monsters (the only ones with legs), mesh and skeleton',
  '# without clips (file, size, rest box in model units x × y × z, triangles), and the two shared clip files',
  '# (clips-a: every Big monster but bunny, mushroom-king, ninja and orc, which take clips-b), with each clip\'s',
  '# length in seconds. Monsters face +z and stand on y = 0; the rest pose is a T-pose (arms out along x).',
  ...figLines.monster.sort(),
  'quaternius/monsters/license.txt (the pack\'s License.txt: CC0 1.0)',
  '',
].join('\n'));
let total = 0;
for (const d of ['scifi-modular', 'mech-pack', 'monsters']) for (const f of readdirSync(join(Q, d))) if (f.endsWith('.glb')) total += statSync(join(Q, d, f)).size;
console.log('total', (total / 1024 / 1024).toFixed(2), 'MB');
