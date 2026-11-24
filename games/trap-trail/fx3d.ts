// Trap Trail: 3D particles. One instanced mesh of small low-poly balls (unlit, coloured per
// instance) serves every effect: dust puffs on landings, sparks off saws, coin glints, the bombs'
// fireballs and smoke, confetti at the goal. Particles shrink to nothing over their life, so no
// transparency (one draw call, no sorting).
import { THREE } from '@core/three';

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; life: number; age: number; grav: number; drag: number; grow: number; r: number; g: number; b: number }

const CAP = 420;

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

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: number, o: { grav?: number; drag?: number; grow?: number } = {}): void {
    if (this.ps.length >= CAP) this.ps.shift();
    this.c.setHex(color);
    this.ps.push({ x, y, z, vx, vy, vz, size, life, age: 0, grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow ?? 0, r: this.c.r, g: this.c.g, b: this.c.b });
  }

  /** Puffs of dust round a point on the ground. */
  dust(x: number, y: number, z: number, n = 8, color = 0xf2e6cc, speed = 2.4): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      this.spawn(x + Math.cos(a) * 0.3, y + 0.08, z + Math.sin(a) * 0.3, Math.cos(a) * speed * (0.6 + Math.random() * 0.6), 0.6 + Math.random(), Math.sin(a) * speed * (0.6 + Math.random() * 0.6), 0.16 + Math.random() * 0.1, 0.45 + Math.random() * 0.25, color, { drag: 3, grow: 0.5 });
    }
  }

  sparks(x: number, y: number, z: number, n: number, colors: number[], speed = 5, up = 3, size = 0.07): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * s, up * (0.3 + Math.random()), Math.sin(a) * s, size * (0.7 + Math.random() * 0.8), 0.35 + Math.random() * 0.35, colors[i % colors.length], { grav: 14, drag: 1 });
    }
  }

  /** A bomb's or a ball's blast: a fireball, sparks and smoke. */
  boom(x: number, y: number, z: number, big = 1): void {
    for (let i = 0; i < 14 * big; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = 3 + Math.random() * 3;
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, 0.35 + Math.random() * 0.3, 0.3 + Math.random() * 0.2, i % 3 ? 0xffa22a : 0xffe36a, { drag: 5, grow: 1.2 });
    }
    for (let i = 0; i < 10 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x + Math.cos(a) * 0.4, y + 0.2, z + Math.sin(a) * 0.4, Math.cos(a) * 1.6, 1.6 + Math.random() * 1.5, Math.sin(a) * 1.6, 0.3 + Math.random() * 0.25, 0.8 + Math.random() * 0.4, i % 2 ? 0x5a5458 : 0x7a7478, { drag: 1.5, grow: 0.8 });
    }
    this.sparks(x, y, z, 12 * big, [0xffe36a, 0xff7a2a, 0xffffff], 7, 5, 0.06);
  }

  /** Glints round a picked-up item. */
  glint(x: number, y: number, z: number, color: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(x, y, z, Math.cos(a) * 3, (Math.random() - 0.3) * 3, Math.sin(a) * 3, 0.07 + Math.random() * 0.05, 0.4, i % 2 ? color : 0xffffff, { drag: 4 });
    }
  }

  confetti(x: number, y: number, z: number, n = 60): void {
    const cols = [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x7ae05a, 0xffffff, 0xb07aff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.spawn(x, y, z, Math.cos(a) * s, 6 + Math.random() * 6, Math.sin(a) * s, 0.09 + Math.random() * 0.06, 1.6 + Math.random(), cols[i % cols.length], { grav: 9, drag: 1.2 });
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
