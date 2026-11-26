// Moon Rover: 3D particles. One instanced mesh of small low-poly balls (unlit, coloured per instance)
// serves every effect: moon dust kicked up by the wheels (it hangs and falls slowly: low gravity),
// landing rings, sparks on bumps and bolt hits, the boost flame, hover-jet puffs, meteor fire trails
// and their blasts, crystal glints and the clear's confetti. Particles shrink to nothing over their
// life, so no transparency (one draw call, no sorting).
import { THREE } from '@core/three';

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; life: number; age: number; grav: number; drag: number; grow: number; r: number; g: number; b: number }

const CAP = 700;
/** Dust falls this slowly (moon gravity, game-tuned for particles). */
const DUST_G = 1.8;

export class Fx {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Object3D) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  get count(): number { return this.ps.length; }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: number, o: { grav?: number; drag?: number; grow?: number } = {}): void {
    if (this.ps.length >= CAP) this.ps.shift();
    this.c.setHex(color);
    this.ps.push({ x, y, z, vx, vy, vz, size, life, age: 0, grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow ?? 0, r: this.c.r, g: this.c.g, b: this.c.b });
  }

  /** A puff of moon dust (it rises, hangs and settles slowly). */
  dust(x: number, y: number, z: number, n: number, color: number, speed = 2, up = 1.6, size = 0.22): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.8);
      this.spawn(x + Math.cos(a) * 0.3, y + 0.15, z + Math.sin(a) * 0.3, Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s, size * (0.7 + Math.random() * 0.6), 0.9 + Math.random() * 0.9, color, { grav: DUST_G, drag: 1.4, grow: 1.2 });
    }
  }

  /** The plume behind a wheel: thrown back and up along (bx, bz). */
  plume(x: number, y: number, z: number, bx: number, bz: number, k: number, color: number): void {
    const s = 1.2 + k * 2.4;
    this.spawn(x, y + 0.15, z, bx * s + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.1 * k, bz * s + (Math.random() - 0.5) * 1.2, 0.1 + Math.random() * 0.1 + k * 0.05, 0.6 + Math.random() * 0.6, color, { grav: DUST_G, drag: 1.8, grow: 1.2 });
  }

  /** A ring of dust spreading flat from a landing or a blast. */
  ring(x: number, y: number, z: number, n: number, color: number, speed = 6, size = 0.3): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const s = speed * (0.5 + Math.random() * 0.4);
      this.spawn(x + Math.cos(a) * 0.8, y + 0.15, z + Math.sin(a) * 0.8, Math.cos(a) * s, 0.3 + Math.random() * 0.9, Math.sin(a) * s, size * (0.5 + Math.random() * 0.5), 0.6 + Math.random() * 0.5, color, { grav: DUST_G, drag: 3, grow: 0.9 });
    }
  }

  sparks(x: number, y: number, z: number, n: number, colors: number[], speed = 5, up = 3, size = 0.08): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * s, up * (0.3 + Math.random()), Math.sin(a) * s, size * (0.7 + Math.random() * 0.8), 0.35 + Math.random() * 0.35, colors[i % colors.length], { grav: 6, drag: 1 });
    }
  }

  /** Fire and smoke: the boost's exhaust, a meteor's trail. */
  flame(x: number, y: number, z: number, vx: number, vy: number, vz: number, n: number, colors: number[], size = 0.22): void {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3, vx + (Math.random() - 0.5) * 1.2, vy + (Math.random() - 0.5) * 1.2, vz + (Math.random() - 0.5) * 1.2, size * (0.7 + Math.random() * 0.6), 0.25 + Math.random() * 0.25, colors[i % colors.length], { drag: 2, grow: 0.6 });
    }
  }

  /** A meteor's blast: fire, rock and a dust ring. */
  blast(x: number, y: number, z: number, big: boolean, rock: number): void {
    const k = big ? 1.4 : 1;
    this.sparks(x, y + 0.5, z, Math.round(26 * k), [0xffe08a, 0xff8a2a, 0xff4a20, 0xffffff], 8 * k, 6 * k, 0.16);
    for (let i = 0; i < 16 * k; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5 * k;
      this.spawn(x, y + 0.3, z, Math.cos(a) * s, 3 + Math.random() * 6 * k, Math.sin(a) * s, 0.14 + Math.random() * 0.16, 1.2 + Math.random() * 0.8, i % 2 ? rock : 0x4a4a52, { grav: 5.2, drag: 0.3 });
    }
    this.ring(x, y, z, Math.round(26 * k), rock, 7 * k, 0.4);
  }

  /** Glints round a picked-up crystal. */
  glint(x: number, y: number, z: number, color: number, n = 12): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(x, y, z, Math.cos(a) * 3.5, 1 + (Math.random() - 0.3) * 3, Math.sin(a) * 3.5, 0.09 + Math.random() * 0.06, 0.5, i % 2 ? color : 0xffffff, { drag: 3.5 });
    }
  }

  confetti(x: number, y: number, z: number, n = 80): void {
    const cols = [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x7ae05a, 0xffffff, 0xb07aff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      this.spawn(x, y, z, Math.cos(a) * s, 6 + Math.random() * 7, Math.sin(a) * s, 0.11 + Math.random() * 0.07, 2.4 + Math.random(), cols[i % cols.length], { grav: 3.2, drag: 0.9 });
    }
  }

  update(dt: number): void {
    const out: P[] = [];
    for (const p of this.ps) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.grav * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      out.push(p);
    }
    this.ps = out;
    const n = Math.min(out.length, CAP);
    for (let i = 0; i < n; i++) {
      const p = out[i];
      const t = p.age / p.life;
      const sc = p.size * (1 + p.grow * t) * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.setRGB(p.r, p.g, p.b));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void { this.ps = []; this.mesh.count = 0; }
}
