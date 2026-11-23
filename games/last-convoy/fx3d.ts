// Last Convoy: the 3D effects, all pooled so a mission never grows the scene: soft point sprites
// (blood mist, sparks, dust, gas, flare smoke, scent dust), bullet tracers (one line-segment buffer),
// muzzle flashes (additive sprites with a short light pool on the ground), shell casings (instanced
// little brass boxes with gravity and a bounce), flat rings on the ground (telegraphs, hold zones,
// shockwaves), blood decals (the kit's Blood_1..3, fading) and the warm light pools under the street
// lamps and headlights.
import { THREE } from '@core/three';
import { soloGeometry } from './kit';

const tmpC = new THREE.Color();

export function radialTexture(stops: [number, string][], size = 64): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, col] of stops) r.addColorStop(k, col);
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A pool of soft point sprites with colour, alpha, velocity, gravity and life. */
export class Sprites {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private base: Float32Array;
  private next = 0;
  private geo = new THREE.BufferGeometry();
  private live = 0;

  constructor(private n: number, tex: THREE.Texture, size: number, additive: boolean, private gravity = 0, private drag = 0) {
    this.pos = new Float32Array(n * 3).fill(-999);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.base = new Float32Array(n * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, color: number, count: number, o: { speed?: number; up?: number; spread?: number; life?: number; alpha?: number; dir?: [number, number]; cone?: number } = {}): void {
    tmpC.setHex(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const sp = o.spread ?? 0.2;
      this.pos[i * 3] = x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * sp * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      const base = o.dir ? Math.atan2(o.dir[0], o.dir[1]) : 0;
      const a = o.dir ? base + (Math.random() - 0.5) * (o.cone ?? 1) : Math.random() * Math.PI * 2;
      const s = (o.speed ?? 1) * (0.35 + Math.random() * 0.65);
      this.vel[i * 3] = Math.sin(a) * s;
      this.vel[i * 3 + 1] = (o.up ?? 1) * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.cos(a) * s;
      this.life[i] = this.max[i] = (o.life ?? 1) * (0.6 + Math.random() * 0.7);
      this.base[i * 4] = tmpC.r; this.base[i * 4 + 1] = tmpC.g; this.base[i * 4 + 2] = tmpC.b; this.base[i * 4 + 3] = o.alpha ?? 1;
    }
    this.live = 2;
  }

  dot(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, alpha = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life;
    tmpC.setHex(color);
    this.base[i * 4] = tmpC.r; this.base[i * 4 + 1] = tmpC.g; this.base[i * 4 + 2] = tmpC.b; this.base[i * 4 + 3] = alpha;
    this.live = 2;
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    let any = false;
    const dr = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.pos[i * 3 + 1] = -999; continue; }
      any = true;
      this.vel[i * 3 + 1] -= this.gravity * dt;
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.max[i];
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, k * 2.2);
    }
    if (!any) this.live--;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** Bullet tracers: bright streaks from the muzzle that fade in a tenth of a second. */
export class Tracers {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private base: Float32Array;
  private next = 0;
  private geo = new THREE.BufferGeometry();

  constructor(private n = 64) {
    this.pos = new Float32Array(n * 6);
    this.col = new Float32Array(n * 6);
    this.life = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
  }

  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color = 0xffe08a): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x0, y0, z0, x1, y1, z1], i * 6);
    tmpC.setHex(color);
    this.base[i * 3] = tmpC.r; this.base[i * 3 + 1] = tmpC.g; this.base[i * 3 + 2] = tmpC.b;
    this.life[i] = 0.09;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] = Math.max(0, this.life[i] - dt);
      const k = l / 0.09;
      for (let e = 0; e < 2; e++) {
        // the far end fades first: a streak, not a bar
        const f = e === 0 ? k * 0.4 : k;
        this.col[i * 6 + e * 3] = this.base[i * 3] * f; this.col[i * 6 + e * 3 + 1] = this.base[i * 3 + 1] * f; this.col[i * 6 + e * 3 + 2] = this.base[i * 3 + 2] * f;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** Brass shell casings: instanced little boxes thrown from the gun, falling and bouncing. */
export class Casings {
  readonly mesh: THREE.InstancedMesh;
  private p: Float32Array;
  private v: Float32Array;
  private r: Float32Array;
  private life: Float32Array;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3(1, 1, 1);
  private t = new THREE.Vector3();

  constructor(private n = 40) {
    const g = new THREE.BoxGeometry(0.05, 0.05, 0.13);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xe8b84a, emissive: 0x3a2a08 }), n);
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(n * 3).fill(-99);
    this.v = new Float32Array(n * 3);
    this.r = new Float32Array(n * 2);
    this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.m.makeTranslation(0, -99, 0); this.mesh.setMatrixAt(i, this.m); }
  }

  eject(x: number, y: number, z: number, face: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const sx = Math.cos(face), sz = -Math.sin(face);
    this.p.set([x, y, z], i * 3);
    this.v.set([sx * (1.5 + Math.random()) - Math.sin(face) * 0.6, 2.5 + Math.random() * 1.5, sz * (1.5 + Math.random()) - Math.cos(face) * 0.6], i * 3);
    this.r[i * 2] = Math.random() * 6; this.r[i * 2 + 1] = Math.random() * 6;
    this.life[i] = 2.2;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 18 * dt;
      for (let k = 0; k < 3; k++) this.p[i * 3 + k] += this.v[i * 3 + k] * dt;
      if (this.p[i * 3 + 1] < 0.03) { this.p[i * 3 + 1] = 0.03; this.v[i * 3 + 1] *= -0.35; this.v[i * 3] *= 0.6; this.v[i * 3 + 2] *= 0.6; }
      this.r[i * 2] += dt * 14 * Math.hypot(this.v[i * 3], this.v[i * 3 + 2]);
      this.e.set(this.r[i * 2], this.r[i * 2 + 1], 0);
      this.q.setFromEuler(this.e);
      this.t.set(this.p[i * 3], this.life[i] > 0 ? this.p[i * 3 + 1] : -99, this.p[i * 3 + 2]);
      this.m.compose(this.t, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Flat rings and discs on the ground: telegraphs (filling), zones (pulsing), shockwaves (growing). */
export class Rings {
  readonly group = new THREE.Group();
  private pool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; r0: number; r1: number; fill: boolean; alpha: number; follow: (() => { x: number; z: number } | null) | null }[] = [];
  private ring = new THREE.RingGeometry(0.86, 1, 48);
  private disc = new THREE.CircleGeometry(1, 40);

  constructor(n = 28) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(this.ring, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, t: 0, life: 0, r0: 1, r1: 1, fill: false, alpha: 1, follow: null });
    }
  }

  /** A ring growing from r0 to r1 over `life` s (a shockwave), or a disc (`fill`) that holds. */
  add(x: number, z: number, color: number, r0: number, r1: number, life: number, o: { fill?: boolean; alpha?: number; y?: number; follow?: () => { x: number; z: number } | null } = {}): void {
    const p = this.pool.find((q) => q.t >= q.life) ?? this.pool[0];
    p.t = 0; p.life = life; p.r0 = r0; p.r1 = r1; p.fill = !!o.fill; p.alpha = o.alpha ?? 0.9; p.follow = o.follow ?? null;
    p.mesh.geometry = o.fill ? this.disc : this.ring;
    p.mat.color.setHex(color);
    p.mesh.position.set(x, o.y ?? 0.06, z);
    p.mesh.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.t >= p.life) { p.mesh.visible = false; continue; }
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      const r = p.r0 + (p.r1 - p.r0) * (p.fill ? Math.min(1, k * 1.2) : 1 - (1 - k) * (1 - k));
      p.mesh.scale.set(r, r, 1);
      p.mat.opacity = p.alpha * (p.fill ? 0.35 + 0.25 * Math.sin(p.t * 18) : 1 - k);
      if (p.follow) { const f = p.follow(); if (f) p.mesh.position.set(f.x, p.mesh.position.y, f.z); }
    }
  }
}

/** Blood decals on the ground (the kit's three splats), fading after a while. */
export class Decals {
  readonly group = new THREE.Group();
  private pool: { mesh: THREE.Mesh; t: number; mat: THREE.MeshLambertMaterial }[] = [];
  private next = 0;

  constructor(n = 24) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(soloGeometry('props:blood-' + (1 + (i % 3)), undefined, true), mat);
      mesh.visible = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.pool.push({ mesh, t: 99, mat });
    }
  }

  add(x: number, z: number, scale = 0.6): void {
    const d = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    d.t = 0;
    d.mesh.position.set(x, 0.035 + Math.random() * 0.01, z);
    d.mesh.rotation.y = Math.random() * 6.28;
    d.mesh.scale.setScalar(scale * (0.7 + Math.random() * 0.5));
    d.mesh.visible = true;
  }

  clear(): void { for (const d of this.pool) d.mesh.visible = false; }

  update(dt: number): void {
    for (const d of this.pool) {
      if (!d.mesh.visible) continue;
      d.t += dt;
      d.mat.opacity = Math.min(0.85, d.t * 6) * (d.t > 10 ? Math.max(0, 1 - (d.t - 10) / 3) : 1);
      if (d.t > 13) d.mesh.visible = false;
    }
  }
}

/** Warm light pools on the ground (street lamps, headlights): additive textured quads, merged. */
export function lightPools(spots: { x: number; z: number; r: number; color: number }[], tex: THREE.Texture): THREE.Mesh {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  spots.forEach((s, i) => {
    tmpC.setHex(s.color);
    const y = 0.07;
    pos.push(s.x - s.r, y, s.z - s.r, s.x + s.r, y, s.z - s.r, s.x + s.r, y, s.z + s.r, s.x - s.r, y, s.z + s.r);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) col.push(tmpC.r, tmpC.g, tmpC.b);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.renderOrder = 2;
  return mesh;
}
