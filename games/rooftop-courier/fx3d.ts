// Rooftop Courier: effects in 3D, all instanced: camera-facing quads with canvas textures (dust,
// glows, sparkles, rings, paper scraps) and a particle pool on top of them.
import { THREE } from '@core/three';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
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

/** A puff of dust: a soft lumpy blob. */
export const puffTex = () => canvasTex(64, (g, s) => {
  for (const [x, y, rr] of [[32, 34, 22], [22, 30, 14], [42, 28, 14], [30, 22, 12], [40, 40, 12]]) {
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,0.75)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  void s;
});

/** A ring (landing shock, pickup halo). */
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

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const zAxis = new THREE.Vector3(0, 0, 1);
const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Many textured quads in one draw call: camera-facing, or flat on the ground. */
export class Billboards {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private rq = new THREE.Quaternion();
  private flat: boolean;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, readonly capacity: number, o: { additive?: boolean; flat?: boolean; order?: number; depthTest?: boolean } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true,
      blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.order ?? 10;
    this.mesh.count = 0;
    this.flat = !!o.flat;
    scene.add(this.mesh);
  }

  begin(cam: THREE.Quaternion): void {
    this.n = 0;
    this.rq.copy(this.flat ? flatQ : cam);
  }

  add(x: number, y: number, z: number, sx: number, sy: number, rot: number, color: number | THREE.Color, k = 1): void {
    if (this.n >= this.capacity) return;
    tmpQ.setFromAxisAngle(zAxis, rot).premultiply(this.rq);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, 1));
    this.mesh.setMatrixAt(this.n, tmpM);
    if (typeof color === 'number') tmpC.setHex(color); else tmpC.copy(color);
    if (k !== 1) tmpC.multiplyScalar(k);
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
  stretch: number;
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

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, drag = 2, grav = 0, stretch = 0): void {
    if (this.live.length >= this.cap) return;
    const p = this.pool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, c: new THREE.Color(), drag: 0, grav: 0, stretch: 0 };
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1;
    p.c.setHex(color); p.drag = drag; p.grav = grav; p.stretch = stretch;
    this.live.push(p);
  }

  burst(x: number, y: number, z: number, n: number, speed: number, colors: number[], life = 0.6, size = 0.4, o: { up?: number; grav?: number; stretch?: number; drag?: number } = {}): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, u = r() * 2 - 1;
      const v = speed * (0.35 + r() * 0.65);
      const h = Math.sqrt(1 - u * u);
      this.emit(x, y, z, Math.cos(a) * h * v, Math.abs(u) * v * 0.7 + (o.up ?? 0), Math.sin(a) * h * v, life * (0.6 + r() * 0.6), size * (0.6 + r() * 0.6), 0, colors[i % colors.length], o.drag ?? 2.5, o.grav ?? 0, o.stretch ?? 0);
    }
  }

  update(dt: number, cam: THREE.Quaternion, camPos: THREE.Vector3): void {
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
      if (p.stretch > 0) {
        // stretch along the motion as seen from the camera
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        tmpP.set(p.vx, p.vy, p.vz).applyQuaternion(tmpQ.copy(cam).invert());
        const rot = Math.atan2(-tmpP.x, tmpP.y);
        bb.add(p.x, p.y, p.z, s * 0.35, s + sp * p.stretch, rot, p.c, Math.min(1, k * 1.8));
      } else bb.add(p.x, p.y, p.z, s, s, (p.max - p.life) * 0.8, p.c, Math.min(1, k * 1.6));
    }
    bb.end();
    void camPos;
  }

  clear(): void {
    for (const p of this.live) this.pool.push(p);
    this.live.length = 0;
  }
}

/** A soap bubble: clear in the middle, a bright rim and two glints (the shield). */
export const bubbleTex = () => canvasTex(128, (g, s) => {
  const c = s / 2;
  const r = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5);
  r.addColorStop(0, 'rgba(160,230,255,0.08)');
  r.addColorStop(0.75, 'rgba(160,230,255,0.28)');
  r.addColorStop(0.93, 'rgba(230,250,255,0.95)');
  r.addColorStop(1, 'rgba(230,250,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(c - s * 0.2, c - s * 0.22, s * 0.09, s * 0.045, -0.7, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.arc(c + s * 0.22, c + s * 0.2, s * 0.03, 0, Math.PI * 2); g.fill();
});

/**
 * A ribbon streaming behind a moving point (the express ribbon): a strip through the point's
 * last positions, waving, narrowing and fading towards its tail. One mesh, updated in place.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private t = 0;
  private k = 0;

  constructor(scene: THREE.Object3D, private n = 15, private color = new THREE.Color(0xff3a5a)) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** `on`: the ribbon is out; `p`: where it is tied (it trails behind as `p` moves). */
  update(dt: number, on: boolean, p: THREE.Vector3): void {
    this.t += dt;
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * (on ? 6 : 3));
    if (this.k < 0.01 && !on) { this.mesh.visible = false; this.pts.length = 0; return; }
    const last = this.pts[0];
    if (!last || last.distanceToSquared(p) > 0.04) this.pts.unshift(p.clone());
    else last.copy(p);
    if (this.pts.length > this.n) this.pts.length = this.n;
    const n = this.n, m = this.pts.length;
    for (let i = 0; i < n; i++) {
      const q = this.pts[Math.min(i, m - 1)];
      const f = i / (n - 1);
      // a flat band (seen from the chase camera above and behind), fluttering and twisting
      const wave = Math.sin(this.t * 9 - i * 0.7) * 0.22 * f;
      const lift = Math.sin(this.t * 7 - i * 0.55) * 0.12 * f;
      const tw = Math.sin(this.t * 5 - i * 0.4) * 0.6 * f;
      const w = 0.2 * (1 - f * 0.6) * this.k;
      const cx = Math.cos(tw) * w, cy = Math.sin(tw) * w;
      this.pos.set([q.x + wave - cx, q.y + lift - cy, q.z], i * 6);
      this.pos.set([q.x + wave + cx, q.y + lift + cy, q.z], i * 6 + 3);
      const a = (1 - f) * 0.95 * this.k * (i < m ? 1 : 0);
      const c = this.color;
      const g = 0.75 + 0.25 * Math.sin(i * 1.3);
      this.col.set([c.r * g, c.g * g, c.b * g, a, c.r, c.g * 0.8 + 0.2, c.b, a], i * 8);
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.mesh.visible = m > 1;
  }
}
