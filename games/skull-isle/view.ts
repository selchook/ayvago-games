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
import { PLAYER, POWER_COLOR, POWER_IDS, SEA_POWER_COLOR, SAIL, type HeroId, type PowerId } from './defs';
import { PALETTES, shoreAt, groundY, type Layout, type Palette } from './island';
import { pk, kk, mergeModels, soloGeometry, keepPrograms, kenneyMap, sceneryMaterial, type Placed } from './kit';
import { Billboards, Particles, Telegraphs, TEX, SHAPE, waterMaterial, setCoast, HealthBars, Wakes, stepBar, swellY, type BarState } from './fx3d';
import { Sails, stripSails } from './sails';
import { Figure, FigurePool } from './figure';
import { SeaView, SHIP_SCALE, DECK, SHIP_GUNS } from './seaview';
import type { Voyage } from './voyage';

/**
 * The island camera (1.3: landscape, 1280 × 720). Closer than the portrait camera (21), so the
 * people stay large on a phone held sideways while the wide view takes in the island from shore to
 * shore (about 23 units across at the hero, 15 deep).
 */
export const CAM = { fov: 42, tilt: 58, dist: 17 };
/** How far the hero may stray sideways from the camera's centre (units): ~250 px, clear of the thumbs. */
const HERO_SIDE = 4.6;
/** The sea camera: behind and above the ship, low enough for the horizon (1.3: closer and lower for the wide view). */
const SEA_CAM = { y: Math.sin(THREE.MathUtils.degToRad(27)) * 33, z: Math.cos(THREE.MathUtils.degToRad(27)) * 33 };
/** The sea's lens (vertical, degrees) and how far ahead of the ship the camera looks. */
const SEA_FOV = 44, SEA_AHEAD = 9;
/** A stormy passage's greys. */
const STORM = { sky: 0x4d5a68, fog: 0x5a6672, deep: 0x1c3348, shallow: 0x3a6a78, sun: 0xc8d4e0, sunI: 0.95, hemiSky: 0x9aa8b8, hemiGround: 0x2a3038, ambient: 1.15 };
const TENTACLE_H = 15.67;
const CLIP: Record<string, number> = { Sword: 0.87, Punch: 0.77, Jump: 0.37, Duck: 1.67 };

interface FoeView { fig: Figure | null; pool: FigurePool | null; kind: Foe['kind']; state: string; dead: boolean; seen: boolean; px: number; py: number; pz: number; pitch: number; splashT: number }
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
  private builtL: Layout | null = null;
  /** The sea leg's drawing; the camera's blend from the island (0) to the sea (1); the storm's (0–1). */
  readonly sea: SeaView;
  private seaK = 0;
  private stormK = 0;
  private swell = 1;
  private lightT = 0;
  private atmo = '';
  private gulls: Billboards;
  private swimFx = 0;
  private snapSea = false;
  private snapHero = false;
  private bolts: { x: number; z: number; t: number }[] = [];
  /** Where the hero is drawn (on deck at sea), for the camera. */
  private heroPos = new THREE.Vector3();
  hero: Figure;
  private heroId: HeroId;
  private pistol: THREE.Object3D;
  private parrot: THREE.Object3D;
  readonly pools: Record<string, FigurePool>;
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
  /** Foes' health bars (one draw call), and each bar's state between frames. */
  readonly hpBars: HealthBars;
  private bars = new Map<string, BarState>();
  /** Foam on the water behind ships, fins and swimmers (one draw call). */
  readonly wakes: Wakes;
  /** The crew's cloth sails on the ship's yards. */
  readonly sails: Sails;
  /** The ship's heel from its own broadside (the firing side, 0–1). */
  private recoilSide = 0;
  private recoilK = 0;
  /** The parrot's flight: where it is drawn, its speed, heading, bank, pitch and wingbeat. */
  private pf = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, bank: 0, pitch: 0, flap: 0, wing: 0, idle: 0, perch: 0, on: false };
  private parrotBase!: Float32Array;
  private parrotNorm!: Float32Array;
  private parrotWing!: Float32Array;
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
  private tmpCol = new THREE.Color();
  /** The crew's sails thinned out at sea (see kit.ts sceneryMaterial). */
  private sail = new THREE.Vector4();
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
    this.sceneryMat = sceneryMaterial(this.heroAt, this.camAt, null, this.sail);
    this.sceneryKMat = sceneryMaterial(this.heroAt, this.camAt, this.kenneyMat.map, this.sail);

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
    this.parrot = this.makeParrot();
    this.parrot.visible = false;
    sc.add(this.parrot);
    this.sails = new Sails();

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
    this.streaks = new Billboards(sc, TEX.streak(), 170, { order: 13 });
    this.inkBB = new Billboards(sc, TEX.ink(), 16, { blend: 'normal', order: 16 });
    this.bubbles = new Billboards(sc, TEX.bubble(), 4, { order: 17 });
    this.teles = new Telegraphs(sc, 48);
    this.hpBars = new HealthBars(sc, 48);
    this.wakes = new Wakes(sc, TEX.foam(), 12);
    this.particles = new Particles(sc, glow, 900);
    this.dust = new Particles(sc, TEX.soft(), 500, 'normal', 12);
    this.gulls = new Billboards(sc, TEX.gull(), 6, { blend: 'normal', order: 19 });
    this.sea = new SeaView({
      scene: sc, pirateMat: this.pirateMat, kenneyMat: this.kenneyMat, pools: this.pools, particles: this.particles, dust: this.dust,
      shadows: this.shadows, glows: this.glows, flares: this.flares, rings: this.rings, streaks: this.streaks,
      wakes: this.wakes, surf: (x: number, z: number) => this.surf(x, z),
      bar: (key: string, hp: number, max: number, dead: boolean, x: number, y: number, z: number, w: number, h: number, color: number, dt: number) => this.bar(key, hp, max, dead, x, y, z, w, h, color, dt),
    });

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

  /**
   * The parrot as one mesh centred on its body, so it can fly: its folded wings (the blue lobes on
   * its flanks) are found once and swung out and flapped on the CPU each frame (no extra parts).
   */
  private makeParrot(): THREE.Mesh {
    const geo = mergeModels([{ key: pk('parrot'), x: 0, y: 0, z: 0, rot: 0, s: 1 }], 'color');
    geo.translate(-0.64, -1.26, 0.2);
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), col = geo.getAttribute('color');
    const n = pos.count;
    this.parrotBase = new Float32Array(pos.array as Float32Array);
    this.parrotNorm = new Float32Array(nor.array as Float32Array);
    this.parrotWing = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const blue = col.getZ(i) > 0.3 && col.getX(i) < 0.15;
      if (!blue || x < -0.24 || x > 0.2 || y > -0.12 || Math.abs(z) < 0.075) continue;
      this.parrotWing[i] = Math.sign(z) * THREE.MathUtils.smoothstep(Math.abs(z), 0.075, 0.15) * (1 - THREE.MathUtils.smoothstep(y, -0.2, -0.12));
    }
    (pos as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    (nor as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Mesh(geo, this.pirateMat);
    m.scale.setScalar(1.2);
    m.rotation.order = 'YZX';
    return m;
  }

  /** Swings the parrot's wings: `open` 0 folded to 1 spread, `beat` the stroke (−1 down … 1 up). */
  private flapParrot(open: number, beat: number): void {
    const geo = (this.parrot as THREE.Mesh).geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array, B = this.parrotBase, BN = this.parrotNorm, W = this.parrotWing;
    const hy = -0.13;
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      if (!w) continue;
      const sd = Math.sign(w), a = Math.abs(w);
      const hz = sd * 0.07;
      const py = B[i * 3 + 1] - hy, pz = (B[i * 3 + 2] - hz) * (1 + open * 0.9 * a);
      // folded wings hang down the flanks; open they swing out level, then beat up and down
      const th = -sd * a * (open * (1.45 + beat * 0.75));
      const c = Math.cos(th), sn = Math.sin(th);
      P[i * 3] = B[i * 3];
      P[i * 3 + 1] = hy + py * c - pz * sn;
      P[i * 3 + 2] = hz + py * sn + pz * c;
      const ny = BN[i * 3 + 1], nz = BN[i * 3 + 2];
      N[i * 3 + 1] = ny * c - nz * sn;
      N[i * 3 + 2] = ny * sn + nz * c;
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  /** The water's surface at (x, z) this frame, a hair above the swell (flat foam and rings sit there). */
  surf(x: number, z: number): number { return swellY(x, z, this.time, this.swell) + 0.05; }

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
      this.makeGround({ id: 'cove', lap: 0, rx: 6, rz: 6, harm: [[3, 0.05, 0], [5, 0.02, 0], [2, 0.03, 0]], props: [{ model: 'palm1', x: 0, z: -2, rot: 0, s: 1, r: 0 }, { model: 'k:crate', x: 2, z: 0, rot: 0, s: 1, r: 0 }], tentacleSpots: [], ship: null, pools: [], grass: [], palette: PALETTES.cove, islet: { x: 9, z: 0, r: 1.5 }, anchor: { x: 0, z: -12, rot: 0 } });
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
    this.atmo = '';
    this.atmosphere(pal, this.seaK, this.stormK);
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
    // the hidden islet: a small mound of sand in the same mesh
    if (L.islet) {
      const is = L.islet, base = P.length / 3, ISEG = 28;
      const IR = [0, 0.35, 0.7, 0.9, 1, 1.25, 1.7, 2.4, 3.3];
      for (let i = 0; i <= ISEG; i++) {
        const th = (i / ISEG) * Math.PI * 2;
        for (let j = 0; j < IR.length; j++) {
          const r = is.r * IR[j] + (j > 0 ? Math.sin(th * 3 + 1) * 0.12 : 0);
          const x = is.x + Math.cos(th) * r, z = is.z + Math.sin(th) * r;
          const d = r - is.r;
          P.push(x, d < -0.5 ? 0.04 * (1 - r / is.r) : Math.max(-1.6, -(d + 0.5) / 2.2), z);
          tmp.copy(sand).lerp(wet, THREE.MathUtils.smoothstep(d, -0.9, -0.1) * 0.85);
          C.push(tmp.r, tmp.g, tmp.b);
        }
      }
      const n = IR.length;
      for (let i = 0; i < ISEG; i++) {
        for (let j = 0; j < n - 1; j++) {
          const a = base + i * n + j, b = base + (i + 1) * n + j;
          I.push(a, b, a + 1, b, b + 1, a + 1);
        }
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
      const y = (p.y ?? 0) + groundY(L, p.x, p.z);
      (k ? ken : pir).push({ key: k ? kk(p.model.slice(2)) : pk(p.model), x: p.x, y, z: p.z, rot: p.rot, s: p.s });
    }
    // a ship of the crew rides at anchor off the north shore (the island's own ship takes its place)
    if (L.ship) this.shipAt = { ...L.ship, y: L.ship.beached ? -0.6 : -0.9 };
    else this.shipAt = { x: L.anchor.x, z: L.anchor.z, rot: L.anchor.rot, beached: false, y: -0.95 };
    if (pir.length) { const m = new THREE.Mesh(mergeModels(pir, 'color'), this.sceneryMat); m.castShadow = true; m.receiveShadow = true; sc.add(m); this.scenery.push(m); }
    if (ken.length) { const m = new THREE.Mesh(mergeModels(ken, 'uv'), this.sceneryKMat); m.castShadow = true; m.receiveShadow = true; sc.add(m); this.scenery.push(m); }
    // the ship: its own sails cut out (cloth ones hang on its yards), a battery of guns on each side
    const parts: Placed[] = [{ key: pk('ship-large'), x: 0, y: 0, z: 0, rot: 0, s: 1 }];
    for (const x of SHIP_GUNS) for (const sd of [1, -1]) parts.push({ key: pk('cannon'), x, y: 1.38, z: sd * 1.62, rot: sd * Math.PI / 2, s: 0.85 });
    const ship = new THREE.Mesh(stripSails(mergeModels(parts, 'color')), this.sceneryMat);
    ship.castShadow = true;
    this.scenery.push(ship);
    this.ship = ship;
    ship.add(this.sails.mesh);
    // at anchor the sails are furled; the cursed village's gun ship keeps half, the reef's wreck hangs slack
    this.sails.setFurl(L.ship ? (L.ship.beached ? 0.3 : 0.62) : SAIL.furl[0], true);
    sc.add(ship);
    this.placeShip(0);
  }

  private placeShip(t: number): void {
    if (!this.ship) return;
    const s = this.shipAt;
    this.ship.scale.setScalar(1);
    this.ship.position.set(s.x, s.y + (s.beached ? 0 : Math.sin(t * 0.9) * 0.12), s.z);
    this.ship.rotation.set(s.beached ? 0.05 : Math.sin(t * 0.7) * 0.025, s.rot, s.beached ? 0.22 : Math.sin(t * 0.8 + 1) * 0.04, 'YXZ');
  }

  // ------------------------------------------------------------------ events

  handle(ev: SimEvent, sim: Sim): void {
    const P = this.particles, D = this.dust, pal = sim.L.palette;
    switch (ev.type) {
      case 'island':
        this.clearFoes();
        if (this.builtL !== sim.L || !this.ground) { this.makeGround(sim.L); this.builtL = sim.L; }
        this.heroDead = false;
        this.snap(sim);
        break;
      case 'seaStart':
        this.clearFoes();
        if (this.builtL !== sim.L) { this.makeGround(sim.L); this.builtL = sim.L; }
        this.snapSea = true;
        this.lastState = '';
        break;
      case 'wreck':
        this.clearFoes();
        this.snapHero = true;
        this.hero.play('Idle', { restart: true });
        break;
      case 'broadside':
        // the captain at the helm signals the broadside; each gun's flash and smoke come with its 'gun'
        this.hero.play('Sword', { once: true, restart: true, speed: 1.6, fade: 0.06 });
        this.lastState = 'fire';
        break;
      case 'gun': {
        const side = ev.side, x = ev.x, z = ev.z, y = ev.y;
        if (ev.kind === 'skull') { D.emit(x, y, z, 0, 0.8, 0, 0.5, 0.4, 0.9, 0xdfe8d8, 2, 0); break; }
        const ghost = ev.kind === 'ghost';
        // the muzzle flash: a flare and a glow at the port, sparks out along the barrel
        this.flashes.push({ x: x + side * 0.25, y, z, s: ghost ? 2.6 : 2.1, t: 0.1, max: 0.1, c: ghost ? 0x9affd0 : 0xffe0a0, kind: 'flare' });
        this.flashes.push({ x: x + side * 0.4, y, z, s: 3, t: 0.16, max: 0.16, c: ghost ? 0x5affb0 : 0xff9a3a, kind: 'glow' });
        for (let j = 0; j < 5; j++) P.emit(x + side * 0.3, y, z, side * (6 + Math.random() * 5), 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.22, 0.28, 0.05, ghost ? 0x7affc0 : 0xffc060, 4, 3);
        // a gout of smoke from the port that rolls out and drifts astern
        for (let j = 0; j < 9; j++) {
          const sp = 1.2 + Math.random() * 3.6;
          D.emit(x + side * (0.3 + Math.random() * 0.4), y + (Math.random() - 0.3) * 0.4, z + (Math.random() - 0.5) * 0.5, side * sp, 0.35 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 1.7 + Math.random() * 0.9, 0.8, 3 + Math.random() * 1.1, ghost ? 0xa8f0d0 : j % 2 ? 0xeeeae2 : 0xd6d1c6, 1.5, -0.22);
        }
        if (ev.friendly) { this.recoilSide = side; this.recoilK = 1; this.shake(0.12, 0.08); }
        break;
      }
      case 'evade': {
        const s = sim.voyage?.ship;
        if (!s) break;
        for (let i = 0; i < 18; i++) P.emit(s.x - ev.dir * 1.6, 0, s.z + (Math.random() - 0.5) * 7, -ev.dir * (1 + Math.random() * 2), 2 + Math.random() * 3, 0, 0.7, 0.45, 0.15, 0xdff8ff, 1, 8);
        this.hero.play('Duck', { once: true, restart: true, speed: 2.2, fade: 0.05 });
        this.lastState = 'fire';
        break;
      }
      case 'seaBoom': {
        const n = ev.friendly ? 16 : 12;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, vv = 0.6 + Math.random() * 1.6;
          P.emit(ev.x, 0, ev.z, Math.cos(a) * vv, 4 + Math.random() * 5, Math.sin(a) * vv, 0.8, 0.5, 0.2, i % 3 ? 0xdff8ff : 0x9fe4ff, 0.6, 14);
        }
        this.flashes.push({ x: ev.x, y: -0.1, z: ev.z, s: 3.6, t: 0.5, max: 0.5, c: 0xe8fbff, kind: 'ring' });
        if (ev.fire || ev.kind === 'ghost') P.burst(ev.x, 0.6, ev.z, 10, 5, ev.kind === 'ghost' ? [0x5affb0, 0xffffff] : [0xffb040, 0xff6a1a], 0.5, 0.5, 1, 3);
        break;
      }
      case 'hullHit': {
        P.burst(ev.x, 1, ev.z, 14, 6, [0x8a5a34, 0x6a4024, 0xffd27a], 0.8, 0.45, 1.2, 10);
        D.burst(ev.x, 1, ev.z, 8, 2.5, [0x9a9a9a, 0x6a6a6a], 1, 0.9, 0.8, -0.3);
        this.flashes.push({ x: ev.x, y: 1.2, z: ev.z, s: 3, t: 0.15, max: 0.15, c: 0xffb060, kind: 'flare' });
        this.shake(ev.dmg >= 12 ? 0.6 : 0.35, 0.22);
        this.hero.play('HitReact', { once: true, restart: true, speed: 1.4, fade: 0.05 });
        this.lastState = 'fire';
        break;
      }
      case 'seaHit':
        this.flashes.push({ x: ev.x, y: 1.4, z: ev.z, s: 2, t: 0.12, max: 0.12, c: 0xfff0b0, kind: 'flare' });
        P.burst(ev.x, 1.2, ev.z, 8, 5, ev.kind === 'tentacle' ? [0xff9ad0, 0xc84a90] : [0x8a5a34, 0xffd27a], 0.4, 0.35, 1, 6);
        break;
      case 'seaKill': {
        const big = ev.kind === 'sloop' || ev.kind === 'ghost';
        P.burst(ev.x, 1.4, ev.z, big ? 40 : 16, big ? 9 : 5, ev.kind === 'ghost' ? [0x5affb0, 0xffffff, 0xffd23f] : [0xffd27a, 0xff8a2a, 0xff5a1a], 0.9, 0.6, 1, 4);
        this.flashes.push({ x: ev.x, y: -0.05, z: ev.z, s: big ? 10 : 5, t: 0.6, max: 0.6, c: 0xffe2a0, kind: 'ring' });
        if (big) { this.flashes.push({ x: ev.x, y: 2, z: ev.z, s: 9, t: 0.3, max: 0.3, c: 0xffb060, kind: 'glow' }); this.shake(0.5, 0.3); }
        break;
      }
      case 'ram':
        P.burst(ev.x, 0.6, ev.z, 16, 5, [0x8a5a34, 0xdff8ff], 0.7, 0.45, 1, 8);
        break;
      case 'rockHit':
        D.burst(ev.x, 0.6, ev.z, 14, 4, [0x8a8a8a, 0x6a6a6a, 0xdff8ff], 0.8, 0.8, 0.8, 2);
        this.shake(0.5, 0.25);
        break;
      case 'float': {
        const s = sim.voyage?.ship;
        const c = ev.kind === 'crate' ? 0x7affa0 : ev.kind === 'bottle' ? 0x9ff0ff : 0xffd23f;
        P.burst(ev.x, 0.6, ev.z, ev.kind === 'chest' ? 40 : 18, 5, [c, 0xffffff], 0.7, 0.45, 1.4, 2);
        if (s) this.flashes.push({ x: s.x, y: -0.05, z: s.z, s: 7, t: 0.45, max: 0.45, c, kind: 'ring' });
        break;
      }
      case 'seaPower': {
        const s = sim.voyage?.ship;
        if (!s) break;
        const c = SEA_POWER_COLOR[ev.power];
        P.burst(s.x, 2, s.z, 40, 7, [c, 0xffffff], 0.9, 0.55, 1.5, 1);
        this.flashes.push({ x: s.x, y: -0.05, z: s.z, s: 12, t: 0.7, max: 0.7, c, kind: 'ring' });
        this.flashes.push({ x: s.x, y: 3, z: s.z, s: 8, t: 0.35, max: 0.35, c, kind: 'glow' });
        break;
      }
      case 'lightning':
        this.lightT = 0.22;
        this.bolts.push({ x: ev.x, z: ev.z, t: 0.2 });
        break;
      case 'sink': {
        const s = sim.voyage?.ship;
        if (!s) break;
        P.burst(s.x, 0.5, s.z, 50, 8, [0xdff8ff, 0x9fe4ff, 0x8a5a34], 1.1, 0.6, 1.4, 6);
        this.flashes.push({ x: s.x, y: -0.05, z: s.z, s: 14, t: 1, max: 1, c: 0xe8fbff, kind: 'ring' });
        this.shake(0.8, 0.5);
        this.hero.play('Jump', { once: true, restart: true, speed: 0.5, fade: 0.05 });
        this.lastState = 'fire';
        break;
      }
      case 'jumpAshore':
        this.hero.play('Jump', { once: true, restart: true, speed: 0.45, fade: 0.05 });
        this.lastState = 'fire';
        break;
      case 'swim':
        if (ev.on) this.flashes.push({ x: sim.p.x, y: -0.1, z: sim.p.z, s: 3, t: 0.5, max: 0.5, c: 0xe8fbff, kind: 'ring' });
        break;
      case 'islet':
        P.burst(ev.x, 1, ev.z, 50, 8, [0xffd23f, 0xffffff, 0x7affd8], 1.1, 0.55, 1.6, 3);
        this.flashes.push({ x: ev.x, y: 0.1, z: ev.z, s: 7, t: 0.8, max: 0.8, c: 0xffe27a, kind: 'ring' });
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
        if (ev.power === 'parrot') { this.pf.on = false; }
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
    if (this.builtL !== sim.L) { this.clearFoes(); this.makeGround(sim.L); this.builtL = sim.L; if (!sim.atSea) this.snap(sim); }
    const p = sim.p;
    const world = this.world;
    const v = sim.voyage;
    const sea = !!v && sim.atSea;
    // the camera's blend: the island (hero) camera, the sea (ship) camera, and docking in between
    let seaK = 0;
    if (sea) {
      if (sim.phase === 'dock') {
        const s = v!.ship;
        seaK = THREE.MathUtils.clamp((s.z - v!.dockZ) / 16, 0, 1) * 0.6 + 0.4 * (v!.jumpT < 0 ? 1 : Math.max(0, 1 - v!.jumpT / 0.8));
      } else seaK = 1;
    }
    this.seaK = seaK;
    const stormTo = sea && v!.storm ? seaK : 0;
    this.stormK += (stormTo - this.stormK) * Math.min(1, rdt * 1.2);
    if (Math.abs(this.stormK - stormTo) < 0.002) this.stormK = stormTo;
    this.lightT = Math.max(0, this.lightT - rdt);
    this.swell = 1 + seaK * 0.6 + this.stormK * 1.6;
    this.atmosphere(sim.L.palette, seaK, this.stormK);
    this.waterMat.uniforms.uTime.value = this.time;
    this.waterMat.uniforms.uSwell.value = this.swell;
    this.recoilK = Math.max(0, this.recoilK - rdt * 2.2);
    if (sea && this.ship) {
      const sinkK = sim.phase === 'sinking' ? THREE.MathUtils.smoothstep(v!.ship.t, 0.3, 2.4) : 0;
      // the guns' kick heels the ship away from the side that fired, and it rolls back
      const kick = this.recoilSide * Math.sin(Math.min(1, 1 - this.recoilK) * Math.PI) * this.recoilK * 0.09;
      this.sea.placeShip(this.ship, v!, this.time, this.swell, sinkK, kick);
      this.ship.visible = sinkK < 0.98;
      // the sails: the setting chosen at sea, slack while sinking, half in to dock
      const s = v!.ship;
      this.sails.setFurl(sim.phase === 'sinking' ? 0.5 : sim.phase === 'dock' ? SAIL.furl[1] : SAIL.furl[s.sail]);
      this.sails.update(dt, Math.min(1, s.speed / (sim.shipSt.speed * 1.3)), this.stormK);
    } else if (this.ship) {
      this.ship.visible = sim.phase !== 'wreck';
      this.placeShip(this.time);
      this.sails.update(dt, 0.25, 0);
    }
    this.placeHero(sim, v, sea);

    // camera: follows the hero (with a look past them), pulls back for bosses; at sea it rides
    // behind the ship, low enough to see the island on the horizon; a touch of shake
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, rdt * 1.5);
    const look = this.camLook;
    const hp = this.heroPos;
    let tx = hp.x, tz = hp.z - this.lookAhead;
    if (this.focusT > 0) { this.focusT -= rdt; tx = this.focusAt.x; tz = this.focusAt.z; }
    // landscape: the wide view shows the island from shore to shore, so the camera keeps near its
    // middle sideways and only follows a hero who strays far (a swimmer is never lost, and the hero
    // stays clear of the thumbs at the screen's sides)
    const side = Math.max(0, sim.L.rx - 8);
    tx = THREE.MathUtils.clamp(tx, -side, side);
    tx = THREE.MathUtils.clamp(tx, hp.x - HERO_SIDE, hp.x + HERO_SIDE);
    const e = seaK * seaK * (3 - 2 * seaK);
    if (sea) {
      const s = v!.ship;
      tx += (s.x * 0.3 - tx) * e;
      tz += (s.z - SEA_AHEAD - tz) * e;
    }
    const k = Math.min(1, rdt * (this.focusT > 0 ? 2.2 : sea && seaK >= 1 ? 9 : 4));
    look.x += (tx - look.x) * k;
    look.z += (tz - look.z) * k;
    // ashore the hero never strays past the thumbs, however fast they run
    if (!sea && this.focusT <= 0) look.x = THREE.MathUtils.clamp(look.x, hp.x - HERO_SIDE, hp.x + HERO_SIDE);
    if ((this.snapSea && sea) || (this.snapHero && !sea)) { look.x = tx; look.z = tz; this.snapSea = this.snapHero = false; }
    const cam = world.camera;
    // a little wider lens at sea, for the horizon and the ships alongside
    const fov = CAM.fov + (SEA_FOV - CAM.fov) * e;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const ox = 0, oy = THREE.MathUtils.lerp(this.camOff.y * this.zoom, SEA_CAM.y, e), oz = THREE.MathUtils.lerp(this.camOff.z * this.zoom, SEA_CAM.z, e);
    cam.position.set(look.x + ox, oy, look.z + oz);
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
    // the scenery's see-through follows the hero on the islands (not the ship's own deck)
    if (sea) {
      this.heroAt.set(0, -100, 0);
      this.sail.set(v!.ship.x, v!.ship.z, 99, 0);
    } else { this.heroAt.set(p.x, 0.8, p.z); this.sail.set(0, 0, 0, 0); }
    this.waterMat.uniforms.uCam.value.copy(cam.position);
    // the sea plane follows the view (on its own grid, so the swell does not swim)
    const g = 200 / 90;
    this.water.position.x = Math.round(look.x / g) * g;
    this.water.position.z = Math.round(look.z / g) * g;
    world.followSun(this.v.set(look.x, 0, look.z - 2));

    this.syncHero(sim, dt, sea);
    if (!sea) this.syncFoes(sim, dt, look);
    this.syncFx(sim, dt, sea);
  }

  /** The palette: the island's, the sea's longer view, the storm's greys, a lightning flash. */
  private atmosphere(pal: Palette, seaK: number, stormK: number): void {
    const key = pal.sky + ':' + seaK.toFixed(3) + ':' + stormK.toFixed(3) + ':' + this.lightT.toFixed(2);
    if (key === this.atmo) return;
    this.atmo = key;
    const sc = this.world.scene;
    const c = (a: number, b: number, k: number, out: THREE.Color) => out.setHex(a).lerp(this.tmpCol.setHex(b), k);
    const flash = Math.min(1, this.lightT * 4);
    c(pal.sky, STORM.sky, stormK, sc.background as THREE.Color);
    (sc.background as THREE.Color).lerp(this.tmpCol.setHex(0xe8f0ff), flash * 0.5);
    const fog = sc.fog as THREE.Fog;
    c(pal.fog, STORM.fog, stormK, fog.color);
    fog.color.lerp(this.tmpCol.setHex(0xe8f0ff), flash * 0.4);
    fog.near = THREE.MathUtils.lerp(34, 52, seaK);
    fog.far = THREE.MathUtils.lerp(70, 135, seaK);
    c(pal.hemiSky, STORM.hemiSky, stormK, this.hemi.color);
    c(pal.hemiGround, STORM.hemiGround, stormK, this.hemi.groundColor);
    this.hemi.intensity = THREE.MathUtils.lerp(pal.ambient, STORM.ambient, stormK) + flash * 1.5;
    c(pal.sun, STORM.sun, stormK, this.world.sun!.color);
    this.world.sun!.intensity = THREE.MathUtils.lerp(pal.sunI, STORM.sunI, stormK);
    const u = this.waterMat.uniforms;
    c(pal.deep, STORM.deep, stormK, u.uDeep.value as THREE.Color);
    c(pal.shallow, STORM.shallow, stormK, u.uShallow.value as THREE.Color);
    (u.uFoam.value as THREE.Color).setHex(pal.foam);
    (u.uSky.value as THREE.Color).copy(fog.color);
    (u.uFog.value as THREE.Vector2).set(THREE.MathUtils.lerp(30, 52, seaK), THREE.MathUtils.lerp(70, 135, seaK));
  }

  /** Where the hero is: on the sand or swimming, on deck at sea, mid-jump ashore, overboard. */
  private placeHero(sim: Sim, v: Voyage | null, sea: boolean): void {
    const p = sim.p, h = this.hero;
    if (!sea || !this.ship) {
      const y = p.swim ? -0.8 + Math.sin(this.time * 3.2) * 0.06 : groundY(sim.L, p.x, p.z);
      h.root.position.set(p.x, y, p.z);
      this.heroPos.set(p.x, 0, p.z);
      return;
    }
    const deck = this.ship.localToWorld(this.v.copy(DECK));
    const s = v!.ship;
    if (sim.phase === 'dock' && v!.jumpT >= 0) {
      const u = Math.min(1, v!.jumpT / 0.8);
      h.root.position.set(deck.x + (v!.landAt.x - deck.x) * u, deck.y + (0 - deck.y) * u + Math.sin(u * Math.PI) * 2.4, deck.z + (v!.landAt.z - deck.z) * u);
    } else if (sim.phase === 'sinking' && s.t > 0.5) {
      const u = Math.min(1, (s.t - 0.5) / 0.7);
      h.root.position.set(deck.x + 2.6 * u, deck.y * (1 - u) - 1 * u + Math.sin(u * Math.PI) * 1.6, deck.z);
    } else h.root.position.copy(deck);
    this.heroPos.set(h.root.position.x, 0, h.root.position.z);
  }

  private syncHero(sim: Sim, dt: number, sea: boolean): void {
    const p = sim.p, h = this.hero;
    const v = sim.voyage;
    if (sea && v) {
      // on deck: facing the bow, idling, signalling the broadsides (handle() plays the one-shots)
      h.root.rotation.y = Math.PI - v.ship.yaw;
      h.pivot.rotation.set(0, 0, 0);
      h.pivot.position.y = 0.7;
      if (!this.heroDead && (this.lastState === '' || this.lastState === 'idle' || this.lastState === 'run' || h.clipTime > 1.2)) {
        if (sim.phase === 'dock' && v.jumpT < 0) h.play('Yes', { fade: 0.25 });
        else if (sim.phase === 'sea') h.play('Idle', { fade: 0.25 });
        this.lastState = 'idle';
      }
      h.setGlow(0);
      h.update(dt);
      h.root.visible = !(sim.phase === 'sinking' && v.ship.t > 1.25);
      this.parrot.visible = false;
      this.pf.on = false;
      this.pistol.visible = false;
      return;
    }
    h.root.rotation.y = lerpAng(h.root.rotation.y, p.face, Math.min(1, dt * 18));
    const sp = Math.hypot(p.vx, p.vz);
    const st = p.state;
    if (!this.heroDead) {
      if (p.swim && (st === 'idle' || st === 'run')) {
        // swimming: the run clip slowed right down, the body leaning into a crawl, only head and shoulders out
        if (sp > 0.4) h.play('Run', { speed: 0.5, fade: 0.2 });
        else h.play('Idle', { speed: 0.7, fade: 0.25 });
        this.lastState = 'swim';
      } else if (st === 'idle' || st === 'run') {
        if (sp > 0.6) {
          h.play('Run', { speed: Math.max(0.6, sp / 5.2), fade: 0.12 });
          // sand kicked up by the feet
          this.stepT -= dt;
          if (this.stepT <= 0 && groundY(sim.L, p.x, p.z) > -0.05) { this.stepT = 0.16; this.dust.emit(p.x - Math.sin(p.face) * 0.3, 0.1, p.z - Math.cos(p.face) * 0.3, (Math.random() - 0.5) * 0.6, 0.8, (Math.random() - 0.5) * 0.6, 0.5, 0.35, 0.6, sim.L.palette.sand, 2, 2); }
        } else if (sim.phase === 'cleared' || sim.phase === 'shop' || sim.phase === 'draft' || sim.phase === 'chart') h.play('Yes', { fade: 0.25 });
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
    if (p.swim && !this.heroDead) {
      this.swimFx = Math.min(1, this.swimFx + dt * 3);
      h.pivot.rotation.x = (sp > 0.4 ? 0.62 : 0.1) * this.swimFx + Math.sin(this.time * 6) * 0.04;
      h.pivot.rotation.z = sp > 0.4 ? Math.sin(this.time * 5) * 0.12 : 0;
    } else this.swimFx = 0;
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
    this.flyParrot(sim, dt, sp);
  }

  /**
   * The parrot companion flies: a soft spring after the simulation's parrot (a loose orbit round the
   * hero, a swoop down at a foe it pecks), heading where it flies, banking into its turns, nose
   * down in a dive, wings beating (gliding now and then). When all is quiet it lands on the hero's
   * shoulder and folds its wings.
   */
  private flyParrot(sim: Sim, dt: number, heroSpeed: number): void {
    const p = sim.p, pf = this.pf, b = sim.parrot, h = this.hero;
    const on = p.powers.parrot > 0 && !this.heroDead;
    if (on && !pf.on) { pf.pos.set(b.x, b.y + 0.2, b.z); pf.vel.set(0, 0, 0); pf.perch = 0; pf.idle = 0; pf.wing = 1; pf.yaw = p.face; }
    pf.on = on;
    this.parrot.visible = on;
    if (!on || dt <= 0) return;
    const quiet = b.target < 0 && !p.swim && heroSpeed < 0.3 && (p.state === 'idle' || p.state === 'cheer');
    pf.idle = quiet ? pf.idle + dt : 0;
    const perch = pf.idle > 1.5;
    const tgt = this.s;
    if (perch) {
      // on the hero's left shoulder, out beside the head
      const sh = h.bones.get('ShoulderL');
      if (sh) sh.getWorldPosition(tgt); else tgt.set(p.x, 0.8, p.z);
      tgt.x += Math.cos(p.face) * 0.3; tgt.z -= Math.sin(p.face) * 0.3;
      tgt.y += 0.32;
    } else tgt.set(b.x, b.y + 0.2, b.z);
    const K = perch ? 40 : b.target >= 0 ? 30 : 14, C = 2 * Math.sqrt(K) * 0.9;
    pf.vel.x += ((tgt.x - pf.pos.x) * K - pf.vel.x * C) * dt;
    pf.vel.y += ((tgt.y - pf.pos.y) * K - pf.vel.y * C) * dt;
    pf.vel.z += ((tgt.z - pf.pos.z) * K - pf.vel.z * C) * dt;
    pf.pos.addScaledVector(pf.vel, dt);
    const near = pf.pos.distanceTo(tgt);
    const landed = perch && near < 0.12;
    if (landed) { pf.pos.copy(tgt); pf.vel.set(0, 0, 0); }
    pf.perch += ((landed ? 1 : 0) - pf.perch) * Math.min(1, dt * 6);
    const fly = 1 - pf.perch;
    const hv = Math.hypot(pf.vel.x, pf.vel.z);
    const yawTo = perch && near < 0.6 ? p.face : hv > 0.25 ? Math.atan2(pf.vel.x, pf.vel.z) : pf.yaw;
    const d = Math.atan2(Math.sin(yawTo - pf.yaw), Math.cos(yawTo - pf.yaw));
    const turn = d * Math.min(1, dt * 6);
    pf.yaw += turn;
    // bank into the turn, nose down when diving, up when climbing; level and upright on the shoulder
    const bankTo = THREE.MathUtils.clamp(-turn / dt * 0.16, -0.7, 0.7) * fly;
    pf.bank += (bankTo - pf.bank) * Math.min(1, dt * 5);
    const pitchTo = fly * (-0.45 + THREE.MathUtils.clamp(pf.vel.y * 0.12, -0.5, 0.35));
    pf.pitch += (pitchTo - pf.pitch) * Math.min(1, dt * 6);
    // the wingbeat: quick and deep climbing or chasing, a glide on the way down
    const glide = pf.vel.y < -1.4 && !perch ? 1 : 0;
    pf.flap += dt * (26 + Math.min(14, hv * 2.2)) * (1 - glide * 0.85);
    pf.wing += (fly * (glide ? 0.75 : 1) - pf.wing) * Math.min(1, dt * 7);
    const beat = Math.sin(pf.flap) * (1 - glide * 0.85);
    this.flapParrot(pf.wing, beat);
    this.parrot.position.set(pf.pos.x, pf.pos.y - beat * 0.05 * fly, pf.pos.z);
    this.parrot.rotation.set(pf.bank, pf.yaw - Math.PI / 2, pf.pitch);
  }

  private clearFoes(): void {
    for (const fv of this.foes.values()) if (fv.fig && fv.pool) fv.pool.give(fv.fig);
    this.foes.clear();
    this.sea.clear();
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
      case 'shark': case 'hunter': return this.pools.shark;
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
        fv = { fig, pool, kind: f.kind, state: '', dead: false, seen: true, px: f.x, py: f.y, pz: f.z, pitch: 0, splashT: 0 };
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
    if (f.kind === 'hunter' || f.kind === 'shark') { this.poseShark(fv, f, dt, every, changed); return; }
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

  /**
   * A shark: under water but for its fin while it swims (a foam wake behind the fin), its back out
   * as it winds up, a leap out of the sea along its lane (nose up, then down), thrashing in the
   * shallows, a dive back under. Island sharks and the hunters of swimmers alike.
   */
  private poseShark(fv: FoeView, f: Foe, dt: number, every: number, changed: boolean): void {
    const fig = fv.fig!, st = f.state, t = this.time;
    const swim = st === 'fin' || st === 'stalk' || st === 'leave' || st === 'circle';
    let y = f.y;
    if (swim) y = -0.68 + Math.sin(t * 2.2 + f.id) * 0.04;
    if (st === 'thrash') y = -0.32 + Math.abs(Math.sin(t * 9)) * 0.08;
    fig.root.position.set(f.x, y, f.z);
    // pitch along the leap: nose up out of the water, down into it
    const ds = Math.hypot(f.x - fv.px, f.z - fv.pz), dy = f.y - fv.py;
    const pitchTo = st === 'lunge' && ds > 1e-4 ? -Math.atan2(dy, ds) * 0.9 : st === 'dive' ? 0.35 : st === 'wind' ? -0.12 : 0;
    fv.pitch += (pitchTo - fv.pitch) * Math.min(1, dt * 12);
    fv.px = f.x; fv.py = f.y; fv.pz = f.z;
    fig.root.rotation.set(fv.pitch, f.face, st === 'thrash' ? Math.sin(t * 15) * 0.45 : swim ? Math.sin(t * 1.7 + f.id) * 0.08 : 0);
    if (st === 'dead') { fig.root.rotation.set(0, f.face, Math.PI); fig.root.position.y = -0.3 - f.deadT * 0.5; }
    if (changed) {
      if (st === 'lunge') fig.play('Swim_Bite', { once: true, restart: true, speed: 1.3 });
      else if (st === 'wind') fig.play('Swim_Fast', { speed: 1.5 });
      else if (st === 'thrash') fig.play('Swim_Fast', { speed: 2.6 });
      else fig.play('Swim', { speed: st === 'leave' || st === 'dive' ? 1.6 : 1.1 });
    }
    // the fin cuts a foam wake; the leap and the thrashing throw spray
    if ((swim || st === 'dive') && f.y < -0.3) this.wakes.lay('i' + f.id, f.x - Math.sin(f.face) * 0.45, f.z - Math.cos(f.face) * 0.45, Math.sin(f.face), Math.cos(f.face), 0.12, 0.55, swim ? 0.85 : 0.5, 1.5, 0.35);
    fv.splashT -= dt;
    if ((st === 'thrash' || st === 'wind') && fv.splashT <= 0) {
      fv.splashT = st === 'thrash' ? 0.12 : 0.25;
      for (let i = 0; i < (st === 'thrash' ? 4 : 2); i++) this.particles.emit(f.x + (Math.random() - 0.5) * 1.6, -0.1, f.z + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.55, 0.32, 0.1, 0xeefbff, 0.8, 12);
    }
    if (st === 'lunge' && f.y > -0.2 && Math.random() < dt * 30) this.particles.emit(f.x, f.y - 0.2, f.z, (Math.random() - 0.5), -0.5, (Math.random() - 0.5), 0.4, 0.26, 0.08, 0xeefbff, 1, 9);
    fig.update(dt, every);
  }

  /** A foe's small health bar at (x, y, z), shown once hurt, its lost health trailing, faded out at death. */
  bar(key: string, hp: number, max: number, dead: boolean, x: number, y: number, z: number, w: number, h: number, color: number, dt: number): void {
    let b = this.bars.get(key);
    if (!b) { b = { ghost: 1, hold: 0, a: 0, last: 1, seen: true }; this.bars.set(key, b); }
    b.seen = true;
    const k = Math.max(0, hp / Math.max(1, max));
    const a = stepBar(b, k, dead, dt);
    this.hpBars.add(x, y, z, w, h, k, b.ghost, a, color);
  }

  private syncFx(sim: Sim, dt: number, sea: boolean): void {
    const cq = this.camQ, t = this.time;
    for (const b of [this.shadows, this.glows, this.flares, this.rings, this.discs, this.streaks, this.slashes, this.inkBB, this.splats, this.bubbles, this.gulls]) b.begin(cq);
    this.teles.begin();
    this.hpBars.begin();
    for (const b of this.bars.values()) b.seen = false;
    // telegraphs: red warnings that fill as the blow comes; gold for the player's own fire
    for (const T of sim.teles) {
      const fill = Math.min(1, T.t / T.dur);
      const col = T.friendly ? 0xffc23a : T.lane ? 0xff7a2a : 0xff2a1a;
      const pulse = fill > 0.7 ? 0.5 + Math.sin(t * 30) * 0.5 : 0;
      if (T.kind === 'circle') this.teles.add(SHAPE.circle, T.x, T.z, T.r, 0, 0, 0, 0, fill, col, pulse);
      else if (T.kind === 'cone') this.teles.add(SHAPE.cone, T.x, T.z, T.r, 0, 0, T.ang, T.arc, fill, col, pulse);
      else this.teles.add(SHAPE.line, T.x, T.z, 0, T.w, T.len, T.ang, 0, fill, col, pulse);
    }
    // lightning on a stormy passage
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      if (b.t <= 0) { this.bolts.splice(i, 1); continue; }
      const k = b.t / 0.2;
      for (let j = 0; j < 4; j++) this.streaks.add(b.x + Math.sin(j * 2.1 + b.x) * 1.2, 4 + j * 6, b.z, 0.5, 7, Math.sin(j * 1.7) * 0.4, 0xf0f6ff, k);
      this.glows.add(b.x, 10, b.z, 30, 30, 0, 0xc8dcff, k * 0.4);
    }
    if (sea) this.sea.sync(sim, sim.voyage!, dt, t, cq, this.swell, this.ship!);
    else this.islandFx(sim, dt);

    // one-shot flashes and rings
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t -= dt;
      if (fl.t <= 0) { this.flashes.splice(i, 1); continue; }
      const k = fl.t / fl.max;
      if (fl.kind === 'ring') this.rings.add(fl.x, fl.y < 0 ? this.surf(fl.x, fl.z) : Math.max(0.05, fl.y), fl.z, fl.s * (1.15 - k * 0.6), fl.s * (1.15 - k * 0.6), 0, fl.c, k * 0.7);
      else if (fl.kind === 'glow') this.glows.add(fl.x, fl.y, fl.z, fl.s, fl.s, 0, fl.c, k * 0.5);
      else this.flares.add(fl.x, fl.y, fl.z, fl.s * (0.6 + k * 0.4), fl.s * (0.6 + k * 0.4), t * 3, fl.c, k);
    }

    this.particles.update(dt, cq);
    this.dust.update(dt, cq);
    this.wakes.update(dt, t, this.swell);
    for (const [key, b] of this.bars) if (!b.seen) this.bars.delete(key);
    for (const b of [this.shadows, this.glows, this.flares, this.rings, this.discs, this.streaks, this.slashes, this.inkBB, this.splats, this.bubbles, this.gulls]) b.end();
    this.teles.end();
    this.hpBars.end();
  }

  /** The island's effects: the hero's marker, shadows, pools, sword arcs, shots, barrels, loot, the islet's gulls. */
  private islandFx(sim: Sim, dt: number): void {
    const t = this.time, p = sim.p;

    // the hero's marker and shadow; the ghost shield; a swimmer's ripples and wake
    const gy = groundY(sim.L, p.x, p.z);
    if ((!this.heroDead || sim.phaseT < 2) && !p.swim && gy > -0.3) this.shadows.add(p.x, 0.03 + gy, p.z, 1.2, 1.2, 0, 0xffffff, 1);
    if (p.swim && !this.heroDead) {
      const mv = Math.hypot(p.vx, p.vz);
      const sy = this.surf(p.x, p.z);
      for (let i = 0; i < 2; i++) {
        const u = ((t * 0.9 + i * 0.5) % 1);
        this.rings.add(p.x, sy, p.z, 1.1 + u * 1.7, 1.1 + u * 1.7, 0, 0xdff6ff, (1 - u) * 0.28);
      }
      if (mv > 0.4 && Math.random() < dt * 10) this.particles.emit(p.x + Math.sin(p.face) * 0.5 + (Math.random() - 0.5) * 0.6, -0.05, p.z + Math.cos(p.face) * 0.5, (Math.random() - 0.5), 1.8 + Math.random() * 1.5, (Math.random() - 0.5), 0.5, 0.28, 0.08, 0xeefbff, 1, 7);
      if (mv > 0.4) this.wakes.lay('swim', p.x - Math.sin(p.face) * 0.4, p.z - Math.cos(p.face) * 0.4, Math.sin(p.face), Math.cos(p.face), 0.22, 0.6, Math.min(1, mv / 2.5) * 0.8, 1.6, 0.45);
    }
    if (!this.heroDead) {
      this.rings.add(p.x, p.swim ? this.surf(p.x, p.z) + 0.01 : Math.max(0.04 + Math.max(-0.2, gy), gy < -0.15 ? this.surf(p.x, p.z) + 0.01 : -9), p.z, 1.6, 1.6, 0, 0xffe27a, 0.55 + Math.sin(t * 4) * 0.12);
      if (p.powers.shield > 0) {
        const k = Math.min(1, p.powers.shield / 1.5);
        this.bubbles.add(p.x, 0.85, p.z, 2.3, 2.3, t, 0x7fe8ff, (0.7 + Math.sin(t * 6) * 0.15) * (p.powers.shield < 2 && Math.floor(t * 8) % 2 ? 0.3 : 1) * k);
      }
      if (p.powers.rum > 0 && Math.hypot(p.vx, p.vz) > 2 && Math.random() < dt * 30) this.particles.emit(p.x, 0.5, p.z, 0, 0.4, 0, 0.35, 0.5, 0.1, POWER_COLOR.rum, 2, 0);
      if (p.powers.gold2 > 0 && Math.random() < dt * 6) this.particles.emit(p.x + (Math.random() - 0.5), 2 + Math.random() * 0.3, p.z + (Math.random() - 0.5), 0, 0.6, 0, 0.6, 0.3, 0.05, 0xffd23f, 1, 0);
      if (p.powers.fury > 0 && Math.random() < dt * 14) this.particles.emit(p.x + (Math.random() - 0.5) * 0.8, 0.4 + Math.random(), p.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, 0.4, 0.35, 0.05, 0xff4f7b, 1, 0);
    }
    if (this.pf.on) { const q = this.pf.pos, gy2 = groundY(sim.L, q.x, q.z); if (gy2 > -0.2) this.shadows.add(q.x, gy2 + 0.03, q.z, 0.55, 0.55, 0, 0xffffff, 0.55 * Math.max(0.3, 1 - q.y / 5)); }

    // foes' shadows, elites' glow, and their health bars
    for (const f of sim.foes) {
      const dead = f.state === 'dead';
      if (f.kind === 'tentacle' || f.kind === 'arm' || f.kind === 'head') {
        if (!dead && f.y > -2) this.rings.add(f.bx, this.surf(f.bx, f.bz), f.bz, 2.6, 2.6, 0, 0xe8fbff, 0.35 + Math.sin(t * 3 + f.id) * 0.15);
        if (f.kind === 'head' && f.state === 'open') this.glows.add(f.x, 2.2, f.z, 7, 7, 0, 0xff6ad0, 0.25);
        if (f.kind !== 'head' && (f.y > -3 || dead)) {
          // over the arm where it lies on the sand, else high on its stalk
          const flat = f.state === 'down' || f.state === 'slam' || f.state === 'lift';
          const u = flat ? f.len * 0.55 : 0.5;
          this.bar('i' + f.id, f.hp, f.maxHp, dead, f.bx + Math.sin(f.yaw) * u, flat ? 1.7 : Math.min(f.len * 0.55, 5.2) + f.y, f.bz + Math.cos(f.yaw) * u, f.kind === 'arm' ? 1.8 : 1.5, 0.26, 0xe05ad8, dt);
        }
        continue;
      }
      if (f.kind === 'shark' || f.kind === 'hunter') {
        if (f.state === 'thrash') this.rings.add(f.x, this.surf(f.x, f.z), f.z, 3 + Math.sin(t * 12) * 0.3, 3 + Math.sin(t * 12) * 0.3, 0, 0xffffff, 0.45);
        this.bar('i' + f.id, f.hp, f.maxHp, dead, f.x, Math.max(f.y, -0.4) + 1.25, f.z, 1.35, 0.24, 0xff6a3a, dt);
        continue;
      }
      if (f.kind !== 'captain') this.bar('i' + f.id, f.hp, f.maxHp, dead, f.x, f.y + 1.85 * f.scale + 0.15, f.z, f.kind === 'brute' ? 1.7 : 1.25, f.kind === 'brute' ? 0.27 : 0.23, f.elite ? 0xffc23a : 0xff4a3a, dt);
      if (dead && f.deadT > 2) continue;
      const s = f.r * f.scale * 2.6;
      this.shadows.add(f.x, 0.03, f.z, s, s, 0, 0xffffff, f.state === 'spawn' ? Math.min(1, f.t / 0.9) : 1);
      if (f.elite && f.state !== 'dead') this.glows.add(f.x, 0.8, f.z, 2.4, 2.4, 0, 0xffd23f, 0.25 + Math.sin(t * 5 + f.id) * 0.08);
      if (f.kind === 'captain' && f.state !== 'dead') this.rings.add(f.x, 0.05, f.z, 4, 4, 0, sim.bossPhase === 3 ? 0xff3060 : 0xffa060, 0.7 + Math.sin(t * 5) * 0.2);
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

    // the hidden islet: gulls circling over its treasure, a glint now and then
    const isl = sim.L.islet;
    if (isl && sim.chests.some((c) => c.islet && !c.open)) {
      for (let i = 0; i < 3; i++) {
        const a = t * (0.7 + i * 0.13) + i * 2.1;
        const r = 2 + i * 0.6;
        const flap = 0.55 + Math.abs(Math.sin(t * 7 + i * 2)) * 0.45;
        this.gulls.add(isl.x + Math.cos(a) * r, 4.6 + i * 0.5 + Math.sin(t * 1.3 + i) * 0.3, isl.z + Math.sin(a) * r * 0.8, 0.9, 0.45 * flap, Math.sin(a) * 0.3, 0xf4f8ff, 1);
      }
      if (Math.floor(t * 1.4) % 3 === 0) this.flares.add(isl.x + 0.25, 1.1, isl.z + 0.35, 1.4 + Math.sin(t * 9) * 0.4, 1.4 + Math.sin(t * 9) * 0.4, t * 2, 0xfff4b0, 0.8);
    }
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
