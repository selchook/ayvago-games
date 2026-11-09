// 3D effects: soft particles (sand, splashes, dust) and falling confetti.
import { THREE } from '@core/three';
import { canvasTex } from './athlete';

function dotTex(): THREE.Texture {
  return canvasTex('dot', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

interface P {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  g: number;
}

export class Particles3D {
  private free: THREE.Sprite[] = [];
  private live: P[] = [];

  constructor(private parent: THREE.Scene) {}

  emit(at: THREE.Vector3, n: number, colors: number[], o: { speed?: number; up?: number; life?: number; size?: number; gravity?: number; spread?: number } = {}): void {
    const speed = o.speed ?? 2, up = o.up ?? 2, life = o.life ?? 0.8, size = o.size ?? 0.18, g = o.gravity ?? 9, spread = o.spread ?? 0.2;
    for (let i = 0; i < n; i++) {
      let s = this.free.pop();
      if (!s) {
        const m = new THREE.SpriteMaterial({ map: dotTex(), transparent: true, depthWrite: false });
        s = new THREE.Sprite(m);
        s.userData.ownMaterial = true;
        s.renderOrder = 5;
        this.parent.add(s);
      }
      s.visible = true;
      (s.material as THREE.SpriteMaterial).color.setHex(colors[(Math.random() * colors.length) | 0]);
      (s.material as THREE.SpriteMaterial).opacity = 1;
      s.position.set(at.x + (Math.random() - 0.5) * spread, at.y + Math.random() * spread * 0.5, at.z + (Math.random() - 0.5) * spread);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      const sz = size * (0.6 + Math.random() * 0.8);
      s.scale.set(sz, sz, 1);
      this.live.push({ s, v: new THREE.Vector3(Math.cos(a) * sp, up * (0.5 + Math.random() * 0.7), Math.sin(a) * sp), life: life * (0.7 + Math.random() * 0.6), max: life, size: sz, g });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.free.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.v.y -= p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.min(1, p.life / (p.max * 0.5));
    }
  }

  clear(): void {
    for (const p of this.live) {
      p.s.visible = false;
      this.free.push(p.s);
    }
    this.live = [];
  }
}

const CONFETTI = [0xff6b4a, 0x22c3b5, 0xffc233, 0x9d6bff, 0x3b8cff, 0xffffff, 0xff4fa3];

/** Paper confetti raining over an area, tumbling as it falls. */
export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private bits: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3 }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private one = new THREE.Vector3(1, 1, 1);
  on = false;

  constructor(parent: THREE.Object3D, private center: THREE.Vector3, private size = 8, count = 260) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.2), mat, count);
    this.mesh.userData.ownMaterial = true;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(i, c.setHex(CONFETTI[i % CONFETTI.length]));
      this.bits.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
      this.reset(i, true);
    }
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  private reset(i: number, spread: boolean): void {
    const b = this.bits[i];
    b.p.set(this.center.x + (Math.random() - 0.5) * this.size * 2, this.center.y + 5 + Math.random() * (spread ? 6 : 1.5), this.center.z + (Math.random() - 0.5) * this.size);
    b.v.set((Math.random() - 0.5) * 0.6, -(0.8 + Math.random() * 0.9), (Math.random() - 0.5) * 0.6);
    b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    b.w.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  }

  start(): void {
    this.on = true;
    this.mesh.visible = true;
    this.bits.forEach((_, i) => this.reset(i, true));
  }

  update(dt: number, time: number): void {
    if (!this.on) return;
    this.bits.forEach((b, i) => {
      b.p.addScaledVector(b.v, dt);
      b.p.x += Math.sin(time * 2 + i) * dt * 0.3;
      b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt;
      if (b.p.y < this.center.y - 0.5) this.reset(i, false);
      this.q.setFromEuler(b.r);
      this.m.compose(b.p, this.q, this.one);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
