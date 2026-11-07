// Recycled soft particles (dust, mud, spray, flame) drawn as one THREE.Points per blend mode.
import { THREE } from '@core/three';

const VERT = `
attribute float psize;
attribute float palpha;
attribute vec3 pcolor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
  vAlpha = palpha;
  vColor = pcolor;
}`;

const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vAlpha <= 0.0) discard;
  float a = vAlpha * smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(vColor * (1.0 - d * 0.35), a);
}`;

export interface Emit {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  /** Seconds. */
  life: number;
  /** Size in world units at birth and at death. */
  size: number;
  grow?: number;
  alpha?: number;
  color: number;
  gravity?: number;
  /** Velocity damping per second (0..). */
  drag?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private color: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private next = 0;
  private c = new THREE.Color();

  constructor(private count: number, additive: boolean, viewHeight: number, fov: number) {
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.color = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.a0 = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: viewHeight / (2 * Math.tan((fov * Math.PI) / 360)) } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.points.userData.ownMaterial = true;
  }

  emit(e: Emit): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = e.x; this.pos[i * 3 + 1] = e.y; this.pos[i * 3 + 2] = e.z;
    this.vel[i * 3] = e.vx ?? 0; this.vel[i * 3 + 1] = e.vy ?? 0; this.vel[i * 3 + 2] = e.vz ?? 0;
    this.life[i] = this.max[i] = e.life;
    this.s0[i] = e.size; this.s1[i] = e.grow ?? e.size;
    this.a0[i] = e.alpha ?? 1;
    this.grav[i] = e.gravity ?? 0;
    this.drag[i] = e.drag ?? 0;
    this.c.setHex(e.color).toArray(this.color, i * 3);
    this.size[i] = e.size;
    this.alpha[i] = this.a0[i];
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      // fade in quickly, out slowly
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - k) * 8) * Math.min(1, k * 1.6);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('palpha') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('pcolor') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
