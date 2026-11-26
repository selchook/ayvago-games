// Moon Rover: the 3D view. It reads the sim and draws:
//   - the moon: the level's tiles from the kit (flat regolith, the tire-track road pieces shaped by
//     their neighbours, slope tiles for ramps), recoloured per region, with rock faces down every
//     step and chasm, a ring of higher ground round the map so the horizon is never empty, the
//     kit's craters (pits with a dark hole), boulders, crystal rocks, towers, dishes, hangars, domes,
//     pads, checkpoint rings, force-field gates, turrets, monorail track, lamps, generators and the
//     launch tower with its rocket; all static pieces merged into a few chunks;
//   - the sky: stars, the Earth (not on the Dark Side), a sun glare; a solar storm reddens it;
//   - the rover: the kit's rover with its six wheels turning and bouncing on their own, the paint
//     skin, supply crates and the rescued crew riding on its deck, a shield bubble, the boost's
//     flame, hover jets, the magnet's ring, headlights in the dark, a soft shadow that shrinks as it
//     flies, dust plumes and tire tracks;
//   - what moves: crystal samples, astronauts (the kit's own limbs: they wave, run over, hop on),
//     the hidden alien, power pick-ups, light beacons over every goal, meteors with red warning
//     rings, turret heads and bolts, trains, the rogue miner, the tow craft;
//   - a chase camera behind the rover that eases round with it and never loses it (it rises over
//     cliffs), with shake; a slow orbit for the map, a swoop for the intro, a turntable for the hangar.
// The game is adaptive: landscape sees much wider, so the camera sits a little closer there.
import { THREE, World3D } from '@core/three';
import { TILE, STEP, REGIONS, SKINS, POWER_COLOR, type RegionLook, type SkinId } from './defs';
import { geo, partRest, Merger, place, isKitGeo, type Recolor, type ModelName } from './kit';
import { Fx } from './fx3d';
import { Sim, TRAIN } from './sim';
import { ABYSS, DIRS, PIT_IN } from './terrain';
import type { Level, Tile } from './levels';
import { powerTexture } from './art';

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler(), tc = new THREE.Color();
const tm2 = new THREE.Matrix4();

/** Kit units to metres for each figure. */
export const ROVER_S = 6;
const ASTRO_S = 2.3;
const RIDER_S = 1.45;
/** How many tiles of higher ground ring the map. */
const BORDER = 7;
const CHUNK = 8;

/** The chase camera: distance behind, height, look-ahead; landscape comes closer. */
export const CAM = { dist: 10.5, height: 4.6, ahead: 5, fov: 58 };
const CAM_LAND = { k: 0.86 };

const PARTS = ['body', 'head', 'armLeft', 'armRight', 'legLeft', 'legRight'] as const;
type Part = typeof PARTS[number];

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
  put(x: number, y: number, z: number, rx: number, ry: number, rz: number, s: number | THREE.Vector3, order: THREE.EulerOrder = 'YXZ'): number {
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

/** A figure built from a kit model's six limb nodes, drawn instanced (one set per model). */
class Figures {
  private parts: Inst[];
  private rest: THREE.Matrix4[];
  constructor(parent: THREE.Object3D, readonly name: ModelName, mat: THREE.Material, cap: number) {
    this.parts = PARTS.map((p) => new Inst(parent, geo(name, { part: p }), mat, cap));
    this.rest = PARTS.map((p) => partRest(name, p));
  }
  begin(): void { for (const p of this.parts) p.begin(); }
  end(): void { for (const p of this.parts) p.end(); }
  /** One figure at `base` with each limb turned (x swing, z raise). */
  put(base: THREE.Matrix4, pose: Partial<Record<Part, [number, number]>>): void {
    PARTS.forEach((p, i) => {
      const r = pose[p];
      tm2.copy(base).multiply(this.rest[i]);
      if (r) tm2.multiply(tm.makeRotationFromEuler(te.set(r[0], 0, r[1], 'ZXY')));
      this.parts[i].putM(tm2);
    });
  }
}

export type CamMode = 'follow' | 'preview' | 'intro' | 'hangar';

export class View {
  readonly world: World3D;
  readonly fx: Fx;
  private mat: THREE.MeshLambertMaterial;
  private matGlow: THREE.MeshBasicMaterial;
  private matBeam: THREE.MeshBasicMaterial;
  private matBright: THREE.MeshBasicMaterial;
  private matMark: THREE.MeshBasicMaterial;
  private matRing: THREE.MeshBasicMaterial;
  private matField: THREE.MeshBasicMaterial;
  private look: RegionLook = REGIONS.plains;
  private level: Level | null = null;
  private stage: THREE.Group | null = null;
  private inst = new Map<string, Inst>();
  private owned = new Set<THREE.BufferGeometry>();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private head: THREE.SpotLight;
  private sky: THREE.Group;
  private stars: THREE.Points;
  private earth: THREE.Mesh;
  private glare: THREE.Sprite;
  // the rover
  readonly rover = new THREE.Group();
  private body: THREE.Mesh;
  private chassis = new THREE.Group();
  private wheels: Inst;
  private wheelAt: { x: number; y: number; z: number; s: number; side: number }[] = [];
  private wheelSpin = 0;
  private bounce = 0;
  private bounceV = 0;
  private skin: SkinId = 'orange';
  private shield: THREE.Mesh;
  private magnet: THREE.Mesh;
  private blob: THREE.Mesh;
  private cargo: Inst | null = null;
  private crew: Figures[] = [];
  private alien: Figures | null = null;
  private trains: THREE.Mesh[] = [];
  private miner: THREE.Group | null = null;
  private minerGlow: THREE.Mesh | null = null;
  private tow: THREE.Mesh;
  private rocket: THREE.Group | null = null;
  private fields: THREE.Mesh[] = [];
  private powerSprites: THREE.Sprite[] = [];
  private markI = 0;
  private markD = 0;
  private lastX = 0;
  private lastZ = 0;
  private dustT = 0;
  private flipA = 0;
  private towT = -1;
  private dropT = -1;
  private towFrom = new THREE.Vector3();
  private launchT = -1;
  private airPrev = false;
  // the camera
  readonly cam = { x: 0, y: 0, z: 0, yaw: 0, shake: 0, kick: 0, look: new THREE.Vector3() };
  /** Store art and tests: a fixed camera [position, look]. */
  shotCam: [number[], number[]] | null = null;
  private time = 0;
  private preT = 0;
  private land: boolean;

  constructor(host: Phaser.Scene, o: { quality?: number } = {}) {
    this.land = host.scale.width > host.scale.height;
    this.world = new World3D(host, { fov: CAM.fov, background: 0x05070e, fog: { color: 0x05070e, near: 70, far: 150 }, shadows: false, quality: o.quality ?? 0.9, far: 900 });
    const w = this.world;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matBright = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.matBeam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.matMark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    this.matRing = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.matField = new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.hemi = new THREE.HemisphereLight(0xb8c4e0, 0x3a3a44, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff6e8, 2.2);
    this.sun.position.set(-30, 50, 20);
    w.scene.add(this.hemi, this.sun, this.sun.target);
    this.head = new THREE.SpotLight(0xe8f0ff, 0, 34, 0.55, 0.5, 1.2);
    w.scene.add(this.head, this.head.target);
    // the sky: stars, the Earth, the sun's glare (they follow the camera)
    this.sky = new THREE.Group();
    const sp: number[] = [], sc: number[] = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1400; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * 0.95 + 0.02;
      sp.push(Math.cos(a) * r * 500, y * 500 - 40, Math.sin(a) * r * 500);
      const b = 0.45 + rnd() * 0.55, warm = rnd();
      sc.push(b * (warm > 0.8 ? 1 : 0.85), b * 0.9, b * (warm < 0.3 ? 1 : 0.88));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 18), new THREE.MeshBasicMaterial({ map: earthTexture(), fog: false }));
    this.earth.position.set(150, 150, -380);
    this.earth.rotation.set(0.3, 0.6, 0.2);
    this.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff2d8, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glare.scale.set(90, 90, 1);
    this.glare.position.set(-260, 300, 180);
    this.sky.add(this.stars, this.earth, this.glare);
    this.sky.renderOrder = -10;
    w.scene.add(this.sky);
    this.fx = new Fx(w.scene);
    // the rover: the kit's body, its six wheels apart
    this.body = new THREE.Mesh(roverBody('orange'), this.mat);
    this.chassis.add(this.body);
    this.rover.add(this.chassis);
    const wg = roverWheel();
    this.wheels = new Inst(w.scene, wg.geo, this.mat, 6);
    this.wheelAt = wg.at;
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(2.5, 24, 14), new THREE.MeshBasicMaterial({ color: 0x4ab8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shield.position.y = 1.1;
    this.rover.add(this.shield);
    this.magnet = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: POWER_COLOR.magnet, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    w.scene.add(this.magnet);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.6 }));
    this.blob.renderOrder = 2;
    w.scene.add(this.blob);
    w.scene.add(this.rover);
    this.tow = new THREE.Mesh(geo('craft_cargoa'), this.mat);
    this.tow.scale.setScalar(3);
    this.tow.visible = false;
    w.scene.add(this.tow);
  }

  /** The rover's paint. */
  setSkin(id: SkinId): void {
    if (id === this.skin) return;
    this.skin = id;
    this.body.geometry = roverBody(id);
  }

  // ---------------------------------------------------------------- building a level

  build(sim: Sim): void {
    this.clear();
    const L = sim.c;
    this.level = L;
    this.look = REGIONS[L.region];
    const lk = this.look;
    const w = this.world;
    w.scene.background = new THREE.Color(lk.sky);
    const fog = w.scene.fog as THREE.Fog;
    fog.color.setHex(lk.sky);
    this.hemi.color.setHex(lk.hemi[0]); this.hemi.groundColor.setHex(lk.hemi[1]); this.hemi.intensity = lk.hemi[2];
    this.sun.color.setHex(lk.sun[0]); this.sun.intensity = lk.sun[1];
    this.earth.visible = lk.earth > 0;
    this.earth.scale.setScalar(Math.max(0.01, lk.earth));
    (this.stars.material as THREE.PointsMaterial).size = 1.6 + lk.stars * 0.6;
    this.glare.visible = L.region !== 'dark';
    const stage = new THREE.Group();
    this.stage = stage;
    w.scene.add(stage);
    const terrainRe: Recolor = { rock: lk.rock, rockDark: lk.rockDark, rockTrack: lk.road, crystal: lk.crystal };
    // ---- the merged chunks: terrain, faces, props
    const chunks = new Map<string, Merger>();
    const chunk = (x: number, z: number): Merger => {
      const k = Math.floor(x / (TILE * CHUNK)) + ',' + Math.floor(z / (TILE * CHUNK));
      let m = chunks.get(k);
      if (!m) { m = new Merger(); chunks.set(k, m); }
      return m;
    };
    const cols = L.cols, rows = L.rows;
    // the ring of higher ground round the map
    const ringH = (c: number, r: number): number => {
      const ec = Math.max(0, Math.min(cols - 1, c)), er = Math.max(0, Math.min(rows - 1, r));
      const edge = L.tiles[er * cols + ec];
      const out = Math.max(Math.abs(c - ec), Math.abs(r - er));
      const base = edge.k === 'chasm' ? 2 : edge.L;
      return base + Math.min(3, Math.floor(out / 2 + hash(c, r) * 1.6));
    };
    const tileAt = (c: number, r: number): Tile | { k: 'ring'; L: number } | null => {
      if (c >= 0 && r >= 0 && c < cols && r < rows) return L.tiles[r * cols + c];
      if (c < -BORDER || r < -BORDER || c >= cols + BORDER || r >= rows + BORDER) return null;
      return { k: 'ring', L: ringH(c, r) };
    };
    /** A tile's surface height at one of its corners (dx, dz each 0 or 1). */
    const cornerH = (c: number, r: number, dx: number, dz: number): number => {
      const t = tileAt(c, r);
      if (!t) return -999;
      if (t.k === 'chasm') return -14;
      if (t.k !== 'ramp') return t.L * STEP;
      const u = t.dir === 0 ? 1 - dz : t.dir === 1 ? dx : t.dir === 2 ? dz : 1 - dx;
      return (t.L + u) * STEP;
    };
    const roadish = (c: number, r: number) => { const t = tileAt(c, r); return !!t && t.k !== 'ring' && '_^v<>BEUGMt'.includes((t as Tile).ch); };
    for (let r = -BORDER; r < rows + BORDER; r++) for (let c = -BORDER; c < cols + BORDER; c++) {
      const t = tileAt(c, r)!;
      const x0 = c * TILE, z0 = r * TILE, xc = x0 + TILE / 2, zc = z0 + TILE / 2;
      const m = chunk(xc, zc);
      const jit = 0.93 + hash(c * 3, r * 5) * 0.07;
      const tint = mulc(0xffffff, jit);
      if (t.k === 'chasm') {
        // the dark bottom far below
        m.quad([x0, -14, z0 + TILE], [x0 + TILE, -14, z0 + TILE], [x0 + TILE, -14, z0], [x0, -14, z0], mulc(lk.rockDark, 0.25));
      } else if (t.k === 'ramp') {
        const rot = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][t.dir];
        m.add(geo('terrain_side', { recolor: { rock: lk.road } }), place(xc, t.L * STEP + STEP, zc, rot, TILE), tint);
      } else {
        const y = t.L * STEP;
        const tt = t as Tile;
        let piece: ModelName = 'terrain', rot = 0;
        let re: Recolor = terrainRe;
        if (t.k === 'ring') re = { rock: mulc(lk.rock, 0.92) };
        else if (tt.ch === '_') {
          const mask = [roadish(c, r - 1), roadish(c + 1, r), roadish(c, r + 1), roadish(c - 1, r)];
          [piece, rot] = roadPiece(mask);
        } else if (tt.surf === 'ice') re = { rock: lk.ice };
        else if (tt.surf === 'dust') re = { rock: lk.dust };
        else if (tt.surf === 'field') re = { rock: mulc(lk.rock, 0.9) };
        m.add(geo(piece, { recolor: re, tag: piece === 'terrain' ? '' : 'road', centre: true }), place(xc, y, zc, rot, TILE), tint);
      }
      // faces down to every lower neighbour (and the kicker's drop)
      const top = (dx: number, dz: number) => cornerH(c, r, dx, dz);
      for (let d = 0; d < 4; d++) {
        const [dxn, dzn] = DIRS[d];
        const nc = c + dxn, nr = r + dzn;
        if (!tileAt(nc, nr)) continue;
        // the edge's two corners (seen from outside, counter-clockwise)
        const ends: [number, number][] = d === 0 ? [[1, 0], [0, 0]] : d === 1 ? [[1, 1], [1, 0]] : d === 2 ? [[0, 1], [1, 1]] : [[0, 0], [0, 1]];
        const opp = (e: [number, number]): [number, number] => d === 0 ? [e[0], 1] : d === 1 ? [0, e[1]] : d === 2 ? [e[0], 0] : [1, e[1]];
        const a = ends[0], b = ends[1];
        const ta = top(a[0], a[1]), tb = top(b[0], b[1]);
        const ba = cornerH(nc, nr, ...opp(a)), bb = cornerH(nc, nr, ...opp(b));
        if (ta <= ba + 0.01 && tb <= bb + 0.01) continue;
        const ax = x0 + a[0] * TILE, az = z0 + a[1] * TILE, bx = x0 + b[0] * TILE, bz = z0 + b[1] * TILE;
        const lo = Math.min(ba, bb, ta, tb);
        const shade = d === 0 || d === 3 ? 0.82 : 1;
        const col = mulc(lk.rockDark, shade * (0.92 + hash(c * 7 + d, r * 11) * 0.12));
        // upper band a touch lighter (strata)
        const mid = lo + (Math.min(ta, tb) - lo) * 0.62;
        if (Math.min(ta, tb) - lo > 1.2) {
          m.quad([ax, lo, az], [bx, lo, bz], [bx, mid, bz], [ax, mid, az], col);
          m.quad([ax, mid, az], [bx, mid, bz], [bx, tb, bz], [ax, ta, az], mulc(col, 1.12));
        } else m.quad([ax, lo, az], [bx, lo, bz], [bx, tb, bz], [ax, ta, az], col);
      }
      // the ring gets a few rocks
      if (t.k === 'ring' && hash(c * 13, r * 17) < 0.16) {
        const kinds: ModelName[] = ['rock_largea', 'rock_largeb', 'rock', 'rocks_smalla'];
        const k = kinds[Math.floor(hash(c, r * 3) * kinds.length)];
        m.add(geo(k, { recolor: terrainRe }), place(xc + (hash(c, r) - 0.5) * 1.5, t.L * STEP, zc + (hash(r, c) - 0.5) * 1.5, hash(c * 5, r) * 6.28, 3 + hash(r * 2, c) * 3), tint);
      }
    }
    // ---- craters
    for (const cr of L.craters) {
      const t = sim.ter.tileAt(cr.x, cr.z);
      const y = t ? sim.ter.base(t, cr.x, cr.z, Math.floor(cr.x / TILE), Math.floor(cr.z / TILE)) : 0;
      this.addCrater(chunk(cr.x, cr.z), cr, y, terrainRe);
    }
    // ---- places and obstacles
    const P = (name: ModelName, x: number, y: number, z: number, rot: number, s: number | [number, number, number], re?: Recolor, tint?: number, o: { part?: string; skipParts?: string[]; only?: string[]; skip?: string[] } = {}) =>
      chunk(x, z).add(geo(name, { recolor: re, tag: re ? 'T' + L.region : '', ...o }), place(x, y, z, rot, s), tint);
    // the base pad and its hangar
    const B = L.base;
    P('platform_large', B.x, B.y, B.z, 0, [TILE, 1.6, TILE]);
    for (const o of L.obstacles) {
      const y = o.y;
      switch (o.kind) {
        case 'hangar': {
          const big = Math.max(o.w ?? 2, o.d ?? 2) >= 3;
          P(big ? 'hangar_largea' : 'hangar_smalla', o.x, y, o.z, o.rot, TILE);
          break;
        }
        case 'dome': P('hangar_roundglass', o.x, y, o.z, o.rot, ((o.w ?? 2) * TILE) / 3.4); break;
        case 'boulder': P(hash(o.seed, 1) < 0.5 ? 'rock_largea' : 'rock_largeb', o.x, y, o.z, o.rot + hash(o.seed, 2), 4.4, terrainRe); break;
        case 'crystalRock': P(hash(o.seed, 1) < 0.5 ? 'rock_crystalslargea' : 'rock_crystalslargeb', o.x, y, o.z, o.rot, 4.4, terrainRe); break;
        case 'tower': P('supports_high', o.x, y, o.z, o.rot, [4.2, 4.6, 4.2]); P('satellitedish', o.x, y + 4.6, o.z, o.rot, 3.2); break;
        case 'dish': P('satellitedish_large', o.x, y, o.z, o.rot, 4); break;
        case 'fuel': P('barrels', o.x, y, o.z, o.rot, 5.2); break;
        case 'antenna': P('machine_wireless', o.x, y, o.z, o.rot, 4); break;
        case 'lamp': P('pipe_supporthigh', o.x, y, o.z, 0, [2.2, 5, 2.2]); break;
        case 'turret': break;
        case 'generator': P('machine_generatorlarge', o.x, y, o.z, o.rot, 3); break;
        case 'rocket': break;
      }
    }
    for (const d of L.decor) if (d.kind === 'rocks') P(hash(d.seed, 3) < 0.5 ? 'rocks_smalla' : 'rocks_smallb', d.x, d.y, d.z, hash(d.seed, 4) * 6.28, 5, terrainRe);
    // outposts: a pad and an antenna; chargers: a pad; checkpoints: the kit's ring
    for (const u of L.outposts) { P('platform_small', u.x, u.y, u.z, 0, [TILE, 1.6, TILE]); P('machine_wireless', u.x + 1.3, u.y + 0.15, u.z - 1.3, Math.PI / 4, 1.8); }
    for (const e of L.chargers) P('platform_small', e.x, e.y, e.z, 0, [TILE, 1.6, TILE], { metalRed: 0x4ae08a });
    for (const g of L.checkpoints) P('gate_simple', g.x, g.y, g.z, g.axis === 'x' ? 0 : Math.PI / 2, 4);
    for (const g of L.gates) P('gate_complex', g.x, g.y, g.z, g.axis === 'x' ? 0 : Math.PI / 2, 4);
    // turret bases (the heads are instanced and turn)
    for (const t of L.turrets) P(t.double ? 'turret_double' : 'turret_single', t.x, t.y, t.z, 0, 3.5, undefined, undefined, { skipParts: ['turret'] });
    // monorail track
    for (const tr of L.tracks) {
      for (let s = tr.from + TILE / 2; s < tr.to; s += TILE) {
        const x = tr.axis === 'x' ? s : tr.at, z = tr.axis === 'x' ? tr.at : s;
        P('monorail_trackstraight', x, tr.y, z, tr.axis === 'x' ? Math.PI / 2 : 0, [4, 3, 4]);
      }
    }
    // crystal fields: a scatter of small crystal clusters on each field tile
    L.tiles.forEach((t, i) => {
      if (t.surf !== 'field') return;
      const c = i % cols, r = (i - c) / cols;
      for (let k = 0; k < 3; k++) {
        const x = c * TILE + 0.6 + hash(c * 5 + k, r) * 2.8, z = r * TILE + 0.6 + hash(r * 7 + k, c) * 2.8;
        P('rock_crystals', x, t.L * STEP, z, hash(c + k, r * 3) * 6.28, 2 + hash(c, r + k) * 1.2, terrainRe);
      }
    });
    for (const [, m] of chunks) {
      if (m.empty) continue;
      const g = m.build();
      this.owned.add(g);
      stage.add(new THREE.Mesh(g, this.mat));
    }
    // ---- instanced: what moves or goes
    const crysRe: Recolor = { rock: lk.rock, rockTrack: lk.road, crystal: lk.crystal };
    this.instance('crysRock', geo('rock_crystals', { recolor: crysRe, tag: 'T' + L.region, skip: ['crystal'] }), this.mat, L.crystals.length);
    this.instance('crysGem', geo('rock_crystals', { recolor: crysRe, tag: 'T' + L.region, only: ['crystal'] }), this.matGlow, L.crystals.length);
    this.instance('power', geo('barrel'), this.mat, L.powers.length, true);
    this.instance('beam', new THREE.CylinderGeometry(0.55, 0.55, 1, 10, 1, true).translate(0, 0.5, 0), this.matBeam, 40, true);
    this.instance('ring', new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), this.matRing, 24, true);
    this.instance('disc', new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), this.matRing, 24, true);
    this.instance('meteor', geo('meteor_detailed', { recolor: { rockTrack: 0x7a6a62 }, tag: 'm' }), this.mat, 16);
    this.instance('bolt', new THREE.IcosahedronGeometry(0.38, 1), this.matBright, 48, true);
    this.instance('marks', new THREE.PlaneGeometry(0.42, 0.9).rotateX(-Math.PI / 2), this.matMark, 420);
    this.instance('headS', geo('turret_single', { part: 'turret' }), this.mat, L.turrets.filter((t) => !t.double).length);
    this.instance('headD', geo('turret_double', { part: 'turret' }), this.mat, L.turrets.filter((t) => t.double).length);
    this.instance('crate', geo('barrel', { recolor: { metalRed: 0xffd040 }, tag: 'cargo' }), this.mat, 6);
    this.instance('lampGlow', new THREE.SphereGeometry(0.45, 10, 8), this.matBright, L.decor.filter((d) => d.kind === 'lamp').length + L.generators.length + L.chargers.length, true);
    this.instance('craterNew', geo('crater', { recolor: terrainRe, tag: 'T' + L.region }), this.mat, 40);
    const marks = this.inst.get('marks')!;
    marks.mesh.count = 0;
    this.markI = 0;
    // the crew (two kit astronauts) and the hidden alien
    const crewCap = L.astronauts.length;
    this.crew = [new Figures(stage, 'astronauta', this.mat, Math.max(1, crewCap)), new Figures(stage, 'astronautb', this.mat, Math.max(1, crewCap))];
    this.alien = L.alien ? new Figures(stage, 'alien', this.mat, 1) : null;
    // trains: one merged mesh each
    this.trains = L.tracks.map(() => {
      const m = new Merger();
      const kinds: ModelName[] = ['monorail_trainfront', 'monorail_trainpassenger', 'monorail_traincargo', 'monorail_trainend'];
      kinds.forEach((k, i) => m.add(geo(k), place(0, 0, -i * TRAIN.car - (i ? 0.2 : 0), k === 'monorail_trainend' ? Math.PI : 0, 4), 0xffffff));
      const g = m.build();
      this.owned.add(g);
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.visible = false;
      stage.add(mesh);
      return mesh;
    });
    // force fields
    this.fields = L.gates.map((g) => {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.75, 6), this.matField);
      mesh.position.set(g.x, g.y + 2.15, g.z);
      mesh.rotation.y = g.axis === 'x' ? 0 : Math.PI / 2;
      stage.add(mesh);
      return mesh;
    });
    // the rogue miner
    if (sim.miner) {
      const grp = new THREE.Group();
      const m = new THREE.Mesh(geo('craft_miner'), this.mat);
      m.scale.setScalar(3);
      grp.add(m);
      this.minerGlow = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
      this.minerGlow.position.set(0, 1.4, 3.6);
      grp.add(this.minerGlow);
      stage.add(grp);
      this.miner = grp;
    }
    // the rocket on its launch tower
    if (L.rocket) {
      const R = L.rocket;
      const tower = new Merger();
      tower.add(geo('rocket_basea'), place(R.x, R.y, R.z, 0, 4.4), 0xffffff);
      tower.add(geo('platform_large'), place(R.x, R.y, R.z, 0, [5, 1.6, 5]), 0xffffff);
      const tg = tower.build();
      this.owned.add(tg);
      stage.add(new THREE.Mesh(tg, this.mat));
      const rk = new Merger();
      let y = 0;
      const stack: [ModelName, number][] = [['rocket_finsa', 0.7], ['rocket_fuela', 0.5], ['rocket_sidesa', 1], ['rocket_sidesa', 1], ['rocket_topa', 0.8]];
      for (const [k, h] of stack) { rk.add(geo(k), place(0, y, 0, 0, 3.6), 0xffffff); y += h * 3.6; }
      const rg = rk.build();
      this.owned.add(rg);
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(rg, this.mat));
      grp.position.set(R.x, R.y + 0.3, R.z);
      stage.add(grp);
      this.rocket = grp;
    }
    // power icons floating over the pick-ups
    this.powerSprites = sim.powers.map((p) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: powerTexture(p.id), transparent: true, depthWrite: false, fog: false }));
      s.scale.set(1.8, 1.8, 1);
      stage.add(s);
      return s;
    });
    // headlights: on in the dark
    this.launchT = -1;
    this.towT = -1;
    this.flipA = 0;
    this.lastX = sim.rover.x; this.lastZ = sim.rover.z;
  }

  private instance(key: string, g: THREE.BufferGeometry, mat: THREE.Material, cap: number, colors = false): Inst {
    const i = new Inst(this.stage!, g, mat, cap, colors);
    if (!isKitGeo(g)) this.owned.add(g);
    this.inst.set(key, i);
    return i;
  }

  private addCrater(m: Merger, cr: { x: number; z: number; R: number; H: number; large: boolean; pit: boolean }, y: number, re: Recolor): void {
    const kR = cr.large ? 0.44 : 0.41, kH = cr.large ? 0.12 : 0.118;
    const sx = cr.R / kR, sy = cr.H / kH;
    m.add(geo(cr.large ? 'craterlarge' : 'crater', { recolor: re, tag: 'T' + (this.level?.region ?? '') }), place(cr.x, y, cr.z, hash(cr.x, cr.z) * 6.28, [sx, sy, sx]), 0xffffff);
    if (cr.pit) {
      // the hole: a dark shaft into the ground
      const r = cr.R * PIT_IN, n = 14, d = 9;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const p = (a: number, yy: number) => [cr.x + Math.cos(a) * r, yy, cr.z + Math.sin(a) * r];
        m.quad(p(a0, y + 0.3), p(a1, y + 0.3), p(a1, y - d), p(a0, y - d), mulc(this.look.rockDark, 0.45));
        m.tri([cr.x, y - d, cr.z], p(a1, y - d), p(a0, y - d), 0x050508);
      }
    }
  }

  // ---------------------------------------------------------------- per frame

  snap(sim: Sim): void {
    const v = sim.rover;
    this.cam.x = v.x; this.cam.y = v.y; this.cam.z = v.z; this.cam.yaw = v.yaw;
    this.cam.look.set(v.x, v.y, v.z);
    this.lastX = v.x; this.lastZ = v.z;
    this.sync(sim, 0);
  }

  sync(sim: Sim, dt: number, o: { camera?: CamMode; introT?: number } = {}): void {
    this.time += dt;
    const mode = o.camera ?? 'follow';
    const v = sim.rover, L = sim.c, lk = this.look;
    this.fx.update(dt);
    // ---- the storm darkens the sky and the light
    const st = sim.stormK;
    const bg = this.world.scene.background as THREE.Color;
    bg.setHex(lk.sky).lerp(tc.setHex(0x2a0a0a), st * 0.85);
    (this.world.scene.fog as THREE.Fog).color.copy(bg);
    this.hemi.intensity = lk.hemi[2] * (1 - st * 0.45) * (mode === 'preview' ? 1.15 : 1);
    this.sun.intensity = lk.sun[1] * (1 - st * 0.55);
    this.sun.color.setHex(lk.sun[0]).lerp(tc.setHex(0xff7a4a), st * 0.7);
    // ---- the rover
    this.syncRover(sim, dt, mode);
    // ---- everything else
    this.syncLevel(sim, dt);
    this.camera(sim, dt, mode, o.introT ?? 1);
    // the sky follows the camera
    this.sky.position.copy(this.world.camera.position);
    void L;
  }

  private syncRover(sim: Sim, dt: number, mode: CamMode): void {
    const v = sim.rover, lk = this.look;
    const show = mode !== 'preview';
    this.rover.visible = show;
    // suspension: a spring the jolts kick
    this.bounceV += (-this.bounce * 90 - this.bounceV * 9) * dt;
    this.bounceV -= v.jolt * 40 * dt * (v.air ? 0 : 1);
    this.bounce += this.bounceV * dt;
    this.bounce = Math.max(-0.35, Math.min(0.25, this.bounce));
    if (!v.air && this.airPrev) this.bounceV -= 3;
    this.airPrev = v.air;
    // the flip: a tumble, then upright
    if (v.state === 'flip') this.flipA = Math.min(Math.PI * 2, this.flipA + dt * 5.2);
    else this.flipA = 0;
    // the tow lifts the rover away under the cargo craft
    let lift = 0;
    if (v.state === 'tow') {
      if (this.towT < 0) { this.towT = 0; this.towFrom.set(v.x, v.y, v.z); }
      this.towT += dt;
      lift = Math.max(0, Math.min(1, this.towT / 1.4) - 0.4) * 22;
    }
    this.rover.position.set(v.x, v.y + lift, v.z);
    this.rover.rotation.set(0, 0, 0);
    this.rover.quaternion.setFromEuler(te.set(-v.pitch, v.yaw, -v.roll + this.flipA, 'YXZ'));
    this.chassis.position.y = this.bounce * 0.6;
    this.chassis.rotation.x = -this.bounceV * 0.004;
    this.rover.updateMatrixWorld(true);
    // wheels: spin with the ground speed, drop when airborne
    this.wheelSpin += (v.air ? v.speed * 0.6 : v.speed) * dt / (0.043 * ROVER_S);
    const W = this.wheels;
    W.begin();
    if (this.rover.visible) {
      for (const wa of this.wheelAt) {
        const drop = v.air ? -0.12 : -this.bounce * 0.2;
        tm2.makeTranslation(wa.x, wa.y + drop, wa.z);
        tm2.premultiply(this.rover.matrixWorld);
        // the right-hand wheels are the left one turned round
        if (wa.side < 0) tm2.multiply(tm.makeRotationY(Math.PI));
        tm2.multiply(tm.makeRotationX(wa.side < 0 ? -this.wheelSpin : this.wheelSpin));
        if (wa.s !== 1) tm2.multiply(tm.makeScale(1, wa.s, wa.s));
        W.putM(tm2);
      }
    }
    W.end();
    // the shield, the magnet ring, headlights
    this.shield.visible = v.active.shield > 0;
    if (this.shield.visible) { const k = 1 + Math.sin(this.time * 9) * 0.04; this.shield.scale.set(k, k, k); (this.shield.material as THREE.MeshBasicMaterial).opacity = v.active.shield < 1.5 ? 0.1 + 0.15 * Math.abs(Math.sin(this.time * 14)) : 0.22; }
    this.magnet.visible = v.active.magnet > 0 && show;
    if (this.magnet.visible) {
      const R = (sim.ranks.magnet + 1) * 3 + 9 + ((this.time * 12) % 6);
      this.magnet.position.set(v.x, sim.ter.ground(v.x, v.z) + 0.3, v.z);
      this.magnet.scale.set(R, 1, R);
      (this.magnet.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - ((this.time * 12) % 6) / 6);
    }
    const dark = sim.c.region === 'dark' || sim.stormK > 0.3;
    this.head.intensity = dark && this.rover.visible ? 60 : 0;
    const fx0 = Math.sin(v.yaw), fz0 = Math.cos(v.yaw);
    this.head.position.set(v.x + fx0 * 1.2, v.y + 2.2, v.z + fz0 * 1.2);
    this.head.target.position.set(v.x + fx0 * 14, v.y - 0.5, v.z + fz0 * 14);
    // the shadow under it, smaller and fainter the higher it flies
    const gy = sim.ter.ground(v.x, v.z);
    const alt = Math.max(0, v.y - gy);
    this.blob.visible = this.rover.visible && gy > ABYSS + 1;
    this.blob.position.set(v.x, gy + 0.06, v.z);
    const bs = 3.4 * Math.max(0.45, 1 - alt * 0.06);
    this.blob.scale.set(bs, 1, bs * 1.15);
    this.blob.rotation.y = v.yaw;
    (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0.25, 1 - alt * 0.08);
    // cargo crates and the crew riding on the deck
    const crate = this.inst.get('crate');
    if (crate) {
      crate.begin();
      if (this.rover.visible) for (let i = 0; i < v.cargo; i++) {
        tm2.makeTranslation(-0.32 + (i % 2) * 0.64, 1.55 + Math.floor(i / 2) * 1.45, -0.55);
        tm2.premultiply(this.rover.matrixWorld);
        tm2.multiply(tm.makeScale(4.4, 4.4, 4.4));
        crate.putM(tm2);
      }
      crate.end();
    }
    // dust plumes from the wheels, tire tracks
    if (dt > 0 && show && v.state === 'drive') {
      const sp = Math.hypot(v.vx, v.vz);
      const surfCol = v.surf === 'ice' ? lk.ice : v.surf === 'dust' ? lk.dust : v.surf === 'road' ? lk.road : lk.rock;
      if (!v.air && sp > 2.5) {
        this.dustT += dt * (sp * (v.surf === 'dust' ? 2.2 : v.surf === 'ice' ? 0.4 : 1));
        while (this.dustT > 0.35) {
          this.dustT -= 0.35;
          const side = Math.random() < 0.5 ? -1 : 1;
          const bx = -Math.sin(v.yaw), bz = -Math.cos(v.yaw);
          this.fx.plume(v.x + bx * 1 - Math.cos(v.yaw) * side * 0.8, gy, v.z + bz * 1 + Math.sin(v.yaw) * side * 0.8, bx, bz, Math.min(1, sp / 13), mulc(surfCol, 0.95));
        }
      }
      // boost exhaust and hover jets
      if (v.active.boost > 0) this.fx.flame(v.x - fx0 * 1.3, v.y + 1.1, v.z - fz0 * 1.3, -fx0 * 6, 0.5, -fz0 * 6, 3, [0xffe08a, 0xff8a2a, 0xff5a2a]);
      if (v.active.hover > 0 && v.air) this.fx.flame(v.x, v.y + 0.2, v.z, 0, -5, 0, 2, [0x7affc8, 0xc8fff0], 0.16);
      // tracks
      const moved = Math.hypot(v.x - this.lastX, v.z - this.lastZ);
      if (!v.air && v.surf !== 'road' && moved > 0) {
        this.markD += moved;
        if (this.markD > 0.8) {
          this.markD = 0;
          const marks = this.inst.get('marks');
          if (marks) {
            for (const side of [-1, 1]) {
              const x = v.x - Math.cos(v.yaw) * side * 0.72, z = v.z + Math.sin(v.yaw) * side * 0.72;
              const i = this.markI % marks.mesh.instanceMatrix.count;
              tq.setFromEuler(te.set(0, v.yaw, 0));
              tm.compose(tv.set(x, sim.ter.ground(x, z) + 0.05, z), tq, ts.set(1, 1, 1));
              marks.mesh.setMatrixAt(i, tm);
              this.markI++;
            }
            marks.mesh.count = Math.min(this.markI, marks.mesh.instanceMatrix.count);
            marks.mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }
    this.lastX = v.x; this.lastZ = v.z;
    // the tow: the cargo craft comes down, lifts the rover away; after the respawn it sets it down
    const tw = this.tow;
    if (v.state === 'tow') {
      const k = Math.min(1, this.towT / 1.4);
      tw.visible = true;
      tw.position.set(this.towFrom.x, this.towFrom.y + 4.4 + (1 - Math.min(1, k * 2.5)) * 10 + lift, this.towFrom.z);
      tw.rotation.y = v.yaw;
      this.blob.visible = false;
    } else if (this.dropT >= 0) {
      this.dropT += dt;
      tw.visible = this.dropT < 1.4;
      tw.position.set(v.x, v.y + 4.4 + this.dropT * this.dropT * 12, v.z);
      tw.rotation.y = v.yaw;
      if (this.dropT >= 1.4) this.dropT = -1;
    } else { tw.visible = false; this.towT = -1; }
  }

  /** After a tow: the craft flies off from over the rover at its checkpoint. */
  dropIn(): void { this.dropT = 0; this.towT = -1; }

  private syncLevel(sim: Sim, dt: number): void {
    const L = sim.c, v = sim.rover, lk = this.look;
    const tnow = this.time;
    // crystals: a slow turn and bob; taken ones are gone
    const cr = this.inst.get('crysRock'), cg = this.inst.get('crysGem');
    if (cr && cg) {
      cr.begin(); cg.begin();
      sim.crystals.forEach((c, i) => {
        if (c.taken) return;
        const bob = c.pull > 0 ? 0 : Math.sin(tnow * 2 + i) * 0.12;
        const s = 3.2 * (c.pull > 0 ? 1 - c.pull * 0.4 : 1);
        cr.put(c.x, c.y + bob, c.z, 0, tnow * 0.4 + i, 0, s);
        cg.put(c.x, c.y + bob, c.z, 0, tnow * 0.4 + i, 0, s);
      });
      cr.end(); cg.end();
    }
    // power pick-ups: a spinning canister in the power's colour with its icon above
    const pw = this.inst.get('power');
    if (pw) {
      pw.begin();
      sim.powers.forEach((p, i) => {
        const sp = this.powerSprites[i];
        if (p.taken) { if (sp) sp.visible = false; return; }
        const y = p.y + 0.6 + Math.sin(tnow * 2.4 + i) * 0.25;
        pw.color(pw.put(p.x, y, p.z, 0, tnow * 1.6, 0.25, 6), mix(POWER_COLOR[p.id], 0xffffff, 0.35));
        if (sp) { sp.visible = true; sp.position.set(p.x, y + 2.8, p.z); }
      });
      pw.end();
    }
    // beacons: light pillars over every goal that still waits
    const beam = this.inst.get('beam');
    if (beam) {
      beam.begin();
      const pillar = (x: number, y: number, z: number, col: number, h = 16, w = 1) => { const i = beam.put(x, y, z, 0, 0, 0, ts.set(w, h, w)); beam.color(i, col); };
      const pulse = 0.85 + Math.sin(tnow * 3) * 0.15;
      sim.astronauts.forEach((a) => { if (a.state === 'wait' || a.state === 'wave') pillar(a.x, a.y, a.z, mulc(0xff9a3a, pulse), 18, 0.9); });
      L.outposts.forEach((u, i) => { if (!sim.delivered[i]) pillar(u.x, u.y, u.z, mulc(0x3ad8ff, pulse), 22, 1.2); });
      sim.generators.forEach((g) => { if (!g.off) pillar(g.x, g.y, g.z, mulc(0xff3a3a, pulse), 20, 1.1); });
      if (sim.ready && L.setpiece !== 'escape') pillar(L.base.x, L.base.y, L.base.z, mulc(0x5aff7a, pulse), 26, 2.2);
      if (L.rocket) pillar(L.rocket.x, L.rocket.y, L.rocket.z, mulc(0xffd040, pulse), 34, 2.6);
      L.chargers.forEach((e) => pillar(e.x, e.y, e.z, mulc(0x4ae08a, 0.5), 5, 1.6));
      beam.end();
    }
    // lamps, charger and generator lights
    const lg = this.inst.get('lampGlow');
    if (lg) {
      lg.begin();
      for (const d of L.decor) if (d.kind === 'lamp') lg.color(lg.put(d.x, d.y + 5.1, d.z, 0, 0, 0, 1), 0xfff2c8);
      for (const e of L.chargers) lg.color(lg.put(e.x, e.y + 0.6 + Math.sin(tnow * 4) * 0.1, e.z, 0, 0, 0, 0.6), v.charging ? 0x9affb8 : 0x4ae08a);
      sim.generators.forEach((g) => lg.color(lg.put(g.x, g.y + 2.5, g.z, 0, 0, 0, 0.7), g.off ? 0x404048 : (Math.floor(tnow * 4) % 2 ? 0xff3a2a : 0xffa040)));
      lg.end();
    }
    // meteors: the warning ring (red, shrinking to the strike), the rock coming down in flames
    const ring = this.inst.get('ring'), disc = this.inst.get('disc'), met = this.inst.get('meteor');
    if (ring && disc && met) {
      ring.begin(); disc.begin(); met.begin();
      for (const m of sim.meteors) {
        const R = m.big ? 4.6 : 3.4;
        const k = Math.max(0, m.t / m.warn);
        const gy = m.y + 0.12;
        ring.color(ring.put(m.x, gy, m.z, 0, 0, 0, ts.set(R, 1, R)), Math.floor(tnow * 8) % 2 ? 0xff2a1a : 0xff7a3a);
        disc.color(disc.put(m.x, gy - 0.02, m.z, 0, 0, 0, ts.set(R * (1 - k), 1, R * (1 - k))), 0x7a1208);
        const h = k * 70;
        const mx = m.x + k * 30, my = gy + h, mz = m.z - k * 18;
        met.put(mx, my, mz, tnow * 3, tnow * 2, 0, m.big ? 4.4 : 3);
        if (dt > 0) this.fx.flame(mx, my + 1, mz, 6, 8, -4, 2, [0xffe08a, 0xff7a2a, 0xa83a1a], m.big ? 0.6 : 0.42);
      }
      ring.end(); disc.end(); met.end();
    }
    // fresh craters left by meteors
    const cn = this.inst.get('craterNew');
    if (cn) {
      cn.begin();
      for (const c of sim.ter.craters) if (c.fresh) cn.put(c.x, sim.ter.base(sim.ter.tileAt(c.x, c.z)!, c.x, c.z, Math.floor(c.x / TILE), Math.floor(c.z / TILE)), c.z, 0, (c.x * 7) % 6.28, 0, ts.set(c.R / 0.41, c.H / 0.118, c.R / 0.41));
      cn.end();
    }
    // turret heads turn to aim; a charging barrel glows
    const hs = this.inst.get('headS'), hd = this.inst.get('headD');
    if (hs && hd) {
      hs.begin(); hd.begin();
      sim.turrets.forEach((t) => {
        const I = t.double ? hd : hs;
        const rest = partRest(t.double ? 'turret_double' : 'turret_single', 'turret');
        tm2.compose(tv.set(t.x, t.y, t.z), tq.setFromEuler(te.set(0, t.yaw, 0)), ts.set(3.5, 3.5, 3.5)).multiply(rest);
        const i = I.putM(tm2);
        void i;
      });
      hs.end(); hd.end();
      if (dt > 0) sim.turrets.forEach((t) => { if (t.charge > 0 && Math.random() < 0.7) this.fx.sparks(t.x + Math.sin(t.yaw) * 1.6, t.y + 1.6, t.z + Math.cos(t.yaw) * 1.6, 1, [0xff5a3a, 0xffd08a], 1, 1, 0.1); if (t.frozen > 0 && Math.random() < 0.2) this.fx.sparks(t.x, t.y + 2.2, t.z, 1, [0xc890ff, 0xffffff], 2, 2, 0.08); });
    }
    // bolts
    const bo = this.inst.get('bolt');
    if (bo) {
      bo.begin();
      for (const b of sim.bolts) { bo.color(bo.put(b.x, b.y, b.z, 0, 0, 0, 1 + Math.sin(tnow * 30) * 0.15), 0xff5a3a); if (dt > 0 && Math.random() < 0.6) this.fx.spawn(b.x, b.y, b.z, 0, 0, 0, 0.22, 0.25, 0xffa06a); }
      bo.end();
    }
    // trains
    L.tracks.forEach((tr, i) => {
      const mesh = this.trains[i];
      const p = sim.trainPos(i);
      mesh.visible = p.on;
      if (!p.on) return;
      const along = p.head - tr.dir * 2.1;
      if (tr.axis === 'x') { mesh.position.set(along, tr.y + 0.35, tr.at); mesh.rotation.y = tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { mesh.position.set(tr.at, tr.y + 0.35, along); mesh.rotation.y = tr.dir > 0 ? 0 : Math.PI; }
    });
    // force fields flicker while on
    L.gates.forEach((_, i) => { const f = this.fields[i]; const on = sim.gateOn(i); f.visible = on; if (on) f.scale.setScalar(1 + Math.sin(tnow * 20 + i) * 0.02); });
    (this.matField.color as THREE.Color).setHex(0x5ab8ff);
    this.matField.opacity = 0.32 + Math.sin(tnow * 12) * 0.08;
    // the miner
    if (this.miner && sim.miner) {
      const m = sim.miner;
      this.miner.position.set(m.x, m.y, m.z);
      this.miner.rotation.set(m.off ? 0.25 * m.sink : Math.sin(tnow * 2) * 0.04, m.yaw, m.off ? 0.3 * m.sink : Math.sin(tnow * 1.6) * 0.05);
      if (this.minerGlow) (this.minerGlow.material as THREE.MeshBasicMaterial).color.setHex(m.off ? 0x202024 : m.frozen > 0 ? 0xc890ff : Math.floor(tnow * 6) % 2 ? 0xff2a1a : 0xff8a3a);
      if (dt > 0 && !m.off && Math.random() < 0.5) this.fx.dust(m.x, sim.ter.ground(m.x, m.z), m.z, 1, lk.rock, 3, 1, 0.3);
    }
    // the rocket: a launch
    if (this.rocket) {
      if (sim.launched && this.launchT < 0) this.launchT = 0;
      if (this.launchT >= 0) {
        this.launchT += dt;
        const k = Math.max(0, this.launchT - 0.8);
        this.rocket.position.y = (L.rocket?.y ?? 0) + 0.3 + k * k * 6;
        if (dt > 0) { const r = this.rocket.position; this.fx.flame(r.x, r.y, r.z, 0, -9, 0, 6, [0xffffff, 0xffe08a, 0xff8a2a], 0.7); if (this.launchT < 3) this.fx.dust(r.x, L.rocket!.y, r.z, 3, lk.rock, 9, 1.5, 0.6); }
      }
    }
    // the crew and the alien
    this.syncFigures(sim, dt);
  }

  private syncFigures(sim: Sim, _dt: number): void {
    const v = sim.rover, tnow = this.time;
    for (const f of this.crew) f.begin();
    sim.astronauts.forEach((a, i) => {
      const f = this.crew[i % 2];
      if (a.state === 'aboard') {
        if (!this.rover.visible) return;
        // on the deck, holding on, waving when happy
        const seat = a.seat;
        const sx = seat % 2 ? 0.55 : -0.55, sz = seat < 2 ? -1.15 : -0.1;
        tm2.makeTranslation(sx, 1.32, sz);
        tm2.premultiply(this.rover.matrixWorld);
        tm2.multiply(tm.makeRotationY(seat % 2 ? -0.4 : 0.4));
        tm2.multiply(tm.makeScale(RIDER_S, RIDER_S, RIDER_S));
        const cheer = Math.sin(tnow * 6 + seat) * 0.3;
        f.put(tm2, { armLeft: [0, -2.4 + cheer], armRight: [0, 2.4 - cheer], legLeft: [0.5, 0], legRight: [0.5, 0] });
        return;
      }
      if (a.state === 'saved' && a.t > 3) return;
      const base = tm2.compose(tv.set(a.x, a.y, a.z), tq.setFromEuler(te.set(0, a.yaw, 0)), ts.set(ASTRO_S, ASTRO_S, ASTRO_S));
      const pose: Partial<Record<Part, [number, number]>> = {};
      if (a.state === 'wave') {
        const w = Math.sin(tnow * 9 + i) * 0.35;
        pose.armRight = [0, 2.5 + w]; pose.armLeft = [0, -0.2]; pose.head = [0, Math.sin(tnow * 3) * 0.1];
        base.multiply(tm.makeTranslation(0, Math.abs(Math.sin(tnow * 4.5 + i)) * 0.08, 0));
      } else if (a.state === 'run' || (a.state === 'saved' && a.speed > 0)) {
        const s = Math.sin(tnow * 14 + i) * 0.8;
        pose.legLeft = [s, 0]; pose.legRight = [-s, 0]; pose.armLeft = [-s * 0.8, 0]; pose.armRight = [s * 0.8, 0];
        base.multiply(tm.makeTranslation(0, Math.abs(Math.cos(tnow * 14 + i)) * 0.06, 0));
      } else {
        pose.head = [0, Math.sin(tnow * 0.7 + i) * 0.3]; pose.armLeft = [0, -0.1]; pose.armRight = [0, 0.1];
      }
      if (a.state === 'saved') base.multiply(tm.makeScale(1, 1, 1));
      f.put(base, pose);
    });
    for (const f of this.crew) f.end();
    if (this.alien && sim.c.alien) {
      const al = sim.c.alien, f = this.alien;
      f.begin();
      const found = sim.alienFound;
      const yaw = found ? Math.atan2(v.x - al.x, v.z - al.z) : tnow * 0.3;
      const hop = found ? Math.abs(Math.sin(tnow * 5)) * 0.5 : Math.abs(Math.sin(tnow * 1.3)) * 0.12;
      tm2.compose(tv.set(al.x, al.y + hop, al.z), tq.setFromEuler(te.set(0, yaw, 0)), ts.set(ASTRO_S, ASTRO_S, ASTRO_S));
      const w = Math.sin(tnow * 10) * 0.4;
      f.put(tm2, found ? { armRight: [0, 2.6 + w], armLeft: [0, -2.6 - w] } : { head: [0, Math.sin(tnow * 2) * 0.5] });
      f.end();
    }
  }

  // ---------------------------------------------------------------- the camera

  private camera(sim: Sim, dt: number, mode: CamMode, introT: number): void {
    const v = sim.rover, c = this.cam, cam = this.world.camera, L = sim.c;
    if (this.shotCam) {
      cam.position.set(this.shotCam[0][0], this.shotCam[0][1], this.shotCam[0][2]);
      cam.lookAt(this.shotCam[1][0], this.shotCam[1][1], this.shotCam[1][2]);
      return;
    }
    const fog = this.world.scene.fog as THREE.Fog;
    fog.near = this.look.fogNear; fog.far = this.look.fogFar;
    if (mode === 'preview') {
      // the whole level turning slowly, seen from high up
      this.preT += dt;
      const cx = (L.cols * TILE) / 2, cz = (L.rows * TILE) / 2;
      const size = Math.max(L.cols, L.rows) * TILE;
      const a = this.preT * 0.12 + 0.6;
      const d = size * (this.land ? 0.62 : 0.78);
      const lx = this.land ? cx - Math.cos(a) * size * 0.16 : cx, lz = this.land ? cz + Math.sin(a) * size * 0.16 : cz + size * 0.1;
      cam.position.set(lx + Math.sin(a) * d, size * 0.62, lz + Math.cos(a) * d);
      cam.lookAt(lx, 0, lz);
      if (this.land) {
        // the board covers the left: the level shows on the right half
        tv.set(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(-size * 0.25);
        cam.position.add(tv);
      }
      fog.near = 400; fog.far = 900;
      return;
    }
    if (mode === 'hangar') {
      // a turntable round the rover on its pad
      this.preT += dt;
      const a = this.preT * 0.35;
      const d = 9;
      const side = this.land ? 3.2 : 0;
      cam.position.set(v.x + Math.sin(a) * d, v.y + 3.6, v.z + Math.cos(a) * d);
      cam.lookAt(v.x, v.y + 0.9 - (this.land ? 0 : 1.6), v.z);
      tv.set(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(-side);
      cam.position.add(tv);
      return;
    }
    const k = this.land ? CAM_LAND.k : 1;
    // the camera's heading eases after the rover's (not while it flips or tumbles)
    let want = v.yaw;
    if (v.speed < -1.5 && !v.air) want = v.yaw; // reversing: keep looking forward
    let dy = want - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const yawRate = v.state === 'flip' ? 0 : v.air ? 1.6 : 3.2;
    c.yaw += dy * Math.min(1, dt * yawRate);
    if (mode === 'intro') c.yaw = want;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    // follow the rover (smoothly in height: jumps feel big)
    const ease = Math.min(1, dt * 9);
    c.x += (v.x - c.x) * ease; c.z += (v.z - c.z) * ease;
    c.y += (v.y - c.y) * Math.min(1, dt * (v.air ? 3 : 7));
    if (dt === 0) { c.x = v.x; c.z = v.z; c.y = v.y; }
    let dist = CAM.dist * k, height = CAM.height * k;
    const sp = Math.hypot(v.vx, v.vz);
    dist += Math.min(2.2, sp * 0.12);
    if (mode === 'intro') {
      // a swoop from high over the goal down behind the rover
      const e = 1 - Math.pow(1 - Math.min(1, introT), 3);
      const g = sim.c.outposts[0] ?? sim.goal;
      const tx = g.x + (c.x - g.x) * e, tz = g.z + (c.z - g.z) * e;
      dist = dist + (1 - e) * 26;
      height = height + (1 - e) * 34;
      const lx = tx + fx * CAM.ahead, lz = tz + fz * CAM.ahead;
      cam.position.set(lx - fx * (dist + CAM.ahead), c.y + height, lz - fz * (dist + CAM.ahead));
      cam.lookAt(lx, c.y + 1, lz);
      return;
    }
    const lookX = c.x + fx * CAM.ahead, lookZ = c.z + fz * CAM.ahead;
    let px = c.x - fx * dist, pz = c.z - fz * dist, py = c.y + height;
    // never lose the rover: rise over any ground between
    for (const s of [0.35, 0.7, 1]) {
      const gx = c.x - fx * dist * s, gz = c.z - fz * dist * s;
      const g = sim.ter.ground(gx, gz);
      if (g < 50) py = Math.max(py, g + 2.6 + (1 - s) * 1.5);
      else py = Math.max(py, c.y + height + 3);
    }
    c.shake = Math.max(0, c.shake - dt * 2.4);
    const sh = c.shake * c.shake * 0.45;
    px += (Math.random() - 0.5) * sh; py += (Math.random() - 0.5) * sh; pz += (Math.random() - 0.5) * sh;
    cam.position.set(px, py, pz);
    c.look.set(lookX, c.y + 1.2, lookZ);
    cam.lookAt(c.look);
  }

  shake(k: number): void { this.cam.shake = Math.min(1.5, this.cam.shake + k); }

  screen(x: number, y: number, z: number): { x: number; y: number } { return this.world.toScreen(new THREE.Vector3(x, y, z)); }

  /** Compiles every shader of the level ahead (the first frames do not stall). */
  warm(): void { this.world.renderer.compile(this.world.scene, this.world.camera); }

  stats(): { calls: number; triangles: number } {
    const i = this.world.renderer.info.render;
    return { calls: i.calls, triangles: i.triangles };
  }

  /** Frees the level's meshes (the kit's cached geometries stay). */
  clear(): void {
    if (!this.stage) return;
    this.stage.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
      if (m.geometry && this.owned.has(m.geometry)) m.geometry.dispose();
      else if (m.geometry && !isKitGeo(m.geometry) && !(o as THREE.Sprite).isSprite) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat && mat !== this.mat && mat !== this.matGlow && mat !== this.matBeam && mat !== this.matBright && mat !== this.matMark && mat !== this.matRing && mat !== this.matField) mat.dispose();
    });
    for (const g of this.owned) g.dispose();
    this.owned.clear();
    this.world.scene.remove(this.stage);
    this.stage = null;
    this.inst.clear();
    this.crew = [];
    this.alien = null;
    this.trains = [];
    this.fields = [];
    this.miner = null;
    this.minerGlow = null;
    this.rocket = null;
    this.powerSprites = [];
    this.fx.clear();
  }

  dispose(): void { this.clear(); }
}

// ------------------------------------------------------------------ the rover's parts

const bodyCache = new Map<string, THREE.BufferGeometry>();
/** The rover's body without its wheels, in a paint skin, scaled to metres. */
function roverBody(id: SkinId): THREE.BufferGeometry {
  let g = bodyCache.get(id);
  if (g) return g;
  const sk = SKINS.find((s) => s.id === id) ?? SKINS[0];
  const src = geo('rover', { recolor: { metalRed: sk.accent, metal: sk.body }, tag: 'skin-' + id });
  const pos = src.getAttribute('position'), col = src.getAttribute('color');
  const P: number[] = [], C: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    if (isWheelTri(pos, t)) continue;
    for (let k = 0; k < 3; k++) { P.push(pos.getX(t + k) * ROVER_S, pos.getY(t + k) * ROVER_S, pos.getZ(t + k) * ROVER_S); C.push(col.getX(t + k), col.getY(t + k), col.getZ(t + k)); }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  bodyCache.set(id, g);
  return g;
}

function isWheelTri(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, t: number): boolean {
  let x = 0, y = 0;
  for (let k = 0; k < 3; k++) { x += pos.getX(t + k); y += pos.getY(t + k); }
  x /= 3; y /= 3;
  return Math.abs(x) > 0.095 && y < 0.1;
}

let wheelCache: { geo: THREE.BufferGeometry; at: { x: number; y: number; z: number; s: number; side: number }[] } | null = null;
/** One wheel (the front left, centred on its axle) and where the six sit (metres, rover space). */
function roverWheel(): { geo: THREE.BufferGeometry; at: { x: number; y: number; z: number; s: number; side: number }[] } {
  if (wheelCache) return wheelCache;
  const src = geo('rover');
  const pos = src.getAttribute('position'), col = src.getAttribute('color');
  const groups = new Map<string, number[]>();
  for (let t = 0; t < pos.count; t += 3) {
    if (!isWheelTri(pos, t)) continue;
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(t + k); z += pos.getZ(t + k); }
    const key = (x > 0 ? 'R' : 'L') + (z / 3 > 0.04 ? 'F' : z / 3 < -0.04 ? 'B' : 'M');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const box = (tris: number[]) => {
    const b = new THREE.Box3();
    for (const t of tris) for (let k = 0; k < 3; k++) b.expandByPoint(tv.set(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)));
    return b;
  };
  const lf = groups.get('LF') ?? [];
  const lb = box(lf), c0 = lb.getCenter(new THREE.Vector3()), r0 = (lb.max.y - lb.min.y) / 2;
  const P: number[] = [], C: number[] = [];
  for (const t of lf) for (let k = 0; k < 3; k++) {
    P.push((pos.getX(t + k) - c0.x) * ROVER_S, (pos.getY(t + k) - c0.y) * ROVER_S, (pos.getZ(t + k) - c0.z) * ROVER_S);
    C.push(col.getX(t + k), col.getY(t + k), col.getZ(t + k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const at: { x: number; y: number; z: number; s: number; side: number }[] = [];
  for (const [k, tris] of groups) {
    const b = box(tris), c = b.getCenter(new THREE.Vector3()), r = (b.max.y - b.min.y) / 2;
    at.push({ x: c.x * ROVER_S, y: c.y * ROVER_S, z: c.z * ROVER_S, s: r / r0, side: k[0] === 'R' ? -1 : 1 });
  }
  wheelCache = { geo: g, at };
  return wheelCache;
}

/** The road piece and turn for the neighbours a road tile joins (N, E, S, W). */
function roadPiece(mask: boolean[]): [ModelName, number] {
  const n = mask.filter(Boolean).length;
  // the kit's pieces in their own space: straight N+S, corner N+W, split S+W+E, end N, cross all
  const base: [ModelName, boolean[]][] = [['terrain_roadstraight', [true, false, true, false]], ['terrain_roadcorner', [true, false, false, true]], ['terrain_roadsplit', [false, true, true, true]], ['terrain_roadend', [true, false, false, false]], ['terrain_roadcross', [true, true, true, true]]];
  if (n === 0) return ['terrain_roadstraight', 0];
  for (const [name, m0] of base) {
    for (let k = 0; k < 4; k++) {
      // a turn by k quarter turns (+π/2 each) sends N→W, E→N, S→E, W→S
      const rotd = [0, 0, 0, 0].map((_, d) => m0[(d + k) % 4]);
      if (rotd.every((b, d) => b === mask[d])) return [name, (k * Math.PI) / 2];
    }
  }
  return ['terrain_roadstraight', mask[1] || mask[3] ? Math.PI / 2 : 0];
}

// ------------------------------------------------------------------ helpers

export function hash(a: number, b: number): number {
  let h = (Math.floor(a * 73856093) ^ Math.floor(b * 19349663)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulc(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

let blobTex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 63);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,250,230,0.8)'); g.addColorStop(0.4, 'rgba(255,230,190,0.18)'); g.addColorStop(1, 'rgba(255,220,180,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let earthTex: THREE.Texture | null = null;
/** The Earth: blue oceans, green and tan land, white clouds and caps, painted once. */
function earthTexture(): THREE.Texture {
  if (earthTex) return earthTex;
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a4a9a'); g.addColorStop(0.5, '#2a6ac8'); g.addColorStop(1, '#1a4a9a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  let s = 11;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const blob = (cx: number, cy: number, rad: number, col: string, n: number) => {
    x.fillStyle = col;
    for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = r() * rad; x.beginPath(); x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, rad * (0.2 + r() * 0.35), rad * (0.15 + r() * 0.25), r() * 3, 0, Math.PI * 2); x.fill(); }
  };
  for (const [cx, cy, rad] of [[90, 90, 50], [130, 170, 40], [260, 80, 60], [290, 150, 45], [400, 110, 55], [450, 190, 30]] as [number, number, number][]) { blob(cx, cy, rad, '#3a8a3a', 14); blob(cx + 8, cy + 6, rad * 0.6, '#9a8a4a', 6); }
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, 0, W, 16); x.fillRect(0, H - 14, W, 14);
  for (let i = 0; i < 46; i++) { x.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.4})`; x.beginPath(); x.ellipse(r() * W, 20 + r() * (H - 40), 20 + r() * 50, 4 + r() * 8, (r() - 0.5) * 0.4, 0, Math.PI * 2); x.fill(); }
  earthTex = new THREE.CanvasTexture(c);
  earthTex.colorSpace = THREE.SRGBColorSpace;
  return earthTex;
}
