// Monster Roundup: the 3D view. It reads the sim and draws:
//   - the station: floor tiles (edge tiles with the trim toward the walls), walls with windows to
//     space on the far side, door frames, columns in the corners, pipes, furniture, crate stacks,
//     containment pods, terminals, teleporter pads, vents, the exit lift and the boss's field, all in
//     the sector's palette and merged into a few chunks. The walls nearest the camera (a room's south
//     side) are low sills under low roof caps, so nothing hides the floor; the far walls stand tall;
//   - what moves: doors (they sink into the floor), laser gates and sweeping turrets with their beams,
//     conveyor chevrons, snacks, crates, powers on the floor, the pods' and the exit's rings;
//   - the mech in its paint (its own clips; the upper body shoots and grabs while the legs walk), the
//     monsters (wander, hop, leap, run, eat, punch, throw, puff spores, fall dizzy with stars round
//     their heads, ride the tractor beam, shrink into a pod; evolved ones glow over a spinning ring),
//     the bosses (crowned, an aura ring, each attack with its own clip and a red telegraph on the floor);
//   - bolts, pellets, plasma balls, shells, Leela's beam, spikes, orbs, lobs, shock rings and pulses,
//     spore clouds, ice, the tow beams, the shield, the decoy, particles;
//   - a camera from behind and above (the far side up the screen) that follows the mech and frames a
//     boss with it; a slow pan for the map, a swoop for the level's start, a close turntable for the
//     hangar and the bay's lineup for the mech select (a row in landscape, a podium in portrait).
// The game is adaptive: portrait sees a narrower slice, so its camera stands further back.
import { THREE, World3D } from '@core/three';
import { BLOCK, WALL_H, SECTORS, MONSTERS, BOSSES, MECHS, POWER_COLOR, EVOLVED, PAINTS, SHELL_R, type SectorId, type MechId, type PowerId, type PaintId } from './defs';
import { piece, Merger, place, isKitGeo } from './kit';
import { Figure, restBox } from './figure';
import { Fx } from './fx3d';
import { Sim, POD_R, FIELD_R, BEAM, VOLLEY_GAP, type Mon } from './sim';
import { solidBlock, charAt, type Level } from './levels';
import { powerTexture, starTexture, glowTexture, crownTexture } from './art';

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler(), tc = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Height of the low roof caps and sills on a room's camera side. */
const LOW = 1.05;
/** Solid blocks drawn round the map so the screen never shows the void. */
const MARGIN = 5;
const CHUNK = 6;

export const CAM = { pitch: 0.74, fov: 42, distLand: 19.5, distPort: 26 };

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
  put(x: number, y: number, z: number, ry: number, s: number | THREE.Vector3, rx = 0, rz = 0): number {
    if (this.n >= this.mesh.instanceMatrix.count) return -1;
    tq.setFromEuler(te.set(rx, ry, rz, 'YXZ'));
    if (typeof s === 'number') ts.set(s, s, s); else ts.copy(s);
    tm.compose(tv.set(x, y, z), tq, ts);
    this.mesh.setMatrixAt(this.n, tm);
    return this.n++;
  }
  color(i: number, c: number, k = 1): void { if (i >= 0) this.mesh.setColorAt(i, tc.setHex(c).multiplyScalar(k)); }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface MonFig { fig: Figure; file: string; key: string; scale: number; lift: number; boss: boolean }

export type CamMode = 'follow' | 'preview' | 'intro' | 'hangar' | 'select';

export class View {
  readonly world: World3D;
  readonly fx: Fx;
  private mat: THREE.MeshLambertMaterial;
  private matAdd: THREE.MeshBasicMaterial;
  private matAddInst: THREE.MeshBasicMaterial;
  private matShadow: THREE.MeshBasicMaterial;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private stage: THREE.Group | null = null;
  private owned = new Set<THREE.BufferGeometry>();
  private ownedMats = new Set<THREE.Material>();
  private level: Level | null = null;
  private sector: SectorId = 'lab';
  // the mech
  private mechFig: Figure | null = null;
  private mechId: MechId = 'mike';
  private mechDead = false;
  // monsters
  private figs = new Map<number, MonFig>();
  // dynamic props
  private doorLeaves: THREE.Mesh[] = [];
  private doorLights: THREE.Mesh[] = [];
  private doorBars: THREE.Mesh[] = [];
  private laserBeams: THREE.Mesh[] = [];
  private turretHeads: THREE.Mesh[] = [];
  private turretBeams: THREE.Mesh[] = [];
  private crates: THREE.Mesh[] = [];
  private podRings: THREE.Mesh[] = [];
  private exitRing: THREE.Mesh | null = null;
  private exitBeam: THREE.Mesh | null = null;
  private fieldRing: THREE.Mesh | null = null;
  private teleRings: THREE.Mesh[] = [];
  private termRing: THREE.Mesh | null = null;
  private pickupSprites: THREE.Sprite[] = [];
  private snackInst: Inst | null = null;
  private chevrons: Inst | null = null;
  // effects
  private bolts: Inst;
  private spikes: Inst;
  private orbs: Inst;
  private discs: Inst;
  private rings: Inst;
  private lines: Inst;
  private shadows: Inst;
  private stars: THREE.Sprite[] = [];
  private crowns: THREE.Sprite[] = [];
  private clouds: Inst;
  /** The hangar and the select bay: the level's monsters are not drawn. */
  private hideMons = false;
  private paintHue = -1;
  /** The next follow frame jumps to its target (after a snap). */
  private snapNext = false;
  private beams: THREE.Mesh[] = [];
  private shield: THREE.Mesh;
  private magnet: THREE.Mesh;
  private decoy: THREE.Mesh;
  private chargeRing: THREE.Mesh;
  private lockRing: THREE.Mesh;
  private iceDiscs: Inst;
  // the camera
  readonly cam = { x: 0, z: 0, shake: 0, look: new THREE.Vector3(), pos: new THREE.Vector3() };
  /** Store art and tests: a fixed camera [position, look]. */
  shotCam: [number[], number[]] | null = null;
  private time = 0;
  private land: boolean;
  private preT = 0;
  /** Where the mech stands in the hangar view: open floor a little north of the start. */
  private spot = { x: 0, z: 0 };

  constructor(host: Phaser.Scene, o: { quality?: number } = {}) {
    this.land = host.scale.width > host.scale.height;
    this.world = new World3D(host, { fov: CAM.fov, background: 0x0a0e18, fog: { color: 0x0a0e18, near: 60, far: 140 }, shadows: false, quality: o.quality ?? 0.9, near: 0.5, far: 400 });
    const w = this.world;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.matAdd = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.matAddInst = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.matShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, map: glowTexture() });
    this.hemi = new THREE.HemisphereLight(0xf0f4ff, 0x5a6070, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
    this.sun.position.set(-16, 30, 34);
    this.fill = new THREE.DirectionalLight(0xb8ccff, 0.95);
    this.fill.position.set(24, 14, 6);
    w.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.fx = new Fx(w.scene);
    // pools
    const sphere = new THREE.IcosahedronGeometry(1, 1);
    this.bolts = new Inst(w.scene, sphere, this.matAddInst, 60, true);
    const cone = new THREE.ConeGeometry(0.22, 0.9, 5);
    cone.rotateX(Math.PI / 2);
    this.spikes = new Inst(w.scene, cone, new THREE.MeshLambertMaterial({ color: 0x8ae05a, emissive: 0x2a6a1a }), 60);
    this.orbs = new Inst(w.scene, sphere, this.matAddInst, 60, true);
    const disc = new THREE.CircleGeometry(1, 40);
    disc.rotateX(-Math.PI / 2);
    this.discs = new Inst(w.scene, disc, this.matAddInst, 40, true);
    const ring = new THREE.RingGeometry(0.86, 1, 48);
    ring.rotateX(-Math.PI / 2);
    this.rings = new Inst(w.scene, ring, this.matAddInst, 60, true);
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    plane.translate(0, 0, 0.5);
    this.lines = new Inst(w.scene, plane, this.matAddInst, 20, true);
    const sh = new THREE.PlaneGeometry(2, 2);
    sh.rotateX(-Math.PI / 2);
    this.shadows = new Inst(w.scene, sh, this.matShadow, 50);
    this.iceDiscs = new Inst(w.scene, disc, new THREE.MeshBasicMaterial({ color: 0xc8ecff, transparent: true, opacity: 0.5, depthWrite: false }), 20);
    this.clouds = new Inst(w.scene, new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false, fog: false }), 60, true);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: crownTexture(), depthWrite: false, fog: false }));
      c.visible = false;
      w.scene.add(c);
      this.crowns.push(c);
    }
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), depthWrite: false, fog: false }));
      s.scale.setScalar(0.42);
      s.visible = false;
      w.scene.add(s);
      this.stars.push(s);
    }
    const cyl = new THREE.CylinderGeometry(0.16, 0.34, 1, 10, 1, true);
    cyl.translate(0, 0.5, 0);
    cyl.rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(cyl, this.matAdd.clone());
      b.visible = false;
      w.scene.add(b);
      this.beams.push(b);
    }
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 16), new THREE.MeshBasicMaterial({ color: 0x4ab8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shield.visible = false;
    this.magnet = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: POWER_COLOR.magnet, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.magnet.rotation.x = Math.PI / 2;
    this.magnet.visible = false;
    this.decoy = new THREE.Mesh(piece('Props_Vessel_Tall', null), this.mat);
    this.decoy.scale.setScalar(1.6);
    this.decoy.visible = false;
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.12, 40, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.visible = false;
    this.lockRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 4, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.lockRing.rotation.x = -Math.PI / 2;
    this.lockRing.visible = false;
    w.scene.add(this.shield, this.magnet, this.decoy, this.chargeRing, this.lockRing);
  }

  // ---------------------------------------------------------------- the level

  private own<T extends THREE.BufferGeometry>(g: T): T { this.owned.add(g); return g; }

  /** Throws away the previous level's objects and builds this one's. */
  build(s: Sim): void {
    this.clearStage();
    // the select bay's lineup never outlives the bay (a level started from the select: tests, store art)
    this.clearLineup();
    const L = s.c;
    this.level = L;
    this.sector = L.sector;
    const look = SECTORS[L.sector];
    const w = this.world;
    (w.scene.background as THREE.Color).setHex(look.sky);
    (w.scene.fog as THREE.Fog).color.setHex(look.sky);
    this.hemi.color.setHex(look.hemi[0]); this.hemi.groundColor.setHex(look.hemi[1]); this.hemi.intensity = look.hemi[2] * 0.8;
    this.sun.color.setHex(look.sun[0]); this.sun.intensity = look.sun[1] * 1.2;
    const stage = new THREE.Group();
    this.stage = stage;
    w.scene.add(stage);
    this.buildStatic(L, stage);
    this.spot = { x: L.start.x, z: L.start.z };
    for (const dz of [8, 4]) if (!solidBlock(L, Math.floor(L.start.x / BLOCK), Math.floor((L.start.z - dz) / BLOCK)) && !solidBlock(L, Math.floor(L.start.x / BLOCK), Math.floor((L.start.z - dz + 4) / BLOCK))) { this.spot = { x: L.start.x, z: L.start.z - dz }; break; }
    this.buildDynamic(s, stage);
    for (const f of this.figs.values()) f.fig.dispose();
    this.figs.clear();
    this.setMech(s.mech.id, true);
    this.mechDead = false;
  }

  private clearStage(): void {
    if (!this.stage) return;
    this.world.scene.remove(this.stage);
    for (const g of this.owned) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.owned.clear();
    this.ownedMats.clear();
    this.stage.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !isKitGeo(m.geometry) && !(o as THREE.Sprite).isSprite) m.geometry.dispose(); });
    this.stage = null;
    this.doorLeaves = []; this.doorLights = []; this.doorBars = []; this.laserBeams = []; this.turretHeads = []; this.turretBeams = []; this.crates = [];
    this.podRings = []; this.exitRing = null; this.exitBeam = null; this.fieldRing = null; this.teleRings = []; this.termRing = null; this.pickupSprites = [];
    this.snackInst = null; this.chevrons = null;
  }

  private buildStatic(L: Level, stage: THREE.Group): void {
    const S = L.sector, look = SECTORS[S];
    const chunks = new Map<string, Merger>();
    const mg = (x: number, z: number): Merger => {
      const k = Math.floor(x / (CHUNK * BLOCK)) + ',' + Math.floor(z / (CHUNK * BLOCK));
      let m = chunks.get(k);
      if (!m) { m = new Merger(); chunks.set(k, m); }
      return m;
    };
    let seed = L.n * 131 + 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const solid = (c: number, r: number) => solidBlock(L, c, r);
    const floorAt = (c: number, r: number) => !solid(c, r);
    // a low cap where a room lies just north (its camera-side sill)
    // (two rows deep: the lower camera looks over them into the room)
    const lowCap = (c: number, r: number) => [1, 2].some((k) => floorAt(c, r - k) || floorAt(c - 1, r - k) || floorAt(c + 1, r - k));
    const capCol = look.cap, trim = look.accent, stepCol = look.cap;
    const panelCol = new THREE.Color(capCol).lerp(new THREE.Color(look.dark), 0.4).getHex();
    for (let r = -MARGIN; r < L.rows + MARGIN; r++) for (let c = -MARGIN; c < L.cols + MARGIN; c++) {
      const x0 = c * BLOCK, z0 = r * BLOCK, x1 = x0 + BLOCK, z1 = z0 + BLOCK, cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
      const M = mg(cx, cz);
      if (solid(c, r)) {
        const low = lowCap(c, r);
        const h = low ? LOW : WALL_H + 0.03;
        M.box(x0, 0, z0, x1, h, z1, capCol, 't');
        // a roof panel on every cap (so the solid blocks read as roof, not as holes), now and then a vent
        // grille or a light strip in the sector's colour
        M.box(x0 + 0.3, h, z0 + 0.3, x1 - 0.3, h + 0.04, z1 - 0.3, panelCol, 't');
        const q = rnd();
        if (q < 0.22) for (let k = 0; k < 4; k++) M.box(x0 + 0.9, h + 0.04, z0 + 0.9 + k * 0.6, x1 - 0.9, h + 0.07, z0 + 1.15 + k * 0.6, capCol, 't');
        else if (q < 0.34) M.box(x0 + 0.7, h + 0.04, cz - 0.12, x1 - 0.7, h + 0.07, cz + 0.12, trim, 't');
        // the sill's trim along a room's edge
        if (floorAt(c, r - 1)) { M.box(x0, LOW, z0 - 0.02, x1, LOW + 0.06, z0 + 0.35, trim, 't'); M.box(x0, 0, z0 - 0.02, x1, LOW, z0, look.main, 'n'); }
        // a step from a tall cap down to a low one (seen from the camera's side)
        if (!low) {
          if (solid(c, r + 1) && lowCap(c, r + 1)) M.box(x0, LOW, z1 - 0.01, x1, h, z1, stepCol, 's');
          if (solid(c - 1, r) && lowCap(c - 1, r)) M.box(x0, LOW, z0, x0 + 0.01, h, z1, stepCol, 'w');
          if (solid(c + 1, r) && lowCap(c + 1, r)) M.box(x1 - 0.01, LOW, z0, x1, h, z1, stepCol, 'e');
        }
        continue;
      }
      // the floor: four tiles, edge tiles with their trim toward the walls
      const ch = charAt(L, c, r);
      const ice = ch === 'i';
      const belt = '<>^v'.includes(ch);
      const N = solid(c, r - 1), Sx = solid(c, r + 1), W = solid(c - 1, r), E = solid(c + 1, r);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const tx = x0 + 1 + i * 2, tz = z0 + 1 + j * 2;
        const edges: string[] = [];
        if (j === 0 && N) edges.push('n');
        if (j === 1 && Sx) edges.push('s');
        if (i === 0 && W) edges.push('w');
        if (i === 1 && E) edges.push('e');
        const [name, rot] = tileFor(edges, rnd);
        M.add(piece(belt ? 'FloorTile_Basic' : name, S, ice ? 1.05 : belt ? 0.42 : 0.8), place(tx, 0, tz, belt ? 0 : rot), ice ? 0xbfe4ff : undefined);
      }
      // walls: tall on the far (north) and the side edges, a low sill on the near (south) edge
      const wallTint = 1;
      if (N) {
        const north = ['Wall_1', 'Wall_2', 'Wall_3', 'Wall_4', 'Wall_5', 'Window_Wall_SideA', 'LongWindow_Wall_SideA', 'SmallWindows_Wall_SideA', 'ThreeWindows_Wall_SideA', 'Window_Wall_SideA'];
        const name = north[Math.floor(rnd() * north.length)];
        M.add(piece(name, S, wallTint), place(cx, 0, z0 - 0.27, 0));
        if (rnd() < 0.45) M.add(piece('Pipes', S), place(cx, 0, z0 - 0.27, 0));
      }
      const side = ['Wall_1', 'Wall_3', 'Wall_4', 'Wall_5', 'Wall_Empty', 'Wall_2'];
      if (W) M.add(piece(side[Math.floor(rnd() * side.length)], S, 0.94), place(x0 - 0.27, 0, cz, Math.PI / 2));
      if (E) M.add(piece(side[Math.floor(rnd() * side.length)], S, 0.94), place(x1 + 0.27, 0, cz, -Math.PI / 2));
      // columns where a tall wall turns a corner
      if (N && W) M.add(piece('Column_2', S), place(x0 + 0.05, 0, z0 + 0.05, 0));
      if (N && E) M.add(piece('Column_2', S), place(x1 - 0.05, 0, z0 + 0.05, 0));
      if (Sx && W) M.add(piece('Column_1', S), place(x0 + 0.05, 0, z1 - 0.05, 0, [1, 0.24, 1]));
      if (Sx && E) M.add(piece('Column_1', S), place(x1 - 0.05, 0, z1 - 0.05, 0, [1, 0.24, 1]));
      // what stands in the block
      switch (ch) {
        case 'C': M.add(piece('Props_Base', S), place(cx, 0, cz, 0, 1.25)); M.add(piece('Props_Pod', S), place(cx, 0.3, cz, Math.PI)); break;
        case 'K': M.add(piece('Props_Computer', S), place(cx, 0, cz, 0, 1.2)); break;
        case 'r': M.add(piece('Props_Base', S), place(cx, 0, cz, 0, 0.95)); break;
        case 't': M.add(piece('Props_Teleporter_1', S), place(cx, 0, cz, 0, 1.4)); break;
        case 'E': M.add(piece('Props_Base', S), place(cx, 0, cz, 0, 1.3)); M.add(piece('Props_Teleporter_2', S), place(cx, 0.3, cz, 0, 1.5)); break;
        case 'F':
          M.add(piece('Props_Base', S), place(cx, 0, cz, 0, 2.6));
          for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; M.add(piece('Column_Slim', S), place(cx + Math.sin(a) * (FIELD_R + 0.5), 0, cz + Math.cos(a) * (FIELD_R + 0.5), a, [1, 0.55, 1])); }
          break;
        case 'o': M.add(piece('Details_Vent_1', S), new THREE.Matrix4().compose(tv.set(cx, 0.08, cz), tq.setFromEuler(te.set(-Math.PI / 2, 0, 0)), ts.set(4.2, 4.2, 4.2))); break;
        case 'c': M.add(piece('Props_Chest', S), place(cx, 0, cz, 0, 1.2)); break;
        case '+':
          M.add(piece('Props_Shelf_Tall', S), place(cx - 0.6, 0, cz, Math.PI / 2, 1.05));
          M.add(piece('Props_ContainerFull', S), place(cx + 0.55, 0, cz - 0.4, 0.2, 1.3));
          M.add(piece('Props_Crate', S), place(cx + 0.6, 0, cz + 0.6, 0.5, 1.4));
          M.add(piece('Props_CrateLong', S), place(cx + 0.5, 0.75, cz - 0.4, 0.1, 1.2));
          break;
      }
    }
    // furniture
    for (const d of L.decor) {
      const M = mg(d.x, d.z);
      switch (d.kind) {
        case 'shelf': M.add(piece('Props_Shelf', S), place(d.x, 0, d.z, d.rot, 1.15)); break;
        case 'computer': M.add(piece('Props_ComputerSmall', S), place(d.x, 0, d.z, d.rot, 1.3)); break;
        case 'capsule': M.add(piece('Props_Capsule', S), place(d.x, 0, d.z, d.rot, 1.35)); break;
        case 'container': M.add(piece('Props_ContainerFull', S), place(d.x, 0, d.z, d.rot + 0.3, 1.35)); break;
        case 'vessels':
          M.add(piece('Props_Vessel_Tall', S), place(d.x - 0.3, 0, d.z, 0, 1.4));
          M.add(piece('Props_Vessel', S), place(d.x + 0.3, 0, d.z - 0.1, 0, 1.4));
          M.add(piece('Props_Vessel_Short', S), place(d.x, 0, d.z + 0.35, 0, 1.4));
          break;
        case 'crates':
          M.add(piece('Props_Crate', S), place(d.x - 0.35, 0, d.z, 0.2, 1.2));
          M.add(piece('Props_Crate', S), place(d.x + 0.45, 0, d.z + 0.2, -0.3, 1.1));
          M.add(piece('Props_Crate', S), place(d.x, 0.95, d.z + 0.05, 0.6, 1.0));
          break;
      }
    }
    // doors: the frame (static) across the passage
    for (const d of L.doors) mg(d.x, d.z).add(piece('DoorDouble_Wall_SideA', S), place(d.x, 0, d.z, d.axis === 'x' ? Math.PI / 2 : 0));
    // laser gates: a slim post at each end of the beam
    for (const l of L.lasers) {
      const h = BLOCK / 2 - 0.35;
      const ends = l.axis === 'x' ? [[l.x, l.z - h], [l.x, l.z + h]] : [[l.x - h, l.z], [l.x + h, l.z]];
      for (const [x, z] of ends) mg(x, z).add(piece('Column_Slim', S), place(x, 0, z, l.axis === 'x' ? 0 : Math.PI / 2, [1, 0.5, 1]));
    }
    for (const m of chunks.values()) {
      if (m.empty) continue;
      const mesh = new THREE.Mesh(this.own(m.build()), this.mat);
      stage.add(mesh);
    }
  }

  private buildDynamic(s: Sim, stage: THREE.Group): void {
    const L = s.c, S = L.sector, look = SECTORS[S];
    const add = (o: THREE.Object3D) => { stage.add(o); return o; };
    const ringGeo = this.own(new THREE.RingGeometry(0.88, 1, 56));
    ringGeo.rotateX(-Math.PI / 2);
    const discGeo = this.own(new THREE.CircleGeometry(1, 48));
    discGeo.rotateX(-Math.PI / 2);
    const glowMat = (c: number, o = 0.7) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); this.ownedMats.add(m); return m; };
    // doors: the leaf sinks into the floor; a light over it says locked or open
    for (const d of L.doors) {
      const leaf = new THREE.Mesh(piece('Door_Double', S), this.mat);
      leaf.position.set(d.x, 0, d.z);
      leaf.rotation.y = d.axis === 'x' ? Math.PI / 2 : 0;
      // a door across an east-west corridor is seen edge-on from the camera: a thicker leaf, so its
      // lit top reads as a bar across the passage
      if (d.axis === 'x') leaf.scale.set(1.45, 1, 2.4);
      add(leaf);
      this.doorLeaves.push(leaf);
      // a light bar along the leaf's top in the door's state colour (it sinks with the leaf)
      const bar = new THREE.Mesh(this.own(new THREE.BoxGeometry(2.7, 0.16, 0.5)), glowMat(0xff3a3a, 0.95));
      bar.position.set(0, 2.86, -0.41);
      leaf.add(bar);
      this.doorBars.push(bar);
      const light = new THREE.Mesh(this.own(new THREE.BoxGeometry(d.axis === 'x' ? 1.6 : 3.6, 0.04, d.axis === 'x' ? 3.6 : 1.6)), glowMat(0xff3a3a, 0.3));
      light.position.set(d.x, 0.12, d.z);
      add(light);
      this.doorLights.push(light);
    }
    // laser gates
    for (const l of L.lasers) {
      const len = BLOCK - 0.6;
      const b = new THREE.Mesh(this.own(new THREE.BoxGeometry(l.axis === 'x' ? 0.12 : len, 1, l.axis === 'x' ? len : 0.12)), glowMat(0xff2a3a, 0.85));
      b.position.set(l.x, 0, l.z);
      add(b);
      this.laserBeams.push(b);
    }
    // sweeping turrets: the gun turns on its base, its beam reaches the nearest wall
    for (const t of L.turrets) {
      const head = new THREE.Mesh(piece('Props_Laser', S), this.mat);
      head.position.set(t.x, 0.3, t.z);
      head.scale.setScalar(0.9);
      add(head);
      this.turretHeads.push(head);
      const g = this.own(new THREE.BoxGeometry(0.16, 0.16, 1));
      g.translate(0, 0, 0.5);
      const beam = new THREE.Mesh(g, glowMat(0xff3a6a, 0.9));
      beam.position.set(t.x, 0.95, t.z);
      add(beam);
      this.turretBeams.push(beam);
    }
    // crates
    for (const c of L.crates) {
      const m = new THREE.Mesh(piece('Props_Crate', S), this.mat);
      m.position.set(c.x, 0, c.z);
      m.scale.setScalar(1.3);
      m.rotation.y = (c.x * 7 + c.z * 3) % 1;
      add(m);
      this.crates.push(m);
    }
    // the pods' capture rings, the exit, the field, the teleporters, the terminal's ring
    for (const p of L.pods) {
      const r = new THREE.Mesh(ringGeo, glowMat(look.glow, 0.8));
      r.position.set(p.x, 0.12, p.z);
      r.scale.setScalar(POD_R);
      add(r);
      this.podRings.push(r);
    }
    if (L.exit) {
      this.exitRing = add(new THREE.Mesh(ringGeo, glowMat(0xff4a4a, 0.8))) as THREE.Mesh;
      this.exitRing.position.set(L.exit.x, 0.45, L.exit.z);
      this.exitRing.scale.setScalar(1.6);
      const bg = this.own(new THREE.CylinderGeometry(1.1, 1.3, 7, 20, 1, true));
      bg.translate(0, 3.5, 0);
      this.exitBeam = add(new THREE.Mesh(bg, glowMat(0x5aff9a, 0.25))) as THREE.Mesh;
      this.exitBeam.position.set(L.exit.x, 0.4, L.exit.z);
    }
    if (L.field) {
      this.fieldRing = add(new THREE.Mesh(ringGeo, glowMat(look.glow, 0.85))) as THREE.Mesh;
      this.fieldRing.position.set(L.field.x, 0.9, L.field.z);
      this.fieldRing.scale.setScalar(FIELD_R);
    }
    for (const t of L.teles) {
      const r = add(new THREE.Mesh(ringGeo, glowMat(0x7ad8ff, 0.8))) as THREE.Mesh;
      r.position.set(t.x, 1.0, t.z);
      r.scale.setScalar(1.0);
      this.teleRings.push(r);
    }
    if (L.terminals.length) {
      this.termRing = add(new THREE.Mesh(discGeo, glowMat(0xff7a3a, 0.5))) as THREE.Mesh;
      this.termRing.position.set(L.terminals[0].x, 0.11, L.terminals[0].z + 1.4);
      this.termRing.scale.setScalar(0.01);
    }
    // powers on the floor (and in crates and chests): their icon on a badge
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: powerTexture('freeze'), depthWrite: false, fog: false }));
      sp.scale.setScalar(1.25);
      sp.visible = false;
      add(sp);
      this.pickupSprites.push(sp);
    }
    // snacks: three glowing cells each
    this.snackInst = new Inst(stage, piece('Props_Vessel_Short', S, 1.25), this.mat, Math.max(1, L.snacks.length * 3));
    // conveyor chevrons
    if (L.conveyors.length) {
      const g = this.own(new THREE.PlaneGeometry(0.9, 0.5));
      g.rotateX(-Math.PI / 2);
      const pos = g.getAttribute('position');
      // a chevron: fold the far edge's middle forward
      for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0) pos.setZ(i, pos.getZ(i) + (Math.abs(pos.getX(i)) < 0.1 ? -0.4 : 0));
      this.chevrons = new Inst(stage, g, glowMat(look.accent, 0.3), L.conveyors.length * 16);
    }
  }

  // ---------------------------------------------------------------- figures

  /** Puts the chosen mech in the level (the hangar swaps it). */
  setMech(id: MechId, force = false, paint?: PaintId): void {
    if (paint) this.paintHue = PAINTS[paint].hue;
    if (this.mechFig && this.mechId === id && !force) { this.mechFig.setPaint(this.paintHue); return; }
    const old = this.mechFig;
    this.mechId = id;
    this.mechFig = new Figure(id, MECHS[id].height, { layered: true, paintable: true });
    this.mechFig.setPaint(this.paintHue);
    this.world.scene.add(this.mechFig.root);
    this.mechFig.play('Idle');
    if (old) { this.mechFig.root.position.copy(old.root.position); this.mechFig.root.rotation.y = old.root.rotation.y; old.dispose(); }
  }

  // ---------------------------------------------------------------- the select bay's lineup

  private line: { figs: Figure[]; ids: MechId[]; sel: number; t: number; px: number[]; pz: number[]; turn: number[] } | null = null;

  /**
   * Where a lineup mech stands: landscape, a row across the bay's middle (the chosen one a step
   * forward); portrait (narrow), a podium: the chosen one in front, the other three in a row behind.
   */
  private linePos(i: number, sel = this.line?.sel ?? 0): [number, number] {
    if (this.land) return [this.spot.x + (i - 1.5) * 4.6, this.spot.z - 2 + (i === sel ? 1.4 : 0)];
    if (i === sel) return [this.spot.x, this.spot.z + 1.2];
    const k = [0, 1, 2, 3].filter((q) => q !== sel).indexOf(i);
    return [this.spot.x + (k - 1) * 3.4, this.spot.z - 3.2];
  }

  /** The four mechs side by side in the bay; `sel` steps forward and waves. Paints as given. */
  setLineup(ids: readonly MechId[], sel: number, hues: number[]): void {
    if (!this.line) {
      const figs = ids.map((id) => {
        const f = new Figure(id, MECHS[id].height, { paintable: true });
        this.world.scene.add(f.root);
        f.play('Idle', { speed: 0.8 + Math.random() * 0.4 });
        return f;
      });
      this.line = { figs, ids: [...ids], sel: -1, t: 0, px: ids.map((_, i) => this.linePos(i, sel)[0]), pz: ids.map((_, i) => this.linePos(i, sel)[1]), turn: ids.map(() => 0) };
    }
    const L = this.line;
    L.figs.forEach((f, i) => f.setPaint(hues[i] ?? -1));
    if (sel !== L.sel) {
      L.sel = sel;
      L.t = 0;
      const f = L.figs[sel];
      f.play(f.has('Hello') ? 'Hello' : 'Yes', { once: true, restart: true, fade: 0.12 });
    }
  }

  /** The figure of a lineup mech (a cheer when the run starts). */
  lineupCheer(): void { const L = this.line; if (L) L.figs[L.sel].play('Yes', { once: true, restart: true }); }

  clearLineup(): void {
    if (!this.line) return;
    for (const f of this.line.figs) f.dispose();
    this.line = null;
  }

  /** Screen points of each lineup mech's chest (the select screen's tap areas). */
  lineupScreen(): { x: number; y: number; r: number }[] {
    if (!this.line) return [];
    return this.line.figs.map((_, i) => {
      const [x, z] = this.linePos(i);
      const p = this.screen(x, MECHS[this.line!.ids[i]].height * 0.5, z);
      const q = this.screen(x, MECHS[this.line!.ids[i]].height, z);
      return { x: p.x, y: p.y, r: Math.max(50, Math.abs(p.y - q.y) * 1.2) };
    });
  }

  private syncLineup(dt: number): void {
    const L = this.line;
    if (!L) return;
    L.t += dt;
    L.figs.forEach((f, i) => {
      const on = i === L.sel;
      const [tx, tz] = this.linePos(i);
      const k = Math.min(1, dt * 7);
      L.px[i] += (tx - L.px[i]) * k; L.pz[i] += (tz - L.pz[i]) * k;
      const x = L.px[i], z = L.pz[i];
      // the chosen one faces the camera; the others turn a little toward it
      const want = on ? 0 : Math.atan2(L.px[L.sel] - x, 8) * 0.8;
      L.turn[i] += (want - L.turn[i]) * Math.min(1, dt * 6);
      f.root.position.set(x, 0, z);
      f.root.rotation.y = L.turn[i];
      // after the wave, back to idle
      if (on && L.t > 1.6 && f.name !== 'Idle') f.play('Idle', { fade: 0.3 });
      if (!on && f.name !== 'Idle') f.play('Idle', { fade: 0.3 });
      f.setGlowRGB(on ? 0.05 : 0, on ? 0.05 : 0, on ? 0.06 : 0);
      f.update(dt);
      this.shadows.put(x, 0.1, z, 0, 1.4);
      if (on) {
        const c = MECHS[L.ids[i]].color;
        const r = this.rings.put(x, 0.15, z, L.t * 1.5, 1.9 + Math.sin(L.t * 4) * 0.06);
        this.rings.color(r, c, 1);
        const r2 = this.rings.put(x, 0.14, z, -L.t, 2.4);
        this.rings.color(r2, 0x7af0e0, 0.5);
        const d = this.discs.put(x, 0.12, z, 0, 2.2);
        this.discs.color(d, c, 0.18);
      }
    });
  }

  private monFig(m: Mon): MonFig {
    let f = this.figs.get(m.i);
    const def = m.def;
    const file = m.boss ? m.boss : def!.model;
    const key = file + (m.small ? 's' : '') + (m.evolved ? 'e' : '');
    if (f && f.key === key) return f;
    if (f) f.fig.dispose();
    const h = m.boss ? BOSSES[m.boss].height : def!.height * (m.small ? 0.7 : 1) * (m.evolved ? EVOLVED.size : 1);
    const fig = new Figure(file, h);
    this.world.scene.add(fig.root);
    fig.play('Idle');
    f = { fig, file, key, scale: 1, lift: 0, boss: !!m.boss };
    this.figs.set(m.i, f);
    return f;
  }

  // ---------------------------------------------------------------- per frame

  /** Every moving thing placed from the sim; the camera set for `mode`. */
  sync(s: Sim, dt: number, o: { camera?: CamMode; introT?: number } = {}): void {
    this.time += dt;
    const L = s.c, look = SECTORS[L.sector], v = s.mech, t = this.time;
    // ---- the mech
    const mf = this.mechFig!;
    const hangar = o.camera === 'hangar' || o.camera === 'select';
    this.hideMons = hangar;
    mf.root.visible = o.camera !== 'select';
    mf.root.position.set(hangar ? this.spot.x : v.x, 0, hangar ? this.spot.z : v.z);
    // the hangar: a turntable facing the camera
    mf.root.rotation.y = o.camera === 'hangar' ? Math.sin(t * 0.6) * 0.7 : v.yaw;
    if (v.state === 'dead') {
      if (!this.mechDead) { this.mechDead = true; mf.play('Death', { once: true, fade: 0.1 }); }
    } else {
      this.mechDead = false;
      if (v.state === 'clear') mf.play(mf.has('Dance') ? 'Dance' : 'Hello');
      else if (o.camera === 'hangar' || o.camera === 'preview') mf.play('Idle');
      else if (v.speed > 0.6) {
        const run = v.sprint && v.speed > 5;
        mf.play(run ? 'Run' : 'Walk', { speed: run ? Math.min(1.6, v.speed / 7.2) : Math.min(1.5, Math.max(0.6, v.speed / 3.6)) });
      } else mf.play('Idle');
      if (v.hitT > 0.35) mf.overlay('HitRecieve_1', 0.4);
      if (v.grabT > 0.45) mf.overlay('Pickup', 0.45, { speed: 1.6 });
      else if (v.shootT > 0.3) mf.overlay('Shoot', 0.32, { speed: 1.8, restart: true });
    }
    if (o.camera !== 'select') mf.root.visible = !(v.safe > 0 && v.safe < 1.0 && v.state === 'play' && Math.floor(t * 14) % 2 === 0);
    mf.setGlowRGB(v.charge > 0.1 ? 0.08 * Math.min(1, v.charge / s.chargeTime) : 0, v.charge > 0.1 ? 0.06 * Math.min(1, v.charge / s.chargeTime) : 0, 0);
    mf.update(dt);
    // charge ring under the mech, lock marker on the target
    const ck = v.charge > 0.12 ? Math.min(1, v.charge / s.chargeTime) : 0;
    this.chargeRing.visible = ck > 0;
    if (ck > 0) {
      this.chargeRing.position.set(v.x, 0.14, v.z);
      this.chargeRing.scale.setScalar(1.2 + (ck >= 1 ? Math.sin(t * 20) * 0.05 : 0));
      (this.chargeRing.material as THREE.MeshBasicMaterial).color.setHex(ck >= 1 ? 0xffe060 : 0x5ad8ff);
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + ck * 0.6;
      const g = this.chargeRing.geometry as THREE.RingGeometry;
      if (Math.abs((g.parameters.thetaLength ?? 0) - Math.PI * 2 * ck) > 0.15) {
        this.chargeRing.geometry.dispose();
        this.chargeRing.geometry = new THREE.RingGeometry(0.9, 1.12, 40, 1, Math.PI / 2, Math.max(0.05, Math.PI * 2 * ck));
      }
    }
    this.lockRing.visible = !!v.lock && v.state === 'play';
    if (v.lock) { this.lockRing.position.set(v.lock.x, 0.16, v.lock.z); this.lockRing.scale.setScalar(v.lock.radius + 0.7); this.lockRing.rotation.z = t * 2; }
    // powers round the mech
    this.shield.visible = v.active.shield > 0 && (v.active.shield > 2 || Math.floor(t * 8) % 2 === 0);
    if (this.shield.visible) { this.shield.position.set(v.x, 1.3, v.z); this.shield.scale.setScalar(1 + Math.sin(t * 6) * 0.03); }
    this.magnet.visible = v.active.magnet > 0;
    if (this.magnet.visible) { this.magnet.position.set(v.x, 0.3, v.z); this.magnet.scale.setScalar(1 + ((t * 0.8) % 1) * 4.5); (this.magnet.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - ((t * 0.8) % 1)); }
    this.decoy.visible = !!v.decoy && v.active.decoy > 0;
    if (v.decoy) { this.decoy.position.set(v.decoy.x, Math.abs(Math.sin(t * 5)) * 0.25, v.decoy.z); this.decoy.rotation.y = t * 2; }
    // thrusters while sprinting
    if (v.sprint && v.speed > 4 && Math.random() < 0.6) this.fx.flame(v.x - Math.sin(v.yaw) * 0.7, 1.1, v.z - Math.cos(v.yaw) * 0.7, -Math.sin(v.yaw) * 3, 0.5, -Math.cos(v.yaw) * 3, 1, [0x8ae8ff, 0xffffff, 0x4ab8ff], 0.16);

    // ---- monsters and the boss
    this.shadows.begin();
    if (o.camera !== 'select') this.shadows.put(v.x, 0.1, v.z, 0, 1.3);
    const seen = new Set<number>();
    let starN = 0, crownN = 0;
    this.discs.begin(); this.rings.begin(); this.lines.begin(); this.iceDiscs.begin();
    for (const m of s.mons) {
      if (m.state === 'gone') continue;
      seen.add(m.i);
      const f = this.monFig(m);
      this.placeMon(m, f, s, dt);
      if (this.hideMons) continue;
      if (m.state !== 'captured' && m.state !== 'vent') this.shadows.put(m.x, 0.1, m.z, 0, m.radius * 1.45 * (m.y > 0.5 ? Math.max(0.5, 1 - m.y / 6) : 1));
      // a boss: a crown over its head and a pulsing aura ring in its colour
      if (m.boss && m.state !== 'captured' && crownN < this.crowns.length) {
        const c = this.crowns[crownN++];
        c.visible = true;
        const bob = Math.sin(t * 2.4) * 0.15;
        c.position.set(m.x, m.y + m.height * 1.06 + bob, m.z);
        c.scale.setScalar(2.2);
        const col = BOSSES[m.boss].color;
        for (let k = 0; k < 2; k++) {
          const ph = (t * 0.7 + k * 0.5) % 1;
          const r = this.rings.put(m.x, 0.16, m.z, t * (k ? -1 : 1), m.radius * (1.25 + ph * 0.9));
          this.rings.color(r, col, 0.9 * (1 - ph));
        }
      }
      // evolved: a spinning orange ring
      if (m.evolved && s.loose(m)) {
        const r = this.rings.put(m.x, 0.15, m.z, t * 3, m.radius + 0.45 + Math.sin(t * 6) * 0.06);
        this.rings.color(r, 0xff9a2a, 0.95);
      }
      // dizzy stars
      if ((m.state === 'dizzy' || m.state === 'towed' || m.state === 'b-daze') && starN < this.stars.length - 3) {
        // (drawn below the boss's crown)
        const top = m.state === 'towed' ? m.y + m.height * 0.9 : m.boss ? m.height * 0.55 : m.y + m.height * 0.75;
        for (let k = 0; k < 3; k++) {
          const sp = this.stars[starN++];
          const a = t * 4 + (k / 3) * Math.PI * 2;
          sp.visible = true;
          const rr = m.radius * 0.8 + 0.2;
          sp.position.set(m.x + Math.cos(a) * rr, top + Math.sin(a * 2) * 0.08, m.z + Math.sin(a) * rr);
          sp.scale.setScalar(m.boss ? 0.7 : 0.42);
        }
      }
    }
    for (let k = starN; k < this.stars.length; k++) this.stars[k].visible = false;
    for (let k = crownN; k < this.crowns.length; k++) this.crowns[k].visible = false;
    this.syncLineup(dt);
    for (const [i, f] of this.figs) if (!seen.has(i)) { f.fig.dispose(); this.figs.delete(i); }

    // ---- tow beams
    for (let k = 0; k < this.beams.length; k++) {
      const b = this.beams[k], m = v.towing[k];
      b.visible = !!m;
      if (!m) continue;
      const fx = v.x - Math.sin(v.yaw) * 0.3, fy = 1.6, fz = v.z - Math.cos(v.yaw) * 0.3;
      const tx = m.x, ty = m.y + m.height * 0.45, tz = m.z;
      const prev = k === 0 ? null : v.towing[k - 1];
      const ax = prev ? prev.x : fx, ay = prev ? prev.y + prev.height * 0.45 : fy, az = prev ? prev.z : fz;
      b.position.set(ax, ay, az);
      b.lookAt(tx, ty, tz);
      b.scale.set(1, 1, Math.hypot(tx - ax, ty - ay, tz - az));
      (b.material as THREE.MeshBasicMaterial).color.setHex(look.glow);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 18 + k) * 0.12;
      if (Math.random() < 0.3) { const q = Math.random(); this.fx.spawn(ax + (tx - ax) * q, ay + (ty - ay) * q, az + (tz - az) * q, 0, 0.4, 0, 0.07, 0.4, look.glow, { drag: 2 }); }
    }

    // ---- bolts, enemy shots, lobs, waves, telegraphs, ice
    this.bolts.begin();
    for (const b of s.bolts) {
      const plasma = b.kind === 'plasma', pellet = b.kind === 'pellet';
      const size = b.charged ? 0.42 : plasma ? 0.46 + Math.sin(t * 30) * 0.04 : pellet ? 0.17 : 0.24;
      const c1 = b.charged ? 0xffd23a : plasma ? 0x8aff6a : pellet ? 0xffb03a : 0x5ae8ff;
      const c2 = b.charged ? 0xff8a1a : plasma ? 0x2ab85a : pellet ? 0xff6a1a : 0x2a8aff;
      const i = this.bolts.put(b.x, 1.45, b.z, 0, size);
      this.bolts.color(i, c1, 1.1);
      const j = this.bolts.put(b.x - b.vx * 0.012, 1.45, b.z - b.vz * 0.012, 0, size * 0.72);
      this.bolts.color(j, c2, 0.7);
      if (plasma && Math.random() < 0.5) this.fx.spawn(b.x, 1.45, b.z, 0, 0.3, 0, 0.12, 0.3, 0x8aff6a, { drag: 3 });
    }
    // George's shells: a glowing ball on its arc, the landing ring under it
    for (const sh of s.shells) {
      const k = sh.t / sh.total;
      const x = sh.fx + (sh.x - sh.fx) * k, z = sh.fz + (sh.z - sh.fz) * k, y = 1.6 + Math.sin(k * Math.PI) * 4;
      const i = this.bolts.put(x, y, z, 0, 0.6);
      this.bolts.color(i, 0xb8ff7a, 1.2);
      const r = this.rings.put(sh.x, 0.15, sh.z, -t * 3, SHELL_R);
      this.rings.color(r, 0x8aff6a, 0.5 + 0.5 * k);
      const d = this.discs.put(sh.x, 0.13, sh.z, 0, SHELL_R * k);
      this.discs.color(d, 0x3ad85a, 0.25);
    }
    this.bolts.end();
    // Leela's beam
    for (const ln of s.lances) {
      const len = Math.hypot(ln.bx - ln.ax, ln.bz - ln.az), yaw = Math.atan2(ln.bx - ln.ax, ln.bz - ln.az), k = ln.t / 0.3;
      const i = this.lines.put(ln.ax, 1.45, ln.az, yaw, new THREE.Vector3(0.9 * k + 0.2, 1, len));
      this.lines.color(i, 0xfff0ff, 1.6 * k);
      const j = this.lines.put(ln.ax, 1.42, ln.az, yaw, new THREE.Vector3(2.2 * k, 1, len));
      this.lines.color(j, 0xd07aff, 0.9 * k);
    }
    // spore clouds: a soft green dome of puffs
    this.clouds.begin();
    for (const c of s.clouds) {
      const life = Math.min(1, c.t / 0.6, (c.max - c.t) / 0.4 + 0.2);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + t * 0.4, rr = k === 0 ? 0 : c.r * 0.55;
        const i = this.clouds.put(c.x + Math.cos(a) * rr, 0.6 + Math.sin(t * 2 + k) * 0.12, c.z + Math.sin(a) * rr, 0, new THREE.Vector3(c.r * 0.62 * life, c.r * 0.32 * life, c.r * 0.62 * life));
        this.clouds.color(i, k % 2 ? 0xb8f07a : 0x9ad84a, 1);
      }
      if (Math.random() < 0.3) this.fx.spawn(c.x + (Math.random() - 0.5) * c.r * 1.6, 0.3, c.z + (Math.random() - 0.5) * c.r * 1.6, 0, 0.8, 0, 0.14, 1, 0xc8ff8a, { drag: 1 });
      const r = this.rings.put(c.x, 0.14, c.z, t, c.r);
      this.rings.color(r, 0xa8ff5a, 0.55 * life);
    }
    this.clouds.end();
    this.spikes.begin(); this.orbs.begin();
    for (const sh of s.shots) {
      if (sh.kind === 'spike') this.spikes.put(sh.x, sh.y, sh.z, Math.atan2(sh.vx, sh.vz), 1.2);
      else { const i = this.orbs.put(sh.x, sh.y, sh.z, 0, 0.36 + Math.sin(t * 20) * 0.04); this.orbs.color(i, 0xc07aff, 1); }
    }
    this.spikes.end();
    for (const l of s.lobs) {
      const k = l.t / l.total;
      const x = l.fx + (l.x - l.fx) * k, z = l.fz + (l.z - l.fz) * k, y = 2 + Math.sin(k * Math.PI) * 5;
      const i = this.orbs.put(x, y, z, 0, 0.55);
      this.orbs.color(i, l.kind === 'ice' ? 0xc8f0ff : 0xc07aff, 1);
      const d = this.discs.put(l.x, 0.13, l.z, 0, 1.8 * (0.4 + 0.6 * k));
      this.discs.color(d, 0xff3a2a, 0.25 + 0.3 * k);
      const r = this.rings.put(l.x, 0.14, l.z, 0, 1.8);
      this.rings.color(r, 0xff5a3a, 0.9);
    }
    this.orbs.end();
    for (const w of s.waves) {
      const i = this.rings.put(w.x, 0.2, w.z, 0, w.r);
      this.rings.color(i, w.color === 'freeze' ? 0x9af0ff : w.color === 'pulse' ? 0xffd23a : 0xff6a3a, 1 - w.r / w.max);
    }
    for (const p of s.ice) this.iceDiscs.put(p.x, 0.09, p.z, 0, p.r * Math.min(1, p.t * 2));
    for (const m of s.mons) {
      if (this.hideMons) continue;
      // the spore cloud's reach grows under the monster; the lobber's orb marks the mech before it flies
      if (m.state === 'windup' && m.act === 'spore') {
        const k = Math.min(1, m.t / s.windupTime(m));
        const r = this.rings.put(m.x, 0.15, m.z, t * 2, 3.4 * (m.evolved ? 1.35 : 1) * (0.3 + 0.7 * k));
        this.rings.color(r, 0xa8ff5a, 0.6 + 0.4 * k);
      }
      if (m.state === 'windup' && m.act === 'lob') {
        const k = Math.min(1, m.t / s.windupTime(m));
        const r = this.rings.put(v.x, 0.15, v.z, -t * 3, 1.8 * (1.6 - 0.6 * k));
        this.rings.color(r, 0xff5a3a, 0.4 + 0.5 * k);
      }
      if (m.state === 'windup' && !m.boss && m.act === 'bite') {
        const k = m.t / s.windupTime(m);
        const i = this.discs.put(m.x, 0.13, m.z, 0, (m.radius + 1.1) * Math.min(1, k));
        this.discs.color(i, 0xff2a1a, 0.35 + 0.3 * k);
      }
      // a dizzy monster's clock ring (and green when the beam can reach it)
      if (m.state === 'dizzy' && !m.boss) {
        const k = m.dizzy / m.dizzyMax;
        const near = Math.hypot(m.x - v.x, m.z - v.z) - m.radius < s.grabR;
        const i = this.rings.put(m.x, 0.15, m.z, t * 2, (m.radius + 0.5) * (0.5 + 0.5 * k));
        this.rings.color(i, near ? 0x6aff8a : k < 0.3 ? 0xff5a3a : 0xffe060, 0.9);
      }
      if (m.boss) this.bossTelegraph(m, s, t);
      if (m.boss && m.state === 'dizzy') {
        const k = m.dizzy / m.dizzyMax;
        const i = this.rings.put(m.x, 0.15, m.z, 0, (m.radius + 0.8) * (0.5 + 0.5 * k));
        this.rings.color(i, k < 0.3 ? 0xff5a3a : 0x6aff8a, 0.9);
      }
    }
    // the terminal's progress
    if (this.termRing) { const k = s.unlocked ? 0 : Math.min(1, v.term / 1.1); this.termRing.scale.setScalar(0.2 + k * 1.3); this.termRing.visible = k > 0.02; }
    this.discs.end(); this.rings.end(); this.lines.end(); this.iceDiscs.end();

    // ---- the station's moving parts
    s.c.doors.forEach((d, i) => {
      const st = s.doors[i];
      const leaf = this.doorLeaves[i];
      leaf.position.y = -2.85 * st.open;
      leaf.visible = st.open < 0.99;
      const col = st.locked ? 0xff3a3a : st.open > 0.5 ? 0x5aff8a : 0xffc23a;
      (this.doorLights[i].material as THREE.MeshBasicMaterial).color.setHex(col);
      (this.doorBars[i].material as THREE.MeshBasicMaterial).color.setHex(col);
      (this.doorLights[i].material as THREE.MeshBasicMaterial).opacity = st.locked ? 0.35 + 0.15 * Math.sin(t * 5) : 0.3;
    });
    s.c.lasers.forEach((l, i) => {
      const on = s.laserOn(i);
      const T = s.tune.laserOn + s.tune.laserOff, ph = (s.clock + i * 0.9) % T;
      const soon = !on && T - ph < 0.6;
      const b = this.laserBeams[i];
      b.visible = on || (soon && Math.floor(t * 16) % 2 === 0);
      b.scale.y = on ? 1 : 0.15;
      b.position.y = on ? 1.0 + Math.sin(t * 30) * 0.02 : 0.9;
      (b.material as THREE.MeshBasicMaterial).opacity = on ? 0.85 : 0.5;
      if (on && Math.random() < 0.15) this.fx.spawn(l.x + (Math.random() - 0.5) * (l.axis === 'x' ? 0.2 : 3.2), 0.4 + Math.random() * 1.2, l.z + (Math.random() - 0.5) * (l.axis === 'x' ? 3.2 : 0.2), 0, 0.5, 0, 0.06, 0.3, 0xff6a5a, {});
    });
    s.c.turrets.forEach((tt, i) => {
      const a = s.turretA[i];
      this.turretHeads[i].rotation.y = a - Math.PI / 2;
      const [ex, ez] = s.turretEnd(i);
      const bm = this.turretBeams[i];
      bm.rotation.y = a;
      bm.scale.set(1 + Math.sin(t * 40) * 0.2, 1, Math.hypot(ex - tt.x, ez - tt.z));
      if (Math.random() < 0.3) this.fx.sparks(ex, 0.95, ez, 1, [0xff5a8a, 0xffffff], 2, 2, 0.06);
    });
    this.crates.forEach((m, i) => { m.visible = !s.crates[i].broken; });
    for (const r of this.podRings) {
      const towing = v.towing.length > 0;
      const fl = Math.max(0, (r.userData.flash ?? 0) - dt);
      r.userData.flash = fl;
      r.scale.setScalar(POD_R * (1 + (towing ? Math.sin(t * 8) * 0.06 : 0) + fl * 0.8));
      (r.material as THREE.MeshBasicMaterial).opacity = fl > 0 ? 1 : towing ? 0.95 : 0.55 + Math.sin(t * 2) * 0.1;
      r.rotation.y = t * (0.6 + fl * 12);
    }
    if (this.fieldRing) {
      const b = s.boss;
      const hot = !!b && (b.state === 'towed' || b.state === 'dizzy');
      const fl = Math.max(0, (this.fieldRing.userData.flash ?? 0) - dt);
      this.fieldRing.userData.flash = fl;
      this.fieldRing.scale.setScalar(FIELD_R * (1 + Math.sin(t * (hot ? 9 : 2)) * 0.04 + fl * 0.6));
      (this.fieldRing.material as THREE.MeshBasicMaterial).opacity = hot ? 1 : 0.5;
      this.fieldRing.rotation.y = t * 0.8;
      if (hot && Math.random() < 0.5) { const a = Math.random() * Math.PI * 2; this.fx.spawn(s.c.field!.x + Math.cos(a) * FIELD_R, 0.9, s.c.field!.z + Math.sin(a) * FIELD_R, 0, 2.5, 0, 0.1, 0.8, look.glow, { drag: 1 }); }
    }
    if (this.exitRing && this.exitBeam) {
      (this.exitRing.material as THREE.MeshBasicMaterial).color.setHex(s.exitOpen ? 0x5aff9a : 0xff4a4a);
      this.exitRing.rotation.y = t;
      this.exitBeam.visible = s.exitOpen;
      (this.exitBeam.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 5) * 0.07;
    }
    for (const r of this.teleRings) { r.rotation.y = t * 1.5; r.position.y = 1.0 + Math.sin(t * 3) * 0.1; }
    // powers on the floor
    let pi = 0;
    for (const p of s.pickups) {
      if (!p.on || pi >= this.pickupSprites.length) continue;
      const sp = this.pickupSprites[pi++];
      sp.visible = true;
      const tex = powerTexture(p.id);
      if (sp.material.map !== tex) { sp.material.map = tex; sp.material.needsUpdate = true; }
      sp.position.set(p.x, 1.2 + Math.sin(t * 3 + p.x) * 0.15, p.z);
    }
    for (; pi < this.pickupSprites.length; pi++) this.pickupSprites[pi].visible = false;
    if (this.snackInst) {
      this.snackInst.begin();
      for (const sn of s.snacks) if (sn.on) for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + sn.x;
        this.snackInst.put(sn.x + Math.cos(a) * 0.35, Math.abs(Math.sin(t * 3 + k)) * 0.06, sn.z + Math.sin(a) * 0.35, t * 0.5 + k, 1.5);
      }
      this.snackInst.end();
      for (const sn of s.snacks) if (sn.on && Math.random() < 0.06) this.fx.spawn(sn.x, 0.9, sn.z, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 0.06, 0.6, look.accent, { drag: 1 });
    }
    if (this.chevrons) {
      this.chevrons.begin();
      for (const cv of s.c.conveyors) {
        const x0 = cv.c * BLOCK, z0 = cv.r * BLOCK;
        const ry = Math.atan2(cv.dx, cv.dz) + Math.PI;
        for (let k = 0; k < 4; k++) for (const lane of [1.1, 2.9]) {
          const along = ((k + (t * 0.8) % 1) / 4) * BLOCK;
          const x = cv.dx ? x0 + (cv.dx > 0 ? along : BLOCK - along) : x0 + lane;
          const z = cv.dz ? z0 + (cv.dz > 0 ? along : BLOCK - along) : z0 + lane;
          this.chevrons.put(x, 0.11, z, ry, 1);
        }
      }
      this.chevrons.end();
    }
    this.shadows.end();
    this.fx.update(dt);
    this.updateCamera(s, dt, o);
  }

  private placeMon(m: Mon, f: MonFig, s: Sim, dt: number): void {
    const fig = f.fig, def = m.def, t = this.time;
    fig.root.position.set(m.x, m.y, m.z);
    fig.root.rotation.y = m.yaw;
    fig.root.visible = m.state !== 'vent' && !(m.state === 'blink' && m.t > 0.22) && !this.hideMons;
    let sc = 1;
    if (m.state === 'captured') sc = Math.max(0.01, 1 - m.t / 0.85);
    if (m.state === 'evolve') sc = 0.8 + Math.min(1, m.t / 1.2) * 0.2 + Math.sin(m.t * 30) * 0.06;
    if (m.state === 'windup' && !m.boss) sc = 1 + Math.min(1, m.t / 0.5) * 0.1;
    // a hit: a quick squash
    if (m.hurtT > 0 && !m.boss) sc *= 1 + Math.sin((m.hurtT / 0.25) * Math.PI) * 0.14;
    fig.root.scale.set(sc * (m.hurtT > 0 ? 1.06 : 1), sc * (m.hurtT > 0 ? 0.9 : 1), sc * (m.hurtT > 0 ? 1.06 : 1));
    const speed = Math.hypot(m.vx, m.vz);
    if (m.boss) this.animBoss(m, fig);
    else {
      const kind = def!.kind;
      switch (m.state) {
        case 'dizzy': case 'towed': case 'captured':
          fig.play('Death', { once: true, fade: 0.12 });
          break;
        case 'eat': fig.play('Duck', { speed: 1.4 }); break;
        case 'windup': fig.play(m.act === 'lob' ? 'Weapon' : m.act === 'spore' ? 'Wave' : 'Punch', { once: true, restart: m.t < 0.05, speed: m.act === 'bite' ? 1.5 : 1.3 }); break;
        case 'blink': fig.play('Duck', { once: true, speed: 2.2 }); break;
        case 'evolve': fig.play('Yes', { speed: 1.4 }); break;
        default:
          if (m.hurtT > 0) fig.play('HitReact', { once: true, restart: m.hurtT > 0.23, speed: 2 });
          else if (kind === 'caller' && m.callCd > 8) fig.play('Wave', { speed: 1.8 });
          else if (kind === 'leaper' && m.air > 0) fig.play('Jump', { once: true, speed: 0.8 });
          else if (kind === 'hopper') fig.play(speed > 0.3 ? 'Jump' : 'Idle', { speed: m.state === 'flee' ? 1.5 : 1.1 });
          else if (speed > 3.4) fig.play('Run', { speed: Math.max(0.8, Math.min(1.8, speed / 5)) });
          else fig.play(speed > 0.4 ? 'Walk' : 'Idle', { speed: Math.max(0.7, Math.min(2.4, speed / 1.6)) });
      }
      // evolving soon: an orange pulse; evolved: a slow purple-orange glow
      if (m.evolveK > 0.78 && !m.evolved && s.loose(m)) { const p = (Math.sin(t * (6 + m.evolveK * 10)) + 1) / 2; fig.setGlowRGB(0.35 * p, 0.16 * p, 0); }
      else if (m.evolved) { const p = (Math.sin(t * 3 + m.i) + 1) / 2; fig.setGlowRGB(0.16 + p * 0.12, 0.04 + p * 0.06, 0.12 - p * 0.06); }
      else if (m.state === 'windup') fig.setGlowRGB(0.25 * Math.min(1, m.t / 0.4), 0.02, 0);
      else fig.setGlowRGB(0, 0, 0);
    }
    if (m.hurtT > 0.18) fig.flash(0.1);
    fig.update(dt);
  }

  private animBoss(m: Mon, fig: Figure): void {
    const speed = Math.hypot(m.vx, m.vz);
    switch (m.state) {
      case 'b-windup': case 'b-act': {
        const a = m.attack;
        const clip = a === 'slam' ? 'Punch' : a === 'leap' ? 'Jump' : a === 'charge' ? 'Run' : a === 'summon' ? 'Wave' : a === 'blink' ? 'Duck' : 'Weapon';
        fig.play(clip, { speed: a === 'charge' && m.state === 'b-act' ? 1.8 : 1 });
        break;
      }
      case 'b-daze': case 'dizzy': case 'towed': case 'captured': fig.play('Death', { once: true, fade: 0.15 }); break;
      case 'b-roar': fig.play('Yes'); break;
      default: fig.play(m.stun > 0 ? 'HitReact' : speed > 0.4 ? 'Walk' : 'Idle', { speed: Math.max(0.8, speed / 1.6) });
    }
    if (m.state === 'b-idle' && m.stun <= 0) fig.setGlowRGB(0.05, 0.05, 0.12);
    else if (m.state === 'b-windup') fig.setGlowRGB(0.3 * Math.min(1, m.t / 0.6), 0.05, 0);
    else fig.setGlowRGB(0, 0, 0);
  }

  /** The boss's next attack drawn on the floor in red while it winds up. */
  private bossTelegraph(m: Mon, s: Sim, t: number): void {
    if (m.state !== 'b-windup' && !(m.state === 'b-act' && (m.attack === 'leap' || m.attack === 'beam'))) return;
    const a = m.attack!;
    const k = m.state === 'b-windup' ? Math.min(1, m.t / s.windupOf(a)) : 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * 18);
    switch (a) {
      case 'slam': {
        const i = this.discs.put(m.x, 0.13, m.z, 0, 3.4 * k);
        this.discs.color(i, 0xff2a1a, 0.3 + 0.25 * k);
        const r = this.rings.put(m.x, 0.14, m.z, 0, 3.4);
        this.rings.color(r, 0xff3a2a, 0.6 + 0.4 * pulse);
        break;
      }
      case 'leap': {
        const i = this.discs.put(m.aim.x, 0.13, m.aim.z, 0, 3.2 * Math.max(0.3, k));
        this.discs.color(i, 0xff2a1a, 0.35);
        const r = this.rings.put(m.aim.x, 0.14, m.aim.z, 0, 3.2);
        this.rings.color(r, 0xff3a2a, 0.6 + 0.4 * pulse);
        break;
      }
      case 'charge': {
        const i = this.lines.put(m.x, 0.13, m.z, m.aimYaw, new THREE.Vector3(m.radius * 2 + 0.6, 1, 16));
        this.lines.color(i, 0xff2a1a, 0.25 + 0.3 * k);
        break;
      }
      case 'beam': {
        // the wedge the beam will sweep: its two edges bright, the inside faint
        if (m.state === 'b-act') break;
        for (let q = -4; q <= 4; q++) {
          const yaw = m.aimYaw + (q / 4) * BEAM.amp;
          const [ex, ez] = s.beamEnd({ ...m, yaw } as Mon);
          const edge = Math.abs(q) === 4;
          const i = this.lines.put(m.x, 0.13, m.z, yaw, new THREE.Vector3(edge ? 0.35 : 1.1, 1, Math.hypot(ex - m.x, ez - m.z) * (edge ? 1 : k)));
          this.lines.color(i, 0xff2a1a, edge ? 0.5 + 0.4 * pulse : 0.12 + 0.12 * k);
        }
        break;
      }
      case 'volley': {
        for (let q = -2; q <= 2; q++) { const i = this.lines.put(m.x, 0.13, m.z, m.aimYaw + q * VOLLEY_GAP, new THREE.Vector3(0.4, 1, 3 + 9 * k)); this.lines.color(i, 0xff3a1a, 0.4 + 0.3 * pulse); }
        break;
      }
      case 'ring': {
        const r = this.rings.put(m.x, 0.14, m.z, 0, m.radius + 4 * k);
        this.rings.color(r, 0xff3a2a, 0.9);
        break;
      }
      case 'lob': {
        const r = this.rings.put(m.aim.x, 0.14, m.aim.z, 0, 1.8);
        this.rings.color(r, 0xff5a3a, 0.6 + 0.4 * pulse);
        break;
      }
    }
    // the beam itself
    if (a === 'beam' && m.state === 'b-act') {
      const [ex, ez] = s.beamEnd(m);
      const i = this.lines.put(m.x, 1.3, m.z, m.yaw, new THREE.Vector3(0.5 + pulse * 0.2, 1, Math.hypot(ex - m.x, ez - m.z)));
      this.lines.color(i, 0xe07aff, 1.4);
      const j = this.lines.put(m.x, 0.15, m.z, m.yaw, new THREE.Vector3(1.4, 1, Math.hypot(ex - m.x, ez - m.z)));
      this.lines.color(j, 0xc05aff, 0.5);
      if (Math.random() < 0.5) this.fx.sparks(ex, 1.2, ez, 2, [0xe07aff, 0xffffff], 3, 3, 0.07);
    }
  }

  // ---------------------------------------------------------------- the camera

  private updateCamera(s: Sim, dt: number, o: { camera?: CamMode; introT?: number }): void {
    const cam = this.world.camera, v = s.mech, L = s.c;
    const mode = o.camera ?? 'follow';
    const W = L.cols * BLOCK, H = L.rows * BLOCK;
    const dist = this.land ? CAM.distLand : CAM.distPort;
    const pitch = CAM.pitch;
    let tx = v.x, tz = v.z, d = dist, p = pitch, yaw = 0;
    if (mode === 'follow') {
      // portrait: the mech a little above the middle (the pad covers the bottom)
      tx += v.vx * 0.25; tz += v.vz * 0.18 + (this.land ? -1.2 : 2.2);
      // a boss in the room: the camera frames it and the mech together
      const b = s.boss;
      if (b && b.state !== 'captured' && b.state !== 'gone' && b.state !== 'towed') {
        const d = Math.hypot(b.x - v.x, b.z - v.z);
        if (d < 20) { const k = 0.4 * (1 - Math.max(0, d - 12) / 8); tx += (b.x - v.x) * k; tz += (b.z - v.z) * k; }
      }
      // keep the view over the station
      const halfW = this.land ? 11 : 4.5;
      tx = Math.max(Math.min(halfW, W / 2), Math.min(W - Math.min(halfW, W / 2), tx));
      // the low camera sees ~7.5 m (landscape) or ~10 m (portrait, under the pad) south of where it looks:
      // it stops before the screen's bottom edge passes the map's south wall
      tz = Math.max(Math.min(this.land ? 6 : 7, H / 2), Math.min(H - (this.land ? 9.5 : 10), tz));
    } else if (mode === 'preview') {
      this.preT += dt;
      tx = W / 2 + Math.sin(this.preT * 0.15) * W * 0.18;
      tz = H / 2 + Math.cos(this.preT * 0.11) * H * 0.1;
      d = Math.max(W, H) * (this.land ? 0.95 : 1.55) + 6;
      p = 1.0;
      // landscape: the board sits on the left, so look a little left of the middle (the level shows right)
      if (this.land) tx -= W * 0.22 + 4;
      else tz += H * 0.18 + 4;
    } else if (mode === 'hangar') {
      this.preT += dt;
      yaw = 0.25;
      // high enough to clear the tall roof caps behind the start
      d = this.land ? 10 : 12.5; p = this.land ? 0.5 : 0.58;
      tx = this.spot.x; tz = this.spot.z;
      // the board covers the left half (landscape) or the bottom (portrait): the mech in the free part
      if (this.land) tx -= 3.4;
      else tz += 5.4;
    } else if (mode === 'select') {
      // the lineup from the front: the mechs in the top part, the board below them
      const mx = this.spot.x, z0 = this.spot.z - 2;
      const P = this.land ? [mx, 6.2, z0 + 15.5] : [mx, 7.4, z0 + 21.5];
      const T = this.land ? [mx, 0.3, z0 - 1] : [mx, -1.5, z0 - 2];
      cam.position.set(P[0], P[1], P[2]);
      cam.up.copy(UP);
      cam.lookAt(T[0], T[1], T[2]);
      return;
    } else if (mode === 'intro') {
      const k = Math.min(1, o.introT ?? 1);
      const e = 1 - Math.pow(1 - k, 3);
      const fx = W / 2, fz = H / 2;
      tx = fx + (v.x - fx) * e; tz = fz + (v.z - fz) * e;
      d = (Math.max(W, H) * 1.1) * (1 - e) + dist * e;
      p = 1.15 * (1 - e) + pitch * e;
    }
    const k = mode === 'follow' && !this.snapNext ? 1 - Math.exp(-6 * dt) : 1;
    this.snapNext = false;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.z += (tz - this.cam.z) * k;
    const lookY = mode === 'hangar' ? (this.land ? 1.6 : 1.2) : 0.8;
    const sx = (Math.random() - 0.5) * this.cam.shake, sy = (Math.random() - 0.5) * this.cam.shake;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.2);
    const cx = this.cam.x + Math.sin(yaw) * Math.cos(p) * d, cy = lookY + Math.sin(p) * d, cz = this.cam.z + Math.cos(yaw) * Math.cos(p) * d;
    if (this.shotCam) {
      cam.position.set(this.shotCam[0][0], this.shotCam[0][1], this.shotCam[0][2]);
      cam.lookAt(this.shotCam[1][0], this.shotCam[1][1], this.shotCam[1][2]);
      return;
    }
    cam.position.set(cx + sx, cy + sy, cz);
    cam.up.copy(UP);
    cam.lookAt(this.cam.x + sx * 0.5, lookY, this.cam.z);
  }

  /** Snaps the camera to the mech (a new level, a restart). */
  snap(s: Sim): void {
    this.cam.x = s.mech.x; this.cam.z = s.mech.z;
    this.snapNext = true;
    this.sync(s, 0, { camera: 'follow' });
  }

  /** A capture: the pod's ring flares for a moment. */
  podFlash(x: number, z: number): void {
    for (const r of this.podRings) if (Math.hypot(r.position.x - x, r.position.z - z) < 1) r.userData.flash = 0.6;
    if (this.fieldRing && Math.hypot(this.fieldRing.position.x - x, this.fieldRing.position.z - z) < 1) this.fieldRing.userData.flash = 0.9;
  }

  shake(k: number): void { this.cam.shake = Math.min(1.4, Math.max(this.cam.shake, k)); }

  /** Game pixels of a world point. */
  screen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.world.camera.updateMatrixWorld();
    return this.world.toScreen(tv.set(x, y, z));
  }

  /** Draw calls and triangles of the last frame. */
  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.world.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  /** Compiles the shaders now (no hitch on the first frame of play). */
  warm(): void { try { this.world.renderer.compile(this.world.scene, this.world.camera); } catch { /* not ready */ } }

  dispose(): void {
    this.clearLineup();
    for (const f of this.figs.values()) f.fig.dispose();
    this.figs.clear();
    this.mechFig?.dispose();
    this.mechFig = null;
    this.clearStage();
  }
}

/** The floor tile for a set of wall edges ('n', 's', 'e', 'w') and its turn. */
function tileFor(edges: string[], rnd: () => number): [string, number] {
  // the pack's tiles: Side has its trim on -x (west), Corner on -x and -z (west and north)
  const turn = (dir: string, rot: number): string => {
    const v: Record<string, [number, number]> = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] };
    const [x, z] = v[dir];
    const nx = Math.round(x * Math.cos(rot) + z * Math.sin(rot)), nz = Math.round(-x * Math.sin(rot) + z * Math.cos(rot));
    return nx === -1 ? 'w' : nx === 1 ? 'e' : nz === -1 ? 'n' : 's';
  };
  const rots = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  if (edges.length >= 2) {
    for (const r of rots) { const got = ['w', 'n'].map((d) => turn(d, r)); if (edges.every((e) => got.includes(e))) return ['FloorTile_Corner', r]; }
  }
  if (edges.length >= 1) {
    for (const r of rots) if (turn('w', r) === edges[0]) return ['FloorTile_Side', r];
  }
  const k = rnd();
  return [k < 0.06 ? 'FloorTile_Basic2' : 'FloorTile_Basic', rots[Math.floor(rnd() * 4)]];
}

export { MONSTERS };
