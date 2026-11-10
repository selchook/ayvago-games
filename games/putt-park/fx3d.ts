// Small 3D particle effects: confetti for a hole in one, a splash for the water, a puff of felt
// on a hard landing and a sparkle ring when the ball drops. One shared geometry per kind.
import { THREE } from '@core/three';

interface Bit {
  m: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
  drag: number;
  grav: number;
  fade: boolean;
}

const CONFETTI = [0xff4a5c, 0xffd23f, 0x3ee6ff, 0x7dff9a, 0xff8ad8, 0xffffff];

export class Particles {
  private bits: Bit[] = [];
  private plane = new THREE.PlaneGeometry(0.035, 0.022);
  private drop = new THREE.IcosahedronGeometry(0.012, 0);
  private mats = new Map<number, THREE.MeshBasicMaterial>();

  constructor(private scene: THREE.Scene) {}

  private mat(color: number, transparent = false): THREE.MeshBasicMaterial {
    const key = color + (transparent ? 0x1000000 : 0);
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent, depthWrite: !transparent });
      this.mats.set(key, m);
    }
    return m;
  }

  confetti(at: THREE.Vector3, count = 90): void {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.plane, this.mat(CONFETTI[i % CONFETTI.length]));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.6;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 2.2 + Math.random() * 2.2, Math.sin(a) * s), 2.6 + Math.random(), 1.6, 3.2, false);
    }
  }

  splash(at: THREE.Vector3): void {
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(this.drop, this.mat(i % 3 ? 0xdff4ff : 0x9fd8ff));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2, s = 0.3 + Math.random() * 0.6;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 1.2, Math.sin(a) * s), 0.8, 0.5, 9.8, false);
    }
    this.ring(at, 0xffffff, 0.25);
  }

  puff(at: THREE.Vector3, color: number): void {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.drop, this.mat(color));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2, s = 0.15 + Math.random() * 0.25;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 0.3 + Math.random() * 0.4, Math.sin(a) * s), 0.45, 2, 4, false);
    }
  }

  /** An expanding ring on the ground. */
  ring(at: THREE.Vector3, color: number, size = 0.15): void {
    const geo = new THREE.RingGeometry(0.8, 1, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at).add(new THREE.Vector3(0, 0.004, 0));
    m.scale.setScalar(size * 0.3);
    m.userData.grow = size;
    m.userData.own = true;
    this.add(m, new THREE.Vector3(), 0.6, 0, 0, true);
  }

  private add(m: THREE.Mesh, v: THREE.Vector3, life: number, drag: number, grav: number, fade: boolean): void {
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    if (m.userData.grow) m.rotation.set(-Math.PI / 2, 0, 0);
    this.scene.add(m);
    this.bits.push({ m, v, spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5), life, max: life, drag, grav, fade });
  }

  update(dt: number): void {
    this.bits = this.bits.filter((b) => {
      b.life -= dt;
      if (b.m.userData.grow) {
        const k = 1 - b.life / b.max;
        b.m.scale.setScalar(b.m.userData.grow * (0.3 + k * 1.4));
        (b.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      } else {
        b.v.y -= b.grav * dt;
        b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += b.spin.x * dt;
        b.m.rotation.y += b.spin.y * dt;
        b.m.rotation.z += b.spin.z * dt;
        if (b.life < 0.4) b.m.scale.setScalar(Math.max(0.01, b.life / 0.4));
      }
      if (b.life > 0) return true;
      this.scene.remove(b.m);
      if (b.m.userData.own) {
        b.m.geometry.dispose();
        (b.m.material as THREE.Material).dispose();
      }
      return false;
    });
  }

  clear(): void {
    for (const b of this.bits) this.scene.remove(b.m);
    this.bits = [];
  }
}
