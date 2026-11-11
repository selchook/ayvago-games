// The sea and the sky: a faceted low-poly water sheet that follows the camera (its waves are
// computed from world coordinates, so it never swims), turquoise shallows around the islands,
// the light palettes (day, sunset, the ghost's dusk, the storm), drifting clouds, seagulls and rain.
import { THREE } from '@core/three';

export interface Palette {
  sky: number;
  fog: number;
  deep: number;
  crest: number;
  shallow: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  ambient: number;
}

export const PALETTES = {
  day: { sky: 0x8fd8ff, fog: 0xb4e4fb, deep: 0x1270aa, crest: 0x4cc6ea, shallow: 0x4fe3cf, sun: 0xffffff, sunI: 2.3, hemiSky: 0xe4f5ff, hemiGround: 0x4f87a0, ambient: 1.55 },
  sunset: { sky: 0xffb48a, fog: 0xf7b995, deep: 0x245f93, crest: 0xe7a184, shallow: 0x58c9c0, sun: 0xffb072, sunI: 2.1, hemiSky: 0xffd6bd, hemiGround: 0x5b4a6e, ambient: 1.35 },
  dusk: { sky: 0x334a5c, fog: 0x3f6266, deep: 0x153e52, crest: 0x4f9c8f, shallow: 0x3a8f83, sun: 0xb6ffe0, sunI: 1.35, hemiSky: 0x9fc6cf, hemiGround: 0x1d2c38, ambient: 1.25 },
  storm: { sky: 0x4a5866, fog: 0x56646f, deep: 0x173445, crest: 0x5f8494, shallow: 0x3d7a7e, sun: 0xd2dceb, sunI: 1.05, hemiSky: 0xb3c2d2, hemiGround: 0x2b3640, ambient: 1.25 },
} satisfies Record<string, Palette>;

/**
 * Frees the geometries this game made itself (flagged `userData.ownGeometry`) when a scene with a
 * World3D shuts down; the kit models share theirs with the loaded originals and are left alone.
 * Call before creating the World3D, so this runs before the world clears its scene.
 */
export function freeOwnGeometry(host: { events: { once: (e: string, fn: () => void) => unknown } }, scene: () => THREE.Scene | undefined): void {
  host.events.once('shutdown', () => {
    const seen = new Set<THREE.BufferGeometry>();
    scene()?.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (o.userData.ownGeometry && g && !seen.has(g)) {
        seen.add(g);
        g.dispose();
      }
    });
  });
}

const lerpHex = (a: number, b: number, k: number): number => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

export function mixPalette(a: Palette, b: Palette, k: number): Palette {
  const out = {} as Palette;
  for (const key of Object.keys(a) as (keyof Palette)[]) {
    out[key] = key === 'sunI' || key === 'ambient' ? a[key] + (b[key] - a[key]) * k : lerpHex(a[key], b[key], k);
  }
  return out;
}

/** Height of the sea surface at (x, z) at time t; `amp` 1 is a calm day, ~2.6 a storm. */
export function waveY(x: number, z: number, t: number, amp: number): number {
  return amp * (0.32 * Math.sin(0.085 * x + 1.05 * t) + 0.22 * Math.sin(0.11 * z - 0.9 * t + 1.3) + 0.14 * Math.sin(0.07 * (x + z) + 1.6 * t) + 0.12 * Math.sin(0.23 * x - 0.31 * z + 2.1 * t));
}

const SIZE = 300;
const SEG = 64;
const CELL = SIZE / SEG;

export interface Shoal { x: number; z: number; r: number }

export class Sea {
  readonly mesh: THREE.Mesh;
  amp = 1;
  time = 0;
  private geo: THREE.PlaneGeometry;
  private base: Float32Array;
  private colors: Float32Array;
  private deep = new THREE.Color();
  private crest = new THREE.Color();
  private shallow = new THREE.Color();
  shoals: Shoal[] = [];

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    this.geo.rotateX(-Math.PI / 2);
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    // jitter the grid a little so the facets look hand-made, not a chessboard
    for (let i = 0; i < pos.count; i++) {
      const gx = Math.round(pos.getX(i) / CELL), gz = Math.round(pos.getZ(i) / CELL);
      const h = Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453;
      const j = (h - Math.floor(h) - 0.5) * CELL * 0.45;
      const h2 = Math.sin(gx * 39.346 + gz * 11.135) * 24634.6345;
      const j2 = (h2 - Math.floor(h2) - 0.5) * CELL * 0.45;
      pos.setX(i, pos.getX(i) + j);
      pos.setZ(i, pos.getZ(i) + j2);
    }
    this.base = new Float32Array(pos.array as Float32Array);
    this.colors = new Float32Array(pos.count * 3);
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 45, specular: 0x2e4652 });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.userData.ownMaterial = true;
    this.mesh.userData.ownGeometry = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  setColors(p: Palette): void {
    this.deep.setHex(p.deep);
    this.crest.setHex(p.crest);
    this.shallow.setHex(p.shallow);
  }

  height(x: number, z: number): number {
    return waveY(x, z, this.time, this.amp);
  }

  /** Moves the sheet under the view centre (snapped to the grid) and lays the waves. */
  update(dt: number, cx: number, cz: number): void {
    this.time += dt;
    const ox = Math.round(cx / CELL) * CELL, oz = Math.round(cz / CELL) * CELL;
    this.mesh.position.set(ox, 0, oz);
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array, b = this.base, c = this.colors;
    const amp = this.amp, t = this.time;
    const range = 0.68 * amp + 0.01;
    const sh = this.shoals;
    const dr = this.deep.r, dg = this.deep.g, db = this.deep.b;
    const cr = this.crest.r - dr, cg = this.crest.g - dg, cb = this.crest.b - db;
    for (let i = 0, n = pos.count; i < n; i++) {
      const x = b[i * 3] + ox, z = b[i * 3 + 2] + oz;
      const y = waveY(x, z, t, amp);
      arr[i * 3 + 1] = y;
      let k = Math.max(0, Math.min(1, (y / range + 1) * 0.5));
      k = k * k;
      let r = dr + cr * k, g = dg + cg * k, bb = db + cb * k;
      // shallows: a turquoise band around every island
      let s = 0;
      for (let j = 0; j < sh.length; j++) {
        const dx = x - sh[j].x, dz = z - sh[j].z;
        const d2 = dx * dx + dz * dz, rr = sh[j].r * 1.9;
        if (d2 < rr * rr) s = Math.max(s, 1 - Math.sqrt(d2) / rr);
      }
      if (s > 0) {
        s = Math.min(1, s * 1.6);
        r += (this.shallow.r - r) * s;
        g += (this.shallow.g - g) * s;
        bb += (this.shallow.b - bb) * s;
      }
      c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = bb;
    }
    pos.needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------- sky life

/** Puffy low-poly clouds: one instanced mesh of flat-shaded balls. */
export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  private puffs: { cloud: number; off: THREE.Vector3; s: THREE.Vector3 }[] = [];
  private centres: THREE.Vector3[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene, count = 7) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x404850, transparent: true, opacity: 0.75, depthWrite: false });
    const per = 5;
    this.mesh = new THREE.InstancedMesh(geo, mat, count * per);
    this.mesh.userData.ownMaterial = true;
    this.mesh.userData.ownGeometry = true;
    this.mesh.frustumCulled = false;
    for (let c = 0; c < count; c++) {
      this.centres.push(new THREE.Vector3((Math.random() - 0.5) * 200, 22 + Math.random() * 6, (Math.random() - 0.5) * 200));
      const big = 2 + Math.random() * 1.8;
      for (let p = 0; p < per; p++) {
        const s = big * (p === 0 ? 1 : 0.55 + Math.random() * 0.35);
        this.puffs.push({
          cloud: c,
          off: new THREE.Vector3((p - 2) * big * 0.7 + (Math.random() - 0.5), (Math.random() - 0.3) * big * 0.3, (Math.random() - 0.5) * big * 0.9),
          s: new THREE.Vector3(s * 1.2, s * 0.7, s),
        });
      }
    }
    scene.add(this.mesh);
  }

  setTint(color: number): void {
    (this.mesh.material as THREE.MeshLambertMaterial).color.setHex(color);
  }

  update(dt: number, cx: number, cz: number, wind: number): void {
    for (const c of this.centres) {
      c.x += dt * wind;
      c.z += dt * wind * 0.4;
      // recycle around the view
      if (c.x - cx > 110) c.x -= 220;
      if (c.x - cx < -110) c.x += 220;
      if (c.z - cz > 110) c.z -= 220;
      if (c.z - cz < -110) c.z += 220;
    }
    this.puffs.forEach((p, i) => {
      this.m.compose(this.v.copy(this.centres[p.cloud]).add(p.off), this.q, p.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Seagulls gliding in wide circles and flapping now and then. */
export class Gulls {
  private birds: { root: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; cx: number; cz: number; rad: number; a: number; sp: number; y: number; flap: number }[] = [];

  constructor(scene: THREE.Scene, n = 5) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.4, 0.1, -0.1, 0, 0, -0.25, 1.4, 0.1, -0.1, 2.1, -0.15, -0.35], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0x333333 });
    const tip = new THREE.MeshLambertMaterial({ color: 0x3a3f48, side: THREE.DoubleSide });
    const body = new THREE.ConeGeometry(0.22, 1.2, 5);
    body.rotateX(Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const root = new THREE.Group();
      const b = new THREE.Mesh(body, tip);
      const l = new THREE.Mesh(wing, mat);
      const r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      for (const m of [b, l, r]) m.userData.ownGeometry = true;
      b.userData.ownMaterial = i === 0;
      l.userData.ownMaterial = i === 0;
      root.add(b, l, r);
      root.scale.setScalar(0.55);
      scene.add(root);
      this.birds.push({ root, l, r, cx: 0, cz: 0, rad: 10 + Math.random() * 14, a: Math.random() * 6.28, sp: (0.25 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1), y: 9 + Math.random() * 5, flap: Math.random() * 6 });
    }
  }

  setVisible(v: boolean): void {
    for (const b of this.birds) b.root.visible = v;
  }

  update(dt: number, cx: number, cz: number, t: number): void {
    for (const b of this.birds) {
      // the flock drifts after the ship
      b.cx += (cx - b.cx) * Math.min(1, dt * 0.2);
      b.cz += (cz - b.cz) * Math.min(1, dt * 0.2);
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.rad, z = b.cz + Math.sin(b.a) * b.rad;
      b.root.position.set(x, b.y + Math.sin(t * 0.7 + b.rad) * 0.6, z);
      // face along the circle
      const dir = Math.sign(b.sp);
      b.root.rotation.set(0, Math.atan2(-Math.sin(b.a) * dir, Math.cos(b.a) * dir), dir * 0.25);
      b.flap += dt;
      const flapping = Math.sin(b.flap * 0.6) > 0.3;
      const w = flapping ? Math.sin(t * 11 + b.rad) * 0.55 : 0.08;
      b.l.rotation.z = w;
      b.r.rotation.z = -w;
    }
  }
}

/** Storm rain: line streaks in a box around the view. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private n = 420;
  intensity = 0;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.n * 6);
    for (let i = 0; i < this.n; i++) this.reset(i, 0, 0, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xdde8f0, transparent: true, opacity: 0.55 });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.userData.ownMaterial = true;
    this.lines.userData.ownGeometry = true;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  private reset(i: number, cx: number, cz: number, any: boolean): void {
    const x = cx + (Math.random() - 0.5) * 90, z = cz + (Math.random() - 0.5) * 90;
    const y = any ? Math.random() * 40 : 40;
    const p = this.pos;
    p.set([x, y, z, x + 0.5, y + 2.4, z + 0.2], i * 6);
  }

  update(dt: number, cx: number, cz: number): void {
    this.lines.visible = this.intensity > 0.02;
    if (!this.lines.visible) return;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.55 * this.intensity;
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      const dy = 52 * dt, dx = 10 * dt;
      p[o] -= dx; p[o + 3] -= dx;
      p[o + 1] -= dy; p[o + 4] -= dy;
      if (p[o + 1] < 0) this.reset(i, cx, cz, false);
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
