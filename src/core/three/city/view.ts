// City generator: CityView draws a plan into a three.js scene and streams it round a focus
// point (the player). Chunks within `near` metres are built in full (merged geometry, one draw
// call each, built a few per frame and cached on the CPU); everything else is the far LOD
// (every building as a box, in big tiles) over a ground map, under a sky dome, with a water
// plane. Repeated props are InstancedMeshes refilled when the chunk set changes. A chunk that
// leaves frees its GPU geometry at once, so streaming back and forth keeps GPU memory flat.
//
// Works in a plain three.js page (the preview tool) and inside a World3D (pass world.scene;
// World3D frees what is left in its scene on shutdown, and dispose() is safe to call too).
import * as THREE from 'three';
import { CityBuilder, INSTANCED, type InstKind, type ChunkData } from './build';
import { toGeometry, type GeoArrays, arraysBytes } from './geobuf';
import { makeUniforms, applyLook, cityMaterial, waterMaterial, skyMaterial, haloMaterial, K, type CityUniforms } from './materials';
import { LOOKS, type Look } from './look';
import type { LookId } from './styles';
import type { CityPlan, Building } from './types';
import { STYLES } from './styles';
import { obbYaw, obbCorners } from './geom';

export interface CityViewOptions {
  look?: LookId;
  /** Chunk size in metres (default 128). */
  chunk?: number;
  /** Radius of full detail round the focus (default 320). */
  near?: number;
  /** Draw the far LOD and ground map beyond `near` (default true). */
  lod?: boolean;
  props?: boolean;
  /** A sun with shadows (default from the look). */
  shadows?: boolean;
  /** Half size of the sun's shadow box (default 140 m). */
  shadowExtent?: number;
  /** Add a sun and sky light to the scene (default true). */
  lights?: boolean;
  sky?: boolean;
  fog?: boolean;
  /** CPU time per update spent building chunks, ms (default 8; at least one chunk). */
  budget?: number;
  /** Built chunks kept on the CPU after they leave (default 96). */
  cache?: number;
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
}

export class CityView {
  readonly group = new THREE.Group();
  readonly builder: CityBuilder;
  readonly uniforms: CityUniforms = makeUniforms();
  readonly materials: { city: THREE.MeshLambertMaterial; water: THREE.MeshLambertMaterial; sky: THREE.ShaderMaterial; halo: THREE.ShaderMaterial };
  sun: THREE.DirectionalLight | null = null;
  hemi: THREE.HemisphereLight | null = null;
  look: Look;
  private opts: Required<Omit<CityViewOptions, 'replace' | 'look' | 'shadows'>> & { shadows: boolean | undefined };
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
  private halos: THREE.InstancedMesh | null = null;
  private instDirty = true;
  private textures: THREE.Texture[] = [];
  private overlays = new Map<string, THREE.Object3D>();
  private landmarks: THREE.Object3D[] = [];
  private built = 0;
  private buildMs = 0;
  private lastBuildMs = 0;
  private focus = new THREE.Vector3();
  private time = 0;

  constructor(readonly plan: CityPlan, readonly scene: THREE.Scene, options: CityViewOptions = {}) {
    this.opts = {
      chunk: options.chunk ?? 128, near: options.near ?? 320, lod: options.lod ?? true, props: options.props ?? true,
      shadows: options.shadows, shadowExtent: options.shadowExtent ?? 140, lights: options.lights ?? true,
      sky: options.sky ?? true, fog: options.fog ?? true, budget: options.budget ?? 8, cache: options.cache ?? 96,
    };
    this.look = LOOKS[options.look ?? STYLES[plan.style].look];
    this.builder = new CityBuilder(plan, this.opts.chunk);
    const u = this.uniforms;
    this.materials = { city: cityMaterial(u), water: waterMaterial(u), sky: skyMaterial(u), halo: haloMaterial(u) };
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
    this.makeStatic();
    this.makeInstanced();
    if (options.replace) this.makeLandmarks(options.replace);
    this.setLook(this.look.id);
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
    // far LOD tiles
    for (const t of this.builder.far(512)) {
      const m = this.mesh(t.geo, this.materials.city, false);
      m.name = 'far:' + t.key;
      this.far.push(m);
      this.farTris += t.tris;
    }
    // the ground map: a grid over the map's rectangle and a coarser one far past it, both
    // below the near chunks (small triangles keep the depth exact)
    const rect = this.builder.mapRect();
    this.ground = this.mesh(groundGrid(rect.x0, rect.z0, rect.size, 32, -0.3), this.materials.city, false);
    this.ground.name = 'ground';
    const far = 16000;
    this.groundFar = this.mesh(groundGrid(S / 2 - far, S / 2 - far, far * 2, 24, -0.45, K.groundFar, STYLES[this.plan.style].terrain), this.materials.city, false);
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
      m.castShadow = kind !== 'container' && kind !== 'signal';
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.name = 'props:' + kind;
      this.group.add(m);
      this.inst.set(kind, m);
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
      wrap.position.set(b.obb.x, 0.15, b.obb.z);
      wrap.rotation.y = obbYaw(b.obb) + Math.PI;
      this.group.add(wrap);
      this.landmarks.push(wrap);
      skip.add(b.id);
    }
    this.builder.skip = skip;
  }

  // ---------------------------------------------------------------- per frame

  /**
   * Streams chunks round `focus` and moves the sky, the sun's shadow box and the shader clock
   * along. Call once per frame before rendering.
   */
  update(focus: THREE.Vector3, camera: THREE.Camera, dt = 1 / 60): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.focus.copy(focus);
    this.uniforms.uFocus.value.copy(focus);
    this.stream();
    if (this.instDirty) this.refillInstances();
    if (this.skyMesh) this.skyMesh.position.copy(camera.position);
    if (this.sun) {
      const d = this.uniforms.uSunDir.value;
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.sun.position.set(focus.x + d.x * 400, d.y * 400, focus.z + d.z * 400);
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

  private stream(): void {
    const near = this.opts.near, c = this.opts.chunk;
    // leave: chunks well outside the radius
    for (const [key, l] of this.loaded) {
      if (this.chunkDist(key) > near + c * 0.5) this.unload(key, l);
    }
    // wanted chunks not loaded yet, nearest first
    const want: number[] = [];
    const r = Math.ceil(near / c) + 1;
    const fx = Math.floor(this.focus.x / c), fz = Math.floor(this.focus.z / c);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const key = this.builder.key(fx + i, fz + j);
      if (this.loaded.has(key) || !this.builder.has(key)) continue;
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
    // far boxes give way only where the near chunks are complete
    const missing = this.queue.length ? this.chunkDist(this.queue[0]) : near;
    this.uniforms.uNearR.value = this.opts.lod ? Math.max(0, Math.min(near, missing) - 10) : 1e6;
  }

  private load(key: number): void {
    let data = this.cache.get(key);
    if (data) this.cache.delete(key);
    else {
      data = this.builder.build(key, { props: this.opts.props });
      this.built++;
      this.buildMs += data.ms;
      this.lastBuildMs = data.ms;
    }
    const mesh = data.geo.position.length ? this.mesh(data.geo, this.materials.city, true) : null;
    if (mesh) mesh.name = 'chunk:' + key;
    this.loaded.set(key, { data, mesh });
    this.instDirty = true;
  }

  private unload(key: number, l: Loaded): void {
    if (l.mesh) {
      this.group.remove(l.mesh);
      l.mesh.geometry.dispose();
    }
    this.loaded.delete(key);
    // keep the CPU arrays (the BufferAttributes reference them; three.js no longer does)
    this.cache.set(key, l.data);
    while (this.cache.size > this.opts.cache) this.cache.delete(this.cache.keys().next().value as number);
    this.instDirty = true;
  }

  private refillInstances(): void {
    this.instDirty = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const [kind, mesh] of this.inst) {
      let n = 0;
      if (this.opts.props) for (const l of this.loaded.values()) {
        const rec = l.data.inst[kind];
        if (!rec) continue;
        for (let i = 0; i < rec.length; i += 8) {
          if (n >= mesh.instanceMatrix.count) break;
          p.set(rec[i], rec[i + 1], rec[i + 2]);
          q.setFromAxisAngle(up, rec[i + 3]);
          s.setScalar(rec[i + 4]);
          mesh.setMatrixAt(n, m4.compose(p, q, s));
          mesh.setColorAt(n, col.setRGB(rec[i + 5], rec[i + 6], rec[i + 7]));
          n++;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.halos) {
      let n = 0;
      if (this.opts.props) for (const l of this.loaded.values()) {
        const h = l.data.halos;
        for (let i = 0; i < h.length; i += 3) {
          if (n >= this.halos.instanceMatrix.count) break;
          this.halos.setMatrixAt(n++, m4.makeTranslation(h[i], h[i + 1], h[i + 2]));
        }
      }
      this.halos.count = n;
      this.halos.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- settings

  setLook(id: LookId): void {
    const look = LOOKS[id];
    this.look = look;
    applyLook(this.uniforms, look);
    if (this.opts.fog) this.scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    if (!this.opts.sky) this.scene.background = new THREE.Color(look.horizon);
    if (this.hemi) {
      this.hemi.color.set(look.sky);
      this.hemi.groundColor.set(look.skyGround);
      this.hemi.intensity = look.ambient;
    }
    if (this.sun) {
      this.sun.color.set(look.sun);
      this.sun.intensity = look.sunIntensity;
      this.sun.castShadow = this.opts.shadows ?? look.shadows;
    }
    if (this.halos) this.halos.visible = look.night > 0.3;
  }

  /** Fog distances (e.g. wider for an aerial camera). */
  setFog(near: number, far: number): void {
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = near; this.scene.fog.far = far; }
  }

  setNear(r: number): void { this.opts.near = r; }
  get near(): number { return this.opts.near; }

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
  }

  /** Debug overlays drawn over the city: the lane graph, colliders, the pedestrian graph. */
  overlay(kind: 'lanes' | 'colliders' | 'walk', on: boolean): void {
    let o = this.overlays.get(kind);
    if (!on) { if (o) o.visible = false; return; }
    if (!o) {
      const pts: number[] = [], cols: number[] = [];
      const seg = (ax: number, az: number, bx: number, bz: number, y: number, c: THREE.Color) => { pts.push(ax, y, az, bx, y, bz); cols.push(c.r, c.g, c.b, c.r, c.g, c.b); };
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
          for (let i = 0; i < 4; i++) { seg(k[i].x, k[i].z, k[(i + 1) % 4].x, k[(i + 1) % 4].z, c.y0 + 0.4, R); seg(k[i].x, k[i].z, k[(i + 1) % 4].x, k[(i + 1) % 4].z, Math.min(c.y1, 60), R); }
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

  stats(): CityViewStats {
    let nearTris = 0, bytes = 0;
    for (const l of this.loaded.values()) nearTris += l.data.tris;
    for (const d of this.cache.values()) bytes += arraysBytes(d.geo);
    for (const l of this.loaded.values()) bytes += arraysBytes(l.data.geo);
    return {
      chunks: this.loaded.size, queued: this.queue.length, cached: this.cache.size, built: this.built,
      lastBuildMs: Math.round(this.lastBuildMs * 10) / 10, avgBuildMs: this.built ? Math.round((this.buildMs / this.built) * 10) / 10 : 0,
      nearTris, farTris: this.farTris, cacheMB: Math.round(bytes / 1e5) / 10,
    };
  }

  /** Frees everything the view made (GPU and CPU) and takes it out of the scene. */
  dispose(): void {
    for (const [key, l] of [...this.loaded]) this.unload(key, l);
    this.cache.clear();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      if ((o as THREE.LineSegments).isLineSegments) ((o as THREE.LineSegments).material as THREE.Material).dispose();
    });
    for (const l of this.landmarks) this.group.remove(l);
    for (const t of this.textures) t.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    if (this.sun) { this.sun.shadow.dispose(); this.sun.shadow.map = null; }
    this.scene.remove(this.group);
    this.group.clear();
  }
}

const propCache = new Map<InstKind, GeoArrays>();
import { propGeometry } from './props3d';
function propGeo(kind: InstKind): GeoArrays {
  let g = propCache.get(kind);
  if (!g) { g = propGeometry(kind).arrays(); propCache.set(kind, g); }
  return g;
}

/** A flat grid of n×n cells drawn with the ground map (kind 11). */
function groundGrid(x0: number, z0: number, size: number, n: number, y: number, kind: number = K.ground, colour = 0xffffff): GeoArrays {
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
      position[p * 3] = x; position[p * 3 + 1] = y; position[p * 3 + 2] = z;
      normal[p * 3 + 1] = 1;
      aK[p * 4] = kind;
      p++;
    }
  }
  return { position, normal, color, aUv, aK };
}
