// Kickflip Park: the 3D kit. Loads the Kenney models a park uses, recolours them into Lambert
// materials (one program for all), merges static pieces per texture (a whole park is a handful of
// draw calls) and builds our own pieces (kickers, banks, ledges, roofs) with procedural textures.
import Phaser from 'phaser';
import { THREE, model, loadKenney3d, loadModel, loadMiniCharacter, loadCharacter3d, MINI_MALES, miniKey } from '@core/three';
import { asset } from '@core';
import { BOARDS, boardModelKey } from './boards';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kickerTop } from './park';
import { park, PARKS, type Piece, type Prop, type Style } from './parks';

const KITS: Record<Prop['kit'], string> = {
  sub: 'city-kit-suburban', ind: 'city-kit-industrial', com: 'city-kit-commercial', road: 'city-kit-roads', nat: 'nature-kit', ms: 'mini-skate',
};

export const SKATE_MODELS = [
  'bowl-corner-inner', 'bowl-corner-outer', 'bowl-side', 'half-pipe', 'obstacle-box', 'obstacle-end', 'obstacle-middle', 'pallet',
  'rail-curve', 'rail-high', 'rail-low', 'rail-slope', 'skateboard', 'steps', 'structure-platform', 'structure-wood',
] as const;

/** Clip source for the skate moves (its skeleton matches every Mini Character). */
export const SKATE_CLIPS = 'ms:character-skate-boy';
/** The spectators. */
export const CROWD_KEYS = [miniKey('character-male-a'), miniKey('character-male-c'), miniKey('character-female-f'), 'ms:character-skate-girl', miniKey('character-male-e'), miniKey('character-male-b')];

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of SKATE_MODELS) loadKenney3d(load, 'ms:' + n, 'mini-skate', n);
  loadKenney3d(load, SKATE_CLIPS, 'mini-skate', 'character-skate-boy');
  loadKenney3d(load, 'ms:character-skate-girl', 'mini-skate', 'character-skate-girl');
  loadCharacter3d(load);
  // board models of the catalogue: each file is looked at first and only parsed when it really is a
  // GLB (a missing file comes back as the dev server's HTML page, or a 404), so a board whose file is
  // not there is left out instead of stopping the boot
  const seenBoards = new Set<string>();
  for (const b of BOARDS) {
    const key = boardModelKey(b);
    if (b.model === 'kenney' || seenBoards.has(key)) continue;
    seenBoards.add(key);
    const url = asset(b.model), probe = 'probe:' + key;
    load.binary(probe, url);
    load.once(`filecomplete-binary-${probe}`, (_k: string, _t: string, data: ArrayBuffer) => {
      const glb = data && data.byteLength > 20 && new DataView(data).getUint32(0, true) === 0x46546c67; // 'glTF'
      if (glb) loadModel(load, key, url);
      else console.warn('[kickflip-park] board model missing, board left out:', url);
      load.cacheManager.binary.remove(probe);
    });
  }
  for (const m of [MINI_MALES[0], MINI_MALES[1], MINI_MALES[2], MINI_MALES[4]]) loadMiniCharacter(load, m);
  loadMiniCharacter(load, 'character-female-f');
  const seen = new Set<string>();
  for (const id of PARKS) {
    for (const p of park(id).props) {
      const key = p.kit + ':' + p.name;
      if (seen.has(key)) continue;
      seen.add(key);
      loadKenney3d(load, key, KITS[p.kit], p.name);
    }
  }
}

// ------------------------------------------------------------------ materials

/** One Lambert material per source material (per world): the kits' PBR materials render flat here. */
export class Mats {
  private cache = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  private styles = new Map<string, THREE.MeshLambertMaterial>();

  of(src: THREE.Material): THREE.MeshLambertMaterial {
    let m = this.cache.get(src);
    if (m) return m;
    const s = src as THREE.MeshStandardMaterial;
    if (s.map) { s.map.colorSpace = THREE.SRGBColorSpace; s.map.anisotropy = 4; }
    m = new THREE.MeshLambertMaterial({ map: s.map ?? null, color: s.map ? 0xffffff : s.color?.getHex() ?? 0xffffff });
    this.cache.set(src, m);
    return m;
  }

  /** Frees the materials made here (and the procedural surfaces' textures); the kits' own textures stay. */
  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    for (const m of this.styles.values()) { m.map?.dispose(); m.dispose(); }
    this.cache.clear();
    this.styles.clear();
  }

  /** A procedural surface (canvas texture tiled in world metres). */
  style(name: StyleTex): THREE.MeshLambertMaterial {
    let m = this.styles.get(name);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map: styleTexture(name) });
      this.styles.set(name, m);
    }
    return m;
  }
}

// ------------------------------------------------------------------ procedural textures

export type StyleTex = 'concrete' | 'wood' | 'paving' | 'grass' | 'stone' | 'roof' | 'facade' | 'metal' | 'brick' | 'asphalt' | 'woodfloor' | 'plaza';

/** Metres one texture repeat covers. */
export const TILE: Record<StyleTex, number> = {
  concrete: 4, wood: 2, paving: 3, grass: 3, stone: 2, roof: 4, facade: 6, metal: 2, brick: 2, asphalt: 8, woodfloor: 4, plaza: 4,
};

function noise(g: CanvasRenderingContext2D, s: number, n: number, a: number, light = false, seed = 1): void {
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${a * rnd()})` : `rgba(0,0,0,${a * rnd()})`;
    const w = 1 + rnd() * 3;
    g.fillRect(rnd() * s, rnd() * s, w, w);
  }
}

function styleTexture(name: StyleTex): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const fill = (c: string) => { g.fillStyle = c; g.fillRect(0, 0, S, S); };
  switch (name) {
    case 'concrete':
      fill('#b9bccb'); noise(g, S, 2600, 0.12); noise(g, S, 900, 0.18, true);
      g.strokeStyle = 'rgba(70,72,90,0.35)'; g.lineWidth = 3; g.strokeRect(0, 0, S, S);
      break;
    case 'plaza':
      fill('#c7c3cf'); noise(g, S, 2000, 0.1); noise(g, S, 600, 0.15, true);
      g.strokeStyle = 'rgba(80,76,96,0.3)'; g.lineWidth = 3;
      g.strokeRect(0, 0, S, S); g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
      break;
    case 'paving':
      fill('#d8c8b0');
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = ['#d2c0a6', '#dccdb6', '#cdb99c', '#e2d4bf'][(x * 3 + y * 5) % 4];
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
      noise(g, S, 1200, 0.08);
      break;
    case 'grass':
      fill('#5fb85a'); noise(g, S, 3000, 0.16); noise(g, S, 1500, 0.12, true);
      break;
    case 'stone':
      fill('#9ea3b5'); noise(g, S, 1500, 0.12); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, S, 18);
      break;
    case 'wood': case 'woodfloor': {
      const base = name === 'wood' ? ['#d98a52', '#cf7f48', '#e09660', '#c97a45'] : ['#6f5a4c', '#665244', '#7a6352', '#5f4c3f'];
      const n = name === 'wood' ? 8 : 6;
      for (let i = 0; i < n; i++) {
        g.fillStyle = base[i % 4];
        g.fillRect(0, i * S / n, S, S / n);
        g.fillStyle = 'rgba(80,40,20,0.35)';
        g.fillRect(0, i * S / n, S, 2);
        g.fillRect(((i * 97) % S), i * S / n, 2, S / n);
      }
      noise(g, S, 900, 0.08);
      break;
    }
    case 'roof':
      fill('#8d8f9c'); noise(g, S, 4000, 0.2); noise(g, S, 1500, 0.12, true);
      g.strokeStyle = 'rgba(40,40,52,0.3)'; g.lineWidth = 2; g.strokeRect(0, 0, S, S);
      break;
    case 'facade': {
      fill('#c9cfdc');
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        g.fillStyle = (x + y) % 3 === 0 ? '#7aa8d8' : '#5f86b8';
        g.fillRect(x * 85 + 16, y * 85 + 18, 54, 50);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x * 85 + 16, y * 85 + 18, 54, 8);
      }
      g.fillStyle = 'rgba(60,64,80,0.25)';
      for (let y = 0; y < 3; y++) g.fillRect(0, y * 85 + 76, S, 6);
      break;
    }
    case 'metal':
      fill('#a6b0bf');
      g.strokeStyle = 'rgba(60,66,80,0.5)'; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 64 + 32); g.lineTo(S, i * 64 + 32); g.stroke(); }
      noise(g, S, 600, 0.12, true);
      break;
    case 'brick':
      fill('#b5654d');
      g.fillStyle = '#d9cdbd';
      for (let y = 0; y < 8; y++) {
        g.fillRect(0, y * 32, S, 3);
        for (let x = 0; x < 4; x++) g.fillRect(((x * 64) + (y % 2) * 32) % S, y * 32, 3, 32);
      }
      noise(g, S, 900, 0.12);
      break;
    case 'asphalt':
      fill('#4a4d58'); noise(g, S, 4000, 0.2); noise(g, S, 2000, 0.1, true);
      g.fillStyle = '#e8e4d8'; for (let i = 0; i < 4; i++) g.fillRect(S / 2 - 3, i * 64 + 8, 6, 36);
      break;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Top and side surfaces of a park style. */
const STYLE: Record<Style, [StyleTex, StyleTex]> = {
  concrete: ['concrete', 'concrete'], wood: ['wood', 'wood'], paving: ['paving', 'stone'], grass: ['grass', 'stone'],
  roof: ['roof', 'brick'], tower: ['roof', 'facade'], metal: ['metal', 'metal'], brick: ['stone', 'brick'],
};

// ------------------------------------------------------------------ geometry builders

/** Collects triangles per style texture, with world-space UVs. */
export class GeoBuilder {
  private parts = new Map<StyleTex, { pos: number[]; nor: number[]; uv: number[] }>();

  private part(t: StyleTex) {
    let p = this.parts.get(t);
    if (!p) { p = { pos: [], nor: [], uv: [] }; this.parts.set(t, p); }
    return p;
  }

  /** A quad a-b-c-d (counter-clockwise seen from outside), UVs from two world axes. */
  quad(t: StyleTex, a: number[], b: number[], c: number[], d: number[], uvAxes: 'xz' | 'xy' | 'zy' | 'along', along?: { o: number[]; dir: number[] }): void {
    const p = this.part(t);
    const cross = (p: number[], q: number[], r: number[]) => {
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    };
    // the face normal (a degenerate corner, as at the foot of a bank, uses the other triangle)
    let n = cross(a, b, c);
    if (Math.hypot(n[0], n[1], n[2]) < 1e-9) n = cross(a, c, d);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((v) => v / l);
    const k = 1 / TILE[t];
    const uvOf = (v: number[]): [number, number] => {
      if (uvAxes === 'xz') return [v[0] * k, v[2] * k];
      if (uvAxes === 'xy') return [v[0] * k, v[1] * k];
      if (uvAxes === 'zy') return [v[2] * k, v[1] * k];
      const o = along!.o, dir = along!.dir;
      return [((v[0] - o[0]) * dir[0] + (v[2] - o[2]) * dir[2]) * k, v[1] * k];
    };
    for (const v of [a, b, c, a, c, d]) {
      p.pos.push(v[0], v[1], v[2]);
      p.nor.push(n[0], n[1], n[2]);
      p.uv.push(...uvOf(v));
    }
  }

  /** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1): top and four sides. */
  box(top: StyleTex, side: StyleTex, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.quad(top, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 'xz');
    this.quad(side, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 'xy');
    this.quad(side, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 'xy');
    this.quad(side, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 'zy');
    this.quad(side, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 'zy');
  }

  /**
   * A ramp along local −z (kicker or bank), turned by `rot` quarter turns, with its profile h(t)
   * (t = 0 at the foot, 1 at the top) and side walls.
   */
  ramp(top: StyleTex, side: StyleTex, x: number, y: number, z: number, rot: number, w: number, len: number, h: (t: number) => number, steps: number): void {
    const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const W = (u: number, v: number, yy: number) => [x + u * c + v * s, y + yy, z - u * s + v * c];
    const dir = [-s, 0, -c];
    const o = W(0, len / 2, 0);
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const v0 = len / 2 - t0 * len, v1 = len / 2 - t1 * len;
      const h0 = h(t0), h1 = h(t1);
      this.quad(top, W(-w / 2, v0, h0), W(w / 2, v0, h0), W(w / 2, v1, h1), W(-w / 2, v1, h1), 'along', { o, dir });
      // the side walls (a strip per step)
      this.quad(side, W(w / 2, v0, 0), W(w / 2, v1, 0), W(w / 2, v1, h1), W(w / 2, v0, h0), 'along', { o, dir });
      this.quad(side, W(-w / 2, v1, 0), W(-w / 2, v0, 0), W(-w / 2, v0, h0), W(-w / 2, v1, h1), 'along', { o, dir });
    }
    const ht = h(1);
    if (ht > 0.01) this.quad(side, W(w / 2, -len / 2, 0), W(-w / 2, -len / 2, 0), W(-w / 2, -len / 2, ht), W(w / 2, -len / 2, ht), 'along', { o: W(-w / 2, 0, 0), dir: [c, 0, -s] });
  }

  build(mats: Mats, parent: THREE.Object3D, shadows = true): void {
    for (const [t, p] of this.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      const m = new THREE.Mesh(g, mats.style(t));
      m.castShadow = shadows;
      m.receiveShadow = true;
      parent.add(m);
    }
    this.parts.clear();
  }
}

/** Our own pieces of a park, added to a GeoBuilder. */
export function buildCustom(b: GeoBuilder, p: Piece): void {
  const [top, side] = STYLE[p.style ?? 'concrete'];
  if (p.model === 'box') {
    const x0 = p.x - p.sx / 2, x1 = p.x + p.sx / 2, z0 = p.z - p.sz / 2, z1 = p.z + p.sz / 2;
    b.box(top, side, x0, p.y, z0, x1, p.y + p.sy, z1);
    if (p.coping) {
      // a metal edge on the long sides of a ledge
      const y1 = p.y + p.sy, e = 0.07;
      if (p.sx >= p.sz) {
        b.box('metal', 'metal', x0, y1 - e, z0 - 0.02, x1, y1 + 0.015, z0 + 0.1);
        b.box('metal', 'metal', x0, y1 - e, z1 - 0.1, x1, y1 + 0.015, z1 + 0.02);
      } else {
        b.box('metal', 'metal', x0 - 0.02, y1 - e, z0, x0 + 0.1, y1 + 0.015, z1);
        b.box('metal', 'metal', x1 - 0.1, y1 - e, z0, x1 + 0.02, y1 + 0.015, z1);
      }
    }
  } else if (p.model === 'kicker') {
    const ang = p.angle ?? 0.6;
    const R = 1 / Math.sin(ang);
    const H = (t: number) => (R - Math.sqrt(R * R - t * t)) * p.sy;
    b.ramp(top, side, p.x, p.y, p.z, p.rot, p.sx, p.sz, H, 10);
    // a steel lip on top
    const th = p.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const lx = p.x - (p.sz / 2) * s, lz = p.z - (p.sz / 2) * c, ht = p.y + kickerTop(ang) * p.sy;
    const hw = p.sx / 2;
    const ax = Math.abs(c) > 0.5 ? hw : 0.08, az = Math.abs(c) > 0.5 ? 0.08 : hw;
    b.box('metal', 'metal', lx - ax, ht - 0.05, lz - az, lx + ax, ht + 0.02, lz + az);
  } else if (p.model === 'bank') {
    b.ramp(top, side, p.x, p.y, p.z, p.rot, p.sx, p.sz, (t) => t * p.sy, 1);
  }
}

// ------------------------------------------------------------------ merged models

/** The meshes of a loaded model with their matrices relative to the model root. */
function meshesOf(key: string): { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[] {
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.length === 1 || !m.geometry.groups.length) out.push({ geo: m.geometry, mat: mats[0], matrix: m.matrixWorld.clone() });
    else {
      for (const gr of m.geometry.groups) {
        const sub = m.geometry.clone();
        sub.clearGroups();
        if (sub.index) sub.setIndex(Array.from(sub.index.array).slice(gr.start, gr.start + gr.count));
        out.push({ geo: sub, mat: mats[gr.materialIndex ?? 0], matrix: m.matrixWorld.clone() });
      }
    }
  });
  return out;
}

const partsCache = new Map<string, ReturnType<typeof meshesOf>>();

/** Merges model placements into one mesh per material. */
export function mergeModels(items: { key: string; matrix: THREE.Matrix4 }[], mats: Mats, parent: THREE.Object3D, o: { cast?: boolean } = {}): void {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const m = new THREE.Matrix4();
  for (const it of items) {
    let parts = partsCache.get(it.key);
    if (!parts) { parts = meshesOf(it.key); partsCache.set(it.key, parts); }
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      m.multiplyMatrices(it.matrix, p.matrix);
      g.applyMatrix4(m);
      // mirrored placements flip the winding
      if (m.determinant() < 0) {
        const pos = g.attributes.position.array as Float32Array;
        for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
      }
      const list = byMat.get(p.mat) ?? [];
      list.push(g);
      byMat.set(p.mat, list);
    }
  }
  for (const [src, list] of byMat) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mats.of(src));
    mesh.castShadow = o.cast ?? true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

/** The world matrix of a placed Kenney piece. */
export function pieceMatrix(p: { x: number; y: number; z: number; rot: number; sx: number; sy: number; sz: number }): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot * Math.PI / 2),
    new THREE.Vector3(p.sx, p.sy, p.sz),
  );
}

export function propMatrix(p: Prop): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY),
    new THREE.Vector3(p.s, p.s, p.s),
  );
}

export { KITS };
