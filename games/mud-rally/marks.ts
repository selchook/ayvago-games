// Tyre marks on the ground: short dark quads laid under the rear wheels while a truck slides or
// brakes hard. One instanced mesh, a ring buffer, and a fade by age in the shader.
import { THREE } from '@core/three';

const VERT = `
attribute float aBorn;
attribute float aShade;
uniform float uNow;
uniform float uLife;
varying float vAlpha;
varying float vShade;
varying vec2 vUv;
void main() {
  float age = (uNow - aBorn) / uLife;
  vAlpha = age < 0.0 || age > 1.0 ? 0.0 : (1.0 - age * age);
  vShade = aShade;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 uColor;
varying float vAlpha;
varying float vShade;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  float a = vAlpha * edge * vShade;
  if (a <= 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private born: THREE.InstancedBufferAttribute;
  private shade: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private next = 0;
  private now = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  /** Last mark end per wheel, so marks join into a line. */
  private last = new Map<string, { x: number; y: number; z: number; t: number }>();

  constructor(private readonly max = 900, life = 7) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-999), 1);
    this.shade = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(0), 1);
    geo.setAttribute('aBorn', this.born);
    geo.setAttribute('aShade', this.shade);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uNow: { value: 0 }, uLife: { value: life }, uColor: { value: new THREE.Color(0x3a2414) } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.userData.ownMaterial = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * One wheel's mark from its last point to (x, y, z); `strength` 0..1 sets how dark it is.
   * A wheel that stopped marking for a moment starts a fresh line.
   */
  mark(id: string, x: number, y: number, z: number, strength: number, width = 0.32): void {
    const prev = this.last.get(id);
    this.last.set(id, { x, y, z, t: this.now });
    if (!prev || this.now - prev.t > 0.12) return;
    const dx = x - prev.x, dz = z - prev.z, len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 2) return;
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.p.set((x + prev.x) / 2, (y + prev.y) / 2 + 0.05, (z + prev.z) / 2);
    this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx));
    this.s.set(len + 0.04, 1, width);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born.setX(i, this.now);
    this.born.needsUpdate = true;
    this.shade.setX(i, Math.max(0, Math.min(1, strength)) * 0.55);
    this.shade.needsUpdate = true;
  }

  /** Forget where a wheel was (after a jump). */
  lift(id: string): void {
    this.last.delete(id);
  }

  update(dt: number): void {
    this.now += dt;
    this.mat.uniforms.uNow.value = this.now;
  }

  clear(): void {
    this.born.array.fill(-999);
    this.born.needsUpdate = true;
    this.last.clear();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
