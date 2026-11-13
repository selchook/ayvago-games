// Snow Express: draws a board and its trains in 3D. The diorama (snowy plinth, frozen lake, the
// cabins in their cargo colours, trees, rocks, tunnels in the mountain) is merged per material; the
// track is the Train Kit piece bent along every segment; trains, switch blades, levers, glows and
// particles are instanced. The Play scene and the menu's autopilot both use it, so the menu also
// compiles every shader the first Play frame needs.
import Phaser from 'phaser';
import { World3D, THREE } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim, SimEvent, Train } from './sim';
import { Board, W, H, tileX, tileZ, DX, DZ, opposite, poseOn, inside, type Pose, type Seg } from './graph';
import type { LevelDef } from './levels';
import { Mats, Merger, partsOf, recolour, markSwatch, swapFor, bentTrack, mat4, TRAIN_S } from './kit';
import { Billboards, Particles, glowTex, puffTex, ringTex, flakeTex, arrowTex, sparkTex } from './fx3d';
import { HEX, SWATCH, CAR_GAP, clamp, lerp, smooth, Rng, type ColorId } from './defs';

export const FOV = 22;
/** Camera elevation (radians). */
const EL = 54 * Math.PI / 180;
/** Screen margins the board's content keeps (game px): sides, top (under the HUD's two rows), bottom (over the powers). */
export const FIT = { side: 16, top: 150, bottom: 1092 };
const CS = 0.66; // cabin module scale
const GREEN: [number, number] = SWATCH.green0;
const WHITE: [number, number] = SWATCH.white;
const BLUE: [number, number] = [64, 128];
const RIBBON: [number, number] = [192, 384];
const CAP = { loco: 14, bullet: 8, plow: 4, wagon: 36, present: 80 };

interface Look { sky: number; fog: number; hemiSky: number; hemiGround: number; hemi: number; sun: number; sunI: number }
const DAY: Look = { sky: 0xbfe0ff, fog: 0xcfe6ff, hemiSky: 0xe8f4ff, hemiGround: 0x8a96b8, hemi: 1.55, sun: 0xfff4e6, sunI: 2.0 };
const DUSK: Look = { sky: 0x1b2656, fog: 0x24306a, hemiSky: 0x6a86e0, hemiGround: 0x1c2444, hemi: 0.82, sun: 0xffa060, sunI: 0.62 };

/** Car visuals (per train id). */
interface TrainLook { roll: number; out: number; smokeT: number; shake: number }

interface Flyer { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; color: ColorId; spin: number; tx: number; tz: number }

export class View {
  readonly world: World3D;
  readonly mats = new Mats();
  readonly board: Board;
  private sc: THREE.Scene;
  private hemi!: THREE.HemisphereLight;
  // instanced trains
  private locos: THREE.InstancedMesh;
  private bullets: THREE.InstancedMesh;
  private plows: THREE.InstancedMesh;
  private wagons: THREE.InstancedMesh;
  private presents: THREE.InstancedMesh;
  private blades: THREE.InstancedMesh;
  private levers: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  // effects
  private glow: Billboards;
  private arrows: Billboards;
  private snow: Billboards;
  private rings: Billboards;
  private smoke: Particles;
  private sparks: Particles;
  private stars: Particles;
  private flakes: { x: number; y: number; z: number; s: number; v: number; ph: number }[] = [];
  private flyers: Flyer[] = [];
  private looks = new Map<number, TrainLook>();
  private drifts = new Map<number, THREE.Object3D>();
  /** Switch animation: the blade angle shown (0..1 between the two options). */
  private bladeK: number[];
  private shakeJ: number[];
  private signalK: number[];
  /** Cabin window light (0..1) per stop, and the flash after a delivery. */
  private lightK: number[];
  private flashK: number[];
  private closed: boolean[];
  private tunnelLamp: { color: number; t: number; until: number }[];
  private chimneys: { x: number; y: number; z: number; stop: number }[] = [];
  private windows: { x: number; y: number; z: number; stop: number }[] = [];
  private fairy: { x: number; y: number; z: number; c: number; ph: number; stop: number }[] = [];
  private lamps: { x: number; y: number; z: number; ph: number }[] = [];
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private camBase = new THREE.Vector3();
  private camLook = new THREE.Vector3(0, 0, 0.55);
  /** Camera distance, fitted to the board (fitCamera), and the screen rows its content spans. */
  camDist = 27.5;
  contentTop = 150;
  contentBottom = 1092;
  private shakeT = 0;
  private shakeAmp = 0;
  /** 0 = day, 1 = evening. */
  evening = 0;
  /** Menu backdrop: shifts the picture up by this share of its height. */
  menuShift = 0;
  /** The time scale the effects run at (slow motion). */
  slow = 1;
  /** Test hook: a fixed camera (close-ups). */
  debugCam: { pos: [number, number, number]; look: [number, number, number] } | null = null;
  /** Snow globe: the scene tints and the snow stops. */
  frozen = 0;

  constructor(phaser: Phaser.Scene, readonly def: LevelDef, o: { menu?: boolean; evening?: number } = {}) {
    this.board = new Board(def);
    this.evening = o.evening ?? (def.chapter === 2 ? 0.25 : 0);
    const world = new World3D(phaser, { fov: FOV, near: 1, far: 170, background: DAY.sky, fog: { color: DAY.fog, near: 30, far: 70 } });
    this.world = world;
    const sun = world.addLights({ sky: DAY.hemiSky, ground: DAY.hemiGround, ambient: DAY.hemi, sun: DAY.sun, intensity: DAY.sunI, dir: [-0.55, 1, 0.35], extent: 9 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far = 90;
    sun.position.multiplyScalar(1.4);
    world.scene.traverse((ob) => { if ((ob as THREE.HemisphereLight).isHemisphereLight) this.hemi = ob as THREE.HemisphereLight; });
    this.sc = world.scene;
    const b = this.board;
    this.bladeK = b.junctions.map(() => 0);
    this.shakeJ = b.junctions.map(() => 0);
    this.signalK = b.signals.map(() => 0);
    this.lightK = b.stops.map(() => 0.3);
    this.flashK = b.stops.map(() => 0);
    this.closed = b.stops.map(() => false);
    this.tunnelLamp = b.tunnels.map(() => ({ color: 0xffffff, t: 0, until: -1 }));

    this.buildGround();
    this.buildTrack();
    this.buildScenery();

    // instanced trains: locomotives, express, plows, flatbeds, present stacks
    this.locos = this.instanced('t:train-locomotive-a', CAP.loco, GREEN);
    this.bullets = this.instanced('t:train-electric-bullet-a', CAP.bullet, BLUE);
    this.plows = this.instanced('t:train-diesel-a', CAP.plow, [384, 256], this.plowBlade());
    this.wagons = this.instanced('t:train-carriage-flatbed', CAP.wagon, null);
    this.presents = this.presentStack();
    // switch blades, levers and signal heads
    const metal = this.flat(0xd8deea);
    this.blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.05, 0.56).translate(0, 0.075, 0.28), metal, Math.max(1, b.junctions.length * 2));
    this.levers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(0, 0.15, 0), this.flat(0xffffff), Math.max(1, b.junctions.length));
    this.levers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, b.junctions.length) * 3).fill(1), 3);
    this.heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.26, 0.1), this.flat(0x2a2d3a), Math.max(1, b.signals.length));
    for (const im of [this.blades, this.levers, this.heads]) { im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.sc.add(im); }

    // effects
    const glow = glowTex();
    this.glow = new Billboards(this.sc, glow, 260, { order: 14 });
    this.arrows = new Billboards(this.sc, arrowTex(), 24, { flat: true, order: 9 });
    this.rings = new Billboards(this.sc, ringTex(), 24, { flat: true, order: 10 });
    this.snow = new Billboards(this.sc, flakeTex(), 340, { additive: false, order: 16 });
    this.smoke = new Particles(this.sc, puffTex(), 420, { additive: false, order: 12 });
    this.sparks = new Particles(this.sc, glow, 380, { order: 15 });
    this.stars = new Particles(this.sc, sparkTex(), 160, { order: 15 });
    const r = new Rng(7);
    for (let i = 0; i < 300; i++) this.flakes.push({ x: r.range(-7, 7), y: r.range(0, 9), z: r.range(-9, 8), s: r.range(0.05, 0.12), v: r.range(0.35, 0.8), ph: r.range(0, 6.28) });
    this.applyLook();
    this.fitCamera();
    this.camera(0);
    void o.menu;
  }

  // ------------------------------------------------------------------ materials and helpers

  /** A flat-coloured Lambert material (no texture). */
  private flat(c: number): THREE.MeshLambertMaterial { return new THREE.MeshLambertMaterial({ color: c }); }

  /** An instanced copy of a model (optionally recoloured per instance, with extra geometry merged in). */
  private instanced(key: string, cap: number, body: [number, number] | null, extra?: THREE.BufferGeometry): THREE.InstancedMesh {
    const parts = partsOf(key);
    const geos = parts.map((p) => p.geo.clone());
    if (extra) geos.push(extra);
    for (const g of geos) {
      g.applyMatrix4(new THREE.Matrix4().makeScale(TRAIN_S, TRAIN_S, TRAIN_S));
      if (body) markSwatch(g, body); else g.setAttribute('recol', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    }
    const geo = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    geo.setAttribute('swap', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
    const im = new THREE.InstancedMesh(geo, this.mats.swapOf(parts[0].mat), cap);
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sc.add(im);
    return im;
  }

  /** The snowplow's blade: a wedge in front of the diesel (orange swatch, so it paints along). */
  private plowBlade(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const P = [
      [-0.75, 0.05, 1.25], [0.75, 0.05, 1.25], [0, 0.05, 1.85], [-0.75, 0.75, 1.25], [0.75, 0.75, 1.25], [0, 0.6, 1.95],
    ];
    const tri = [[0, 2, 5], [0, 5, 3], [2, 1, 4], [2, 4, 5], [3, 5, 4]];
    const pos: number[] = [], uv: number[] = [];
    for (const t of tri) for (const i of t) { pos.push(...P[i]); uv.push((448 + 16) / 512, (256 + 40) / 512); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  /** Three presents on a flatbed, their wrapping recoloured per instance (white ribbons). */
  private presentStack(): THREE.InstancedMesh {
    const geos: THREE.BufferGeometry[] = [];
    const place = (key: string, x: number, y: number, z: number, rot: number, s: number) => {
      for (const p of partsOf(key)) {
        const g = p.geo.clone();
        recolour(g, RIBBON, [0, 384]);
        g.applyMatrix4(mat4(x, y, z, rot, s));
        geos.push(g);
      }
    };
    const deck = 0.13;
    place('h:present-a-cube', 0, deck, -0.17, 0.3, 0.52);
    place('h:present-a-rectangle', 0.01, deck, 0.15, Math.PI / 2, 0.5);
    place('h:present-b-round', -0.02, deck + 0.29, -0.16, 0.8, 0.36);
    for (const g of geos) markSwatch(g, WHITE);
    const geo = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    geo.setAttribute('swap', new THREE.InstancedBufferAttribute(new Float32Array(CAP.present * 2), 2));
    const im = new THREE.InstancedMesh(geo, this.mats.swapOf(partsOf('h:present-a-cube')[0].mat), CAP.present);
    im.count = 0;
    im.castShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sc.add(im);
    return im;
  }

  // ------------------------------------------------------------------ building the board

  private deco(c: number, r: number): string { return this.def.deco?.[r]?.[c] ?? '.'; }

  private buildGround(): void {
    const b = this.board;
    // the board's top: one canvas, 64 px per tile: snow, the frozen lake, gravel under the track
    const T = 64;
    const top = this.mats.canvas('ground-' + this.def.id, (g) => {
      const r = new Rng(this.def.id * 13 + 1);
      g.fillStyle = '#eef4fb';
      g.fillRect(0, 0, W * T, H * T);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = r.chance(0.5) ? `rgba(160,184,220,${r.range(0.04, 0.12)})` : `rgba(255,255,255,${r.range(0.3, 0.7)})`;
        const s = r.range(2, 9);
        g.beginPath(); g.arc(r.range(0, W * T), r.range(0, H * T), s, 0, 6.29); g.fill();
      }
      for (let rr = 0; rr < H; rr++) for (let c = 0; c < W; c++) {
        const d = this.deco(c, rr);
        if (d === 'w') {
          const grd = g.createLinearGradient(c * T, rr * T, c * T + T, rr * T + T);
          grd.addColorStop(0, '#9fd2f2'); grd.addColorStop(1, '#7fb8e6');
          g.fillStyle = grd;
          g.fillRect(c * T - 1, rr * T - 1, T + 2, T + 2);
        } else if (d === 'm') {
          g.fillStyle = 'rgba(120,130,160,0.25)';
          g.fillRect(c * T, rr * T, T, T);
        }
      }
      // ice: shine and cracks over the lake
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
      for (let rr = 0; rr < H; rr++) for (let c = 0; c < W; c++) {
        if (this.deco(c, rr) !== 'w') continue;
        for (let k = 0; k < 2; k++) {
          const x = c * T + r.range(6, T - 6), y = rr * T + r.range(6, T - 6);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-18, 18), y + r.range(-18, 18)); g.lineTo(x + r.range(-24, 24), y + r.range(-24, 24)); g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(c * T + r.range(4, 30), rr * T + r.range(4, 50), r.range(10, 26), 3);
      }
      // gravel bed under every track segment on the ground
      for (const s of b.segs) {
        if (s.tile < 0 || s.raised || s.ay > 0 || s.by > 0) continue;
        if (this.deco(s.tile % W, Math.floor(s.tile / W)) === 'w') continue;
        g.strokeStyle = 'rgba(150,160,182,0.55)';
        g.lineWidth = T * 0.5;
        g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k <= 8; k++) {
          poseOn(s, true, (s.len * k) / 8, this.pose);
          const px = (this.pose.x + W / 2) * T, py = (this.pose.z + H / 2) * T;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
    }, W * T, H * T, false);
    const m = 0.35;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * m, H + 2 * m).rotateX(-Math.PI / 2), top);
    // the texture covers the 8 × 12 tiles; the margin repeats its edge
    const uv = plane.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, clamp((uv.getX(i) * (W + 2 * m) - m) / W, 0, 1), clamp((uv.getY(i) * (H + 2 * m) - m) / H, 0, 1));
    plane.receiveShadow = true;
    this.sc.add(plane);
    // the plinth's sides: frozen earth and a wooden rim
    const side = this.mats.canvas('plinth', (g, w, h) => {
      g.fillStyle = '#6b5a52'; g.fillRect(0, 0, w, h);
      const r = new Rng(3);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r.chance(0.5) ? '40,30,30' : '150,130,120'},${r.range(0.1, 0.3)})`; g.fillRect(r.range(0, w), r.range(0, h), r.range(2, 10), r.range(2, 6)); }
      g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, h * 0.18);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let x = 0; x < w; x += 12) g.fillRect(x, h * 0.18, 8, r.range(4, 14));
    });
    const box = new THREE.BoxGeometry(W + 2 * m, 1.2, H + 2 * m).translate(0, -0.6, 0);
    const sideUv = box.attributes.uv;
    for (let i = 0; i < sideUv.count; i++) sideUv.setXY(i, sideUv.getX(i) * 4, sideUv.getY(i));
    const plinth = new THREE.Mesh(box, side);
    plinth.position.y = -0.002;
    plinth.receiveShadow = true;
    this.sc.add(plinth);
    // the snowfield around the diorama, far below
    const field = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), this.mats.canvas('field', (g, w, h) => {
      g.fillStyle = '#dfe9f6'; g.fillRect(0, 0, w, h);
      const r = new Rng(9);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,170,210,${r.range(0.05, 0.15)})`; g.beginPath(); g.arc(r.range(0, w), r.range(0, h), r.range(3, 12), 0, 6.29); g.fill(); }
    }));
    const fuv = field.geometry.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 20, fuv.getY(i) * 20);
    field.position.y = -1.2;
    field.receiveShadow = true;
    this.sc.add(field);
  }

  /** A flat-coloured box drawn from a palette swatch of the holiday colormap (merges with the models). */
  private paletteBox(mg: Merger, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cell: [number, number], rotY = 0, cx = 0, cz = 0): void {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cell[0] + 8) / 512, (cell[1] + 20 + (uv.getY(i) > 0.5 ? 0 : 60)) / 512);
    g.applyMatrix4(mat4(cx, 0, cz, rotY));
    mg.push(partsOf('h:cabin-wall')[0].mat, g);
  }

  private buildTrack(): void {
    const b = this.board;
    const mg = new Merger();
    const trackMat = partsOf('t:track')[0].mat;
    const wood = this.mats.canvas('planks', (g, w, h) => {
      const r = new Rng(5);
      for (let i = 0; i < 8; i++) { g.fillStyle = ['#a8724c', '#9c6844', '#b07a52', '#93623f'][i % 4]; g.fillRect(0, i * h / 8, w, h / 8); g.fillStyle = 'rgba(60,30,15,0.4)'; g.fillRect(0, i * h / 8, w, 3); }
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${r.range(0.05, 0.2)})`; g.fillRect(r.range(0, w), r.range(0, h), r.range(4, 16), 2); }
    });
    const stone = this.mats.canvas('stone', (g, w, h) => {
      g.fillStyle = '#9aa3b8'; g.fillRect(0, 0, w, h);
      const r = new Rng(4);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = ['#a7afc3', '#8f98ad', '#b4bccd', '#99a1b6'][(x + y) % 4];
        g.fillRect(x * 64 + (y % 2) * 32 + 2, y * 32 + 2, 60, 28);
      }
      for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(0,0,0,${r.range(0.03, 0.1)})`; g.fillRect(r.range(0, w), r.range(0, h), 3, 3); }
      g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, 20);
    });
    const deck: THREE.BufferGeometry[] = [], piers: THREE.BufferGeometry[] = [];
    for (const s of b.segs) {
      if (s.tile < 0) continue;
      for (const g of bentTrack(s)) mg.push(trackMat, g);
      const c = s.tile % W, r = Math.floor(s.tile / W);
      const lake = this.deco(c, r) === 'w';
      const high = Math.max(s.ay, s.by) > 0.01;
      if (lake || high) {
        // a wooden deck under the sleepers, and piers down to the ground (or the ice)
        const n = s.kind === 'corner' ? 4 : 2;
        for (let k = 0; k < n; k++) {
          poseOn(s, true, (s.len * (k + 0.5)) / n, this.pose);
          const len = s.len / n + 0.04;
          const y = this.pose.y;
          deck.push(new THREE.BoxGeometry(0.78, 0.06, len).applyMatrix4(mat4(this.pose.x, y - 0.035, this.pose.z, this.pose.yaw)));
          if (y > 0.05 || lake) {
            for (const side of [-0.33, 0.33]) {
              const px = this.pose.x + Math.cos(this.pose.yaw) * side, pz = this.pose.z - Math.sin(this.pose.yaw) * side;
              const h = y + (lake ? 0.25 : 0);
              if (h > 0.08) piers.push(new THREE.BoxGeometry(0.1, h, 0.1).translate(px, y - 0.06 - h / 2 + 0.03, pz));
            }
          }
        }
      }
    }
    // leads: the last piece out of each tunnel, and into each cabin's doorway
    for (const tn of b.tunnels) {
      const s = b.segs[tn.lead];
      for (const g of bentTrack(s, s.len - 0.62, s.len)) mg.push(trackMat, g);
    }
    for (const st of b.stops) for (const g of bentTrack(b.segs[st.lead], 0, 0.42)) mg.push(trackMat, g);
    mg.build(this.mats, this.sc, { cast: false });
    if (deck.length) {
      const g = mergeGeometries(deck.map((d) => d.toNonIndexed()), false)!;
      const mesh = new THREE.Mesh(g, wood);
      mesh.castShadow = mesh.receiveShadow = true;
      this.sc.add(mesh);
    }
    if (piers.length) {
      const g = mergeGeometries(piers.map((d) => d.toNonIndexed()), false)!;
      const mesh = new THREE.Mesh(g, stone);
      mesh.castShadow = mesh.receiveShadow = true;
      this.sc.add(mesh);
    }
    deck.forEach((d) => d.dispose());
    piers.forEach((d) => d.dispose());
  }

  private buildScenery(): void {
    const b = this.board;
    const mg = new Merger();
    const r = new Rng(this.def.id * 31 + 5);
    const used = new Set<number>();
    // cabins
    for (const st of b.stops) {
      used.add(st.c + st.r * W);
      this.cabin(mg, st.id, tileX(st.c), tileZ(st.r), -DX[st.edge], -DZ[st.edge], st.color);
    }
    // tunnels: a stone portal in a snowy rock
    for (const tn of b.tunnels) {
      used.add(tn.c + tn.r * W);
      const into = tn.edge; // the track tile's edge facing the tunnel
      const fx = -DX[into], fz = -DZ[into]; // the portal faces the board
      const ex = tileX(tn.tc) + DX[into] * 0.5, ez = tileZ(tn.tr) + DZ[into] * 0.5;
      const yaw = Math.atan2(fx, fz);
      const px = ex - fx * 0.42, pz = ez - fz * 0.42;
      this.portal(mg, px, pz, yaw);
      mg.add('h:rocks-large', mat4(px - fx * 0.75 + fz * 0.5, -0.05, pz - fz * 0.75 + fx * 0.5, yaw + 0.4, 0.62, 0.75));
      mg.add('h:rocks-medium', mat4(px + fz * 0.72 - fx * 0.1, -0.02, pz - fx * 0.72 - fz * 0.1, yaw + 1.2, 0.52));
      mg.add('h:rocks-medium', mat4(px - fz * 0.72 - fx * 0.1, -0.02, pz + fx * 0.72 - fz * 0.1, yaw - 0.9, 0.5));
      this.lamps.push({ x: px, y: 0.95, z: pz, ph: tn.id });
    }
    // the mountain range behind the board
    for (let i = 0; i < 9; i++) {
      const x = -6 + i * 1.5 + r.range(-0.3, 0.3);
      mg.add('h:rocks-large', mat4(x, -1.2, -7.4 - r.range(0, 1.4), r.range(0, 6), r.range(1.3, 1.9), r.range(1.6, 2.6)));
    }
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      mg.add(r.chance(0.5) ? 'h:tree-snow-a' : 'h:tree-snow-b', mat4(side * r.range(4.6, 6.5), -1.2, r.range(-6, 6), r.range(0, 6), r.range(0.7, 1.1)));
    }
    // the ground of every free tile: trees, rocks, snowmen, presents …
    for (let rr = 0; rr < H; rr++) for (let c = 0; c < W; c++) {
      const t = c + rr * W;
      if (b.track[t] || used.has(t) || b.cabinAt[t] >= 0 || b.tunnelAt[t] >= 0) continue;
      const d = this.deco(c, rr);
      const x = tileX(c) + r.range(-0.18, 0.18), z = tileZ(rr) + r.range(-0.18, 0.18);
      if (d === 'w') {
        if (r.chance(0.15)) mg.add('h:snow-flat', mat4(x, 0, z, r.range(0, 6), 0.3));
        continue;
      }
      // tall things only where they cannot hide a track behind them (the camera looks north)
      const behind = rr > 0 && b.track[c + (rr - 1) * W];
      const nearCabin = [0, 1, 2, 3].some((e) => inside(c + DX[e], rr + DZ[e]) && b.cabinAt[c + DX[e] + (rr + DZ[e]) * W] >= 0);
      const roll = r.next();
      if (d === 'm' || rr === 0) {
        mg.add(roll < 0.5 ? 'h:rocks-medium' : 'h:rocks-large', mat4(x, -0.02, z - 0.15, r.range(0, 6), roll < 0.5 ? 0.45 : 0.32));
        if (!behind && r.chance(0.6)) mg.add('h:tree-snow-c', mat4(x + 0.2, 0, z + 0.2, r.range(0, 6), 0.32));
        continue;
      }
      if (behind) {
        if (roll < 0.3) mg.add('h:rocks-small', mat4(x, 0, z, r.range(0, 6), 0.32));
        else if (roll < 0.5) mg.add('h:snow-flat', mat4(x, 0, z, r.range(0, 6), 0.4));
        else if (roll < 0.62) mg.add('h:candy-cane-red', mat4(x, 0, z, r.range(0, 6), 0.8));
        else if (roll < 0.72) mg.add('h:present-a-cube', mat4(x, 0, z, r.range(0, 6), 0.4));
        continue;
      }
      if (nearCabin && roll < 0.35) {
        mg.add('h:lantern', mat4(x, 0, z, r.range(0, 6), 0.42));
        this.lamps.push({ x, y: 0.7, z, ph: r.range(0, 6) });
        continue;
      }
      if (roll < 0.36) {
        if (r.chance(0.3)) mg.add('h:snow-flat', mat4(x, 0, z, r.range(0, 6), 0.35));
      } else if (roll < 0.62) {
        mg.add(r.pick(['h:tree-snow-a', 'h:tree-snow-b', 'h:tree-snow-c'] as const), mat4(x, 0, z, r.range(0, 6), r.range(0.38, 0.5)));
        if (r.chance(0.4)) mg.add('h:tree-snow-c', mat4(x + 0.28, 0, z + 0.22, r.range(0, 6), 0.28));
      } else if (roll < 0.68) mg.add('h:tree-decorated-snow', mat4(x, 0, z, r.range(0, 6), 0.42));
      else if (roll < 0.72) mg.add('h:snowman-hat', mat4(x, 0, z, r.range(-0.6, 0.6), 0.42));
      else if (roll < 0.75) mg.add('h:reindeer', mat4(x, 0, z, r.range(0, 6), 0.45));
      else if (roll < 0.78) { mg.add('h:sled', mat4(x, 0, z, r.range(0, 6), 0.5)); mg.add('h:present-a-cube', mat4(x, 0.12, z, r.range(0, 6), 0.3)); }
      else if (roll < 0.82) mg.add('h:bench', mat4(x, 0, z, r.range(-0.4, 0.4), 0.45));
      else if (roll < 0.85) mg.add('h:gingerbread-man', mat4(x, 0, z, r.range(-0.6, 0.6), 0.6));
      else if (roll < 0.87) mg.add('h:nutcracker', mat4(x, 0, z, r.range(-0.4, 0.4), 0.42));
      else mg.add('h:rocks-small', mat4(x, 0, z, r.range(0, 6), 0.35));
    }
    // signals: a post beside the track
    for (const s of b.signals) {
      const p = this.signalPos(s.id);
      this.paletteBox(mg, -0.03, 0, -0.03, 0.03, 0.62, 0.03, [256, 384], 0, p.x, p.z);
    }
    // switch lever bases
    for (const j of b.junctions) {
      const p = this.leverPos(j.id);
      this.paletteBox(mg, p.x - 0.09, 0, p.z - 0.09, p.x + 0.09, 0.08, p.z + 0.09, [128, 256]);
    }
    // the drifts are their own meshes (a plow clears them)
    for (const t of b.drifts) {
      const g = new THREE.Group();
      const x = tileX(t % W), z = tileZ(Math.floor(t / W));
      const dm = new Merger();
      dm.add('h:snow-bunker', mat4(0, 0, 0, 0.3, 0.55, 0.9));
      dm.add('h:snow-pile', mat4(0.2, 0, 0.25, 1.2, 0.6, 1.2));
      dm.add('h:snow-pile', mat4(-0.25, 0, -0.2, 2.2, 0.55, 1.1));
      dm.build(this.mats, g);
      g.position.set(x, 0.02, z);
      this.sc.add(g);
      this.drifts.set(t, g);
    }
    mg.build(this.mats, this.sc);
    // signals posts were built at the origin: move them (they are few; rebuild per signal)
  }

  /** A cabin on a tile, its door facing (fx, fz), trims and wreath in the stop's colour. */
  private cabin(mg: Merger, stop: number, x: number, z: number, fx: number, fz: number, color: ColorId): void {
    const yaw = Math.atan2(fx, fz);
    const base = mat4(x, 0, z, yaw, CS);
    const tint = (g: THREE.BufferGeometry) => recolour(g, GREEN, SWATCH[color]);
    const put = (key: string, cx: number, cy: number, cz: number, rot: number, sz = 1) => {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, sz));
      mg.add(key, base.clone().multiply(local), tint);
    };
    const P = Math.PI / 2;
    // a one-room cabin: the door towards the track, windows on the sides and at the back
    put('h:cabin-doorway', 0, 0, 0, 0);
    put('h:cabin-window-a', 0, 0, 0, P);
    put('h:cabin-window-a', 0, 0, 0, -P);
    put('h:cabin-window-b', 0, 0, 0, Math.PI);
    put('h:cabin-corner-logs', 0, 0, 0, 0);
    put('h:cabin-corner-logs', 0, 0, 0, P);
    put('h:cabin-corner-logs', 0, 0, 0, Math.PI);
    put('h:cabin-corner-logs', 0, 0, 0, -P);
    put('h:cabin-wall-roof-center', 0, 1, 0, 0);
    put('h:cabin-wall-roof-center', 0, 1, 0, Math.PI);
    put('h:cabin-roof-snow-point', 0, 1, 0, 0);
    put('h:wreath-decorated', -0.1, 1.12, 0.56, 0);
    put('h:lights-colored', 0, 0.94, 0.62, 0);
    // a stone chimney on the back of the roof
    const w = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(base);
    const cpos = w(0.36, 1.62, -0.3);
    const cg = new THREE.BoxGeometry(0.16 / CS, 0.5 / CS, 0.16 / CS).toNonIndexed();
    const uv = cg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (320 + 8) / 512, (384 + 30 + uv.getY(i) * 40) / 512);
    cg.applyMatrix4(base.clone().multiply(new THREE.Matrix4().makeTranslation(0.36, 1.5, -0.3)));
    mg.push(partsOf('h:cabin-wall')[0].mat, cg);
    this.chimneys.push({ x: cpos.x, y: cpos.y + 0.1, z: cpos.z, stop });
    // window lights (outside the side windows and the back one) and fairy lights along the eave
    for (const [lx, lz] of [[0.62, 0], [-0.62, 0], [0, -0.62]]) {
      const p = w(lx, 0.55, lz);
      this.windows.push({ x: p.x, y: p.y, z: p.z, stop });
    }
    const cols = [0xff4d4d, 0x4dff7a, 0xffd23f, 0x4da6ff, 0xff7ae0];
    for (let i = 0; i < 6; i++) {
      const p = w(-0.42 + i * 0.17, 0.97 + Math.sin(i * 1.1) * 0.03, 0.66);
      this.fairy.push({ x: p.x, y: p.y, z: p.z, c: cols[(i + stop) % cols.length], ph: i * 1.7 + stop, stop });
    }
  }

  /** The tunnel portal: a stone arch with a dark mouth. */
  private portal(mg: Merger, x: number, z: number, yaw: number): void {
    const stone: [number, number] = [320, 384];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cell: [number, number]) => this.paletteBox(mg, x0, y0, z0, x1, y1, z1, cell, yaw, x, z);
    box(-0.55, 0, -0.5, -0.32, 0.88, 0.05, stone);
    box(0.32, 0, -0.5, 0.55, 0.88, 0.05, stone);
    box(-0.55, 0.62, -0.5, 0.55, 0.88, 0.05, stone);
    box(-0.32, 0, -0.5, 0.32, 0.62, -0.42, [256, 384]); // the dark mouth
    box(-0.6, 0.86, -0.55, 0.6, 0.96, 0.1, [0, 384]); // snow on top
  }

  /** Where a switch's lever stands (beside the facing edge, on the side the branch turns). */
  leverPos(j: number): { x: number; z: number } {
    const jn = this.board.junctions[j];
    const cx = tileX(jn.c), cz = tileZ(jn.r);
    const f = jn.facing;
    const ex = cx + DX[f] * 0.5, ez = cz + DZ[f] * 0.5;
    // the side: the branch that turns
    const other = jn.opts.map((s) => this.board.segs[s]).find((s) => s.kind === 'corner') ?? this.board.segs[jn.opts[1]];
    const far = other.a === f ? other.b : other.a;
    let sx = DX[far], sz = DZ[far];
    if (far === opposite(f)) { sx = DZ[f]; sz = -DX[f]; }
    return { x: ex - DX[f] * 0.12 + sx * 0.36, z: ez - DZ[f] * 0.12 + sz * 0.36 };
  }

  signalPos(s: number): { x: number; z: number } {
    const sg = this.board.signals[s];
    const segs = this.board.tileSegs[sg.tile];
    const seg = this.board.segs[segs[0]];
    // beside the track, on the camera side
    poseOn(seg, true, seg.len / 2, this.pose);
    const nx = Math.cos(this.pose.yaw), nz = -Math.sin(this.pose.yaw);
    const side = nz >= 0 ? 1 : -1;
    return { x: this.pose.x + nx * 0.36 * side, z: this.pose.z + nz * 0.36 * side };
  }

  /** World point of a control (for taps and badges). */
  controlPoint(ci: number): THREE.Vector3 {
    const c = this.board.controls[ci];
    if (c.kind === 'signal') { const p = this.signalPos(c.id); return new THREE.Vector3(p.x, 0.75, p.z); }
    return new THREE.Vector3(tileX(c.c), 0.05, tileZ(c.r));
  }

  // ------------------------------------------------------------------ frame

  private applyLook(): void {
    const k = this.evening;
    const L = (a: number, b2: number) => this.col.setHex(a).lerp(new THREE.Color(b2), k).getHex();
    (this.sc.background as THREE.Color).setHex(L(DAY.sky, DUSK.sky));
    (this.sc.fog as THREE.Fog).color.setHex(L(DAY.fog, DUSK.fog));
    if (this.hemi) {
      this.hemi.color.setHex(L(DAY.hemiSky, DUSK.hemiSky));
      this.hemi.groundColor.setHex(L(DAY.hemiGround, DUSK.hemiGround));
      this.hemi.intensity = lerp(DAY.hemi, DUSK.hemi, k);
    }
    const sun = this.world.sun!;
    sun.color.setHex(L(DAY.sun, DUSK.sun));
    sun.intensity = lerp(DAY.sunI, DUSK.sunI, k);
  }

  shake(amp: number, t: number): void { if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = t; } }

  private camera(dt: number): void {
    const cam = this.world.camera;
    this.camBase.set(0, Math.sin(EL) * this.camDist, this.camLook.z + Math.cos(EL) * this.camDist);
    cam.position.copy(this.camBase);
    // a slow, gentle sway (kept inside the fit's margin)
    cam.position.x += Math.sin(this.t * 0.23) * 0.08;
    cam.position.y += Math.sin(this.t * 0.31) * 0.06;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmp * clamp(this.shakeT * 4, 0, 1);
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    }
    cam.lookAt(this.camLook);
    if (this.debugCam) { cam.position.set(...this.debugCam.pos); cam.lookAt(...this.debugCam.look); }
    if (this.menuShift && !cam.view) cam.setViewOffset(1000 * cam.aspect, 1000, 0, 1000 * this.menuShift, 1000 * cam.aspect, 1000);
    cam.updateMatrixWorld();
  }

  /**
   * What must stay on screen: every cabin (walls, roof and the badge over it), every tunnel
   * portal, every track tile, switch lever and signal. Each item is a world point with a screen
   * radius (px) it needs around it.
   */
  fitPoints(): { x: number; y: number; z: number; r: number }[] {
    const b = this.board;
    const out: { x: number; y: number; z: number; r: number }[] = [];
    const box = (x: number, z: number, h: number, w: number, r = 0) => {
      for (const dx of [-w, w]) for (const dz of [-w, w]) for (const y of [0, h]) out.push({ x: x + dx, y, z: z + dz, r });
    };
    for (const st of b.stops) {
      box(tileX(st.c), tileZ(st.r), 1.45, 0.5);
      out.push({ x: tileX(st.c), y: 1.75, z: tileZ(st.r), r: 31 });
    }
    for (const tn of b.tunnels) box(tileX(tn.c), tileZ(tn.r) + 0.4, 1.0, 0.6);
    for (let t = 0; t < W * H; t++) if (b.track[t]) box(tileX(t % W), tileZ(Math.floor(t / W)), 0.1, 0.5);
    b.junctions.forEach((j) => { const p = this.leverPos(j.id); out.push({ x: p.x, y: 0.55, z: p.z, r: 26 }); });
    b.signals.forEach((s2) => { const p = this.signalPos(s2.id); out.push({ x: p.x, y: 0.75, z: p.z, r: 26 }); });
    return out;
  }

  /** Screen bounds of the fit points for a camera distance and look-at z (game px, radii included). */
  fitBounds(dist: number, lookZ: number): { x0: number; x1: number; y0: number; y1: number } {
    const cam = new THREE.PerspectiveCamera(FOV, this.world.camera.aspect, 1, 170);
    cam.position.set(0, Math.sin(EL) * dist, lookZ + Math.cos(EL) * dist);
    cam.lookAt(0, 0, lookZ);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const Wp = 720, Hp = Wp / this.world.camera.aspect;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of this.fitPoints()) {
      this.v.set(p.x, p.y, p.z).project(cam);
      const sx = (this.v.x + 1) / 2 * Wp, sy = (1 - this.v.y) / 2 * Hp;
      x0 = Math.min(x0, sx - p.r); x1 = Math.max(x1, sx + p.r);
      y0 = Math.min(y0, sy - p.r); y1 = Math.max(y1, sy + p.r);
    }
    return { x0, x1, y0, y1 };
  }

  /**
   * Fits the camera to this board: the nearest distance (and the look-at point that centres the
   * content between the HUD and the power buttons) at which everything above stays inside the
   * frame with the margins in FIT.
   */
  private fitCamera(): void {
    const Wp = 720;
    const midY = (FIT.top + FIT.bottom) / 2;
    let best = { d: 56, z: 0.55 };
    // never closer than 34: a small board still shows the village round it (and room for tips)
    for (let d = 34; d <= 56; d += 0.25) {
      // centre the content vertically (a few Newton steps on the look-at z)
      let z = 0.55;
      for (let i = 0; i < 4; i++) {
        const a = this.fitBounds(d, z), b2 = this.fitBounds(d, z + 0.1);
        const m = (a.y0 + a.y1) / 2, m2 = (b2.y0 + b2.y1) / 2;
        if (Math.abs(m2 - m) < 1e-6) break;
        z -= (m - midY) / ((m2 - m) / 0.1);
      }
      const f = this.fitBounds(d, z);
      if (f.x0 >= FIT.side + 6 && f.x1 <= Wp - FIT.side - 6 && f.y0 >= FIT.top && f.y1 <= FIT.bottom) { best = { d, z }; break; }
    }
    this.camDist = best.d;
    this.camLook.set(0, 0, best.z);
    const fb = this.fitBounds(best.d, best.z);
    this.contentTop = fb.y0;
    this.contentBottom = fb.y1;
    // the fog starts behind the board, whatever the distance
    const fog = this.sc.fog as THREE.Fog;
    fog.near = best.d + 6;
    fog.far = best.d + 48;
  }

  /** Game pixels of a world point. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(this.v.set(x, y, z));
    return { x: p.x, y: p.y };
  }

  reset(): void {
    this.looks.clear();
    this.flyers.length = 0;
    this.smoke.clear(); this.sparks.clear(); this.stars.clear();
  }

  sync(sim: Sim, dt: number): void {
    const edt = dt * this.slow;
    this.t += dt;
    this.applyLook();
    this.camera(dt);
    const camQ = this.world.camera.quaternion;
    this.drawTrains(sim, edt);
    this.drawSwitches(sim, dt);
    this.drawGlows(sim, dt);
    this.drawSnow(dt);
    this.drawFlyers(edt);
    this.drawRings(edt);
    this.smoke.update(edt, camQ, this.world.camera.position);
    this.sparks.update(edt, camQ, this.world.camera.position);
    this.stars.update(edt, camQ, this.world.camera.position);
  }

  private look(id: number): TrainLook {
    let l = this.looks.get(id);
    if (!l) { l = { roll: 0, out: 0, smokeT: 0, shake: 0 }; this.looks.set(id, l); }
    return l;
  }

  private setInst(im: THREE.InstancedMesh, i: number, p: Pose, roll: number, scale: number, swap: [number, number], lift = 0): void {
    this.e.set(-p.pitch * 0.9, p.yaw, roll);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(p.x, p.y + 0.02 + lift, p.z), this.q, this.s.set(scale, scale, scale));
    im.setMatrixAt(i, this.m);
    const a = im.geometry.attributes.swap as THREE.InstancedBufferAttribute;
    a.setXY(i, swap[0], swap[1]);
  }

  private drawTrains(sim: Sim, dt: number): void {
    let nl = 0, nb = 0, np = 0, nw = 0, ng = 0;
    const p = this.pose;
    const live = new Set<number>();
    for (const tr of sim.trains) {
      live.add(tr.id);
      const L = this.look(tr.id);
      if (tr.state === 'crashed') L.roll = Math.min(1, L.roll + dt * 4);
      if (tr.state === 'stuck') L.shake = Math.max(0, 0.6 - (tr.outT));
      const lastE = tr.path[tr.path.length - 1];
      const leadSeg = sim.board.segs[lastE.seg];
      const into = (tr.state === 'deliver' && leadSeg.kind === 'lead') ? lastE.start : Infinity;
      for (let i = 0; i < tr.cars; i++) {
        if (i < tr.gone) continue;
        const d = sim.carDist(tr, i);
        const q = tr.poses[i];
        // emerging from the tunnel: hidden until it is at the mouth
        const e = sim.entryAt(tr, d);
        const s = sim.board.segs[e.seg];
        if (s.kind === 'lead' && s.a === -1) {
          const u = d - e.start;
          if (e.fwd && u < s.len - 0.95) continue;
          if (!e.fwd && u > 0.9) continue;
        }
        let scale = TRAIN_S / TRAIN_S;
        let lift = 0;
        if (d > into) { const k = clamp((d - into) / 0.32, 0, 1); scale = 1 - 0.85 * smooth(k); lift = k * 0.05; }
        p.x = q.x; p.y = q.y; p.z = q.z; p.yaw = q.yaw; p.pitch = q.pitch;
        let roll = 0;
        if (L.roll > 0) {
          roll = (i % 2 ? -1 : 1) * smooth(L.roll) * 1.25;
          p.x += Math.cos(q.yaw) * roll * 0.12;
          p.z -= Math.sin(q.yaw) * roll * 0.12;
          p.yaw += (i % 2 ? 0.35 : -0.25) * smooth(L.roll);
        }
        if (L.shake > 0) p.yaw += Math.sin(this.t * 40) * 0.05 * L.shake;
        if (i === 0) {
          const swap = tr.kind === 'plow' ? swapFor([384, 256], 'orange') : swapFor(tr.kind === 'express' ? BLUE : GREEN, tr.color);
          const im = tr.kind === 'plow' ? this.plows : tr.kind === 'express' ? this.bullets : this.locos;
          const n = tr.kind === 'plow' ? nb + 0 : 0;
          void n;
          if (tr.kind === 'plow') { if (ng < CAP.plow) this.setInst(this.plows, ng++, p, roll, scale, swap, lift); }
          else if (tr.kind === 'express') { if (nb < CAP.bullet) this.setInst(this.bullets, nb++, p, roll, scale, swap, lift); }
          else if (nl < CAP.loco) this.setInst(this.locos, nl++, p, roll, scale, swap, lift);
          void im;
          // steam and the lantern
          const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
          if (tr.kind === 'normal' && scale > 0.6 && L.roll === 0) {
            L.smokeT -= dt * (0.6 + tr.speed * 2.2);
            if (L.smokeT <= 0) {
              L.smokeT = 0.35;
              this.smoke.emit(q.x + fx * 0.22, q.y + 0.6, q.z + fz * 0.22, (Math.random() - 0.5) * 0.15 - fx * tr.speed * 0.3, 0.55, (Math.random() - 0.5) * 0.15 - fz * tr.speed * 0.3, 1.4, 0.16, 0.5, this.evening > 0.5 ? 0xc8cce0 : 0xf4f6fb, 0.8, -0.05);
            }
          }
          if (tr.kind === 'plow' && tr.speed > 0.1 && Math.random() < dt * 14) {
            this.smoke.emit(q.x + fx * 0.6 + (Math.random() - 0.5) * 0.4, q.y + 0.1, q.z + fz * 0.6 + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2, 0.8, (Math.random() - 0.5) * 1.2, 0.6, 0.12, 0.28, 0xffffff, 1.5, 2);
          }
        } else if (nw < CAP.wagon) {
          this.setInst(this.wagons, nw++, p, roll, scale, [0, 0], lift);
          if (tr.color && np < CAP.present) this.setInst(this.presents, np++, p, roll, scale, swapFor(WHITE, tr.color), lift + 0.2 * scale * 0);
        }
      }
    }
    for (const id of [...this.looks.keys()]) if (!live.has(id)) this.looks.delete(id);
    // flying presents share the stack mesh
    for (const f of this.flyers) {
      if (np >= CAP.present) break;
      const k = clamp(f.t / f.life, 0, 1);
      const s = (1 - k * 0.75) * 0.5;
      this.e.set(f.spin * f.t, f.spin * f.t * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(f.x, f.y, f.z), this.q, this.s.set(s, s, s));
      this.presents.setMatrixAt(np, this.m);
      const sw = swapFor(WHITE, f.color);
      (this.presents.geometry.attributes.swap as THREE.InstancedBufferAttribute).setXY(np, sw[0], sw[1]);
      np++;
    }
    const fin = (im: THREE.InstancedMesh, n: number) => {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      (im.geometry.attributes.swap as THREE.InstancedBufferAttribute).needsUpdate = true;
    };
    fin(this.locos, nl); fin(this.bullets, nb); fin(this.plows, ng); fin(this.wagons, nw); fin(this.presents, np);
  }

  private drawSwitches(sim: Sim, dt: number): void {
    const b = this.board;
    this.arrows.begin(this.world.camera.quaternion);
    let nb = 0;
    b.junctions.forEach((j, i) => {
      const want = sim.state[i];
      this.bladeK[i] += clamp(want - this.bladeK[i], -dt * 6, dt * 6);
      const k = smooth(this.bladeK[i]);
      this.shakeJ[i] = Math.max(0, this.shakeJ[i] - dt);
      const jig = this.shakeJ[i] > 0 ? Math.sin(this.t * 60) * 0.06 * this.shakeJ[i] / 0.4 : 0;
      // blades: hinged at the facing edge, swinging between the two branches' headings
      const yaw = (s: Seg) => { poseOn(s, s.a === j.facing, 0.32, this.pose); return { yaw: this.pose.yaw, x: this.pose.x, z: this.pose.z }; };
      const a0 = yaw(b.segs[j.opts[0]]), a1 = yaw(b.segs[j.opts[1]]);
      let dy = a1.yaw - a0.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const y = a0.yaw + dy * k + jig;
      const ex = tileX(j.c) + DX[j.facing] * 0.5, ez = tileZ(j.r) + DZ[j.facing] * 0.5;
      const c = Math.cos(y), s = Math.sin(y);
      for (const side of [-0.19, 0.19]) {
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), y);
        this.m.compose(this.v.set(ex + c * side, 0, ez - s * side), this.q, this.s.set(1, 1, 1));
        this.blades.setMatrixAt(nb++, this.m);
      }
      // the lever leans to the side it is set to
      const lp = this.leverPos(i);
      this.e.set(0, Math.atan2(ex - lp.x, ez - lp.z), (k - 0.5) * 1.1 + jig * 4);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(lp.x, 0.07, lp.z), this.q, this.s.set(1, 1, 1));
      this.levers.setMatrixAt(i, this.m);
      this.levers.setColorAt(i, this.col.setHex(want ? 0xffc23a : 0xff5a4a));
      // a glowing arrow on the branch it is set to
      const seg = b.segs[j.opts[want]];
      poseOn(seg, seg.a === j.facing, seg.len * 0.62, this.pose);
      const busy = !sim.switchFree(i);
      const pulse = 0.75 + Math.sin(this.t * 5) * 0.25;
      this.arrows.add(this.pose.x, 0.13, this.pose.z, 0.46, 0.46, -this.pose.yaw + Math.PI, busy ? 0x8a97b8 : 0xffd23f, busy ? 0.5 : pulse);
    });
    this.blades.count = nb;
    this.blades.instanceMatrix.needsUpdate = true;
    this.levers.count = b.junctions.length;
    this.levers.instanceMatrix.needsUpdate = true;
    if (this.levers.instanceColor) this.levers.instanceColor.needsUpdate = true;
    this.arrows.end();
    // signal heads
    b.signals.forEach((sg, i) => {
      const p = this.signalPos(i);
      this.m.compose(this.v.set(p.x, 0.66, p.z), this.q.identity(), this.s.set(1, 1, 1));
      this.heads.setMatrixAt(i, this.m);
      this.signalK[i] += clamp((sim.red[i] ? 1 : 0) - this.signalK[i], -dt * 8, dt * 8);
      void sg;
    });
    this.heads.count = b.signals.length;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  private drawGlows(sim: Sim, dt: number): void {
    const g = this.glow;
    g.begin(this.world.camera.quaternion);
    const ev = this.evening;
    // cabin windows: warm, brighter at night and after a delivery
    for (const w of this.windows) {
      const k = Math.min(1.4, 0.25 + ev * 0.8 + this.flashK[w.stop] * 1.2 + this.lightK[w.stop] * 0.2);
      if (this.closed[w.stop]) continue;
      const ws = 0.42 + ev * 0.22;
      g.add(w.x, w.y, w.z, ws, ws, 0, 0xffc864, k * (0.85 + Math.sin(this.t * 7 + w.x * 3) * 0.08));
    }
    for (let i = 0; i < this.flashK.length; i++) this.flashK[i] = Math.max(0, this.flashK[i] - dt * 0.5);
    // fairy lights twinkle; bright in the evening
    for (const f of this.fairy) {
      if (this.closed[f.stop]) continue;
      const tw = 0.5 + 0.5 * Math.sin(this.t * 2.6 + f.ph);
      g.add(f.x, f.y, f.z, 0.13 + ev * 0.12, 0.13 + ev * 0.12, 0, f.c, (0.35 + ev * 1.1) * (0.4 + tw * 0.6));
    }
    // street lanterns
    for (const l of this.lamps) g.add(l.x, l.y, l.z, 0.35 + ev * 0.2, 0.35 + ev * 0.2, 0, 0xffd27a, 0.3 + ev * 0.7);
    // tunnel lamps blink in the colour of the train about to come out
    this.tunnelLamp.forEach((tl, i) => {
      const l = this.lamps[i];
      if (!l) return;
      const on = sim.clock < tl.until;
      if (on) g.add(l.x, l.y + 0.12, l.z + 0.1, 0.7, 0.7, 0, tl.color, Math.sin(this.t * 12) > 0 ? 1.4 : 0.35);
    });
    // signal lamps
    this.board.signals.forEach((_, i) => {
      const p = this.signalPos(i);
      const red = this.signalK[i];
      g.add(p.x, 0.74, p.z, 0.32, 0.32, 0, red > 0.5 ? 0xff3a2a : 0x3aff6a, 1.2);
    });
    // locomotive lanterns in the cargo colour
    for (const tr of sim.trains) {
      if (tr.gone > 0 || tr.state === 'crashed') continue;
      const q = tr.poses[0];
      if (!q || !sim.carVisible(tr, 0)) continue;
      const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
      const c = tr.color ? HEX[tr.color] : 0xffa040;
      g.add(q.x + fx * 0.42, q.y + 0.3, q.z + fz * 0.42, 0.36, 0.36, 0, c, 1 + Math.sin(this.t * 6 + tr.id) * 0.2);
    }
    g.end();
    // chimney smoke from every open cabin
    for (const ch of this.chimneys) {
      if (this.closed[ch.stop]) continue;
      if (Math.random() < dt * (1.2 + this.flashK[ch.stop] * 6)) {
        this.smoke.emit(ch.x, ch.y, ch.z, (Math.random() - 0.5) * 0.08 + 0.05, 0.35, (Math.random() - 0.5) * 0.08, 2.2, 0.1, 0.42, this.evening > 0.5 ? 0xb9bcd3 : 0xe8ecf6, 0.3, -0.02);
      }
    }
  }

  private drawSnow(dt: number): void {
    const sb = this.snow;
    sb.begin(this.world.camera.quaternion);
    const fall = 1 - this.frozen;
    for (const f of this.flakes) {
      f.y -= f.v * dt * fall;
      f.x += Math.sin(this.t * 0.8 + f.ph) * dt * 0.15 * fall;
      if (f.y < -0.2) { f.y = 9; }
      sb.add(f.x, f.y, f.z, f.s, f.s, 0, this.frozen > 0 ? 0xcfe8ff : 0xffffff, 0.9);
    }
    sb.end();
  }

  private drawFlyers(dt: number): void {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this.flyers.splice(i, 1);
        this.stars.burst(f.tx, 0.9, f.tz, 3, 1.2, [0xffffff, HEX[f.color]], 0.5, 0.18);
        continue;
      }
      // a hop from the wagon to the cabin roof
      f.x += f.vx * dt; f.z += f.vz * dt;
      f.vy -= 6 * dt;
      f.y += f.vy * dt;
    }
  }

  // ------------------------------------------------------------------ events

  /** The cabin a stop has (world point of its door, top of its roof). */
  stopPoint(stop: number, y = 0): THREE.Vector3 {
    const st = this.board.stops[stop];
    return new THREE.Vector3(tileX(st.c), y, tileZ(st.r));
  }

  setClosed(stop: number, closed: boolean): void { this.closed[stop] = closed; }

  handle(ev: SimEvent, sim: Sim): void {
    switch (ev.type) {
      case 'warn': {
        const tl = this.tunnelLamp[ev.tunnel];
        if (tl) { tl.color = ev.color ? HEX[ev.color] : 0xff9a30; tl.until = ev.at; }
        break;
      }
      case 'flip': this.ring(tileX(this.board.junctions[ev.junction].c), tileZ(this.board.junctions[ev.junction].r), 0xffd23f); break;
      case 'blocked': {
        const c = this.board.controls[ev.control];
        if (c.kind === 'switch') this.shakeJ[c.id] = 0.4;
        break;
      }
      case 'carIn': {
        const tr = ev.train;
        if (tr.state !== 'deliver') break;
        const st = this.board.stops[ev.stop];
        const x = tileX(st.c), z = tileZ(st.r);
        const door = this.doorPoint(ev.stop);
        if (ev.car > 0 && tr.color && ev.correct) {
          // the car's presents hop into the cabin
          for (let n = 0; n < 3; n++) {
            const life = 0.55 + n * 0.08;
            const vx = (x - door.x) / life + (Math.random() - 0.5) * 0.6, vz = (z - door.z) / life + (Math.random() - 0.5) * 0.6;
            this.flyers.push({ x: door.x, y: 0.35, z: door.z, vx, vy: 3.6 + n * 0.3, vz, t: 0, life, color: tr.color, spin: 5 + n * 2, tx: x, tz: z });
          }
        }
        this.stars.burst(door.x, 0.35, door.z, 5, 1.4, [0xffffff, tr.color ? HEX[tr.color] : 0xffd23f], 0.45, 0.2, { up: 0.6 });
        break;
      }
      case 'deliver': {
        const st = this.board.stops[ev.stop];
        const x = tileX(st.c), z = tileZ(st.r);
        if (ev.correct) {
          this.flashK[ev.stop] = 1;
          this.lightK[ev.stop] = Math.min(1, this.lightK[ev.stop] + 0.25);
          const c = HEX[st.color];
          this.sparks.burst(x, 1.2, z, 34, 3, [c, 0xffffff, 0xffd23f], 0.9, 0.26, { up: 1.2, grav: 2.2 });
          this.stars.burst(x, 1.4, z, 14, 2.2, [0xffffff, 0xffe9a0], 1, 0.3, { up: 1.4, grav: 1.6 });
          this.ring(x, z, c);
        } else {
          // frost: a cold blue burst and an icy ring
          this.sparks.burst(x, 0.6, z, 28, 2.2, [0x9fd8ff, 0xffffff, 0x5aa0ff], 0.8, 0.24, { up: 0.5 });
          this.ring(x, z, 0x7fc8ff);
        }
        break;
      }
      case 'clear': {
        const g = this.drifts.get(ev.tile);
        if (g) g.visible = false;
        const x = tileX(ev.tile % W), z = tileZ(Math.floor(ev.tile / W));
        this.smoke.burst(x, 0.3, z, 30, 2.6, [0xffffff, 0xeaf4ff], 1.1, 0.4, { up: 1.6, grav: 1.5 });
        this.stars.burst(x, 0.5, z, 10, 2, [0xffffff, 0xbfe6ff], 0.8, 0.25, { up: 1 });
        break;
      }
      case 'stuck': {
        const x = tileX(ev.tile % W), z = tileZ(Math.floor(ev.tile / W));
        this.smoke.burst(x, 0.3, z, 22, 1.6, [0xffffff], 1, 0.35, { up: 1, grav: 1.2 });
        break;
      }
      case 'crash': {
        this.smoke.burst(ev.x, ev.y + 0.3, ev.z, 46, 3.2, [0xffffff, 0xeaf2ff, 0xd8e4f4], 1.4, 0.5, { up: 1.8, grav: 1.6 });
        this.sparks.burst(ev.x, ev.y + 0.3, ev.z, 26, 4, [0xffd23f, 0xff8a3a, 0xffffff], 0.6, 0.22, { up: 1 });
        this.ring(ev.x, ev.z, 0xffffff);
        this.shake(0.5, 0.6);
        break;
      }
      case 'remove': {
        const tr = ev.train;
        if (tr.state === 'crashed' || tr.state === 'stuck') {
          for (let i = tr.gone; i < tr.cars; i++) {
            const q = tr.poses[i];
            if (q) this.smoke.burst(q.x, q.y + 0.2, q.z, 8, 1.4, [0xffffff], 0.8, 0.3, { up: 0.8 });
          }
        }
        this.looks.delete(tr.id);
        break;
      }
      case 'open': this.closed[ev.stop] = false; break;
      default: break;
    }
    void sim;
  }

  private doorPoint(stop: number): { x: number; z: number } {
    const st = this.board.stops[stop];
    return { x: tileX(st.tc) + DX[st.edge] * 0.5, z: tileZ(st.tr) + DZ[st.edge] * 0.5 };
  }

  private rings3: { x: number; z: number; c: number; t: number }[] = [];
  private ring(x: number, z: number, c: number): void {
    if (this.rings3.length > 12) this.rings3.shift();
    this.rings3.push({ x, z, c, t: 0 });
  }

  /** Draws the expanding rings (called from sync through drawSnow's frame). */
  drawRings(dt: number): void {
    this.rings.begin(this.world.camera.quaternion);
    for (let i = this.rings3.length - 1; i >= 0; i--) {
      const r = this.rings3[i];
      r.t += dt;
      if (r.t > 0.6) { this.rings3.splice(i, 1); continue; }
      const k = r.t / 0.6;
      this.rings.add(r.x, 0.08, r.z, 0.4 + k * 1.6, 0.4 + k * 1.6, 0, r.c, 1 - k);
    }
    this.rings.end();
  }

  /** Every train's first visible car on screen (for the icons over the wagons). */
  carScreen(sim: Sim, tr: Train, i: number): { x: number; y: number } | null {
    if (i < tr.gone || !tr.poses[i] || !sim.carVisible(tr, i)) return null;
    const q = tr.poses[i];
    return this.toScreen(q.x, q.y + 0.75, q.z);
  }
}

/**
 * Compiles every program the scene uses now and keeps them: a copy of each kind of material (and
 * of instancing) is rendered once in a hidden scene and never freed, so the programs outlive the
 * menu's world and the first Play frame compiles nothing (see Kickflip Park's keepPrograms).
 */
const warmed = new WeakSet<THREE.WebGLRenderer>();
const kept: THREE.Material[] = [];
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  s.background = world.background;
  const seen = new Set<string>();
  const temp: THREE.Object3D[] = [];
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh;
      const kind = inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const a = mat as THREE.MeshLambertMaterial & THREE.MeshBasicMaterial;
      const key = kind + ':' + mat.type + ':' + mat.customProgramCacheKey() + ':' + JSON.stringify([!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, m.receiveShadow, m.castShadow]);
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      kept.push(c);
      let k: THREE.Object3D;
      if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        ki.setMatrixAt(0, new THREE.Matrix4());
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
        temp.push(ki);
      }
      k.castShadow = m.castShadow;
      k.receiveShadow = m.receiveShadow;
      k.frustumCulled = false;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  renderer.render(s, camera);
  // the copies' materials stay (their programs with them); only the instance buffers are freed
  for (const k of temp) (k as THREE.InstancedMesh).dispose();
  s.clear();
}
