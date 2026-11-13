// Delivery Dash: effects in 3D, all instanced: camera-facing (or flat) quads with canvas textures
// (glows, puffs, sparkles, rain streaks, rings, skid marks, the bay frame) and a particle pool on
// top of them. Adapted from Snow Express's (which came from Kickflip Park's).
import { THREE } from '@core/three';

export function canvasTex(w: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, h = w): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round glow. */
export const glowTex = () => canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  r.addColorStop(0.65, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

/** A puff of smoke: a soft lumpy blob. */
export const puffTex = () => canvasTex(64, (g) => {
  for (const [x, y, rr] of [[32, 34, 22], [22, 30, 14], [42, 28, 14], [30, 22, 12], [40, 40, 12]]) {
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,0.75)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
});

/** A ring (pickup halo, splash). */
export const ringTex = () => canvasTex(128, (g, s) => {
  const c = s / 2;
  const r = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.75, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

/** A four-point sparkle (coins, stars). */
export const sparkTex = () => canvasTex(64, (g, s) => {
  const c = s / 2;
  const r = g.createRadialGradient(c, c, 0, c, c, c);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.beginPath();
  g.moveTo(c, 0); g.quadraticCurveTo(c, c, s, c); g.quadraticCurveTo(c, c, c, s); g.quadraticCurveTo(c, c, 0, c); g.quadraticCurveTo(c, c, c, 0);
  g.fill();
});

/** A rain streak. */
export const streakTex = () => canvasTex(16, (g, w, h) => {
  const r = g.createLinearGradient(0, 0, 0, h);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(1, 'rgba(255,255,255,0.85)');
  g.fillStyle = r;
  g.fillRect(w * 0.35, 0, w * 0.3, h);
}, 64);

/** A skid mark: a dark soft-edged dab. */
export const skidTex = () => canvasTex(32, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(20,20,24,0.55)');
  r.addColorStop(1, 'rgba(20,20,24,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

/** The bay on the road: a rounded frame with corner ticks, bright edges, a faint fill. */
export const bayTex = () => canvasTex(128, (g, s) => {
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.roundRect(10, 10, s - 20, s - 20, 22); g.fill();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 9;
  g.setLineDash([22, 12]);
  g.beginPath(); g.roundRect(10, 10, s - 20, s - 20, 22); g.stroke();
}, 128);

/** A beam of light going up (a vertical gradient). */
export const beamTex = () => canvasTex(32, (g, w, h) => {
  const r = g.createLinearGradient(0, 0, 0, h);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0.8)');
  g.fillStyle = r;
  g.fillRect(0, 0, w, h);
  const x = g.createLinearGradient(0, 0, w, 0);
  x.addColorStop(0, 'rgba(0,0,0,1)'); x.addColorStop(0.5, 'rgba(0,0,0,0)'); x.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = x;
  g.fillRect(0, 0, w, h);
}, 128);

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const zAxis = new THREE.Vector3(0, 0, 1);
const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Many textured quads in one draw call: camera-facing, flat on the ground, or upright (yaw only). */
export class Billboards {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private rq = new THREE.Quaternion();
  private kind: 'face' | 'flat' | 'upright';
  private additive: boolean;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, readonly capacity: number, o: { additive?: boolean; kind?: 'face' | 'flat' | 'upright'; order?: number; fog?: boolean } = {}) {
    this.additive = o.additive !== false;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: o.fog ?? false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.order ?? 10;
    this.mesh.count = 0;
    this.kind = o.kind ?? 'face';
    scene.add(this.mesh);
  }

  begin(cam: THREE.Quaternion): void {
    this.n = 0;
    this.rq.copy(this.kind === 'flat' ? flatQ : cam);
  }

  /** rot: roll in the quad's plane (face/flat), or yaw (upright). */
  add(x: number, y: number, z: number, sx: number, sy: number, rot: number, color: number | THREE.Color, k = 1): void {
    if (this.n >= this.capacity) return;
    if (this.kind === 'upright') tmpQ.setFromAxisAngle(tmpP.set(0, 1, 0), rot);
    else tmpQ.setFromAxisAngle(zAxis, rot).premultiply(this.rq);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, 1));
    this.mesh.setMatrixAt(this.n, tmpM);
    if (typeof color === 'number') tmpC.setHex(color); else tmpC.copy(color);
    if (k !== 1) {
      if (this.additive) tmpC.multiplyScalar(k);
      else { const f = Math.min(1, k * 1.5); tmpM.scale(tmpS.set(f, f, 1)); this.mesh.setMatrixAt(this.n, tmpM); }
    }
    this.mesh.setColorAt(this.n, tmpC);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }
}

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  c: THREE.Color;
  drag: number;
  grav: number;
}

/** A pool of particles drawn on one billboard set. */
export class Particles {
  private pool: P[] = [];
  private live: P[] = [];
  readonly bb: Billboards;
  private rnd = Math.random;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, private cap: number, o: { additive?: boolean; order?: number } = {}) {
    this.bb = new Billboards(scene, tex, cap, o);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, drag = 2, grav = 0): void {
    if (this.live.length >= this.cap) return;
    const p = this.pool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, c: new THREE.Color(), drag: 0, grav: 0 };
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1;
    p.c.setHex(color); p.drag = drag; p.grav = grav;
    this.live.push(p);
  }

  burst(x: number, y: number, z: number, n: number, speed: number, colors: number[], life = 0.6, size = 0.4, o: { up?: number; grav?: number; drag?: number } = {}): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, u = r() * 2 - 1;
      const v = speed * (0.35 + r() * 0.65);
      const h = Math.sqrt(1 - u * u);
      this.emit(x, y, z, Math.cos(a) * h * v, Math.abs(u) * v * 0.7 + (o.up ?? 0), Math.sin(a) * h * v, life * (0.6 + r() * 0.6), size * (0.6 + r() * 0.6), 0, colors[i % colors.length], o.drag ?? 2.5, o.grav ?? 0);
    }
  }

  update(dt: number, cam: THREE.Quaternion): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        live[i] = live[live.length - 1];
        live.pop();
        this.pool.push(p);
        continue;
      }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    const bb = this.bb;
    bb.begin(cam);
    for (const p of live) {
      const k = p.life / p.max;
      const s = p.s1 + (p.s0 - p.s1) * k;
      bb.add(p.x, p.y, p.z, s, s, (p.max - p.life) * 0.8, p.c, Math.min(1, k * 1.6));
    }
    bb.end();
  }

  clear(): void {
    for (const p of this.live) this.pool.push(p);
    this.live.length = 0;
  }
}
