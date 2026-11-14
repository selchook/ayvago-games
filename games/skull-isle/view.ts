// Skull Isle: draws a run (sim.ts) in 3D. The island is one ground mesh (sand, wet sand, grass in
// vertex colours) over a shader sea that knows the coastline; its scenery is two merged meshes
// (the Quaternius props in vertex colours, the Kenney rocks and crates on their texture). People
// are the kit's rigged models from pools (figure.ts). Loot, shots, barrels and power-ups are
// instanced models; telegraphs, glows, slashes, splashes and sparks are instanced billboards. The
// Play scene and the menu's autopilot both use it, so the menu also compiles every shader the
// first Play frame needs (kit.ts keepPrograms).
import Phaser from 'phaser';
import { World3D, THREE, model } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim, SimEvent, Foe } from './sim';
import { PLAYER, POWER_COLOR, POWER_IDS, type HeroId, type PowerId } from './defs';
import { PALETTES, shoreAt, shorePoint, landD, type Layout } from './island';
import { pk, kk, mergeModels, soloGeometry, keepPrograms, kenneyMap, sceneryMaterial, type Placed } from './kit';
import { Billboards, Particles, Telegraphs, TEX, SHAPE, waterMaterial, setCoast } from './fx3d';
import { Figure, FigurePool } from './figure';

export const CAM = { fov: 42, tilt: 58, dist: 21 };
const TENTACLE_H = 15.67;
const CLIP: Record<string, number> = { Sword: 0.87, Punch: 0.77, Jump: 0.37, Duck: 1.67 };

interface FoeView { fig: Figure | null; pool: FigurePool | null; kind: Foe['kind']; state: string; dead: boolean; seen: boolean }
interface Swing { a0: number; arc: number; r: number; t: number; dur: number; spin: boolean; big: boolean }
interface Flash { x: number; y: number; z: number; s: number; t: number; max: number; c: number; kind: 'glow' | 'ring' | 'flare' }
interface Splat { x: number; z: number; s: number; t: number; max: number; c: number; rot: number }

const lerpAng = (a: number, b: number, k: number) => {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * k;
};

export class View {
  readonly world: World3D;
  readonly camQ = new THREE.Quaternion();
  readonly particles: Particles;
  readonly dust: Particles;
  private hemi!: THREE.HemisphereLight;
  private pirateMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private kenneyMat: THREE.MeshLambertMaterial;
  private sceneryMat: THREE.MeshLambertMaterial;
  private sceneryKMat: THREE.MeshLambertMaterial;
  /** The hero (chest height) and the camera, for the scenery's see-through. */
  private heroAt = new THREE.Vector3();
  private camAt = new THREE.Vector3();
  private groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private water: THREE.Mesh;
  private waterMat: THREE.ShaderMaterial;
  private ground: THREE.Mesh | null = null;
  private scenery: THREE.Mesh[] = [];
  private ship: THREE.Object3D | null = null;
  private shipAt = { x: 0, z: 0, rot: 0, beached: false, y: 0 };
  private builtK = -1;
  hero: Figure;
  private heroId: HeroId;
  private pistol: THREE.Object3D;
  private parrot: THREE.Object3D;
  private pools: Record<string, FigurePool>;
  private foes = new Map<number, FoeView>();
  private kraken: THREE.Mesh;
  private krakenMat: THREE.MeshLambertMaterial;
  private krakenFlash = 0;
  // instanced things
  private coins: THREE.InstancedMesh;
  private bags: THREE.InstancedMesh;
  private chests: THREE.InstancedMesh;
  private chestsOpen: THREE.InstancedMesh;
  private powers: Record<PowerId, THREE.InstancedMesh>;
  private skulls: THREE.InstancedMesh;
  private balls: THREE.InstancedMesh;
  private kegs: THREE.InstancedMesh;
  private barrels: THREE.InstancedMesh;
  // billboards
  private shadows: Billboards;
  private glows: Billboards;
  private flares: Billboards;
  private rings: Billboards;
  private discs: Billboards;
  private streaks: Billboards;
  private slashes: Billboards;
  private inkBB: Billboards;
  private splats: Billboards;
  private bubbles: Billboards;
  private teles: Telegraphs;
  private swings: Swing[] = [];
  private flashes: Flash[] = [];
  private splatList: Splat[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private camLook = new THREE.Vector3();
  private camOff = new THREE.Vector3();
  private focusT = 0;
  private focusAt = new THREE.Vector3();
  private zoom = 1;
  zoomTarget = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private time = 0;
  private lookAhead = -1.2;
  private stepT = 0;
  heroDead = false;
  /** The hero's spin (finisher) and roll (dodge) in progress. */
  private spinT = 0;
  private spinDur = 0;
  private rollT = 0;
  private pistolT = 0;
  private lastState = '';
  /** Seconds the hero blinks (after a hit, a second wind). */
  private blinkT = 0;

  constructor(private phaser: Phaser.Scene, o: { hero: HeroId; menu?: boolean }) {
    if (o.menu) this.lookAhead = 4.5;
    const pal = PALETTES.cove;
    const world = new World3D(phaser, { fov: CAM.fov, near: 0.5, far: 160, background: pal.sky, fog: { color: pal.fog, near: 34, far: 70 } });
    this.world = world;
    world.addLights({ sky: pal.hemiSky, ground: pal.hemiGround, ambient: pal.ambient, sun: pal.sun, intensity: pal.sunI, dir: [-0.55, 1, 0.45], extent: 13 });
    world.scene.traverse((ob) => { if ((ob as THREE.HemisphereLight).isHemisphereLight) this.hemi = ob as THREE.HemisphereLight; });
    world.sun!.shadow.mapSize.set(1024, 1024);
    const sc = world.scene;
    const a = THREE.MathUtils.degToRad(CAM.tilt);
    this.camOff.set(0, Math.sin(a) * CAM.dist, Math.cos(a) * CAM.dist);
    this.kenneyMat = new THREE.MeshLambertMaterial({ map: kenneyMap() });
    this.sceneryMat = sceneryMaterial(this.heroAt, this.camAt);
    this.sceneryKMat = sceneryMaterial(this.heroAt, this.camAt, this.kenneyMat.map);

    // the sea
    this.waterMat = waterMaterial();
    const wgeo = new THREE.PlaneGeometry(200, 200, 90, 90);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, this.waterMat);
    this.water.position.y = -0.22;
    this.water.renderOrder = -1;
    sc.add(this.water);

    // the hero
    this.heroId = o.hero;
    this.hero = new Figure(pk(o.hero), 1, { shadows: true });
    sc.add(this.hero.root);
    this.pistol = this.makePistol();
    this.parrot = model(pk('parrot'), { shadows: false });
    this.parrot.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = this.pirateMat; });
    this.parrot.visible = false;
    sc.add(this.parrot);

    // foes: pools of figures (a few built ahead so the menu compiles their programs)
    this.pools = {
      skeleton: new FigurePool(sc, pk('skeleton'), 1, {}, 1),
      headless: new FigurePool(sc, pk('headless'), 1, {}, 1),
      shark: new FigurePool(sc, pk('shark'), 0.5, { mid: 0 }, 1),
      tentacle: new FigurePool(sc, pk('tentacle'), 1, { mid: 0 }, 1),
    };
    this.krakenMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.kraken = new THREE.Mesh(krakenGeometry(), this.krakenMat);
    this.kraken.visible = false;
    this.kraken.castShadow = true;
    sc.add(this.kraken);

    // instanced loot, shots and barrels
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadow = false) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.count = 0;
      im.visible = false;
      sc.add(im);
      return im;
    };
    const pm = this.pirateMat;
    this.coins = inst(soloGeometry(pk('coin'), 'color', 0.9), pm, 120);
    this.bags = inst(soloGeometry(pk('goldbag'), 'color', 0.85), pm, 24);
    this.chests = inst(soloGeometry(pk('chest-closed'), 'color', 0.85), pm, 4, true);
    this.chestsOpen = inst(soloGeometry(pk('chest-gold'), 'color', 0.7), pm, 4, true);
    const ghost = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.75, emissive: 0x2a8aa0 });
    this.powers = {
      rum: inst(soloGeometry(kk('bottle-large'), 'uv', 0.75), this.kenneyMat, 4),
      keg: inst(soloGeometry(pk('barrel'), 'color', 0.75), pm, 4),
      parrot: inst(soloGeometry(pk('parrot'), 'color', 1), pm, 4),
      shield: inst(soloGeometry(pk('skull'), 'color', 1.3), ghost, 4),
      gold2: inst(soloGeometry(pk('coins'), 'color', 1.4), pm, 4),
      fury: inst(soloGeometry(pk('cutlass'), 'color', 0.75), pm, 4),
      fish: inst(soloGeometry(pk('fish'), 'color', 0.6), pm, 4),
    };
    this.skulls = inst(soloGeometry(pk('skull'), 'color', 1), pm, 12);
    this.balls = inst(soloGeometry(kk('cannon-ball'), 'uv', 0.6), this.kenneyMat, 20, true);
    this.kegs = inst(soloGeometry(pk('barrel'), 'color', 0.62), pm, 6, true);
    const barrelGeo = soloGeometry(pk('barrel'), 'color', 1.05).clone();
    barrelGeo.translate(0, -0.35, 0);
    barrelGeo.rotateZ(Math.PI / 2);
    this.barrels = inst(barrelGeo, pm, 6, true);

    // effects
    const glow = TEX.glow();
    this.shadows = new Billboards(sc, TEX.shadow(), 160, { blend: 'normal', flat: true, order: 1 });
    this.splats = new Billboards(sc, TEX.splat(), 40, { blend: 'normal', flat: true, order: 2 });
    this.discs = new Billboards(sc, TEX.disc(), 24, { flat: true, order: 2, blend: 'normal' });
    this.rings = new Billboards(sc, TEX.ring(), 80, { flat: true, order: 4 });
    this.slashes = new Billboards(sc, TEX.slash(), 24, { flat: true, order: 14 });
    this.glows = new Billboards(sc, glow, 260, { order: 11 });
    this.flares = new Billboards(sc, TEX.flare(), 80, { order: 15 });
    this.streaks = new Billboards(sc, TEX.streak(), 40, { order: 13 });
    this.inkBB = new Billboards(sc, TEX.ink(), 16, { blend: 'normal', order: 16 });
    this.bubbles = new Billboards(sc, TEX.bubble(), 4, { order: 17 });
    this.teles = new Telegraphs(sc, 48);
    this.particles = new Particles(sc, glow, 900);
    this.dust = new Particles(sc, TEX.soft(), 400, 'normal', 12);

    world.camera.position.set(0, 10, 10);
    if (o.menu) {
      // every kind of figure and material once, so the programs are compiled behind the menu
      for (const p of Object.values(this.pools)) { const f = p.take(); p.give(f); }
      this.buildIsland(null);
      keepPrograms(world.renderer, sc, world.camera);
    }
  }

  private makePistol(): THREE.Object3D {
    const p = model(pk('pistol'), { shadows: false });
    p.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = this.pirateMat; });
    const g = new THREE.Group();
    g.add(p);
    p.scale.setScalar(0.7);
    p.rotation.set(0, -Math.PI / 2, 0);
    g.visible = false;
    this.world.scene.add(g);
    return g;
  }

  /** Swaps the hero (the menu's hero selector). */
  setHero(id: HeroId): void {
    if (id === this.heroId) return;
    this.heroId = id;
    const old = this.hero;
    const fresh = new Figure(pk(id), 1, { shadows: true });
    fresh.root.position.copy(old.root.position);
    fresh.root.rotation.copy(old.root.rotation);
    this.world.scene.add(fresh.root);
    this.world.scene.remove(old.root);
    old.dispose();
    old.mat.dispose();
    old.body.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); });
    this.hero = fresh;
    this.lastState = '';
    this.particles.burst(fresh.root.position.x, 0.8, fresh.root.position.z, 24, 5, [0xffd23f, 0xffffff], 0.6, 0.4, 1.2);
  }

  // ------------------------------------------------------------------ the island

  /** Builds the island (ground, scenery, palette); `null` builds a neutral one for the menu warm-up. */
  buildIsland(L: Layout | null, sim?: Sim): void {
    const lay = L ?? sim?.L;
    if (!lay) {
      // a tiny island just to compile the ground and scenery programs
      this.makeGround({ id: 'cove', lap: 0, rx: 6, rz: 6, harm: [[3, 0.05, 0], [5, 0.02, 0], [2, 0.03, 0]], props: [{ model: 'palm1', x: 0, z: -2, rot: 0, s: 1, r: 0 }, { model: 'k:crate', x: 2, z: 0, rot: 0, s: 1, r: 0 }], tentacleSpots: [], ship: null, pools: [], grass: [], palette: PALETTES.cove });
      return;
    }
    this.makeGround(lay);
  }

  private makeGround(L: Layout): void {
    const sc = this.world.scene;
    if (this.ground) { sc.remove(this.ground); this.ground.geometry.dispose(); }
    for (const m of this.scenery) { sc.remove(m); m.geometry.dispose(); }
    this.scenery = [];
    if (this.ship) { sc.remove(this.ship); this.ship = null; }
    const pal = L.palette;
    // palette
    (sc.background as THREE.Color).setHex(pal.sky);
    (sc.fog as THREE.Fog).color.setHex(pal.fog);
    this.hemi.color.setHex(pal.hemiSky);
    this.hemi.groundColor.setHex(pal.hemiGround);
    this.hemi.intensity = pal.ambient;
    this.world.sun!.color.setHex(pal.sun);
    this.world.sun!.intensity = pal.sunI;
    const u = this.waterMat.uniforms;
    (u.uDeep.value as THREE.Color).setHex(pal.deep);
    (u.uShallow.value as THREE.Color).setHex(pal.shallow);
    (u.uFoam.value as THREE.Color).setHex(pal.foam);
    (u.uSky.value as THREE.Color).setHex(pal.fog);
    setCoast(this.waterMat, L);

    // the ground: a polar mesh out from the centre past the shore, sloping under the sea
    const SEG = 150, RINGS: number[] = [0, 0.05, 0.1, 0.16, 0.22, 0.28, 0.34, 0.4, 0.46, 0.52, 0.58, 0.64, 0.7, 0.75, 0.8, 0.85, 0.89, 0.93, 0.96, 0.985, 1];
    const OUT = [0.6, 1.4, 2.6, 4.5, 7];
    const rows = RINGS.length + OUT.length;
    const P: number[] = [], C: number[] = [], I: number[] = [];
    const sand = new THREE.Color(pal.sand), wet = new THREE.Color(pal.wet), grass = new THREE.Color(pal.grass), tmp = new THREE.Color();
    const noise = (x: number, z: number) => Math.sin(x * 1.3 + z * 0.7) * 0.5 + Math.sin(x * 0.37 - z * 1.9) * 0.5;
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const R = shoreAt(L, th);
      for (let j = 0; j < rows; j++) {
        const r = j < RINGS.length ? R * RINGS[j] : R + OUT[j - RINGS.length];
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        const d = r - R;
        let y = d < -1.1 ? 0 : -(d + 1.1) / 4.2;
        y = Math.max(-1.6, y) + (d < -2 ? noise(x, z) * 0.05 : 0);
        P.push(x, y, z);
        // colours: sand with soft variation, wet sand at the waterline, grass patches inland
        tmp.copy(sand).multiplyScalar(0.95 + noise(x * 2, z * 2) * 0.05);
        const wk = THREE.MathUtils.smoothstep(d, -2.2, -0.4);
        tmp.lerp(wet, wk * 0.85);
        for (const g of L.grass) {
          const gd = Math.hypot(x - g.x, z - g.z) + noise(x * 1.7, z * 1.7) * 0.6;
          if (gd < g.r) tmp.lerp(grass, THREE.MathUtils.smoothstep(g.r - gd, 0, 0.5) * 0.62);
        }
        for (const q of L.pools) {
          const qd = Math.hypot(x - q.x, z - q.z);
          if (qd < q.r + 0.4) tmp.lerp(wet, THREE.MathUtils.smoothstep(q.r + 0.4 - qd, 0, 0.8) * 0.7);
        }
        C.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = i * rows + j, b = (i + 1) * rows + j;
        I.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.receiveShadow = true;
    sc.add(this.ground);

    // scenery: the Quaternius props in one mesh, the Kenney ones in another
    const pir: Placed[] = [], ken: Placed[] = [];
    for (const p of L.props) {
      if (!p.model) continue;
      const k = p.model.startsWith('k:');
      const y = (p.y ?? 0) + Math.min(0, -(landD(L, p.x, p.z) + 1.1) / 4.2);
      (k ? ken : pir).push({ key: k ? kk(p.model.slice(2)) : pk(p.model), x: p.x, y, z: p.z, rot: p.rot, s: p.s });
    }
    // a ship of the crew rides at anchor off the north shore (the island's own ship takes its place)
    if (L.ship) this.shipAt = { ...L.ship, y: L.ship.beached ? -0.6 : -0.9 };
    else { const sp = shorePoint(L, -Math.PI / 2 - 0.32, 6.0); this.shipAt = { x: sp.x, z: sp.z, rot: 0.12, beached: false, y: -0.95 }; }
    if (pir.length) { const m = new THREE.Mesh(mergeModels(pir, 'color'), this.sceneryMat); m.castShadow = true; m.receiveShadow = true; sc.add(m); this.scenery.push(m); }
    if (ken.length) { const m = new THREE.Mesh(mergeModels(ken, 'uv'), this.sceneryKMat); m.castShadow = true; m.receiveShadow = true; sc.add(m); this.scenery.push(m); }
    const ship = new THREE.Mesh(mergeModels([{ key: pk('ship-large'), x: 0, y: 0, z: 0, rot: 0, s: 1 }], 'color'), this.sceneryMat);
    ship.castShadow = true;
    this.scenery.push(ship);
    this.ship = ship;
    sc.add(ship);
    this.placeShip(0);
  }

  private placeShip(t: number): void {
    if (!this.ship) return;
    const s = this.shipAt;
    this.ship.position.set(s.x, s.y + (s.beached ? 0 : Math.sin(t * 0.9) * 0.12), s.z);
    this.ship.rotation.set(s.beached ? 0.05 : Math.sin(t * 0.7) * 0.025, s.rot, s.beached ? 0.22 : Math.sin(t * 0.8 + 1) * 0.04, 'YXZ');
  }

  // ------------------------------------------------------------------ events

  handle(ev: SimEvent, sim: Sim): void {
    const P = this.particles, D = this.dust, pal = sim.L.palette;
    switch (ev.type) {
      case 'island':
        if (this.builtK === ev.k && this.ground) break;
        this.clearFoes();
        this.makeGround(sim.L);
        this.builtK = ev.k;
        this.snap(sim);
        break;
      case 'swing': {
        const p = sim.p, s = sim.p.stepDef!;
        const big = ev.last;
        this.swings.push({ a0: p.face, arc: s.arc, r: s.range, t: 0, dur: Math.min(0.3, ev.dur * 0.7), spin: ev.spin, big });
        const clip = ev.anim;
        // the clip's strike lands about half-way: speed it up so it lands with the step's hit
        const speed = Math.max(1, (CLIP[clip] ?? 0.8) * 0.5 / Math.max(0.08, s.hit / sim.atkMul));
        this.hero.play(clip, { once: true, restart: true, speed, fade: 0.06 });
        this.lastState = 'attack';
        if (ev.spin) { this.spinT = 0; this.spinDur = ev.dur * 0.75; }
        break;
      }
      case 'hit': {
        const fv = this.foes.get(ev.id);
        fv?.fig?.flash();
        if (ev.kind === 'head') this.krakenFlash = 0.1;
        const y = ev.kind === 'shark' ? 0.4 : 0.9;
        this.flashes.push({ x: ev.x, y, z: ev.z, s: ev.crit ? 1.5 : ev.heavy ? 1.1 : 0.75, t: 0.12, max: 0.12, c: ev.crit ? 0xfff07a : 0xdde8ff, kind: 'flare' });
        const bone = ev.kind === 'skel' || ev.kind === 'thrower' || ev.kind === 'brute' || ev.kind === 'runner' || ev.kind === 'captain';
        P.burst(ev.x, y, ev.z, ev.heavy ? 10 : 5, ev.heavy ? 6 : 4, bone ? [0xfff4dc, 0xd8c8a0] : ev.kind === 'shark' ? [0xbfe8ff, 0xffffff] : [0xff9ad0, 0xc84a90], 0.35, 0.3, 0.9, 6);
        break;
      }
      case 'kill': {
        const big = ev.kind === 'brute' || ev.boss;
        P.burst(ev.x, 0.8, ev.z, big ? 26 : 12, big ? 7 : 5, [0xfff4dc, 0xffe2a0, 0xffffff], 0.6, 0.45, 1.1, 6);
        D.burst(ev.x, 0.2, ev.z, 8, 2.5, [pal.sand, pal.wet], 0.8, 0.8, 0.4, 1);
        if (big) this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 4, t: 0.4, max: 0.4, c: 0xffe2a0, kind: 'ring' });
        break;
      }
      case 'hurt':
        this.hero.hurtFlush(1);
        this.blinkT = PLAYER.hurtInvuln;
        P.burst(sim.p.x, 0.9, sim.p.z, 8, 4, [0xff4a4a, 0xff9a9a], 0.35, 0.3, 0.8, 5);
        if (ev.dmg >= 15) this.shake(0.3, 0.2);
        break;
      case 'block':
        this.flashes.push({ x: ev.x, y: 0.9, z: ev.z, s: 3, t: 0.3, max: 0.3, c: 0x7fe8ff, kind: 'glow' });
        P.burst(ev.x, 0.9, ev.z, 14, 5, [0x7fe8ff, 0xffffff], 0.4, 0.35, 0.9);
        break;
      case 'dodge':
        this.rollT = 0;
        this.hero.play('Duck', { restart: true, speed: 3.2, fade: 0.05 });
        this.lastState = 'dodge';
        D.burst(ev.x, 0.15, ev.z, 10, 3, [pal.sand, pal.wet], 0.6, 0.7, 0.4, 1);
        break;
      case 'special':
        if (ev.which === 'pistol') { this.hero.play('Punch', { once: true, restart: true, speed: 1.6, fade: 0.05 }); this.pistolT = 0.5; }
        else this.hero.play('Wave', { once: true, restart: true, speed: 1.8, fade: 0.08 });
        this.lastState = 'special';
        break;
      case 'fire':
        if (ev.kind === 'bullet') {
          const p = sim.p;
          const fx = p.x + Math.sin(p.face) * 0.9, fz = p.z + Math.cos(p.face) * 0.9;
          this.flashes.push({ x: fx, y: 1.0, z: fz, s: 1.4, t: 0.09, max: 0.09, c: 0xffd25a, kind: 'flare' });
          D.burst(fx, 1.0, fz, 6, 1.5, [0xdddddd, 0xaaaaaa], 0.6, 0.5, 0.6, -0.5);
          this.shake(0.12, 0.08);
        } else if (ev.kind === 'cannon' && this.ship) {
          for (let i = 0; i < 3; i++) {
            const x = this.ship.position.x + (i - 1) * 2.5, z = this.ship.position.z + 1.5;
            this.flashes.push({ x, y: 1.2, z, s: 2.2, t: 0.12, max: 0.12, c: 0xffc060, kind: 'flare' });
            D.burst(x, 1.2, z, 8, 2, [0xd8d8d8, 0xb0b0b0], 1, 1.2, 0.5, -0.4);
          }
        } else if (ev.kind === 'ink') P.burst(ev.x, 2.4, ev.z, 10, 3, [0x5a2a7a, 0x2a0a40], 0.5, 0.5, 1, 4);
        break;
      case 'boom': {
        const big = ev.kind === 'barrage' || ev.kind === 'keg' || ev.kind === 'cannon';
        const col = ev.kind === 'ink' ? 0x8a4ac8 : ev.kind === 'slam' ? 0xffd2a0 : 0xffa040;
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: ev.r * 2.3, t: 0.45, max: 0.45, c: col, kind: 'ring' });
        if (big) {
          this.flashes.push({ x: ev.x, y: 0.8, z: ev.z, s: ev.r * 1.8, t: 0.2, max: 0.2, c: 0xffb060, kind: 'glow' });
          P.burst(ev.x, 0.6, ev.z, 16, 7, [0xffd27a, 0xff8a2a, 0xff5a1a], 0.5, 0.55, 1, 4);
          D.burst(ev.x, 0.4, ev.z, 8, 4, [0x7a6a5a, 0x4a4038, pal.sand], 0.8, 0.85, 0.8, 0.5);
          this.splatList.push({ x: ev.x, z: ev.z, s: ev.r * 1.5, t: 5, max: 5, c: 0x5a4028, rot: Math.random() * 6 });
          this.shake(ev.kind === 'barrage' ? 0.25 : 0.4, 0.22);
        } else if (ev.kind === 'ink') {
          this.splatList.push({ x: ev.x, z: ev.z, s: ev.r * 2, t: 5, max: 5, c: 0x30104a, rot: Math.random() * 6 });
          P.burst(ev.x, 0.4, ev.z, 12, 4, [0x8a4ac8, 0x30104a], 0.5, 0.45, 0.8, 5);
        } else if (ev.kind === 'slam') {
          D.burst(ev.x, 0.2, ev.z, 22, 6, [pal.sand, pal.wet, 0xffffff], 0.9, 1, 0.5, 1);
          this.shake(0.35, 0.22);
        } else if (ev.kind === 'skull') {
          P.burst(ev.x, 0.5, ev.z, 10, 4, [0xfff4dc, 0x9aff7a], 0.5, 0.4, 0.9, 5);
          D.burst(ev.x, 0.2, ev.z, 8, 3, [pal.sand], 0.7, 0.7, 0.5, 1);
        } else D.burst(ev.x, 0.2, ev.z, 10, 3.5, [pal.sand, pal.wet], 0.7, 0.8, 0.5, 1);
        break;
      }
      case 'splash': {
        const n = ev.big ? 26 : 12;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * (ev.big ? 4 : 2.5);
          P.emit(ev.x, 0, ev.z, Math.cos(a) * v * 0.6, 4 + Math.random() * (ev.big ? 6 : 3), Math.sin(a) * v * 0.6, 0.8, 0.5, 0.2, i % 3 ? 0xdff8ff : 0x8fe0ff, 0.6, 14);
        }
        this.flashes.push({ x: ev.x, y: -0.1, z: ev.z, s: ev.big ? 5 : 3, t: 0.6, max: 0.6, c: 0xe8fbff, kind: 'ring' });
        break;
      }
      case 'coin': {
        const p = sim.p;
        P.emit(p.x, 1.2, p.z, 0, 2.5, 0, 0.4, ev.bag ? 0.9 : 0.5, 0.1, 0xffe27a, 1, 0);
        if (ev.bag) P.burst(p.x, 1, p.z, 8, 3, [0xffd23f, 0xffffff], 0.4, 0.35, 1.2);
        break;
      }
      case 'power': {
        const c = POWER_COLOR[ev.power];
        P.burst(ev.x, 0.8, ev.z, 22, 5, [c, 0xffffff], 0.6, 0.45, 1.3);
        this.flashes.push({ x: sim.p.x, y: 0.1, z: sim.p.z, s: 3.5, t: 0.5, max: 0.5, c, kind: 'ring' });
        if (ev.power === 'parrot') { this.parrot.position.set(sim.p.x, 3, sim.p.z); }
        break;
      }
      case 'chest':
        P.burst(ev.x, 0.7, ev.z, 36, 7, [0xffd23f, 0xffffff, 0xff9a3a], 0.9, 0.5, 1.6, 3);
        this.flashes.push({ x: ev.x, y: 0.9, z: ev.z, s: 4, t: 0.4, max: 0.4, c: 0xffe27a, kind: 'glow' });
        this.shake(0.15, 0.12);
        break;
      case 'spawn':
        if (ev.kind === 'skel' || ev.kind === 'runner' || ev.kind === 'thrower' || ev.kind === 'brute') {
          D.burst(ev.x, 0.15, ev.z, 12, 2.5, [pal.sand, pal.wet], 1, 0.9, 0.6, 1);
          this.flashes.push({ x: ev.x, y: 0.06, z: ev.z, s: 1.6, t: 0.7, max: 0.7, c: 0x6ad050, kind: 'ring' });
        }
        break;
      case 'bossDown':
        P.burst(ev.x, 1.5, ev.z, 70, 11, [0xffd23f, 0xffffff, 0xff9ad0], 1.1, 0.9, 1.4, 4);
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 10, t: 0.9, max: 0.9, c: 0xffe2a0, kind: 'ring' });
        this.shake(0.8, 0.6);
        break;
      case 'secondWind':
        this.blinkT = 2.2;
        this.flashes.push({ x: sim.p.x, y: 0.1, z: sim.p.z, s: 9, t: 0.7, max: 0.7, c: 0xfff0a0, kind: 'ring' });
        P.burst(sim.p.x, 0.8, sim.p.z, 40, 8, [0xfff0a0, 0xffffff, 0xffb03a], 0.9, 0.6, 1.6, 2);
        break;
      case 'death':
        this.heroDead = true;
        this.hero.play('Death', { once: true, restart: true, fade: 0.1 });
        P.burst(sim.p.x, 0.8, sim.p.z, 20, 5, [0xff4a4a, 0xffffff], 0.7, 0.5, 1, 4);
        break;
      case 'peck':
        P.burst(ev.x, 1.1, ev.z, 6, 3, [0x6fe36a, 0xffffff, 0x4ab0ff], 0.35, 0.3, 0.8, 4);
        break;
      case 'keg':
        this.hero.play('Punch', { once: true, restart: true, speed: 1.8, fade: 0.05 });
        this.lastState = 'special';
        break;
      case 'lunge':
        D.burst(ev.x, 0.2, ev.z, 10, 3, [0xdff8ff], 0.6, 0.6, 0.6, 2);
        break;
      case 'heal':
        P.burst(sim.p.x, 1, sim.p.z, 16, 3, [0x7affa0, 0xffffff], 0.8, 0.4, 1.5, -1);
        break;
      default:
        break;
    }
  }

  shake(amp: number, t: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, t);
  }

  /** The camera looks at (x, z) for `t` seconds (the boss's entrance). */
  focus(x: number, z: number, t: number): void {
    this.focusAt.set(x, 0, z);
    this.focusT = t;
  }

  // ------------------------------------------------------------------ frame

  /** Draws a frame; `anim` slows the figures and effects (hit-stop, slow motion) but not the camera. */
  sync(sim: Sim, rdt: number, anim = 1): void {
    const dt = rdt * anim;
    this.time += dt;
    if (this.builtK !== sim.k) { this.clearFoes(); this.makeGround(sim.L); this.builtK = sim.k; this.snap(sim); }
    const p = sim.p;
    const world = this.world;
    this.waterMat.uniforms.uTime.value = this.time;
    this.placeShip(this.time);

    // camera: follows the hero (with a look past them), pulls back for bosses, a touch of shake
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, rdt * 1.5);
    const look = this.camLook;
    let tx = p.x, tz = p.z - this.lookAhead;
    if (this.focusT > 0) { this.focusT -= rdt; tx = this.focusAt.x; tz = this.focusAt.z; }
    // keep a little of the island's middle in view so the far shore shows
    tx = THREE.MathUtils.clamp(tx, -sim.L.rx + 4, sim.L.rx - 4);
    const k = Math.min(1, rdt * (this.focusT > 0 ? 2.2 : 4));
    look.x += (tx - look.x) * k;
    look.z += (tz - look.z) * k;
    const cam = world.camera;
    cam.position.set(look.x + this.camOff.x * this.zoom, this.camOff.y * this.zoom, look.z + this.camOff.z * this.zoom);
    if (this.shakeT > 0) {
      this.shakeT -= rdt;
      const a = this.shakeAmp * Math.min(1, this.shakeT * 4);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    cam.lookAt(look.x, 0, look.z);
    cam.updateMatrixWorld();
    this.camQ.copy(cam.quaternion);
    this.camAt.copy(cam.position);
    this.heroAt.set(sim.p.x, 0.8, sim.p.z);
    this.waterMat.uniforms.uCam.value.copy(cam.position);
    world.followSun(this.v.set(look.x, 0, look.z - 2));

    this.syncHero(sim, dt);
    this.syncFoes(sim, dt, look);
    this.syncFx(sim, dt);
  }

  private syncHero(sim: Sim, dt: number): void {
    const p = sim.p, h = this.hero;
    h.root.position.set(p.x, 0, p.z);
    h.root.rotation.y = lerpAng(h.root.rotation.y, p.face, Math.min(1, dt * 18));
    const sp = Math.hypot(p.vx, p.vz);
    const st = p.state;
    if (!this.heroDead) {
      if (st === 'idle' || st === 'run') {
        if (sp > 0.6) {
          h.play('Run', { speed: Math.max(0.6, sp / 5.2), fade: 0.12 });
          // sand kicked up by the feet
          this.stepT -= dt;
          if (this.stepT <= 0) { this.stepT = 0.16; this.dust.emit(p.x - Math.sin(p.face) * 0.3, 0.1, p.z - Math.cos(p.face) * 0.3, (Math.random() - 0.5) * 0.6, 0.8, (Math.random() - 0.5) * 0.6, 0.5, 0.35, 0.6, sim.L.palette.sand, 2, 2); }
        } else if (sim.phase === 'cleared' || sim.phase === 'shop' || sim.phase === 'draft') h.play('Yes', { fade: 0.25 });
        else h.play('Idle', { fade: 0.2 });
        this.lastState = st;
      } else if (st === 'hurt' && this.lastState !== 'hurt') { h.play('HitReact', { once: true, restart: true, speed: 1.4, fade: 0.05 }); this.lastState = 'hurt'; }
      else if (st === 'cheer') h.play('Yes', { fade: 0.2 });
    }
    // the finisher spins the whole figure; the roll turns it head over heels
    h.pivot.rotation.set(0, 0, 0);
    if (this.spinDur > 0) {
      this.spinT += dt;
      const u = Math.min(1, this.spinT / this.spinDur);
      h.pivot.rotation.y = -(1 - (1 - u) * (1 - u)) * Math.PI * 2;
      if (u >= 1) this.spinDur = 0;
    }
    if (st === 'dodge') {
      this.rollT += dt;
      const u = Math.min(1, this.rollT / PLAYER.dodgeTime);
      h.pivot.rotation.x = u * Math.PI * 2;
      h.pivot.position.y = 0.45 + Math.sin(u * Math.PI) * 0.2;
    } else h.pivot.position.y = 0.7;
    // the pistol is in the hand while the shot is fired
    this.pistolT -= dt;
    this.pistol.visible = this.pistolT > 0 && !this.heroDead;
    if (this.pistol.visible) {
      const a = p.face;
      this.pistol.position.set(p.x + Math.sin(a) * 0.55 + Math.cos(a) * 0.12, 1.0, p.z + Math.cos(a) * 0.55 - Math.sin(a) * 0.12);
      this.pistol.rotation.set(0, a, 0);
    }
    // fury: the sword arm glows red; the second-wind and post-hit blink
    h.setGlow(p.powers.fury > 0 ? 0x401008 + (Math.sin(this.time * 12) > 0 ? 0x200000 : 0) : 0);
    h.update(dt);
    this.blinkT -= dt;
    h.root.visible = !(this.blinkT > 0 && p.state !== 'dodge' && !this.heroDead && Math.floor(this.time * 16) % 2 === 0);
    // the parrot companion
    const b = sim.parrot;
    const on = p.powers.parrot > 0 && !this.heroDead;
    this.parrot.visible = on;
    if (on) {
      const prev = this.parrot.position.clone();
      this.parrot.position.set(b.x, b.y + 0.2, b.z);
      const mv = this.parrot.position.clone().sub(prev);
      if (mv.lengthSq() > 1e-5) this.parrot.rotation.y = lerpAng(this.parrot.rotation.y, Math.atan2(mv.x, mv.z), Math.min(1, dt * 8));
      this.parrot.rotation.z = Math.sin(this.time * 18) * 0.25;
      this.parrot.scale.setScalar(1 + Math.sin(this.time * 18) * 0.05);
    }
  }

  private clearFoes(): void {
    for (const fv of this.foes.values()) if (fv.fig && fv.pool) fv.pool.give(fv.fig);
    this.foes.clear();
    this.kraken.visible = false;
    // a new island starts clean: no scorch marks, ink pools or sparks from the last one
    this.splatList.length = 0;
    this.flashes.length = 0;
    this.swings.length = 0;
    this.particles.clear();
    this.dust.clear();
  }

  private poolFor(kind: Foe['kind']): FigurePool | null {
    switch (kind) {
      case 'skel': case 'thrower': case 'brute': case 'captain': return this.pools.skeleton;
      case 'runner': return this.pools.headless;
      case 'shark': return this.pools.shark;
      case 'tentacle': case 'arm': return this.pools.tentacle;
      default: return null;
    }
  }

  private syncFoes(sim: Sim, dt: number, look: THREE.Vector3): void {
    for (const fv of this.foes.values()) fv.seen = false;
    let head: Foe | null = null;
    for (const f of sim.foes) {
      if (f.kind === 'head') { head = f; continue; }
      let fv = this.foes.get(f.id);
      if (!fv) {
        const pool = this.poolFor(f.kind);
        const fig = pool ? pool.take() : null;
        fv = { fig, pool, kind: f.kind, state: '', dead: false, seen: true };
        this.foes.set(f.id, fv);
        if (fig) this.dress(fig, f);
      }
      fv.seen = true;
      if (fv.fig) this.poseFoe(fv, f, sim, dt, look);
    }
    for (const [id, fv] of this.foes) {
      if (fv.seen) continue;
      if (fv.fig && fv.pool) fv.pool.give(fv.fig);
      this.foes.delete(id);
    }
    // the Kraken's head
    this.kraken.visible = !!head && !(head.state === 'dead' && head.deadT > 2.5);
    if (head && this.kraken.visible) {
      const sinkK = head.state === 'dead' ? head.deadT * 1.6 : 0;
      this.kraken.position.set(head.x, head.y - 0.4 - sinkK, head.z);
      this.kraken.rotation.y = lerpAng(this.kraken.rotation.y, head.face, Math.min(1, dt * 3));
      this.kraken.scale.setScalar(0.72 * (1 + Math.sin(this.time * 2) * 0.02));
      this.krakenFlash = Math.max(0, this.krakenFlash - dt);
      const f = this.krakenFlash > 0 ? 0.32 : 0;
      const open = head.state === 'open';
      this.krakenMat.emissive.setRGB(f + (open ? 0.12 + Math.sin(this.time * 6) * 0.05 : 0), f, f + (open ? 0.05 : 0));
    }
  }

  /** Looks of a new foe: size, tint, start pose. */
  private dress(fig: Figure, f: Foe): void {
    fig.root.visible = true;
    const s = f.kind === 'tentacle' || f.kind === 'arm' ? f.len / TENTACLE_H : f.scale;
    fig.root.scale.setScalar(s);
    if (f.kind === 'brute') { fig.setTint(0x9a9aa8); fig.setGlow(0x0a0414); }
    else if (f.kind === 'captain') { fig.setTint(0xffb0a0); fig.setGlow(0x200404); }
    else if (f.kind === 'thrower') fig.setTint(0xc8ffb8);
    else if (f.kind === 'arm') { fig.setTint(0xd890ff); fig.setGlow(0x100418); }
    if (f.elite) { fig.setTint(0xffe08a); fig.setGlow(0x2a1a00); }
    fig.root.rotation.order = 'YXZ';
  }

  private poseFoe(fv: FoeView, f: Foe, sim: Sim, dt: number, look: THREE.Vector3): void {
    const fig = fv.fig!;
    const st = f.state;
    const changed = st !== fv.state;
    fv.state = st;
    // animation LOD: far and off-screen figures animate at a lower rate
    const dx = f.x - look.x, dz = f.z - look.z;
    const onScreen = Math.abs(dx) < 9 && dz > -16 && dz < 9;
    const every = !onScreen ? 4 : Math.hypot(dx, dz) > 9 ? 2 : 1;
    if (f.kind === 'tentacle' || f.kind === 'arm') {
      fig.root.position.set(f.bx, f.y, f.bz);
      fig.root.rotation.set(f.pitch, f.yaw, 0);
      if (st === 'dead') { fig.root.position.y = -f.deadT * 4; fig.root.rotation.x = Math.PI / 2 * Math.max(0, 1 - f.deadT); }
      fig.play('Tentacle_Idle', { speed: st === 'wind' ? 3 : st === 'down' ? 0.4 : 1, fade: 0.3 });
      fig.update(dt, every);
      if (f.flash > 0.08) fig.flash();
      return;
    }
    fig.root.position.set(f.x, f.y, f.z);
    fig.root.rotation.set(0, f.face, 0);
    if (f.kind === 'shark') {
      if (st === 'fin' || st === 'wind') fig.root.position.y = -0.62 + (st === 'wind' ? Math.sin(this.time * 18) * 0.04 : 0);
      if (st === 'beached') fig.root.rotation.z = Math.sin(f.t * 9) * 0.3;
      if (st === 'dead') { fig.root.rotation.z = Math.PI / 2; fig.root.position.y = -f.deadT * 0.6; }
      if (changed) {
        if (st === 'lunge') fig.play('Swim_Bite', { once: true, restart: true, speed: 1.3 });
        else if (st === 'wind') fig.play('Swim_Fast', { speed: 1.4 });
        else if (st === 'beached') fig.play('Swim', { speed: 2.4 });
        else fig.play('Swim', { speed: 1 });
      }
      if (st === 'fin' || st === 'back') { const rx = Math.random() < dt * 20; if (rx) this.particles.emit(f.x, -0.1, f.z, 0, 1, 0, 0.5, 0.35, 0.1, 0xe8fbff, 1, 3); }
      fig.update(dt, every);
      return;
    }
    // walkers and the captain
    if (st === 'dead') {
      if (changed) fig.play('Death', { once: true, restart: true, fade: 0.08 });
      fig.root.position.y = -Math.max(0, f.deadT - 1.6) * 0.9;
    } else if (changed || st === 'move' || st === 'chase') {
      switch (st) {
        case 'spawn': fig.play('Idle'); break;
        case 'move': case 'chase': {
          const fast = f.kind === 'runner' || f.kind === 'captain';
          fig.play(fast ? 'Run' : 'Walk', { speed: (f.speed / (fast ? 4.5 : 2.6)) * (fast ? 0.9 : 1.2), fade: 0.18 });
          break;
        }
        case 'wind':
          if (f.kind === 'runner') fig.play('Duck', { speed: 1.4, fade: 0.08 });
          else if (f.kind === 'thrower') fig.play('Punch', { once: true, restart: true, speed: 0.95, fade: 0.08 });
          else if (f.kind === 'brute') fig.play('Duck', { speed: 0.8, fade: 0.1 });
          else fig.play('Sword', { once: true, restart: true, speed: f.kind === 'captain' ? 0.75 : 0.95, fade: 0.08 });
          break;
        case 'act':
          if (f.kind === 'brute') fig.play('Sword', { once: true, restart: true, speed: 1.6, at: 0.3 });
          break;
        case 'dash': fig.play('Run', { speed: 2.2, fade: 0.05 }); break;
        case 'tired': fig.play('Idle', { speed: 1.5 }); break;
        case 'hurt': fig.play('HitReact', { once: true, restart: true, speed: 1.3, fade: 0.04 }); break;
        case 'leap': fig.play('Jump', { once: true, restart: true, speed: 0.4 }); break;
        case 'recover': fig.play('Idle', { fade: 0.2 }); break;
        case 'ship': fig.play('Wave', { fade: 0.2 }); break;
        default: fig.play('Idle', { fade: 0.2 });
      }
    }
    if (f.kind === 'captain' && sim.bossPhase === 3) fig.setGlow(Math.sin(this.time * 10) > 0 ? 0x3a0404 : 0x200404);
    fig.update(dt, every);
  }

  private syncFx(sim: Sim, dt: number): void {
    const cq = this.camQ, t = this.time, p = sim.p;
    for (const b of [this.shadows, this.glows, this.flares, this.rings, this.discs, this.streaks, this.slashes, this.inkBB, this.splats, this.bubbles]) b.begin(cq);
    this.teles.begin();

    // the hero's marker and shadow; the ghost shield
    if (!this.heroDead || sim.phaseT < 2) this.shadows.add(p.x, 0.03, p.z, 1.2, 1.2, 0, 0xffffff, 1);
    if (!this.heroDead) {
      this.rings.add(p.x, 0.04, p.z, 1.6, 1.6, 0, 0xffe27a, 0.55 + Math.sin(t * 4) * 0.12);
      if (p.powers.shield > 0) {
        const k = Math.min(1, p.powers.shield / 1.5);
        this.bubbles.add(p.x, 0.85, p.z, 2.3, 2.3, t, 0x7fe8ff, (0.7 + Math.sin(t * 6) * 0.15) * (p.powers.shield < 2 && Math.floor(t * 8) % 2 ? 0.3 : 1) * k);
      }
      if (p.powers.rum > 0 && Math.hypot(p.vx, p.vz) > 2 && Math.random() < dt * 30) this.particles.emit(p.x, 0.5, p.z, 0, 0.4, 0, 0.35, 0.5, 0.1, POWER_COLOR.rum, 2, 0);
      if (p.powers.gold2 > 0 && Math.random() < dt * 6) this.particles.emit(p.x + (Math.random() - 0.5), 2 + Math.random() * 0.3, p.z + (Math.random() - 0.5), 0, 0.6, 0, 0.6, 0.3, 0.05, 0xffd23f, 1, 0);
      if (p.powers.fury > 0 && Math.random() < dt * 14) this.particles.emit(p.x + (Math.random() - 0.5) * 0.8, 0.4 + Math.random(), p.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, 0.4, 0.35, 0.05, 0xff4f7b, 1, 0);
    }
    if (p.powers.parrot > 0 && !this.heroDead) this.shadows.add(sim.parrot.x, 0.03, sim.parrot.z, 0.5, 0.5, 0, 0xffffff, 0.6);

    // foes' shadows, elites' glow
    for (const f of sim.foes) {
      if (f.kind === 'tentacle' || f.kind === 'arm' || f.kind === 'head') {
        if (f.state !== 'dead' && f.y > -2) this.rings.add(f.bx, -0.05, f.bz, 2.6, 2.6, 0, 0xe8fbff, 0.35 + Math.sin(t * 3 + f.id) * 0.15);
        if (f.kind === 'head' && f.state === 'open') this.glows.add(f.x, 2.2, f.z, 7, 7, 0, 0xff6ad0, 0.25);
        continue;
      }
      if (f.kind === 'shark') { if (f.state === 'beached' || f.state === 'lunge') this.shadows.add(f.x, 0.03, f.z, 1.6, 2.8, -f.face, 0xffffff, 0.8); continue; }
      if (f.state === 'dead' && f.deadT > 2) continue;
      const s = f.r * f.scale * 2.6;
      this.shadows.add(f.x, 0.03, f.z, s, s, 0, 0xffffff, f.state === 'spawn' ? Math.min(1, f.t / 0.9) : 1);
      if (f.elite && f.state !== 'dead') this.glows.add(f.x, 0.8, f.z, 2.4, 2.4, 0, 0xffd23f, 0.25 + Math.sin(t * 5 + f.id) * 0.08);
      if (f.kind === 'captain' && f.state !== 'dead') this.rings.add(f.x, 0.05, f.z, 4, 4, 0, sim.bossPhase === 3 ? 0xff3060 : 0xffa060, 0.7 + Math.sin(t * 5) * 0.2);
    }

    // telegraphs: red warnings that fill as the blow comes; gold for the player's own fire
    for (const T of sim.teles) {
      const fill = Math.min(1, T.t / T.dur);
      const col = T.friendly ? 0xffc23a : T.lane ? 0xff7a2a : 0xff2a1a;
      const pulse = fill > 0.7 ? 0.5 + Math.sin(t * 30) * 0.5 : 0;
      if (T.kind === 'circle') this.teles.add(SHAPE.circle, T.x, T.z, T.r, 0, 0, 0, 0, fill, col, pulse);
      else if (T.kind === 'cone') this.teles.add(SHAPE.cone, T.x, T.z, T.r, 0, 0, T.ang, T.arc, fill, col, pulse);
      else this.teles.add(SHAPE.line, T.x, T.z, 0, T.w, T.len, T.ang, 0, fill, col, pulse);
    }
    // tide pools: wet sand, rising (a blue warning), flooded
    for (const q of sim.pools) {
      if (q.state === 'rise') this.teles.add(SHAPE.circle, q.x, q.z, q.r, 0, 0, 0, 0, Math.min(1, q.t / (1.6 * sim.tune.tele)), 0x3aa0ff, 0);
      if (q.level > 0.02) {
        this.discs.add(q.x, 0.07, q.z, q.r * 2 * (0.6 + q.level * 0.4), q.r * 2 * (0.6 + q.level * 0.4), t * 0.2, 0x5ad8ff, q.level * 0.9);
        if (q.state === 'flood') this.rings.add(q.x, 0.09, q.z, q.r * 2.1, q.r * 2.1, 0, 0xffffff, 0.4 + Math.sin(t * 4) * 0.2);
      }
    }

    // the sword's arcs: crescents sweeping round the hero
    for (let i = this.swings.length - 1; i >= 0; i--) {
      const s = this.swings[i];
      s.t += dt;
      if (s.t > s.dur + 0.12) { this.swings.splice(i, 1); continue; }
      const u = Math.min(1, s.t / s.dur);
      const ease = 1 - (1 - u) * (1 - u);
      const arc = s.spin ? Math.PI * 2 : s.arc;
      const a = s.spin ? s.a0 - ease * arc : s.a0 + arc / 2 - ease * arc;
      const fade = s.t > s.dur ? 1 - (s.t - s.dur) / 0.12 : 1;
      const col = s.spin ? 0xffa83a : s.big ? 0xffe2b0 : 0xa8dcff;
      const sz = s.r * (s.spin ? 1.9 : 1.7);
      for (let k = 0; k < 2; k++) {
        const ak = a + (s.spin ? 0.4 : 0.22) * k;
        this.slashes.add(p.x, 0.75 + k * 0.01, p.z, sz, sz, ak + Math.PI, col, fade * (0.3 - k * 0.12));
      }
      if (Math.random() < 0.7) this.particles.emit(p.x + Math.sin(a) * s.r * 0.85, 0.8, p.z + Math.cos(a) * s.r * 0.85, 0, 0.6, 0, 0.25, 0.32, 0.05, col, 3);
    }

    // shots
    let sk = 0, bl = 0, kg = 0;
    for (const s of sim.shots) {
      if (s.t > 40) continue;
      switch (s.kind) {
        case 'bullet': {
          const ang = Math.atan2(s.vx, s.vz);
          this.streaks.add(s.x, 1, s.z, 0.25, 1.6, 0, 0xfff0a0, 1);
          void ang;
          this.glows.add(s.x, 1, s.z, 1, 1, 0, 0xffd25a, 0.9);
          break;
        }
        case 'skull':
          if (sk < 12) { this.q.setFromEuler(this.e.set(s.t * 9, s.t * 5, 0)); this.m.compose(this.v.set(s.x, s.y, s.z), this.q, this.s.set(1, 1, 1)); this.skulls.setMatrixAt(sk++, this.m); }
          this.glows.add(s.x, s.y, s.z, 1, 1, 0, 0x9aff7a, 0.5);
          this.shadows.add(s.x, 0.03, s.z, 0.5, 0.5, 0, 0xffffff, 0.6);
          break;
        case 'cannon': case 'barrage':
          if (bl < 20) { this.m.compose(this.v.set(s.x, s.y, s.z), this.q.identity(), this.s.set(1, 1, 1)); this.balls.setMatrixAt(bl++, this.m); }
          if (Math.random() < 0.5) this.dust.emit(s.x, s.y, s.z, 0, 0.3, 0, 0.5, 0.4, 0.8, 0xc8c8c8, 2, -0.5);
          this.shadows.add(s.x, 0.03, s.z, 0.6, 0.6, 0, 0xffffff, 0.7);
          break;
        case 'ink':
          this.inkBB.add(s.x, s.y, s.z, 0.9, 0.9, s.t * 6, 0xffffff, 1);
          this.shadows.add(s.x, 0.03, s.z, 0.6, 0.6, 0, 0xffffff, 0.6);
          break;
        case 'keg':
          if (kg < 6) {
            this.q.setFromEuler(this.e.set(s.fuse > 0 ? 0 : s.t * 10, 0, 0));
            this.m.compose(this.v.set(s.x, Math.max(0, s.y - 0.3), s.z), this.q, this.s.set(1, 1, 1));
            this.kegs.setMatrixAt(kg++, this.m);
          }
          if (Math.random() < 0.8) this.particles.emit(s.x, s.y + 0.4, s.z, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.3, 0.25, 0.05, 0xffb040, 2, 3);
          break;
      }
    }
    this.finish(this.skulls, sk);
    this.finish(this.balls, bl);
    this.finish(this.kegs, kg);

    // rolling barrels
    let br = 0;
    for (const b of sim.rollers) {
      if (b.t < 0) {
        // poised at the edge, rocking
        this.q.setFromEuler(this.e.set(0, Math.atan2(b.dx, b.dz), Math.sin(t * 12) * 0.08, 'YXZ'));
      } else this.q.setFromEuler(this.e.set(b.spin, Math.atan2(b.dx, b.dz), 0, 'YXZ'));
      this.m.compose(this.v.set(b.x, 0.36, b.z), this.q, this.s.set(1, 1, 1));
      if (br < 6) this.barrels.setMatrixAt(br++, this.m);
      if (b.t >= 0 && Math.random() < dt * 25) this.dust.emit(b.x, 0.1, b.z, 0, 0.6, 0, 0.5, 0.35, 0.7, sim.L.palette.sand, 2, 1);
    }
    this.finish(this.barrels, br);

    // loot: coins, bags, power-ups; chests
    let cn = 0, bg = 0;
    const pc: Record<PowerId, number> = { rum: 0, keg: 0, parrot: 0, shield: 0, gold2: 0, fury: 0, fish: 0 };
    for (const l of sim.loot) {
      if (l.t < 0) continue;
      const bob = l.y > 0 ? l.y : 0.25 + Math.sin(t * 3 + l.id) * 0.08;
      if (l.kind === 'coin') {
        if (cn >= 120) continue;
        this.q.setFromAxisAngle(this.up, t * 5 + l.id);
        this.m.compose(this.v.set(l.x, bob, l.z), this.q, this.s.set(1, 1, 1));
        this.coins.setMatrixAt(cn++, this.m);
        if (Math.random() < dt * 1.5) this.flashes.push({ x: l.x, y: bob + 0.3, z: l.z, s: 0.5, t: 0.25, max: 0.25, c: 0xfff0a0, kind: 'flare' });
      } else if (l.kind === 'bag') {
        if (bg >= 24) continue;
        this.q.setFromAxisAngle(this.up, t * 2 + l.id);
        this.m.compose(this.v.set(l.x, bob, l.z), this.q, this.s.set(1, 1, 1));
        this.bags.setMatrixAt(bg++, this.m);
        this.glows.add(l.x, bob + 0.3, l.z, 1, 1, 0, 0xffd23f, 0.35);
      } else if (l.power) {
        const im = this.powers[l.power];
        const n = pc[l.power];
        if (n >= 4) continue;
        const blink = l.t > 11 && Math.floor(t * 8) % 2 === 0;
        this.q.setFromAxisAngle(this.up, t * 2.2 + l.id);
        this.m.compose(this.v.set(l.x, bob + 0.35, l.z), this.q, this.s.setScalar(blink ? 0.001 : 1 + Math.sin(t * 6) * 0.06));
        im.setMatrixAt(n, this.m);
        pc[l.power]++;
        const c = POWER_COLOR[l.power];
        this.glows.add(l.x, bob + 0.6, l.z, 1.6, 1.6, 0, c, 0.4 + Math.sin(t * 5) * 0.1);
        this.rings.add(l.x, 0.05, l.z, 1.3, 1.3, 0, c, 0.6);
        if (Math.random() < dt * 5) this.particles.emit(l.x + (Math.random() - 0.5) * 0.8, 0.3, l.z + (Math.random() - 0.5) * 0.8, 0, 1.5, 0, 0.6, 0.25, 0.05, c, 1, 0);
      }
      this.shadows.add(l.x, 0.03, l.z, 0.45, 0.45, 0, 0xffffff, 0.6);
    }
    this.finish(this.coins, cn);
    this.finish(this.bags, bg);
    for (const id of POWER_IDS) this.finish(this.powers[id], pc[id]);
    let ch = 0, co = 0;
    for (const c of sim.chests) {
      if (!c.open) {
        if (ch < 4) {
          this.q.setFromAxisAngle(this.up, 0.3);
          this.m.compose(this.v.set(c.x, 0, c.z), this.q, this.s.setScalar(1 + Math.sin(t * 6) * 0.03));
          this.chests.setMatrixAt(ch++, this.m);
        }
        this.glows.add(c.x, 0.7, c.z, 2, 2, 0, 0xffd23f, 0.35 + Math.sin(t * 5) * 0.12);
        this.flares.add(c.x, 1.2, c.z, 1.2, 1.2, t, 0xfff0a0, 0.5);
      } else if (co < 4) {
        const k = Math.min(1, (6 - c.t) / 1);
        this.q.setFromAxisAngle(this.up, 0.3);
        this.m.compose(this.v.set(c.x, -(1 - k) * 0.8, c.z), this.q, this.s.setScalar(1));
        this.chestsOpen.setMatrixAt(co++, this.m);
        if (c.t < 1.5) this.glows.add(c.x, 1, c.z, 3, 3, 0, 0xffe27a, (1.5 - c.t) / 1.5);
      }
      this.shadows.add(c.x, 0.03, c.z, 1.6, 1.2, 0, 0xffffff, 0.7);
    }
    this.finish(this.chests, ch);
    this.finish(this.chestsOpen, co);

    // ink pools and scorch marks fade out
    for (let i = this.splatList.length - 1; i >= 0; i--) {
      const s = this.splatList[i];
      s.t -= dt;
      if (s.t <= 0) { this.splatList.splice(i, 1); continue; }
      this.splats.add(s.x, 0.045, s.z, s.s, s.s, s.rot, s.c, Math.min(1, s.t / 1.5) * 0.55);
    }

    // one-shot flashes and rings
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t -= dt;
      if (fl.t <= 0) { this.flashes.splice(i, 1); continue; }
      const k = fl.t / fl.max;
      if (fl.kind === 'ring') this.rings.add(fl.x, Math.max(0.05, fl.y), fl.z, fl.s * (1.15 - k * 0.6), fl.s * (1.15 - k * 0.6), 0, fl.c, k * 0.7);
      else if (fl.kind === 'glow') this.glows.add(fl.x, fl.y, fl.z, fl.s, fl.s, 0, fl.c, k * 0.5);
      else this.flares.add(fl.x, fl.y, fl.z, fl.s * (0.6 + k * 0.4), fl.s * (0.6 + k * 0.4), t * 3, fl.c, k);
    }

    this.particles.update(dt, cq);
    this.dust.update(dt, cq);
    for (const b of [this.shadows, this.glows, this.flares, this.rings, this.discs, this.streaks, this.slashes, this.inkBB, this.splats, this.bubbles]) b.end();
    this.teles.end();
  }

  private finish(im: THREE.InstancedMesh, n: number): void {
    im.count = n;
    im.visible = n > 0;
    if (n) im.instanceMatrix.needsUpdate = true;
  }

  /** Game pixels of a world point. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const s = this.world.toScreen(this.v.set(x, y, z));
    return { x: s.x, y: s.y };
  }

  /** Puts the camera on the hero at once. */
  snap(sim: Sim): void { this.camLook.set(sim.p.x, 0, sim.p.z - this.lookAhead); }

  get drawCalls(): number { return this.world.renderer.info.render.calls; }

  dispose(): void {
    this.hero.dispose();
    for (const p of Object.values(this.pools)) p.dispose();
  }
}

/** Where an eye sits on the Kraken's dome (left −1, right +1), facing forward and a little up. */
function eyeAt(sx: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.95, 2.95, 1.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, sx * 0.25, 0)), new THREE.Vector3(1, 1, 1));
}

/** The Kraken's head: a great dome with spots, two big eyes and a ring of short arms, in vertex colours. */
function krakenGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, c: number) => {
    const col = new THREE.Color(c);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const dome = new THREE.SphereGeometry(2.3, 22, 16);
  dome.scale(1, 1.12, 1.05);
  dome.translate(0, 2.1, 0);
  parts.push(paint(dome, 0xd9709a));
  // spots on the dome
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3, h = 0.3 + (i % 3) * 0.2;
    if (Math.abs(Math.sin(a) - 0.8) < 0.35 && Math.cos(a) * Math.cos(a) < 0.35) continue;
    const g = new THREE.SphereGeometry(0.28 + (i % 3) * 0.06, 8, 6);
    g.scale(1, 1, 0.4);
    const r = 2.3 * Math.sqrt(1 - h * h);
    g.lookAt(new THREE.Vector3(Math.cos(a), h, Math.sin(a)));
    g.translate(Math.cos(a) * r * 0.98, 2.1 + h * 2.3 * 1.12, Math.sin(a) * r * 1.03);
    parts.push(paint(g, 0xf5a03a));
  }
  // eyes looking forward (+z)
  for (const sx of [-1, 1]) {
    // eyes high on the front of the dome, tilted up so they read from the camera above
    const eye = new THREE.Group();
    const white = new THREE.SphereGeometry(0.78, 16, 12);
    parts.push(paint(white.clone().translate(0, 0, 0).applyMatrix4(eyeAt(sx)), 0xfff6e0));
    const iris = new THREE.SphereGeometry(0.46, 12, 8);
    iris.scale(1, 1.25, 0.45);
    parts.push(paint(iris.translate(0, 0, 0.62).applyMatrix4(eyeAt(sx)), 0xffc21a));
    const pupil = new THREE.SphereGeometry(0.24, 10, 6);
    pupil.scale(0.5, 1.25, 0.4);
    parts.push(paint(pupil.translate(0, 0, 0.84).applyMatrix4(eyeAt(sx)), 0x140806));
    const brow = new THREE.BoxGeometry(1.2, 0.28, 0.4);
    brow.rotateZ(-sx * 0.38);
    parts.push(paint(brow.translate(0, 0.78, 0.25).applyMatrix4(eyeAt(sx)), 0x9a3a64));
    void eye;
  }
  // a ring of arms round the base
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const arm = new THREE.ConeGeometry(0.55, 2.6, 8);
    arm.translate(0, 1.3, 0);
    arm.rotateX(Math.PI / 2 - 0.35);
    arm.rotateY(a);
    arm.translate(Math.sin(a) * 1.6, 0.3, Math.cos(a) * 1.6);
    parts.push(paint(arm, i % 2 ? 0xc85a8a : 0xe07aa6));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}
