// Street Heat: how the city's models were made, step 2 of the import (step 1: import-textures.py).
// Kept as a record and for a re-import; not part of the build. Nothing from the source folders is
// run: the glTF, OBJ and MTL files are read as data and rewritten. Needs only `meshoptimizer` (a
// dependency of three, already in node_modules).
//
//   node games/street-heat/import-city.mjs <kits dir> <layers dir> [downtown,cars,transport,town]
//   node games/street-heat/import-city.mjs --wheels     (only re-splits the wheels of the cars.glb
//                                                        and transport.glb already in public/assets)
//     <kits dir>    holds the Quaternius packs as shared by the owner (CC0 1.0 each):
//                     downtown/   Downtown City MegaKit [Standard] (Exports/glTF (Godot), License_Standard.txt)
//                     buildings/  Buildings Pack (OBJ + MTL, License.txt)
//                     cars/       Realistic Car Pack (OBJ + MTL, License.txt)
//                     transport/  Public Transport Pack (OBJ + MTL, License.txt)
//     <layers dir>  the output of import-textures.py (layers.jpg, decals-alpha.png)
//
// Writes, each with the pack's licence as license.txt:
//   public/assets/quaternius/downtown-city/city.glb      the kit's three ready-made buildings and
//       four more assembled here from its wall, window, corner, cornice and roof modules, plus its
//       street props; one primitive per texture layer (material named after the layer), UVs kept
//       (they repeat), tints in vertex colours, the interiors (fake rooms, inner walls, floors)
//       dropped, the window glass kept as the `glass` layer (lit at night by the game), simplified;
//   public/assets/quaternius/downtown-city/layers.jpg, decals-alpha.png   the array texture's layers;
//   public/assets/quaternius/town-buildings/buildings.glb   the nine buildings, MTL colours as
//       vertex colours (`white` layer), their window panes as `glass`, scaled to metres;
//   public/assets/quaternius/city-cars/cars.glb           the seven cars and the shared `Wheel`;
//   public/assets/quaternius/public-transport/transport.glb  bus, school bus, ambulance, traffic
//       light, cone and the three signs.
// Vehicles: one primitive each, MTL colours (linear) as COLOR_0 and a `_KIND` byte per vertex (KIND
// below: paint, head and tail lights, glass, beacons, lamps, rims) that the game's shader reads; the
// paint vertices hold a brightness (the paint colour comes from the game) and the node's extras its
// stock colour. Vehicles face +z with the wheels on y = 0, centred on x/z.
// Wheels: the kits' wheels are part of the body (and low-poly hexagons, the buses' squashed), so
// they cannot turn. splitWheels() takes them out of every vehicle (the tyres are the dark parts
// touching the ground at the four corners; everything inside a tyre's box goes with it) and puts
// their places in the node's extras: `wheels: { r, w, hubs: [[x, y, z] × 4], rim: [r, g, b] }`
// (radius and width in metres, the hubs in the model's space, front ones at +z). One round
// `Wheel` (wheelModel(): radius 1, width 1, the axle along x, the hub at the origin, the outer
// face at +x, the rim's vertices KIND.rim, the tread's KIND.tread) in cars.glb draws them all: the
// game scales, steers and spins it per wheel, instanced, and paints the rim's spokes and the
// tread's grooves in its shader.
// No normals anywhere (drawn flat-shaded), so vertices weld; positions quantized to 16 bits
// (KHR_mesh_quantization, the node's scale and translation undo it).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';

const [kitsDir, layersDir] = process.argv.slice(2);
if (kitsDir !== '--wheels' && (!kitsDir || !layersDir)) throw new Error('usage: node import-city.mjs <kits dir> <layers dir> | --wheels');
const req = createRequire(join(import.meta.dirname, '../../node_modules/x.js'));
// the simplifier is needed for a full import only (not for --wheels)
const { MeshoptSimplifier } = kitsDir === '--wheels' ? { MeshoptSimplifier: null } : req('meshoptimizer');
await MeshoptSimplifier?.ready;

const ROOT = join(import.meta.dirname, '../../public/assets/quaternius');
const DOWNTOWN = join(kitsDir, 'downtown', 'Exports', 'glTF (Godot)');

/** The array texture's layers (same order as import-textures.py and scenery.ts). */
const LAYERS = ['white', 'asphalt', 'pavement', 'metal', 'brick', 'palebrick', 'trim', 'slate', 'ornaments', 'dirt', 'grass',
  'paint', 'decals', 'glass', 'concrete'];

/** Vertex kinds of vehicles (the game's shader: look.ts KIND). */
const KIND = { body: 0, paint: 1, head: 2, tail: 3, glass: 4, red: 5, blue: 6, lampR: 7, lampY: 8, lampG: 9, rim: 10, tread: 11 };

// ---------------------------------------------------------------- colours

const lin = (hex) => [16, 8, 0].map((s) => { const c = ((hex >> s) & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ---------------------------------------------------------------- mesh helpers

/** Welds vertices equal in position (and uv): the sources split them for their normals. */
function weld(pos, uv, idx) {
  const map = new Map(), P = [], U = [], remap = new Uint32Array(pos.length / 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const key = `${pos[v * 3].toFixed(4)},${pos[v * 3 + 1].toFixed(4)},${pos[v * 3 + 2].toFixed(4)}` + (uv ? `|${uv[v * 2].toFixed(4)},${uv[v * 2 + 1].toFixed(4)}` : '');
    let k = map.get(key);
    if (k === undefined) { k = P.length / 3; map.set(key, k); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); if (uv) U.push(uv[v * 2], uv[v * 2 + 1]); }
    remap[v] = k;
  }
  const I = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
    if (a !== b && b !== c && a !== c) I.push(a, b, c);
  }
  return { pos: new Float32Array(P), uv: uv ? new Float32Array(U) : null, idx: new Uint32Array(I) };
}

/** Simplifies to `ratio` of the triangles (open edges, UV seams included, stay), then drops unused vertices. */
function simplify(m, ratio, error = 0.02, lock = true) {
  if (ratio >= 1 || m.idx.length < 60) return m;
  const target = Math.max(3, Math.floor((m.idx.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(m.idx, m.pos, 3, target, error, lock ? ['LockBorder'] : []);
  return compact(m, out);
}

function compact(m, idx) {
  const used = new Map(), P = [], U = [];
  const I = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let k = used.get(idx[i]);
    if (k === undefined) {
      k = P.length / 3; used.set(idx[i], k);
      P.push(m.pos[idx[i] * 3], m.pos[idx[i] * 3 + 1], m.pos[idx[i] * 3 + 2]);
      if (m.uv) U.push(m.uv[idx[i] * 2], m.uv[idx[i] * 2 + 1]);
    }
    I[i] = k;
  }
  return { pos: new Float32Array(P), uv: m.uv ? new Float32Array(U) : null, idx: I };
}

/** Applies a 4×4 column-major matrix to every position. */
function transform(pos, mat) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    out[i] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
    out[i + 1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
    out[i + 2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
  }
  return out;
}

function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const yaw = (deg, t = [0, 0, 0], s = 1) => { const a = deg * Math.PI / 360; return trs(t, [0, Math.sin(a), 0, Math.cos(a)], [s, s, s]); };
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** Rotation about x, y, z (degrees, applied in that order). */
function euler(rx, ry, rz) {
  const q = (ax, deg) => { const a = deg * Math.PI / 360, s = Math.sin(a); return trs([0, 0, 0], ax === 0 ? [s, 0, 0, Math.cos(a)] : ax === 1 ? [0, s, 0, Math.cos(a)] : [0, 0, s, Math.cos(a)]); };
  return mul(q(2, rz), mul(q(1, ry), q(0, rx)));
}

function concat(list) {
  const out = new Float32Array(list.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}

function bounds(pos) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  return { mn, mx };
}

// ---------------------------------------------------------------- the GLB writer

class Glb {
  constructor() {
    this.json = { asset: { version: '2.0', generator: 'street-heat/import-city.mjs' }, extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'], scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
    this.chunks = [];
    this.length = 0;
    this.mats = new Map();
  }

  view(bytes, target, stride) {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) { this.chunks.push(new Uint8Array(pad)); this.length += pad; }
    const v = { buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength, target };
    if (stride) v.byteStride = stride;
    this.chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.length += bytes.byteLength;
    this.json.bufferViews.push(v);
    return this.json.bufferViews.length - 1;
  }

  accessor(o) { this.json.accessors.push(o); return this.json.accessors.length - 1; }

  material(name) {
    if (!this.mats.has(name)) {
      this.json.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true });
      this.mats.set(name, this.json.materials.length - 1);
    }
    return this.mats.get(name);
  }

  /**
   * One model as a root node. `prims`: [{ pos, uv?, col? (0…1 linear, 3 per vertex), kind?, idx, material }],
   * all in the model's own space; the positions share one 16-bit grid (the node's scale and translation).
   */
  model(name, prims, extras) {
    const all = prims.map((p) => p.pos);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const pos of all) { const b = bounds(pos); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.mn[k]); mx[k] = Math.max(mx[k], b.mx[k]); } }
    const centre = mn.map((v, k) => (v + mx[k]) / 2);
    const scale = Math.max(...mx.map((v, k) => v - mn[k])) / 65000 || 1;
    const primitives = [];
    for (const p of prims) {
      const n = p.pos.length / 3;
      const q = new Int16Array(n * 4);
      const qmn = [32767, 32767, 32767], qmx = [-32768, -32768, -32768];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        const v = Math.round((p.pos[i * 3 + k] - centre[k]) / scale);
        q[i * 4 + k] = v; qmn[k] = Math.min(qmn[k], v); qmx[k] = Math.max(qmx[k], v);
      }
      const attributes = { POSITION: this.accessor({ bufferView: this.view(q, 34962, 8), componentType: 5122, count: n, type: 'VEC3', min: qmn, max: qmx }) };
      if (p.uv) attributes.TEXCOORD_0 = this.accessor({ bufferView: this.view(new Float32Array(p.uv), 34962), componentType: 5126, count: n, type: 'VEC2' });
      if (p.col) {
        const c = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[i * 4 + k] = Math.round(Math.max(0, Math.min(1, p.col[i * 3 + k])) * 255);
        attributes.COLOR_0 = this.accessor({ bufferView: this.view(c, 34962, 4), componentType: 5121, normalized: true, count: n, type: 'VEC3' });
      }
      if (p.kind) {
        const c = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) c[i * 4] = p.kind[i];
        attributes._KIND = this.accessor({ bufferView: this.view(c, 34962, 4), componentType: 5121, count: n, type: 'SCALAR' });
      }
      const idx = n > 65535 ? new Uint32Array(p.idx) : new Uint16Array(p.idx);
      const indices = this.accessor({ bufferView: this.view(idx, 34963), componentType: n > 65535 ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
      primitives.push({ attributes, indices, material: this.material(p.material) });
    }
    this.json.meshes.push({ name, primitives });
    const node = { name, mesh: this.json.meshes.length - 1, translation: centre, scale: [scale, scale, scale] };
    if (extras) node.extras = extras;
    this.json.nodes.push(node);
    this.json.scenes[0].nodes.push(this.json.nodes.length - 1);
  }

  write(file) {
    const bin = new Uint8Array(Math.ceil(this.length / 4) * 4);
    let o = 0;
    for (const c of this.chunks) { bin.set(c, o); o += c.byteLength; }
    this.json.buffers.push({ byteLength: bin.byteLength });
    let js = Buffer.from(JSON.stringify(this.json), 'utf8');
    const jpad = (4 - (js.length % 4)) % 4;
    js = Buffer.concat([js, Buffer.alloc(jpad, 0x20)]);
    const total = 12 + 8 + js.length + 8 + bin.byteLength;
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.byteLength, 0); bh.writeUInt32LE(0x004e4942, 4);
    writeFileSync(file, Buffer.concat([head, jh, js, bh, Buffer.from(bin.buffer)]));
    return total;
  }
}

// ---------------------------------------------------------------- the downtown kit (glTF)

/** The kit's materials → [layer, tint] (null: dropped). */
const LAYER_OF = {
  MI_RedBrick: ['brick'], MI_RedBrick_Pale: ['palebrick'], MI_Trim: ['trim'], MI_Trim_Dark: ['trim', 0x4a4c52], MI_Trim_Green: ['trim', 0x5f8f6c],
  MI_Trim_MetalConcrete: ['metal'], MI_Concrete: ['concrete'], MI_InteriorRoof: ['concrete'], MI_Asphalt: ['asphalt', 0xb4b4b4], MI_Glass: ['glass'],
  MI_Ornaments: ['ornaments'], MI_Dirt: ['dirt'], MI_Roof_Slate: ['slate'],
  MI_FakeInterior: null, MI_FakeInterior_1: null, MI_FakeInterior_2: null, MI_FakeInterior_3: null, MI_FakeInterior_4: null,
  MI_InteriorWall: null, MI_InteriorFloor: null, MI_StreetDecals: null,
};

/** A kit piece as { layer: { pos, uv, idx, tint } } in its own space (the node's transform applied). */
function readPiece(name) {
  const j = JSON.parse(readFileSync(join(DOWNTOWN, name + '.gltf'), 'utf8'));
  const bin = readFileSync(join(DOWNTOWN, j.buffers[0].uri));
  const read = (ai, comps) => {
    const a = j.accessors[ai], bv = j.bufferViews[a.bufferView];
    const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array : Uint8Array;
    const stride = bv.byteStride ?? comps * C.BYTES_PER_ELEMENT;
    const out = new Float64Array(a.count * comps);
    const dv = new DataView(bin.buffer, bin.byteOffset + off);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < comps; k++) {
      const p = i * stride + k * C.BYTES_PER_ELEMENT;
      out[i * comps + k] = C === Float32Array ? dv.getFloat32(p, true) : C === Uint32Array ? dv.getUint32(p, true) : C === Uint16Array ? dv.getUint16(p, true) : dv.getUint8(p);
    }
    return out;
  };
  const node = j.nodes.find((n) => n.mesh !== undefined);
  const mat = trs(node.translation, node.rotation, node.scale);
  const out = {};
  for (const p of j.meshes[node.mesh].primitives) {
    const mname = j.materials[p.material].name;
    if (!(mname in LAYER_OF)) throw new Error(name + ': unknown material ' + mname);
    const lt = LAYER_OF[mname];
    if (!lt) continue;
    const [layer, tint = 0xffffff] = lt;
    const key = layer + ':' + tint;
    const pos = transform(new Float32Array(read(p.attributes.POSITION, 3)), mat);
    const uv = new Float32Array(read(p.attributes.TEXCOORD_0, 2));
    const idx = Uint32Array.from(read(p.indices, 1));
    const cur = out[key] ?? { layer, tint, pos: [], uv: [], idx: [] };
    const base = cur.pos.length / 3;
    for (const v of pos) cur.pos.push(v);
    for (const v of uv) cur.uv.push(v);
    for (const i of idx) cur.idx.push(i + base);
    out[key] = cur;
  }
  return out;
}

/** Pieces placed with matrices, merged per layer: [{ name, mat }]. */
function assemble(list, ratio = 1) {
  const out = {};
  const cache = new Map();
  for (const { name, mat } of list) {
    if (!cache.has(name)) {
      // each module simplified once on its own (borders between modules stay put)
      const piece = readPiece(name);
      for (const g of Object.values(piece)) {
        const m = simplify(weld(new Float32Array(g.pos), null, new Uint32Array(g.idx)), ratio, 0.05, false);
        g.pos = m.pos; g.uv = new Float32Array((m.pos.length / 3) * 2); g.idx = m.idx;
      }
      cache.set(name, piece);
    }
    for (const [key, g] of Object.entries(cache.get(name))) {
      const pos = transform(new Float32Array(g.pos), mat);
      const cur = out[key] ?? { layer: g.layer, tint: g.tint, pos: [], uv: [], idx: [] };
      const base = cur.pos.length / 3;
      for (const v of pos) cur.pos.push(v);
      for (const v of g.uv) cur.uv.push(v);
      for (const i of g.idx) cur.idx.push(i + base);
      out[key] = cur;
    }
  }
  return out;
}

/** Layer groups → simplified primitives (tint as vertex colour). */
function toPrims(groups, ratio, error, lock = true) {
  const prims = [];
  let before = 0, after = 0;
  for (const g of Object.values(groups)) {
    // positions only: the game maps the repeating textures in world space (box mapping by the
    // face's normal), so UV seams do not hold the simplifier back
    let m = weld(new Float32Array(g.pos), null, new Uint32Array(g.idx));
    before += m.idx.length / 3;
    m = simplify(m, g.layer === 'glass' ? Math.min(1, ratio * 2) : ratio, error, lock);
    after += m.idx.length / 3;
    if (!m.idx.length) continue;
    const tc = lin(g.tint);
    const col = new Float32Array(m.pos.length);
    for (let i = 0; i < col.length; i += 3) col.set(tc, i);
    prims.push({ pos: m.pos, col, idx: m.idx, material: g.layer });
  }
  return { prims, before, after };
}

/**
 * Buildings assembled from the kit's modules: a box `w` × `d` metres (multiples of 4), `floors`
 * storeys of 3 m, the front (+z) facing the street. Ground floor and upper floors pick from the
 * module lists by a seed; columns at the corners, a cornice round the top, a flat roof with AC units.
 */
function composed({ w, d, floors, ground, upper, column, cornice, corner, seed, ratio }) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const list = [];
  // the four sides: start corner, direction, outward rotation (deg) and length
  const sides = [
    { x0: -w / 2, z0: 0, dx: 1, dz: 0, rot: 0, len: w },
    { x0: w / 2, z0: 0, dx: 0, dz: -1, rot: 90, len: d },
    { x0: w / 2, z0: -d, dx: -1, dz: 0, rot: 180, len: w },
    { x0: -w / 2, z0: -d, dx: 0, dz: 1, rot: 270, len: d },
  ];
  for (let f = 0; f < floors; f++) {
    const y = f * 3;
    sides.forEach((sd, si) => {
      let u = 0;
      while (u < sd.len - 0.01) {
        const pool = f === 0 ? (si === 0 ? ground : ground.filter((g) => !g.front)) : upper;
        const left = sd.len - u;
        const fits = pool.filter((p) => p.w <= left + 0.01);
        const pick = fits[Math.floor(rnd() * fits.length)] ?? { name: 'Brick_Plain_3', w: 2 };
        const c = u + pick.w / 2;
        const t = [sd.x0 + sd.dx * c, y, sd.z0 + sd.dz * c];
        list.push({ name: pick.name, mat: yaw(sd.rot, t) });
        u += pick.w;
      }
    });
    for (const [x, z] of [[-w / 2, 0], [w / 2, 0], [w / 2, -d], [-w / 2, -d]]) list.push({ name: f === 0 ? column[0] : f === floors - 1 ? column[2] : column[1], mat: trs([x, y, z]) });
  }
  // cornice round the top
  const top = floors * 3;
  sides.forEach((sd) => {
    for (let u = 2; u < sd.len - 1.99; u += 2) list.push({ name: cornice, mat: yaw(sd.rot, [sd.x0 + sd.dx * (u + 0), top, sd.z0 + sd.dz * (u + 0)]) });
  });
  for (const [x, z, r] of [[-w / 2, 0, 0], [w / 2, 0, 90], [w / 2, -d, 180], [-w / 2, -d, 270]]) list.push({ name: corner, mat: yaw(r, [x, top, z]) });
  // the roof: 4 × 4 tiles, a few AC units
  for (let x = -w / 2 + 2; x < w / 2; x += 4) for (let z = -2; z > -d; z -= 4) list.push({ name: 'Roof_4x4', mat: trs([x, top + 0.2, z]) });
  for (let i = 0; i < 3; i++) list.push({ name: 'Prop_ACUnit', mat: yaw(Math.floor(rnd() * 4) * 90, [(rnd() - 0.5) * (w - 4), top + 0.2, -2 - rnd() * (d - 4)]) });
  return assemble(list, ratio);
}

const GROUND_TRIM = [{ name: 'Trim_FirstFloor_Window_001', w: 2 }, { name: 'Trim_FirstFloor_Window_001', w: 2 }, { name: 'DoorFrame_Trim', w: 2, front: true }, { name: 'Trim_FirstFloor_Wall', w: 2 }];
const GROUND_METAL = [{ name: 'Metal_FirstFloor_Window', w: 2 }, { name: 'Metal_FirstFloor_Window', w: 2 }, { name: 'DoorFrame_Metal_Single', w: 2, front: true }, { name: 'Metal_FirstFloor_Wall', w: 2 }];
const COMPOSED = {
  Composed_BrickWalkup: { w: 12, d: 12, floors: 5, ground: GROUND_TRIM, upper: [{ name: 'Brick_Window_Trim', w: 2 }, { name: 'Brick_Window_Trim_Single', w: 2 }, { name: 'Brick_Window_Trim', w: 2 }], column: ['Brick_CornerColumn_Bottom', 'Brick_CornerColumn_Center', 'Brick_CornerColumn_Top'], cornice: 'Cornice_Brick_Center', corner: 'Cornice_Brick_90Angle_L', seed: 11, ratio: 0.09 },
  Composed_RedWhite: { w: 16, d: 12, floors: 6, ground: GROUND_METAL, upper: [{ name: 'Brick_RedWhite_DoubleWindow', w: 4 }, { name: 'Brick_Inset_Window', w: 4 }], column: ['Brick_CornerColumn_Bottom', 'Brick_CornerColumn_Center', 'Brick_CornerColumn_Top'], cornice: 'Cornice_Metal_Center', corner: 'Cornice_Metal_90Angle_L', seed: 5, ratio: 0.09 },
  Composed_Office: { w: 16, d: 16, floors: 8, ground: GROUND_METAL, upper: [{ name: 'Metal_Window', w: 4 }, { name: 'Metal_FullWindow', w: 2 }, { name: 'Metal_Window_Half', w: 2 }], column: ['Metal_Column_Bottom', 'Metal_Column_Center', 'Metal_Column_Top'], cornice: 'Cornice_Metal_Center', corner: 'Cornice_Metal_90Angle_L', seed: 7, ratio: 0.08 },
  Composed_Arches: { w: 12, d: 12, floors: 4, ground: GROUND_TRIM, upper: [{ name: 'Brick_Window_CurvedDouble', w: 4 }, { name: 'Brick_Inset_Window_Curved', w: 4 }, { name: 'Brick_Inset_Window_Curved_Small', w: 4 }], column: ['Trim_Column_Bottom', 'Trim_Column_Center', 'Trim_Column_Top'], cornice: 'Cornice_Trim_Center', corner: 'Cornice_Trim_90Angle_L', seed: 3, ratio: 0.09 },
};

/** Ready-made buildings and props: name → [simplify ratio, error]. */
const READY = {
  Building_Large_2: [0.08, 0.06, false], Building_Medium_2_001: [0.12, 0.06, false], Building_Small_1: [0.18, 0.05, false],
  Prop_Bollard: [0.25, 0.02], Prop_Planter_Single: [0.5, 0.02], Sidewalk_Planter: [0.2, 0.03], Prop_ACUnit: [1, 0.01],
  Prop_ManholeCover: [0.25, 0.02], Stairs_Entrance_Concrete: [0.6, 0.02], Entrance_Concrete_2x2: [1, 0.01],
};

function downtown() {
  const out = join(ROOT, 'downtown-city');
  mkdirSync(out, { recursive: true });
  const glb = new Glb();
  const lines = [];
  for (const [name, [ratio, error, lock = true]] of Object.entries(READY)) {
    const { prims, before, after } = toPrims(readPiece(name), ratio, error, lock);
    const nm = name.replace('_001', '');
    glb.model(nm, prims);
    const b = bounds(concat(prims.map((p) => p.pos)));
    lines.push(`${nm} ${b.mx.map((v, k) => (v - b.mn[k]).toFixed(2)).join('x')} ${before}→${after} tris, y ${b.mn[1].toFixed(2)}..${b.mx[1].toFixed(2)}, z ${b.mn[2].toFixed(2)}..${b.mx[2].toFixed(2)}, ${[...new Set(prims.map((p) => p.material))].join('+')}`);
  }
  for (const [name, cfg] of Object.entries(COMPOSED)) {
    // the assembled modules weld where they meet, so the whole building simplifies once more
    const { prims, before, after } = toPrims(composed(cfg), 0.5, 0.04, false);
    glb.model(name, prims);
    const b = bounds(concat(prims.map((p) => p.pos)));
    lines.push(`${name} ${b.mx.map((v, k) => (v - b.mn[k]).toFixed(2)).join('x')} ${before}→${after} tris, y ${b.mn[1].toFixed(2)}..${b.mx[1].toFixed(2)}, z ${b.mn[2].toFixed(2)}..${b.mx[2].toFixed(2)}, ${[...new Set(prims.map((p) => p.material))].join('+')}`);
  }
  const size = glb.write(join(out, 'city.glb'));
  copyFileSync(join(layersDir, 'layers.jpg'), join(out, 'layers.jpg'));
  copyFileSync(join(layersDir, 'decals-alpha.png'), join(out, 'decals-alpha.png'));
  copyFileSync(join(kitsDir, 'downtown', 'License_Standard.txt'), join(out, 'license.txt'));
  console.log(lines.join('\n'));
  console.log('city.glb', (size / 1024).toFixed(0), 'KB');
  return lines;
}

// ---------------------------------------------------------------- OBJ packs

function parseMtl(text) {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'newmtl') cur = t[1];
    else if (t[0] === 'Kd' && cur) out[cur] = t.slice(1, 4).map(Number);
  }
  return out;
}

/** An OBJ as [{ material, pos, idx }] (one entry per material, positions welded per material). */
function readObj(file) {
  const V = [];
  const byMat = new Map();
  let cur = 'none';
  for (const line of readFileSync(file, 'utf8').split('\n')) {
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
  return [...byMat].map(([material, list]) => {
    const used = new Map(), P = [];
    const idx = new Uint32Array(list.length);
    list.forEach((v, i) => { let k = used.get(v); if (k === undefined) { k = P.length / 3; used.set(v, k); P.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]); } idx[i] = k; });
    return { material, ...weld(new Float32Array(P), null, idx) };
  });
}

/**
 * An OBJ model normalised: rotated (`rot` degrees about x, y, z), scaled to `length` metres along
 * z (or `height` along y, or by `scale`), centred on x/z, standing on y = 0, simplified per
 * material; `squash` narrows a toy-proportioned model (x, y factors). `kind(m)` / `color(m)` decide
 * each material's vertex data.
 */
function objModel(file, o) {
  const parts = readObj(file);
  let mat = euler(...(o.rot ?? [0, 0, 0]));
  let all = concat(parts.map((p) => transform(p.pos, mat)));
  let b = bounds(all);
  const size = b.mx.map((v, k) => v - b.mn[k]);
  const s = o.scale ?? (o.length ? o.length / size[2] : o.height ? o.height / size[1] : 1);
  const [qx, qy] = o.squash ?? [1, 1];
  mat = mul(trs([-(b.mn[0] + b.mx[0]) / 2 * s * qx, -b.mn[1] * s * qy, -(b.mn[2] + b.mx[2]) / 2 * s], [0, 0, 0, 1], [s * qx, s * qy, s]), mat);
  // a vehicle whose head lights sit at -z turns round
  if (o.faceLights) {
    const hl = parts.filter((p) => o.faceLights.includes(p.material));
    const z = hl.length ? bounds(transform(concat(hl.map((p) => p.pos)), mat)) : null;
    if (z && z.mn[2] + z.mx[2] < 0) mat = mul(yaw(180), mat);
  }
  let before = 0, after = 0;
  const P = [], C = [], K = [], I = [];
  for (const p of parts) {
    let m = { pos: transform(p.pos, mat), uv: null, idx: p.idx };
    before += m.idx.length / 3;
    m = simplify(m, o.ratio ?? 1, 0.01);
    after += m.idx.length / 3;
    const base = P.length / 3;
    const col = o.color(p.material);
    const kind = o.kind?.(p.material) ?? 0;
    for (let i = 0; i < m.pos.length; i++) P.push(m.pos[i]);
    for (let i = 0; i < m.pos.length / 3; i++) { C.push(...col); K.push(kind); }
    for (const i of m.idx) I.push(i + base);
  }
  all = new Float32Array(P);
  b = bounds(all);
  return { pos: all, col: new Float32Array(C), kind: new Uint8Array(K), idx: new Uint32Array(I), before, after, size: b.mx.map((v, k) => v - b.mn[k]) };
}

const fmt = (m) => `${m.size.map((v) => v.toFixed(2)).join('x')} ${m.before}→${m.after} tris`;

// ---------------------------------------------------------------- wheels

/**
 * Takes the wheels out of a vehicle `{ pos, col, kind, idx }` (one primitive, model space). Tyres:
 * dark connected parts that touch the ground (y < 3 cm), stand under 0.9 m, are at most 0.5 m wide
 * and sit off the centre line; each part wholly inside a tyre's box (rim, slots, nuts) goes with
 * it. Returns the body without them and the wheels' extras, or wheels null (no four tyres found).
 */
function splitWheels(m) {
  const nv = m.pos.length / 3;
  const par = new Int32Array(nv).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let i = 0; i < m.idx.length; i += 3) { const a = find(m.idx[i]); par[find(m.idx[i + 1])] = a; par[find(m.idx[i + 2])] = a; }
  const parts = new Map();
  for (let v = 0; v < nv; v++) {
    const r = find(v);
    let p = parts.get(r);
    if (!p) { p = { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], dark: 0, n: 0, col: [0, 0, 0] }; parts.set(r, p); }
    p.n++;
    for (let k = 0; k < 3; k++) { p.mn[k] = Math.min(p.mn[k], m.pos[v * 3 + k]); p.mx[k] = Math.max(p.mx[k], m.pos[v * 3 + k]); p.col[k] += m.col[v * 3 + k]; }
    if (lum([m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]]) < 0.06 && m.kind[v] === KIND.body) p.dark++;
  }
  const all = bounds(m.pos);
  const halfW = (all.mx[0] - all.mn[0]) / 2;
  const tyres = [...parts.values()].filter((p) => p.mn[1] < 0.03 && p.mx[1] < 0.9 && p.mx[0] - p.mn[0] < 0.5 && p.dark > p.n * 0.8
    && Math.abs((p.mn[0] + p.mx[0]) / 2) > halfW * 0.4);
  if (tyres.length !== 4) return { body: m, wheels: null };
  const inside = (p, t) => [0, 1, 2].every((k) => p.mn[k] >= t.mn[k] - 0.03 && p.mx[k] <= t.mx[k] + 0.03);
  const drop = new Set();
  let rim = null;
  for (const [root, p] of parts) {
    const t = tyres.find((ty) => inside(p, ty));
    if (!t) continue;
    drop.add(root);
    // the rim: the biggest light part in a tyre
    if (p !== t && p.n > 20 && (!rim || p.n > rim.n)) rim = p;
  }
  // the body: triangles of the parts kept, vertices compacted
  const keep = [];
  for (let i = 0; i < m.idx.length; i += 3) if (!drop.has(find(m.idx[i]))) keep.push(m.idx[i], m.idx[i + 1], m.idx[i + 2]);
  const map = new Int32Array(nv).fill(-1), P = [], C = [], K = [];
  const idx = new Uint32Array(keep.length);
  keep.forEach((v, i) => {
    if (map[v] < 0) { map[v] = P.length / 3; P.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); C.push(m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]); K.push(m.kind[v]); }
    idx[i] = map[v];
  });
  // one size for the four, round: the larger of the tyres' height and length (the cars' hexagons
  // stand on a corner, the buses' tyres are squashed in y; the body hides the top)
  const r = tyres.reduce((a, t) => a + Math.max(t.mx[1] - t.mn[1], t.mx[2] - t.mn[2]), 0) / 8;
  const w = tyres.reduce((a, t) => a + (t.mx[0] - t.mn[0]), 0) / 4;
  const hubs = tyres.map((t) => [(t.mn[0] + t.mx[0]) / 2, r, (t.mn[2] + t.mx[2]) / 2].map((v) => +v.toFixed(3)))
    .sort((a, b) => b[2] - a[2] || b[0] - a[0]);
  // the rim's colour (linear), lightened so the spokes read at night
  const rc = rim ? rim.col.map((v) => v / rim.n) : [0.16, 0.16, 0.16];
  const rimColor = rc.map((v) => +Math.min(0.75, Math.max(0.42, v * 3.2)).toFixed(3));
  const body = { ...m, pos: new Float32Array(P), col: new Float32Array(C), kind: new Uint8Array(K), idx };
  return { body, wheels: { r: +r.toFixed(3), w: +w.toFixed(3), hubs, rim: rimColor }, dropped: nv - P.length / 3 };
}

/**
 * The shared wheel: radius 1, width 1, the axle along x with the hub at the origin, the outer face
 * at +x. A round tyre of SEG sides (tread, both side walls, a lip down to the recessed rim) and the
 * rim's disc (KIND.rim, white: the game's shader paints its spokes and colour; the tread is
 * KIND.tread for its grooves).
 */
function wheelModel(SEG = 20) {
  const P = [], C = [], K = [], I = [];
  const TYRE = [0.03, 0.03, 0.033], WALL = [0.03, 0.03, 0.034], INNER = [0.01, 0.01, 0.012];
  const RIM_R = 0.64, INSET = 0.38;
  const ring = (x, r, col, kind) => {
    const base = P.length / 3;
    for (let i = 0; i < SEG; i++) { const a = (i / SEG) * Math.PI * 2; P.push(x, Math.cos(a) * r, Math.sin(a) * r); C.push(...col); K.push(kind); }
    return base;
  };
  const centre = (x, col, kind) => { P.push(x, 0, 0); C.push(...col); K.push(kind); return P.length / 3 - 1; };
  // quads between two rings (a, b), facing out of the side `flip` decides
  const band = (a, b, flip) => {
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      if (flip) I.push(a + i, b + i, b + j, a + i, b + j, a + j); else I.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  };
  const fan = (c, a, flip) => { for (let i = 0; i < SEG; i++) { const j = (i + 1) % SEG; if (flip) I.push(c, a + j, a + i); else I.push(c, a + i, a + j); } };
  const treadOut = ring(0.5, 1, TYRE, KIND.tread), treadIn = ring(-0.5, 1, TYRE, KIND.tread);
  band(treadIn, treadOut, false);
  const wallOut = ring(0.5, 1, WALL, KIND.body), lipOut = ring(0.5, RIM_R, WALL, KIND.body);
  band(lipOut, wallOut, true);
  const lipIn = ring(INSET, RIM_R, INNER, KIND.body);
  band(lipIn, lipOut, true);
  const rimRing = ring(INSET, RIM_R, [1, 1, 1], KIND.rim);
  fan(centre(INSET, [1, 1, 1], KIND.rim), rimRing, false);
  const backRing = ring(-0.5, 1, INNER, KIND.body);
  fan(centre(-0.5, INNER, KIND.body), backRing, true);
  return { pos: new Float32Array(P), col: new Float32Array(C), kind: new Uint8Array(K), idx: new Uint32Array(I) };
}

// ---------------------------------------------------------------- cars

/** The body paint of each car (its stock colour stays in the node's extras). */
const CAR_PAINT = { NormalCar1: ['Blue'], NormalCar2: ['LightBlue'], SUV: ['White'], SportsCar: ['Orange', 'DarkOrange'], SportsCar2: ['White'], Taxi: ['Yellow'] };

function cars() {
  const out = join(ROOT, 'city-cars');
  mkdirSync(out, { recursive: true });
  const glb = new Glb();
  const lines = [];
  for (const name of ['NormalCar1', 'NormalCar2', 'SUV', 'SportsCar', 'SportsCar2', 'Taxi', 'Cop']) {
    const kd = parseMtl(readFileSync(join(kitsDir, 'cars', name + '.mtl'), 'utf8'));
    const paint = CAR_PAINT[name] ?? [];
    const stock = paint.length ? kd[paint[0]] : null;
    const kindOf = (m) => paint.includes(m) ? KIND.paint : m === 'Headlights' ? KIND.head : m === 'TailLights' ? KIND.tail : m === 'Windows' ? KIND.glass
      : m === 'BlueLights' ? KIND.blue : m === 'WhiteLights' ? KIND.red : KIND.body;
    const m = objModel(join(kitsDir, 'cars', name + '.obj'), {
      ratio: 0.42, faceLights: ['Headlights'],
      kind: kindOf,
      // paint: the brightness against the stock colour (the game multiplies its own paint in)
      color: (mt) => paint.includes(mt) ? (() => { const k = Math.min(1, lum(kd[mt]) / lum(stock)); return [k, k, k]; })() : kd[mt] ?? [0.5, 0.5, 0.5],
    });
    const { body, wheels } = splitWheels(m);
    glb.model(name, [{ ...body, material: 'vehicle' }], { ...(stock ? { paint: stock } : {}), ...(wheels ? { wheels } : {}) });
    lines.push(`${name} ${fmt(m)}`);
  }
  glb.model('Wheel', [{ ...wheelModel(), material: 'vehicle' }]);
  const size = glb.write(join(out, 'cars.glb'));
  copyFileSync(join(kitsDir, 'cars', 'License.txt'), join(out, 'license.txt'));
  console.log(lines.join('\n'));
  console.log('cars.glb', (size / 1024).toFixed(0), 'KB');
  return lines;
}

// ---------------------------------------------------------------- public transport

/** The transport pack's MTL colours are all grey: colours from its preview, per model and material (sRGB). */
const TRANSPORT = {
  Bus: { length: 10.5, rot: [0, 90, 0], squash: [0.6, 0.78], colors: { Top: 0x3d7fd6, Bottom: 0x24508f, Bumper: 0x3a3d44, Details: 0x1b1d22, Lights: 0xfff1c2, Material: 0x2b2e35, Windows: 0x8fd3e8 }, kinds: { Lights: KIND.head, Windows: KIND.glass, Top: KIND.paint } },
  SchoolBus: { length: 9.5, rot: [0, 90, 0], squash: [0.62, 0.72], colors: { Yellow: 0xf2bf3a, Bumper: 0x2f3036, Details: 0x1b1d22, Lights: 0xfff1c2, Wheel: 0x1d1f24, Windows: 0x67c8e6 }, kinds: { Lights: KIND.head, Windows: KIND.glass } },
  Ambulance: { length: 6.2, squash: [0.78, 0.92], colors: { White: 0xf3f3f1, Red: 0xe03a2f, Bumper: 0x4c4f56, Grey: 0x8e939b, Lights: 0xfff1c2, Material: 0x2b2e35, Windows: 0x4e87d6 }, kinds: { Lights: KIND.head, Windows: KIND.glass, Red: KIND.red } },
  TrafficLight: { height: 4.6, colors: { TrafficLight: 0x2b2d31, Red: 0x6a1410, Yellow: 0x6a5410, Green: 0x0f5a24 }, kinds: { Red: KIND.lampR, Yellow: KIND.lampY, Green: KIND.lampG } },
  TrafficCone: { height: 0.75, colors: { Orange: 0xff6a1a, White: 0xf4f4f4 } },
  TrafficSign1: { height: 2.6, colors: { Sign: 0xd8342a, Border: 0xf4f4f4 } },
  TrafficSign2: { height: 2.6, colors: { Sign: 0xf4f4f4, Border: 0xd8342a, Pole: 0x9a9ea6 } },
  TrafficSign3: { height: 2.6, colors: { Sign: 0xd8342a, Border: 0xf4f4f4, Pole: 0x9a9ea6 } },
};

function transport() {
  const out = join(ROOT, 'public-transport');
  mkdirSync(out, { recursive: true });
  const glb = new Glb();
  const lines = [];
  for (const [name, cfg] of Object.entries(TRANSPORT)) {
    const m = objModel(join(kitsDir, 'transport', name + '.obj'), {
      ...cfg, ratio: cfg.height ? 0.4 : 0.6, faceLights: cfg.kinds?.Lights === KIND.head ? ['Lights'] : undefined,
      color: (mt) => lin(cfg.colors[mt] ?? 0x808080),
      kind: (mt) => cfg.kinds?.[mt] ?? KIND.body,
    });
    const { body, wheels } = splitWheels(m);
    glb.model(name, [{ ...body, material: 'vehicle' }], wheels ? { wheels } : undefined);
    lines.push(`${name} ${fmt(m)}`);
  }
  const size = glb.write(join(out, 'transport.glb'));
  copyFileSync(join(kitsDir, 'transport', 'License.txt'), join(out, 'license.txt'));
  console.log(lines.join('\n'));
  console.log('transport.glb', (size / 1024).toFixed(0), 'KB');
  return lines;
}

// ---------------------------------------------------------------- town buildings

/** The Buildings Pack: scaled to metres; the dark panes are window glass (lit at night). */
const BUILDINGS = { Building1_Large: 3, Building1_Small: 3, Building2_Large: 3, Building2_Small: 3, Building3_Big: 3, Building3_Small: 3, Building4: 3, House1: 3, House2: 3 };
const GLASS_MTL = new Set(['DarkGrey']);

function town() {
  const out = join(ROOT, 'town-buildings');
  mkdirSync(out, { recursive: true });
  const glb = new Glb();
  const lines = [];
  for (const [name, scale] of Object.entries(BUILDINGS)) {
    const kd = parseMtl(readFileSync(join(kitsDir, 'buildings', name + '.mtl'), 'utf8'));
    const parts = readObj(join(kitsDir, 'buildings', name + '.obj'));
    // centred on x, the front (+z) face at z = 0, standing on y = 0
    const all = concat(parts.map((p) => p.pos));
    const b = bounds(all);
    const mat = trs([-(b.mn[0] + b.mx[0]) / 2 * scale, -b.mn[1] * scale, -b.mx[2] * scale], [0, 0, 0, 1], [scale, scale, scale]);
    const prims = [];
    let before = 0, after = 0;
    const byLayer = { white: { pos: [], col: [], idx: [] }, glass: { pos: [], col: [], idx: [] } };
    for (const p of parts) {
      let m = { pos: transform(p.pos, mat), uv: null, idx: p.idx };
      before += m.idx.length / 3;
      m = simplify(m, name.startsWith('House') || name === 'Building1_Large' || name === 'Building1_Small' ? 0.13 : 0.32, 0.02);
      after += m.idx.length / 3;
      const g = byLayer[GLASS_MTL.has(p.material) ? 'glass' : 'white'];
      // Blender wrote Kd × 0.8; a little brighter for the street lights (as the nature pack)
      const c = (kd[p.material] ?? [0.5, 0.5, 0.5]).map((v) => Math.min(1, v * 1.35));
      const base = g.pos.length / 3;
      for (const v of m.pos) g.pos.push(v);
      for (let i = 0; i < m.pos.length / 3; i++) g.col.push(...(GLASS_MTL.has(p.material) ? [1, 1, 1] : c));
      for (const i of m.idx) g.idx.push(i + base);
    }
    for (const [layer, g] of Object.entries(byLayer)) {
      if (!g.idx.length) continue;
      const n = g.pos.length / 3;
      prims.push({ pos: new Float32Array(g.pos), col: new Float32Array(g.col), idx: new Uint32Array(g.idx), material: layer });
    }
    glb.model(name, prims);
    const bb = bounds(concat(prims.map((p) => p.pos)));
    lines.push(`${name} ${bb.mx.map((v, k) => (v - bb.mn[k]).toFixed(2)).join('x')} ${before}→${after} tris`);
  }
  const size = glb.write(join(out, 'buildings.glb'));
  copyFileSync(join(kitsDir, 'buildings', 'License.txt'), join(out, 'license.txt'));
  console.log(lines.join('\n'));
  console.log('buildings.glb', (size / 1024).toFixed(0), 'KB');
  return lines;
}

// ---------------------------------------------------------------- re-splitting the wheels

/** Reads a GLB this script wrote: per root node its name, extras and one primitive as plain arrays. */
function readGlb(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8);
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const size = { 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const stride = bv.byteStride ?? comps * size;
    const out = new Float64Array(a.count * comps);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) {
      const o = bv.byteOffset + (a.byteOffset ?? 0) + k * stride + c * size;
      out[k * comps + c] = a.componentType === 5122 ? bin.readInt16LE(o) : a.componentType === 5121 ? bin[o] : a.componentType === 5123 ? bin.readUInt16LE(o) : a.componentType === 5125 ? bin.readUInt32LE(o) : bin.readFloatLE(o);
    }
    return out;
  };
  return json.scenes[0].nodes.map((ni) => {
    const n = json.nodes[ni];
    const prim = json.meshes[n.mesh].primitives[0];
    const q = acc(prim.attributes.POSITION);
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = q[i] * n.scale[i % 3] + n.translation[i % 3];
    const col = Float32Array.from(acc(prim.attributes.COLOR_0), (v) => v / 255);
    const kind = Uint8Array.from(acc(prim.attributes._KIND));
    return { name: n.name, extras: n.extras, pos, col, kind, idx: Uint32Array.from(acc(prim.indices)) };
  });
}

/** Splits the wheels of the vehicles already imported (the kits are not needed): rewrites both files. */
function resplitWheels() {
  for (const [file, withWheel] of [['city-cars/cars.glb', true], ['public-transport/transport.glb', false]]) {
    const glb = new Glb();
    const models = readGlb(join(ROOT, file));
    // already split: the tyres are gone, so start again from the kits (a full import)
    if (models.some((m) => m.name === 'Wheel' || m.extras?.wheels)) throw new Error(file + ': the wheels are split already');
    for (const m of models) {
      const { extras = {} } = m;
      const { body, wheels, dropped } = splitWheels(m);
      if (wheels) console.log(m.name, 'wheels', JSON.stringify(wheels), '−' + dropped, 'vertices');
      const ex = { ...extras, ...(wheels ? { wheels } : {}) };
      glb.model(m.name, [{ ...body, material: 'vehicle' }], Object.keys(ex).length ? ex : undefined);
    }
    if (withWheel) glb.model('Wheel', [{ ...wheelModel(), material: 'vehicle' }]);
    const size = glb.write(join(ROOT, file));
    console.log(file, (size / 1024).toFixed(1), 'KB');
  }
}

if (kitsDir === '--wheels') resplitWheels();
else {
  const which = process.argv[4]?.split(',') ?? ['downtown', 'cars', 'transport', 'town'];
  const report = {};
  if (which.includes('downtown')) report.downtown = downtown();
  if (which.includes('cars')) report.cars = cars();
  if (which.includes('transport')) report.transport = transport();
  if (which.includes('town')) report.town = town();
  writeFileSync(join(layersDir, 'import-report.json'), JSON.stringify(report, null, 1));
  for (const f of ['downtown-city/city.glb', 'city-cars/cars.glb', 'public-transport/transport.glb', 'town-buildings/buildings.glb']) {
    try { console.log(f, statSync(join(ROOT, f)).size); } catch { /* not written this run */ }
  }
}
