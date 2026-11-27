// Monster Roundup: the 3D kit. The station pieces come from one GLB (Quaternius Ultimate Modular Sci-Fi,
// each piece a root node, vertex colours from the pack's one flat palette); the mechs and the monsters
// are rigged GLBs of their own (Animated Mech Pack, Ultimate Monsters), all loaded under the Ayvago
// intro. The station is never drawn as loaded: each piece becomes one non-indexed geometry (flat-shaded
// with one shared material) whose palette is swapped per sector (the lab's orange trim turns green in
// the gardens, blue on the cryo deck, red in the core), and a level's static pieces are merged into a
// few chunks (Merger). Geometries made from the pieces are cached for the page's life.
import Phaser from 'phaser';
import { THREE, model, loadModel, hasModel } from '@core/three';
import { asset } from '@core';
import { SECTORS, MONSTERS, BOSS_IDS, MECH_IDS, type SectorId } from './defs';

const SCIFI = 'mr:scifi';
export const figKey = (file: string): string => 'mr:' + file;

/** Every monster model the game loads (the families; the bosses are the same models, bigger). */
export const MONSTER_FILES = [...new Set([...Object.values(MONSTERS).map((m) => m.model), ...BOSS_IDS])];
/** The Big set's two shared clip files (figure.ts retargets them onto each monster). */
export const CLIP_FILES = ['clips-a', 'clips-b'];

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  loadModel(load, SCIFI, asset('quaternius/scifi-modular/scifi.glb'));
  for (const m of MECH_IDS) loadModel(load, figKey(m), asset(`quaternius/mech-pack/${m}.glb`));
  for (const f of [...MONSTER_FILES, ...CLIP_FILES]) loadModel(load, figKey(f), asset(`quaternius/monsters/${f}.glb`));
}

export const kitReady = (): boolean => hasModel(SCIFI);

// ------------------------------------------------------------------ the palette

/** The pack's palette (linear Kd) in the order of SectorLook's slots. */
const PALETTE: [string, number, number, number][] = [
  ['main', 0.321571, 0.321571, 0.321571],
  ['light', 0.389514, 0.389514, 0.389514],
  ['dark', 0.191638, 0.191638, 0.191638],
  ['black', 0.03362, 0.03362, 0.03362],
  ['accent', 0.447674, 0.238138, 0.053432],
  ['darkAccent', 0.181263, 0.098703, 0.024118],
  ['glass', 0.023278, 0.023278, 0.023278],
  ['pipes', 0.015078, 0.015078, 0.015078],
];

const swapCache = new Map<string, THREE.Color[]>();
/** The sector's colours (linear) for each palette slot. */
function swaps(sector: SectorId | null): THREE.Color[] {
  const k = sector ?? '-';
  let s = swapCache.get(k);
  if (s) return s;
  const L = sector ? SECTORS[sector] : null;
  s = PALETTE.map(([slot, r, g, b]) => {
    if (!L) return new THREE.Color(r, g, b);
    const hex = slot === 'main' ? L.main : slot === 'light' ? L.light : slot === 'dark' ? L.dark : slot === 'accent' ? L.accent : slot === 'darkAccent' ? L.darkAccent : slot === 'glass' ? L.glass : slot === 'black' ? 0x22262e : 0x1a1d24;
    return new THREE.Color().setHex(hex);
  });
  swapCache.set(k, s);
  return s;
}

function slotOf(r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  PALETTE.forEach(([, pr, pg, pb], i) => {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// ------------------------------------------------------------------ pieces

let root: THREE.Object3D | null = null;
const cache = new Map<string, THREE.BufferGeometry>();
const tv = new THREE.Vector3(), tc = new THREE.Color();

function scifiRoot(): THREE.Object3D | null {
  if (root) return root;
  if (!hasModel(SCIFI)) return null;
  root = model(SCIFI, { shadows: false });
  root.updateMatrixWorld(true);
  return root;
}

/**
 * A station piece as one geometry (position and colour, non-indexed) in its own space, its palette
 * swapped for the sector (null keeps the pack's own). `tint` multiplies every colour.
 */
export function piece(name: string, sector: SectorId | null, tint = 1): THREE.BufferGeometry {
  const k = name + '|' + (sector ?? '-') + '|' + tint;
  let g = cache.get(k);
  if (g) return g;
  const r = scifiRoot();
  const m = new Merger();
  const node = r?.getObjectByName(name);
  if (node) {
    const sw = swaps(sector);
    const inv = node.matrixWorld.clone().invert();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = inv.clone().multiply(mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute('position'), col = mesh.geometry.getAttribute('color');
      const idx = mesh.geometry.index;
      const n = idx ? idx.count : pos.count;
      const flip = mat.determinant() < 0;
      for (let i = 0; i < n; i++) {
        const ii = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
        const v = idx ? idx.getX(ii) : ii;
        tv.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(mat);
        const c = col ? sw[slotOf(col.getX(v), col.getY(v), col.getZ(v))] : sw[0];
        m.pushVertex(tv.x, tv.y, tv.z, c.r * tint, c.g * tint, c.b * tint);
      }
    });
  }
  g = m.build();
  cache.set(k, g);
  return g;
}

/** True for a geometry from the piece cache (shared by every level; not freed mid-scene). */
export function isKitGeo(g: THREE.BufferGeometry): boolean {
  for (const v of cache.values()) if (v === g) return true;
  return false;
}

/** Accumulates placed geometries into one (position and colour; non-indexed, flat-shaded). */
export class Merger {
  private P: number[] = [];
  private C: number[] = [];

  get empty(): boolean { return this.P.length === 0; }
  get tris(): number { return this.P.length / 9; }

  pushVertex(x: number, y: number, z: number, r: number, g: number, b: number): void { this.P.push(x, y, z); this.C.push(r, g, b); }

  /** Adds `g` placed by `m` (its colours kept, times `tint` when given). */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, tint?: number): void {
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    const flip = m.determinant() < 0;
    const n = pos.count;
    if (tint !== undefined) tc.setHex(tint); else tc.setRGB(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const v = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      tv.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      this.P.push(tv.x, tv.y, tv.z);
      if (col) this.C.push(col.getX(v) * tc.r, col.getY(v) * tc.g, col.getZ(v) * tc.b);
      else this.C.push(tc.r, tc.g, tc.b);
    }
  }

  /** A triangle (counter-clockwise seen from its front) in one colour. */
  tri(a: number[], b: number[], c: number[], color: number): void {
    tc.setHex(color);
    for (const p of [a, b, c]) { this.P.push(p[0], p[1], p[2]); this.C.push(tc.r, tc.g, tc.b); }
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: number): void { this.tri(a, b, c, color); this.tri(a, c, d, color); }

  /** An axis-aligned box; `faces` picks the sides drawn (top, bottom, n, s, e, w). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, faces = 'tnsew', side?: number): void {
    const s = side ?? color;
    if (faces.includes('t')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
    if (faces.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    if (faces.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s);
    if (faces.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], s);
    if (faces.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], s);
    if (faces.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], s);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** A matrix from a place, a turn about y and a scale (uniform, or [x, y, z]). */
export function place(x: number, y: number, z: number, rot = 0, s: number | [number, number, number] = 1): THREE.Matrix4 {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), sc);
}
