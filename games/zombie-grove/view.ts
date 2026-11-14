// Zombie Grove: draws a run (sim.ts) in 3D. The grove is a few merged meshes, the horde a couple
// of dozen instanced parts (horde.ts), every shot, spark, flame, ring and gem an instanced
// billboard or mesh. The light goes from dusk through the night to dawn. The Play scene and the
// menu's attract mode both use it, so the menu also compiles every shader the first Play frame
// needs (kit.ts keepPrograms).
import Phaser from 'phaser';
import { World3D, THREE, model, miniKey } from '@core/three';
import type { Sim, SimEvent, Zombie } from './sim';
import { ARENA, POWER_IDS, isBoss, type BossKind, type WeaponId, type HeroId, type PowerId } from './defs';
import { arena } from './arena';
import { mergeProps, modelGeo, packMap, fkey, keepPrograms, groveMaterial, fistMatrix, PERSON } from './kit';
import { Billboards, Particles, TEX, canvasTex } from './fx3d';
import { Horde } from './horde';
import { Figure } from './figure';
import { heroFigure } from './heroes3d';
import { powerCanvas, POWER_HUE } from './art';

export const CAM = { fov: 40, tilt: 52, dist: 38 };
const CHUNKS = 5;
const chunkGeo = new Map<number, THREE.BufferGeometry>();

/**
 * The bosses: a big Mini Character, light-tinted with a rim light in its aura's colour, a weapon in
 * the fist and (the Rot King) a crown, so each reads from the high camera.
 */
const BOSS_LOOK: Record<BossKind, { model: string; scale: number; tint: number; glow: number; aura: number; weapon?: [string, 'left' | 'right', number]; crown?: boolean }> = {
  brute: { model: 'character-raider', scale: PERSON * 3.1, tint: 0xe4ffd0, glow: 0x1c2a10, aura: 0x9aff5a, weapon: ['weapon-sword', 'right', 1.5] },
  matron: { model: 'character-alien', scale: PERSON * 2.9, tint: 0xeaffd0, glow: 0x1a2a08, aura: 0xc8ff3a },
  knight: { model: 'character-knight', scale: PERSON * 3.0, tint: 0xd8e8d0, glow: 0x101c18, aura: 0x7ac8ff, weapon: ['weapon-spear', 'right', 1.2] },
  king: { model: 'character-zombie', scale: PERSON * 4.3, tint: 0xf0e4ff, glow: 0x2a1440, aura: 0xc080ff, weapon: ['weapon-sword', 'right', 1.8], crown: true },
};

interface Sky { sky: number; hemi: number; ground: number; hemiI: number; sun: number; sunI: number; dir: [number, number, number]; lantern: number; fire: number }
// dusk → twilight → night … → pre-dawn; the dawn itself is blended in on top
const SKY_KEYS: [number, Sky][] = [
  [0, { sky: 0xd98a63, hemi: 0xffd2ae, ground: 0x6a5242, hemiI: 1.55, sun: 0xffb27a, sunI: 1.9, dir: [-0.9, 0.55, 0.25], lantern: 0.6, fire: 1.4 }],
  [0.09, { sky: 0x6e5f9c, hemi: 0xb8a8f0, ground: 0x41364c, hemiI: 1.25, sun: 0xd2a6ff, sunI: 1.1, dir: [-0.8, 0.7, 0.4], lantern: 1.8, fire: 2.2 }],
  [0.2, { sky: 0x1a2142, hemi: 0x8aa0e0, ground: 0x30364a, hemiI: 1.35, sun: 0xb4c6ff, sunI: 1.15, dir: [0.35, 1, 0.55], lantern: 3, fire: 3 }],
  [0.88, { sky: 0x161c3a, hemi: 0x8296d8, ground: 0x2c3242, hemiI: 1.3, sun: 0xaabeff, sunI: 1.1, dir: [0.5, 1, 0.5], lantern: 3, fire: 3 }],
  [1, { sky: 0x3d3a6a, hemi: 0xa49ad8, ground: 0x383448, hemiI: 1.2, sun: 0xd8b8ff, sunI: 1, dir: [0.8, 0.7, 0.3], lantern: 2.6, fire: 2.6 }],
];
const DAWN: Sky = { sky: 0xffbf94, hemi: 0xfff0d8, ground: 0x80684e, hemiI: 1.9, sun: 0xffe2b8, sunI: 2.5, dir: [0.9, 0.45, 0.2], lantern: 0.3, fire: 0.8 };
/** The endless night under a blood moon. */
const BLOOD: Sky = { sky: 0x3a1020, hemi: 0xe0a0b0, ground: 0x402030, hemiI: 1.35, sun: 0xff8a8a, sunI: 1.25, dir: [-0.4, 1, 0.5], lantern: 3, fire: 3 };

const GEM_COL = [0x5affb0, 0x4fb4ff, 0xff5ad2];
const SHOT_COL: Record<string, number> = { shot: 0xffd25a, ember: 0xff7a2a, laser: 0x5ae8ff };

interface Swing { ang: number; arc: number; r: number; t: number; evo: boolean; delay: number }
interface Thrust { ang: number; len: number; t: number; evo: boolean }
interface Flash { x: number; y: number; z: number; s: number; t: number; max: number; c: number; kind: 'glow' | 'ring' | 'flare' | 'implode' }
interface Bash { ang: number; arc: number; r: number; t: number; evo: boolean }
interface Tele { x: number; z: number; r: number; ang: number; t: number; max: number; kind: 'charge' | 'slam'; boss: Zombie }
interface BossView { z: Zombie; fig: Figure; dead: number; kind: BossKind; act: string }

const lerpColor = (a: number, b: number, k: number, out: THREE.Color) => out.setHex(a).lerp(new THREE.Color(b), k);

export class View {
  readonly world: World3D;
  readonly camQ = new THREE.Quaternion();
  readonly particles: Particles;
  readonly flames: Particles;
  private horde: Horde;
  private hemi!: THREE.HemisphereLight;
  private lantern: THREE.PointLight;
  private campfire: THREE.PointLight;
  private ground: THREE.Mesh;
  private chunks: { mesh: THREE.Mesh; cx: number; cz: number }[] = [];
  readonly hero: Figure;
  private robot: Figure;
  private bosses = new Map<number, BossView>();
  private shadows: Billboards;
  private glows: Billboards;
  private flares: Billboards;
  private rings: Billboards;
  private discs: Billboards;
  private streaks: Billboards;
  private lanes: Billboards;
  private slashes: Billboards;
  private gooBB: Billboards;
  private powers = new Map<PowerId, Billboards>();
  private gems: THREE.InstancedMesh;
  private coins: THREE.InstancedMesh;
  private chests: THREE.InstancedMesh;
  private chestBands: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh;
  private wards: THREE.InstancedMesh;
  private sticks: THREE.InstancedMesh;
  private sword: THREE.Group;
  private swordMesh: THREE.Object3D;
  private spears: THREE.Group[] = [];
  private swings: Swing[] = [];
  private thrusts: Thrust[] = [];
  private bashes: Bash[] = [];
  private flashes: Flash[] = [];
  private teles: Tele[] = [];
  private levelT = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camOff = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private time = 0;
  private skyCol = new THREE.Color();
  /** 0 → 1 as the dawn comes up; 0 → 1 as the blood moon rises over the endless night. */
  dawnK = 0;
  bloodK = 0;
  /** The hero's torch flame (the Worker), for its sparks. */
  private torchTip: THREE.Object3D | null = null;
  private tipV = new THREE.Vector3();
  heroDead = false;
  heroWon = false;
  private emitAcc = 0;
  /** The hero and the camera for the grove's see-through. */
  private heroAt = new THREE.Vector3();
  private camAt = new THREE.Vector3();

  /** World units the camera looks past the hero (the menu shows them above its buttons). */
  private lookAhead = 0.6;

  constructor(private phaser: Phaser.Scene, o: { hero: HeroId; menu?: boolean }) {
    if (o.menu) this.lookAhead = -7;
    const world = new World3D(phaser, { fov: CAM.fov, near: 1, far: 140, background: SKY_KEYS[0][1].sky, fog: { color: SKY_KEYS[0][1].sky, near: 38, far: 72 } });
    this.world = world;
    (globalThis as { __zgRenderer?: THREE.WebGLRenderer }).__zgRenderer = world.renderer;
    world.addLights({ sky: 0xffffff, ground: 0x444444, ambient: 1.4, sun: 0xffffff, intensity: 1.8, dir: [-0.9, 0.55, 0.25], extent: 17 });
    world.scene.traverse((ob) => { if ((ob as THREE.HemisphereLight).isHemisphereLight) this.hemi = ob as THREE.HemisphereLight; });
    world.sun!.shadow.mapSize.set(1024, 1024);
    const sc = world.scene;
    this.lantern = new THREE.PointLight(0xffb36a, 2, 12, 1.4);
    this.campfire = new THREE.PointLight(0xff8a3a, 3, 15, 1.3);
    this.campfire.position.set(0, 1.2, 0);
    sc.add(this.lantern, this.campfire);
    const a = THREE.MathUtils.degToRad(CAM.tilt);
    this.camOff.set(0, Math.sin(a) * CAM.dist, Math.cos(a) * CAM.dist);

    // ground: a big tiled grass texture
    const gTex = grassTexture();
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping;
    gTex.repeat.set(22, 22);
    gTex.anisotropy = 4;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 50, ARENA * 2 + 50), new THREE.MeshLambertMaterial({ map: gTex }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    sc.add(this.ground);

    // the grove: props merged per chunk (one texture for the whole pack)
    const ar = arena();
    const propMat = groveMaterial(packMap(fkey('tree')), this.heroAt, this.camAt);
    const size = (ARENA * 2 + 16) / CHUNKS;
    const byChunk = new Map<number, typeof ar.props>();
    for (const p of ar.props) {
      const cx = Math.max(0, Math.min(CHUNKS - 1, Math.floor((p.x + ARENA + 8) / size))), cz = Math.max(0, Math.min(CHUNKS - 1, Math.floor((p.z + ARENA + 8) / size)));
      const k = cz * CHUNKS + cx;
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k)!.push(p);
    }
    for (const [k, list] of byChunk) {
      // merged once per page: a restart only uploads them again
      let geo = chunkGeo.get(k);
      if (!geo) { geo = mergeProps(list); chunkGeo.set(k, geo); }
      const mesh = new THREE.Mesh(geo, propMat);
      // the grove takes shadows but casts none (the hero, the robot and the bosses do): half the
      // triangles of the shadow pass, and the zombies have blob shadows anyway
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      sc.add(mesh);
      this.chunks.push({ mesh, cx: k % CHUNKS, cz: Math.floor(k / CHUNKS) });
    }

    // people
    this.horde = new Horde(sc);
    this.hero = heroFigure(o.hero, { ownMaterials: true });
    this.torchTip = (this.hero.root.userData.torch as THREE.Object3D | undefined) ?? null;
    sc.add(this.hero.root);
    this.robot = new Figure(miniKey('character-robot'), PERSON * 0.82);
    this.robot.root.visible = false;
    sc.add(this.robot.root);
    if (o.menu) {
      // a boss's rim-lit material, out of sight: the menu compiles its program for the first boss
      const warm = this.bossFigure('king');
      warm.root.visible = false;
      warm.root.position.y = -50;
      sc.add(warm.root);
      // and the Worker's torch (unlit flame, plain stick) when another hero stands in the grove
      if (o.hero !== 'worker') {
        const wk = heroFigure('worker');
        wk.root.visible = false;
        wk.root.position.y = -50;
        sc.add(wk.root);
      }
    }

    // effects
    const glow = TEX.glow();
    this.shadows = new Billboards(sc, TEX.shadow(), 700, { blend: 'normal', flat: true, order: 1 });
    this.discs = new Billboards(sc, TEX.disc(), 60, { flat: true, order: 2 });
    this.lanes = new Billboards(sc, TEX.streak(), 16, { flat: true, order: 3 });
    this.rings = new Billboards(sc, TEX.ring(), 120, { flat: true, order: 4 });
    this.slashes = new Billboards(sc, TEX.slash(), 24, { flat: true, order: 14 });
    this.glows = new Billboards(sc, glow, 1200, { order: 11 });
    this.flares = new Billboards(sc, TEX.flare(), 220, { order: 15 });
    this.streaks = new Billboards(sc, TEX.streak(), 240, { flat: true, order: 13 });
    this.gooBB = new Billboards(sc, TEX.goo(), 200, { blend: 'normal', order: 16 });
    for (const id of POWER_IDS) {
      const tex = new THREE.CanvasTexture(powerCanvas(id));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.powers.set(id, new Billboards(sc, tex, 6, { blend: 'normal', order: 17 }));
    }
    this.particles = new Particles(sc, glow, 1600);
    this.flames = new Particles(sc, TEX.flame(), 700, 'add', 13);

    const gemGeo = new THREE.OctahedronGeometry(0.17, 0);
    gemGeo.scale(1, 1.5, 1);
    this.gems = instanced(sc, gemGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 320, true);
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14);
    coinGeo.rotateX(Math.PI / 2);
    this.coins = instanced(sc, coinGeo, new THREE.MeshLambertMaterial({ color: 0xffc83a, emissive: 0x6a4200 }), 80, false);
    // the gold chest: a wooden box with a round lid, and its gold bands and lock on top
    const box = new THREE.BoxGeometry(0.9, 0.42, 0.6);
    box.translate(0, 0.21, 0);
    const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI);
    lid.rotateZ(Math.PI / 2);
    lid.translate(0, 0.42, 0);
    this.chests = instanced(sc, mergeGeos([box, lid]), new THREE.MeshLambertMaterial({ color: 0x9a6230, emissive: 0x3a2000 }), 4, false);
    const bands: THREE.BufferGeometry[] = [];
    for (const x of [-0.3, 0.3]) {
      const b = new THREE.BoxGeometry(0.1, 0.44, 0.63); b.translate(x, 0.21, 0); bands.push(b);
      const t = new THREE.CylinderGeometry(0.315, 0.315, 0.1, 12, 1, false, 0, Math.PI); t.rotateZ(Math.PI / 2); t.translate(x, 0.42, 0); bands.push(t);
    }
    const lock = new THREE.BoxGeometry(0.16, 0.18, 0.06); lock.translate(0, 0.42, 0.31); bands.push(lock);
    this.chestBands = instanced(sc, mergeGeos(bands), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a4a00 }), 4, false);
    const arrow = modelGeo(miniKey('weapon-arrow'));
    const arrowGeo = arrow.geo.clone().applyMatrix4(arrow.mat);
    arrowGeo.scale(2.2, 2.2, 2.2);
    const charMap = packMap(miniKey('weapon-arrow'));
    this.arrows = instanced(sc, arrowGeo, new THREE.MeshLambertMaterial({ map: charMap, emissive: 0x332211 }), 200, false);
    const shield = modelGeo(miniKey('shield-round'));
    const shieldGeo = shield.geo.clone().applyMatrix4(shield.mat);
    shieldGeo.center();
    shieldGeo.scale(2.3, 2.3, 2.3);
    this.wards = instanced(sc, shieldGeo, new THREE.MeshLambertMaterial({ map: charMap, emissive: 0x223344 }), 8, false);
    this.sticks = instanced(sc, new THREE.BoxGeometry(0.09, 0.09, 0.55), new THREE.MeshLambertMaterial({ color: 0x7a4a24 }), 16, false);
    // the blade's big sweep and the spear's thrusts
    this.sword = new THREE.Group();
    this.swordMesh = model(miniKey('weapon-sword'), { shadows: false });
    const sw = new THREE.Group();
    sw.add(this.swordMesh);
    this.swordMesh.position.set(-0.115, 0, -0.055);
    sw.rotation.x = Math.PI / 2;
    sw.scale.setScalar(3.4);
    sw.position.set(0, 0.75, 0.35);
    this.sword.add(sw);
    this.sword.visible = false;
    sc.add(this.sword);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const sp = model(miniKey('weapon-spear'), { shadows: false });
      const inner = new THREE.Group();
      sp.position.set(-0.075, -0.3, -0.06);
      inner.add(sp);
      inner.rotation.x = Math.PI / 2;
      inner.scale.setScalar(4);
      inner.position.y = 0.75;
      g.add(inner);
      g.visible = false;
      sc.add(g);
      this.spears.push(g);
    }

    this.setSky(0, 0);
    world.camera.position.set(0, 0, 0);
    if (o.menu) keepPrograms(world.renderer, sc, world.camera);
  }

  /** Swaps the hero's model (the camp's hero changed on the menu). */
  get drawCalls(): number { return this.world.renderer.info.render.calls; }
  get horded(): number { return this.horde.drawn; }

  // ------------------------------------------------------------------ light

  /** A boss's figure: tinted, rim-lit, armed (and crowned). */
  private bossFigure(kind: BossKind): Figure {
    const lk = BOSS_LOOK[kind];
    const fig = new Figure(miniKey(lk.model), lk.scale, { tint: lk.tint, glow: lk.glow, rim: [lk.aura, 0.9] });
    if (lk.weapon) {
      const [name, side, sc] = lk.weapon;
      const g = new THREE.Group();
      g.applyMatrix4(fistMatrix(side, sc));
      g.add(model(miniKey(name), { shadows: true }));
      fig.hold(g, side);
    }
    if (lk.crown) {
      // a gold crown on the head: a band and five points (the head bone's space, model units)
      const crown = new THREE.Group();
      const gold = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a5a00 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.07, 10, 1, true), gold);
      band.userData.own = true;
      crown.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const pt = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), gold);
        pt.userData.own = true;
        pt.position.set(Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15);
        crown.add(pt);
      }
      crown.position.set(0, 0.36, 0);
      fig.bones.get('head')?.add(crown);
    }
    return fig;
  }

  /** f: share of the night gone (0–1), dawn: 0–1 as the sun comes up. */
  setSky(f: number, dawn: number): void {
    let i = 0;
    while (i < SKY_KEYS.length - 2 && f > SKY_KEYS[i + 1][0]) i++;
    const [f0, a] = SKY_KEYS[i], [f1, b] = SKY_KEYS[i + 1];
    const k = Math.max(0, Math.min(1, (f - f0) / (f1 - f0)));
    const mix = (x: number, y: number) => x + (y - x) * k;
    const sky: Sky = {
      sky: 0, hemi: 0, ground: 0, hemiI: mix(a.hemiI, b.hemiI), sun: 0, sunI: mix(a.sunI, b.sunI),
      dir: [mix(a.dir[0], b.dir[0]), mix(a.dir[1], b.dir[1]), mix(a.dir[2], b.dir[2])], lantern: mix(a.lantern, b.lantern), fire: mix(a.fire, b.fire),
    };
    // the dawn, or the blood moon of the endless night, blended over the night's own light
    const T = this.bloodK > 0 ? BLOOD : DAWN, w = this.bloodK > 0 ? this.bloodK : dawn;
    const col = (x: number, y: number, d: number) => lerpColor(x, y, k, this.c).lerp(new THREE.Color(d), w).getHex();
    sky.sky = col(a.sky, b.sky, T.sky);
    sky.hemi = col(a.hemi, b.hemi, T.hemi);
    sky.ground = col(a.ground, b.ground, T.ground);
    sky.sun = col(a.sun, b.sun, T.sun);
    const dm = (x: number, y: number) => x + (y - x) * w;
    sky.hemiI = dm(sky.hemiI, T.hemiI); sky.sunI = dm(sky.sunI, T.sunI);
    sky.lantern = dm(sky.lantern, T.lantern); sky.fire = dm(sky.fire, T.fire);
    sky.dir = [dm(sky.dir[0], T.dir[0]), dm(sky.dir[1], T.dir[1]), dm(sky.dir[2], T.dir[2])];
    this.skyCol.setHex(sky.sky);
    (this.world.scene.background as THREE.Color).copy(this.skyCol);
    (this.world.scene.fog as THREE.Fog).color.copy(this.skyCol);
    this.hemi.color.setHex(sky.hemi);
    this.hemi.groundColor.setHex(sky.ground);
    this.hemi.intensity = sky.hemiI;
    const sun = this.world.sun!;
    sun.color.setHex(sky.sun);
    sun.intensity = sky.sunI;
    const off = new THREE.Vector3(...sky.dir).normalize().multiplyScalar(40);
    sun.position.copy(sun.target.position).add(off);
    this.lantern.intensity = sky.lantern;
    this.campfire.userData.base = sky.fire;
  }

  // ------------------------------------------------------------------ events

  handle(ev: SimEvent, sim: Sim): void {
    const P = this.particles;
    switch (ev.type) {
      case 'hit':
        if (ev.crit) this.flashes.push({ x: ev.x, y: 0.8, z: ev.z, s: 1.3, t: 0.14, max: 0.14, c: 0xfff0a0, kind: 'flare' });
        else if (Math.random() < 0.5) this.flashes.push({ x: ev.x, y: 0.7, z: ev.z, s: 0.7, t: 0.1, max: 0.1, c: 0xffffff, kind: 'flare' });
        if (Math.random() < 0.35) P.burst(ev.x, 0.7, ev.z, 3, 4, [0x9cff6a, 0x6ad04a], 0.3, 0.22, 0.8, 6);
        break;
      case 'kill': {
        const zb = ev.z;
        const big = zb.kind === 'tank' || isBoss(zb.kind);
        if (ev.by === 'dawn' || ev.by === 'nuke') {
          this.flames.burst(zb.x, 0.6, zb.z, ev.by === 'nuke' ? 3 : 4, 2, ev.by === 'nuke' ? [0xfff0a0, 0xffb060] : [0xffb060, 0xff7a2a], 0.7, 0.6, 1.4, -2);
          break;
        }
        P.burst(zb.x, 0.55, zb.z, big ? 18 : 7, big ? 6 : 3.6, [0x8fbf6a, 0x5e8a4a, 0xcfe8a0], 0.55, big ? 0.7 : 0.45, 0.9, 5);
        if (ev.by === 'fire' || zb.burn > 0) this.flames.burst(zb.x, 0.6, zb.z, 5, 2.5, [0xffa040, 0xff6a20], 0.5, 0.5, 1.5, -2);
        if (big) this.flashes.push({ x: zb.x, y: 0.1, z: zb.z, s: 3.2, t: 0.4, max: 0.4, c: 0xb0ff80, kind: 'ring' });
        break;
      }
      case 'swing':
        this.swings.push({ ang: ev.ang, arc: ev.arc, r: ev.r, t: 0, evo: ev.evo, delay: ev.n * 0.12 });
        if (ev.n === 0) this.hero.act('attack-melee-right', 0.38, 1.9);
        break;
      case 'thrust':
        this.thrusts.push({ ang: ev.ang, len: ev.len, t: 0, evo: ev.evo });
        this.hero.act('attack-melee-left', 0.35, 2.1);
        break;
      case 'bash': {
        // the shield's shove: a violet crescent (a ring when evolved) and a dust wave
        this.bashes.push({ ang: ev.ang, arc: ev.arc, r: ev.r, t: 0, evo: ev.evo });
        if (ev.n === 0) this.hero.act('attack-melee-left', 0.32, 2.2);
        const ux = Math.sin(ev.ang), uz = Math.cos(ev.ang);
        if (!ev.evo) P.burst(sim.player.x + ux * ev.r * 0.6, 0.3, sim.player.z + uz * ev.r * 0.6, 8, 4, [0xd8c8ff, 0xa080ff, 0xffffff], 0.35, 0.35, 0.5, 4);
        else P.burst(sim.player.x, 0.4, sim.player.z, 18, 6, [0xb8ffb0, 0xd8c8ff, 0xffffff], 0.45, 0.4, 0.5, 3);
        if (ev.hits >= 4) this.shake(0.18, 0.12);
        break;
      }
      case 'chain':
        for (const p of ev.pts) this.flashes.push({ x: p.x, y: 0.8, z: p.z, s: 1.2, t: 0.2, max: 0.2, c: 0x8fd8ff, kind: 'flare' });
        break;
      case 'fire':
        if (ev.w === 'robot') { this.robot.act('holding-right-shoot', 0.3, 1.5); this.flashes.push({ x: ev.x + Math.sin(ev.ang) * 0.5, y: 0.7, z: ev.z + Math.cos(ev.ang) * 0.5, s: 0.8, t: 0.08, max: 0.08, c: 0x5ae8ff, kind: 'flare' }); }
        else if (ev.w === 'blaster') { this.hero.act('holding-right-shoot', 0.22, 2); this.flashes.push({ x: ev.x + Math.sin(ev.ang) * 0.6, y: 0.75, z: ev.z + Math.cos(ev.ang) * 0.6, s: 0.9, t: 0.06, max: 0.06, c: 0xffd25a, kind: 'flare' }); }
        else if (ev.w === 'bow') this.hero.act('holding-both-shoot', 0.3, 1.6);
        break;
      case 'torch':
        this.hero.act('interact-right', 0.3, 2);
        break;
      case 'ignite':
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: ev.r * 2.6, t: 0.35, max: 0.35, c: 0xff8a2a, kind: 'ring' });
        this.flames.burst(ev.x, 0.4, ev.z, 10, 3, [0xffc060, 0xff7020], 0.6, 0.7, 1.2, -3);
        break;
      case 'ward':
        if (Math.random() < 0.5) this.flashes.push({ x: ev.x, y: 0.7, z: ev.z, s: 0.9, t: 0.1, max: 0.1, c: 0x9fd8ff, kind: 'flare' });
        break;
      case 'hurt':
        this.hero.flash();
        P.burst(sim.player.x, 0.8, sim.player.z, 5, 3, [0xff4a4a, 0xff9a9a], 0.35, 0.3, 0.8, 5);
        break;
      case 'explode':
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: ev.r * 2.4, t: 0.45, max: 0.45, c: 0xffa040, kind: 'ring' });
        this.flashes.push({ x: ev.x, y: 0.8, z: ev.z, s: ev.r * 2.2, t: 0.25, max: 0.25, c: 0xffd080, kind: 'glow' });
        P.burst(ev.x, 0.6, ev.z, 26, 8, [0xffd27a, 0xff8a2a, 0xff5a1a], 0.6, 0.8, 1, 4);
        this.flames.burst(ev.x, 0.5, ev.z, 12, 4, [0xffb060, 0xff6a20], 0.6, 1, 1.4, -2);
        this.shake(0.35, 0.25);
        break;
      case 'spit':
        P.burst(ev.x, 0.9, ev.z, ev.boss ? 10 : 4, 2.5, [0xb6ff3a, 0x6ad010], 0.35, 0.35, 1, 4);
        break;
      case 'gooHit':
        P.burst(ev.x, 0.3, ev.z, 6, 2.5, [0xb6ff3a, 0x4fa010], 0.4, 0.35, 0.8, 6);
        break;
      case 'level':
        this.levelT = 1;
        P.burst(sim.player.x, 0.6, sim.player.z, 34, 7, [0xfff07a, 0x7affc0, 0xffffff], 0.8, 0.5, 1.4, 3);
        this.flashes.push({ x: sim.player.x, y: 0.1, z: sim.player.z, s: 5, t: 0.5, max: 0.5, c: 0xfff07a, kind: 'ring' });
        break;
      case 'chest':
        P.burst(ev.x, 0.6, ev.z, 40, 7, [0xffd23f, 0xffffff, 0xff9a3a], 0.9, 0.55, 1.8, 3);
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 6, t: 0.6, max: 0.6, c: 0xffd23f, kind: 'ring' });
        this.flashes.push({ x: ev.x, y: 1.2, z: ev.z, s: 4, t: 0.5, max: 0.5, c: 0xfff0a0, kind: 'glow' });
        break;
      case 'drop':
        // a power-up pops out of the fallen with a ring in its colour
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 2.4, t: 0.5, max: 0.5, c: ev.kind === 'chest' ? 0xffd23f : POWER_HUE[ev.kind], kind: 'ring' });
        break;
      case 'power': {
        const c = POWER_HUE[ev.kind], p = sim.player;
        P.burst(p.x, 0.8, p.z, 22, 5, [c, 0xffffff], 0.6, 0.45, 1.2, 3);
        this.flashes.push({ x: p.x, y: 0.1, z: p.z, s: 4, t: 0.5, max: 0.5, c, kind: 'ring' });
        if (ev.kind === 'freeze') {
          this.flashes.push({ x: p.x, y: 0.1, z: p.z, s: 34, t: 0.9, max: 0.9, c: 0xbff0ff, kind: 'ring' });
          this.flashes.push({ x: p.x, y: 0.1, z: p.z, s: 22, t: 0.7, max: 0.7, c: 0xe8fbff, kind: 'ring' });
          for (const zb of sim.zombies) if (Math.random() < 0.25 && Math.abs(zb.x - p.x) < 13 && Math.abs(zb.z - p.z) < 16) P.burst(zb.x, 1, zb.z, 3, 1.5, [0xe8fbff, 0x9fe4ff], 0.7, 0.3, 0.6, -1);
        }
        if (ev.kind === 'vacuum') this.flashes.push({ x: p.x, y: 0.1, z: p.z, s: 30, t: 0.8, max: 0.8, c: 0x7ab8ff, kind: 'implode' });
        if (ev.kind === 'boots') this.flashes.push({ x: p.x, y: 0.1, z: p.z, s: 6, t: 0.5, max: 0.5, c: 0x6affb0, kind: 'ring' });
        break;
      }
      case 'nuke': {
        // the flare goes up and the light sweeps the screen: rings, a white-gold glow, a big shake
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 46, t: 1.1, max: 1.1, c: 0xfff0a0, kind: 'ring' });
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 30, t: 0.8, max: 0.8, c: 0xffb03a, kind: 'ring' });
        this.flashes.push({ x: ev.x, y: 4, z: ev.z, s: 30, t: 0.7, max: 0.7, c: 0xfff6d0, kind: 'glow' });
        this.particles.burst(ev.x, 1, ev.z, 50, 14, [0xfff0a0, 0xffffff, 0xffb03a], 1, 0.8, 2.5, 2);
        this.shake(0.9, 0.7);
        break;
      }
      case 'telegraph':
        this.teles.push({ x: ev.x, z: ev.z2, r: ev.r, ang: ev.ang, t: ev.t, max: ev.t, kind: ev.kind, boss: ev.z });
        break;
      case 'slam':
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: ev.r * 2.4, t: 0.5, max: 0.5, c: 0xff6a4a, kind: 'ring' });
        P.burst(ev.x, 0.3, ev.z, 30, 9, [0x9a8a6a, 0xc8b890, 0xff8a5a], 0.6, 0.7, 0.6, 6);
        this.shake(0.55, 0.35);
        break;
      case 'revive':
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 10, t: 0.7, max: 0.7, c: 0xfff0a0, kind: 'ring' });
        P.burst(ev.x, 0.6, ev.z, 40, 9, [0xfff0a0, 0xffffff, 0xffb03a], 0.9, 0.6, 1.6, 2);
        break;
      case 'death':
        this.heroDead = true;
        this.hero.play('die', { once: true, fade: 0.1 });
        P.burst(ev.x, 0.7, ev.z, 20, 5, [0xff4a4a, 0xffffff], 0.7, 0.5, 1, 4);
        break;
      case 'won':
        this.heroWon = true;
        break;
      case 'bossDead':
        P.burst(ev.z.x, 1, ev.z.z, 60, 11, [0xb0ff80, 0xffffff, 0xffd23f], 1, 0.9, 1.4, 4);
        this.flashes.push({ x: ev.z.x, y: 0.1, z: ev.z.z, s: 9, t: 0.8, max: 0.8, c: 0xd0ff90, kind: 'ring' });
        this.shake(0.8, 0.6);
        break;
      default:
        break;
    }
  }

  shake(amp: number, t: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // ------------------------------------------------------------------ frame

  sync(sim: Sim, dt: number): void {
    this.time += dt;
    const p = sim.player;
    const world = this.world;
    // light: the night's progress and the dawn
    const f = Math.min(1, sim.time / sim.tune.night);
    if (sim.phase === 'dawn' || sim.phase === 'won') this.dawnK = Math.min(1, this.dawnK + dt / 2.2);
    if (sim.endless) { this.dawnK = Math.max(0, this.dawnK - dt / 2); this.bloodK = Math.min(1, this.bloodK + dt / 3); }
    this.setSky(f, this.dawnK);
    const flick = 1 + Math.sin(this.time * 17) * 0.06 + Math.sin(this.time * 7.3) * 0.08;
    this.campfire.intensity = (this.campfire.userData.base as number) * flick;
    this.lantern.position.set(p.x, 2.2, p.z + 0.6);

    // camera: follows smoothly, a touch of shake
    const look = this.camLook;
    const k = this.camPos.lengthSq() === 0 ? 1 : Math.min(1, dt * 4.5);
    look.x += (p.x - look.x) * k;
    look.z += (p.z - this.lookAhead - look.z) * k;
    this.camPos.set(look.x, 0, look.z).add(this.camOff);
    const cam = world.camera;
    cam.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeT * 4);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    cam.lookAt(look.x, 0, look.z);
    cam.updateMatrixWorld();
    this.heroAt.set(p.x, 0.7, p.z);
    this.camAt.copy(cam.position);
    this.camQ.copy(cam.quaternion);
    world.followSun(new THREE.Vector3(look.x, 0, look.z));
    // only the grove's patches near the view
    const size = (ARENA * 2 + 16) / CHUNKS;
    for (const ch of this.chunks) {
      const x0 = -ARENA - 8 + ch.cx * size, z0 = -ARENA - 8 + ch.cz * size;
      const nx = Math.max(x0, Math.min(x0 + size, look.x)), nz = Math.max(z0, Math.min(z0 + size, look.z));
      ch.mesh.visible = Math.abs(nx - look.x) < 16 && nz - look.z < 22 && look.z - nz < 40;
    }
    const cull = (x: number, z: number) => Math.abs(x - look.x) < 15 && z - look.z < 14 && look.z - z < 30;

    this.syncHero(sim, dt);
    this.horde.update(sim, this.time, cull);
    this.syncBosses(sim, dt);
    this.syncFx(sim, dt, cull);
  }

  private syncHero(sim: Sim, dt: number): void {
    const p = sim.player, h = this.hero;
    h.root.position.set(p.x, 0, p.z);
    let da = p.face - h.root.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    h.root.rotation.y += da * Math.min(1, dt * 14);
    const sp = Math.hypot(p.vx, p.vz);
    if (this.heroWon) h.play('emote-yes', { fade: 0.25 });
    else if (!this.heroDead) {
      if (sp > 0.6) h.play(sp > sim.stats.speed * 1.08 ? 'sprint' : 'walk', { speed: sp * 0.42 });
      else h.play('idle', { speed: 1 });
    }
    // a red flash when bitten; a pulsing red glow on a rage tonic
    h.update(dt);
    const rage = sim.buffs.rage > 0 ? 0.25 + Math.sin(this.time * 12) * 0.12 : 0;
    if (p.hurt > 0) for (const m of h.mats) m.emissive.setRGB(p.hurt * 2.4, 0.05, 0.05);
    else if (rage > 0) for (const m of h.mats) m.emissive.setRGB(rage, 0.02, 0.02);
    // the Worker's torch throws sparks
    if (this.torchTip && h.root.visible && Math.random() < dt * 14) {
      this.torchTip.getWorldPosition(this.tipV);
      this.flames.emit(this.tipV.x, this.tipV.y + 0.05, this.tipV.z, 0, 1.2, 0, 0.35, 0.3, 0.05, Math.random() < 0.5 ? 0xffd070 : 0xff7a2a, 1, -1);
    }
    // blinking while invulnerable after a second wind
    h.root.visible = !(p.inv > 0.6 && Math.floor(this.time * 14) % 2 === 0);
    // the robot helper
    const r = this.robot;
    r.root.visible = sim.robot.on;
    if (sim.robot.on) {
      r.root.position.set(sim.robot.x, 0.25 + Math.sin(this.time * 4) * 0.08, sim.robot.z);
      let ra = sim.robot.face - r.root.rotation.y;
      ra = Math.atan2(Math.sin(ra), Math.cos(ra));
      r.root.rotation.y += ra * Math.min(1, dt * 10);
      r.play('walk', { speed: 1.2 });
      r.update(dt);
    }
  }

  private syncBosses(sim: Sim, dt: number): void {
    for (const zb of sim.zombies) {
      if (!isBoss(zb.kind) || this.bosses.has(zb.id)) continue;
      const fig = this.bossFigure(zb.kind as BossKind);
      this.world.scene.add(fig.root);
      this.bosses.set(zb.id, { z: zb, fig, dead: -1, kind: zb.kind as BossKind, act: '' });
    }
    for (const [id, b] of this.bosses) {
      const zb = b.z, fig = b.fig;
      if (zb.dead && b.dead < 0) { b.dead = 0; fig.play('die', { once: true, fade: 0.1 }); }
      if (b.dead >= 0) {
        b.dead += dt;
        fig.root.position.y = -Math.max(0, b.dead - 1.2) * 0.8;
        if (b.dead > 1.2) this.flames.emit(zb.x + (Math.random() - 0.5) * 2, 0.3, zb.z + (Math.random() - 0.5) * 2, 0, 1.5, 0, 0.6, 0.8, 0.1, 0xb0ff80, 1, -1);
        fig.update(dt);
        if (b.dead > 3) { this.world.scene.remove(fig.root); fig.dispose(); disposeTree(fig.root); this.bosses.delete(id); }
        continue;
      }
      fig.root.position.set(zb.x, 0, zb.z);
      fig.root.rotation.y = zb.face;
      if (zb.flash > 0.1) fig.flash();
      if (zb.rage) for (const u of fig.rims) u.value.setRGB(1.1, 0.2, 0.4);
      const act = zb.act;
      if (act !== b.act) {
        b.act = act;
        if (act === 'slam') fig.act('attack-melee-right', 1.1, 0.9);
        else if (act === 'spray' || act === 'spit') fig.act('holding-both-shoot', 0.8, 1.2);
        else if (act === 'summon') fig.act('interact-right', 0.9, 1);
      }
      if (act === 'charge') fig.play('sprint', { speed: 1.6 });
      else if (act === 'windup') fig.play('crouch', { speed: 1 });
      else if (act === 'walk') fig.play(zb.atk > 0 ? 'attack-melee-right' : 'walk', { speed: zb.speed * 0.5 });
      else fig.play('idle');
      fig.update(dt);
    }
  }

  private syncFx(sim: Sim, dt: number, cull: (x: number, z: number) => boolean): void {
    const cq = this.camQ, t = this.time, p = sim.player;
    for (const b of [this.shadows, this.glows, this.flares, this.rings, this.discs, this.streaks, this.lanes, this.slashes, this.gooBB, ...this.powers.values()]) b.begin(cq);

    // blob shadows and the hero's marker ring
    if (!this.heroDead || sim.phaseT < 2) this.shadows.add(p.x, 0.03, p.z, 1.1, 1.1, 0, 0xffffff, 1);
    if (!this.heroDead) {
      this.rings.add(p.x, 0.04, p.z, 2.1, 2.1, 0, 0x7ad8ff, 0.85 + Math.sin(t * 4) * 0.15);
      this.glows.add(p.x, 0.08, p.z, 2.4, 2.4, 0, 0x3a8aff, 0.25);
    }
    if (sim.robot.on) this.shadows.add(sim.robot.x, 0.03, sim.robot.z, 0.8, 0.8, 0, 0xffffff, 1);
    // timed power-ups ring the hero in their colour (blinking in the last two seconds)
    if (!this.heroDead) {
      let ring = 0;
      for (const id of ['rage', 'boots', 'freeze'] as const) {
        const left = sim.buffs[id];
        if (left <= 0) continue;
        const blink = left < 2 && Math.floor(t * 8) % 2 === 0 ? 0.3 : 1;
        const s = 2.7 + ring * 0.55 + Math.sin(t * 6 + ring) * 0.08;
        this.rings.add(p.x, 0.05 + ring * 0.01, p.z, s, s, 0, POWER_HUE[id], 0.85 * blink);
        ring++;
      }
      if (sim.buffs.boots > 0 && Math.hypot(p.vx, p.vz) > 1 && Math.random() < dt * 30) this.particles.emit(p.x + (Math.random() - 0.5) * 0.3, 0.15, p.z + (Math.random() - 0.5) * 0.3, -p.vx * 0.15, 0.4, -p.vz * 0.15, 0.4, 0.35, 0.1, 0x9fffd0, 3);
      if (sim.buffs.rage > 0 && Math.random() < dt * 18) this.flames.emit(p.x + (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.5, 0, 1.2, 0, 0.35, 0.3, 0.05, 0xff3a3a, 1, -1);
    }
    for (const zb of sim.zombies) {
      if (!cull(zb.x, zb.z)) continue;
      const s = zb.r * (isBoss(zb.kind) ? 3.4 : 3.2);
      this.shadows.add(zb.x, 0.03, zb.z, s, s, 0, 0xffffff, 1);
      if (zb.burn > 0 && Math.random() < dt * 14) this.flames.emit(zb.x + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, zb.z + (Math.random() - 0.5) * 0.4, 0, 1.6, 0, 0.45, 0.45, 0.1, Math.random() < 0.5 ? 0xffa040 : 0xff6020, 1, -1);
      // a Hulk stands in a warm ring, so it reads in the crowd
      if (zb.kind === 'tank') { this.rings.add(zb.x, 0.05, zb.z, 2.6, 2.6, 0, 0xffa040, 0.55 + Math.sin(t * 4 + zb.id) * 0.15); this.glows.add(zb.x, 1.6, zb.z, 3.2, 3.2, 0, 0xffb060, 0.16); }
      if (zb.stun > 0) this.flares.add(zb.x, 1.7 * (zb.kind === 'tank' ? 1.6 : 1), zb.z, 0.5, 0.5, t * 6, 0xfff07a, 0.8);
      if (zb.fuse >= 0) this.glows.add(zb.x, 0.9, zb.z, 2.2, 2.2, 0, 0xff5020, 0.6 + Math.sin(t * 30) * 0.3);
      else if (zb.kind === 'exploder') this.glows.add(zb.x, 0.7, zb.z, 1.5, 1.5, 0, 0xff6a2a, 0.22 + Math.sin(t * 6 + zb.id) * 0.08);
      if (isBoss(zb.kind)) {
        // a boss stands in a ring of its own colour
        const aura = BOSS_LOOK[zb.kind as BossKind].aura, col = zb.rage ? 0xff3060 : aura;
        this.rings.add(zb.x, 0.05, zb.z, zb.r * 4.4, zb.r * 4.4, 0, col, 0.85 + Math.sin(t * 5) * 0.15);
        this.rings.add(zb.x, 0.06, zb.z, zb.r * 5.6, zb.r * 5.6, t * 0.5, col, 0.35 + Math.sin(t * 5 + 1) * 0.15);
        this.discs.add(zb.x, 0.04, zb.z, zb.r * 4, zb.r * 4, 0, col, 0.22);
        this.glows.add(zb.x, 1.8, zb.z, zb.r * 7, zb.r * 7, 0, col, 0.32);
      }
    }

    // telegraphs: red lanes and circles that fill as the blow comes
    for (let i = this.teles.length - 1; i >= 0; i--) {
      const tl = this.teles[i];
      tl.t -= dt;
      if (tl.t <= 0 || tl.boss.dead) { this.teles.splice(i, 1); continue; }
      const k = 1 - tl.t / tl.max;
      const pulse = 0.55 + Math.sin(t * 24) * 0.25;
      if (tl.kind === 'slam') {
        this.discs.add(tl.boss.x, 0.05, tl.boss.z, tl.r * 2, tl.r * 2, 0, 0xff3030, pulse);
        this.discs.add(tl.boss.x, 0.06, tl.boss.z, tl.r * 2 * k, tl.r * 2 * k, 0, 0xff6a3a, 0.7);
      } else {
        const ux = Math.sin(tl.ang), uz = Math.cos(tl.ang);
        this.lanes.add(tl.x + ux * tl.r / 2, 0.06, tl.z + uz * tl.r / 2, 2.4, tl.r, Math.atan2(-ux, -uz), 0xff3030, pulse);
      }
    }

    // the blade's sweeps
    let swordOn = false;
    for (let i = this.swings.length - 1; i >= 0; i--) {
      const s = this.swings[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t += dt;
      const T = s.evo ? 0.32 : 0.2;
      if (s.t > T + 0.12) { this.swings.splice(i, 1); continue; }
      const u = Math.min(1, s.t / T);
      const ease = 1 - (1 - u) * (1 - u);
      const a = s.evo ? s.ang + ease * Math.PI * 2 : s.ang - s.arc / 2 + ease * s.arc;
      const fade = s.t > T ? 1 - (s.t - T) / 0.12 : 1;
      const col = s.evo ? 0x7ab8ff : 0xffd8a0;
      const sz = s.r * 2.15;
      // the crescent trails behind the blade
      for (let k = 0; k < 3; k++) {
        const ak = a - (s.evo ? 0.5 : 0.3) * k * (s.evo ? 1 : Math.sign(s.arc));
        this.slashes.add(p.x, 0.55 + k * 0.01, p.z, sz, sz, ak + Math.PI, col, fade * (s.evo ? 0.42 - k * 0.12 : 0.62 - k * 0.18));
      }
      if (!swordOn) {
        swordOn = true;
        this.sword.visible = true;
        this.sword.position.set(p.x, 0, p.z);
        this.sword.rotation.y = a;
        this.sword.scale.setScalar(s.r / 2.3);
      }
      if (Math.random() < 0.6) this.particles.emit(p.x + Math.sin(a) * s.r * 0.9, 0.6, p.z + Math.cos(a) * s.r * 0.9, 0, 0.5, 0, 0.25, 0.3, 0.05, col, 3);
    }
    if (!swordOn) this.sword.visible = false;

    // spear thrusts
    this.spears.forEach((g) => (g.visible = false));
    for (let i = this.thrusts.length - 1; i >= 0; i--) {
      const th = this.thrusts[i];
      th.t += dt;
      if (th.t > 0.36) { this.thrusts.splice(i, 1); continue; }
      const out = th.t < 0.1 ? th.t / 0.1 : 1 - (th.t - 0.1) / 0.26;
      const ux = Math.sin(th.ang), uz = Math.cos(th.ang);
      const g = this.spears[i % this.spears.length];
      g.visible = true;
      g.position.set(p.x + ux * (out * (th.len - 2.2)), 0, p.z + uz * (out * (th.len - 2.2)));
      g.rotation.y = th.ang;
      const fade = 1 - th.t / 0.36;
      const col = th.evo ? 0x8fd8ff : 0xfff2c8;
      this.streaks.add(p.x + ux * th.len / 2, 0.75, p.z + uz * th.len / 2, th.evo ? 0.9 : 0.55, th.len, Math.atan2(-ux, -uz), col, fade);
    }

    // the shield's shoves
    for (let i = this.bashes.length - 1; i >= 0; i--) {
      const b = this.bashes[i];
      b.t += dt;
      if (b.t > 0.3) { this.bashes.splice(i, 1); continue; }
      const k = b.t / 0.3, out = 0.5 + k * 0.6, fade = 1 - k;
      const col = b.evo ? 0xb8ffb0 : 0xc8a0ff;
      if (b.evo) this.rings.add(p.x, 0.3, p.z, b.r * 2 * out, b.r * 2 * out, 0, col, fade);
      else for (let j = 0; j < 2; j++) this.slashes.add(p.x, 0.45 + j * 0.01, p.z, b.r * 2.2 * out, b.r * 2.2 * out, b.ang + Math.PI, col, fade * (0.7 - j * 0.25));
    }

    // shots
    let arrows = 0;
    for (const s of sim.shots) {
      if (!cull(s.x, s.z)) continue;
      const ang = Math.atan2(s.vx, s.vz);
      if (s.kind === 'arrow') {
        if (arrows < 200) {
          this.q.setFromAxisAngle(this.up, ang);
          this.m.compose(this.v.set(s.x, 0.75, s.z), this.q, this.s.set(1, 1, 1));
          this.arrows.setMatrixAt(arrows++, this.m);
        }
        this.streaks.add(s.x - Math.sin(ang) * 0.7, 0.75, s.z - Math.cos(ang) * 0.7, 0.28, 1.4, Math.atan2(-Math.sin(ang), -Math.cos(ang)), s.evo ? 0x9fff7a : 0xfff0c0, 0.7);
        if (s.evo) this.glows.add(s.x, 0.75, s.z, 0.8, 0.8, 0, 0x9fff7a, 0.6);
      } else {
        const col = SHOT_COL[s.kind];
        const len = s.kind === 'laser' ? 1.6 : 0.9;
        this.streaks.add(s.x, 0.75, s.z, s.kind === 'laser' ? 0.42 : 0.5, len, Math.atan2(-Math.sin(ang), -Math.cos(ang)), col, 1);
        this.glows.add(s.x, 0.75, s.z, 1.1, 1.1, 0, col, 0.9);
        if (s.kind === 'ember' && Math.random() < 0.3) this.flames.emit(s.x, 0.75, s.z, 0, 0.8, 0, 0.3, 0.35, 0.05, 0xff7a2a, 2, -1);
      }
    }
    this.arrows.count = arrows;
    if (arrows) this.arrows.instanceMatrix.needsUpdate = true;

    // the wards circling the hero
    const ww = sim.weapon('wards');
    let wn = 0;
    if (ww && p.alive) {
      const st = sim.ws('wards');
      const R = st.size * sim.stats.areaK;
      for (let k = 0; k < st.n && wn < 8; k++) {
        const a = sim.wardAng + (k / st.n) * Math.PI * 2;
        const x = p.x + Math.sin(a) * R, z = p.z + Math.cos(a) * R;
        this.q.setFromAxisAngle(this.up, a);
        this.m.compose(this.v.set(x, 0.75, z), this.q, this.s.setScalar(ww.evo ? 1.2 : 1));
        this.wards.setMatrixAt(wn++, this.m);
        this.glows.add(x, 0.75, z, ww.evo ? 1.6 : 1.1, ww.evo ? 1.6 : 1.1, 0, ww.evo ? 0xffd27a : 0x7ac8ff, 0.45);
      }
    }
    this.wards.count = wn;
    if (wn) this.wards.instanceMatrix.needsUpdate = true;

    // torches in the air, fires on the ground
    let tn = 0;
    for (const tr of sim.torches) {
      const u = tr.t / tr.T;
      const x = tr.x0 + (tr.x1 - tr.x0) * u, z = tr.z0 + (tr.z1 - tr.z0) * u, y = 0.8 + Math.sin(u * Math.PI) * 2.4;
      if (tn < 16) {
        this.q.setFromEuler(new THREE.Euler(u * 9, Math.atan2(tr.x1 - tr.x0, tr.z1 - tr.z0), 0));
        this.m.compose(this.v.set(x, y, z), this.q, this.s.set(1, 1, 1));
        this.sticks.setMatrixAt(tn++, this.m);
      }
      this.glows.add(x, y + 0.2, z, 0.9, 0.9, 0, 0xffa040, 0.9);
      if (Math.random() < 0.7) this.flames.emit(x, y + 0.2, z, 0, 0.6, 0, 0.3, 0.4, 0.05, 0xffb050, 2, -1);
    }
    this.sticks.count = tn;
    if (tn) this.sticks.instanceMatrix.needsUpdate = true;
    this.emitAcc += dt;
    const emit = this.emitAcc > 1 / 30;
    if (emit) this.emitAcc = 0;
    for (const fr of sim.fires) {
      if (!cull(fr.x, fr.z)) continue;
      const k = Math.min(1, fr.t / 0.4) * Math.min(1, (fr.max - fr.t) / 0.15 + 0.3);
      this.discs.add(fr.x, 0.05, fr.z, fr.r * 2, fr.r * 2, t, fr.evo ? 0xff5a20 : 0xff7a20, 0.55 * k + Math.sin(t * 13 + fr.x) * 0.08);
      this.glows.add(fr.x, 0.3, fr.z, fr.r * 2.2, fr.r * 2.2, 0, 0xff7a2a, 0.35 * k);
      if (emit) {
        const n = Math.ceil(fr.r * 2.2);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * fr.r;
          this.flames.emit(fr.x + Math.sin(a) * d, 0.15, fr.z + Math.cos(a) * d, 0, 1.6 + Math.random(), 0, 0.5, 0.55, 0.12, Math.random() < 0.4 ? 0xffd070 : 0xff7a2a, 1, -1.5);
        }
      }
    }
    // the campfire
    if (emit && Math.abs(look(this).x) < 20 && Math.abs(look(this).z) < 26) {
      for (let i = 0; i < 2; i++) this.flames.emit((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, 0, 1.8 + Math.random(), 0, 0.6, 0.8, 0.15, Math.random() < 0.4 ? 0xffd070 : 0xff7a2a, 1, -1.2);
      if (Math.random() < 0.4) this.particles.emit((Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 2.5, (Math.random() - 0.5) * 0.6, 1.4, 0.12, 0.05, 0xffb050, 0.5, 0);
    }
    this.glows.add(0, 0.6, 0, 3, 3, 0, 0xff8a3a, 0.5 + Math.sin(t * 9) * 0.08);

    // goo
    for (const g of sim.goo) {
      if (!cull(g.x, g.z)) continue;
      const s = g.big ? 0.75 : 0.55;
      this.gooBB.add(g.x, 0.7, g.z, s, s, t * 4, 0xffffff, 1);
      this.glows.add(g.x, 0.7, g.z, s * 2.2, s * 2.2, 0, 0x8aff2a, 0.55);
      this.shadows.add(g.x, 0.03, g.z, s, s, 0, 0xffffff, 1);
    }

    // pickups: gems (green, blue, pink by value), coins, chests and the power-ups (an icon over a
    // beacon: a ring and a soft beam in its colour)
    let gn = 0, cn = 0, chn = 0;
    for (const q of sim.pickups) {
      if (!cull(q.x, q.z)) continue;
      const bob = 0.35 + Math.sin(t * 3 + q.x * 1.7) * 0.08;
      if (q.kind === 'gem') {
        if (gn >= 320) continue;
        const tier = q.value >= 20 ? 2 : q.value >= 4 ? 1 : 0;
        const sc = tier === 2 ? 1.8 : tier === 1 ? 1.35 : 1;
        this.q.setFromAxisAngle(this.up, t * 2 + q.x);
        this.m.compose(this.v.set(q.x, bob, q.z), this.q, this.s.setScalar(sc));
        this.gems.setMatrixAt(gn, this.m);
        this.gems.setColorAt(gn, this.c.setHex(GEM_COL[tier]));
        gn++;
        this.glows.add(q.x, bob, q.z, 0.7 * sc, 0.7 * sc, 0, GEM_COL[tier], 0.5);
      } else if (q.kind === 'coin') {
        if (cn >= 80) continue;
        this.q.setFromAxisAngle(this.up, t * 4 + q.x);
        this.m.compose(this.v.set(q.x, bob + 0.05, q.z), this.q, this.s.setScalar(1));
        this.coins.setMatrixAt(cn++, this.m);
        this.glows.add(q.x, bob, q.z, 0.8, 0.8, 0, 0xffc83a, 0.35);
      } else if (q.kind === 'chest') {
        if (chn >= 4) continue;
        this.q.setFromAxisAngle(this.up, 0.4 + Math.sin(t * 2) * 0.15);
        this.m.compose(this.v.set(q.x, Math.abs(Math.sin(t * 3)) * 0.12, q.z), this.q, this.s.setScalar(1.15 + Math.sin(t * 6) * 0.04));
        this.chests.setMatrixAt(chn, this.m);
        this.chestBands.setMatrixAt(chn++, this.m);
        this.glows.add(q.x, 0.7, q.z, 3.4, 3.4, 0, 0xffd23f, 0.55 + Math.sin(t * 5) * 0.15);
        this.glows.add(q.x, 2.2, q.z, 1.2, 5, 0, 0xffe07a, 0.3);
        this.rings.add(q.x, 0.05, q.z, 2.6, 2.6, 0, 0xffd23f, 0.6 + Math.sin(t * 5) * 0.2);
        this.flares.add(q.x, 1.2, q.z, 1.4, 1.4, t, 0xfff0a0, 0.6);
      } else {
        const id = q.kind as PowerId, c = POWER_HUE[id];
        const pulse = 0.5 + Math.sin(t * 5 + q.x) * 0.5;
        this.powers.get(id)!.add(q.x, bob + 0.55, q.z, 1.05, 1.05, 0, 0xffffff, 1);
        this.glows.add(q.x, bob + 0.55, q.z, 1.8, 1.8, 0, c, 0.45 + pulse * 0.2);
        this.glows.add(q.x, 1.8, q.z, 0.7, 3.6, 0, c, 0.18 + pulse * 0.1);
        this.rings.add(q.x, 0.05, q.z, 1.5 + pulse * 0.4, 1.5 + pulse * 0.4, 0, c, 0.75 - pulse * 0.3);
      }
      this.shadows.add(q.x, 0.03, q.z, 0.4, 0.4, 0, 0xffffff, 0.7);
    }
    this.gems.count = gn;
    if (gn) { this.gems.instanceMatrix.needsUpdate = true; this.gems.instanceColor!.needsUpdate = true; }
    this.coins.count = cn;
    if (cn) this.coins.instanceMatrix.needsUpdate = true;
    this.chests.count = this.chestBands.count = chn;
    if (chn) { this.chests.instanceMatrix.needsUpdate = true; this.chestBands.instanceMatrix.needsUpdate = true; }

    // level-up: a pillar of light on the hero
    if (this.levelT > 0) {
      this.levelT -= dt * 1.3;
      const k = Math.max(0, this.levelT);
      this.glows.add(p.x, 1.2, p.z, 2.4 * (1 + (1 - k)), 4 * k, 0, 0xfff07a, k);
      this.rings.add(p.x, 0.06, p.z, 2 + (1 - k) * 4, 2 + (1 - k) * 4, 0, 0xfff07a, k);
    }

    // one-shot flashes and rings
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t -= dt;
      if (fl.t <= 0) { this.flashes.splice(i, 1); continue; }
      const k = fl.t / fl.max;
      if (fl.kind === 'ring') this.rings.add(fl.x, fl.y, fl.z, fl.s * (1.15 - k * 0.6), fl.s * (1.15 - k * 0.6), 0, fl.c, k);
      else if (fl.kind === 'implode') { const r = fl.s * k * k; this.rings.add(p.x, 0.06, p.z, r, r, 0, fl.c, 1 - k * 0.5); }
      else if (fl.kind === 'glow') this.glows.add(fl.x, fl.y, fl.z, fl.s, fl.s, 0, fl.c, k);
      else this.flares.add(fl.x, fl.y, fl.z, fl.s * (0.6 + k * 0.4), fl.s * (0.6 + k * 0.4), t * 3, fl.c, k);
    }

    this.particles.update(dt, cq);
    this.flames.update(dt, cq);
    for (const b of [this.shadows, this.glows, this.flares, this.rings, this.discs, this.streaks, this.lanes, this.slashes, this.gooBB, ...this.powers.values()]) b.end();
  }

  /** Game pixels of a world point. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const s = this.world.toScreen(new THREE.Vector3(x, y, z));
    return { x: s.x, y: s.y };
  }

  /** Puts the camera on the hero at once (tests, after a teleport). */
  snap(sim: Sim): void { this.camLook.set(sim.player.x, 0, sim.player.z - this.lookAhead); }

  /** The camera's focus (tests, the bot's view). */
  get focus(): THREE.Vector3 { return this.camLook; }

  dispose(): void {
    this.hero.dispose();
    this.robot.dispose();
    for (const b of this.bosses.values()) b.fig.dispose();
  }
}

const look = (v: View) => v.focus;

function instanced(sc: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, color: boolean): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  m.frustumCulled = false;
  m.count = 0;
  sc.add(m);
  return m;
}

/** Frees a boss's own materials when it leaves mid-round (the shared model resources stay). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
    // what the view built itself (the Rot King's crown)
    if (o.userData.own) mesh.geometry.dispose();
  });
}

/** Concatenates simple geometries (position, normal, uv) into one non-indexed geometry. */
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.getAttribute('position').count;
    P.set(g.getAttribute('position').array as Float32Array, o * 3);
    N.set(g.getAttribute('normal').array as Float32Array, o * 3);
    U.set(g.getAttribute('uv').array as Float32Array, o * 2);
    o += c;
  }
  for (const g of [...list, ...parts]) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}

/** A grass texture: a mottled green with tufts and dark specks (drawn once per page). */
function grassTexture(): THREE.CanvasTexture {
  return canvasTex('grass', 256, 256, (g) => {
    const S = 256;
    g.fillStyle = '#5f9a4c';
    g.fillRect(0, 0, S, S);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd() < 0.5 ? '86,140,66' : '110,164,80';
      grd.addColorStop(0, `rgba(${c},0.55)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    }
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S, y = rnd() * S;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(130,184,96,0.7)' : 'rgba(70,120,56,0.7)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 4); g.stroke();
    }
  });
}

export type { WeaponId };
