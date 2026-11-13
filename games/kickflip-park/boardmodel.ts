// Kickflip Park: builds a board's 3D model from its catalogue entry (boards.ts) in the game's board
// frame: metres, the nose along +z (the travel axis), the wheels on y = 0, centred between the
// trucks, as long as the standard board (1.54 m, the Kenney board at the rider's scale).
//   - The Kenney Mini Skate board is split into its parts (deck graphic underneath, grip on top,
//     deck edges, wheels, trucks) so each takes the entry's colours; a longboard stretches the deck
//     and moves the trucks out with it.
//   - Any other GLB is fitted by itself: the longest side of its bounding box becomes the length,
//     the shortest the height, the side with the long flat deck goes up; `fit` overrides it. Then
//     it is normalised to the Kenney board's size (normalise): the deck as wide, its top as high
//     and as thick as the Kenney deck, the trucks and wheels scaled (round) to fit under it. The
//     fitted shape of a model is worked out once and shared by all its skins.
//   - A GLB keeps its own textures (as the game's flat Lambert, or Phong when glossy); a skin
//     recolours parts of them (skin): on a one-mesh board by what each texel is (dark grip, wooden
//     deck, white wheels, grey trucks), on a board in parts by the material's name.
// It also measures what the rider needs: the deck's top (feet), the board's middle (the flip
// pivot), the trucks (manual pivots) and the length (grab points).
import { THREE, model } from '@core/three';
import { boardModelKey, boardDef, boardOn, FALLBACKS, type BoardDef, type BoardFit } from './boards';
import { paintDeck } from './boardart';
import type { Mats } from './kit';

/** Metres per model unit for the rider and the Kenney board. */
export const C = 2.2;
/** The Kenney board's length (model units) and the standard board length in metres. */
const KENNEY_LEN = 0.7;
export const BOARD_LEN = KENNEY_LEN * C;
/**
 * The Kenney board as the game rides it (metres, measured on the fitted model by vertical rays):
 * 1.54 m long, the deck 0.658 m wide and 0.11 m thick, its top 0.301 m and its underside 0.191 m
 * above the ground (the trucks' height), wheels 0.19 m across. The owner's boards are normalised
 * to these.
 */
export const KENNEY_SIZE = { len: BOARD_LEN, deckWidth: 0.658, deckTop: 0.301, deckBottom: 0.191, width: 0.66, wheel: 0.19 };

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

/** The board to show for `id`: itself when it is on and its model is there, else the first fallback that is. */
export function usableBoard(id: string): BoardDef {
  const d = boardDef(id);
  if (boardOn(d.id) && boardReady(d)) return d;
  for (const f of FALLBACKS) { const q = boardDef(f); if (boardReady(q)) return q; }
  return boardDef('classic');
}

export function buildBoardModel(def: BoardDef, mats: Mats): BoardModel {
  const own: { dispose(): void }[] = [];
  let fitted: Fitted;
  if (def.model === 'kenney' || !boardReady(def)) {
    fitted = fitBoard(kenneyBoard(def.model === 'kenney' ? def : boardDef('classic'), mats, own), {}, BOARD_LEN * (def.model === 'kenney' ? def.length ?? 1 : 1));
  } else {
    // the model's fitted, normalised shape (shared by its skins) with this skin's materials
    const shape = glbShape(def);
    const src = glbBoard(def, mats, own);
    const meshes: THREE.Mesh[] = [];
    src.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const group = new THREE.Group();
    shape.geos.forEach((g, i) => {
      const geo = g.clone();
      own.push(geo);
      group.add(new THREE.Mesh(geo, meshes[i]?.material ?? mats.of(new THREE.MeshBasicMaterial())));
    });
    fitted = { ...shape.m, group };
  }
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

// ------------------------------------------------------------------ a GLB board's skin

/** What a texel of a board's texture is: the parts a skin can recolour. */
type Part = 'grip' | 'wood' | 'wheel' | 'truck' | 'art';
const PARTS: Part[] = ['grip', 'wood', 'wheel', 'truck', 'art'];

/**
 * The model's own materials with the skin's colours. A material named 'wheel' or 'truck' (the blue
 * board) is all wheel or truck; 'deck' is wood (its warm edge) and art (the graphic); any other
 * (the black board's one material, 'board') is sorted texel by texel into grip, wood, wheels and
 * trucks. Glossy skins get Phong materials, glowing ones an emissive map of their wood.
 */
function glbBoard(def: BoardDef, mats: Mats, own: { dispose(): void }[]): THREE.Object3D {
  const src = model(boardModelKey(def), { shadows: true });
  const tint = def.tint !== undefined && def.tint !== 0xffffff ? new THREE.Color(def.tint) : null;
  const colours: Partial<Record<Part, number>> = { grip: def.grip, wood: def.wood, wheel: def.wheel, truck: def.truck };
  const made = new Map<THREE.Material, THREE.Material>();
  const conv = (mat: THREE.Material): THREE.Material => {
    const done = made.get(mat);
    if (done) return done;
    const base = mats.of(mat);
    const name = mat.name.toLowerCase();
    const kind: 'wheel' | 'truck' | 'deck' | 'board' = name.includes('wheel') ? 'wheel' : name.includes('truck') ? 'truck' : name.includes('deck') ? 'deck' : 'board';
    const touched = (kind === 'board' ? ['grip', 'wood', 'wheel', 'truck'] : kind === 'deck' ? ['wood'] : [kind]).some((p) => colours[p as Part] !== undefined);
    const hue = kind === 'deck' || kind === 'board' ? def.hue ?? 0 : 0;
    const glow = def.glow !== undefined && (kind === 'deck' || kind === 'board') ? def.glow : undefined;
    const gloss = def.gloss ?? 0;
    // metal: the trucks shine in their own colour (a gold skin's wheels too)
    const metalPart = !!def.metal && (kind === 'truck' || kind === 'board' || (kind === 'wheel' && def.wheel !== undefined && isGold(def.wheel)));
    let out: THREE.Material = base;
    if (tint || touched || hue || glow !== undefined || gloss > 0) {
      const spotty = kind === 'board' && gloss > 0;
      const skin = base.map && (touched || hue || glow !== undefined || spotty) ? skinMaps(base.map, kind, colours, hue, glow, spotty, def.id + ':' + name) : null;
      const map = skin?.map ?? base.map;
      let m: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;
      if (gloss > 0) {
        m = new THREE.MeshPhongMaterial({ map, shininess: 18 + gloss * 70 });
        // a metal part's highlight takes its colour; anything else a soft white sheen
        const spec = metalPart ? new THREE.Color(kind === 'wheel' ? def.wheel! : def.truck ?? 0xdddddd).multiplyScalar(0.55 + gloss * 0.35) : new THREE.Color(0xffffff).multiplyScalar(0.12 + gloss * 0.22);
        m.specular.copy(spec);
        // one mesh: the shine is the trucks' (and a gold skin's wheels'), hardly the grip's
        if (skin?.spec) m.specularMap = skin.spec;
      } else m = new THREE.MeshLambertMaterial({ map });
      if (!map) m.color.copy(base.color);
      if (skin?.glow) { m.emissive.setHex(0xffffff); m.emissiveMap = skin.glow; m.emissiveIntensity = kind === 'board' ? 1 : 0.6; }
      if (tint) m.color.multiply(tint);
      if (!base.map && kind !== 'board' && kind !== 'deck' && colours[kind as Part] !== undefined) m.color.setHex(colours[kind as Part]!);
      own.push(m);
      if (skin) { own.push(skin.map); if (skin.glow) own.push(skin.glow); if (skin.spec) own.push(skin.spec); }
      out = m;
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

const isGold = (c: number): boolean => { const h = new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }); return h.h > 0.1 && h.h < 0.17 && h.s > 0.6; };

const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The parts a texel belongs to (weights that add up to 1). */
function texelParts(r: number, g: number, b: number, kind: 'wheel' | 'truck' | 'deck' | 'board', w: Record<Part, number>): void {
  for (const p of PARTS) w[p] = 0;
  if (kind === 'wheel' || kind === 'truck') { w[kind] = 1; return; }
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx > mn) {
    if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
    else h = 60 * ((r - g) / (mx - mn) + 4);
    if (h < 0) h += 360;
  }
  // warm, saturated texels are the wooden deck (the black board's underside and ply edge, the
  // blue board's edge)
  const wood = smooth(0.16, 0.3, sat) * smooth(4, 14, h) * (1 - smooth(52, 62, h)) * smooth(0.18, 0.3, mx);
  if (kind === 'deck') { w.wood = wood; w.art = 1 - wood; return; }
  const rest = 1 - wood;
  const dark = rest * (1 - smooth(0.32, 0.4, mx));
  const light = rest * smooth(0.63, 0.72, mx);
  w.wood = wood; w.grip = dark; w.wheel = light; w.truck = Math.max(0, rest - dark - light);
}

/** Skin maps made so far, by skin and material (a skin seen again reuses its pixels). */
const skinCache = new Map<string, { map: HTMLCanvasElement; glow: HTMLCanvasElement | null; spec: HTMLCanvasElement | null }>();

/**
 * A skin's colour map (and glow map) from a board texture: each part with a colour takes it, its
 * shading kept (the texel's lightness relative to the part's average); the deck graphic's hue
 * turned by `hue` degrees; the wood lit in `glow`.
 */
function skinMaps(src: THREE.Texture, kind: 'wheel' | 'truck' | 'deck' | 'board', colours: Partial<Record<Part, number>>, hue: number, glow: number | undefined, spotty: boolean, key: string): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture | null; spec: THREE.CanvasTexture | null } | null {
  let c = skinCache.get(key);
  if (!c) {
    const img = src.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!img?.width) return null;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data, n = px.length / 4;
    // every texel's parts, and each part's average lightness
    const W = new Float32Array(n * PARTS.length), avg = PARTS.map(() => 0), wsum = PARTS.map(() => 0);
    const w = { grip: 0, wood: 0, wheel: 0, truck: 0, art: 0 } as Record<Part, number>;
    for (let i = 0; i < n; i++) {
      const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      texelParts(r, gg, b, kind, w);
      const l = r * 0.3 + gg * 0.59 + b * 0.11;
      PARTS.forEach((p, k) => { W[i * PARTS.length + k] = w[p]; avg[k] += w[p] * l; wsum[k] += w[p]; });
    }
    PARTS.forEach((_p, k) => { avg[k] = Math.max(0.02, avg[k] / Math.max(1e-6, wsum[k])); });
    const tgt = PARTS.map((p) => (colours[p] !== undefined ? new THREE.Color(colours[p]!) : null));
    // hue rotation round the grey axis (keeps lightness and saturation close)
    const a = hue * Math.PI / 180, cosA = Math.cos(a), sinA = Math.sin(a);
    const k1 = (1 - cosA) / 3, k2 = Math.sqrt(1 / 3) * sinA;
    const m00 = cosA + k1, m01 = k1 - k2, m02 = k1 + k2;
    let gpx: Uint8ClampedArray | null = null, gd: ImageData | null = null, gcv: HTMLCanvasElement | null = null;
    const gc = glow !== undefined ? new THREE.Color(glow) : null;
    if (gc) { gcv = document.createElement('canvas'); gcv.width = cv.width; gcv.height = cv.height; gd = gcv.getContext('2d')!.createImageData(cv.width, cv.height); gpx = gd.data; }
    // a one-mesh board's shine by part: metal trucks and wheels, a little on the wood, none on the grip
    let spx: Uint8ClampedArray | null = null, sd: ImageData | null = null, scv: HTMLCanvasElement | null = null;
    const SHINE: Record<Part, number> = { grip: 0.1, wood: 0.45, wheel: colours.wheel !== undefined && isGold(colours.wheel) ? 1 : 0.55, truck: 1, art: 0.5 };
    if (spotty) { scv = document.createElement('canvas'); scv.width = cv.width; scv.height = cv.height; sd = scv.getContext('2d')!.createImageData(cv.width, cv.height); spx = sd.data; }
    const wi = PARTS.indexOf('wood');
    for (let i = 0; i < n; i++) {
      const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
      const l = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
      let R = 0, G = 0, B = 0;
      for (let k = 0; k < PARTS.length; k++) {
        const wk = W[i * PARTS.length + k];
        if (wk <= 0) continue;
        const t = tgt[k];
        if (t) {
          const sh = Math.min(1.45, Math.max(0.45, l / avg[k])) * 255;
          R += wk * t.r * sh; G += wk * t.g * sh; B += wk * t.b * sh;
        } else if (hue && (PARTS[k] === 'art' || kind === 'board')) {
          R += wk * (r * m00 + gg * m01 + b * m02); G += wk * (r * m02 + gg * m00 + b * m01); B += wk * (r * m01 + gg * m02 + b * m00);
        } else { R += wk * r; G += wk * gg; B += wk * b; }
      }
      px[i * 4] = R; px[i * 4 + 1] = G; px[i * 4 + 2] = B;
      if (spx) {
        let sh = 0;
        for (let k = 0; k < PARTS.length; k++) sh += W[i * PARTS.length + k] * SHINE[PARTS[k]];
        spx[i * 4] = spx[i * 4 + 1] = spx[i * 4 + 2] = sh * 255; spx[i * 4 + 3] = 255;
      }
      if (gpx && gc) {
        // a one-mesh board glows along its ply edge (the most saturated wood), a deck all over its wood
        const edge = kind === 'board' ? smooth(0.4, 0.52, (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(1, Math.max(r, gg, b))) : 1;
        const e = W[i * PARTS.length + wi] * edge * Math.min(1.2, 0.55 + 0.6 * l / avg[wi]) * 255;
        gpx[i * 4] = gc.r * e; gpx[i * 4 + 1] = gc.g * e; gpx[i * 4 + 2] = gc.b * e; gpx[i * 4 + 3] = 255;
      }
    }
    g.putImageData(d, 0, 0);
    if (gcv && gd) gcv.getContext('2d')!.putImageData(gd, 0, 0);
    if (scv && sd) scv.getContext('2d')!.putImageData(sd, 0, 0);
    c = { map: cv, glow: gcv, spec: scv };
    skinCache.set(key, c);
    // a few skins' worth of pixels at most
    if (skinCache.size > 12) skinCache.delete(skinCache.keys().next().value!);
  }
  const tex = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = src.flipY;
    t.wrapS = src.wrapS; t.wrapT = src.wrapT;
    t.anisotropy = 4;
    return t;
  };
  const spec = c.spec ? tex(c.spec) : null;
  if (spec) spec.colorSpace = THREE.NoColorSpace;
  return { map: tex(c.map), glow: c.glow ? tex(c.glow) : null, spec };
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

// ------------------------------------------------------------------ the owner's boards at the Kenney board's size

/** A GLB board's shape in the board frame: its meshes' geometries (in traverse order) and measures. */
interface Shape { geos: THREE.BufferGeometry[]; m: Omit<Fitted, 'group'> }
const shapes = new Map<string, Shape>();

/** The fitted (and normalised) shape of a board's model, worked out once per model and fit. */
function glbShape(def: BoardDef): Shape {
  const fit = def.fit ?? {};
  const key = boardModelKey(def) + JSON.stringify(fit);
  let sh = shapes.get(key);
  if (sh) return sh;
  const src = model(boardModelKey(def), { shadows: false });
  const fitted = fitBoard(src, fit, BOARD_LEN * (fit.scale ?? 1));
  fitted.group.updateMatrixWorld(true);
  // every mesh baked into the board frame, as plain float positions and normals
  const parts: { geo: THREE.BufferGeometry; kind: 'deck' | 'under' | 'any' }[] = [];
  fitted.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.clone();
    for (const name of ['position', 'normal']) {
      const a = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!a) continue;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      geo.setAttribute(name, new THREE.BufferAttribute(f, 3));
    }
    geo.applyMatrix4(m.matrixWorld);
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const name = mat?.name.toLowerCase() ?? '';
    parts.push({ geo, kind: name.includes('wheel') || name.includes('truck') ? 'under' : name.includes('deck') ? 'deck' : 'any' });
  });
  let m: Omit<Fitted, 'group'> = { deckTop: fitted.deckTop, pivotY: fitted.pivotY, len: fitted.len, width: fitted.width, truckZ: fitted.truckZ };
  if (fit.normalise !== false) m = normalise(parts, m) ?? m;
  for (const p of parts) { p.geo.computeBoundingBox(); p.geo.computeBoundingSphere(); }
  sh = { geos: parts.map((p) => p.geo), m };
  shapes.set(key, sh);
  return sh;
}

/**
 * Reshapes a fitted board to the Kenney board's size (KENNEY_SIZE), in place: the deck as wide,
 * its top as high and its wood as thick as the Kenney deck, the nose and tail kicks and the concave
 * kept as they were; the trucks and wheels scaled evenly (wheels stay round) about each truck so
 * they reach up to the deck's underside, no wider than the Kenney board.
 *
 * The deck's underside and top are found by vertical rays on a grid over the board (the deck
 * alone: the 'deck' meshes, or every mesh of a one-mesh board), so every point of the deck keeps
 * its height above the underside, times the thickness factor. Returns null when no deck is found.
 */
function normalise(parts: { geo: THREE.BufferGeometry; kind: 'deck' | 'under' | 'any' }[], m: Omit<Fitted, 'group'>): Omit<Fitted, 'group'> | null {
  const K = KENNEY_SIZE;
  // the deck's triangles (x, y, z of three corners)
  const tris: number[] = [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of parts) {
    if (p.kind === 'under') continue;
    const pos = p.geo.getAttribute('position') as THREE.BufferAttribute, idx = p.geo.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) {
      const v = idx ? idx.getX(i) : i;
      const x = pos.getX(v), z = pos.getZ(v);
      tris.push(x, pos.getY(v), z);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  if (!tris.length) return null;
  // vertical rays: every surface's height at (x, z)
  const NZ = 97, NX = 25;
  const gx = (i: number) => x0 + (x1 - x0) * (i / (NX - 1)), gz = (j: number) => z0 + (z1 - z0) * (j / (NZ - 1));
  // bucket the triangles by grid column (z) for speed
  const zb: number[][] = Array.from({ length: NZ }, () => []);
  for (let t = 0; t < tris.length; t += 9) {
    const a = Math.min(tris[t + 2], tris[t + 5], tris[t + 8]), b = Math.max(tris[t + 2], tris[t + 5], tris[t + 8]);
    const j0 = Math.max(0, Math.floor((a - z0) / (z1 - z0) * (NZ - 1))), j1 = Math.min(NZ - 1, Math.ceil((b - z0) / (z1 - z0) * (NZ - 1)));
    for (let j = j0; j <= j1; j++) zb[j].push(t);
  }
  const hits = (x: number, z: number, j: number): number[] => {
    const out: number[] = [];
    for (const t of zb[j]) {
      const ax = tris[t], ay = tris[t + 1], az = tris[t + 2], bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5], cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      out.push(u * ay + v * by + w * cy);
    }
    return out.sort((p, q) => q - p);
  };
  const midJ = Math.round((0 - z0) / (z1 - z0) * (NZ - 1)), midI = Math.round((0 - x0) / (x1 - x0) * (NX - 1));
  const c0 = hits(gx(midI), gz(midJ), midJ);
  if (c0.length < 2) return null;
  // in the middle nothing hangs under the deck: its top and underside
  const t0 = c0[0], b0 = c0[c0.length - 1], th0 = t0 - b0;
  if (th0 <= 1e-4) return null;
  // the underside and top on the grid (NaN where the ray misses the deck)
  const bot = new Float32Array(NX * NZ).fill(NaN), top = new Float32Array(NX * NZ).fill(NaN);
  let w0 = Infinity, w1 = -Infinity;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const h = hits(gx(i), gz(j), j);
    if (!h.length) continue;
    // the underside: the first surface about one deck thickness below the top (a slope makes the
    // wood deeper to a vertical ray). Where there is none (a truck's baseplate fused into the deck,
    // the thin rounded rim) the cell is filled from its neighbours below.
    const under0 = h.find((y) => y < h[0] - th0 * 0.6 && y > h[0] - th0 * 1.5);
    if (under0 === undefined) continue;
    top[j * NX + i] = h[0];
    bot[j * NX + i] = under0;
    if (j === midJ && Math.abs(h[0] - t0) < th0 * 0.6) { w0 = Math.min(w0, gx(i)); w1 = Math.max(w1, gx(i)); }
  }
  // the deck's width at the middle (to the grid's step; at least the measured span)
  const step = (x1 - x0) / (NX - 1);
  const deckW = Math.max(1e-3, Math.min(x1 - x0, w1 - w0 + step));
  // fill the misses from the nearest filled cell of the same row, then of the nearest row
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      if (!isNaN(bot[j * NX + i])) continue;
      for (let d = 1; d < NX; d++) {
        const a = i - d >= 0 ? j * NX + i - d : -1, b = i + d < NX ? j * NX + i + d : -1;
        const k = a >= 0 && !isNaN(bot[a]) ? a : b >= 0 && !isNaN(bot[b]) ? b : -1;
        if (k >= 0) { bot[j * NX + i] = bot[k]; top[j * NX + i] = top[k]; break; }
      }
    }
  }
  for (let j = 0; j < NZ; j++) {
    if (!isNaN(bot[j * NX])) continue;
    for (let d = 1; d < NZ; d++) {
      const r = [j - d, j + d].find((q) => q >= 0 && q < NZ && !isNaN(bot[q * NX]));
      if (r !== undefined) { for (let i = 0; i < NX; i++) { bot[j * NX + i] = bot[r * NX + i]; top[j * NX + i] = top[r * NX + i]; } break; }
    }
  }
  const under = (x: number, z: number): number => {
    const fi = Math.max(0, Math.min(NX - 1.001, (x - x0) / (x1 - x0) * (NX - 1))), fj = Math.max(0, Math.min(NZ - 1.001, (z - z0) / (z1 - z0) * (NZ - 1)));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const g = (ii: number, jj: number) => bot[jj * NX + ii];
    return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
  };
  // the factors: deck across, deck thickness, the trucks and wheels (evenly, about each truck)
  const sxD = K.deckWidth / deckW, sT = (K.deckTop - K.deckBottom) / th0, sU = K.deckBottom / b0;
  // what lies under the deck: its extent across and along (one truck each side of the middle)
  const isUnder = (p: { kind: string }, x: number, y: number, z: number) => p.kind === 'under' || (p.kind === 'any' && y < under(x, z) - 0.002);
  let ux = 0, zp0 = Infinity, zp1 = -Infinity, zn0 = Infinity, zn1 = -Infinity;
  for (const p of parts) {
    const pos = p.geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (!isUnder(p, x, y, z)) continue;
      ux = Math.max(ux, Math.abs(x));
      if (z >= 0) { zp0 = Math.min(zp0, z); zp1 = Math.max(zp1, z); } else { zn0 = Math.min(zn0, z); zn1 = Math.max(zn1, z); }
    }
  }
  const sxU = ux > 0 ? Math.min(sxD, K.width / 2 / ux) : sxD;
  const zcP = isFinite(zp0) ? (zp0 + zp1) / 2 : m.truckZ, zcN = isFinite(zn0) ? (zn0 + zn1) / 2 : -m.truckZ;
  // remap every vertex (normals by the inverse transpose of the local stretch)
  const J = new THREE.Matrix3(), N = new THREE.Matrix3(), nv = new THREE.Vector3();
  let truck0 = Infinity, truck1 = -Infinity, top1 = 0;
  const e = 0.004;
  for (const p of parts) {
    const pos = p.geo.getAttribute('position') as THREE.BufferAttribute, nor = p.geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (isUnder(p, x, y, z)) {
        const zc = z >= 0 ? zcP : zcN;
        const nx = x * sxU, ny = y * sU, nz = zc + (z - zc) * sU;
        pos.setXYZ(i, nx, ny, nz);
        truck0 = Math.min(truck0, nz); truck1 = Math.max(truck1, nz);
        if (nor) { nv.set(nor.getX(i) / sxU, nor.getY(i) / sU, nor.getZ(i) / sU).normalize(); nor.setXYZ(i, nv.x, nv.y, nv.z); }
      } else {
        // the wood (a slab of the middle's thickness, deeper to a vertical ray on a slope) grows
        // by sT; anything standing on it (bolt heads) keeps its own height
        const bz = under(x, z);
        const dbx = (under(x + e, z) - under(x - e, z)) / (2 * e), dbz = (under(x, z + e) - under(x, z - e)) / (2 * e);
        const thL = th0 * Math.sqrt(1 + dbx * dbx + dbz * dbz), d = y - bz;
        const ny = K.deckBottom + (bz - b0) + (d <= thL ? d * sT : thL * sT + (d - thL));
        pos.setXYZ(i, x * sxD, ny, z);
        if (Math.abs(z) < m.len * 0.18 && Math.abs(x) < deckW * 0.15) top1 = Math.max(top1, ny);
        if (nor) {
          // y' = deckBottom + (b(x, z) − b0) + (y − b(x, z))·k: its slopes along x and z
          const k = d <= thL ? sT : 1;
          J.set(sxD, 0, 0, (1 - k) * dbx, k, (1 - k) * dbz, 0, 0, 1);
          N.copy(J).invert().transpose();
          nv.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(N).normalize();
          nor.setXYZ(i, nv.x, nv.y, nv.z);
        }
      }
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
  }
  const truckZ = isFinite(truck0) ? Math.max(0.1, (truck1 - truck0) / 2 * 0.85) : m.truckZ;
  const deckTop = top1 > 0 ? top1 : K.deckTop;
  return { deckTop, pivotY: deckTop / 2, len: m.len, width: Math.max(K.deckWidth, ux * 2 * sxU), truckZ };
}
