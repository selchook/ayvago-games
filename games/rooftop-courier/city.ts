// Rooftop Courier: the city in 3D. Every block of the course becomes one chunk: the courier's
// building (brick, plaster or metal panels, with windows that light up at night, doors and
// garages at street level, a parapet round the roof), whatever links it to the previous roof
// (fire escape, scaffolding, awning, zip-line cable and its poles, beam or plank bridge, kicker
// slant), its rooftop clutter, the alley below (asphalt, parked trucks, dumpsters, lamps) and the
// neighbours on both sides with their side streets and trees. A chunk is merged into two meshes
// (one kit material) plus its cable, and is dropped (geometry freed) once the courier is past.
// The far skyline (other Kenney city kits) is one strip that hops forward as the run goes on.
import { THREE } from '@core/three';
import { KitBatch, mergeModels, skyKey, SKYLINE, type KitModel, type Mats, type SkyKit } from './kit';
import { Rng, HW, TILE, STOREY, type Theme } from './defs';
import { OBSTACLE, OVER_Y, type Block, type Box, type Course, type Zip } from './course';

type RGB = [number, number, number];
const WHITE: RGB = [1, 1, 1];
/** Facings (rotation round y) of a kit block's window side (its local −z). */
const FACE_PZ = Math.PI, FACE_PX = -Math.PI / 2, FACE_NX = Math.PI / 2;

/** Plaster colours of the market's painted houses, awning colours. */
const PLASTER: RGB[] = [[1.05, 0.82, 0.78], [1.0, 0.95, 0.72], [0.8, 0.98, 0.86], [0.85, 0.88, 1.05], [1.05, 0.9, 0.7]];
/** Each district's roof surface over the kit's concrete tops. */
const ROOF: Partial<Record<Theme, { tex: 'tiles' | 'roof_plates' | 'dirt' | 'concrete'; tint: RGB; tile: number }>> = {
  market: { tex: 'tiles', tint: [1.08, 0.92, 0.82], tile: 2 },
  site: { tex: 'dirt', tint: [0.95, 0.9, 0.85], tile: 4 },
  factory: { tex: 'roof_plates', tint: [0.85, 0.85, 0.9], tile: 3 },
};
const AWNING: RGB[] = [[2.7, 0.9, 0.75], [0.9, 2.3, 1.2], [0.95, 1.4, 2.7], [2.7, 2.1, 0.8], [2.4, 1.0, 2.0]];

export interface Chunk {
  block: number; group: THREE.Group; lamps: THREE.Vector3[]; stacks: THREE.Vector3[]; s1: number;
  /** The overhead pieces (beams, cables, scaffold decks, festoon lights): their own meshes, which fade. */
  over: { meshes: THREE.Mesh[]; s0: number; s1: number; k: number } | null;
}

export interface CityMats {
  opaque: THREE.Material; cut: THREE.Material; cable: THREE.Material;
  /** Fresh see-through-capable twins of the kit material, one pair per chunk's overhead pieces. */
  fadeable: () => { opaque: THREE.Material; cut: THREE.Material };
}

export class City {
  readonly root = new THREE.Group();
  private chunks: Chunk[] = [];
  private built = new Set<number>();
  private overPut: Put | null = null;
  private overSpan: [number, number] = [Infinity, -Infinity];

  constructor(private course: Course, private mats: CityMats) {}

  /** Builds chunks for new blocks and drops the ones far behind. */
  update(behind: number): void {
    // the blocks near the courier at once, the far ones one per frame (no long first frame)
    let far = 0;
    for (const b of this.course.blocks) {
      if (this.built.has(b.i)) continue;
      if (b.s0 > behind + 80 && far++ > 0) break;
      this.built.add(b.i);
      this.chunks.push(this.build(b));
    }
    this.chunks.sort((a, b) => a.s1 - b.s1);
    while (this.chunks.length && this.chunks[0].s1 < behind) {
      const c = this.chunks.shift()!;
      this.root.remove(c.group);
      c.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      for (const m of c.over?.meshes ?? []) (m.material as THREE.Material).dispose();
    }
  }

  /** Street-lamp heads in the live chunks (their glow comes on at dusk). */
  lamps(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const c of this.chunks) out.push(...c.lamps);
    return out;
  }

  /**
   * Fades the overhead pieces that stand between the camera (at s = camS) and just past the
   * courier, so a beam, a cable or a scaffold deck never hides it.
   */
  fadeOver(camS: number, s: number, dt: number): void {
    for (const c of this.chunks) {
      const o = c.over;
      if (!o) continue;
      const between = o.s1 > camS - 0.5 && o.s0 < s + 1.5;
      const want = between ? 0.18 : 1;
      if (Math.abs(o.k - want) < 0.001) continue;
      o.k += Math.sign(want - o.k) * Math.min(Math.abs(want - o.k), dt * 6);
      for (const m of o.meshes) {
        const mat = m.material as THREE.Material;
        const see = o.k < 0.999;
        if (mat.transparent !== see) { mat.transparent = see; mat.depthWrite = !see; }
        mat.opacity = o.k;
      }
    }
  }

  /** Overhead meshes as they are now (the occlusion test skips faded ones). */
  overMeshes(): THREE.Mesh[] { return this.chunks.flatMap((c) => c.over?.meshes ?? []); }

  /** Factory smokestack tops (they smoke). */
  stacks(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const c of this.chunks) out.push(...c.stacks);
    return out;
  }

  get chunkCount(): number { return this.chunks.length; }

  // ------------------------------------------------------------------ one chunk

  private build(b: Block): Chunk {
    const r = new Rng(b.seed);
    const kb = new KitBatch();
    const lamps: THREE.Vector3[] = [];
    const group = new THREE.Group();
    const put = (n: KitModel, x: number, y: number, s: number, rot = 0, sx = TILE, sy = sx, sz = sx, tint: RGB = WHITE, lit = 2) => kb.add(n, x, y, -s, rot, sx, sy, sz, tint, lit);
    const prev = this.course.blocks.find((q) => q.i === b.i - 1) ?? null;
    const tint = b.theme === 'factory' ? [0.92, 0.9, 0.92] as RGB : b.theme === 'site' ? [1, 0.98, 0.94] as RGB : WHITE;
    const wallTint: RGB = b.wall === 'ap' ? r.pick(PLASTER) : tint;
    // overhead pieces go into their own batch: they fade when they come between the camera and the courier
    const ob = new KitBatch();
    const putOver = (n: KitModel, x: number, y: number, s: number, rot = 0, sx = TILE, sy = sx, sz = sx, tint: RGB = WHITE, lit = 2) => ob.add(n, x, y, -s, rot, sx, sy, sz, tint, lit);
    this.overPut = putOver;
    this.overSpan = [Infinity, -Infinity];
    this.building(put, kb, r, b, wallTint, lamps);
    this.alley(put, kb, r, b, prev, lamps);
    const stacks: THREE.Vector3[] = [];
    this.neighbours(put, kb, r, b, prev, lamps, stacks);
    this.link(put, r, b, prev, group);
    for (const box of this.course.boxes) {
      if (box.block !== b.i || box.kind === 'roof') continue;
      if (box.kind === 'over') { this.obstacle(putOver, r, box, b); this.overSpan = [Math.min(this.overSpan[0], box.s0 - 0.5), Math.max(this.overSpan[1], box.s1 + 0.5)]; }
      else this.obstacle(put, r, box, b);
    }
    // roof lamps at the parapet now and then
    if (r.chance(0.5)) {
      const side = r.chance(0.5) ? -1 : 1, s = b.s0 + (b.s1 - b.s0) * r.range(0.3, 0.7);
      put('detail-light-single', side * 4.35, b.y, s, side < 0 ? -Math.PI / 2 : Math.PI / 2, 2.6);
      lamps.push(new THREE.Vector3(side * (4.35 - 0.29), b.y + 2.45, -s));
    }
    kb.build(group, this.mats);
    let over: Chunk['over'] = null;
    if (!ob.empty) {
      const meshes = ob.build(group, this.mats.fadeable(), true);
      over = { meshes, s0: this.overSpan[0], s1: this.overSpan[1], k: 1 };
    }
    this.overPut = null;
    this.root.add(group);
    return { block: b.i, group, lamps, stacks, s1: b.s1, over };
  }

  /** The courier's building: front face, sides, back and the roof. */
  private building(put: Put, kb: KitBatch, r: Rng, b: Block, tint: RGB, lamps: THREE.Vector3[]): void {
    const n = Math.round((b.s1 - b.s0) / TILE);
    const style = b.wall;
    const plain = (style === 'b' ? 'wall-b' : style === 'ap' ? 'wall-a-painted' : 'wall-a') as KitModel;
    const win = (style === 'b' ? 'wall-b-window' : 'wall-a-window') as KitModel;
    const door: KitModel = style === 'b' ? 'wall-b-door' : 'wall-a-door';
    const garage: KitModel = style === 'b' ? 'wall-b-garage' : 'wall-a-garage';
    const winChance = style === 'b' ? 0.45 : 0.62;
    const lit = () => (r.chance(0.7) ? r.range(0.02, 0.92) : 2);
    for (let k = 0; k < b.storeys; k++) {
      const y = k * STOREY;
      const top = k === b.storeys - 1;
      for (let row = 0; row < n; row++) {
        const s = b.s0 + TILE * (row + 0.5);
        for (let col = -1; col <= 1; col++) {
          const x = col * TILE;
          const front = row === 0, back = row === n - 1, edge = col !== 0;
          if (!front && !edge && !top) continue;
          void back;
          // which way the cell's window side faces
          const face = front ? FACE_PZ : edge ? (col > 0 ? FACE_PX : FACE_NX) : FACE_PZ;
          let m: KitModel = plain;
          if (front || edge) {
            if (k === 0 && front) m = col === 0 ? door : r.chance(0.5) ? garage : plain;
            else if (k === 0 && r.chance(0.35)) m = garage;
            else if (r.chance(winChance)) m = win;
          }
          put(m, x, y, s, face, TILE, TILE, TILE, m === win ? WHITE : tint, m === win ? lit() : 2);
        }
      }
    }
    // each district's roof surface and parapet (visual: the courier stays inside it)
    const y = b.y;
    const surf = ROOF[b.theme];
    if (surf) kb.box(surf.tex, -HW + 0.05, y, -b.s1 + 0.02, HW - 0.05, y + 0.025, -b.s0 - 0.02, surf.tint, surf.tile);
    for (let row = 0; row < n; row++) {
      const s = b.s0 + TILE * (row + 0.5);
      for (const side of [-1, 1]) {
        if (b.theme === 'factory') put('wall-fence', side * (HW - 0.1), y, s, Math.PI / 2, TILE, 2, TILE);
        else if (b.theme === 'site') { put('wall-type-a', side * (HW - 0.1), y, s, Math.PI / 2, TILE, 1.2, TILE, tint); if (row % 2 === 0) put('detail-barrier-type-a', side * (HW - 0.3), y + 0.48, s, Math.PI / 2, 2.6); }
        else if (b.theme === 'market') put('wall-type-b', side * (HW - 0.1), y, s, Math.PI / 2, TILE, 1.5, TILE, tint);
        else put('wall-type-a', side * (HW - 0.1), y, s, Math.PI / 2, TILE, 1.5, TILE, tint);
      }
    }
    // market roofs: festoon lights high over the roof (out of reach)
    if (b.theme === 'market' && r.chance(0.6)) {
      const s = b.s0 + (b.s1 - b.s0) * r.range(0.25, 0.75);
      const op = this.overPut!;
      for (const side of [-1, 1]) op('wall-b-column', side * (HW - 0.25), y, s, 0, 0.9, 4.2, 0.9);
      op('detail-cables-type-b', 0, y + 3.7, s, 0, HW * 2, 3, 1);
      this.overSpan = [Math.min(this.overSpan[0], s - 1), Math.max(this.overSpan[1], s + 1)];
      for (let k = -3; k <= 3; k++) lamps.push(new THREE.Vector3(k * 1.25, y + 3.75 - 0.35 * (1 - (k / 3.5) ** 2), -s));
    }
  }

  /** The alley before this block: street, parked trucks, a dumpster, lamps. */
  private alley(put: Put, kb: KitBatch, r: Rng, b: Block, prev: Block | null, lamps: THREE.Vector3[]): void {
    if (!prev || b.gap < 0.5) return;
    const s0 = prev.s1, s1 = b.s0;
    kb.box('asphalt', -16, -0.2, -s1, 16, 0, -s0, WHITE, 6);
    if (b.gap > 3.4) {
      if (r.chance(0.55)) {
        const truck = r.pick(['truck-grey', 'truck-green', 'truck-flat', 'truck-grey-cargo'] as KitModel[]);
        put(truck, r.range(-4, 4), 0, (s0 + s1) / 2, Math.PI / 2 + (r.chance(0.5) ? Math.PI : 0), 3.2);
      } else put(r.chance(0.5) ? 'detail-dumpster-closed' : 'detail-dumpster-open', r.range(-3, 3), 0, s1 - 1.2, 0, 3);
    }
    if (r.chance(0.6)) {
      const side = r.chance(0.5) ? -1 : 1;
      put('detail-light-double', side * 5.2, 0, (s0 + s1) / 2, 0, 4.2);
      lamps.push(new THREE.Vector3(side * 5.2, 3.9, -(s0 + s1) / 2 - 0.85), new THREE.Vector3(side * 5.2, 3.9, -(s0 + s1) / 2 + 0.85));
    }
  }

  /** Lower buildings on both sides of the courier's row, their side streets and trees. */
  private neighbours(put: Put, kb: KitBatch, r: Rng, b: Block, prev: Block | null, lamps: THREE.Vector3[], stacks: THREE.Vector3[]): void {
    const s0 = prev ? prev.s1 : b.s0, s1 = b.s1;
    for (const side of [-1, 1]) {
      const street = r.pick([3, 6, 6, 9]);
      const xin = HW + street;
      // the side street
      kb.box('asphalt', side < 0 ? -xin : HW, -0.2, -s1, side < 0 ? -HW : xin, 0, -s0, WHITE, 6);
      kb.box('tiles', side < 0 ? -xin : xin - 1.4, 0, -s1, side < 0 ? -xin + 1.4 : xin, 0.15, -s0, WHITE, 3);
      // the neighbour: two tiles deep, as long as the block plus its alley, a few storeys lower
      const storeys = Math.max(2, b.storeys - r.int(1, 3));
      const style: Theme = b.theme;
      const metal = style === 'factory' ? r.chance(0.7) : style === 'site' ? r.chance(0.3) : false;
      const painted = !metal && (style === 'market' ? r.chance(0.7) : r.chance(0.2));
      const plain: KitModel = metal ? 'wall-b' : painted ? 'wall-a-painted' : 'wall-a';
      const win: KitModel = metal ? 'wall-b-window' : 'wall-a-window';
      const tint: RGB = painted ? r.pick(PLASTER) : WHITE;
      const n = Math.max(1, Math.floor((s1 - s0) / TILE));
      const inner = side * (xin + TILE / 2);
      const outer = side * (xin + TILE * 1.5);
      const face = side > 0 ? FACE_NX : FACE_PX;
      for (let k = 0; k < storeys; k++) {
        const top = k === storeys - 1;
        for (let row = 0; row < n; row++) {
          const s = s0 + TILE * (row + 0.5);
          const isWin = k > 0 && r.chance(metal ? 0.4 : 0.6);
          put(isWin ? win : plain, inner, k * STOREY, s, face, TILE, TILE, TILE, isWin ? WHITE : tint, isWin && r.chance(0.75) ? r.range(0.0, 0.9) : 2);
          if (top || row === 0) put(plain, outer, k * STOREY, s, face, TILE, TILE, TILE, tint);
        }
      }
      const ty = storeys * STOREY;
      // a pitched roof or a flat one with clutter
      if (!metal && r.chance(0.55)) {
        for (let row = 0; row < n; row++) {
          const s = s0 + TILE * (row + 0.5);
          put('wall-a-roof', side * (xin + TILE), ty, s, Math.PI / 2, TILE, TILE, TILE * 2, WHITE);
        }
      } else if (r.chance(0.5)) {
        put(metal ? 'roof-metal-type-a' : 'roof-metal-poles', inner, ty, s0 + TILE * r.int(0, n - 1) + 1.5, Math.PI / 2, TILE);
      }
      if (style === 'factory' && r.chance(0.55)) {
        const s = s0 + TILE * (r.int(0, n - 1) + 0.5);
        put('wall-a-column', outer, ty, s, 0, 6, r.range(7, 12), 6);
        stacks.push(new THREE.Vector3(outer, ty + 9, -s));
      }
      if (style === 'site' && r.chance(0.5)) {
        const s = s0 + TILE * (r.int(0, Math.max(0, n - 2)) + 0.5);
        for (let k = 0; k < storeys; k++) put('scaffolding-structure', side * (xin - 0.4), k * STOREY, s, 0, TILE * 0.8, TILE, TILE);
      }
      // balconies and awnings on the face towards the courier
      if (storeys >= 3) {
        for (let row = 0; row < n; row++) {
          if (!r.chance(style === 'market' ? 0.45 : 0.25)) continue;
          const s = s0 + TILE * (row + 0.5);
          const k = r.int(1, storeys - 1);
          put('balcony-type-a', side * xin, k * STOREY, s, face + Math.PI, TILE);
        }
      }
      if (style === 'market' && r.chance(0.7)) {
        const s = s0 + TILE * (r.int(0, n - 1) + 0.5);
        put('detail-awning-wide', side * xin, 2.2, s, face + Math.PI, TILE, TILE * 1.2, TILE * 3, r.pick(AWNING));
      }
      // trees and a lamp in the side street
      if (r.chance(0.6)) put(r.pick(['tree-large', 'tree-park-large', 'tree-pine-large'] as KitModel[]), side * (HW + street / 2), 0, s0 + (s1 - s0) * r.range(0.2, 0.8), r.range(0, 6), street >= 6 ? 4 : 3);
      if (r.chance(0.45)) {
        const s = s0 + (s1 - s0) * r.range(0.1, 0.9);
        put('detail-light-single', side * (xin - 0.6), 0, s, side > 0 ? -Math.PI / 2 : Math.PI / 2, 4.2);
        lamps.push(new THREE.Vector3(side * (xin - 0.6 - 0.46), 3.9, -s));
      }
      if (street >= 6 && r.chance(0.35)) put(r.pick(['truck-grey', 'truck-green', 'truck-grey-cargo'] as KitModel[]), side * (HW + street * 0.35), 0, s0 + (s1 - s0) * r.range(0.3, 0.7), r.chance(0.5) ? 0 : Math.PI, 3.2);
      // a second, lower row further out
      const far = side * (xin + TILE * 3 + r.range(1, 4));
      const fs = Math.max(1, storeys - r.int(0, 2));
      // (only what shows over the nearer neighbour: its first row and its top two storeys)
      for (let k = 0; k < fs; k++) for (let row = 0; row < n; row += 1) {
        if (row > 0 && k < fs - 2) continue;
        const s = s0 + TILE * (row + 0.5);
        put(k > 0 && r.chance(0.45) ? win : plain, far, k * STOREY, s, face, TILE, TILE, TILE, tint, r.chance(0.5) ? r.range(0, 0.9) : 2);
      }
    }
  }

  /** What links this block to the previous one. */
  private link(put: Put, r: Rng, b: Block, prev: Block | null, group: THREE.Group): void {
    if (!prev) return;
    const f = b.feature;
    switch (b.link) {
      case 'ladder': {
        if (!f) break;
        const cx = (f.x0 + f.x1) / 2;
        // a fire escape up the face: a stair flight per storey, a landing at the top
        const from = Math.max(0, Math.floor((prev.y - STOREY) / STOREY));
        for (let k = from; k < b.storeys; k++) {
          const y = k * STOREY;
          put(k === b.storeys - 1 ? 'balcony-ladder-top' : 'balcony-ladder-bottom', cx, y + (k === b.storeys - 1 ? STOREY - 0.84 : 0.85), b.s0 - 0.45, FACE_PZ + Math.PI, TILE);
        }
        put('balcony-type-a', cx, b.y - 0.84, b.s0 - 0.45, FACE_PZ + Math.PI, TILE);
        break;
      }
      case 'scaffold': {
        if (!f) break;
        for (let x = f.x0 + TILE / 2; x < f.x1; x += TILE) {
          for (let k = 0; k < b.storeys; k++) put('scaffolding-structure', x, k * STOREY, b.s0 - TILE / 2, 0, TILE);
          put('scaffolding-floor', x, b.y - 0.2, b.s0 - TILE / 2, 0, TILE);
        }
        break;
      }
      case 'awning': {
        const aw = this.course.boxes.find((q) => q.kind === 'awning' && q.block === b.i);
        if (!aw || !f) break;
        const w = aw.x1 - aw.x0, d = aw.s1 - aw.s0;
        put('detail-awning-wide', (aw.x0 + aw.x1) / 2, aw.y1 - 0.28 * 2.2, b.s0, FACE_PZ, w, 2.2, d / 0.3, r.pick(AWNING));
        // the shop under it
        put('wall-a-garage', (aw.x0 + aw.x1) / 2, aw.y1 - STOREY - 0.5, b.s0 - 1.5, FACE_PZ, TILE);
        break;
      }
      case 'zip': {
        const z = this.course.zips.find((q) => q.block === b.i);
        if (z) { this.zipLine(this.overPut!, z, group); this.overSpan = [Math.min(this.overSpan[0], z.sa - 1.5), Math.max(this.overSpan[1], z.sb + 1)]; }
        break;
      }
      case 'beam': case 'plank': {
        const br = this.course.boxes.find((q) => q.kind === 'bridge' && q.block === b.i);
        if (!br) break;
        const cx = (br.x0 + br.x1) / 2, len = br.s1 - br.s0, w = br.x1 - br.x0;
        if (b.link === 'beam') {
          const n = Math.ceil(len / TILE);
          for (let k = 0; k < n; k++) put('detail-beam', cx, br.y0, br.s0 + (k + 0.5) * len / n, 0, w / 0.26, 1.2, len / n);
        } else {
          const n = Math.ceil(len / 3.3);
          for (let k = 0; k < n; k++) put('planks', cx, br.y1 - 0.3, br.s0 + (k + 0.5) * len / n, Math.PI / 2, (len / n) / 1.12, 3, w / 0.58);
        }
        break;
      }
      case 'kicker': {
        const rp = this.course.ramps.find((q) => q.block === prev.i);
        if (!rp) break;
        const m: KitModel = prev.wall === 'b' ? 'wall-b-roof-slant' : 'wall-a-roof-slant';
        for (const x of [-TILE, 0, TILE]) put(m, x, rp.ya, (rp.s0 + rp.s1) / 2, Math.PI / 2, TILE, (rp.yb - rp.ya) / 0.5, TILE);
        break;
      }
    }
  }

  /** A zip-line: a pole on each roof and the cable between them (the kit's cable span and a tube). */
  private zipLine(put: Put, z: Zip, group: THREE.Group): void {
    const a = this.course.blocks.find((q) => q.s1 <= z.sa + 4 && q.s1 >= z.sa) ?? null;
    const b = this.course.blocks.find((q) => q.i === z.block)!;
    const ya = a ? a.y : z.ya - 3.3;
    put('wall-b-column', z.x, ya, z.sa, 0, 1.4, z.ya - ya + 0.2, 1.4);
    put('wall-b-column', z.x, b.y, z.sb, 0, 1.4, z.yb - b.y + 0.2, 1.4);
    put('detail-block', z.x, z.ya - 0.25, z.sa, 0, 1.1, 0.8, 1.1);
    put('detail-block', z.x, z.yb - 0.25, z.sb, 0, 1.1, 0.8, 1.1);
    // the cable: a sagging tube
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const s = z.sa + (z.sb - z.sa) * k / 16;
      pts.push(new THREE.Vector3(z.x, this.course.cableY(z, s) + 0.06, -s));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.055, 5, false), this.mats.cable);
    tube.castShadow = true;
    tube.userData.thin = true;
    group.add(tube);
    // the kit's own cable span along it (seen from the side)
    const n = Math.ceil((z.sb - z.sa) / 4);
    for (let k = 0; k < n; k++) {
      const s = z.sa + (z.sb - z.sa) * (k + 0.5) / n;
      put('detail-cables-type-b', z.x, this.course.cableY(z, s) - 0.25, s, Math.PI / 2, (z.sb - z.sa) / n, 2, 1);
    }
  }

  /** A rooftop obstacle. */
  private obstacle(put: Put, r: Rng, o: Box, b: Block): void {
    const cx = (o.x0 + o.x1) / 2, cs = (o.s0 + o.s1) / 2, w = o.x1 - o.x0, d = o.s1 - o.s0;
    const y = b.y;
    switch (o.look) {
      case 'lowWall': case 'parapet': {
        const n = Math.max(1, Math.round(w / TILE));
        const m: KitModel = r.chance(0.3) ? 'wall-broken-type-a' : 'wall-type-a';
        for (let k = 0; k < n; k++) put(o.look === 'parapet' ? 'wall-type-a' : m, o.x0 + (k + 0.5) * w / n, y, cs, 0, w / n, (o.y1 - o.y0) / 0.4, d / 0.08);
        break;
      }
      case 'fence': {
        const n = Math.max(1, Math.round(w / TILE));
        for (let k = 0; k < n; k++) put('wall-fence', o.x0 + (k + 0.5) * w / n, y, cs, 0, w / n, (o.y1 - o.y0) / 0.5, d / 0.08);
        break;
      }
      case 'barrier': put(r.chance(0.5) ? 'detail-barrier-strong-type-a' : 'detail-barrier-strong-type-b', cx, y, cs, 0, w / 0.66, (o.y1 - o.y0) / 0.33, d / 0.24); break;
      case 'pallets': {
        put('pallet', cx, y, cs, 0, w, 3, d);
        put('pallet', cx, y + 0.45, cs, 0.1, w * 0.95, 3, d * 0.95);
        break;
      }
      case 'crate': put('detail-block', cx, y, cs, 0, w / 0.5, (o.y1 - o.y0) / 0.5, d / 0.5, [1.15, 0.9, 0.65]); break;
      case 'block': put('detail-block', cx, y, cs, r.range(-0.2, 0.2), w / 0.5, (o.y1 - o.y0) / 0.5, d / 0.5); break;
      case 'dumpster': put(r.chance(0.5) ? 'detail-dumpster-closed' : 'detail-dumpster-open', cx, y, cs, r.chance(0.5) ? 0 : Math.PI, w / 0.6, (o.y1 - o.y0) / 0.54, d / 0.45); break;
      case 'chimney': {
        put(b.theme === 'factory' ? 'wall-b-column' : 'wall-a-column', cx, y, cs, 0, w / 0.26, (o.y1 - o.y0), d / 0.26);
        put('detail-block', cx, o.y1, cs, 0, w / 0.5 * 1.1, 0.4, d / 0.5 * 1.1);
        break;
      }
      case 'stack': {
        put('pallet', cx, y, cs, 0, w, 3, d);
        put('detail-block', cx - w * 0.2, y + 0.45, cs, 0.2, (w * 0.55) / 0.5, 1.75 / 0.5, (d * 0.7) / 0.5, [1.15, 0.9, 0.65]);
        put('detail-block', cx + w * 0.25, y + 0.45, cs, -0.1, (w * 0.4) / 0.5, 1.1 / 0.5, (d * 0.6) / 0.5, [1.1, 0.85, 0.6]);
        break;
      }
      case 'tank': {
        put('wall-b', cx, y, cs, FACE_PZ, w, (o.y1 - o.y0) * 0.8, d);
        put('roof-metal-type-a', cx, y + (o.y1 - o.y0) * 0.8, cs, 0, w / 1.14, ((o.y1 - o.y0) * 0.2) / 0.5, d);
        break;
      }
      case 'overBeam': {
        put('detail-beam', 0, o.y0, cs, Math.PI / 2, 3, (o.y1 - o.y0) / 0.25, w);
        for (const side of [-1, 1]) put('wall-b-column', side * (HW - 0.35), y, cs, 0, 1.5, o.y1 - y, 1.5);
        break;
      }
      case 'overCable': {
        for (const side of [-1, 1]) put('wall-b-column', side * (HW - 0.3), y, cs, 0, 1.2, o.y1 - y + 0.5, 1.2);
        put('detail-cables-type-a', 0, o.y0 - 0.25, cs, 0, w, 3, 1);
        put('detail-cables-type-b', 0, o.y0 + 0.15, cs + 0.05, 0, w, 3, 1);
        break;
      }
      case 'overScaf': {
        put('scaffolding-poles', 0, y, cs, 0, w, o.y0 - y + 0.05, d);
        put('scaffolding-floor', 0, o.y0, cs, 0, w, (o.y1 - o.y0) / 0.07, d);
        break;
      }
      default: break;
    }
    void OBSTACLE; void OVER_Y;
  }
}

type Put = (n: KitModel, x: number, y: number, s: number, rot?: number, sx?: number, sy?: number, sz?: number, tint?: RGB, lit?: number) => void;

// ------------------------------------------------------------------ the far skyline

/**
 * Far buildings on both sides: one strip `len` m long, drawn twice end to end; the strip behind the
 * courier hops ahead of the other (out of sight) as the run goes on.
 */
export class Skyline {
  readonly group = new THREE.Group();
  private strips: THREE.Group[] = [];

  constructor(mats: Mats, seed: number, readonly len = 260) {
    const r = new Rng(seed);
    const items: { key: string; matrix: THREE.Matrix4 }[] = [];
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    // the near ring: low-detail blocks and a few chimneys; the far ring: towers against the sky.
    // Both stay cheap (the low-detail models are about 150 triangles; towers are rationed)
    const LOW: [SkyKit, string][] = [['com', 'low-detail-building-a'], ['com', 'low-detail-building-c'], ['com', 'low-detail-building-wide-a'], ['ind', 'building-h'], ['ind', 'building-k'], ['ind', 'chimney-large'], ['ind', 'chimney-medium']];
    const TALL: [SkyKit, string][] = [['com', 'building-skyscraper-a'], ['com', 'building-skyscraper-b'], ['com', 'building-skyscraper-c'], ['com', 'low-detail-building-a'], ['com', 'low-detail-building-wide-a'], ['com', 'low-detail-building-c']];
    let towers = 0;
    for (const side of [-1, 1]) {
      for (const ring of [0, 1]) {
        let s = 0;
        while (s < len) {
          let [kit, name] = r.pick(ring === 0 ? LOW : TALL);
          if (name.startsWith('building-skyscraper') && towers >= 6) [kit, name] = ['com', 'low-detail-building-a'];
          if (name.startsWith('building-skyscraper')) towers++;
          const chim = name.startsWith('chimney');
          const sc = chim ? r.range(10, 14) : kit === 'ind' ? r.range(12, 16) : name.startsWith('building-skyscraper') ? r.range(18, 24) : r.range(16, 24);
          const x = side * (ring === 0 ? r.range(38, 54) : r.range(70, 100));
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x, ring === 0 ? -2 : -8, -s), q.setFromAxisAngle(up, r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2])), new THREE.Vector3(sc, sc * (ring === 0 ? 1.1 : 1.5), sc));
          items.push({ key: skyKey(kit, name), matrix: m });
          s += r.range(16, 26) * (ring === 0 ? 1 : 1.3);
        }
      }
    }
    const a = new THREE.Group();
    mergeModels(items, mats, a, new THREE.Color(0.86, 0.8, 0.86));
    const b = new THREE.Group();
    for (const c of a.children) { const m = c as THREE.Mesh; b.add(new THREE.Mesh(m.geometry, m.material)); }
    a.position.z = 40;
    b.position.z = 40 - len;
    this.strips = [a, b];
    this.group.add(a, b);
  }

  /** Keeps the strips round the courier. */
  follow(s: number): void {
    for (const st of this.strips) {
      const start = -st.position.z;
      if (start + this.len < s - 60) st.position.z -= this.len * 2;
    }
  }
}
