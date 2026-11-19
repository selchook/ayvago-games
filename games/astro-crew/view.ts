// Astro Crew: draws a mission (sim.ts) in 3D. The planet (arena.ts) is merged per chunk over a
// faceted, striped crater floor and drawn with the bent material, so it curves away round the
// camera like a tiny world under a starry sky; only the chunks near the camera are drawn. The hero,
// the mech and the aliens are the kit's rigged figures (figure.ts), pooled, and only the aliens near
// the camera get one; nests have a pulsing core, objectives a beam of light you see from afar;
// shots, spit and pickups are instanced meshes; sparks, smoke, flashes, rings, telegraphs and beams
// are pooled effects (fx3d.ts). The camera follows the hero smoothly from above and behind,
// looking ahead where it runs and aims. The hero's gun is raised and pointed at its target (the
// figure turns the arm) and every shot, flash and beam leaves from the gun's measured tip.
// The same World3D also holds the star map and the base (mapview.ts): `mode` decides which group is
// shown. The Play scene and the menu's backdrop both use it, so the menu compiles every shader the
// first Play frame needs (keepPrograms).
import Phaser from 'phaser';
import { World3D, THREE, model } from '@core/three';
import { HERO, VIEW_R, type HeroId, type Theme, type MissionDef, BOSS, HERO_IDS } from './defs';
import type { Mission, SimEvent, Foe, PickKind } from './sim';
import { mergeModels, soloGeometry, litMaterial, keepPrograms, sk } from './kit';
import { worldLayout, groundChunk, starField, THEME, CHUNKS, CHUNK, chunkCentre, chunkOf, onGround } from './arena';
import { Figure } from './figure';
import { Sprites, Rings, Teles, Beams, softDot, groundY, baseY, bendDrop, setBend, bendTilt, bentMaterial } from './fx3d';
import type { Spot } from './world';

const HERO_SCALE = 0.62;
/** The camera: up and back from its focus (the hero, a little ahead). */
const CAM_UP = 12, CAM_BACK = 13.6;
const MECH_SCALE = 0.74;
const SHOT_COLOR: Record<string, number> = { bubble: 0x7affb0, sting: 0xffe04a, laser: 0xff6ad8, ember: 0xff8a2a, cannon: 0xfff0a0, drone: 0x7ae0ff, spit: 0x9aff3a, orb: 0xffffff };
/** How fat each shot is drawn (of its hit radius): stingers and lasers are slim streaks. */
const SHOT_SIZE: Record<string, number> = { bubble: 0.85, sting: 0.55, laser: 0.6, ember: 0.85, cannon: 1.0, drone: 0.7 };
const PICK_KINDS: PickKind[] = ['xp', 'health', 'bullets', 'thunder', 'jar', 'key'];
const PICK_MODEL: Record<PickKind, { key: string; s: number; n: number }> = {
  xp: { key: 'sphere', s: 0.42, n: 220 }, health: { key: 'health', s: 0.85, n: 12 }, bullets: { key: 'bullets', s: 0.85, n: 10 },
  thunder: { key: 'thunder', s: 0.9, n: 8 }, jar: { key: 'jar', s: 0.8, n: 30 }, key: { key: 'keycard', s: 1.1, n: 8 },
};
/** Beams over the objectives, by kind. */
const BEAM_COLOR = { nest: 0xff4a6a, key: 0xffe04a, rover: 0x6affa0, dome: 0x8af0ff, boss: 0xff6a3a, castaway: 0x9af0ff };

export type ViewMode = 'arena' | 'map' | 'base';

interface FoeFig { fig: Figure; kind: string }
interface NestProp { core: THREE.Mesh; mat: THREE.MeshLambertMaterial; x: number; z: number; hive: boolean; alive: boolean; id: number }

const tmpWhite = new THREE.Color(1, 1, 1);
let nestGeo: THREE.BufferGeometry | null = null;
let shieldGeo: THREE.BufferGeometry | null = null;

export class View {
  readonly world: World3D;
  readonly arena = new THREE.Group();
  readonly mapGroup = new THREE.Group();
  readonly baseGroup = new THREE.Group();
  mode: ViewMode = 'arena';
  hero: Figure;
  mech: Figure | null = null;
  private mechs = new Map<HeroId, Figure>();
  decoy: Figure;
  castFig: Figure;
  heroId: HeroId;
  private hemi: THREE.HemisphereLight;
  private chunkMat: THREE.MeshLambertMaterial;
  private chunks: THREE.Mesh[] = [];
  private skyPlanets: THREE.Mesh[] = [];
  private stars: THREE.Points;
  private props = new THREE.Group();
  private dome: THREE.Mesh | null = null;
  private domeMat: THREE.MeshLambertMaterial | null = null;
  private beacon: THREE.Group | null = null;
  private beam: THREE.Mesh;
  private objBeams: THREE.Mesh[] = [];
  private rovers: { obj: THREE.Object3D; wheels: THREE.Object3D[]; x: number; z: number }[] = [];
  private nests: NestProp[] = [];
  private shield: THREE.Mesh;
  private shots: THREE.InstancedMesh;
  private spits: THREE.InstancedMesh;
  private picks = new Map<PickKind, THREE.InstancedMesh>();
  private crates: THREE.InstancedMesh;
  private drones: THREE.Mesh[] = [];
  private blades: THREE.Mesh[] = [];
  private bubble: THREE.Mesh;
  private pools = new Map<string, Figure[]>();
  private live = new Map<number, FoeFig>();
  readonly sparks: Sprites;
  readonly smoke: Sprites;
  readonly glow: Sprites;
  /** Muzzle flashes: big, bright and short. */
  readonly flash: Sprites;
  readonly rings: Rings;
  private teles: Teles;
  private beams: Beams;
  private shake = 0;
  private camPos = new THREE.Vector3(0, 16, 15);
  private camLook = new THREE.Vector3(0, 0, 0);
  /** The camera's focus on the ground (the hero plus a look-ahead) and the look-ahead itself. */
  readonly focus = new THREE.Vector3();
  private ahead = new THREE.Vector3();
  private time = 0;
  private theme: Theme = 'desert';
  /** The hero's death and victory poses are held. */
  heroPose: 'play' | 'dead' | 'win' = 'play';
  private lastMech = false;
  private lastShots = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private col = new THREE.Color();
  private aimV = new THREE.Vector3();
  private mz = new THREE.Vector3();
  private e = new THREE.Euler(0, 0, 0, 'XZY');
  /** Dying aliens sink and fade by themselves. */
  private dying: { fig: Figure; kind: string; t: number }[] = [];
  /** The planet the chunks show. */
  private built = '';
  /** A close-up camera for the screenshot scripts: [offset from the hero, look-at offset] (null: the game's). */
  shotCam: [number[], number[]] | null = null;

  constructor(private scene: Phaser.Scene, o: { hero: HeroId; theme?: Theme }) {
    this.heroId = o.hero;
    this.world = new World3D(scene, { fov: 40, background: 0x05040e, shadows: true, far: 260 });
    const w = this.world;
    this.hemi = new THREE.HemisphereLight(0xfff0e0, 0x6a3a2a, 1.7);
    w.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff4e4, 2.2);
    sun.position.set(-14, 30, 12);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    w.scene.add(sun, sun.target);
    w.sun = sun;
    this.stars = starField();
    w.scene.add(this.stars, this.arena, this.mapGroup, this.baseGroup);
    // the planet: one bent mesh per chunk (rebuilt per mission)
    this.chunkMat = bentMaterial();
    for (let i = 0; i < CHUNKS * CHUNKS; i++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.chunkMat);
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.chunks.push(m);
      this.arena.add(m);
    }
    this.arena.add(this.props);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(soloGeometry('planet-1', 1, 'centre'), litMaterial());
      this.skyPlanets.push(m);
      w.scene.add(m);
    }
    // the crew
    this.hero = new Figure('astronauts', HERO_SCALE, ['a-' + o.hero, 'pistol']);
    this.arena.add(this.hero.root);
    this.decoy = new Figure('astronauts', HERO_SCALE, ['a-' + o.hero, 'pistol']);
    this.decoy.mat.transparent = true;
    this.decoy.mat.opacity = 0.45;
    this.decoy.mat.color.setHex(0x8ae8ff);
    this.decoy.root.visible = false;
    this.arena.add(this.decoy.root);
    this.castFig = new Figure('astronauts', HERO_SCALE, ['a-bee', 'pistol']);
    this.castFig.root.visible = false;
    this.arena.add(this.castFig.root);
    this.setMech(o.hero);
    // shots, spit, pickups, crates
    const ball = new THREE.SphereGeometry(1, 10, 8);
    this.shots = new THREE.InstancedMesh(ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), 280);
    this.shots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(280 * 3).fill(1), 3);
    this.spits = new THREE.InstancedMesh(ball, new THREE.MeshBasicMaterial({ color: 0x9aff3a }), 100);
    for (const im of [this.shots, this.spits]) { im.count = 0; im.frustumCulled = false; this.arena.add(im); }
    for (const k of PICK_KINDS) {
      const P = PICK_MODEL[k];
      const im = new THREE.InstancedMesh(soloGeometry(P.key, P.s, 'centre'), litMaterial(), P.n);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = k !== 'xp';
      this.picks.set(k, im);
      this.arena.add(im);
    }
    (this.picks.get('xp')!.material as THREE.MeshLambertMaterial).emissive.setHex(0x3a1a4a);
    this.crates = new THREE.InstancedMesh(soloGeometry('crate', 1.15, 'stand'), litMaterial(), 24);
    this.crates.count = 0;
    this.crates.castShadow = true;
    this.crates.frustumCulled = false;
    this.arena.add(this.crates);
    // drones (tiny copies of the crew's ship), orbit blades, the shield bubble
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Mesh(soloGeometry('ship-' + o.hero, 0.13, 'centre'), litMaterial());
      d.visible = false;
      this.drones.push(d);
      this.arena.add(d);
    }
    const bladeGeo = new THREE.TorusGeometry(0.42, 0.12, 6, 14);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(bladeGeo, new THREE.MeshBasicMaterial({ color: 0x9af0ff }));
      b.visible = false;
      this.blades.push(b);
      this.arena.add(b);
    }
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 12), new THREE.MeshBasicMaterial({ color: 0x7ad8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bubble.visible = false;
    this.arena.add(this.bubble);
    shieldGeo ??= new THREE.IcosahedronGeometry(1, 2);
    this.shield = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: 0xff8a5a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
    this.shield.visible = false;
    this.arena.add(this.shield);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 40, 16, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: 0x8af0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.visible = false;
    this.arena.add(this.beam);
    // beams of light over the objectives (seen from far over the hills)
    const kb = new THREE.CylinderGeometry(0.28, 0.5, 18, 10, 1, true).translate(0, 9, 0);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(kb, new THREE.MeshBasicMaterial({ color: 0xffe04a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.frustumCulled = false;
      this.objBeams.push(m);
      this.arena.add(m);
    }
    // effects
    const dot = softDot();
    this.sparks = new Sprites(500, dot, 0.5, true, 6, 1.5);
    this.glow = new Sprites(400, dot, 0.75, true, 0, 3);
    this.smoke = new Sprites(160, dot, 1.6, false, -1.2, 1.2);
    this.flash = new Sprites(40, dot, 1.15, true, 0, 0);
    this.rings = new Rings(24);
    this.teles = new Teles(16);
    this.beams = new Beams();
    this.arena.add(this.sparks.points, this.glow.points, this.smoke.points, this.flash.points, this.rings.group, this.teles.group, this.beams.group);
    // a few figures of each alien ready
    for (const [k, n] of [['xs', 8], ['s', 6], ['fly', 3], ['brute', 2]] as [string, number][]) for (let i = 0; i < n; i++) this.release(this.make(k));
    this.theme = o.theme ?? 'desert';
    w.camera.position.copy(this.camPos);
    w.camera.lookAt(this.camLook);
  }

  /**
   * Compiles every shader the Play scene draws (the menu's backdrop builds this view first, with
   * the star map and the base in it), so the first round finds its programs ready.
   */
  warm(): void {
    const w = this.world;
    const boss = this.make('boss-queen');
    this.release(boss);
    for (const k of PICK_KINDS) this.picks.get(k)!.count = 1;
    this.shots.count = 1; this.spits.count = 1; this.crates.count = 1;
    const extra = [...this.objBeams, ...this.drones, ...this.blades, this.bubble, this.beam, this.shield, this.castFig.root];
    const was = extra.map((o) => o.visible);
    for (const o of extra) o.visible = true;
    keepPrograms(w.renderer, w.scene, w.camera);
    for (const k of PICK_KINDS) this.picks.get(k)!.count = 0;
    this.shots.count = 0; this.spits.count = 0; this.crates.count = 0;
    extra.forEach((o, i) => { o.visible = was[i]; });
  }

  // ---------------------------------------------------------------- setup

  /** The crew member's mech (one per animal, made when first needed, kept hidden). */
  setMech(id: HeroId): void {
    if (this.mech) this.mech.root.visible = false;
    let m = this.mechs.get(id);
    if (!m) {
      m = new Figure('mech-' + id, MECH_SCALE);
      m.root.visible = false;
      this.arena.add(m.root);
      this.mechs.set(id, m);
    }
    this.mech = m;
    this.lastMech = false;
  }

  /** Swaps the crew member (the astronaut's body, the mech, the drones' ship). */
  setHero(id: HeroId): void {
    if (id === this.heroId) return;
    this.heroId = id;
    this.hero.show(['a-' + id, 'pistol']);
    this.decoy.show(['a-' + id, 'pistol']);
    this.setMech(id);
    for (const d of this.drones) d.geometry = soloGeometry('ship-' + id, 0.13, 'centre');
  }

  /** The planet's look: lights and the sky. */
  private setTheme(theme: Theme): void {
    this.theme = theme;
    const L = THEME[theme];
    this.hemi.color.setHex(L.sky);
    this.hemi.groundColor.setHex(L.hemiGround);
    this.world.sun!.color.setHex(L.sun);
    this.world.sun!.intensity = L.sunI;
    const [a, b] = L.skyPlanets;
    this.skyPlanets[0].geometry = soloGeometry(a, 1, 'centre');
    this.skyPlanets[1].geometry = soloGeometry(b, 1, 'centre');
    this.skyPlanets[0].scale.setScalar(16);
    this.skyPlanets[1].scale.setScalar(10);
  }

  /** The mission's planet: the chunks, the nests' cores, the dome, the beacon, the rovers, the castaway. */
  buildMission(def: MissionDef, sim: Mission): void {
    this.setTheme(def.theme);
    const plan = sim.plan;
    const L = THEME[def.theme];
    // the chunks: ground and scenery merged per square (kept when the same planet is built again)
    const key = [plan.seed, def.theme, def.kind, this.heroId].join(':');
    if (key !== this.built) {
      this.built = key;
      const placed = worldLayout(def.theme, plan, this.heroId, def.kind);
      const per: (typeof placed)[] = this.chunks.map(() => []);
      for (const p of placed) per[chunkOf(p.x, p.z)].push(p);
      this.chunks.forEach((m, i) => {
        m.geometry.dispose();
        m.geometry = mergeModels(per[i], groundChunk(def.theme, plan, i));
      });
    }
    // the props
    for (const o of [...this.props.children]) {
      this.props.remove(o);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material && (mesh.material as THREE.Material) !== this.domeMat) (mesh.material as THREE.Material).dispose();
      o.traverse((c) => { const cm = c as THREE.Mesh; if (cm !== mesh && cm.isMesh && cm.material && !(cm.material as THREE.Material).userData.keep) (cm.material as THREE.Material).dispose(); });
    }
    this.dome = null;
    this.beacon = null;
    this.rovers = [];
    this.nests = [];
    this.clearLive();
    this.heroPose = 'play';
    this.hero.reset();
    this.hero.root.visible = true;
    this.hero.play('Idle_Gun');
    if (this.mech) this.mech.root.visible = false;
    this.lastMech = false;
    nestGeo ??= new THREE.IcosahedronGeometry(1, 1);
    sim.nests.forEach((n) => {
      const mat = new THREE.MeshLambertMaterial({ color: L.nest, emissive: L.nest, emissiveIntensity: 0.4, flatShading: true });
      const core = new THREE.Mesh(nestGeo!, mat);
      core.castShadow = true;
      this.props.add(core);
      this.nests.push({ core, mat, x: n.x, z: n.z, hive: n.hive, alive: true, id: n.id });
    });
    if (def.kind === 'defend') {
      if (!this.domeMat) { this.domeMat = litMaterial(); this.domeMat.userData.keep = true; }
      this.dome = new THREE.Mesh(soloGeometry('dome', 0.62, 'stand'), this.domeMat);
      this.dome.castShadow = true;
      this.props.add(this.dome);
    }
    if (def.kind === 'keys') {
      const g = new THREE.Group();
      const sup = new THREE.Mesh(soloGeometry('house-support', 0.55, 'stand'), litMaterial());
      const ant = new THREE.Mesh(soloGeometry('roof-antenna', 0.7, 'stand'), litMaterial());
      ant.position.y = 0.45;
      sup.castShadow = ant.castShadow = true;
      g.add(sup, ant);
      this.props.add(g);
      this.beacon = g;
    }
    if (def.kind === 'rescue') {
      const kinds = ['rover-1', 'rover-round', 'rover-2', 'rover-1', 'rover-round'];
      sim.rovers.forEach((r, i) => {
        const obj = model(sk(kinds[i % kinds.length]), { shadows: true });
        obj.scale.setScalar(0.4);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.rotation.y = r.face;
        const mat = litMaterial();
        const wheels: THREE.Object3D[] = [];
        obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat; } if (/wheel/i.test(o.name)) wheels.push(o); });
        // stranded: tipped over a little until fixed
        obj.rotation.z = 0.18;
        this.props.add(wrap);
        this.rovers.push({ obj: wrap, wheels, x: r.x, z: r.z });
      });
    }
    // the castaway: another crew member, waving for help
    const others = HERO_IDS.filter((h) => h !== this.heroId);
    this.castFig.reset();
    this.castFig.show(['a-' + others[def.n % others.length], 'pistol']);
    this.castFig.root.visible = !!sim.castaway;
    this.castFig.play('Wave');
    this.beam.visible = false;
    this.shield.visible = false;
    this.sparks.clear(); this.glow.clear(); this.smoke.clear(); this.flash.clear(); this.rings.clear(); this.beams.clear();
    this.follow(sim, 1, true);
  }

  // ---------------------------------------------------------------- the aliens' figures

  private make(kind: string): Figure {
    let f: Figure;
    switch (kind) {
      case 'xs': f = new Figure('blobs', 0.55, ['e-xs']); break;
      case 's': f = new Figure('blobs', 0.62, ['e-s']); break;
      case 'fly': f = new Figure('flyer', 0.6); break;
      case 'brute': f = new Figure('brute', 0.62); break;
      case 'boss-titan': f = new Figure('brute', BOSS.titan.scale); f.setTint(BOSS.titan.tint); break;
      case 'boss-king': f = new Figure('brute', BOSS.king.scale); f.setTint(BOSS.king.tint); break;
      default: f = new Figure('flyer', BOSS.queen.scale); f.setTint(BOSS.queen.tint); break;
    }
    f.tag = kind;
    this.arena.add(f.root);
    return f;
  }

  private release(f: Figure, kind = f.tag): void {
    f.root.visible = false;
    let p = this.pools.get(kind);
    if (!p) { p = []; this.pools.set(kind, p); }
    p.push(f);
  }

  private take(kind: string): Figure {
    const p = this.pools.get(kind);
    const f = p?.pop() ?? this.make(kind);
    f.reset();
    if (kind.startsWith('boss-')) f.setTint(BOSS[kind.slice(5) as keyof typeof BOSS].tint);
    return f;
  }

  private figKind(f: Foe): string { return f.kind === 'boss' ? 'boss-' + f.boss : f.kind; }

  private clearLive(): void {
    for (const [, ff] of this.live) this.release(ff.fig, ff.kind);
    this.live.clear();
    for (const d of this.dying) this.release(d.fig, d.kind);
    this.dying = [];
  }

  // ---------------------------------------------------------------- events

  /** Effects for a simulation event (sounds and words are the scene's). */
  handle(ev: SimEvent, sim: Mission): void {
    const H = HERO[sim.run.hero];
    switch (ev.type) {
      case 'shoot': {
        // the muzzle flash, right at the gun's tip (its height is over the hero's ground)
        const y = baseY(ev.gx, ev.gz) + ev.y - bendDrop(ev.x, ev.z);
        const c = ev.kind === 'cannon' ? 0xfff0a0 : H.color;
        this.flash.dot(ev.x, y, ev.z, 0, 0, 0, 0xffffff, 0.06, 1);
        this.flash.dot(ev.x, y, ev.z, 0, 0, 0, c, ev.big ? 0.14 : 0.09, 0.9);
        const h = sim.hero;
        this.glow.emit(ev.x + h.aimX * 0.15, y, ev.z + h.aimZ * 0.15, c, ev.big ? 6 : 2, { speed: 1.4, up: 0.2, life: 0.14, spread: 0.08 });
        break;
      }
      case 'hit': {
        const y = groundY(ev.x, ev.z) + 1.1;
        this.sparks.emit(ev.x, y, ev.z, ev.crit ? 0xfff07a : 0xffe8c0, ev.crit ? 6 : 2, { speed: 4, up: 2, life: 0.28, spread: 0.4 });
        // a boss under steady fire flashes on critical hits only, so it keeps its colours
        const ff = this.live.get(ev.id);
        if (ff && (!ff.kind.startsWith('boss') || ev.crit)) ff.fig.flash(0.09);
        const n = this.nests.find((o) => o.id === ev.id);
        if (n) n.mat.emissiveIntensity = 1.4;
        break;
      }
      case 'kill': {
        if (ev.kind === 'nest') break;
        const y = groundY(ev.x, ev.z) + 1;
        const big = ev.kind === 'brute' || ev.kind === 'boss' || ev.elite;
        this.sparks.emit(ev.x, y, ev.z, 0x9aff6a, big ? 30 : 14, { speed: big ? 7 : 5, up: 4, life: 0.55, spread: 0.6 });
        this.smoke.emit(ev.x, y - 0.3, ev.z, 0x6a5a7a, big ? 10 : 4, { speed: 1.2, up: 0.8, life: 0.8, spread: 0.8, alpha: 0.6 });
        if (big) this.rings.add(ev.x, ev.z, 0.5, ev.kind === 'boss' ? 9 : 4, 0x9aff6a, 0.6);
        if (ev.kind === 'boss') this.kick(1.2);
        const ff = this.live.get(ev.id);
        if (ff) { this.live.delete(ev.id); ff.fig.play('Death', { once: true, fade: 0.05 }); this.dying.push({ fig: ff.fig, kind: ff.kind, t: 0 }); }
        break;
      }
      case 'nestDown': {
        const n = this.nests.find((o) => Math.abs(o.x - ev.x) < 0.01 && Math.abs(o.z - ev.z) < 0.01);
        const L = THEME[this.theme];
        if (n) { n.alive = false; n.core.visible = false; }
        const y = groundY(ev.x, ev.z) + 1.4;
        this.sparks.emit(ev.x, y, ev.z, L.nest, 50, { speed: 9, up: 6, life: 0.8, spread: 1.2 });
        this.glow.emit(ev.x, y, ev.z, 0xffffff, 20, { speed: 5, up: 4, life: 0.5, spread: 1 });
        this.smoke.emit(ev.x, y, ev.z, 0x3a2a3a, 18, { speed: 2.5, up: 1.5, life: 1.4, spread: 1.5, alpha: 0.7 });
        this.rings.add(ev.x, ev.z, 0.5, 9, L.nest, 0.8);
        this.kick(0.9);
        break;
      }
      case 'nestWake': {
        const L = THEME[this.theme];
        this.rings.add(ev.x, ev.z, 0.5, 6, L.nest, 0.7);
        break;
      }
      case 'portal': {
        const L = THEME[this.theme];
        this.rings.add(ev.x, ev.z, 0.3, ev.big ? 3 : 1.8, L.portal, 0.75, 1);
        this.glow.emit(ev.x, groundY(ev.x, ev.z) + 0.6, ev.z, L.portal, ev.big ? 16 : 8, { speed: 1.2, up: 2.2, life: 0.7, spread: 1 });
        break;
      }
      case 'boom': {
        if (ev.kind === 'nest') break;
        const y = groundY(ev.x, ev.z) + 0.5;
        const c = ev.kind === 'slam' ? 0xffb070 : ev.kind === 'meteor' || ev.kind === 'ember' ? 0xff7a2a : ev.kind === 'nova' ? 0x9ae8ff : ev.kind === 'mech' ? 0xfff0a0 : ev.kind === 'leap' ? 0x7affb0 : ev.kind === 'lance' ? 0xff7ae0 : 0xffe0a0;
        if (ev.kind === 'lance') break;
        this.rings.add(ev.x, ev.z, 0.3, ev.r * 1.05, c, ev.kind === 'ember' || ev.kind === 'cannon' || ev.kind === 'blast' ? 0.3 : 0.5);
        const n = Math.min(40, Math.round(ev.r * 8));
        this.sparks.emit(ev.x, y, ev.z, c, n, { speed: ev.r * 2.2, up: 3, life: 0.45, spread: ev.r * 0.4 });
        if (ev.kind === 'slam' || ev.kind === 'meteor' || ev.kind === 'leap' || ev.kind === 'mech') {
          this.smoke.emit(ev.x, y, ev.z, ev.kind === 'meteor' ? 0x5a3a2a : 0xb89a7a, Math.round(ev.r * 4), { speed: ev.r * 0.9, up: 0.6, life: 1, spread: ev.r * 0.6, alpha: 0.55, flat: true });
          this.kick(ev.kind === 'slam' ? 0.35 : 0.6);
        }
        break;
      }
      case 'skill': {
        const h = sim.hero;
        this.glow.emit(h.x, groundY(h.x, h.z) + 1, h.z, H.color, 18, { speed: 3, up: 2, life: 0.5, spread: 0.6 });
        if (ev.hero === 'flamingo') {
          // the Sun Lance leaves the gun's tip at once
          const z = [...sim.hazards].reverse().find((o) => o.kind === 'lance' && !o.done);
          if (z) {
            this.beams.addLance(z.x, z.z, z.ang, z.len, z.w, baseY(h.x, h.z) - baseY(z.x, z.z) + z.y);
            const y = baseY(h.x, h.z) + z.y - bendDrop(z.x, z.z);
            this.flash.dot(z.x, y, z.z, 0, 0, 0, 0xffffff, 0.1, 1);
            this.flash.dot(z.x, y, z.z, 0, 0, 0, 0xff8ae0, 0.25, 1);
          }
        }
        if (ev.hero === 'panda') {
          // a flare from the gun's tip calls the meteor down
          const mzl = sim.muzzleAt();
          const y = baseY(h.x, h.z) + mzl.y - bendDrop(mzl.x, mzl.z);
          h.mx = mzl.x; h.mz = mzl.z;
          this.flash.dot(h.mx, y, h.mz, 0, 0, 0, 0xffb04a, 0.12, 1);
          for (let i = 0; i < 6; i++) this.glow.dot(h.mx, y, h.mz, (Math.random() - 0.5) * 0.6, 8 + i, (Math.random() - 0.5) * 0.6, 0xffa03a, 0.5, 0.9);
        }
        break;
      }
      case 'tele': break;
      case 'chain': this.beams.addChain(ev.pts); break;
      case 'crate': {
        const y = groundY(ev.x, ev.z) + 0.6;
        this.sparks.emit(ev.x, y, ev.z, 0xffc070, 16, { speed: 4, up: 4, life: 0.5, spread: 0.6 });
        this.smoke.emit(ev.x, y, ev.z, 0x8a7a6a, 5, { speed: 1, up: 0.5, life: 0.7, spread: 0.6, alpha: 0.5 });
        break;
      }
      case 'pickup': {
        const y = groundY(ev.x, ev.z) + 0.8;
        const c = ev.kind === 'xp' ? 0xd88aff : ev.kind === 'health' ? 0x7aff8a : ev.kind === 'thunder' ? 0xffe04a : ev.kind === 'key' ? 0xffe04a : 0x8ae8ff;
        this.glow.emit(ev.x, y, ev.z, c, ev.kind === 'xp' ? 2 : 14, { speed: 2, up: 2, life: 0.35, spread: 0.3 });
        if (ev.kind !== 'xp') this.rings.add(ev.x, ev.z, 0.2, 1.6, c, 0.4);
        break;
      }
      case 'mechOn': {
        const h = sim.hero;
        this.rings.add(h.x, h.z, 0.5, 5, 0xfff0a0, 0.7);
        this.glow.emit(h.x, groundY(h.x, h.z) + 1.4, h.z, 0xfff0a0, 40, { speed: 6, up: 4, life: 0.7, spread: 1 });
        this.kick(0.9);
        break;
      }
      case 'mechOff': {
        const h = sim.hero;
        this.smoke.emit(h.x, groundY(h.x, h.z) + 1, h.z, 0xd8d8e8, 14, { speed: 2, up: 1.4, life: 0.8, spread: 1, alpha: 0.6 });
        break;
      }
      case 'hurt': this.kick(0.35); this.hero.flash(0.12); this.mech?.flash(0.12); break;
      case 'burn': { const h = sim.hero; this.glow.emit(h.x, groundY(h.x, h.z) + 0.3, h.z, 0xff6a1a, 6, { speed: 1, up: 2, life: 0.4, spread: 0.5 }); break; }
      case 'blocked': { const h = sim.hero; this.rings.add(h.x, h.z, 0.8, 2.2, 0x7ad8ff, 0.4); break; }
      case 'dodge': { const h = sim.hero; this.smoke.emit(h.x, groundY(h.x, h.z) + 0.2, h.z, 0xd8c8b8, 6, { speed: 1.4, up: 0.3, life: 0.5, spread: 0.4, alpha: 0.5, flat: true }); break; }
      case 'punch': case 'kick': {
        this.sparks.emit(ev.x, groundY(ev.x, ev.z) + 1, ev.z, 0xffffff, 10, { speed: 5, up: 2.5, life: 0.3, spread: 0.3 });
        this.kick(ev.type === 'kick' ? 0.4 : 0.15);
        break;
      }
      case 'revive': { const h = sim.hero; this.rings.add(h.x, h.z, 0.5, 6, 0xffe08a, 0.8); this.glow.emit(h.x, groundY(h.x, h.z) + 1, h.z, 0xffe08a, 30, { speed: 4, up: 4, life: 0.8, spread: 1 }); this.heroPose = 'play'; this.hero.play('Idle_Gun', { restart: true }); break; }
      case 'domeHit': if (this.domeMat) { this.domeMat.emissive.setHex(0x8a1a1a); this.scene.time.delayedCall(90, () => this.domeMat?.emissive.setHex(0)); } break;
      case 'fixed': {
        const r = sim.rovers[ev.i];
        this.rings.add(r.x, r.z, 0.5, 4, 0x7affb0, 0.6);
        this.glow.emit(r.x, groundY(r.x, r.z) + 1, r.z, 0x7affb0, 24, { speed: 4, up: 3, life: 0.7, spread: 1 });
        const rv = this.rovers[ev.i];
        if (rv) (rv.obj.children[0] as THREE.Object3D).rotation.z = 0;
        break;
      }
      case 'castaway': {
        this.rings.add(ev.x, ev.z, 0.5, 4, 0x9af0ff, 0.7);
        this.castFig.play('Yes', { restart: true });
        break;
      }
      case 'shieldDown': {
        const b = sim.boss;
        if (b) { this.rings.add(b.x, b.z, 0.5, 8, 0xff8a5a, 0.8); this.sparks.emit(b.x, groundY(b.x, b.z) + 2, b.z, 0xff8a5a, 40, { speed: 8, up: 4, life: 0.7, spread: 1.5 }); }
        break;
      }
      case 'beacon': break;
      case 'die': this.heroPose = 'dead'; this.hero.play('Death', { once: true, fade: 0.08 }); this.kick(0.8); break;
      case 'win': this.heroPose = 'win'; break;
    }
  }

  /** Adds screen shake (decays). */
  kick(k: number): void { this.shake = Math.min(1.4, this.shake + k); }

  // ---------------------------------------------------------------- per frame

  /** Places an object on the bent ground at (x, z), tilted with the planet. */
  private stand(o: THREE.Object3D, x: number, z: number, rotY: number, lift = 0): void {
    const t = bendTilt(x, z);
    o.position.set(x, groundY(x, z) + lift, z);
    o.rotation.copy(this.e.set(t.tx, rotY, t.tz, 'XZY'));
  }

  sync(sim: Mission, dt: number): void {
    this.time += dt;
    const h = sim.hero;
    // the camera's focus first: the planet bends round it
    if (this.mode === 'arena') this.aimFocus(sim, dt, false);
    // the hero (or the mech)
    const mech = h.mech > 0;
    let lift = 0;
    if (h.leap) { const k = h.leap.t / h.leap.max; lift = Math.sin(Math.PI * Math.min(1, k)) * 3; }
    if (mech !== this.lastMech) {
      this.lastMech = mech;
      if (this.mech) {
        this.mech.root.visible = mech;
        if (mech) this.mech.play('Hello', { once: true, then: 'Idle', restart: true });
      }
    }
    const fig = mech && this.mech ? this.mech : this.hero;
    this.hero.root.visible = !mech;
    this.stand(fig.root, h.x, h.z, h.face, lift);
    const speed = Math.hypot(h.vx, h.vz);
    // running backwards while aiming plays the run backwards
    const back = speed > 0.5 && (h.vx * Math.sin(h.face) + h.vz * Math.cos(h.face)) < -0.3 * speed;
    const firing = h.gunUp > 0.3 && h.roll <= 0 && h.punchT <= 0.15 && !h.leap;
    let aimW = 0;
    if (this.heroPose === 'dead') { /* Death holds */ }
    else if (this.heroPose === 'win') { if (fig.name !== 'Wave' && fig.name !== 'Yes' && fig.name !== 'Hello') fig.play(mech ? 'Hello' : 'Wave', { fade: 0.2 }); }
    else if (mech) {
      if (h.kickT > 0.3) fig.play('Kick', { once: true, restart: fig.name !== 'Kick', then: 'Idle' });
      else if (fig.name === 'Kick' && h.kickT > 0) { /* finishing */ }
      else if (speed > 0.5) fig.play('Run', { speed: (back ? -1 : 1) * Math.max(0.6, speed / 5) });
      else if (h.mechShots !== this.lastShots && h.firedT < 0.2) {
        // a big salvo every fourth shell, the small recoil between
        fig.play(h.mechShots % 4 === 0 ? 'Shoot_Big' : 'Shoot_Small', { fade: 0.05, once: true, restart: true, then: 'Idle' });
      } else if (fig.name !== 'Hello' && fig.name !== 'Shoot_Big' && fig.name !== 'Shoot_Small') fig.play('Idle');
      this.lastShots = h.mechShots;
    } else if (h.leap) fig.play('Jump', { speed: 0.7 });
    else if (h.roll > 0) fig.play('Duck', { speed: 2.6, restart: fig.name !== 'Duck' });
    else if (h.punchT > 0.15) fig.play('Punch', { speed: 1.6, restart: fig.name !== 'Punch' });
    else if (h.hurtT < 0.25 && speed < 0.5 && !firing) fig.play('HitReact', { speed: 1.4 });
    else if (speed > 0.5) { fig.play(firing ? 'Run_Gun_Shoot' : 'Run_Gun', { speed: (back ? -1 : 1) * Math.max(0.6, speed / 6.2) }); aimW = firing ? h.gunUp : 0; }
    else if (firing) { fig.play('Aim_Stand', { fade: 0.1 }); aimW = h.gunUp; }
    else fig.play('Idle_Gun', { fade: 0.2 });
    // invulnerable blink, overdrive glow
    fig.root.visible = !(h.invuln > 0 && h.invuln < 5 && this.heroPose === 'play' && Math.floor(this.time * 18) % 2 === 0 && h.roll <= 0 && !h.leap);
    if (mech) this.hero.root.visible = false;
    fig.setGlow(h.overdrive > 0 ? 0x4a2a00 : h.skillT > 0.3 ? 0x2a2a2a : 0);
    this.hero.update(dt);
    this.mech?.update(dt);
    // the gun up and on the target; its tip measured for the next shots
    this.aimV.set(h.tx, groundY(h.tx, h.tz) + 1.0, h.tz);
    if (!mech && aimW > 0) this.hero.aim(this.aimV, Math.min(1, aimW));
    this.measureMuzzle(sim, fig, mech);
    // the decoy
    if (sim.decoy) {
      this.decoy.root.visible = true;
      this.stand(this.decoy.root, sim.decoy.x, sim.decoy.z, h.face);
      this.decoy.play('Idle_Gun');
      this.decoy.update(dt);
    } else this.decoy.root.visible = false;
    // shield bubble
    const hy = groundY(h.x, h.z) + lift;
    this.bubble.visible = !!sim.m.bubble && h.bubble <= 0 && h.alive && !mech;
    if (this.bubble.visible) { this.bubble.position.set(h.x, hy + 0.9, h.z); this.bubble.scale.setScalar(1 + Math.sin(this.time * 4) * 0.03); }
    // drones and blades
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      d.visible = i < sim.m.drones && h.alive;
      if (!d.visible) continue;
      const p = sim.dronePos(i);
      d.position.set(p.x, groundY(p.x, p.z) + 2.1 + Math.sin(this.time * 3 + i) * 0.15, p.z);
      d.rotation.y = Math.atan2(p.x - h.x, p.z - h.z) + Math.PI / 2;
    }
    for (let i = 0; i < this.blades.length; i++) {
      const b = this.blades[i];
      b.visible = i < sim.m.blades && h.alive;
      if (!b.visible) continue;
      const a = sim.orbit * 3.2 + (i / sim.m.blades) * Math.PI * 2;
      const x = h.x + Math.sin(a) * 2.3, z = h.z + Math.cos(a) * 2.3;
      b.position.set(x, groundY(x, z) + 0.8, z);
      b.rotation.set(Math.PI / 2, 0, this.time * 12);
      if (Math.floor(this.time * 30) % 2 === 0) this.glow.dot(x, groundY(x, z) + 0.8, z, 0, 0, 0, 0x7ae8ff, 0.25, 0.6);
    }
    this.syncFoes(sim, dt);
    this.syncShots(sim);
    this.syncPicks(sim);
    this.syncProps(sim, dt);
    this.teles.sync(sim.hazards, this.time);
    for (const z of sim.hazards) {
      if (z.kind === 'meteor' && !z.done) {
        // the meteor falls out of the sky onto its mark
        const k = Math.max(0, z.t / z.max);
        const y = groundY(z.x, z.z) + (1 - k) * 16;
        for (let i = 0; i < 2; i++) this.glow.dot(z.x + (Math.random() - 0.5) * 0.5, y + Math.random(), z.z + (Math.random() - 0.5) * 0.5, 0, 3, 0, i ? 0xffe04a : 0xff6a1a, 0.35, 1);
        if (Math.random() < 0.5) this.smoke.dot(z.x, y + 1.5, z.z, 0, 1, 0, 0x4a3a3a, 0.8, 0.5);
      }
      if (z.kind === 'ring' && !z.done) {
        // the king's fire ring rolling out
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2;
          const x = z.x + Math.sin(a) * z.r, zz = z.z + Math.cos(a) * z.r;
          this.glow.dot(x, groundY(x, zz) + 0.4, zz, 0, 1.5, 0, 0xff6a2a, 0.35, 1);
        }
      }
    }
    this.sparks.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.flash.update(dt);
    this.rings.update(dt);
    this.beams.update(dt);
    if (this.mode === 'arena') this.follow(sim, dt, false);
  }

  /** The gun's tip (or the mech's cannons) into the simulation, in the hero's own frame. */
  private measureMuzzle(sim: Mission, fig: Figure, mech: boolean): void {
    const h = sim.hero;
    if (this.heroPose !== 'play' || h.roll > 0 || h.leap) return;
    fig.root.updateMatrixWorld(true);
    const c = Math.cos(h.face), s = Math.sin(h.face), gy = groundY(h.x, h.z);
    const put = (p: THREE.Vector3, L: { s: number; y: number; f: number }) => {
      const dx = p.x - h.x, dz = p.z - h.z;
      L.s = dx * c - dz * s; L.f = dx * s + dz * c; L.y = p.y - gy;
    };
    if (mech) {
      for (const side of [0, 1]) if (fig.muzzle(this.mz, side)) put(this.mz, h.mechMuzzle[side]);
    } else if (h.gunUp > 0.6 && fig.muzzle(this.mz)) put(this.mz, h.muzzle);
  }

  private syncFoes(sim: Mission, dt: number): void {
    const seen = new Set<number>();
    const F = this.focus;
    for (const f of sim.foes) {
      if (f.state === 'dead' || f.kind === 'nest' || f.sleep) continue;
      if (Math.abs(f.x - F.x) > VIEW_R || Math.abs(f.z - F.z) > VIEW_R) continue;
      seen.add(f.id);
      let ff = this.live.get(f.id);
      if (!ff) {
        const kind = this.figKind(f);
        const fig = this.take(kind);
        fig.root.visible = true;
        if (f.elite) { fig.setGlow(0x3a2a00); fig.setTint(0xffe0a0); }
        ff = { fig, kind };
        this.live.set(f.id, ff);
      }
      const fig = ff.fig;
      const sc = f.kind === 'boss' ? 1 : f.elite ? 1.2 : 1;
      const spawnK = f.state === 'spawn' ? Math.max(0.05, 1 - f.t / 0.7) : 1;
      fig.root.scale.setScalar(sc * spawnK);
      this.stand(fig.root, f.x, f.z, f.face);
      // clips by state
      const flyish = f.kind === 'xs' || f.kind === 's' || f.kind === 'fly' || f.boss === 'queen';
      const idle = !f.engaged && f.state === 'move';
      if (f.state === 'spawn') fig.play(flyish ? 'Flying_Idle' : 'Idle');
      else if (f.hitT < 0.15 && f.kind !== 'boss' && f.state === 'move') fig.play('HitReact', { speed: 1.6 });
      else if (f.state === 'wind') {
        if (f.kind === 's') fig.play('Punch', { speed: 1.3, restart: fig.name !== 'Punch' });
        else if (f.kind === 'brute' || (f.kind === 'boss' && !flyish)) fig.play(f.move === 'charge' ? 'Jump' : 'Weapon', { speed: f.move === 'charge' ? 0.4 : 0.9, once: true, restart: fig.name !== 'Weapon' && fig.name !== 'Jump' });
        else fig.play('Headbutt', { speed: 1.2, once: true, restart: fig.name !== 'Headbutt' });
      } else if (f.state === 'strike') {
        if (f.kind === 'xs') fig.play('Headbutt', { speed: 2.2, once: true, restart: fig.name !== 'Headbutt' });
        else fig.play('Punch', { speed: 1.4, once: true, restart: fig.name !== 'Punch' });
      } else if (f.state === 'dive') fig.play(flyish ? 'Fast_Flying' : 'Run', { speed: 1.6 });
      else if (flyish) fig.play(f.speed > 4 && !idle ? 'Fast_Flying' : 'Flying_Idle', { speed: idle ? 0.8 : 1.2 });
      else fig.play(idle && f.kind === 'boss' ? 'Idle' : 'Walk', { speed: idle ? 0.7 : 1.3 });
      fig.update(dt * (f.slow > 0 ? 0.6 : 1));
      const gy = groundY(f.x, f.z);
      if (f.burn > 0 && Math.random() < 0.3) this.glow.dot(f.x + (Math.random() - 0.5) * 0.6, gy + 0.8 + Math.random(), f.z + (Math.random() - 0.5) * 0.6, 0, 1.2, 0, 0xff7a2a, 0.4, 0.8);
      if (f.slow > 0 && Math.random() < 0.15) this.glow.dot(f.x, gy + 1, f.z, 0, 0.6, 0, 0x9ae8ff, 0.4, 0.6);
    }
    for (const [id, ff] of this.live) if (!seen.has(id)) { this.release(ff.fig, ff.kind); this.live.delete(id); }
    // the boss's shield while its hives stand
    const b = sim.boss;
    this.shield.visible = !!b && b.state !== 'dead' && sim.shielded && this.live.has(b.id);
    if (this.shield.visible && b) {
      const R = BOSS[b.boss!].r * 1.9;
      this.shield.position.set(b.x, groundY(b.x, b.z) + R * 0.8, b.z);
      this.shield.scale.setScalar(R * (1 + Math.sin(this.time * 5) * 0.03));
      this.shield.rotation.y += dt * 0.6;
      (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.22 + (b.hitT < 0.1 ? 0.3 : 0);
    }
    // the dying sink and shrink
    for (const d of this.dying) {
      d.t += dt;
      d.fig.update(dt);
      if (d.t > 0.7) { d.fig.root.position.y -= dt * 1.5; d.fig.root.scale.multiplyScalar(1 - dt * 1.6); }
    }
    if (this.dying.some((d) => d.t > 1.3)) {
      for (const d of this.dying) if (d.t > 1.3) this.release(d.fig, d.kind);
      this.dying = this.dying.filter((d) => d.t <= 1.3);
    }
  }

  private syncShots(sim: Mission): void {
    let n = 0, m = 0;
    for (const s of sim.shots) {
      // level flight at the height it left the gun (or the spitter) at
      const y = baseY(s.gx, s.gz) + s.y - bendDrop(s.x, s.z);
      if (s.hostile) {
        if (m >= 100) continue;
        const sc = s.r * 1.1 * (1 + Math.sin(this.time * 20 + s.id) * 0.12);
        this.m4.compose(this.v.set(s.x, y, s.z), this.q.identity(), this.s3.set(sc, sc, sc));
        this.spits.setMatrixAt(m++, this.m4);
        if (Math.random() < 0.3) this.glow.dot(s.x, y, s.z, 0, 0.3, 0, 0x7aff3a, 0.3, 0.6);
        continue;
      }
      if (n >= 280) continue;
      const long = s.kind === 'laser' ? 3.2 : s.kind === 'sting' ? 2.2 : s.kind === 'cannon' ? 1.4 : 1.2;
      const r = s.r * (SHOT_SIZE[s.kind] ?? 0.85);
      // the shot's tail sits at its position, so a new one starts right at the gun's tip
      const sp = Math.hypot(s.vx, s.vz) || 1, half = r * long;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.atan2(s.vx, s.vz));
      this.m4.compose(this.v.set(s.x + (s.vx / sp) * half, y, s.z + (s.vz / sp) * half), this.q, this.s3.set(r, r, half));
      this.shots.setMatrixAt(n, this.m4);
      this.col.setHex(SHOT_COLOR[s.kind] ?? 0xffffff);
      if (s.big) this.col.lerp(tmpWhite, 0.4);
      this.shots.setColorAt(n, this.col);
      n++;
      if (s.kind === 'ember' || s.kind === 'cannon' || s.big || s.kind === 'laser') this.glow.dot(s.x, y, s.z, 0, 0, 0, SHOT_COLOR[s.kind] ?? 0xffffff, s.kind === 'laser' ? 0.12 : 0.22, 0.8);
    }
    this.shots.count = n;
    this.spits.count = m;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
    this.spits.instanceMatrix.needsUpdate = true;
  }

  private syncPicks(sim: Mission): void {
    const counts = new Map<PickKind, number>();
    for (const k of PICK_KINDS) counts.set(k, 0);
    const F = this.focus;
    for (const p of sim.picks) {
      if (Math.abs(p.x - F.x) > 45 || Math.abs(p.z - F.z) > 45) continue;
      const im = this.picks.get(p.kind)!;
      const i = counts.get(p.kind)!;
      if (i >= PICK_MODEL[p.kind].n) continue;
      counts.set(p.kind, i + 1);
      const y = groundY(p.x, p.z) + (p.kind === 'xp' ? 0.45 : 0.75) + Math.sin(this.time * 3 + p.id) * 0.12;
      const pop = Math.min(1, p.t * 5);
      const sc = (p.kind === 'xp' ? (p.v >= 8 ? 1.6 : p.v >= 3 ? 1.25 : 1) : 1) * pop;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), this.time * 1.8 + p.id);
      this.m4.compose(this.v.set(p.x, y, p.z), this.q, this.s3.set(sc, sc, sc));
      im.setMatrixAt(i, this.m4);
      if (p.kind !== 'xp' && Math.random() < 0.08) this.glow.dot(p.x, y, p.z, 0, 0.8, 0, p.kind === 'health' ? 0x7aff8a : 0xffe04a, 0.5, 0.7);
    }
    for (const k of PICK_KINDS) {
      const im = this.picks.get(k)!;
      im.count = counts.get(k)!;
      im.instanceMatrix.needsUpdate = true;
    }
    let c = 0;
    for (const cr of sim.crates) {
      if (c >= 24) break;
      if (Math.abs(cr.x - F.x) > 45 || Math.abs(cr.z - F.z) > 45) continue;
      const t = bendTilt(cr.x, cr.z);
      this.q.setFromEuler(this.e.set(t.tx, cr.id * 1.3, t.tz, 'XZY'));
      this.m4.compose(this.v.set(cr.x, groundY(cr.x, cr.z), cr.z), this.q, this.s3.set(1, 1, 1));
      this.crates.setMatrixAt(c++, this.m4);
    }
    this.crates.count = c;
    this.crates.instanceMatrix.needsUpdate = true;
  }

  private syncProps(sim: Mission, dt: number): void {
    const P = sim.plan;
    const L = THEME[this.theme];
    // the nests' cores: they breathe, glow brighter when awake, flash when hit
    for (const n of this.nests) {
      if (!n.alive) continue;
      const st = sim.nests.find((o) => o.id === n.id);
      const awake = !!st?.awake;
      const k = (n.hive ? 1.25 : 0.95) * (1 + Math.sin(this.time * (awake ? 6 : 2.4) + n.x) * 0.06);
      this.stand(n.core, n.x, n.z, this.time * 0.3 + n.x, 0.95 * k);
      n.core.scale.set(k, k * 1.25, k);
      n.mat.emissiveIntensity = Math.max(awake ? 0.7 : 0.35, n.mat.emissiveIntensity - dt * 4);
      if (awake && Math.random() < 0.25) this.glow.dot(n.x + (Math.random() - 0.5) * 2, groundY(n.x, n.z) + 0.5, n.z + (Math.random() - 0.5) * 2, 0, 1.6, 0, L.nest, 0.7, 0.8);
    }
    if (this.dome) this.stand(this.dome, sim.dome.x, sim.dome.z, 0, -0.05);
    if (this.beacon) {
      const on = sim.keys.hold >= 0;
      this.stand(this.beacon, P.base.x, P.base.z, (this.beacon.rotation.y || 0) + dt * (on ? 2 : 0.3));
      this.beam.visible = on;
      if (on) {
        this.beam.position.set(P.base.x, groundY(P.base.x, P.base.z), P.base.z);
        (this.beam.material as THREE.MeshBasicMaterial).opacity = (sim.keys.near ? 0.4 : 0.2) + Math.sin(this.time * 6) * 0.1;
        if (sim.keys.near && Math.random() < 0.5) this.glow.dot(P.base.x + (Math.random() - 0.5), groundY(P.base.x, P.base.z) + 4 + Math.random() * 6, P.base.z + (Math.random() - 0.5), 0, 4, 0, 0x8af0ff, 0.6, 0.8);
      }
    }
    sim.rovers.forEach((r, i) => {
      const rv = this.rovers[i];
      if (!rv) return;
      if (r.fixed) {
        // drives home, wheels spinning
        const a = Math.atan2(P.base.x - r.x, P.base.z - r.z);
        const d = r.leave * 5;
        const x = r.x + Math.sin(a) * d, z = r.z + Math.cos(a) * d;
        this.stand(rv.obj, x, z, a);
        for (const w of rv.wheels) w.rotation.x += dt * 12;
        rv.obj.visible = r.leave < 5;
        if (Math.random() < 0.4) this.smoke.dot(x, groundY(x, z) + 0.3, z, 0, 0.6, 0, 0xc8b8a8, 0.6, 0.5);
      } else {
        this.stand(rv.obj, r.x, r.z, r.face);
        if (r.prog > 0 && Math.random() < 0.25) this.sparks.dot(r.x + (Math.random() - 0.5), groundY(r.x, r.z) + 1.2, r.z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0xffe07a, 0.4);
      }
    });
    // the castaway waves, then beams up
    const c = sim.castaway;
    if (c) {
      const up = c.saved ? c.t : 0;
      this.castFig.root.visible = up < 1.6;
      if (this.castFig.root.visible) {
        const hx = sim.hero.x - c.x, hz = sim.hero.z - c.z;
        this.stand(this.castFig.root, c.x, c.z, Math.atan2(hx, hz), up * up * 4);
        this.castFig.update(dt);
        if (c.saved && Math.random() < 0.8) this.glow.dot(c.x + (Math.random() - 0.5), groundY(c.x, c.z) + Math.random() * 3, c.z + (Math.random() - 0.5), 0, 3, 0, 0x9af0ff, 0.5, 0.9);
      }
    }
    // beams of light over what the mission is after
    let b = 0;
    const beamAt = (s: Spot, color: number) => {
      if (b >= this.objBeams.length) return;
      const m = this.objBeams[b++];
      m.visible = true;
      m.position.set(s.x, groundY(s.x, s.z), s.z);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      // a guide from afar: it fades out as the hero comes close
      const near = Math.min(1, Math.max(0, (Math.hypot(s.x - sim.hero.x, s.z - sim.hero.z) - 10) / 12));
      mat.opacity = (0.32 + Math.sin(this.time * 4 + s.x) * 0.08) * near;
      m.visible = near > 0.02;
    };
    if (sim.phase === 'play') {
      const k = sim.def.kind;
      for (const o of sim.objectives().slice(0, 6)) beamAt(o, k === 'clear' || (k === 'boss' && sim.shielded) ? BEAM_COLOR.nest : k === 'keys' ? (sim.keys.hold >= 0 ? BEAM_COLOR.dome : BEAM_COLOR.key) : k === 'rescue' ? BEAM_COLOR.rover : k === 'boss' ? BEAM_COLOR.boss : BEAM_COLOR.dome);
      if (c && !c.saved) beamAt(c, BEAM_COLOR.castaway);
    }
    for (; b < this.objBeams.length; b++) this.objBeams[b].visible = false;
  }

  /** Where the camera looks: the hero, a little ahead of where it runs and aims; the planet bends round it. */
  private aimFocus(sim: Mission, dt: number, snap: boolean): void {
    const h = sim.hero;
    const ax = h.vx * 0.42 + (h.aiming ? h.aimX * 1.4 : 0), az = h.vz * 0.32 + (h.aiming ? h.aimZ * 1.0 : 0);
    if (snap) this.ahead.set(ax, 0, az); else this.ahead.lerp(this.v.set(ax, 0, az), 1 - Math.exp(-2.5 * dt));
    const fx = h.x + this.ahead.x, fz = h.z + this.ahead.z;
    if (snap) this.focus.set(fx, 0, fz); else this.focus.lerp(this.v.set(fx, 0, fz), 1 - Math.exp(-5 * dt));
    setBend(this.focus.x, this.focus.z);
  }

  /** The camera: from above and behind the focus; shake on top; only the chunks it can see are drawn. */
  follow(sim: Mission, dt: number, snap: boolean): void {
    if (snap) this.aimFocus(sim, dt, true);
    const F = this.focus;
    const want = this.v.set(F.x, groundY(F.x, F.z) + CAM_UP, F.z + CAM_BACK);
    if (snap) this.camPos.copy(want); else this.camPos.lerp(want, 1 - Math.exp(-8 * dt));
    this.camLook.set(this.camPos.x, this.camPos.y - CAM_UP, this.camPos.z - CAM_BACK - 2.5);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake * 0.5;
    const cam = this.world.camera;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z);
    cam.lookAt(this.camLook);
    // the screenshot scripts' close-ups: a camera relative to the hero
    if (this.shotCam) {
      const h = sim.hero, [p, l] = this.shotCam;
      cam.position.set(h.x + p[0], groundY(h.x, h.z) + p[1], h.z + p[2]);
      cam.lookAt(h.x + l[0], groundY(h.x, h.z) + l[1], h.z + l[2]);
    }
    const h = sim.hero;
    this.world.followSun(this.v.set(h.x, 0, h.z));
    // the sky stays round the camera
    this.stars.position.copy(cam.position);
    this.skyPlanets[0].position.set(cam.position.x - 60, cam.position.y + 6, cam.position.z - 150);
    this.skyPlanets[1].position.set(cam.position.x + 70, cam.position.y + 22, cam.position.z - 170);
    this.skyPlanets[0].rotation.y += dt * 0.05;
    this.skyPlanets[1].rotation.y -= dt * 0.04;
    // only the chunks near the focus and not behind the camera
    for (let i = 0; i < this.chunks.length; i++) {
      const c = chunkCentre(i);
      const dx = Math.max(0, Math.abs(c.x - F.x) - CHUNK / 2), dz = Math.max(0, Math.abs(c.z - F.z) - CHUNK / 2);
      this.chunks[i].visible = Math.hypot(dx, dz) < 62 && c.z - CHUNK / 2 < F.z + 18;
    }
  }

  /** A point of the arena in game pixels (y metres above the ground). */
  screen(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(new THREE.Vector3(x, groundY(x, z) + y, z));
    return { x: p.x, y: p.y };
  }

  /** Shows one of the world's three groups (the bend only on the planet). */
  setMode(m: ViewMode): void {
    this.mode = m;
    this.arena.visible = m === 'arena';
    this.mapGroup.visible = m === 'map';
    this.baseGroup.visible = m === 'base';
    for (const p of this.skyPlanets) p.visible = m === 'arena';
    if (m !== 'arena') { this.stars.position.set(0, 0, 0); setBend(0, 0, 0); } else setBend(this.focus.x, this.focus.z);
  }

  dispose(): void {
    this.hero.dispose();
    this.decoy.dispose();
    this.castFig.dispose();
    for (const [, m] of this.mechs) m.dispose();
    for (const [, p] of this.pools) for (const f of p) f.dispose();
    for (const [, ff] of this.live) ff.fig.dispose();
    for (const d of this.dying) d.fig.dispose();
  }
}

export { onGround };
