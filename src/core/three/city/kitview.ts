// City generator: drawing the building kit (Quaternius Downtown City MegaKit, CC0; see kit.ts for
// the layout and tools/import-megakit.mjs for the asset).
//
//   CityKit    the loaded kit: each piece's geometry (merged per piece, a slot per vertex: wall,
//              trim, metal, glass …) and one 2D texture array with the eight tiling base colours.
//              Load kit.glb (CITY_KIT_ASSET) like any model, then CityKit.from(root). One kit
//              serves every view; kit.dispose() frees it.
//   KitLayer   inside a CityView: one InstancedMesh per piece, refilled with the kit buildings
//              (and the kit's street props) round the focus and in front of the camera when the
//              focus moves or the camera turns. Further out (or behind) the buildings' far boxes
//              show instead. The pieces receive shadows; the buildings' shadow proxies in the
//              chunks cast them.
//
// The kit material is a Lambert with the slot shader: the wall slot shows render, brick, stone or
// metal tinted per building, trims are tinted, glass reflects the sky by day and lights up window
// by window at night, the night light map lights the walls from the street.
import * as THREE from 'three';
import { KIT_PIECES, KIT_GLASS, kitLayout, type KitLayout } from './kit';
import { COMMON, type CityUniforms } from './materials';
import { lin } from './geobuf';
import { hash01 } from './rng';
import type { CityPlan, Building } from './types';

/** kit.glb under public/assets (load it with the game's asset(): `asset(CITY_KIT_ASSET)`). */
export const CITY_KIT_ASSET = 'quaternius/downtown-megakit/kit.glb';

const SLOTS = ['wall', 'wall-pale', 'trim', 'trim-dark', 'trim-green', 'metal', 'glass', 'interior', 'slate', 'roof', 'concrete', 'ornament', 'dirt'];
const LAYER_OF_SLOT = [0, 0, 1, 1, 1, 2, -1, -1, 3, 4, 5, 6, 7];
const LAYERS = 8;

interface PieceGeo { position: Float32Array; normal: Float32Array; uv: Float32Array; slot: Float32Array; index: Uint16Array | Uint32Array; tris: number }

export class CityKit {
  readonly pieces: (PieceGeo | null)[] = [];
  readonly texture: THREE.DataArrayTexture;

  private constructor(pieces: (PieceGeo | null)[], texture: THREE.DataArrayTexture) {
    this.pieces = pieces;
    this.texture = texture;
  }

  /** Reads a loaded kit.glb (its scene, or a copy from `model()`). */
  static from(root: THREE.Object3D): CityKit {
    root.updateMatrixWorld(true);
    const images: (CanvasImageSource | null)[] = new Array(LAYERS).fill(null);
    const pieces = KIT_PIECES.map((name) => {
      const node = root.getObjectByName(name);
      if (!node) return null;
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], slot: number[] = [], idx: number[] = [];
      node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        const s = SLOTS.indexOf(mat.name);
        if (s < 0) return;
        const layer = LAYER_OF_SLOT[s];
        if (layer >= 0 && !images[layer] && mat.map?.image) images[layer] = mat.map.image as CanvasImageSource;
        const g = m.geometry;
        const mm = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
        const nm = new THREE.Matrix3().getNormalMatrix(mm);
        const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
        const base = pos.length / 3;
        const v = new THREE.Vector3();
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(mm); pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
          uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
          slot.push(s);
        }
        const I = g.getIndex();
        if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
        else for (let i = 0; i < P.count; i++) idx.push(base + i);
      });
      if (!idx.length) return null;
      const n = pos.length / 3;
      return {
        position: new Float32Array(pos), normal: new Float32Array(nor), uv: new Float32Array(uv), slot: new Float32Array(slot),
        index: n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), tris: idx.length / 3,
      };
    });
    // the base colours as one texture array (same size each), read back through a canvas
    const size = Math.max(1, ...images.map((im) => (im ? (im as { width: number }).width : 1)));
    const data = new Uint8Array(size * size * 4 * LAYERS);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    images.forEach((im, i) => {
      if (im) { g.clearRect(0, 0, size, size); g.drawImage(im, 0, 0, size, size); data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4); }
      else data.fill(160, i * size * size * 4, (i + 1) * size * size * 4);
    });
    const tex = new THREE.DataArrayTexture(data, size, size, LAYERS);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return new CityKit(pieces, tex);
  }

  /** GPU bytes of the texture array (with its mipmaps). */
  get textureBytes(): number { return Math.round(this.texture.image.width * this.texture.image.height * 4 * LAYERS * 4 / 3); }

  dispose(): void { this.texture.dispose(); }
}

/** The kit material: a Lambert with the slot shader (see the header). */
export function kitMaterial(u: CityUniforms, tex: THREE.DataArrayTexture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.uniforms.uKitTex = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSlot;
attribute vec4 aKitA;
varying float vSlot;
varying vec2 vKUv;
varying vec4 vKitA;
varying vec3 vTrimC;
varying vec3 vKWp;
vec3 kitLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
vSlot = aSlot;
vKUv = uv;
vKitA = aKitA;
float tp = aKitA.x;
vTrimC = kitLin(vec3(floor(tp / 65536.0), mod(floor(tp / 256.0), 256.0), mod(tp, 256.0)) / 255.0);`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vKWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${COMMON}
uniform highp sampler2DArray uKitTex;
varying float vSlot;
varying vec2 vKUv;
varying vec4 vKitA;
varying vec3 vTrimC;
varying vec3 vKWp;
vec3 kitTex(float layer, vec2 uv) { return texture(uKitTex, vec3(uv, layer)).rgb; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float slot = floor(vSlot + 0.5);
float mode = floor(vKitA.y + 0.5);
vec3 wallC = diffuseColor.rgb;
vec3 kN = normalize(cross(dFdx(vKWp), dFdy(vKWp)));
vec3 toCam = normalize(cameraPosition - vKWp);
float dCam = length(cameraPosition - vKWp);
vec3 base = vec3(0.6);
vec3 kitEmit = vec3(0.0);
if (slot < 1.5) {
  if (mode < 0.5) {
    // render: the colour with a fine plaster grain
    float g = dot(kitTex(5.0, vKUv * 0.7), vec3(0.33));
    base = wallC * (0.9 + 0.35 * (g - 0.5));
  } else if (mode < 1.5) base = kitTex(0.0, vKUv) * wallC * (slot > 0.5 ? 1.12 : 1.0);
  else if (mode < 2.5) base = kitTex(1.0, vKUv) * wallC;
  else base = kitTex(2.0, vKUv) * wallC;
} else if (slot < 2.5) base = kitTex(1.0, vKUv) * vTrimC * 1.08;
else if (slot < 3.5) base = kitTex(1.0, vKUv) * 0.24;
else if (slot < 4.5) base = kitTex(1.0, vKUv) * mix(vec3(0.22, 0.4, 0.36), vTrimC * 0.5, 0.25);
else if (slot < 5.5) base = kitTex(2.0, vKUv);
else if (slot < 7.5) {
  // glass (and the grey interior behind it): the sky by day, lit window by window at night
  float fres = pow(1.0 - clamp(abs(dot(kN, toCam)), 0.0, 1.0), 2.0);
  vec3 sky = mix(uHorizon, uZenith, 0.35 + 0.3 * vKitA.z);
  base = mix(vec3(0.05, 0.07, 0.09), sky * 0.85, (0.3 + 0.6 * fres) * (1.0 - uNight * 0.85));
  if (slot > 6.5) base = vec3(0.12, 0.12, 0.13);
  float shopGlass = step(1.5, vKitA.w);
  float share = fract(vKitA.w) * (0.25 + 0.75 * uLampOn);
  float lit = step(vKitA.z, share) * step(0.01, uLampOn);
  vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.78, 0.88, 1.0), step(0.8, fract(vKitA.z * 7.31)));
  kitEmit += warm * lit * (0.35 + 0.65 * uNight) * (1.0 - shopGlass);
  vec3 sc = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.9, 1.0), step(0.7, fract(vKitA.z * 3.7)));
  kitEmit += sc * shopGlass * uLampOn * 0.75;
} else if (slot < 8.5) base = kitTex(3.0, vKUv);
else if (slot < 9.5) base = kitTex(4.0, vKUv) * 0.9;
else if (slot < 10.5) base = kitTex(5.0, vKUv);
else if (slot < 11.5) base = kitTex(6.0, vKUv);
else base = kitTex(7.0, vKUv);
diffuseColor.rgb = base;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += kitEmit;')
      .replace('#include <opaque_fragment>', `if (uLampOn > 0.001) {
  vec4 lm = texture2D(uLight, (vKWp.xz - uMapRect.xy) / uMapRect.z);
  float hf = clamp(1.0 - (vKWp.y - lm.a * 64.0) / 11.0, 0.0, 1.0);
  outgoingLight += diffuseColor.rgb * lm.rgb * hf * (0.45 + 0.55 * max(kN.y, 0.0)) * uLampOn * 2.0;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'city-kit-v1';
  return mat;
}

/** Trim colour packed into one float (24 bits are exact in a float32). */
const packHex = (hex: number): number => hex & 0xffffff;
const MODE: Record<string, number> = { stucco: 0, brick: 1, stone: 2, metal: 3 };

interface KitRec { b: Building; lay: KitLayout }

export interface KitLayerOptions {
  /** Kit buildings within this distance of the focus are drawn from the kit (at most). */
  radius: number;
  /** Triangles the kit may draw: buildings fill nearest first and the radius ends where this runs out. */
  budget: number;
  /** Piece types (draw calls) the kit may use at once, the same way. */
  types: number;
  /** Kit street props (bollards, drains …) within this distance (default 140 m). */
  propRadius: number;
}

export class KitLayer {
  readonly meshes: (THREE.InstancedMesh | null)[] = [];
  readonly material: THREE.MeshLambertMaterial;
  private recs: KitRec[] = [];
  private trisOf: number[] = [];
  private kindsOf: Uint8Array[] = [];
  private used = new Uint8Array(KIT_PIECES.length);
  private grid = new Map<number, number[]>();
  private at = new THREE.Vector3(1e9, 0, 1e9);
  private yaw = 1e9;
  private dirty = true;
  /** Kit props of the loaded chunks: records of piece, x, y, z, yaw. */
  props: number[][] = [];
  /** Buildings drawn from the kit at the last fill, and instances. */
  shown = 0;
  instances = 0;
  tris = 0;

  constructor(readonly kit: CityKit, readonly plan: CityPlan, readonly group: THREE.Group, readonly uniforms: CityUniforms,
    readonly base: (b: Building) => number, readonly opts: KitLayerOptions) {
    this.material = kitMaterial(uniforms, kit.texture);
    // lay every kit building out once (cached per building) and index them on a grid
    const counts: number[][] = [];
    for (const b of plan.buildings) {
      if (!b.kit) continue;
      const lay = kitLayout(b);
      const i = this.recs.length;
      this.recs.push({ b, lay });
      const k = this.cell(b.obb.x, b.obb.z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(i);
      const c = new Array(KIT_PIECES.length).fill(0);
      let t = 0;
      for (let j = 0; j < lay.n; j++) { c[lay.piece[j]]++; t += kit.pieces[lay.piece[j]]?.tris ?? 0; }
      counts.push(c);
      this.trisOf.push(t);
      this.kindsOf.push(Uint8Array.from(c.flatMap((n, p) => (n ? [p] : []))));
    }
    // capacity per piece: the most any disc of the radius can hold (a little generous)
    const cap = new Array(KIT_PIECES.length).fill(0);
    const R = opts.radius + 24;
    for (const [key, ids] of this.grid) {
      void ids;
      const cx = Math.floor(key / 4096) - 2048, cz = (key % 4096) - 2048;
      const sum = new Array(KIT_PIECES.length).fill(0);
      const x = (cx + 0.5) * 64, z = (cz + 0.5) * 64;
      for (const r of this.near(x, z, R + 46)) { const c = counts[r]; for (let j = 0; j < c.length; j++) sum[j] += c[j]; }
      for (let j = 0; j < cap.length; j++) cap[j] = Math.max(cap[j], sum[j]);
    }
    // kit props: count them per cell the same way
    const propCount = new Array(KIT_PIECES.length).fill(0);
    const pgrid = new Map<number, number[]>();
    for (const q of plan.props) {
      const piece = KIT_PROP_PIECE[q.kind];
      if (piece === undefined) continue;
      const k = this.cell(q.x, q.z);
      let l = pgrid.get(k);
      if (!l) pgrid.set(k, (l = new Array(KIT_PIECES.length).fill(0)));
      l[piece]++;
    }
    const PR = Math.ceil((opts.propRadius + 128) / 64);
    for (const key of pgrid.keys()) {
      const cx = Math.floor(key / 4096) - 2048, cz = (key % 4096) - 2048;
      const sum = new Array(KIT_PIECES.length).fill(0);
      for (let i = -PR; i <= PR; i++) for (let j = -PR; j <= PR; j++) {
        const l = pgrid.get((cx + i + 2048) * 4096 + cz + j + 2048);
        if (l) for (let p = 0; p < l.length; p++) sum[p] += l[p];
      }
      for (let p = 0; p < sum.length; p++) propCount[p] = Math.max(propCount[p], sum[p]);
    }
    KIT_PIECES.forEach((_, p) => {
      const g = kit.pieces[p];
      const n = cap[p] + propCount[p];
      if (!g || !n) { this.meshes.push(null); return; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
      geo.setAttribute('aSlot', new THREE.BufferAttribute(g.slot, 1));
      geo.setIndex(new THREE.BufferAttribute(g.index, 1));
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aKitA', a);
      const m = new THREE.InstancedMesh(geo, this.material, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = true;
      m.name = 'kit:' + KIT_PIECES[p];
      group.add(m);
      this.meshes.push(m);
    });
  }

  private cell(x: number, z: number): number { return (Math.floor(x / 64) + 2048) * 4096 + Math.floor(z / 64) + 2048; }

  private near(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    const n = Math.ceil(r / 64);
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      for (const k of this.grid.get((cx + i + 2048) * 4096 + cz + j + 2048) ?? []) {
        const b = this.recs[k].b;
        if (Math.hypot(b.obb.x - x, b.obb.z - z) < r) out.push(k);
      }
    }
    return out;
  }

  /** The props of the loaded chunks changed. */
  invalidate(): void { this.dirty = true; }

  /**
   * Refills the pieces when the focus has moved or the camera turned. Returns true when it did.
   * The far boxes of the kit buildings near `focus` hide themselves (uKitFocus, uKitR).
   */
  update(focus: THREE.Vector3, camera: THREE.Camera): boolean {
    const e = camera.matrixWorld.elements;
    // the camera's forward on the ground
    let fx = -e[8], fz = -e[10];
    const fl = Math.hypot(fx, fz);
    if (fl > 1e-4) { fx /= fl; fz /= fl; }
    const yaw = Math.atan2(fx, fz);
    let dy = Math.abs(yaw - this.yaw);
    if (dy > Math.PI) dy = Math.PI * 2 - dy;
    if (!this.dirty && this.at.distanceToSquared(focus) < 8 * 8 && dy < 0.26) return false;
    this.dirty = false;
    this.at.copy(focus);
    this.yaw = yaw;
    this.uniforms.uKitFocus.value.copy(focus);
    const cx = e[12], cz = e[14];
    const look = fl > 0.2; // looking down from high up: no wedge
    for (const m of this.meshes) if (m) m.count = 0;
    let shown = 0, tris = 0;
    const R = this.opts.radius;
    // nearest first; where the triangle budget runs out the kit radius ends (far boxes beyond)
    const list = this.near(focus.x, focus.z, R);
    const d2 = (k: number) => { const b = this.recs[k].b; return (b.obb.x - focus.x) ** 2 + (b.obb.z - focus.z) ** 2; };
    list.sort((a, b) => d2(a) - d2(b));
    let reach = R;
    this.used.fill(0);
    let usedN = 0;
    for (const k of list) {
      const { b, lay } = this.recs[k];
      // only what can be in view: in front of the camera, or close by
      const rb = Math.hypot(b.obb.hw, b.obb.hd) + 4;
      const vx = b.obb.x - cx, vz = b.obb.z - cz;
      const along = vx * fx + vz * fz, across = Math.abs(vx * fz - vz * fx);
      if (look && Math.hypot(vx, vz) > rb + 12 && (along < -rb || across > along * 1.75 + rb)) continue;
      // the piece types this building adds (each one is a draw call)
      const kinds = this.kindsOf[k];
      let more = 0;
      for (let j = 0; j < kinds.length; j++) if (!this.used[kinds[j]]) more++;
      if (tris + this.trisOf[k] > this.opts.budget || usedN + more > this.opts.types) { reach = Math.sqrt(d2(k)) - 0.01; break; }
      for (let j = 0; j < kinds.length; j++) if (!this.used[kinds[j]]) { this.used[kinds[j]] = 1; usedN++; }
      shown++;
      tris += this.fill(b, lay);
    }
    this.uniforms.uKitR.value = reach;
    // the kit's street props of the loaded chunks
    const PR2 = this.opts.propRadius * this.opts.propRadius;
    for (const list of this.props) {
      for (let i = 0; i < list.length; i += 5) {
        const dx = list[i + 1] - focus.x, dz = list[i + 3] - focus.z;
        if (dx * dx + dz * dz > PR2) continue;
        const m = this.meshes[list[i]];
        if (!m || m.count >= m.instanceMatrix.count) continue;
        this.put(m, list[i + 1], list[i + 2], list[i + 3], list[i + 4], 1, 1, 1, PROP_WALL, PROP_KIT);
        tris += this.kit.pieces[list[i]]!.tris;
      }
    }
    let inst = 0;
    for (const m of this.meshes) {
      if (!m) continue;
      m.visible = m.count > 0;
      inst += m.count;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
      (m.geometry.getAttribute('aKitA') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.shown = shown; this.instances = inst; this.tris = tris;
    return true;
  }

  private fill(b: Building, lay: KitLayout): number {
    const k = b.kit!;
    const y0 = this.base(b);
    const wall = lin(k.wallColor);
    const kitA = WORK_A;
    kitA[0] = packHex(k.trimColor);
    kitA[1] = MODE[k.wall];
    let tris = 0;
    const lit = Math.min(0.9, b.lit + 0.1);
    for (let i = 0; i < lay.n; i++) {
      const p = lay.piece[i];
      const m = this.meshes[p];
      if (!m || m.count >= m.instanceMatrix.count) continue;
      const o = i * 7;
      kitA[2] = hash01(b.id, i, 13);
      kitA[3] = KIT_GLASS.has(p) ? lit + (lay.m[o + 1] < 1 && k.ground !== 'plain' ? 2 : 0) : 0;
      this.put(m, lay.m[o], y0 + lay.m[o + 1], lay.m[o + 2], lay.m[o + 3], lay.m[o + 4], lay.m[o + 5], lay.m[o + 6], wall, kitA);
      tris += this.kit.pieces[p]!.tris;
    }
    return tris;
  }

  /** Writes one instance: a yaw rotation with a scale, the wall colour and the kit data. */
  private put(m: THREE.InstancedMesh, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, wall: [number, number, number], a: Float32Array): void {
    const i = m.count++;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const e = m.instanceMatrix.array as Float32Array, o = i * 16;
    e[o] = c * sx; e[o + 1] = 0; e[o + 2] = -s * sx; e[o + 3] = 0;
    e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = s * sz; e[o + 9] = 0; e[o + 10] = c * sz; e[o + 11] = 0;
    e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
    const col = m.instanceColor!.array as Float32Array;
    col[i * 3] = wall[0]; col[i * 3 + 1] = wall[1]; col[i * 3 + 2] = wall[2];
    const aa = (m.geometry.getAttribute('aKitA') as THREE.InstancedBufferAttribute).array as Float32Array;
    aa[i * 4] = a[0]; aa[i * 4 + 1] = a[1]; aa[i * 4 + 2] = a[2]; aa[i * 4 + 3] = a[3];
  }

  dispose(): void {
    for (const m of this.meshes) if (m) { this.group.remove(m); m.geometry.dispose(); m.dispose(); }
    this.material.dispose();
  }
}

const WORK_A = new Float32Array(4);
const PROP_WALL: [number, number, number] = [1, 1, 1];
const PROP_KIT = new Float32Array([0xffffff, 3, 0.5, 0]);
/** Plan prop kinds drawn with kit pieces. */
const KIT_PROP_PIECE: Partial<Record<string, number>> = {
  bollard: KIT_PIECES.indexOf('bollard'), drain: KIT_PIECES.indexOf('drain'), manhole: KIT_PIECES.indexOf('manhole'), kplanter: KIT_PIECES.indexOf('planter'),
};
