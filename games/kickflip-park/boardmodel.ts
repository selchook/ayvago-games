// Kickflip Park: builds a board's 3D model from its catalogue entry (boards.ts) in the game's board
// frame: metres, the nose along +z (the travel axis), the wheels on y = 0, centred between the
// trucks, as long as the standard board (1.54 m, the Kenney board at the rider's scale).
//   - The Kenney Mini Skate board is split into its parts (deck graphic underneath, grip on top,
//     deck edges, wheels, trucks) so each takes the entry's colours; a longboard stretches the deck
//     and moves the trucks out with it.
//   - Any other GLB is fitted by itself: the longest side of its bounding box becomes the length,
//     the shortest the height, the side with the long flat deck goes up; `fit` overrides it.
//     Its own materials are kept (as the game's flat Lambert) and `tint` colours them.
// It also measures what the rider needs: the deck's top (feet), the board's middle (the flip
// pivot), the trucks (manual pivots) and the length (grab points).
import { THREE, model } from '@core/three';
import { boardModelKey, boardDef, FALLBACKS, type BoardDef, type BoardFit } from './boards';
import { paintDeck } from './boardart';
import type { Mats } from './kit';

/** Metres per model unit for the rider and the Kenney board. */
export const C = 2.2;
/** The Kenney board's length (model units) and the standard board length in metres. */
const KENNEY_LEN = 0.7;
export const BOARD_LEN = KENNEY_LEN * C;

export interface BoardModel {
  /** The fitted board: its origin on the ground under the middle of the board. */
  group: THREE.Group;
  /** Height of the deck's top in the middle (where the feet stand), metres. */
  deckTop: number;
  /** The board's middle height (the flip pivot). */
  pivotY: number;
  /** Length and width (metres), and how far the trucks sit from the middle. */
  len: number;
  width: number;
  truckZ: number;
  /** Frees what this board made for itself (not the loaded model's shared parts). */
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _d = new THREE.Vector3();

/** Is a GLB board's model loaded (a missing file leaves the board out). */
export function boardReady(def: BoardDef): boolean {
  if (def.model === 'kenney') return true;
  try { model(boardModelKey(def), { shadows: false }); return true; } catch { return false; }
}

/** The board to show for `id`: itself when its model is there, else the first fallback that is. */
export function usableBoard(id: string): BoardDef {
  const d = boardDef(id);
  if (boardReady(d)) return d;
  for (const f of FALLBACKS) { const q = boardDef(f); if (boardReady(q)) return q; }
  return boardDef('classic');
}

export function buildBoardModel(def: BoardDef, mats: Mats): BoardModel {
  const own: { dispose(): void }[] = [];
  let src: THREE.Object3D;
  if (def.model === 'kenney' || !boardReady(def)) src = kenneyBoard(def, mats, own);
  else src = glbBoard(def, mats, own);
  const targetLen = BOARD_LEN * (def.model === 'kenney' ? def.length ?? 1 : def.fit?.scale ?? 1);
  const fitted = fitBoard(src, def.model === 'kenney' ? {} : def.fit ?? {}, targetLen);
  fitted.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return { ...fitted, dispose: () => own.forEach((r) => r.dispose()) };
}

// ------------------------------------------------------------------ the Kenney board

/**
 * The Kenney skateboard split into material groups by its colormap cells and shape: 0 trucks and
 * the rest (colormap), 1 the deck's underside (the graphic, UV'd flat), 2 wheels, 3 grip, 4 edges.
 */
function kenneyBoard(def: BoardDef, mats: Mats, own: { dispose(): void }[]): THREE.Object3D {
  const src = model('ms:skateboard', { shadows: true });
  let mesh: THREE.Mesh | null = null;
  src.traverse((o) => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
  const g = new THREE.Group();
  if (!mesh) return g;
  const m0 = mesh as THREE.Mesh;
  m0.updateMatrixWorld(true);
  const geo = m0.geometry.index ? m0.geometry.toNonIndexed() : m0.geometry.clone();
  geo.applyMatrix4(m0.matrixWorld);
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  const groups: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    let cy = 0, cx = 0, ny = 0, u = 0;
    for (let k = 0; k < 3; k++) { cy += pos.getY(t + k) / 3; cx += Math.abs(pos.getX(t + k)) / 3; ny += nor.getY(t + k) / 3; u += uv.getX(t + k) / 3; }
    let grp = 0;
    if (ny < -0.6 && cy > 0.075 && cy < 0.1) grp = 1;           // the deck's underside
    else if (cy < 0.05 && cx > 0.095) grp = 2;                  // the wheels
    else if (u < 0.2 && cy > 0.1) grp = 3;                      // grip tape on top
    else if (u > 0.55 && u < 0.65 && cy > 0.085) grp = 4;       // the deck's edges
    groups.push(grp);
    if (grp === 1) for (let k = 0; k < 3; k++) uv.setXY(t + k, (pos.getX(t + k) + 0.15) / 0.3, (pos.getZ(t + k) + 0.35) / 0.7);
  }
  // a longer deck: the deck stretches, the trucks and wheels move out with it (their shape kept)
  const k = def.length ?? 1;
  if (k !== 1) {
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), z = pos.getZ(i);
      pos.setZ(i, y > 0.084 ? z * k : z + Math.sign(z) * 0.21 * (k - 1));
    }
  }
  const P: number[] = [], N: number[] = [], U: number[] = [];
  const starts: number[] = [];
  for (let grp = 0; grp < 5; grp++) {
    starts.push(P.length / 3);
    for (let t = 0, i = 0; t < pos.count; t += 3, i++) {
      if (groups[i] !== grp) continue;
      for (let q = 0; q < 3; q++) {
        P.push(pos.getX(t + q), pos.getY(t + q), pos.getZ(t + q));
        N.push(nor.getX(t + q), nor.getY(t + q), nor.getZ(t + q));
        U.push(uv.getX(t + q), uv.getY(t + q));
      }
    }
  }
  starts.push(P.length / 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  for (let i = 0; i < 5; i++) out.addGroup(starts[i], starts[i + 1] - starts[i], i);
  geo.dispose();
  const tex = new THREE.CanvasTexture(paintDeck(def.deck));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const base = mats.of(m0.material as THREE.Material);
  const deckMat = new THREE.MeshLambertMaterial({ map: tex });
  const wheelMat = new THREE.MeshLambertMaterial({ color: def.wheel ?? 0xf4f1ea });
  const gripMat = new THREE.MeshLambertMaterial({ color: def.grip ?? 0x3c3c48 });
  const edgeMat = new THREE.MeshLambertMaterial({ color: def.edge ?? 0xdb845d });
  own.push(out, tex, deckMat, wheelMat, gripMat, edgeMat);
  const board = new THREE.Mesh(out, [base, deckMat, wheelMat, gripMat, edgeMat]);
  board.scale.setScalar(C);
  g.add(board);
  return g;
}

// ------------------------------------------------------------------ a GLB board

function glbBoard(def: BoardDef, mats: Mats, own: { dispose(): void }[]): THREE.Object3D {
  const src = model(boardModelKey(def), { shadows: true });
  const tint = def.tint !== undefined && def.tint !== 0xffffff ? new THREE.Color(def.tint) : null;
  // colours by material name (a colourway of one model)
  const named: Record<string, number | undefined> = { wheel: def.wheel, truck: def.truck, grip: def.grip, edge: def.edge };
  const made = new Map<THREE.Material, THREE.Material>();
  const conv = (mat: THREE.Material): THREE.Material => {
    const done = made.get(mat);
    if (done) return done;
    const base = mats.of(mat);
    const name = mat.name.toLowerCase();
    const part = Object.keys(named).find((k) => name.includes(k) && named[k] !== undefined);
    const hue = name.includes('deck') && def.hue ? def.hue : 0;
    let out: THREE.MeshLambertMaterial = base;
    if (tint || part || hue) {
      out = base.clone();
      own.push(out);
      if (part) {
        // a textured part keeps its detail: its shading recoloured; a plain one takes the colour
        const tex = base.map ? recoloured(base.map, named[part]!) : null;
        if (tex) { out.map = tex; own.push(tex); } else out.color.setHex(named[part]!);
      }
      if (hue && base.map) {
        const tex = hueShifted(base.map, hue);
        if (tex) { out.map = tex; own.push(tex); }
      }
      if (tint) out.color.multiply(tint);
    }
    made.set(mat, out);
    return out;
  };
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
  return src;
}

/** A copy of a texture in one colour: its lightness (relative to its average) times `color`. */
function recoloured(src: THREE.Texture, color: number): THREE.CanvasTexture | null {
  const c = new THREE.Color(color);
  return remap(src, (px) => {
    let avg = 0;
    for (let i = 0; i < px.length; i += 4) avg += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    avg = Math.max(1, avg / (px.length / 4));
    const r = c.r * 255, g = c.g * 255, b = c.b * 255;
    for (let i = 0; i < px.length; i += 4) {
      const k = Math.min(1.5, (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / avg);
      px[i] = r * k; px[i + 1] = g * k; px[i + 2] = b * k;
    }
  });
}

/** A copy of a texture with its hue turned by `deg` degrees (a colourway's deck graphic). */
function hueShifted(src: THREE.Texture, deg: number): THREE.CanvasTexture | null {
  // rotate the colour round the grey axis (keeps lightness and saturation close)
  const a = deg * Math.PI / 180, cosA = Math.cos(a), sinA = Math.sin(a);
  const k1 = (1 - cosA) / 3, k2 = Math.sqrt(1 / 3) * sinA;
  const m00 = cosA + k1, m01 = k1 - k2, m02 = k1 + k2;
  return remap(src, (px) => {
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2];
      px[i] = r * m00 + gg * m01 + b * m02;
      px[i + 1] = r * m02 + gg * m00 + b * m01;
      px[i + 2] = r * m01 + gg * m02 + b * m00;
    }
  });
}

/** A canvas copy of a texture with its pixels changed by `f`. */
function remap(src: THREE.Texture, f: (px: Uint8ClampedArray) => void): THREE.CanvasTexture | null {
  const img = src.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img?.width) return null;
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height);
  f(d.data);
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = src.flipY;
  t.wrapS = src.wrapS; t.wrapT = src.wrapT;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ the fit

interface Fitted { group: THREE.Group; deckTop: number; pivotY: number; len: number; width: number; truckZ: number }

/** Points of every mesh in `root`'s space (sampled: at most about 24 000). */
function pointsOf(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const inv = _m.copy(root.matrixWorld).invert();
  const out: THREE.Vector3[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!p) return;
    const step = Math.max(1, Math.floor(p.count / 24000));
    const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    for (let i = 0; i < p.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mw));
  });
  return out;
}

const boxOf = (pts: THREE.Vector3[]): THREE.Box3 => new THREE.Box3().setFromPoints(pts);

/**
 * The board's own axes in a cloud of its points, whatever way the model lies: Z along its length
 * (the direction the points spread most), Y the deck's normal and X across. The normal comes from
 * the nose and tail only (the outer quarter of each end), where nothing but the deck is: there the
 * cross-section is a thin slab, and its thin direction is the normal even when the trucks and wheels
 * below make the whole board as deep as it is wide. Signs: Z and Y keep to the model's own +z and
 * +y as far as they can (the caller turns the board over when its deck is underneath).
 */
function boardAxes(pts: THREE.Vector3[]): { X: THREE.Vector3; Y: THREE.Vector3; Z: THREE.Vector3 } {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.divideScalar(pts.length);
  // covariance, and its main axis by power iteration
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  const Z = new THREE.Vector3(0.3, 0.2, 1);
  for (let i = 0; i < 64; i++) {
    Z.set(xx * Z.x + xy * Z.y + xz * Z.z, xy * Z.x + yy * Z.y + yz * Z.z, xz * Z.x + yz * Z.y + zz * Z.z).normalize();
  }
  if (Z.z < 0 || (Math.abs(Z.z) < 1e-3 && Z.x < 0)) Z.negate();
  // a basis of the plane across the board
  const ref = Math.abs(Z.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const A = ref.clone().sub(Z.clone().multiplyScalar(ref.dot(Z))).normalize();
  const B = Z.clone().cross(A);
  // the ends' cross-section: 2D covariance in (A, B)
  let s0 = Infinity, s1 = -Infinity;
  for (const p of pts) { const s = _d.subVectors(p, c).dot(Z); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
  const cut = (s1 - s0) * 0.3;
  let aa = 0, ab = 0, bb = 0, n = 0, ma = 0, mb = 0;
  const ends = pts.filter((p) => { const s = _d.subVectors(p, c).dot(Z); return s < s0 + cut || s > s1 - cut; });
  for (const p of ends) { _d.subVectors(p, c); ma += _d.dot(A); mb += _d.dot(B); n++; }
  ma /= Math.max(1, n); mb /= Math.max(1, n);
  for (const p of ends) { _d.subVectors(p, c); const a = _d.dot(A) - ma, b = _d.dot(B) - mb; aa += a * a; ab += a * b; bb += b * b; }
  // the smallest-variance direction of the 2×2 covariance is the deck's normal
  const th = 0.5 * Math.atan2(2 * ab, aa - bb);
  const major = A.clone().multiplyScalar(Math.cos(th)).add(B.clone().multiplyScalar(Math.sin(th)));
  const Y = Z.clone().cross(major).normalize();
  if (n < 6) Y.copy(A);
  if (Y.y < 0) Y.negate();
  const X = Y.clone().cross(Z).normalize();
  return { X, Y, Z };
}

/**
 * Turns, scales and moves `src` into the board frame (see the top of this file). The automatic
 * orientation maps the bounding box's longest side to z, its shortest to y and puts the side whose
 * points spread furthest along the board (the deck, not the wheels) on top.
 */
export function fitBoard(src: THREE.Object3D, fit: BoardFit, targetLen: number): Fitted {
  const inner = new THREE.Group();
  inner.add(src);
  let pts = pointsOf(inner);
  const rot = new THREE.Matrix4();
  if (fit.rotate) rot.makeRotationFromEuler(new THREE.Euler(...fit.rotate));
  else if (pts.length) {
    const { X, Y, Z } = boardAxes(pts);
    // rows of the rotation are the new axes
    rot.set(X.x, X.y, X.z, 0, Y.x, Y.y, Y.z, 0, Z.x, Z.y, Z.z, 0, 0, 0, 0, 1);
    // the deck on top: the band of points near the top spreads further along z than the wheels'
    const r = pts.map((p) => p.clone().applyMatrix4(rot));
    const b = boxOf(r), h = b.max.y - b.min.y;
    const spread = (lo: number, hi: number) => {
      let z0 = Infinity, z1 = -Infinity;
      for (const p of r) if (p.y >= lo && p.y <= hi) { z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      return z1 > z0 ? z1 - z0 : 0;
    };
    if (spread(b.min.y, b.min.y + h * 0.3) > spread(b.max.y - h * 0.3, b.max.y) * 1.1) rot.premultiply(new THREE.Matrix4().makeRotationZ(Math.PI));
  }
  if (fit.flipNose) rot.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
  pts = pts.map((p) => p.applyMatrix4(rot));
  const b = pts.length ? boxOf(pts) : new THREE.Box3(new THREE.Vector3(-0.15, 0, -0.35), new THREE.Vector3(0.15, 0.14, 0.35));
  const s = targetLen / Math.max(1e-6, b.max.z - b.min.z);
  // centred between the trucks: the middle of the wheels' band along z (else of the box)
  const h = b.max.y - b.min.y;
  let w0 = Infinity, w1 = -Infinity;
  for (const p of pts) if (p.y < b.min.y + h * 0.3) { w0 = Math.min(w0, p.z); w1 = Math.max(w1, p.z); }
  const zMid = w1 - w0 > (b.max.z - b.min.z) * 0.25 ? (w0 + w1) / 2 : (b.max.z + b.min.z) / 2;
  const off = fit.offset ?? [0, 0, 0];
  const tr = new THREE.Matrix4().makeTranslation(-(b.max.x + b.min.x) / 2 * s + off[0], -b.min.y * s + off[1], -zMid * s + off[2]);
  const full = new THREE.Matrix4().makeScale(s, s, s).premultiply(tr).multiply(rot);
  inner.applyMatrix4(full);
  // what the rider needs, measured on the fitted points
  const len = (b.max.z - b.min.z) * s, width = (b.max.x - b.min.x) * s;
  let top = 0, any = false;
  for (const p of pts) {
    const z = (p.z - zMid) * s + off[2], y = (p.y - b.min.y) * s + off[1];
    if (Math.abs(z) < len * 0.18) { top = Math.max(top, y); any = true; }
  }
  if (!any) top = h * s + off[1];
  const truckZ = w1 - w0 > 0 && isFinite(w1) ? Math.max(0.1, (w1 - w0) / 2 * s * 0.85) : len * 0.3;
  const group = new THREE.Group();
  group.add(inner);
  return { group, deckTop: top, pivotY: top / 2, len, width, truckZ };
}
