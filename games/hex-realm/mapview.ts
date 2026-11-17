// Hex Realm: the overworld in 3D. Every Hexagon Kit tile, river, road and building of the map is
// merged into one mesh on the kit's colour map; each vertex knows its hex, so the fog of war (a
// small data texture) darkens what has not been seen yet, and a sea of instanced clouds hides it
// until the party comes near (the clouds shrink and drift apart as hexes are revealed). The party
// is the hero's own rigged model walking hex to hex; the tracked quest, camps, the warded bridge
// and the travel path are instanced billboards. One draw call for the map, one for the clouds.
import { THREE } from '@core/three';
import { COLS, ROWS, hexIndex, neighbours, type HexMap, type Hex } from './hexmap';
import { hexKey, mergeModels, hexMap, hexMaterial, type Placed } from './kit';
import { Billboards, TEX } from './fx3d';
import type { Campaign } from './campaign';

/** Base tile of each terrain. */
const TILE: Record<string, string> = {
  grass: 'grass', forest: 'grass-forest', hill: 'grass-hill', stone: 'stone', rhill: 'stone-hill', mount: 'stone-mountain',
  rocks: 'stone-rocks', water: 'water', island: 'water-island', wrocks: 'water-rocks', dirt: 'dirt', lumber: 'dirt-lumber',
  sand: 'sand', srocks: 'sand-rocks', river: 'river-straight', bridge: 'bridge',
};

/** Path and river pieces: the edges each reaches as modelled (bit k: 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE). */
const bits = (...k: number[]) => k.reduce((a, b) => a | (1 << b), 0);
const PATHS: [string, number][] = [
  ['path-end', bits(3)], ['path-straight', bits(0, 3)], ['path-corner-sharp', bits(3, 4)], ['path-corner', bits(3, 5)],
  ['path-intersectionA', bits(3, 4, 5)], ['path-intersectionB', bits(0, 3, 5)], ['path-intersectionC', bits(0, 1, 3)],
  ['path-intersectionD', bits(0, 1, 3, 5)], ['path-intersectionE', bits(0, 1, 3, 4)], ['path-intersectionF', bits(1, 3, 5)],
  ['path-intersectionG', bits(0, 1, 3, 4, 5)], ['path-intersectionH', bits(0, 3, 4, 5)], ['path-crossing', 63],
];
const RIVERS: [string, number][] = [
  ['river-end', bits(3)], ['river-straight', bits(0, 3)], ['river-corner-sharp', bits(3, 4)], ['river-corner', bits(3, 5)],
];

/** The piece and the turn (in 60° steps) whose edges match `want`. */
function fit(pieces: [string, number][], want: number): [string, number] | null {
  for (const [name, mask] of pieces) {
    for (let r = 0; r < 6; r++) {
      let m = 0;
      for (let k = 0; k < 6; k++) if (mask & (1 << k)) m |= 1 << ((k - r + 6) % 6);
      if (m === want) return [name, r];
    }
  }
  return null;
}

/** How high the ground stands on each tile kind (the party walks on it). */
export function groundY(h: Hex): number {
  if (h.building) return 0.22;
  switch (h.terrain) {
    case 'hill': return 0.38;
    case 'rhill': return 0.34;
    case 'forest': return 0.22;
    case 'rocks': return 0.26;
    case 'bridge': return 0.42;
    default: return 0.2;
  }
}

/**
 * 1.2.1: the land beyond the ring, out to where the zoomed-out camera may look: rows −11 … ROWS + 3,
 * as wide as `wN` in the north (the view widens towards the top of the screen) and `wS` in the
 * south, centred on `x0`. The camera keeps its view inside this trapezoid (view.ts).
 */
export const SCENERY = { zN: (-11 - (ROWS - 1) / 2) * (Math.sqrt(3) / 2), zS: (ROWS + 3 - (ROWS - 1) / 2) * (Math.sqrt(3) / 2), wN: 19.5, wS: 13, x0: 0 };
/** Where the far band's northern rows begin (their southern tips). */
export const FAR_NORTH_Z = (-3.5 - (ROWS - 1) / 2) * (Math.sqrt(3) / 2);
const sceneryWidth = (z: number) => SCENERY.wS + (SCENERY.wN - SCENERY.wS) * Math.min(1, Math.max(0, (SCENERY.zS - z) / (SCENERY.zS - SCENERY.zN)));

export class MapView {
  readonly root = new THREE.Group();
  readonly fog: THREE.DataTexture;
  private fogData: Uint8Array<ArrayBuffer>;
  private fogTarget: Float32Array;
  private fogNow: Float32Array;
  private clouds: THREE.InstancedMesh;
  private cloudK: Float32Array;
  readonly marks: Billboards;
  readonly flats: Billboards;
  readonly glows: Billboards;
  private time = 0;
  private mesh: THREE.Mesh;
  /** The far band's northern rows (beyond FAR_NORTH_Z). */
  readonly farNorth: THREE.Mesh;

  constructor(private map: HexMap) {
    const N = COLS * ROWS;
    // the tiles, rivers, roads and buildings: one mesh
    const list: Placed[] = [];
    for (const h of map.hexes) {
      const i = h.i;
      let base = h.building ?? TILE[h.terrain];
      let rot = ((h.c * 7 + h.r * 13) % 6) * (Math.PI / 3);
      if (h.terrain === 'river' || h.terrain === 'bridge') {
        const f = fit(h.terrain === 'bridge' ? [['bridge', bits(0, 3)]] : RIVERS, h.riverEdges);
        if (f) { base = f[0]; rot = f[1] * (Math.PI / 3); } else rot = 0;
      }
      if (h.building) rot = h.building === 'building-port' || h.building === 'building-dock' ? Math.PI / 3 * 2 : ((h.c + h.r) % 2) * Math.PI;
      list.push({ key: hexKey(base), x: h.x, y: 0, z: h.z, rot, s: 1, hex: i });
      if (h.road && !h.building) {
        const f = fit(PATHS, h.roadEdges);
        if (f) list.push({ key: hexKey(f[0]), x: h.x, y: 0.2, z: h.z, rot: f[1] * (Math.PI / 3), s: 1, hex: i });
      }
    }
    // a land of mountains, forest and sea beyond the map's edge (wide: the landscape view sees past
    // the realm's sides)
    // 1.2.1: and a wider band of lighter tiles past it (its own mesh, casting no shadow), so the
    // zoomed-out view never runs off the land
    const ring: Placed[] = [], far: Placed[] = [], farNorth: Placed[] = [];
    for (let r = -11; r < ROWS + 4; r++) {
      const z = (r - (ROWS - 1) / 2) * (Math.sqrt(3) / 2), w = sceneryWidth(z) + 0.6;
      for (let c = -16; c < COLS + 16; c++) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) continue;
        const x = c + (((r % 2) + 2) % 2 ? 0.5 : 0) - (COLS - 1) / 2 - 0.25;
        const inner = r >= -3 && r < ROWS + 3 && c >= -7 && c < COLS + 7;
        if (!inner && Math.abs(x - SCENERY.x0) > w) continue;
        const near = Math.max(-c - 1, c - COLS, -r - 1, r - ROWS);
        const k = (c * 7 + r * 13 + 400) % 5;
        let t = r < 0 ? 'stone-mountain' : r >= ROWS ? (c < 4 ? 'water' : 'grass-forest') : c < 0 ? (r > 12 ? 'water' : r < 5 ? 'stone-mountain' : 'grass-forest') : r > 4 && r < 12 ? 'water' : r <= 4 ? 'stone-mountain' : 'grass-forest';
        if (!inner) {
          if (t === 'grass-forest') t = k === 0 ? 'grass-forest' : k === 1 ? 'stone-hill' : 'grass';
          // fewer peaks in the farthest rows (seen only from the realm's north, through the haze)
          else if (t === 'stone-mountain') t = k < (r < -6 ? 1 : 2) ? 'stone-mountain' : k < 4 ? 'stone-hill' : 'stone';
          else if (k === 0 && (c * 3 + r) % 3 === 0) t = 'water-island';
        } else if (near > 0 && t === 'grass-forest') t = k < 2 ? 'grass-hill' : k < 4 ? 'grass-forest' : 'grass';
        else if (near > 0 && t === 'stone-mountain') t = k < 2 ? 'stone-mountain' : k < 4 ? 'stone-hill' : 'stone-rocks';
        else if (near > 1 && t === 'water' && k === 0) t = 'water-island';
        (inner ? ring : r < -3 ? farNorth : far).push({ key: hexKey(t), x, y: 0, z, rot: ((c * 5 + r * 3 + 60) % 6) * (Math.PI / 3), s: 1, hex: N });
      }
    }
    const geo = mergeModels([...list, ...ring], { hex: true });
    this.fogData = new Uint8Array(new ArrayBuffer((N + 1) * 4));
    for (let k = 0; k < 4; k++) this.fogData[N * 4 + k] = 255;
    this.fog = new THREE.DataTexture(this.fogData as unknown as BufferSource, N + 1, 1, THREE.RGBAFormat);
    this.fog.needsUpdate = true;
    this.fogTarget = new Float32Array(N + 1).fill(0);
    this.fogNow = new Float32Array(N + 1).fill(0);
    this.fogTarget[N] = this.fogNow[N] = 1;
    this.mesh = new THREE.Mesh(geo, hexMaterial(hexMap(), this.fog, N + 1));
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.root.add(this.mesh);
    // the far band: the same material (no new shader), no shadow pass; its northern rows (most of
    // its triangles) only drawn while the view reaches them (view.ts)
    const farMesh = new THREE.Mesh(mergeModels(far, { hex: true }), this.mesh.material);
    farMesh.receiveShadow = true;
    this.root.add(farMesh);
    this.farNorth = new THREE.Mesh(mergeModels(farNorth, { hex: true }), this.mesh.material);
    this.farNorth.receiveShadow = true;
    this.root.add(this.farNorth);
    // the ground under it all
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x3f6a4a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.root.add(ground);
    // the clouds over the unknown
    const parts: THREE.BufferGeometry[] = [];
    for (const [x, y, z, r] of [[0, 0.25, 0, 0.44], [0.3, 0.18, 0.14, 0.32], [-0.32, 0.18, -0.06, 0.34], [0.04, 0.32, -0.26, 0.3]]) {
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1, 0.62, 1);
      g.translate(x, y, z);
      parts.push(g.toNonIndexed());
    }
    const cg = mergeGeos(parts);
    this.clouds = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: 0xe8ecf4, emissive: 0x30384a, flatShading: true }), N);
    this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.clouds.castShadow = false;
    this.clouds.frustumCulled = false;
    this.cloudK = new Float32Array(N).fill(1);
    this.root.add(this.clouds);
    this.marks = new Billboards(this.root, TEX.glow(), 64, { blend: 'add', order: 20 });
    this.flats = new Billboards(this.root, TEX.ring(), 64, { blend: 'add', flat: true, order: 6 });
    this.glows = new Billboards(this.root, TEX.flare(), 32, { blend: 'add', order: 21 });
  }

  /** Takes the campaign's fog (instantly with `now`). */
  syncFog(c: Campaign, now = false): void {
    for (const i of c.s.seen) this.fogTarget[i] = 1;
    if (now) {
      for (let i = 0; i < this.fogTarget.length; i++) this.fogNow[i] = this.fogTarget[i];
      for (let i = 0; i < this.cloudK.length; i++) this.cloudK[i] = 1 - this.fogTarget[i];
      this.pushFog();
    }
  }

  private pushFog(): void {
    for (let i = 0; i < this.fogNow.length; i++) {
      const v = Math.round(this.fogNow[i] * 255);
      this.fogData[i * 4] = v; this.fogData[i * 4 + 1] = v; this.fogData[i * 4 + 2] = v; this.fogData[i * 4 + 3] = 255;
    }
    this.fog.needsUpdate = true;
  }

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  update(dt: number): void {
    this.time += dt;
    let changed = false;
    for (let i = 0; i < this.fogNow.length; i++) {
      if (this.fogNow[i] < this.fogTarget[i]) { this.fogNow[i] = Math.min(this.fogTarget[i], this.fogNow[i] + dt * 1.6); changed = true; }
    }
    if (changed) this.pushFog();
    // the clouds: drift and breathe; shrink away where the land is known
    let n = 0;
    for (const h of this.map.hexes) {
      const target = 1 - this.fogTarget[h.i];
      const k = this.cloudK[h.i] = target < this.cloudK[h.i] ? Math.max(target, this.cloudK[h.i] - dt * 1.4) : target;
      if (k <= 0.01) continue;
      const bob = Math.sin(this.time * 0.6 + h.i * 1.7) * 0.04;
      const out = 1 - k;
      this.v.set(h.x + Math.sin(h.i * 2.3) * 0.1 + out * Math.sin(h.i) * 0.5, 0.42 + bob + out * 0.6, h.z + Math.cos(h.i * 1.3) * 0.1);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.i * 1.1 + this.time * 0.05);
      const s = (1.0 + Math.sin(h.i * 3.1) * 0.12) * Math.max(0.05, k);
      this.m.compose(this.v, this.q, this.sc.set(s, s, s));
      this.clouds.setMatrixAt(n++, this.m);
    }
    this.clouds.count = n;
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  dispose(): void { /* the world frees everything in its scene */ }
}

/** Joins non-indexed geometries with the same attributes. */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = list[0].getAttribute(n).itemSize;
    const total = list.reduce((a, g) => a + g.getAttribute(n).count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of list) { const a = g.getAttribute(n); for (let i = 0; i < a.count * size; i++) arr[o++] = (a.array as ArrayLike<number>)[i]; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  for (const g of list) g.dispose();
  return out;
}

export { hexIndex, neighbours };
