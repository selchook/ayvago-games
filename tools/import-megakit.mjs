// City generator: how public/assets/quaternius/downtown-megakit/kit.glb was made from Quaternius's
// Downtown City MegaKit (Standard edition, CC0; the owner-shared Google Drive folder). Kept as a
// record and for a re-import; not part of the build.
//
//   node tools/import-megakit.mjs <kit dir with "Exports/glTF (Godot)"> <node_modules with
//        @gltf-transform/core + /functions, meshoptimizer and sharp>
//
// What it does:
//   - takes the pieces the city's modular building assembler uses (PIECES below: walls, windows,
//     storefronts, doors, corner columns, cornices, roofs, steps and the five props), one root node
//     each, named by our id (`brick-window`, `cornice-trim-corner` …);
//   - drops the vertex colours (COLOR_0 / COLOR_1: wear masks for the Source edition's shaders,
//     which three.js would multiply in and paint everything red), the second UV set, the interior
//     faces (MI_InteriorWall, floors) and the decals;
//   - merges each piece's primitives per material slot and names the materials by slot (`wall`,
//     `wall-pale`, `trim`, `trim-dark`, `trim-green`, `metal`, `glass`, `interior`, `slate`,
//     `roof`, `concrete`, `ornament`, `dirt`): CityView reads the slot from the name and tints it;
//   - welds and simplifies the heavy pieces to a triangle budget each (meshoptimizer);
//   - downscales the eight tiling base-colour textures from 2048² to 512² with the ambient
//     occlusion of their ORM maps multiplied in, as JPEG (no normal or ORM maps: the city is lit
//     with a Lambert model);
//   - writes docs/assets/quaternius-downtown-megakit.txt (every piece with its triangles and box).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, statSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node tools/import-megakit.mjs <kit dir> <node_modules dir>');
const req = createRequire(join(nm, 'x.js'));
const { NodeIO, Document } = req('@gltf-transform/core');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/assets/quaternius/downtown-megakit');
const GLTF = join(src, 'Exports/glTF (Godot)');
mkdirSync(OUT, { recursive: true });

/**
 * Our id → [source model, triangle budget (0 = keep)]. The heavy pieces are simplified down to
 * their budget (borders between slots free to move a little): a street shows hundreds of them.
 */
const PIECES = {
  // brick (the city also paints the brick slot as stucco or render)
  'brick-plain': ['Brick_Plain_3', 0],
  'brick-plain-1': ['Brick_Plain_1', 0],
  'brick-base': ['Brick_BottomTrim', 30],
  'brick-top': ['Brick_TopTrim', 0],
  'brick-band': ['Brick_HalfTrim', 0],
  'brick-window': ['Brick_Window_Square_Single', 96],
  'brick-window-trim': ['Brick_Window_Trim_Single', 110],
  'brick-window-arch': ['Brick_Inset_Window_Curved_Small', 150],
  'brick-window-double': ['Brick_Inset_Window', 150],
  'brick-corner': ['Brick_CornerColumn_Center', 0],
  'brick-corner-base': ['Brick_CornerColumn_Bottom', 48],
  'brick-corner-top': ['Brick_CornerColumn_Top', 48],
  'brick-corner-cap': ['Brick_CornerColumn_CapShort', 36],
  // stone trim
  'trim-plain': ['Trim_Plain_3', 0],
  'trim-window': ['Trim_Window', 140],
  'trim-ground': ['Trim_FirstFloor_Wall', 0],
  'trim-shop': ['Trim_FirstFloor_Window_001', 100],
  'trim-band': ['Trim_Wall_Guard', 20],
  'trim-column': ['Trim_Column_Center', 40],
  'trim-column-base': ['Trim_Column_Bottom', 60],
  // metal storefronts
  'metal-ground': ['Metal_FirstFloor_Wall', 0],
  'metal-shop': ['Metal_FirstFloor_Window', 100],
  'metal-window': ['Metal_FullWindow', 110],
  'metal-plain': ['Metal_Plain_3', 0],
  'metal-column': ['Metal_Column_Center', 16],
  // doors: frame and leaf as one piece
  'door-metal': [['DoorFrame_Metal_Single', 'Door_2'], 150],
  'door-wood': [['DoorFrame_Wooden', 'Door_1'], 190],
  'door-arch': [['DoorFrame_Trim', 'Door_3'], 200],
  // tops
  'cornice-brick': ['Cornice_Brick_Center', 0],
  'cornice-brick-corner': ['Cornice_Brick_90Angle_L', 0],
  'cornice-trim': ['Cornice_Trim_Center', 40],
  'cornice-trim-corner': ['Cornice_Trim_90Angle_L', 70],
  'cornice-metal': ['Cornice_Metal_Center', 0],
  'cornice-metal-corner': ['Cornice_Metal_90Angle_L', 48],
  'roof': ['Roof_4x4', 0],
  'roof-2': ['Roof_2x2', 0],
  // entrances
  'steps': ['Stairs_Entrance_Concrete', 60],
  // props
  'ac': ['Prop_ACUnit', 40],
  'bollard': ['Prop_Bollard', 40],
  'planter': ['Prop_Planter_Single', 60],
  'drain': ['Prop_Drain', 0],
  'manhole': ['Prop_ManholeCover', 24],
};

/** Source material → our slot (null: dropped). */
const SLOT = {
  MI_RedBrick: 'wall', MI_RedBrick_Pale: 'wall-pale', MI_Trim: 'trim', MI_Trim_Dark: 'trim-dark', MI_Trim_Green: 'trim-green',
  MI_Trim_MetalConcrete: 'metal', MI_Glass: 'glass', MI_FakeInterior: 'interior', MI_Roof_Slate: 'slate', MI_Asphalt: 'roof',
  MI_Concrete: 'concrete', MI_Ornaments: 'ornament', MI_Dirt: 'dirt',
  MI_InteriorWall: null, MI_InteriorFloor: null, MI_InteriorRoof: null, MI_StreetDecals: null,
};
/** Slot → [base colour texture, ORM texture] (untextured slots are drawn by the shader). */
const TEX = {
  brick: ['T_RedBrick_BaseColor.png', 'T_RedBrick_ORM.png'],
  trim: ['T_Trim_BaseColor.png', 'T_Trim_ORM.png'],
  metal: ['T_MetalConcrete_BaseColor.png', 'T_MetalConcrete_ORM.png'],
  slate: ['T_RoofSlate_BaseColor.png', 'T_RoofSlate_ORM.png'],
  asphalt: ['T_Concrete_Asphalt_BaseColor.png', 'T_Concrete_ORM.png'],
  concrete: ['T_Concrete_BaseColor.png', 'T_Concrete_ORM.png'],
  ornament: ['T_Ornaments_BaseColor.png', 'T_Ornaments_ORM.png'],
  dirt: ['T_Dirt_BaseColor.png', 'T_Dirt_ORM.png'],
};
const SLOT_TEX = {
  wall: 'brick', 'wall-pale': 'brick', trim: 'trim', 'trim-dark': 'trim', 'trim-green': 'trim', metal: 'metal', slate: 'slate',
  roof: 'asphalt', concrete: 'concrete', ornament: 'ornament', dirt: 'dirt', glass: null, interior: null,
};
const PX = 512;

await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('kit');

// textures: 512² JPEG with the ambient occlusion multiplied in
const textures = {};
for (const [name, [base, orm]] of Object.entries(TEX)) {
  const b = await sharp(join(GLTF, base)).removeAlpha().resize(PX, PX, { kernel: 'lanczos3' }).raw().toBuffer();
  const ao = await sharp(join(GLTF, orm)).extractChannel(0).resize(PX, PX, { kernel: 'lanczos3' }).raw().toBuffer();
  const out = Buffer.alloc(PX * PX * 3);
  for (let i = 0; i < PX * PX; i++) {
    const k = 0.3 + 0.7 * Math.pow(ao[i] / 255, 0.8);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(b[i * 3 + c] * k);
  }
  const jpg = await sharp(out, { raw: { width: PX, height: PX, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  textures[name] = doc.createTexture(name).setImage(new Uint8Array(jpg)).setMimeType('image/jpeg').setURI(name + '.jpg');
}
const materials = {};
const material = (slot) => {
  if (materials[slot]) return materials[slot];
  const m = doc.createMaterial(slot).setRoughnessFactor(1).setMetallicFactor(0);
  const t = SLOT_TEX[slot];
  if (t) m.setBaseColorTexture(textures[t]);
  else if (slot === 'glass') m.setBaseColorFactor([0.05, 0.06, 0.07, 1]);
  else m.setBaseColorFactor([0.6, 0.6, 0.6, 1]);
  return (materials[slot] = m);
};

/** Reads a source model: per slot, welded indexed triangles (positions, normals, uvs). */
function readModel(name) {
  const g = JSON.parse(readFileSync(join(GLTF, name + '.gltf'), 'utf8'));
  const bin = readFileSync(join(GLTF, g.buffers[0].uri));
  const acc = (i) => {
    const a = g.accessors[i], v = g.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (a.componentType === 5126) return { n, data: new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4)) };
    if (a.componentType === 5123) return { n, data: Uint32Array.from(new Uint16Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * 2))) };
    if (a.componentType === 5125) return { n, data: new Uint32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * 4)) };
    throw new Error('component type ' + a.componentType);
  };
  const node = g.nodes[0];
  if (node.matrix || node.rotation || node.scale || node.translation) throw new Error(name + ': node transform not handled');
  const out = {};
  for (const prim of g.meshes[0].primitives) {
    const mname = g.materials[prim.material].name;
    if (!(mname in SLOT)) throw new Error(name + ': unknown material ' + mname);
    const slot = SLOT[mname];
    if (!slot) continue;
    const pos = acc(prim.attributes.POSITION).data, nor = acc(prim.attributes.NORMAL).data, uv = acc(prim.attributes.TEXCOORD_0).data;
    const idx = prim.indices !== undefined ? acc(prim.indices).data : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    const o = (out[slot] ??= { pos: [], nor: [], uv: [], idx: [] });
    const base = o.pos.length / 3;
    o.pos.push(...pos); o.nor.push(...nor); o.uv.push(...uv);
    for (const i of idx) o.idx.push(base + i);
  }
  return out;
}

/** Welds identical vertices (position, normal, uv) of one slot's triangles. */
function weld(o) {
  const map = new Map(), pos = [], nor = [], uv = [], remap = [];
  const n = o.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const k = [o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2], o.nor[i * 3], o.nor[i * 3 + 1], o.nor[i * 3 + 2], o.uv[i * 2], o.uv[i * 2 + 1]].map((v) => v.toFixed(4)).join(',');
    let j = map.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      map.set(k, j);
      pos.push(o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2]); nor.push(o.nor[i * 3], o.nor[i * 3 + 1], o.nor[i * 3 + 2]); uv.push(o.uv[i * 2], o.uv[i * 2 + 1]);
    }
    remap.push(j);
  }
  const idx = [];
  for (let t = 0; t < o.idx.length; t += 3) {
    const a = remap[o.idx[t]], b = remap[o.idx[t + 1]], c = remap[o.idx[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint32Array(idx) };
}

/** Drops vertices no triangle uses. */
function compact(w) {
  const used = new Map();
  const pos = [], nor = [], uv = [];
  const idx = new Uint32Array(w.idx.length);
  w.idx.forEach((i, k) => {
    let j = used.get(i);
    if (j === undefined) {
      j = used.size; used.set(i, j);
      pos.push(w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]); nor.push(w.nor[i * 3], w.nor[i * 3 + 1], w.nor[i * 3 + 2]); uv.push(w.uv[i * 2], w.uv[i * 2 + 1]);
    }
    idx[k] = j;
  });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx };
}

const rows = [];
let srcTris = 0, outTris = 0;
for (const [id, [from, budget]] of Object.entries(PIECES)) {
  const sources = Array.isArray(from) ? from : [from];
  const slots = {};
  for (const s of sources) {
    for (const [slot, o] of Object.entries(readModel(s))) {
      const d = (slots[slot] ??= { pos: [], nor: [], uv: [], idx: [] });
      const base = d.pos.length / 3;
      d.pos.push(...o.pos); d.nor.push(...o.nor); d.uv.push(...o.uv);
      for (const i of o.idx) d.idx.push(base + i);
    }
  }
  const srcCount = Object.values(slots).reduce((n, o) => n + o.idx.length / 3, 0);
  const mesh = doc.createMesh(id);
  let tris = 0, before = 0;
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const [slot, o] of Object.entries(slots)) {
    let w = weld(o);
    before += w.idx.length / 3;
    // each slot gets its share of the piece's budget
    if (budget && srcCount > budget && w.idx.length > 30) {
      const target = Math.max(12, Math.floor(((w.idx.length / 3) * (budget / srcCount))) * 3);
      const [idx] = MeshoptSimplifier.simplify(w.idx, w.pos, 3, target, 0.05, []);
      w = compact({ ...w, idx });
    }
    tris += w.idx.length / 3;
    for (let i = 0; i < w.pos.length; i += 3) for (let c = 0; c < 3; c++) { box[c] = Math.min(box[c], w.pos[i + c]); box[c + 3] = Math.max(box[c + 3], w.pos[i + c]); }
    const prim = doc.createPrimitive().setMaterial(material(slot))
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(w.pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(w.nor).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(w.uv).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(w.pos.length / 3 > 65535 ? w.idx : new Uint16Array(w.idx)).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  scene.addChild(doc.createNode(id).setMesh(mesh));
  srcTris += before; outTris += tris;
  const f = (v) => v.toFixed(2);
  rows.push(`${id.padEnd(22)} ${String(tris).padStart(4)} tris (source ${sources.join(' + ')}, ${before})  box ${f(box[0])},${f(box[1])},${f(box[2])} .. ${f(box[3])},${f(box[4])},${f(box[5])}  slots ${Object.keys(slots).join(' ')}`);
}

const file = join(OUT, 'kit.glb');
await io.write(file, doc);
copyFileSync(join(src, 'License_Standard.txt'), join(OUT, 'license.txt'));
const kb = (f) => Math.round(statSync(f).size / 1024);
writeFileSync(join(ROOT, 'docs/assets/quaternius-downtown-megakit.txt'), [
  '# quaternius/downtown-megakit — Quaternius Downtown City MegaKit (Standard edition), CC0',
  '# Made by tools/import-megakit.mjs. Metres, y up; a wall piece is 2 m wide and 3 m tall, its pivot at the bottom middle of its',
  '# front face, the facade facing +z and the wall 0.2 m deep behind it. Materials are slots the city shader tints (see the tool).',
  `# textures: ${Object.keys(TEX).map((t) => t + '.jpg').join(', ')} (${PX}x${PX} JPEG, inside the GLB)`,
  '',
  `kit.glb  ${kb(file)} KB  ${Object.keys(PIECES).length} pieces, ${outTris} triangles (source ${srcTris})`,
  `license.txt  ${kb(join(OUT, 'license.txt'))} KB  the pack's License_Standard.txt`,
  '',
  ...rows,
  '',
].join('\n'));
console.log(`kit.glb ${kb(file)} KB, ${Object.keys(PIECES).length} pieces, ${outTris} triangles (source ${srcTris})`);
