// Kickflip Park: how public/assets/boards/blueskateboard3d.glb was made from the owner's 1.9 MB
// Tripo export (kept as a record and for a new export of the board; not part of the game build).
//
// 1. Textures (Python + Pillow), from the export's nine base-colour JPEGs (tex0 = part 0 … tex8):
//      deck.jpg   = tex0 resized to 512 × 512 (LANCZOS, JPEG quality 86)
//      trucks.jpg = a 256 × 256 atlas of tex1, tex3, tex5, tex6 at 128 px (row by row), quality 85
//      wheels.jpg = the same of tex2, tex4, tex7, tex8
// 2. This script (needs @gltf-transform/core, /extensions and /functions, e.g. in a scratch folder):
//      node optimise-board.mjs <export.glb> <out.glb> deck.jpg trucks.jpg wheels.jpg
// The black board (public/assets/boards/skateboard3d_black.glb) is one Tripo mesh of about 1M
// vertices; it went through the gltf-transform CLI instead: weld, simplify --ratio 0.012 --error
// 0.0005, resize --width 512 --height 512, prune; then KHR_materials_volume dropped, mesh, material
// and texture named 'board' (as below), and quantize (KHR_mesh_quantization).
//
// What it does:
//   - the deck texture resized to 512 px (JPEG);
//   - the eight truck and wheel textures (512 px each) packed into two 256 px atlases, one for the
//     trucks and one for the wheels (128 px a part), their UVs moved into their cells;
//   - the 9 parts joined into three meshes named by their material: deck, truck, wheel;
//   - unused extensions (KHR_materials_volume, FB_ngon_encoding) dropped.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, prune, dedup, weld } from '@gltf-transform/functions';
import { readFileSync } from 'node:fs';
const [src, out, deckJpg, trucksJpg, wheelsJpg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
for (const ext of root.listExtensionsUsed()) ext.dispose();
const tex = (name, file) => doc.createTexture(name).setImage(readFileSync(file)).setMimeType('image/jpeg').setURI(name + '.jpg');
const mat = (name, t) => doc.createMaterial(name).setBaseColorTexture(t).setMetallicFactor(0).setRoughnessFactor(0.6);
const truck = mat('truck', tex('trucks', trucksJpg)), wheel = mat('wheel', tex('wheels', wheelsJpg));
const TRUCKS = [1, 3, 5, 6], WHEELS = [2, 4, 7, 8];
const inset = 1.5 / 128;
for (const node of root.listNodes()) {
  const m = /tripo_part_(\d+)/.exec(node.getName());
  if (!m || !node.getMesh()) continue;
  const i = Number(m[1]);
  for (const prim of node.getMesh().listPrimitives()) {
    if (i === 0) {
      const mt = prim.getMaterial().setName('deck').setMetallicFactor(0).setRoughnessFactor(0.6).setDoubleSided(false);
      mt.getBaseColorTexture().setName('deck').setImage(readFileSync(deckJpg)).setMimeType('image/jpeg').setURI('deck.jpg');
      continue;
    }
    const list = TRUCKS.includes(i) ? TRUCKS : WHEELS, k = list.indexOf(i);
    const col = k % 2, row = Math.floor(k / 2);
    const uv = prim.getAttribute('TEXCOORD_0');
    const e = [0, 0];
    for (let v = 0; v < uv.getCount(); v++) {
      uv.getElement(v, e);
      uv.setElement(v, [(col + inset + e[0] * (1 - 2 * inset)) / 2, (row + inset + e[1] * (1 - 2 * inset)) / 2]);
    }
    prim.setMaterial(TRUCKS.includes(i) ? truck : wheel);
  }
}
await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld(), prune());
for (const n of root.listNodes()) { const mt = n.getMesh()?.listPrimitives()[0]?.getMaterial(); if (mt) n.setName(mt.getName()); }
await io.write(out, doc);
console.log('nodes', root.listNodes().map((n) => n.getName()), 'textures', root.listTextures().map((t) => t.getName()));
