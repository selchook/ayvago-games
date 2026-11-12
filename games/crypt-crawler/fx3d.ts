// 3D effects, all instanced: chunky particles (dust, shards, sparks, coins' glints), soft glow
// billboards (magic, flames, the dash trail), sword slash arcs and the floor telegraphs.
import { THREE } from '@core/three';
import { Instances, glowMat, softMat, arcGeo, discGeo, ringGeo, sectorGeo, stripGeo, plain } from './kit';
import type { Tele } from './sim';

interface Part {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  r: number; g: number; b: number;
  grav: number;
  glow: boolean;
  spin: number;
  stretch: number;
}

interface Arc { x: number; z: number; ang: number; t: number; max: number; r: number; full: boolean; color: THREE.Color }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Fx {
  private parts: Part[] = [];
  private cubes: Instances;
  private glows: Instances;
  private arcs: Arc[] = [];
  private arcHalf: Instances;
  private arcFull: Instances;
  private teleDisc: Instances;
  private teleRing: Instances;
  private teleCone: Instances;
  private teleStrip: Instances;

  constructor(parent: THREE.Object3D, private camera: THREE.Camera) {
    const cube = plain(new THREE.BoxGeometry(1, 1, 1));
    this.cubes = new Instances(parent, cube, new THREE.MeshLambertMaterial({ color: 0xffffff }), 360, { colors: true });
    this.glows = new Instances(parent, plain(new THREE.PlaneGeometry(1, 1)), softMat(), 360, { colors: true, order: 5 });
    this.arcHalf = new Instances(parent, arcGeo(0.8, 1.15), glowMat(0.9), 8, { colors: true, order: 4 });
    this.arcFull = new Instances(parent, ringGeo(0.82), glowMat(0.9), 4, { colors: true, order: 4 });
    const tm = glowMat(0.55);
    this.teleDisc = new Instances(parent, discGeo(), tm, 24, { colors: true, order: 2 });
    this.teleRing = new Instances(parent, ringGeo(0.9), tm, 24, { colors: true, order: 2 });
    this.teleCone = new Instances(parent, sectorGeo(1.1), tm, 24, { colors: true, order: 2 });
    this.teleStrip = new Instances(parent, stripGeo(), tm, 24, { colors: true, order: 2 });
  }

  get drawCalls(): number { return 8; }

  /** Chunky bits flying out (dust, shards, bone chips). */
  burst(x: number, y: number, z: number, color: number, n: number, speed = 3, o: { up?: number; grav?: number; size?: number; life?: number; glow?: boolean } = {}): void {
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 340) this.parts.shift();
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.parts.push({
        x, y, z, vx: Math.sin(a) * s, vy: (o.up ?? 2.5) * (0.5 + Math.random()), vz: Math.cos(a) * s,
        life, max: life, size: (o.size ?? 0.09) * (0.6 + Math.random() * 0.8),
        r: _c.r * (0.85 + Math.random() * 0.3), g: _c.g * (0.85 + Math.random() * 0.3), b: _c.b * (0.85 + Math.random() * 0.3),
        grav: o.grav ?? 9, glow: !!o.glow, spin: (Math.random() - 0.5) * 12, stretch: 1,
      });
    }
  }

  /** Soft additive puffs (magic, sparks). */
  glow(x: number, y: number, z: number, color: number, n: number, speed = 1.5, size = 0.35, life = 0.5, up = 0.6): void {
    this.burst(x, y, z, color, n, speed, { up, grav: -0.5, size, life, glow: true });
  }

  /** One glow particle with its own motion (trails, embers). */
  mote(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, stretch = 1): void {
    if (this.parts.length > 340) this.parts.shift();
    _c.setHex(color);
    this.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, r: _c.r, g: _c.g, b: _c.b, grav: 0, glow: true, spin: 0, stretch });
  }

  /** A sword slash arc in front of `ang` (or a full ring for the spin). */
  slash(x: number, z: number, ang: number, r: number, full: boolean, color = 0xffd9a0): void {
    this.arcs.push({ x, z, ang, t: 0, max: full ? 0.3 : 0.18, r, full, color: new THREE.Color(color) });
  }

  update(dt: number, teles: { tele: Tele; p: number; color?: number }[]): void {
    this.cubes.begin();
    this.glows.begin();
    const camQ = this.camera.quaternion;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (!p.glow && p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const k = p.life / p.max;
      if (p.glow) {
        const s = p.size * (0.4 + 0.6 * k);
        _m.compose(_v.set(p.x, p.y, p.z), camQ, _s.set(s * p.stretch, s, s));
        this.glows.put(_m, _c.setRGB(p.r * k * 0.6, p.g * k * 0.6, p.b * k * 0.6));
      } else {
        const s = p.size * Math.min(1, k * 2.5);
        _q.setFromEuler(_e.set(p.spin * p.life, p.spin * p.life * 0.7, 0));
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
        this.cubes.put(_m, _c.setRGB(p.r, p.g, p.b));
      }
    }
    this.cubes.end();
    this.glows.end();

    this.arcHalf.begin();
    this.arcFull.begin();
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      if (a.t >= a.max) { this.arcs.splice(i, 1); continue; }
      const u = a.t / a.max;
      const k = 1 - u;
      const s = a.r * (0.85 + 0.25 * u);
      _m.compose(_v.set(a.x, 0.45, a.z), _q.setFromAxisAngle(UP, a.ang + (a.full ? u * 4 : (u - 0.5) * 0.6)), _s.set(s, 1, s));
      (a.full ? this.arcFull : this.arcHalf).put(_m, _c.copy(a.color).multiplyScalar(k * 0.42));
    }
    this.arcHalf.end();
    this.arcFull.end();

    // telegraphs: a dim area that fills up as the attack comes
    this.teleDisc.begin(); this.teleRing.begin(); this.teleCone.begin(); this.teleStrip.begin();
    for (const { tele: t, p, color } of teles) {
      const col = color ?? 0xff3a2a;
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 70);
      _c.setHex(col);
      const dim = _c.clone().multiplyScalar(0.28);
      const fill = _c.clone().multiplyScalar(0.35 + 0.3 * pulse * p);
      const y = 0.03;
      if (t.kind === 'circle') {
        _m.compose(_v.set(t.x, y, t.z), _q.identity(), _s.set(t.r, 1, t.r));
        this.teleDisc.put(_m, dim);
        this.teleRing.put(_m, fill);
        const f = t.r * Math.min(1, p);
        _m.compose(_v.set(t.x, y + 0.005, t.z), _q.identity(), _s.set(f, 1, f));
        this.teleDisc.put(_m, fill);
      } else if (t.kind === 'cone') {
        _q.setFromAxisAngle(UP, t.ang);
        _m.compose(_v.set(t.x, y, t.z), _q, _s.set(t.r, 1, t.r));
        this.teleCone.put(_m, dim);
        const f = t.r * Math.min(1, p);
        _m.compose(_v.set(t.x, y + 0.005, t.z), _q, _s.set(f, 1, f));
        this.teleCone.put(_m, fill);
      } else {
        _q.setFromAxisAngle(UP, t.ang);
        _m.compose(_v.set(t.x, y, t.z), _q, _s.set(t.r * 2, 1, t.len));
        this.teleStrip.put(_m, dim);
        _m.compose(_v.set(t.x, y + 0.005, t.z), _q, _s.set(t.r * 2, 1, t.len * Math.min(1, p)));
        this.teleStrip.put(_m, fill);
      }
    }
    this.teleDisc.end(); this.teleRing.end(); this.teleCone.end(); this.teleStrip.end();
  }

  clear(): void {
    this.parts.length = 0;
    this.arcs.length = 0;
  }
}
