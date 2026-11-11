// One off-road truck: a car-kit model with big wheels and a lifted body, plus its arcade physics
// (2.5D: x/z with heading and velocity, height from the terrain, ballistic jumps).
import { THREE, model } from '@core/three';
import { SURF_DIRT, SURF_MUD, SURF_PUDDLE, type Terrain } from './terrain';
import type { Near, Track } from './tracks';
import { matte } from './look';

export const GRAVITY = 24;
export const TRUCK_R = 1.1;
const WHEEL_SCALE = 1.35;
const WHEEL_R = 0.3 * WHEEL_SCALE;
const LIFT = 0.2;
const MODEL_SCALE = 0.95;

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
const blobGeo = new THREE.PlaneGeometry(2.1, 3.1);
blobGeo.rotateX(-Math.PI / 2);

const flameGeo = new THREE.ConeGeometry(0.2, 1.1, 8, 1, true);
flameGeo.rotateX(Math.PI / 2);   // tip towards +z (behind the truck)
flameGeo.translate(0, 0, 0.55);

export class Truck {
  readonly root = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly body = new THREE.Group();
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

  constructor(readonly modelKey: string, readonly color: number, readonly isPlayer: boolean) {
    const m = matte(model(modelKey));
    // paint, per truck
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat?.name?.toLowerCase().includes('paint')) {
        const c = mat.clone();
        c.color.setHex(color);
        c.metalness = 0.1;
        c.roughness = 0.45;
        mesh.material = c;
        mesh.userData.ownMaterial = true;
      }
    });
    // big wheels, lifted body: the root node of the kit model holds body + wheels
    let inner: THREE.Object3D = m;
    m.traverse((o) => {
      if (o.name.startsWith('wheel_') && o.parent) inner = o.parent;
    });
    for (const child of [...inner.children]) {
      const name = child.name;
      if (name.startsWith('wheel_') && name !== 'wheel_back') {
        child.scale.multiplyScalar(WHEEL_SCALE);
        child.position.y = WHEEL_R;
        child.position.x = Math.sign(child.position.x) * 0.4;
        child.rotation.order = 'YXZ';
        this.wheels.push({ node: child, front: name.toLowerCase().includes('front') });
      } else {
        child.position.y += WHEEL_R - 0.3 + LIFT;
        inner.remove(child);
        this.body.add(child);
      }
    }
    inner.add(this.body);
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.flame.userData.ownMaterial = true;
    this.flame.position.set(0, 0.62 + LIFT, 1.3);
    this.flame.visible = false;
    this.body.add(this.flame);
    m.scale.setScalar(MODEL_SCALE);
    if (isPlayer) {
      // the player's truck gets its own materials, so the in-car view can hide it alone
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh === this.flame) return;
        if (!mesh.userData.ownMaterial) {
          mesh.material = (mesh.material as THREE.Material).clone();
          mesh.userData.ownMaterial = true;
        }
        this.own.push(mesh.material as THREE.Material);
      });
    }
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.4, depthWrite: false });
    this.blob = new THREE.Mesh(blobGeo, this.blobMat);
    this.blob.userData.ownMaterial = true;
    this.blob.renderOrder = 1;
    this.tilt.add(m);
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
    this.body.position.y = this.susp;
    if (this.squashT < 1) {
      this.squashT = Math.min(1, this.squashT + dt / 0.25);
      const k = Math.sin(this.squashT * Math.PI) * 0.16;
      this.body.scale.set(1 + k * 0.5, 1 - k, 1 + k * 0.5);
    }
    const spin = (this.forward * dt) / (WHEEL_R * MODEL_SCALE);
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
