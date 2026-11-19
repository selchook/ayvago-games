// Astro Crew: the ground's shape and 3D effects, all pooled so a mission never grows the scene:
// soft point sprites (sparks, smoke, embers, muzzle flashes), flat rings on the ground (shock
// waves, portals, pickups), telegraphs (a red disc filling up, a lane for a charge), beams (the Sun
// Lance, chain lightning).
//
// The planet is a big crater with gentle hills (`baseY`), and it curves away round the camera's
// focus like a tiny planet: `groundY` is the height drawn at a point (the bend follows the camera),
// and the static world bends the same way in its vertex shader (`bentMaterial`), tilting tall
// things away towards the horizon.
import { THREE } from '@core/three';
import { WORLD_R } from './defs';

/** The bend's radius (smaller curves faster) and its centre (the camera's focus, moved every frame). */
export const PLANET_R = 130;
export const BEND = { x: 0, z: 0, on: 1 };
const BK = 1 / (2 * PLANET_R);

/** The crater's floor: gentle hills, rising into the rim beyond WORLD_R. */
export function baseY(x: number, z: number): number {
  const hills = 0.42 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09 + 0.4) + 0.22 * Math.sin((x + z) * 0.21 + 2) + 0.12 * Math.sin(x * 0.37 - z * 0.29);
  const r = Math.hypot(x, z);
  // the rim rises into cliffs, but stays a low bank on the side the camera looks from (south)
  const low = z > 0 ? Math.max(0.22, 1 - z / 38) : 1;
  const rim = r > WORLD_R + 1 ? Math.pow((r - WORLD_R - 1) * 0.5, 1.45) * low : 0;
  return hills + rim;
}

/** How far a point drops below its height for the bend. */
export const bendDrop = (x: number, z: number): number => ((x - BEND.x) ** 2 + (z - BEND.z) ** 2) * BK * BEND.on;
/** The ground's drawn height under a point (the hills, bent away round the camera's focus). */
export const groundY = (x: number, z: number): number => baseY(x, z) - bendDrop(x, z);
/** The bend's tilt at a point: rotations about x and z for a thing standing there. */
export function bendTilt(x: number, z: number): { tx: number; tz: number } {
  const k = 2 * BK * BEND.on;
  return { tx: (z - BEND.z) * k, tz: -(x - BEND.x) * k };
}

const bendUniform = { value: new THREE.Vector3(0, 0, BK) };
/** Moves the bend's centre (the shader's and groundY's). */
export function setBend(x: number, z: number, on = 1): void {
  BEND.x = x; BEND.z = z; BEND.on = on;
  bendUniform.value.set(x, z, BK * on);
}

/** The static world's flat-colour Lambert, bent round the camera's focus in its vertex shader. */
export function bentMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = bendUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBend;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '{',
        '  vec2 bd = transformed.xz - uBend.xy;',
        '  float bh = transformed.y;',
        '  transformed.y -= dot(bd, bd) * uBend.z;',
        '  transformed.xz += bd * (bh * 2.0 * uBend.z);',
        '}',
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'astro-bent';
  return m;
}

export function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.65)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A pool of soft point sprites with colour, alpha, velocity and life. */
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

  emit(x: number, y: number, z: number, color: number, count: number, o: { speed?: number; up?: number; spread?: number; life?: number; alpha?: number; flat?: boolean } = {}): void {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const sp = o.spread ?? 0.2;
      this.pos[i * 3] = x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * sp * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      const a = Math.random() * Math.PI * 2, s = (o.speed ?? 1) * (0.35 + Math.random() * 0.65);
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = o.flat ? (o.up ?? 0) * Math.random() : (o.up ?? 1) * (0.5 + Math.random() * 0.7);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = this.max[i] = (o.life ?? 1) * (0.6 + Math.random() * 0.7);
      this.base[i * 4] = c.r; this.base[i * 4 + 1] = c.g; this.base[i * 4 + 2] = c.b; this.base[i * 4 + 3] = o.alpha ?? 1;
    }
    this.live = 2;
  }

  /** One sprite at a point with a velocity (trails). */
  dot(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, alpha = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life;
    const c = tmpC.setHex(color);
    this.base[i * 4] = c.r; this.base[i * 4 + 1] = c.g; this.base[i * 4 + 2] = c.b; this.base[i * 4 + 3] = alpha;
    this.live = 2;
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    let any = false;
    const dr = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.gravity * dt;
      if (this.drag) { this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr; }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, k * 2.2);
    }
    if (!any) this.live--;
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
  }

  clear(): void { this.life.fill(0); this.col.fill(0); this.live = 1; }
}
const tmpC = new THREE.Color();

/** A ring texture (a soft-edged band) for shock waves and portals. */
function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.62, 'rgba(255,255,255,0.15)'); r.addColorStop(0.86, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A telegraph disc: a dim fill and a bright edge. */
function discTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.32)'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A lane for a charge or a dive: dim fill, bright sides, chevrons. */
function laneTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(0, 0, 5, 256); g.fillRect(59, 0, 5, 256);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 5;
  for (let y = 20; y < 256; y += 48) { g.beginPath(); g.moveTo(12, y + 18); g.lineTo(32, y); g.lineTo(52, y + 18); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; max: number; r0: number; r1: number; alpha: number }

/** Flat expanding rings on the ground. */
export class Rings {
  readonly group = new THREE.Group();
  private list: Ring[] = [];
  private next = 0;

  constructor(n: number) {
    const tex = ringTexture();
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.list.push({ mesh, mat, t: 0, max: 1, r0: 0, r1: 1, alpha: 1 });
    }
  }

  add(x: number, z: number, r0: number, r1: number, color: number, time = 0.45, alpha = 1, y = 0.08): void {
    const r = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    r.t = 0; r.max = time; r.r0 = r0; r.r1 = r1; r.alpha = alpha;
    r.mat.color.setHex(color);
    r.mesh.position.set(x, groundY(x, z) + y, z);
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.list) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.max;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(s, 1, s);
      r.mat.opacity = r.alpha * (1 - k);
    }
  }

  clear(): void { for (const r of this.list) r.mesh.visible = false; }
}

interface Tele { disc: THREE.Mesh; lane: THREE.Mesh; mat: THREE.MeshBasicMaterial; lmat: THREE.MeshBasicMaterial; fill: THREE.Mesh; fmat: THREE.MeshBasicMaterial; id: number }

/** Telegraphs, drawn from the simulation's hazards each frame (kept by id). */
export class Teles {
  readonly group = new THREE.Group();
  private pool: Tele[] = [];

  constructor(n: number) {
    const dtex = discTexture(), ltex = laneTexture();
    const disc = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, color: 0xff3a2a });
      const fmat = new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, color: 0xff6a3a, opacity: 0.5 });
      const lmat = new THREE.MeshBasicMaterial({ map: ltex, transparent: true, depthWrite: false, color: 0xff3a2a });
      const d = new THREE.Mesh(disc, mat), f = new THREE.Mesh(disc, fmat), l = new THREE.Mesh(lane, lmat);
      for (const m of [d, f, l]) { m.visible = false; m.frustumCulled = false; this.group.add(m); }
      this.pool.push({ disc: d, fill: f, lane: l, mat, fmat, lmat, id: -1 });
    }
  }

  /** Shows every hazard: a disc for a slam or a meteor, a lane for a charge, dive or lance. */
  sync(list: { id: number; kind: string; x: number; z: number; r: number; ang: number; len: number; w: number; t: number; max: number; hostile: boolean; done: boolean }[], time: number): void {
    let i = 0;
    for (const z of list) {
      if (z.done || z.t < 0 || i >= this.pool.length) continue;
      if (z.kind === 'ring') continue;
      const p = this.pool[i++];
      const k = Math.min(1, z.t / z.max);
      const col = z.hostile ? 0xff3a2a : z.kind === 'meteor' ? 0xffa030 : 0xff7ae0;
      const pulse = 0.7 + Math.sin(time * 22) * 0.3;
      const y = groundY(z.x, z.z) + 0.1;
      if (z.kind === 'slam' || z.kind === 'meteor') {
        p.lane.visible = false;
        p.disc.visible = p.fill.visible = true;
        p.disc.position.set(z.x, y, z.z);
        p.disc.scale.set(z.r, 1, z.r);
        p.mat.color.setHex(col); p.mat.opacity = 0.8 * pulse;
        p.fill.position.set(z.x, y + 0.01, z.z);
        p.fill.scale.set(z.r * k, 1, z.r * k);
        p.fmat.color.setHex(col); p.fmat.opacity = 0.55;
      } else {
        p.disc.visible = p.fill.visible = false;
        p.lane.visible = true;
        p.lane.position.set(z.x, y, z.z);
        p.lane.rotation.y = z.ang;
        p.lane.scale.set(z.w * 2, 1, z.len * (z.kind === 'lance' ? 1 : 0.4 + 0.6 * k));
        p.lmat.color.setHex(col); p.lmat.opacity = 0.85 * pulse;
      }
    }
    for (; i < this.pool.length; i++) { const p = this.pool[i]; p.disc.visible = p.fill.visible = p.lane.visible = false; }
  }
}

/** Short-lived beams: the Sun Lance (a glowing box), chain lightning (jagged lines). */
export class Beams {
  readonly group = new THREE.Group();
  private lance: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number }[] = [];
  private bolts: { line: THREE.Line; mat: THREE.LineBasicMaterial; t: number; geo: THREE.BufferGeometry }[] = [];

  constructor() {
    // a beam that leaves the gun's tip thin and widens as it burns on
    const box = new THREE.CylinderGeometry(1, 0.1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff8ae0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(box, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.lance.push({ mesh, mat, t: 0 });
    }
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x9ae8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.bolts.push({ line, mat, t: 0, geo });
    }
  }

  /** The Sun Lance from (x, y above the ground, z): it starts at the gun's tip. */
  addLance(x: number, z: number, ang: number, len: number, w: number, y = 1): void {
    const l = this.lance.find((o) => !o.mesh.visible) ?? this.lance[0];
    l.t = 0.45;
    l.mesh.visible = true;
    l.mesh.position.set(x, groundY(x, z) + y, z);
    l.mesh.rotation.y = ang;
    l.mesh.scale.set(w * 0.9, 0.55, len);
  }

  addChain(pts: number[]): void {
    const b = this.bolts.find((o) => !o.line.visible) ?? this.bolts[0];
    const arr = b.geo.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    for (let i = 0; i + 3 < pts.length && n < 15; i += 2) {
      const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
      for (let k = 0; k < 4 && n < 15; k++, n++) {
        const t = k / 4;
        const jx = k ? (Math.random() - 0.5) * 0.7 : 0, jz = k ? (Math.random() - 0.5) * 0.7 : 0;
        const x = ax + (bx - ax) * t + jx, z = az + (bz - az) * t + jz;
        arr.setXYZ(n, x, groundY(x, z) + 1.1 + (k ? Math.random() * 0.4 : 0), z);
      }
      arr.setXYZ(n, bx, groundY(bx, bz) + 1.1, bz);
    }
    arr.needsUpdate = true;
    b.geo.setDrawRange(0, n + 1);
    b.t = 0.25;
    b.line.visible = true;
  }

  update(dt: number): void {
    for (const l of this.lance) {
      if (!l.mesh.visible) continue;
      l.t -= dt;
      if (l.t <= 0) { l.mesh.visible = false; continue; }
      l.mat.opacity = Math.min(1, l.t / 0.25);
      l.mesh.scale.y = 0.55 * (0.4 + l.t * 1.4);
    }
    for (const b of this.bolts) {
      if (!b.line.visible) continue;
      b.t -= dt;
      if (b.t <= 0) b.line.visible = false;
      b.mat.opacity = Math.max(0, b.t / 0.25);
    }
  }

  clear(): void { for (const l of this.lance) l.mesh.visible = false; for (const b of this.bolts) b.line.visible = false; }
}
