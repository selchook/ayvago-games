// Dungeon Rescue: 3D effects. One instanced mesh of small low-poly balls (unlit, coloured per
// instance) serves every particle: footstep dust, sparks off the bars, coins popping, glints on
// pick-ups, smoke puffs, sleep bubbles, the crowd's confetti when freed. Particles shrink to nothing
// over their life, so no transparency (one draw call, no sorting). Noise rings (sprint clanks,
// things landing, a decoy, the Chief's slam) are a second instanced mesh, additive, that grows and
// fades on the floor.
import { THREE } from '@core/three';

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; life: number; age: number; grav: number; drag: number; grow: number; r: number; g: number; b: number }

const CAP = 520;
const RINGS = 24;

export class Fx {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  readonly rings: THREE.InstancedMesh;
  private rs: { x: number; z: number; r: number; t: number; life: number; r0: number; g0: number; b0: number }[] = [];

  constructor(scene: THREE.Object3D) {
    const rg = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.rings.setColorAt(0, new THREE.Color(0xffffff));
    this.rings.renderOrder = 3;
    scene.add(this.rings);
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

  /** Embers drifting up from a flame. */
  embers(x: number, y: number, z: number, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.5, 0.03 + Math.random() * 0.03, 0.7 + Math.random() * 0.6, i % 3 ? color : 0xffe08a, { drag: 0.6 });
    }
  }

  /** Rubble and dust where a floor falls in or a brick lands. */
  rubble(x: number, y: number, z: number, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      this.spawn(x + Math.cos(a) * 0.4, y + 0.1, z + Math.sin(a) * 0.4, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 0.08 + Math.random() * 0.08, 0.6 + Math.random() * 0.4, i % 2 ? color : 0x6a6258, { grav: 16, drag: 0.8 });
    }
    this.dust(x, y, z, Math.ceil(n / 2), 0xb8aa96, 2);
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

  /** A noise ring on the floor growing to radius `r`. */
  ring(x: number, z: number, r: number, color: number, life = 0.7): void {
    if (this.rs.length >= RINGS) this.rs.shift();
    this.c.setHex(color);
    this.rs.push({ x, z, r, t: 0, life, r0: this.c.r, g0: this.c.g, b0: this.c.b });
  }

  /** A puff of smoke. */
  smoke(x: number, y: number, z: number, n = 26): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.2;
      this.spawn(x + Math.cos(a) * 0.3, y + Math.random() * 0.8, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.4 + Math.random() * 0.9, Math.sin(a) * s, 0.35 + Math.random() * 0.3, 1.6 + Math.random() * 1.2, i % 3 ? 0xc8ccd8 : 0x9aa0b0, { drag: 1.6, grow: 1.4 });
    }
  }

  /** Small rising bubbles over a sleeper. */
  zz(x: number, y: number, z: number): void {
    this.spawn(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, 0.15, 0.55, 0, 0.06, 1.4, 0xd8e8ff, { drag: 0.2, grow: 1.2 });
  }

  update(dt: number): void {
    const keep: typeof this.rs = [];
    for (const r of this.rs) { r.t += dt; if (r.t < r.life) keep.push(r); }
    this.rs = keep;
    for (let i = 0; i < keep.length; i++) {
      const r = keep[i], k = r.t / r.life, rad = Math.max(0.05, r.r * (0.15 + 0.85 * Math.sqrt(k)));
      this.m.compose(this.v.set(r.x, 0.06, r.z), this.q, this.s.set(rad, 1, rad));
      this.rings.setMatrixAt(i, this.m);
      const f = (1 - k) * 0.85;
      this.rings.setColorAt(i, this.c.setRGB(r.r0 * f, r.g0 * f, r.b0 * f));
    }
    this.rings.count = keep.length;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
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

  clear(): void { this.ps = []; this.mesh.count = 0; this.rs = []; this.rings.count = 0; }
}
