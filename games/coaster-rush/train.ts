// Coaster Rush: the train in 3D. One group per car (the car's model, turned to face along the
// track, and its riders in their seats), placed every frame on the track frame under it. Cars
// lean out in a corner taken too fast and tumble off it in a derail.
//
// Riders are Mini Characters moved only by their own clips through one AnimationMixer each: the
// legs and body from `sit`, the arms blended between `drive` (hands on the lap bar), `jump` (arms
// out) and `fall` (arms up and back), the head from `emote-yes` (a nod) or `emote-no` (a shake).
// On a drop or in airtime the arms go up, and for real hands-in-the-air the arm bones (their own
// limbs) are raised further on top of the clip; scared riders grip the bar and shake their heads.
// The front seat is the operator: the player's own platform character.
import { THREE, model, modelClips, playerCharacter3d } from '@core/three';
import { STYLES, clamp, type Style } from './defs';
import { ckKey, riderKey, RIDERS } from './kit';
import type { Sample } from './track';

export type Mood = 'calm' | 'thrill' | 'scared' | 'cheer';

const ARM_CLIPS = ['drive', 'jump', 'fall', 'sit'] as const;
const HEAD_CLIPS = ['sit', 'emote-yes', 'emote-no'] as const;
const clipCache = new Map<string, Map<string, THREE.AnimationClip>>();

/** A model's clips split into body (no arms, no head), arms and head parts. */
function partClips(key: string): Map<string, THREE.AnimationClip> {
  let m = clipCache.get(key);
  if (m) return m;
  m = new Map();
  for (const c of modelClips(key)) {
    const arms = c.tracks.filter((t) => t.name.startsWith('arm-'));
    const head = c.tracks.filter((t) => t.name.startsWith('head'));
    const body = c.tracks.filter((t) => !t.name.startsWith('arm-') && !t.name.startsWith('head'));
    m.set('body:' + c.name, new THREE.AnimationClip('body:' + c.name, c.duration, body));
    m.set('arms:' + c.name, new THREE.AnimationClip('arms:' + c.name, c.duration, arms));
    m.set('head:' + c.name, new THREE.AnimationClip('head:' + c.name, c.duration, head));
  }
  clipCache.set(key, m);
  return m;
}

export class Rider {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private arms: Record<string, THREE.AnimationAction> = {};
  private head: Record<string, THREE.AnimationAction> = {};
  private w: Record<string, number> = { drive: 1, jump: 0, fall: 0, sit: 0 };
  private hw: Record<string, number> = { sit: 1, 'emote-yes': 0, 'emote-no': 0 };
  private armL: THREE.Object3D | null;
  private armR: THREE.Object3D | null;
  private raise = 0;
  private phase = Math.random() * 10;
  mood: Mood = 'calm';
  /** Extra hands-up (0 … 1) asked by the ride. */
  up = 0;
  /** Seat height in the car (the rider floats up from it in airtime). */
  seatY = 0;
  private float = 0;
  private shiver = 0;

  constructor(readonly key: string, scale: number, mat: THREE.Material | null = null) {
    const obj = model(key, { shadows: true });
    if (mat) setMaterial(obj, mat);
    obj.scale.setScalar(scale);
    this.root.add(obj);
    this.mixer = new THREE.AnimationMixer(obj);
    const clips = partClips(key);
    const body = clips.get('body:sit');
    if (body) this.mixer.clipAction(body).play();
    for (const n of ARM_CLIPS) {
      const c = clips.get('arms:' + n);
      if (!c) continue;
      const a = this.mixer.clipAction(c);
      a.play();
      a.setEffectiveWeight(this.w[n]);
      a.time = Math.random() * c.duration;
      this.arms[n] = a;
    }
    for (const n of HEAD_CLIPS) {
      const c = clips.get('head:' + n);
      if (!c) continue;
      const a = this.mixer.clipAction(c);
      a.play();
      a.setEffectiveWeight(this.hw[n]);
      this.head[n] = a;
    }
    this.armL = obj.getObjectByName('arm-left') ?? null;
    this.armR = obj.getObjectByName('arm-right') ?? null;
  }

  update(dt: number): void {
    const want: Record<string, number> = { drive: 0, jump: 0, fall: 0, sit: 0 };
    const head: Record<string, number> = { sit: 0, 'emote-yes': 0, 'emote-no': 0 };
    let raise = 0;
    switch (this.mood) {
      // hands in the air: the `sit` arms lifted on their own shoulder bones (the clips' raised
      // arms go out sideways, not up)
      case 'thrill': want.sit = 1; head.sit = 1; raise = 0.75 + 0.25 * this.up; break;
      case 'scared': want.drive = 1; head['emote-no'] = 1; break;
      case 'cheer': want.sit = 1; head['emote-yes'] = 1; raise = 0.7; break;
      default: want.drive = 0.75; want.sit = 0.25; head.sit = 1;
    }
    const k = Math.min(1, dt * 7);
    for (const n of ARM_CLIPS) { this.w[n] += (want[n] - this.w[n]) * k; this.arms[n]?.setEffectiveWeight(this.w[n]); }
    for (const n of HEAD_CLIPS) { this.hw[n] += (head[n] - this.hw[n]) * k; this.head[n]?.setEffectiveWeight(this.hw[n]); }
    this.raise += (raise - this.raise) * Math.min(1, dt * 6);
    // airtime lifts the riders off their seats; fear makes them tremble
    this.float += ((this.mood === 'thrill' ? this.up : 0) - this.float) * Math.min(1, dt * 8);
    this.shiver += ((this.mood === 'scared' ? 1 : 0) - this.shiver) * Math.min(1, dt * 6);
    this.root.position.y = this.seatY + this.float * 0.1 + Math.sin(this.phase * 3.1) * 0.012 * this.shiver;
    this.mixer.update(dt);
    // hands in the air: the arms' own bones lifted further than the clip goes
    this.phase += dt * 9;
    if (this.raise > 0.01) {
      const a = this.raise * (1.75 + 0.15 * Math.sin(this.phase));
      this.armL?.quaternion.premultiply(_q.setFromAxisAngle(_z, a));
      this.armR?.quaternion.premultiply(_q.setFromAxisAngle(_z, -a));
    }
  }
}

const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _up = new THREE.Vector3();
const _t = new THREE.Vector3();
const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

interface Car { group: THREE.Group; body: THREE.Object3D; riders: Rider[]; vel: THREE.Vector3; spin: THREE.Vector3 }

/** Draws every mesh of a model with one material (the kits' shared colour map, Lambert-lit). */
export function setMaterial(obj: THREE.Object3D, mat: THREE.Material): void {
  obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat; });
}

export class TrainView {
  readonly root = new THREE.Group();
  readonly cars: Car[] = [];
  style: Style;
  private paintMat: THREE.Material | null;
  private tumbling = false;
  /** World positions of each car's middle (the view's effects and the camera use them). */
  readonly centres: THREE.Vector3[] = [];

  constructor(style: Style, count: number, riders: number, roster: string[], paint: THREE.Material | null, private safety: boolean, private riderMat: THREE.Material | null = null) {
    this.style = style;
    this.paintMat = paint;
    this.build(style, count, riders, roster);
  }

  build(style: Style, count: number, riders: number, roster: string[]): void {
    for (const c of this.cars) this.root.remove(c.group);
    this.cars.length = 0;
    this.centres.length = 0;
    this.style = style;
    const info = STYLES[style];
    let seat = 0;
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const name = i === 0 ? (this.safety && !info.hang && style !== 'flume' && style !== 'monorail' ? 'coaster-train-safety' : info.front) : info.car;
      const body = model(ckKey(name), { shadows: true });
      if (this.paintMat) body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = this.paintMat!; });
      body.position.x = info.shiftX;
      group.add(body);
      const rs: Rider[] = [];
      for (const [x, y, z] of info.seats) {
        if (seat >= riders) break;
        const key = seat === 0 ? playerCharacter3d() : riderKey(roster[seat % roster.length]);
        const r = new Rider(key, info.riderScale, this.riderMat);
        r.root.position.set(x + info.shiftX, y, z);
        r.seatY = y;
        r.root.rotation.y = Math.PI;
        group.add(r.root);
        rs.push(r);
        seat++;
      }
      this.cars.push({ group, body, riders: rs, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
      this.centres.push(new THREE.Vector3());
      this.root.add(group);
    }
    this.tumbling = false;
  }

  /** Swaps the front car for the safety car (or back). */
  setSafety(on: boolean): void {
    if (on === this.safety) return;
    this.safety = on;
    const info = STYLES[this.style];
    if (info.hang || this.style === 'flume' || this.style === 'monorail' || !this.cars[0]) return;
    const c = this.cars[0];
    c.group.remove(c.body);
    c.body = model(ckKey(on ? 'coaster-train-safety' : info.front), { shadows: true });
    if (this.paintMat) c.body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = this.paintMat!; });
    c.group.add(c.body);
  }

  /** Puts car `i` on the track frame `f`, leaning `lean` radians round the track (outwards +). */
  place(i: number, f: Sample, lean: number): void {
    const c = this.cars[i];
    if (!c || this.tumbling) return;
    const info = STYLES[this.style];
    _t.set(f.tx, f.ty, f.tz);
    _up.set(f.ux, f.uy, f.uz);
    _lat.crossVectors(_up, _t).normalize();
    _m.makeBasis(_lat, _up, _t);
    c.group.quaternion.setFromRotationMatrix(_m).multiply(_flip);
    if (lean) c.group.quaternion.multiply(_q.setFromAxisAngle(_z, lean));
    _v.set(f.x, f.y, f.z).addScaledVector(_up, info.ride);
    // lean round the outer rail: lift the car's inner side
    if (lean) _v.addScaledVector(_lat, -Math.sin(lean) * 0.3 * Math.sign(lean)).addScaledVector(_up, Math.abs(Math.sin(lean)) * 0.15);
    c.group.position.copy(_v);
    this.centres[i].copy(_v).addScaledVector(_up, info.hang ? -0.4 : 0.3);
  }

  setMood(m: Mood, up = 0): void {
    for (const c of this.cars) for (const r of c.riders) { r.mood = m; r.up = up; }
  }

  /** Riders: each sits in seat order (front first). */
  get riders(): Rider[] { return this.cars.flatMap((c) => c.riders); }

  update(dt: number): void {
    for (const c of this.cars) for (const r of c.riders) r.update(dt);
    if (this.tumbling) {
      for (const c of this.cars) {
        c.vel.y -= 14 * dt;
        c.group.position.addScaledVector(c.vel, dt);
        c.group.rotation.x += c.spin.x * dt;
        c.group.rotation.y += c.spin.y * dt;
        c.group.rotation.z += c.spin.z * dt;
        if (c.group.position.y < 0.3) {
          c.group.position.y = 0.3;
          c.vel.multiplyScalar(0.35);
          c.vel.y = Math.abs(c.vel.y) * 0.3;
          c.spin.multiplyScalar(0.5);
        }
      }
    }
  }

  /** The derail: every car flies off along its own heading and outwards, tumbling. */
  derail(speed: number, side: number): void {
    this.tumbling = true;
    this.cars.forEach((c, i) => {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.group.quaternion);
      const lat = new THREE.Vector3(1, 0, 0).applyQuaternion(c.group.quaternion);
      c.vel.copy(fwd).multiplyScalar(Math.max(4, speed * 0.8)).addScaledVector(lat, side * (3 + i * 0.6)).add(new THREE.Vector3(0, 4 + Math.random() * 2, 0));
      c.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5, side * (3 + Math.random() * 3));
      c.group.rotation.setFromQuaternion(c.group.quaternion);
    });
  }

  get derailed(): boolean { return this.tumbling; }
  reset(): void { this.tumbling = false; for (const c of this.cars) { c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); } }
}

export { clamp, RIDERS };
