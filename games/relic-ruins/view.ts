// Relic Ruins: the 3D view of a level. It reads the sim and draws:
//   - the ruin, built from the pack on its 2 m grid: floor tiles (instanced, so any of them can fall
//     in), walls on the edges of the wall blocks (the pack's turn rule: each faces its floor, its
//     thickness inside the block), dark wall tops, columns at the corners, arches round every door,
//     raised floors with balustrades and stairs, bridges, shafts under the pits (dark water in the
//     library), cart rails, plates, decor by world; all static pieces merged into a few chunks;
//   - what moves or changes, instanced by kind: door leaves, sealed doors, bookcases, trapdoors,
//     flames, lever handles, pots, bear traps, crates, statues, carts, pick-ups, glows, bricks;
//   - the hero: the pack's own rogue with its own clips (idle, walk, run, roll, pick-up, punch, the
//     dagger thrusts for lighting and the swings for levers and flares, the hit, the fall), the
//     pack's torch in the left hand, its flame the light that follows him;
//   - the creatures (shades and wisps from the platformer pack, the guardian statues from this one);
//   - the darkness and the cutaway (shade.ts), the light pools of lit fires, embers and dust;
//   - a tilted camera above and in front of the hero that eases after him and shakes on hits.
import { THREE, World3D, model, modelClips } from '@core/three';
import { CELL, RAISE, WALL_H, HERO_H, WORLDS, POWER_COLOR, LIGHT_MAX, type WorldLook } from './defs';
import { geo, partGeo, partRest, Merger, place, isKitGeo, HERO, SHADE, WISP } from './kit';
import { Fx } from './fx3d';
import { darkUniforms, darken, POOLS, type DarkUniforms } from './shade';
import { Sim, cellX, cellZ, TRAP_CYCLE, type Foe } from './sim';
import type { Level, Cell } from './levels';

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler(), tc = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** The pack's hero is 285.6 units tall as exported. */
const HERO_SCALE = HERO_H / 285.6;
/** The camera: this far from the hero, this steep, turned this much off the grid. */
export const CAM = { dist: 17.5, pitch: 0.98, yaw: 0.24, fov: 52, lookAhead: -1.4 };
const FLOOR_KIND: Record<string, [string, string]> = { courtyard: ['floor-squares', 'floor-tree'], library: ['floor-large', 'floor-squares'], crypt: ['floor-diamond', 'floor-squares'], cathedral: ['floor-squares', 'floor-diamond'] };
const WALLS: Record<string, [string, number][]> = {
  courtyard: [['wall', 5], ['wall-overgrown', 4], ['wall-broken', 1]],
  library: [['wall', 6], ['wall-bars', 2], ['wall-hole', 1]],
  crypt: [['wall', 5], ['wall-hole', 2], ['wall-bars', 2]],
  cathedral: [['wall', 4], ['wall-broken', 3], ['wall-hole', 2]],
};
const CHUNK = 6;

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

interface FoeView { f: Foe; g: THREE.Group; mixer: THREE.AnimationMixer | null; actions: Map<string, THREE.AnimationAction>; clip: string; eyes: THREE.Mesh | null; mat: THREE.MeshLambertMaterial }

export type CamMode = 'follow' | 'preview' | 'intro';

export class View {
  readonly world: World3D;
  readonly fx: Fx;
  readonly u: DarkUniforms;
  private matFloor: THREE.MeshLambertMaterial;
  private matWall: THREE.MeshLambertMaterial;
  private matProp: THREE.MeshLambertMaterial;
  private matGlow: THREE.MeshBasicMaterial;
  private matFlame: THREE.MeshBasicMaterial;
  private level: Level | null = null;
  private look: WorldLook = WORLDS.courtyard;
  private stage: THREE.Group | null = null;
  private inst = new Map<string, Inst>();
  private hemi: THREE.HemisphereLight;
  private moon: THREE.DirectionalLight;
  private torchLight: THREE.PointLight;
  private pool: THREE.PointLight[] = [];
  private special: THREE.PointLight;
  private lid: THREE.Mesh | null = null;
  private relicGem: THREE.Mesh | null = null;
  private relicT = -1;
  private beam: THREE.Mesh | null = null;
  private foeViews: FoeView[] = [];
  private shared = new Set<THREE.BufferGeometry>();
  private floorIdx: number[] = [];
  private floorAt: { inst: Inst; i: number; x: number; y: number; z: number; rot: number; cell: number }[] = [];
  private fall: Map<number, number> = new Map();
  private ring: THREE.Mesh;
  private arrow: THREE.Mesh;
  // the hero
  readonly hero = new THREE.Group();
  private figure: THREE.Object3D;
  private hand: THREE.Object3D | null = null;
  private torchProp: THREE.Group;
  private torchFlame: THREE.Mesh;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private clip = '';
  private heroMat: THREE.MeshLambertMaterial;
  private blob: THREE.Mesh;
  private squash = 0;
  private yaw = 0;
  private stepT = 0;
  // the camera
  readonly cam = { x: 0, y: 0, z: 0, shake: 0, kick: 0, zoom: 1 };
  /** Store art and tests: a fixed camera [position, look]. */
  shotCam: [number[], number[]] | null = null;
  private time = 0;
  private preT = 0;

  constructor(host: Phaser.Scene, o: { quality?: number } = {}) {
    this.world = new World3D(host, { fov: CAM.fov, background: 0x0c1418, fog: { color: 0x0c1418, near: 20, far: 40 }, shadows: false, quality: o.quality ?? 0.9, far: 80 });
    const w = this.world;
    this.u = darkUniforms();
    this.matFloor = darken(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u);
    this.matWall = darken(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u, true);
    this.matProp = darken(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.u);
    this.matGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.matFlame = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.hemi = new THREE.HemisphereLight(0x9ac0d8, 0x2a3a24, 0.9);
    this.moon = new THREE.DirectionalLight(0xa8c8ff, 0.5);
    this.moon.position.set(-6, 14, -4);
    w.scene.add(this.hemi, this.moon, this.moon.target);
    this.torchLight = new THREE.PointLight(0xffa040, 30, 12, 1.4);
    w.scene.add(this.torchLight);
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa040, 0, 9, 1.5); this.pool.push(l); w.scene.add(l); }
    this.special = new THREE.PointLight(0xffd070, 0, 12, 1.3);
    w.scene.add(this.special);
    this.fx = new Fx(w.scene);
    // the ACT target ring and the compass arrow
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    this.ring.visible = false;
    w.scene.add(this.ring);
    const ag = new THREE.ConeGeometry(0.22, 0.6, 4).rotateX(Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0x8aff6a, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.arrow.visible = false;
    w.scene.add(this.arrow);
    // the hero: the pack's rogue with its own clips, one Lambert material for its colours
    const fig = model(HERO, { shadows: false });
    fig.scale.setScalar(HERO_SCALE);
    this.heroMat = darken(new THREE.MeshLambertMaterial({ vertexColors: true }), this.u);
    fig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = this.heroMat; m.frustumCulled = false; }
      if (o.name === 'FistL' && !this.hand) this.hand = o;
    });
    this.figure = fig;
    this.hero.add(fig);
    this.mixer = new THREE.AnimationMixer(fig);
    for (const c of modelClips(HERO)) {
      const a = this.mixer.clipAction(c);
      if (['Death', 'PickUp', 'Punch', 'Dagger_Attack', 'Dagger_Attack2', 'RecieveHit', 'Roll'].includes(c.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(c.name, a);
    }
    this.play('Idle');
    // the torch in his left hand: the pack's wall torch, its flame lit
    this.torchProp = new THREE.Group();
    const stick = new THREE.Mesh(geo('torch#body'), this.matProp);
    this.torchFlame = new THREE.Mesh(geo('torch#flame'), this.matFlame);
    this.torchFlame.material = this.matFlame;
    this.torchProp.add(stick, this.torchFlame);
    this.torchProp.scale.setScalar(0.58);
    w.scene.add(this.torchProp);
    // a soft round shadow under the feet
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55, fog: false }));
    this.blob.renderOrder = 2;
    w.scene.add(this.blob);
    w.scene.add(this.hero);
  }

  // ---------------------------------------------------------------- building a level

  /** Builds (or rebuilds) the level's meshes; the old ones are freed. */
  build(sim: Sim): void {
    this.clear();
    const L = sim.c;
    this.level = L;
    this.look = WORLDS[L.world];
    const lk = this.look;
    const w = this.world;
    (w.scene.background as THREE.Color).setHex(lk.bg);
    (w.scene.fog as THREE.Fog).color.setHex(lk.bg);
    this.hemi.color.setHex(lk.hemi[0]); this.hemi.groundColor.setHex(lk.hemi[1]); this.hemi.intensity = lk.hemi[2];
    this.moon.color.setHex(lk.moon[0]); this.moon.intensity = lk.moon[1];
    this.torchLight.color.setHex(lk.flame);
    const root = new THREE.Group();
    this.stage = root;
    w.scene.add(root);
    const rnd = mulberry(L.n * 977 + 13);
    const { cols, rows } = L;
    const at = (c: number, r: number): Cell | null => (c >= 0 && r >= 0 && c < cols && r < rows ? L.cells[r * cols + c] : null);
    const isWall = (c: number, r: number) => { const k = at(c, r); return !k || k.k === 'wall'; };
    const fy = (c: number, r: number) => (at(c, r)?.h ?? 0) * RAISE;
    // chunked mergers: walls (cut away near the hero) and low stone (never cut)
    const chunks = new Map<string, { wall: Merger; low: Merger }>();
    const chunk = (c: number, r: number) => {
      const k = Math.floor(c / CHUNK) + ',' + Math.floor(r / CHUNK);
      let ch = chunks.get(k);
      if (!ch) { ch = { wall: new Merger(), low: new Merger() }; chunks.set(k, ch); }
      return ch;
    };
    const wallSet = WALLS[L.world];
    const pickWall = () => { let t = rnd() * wallSet.reduce((s, x) => s + x[1], 0); for (const [id, wgt] of wallSet) { if ((t -= wgt) < 0) return id; } return 'wall'; };
    const sy = WALL_H / 2;
    // walls along every edge between a wall block and a walkable cell
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!isWall(c, r)) continue;
      const ch = chunk(c, r);
      let edge = false;
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
        if (isWall(c + dc, r + dr)) continue;
        edge = true;
        const rot = Math.atan2(dc, dr);
        const id = pickWall();
        ch.wall.add(geo(id), place(cellX(c) + dc * CELL / 2, 0, cellZ(r) + dr * CELL / 2, rot, [1, sy, 1]), lk.wall);
      }
      // the block's top: a dark stone slab (also over blocks only touching floors at a corner)
      let near = edge;
      for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1 && !near; dc++) if (!isWall(c + dc, r + dr)) near = true;
      // the ruin grows over its walls: a bush on the courtyard's, a dead tree on the cathedral's
      if (near && !edge && rnd() < 0.3) {
        if (L.world === 'courtyard') ch.wall.add(geo(rnd() < 0.7 ? 'bush' : 'tree'), place(cellX(c), WALL_H, cellZ(r), rnd() * 6, 0.7 + rnd() * 0.3));
        else if (L.world === 'cathedral' && rnd() < 0.5) ch.wall.add(geo('dead-tree'), place(cellX(c), WALL_H, cellZ(r), rnd() * 6, 0.7));
      } else if (edge && L.world === 'courtyard' && rnd() < 0.12) ch.wall.add(geo('bush'), place(cellX(c), WALL_H - 0.1, cellZ(r), rnd() * 6, 0.75));
      if (near) {
        // the top, and a dark floor inside (seen when the wall is cut away round the hero)
        const x = cellX(c), z = cellZ(r), hh = CELL / 2;
        ch.wall.quad([x - hh, WALL_H, z + hh], [x + hh, WALL_H, z + hh], [x + hh, WALL_H, z - hh], [x - hh, WALL_H, z - hh], lk.cap);
        ch.low.quad([x - hh, 0.01, z + hh], [x + hh, 0.01, z + hh], [x + hh, 0.01, z - hh], [x - hh, 0.01, z - hh], mul(lk.cap, 0.55));
      }
    }
    // columns where wall runs end or turn
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const a = isWall(c - 1, r - 1), b = isWall(c, r - 1), d = isWall(c - 1, r), e = isWall(c, r);
      const n = +a + +b + +d + +e;
      if (n === 0 || n === 4) continue;
      if (n === 2 && ((a && b) || (d && e) || (a && d) || (b && e))) continue;
      const x = cellX(c) - CELL / 2, z = cellZ(r) - CELL / 2;
      chunk(c, r).wall.add(geo('column'), place(x, 0, z, 0, [0.56, (WALL_H + 0.12) / 3.99, 0.56]), lk.wall);
    }
    // the floor: tiles (instanced: any of them may fall in), raised sides, pits, stairs, bridges
    const [tileA, tileB] = FLOOR_KIND[L.world];
    const tiles: { id: string; c: number; r: number; rot: number }[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = at(c, r)!;
      if (cell.k === 'wall') continue;
      const ch = chunk(c, r), h = cell.h * RAISE, x = cellX(c), z = cellZ(r);
      if (cell.k === 'pit' || cell.k === 'trapdoor') this.shaft(ch.low, c, r, at, lk);
      else if (cell.k === 'stairs') ch.low.add(geo('stairs'), place(x, cell.h * RAISE, z, Math.atan2(-cell.sd[0], -cell.sd[1])), lk.floor);
      else if (cell.k === 'bridge') {
        const along = isPitLike(at(c - 1, r)) || isPitLike(at(c + 1, r)) ? 0 : Math.PI / 2;
        ch.low.add(geo('bridge'), place(x, h - 0.33, z, along, [0.8, 1, 0.92]), lk.floor);
        this.shaft(ch.low, c, r, at, lk);
      } else tiles.push({ id: rnd() < 0.18 ? tileB : tileA, c, r, rot: Math.floor(rnd() * 4) * Math.PI / 2 });
      // raised floors: stone sides down to the lower neighbours, balustrades along the drops
      if (cell.h > 0 && cell.k !== 'pit') {
        for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
          const nb = at(c + dc, r + dr);
          if (!nb || nb.k === 'wall') continue;
          const low = nb.k === 'pit' || nb.k === 'trapdoor' ? -0.1 : nb.h * RAISE;
          if (low >= h - 0.01) continue;
          const ex = x + dc * CELL / 2, ez = z + dr * CELL / 2;
          const px = dr !== 0 ? CELL / 2 : 0.08, pz = dc !== 0 ? CELL / 2 : 0.08;
          ch.low.box(ex - px - (dc > 0 ? 0.08 : 0), low, ez - pz - (dr > 0 ? 0.08 : 0), ex + px - (dc < 0 ? 0.08 : 0), h, ez + pz - (dr < 0 ? 0.08 : 0), mul(lk.wall, 0.85), mul(lk.wall, 0.62));
          const nbStairs = nb.k === 'stairs' && nb.sd[0] === -dc && nb.sd[1] === -dr;
          if (!nbStairs && cell.k !== 'stairs' && cell.k !== 'bridge') ch.low.add(geo('rail'), place(x + dc * 0.82, h, z + dr * 0.82, dc !== 0 ? 0 : Math.PI / 2, [1, 0.8, 1]), lk.wall);
        }
      }
      // cart rails: two iron bars on wooden sleepers
      if (cell.rail) {
        const ax = cell.rail === 'x';
        for (let k = -1; k <= 1; k++) {
          const o = k * 0.62;
          if (ax) ch.low.box(x + o - 0.12, h, z - 0.62, x + o + 0.12, h + 0.06, z + 0.62, 0x6a4a30); else ch.low.box(x - 0.62, h, z + o - 0.12, x + 0.62, h + 0.06, z + o + 0.12, 0x6a4a30);
        }
        for (const s of [-0.42, 0.42]) {
          if (ax) ch.low.box(x - CELL / 2, h + 0.06, z + s - 0.05, x + CELL / 2, h + 0.13, z + s + 0.05, 0x55585e, 0x3a3c40); else ch.low.box(x + s - 0.05, h + 0.06, z - CELL / 2, x + s + 0.05, h + 0.13, z + CELL / 2, 0x55585e, 0x3a3c40);
        }
      }
      // pressure plates
      if (cell.plate) {
        ch.low.box(x - 0.78, h, z - 0.78, x + 0.78, h + 0.07, z + 0.78, 0x8a8270, 0x5a5448);
        ch.low.box(x - 0.6, h + 0.07, z - 0.6, x + 0.6, h + 0.09, z + 0.6, 0xc8a050, 0x8a6a30);
      }
      // furniture bookcases against the cell's back
      if (cell.shelf) ch.wall.add(geo('bookcase'), place(x, h, z + 0.15, 0, [0.85, 0.66, 0.9]), 0xffffff);
    }
    // the tiles: instanced per kind (cracked ones darker, with a crack)
    const byKind = new Map<string, typeof tiles>();
    for (const t of tiles) { const l = byKind.get(t.id) ?? []; l.push(t); byKind.set(t.id, l); }
    for (const [id, list] of byKind) {
      const inst = new Inst(root, geo(id), this.matFloor, list.length, true);
      inst.begin();
      for (const t of list) {
        const cell = at(t.c, t.r)!, h = cell.h * RAISE;
        const i = inst.put(cellX(t.c), h - 0.04, cellZ(t.r), 0, t.rot, 0, 1);
        inst.color(i, cell.k === 'cracked' ? mul(lk.floor, 0.62) : lk.floor);
        this.floorAt.push({ inst, i, x: cellX(t.c), y: h - 0.04, z: cellZ(t.r), rot: t.rot, cell: t.r * cols + t.c });
        if (cell.k === 'cracked') chunk(t.c, t.r).low.add(crackGeo(), place(cellX(t.c), h + 0.005, cellZ(t.r), t.rot), 0x1a1410, true);
      }
      inst.end();
      this.inst.set('tile-' + id, inst);
    }
    this.floorIdx = this.floorAt.map((f) => f.cell);
    // doors: an arch round each, the leaves moving
    let nDoor = 0, nLock = 0, nSealed = 0, nShelf = 0, nTrap = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = at(c, r)!;
      const x = cellX(c), z = cellZ(r), h = cell.h * RAISE;
      const rot = isWall(c - 1, r) || isWall(c + 1, r) ? 0 : Math.PI / 2;
      if (cell.k === 'door' || cell.k === 'lock' || cell.k === 'sealed' || cell.k === 'exit') {
        const gothic = cell.k === 'lock' || cell.k === 'exit' || L.world === 'crypt';
        chunk(c, r).wall.add(geo(gothic ? 'arch-gothic' : L.world === 'courtyard' ? 'arch-overgrown' : 'arch'), place(x, h, z, rot, [0.5, 0.52, 0.9]), lk.wall);
        if (cell.k === 'sealed') nSealed++; else if (cell.k === 'door') nDoor++; else nLock++;
      }
      if (cell.k === 'bookcase') nShelf++;
      if (cell.k === 'trapdoor') nTrap++;
    }
    const add = (k: string, g: THREE.BufferGeometry, n: number, mat: THREE.Material = this.matProp, colors = false) => { if (n > 0) this.inst.set(k, new Inst(root, g, mat, n, colors)); };
    add('leafL', geo('doors#left'), nDoor, this.matWall);
    add('leafR', geo('doors#right'), nDoor, this.matWall);
    add('gleafL', geo('doors-gothic#left'), nLock, this.matWall, true);
    add('gleafR', geo('doors-gothic#right'), nLock, this.matWall, true);
    add('sealed', geo('sealed'), nSealed, this.matWall);
    add('shelf', geo('bookcase'), nShelf, this.matWall);
    add('trapdoor', geo('trapdoor'), nTrap);
    // things
    const things = sim.things;
    const count = (k: string) => things.filter((t) => t.kind === k).length;
    for (const t of things) {
      const ch = chunk(t.c, t.r), x = cellX(t.c), z = cellZ(t.r), h = fy(t.c, t.r);
      switch (t.kind) {
        case 'brazier':
          ch.low.add(geo('column-short'), place(x, h, z, 0, [1.3, 0.5, 1.3]), lk.wall);
          bowl(ch.low, x, h + 0.9, z);
          break;
        case 'sconce': case 'puzzle': {
          const [wx, wz] = t.wall;
          ch.wall.add(geo('torch#body'), place(x + wx * 0.86, h + 0.95, z + wz * 0.86, Math.atan2(-wx, -wz), 0.75));
          if (t.kind === 'puzzle') {
            // a rune plaque under it: the sconces that open the sealed door
            const px = x + wx * 0.97, pz = z + wz * 0.97;
            ch.wall.box(px - (wz ? 0.32 : 0.04), h + 0.38, pz - (wx ? 0.32 : 0.04), px + (wz ? 0.32 : 0.04), h + 0.62, pz + (wx ? 0.32 : 0.04), 0x8a60c8, 0x5a3a8a);
          }
          break;
        }
        case 'candles': ch.low.add(geo('candles#body'), place(x, h, z, t.c * 1.3, 1.25)); ch.low.box(x - 0.7, h, z - 0.7, x + 0.7, h + 0.03, z + 0.7, 0x6a5040); break;
        case 'lever':
          ch.low.box(x - 0.34, h, z - 0.26, x + 0.34, h + 0.42, z + 0.26, mul(lk.wall, 0.9), mul(lk.wall, 0.7));
          ch.low.box(x - 0.1, h + 0.42, z - 0.1, x + 0.1, h + 0.5, z + 0.1, 0x3a3c40);
          break;
        case 'relic':
          ch.low.box(x - 0.85, h, z - 0.7, x + 0.85, h + 0.32, z + 0.7, mul(lk.wall, 0.95), mul(lk.wall, 0.7));
          ch.low.add(partGeo('relic', 'base'), place(x, h + 0.32, z, 0, 1));
          break;
      }
    }
    add('flame', flameGeo(), count('brazier') + count('sconce') + count('puzzle') + count('candles') * 5, this.matFlame, true);
    add('glow', new THREE.PlaneGeometry(1, 1), count('brazier') + count('sconce') + count('puzzle') + count('candles') + 4, this.matGlow, true);
    add('handle', leverGeo(), count('lever'));
    add('pot', geo('pot'), count('pot'));
    add('barrel', geo('barrel'), count('barrel'));
    add('shard', geo('pot-broken'), count('pot') + count('barrel'));
    add('trapOpen', geo('beartrap-open'), count('beartrap'));
    add('trapShut', geo('beartrap-closed'), count('beartrap'));
    // the relic's lid and the treasure inside
    const relic = things.find((t) => t.kind === 'relic');
    if (relic) {
      this.lid = new THREE.Mesh(geo('relic#lid'), this.matProp);
      this.lid.matrixAutoUpdate = false;
      root.add(this.lid);
      this.relicGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshLambertMaterial({ color: 0xffd040, emissive: 0xc88a10, emissiveIntensity: 0.9 }));
      this.relicGem.visible = false;
      root.add(this.relicGem);
    }
    // blocks
    add('crate', geo('crate'), sim.blocks.filter((b) => b.kind === 'crate').length);
    add('statue', statueGeo(), sim.blocks.filter((b) => b.kind === 'statue').length);
    add('cart', geo('cart'), sim.blocks.filter((b) => b.kind === 'cart').length);
    // pick-ups (coins from pots included)
    const pots = count('pot') * 3 + count('barrel') * 4;
    add('coin', coinGeo(), sim.picks.filter((p) => p.kind === 'coin').length + pots);
    add('gem', gemGeo(), sim.picks.filter((p) => p.kind === 'gem').length + things.filter((t) => t.gem).length, this.matProp, true);
    add('key', keyGeo(), sim.picks.filter((p) => p.kind === 'key').length);
    for (const p of ['flare', 'oil', 'boots', 'compass', 'ghost'] as const) add('p-' + p, powerGeo(p), sim.picks.filter((x) => x.power === p).length);
    add('orb', new THREE.SphereGeometry(1, 16, 10), sim.picks.filter((x) => x.kind === 'power').length, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, fog: false }), true);
    // escape: falling bricks and their warning rings
    if (L.escape) {
      add('brick', geo('brick'), 12);
      add('warn', new THREE.RingGeometry(0.55, 0.85, 24).rotateX(-Math.PI / 2), 12, new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    }
    // decor: plants, rubble, skulls, banners (never on the way)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = at(c, r)!;
      if (cell.k !== 'floor' || cell.shelf || cell.plate || cell.rail || sim.thingAt(c, r) || sim.blockAt(c, r)) continue;
      if (L.picks.some((p) => p.c === c && p.r === r) || L.foes.some((f) => f.c === c && f.r === r) || (c === L.start[0] && r === L.start[1])) continue;
      const walls: [number, number][] = ([[0, -1], [-1, 0], [1, 0], [0, 1]] as [number, number][]).filter(([dc, dr]) => isWall(c + dc, r + dr));
      if (!walls.length || rnd() > 0.42) continue;
      const [wx, wz] = walls[Math.floor(rnd() * walls.length)];
      const ch = chunk(c, r), x = cellX(c) + wx * 0.72 + (rnd() - 0.5) * (wz ? 1 : 0.2), z = cellZ(r) + wz * 0.72 + (rnd() - 0.5) * (wx ? 1 : 0.2), h = cell.h * RAISE;
      const k = rnd();
      switch (L.world) {
        case 'courtyard': ch.low.add(geo(k < 0.5 ? 'grass' : k < 0.8 ? 'bush' : 'bricks'), place(x, h, z, rnd() * 6, k < 0.5 ? 0.9 : k < 0.8 ? 0.55 : 0.4)); break;
        case 'library': if (k < 0.35) ch.low.add(geo('pot-small'), place(x, h, z, rnd() * 6, 0.9)); else if (k < 0.6) ch.low.add(geo('bricks'), place(x, h, z, rnd() * 6, 0.35)); break;
        case 'crypt': ch.low.add(geo(k < 0.5 ? 'skull' : 'bricks'), place(x, h, z, rnd() * 6, k < 0.5 ? 0.8 : 0.4)); break;
        case 'cathedral': ch.low.add(geo(k < 0.6 ? 'bricks' : 'brick'), place(x, h, z, rnd() * 6, k < 0.6 ? 0.45 : 0.9)); break;
      }
      if (wz === -1 && rnd() < 0.25) ch.wall.add(geo('banner'), place(cellX(c), h + 0.05, cellZ(r) - 0.9, 0, [0.7, 0.62, 0.7]));
    }
    // the merged chunks
    for (const { wall, low } of chunks.values()) {
      if (!wall.empty) root.add(new THREE.Mesh(wall.build(), this.matWall));
      if (!low.empty) root.add(new THREE.Mesh(low.build(), this.matFloor));
    }
    // the void under the ruin
    const voidM = new THREE.Mesh(new THREE.PlaneGeometry(cols * CELL + 40, rows * CELL + 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lk.water ? 0x0a2a3a : 0x000000, fog: false }));
    voidM.position.set((cols - 1) * CELL / 2, lk.water ? -0.6 : -3.6, (rows - 1) * CELL / 2);
    root.add(voidM);
    // the exit's beam (shown once it opens)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beam.position.set(cellX(L.exit[0]), 3.5, cellZ(L.exit[1]));
    root.add(this.beam);
    // creatures
    for (const f of sim.foes) this.foeViews.push(this.makeFoe(f, root));
    this.relicT = -1;
    this.fall.clear();
    this.u.uRRFloor.value = 0.2;
  }

  /** The stone sides of a shaft under a pit (down to the dark), on the edges to firm floor. */
  private shaft(m: Merger, c: number, r: number, at: (c: number, r: number) => Cell | null, lk: WorldLook): void {
    const x = cellX(c), z = cellZ(r), half = CELL / 2;
    const bottom = lk.water ? -0.6 : -3.6;
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]) {
      const nb = at(c + dc, r + dr);
      if (!nb || isPitLike(nb)) continue;
      const top = nb.k === 'wall' ? 0 : nb.h * RAISE;
      const ex = x + dc * half, ez = z + dr * half;
      if (dc) m.box(ex - 0.04, bottom, z - half, ex + 0.04, top - 0.02, z + half, mul(lk.wall, 0.5), mul(lk.wall, 0.42));
      else m.box(x - half, bottom, ez - 0.04, x + half, top - 0.02, ez + 0.04, mul(lk.wall, 0.5), mul(lk.wall, 0.42));
    }
    if (lk.water) m.box(x - half, -0.62, z - half, x + half, -0.56, z + half, 0x123a4a, 0x0a2430);
  }

  private makeFoe(f: Foe, root: THREE.Object3D): FoeView {
    const g = new THREE.Group();
    root.add(g);
    let mixer: THREE.AnimationMixer | null = null, eyes: THREE.Mesh | null = null;
    const actions = new Map<string, THREE.AnimationAction>();
    let mat: THREE.MeshLambertMaterial;
    if (f.kind === 'guardian') {
      mat = darken(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0xd8d4cc }), this.u);
      const body = new THREE.Mesh(statueGeo('stag'), mat);
      g.add(body);
      eyes = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false }));
      const e2 = eyes.clone();
      eyes.position.set(-0.11, 1.62, 0.34); e2.position.set(0.11, 1.62, 0.34);
      eyes.add(e2); e2.position.set(0.22, 0, 0);
      g.add(eyes);
    } else {
      const key = f.kind === 'shade' ? SHADE : WISP;
      const fig = model(key, { shadows: false });
      mat = f.kind === 'shade'
        ? darken(new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a72b0, emissive: 0x1a0a2a }), this.u)
        : new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xc8ffe8, emissive: 0x2a8a70, emissiveIntensity: 0.9, transparent: true, opacity: 0.88 });
      fig.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat; m.frustumCulled = false; this.shared.add(m.geometry); } });
      fig.scale.setScalar(f.kind === 'shade' ? 0.62 : 0.6);
      g.add(fig);
      mixer = new THREE.AnimationMixer(fig);
      for (const c of modelClips(key)) {
        const a = mixer.clipAction(c);
        if (c.name === 'Death' || c.name === 'Bite_Front' || c.name === 'HitRecieve') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        actions.set(c.name, a);
      }
    }
    const v: FoeView = { f, g, mixer, actions, clip: '', eyes, mat };
    playFoe(v, 'Idle');
    return v;
  }

  // ---------------------------------------------------------------- per frame

  private play(name: string, fade = 0.15, speed = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.clip === name) return;
    const prev = this.actions.get(this.clip);
    a.reset().play();
    if (prev) a.crossFadeFrom(prev, fade, false);
    this.clip = name;
  }

  /** Puts the camera and the hero where the sim is (a new level, a respawn). */
  snap(sim: Sim): void {
    const h = sim.hero;
    this.cam.x = h.x; this.cam.y = h.y; this.cam.z = h.z;
    this.yaw = h.yaw;
    this.sync(sim, 0);
  }

  sync(sim: Sim, dt: number, o: { camera?: CamMode; introT?: number } = {}): void {
    this.time += dt;
    const h = sim.hero, L = sim.c;
    const mode = o.camera ?? 'follow';
    this.fx.update(dt);
    // ---- the hero
    this.hero.visible = mode !== 'preview';
    this.hero.position.set(h.x, h.y, h.z);
    let dy = h.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 14);
    this.figure.rotation.y = this.yaw;
    const speed = Math.hypot(h.vx, h.vz);
    if (h.state === 'dead') this.play('Death', 0.2);
    else if (h.state === 'fall') this.play('RecieveHit', 0.1);
    else if (h.state === 'clear') this.play('PickUp', 0.2, 0.8);
    else if (h.roll > 0) this.play('Roll', 0.08, 1.15);
    else if (h.held > 0) this.play('RecieveHit', 0.08, 0.6);
    else if (h.busy > 0 && h.anim) this.play(h.anim === 'pickup' ? 'PickUp' : h.anim === 'punch' ? 'Punch' : h.anim === 'thrust' ? 'Dagger_Attack' : h.anim === 'swing' ? 'Dagger_Attack2' : 'Walk', 0.08, h.anim === 'pull' ? 0.7 : 1.1);
    else if (h.hurt > 1.0 && h.hp > 0) this.play('RecieveHit', 0.06);
    else if (h.pushT > 0.05 || h.glide) this.play('Walk', 0.15, 0.55);
    else if (speed > 3.2) this.play('Run', 0.18, speed / 5.2);
    else if (speed > 0.4) this.play('Walk', 0.18, speed / 2.2);
    else this.play('Idle', 0.25);
    this.mixer.update(dt);
    // squash on stopping short, blink after a hit
    this.squash = Math.max(0, this.squash - dt * 4);
    this.figure.scale.set(HERO_SCALE * (1 + this.squash * 0.1), HERO_SCALE * (1 - this.squash * 0.12), HERO_SCALE * (1 + this.squash * 0.1));
    const ghost = h.powers.ghost > 0;
    const blink = h.hurt > 0 && h.state !== 'dead' && Math.floor(this.time * 14) % 2 === 0;
    this.figure.visible = !blink;
    this.heroMat.transparent = ghost;
    this.heroMat.opacity = ghost ? 0.5 + Math.sin(this.time * 8) * 0.12 : 1;
    this.heroMat.emissive.setHex(h.powers.boots > 0 ? 0x103850 : ghost ? 0x402070 : 0x000000);
    // the torch in the left hand, upright, its flame flickering with the torch's strength
    this.figure.updateMatrixWorld(true);
    const k = h.dark >= 0 ? 0.15 : Math.max(0.2, h.torch / h.tmax);
    if (this.hand) {
      this.hand.getWorldPosition(tv);
      this.torchProp.position.copy(tv).add(new THREE.Vector3(0, -0.12, 0));
    } else this.torchProp.position.set(h.x + 0.25, h.y + 0.7, h.z);
    this.torchProp.rotation.set(0.25 * Math.cos(this.yaw), this.yaw + Math.PI, 0.25 * Math.sin(this.yaw));
    this.torchProp.visible = this.hero.visible && h.state !== 'dead';
    const fl = 0.85 + Math.sin(this.time * 23) * 0.08 + Math.sin(this.time * 37) * 0.06;
    this.torchFlame.scale.set(0.8 + k * 0.4, (0.6 + k * 0.6) * fl, 0.8 + k * 0.4);
    (this.torchFlame.material as THREE.MeshBasicMaterial).color.setHex(this.look.flame);
    this.torchFlame.getWorldPosition(tv);
    const flameY = tv.y + 0.3;
    this.torchLight.position.set(tv.x, flameY, tv.z);
    const lr = sim.lightRadius();
    this.torchLight.intensity = (h.dark >= 0 ? 5 : 14 + 34 * k) * fl * (this.hero.visible ? 1 : 0);
    this.torchLight.distance = lr * 1.6;
    if (dt > 0 && h.state === 'play' && Math.random() < dt * (3 + k * 5)) this.fx.embers(tv.x, flameY, tv.z, 1, this.look.flame);
    // footsteps puff a little dust
    if (speed > 0.5) { this.stepT += dt * speed; if (this.stepT > 1.1) { this.stepT = 0; this.fx.dust(h.x, h.y, h.z, 2, 0x8a8070, 0.8); } }
    this.blob.position.set(h.x, h.y + 0.03, h.z);
    this.blob.visible = this.hero.visible && h.state !== 'fall';
    // ---- the darkness: the hero's light and the lit fires
    this.u.uRRHero.value.set(h.x, h.y + 0.75, h.z);
    this.u.uRRRad.value = mode === 'preview' ? 60 : lr;
    this.u.uRRFloor.value += ((mode === 'preview' ? 1 : sim.flareT > 0 ? 0.6 : 0.2) - this.u.uRRFloor.value) * Math.min(1, dt * 4);
    this.hemi.intensity = this.look.hemi[2] * (mode === 'preview' ? 2.4 : 1);
    this.lights(sim, mode);
    // ---- the level's moving parts
    if (this.level) this.syncLevel(sim, dt);
    // ---- the creatures
    for (const v of this.foeViews) this.syncFoe(v, sim, dt);
    // ---- the camera
    this.camera(sim, dt, mode, o.introT ?? 1);
  }

  /** The hero's light, the four nearest lit fires as point lights, every lit fire as a light pool. */
  private lights(sim: Sim, mode: CamMode): void {
    const h = sim.hero;
    const lit = sim.things.filter((t) => t.on && (t.kind === 'brazier' || t.kind === 'sconce' || t.kind === 'puzzle' || t.kind === 'candles'));
    const d = (t: { c: number; r: number }) => Math.hypot(cellX(t.c) - h.x, cellZ(t.r) - h.z);
    lit.sort((a, b) => d(a) - d(b));
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], t = lit[i];
      if (!t || d(t) > 22) { l.intensity = 0; continue; }
      const p = flamePos(sim, t);
      l.position.set(p[0], p[1] + 0.3, p[2]);
      l.color.setHex(this.look.flame);
      const fl = 0.9 + Math.sin(this.time * 19 + i * 3) * 0.06 + Math.sin(this.time * 31 + i) * 0.05;
      l.intensity = (t.kind === 'brazier' ? 30 : t.kind === 'candles' ? 12 : 20) * fl;
      l.distance = t.kind === 'brazier' ? 10 : 7.5;
    }
    const pools = this.u.uRRPools.value;
    for (let i = 0; i < POOLS; i++) {
      const t = lit[i];
      if (!t) { pools[i].set(0, 0, 0, 0); continue; }
      pools[i].set(cellX(t.c), cellZ(t.r), t.kind === 'brazier' ? 5.2 : t.kind === 'candles' ? 3.2 : 4.2, 1);
    }
    // the special light: a flare, else the open exit, else the relic still waiting
    const s = this.special;
    if (sim.flareT > 0) {
      s.position.set(h.x, h.y + 2.4, h.z); s.color.setHex(0xff7a50); s.intensity = 90 * Math.min(1, sim.flareT); s.distance = 22;
      pools[POOLS - 1].set(h.x, h.z, 13, 1);
    } else if (h.relic) {
      s.position.set(cellX(sim.c.exit[0]), 2.2, cellZ(sim.c.exit[1])); s.color.setHex(0xffd070); s.intensity = 26; s.distance = 9;
      pools[POOLS - 1].set(cellX(sim.c.exit[0]), cellZ(sim.c.exit[1]), 3.6, 1);
    } else {
      s.position.set(cellX(sim.c.relic[0]), 1.6, cellZ(sim.c.relic[1])); s.color.setHex(0xffc850); s.intensity = 10 + Math.sin(this.time * 3) * 3; s.distance = 6;
      pools[POOLS - 1].set(cellX(sim.c.relic[0]), cellZ(sim.c.relic[1]), 2.4, 0.9);
    }
    if (this.relicT >= 0 && this.relicT < 1.6) { s.position.set(cellX(sim.c.relic[0]), 1.8, cellZ(sim.c.relic[1])); s.color.setHex(0xffe090); s.intensity = 120 * (1 - this.relicT / 1.6); s.distance = 16; }
    void mode;
  }

  private syncLevel(sim: Sim, dt: number): void {
    const L = sim.c, lk = this.look;
    const flick = (i: number) => 0.85 + Math.sin(this.time * 21 + i * 1.7) * 0.1 + Math.sin(this.time * 33 + i) * 0.06;
    // floors that fall in (collapsed cells drop away, cracking ones shake)
    for (const f of this.floorAt) {
      const ci = f.cell;
      const crack = sim.crack[ci], gone = sim.collapsed[ci];
      if (crack < 0 && !gone) continue;
      let t = this.fall.get(ci) ?? 0;
      if (gone) { t += dt; this.fall.set(ci, t); }
      const shake = !gone ? Math.sin(this.time * 60 + ci) * 0.03 * Math.min(1, crack * 3) : 0;
      const y = f.y - (gone ? 0.5 * 9.8 * t * t : 0);
      if (y < -8) { tm.makeScale(0, 0, 0); f.inst.mesh.setMatrixAt(f.i, tm); f.inst.mesh.instanceMatrix.needsUpdate = true; continue; }
      tq.setFromEuler(te.set(gone ? t * 1.2 : 0, f.rot, gone ? t * 0.7 : 0));
      tm.compose(tv.set(f.x + shake, y, f.z), tq, ts.set(1, 1, 1));
      f.inst.mesh.setMatrixAt(f.i, tm);
      f.inst.mesh.instanceMatrix.needsUpdate = true;
      if (!gone) f.inst.mesh.setColorAt(f.i, tc.setHex(mul(lk.floor, 0.5 + 0.12 * Math.sin(this.time * 20))));
      if (f.inst.mesh.instanceColor) f.inst.mesh.instanceColor.needsUpdate = true;
    }
    // doors
    const leaves = ['leafL', 'leafR', 'gleafL', 'gleafR', 'sealed', 'shelf', 'trapdoor'].map((k) => this.inst.get(k));
    for (const x of leaves) x?.begin();
    const [lL, lR, gL, gR, sl, sh, tdo] = leaves;
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const cell = L.cells[r * L.cols + c];
      const i = r * L.cols + c, open = sim.open[i];
      const x = cellX(c), z = cellZ(r), h = cell.h * RAISE;
      const wallX = sim.cell(c - 1, r)?.k === 'wall' || sim.cell(c + 1, r)?.k === 'wall';
      const rot = wallX ? 0 : Math.PI / 2;
      const ang = this.doorAngle(i, open, dt);
      if (cell.k === 'door' || cell.k === 'lock' || cell.k === 'exit') {
        const [A, B] = cell.k === 'door' ? [lL, lR] : [gL, gR];
        if (!A || !B) continue;
        const base = place(x, h, z, rot, 0.5);
        const hl = base.clone().multiply(partRest(cell.k === 'door' ? 'doors' : 'doors-gothic', 'left')).multiply(new THREE.Matrix4().makeRotationY(ang));
        const hr = base.clone().multiply(partRest(cell.k === 'door' ? 'doors' : 'doors-gothic', 'right')).multiply(new THREE.Matrix4().makeRotationY(-ang));
        const ia = A.putM(hl), ib = B.putM(hr);
        if (cell.k !== 'door') { const col = cell.k === 'exit' ? (open ? 0xffffff : 0xd8b060) : 0xa0a8b8; A.color(ia, col); B.color(ib, col); }
      } else if (cell.k === 'sealed' && sl) {
        const k = this.doorAngle(i, open, dt) / 1.75;
        sl.putM(place(x, h - k * 1.7, z, rot, [0.5, 0.5, 0.6]));
      } else if (cell.k === 'bookcase' && sh) {
        const k = this.doorAngle(i, open, dt) / 1.75;
        const front = sim.cell(c, r + 1)?.k !== 'wall' ? 0 : Math.PI;
        const sx = wallX ? 1 : 0, sz = wallX ? 0 : 1;
        sh.putM(place(x + sx * k * 1.7, h, z + sz * k * 1.7 + (wallX ? 0 : 0), wallX ? front : front + Math.PI / 2, [0.85, 0.66, 0.9]));
      } else if (cell.k === 'trapdoor' && tdo) {
        const st = sim.trapState(c, r);
        const want = st === 2 ? -1.6 : 0;
        const cur = this.trapAng.get(i) ?? 0;
        const nxt = cur + (want - cur) * Math.min(1, dt * (st === 2 ? 14 : 7));
        this.trapAng.set(i, nxt);
        const jig = st === 1 ? Math.sin(this.time * 50) * 0.04 : 0;
        const m = place(x, h - 0.2, z - 0.88, 0, [1.12, 1.2, 1.12]).multiply(new THREE.Matrix4().makeRotationX(nxt + jig)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.78));
        if (!sim.sunkAt(c, r)) tdo.putM(m);
      }
    }
    for (const x of leaves) x?.end();
    // flames, glows, things
    const flame = this.inst.get('flame'), glow = this.inst.get('glow');
    const handle = this.inst.get('handle'), pot = this.inst.get('pot'), barrel = this.inst.get('barrel'), shard = this.inst.get('shard');
    const tOpen = this.inst.get('trapOpen'), tShut = this.inst.get('trapShut');
    for (const x of [flame, glow, handle, pot, barrel, shard, tOpen, tShut]) x?.begin();
    const camQ = this.world.camera.quaternion;
    let fi = 0;
    for (const t of sim.things) {
      const x = cellX(t.c), z = cellZ(t.r), h = (sim.cell(t.c, t.r)?.h ?? 0) * RAISE;
      fi++;
      switch (t.kind) {
        case 'brazier': case 'sconce': case 'puzzle': {
          if (!t.on) break;
          const p = flamePos(sim, t), f = flick(fi), pop = Math.min(1, t.a * 4);
          const s = (t.kind === 'brazier' ? 1.25 : 0.7) * pop;
          const k = flame?.put(p[0], p[1], p[2], 0, this.time * 2 + fi, 0, new THREE.Vector3(s, s * f * 1.15, s)) ?? -1;
          flame?.color(k, lk.flame);
          if (glow) { tm.compose(tv.set(p[0], p[1] + 0.2, p[2]), camQ, ts.setScalar((t.kind === 'brazier' ? 3.2 : 2.2) * f * pop)); const g = glow.putM(tm); glow.color(g, lk.flame); }
          if (t.kind === 'brazier' && Math.random() < dt * 4) this.fx.embers(p[0], p[1] + 0.3, p[2], 1, lk.flame);
          break;
        }
        case 'candles': {
          if (!t.on) break;
          const left = t.t / sim.tune.candle;
          const g = geo('candles#flame');
          void g;
          const pop = Math.min(1, t.a * 5);
          const k = flame?.put(x, h + 0.62 * 1.25, z, 0, 0, 0, new THREE.Vector3(0.55 * pop, (0.3 + left * 0.5) * flick(fi) * pop, 0.55 * pop)) ?? -1;
          flame?.color(k, left < 0.3 && Math.floor(this.time * 6) % 2 ? 0xff5030 : 0xffc060);
          if (glow) { tm.compose(tv.set(x, h + 0.95, z), camQ, ts.setScalar(1.3 * flick(fi) * pop)); const gi = glow.putM(tm); glow.color(gi, 0xffb050); }
          break;
        }
        case 'lever': handle?.put(x, h + 0.46, z, t.on ? 0.7 : -0.7, 0, 0, 1); break;
        case 'pot': case 'barrel':
          if (!t.on) (t.kind === 'pot' ? pot : barrel)?.put(x, h, z, 0, t.c + t.r, 0, t.kind === 'pot' ? 1.15 : 1.15);
          else shard?.put(x, h, z, 0, t.c * 2.3, 0, t.kind === 'pot' ? 1 : 1.1);
          break;
        case 'beartrap': (t.on ? tShut : tOpen)?.put(x, h + 0.02, z, 0, t.c * 0.7, 0, 0.72); break;
        case 'relic': {
          if (this.lid) {
            const open = t.on ? Math.min(1, t.a * 1.6) : 0;
            const m = place(x, h + 0.32, z, 0, 1).multiply(partRest('relic', 'lid')).multiply(new THREE.Matrix4().makeRotationX(-open * 1.9));
            this.lid.matrix.copy(m); this.lid.matrixWorldNeedsUpdate = true;
            if (t.on && this.relicT < 0) { this.relicT = 0; }
          }
          if (this.relicGem) {
            if (this.relicT >= 0) {
              this.relicT += dt;
              const k = Math.min(1, this.relicT / 1.1);
              this.relicGem.visible = this.relicT < 1.3;
              const hx = sim.hero.x, hz = sim.hero.z;
              this.relicGem.position.set(x + (hx - x) * Math.max(0, k - 0.5) * 2, h + 0.7 + Math.sin(k * Math.PI) * 1.4, z + (hz - z) * Math.max(0, k - 0.5) * 2);
              this.relicGem.rotation.y += dt * 8;
            }
          }
          if (!t.on && glow) { tm.compose(tv.set(x, h + 1.2, z), camQ, ts.setScalar(2.6 + Math.sin(this.time * 2.5) * 0.3)); const gi = glow.putM(tm); glow.color(gi, 0xffc040); }
          break;
        }
      }
    }
    // pressed plates glow
    if (glow) for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const cell = L.cells[r * L.cols + c];
      if (!cell.plate || !sim.blockAt(c, r)) continue;
      tm.compose(tv.set(cellX(c), cell.h * RAISE + 0.4, cellZ(r)), camQ, ts.setScalar(2.4)); const gi = glow.putM(tm); glow.color(gi, 0xc8a050);
    }
    for (const x of [flame, glow, handle, pot, barrel, shard, tOpen, tShut]) x?.end();
    // blocks
    const cr = this.inst.get('crate'), st = this.inst.get('statue'), ca = this.inst.get('cart');
    for (const x of [cr, st, ca]) x?.begin();
    for (const b of sim.blocks) {
      const tilt = b.fall > 0 ? b.fall * 0.5 : 0;
      if (b.kind === 'crate') cr?.put(b.x, b.y + 0.02, b.z, tilt, 0, tilt * 0.6, 1.8);
      else if (b.kind === 'statue') st?.put(b.x, b.y, b.z, tilt, 0, 0, 1);
      else ca?.put(b.x, b.y + 0.05, b.z, 0, sim.cell(b.c, b.r)?.rail === 'z' ? Math.PI / 2 : 0, tilt, 0.55);
    }
    for (const x of [cr, st, ca]) x?.end();
    // pick-ups: they bob and turn
    const kinds = ['coin', 'gem', 'key', 'p-flare', 'p-oil', 'p-boots', 'p-compass', 'p-ghost', 'orb'];
    const pk = new Map(kinds.map((k) => [k, this.inst.get(k)]));
    for (const x of pk.values()) x?.begin();
    for (const p of sim.picks) {
      if (p.taken || p.hidden) continue;
      const bob = p.vy !== 0 ? 0 : 0.45 + Math.sin(this.time * 3 + p.id) * 0.1;
      const y = p.y + bob;
      if (p.kind === 'coin') pk.get('coin')?.put(p.x, y, p.z, 0, this.time * 3 + p.id, 0, 0.5);
      else if (p.kind === 'gem') {
        const g = pk.get('gem'); const i = g?.put(p.x, y + 0.1, p.z, 0, this.time * 2 + p.id, 0, 0.55) ?? -1; g?.color(i, 0x6af0ff);
        if (Math.random() < dt * 1.5) this.fx.spawn(p.x + (Math.random() - 0.5) * 0.5, y + 0.2 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.5, 0, 0.3, 0, 0.06, 0.5, 0xffffff);
      }
      else if (p.kind === 'key') pk.get('key')?.put(p.x, y + 0.1, p.z, 0.3, this.time * 2, 0, 0.6);
      else if (p.kind === 'power') {
        pk.get('p-' + p.power)?.put(p.x, y + 0.15, p.z, 0, this.time * 1.6 + p.id, 0, 0.6);
        const o = pk.get('orb'); const i = o?.put(p.x, y + 0.2, p.z, 0, 0, 0, 0.62 + Math.sin(this.time * 4) * 0.04) ?? -1; o?.color(i, POWER_COLOR[p.power!]);
        if (Math.random() < dt * 2) this.fx.spawn(p.x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.8, 0, 0.5, 0, 0.05, 0.6, POWER_COLOR[p.power!]);
      }
    }
    for (const x of pk.values()) x?.end();
    // escape: bricks dropping and their red rings
    const bk = this.inst.get('brick'), wr = this.inst.get('warn');
    bk?.begin(); wr?.begin();
    for (const b of sim.bricks) {
      if (b.hit) continue;
      const k = b.t / b.dur;
      const [c, r] = sim.cellOf(b.x, b.z);
      const fy = (sim.cell(c, r)?.h ?? 0) * RAISE;
      bk?.put(b.x, fy + 9 * (1 - k * k), b.z, b.t * 4, b.t * 3, 0, 1.3);
      wr?.put(b.x, fy + 0.05, b.z, 0, 0, 0, 0.6 + k * 0.5);
    }
    bk?.end(); wr?.end();
    // the exit's beam once it opens
    if (this.beam) {
      const m = this.beam.material as THREE.MeshBasicMaterial;
      m.opacity += ((sim.hero.relic ? 0.22 + Math.sin(this.time * 3) * 0.05 : 0) - m.opacity) * Math.min(1, dt * 3);
      this.beam.visible = m.opacity > 0.01;
    }
    // the ACT target and the compass
    const tg = sim.hero.state === 'play' || sim.hero.state === 'dark' ? sim.target() : null;
    this.ring.visible = !!tg && tg.kind !== 'grab';
    if (tg) { this.ring.position.set(cellX(tg.c), (sim.cell(tg.c, tg.r)?.h ?? 0) * RAISE + 0.06, cellZ(tg.r)); this.ring.scale.setScalar(1 + Math.sin(this.time * 6) * 0.06); }
    const comp = sim.hero.powers.compass > 0 && sim.hero.state === 'play';
    this.arrow.visible = comp;
    if (comp) {
      const [tc2, tr2] = this.compassTarget(sim);
      const a = Math.atan2(cellX(tc2) - sim.hero.x, cellZ(tr2) - sim.hero.z);
      this.arrow.position.set(sim.hero.x + Math.sin(a) * 1.25, sim.hero.y + 0.12, sim.hero.z + Math.cos(a) * 1.25);
      this.arrow.rotation.set(0, a, 0);
    }
  }

  private doors = new Map<number, number>();
  private trapAng = new Map<number, number>();
  /** Each door eases open (1.75 rad) or shut. */
  private doorAngle(i: number, open: boolean, dt: number): number {
    const cur = this.doors.get(i) ?? (open ? 1.75 : 0);
    const nxt = cur + ((open ? 1.75 : 0) - cur) * Math.min(1, dt * 3.2);
    this.doors.set(i, nxt);
    return nxt;
  }

  /** The compass points at the relic, then at the exit; a gem not yet found when one is close. */
  compassTarget(sim: Sim): [number, number] {
    const h = sim.hero;
    const gem = sim.picks.find((p) => p.kind === 'gem' && !p.taken && !p.hidden && Math.hypot(p.x - h.x, p.z - h.z) < 9);
    if (gem) return sim.cellOf(gem.x, gem.z);
    return h.relic ? sim.c.exit : sim.c.relic;
  }

  private syncFoe(v: FoeView, sim: Sim, dt: number): void {
    const f = v.f;
    v.g.position.set(f.x, f.y, f.z);
    v.g.rotation.y = f.yaw;
    if (f.kind === 'guardian') {
      const moving = f.state === 'move' && f.moving;
      if (v.eyes) v.eyes.visible = f.state === 'move' || f.stun > 0;
      v.g.position.y += moving ? Math.abs(Math.sin(this.time * 9)) * 0.06 : 0;
      v.g.rotation.z = moving ? Math.sin(this.time * 9) * 0.03 : 0;
      if (moving && Math.random() < dt * 6) this.fx.dust(f.x, f.y, f.z, 2, 0x9a9488, 1.2);
      return;
    }
    if (f.stun > 0) playFoe(v, 'HitRecieve', 0.1);
    else if (f.rest > 1.2) playFoe(v, 'Bite_Front', 0.08);
    else if (f.moving) playFoe(v, 'Walk', 0.15, f.state === 'chase' || f.state === 'dive' ? 1.6 : 1);
    else playFoe(v, 'Idle', 0.2);
    v.mixer?.update(dt);
    if (f.kind === 'wisp') {
      v.mat.opacity = f.stun > 0 ? 0.5 : 0.85 + Math.sin(this.time * 7) * 0.08;
      if (Math.random() < dt * 5) this.fx.spawn(f.x, f.y + 0.3, f.z, 0, 0.4, 0, 0.05, 0.6, 0x8affd8, { drag: 1 });
    }
  }

  // ---------------------------------------------------------------- the camera

  private camera(sim: Sim, dt: number, mode: CamMode, introT: number): void {
    const h = sim.hero, c = this.cam, cam = this.world.camera;
    const L = sim.c;
    if (this.shotCam) {
      cam.position.set(this.shotCam[0][0], this.shotCam[0][1], this.shotCam[0][2]);
      cam.lookAt(this.shotCam[1][0], this.shotCam[1][1], this.shotCam[1][2]);
      this.u.uRRCam.value.copy(cam.position);
      return;
    }
    let tx = h.x, ty = h.y, tz = h.z, dist = CAM.dist * c.zoom, yaw = CAM.yaw;
    if (mode === 'preview') {
      // the whole ruin turning slowly
      this.preT += dt;
      tx = (L.cols - 1) * CELL / 2; tz = (L.rows - 1) * CELL / 2 - 1; ty = 0;
      dist = Math.max(L.cols, L.rows * 0.75) * CELL * 1.15 + 6;
      yaw = CAM.yaw + Math.sin(this.preT * 0.25) * 0.35;
    } else if (mode === 'intro') {
      // from the relic down to the hero
      const k = Math.min(1, introT), e = k * k * (3 - 2 * k);
      tx = cellX(L.relic[0]) + (h.x - cellX(L.relic[0])) * e;
      tz = cellZ(L.relic[1]) + (h.z - cellZ(L.relic[1])) * e;
      dist = CAM.dist * (1.35 - 0.35 * e);
    }
    const fog = this.world.scene.fog as THREE.Fog;
    fog.near = dist + 3; fog.far = dist * 2 + 22;
    const ease = mode === 'follow' ? Math.min(1, dt * 5.5) : mode === 'intro' ? 1 : Math.min(1, dt * 2);
    c.x += (tx - c.x) * ease; c.y += (ty - c.y) * ease; c.z += (tz - c.z) * ease;
    c.shake = Math.max(0, c.shake - dt * 2.2);
    const sh = c.shake * c.shake * 0.5;
    const hor = Math.cos(CAM.pitch) * dist, up = Math.sin(CAM.pitch) * dist;
    const lx = c.x + Math.sin(yaw) * CAM.lookAhead, lz = c.z + Math.cos(yaw) * CAM.lookAhead;
    cam.position.set(lx + Math.sin(yaw) * hor + (Math.random() - 0.5) * sh, c.y + up + (Math.random() - 0.5) * sh, lz + Math.cos(yaw) * hor);
    cam.lookAt(lx, c.y + 0.4, lz);
    this.u.uRRCam.value.copy(cam.position);
    this.moon.target.position.set(c.x, 0, c.z);
    this.moon.position.set(c.x - 6, 14, c.z - 4);
  }

  shake(k: number): void { this.cam.shake = Math.min(1.4, this.cam.shake + k); }
  squashOnce(): void { this.squash = 1; }

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
      if (!m.isMesh) return;
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
      if (!cached.has(m.geometry) && !this.shared.has(m.geometry) && !isKitGeo(m.geometry)) m.geometry.dispose();
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).skeleton.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat !== this.matFloor && mat !== this.matWall && mat !== this.matProp && mat !== this.matGlow && mat !== this.matFlame) mat.dispose();
    });
    this.world.scene.remove(this.stage);
    this.stage = null;
    this.inst.clear();
    this.floorAt = [];
    this.floorIdx = [];
    this.fall.clear();
    this.doors.clear();
    this.trapAng.clear();
    for (const v of this.foeViews) v.mixer?.stopAllAction();
    this.foeViews = [];
    this.lid = null; this.relicGem = null; this.beam = null;
    this.fx.clear();
  }

  dispose(): void { this.clear(); }
}

// ------------------------------------------------------------------ helpers

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

const isPitLike = (c: Cell | null): boolean => !!c && (c.k === 'pit' || c.k === 'trapdoor');

/** Where a lit thing's flame burns. */
function flamePos(sim: Sim, t: { kind: string; c: number; r: number; wall: [number, number] }): [number, number, number] {
  const x = cellX(t.c), z = cellZ(t.r), h = (sim.cell(t.c, t.r)?.h ?? 0) * RAISE;
  if (t.kind === 'brazier') return [x, h + 1.12, z];
  if (t.kind === 'candles') return [x, h + 0.75, z];
  return [x + t.wall[0] * 0.72, h + 1.62, z + t.wall[1] * 0.72];
}

function mul(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A brazier's iron bowl on its column. */
function bowl(m: Merger, x: number, y: number, z: number): void {
  const n = 8, r0 = 0.28, r1 = 0.46, hgt = 0.22;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p = (r: number, a: number, yy: number) => [x + Math.cos(a) * r, yy, z + Math.sin(a) * r];
    m.quad(p(r0, a0, y), p(r0, a1, y), p(r1, a1, y + hgt), p(r1, a0, y + hgt), 0x3a3634);
    m.quad(p(r1, a0, y + hgt), p(r1, a1, y + hgt), p(r1 * 0.9, a1, y + hgt), p(r1 * 0.9, a0, y + hgt), 0x5a5450);
  }
  m.box(x - 0.3, y + 0.05, z - 0.3, x + 0.3, y + 0.16, z + 0.3, 0x2a1408);
}

const cached = new WeakSet<THREE.BufferGeometry>();
function keep<T extends THREE.BufferGeometry>(g: T): T { cached.add(g); return g; }
let flameG: THREE.BufferGeometry | null = null, coinG: THREE.BufferGeometry | null = null, gemG: THREE.BufferGeometry | null = null, keyG: THREE.BufferGeometry | null = null, leverG: THREE.BufferGeometry | null = null, crackG: THREE.BufferGeometry | null = null;
const statueGs = new Map<string, THREE.BufferGeometry>();
const powerGs = new Map<string, THREE.BufferGeometry>();

/** A flame: two crossed teardrops (unlit, coloured per instance). */
function flameGeo(): THREE.BufferGeometry {
  if (flameG) return flameG;
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.16, 0.12), new THREE.Vector2(0.14, 0.3), new THREE.Vector2(0.06, 0.5), new THREE.Vector2(0, 0.62)];
  const g = new THREE.LatheGeometry(pts, 6);
  const inner = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * 0.55, p.y * 0.7)), 6);
  const m = new Merger();
  m.add(g, new THREE.Matrix4(), 0xffffff, true);
  m.add(inner, new THREE.Matrix4().makeTranslation(0, 0.02, 0), 0xfff0b0, true);
  g.dispose(); inner.dispose();
  return (flameG = keep(m.build()));
}
function coinGeo(): THREE.BufferGeometry {
  if (coinG) return coinG;
  const m = new Merger();
  const c = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14).rotateX(Math.PI / 2);
  m.add(c, new THREE.Matrix4(), 0xf2c03a, true);
  const s = new THREE.CylinderGeometry(0.26, 0.26, 0.12, 5).rotateX(Math.PI / 2);
  m.add(s, new THREE.Matrix4(), 0xffe27a, true);
  c.dispose(); s.dispose();
  return (coinG = keep(m.build()));
}
function gemGeo(): THREE.BufferGeometry {
  if (gemG) return gemG;
  const g = new THREE.OctahedronGeometry(0.42, 0);
  const m = new Merger();
  m.add(g, new THREE.Matrix4().makeScale(0.8, 1.2, 0.8));
  g.dispose();
  return (gemG = keep(m.build()));
}
function keyGeo(): THREE.BufferGeometry {
  if (keyG) return keyG;
  const m = new Merger();
  const ring = new THREE.TorusGeometry(0.22, 0.07, 6, 12);
  m.add(ring, new THREE.Matrix4().makeTranslation(-0.38, 0, 0), 0xe8b84a, true);
  m.box(-0.18, -0.05, -0.05, 0.42, 0.05, 0.05, 0xe8b84a, 0xb88a2a);
  m.box(0.24, -0.22, -0.05, 0.32, -0.05, 0.05, 0xe8b84a, 0xb88a2a);
  m.box(0.34, -0.18, -0.05, 0.42, -0.05, 0.05, 0xe8b84a, 0xb88a2a);
  ring.dispose();
  return (keyG = keep(m.build()));
}
function leverGeo(): THREE.BufferGeometry {
  if (leverG) return leverG;
  const m = new Merger();
  m.box(-0.05, 0, -0.05, 0.05, 0.75, 0.05, 0x55585e, 0x3a3c40);
  const knob = new THREE.SphereGeometry(0.1, 8, 6);
  m.add(knob, new THREE.Matrix4().makeTranslation(0, 0.8, 0), 0xc83a2a, true);
  knob.dispose();
  return (leverG = keep(m.build()));
}
/** A pushable statue: the pack's fox on a plinth; a guardian: the stag. */
function statueGeo(id: 'fox' | 'stag' = 'fox'): THREE.BufferGeometry {
  let g = statueGs.get(id);
  if (g) return g;
  const m = new Merger();
  if (id === 'fox') {
    m.box(-0.72, 0, -0.72, 0.72, 0.24, 0.72, 0xb8b0a0, 0x8a8478);
    m.add(geo('fox'), place(0, 0.24, 0, 0, 0.42));
  } else m.add(geo('stag'), place(0.2, 0, 0, 0, 0.42));
  g = keep(m.build());
  statueGs.set(id, g);
  return g;
}
/** The cracks drawn over a cracked floor tile. */
function crackGeo(): THREE.BufferGeometry {
  if (crackG) return crackG;
  const m = new Merger();
  const r = mulberry(7);
  for (let k = 0; k < 3; k++) {
    let x = (r() - 0.5) * 0.4, z = (r() - 0.5) * 0.4, a = r() * Math.PI * 2;
    for (let s = 0; s < 4; s++) {
      const l = 0.22 + r() * 0.2, nx = x + Math.cos(a) * l, nz = z + Math.sin(a) * l;
      const px = -Math.sin(a) * 0.025, pz = Math.cos(a) * 0.025;
      m.quad([x - px, 0, z - pz], [x + px, 0, z + pz], [nx + px, 0, nz + pz], [nx - px, 0, nz - pz], 0x1a1410);
      x = nx; z = nz; a += (r() - 0.5) * 1.4;
    }
  }
  return (crackG = keep(m.build()));
}
/** The powers lying in the ruin: a flare, a flask of oil, boots, a compass, a ghostly lantern. */
function powerGeo(p: string): THREE.BufferGeometry {
  let g = powerGs.get(p);
  if (g) return g;
  const m = new Merger();
  const cyl = (r: number, h: number, y: number, c: number, seg = 8) => { const x = new THREE.CylinderGeometry(r, r, h, seg); m.add(x, new THREE.Matrix4().makeTranslation(0, y, 0), c, true); x.dispose(); };
  switch (p) {
    case 'flare': cyl(0.09, 0.7, 0, 0xc8302a); cyl(0.12, 0.12, 0.38, 0xffd040); break;
    case 'oil': m.add(geo('pot-small'), place(0, -0.32, 0, 0, 1)); cyl(0.07, 0.14, 0.38, 0x8a5a2a); break;
    case 'boots':
      for (const sx of [-0.16, 0.16]) { m.box(sx - 0.1, -0.3, -0.1, sx + 0.1, 0.12, 0.1, 0x2a7ab0, 0x1a5a8a); m.box(sx - 0.1, -0.3, 0.1, sx + 0.1, -0.16, 0.3, 0x2a7ab0, 0x1a5a8a); }
      break;
    case 'compass': {
      const d = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16).rotateX(Math.PI / 2);
      m.add(d, new THREE.Matrix4(), 0xe0b040, true); d.dispose();
      m.box(-0.04, -0.02, 0.04, 0.04, 0.26, 0.07, 0xe03a2a); m.box(-0.04, -0.26, 0.04, 0.04, 0.02, 0.07, 0xf0f0e8);
      break;
    }
    case 'ghost': {
      const s = new THREE.SphereGeometry(0.3, 10, 8);
      m.add(s, new THREE.Matrix4(), 0xe8e0ff, true); s.dispose();
      m.box(-0.13, 0.02, 0.24, -0.05, 0.12, 0.3, 0x3a2a5a); m.box(0.05, 0.02, 0.24, 0.13, 0.12, 0.3, 0x3a2a5a);
      break;
    }
  }
  g = keep(m.build());
  powerGs.set(p, g);
  return g;
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

/** A soft glow for flames and the relic (additive, coloured per instance). */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

void UP; void LIGHT_MAX; void TRAP_CYCLE;
