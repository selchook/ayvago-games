// Star Squadron: the effects layer, all instanced so a busy boss fight stays at a few draw calls.
//   - Billboards: camera-facing (or flat) quads with a canvas-drawn texture, one InstancedMesh each
//     (bullets, glows, flashes, rings, pickups' halos).
//   - Particles: sparks, engine trails, smoke and explosions on one additive billboard set.
//   - Debris: tumbling chunks of wrecked ships (one InstancedMesh of small boxes).
//   - The shield bubble: a fresnel sphere.
import { THREE } from '@core/three';

// ------------------------------------------------------------------ textures

/** A canvas texture drawn once per world (freed with it). */
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round glow: white in the middle, fading out. */
export const glowTex = () => canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

/** An enemy bullet's body: a bright core inside a dark rim, readable over any background. */
export const orbTex = () => canvasTex(64, (g, s) => {
  const c = s / 2;
  g.beginPath(); g.arc(c, c, s * 0.46, 0, Math.PI * 2); g.fillStyle = 'rgba(20,0,20,0.85)'; g.fill();
  const r = g.createRadialGradient(c, c, 0, c, c, s * 0.4);
  r.addColorStop(0, '#ffffff');
  r.addColorStop(0.55, '#ffffff');
  r.addColorStop(0.75, '#ffd0ec');
  r.addColorStop(1, '#ff5cb0');
  g.beginPath(); g.arc(c, c, s * 0.4, 0, Math.PI * 2); g.fillStyle = r; g.fill();
});

/** A long laser streak (vertical). */
export const streakTex = () => canvasTex(64, (g, s) => {
  const lin = g.createLinearGradient(0, 0, s, 0);
  lin.addColorStop(0, 'rgba(255,255,255,0)');
  lin.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  lin.addColorStop(0.5, 'rgba(255,255,255,1)');
  lin.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  lin.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lin;
  g.fillRect(0, 0, s, s);
  // fade the ends
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, s);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.2, 'rgba(0,0,0,1)');
  v.addColorStop(0.8, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, s, s);
});

/** A thin bright ring (shock waves, the boss's shield, pickup halos). */
export const ringTex = () => canvasTex(128, (g, s) => {
  const c = s / 2;
  const r = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.7, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

/** A four-pointed star flare (muzzle flashes, crits, pickups). */
export const flareTex = () => canvasTex(64, (g, s) => {
  const c = s / 2;
  const r = g.createRadialGradient(c, c, 0, c, c, s * 0.5);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(c, 0); g.lineTo(c + 3, c - 3); g.lineTo(s, c); g.lineTo(c + 3, c + 3); g.lineTo(c, s); g.lineTo(c - 3, c + 3); g.lineTo(0, c); g.lineTo(c - 3, c - 3);
  g.closePath();
  g.fill();
});

// ------------------------------------------------------------------ billboards

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const zAxis = new THREE.Vector3(0, 0, 1);
const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** Many textured quads in one draw call: camera-facing, or flat on the play plane. */
export class Billboards {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private rq = new THREE.Quaternion();

  constructor(scene: THREE.Object3D, tex: THREE.Texture, readonly capacity: number, o: { additive?: boolean; flat?: boolean; order?: number } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: false, side: THREE.DoubleSide,
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
  private flat: boolean;

  /** Starts a frame; `cam` is the camera's world orientation. */
  begin(cam: THREE.Quaternion): void {
    this.n = 0;
    this.rq.copy(this.flat ? flatQ : cam);
  }

  /** A quad at (x, y, z), sx × sy, turned by `rot` in its own plane, tinted (times `k` for fades). */
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
  /** Stretch along the screen-space velocity (sparks). */
  stretch: number;
}

/** A pool of additive particles drawn as soft glows. */
export class Particles {
  private pool: P[] = [];
  private live: P[] = [];
  readonly bb: Billboards;

  constructor(scene: THREE.Object3D, tex: THREE.Texture, private cap = 1400) {
    this.bb = new Billboards(scene, tex, cap, { order: 12 });
  }

  get count(): number { return this.live.length; }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, drag = 2, stretch = 0): void {
    if (this.live.length >= this.cap) return;
    const p = this.pool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, c: new THREE.Color(), drag: 0, stretch: 0 };
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1;
    p.c.setHex(color); p.drag = drag; p.stretch = stretch;
    this.live.push(p);
  }

  /** A round burst. */
  burst(x: number, y: number, z: number, n: number, speed: number, colors: number[], life = 0.6, size = 0.5, stretch = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
      const v = speed * (0.35 + Math.random() * 0.65);
      const h = Math.sqrt(1 - u * u);
      this.emit(x, y, z, Math.cos(a) * h * v, u * v * 0.6, Math.sin(a) * h * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.6), 0, colors[i % colors.length], 2.5, stretch);
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
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    const bb = this.bb;
    bb.begin(cam);
    for (const p of live) {
      const k = p.life / p.max;
      const s = p.s1 + (p.s0 - p.s1) * k;
      if (p.stretch > 0) {
        const sp = Math.hypot(p.vx, p.vz);
        const rot = Math.atan2(-p.vx, -p.vz);
        bb.add(p.x, p.y, p.z, s * 0.45, s + sp * p.stretch, rot, p.c, Math.min(1, k * 1.6));
      } else bb.add(p.x, p.y, p.z, s, s, 0, p.c, Math.min(1, k * 1.6));
    }
    bb.end();
  }

  clear(): void {
    for (const p of this.live) this.pool.push(p);
    this.live.length = 0;
  }
}

// ------------------------------------------------------------------ debris

interface D { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; wx: number; wy: number; life: number; s: number; c: number }

/** Tumbling chunks of wrecked ships. */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private list: D[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(scene: THREE.Object3D, private cap = 160) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1, flatShading: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.45, 0.7), mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(x: number, z: number, n: number, colors: number[], size = 0.22, speed = 5): void {
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      this.list.push({
        x, y: 0.2, z, vx: Math.cos(a) * v, vy: 2 + Math.random() * 3, vz: Math.sin(a) * v + 1.5, rx: Math.random() * 6, ry: Math.random() * 6,
        wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, life: 0.9 + Math.random() * 0.8, s: size * (0.6 + Math.random() * 0.8), c: colors[i % colors.length],
      });
    }
  }

  update(dt: number): void {
    const c = new THREE.Color();
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.life -= dt;
      if (d.life <= 0) { this.list.splice(i, 1); continue; }
      d.vy -= 9 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.wx * dt; d.ry += d.wy * dt;
    }
    for (const d of this.list) {
      const s = d.s * Math.min(1, d.life * 2.5);
      this.q.setFromEuler(this.e.set(d.rx, d.ry, 0));
      this.m.compose(tmpP.set(d.x, d.y, d.z), this.q, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, c.setHex(d.c));
      n++;
    }
    this.mesh.count = n;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true; }
  }

  clear(): void { this.list.length = 0; }
}

// ------------------------------------------------------------------ shield bubble

/** A glowing fresnel sphere (the Shield power, the boss's armour). */
export function bubble(color: number, opacity = 1): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: opacity }, uT: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vP = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uK; uniform float uT;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float hex = 0.5 + 0.5 * sin(vP.y * 18.0 + uT * 4.0) * sin(vP.x * 18.0 - uT * 3.0);
        float a = (0.12 + f * 0.95 + hex * 0.06 * f) * uK;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  m.renderOrder = 15;
  return m;
}
