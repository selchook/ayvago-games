// Last Convoy: the 3D view of a mission on foot (the drive has its own, driveview.ts, in the same
// world). It builds a district from its plan (town.ts): the kit's street tiles, sidewalks and lots,
// the town packs' buildings (one mesh per block, so a block between the camera and the survivor can
// fade), the props, the street lamps with warm light pools, wrecks, the parked convoy with its
// headlights on. Then it draws the simulation's state every frame: the survivor, the squadmate, the
// dog, the freed survivors and the zombies (pooled rigged figures playing their own clips), chests,
// objective items in light beams, pickups, barricades, flares, and the effects (fx3d.ts). Dusk turns
// to night with the simulation's clock: the sky, the fog and the moonlight darken, lamps glow.
import Phaser from 'phaser';
import { THREE, World3D } from '@core/three';
import { kk, partsOf, mergeParts, soloGeometry, partsBox, keepPrograms, type MergeJob } from './kit';
import { Figure } from './figure';
import { Sprites, Tracers, Casings, Rings, Decals, lightPools, radialTexture } from './fx3d';
import { planTown, CELL, HALF, BUILDINGS, type TownPlan } from './town';
import { HERO, ZOMBIE, BOSS, GUN, WEAPON_MESH, type HeroId, type ZKind } from './defs';
import type { Mission, SimEvent, Zombie, Hero } from './sim';

export const HERO_SCALE = 1.18;
const DOG_SCALE: Record<string, number> = { shepherd: 1.05, pug: 1.15 };
const FOG = { near: 26, far: 64 };
const DUSK = { sky: new THREE.Color(0x3a2c52), hemi: new THREE.Color(0xb8a8d8), moon: new THREE.Color(0xffb88a), ground: new THREE.Color(0x4a3a40) };
const NIGHT = { sky: new THREE.Color(0x0c1022), hemi: new THREE.Color(0x5a6aa8), moon: new THREE.Color(0x9ab4ff), ground: new THREE.Color(0x1a1a2a) };
const ZTINT = [0xffffff, 0xd8f0d0, 0xd8e0f8, 0xf0e0d0, 0xe8d8f0];

/** Three.js objects this view created for a district (freed when the next one is built). */
class Owned {
  private things: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(t: T): T { this.things.push(t); return t; }
  free(): void { for (const t of this.things) t.dispose(); this.things = []; }
}

/** Procedural pieces the kit lacks (sidewalk slabs, the gas canopy, the radio, trees), as coloured triangles. */
export class Extra {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  tri(a: number[], b: number[], d: number[], color: number): void {
    this.c.setHex(color);
    this.pos.push(...a, ...b, ...d);
    for (let k = 0; k < 3; k++) this.col.push(this.c.r, this.c.g, this.c.b);
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: number): void { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, top = true, shade = true): void {
    const s = (k: number) => (shade ? new THREE.Color(color).multiplyScalar(k).getHex() : color);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s(0.9));
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], s(0.8));
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], s(0.85));
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], s(0.75));
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color);
  }
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: number): void { this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color); }
  /** A cone (n sides) from a base radius at y0 to a point at y1. */
  cone(x: number, z: number, r: number, y0: number, y1: number, color: number, n = 7): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      const sh = 0.75 + 0.25 * Math.cos(a - 0.8);
      this.tri([x + Math.sin(a) * r, y0, z + Math.cos(a) * r], [x + Math.sin(b) * r, y0, z + Math.cos(b) * r], [x, y1, z], new THREE.Color(color).multiplyScalar(sh).getHex());
    }
  }
  cyl(x: number, z: number, r: number, y0: number, y1: number, color: number, n = 6): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      const sh = 0.7 + 0.3 * Math.cos(a - 0.8);
      const c = new THREE.Color(color).multiplyScalar(sh).getHex();
      this.quad([x + Math.sin(a) * r, y0, z + Math.cos(a) * r], [x + Math.sin(b) * r, y0, z + Math.cos(b) * r], [x + Math.sin(b) * r, y1, z + Math.cos(b) * r], [x + Math.sin(a) * r, y1, z + Math.cos(a) * r], c);
    }
  }
}

export interface BlockMesh { rect: { x0: number; z0: number; x1: number; z1: number }; meshes: THREE.Mesh[]; mats: THREE.Material[]; fade: number; h: number }

export class View {
  readonly world: World3D;
  readonly root = new THREE.Group();
  readonly town = new THREE.Group();
  readonly dyn = new THREE.Group();
  readonly sprites: Sprites;
  readonly glow: Sprites;
  readonly smoke: Sprites;
  readonly tracers = new Tracers();
  readonly casings = new Casings();
  readonly rings = new Rings();
  readonly decals: Decals;
  private hemi: THREE.HemisphereLight;
  private moon: THREE.DirectionalLight;
  private owned = new Owned();
  /** The warm light pool texture (lamps, headlights). */
  readonly poolTexture: THREE.Texture;
  /** The effects: always shown (on foot and on the drive). */
  readonly fx = new THREE.Group();
  private flashTex: THREE.Texture;
  private blocks: BlockMesh[] = [];
  plan: TownPlan | null = null;
  // the cast
  hero: Figure;
  private heroId: HeroId;
  buddy: Figure | null = null;
  private buddyId: HeroId | null = null;
  dog: Figure;
  private dogKind = 'shepherd';
  private survivors = new Map<number, Figure>();
  private survPool: Figure[] = [];
  private zPool: Figure[] = [];
  private zOf = new Map<number, Figure>();
  // things
  private chestMeshes = new Map<number, THREE.Mesh>();
  private itemMeshes = new Map<number, THREE.Group>();
  private pickMeshes = new Map<number, THREE.Mesh>();
  private wallMeshes = new Map<number, THREE.Group>();
  private flareMeshes: THREE.Mesh[] = [];
  private beams: THREE.Mesh[] = [];
  private convoyGroup = new THREE.Group();
  private heroPool!: THREE.Mesh;
  private muzzle: THREE.Sprite;
  private muzzleT = 0;
  private chargeRing: THREE.Mesh;
  /** The camera's focus (smoothed) and a screenshot override. */
  private cam = new THREE.Vector3(0, 0, 0);
  shotCam: [number[], number[]] | null = null;
  /** An absolute camera (the map's flyover): position and look-at. */
  freeCam: [number[], number[]] | null = null;
  /** Night 0..1 last applied. */
  private nightK = -1;
  mode: 'foot' | 'drive' | 'menu' = 'foot';
  private time = 0;
  private tmp = new THREE.Vector3();

  constructor(private scene: Phaser.Scene, o: { hero: HeroId; dog: string; quality?: number }) {
    this.world = new World3D(scene, { fov: 40, background: 0x2a2440, fog: { color: 0x2a2440, near: FOG.near, far: FOG.far }, quality: o.quality ?? 0.9, far: 220 });
    const w = this.world;
    this.moon = w.addLights({ sky: 0xb8a8d8, ground: 0x4a3a40, ambient: 1.5, sun: 0xffb88a, intensity: 1.6, dir: [-0.6, 1, 0.55], extent: 22 });
    this.hemi = w.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    w.scene.add(this.root);
    this.root.add(this.town, this.dyn);
    this.poolTexture = radialTexture([[0, 'rgba(255,214,150,0.85)'], [0.45, 'rgba(255,190,110,0.32)'], [1, 'rgba(255,170,90,0)']]);
    this.flashTex = radialTexture([[0, 'rgba(255,255,230,1)'], [0.3, 'rgba(255,220,120,0.9)'], [1, 'rgba(255,140,40,0)']]);
    const dot = radialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    this.sprites = new Sprites(500, dot, 0.32, false, 9, 1.5);
    this.glow = new Sprites(300, dot, 0.45, true, -0.5, 1.2);
    this.smoke = new Sprites(160, dot, 1.4, false, -0.6, 0.8);
    this.decals = new Decals(26);
    w.scene.add(this.fx);
    this.fx.add(this.sprites.points, this.glow.points, this.smoke.points, this.tracers.lines, this.casings.mesh, this.rings.group);
    this.dyn.add(this.decals.group);
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.muzzle.scale.setScalar(1.1);
    this.muzzle.visible = false;
    this.dyn.add(this.muzzle);
    const poolMat = new THREE.MeshBasicMaterial({ map: this.poolTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, color: 0xffe0b0 });
    this.heroPool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat);
    this.heroPool.rotation.x = -Math.PI / 2;
    this.heroPool.position.y = 0.08;
    this.dyn.add(this.heroPool);
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.visible = false;
    this.dyn.add(this.chargeRing);
    this.heroId = o.hero;
    this.hero = this.heroFigure(o.hero);
    this.dyn.add(this.hero.root);
    this.dogKind = o.dog;
    this.dog = new Figure(o.dog === 'pug' ? 'dog-pug' : 'dog-shepherd', DOG_SCALE[o.dog] ?? 1);
    this.dyn.add(this.dog.root);
    this.dyn.add(this.convoyGroup);
    // zombies: a pool per model file
    for (const f of ['zombie-basic', 'zombie-basic', 'zombie-ribcage', 'zombie-arm', 'zombie-chubby']) for (let i = 0; i < 4; i++) this.newZombie(f);
  }

  private heroFigure(id: HeroId): Figure {
    const f = new Figure('heroes', HERO_SCALE, ['h-' + id, ...(id === 'lis' ? ['shoulder'] : []), WEAPON_MESH[HERO[id].gun]]);
    // the roll and the whirl turn round the body's middle
    f.spin.position.y = 0.75;
    f.body.position.y = -0.75;
    return f;
  }

  private newZombie(file: string): Figure {
    const f = new Figure(file, 1);
    f.tag = file;
    f.root.visible = false;
    this.zPool.push(f);
    this.dyn.add(f.root);
    return f;
  }

  setHero(id: HeroId): void {
    if (id === this.heroId) return;
    this.heroId = id;
    this.hero.show(['h-' + id, ...(id === 'lis' ? ['shoulder'] : []), WEAPON_MESH[HERO[id].gun]]);
  }

  setDog(kind: string): void {
    if (kind === this.dogKind) return;
    this.dogKind = kind;
    this.dyn.remove(this.dog.root);
    this.dog.dispose();
    this.dog = new Figure(kind === 'pug' ? 'dog-pug' : 'dog-shepherd', DOG_SCALE[kind] ?? 1);
    this.dyn.add(this.dog.root);
  }

  setBuddy(id: HeroId | null): void {
    if (id === this.buddyId) return;
    this.buddyId = id;
    if (!id) { if (this.buddy) this.buddy.root.visible = false; return; }
    if (!this.buddy) { this.buddy = this.heroFigure(id); this.dyn.add(this.buddy.root); }
    this.buddy.show(['h-' + id, ...(id === 'lis' ? ['shoulder'] : []), WEAPON_MESH[HERO[id].gun]]);
    this.buddy.root.visible = true;
  }

  setMode(m: View['mode']): void {
    this.mode = m;
    this.root.visible = m !== 'drive';
  }

  // ---------------------------------------------------------------- the town

  /** Builds a district (or rebuilds it for a new mission there). */
  buildTown(plan: TownPlan, convoy: { id: string; x: number; z: number; rot: number }): void {
    this.owned.free();
    this.town.clear();
    this.blocks = [];
    this.plan = plan;
    const jobs: MergeJob[] = [];
    const ex = new Extra();
    const at = (x: number, z: number, rot: number, s = 1, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
    // the ground: the district's colour under everything, a wide apron beyond the map
    const gcol = plan.ground;
    ex.flat(-HALF - 70, -HALF - 70, HALF + 70, HALF + 70, -0.02, plan.outside === 'hill' ? 0x3a5a36 : 0x3a3a40);
    // roads
    const tileKey = { straight: 'props:street-straight', turn: 'props:street-turn', t: 'props:street-t', cross: 'props:street-4way' };
    for (const r of plan.roads) {
      const crack = r.kind === 'straight' && (r.i * 7 + r.j * 3) % 5 === 0;
      const key = crack ? ((r.i + r.j) % 2 ? 'props:street-crack-1' : 'props:street-crack-2') : tileKey[r.kind];
      jobs.push({ key, m: at((r.i + 0.5) * CELL - HALF, (r.j + 0.5) * CELL - HALF, r.rot + ROAD_ROT[r.kind]) });
    }
    // blocks: sidewalks round the buildings, lots' ground
    for (const b of plan.blocks) {
      const { x0, z0, x1, z1 } = b.rect;
      const col = b.kind === 'bldg' ? 0x8a8a90 : b.kind === 'park' || b.kind === 'tower' ? 0x4e7a42 : b.kind === 'yard' ? 0x7a7a72 : b.kind === 'gas' ? 0x5a5a60 : b.kind === 'square' ? 0x9a9088 : 0x48484e;
      ex.box(x0, -0.02, z0, x1, 0.12, z1, col, true, true);
      if (b.kind === 'bldg' || b.kind === 'square') {
        // a curb line
        ex.box(x0, 0.12, z0, x1, 0.16, z0 + 0.25, 0xb0b0b4); ex.box(x0, 0.12, z1 - 0.25, x1, 0.16, z1, 0xb0b0b4);
        ex.box(x0, 0.12, z0, x0 + 0.25, 0.16, z1, 0xb0b0b4); ex.box(x1 - 0.25, 0.12, z0, x1, 0.16, z1, 0xb0b0b4);
      }
      if (b.kind === 'square') ex.box((x0 + x1) / 2 - 5, 0.12, (z0 + z1) / 2 - 5, (x0 + x1) / 2 + 5, 0.18, (z0 + z1) / 2 + 5, 0xa89a88);
      if (b.kind === 'lot') for (let k = 0; k < 6; k++) ex.box(x0 + 2 + k * 3.6, 0.125, z0 + 11.6, x0 + 2.15 + k * 3.6, 0.13, z0 + 16, 0xd8d8d0, true, false);
      void gcol;
    }
    // props (and wrecks, canopy, radio, trees)
    for (const p of plan.props) {
      if (p.key === 'gas:canopy') { this.canopy(ex, p.x, p.z); continue; }
      if (p.key === 'hill:radio') { this.radio(ex, p.x, p.z); continue; }
      if (p.key === 'park:tree') { this.tree(ex, p.x, p.z, p.rot); continue; }
      if (p.key.startsWith('v:')) { for (const only of ['body', 'wheel-fl', 'wheel-fr', 'wheels-back']) jobs.push({ key: 'vehicles:' + p.key.slice(2), only, m: at(p.x, p.z, p.rot), tint: p.tint, material: 'lit' }); continue; }
      jobs.push({ key: 'props:' + p.key, m: at(p.x, p.z, p.rot, p.s ?? 1, p.y ?? 0), tint: p.tint });
    }
    // lamps
    const pools: { x: number; z: number; r: number; color: number }[] = [];
    for (const l of plan.lamps) {
      jobs.push({ key: 'props:street-light', m: at(l.x, l.z, l.rot) });
      // the lamp's head hangs about 2.7 m out from the post
      pools.push({ x: l.x + Math.sin(l.rot) * 2.6, z: l.z + Math.cos(l.rot) * 2.6, r: 6.5, color: 0xffc890 });
    }
    // merge the statics: one lit mesh, the glowing lamp heads
    const merged = mergeParts(jobs, ex);
    for (const [name, geo] of merged) {
      this.owned.add(geo);
      const mat = this.owned.add(name === 'lamp' ? new THREE.MeshBasicMaterial({ color: 0xfff0c0 }) : name === 'head' ? new THREE.MeshBasicMaterial({ color: 0xfff4d0 }) : name === 'brake' ? new THREE.MeshBasicMaterial({ color: 0xff3020 }) : new THREE.MeshLambertMaterial({ vertexColors: true }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = name === 'lit';
      mesh.castShadow = false;
      this.town.add(mesh);
    }
    // buildings: one mesh per block (and one for the outer ring), walls flat-shaded, windows lit at random
    const groups = new Map<number, { jobs: MergeJob[]; rect: BlockMesh['rect']; h: number }>();
    for (const b of plan.buildings) {
      const def = BUILDINGS.find((d) => d.key === b.key)!;
      const box = partsBox('buildings:' + b.key);
      const sx = b.w / (box.max.x - box.min.x), sz = b.d / (box.max.z - box.min.z), sy = b.h / (box.max.y - box.min.y);
      void def;
      // the model's front faces +z with its front at z = 0: centre it on the footprint
      const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), new THREE.Vector3(1, 1, 1))
        .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
        .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2));
      const blk = plan.blocks.findIndex((k) => b.x >= k.rect.x0 && b.x <= k.rect.x1 && b.z >= k.rect.z0 && b.z <= k.rect.z1);
      const gi = blk >= 0 ? blk : 100 + Math.round(Math.atan2(b.x, b.z) * 2);
      let g = groups.get(gi);
      if (!g) { g = { jobs: [], rect: { x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 }, h: 0 }; groups.set(gi, g); }
      g.jobs.push({ key: 'buildings:' + b.key, m, tint: b.tint });
      g.rect = { x0: Math.min(g.rect.x0, b.x - b.w / 2), z0: Math.min(g.rect.z0, b.z - b.d / 2), x1: Math.max(g.rect.x1, b.x + b.w / 2), z1: Math.max(g.rect.z1, b.z + b.d / 2) };
      g.h = Math.max(g.h, b.h);
    }
    for (const g of groups.values()) {
      const out = mergeParts(g.jobs);
      const bm: BlockMesh = { rect: g.rect, meshes: [], mats: [], fade: 1, h: g.h };
      for (const [name, geo] of out) {
        this.owned.add(geo);
        let mat: THREE.Material;
        if (name === 'glass') {
          // windows: some lit warm, most dark
          const col = geo.getAttribute('color') as THREE.BufferAttribute;
          for (let t = 0; t < col.count; t += 6) {
            const lit = Math.sin(t * 12.9898 + g.rect.x0 * 78.233) * 43758.5453 % 1;
            const on = Math.abs(lit) < 0.22;
            for (let k = t; k < Math.min(col.count, t + 6); k++) col.setXYZ(k, on ? 1 : 0.09, on ? 0.78 : 0.11, on ? 0.42 : 0.17);
          }
          mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
        } else mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true });
        this.owned.add(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.town.add(mesh);
        bm.meshes.push(mesh);
        bm.mats.push(mat);
      }
      this.blocks.push(bm);
    }
    // the parked convoy (its headlights on, a pool of light in front)
    this.setConvoy(convoy.id, convoy.x, convoy.z, convoy.rot);
    pools.push({ x: convoy.x + Math.sin(convoy.rot) * 6, z: convoy.z + Math.cos(convoy.rot) * 6, r: 6, color: 0xfff0c8 });
    if (plan.pump) pools.push({ x: plan.pump.x, z: plan.pump.z, r: 8, color: 0xd8f0ff });
    if (plan.radio) pools.push({ x: plan.radio.x, z: plan.radio.z, r: 5, color: 0xa0ffb0 });
    const pm = lightPools(pools, this.poolTexture);
    this.owned.add(pm.geometry);
    this.owned.add(pm.material as THREE.Material);
    this.town.add(pm);
    keepPrograms(this.world.renderer, this.world.scene, this.world.camera);
  }

  private canopy(ex: Extra, x: number, z: number): void {
    for (const [dx, dz] of [[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]]) ex.box(x + dx - 0.25, 0, z + dz - 0.25, x + dx + 0.25, 4.6, z + dz + 0.25, 0xd8d8d8);
    ex.box(x - 6.5, 4.6, z - 4.5, x + 6.5, 5.3, z + 4.5, 0xe8e4dc);
    ex.box(x - 6.6, 4.6, z - 4.6, x + 6.6, 4.9, z + 4.6, 0xd8402a);
    for (const dx of [-3.2, 3.2]) {
      ex.box(x + dx - 0.45, 0, z - 0.3, x + dx + 0.45, 1.7, z + 0.3, 0xc83a2a);
      ex.box(x + dx - 0.35, 1.0, z - 0.31, x + dx + 0.35, 1.5, z - 0.29, 0x2a3a4a, true, false);
      ex.box(x + dx - 0.5, 0, z - 0.6, x + dx + 0.5, 0.2, z + 0.6, 0x9a9a9a);
    }
  }

  private radio(ex: Extra, x: number, z: number): void {
    ex.box(x - 1, 0, z - 0.7, x + 1, 1.4, z + 0.7, 0x5a6a5a);
    ex.box(x - 0.8, 1.4, z - 0.5, x + 0.8, 1.55, z + 0.5, 0x3a4a3a);
    ex.box(x - 0.6, 0.6, z + 0.7, x + 0.6, 1.1, z + 0.72, 0x1a2a1a, true, false);
    ex.cyl(x + 0.6, z, 0.06, 1.5, 7.5, 0xb8b8b8, 5);
    ex.cone(x + 0.6, z, 0.4, 6.5, 7.6, 0xd8d8d8, 5);
  }

  private tree(ex: Extra, x: number, z: number, rot: number): void {
    const h = 4.2 + (Math.abs(Math.sin(rot * 9.1)) * 1.6);
    ex.cyl(x, z, 0.22, 0, h * 0.4, 0x5a3a24, 6);
    ex.cone(x, z, 1.9, h * 0.3, h * 0.78, 0x2e5a34, 8);
    ex.cone(x, z, 1.4, h * 0.58, h, 0x3a6a3e, 8);
  }

  /** The convoy's vehicle parked (plain or armoured), its lights on. */
  setConvoy(id: string, x: number, z: number, rot: number): void {
    this.convoyGroup.clear();
    for (const p of partsOf('vehicles:' + id)) {
      const mat = p.material === 'head' ? new THREE.MeshBasicMaterial({ color: 0xfff4d0 }) : p.material === 'brake' ? new THREE.MeshBasicMaterial({ color: 0xff3a2a }) : new THREE.MeshLambertMaterial({ vertexColors: true });
      this.owned.add(mat);
      const mesh = new THREE.Mesh(p.geo, mat);
      mesh.applyMatrix4(p.mat);
      mesh.castShadow = true;
      this.convoyGroup.add(mesh);
    }
    this.convoyGroup.position.set(x, 0, z);
    this.convoyGroup.rotation.y = rot;
  }

  // ---------------------------------------------------------------- per frame

  /** Draws the simulation's state (dt: the frame's time, 0 while paused). */
  sync(s: Mission, dt: number): void {
    this.time += dt;
    this.applyNight(s.night);
    this.syncHero(s, dt);
    this.syncBuddy(s, dt);
    this.syncDog(s, dt);
    this.syncSurvivors(s, dt);
    this.syncZombies(s, dt);
    this.syncThings(s, dt);
    this.sprites.update(dt); this.glow.update(dt); this.smoke.update(dt);
    this.tracers.update(dt); this.casings.update(dt); this.rings.update(dt); this.decals.update(dt);
    this.muzzleT -= dt;
    this.muzzle.visible = this.muzzleT > 0;
    this.follow(s, dt);
    this.fadeBlocks(s.hero);
  }

  private applyNight(n: number): void {
    const k = Math.round(n * 60) / 60;
    if (k === this.nightK) return;
    this.nightK = k;
    const w = this.world;
    const c = DUSK.sky.clone().lerp(NIGHT.sky, k);
    (w.scene.background as THREE.Color).copy(c);
    (w.scene.fog as THREE.Fog).color.copy(c);
    this.hemi.color.copy(DUSK.hemi).lerp(NIGHT.hemi, k);
    this.hemi.groundColor.copy(DUSK.ground).lerp(NIGHT.ground, k);
    this.hemi.intensity = 1.55 - 0.45 * k;
    this.moon.color.copy(DUSK.moon).lerp(NIGHT.moon, k);
    this.moon.intensity = 1.7 - 0.6 * k;
    (this.heroPool.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.4 * k;
  }

  private follow(s: Mission, dt: number): void {
    const h = s.hero, cam = this.world.camera;
    const lead = 2.2;
    const tx = h.x + h.aimX * lead * 0.6, tz = h.z + h.aimZ * lead * 0.6 - 0.6;
    const k = dt > 0 ? 1 - Math.exp(-dt * 5) : 1;
    if (this.cam.lengthSq() === 0 || dt > 0.2) this.cam.set(tx, 0, tz);
    this.cam.x += (tx - this.cam.x) * k; this.cam.z += (tz - this.cam.z) * k;
    if (this.freeCam) {
      const [p, l] = this.freeCam;
      cam.position.set(p[0], p[1], p[2]);
      cam.lookAt(l[0], l[1], l[2]);
    } else if (this.shotCam) {
      const [p, l] = this.shotCam;
      cam.position.set(h.x + p[0], p[1], h.z + p[2]);
      cam.lookAt(h.x + l[0], l[1], h.z + l[2]);
    } else {
      cam.position.set(this.cam.x, 17.2, this.cam.z + 9.4);
      cam.lookAt(this.cam.x, 0, this.cam.z);
    }
    this.world.followSun(this.tmp.set(h.x, 0, h.z));
  }

  /** A block between the camera and the survivor fades so they stay in sight. */
  private fadeBlocks(h: Hero): void {
    for (const b of this.blocks) {
      const r = b.rect;
      const inFront = r.z1 > h.z - 0.5 && r.z0 < h.z + Math.min(14, b.h * 1.1) && r.x0 < h.x + 4 && r.x1 > h.x - 4;
      const want = inFront ? 0.22 : 1;
      b.fade += (want - b.fade) * 0.15;
      for (const m of b.mats) {
        (m as THREE.MeshLambertMaterial).opacity = b.fade;
        m.depthWrite = b.fade > 0.95;
      }
    }
  }

  /** The clip a survivor figure plays for a state. */
  private heroAnim(f: Figure, h: Hero, gunOut: boolean, moving: boolean, speed: number, dt: number): void {
    const melee = !gunOut;
    f.spin.rotation.set(0, 0, 0);
    f.spin.position.z = 0;
    if (!h.alive) { f.play('Death', { once: true }); return; }
    if (h.dodgeT > 0) {
      f.play('Duck', { speed: 2.2, at: 0.3 });
      f.spin.rotation.x = (1 - h.dodgeT / 0.42) * Math.PI * 2;
      return;
    }
    if (h.grab >= 0) { f.play('No', { speed: 1.6 }); return; }
    if (h.hurtT > 0.2 && h.step === 'none') { f.play('HitReact', { once: true, restart: f.name !== 'HitReact', speed: 1.4 }); return; }
    if (h.useT > 0) { f.play(h.useKind === 'open' ? 'Duck' : 'Punch', { speed: 1.2 }); return; }
    if (melee) {
      const k = h.stepLen > 0 ? h.stepT / h.stepLen : 0;
      switch (h.step) {
        case 's1': case 'single': f.play('Slash', { restart: true, speed: 0.87 / h.stepLen, fade: 0.06 }); return;
        case 's2': f.play('Stab', { restart: true, speed: 0.87 / h.stepLen, fade: 0.06 }); return;
        case 'pre3': f.play('Slash', { speed: 0.04, at: 0.15, fade: 0.1 }); return;
        case 'fa': f.play('Run_Slash', { restart: f.name !== 'Run_Slash', speed: 1.4, fade: 0.05 }); f.spin.rotation.y = Math.min(1, k * 1.25) * Math.PI * 2; return;
        case 'fb': f.play('Slash', { restart: f.name === 'Slash' && h.stepT < dt * 1.5, speed: 1.8, at: 0.25, fade: 0.04 }); return;
        case 'fc': f.play('Run_Stab', { restart: f.name !== 'Run_Stab', speed: 1.3, fade: 0.05 }); return;
        default: break;
      }
    } else {
      if (h.step === 'pre3') { f.play('Idle_Gun', { speed: 0.3 }); return; }
      if (h.step === 'fc') { f.play('Duck', { speed: 2, at: 0.4 }); f.spin.rotation.y = (h.stepT / h.stepLen) * Math.PI * 0.5; }
    }
    f.spin.position.z = -h.recoil * 0.14;
    if (moving) f.play(melee ? (speed > 3.2 ? 'Run' : 'Walk') : speed > 3.2 ? 'Run_Gun' : 'Walk_Gun', { speed: Math.max(0.6, speed / (melee ? 5 : 4.6)) });
    else f.play(melee ? 'Idle' : 'Idle_Gun');
  }

  private syncHero(s: Mission, dt: number): void {
    const h = s.hero, f = this.hero;
    const H = HERO[h.id];
    const gun = h.weapon === 'gun' && h.swapT <= 0.12;
    f.show(['h-' + h.id, ...(h.id === 'lis' ? ['shoulder'] : []), WEAPON_MESH[gun ? H.gun : H.melee]]);
    const speed = Math.hypot(h.vx, h.vz);
    this.heroAnim(f, h, gun, speed > 0.4, speed, dt);
    f.root.position.set(h.x, 0, h.z);
    f.root.rotation.y = h.face;
    // the reload tilts the gun down and back up (the weapon, never an arm)
    if (f.weapon) f.weapon.rotation.z = h.reloadT > 0 ? Math.sin(Math.min(1, 1 - h.reloadT / (s.gun.reload * s.m.reload)) * Math.PI) * 0.9 : 0;
    f.update(dt);
    // the charge: a ring on the ground filling, the hand glowing
    const charging = h.step === 'pre3';
    this.chargeRing.visible = charging || h.buffT > 0;
    if (charging) {
      const k = Math.min(1, h.chargeT / (0.35 * s.m.charge));
      this.chargeRing.position.set(h.x, 0.09, h.z);
      this.chargeRing.scale.setScalar(0.8 + k * 0.5);
      (this.chargeRing.material as THREE.MeshBasicMaterial).color.setHex(k >= 1 ? 0xffe07a : 0xff8a2a);
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + k * 0.6;
      f.setGlow(k >= 1 ? 0x6a4a10 : 0x3a2008);
    } else if (h.buffT > 0) {
      this.chargeRing.position.set(h.x, 0.09, h.z);
      this.chargeRing.scale.setScalar(1.2 + Math.sin(this.time * 10) * 0.05);
      (this.chargeRing.material as THREE.MeshBasicMaterial).color.setHex(0xff4a6a);
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = 0.5;
      f.setGlow(0x2a0810);
    } else f.setGlow(h.invuln > 0.5 ? 0x1a2a3a : 0);
    this.heroPool.position.set(h.x + h.aimX * 2.2, 0.08, h.z + h.aimZ * 2.2);
  }

  private syncBuddy(s: Mission, dt: number): void {
    const b = s.buddy;
    this.setBuddy(b ? b.id : null);
    if (!b || !this.buddy) return;
    const f = this.buddy;
    f.root.position.set(b.x, 0, b.z);
    f.root.rotation.y = b.face;
    if (b.down > 0) f.play('Death', { once: true });
    else if (b.moving) f.play('Run_Gun', { speed: 1 });
    else f.play('Idle_Gun');
    f.spin.position.z = b.firedT < 0.1 ? -0.08 : 0;
    f.update(dt);
  }

  private syncDog(s: Mission, dt: number): void {
    const g = s.dog, f = this.dog;
    f.root.position.set(g.x, 0, g.z);
    f.root.rotation.y = g.face;
    const moving = g.state !== 'down' && g.state !== 'wait';
    if (g.state === 'down') f.play('Death', { once: true });
    else if (g.state === 'attack' && g.biteT > 0.5) f.play('Attack', { speed: 1.6, restart: f.name !== 'Attack' });
    else if (g.state === 'wait') f.play('Eating');
    else if (g.state === 'sniff') f.play('Run', { speed: 0.9 });
    else if (moving && this.dogSpeed(g) > 1) f.play(this.dogSpeed(g) > 3.5 ? 'Run' : 'Walk', { speed: Math.max(0.7, this.dogSpeed(g) / 5) });
    else f.play(g.barkT > 0 ? 'Attack' : 'Idle', g.barkT > 0 ? { speed: 2 } : {});
    f.update(dt);
    // the scent trail: dust along the path the nose found
    if (g.state === 'sniff' && dt > 0) {
      for (let i = g.ti; i < g.trail.length; i += 2) if (Math.random() < dt * 3) { const p = g.trail[i]; this.glow.dot(p.x + (Math.random() - 0.5) * 0.6, 0.25, p.z + (Math.random() - 0.5) * 0.6, 0, 0.4, 0, 0x8affc8, 1.4, 0.8); }
    }
    this.lastDog.x = g.x; this.lastDog.z = g.z;
  }
  private lastDog = { x: 0, z: 0, v: 0 };
  private dogSpeed(g: { x: number; z: number }): number {
    const v = Math.hypot(g.x - this.lastDog.x, g.z - this.lastDog.z) * 60;
    this.lastDog.v += (v - this.lastDog.v) * 0.2;
    return this.lastDog.v;
  }

  private syncSurvivors(s: Mission, dt: number): void {
    const seen = new Set<number>();
    for (const v of s.survivors) {
      seen.add(v.id);
      let f = this.survivors.get(v.id);
      if (!f) {
        f = this.survPool.pop() ?? new Figure('heroes', HERO_SCALE);
        this.survivors.set(v.id, f);
        this.dyn.add(f.root);
        f.root.visible = true;
        f.show(['h-' + v.body, ...(v.body === 'lis' ? ['shoulder'] : []), ...(v.armed ? [WEAPON_MESH[GUN[HERO[v.body].gun].id]] : [])]);
        f.setTint(v.tint);
      }
      f.root.position.set(v.x, 0, v.z);
      f.root.rotation.y = v.face;
      if (v.state === 'trapped') f.play('Wave');
      else if (v.state === 'down') f.play('Death', { once: true });
      else if (v.state === 'safe') f.play('Yes');
      else f.play(v.armed ? 'Run_Gun' : 'Run');
      f.root.visible = v.state !== 'safe' || Math.hypot(v.x - s.convoy.x, v.z - s.convoy.z) > 2.6;
      f.update(dt);
    }
    for (const [id, f] of this.survivors) if (!seen.has(id)) { f.root.visible = false; this.survPool.push(f); this.survivors.delete(id); }
  }

  private zombieFile(z: Zombie): string { return z.boss ? 'zombie-chubby' : ZOMBIE[z.kind as Exclude<ZKind, 'boss'>].file; }

  private syncZombies(s: Mission, dt: number): void {
    const seen = new Set<number>();
    for (const z of s.zombies) {
      seen.add(z.id);
      let f = this.zOf.get(z.id);
      const file = this.zombieFile(z);
      if (!f) {
        f = this.zPool.find((p) => p.free && p.tag === file) ?? this.newZombie(file);
        f.free = false;
        f.reset();
        f.root.visible = true;
        this.zOf.set(z.id, f);
        f.setTint(z.boss ? BOSS[z.boss].tint : ZTINT[z.id % ZTINT.length]);
      }
      const sc = z.scale;
      f.root.scale.setScalar(sc);
      f.root.position.set(z.x, z.y, z.z);
      f.root.rotation.y = z.face;
      if (z.hitT < 0.02) f.flash();
      this.zombieAnim(f, z);
      if (z.state === 'dead') {
        // corpses sink and fade
        if (z.deadT > 2.4) f.root.position.y = -(z.deadT - 2.4) * 0.5;
      }
      f.root.visible = z.state !== 'lurk';
      f.setGlow(z.armor ? 0x1a3a6a : z.burn > 0 ? 0x5a2008 : z.state === 'tell' && (z.kind === 'arm' || z.kind === 'chubby' || z.boss) ? (Math.floor(this.time * 12) % 2 ? 0x5a1008 : 0x200404) : 0);
      f.update(dt);
      if (z.burn > 0 && dt > 0 && Math.random() < dt * 14) this.glow.dot(z.x + (Math.random() - 0.5) * 0.6, 1 + Math.random(), z.z + (Math.random() - 0.5) * 0.6, 0, 1.2, 0, 0xff7a2a, 0.5);
    }
    for (const [id, f] of this.zOf) if (!seen.has(id)) { f.root.visible = false; f.free = true; this.zOf.delete(id); }
  }

  private zombieAnim(f: Figure, z: Zombie): void {
    const crawl = z.kind === 'crawler';
    switch (z.state) {
      case 'dead': f.play('Death', { once: true, fade: 0.08 }); return;
      case 'lurk': f.play('Crawl', { speed: 0 }); return;
      case 'rise': f.play('Crawl', { speed: 1.4 }); return;
      case 'stun': f.play('HitReact', { once: true, restart: f.name !== 'HitReact', speed: 1.2 }); return;
      case 'grab': f.play('Idle_Attack', {}); if (!f.has('Idle_Attack')) f.play('Punch'); return;
      case 'tell':
        if (z.boss) { f.play(z.move === 'slam' ? 'Jump' : z.move === 'roar' ? 'No' : 'Idle_Attack', { speed: z.move === 'slam' ? 0.5 : 1 }); return; }
        if (z.move === 'charge') { f.play('Idle_Attack', { speed: 1.6 }); return; }
        f.play(f.has('Idle_Attack') && z.kind !== 'arm' ? 'Idle_Attack' : 'Punch', { speed: z.kind === 'arm' ? 0.4 : 1, restart: f.name !== 'Idle_Attack' && f.name !== 'Punch' });
        return;
      case 'strike':
        if (z.boss) { f.play('Jump_Land', { once: true }); return; }
        f.play(crawl ? 'Crawl' : 'Punch', { speed: 1.6, restart: f.name !== 'Punch' && !crawl });
        return;
      case 'charge': f.play('Run_Attack', { speed: 1.4 }); return;
      case 'idle': f.play(crawl ? 'Crawl' : 'Idle', crawl ? { speed: 0 } : {}); return;
      case 'wander': f.play(crawl ? 'Crawl' : 'Walk', { speed: 0.8 }); return;
      case 'hunt': {
        if (crawl) { f.play('Crawl', { speed: 1.3 }); return; }
        const fast = z.run > 2.6;
        f.play(fast || z.boss ? 'Run' : 'Walk', { speed: fast ? z.run / 4 : z.boss ? 0.9 : Math.max(0.8, z.run / 1.6) });
        return;
      }
    }
  }

  private itemMesh(kind: string): THREE.Group {
    const g = new THREE.Group();
    const ex = new Extra();
    if (kind === 'fuel') { ex.box(-0.22, 0, -0.12, 0.22, 0.55, 0.12, 0xd83a2a); ex.box(-0.1, 0.55, -0.04, 0.12, 0.65, 0.04, 0x2a2a2a); ex.box(0.12, 0.5, -0.03, 0.2, 0.68, 0.03, 0xe8c83a); }
    else if (kind === 'part') { ex.cyl(0, 0, 0.32, 0.15, 0.4, 0x8a8a90, 8); ex.cyl(0, 0, 0.12, 0.4, 0.55, 0x5a5a60, 6); ex.box(-0.4, 0, -0.08, 0.4, 0.15, 0.08, 0x6a6a70); }
    else if (kind === 'key') { ex.box(-0.08, 0.2, -0.05, 0.08, 0.6, 0.05, 0xffd23f); ex.cyl(0, 0, 0.18, 0.6, 0.75, 0xffd23f, 8); ex.box(0.08, 0.25, -0.04, 0.2, 0.32, 0.04, 0xffd23f); }
    else { ex.box(-0.25, 0, -0.18, 0.25, 0.45, 0.18, 0x2a2a30); ex.box(-0.25, 0.3, -0.19, 0.25, 0.4, 0.19, 0x4ad86a, false, false); ex.box(-0.15, 0.45, -0.05, -0.05, 0.55, 0.05, 0xd83a2a); ex.box(0.05, 0.45, -0.05, 0.15, 0.55, 0.05, 0xd8d8d8); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ex.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(ex.col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(this.owned.add(geo), this.owned.add(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2a10 })));
    mesh.scale.setScalar(1.5);
    mesh.castShadow = true;
    g.add(mesh);
    return g;
  }

  private beam(color: number): THREE.Mesh {
    const geo = this.owned.add(new THREE.CylinderGeometry(0.55, 0.85, 14, 14, 1, true));
    geo.translate(0, 7, 0);
    const mat = this.owned.add(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3;
    return m;
  }

  private syncThings(s: Mission, dt: number): void {
    const t = this.time;
    // chests: a glint while closed, the lid gone once opened
    for (const c of s.chests) {
      let m = this.chestMeshes.get(c.id);
      if (!m) {
        m = new THREE.Mesh(soloGeometry(c.special ? 'props:chest-special' : 'props:chest', undefined, true, 1.5), this.owned.add(new THREE.MeshLambertMaterial({ vertexColors: true })));
        m.position.set(c.x, 0.1, c.z);
        m.rotation.y = c.rot;
        m.castShadow = true;
        this.dyn.add(m);
        this.chestMeshes.set(c.id, m);
      }
      const mat = m.material as THREE.MeshLambertMaterial;
      if (c.opened) { m.scale.y = Math.max(0.55, m.scale.y - dt * 3); mat.emissive.setHex(0); }
      else { const k = (Math.sin(t * 4 + c.id) + 1) / 2; mat.emissive.setRGB(0.12 * k + (c.special ? 0.1 : 0), 0.1 * k, c.special ? 0.12 * k : 0.02); }
    }
    // objective items in beams
    const seen = new Set<number>();
    for (const it of s.items) {
      if (it.taken) continue;
      seen.add(it.id);
      let g = this.itemMeshes.get(it.id);
      if (!g) {
        g = this.itemMesh(it.kind);
        const b = this.beam(0xffd24a);
        g.add(b);
        this.dyn.add(g);
        this.itemMeshes.set(it.id, g);
      }
      g.position.set(it.x, 0.15 + Math.sin(t * 3 + it.id) * 0.08, it.z);
      g.children[0].rotation.y = t * 1.6;
    }
    for (const [id, g] of this.itemMeshes) if (!seen.has(id)) { this.dyn.remove(g); this.itemMeshes.delete(id); this.sprites.emit(g.position.x, 0.8, g.position.z, 0xffe07a, 18, { speed: 3, up: 3, life: 0.6 }); }
    // pickups: little boxes that bob (ammo green, medkit white/red, scrap grey)
    const ps = new Set<number>();
    for (const p of s.pickups) {
      ps.add(p.id);
      let m = this.pickMeshes.get(p.id);
      if (!m) {
        const col = p.kind === 'ammo' ? 0x4a7a3a : p.kind === 'med' ? 0xf0f0f0 : 0x8a8a90;
        m = new THREE.Mesh(this.pickGeo(p.kind), this.owned.add(new THREE.MeshLambertMaterial({ color: col, emissive: p.kind === 'med' ? 0x401010 : 0x101808 })));
        m.castShadow = true;
        this.dyn.add(m);
        this.pickMeshes.set(p.id, m);
      }
      m.position.set(p.x, 0.35 + Math.sin(t * 4 + p.id) * 0.1, p.z);
      m.rotation.y = t * 2 + p.id;
    }
    for (const [id, m] of this.pickMeshes) if (!ps.has(id)) { this.dyn.remove(m); this.pickMeshes.delete(id); }
    // walls: the gate (barriers and a wreck) and the bruiser's barricades
    const ws = new Set<number>();
    for (const w of s.walls) {
      ws.add(w.id);
      let g = this.wallMeshes.get(w.id);
      if (!g) {
        g = new THREE.Group();
        const mat = this.owned.add(new THREE.MeshLambertMaterial({ vertexColors: true }));
        if (w.kind === 'gate') {
          for (let k = -2; k <= 2; k++) { const m = new THREE.Mesh(soloGeometry('props:traffic-barrier-1', undefined, true, 1.25), mat); m.position.set(k * 1.6, 0, 0); m.rotation.y = (k % 2) * 0.1; g.add(m); }
          const top = new THREE.Mesh(soloGeometry('props:pallet', undefined, true, 1.4), mat); top.position.set(0.5, 1.3, 0); top.rotation.set(0.6, 0.3, 0); g.add(top);
          const c = new THREE.Mesh(soloGeometry('props:container-red', undefined, true), mat); c.position.set(0, 0, -2.2); c.rotation.y = Math.PI / 2; c.scale.set(1, 0.7, 1.3); g.add(c);
        } else {
          for (let k = -1; k <= 1; k += 2) { const m = new THREE.Mesh(soloGeometry('props:traffic-barrier-2', undefined, true, 1.1), mat); m.position.set(k * 0.85, 0, 0); g.add(m); }
          if (w.spikes) for (let k = -2; k <= 2; k++) { const m = new THREE.Mesh(soloGeometry('props:cone-1', undefined, true, 0.6), mat); m.position.set(k * 0.6, 0.85, 0.15); m.rotation.x = 1.2; g.add(m); }
        }
        g.position.set(w.x, 0, w.z);
        g.rotation.y = w.rot;
        g.traverse((o) => { o.castShadow = true; });
        this.dyn.add(g);
        this.wallMeshes.set(w.id, g);
        g.scale.setScalar(0.2);
      }
      const k = w.down ? 0 : 1;
      g.scale.setScalar(g.scale.x + (k - g.scale.x) * 0.25);
      g.visible = g.scale.x > 0.05;
    }
    for (const [id, g] of this.wallMeshes) if (!ws.has(id)) { this.dyn.remove(g); this.wallMeshes.delete(id); }
    // flares: a red glow with smoke
    while (this.flareMeshes.length < s.flares.length) {
      const m = new THREE.Mesh(this.owned.add(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6)), this.owned.add(new THREE.MeshBasicMaterial({ color: 0xff4a3a })));
      this.dyn.add(m);
      this.flareMeshes.push(m);
    }
    this.flareMeshes.forEach((m, i) => {
      const f = s.flares[i];
      m.visible = !!f;
      if (!f) return;
      if (f.fly > 0) { const k = 1 - f.fly / 0.55; m.position.set(f.sx + (f.x - f.sx) * k, 1.2 + Math.sin(k * Math.PI) * 3, f.sz + (f.z - f.sz) * k); m.rotation.x += dt * 12; }
      else {
        m.position.set(f.x, 0.12, f.z); m.rotation.set(0, 0, Math.PI / 2);
        if (Math.random() < dt * 30) this.glow.dot(f.x, 0.3, f.z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5, 0xff5a3a, 0.5);
        if (Math.random() < dt * 6) this.smoke.dot(f.x, 0.6, f.z, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 0xc87a7a, 2.4, 0.35);
      }
    });
    // beams over the objectives (survivors to free, the gate, the hold zone, the convoy at the end)
    const want: { x: number; z: number; c: number }[] = [];
    for (const v of s.survivors) if (v.state === 'trapped') want.push({ x: v.x, z: v.z, c: 0x7ae8ff });
    const st = s.stageDef;
    if (st?.kind === 'clear') for (const w of s.walls) if (w.kind === 'gate' && !w.down) want.push({ x: w.x, z: w.z + 1, c: 0xff8a4a });
    if (st?.kind === 'hold') want.push({ x: s.hold.x, z: s.hold.z, c: s.hold.on ? 0x7aff9a : 0xffd24a });
    if (st?.kind === 'return' && s.run.kind === 'campaign') want.push({ x: s.convoy.x, z: s.convoy.z, c: 0x7aff9a });
    while (this.beams.length < want.length) { const b = this.beam(0xffffff); this.dyn.add(b); this.beams.push(b); }
    this.beams.forEach((b, i) => {
      const w = want[i];
      b.visible = !!w;
      if (!w) return;
      b.position.set(w.x, 0, w.z);
      (b.material as THREE.MeshBasicMaterial).color.setHex(w.c);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(t * 3 + i) * 0.06;
    });
    // the hold zone's ring
    if (st?.kind === 'hold' && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) this.rings.add(s.hold.x, s.hold.z, s.hold.on ? 0x7aff9a : 0xffd24a, s.hold.r, s.hold.r, 0.3, { alpha: 0.5 });
  }

  private pickGeos = new Map<string, THREE.BufferGeometry>();
  private pickGeo(kind: string): THREE.BufferGeometry {
    let g = this.pickGeos.get(kind);
    if (g && (g.attributes.position as THREE.BufferAttribute).count) return g;
    g = kind === 'scrap' ? new THREE.OctahedronGeometry(0.22) : kind === 'med' ? new THREE.BoxGeometry(0.45, 0.3, 0.45) : new THREE.BoxGeometry(0.5, 0.28, 0.32);
    this.pickGeos.set(kind, g);
    return g;
  }

  // ---------------------------------------------------------------- events

  screen(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(this.tmp.set(x, y, z));
    return { x: p.x, y: p.y };
  }

  handle(ev: SimEvent, s: Mission): void {
    switch (ev.type) {
      case 'shot': {
        const f = ev.who === 'hero' ? this.hero : ev.who === 'buddy' ? this.buddy : null;
        let ox = ev.x, oy = 1.25, oz = ev.z;
        if (f) {
          f.root.updateMatrixWorld(true);
          const tip = f.tip(this.tmp);
          if (tip) { ox = tip.x; oy = tip.y; oz = tip.z; }
        }
        for (let i = 0; i < ev.tx.length; i++) this.tracers.add(ox, oy, oz, ev.tx[i], 1.0, ev.tz[i], ev.big ? 0xffc85a : 0xffe8a0);
        if (ev.who === 'hero') {
          this.muzzle.position.set(ox, oy, oz);
          this.muzzle.scale.setScalar(ev.big ? 1.6 : ev.gun === 'shotgun' ? 1.3 : 0.9);
          this.muzzleT = 0.05;
          this.casings.eject(ev.x, 1.1, ev.z, s.hero.face);
          this.glow.emit(ox, oy, oz, 0xffc86a, ev.big ? 8 : 3, { speed: 3, up: 0.6, life: 0.18, dir: [s.hero.aimX, s.hero.aimZ], cone: 0.6 });
        }
        for (let i = 0; i < ev.tx.length; i++) if (Math.random() < 0.35) this.sprites.emit(ev.tx[i], 1, ev.tz[i], 0xd8c8a8, 2, { speed: 2, up: 2, life: 0.3 });
        break;
      }
      case 'hit': {
        this.sprites.emit(ev.x, 1.1, ev.z, 0x8a1a1a, ev.big ? 10 : 4, { speed: ev.big ? 4 : 2.4, up: 2.4, life: 0.45, spread: 0.4 });
        if (ev.big) this.glow.emit(ev.x, 1.1, ev.z, 0xffd28a, 6, { speed: 4, up: 1.5, life: 0.25 });
        break;
      }
      case 'kill': {
        this.decals.add(ev.x, ev.z, ev.boss ? 1.4 : ev.kind === 'chubby' ? 0.9 : 0.55);
        this.sprites.emit(ev.x, 0.9, ev.z, 0x6a1414, ev.boss ? 40 : 14, { speed: 3.5, up: 3, life: 0.6, spread: 0.6 });
        break;
      }
      case 'swing': {
        const fx = Math.sin(ev.face), fz = Math.cos(ev.face);
        if (ev.step === 'fa') this.rings.add(ev.x, ev.z, 0xffe0a0, 0.8, 3, 0.35);
        else this.glow.emit(ev.x + fx * 1.2, 1.1, ev.z + fz * 1.2, 0xfff0d0, 4, { speed: 2.4, up: 0.4, life: 0.2, dir: [fx, fz], cone: 2 });
        break;
      }
      case 'finisher': {
        const c = ev.kind === 'fb' ? 0xffb03a : ev.kind === 'fa' ? 0xffe07a : 0x7ae8ff;
        this.rings.add(ev.x, ev.z, c, 0.5, ev.kind === 'fb' ? 4 : 2.6, 0.4);
        this.glow.emit(ev.x, 1, ev.z, c, 18, { speed: 5, up: 2, life: 0.4 });
        break;
      }
      case 'blast': this.rings.add(ev.x, ev.z, 0xffa04a, 0.5, ev.r, 0.4); this.smoke.emit(ev.x, 0.4, ev.z, 0x8a7a6a, 8, { speed: 2, up: 0.8, life: 1, spread: ev.r }); break;
      case 'dodge': this.smoke.emit(s.hero.x, 0.2, s.hero.z, 0x9a9088, 5, { speed: 1.5, up: 0.4, life: 0.6, alpha: 0.5 }); break;
      case 'ability': {
        const col = ev.kind === 'heal' ? 0x6affa0 : ev.kind === 'warcry' ? 0xff6a8a : ev.kind === 'flare' ? 0xff5a3a : 0xffc85a;
        if (ev.kind === 'heal' || ev.kind === 'warcry') { this.rings.add(ev.x, ev.z, col, 0.5, ev.r, 0.5); this.rings.add(ev.x, ev.z, col, 0.3, ev.r * 0.7, 0.35); }
        this.glow.emit(ev.x, 1.2, ev.z, col, 26, { speed: ev.kind === 'warcry' ? 7 : 3, up: 2, life: 0.6, spread: 1 });
        if (ev.kind === 'barricade') this.smoke.emit(ev.x, 0.3, ev.z, 0x9a9088, 10, { speed: 2, up: 0.6, life: 0.8 });
        break;
      }
      case 'burst': this.smoke.emit(ev.x, 0.8, ev.z, 0x8ab84a, 18, { speed: 2.5, up: 1, life: 1.4, spread: 1.6, alpha: 0.7 }); this.rings.add(ev.x, ev.z, 0x9ad84a, 0.5, 3.2, 0.5); this.decals.add(ev.x, ev.z, 1); break;
      case 'slam': this.rings.add(ev.x, ev.z, 0xffa04a, 0.5, ev.r, 0.45); this.smoke.emit(ev.x, 0.3, ev.z, 0x9a8a7a, 16, { speed: 4, up: 0.6, life: 1, spread: ev.r * 0.6 }); break;
      case 'tell': if (ev.move === 'slam') this.rings.add(ev.x, ev.z, 0xff3a2a, ev.r, ev.r, 0.95, { fill: true, alpha: 0.55 }); break;
      case 'armorBreak': this.glow.emit(ev.x, 2, ev.z, 0x7ab4ff, 30, { speed: 6, up: 3, life: 0.5 }); break;
      case 'bark': this.rings.add(ev.x, ev.z, 0xffe07a, 0.3, 2, 0.4); break;
      case 'reveal': this.rings.add(ev.x, ev.z, 0xff4a3a, 1.5, 1.5, 1.3, { fill: true, alpha: 0.4 }); break;
      case 'rise': this.smoke.emit(ev.x, 0.3, ev.z, 0x8a8078, 8, { speed: 1.5, up: 0.6, life: 0.8 }); break;
      case 'found': this.rings.add(ev.x, ev.z, 0x8affc8, 0.5, 2.5, 0.6); this.glow.emit(ev.x, 0.8, ev.z, 0x8affc8, 16, { speed: 2, up: 2, life: 0.7 }); break;
      case 'pickup': this.glow.emit(ev.x, 0.6, ev.z, ev.kind === 'med' ? 0x7aff9a : ev.kind === 'ammo' ? 0xffe07a : 0xc8d8ff, 10, { speed: 2, up: 2.5, life: 0.4 }); break;
      case 'chest': this.glow.emit(ev.x, 0.8, ev.z, ev.special ? 0xc89aff : 0xffe07a, 26, { speed: 3, up: 3.5, life: 0.7 }); this.rings.add(ev.x, ev.z, 0xffe07a, 0.3, 2.2, 0.5); break;
      case 'freed': this.glow.emit(ev.x, 1.2, ev.z, 0x7ae8ff, 30, { speed: 3, up: 3, life: 0.8 }); this.rings.add(ev.x, ev.z, 0x7ae8ff, 0.4, 3, 0.6); break;
      case 'wallHit': this.sprites.emit(ev.x + (Math.random() - 0.5) * 3, 1, ev.z, 0xc8a878, 4, { speed: 3, up: 3, life: 0.4 }); break;
      case 'wallDown': this.smoke.emit(ev.x, 0.6, ev.z, 0x9a9088, 24, { speed: 4, up: 1.5, life: 1.2, spread: 3 }); this.sprites.emit(ev.x, 1, ev.z, 0xd8b878, 30, { speed: 6, up: 5, life: 0.8, spread: 2 }); break;
      case 'item': this.rings.add(ev.x, ev.z, 0xffd24a, 0.3, 2.5, 0.5); break;
      case 'horde': break;
      case 'grab': this.rings.add(s.hero.x, s.hero.z, 0xff3a2a, 0.6, 1.4, 0.4); break;
      case 'revive': this.rings.add(s.hero.x, s.hero.z, 0x7aff9a, 0.5, 9, 0.6); this.glow.emit(s.hero.x, 1, s.hero.z, 0x7aff9a, 40, { speed: 5, up: 3, life: 0.7 }); break;
      case 'bite': this.sprites.emit(ev.x, 0.8, ev.z, 0x8a1a1a, 4, { speed: 2, up: 1.5, life: 0.3 }); break;
      default: break;
    }
  }

  /** Compiles the programs of the dynamic parts too (the menu's backdrop calls this once). */
  warm(): void { keepPrograms(this.world.renderer, this.world.scene, this.world.camera); }

  dispose(): void {
    for (const f of [this.hero, this.buddy, this.dog, ...this.zPool, ...this.survPool, ...this.survivors.values()]) f?.dispose();
    this.owned.free();
  }
}

/** The kit's tiles' own orientation: their lines run along x; our straight runs along z at rot 0. */
export const ROAD_ROT: Record<string, number> = { straight: 0, turn: 0, t: 0, cross: 0 };

export { planTown, kk };
