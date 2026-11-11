// 3D effects in a few draw calls: every particle kind is one InstancedMesh (spray drops, gun
// smoke, flames, wooden debris, gold sparkles), plus small pools of rings (red landing warnings,
// white splash rings) and splash columns.
import { THREE } from '@core/three';

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  /** Size multiplier at the end of life (smoke grows, sparks shrink). */
  grow: number;
  grav: number;
  drag: number;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  color: THREE.Color;
  /** Bits that reach the sea float there for a moment (debris). */
  floats: boolean;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, private cap: number, shadows = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.userData.ownMaterial = true;
    this.mesh.userData.ownGeometry = true;
    scene.add(this.mesh);
  }

  add(p: THREE.Vector3, v: THREE.Vector3, o: { life: number; size: number; grow?: number; grav?: number; drag?: number; color: number | THREE.Color; spin?: number; floats?: boolean }): void {
    if (this.bits.length >= this.cap) this.bits.shift();
    const sp = o.spin ?? 0;
    this.bits.push({
      p: p.clone(), v: v.clone(), life: o.life, max: o.life, size: o.size, grow: o.grow ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp),
      color: o.color instanceof THREE.Color ? o.color.clone() : new THREE.Color(o.color), floats: !!o.floats,
    });
  }

  update(dt: number, sea: (x: number, z: number) => number): void {
    let n = 0;
    this.bits = this.bits.filter((b) => (b.life -= dt) > 0);
    for (const b of this.bits) {
      b.v.y -= b.grav * dt;
      if (b.drag) b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
      b.p.addScaledVector(b.v, dt);
      if (b.floats) {
        const y = sea(b.p.x, b.p.z);
        if (b.p.y < y) {
          // bob on the surface, then slowly go under
          b.p.y = y - Math.max(0, 0.5 - b.life / b.max) * 1.2;
          b.v.set(b.v.x * 0.9, 0, b.v.z * 0.9);
          b.spin.multiplyScalar(0.9);
        }
      }
      b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
      const k = 1 - b.life / b.max;
      let sz = b.size * (1 + (b.grow - 1) * k);
      if (b.life < 0.25) sz *= b.life / 0.25;
      this.q.setFromEuler(b.rot);
      this.m.compose(b.p, this.q, this.s.set(sz, sz, sz));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, b.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.bits = [];
    this.mesh.count = 0;
  }
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  from: number;
  to: number;
  alpha: number;
  pulse: boolean;
  x: number;
  z: number;
}

interface Column {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  h: number;
  x: number;
  z: number;
}

const SMOKE = [0xd9d9d9, 0xbfbfbf, 0xa8a8a8];
const FIRE = [0xffd23f, 0xff9a2a, 0xff5a1f];
const WOOD = [0x8a5a35, 0xa86f42, 0x6b4428, 0xc79a62];

export class Fx {
  private drops: Pool;
  private smoke: Pool;
  private fire: Pool;
  private debris: Pool;
  private sparks: Pool;
  private rings: Ring[] = [];
  private freeRings: THREE.Mesh[] = [];
  private cols: Column[] = [];
  private freeCols: THREE.Mesh[] = [];
  private ringGeo = new THREE.RingGeometry(0.82, 1, 32);
  private colGeo = new THREE.CylinderGeometry(0.25, 0.9, 1, 8, 1, true);
  private colMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.85, depthWrite: false });
  private v = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private sea: (x: number, z: number) => number) {
    this.drops = new Pool(scene, new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 420);
    this.smoke = new Pool(scene, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x2a2a2a }), 260);
    this.fire = new Pool(scene, new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 200);
    this.debris = new Pool(scene, new THREE.BoxGeometry(1, 0.22, 0.34), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 220, true);
    this.sparks = new Pool(scene, new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160);
    this.colGeo.translate(0, 0.5, 0);
  }

  // ---------------------------------------------------------------- effects

  /** A cannon shot: flash, a puff of smoke drifting off the side. */
  muzzle(at: THREE.Vector3, dir: THREE.Vector3): void {
    for (let i = 0; i < 5; i++) {
      this.fire.add(at, this.v.copy(dir).multiplyScalar(4 + Math.random() * 5).add(new THREE.Vector3(0, Math.random() * 1.5, 0)), { life: 0.22, size: 0.9 + Math.random() * 0.5, grow: 0.3, color: FIRE[i % 3] });
    }
    for (let i = 0; i < 4; i++) {
      this.smoke.add(at, this.v.copy(dir).multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5), 0.8 + Math.random(), (Math.random() - 0.5))), { life: 1.2 + Math.random() * 0.5, size: 0.6, grow: 2.1, drag: 1.4, color: SMOKE[i % 3], spin: 1 });
    }
  }

  /** A ball into the sea: a column, droplets and a ring. */
  splash(x: number, z: number, big = 1): void {
    const y = this.sea(x, z);
    const p = new THREE.Vector3(x, y, z);
    for (let i = 0; i < 14 * big; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 2.6;
      this.drops.add(p, this.v.set(Math.cos(a) * s, 6 + Math.random() * 7 * big, Math.sin(a) * s), { life: 1, size: 0.8 + Math.random() * 0.8, grav: 24, color: i % 3 ? 0xffffff : 0xbfeaff });
    }
    this.column(x, z, 3.6 * big);
    this.ring(x, z, 0xffffff, 0.4, 3.2 * big, 0.75, 0.8, false);
  }

  /** A hit on a hull: splinters, fire and smoke. */
  hit(at: THREE.Vector3, big = 1): void {
    for (let i = 0; i < 9 * big; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.debris.add(at, this.v.set(Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s), { life: 2.2, size: 0.5 + Math.random() * 0.6, grav: 22, color: WOOD[i % 4], spin: 14, floats: true });
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fire.add(at, this.v.set(Math.cos(a) * 3, 2 + Math.random() * 3, Math.sin(a) * 3), { life: 0.35, size: 1 + Math.random() * 0.6, grow: 0.4, drag: 2, color: FIRE[i % 3] });
    }
    for (let i = 0; i < 4; i++) {
      this.smoke.add(at, this.v.set((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2), { life: 1.6, size: 0.9, grow: 2.4, drag: 1, color: i % 2 ? 0x6b6b6b : 0x8f8f8f, spin: 1 });
    }
  }

  /** Smoke and flames rising from a damaged or sinking ship. */
  burn(at: THREE.Vector3, heavy: boolean): void {
    this.smoke.add(at, this.v.set((Math.random() - 0.5) * 0.8, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8), { life: 1.5, size: heavy ? 0.8 : 0.55, grow: 2.2, drag: 0.4, color: heavy ? 0x4a4a4a : 0x7a7a7a, spin: 1 });
    if (heavy || Math.random() < 0.4) this.fire.add(at, this.v.set((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), { life: 0.45, size: 0.8, grow: 0.4, color: FIRE[Math.floor(Math.random() * 3)] });
  }

  /** A ship goes down: a big burst of wood, fire, smoke and spray. */
  wreck(at: THREE.Vector3, size: number): void {
    this.hit(at.clone().add(new THREE.Vector3(0, 1, 0)), 2.2);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * size;
      this.smoke.add(new THREE.Vector3(at.x + Math.cos(a) * s, at.y + 1, at.z + Math.sin(a) * s), this.v.set(0, 2 + Math.random() * 2.5, 0), { life: 1.8, size: 0.9, grow: 2.2, drag: 0.6, color: SMOKE[i % 3], spin: 1 });
    }
    this.splash(at.x, at.z, 1.8);
    this.ring(at.x, at.z, 0xffffff, 1, size * 1.6, 1.4, 0.7, false);
  }

  /** Bubbles over a ship that is going under. */
  bubbles(x: number, z: number, r: number): void {
    const y = this.sea(x, z);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r;
      this.drops.add(new THREE.Vector3(x + Math.cos(a) * s, y, z + Math.sin(a) * s), this.v.set(0, 2 + Math.random() * 3, 0), { life: 0.5, size: 1.2, grav: 8, color: 0xe8f8ff });
    }
  }

  /** Gold glitter (pickups, coins). */
  sparkle(at: THREE.Vector3, color = 0xffd23f, n = 16): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.sparks.add(at, this.v.set(Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s), { life: 0.8 + Math.random() * 0.4, size: 0.8, grow: 0.3, grav: 9, drag: 1, color: i % 3 ? color : 0xffffff, spin: 10 });
    }
  }

  /** Spray thrown off the bow, scaled by speed. */
  spray(at: THREE.Vector3, side: THREE.Vector3, k: number): void {
    const s = (Math.random() < 0.5 ? 1 : -1);
    this.drops.add(at, this.v.copy(side).multiplyScalar(s * (2 + Math.random() * 2.5 * k)).add(new THREE.Vector3(0, 2 + Math.random() * 2.5 * k, 0)), { life: 0.6, size: 0.6 + Math.random() * 0.5, grav: 18, color: 0xffffff });
  }

  /** Heal sparkles rising (repair in the cove). */
  heal(at: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.add(new THREE.Vector3(at.x + Math.cos(a) * 2.5, at.y + 1 + Math.random() * 2, at.z + Math.sin(a) * 2.5), this.v.set(0, 3 + Math.random() * 2, 0), { life: 0.9, size: 0.6, grow: 0.4, color: i % 2 ? 0x7dff9a : 0xffffff, spin: 8 });
    }
  }

  // ---------------------------------------------------------------- rings and columns

  /**
   * A flat ring on the sea. `from`/`to`: radius at the start and end; `pulse` blinks it (the red
   * warning under an incoming ball).
   */
  ring(x: number, z: number, color: number, from: number, to: number, life: number, alpha = 0.85, pulse = false): void {
    const mesh = this.freeRings.pop() ?? (() => {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.userData.ownMaterial = true;
      m.renderOrder = 2;
      return m;
    })();
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    mesh.visible = true;
    this.scene.add(mesh);
    this.rings.push({ mesh, life, max: life, from, to, alpha, pulse, x, z });
  }

  private column(x: number, z: number, h: number): void {
    const mesh = this.freeCols.pop() ?? new THREE.Mesh(this.colGeo, this.colMat);
    mesh.userData.ownGeometry = true;
    mesh.visible = true;
    this.scene.add(mesh);
    this.cols.push({ mesh, life: 0.7, max: 0.7, h, x, z });
  }

  update(dt: number): void {
    const sea = this.sea;
    this.drops.update(dt, sea);
    this.smoke.update(dt, sea);
    this.fire.update(dt, sea);
    this.debris.update(dt, sea);
    this.sparks.update(dt, sea);
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        this.freeRings.push(r.mesh);
        return false;
      }
      const k = 1 - r.life / r.max;
      const s = r.from + (r.to - r.from) * (r.pulse ? k * k : Math.sqrt(k));
      r.mesh.scale.setScalar(Math.max(0.05, s));
      r.mesh.position.set(r.x, sea(r.x, r.z) + 0.35, r.z);
      const m = r.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = r.pulse ? r.alpha * (0.55 + 0.45 * Math.abs(Math.sin(k * 14))) : r.alpha * (1 - k);
      return true;
    });
    this.cols = this.cols.filter((c) => {
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.freeCols.push(c.mesh);
        return false;
      }
      const k = 1 - c.life / c.max;
      const up = Math.sin(Math.min(1, k * 1.25) * Math.PI);
      c.mesh.scale.set(1 + k * 0.8, Math.max(0.01, c.h * up), 1 + k * 0.8);
      c.mesh.position.set(c.x, sea(c.x, c.z) - 0.2, c.z);
      return true;
    });
  }

  /** Frees the shared ring and column pieces (the pools are freed with the scene). */
  dispose(): void {
    this.clear();
    this.ringGeo.dispose();
    this.colGeo.dispose();
    this.colMat.dispose();
    for (const m of this.freeRings) (m.material as THREE.Material).dispose();
    this.freeRings = [];
  }

  clear(): void {
    for (const p of [this.drops, this.smoke, this.fire, this.debris, this.sparks]) p.clear();
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      this.freeRings.push(r.mesh);
    }
    for (const c of this.cols) this.scene.remove(c.mesh);
    this.rings = [];
    this.cols = [];
  }
}
