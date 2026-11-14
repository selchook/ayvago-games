// Rooftop Courier: the things on the roofs that move or go: postage stamps, time bottles and
// springs, the six power-ups (a horseshoe magnet, a paper plane, a bubble, a golden ×2 stamp, a
// pocket watch and a parcel tied with a red express ribbon; all instanced, spinning, with a halo),
// the pigeons (instanced bodies and wings: they peck, then burst up and away when the courier
// comes; one in a flock may be golden) and the drop point (a glowing hatch with a tall beacon of
// light). Built from plain geometry and canvas textures: none of the kits has a stamp, a bottle,
// a bird, a magnet or a hatch.
import { THREE } from '@core/three';
import type { Course, Flock } from './course';
import type { Parcel } from './sim';
import { Billboards } from './fx3d';
import { seeded, isPower, POWERS, POWER_COLOR, type Power } from './defs';

const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const QL = new THREE.Quaternion();
const QW = new THREE.Quaternion();
const V2 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A postage stamp: perforated white edge, a sunset field and a winged parcel. */
export function stampTex(): THREE.CanvasTexture {
  return canvas(96, 120, (g) => {
    g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, 96, 120);
    // perforations
    g.fillStyle = 'rgba(0,0,0,0)';
    g.globalCompositeOperation = 'destination-out';
    for (let x = 6; x < 96; x += 12) { g.beginPath(); g.arc(x, 0, 4, 0, 7); g.arc(x, 120, 4, 0, 7); g.fill(); }
    for (let y = 6; y < 120; y += 12) { g.beginPath(); g.arc(0, y, 4, 0, 7); g.arc(96, y, 4, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const gr = g.createLinearGradient(0, 12, 0, 104);
    gr.addColorStop(0, '#ff6a3d'); gr.addColorStop(0.6, '#ffb24a'); gr.addColorStop(1, '#ffd77a');
    g.fillStyle = gr; g.fillRect(12, 12, 72, 92);
    // the sun and a roof line
    g.fillStyle = '#fff1c2'; g.beginPath(); g.arc(48, 62, 16, 0, 7); g.fill();
    g.fillStyle = '#5a2c4a'; g.fillRect(12, 80, 72, 24);
    g.fillRect(20, 70, 14, 12); g.fillRect(52, 66, 18, 16);
    // a parcel with wings
    g.fillStyle = '#ffffff';
    g.fillRect(40, 30, 16, 12);
    g.beginPath(); g.moveTo(40, 34); g.lineTo(26, 26); g.lineTo(32, 38); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(56, 34); g.lineTo(70, 26); g.lineTo(64, 38); g.closePath(); g.fill();
    g.fillStyle = '#c0392b'; g.fillRect(47, 30, 2, 12);
    g.strokeStyle = '#5a2c4a'; g.lineWidth = 2; g.strokeRect(12, 12, 72, 92);
  });
}

function bottleTex(): THREE.CanvasTexture {
  return canvas(64, 64, (g) => {
    g.fillStyle = '#7fe6ff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff6d0'; g.fillRect(0, 22, 64, 22);
    // an hourglass on the label
    g.fillStyle = '#c47a1a';
    g.beginPath(); g.moveTo(24, 25); g.lineTo(40, 25); g.lineTo(33, 33); g.lineTo(40, 41); g.lineTo(24, 41); g.lineTo(31, 33); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(8, 0, 6, 64);
  });
}

/** A golden stamp with ×2 on it (double stamps). */
function doubleTex(): THREE.CanvasTexture {
  return canvas(96, 120, (g) => {
    g.fillStyle = '#fff4c8'; g.fillRect(0, 0, 96, 120);
    g.globalCompositeOperation = 'destination-out';
    for (let x = 6; x < 96; x += 12) { g.beginPath(); g.arc(x, 0, 4, 0, 7); g.arc(x, 120, 4, 0, 7); g.fill(); }
    for (let y = 6; y < 120; y += 12) { g.beginPath(); g.arc(0, y, 4, 0, 7); g.arc(96, y, 4, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const gr = g.createLinearGradient(0, 12, 0, 104);
    gr.addColorStop(0, '#ffe066'); gr.addColorStop(1, '#e8a010');
    g.fillStyle = gr; g.fillRect(12, 12, 72, 92);
    g.fillStyle = '#7a3a08'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('×2', 48, 60);
    g.strokeStyle = '#7a3a08'; g.lineWidth = 3; g.strokeRect(12, 12, 72, 92);
  });
}

/** A geometry painted one colour (vertex colours), ready to merge. */
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const q = g.index ? g.toNonIndexed() : g;
  if (q !== g) g.dispose();
  for (const at of Object.keys(q.attributes)) if (at !== 'position' && at !== 'normal') q.deleteAttribute(at);
  if (!q.attributes.normal) q.computeVertexNormals();
  const c = new THREE.Color(hex), n = q.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  q.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return q;
}

/** The power-ups' shapes (one merged, vertex-coloured geometry each, about 0.6 m across). */
export function powerGeometry(k: Power): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (k) {
    case 'magnet': {
      // a red horseshoe magnet with silver poles, arc up
      parts.push(paint(new THREE.TorusGeometry(0.2, 0.075, 8, 18, Math.PI), 0xe03434));
      for (const x of [-0.2, 0.2]) {
        parts.push(paint(new THREE.BoxGeometry(0.15, 0.14, 0.15).translate(x, -0.07, 0), 0xe03434));
        parts.push(paint(new THREE.BoxGeometry(0.155, 0.1, 0.155).translate(x, -0.19, 0), 0xe6ecf2));
      }
      break;
    }
    case 'glide': {
      // a folded paper plane, nose forward
      const L = 0.62, W = 0.36;
      const tri = (pts: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); return g; };
      parts.push(paint(tri([0, 0, L / 2, -W, 0.03, -L / 2, 0, 0, -L / 2]), 0xf8f6f0));
      parts.push(paint(tri([0, 0, L / 2, 0, 0, -L / 2, W, 0.03, -L / 2]), 0xf8f6f0));
      parts.push(paint(tri([0, 0, L / 2, 0, -0.1, -L / 2, 0, 0, -L / 2]), 0xc8d8ec));
      // the back faces too (the plane spins)
      parts.push(paint(tri([0, 0, L / 2, 0, 0, -L / 2, -W, 0.03, -L / 2]), 0xe8eef6));
      parts.push(paint(tri([0, 0, L / 2, W, 0.03, -L / 2, 0, 0, -L / 2]), 0xe8eef6));
      parts.push(paint(tri([0, 0, L / 2, 0, 0, -L / 2, 0, -0.1, -L / 2]), 0xb8c8dc));
      break;
    }
    case 'shield': {
      // a bubble with a ring round it
      parts.push(paint(new THREE.SphereGeometry(0.3, 16, 12), 0x9fe8ff));
      parts.push(paint(new THREE.TorusGeometry(0.34, 0.025, 6, 24).rotateX(Math.PI / 2), 0xffffff));
      break;
    }
    case 'watch': {
      // a pocket watch: gold case, white face both sides, dark hands, a crown and its ring
      parts.push(paint(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 22).rotateX(Math.PI / 2), 0xe8b030));
      for (const z of [0.042, -0.042]) {
        parts.push(paint(new THREE.CircleGeometry(0.205, 22).rotateY(z < 0 ? Math.PI : 0).translate(0, 0, z), 0xfbf6ea));
        parts.push(paint(new THREE.BoxGeometry(0.03, 0.15, 0.01).translate(0, 0.06, z * 1.12), 0x2a2430));
        parts.push(paint(new THREE.BoxGeometry(0.1, 0.03, 0.01).translate(0.045, 0, z * 1.12), 0x2a2430));
      }
      parts.push(paint(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10).translate(0, 0.28, 0), 0xe8b030));
      parts.push(paint(new THREE.TorusGeometry(0.06, 0.016, 6, 14).translate(0, 0.36, 0), 0xf0c040));
      break;
    }
    case 'express': {
      // a parcel tied with a red ribbon and a bow
      parts.push(paint(new THREE.BoxGeometry(0.44, 0.32, 0.44), 0xc98a4a));
      parts.push(paint(new THREE.BoxGeometry(0.46, 0.335, 0.09), 0xe0304a));
      parts.push(paint(new THREE.BoxGeometry(0.09, 0.335, 0.46), 0xe0304a));
      for (const sgn of [-1, 1]) parts.push(paint(new THREE.TorusGeometry(0.07, 0.024, 6, 12).rotateY(Math.PI / 2).rotateZ(sgn * 0.7).translate(sgn * 0.06, 0.22, 0), 0xff4a5e));
      break;
    }
    case 'double': break;
  }
  return mergeAll(parts);
}

export class Pickups {
  private stamps: THREE.InstancedMesh;
  private bottles: THREE.InstancedMesh;
  private springs: THREE.InstancedMesh;
  private powers = new Map<Power, THREE.InstancedMesh>();
  private t = 0;

  constructor(scene: THREE.Object3D, private halo: Billboards) {
    const stamp = new THREE.MeshLambertMaterial({ map: stampTex(), transparent: true, alphaTest: 0.5, emissive: 0x6a3a10, side: THREE.DoubleSide });
    this.stamps = inst(scene, new THREE.PlaneGeometry(0.6, 0.75), stamp, 160);
    const pts = [[0, 0], [0.16, 0], [0.18, 0.05], [0.18, 0.36], [0.1, 0.46], [0.07, 0.56], [0.08, 0.62], [0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
    const bottle = new THREE.LatheGeometry(pts, 12);
    this.bottles = inst(scene, bottle, new THREE.MeshLambertMaterial({ map: bottleTex(), emissive: 0x1a5a70 }), 12);
    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 8; coil.push(new THREE.Vector3(Math.cos(a) * 0.2, i / 60 * 0.55, Math.sin(a) * 0.2)); }
    this.springs = inst(scene, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 120, 0.035, 5, false), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x5a3a00 }), 8);
    for (const k of POWERS) {
      const em = new THREE.Color(POWER_COLOR[k]).multiplyScalar(0.28);
      const mat = k === 'double'
        ? new THREE.MeshLambertMaterial({ map: doubleTex(), transparent: true, alphaTest: 0.5, emissive: 0x7a5010, side: THREE.DoubleSide })
        : k === 'shield'
          ? new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, emissive: em, depthWrite: false })
          : new THREE.MeshLambertMaterial({ vertexColors: true, emissive: em, side: k === 'glide' ? THREE.DoubleSide : THREE.FrontSide });
      const geo = k === 'double' ? new THREE.PlaneGeometry(0.75, 0.94) : powerGeometry(k);
      this.powers.set(k, inst(scene, geo, mat, 4));
    }
  }

  /** `gold`: double stamps are on (the stamps glow gold). */
  update(dt: number, course: Course, fromS: number, toS: number, gold = false): void {
    this.t += dt;
    let ns = 0, nb = 0, nsp = 0;
    const np = new Map<Power, number>();
    for (const p of course.pickups) {
      if (p.taken || p.s < fromS || p.s > toS) continue;
      const spin = this.t * 2.6 + p.id;
      const bob = Math.sin(this.t * 3 + p.id) * 0.08;
      if (p.kind === 'stamp' && ns < 160) {
        M.compose(V.set(p.x, p.y + bob, -p.s), Q.setFromEuler(E.set(0, p.pulled ? spin * 3 : spin, 0.12)), S.set(1, 1, 1));
        this.stamps.setMatrixAt(ns++, M);
        this.halo.add(p.x, p.y + bob, -p.s, gold ? 1.3 : 1.1, gold ? 1.3 : 1.1, 0, gold ? 0xffe060 : 0xffa64a, gold ? 0.5 : 0.35);
      } else if (isPower(p.kind)) {
        const k = p.kind, n = np.get(k) ?? 0, mesh = this.powers.get(k)!;
        if (n >= 4) continue;
        const sc = 1.25 + Math.sin(this.t * 5 + p.id) * 0.06;
        M.compose(V.set(p.x, p.y + bob * 1.5, -p.s), Q.setFromEuler(E.set(k === 'glide' ? 0.25 : 0, spin * 0.8, 0)), S.set(sc, sc, sc));
        mesh.setMatrixAt(n, M);
        np.set(k, n + 1);
        const pulse = 0.55 + 0.2 * Math.sin(this.t * 6 + p.id);
        this.halo.add(p.x, p.y + bob, -p.s, 2.4, 2.4, 0, POWER_COLOR[k], pulse);
        this.halo.add(p.x, p.y - 0.9, -p.s, 3.2, 1.0, 0, POWER_COLOR[k], 0.35);
      } else if (p.kind === 'bottle' && nb < 12) {
        M.compose(V.set(p.x, p.y - 0.3 + bob, -p.s), Q.setFromEuler(E.set(0.25, spin, 0)), S.set(1.5, 1.5, 1.5));
        this.bottles.setMatrixAt(nb++, M);
        this.halo.add(p.x, p.y + 0.15 + bob, -p.s, 1.8, 1.8, 0, 0x7fe6ff, 0.6);
      } else if (p.kind === 'spring' && nsp < 8) {
        M.compose(V.set(p.x, p.y - 0.35 + bob, -p.s), Q.setFromEuler(E.set(0, spin, 0)), S.set(1.6, 1.4 + Math.sin(this.t * 9) * 0.25, 1.6));
        this.springs.setMatrixAt(nsp++, M);
        this.halo.add(p.x, p.y + 0.1 + bob, -p.s, 1.8, 1.8, 0, 0xffd23f, 0.6);
      }
    }
    for (const [m, n] of [[this.stamps, ns], [this.bottles, nb], [this.springs, nsp], ...POWERS.map((k) => [this.powers.get(k)!, np.get(k) ?? 0])] as [THREE.InstancedMesh, number][]) {
      m.count = n;
      if (n) m.instanceMatrix.needsUpdate = true;
    }
  }
}

function inst(scene: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, n: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(g, m, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ pigeons

interface Bird { ox: number; oz: number; face: number; phase: number; vx: number; vy: number; vz: number; gold: boolean }

/** Pigeons: a body and two wings each, all flocks in two instanced meshes. */
export class Pigeons {
  private bodies: THREE.InstancedMesh;
  private wings: THREE.InstancedMesh;
  private birds = new Map<number, Bird[]>();
  private flyT = new Map<number, number>();
  private t = 0;
  static readonly CAP = 48;

  constructor(scene: THREE.Object3D, private halo: Billboards) {
    // a pigeon seen from a few metres up: a low, wide, plump body (blue-grey back, lighter breast),
    // a dark iridescent neck, a small head with a pale beak, a dark fanned tail
    const body = new THREE.SphereGeometry(1, 12, 8).toNonIndexed();
    body.scale(0.11, 0.095, 0.19);
    body.rotateX(-0.18);
    body.translate(0, 0.1, 0);
    const neck = new THREE.CylinderGeometry(0.045, 0.06, 0.08, 8).toNonIndexed();
    neck.rotateX(0.5);
    neck.translate(0, 0.16, 0.12);
    const head = new THREE.SphereGeometry(0.058, 10, 8).toNonIndexed();
    head.translate(0, 0.205, 0.155);
    const beak = new THREE.ConeGeometry(0.016, 0.05, 6).toNonIndexed();
    beak.rotateX(Math.PI / 2 + 0.25);
    beak.translate(0, 0.195, 0.225);
    const tail = new THREE.BoxGeometry(0.12, 0.018, 0.13).toNonIndexed();
    tail.rotateX(0.25);
    tail.translate(0, 0.075, -0.22);
    const back = [0.5, 0.55, 0.66], breast = [0.74, 0.76, 0.85];
    const parts: [THREE.BufferGeometry, (n: THREE.Vector3) => number[]][] = [
      [body, (n) => (n.y < 0.35 && n.z > -0.2 ? breast : back)],
      [neck, (n) => (n.x > 0 ? [0.36, 0.52, 0.48] : [0.42, 0.36, 0.52])],
      [head, () => [0.42, 0.46, 0.56]],
      [beak, () => [0.9, 0.78, 0.55]],
      [tail, () => [0.32, 0.34, 0.42]],
    ];
    const nv = new THREE.Vector3();
    for (const [g, colOf] of parts) {
      const nrm = g.attributes.normal, n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) c.set(colOf(nv.fromBufferAttribute(nrm as THREE.BufferAttribute, k)), k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      for (const at of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(at)) g.deleteAttribute(at);
    }
    const merged = mergeAll(parts.map(([g]) => g));
    this.bodies = inst(scene, merged, new THREE.MeshLambertMaterial({ vertexColors: true }), Pigeons.CAP);
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Pigeons.CAP * 3).fill(1), 3);
    this.bodies.castShadow = true;
    // a wing: a tapered blade out along +x from the shoulder (spread when flying, folded back on the body at rest)
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.07, 0.3, 0, -0.02, 0, 0, -0.09, 0.3, 0, -0.02, 0.24, 0, -0.1, 0, 0, -0.09], 3));
    wing.computeVertexNormals();
    this.wings = inst(scene, wing, new THREE.MeshLambertMaterial({ color: 0x7d879e, side: THREE.DoubleSide }), Pigeons.CAP * 2);
    this.wings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Pigeons.CAP * 6).fill(1), 3);
  }

  private flock(f: Flock): Bird[] {
    let b = this.birds.get(f.id);
    if (b) return b;
    const r = seeded(f.id * 977);
    b = [];
    for (let i = 0; i < f.n; i++) {
      const a = r() * Math.PI * 2, d = 0.3 + r() * 1.3;
      b.push({ ox: Math.cos(a) * d, oz: Math.sin(a) * d, face: r() * Math.PI * 2, phase: r() * 10, vx: (r() - 0.5) * 9, vy: 3 + r() * 3, vz: -6 - r() * 6, gold: f.gold && i === 0 });
    }
    this.birds.set(f.id, b);
    return b;
  }

  /** The flock bursts into the air. */
  startle(f: Flock): void { if (!this.flyT.has(f.id)) this.flyT.set(f.id, 0); }

  update(dt: number, course: Course, fromS: number, toS: number): void {
    this.t += dt;
    let n = 0;
    for (const f of course.flocks) {
      if (f.s < fromS || f.s > toS) continue;
      const birds = this.flock(f);
      let ft = this.flyT.get(f.id);
      if (ft !== undefined) { ft += dt; this.flyT.set(f.id, ft); }
      for (const b of birds) {
        if (n >= Pigeons.CAP) break;
        if (b.gold && f.goldTaken) continue;
        let x = f.x + b.ox, y = f.y, z = -(f.s + b.oz), yaw = b.face, flap = 0, pitch = 0, flying = false;
        if (ft !== undefined && !(b.gold && !f.goldTaken && ft < 0.01)) {
          if (ft > 4) continue;
          // up and away, flapping hard
          const k = ft;
          x += b.vx * k; y += b.vy * k + 1.5 * k * k; z += b.vz * k;
          yaw = Math.atan2(b.vx, b.vz);
          flap = 0.25 + Math.sin(this.t * 30 + b.phase) * 0.85;
          pitch = -0.12;
          flying = true;
        } else {
          // pecking and bobbing on the roof
          const p = Math.sin(this.t * 3 + b.phase);
          pitch = p > 0.6 ? (p - 0.6) * 1.4 : 0;
          yaw += Math.sin(this.t * 0.7 + b.phase) * 0.4;
        }
        const sc = b.gold ? 1.4 : 1.15;
        Q.setFromEuler(E.set(pitch, yaw, 0, 'YXZ'));
        M.compose(V.set(x, y, z), Q, S.set(sc, sc, sc));
        this.bodies.setMatrixAt(n, M);
        this.bodies.setColorAt(n, C.setHex(b.gold ? 0xffd040 : 0xffffff));
        for (const side of [-1, 1]) {
          // shoulder on the body's side; folded: turned back along the body and a little down
          QL.setFromEuler(flying ? E.set(0, 0, side * flap, 'XYZ') : E.set(0, side * 1.42, side * -0.25, 'XYZ'));
          QW.copy(Q).multiply(QL);
          V2.set(side * 0.07 * sc, 0.135 * sc, 0.02 * sc).applyQuaternion(Q).add(V.set(x, y, z));
          const wm = M2.compose(V2, QW, S.set(side * sc * (flying ? 1.3 : 1), sc, flying ? sc * 1.1 : sc * 0.9));
          this.wings.setMatrixAt(n * 2 + (side < 0 ? 0 : 1), wm);
          this.wings.setColorAt(n * 2 + (side < 0 ? 0 : 1), C.setHex(b.gold ? 0xffe070 : 0xffffff));
        }
        if (b.gold) this.halo.add(x, y + 0.3, z, 1.6 + Math.sin(this.t * 6) * 0.2, 1.6 + Math.sin(this.t * 6) * 0.2, 0, 0xffd23f, 0.7);
        n++;
      }
    }
    this.bodies.count = n;
    this.wings.count = n * 2;
    if (n) {
      this.bodies.instanceMatrix.needsUpdate = true;
      this.bodies.instanceColor!.needsUpdate = true;
      this.wings.instanceMatrix.needsUpdate = true;
      this.wings.instanceColor!.needsUpdate = true;
    }
    // forget flocks far behind
    if (this.birds.size > 40) for (const id of this.birds.keys()) if (!course.flocks.some((f) => f.id === id)) { this.birds.delete(id); this.flyT.delete(id); }
  }
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ the drop point

/** A glowing roof hatch with a beacon of light over it. */
export class DropPoint {
  readonly group = new THREE.Group();
  private beam: THREE.Mesh;
  private lid: THREE.Mesh;
  private t = 0;

  constructor(scene: THREE.Object3D) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 1.5), new THREE.MeshLambertMaterial({ color: 0x8a5a2a, emissive: 0x2a1405 }));
    base.position.y = 0.21;
    base.castShadow = true;
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.3), new THREE.MeshLambertMaterial({ color: 0xffc040, emissive: 0xc06a10 }));
    this.lid.position.set(0, 0.47, 0);
    // the beacon: a soft column of warm light
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 128;
    const g = cv.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,220,120,0)');
    gr.addColorStop(0.75, 'rgba(255,200,90,0.55)');
    gr.addColorStop(1, 'rgba(255,240,180,0.95)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 46, 12, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beam.position.y = 23;
    this.beam.renderOrder = 8;
    this.group.add(base, this.lid, this.beam);
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number, p: Parcel | null): void {
    this.t += dt;
    this.group.visible = !!p;
    if (!p) return;
    this.group.position.set(p.x, p.y, -p.s);
    const k = 0.75 + 0.25 * Math.sin(this.t * 4);
    this.beam.scale.set(k, 1, k);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.3 * k;
    this.lid.rotation.x = -0.25 - 0.1 * Math.sin(this.t * 6);
    this.lid.position.z = -0.1;
  }

  /** The lid opens wide (a delivery). */
  pop(): void { this.lid.rotation.x = -1.4; }
}
