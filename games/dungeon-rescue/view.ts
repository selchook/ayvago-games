// Dungeon Rescue: the 3D view of a level. It reads the sim and draws:
//   - the dungeon, built from the Modular Dungeon pack on its 2 m grid: floor tiles, walls on the
//     edges of the wall blocks (each facing its floor), dark wall tops, columns where wall runs turn,
//     wall torches, banners, cobwebs and loose bricks; all static pieces merged into a few chunks
//     (frustum-culled), walls and tall props in the cutaway material;
//   - what moves or changes: barred cell doors and gates that slide up, wooden doors that swing,
//     levers, trapdoor flaps, spikes that rise, chest lids, flames, pick-ups (coin piles, coin bags,
//     keys, vases, buckets, the tricks as glowing orbs), barrels and crates (the one the knight hides
//     in wobbles), the exit stairs with their glow;
//   - the figures of the Ultimate Animated Character Pack, one skeleton and one clip set for all:
//     the knight in his chosen armour (a soldier's outfit under the disguise), the guards with their
//     heads turning as they look round, the Jailer Chief bigger with his lantern, the prisoners in
//     their cells and then in a line behind the knight; every move is one of their own clips;
//   - the guards' vision cones on the floor (one dynamic mesh: pale gold, orange when suspicious,
//     red in a chase; longer into the light, shorter into shadow, cut by walls), the light pools and
//     the dark, the alarm's red pulse, noise rings, the throw's aim, smoke, sparks and blob shadows;
//   - a tilted camera that eases after the knight, a little closer in landscape; on the map the
//     level turns slowly beside the board; the hideout is a small room by a campfire.
import { THREE, World3D } from '@core/three';
import { CELL, WALL_H, FIG_SCALE, WINGS, CHIEF, POWER_COLOR, THROW, type WingLook } from './defs';
import { geo, wholeGeo, partRest, Merger, place, isKitGeo, figure, clip } from './kit';
import { Fx } from './fx3d';
import { shadeUniforms, shade, POOLS, type ShadeUniforms } from './shade';
import { Sim, cellX, cellZ, SPIKE, type Guard, type Follower, type Thing } from './sim';
import type { Level } from './levels';

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler(), tc = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** The camera: this far from the knight, this steep, turned this much off the grid. */
export const CAM = { dist: 17, pitch: 0.98, yaw: 0.3, fov: 50, lookAhead: -0.8 };
/** Landscape: a little closer (the frame is wide); the map's level shifted right of the board. */
const CAM_LAND = { zoom: 0.98, previewShift: 0.5, previewZoom: 1.1 };
const CHUNK = 6;
const RAYS = 40;
const MAX_CONES = 10;
const ONCE = new Set(['PickUp', 'Punch', 'Defeat', 'SitDown', 'StandUp', 'RecieveHit', 'Jump', 'Shoot_OneHanded']);

/** An instanced mesh of one geometry, with its own count. */
class Inst {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  constructor(parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, cap: number, colors = false) {
    this.mesh = new THREE.InstancedMesh(g, mat, Math.max(1, cap));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    if (colors) for (let i = 0; i < Math.max(1, cap); i++) this.mesh.setColorAt(i, tc.set(0xffffff));
    this.mesh.count = 0;
    parent.add(this.mesh);
  }
  begin(): void { this.n = 0; }
  put(x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number | THREE.Vector3): number {
    if (this.n >= this.mesh.instanceMatrix.count) return -1;
    tq.setFromEuler(te.set(rx, ry, rz, 'YXZ'));
    if (typeof s === 'number') ts.set(s, s, s); else ts.copy(s);
    tm.compose(tv.set(x, y, z), tq, ts);
    this.mesh.setMatrixAt(this.n, tm);
    return this.n++;
  }
  putM(m: THREE.Matrix4): number { if (this.n >= this.mesh.instanceMatrix.count) return -1; this.mesh.setMatrixAt(this.n, m); return this.n++; }
  color(i: number, c: number): void { if (i >= 0) this.mesh.setColorAt(i, tc.setHex(c)); }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** One animated figure: its copy, its mixer and its clips. */
class Fig {
  readonly root = new THREE.Group();
  readonly obj: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  clipName = '';
  neck: THREE.Object3D | null = null;
  head = 0;
  /** The part of a guard's look the whole body turns with (eased), the neck takes the rest. */
  turn = 0;
  /** Far figures animate at a lower rate (accumulated time). */
  private acc = 0;
  /** The neck's pose before and after the last head turn: most clips (Idle, Walk, Run) leave the
   * neck alone, so the turn must start again from the clip's pose each frame, not stack up. */
  private neckIn = new THREE.Quaternion();
  private neckOut: THREE.Quaternion | null = null;
  constructor(id: string, mat: THREE.Material, readonly scale: number) {
    this.obj = figure(id, mat);
    this.obj.scale.setScalar(FIG_SCALE * scale);
    this.root.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.obj.traverse((o) => { if (o.name === 'Neck' && !this.neck) this.neck = o; });
  }
  play(name: string, fade = 0.18, speed = 1): void {
    let a = this.actions.get(name);
    if (!a) {
      const c = clip(name);
      if (!c) return;
      a = this.mixer.clipAction(c);
      if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(name, a);
    }
    a.timeScale = speed;
    if (this.clipName === name) return;
    const prev = this.actions.get(this.clipName);
    a.reset().play();
    if (prev) a.crossFadeFrom(prev, fade, false);
    this.clipName = name;
  }
  /** Advances the clips (every frame near the camera, every third frame far away). */
  update(dt: number, far: boolean): void {
    this.acc += dt;
    if (far && this.acc < 0.05) return;
    this.mixer.update(this.acc);
    this.acc = 0;
    // the head turn on top of the clip: the neck about the world's up axis. When the clip did not
    // set the neck this frame (it still holds last frame's turned pose), go back to the pose under
    // that turn first, so the head turns by `head` and never spins round and round.
    if (!this.neck) return;
    const q = this.neck.quaternion;
    if (this.neckOut && q.equals(this.neckOut)) q.copy(this.neckIn);
    this.neckIn.copy(q);
    if (Math.abs(this.head) > 0.01) {
      const p = this.neck.parent!;
      p.updateWorldMatrix(true, false);
      p.getWorldQuaternion(tq);
      const inv = tq.clone().invert();
      const r = new THREE.Quaternion().setFromAxisAngle(UP, this.head);
      q.premultiply(inv.multiply(r).multiply(tq));
    }
    (this.neckOut ??= new THREE.Quaternion()).copy(q);
  }
  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.obj); }
}

export type CamMode = 'follow' | 'preview' | 'intro' | 'hideout';

export class View {
  readonly world: World3D;
  readonly fx: Fx;
  readonly u: ShadeUniforms;
  private matFloor: THREE.MeshLambertMaterial;
  private matWall: THREE.MeshLambertMaterial;
  private matProp: THREE.MeshLambertMaterial;
  private matFig: THREE.MeshLambertMaterial;
  private matFlame: THREE.MeshBasicMaterial;
  private matGlow: THREE.MeshBasicMaterial;
  private matCone: THREE.MeshBasicMaterial;
  private matDark: THREE.MeshBasicMaterial;
  private level: Level | null = null;
  private look: WingLook = WINGS.cells;
  private stage: THREE.Group | null = null;
  private inst = new Map<string, Inst>();
  private hemi: THREE.HemisphereLight;
  private moon: THREE.DirectionalLight;
  private pool: THREE.PointLight[] = [];
  private lantern: THREE.PointLight;
  private heroLight: THREE.PointLight;
  // per-thing meshes that move
  private bars = new Map<number, THREE.Mesh>();
  private doors = new Map<number, THREE.Group>();
  private levers = new Map<number, THREE.Group>();
  private lids = new Map<number, THREE.Group>();
  private flaps = new Map<number, THREE.Group>();
  private hideProps = new Map<number, { inst: Inst; i: number; m: THREE.Matrix4 }>();
  private flames: { th: Thing; x: number; y: number; z: number; s: number; rot: number }[] = [];
  // figures
  private hero: Fig | null = null;
  private disguise: Fig | null = null;
  heroLook = 'knight';
  private guards: (Fig | null)[] = [];
  private followers: Fig[] = [];
  private blobs: Inst | null = null;
  // cones, the aim, the exit
  private cones: THREE.Mesh;
  private conePos: Float32Array;
  private coneCol: Float32Array;
  private aim: THREE.Mesh;
  private exitGlow: THREE.Mesh | null = null;
  private shots: THREE.Mesh[] = [];
  private yaw = 0;
  private stepT = 0;
  private time = 0;
  private preT = 0;
  // the camera
  readonly cam = { x: 0, y: 0, z: 0, shake: 0, zoom: 1 };
  /** Store art and tests: a fixed camera [position, look]. */
  shotCam: [number[], number[]] | null = null;
  private land: boolean;
  /** The hideout's little room (its own group). */
  private hideout: THREE.Group | null = null;
  private crewFigs: Fig[] = [];

  constructor(host: Phaser.Scene, o: { quality?: number } = {}) {
    this.land = host.scale.width > host.scale.height;
    this.world = new World3D(host, { fov: CAM.fov, background: 0x0d0b10, fog: { color: 0x0d0b10, near: 22, far: 44 }, shadows: false, quality: o.quality ?? 0.9, far: 90 });
    const w = this.world;
    this.u = shadeUniforms();
    this.matFloor = shade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u);
    this.matWall = shade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u, true);
    this.matProp = shade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u);
    this.matFig = shade(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u);
    this.matFlame = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
    this.matGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.matCone = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.matDark = new THREE.MeshBasicMaterial({ color: 0x050406, fog: false });
    this.hemi = new THREE.HemisphereLight(0xb8b0c8, 0x3a3038, 1.15);
    this.moon = new THREE.DirectionalLight(0xc8c0e0, 0.55);
    this.moon.position.set(-6, 14, -4);
    w.scene.add(this.hemi, this.moon, this.moon.target);
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa040, 0, 9, 1.5); this.pool.push(l); w.scene.add(l); }
    this.lantern = new THREE.PointLight(0xffd080, 0, 9, 1.4);
    this.heroLight = new THREE.PointLight(0xfff0d8, 6, 6, 1.6);
    w.scene.add(this.lantern, this.heroLight);
    this.fx = new Fx(w.scene);
    // the cones: one dynamic mesh for every guard
    // (a fan per guard with shared vertices: the apex and RAYS + 1 rim points, so the
    // triangles meet without seams and the colours blend smoothly across the cone)
    const per = RAYS + 2, nv = MAX_CONES * per;
    this.conePos = new Float32Array(nv * 3);
    this.coneCol = new Float32Array(nv * 4);
    const idx = new Uint16Array(MAX_CONES * RAYS * 3);
    for (let k = 0, j = 0; k < MAX_CONES; k++) for (let i = 0; i < RAYS; i++) { idx[j++] = k * per; idx[j++] = k * per + 1 + i; idx[j++] = k * per + 2 + i; }
    const cg = new THREE.BufferGeometry();
    cg.setIndex(new THREE.BufferAttribute(idx, 1));
    cg.setAttribute('position', new THREE.BufferAttribute(this.conePos, 3).setUsage(THREE.DynamicDrawUsage));
    cg.setAttribute('color', new THREE.BufferAttribute(this.coneCol, 4).setUsage(THREE.DynamicDrawUsage));
    cg.setDrawRange(0, 0);
    this.cones = new THREE.Mesh(cg, this.matCone);
    this.cones.frustumCulled = false;
    this.cones.renderOrder = 2;
    w.scene.add(this.cones);
    // the throw's aim: a ring where it will land
    this.aim = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    this.aim.visible = false;
    this.aim.renderOrder = 3;
    w.scene.add(this.aim);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo('vase'), this.matProp);
      m.visible = false;
      w.scene.add(m);
      this.shots.push(m);
    }
  }

  // ---------------------------------------------------------------- the knight's look

  /** The knight in this armour (a figure loaded before). */
  setLook(id: string): void {
    if (this.hero && this.heroLook === id) return;
    this.heroLook = id;
    if (this.hero) { this.hero.root.removeFromParent(); this.hero.dispose(); }
    this.hero = new Fig(id, this.matFig, 1);
    this.world.scene.add(this.hero.root);
    if (!this.disguise) { this.disguise = new Fig('soldier', this.matFig, 1); this.disguise.root.visible = false; this.world.scene.add(this.disguise.root); }
  }

  // ---------------------------------------------------------------- building a level

  /** Builds (or rebuilds) the level's meshes and figures; the old ones are freed. */
  build(sim: Sim): void {
    this.clear();
    const L = sim.c;
    this.level = L;
    this.look = WINGS[L.wing];
    const lk = this.look;
    const w = this.world;
    (w.scene.background as THREE.Color).setHex(lk.bg);
    (w.scene.fog as THREE.Fog).color.setHex(lk.bg);
    this.hemi.color.setHex(lk.hemi[0]); this.hemi.groundColor.setHex(lk.hemi[1]); this.hemi.intensity = lk.hemi[2];
    this.moon.color.setHex(lk.moon[0]); this.moon.intensity = lk.moon[1];
    if (!this.hero) this.setLook(this.heroLook);
    const root = new THREE.Group();
    this.stage = root;
    w.scene.add(root);
    const rnd = mulberry(L.n * 977 + 13);
    const { cols, rows } = L;
    const at = (c: number, r: number) => (c >= 0 && r >= 0 && c < cols && r < rows ? L.cells[r * cols + c] : null);
    const isWall = (c: number, r: number) => { const k = at(c, r); return !k || k.k !== 'floor'; };
    const thing = (c: number, r: number) => sim.thingAt(c, r);
    const chunks = new Map<string, { wall: Merger; low: Merger; prop: Merger }>();
    const chunk = (c: number, r: number) => {
      const k = Math.floor(c / CHUNK) + ',' + Math.floor(r / CHUNK);
      let ch = chunks.get(k);
      if (!ch) { ch = { wall: new Merger(), low: new Merger(), prop: new Merger() }; chunks.set(k, ch); }
      return ch;
    };
    const half = CELL / 2;
    // walls along every edge between a wall block and a floor cell; tops; dark floors inside
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!isWall(c, r) || at(c, r)?.k === 'void') continue;
      const ch = chunk(c, r);
      let edge = false;
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
        if (isWall(c + dc, r + dr)) continue;
        edge = true;
        const rot = Math.atan2(dc, dr);
        ch.wall.add(geo('wall'), place(cellX(c) + dc * (half - 0.22), 0, cellZ(r) + dr * (half - 0.22), rot, [1, WALL_H / 2.01, 1]), lk.wall);
        // now and then a carved panel or a banner on the wall
        const roll = rnd();
        if (roll < 0.08) ch.wall.add(geo('wall-deco'), place(cellX(c) + dc * (half + 0.02), 1.05, cellZ(r) + dr * (half + 0.02), rot, 0.8), lk.wall);
        else if (roll < 0.17 && dr >= 0) ch.wall.add(geo('banner-wall'), place(cellX(c) + dc * (half + 0.05), WALL_H - 0.05, cellZ(r) + dr * (half + 0.05), rot, 0.55), lk.banner);
        else if (roll < 0.23) ch.wall.add(geo(rnd() < 0.5 ? 'cobweb' : 'cobweb-b'), place(cellX(c) + dc * (half + 0.02), WALL_H - 0.55, cellZ(r) + dr * (half + 0.02), rot, 0.8), 0xffffff);
      }
      let near = edge;
      for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1 && !near; dc++) if (!isWall(c + dc, r + dr)) near = true;
      if (near) {
        const x = cellX(c), z = cellZ(r);
        ch.wall.quad([x - half, WALL_H, z + half], [x + half, WALL_H, z + half], [x + half, WALL_H, z - half], [x - half, WALL_H, z - half], lk.cap);
        ch.low.quad([x - half, 0.01, z + half], [x + half, 0.01, z + half], [x + half, 0.01, z - half], [x - half, 0.01, z - half], mul(lk.cap, 0.55));
      }
    }
    // columns where wall runs end or turn
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const a = isWall(c - 1, r - 1), b = isWall(c, r - 1), d = isWall(c - 1, r), e = isWall(c, r);
      const n = +a + +b + +d + +e;
      if (n === 0 || n === 4) continue;
      if (n === 2 && ((a && b) || (d && e) || (a && d) || (b && e))) continue;
      const x = cellX(c) - half, z = cellZ(r) - half;
      chunk(c, r).wall.add(geo('column'), place(x, 0, z, 0, [0.46, (WALL_H + 0.18) / 4.07, 0.46]), lk.wall);
    }
    // the floor (tiles turned at random), and what stands on it
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (isWall(c, r)) continue;
      const ch = chunk(c, r), x = cellX(c), z = cellZ(r);
      const th = thing(c, r);
      const pit = sim.things.some((t) => t.kind === 'trapdoor' && t.c === c && t.r === r);
      if (pit) {
        // a dark shaft under the trapdoor's flap
        ch.low.box(x - half * 0.86, -0.02, z - half * 0.86, x + half * 0.86, 0.0, z + half * 0.86, 0x08060a);
        ch.low.add(geo('floor'), place(x, 0, z, 0, [1, 1, 1]), mul(lk.floor, 0.5));
      } else ch.low.add(geo('floor'), place(x, 0, z, Math.floor(rnd() * 4) * Math.PI / 2), mul(lk.floor, 0.9 + rnd() * 0.12));
      if (!th && !pit && rnd() < 0.06) ch.low.add(geo('bricks'), place(x + (rnd() - 0.5), 0, z + (rnd() - 0.5), rnd() * 6, 0.8), mul(lk.floor, 0.9));
      if (!th) continue;
      switch (th.kind) {
        case 'column': ch.wall.add(geo('column-b'), place(x, 0, z, 0, [0.62, (WALL_H + 0.3) / 4.07, 0.62]), lk.wall); break;
        case 'banner': ch.wall.add(geo('banner'), place(x, 0, z, rnd() < 0.5 ? 0 : Math.PI / 2, [0.7, 0.6, 0.7]), lk.banner); break;
        case 'statue': ch.wall.add(geo('horse'), place(x, 0, z, Math.PI, 0.46), 0xffffff); break;
        case 'table': {
          const along = !isWall(c - 1, r) && !isWall(c + 1, r) ? Math.PI / 2 : 0;
          ch.prop.add(geo('table-small'), place(x, 0, z, along, [1.2, 1, 0.9]), 0xffffff);
          if (rnd() < 0.7) ch.prop.add(geo('chair'), place(x + (along ? 0 : 0.95), 0, z + (along ? 0.95 : 0), along ? Math.PI : -Math.PI / 2, 1), 0xffffff);
          if (rnd() < 0.5) ch.prop.add(geo('bucket'), place(x - 0.3, 0.85, z + 0.2, rnd() * 6, 0.8), 0xffffff);
          break;
        }
        case 'spikes': ch.low.add(geo('spike-trap'), place(x, 0, z, 0, [0.98, 1, 0.98]), 0xffffff); break;
        case 'campfire': ch.prop.add(geo('campfire'), place(x, 0, z, rnd() * 6, 1.3), 0xffffff); break;
        case 'chest': ch.prop.add(geo('chest-gold#base'), place(x, 0, z, Math.PI, 1.05), 0xffffff); break;
      }
    }
    // things that hold a prisoner get a little straw and a bucket
    for (const p of L.prisoners) { const ch = chunk(p.c, p.r); if (rnd() < 0.8) ch.prop.add(geo('bucket'), place(cellX(p.c) + 0.6, 0, cellZ(p.r) - 0.5, rnd() * 6, 1.1), 0xffffff); }
    // the exit: stairs rising away from the floor they open on, a glow
    {
      const [ec, er] = L.exit;
      let dc = 0, dr = 1;
      for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as [number, number][]) if (!isWall(ec + a, er + b)) { dc = a; dr = b; break; }
      const ch = chunk(ec, er);
      ch.low.add(geo('stairs'), place(cellX(ec) - dc * 0.0, -0.02, cellZ(er) - dr * 0.0, Math.atan2(dc, dr) + Math.PI, [1, 0.9, 1]), mul(lk.floor, 0.95));
      this.exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), this.matGlow.clone());
      (this.exitGlow.material as THREE.MeshBasicMaterial).color.setHex(0x8aff9a);
      this.exitGlow.position.set(cellX(ec), 0.12, cellZ(er));
      root.add(this.exitGlow);
    }
    // the chunks
    for (const ch of chunks.values()) {
      for (const [m, mat] of [[ch.wall, this.matWall], [ch.low, this.matFloor], [ch.prop, this.matProp]] as [Merger, THREE.Material][]) {
        if (m.empty) continue;
        const mesh = new THREE.Mesh(m.build(), mat);
        root.add(mesh);
      }
    }
    // ---- moving and changing things
    const count = (k: string) => sim.things.filter((t) => t.kind === k).length;
    const mk = (name: string, g: THREE.BufferGeometry, mat: THREE.Material, n: number, colors = false) => { const i = new Inst(root, g, mat, n, colors); this.inst.set(name, i); return i; };
    mk('coins', geo('coins'), this.matProp, count('coins') + 24);
    mk('bag', geo('coin-bag'), this.matProp, count('bag'));
    mk('key', keyGeo(), this.matProp, count('key'));
    mk('vase', geo('vase'), this.matProp, count('vase'));
    mk('bucket', geo('bucket'), this.matProp, count('bucket'));
    mk('power', orbGeo(), this.matFlame, count('power'), true);
    mk('glow', new THREE.PlaneGeometry(1, 1), this.matGlow, count('power') + count('key') + count('torch') + count('campfire') + 4, true);
    mk('spikes', geo('spike-trap#spikes'), this.matProp, count('spikes'));
    mk('flame', flameGeo(), this.matFlame, count('torch') + count('campfire'));
    mk('torch', geo('torch'), this.matWall, count('torch'));
    mk('barrel', geo('barrel'), this.matWall, count('barrel'));
    mk('crate', geo('crate'), this.matWall, count('crate'));
    this.blobs = mk('blob', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.5, fog: false }), 24);
    this.blobs.mesh.renderOrder = 1;
    // barrels and crates are instanced so the one the knight hides in can wobble
    const bi = this.inst.get('barrel')!, ci = this.inst.get('crate')!;
    bi.begin(); ci.begin();
    for (const th of sim.things) {
      if (th.kind === 'barrel') { const m = place(th.x, 0, th.z, rnd() * 6, 1.05); this.hideProps.set(th.id, { inst: bi, i: bi.putM(m), m }); }
      if (th.kind === 'crate') { const m = place(th.x, 0, th.z, Math.floor(rnd() * 4) * Math.PI / 2, 1.05); this.hideProps.set(th.id, { inst: ci, i: ci.putM(m), m }); }
    }
    bi.end(); ci.end();
    // torches on the walls (the stick instanced, the flame instanced and flickering)
    const ti = this.inst.get('torch')!;
    ti.begin();
    for (const th of sim.things) {
      if (th.kind === 'torch') {
        const x = th.x + th.dc * (half + 0.06), z = th.z + th.dr * (half + 0.06), rot = Math.atan2(th.dc, th.dr);
        ti.putM(place(x, 1.45, z, rot + Math.PI, 1.15));
        const fp = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(place(x, 1.45, z, rot + Math.PI, 1.15), partRest('torch', 'flame')));
        this.flames.push({ th, x: fp.x, y: fp.y, z: fp.z, s: 1, rot });
      }
      if (th.kind === 'campfire') this.flames.push({ th, x: th.x, y: 0.15, z: th.z, s: 2.2, rot: 0 });
    }
    ti.end();
    // bars: cell doors, gates and the exit gate (slide up when open)
    for (const th of sim.things) {
      if (th.kind === 'celldoor' || th.kind === 'gate' || th.kind === 'exitgate') {
        const alongX = isWall(th.c - 1, th.r) && isWall(th.c + 1, th.r);
        const m = new THREE.Mesh(geo('bars'), this.matWall);
        m.position.set(th.x, 0, th.z);
        m.rotation.y = alongX ? 0 : Math.PI / 2;
        m.scale.set(0.82, WALL_H / 3.39, 1);
        root.add(m);
        this.bars.set(th.id, m);
        // a lintel over it
        const ch = new Merger();
        const lw = alongX ? [CELL / 2, 0.2] : [0.2, CELL / 2];
        ch.box(th.x - lw[0], WALL_H - 0.18, th.z - lw[1], th.x + lw[0], WALL_H, th.z + lw[1], 0x3a3434, 0x2a2626);
        root.add(new THREE.Mesh(ch.build(), this.matWall));
      }
      if (th.kind === 'door') {
        const alongX = isWall(th.c - 1, th.r) && isWall(th.c + 1, th.r);
        const pivot = new THREE.Group();
        const rot = alongX ? 0 : Math.PI / 2;
        pivot.position.set(th.x - Math.cos(rot) * 0.98, 0, th.z + Math.sin(rot) * 0.98);
        pivot.rotation.y = rot;
        const leaf = new THREE.Mesh(geo('door'), this.matWall);
        leaf.position.set(0.98, 0, 0);
        leaf.scale.set(0.81, WALL_H / 3.19, 0.9);
        pivot.add(leaf);
        root.add(pivot);
        this.doors.set(th.id, pivot);
      }
      if (th.kind === 'lever') {
        const g = new THREE.Group();
        g.position.set(th.x, 0, th.z);
        const base = new THREE.Mesh(leverBaseGeo(), this.matProp);
        const handle = new THREE.Group();
        handle.position.y = 0.42;
        handle.add(new THREE.Mesh(leverHandleGeo(), this.matProp));
        handle.name = 'handle';
        g.add(base, handle);
        root.add(g);
        this.levers.set(th.id, g);
      }
      if (th.kind === 'chest') {
        const g = new THREE.Group();
        const m = place(th.x, 0, th.z, Math.PI, 1.05);
        g.matrixAutoUpdate = false;
        g.matrix.copy(m).multiply(partRest('chest-gold', 'lid'));
        const lid = new THREE.Mesh(geo('chest-gold#lid'), this.matProp);
        const hinge = new THREE.Group();
        hinge.add(lid);
        g.add(hinge);
        root.add(g);
        this.lids.set(th.id, hinge);
      }
      if (th.kind === 'trapdoor') {
        const g = new THREE.Group();
        g.position.set(th.x - 0.87, 0.02, th.z);
        const flap = new THREE.Mesh(geo('trapdoor'), this.matProp);
        flap.position.set(0.87, 0, 0);
        flap.scale.set(1.12, 1, 1.15);
        g.add(flap);
        root.add(g);
        this.flaps.set(th.id, g);
      }
    }
    // the figures
    this.guards = sim.guards.map((g) => {
      const f = new Fig(g.k === 'chief' ? 'chief' : g.k, this.matFig, g.boss ? CHIEF.scale : 1);
      root.add(f.root);
      f.play(g.state === 'sleep' ? 'SitDown' : 'Idle', 0);
      return f;
    });
    this.followers = sim.followers.map((fo) => {
      const f = new Fig(fo.id, this.matFig, fo.id === 'pug' || fo.id === 'cow' ? 1 : 0.97);
      root.add(f.root);
      f.play('SitDown', 0);
      return f;
    });
    this.lights(sim);
  }

  /** Puts the camera and the knight where the sim is (a new level, a respawn). */
  snap(sim: Sim): void {
    const h = sim.hero;
    this.cam.x = h.x; this.cam.y = 0; this.cam.z = h.z;
    this.yaw = h.yaw;
    this.sync(sim, 0);
  }

  // ---------------------------------------------------------------- every frame

  sync(sim: Sim, dt: number, o: { camera?: CamMode; introT?: number } = {}): void {
    this.time += dt;
    const h = sim.hero;
    const mode = o.camera ?? 'follow';
    this.fx.update(dt);
    const camPos = this.world.camera.position;
    const far = (x: number, z: number) => Math.hypot(x - camPos.x, z - camPos.z) > 26;
    // ---- the knight
    const hero = this.hero!, dis = this.disguise!;
    const disguised = h.disguise > 0;
    const f = disguised ? dis : hero;
    hero.root.visible = !disguised && mode !== 'preview' && mode !== 'hideout' && h.state !== 'hidden';
    dis.root.visible = disguised && mode !== 'preview' && mode !== 'hideout' && h.state !== 'hidden';
    let dy = h.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 14);
    for (const fig of [hero, dis]) { fig.root.position.set(h.x, 0, h.z); fig.root.rotation.y = this.yaw; }
    const speed = Math.hypot(h.vx, h.vz);
    if (h.state === 'dead' || h.state === 'caught') f.play('Defeat', 0.15);
    else if (h.state === 'fall') f.play('RecieveHit', 0.1);
    else if (h.state === 'clear') f.play('Victory', 0.2);
    else if (h.anim === 'throw') f.play('Punch', 0.06, 1.3);
    else if (h.anim === 'powder') f.play('Shoot_OneHanded', 0.08, 1.2);
    else if (h.anim === 'act' || h.pick > 0 || h.steal > 0) f.play('PickUp', 0.1, h.pick > 0 || h.steal > 0 ? 0.6 : 1.1);
    else if (speed > 4.2) f.play('Run', 0.15, speed / 5.4);
    else if (speed > 0.35) f.play('Walk', 0.15, speed / 2.6);
    else f.play('Idle', 0.25);
    f.update(dt, false);
    // blink while protected after a catch
    const blink = h.invul > 0 && h.state === 'play' && Math.floor(this.time * 12) % 2 === 0;
    if (blink) f.root.visible = false;
    if (speed > 0.6 && h.state === 'play') { this.stepT += dt * speed; if (this.stepT > 1.4) { this.stepT = 0; this.fx.dust(h.x, 0, h.z, h.sprinting ? 3 : 1, 0x8a8070, h.sprinting ? 1.2 : 0.6); } }
    this.heroLight.position.set(h.x, 2.4, h.z);
    this.heroLight.intensity = mode === 'follow' || mode === 'intro' ? 7 : 0;
    // ---- the guards
    let ci = 0;
    sim.guards.forEach((g, i) => {
      const v = this.guards[i];
      if (!v) return;
      v.root.visible = g.state !== 'fallen';
      v.root.position.set(g.x, 0, g.z);
      // A standing guard turns his shoulders with the look and his neck the rest; a walking
      // one keeps his body on his way and only turns his head.
      const share = g.moving > 0.2 ? 0 : 0.55;
      v.turn += (g.head * share - v.turn) * Math.min(1, dt * 8);
      v.root.rotation.y = g.yaw + v.turn;
      v.head = g.head - v.turn;
      this.animGuard(v, g, sim);
      v.update(dt, far(g.x, g.z));
      if (g.mark === 'z' && Math.random() < dt * 1.6) this.fx.zz(g.x, 1.4 * (g.boss ? CHIEF.scale : 1), g.z);
      if (mode !== 'preview' && mode !== 'hideout' && sim.awake(g) && ci < MAX_CONES) this.cone(sim, g, ci++);
    });
    this.cones.geometry.setDrawRange(0, ci * RAYS * 3);
    (this.cones.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.cones.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    // ---- the followers
    sim.followers.forEach((fo, i) => {
      const v = this.followers[i];
      if (!v) return;
      v.root.visible = !(fo.mode === 'out' || (h.state === 'clear' && Math.hypot(fo.x - cellX(sim.c.exit[0]), fo.z - cellZ(sim.c.exit[1])) < 0.6));
      v.root.position.set(fo.x, 0, fo.z);
      let dyaw = fo.yaw - v.root.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      v.root.rotation.y += dyaw * Math.min(1, dt * 10);
      this.animFollower(v, fo);
      v.update(dt, far(fo.x, fo.z));
    });
    // ---- blob shadows under everyone
    const b = this.blobs;
    if (b) {
      b.begin();
      if (hero.root.visible || dis.root.visible) b.put(h.x, 0.03, h.z, 0, 0, 0, 1.15);
      sim.guards.forEach((g) => { if (g.state !== 'fallen') b.put(g.x, 0.03, g.z, 0, 0, 0, g.boss ? 1.6 : 1.1); });
      sim.followers.forEach((fo, i) => { if (this.followers[i]?.root.visible) b.put(fo.x, 0.03, fo.z, 0, 0, 0, 1); });
      b.end();
    }
    // ---- things
    this.syncThings(sim, dt, mode);
    // ---- light pools, the alarm
    this.u.uDRHero.value.set(h.x, 0.8, h.z);
    const floorK = mode === 'preview' || mode === 'hideout' ? 0.85 : this.look.dark;
    this.u.uDRFloor.value += (floorK - this.u.uDRFloor.value) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
    const alarm = sim.alarm ? 0.22 + 0.16 * Math.sin(this.time * 6.5) : 0;
    this.u.uDRAlarm.value += (alarm - this.u.uDRAlarm.value) * Math.min(1, dt * 6);
    this.lights(sim);
    // ---- the camera
    this.camera(sim, dt, mode, o.introT ?? 1);
  }

  private animGuard(v: Fig, g: Guard, sim: Sim): void {
    const moving = g.moving;
    switch (g.state) {
      case 'sleep': case 'doze': v.play('SitDown', 0.3, 0.8); v.head = 0; return;
      case 'locked': v.play('Defeat', 0.2); return;
      case 'stolen': case 'daze': v.play('RecieveHit', 0.12, 0.7); return;
      case 'slam': v.play('Jump', 0.08, 1.2); return;
      case 'check': v.play(g.hold > 0 ? 'PickUp' : moving > 0 ? 'Walk' : 'Idle', 0.15); return;
      case 'charge': v.play(g.hold > 0 ? 'Idle' : 'Run', 0.08, 1.5); return;
    }
    if (sim.hero.state === 'caught' && Math.hypot(sim.hero.x - g.x, sim.hero.z - g.z) < 2.4) { v.play('Victory', 0.2); return; }
    if (moving > 3.5) v.play('Run', 0.15, moving / 5);
    else if (moving > 0.2) v.play('Walk', 0.18, moving / (2.4 * v.scale));
    else v.play('Idle', 0.25);
  }

  private animFollower(v: Fig, fo: Follower): void {
    if (fo.mode === 'cell') { v.play('SitDown', 0.3); return; }
    if (fo.mode === 'cheer') { v.play('Victory', 0.15); return; }
    if (fo.mode === 'wait') { v.play('SitDown', 0.25); return; }
    if (fo.stun > 0) { v.play('RecieveHit', 0.1); return; }
    if (fo.speed > 3.8) v.play('Run', 0.15, fo.speed / 5);
    else if (fo.speed > 0.3) v.play('Walk', 0.15, fo.speed / 2.4);
    else v.play('Idle', 0.3);
  }

  /** One guard's cone: a fan of rays cut by walls and stretched by light. */
  private cone(sim: Sim, g: Guard, k: number): void {
    const fov = sim.fovOf(g), look = sim.lookOf(g);
    const alert = g.state === 'chase' || g.state === 'charge' ? 2 : g.state === 'search' || g.susp > 0.35 ? 1 : 0;
    const col = alert === 2 ? [1, 0.2, 0.12] : alert === 1 ? [1, 0.62, 0.15] : g.boss ? [1, 0.86, 0.5] : [1, 0.94, 0.62];
    const a0 = alert === 2 ? 0.55 : alert === 1 ? 0.5 : g.boss ? 0.46 : 0.4;
    const y = 0.035 + k * 0.002;
    const ex = g.x + Math.sin(look) * 0.25, ez = g.z + Math.cos(look) * 0.25;
    const base = k * (RAYS + 2);
    const pos = this.conePos, cc = this.coneCol;
    const put = (v: number, x: number, z: number, al: number) => {
      const j = (base + v) * 3, jc = (base + v) * 4;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      cc[jc] = col[0]; cc[jc + 1] = col[1]; cc[jc + 2] = col[2]; cc[jc + 3] = al;
    };
    put(0, ex, ez, a0);
    for (let i = 0; i <= RAYS; i++) {
      const a = look - fov + (2 * fov * i) / RAYS;
      const d = sim.coneRay(g, a);
      // the sides fade out over the outer rays (a soft edge, not a band)
      const side = Math.min(i, RAYS - i) / 3, soft = side >= 1 ? 1 : 0.35 + 0.65 * side;
      put(1 + i, ex + Math.sin(a) * d, ez + Math.cos(a) * d, a0 * 0.32 * soft);
    }
  }

  private syncThings(sim: Sim, dt: number, mode: CamMode): void {
    const h = sim.hero, t = this.time;
    const pick = (name: string) => { const i = this.inst.get(name); i?.begin(); return i; };
    const coins = pick('coins'), bag = pick('bag'), key = pick('key'), vase = pick('vase'), bucket = pick('bucket'), power = pick('power'), glow = pick('glow'), spikes = pick('spikes'), flame = pick('flame');
    const sp = sim.clock % (SPIKE.down + SPIKE.warn + SPIKE.up);
    const spikeY = sp < SPIKE.down ? -0.95 : sp < SPIKE.down + SPIKE.warn ? -0.78 + Math.sin(t * 60) * 0.04 : -0.02;
    for (const th of sim.things) {
      const bob = Math.sin(t * 2.4 + th.id) * 0.08;
      switch (th.kind) {
        case 'coins': case 'coin': if (!th.taken) coins?.put(th.x, 0.02, th.z, 0, th.id + t * 0.2, 0, th.kind === 'coin' ? 1.6 : 3.4); break;
        case 'bag': if (!th.taken) bag?.put(th.x, 0.02, th.z, 0, th.id, 0, 2.6); break;
        case 'key': if (!th.taken) { key?.put(th.x, 0.6 + bob, th.z, 0.3, t * 1.6, 0, 1); glow?.color(glow.put(th.x, 0.6, th.z, -Math.PI / 2 + 0.0, 0, 0, 1.6), 0xffd060); } break;
        case 'vase': if (!th.taken) vase?.put(th.x, 0, th.z, 0, th.id, 0, 1.7); break;
        case 'bucket': if (!th.taken) bucket?.put(th.x, 0, th.z, 0, th.id, 0, 1.5); break;
        case 'power': if (!th.taken) { const i = power?.put(th.x, 0.75 + bob, th.z, t, t * 1.3, 0, 0.34) ?? -1; power?.color(i, POWER_COLOR[th.power!]); glow?.color(glow.put(th.x, 0.75 + bob, th.z, 0, 0, 0, 1.9), POWER_COLOR[th.power!]); } break;
        case 'spikes': spikes?.putM(new THREE.Matrix4().multiplyMatrices(place(th.x, spikeY, th.z, 0, [0.98, 1, 0.98]), partRest('spike-trap', 'spikes'))); break;
        case 'celldoor': case 'gate': case 'exitgate': { const m = this.bars.get(th.id); if (m) m.position.y = th.open * (WALL_H - 0.15); break; }
        case 'door': { const p = this.doors.get(th.id); if (p) p.children[0].rotation.y = -th.open * 1.45; break; }
        case 'lever': { const g = this.levers.get(th.id); const hd = g?.getObjectByName('handle'); if (hd) hd.rotation.z += ((th.on ? -0.7 : 0.7) - hd.rotation.z) * Math.min(1, dt * 10); break; }
        case 'chest': { const l = this.lids.get(th.id); if (l) l.rotation.x = -th.open * 1.7; break; }
        case 'trapdoor': { const f = this.flaps.get(th.id); if (f) { const shake = th.t > 0 && th.t < 0.45 && !th.linked ? Math.sin(t * 50) * 0.05 : 0; f.rotation.z = -th.open * 1.7 + shake; } break; }
      }
    }
    // flames flicker; a put-out torch smokes a little
    for (const fl of this.flames) {
      const lit = fl.th.kind === 'campfire' || fl.th.on;
      if (!lit) { if (Math.random() < dt * 1.2) this.fx.spawn(fl.x, fl.y + 0.1, fl.z, 0, 0.6, 0, 0.05, 1.2, 0x6a6470, { drag: 0.5, grow: 2 }); continue; }
      const k = 0.85 + Math.sin(t * 23 + fl.th.id) * 0.09 + Math.sin(t * 37 + fl.th.id * 2) * 0.06;
      flame?.put(fl.x, fl.y, fl.z, 0, t * 2 + fl.th.id, 0, new THREE.Vector3(fl.s * 0.9, fl.s * k, fl.s * 0.9));
      glow?.color(glow.put(fl.x, fl.y + 0.2, fl.z, 0, 0, 0, 2.6 * fl.s), this.look.flame);
      if (Math.random() < dt * 2.5) this.fx.embers(fl.x, fl.y + 0.25, fl.z, 1, this.look.flame);
    }
    for (const i of [coins, bag, key, vase, bucket, power, spikes, flame]) i?.end();
    // glows face the camera
    if (glow) {
      const cq = this.world.camera.quaternion;
      for (let i = 0; i < glow.n; i++) {
        glow.mesh.getMatrixAt(i, tm);
        tm.decompose(tv, tq, ts);
        tm.compose(tv, cq, ts);
        glow.mesh.setMatrixAt(i, tm);
      }
      glow.end();
    }
    // the barrel the knight hides in wobbles
    for (const [id, hp] of this.hideProps) {
      const inside = h.state === 'hidden' && h.hideIn === id;
      const m = inside ? hp.m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.sin(t * 9) * 0.035)) : hp.m;
      hp.inst.mesh.setMatrixAt(hp.i, m);
      hp.inst.mesh.instanceMatrix.needsUpdate = true;
    }
    // the exit's glow
    if (this.exitGlow) {
      const ok = sim.followers.filter((f) => f.mode !== 'cell').length >= sim.c.need && !sim.things.some((x) => x.kind === 'exitgate' && x.open < 0.9);
      const mat = this.exitGlow.material as THREE.MeshBasicMaterial;
      mat.color.setHex(ok ? 0x8aff9a : 0x6a6a7a);
      this.exitGlow.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    }
    // the throw's aim and the things in flight
    this.aim.visible = h.aiming && h.state === 'play' && mode === 'follow';
    if (this.aim.visible) {
      const [ax, az] = sim.landing(h.yaw, null);
      this.aim.position.set(ax, 0.07, az);
      this.aim.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
    }
    this.shots.forEach((m, i) => {
      const s = sim.shots[i];
      m.visible = !!s;
      if (!s) return;
      const k = Math.min(1, s.t / THROW.flight);
      m.position.set(s.x0 + (s.x1 - s.x0) * k, 1.2 + Math.sin(k * Math.PI) * 1.6 - k * 1.1, s.z0 + (s.z1 - s.z0) * k);
      m.rotation.set(t * 9, t * 6, 0);
      m.geometry = geo(s.kind === 'coin' ? 'coins' : s.kind);
      m.scale.setScalar(s.kind === 'coin' ? 2.2 : 1.5);
    });
  }

  /** The four nearest lit torches as point lights; every lit torch, campfire and the lantern as a pool. */
  private lights(sim: Sim): void {
    const h = sim.hero;
    const lit = sim.things.filter((t) => (t.kind === 'torch' && t.on) || t.kind === 'campfire');
    const pt = (t: Thing): [number, number] => t.kind === 'torch' ? [t.x + t.dc * 1.2, t.z + t.dr * 1.2] : [t.x, t.z];
    const d = (t: Thing) => { const p = pt(t); return Math.hypot(p[0] - h.x, p[1] - h.z); };
    lit.sort((a, b) => d(a) - d(b));
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], t = lit[i];
      if (!t || d(t) > 24) { l.intensity = 0; continue; }
      const p = pt(t);
      l.position.set(p[0], t.kind === 'torch' ? 2 : 1.2, p[1]);
      l.color.setHex(this.look.flame);
      const fl = 0.9 + Math.sin(this.time * 19 + i * 3) * 0.06 + Math.sin(this.time * 31 + i) * 0.05;
      l.intensity = (t.kind === 'campfire' ? 16 : 22) * fl;
      l.distance = t.kind === 'campfire' ? 7 : 9;
    }
    const pools = this.u.uDRPools.value;
    let n = 0;
    for (const t of lit) {
      if (n >= POOLS - 1) break;
      const p = pt(t);
      pools[n++].set(p[0], p[1], t.kind === 'campfire' ? 4 : 5.6, 1);
    }
    const b = sim.boss;
    if (b && b.state !== 'fallen') {
      pools[n++].set(b.x, b.z, CHIEF.lantern + 0.8, 0.9);
      this.lantern.position.set(b.x + Math.sin(b.yaw) * 0.5, 1.6 * CHIEF.scale, b.z + Math.cos(b.yaw) * 0.5);
      this.lantern.intensity = b.state === 'locked' ? 6 : 16;
    } else this.lantern.intensity = 0;
    for (; n < POOLS; n++) pools[n].set(0, 0, 0, 0);
  }

  private camera(sim: Sim, dt: number, mode: CamMode, introT: number): void {
    const h = sim.hero, c = this.cam, cam = this.world.camera;
    const L = sim.c;
    if (this.shotCam) {
      cam.position.set(this.shotCam[0][0], this.shotCam[0][1], this.shotCam[0][2]);
      cam.lookAt(this.shotCam[1][0], this.shotCam[1][1], this.shotCam[1][2]);
      this.u.uDRCam.value.copy(cam.position);
      return;
    }
    const near = this.land ? CAM_LAND.zoom : 1.28;
    let tx = h.x, tz = h.z, dist = CAM.dist * c.zoom * near, yaw = CAM.yaw, side = 0;
    if (mode === 'preview') {
      this.preT += dt;
      tx = (L.cols - 1) * CELL / 2; tz = (L.rows - 1) * CELL / 2;
      dist = Math.max(L.cols, L.rows * 0.8) * CELL * 1.0 + 6;
      yaw = CAM.yaw + Math.sin(this.preT * 0.25) * 0.3;
      if (this.land) { dist *= CAM_LAND.previewZoom; side = -CAM_LAND.previewShift * dist * Math.tan((CAM.fov * Math.PI) / 360) * (cam.aspect || 16 / 9); }
    } else if (mode === 'intro') {
      const k = Math.min(1, introT), e = k * k * (3 - 2 * k);
      const ex = cellX(L.exit[0]), ez = cellZ(L.exit[1]);
      tx = ex + (h.x - ex) * e; tz = ez + (h.z - ez) * e;
      dist = CAM.dist * near * (1.4 - 0.4 * e);
    } else if (mode === 'hideout') {
      tx = 0; tz = 0; dist = 8.5; yaw = 0.25;
      if (this.land) side = -0.45 * dist * Math.tan((CAM.fov * Math.PI) / 360) * (cam.aspect || 16 / 9);
    }
    const fog = this.world.scene.fog as THREE.Fog;
    fog.near = dist + 4; fog.far = dist * 2 + 24;
    const ease = mode === 'follow' ? Math.min(1, dt * 5) : mode === 'intro' || mode === 'hideout' ? 1 : Math.min(1, dt * 2);
    c.x += (tx - c.x) * ease; c.z += (tz - c.z) * ease;
    c.shake = Math.max(0, c.shake - dt * 2.2);
    const sh = c.shake * c.shake * 0.5;
    const pitch = mode === 'hideout' ? 0.5 : CAM.pitch;
    const hor = Math.cos(pitch) * dist, up = Math.sin(pitch) * dist;
    const la = mode === 'hideout' ? 0 : CAM.lookAhead;
    const lx = c.x + Math.sin(yaw) * la + Math.cos(yaw) * side, lz = c.z + Math.cos(yaw) * la - Math.sin(yaw) * side;
    const ly = mode === 'hideout' ? 1 : 0.4;
    cam.position.set(lx + Math.sin(yaw) * hor + (Math.random() - 0.5) * sh, ly + up + (Math.random() - 0.5) * sh, lz + Math.cos(yaw) * hor);
    cam.lookAt(lx, ly, lz);
    this.u.uDRCam.value.copy(cam.position);
    this.moon.target.position.set(c.x, 0, c.z);
    this.moon.position.set(c.x - 6, 14, c.z - 4);
  }

  // ---------------------------------------------------------------- the hideout

  /** A little room by a campfire: the knight in his armour, the two companions beside him. */
  showHideout(look: string, crew: string[]): void {
    this.clearHideout();
    const g = new THREE.Group();
    this.hideout = g;
    const m = new Merger();
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 1; z++) m.add(geo('floor'), place(x * 2, 0, z * 2, ((x + z) & 3) * Math.PI / 2), 0xcfc6d0);
    for (let x = -3; x <= 3; x++) m.add(geo('wall'), place(x * 2, 0, -7, 0, [1, 1.3, 1]), 0xffffff);
    m.add(geo('campfire'), place(0, 0, 1.6, 0.4, 1.4), 0xffffff);
    m.add(geo('barrel'), place(-3.6, 0, -4.6, 0.3, 1), 0xffffff);
    m.add(geo('barrel-b'), place(-2.6, 0, -5.2, 1.1, 1), 0xffffff);
    m.add(geo('crate'), place(3.8, 0, -4.8, 0.2, 1), 0xffffff);
    m.add(geo('banner-wall'), place(-2, 2.55, -6.75, 0, 0.6), WINGS.cells.banner);
    m.add(geo('banner-wall'), place(2, 2.55, -6.75, 0, 0.6), 0x5a80d8);
    m.add(geo('table-small'), place(4, 0, -2.4, Math.PI / 2, 1), 0xffffff);
    g.add(new THREE.Mesh(m.build(), this.matProp));
    const fl = new THREE.Mesh(flameGeo(), this.matFlame);
    fl.position.set(0, 0.15, 1.6);
    fl.scale.setScalar(2.4);
    fl.name = 'flame';
    g.add(fl);
    const kn = new Fig(look, this.matFig, 1);
    kn.root.position.set(0, 0, -1.2);
    kn.root.rotation.y = 0.15;
    kn.play('Idle', 0);
    g.add(kn.root);
    this.crewFigs = [kn];
    crew.slice(0, 2).forEach((id, i) => {
      const f = new Fig(id, this.matFig, 0.97);
      f.root.position.set(i ? 1.9 : -1.9, 0, -0.7);
      f.root.rotation.y = i ? -0.35 : 0.35;
      f.play(i ? 'Victory' : 'Idle', 0);
      g.add(f.root);
      this.crewFigs.push(f);
    });
    this.world.scene.add(g);
    if (this.stage) this.stage.visible = false;
    for (const p of this.u.uDRPools.value) p.set(0, 0, 0, 0);
    this.u.uDRPools.value[0].set(0, 1.6, 7, 1);
  }

  syncHideout(dt: number): void {
    if (!this.hideout) return;
    this.time += dt;
    for (const f of this.crewFigs) f.update(dt, false);
    const fl = this.hideout.getObjectByName('flame');
    if (fl) fl.scale.set(2.3, 2.3 * (0.88 + Math.sin(this.time * 21) * 0.1), 2.3);
    if (Math.random() < dt * 3) this.fx.embers(0, 0.6, 1.6, 1, 0xffa040);
    this.fx.update(dt);
    this.pool[0].position.set(0, 1.4, 1.6); this.pool[0].intensity = 26 * (0.9 + Math.sin(this.time * 17) * 0.08); this.pool[0].distance = 10; this.pool[0].color.setHex(0xffa040);
    for (let i = 1; i < this.pool.length; i++) this.pool[i].intensity = 0;
    this.lantern.intensity = 0;
    this.heroLight.intensity = 0;
    this.hemi.intensity = 1.1;
    this.u.uDRFloor.value = 0.75;
    this.u.uDRAlarm.value = 0;
    for (const v of [this.hero, this.disguise]) if (v) v.root.visible = false;
    this.cones.geometry.setDrawRange(0, 0);
    this.aim.visible = false;
    const cam = this.world.camera;
    // the room shows beside the board in landscape (its right part) and above it in portrait
    const dist = this.land ? 7.6 : 10.5, yaw = 0.22, pitch = 0.34;
    const half = dist * Math.tan((CAM.fov * Math.PI) / 360);
    let side = 0, lift = 0;
    if (this.land) side = -0.55 * half * (cam.aspect || 16 / 9);
    else lift = -0.6 * half;
    const lx = Math.cos(yaw) * side, lz = -0.9 - Math.sin(yaw) * side;
    cam.position.set(lx + Math.sin(yaw) * Math.cos(pitch) * dist, 1.1 + lift + Math.sin(pitch) * dist, lz + Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(lx, 1.1 + lift, lz);
    this.u.uDRCam.value.copy(cam.position);
  }

  clearHideout(): void {
    if (!this.hideout) return;
    for (const f of this.crewFigs) f.dispose();
    this.crewFigs = [];
    freeGroup(this.hideout, this.keepMats());
    this.world.scene.remove(this.hideout);
    this.hideout = null;
    if (this.stage) this.stage.visible = true;
  }

  // ---------------------------------------------------------------- misc

  shake(k: number): void { this.cam.shake = Math.min(1.4, this.cam.shake + k); }

  screen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } { return this.world.toScreen(new THREE.Vector3(x, y, z)); }

  /** Compiles every shader of the level ahead (the first frames do not stall). */
  warm(): void { this.world.renderer.compile(this.world.scene, this.world.camera); }

  stats(): { calls: number; triangles: number } {
    const i = this.world.renderer.info.render;
    return { calls: i.calls, triangles: i.triangles };
  }

  private keepMats(): Set<THREE.Material> {
    return new Set<THREE.Material>([this.matFloor, this.matWall, this.matProp, this.matFig, this.matFlame, this.matGlow, this.matCone, this.matDark]);
  }

  /** Frees the level's meshes (the kit's cached geometries stay). */
  clear(): void {
    this.clearHideout();
    for (const f of [...this.guards, ...this.followers]) f?.dispose();
    this.guards = [];
    this.followers = [];
    if (this.stage) {
      freeGroup(this.stage, this.keepMats());
      this.world.scene.remove(this.stage);
      this.stage = null;
    }
    this.inst.clear();
    this.bars.clear(); this.doors.clear(); this.levers.clear(); this.lids.clear(); this.flaps.clear(); this.hideProps.clear();
    this.flames = [];
    this.exitGlow = null;
    this.blobs = null;
    this.fx.clear();
  }

  dispose(): void { this.clear(); }
}

// ------------------------------------------------------------------ helpers

const cached = new WeakSet<THREE.BufferGeometry>();
function keep<T extends THREE.BufferGeometry>(g: T): T { cached.add(g); return g; }

function freeGroup(root: THREE.Object3D, mats: Set<THREE.Material>): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    if (!cached.has(m.geometry) && !isKitGeo(m.geometry) && !(m as THREE.SkinnedMesh).isSkinnedMesh) m.geometry.dispose();
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).skeleton.dispose();
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list) if (!mats.has(mat)) mat.dispose();
  });
}

function mul(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let flameG: THREE.BufferGeometry | null = null;
/** A flame: two crossed teardrops, orange outside and pale yellow inside. */
function flameGeo(): THREE.BufferGeometry {
  if (flameG) return flameG;
  const m = new Merger();
  for (const [s, col] of [[1, 0xff7a20], [0.62, 0xffd060]] as [number, number][]) {
    const c = new THREE.ConeGeometry(0.13 * s, 0.42 * s, 6, 1).translate(0, 0.21 * s, 0);
    m.add(c, new THREE.Matrix4(), col, true);
    c.dispose();
  }
  flameG = keep(m.build());
  return flameG;
}

let keyG: THREE.BufferGeometry | null = null;
function keyGeo(): THREE.BufferGeometry {
  if (keyG) return keyG;
  const m = new Merger();
  const ring = new THREE.TorusGeometry(0.13, 0.04, 6, 12);
  m.add(ring, new THREE.Matrix4().makeTranslation(0, 0.2, 0), 0xf0c040, true);
  ring.dispose();
  m.box(-0.025, -0.25, -0.025, 0.025, 0.08, 0.025, 0xf0c040, 0xc89a20);
  m.box(0.02, -0.25, -0.02, 0.11, -0.19, 0.02, 0xf0c040, 0xc89a20);
  m.box(0.02, -0.15, -0.02, 0.09, -0.1, 0.02, 0xf0c040, 0xc89a20);
  keyG = keep(m.build());
  return keyG;
}

let orbG: THREE.BufferGeometry | null = null;
function orbGeo(): THREE.BufferGeometry {
  if (orbG) return orbG;
  const m = new Merger();
  const s = new THREE.IcosahedronGeometry(1, 1);
  m.add(s, new THREE.Matrix4(), 0xffffff, true);
  s.dispose();
  orbG = keep(m.build());
  return orbG;
}

let leverBaseG: THREE.BufferGeometry | null = null;
function leverBaseGeo(): THREE.BufferGeometry {
  if (leverBaseG) return leverBaseG;
  const m = new Merger();
  m.box(-0.34, 0, -0.26, 0.34, 0.18, 0.26, 0x55565e, 0x3a3a42);
  m.box(-0.22, 0.18, -0.12, 0.22, 0.46, 0.12, 0x6a5a48, 0x4a3e32);
  leverBaseG = keep(m.build());
  return leverBaseG;
}

let leverHandleG: THREE.BufferGeometry | null = null;
function leverHandleGeo(): THREE.BufferGeometry {
  if (leverHandleG) return leverHandleG;
  const m = new Merger();
  m.box(-0.04, 0, -0.04, 0.04, 0.82, 0.04, 0x7a5232, 0x5a3a22);
  const k = new THREE.IcosahedronGeometry(0.11, 0);
  m.add(k, new THREE.Matrix4().makeTranslation(0, 0.86, 0), 0xc8302a, true);
  k.dispose();
  leverHandleG = keep(m.build());
  return leverHandleG;
}

/** A soft round shadow texture. */
function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A soft glow (additive, coloured per instance). */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

void wholeGeo; void ts;
