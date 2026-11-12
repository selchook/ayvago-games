// Snack Shack: the diner in 3D. Builds the room (one merged furniture mesh, one merged food-decor
// mesh), and every frame draws the simulation's state: food on the stations (instanced per food
// model), food flying to plates and customers, the customers (instanced rigs) and the chef.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import {
  Sim, walkTime, QUEUE_WALK, HAPPY_T, MAX_SEATS, STATION_DAY,
  type Customer, type Item, type StationId, type Ref,
} from './sim';
import {
  StaticBatch, Instances, RigInstances, foodGeo, foodMat, CUSTOMER_FIGURES,
  type FoodModel, type FurnitureModel,
} from './kit';

/** Furniture Kit scale: a cabinet is 0.86 wide and 0.9 high. */
export const F = 2;
const UNIT = 0.43 * F;
/** Mini Characters scale. */
export const C = 1.9;
export const TOP = 0.45 * F;
const BAR_TOP = 0.42 * F * 0.72;
/** Height of a seated customer's root above the floor (on the stool). */
const SIT_Y = 0.62;

// rows (z grows towards the camera)
export const KITCHEN_Z = 2.15;   // front face of the kitchen row
export const AISLE_Z = 0.42;   // where the chef walks
export const PASS_Z = -0.25;     // front face of the pass
export const BAR_Z = -1.75;      // front face of the customers' bar
export const STOOL_Z = -2.45;
export const WALK_Z = -3.25;     // customers' path behind the stools
export const WALL_Z = -4.05;
export const DOOR = new THREE.Vector3(-3.1, 0, -3.8);

/** Kitchen row stations, left to right. */
export const KITCHEN_ROW: StationId[] = ['soda', 'fryer', 'grill', 'dogs', 'cream'];
const ROW_X0 = -2.5 * UNIT;
const colX = (i: number) => ROW_X0 + (i + 0.5) * UNIT;

/** What each item looks like. */
export const ITEM_MODEL: Record<Item, FoodModel> = {
  burger: 'burger-cheese', deluxe: 'burger', soda: 'soda', fries: 'fries', hotdog: 'hot-dog', icecream: 'ice-cream',
};
export const ITEM_SCALE: Record<Item, number> = { burger: 0.8, deluxe: 0.78, soda: 0.72, fries: 0.75, hotdog: 0.62, icecream: 0.72 };

/** Centre of a station's top surface (tap zones and the chef's target). */
export function stationCentre(st: StationId): THREE.Vector3 {
  const i = KITCHEN_ROW.indexOf(st);
  if (i >= 0) return new THREE.Vector3(colX(i), TOP, KITCHEN_Z - UNIT / 2);
  if (st === 'veggie') return new THREE.Vector3(colX(0), TOP, PASS_Z - UNIT / 2);
  return new THREE.Vector3(0, TOP, PASS_Z - UNIT / 2); // the pass: plates on the middle three units
}

/** Where slot `i` of a station holds its food. */
export function slotPos(st: StationId, slot: number): THREE.Vector3 {
  const c = stationCentre(st);
  switch (st) {
    case 'grill': {
      // the stove's four burners
      const bx = [-0.2, 0.2, -0.2, 0.2][slot], bz = [0.17, 0.17, -0.17, -0.17][slot];
      return c.clone().add(new THREE.Vector3(bx, 0.005, bz));
    }
    case 'dogs': return c.clone().add(new THREE.Vector3(0, 0.005, (slot ? -0.17 : 0.17)));
    case 'pass': return new THREE.Vector3(-0.97 + slot * 0.647, TOP, PASS_Z - UNIT / 2);
    case 'soda': return c.clone().add(new THREE.Vector3(slot ? 0.2 : -0.2, 0, 0.18));
    case 'cream': return c.clone().add(new THREE.Vector3(slot ? 0.2 : -0.2, 0, 0.12));
    case 'fryer': return c.clone().add(new THREE.Vector3(-0.24 + slot * 0.24, 0, 0.27));
    case 'veggie': return c.clone();
  }
}

/** Seat x for stool `i` of `n`. */
export function seatX(i: number, n: number): number {
  const span = n <= 3 ? 3.0 : n === 4 ? 3.6 : 4.0;
  return n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
}

export function queuePos(i: number): THREE.Vector3 {
  return new THREE.Vector3(-3.35 + (i % 2) * 0.12, 0, -3.15 + i * 0.62);
}

// ------------------------------------------------------------------ the room

/** The static diner for a day: equipment only on the stations open today. */
export function buildRoom(parent: THREE.Object3D, day: number, seats: number, title = ''): THREE.Group {
  const g = new THREE.Group();
  const b = new StaticBatch();
  const open = (st: StationId) => day >= STATION_DAY[st];

  // floor: a classic diner checkerboard, warm wood under the customers
  const tile = 0.62;
  for (let ix = -8; ix < 8; ix++) for (let iz = -8; iz < 7; iz++) {
    const x = ix * tile, z = iz * tile;
    if (z + tile < WALL_Z) continue;
    const q = new THREE.PlaneGeometry(tile, tile).rotateX(-Math.PI / 2).translate(x + tile / 2, 0, z + tile / 2);
    const kitchen = z > BAR_Z - 0.2;
    const dark = (ix + iz) & 1;
    b.painted(q, kitchen ? (dark ? 0x2d3142 : 0xeae6dc) : (dark ? 0xa8573a : 0xd77b52));
    q.dispose();
  }
  // back wall with windows and the door, a skirting stripe
  const wallPieces: FurnitureModel[] = ['wall', 'wallDoorway', 'wallWindow', 'wallWindow', 'wall', 'wallWindow'];
  wallPieces.forEach((p, i) => b.furniture(p, -6.1 + i * F, 0, WALL_Z + 0.02, 0, F));
  // the wall goes on above the windows, with the shack's sign
  const upper = new THREE.BoxGeometry(12.5, 1.6, 0.1).translate(0.15, 1.29 * F + 0.8, WALL_Z - 0.03);
  b.painted(upper, 0xe9e1d3);
  upper.dispose();
  if (title) g.add(sign(title));
  const stripe = new THREE.BoxGeometry(9, 0.2, 0.06).translate(0, 0.1, WALL_Z + 0.06);
  b.painted(stripe, 0xc0392b);
  stripe.dispose();

  // the customers' bar and its stools
  for (let i = -3; i < 3; i++) b.furniture('kitchenBar', i * UNIT, 0, BAR_Z, 0, [F, F * 0.72, F]);
  b.furniture('kitchenBarEnd', -3 * UNIT - 0.102 * F, 0, BAR_Z, 0, [F, F * 0.72, F]);
  b.furniture('kitchenBarEnd', 3 * UNIT, 0, BAR_Z, 0, [F, F * 0.72, F]);
  for (let i = 0; i < seats; i++) b.furniture('stoolBar', seatX(i, seats) - 0.265 * 0.7, 0, STOOL_Z + 0.115 * 1.4, 0, [1.4, 1.1, 1.4]);
  // napkins and condiments on the bar
  b.foodItem('bottle-ketchup', -2.45, BAR_TOP, BAR_Z - 0.2, 0.3, 0.9);
  b.foodItem('bottle-musterd', -2.3, BAR_TOP, BAR_Z - 0.24, -0.4, 0.9);
  b.foodItem('shaker-salt', 2.35, BAR_TOP, BAR_Z - 0.2, 0, 1.1);
  b.foodItem('shaker-pepper', 2.48, BAR_TOP, BAR_Z - 0.24, 0, 1.1);

  // the pass: five cabinets, plates on the middle three
  for (let i = 0; i < 5; i++) b.furniture('kitchenCabinet', ROW_X0 + i * UNIT, 0, PASS_Z, 0, F);
  for (let p = 0; p < 4; p++) b.foodItem('plate', -0.97 + p * 0.647, TOP, PASS_Z - UNIT / 2, 0, 0.62);
  // veggie board (left) and buns + condiments (right)
  if (open('veggie')) {
    b.foodItem('cabbage', colX(0) - 0.15, TOP, PASS_Z - UNIT / 2 - 0.1, 0.4, 0.8);
    b.foodItem('tomato', colX(0) + 0.2, TOP, PASS_Z - UNIT / 2 + 0.05, 0, 1.1);
    b.foodItem('tomato', colX(0) + 0.08, TOP, PASS_Z - UNIT / 2 + 0.22, 0, 1.0);
  }
  b.foodItem('bread', colX(4) - 0.08, TOP, PASS_Z - UNIT / 2, 0.2, 0.9);
  b.foodItem('bread', colX(4) - 0.06, TOP + 0.04, PASS_Z - UNIT / 2 + 0.02, -0.1, 0.9);
  b.foodItem('bottle-ketchup', colX(4) + 0.24, TOP, PASS_Z - UNIT / 2 - 0.15, 0, 1);
  b.foodItem('bottle-musterd', colX(4) + 0.27, TOP, PASS_Z - UNIT / 2 + 0.12, 0, 1);

  // the kitchen row: open stations get their equipment, closed ones a bare counter
  KITCHEN_ROW.forEach((st, i) => {
    const x = ROW_X0 + i * UNIT;
    const cx = colX(i), cz = KITCHEN_Z - UNIT / 2;
    if (!open(st)) {
      b.furniture('kitchenCabinet', x, 0, KITCHEN_Z, 0, F);
      return;
    }
    switch (st) {
      case 'grill':
        b.furniture('kitchenStove', x, 0, KITCHEN_Z, 0, F);
        break;
      case 'dogs':
        b.furniture('kitchenStoveElectric', x, 0, KITCHEN_Z, 0, F);
        break;
      case 'fryer':
        b.furniture('kitchenCabinet', x, 0, KITCHEN_Z, 0, F);
        b.foodItem('pot', cx, TOP, cz - 0.1, Math.PI / 2, 0.75);
        break;
      case 'soda':
        b.furniture('kitchenCabinet', x, 0, KITCHEN_Z, 0, F);
        b.furniture('kitchenCoffeeMachine', cx - 0.29, TOP, cz + 0.05, 0, F * 1.5);
        break;
      case 'cream':
        b.furniture('kitchenCabinet', x, 0, KITCHEN_Z, 0, F);
        b.foodItem('ice-cream-cne', cx - 0.26, TOP, cz - 0.28, 0, 0.7);
        b.foodItem('ice-cream-cne', cx - 0.12, TOP, cz - 0.3, 0.6, 0.7);
        b.foodItem('cupcake', cx + 0.25, TOP, cz - 0.27, 0, 0.8);
        break;
      default:
        b.furniture('kitchenCabinet', x, 0, KITCHEN_Z, 0, F);
    }
  });
  // the back of the kitchen and the dining room: fridge, sink, plants, a TV and a jukebox radio
  b.furniture('kitchenFridgeLarge', 3 * UNIT + 0.1, 0, KITCHEN_Z - 0.05, -Math.PI / 2, [F, F * 0.9, F]);
  b.furniture('trashcan', -3 * UNIT - 0.35, 0, PASS_Z - 0.1, 0, F);
  b.furniture('pottedPlant', 3.55, 0, -3.9, 0, F);
  b.furniture('plantSmall1', 2.35, BAR_TOP, BAR_Z - 0.3, 0, F);
  b.furniture('televisionModern', 1.6, 1.75, WALL_Z + 0.2, 0, F * 0.7);
  b.furniture('radio', 2.75, 0.0, WALL_Z + 0.25, 0, F);
  b.furniture('rugRectangle', DOOR.x - 0.75, 0.005, DOOR.z + 1.2, 0, [0.95, 1, 0.9]);
  b.furniture('tableRound', 3.0, 0.27 * F, -3.25, 0, F * 0.8);
  b.furniture('chair', 3.5, 0, -2.9, Math.PI * 0.6, F * 0.9);
  b.build(g);
  parent.add(g);
  return g;
}

/** The shack's name on a sign above the bar (a canvas texture, freed with the world). */
function sign(title: string): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 192;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.roundRect(8, 8, 1008, 176, 48);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#fff3d6';
  g.beginPath();
  g.roundRect(22, 22, 980, 148, 38);
  g.stroke();
  g.fillStyle = '#fff3d6';
  g.font = '700 104px "Fredoka", "Nunito", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, 512, 102, 920);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.675), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.position.set(0.4, 1.29 * F + 0.62, WALL_Z + 0.06);
  return m;
}

// ------------------------------------------------------------------ the food, customers and chef

interface Flight {
  model: FoodModel;
  scale: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: number;
  /** When it lands: a customer id (the item vanishes into their order) or null. */
  onLand?: () => void;
  tint?: THREE.Color;
}

export interface Look { figure: number; tint: THREE.Color }

const LOOK_TINTS = [0xffffff, 0xffe9d6, 0xe4f0ff, 0xfff4c4, 0xf2e2ff, 0xdfffe8, 0xffdede, 0xe8e8e8];

export function lookOf(c: Customer): Look {
  return { figure: c.look % CUSTOMER_FIGURES.length, tint: new THREE.Color(LOOK_TINTS[(c.look >> 2) % LOOK_TINTS.length]) };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

const RAW = new THREE.Color(1.55, 0.72, 0.78);
const BURNT = new THREE.Color(0.22, 0.19, 0.17);

/** The customers' animation clips. */
const CLIPS = ['walk', 'sit', 'idle', 'emote-yes', 'emote-no'];

export class DinerView {
  private food = new Map<FoodModel, Instances>();
  private rigs: RigInstances[] = [];
  flights: Flight[] = [];
  /** Per-customer view state: where they stand and how they face. */
  private poses = new Map<number, { x: number; z: number; yaw: number }>();
  /** Squash-and-stretch pops per slot key. */
  private pops = new Map<string, number>();
  /** Slots whose food is still flying in (drawn once it lands). */
  readonly hidden = new Set<string>();
  time = 0;

  constructor(parent: THREE.Object3D) {
    const mat = foodMat();
    const counts: Partial<Record<FoodModel, number>> = {
      'meat-patty': 10, 'meat-sausage': 6, 'burger-cheese': 10, burger: 10, 'hot-dog': 10, fries: 10, soda: 8,
      'ice-cream': 8, 'ice-cream-cne': 4, cabbage: 4, tomato: 4,
    };
    for (const [k, n] of Object.entries(counts)) {
      this.food.set(k as FoodModel, new Instances(parent, foodGeo(k as FoodModel), mat, n!, { shadows: true, colors: true }));
    }
    for (const fig of CUSTOMER_FIGURES) this.rigs.push(new RigInstances(parent, fig, CLIPS, MAX_SEATS + 4));
  }

  /** Draw calls for the dynamic parts (one per food model and body part, shadows excluded). */
  get drawCalls(): number {
    let n = 0;
    for (const f of this.food.values()) if (f.count) n++;
    for (const r of this.rigs) n += r.drawCalls;
    return n;
  }

  pop(ref: Ref): void { this.pops.set(ref.st + ref.slot, 1); }

  /** Sends a food model flying from a to b (to a plate or a customer). */
  fly(model: FoodModel, scale: number, from: THREE.Vector3, to: THREE.Vector3, o: { dur?: number; onLand?: () => void; arc?: number; hide?: string; tint?: THREE.Color } = {}): void {
    const hide = o.hide;
    if (hide) this.hidden.add(hide);
    this.flights.push({
      model, scale, from: from.clone(), to: to.clone(), t: 0, dur: o.dur ?? 0.42, arc: o.arc ?? 0.9, spin: (Math.random() - 0.5) * 6, tint: o.tint,
      onLand: () => {
        if (hide) { this.hidden.delete(hide); this.pops.set(hide, 1); }
        o.onLand?.();
      },
    });
  }

  /** Where a customer's head is (bubbles, coins and fly targets). */
  headOf(c: Customer, sim: Sim): THREE.Vector3 {
    const p = this.poseOf(c, sim);
    const seated = c.phase === 'seated';
    return new THREE.Vector3(p.x, seated ? 1.72 : 1.42, p.z);
  }

  private poseOf(c: Customer, sim: Sim): { x: number; z: number; yaw: number } {
    const n = sim.seats;
    const seat = c.seat >= 0 ? new THREE.Vector3(seatX(c.seat, n), 0, STOOL_Z) : null;
    const lerpPath = (pts: THREE.Vector3[], u: number) => {
      // a polyline at even speed
      const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
      const total = lens.reduce((a, b) => a + b, 0);
      let d = Phaser.Math.Clamp(u, 0, 1) * total;
      for (let i = 0; i < lens.length; i++) {
        if (d <= lens[i] || i === lens.length - 1) {
          const k = lens[i] ? Math.min(1, d / lens[i]) : 1;
          const a = pts[i], b = pts[i + 1];
          return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
        }
        d -= lens[i];
      }
      return { x: pts[0].x, z: pts[0].z, yaw: 0 };
    };
    const qi = sim.customers.filter((o) => o.phase === 'queue' || o.phase === 'in').indexOf(c);
    const qp = queuePos(Math.max(0, qi));
    switch (c.phase) {
      case 'in': return lerpPath([DOOR, qp], c.t / QUEUE_WALK);
      case 'queue': {
        const prev = this.poses.get(c.id);
        const tx = qp.x, tz = qp.z;
        if (prev) {
          const k = Math.min(1, 0.08);
          const x = prev.x + (tx - prev.x) * k, z = prev.z + (tz - prev.z) * k;
          return { x, z, yaw: Math.PI * 0.35 };
        }
        return { x: tx, z: tz, yaw: Math.PI * 0.35 };
      }
      case 'toSeat': {
        const from = this.poses.get(c.id);
        const start = from && (from.z > -3.6 || from.x !== DOOR.x) ? new THREE.Vector3(from.x, 0, from.z) : DOOR;
        return lerpPath([start, new THREE.Vector3(start.x, 0, WALK_Z), new THREE.Vector3(seat!.x, 0, WALK_Z), seat!], c.t / walkTime(c.seat));
      }
      case 'seated':
      case 'happy':
      case 'angry':
        return { x: seat ? seat.x : qp.x, z: seat ? seat.z : qp.z, yaw: 0 };
      case 'out':
      case 'gone': {
        const from = seat ?? qp;
        if (!seat) return lerpPath([from, DOOR], c.t / QUEUE_WALK);
        return lerpPath([from, new THREE.Vector3(from.x, 0, WALK_Z), new THREE.Vector3(DOOR.x, 0, WALK_Z), DOOR], c.t / walkTime(c.seat));
      }
    }
  }

  update(dt: number, sim: Sim): void {
    this.time += dt;
    for (const [k, v] of this.pops) { const n = v - dt * 4; if (n <= 0) this.pops.delete(k); else this.pops.set(k, n); }
    for (const f of this.food.values()) f.begin();
    const put = (model: FoodModel, pos: THREE.Vector3, scale: number, yaw = 0, tint?: THREE.Color, sy = 1, popKey?: string) => {
      const inst = this.food.get(model);
      if (!inst) return;
      const p = popKey ? this.pops.get(popKey) ?? 0 : 0;
      const squash = 1 + Math.sin(p * Math.PI) * 0.35;
      _q.setFromEuler(_e.set(0, yaw, 0));
      _s.set(scale / Math.sqrt(squash), scale * sy * squash, scale / Math.sqrt(squash));
      _m.compose(pos, _q, _s);
      inst.put(_m, tint);
    };
    // grill and hot-dog griddle
    const cookTint = (s: { s: string; t: number }, cookT: number) => {
      if (s.s === 'cook') return _col.copy(RAW).lerp(new THREE.Color(1, 1, 1), Math.min(1, s.t / cookT));
      if (s.s === 'done') return _col.setRGB(1, 1, 1).multiplyScalar(1 - 0.35 * Math.min(1, s.t / sim.burnTime));
      return _col.copy(BURNT);
    };
    if (sim.open('grill')) sim.grill.forEach((s, i) => {
      if (i >= sim.grillSlots || s.s === 'empty') return;
      const sizzle = s.s === 'cook' ? Math.sin(this.time * 30 + i) * 0.004 : 0;
      put('meat-patty', _v.copy(slotPos('grill', i)).setY(TOP + 0.01 + sizzle), 0.95, i * 0.7, cookTint(s, sim.cookTime), 1, 'grill' + i);
    });
    if (sim.open('dogs')) sim.dogs.forEach((s, i) => {
      if (i >= sim.dogSlots || s.s === 'empty') return;
      put('meat-sausage', _v.copy(slotPos('dogs', i)).setY(TOP + 0.01), 1.05, Math.PI / 2 + Math.sin(this.time * 2 + i) * 0.05, cookTint(s, sim.dogTime), 1, 'dogs' + i);
    });
    // plates
    sim.plates.forEach((it, i) => {
      if (!it || i >= sim.plateCount || this.hidden.has('pass' + i)) return;
      put(ITEM_MODEL[it], _v.copy(slotPos('pass', i)).setY(TOP + 0.05), ITEM_SCALE[it], it === 'hotdog' ? 0.5 : 0.3, undefined, 1, 'pass' + i);
    });
    // soda cups fill up; cones get their scoop
    sim.soda.forEach((s, i) => {
      if (s.s === 'empty') return;
      const k = s.s === 'fill' ? 0.25 + 0.75 * Math.min(1, s.t / sim.fillTime) : 1;
      put('soda', _v.copy(slotPos('soda', i)), ITEM_SCALE.soda, 0, undefined, k, 'soda' + i);
    });
    if (sim.open('cream')) sim.cream.forEach((s, i) => {
      if (s.s === 'empty') return;
      if (s.s === 'fill') put('ice-cream-cne', _v.copy(slotPos('cream', i)), 0.72 * 1.1, 0);
      else put('ice-cream', _v.copy(slotPos('cream', i)), ITEM_SCALE.icecream, 0, undefined, 1, 'cream' + i);
    });
    // fries tray, and fries bobbing in the pot while frying
    if (sim.open('fryer')) {
      for (let i = 0; i < sim.tray; i++) put('fries', _v.copy(slotPos('fryer', i)), ITEM_SCALE.fries * 0.85, 0, undefined, 1, 'fryer' + i);
      if (sim.fryer.s === 'fry') {
        const c = stationCentre('fryer');
        const bob = Math.sin(this.time * 9) * 0.02;
        put('fries', _v.set(c.x, TOP + 0.08 + bob, c.z - 0.1), 0.7, this.time * 0.6, _col.setRGB(1, 0.92, 0.75).multiplyScalar(0.6 + 0.4 * Math.min(1, sim.fryer.t / sim.fryTime)));
      }
    }
    // flights
    for (const f of this.flights) {
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      _v.copy(f.from).lerp(f.to, e);
      _v.y += Math.sin(u * Math.PI) * f.arc;
      put(f.model, _v, f.scale * (1 + Math.sin(u * Math.PI) * 0.25), f.spin * u, f.tint);
      if (u >= 1 && f.onLand) { f.onLand(); f.onLand = undefined; }
    }
    this.flights = this.flights.filter((f) => f.t < f.dur);
    for (const f of this.food.values()) f.end();

    // customers
    for (const r of this.rigs) r.begin();
    const alive = new Set<number>();
    for (const c of sim.customers) {
      if (c.phase === 'gone') continue;
      alive.add(c.id);
      const p = this.poseOf(c, sim);
      // the queue drifts smoothly; everyone else follows the sim
      this.poses.set(c.id, p);
      const L = lookOf(c);
      const rig = this.rigs[L.figure];
      let clip = 'idle', t = this.time + c.id * 0.37, hold = false;
      let y = 0;
      if (c.phase === 'in' || c.phase === 'toSeat' || c.phase === 'out') clip = 'walk';
      else if (c.phase === 'seated') { clip = 'sit'; y = SIT_Y; t = 0.5; hold = true; }
      else if (c.phase === 'happy') { clip = 'emote-yes'; t = c.t; }
      else if (c.phase === 'angry') { clip = 'emote-no'; t = c.t; }
      // the walk clip's speed follows the walking speed so feet do not slide
      if (clip === 'walk') t = this.time * 1.6 + c.id;
      // impatience: the seated customer fidgets (a small sway) when patience runs low
      let sway = 0;
      if (c.phase === 'seated' && c.patience / c.max < 0.3) sway = Math.sin(this.time * 14 + c.id) * 0.06;
      // a happy hop as the order completes
      if (c.phase === 'happy') y = SIT_Y * Math.max(0, 1 - c.t / (HAPPY_T * 0.4)) + Math.abs(Math.sin(c.t * 7)) * 0.08;
      if (c.phase === 'angry') y = SIT_Y * Math.max(0, 1 - c.t / 0.3);
      _q.setFromEuler(_e.set(0, p.yaw + sway, 0));
      _m.compose(_v.set(p.x, y, p.z), _q, _s.set(C, C, C));
      const tint = c.phase === 'angry' ? _col.copy(L.tint).lerp(new THREE.Color(1, 0.45, 0.4), 0.55) : L.tint;
      rig.put(_m, clip, t, tint, hold);
    }
    for (const id of this.poses.keys()) if (!alive.has(id)) this.poses.delete(id);
    for (const r of this.rigs) r.end();
  }
}
