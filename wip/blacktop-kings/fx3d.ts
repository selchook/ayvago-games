// 3D particles as two InstancedMeshes of camera-facing quads (one draw call each): an additive
// pool for flames, sparks and glints, and a normal pool for dust and confetti.
import { THREE } from '@core/three';
import { glowCanvas } from './kit';

interface Part { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; c0: THREE.Color; c1: THREE.Color; g: number; drag: number }

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private parts: Part[] = [];
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(parent: THREE.Object3D, readonly max: number, private additive: boolean, map: THREE.Texture) {
    const mat = new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, vertexColors: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    parent.add(this.mesh);
  }

  add(o: Partial<Part> & { x: number; y: number; z: number }): void {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({
      vx: 0, vy: 0, vz: 0, life: 0, max: 0.6, size: 0.3, grow: 0, g: 0, drag: 0,
      c0: new THREE.Color(0xffffff), c1: new THREE.Color(0xffffff), ...o,
    } as Part);
  }

  update(dt: number, cam: THREE.Camera): void {
    let n = 0;
    const q = cam.quaternion;
    this.parts = this.parts.filter((p) => (p.life += dt) < p.max);
    for (const p of this.parts) {
      p.vy -= p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03 && p.g > 0) { p.y = 0.03; p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const u = p.life / p.max;
      const size = Math.max(0.001, p.size * (1 + p.grow * u) * (this.additive ? 1 - u * 0.4 : 1 - u * u));
      this.s.set(size, size, size);
      this.p.set(p.x, p.y, p.z);
      this.m.compose(this.p, q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.c.copy(p.c0).lerp(p.c1, u);
      if (this.additive) this.c.multiplyScalar(1 - u * u);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const FIRE = [0xfff2a0, 0xffb02e, 0xff6a1a];

export class Fx {
  private glow: Pool;
  private soft: Pool;
  private rnd = Math.random;

  constructor(parent: THREE.Object3D) {
    const t = new THREE.CanvasTexture(glowCanvas());
    t.colorSpace = THREE.SRGBColorSpace;
    this.glow = new Pool(parent, 260, true, t);
    this.soft = new Pool(parent, 160, false, t);
  }

  /** Flames licking off something on fire (call every frame). */
  flame(x: number, y: number, z: number, k = 1): void {
    const r = this.rnd;
    for (let i = 0; i < 3; i++) {
      this.glow.add({
        x: x + (r() - 0.5) * 0.16, y: y + (r() - 0.5) * 0.12, z: z + (r() - 0.5) * 0.16,
        vx: (r() - 0.5) * 0.5, vy: 1.4 + r() * 1.4, vz: (r() - 0.5) * 0.5,
        max: 0.4 + r() * 0.3, size: (0.5 + r() * 0.35) * k, grow: -0.6,
        c0: new THREE.Color(FIRE[Math.floor(r() * 3)]), c1: new THREE.Color(0xd02008),
      });
    }
  }

  /** A burst of sparks (dunks, blocks, swishes). */
  burst(x: number, y: number, z: number, colors: number[], n: number, speed: number, up = 1): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, e = (r() - 0.2) * Math.PI * 0.6;
      const s = speed * (0.4 + r() * 0.6);
      this.glow.add({
        x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s * up + 1, vz: Math.sin(a) * Math.cos(e) * s,
        max: 0.4 + r() * 0.4, size: 0.12 + r() * 0.14, g: 7, drag: 1.5,
        c0: new THREE.Color(colors[Math.floor(r() * colors.length)]), c1: new THREE.Color(0xffffff),
      });
    }
  }

  /** Confetti raining down (a win). */
  confetti(x: number, z: number, n: number): void {
    const r = this.rnd;
    const cols = [0xffd23f, 0xff4f7a, 0x3ee6ff, 0x5dff7a, 0xffffff];
    for (let i = 0; i < n; i++) {
      this.soft.add({
        x: x + (r() - 0.5) * 8, y: 4 + r() * 3, z: z + (r() - 0.5) * 6, vx: (r() - 0.5) * 1.5, vy: -0.5 - r(), vz: (r() - 0.5) * 1.5,
        max: 2 + r() * 1.5, size: 0.12 + r() * 0.08, g: 0.6, drag: 0.4,
        c0: new THREE.Color(cols[Math.floor(r() * cols.length)]), c1: new THREE.Color(cols[Math.floor(r() * cols.length)]),
      });
    }
  }

  /** A puff of dust at the feet (landings, stumbles). */
  dust(x: number, z: number, n: number): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      this.soft.add({
        x: x + Math.cos(a) * 0.2, y: 0.1, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * (0.6 + r()), vy: 0.3 + r() * 0.4, vz: Math.sin(a) * (0.6 + r()),
        max: 0.45 + r() * 0.3, size: 0.35 + r() * 0.25, grow: 1.2, drag: 2.5,
        c0: new THREE.Color(0xb8b2a6), c1: new THREE.Color(0x77736b),
      });
    }
  }

  update(dt: number, cam: THREE.Camera): void {
    this.glow.update(dt, cam);
    this.soft.update(dt, cam);
  }
}
