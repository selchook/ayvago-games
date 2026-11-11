// Small 3D particle effects: strike confetti, wood chips and dust where the ball meets the pins,
// a spark ring on the deck. One shared geometry and material per kind.
import { THREE } from '@core/three';

interface Bit {
  m: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
  drag: number;
  grav: number;
}

const CONFETTI = [0xff3fa4, 0xffd23f, 0x34e7ff, 0x7dff9a, 0x8a5bff, 0xffffff];

export class Particles {
  private bits: Bit[] = [];
  private plane = new THREE.PlaneGeometry(0.045, 0.028);
  private chip = new THREE.BoxGeometry(0.014, 0.008, 0.02);
  private mats = new Map<number, THREE.MeshBasicMaterial>();

  constructor(private scene: THREE.Object3D) {}

  private mat(color: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
      this.mats.set(color, m);
    }
    return m;
  }

  /** A shower of confetti from above the deck. */
  confetti(at: THREE.Vector3, count = 120): void {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.plane, this.mat(CONFETTI[i % CONFETTI.length]));
      m.position.set(at.x + (Math.random() - 0.5) * 1.6, at.y + Math.random() * 0.5, at.z + (Math.random() - 0.5) * 1.2);
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 1.8;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 1.2 + Math.random() * 2.6, Math.sin(a) * s * 0.6 + 0.6), 2.4 + Math.random() * 1.2, 1.9, 2.6);
    }
  }

  /** Wood chips and dust where the ball hits. */
  chips(at: THREE.Vector3, n = 14, speed = 2): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chip, this.mat(i % 3 ? 0xfff6e8 : 0xe9c48f));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * speed;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 0.6 + Math.random() * 1.6 * speed * 0.5, Math.sin(a) * s - speed * 0.6), 0.7, 0.8, 9.8);
    }
  }

  private add(m: THREE.Mesh, v: THREE.Vector3, life: number, drag: number, grav: number): void {
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(m);
    this.bits.push({ m, v, spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6), life, max: life, drag, grav });
  }

  update(dt: number): void {
    this.bits = this.bits.filter((b) => {
      b.life -= dt;
      b.v.y -= b.grav * dt;
      b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
      b.m.position.addScaledVector(b.v, dt);
      if (b.m.position.y < 0.005) { b.m.position.y = 0.005; b.v.set(b.v.x * 0.3, 0, b.v.z * 0.3); b.spin.multiplyScalar(0.5); }
      b.m.rotation.x += b.spin.x * dt;
      b.m.rotation.y += b.spin.y * dt;
      b.m.rotation.z += b.spin.z * dt;
      if (b.life < 0.4) b.m.scale.setScalar(Math.max(0.01, b.life / 0.4));
      if (b.life > 0) return true;
      this.scene.remove(b.m);
      return false;
    });
  }

  clear(): void {
    for (const b of this.bits) this.scene.remove(b.m);
    this.bits = [];
  }
}
