// Delivery Dash: draws a district and everything moving in it. The town (Road Pack tiles rotated
// into place, the plateau's stone plinths, lots with City Kit houses and shops, trees, lamps,
// lane dashes, speed bumps, roadworks) is merged per material; traffic is instanced per Car Kit
// model; the van is the Car Kit model in its chosen paint (body, rear door and wheels as separate
// meshes); people are rigged Mini Characters; bays, beams, lights, rain, smoke, coins and skid
// marks are instanced quads. A chase camera follows the van and climbs over any lot between it
// and the van (clearance against the lots' boxes, never inside a building). The Play scene and
// the menu's autopilot both use it, so the menu also compiles every shader the first Play frame
// needs (keepPrograms).
import Phaser from 'phaser';
import { World3D, THREE, model, modelClips } from '@core/three';
import { S, LEVEL_H, LANE, WALK, HEADING, DX, DZ, opp, clamp, lerp, wrapAngle, Rng, SHOP_COLOR, VIP_COLOR, PAINTS, vehicle, type VehicleId } from './defs';
import { TILE, fitTurns, turnsFor } from './tiles';
import { cx, cz, BUMP_H, BUMP_HALF, type Town, type Bay, type Lot } from './town';
import { Mats, Merger, mat4, tileKey, carGeometry, boxOf, PEOPLE } from './kit';
import { CAR_TYPES, type Sim, type SimEvent } from './sim';
import { Billboards, Particles, glowTex, puffTex, ringTex, sparkTex, streakTex, skidTex, bayTex, beamTex } from './fx3d';
import { miniKey } from '@core/three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Car Kit models are scaled to this (the van is about 2.3 units long), people to PS. */
export const CS = 0.86;
/** People: a Mini Character's head reaches about the van's mid-height. */
const PS = 1.15;
const TILE_TOP = 0.2 * S;
/** Cells per side of a merged town chunk. */
const CHUNK = 5;
const CAP = 24;

interface Look { sky: number; fog: number; hemiSky: number; hemiGround: number; hemi: number; sun: number; sunI: number; fogNear: number; fogFar: number }
const DAY: Look = { sky: 0x9fd6f5, fog: 0xbfe3f5, hemiSky: 0xeaf6ff, hemiGround: 0x9a9080, hemi: 1.9, sun: 0xfff2dc, sunI: 2.5, fogNear: 55, fogFar: 130 };
const DUSK: Look = { sky: 0xf0a070, fog: 0xe0a080, hemiSky: 0xffd0b0, hemiGround: 0x6a5060, hemi: 1.1, sun: 0xffa060, sunI: 1.3, fogNear: 40, fogFar: 100 };
const NIGHT: Look = { sky: 0x101a36, fog: 0x18223e, hemiSky: 0x5a70b0, hemiGround: 0x20202c, hemi: 0.62, sun: 0x9ab0ff, sunI: 0.35, fogNear: 30, fogFar: 85 };

interface Person {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  acts: Record<string, THREE.AnimationAction>;
  cur: string;
}

interface HouseDoor { x: number; y: number; z: number; face: number }

export interface ViewOptions { menu?: boolean; vehicle: VehicleId; paint: number }

export class View {
  readonly world: World3D;
  readonly mats = new Mats();
  readonly town: Town;
  private sc: THREE.Scene;
  private hemi!: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  // the van
  private van = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private door: THREE.Object3D | null = null;
  private crates: THREE.InstancedMesh | null = null;
  private wheelSpin = 0;
  /** The van's own material (the town's flat one, plus a glow of its paint at night so it reads). */
  private vanMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private vanGlow = new THREE.Color();
  private doorK = 0;
  // traffic and people
  private cars: THREE.InstancedMesh[] = [];
  private people: Person[] = [];
  private resident: Person;
  private residentT = 0;
  private residentAt: HouseDoor | null = null;
  private doorMesh: THREE.Mesh;
  private doorPivot = new THREE.Group();
  private coffees: THREE.Object3D[] = [];
  private houseDoors = new Map<Bay, HouseDoor>();
  private lampHeads: number[] = [];
  /** Roof height per lot (camera clearance). */
  private tops: number[] = [];
  // effects
  private glow: Billboards;
  private beams: Billboards;
  private bays: Billboards;
  private rings: Billboards;
  private blobs: Billboards;
  private skids: Billboards;
  private rainBB: Billboards;
  private smoke: Particles;
  private sparks: Particles;
  private coins: Particles;
  private skidMarks: number[] = [];
  private rain: { x: number; y: number; z: number; v: number }[] = [];
  private arrow: THREE.Mesh;
  private arrowK = 0;
  private t = 0;
  // camera
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camYaw = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private fovKick = 0;
  /** Weather shown (eases to the simulation's). */
  night = 0;
  rainK = 0;
  /** Menu backdrop: a higher, wider camera. */
  menu = false;
  /** A moment's look at something (the door on a delivery): point, seconds left. */
  private focus: { x: number; y: number; z: number; t: number; dx: number; dz: number } | null = null;
  private focusK = 0;
  /** Test hook: a fixed camera. */
  debugCam: { pos: [number, number, number]; look: [number, number, number] } | null = null;
  /** The route the arrow points along (set by the scene): world points. */
  route: number[] = [];
  /** Distance to the target (shown by the scene). */
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private paintColor: number;

  constructor(phaser: Phaser.Scene, sim: Sim, o: ViewOptions) {
    this.town = sim.town;
    this.menu = !!o.menu;
    const world = new World3D(phaser, { fov: 52, near: 0.5, far: 240, quality: 0.75, background: DAY.sky, fog: { color: DAY.fog, near: DAY.fogNear, far: DAY.fogFar } });
    this.world = world;
    this.sun = world.addLights({ sky: DAY.hemiSky, ground: DAY.hemiGround, ambient: DAY.hemi, sun: DAY.sun, intensity: DAY.sunI, dir: [-0.45, 1, 0.55], extent: 26 });
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.far = 140;
    this.sun.position.multiplyScalar(1.8);
    world.scene.traverse((ob) => { if ((ob as THREE.HemisphereLight).isHemisphereLight) this.hemi = ob as THREE.HemisphereLight; });
    this.sc = world.scene;
    this.paintColor = PAINTS[o.paint]?.color ?? PAINTS[0].color;

    this.buildTown(sim);
    this.buildVan(o.vehicle);
    // traffic: one instanced mesh per Car Kit model
    for (const ct of CAR_TYPES) {
      const im = new THREE.InstancedMesh(carGeometry('car:' + ct.model, CS, ct.paint), this.mats.car, CAP);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      this.sc.add(im);
      this.cars.push(im);
    }
    // people
    for (let i = 0; i < Math.max(sim.peds.length, 1); i++) this.people.push(this.person(PEOPLE[i % (PEOPLE.length - 1)]));
    this.resident = this.person('character-female-f');
    this.resident.root.visible = false;
    // the door that opens on a delivery
    this.doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.35, 0.1).translate(0.39, 0.675, 0), this.mats.flat);
    this.paintBox(this.doorMesh.geometry, 0x8a4f2a);
    this.doorPivot.add(this.doorMesh);
    this.doorPivot.visible = false;
    this.sc.add(this.doorPivot);
    // coffee cups
    for (const c of sim.coffees) {
      const cup = model('fo:soda', { shadows: true });
      cup.scale.setScalar(3.2);
      cup.position.set(c.x, c.y + 0.9, c.z);
      this.recolourCup(cup);
      this.sc.add(cup);
      this.coffees.push(cup);
    }

    // effects
    const glow = glowTex();
    this.glow = new Billboards(this.sc, glow, 320, { order: 14 });
    this.beams = new Billboards(this.sc, beamTex(), 16, { kind: 'upright', order: 13 });
    this.bays = new Billboards(this.sc, bayTex(), 16, { kind: 'flat', order: 9 });
    this.rings = new Billboards(this.sc, ringTex(), 24, { kind: 'flat', order: 10 });
    this.blobs = new Billboards(this.sc, skidTex(), 40, { kind: 'flat', additive: false, order: 8 });
    this.skids = new Billboards(this.sc, skidTex(), 240, { kind: 'flat', additive: false, order: 7 });
    this.rainBB = new Billboards(this.sc, streakTex(), 300, { additive: false, order: 16 });
    this.smoke = new Particles(this.sc, puffTex(), 260, { additive: false, order: 12 });
    this.sparks = new Particles(this.sc, glow, 200, { order: 15 });
    this.coins = new Particles(this.sc, sparkTex(), 160, { order: 15 });
    const r = new Rng(5);
    for (let i = 0; i < 300; i++) this.rain.push({ x: r.range(-14, 14), y: r.range(0, 14), z: r.range(-14, 14), v: r.range(22, 30) });
    // the arrow over the van
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.1); shape.lineTo(0.85, 0.05); shape.lineTo(0.32, 0.05); shape.lineTo(0.32, -0.9); shape.lineTo(-0.32, -0.9); shape.lineTo(-0.32, 0.05); shape.lineTo(-0.85, 0.05); shape.closePath();
    const ag = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthTest: false, fog: false, side: THREE.DoubleSide }));
    this.arrow.renderOrder = 20;
    this.sc.add(this.arrow);
    const rim = new THREE.Mesh(ag.clone().scale(1.22, 1, 1.22).translate(0, -0.01, 0), new THREE.MeshBasicMaterial({ color: 0x1a2340, transparent: true, opacity: 0.6, depthTest: false, fog: false, side: THREE.DoubleSide }));
    rim.renderOrder = 19;
    this.arrow.add(rim);

    // every material the world may use, even when this district has none of it (shader warm-up)
    const dummy = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    this.paintBox(dummy, 0);
    const w = new THREE.Mesh(dummy, this.mats.water);
    const ci = new THREE.InstancedMesh(dummy, this.mats.flat, 1);
    ci.castShadow = true;
    for (const d of [w, ci]) { d.visible = false; this.sc.add(d); }

    this.camYaw = sim.h;
    this.snapCamera(sim);
    this.night = sim.night;
    this.rainK = sim.rain;
    this.applyLook(sim.night, sim.rain);
  }

  // ------------------------------------------------------------------ town

  private paintBox(g: THREE.BufferGeometry, color: number): void {
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  }

  /** The Food Kit soda cup as a takeaway coffee: the kit texture, warmed to a coffee brown. */
  private cupMat: THREE.MeshLambertMaterial | null = null;
  private recolourCup(cup: THREE.Object3D): void {
    cup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      if (!src.map) { m.material = this.mats.flat; return; }
      if (!this.cupMat) { this.cupMat = this.mats.of(src.map).clone(); this.cupMat.color.setRGB(1, 0.62, 0.36); }
      m.material = this.cupMat;
    });
  }

  private buildTown(sim: Sim): void {
    const t = this.town;
    const fam = TILE[t.def.family];
    // the town is merged per material in chunks of CHUNK × CHUNK cells, so the camera and the
    // sun's shadow camera skip what they cannot see; the land around it is one more mesh
    const chunks = new Map<string, Merger>();
    const chunkAt = (r: number, c: number): Merger => {
      const key = `${Math.floor(r / CHUNK)},${Math.floor(c / CHUNK)}`;
      let mm = chunks.get(key);
      if (!mm) { mm = new Merger(); chunks.set(key, mm); }
      return mm;
    };
    const far = new Merger();
    const tint = (name: string, c: THREE.Color): THREE.Color | 'water' | null => {
      if (name === 'water') return 'water';
      if (name === 'grass') return c.setHex(t.def.id === 2 ? 0x86c058 : 0x8fc65e).convertSRGBToLinear();
      if (name === 'asphalt') return c.setHex(0x6a6e78).convertSRGBToLinear();
      if (name === 'pavement') return c.setHex(t.def.id === 0 ? 0xd8cdb8 : 0xe2dccd).convertSRGBToLinear();
      return c;
    };
    // shop forecourts in warm brick, so the sidewalks read against them
    const plaza = (name: string, c: THREE.Color): THREE.Color | 'water' | null => name === 'pavement' ? c.setHex(0xd8b48e).convertSRGBToLinear() : tint(name, c);
    const rng = new Rng(17 + t.def.id * 101);
    const stone = 0x9c8a70;
    for (const cell of t.cells) {
      const m = chunkAt(cell.r, cell.c);
      const x = cx(cell.c), z = cz(cell.r);
      const lvl = cell.level * LEVEL_H;
      let id: number, k = 0;
      if (cell.road) {
        let open = cell.open;
        if (cell.ramp >= 0) { id = fam.slope; k = turnsFor(3, cell.ramp); }
        else if (cell.bridge) { id = cell.bridge === 'hump' ? TILE.bridgeHump : TILE.bridgeFlat; k = fitTurns(id, open); }
        else {
          const n = [0, 1, 2, 3].filter((d) => open & (1 << d)).length;
          if (n === 0) open = 0b1010;
          const straight = open === 0b0101 || open === 0b1010;
          id = n >= 4 ? fam.cross : n === 3 ? fam.T : n === 1 ? fam.end : straight ? (cell.crosswalk ? fam.crosswalk : fam.straight) : fam.corner;
          k = fitTurns(id, open);
        }
        m.add(tileKey(id), mat4(x, (cell.ramp >= 0 ? 0 : lvl) - TILE_TOP, z, k * Math.PI / 2, S), { tint });
      } else {
        const lot = cell.lot!;
        id = lot.kind === 'water' ? TILE.river : lot.kind === 'park' ? TILE.park : lot.kind === 'shop' || lot.kind === 'cafe' ? TILE.city.lot : lot.kind === 'house' || lot.kind === 'trees' ? TILE.green.lot : fam.lot;
        m.add(tileKey(id), mat4(x, lvl - TILE_TOP, z, 0, S), { tint: lot.kind === 'shop' || lot.kind === 'cafe' ? plaza : tint });
      }
      if (cell.level > 0) {
        m.addFlat(new THREE.BoxGeometry(S, LEVEL_H, S), stone, mat4(x, LEVEL_H / 2 - TILE_TOP - 0.02, z));
        // where the plateau drops to the streets below: a pale kerb on top and a dark band on the
        // face, so the edge reads from the chase camera
        for (let d = 0; d < 4; d++) {
          const n = t.cell(cell.r + DZ[d], cell.c + DX[d]);
          if (!n || n.level > 0 || n.ramp >= 0) continue;
          const ex = x + DX[d] * (S / 2 - 0.18), ez = z + DZ[d] * (S / 2 - 0.18);
          const kg = new THREE.BoxGeometry(DX[d] ? 0.36 : S, 0.3, DX[d] ? S : 0.36);
          m.addFlat(kg, 0xf2ead8, mat4(ex, LEVEL_H + 0.1, ez));
          kg.dispose();
          const bg = new THREE.BoxGeometry(DX[d] ? 0.06 : S, 0.45, DX[d] ? S : 0.06);
          m.addFlat(bg, 0x5c4c3a, mat4(x + DX[d] * (S / 2 + 0.03), LEVEL_H - 0.45, z + DZ[d] * (S / 2 + 0.03)));
          bg.dispose();
        }
      }
    }
    // the land around the town, with trees and far buildings
    const W = t.w * S, H = t.h * S;
    far.addFlat(new THREE.BoxGeometry(W + 200, 1, H + 200), new THREE.Color(t.def.id === 2 ? 0x82bd52 : 0x8fc85c), mat4(W / 2, -1.05, H / 2));
    for (let i = 0; i < 70; i++) {
      const a = rng.next() * Math.PI * 2, d = rng.range(7, 34);
      const ex = W / 2 + Math.cos(a) * (W / 2 + d), ez = H / 2 + Math.sin(a) * (H / 2 + d);
      if (rng.chance(0.75) || d < 14) far.add('na:' + rng.pick(['tree_default', 'tree_oak', 'tree_simple']), mat4(ex, -0.2, ez, rng.next() * 6.3, rng.range(4, 6)));
      else far.add('co:' + rng.pick(['low-detail-building-a', 'low-detail-building-c', 'low-detail-building-wide-a']), mat4(ex, -0.2, ez, rng.next() * 6.3, rng.range(3, 4)));
    }
    // lots
    for (const lot of t.lots) this.dressLot(chunkAt(lot.r, lot.c), lot, rng);
    // street furniture: lane dashes, lamps, one-way arrows, speed bumps
    for (const cell of t.cells) {
      if (!cell.road) continue;
      const m = chunkAt(cell.r, cell.c);
      const x = cx(cell.c), z = cz(cell.r), y = cell.level * LEVEL_H + 0.015;
      const ns = cell.open === 0b0101, ew = cell.open === 0b1010;
      if ((ns || ew) && !cell.crosswalk && cell.ramp < 0 && !cell.bridge) {
        if (cell.oneway < 0) for (const o of [-2.2, 2.2]) m.addFlat(new THREE.BoxGeometry(ns ? 0.14 : 1.8, 0.02, ns ? 1.8 : 0.14), 0xf2efe4, mat4(x + (ew ? o : 0), y, z + (ns ? o : 0)));
        else this.oneWayArrow(m, x, y, z, cell.oneway);
        if (cell.bump) this.speedBump(m, x, y - 0.015, z, ns);
        // a lamp on every other straight cell, on the side away from any lot's door
        if ((cell.r + cell.c) % 2 === 0) {
          const side = (cell.r * 3 + cell.c) % 4 < 2 ? 1 : -1;
          const lx = x + (ns ? side * 3.7 : 0), lz = z + (ew ? side * 3.7 : 0);
          const rot = ns ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
          m.add('ro:light-square', mat4(lx, y - 0.05, lz, rot, 5.2));
          const hx = lx - (ns ? side * 1.1 : 0), hz = lz - (ew ? side * 1.1 : 0);
          this.lampHeads.push(hx, y + 3.0, hz);
        }
      }
      if (cell.works && sim.shift.works) this.roadworks(m, cell, y);
    }
    for (const mm of chunks.values()) mm.build(this.mats, this.sc);
    far.build(this.mats, this.sc, { cast: false });
    // the static meshes don't move: no matrix updates per frame
    for (const ch of this.sc.children) if ((ch as THREE.Mesh).isMesh) { ch.matrixAutoUpdate = false; ch.updateMatrix(); }
  }

  private oneWayArrow(m: Merger, x: number, y: number, z: number, d: number): void {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.3); shape.lineTo(0.7, 0.3); shape.lineTo(0.25, 0.3); shape.lineTo(0.25, -1.3); shape.lineTo(-0.25, -1.3); shape.lineTo(-0.25, 0.3); shape.lineTo(-0.7, 0.3); shape.closePath();
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    // the shape points to -z after the rotation: turn it to the travel direction
    for (const o of [-1.6, 1.6]) {
      const rx = DX[(d + 1) % 4] * LANE * 0, rz = 0;
      m.addFlat(g, 0xf2efe4, mat4(x + DX[d] * o + rx, y, z + DZ[d] * o + rz, HEADING[d] + Math.PI));
    }
    g.dispose();
  }

  private speedBump(m: Merger, x: number, y: number, z: number, ns: boolean): void {
    // a cosine hump across the street in yellow and black stripes
    const N = 8;
    for (let i = 0; i < N; i++) {
      // a half cylinder bulging up, its axis across the street, flattened into the hump
      const g = new THREE.CylinderGeometry(1, 1, 4.2 / N, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
      if (!ns) g.rotateY(Math.PI / 2);
      const across = -2.1 + (i + 0.5) * 4.2 / N;
      const mm = ns ? mat4(x + across, y, z, 0, 1, BUMP_H, BUMP_HALF) : mat4(x, y, z + across, 0, BUMP_HALF, BUMP_H, 1);
      m.addFlat(g, i % 2 ? 0x2a2a30 : 0xf5c331, mm);
      g.dispose();
    }
  }

  private roadworks(m: Merger, cell: { r: number; c: number; open: number }, y: number): void {
    const x = cx(cell.c), z = cz(cell.r);
    const ns = (cell.open & 0b0101) !== 0;
    for (const end of [-1, 1]) {
      const ex = x + (ns ? 0 : end * 3.2), ez = z + (ns ? end * 3.2 : 0);
      // a striped barrier across the asphalt
      for (let i = 0; i < 5; i++) {
        const o = -2 + i;
        m.addFlat(new THREE.BoxGeometry(ns ? 0.95 : 0.18, 0.32, ns ? 0.18 : 0.95), i % 2 ? 0xffffff : 0xe8453c, mat4(ex + (ns ? o * 0.9 : 0), y + 0.85, ez + (ns ? 0 : o * 0.9)));
      }
      for (const o of [-1.9, 1.9]) m.addFlat(new THREE.BoxGeometry(0.16, 1, 0.16), 0x2a2a30, mat4(ex + (ns ? o : 0), y + 0.5, ez + (ns ? 0 : o)));
      for (const o of [-1.2, 0, 1.2]) m.add('ro:construction-cone', mat4(ex + (ns ? o : end * 0.9), y, ez + (ns ? end * 0.9 : o), 0, 8));
    }
    // a digger in the middle and a dug-up patch
    m.addFlat(new THREE.BoxGeometry(ns ? 3 : 3.6, 0.08, ns ? 3.6 : 3), 0x7a5a3a, mat4(x, y + 0.02, z));
    m.add('car:tractorshovel', mat4(x, y, z, ns ? 0.6 : 2.2, CS * 1.25));
  }

  /** Buildings, gardens and trees on a lot. */
  private dressLot(m: Merger, lot: Lot, rng: Rng): void {
    const x = cx(lot.c), z = cz(lot.r), y = lot.level * LEVEL_H - 0.12;
    const face = lot.face;
    const rot = HEADING[face];
    const fx = DX[face], fz = DZ[face];
    const oldTown = this.town.def.id === 0;
    let top = y + 0.5;
    const place = (key: string, maxW: number, maxH: number, along: number, cap: number) => {
      const b = boxOf(key);
      // City Kit Commercial fronts face -z, Suburban fronts +z
      const rot = HEADING[face] + (key.startsWith('co:') ? Math.PI : 0);
      const bw = b.max.x - b.min.x, bd = b.max.z - b.min.z, bh = b.max.y - b.min.y;
      const s = Math.min(maxW / Math.max(bw, bd), maxH / bh, cap);
      const ox = -(b.min.x + b.max.x) / 2 * s, oz = -(b.min.z + b.max.z) / 2 * s;
      // the model's front (+z) turns to the street
      const c = Math.cos(rot), sn = Math.sin(rot);
      const px = x + fx * along + (ox * c + oz * sn), pz = z + fz * along + (-ox * sn + oz * c);
      m.add(key, mat4(px, y - b.min.y * s, pz, rot, s));
      top = Math.max(top, y + bh * s);
      return { depth: bd * s, width: bw * s };
    };
    switch (lot.kind) {
      case 'house': {
        const key = 'su:' + rng.pick(['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-f', 'building-type-k', 'building-type-o']);
        const d = place(key, 5.6, 6, -0.7, 4.6);
        // the door is in the middle of the front
        const front = -0.7 + d.depth / 2;
        const bay = [...this.town.houses].find((b) => b.lot === lot);
        if (bay) this.houseDoors.set(bay, { x: x + fx * (front + 0.08), y, z: z + fz * (front + 0.08), face });
        this.garden(m, lot, y, rng, front);
        break;
      }
      case 'shop': case 'cafe': {
        const key = 'co:' + (lot.kind === 'cafe' ? 'building-e' : rng.pick(['building-a', 'building-c', 'building-h', 'building-g', 'building-k', 'building-e']));
        place(key, 6.6, 7.2, 0.2, 6.2);
        if (lot.kind === 'cafe' || rng.chance(0.4)) for (const o of [-2.2, 2.2]) m.add('co:detail-parasol-a', mat4(x + fx * 3.1 + DX[(face + 1) % 4] * o, y, z + fz * 3.1 + DZ[(face + 1) % 4] * o, 0, 4.2));
        break;
      }
      case 'generic': {
        if (oldTown && rng.chance(0.7)) place('co:' + rng.pick(['building-a', 'building-c', 'building-e', 'building-g', 'building-h', 'building-k']), 6.6, 7.2, 0.1, 6);
        else { place('su:' + rng.pick(['building-type-a', 'building-type-c', 'building-type-d', 'building-type-k', 'building-type-m', 'building-type-o']), 5.6, 6, -0.7, 4.6); this.garden(m, lot, y, rng, 1.6); }
        break;
      }
      case 'park': {
        for (let i = 0; i < 4; i++) m.add('na:' + rng.pick(['tree_oak', 'tree_default']), mat4(x + rng.range(-2.6, 2.6), y, z + rng.range(-2.6, 2.6), rng.next() * 6.3, rng.range(3.2, 4.2)));
        for (let i = 0; i < 6; i++) m.add('na:' + rng.pick(['flower_reda', 'flower_yellowa', 'flower_purplea', 'plant_bush']), mat4(x + rng.range(-3, 3), y + 0.1, z + rng.range(-3, 3), rng.next() * 6.3, rng.range(2.5, 3.5)));
        top = y + 5;
        break;
      }
      case 'trees': {
        const n = 2 + rng.int(3);
        for (let i = 0; i < n; i++) m.add('na:' + rng.pick(['tree_default', 'tree_oak', 'tree_simple', 'tree_small']), mat4(x + rng.range(-2.4, 2.4), y, z + rng.range(-2.4, 2.4), rng.next() * 6.3, rng.range(3.4, 4.6)));
        top = y + 6;
        break;
      }
      default: top = y;
    }
    this.tops[lot.id] = top;
  }

  /** A low hedge along the street with a gap for the path, flowers by the door. */
  private garden(m: Merger, lot: Lot, y: number, rng: Rng, front: number): void {
    const x = cx(lot.c), z = cz(lot.r), f = lot.face, sd = (f + 1) % 4;
    const ex = x + DX[f] * 3.65, ez = z + DZ[f] * 3.65;
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(DX[f] ? 0.5 : 2.9, 0.7, DX[f] ? 2.9 : 0.5);
      m.addFlat(g, 0x4f9a42, mat4(ex + DX[sd] * s * 2.45, y + 0.35, ez + DZ[sd] * s * 2.45));
      g.dispose();
    }
    if (rng.chance(0.7)) m.add('na:' + rng.pick(['flower_reda', 'flower_yellowa', 'flower_purplea']), mat4(ex - DX[f] * 0.8 + DX[sd] * 1.1, y, ez - DZ[f] * 0.8 + DZ[sd] * 1.1, 0, 3));
    if (rng.chance(0.6)) m.add('su:tree-small', mat4(x - DX[f] * 0.5 + DX[sd] * 3.2, y, z - DZ[f] * 0.5 + DZ[sd] * 3.2, 0, 4.5));
  }

  // ------------------------------------------------------------------ van and people

  private buildVan(id: VehicleId): void {
    const v = vehicle(id);
    const root = model('car:' + v.model, { shadows: true });
    root.updateMatrixWorld(true);
    const paint = new THREE.Color(this.paintColor).convertSRGBToLinear();
    this.vanGlow.copy(paint).multiplyScalar(0.4).add(new THREE.Color(0.05, 0.05, 0.06));
    const inv = new THREE.Matrix4();
    const PART = /^(body|door|grill|wheel_)/;
    const parts: THREE.Object3D[] = [];
    root.traverse((o) => { if (PART.test(o.name)) parts.push(o); });
    // a part's own meshes (not those of parts hanging under it, like a door on the body)
    const own = (node: THREE.Object3D, out: THREE.Mesh[]) => {
      if ((node as THREE.Mesh).isMesh) out.push(node as THREE.Mesh);
      for (const ch of node.children) if (!parts.includes(ch)) own(ch, out);
    };
    const nodeMesh = (node: THREE.Object3D): THREE.Mesh | null => {
      const geos: THREE.BufferGeometry[] = [];
      inv.copy(node.matrixWorld).invert();
      const meshes: THREE.Mesh[] = [];
      own(node, meshes);
      for (const mm of meshes) {
        const mats = Array.isArray(mm.material) ? mm.material : [mm.material];
        const rel = inv.clone().multiply(mm.matrixWorld);
        const groups = mm.geometry.groups.length && mats.length > 1 ? mm.geometry.groups : [{ start: 0, count: mm.geometry.index ? mm.geometry.index.count : mm.geometry.attributes.position.count, materialIndex: 0 }];
        for (const gr of groups) {
          let g = mm.geometry.clone();
          if (g.index) { g.setIndex(Array.from(g.index.array).slice(gr.start, gr.start + gr.count)); g = g.toNonIndexed(); }
          for (const at of Object.keys(g.attributes)) if (at !== 'position' && at !== 'normal') g.deleteAttribute(at);
          g.applyMatrix4(rel);
          const mat = mats[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial;
          const c = /^paint/i.test(mat.name) ? paint : mat.color.clone();
          this.paintBox(g, 0);
          const ca = g.attributes.color.array as Float32Array;
          for (let i = 0; i < ca.length; i += 3) { ca[i] = c.r; ca[i + 1] = c.g; ca[i + 2] = c.b; }
          geos.push(g);
        }
      }
      if (!geos.length) return null;
      const mesh = new THREE.Mesh(mergeAll(geos), this.vanMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    this.body.scale.setScalar(CS);
    // Car Kit vehicles face -z: turn them to +z (the heading's forward)
    this.body.rotation.y = Math.PI;
    for (const o of parts) {
      const mesh = nodeMesh(o);
      if (!mesh) continue;
      // outer: position and steering; inner: the node's own turn; the mesh spins (wheels)
      const outer = new THREE.Group();
      o.getWorldPosition(outer.position);
      const inner = new THREE.Group();
      inner.quaternion.copy(o.getWorldQuaternion(new THREE.Quaternion()));
      inner.add(mesh);
      outer.add(inner);
      this.body.add(outer);
      if (o.name.startsWith('wheel_')) this.wheels.push(outer);
      if (o.name === 'door') this.door = outer;
    }
    this.van.add(this.body);
    // crates on a flatbed
    if (id !== 'van') {
      const g = new THREE.BoxGeometry(0.62, 0.5, 0.62);
      this.paintBox(g, 0xc89a5a);
      this.crates = new THREE.InstancedMesh(g, this.mats.flat, 6);
      this.crates.castShadow = true;
      this.crates.count = 0;
      this.van.add(this.crates);
    }
    this.sc.add(this.van);
  }

  private person(name: string): Person {
    const root = new THREE.Group();
    const m = model(miniKey(name), { shadows: false });
    m.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      const src = mm.material as THREE.MeshStandardMaterial;
      if (src.map) mm.material = this.mats.of(src.map);
      mm.castShadow = false;
      mm.frustumCulled = false;
    });
    m.scale.setScalar(PS);
    root.add(m);
    this.sc.add(root);
    const mixer = new THREE.AnimationMixer(m);
    const acts: Record<string, THREE.AnimationAction> = {};
    for (const clip of modelClips(miniKey(name))) acts[clip.name] = mixer.clipAction(clip);
    const p = { root, mixer, acts, cur: '' };
    this.play(p, 'idle');
    return p;
  }

  private play(p: Person, name: string, speed = 1): void {
    const a = p.acts[name];
    if (!a) return;
    a.timeScale = speed;
    if (p.cur === name) return;
    const old = p.acts[p.cur];
    a.reset().play();
    if (old) a.crossFadeFrom(old, 0.15, false);
    p.cur = name;
  }

  // ------------------------------------------------------------------ frame

  /** Draws the simulation's state; dt drives effects only. */
  sync(sim: Sim, dt: number): void {
    this.t += dt;
    const t = this.town;
    // the van
    const hv = sim.h;
    this.van.position.set(sim.x, sim.y + sim.bob * 0.6, sim.z);
    this.e.set(-sim.pitch, hv, sim.roll);
    this.van.quaternion.setFromEuler(this.e);
    this.wheelSpin += sim.v * dt / (0.3 * CS);
    for (const w of this.wheels) {
      const front = w.position.z < 0;
      w.rotation.y = front ? sim.steer * -0.45 : 0;
      const inner = w.children[0], mesh = inner.children[0];
      mesh.rotation.x = Math.abs(inner.quaternion.y) > 0.5 ? this.wheelSpin : -this.wheelSpin;
    }
    // the rear door opens while standing in a bay
    const open = sim.stopBay && sim.stopT > 0.1 ? 1 : 0;
    this.doorK += (open - this.doorK) * Math.min(1, dt * 6);
    if (this.door) this.door.rotation.x = -this.doorK * 1.4;
    if (this.crates) {
      const n = sim.carried().length;
      this.crates.count = n;
      for (let i = 0; i < n; i++) {
        this.m4.makeTranslation((i % 2 ? 0.34 : -0.34), 0.95 + Math.floor(i / 2) * 0.5 * 0, 0.45 + Math.floor(i / 2) * -0.66);
        this.crates.setMatrixAt(i, this.m4);
      }
      this.crates.instanceMatrix.needsUpdate = true;
    }

    // traffic
    const counts = this.cars.map(() => 0);
    for (const car of sim.cars) {
      const im = this.cars[car.model];
      const i = counts[car.model]++;
      if (i >= CAP) continue;
      this.e.set(0, car.h + Math.PI, 0);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v3.set(car.x, car.y, car.z), this.q, this.s3.set(1, 1, 1));
      im.setMatrixAt(i, this.m4);
      im.setColorAt(i, this.col.setHex(car.color).convertSRGBToLinear());
    }
    this.cars.forEach((im, k) => { im.count = Math.min(CAP, counts[k]); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });

    // people
    sim.peds.forEach((p, i) => {
      const per = this.people[i];
      if (!per) return;
      per.root.position.set(p.x, p.y, p.z);
      per.root.rotation.y = p.h;
      if (p.hop > 0) { this.play(per, 'jump', 1.4); per.root.position.y += Math.sin((1 - p.hop / 0.5) * Math.PI) * 0.4; }
      else if (p.moving) this.play(per, 'walk', p.state === 'dodge' ? 2 : p.speed * 0.9);
      else this.play(per, 'idle');
      per.mixer.update(dt);
    });
    // the resident at the door
    if (this.residentT > 0 && this.residentAt) {
      this.residentT -= dt;
      const d = this.residentAt;
      const k = this.residentT > 2.6 ? (3.2 - this.residentT) / 0.6 : this.residentT < 0.5 ? this.residentT / 0.5 : 1;
      const out = clamp(k, 0, 1);
      this.resident.root.visible = true;
      this.resident.root.position.set(d.x + DX[d.face] * 0.45 * out, d.y, d.z + DZ[d.face] * 0.45 * out);
      this.resident.root.rotation.y = HEADING[d.face];
      this.resident.root.scale.setScalar(0.3 + out * 0.7);
      this.resident.mixer.update(dt);
      this.doorPivot.visible = true;
      this.doorPivot.rotation.y = HEADING[d.face] + Math.PI + (1 - Math.abs(1 - out * 2) < 1 ? -out * 1.6 : 0);
      if (this.residentT <= 0) { this.resident.root.visible = false; this.doorPivot.visible = false; }
    }

    // coffee cups spin and bob
    sim.coffees.forEach((c, i) => {
      const cup = this.coffees[i];
      if (!cup) return;
      cup.visible = c.ready;
      cup.rotation.y = this.t * 2;
      cup.position.y = c.y + 0.9 + Math.sin(this.t * 3 + i) * 0.15;
    });

    this.camera(sim, dt);
    const camQ = this.world.camera.quaternion;
    const camYaw = Math.atan2(this.world.camera.position.x - sim.x, this.world.camera.position.z - sim.z);

    // bays and beams for the jobs on offer
    this.beams.begin(camQ);
    this.bays.begin(camQ);
    this.rings.begin(camQ);
    const pulse = 0.75 + Math.sin(this.t * 5) * 0.25;
    for (const o of sim.orders) {
      if (o.state !== 'offered' && o.state !== 'carried') continue;
      const b = o.state === 'offered' ? o.shop : o.house;
      const color = o.vip ? VIP_COLOR : SHOP_COLOR[o.cargo];
      const ns = (b.cell.open & 0b0101) !== 0;
      const y = b.y + 0.04;
      this.bays.add(b.x, y, b.z, ns ? 2.2 : 4.6, ns ? 4.6 : 2.2, 0, color, pulse);
      this.beams.add(b.x, y + 5, b.z, 1.6, 10, camYaw, color, 0.8);
      const rk = (this.t * 0.8 + o.id * 0.37) % 1;
      this.rings.add(b.x, y + 0.02, b.z, 1 + rk * 5, 1 + rk * 5, 0, color, (1 - rk) * 0.8);
    }
    for (const c of sim.coffees) if (c.ready) this.rings.add(c.x, c.y + 0.05, c.z, 2.4 + Math.sin(this.t * 4) * 0.3, 2.4 + Math.sin(this.t * 4) * 0.3, 0, 0xc8843c, 0.7);
    this.beams.end();
    this.bays.end();
    this.rings.end();

    // lights: lamps and headlights at night, brake lights, the turbo glow
    this.glow.begin(camQ);
    const nk = this.night;
    if (nk > 0.05) {
      for (let i = 0; i < this.lampHeads.length; i += 3) this.glow.add(this.lampHeads[i], this.lampHeads[i + 1], this.lampHeads[i + 2], 2.6, 2.6, 0, 0xffd89a, nk);
      for (let i = 0; i < this.lampHeads.length; i += 3) this.glow.add(this.lampHeads[i], this.lampHeads[i + 1] - 3.4, this.lampHeads[i + 2], 6, 6, 0, 0x8a6a3a, nk * 0.35);
    }
    const fx = Math.sin(hv), fz = Math.cos(hv), rx = -fz, rz = fx;
    const vy = sim.y + 0.55;
    if (nk > 0.05) {
      for (const s of [-1, 1]) this.glow.add(sim.x + fx * 1.2 + rx * s * 0.42, vy, sim.z + fz * 1.2 + rz * s * 0.42, 1.1, 1.1, 0, 0xfff2c0, nk);
      // the beam on the road ahead
      this.glow.add(sim.x + fx * 4.5, sim.y + 0.1, sim.z + fz * 4.5, 6, 6, 0, 0x6a5a30, nk * 0.9);
    }
    if (sim.braking || sim.reversing) for (const s of [-1, 1]) this.glow.add(sim.x - fx * 1.2 + rx * s * 0.42, vy, sim.z - fz * 1.2 + rz * s * 0.42, 0.8, 0.8, 0, sim.reversing ? 0xffffff : 0xff3020, 0.9);
    for (const car of sim.cars) {
      const cfx = Math.sin(car.h), cfz = Math.cos(car.h);
      const len = CAR_TYPES[car.model].len;
      if (nk > 0.2) for (const s of [-0.38, 0.38]) this.glow.add(car.x + cfx * len + -cfz * s, car.y + 0.5, car.z + cfz * len + cfx * s, 0.9, 0.9, 0, 0xfff0c0, nk * 0.8);
      if (car.braking) for (const s of [-0.38, 0.38]) this.glow.add(car.x - cfx * len + -cfz * s, car.y + 0.55, car.z - cfz * len + cfx * s, 0.7, 0.7, 0, 0xff2a1a, 0.8);
      if (car.model === 5) this.glow.add(car.x, car.y + 1.25, car.z, 1.1, 1.1, 0, Math.floor(this.t * 4) % 2 ? 0x3a6aff : 0xff3a3a, 0.9);
    }
    if (sim.turboT > 0) for (const s of [-0.3, 0.3]) this.glow.add(sim.x - fx * 1.35 + rx * s, sim.y + 0.3, sim.z - fz * 1.35 + rz * s, 0.9 + Math.random() * 0.5, 0.9, 0, 0xff8a2a, 1);
    this.glow.end();

    // smoke: exhaust, drift and turbo
    if (Math.random() < dt * (sim.turboT > 0 ? 26 : 3) && Math.abs(sim.v) > 0.5) {
      this.smoke.emit(sim.x - fx * 1.45 + rx * 0.3, sim.y + 0.3, sim.z - fz * 1.45 + rz * 0.3, -fx * 1.2, 0.6, -fz * 1.2, 0.6, 0.18, 0.6, sim.turboT > 0 ? 0xffc890 : 0xc8c8c8, 1.5);
    }
    if (sim.slide > 1.0 && Math.abs(sim.v) > 4) {
      for (const s of [-1, 1]) {
        const wx = sim.x - fx * 0.75 + rx * s * 0.42, wz = sim.z - fz * 0.75 + rz * s * 0.42;
        if (Math.random() < dt * 25) this.smoke.emit(wx, sim.y + 0.15, wz, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), 0.7, 0.4, 1.3, 0xeeeeee, 1.4);
        this.skidMarks.push(wx, sim.y + 0.03, wz, hv);
      }
      if (this.skidMarks.length > 240 * 4) this.skidMarks.splice(0, this.skidMarks.length - 240 * 4);
    }
    this.skids.begin(camQ);
    for (let i = 0; i < this.skidMarks.length; i += 4) this.skids.add(this.skidMarks[i], this.skidMarks[i + 1], this.skidMarks[i + 2], 0.42, 0.7, -this.skidMarks[i + 3], 0xffffff, 1);
    this.skids.end();
    // blob shadows under people
    this.blobs.begin(camQ);
    for (const p of sim.peds) this.blobs.add(p.x, p.y + 0.02, p.z, 0.75, 0.75, 0, 0xffffff, 1);
    if (this.residentT > 0 && this.residentAt) this.blobs.add(this.resident.root.position.x, this.residentAt.y + 0.02, this.resident.root.position.z, 0.75, 0.75, 0, 0xffffff, 1);
    this.blobs.end();
    // rain
    this.rainBB.begin(camQ);
    if (this.rainK > 0.02) {
      const n = Math.round(this.rain.length * this.rainK);
      for (let i = 0; i < n; i++) {
        const d = this.rain[i];
        d.y -= d.v * dt;
        if (d.y < -1) d.y += 15;
        this.rainBB.add(this.camLook.x + d.x, this.camLook.y + d.y, this.camLook.z + d.z, 0.06, 0.9, 0, 0xb8cce8, 1);
      }
    }
    this.rainBB.end();
    this.smoke.update(dt, camQ);
    this.sparks.update(dt, camQ);
    this.coins.update(dt, camQ);

    // the arrow: towards the route ahead
    const pts = this.route;
    const show = pts.length >= 6 && !this.menu && this.focusK < 0.2;
    this.arrowK += ((show ? 1 : 0) - this.arrowK) * Math.min(1, dt * 6);
    this.arrow.visible = this.arrowK > 0.02;
    if (this.arrow.visible && pts.length >= 6) {
      const i = Math.min(pts.length / 3 - 1, 4);
      const ax = pts[i * 3] - sim.x, az = pts[i * 3 + 2] - sim.z;
      const yaw = Math.atan2(ax, az);
      this.arrow.position.set(sim.x, sim.y + 2.8 + Math.sin(this.t * 4) * 0.12, sim.z);
      this.arrow.rotation.set(0, yaw + Math.PI, 0);
      this.arrow.scale.setScalar(this.arrowK * 0.95);
    }

    // weather and light
    this.night += (sim.night - this.night) * Math.min(1, dt * 1.5);
    this.rainK += (sim.rain - this.rainK) * Math.min(1, dt * 1.5);
    this.applyLook(this.night, this.rainK);
    this.mats.water.color.setHSL(0.57, 0.62, 0.55 + Math.sin(this.t * 1.5) * 0.03 - this.night * 0.32);
    // at night the van glows faintly in its own paint, so its colour reads in the dark
    const nk2 = clamp(this.night * 1.2 - 0.1, 0, 1);
    this.vanMat.emissive.copy(this.vanGlow).multiplyScalar(nk2);
    this.world.followSun(this.van.position);
    void t; void WALK; void opp;
  }

  private applyLook(night: number, rain: number): void {
    const a = night < 0.5 ? DAY : DUSK, b = night < 0.5 ? DUSK : NIGHT;
    const k = night < 0.5 ? night * 2 : (night - 0.5) * 2;
    const mix = (p: number, q: number) => this.col.setHex(p).lerp(new THREE.Color(q), k).getHex();
    const sky = new THREE.Color(mix(a.sky, b.sky)).lerp(new THREE.Color(0x56606e), rain * 0.45 * (1 - night * 0.6));
    (this.sc.background as THREE.Color).copy(sky);
    const fog = this.sc.fog as THREE.Fog;
    fog.color.setHex(mix(a.fog, b.fog)).lerp(new THREE.Color(0x60687a), rain * 0.4 * (1 - night * 0.6));
    fog.near = lerp(a.fogNear, b.fogNear, k) - rain * 8;
    fog.far = lerp(a.fogFar, b.fogFar, k) - rain * 15;
    this.hemi.color.setHex(mix(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.setHex(mix(a.hemiGround, b.hemiGround));
    this.hemi.intensity = lerp(a.hemi, b.hemi, k) * (1 - rain * 0.18);
    this.sun.color.setHex(mix(a.sun, b.sun));
    this.sun.intensity = lerp(a.sunI, b.sunI, k) * (1 - rain * 0.5);
  }

  // ------------------------------------------------------------------ camera

  private snapCamera(sim: Sim): void {
    this.camYaw = sim.h;
    this.desired(sim, this.camPos, this.camLook);
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);
  }

  private dPos = new THREE.Vector3();
  private dLook = new THREE.Vector3();

  /** Where the camera wants to be: behind and above the van, raised over any lot in between. */
  private desired(sim: Sim, pos: THREE.Vector3, look: THREE.Vector3): void {
    const sp = clamp(sim.v, 0, 22);
    const yaw = this.camYaw;
    const bx = Math.sin(yaw), bz = Math.cos(yaw);
    let dist = (this.menu ? 16 : 9.2) + sp * 0.2;
    let h = (this.menu ? 19 : 11.2) + sp * 0.1;
    const y0 = sim.y + 1.1;
    look.set(sim.x + Math.sin(sim.h) * (3 + sp * 0.25), sim.y + 0.6, sim.z + Math.cos(sim.h) * (3 + sp * 0.25));
    // a delivery: the camera turns towards the door and steps back a little
    let fk = 0;
    if (this.focusK > 0.001 && this.focus) {
      // a delivery shot: from across the street, high, looking at the door with the van in front
      fk = this.focusK;
      const f = this.focus;
      // the camera hangs over the far side of the street (never over the lots across it)
      const fx = f.x + f.dx * 10.5, fz = f.z + f.dz * 10.5, fy = f.y + 11;
      const lx = f.x + f.dx * 4.2, lz = f.z + f.dz * 4.2, ly = f.y + 1;
      look.set(look.x + (lx - look.x) * fk, look.y + (ly - look.y) * fk, look.z + (lz - look.z) * fk);
      this.fPos.set(fx, fy, fz);
    }
    // clearance: the sight line from the van to the camera passes over every lot it crosses
    let need = 0;
    for (let i = 1; i <= 14; i++) {
      const k = i / 14;
      const px = sim.x - bx * dist * k, pz = sim.z - bz * dist * k;
      const cell = this.town.cellAt(px, pz);
      let top = 0;
      if (!cell) top = 1;
      else if (cell.lot) top = this.tops[cell.lot.id] ?? 0;
      else if (cell.level === 0 && sim.y > 1) top = 0; // looking down off the plateau
      if (top <= 0) continue;
      const req = y0 + (top + 0.8 - y0) / Math.max(0.12, k) - sim.y;
      need = Math.max(need, req);
    }
    if (need > h) {
      const lift = Math.min(need, 24) - h;
      h += lift;
      dist = Math.max(4.5, dist - lift * 0.35);
    }
    pos.set(sim.x - bx * dist, sim.y + h, sim.z - bz * dist);
    if (fk > 0) pos.lerp(this.fPos, fk);
  }
  private fPos = new THREE.Vector3();

  private camera(sim: Sim, dt: number): void {
    const cam = this.world.camera;
    if (this.debugCam) {
      cam.position.set(...this.debugCam.pos);
      cam.lookAt(...this.debugCam.look);
      return;
    }
    // the camera swings round behind the van (not while backing up)
    if (sim.v > -0.5) {
      const k = Math.min(1, dt * (2.2 + Math.abs(sim.v) * 0.12));
      this.camYaw = wrapAngle(this.camYaw + wrapAngle(sim.h - this.camYaw) * k);
    }
    if (this.focus) {
      this.focus.t -= dt;
      this.focusK += ((this.focus.t > 0 ? 1 : 0) - this.focusK) * Math.min(1, dt * 3);
      if (this.focus.t <= 0 && this.focusK < 0.01) { this.focus = null; this.focusK = 0; }
    }
    this.desired(sim, this.dPos, this.dLook);
    const kp = Math.min(1, dt * 5), kl = Math.min(1, dt * 8);
    this.camPos.lerp(this.dPos, kp);
    // never below the clearance height
    this.camPos.y = Math.max(this.camPos.y, this.dPos.y - 0.6);
    this.camLook.lerp(this.dLook, kl);
    cam.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 3;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
    }
    cam.lookAt(this.camLook);
    const fov = 52 + (sim.turboT > 0 ? 8 : 0) + this.fovKick;
    this.fovKick *= Math.max(0, 1 - dt * 4);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
  }

  shake(amp: number, sec = 0.35): void { this.shakeAmp = amp; this.shakeT = sec; }

  // ------------------------------------------------------------------ events

  handle(ev: SimEvent, sim: Sim): void {
    switch (ev.type) {
      case 'crash': {
        this.sparks.burst(ev.x, ev.y + 0.6, ev.z, 26, 9, [0xffd23f, 0xffffff, 0xff8a2a], 0.5, 0.4, { up: 2, grav: 9 });
        this.smoke.burst(ev.x, ev.y + 0.5, ev.z, 10, 3, [0xdddddd, 0xbbbbbb], 1, 1.3, { up: 1 });
        this.shake(Math.min(1.2, 0.3 + ev.speed * 0.08), 0.4);
        this.fovKick = -3;
        break;
      }
      case 'scrape': this.sparks.burst(ev.x, sim.y + 0.5, ev.z, 8, 5, [0xffd23f, 0xffffff], 0.35, 0.3, { grav: 9 }); break;
      case 'bump': this.shake(Math.min(0.5, ev.severity * 0.06), 0.25); this.smoke.burst(sim.x, sim.y + 0.2, sim.z, 6, 2, [0xd8c8a8], 0.6, 0.9); break;
      case 'coffee': this.coins.burst(ev.x, ev.y + 1, ev.z, 18, 6, [0xffd23f, 0xc8843c, 0xffffff], 0.6, 0.5, { up: 2 }); break;
      case 'turbo': this.fovKick = 6; this.smoke.burst(sim.x - Math.sin(sim.h) * 1.4, sim.y + 0.3, sim.z - Math.cos(sim.h) * 1.4, 12, 4, [0xffc890, 0xffffff], 0.6, 0.9); break;
      case 'pickup': {
        const b = ev.order.shop;
        this.coins.burst(b.x, b.y + 1.2, b.z, 16, 5, [SHOP_COLOR[ev.order.cargo], 0xffffff], 0.6, 0.5, { up: 3 });
        break;
      }
      case 'deliver': {
        const b = ev.order.house;
        const d = this.houseDoors.get(b);
        if (d) {
          this.residentAt = d;
          this.residentT = 3.2;
          this.resident.mixer.stopAllAction();
          this.resident.cur = '';
          this.play(this.resident, 'emote-yes', 1);
          this.doorPivot.position.set(d.x - DX[(d.face + 1) % 4] * 0.39, d.y, d.z - DZ[(d.face + 1) % 4] * 0.39);
        }
        const ox = d ? d.x : b.x, oz = d ? d.z : b.z;
        if (!this.menu && d) {
          const dl = Math.hypot(b.x - ox, b.z - oz) || 1;
          this.focus = { x: ox, y: b.y, z: oz, t: 2.6, dx: (b.x - ox) / dl, dz: (b.z - oz) / dl };
        }
        this.coins.burst(ox, b.y + 1.6, oz, 30 + ev.tip, 8, [0xffd23f, 0xfff0a0, 0xffffff], 0.9, 0.55, { up: 6, grav: 9 });
        break;
      }
      case 'scare': case 'hop': this.smoke.burst(ev.ped.x, ev.ped.y + 0.2, ev.ped.z, 4, 1.5, [0xeeeeee], 0.4, 0.6); break;
      default: break;
    }
  }

  /** Clears transient effects (menu restarts). */
  reset(): void {
    this.focus = null;
    this.focusK = 0;
    this.smoke.clear(); this.sparks.clear(); this.coins.clear();
    this.skidMarks.length = 0;
    this.residentT = 0;
    this.resident.root.visible = false;
    this.doorPivot.visible = false;
  }

  /** Test hook: the camera, the delivery shot and the resident jump to where they are heading. */
  settle(sim: Sim): void {
    if (this.focus) this.focusK = 1;
    if (this.residentT > 2.55) this.residentT = 2.55;
    this.desired(sim, this.camPos, this.camLook);
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);
  }

  /** Re-aims the camera at once (menu restarts, test placements). */
  snap(sim: Sim): void { this.snapCamera(sim); this.night = sim.night; this.rainK = sim.rain; this.applyLook(this.night, this.rainK); }

  /** A world point in game pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    return this.world.toScreen(this.v3.set(x, y, z));
  }

  /** The point over a bay's building (badges). */
  bayTop(b: Bay): [number, number, number] {
    const top = this.tops[b.lot.id] ?? 4;
    const lx = cx(b.lot.c), lz = cz(b.lot.r);
    return [lx + DX[b.lot.face] * 1.2, top + 1.4, lz + DZ[b.lot.face] * 1.2];
  }
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, o);
    nor.set(g.attributes.normal.array as Float32Array, o);
    col.set(g.attributes.color.array as Float32Array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// ------------------------------------------------------------------ shader warm-up

/**
 * Compiles every program the world uses into the shared renderer once, from the menu's world,
 * so the first Play frame compiles none (see Snow Express's keepPrograms).
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
      const skinned = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const kind = skinned ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const a = mat as THREE.MeshLambertMaterial & THREE.MeshBasicMaterial;
      const key = kind + ':' + mat.type + ':' + mat.customProgramCacheKey() + ':' + JSON.stringify([!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, a.depthTest, m.receiveShadow, m.castShadow]);
      if (seen.has(key)) continue;
      seen.add(key);
      if (skinned) {
        // a skinned mesh needs its skeleton: a clone of the whole figure, wearing a kept copy
        // of the material (a program lives as long as some material uses it)
        let root: THREE.Object3D = o;
        while (root.parent && root.parent !== world) root = root.parent;
        const fig = cloneSkinned(root);
        const c = mat.clone();
        kept.push(c);
        fig.traverse((q) => { if ((q as THREE.Mesh).isMesh) (q as THREE.Mesh).material = c; });
        fig.traverse((q) => { q.frustumCulled = false; });
        s.add(fig);
        continue;
      }
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
  for (const k of temp) (k as THREE.InstancedMesh).dispose();
  s.clear();
}
