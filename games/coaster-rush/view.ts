// Coaster Rush: draws a ride (sim.ts) in 3D. The track streams in and out around the train in
// chunks of six pieces (track, supports and station decks merged into one mesh over the Coaster
// Kit's colour map; the chain lifts' running chain, the boosters' chevrons and the stations'
// glowing bays as strips of their own), the town one area at a time (merged per block over the
// Fantasy Town Kit's colour map, with turning windmill sails and water wheels, rivers and pools).
// A gradient sky, a grass plane that follows the camera, and each area's palette fading in.
//
// The chase camera rides behind and above the train, turning with the track's heading (smoothly,
// and never over the top in a loop: there it swings out to the side to show the loop whole); the
// ride camera sits in the front seat and rolls with the track. Coins spin, power-ups glow, sparks
// fly from braking wheels, confetti at stations, spray where the log flume hits the water.
// The Play scene and the menu's autopilot both use it, so the menu compiles every shader.
import Phaser from 'phaser';
import { World3D, THREE } from '@core/three';
import type { Sim, SimEvent } from './sim';
import { STEP, newSample, type Section, type Placed, type AreaBuilt, type Pickup, type Station } from './track';
import { Batch, kitMap, kitMaterial, pieceKey, ckKey, ftKey, RIDERS } from './kit';
import { buildTown, type TownBuilt } from './town';
import { TrainView, setMaterial, type Mood } from './train';
import { Billboards, Particles, glowTex, puffTex, ringTex } from './fx3d';
import { AREAS, STYLES, POWER_COLOR, areaOf, clamp, lerp, isPower, Rng, type Palette } from './defs';

export const FOV = 62;

export interface Look { paint: number; trail: number }

const CHUNK = 6;
const AHEAD = 120;
const BEHIND = 45;
const TOWN_NEAR = 78;
const TOWN_FAR = 100;

interface Chunk { sec: Section; i0: number; i1: number; s0: number; s1: number; objs: THREE.Object3D[] | null }
interface Block { ft: Batch; ck: Batch; x: number; z: number; objs: THREE.Mesh[] | null }
interface TownLive { area: AreaBuilt; s0: number; s1: number; objs: THREE.Object3D[]; built: TownBuilt | null; spinners: TownBuilt['spinners']; blocks: Block[] }

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** A dashed strip texture (the chain) or chevrons (boosters). */
function stripTex(kind: 'chain' | 'boost' | 'bay'): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 64;
  const g = cv.getContext('2d')!;
  if (kind === 'chain') {
    g.fillStyle = '#2a2a33'; g.fillRect(0, 0, 32, 64);
    g.fillStyle = '#8a8fa0';
    for (let y = 0; y < 64; y += 16) { g.fillRect(6, y + 2, 20, 6); g.fillRect(12, y + 8, 8, 8); }
  } else if (kind === 'boost') {
    g.clearRect(0, 0, 32, 64);
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineJoin = 'round';
    for (let y = 8; y < 64; y += 32) { g.beginPath(); g.moveTo(3, y + 16); g.lineTo(16, y); g.lineTo(29, y + 16); g.stroke(); }
  } else {
    const gr = g.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 64);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A canvas texture of grass: soft noise in two greens (tinted per area by the material colour). */
function grassTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  const r = new Rng(9);
  for (let i = 0; i < 900; i++) {
    const v = 200 + Math.floor(r.next() * 55);
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    g.fillRect(r.next() * 128, r.next() * 128, 2 + r.next() * 3, 2 + r.next() * 3);
  }
  for (let i = 0; i < 260; i++) {
    const v = 150 + Math.floor(r.next() * 40);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r.next() * 128, r.next() * 128, 1.5, 3 + r.next() * 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 90);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A coin texture for the instanced coins' faces (drawn once). */
function iconTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 128): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class View {
  readonly world: World3D;
  readonly train: TrainView;
  private trackMat: THREE.MeshLambertMaterial;
  private townMat: THREE.MeshLambertMaterial;
  /** The town's colour map without vertex tints (the turning sails and wheels). */
  private townPlain: THREE.MeshLambertMaterial;
  private chainMat: THREE.MeshBasicMaterial;
  private boostMat: THREE.MeshBasicMaterial;
  private bayMat: THREE.MeshBasicMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  private paintMat: THREE.MeshLambertMaterial | null = null;
  private riderMat: THREE.MeshLambertMaterial;
  private chunks: Chunk[] = [];
  private chunked = new Set<Section>();
  private towns: TownLive[] = [];
  private townsSeen = new Set<AreaBuilt>();
  private ground: THREE.Mesh;
  private groundMat: THREE.MeshLambertMaterial;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private hemi: THREE.HemisphereLight;
  private pal: Palette = { ...AREAS[0].pal };
  private palArea = -1;
  private coins: THREE.InstancedMesh;
  private tickets: THREE.InstancedMesh;
  private powerSprites: THREE.Sprite[] = [];
  private powerTex = new Map<string, THREE.Texture>();
  private halo: Billboards;
  private rings: Billboards;
  private sparks: Particles;
  private glows: Particles;
  private puffs: Particles;
  private confetti: Particles;
  private splash: Particles;
  private bays: { mesh: THREE.Mesh; st: Station }[] = [];
  private sample = newSample();
  private s2 = newSample();
  private t = 0;
  private frame = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camYaw = 0;
  private loopK = 0;
  private snap = true;
  private shakeT = 0;
  private shakeAmp = 0;
  private chainRun = 0;
  private boostRun = 0;
  private roster: string[];
  private cars = 0;
  private riders = -1;
  private styleShown = '';
  private moodT = 0;
  private mood: Mood = 'calm';
  private safetyShown = false;
  /** Test hook: the riders' mood regardless of the ride. */
  forceMood: Mood | null = null;
  /** Ride camera (first person in the front seat). */
  rideCam = false;
  /** Menu backdrop: the picture moves up by this share (the train shows above PLAY). */
  menuShift = 0;
  /** Test hook: a fixed camera offset (yaw from behind, distance, height). */
  debugCam: { yaw: number; dist: number; h: number; at?: number; lookUp?: number } | null = null;
  /** Called when a station's riders should cheer (the Play scene plays sounds). */
  onSplash: (() => void) | null = null;

  constructor(phaser: Phaser.Scene, readonly sim: Sim, private look: Look, quality = 0.72) {
    const P = areaOf(sim.area).pal;
    this.world = new World3D(phaser, { fov: FOV, near: 0.12, far: 170, background: P.fog, fog: { color: P.fog, near: 38, far: 105 }, quality });
    const w = this.world, sc = w.scene;
    const sun = w.addLights({ sky: P.hemi, ground: P.hemiGround, ambient: 1.35, sun: P.sun, intensity: 2.4, dir: [-0.55, 0.85, 0.35], extent: 16 });
    sun.shadow.mapSize.set(1024, 1024);
    this.hemi = sc.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    this.trackMat = kitMaterial(kitMap(pieceKey('steel', 'straight')));
    this.townMat = kitMaterial(kitMap(ftKey('wall')));
    this.townPlain = new THREE.MeshLambertMaterial({ map: kitMap(ftKey('wall')) });
    // the trains share the Coaster Kit's colour map (a paint turns its hues), the people the Mini
    // Characters' one: Lambert-lit like the rest of the world (cheap to compile and to shade)
    const carSrc = kitMap(ckKey('coaster-train'));
    this.paintMat = new THREE.MeshLambertMaterial({ map: look.paint ? paintTexture(carSrc, look.paint) : carSrc });
    this.riderMat = new THREE.MeshLambertMaterial({ map: riderMap(RIDERS[0]) });
    this.chainMat = new THREE.MeshBasicMaterial({ map: stripTex('chain'), side: THREE.DoubleSide });
    this.boostMat = new THREE.MeshBasicMaterial({ map: stripTex('boost'), color: 0xff8a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.bayMat = new THREE.MeshBasicMaterial({ map: stripTex('bay'), color: 0x7dffa0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8 });
    this.waterMat = new THREE.MeshLambertMaterial({ color: P.water, transparent: true, opacity: 0.88, emissive: 0x0a2a4a });
    // ground and sky
    this.groundMat = new THREE.MeshLambertMaterial({ color: P.ground, map: grassTex() });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    sc.add(this.ground);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(P.sky) }, uHorizon: { value: new THREE.Color(P.horizon) }, uBottom: { value: new THREE.Color(P.fog) } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h * 1.8, 0.0, 1.0), 0.75)) : mix(uHorizon, uBottom, clamp(-h * 8.0, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 12), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    sc.add(this.sky);
    // pickups
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 18);
    coinGeo.rotateX(Math.PI / 2);
    this.coins = new THREE.InstancedMesh(coinGeo, new THREE.MeshLambertMaterial({ color: 0xffc23a, emissive: 0x6a4000 }), 160);
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    sc.add(this.coins);
    const tGeo = new THREE.BoxGeometry(0.46, 0.26, 0.04);
    this.tickets = new THREE.InstancedMesh(tGeo, new THREE.MeshLambertMaterial({ color: 0xff6ad0, emissive: 0x5a1040 }), 24);
    this.tickets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tickets.frustumCulled = false;
    this.tickets.count = 0;
    sc.add(this.tickets);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
      sp.scale.setScalar(0.85);
      sp.visible = false;
      sp.renderOrder = 14;
      sc.add(sp);
      this.powerSprites.push(sp);
    }
    const glow = glowTex();
    this.halo = new Billboards(sc, glow, 60, { order: 11 });
    this.rings = new Billboards(sc, ringTex(), 30, { order: 9 });
    this.sparks = new Particles(sc, glow, 260, { order: 13 });
    this.glows = new Particles(sc, glow, 160, { order: 12 });
    this.puffs = new Particles(sc, puffTex(), 120, { additive: false, order: 12 });
    this.confetti = new Particles(sc, confettiTex(), 220, { additive: false, order: 14 });
    this.splash = new Particles(sc, puffTex(), 200, { additive: false, order: 13 });
    // one tiny copy of each special material under the ground: the menu's warm-up compiles their
    // programs even when no booster, bay or power-up is near the menu's ride
    for (const mat of [this.chainMat, this.boostMat, this.bayMat, this.waterMat]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), mat);
      m.position.set(0, -20, 0);
      sc.add(m);
    }
    const warmSprite = this.powerSprites[0];
    (warmSprite.material as THREE.SpriteMaterial).map = this.powerTexture('turbo');
    for (const sp of this.powerSprites) { (sp.material as THREE.SpriteMaterial).map = this.powerTexture('turbo'); }
    // the train
    const rng = new Rng(sim.seed + 5);
    this.roster = [...RIDERS].sort(() => rng.next() - 0.5);
    this.train = new TrainView(sim.style, sim.cars, sim.riders, this.roster, this.paintMat, sim.power.safety > 0, this.riderMat);
    this.safetyShown = sim.power.safety > 0;
    this.cars = sim.cars; this.riders = sim.riders; this.styleShown = sim.style;
    sc.add(this.train.root);
    this.stream(sim, true);
    this.palette(sim, 99);
    // sets up the new scene's light state before its first frame (three.js draws the shadow
    // maps before it does, so the first frame would otherwise build light-less depth programs);
    // every program is already compiled by the menu, so this compiles nothing new
    this.camera(sim, 0.016);
    this.world.renderer.compile(this.world.scene, this.world.camera);
  }

  // ------------------------------------------------------------------ streaming

  private stream(sim: Sim, all: boolean): void {
    const s = sim.s;
    // new sections get their chunks listed
    for (const sec of sim.course.sections) {
      if (this.chunked.has(sec)) continue;
      this.chunked.add(sec);
      for (let i = 0; i < sec.pieces.length; i += CHUNK) {
        const i1 = Math.min(sec.pieces.length, i + CHUNK);
        this.chunks.push({ sec, i0: i, i1, s0: sec.pieces[i].s0, s1: sec.pieces[i1 - 1].s1, objs: null });
      }
    }
    for (const a of sim.course.areas) {
      if (this.townsSeen.has(a)) continue;
      this.townsSeen.add(a);
      const s0 = Math.min(...a.sections.map((q) => q.s0)), s1 = Math.max(...a.sections.map((q) => q.s1));
      this.towns.push({ area: a, s0, s1, objs: [], built: null, spinners: [], blocks: [] });
    }
    let budget = all ? 999 : 1;
    // build what is close, nearest first (at the start only what the camera sees at once)
    const ahead = all ? 30 : AHEAD;
    const want = this.chunks.filter((c) => !c.objs && c.s1 > s - (all ? 20 : BEHIND * 0.6) && c.s0 < s + ahead).sort((a, b) => Math.abs(a.s0 - s) - Math.abs(b.s0 - s));
    for (const c of want) { if (budget-- <= 0) break; this.buildChunk(c, sim); }
    for (const c of this.chunks) if (c.objs && (c.s1 < s - BEHIND || c.s0 > s + AHEAD + 40)) this.freeChunk(c);
    // entries stay listed (a few numbers each), so a train rolled or put back gets its track again
    budget = all ? 999 : 1;
    for (const tl of this.towns) {
      const near = tl.s0 < s + AHEAD + 30 && tl.s1 > s - 60;
      if (near && !tl.built && budget-- > 0) this.buildTownLive(tl);
      else if (!near && tl.built && tl.s1 < s - 60) this.freeTown(tl);
    }
    // the town's blocks: merged when the train comes near, freed when it is far
    const here = sim.at(s, this.s2);
    let best: Block | null = null, bd = Infinity;
    for (const tl of this.towns) for (const b of tl.blocks) {
      const d = Math.hypot(b.x - here.x, b.z - here.z);
      if (!b.objs && d < TOWN_NEAR && d < bd) { bd = d; best = b; }
      if (b.objs && d > TOWN_FAR) this.freeBlock(b);
    }
    if (best) this.buildBlock(best);
    if (all) for (const tl of this.towns) for (const b of tl.blocks) if (!b.objs && Math.hypot(b.x - here.x, b.z - here.z) < 36) this.buildBlock(b);
  }

  private buildBlock(b: Block): void {
    b.objs = [];
    const a = b.ft.build(this.townMat, { shadows: false });
    const c = b.ck.build(this.trackMat, { shadows: false });
    for (const m of [a, c]) if (m) { this.world.scene.add(m); b.objs.push(m); }
  }

  private freeBlock(b: Block): void {
    for (const m of b.objs ?? []) { this.world.scene.remove(m); m.geometry.dispose(); }
    b.objs = null;
  }

  private buildChunk(c: Chunk, sim: Sim): void {
    const b = new Batch();
    const objs: THREE.Object3D[] = [];
    const sc = this.world.scene;
    for (let i = c.i0; i < c.i1; i++) {
      const p = c.sec.pieces[i];
      b.addMatrix(pieceKey(p.style, p.kind), toMatrix(p.m));
      this.supports(b, p);
    }
    const mesh = b.build(this.trackMat);
    if (mesh) { sc.add(mesh); objs.push(mesh); }
    // the running chain on lifts, chevrons on boosters, the bay's glow
    const strips: [string, THREE.Material, number, number, number][] = [];
    for (let i = c.i0; i < c.i1; i++) {
      const p = c.sec.pieces[i];
      if (p.flag === 'lift') strips.push(['chain', this.chainMat, p.s0, p.s1, 0.12]);
      if (p.flag === 'boost') strips.push(['boost', this.boostMat, p.s0, p.s1, 0.5]);
    }
    for (const [, mat, s0, s1, w] of strips) {
      const m = this.strip(c.sec, s0, s1, w, STYLES[c.sec.pieces[0].style].top + 0.012, mat);
      sc.add(m); objs.push(m);
    }
    const st = c.sec.station;
    if (st && st.stop >= c.s0 - 0.01 && st.stop <= c.s1 + 0.01) {
      const m = this.strip(c.sec, st.stop - st.half * sim.tune.bay, st.stop + st.half * sim.tune.bay, 1.0, STYLES[c.sec.pieces[0].style].top + 0.03, this.bayMat);
      m.renderOrder = 8;
      sc.add(m); objs.push(m);
      this.bays.push({ mesh: m, st });
    }
    c.objs = objs;
  }

  /** Columns from the ground up to the track every couple of units (none under a loop's top). */
  private supports(b: Batch, p: Placed): void {
    const hang = STYLES[p.style].hang;
    const thick = p.style === 'wood' ? 'support-large' : 'support-small';
    for (let k = 2; k < p.pts.length; k += 7) {
      const q = p.pts[k];
      if (q[1] < 0.6) continue;
      // only under track that is the right way up
      const a = p.pts[Math.max(0, k - 1)], c = p.pts[Math.min(p.pts.length - 1, k + 1)];
      const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
      const flat = Math.abs(dy) / (Math.hypot(dx, dy, dz) || 1);
      if (p.kind === 'looping' && (k > 3 && k < p.pts.length - 4)) continue;
      if (flat > 0.95) continue;
      if (hang) {
        // the hanging track is held from above by a column beside it and an arm (every other
        // spot, well out to the side, so the view from under the rails stays open)
        if (k % 14 !== 2) continue;
        const l = Math.hypot(dx, dz) || 1;
        const ox = -dz / l * 1.6, oz = dx / l * 1.6;
        const top = q[1] + 0.55;
        b.add(ckKey('support-small'), q[0] + ox, 0, q[2] + oz, 0, 1, top, 1);
        // the arm: a column laid on its side from the column's top over to the rails
        const ax = -ox / 1.6, az = -oz / 1.6;
        const arm = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(ax * 1.6, 0, az * 1.6), new THREE.Vector3(az * 0.8, 0, -ax * 0.8));
        arm.setPosition(q[0] + ox, top - 0.1, q[2] + oz);
        b.addMatrix(ckKey('support-small'), arm);
        continue;
      }
      const h = q[1] - 0.02;
      if (h > 1.05) {
        b.add(ckKey(thick + '-bottom'), q[0], 0, q[2], 0, 1, 1, 1);
        b.add(ckKey(thick), q[0], 1, q[2], 0, 1, h - 1, 1);
      } else b.add(ckKey(thick), q[0], 0, q[2], 0, 1, h, 1);
    }
  }

  /** A flat strip along the track between two arc lengths, `w` wide, `lift` above the bottom line. */
  private strip(sec: Section, s0: number, s1: number, w: number, lift: number, mat: THREE.Material): THREE.Mesh {
    const g = sec.seg;
    const pos: number[] = [], uv: number[] = [];
    const i0 = Math.max(0, Math.floor((s0 - g.s0) / STEP)), i1 = Math.min(g.n - 1, Math.ceil((s1 - g.s0) / STEP));
    for (let i = i0; i <= i1; i++) {
      const px = g.p[i * 3], py = g.p[i * 3 + 1], pz = g.p[i * 3 + 2];
      const tx = g.t[i * 3], ty = g.t[i * 3 + 1], tz = g.t[i * 3 + 2];
      const ux = g.u[i * 3], uy = g.u[i * 3 + 1], uz = g.u[i * 3 + 2];
      const lx = uy * tz - uz * ty, ly = uz * tx - ux * tz, lz = ux * ty - uy * tx;
      const cx = px + ux * lift, cy = py + uy * lift, cz = pz + uz * lift;
      pos.push(cx + lx * w / 2, cy + ly * w / 2, cz + lz * w / 2, cx - lx * w / 2, cy - ly * w / 2, cz - lz * w / 2);
      const v = (i - i0) * STEP / Math.max(0.3, w * 2);
      uv.push(0, v, 1, v);
    }
    const idx: number[] = [];
    for (let i = 0; i < i1 - i0; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 5;
    return m;
  }

  private freeChunk(c: Chunk): void {
    for (const o of c.objs ?? []) {
      this.world.scene.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      this.bays = this.bays.filter((b) => b.mesh !== o);
    }
    c.objs = null;
  }

  private buildTownLive(tl: TownLive): void {
    const town = buildTown(tl.area, tl.area.def);
    const sc = this.world.scene;
    for (const [key, { ft, ck }] of town.blocks) {
      const [bx, bz] = key.split(',').map(Number);
      tl.blocks.push({ ft, ck, x: (bx + 0.5) * 24, z: (bz + 0.5) * 24, objs: null });
    }
    for (const o of town.objects) { setMaterial(o, this.townPlain); sc.add(o); tl.objs.push(o); }
    for (const w of town.water) {
      const geo = w.round ? new THREE.CircleGeometry(Math.min(w.x1 - w.x0, w.z1 - w.z0) / 2, 28) : new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0);
      const m = new THREE.Mesh(geo, this.waterMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((w.x0 + w.x1) / 2, 0.04, (w.z0 + w.z1) / 2);
      m.receiveShadow = true;
      sc.add(m); tl.objs.push(m);
    }
    tl.built = town;
    tl.spinners = town.spinners;
    this.queues.push(...[...town.queues.entries()].map(([sec, spots]) => ({ sec, spots, people: [] as THREE.Object3D[] })));
  }

  private freeTown(tl: TownLive): void {
    for (const b of tl.blocks) this.freeBlock(b);
    tl.blocks = [];
    for (const o of tl.objs) {
      this.world.scene.remove(o);
      o.traverse((q) => { const m = q as THREE.Mesh; if (m.isMesh && m.geometry && !(m as THREE.SkinnedMesh).isSkinnedMesh) m.geometry.dispose(); });
    }
    tl.objs = [];
    tl.built = null;
    tl.spinners = [];
  }

  /** Station queues: who waits on which platform. */
  private queues: { sec: Section; spots: { x: number; y: number; z: number; yaw: number }[]; people: THREE.Object3D[] }[] = [];

  // ------------------------------------------------------------------ frame

  shake(amp: number, t: number): void { if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = t; } }
  snapCamera(): void { this.snap = true; }

  sync(sim: Sim, dt: number, sdt = dt): void {
    this.t += dt;
    // the shadow map is drawn every other frame (half the shadow pass; shadows still move at 30 Hz)
    const sm = this.world.renderer.shadowMap;
    sm.autoUpdate = false;
    if ((this.frame++ & 1) === 0) sm.needsUpdate = true;
    this.stream(sim, false);
    this.trainSync(sim, sdt);
    this.pickups(sim);
    this.camera(sim, dt);
    this.palette(sim, dt);
    this.effects(sim, dt, sdt);
    this.sky.position.copy(this.world.camera.position);
    this.ground.position.set(Math.round(this.world.camera.position.x / 6) * 6, 0, Math.round(this.world.camera.position.z / 6) * 6);
    const front = this.train.centres[0];
    if (front) this.world.followSun(_v.set(front.x, 0, front.z));
    for (const tl of this.towns) for (const sp of tl.spinners) sp.obj.rotation[sp.axis] += sp.speed * dt;
  }

  private trainSync(sim: Sim, sdt: number): void {
    // the train's make and size follow the area and the upgrades
    if (sim.style !== this.styleShown || sim.cars !== this.cars || sim.riders !== this.riders) {
      this.styleShown = sim.style; this.cars = sim.cars; this.riders = sim.riders;
      this.train.build(sim.style, sim.cars, sim.riders, this.roster);
      const c = this.train.centres[0];
      if (c) this.puffs.burst(c.x, c.y, c.z, 14, 2, [0xffffff, 0xfff0d0], 0.8, 0.9);
    }
    const safe = sim.power.safety > 0;
    if (safe !== this.safetyShown) { this.safetyShown = safe; this.train.setSafety(safe); }
    const info = STYLES[sim.style];
    if (sim.state !== 'derail' && this.train.derailed) this.train.reset();
    if (sim.state === 'derail' && !this.train.derailed) this.train.derail(Math.abs(sim.derailAt.v), sim.derailAt.side);
    if (!this.train.derailed) {
      const leanK = clamp((sim.lean - 0.55) / 0.5, 0, 1);
      const lean = leanK * 0.32 * -Math.sign(sim.lg) * (info.hang ? -1.4 : 1);
      for (let i = 0; i < this.train.cars.length; i++) this.train.place(i, sim.at(sim.s - i * info.pitch, this.sample), lean * (1 - i * 0.08));
    }
    // the riders' mood
    this.moodT -= sdt;
    let mood: Mood = 'calm', up = 0;
    if (sim.state === 'board') mood = 'cheer';
    else if (sim.lean > 0.85 || sim.state === 'derail' || sim.launch > 0 || sim.v < -0.3) mood = 'scared';
    else if (sim.vg < 0.5 || (sim.v > 9 && this.sample.ty < -0.3)) { mood = 'thrill'; up = 1; }
    else if (sim.v > 10.5 || sim.vg > 3) { mood = 'thrill'; up = 0.3; }
    if (mood !== this.mood) {
      // thrills last a moment after the moment
      if (this.mood === 'thrill' && mood === 'calm' && this.moodT > 0) mood = 'thrill';
      else { this.mood = mood; if (mood === 'thrill') this.moodT = 0.9; }
    }
    if (this.forceMood) { this.mood = this.forceMood; up = 1; }
    this.train.setMood(this.mood, up);
    this.train.update(sdt);
  }

  // ------------------------------------------------------------------ pickups

  private pickups(sim: Sim): void {
    const s = sim.s;
    const riderH = STYLES[sim.style].hang ? -0.55 : 0.95;
    let nc = 0, nt = 0, np = 0;
    this.halo.begin(this.world.camera.quaternion);
    this.rings.begin(this.world.camera.quaternion);
    const spin = this.t * 3;
    const secs = new Set<Section>();
    for (const sec of sim.route) if (sec.s1 > s - 5 && sec.s0 < s + 70) secs.add(sec);
    if (sim.fork && sim.fork.s < s + 70) { secs.add(sim.fork.left); secs.add(sim.fork.right); }
    for (const sec of secs) {
      for (const p of sec.pickups) {
        if (p.taken || p.s < s - 3 || p.s > s + 70) continue;
        const f = sim.course.at([sec], p.s, this.s2);
        const hang = STYLES[sec.pieces[0].style].hang;
        const h = (hang ? -0.55 : 0.95) + (hang ? -p.h : p.h);
        _v.set(f.x + f.ux * h, f.y + f.uy * h, f.z + f.uz * h);
        if (p.kind === 'coin') {
          if (nc >= 160) continue;
          _m.compose(_v, _q.setFromAxisAngle(_v2.set(0, 1, 0), spin + p.s), _v2.set(1, 1, 1));
          this.coins.setMatrixAt(nc++, _m);
          if (p.h > 0) this.rings.add(_v.x, _v.y, _v.z, 0.75, 0.75, 0, 0xfff0a0, 0.55 + 0.25 * Math.sin(this.t * 5));
        } else if (p.kind === 'ticket') {
          if (nt >= 24) continue;
          _m.compose(_v, _q.setFromAxisAngle(_v2.set(0, 1, 0), spin * 0.7 + p.s), _v2.set(1, 1, 1));
          this.tickets.setMatrixAt(nt++, _m);
          this.halo.add(_v.x, _v.y, _v.z, 1.0, 1.0, 0, 0xff6ad0, 0.5);
        } else if (isPower(p.kind) && np < this.powerSprites.length) {
          const sp = this.powerSprites[np++];
          sp.visible = true;
          sp.position.copy(_v).y += Math.sin(this.t * 3 + p.s) * 0.08;
          const mat = sp.material as THREE.SpriteMaterial;
          const tex = this.powerTexture(p.kind);
          if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
          this.halo.add(_v.x, _v.y, _v.z, 1.9, 1.9, 0, POWER_COLOR[p.kind], 0.8);
        }
      }
    }
    void riderH;
    for (let i = np; i < this.powerSprites.length; i++) this.powerSprites[i].visible = false;
    this.coins.count = nc; this.coins.instanceMatrix.needsUpdate = true;
    this.tickets.count = nt; this.tickets.instanceMatrix.needsUpdate = true;
    this.halo.end();
    this.rings.end();
  }

  private powerTexture(k: string): THREE.Texture {
    let t = this.powerTex.get(k);
    if (t) return t;
    t = iconTex((g, s) => drawPowerIcon(g, s, k));
    this.powerTex.set(k, t);
    return t;
  }

  // ------------------------------------------------------------------ camera

  private camera(sim: Sim, dt: number): void {
    const cam = this.world.camera;
    const info = STYLES[sim.style];
    const len = sim.length;
    const mid = sim.at(sim.s - len * 0.5, this.s2);
    const midP = _v2.set(mid.x, mid.y, mid.z);
    if (this.rideCam && sim.state !== 'derail') {
      const f = sim.at(sim.s, this.sample);
      const up = new THREE.Vector3(f.ux, f.uy, f.uz), t = new THREE.Vector3(f.tx, f.ty, f.tz);
      const lat = new THREE.Vector3().crossVectors(up, t);
      const seatH = info.hang ? -0.25 : info.ride + 0.85;
      cam.position.set(f.x, f.y, f.z).addScaledVector(up, seatH).addScaledVector(t, info.hang ? 0.1 : -0.15);
      _m.makeBasis(lat.multiplyScalar(-1), up, t.multiplyScalar(-1));
      cam.quaternion.setFromRotationMatrix(_m);
      cam.fov = 78;
      cam.near = 0.12;
      cam.updateProjectionMatrix();
      this.snap = true;
      return;
    }
    // the chase camera never shows what passes right by its lens (a support column on a drop)
    const near = this.debugCam ? 0.12 : 1.1;
    if (cam.fov !== FOV || cam.near !== near) { cam.fov = FOV; cam.near = near; cam.updateProjectionMatrix(); }
    if (this.debugCam && sim.state !== 'derail') {
      // test hook: orbit the front car (yaw 0 = from behind, π = from the front), looking at it
      const f = sim.at(sim.s - (this.debugCam.at ?? 0.3) * info.pitch, this.sample);
      const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(f.tx, 0, f.tz).normalize();
      const c = new THREE.Vector3(f.x, f.y, f.z).addScaledVector(new THREE.Vector3(f.ux, f.uy, f.uz), info.hang ? -0.3 : 0.7);
      const back = t.clone().multiplyScalar(-1).applyAxisAngle(up, this.debugCam.yaw);
      cam.position.copy(c).addScaledVector(back, this.debugCam.dist).addScaledVector(up, this.debugCam.h);
      cam.lookAt(c.clone().addScaledVector(up, this.debugCam.lookUp ?? 0));
      this.camPos.copy(cam.position); this.camLook.copy(c);
      return;
    }
    // heading: the track's, smoothed; in a loop the loop's entry heading and a view from the side
    const sec = sim.sectionAt(sim.s);
    let loop: { s0: number; s1: number } | null = null;
    for (const f of sec.features) if (f.kind === 'loop' && sim.s > f.s0 - 2 && sim.s - len < f.s1 - 3) { loop = f; break; }
    let yawT = this.camYaw;
    if (loop) {
      const e = sim.at(loop.s0, this.sample);
      yawT = Math.atan2(e.tx, e.tz);
    } else {
      const hz = Math.hypot(mid.tx, mid.tz);
      if (hz > 0.35) yawT = Math.atan2(mid.tx, mid.tz);
    }
    if (this.snap) this.camYaw = yawT;
    let dy = yawT - this.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.camYaw += dy * (1 - Math.exp(-dt * 2.6));
    this.loopK += ((loop ? 1 : 0) - this.loopK) * Math.min(1, dt * 2.2);
    const dir = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const speed = Math.abs(sim.v);
    const D = (this.debugCam?.dist ?? (info.hang ? 6.4 : 6.0) + speed * 0.09), H = this.debugCam?.h ?? (info.hang ? 2.6 : 3.1) + speed * 0.04;
    const target = midP.clone().add(new THREE.Vector3(0, info.hang ? -0.5 : 0.6, 0));
    const want = target.clone().addScaledVector(dir, -D).add(new THREE.Vector3(0, H, 0));
    // the hanging coaster's columns stand on its right: watch it from up and to the left, so the
    // cars hang in clear view with the track ahead and the river below
    if (info.hang && !this.debugCam) want.addScaledVector(side, 2.6);
    if (this.debugCam) want.copy(target).addScaledVector(dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.debugCam.yaw), -D).add(new THREE.Vector3(0, H, 0));
    if (this.loopK > 0.01 && loop) {
      // out to the side of the loop, a little back, looking at the train going round
      const e = sim.at(loop.s0 + 6.5, this.sample);
      const lc = new THREE.Vector3(e.x, e.y + 1.6, e.z);
      const sideW = lc.clone().addScaledVector(side, 10.5).addScaledVector(dir, -4).add(new THREE.Vector3(0, 1.2, 0));
      want.lerp(sideW, this.loopK);
    }
    // stay above the ground and above the track behind the train (a steep lift would otherwise
    // put the camera under its own rails)
    want.y = Math.max(want.y, 1.2);
    if (!loop) {
      for (const k of [0.5, 0.8, 1.1]) {
        const b = sim.at(sim.s - len * 0.5 - D * k, this.sample);
        want.y = Math.max(want.y, b.y + (info.hang ? 1.6 : 2.3));
      }
      want.y = Math.max(want.y, 0.9);
    }
    if (this.snap) { this.camPos.copy(want); }
    else this.camPos.lerp(want, 1 - Math.exp(-dt * 4.2));
    const f = sim.at(sim.s + 3.5, this.sample);
    const look = new THREE.Vector3(f.x, f.y + (info.hang ? -0.3 : 0.4), f.z);
    look.lerp(target, 0.45 + this.loopK * 0.4);
    if (this.snap) this.camLook.copy(look); else this.camLook.lerp(look, 1 - Math.exp(-dt * 6));
    this.snap = false;
    cam.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeT * 4);
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a;
    }
    cam.lookAt(this.camLook);
    if (this.menuShift) cam.position.y -= this.menuShift * 2.2;
  }

  // ------------------------------------------------------------------ palette and effects

  private palette(sim: Sim, dt: number): void {
    const target = areaOf(sim.area).pal;
    const k = this.palArea === sim.area ? Math.min(1, dt * 0.8) : 1 - Math.exp(-dt * 0.8);
    if (dt > 10) Object.assign(this.pal, target);
    this.palArea = sim.area;
    const keys = Object.keys(target) as (keyof Palette)[];
    for (const key of keys) this.pal[key] = _c.setHex(this.pal[key]).lerp(new THREE.Color(target[key]), k).getHex();
    const P = this.pal;
    const sc = this.world.scene;
    (sc.background as THREE.Color).setHex(P.fog);
    (sc.fog as THREE.Fog).color.setHex(P.fog);
    this.skyMat.uniforms.uTop.value.setHex(P.sky);
    this.skyMat.uniforms.uHorizon.value.setHex(P.horizon);
    this.skyMat.uniforms.uBottom.value.setHex(P.fog);
    this.groundMat.color.setHex(P.ground);
    this.hemi.color.setHex(P.hemi);
    this.hemi.groundColor.setHex(P.hemiGround);
    if (this.world.sun) this.world.sun.color.setHex(P.sun);
    this.waterMat.color.setHex(P.water);
  }

  private effects(sim: Sim, dt: number, sdt: number): void {
    const cam = this.world.camera;
    // the chain runs while the train climbs on it; boosters flow while pushing
    if (sim.onLift && sim.powerOn) this.chainRun += sdt * Math.max(0.8, sim.v) * 0.5;
    this.chainMat.map!.offset.y = -this.chainRun;
    this.boostRun += sdt * (sim.onBoost ? 3 : 0.6);
    this.boostMat.map!.offset.y = -this.boostRun;
    this.boostMat.opacity = sim.onBoost ? 1 : 0.55 + 0.2 * Math.sin(this.t * 4);
    this.bayMat.opacity = 0.55 + 0.35 * Math.sin(this.t * 5);
    for (const b of this.bays) b.mesh.visible = !sim.stats || true;
    // sparks from braking wheels and leaning cars
    const cars = this.train.centres;
    if (!this.train.derailed && cars.length) {
      const f = sim.at(sim.s, this.sample);
      const back = new THREE.Vector3(-f.tx, -f.ty, -f.tz);
      if (sim.braking && Math.abs(sim.v) > 1.5) {
        for (let i = 0; i < cars.length; i++) if (Math.random() < 0.6) {
          const c = cars[i];
          this.sparks.emit(c.x + (Math.random() - 0.5) * 0.5, c.y - 0.35, c.z + (Math.random() - 0.5) * 0.5, back.x * 3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, back.z * 3 + (Math.random() - 0.5) * 3, 0.35, 0.16, 0.04, 0xffb040, 1.5, 9, 0.05);
        }
      }
      if (sim.lean > 0.85) {
        const c = cars[0];
        for (let k = 0; k < 2; k++) this.sparks.emit(c.x + (Math.random() - 0.5) * 0.6, c.y - 0.3, c.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.3, 0.14, 0.03, 0xffe080, 1.5, 10, 0.05);
      }
      // the turbo's flames and the trail's colour behind the last car
      if (sim.power.turbo > 0 || (sim.onBoost && sim.v > 4)) {
        const c = cars[cars.length - 1];
        this.glows.emit(c.x, c.y, c.z, back.x * 2, back.y * 2 + 0.3, back.z * 2, 0.4, 0.5, 0.1, sim.power.turbo > 0 ? 0xff7a1a : this.look.trail, 2, 0);
      } else if (Math.abs(sim.v) > 9 && Math.random() < 0.5) {
        const c = cars[cars.length - 1];
        this.glows.emit(c.x, c.y, c.z, back.x, back.y, back.z, 0.35, 0.3, 0.05, this.look.trail, 2, 0);
      }
      if (sim.power.golden > 0 && Math.random() < 0.4) {
        const c = cars[Math.floor(Math.random() * cars.length)];
        this.glows.emit(c.x + (Math.random() - 0.5), c.y + 0.6, c.z + (Math.random() - 0.5), 0, 0.6, 0, 0.6, 0.18, 0.02, 0xffd23f, 1, 0);
      }
      if (sim.power.magnet > 0) {
        const c = cars[0];
        this.rings.add(c.x, c.y + 0.3, c.z, 2 + Math.sin(this.t * 6) * 0.3, 2 + Math.sin(this.t * 6) * 0.3, 0, 0xe8445a, 0.35);
      }
      if (sim.power.balloon > 0) {
        for (const c of cars) this.halo.add(c.x, c.y + 1.4, c.z, 0.9, 1.1, 0, 0xff6ad0, 0.45);
      }
    }
    // station queues: idle people on the platform (made when the town arrives)
    this.queueSync(sim, sdt);
    this.sparks.update(sdt, cam.quaternion, cam.position);
    this.glows.update(sdt, cam.quaternion, cam.position);
    this.puffs.update(sdt, cam.quaternion, cam.position);
    this.confetti.update(sdt, cam.quaternion, cam.position);
    this.splash.update(sdt, cam.quaternion, cam.position);
    void dt;
  }

  private queueMixers: THREE.AnimationMixer[] = [];
  private queueSync(sim: Sim, dt: number): void {
    for (const q of this.queues) {
      if (q.people.length || !q.spots.length) continue;
      const st = q.sec.station!;
      const rng = new Rng(Math.floor(st.stop * 10));
      const n = Math.min(q.spots.length, st.queue);
      for (let i = 0; i < n; i++) {
        const spot = q.spots[i];
        const key = 'mini:' + this.roster[(i * 3 + 1) % this.roster.length];
        const obj = modelOf(key);
        setMaterial(obj, this.riderMat);
        obj.scale.setScalar(0.8);
        obj.position.set(spot.x, spot.y, spot.z);
        obj.rotation.y = spot.yaw + (rng.next() - 0.5) * 0.5;
        this.world.scene.add(obj);
        q.people.push(obj);
        const mixer = new THREE.AnimationMixer(obj);
        const clips = clipsOf(key);
        const c = clips.find((cl) => cl.name === (rng.chance(0.4) ? 'emote-yes' : 'idle')) ?? clips[0];
        if (c) { const a = mixer.clipAction(c); a.play(); a.time = rng.next() * c.duration; }
        this.queueMixers.push(mixer);
        (obj as THREE.Object3D & { mixer?: THREE.AnimationMixer }).userData.mixer = mixer;
      }
    }
    for (const m of this.queueMixers) m.update(dt);
    // people leave with the train: a boarded station's queue goes
    for (const q of this.queues) {
      const st = q.sec.station!;
      if (q.people.length && (sim.s > st.s1 + 30 || (sim.state === 'board' && Math.abs(sim.s - st.stop) < 4))) {
        for (const p of q.people) {
          this.world.scene.remove(p);
          const mixer = p.userData.mixer as THREE.AnimationMixer | undefined;
          if (mixer) this.queueMixers = this.queueMixers.filter((m) => m !== mixer);
        }
        q.people = [];
        q.spots = [];
      }
    }
    this.queues = this.queues.filter((q) => q.people.length || q.spots.length);
  }

  // ------------------------------------------------------------------ events

  handle(ev: SimEvent, sim: Sim): void {
    const cars = this.train.centres;
    const c0 = cars[0] ?? new THREE.Vector3();
    switch (ev.type) {
      case 'pickup': {
        const p = ev.p;
        const f = sim.course.at([sim.sectionAt(p.s)], p.s, this.s2);
        const hang = STYLES[sim.style].hang;
        const h = (hang ? -0.55 : 0.95) + (hang ? -p.h : p.h);
        const x = f.x + f.ux * h, y = f.y + f.uy * h, z = f.z + f.uz * h;
        const col = p.kind === 'coin' ? 0xffd23f : p.kind === 'ticket' ? 0xff6ad0 : POWER_COLOR[p.kind as keyof typeof POWER_COLOR] ?? 0xffffff;
        this.sparks.burst(x, y, z, p.kind === 'coin' ? 6 : 18, p.kind === 'coin' ? 2.5 : 4.5, [col, 0xffffff], 0.45, 0.22);
        break;
      }
      case 'stop':
        for (let i = 0; i < 70; i++) this.confetti.emit(c0.x + (Math.random() - 0.5) * 3, c0.y + 2.5 + Math.random(), c0.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5, 2.2, 0.22, 0.2, [0xff5a5a, 0xffd23f, 0x5ad2ff, 0x7dff8a, 0xff8ae6][i % 5], 1.6, 4);
        break;
      case 'derail':
        this.shake(0.5, 0.5);
        for (const c of cars) this.puffs.burst(c.x, c.y, c.z, 10, 2.5, [0xd8d0c0, 0xffffff], 0.9, 0.9);
        this.sparks.burst(c0.x, c0.y, c0.z, 40, 7, [0xffd080, 0xffffff], 0.6, 0.25);
        break;
      case 'saved':
        this.shake(0.25, 0.3);
        this.rings.add(c0.x, c0.y, c0.z, 3, 3, 0, 0x46c8ff, 1);
        this.sparks.burst(c0.x, c0.y, c0.z, 30, 5, [0x46c8ff, 0xffffff], 0.5, 0.25);
        break;
      case 'respawn':
        this.train.reset();
        for (const c of cars) this.puffs.burst(c.x, c.y, c.z, 6, 1.5, [0xffffff], 0.6, 0.7);
        break;
      case 'launch':
      case 'boost':
        this.shake(0.12, 0.25);
        break;
      case 'loop':
        this.sparks.burst(c0.x, c0.y + 0.5, c0.z, 26, 5, [0xffd23f, 0x7dffa0, 0xffffff], 0.6, 0.22);
        break;
      case 'nearMiss':
        this.shake(0.08, 0.2);
        break;
      case 'splash': {
        const k = Math.min(1.6, ev.speed / 8);
        this.shake(0.2 * k, 0.4);
        for (let i = 0; i < 70 * k; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
          this.splash.emit(c0.x + Math.cos(a) * r, Math.max(0.2, c0.y - 0.6), c0.z + Math.sin(a) * r, Math.cos(a) * 3 * k, 4 + Math.random() * 5 * k, Math.sin(a) * 3 * k, 0.9, 0.5, 1.1, [0xffffff, 0xcdeaff, 0x9ad4ff][i % 3], 1.2, 12);
        }
        this.onSplash?.();
        break;
      }
      case 'power':
        this.rings.add(c0.x, c0.y, c0.z, 3.2, 3.2, 0, POWER_COLOR[ev.kind], 1);
        break;
      default: break;
    }
  }

  /** Projects a world point to game pixels. */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } { return this.world.toScreen(p); }

  /** Shown sizes for the perf report. */
  get liveChunks(): number { return this.chunks.filter((c) => c.objs).length; }
  get liveTowns(): number { return this.towns.filter((t) => t.built).length; }
  get mood_(): Mood { return this.mood; }
}

// ------------------------------------------------------------------ helpers

function toMatrix(m: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(m[0], m[3], m[6], m[9], m[1], m[4], m[7], m[10], m[2], m[5], m[8], m[11], 0, 0, 0, 1);
}

import { model as modelOfCore, modelClips, playerCharacter3d } from '@core/three';
const modelOf = (key: string): THREE.Object3D => modelOfCore(key, { shadows: true });
const clipsOf = (key: string): THREE.AnimationClip[] => modelClips(key);

/** The Mini Characters' shared colour map (from one of the loaded riders). */
function riderMap(name: string): THREE.Texture | null {
  let map: THREE.Texture | null = null;
  modelOfCore('mini:' + name, { shadows: false }).traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !map) map = (m.material as THREE.MeshStandardMaterial).map ?? null; });
  return map;
}

/** The train's colour map with its hues turned (the shop's paints); one per paint, kept. */
const paints = new Map<number, THREE.Texture>();
function paintTexture(src: THREE.Texture | null, hue: number): THREE.Texture | null {
  if (!src) return null;
  let t = paints.get(hue);
  if (t) return t;
  const img = src.image as HTMLImageElement | ImageBitmap;
  const cv = document.createElement('canvas');
  cv.width = (img as HTMLImageElement).width || 64;
  cv.height = (img as HTMLImageElement).height || 64;
  const g = cv.getContext('2d')!;
  g.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
  g.drawImage(img as CanvasImageSource, 0, 0);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = src.flipY;
  t.magFilter = THREE.LinearFilter;
  paints.set(hue, t);
  return t;
}

/** Confetti: a small bright rectangle (tinted per particle). */
function confettiTex(): THREE.CanvasTexture {
  return iconTex((g, s) => { g.fillStyle = '#ffffff'; g.fillRect(s * 0.25, s * 0.38, s * 0.5, s * 0.24); }, 32);
}

/** The power-ups' icons (also used by the HUD through art.ts). */
export function drawPowerIcon(g: CanvasRenderingContext2D, s: number, k: string): void {
  const c = s / 2, r = s * 0.44;
  const col = '#' + (POWER_COLOR[k as keyof typeof POWER_COLOR] ?? 0xffffff).toString(16).padStart(6, '0');
  g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = s * 0.06; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const u = s / 100;
  switch (k) {
    case 'turbo': g.beginPath(); g.moveTo(56 * u, 18 * u); g.lineTo(30 * u, 56 * u); g.lineTo(48 * u, 56 * u); g.lineTo(42 * u, 82 * u); g.lineTo(70 * u, 42 * u); g.lineTo(52 * u, 42 * u); g.closePath(); g.fill(); break;
    case 'magnet':
      g.lineWidth = 13 * u; g.beginPath(); g.arc(50 * u, 46 * u, 20 * u, Math.PI, 0); g.lineTo(70 * u, 72 * u); g.moveTo(30 * u, 46 * u); g.lineTo(30 * u, 72 * u); g.stroke();
      g.fillStyle = '#3a3a48'; g.fillRect(23 * u, 66 * u, 14 * u, 10 * u); g.fillRect(63 * u, 66 * u, 14 * u, 10 * u); break;
    case 'safety':
      g.beginPath(); g.moveTo(50 * u, 18 * u); g.lineTo(76 * u, 28 * u); g.lineTo(72 * u, 60 * u); g.lineTo(50 * u, 82 * u); g.lineTo(28 * u, 60 * u); g.lineTo(24 * u, 28 * u); g.closePath(); g.fill();
      g.strokeStyle = col; g.lineWidth = 8 * u; g.beginPath(); g.moveTo(37 * u, 50 * u); g.lineTo(47 * u, 60 * u); g.lineTo(64 * u, 38 * u); g.stroke(); break;
    case 'slowmo':
      g.lineWidth = 8 * u; g.beginPath(); g.arc(50 * u, 52 * u, 26 * u, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(50 * u, 52 * u); g.lineTo(50 * u, 34 * u); g.moveTo(50 * u, 52 * u); g.lineTo(63 * u, 58 * u); g.stroke();
      g.fillRect(44 * u, 16 * u, 12 * u, 8 * u); break;
    case 'golden':
      g.save(); g.translate(50 * u, 50 * u); g.rotate(-0.35);
      g.fillRect(-30 * u, -17 * u, 60 * u, 34 * u);
      g.fillStyle = col; g.beginPath(); g.arc(-30 * u, 0, 7 * u, 0, Math.PI * 2); g.arc(30 * u, 0, 7 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c08a00'; g.font = `bold ${26 * u}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2×', 0, 2 * u);
      g.restore(); break;
    case 'balloon':
      g.beginPath(); g.ellipse(50 * u, 40 * u, 20 * u, 24 * u, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 4 * u; g.beginPath(); g.moveTo(50 * u, 64 * u); g.quadraticCurveTo(42 * u, 74 * u, 52 * u, 84 * u); g.stroke();
      g.fillStyle = col; g.beginPath(); g.ellipse(43 * u, 32 * u, 5 * u, 8 * u, -0.4, 0, Math.PI * 2); g.fill(); break;
  }
}

/**
 * Compiles every shader program the ride needs while the menu shows (the first Play frame then
 * compiles none): renders each kind of object once in a scratch scene.
 */
const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  const seen = new Set<string>();
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh;
      const skinned = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const kind = skinned ? 'skin' : (o as THREE.Sprite).isSprite ? 'sprite' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const a = mat as THREE.MeshLambertMaterial;
      const key = kind + ':' + mat.type + ':' + JSON.stringify([!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, !!a.emissive && a.emissive.getHex() > 0, m.receiveShadow, m.castShadow]);
      if (seen.has(key)) continue;
      seen.add(key);
      // the scratch scene holds its own copies of the materials: the world's own are freed with it,
      // and a program no material uses any more is freed too (and compiled again in Play)
      if (kind === 'sprite') { const c = o.clone() as THREE.Sprite; c.material = (o as THREE.Sprite).material.clone(); c.visible = true; c.position.set(0, -20, 0); s.add(c); continue; }
      if (kind === 'skin') {
        const src = modelOfCore(playerCharacter3d(), { shadows: true });
        setMaterial(src, mat.clone());
        src.position.set(0, -30, 0);
        s.add(src);
        continue;
      }
      const c = mat.clone();
      const k = kind === 'mesh' ? new THREE.Mesh(m.geometry, c) : (() => { const ki = new THREE.InstancedMesh(m.geometry, c, 1); if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3); return ki; })();
      k.castShadow = m.castShadow;
      k.receiveShadow = m.receiveShadow;
      s.add(k);
    }
  });
  keepers.push(s);
  s.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
  // compiled while the menu is being built (before it shows), then one draw with a shadow pass
  // (compile() leaves out the shadow maps' depth programs): the menu draws its world over it
  renderer.compile(s, camera);
  renderer.render(s, camera);
}

export type { Pickup };
