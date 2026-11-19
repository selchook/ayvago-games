// Hex Realm 1.3: how the battle scenery kits were made. Kept as a record and for a re-import; not
// part of the build. Nothing from the source folders is run: the files are read as data and rewritten.
//
//   node games/hex-realm/import-scenery.mjs <village glTF dir> <nature OBJ dir> <node_modules>
//     <village glTF dir>  Quaternius "Medieval Village MegaKit [Standard]"/glTF (CC0 1.0, License_Standard.txt)
//     <nature OBJ dir>    Quaternius "Ultimate Nature Pack"/OBJ (CC0 1.0, License.txt)
//     <node_modules>      with @gltf-transform/core + /extensions + /functions, meshoptimizer and sharp
//
// Writes one GLB per kit, each model under a root node of its own (source) name:
//   public/assets/quaternius/medieval-village/village.glb
//     - only the pieces in VILLAGE; every primitive keeps its UVs (the kit's textures tile) and one
//       of ten materials named after its texture layer (WoodTrim, Plaster, Brick, UnevenBrick, RockTrim,
//       RoundTiles, RedBrick, Metal, Vine, Glass); WoodTrim_Wear draws with WoodTrim's colours;
//     - the 2048 px PBR sets become 256 px base colours only (JPEG; the vine leaf a green PNG with
//       its alpha), each embedded once; normal, roughness and ORM maps and the second UV set are dropped;
//   public/assets/quaternius/nature-pack/nature.glb
//     - only the models in NATURE, the MTL colours (Blender 2.79's Kd, linear, × 1.5 and a quarter
//       more saturated for the arenas' light) baked into vertex colours, one primitive per model, no texture;
//   - no normals in either (the game draws the scenery flat-shaded), so vertices weld; the heavy
//     pieces are simplified (meshopt, UVs or colours kept as attributes); positions and colours are
//     quantized (KHR_mesh_quantization), UVs stay float (they repeat past 0…1).
// The game (scenery.ts) packs the ten layers into one array texture at run time.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const [villageDir, natureDir, nm] = process.argv.slice(2);
if (!villageDir || !natureDir || !nm) throw new Error('usage: node import-scenery.mjs <village glTF dir> <nature OBJ dir> <node_modules>');
const req = createRequire(join(nm, 'x.js'));
const { Document, NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { quantize, prune, dedup } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');
await MeshoptSimplifier.ready;

const ROOT = join(import.meta.dirname, '../../public/assets/quaternius');

/** Village pieces: name → simplify ratio (1: as modelled). */
const VILLAGE = {
  Wall_Plaster_Straight: 1, Wall_Plaster_Window_Wide_Round: 1, Wall_Plaster_Window_Thin_Round: 1, Wall_Plaster_Door_Round: 1,
  Wall_Plaster_WoodGrid: 1, Wall_UnevenBrick_Straight: 1, Wall_UnevenBrick_Window_Thin_Round: 1, Wall_UnevenBrick_Window_Wide_Round: 1,
  Wall_UnevenBrick_Door_Round: 1, Corner_Exterior_Wood: 1,
  Floor_Brick: 1, Floor_RedBrick: 1, Floor_UnevenBrick: 1, Floor_WoodDark: 1, Floor_WoodLight: 1,
  Door_4_Round: 0.4, Window_Thin_Round1: 0.6, Window_Wide_Round1: 0.6, WindowShutters_Thin_Round_Open: 1,
  Roof_RoundTiles_4x4: 0.5, Roof_RoundTiles_4x6: 0.5, Roof_Tower_RoundTiles: 0.3, Roof_Front_Brick4: 1, Roof_Log: 1,
  Prop_Crate: 1, Prop_Wagon: 0.45, Prop_WoodenFence_Single: 1, Prop_WoodenFence_Extension1: 1, Prop_Support: 1,
  Prop_Chimney: 0.6, Prop_Chimney2: 1, Prop_Brick1: 1, Prop_Brick2: 1, Prop_Brick3: 1, Prop_Vine1: 1, Prop_Vine2: 1, Prop_Vine5: 1,
  Prop_MetalFence_Simple: 0.3, Prop_MetalFence_Ornament: 0.25, Prop_ExteriorBorder_Straight1: 1,
  Stairs_Exterior_Straight: 1, Stairs_Exterior_Platform: 1, Balcony_Cross_Straight: 1,
};
/** The kit's materials → texture layer, and the base colour file of each textured layer. */
const LAYER_OF = {
  MI_WoodTrim: 'WoodTrim', MI_WoodTrim_Wear: 'WoodTrim', MI_Plaster: 'Plaster', MI_Brick: 'Brick', MI_UnevenBrick: 'UnevenBrick',
  MI_RockTrim: 'RockTrim', MI_RoundTiles: 'RoundTiles', MI_RedBrick: 'RedBrick', MI_MetalOrnaments: 'Metal', MI_Vine: 'Vine', MI_WindowGlass: 'Glass',
};
const LAYER_FILE = {
  WoodTrim: 'T_WoodTrim_BaseColor.png', Plaster: 'T_Plaster_BaseColor.png', Brick: 'T_Brick_BaseColor.png', UnevenBrick: 'T_UnevenBrick_BaseColor.png',
  RockTrim: 'T_RockTrim_BaseColor.png', RoundTiles: 'T_RoundTiles_BaseColor.png', RedBrick: 'T_RedBrick_BaseColor.png',
  Metal: 'T_MetalOrnaments_BaseColor.png', Vine: 'T_VineLeaf_png.png',
};
const TEX = 256;

/** Nature models: name → simplify ratio. */
const NATURE = {};
for (let i = 1; i <= 5; i++) { NATURE[`CommonTree_${i}`] = 0.5; NATURE[`PineTree_${i}`] = 0.5; }
for (const n of ['CommonTree_Autumn_1', 'CommonTree_Autumn_2', 'PineTree_Snow_1', 'PineTree_Snow_2', 'PineTree_Snow_3',
  'BirchTree_1', 'BirchTree_2', 'BirchTree_3', 'BirchTree_Dead_1', 'BirchTree_Dead_2', 'BirchTree_Dead_3', 'CommonTree_Dead_1', 'CommonTree_Dead_2', 'CommonTree_Dead_3',
  'Willow_1', 'Willow_2', 'Willow_4']) NATURE[n] = 0.5;
for (const n of ['Bush_1', 'Bush_2', 'BushBerries_1', 'Bush_Snow_1', 'TreeStump', 'TreeStump_Moss', 'WoodLog', 'WoodLog_Moss', 'Grass', 'Grass_Short', 'Grass_2',
  'Flowers', 'Plant_1', 'Plant_3', 'Lilypad']) NATURE[n] = 0.7;
for (const n of ['Wheat', 'Corn_2']) NATURE[n] = 0.4;
for (let i = 1; i <= 7; i++) NATURE[`Rock_${i}`] = 1;
for (const n of ['Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3', 'Rock_Moss_4', 'Rock_Snow_1', 'Rock_Snow_3', 'Rock_Snow_6']) NATURE[n] = 1;

// ---------------------------------------------------------------- mesh helpers

/** Welds vertices that match in every attribute (the sources split them for their normals). */
function weld(pos, attr, attrSize, idx) {
  const map = new Map(), P = [], A = [], remap = new Uint32Array(pos.length / 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const key = Array.from(pos.subarray(v * 3, v * 3 + 3), (x) => x.toFixed(5)).join(',') + '|' + (attr ? Array.from(attr.subarray(v * attrSize, v * attrSize + attrSize), (x) => x.toFixed(4)).join(',') : '');
    let k = map.get(key);
    if (k === undefined) { k = P.length / 3; map.set(key, k); P.push(...pos.subarray(v * 3, v * 3 + 3)); if (attr) A.push(...attr.subarray(v * attrSize, v * attrSize + attrSize)); }
    remap[v] = k;
  }
  const I = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) I[i] = remap[idx[i]];
  // drop triangles that welded flat
  const keep = [];
  for (let i = 0; i < I.length; i += 3) if (I[i] !== I[i + 1] && I[i + 1] !== I[i + 2] && I[i] !== I[i + 2]) keep.push(I[i], I[i + 1], I[i + 2]);
  return { pos: new Float32Array(P), attr: attr ? new Float32Array(A) : null, idx: new Uint32Array(keep) };
}

/** Simplifies to `ratio` of the triangles (borders locked), keeping the attribute, then drops unused vertices. */
function simplify(m, attrSize, ratio, weight) {
  if (ratio >= 1 || m.idx.length < 300) return m;
  const target = Math.max(3, Math.floor((m.idx.length * ratio) / 3) * 3);
  const [out] = m.attr
    ? MeshoptSimplifier.simplifyWithAttributes(m.idx, m.pos, 3, m.attr, attrSize, new Array(attrSize).fill(weight), null, target, 0.02, ['LockBorder'])
    : MeshoptSimplifier.simplify(m.idx, m.pos, 3, target, 0.02, ['LockBorder']);
  const used = new Map(), P = [], A = [];
  const I = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    let k = used.get(out[i]);
    if (k === undefined) { k = P.length / 3; used.set(out[i], k); P.push(...m.pos.subarray(out[i] * 3, out[i] * 3 + 3)); if (m.attr) A.push(...m.attr.subarray(out[i] * attrSize, out[i] * attrSize + attrSize)); }
    I[i] = k;
  }
  return { pos: new Float32Array(P), attr: m.attr ? new Float32Array(A) : null, idx: I };
}

function tris(list) { return list.reduce((a, m) => a + m.idx.length / 3, 0); }

// ---------------------------------------------------------------- output document

function newDoc() {
  const doc = new Document();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  return { doc, buf: doc.createBuffer() };
}

function addPrim(doc, buf, m, material, attrName, attrType) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.pos.length / 3 > 65535 ? m.idx : new Uint16Array(m.idx)).setBuffer(buf))
    .setMaterial(material);
  if (m.attr) prim.setAttribute(attrName, doc.createAccessor().setType(attrType).setArray(m.attr).setBuffer(buf));
  return prim;
}

async function write(doc, file) {
  await doc.transform(dedup(), prune(), quantize({ pattern: /^(POSITION|COLOR_0)$/, quantizePosition: 14, quantizeColor: 8 }));
  const bin = await new NodeIO().registerExtensions([KHRMeshQuantization]).writeBinary(doc);
  writeFileSync(file, bin);
  return bin.length;
}

// ---------------------------------------------------------------- the village

async function village() {
  const OUT = join(ROOT, 'medieval-village');
  mkdirSync(OUT, { recursive: true });
  const { doc, buf } = newDoc();
  const mats = {};
  for (const layer of [...new Set(Object.values(LAYER_OF))]) {
    const mat = doc.createMaterial(layer).setDoubleSided(true).setMetallicFactor(0).setRoughnessFactor(1);
    const file = LAYER_FILE[layer];
    if (layer === 'Vine') {
      // the grey leaf mask, tinted the kit's vine green (sRGB of its linear factor 0.10, 0.35, 0)
      const { data, info } = await sharp(join(villageDir, file)).resize(TEX, TEX).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 4) { const g = data[i] / 255; data[i] = Math.round(g * 90); data[i + 1] = Math.round(g * 160); data[i + 2] = Math.round(g * 40); }
      const png = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
      mat.setBaseColorTexture(doc.createTexture(layer).setImage(png).setMimeType('image/png')).setAlphaMode('MASK').setAlphaCutoff(0.5);
    } else if (file) {
      const jpg = await sharp(join(villageDir, file)).resize(TEX, TEX, { kernel: 'lanczos3' }).removeAlpha().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      mat.setBaseColorTexture(doc.createTexture(layer).setImage(jpg).setMimeType('image/jpeg'));
    } else mat.setBaseColorFactor([0.32, 0.4, 0.46, 1]);
    mats[layer] = mat;
  }
  const scene = doc.createScene('village');
  const lines = [];
  for (const [name, ratio] of Object.entries(VILLAGE)) {
    const j = JSON.parse(readFileSync(join(villageDir, name + '.gltf'), 'utf8'));
    const bin = readFileSync(join(villageDir, j.buffers[0].uri));
    const read = (ai, Ctor, comps) => {
      const a = j.accessors[ai], bv = j.bufferViews[a.bufferView];
      const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
      const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
      const src = new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * comps * C.BYTES_PER_ELEMENT));
      return Ctor === C ? src : Ctor.from(src);
    };
    const mesh = doc.createMesh(name);
    let before = 0, after = 0;
    // one primitive per layer (WoodTrim and WoodTrim_Wear join)
    const byLayer = new Map();
    for (const p of j.meshes[j.nodes[0].mesh].primitives) {
      const layer = LAYER_OF[j.materials[p.material].name];
      if (!layer) throw new Error(name + ': unknown material ' + j.materials[p.material].name);
      const pos = read(p.attributes.POSITION, Float32Array, 3), uv = read(p.attributes.TEXCOORD_0, Float32Array, 2), idx = read(p.indices, Uint32Array, 1);
      const cur = byLayer.get(layer) ?? { pos: [], uv: [], idx: [] };
      const base = cur.pos.length / 3;
      cur.pos.push(...pos); cur.uv.push(...uv); for (const i of idx) cur.idx.push(i + base);
      byLayer.set(layer, cur);
    }
    for (const [layer, c] of byLayer) {
      let m = weld(new Float32Array(c.pos), new Float32Array(c.uv), 2, new Uint32Array(c.idx));
      before += m.idx.length / 3;
      m = simplify(m, 2, ratio, 0.5);
      after += m.idx.length / 3;
      mesh.addPrimitive(addPrim(doc, buf, m, mats[layer], 'TEXCOORD_0', 'VEC2'));
    }
    scene.addChild(doc.createNode(name).setMesh(mesh));
    lines.push(`${name} ${before}→${after} tris`);
  }
  const size = await write(doc, join(OUT, 'village.glb'));
  console.log(lines.join('\n'));
  console.log('village.glb', (size / 1024).toFixed(0), 'KB');
}

// ---------------------------------------------------------------- nature

function parseMtl(text) {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'newmtl') cur = t[1];
    else if (t[0] === 'Kd' && cur) {
      // Blender 2.79 wrote the colour × its 0.8 diffuse intensity; a little brighter and richer for
      // the arenas' light (the Preview's look)
      const c = t.slice(1, 4).map((v) => Number(v) * 1.5);
      const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      out[cur] = c.map((v) => Math.max(0, Math.min(1, l + (v - l) * 1.25)));
    }
  }
  return out;
}

async function nature() {
  const OUT = join(ROOT, 'nature-pack');
  mkdirSync(OUT, { recursive: true });
  const { doc, buf } = newDoc();
  const mat = doc.createMaterial('Color').setDoubleSided(true).setMetallicFactor(0).setRoughnessFactor(1);
  const scene = doc.createScene('nature');
  const lines = [];
  for (const [name, ratio] of Object.entries(NATURE)) {
    const text = readFileSync(join(natureDir, name + '.obj'), 'utf8');
    const kd = parseMtl(readFileSync(join(natureDir, name + '.mtl'), 'utf8'));
    const V = [];
    const byMat = new Map();
    let cur = null;
    for (const line of text.split('\n')) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'v') V.push(+t[1], +t[2], +t[3]);
      else if (t[0] === 'usemtl') cur = t[1];
      else if (t[0] === 'f') {
        const ids = t.slice(1).map((s) => { const k = parseInt(s.split('/')[0], 10); return k < 0 ? V.length / 3 + k : k - 1; });
        const list = byMat.get(cur) ?? [];
        for (let i = 1; i + 1 < ids.length; i++) list.push(ids[0], ids[i], ids[i + 1]);
        byMat.set(cur, list);
      }
    }
    let before = 0, after = 0;
    const parts = [];
    for (const [mname, list] of byMat) {
      const col = kd[mname] ?? [0.5, 0.5, 0.5];
      // this colour's triangles over their own vertices
      const used = new Map(), P = [];
      const idx = new Uint32Array(list.length);
      list.forEach((v, i) => { let k = used.get(v); if (k === undefined) { k = P.length / 3; used.set(v, k); P.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]); } idx[i] = k; });
      let m = weld(new Float32Array(P), null, 0, idx);
      before += m.idx.length / 3;
      m = simplify(m, 0, ratio, 0);
      after += m.idx.length / 3;
      parts.push({ m, col });
    }
    // one primitive: the colours baked into the vertices
    const P = [], C = [], I = [];
    for (const { m, col } of parts) {
      const base = P.length / 3;
      P.push(...m.pos);
      for (let v = 0; v < m.pos.length / 3; v++) C.push(col[0], col[1], col[2], 1);
      for (const i of m.idx) I.push(i + base);
    }
    const mesh = doc.createMesh(name).addPrimitive(addPrim(doc, buf, { pos: new Float32Array(P), attr: new Float32Array(C), idx: new Uint32Array(I) }, mat, 'COLOR_0', 'VEC4'));
    scene.addChild(doc.createNode(name).setMesh(mesh));
    lines.push(`${name} ${before}→${after} tris`);
  }
  const size = await write(doc, join(OUT, 'nature.glb'));
  console.log(lines.join('\n'));
  console.log('nature.glb', (size / 1024).toFixed(0), 'KB');
}

await village();
await nature();
for (const f of ['medieval-village/village.glb', 'nature-pack/nature.glb']) console.log(f, statSync(join(ROOT, f)).size);
