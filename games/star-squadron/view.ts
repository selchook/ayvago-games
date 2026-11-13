// Star Squadron: draws a run (sim.ts) in 3D. Ships of a kind share instanced meshes, every bullet,
// spark, flash and ring is an instanced billboard, the backdrop scrolls underneath. The Play scene
// and the menu's attract mode both use it, so the menu also compiles every shader the first Play
// frame needs (keepPrograms).
import Phaser from 'phaser';
import { World3D, THREE } from '@core/three';
import type { Sim, SimEvent, Boss, Enemy } from './sim';
import { ENEMIES, BOSSES, type EnemyKind, type BossKind } from './defs';
import {
  InstancedModel, Materials, buildModel, keepPrograms, PLAYER_PAL, ENEMY_PAL, BOSS_PAL, type SpaceModel, type Palette,
} from './kit';
import { Billboards, Particles, Debris, bubble, glowTex, orbTex, streakTex, ringTex, flareTex } from './fx3d';
import { Scenery, SKY } from './scenery';

export const CAM = { fov: 26, tilt: 48, dist: 38, lookZ: -6.6 };

const ENEMY_MODEL: Record<EnemyKind, [SpaceModel, number, number]> = {
  // model, scale, how many at once
  scout: ['craft_racer', 0.62, 40],
  fighter: ['craft_speederB', 0.72, 16],
  striker: ['craft_speederC', 0.56, 12],
  gunship: ['craft_speederD', 0.86, 8],
  bomber: ['craft_miner', 0.95, 6],
  carrier: ['craft_cargoA', 1.25, 4],
  rock: ['meteor', 1.75, 24],
  crystal: ['rock_crystalsLargeA', 1.9, 10],
};

/** Bullet colours: glow, by kind. */
const BULLET_GLOW = { orb: 0xff3d8b, needle: 0xff8a1f, big: 0xff2f4f, mine: 0xb05cff } as const;

const PICKUP_COL = { repair: 0x6dff8a, cell: 0x5ad1ff, charge: 0xc07cff, boost: 0xffa23f, credit: 0xffd23f } as const;

interface BossView {
  kind: BossKind;
  root: THREE.Group;
  hull: THREE.Group;
  parts: { root: THREE.Group; turret: THREE.Object3D | null; mats: THREE.MeshStandardMaterial[] }[];
  mats: THREE.MeshStandardMaterial[];
  armour: THREE.Mesh;
  deathT: number;
  gone: boolean;
}

export class View {
  readonly world: World3D;
  readonly scenery: Scenery;
  readonly particles: Particles;
  readonly debris: Debris;
  readonly camQ = new THREE.Quaternion();
  private mats = new Materials(true);
  private plainMats = new Materials(false);
  private enemies = new Map<EnemyKind, InstancedModel>();
  private ship: THREE.Group;
  private drones: InstancedModel;
  private shield: THREE.Mesh;
  private eGlow: Billboards;
  private eCore: Billboards;
  private pShots: Billboards;
  private glows: Billboards;
  private flares: Billboards;
  private rings: Billboards;
  private icons: Record<'repair' | 'cell' | 'charge' | 'boost', Billboards>;
  private coins: THREE.InstancedMesh;
  private boss: BossView | null = null;
  private bossKind: BossKind | null = null;
  private flashes: { x: number; y: number; z: number; s: number; t: number; max: number; c: number; flat: boolean }[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private camBase = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private time = 0;
  /** Scroll speed of the backdrop (world units / s). */
  speed = 5;
  /** The ship is shown (hidden after it blew up). */
  shipVisible = true;

  constructor(private phaser: Phaser.Scene, o: { menu?: boolean } = {}) {
    const world = new World3D(phaser, { fov: CAM.fov, near: 1, far: 260, background: SKY[0], shadows: false, fog: { color: SKY[0], near: 48, far: 125 } });
    this.world = world;
    // test hook: the shared renderer (shader warm-up check)
    (globalThis as { __ssRenderer?: THREE.WebGLRenderer }).__ssRenderer = world.renderer;
    world.addLights({ sky: 0xcfe0ff, ground: 0x3a2f4f, ambient: 1.6, sun: 0xffffff, intensity: 2.3, dir: [-0.5, 1, 0.35] });
    if (world.sun) world.sun.castShadow = false;
    const cam = world.camera;
    const a = THREE.MathUtils.degToRad(CAM.tilt);
    this.camBase.set(0, Math.sin(a) * CAM.dist, CAM.lookZ + Math.cos(a) * CAM.dist);
    cam.position.copy(this.camBase);
    cam.lookAt(0, 0, CAM.lookZ);
    cam.updateMatrixWorld();
    this.camQ.copy(cam.quaternion);
    const sc = world.scene;

    this.scenery = new Scenery(phaser, sc, this.camQ, this.plainMats);
    for (const k of Object.keys(ENEMY_MODEL) as EnemyKind[]) {
      const [key, scale, cap] = ENEMY_MODEL[k];
      this.enemies.set(k, new InstancedModel(sc, key, scale, ENEMY_PAL[k], this.mats, cap));
    }
    this.ship = buildModel('craft_speederA', 0.66, PLAYER_PAL, this.plainMats, true);
    sc.add(this.ship);
    this.drones = new InstancedModel(sc, 'craft_racer', 0.32, PLAYER_PAL, this.mats, 4);
    this.shield = bubble(0x5ad1ff);
    this.shield.scale.setScalar(1.5);
    this.shield.visible = false;
    sc.add(this.shield);

    const glow = glowTex();
    this.glows = new Billboards(sc, glow, 900, { order: 11 });
    this.eGlow = new Billboards(sc, glow, 340, { order: 20 });
    this.eCore = new Billboards(sc, orbTex(), 340, { additive: false, order: 21 });
    this.pShots = new Billboards(sc, streakTex(), 400, { order: 13 });
    this.flares = new Billboards(sc, flareTex(), 120, { order: 14 });
    this.rings = new Billboards(sc, ringTex(), 80, { flat: true, order: 9 });
    this.particles = new Particles(sc, glow);
    this.debris = new Debris(sc);
    this.icons = {
      repair: new Billboards(sc, iconTex('repair'), 16, { additive: false, order: 16 }),
      cell: new Billboards(sc, iconTex('cell'), 16, { additive: false, order: 16 }),
      charge: new Billboards(sc, iconTex('charge'), 16, { additive: false, order: 16 }),
      boost: new Billboards(sc, iconTex('boost'), 16, { additive: false, order: 16 }),
    };
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0x6a4300, metalness: 0.3, roughness: 0.35, flatShading: true });
    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 10), coinMat, 160);
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.count = 0;
    this.coins.frustumCulled = false;
    sc.add(this.coins);

    if (o.menu) {
      // every boss once, so its materials are compiled with the rest
      for (const k of Object.keys(BOSSES) as BossKind[]) this.buildBoss(k).root.visible = false;
      this.scenery.showAll(true);
      keepPrograms(world.renderer, sc, cam);
      this.scenery.showAll(false);
    }
  }

  /** Projects a world point to game pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(this.v.set(x, y, z));
    return { x: p.x, y: p.y };
  }

  shake(amp: number, t: number): void {
    if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = t; }
  }

  // ------------------------------------------------------------------ frame

  /** Draws the run as it is now. `dt` is real frame time (effects), `sdt` the sim's (may be slowed). */
  sync(sim: Sim, dt: number): void {
    this.time += dt;
    const cq = this.camQ;
    this.scenery.update(dt, this.speed, this.time);
    // the camera, shaking
    const cam = this.world.camera;
    cam.position.copy(this.camBase);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmp * Math.max(0, Math.min(1, this.shakeT * 4));
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k * 0.6;
      cam.position.z += (Math.random() - 0.5) * k;
    }

    this.syncShip(sim, dt);
    this.syncEnemies(sim);
    this.syncBoss(sim, dt);
    this.syncBullets(sim, cq);
    this.syncPickups(sim, cq);
    // glows and flashes
    this.glows.begin(cq);
    this.flares.begin(cq);
    this.rings.begin(cq);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.max) { this.flashes.splice(i, 1); continue; }
      const k = f.t / f.max;
      if (f.flat) this.rings.add(f.x, f.y, f.z, f.s * (0.2 + k), f.s * (0.2 + k), 0, f.c, 1 - k);
      else this.flares.add(f.x, f.y, f.z, f.s * (1 + k * 0.5), f.s * (1 + k * 0.5), k * 0.6, f.c, 1 - k * k);
    }
    this.drawEngines(sim);
    this.glows.end();
    this.flares.end();
    this.rings.end();
    this.particles.update(dt, cq);
    this.debris.update(dt);
  }

  private syncShip(sim: Sim, dt: number): void {
    const p = sim.player;
    const show = this.shipVisible && p.alive;
    this.ship.visible = show;
    if (show) {
      this.ship.position.set(p.x, 0.15 + Math.sin(this.time * 3) * 0.05, p.z);
      this.ship.rotation.set(0.12, 0, p.bank * 0.55);
      // blink while invulnerable
      this.ship.visible = !(p.inv > 0 && Math.floor(this.time * 18) % 2 === 0 && p.inv < 2.5);
      // engine trail
      if (Math.random() < 0.9) for (const sx of [-0.28, 0.28]) this.particles.emit(p.x + sx, 0.1, p.z + 0.75, (Math.random() - 0.5) * 0.4, 0, 3 + this.speed * 0.4, 0.28, 0.32, 0.05, sim.overdriveT > 0 ? 0xffc23f : 0x3fd0ff, 1);
    }
    this.shield.visible = show && sim.shieldT > 0;
    if (this.shield.visible) {
      this.shield.position.set(p.x, 0.2, p.z);
      const u = (this.shield.material as THREE.ShaderMaterial).uniforms;
      u.uT.value = this.time;
      u.uK.value = sim.shieldT < 1 ? (Math.floor(this.time * 10) % 2 ? 0.4 : 1) : 1;
    }
    this.drones.begin();
    if (show) {
      for (let i = 0; i < sim.stats.drones; i++) {
        const d = sim.dronePos(i);
        this.m.compose(this.v.set(d.x, 0.3, d.z), this.q.setFromEuler(this.e.set(0, 0, Math.sin(this.time * 4 + i) * 0.3)), this.s.set(1, 1, 1));
        this.drones.add(this.m, 0);
        if (Math.random() < 0.5) this.particles.emit(d.x, 0.25, d.z + 0.35, 0, 0, 3, 0.18, 0.18, 0.02, 0x5affd1, 1);
      }
    }
    this.drones.end();
    void dt;
  }

  private drawEngines(sim: Sim): void {
    const p = sim.player;
    if (!this.ship.visible || !p.alive) return;
    const fl = 0.85 + Math.random() * 0.3;
    const c = sim.overdriveT > 0 ? 0xffc23f : 0x48d8ff;
    for (const sx of [-0.28, 0.28]) {
      this.glows.add(p.x + sx, 0.15, p.z + 0.72, 0.55 * fl, 0.8 * fl, 0, c);
      this.glows.add(p.x + sx, 0.15, p.z + 0.68, 0.25 * fl, 0.35 * fl, 0, 0xffffff);
    }
    if (sim.boostT > 0) this.glows.add(p.x, 0.15, p.z, 2.2, 2.2, 0, 0xff8a1f, 0.25);
  }

  private syncEnemies(sim: Sim): void {
    for (const im of this.enemies.values()) im.begin();
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const im = this.enemies.get(e.kind)!;
      if (ENEMIES[e.kind].rock) {
        this.q.setFromEuler(this.e.set(e.t * e.spin, e.t * e.spin * 0.7 + e.phase, 0));
      } else {
        this.q.setFromEuler(this.e.set(0.1, Math.PI + e.yaw, -e.bank * 0.5));
      }
      this.m.compose(this.v.set(e.x, 0, e.z), this.q, this.s.set(1, 1, 1));
      let flash = e.flash;
      if (e.beh === 'kamikaze' && e.state === 1) flash = Math.max(flash, 0.5 + 0.5 * Math.sin(this.time * 30));
      im.add(this.m, flash * 0.85);
      // gameplay rocks get a warm rim glow, so they never read as backdrop
      if (ENEMIES[e.kind].rock) this.glows.add(e.x, -0.3, e.z, 2.6, 2.6, 0, e.kind === 'crystal' ? 0x2fd8b0 : 0xff9a5a, 0.35);
      // engine glow behind ships
      if (!ENEMIES[e.kind].rock) {
        const back = ENEMY_MODEL[e.kind][1] * 1.1;
        const bx = e.x - Math.sin(e.yaw) * back, bz = e.z - Math.cos(e.yaw) * back;
        this.glows.add(bx, 0.1, bz, 0.7 * ENEMY_MODEL[e.kind][1] + 0.3, 0.7 * ENEMY_MODEL[e.kind][1] + 0.3, 0, ENEMY_PAL[e.kind].accent, 0.8);
      }
    }
    for (const im of this.enemies.values()) im.end();
  }

  // ------------------------------------------------------------------ the boss

  private buildBoss(kind: BossKind): BossView {
    const pal = BOSS_PAL[kind];
    const mats = new Materials(false);
    const root = new THREE.Group();
    let hull: THREE.Group;
    if (kind === 'dread') {
      hull = buildModel('craft_cargoB', 2.2, pal, mats, true);
      hull.rotation.y = Math.PI;
      const core = buildModel('machine_generatorLarge', 1.6, pal, mats, true);
      core.position.set(0, 0.9, 0.6);
      hull.add(core);
    } else if (kind === 'hive') {
      hull = buildModel('hangar_roundGlass', 1.45, pal, mats, true);
    } else if (kind === 'fortress') {
      hull = new THREE.Group();
      const deck = buildModel('platform_large', 2.6, pal, mats, true);
      hull.add(deck);
      const dome = buildModel('hangar_roundA', 0.95, pal, mats, false);
      dome.position.y = 0.1;
      hull.add(dome);
      for (const s of [-1, 1]) {
        const dish = buildModel('satelliteDish_large', 1.4, pal, mats, false);
        dish.position.set(s * 1.4, 0.2, -1.9);
        hull.add(dish);
      }
    } else {
      hull = buildModel('craft_miner', 2.9, pal, mats, true);
      hull.rotation.y = Math.PI;
      const core = buildModel('machine_generatorLarge', 1.4, pal, mats, true);
      core.position.set(0, 1.0, 0.2);
      hull.add(core);
    }
    root.add(hull);
    const hullMats: THREE.MeshStandardMaterial[] = [];
    hull.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && !hullMats.includes(m)) hullMats.push(m); });
    const parts = BOSSES[kind].parts.map((p) => {
      const pm = new Materials(false);
      const g = buildModel(p.kind === 'turret' ? 'turret_double' : 'turret_single', p.kind === 'turret' ? 1.5 : 1.35, pal, pm, false);
      const prt = new THREE.Group();
      prt.add(g);
      root.add(prt);
      const ms: THREE.MeshStandardMaterial[] = [];
      g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && !ms.includes(m)) ms.push(m); });
      return { root: prt, turret: g.getObjectByName('turret') ?? null, mats: ms };
    });
    const armour = bubble(pal.accent, 0.7);
    armour.scale.set(BOSSES[kind].r * 1.5, BOSSES[kind].r * 0.8, BOSSES[kind].r * 1.5);
    root.add(armour);
    this.world.scene.add(root);
    for (const m of [...hullMats, ...parts.flatMap((p) => p.mats)]) m.userData.em = m.emissive.getHex();
    return { kind, root, hull, parts, mats: hullMats, armour, deathT: 0, gone: false };
  }

  private syncBoss(sim: Sim, dt: number): void {
    const b = sim.boss;
    if (!b) {
      if (this.boss) this.boss.root.visible = false;
      return;
    }
    if (!this.boss || this.bossKind !== b.kind) {
      if (this.boss) this.boss.root.visible = false;
      this.boss = this.cachedBoss(b.kind);
      this.bossKind = b.kind;
      this.boss.deathT = 0;
      this.boss.gone = false;
    }
    const v = this.boss;
    if (v.gone) { v.root.visible = false; return; }
    v.root.visible = true;
    v.root.position.set(b.x, 0, b.z);
    v.root.rotation.set(0, 0, Math.sin(b.t * 0.42 + 1) * 0.06);
    if (b.kind === 'hive') v.hull.rotation.y = b.t * 0.25;
    const flashMat = (ms: THREE.MeshStandardMaterial[], k: number) => {
      for (const m of ms) m.emissive.setHex(m.userData.em as number).lerp(WHITE, k * 0.4);
    };
    flashMat(v.mats, b.flash);
    b.parts.forEach((pt, i) => {
      const pv = v.parts[i];
      pv.root.visible = pt.alive;
      pv.root.position.set(pt.x - b.x, 0.25, pt.z - b.z);
      if (pv.turret) pv.turret.rotation.y = pt.aim + Math.PI * 0.5 * 0;
      else pv.root.rotation.y = pt.aim;
      flashMat(pv.mats, pt.flash);
    });
    const armoured = !b.dead && b.parts.some((p) => p.alive);
    v.armour.visible = armoured && !b.entering;
    if (v.armour.visible) {
      const u = (v.armour.material as THREE.ShaderMaterial).uniforms;
      u.uT.value = this.time;
      u.uK.value = 0.32 + b.flash * 0.25;
    }
    if (b.dead) {
      // a chain of blasts across the hull, then one big one
      v.deathT += dt;
      v.root.position.y = -v.deathT * 0.8;
      v.root.rotation.z = v.deathT * 0.25;
      if (Math.random() < dt * 14) {
        const x = b.x + (Math.random() - 0.5) * 4, z = b.z + (Math.random() - 0.5) * 3.5;
        this.explode(x, z, 0.9, BOSS_PAL[b.kind].accent);
      }
      if (v.deathT > 2.1) {
        v.gone = true;
        this.explode(b.x, b.z, 3.2, BOSS_PAL[b.kind].accent, true);
        this.shake(1.6, 0.9);
      }
    }
  }

  private bossCache = new Map<BossKind, BossView>();
  private cachedBoss(kind: BossKind): BossView {
    let v = this.bossCache.get(kind);
    if (!v) { v = this.buildBoss(kind); this.bossCache.set(kind, v); }
    v.root.position.y = 0;
    v.root.rotation.set(0, 0, 0);
    return v;
  }

  /** The boss's death animation has played out. */
  get bossGone(): boolean { return !this.boss || this.boss.gone; }

  // ------------------------------------------------------------------ bullets and pickups

  private syncBullets(sim: Sim, cq: THREE.Quaternion): void {
    this.eGlow.begin(cq);
    this.eCore.begin(cq);
    for (const b of sim.ebullets) {
      if (b.dead) continue;
      const pulse = b.kind === 'mine' ? 1 + 0.25 * Math.sin(b.t * 18) : 1;
      if (b.kind === 'needle') {
        const rot = Math.atan2(-b.vx, -b.vz);
        this.eGlow.add(b.x, 0.3, b.z, 0.55, 1.15, rot, BULLET_GLOW.needle);
        this.eCore.add(b.x, 0.32, b.z, 0.32, 0.6, rot, 0xffffff);
      } else {
        const s = b.r * 3.6 * pulse;
        this.eGlow.add(b.x, 0.3, b.z, s, s, 0, BULLET_GLOW[b.kind]);
        this.eCore.add(b.x, 0.32, b.z, b.r * 2.3, b.r * 2.3, 0, b.kind === 'mine' ? 0xe0c0ff : 0xffffff);
      }
    }
    this.eGlow.end();
    this.eCore.end();
    this.pShots.begin(cq);
    for (const s of sim.pbullets) {
      if (s.dead) continue;
      const rot = Math.atan2(-s.vx, -s.vz);
      if (s.kind === 'missile') {
        this.pShots.add(s.x, 0.3, s.z, 0.35, 0.8, rot, 0xff9a3c);
        if (Math.random() < 0.8) this.particles.emit(s.x, 0.3, s.z, -s.vx * 0.1, 0, -s.vz * 0.1, 0.35, 0.35, 0.1, 0xff7a2a, 2);
      } else if (s.kind === 'drone') {
        this.pShots.add(s.x, 0.3, s.z, 0.22, 0.8, rot, s.crit ? 0xfff0a0 : 0x5affd1);
      } else {
        const c = s.crit ? 0xfff3b0 : s.heavy ? 0xffb43a : 0x4fd8ff;
        const w = s.crit ? 0.42 : s.heavy ? 0.34 : 0.3;
        this.pShots.add(s.x, 0.3, s.z, w, s.crit ? 1.5 : 1.2, rot, c, s.crit ? 1 : 0.72);
      }
    }
    this.pShots.end();
  }

  private syncPickups(sim: Sim, cq: THREE.Quaternion): void {
    let n = 0;
    for (const ic of Object.values(this.icons)) ic.begin(cq);
    for (const k of sim.pickups) {
      if (k.dead) continue;
      if (k.kind === 'credit') {
        if (n >= 160) continue;
        this.m.compose(this.v.set(k.x, 0.35, k.z), this.q.setFromEuler(this.e.set(Math.PI / 2 - 0.5, 0, k.t * 6)), this.s.set(1, 1, 1));
        this.coins.setMatrixAt(n++, this.m);
        if (k.pulled && Math.random() < 0.3) this.particles.emit(k.x, 0.35, k.z, 0, 0, 0, 0.25, 0.25, 0.02, 0xffd27a, 0);
        this.glows.add(k.x, 0.3, k.z, 0.6, 0.6, 0, 0xffb020, 0.35);
      } else {
        const bob = 0.4 + Math.sin(k.t * 4) * 0.1;
        this.icons[k.kind].add(k.x, bob, k.z, 0.95, 0.95, 0, 0xffffff);
        this.glows.add(k.x, bob, k.z, 1.8, 1.8, 0, PICKUP_COL[k.kind], 0.5 + 0.2 * Math.sin(k.t * 6));
      }
    }
    for (const ic of Object.values(this.icons)) ic.end();
    this.coins.count = n;
    if (n) this.coins.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ effects

  flash(x: number, z: number, s: number, c: number, max = 0.25, y = 0.4): void {
    this.flashes.push({ x, y, z, s, t: 0, max, c, flat: false });
  }

  ring(x: number, z: number, s: number, c: number, max = 0.5): void {
    this.flashes.push({ x, y: 0.05, z, s, t: 0, max, c, flat: true });
  }

  /** A ship blows up: a flash, a fireball, sparks, a shock ring and debris. */
  explode(x: number, z: number, size: number, accent: number, huge = false): void {
    const P = this.particles;
    this.flash(x, z, 2.2 * size, 0xfff2c0, 0.22 + size * 0.04);
    P.burst(x, 0.3, z, Math.round(10 + size * 14), 4 + size * 3, [0xffb347, 0xff6a2a, 0xffe08a, accent], 0.55 + size * 0.1, 0.9 * Math.sqrt(size));
    P.burst(x, 0.3, z, Math.round(8 + size * 8), 9 + size * 4, [0xffffff, 0xffd27a], 0.35, 0.22, 0.05);
    this.ring(x, z, 3.2 * size, accent, 0.45 + size * 0.06);
    this.debris.spawn(x, z, Math.round(3 + size * 5), [0x5d6274, 0x3b3f4d, accent], 0.2 * Math.sqrt(size), 4 + size * 2);
    if (huge) {
      this.ring(x, z, 9, 0xffffff, 0.9);
      P.burst(x, 0.5, z, 80, 16, [0xffffff, 0xffe08a, 0xff8a3d, accent], 1.2, 1.4);
    }
  }

  /** Visuals for a simulation event (the Play scene adds sound and HUD). */
  handle(ev: SimEvent, sim: Sim): void {
    const P = this.particles;
    switch (ev.type) {
      case 'fire': {
        const p = sim.player;
        for (const sx of [-0.22, 0.22]) this.flash(p.x + sx, p.z - 0.7, ev.heavy ? 0.9 : 0.7, ev.heavy ? 0xffd27a : 0x9fe8ff, 0.06, 0.3);
        break;
      }
      case 'hit':
        if (ev.armour) { P.burst(ev.x + (Math.random() - 0.5) * 2, 0.5, ev.z + 0.8, 2, 3, [0xffffff, 0x9fe8ff], 0.2, 0.25); break; }
        P.burst(ev.x, 0.4, ev.z + 0.3, ev.crit ? 6 : 3, ev.crit ? 7 : 4, ev.crit ? [0xfff3b0, 0xffffff] : [0x9fe8ff, 0xffffff], 0.25, 0.25, 0.03);
        if (ev.crit) this.flash(ev.x, ev.z + 0.2, 1.1, 0xfff3b0, 0.12);
        break;
      case 'kill': {
        const def = ENEMIES[ev.e.kind];
        const size = def.big ? 1.7 : def.rock ? 0.9 : 0.85;
        this.explode(ev.e.x, ev.e.z, size, def.rock ? (ev.e.kind === 'crystal' ? 0x4dffd2 : 0xc08a6a) : ENEMY_PAL[ev.e.kind].accent);
        if (def.big) this.shake(0.35, 0.25);
        break;
      }
      case 'partKill':
        this.explode(ev.part.x, ev.part.z, 1.6, BOSS_PAL[ev.boss.kind].accent);
        this.shake(0.6, 0.35);
        break;
      case 'hurt':
        P.burst(ev.x, 0.4, ev.z, ev.shield ? 10 : 18, 6, ev.shield ? [0x5ad1ff, 0xffffff] : [0xff5a3a, 0xffd27a, 0xffffff], 0.4, 0.4, 0.04);
        if (!ev.shield) this.shake(0.5, 0.3);
        else this.ring(ev.x, ev.z, 2.5, 0x5ad1ff, 0.3);
        break;
      case 'deflect':
        P.burst(ev.x, 0.4, ev.z, 3, 4, [0x9fe8ff, 0xffffff], 0.25, 0.25, 0.04);
        break;
      case 'pickup':
        this.flash(ev.x, ev.z, ev.kind === 'credit' ? 0.7 : 1.6, PICKUP_COL[ev.kind], 0.18);
        if (ev.kind !== 'credit') this.ring(ev.x, ev.z, 3, PICKUP_COL[ev.kind], 0.4);
        break;
      case 'power':
        if (ev.id === 'bomb') {
          const p = sim.player;
          this.ring(p.x, p.z - 6, 26, 0xffd27a, 0.9);
          this.ring(p.x, p.z - 6, 16, 0xff8a3d, 0.7);
          this.flash(p.x, p.z - 6, 9, 0xffe0a0, 0.35);
          P.burst(p.x, 0.5, p.z - 6, 90, 22, [0xffffff, 0xffd27a, 0xff8a3d], 0.9, 0.9, 0.04);
          this.shake(1.2, 0.6);
        } else if (ev.id === 'shield') this.ring(sim.player.x, sim.player.z, 4, 0x5ad1ff, 0.45);
        else this.ring(sim.player.x, sim.player.z, 3.5, 0xffc23f, 0.4);
        break;
      case 'mine':
        this.flash(ev.x, ev.z, 1.6, 0xd0a0ff, 0.2);
        break;
      case 'bossSpawn':
        if (this.boss) this.boss.root.visible = false;
        this.boss = null;
        this.bossKind = null;
        break;
      case 'bossPhase':
        if (sim.boss) { this.ring(sim.boss.x, sim.boss.z, 10, BOSS_PAL[sim.boss.kind].accent, 0.7); this.shake(0.8, 0.5); }
        break;
      case 'phoenix': {
        const p = sim.player;
        this.ring(p.x, p.z, 14, 0xff8a3d, 0.9);
        P.burst(p.x, 0.4, p.z, 70, 12, [0xffd27a, 0xff6a2a, 0xffffff], 0.9, 0.7);
        this.shake(0.9, 0.5);
        break;
      }
      case 'death':
        this.explode(ev.x, ev.z, 2.4, 0x3fd0ff, true);
        this.shake(1.5, 0.8);
        break;
      case 'warp':
        break;
    }
  }

  /** Clears transient effects (a new run in the menu backdrop). */
  reset(): void {
    this.particles.clear();
    this.debris.clear();
    this.flashes.length = 0;
    this.boss = null;
    this.bossKind = null;
  }

  /** Every enemy currently drawn (for the overlay: kamikaze lines). */
  static lockOns(sim: Sim): Enemy[] {
    return sim.enemies.filter((e) => e.beh === 'kamikaze' && e.state === 1 && !e.dead);
  }

  static bossOf(sim: Sim): Boss | null { return sim.boss; }
}

const WHITE = new THREE.Color(0xffffff);

/** Icons of the four power-up pickups, drawn on a round badge. */
function iconTex(kind: 'repair' | 'cell' | 'charge' | 'boost'): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const col = { repair: '#3fd16a', cell: '#2fa8e8', charge: '#9a5cff', boost: '#ff8a1f' }[kind];
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fillStyle = '#0b1020'; g.fill();
  g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.fillStyle = col; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff';
  if (kind === 'repair') { g.fillRect(27, 15, 10, 34); g.fillRect(15, 27, 34, 10); }
  else if (kind === 'cell') {
    g.beginPath(); g.moveTo(32, 14); g.lineTo(47, 20); g.lineTo(45, 36); g.lineTo(32, 50); g.lineTo(19, 36); g.lineTo(17, 20); g.closePath(); g.fill();
  } else if (kind === 'charge') {
    g.beginPath(); g.moveTo(36, 12); g.lineTo(20, 35); g.lineTo(31, 35); g.lineTo(27, 52); g.lineTo(44, 28); g.lineTo(33, 28); g.closePath(); g.fill();
  } else {
    for (const y of [16, 30]) { g.beginPath(); g.moveTo(18, y + 14); g.lineTo(32, y); g.lineTo(46, y + 14); g.lineTo(40, y + 18); g.lineTo(32, y + 10); g.lineTo(24, y + 18); g.closePath(); g.fill(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type { Palette };
