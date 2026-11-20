// Street Heat: the 3D effects. Soft particles (tyre smoke, damage smoke, fire, sparks, glass) as
// one THREE.Points per blend mode, tyre marks as one instanced ring buffer, glows (street lamp
// halos, head and tail lights, police beacons) as one instanced set of camera-facing quads, and
// the job markers as light columns. Everything is recycled; nothing allocates per frame.
import { THREE } from '@core/three';

// ------------------------------------------------------------------ particles

const P_VERT = /* glsl */ `
attribute float psize;
attribute float palpha;
attribute vec3 pcolor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(psize * uScale / -mv.z, 900.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = palpha * clamp((-mv.z - 0.6) / 1.2, 0.0, 1.0);
  vColor = pcolor;
}`;
const P_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vAlpha <= 0.0) discard;
  gl_FragColor = vec4(vColor * (1.0 - d * 0.35), vAlpha * smoothstep(0.5, 0.12, d));
}`;

export interface Emit { x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; life: number; size: number; grow?: number; alpha?: number; color: number; gravity?: number; drag?: number }

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array; private size: Float32Array; private alpha: Float32Array; private color: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private s0: Float32Array; private s1: Float32Array;
  private a0: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private next = 0;
  private c = new THREE.Color();
  live = 0;

  constructor(private count: number, additive: boolean, private viewHeight: number, fov: number) {
    this.pos = new Float32Array(count * 3); this.size = new Float32Array(count); this.alpha = new Float32Array(count); this.color = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3); this.life = new Float32Array(count); this.max = new Float32Array(count); this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count); this.a0 = new Float32Array(count); this.grav = new Float32Array(count); this.drag = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG,
      uniforms: { uScale: { value: viewHeight / (2 * Math.tan((fov * Math.PI) / 360)) } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  setFov(fov: number): void { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = this.viewHeight / (2 * Math.tan((fov * Math.PI) / 360)); }

  emit(e: Emit): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = e.x; this.pos[i * 3 + 1] = e.y; this.pos[i * 3 + 2] = e.z;
    this.vel[i * 3] = e.vx ?? 0; this.vel[i * 3 + 1] = e.vy ?? 0; this.vel[i * 3 + 2] = e.vz ?? 0;
    this.life[i] = this.max[i] = e.life;
    this.s0[i] = e.size; this.s1[i] = e.grow ?? e.size;
    this.a0[i] = e.alpha ?? 1; this.grav[i] = e.gravity ?? 0; this.drag[i] = e.drag ?? 0;
    this.c.setHex(e.color).toArray(this.color, i * 3);
    this.size[i] = e.size; this.alpha[i] = 0;
  }

  update(dt: number): void {
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      live++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - k) * 8) * Math.min(1, k * 1.6);
    }
    this.live = live;
    const g = this.points.geometry;
    for (const n of ['position', 'psize', 'palpha', 'pcolor']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void { this.life.fill(0); this.alpha.fill(0); }
}

// ------------------------------------------------------------------ tyre marks

const S_VERT = /* glsl */ `
attribute float aBorn;
attribute float aShade;
uniform float uNow;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float age = (uNow - aBorn) / 14.0;
  vAlpha = age < 0.0 || age > 1.0 ? 0.0 : (1.0 - age * age) * aShade;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const S_FRAG = /* glsl */ `
varying float vAlpha;
varying vec2 vUv;
void main() {
  float a = vAlpha * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(0.02, 0.02, 0.025, a);
}`;

export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private born: THREE.InstancedBufferAttribute;
  private shade: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private next = 0;
  private now = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private last = new Map<number, { x: number; y: number; z: number; t: number }>();

  constructor(private readonly max = 1200) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-999), 1);
    this.shade = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(0), 1);
    geo.setAttribute('aBorn', this.born);
    geo.setAttribute('aShade', this.shade);
    this.mat = new THREE.ShaderMaterial({ vertexShader: S_VERT, fragmentShader: S_FRAG, uniforms: { uNow: { value: 0 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.m);
  }

  /** One wheel's mark from its last point to (x, y, z). */
  mark(id: number, x: number, y: number, z: number, strength: number, width = 0.3): void {
    const prev = this.last.get(id);
    this.last.set(id, { x, y, z, t: this.now });
    if (!prev || this.now - prev.t > 0.12) return;
    const dx = x - prev.x, dz = z - prev.z, len = Math.hypot(dx, dz);
    if (len < 0.08 || len > 3) return;
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.p.set((x + prev.x) / 2, Math.max(y, prev.y) + 0.03, (z + prev.z) / 2);
    this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx));
    this.s.set(len + 0.05, 1, width);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born.setX(i, this.now); this.born.needsUpdate = true;
    this.shade.setX(i, Math.max(0, Math.min(1, strength)) * 0.7); this.shade.needsUpdate = true;
  }

  update(dt: number): void { this.now += dt; this.mat.uniforms.uNow.value = this.now; }
}

// ------------------------------------------------------------------ glows

/** Camera-facing additive quads with a soft round texture: lamp halos, car lights, beacons. */
export class Glows {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(tex: THREE.Texture, private readonly max = 400) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexColors: false });
    (mat as unknown as { shGlowTex: THREE.Texture }).shGlowTex = tex;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.setColorAt(0, this.c.set(0));
    this.mesh.count = 0;
  }

  /** Starts a frame: the camera's orientation for facing. */
  begin(cam: THREE.Camera): void { this.n = 0; this.q.copy(cam.quaternion); }

  add(x: number, y: number, z: number, size: number, color: number, k = 1): void {
    if (this.n >= this.max || k <= 0.01) return;
    this.p.set(x, y, z);
    this.s.set(size, size, size);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    this.c.setHex(color).multiplyScalar(k);
    this.mesh.setColorAt(this.n, this.c);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ markers

/** Light columns over the job markers (open cylinders fading upwards) and a ring on the ground. */
export class Markers {
  readonly group = new THREE.Group();
  private cols: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private colGeo: THREE.BufferGeometry;
  private ringGeo: THREE.BufferGeometry;
  private mats = new Map<number, THREE.MeshBasicMaterial>();

  constructor() {
    const g = new THREE.CylinderGeometry(2.6, 2.6, 14, 24, 1, true);
    g.translate(0, 7, 0);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = 1 - pos.getY(i) / 14; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k * k * k * 0.2; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.colGeo = g;
    const r = new THREE.RingGeometry(2.4, 2.9, 32);
    r.rotateX(-Math.PI / 2);
    r.translate(0, 0.08, 0);
    this.ringGeo = r;
  }

  private mat(color: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      this.mats.set(color, m);
    }
    return m;
  }

  /** Shows these markers this frame (pulsing). */
  sync(list: { x: number; z: number; color: number; scale?: number }[], t: number): void {
    while (this.cols.length < list.length) {
      const c = new THREE.Mesh(this.colGeo, this.mat(0xffffff));
      const r = new THREE.Mesh(this.ringGeo, this.mat(0xffffff));
      c.renderOrder = 6; r.renderOrder = 6;
      this.group.add(c, r);
      this.cols.push(c); this.rings.push(r);
    }
    this.cols.forEach((c, i) => {
      const m = list[i];
      const r = this.rings[i];
      c.visible = r.visible = !!m;
      if (!m) return;
      const s = m.scale ?? 1;
      c.material = r.material = this.mat(m.color);
      c.position.set(m.x, 0, m.z);
      r.position.set(m.x, 0, m.z);
      const pulse = 1 + Math.sin(t * 4 + i) * 0.08;
      c.scale.set(s * pulse, s, s * pulse);
      r.scale.setScalar(s * (1 + ((t * 0.8 + i * 0.3) % 1) * 0.6));
    });
  }
}
