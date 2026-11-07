// Lists the GLB models of a 3D pack with file size and bounding box, for docs/assets/<pack>.txt.
// Usage: node tools/index-3d.mjs <pack> [<pack> ...]   (packs under public/assets/kenney)
// The box is read from the POSITION accessors' min/max with each node's translation and scale,
// in model units (Kenney kits: 1 unit is about one tile). Rotated nodes are approximated.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'public', 'assets', 'kenney');

function glbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

function bbox(json) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visit = (i, t = [0, 0, 0], s = [1, 1, 1]) => {
    const n = json.nodes[i];
    const nt = n.translation ?? [0, 0, 0], ns = n.scale ?? [1, 1, 1];
    const T = t.map((v, k) => v + nt[k] * s[k]);
    const S = s.map((v, k) => v * ns[k]);
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        if (!acc?.min) continue;
        for (let k = 0; k < 3; k++) {
          const a = acc.min[k] * S[k] + T[k], b = acc.max[k] * S[k] + T[k];
          min[k] = Math.min(min[k], a, b);
          max[k] = Math.max(max[k], a, b);
        }
      }
    }
    for (const c of n.children ?? []) visit(c, T, S);
  };
  for (const i of json.scenes[json.scene ?? 0].nodes) visit(i);
  return max.map((v, k) => v - min[k]);
}

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

for (const pack of process.argv.slice(2)) {
  const lines = [];
  for (const file of walk(join(base, pack)).filter((f) => f.endsWith('.glb')).sort()) {
    const buf = readFileSync(file);
    const [w, h, d] = bbox(glbJson(buf)).map((v) => v.toFixed(2));
    lines.push(`${relative(base, file)} ${Math.round(buf.length / 1024)}KB ${w}x${h}x${d}`);
  }
  writeFileSync(join(root, 'docs', 'assets', `${pack}.txt`), lines.join('\n') + '\n');
  console.log(`${pack}: ${lines.length} models`);
}
