// Neon Ronin: the Quaternius Cyberpunk Game Kit in the game (public/assets/quaternius/cyberpunk-kit,
// converted by import-kit.mjs). Loads the rigs and the one props file under the Ayvago intro, gives
// every world its three shared materials (vertex colours lit, glowing parts unlit, the neon signs
// with the one sign texture), clones props by name and merges static pieces into one geometry per
// material (a level chunk is three draw calls).
import Phaser from 'phaser';
import { asset } from '@core';
import { THREE, loadModel, model, modelClips } from '@core/three';

const DIR = 'quaternius/cyberpunk-kit/';
export const RIGS = ['hero', 'walker', 'drone', 'brute', 'mech'] as const;
export type RigId = (typeof RIGS)[number];
export const SIGN_TEX = 'nr-sign';

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const r of RIGS) loadModel(load, 'nr-' + r, asset(DIR + r + '.glb'));
  loadModel(load, 'nr-props', asset(DIR + 'props.glb'));
  load.image(SIGN_TEX, asset(DIR + 'sign.png'));
}

export interface Mats {
  lit: THREE.MeshLambertMaterial;
  /** The rigged figures (smooth normals, a little sheen); each figure flashes its own copy. */
  figure: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  sign: THREE.MeshBasicMaterial;
  /** Signs that flicker on their own (a second and third copy of the sign material). */
  signB: THREE.MeshBasicMaterial;
  signC: THREE.MeshBasicMaterial;
  /** Concrete and panel faces of the buildings (vertex colours, a little rougher). */
  wall: THREE.MeshLambertMaterial;
  /** Lit windows of the far towers. */
  windows: THREE.MeshBasicMaterial;
  /** Foes' lit parts flash white when hit: per-figure copies are made from these. */
  sky: THREE.MeshBasicMaterial;
}

/** The materials of one world (freed with it). */
export function makeMats(scene: Phaser.Scene): Mats {
  const img = scene.textures.get(SIGN_TEX).getSourceImage() as HTMLImageElement;
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  const sign = new THREE.MeshBasicMaterial({ map: tex, fog: true });
  return {
    lit: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    figure: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
    sign,
    signB: sign.clone(),
    signC: sign.clone(),
    wall: new THREE.MeshLambertMaterial({ vertexColors: true }),
    windows: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
    sky: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
  };
}

/** Gives a cloned model the world's materials (by the kit's material names). */
export function dress(o: THREE.Object3D, m: Mats, signMat: THREE.Material = m.sign): THREE.Object3D {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const name = (mesh.material as THREE.Material).name;
    mesh.material = name === 'glow' ? m.glow : name === 'sign' ? signMat : m.lit;
  });
  return o;
}

// ---------------------------------------------------------------- props

let props: Map<string, THREE.Object3D> | null = null;
/** The templates of every prop by name (the kit's one props file, parsed once). */
function templates(): Map<string, THREE.Object3D> {
  if (props) return props;
  props = new Map();
  const root = model('nr-props', { shadows: false });
  root.updateMatrixWorld(true);
  for (const c of [...root.children]) props.set(c.name, c);
  return props;
}

/** A copy of a prop (shares the kit's geometry), dressed in the world's materials. */
export function prop(name: string, m: Mats, signMat?: THREE.Material): THREE.Object3D {
  const t = templates().get(name);
  if (!t) throw new Error('[neon-ronin] no prop ' + name);
  const o = t.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.scale.set(1, 1, 1);
  return dress(o, m, signMat);
}

/** A prop's bounding box (template space). */
const boxes = new Map<string, THREE.Box3>();
export function propBox(name: string): THREE.Box3 {
  let b = boxes.get(name);
  if (!b) {
    const t = templates().get(name)!;
    const o = t.clone(true);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    o.updateMatrixWorld(true);
    b = new THREE.Box3().setFromObject(o);
    boxes.set(name, b);
  }
  return b;
}

/** A rigged figure: its own skeleton, the world's materials (lit parts get a copy that can flash). */
export function rig(id: RigId, m: Mats): { root: THREE.Object3D; clips: THREE.AnimationClip[]; flash: THREE.MeshStandardMaterial } {
  const root = model('nr-' + id, { shadows: false });
  const flash = m.figure.clone();
  root.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const name = (mesh.material as THREE.Material).name;
    mesh.material = name === 'glow' ? m.glow : flash;
  });
  return { root, clips: modelClips('nr-' + id), flash };
}

// ---------------------------------------------------------------- merging

export type Group = 'lit' | 'glow' | 'sign' | 'signB' | 'signC' | 'wall' | 'windows';
interface Part { g: THREE.BufferGeometry; m: THREE.Matrix4 }

/**
 * Collects static pieces and bakes them into one geometry per material: positions, normals and
 * colours in float, the signs' UVs; nothing of the kit's own geometry is touched.
 */
export class Merger {
  private parts = new Map<Group, Part[]>();
  private tmp = new THREE.Matrix4();

  /** Adds a prop placed by `matrix` (its meshes by their material). */
  addProp(name: string, matrix: THREE.Matrix4, signGroup: Group = 'sign'): void {
    const t = templates().get(name);
    if (!t) return;
    t.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(t.matrixWorld).invert();
    t.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name2 = (mesh.material as THREE.Material).name;
      const grp: Group = name2 === 'glow' ? 'glow' : name2 === 'sign' ? signGroup : 'lit';
      const local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      this.add(grp, mesh.geometry, new THREE.Matrix4().multiplyMatrices(matrix, local));
    });
  }

  add(grp: Group, g: THREE.BufferGeometry, m: THREE.Matrix4): void {
    let list = this.parts.get(grp);
    if (!list) { list = []; this.parts.set(grp, list); }
    list.push({ g, m: m.clone() });
  }

  /** A box with a vertex colour per face direction (top, front, sides). */
  addBox(grp: Group, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, front: number, top = front, side = front): void {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const col = new Float32Array(g.attributes.position.count * 3);
    const n = g.attributes.normal;
    const c = new THREE.Color();
    for (let i = 0; i < n.count; i++) {
      const ny = n.getY(i), nz = n.getZ(i);
      c.setHex(ny > 0.5 ? top : Math.abs(nz) > 0.5 ? front : side, THREE.SRGBColorSpace);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.tmp.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(grp, g, this.tmp);
    this.owned.push(g);
  }

  /** A flat quad facing +z with UVs (a sign face, a window strip) and a colour. */
  addQuad(grp: Group, x: number, y: number, z: number, w: number, h: number, uv: [number, number, number, number] | null, color = 0xffffff): void {
    const g = new THREE.PlaneGeometry(w, h);
    if (uv) {
      const a = g.attributes.uv;
      const [u0, v0, u1, v1] = uv;
      a.setXY(0, u0, v0); a.setXY(1, u1, v0); a.setXY(2, u0, v1); a.setXY(3, u1, v1);
    }
    const c = new THREE.Color().setHex(color, THREE.SRGBColorSpace);
    const col = new Float32Array(4 * 3);
    for (let i = 0; i < 4; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.tmp.makeTranslation(x, y, z);
    this.add(grp, g, this.tmp);
    this.owned.push(g);
  }

  private owned: THREE.BufferGeometry[] = [];

  /** The merged meshes (one per material), added to `parent`. */
  build(parent: THREE.Object3D, mats: Mats): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [grp, parts] of this.parts) {
      const geo = mergeParts(parts, grp === 'sign' || grp === 'signB' || grp === 'signC');
      const mesh = new THREE.Mesh(geo, mats[grp]);
      parent.add(mesh);
      out.push(mesh);
    }
    for (const g of this.owned) g.dispose();
    this.owned = [];
    this.parts.clear();
    return out;
  }
}

const V = new THREE.Vector3(), N = new THREE.Vector3(), NM = new THREE.Matrix3();

function mergeParts(parts: Part[], uv: boolean): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index ? p.g.index.count : p.g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const uvs = uv ? new Float32Array(nv * 2) : null;
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.g, P = g.attributes.position, Nn = g.attributes.normal, C = g.attributes.color, U = g.attributes.uv;
    NM.getNormalMatrix(p.m);
    for (let i = 0; i < P.count; i++) {
      V.fromBufferAttribute(P as THREE.BufferAttribute, i).applyMatrix4(p.m);
      pos[(vo + i) * 3] = V.x; pos[(vo + i) * 3 + 1] = V.y; pos[(vo + i) * 3 + 2] = V.z;
      if (Nn) { N.fromBufferAttribute(Nn as THREE.BufferAttribute, i).applyMatrix3(NM).normalize(); nor[(vo + i) * 3] = N.x; nor[(vo + i) * 3 + 1] = N.y; nor[(vo + i) * 3 + 2] = N.z; }
      if (C) { col[(vo + i) * 3] = C.getX(i); col[(vo + i) * 3 + 1] = C.getY(i); col[(vo + i) * 3 + 2] = C.getZ(i); }
      else { col[(vo + i) * 3] = 1; col[(vo + i) * 3 + 1] = 1; col[(vo + i) * 3 + 2] = 1; }
      if (uvs && U) { uvs[(vo + i) * 2] = U.getX(i); uvs[(vo + i) * 2 + 1] = U.getY(i); }
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.getX(k) + vo;
    else for (let k = 0; k < P.count; k++) idx[io + k] = k + vo;
    // a mirrored placement flips the winding
    if (p.m.determinant() < 0) {
      const cnt = g.index ? g.index.count : P.count;
      for (let k = 0; k < cnt; k += 3) { const t = idx[io + k + 1]; idx[io + k + 1] = idx[io + k + 2]; idx[io + k + 2] = t; }
    }
    vo += P.count;
    io += g.index ? g.index.count : P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** UV boxes of the sign atlas's neon panels (u0, v0, u1, v1; flipY off: v grows downwards). */
export const SIGN_UV: Array<[number, number, number, number]> = [
  [0.062, 0.006, 0.254, 0.562], // あらし (vertical)
  [0.283, 0.012, 0.803, 0.164], // じんるい
  [0.279, 0.259, 0.769, 0.4],   // ちょうしょー
  [0.288, 0.421, 0.588, 0.525], // OPEN
  [0.378, 0.532, 0.792, 0.666], // リンゴ
  [0.808, 0.368, 0.969, 0.667], // みせ (vertical)
  [0.057, 0.579, 0.299, 0.669], // SHOP
  [0.042, 0.741, 0.421, 0.862], // ホテル
  [0.575, 0.881, 0.976, 0.99],  // the triangle
  [0.492, 0.747, 0.587, 0.844], // ⊘
  [0.605, 0.747, 0.7, 0.844],   // ▲
  [0.721, 0.747, 0.817, 0.844], // り
];
