// The arena ground: a height grid shaped around the track (bed, berms, humps, ramps, mud pits
// and puddles), drawn as one vertex-coloured mesh. Physics reads the same grid, so the trucks
// ride exactly on what the player sees.
import { THREE } from '@core/three';
import { ARENA, type Feature, type Track } from './tracks';

export const SURF_DIRT = 0;
export const SURF_MUD = 1;
export const SURF_PUDDLE = 2;
export const SURF_BERM = 3;
export const SURF_GRASS = 4;

/** Height of the berm crest and of the outfield. */
const BERM = 0.85;
const OUT = 0.28;
const RAMP_H = 1.35;
const RAMP_UP = 3.6;
const RAMP_DOWN = 2.8;
const HUMP_H = 0.55;
const HUMP_LEN = 4.6;

const GX0 = -42, GX1 = 42, GZ0 = -28, GZ1 = 26, STEP = 0.5;

// ---------------------------------------------------------------- noise

function hash(x: number, z: number, seed: number): number {
  let h = (x * 374761393 + z * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise in 0..1. */
export function noise2(x: number, z: number, seed = 1): number {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export interface Puddle { x: number; z: number; r: number }

export class Terrain {
  readonly nx = Math.round((GX1 - GX0) / STEP) + 1;
  readonly nz = Math.round((GZ1 - GZ0) / STEP) + 1;
  readonly h: Float32Array;
  readonly surf: Uint8Array;
  readonly col: Float32Array;
  readonly puddles: Puddle[] = [];
  /** Ramp crests (for trackside pylons). */
  readonly ramps: { x: number; z: number; tx: number; tz: number }[] = [];

  constructor(private track: Track, seed: number) {
    const n = this.nx * this.nz;
    this.h = new Float32Array(n);
    this.surf = new Uint8Array(n);
    this.col = new Float32Array(n * 3);
    const L = track.length, hw = track.half;
    const crestIn = hw + 0.6, crestOut = hw + 1.8, foot = hw + 3.6;
    const feats = track.layout.features.map((f) => ({ ...f, s: f.at * L }));
    for (const f of feats) {
      if (f.kind === 'puddle') {
        const p = track.pointAt(f.s, (f.side ?? 0) * hw);
        this.puddles.push({ x: p.x, z: p.z, r: 2.1 });
      }
      if (f.kind === 'ramp') this.ramps.push(track.pointAt(f.s));
    }
    const grass = new THREE.Color(track.layout.grass);
    const dry = new THREE.Color(0xb7b25a);
    const dirt = new THREE.Color(0xc99866);
    const rut = new THREE.Color(0xa87a4f);
    const bermTop = new THREE.Color(0xb07446);
    const bermSide = new THREE.Color(0x8f5b36);
    const mud = new THREE.Color(0x6e4826);
    const mudWet = new THREE.Color(0x3e2512);
    const glint = new THREE.Color(0xa88663);
    const wet = new THREE.Color(0x6e4a2c);
    const humpCol = new THREE.Color(0xe0b47e);
    const plank = new THREE.Color(0xd9a466);
    const plankDark = new THREE.Color(0xb98247);
    const dropCol = new THREE.Color(0x7f5432);
    const c = new THREE.Color();

    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        const x = GX0 + i * STEP, z = GZ0 + j * STEP;
        const gn = noise2(x * 0.35, z * 0.35, seed), fine = noise2(x * 1.7, z * 1.7, seed + 7);
        // the outfield: gentle grass hummocks, flattening towards the edge of the grid
        const edge = Math.min(x - GX0, GX1 - x, z - GZ0, GZ1 - z);
        const edgeK = smooth(edge / 4);
        let h = OUT - 0.1 + (0.1 + (gn - 0.5) * 0.22 + fine * 0.05) * edgeK;
        let s = SURF_GRASS;
        c.copy(grass).lerp(dry, smooth((noise2(x * 0.12, z * 0.12, seed + 3) - 0.45) * 3) * 0.55);
        c.multiplyScalar(0.9 + fine * 0.18);
        const inArena = Math.abs(x) < ARENA.hx + 1 && Math.abs(z) < ARENA.hz + 1;
        if (inArena) {
          const near = track.nearest(x, z);
          const ad = near.dist, d = near.d;
          if (ad < foot) {
            // the berm: up from the track edge, a flat crest, down to the outfield
            let bh: number;
            if (ad <= hw) bh = 0;
            else if (ad < crestIn) bh = BERM * smooth((ad - hw) / (crestIn - hw));
            else if (ad < crestOut) bh = BERM;
            else bh = BERM + (h - BERM) * smooth((ad - crestOut) / (foot - crestOut));
            const fade = ad < hw ? 1 : ad < crestIn ? 1 - (ad - hw) / (crestIn - hw) : 0;
            let fh = 0;
            let fs = -1;
            let mudK = 0;
            let ramp = 0;   // 1 on the ramp's run-up, 2 on its drop
            let hump = 0;
            for (const f of feats) {
              let u = near.s - f.s;
              if (u > L / 2) u -= L;
              if (u < -L / 2) u += L;
              if (f.kind === 'hump' && Math.abs(u) < HUMP_LEN / 2) {
                fh = Math.max(fh, HUMP_H * 0.5 * (1 + Math.cos((2 * Math.PI * u) / HUMP_LEN)));
                hump = Math.max(hump, fh / HUMP_H);
              } else if (f.kind === 'ramp' && u > -RAMP_UP && u < RAMP_DOWN) {
                const r = u < 0 ? Math.pow((u + RAMP_UP) / RAMP_UP, 1.25) : Math.pow(1 - u / RAMP_DOWN, 2);
                fh = Math.max(fh, RAMP_H * r);
                ramp = u < 0 ? (Math.floor((u + RAMP_UP) / 0.6) % 2 ? 1 : 3) : 2;
              } else if (f.kind === 'mud') {
                const len = f.len ?? 6;
                const e = (u / (len / 2)) ** 2 + ((d - (f.side ?? 0) * hw) / (hw * 0.78)) ** 2;
                if (e < 1.3) {
                  fh -= 0.14 * smooth((1.3 - e) / 0.5);
                  // lumpy, churned mud catches the light
                  if (e < 1) fh += (noise2(x * 1.9, z * 1.9, seed + 11) - 0.5) * 0.12 * smooth((1 - e) / 0.3);
                  if (e < 1) fs = SURF_MUD;
                  mudK = Math.max(mudK, smooth((1.25 - e) / 0.4));
                }
              }
            }
            const bed = (fine - 0.5) * 0.04 + fh * fade;
            h = ad <= hw ? bed : Math.max(bh, bed);
            if (ad <= hw + 0.15) {
              s = fs >= 0 && ad < hw ? fs : SURF_DIRT;
              // tyre ruts along the two racing lines
              const ruts = Math.max(0, 1 - Math.abs(Math.abs(d) - hw * 0.38) / 0.7);
              c.copy(dirt).lerp(rut, ruts * 0.45).multiplyScalar(0.92 + gn * 0.1 + fine * 0.06);
              if (hump > 0.05) c.lerp(humpCol, hump * 0.55);
              if (ramp === 1 || ramp === 3) c.copy(ramp === 1 ? plank : plankDark).multiplyScalar(0.94 + fine * 0.1);
              else if (ramp === 2) c.copy(dropCol).multiplyScalar(0.9 + fine * 0.15);
              if (mudK > 0) {
                // churned mud: dark wet hollows, lighter ridges, a few glints of water
                const lump = noise2(x * 1.9, z * 1.9, seed + 11);
                const m = mud.clone().lerp(mudWet, 1 - lump);
                if (fine > 0.82) m.lerp(glint, 0.7);
                c.lerp(m, mudK);
              }
              else if (fh < -0.01) c.lerp(wet, Math.min(1, -fh / 0.1));
            } else if (ad < foot) {
              s = ad < crestOut + 0.5 ? SURF_BERM : SURF_GRASS;
              const t = ad < crestOut ? 0 : smooth((ad - crestOut) / (foot - crestOut));
              const earth = ad < crestIn || ad > crestOut ? bermSide : bermTop;
              const g = c.clone();
              c.copy(earth).multiplyScalar(0.9 + fine * 0.15).lerp(g, t);
            }
          }
          for (const p of this.puddles) {
            const dd = Math.hypot(x - p.x, z - p.z);
            if (dd < p.r + 0.6) {
              h -= 0.12 * smooth((p.r + 0.6 - dd) / 0.8);
              c.lerp(wet, smooth((p.r + 0.6 - dd) / 0.8) * 0.8);
              if (dd < p.r) s = SURF_PUDDLE;
            }
          }
        }
        this.h[k] = h;
        this.surf[k] = s;
        c.toArray(this.col, k * 3);
      }
    }
  }

  heightAt(x: number, z: number): number {
    const fx = Math.min(this.nx - 1.001, Math.max(0, (x - GX0) / STEP));
    const fz = Math.min(this.nz - 1.001, Math.max(0, (z - GZ0) / STEP));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * this.nx + i, H = this.h;
    const a = H[k], b = H[k + 1], c = H[k + this.nx], d = H[k + this.nx + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  surfaceAt(x: number, z: number): number {
    const i = Math.round((x - GX0) / STEP), j = Math.round((z - GZ0) / STEP);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return SURF_GRASS;
    return this.surf[j * this.nx + i];
  }

  /** The ground as one mesh (indexed grid, vertex colours, faceted light). */
  mesh(): THREE.Mesh {
    const { nx, nz } = this;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        pos[k * 3] = GX0 + i * STEP;
        pos[k * 3 + 1] = this.h[k];
        pos[k * 3 + 2] = GZ0 + j * STEP;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        // alternate the diagonal so the facets do not line up in stripes
        if ((i + j) % 2) { idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
        else { idx[p++] = a; idx[p++] = c; idx[p++] = d; idx[p++] = a; idx[p++] = d; idx[p++] = b; }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.userData.ownMaterial = true;
    return m;
  }

  /** Grass beyond the grid, out to the horizon. */
  static outfield(color: number, seed: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(260, 200, 52, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const base = new THREE.Color(color), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      // under the grid the plane hides well below it (puddles and mud pits dip under ground level)
      const arena = Math.abs(x) < ARENA.hx + 3 && Math.abs(z) < ARENA.hz + 3;
      const grid = x > GX0 && x < GX1 && z > GZ0 && z < GZ1;
      pos.setY(i, arena ? -1.5 : grid ? OUT - 0.25 : OUT - 0.1 + noise2(x * 0.1, z * 0.1, seed) * 0.8 * smooth((Math.max(Math.abs(x) - GX1, Math.abs(z) - GZ1 + 4)) / 10));
      c.copy(base).multiplyScalar(0.82 + noise2(x * 0.2, z * 0.2, seed + 5) * 0.2).toArray(cols, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true;
    m.userData.ownMaterial = true;
    return m;
  }
}

export type { Feature };
