// Hex Realm 1.4: how the overworld's village models were made. Kept as a record and for a re-import;
// not part of the build. Nothing from the source folder is run: the files are read as text and rewritten.
//
//   node games/hex-realm/import-village-pack.mjs <pack dir> <node_modules>
//     <pack dir>      Quaternius "Medieval Village Pack" (2020): its Buildings/OBJ and Props/OBJ files
//                     (each .obj with its .mtl) in one folder, and License.txt (CC0 1.0)
//     <node_modules>  with @gltf-transform/core + /extensions + /functions and meshoptimizer (1.x)
//
// Writes public/assets/quaternius/medieval-village-pack/village-pack.glb (and its license.txt), every
// model in BUILDINGS and PROPS under a root node of its own (source) name, as import-scenery.mjs does
// for the Ultimate Nature Pack, and the file list docs/assets/quaternius-medieval-village-pack.txt:
//   - the flat MTL colours (Blender 2.79's Kd, linear) baked into vertex colours, a little brighter
//     for the map's light; the windows lit warm, as in the pack's preview;
//   - one primitive per model, no normals (the map gives every triangle its own when it merges), so
//     vertices weld; simplified hard (the map draws a house about 0.33 units across, so its bricks,
//     shingles and trim are a pixel or two): see simplify() and simplifyProp();
//   - centred on its footprint (x/z), standing on y = 0 as modelled, the front towards +z; positions
//     and colours quantized (KHR_mesh_quantization).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [dir, nm] = process.argv.slice(2);
if (!dir || !nm) throw new Error('usage: node import-village-pack.mjs <pack dir> <node_modules>');
const req = createRequire(join(nm, 'x.js'));
const { Document, NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { quantize, prune, dedup } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
await MeshoptSimplifier.ready;

const OUT = join(import.meta.dirname, '../../public/assets/quaternius/medieval-village-pack');

/**
 * Buildings: name → triangle ratio, simplified colour by colour (simplify()). Props: name → ratio,
 * simplified whole with their colours as attributes (simplifyProp()): on the map a barrel is a few
 * pixels, so its staves and hoops can go.
 */
const BUILDINGS = { House_1: 0.15, House_2: 0.15, Inn: 0.15, Mill: 0.15, Sawmill: 0.15, Blacksmith: 0.15, Bell_Tower: 0.15, Stable: 0.15 };
const PROPS = {
  MarketStand_1: 0.3, MarketStand_2: 0.3, Cart: 0.15, Well: 0.16, Gazebo: 0.4, Fence: 0.5, Hay: 0.2, Barrel: 0.12, Crate: 0.1,
  Bags: 0.15, Package_1: 0.2, Bench_1: 0.35, Bonfire: 0.25, Cauldron: 0.12, Rock_1: 1, Rock_2: 1, Rock_3: 1,
};
/** Buildings: loose stone smaller than this (bricks, the stones round a door; model units) is dropped. */
const STONE_PRUNE = 0.15;
/** Buildings' timber: loose bits smaller than this dropped, and the simplifier's error (of the model's size). */
const WOOD_PRUNE = 0.03, WOOD_ERROR = 0.02;

/** Colours: Kd × BRIGHT, then a touch more saturated; WINDOWS for the glass. */
const BRIGHT = 1.45, SAT = 1.15;
const WINDOWS = [0.95, 0.62, 0.2];

function parseMtl(text) {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'newmtl') cur = t[1];
    else if (t[0] === 'Kd' && cur) {
      if (cur === 'Windows') { out[cur] = WINDOWS; continue; }
      const c = t.slice(1, 4).map((v) => Number(v) * BRIGHT);
      const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      out[cur] = c.map((v) => Math.max(0, Math.min(1, l + (v - l) * SAT)));
    }
  }
  return out;
}

/** Welds vertices that match in position and colour; drops triangles that welded flat. */
function weld(pos, col, idx) {
  const map = new Map(), P = [], C = [], remap = new Uint32Array(pos.length / 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const key = Array.from(pos.subarray(v * 3, v * 3 + 3), (x) => x.toFixed(5)).join(',') + '|' + Array.from(col.subarray(v * 3, v * 3 + 3), (x) => x.toFixed(3)).join(',');
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

/** Keeps only the vertices the index list uses. */
function compact(m, idx) {
  const used = new Map(), P = [], C = [];
  const I = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let k = used.get(idx[i]);
    if (k === undefined) { k = P.length / 3; used.set(idx[i], k); P.push(...m.pos.subarray(idx[i] * 3, idx[i] * 3 + 3)); C.push(...m.col.subarray(idx[i] * 3, idx[i] * 3 + 3)); }
    I[i] = k;
  }
  return { pos: new Float32Array(P), col: new Float32Array(C), idx: I };
}

/**
 * One colour's triangles, simplified by what they are:
 *   - roof tiles (separate shingles): the sloppy simplifier merges what lies close, so a roof of
 *     shingles becomes one roof;
 *   - stone (separate bricks round the walls and doors): loose parts smaller than STONE_PRUNE pruned,
 *     the rest simplified;
 *   - wood (the timber frame, the mill's sails: thin beams) simplified within a tight error, so no
 *     beam folds flat;
 *   - the rest (plaster, glass, the bell, the mill's ivy) as modelled, or lightly simplified when heavy.
 */
function simplify(m, ratio, kind) {
  const n = m.idx.length / 3;
  if (n <= 60 || ratio >= 1 || (kind === 'other' && n < 200)) return m;
  const scale = MeshoptSimplifier.getScale(m.pos, 3);
  let idx = m.idx;
  if (kind === 'roof') {
    [idx] = MeshoptSimplifier.simplifySloppy(idx, m.pos, 3, null, Math.min(idx.length, Math.max(60, Math.floor(n * ratio)) * 3), 1);
  } else if (kind === 'stone') {
    idx = MeshoptSimplifier.simplifyPrune(idx, m.pos, 3, STONE_PRUNE / scale);
    [idx] = MeshoptSimplifier.simplify(idx, m.pos, 3, Math.min(idx.length, Math.max(36, Math.floor(n * ratio)) * 3), 0.01);
  } else {
    if (kind === 'wood') idx = MeshoptSimplifier.simplifyPrune(idx, m.pos, 3, WOOD_PRUNE / scale);
    [idx] = MeshoptSimplifier.simplify(idx, m.pos, 3, Math.min(idx.length, Math.max(36, Math.floor(n * ratio * 2)) * 3), WOOD_ERROR);
  }
  return compact(m, idx);
}
/** A prop: simplified whole, its colours weighed in, so colours keep their borders. */
function simplifyProp(m, ratio) {
  if (ratio >= 1 || m.idx.length < 90) return m;
  const target = Math.max(12, Math.floor((m.idx.length / 3) * ratio)) * 3;
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(m.idx, m.pos, 3, m.col, 3, [0.6, 0.6, 0.6], null, target, 0.05);
  return compact(m, idx);
}
const kindOf = (mat) => (/^Roof/.test(mat) ? 'roof' : /^Stone/.test(mat) ? 'stone' : /Wood/.test(mat) ? 'wood' : 'other');

const doc = new Document();
doc.createExtension(KHRMeshQuantization).setRequired(true);
const buf = doc.createBuffer();
const mat = doc.createMaterial('Color').setMetallicFactor(0).setRoughnessFactor(1);
const scene = doc.createScene('village-pack');
const lines = [], listing = [];
let total = 0;
for (const [name, ratio] of [...Object.entries(BUILDINGS), ...Object.entries(PROPS)]) {
  const prop = name in PROPS;
  const kd = parseMtl(readFileSync(join(dir, name + '.mtl'), 'utf8'));
  const V = [], byColour = new Map();
  let byColourTris = 0;
  let cur = null;
  for (const line of readFileSync(join(dir, name + '.obj'), 'utf8').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') V.push(+t[1], +t[2], +t[3]);
    else if (t[0] === 'usemtl') cur = t[1];
    else if (t[0] === 'f') {
      const ids = t.slice(1).map((s) => { const k = parseInt(s.split('/')[0], 10); return k < 0 ? V.length / 3 + k : k - 1; });
      if (!kd[cur]) throw new Error(name + ': no colour for ' + cur);
      const list = byColour.get(cur) ?? [];
      for (let i = 1; i + 1 < ids.length; i++) for (const v of [ids[0], ids[i], ids[i + 1]]) list.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]);
      byColour.set(cur, list);
      byColourTris += ids.length - 2;
    }
  }
  // a building colour by colour (no colour bleeds into the next), a prop whole; then one primitive
  const P = [], C = [], I = [];
  for (const [mname, list] of byColour) {
    const pos = new Float32Array(list), col = new Float32Array(list.length);
    for (let i = 0; i < col.length; i += 3) col.set(kd[mname], i);
    let g = weld(pos, col, Uint32Array.from({ length: pos.length / 3 }, (_, i) => i));
    if (!prop) g = simplify(g, ratio, kindOf(mname));
    const base = P.length / 3;
    P.push(...g.pos); C.push(...g.col);
    for (const i of g.idx) I.push(i + base);
  }
  let m = { pos: new Float32Array(P), col: new Float32Array(C), idx: new Uint32Array(I) };
  const before = byColourTris;
  if (prop) m = simplifyProp(weld(m.pos, m.col, m.idx), ratio);
  // centred on its footprint
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
  for (let v = 0; v < m.pos.length; v += 3) { x0 = Math.min(x0, m.pos[v]); x1 = Math.max(x1, m.pos[v]); y1 = Math.max(y1, m.pos[v + 1]); z0 = Math.min(z0, m.pos[v + 2]); z1 = Math.max(z1, m.pos[v + 2]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let v = 0; v < m.pos.length; v += 3) { m.pos[v] -= cx; m.pos[v + 2] -= cz; }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(m.col).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.pos.length / 3 > 65535 ? m.idx : new Uint16Array(m.idx)).setBuffer(buf))
    .setMaterial(mat);
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  const after = m.idx.length / 3;
  total += after;
  lines.push(`${name} ${before}→${after} tris, ${(x1 - x0).toFixed(2)} x ${y1.toFixed(2)} x ${(z1 - z0).toFixed(2)}`);
  listing.push(`  ${name} ${(x1 - x0).toFixed(2)}x${y1.toFixed(2)}x${(z1 - z0).toFixed(2)} ${after} tris (source ${before}), ${prop ? 'prop' : 'building'}, colours: ${[...byColour.keys()].join(' ')}`);
}
await doc.transform(dedup(), prune(), quantize({ pattern: /^(POSITION|COLOR_0)$/, quantizePosition: 14, quantizeColor: 8 }));
const bin = await new NodeIO().registerExtensions([KHRMeshQuantization]).writeBinary(doc);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'village-pack.glb'), bin);
copyFileSync(join(dir, 'License.txt'), join(OUT, 'license.txt'));
console.log(lines.join('\n'));
// the pack's file list (docs/assets)
writeFileSync(join(import.meta.dirname, '../../docs/assets/quaternius-medieval-village-pack.txt'), [
  `quaternius/medieval-village-pack/village-pack.glb ${Math.round(bin.length / 1024)}KB (${Object.keys(BUILDINGS).length + Object.keys(PROPS).length} models as root nodes, ${total} tris in all, vertex colours, no normals: flat-shaded, quantized)`,
  'quaternius/medieval-village-pack/license.txt (the pack\'s License.txt: CC0 1.0)',
  '  model size (x × y × z, pack units; centred on x/z, standing on y = 0, front towards +z), triangles, source triangles, kind, MTL colours:',
  ...listing,
  '',
].join('\n'));
console.log('total', total, 'tris; village-pack.glb', bin.length, 'bytes (' + (bin.length / 1024).toFixed(1) + ' KB)');
