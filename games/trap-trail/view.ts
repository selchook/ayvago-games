// Trap Trail: the 3D view of a stage. It reads the sim and draws:
//   - the sky (a gradient dome), drifting clouds and far islands;
//   - the islands, built here in the look of the pack's preview: a grass (sand, snow, moss) cap
//     with a bevelled rim over a layered cake of earth stripes, merged with every static model of
//     the stage (bridges, stairs, pipes, fences, plants, trees, the flag, the gate frames, the
//     stage numbers, cannon wheels …) into ONE geometry;
//   - the moving pieces instanced by kind (saws, spike-trap spikes, columns, logs, cannons, balls,
//     bombs, spiked balls and chains, springs, pickups, powers), a few single meshes (floes, door
//     panels, chest lids, lever handles, checkpoint numbers);
//   - the hero: the player's platform character (Mini Characters) with its own clips, squash and
//     stretch, a blob shadow straight under its feet, blinking after a hit, the Thunder glow and
//     the shield bubble;
//   - a camera behind and above the hero that eases after it, keeps the ground it last stood on
//     in view while jumping, and shakes on hits.
import { THREE, World3D, model, modelClips } from '@core/three';
import { WORLDS, HERO_H, POWER_COLOR, MOVE, type WorldLook } from './defs';
const MOVE_HURT = MOVE.hurtTime;
import { S, mulberry } from './builder';
import { geo, Merger, place, litMaterial, partRest, rigKey, isKitGeo } from './kit';
import { Fx } from './fx3d';
import type { Course, Box, Solid, Foe, FoeKind } from './course';
import type { Sim, Hero } from './sim';

const ICE_TOP = 0xd8f2ff;
/** Leaves per world (multiplied): the frost's are blue-grey, the storm's dusky. */
const TREE_TINT: Record<string, number | undefined> = { meadow: undefined, canyon: 0xfff0c0, frost: 0xb8d0f0, storm: 0xc8b0e0 };
const WOOD_TOP = 0xc98a4a, WOOD_SIDE = 0x9a6230;
/** The pack's hero is 3.76 units tall. */
const HERO_SCALE = HERO_H / 3.76;

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler(), tc = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** An instanced mesh of one model, with its own count. */
class Inst {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  constructor(parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadows = true, colors = false) {
    this.mesh = new THREE.InstancedMesh(g, mat, Math.max(1, cap));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    if (colors) for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, tc.set(0xffffff));
    this.mesh.count = 0;
    parent.add(this.mesh);
  }
  begin(): void { this.n = 0; }
  put(x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number | THREE.Vector3, order: THREE.EulerOrder = 'XYZ'): number {
    if (this.n >= this.mesh.instanceMatrix.count) return -1;
    tq.setFromEuler(te.set(rx, ry, rz, order));
    if (typeof s === 'number') ts.set(s, s, s); else ts.copy(s);
    tm.compose(tv.set(x, y, z), tq, ts);
    this.mesh.setMatrixAt(this.n, tm);
    return this.n++;
  }
  putM(m: THREE.Matrix4): number {
    if (this.n >= this.mesh.instanceMatrix.count) return -1;
    this.mesh.setMatrixAt(this.n, m);
    return this.n++;
  }
  color(i: number, c: number): void { if (i >= 0) this.mesh.setColorAt(i, tc.setHex(c)); }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class View {
  readonly world: World3D;
  readonly fx: Fx;
  private lit = litMaterial();
  private stage: THREE.Group | null = null;
  private course: Course | null = null;
  private look: WorldLook = WORLDS.meadow;
  private sky!: THREE.Mesh;
  private clouds!: THREE.Mesh;
  // the stage's dynamic parts
  private inst = new Map<string, Inst>();
  private floes: { mesh: THREE.Mesh; s: Solid }[] = [];
  private panels: THREE.Mesh[] = [];
  private lids: THREE.Mesh[] = [];
  private handles: THREE.Mesh[] = [];
  private numbers: { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; on: boolean }[] = [];
  private frames: THREE.Mesh | null = null;
  private foeViews: FoeView[] = [];
  private foeMats = new Map<FoeKind, THREE.MeshLambertMaterial>();
  private shared = new Set<THREE.BufferGeometry>();
  private bonusMeshes: { mesh: THREE.Mesh; used: boolean }[] = [];
  private flag: THREE.Object3D | null = null;
  // the hero
  readonly hero = new THREE.Group();
  private body = new THREE.Group();
  private figure: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private clip = '';
  private heroMats: THREE.MeshLambertMaterial[] = [];
  private blob: THREE.Mesh;
  private bubble: THREE.Mesh;
  private squash = 0;
  private stretch = 0;
  private faceYaw = 0;
  private landT = 0;
  // the camera
  readonly cam = { x: 0, y: 4, z: 8, gy: 0, shake: 0, kick: 0 };
  /** Store art and tests: a fixed camera [position, look]. */
  shotCam: [number[], number[]] | null = null;
  private time = 0;

  constructor(host: Phaser.Scene, o: { quality?: number } = {}) {
    this.world = new World3D(host, { fov: 50, background: null, fog: { color: 0xcdeeff, near: 30, far: 95 }, quality: o.quality ?? 1, far: 420 });
    const w = this.world;
    w.addLights({ extent: 16, dir: [-0.45, 1, 0.55] });
    w.sun!.shadow.mapSize.set(1024, 1024);
    this.makeSky();
    this.fx = new Fx(w.scene);
    // the hero
    // the hero: the pack's own character with its own clips, one Lambert material for its colours
    const fig = model(rigKey('hero'), { shadows: true });
    fig.scale.setScalar(HERO_SCALE);
    fig.rotation.y = Math.PI; // the model faces +z; yaw 0 runs down the course (-z)
    const heroMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.heroMats.push(heroMat);
    fig.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = heroMat; });
    this.figure = fig;
    this.body.add(fig);
    this.hero.add(this.body);
    this.mixer = new THREE.AnimationMixer(fig);
    for (const c of modelClips(rigKey('hero'))) {
      const a = this.mixer.clipAction(c);
      if (['Death', 'Yes', 'Jump', 'Jump_Land', 'HitReact'].includes(c.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(c.name, a);
    }
    this.play('Idle');
    // the blob shadow straight under the feet (depth at a glance) and the shield bubble
    const blobTex = blobTexture();
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    w.scene.add(this.blob);
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshLambertMaterial({ color: 0x8ad8ff, emissive: 0x2a6a9a, transparent: true, opacity: 0.32, depthWrite: false }));
    this.bubble.scale.set(0.95, 1.05, 0.95);
    this.bubble.position.y = HERO_H * 0.5;
    this.hero.add(this.bubble);
    w.scene.add(this.hero);
  }

  // ---------------------------------------------------------------- sky and clouds

  private makeSky(): void {
    const g = new THREE.SphereGeometry(380, 24, 14);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count * 3).fill(1), 3));
    this.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.world.scene.add(this.sky);
    // clouds: the pack's three clouds, scattered round and below the course (one mesh)
    const m = new Merger(), r = mulberry(5);
    for (let i = 0; i < 46; i++) {
      const side = i % 2 ? 1 : -1;
      const cx = side * (12 + r() * 42), cy = -14 + r() * 18, cz = 30 - r() * 260;
      m.add(geo('qp:cloud-' + (1 + (i % 3))), place(cx, cy, cz, r() * 6, 1.2 + r() * 1.6), 0xffffff);
    }
    this.clouds = new THREE.Mesh(m.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x9aa8c0, emissiveIntensity: 0.55 }));
    this.world.scene.add(this.clouds);
  }

  private paintSky(look: WorldLook): void {
    const g = this.sky.geometry, pos = g.getAttribute('position'), col = g.getAttribute('color') as THREE.BufferAttribute;
    const top = new THREE.Color(look.skyTop), hor = new THREE.Color(look.sky), low = new THREE.Color(look.fog);
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getY(i) / 380;
      if (k >= 0) tc.copy(hor).lerp(top, Math.pow(k, 0.7)); else tc.copy(hor).lerp(low, Math.min(1, -k * 2.5));
      col.setXYZ(i, tc.r, tc.g, tc.b);
    }
    col.needsUpdate = true;
    const fog = this.world.scene.fog as THREE.Fog;
    fog.color.setHex(look.fog);
    const hemi = this.world.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    hemi.color.setHex(look.hemi[0]); hemi.groundColor.setHex(look.hemi[1]); hemi.intensity = look.hemi[2];
    this.world.sun!.color.setHex(look.sun[0]); this.world.sun!.intensity = look.sun[1];
    (this.clouds.material as THREE.MeshLambertMaterial).emissive.setHex(look === WORLDS.storm ? 0x3a3656 : 0x9aa8c0);
  }

  // ---------------------------------------------------------------- building a stage

  /** Builds (or rebuilds) the stage's meshes; the old ones are freed. */
  build(c: Course): void {
    this.clear();
    this.course = c;
    this.look = WORLDS[c.world];
    this.paintSky(this.look);
    const root = new THREE.Group();
    this.stage = root;
    this.world.scene.add(root);
    const r = mulberry(c.n * 31 + 7);
    // islands and static models: one geometry
    const M = new Merger();
    for (const s of c.solids) if (s.island && !s.mover && !s.crumble) tileIsland(M, s.b, c.world, s.surf);
    for (const d of c.decor) this.decorInto(M, d.key, d.x, d.y, d.z, d.rot, d.s, d.tint);
    // models that stand still under moving parts
    for (const t of c.traps) M.add(geo('qp:spike-trap#base'), place(t.x, trapBase(t.y), t.z, 0, S.trap));
    for (const s of c.spikes) M.add(geo('qp:spikes'), place(s.x, s.y - 0.05, s.z, s.rot, s.scale));
    for (const ch of c.chests) M.add(geo('qp:chest#base'), place(ch.x, ch.y, ch.z, ch.rot, S.chest).multiply(partRest('chest', 'base')));
    for (const l of c.levers) M.add(geo('qp:lever#base'), place(l.x, l.y, l.z, l.rot, S.lever).multiply(partRest('lever', 'base')));
    for (const o of c.orbiters) M.box(o.x - 0.22, o.y - 0.75, o.z - 0.22, o.x + 0.22, o.y + 0.45, o.z + 0.22, 0x5a5a66, 0x45454f);
    for (const cp of c.checkpoints) { M.box(cp.x - 0.45, cp.y, cp.z - 0.45, cp.x + 0.45, cp.y + 0.5, cp.z + 0.45, 0xb8b4ac, 0x8f8a82); M.box(cp.x - 0.32, cp.y + 0.5, cp.z - 0.32, cp.x + 0.32, cp.y + 0.62, cp.z + 0.32, 0xd8d4cc, 0xa8a49c); }
    for (const p of c.pendulums) gallowsInto(M, p.px, p.py, p.pz);
    M.add(geo('qp:flag'), place(c.goal.x, c.goal.y, c.goal.z, Math.PI / 2, S.flag));
    M.box(c.goal.x - 1.3, c.goal.y, c.goal.z - 1.3, c.goal.x + 1.3, c.goal.y + 0.2, c.goal.z + 1.3, 0xffd86a, 0xd8a83a);
    if (c.tower) M.add(geo('qp:tower'), place(c.goal.x, c.goal.y + 0.06, c.goal.z - 5.8, 0, S.tower));
    this.farIslands(M, c, r);
    const mesh = new THREE.Mesh(M.build(), this.lit);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    // gate frames on their own (they fade when the hero walks through)
    if (c.doors.length) {
      const F = new Merger();
      for (const d of c.doors) F.add(geo('qp:door#frame'), place(d.x, d.y, d.z, 0, S.door).multiply(partRest('door', 'frame')));
      const fm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
      this.frames = new THREE.Mesh(F.build(), fm);
      this.frames.castShadow = true;
      root.add(this.frames);
    }
    // floes (moving and crumbling)
    for (const s of c.solids) {
      if (!s.mover && !s.crumble) continue;
      const F = new Merger(), b = s.b;
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      // the pack's single cubes, squashed to the floe: grass for moving floes, bare earth for crumbling ones
      const sy = (b.y1 - b.y0) / 2, cm = new THREE.Matrix4().makeTranslation(0, -sy, 0).multiply(new THREE.Matrix4().makeScale(w / 2, sy, d / 2));
      const L = TILE_LOOK[c.world] ?? TILE_LOOK.meadow;
      if (s.crumble) F.add(geo('qp:c-dirt'), cm, L.body);
      else { F.add(geo('qp:c-grass#top'), cm, L.top, L.top !== undefined); F.add(geo('qp:c-grass#body'), cm, L.body); }
      const fm = new THREE.Mesh(F.build(), this.lit);
      fm.castShadow = true; fm.receiveShadow = true;
      root.add(fm);
      this.floes.push({ mesh: fm, s });
    }
    // single moving models
    const fixed = (g: THREE.BufferGeometry, list: THREE.Mesh[]) => { const m = new THREE.Mesh(g, this.lit); m.castShadow = true; m.matrixAutoUpdate = false; root.add(m); list.push(m); };
    for (let i = 0; i < c.doors.length; i++) fixed(geo('qp:door#door'), this.panels);
    for (let i = 0; i < c.chests.length; i++) fixed(geo('qp:chest#lid'), this.lids);
    for (let i = 0; i < c.levers.length; i++) fixed(geo('qp:lever#handle'), this.handles);
    for (const cp of c.checkpoints) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff, emissive: 0x000000 });
      const m = new THREE.Mesh(geo('qp:n' + Math.min(5, cp.n)), mat);
      m.castShadow = true;
      root.add(m);
      this.numbers.push({ mesh: m, mat, on: false });
    }
    // instanced kinds
    const add = (k: string, g: THREE.BufferGeometry, n: number, o: { shadows?: boolean; colors?: boolean; mat?: THREE.Material } = {}) => { if (n > 0) this.inst.set(k, new Inst(root, g, o.mat ?? this.lit, n, o.shadows ?? true, o.colors)); };
    add('saw', geo('qp:saw'), c.saws.length);
    add('spikes', geo('qp:spike-trap#spikes'), c.traps.length);
    add('warn', warnGeo(), c.traps.length, { shadows: false, colors: true, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }) });
    add('pillar', geo('qp:cylinder'), c.pillars.length);
    add('log', geo('qp:cylinder'), c.rollers.length * 8);
    add('cannon', geo('qp:cannon'), c.cannons.length);
    add('ball', geo('qp:cannonball'), Math.max(8, c.cannons.length * 6));
    add('bomb', geo('qp:bomb'), Math.max(4, c.bombs.length + c.droppers.length * 3), { colors: true });
    add('ring', ringGeo(), c.bombs.length + c.droppers.length * 3, { shadows: false, colors: true, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }) });
    add('spiky', geo('qp:spiky-ball'), c.pendulums.length + c.orbiters.reduce((s, o) => s + o.n, 0));
    add('chain', chainGeo(), c.pendulums.length, { shadows: false });
    add('spring', geo('qp:bouncer#spring'), c.bouncers.length);
    add('top', geo('qp:bouncer#top'), c.bouncers.length);
    const count = (k: string, sub?: string) => c.pickups.filter((p) => p.kind === k && (!sub || p.gem === sub || p.power === sub)).length + (k === 'coin' ? c.chests.reduce((s, ch) => s + ch.coins, 0) : 0) + (k === 'gem' ? c.chests.filter((ch) => ch.gem === sub).length : 0) + (k === 'heart' ? c.chests.filter((ch) => ch.heart).length : 0);
    add('coin', geo('qp:coin'), count('coin'));
    for (const g of ['green', 'blue', 'pink']) add('gem-' + g, geo('qp:gem-' + g), count('gem', g));
    add('star', geo('qp:star'), count('star'));
    add('heart', geo('qp:heart'), count('heart'));
    add('half', geo('qp:heart-half'), count('half'));
    add('key', geo('qp:key'), count('key'));
    add('p-thunder', geo('qp:thunder'), count('power', 'thunder'));
    add('p-shield', geo('qp:gem-blue'), count('power', 'shield'));
    add('p-magnet', magnetGeo(), count('power', 'magnet'));
    add('p-spring', geo('qp:arrow'), count('power', 'spring'));
    add('orb', new THREE.SphereGeometry(1, 18, 12), count('power'), { shadows: false, colors: true, mat: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x404040, transparent: true, opacity: 0.35, depthWrite: false }) });
    // the enemies: a clone of their file each (shared geometry), their own clips
    for (const f of c.foes) this.foeViews.push(this.makeFoe(f, root));
    // "?" blocks (a used one turns to the plain dark cube)
    for (const bn of c.bonuses) {
      const mesh = new THREE.Mesh(geo('qp:c-question'), this.lit);
      mesh.castShadow = true;
      mesh.scale.setScalar(0.6);
      mesh.position.set(bn.x, bn.y, bn.z);
      root.add(mesh);
      this.bonusMeshes.push({ mesh, used: false });
    }
    this.flag = null;
  }

  private makeFoe(f: Foe, root: THREE.Object3D): FoeView {
    let mat = this.foeMats.get(f.kind);
    if (!mat) { mat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.foeMats.set(f.kind, mat); }
    const fig = model(rigKey(f.kind), { shadows: true });
    fig.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat!; this.shared.add(m.geometry); } });
    fig.scale.setScalar(FOE_SCALE[f.kind]);
    const g = new THREE.Group();
    g.add(fig);
    root.add(g);
    const mixer = new THREE.AnimationMixer(fig);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const c of modelClips(rigKey(f.kind))) {
      const a = mixer.clipAction(c);
      if (c.name === 'Death' || c.name === 'Jump') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions.set(c.name, a);
    }
    const arrow = new THREE.Mesh(geo('qp:arrow'), this.lit);
    arrow.scale.setScalar(0.45);
    arrow.rotation.set(0, 0, -Math.PI / 2);
    arrow.visible = false;
    g.add(arrow);
    const v: FoeView = { f, g, mixer, actions, clip: '', arrow, phase: Math.random() * 3 };
    playFoe(v, f.kind === 'bee' ? 'Flying' : 'Walk');
    mixer.update(v.phase);
    return v;
  }

  private decorInto(M: Merger, key: string, x: number, y: number, z: number, rot: number, s: number, tint?: number): void {
    // a saw's slot in the ground: a dark groove `s` long, across x (rot 0) or along z
    if (key === 'px:groove') { const L = s / 2; if (rot) M.box(x - 0.1, y - 0.04, z - L, x + 0.1, y + 0.015, z + L, 0x3a3230, 0x2a2422); else M.box(x - L, y - 0.04, z - 0.1, x + L, y + 0.015, z + 0.1, 0x3a3230, 0x2a2422); return; }
    if (key === 'px:gallows') return; // drawn with its pendulum
    // the pack's trees and bushes take each world's tint
    M.add(geo(key), place(x, y, z, rot, s), tint ?? (key === 'qp:tree' || key === 'qp:bush' ? TREE_TINT[this.course!.world] : undefined));
  }

  /** Islands far off the course: trees, rocks, a tower in the storm (scenery only). */
  private farIslands(M: Merger, c: Course, r: () => number): void {
    const end = c.goal.z;
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (22 + r() * 30), z = 10 + (end - 30) * (i / 13) + r() * 10, y = -6 + r() * 12;
      const w = 5 + r() * 7, d = 5 + r() * 7;
      tileIsland(M, { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: y - 2 - Math.floor(r() * 3) * 2, y1: y }, c.world, 'ground');
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) M.add(geo(c.world === 'canyon' && k === 0 ? 'qp:rock-tall' : 'qp:tree'), place(x + (r() - 0.5) * (w - 2), y, z + (r() - 0.5) * (d - 2), r() * 6, c.world === 'canyon' && k === 0 ? 0.7 : 0.4 + r() * 0.15), TREE_TINT[c.world]);
      if (c.world === 'storm' && i % 4 === 1) M.add(geo('qp:tower'), place(x, y, z, r() * 6, 0.45));
      if (c.world === 'canyon' && i % 3 === 0) M.add(geo('qp:cannon'), place(x, y, z, r() * 6, 0.5));
    }
  }

  /** Frees the stage's meshes (not the cached model geometries, which every build shares). */
  clear(): void {
    if (!this.stage) return;
    const shared = new Set<THREE.BufferGeometry>();
    for (const i of this.inst.values()) if (i.mesh.geometry.userData.shared !== false) shared.add(i.mesh.geometry);
    this.stage.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
      if (!isCached(m.geometry) && !this.shared.has(m.geometry) && !isKitGeo(m.geometry)) m.geometry.dispose();
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).skeleton.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat !== this.lit && ![...this.foeMats.values()].includes(mat as THREE.MeshLambertMaterial)) mat.dispose();
    });
    this.world.scene.remove(this.stage);
    this.stage = null;
    this.inst.clear();
    this.floes = []; this.panels = []; this.lids = []; this.handles = []; this.numbers = []; this.frames = null;
    for (const v of this.foeViews) v.mixer.stopAllAction();
    this.foeViews = []; this.bonusMeshes = [];
    this.fx.clear();
    void shared;
  }

  // ---------------------------------------------------------------- per frame

  /** Draws the sim's state; `dt` the frame time (animations, camera). */
  sync(sim: Sim, dt: number, o: { camera?: 'follow' | 'preview' | 'intro'; introT?: number } = {}): void {
    this.time += dt;
    const c = sim.c, t = this.time;
    this.mixer.update(dt);
    this.fx.update(dt);
    // floes
    for (const f of this.floes) {
      const b = f.s.b, cr = f.s.crumble;
      let x = (b.x0 + b.x1) / 2, y = b.y1, z = (b.z0 + b.z1) / 2;
      if (cr) {
        const rb = cr.rest;
        x = (rb.x0 + rb.x1) / 2; y = rb.y1 + cr.fallY; z = (rb.z0 + rb.z1) / 2;
        if (cr.state === 'shake') { x += Math.sin(t * 60) * 0.05 * (cr.stand / 0.55 + 0.3); z += Math.cos(t * 53) * 0.04; }
        f.mesh.visible = cr.state !== 'fall' || cr.fallY > -25;
        if (cr.state === 'idle' && cr.back <= 0) f.mesh.scale.setScalar(Math.min(1, f.mesh.scale.x + dt * 3));
        if (cr.state === 'fall' && cr.fallY < -24) f.mesh.scale.setScalar(0.01);
      }
      f.mesh.position.set(x, y, z);
    }
    // gates (the leaf swings on its hinge), chests (the lid opens), levers (the handle flips)
    this.panels.forEach((m, i) => {
      const d = c.doors[i];
      m.matrix.copy(place(d.x, d.y, d.z, 0, S.door)).multiply(partRest('door', 'door')).multiply(rotY(-easeInOut(d.open) * 1.85));
      m.matrixWorldNeedsUpdate = true;
    });
    if (this.frames) {
      const h = sim.hero;
      const near = c.doors.some((d) => Math.abs(h.z - d.z) < 2.6 && Math.abs(h.x - d.x) < 3);
      const mat = this.frames.material as THREE.MeshLambertMaterial;
      mat.opacity += ((near ? 0.35 : 1) - mat.opacity) * Math.min(1, dt * 8);
      mat.depthWrite = mat.opacity > 0.95;
    }
    this.lids.forEach((m, i) => {
      const ch = c.chests[i];
      m.matrix.copy(place(ch.x, ch.y, ch.z, ch.rot, S.chest)).multiply(partRest('chest', 'lid')).multiply(rotX(-easeOutBack(ch.open) * 2.86));
      m.matrixWorldNeedsUpdate = true;
    });
    this.handles.forEach((m, i) => {
      const l = c.levers[i];
      m.matrix.copy(place(l.x, l.y, l.z, l.rot, S.lever)).multiply(partRest('lever', 'handle')).multiply(rotZ(-l.t * 1.06));
      m.matrixWorldNeedsUpdate = true;
    });
    this.numbers.forEach((n, i) => {
      const cp = c.checkpoints[i];
      if (cp.on && !n.on) { n.on = true; n.mat.color.setHex(0xffd84a); n.mat.emissive.setHex(0x5a3a00); }
      const spin = n.on ? t * 2.2 : Math.sin(t * 1.3 + i) * 0.4;
      n.mesh.position.set(cp.x, cp.y + 0.62 + 0.08 + Math.sin(t * 2 + i) * 0.06, cp.z);
      n.mesh.rotation.set(0, spin, 0);
      n.mesh.scale.setScalar(S.checkNumber);
    });
    // instanced hazards
    const I = (k: string) => this.inst.get(k);
    const saw = I('saw');
    if (saw) { saw.begin(); for (const s of c.saws) saw.put(s.x, s.y, s.z, s.normal === 'z' ? 0 : 0, s.normal === 'z' ? 0 : Math.PI / 2, -s.spin, S.saw * (s.r / (1.5 * S.saw)), 'YXZ'); saw.end(); }
    const sp = I('spikes'), wn = I('warn');
    if (sp && wn) {
      sp.begin(); wn.begin();
      for (const s of c.traps) {
        const shake = s.state === 'warn' ? Math.sin(t * 70) * 0.03 : 0;
        sp.putM(place(s.x + shake, trapBase(s.y), s.z, 0, S.trap).multiply(partRest('spike-trap', 'spikes')).multiply(lift(s.lift * 0.498)));
        const k = wn.put(s.x, s.y + 0.03, s.z, 0, 0, 0, s.half * 1.9);
        wn.color(k, s.state === 'up' ? 0xff3a2a : s.state === 'warn' ? (Math.sin(t * 30) > 0 ? 0xff7a2a : 0xffd23a) : 0x1a1a1a);
      }
      sp.end(); wn.end();
    }
    const pil = I('pillar');
    if (pil) { pil.begin(); for (const p of c.pillars) pil.put(p.x, p.y, p.z, 0, p.spin, 0, S.pillar); pil.end(); }
    const lg = I('log');
    if (lg) { lg.begin(); for (const r of c.rollers) for (const l of r.logs) lg.put(r.x - (3.88 * S.roller) / 2, l.y + r.r, l.z, l.spin, 0, -Math.PI / 2, new THREE.Vector3(S.roller, (r.len / 3.88), S.roller), 'XYZ'); lg.end(); }
    const can = I('cannon');
    if (can) {
      can.begin();
      for (const k of c.cannons) {
        const pulse = 1 + k.charge * 0.08 * (0.5 + 0.5 * Math.sin(t * 40));
        const back = k.recoil * 0.35;
        can.put(k.x - Math.sin(k.yaw) * back, k.y + 0.94 * S.cannon, k.z - Math.cos(k.yaw) * back, 0, k.yaw - Math.PI / 2, 0, S.cannon * pulse);
        if (k.charge > 0.2 && Math.random() < 0.5) this.fx.sparks(k.x - Math.sin(k.yaw) * 0.6, k.y + 1.9, k.z - Math.cos(k.yaw) * 0.6, 1, [0xffd23a, 0xff7a2a], 1.5, 2, 0.05);
      }
      can.end();
    }
    const ball = I('ball');
    if (ball) { ball.begin(); for (const b of c.balls) ball.put(b.x, b.y, b.z, 0, 0, 0, S.ball); ball.end(); }
    const bomb = I('bomb'), ring = I('ring');
    if (bomb && ring) {
      bomb.begin(); ring.begin();
      for (const b of c.bombs) {
        if (b.state === 'gone') continue;
        const lit = b.state === 'lit';
        const flash = lit && Math.sin(t * (10 + b.t * 14)) > 0;
        const sc = S.bomb * (lit ? 1 + 0.12 * Math.sin(t * 30) : 1);
        const k = bomb.put(b.x, b.y, b.z, 0, b.home[0] * 3, 0, sc);
        bomb.color(k, flash ? 0xff5a4a : 0xffffff);
        if (lit) { const kr = ring.put(b.x, b.y + 0.04, b.z, 0, 0, 0, 2.2 * Math.min(1, b.t / 0.4)); ring.color(kr, flash ? 0xff3a2a : 0xffb02a); }
        if (lit && Math.random() < 0.6) this.fx.sparks(b.x, b.y + 1.0, b.z, 1, [0xffe36a, 0xff7a2a], 1.2, 2, 0.04);
      }
      for (const d of c.droppers) if (d.warn > 0) { const kr = ring.put(d.x, d.ground + 0.04, d.z, 0, 0, 0, 0.4 + d.warn * 1.5); ring.color(kr, Math.sin(t * 25) > 0 ? 0xff3a2a : 0xffd23a); }
      bomb.end(); ring.end();
    }
    const spk = I('spiky'), ch = I('chain');
    if (spk) {
      spk.begin(); ch?.begin();
      for (const p of c.pendulums) {
        spk.put(p.x, p.y, p.z, t, t * 0.7, 0, S.spiky);
        if (ch) ch.put((p.px + p.x) / 2, (p.py + p.y) / 2 + 0.2, (p.pz + p.z) / 2, p.axis === 'z' ? -p.ang : 0, 0, p.axis === 'x' ? p.ang : 0, new THREE.Vector3(1, p.len - 0.4, 1));
      }
      for (const o of c.orbiters) for (const b of o.balls) spk.put(b.x, b.y, b.z, t * 2, t, 0, S.spiky * 0.95);
      spk.end(); ch?.end();
    }
    const spr = I('spring'), top = I('top');
    if (spr && top) {
      spr.begin(); top.begin();
      for (const b of c.bouncers) {
        const sq = Math.sin(b.squash * Math.PI) * 0.45 + Math.sin(t * 3) * 0.02;
        spr.putM(place(b.x, b.y, b.z, 0, S.bouncer).multiply(partRest('bouncer', 'spring')).multiply(squashY(1 - sq)));
        top.putM(place(b.x, b.y, b.z, 0, S.bouncer).multiply(lift(-0.97 * sq)).multiply(partRest('bouncer', 'top')));
      }
      spr.end(); top.end();
    }
    this.syncFoes(dt, t);
    this.bonusMeshes.forEach((b, i) => {
      const bn = c.bonuses[i];
      if (bn.used && !b.used) { b.used = true; b.mesh.geometry = geo('qp:c-default'); }
      b.mesh.position.y = bn.y + Math.sin(bn.bump * Math.PI) * 0.25;
      b.mesh.rotation.y = bn.used ? 0 : Math.sin(t * 1.5 + i) * 0.15;
    });
    this.syncPickups(sim, t);
    this.syncHero(sim.hero, dt, t, sim);
    this.syncCamera(sim, dt, o.camera ?? 'follow', o.introT ?? 0);
  }

  private syncFoes(dt: number, t: number): void {
    for (const v of this.foeViews) {
      const f = v.f;
      v.mixer.update(dt);
      v.g.position.set(f.x, f.y, f.z);
      let d = f.yaw - v.g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.g.rotation.y += d * Math.min(1, dt * 10);
      v.arrow.visible = f.state === 'alert';
      if (v.arrow.visible) { v.arrow.position.set(0, FOE_TOP[f.kind] + 0.35 + Math.abs(Math.sin(t * 12)) * 0.15, 0); v.arrow.rotation.y = -v.g.rotation.y + t * 3; }
      if (f.state === 'dead') {
        playFoe(v, 'Death', 0.05);
        const k = Math.max(0, 1 - Math.max(0, f.t - 0.9) / 0.3);
        v.g.scale.setScalar(k);
        v.g.visible = k > 0.01;
        continue;
      }
      if (f.kind === 'bee') playFoe(v, f.state === 'alert' ? 'Bite_Front' : 'Flying', 0.1, f.state === 'swoop' ? 2 : 1);
      else if (f.kind === 'skull') playFoe(v, f.state === 'hop' ? 'Jump' : 'Idle', 0.08);
      else if (f.kind === 'gob') playFoe(v, f.state === 'alert' ? 'No' : f.state === 'rest' ? 'Idle' : 'Walk', 0.1, f.state === 'charge' ? 2.4 : 1);
      else playFoe(v, 'Walk', 0.1, 1.5);
      // the gob's charge kicks up dust
      if (f.state === 'charge' && Math.random() < 0.4) this.fx.dust(f.x, f.y, f.z, 1, 0xe8dcc0, 1);
    }
  }

  private syncPickups(sim: Sim, t: number): void {
    const keys = ['coin', 'gem-green', 'gem-blue', 'gem-pink', 'star', 'heart', 'half', 'key', 'p-thunder', 'p-shield', 'p-magnet', 'p-spring', 'orb'];
    for (const k of keys) this.inst.get(k)?.begin();
    for (const p of sim.c.pickups) {
      if (p.taken) continue;
      const bob = p.pull ? 0 : Math.sin(t * 2.6 + p.bob) * 0.12;
      const spin = t * 2.2 + p.bob;
      switch (p.kind) {
        case 'coin': this.inst.get('coin')?.put(p.x, p.y + bob, p.z, 0, spin * 1.3, 0, 0.72); break;
        case 'gem': this.inst.get('gem-' + p.gem)?.put(p.x, p.y + bob, p.z, 0, spin, 0, 0.72); break;
        case 'star': this.inst.get('star')?.put(p.x, p.y + bob, p.z, 0, spin, 0, 1.0 + Math.sin(t * 5) * 0.06); if (Math.random() < 0.08) this.fx.glint(p.x, p.y, p.z, 0xffd84a, 2); break;
        case 'heart': this.inst.get('heart')?.put(p.x, p.y + bob, p.z, 0, spin, 0, 0.8); break;
        case 'half': this.inst.get('half')?.put(p.x, p.y + bob, p.z, 0, spin, 0, 0.75); break;
        case 'key': this.inst.get('key')?.put(p.x, p.y + bob, p.z, 0, spin, 0.4, 0.85); break;
        case 'power': {
          const id = p.power!;
          const k = this.inst.get('orb')?.put(p.x, p.y + bob, p.z, 0, 0, 0, 0.62 + Math.sin(t * 4 + p.bob) * 0.04) ?? -1;
          this.inst.get('orb')?.color(k, POWER_COLOR[id]);
          if (id === 'thunder') this.inst.get('p-thunder')?.put(p.x, p.y + bob, p.z, 0, spin, 0, 0.62);
          if (id === 'shield') this.inst.get('p-shield')?.put(p.x, p.y + bob, p.z, 0, spin, 0, 0.6);
          if (id === 'magnet') this.inst.get('p-magnet')?.put(p.x, p.y + bob, p.z, 0, spin, 0, 0.5);
          if (id === 'spring') this.inst.get('p-spring')?.put(p.x, p.y + bob, p.z, 0, spin, -Math.PI / 2, 0.42);
          break;
        }
      }
    }
    for (const k of keys) this.inst.get(k)?.end();
  }

  // ---------------------------------------------------------------- the hero

  private play(name: string, fade = 0.12, speed = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.clip === name) return;
    const prev = this.actions.get(this.clip);
    a.reset().play();
    if (prev) a.crossFadeFrom(prev, fade, false);
    this.clip = name;
  }

  /** The hero's look this frame (clips, squash, blink, glow, bubble, blob). */
  private syncHero(h: Hero, dt: number, t: number, sim: Sim): void {
    this.hero.position.set(h.x, h.y, h.z);
    // turn smoothly to face the way it moves
    let d = h.yaw - this.faceYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.faceYaw += d * Math.min(1, dt * 14);
    this.body.rotation.y = this.faceYaw;
    // clips from the state (the pack's own: Run, Walk, Idle, Jump, Jump_Idle, Jump_Land, HitReact, Death, Yes)
    const sp = h.speed;
    if (h.state === 'dead') this.play('Death', 0.1);
    else if (h.state === 'goal') this.play('Yes', 0.15);
    else if (h.hurtT > MOVE_HURT - 0.35 && h.powers.thunder <= 0) this.play('HitReact', 0.05);
    else if (h.dashT > 0) this.play('Run', 0.05, 1.8);
    else if (!h.ground) this.play(h.vy > 2 && h.airT < 0.3 ? 'Jump' : 'Jump_Idle', 0.1);
    else if (this.landT > 0 && sp < 0.5) this.play('Jump_Land', 0.06);
    else if (sp > 4.2) this.play('Run', 0.12, sp / 6.4);
    else if (sp > 0.5) this.play('Walk', 0.12, 0.7 + sp / 3.2);
    else this.play('Idle', 0.2);
    this.landT = Math.max(0, this.landT - dt);
    // squash on landing, stretch on take-off
    if (sim.events.some((e) => e.e === 'land')) { this.squash = Math.min(1, h.landV / 18); this.landT = 0.25; }
    if (sim.events.some((e) => e.e === 'jump' || e.e === 'airjump' || e.e === 'bounce')) this.stretch = 1;
    this.squash = Math.max(0, this.squash - dt * 5);
    this.stretch = Math.max(0, this.stretch - dt * 4);
    const sy = 1 - this.squash * 0.28 + this.stretch * 0.14, sx = 1 + this.squash * 0.18 - this.stretch * 0.07;
    this.body.scale.set(sx, sy, sx);
    // the dash leans forward
    this.body.rotation.x = h.dashT > 0 ? -0.35 : 0;
    // blinking after a hit, glowing in Thunder
    const blink = h.hurtT > 0 && h.powers.thunder <= 0 && h.state === 'play' && Math.floor(t * 16) % 2 === 0;
    this.figure.visible = !blink;
    const glow = h.powers.thunder > 0 ? 0.35 + 0.25 * Math.sin(t * 20) : 0;
    for (const m of this.heroMats) m.emissive.setRGB(glow, glow * 0.85, glow * 0.2);
    if (h.powers.thunder > 0 && Math.random() < 0.8) this.fx.sparks(h.x, h.y + 0.6, h.z, 1, [0xffe36a, 0xffffff], 1.5, 1.5, 0.06);
    if (h.powers.magnet > 0 && Math.random() < 0.3) this.fx.spawn(h.x + Math.cos(t * 6) * 0.7, h.y + 0.7, h.z + Math.sin(t * 6) * 0.7, 0, 0.5, 0, 0.07, 0.4, POWER_COLOR.magnet);
    if (h.powers.spring > 0 && Math.random() < 0.3) this.fx.spawn(h.x, h.y + 0.05, h.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.07, 0.4, POWER_COLOR.spring);
    // the bubble
    this.bubble.visible = h.shield && h.state !== 'dead';
    if (this.bubble.visible) this.bubble.scale.setScalar(0.95 + Math.sin(t * 6) * 0.03);
    // the blob shadow on whatever is under the feet
    const g = groundUnder(sim.c.solids, h.x, h.z, h.y + 0.2);
    this.blob.visible = g !== null && h.state !== 'fall';
    if (g !== null) {
      const hgt = Math.max(0, h.y - g);
      this.blob.position.set(h.x, g + 0.03, h.z);
      const k = Math.max(0.35, 1 - hgt / 6);
      this.blob.scale.setScalar(k);
      (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    }
    this.hero.visible = h.state !== 'fall' || h.stateT > 0.35;
  }

  // ---------------------------------------------------------------- the camera

  shake(amount: number): void { this.cam.shake = Math.max(this.cam.shake, amount); }

  /** Snaps the camera behind the hero (stage start, respawn). */
  snap(sim: Sim): void {
    const h = sim.hero;
    this.cam.x = h.x; this.cam.y = h.y; this.cam.z = h.z; this.cam.gy = h.y;
  }

  private syncCamera(sim: Sim, dt: number, mode: 'follow' | 'preview' | 'intro', introT: number): void {
    const cam = this.world.camera, h = sim.hero, c = sim.c;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.5);
    if (this.shotCam) {
      cam.position.set(this.shotCam[0][0], this.shotCam[0][1], this.shotCam[0][2]);
      cam.lookAt(this.shotCam[1][0], this.shotCam[1][1], this.shotCam[1][2]);
      this.world.followSun(new THREE.Vector3(this.shotCam[1][0], this.shotCam[1][1], this.shotCam[1][2]));
      this.sky.position.copy(cam.position);
      return;
    }
    if (mode === 'preview') {
      // a slow sweep over the stage from the side, the course on the right half of the screen
      const midZ = (c.start.z + c.goal.z) / 2, len = Math.abs(c.goal.z - c.start.z);
      const a = this.time * 0.08;
      const fz = midZ + Math.sin(a) * len * 0.3;
      cam.position.set(-16 - Math.cos(a) * 3, 14 + len * 0.05, fz + 18);
      cam.lookAt(-4, 0, fz - 6);
      this.world.followSun(new THREE.Vector3(0, 0, fz));
      this.sky.position.copy(cam.position);
      return;
    }
    // the ground the hero last stood on keeps the camera level through jumps
    if (h.ground || h.state !== 'play') this.cam.gy = h.y;
    else if (h.y < this.cam.gy - 1) this.cam.gy = h.y + 1;
    else if (h.y > this.cam.gy + 3.2) this.cam.gy = h.y - 3.2;
    const kx = 1 - Math.exp(-dt * 7), ky = 1 - Math.exp(-dt * 3.5), kz = 1 - Math.exp(-dt * 7);
    this.cam.x += (h.x - this.cam.x) * kx;
    this.cam.y += (this.cam.gy - this.cam.y) * ky;
    this.cam.z += (h.z - this.cam.z) * kz;
    let px = this.cam.x * 0.9, py = this.cam.y + 6.1, pz = this.cam.z + 9.4;
    let lx = this.cam.x * 0.95, ly = this.cam.y + 0.7, lz = this.cam.z - 3.8;
    if (mode === 'intro') {
      // from high over the goal back down the course to the hero
      const k = easeInOut(Math.min(1, introT));
      const gx = c.goal.x, gz = c.goal.z;
      px = lerp(gx + 6, px, k); py = lerp(c.goal.y + 16, py, k); pz = lerp(gz + 10, pz, k);
      lx = lerp(gx, lx, k); ly = lerp(c.goal.y, ly, k); lz = lerp(gz - 2, lz, k);
    }
    const s = this.cam.shake * this.cam.shake;
    cam.position.set(px + (Math.random() - 0.5) * s * 0.6, py + (Math.random() - 0.5) * s * 0.6, pz);
    cam.lookAt(lx, ly, lz);
    this.world.followSun(new THREE.Vector3(h.x, h.y, h.z - 4));
    this.sky.position.copy(cam.position);
    this.clouds.position.x = Math.sin(this.time * 0.02) * 4;
  }

  /** A world point on screen (game pixels). */
  screen(x: number, y: number, z: number): { x: number; y: number } { return this.world.toScreen(new THREE.Vector3(x, y, z)); }

  /** Compiles every shader of the stage ahead (the first frames do not stall). */
  warm(): void { this.world.renderer.compile(this.world.scene, this.world.camera); }

  stats(): { calls: number; triangles: number } {
    const i = this.world.renderer.info.render;
    return { calls: i.calls, triangles: i.triangles };
  }

  dispose(): void { this.clear(); }
}

// ------------------------------------------------------------------ enemies

interface FoeView { f: Foe; g: THREE.Group; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; clip: string; arrow: THREE.Mesh; phase: number }
/** The pack's enemies at game size (crab 0.75 m, skull 0.72, gob 0.81, bee 0.85 tall). */
const FOE_SCALE: Record<FoeKind, number> = { crab: 0.5, skull: 0.5, gob: 0.5, bee: 0.45 };
const FOE_TOP: Record<FoeKind, number> = { crab: 0.8, skull: 0.75, gob: 0.85, bee: 0.9 };

function playFoe(v: FoeView, name: string, fade = 0.12, speed = 1): void {
  const a = v.actions.get(name);
  if (!a) return;
  a.timeScale = speed;
  if (v.clip === name) return;
  const prev = v.actions.get(v.clip);
  a.reset().play();
  if (prev) a.crossFadeFrom(prev, fade, false);
  v.clip = name;
}

// ------------------------------------------------------------------ geometry makers

const cached = new WeakSet<THREE.BufferGeometry>();
function isCached(g: THREE.BufferGeometry): boolean { return cached.has(g); }
function keep<T extends THREE.BufferGeometry>(g: T): T { cached.add(g); return g; }
let warnG: THREE.BufferGeometry | null = null, ringG: THREE.BufferGeometry | null = null, chainG: THREE.BufferGeometry | null = null, magG: THREE.BufferGeometry | null = null;
const warnGeo = () => (warnG ??= keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)));
const ringGeo = () => (ringG ??= keep(new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2)));
const chainGeo = () => (chainG ??= keep(new THREE.CylinderGeometry(0.05, 0.05, 1, 6)));
/** The magnet power's icon: a red horseshoe with silver tips. */
function magnetGeo(): THREE.BufferGeometry {
  if (magG) return magG;
  const m = new Merger();
  const arc = new THREE.TorusGeometry(0.7, 0.24, 8, 16, Math.PI);
  m.add(arc, new THREE.Matrix4(), 0xe0303a, true);
  for (const x of [-0.7, 0.7]) { const leg = new THREE.CylinderGeometry(0.24, 0.24, 0.6, 8); m.add(leg, new THREE.Matrix4().makeTranslation(x, -0.3, 0), 0xe0303a, true); const tip = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8); m.add(tip, new THREE.Matrix4().makeTranslation(x, -0.75, 0), 0xdde4ec, true); leg.dispose(); tip.dispose(); }
  arc.dispose();
  return (magG = keep(m.build()));
}
// the cached model geometries (kit.geo) are shared too
const origGeo = geo;
void origGeo;

/** A soft round shadow texture. */
function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** The top of the highest solid under (x, z) at or below y, or null over the void. */
export function groundUnder(solids: Solid[], x: number, z: number, y: number): number | null {
  let best: number | null = null;
  for (const s of solids) {
    if (s.off) continue;
    const b = s.b;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= y && (best === null || b.y1 > best)) best = b.y1;
  }
  return best;
}

/** How each world colours the pack's platform pieces: the grass (replaced) and the earth (multiplied). */
const TILE_LOOK: Record<string, { dirt: boolean; top?: number; body?: number }> = {
  meadow: { dirt: false },
  canyon: { dirt: true },
  frost: { dirt: false, top: 0xf2f8ff, body: 0xc4d4f0 },
  storm: { dirt: false, top: 0x6a9446, body: 0xc0b0dc },
};

/**
 * A floating island built from the pack's modular platform pieces on its 2 m grid: corner, side
 * and centre pieces on top (the tall set's top layer when the island is deep), the tall set's
 * middle and bottom layers under them; a single cube when the island is one cell. The pieces are
 * stretched a little to fit the island's box; the grass is recoloured per world (snow, moss, ice).
 */
function tileIsland(M: Merger, b: Box, world: string, surf: string): void {
  const L = TILE_LOOK[world] ?? TILE_LOOK.meadow;
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  const nx = Math.max(1, Math.round(w / 2)), nz = Math.max(1, Math.round(d / 2));
  const sx = w / (2 * nx), sz = d / (2 * nz);
  const layers = Math.max(1, Math.min(3, Math.round((b.y1 - b.y0) / 2)));
  const top = surf === 'ice' ? ICE_TOP : L.top;
  const put = (key: string, i: number, k: number, layer: number, rot: number) => {
    const x = b.x0 + (i + 0.5) * 2 * sx, z = b.z0 + (k + 0.5) * 2 * sz, y = b.y1 - 1 - layer * 2;
    // a hair larger than the cell, so neighbouring pieces overlap and no seam shows
    const m = new THREE.Matrix4().compose(tv.set(x, y, z), tq.setFromAxisAngle(UP, rot), ts.set(sx * 1.012, 1, sz * 1.012));
    if (key.includes('-g-') || key === 'c-grass') {
      M.add(geo(`qp:${key}#top`), m, top, top !== undefined);
      M.add(geo(`qp:${key}#body`), m, L.body);
    } else M.add(geo('qp:' + key), m, L.body);
  };
  if (nx === 1 || nz === 1) {
    // a row of single cubes (stepping stones, narrow paths)
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) put(L.dirt ? 'c-dirt' : 'c-grass', i, k, 0, 0);
    return;
  }
  // a solid core under the pieces: the grooves between their rounded grass edges show dark, not the sky
  const groove = shade(top ?? (L.dirt ? 0x7a3a1a : 0x4f6a0a), -0.45);
  M.box(b.x0 + 0.06, b.y1 - layers * 2 + 0.1, b.z0 + 0.06, b.x1 - 0.06, b.y1 - 0.04, b.z1 - 0.06, groove, 0x5a3418, 0x3a2410);
  const set = layers > 1 ? 'tt' : 't', g = L.dirt ? 'd' : 'g';
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const W = i === 0, E = i === nx - 1, N = k === 0, Sth = k === nz - 1;
    // corner pieces face -x and +z at rest; side pieces face +z
    let kind = 'center', rot = 0;
    if (W && Sth) { kind = 'corner'; rot = 0; } else if (E && Sth) { kind = 'corner'; rot = Math.PI / 2; }
    else if (E && N) { kind = 'corner'; rot = Math.PI; } else if (W && N) { kind = 'corner'; rot = -Math.PI / 2; }
    else if (Sth) { kind = 'side'; rot = 0; } else if (E) { kind = 'side'; rot = Math.PI / 2; }
    else if (N) { kind = 'side'; rot = Math.PI; } else if (W) { kind = 'side'; rot = -Math.PI / 2; }
    put(`${set}-${g}-${kind}`, i, k, 0, rot);
    for (let l = 1; l < layers; l++) {
      const bottom = l === layers - 1;
      if (kind === 'center') { if (bottom) put('tb-center', i, k, l, 0); continue; }
      put(`${bottom ? 'tb' : 'tm'}-${kind}`, i, k, l, rot);
    }
  }
}

/** The frame a pendulum hangs from: two posts beside the planks and a beam across. */
function gallowsInto(M: Merger, x: number, y: number, z: number): void {
  const base = y - 4.6;
  for (const sx of [-1.55, 1.55]) M.box(x + sx - 0.16, base - 0.6, z - 0.16, x + sx + 0.16, y + 0.25, z + 0.16, WOOD_TOP, WOOD_SIDE);
  M.box(x - 1.8, y + 0.05, z - 0.18, x + 1.8, y + 0.4, z + 0.18, WOOD_TOP, WOOD_SIDE);
  M.box(x - 0.14, y - 0.12, z - 0.14, x + 0.14, y + 0.06, z + 0.14, 0x5a5e64, 0x3a3e44);
}

function shade(c: number, k: number): number {
  tc.setHex(c);
  if (k > 0) tc.lerp(new THREE.Color(1, 1, 1), k); else tc.multiplyScalar(1 + k);
  return tc.getHex();
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOutBack = (k: number) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const rotX = (a: number) => new THREE.Matrix4().makeRotationX(a);
const rotY = (a: number) => new THREE.Matrix4().makeRotationY(a);
const rotZ = (a: number) => new THREE.Matrix4().makeRotationZ(a);
const lift = (y: number) => new THREE.Matrix4().makeTranslation(0, y, 0);
const squashY = (k: number) => new THREE.Matrix4().makeScale(1, k, 1);
/** A spike trap's base sits a hair above the ground it is set in. */
const trapBase = (ground: number) => ground + 0.04 - 0.53 * S.trap;
const easeInOut = (k: number) => k * k * (3 - 2 * k);
void UP;
