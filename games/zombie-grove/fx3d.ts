// Zombie Grove: the effects layer, all instanced so a busy night stays at a few draw calls.
//   - Billboards: camera-facing or flat quads with a canvas-drawn texture, one InstancedMesh each
//     (blob shadows, glows, rings, flares, streaks, the slash arcs, goo, icons).
//   - Particles: sparks, smoke, flames, poofs and embers on one billboard set per blend mode.
import { THREE } from '@core/three';

// ------------------------------------------------------------------ textures

/** Canvases drawn once per page; each world wraps them in its own texture (freed with it). */
const canvases = new Map<string, HTMLCanvasElement>();

/** A canvas texture (freed with the world that uses it). */
export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let cv = canvases.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d')!);
    canvases.set(key, cv);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const radial = (stops: [number, string][]) => (g: CanvasRenderingContext2D) => {
  const s = g.canvas.width;
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [k, c] of stops) r.addColorStop(k, c);
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
};

export const TEX = {
  glow: () => canvasTex('glow', 64, 64, radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']])),
  soft: () => canvasTex('soft', 64, 64, radial([[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']])),
  shadow: () => canvasTex('shadow', 64, 64, radial([[0, 'rgba(0,0,0,0.6)'], [0.55, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']])),
  ring: () => canvasTex('ring', 128, 128, radial([[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.78, 'rgba(255,255,255,1)'], [0.88, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']])),
  /** A filled disc with a bright rim (telegraphs, fire patches). */
  disc: () => canvasTex('disc', 128, 128, radial([[0, 'rgba(255,255,255,0.28)'], [0.8, 'rgba(255,255,255,0.4)'], [0.9, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']])),
  flare: () => canvasTex('flare', 64, 64, (g) => {
    radial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']])(g);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29);
    g.closePath();
    g.fill();
  }),
  /** A streak along y (lasers, thrusts, charge lanes). */
  streak: () => canvasTex('streak', 32, 128, (g) => {
    const lin = g.createLinearGradient(0, 0, 32, 0);
    lin.addColorStop(0, 'rgba(255,255,255,0)'); lin.addColorStop(0.35, 'rgba(255,255,255,0.6)'); lin.addColorStop(0.5, 'rgba(255,255,255,1)');
    lin.addColorStop(0.65, 'rgba(255,255,255,0.6)'); lin.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lin;
    g.fillRect(0, 0, 32, 128);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,1)'); v.addColorStop(0.85, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 32, 128);
  }),
  /** A crescent slash (the blade's arc), bright at the leading edge. */
  slash: () => canvasTex('slash', 128, 128, (g) => {
    const c = 64;
    for (let i = 0; i < 40; i++) {
      const k = i / 39;
      g.beginPath();
      g.arc(c, c, 60 - k * 2, -Math.PI / 2 - 1.3 + k * 0.1, -Math.PI / 2 + 1.3 - k * 0.1);
      g.arc(c, c, 34 + k * 20, -Math.PI / 2 + 1.3 - k * 0.1, -Math.PI / 2 - 1.3 + k * 0.1, true);
      g.closePath();
      g.fillStyle = `rgba(255,255,255,${0.04 + k * 0.05})`;
      g.fill();
    }
  }),
  /** A flame lick: a soft teardrop. */
  flame: () => canvasTex('flame', 64, 64, (g) => {
    const r = g.createRadialGradient(32, 40, 2, 32, 36, 28);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.beginPath();
    g.moveTo(32, 2); g.quadraticCurveTo(58, 36, 32, 62); g.quadraticCurveTo(6, 36, 32, 2);
    g.fill();
  }),
  /** Goo: a dark blob with a bright core. */
  goo: () => canvasTex('goo', 64, 64, (g) => {
    g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fillStyle = 'rgba(20,40,0,0.85)'; g.fill();
    const r = g.createRadialGradient(28, 28, 0, 32, 32, 24);
    r.addColorStop(0, '#f6ffd0'); r.addColorStop(0.5, '#b6ff3a'); r.addColorStop(1, '#4fa010');
    g.beginPath(); g.arc(32, 32, 23, 0, Math.PI * 2); g.fillStyle = r; g.fill();
  }),
  /** A heart (the meal pickup). */
  heart: () => canvasTex('heart', 64, 64, (g) => {
    g.translate(32, 34);
    const heart = () => { g.beginPath(); g.moveTo(0, 18); g.bezierCurveTo(-30, -2, -18, -26, 0, -12); g.bezierCurveTo(18, -26, 30, -2, 0, 18); g.closePath(); };
    g.scale(1.15, 1.15); heart(); g.fillStyle = '#ffffff'; g.fill();
    g.scale(0.82, 0.82); heart(); g.fillStyle = '#ff3b5c'; g.fill();
    g.beginPath(); g.arc(-7, -8, 4, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  }),
  /** A horseshoe magnet. */
  magnet: () => canvasTex('magnet', 64, 64, (g) => {
    g.lineCap = 'butt';
    g.lineWidth = 14; g.strokeStyle = '#ffffff';
    g.beginPath(); g.arc(32, 30, 17, Math.PI, 0, true); g.stroke();
    g.lineWidth = 10; g.strokeStyle = '#ff3b4f';
    g.beginPath(); g.arc(32, 30, 17, Math.PI, 0, true); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(8, 28, 14, 16); g.fillRect(42, 28, 14, 16);
    g.fillStyle = '#d8e8ff'; g.fillRect(10, 32, 10, 10); g.fillRect(44, 32, 10, 10);
  }),
};

// ------------------------------------------------------------------ billboards

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

  constructor(scene: THREE.Object3D, tex: THREE.Texture, readonly capacity: number, o: { blend?: 'add' | 'normal'; flat?: boolean; order?: number; depthTest?: boolean } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true,
      blending: o.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
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

  /** A quad at (x, y, z), sx × sy, turned by `rot` in its own plane, tinted (times `k`). */
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

// ------------------------------------------------------------------ particles

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  c: THREE.Color;
  drag: number;
  grav: number;
  spin: number;
}

/** A pool of particles drawn as soft billboards (additive glows, or normal-blended smoke). */
export class Particles {
  private pool: P[] = [];
  private live: P[] = [];
  readonly bb: Billboards;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, private cap = 1500, blend: 'add' | 'normal' = 'add', order = 12) {
    this.bb = new Billboards(scene, tex, cap, { order, blend });
  }

  get count(): number { return this.live.length; }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, drag = 2, grav = 0): void {
    if (this.live.length >= this.cap) return;
    const p = this.pool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, c: new THREE.Color(), drag: 0, grav: 0, spin: 0 };
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1;
    p.c.setHex(color); p.drag = drag; p.grav = grav; p.spin = Math.random() * 6;
    this.live.push(p);
  }

  /** A round burst. */
  burst(x: number, y: number, z: number, n: number, speed: number, colors: number[], life = 0.6, size = 0.5, up = 0.6, grav = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const v = speed * (0.35 + Math.random() * 0.65);
      this.emit(x, y, z, Math.cos(a) * v, (u * up + 0.1) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.6), size * 0.1, colors[i % colors.length], 2.5, grav);
    }
  }

  update(dt: number, cam: THREE.Quaternion): void {
    const live = this.live;
    this.bb.begin(cam);
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) { live[i] = live[live.length - 1]; live.pop(); this.pool.push(p); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy = Math.abs(p.vy) * 0.3; }
      const k = p.life / p.max;
      const s = p.s1 + (p.s0 - p.s1) * k;
      this.bb.add(p.x, p.y, p.z, s, s, p.spin + (1 - k) * 2, p.c, Math.min(1, k * 2.2));
    }
    this.bb.end();
  }

  clear(): void { for (const p of this.live) this.pool.push(p); this.live.length = 0; }
}
