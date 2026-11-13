// Kickflip Park: the three parks. Each is built from pieces (Kenney Mini Skate models and our own
// kickers, ledges, banks and roofs); the builder turns every piece into its mesh placement (for the
// view), its ground shape and its rails (for the simulation). A park also has its gaps, its five
// hidden mixtapes, its goals, the autopilot's lines and the scenery around it.
import { makeShape, kickerTop, Terrain, railSegments, type Shape, type Rail, type RailSeg, type Gap, type Surface } from './park';

/** Kenney Mini Skate pieces are one tile: 4 m here. */
export const K = 4;

export type Style = 'concrete' | 'wood' | 'paving' | 'grass' | 'roof' | 'tower' | 'metal' | 'brick';

export interface Piece {
  /** 'm:<model>' (Mini Skate), or our own: 'box', 'kicker', 'bank'. */
  model: string;
  x: number; y: number; z: number;
  rot: number;
  sx: number; sy: number; sz: number;
  style?: Style;
  angle?: number;
  /** Boxes: draw a metal coping on the top edges (ledges). */
  coping?: boolean;
}

export interface Prop {
  /** Kit key prefix (sub, ind, com, road, nat, ms) and model name. */
  kit: 'sub' | 'ind' | 'com' | 'road' | 'nat' | 'ms';
  name: string;
  x: number; y: number; z: number;
  rotY: number;
  s: number;
}

export type GoalKind = 'score' | 'combo' | 'tapes' | 'rail' | 'gap' | 'manual' | 'spin' | 'vert' | 'rails' | 'special';

export interface GoalDef {
  id: string;
  kind: GoalKind;
  n: number;
  tag?: string;
}

export type BotAct = 'ollie' | 'grind' | 'manual' | 'big' | 'none';
export interface Waypoint { x: number; z: number; v?: number; act?: BotAct }

export interface Look {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: Style;
  sun: number;
  hemiSky: number;
  hemiGround: number;
}

export interface ParkDef {
  id: ParkId;
  index: number;
  pieces: Piece[];
  props: Prop[];
  terrain: Terrain;
  rails: Rail[];
  segs: RailSeg[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Below this the skater fell off (the roofs). */
  fallY: number;
  spawn: { x: number; z: number; heading: number };
  tapes: [number, number, number][];
  gaps: Gap[];
  goals: GoalDef[];
  /** The autopilot's loops through the park. */
  lines: Waypoint[][];
  look: Look;
  /** Where spectators stand (x, y, z, facing). */
  crowd: [number, number, number, number][];
  /** The ground plane's extent (the street under the roofs is drawn separately). */
  floor: { x0: number; x1: number; z0: number; z1: number; y: number } | null;
}

export const PARKS = ['plaza', 'yard', 'roofs'] as const;
export type ParkId = (typeof PARKS)[number];

/** Goals completed in a park that open the next one. */
export const UNLOCK_GOALS = 3;

// ------------------------------------------------------------------ the builder

class Builder {
  pieces: Piece[] = [];
  shapes: Shape[] = [];
  rails: Rail[] = [];
  props: Prop[] = [];
  private n = 0;

  constructor(private baseSurf: Surface) {}

  private piece(p: Piece): void { this.pieces.push(p); }

  /** A quarter pipe (wooden half-pipe.glb or concrete bowl-side.glb), rising towards local −z. */
  qp(x: number, z: number, rot: number, o: { y?: number; wood?: boolean; k?: number } = {}): this {
    const k = o.k ?? K, y = o.y ?? 0;
    this.piece({ model: o.wood ? 'm:half-pipe' : 'm:bowl-side', x, y, z, rot, sx: k, sy: k, sz: k });
    this.shapes.push(makeShape('qp', x, y, z, rot, k, k, k, o.wood ? 'wood' : 'concrete'));
    return this;
  }

  /** A row of quarter pipes along their local x. */
  qps(x: number, z: number, rot: number, count: number, o: { y?: number; wood?: boolean; k?: number } = {}): this {
    const th = rot * Math.PI / 2, k = o.k ?? K;
    for (let i = 0; i < count; i++) {
      const u = (i - (count - 1) / 2) * k;
      this.qp(x + u * Math.cos(th), z - u * Math.sin(th), rot, o);
    }
    return this;
  }

  corner(inner: boolean, x: number, z: number, rot: number, o: { y?: number } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: inner ? 'm:bowl-corner-inner' : 'm:bowl-corner-outer', x, y, z, rot, sx: K, sy: K, sz: K });
    this.shapes.push(makeShape(inner ? 'cornerIn' : 'cornerOut', x, y, z, rot, K, K, K, 'concrete'));
    return this;
  }

  /** Steps rising towards local −z: four steps of `rise` each. */
  steps(x: number, z: number, rot: number, o: { y?: number; rise?: number } = {}): this {
    const y = o.y ?? 0, sy = (o.rise ?? 0.4) / 0.1;
    this.piece({ model: 'm:steps', x, y, z, rot, sx: K, sy, sz: K });
    this.shapes.push(makeShape('steps', x, y, z, rot, K, sy, K, 'concrete'));
    return this;
  }

  /** A hip with a rail on its spine: a cap, `n` middles and a cap, along local z. */
  hip(x: number, z: number, rot: number, n: number, id: string, o: { y?: number; sy?: number; tag?: string } = {}): this {
    const y = o.y ?? 0, sy = o.sy ?? 2;
    const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const at = (v: number) => [x + v * s, z + v * c] as const;
    const half = n * K / 2;
    for (let i = 0; i < n; i++) {
      const v = -half + K / 2 + i * K;
      const [px, pz] = at(v);
      this.piece({ model: 'm:obstacle-middle', x: px, y, z: pz, rot, sx: K, sy, sz: K });
      this.shapes.push(makeShape('hip', px, y, pz, rot, K, sy, K, 'concrete'));
    }
    // the caps: obstacle-end spans model x −1…0, z 0…0.5 (its round side at +z)
    for (const end of [1, -1]) {
      const v = end * half;
      const r2 = end === 1 ? rot : rot + 2;
      const th2 = r2 * Math.PI / 2;
      const [ex, ez] = at(v);
      // model x −0.5 is the hip's middle: shift by +0.5 · K along the cap's own x
      const px = ex + 0.5 * K * Math.cos(th2), pz = ez - 0.5 * K * Math.sin(th2);
      this.piece({ model: 'm:obstacle-end', x: px, y, z: pz, rot: r2, sx: K, sy, sz: K });
      this.shapes.push(makeShape('hipEnd', px, y, pz, r2, K, sy, K, 'concrete'));
    }
    const top = y + 0.55 * sy;
    const [ax, az] = at(-half), [bx, bz] = at(half);
    this.rails.push({ id, kind: 'rail', tag: o.tag, pts: [[ax, top, az], [bx, top, bz]] });
    return this;
  }

  pad(x: number, z: number, o: { y?: number } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: 'm:obstacle-box', x, y, z, rot: 0, sx: K, sy: 2, sz: K });
    this.shapes.push(makeShape('pad', x, y, z, 0, K, 2, K, 'concrete'));
    return this;
  }

  /** A straight rail of `n` rail-low (or rail-high) pieces along local z, centred at x, z. */
  rail(x: number, z: number, rot: number, n: number, id: string, o: { y?: number; high?: boolean; sy?: number; tag?: string; len?: number } = {}): this {
    const y = o.y ?? 0, sy = o.sy ?? 2.4, len = o.len ?? K;
    const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    for (let i = 0; i < n; i++) {
      const v = (i - (n - 1) / 2) * len;
      this.piece({ model: o.high ? 'm:rail-high' : 'm:rail-low', x: x + v * s, y, z: z + v * c, rot, sx: 2.4, sy, sz: len });
    }
    const top = y + (o.high ? 0.45 : 0.25) * sy;
    const half = n * len / 2;
    this.rails.push({ id, kind: 'rail', tag: o.tag, pts: [[x - half * s, top, z - half * c], [x + half * s, top, z + half * c]] });
    return this;
  }

  /** A handrail down a stair (rail-slope rises towards local −z). */
  slopeRail(x: number, z: number, rot: number, id: string, o: { y?: number; sy?: number; tag?: string } = {}): this {
    const y = o.y ?? 0, sy = o.sy ?? 5;
    this.piece({ model: 'm:rail-slope', x, y, z, rot, sx: 2.4, sy, sz: K });
    const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const lo = y + 0.25 * sy, hi = y + 0.45 * sy;
    this.rails.push({ id, kind: 'rail', tag: o.tag, pts: [[x + 0.5 * K * s, lo, z + 0.5 * K * c], [x - 0.5 * K * s, hi, z - 0.5 * K * c]] });
    return this;
  }

  /** A curved rail: rail-curve is a quarter circle (radius 0.55) round model (−0.55, 0.45). */
  curveRail(x: number, z: number, rot: number, id: string, o: { y?: number; k?: number } = {}): this {
    const y = o.y ?? 0, k = o.k ?? 8;
    this.piece({ model: 'm:rail-curve', x, y, z, rot, sx: k, sy: 2.4, sz: k });
    const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI / 2;
      const u = (-0.55 + 0.55 * Math.cos(a)) * k, v = (0.45 + 0.55 * Math.sin(a)) * k;
      pts.push([x + u * c + v * s, y + 0.25 * 2.4, z - u * s + v * c]);
    }
    this.rails.push({ id, kind: 'rail', pts });
    return this;
  }

  /**
   * A flat-topped block w × d, `h` tall, standing on `y`. With `grind` its long top edges (or the
   * listed sides: 'n' −z, 's' +z, 'e' +x, 'w' −x) are ledges.
   */
  box(x: number, z: number, w: number, d: number, h: number, style: Style, o: { y?: number; grind?: string; edges?: string; tag?: string; surf?: Surface } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: 'box', x, y, z, rot: 0, sx: w, sy: h, sz: d, style, coping: !!o.grind });
    const surf: Surface = o.surf ?? (style === 'wood' ? 'wood' : style === 'metal' ? 'metal' : 'concrete');
    this.shapes.push(makeShape('box', x, y, z, 0, w, h, d, surf));
    if (o.grind) {
      const top = y + h, i = 0.08;
      const edges = o.edges ?? (w >= d ? 'ns' : 'ew');
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      for (const e of edges) {
        const id = `${o.grind}-${e}`;
        if (e === 'n') this.rails.push({ id, kind: 'ledge', tag: o.tag, pts: [[x0, top, z0 + i], [x1, top, z0 + i]] });
        if (e === 's') this.rails.push({ id, kind: 'ledge', tag: o.tag, pts: [[x0, top, z1 - i], [x1, top, z1 - i]] });
        if (e === 'w') this.rails.push({ id, kind: 'ledge', tag: o.tag, pts: [[x0 + i, top, z0], [x0 + i, top, z1]] });
        if (e === 'e') this.rails.push({ id, kind: 'ledge', tag: o.tag, pts: [[x1 - i, top, z0], [x1 - i, top, z1]] });
      }
    }
    return this;
  }

  /** A launch ramp of our own: `len` long, rising towards local −z up to `angle` (radians). */
  kicker(x: number, z: number, rot: number, w: number, len: number, angle: number, style: Style, o: { y?: number } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: 'kicker', x, y, z, rot, sx: w, sy: len, sz: len, style, angle });
    this.shapes.push(makeShape('kicker', x, y, z, rot, w, len, len, style === 'wood' ? 'wood' : 'concrete', angle));
    return this;
  }

  /** A straight slope `len` long rising `h` towards local −z. */
  bank(x: number, z: number, rot: number, w: number, len: number, h: number, style: Style, o: { y?: number } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: 'bank', x, y, z, rot, sx: w, sy: h, sz: len, style });
    this.shapes.push(makeShape('bank', x, y, z, rot, w, h, len, style === 'wood' ? 'wood' : 'concrete'));
    return this;
  }

  /** The wooden deck behind a ramp (structure-platform.glb, half a tile deep along local −z). */
  deck(x: number, z: number, rot: number, o: { y?: number } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: 'm:structure-platform', x, y, z, rot, sx: K, sy: K, sz: K });
    this.shapes.push(makeShape('deck', x, y, z, rot, K, K, K, 'wood'));
    return this;
  }

  /** Scenery (no ground shape). */
  prop(kit: Prop['kit'], name: string, x: number, z: number, rotY = 0, s = 1, y = 0): this {
    this.props.push({ kit, name, x, y, z, rotY, s });
    return this;
  }

  /** A Mini Skate model as decoration, optionally solid as a box (pallets, scaffolds). */
  deco(name: string, x: number, z: number, rot: number, k: number, o: { y?: number; solid?: [number, number, number] } = {}): this {
    const y = o.y ?? 0;
    this.piece({ model: 'm:' + name, x, y, z, rot, sx: k, sy: k, sz: k });
    if (o.solid) this.shapes.push(makeShape('box', x, y, z, 0, o.solid[0], o.solid[1], o.solid[2], 'wood'));
    return this;
  }

  uid(p: string): string { return p + (this.n++); }

  finish(base: number): { terrain: Terrain; rails: Rail[]; segs: RailSeg[] } {
    return { terrain: new Terrain(this.shapes, base, this.baseSurf), rails: this.rails, segs: railSegments(this.rails) };
  }
}

// ------------------------------------------------------------------ park 1: Maple Plaza

function plaza(): ParkDef {
  const b = new Builder('concrete');
  // the south bank of quarter pipes, rising south
  b.qps(0, 40.5, 2, 8, { k: 3 });
  // the planter island in the middle, with a kicker either side (the Planter Gap)
  b.box(0, 0, 2.4, 2.4, 0.9, 'grass', { grind: 'planter', edges: 'nsew' });
  b.prop('sub', 'tree-large', 0, 0, 0.4, 7, 0.9);
  b.kicker(0, 7, 0, 3.6, 3.6, 0.68, 'concrete');
  b.kicker(0, -7, 2, 3.6, 3.6, 0.68, 'concrete');
  // the Long Rail on the east side
  b.rail(13, 0, 0, 5, 'longrail', { tag: 'long' });
  // two benches and a hump on the west side
  b.box(-13, -9, 1.3, 9, 0.55, 'concrete', { grind: 'benchA' });
  b.box(-13, 9, 1.3, 9, 0.55, 'concrete', { grind: 'benchB' });
  b.pad(-13, 0);
  // a hip with a rail, south-west
  b.hip(-10, 24, 1, 3, 'hiprail');
  // a kink of curved rail south-east
  b.curveRail(16, 22, 0, 'curve');
  // the raised school terrace in the north: stairs with a handrail, banks up on the sides
  b.box(0, -38, 52, 16, 1.6, 'paving', { grind: 'terrace', edges: 's' });
  b.steps(-4, -28, 0, { rise: 0.4 });
  b.steps(0, -28, 0, { rise: 0.4 });
  b.steps(4, -28, 0, { rise: 0.4 });
  b.slopeRail(0, -28, 0, 'handrail', { sy: 5.2 });
  b.bank(-19, -24, 0, 6, 12, 1.6, 'concrete');
  b.bank(19, -24, 0, 6, 12, 1.6, 'concrete');
  b.qps(0, -44.5, 0, 8, { y: 1.6, k: 3 });
  b.box(0, -38, 14, 1.2, 0.5, 'concrete', { y: 1.6, grind: 'schoolbench' });
  // planters (solid) on the plaza's corners
  for (const [x, z] of [[-20, 6], [20, 6], [-20, 30], [21, 32]] as const) {
    b.box(x, z, 2.4, 2.4, 0.7, 'grass', { grind: b.uid('pl'), edges: 'nsew' });
    b.prop('sub', 'tree-small', x, z, 1.3, 6, 0.7);
  }
  // scenery: the school, houses, fences and trees around
  b.prop('ind', 'building-k', 0, -60, 0, 11);
  b.prop('ind', 'building-p', -30, -58, 0, 10);
  b.prop('ind', 'building-p', 30, -58, 0, 10);
  const houses = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-f', 'building-type-k', 'building-type-m', 'building-type-o'];
  let hi = 0;
  for (let z = -36; z <= 44; z += 16) {
    b.prop('sub', houses[hi++ % houses.length], -40, z, Math.PI / 2, 10);
    b.prop('sub', houses[hi++ % houses.length], 40, z, -Math.PI / 2, 10);
  }
  for (let x = -24; x <= 24; x += 16) b.prop('sub', houses[hi++ % houses.length], x, 62, Math.PI, 10);
  for (let z = -18; z <= 40; z += 8.4) {
    b.prop('sub', 'fence-1x4', -27.2, z, Math.PI / 2, 5);
    b.prop('sub', 'fence-1x4', 27.2, z, Math.PI / 2, 5);
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    b.prop('nat', i % 3 ? 'tree_default' : 'tree_oak', side * (31 + (i % 3)), -30 + i * 6.5, i, 3.2);
  }
  for (let x = -22; x <= 22; x += 11) b.prop('road', 'light-square', x, 45.5, Math.PI, 6);
  const g = b.finish(0);
  return {
    id: 'plaza', index: 0, pieces: b.pieces, props: b.props, ...g,
    bounds: { x0: -26, x1: 26, z0: -46, z1: 42 }, fallY: -20,
    spawn: { x: 0, z: 28, heading: Math.PI },
    tapes: [[0, 2.2, 0], [13, 1.4, -2], [4.5, 4.0, 41.35], [0, 3.2, -28.5], [-10, 1.9, 24]],
    gaps: [
      { id: 'planter', kind: 'jump', pts: 500, a: { x0: -3, x1: 3, z0: 3, z1: 12 }, b: { x0: -6, x1: 6, z0: -14, z1: -1.3 } },
      { id: 'planterBack', kind: 'jump', pts: 500, a: { x0: -3, x1: 3, z0: -12, z1: -3 }, b: { x0: -6, x1: 6, z0: 1.3, z1: 14 } },
      { id: 'stairs', kind: 'jump', pts: 300, a: { x0: -7, x1: 7, z0: -31, z1: -29.6 }, b: { x0: -9, x1: 9, z0: -25.9, z1: -14 } },
      { id: 'terraceDrop', kind: 'jump', pts: 250, a: { x0: -26, x1: 26, z0: -31, z1: -29.5 }, b: { x0: -26, x1: 26, z0: -29.4, z1: -10 } },
      { id: 'hipTransfer', kind: 'jump', pts: 400, a: { x0: -18, x1: -2, z0: 24.3, z1: 27 }, b: { x0: -18, x1: -2, z0: 21, z1: 23.7 } },
      { id: 'hipTransfer', kind: 'jump', pts: 400, a: { x0: -18, x1: -2, z0: 21, z1: 23.7 }, b: { x0: -18, x1: -2, z0: 24.3, z1: 27 } },
    ],
    goals: [
      { id: 'p1s1', kind: 'score', n: 5000 },
      { id: 'p1s2', kind: 'score', n: 18000 },
      { id: 'p1s3', kind: 'score', n: 45000 },
      { id: 'p1combo', kind: 'combo', n: 2000 },
      { id: 'p1tapes', kind: 'tapes', n: 5 },
      { id: 'p1rail', kind: 'rail', n: 1.6, tag: 'long' },
      { id: 'p1manual', kind: 'manual', n: 2.5 },
      { id: 'p1gap', kind: 'gap', n: 0, tag: 'planter' },
    ],
    lines: [
      // over the planter, down the stairs, along the long rail, vert on the south ramps
      [{ x: 0, z: 18, v: 9 }, { x: 0, z: 5.4, act: 'big' }, { x: 0, z: -10 }, { x: -6, z: -18 }, { x: -19, z: -16 }, { x: -19, z: -32 },
        { x: -6, z: -33 }, { x: 0, z: -31, act: 'grind' }, { x: 0, z: -20 }, { x: 8, z: -21 }, { x: 12, z: -17 }, { x: 12.9, z: -13.5 }, { x: 13, z: -10.6, act: 'grind' },
        { x: 13, z: 12 }, { x: 8, z: 26 }, { x: 4, z: 40.6, act: 'big' }, { x: 2, z: 30 }],
      // the benches and the hump, the hip, then vert
      [{ x: -6, z: 26 }, { x: -11, z: 18 }, { x: -12.6, z: 14.5, act: 'grind' }, { x: -13, z: 0, act: 'manual' }, { x: -12.6, z: -4, act: 'grind' },
        { x: -14, z: -16 }, { x: -6, z: -22 }, { x: 0, z: -12 }, { x: 0, z: -5.4, act: 'big' }, { x: 0, z: 10 }, { x: -6, z: 18 },
        { x: -10, z: 21, act: 'ollie' }, { x: -12, z: 30 }, { x: -4, z: 40.6, act: 'big' }, { x: -2, z: 30 }],
    ],
    look: { sky: 0x9fd6ff, fog: 0xbfe2ff, fogNear: 70, fogFar: 170, ground: 'concrete', sun: 0xfff2dc, hemiSky: 0xe8f4ff, hemiGround: 0x8a8070 },
    crowd: [],
    floor: { x0: -90, x1: 90, z0: -100, z1: 100, y: 0 },
  };
}

// ------------------------------------------------------------------ park 2: Timber Yard

function yard(): ParkDef {
  const b = new Builder('wood');
  // the big half-pipe in the north
  b.qps(0, -42, 0, 4, { wood: true });
  b.qps(0, -26, 2, 4, { wood: true });
  for (const x of [-6, -2, 2, 6]) b.deck(x, -24, 2);
  b.box(0, -45, 16, 2, 3.2, 'wood');
  // the bowl in the south-west, open to the east
  const bx = [-20, -16, -12, -8], bz = [24, 28, 32, 36];
  b.corner(true, -20, 24, 0).corner(true, -8, 24, 3).corner(true, -8, 36, 2).corner(true, -20, 36, 1);
  b.qp(-16, 24, 0).qp(-12, 24, 0).qp(-16, 36, 2).qp(-12, 36, 2).qp(-20, 28, 1).qp(-20, 32, 1).qp(-8, 28, 3);
  void bx; void bz;
  // quarter pipes along the east wall
  b.qps(24, 0, 3, 5, { wood: true });
  // the funbox in the middle: kicker up, a table with a rail, a bank down
  b.kicker(0, 7, 0, 5, 3, 0.5, 'wood');
  b.box(0, 1.5, 5, 8, kickerTop(0.5) * 3, 'wood', { grind: 'funbox', edges: 'ew' });
  b.bank(0, -4.5, 2, 5, 4, kickerTop(0.5) * 3, 'wood');
  b.rail(0, 1.5, 0, 2, 'funrail', { y: kickerTop(0.5) * 3, sy: 2, len: 3.2 });
  // a hip with a rail on the west side
  b.hip(-12, -6, 0, 3, 'hip');
  // pallet stacks with a ledge
  b.box(-20, 6, 2.2, 8, 1.1, 'wood', { grind: 'pallets', edges: 'ew' });
  for (let z = 3; z <= 9; z += 2) b.deco('pallet', -20, z, 0, 4.8, { y: 1.1 - 0.62 });
  // a long flat rail and a curved one
  b.rail(10, 24, 0, 4, 'longrail', { sy: 2.4, tag: 'yard' });
  b.curveRail(-2, 16, 1, 'curve', { k: 9 });
  b.kicker(16, 34, 0, 4, 3, 0.62, 'wood');
  // a manual pad
  b.pad(8, 10);
  // scaffolds on the decks
  b.deco('structure-wood', -10, -44.5, 0, 4, {});
  b.deco('structure-wood', 10, -44.5, 0, 4, {});
  // warehouses round the yard
  b.prop('ind', 'building-a', -34, -30, Math.PI / 2, 10);
  b.prop('ind', 'building-s', -36, 10, Math.PI / 2, 10);
  b.prop('ind', 'building-g', -34, 46, Math.PI / 2, 10);
  b.prop('ind', 'building-b', 38, -30, -Math.PI / 2, 10);
  b.prop('ind', 'building-h', 36, 14, -Math.PI / 2, 10);
  b.prop('ind', 'building-p', 36, 46, -Math.PI / 2, 10);
  b.prop('ind', 'building-k', 0, -62, 0, 12);
  b.prop('ind', 'chimney-large', -22, -62, 0, 9);
  b.prop('ind', 'chimney-medium', 24, -60, 0, 10);
  b.prop('ind', 'detail-tank', 30, 52, 0.3, 8);
  b.prop('ind', 'building-s', 0, 64, Math.PI, 10);
  for (let x = -24; x <= 24; x += 12) b.prop('road', 'light-curved', x, -47.5, 0, 6);
  const g = b.finish(0);
  const crowd: [number, number, number, number][] = [];
  for (const x of [-7, -4.5, -1.6, 1.4, 4.2, 7]) crowd.push([x, 3.2, -22.6 + (Math.abs(x) % 2) * 0.4, Math.PI]);
  return {
    id: 'yard', index: 1, pieces: b.pieces, props: b.props, ...g,
    bounds: { x0: -26, x1: 26, z0: -44, z1: 46 }, fallY: -20,
    spawn: { x: 0, z: 30, heading: Math.PI },
    tapes: [[0, 5.2, -43.1], [-14, 4.6, 37.1], [0, 2.4, 1.5], [-12, 2.6, -6], [-20, 2.0, 6]],
    gaps: [
      { id: 'funboxAir', kind: 'over', pts: 600, a: { x0: -2.5, x1: 2.5, z0: -2, z1: 4, y: 2.6 } },
      { id: 'spine', kind: 'jump', pts: 450, a: { x0: -15, x1: -12.4, z0: -14, z1: 2 }, b: { x0: -11.6, x1: -8, z0: -14, z1: 2 } },
      { id: 'spine', kind: 'jump', pts: 450, a: { x0: -11.6, x1: -9, z0: -14, z1: 2 }, b: { x0: -16, x1: -12.4, z0: -14, z1: 2 } },
      { id: 'kickerGap', kind: 'jump', pts: 350, a: { x0: 14, x1: 18, z0: 32, z1: 36 }, b: { x0: 10, x1: 22, z0: 10, z1: 29 } },
    ],
    goals: [
      { id: 'p2s1', kind: 'score', n: 12000 },
      { id: 'p2s2', kind: 'score', n: 35000 },
      { id: 'p2s3', kind: 'score', n: 75000 },
      { id: 'p2combo', kind: 'combo', n: 6000 },
      { id: 'p2tapes', kind: 'tapes', n: 5 },
      { id: 'p2vert', kind: 'vert', n: 2.2 },
      { id: 'p2spin', kind: 'spin', n: 540 },
      { id: 'p2gap', kind: 'gap', n: 0, tag: 'funboxAir' },
    ],
    lines: [
      [{ x: 0, z: 20, v: 9 }, { x: 0, z: 5.7, act: 'big' }, { x: 0, z: -4 }, { x: 0, z: -12 }, { x: 8, z: -14 }, { x: 10, z: -32 },
        { x: 2, z: -34 }, { x: 0, z: -42.6, act: 'big' }, { x: 0, z: -25.4, act: 'big' }, { x: 0, z: -42.6, act: 'big' }, { x: -4, z: -32 },
        { x: -10, z: -20 }, { x: -16, z: -8 }, { x: -13.2, z: -6, act: 'ollie' }, { x: -8, z: 4 }, { x: 4, z: 16 }, { x: 10, z: 18.5, act: 'grind' }, { x: 10, z: 32 }],
      [{ x: 12, z: 6 }, { x: 24.6, z: 2, act: 'big' }, { x: 12, z: 0 }, { x: 8, z: 7, act: 'manual' }, { x: -4, z: 12 }, { x: -9, z: 30, v: 9 }, { x: -20.6, z: 30, act: 'big' },
        { x: -10, z: 30 }, { x: -2, z: 30 }, { x: 16, z: 40 }, { x: 16, z: 32.7, act: 'big' }, { x: 16, z: 18 }],
    ],
    look: { sky: 0xffc98a, fog: 0xf3c9a0, fogNear: 70, fogFar: 160, ground: 'wood', sun: 0xffe2b8, hemiSky: 0xffe8d0, hemiGround: 0x7a5a40 },
    crowd,
    floor: { x0: -90, x1: 90, z0: -100, z1: 100, y: 0 },
  };
}

// ------------------------------------------------------------------ park 3: Skyline Rooftops

function roofs(): ParkDef {
  const b = new Builder('concrete');
  const STREET = -40;
  const roof = (x0: number, x1: number, z0: number, z1: number, top: number) =>
    b.box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, top - STREET, 'tower', { y: STREET, grind: b.uid('edge'), edges: 'ns', surf: 'concrete' });
  // roof A (start), roof B a little lower, roof C lower still, two alleys between
  roof(-14, 14, 14, 46, 0);
  roof(-14, 14, -22, 10, -1.5);
  // roof C around a skylight hole
  roof(-14, 14, -50, -40, -3);
  roof(-14, 14, -36, -26, -3);
  roof(-14, -4, -40, -36, -3);
  roof(4, 14, -40, -36, -3);
  // parapets along the long sides (low walls you can grind)
  for (const [z0, z1, top] of [[14, 46, 0], [-22, 10, -1.5], [-50, -26, -3]] as const) {
    for (const side of [-1, 1]) b.box(side * 13.6, (z0 + z1) / 2, 0.8, z1 - z0, 0.6, 'brick', { y: top, grind: b.uid('par'), edges: 'ew' });
  }
  // plank bridges across the alleys (the long way round)
  b.bank(11, 12, 2, 3, 4, 1.5, 'wood', { y: -1.5 });
  b.bank(-11, -24, 2, 3, 4, 1.5, 'wood', { y: -3 });
  // kickers over the alleys
  b.kicker(-2, 17, 0, 4, 3.2, 0.6, 'metal');
  b.kicker(-2, -19.6, 0, 4, 3.2, 0.6, 'metal', { y: -1.5 });
  // the penthouse on roof A with a bank up and a long rail off its edge
  b.box(-8, 39, 12, 14, 1.8, 'roof', { grind: 'penthouse', edges: 'e' });
  b.bank(-8, 29.5, 2, 6, 5, 1.8, 'concrete');
  b.rail(6, 30, 0, 3, 'roofrail', { high: true });
  b.qps(6, 44, 2, 2);
  // roof B: the Skyline Rail across, AC units, a hump
  b.rail(0, -6, 1, 5, 'skyline', { high: true, y: -1.5, tag: 'sky' });
  b.box(8, -15, 3, 2.2, 1.4, 'metal', { y: -1.5, grind: 'ac1', edges: 'ns' });
  b.box(-8, 2, 3, 2.2, 1.4, 'metal', { y: -1.5, grind: 'ac2', edges: 'ns' });
  b.pad(7, 2, { y: -1.5 });
  // roof C: quarter pipes at the end, a kicker over the skylight
  b.qps(0, -48, 0, 6, { y: -3 });
  b.kicker(0, -31.6, 0, 4, 3, 0.6, 'metal', { y: -3 });
  b.rail(9, -39, 0, 3, 'wellrail', { y: -3, len: 4 });
  // the city: lower blocks round the roofs (their tops below ours), towers further out
  const towers = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c'];
  const mids = ['building-a', 'building-c', 'building-e', 'building-g', 'building-h'];
  let i = 0;
  for (let z = -84; z <= 84; z += 19) {
    b.prop('com', mids[i % 5], -34, z, Math.PI / 2, 19, STREET);
    b.prop('com', mids[(i + 2) % 5], 34, z + 8, -Math.PI / 2, 19, STREET);
    i++;
  }
  for (let z = -120; z <= 120; z += 48) {
    b.prop('com', towers[i++ % 3], -105, z, Math.PI / 2, 17, STREET);
    b.prop('com', towers[i++ % 3], 105, z + 24, -Math.PI / 2, 17, STREET);
  }
  for (let x = -60; x <= 60; x += 40) {
    b.prop('com', towers[i++ % 3], x, -150, 0, 18, STREET);
    b.prop('com', towers[i++ % 3], x + 20, 145, Math.PI, 17, STREET);
  }
  b.prop('ind', 'chimney-medium', 10, 30, 0, 2.2, 0);
  b.prop('ind', 'detail-tank', -10, -46, 0, 4, -3);
  const g = b.finish(STREET);
  return {
    id: 'roofs', index: 2, pieces: b.pieces, props: b.props, ...g,
    bounds: { x0: -15, x1: 15, z0: -50, z1: 46 }, fallY: -7,
    spawn: { x: -2, z: 26, heading: Math.PI },
    tapes: [[-2, 2.0, 12], [0, 0.0, -6], [-2, 0.4, -24], [0, -0.2, -38], [-10, 3.0, 42]],
    gaps: [
      { id: 'alley', kind: 'jump', pts: 700, a: { x0: -14, x1: 14, z0: 14, z1: 20 }, b: { x0: -14, x1: 14, z0: -22, z1: 10 } },
      { id: 'alley2', kind: 'jump', pts: 800, a: { x0: -14, x1: 14, z0: -22, z1: -16 }, b: { x0: -14, x1: 14, z0: -50, z1: -26 } },
      { id: 'skylight', kind: 'over', pts: 900, a: { x0: -4, x1: 4, z0: -40, z1: -36, y: -2.2 } },
      { id: 'penthouseDrop', kind: 'jump', pts: 300, a: { x0: -4, x1: -2.02, z0: 32, z1: 46 }, b: { x0: -1.9, x1: 13, z0: 14, z1: 46 } },
    ],
    goals: [
      { id: 'p3s1', kind: 'score', n: 18000 },
      { id: 'p3s2', kind: 'score', n: 50000 },
      { id: 'p3s3', kind: 'score', n: 110000 },
      { id: 'p3combo', kind: 'combo', n: 10000 },
      { id: 'p3tapes', kind: 'tapes', n: 5 },
      { id: 'p3gap', kind: 'gap', n: 0, tag: 'skylight' },
      { id: 'p3rails', kind: 'rails', n: 3 },
      { id: 'p3special', kind: 'special', n: 1 },
    ],
    lines: [
      [{ x: -2, z: 22, v: 10 }, { x: -2, z: 15.6, act: 'big' }, { x: -2, z: 4 }, { x: -10, z: 0 }, { x: -12.6, z: -3.4 }, { x: -10.6, z: -6, act: 'grind' },
        { x: 11, z: -6 }, { x: 8, z: -11 }, { x: -2, z: -13, v: 10 }, { x: -2, z: -21, act: 'big' }, { x: -1, z: -29 }, { x: 0, z: -33, act: 'big' },
        { x: 0, z: -44 }, { x: 0, z: -48.6, act: 'big' }, { x: 5, z: -46 }, { x: 8.6, z: -44.4, act: 'grind' }, { x: 9, z: -30 }, { x: 4, z: -28.5 },
        { x: -6, z: -28.5 }, { x: -11, z: -27.5 }, { x: -11, z: -20 }, { x: -11, z: -12 }, { x: -8, z: 5 }, { x: 6, z: 6 }, { x: 11, z: 8 }, { x: 11, z: 17 }, { x: 4, z: 24 }],
      [{ x: -8, z: 22 }, { x: -8, z: 29 }, { x: -8, z: 36 }, { x: -7, z: 40 }, { x: -1, z: 40 }, { x: 3, z: 39 }, { x: 6, z: 41 }, { x: 6, z: 43.6, act: 'big' },
        { x: 6, z: 37 }, { x: 6, z: 36.6, act: 'grind' }, { x: 6, z: 22 }, { x: -2, z: 20 }],
    ],
    look: { sky: 0x7fb8ff, fog: 0xc4dcff, fogNear: 70, fogFar: 210, ground: 'roof', sun: 0xfff0e0, hemiSky: 0xe0ecff, hemiGround: 0x5a6070 },
    crowd: [],
    floor: null,
  };
}

const cache = new Map<ParkId, ParkDef>();

export function park(id: ParkId): ParkDef {
  let p = cache.get(id);
  if (!p) {
    p = id === 'plaza' ? plaza() : id === 'yard' ? yard() : roofs();
    cache.set(id, p);
  }
  return p;
}
