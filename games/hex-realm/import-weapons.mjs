// Hex Realm 1.2: how the weapons were made. Kept as a record and for a re-import; not part of the
// build. Nothing from the source folder is run: the OBJ and MTL files are read as text and rewritten.
//
//   node games/hex-realm/import-weapons.mjs <weapons dir> <node_modules>
//     <weapons dir>    the owner-shared Quaternius "Medieval Weapons" folder (Sword.obj, Sword.mtl ... License.txt; CC0)
//     <node_modules>   with @gltf-transform/core + /extensions + /functions and sharp
//
// public/assets/quaternius/medieval-weapons/weapons.glb: one mesh node per weapon the game uses
// (WEAPON_MODELS in weapons.ts), named after it. The models keep their own frame (+Y from the grip
// towards the tip, +X the blade's or the bow's width, the grip at the origin) and scale; the flat
// MTL colours become vertex colours (one material for all); no normals (the game draws them with flat
// shading, the faces' own normals), so weld shares every corner of a colour; then dedup, simplify to
// about half the triangles (meshopt, a small error bound) and quantize (KHR_mesh_quantization).
// public/assets/quaternius/medieval-weapons/icons/<Model>.png: a 96 px icon of each weapon (not the arrow), drawn by
// a tiny software rasteriser here (flat shading of the vertex colours, a soft light, an ink outline
// like the game's painted icons), so the game shows the real weapon without rendering it in 3D.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdirSync, readFileSync, statSync } from 'node:fs';

const [src, nm] = process.argv.slice(2);
if (!src || !nm) throw new Error('usage: node import-weapons.mjs <weapons dir> <node_modules>');
const req = createRequire(join(nm, 'x.js'));
const { Document, NodeIO } = req('@gltf-transform/core');
const { KHRMeshQuantization } = req('@gltf-transform/extensions');
const { weld, dedup, quantize, prune, simplify } = req('@gltf-transform/functions');
const { MeshoptSimplifier } = req('meshoptimizer');
const sharp = req('sharp');

const OUT = join(import.meta.dirname, '../../public/assets/quaternius/medieval-weapons');
mkdirSync(join(OUT, 'icons'), { recursive: true });

const MODELS = [
  'Sword', 'Sword_2', 'Sword_Big', 'Sword_Golden', 'Claymore', 'Axe', 'Axe_Small', 'Axe_Double', 'Hammer_Small', 'Hammer_Double',
  'Dagger', 'Dagger_2', 'Spear', 'Scythe', 'Bow_Wooden', 'Bow_Wooden2', 'Bow_Evil', 'Bow_Golden',
  'Shield_Round', 'Shield_Round_2', 'Shield_Heater', 'Shield_Heater_2', 'Shield_Celtic_Golden', 'Arrow',
];

/** Reads an MTL's diffuse colours. */
function readMtl(text) {
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'newmtl') cur = p.slice(1).join(' ');
    else if (p[0] === 'Kd' && cur) out[cur] = [Number(p[1]), Number(p[2]), Number(p[3])];
  }
  return out;
}

/** Reads an OBJ into flat triangles: positions, normals and colours per corner. */
function readObj(text, mtl) {
  const v = [], vn = [];
  const pos = [], nor = [], col = [];
  let kd = [0.6, 0.6, 0.6];
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    else if (p[0] === 'vn') vn.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    else if (p[0] === 'usemtl') kd = mtl[p.slice(1).join(' ')] ?? kd;
    else if (p[0] === 'f') {
      const corners = p.slice(1).map((s) => { const [a, , c] = s.split('/'); return [Number(a) - 1, c ? Number(c) - 1 : -1]; });
      for (let k = 1; k + 1 < corners.length; k++) {
        const tri = [corners[0], corners[k], corners[k + 1]];
        const a = v[tri[0][0]], b = v[tri[1][0]], c = v[tri[2][0]];
        // the face normal (the faces are flat: 's off')
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        for (const [vi] of tri) { pos.push(...v[vi]); nor.push(nx, ny, nz); col.push(...kd); }
      }
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}

// ---------------------------------------------------------------- the icons

/** Draws a weapon into an RGBA buffer (4× supersampled, then scaled down by sharp). */
async function icon(name, m) {
  const S = 384, pad = 40;
  // turn it to read well: blades and bows on the diagonal (tip up-right), shields face on
  const shield = name.startsWith('Shield');
  const a = shield ? 0 : -Math.PI / 4;
  const rx = shield ? 0 : -0.35;
  const P = [];
  for (let i = 0; i < m.pos.length; i += 3) {
    let x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    // a little turn round y (shows the blade's bevel), then the roll onto the diagonal
    const cy = Math.cos(rx), sy = Math.sin(rx);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const c = Math.cos(a), s = Math.sin(a);
    [x, y] = [x * c - y * s, x * s + y * c];
    P.push([x, y, z]);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = (S - pad * 2) / Math.max(x1 - x0, y1 - y0);
  const ox = S / 2 - ((x0 + x1) / 2) * k, oy = S / 2 + ((y0 + y1) / 2) * k;
  const rgb = new Float32Array(S * S * 3), zb = new Float32Array(S * S).fill(-Infinity), cover = new Uint8Array(S * S);
  const L = [-0.45, 0.65, 0.62]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  for (let t = 0; t < P.length; t += 3) {
    const pa = P[t], pb = P[t + 1], pc = P[t + 2];
    // the normal after the turn
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const light = 0.45 + 0.75 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const ci = t * 3;
    // MTL colours are linear: to sRGB for the picture
    const srgb = (v) => Math.min(1, Math.pow(Math.max(0, v * light), 1 / 2.2));
    const cr = srgb(m.col[ci]), cg = srgb(m.col[ci + 1]), cb = srgb(m.col[ci + 2]);
    const sx = [pa, pb, pc].map((p) => ox + p[0] * k), sy = [pa, pb, pc].map((p) => oy - p[1] * k), sz = [pa[2], pb[2], pc[2]];
    const minx = Math.max(0, Math.floor(Math.min(...sx))), maxx = Math.min(S - 1, Math.ceil(Math.max(...sx)));
    const miny = Math.max(0, Math.floor(Math.min(...sy))), maxy = Math.min(S - 1, Math.ceil(Math.max(...sy)));
    const den = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2]);
    if (Math.abs(den) < 1e-9) continue;
    for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
      const qx = px + 0.5, qy = py + 0.5;
      const w0 = ((sy[1] - sy[2]) * (qx - sx[2]) + (sx[2] - sx[1]) * (qy - sy[2])) / den;
      const w1 = ((sy[2] - sy[0]) * (qx - sx[2]) + (sx[0] - sx[2]) * (qy - sy[2])) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];
      const i = py * S + px;
      if (z <= zb[i]) continue;
      zb[i] = z; cover[i] = 1;
      rgb[i * 3] = cr; rgb[i * 3 + 1] = cg; rgb[i * 3 + 2] = cb;
    }
  }
  // the ink outline: every empty pixel within 10 px (2.5 px at 96) of the weapon
  const out = Buffer.alloc(S * S * 4);
  const R = 10;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (cover[i]) { out[i * 4] = rgb[i * 3] * 255; out[i * 4 + 1] = rgb[i * 3 + 1] * 255; out[i * 4 + 2] = rgb[i * 3 + 2] * 255; out[i * 4 + 3] = 255; continue; }
    let near = false;
    for (let dy = -R; dy <= R && !near; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      if (dx * dx + dy * dy > R * R) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < S && yy < S && cover[yy * S + xx]) { near = true; break; }
    }
    if (near) { out[i * 4] = 0x1a; out[i * 4 + 1] = 0x14; out[i * 4 + 2] = 0x20; out[i * 4 + 3] = 255; }
  }
  await sharp(out, { raw: { width: S, height: S, channels: 4 } }).resize(96, 96, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(join(OUT, 'icons', name + '.png'));
}

// ---------------------------------------------------------------- the GLB

const doc = new Document();
const buf = doc.createBuffer();
const mat = doc.createMaterial('weapon').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.75).setMetallicFactor(0);
const scene = doc.createScene('weapons');
for (const name of MODELS) {
  const mtl = readMtl(readFileSync(join(src, name + '.mtl'), 'utf8'));
  const m = readObj(readFileSync(join(src, name + '.obj'), 'utf8'), mtl);
  // the arrow lies along +z in the source: stand it up like the others (+y towards the point)
  if (name === 'Arrow') for (let i = 0; i < m.pos.length; i += 3) { const y = m.pos[i + 1], z = m.pos[i + 2]; m.pos[i + 1] = z; m.pos[i + 2] = -y; const ny = m.nor[i + 1], nz = m.nor[i + 2]; m.nor[i + 1] = nz; m.nor[i + 2] = -ny; }
  if (name !== 'Arrow') await icon(name, m);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(m.col).setBuffer(buf))
    .setMaterial(mat);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
doc.createExtension(KHRMeshQuantization).setRequired(true);
await MeshoptSimplifier.ready;
await doc.transform(weld(), dedup(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.004 }), quantize({ quantizePosition: 14, quantizeColor: 8 }), prune());
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
await io.write(join(OUT, 'weapons.glb'), doc);
console.log('weapons.glb', statSync(join(OUT, 'weapons.glb')).size, 'bytes');
