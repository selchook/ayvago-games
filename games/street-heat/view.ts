// Street Heat: the 3D view of the simulation. The city is built per block ("chunk"): a detailed
// mesh (buildings, lamps, markings, props, trees, neon) near the camera and a box mesh (lit window
// grids) farther out, all on the one city material (look.ts), plus one mesh of streets and
// sidewalks for the whole city. Cars, people, props and traffic lights are instanced per model; the
// night's light, the particles, tyre marks, glows and markers come from fx3d.ts. The camera follows
// the car (chase, far or bumper view), shakes on hits and widens with nitro.
import { THREE, World3D } from '@core/three';
import { city, City, PITCH, NB, SIZE, SIDEWALK, CURB, LANE, halfWidth, type Block, type Rect } from './city';
import { Extra, mergeCity, kindGeometry, hasPiece, cityReady, piece, type Placed } from './kit';
import { cityMaterial, vehicleMaterial, layerTexture, NightLights, L, spotTexture, layersReady } from './look';
import { Particles, SkidMarks, Glows, Markers } from './fx3d';
import type { Sim, Car, SimEvent } from './sim';
import type { Job, MarkerKind } from './jobs';
import { clamp, COP_MODEL } from './defs';

export type CamMode = 'chase' | 'far' | 'bumper';

const MARKER_COLOR: Record<MarkerKind, number> = { pickup: 0x3ef2ff, drop: 0x5dff7a, check: 0xffd23f, phone: 0xffb03a, fare: 0xffe36a, spray: 0xff4fa3, garage: 0x6aa8ff, stunt: 0xff7a1a, target: 0xff3f6a };
export { MARKER_COLOR };

const SHIRTS = [0xd8342a, 0x2a6fd8, 0xf2f2f0, 0x2fae5a, 0xf2b81a, 0x7a3ad8, 0xff8a1e, 0x3a3d44];
const POSES = ['Male_Walking', 'Male_Running', 'Male_Standing', 'Male_Standing_Hips', 'Male_Standing_Waving', 'Female_Walking', 'Female_Running', 'Female_Standing', 'Female_Standing_Hips', 'Woman_Standing_Waving'];

interface Inst { mesh: THREE.InstancedMesh; state: THREE.InstancedBufferAttribute; n: number }
interface Chunk { cx: number; cz: number; detail: THREE.Mesh | null; lod: THREE.Mesh | null; built: number }

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();

/** Simple prop geometry made in code (hydrant, bin, paper box, bench, barrier): vertex colours, no texture. */
function boxGeo(parts: [number, number, number, number, number, number, number][]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const [w, h, d, x, y, z, color] of parts) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y + h / 2, z);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    tmpC.setHex(color).convertSRGBToLinear();
    for (let i = 0; i < n; i++) { c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('_kind', new THREE.BufferAttribute(new Float32Array(n), 1));
    geos.push(g);
  }
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), kind = new Float32Array(total);
  let o = 0;
  for (const g of geos) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('_kind', new THREE.BufferAttribute(kind, 1));
  out.computeBoundingSphere();
  return out;
}

const PROP_GEO: Record<string, () => THREE.BufferGeometry> = {
  hydrant: () => boxGeo([[0.34, 0.62, 0.34, 0, 0, 0, 0xc0392b], [0.5, 0.12, 0.16, 0, 0.36, 0, 0xc0392b], [0.24, 0.12, 0.24, 0, 0.62, 0, 0xe0e0e0]]),
  bin: () => boxGeo([[0.6, 0.9, 0.6, 0, 0, 0, 0x2f5a3a], [0.66, 0.08, 0.66, 0, 0.9, 0, 0x1c2a20]]),
  paper: () => boxGeo([[0.55, 0.3, 0.45, 0, 0, 0, 0x333338], [0.55, 0.65, 0.45, 0, 0.3, 0, 0x2a6fd8], [0.5, 0.25, 0.05, 0, 0.62, 0.23, 0xe8e4dc]]),
  bench: () => boxGeo([[1.8, 0.08, 0.5, 0, 0.42, 0, 0x8a5a2a], [1.8, 0.45, 0.06, 0, 0.5, -0.22, 0x8a5a2a], [0.08, 0.42, 0.4, -0.8, 0, 0, 0x2a2a2e], [0.08, 0.42, 0.4, 0.8, 0, 0, 0x2a2a2e]]),
  barrier: () => boxGeo([[2.2, 0.25, 0.12, 0, 0.75, 0, 0xff6a1a], [2.2, 0.2, 0.12, 0, 0.4, 0, 0xf4f4f4], [0.1, 1.0, 0.1, -1, 0, 0, 0x9a9ea6], [0.1, 1.0, 0.1, 1, 0, 0, 0x9a9ea6]]),
  spike: () => boxGeo([[0.6, 0.06, 1, 0, 0, 0, 0x222226], [0.12, 0.14, 1, 0, 0, 0, 0xc0c4cc]]),
};

export interface ViewOptions { menu?: boolean; night: number; fov?: number; /** Only build the chunks this close to the start (the menu). */ radius?: number }

export class View {
  readonly world: World3D;
  readonly lights = new NightLights();
  readonly city: City = city();
  private tex: ReturnType<typeof layerTexture>;
  private cityMat: THREE.MeshLambertMaterial;
  private vehMat: THREE.MeshLambertMaterial;
  private chunks: Chunk[] = [];
  private base: THREE.Mesh | null = null;
  private border: THREE.Mesh | null = null;
  private cars = new Map<string, Inst>();
  private peds = new Map<string, Inst>();
  private props = new Map<string, Inst>();
  private signals: Inst | null = null;
  readonly smoke: Particles;
  readonly sparks: Particles;
  readonly skids: SkidMarks;
  readonly glows: Glows;
  readonly markers = new Markers();
  private fountains: { x: number; z: number; t: number }[] = [];
  private sky: THREE.Mesh;
  cam: CamMode = 'chase';
  private camPos = new THREE.Vector3(0, 30, 0);
  private camLook = new THREE.Vector3();
  private shakeT = 0;
  private shakeK = 0;
  private fovKick = 0;
  private builtCity = false;
  private buildQueue: number[] = [];
  private time = 0;
  private baseFov: number;
  /** Test/menu hook: a fixed camera. */
  debugCam: { pos: [number, number, number]; look: [number, number, number] } | null = null;
  /** The menu's slow drive: a path round the blocks. */
  menuT = 0;
  /** Replay: when set, the camera looks at this (x, y, z) from a cinematic angle. */
  replay: { x: number; y: number; z: number; h: number; t: number; shot: number } | null = null;
  night: number;
  drawCalls = 0;
  /** The hub and the menu: the camera drifts round the parked car. */
  orbit = false;
  private hemi!: THREE.HemisphereLight;
  private moon!: THREE.DirectionalLight;

  constructor(private host: Phaser.Scene, private opt: ViewOptions) {
    this.night = opt.night;
    const fogColor = this.night > 0.8 ? 0x0b0d1f : this.night > 0.6 ? 0x1c1630 : 0x5a4a6a;
    this.baseFov = opt.fov ?? 62;
    // phones render at a lower scale (the HUD stays sharp: it is Phaser's)
    const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
    this.world = new World3D(host, { fov: this.baseFov, near: 0.5, far: 420, background: fogColor, fog: { color: fogColor, near: 70, far: 300 }, shadows: false, quality: touch ? 0.7 : 0.85 });
    const w = this.world;
    this.lights.night.value = this.night;
    this.hemi = new THREE.HemisphereLight(0x5a6ab8, 0x1a1424, 1.5);
    this.moon = new THREE.DirectionalLight(0x9ab0ff, 0.7);
    this.moon.position.set(-0.4, 1, 0.6);
    w.scene.add(this.hemi, this.moon);
    this.tex = layerTexture();
    this.cityMat = cityMaterial(this.tex, this.lights);
    this.vehMat = vehicleMaterial(this.lights);
    this.sky = this.makeSky(fogColor);
    w.scene.add(this.sky);
    this.setNight(this.night);
    const H = host.scale.height * 0.85;
    this.smoke = new Particles(700, false, H, this.baseFov);
    this.sparks = new Particles(400, true, H, this.baseFov);
    this.skids = new SkidMarks();
    const spot = spotTexture();
    this.glows = new Glows(spot, 420);
    w.scene.add(this.smoke.points, this.sparks.points, this.skids.mesh, this.glows.mesh, this.markers.group);
    this.buildBase();
    for (let bz = -1; bz <= NB; bz++) for (let bx = -1; bx <= NB; bx++) this.chunks.push({ cx: bx, cz: bz, detail: null, lod: null, built: 0 });
    w.camera.position.set(SIZE / 2, 60, SIZE / 2);
  }

  /** Day, dusk or night (0 … 1): the sky, the fog, the ambient light, the lamps and windows. */
  setNight(n: number): void {
    this.night = n;
    this.lights.night.value = n;
    const fog = n > 0.8 ? 0x0b0d1f : n > 0.6 ? 0x1c1630 : 0x4a3a5e;
    const sc = this.world.scene;
    (sc.background as THREE.Color | null)?.setHex(fog);
    (sc.fog as THREE.Fog | null)?.color.setHex(fog);
    this.hemi.color.setHex(n > 0.8 ? 0x5a6ab8 : n > 0.6 ? 0x8a7ac0 : 0xb09ad0);
    this.hemi.groundColor.setHex(n > 0.8 ? 0x1a1424 : 0x3a2a30);
    this.hemi.intensity = n > 0.8 ? 1.5 : n > 0.6 ? 1.8 : 2.1;
    this.moon.color.setHex(n > 0.8 ? 0x9ab0ff : 0xffa070);
    this.moon.intensity = n > 0.8 ? 0.7 : 1.2;
    this.paintSky(fog);
  }

  /** Clears the effects (a new job). */
  reset(): void {
    this.smoke.clear(); this.sparks.clear();
    this.fountains.length = 0;
    this.replay = null;
    this.shakeT = 0; this.fovKick = 0;
  }

  // ---------------------------------------------------------------- the static city

  /** The streets and sidewalks of the whole city (and the river) as one mesh; buildings come per chunk. */
  private buildBase(): void {
    const e = new Extra();
    const c = this.city;
    // asphalt over everything inside the outer sidewalks, plus the ring's outer half
    const out = halfWidth(0) + SIDEWALK;
    for (let bz = -1; bz <= NB; bz++) for (let bx = -1; bx <= NB; bx++) {
      const x0 = Math.max(-out, bx * PITCH), x1 = Math.min(SIZE + out, (bx + 1) * PITCH), z0 = Math.max(-out, bz * PITCH), z1 = Math.min(SIZE + out, (bz + 1) * PITCH);
      if (x1 <= x0 || z1 <= z0) continue;
      e.flat(x0, z0, x1, z1, 0, L.asphalt, 0x9a9aa0);
    }
    // block slabs (sidewalks, lawns, plazas), lots at road level
    for (const b of c.blocks) this.slab(e, b);
    // the outer sidewalks of the ring road
    const o2 = halfWidth(0);
    e.box(-out - 4, 0, -out - 4, SIZE + out + 4, CURB, -o2, L.pavement);
    e.box(-out - 4, 0, -o2, -o2, CURB, SIZE + o2, L.pavement);
    e.box(SIZE + o2, 0, -o2, SIZE + out + 4, CURB, SIZE + o2, L.pavement);
    e.box(-out - 4, 0, SIZE + o2, SIZE + out + 4, CURB, SIZE + out, L.pavement);
    // the river: water south of the embankment, a far bank
    e.flat(-260, SIZE + out, SIZE + 260, SIZE + out + 140, -1.2, L.water, 0x0a1a30);
    e.box(-260, -1.2, SIZE + out - 0.2, SIZE + 260, CURB, SIZE + out + 0.3, L.concrete, 0x9a9aa0, true);
    // the railing along the river
    for (let x = -out; x < SIZE + out; x += 3) e.box(x, CURB, SIZE + out - 0.5, x + 0.1, 1.1, SIZE + out - 0.4, L.metal, 0x6a6e78);
    e.box(-out, 1.0, SIZE + out - 0.55, SIZE + out, 1.12, SIZE + out - 0.35, L.metal, 0x8a8e98);
    e.flat(-260, SIZE + out + 140, SIZE + 260, SIZE + out + 200, 0.5, L.pavement, 0x505060);
    this.base = new THREE.Mesh(mergeCity([], [e]), this.cityMat);
    this.base.frustumCulled = false;
    this.world.scene.add(this.base);
  }

  /** A block's raised slab: pavement round the edge; inside a lawn, a plaza, an asphalt lot or dirt. */
  private slab(e: Extra, b: Block): void {
    const r = b.inner, s = SIDEWALK;
    const outer: Rect = { x0: r.x0 - s, z0: r.z0 - s, x1: r.x1 + s, z1: r.z1 + s };
    const lowInside = b.ground === 'asphalt' || b.ground === 'dirt';
    const pieces: Rect[] = [];
    if (b.alley) {
      pieces.push({ ...outer, x1: b.alley.x0 }, { ...outer, x0: b.alley.x1 });
    } else pieces.push(outer);
    for (const p of pieces) {
      if (lowInside) {
        // a ring of sidewalk round a lot at road level
        e.box(p.x0, 0, p.z0, p.x1, CURB, r.z0, L.pavement);
        e.box(p.x0, 0, r.z1, p.x1, CURB, p.z1, L.pavement);
        e.box(p.x0, 0, r.z0, r.x0, CURB, r.z1, L.pavement);
        e.box(r.x1, 0, r.z0, p.x1, CURB, r.z1, L.pavement);
      } else e.box(p.x0, 0, p.z0, p.x1, CURB, p.z1, L.pavement);
    }
    if (b.ground === 'grass') e.flat(r.x0, r.z0, r.x1, r.z1, CURB + 0.01, L.grass, 0xc8d8b0);
    if (b.ground === 'asphalt') e.flat(r.x0, r.z0, r.x1, r.z1, 0.01, L.asphalt, 0x8a8a90);
    if (b.ground === 'dirt') e.flat(r.x0, r.z0, r.x1, r.z1, 0.01, L.dirt, 0xb0a090);
    if (b.alley) e.flat(b.alley.x0, outer.z0, b.alley.x1, outer.z1, 0.005, L.asphalt, 0x6a6a70);
  }

  /** Builds a chunk's detailed and far meshes (needs the city packs). */
  private buildChunk(ch: Chunk): void {
    const c = this.city;
    const { cx, cz } = ch;
    const inside = cx >= 0 && cz >= 0 && cx < NB && cz < NB;
    const placed: Placed[] = [];
    const e = new Extra();
    const lod = new Extra();
    const x0 = cx * PITCH, z0 = cz * PITCH, x1 = x0 + PITCH, z1 = z0 + PITCH;
    const within = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const addBuilding = (bd: { key: string; x: number; z: number; rot: number; s: number; sx?: number; sy?: number; tint?: number; box: Rect; h: number; color: number }) => {
      placed.push({ key: bd.key, x: bd.x, y: 0, z: bd.z, rot: bd.rot, s: bd.s, sx: bd.sx, sy: bd.sy, tint: bd.tint });
      lod.box(bd.box.x0, 0, bd.box.z0, bd.box.x1, bd.h, bd.box.z1, L.lod, bd.color);
    };
    if (inside) {
      const b = c.blocks[cz * NB + cx];
      for (const bd of b.buildings) addBuilding(bd);
      this.blockDetail(e, b, placed);
      if (!b.buildings.length) lod.flat(b.inner.x0, b.inner.z0, b.inner.x1, b.inner.z1, 0.2, L.grass, 0x406040);
    }
    for (const bd of c.outskirts) if (within(bd.x, bd.z)) addBuilding(bd);
    // street lamps, trees, containers, ramps, markings in this square
    for (let i = 0; i < c.lampPosts.length; i++) {
      const lp = c.lampPosts[i];
      if (!within(lp.x, lp.z)) continue;
      this.lampPost(e, lp.x, lp.z, lp.rot);
    }
    for (const t of c.trees) if (within(t.x, t.z)) placed.push({ key: t.key, x: t.x, y: this.city.offRoad(t.x, t.z) ? CURB : 0, z: t.z, rot: (t.x * 7.3) % 6.28, s: t.s });
    for (const k of c.containers) if (within((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2)) {
      e.box(k.x0, 0, k.z0, k.x1, k.h, k.z1, L.metal, k.color);
      lod.box(k.x0, 0, k.z0, k.x1, k.h, k.z1, L.lod, k.color);
    }
    for (const r of c.ramps) if (within(r.x, r.z)) this.ramp(e, r.x, r.z, r.rot, r.w, r.len, r.h);
    this.markings(e, x0, z0, x1, z1);
    if (!placed.length && e.empty) { ch.built = 2; return; }
    if (placed.length || !e.empty) {
      const g = mergeCity(placed, [e]);
      ch.detail = new THREE.Mesh(g, this.cityMat);
      ch.detail.visible = false;
      this.world.scene.add(ch.detail);
    }
    if (!lod.empty) {
      ch.lod = new THREE.Mesh(mergeCity([], [lod]), this.cityMat);
      ch.lod.visible = false;
      this.world.scene.add(ch.lod);
    }
    ch.built = 2;
  }

  /** What a block adds besides its buildings: planters, neon signs, the plaza's monument, parking lines. */
  private blockDetail(e: Extra, b: Block, placed: Placed[]): void {
    const r = b.inner;
    const seed = b.bx * 31 + b.bz * 17;
    if ('DA'.includes(b.type)) {
      // planters along the front, neon over a few shop fronts
      for (let k = 0; k < 3; k++) {
        const x = r.x0 + 8 + ((seed * (k + 3)) % Math.max(1, Math.floor(r.x1 - r.x0 - 16)));
        placed.push({ key: 'city:Sidewalk_Planter', x, y: CURB, z: r.z1 + SIDEWALK - 0.9, rot: 0, s: 1 });
      }
      const neon = [0xff3fa4, 0x3ef2ff, 0xffb03a, 0x9a5cff];
      for (let k = 0; k < 2; k++) {
        const bd = b.buildings[(seed + k * 3) % Math.max(1, b.buildings.length)];
        if (!bd) continue;
        const fx = Math.sin(bd.rot), fz = Math.cos(bd.rot);
        const nx = bd.x + fx * 0.35, nz = bd.z + fz * 0.35;
        const w = 3.2 + (seed % 3);
        const tint = neon[(seed + k) % neon.length];
        e.rotBox(nx, nz, w, 0.12, 4.2, 4.42, bd.rot, L.glow, tint);
        e.rotBox(nx, nz, w, 0.12, 5.4, 5.62, bd.rot, L.glow, tint);
        e.rotBox(nx - fz * 0 + Math.cos(bd.rot) * (w / 2), nz - Math.sin(bd.rot) * (w / 2), 0.14, 0.12, 4.2, 5.62, bd.rot, L.glow, tint);
      }
    }
    if (b.type === 'X') {
      // the monument: a plinth and a glowing column
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2 + 7;
      e.box(cx - 2.5, CURB, cz - 2.5, cx + 2.5, 1.4, cz + 2.5, L.palebrick);
      e.box(cx - 0.8, 1.4, cz - 0.8, cx + 0.8, 9, cz + 0.8, L.metal, 0xd0d0d8);
      e.box(cx - 0.9, 9, cz - 0.9, cx + 0.9, 9.4, cz + 0.9, L.glow, 0x3ef2ff);
      for (const [px, pz] of [[-8, -6], [8, -6], [-8, 8], [8, 8]]) placed.push({ key: 'city:Prop_Planter_Single', x: cx + px, y: CURB, z: cz + pz, rot: 0, s: 1 });
    }
    if (b.type === 'L') {
      for (let row = 0; row < 3; row++) for (let k = 0; k <= 8; k++) {
        const x = r.x0 + 4 + (k - 0.5) * ((r.x1 - r.x0 - 8) / 7), z = r.z0 + 7 + row * 15;
        e.flat(x - 0.08, z - 2.6, x + 0.08, z + 2.6, 0.03, L.paint, 0xe8e8e0);
      }
    }
    if (b.type === 'G' || b.type === 'C' || b.type === 'R' || b.type === 'T') this.landmark(e, b);
    // manholes in the streets north and west of the block
    placed.push({ key: 'city:Prop_ManholeCover', x: b.bx * PITCH + 20 + (seed % 20), y: 0.01, z: b.bz * PITCH + 1.2, rot: 0, s: 1.2 });
  }

  /** A sign over the place's front: the garage's roller door, the precinct's blue light, the spray shop's pink neon. */
  private landmark(e: Extra, b: Block): void {
    const place = b.type === 'G' ? 'garage' : b.type === 'C' ? 'precinct' : b.type === 'R' ? 'spray' : 'station';
    const s = this.city.places.get(place);
    if (!s) return;
    // the front of the block behind the spot
    const side = s.side;
    const r = b.inner;
    const fx = side === 1 ? r.x1 : side === 3 ? r.x0 : s.x, fz = side === 0 ? r.z0 : side === 2 ? r.z1 : s.z;
    const rot = side === 0 ? Math.PI : side === 1 ? Math.PI / 2 : side === 2 ? 0 : -Math.PI / 2;
    const color = place === 'garage' ? 0xffb03a : place === 'precinct' ? 0x3a7aff : place === 'spray' ? 0xff3fa4 : 0x5dff7a;
    const ox = Math.sin(rot) * 0.4, oz = Math.cos(rot) * 0.4;
    e.rotBox(fx + ox, fz + oz, 7, 0.2, 6.2, 7.6, rot, L.glow, color);
    e.rotBox(fx + ox * 0.5, fz + oz * 0.5, 6, 0.3, CURB, 4.6, rot, L.metal, 0x4a4c52);
  }

  private lampPost(e: Extra, x: number, z: number, rot: number): void {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    e.box(x - 0.09, CURB, z - 0.09, x + 0.09, 6.4, z + 0.09, L.metal, 0x3a3c44);
    // the arm out over the street and the lamp head
    const hx = x + fx * 1.6, hz = z + fz * 1.6;
    e.box(Math.min(x, hx) - 0.05, 6.3, Math.min(z, hz) - 0.05, Math.max(x, hx) + 0.05, 6.42, Math.max(z, hz) + 0.05, L.metal, 0x3a3c44);
    e.box(hx - 0.35, 6.05, hz - 0.35, hx + 0.35, 6.3, hz + 0.35, L.metal, 0x2a2c34);
    e.flat(hx - 0.3, hz - 0.3, hx + 0.3, hz + 0.3, 6.04, L.glow, 0xffb060);
    // flip the glow quad to face down
    const n = e.idx.length;
    const t = e.idx[n - 1]; e.idx[n - 1] = e.idx[n - 2]; e.idx[n - 2] = t;
    const t2 = e.idx[n - 4]; e.idx[n - 4] = e.idx[n - 5]; e.idx[n - 5] = t2;
  }

  private ramp(e: Extra, x: number, z: number, rot: number, w: number, len: number, h: number): void {
    const fx = Math.sin(rot), fz = Math.cos(rot), rx = fz, rz = -fx;
    const p = (a: number, s: number, y: number) => [x + fx * a + rx * s, y, z + fz * a + rz * s];
    const a0 = -len / 2, a1 = len / 2, s0 = -w / 2, s1 = w / 2;
    e.quad(p(a0, s1, 0.02), p(a0, s0, 0.02), p(a1, s0, h), p(a1, s1, h), L.metal, 0xd0c060);
    e.quad(p(a1, s0, 0), p(a1, s1, 0), p(a1, s1, h), p(a1, s0, h), L.metal, 0x8a8a40);
    e.quad(p(a0, s0, 0), p(a1, s0, 0), p(a1, s0, h), p(a0, s0, 0.02), L.metal, 0x6a6a40);
    e.quad(p(a1, s1, 0), p(a0, s1, 0), p(a0, s1, 0.02), p(a1, s1, h), L.metal, 0x6a6a40);
    // chevrons on the ramp
    for (let k = 0; k < 3; k++) {
      const a = a0 + len * (0.25 + k * 0.22), y = h * (a - a0) / len + 0.04;
      e.quad(p(a, s1 * 0.8, y), p(a, s0 * 0.8, y), p(a + 0.4, s0 * 0.8, y + h * 0.4 / len), p(a + 0.4, s1 * 0.8, y + h * 0.4 / len), L.glow, 0xff7a1a);
    }
  }

  /** Lane lines, crosswalks, stop lines and arrows on the streets along this square's north and west edges. */
  private markings(e: Extra, x0: number, z0: number, x1: number, z1: number): void {
    const c = this.city;
    for (const ed of c.edges) {
      const a = c.nodes[ed.a], b = c.nodes[ed.b];
      // the street's middle (owned by the square holding its first half)
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const ox = ed.horizontal ? mx : mx + 0.01, oz = ed.horizontal ? mz + 0.01 : mz;
      if (!(ox >= x0 && ox < x1 && oz >= z0 && oz < z1)) continue;
      const hw = halfWidth(ed.line);
      const startA = c.stopBack(ed, ed.a) - 3.4 + 0.5, endB = c.stopBack(ed, ed.b) - 3.4 + 0.5;
      const len = ed.len;
      // along the street from a to b: u = 0 … len
      const P = (u: number, v: number): [number, number] => ed.horizontal ? [a.x + u, a.z + v] : [a.x + v, a.z + u];
      const line = (u0: number, u1: number, v: number, wdt: number, color: number) => {
        const [ax, az] = P(u0, v - wdt / 2), [bx, bz] = P(u1, v + wdt / 2);
        e.flat(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), 0.02, L.paint, color);
      };
      const u0 = startA + 3.6, u1 = len - endB - 3.6;
      if (ed.lanes === 1) {
        for (let u = u0; u < u1 - 1; u += 6) line(u, Math.min(u + 3, u1), 0, 0.16, 0xe8e8e0);
      } else {
        line(u0, u1, -0.14, 0.12, 0xf0b830);
        line(u0, u1, 0.14, 0.12, 0xf0b830);
        for (const v of [-(LANE + 0.3), LANE + 0.3]) for (let u = u0; u < u1 - 1; u += 9) line(u, Math.min(u + 3, u1), v, 0.14, 0xe8e8e0);
      }
      // the crossings at each end
      for (const end of [0, 1]) {
        const node = end === 0 ? a : b;
        if (!node.light) continue;
        const sb = c.stopBack(ed, node.id) - 3.4;
        const uA = end === 0 ? sb + 0.4 : len - sb - 3.2;
        // zebra stripes across the street
        for (let v = -hw + 0.6; v < hw - 0.4; v += 1.1) line(uA, uA + 2.8, v + 0.25, 0.55, 0xe8e8e0);
        // the stop line on the incoming lanes (right side of traffic arriving at this node)
        const uS = end === 0 ? sb + 3.6 : len - sb - 3.6 - 0.45;
        const side = end === 0 ? (ed.horizontal ? -1 : 1) : (ed.horizontal ? 1 : -1);
        const [sx0, sz0] = P(uS, 0.2 * side), [sx1, sz1] = P(uS + 0.45, (hw - 0.2) * side);
        e.flat(Math.min(sx0, sx1), Math.min(sz0, sz1), Math.max(sx0, sx1), Math.max(sz0, sz1), 0.02, L.paint, 0xf4f4f0);
        // an arrow in each incoming lane
        for (let k = 0; k < ed.lanes; k++) {
          const v = (0.3 + (k + 0.5) * LANE) * side;
          const uArr = end === 0 ? uS + 6 : uS - 6.5;
          this.arrow(e, P, uArr, v, end === 0 ? -1 : 1);
        }
      }
    }
  }

  /** A straight-on arrow from the decal sheet, pointing along +u (dir 1) or −u. */
  private arrow(e: Extra, P: (u: number, v: number) => [number, number], u: number, v: number, dir: number): void {
    const hl = 1.2, hw = 0.5;
    const pts = [P(u - hl * dir, v - hw), P(u - hl * dir, v + hw), P(u + hl * dir, v + hw), P(u + hl * dir, v - hw)].map(([x, z]) => [x, 0.025, z]);
    // the sheet's straight arrow: u 0.355 … 0.44, v 0.57 … 0.80 (tip at the top)
    const uv = [0.44, 0.8, 0.355, 0.8, 0.355, 0.57, 0.44, 0.57];
    // facing up: order the corners so the quad's normal points +y
    const cross = (pts[1][0] - pts[0][0]) * (pts[2][2] - pts[0][2]) - (pts[1][2] - pts[0][2]) * (pts[2][0] - pts[0][0]);
    if (cross > 0) e.quad(pts[0], pts[1], pts[2], pts[3], L.decals, 0xe8e8e0, uv);
    else e.quad(pts[3], pts[2], pts[1], pts[0], L.decals, 0xe8e8e0, [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]]);
  }

  /** Builds the city's chunks (a few per frame once the packs are in). */
  buildStep(budget = 3): void {
    if (!cityReady()) return;
    if (!this.tex.painted && layersReady()) this.tex.refresh();
    if (!this.buildQueue.length && !this.builtCity) {
      // nearest first
      const cx = this.camLook.x, cz = this.camLook.z;
      this.buildQueue = this.chunks.map((_, i) => i).sort((a, b) => this.chunkDist(this.chunks[a], cx, cz) - this.chunkDist(this.chunks[b], cx, cz));
      this.builtCity = true;
    }
    for (let k = 0; k < budget && this.buildQueue.length; k++) {
      const ch = this.chunks[this.buildQueue.shift()!];
      // the menu builds only round its corner
      if (this.opt.radius && this.chunkDist(ch, this.camLook.x, this.camLook.z) > this.opt.radius) { k--; continue; }
      this.buildChunk(ch);
    }
    if (this.builtCity && !this.signals && hasPiece('transport:TrafficLight')) this.makeSignals();
  }

  /** Builds every chunk now (screenshots, the store art). */
  buildAll(): void { while (cityReady() && (!this.builtCity || this.buildQueue.length)) this.buildStep(100); }

  get cityBuilt(): boolean { return this.builtCity && !this.buildQueue.length; }

  private chunkDist(ch: Chunk, x: number, z: number): number { return Math.hypot((ch.cx + 0.5) * PITCH - x, (ch.cz + 0.5) * PITCH - z); }

  // ---------------------------------------------------------------- instancing

  private inst(map: Map<string, Inst>, key: string, cap: number, geo: () => THREE.BufferGeometry): Inst | null {
    let it = map.get(key);
    if (!it) {
      const g = geo();
      if (!g.getAttribute('position')) return null;
      const state = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      state.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aState', state);
      const mesh = new THREE.InstancedMesh(g, this.vehMat, cap);
      mesh.setColorAt(0, tmpC.set(0xffffff));
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.world.scene.add(mesh);
      it = { mesh, state, n: 0 };
      map.set(key, it);
    }
    return it;
  }

  private put(it: Inst, x: number, y: number, z: number, h: number, pitch: number, roll: number, color: number, s0: number, s1: number, s2: number, s3: number, scale = 1): void {
    if (it.n >= it.mesh.instanceMatrix.count) return;
    tmpE.set(pitch, h, roll, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(scale, scale, scale));
    it.mesh.setMatrixAt(it.n, tmpM);
    it.mesh.setColorAt(it.n, tmpC.setHex(color).convertSRGBToLinear());
    it.state.setXYZW(it.n, s0, s1, s2, s3);
    it.n++;
  }

  private begin(map: Map<string, Inst>): void { for (const it of map.values()) it.n = 0; }
  private end(map: Map<string, Inst>): void {
    for (const it of map.values()) {
      it.mesh.count = it.n;
      it.mesh.instanceMatrix.needsUpdate = true;
      if (it.mesh.instanceColor) it.mesh.instanceColor.needsUpdate = true;
      it.state.needsUpdate = true;
    }
  }

  private makeSignals(): void {
    const list = this.city.signals;
    const it = this.inst(new Map(), 'signals', list.length, () => kindGeometry('transport:TrafficLight'));
    if (!it) return;
    this.signals = it;
  }

  // ---------------------------------------------------------------- every frame

  /** Draws the sim (and the job's markers): cars, people, props, lights, camera. */
  sync(sim: Sim, job: Job | null, dt: number, opts: { lights?: boolean; player?: boolean } = {}): void {
    this.time += dt;
    this.lights.time.value = this.time;
    const p = sim.player;
    const nightOn = this.night > 0.5 ? 1 : 0;
    // cars
    this.begin(this.cars);
    const camX = this.camPos.x, camZ = this.camPos.z;
    for (const c of sim.cars) {
      if (c === p && opts.player === false) continue;
      const d = Math.hypot(c.x - camX, c.z - camZ);
      if (d > 160 && c !== p) continue;
      const it = this.inst(this.cars, c.model, c.model.startsWith('transport') ? 8 : c.model === COP_MODEL ? 16 : 30, () => kindGeometry(c.model));
      if (!it) continue;
      const fwd = c.fwd;
      const roll = c.mode === 'free' ? clamp(-c.w * Math.abs(fwd) * 0.006, -0.08, 0.08) : 0;
      const pitch = c.airborne ? clamp(-c.vy * 0.03, -0.3, 0.3) : (c.brakeLight ? 0.02 : 0);
      const dmg = c.hp ? 1 - c.health / c.hp : 0;
      const siren = c.siren || (c.role === 'cop' && c.cop === 'block') ? 1 : 0;
      const hazard = c.hazard && Math.sin(this.time * 9 + c.id) > 0 ? 1 : 0;
      this.put(it, c.x, c.y, c.z, c.h, pitch, roll, c.paint, c.brakeLight || hazard ? 1 : 0, siren, dmg, nightOn);
    }
    this.end(this.cars);
    // people
    this.begin(this.peds);
    for (const ped of sim.peds) {
      if (Math.hypot(ped.x - camX, ped.z - camZ) > 100) continue;
      const female = ped.model === 1;
      let pose: number;
      let tilt = 0;
      const step = Math.floor(ped.frame * 3.2) % 2;
      switch (ped.state) {
        case 'walk': case 'cross': pose = step ? 0 : 2; break;
        case 'run': pose = Math.floor(ped.frame * 5) % 2 ? 1 : 0; break;
        case 'dive': pose = 1; tilt = 0.5; break;
        default: pose = [2, 3, 4][ped.idle];
      }
      const name = POSES[(female ? 5 : 0) + pose];
      const it = this.inst(this.peds, name, 70, () => kindGeometry('people:' + name));
      if (!it) continue;
      this.put(it, ped.x, this.city.offRoad(ped.x, ped.z) ? CURB : 0, ped.z, ped.h, tilt, 0, SHIRTS[ped.shirt], 0, 0, 0, 0);
    }
    this.end(this.peds);
    // props
    this.begin(this.props);
    for (const pr of sim.props) {
      if (pr.hidden || Math.hypot(pr.x - camX, pr.z - camZ) > 100) continue;
      const key = pr.kind === 'cone' ? 'transport:TrafficCone' : pr.kind === 'sign' ? 'transport:TrafficSign' + (1 + (Math.round(pr.x0 + pr.z0) % 3)) : pr.kind;
      const it = this.inst(this.props, key, 140, () => key.includes(':') ? kindGeometry(key) : PROP_GEO[pr.kind]());
      if (!it) continue;
      const y = (this.city.offRoad(pr.x0, pr.z0) && !pr.down ? CURB : 0) + pr.y;
      this.put(it, pr.x, y, pr.z, pr.rot, pr.tilt, 0, 0xffffff, 0, 0, 0, 0);
    }
    for (const s of sim.spikes) {
      const it = this.inst(this.props, 'spike', 8, PROP_GEO.spike);
      if (!it) continue;
      this.put(it, s.x, 0.01, s.z, s.rot, 0, 0, 0xffffff, 0, 0, 0, 0);
      // the strip is long: scale along its length
      tmpM.compose(tmpP.set(s.x, 0.01, s.z), tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), s.rot), tmpS.set(1, 1, s.len));
      it.mesh.setMatrixAt(it.n - 1, tmpM);
    }
    this.end(this.props);
    // traffic lights
    if (this.signals) {
      const it = this.signals;
      it.n = 0;
      const lx = this.camLook.x, lz = this.camLook.z;
      for (const s of this.city.signals) {
        // only the lights round the camera (the far ones are lost in the fog)
        if (Math.abs(s.x - lx) > 120 || Math.abs(s.z - lz) > 120) continue;
        const st = this.city.lightState(s.node, sim.time);
        const v = s.ns ? st.ns : st.ew;
        this.put(it, s.x, CURB, s.z, s.rot, 0, 0, 0xffffff, v, 0, 0, 0);
      }
      it.mesh.count = it.n;
      it.mesh.instanceMatrix.needsUpdate = true;
      it.state.needsUpdate = true;
    }
    // camera, lights, glows
    this.camera(sim, dt);
    this.nightLights(sim, opts.lights !== false);
    this.markersSync(job);
    this.effects(sim, dt);
    this.chunkVisibility();
    this.sky.position.set(this.world.camera.position.x, 0, this.world.camera.position.z);
    this.drawCalls = this.world.renderer.info.render.calls;
  }

  private chunkVisibility(): void {
    const cam = this.world.camera.position;
    const fx = this.camLook.x, fz = this.camLook.z;
    for (const ch of this.chunks) {
      if (ch.built < 2) continue;
      const d = Math.min(this.chunkDist(ch, fx, fz), this.chunkDist(ch, cam.x, cam.z));
      const near = d < 95;
      if (ch.detail) ch.detail.visible = near;
      if (ch.lod) ch.lod.visible = !near && d < 330;
    }
  }

  private nightLights(sim: Sim, on: boolean): void {
    const L0 = this.lights;
    const look = this.camLook;
    L0.setLamps(this.city.lamps, look.x, look.z);
    const p = sim.player;
    // the player's headlights
    if (on && this.night > 0.5) {
      L0.headPos.value.set(p.x + Math.sin(p.h) * 1.8, p.y + 0.8, p.z + Math.cos(p.h) * 1.8, 1);
      L0.headDir.value.set(Math.sin(p.h), -0.12, Math.cos(p.h)).normalize();
    } else L0.headPos.value.w = 0;
    // police beacons: the nearest units with their sirens on
    let k = 0;
    const flash = Math.floor(this.time * 2.6) % 2;
    const pts = L0.points.value, cols = L0.pointColors.value;
    for (const c of sim.cars) {
      if (k >= pts.length - 1) break;
      if (!c.siren || Math.hypot(c.x - look.x, c.z - look.z) > 70) continue;
      pts[k].set(c.x, 2.4, c.z, 14);
      cols[k].setRGB(flash ? 1.4 : 0.1, 0.05, flash ? 0.1 : 1.6);
      k++;
    }
    // a glow from the nearest job marker
    for (; k < pts.length; k++) { pts[k].set(0, -100, 0, 0); cols[k].setRGB(0, 0, 0); }
  }

  private markerList: { x: number; z: number; color: number; scale?: number }[] = [];
  private markersSync(job: Job | null): void {
    const list = this.markerList;
    list.length = 0;
    if (job) for (const m of job.markers) {
      if (m.kind === 'target') continue;
      list.push({ x: m.x, z: m.z, color: MARKER_COLOR[m.kind], scale: m.next ? 0.6 : m.kind === 'garage' || m.kind === 'spray' ? 0.8 : 1 });
    }
    this.markers.sync(list, this.time);
  }

  private effects(sim: Sim, dt: number): void {
    const p = sim.player;
    const g = this.glows;
    g.begin(this.world.camera);
    const look = this.camLook;
    // lamp halos near the camera
    const lamps = this.city.lamps;
    for (let i = 0; i < lamps.length; i += 3) {
      const dx = lamps[i] - look.x, dz = lamps[i + 2] - look.z;
      if (dx * dx + dz * dz > 120 * 120) continue;
      g.add(lamps[i], lamps[i + 1] - 0.3, lamps[i + 2], 3.2, 0xffa850, 0.55 * this.night);
    }
    // car lights
    for (const c of sim.cars) {
      const dx = c.x - look.x, dz = c.z - look.z;
      if (dx * dx + dz * dz > 110 * 110) continue;
      const sh = Math.sin(c.h), ch = Math.cos(c.h), rx = -ch, rz = sh;
      const f = c.len * 0.5, w = c.wid * 0.33;
      if (this.night > 0.5 && !c.disabled) {
        for (const s of [-1, 1]) g.add(c.x + sh * (f + 0.2) + rx * w * s, c.y + 0.6, c.z + ch * (f + 0.2) + rz * w * s, 0.9, 0xfff0d0, 0.55);
        for (const s of [-1, 1]) g.add(c.x - sh * f + rx * w * s, c.y + 0.8, c.z - ch * f + rz * w * s, c.brakeLight ? 1.6 : 0.9, 0xff2010, c.brakeLight ? 0.9 : 0.4);
      }
      if (c.siren || (c.role === 'cop' && c.cop === 'block')) {
        const on = Math.floor(this.time * 2.6 + c.id * 0.3) % 2;
        g.add(c.x + rx * 0.4, c.y + 1.5, c.z + rz * 0.4, 3.4, on ? 0xff2020 : 0x2040ff, 0.95);
        g.add(c.x - rx * 0.4, c.y + 1.5, c.z - rz * 0.4, 2.2, on ? 0x2040ff : 0xff2020, 0.5);
      }
    }
    g.end();
    // tyre smoke and marks from the player; damage smoke and fire from anyone
    const fwd = p.fwd;
    if (p.skid > 0.5 && !p.airborne && p.speedAbs > 2.5) {
      const sh = Math.sin(p.h), ch = Math.cos(p.h);
      const k = clamp(p.skid / 6, 0, 1);
      for (const s of [-1, 1]) {
        const wx = p.x - sh * 1.3 - ch * 0.8 * s, wz = p.z - ch * 1.3 + sh * 0.8 * s;
        this.skids.mark(p.id * 4 + (s > 0 ? 1 : 0), wx, p.y, wz, 0.4 + k);
        if (Math.random() < 0.45 * k + 0.05) this.smoke.emit({ x: wx, y: p.y + 0.3, z: wz, vx: (Math.random() - 0.5) * 1.5, vy: 0.8, vz: (Math.random() - 0.5) * 1.5, life: 1.2, size: 1.0, grow: 3.2, alpha: 0.3 * k + 0.08, color: 0xb8b8c4, drag: 1.5 });
      }
    }
    if (p.spikesT > 0 && Math.abs(fwd) > 4 && Math.random() < 0.5) this.sparks.emit({ x: p.x, y: 0.2, z: p.z, vx: (Math.random() - 0.5) * 4, vy: 2, vz: (Math.random() - 0.5) * 4, life: 0.3, size: 0.25, color: 0xffc040, gravity: 9 });
    if (p.nitroT > 0) {
      const sh = Math.sin(p.h), ch = Math.cos(p.h);
      this.sparks.emit({ x: p.x - sh * 2.3, y: p.y + 0.45, z: p.z - ch * 2.3, vx: -sh * 6, vy: 0.2, vz: -ch * 6, life: 0.25, size: 0.7, grow: 0.2, color: 0x4aa8ff });
    }
    for (const c of sim.cars) {
      if (c.smoke <= 0 || Math.random() > 0.25 + c.smoke * 0.2) continue;
      const dx = c.x - look.x, dz = c.z - look.z;
      if (dx * dx + dz * dz > 90 * 90) continue;
      const hx = c.x + Math.sin(c.h) * c.len * 0.35, hz = c.z + Math.cos(c.h) * c.len * 0.35;
      this.smoke.emit({ x: hx, y: c.y + 1.1, z: hz, vx: (Math.random() - 0.5), vy: 1.6 + c.smoke * 0.4, vz: (Math.random() - 0.5), life: 1.8, size: 0.8, grow: 3 + c.smoke, alpha: 0.3 + c.smoke * 0.12, color: c.smoke >= 2 ? 0x2a2a30 : 0x8a8a94, drag: 0.5 });
      if (c.smoke >= 3) this.sparks.emit({ x: hx, y: c.y + 1, z: hz, vy: 2.2, life: 0.5, size: 0.9, grow: 0.3, color: 0xff6a1a, drag: 1 });
    }
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i];
      f.t -= dt;
      if (f.t <= 0) { this.fountains.splice(i, 1); continue; }
      for (let k = 0; k < 3; k++) this.smoke.emit({ x: f.x + (Math.random() - 0.5) * 0.3, y: 0.4, z: f.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 1.6, vy: 7 + Math.random() * 3, vz: (Math.random() - 0.5) * 1.6, life: 1.4, size: 0.35, grow: 1.2, alpha: 0.55 * Math.min(1, f.t), color: 0xa8d8ff, gravity: 9.8, drag: 0.2 });
    }
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.skids.update(dt);
  }

  // ---------------------------------------------------------------- events

  handle(ev: SimEvent, sim: Sim): void {
    switch (ev.type) {
      case 'crash': {
        const k = clamp(ev.impact / 18, 0.15, 1);
        this.shake(k);
        for (let i = 0; i < 6 + k * 14; i++) this.sparks.emit({ x: ev.x, y: 0.7, z: ev.z, vx: (Math.random() - 0.5) * 9, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 9, life: 0.4 + Math.random() * 0.3, size: 0.18, color: Math.random() < 0.5 ? 0xffd070 : 0xffffff, gravity: 14, drag: 1 });
        for (let i = 0; i < 3 + k * 5; i++) this.smoke.emit({ x: ev.x, y: 0.6, z: ev.z, vx: (Math.random() - 0.5) * 3, vy: 1, vz: (Math.random() - 0.5) * 3, life: 1.2, size: 1, grow: 3.5, alpha: 0.35, color: 0x9a9aa4, drag: 2 });
        break;
      }
      case 'prop':
        for (let i = 0; i < 6; i++) this.sparks.emit({ x: ev.x, y: 0.5, z: ev.z, vx: (Math.random() - 0.5) * 5, vy: 3, vz: (Math.random() - 0.5) * 5, life: 0.4, size: 0.15, color: 0xffffff, gravity: 12 });
        // a knocked hydrant spouts water for a while
        if (ev.kind === 'hydrant') this.fountains.push({ x: ev.x, z: ev.z, t: 7 });
        this.shake(0.12);
        break;
      case 'takedown':
        this.shake(0.5);
        for (let i = 0; i < 16; i++) this.smoke.emit({ x: ev.x, y: 1, z: ev.z, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, life: 1.8, size: 1.5, grow: 5, alpha: 0.45, color: 0x3a3a40, drag: 1.2 });
        break;
      case 'wrecked': {
        const p = sim.player;
        this.shake(1);
        for (let i = 0; i < 30; i++) this.smoke.emit({ x: p.x, y: 1, z: p.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 2.4, size: 2, grow: 7, alpha: 0.55, color: 0x2a2a30, drag: 1 });
        for (let i = 0; i < 24; i++) this.sparks.emit({ x: p.x, y: 1, z: p.z, vx: (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 8, life: 0.8, size: 0.8, grow: 0.2, color: 0xff7a1a, gravity: 6 });
        break;
      }
      case 'land':
        if (ev.impact > 6) { this.shake(clamp(ev.impact / 20, 0.1, 0.6)); const p = sim.player; for (let i = 0; i < 10; i++) this.smoke.emit({ x: p.x + (Math.random() - 0.5) * 2, y: 0.3, z: p.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 4, vy: 0.5, vz: (Math.random() - 0.5) * 4, life: 1, size: 1, grow: 3, alpha: 0.3, color: 0xa0a0a8, drag: 2 }); }
        break;
      case 'popped': this.shake(0.3); break;
      case 'nitro': this.fovKick = 1; break;
      default: break;
    }
  }

  shake(k: number): void { this.shakeK = Math.max(this.shakeK, k); this.shakeT = 0.4; }

  // ---------------------------------------------------------------- camera

  private camera(sim: Sim, dt: number): void {
    const cam = this.world.camera;
    const p = sim.player;
    if (this.debugCam) {
      cam.position.set(...this.debugCam.pos);
      cam.lookAt(...this.debugCam.look);
      this.camLook.set(...this.debugCam.look);
      this.camPos.copy(cam.position);
      return;
    }
    const sh = Math.sin(p.h), ch = Math.cos(p.h);
    const sp = p.speedAbs;
    let want: THREE.Vector3, look: THREE.Vector3;
    let fov = this.baseFov + clamp(sp / 45, 0, 1) * 6 + this.fovKick * 12;
    if (this.replay) {
      const r = this.replay;
      const a = r.h + (r.shot === 0 ? 2.2 : r.shot === 1 ? -0.9 : 3.14) + r.t * 0.12;
      const d = r.shot === 2 ? 4.5 : 9;
      want = tmpV.set(r.x + Math.sin(a) * d, r.y + (r.shot === 1 ? 1.2 : 2.6), r.z + Math.cos(a) * d).clone();
      look = new THREE.Vector3(r.x, r.y + 0.8, r.z);
      cam.position.copy(want);
      fov = 48;
    } else if (this.opt.menu || this.orbit) {
      // the menu: a slow drift round the car under the street lamp
      this.menuT += dt;
      // a slow swing round the car's front quarter, along the street (never into the houses)
      const a = p.h + 0.55 + Math.sin(this.menuT * 0.12) * 0.75;
      const r = 8.5 + Math.sin(this.menuT * 0.07) * 1.2;
      want = new THREE.Vector3(p.x + Math.sin(a) * r, 2.2 + Math.sin(this.menuT * 0.2) * 0.5, p.z + Math.cos(a) * r);
      look = new THREE.Vector3(p.x - Math.sin(p.h) * 1.5, 1.4, p.z - Math.cos(p.h) * 1.5);
      if (this.opt.menu) {
        // the menu: the car on the right, above the how-to card and clear of PLAY and the switches
        want.y = 3.4;
        const dx = look.x - want.x, dz = look.z - want.z, n = Math.hypot(dx, dz) || 1;
        look.x += (dz / n) * 4.6; look.z += (-dx / n) * 4.6;
        look.y = 0.2;
      }
      if (this.menuT < 0.1) cam.position.copy(want); else cam.position.lerp(want, Math.min(1, dt * 2));
    } else if (this.cam === 'bumper') {
      want = new THREE.Vector3(p.x + sh * 0.6, p.y + 1.25, p.z + ch * 0.6);
      look = new THREE.Vector3(p.x + sh * 30, p.y + 1.0, p.z + ch * 30);
      cam.position.copy(want);
    } else {
      const far = this.cam === 'far';
      const back = (far ? 15 : 7.2) + clamp(sp / 40, 0, 1) * (far ? 3 : 2.2);
      const up = far ? 9 : 3.1;
      // look along the velocity a little when sliding
      const vh = sp > 3 ? Math.atan2(p.vx, p.vz) : p.h;
      let dh = vh - p.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const hh = p.h + clamp(dh, -0.6, 0.6) * 0.5 * (p.fwd >= 0 ? 1 : 0);
      want = new THREE.Vector3(p.x - Math.sin(hh) * back, p.y + up, p.z - Math.cos(hh) * back);
      look = new THREE.Vector3(p.x + sh * 4, p.y + (far ? 0.5 : 1.3), p.z + ch * 4);
      cam.position.lerp(want, 1 - Math.exp(-dt * (far ? 4 : 6)));
      // never inside a building: pull in along the line to the car if blocked
      if (!this.city.los(p.x, p.z, cam.position.x, cam.position.z)) cam.position.lerp(new THREE.Vector3(p.x, cam.position.y, p.z), 0.25);
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 0.8);
    if (p.nitroT > 0) this.fovKick = Math.max(this.fovKick, 0.7);
    this.camLook.lerp(look, this.replay ? 1 : 1 - Math.exp(-dt * 10));
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeK * (this.shakeT / 0.4) * 0.45;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.position.z += (Math.random() - 0.5) * k;
      if (this.shakeT <= 0) this.shakeK = 0;
    }
    cam.lookAt(this.camLook);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 5);
      cam.updateProjectionMatrix();
      this.smoke.setFov(cam.fov); this.sparks.setFov(cam.fov);
    }
    this.camPos.copy(cam.position);
  }

  /** Jumps the camera to its place behind the car (start of a job, after a teleport). */
  snap(sim: Sim): void {
    const p = sim.player;
    const cam = this.world.camera;
    const back = this.cam === 'far' ? 15 : 7.2, up = this.cam === 'far' ? 9 : 3.1;
    cam.position.set(p.x - Math.sin(p.h) * back, p.y + up, p.z - Math.cos(p.h) * back);
    this.camLook.set(p.x + Math.sin(p.h) * 4, 1.3, p.z + Math.cos(p.h) * 4);
    cam.lookAt(this.camLook);
    this.camPos.copy(cam.position);
  }

  /** Screen point (game px) of a world point. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    return this.world.toScreen(tmpV.set(x, y, z));
  }

  // ---------------------------------------------------------------- the sky

  private makeSky(fog: number): THREE.Mesh {
    const g = new THREE.SphereGeometry(380, 24, 12);
    const pos = g.getAttribute('position');
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    void fog;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10;
    return m;
  }

  private paintSky(fog: number): void {
    const g = this.sky.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color') as THREE.BufferAttribute;
    const n = this.night;
    const top = new THREE.Color(n > 0.8 ? 0x05061a : n > 0.6 ? 0x1a1040 : 0x2a2a6a), mid = new THREE.Color(fog), glow = new THREE.Color(n > 0.8 ? 0x3a1a4a : n > 0.6 ? 0xc0506a : 0xff8a4a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 380;
      if (y > 0.15) c.copy(mid).lerp(top, Math.min(1, (y - 0.15) / 0.6)); else c.copy(glow).lerp(mid, clamp((y + 0.05) / 0.2, 0, 1) * 0.7 + 0.3);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** Test hook: how many detailed chunks are built and how many triangles the city holds. */
  stats(): { chunks: number; tris: number; calls: number; tex: number; geo: number } {
    let tris = 0, chunks = 0;
    for (const ch of this.chunks) {
      if (ch.detail) { chunks++; tris += (ch.detail.geometry.index?.count ?? 0) / 3; }
    }
    const info = this.world.renderer.info;
    return { chunks, tris, calls: info.render.calls, tex: info.memory.textures, geo: info.memory.geometries };
  }
}

export { piece };
