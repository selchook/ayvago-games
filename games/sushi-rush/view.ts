// Sushi Rush: draws a day (sim.ts) in 3D. The restaurant is one merged lit mesh and one glowing
// mesh (room.ts); the chef and the customers are the kit's rigged animals (figure.ts); the plate in
// the chef's hands shows what is on it (rice, nori, the fish whole or cut, or the finished dish);
// the pot and the steamer show their state (steam while cooking, a glow when done, smoke when
// spoilt); eaten dishes stand on the bar. Steam, sparkles, smoke and sakura petals are point
// sprites. The Play scene and the menu's backdrop both use it, so the menu compiles every shader
// the first Play frame needs (keepPrograms).
import Phaser from 'phaser';
import { World3D, THREE } from '@core/three';
import {
  DISH, STATION, AISLE_Z, BACK_Z, BAR_Z, STOOL_Z, POT2_DX, STEAM2_DX, MAX_SEATS, seatXs,
  type DishId, type Item, type ChefId, type StationId, type RabbitId,
} from './defs';
import type { Day, SimEvent, Plate, Customer, Cooker } from './sim';
import { plateDish } from './sim';
import type { Ranks } from './powers';
import { mergeModels, soloGeometry, litMaterial, glowMaterial, keepPrograms } from './kit';
import { roomLayout, TOP, BAR_TOP } from './room';
import { Figure } from './figure';

/** The camera: from the dining room, a little above the customers' heads, looking at the counter. */
export const CAM = { fov: 36, pos: new THREE.Vector3(0, 19.5, 10.5), look: new THREE.Vector3(0, 0.4, -1.9) };
/** Rabbits and the panda at the kit's own scale. */
const FIG_SCALE = 1;

/** The model and scale an item or a dish is drawn with on a plate. */
const ITEM_LOOK: Record<Item, { key: string; s: number; y?: number; rot?: number }> = {
  rice: { key: 'rice', s: 0.62 },
  nori: { key: 'nori', s: 0.78 },
  tuna: { key: 'tuna', s: 0.42, y: 0.12, rot: 0.4 },
  salmon: { key: 'salmon-fish', s: 0.5, y: 0.14, rot: 0.4 },
  ebi: { key: 'ebi', s: 1.5, y: 0.05 },
  octo: { key: 'tentacle', s: 0.9, y: 0.1 },
  cucumber: { key: 'cucumber', s: 0.42, y: 0.05, rot: 0.5 },
  urchin: { key: 'urchin', s: 0.55, y: 0.1 },
  'tuna-cut': { key: 'fish-fillet', s: 0.7, y: 0.02 },
  'salmon-cut': { key: 'salmon', s: 0.7, y: 0.02 },
  'ebi-cut': { key: 'ebi', s: 1.2, y: 0.04 },
  'octo-cut': { key: 'tentacle', s: 0.65, y: 0.04 },
  'cucumber-cut': { key: 'cucumber-cut', s: 0.7, y: 0.02 },
};
const DISH_SCALE: Partial<Record<DishId, number>> = { ramen: 0.75, udon: 0.75, dango: 0.9, gyoza: 1.25, chukaman: 1.4, onigiri: 1.2 };

// ------------------------------------------------------------------ point sprites

/** A pool of soft point sprites with colour, alpha, velocity and life. */
class Sprites {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private base: Float32Array;
  private next = 0;
  private geo = new THREE.BufferGeometry();

  constructor(private n: number, tex: THREE.Texture, size: number, additive: boolean, private gravity = 0, private fade = 1) {
    this.pos = new Float32Array(n * 3).fill(-999);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.base = new Float32Array(n * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, color: number, count: number, o: { speed?: number; up?: number; spread?: number; life?: number; alpha?: number } = {}): void {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const sp = o.spread ?? 0.2;
      this.pos[i * 3] = x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * sp * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      const a = Math.random() * Math.PI * 2, s = (o.speed ?? 1) * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = (o.up ?? 1) * (0.6 + Math.random() * 0.6);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = this.max[i] = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      this.base[i * 4] = c.r; this.base[i * 4 + 1] = c.g; this.base[i * 4 + 2] = c.b; this.base[i * 4 + 3] = o.alpha ?? 1;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, k * 2.5) * (this.fade ? Math.min(1, (1 - k) * 6 + 0.2) : 1);
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
  }
}

function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function petal(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd0e0';
  g.beginPath(); g.ellipse(16, 16, 12, 7, 0.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff9ac0';
  g.beginPath(); g.ellipse(18, 15, 5, 3, 0.6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the plate

/** A plate: its model plus one mesh per thing that can be on it (shown as needed). */
class PlateView {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Mesh>();
  private plate: THREE.Mesh;
  private shown = '';

  constructor(private mat: THREE.Material, withPlate = true) {
    this.plate = new THREE.Mesh(soloGeometry('plate'), mat);
    this.plate.visible = withPlate;
    this.plate.castShadow = true;
    this.group.add(this.plate);
  }

  private mesh(key: string): THREE.Mesh {
    let m = this.meshes.get(key);
    if (!m) {
      m = new THREE.Mesh(soloGeometry(key), this.mat);
      m.castShadow = true;
      this.group.add(m);
      this.meshes.set(key, m);
    }
    return m;
  }

  /** Shows a plate's contents; returns true when it changed (for a pop). */
  set(p: Plate | null, dish?: DishId | null): boolean {
    const d = p ? plateDish(p) : dish ?? null;
    const sig = p ? JSON.stringify([p.items, p.rolled, p.ready]) : String(dish);
    if (sig === this.shown) return false;
    this.shown = sig;
    for (const m of this.meshes.values()) m.visible = false;
    const empty = !d && (!p || !p.items.length);
    this.plate.visible = !empty || !!p;
    let y = 0.1;
    if (d) {
      const def = DISH[d];
      const m = this.mesh(def.model);
      m.visible = true;
      const s = DISH_SCALE[d] ?? 1.25;
      m.scale.setScalar(s);
      m.position.set(0, def.cook === 'pot' ? 0.04 : y, 0);
      m.rotation.set(0, def.cook ? 0 : Math.PI / 2, 0);
      return true;
    }
    if (!p) return true;
    // nori under, rice on it, the filling on top
    const order: Item[] = [...p.items].sort((a, b) => (a === 'nori' ? -1 : b === 'nori' ? 1 : a === 'rice' ? -1 : b === 'rice' ? 1 : 0));
    let k = 0;
    for (const it of order) {
      const look = ITEM_LOOK[it];
      const key = look.key + (k++ > 0 && this.meshes.has(look.key) && this.meshes.get(look.key)!.visible ? '' : '');
      const m = this.mesh(key);
      m.visible = true;
      m.scale.setScalar(look.s);
      m.position.set(0, y + (look.y ?? 0), 0);
      m.rotation.set(0, look.rot ?? 0, 0);
      y += it === 'nori' ? 0.04 : it === 'rice' ? 0.24 : 0.1;
    }
    return true;
  }
}

// ------------------------------------------------------------------ the view

interface CustView { fig: Figure; c: Customer; dish: THREE.Mesh | null; state: string; kind: 'rabbits' | 'panda' }
interface CookView { group: THREE.Group; lid: THREE.Mesh | null; state: string; t: number; x: number; z: number; y: number }

export interface ViewOpts { menu?: boolean; chef: ChefId; ranks: Ranks; day: number; seats: number }

export class View {
  readonly world: World3D;
  readonly lit = litMaterial();
  readonly glow = glowMaterial();
  private food = litMaterial();
  private roomMeshes: THREE.Mesh[] = [];
  chef!: Figure;
  chefId!: ChefId;
  private chefPlate: PlateView;
  private cust = new Map<number, CustView>();
  private poolR: Figure[] = [];
  private poolP: Figure[] = [];
  private pots: CookView[] = [];
  private baskets: CookView[] = [];
  private spare: THREE.Mesh;
  /** The dish a customer eats, on the bar in front of each stool. */
  private seatDish: THREE.Mesh[] = [];
  private matPlate: PlateView;
  readonly steam: Sprites;
  readonly sparks: Sprites;
  readonly smoke: Sprites;
  readonly petals: Sprites;
  private dot = softDot();
  private petalTex = petal();
  private time = 0;
  private decor = 0;
  private chefFace = Math.PI;
  private chefWork = '';
  /** Station highlight rings on the counter (the glow hints). */
  private rings = new Map<StationId, THREE.Mesh>();
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  seatX: number[] = [];
  private dustT = 0;
  /** The plate the chef holds (where the hand is), for popups. */
  readonly handAt = new THREE.Vector3();

  constructor(private phaser: Phaser.Scene, o: ViewOpts) {
    this.world = new World3D(phaser, { fov: CAM.fov, near: 0.5, far: 120, background: 0x2a1a12, fog: { color: 0x2a1a12, near: 40, far: 80 } });
    this.world.camera.position.copy(CAM.pos);
    this.world.camera.lookAt(CAM.look);
    this.world.addLights({ sky: 0xfff0d8, ground: 0x8a5a3a, ambient: 1.9, sun: 0xffe2b8, intensity: 1.6, dir: [-0.35, 1, 0.55], extent: 16 });
    if (this.world.sun) { this.world.sun.shadow.mapSize.set(1024, 1024); this.world.sun.target.position.set(0, 0, -1.5); this.world.sun.position.add(new THREE.Vector3(0, 0, -1.5)); }
    const scene = this.world.scene;
    this.food.name = 'food';
    this.steam = new Sprites(160, this.dot, 0.9, false, -0.15, 1);
    this.sparks = new Sprites(220, this.dot, 0.35, true, 2.2, 0);
    this.smoke = new Sprites(80, this.dot, 1.3, false, -0.2, 1);
    this.petals = new Sprites(60, this.petalTex, 0.32, false, 0.25, 0);
    scene.add(this.steam.points, this.sparks.points, this.smoke.points, this.petals.points);
    this.chefPlate = new PlateView(this.food);
    this.matPlate = new PlateView(this.food, false);
    for (let i = 0; i < MAX_SEATS; i++) {
      const m = new THREE.Mesh(soloGeometry('plate'), this.food);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.seatDish.push(m);
    }
    this.spare = new THREE.Mesh(soloGeometry('fish-fillet'), this.food);
    this.spare.visible = false;
    scene.add(this.spare, this.matPlate.group);
    // the station rings
    const ringGeo = new THREE.RingGeometry(0.95, 1.3, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (const st of Object.keys(STATION) as StationId[]) {
      const m = new THREE.Mesh(ringGeo, this.ringMat.clone());
      m.position.set(STATION[st].x, TOP + 0.08, BACK_Z + 0.35);
      m.renderOrder = 5;
      if (st === 'fridge' || st === 'pot') m.position.y = 0.05;
      if (st === 'fridge' || st === 'pot') m.position.z = AISLE_Z + 0.2;
      m.visible = false;
      scene.add(m);
      this.rings.set(st, m);
    }
    this.setChef(o.chef);
    this.build(o.ranks, o.seats, o.day);
    keepPrograms(this.world.renderer, scene, this.world.camera);
  }

  // ---------------------------------------------------------------- setup

  /** Builds (or rebuilds) the restaurant for these upgrades and seats. */
  build(ranks: Ranks, seats: number, day: number): void {
    const scene = this.world.scene;
    for (const m of this.roomMeshes) { scene.remove(m); m.geometry.dispose(); }
    this.roomMeshes = [];
    const { lit, glow } = mergeModels(roomLayout({ ranks, seats, day }));
    const a = new THREE.Mesh(lit, this.lit);
    a.receiveShadow = true;
    a.castShadow = true;
    const b = new THREE.Mesh(glow, this.glow);
    scene.add(a, b);
    this.roomMeshes.push(a, b);
    this.decor = ranks.decor;
    this.seatX = seatXs(seats);
    // the pots on the oven and the steamer baskets
    for (const v of [...this.pots, ...this.baskets]) scene.remove(v.group);
    this.pots = [];
    this.baskets = [];
    const potN = ranks.pot >= 2 ? 2 : 1, bN = ranks.steamer >= 2 ? 2 : 1;
    for (let i = 0; i < potN; i++) this.pots.push(this.cooker('pot1', STATION.pot.x + (i ? POT2_DX : -0.35), 2.23, BACK_Z - 0.1 + (i ? 0.2 : 0), 0.75));
    for (let i = 0; i < bN; i++) this.baskets.push(this.cooker('steamer', STATION.steamer.x + (i ? STEAM2_DX : 0), TOP, BACK_Z + 0.1, 1, true));
  }

  private cooker(key: string, x: number, y: number, z: number, s: number, lid = false): CookView {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    // the steamer's own basket is in the room mesh; the pot is its own model so it can rattle
    if (!lid) {
      const m = new THREE.Mesh(soloGeometry(key), this.lit);
      m.scale.setScalar(s);
      m.castShadow = true;
      group.add(m);
    }
    this.world.scene.add(group);
    return { group, lid: null, state: 'empty', t: 0, x, z, y: y + (lid ? 0.45 : 0.75 * s) };
  }

  setChef(id: ChefId): void {
    if (this.chef && this.chefId === id) return;
    if (this.chef) { this.world.scene.remove(this.chef.root); this.chef.dispose(); }
    this.chefId = id;
    this.chef = new Figure(id === 'panda' ? 'panda' : 'rabbits', FIG_SCALE);
    this.chef.show(id === 'panda' ? ['body', 'band', 'knife'] : ['r-' + id, 'knife']);
    this.chef.root.position.set(STATION.mat.x, 0, AISLE_Z);
    this.chef.root.rotation.y = Math.PI;
    this.chef.play('Idle');
    this.chef.root.add(this.chefPlate.group);
    this.chefPlate.group.position.set(0, 1.62, 0.95);
    this.world.scene.add(this.chef.root);
  }

  /** A figure from the pool (pooled figures stay in the scene, hidden, so the world frees them). */
  private takeFigure(kind: 'rabbits' | 'panda', rabbit: RabbitId | null): Figure {
    const pool = kind === 'panda' ? this.poolP : this.poolR;
    let f = pool.pop();
    if (!f) { f = new Figure(kind, FIG_SCALE); this.world.scene.add(f.root); }
    f.reset();
    f.show(kind === 'panda' ? ['body'] : ['r-' + rabbit]);
    return f;
  }

  private giveFigure(f: Figure): void {
    f.root.visible = false;
    f.mixer.stopAllAction();
    (f.kind === 'panda' ? this.poolP : this.poolR).push(f);
  }

  // ---------------------------------------------------------------- per frame

  /** Draws the day's state (dt: real seconds). */
  sync(d: Day, dt: number, hints?: Set<StationId>): void {
    this.time += dt;
    this.syncChef(d, dt);
    this.syncCustomers(d, dt);
    this.syncCookers(d, dt);
    // the spare slice on the board
    this.spare.visible = !!d.spare;
    if (d.spare) {
      const look = ITEM_LOOK[d.spare];
      this.spare.geometry = soloGeometry(look.key);
      this.spare.scale.setScalar(look.s);
      this.spare.position.set(STATION.knife.x + 0.75, TOP + 0.17, BACK_Z + 0.35);
    }
    // the station hints
    for (const [st, ring] of this.rings) {
      const on = !!hints?.has(st) && d.stations.includes(st);
      ring.visible = on;
      if (on) (ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(this.time * 5);
    }
    // sakura petals drift when the room has a tree
    if (this.decor >= 2 && Math.random() < dt * (this.decor >= 3 ? 7 : 3.5)) {
      const x = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 4);
      this.petals.emit(x, 5.5 + Math.random(), 1 + Math.random() * 3, 0xffffff, 1, { speed: 0.5, up: -0.4, spread: 1.5, life: 5 });
    }
    this.steam.update(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.petals.update(dt);
  }

  private syncChef(d: Day, dt: number): void {
    const ch = d.chef, f = this.chef;
    const r = f.root;
    r.position.x = ch.x;
    r.position.z = AISLE_Z;
    let face: number;
    const holding = d.plate.items.length > 0 || !!d.plate.ready;
    if (ch.state === 'walk') {
      face = ch.target > ch.x ? Math.PI / 2 : -Math.PI / 2;
      const clip = ch.dashing ? (holding ? 'Run_Holding' : 'Run') : holding ? 'Walk_Holding' : 'Walk';
      f.play(clip, { speed: ch.dashing ? ch.speed / 9 : ch.speed / 4.2 });
      this.chefWork = '';
      if (ch.dashing) {
        this.dustT -= dt;
        if (this.dustT <= 0) { this.dustT = 0.05; this.smoke.emit(ch.x, 0.2, AISLE_Z, 0xd8c8b0, 1, { speed: 0.3, up: 0.3, spread: 0.3, life: 0.5, alpha: 0.5 }); }
      }
    } else if (ch.state === 'work') {
      face = Math.PI;
      const a = ch.action;
      const st = a && a.kind === 'station' ? a.st : null;
      const kind = st === 'knife' ? 'Chop' : st === 'mat' ? 'Assembly' : st === 'pot' || st === 'steamer' ? 'Pan' : 'Assembly';
      if (this.chefWork !== kind) {
        this.chefWork = kind;
        f.play(kind + '_Start', { once: true, then: kind + '_Loop', speed: 1.4, thenSpeed: kind === 'Chop' ? 1.5 : 1.2 });
      }
      this.chef.setPart('pan', st === 'pot');
      if (st === 'knife' && Math.random() < dt * 8) this.sparks.emit(STATION.knife.x, TOP + 0.3, BACK_Z + 0.4, 0xffffff, 1, { speed: 1.2, up: 1.5, life: 0.35 });
    } else {
      face = this.chefFace;
      if (this.chefWork && this.chefWork !== 'idle') {
        f.play(this.chefWork + '_End', { once: true, then: holding ? 'Idle_Holding' : 'Idle', fade: 0.1 });
        this.chefWork = 'idle';
      } else if (this.chefWork !== 'idle' || (f.name !== 'Idle' && f.name !== 'Idle_Holding' && !f.name.endsWith('_End') && f.name !== 'Yes')) {
        f.play(holding ? 'Idle_Holding' : 'Idle');
        this.chefWork = 'idle';
      } else if (f.name === 'Idle' && holding) f.play('Idle_Holding');
      else if (f.name === 'Idle_Holding' && !holding) f.play('Idle');
      this.chef.setPart('pan', false);
      if (ch.face === 'front') face = 0;
    }
    if (ch.state !== 'idle') this.chefFace = face;
    if (ch.state === 'idle' && ch.face === 'front') face = 0;
    // turn smoothly
    let dr = face - r.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    r.rotation.y += dr * Math.min(1, dt * 14);
    // the plate: in the hands when holding, else on the mat station
    const changed = this.chefPlate.set(holding ? d.plate : null);
    this.chefPlate.group.visible = holding;
    if (changed && holding) {
      this.chefPlate.group.scale.setScalar(1.25);
    }
    this.chefPlate.group.scale.setScalar(THREE.MathUtils.lerp(this.chefPlate.group.scale.x, 1, Math.min(1, dt * 10)));
    this.chefPlate.group.getWorldPosition(this.handAt);
    f.update(dt);
  }

  private syncCustomers(d: Day, dt: number): void {
    const seen = new Set<number>();
    for (const c of d.customers) {
      if (c.state === 'gone') continue;
      seen.add(c.id);
      let v = this.cust.get(c.id);
      if (!v) {
        const kind = c.vip ? 'panda' : 'rabbits';
        v = { fig: this.takeFigure(kind, c.rabbit), c, dish: null, state: '', kind };
        if (c.vip) v.fig.setPart('band', false);
        this.cust.set(c.id, v);
      }
      const f = v.fig;
      f.root.position.set(c.x, 0, c.z);
      let dr = c.rot - f.root.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      f.root.rotation.y += dr * Math.min(1, dt * 10);
      if (v.state !== c.state) {
        const was = v.state;
        v.state = c.state;
        switch (c.state) {
          case 'enter': f.play('Walk', { speed: 1.1 }); break;
          case 'sit': f.root.rotation.y = Math.PI; f.play('Sitting_Start', { once: true, then: 'Sitting_Idle', fade: 0.1 }); break;
          case 'wait': if (was !== 'sit') f.play('Sitting_Idle'); break;
          case 'eat': f.play('Sitting_Eating'); break;
          case 'happy': f.play('Sitting_End', { once: true, then: Math.random() < 0.5 ? 'Wave' : 'Yes', fade: 0.1 }); break;
          case 'angry': f.play('Sitting_End', { once: true, then: 'No', fade: 0.1 }); break;
          case 'leave': f.play('Walk', { speed: c.patience <= 0 ? 1.4 : 1.1 }); this.clearDish(v); break;
        }
      }
      // sitting customers sit on the stool (the clip lowers the hips; the stool lifts them)
      const sitting = c.state === 'sit' || c.state === 'wait' || c.state === 'eat';
      f.root.position.y = sitting ? 0.0 : 0;
      // the dish on the bar while eating
      if (c.state === 'eat' && !v.dish) {
        const dish = c.orders[c.orders.length - 1];
        const def = DISH[dish];
        v.dish = this.seatDish[c.seat];
        v.dish.geometry = soloGeometry(def.model);
        v.dish.scale.setScalar((DISH_SCALE[dish] ?? 1.25) * 1.05);
        v.dish.position.set(c.x, BAR_TOP, BAR_Z + 0.75);
        v.dish.rotation.y = def.cook ? 0 : Math.PI / 2;
        v.dish.visible = true;
      }
      // angry steam over the head when patience is low
      if (c.state === 'wait' && c.patience < 0.25 && Math.random() < dt * 6) this.smoke.emit(c.x, 4.3, c.z, 0xff6a4a, 1, { speed: 0.4, up: 1, spread: 0.6, life: 0.6, alpha: 0.55 });
      f.update(dt);
    }
    for (const [id, v] of this.cust) {
      if (seen.has(id)) continue;
      this.clearDish(v);
      this.giveFigure(v.fig);
      this.cust.delete(id);
    }
  }

  private clearDish(v: CustView): void {
    if (v.dish) { v.dish.visible = false; v.dish = null; }
  }

  private syncCookers(d: Day, dt: number): void {
    const run = (views: CookView[], slots: Cooker[], st: 'pot' | 'steamer') => {
      views.forEach((v, i) => {
        const s = slots[i];
        if (!s) return;
        v.state = s.state;
        const g = v.group;
        if (s.state === 'cooking') {
          if (Math.random() < dt * 10) this.steam.emit(v.x, v.y + 0.2, v.z + 0.1, 0xffffff, 1, { speed: 0.25, up: 1.1, spread: 0.5, life: 1.1, alpha: 0.5 });
          g.position.y = (st === 'pot' ? 2.23 : TOP) + Math.abs(Math.sin(this.time * 18)) * 0.03;
        } else g.position.y = st === 'pot' ? 2.23 : TOP;
        if (s.state === 'done') {
          if (Math.random() < dt * 5) this.steam.emit(v.x, v.y + 0.2, v.z + 0.1, 0xfff0c0, 1, { speed: 0.2, up: 1.3, spread: 0.4, life: 1.3, alpha: 0.65 });
          if (Math.random() < dt * 4) this.sparks.emit(v.x, v.y + 0.3, v.z + 0.2, 0xffe070, 1, { speed: 0.8, up: 1.4, life: 0.5 });
        }
        if (s.state === 'burnt' && Math.random() < dt * 12) this.smoke.emit(v.x, v.y + 0.2, v.z, 0x3a3030, 1, { speed: 0.3, up: 1.2, spread: 0.5, life: 1.4, alpha: 0.7 });
      });
    };
    run(this.pots, d.potSlots, 'pot');
    run(this.baskets, d.basketSlots, 'steamer');
  }

  // ---------------------------------------------------------------- events

  handle(ev: SimEvent): void {
    switch (ev.type) {
      case 'serve': {
        const v = this.cust.get(ev.c.id);
        if (v) {
          v.fig.flash(0.15);
          this.sparks.emit(ev.c.x, 3.2, ev.c.z, ev.golden ? 0xffd040 : 0xfff0a0, ev.golden ? 40 : 18, { speed: 2.2, up: 2.4, life: 0.8 });
        }
        this.chef.play('Yes', { once: true, then: 'Idle', speed: 1.6, fade: 0.08 });
        break;
      }
      case 'wrong': {
        const v = this.cust.get(ev.c.id);
        if (v) { v.fig.play('No', { once: true, then: 'Sitting_Idle', speed: 1.4 }); v.state = 'wait'; }
        break;
      }
      case 'angry': {
        this.smoke.emit(ev.c.x, 3.6, ev.c.z, 0xff4a2a, 14, { speed: 1, up: 1.4, spread: 0.6, life: 0.9, alpha: 0.7 });
        break;
      }
      case 'calm': {
        this.steam.emit(ev.c.x, 3.4, ev.c.z, 0xc8ffd0, 16, { speed: 0.8, up: 1.2, spread: 0.8, life: 1.2, alpha: 0.7 });
        break;
      }
      case 'cut': this.sparks.emit(STATION.knife.x, TOP + 0.3, BACK_Z + 0.4, 0xffffff, 10, { speed: 1.6, up: 1.8, life: 0.4 }); break;
      case 'roll': this.sparks.emit(STATION.mat.x, TOP + 0.3, BACK_Z + 0.4, 0x9aff9a, 12, { speed: 1.4, up: 1.8, life: 0.5 }); break;
      case 'add': this.sparks.emit(this.handAt.x, this.handAt.y + 0.3, this.handAt.z, 0xfff6d0, 6, { speed: 1, up: 1.2, life: 0.35 }); break;
      case 'take': {
        const v = (ev.st === 'pot' ? this.pots : this.baskets)[ev.slot];
        if (v) this.steam.emit(v.x, v.y + 0.2, v.z, 0xffffff, 12, { speed: 0.6, up: 1.5, spread: 0.6, life: 1, alpha: 0.6 });
        break;
      }
      case 'cookDone': {
        const v = (ev.st === 'pot' ? this.pots : this.baskets)[ev.slot];
        if (v) this.sparks.emit(v.x, v.y + 0.3, v.z + 0.2, 0xffe070, 16, { speed: 1.6, up: 2, life: 0.6 });
        break;
      }
      case 'burnt': {
        const v = this.pots[ev.slot];
        if (v) this.smoke.emit(v.x, v.y + 0.2, v.z, 0x2a2020, 16, { speed: 0.8, up: 1.6, spread: 0.5, life: 1.4, alpha: 0.8 });
        break;
      }
      case 'bin': this.smoke.emit(this.handAt.x, this.handAt.y, this.handAt.z, 0xd8d0c8, 10, { speed: 1.4, up: 0.8, spread: 0.3, life: 0.5, alpha: 0.6 }); break;
      case 'zen': for (const c of this.cust.values()) this.steam.emit(c.c.x, 3.6, c.c.z, 0xb8ffc8, 10, { speed: 0.6, up: 1, spread: 0.6, life: 1.2, alpha: 0.6 }); break;
      case 'deny': this.chef.play('No', { once: true, then: 'Idle', speed: 2, fade: 0.08 }); break;
    }
  }

  // ---------------------------------------------------------------- screen positions

  /** A world point in game pixels. */
  screen(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(new THREE.Vector3(x, y, z));
    return { x: p.x, y: p.y };
  }

  /** Where a seated customer's order bubble goes. */
  bubbleAt(seat: number): { x: number; y: number } { return this.screen(this.seatX[seat] ?? 0, 4.6, STOOL_Z - 0.3); }
  /** Where a station's label sits (over the counter, under the shelves). */
  stationAt(st: StationId): { x: number; y: number } {
    const y = st === 'fridge' ? 4.6 : st === 'pot' ? 3.4 : TOP + 1.1;
    return this.screen(STATION[st].x, y, BACK_Z + 0.4);
  }
  /** A cooker's screen position (its timer ring). */
  cookerAt(st: 'pot' | 'steamer', slot: number): { x: number; y: number } {
    const v = (st === 'pot' ? this.pots : this.baskets)[slot];
    return v ? this.screen(v.x, v.y + 0.45, v.z + 0.7) : { x: -100, y: -100 };
  }
  get chefScreen(): { x: number; y: number } { return this.screen(this.chef.root.position.x, 4.4, AISLE_Z); }
  get handScreen(): { x: number; y: number } { return this.screen(this.handAt.x, this.handAt.y + 0.4, this.handAt.z); }

  dispose(): void {
    this.chef?.dispose();
    for (const v of this.cust.values()) v.fig.dispose();
    for (const f of [...this.poolR, ...this.poolP]) f.dispose();
    this.dot.dispose();
    this.petalTex.dispose();
  }
}
