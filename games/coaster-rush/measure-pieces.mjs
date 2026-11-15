// Coaster Rush: measures the centre line of every Coaster Kit track piece and writes pieces.ts.
// Run: node games/coaster-rush/measure-pieces.mjs
//
// The steel pieces are measured (every style shares the same lines): a piece is split into its
// connected parts; the spine tube (nearest to the track's centre at the entry) and the two rails
// are swept tubes of eight-point rings. Ring by ring, the rails' mid-point and the direction from
// the spine to it give the track's up vector; a quarter unit below the rails' mid-point is the
// track's bottom line (y = −1 at a straight's entry). The ends are snapped to the kit's lattice.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal GLB reader: world-space triangles of every mesh node (positions only) + materials.
function readGlb(file) {
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dv = new DataView(ab);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = new DataView(ab, 20 + jsonLen + 8, binLen);
  return { json, bin };
}
function acc(json, bin, i) {
  const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const cs = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 || a.componentType === 5122 ? 2 : 1;
  const stride = bv.byteStride ?? size * cs; const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return { count: a.count, get(k, c) { const o = base + k * stride + c * cs; switch (a.componentType) { case 5126: return bin.getFloat32(o, true); case 5125: return bin.getUint32(o, true); case 5123: return bin.getUint16(o, true); case 5121: return bin.getUint8(o); default: return 0; } } };
}
function mul(a, b) { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; }
function compose(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q; const x2 = x + x, y2 = y + y, z2 = z + z; const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
function triangles(file) {
  const { json, bin } = readGlb(file);
  const out = []; // {mat, name, pts:[x,y,z]...}
  const visit = (i, parent) => {
    const n = json.nodes[i];
    const local = n.matrix ?? compose(n.translation, n.rotation, n.scale);
    const w = mul(parent, local);
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      const P = acc(json, bin, p.attributes.POSITION); const I = p.indices !== undefined ? acc(json, bin, p.indices) : null;
      const cnt = I ? I.count : P.count; const pts = [];
      for (let k = 0; k < cnt; k++) { const id = I ? I.get(k, 0) : k; const x = P.get(id, 0), y = P.get(id, 1), z = P.get(id, 2);
        pts.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]); }
      out.push({ node: n.name, mesh: json.meshes[n.mesh].name, mat: json.materials?.[p.material]?.name, pts });
    }
    for (const c of n.children ?? []) visit(c, w);
  };
  for (const i of json.scenes[json.scene ?? 0].nodes) visit(i, [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  return { json, out };
}
function bbox(pts) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < pts.length; i += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], pts[i + c]); mx[c] = Math.max(mx[c], pts[i + c]); } return { mn, mx }; }

function components(file) {
  const { out } = triangles(file);
  const pts = out.flatMap((o) => o.pts);
  const key = (i) => `${pts[i].toFixed(4)},${pts[i + 1].toFixed(4)},${pts[i + 2].toFixed(4)}`;
  const id = new Map(); const par = [];
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const vid = []; for (let i = 0; i < pts.length; i += 3) { const k = key(i); if (!id.has(k)) { id.set(k, par.length); par.push(par.length); } vid.push(id.get(k)); }
  for (let t = 0; t < vid.length; t += 3) { const a = find(vid[t]); par[find(vid[t + 1])] = a; par[find(vid[t + 2])] = a; }
  const comps = new Map();
  for (let v = 0; v < vid.length; v++) { const r = find(vid[v]); if (!comps.has(r)) comps.set(r, []); comps.get(r).push([pts[v * 3], pts[v * 3 + 1], pts[v * 3 + 2]]); }
  return [...comps.values()].map((p) => { const c = [0, 0, 0]; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const q of p) for (let k = 0; k < 3; k++) { c[k] += q[k] / p.length; mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } return { n: p.length, c, mn, mx, pts: p }; });
}

const uniq = (pts) => { const m = new Map(); for (const p of pts) m.set(p.map((v) => v.toFixed(4)).join(','), p); return [...m.values()]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);
const nrm = (a) => mulS(a, 1 / len(a));
const d = (a, b) => len(sub(a, b));
const mean = (ps) => ps.reduce((s, p) => add(s, mulS(p, 1 / ps.length)), [0, 0, 0]);
function rings(pts, k, start) {
  let left = uniq(pts);
  left.sort((a, b) => d(a, start) - d(b, start));
  let ring = left.slice(0, k);
  left = left.slice(k);
  const out = [mean(ring)];
  let t = nrm(sub(mean(left.slice(0, k)), out[0]));
  while (left.length >= k) {
    const c = out[out.length - 1];
    const ahead = left.filter((p) => dot(sub(p, c), t) > 0.015);
    if (ahead.length < k) break;
    ahead.sort((a, b) => d(a, c) - d(b, c));
    const s0 = dot(sub(ahead[0], c), t);
    const cand = ahead.filter((p) => Math.abs(dot(sub(p, c), t) - s0) < 0.06).sort((a, b) => d(a, c) - d(b, c));
    ring = (cand.length >= k ? cand : ahead).slice(0, k);
    left = left.filter((p) => !ring.includes(p));
    const m = mean(ring);
    t = nrm(sub(m, c));
    out.push(m);
  }
  return out;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function frames(file) {
  const cs = components(file).filter((c) => c.n > 100);
  const near = (c, q) => Math.min(...uniq(c.pts).map((p) => d(p, q)));
  cs.sort((a, b) => near(a, [0, -0.925, 0]) - near(b, [0, -0.925, 0]));
  const spine = rings(cs[0].pts, 8, [0, -0.925, 0], [0, 0, 1]);
  const others = cs.slice(1).sort((a, b) => b.n - a.n).slice(0, 2);
  const [A, B0] = others.map((c) => rings(c.pts, 8, spine[0]));
  // A: the rail on the +x side at the entry
  let AA = A, BB = B0;
  const lat0 = sub(A[0], B0[0]);
  if (lat0[0] < 0) { AA = B0; BB = A; }
  if (AA.length !== spine.length || BB.length !== spine.length) console.error('ring count mismatch', file, spine.length, AA.length, BB.length);
  const n = Math.min(spine.length, AA.length, BB.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = spine[i], a = AA[i], b = BB[i];
    const lat = nrm(sub(a, b));
    const mid = mean([a, b]);
    const up = nrm(sub(mid, s));
    out.push({ p: mid, up, lat, s });
  }
  return { frames: out, nA: AA.length, nB: BB.length };
}

const here = dirname(fileURLToPath(import.meta.url));
const D = join(here, '..', '..', 'public', 'assets', 'kenney', 'coaster-kit', 'models', 'gltf_format');
const OUT = join(here, 'pieces.ts');
const PIECES = ['straight', 'corner-small', 'corner-large', 'corner-small-ramp', 'corner-large-ramp', 'curve', 'looping',
  'straight-hill-beginning', 'straight-hill-end', 'straight-hill-complete', 'straight-hill-complete-half', 'straight-bump-up', 'straight-bump-down'];
const r = (v) => Math.round(v * 1e4) / 1e4;
let out = `// Coaster Rush: the centre line of every Coaster Kit track piece, measured from the GLBs (the steel
// pieces' spine tube and two rails, ring by ring; every style shares the same lines). Per piece, in the
// piece's own units: points along the bottom of the track (x, y, z) and the track's up vector there
// (ux, uy, uz), from the entry to the exit. Generated by measure-pieces.mjs\n// (node games/coaster-rush/measure-pieces.mjs); do not edit by hand.\n`;
out += 'export const PIECE_PATHS: Record<string, number[]> = {\n';
for (const name of PIECES) {
  const f = frames(`${D}/coaster-steel-${name}.glb`).frames;
  const pts = f.map((q) => q.p);
  const row = [];
  f.forEach((q, i) => {
    // up: from the spine to the rails, made square to the rails' line
    const lat = q.lat;
    const d = q.up[0] * lat[0] + q.up[1] * lat[1] + q.up[2] * lat[2];
    const up = nrm(q.up.map((v, k) => v - d * lat[k]));
    const snap = (v) => (Math.abs(v * 4 - Math.round(v * 4)) < 0.008 ? Math.round(v * 4) / 4 : v);
    const end = i === 0 || i === f.length - 1;
    const bottom = q.p.map((v, k) => v - up[k] * 0.25).map((v) => (end ? snap(v) : v));
    const ups = up.map((v) => (end ? (Math.abs(v) < 0.004 ? 0 : Math.abs(Math.abs(v) - 1) < 0.004 ? Math.sign(v) : Math.abs(Math.abs(v) - Math.SQRT1_2) < 0.004 ? Math.sign(v) * Math.SQRT1_2 : v) : v));
    row.push(...bottom.map(r), ...ups.map(r));
  });
  out += `  '${name}': [${row.join(',')}],\n`;
}
out += '};\n';
writeFileSync(OUT, out);
console.log('ok');
