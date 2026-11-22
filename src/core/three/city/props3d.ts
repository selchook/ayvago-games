// City generator: the instanced props' meshes, built in code (local space, base at y = 0,
// facing +z): trees (leafy, palm, conifer), street lamps, traffic lights, parked cars and
// shipping containers. Leaves, car paint and containers take the instance colour.
import * as THREE from 'three';
import { GeoBuf, lin, type K4 } from './geobuf';
import { K } from './materials';
import type { InstKind } from './build';

function blob(buf: GeoBuf, cx: number, cy: number, cz: number, r: number, sy: number, rgb: [number, number, number], k: K4, detail = 0): void {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const v = (j: number) => [cx + p.getX(i + j), cy + p.getY(i + j) * sy, cz + p.getZ(i + j)];
    const a = v(0), b = v(1), c = v(2);
    buf.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], rgb, k);
  }
  g.dispose();
}

/** Both faces of a thin quad (leaves). */
function leaf(buf: GeoBuf, a: number[], b: number[], c: number[], d: number[], rgb: [number, number, number], k: K4): void {
  buf.quad(a, b, c, d, rgb, k);
  buf.quad(d, c, b, a, rgb, k);
}

export function propGeometry(kind: InstKind): GeoBuf {
  const buf = new GeoBuf();
  const plain: K4 = [K.plain, 0, 0, 0];
  const leaves: K4 = [K.leaves, 0, 0, 0];
  switch (kind) {
    case 'tree':
      buf.cylinder(0, 0, 0.2, 0.13, 0, 3, 6, lin(0x6b4a32), plain, false);
      blob(buf, 0, 4.4, 0, 2.3, 0.85, lin(0x4f8a3a), leaves, 0);
      blob(buf, 0.2, 4.9, 0.3, 1.9, 0.8, lin(0x4b8538), leaves, 0);
      blob(buf, 0.7, 5.6, -0.4, 1.5, 0.9, lin(0x5a9640), leaves, 0);
      blob(buf, -0.8, 5.0, 0.6, 1.4, 0.9, lin(0x467f34), leaves, 0);
      break;
    case 'conifer':
      buf.cylinder(0, 0, 0.18, 0.12, 0, 1.6, 6, lin(0x5b3f2a), plain, false);
      buf.cylinder(0, 0, 2.2, 0.0, 1.2, 4.6, 7, lin(0x2f6a3a), leaves);
      buf.cylinder(0, 0, 1.7, 0.0, 3.2, 6.4, 7, lin(0x2c6236), leaves);
      buf.cylinder(0, 0, 1.2, 0.0, 5.0, 8.0, 7, lin(0x295a33), leaves);
      break;
    case 'palm': {
      // a gently curved trunk of rings, then fronds drooping round the top
      let x = 0;
      for (let i = 0; i < 6; i++) {
        const y0 = i * 1.2, y1 = y0 + 1.2;
        const nx = 0.05 * (i + 1) * (i + 1) * 0.35;
        const r0 = 0.24 - i * 0.02, r1 = 0.22 - i * 0.02;
        buf.cylinder(x, 0, r0, r1, y0, y1, 6, lin(i % 2 ? 0x8a6a48 : 0x7a5c3e), plain, false);
        x = nx;
      }
      const top = [x, 7.2, 0];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const dx = Math.cos(a), dz = Math.sin(a);
        const px = -dz * 0.45, pz = dx * 0.45;
        const mid = [top[0] + dx * 1.8, top[1] + 0.35, top[2] + dz * 1.8];
        const end = [top[0] + dx * 3.4, top[1] - 1.3, top[2] + dz * 3.4];
        const col = lin(i % 2 ? 0x4f9a3a : 0x5aa844);
        leaf(buf, top, [mid[0] + px, mid[1], mid[2] + pz], mid, [mid[0] - px, mid[1], mid[2] - pz], col, leaves);
        leaf(buf, [mid[0] - px, mid[1], mid[2] - pz], mid, [mid[0] + px, mid[1], mid[2] + pz], end, col, leaves);
      }
      blob(buf, top[0], top[1] - 0.2, top[2], 0.45, 1, lin(0x6b4a2a), plain, 0);
      break;
    }
    case 'lamp': {
      const pole = lin(0x3d4249);
      buf.boxH(0, 0, 0, 0.16, 0.25, 0.16, 0, pole);
      buf.cylinder(0, 0, 0.09, 0.07, 0, 7.25, 6, pole, plain);
      buf.boxH(0, 7.1, 0.9, 0.05, 0.05, 0.95, 0, pole);
      buf.boxH(0, 6.95, 1.75, 0.22, 0.09, 0.42, 0, lin(0x2f3338), plain, true);
      buf.boxH(0, 6.92, 1.75, 0.17, 0.02, 0.34, 0, lin(0xffe2b0), [K.glow, 0.05, 3.2, 0], true);
      break;
    }
    case 'signal': {
      const dark = lin(0x22252a);
      buf.cylinder(0, 0, 0.1, 0.09, 0, 5.6, 6, lin(0x4a4e55), plain);
      buf.boxH(-1.9, 5.45, 0, 1.95, 0.06, 0.06, 0, lin(0x4a4e55));
      for (const hx of [-3.4, 0]) {
        const y0 = hx === 0 ? 2.4 : 4.3;
        buf.boxH(hx, y0, 0, 0.2, 0.55, 0.16, 0, dark, plain, true);
        for (let l = 0; l < 3; l++) {
          const y = y0 + 0.85 - l * 0.33;
          buf.boxH(hx, y - 0.11, 0.17, 0.12, 0.11, 0.02, 0, lin(0xffffff), [K.signal, l, 0, 0]);
        }
      }
      break;
    }
    case 'car': {
      // body, cabin, two axles, a light strip at each end (~60 triangles)
      const paint: K4 = [K.paint, 0, 0, 0];
      buf.boxH(0, 0.32, 0, 0.88, 0.33, 2.1, 0, lin(0xffffff), paint);
      buf.boxH(0, 0.98, -0.15, 0.8, 0.3, 1.15, 0, lin(0x1d2630), [K.plain, 0, 0, 0]);
      for (const z of [1.35, -1.35]) buf.boxH(0, 0, z, 0.9, 0.33, 0.32, 0, lin(0x1a1a1a));
      buf.boxH(0, 0.66, 2.1, 0.78, 0.07, 0.02, 0, lin(0xfff6d8), [K.glow, 0.2, 2.2, 0]);
      buf.boxH(0, 0.68, -2.1, 0.78, 0.06, 0.02, 0, lin(0xff2a1a), [K.glow, 0.15, 1.4, 0]);
      break;
    }
    case 'container':
      buf.boxH(0, 0, 0, 1.22, 1.29, 3.03, 0, lin(0xffffff), [K.metal, 0, 0, 0], true);
      break;
  }
  return buf;
}
