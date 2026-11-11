// One off-road truck: a Kenney Toy Car Kit monster truck (or its pickup cab on the same lifted
// chassis) with spinning, steering wheels, stretching suspension arms and a per-truck paint job,
// plus its arcade physics (2.5D: x/z with heading and velocity, height from the terrain,
// ballistic jumps).
import { THREE, model } from '@core/three';
import { SURF_DIRT, SURF_MUD, SURF_PUDDLE, type Terrain } from './terrain';
import type { Near, Track } from './tracks';
import { matte } from './look';

export const GRAVITY = 24;
export const TRUCK_R = 1.1;

/** The two bodies: the monster truck, and the kit's pickup lifted onto the monster's chassis. */
export type TruckModel = 'monster' | 'pickup';
/** Model keys (loaded in main.ts from kenney/toy-car-kit). */
export const TRUCK_MODELS: Record<TruckModel, string> = { monster: 'vehicle-monster-truck', pickup: 'vehicle-suv' };

/** Toy Car Kit units to world units: a truck is about 2.5 long, 1.8 wide and 2.2 tall. */
const S = 2.9;
/** Wheel radius (kit units) and the axle height (wheel centres stand on the ground). */
const WHEEL_KIT_R = 0.1875;
const WHEEL_R = WHEEL_KIT_R * S;
/** Kit-unit heights between which the suspension arms stretch: the axles stay with the wheels. */
const ARM_LOW = 0.25, ARM_HIGH = 0.42;
/** The pickup cab's lift onto the monster chassis (kit units), so its floor meets the arm tops. */
const PICKUP_LIFT = 0.33;
/** The paint swatch of the kit's colour map (column, row of 64×128 cells): the purple body. */
const PAINT_CELL: [number, number] = [7, 2];

/** Where things are on a truck (world units: side from the centre, back from the centre, up). */
export const TRUCK_GEOM = {
  /** Rear wheels: their contact patch, for dust, spray and skid marks. */
  wheelSide: 0.219 * S,
  wheelBack: 0.25 * S,
  wheelR: WHEEL_R,
  /** Tyre width (skid marks). */
  tyre: 0.17 * S,
  /** The tail, where the nitro flame comes out. */
  exhaustBack: 0.33 * S,
  exhaustUp: 0.36 * S,
};

export interface Stats {
  top: number;
  accel: number;
  grip: number;
  turn: number;
  /** 0..1: how much of a landing or bump the suspension soaks up. */
  shocks: number;
  /** 0..1: how much of the mud's pull is taken away (Easy: the player's truck). Default 0. */
  mudEase?: number;
}

export interface DriveInput {
  /** Steering relative to the truck itself: -1 full left .. 1 full right (0 = straight). */
  steer: number;
  /** -1..1. Above 0 is gas; below 0 brakes and, once the truck has stopped, reverses. */
  throttle: number;
  /** Ease off (AI before a bend). */
  brake?: boolean;
}

/** Hard braking (units/s²) and the share of top speed available in reverse. */
const BRAKE = 30;
const REVERSE_TOP = 0.42;

/** Events of one physics step, for sounds and particles. */
export interface StepEvents {
  launched: boolean;
  landed: number;     // impact speed, 0 if none
  wall: number;       // impact speed into the berm, 0 if none
}

/** Share of the turn rate available at a speed: slow trucks pivot, fast ones need room. */
export function turnFactor(v: number): number {
  const a = Math.abs(v);
  return Math.min(1, 0.35 + a / 6) * (1 - 0.4 * Math.max(0, Math.min(1, (a - 8) / 10)));
}

let blobTex: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.7)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
const blobGeo = new THREE.PlaneGeometry(2.3, 3.0);
blobGeo.rotateX(-Math.PI / 2);

const flameGeo = new THREE.ConeGeometry(0.2, 1.1, 8, 1, true);
flameGeo.rotateX(Math.PI / 2);   // tip towards +z (behind the truck)
flameGeo.translate(0, 0, 0.55);

/** The parts of one body style, built once from the kit model and shared by every truck. */
interface Kit {
  /** Body (and the chassis arms) in kit units, with a morph target that lifts it on its springs. */
  body: THREE.BufferGeometry;
  /** The kit's material (its colour map), made matte. */
  material: THREE.MeshStandardMaterial;
  wheels: { geo: THREE.BufferGeometry; x: number; y: number; z: number; front: boolean }[];
}
const kits = new Map<TruckModel, Kit>();

/** Non-indexed copy of a geometry with the node's transform baked in (position, normal, uv only). */
function baked(mesh: THREE.Mesh): THREE.BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

/** The triangles of a non-indexed geometry that pass a test on their three vertex heights. */
function triangles(g: THREE.BufferGeometry, keep: (minY: number) => boolean): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const tris: number[] = [];
  for (let t = 0; t < pos.count; t += 3) if (keep(Math.min(pos.getY(t), pos.getY(t + 1), pos.getY(t + 2)))) tris.push(t);
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(tris.length * 3 * a.itemSize);
    tris.forEach((t, k) => arr.set(a.array.subarray(t * a.itemSize, (t + 3) * a.itemSize), k * 3 * a.itemSize));
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

/** Joins non-indexed geometries with the same attributes into one (one draw call). */
function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrs = parts.map((g) => (g.getAttribute(name) as THREE.BufferAttribute).array as Float32Array);
    const arr = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) { arr.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, name === 'uv' ? 2 : 3));
  }
  return out;
}

/**
 * The suspension as a morph target: everything above the arms rises one world unit per unit of
 * influence, the axles stay with the wheels and the arms between them stretch.
 */
function withSprings(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const d = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const w = Math.max(0, Math.min(1, (pos.getY(i) - ARM_LOW) / (ARM_HIGH - ARM_LOW)));
    d[i * 3 + 1] = w / S;
  }
  g.morphAttributes.position = [new THREE.BufferAttribute(d, 3)];
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function kit(kind: TruckModel): Kit {
  const done = kits.get(kind);
  if (done) return done;
  // both styles stand on the monster truck's chassis and wheels
  const mt = model(TRUCK_MODELS.monster, { shadows: false });
  mt.updateMatrixWorld(true);
  const meshes = (o: THREE.Object3D) => {
    const list: THREE.Mesh[] = [];
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) list.push(c as THREE.Mesh); });
    return list;
  };
  const parts = meshes(matte(mt));
  const wheels: Kit['wheels'] = parts.filter((m) => m.name.startsWith('wheel-')).map((m) => {
    const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    return { geo: m.geometry, x: p.x, y: p.y, z: p.z, front: m.name[6] === 'f' };
  });
  let body = baked(parts.find((m) => !m.name.startsWith('wheel-'))!);
  if (kind === 'pickup') {
    // the chassis (axles and arms: every triangle that reaches down to the axles) under the
    // kit's pickup cab, lifted to meet the arm tops
    const chassis = triangles(body, (minY) => minY < ARM_LOW);
    const pk = model(TRUCK_MODELS.pickup, { shadows: false });
    pk.updateMatrixWorld(true);
    const cab = baked(meshes(pk).find((m) => !m.name.startsWith('wheel-'))!).translate(0, PICKUP_LIFT, 0);
    body = joined([chassis, cab]);
  }
  const k: Kit = { body: withSprings(body), material: parts[0].material as THREE.MeshStandardMaterial, wheels };
  kits.set(kind, k);
  return k;
}

/** Paint tint when clean and fully mud-caked (it multiplies the colour map). */
const CLEAN = new THREE.Color(1, 1, 1);
const MUDDY = new THREE.Color(0xa47a54);

/** The kit's colour map with its body swatch repainted, one per colour (shared by trucks). */
const paints = new Map<number, THREE.Texture>();
function paintedMap(src: THREE.Texture, color: number): THREE.Texture {
  const done = paints.get(color);
  if (done) return done;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  // keep the swatch's own shading (light top, darker foot), in the new colour
  const cw = img.width / 8, ch = img.height / 4;
  const d = x.getImageData(PAINT_CELL[0] * cw, PAINT_CELL[1] * ch, cw, ch);
  let mean = 0;
  for (let i = 0; i < d.data.length; i += 4) mean += Math.max(d.data[i], d.data[i + 1], d.data[i + 2]);
  mean /= d.data.length / 4;
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  for (let i = 0; i < d.data.length; i += 4) {
    const k = Math.max(0.72, Math.min(1.12, Math.max(d.data[i], d.data[i + 1], d.data[i + 2]) / mean));
    d.data[i] = Math.min(255, r * k);
    d.data[i + 1] = Math.min(255, g * k);
    d.data[i + 2] = Math.min(255, b * k);
  }
  x.putImageData(d, PAINT_CELL[0] * cw, PAINT_CELL[1] * ch);
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  t.anisotropy = 4;
  paints.set(color, t);
  return t;
}

export class Truck {
  readonly root = new THREE.Group();
  private readonly tilt = new THREE.Group();
  /** The sprung body: world units, its origin at axle height (landings squash it from there). */
  private readonly body = new THREE.Group();
  private readonly bodyMesh: THREE.Mesh;
  private readonly paint: THREE.MeshStandardMaterial;
  /** 0..1: how muddy the paint is (mud pits splash it on, puddles wash it off). */
  dirt = 0;
  private dirtShown = -1;
  /** Rides on the springs with the body (the nitro flame). */
  private readonly upper = new THREE.Group();
  private wheels: { node: THREE.Object3D; front: boolean }[] = [];
  private flame: THREE.Mesh;
  private flameMat: THREE.MeshBasicMaterial;
  /** A soft dark blob on the ground under the truck: it stays down when the truck flies. */
  readonly blob: THREE.Mesh;
  private blobMat: THREE.MeshBasicMaterial;
  /** The player's own body materials (cloned), switched off in the in-car view (ghost). */
  private own: THREE.Material[] = [];

  x = 0; z = 0; y = 0;
  vx = 0; vz = 0; vy = 0;
  heading = 0;
  airborne = false;
  airTime = 0;
  /** Front wheel angle for the model (follows the steering input). */
  steer = 0;
  /** Sideways slide speed after the last step (skid marks, spray). */
  slip = 0;
  /** Hard braking this step (skid marks, brake sound). */
  braking = false;
  surface = SURF_DIRT;
  private lastGround = 0;
  private lastRate = 0;
  private susp = 0;
  private suspV = 0;
  private pitch = 0;
  private roll = 0;
  private squashT = 1;

  // race state
  near: Near = { i: 0, s: 0, d: 0, dist: 0 };
  s = 0;
  lapsDone = -1;
  cpNext = 0;
  finished = false;
  finishTime = 0;
  nitro = 0;
  nitroT = 0;
  /** AI: preferred lane, wander phase, skill and nitro cooldown. */
  lane = 0;
  phase = 0;
  skill = 1;
  aiNitroCd = 0;

  constructor(readonly kind: TruckModel, readonly color: number, readonly isPlayer: boolean) {
    const k = kit(kind);
    const paint = k.material.clone();
    paint.map = paintedMap(k.material.map!, color);
    paint.roughness = 0.75;
    this.paint = paint;
    // the player's truck gets its own materials, so the in-car view can hide it alone
    const tyre = isPlayer ? k.material.clone() : k.material;
    const axle = WHEEL_KIT_R * S;
    this.bodyMesh = new THREE.Mesh(k.body, paint);
    this.bodyMesh.scale.setScalar(S);
    this.bodyMesh.position.y = -axle;
    this.bodyMesh.userData.ownMaterial = true;
    this.body.position.y = axle;
    this.body.add(this.bodyMesh, this.upper);
    for (const w of k.wheels) {
      const node = new THREE.Mesh(w.geo, tyre);
      node.position.set(w.x * S, w.y * S, w.z * S);
      node.scale.setScalar(S);
      node.rotation.order = 'YXZ';
      if (isPlayer) node.userData.ownMaterial = true;
      this.wheels.push({ node, front: w.front });
      this.tilt.add(node);
    }
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.flame.userData.ownMaterial = true;
    this.flame.position.set(0, TRUCK_GEOM.exhaustUp - axle, TRUCK_GEOM.exhaustBack);
    this.flame.visible = false;
    this.flame.castShadow = false;
    this.upper.add(this.flame);
    for (const o of [this.bodyMesh, ...this.wheels.map((w) => w.node)]) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    if (isPlayer) this.own.push(paint, tyre);
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.4, depthWrite: false });
    this.blob = new THREE.Mesh(blobGeo, this.blobMat);
    this.blob.userData.ownMaterial = true;
    this.blob.renderOrder = 1;
    this.tilt.add(this.body);
    this.root.add(this.tilt);
  }

  /**
   * In-car view: the body draws nothing (the camera sits inside it) but still casts its shadow
   * on the ground. The nitro flame stays visible (in the mirror).
   */
  setGhost(on: boolean): void {
    for (const m of this.own) {
      m.colorWrite = !on;
      m.depthWrite = !on;
    }
  }

  /** Menu showcase: the body idles on its springs like a revving engine, with a blip now and then. */
  idle(t: number): void {
    const blip = Math.max(0, Math.sin(t * 0.9)) ** 12;
    const v = Math.sin(t * 23) * 0.012 + blip * 0.16 * Math.sin(t * 9);
    this.bodyMesh.morphTargetInfluences![0] = v;
    this.upper.position.y = v;
  }

  /** The body's smoothed pitch and roll (radians) and suspension travel, for the in-car camera. */
  get bodyPitch(): number { return this.pitch; }
  get bodyRoll(): number { return this.roll; }
  get suspension(): number { return this.susp; }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** Signed speed along the heading. */
  get forward(): number {
    return this.vx * Math.cos(this.heading) + this.vz * Math.sin(this.heading);
  }

  place(x: number, z: number, heading: number, terrain: Terrain): void {
    this.x = x; this.z = z; this.heading = heading;
    this.dirt = 0;
    this.vx = this.vz = this.vy = 0;
    this.y = this.lastGround = terrain.heightAt(x, z);
    this.lastRate = 0;
    this.airborne = false;
    this.airTime = 0;
    this.susp = this.suspV = 0;
    this.nitroT = 0;
    this.steer = 0;
    this.slip = 0;
    this.braking = false;
  }

  /** One physics step. */
  drive(dt: number, input: DriveInput, st: Stats, terrain: Terrain, track: Track): StepEvents {
    const ev: StepEvents = { launched: false, landed: 0, wall: 0 };
    const boosting = this.nitroT > 0;
    if (boosting) this.nitroT -= dt;
    this.surface = terrain.surfaceAt(this.x, this.z);
    const mud = this.surface === SURF_MUD, wet = this.surface === SURF_PUDDLE, rough = this.surface > SURF_PUDDLE;
    const moving = Math.min(1, this.speed / 6);
    if (mud && !this.airborne) this.dirt = Math.min(1, this.dirt + dt * 0.7 * moving);
    else if (wet) this.dirt = Math.max(0, this.dirt - dt * 0.9 * moving);
    // how strongly the mud holds this truck (1 = fully, 0 = like dry dirt)
    const mk = mud ? 1 - (st.mudEase ?? 0) : 0;
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    let vf = this.vx * fx + this.vz * fz;
    let vl = -this.vx * fz + this.vz * fx;

    // steering, relative to the truck: the yaw rate grows with speed (a little even when nearly
    // stopped, so a truck can turn round) and flips when rolling backwards, like a real car
    const steer = Math.max(-1, Math.min(1, input.steer));
    const throttle = Math.max(-1, Math.min(1, input.throttle));
    const backing = vf < -0.4 || (vf < 0.4 && throttle < 0);
    // power slide: hard lock at speed on the gas lets the tail step out
    const slide = !this.airborne && throttle > 0 && vf > 6 ? Math.abs(steer) * Math.min(1, (vf - 6) / 6) : 0;
    const k = this.airborne ? 0.2 : turnFactor(vf);
    this.heading += steer * st.turn * k * dt * (1 - 0.2 * mk) * (backing ? -1 : 1) * (1 + 0.22 * slide);
    this.steer += (steer * 0.55 - this.steer) * Math.min(1, dt * 12);
    this.braking = false;

    if (!this.airborne) {
      const surfTop = mud ? 1 - 0.45 * mk : wet ? 0.86 : rough ? 0.72 : 1;
      const top = st.top * surfTop * (boosting ? 1.45 : 1);
      if (throttle > 0) {
        if (vf < 0) vf = Math.min(0, vf + BRAKE * throttle * dt);
        else if (vf < top) vf = Math.min(top, vf + st.accel * throttle * (boosting ? 1.9 : 1) * dt);
      } else if (throttle < 0) {
        if (vf > 0.4) {
          vf = Math.max(0, vf - BRAKE * -throttle * dt);
          this.braking = vf > 3;
        } else if (vf > -top * REVERSE_TOP) {
          vf = Math.max(-top * REVERSE_TOP, vf - st.accel * 0.7 * -throttle * dt);
        }
      }
      if (vf > top) vf += (top - vf) * Math.min(1, dt * (mud ? 3.5 : 2));
      if (vf < -top * REVERSE_TOP) vf += (-top * REVERSE_TOP - vf) * Math.min(1, dt * 3);
      if (throttle === 0) vf *= 1 - Math.min(1, dt * (1.3 + 1.3 * mk));
      if (input.brake) vf *= 1 - Math.min(1, dt * 2.2);
      const grip = st.grip * (mud ? 1 - 0.82 * mk : wet ? 0.55 : 1) * (1 - 0.45 * slide) * (this.braking ? 0.7 : 1);
      const kill = 1 - Math.exp(-grip * dt);
      // part of the sideways slide carries on as forward speed: drifts stay fast
      vf += Math.abs(vl) * kill * (mud ? 0.15 : 0.35) * (vf < 0 ? -1 : 1);
      vl -= vl * kill;
      this.slip = Math.abs(vl);
      // bumpy ground costs speed, less with good shocks
      vf -= Math.abs(this.lastRate) * 0.06 * (1 - st.shocks) * vf * dt;
      this.vx = fx * vf - fz * vl;
      this.vz = fz * vf + fx * vl;
    } else {
      this.slip = 0;
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // the berm and its barriers: bounce back towards the track
    const g = track.nearest(this.x, this.z);
    const limit = track.half + 0.25;
    if (g.dist > limit) {
      const p = track.samples[g.i];
      const nx = (this.x - p.x) / g.dist, nz = (this.z - p.z) / g.dist;
      this.x = p.x + nx * limit;
      this.z = p.z + nz * limit;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= 1.35 * vn * nx;
        this.vz -= 1.35 * vn * nz;
        const loss = vn > 3 ? 0.82 : 0.95;
        this.vx *= loss; this.vz *= loss;
        if (vn > 2.5) ev.wall = vn;
      }
    }

    // height: follow the ground, fly off crests
    const ground = terrain.heightAt(this.x, this.z);
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        const impact = -this.vy;
        this.y = ground;
        this.airborne = false;
        this.vy = 0;
        this.lastRate = 0;
        if (this.airTime > 0.18) {
          ev.landed = impact;
          // a hard landing costs speed; shocks soak it up
          const loss = Math.min(0.45, impact * 0.035) * (1 - st.shocks);
          this.vx *= 1 - loss; this.vz *= 1 - loss;
          this.suspV -= impact * 0.35 * (1 - st.shocks * 0.5);
          this.squashT = 0;
        }
      }
    } else {
      const rate = dt > 0 ? (ground - this.lastGround) / dt : 0;
      if (this.lastRate > 1.6 && rate < this.lastRate - GRAVITY * dt * 1.5) {
        this.airborne = true;
        this.airTime = 0;
        this.vy = this.lastRate * 0.95;
        this.y = this.lastGround + this.vy * dt;
        ev.launched = true;
      } else {
        this.y = ground;
        this.suspV -= (rate - this.lastRate) * 0.04 * (1 - st.shocks);
      }
      this.lastRate = rate;
    }
    this.lastGround = ground;
    return ev;
  }

  /** Puts the model where the physics is: yaw, pitch and roll from the ground, spinning wheels. */
  pose(dt: number, terrain: Terrain): void {
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    let pitch: number, roll: number;
    if (this.airborne) {
      pitch = Math.atan2(this.vy, Math.max(4, this.speed)) * 0.8;
      roll = this.roll * 0.95;
    } else {
      const hf = terrain.heightAt(this.x + fx * 1.1, this.z + fz * 1.1);
      const hb = terrain.heightAt(this.x - fx * 1.1, this.z - fz * 1.1);
      const hr = terrain.heightAt(this.x - fz * 0.7, this.z + fx * 0.7);
      const hl = terrain.heightAt(this.x + fz * 0.7, this.z - fx * 0.7);
      pitch = Math.atan2(hf - hb, 2.2);
      roll = Math.atan2(hr - hl, 1.4);
    }
    // a little body roll in fast turns
    roll += -this.steer * Math.min(1, this.speed / 14) * 0.12;
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 14);
    this.roll += (roll - this.roll) * Math.min(1, dt * 12);
    // suspension spring
    this.suspV += (-260 * this.susp - 13 * this.suspV) * dt;
    this.susp += this.suspV * dt;
    this.susp = Math.max(-0.35, Math.min(0.3, this.susp));

    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = -this.heading - Math.PI / 2;
    // in the air: the truck grows a little towards the high camera and leaves its shadow behind
    const ground = terrain.heightAt(this.x, this.z);
    const lift = Math.max(0, this.y - ground);
    this.root.scale.setScalar(1 + Math.min(0.28, lift * 0.09));
    this.blob.position.set(this.x, ground + 0.07, this.z);
    this.blob.rotation.y = this.root.rotation.y;
    this.blob.scale.setScalar(1 - Math.min(0.35, lift * 0.1));
    this.blobMat.opacity = 0.42 / (1 + lift * 0.5);
    this.tilt.rotation.set(this.pitch, 0, this.roll);
    if (Math.abs(this.dirt - this.dirtShown) > 0.02) {
      this.dirtShown = this.dirt;
      this.paint.color.copy(CLEAN).lerp(MUDDY, this.dirt * 0.75);
    }
    // the springs: the body rises and sinks on its stretching arms, the axles stay on the wheels
    this.bodyMesh.morphTargetInfluences![0] = this.susp;
    this.upper.position.y = this.susp;
    if (this.squashT < 1) {
      this.squashT = Math.min(1, this.squashT + dt / 0.25);
      const k = Math.sin(this.squashT * Math.PI) * 0.16;
      this.body.scale.set(1 + k * 0.5, 1 - k, 1 + k * 0.5);
    }
    const spin = (this.forward * dt) / WHEEL_R;
    for (const w of this.wheels) {
      w.node.rotation.x -= spin;
      if (w.front) w.node.rotation.y = -this.steer * 0.9;
    }
    const boosting = this.nitroT > 0;
    this.flame.visible = boosting;
    if (boosting) {
      const f = 0.8 + Math.random() * 0.5;
      this.flame.scale.set(f, f, 0.8 + Math.random() * 0.9);
      this.flameMat.color.setHex(Math.random() < 0.5 ? 0xffa31a : 0xffd23f);
    }
  }

  /** World position of a point on the truck (local x right, z back), for particles. */
  local(rx: number, rz: number, up = 0.2): { x: number; y: number; z: number } {
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    return { x: this.x - fx * rz - fz * rx, y: this.y + up, z: this.z - fz * rz + fx * rx };
  }
}
