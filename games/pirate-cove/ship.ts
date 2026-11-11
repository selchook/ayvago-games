// A ship on the sea: the Kenney Pirate Kit model in a root (position and heading) and a tilt
// group (bob, pitch, roll and heel), furling sails, flags in the wind, a white flash when hit, a
// foam wake behind it and a sinking animation. The bow is +z; heading 0 sails towards +z.
import { THREE, model, grounded } from '@core/three';

/** Forward vector for a heading. */
export const fwd = (h: number, out = new THREE.Vector3()): THREE.Vector3 => out.set(Math.sin(h), 0, Math.cos(h));
/** Starboard (right-hand) vector for a heading. */
export const starboard = (h: number, out = new THREE.Vector3()): THREE.Vector3 => out.set(-Math.cos(h), 0, Math.sin(h));

interface Sail {
  mesh: THREE.Object3D;
  y0: number;
  top: number;
}

const WAKE_N = 34;

/** A foam ribbon on the water behind a ship: a V of foam that widens and fades, faint in the middle. */
export class Wake {
  readonly mesh: THREE.Mesh;
  private pts: { x: number; z: number; sx: number; sz: number; age: number; k: number }[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private t = 0;

  constructor(scene: THREE.Scene, private width: number) {
    this.pos = new Float32Array(WAKE_N * 4 * 3);
    this.col = new Float32Array(WAKE_N * 4 * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < WAKE_N - 1; i++) {
      const a = i * 4, b = a + 4;
      // two foam bands (outer to inner edge on each side); the water between stays clear
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.ownMaterial = true;
    this.mesh.userData.ownGeometry = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Call every frame with the stern position, the heading and how strong the wake is (0..1). */
  update(dt: number, x: number, z: number, h: number, k: number, sea: (x: number, z: number) => number): void {
    this.t += dt;
    // a ship that jumped (brought back into the fight) starts a fresh wake
    const last = this.pts[0];
    if (last && Math.hypot(last.x - x, last.z - z) > 10) this.pts = [];
    for (const p of this.pts) p.age += dt;
    if (this.t > 0.12) {
      this.t = 0;
      const s = starboard(h);
      this.pts.unshift({ x, z, sx: s.x, sz: s.z, age: 0, k });
      if (this.pts.length > WAKE_N) this.pts.pop();
    }
    const n = this.pts.length;
    const life = WAKE_N * 0.12;
    for (let i = 0; i < WAKE_N; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      if (!p) break;
      const w = this.width * (0.5 + p.age * 1.1);
      const y = sea(p.x, p.z) + 0.25;
      const band = Math.min(w * 0.55, this.width * (0.35 + p.age * 0.25));
      const wi = w - band;
      const o = i * 12;
      this.pos.set([
        p.x + p.sx * w, y, p.z + p.sz * w, p.x + p.sx * wi, y, p.z + p.sz * wi,
        p.x - p.sx * wi, y, p.z - p.sz * wi, p.x - p.sx * w, y, p.z - p.sz * w,
      ], o);
      const a = i >= n ? 0 : Math.max(0, 1 - p.age / life) * 0.6 * p.k * Math.min(1, i / 2);
      const c = i * 16;
      this.col.set([1, 1, 1, a * 0.5, 1, 1, 1, a, 1, 1, 1, a, 1, 1, 1, a * 0.5], c);
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

export class Ship {
  readonly root = new THREE.Group();
  readonly tilt = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly wake: Wake;
  /** Half width and half length of the hull, world units (for hits and collisions). */
  readonly halfW: number;
  readonly halfL: number;
  x = 0;
  z = 0;
  heading = 0;
  speed = 0;
  /** Rudder -1 (port) .. 1 (starboard), eased. */
  rudder = 0;
  hp = 1;
  maxHp = 1;
  sinking = -1;
  private sails: Sail[] = [];
  private flags: THREE.Object3D[] = [];
  private furl = 1;
  private mat: THREE.MeshStandardMaterial;
  private flashT = 0;
  private glow = 0;
  private sinkRoll = 1;
  private bobT = Math.random() * 10;
  /** Water height under the hull this frame. */
  waterY = 0;

  constructor(scene: THREE.Scene, key: string, readonly scale: number, opts: { glow?: number } = {}) {
    const m = model(key);
    // one material per ship, so a hit flash lights only this ship
    let mat: THREE.MeshStandardMaterial | null = null;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mat) {
        mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mesh.userData.ownMaterial = true;
      }
      mesh.material = mat;
      if (/^sail/.test(o.name)) {
        const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute);
        this.sails.push({ mesh: o, y0: o.position.y, top: box.max.y });
      } else if (/^flag/.test(o.name)) this.flags.push(o);
    });
    this.mat = mat!;
    this.glow = opts.glow ?? 0;
    if (this.glow) {
      this.mat.emissive.setHex(0x3dffb0);
      this.mat.emissiveIntensity = this.glow;
    }
    this.body = grounded(m);
    // the waterline sits about a fifth up the hull
    this.body.position.y = -0.85;
    this.tilt.add(this.body);
    this.root.add(this.tilt);
    this.root.scale.setScalar(scale);
    scene.add(this.root);
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    this.halfW = 1.75 * scale;
    this.halfL = size.z * 0.44 * scale;
    this.wake = new Wake(scene, 1.4 * scale);
  }

  /** 0 = sails furled up to the yards, 1 = full sail. */
  setFurl(k: number): void {
    this.furl = k;
  }

  flash(): void {
    this.flashT = 0.16;
  }

  /** True if the world point (x, y, z) is inside the hull box. */
  contains(px: number, py: number, pz: number, pad = 0): boolean {
    const dx = px - this.x, dz = pz - this.z;
    const f = Math.sin(this.heading) * dx + Math.cos(this.heading) * dz;
    const s = -Math.cos(this.heading) * dx + Math.sin(this.heading) * dz;
    return Math.abs(f) < this.halfL + pad && Math.abs(s) < this.halfW + pad && py < this.waterY + 5 * this.scale;
  }

  /** Bow, stern and sides along the hull. */
  point(along: number, side: number, up: number, out = new THREE.Vector3()): THREE.Vector3 {
    const f = fwd(this.heading), s = starboard(this.heading);
    return out.set(this.x + f.x * along + s.x * side, this.waterY + up, this.z + f.z * along + s.z * side);
  }

  /** Lays the ship on the sea and animates sails, flags, flash and sinking. */
  update(dt: number, sea: (x: number, z: number) => number, time: number): void {
    this.bobT += dt;
    const f = fwd(this.heading);
    const y = sea(this.x, this.z);
    const yf = sea(this.x + f.x * this.halfL, this.z + f.z * this.halfL);
    const yb = sea(this.x - f.x * this.halfL, this.z - f.z * this.halfL);
    const s = starboard(this.heading);
    const ys = sea(this.x + s.x * this.halfW * 1.6, this.z + s.z * this.halfW * 1.6);
    const yp = sea(this.x - s.x * this.halfW * 1.6, this.z - s.z * this.halfW * 1.6);
    this.waterY = y;
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.heading;
    // pitch follows the swell along the hull; roll follows it across, plus a heel into the turn
    const pitch = Math.atan2(yb - yf, this.halfL * 2) * 0.9;
    const heel = -this.rudder * Math.min(1, this.speed / 9) * 0.13;
    const roll = Math.atan2(ys - yp, this.halfW * 3.2) * 0.8 + Math.sin(this.bobT * 1.3) * 0.025;
    if (this.sinking < 0) {
      this.tilt.rotation.set(pitch, 0, roll + heel);
    } else {
      // listing, bow down, going under
      this.sinking += dt;
      const k = Math.min(1, this.sinking / 3.2);
      this.tilt.rotation.set(pitch + k * 0.42, 0, roll + this.sinkRoll * k * 0.75);
      this.tilt.position.y = -k * k * 9;
    }
    for (const sl of this.sails) {
      const k = Math.max(0.12, this.furl);
      const cur = sl.mesh.scale.y + (k - sl.mesh.scale.y) * Math.min(1, dt * 4);
      sl.mesh.scale.y = cur;
      sl.mesh.position.y = sl.y0 + (1 - cur) * sl.top;
    }
    for (let i = 0; i < this.flags.length; i++) this.flags[i].rotation.y = Math.sin(time * 6 + i * 1.7) * 0.25;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.mat.emissive.setHex(0xffffff);
      this.mat.emissiveIntensity = Math.max(0, this.flashT / 0.16) * 0.9;
    } else if (this.glow) {
      this.mat.emissive.setHex(0x3dffb0);
      this.mat.emissiveIntensity = this.glow * (0.8 + Math.sin(time * 2.2) * 0.2);
    } else this.mat.emissiveIntensity = 0;
    const stern = this.point(-this.halfL * 0.95, 0, 0);
    this.wake.update(dt, stern.x, stern.z, this.heading, this.sinking >= 0 ? 0 : Math.min(1, this.speed / 8), sea);
  }

  startSinking(): void {
    this.sinking = 0;
    this.sinkRoll = Math.random() < 0.5 ? -1 : 1;
  }

  get gone(): boolean {
    return this.sinking > 4.2;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.mat.dispose();
    this.wake.dispose(scene);
  }
}
