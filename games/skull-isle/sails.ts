// Skull Isle: the crew's sails. The Quaternius ship's own sails are one-sided (they vanish when
// seen from astern, where the sea camera rides), so they are cut out of its mesh and replaced by
// three cloth sails hung on its yards: the fore and main courses and a jib on the forestay. They
// are one small mesh (one draw call) whose vertices are laid out on the CPU every frame: billowed
// by the wind, rippling a little, and furled up to the yards for the three sail settings at sea
// (reefed, half, full), bundled at anchor. Canvas texture: cream sailcloth with seams, a crimson
// band at the foot and a skull and crossbones on the main course.
import { THREE } from '@core/three';
import { canvasTex } from './fx3d';

/** A square sail on its yards, in the ship model's units (the bow is −x). */
interface Square { x: number; top: number; bottom: number; half: number; flare: number; belly: number; u0: number; u1: number }

const FORE: Square = { x: -3.12, top: 5.46, bottom: 3.26, half: 1.5, flare: 0.04, belly: 0.62, u0: 0.5, u1: 1 };
const MAIN: Square = { x: 1.7, top: 7.52, bottom: 3.22, half: 1.95, flare: 0.05, belly: 0.85, u0: 0, u1: 0.5 };
/** The jib: head up the forestay, tack on the bowsprit, clew aft (x, y in model units). */
const JIB = { head: [-3.55, 6.55], tack: [-8.55, 2.3], clew: [-4.75, 2.65] } as const;

/** Where the model's own sails are (x0, x1, y0, y1): their triangles are dropped from the hull. */
const OLD_SAILS = [[-3.8, -2.95, 3.2, 5.6], [0.95, 1.82, 3.15, 7.65]];

const NU = 10, NV = 8, NJ = 7;

/**
 * Drops the ship model's own sails from its merged geometry (grey and dark red triangles inside
 * the sail boxes; the masts, yards and rigging are brown and stay).
 */
export function stripSails(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position'), col = geo.getAttribute('color');
  if (!col || geo.index) return geo;
  const keep: number[] = [];
  const sailColour = (i: number) => {
    const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
    return (Math.abs(r - g) < 0.04 && Math.abs(g - b) < 0.04 && r > 0.45) || (r > 0.15 && g < 0.06 && b < 0.06);
  };
  for (let t = 0; t < pos.count; t += 3) {
    let drop = true;
    for (let k = 0; k < 3 && drop; k++) {
      const i = t + k, x = pos.getX(i), y = pos.getY(i);
      const inBox = OLD_SAILS.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
      drop = inBox && sailColour(i);
    }
    if (!drop) keep.push(t);
  }
  if (keep.length * 3 === pos.count) return geo;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    const n = a.itemSize;
    const arr = new Float32Array(keep.length * 3 * n);
    keep.forEach((t, j) => { for (let k = 0; k < 3 * n; k++) arr[j * 3 * n + k] = a.array[t * n + k]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  out.computeBoundingSphere();
  geo.dispose();
  return out;
}

/** The sailcloth: the main course on the left half, the fore course and jib on the right. */
function sailTexture(): THREE.CanvasTexture {
  return canvasTex('sails', 512, 256, (g) => {
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [x0, skull] of [[0, true], [256, false]] as [number, boolean][]) {
      // cream canvas, a touch darker at the edges and the foot
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#f6ecd4'); gr.addColorStop(0.7, '#efe2c2'); gr.addColorStop(1, '#e2d0a8');
      g.fillStyle = gr;
      g.fillRect(x0, 0, 256, 256);
      // weathering blotches
      for (let i = 0; i < 40; i++) {
        const x = x0 + rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 30;
        const b = g.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, `rgba(150,120,70,${0.05 + rnd() * 0.06})`); b.addColorStop(1, 'rgba(150,120,70,0)');
        g.fillStyle = b;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // vertical cloths and their seams
      for (let i = 1; i < 8; i++) {
        g.fillStyle = 'rgba(120,90,50,0.22)';
        g.fillRect(x0 + i * 32 - 1, 0, 2, 256);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x0 + i * 32 + 1, 0, 1, 256);
      }
      // reef bands near the head
      for (const y of [44, 70]) {
        g.fillStyle = 'rgba(110,80,40,0.28)';
        g.fillRect(x0, y, 256, 3);
        for (let x = 12; x < 256; x += 22) { g.fillStyle = 'rgba(90,60,30,0.55)'; g.fillRect(x0 + x, y - 4, 2, 9); }
      }
      // a crimson band at the foot
      g.fillStyle = '#a3202a';
      g.fillRect(x0, 222, 256, 22);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x0, 240, 256, 4);
      // bolt ropes round the edges
      g.strokeStyle = 'rgba(110,80,40,0.7)';
      g.lineWidth = 5;
      g.strokeRect(x0 + 2.5, 2.5, 251, 251);
      if (skull) {
        const cx = x0 + 128, cy = 132;
        g.fillStyle = '#1c1416';
        // crossbones
        for (const a of [0.7, -0.7]) {
          g.save(); g.translate(cx, cy + 18); g.rotate(a);
          g.fillRect(-58, -7, 116, 14);
          for (const e of [-58, 58]) { g.beginPath(); g.arc(e, -7, 8, 0, Math.PI * 2); g.arc(e, 7, 8, 0, Math.PI * 2); g.fill(); }
          g.restore();
        }
        // the skull
        g.beginPath(); g.ellipse(cx, cy - 8, 34, 32, 0, 0, Math.PI * 2); g.fill();
        g.fillRect(cx - 20, cy + 14, 40, 18);
        g.fillStyle = '#efe2c2';
        g.beginPath(); g.ellipse(cx - 13, cy - 6, 9, 10, 0, 0, Math.PI * 2); g.ellipse(cx + 13, cy - 6, 9, 10, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(cx, cy + 4); g.lineTo(cx - 5, cy + 12); g.lineTo(cx + 5, cy + 12); g.closePath(); g.fill();
        for (let i = -1; i <= 1; i++) g.fillRect(cx + i * 10 - 2, cy + 20, 4, 12);
      }
    }
  });
}

/** The crew's sails: one mesh of three cloths, re-laid every frame. */
export class Sails {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private uv: Float32Array;
  private furl = 1;
  private furlTo = 1;
  private wind = 0.6;
  private t = Math.random() * 10;

  constructor() {
    const sq = (NU + 1) * (NV + 1);
    const nv = sq * 2 + (NJ + 1) * (NJ + 2) / 2;
    this.pos = new Float32Array(nv * 3);
    this.uv = new Float32Array(nv * 2);
    const idx: number[] = [];
    for (let s = 0; s < 2; s++) {
      const b = s * sq;
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = b + j * (NU + 1) + i;
        idx.push(a, a + NU + 1, a + 1, a + 1, a + NU + 1, a + NU + 2);
      }
    }
    // the jib: a triangle of rows, row r has r + 1 points
    const jb = sq * 2;
    const row = (r: number) => jb + (r * (r + 1)) / 2;
    for (let r = 0; r < NJ; r++) {
      for (let i = 0; i <= r; i++) {
        idx.push(row(r) + i, row(r + 1) + i, row(r + 1) + i + 1);
        if (i < r) idx.push(row(r) + i, row(r + 1) + i + 1, row(r) + i + 1);
      }
    }
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ map: sailTexture(), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.layout();
  }

  /** Canvas set, 0.12 (furled on the yards) to 1 (full); eased towards. */
  setFurl(k: number, now = false): void { this.furlTo = k; if (now) this.furl = k; }

  /** One frame: `wind` 0–1 fills the sails (the ship's speed), `gusty` 0–1 adds flutter (a storm). */
  update(dt: number, wind: number, gusty: number): void {
    this.t += dt;
    this.furl += (this.furlTo - this.furl) * Math.min(1, dt * 2.6);
    this.wind += (wind - this.wind) * Math.min(1, dt * 2);
    this.layout(gusty);
  }

  private layout(gusty = 0): void {
    const P = this.pos, U = this.uv;
    const k = Math.max(0.08, this.furl);
    const slack = 1 - k;
    const fill = (0.35 + 0.65 * this.wind) * (0.3 + 0.7 * k);
    const t = this.t;
    let o = 0;
    for (const s of [FORE, MAIN]) {
      const H = s.top - s.bottom;
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        for (let i = 0; i <= NU; i++) {
          const u = i / NU, c = u * 2 - 1;
          const across = 1 - c * c;
          // the belly: deepest in the middle, held at the yard above and lighter at the foot
          let d = s.belly * fill * across * (Math.sin(Math.PI * (0.1 + v * 0.8)) * 0.85 + 0.15 * v);
          // ripples running down the cloth, more when it is slack or the wind gusts
          d += Math.sin(t * 6.5 + u * 7 + v * 5) * (0.02 + 0.05 * slack + 0.05 * gusty) * across;
          // furled: the cloth gathers into a bundle on the yard
          d += slack * 0.16 * (0.6 + 0.4 * Math.sin(u * Math.PI * 9));
          const y = s.top - H * v * k - slack * 0.12 * across;
          const z = c * s.half * (1 + s.flare * v);
          P[o * 3] = s.x - d - 0.04; P[o * 3 + 1] = y; P[o * 3 + 2] = z;
          U[o * 2] = s.u0 + (s.u1 - s.u0) * u; U[o * 2 + 1] = 1 - (slack + v * k);
          o++;
        }
      }
    }
    // the jib: rows from the head down to the foot (tack to clew)
    const [hx, hy] = JIB.head, [tx, ty] = JIB.tack, [cx, cy] = JIB.clew;
    const jk = Math.max(0.1, Math.min(1, k * 1.15));
    for (let r = 0; r <= NJ; r++) {
      const v = r / NJ;
      for (let i = 0; i <= r; i++) {
        const u = r ? i / r : 0.5;
        // along the foot from the tack (u = 0) to the clew (u = 1), up to the head; a furled jib hugs the stay
        const fx = tx + (cx - tx) * u, fy = ty + (cy - ty) * u;
        let x = hx + (fx - hx) * v, y = hy + (fy - hy) * v;
        const sx = hx + (tx - hx) * v, sy = hy + (ty - hy) * v;
        x = sx + (x - sx) * jk; y = sy + (y - sy) * jk;
        const belly = 0.5 * fill * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) + Math.sin(t * 7 + v * 6) * 0.03 * Math.sin(Math.PI * u);
        P[o * 3] = x; P[o * 3 + 1] = y; P[o * 3 + 2] = belly;
        U[o * 2] = 0.55 + 0.4 * u * v; U[o * 2 + 1] = 0.95 - v * 0.8;
        o++;
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
