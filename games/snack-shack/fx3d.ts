// Snack Shack: 3D effects as InstancedMeshes (one draw call per kind): steam and smoke puffs,
// grease sizzle specks, sparkles and ring pulses.
import { THREE } from '@core/three';
import { Instances } from './kit';

interface Puff {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  color: THREE.Color;
  g: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const MAX_PUFFS = 220;
const MAX_SPARKS = 160;

export class Fx {
  private puffs: Puff[] = [];
  private sparks: Puff[] = [];
  private rings: { x: number; y: number; z: number; t: number; max: number; r: number; color: THREE.Color }[] = [];
  private puffInst: Instances;
  private sparkInst: Instances;
  private ringInst: Instances;

  constructor(parent: THREE.Object3D, private rand: () => number = Math.random) {
    this.puffInst = new Instances(parent, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.85 }), MAX_PUFFS, { colors: true });
    this.sparkInst = new Instances(parent, new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SPARKS, { colors: true });
    const ringGeo = new THREE.RingGeometry(0.8, 1, 36).rotateX(-Math.PI / 2);
    this.ringInst = new Instances(parent, ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 16, { colors: true });
  }

  /** Steam, smoke or dust rising from a point. */
  puff(x: number, y: number, z: number, color: number, n: number, o: { speed?: number; size?: number; up?: number; life?: number; grow?: number; g?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
      const a = this.rand() * Math.PI * 2, s = (o.speed ?? 0.4) * (0.4 + this.rand() * 0.8);
      const life = (o.life ?? 0.9) * (0.7 + this.rand() * 0.6);
      this.puffs.push({
        x: x + Math.cos(a) * 0.05, y, z: z + Math.sin(a) * 0.05, vx: Math.cos(a) * s, vy: (o.up ?? 0.9) * (0.5 + this.rand()), vz: Math.sin(a) * s,
        life, max: life, size: (o.size ?? 0.06) * (0.7 + this.rand() * 0.6), grow: o.grow ?? 1.8,
        color: new THREE.Color(color).offsetHSL(0, 0, (this.rand() - 0.5) * 0.1), g: o.g ?? 0,
      });
    }
  }

  /** Little bright specks that jump and fall (sizzle, sparkles). */
  spark(x: number, y: number, z: number, color: number, n: number, speed = 1.6, up = 2.2): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
      const a = this.rand() * Math.PI * 2, s = speed * (0.3 + this.rand() * 0.8);
      const life = 0.35 + this.rand() * 0.35;
      this.sparks.push({
        x, y, z, vx: Math.cos(a) * s, vy: up * (0.4 + this.rand() * 0.8), vz: Math.sin(a) * s,
        life, max: life, size: 0.025 + this.rand() * 0.02, grow: 0, color: new THREE.Color(color), g: 7,
      });
    }
  }

  /** A flat ring that spreads out on a surface. */
  ring(x: number, y: number, z: number, color: number, r = 0.5, t = 0.45): void {
    if (this.rings.length >= 16) this.rings.shift();
    this.rings.push({ x, y, z, t: 0, max: t, r, color: new THREE.Color(color) });
  }

  update(dt: number): void {
    const step = (list: Puff[], inst: Instances, spin: boolean) => {
      inst.begin();
      for (const p of list) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        if (p.g === 0) p.vy *= 1 - dt * 0.8;
        const k = p.life / p.max;
        const size = p.grow ? p.size * (1 + (1 - k) * p.grow) * Math.min(1, k * 3) : p.size * Math.min(1, k * 2.5);
        _q.setFromEuler(_e.set(spin ? p.life * 3 : 0, p.life * 2, 0));
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(size, size, size));
        inst.put(_m, p.color);
      }
      inst.end();
    };
    this.puffs = this.puffs.filter((p) => p.life > 0);
    this.sparks = this.sparks.filter((p) => p.life > 0);
    step(this.puffs, this.puffInst, true);
    step(this.sparks, this.sparkInst, false);
    this.ringInst.begin();
    for (const r of this.rings) {
      r.t += dt;
      const u = r.t / r.max;
      if (u >= 1) continue;
      const s = r.r * (0.3 + u * 0.9);
      _m.compose(_v.set(r.x, r.y, r.z), _q.identity(), _s.set(s, 1, s));
      this.ringInst.put(_m, _c.copy(r.color).multiplyScalar(1 - u));
    }
    this.rings = this.rings.filter((r) => r.t < r.max);
    this.ringInst.end();
  }
}
