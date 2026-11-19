// Neon Ronin: cheap 3D effects for the view. One additive point cloud for every spark, ember, rain
// splash and static glow (a single draw call each), plus small pools of meshes for bolts, laser
// sights, rings and slash arcs. Every texture is made from a canvas of art.ts and freed with the
// world (it sits in the world's scene).
import { THREE } from '@core/three';

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float scale;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint * t.rgb, t.a * vAlpha);
}`;

/** A pool of additive glowing points: sparks with velocity, gravity, drag and fade. */
export class Sparks {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private size0: Float32Array;
  private alpha: Float32Array;
  private tint: Float32Array;
  private grav: Float32Array;
  private next = 0;
  private dirty = true;

  constructor(n: number, tex: THREE.Texture, pixelScale: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.tint = new Float32Array(n * 3);
    this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: pixelScale } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** One particle. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life;
    this.size0[i] = size; this.size[i] = size;
    this.alpha[i] = 1;
    this.tint[i * 3] = ((color >> 16) & 255) / 255; this.tint[i * 3 + 1] = ((color >> 8) & 255) / 255; this.tint[i * 3 + 2] = (color & 255) / 255;
    this.grav[i] = gravity;
    this.dirty = true;
  }

  /** A burst of `count` sparks from a point. */
  burst(x: number, y: number, z: number, color: number, count: number, speed: number, size = 0.35, life = 0.5, gravity = 6, up = 0): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.emit(x, y, z, Math.cos(a) * s, Math.sin(a) * s + up, (Math.random() - 0.5) * s * 0.6, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color, gravity);
    }
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.pow(0.12, dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k;
      this.size[i] = this.size0[i] * (0.4 + 0.6 * k);
    }
    if (any || this.dirty) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
      g.attributes.tint.needsUpdate = true;
      this.dirty = false;
    }
  }
}

/** A static cloud of glows (lights, sign halos): one draw call; `pulse` dims them all a little. */
export function glowCloud(items: Array<{ x: number; y: number; z: number; size: number; color: number; alpha: number }>, tex: THREE.Texture, pixelScale: number): THREE.Points {
  const n = items.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), tint = new Float32Array(n * 3);
  items.forEach((it, i) => {
    pos[i * 3] = it.x; pos[i * 3 + 1] = it.y; pos[i * 3 + 2] = it.z;
    size[i] = it.size; alpha[i] = it.alpha;
    tint[i * 3] = ((it.color >> 16) & 255) / 255; tint[i * 3 + 1] = ((it.color >> 8) & 255) / 255; tint[i * 3 + 2] = (it.color & 255) / 255;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: pixelScale } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.renderOrder = 4;
  return p;
}

/** An additive textured quad (a slash arc, a ring, a beam) with its own material. */
export type Quad = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
export function glowQuad(tex: THREE.Texture, color: number, w = 1, h = 1): Quad {
  const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m) as Quad;
  q.renderOrder = 6;
  return q;
}

/** A plain additive bar (laser sights, beams). */
export function beam(color: number, opacity = 1): Quad {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m) as Quad;
  q.renderOrder = 6;
  return q;
}

export function canvasTex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
