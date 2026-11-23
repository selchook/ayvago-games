// City generator: CityView draws a plan into a three.js scene and streams it round a focus
// point (the player). Chunks within `near` metres are built (merged geometry, one draw call
// each, built a few per frame and cached on the CPU): in full within `detail` metres, without
// the small props further out. Everything else is the far LOD (every building as a box, in big
// tiles) over a ground map draped on the terrain, under a sky dome, with a water plane. Repeated
// props are InstancedMeshes refilled when the chunk set changes; with a building kit loaded, the
// kit buildings near the focus are assembled from its pieces (KitLayer). A chunk that leaves
// frees its GPU geometry at once, so streaming back and forth keeps GPU memory flat.
//
// The clock: setTime(hours), timeScale (game hours per second, advanced by update()), the phase
// (dawn, day, dusk, night) and onPhase. The sky, sun and moon, fog, lights, sea, street lamps,
// lit windows and signs follow it through uniforms: no shader recompiles and no extra draw
// calls at night.
//
// Works in a plain three.js page (the preview tool) and inside a World3D (pass world.scene;
// World3D frees what is left in its scene on shutdown, and dispose() is safe to call too).
import * as THREE from 'three';
import { CityBuilder, INSTANCED, TERRAIN_RANGE, type InstKind, type ChunkData } from './build';
import { toGeometry, type GeoArrays, arraysBytes } from './geobuf';
import { makeUniforms, cityMaterial, waterMaterial, skyMaterial, haloMaterial, beamMaterial, K, type CityUniforms } from './materials';
import { LOOKS, type Look } from './look';
import type { LookId } from './styles';
import type { CityPlan, Building, ParkingSpot } from './types';
import { STYLES } from './styles';
import { obbYaw, obbCorners } from './geom';
import { makeDaylight, daylightAt, type DayPhase, type Daylight } from './daylight';
import { KitLayer, type CityKit } from './kitview';

void TERRAIN_RANGE;

/** The hour each look stands for. */
export const LOOK_HOURS: Record<LookId, number> = { day: 12.5, golden: 18.5, night: 22.5, overcast: 13 };

export interface ChunkEvent {
  type: 'load' | 'unload';
  key: number;
  /** The chunk's square: corner and side, metres. */
  x0: number; z0: number; size: number;
  /** Parking spots inside it (indices into plan.parking; `taken` ones hold a placeholder car). */
  parking: number[];
}

export interface CityViewOptions {
  look?: LookId;
  /** Time of day in hours (default from the look). */
  time?: number;
  /** Game hours per real second (default 0: the clock stands still). */
  timeScale?: number;
  /** Chunk size in metres (default 128). */
  chunk?: number;
  /** Radius of the built chunks round the focus (default 320). */
  near?: number;
  /** Radius of full detail (small props, fences, railings) inside `near` (default 220). */
  detail?: number;
  /** Draw the far LOD and ground map beyond `near` (default true). */
  lod?: boolean;
  props?: boolean;
  /** Placeholder parked cars (default true). A game with its own vehicles turns them off and fills plan.parking itself. */
  cars?: boolean;
  /** A sun with shadows (default true). */
  shadows?: boolean;
  /** Half size of the sun's shadow box (default 110 m). */
  shadowExtent?: number;
  /** Add a sun and sky light to the scene (default true). */
  lights?: boolean;
  sky?: boolean;
  fog?: boolean;
  /** CPU time per update spent building chunks, ms (default 8; at least one chunk). */
  budget?: number;
  /** Built chunks kept on the CPU after they leave (default 96). */
  cache?: number;
  /** The building kit (CityKit.from(kit.glb)); without it every building is procedural. */
  kit?: CityKit | null;
  /** Kit buildings within this distance of the focus are assembled from the kit (default 110). */
  kitRadius?: number;
  /** Triangles the kit may draw (default 110 000): nearest buildings first, the radius shrinks to fit. */
  kitBudget?: number;
  /** Called when a chunk is loaded or dropped (spawn and remove a game's own actors there). */
  onChunk?: (e: ChunkEvent) => void;
  /** Called when the phase of the day changes. */
  onPhase?: (phase: DayPhase, previous: DayPhase) => void;
  /**
   * Hybrid mode: return a model (base at y = 0, facing +z) to stand on a building's lot
   * instead of its generated building; the view fits it to the footprint.
   */
  replace?: (b: Building) => THREE.Object3D | null;
}

interface Loaded { data: ChunkData; mesh: THREE.Mesh | null }

export interface CityViewStats {
  chunks: number; queued: number; cached: number; built: number;
  lastBuildMs: number; avgBuildMs: number; nearTris: number; farTris: number; cacheMB: number;
  /** Kit buildings drawn, kit instances and their triangles. */
  kitBuildings: number; kitInstances: number; kitTris: number;
  hours: number; phase: DayPhase;
}

type Opts = Required<Omit<CityViewOptions, 'replace' | 'look' | 'time' | 'kit' | 'onChunk' | 'onPhase'>>;

// scratch objects for the per-frame code (no allocation per frame)
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), SV = new THREE.Vector3(), PV = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), COL = new THREE.Color();

export class CityView {
  readonly group = new THREE.Group();
  readonly builder: CityBuilder;
  readonly uniforms: CityUniforms = makeUniforms();
  readonly materials: { city: THREE.MeshLambertMaterial; water: THREE.MeshLambertMaterial; sky: THREE.ShaderMaterial; halo: THREE.ShaderMaterial; beam: THREE.ShaderMaterial };
  sun: THREE.DirectionalLight | null = null;
  hemi: THREE.HemisphereLight | null = null;
  /** The look last set (setLook), for its name; the clock drives the actual light. */
  look: Look;
  /** Game hours per real second; update() moves the clock (0: it stands still). */
  timeScale: number;
  /** Called when the phase of the day changes. */
  onPhase: ((phase: DayPhase, previous: DayPhase) => void) | null;
  onChunk: ((e: ChunkEvent) => void) | null;
  readonly kit: KitLayer | null = null;
  private opts: Opts;
  private loaded = new Map<number, Loaded>();
  private cache = new Map<number, ChunkData>();
  private queue: number[] = [];
  private far: THREE.Mesh[] = [];
  private farTris = 0;
  private ground: THREE.Mesh | null = null;
  private groundFar: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private extras: THREE.Mesh | null = null;
  private inst = new Map<InstKind, THREE.InstancedMesh>();
  /** Trees in the sun's shadow box: a second mesh per tree kind that casts shadows. */
  private instNear = new Map<InstKind, THREE.InstancedMesh>();
  private halos: THREE.InstancedMesh | null = null;
  private instDirty = true;
  private textures: THREE.Texture[] = [];
  private overlays = new Map<string, THREE.Object3D>();
  private landmarks: THREE.Object3D[] = [];
  private built = 0;
  private buildMs = 0;
  private lastBuildMs = 0;
  private focus = new THREE.Vector3();
  private refillAt = new THREE.Vector3(1e9, 0, 1e9);
  private clock = 0;
  private hours = 12;
  private weather = 0;
  private neon = 1;
  private daylight: Daylight = makeDaylight();
  private phaseNow: DayPhase = 'day';
  private lightDirty = true;
  private fog: THREE.Fog | null = null;
  private fogScale = 1;
  private parkingByChunk = new Map<number, number[]>();

  constructor(readonly plan: CityPlan, readonly scene: THREE.Scene, options: CityViewOptions = {}) {
    this.opts = {
      chunk: options.chunk ?? 128, near: options.near ?? 320, detail: options.detail ?? 220, lod: options.lod ?? true, props: options.props ?? true,
      cars: options.cars ?? true, shadows: options.shadows ?? true, shadowExtent: options.shadowExtent ?? 110, lights: options.lights ?? true,
      sky: options.sky ?? true, fog: options.fog ?? true, budget: options.budget ?? 8, cache: options.cache ?? 96, kitRadius: options.kitRadius ?? 110, kitBudget: options.kitBudget ?? 110000,
      timeScale: options.timeScale ?? 0,
    };
    this.timeScale = this.opts.timeScale;
    this.onPhase = options.onPhase ?? null;
    this.onChunk = options.onChunk ?? null;
    const lookId = options.look ?? STYLES[plan.style].look;
    this.look = LOOKS[lookId];
    this.hours = options.time ?? LOOK_HOURS[lookId];
    this.weather = lookId === 'overcast' ? 1 : 0;
    this.neon = plan.style === 'metropolis' ? 1.35 : 1;
    this.builder = new CityBuilder(plan, this.opts.chunk);
    this.builder.kit = !!options.kit;
    const u = this.uniforms;
    this.materials = { city: cityMaterial(u), water: waterMaterial(u), sky: skyMaterial(u), halo: haloMaterial(u), beam: beamMaterial(u) };
    this.group.name = 'city';
    scene.add(this.group);
    // maps
    const rect = this.builder.mapRect();
    u.uMapRect.value.set(rect.x0, rect.z0, rect.size);
    const gm = this.builder.groundMap(1024);
    const gt = new THREE.DataTexture(gm.data as Uint8Array<ArrayBuffer>, gm.w, gm.w, THREE.RGBAFormat);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.magFilter = THREE.LinearFilter; gt.minFilter = THREE.LinearMipmapLinearFilter; gt.generateMipmaps = true;
    gt.wrapS = gt.wrapT = THREE.ClampToEdgeWrapping;
    gt.needsUpdate = true;
    const lm = this.builder.lightMap(1024);
    const lt = new THREE.DataTexture(lm.data as Uint8Array<ArrayBuffer>, lm.w, lm.w, THREE.RGBAFormat);
    lt.magFilter = THREE.LinearFilter; lt.minFilter = THREE.LinearFilter;
    lt.wrapS = lt.wrapT = THREE.ClampToEdgeWrapping;
    lt.needsUpdate = true;
    u.uGround.value = gt; u.uLight.value = lt;
    this.textures.push(gt, lt);
    for (const [i, s] of plan.parking.entries()) {
      const k = this.builder.key(Math.floor(s.x / this.opts.chunk), Math.floor(s.z / this.opts.chunk));
      let l = this.parkingByChunk.get(k);
      if (!l) this.parkingByChunk.set(k, (l = []));
      l.push(i);
    }
    this.makeStatic();
    this.makeInstanced();
    if (options.kit) this.kit = new KitLayer(options.kit, plan, this.group, u, (b) => this.builder.base(b), { radius: this.opts.kitRadius, budget: this.opts.kitBudget, propRadius: 140 });
    if (options.replace) this.makeLandmarks(options.replace);
    if (this.opts.fog) { this.fog = new THREE.Fog(0xffffff, 100, 1000); scene.fog = this.fog; }
    this.applyDaylight();
  }

  // ---------------------------------------------------------------- setup

  private mesh(geo: GeoArrays, mat: THREE.Material, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(toGeometry(geo), mat);
    m.castShadow = shadows; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
    return m;
  }

  private makeStatic(): void {
    const S = this.plan.size;
    const h = this.builder.h;
    // far LOD tiles
    for (const t of this.builder.far(512)) {
      const m = this.mesh(t.geo, this.materials.city, false);
      m.name = 'far:' + t.key;
      this.far.push(m);
      this.farTris += t.tris;
    }
    // the ground map: a grid over the map's rectangle draped on the terrain, below the near
    // chunks, and a skirt round it out to the horizon
    const rect = this.builder.mapRect();
    this.ground = this.mesh(groundGrid(rect.x0, rect.z0, rect.size, 64, -0.3, K.ground, 0xffffff, h), this.materials.city, false);
    this.ground.name = 'ground';
    this.groundFar = this.mesh(groundSkirt(rect.x0, rect.z0, rect.size, 64, -0.32, STYLES[this.plan.style].terrain, h), this.materials.city, false);
    this.groundFar.name = 'ground-far';
    // water
    const wg = new THREE.PlaneGeometry(S * 8, S * 8);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, this.materials.water);
    this.water.position.set(S / 2, this.plan.water.level, S / 2);
    this.water.receiveShadow = true;
    this.water.name = 'water';
    this.group.add(this.water);
    // a ring of hills far out
    const hills = this.mesh(this.builder.hills(), this.materials.city, false);
    hills.name = 'hills';
    this.far.push(hills);
    // beaches
    const ex = this.builder.extras();
    if (ex.position.length) { this.extras = this.mesh(ex, this.materials.city, false); this.extras.name = 'beaches'; }
    // the lighthouse's turning beams
    const lh = this.plan.lighthouse;
    if (lh) {
      const pos: number[] = [], ab: number[] = [];
      const L = 170, y = 22.9;
      for (const dir of [1, -1]) for (const [ax, ay] of [[0, 1], [1, 0]]) {
        // a quad from the lantern out along x (dir), widening; crossed vertical and flat
        const q = (t: number, side: number) => { const w = 0.6 + t * 16; pos.push(dir * (1.6 + t * L), y + side * w * ax, side * w * ay); ab.push(t, side); };
        q(0, -1); q(1, -1); q(1, 1); q(0, -1); q(1, 1); q(0, 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aB', new THREE.Float32BufferAttribute(ab, 2));
      const beam = new THREE.Mesh(g, this.materials.beam);
      beam.position.set(lh.x, lh.y, lh.z);
      beam.frustumCulled = false;
      beam.renderOrder = 11;
      beam.name = 'lighthouse-beam';
      this.group.add(beam);
    }
    // sky
    if (this.opts.sky) {
      this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), this.materials.sky);
      this.skyMesh.frustumCulled = false;
      this.skyMesh.renderOrder = -10;
      this.skyMesh.name = 'sky';
      this.group.add(this.skyMesh);
    }
    if (this.opts.lights) {
      this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
      this.sun = new THREE.DirectionalLight(0xffffff, 2);
      const e = this.opts.shadowExtent;
      Object.assign(this.sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 900 });
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
      // shadows stay on through the night (the moon casts them): switching would recompile shaders
      this.sun.castShadow = this.opts.shadows;
      this.group.add(this.hemi, this.sun, this.sun.target);
    }
  }

  private makeInstanced(): void {
    const counts = new Map<string, number>();
    for (const q of this.plan.props) counts.set(q.kind, (counts.get(q.kind) ?? 0) + 1);
    for (const kind of INSTANCED) {
      const cap = counts.get(kind) ?? 0;
      if (!cap) continue;
      const geo = toGeometry(propGeo(kind));
      const m = new THREE.InstancedMesh(geo, this.materials.city, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.name = 'props:' + kind;
      this.group.add(m);
      this.inst.set(kind, m);
      // only the trees near the focus throw shadows (the rest is small, or far from the sun's box)
      if (kind === 'tree' || kind === 'palm' || kind === 'conifer') {
        const n = new THREE.InstancedMesh(geo, this.materials.city, cap);
        n.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        n.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        n.count = 0;
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
        n.name = 'props-near:' + kind;
        this.group.add(n);
        this.instNear.set(kind, n);
      }
    }
    const lamps = counts.get('lamp') ?? 0;
    if (lamps) {
      this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), this.materials.halo, lamps);
      this.halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.halos.count = 0;
      this.halos.frustumCulled = false;
      this.halos.renderOrder = 10;
      this.halos.name = 'halos';
      this.group.add(this.halos);
    }
  }

  private makeLandmarks(replace: (b: Building) => THREE.Object3D | null): void {
    const skip = new Set<number>();
    for (const b of this.plan.buildings) {
      if (!b.landmark && b.type !== 'tower') continue;
      const obj = replace(b);
      if (!obj) continue;
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const fit = Math.min((b.obb.hw * 2) / Math.max(0.01, size.x), (b.obb.hd * 2) / Math.max(0.01, size.z));
      const wrap = new THREE.Group();
      obj.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
      wrap.add(obj);
      wrap.scale.setScalar(fit);
      wrap.position.set(b.obb.x, this.builder.base(b) + 0.15, b.obb.z);
      wrap.rotation.y = obbYaw(b.obb) + Math.PI;
      this.group.add(wrap);
      this.landmarks.push(wrap);
      skip.add(b.id);
    }
    this.builder.skip = skip;
  }

  // ---------------------------------------------------------------- per frame

  /**
   * Moves the clock, streams chunks round `focus`, refills the props and the kit, and moves the
   * sky, the sun's shadow box and the shader clock along. Call once per frame before rendering.
   */
  update(focus: THREE.Vector3, camera: THREE.Camera, dt = 1 / 60): void {
    this.clock += dt;
    this.uniforms.uTime.value = this.clock;
    if (this.timeScale) { this.hours = (this.hours + dt * this.timeScale) % 24; this.lightDirty = true; }
    if (this.lightDirty) this.applyDaylight();
    this.focus.copy(focus);
    this.uniforms.uFocus.value.copy(focus);
    this.stream();
    // props have shorter radii than the chunks: refill as the focus moves on
    if (this.instDirty || this.refillAt.distanceToSquared(focus) > 24 * 24) this.refillInstances();
    if (this.kit && this.opts.props !== undefined) this.kit.update(focus, camera);
    if (this.skyMesh) this.skyMesh.position.copy(camera.position);
    if (this.sun) {
      const d = this.daylight.lightDir;
      const y = this.builder.h(focus.x, focus.z);
      this.sun.target.position.set(focus.x, y, focus.z);
      this.sun.position.set(focus.x + d.x * 400, y + d.y * 400, focus.z + d.z * 400);
      this.sun.target.updateMatrixWorld();
    }
  }

  private chunkDist(key: number): number {
    const c = this.opts.chunk;
    const cx = Math.floor(key / 1024) - 512, cz = (key % 1024) - 512;
    const dx = Math.max(cx * c - this.focus.x, 0, this.focus.x - (cx + 1) * c);
    const dz = Math.max(cz * c - this.focus.z, 0, this.focus.z - (cz + 1) * c);
    return Math.hypot(dx, dz);
  }

  /** The detail level a chunk should have (with a margin, so a chunk on the edge does not flip). */
  private lodFor(key: number, current = -1): number {
    const d = this.chunkDist(key), D = this.opts.detail;
    if (current === 0 && d < D + 24) return 0;
    if (current === 1 && d > D - 24) return 1;
    return d <= D ? 0 : 1;
  }

  private stream(): void {
    const near = this.opts.near, c = this.opts.chunk;
    // leave: chunks well outside the radius
    for (const [key, l] of this.loaded) {
      if (this.chunkDist(key) > near + c * 0.5) this.unload(key, l);
    }
    // wanted chunks not loaded yet (or at the wrong level), nearest first
    const want: number[] = [];
    const r = Math.ceil(near / c) + 1;
    const fx = Math.floor(this.focus.x / c), fz = Math.floor(this.focus.z / c);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const key = this.builder.key(fx + i, fz + j);
      if (!this.builder.has(key)) continue;
      const l = this.loaded.get(key);
      if (l && l.data.lod === this.lodFor(key, l.data.lod)) continue;
      if (this.chunkDist(key) <= near) want.push(key);
    }
    want.sort((a, b) => this.chunkDist(a) - this.chunkDist(b));
    this.queue = want;
    const t0 = performance.now();
    let n = 0;
    while (this.queue.length && (n === 0 || performance.now() - t0 < this.opts.budget)) {
      this.load(this.queue.shift()!);
      n++;
    }
    // only chunks inside the sun's shadow box cast shadows
    const reach = this.opts.shadowExtent + c * 0.25;
    for (const [key, l] of this.loaded) if (l.mesh) l.mesh.castShadow = this.chunkDist(key) < reach;
    // far boxes give way only where the near chunks are complete
    let missing = near;
    for (const k of this.queue) if (!this.loaded.has(k)) { missing = this.chunkDist(k); break; }
    this.uniforms.uNearR.value = this.opts.lod ? Math.max(0, Math.min(near, missing) - 10) : 1e6;
  }

  private load(key: number): void {
    const prev = this.loaded.get(key);
    const lod = this.lodFor(key, prev?.data.lod ?? -1);
    const ck = key * 2 + lod;
    let data = this.cache.get(ck);
    if (data) this.cache.delete(ck);
    else {
      data = this.builder.build(key, { props: this.opts.props, lod });
      this.built++;
      this.buildMs += data.ms;
      this.lastBuildMs = data.ms;
    }
    if (prev) this.drop(key, prev, false);
    const mesh = data.geo.position.length ? this.mesh(data.geo, this.materials.city, true) : null;
    if (mesh) {
      mesh.name = 'chunk:' + key;
      // the shadow pass draws only the casters at the front of the buffer (not the ground)
      if (data.casterTris < data.tris) {
        const g = mesh.geometry, n = data.casterTris * 3;
        mesh.onBeforeShadow = () => { g.drawRange.count = n; };
        mesh.onAfterShadow = () => { g.drawRange.count = Infinity; };
      }
    }
    this.loaded.set(key, { data, mesh });
    this.instDirty = true;
    this.kitProps();
    if (!prev) this.emit('load', key);
  }

  private unload(key: number, l: Loaded): void {
    this.drop(key, l, true);
    this.kitProps();
    this.emit('unload', key);
  }

  /** Frees a chunk's GPU geometry and keeps its arrays on the CPU for a quick return. */
  private drop(key: number, l: Loaded, remove: boolean): void {
    if (l.mesh) {
      this.group.remove(l.mesh);
      l.mesh.geometry.dispose();
    }
    if (remove) this.loaded.delete(key);
    // keep the CPU arrays (the BufferAttributes reference them; three.js no longer does)
    this.cache.set(key * 2 + l.data.lod, l.data);
    while (this.cache.size > this.opts.cache) this.cache.delete(this.cache.keys().next().value as number);
    this.instDirty = true;
  }

  private kitProps(): void {
    if (!this.kit) return;
    this.kit.props = [];
    for (const l of this.loaded.values()) if (l.data.kitProps.length) this.kit.props.push(l.data.kitProps);
    this.kit.invalidate();
  }

  private emit(type: 'load' | 'unload', key: number): void {
    if (!this.onChunk) return;
    const c = this.opts.chunk;
    this.onChunk({ type, key, x0: (Math.floor(key / 1024) - 512) * c, z0: ((key % 1024) - 512) * c, size: c, parking: this.parkingByChunk.get(key) ?? [] });
  }

  private refillInstances(): void {
    this.instDirty = false;
    this.refillAt.copy(this.focus);
    const sh = this.opts.shadowExtent + 12, fx = this.focus.x, fz = this.focus.z;
    for (const [kind, mesh] of this.inst) {
      let n = 0, nn = 0;
      const near = this.instNear.get(kind) ?? null;
      const far = PROP_RADIUS[kind] ?? 260;
      const on = this.opts.props && (kind !== 'car' || this.opts.cars);
      if (on) for (const [key, l] of this.loaded) {
        const rec = l.data.inst[kind];
        if (!rec || this.chunkDist(key) > far) continue;
        for (let i = 0; i < rec.length; i += 8) {
          // trees inside the shadow box go to the shadow-casting mesh
          const inBox = near && Math.abs(rec[i] - fx) < sh && Math.abs(rec[i + 2] - fz) < sh;
          const m = inBox ? near : mesh;
          const j = inBox ? nn : n;
          if (j >= m.instanceMatrix.count) continue;
          PV.set(rec[i], rec[i + 1], rec[i + 2]);
          Q.setFromAxisAngle(UP, rec[i + 3]);
          SV.setScalar(rec[i + 4]);
          m.setMatrixAt(j, M4.compose(PV, Q, SV));
          m.setColorAt(j, COL.setRGB(rec[i + 5], rec[i + 6], rec[i + 7]));
          if (inBox) nn++; else n++;
        }
      }
      for (const [m, c] of [[mesh, n], [near, nn]] as const) {
        if (!m) continue;
        m.count = c;
        m.visible = c > 0;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
    if (this.halos) {
      let n = 0;
      if (this.opts.props) for (const l of this.loaded.values()) {
        const h = l.data.halos;
        for (let i = 0; i < h.length; i += 3) {
          if (n >= this.halos.instanceMatrix.count) break;
          this.halos.setMatrixAt(n++, M4.makeTranslation(h[i], h[i + 1], h[i + 2]));
        }
      }
      this.halos.count = n;
      this.halos.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- the clock

  /** Pushes the daylight at the current hour into the uniforms, lights and fog. */
  private applyDaylight(): void {
    this.lightDirty = false;
    const d = daylightAt(this.hours, this.daylight, this.weather, this.neon);
    const u = this.uniforms;
    u.uNight.value = d.night;
    u.uNeon.value = d.neon;
    u.uZenith.value.copy(d.zenith);
    u.uHorizon.value.copy(d.horizon);
    u.uSunDir.value.copy(d.sunDir);
    u.uSunCol.value.copy(d.sun);
    u.uWater.value.copy(d.water);
    u.uLamp.value.setHex(0xffb060);
    u.uSunGlow.value = d.sunGlow;
    u.uStars.value = d.stars;
    u.uLampOn.value = d.lampOn;
    u.uMoonDir.value.copy(d.moonDir);
    u.uMoon.value = d.moon;
    u.uGlowCol.value.copy(d.glow);
    if (this.fog) { this.fog.color.copy(d.fog); this.fog.near = d.fogNear * this.fogScale; this.fog.far = d.fogFar * this.fogScale; }
    if (!this.opts.sky && this.scene.background instanceof THREE.Color) this.scene.background.copy(d.horizon);
    if (this.hemi) {
      this.hemi.color.copy(d.sky);
      this.hemi.groundColor.copy(d.skyGround);
      this.hemi.intensity = d.ambient;
    }
    if (this.sun) {
      this.sun.color.copy(d.lightColour);
      this.sun.intensity = d.light;
    }
    if (d.phase !== this.phaseNow) {
      const prev = this.phaseNow;
      this.phaseNow = d.phase;
      this.onPhase?.(d.phase, prev);
    }
  }

  /** Sets the time of day (hours, 0–24). */
  setTime(hours: number): void { this.hours = ((hours % 24) + 24) % 24; this.lightDirty = true; this.applyDaylight(); }
  /** The time of day in hours. */
  get time(): number { return this.hours; }
  /** Dawn, day, dusk or night. */
  get phase(): DayPhase { return this.phaseNow; }
  /** The daylight now (sky colours, sun and moon directions, lamps …), read-only. */
  get light(): Readonly<Daylight> { return this.daylight; }
  /** Overcast amount (0 clear … 1 grey). */
  setWeather(overcast: number): void { this.weather = Math.max(0, Math.min(1, overcast)); this.applyDaylight(); }

  /** A look sets its hour (day 12:30, golden hour 18:30, night 22:30) and the weather. */
  setLook(id: LookId): void {
    this.look = LOOKS[id];
    this.weather = id === 'overcast' ? 1 : 0;
    this.setTime(LOOK_HOURS[id]);
  }

  /** Fog distances scaled (e.g. wider for a high camera). */
  setFogScale(k: number): void { if (k !== this.fogScale) { this.fogScale = k; this.applyDaylight(); } }

  /** Fixed fog distances (overrides the clock's until the next change of time). */
  setFog(near: number, far: number): void { if (this.fog) { this.fog.near = near; this.fog.far = far; } }

  setNear(r: number): void { this.opts.near = r; }
  get near(): number { return this.opts.near; }
  setDetail(r: number): void { this.opts.detail = r; }

  setLod(on: boolean): void {
    this.opts.lod = on;
    for (const m of this.far) m.visible = on;
    if (this.ground) this.ground.visible = on;
    if (this.groundFar) this.groundFar.visible = on;
  }

  setProps(on: boolean): void {
    if (this.opts.props === on) return;
    this.opts.props = on;
    // chunks carry their props: rebuild them
    for (const [key, l] of [...this.loaded]) this.unload(key, l);
    this.cache.clear();
    this.instDirty = true;
  }

  /** The placeholder parked cars on or off (a game with its own vehicles turns them off). */
  setCars(on: boolean): void { this.opts.cars = on; this.instDirty = true; }

  setShadows(on: boolean, extent?: number): void {
    this.opts.shadows = on;
    if (extent && this.sun) {
      Object.assign(this.sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    if (this.sun) this.sun.castShadow = on;
  }

  setWireframe(on: boolean): void {
    this.materials.city.wireframe = on;
    this.materials.water.wireframe = on;
    if (this.kit) this.kit.material.wireframe = on;
  }

  /** Debug overlays drawn over the city: the lane graph, colliders, the pedestrian graph. */
  overlay(kind: 'lanes' | 'colliders' | 'walk', on: boolean): void {
    let o = this.overlays.get(kind);
    if (!on) { if (o) o.visible = false; return; }
    if (!o) {
      const pts: number[] = [], cols: number[] = [];
      const h = this.builder.h;
      const seg = (ax: number, az: number, bx: number, bz: number, y: number, c: THREE.Color, abs = false) => {
        pts.push(ax, y + (abs ? 0 : h(ax, az)), az, bx, y + (abs ? 0 : h(bx, bz)), bz); cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      };
      const A = new THREE.Color(0xffd21f), B = new THREE.Color(0x29e0ff), C = new THREE.Color(0xff7b2f), R = new THREE.Color(0xff2020), W = new THREE.Color(0xffffff), X = new THREE.Color(0xff4fd8);
      if (kind === 'lanes') {
        for (const l of this.plan.lanes) {
          for (let i = 0; i < l.pts.length - 1; i++) seg(l.pts[i].x, l.pts[i].z, l.pts[i + 1].x, l.pts[i + 1].z, 0.35, l.dir === 1 ? A : B);
          const a = l.pts[l.pts.length - 2], b = l.pts[l.pts.length - 1];
          const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
          seg(b.x, b.z, b.x - ux * 2 - uz, b.z - uz * 2 + ux, 0.35, l.dir === 1 ? A : B);
          seg(b.x, b.z, b.x - ux * 2 + uz, b.z - uz * 2 - ux, 0.35, l.dir === 1 ? A : B);
        }
        for (const c of this.plan.connectors) for (let i = 0; i < c.pts.length - 1; i++) seg(c.pts[i].x, c.pts[i].z, c.pts[i + 1].x, c.pts[i + 1].z, 0.3, C);
      } else if (kind === 'colliders') {
        for (const c of this.plan.colliders) {
          const k = obbCorners(c.obb);
          for (let i = 0; i < 4; i++) { seg(k[i].x, k[i].z, k[(i + 1) % 4].x, k[(i + 1) % 4].z, c.y0 + 0.4, R, true); seg(k[i].x, k[i].z, k[(i + 1) % 4].x, k[(i + 1) % 4].z, Math.min(c.y1, c.y0 + 60), R, true); }
        }
        for (const c of this.plan.circles) {
          for (let i = 0; i < 8; i++) {
            const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
            seg(c.x + Math.cos(a0) * c.r, c.z + Math.sin(a0) * c.r, c.x + Math.cos(a1) * c.r, c.z + Math.sin(a1) * c.r, 0.5, W);
          }
        }
      } else {
        for (const [a, b, cr] of this.plan.walk.edges) {
          const p = this.plan.walk.pts[a], q = this.plan.walk.pts[b];
          seg(p.x, p.z, q.x, q.z, 0.4, cr ? X : W);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      o = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: kind !== 'colliders', fog: false }));
      o.renderOrder = 20;
      o.name = 'overlay:' + kind;
      this.group.add(o);
      this.overlays.set(kind, o);
    }
    o.visible = true;
  }

  /** Builds every chunk within the radius now (a first frame without pop-in). */
  loadAll(focus: THREE.Vector3): void {
    this.focus.copy(focus);
    const budget = this.opts.budget;
    this.opts.budget = 1e9;
    this.stream();
    this.opts.budget = budget;
    this.refillInstances();
  }

  /** Parking spots of the chunk under a point (indices into plan.parking). */
  parkingAt(x: number, z: number): number[] {
    return this.parkingByChunk.get(this.builder.key(Math.floor(x / this.opts.chunk), Math.floor(z / this.opts.chunk))) ?? [];
  }

  /** Ground height at a point (the terrain; sidewalks are 0.15 higher). */
  groundAt(x: number, z: number): number { return this.builder.h(x, z); }

  stats(): CityViewStats {
    let nearTris = 0, bytes = 0;
    for (const l of this.loaded.values()) nearTris += l.data.tris;
    for (const d of this.cache.values()) bytes += arraysBytes(d.geo);
    for (const l of this.loaded.values()) bytes += arraysBytes(l.data.geo);
    return {
      chunks: this.loaded.size, queued: this.queue.length, cached: this.cache.size, built: this.built,
      lastBuildMs: Math.round(this.lastBuildMs * 10) / 10, avgBuildMs: this.built ? Math.round((this.buildMs / this.built) * 10) / 10 : 0,
      nearTris, farTris: this.farTris, cacheMB: Math.round(bytes / 1e5) / 10,
      kitBuildings: this.kit?.shown ?? 0, kitInstances: this.kit?.instances ?? 0, kitTris: this.kit?.tris ?? 0,
      hours: Math.round(this.hours * 100) / 100, phase: this.phaseNow,
    };
  }

  /** Frees everything the view made (GPU and CPU) and takes it out of the scene. */
  dispose(): void {
    for (const [key, l] of [...this.loaded]) this.unload(key, l);
    this.cache.clear();
    this.kit?.dispose();
    // landmark models belong to the game (shared, loaded resources): take them out first
    for (const l of this.landmarks) this.group.remove(l);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      if ((o as THREE.LineSegments).isLineSegments) ((o as THREE.LineSegments).material as THREE.Material).dispose();
    });
    for (const t of this.textures) t.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    if (this.sun) { this.sun.shadow.dispose(); this.sun.shadow.map = null; }
    if (this.scene.fog === this.fog) this.scene.fog = null;
    this.scene.remove(this.group);
    this.group.clear();
  }
}

export type { ParkingSpot };

/** How far from the focus each instanced prop is drawn (metres). */
const PROP_RADIUS: Partial<Record<InstKind, number>> = { tree: 200, palm: 190, conifer: 200, lamp: 240, signal: 180, car: 160, container: 220 };

const propCache = new Map<InstKind, GeoArrays>();
import { propGeometry } from './props3d';
function propGeo(kind: InstKind): GeoArrays {
  let g = propCache.get(kind);
  if (!g) { g = propGeometry(kind).arrays(); propCache.set(kind, g); }
  return g;
}

/** A flat grid of n×n cells drawn with the ground map (kind 11), draped on the terrain. */
function groundGrid(x0: number, z0: number, size: number, n: number, y: number, kind: number, colour: number, h: (x: number, z: number) => number): GeoArrays {
  const cells = n * n;
  const position = new Float32Array(cells * 18), normal = new Float32Array(cells * 18), color = new Float32Array(cells * 18);
  const c = new THREE.Color(colour);
  for (let i = 0; i < cells * 6; i++) { color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b; }
  const aUv = new Float32Array(cells * 12), aK = new Float32Array(cells * 24);
  const s = size / n;
  let p = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const xa = x0 + i * s, xb = xa + s, za = z0 + j * s, zb = za + s;
    // two triangles facing up
    for (const [x, z] of [[xa, za], [xa, zb], [xb, zb], [xa, za], [xb, zb], [xb, za]]) {
      position[p * 3] = x; position[p * 3 + 1] = y + h(x, z); position[p * 3 + 2] = z;
      normal[p * 3 + 1] = 1;
      aK[p * 4] = kind;
      p++;
    }
  }
  return { position, normal, color, aUv, aK };
}

/**
 * The ground past the map: rings of quads from the map's edge (matching its grid, so there is
 * no crack) out to 16 km, at the edge's height (drawn with the far ground kind 22).
 */
function groundSkirt(x0: number, z0: number, size: number, n: number, y: number, colour: number, h: (x: number, z: number) => number): GeoArrays {
  const cx = x0 + size / 2, cz = z0 + size / 2;
  const edge: [number, number][] = [];
  const s = size / n;
  for (let i = 0; i < n; i++) edge.push([x0 + i * s, z0]);
  for (let i = 0; i < n; i++) edge.push([x0 + size, z0 + i * s]);
  for (let i = 0; i < n; i++) edge.push([x0 + size - i * s, z0 + size]);
  for (let i = 0; i < n; i++) edge.push([x0, z0 + size - i * s]);
  const rings = [0, 300, 1200, 4000, 16000];
  const ring = (r: number): number[][] => edge.map(([x, z]) => {
    const k = (size / 2 + r) / (size / 2);
    const ex = cx + (x - cx) * k, ez = cz + (z - cz) * k;
    return [ex, y + h(x, z) * (r > 2000 ? 0.6 : 1) - (r > 0 ? 0.1 : 0), ez];
  });
  const col = new THREE.Color(colour);
  const pos: number[] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const a = ring(rings[k]), b = ring(rings[k + 1]);
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      // facing up: (a_i, b_i, b_j), (a_i, b_j, a_j) wind clockwise in x,z seen from above
      for (const v of [a[i], a[j], b[j], a[i], b[j], b[i]]) pos.push(v[0], v[1], v[2]);
    }
  }
  const nv = pos.length / 3;
  const position = new Float32Array(pos), normal = new Float32Array(nv * 3), color = new Float32Array(nv * 3), aUv = new Float32Array(nv * 2), aK = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { normal[i * 3 + 1] = 1; color[i * 3] = col.r; color[i * 3 + 1] = col.g; color[i * 3 + 2] = col.b; aK[i * 4] = K.groundFar; }
  return { position, normal, color, aUv, aK };
}
