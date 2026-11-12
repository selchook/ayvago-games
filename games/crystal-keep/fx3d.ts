// Crystal Keep: 3D effects drawn as InstancedMeshes (one draw call per kind): smoke and dust
// puffs, sparks, shockwave rings, and the flying projectiles.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { Instances, kitGeo, kitMat } from './kit';
import { METEOR, type Ammo, type Shot, type Meteor } from './sim';

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

export class Fx {
  private puffs: Puff[] = [];
  private sparks: Puff[] = [];
  private rings: { x: number; y: number; z: number; t: number; max: number; r: number; color: THREE.Color }[] = [];
  private puffInst: Instances;
  private sparkInst: Instances;
  private ringInst: Instances;
  private shotInst: Record<Ammo, Instances>;
  private meteorInst: Instances;
  private trailT = 0;
  private markT = 0;

  constructor(scene: Phaser.Scene, parent: THREE.Object3D) {
    this.puffInst = new Instances(parent, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 320, { colors: true });
    this.sparkInst = new Instances(parent, new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 240, { colors: true });
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.ringInst = new Instances(parent, ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 24, { colors: true });
    const mat = kitMat(scene);
    this.shotInst = {
      arrow: new Instances(parent, kitGeo('weapon-ammo-arrow'), mat, 80, { shadows: true }),
      cannonball: new Instances(parent, kitGeo('weapon-ammo-cannonball'), mat, 60, { shadows: true }),
      boulder: new Instances(parent, kitGeo('weapon-ammo-boulder'), mat, 40, { shadows: true }),
      bullet: new Instances(parent, kitGeo('weapon-ammo-bullet'), mat, 120, { shadows: false }),
    };
    const hot = new THREE.MeshLambertMaterial({ map: mat.map, emissive: 0xff5a1a, emissiveIntensity: 0.7 });
    this.meteorInst = new Instances(parent, kitGeo('weapon-ammo-boulder'), hot, 4, { shadows: true });
  }

  /** Where a falling meteor is: it comes in from behind the field at a slant. */
  static meteorPos(m: Meteor, out: THREE.Vector3): THREE.Vector3 {
    const u = 1 - Math.max(0, m.t) / METEOR.fall;
    const k = 1 - u * u;
    return out.set(m.x - 2.2 * k, 0.3 + 8 * k, m.z - 3.2 * k);
  }

  /** Draw calls the effects use when all are visible. */
  get drawCalls(): number { return 7; }

  puff(x: number, y: number, z: number, color: number, n: number, o: { speed?: number; size?: number; up?: number; life?: number; grow?: number; g?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= 320) this.puffs.shift();
      const a = Math.random() * Math.PI * 2, s = (o.speed ?? 1.2) * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? 0.7) * (0.7 + Math.random() * 0.6);
      this.puffs.push({
        x, y, z, vx: Math.cos(a) * s, vy: (o.up ?? 0.8) * (0.5 + Math.random()), vz: Math.sin(a) * s,
        life, max: life, size: (o.size ?? 0.14) * (0.7 + Math.random() * 0.6), grow: o.grow ?? 1.4,
        color: new THREE.Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12), g: o.g ?? 0,
      });
    }
  }

  /** A ring of dust where a tower lands or a heavy foot stomps. */
  dustRing(x: number, y: number, z: number, n = 14, color = 0xf3ead9): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (this.puffs.length >= 320) this.puffs.shift();
      this.puffs.push({
        x: x + Math.cos(a) * 0.35, y, z: z + Math.sin(a) * 0.35, vx: Math.cos(a) * 1.8, vy: 0.7, vz: Math.sin(a) * 1.8,
        life: 0.5, max: 0.5, size: 0.1, grow: 2.2, color: new THREE.Color(color), g: 0,
      });
    }
  }

  spark(x: number, y: number, z: number, color: number, n: number, speed = 3): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= 240) this.sparks.shift();
      const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({
        x, y, z, vx: Math.cos(a) * Math.cos(el) * s, vy: Math.sin(el) * s + 1, vz: Math.sin(a) * Math.cos(el) * s,
        life: 0.45, max: 0.45, size: 0.05 + Math.random() * 0.04, grow: 0, color: new THREE.Color(color), g: 9,
      });
    }
  }

  ring(x: number, y: number, z: number, r: number, color: number, t = 0.45): void {
    if (this.rings.length >= 24) this.rings.shift();
    this.rings.push({ x, y, z, t: 0, max: t, r, color: new THREE.Color(color) });
  }

  /** Explosion: flash ring, fire, smoke and debris. */
  boom(x: number, z: number, r: number, big = false): void {
    this.ring(x, 0.15, z, Math.max(0.5, r), 0xffb347, 0.4);
    this.puff(x, 0.25, z, 0xffa040, big ? 10 : 6, { speed: 1.6, size: 0.12, up: 1.2, life: 0.35, grow: 2 });
    this.puff(x, 0.3, z, 0x8a8a8a, big ? 12 : 7, { speed: 1.1, size: 0.16, up: 1, life: 0.9, grow: 2.2 });
    this.spark(x, 0.3, z, 0xffe08a, big ? 14 : 8, 3.5);
  }

  update(dt: number, shots: Shot[], meteors: Meteor[] = []): void {
    // meteors: a burning boulder with a tail of fire and smoke, and a target ring on the ground
    this.meteorInst.begin();
    this.markT -= dt;
    const mark = this.markT <= 0;
    if (mark) this.markT = 0.12;
    for (const m of meteors) {
      Fx.meteorPos(m, _v);
      const sp = 4;
      _m.compose(_v, _q.setFromEuler(_e.set(m.t * 7, m.t * 4, 0)), _s.set(sp, sp, sp));
      this.meteorInst.put(_m);
      if (this.puffs.length < 300) {
        this.puffs.push({ x: _v.x, y: _v.y, z: _v.z, vx: 0, vy: 0.2, vz: 0, life: 0.35, max: 0.35, size: 0.22, grow: 1.2, color: new THREE.Color(Math.random() < 0.5 ? 0xffa040 : 0xffe08a), g: 0 });
        this.puffs.push({ x: _v.x, y: _v.y + 0.1, z: _v.z, vx: 0, vy: 0.3, vz: 0, life: 0.6, max: 0.6, size: 0.11, grow: 2.2, color: new THREE.Color(0xb8b0a8), g: 0 });
      }
      if (mark) this.ring(m.x, 0.16, m.z, METEOR.radius, 0xff5a2a, 0.35);
    }
    this.meteorInst.end();
    // puffs
    this.puffInst.begin();
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) { this.puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 2.5; p.vz *= 1 - dt * 2.5; p.vy = p.vy * (1 - dt * 2) - p.g * dt;
      const u = p.life / p.max;
      const s = p.size * (1 + (1 - u) * p.grow) * Math.min(1, u * 3);
      _m.compose(_v.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.x * 3, p.z * 3, 0)), _s.set(s, s, s));
      this.puffInst.put(_m, p.color);
    }
    this.puffInst.end();
    // sparks
    this.sparkInst.begin();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0 || p.y < 0) { this.sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= p.g * dt;
      const s = p.size * (p.life / p.max);
      _m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s, s));
      this.sparkInst.put(_m, p.color);
    }
    this.sparkInst.end();
    // rings: grow and fade (additive: fading to black is fading out)
    this.ringInst.begin();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.max) { this.rings.splice(i, 1); continue; }
      const u = r.t / r.max;
      const s = r.r * (0.3 + 0.7 * Math.sqrt(u));
      _m.compose(_v.set(r.x, r.y, r.z), _q.identity(), _s.set(s, s, s));
      this.ringInst.put(_m, _c.copy(r.color).multiplyScalar(1 - u));
    }
    this.ringInst.end();
    // projectiles: arrows and bullets point along their flight, stones tumble and trail smoke
    this.trailT -= dt;
    const trail = this.trailT <= 0;
    if (trail) this.trailT = 0.045;
    for (const k in this.shotInst) this.shotInst[k as Ammo].begin();
    for (const s of shots) {
      if (!s.alive) continue;
      const inst = this.shotInst[s.ammo];
      _v.set(s.x, s.y, s.z);
      if (s.ammo === 'arrow' || s.ammo === 'bullet') {
        const dx = s.tx - s.x, dz = s.tz - s.z;
        _q.setFromEuler(_e.set(0, Math.atan2(dx, dz), 0));
        const k = s.ammo === 'arrow' ? 1.35 : 1.25;
        _m.compose(_v, _q, _s.set(k, k, k));
      } else {
        _q.setFromEuler(_e.set(s.t * 9, s.t * 5, 0));
        const k = s.ammo === 'boulder' ? 1.9 : 1.6;
        _m.compose(_v, _q, _s.set(k, k, k));
        if (trail && this.puffs.length < 300) {
          this.puffs.push({
            x: s.x, y: s.y, z: s.z, vx: 0, vy: 0.15, vz: 0, life: 0.45, max: 0.45, size: s.ammo === 'boulder' ? 0.09 : 0.07, grow: 1.5,
            color: new THREE.Color(s.ammo === 'boulder' ? 0xc8b49a : 0xe6e6e6), g: 0,
          });
        }
      }
      inst.put(_m);
    }
    for (const k in this.shotInst) this.shotInst[k as Ammo].end();
  }
}
