// Street Heat: the city of Neon Bay, made the same every time from the block map below. Pure data
// and geometry queries (no three.js): the road graph (intersections, streets with one or two lanes
// each way, traffic lights), the blocks and their buildings, the sidewalks people walk, the street
// lamps, the knockable props, the stunt ramps, the named places of the story, routing (A* on the
// graph), line of sight against the blocks and the static collision grid.
//
// Units are metres; x runs east, z south; a heading h faces (sin h, cos h). Streets run along
// the lines x = i * PITCH and z = j * PITCH (i, j = 0 … NB); block (bx, bz) sits between them.

export const PITCH = 64;
export const NB = 8;
export const SIZE = PITCH * NB;
export const LANE = 3.6;
export const SIDEWALK = 3.6;
export const CURB = 0.15;
/** Streets with two lanes each way (both axes). */
const AVENUES = new Set([0, 4, 8]);

/** The street's half width (asphalt) on line i. */
export const halfWidth = (i: number): number => (AVENUES.has(i) ? 2 : 1) * LANE + 0.3;
export const lanesOn = (i: number): number => (AVENUES.has(i) ? 2 : 1);

/**
 * The block map, north (z = 0) to south. O old town rows, B old town with an alley, D downtown,
 * A downtown with an alley, P park (two blocks joined), X City Hall plaza, L parking lot, S stunt
 * yard, K docks, G the garage (safehouse), C the precinct, R the spray shop, T the train station.
 */
const MAP = [
  'OOBODDAD',
  'OGOODXDD',
  'BOOADDDC',
  'PPOOADLD',
  'OOSODDDR',
  'OBOOADTD',
  'OOOLDDDD',
  'KKOODKKK',
];
export type BlockType = 'O' | 'B' | 'D' | 'A' | 'P' | 'X' | 'L' | 'S' | 'K' | 'G' | 'C' | 'R' | 'T' | 'edge';

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Building { key: string; x: number; z: number; rot: number; s: number; sx?: number; sy?: number; tint?: number; box: Rect; h: number; color: number }
export interface Prop { kind: PropKind; x: number; z: number; rot: number }
export type PropKind = 'cone' | 'bin' | 'hydrant' | 'sign' | 'paper' | 'bench' | 'barrier';
export interface Tree { x: number; z: number; key: string; s: number }
export interface Block { bx: number; bz: number; type: BlockType; inner: Rect; walk: Rect; solid: Rect[]; buildings: Building[]; alley: Rect | null; ground: 'pave' | 'grass' | 'asphalt' | 'dirt' }
export interface Node { id: number; i: number; j: number; x: number; z: number; edges: number[]; light: boolean; phase: number }
export interface Edge { id: number; a: number; b: number; horizontal: boolean; line: number; lanes: number; len: number }
export interface Ramp { x: number; z: number; rot: number; w: number; len: number; h: number }
/** A spot by the curb: in front of a block side, in the right lane of the street (for markers). */
export interface Spot { x: number; z: number; h: number; edge: number; block: number; side: number; name?: Place }
export type Place = 'garage' | 'precinct' | 'spray' | 'plaza' | 'park' | 'stunt' | 'docks' | 'station' | 'bank' | 'diner' | 'hotel' | 'market' | 'parking' | 'tower' | 'gallery' | 'warehouse';

/** Static obstacle: a box (buildings, block cores, walls) or a circle (poles, trees). */
export interface Collider { kind: 'box'; r: Rect; hard: number }
export interface Circle { x: number; z: number; r: number }

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Downtown buildings: key, footprint (w along the front, d deep), height. */
const DOWNTOWN = [
  { key: 'city:Building_Large_2', w: 20.5, d: 16.6, h: 28, color: 0x7a4a3a },
  { key: 'city:Building_Medium_2', w: 14.6, d: 12.6, h: 25, color: 0x8a5a44 },
  { key: 'city:Building_Small_1', w: 12.5, d: 14.3, h: 17, color: 0x9a8a80 },
  { key: 'city:Composed_BrickWalkup', w: 14, d: 14, h: 16, color: 0x8a5a48 },
  { key: 'city:Composed_RedWhite', w: 18, d: 14, h: 19, color: 0x9a7066 },
  { key: 'city:Composed_Office', w: 18, d: 18, h: 25, color: 0x6a6e78 },
  { key: 'city:Composed_Arches', w: 14, d: 14, h: 13, color: 0x9a8070 },
];
/** Old town houses (Buildings Pack). */
const TOWN = [
  { key: 'town:Building1_Large', w: 24, d: 8.2, h: 14, color: 0xa8a28a },
  { key: 'town:Building1_Small', w: 11.2, d: 8.2, h: 14, color: 0xb4ae98 },
  { key: 'town:Building2_Large', w: 17.2, d: 6.7, h: 17.8, color: 0x9aa4b0 },
  { key: 'town:Building2_Small', w: 10.8, d: 7.5, h: 14.9, color: 0x9aa4b0 },
  { key: 'town:Building3_Big', w: 14.1, d: 13.2, h: 17, color: 0x9a5a48 },
  { key: 'town:Building3_Small', w: 9.2, d: 13.2, h: 17, color: 0xa0a4ac },
  { key: 'town:Building4', w: 13.5, d: 11.5, h: 16.5, color: 0xc0c0c4 },
];

export class City {
  readonly nodes: Node[] = [];
  readonly edges: Edge[] = [];
  readonly blocks: Block[] = [];
  readonly props: Prop[] = [];
  readonly trees: Tree[] = [];
  readonly ramps: Ramp[] = [];
  readonly spots: Spot[] = [];
  readonly places = new Map<Place, Spot>();
  /** Street lamps: x, y, z per lamp. */
  lamps = new Float32Array(0);
  /** Lamp posts and traffic light poles (solid circles). */
  readonly poles: Circle[] = [];
  /** Walls along the river and round the city (boxes). */
  readonly walls: Rect[] = [];
  /** Traffic light heads: x, z, facing yaw, node, axis (0 = the light for north-south traffic). */
  readonly signals: { x: number; z: number; rot: number; node: number; ns: boolean }[] = [];
  /** Parked cars: x, z, heading. */
  readonly parked: { x: number; z: number; h: number }[] = [];
  /** Static colliders by grid cell (8 m). */
  private grid = new Map<number, { boxes: Rect[]; circles: Circle[] }>();
  private edgeAt = new Map<string, number>();

  constructor() {
    const rnd = mulberry(1977);
    // ---------------------------------------------------- the graph
    for (let j = 0; j <= NB; j++) for (let i = 0; i <= NB; i++) {
      this.nodes.push({ id: j * (NB + 1) + i, i, j, x: i * PITCH, z: j * PITCH, edges: [], light: false, phase: rnd() * 26 });
    }
    const joined = (bx0: number, bz: number, bx1: number) => MAP[bz]?.[bx0] === 'P' && MAP[bz]?.[bx1] === 'P';
    for (let j = 0; j <= NB; j++) for (let i = 0; i <= NB; i++) {
      // east
      if (i < NB) this.addEdge(this.nid(i, j), this.nid(i + 1, j), true, j);
      // south (none between two park blocks)
      if (j < NB && !(i > 0 && i < NB && joined(i - 1, j, i))) this.addEdge(this.nid(i, j), this.nid(i, j + 1), false, i);
    }
    for (const n of this.nodes) n.light = n.edges.length >= 3;
    // ---------------------------------------------------- blocks
    for (let bz = 0; bz < NB; bz++) for (let bx = 0; bx < NB; bx++) this.blocks.push(this.makeBlock(bx, bz, MAP[bz][bx] as BlockType, rnd));
    this.edgeBlocks(rnd);
    this.streetFurniture(rnd);
    this.makeSpots();
    for (const b of this.blocks) for (const r of b.solid) this.addBox(r);
    for (const w of this.walls) this.addBox(w);
    for (const c of this.poles) this.addCircle(c);
    for (const t of this.trees) this.addCircle({ x: t.x, z: t.z, r: 0.45 });
  }

  nid(i: number, j: number): number { return j * (NB + 1) + i; }

  private addEdge(a: number, b: number, horizontal: boolean, line: number): void {
    const id = this.edges.length;
    const na = this.nodes[a], nb = this.nodes[b];
    this.edges.push({ id, a, b, horizontal, line, lanes: lanesOn(line), len: Math.hypot(nb.x - na.x, nb.z - na.z) });
    na.edges.push(id); nb.edges.push(id);
    this.edgeAt.set(a < b ? `${a}-${b}` : `${b}-${a}`, id);
  }

  edgeBetween(a: number, b: number): Edge | undefined {
    const id = this.edgeAt.get(a < b ? `${a}-${b}` : `${b}-${a}`);
    return id === undefined ? undefined : this.edges[id];
  }

  // ---------------------------------------------------------------- blocks

  /** The block's interior (inside the sidewalks) and the walk loop (sidewalk middle). */
  private rects(bx: number, bz: number): { inner: Rect; walk: Rect } {
    const x0 = bx * PITCH + halfWidth(bx) + SIDEWALK, x1 = (bx + 1) * PITCH - halfWidth(bx + 1) - SIDEWALK;
    const z0 = bz * PITCH + halfWidth(bz) + SIDEWALK, z1 = (bz + 1) * PITCH - halfWidth(bz + 1) - SIDEWALK;
    const h = SIDEWALK / 2;
    return { inner: { x0, z0, x1, z1 }, walk: { x0: x0 - h, z0: z0 - h, x1: x1 + h, z1: z1 + h } };
  }

  private makeBlock(bx: number, bz: number, type: BlockType, rnd: () => number): Block {
    let { inner, walk } = this.rects(bx, bz);
    // two park blocks share one lawn: stretch over the removed street
    if (type === 'P') {
      if (MAP[bz][bx + 1] === 'P') inner = { ...inner, x1: (bx + 1) * PITCH + 1 };
      if (MAP[bz][bx - 1] === 'P') inner = { ...inner, x0: bx * PITCH - 1 };
      walk = { ...walk, x0: Math.min(walk.x0, inner.x0), x1: Math.max(walk.x1, inner.x1) };
    }
    const b: Block = { bx, bz, type, inner, walk, solid: [], buildings: [], alley: null, ground: 'pave' };
    const downtownish = 'DACRT'.includes(type);
    const pool = downtownish ? DOWNTOWN : TOWN;
    switch (type) {
      case 'P': b.ground = 'grass'; this.park(b, rnd); break;
      case 'X': this.plaza(b, rnd); break;
      case 'L': b.ground = 'asphalt'; this.parking(b, rnd); break;
      case 'S': b.ground = 'dirt'; this.stuntYard(b, rnd); break;
      case 'K': b.ground = 'asphalt'; this.docks(b, rnd); break;
      default: {
        const alley = type === 'A' || type === 'B';
        if (alley) {
          const cx = (inner.x0 + inner.x1) / 2;
          b.alley = { x0: cx - 3.2, z0: inner.z0 - SIDEWALK, x1: cx + 3.2, z1: inner.z1 + SIDEWALK };
          this.fillHalf(b, { ...inner, x1: cx - 3.2 }, pool, rnd, downtownish);
          this.fillHalf(b, { ...inner, x0: cx + 3.2 }, pool, rnd, downtownish);
        } else this.fillHalf(b, inner, pool, rnd, downtownish);
      }
    }
    return b;
  }

  /**
   * Buildings round a rectangle, their fronts on its edges: downtown in its corners (one big
   * building per corner, the rest a lower one), old town in rows along the long sides. The
   * rectangle itself is solid (nobody drives into the courtyards).
   */
  private fillHalf(b: Block, r: Rect, pool: typeof DOWNTOWN, rnd: () => number, downtown: boolean): void {
    b.solid.push(r);
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    // four sides: front facing out (rot: the building's +z towards the street)
    const sides = [
      { len: w, rot: Math.PI, at: (u: number, dep: number) => [r.x0 + u, r.z0 + dep] as const, deep: d },       // north side: faces -z
      { len: d, rot: Math.PI / 2, at: (u: number, dep: number) => [r.x1 - dep, r.z0 + u] as const, deep: w },    // east: faces +x
      { len: w, rot: 0, at: (u: number, dep: number) => [r.x1 - u, r.z1 - dep] as const, deep: d },              // south: faces +z
      { len: d, rot: -Math.PI / 2, at: (u: number, dep: number) => [r.x0 + dep, r.z1 - u] as const, deep: w },   // west: faces -x
    ];
    const heightBoost = downtown ? 1 + Math.max(0, 1 - Math.hypot(b.bx - 4.5, b.bz - 3) / 4) * 0.45 : 1;
    sides.forEach((sd, si) => {
      let u = 0;
      // corners belong to the north and south sides (the long run), the east and west fill between
      const start = si % 2 === 1 ? Math.min(sd.deep * 0.45, 15) : 0;
      const end = si % 2 === 1 ? sd.len - start : sd.len;
      u = start;
      while (u < end - 4) {
        const room = end - u;
        const fits = pool.filter((p) => p.w <= room + 2 && p.d <= sd.deep * 0.55 + 1);
        if (!fits.length) break;
        const p = fits[Math.floor(rnd() * fits.length)];
        // stretch a little to fill the run when the next would not fit
        let width = Math.min(p.w, room);
        const left = room - width;
        if (left < 9) width = room;
        const sx = Math.min(1.35, width / p.w);
        const s = downtown ? 1 : 1.0;
        const sy = (downtown ? heightBoost * (0.85 + rnd() * 0.3) : 0.9 + rnd() * 0.2);
        const [fx, fz] = sd.at(u + width / 2, 0);
        // the model's front (its z = 0, facing +z) on the edge, turned to face out
        const rot = sd.rot;
        const tint = downtown ? undefined : [0xffffff, 0xf0e8e0, 0xe8eef8, 0xfff4e4][Math.floor(rnd() * 4)];
        const depth = p.d * s;
        const box = this.footprint(fx, fz, rot, width, depth);
        b.buildings.push({ key: p.key, x: fx, z: fz, rot, s, sx, sy, tint, box, h: p.h * sy, color: p.color });
        u += width + (rnd() < 0.15 ? 2 : 0);
      }
    });
  }

  /** The axis-aligned footprint of a building whose front middle is (x, z), facing yaw rot. */
  private footprint(x: number, z: number, rot: number, w: number, d: number): Rect {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const bx = x - fx * d / 2, bz = z - fz * d / 2;
    const horiz = Math.abs(fz) > 0.5;
    const hw = horiz ? w / 2 : d / 2, hd = horiz ? d / 2 : w / 2;
    return { x0: bx - hw, z0: bz - hd, x1: bx + hw, z1: bz + hd };
  }

  private park(b: Block, rnd: () => number): void {
    const r = b.inner;
    for (let k = 0; k < 34; k++) {
      const x = r.x0 + 3 + rnd() * (r.x1 - r.x0 - 6), z = r.z0 + 3 + rnd() * (r.z1 - r.z0 - 6);
      // keep the middle path and the ramp clear
      if (Math.abs(z - (r.z0 + r.z1) / 2) < 5) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
      this.trees.push({ x, z, key: `nature:CommonTree_${1 + Math.floor(rnd() * 5)}`, s: 1.8 + rnd() * 0.8 });
    }
    if (MAP[b.bz][b.bx + 1] === 'P') {
      // a grassy kicker in the middle of the lawn, along x
      this.ramps.push({ x: b.inner.x1 - 12, z: (r.z0 + r.z1) / 2, rot: Math.PI / 2, w: 6, len: 9, h: 1.6 });
    }
    for (let k = 0; k < 6; k++) this.props.push({ kind: 'bench', x: r.x0 + 6 + k * ((r.x1 - r.x0 - 12) / 5), z: (r.z0 + r.z1) / 2 - 4, rot: 0 });
  }

  private plaza(b: Block, rnd: () => number): void {
    const r = b.inner;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    // City Hall at the back, a monument in the middle, planters round it
    const p = DOWNTOWN[0];
    const box = this.footprint(cx, r.z0 + 17, 0, 20.5, 16.6);
    b.buildings.push({ key: p.key, x: cx, z: r.z0 + 17, rot: 0, s: 1, sx: 1.15, sy: 1.3, box: { ...box, x0: cx - 12, x1: cx + 12 }, h: 36, color: p.color });
    b.solid.push({ x0: cx - 12, z0: r.z0, x1: cx + 12, z1: r.z0 + 17 });
    b.solid.push({ x0: cx - 2.5, z0: cz + 4.5, x1: cx + 2.5, z1: cz + 9.5 });
    for (let k = 0; k < 4; k++) this.props.push({ kind: 'bench', x: cx - 12 + k * 8, z: r.z1 - 3, rot: 0 });
    void rnd;
  }

  private parking(b: Block, rnd: () => number): void {
    const r = b.inner;
    for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) {
      if (rnd() < 0.35) continue;
      const x = r.x0 + 4 + k * ((r.x1 - r.x0 - 8) / 7), z = r.z0 + 7 + row * 15;
      this.parked.push({ x, z, h: rnd() < 0.5 ? 0 : Math.PI });
    }
  }

  private stuntYard(b: Block, rnd: () => number): void {
    const r = b.inner;
    const cz = (r.z0 + r.z1) / 2;
    this.ramps.push({ x: r.x0 + 14, z: cz, rot: Math.PI / 2, w: 7, len: 10, h: 2.4 });
    this.ramps.push({ x: r.x1 - 14, z: cz, rot: -Math.PI / 2, w: 7, len: 10, h: 2.4 });
    for (let k = 0; k < 14; k++) this.props.push({ kind: 'cone', x: r.x0 + 4 + rnd() * (r.x1 - r.x0 - 8), z: r.z0 + 4 + rnd() * (r.z1 - r.z0 - 8), rot: rnd() * 6 });
    for (let k = 0; k < 6; k++) this.props.push({ kind: 'barrier', x: r.x0 + 6 + k * 7, z: r.z0 + 2, rot: 0 });
  }

  private docks(b: Block, rnd: () => number): void {
    const r = b.inner;
    // a warehouse at the back, stacks of containers (solid), a loading ramp
    const p = DOWNTOWN[5];
    const cx = (r.x0 + r.x1) / 2;
    b.buildings.push({ key: p.key, x: cx, z: r.z0 + 18, rot: Math.PI, s: 1, sx: 1.6, sy: 0.55, box: { x0: cx - 14.4, z0: r.z0, x1: cx + 14.4, z1: r.z0 + 18 }, h: 14, color: 0x6a6e78 });
    b.solid.push({ x0: cx - 14.4, z0: r.z0, x1: cx + 14.4, z1: r.z0 + 18 });
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.3) continue;
      const x = r.x0 + 4 + k * 11, z = r.z1 - 9;
      b.solid.push({ x0: x, z0: z, x1: x + 3, z1: z + 7 });
      this.containers.push({ x0: x, z0: z, x1: x + 3, z1: z + 7, h: 2.6 * (1 + Math.floor(rnd() * 2)), color: [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910][k % 4] });
    }
    if (b.bx === 6) this.ramps.push({ x: r.x1 - 6, z: r.z1 - 14, rot: Math.PI, w: 6, len: 9, h: 2 });
  }

  /** Containers at the docks (drawn as boxes): rect, height, colour. */
  readonly containers: (Rect & { h: number; color: number })[] = [];
  /** Buildings outside the streets (the outskirts' wall of facades): drawn, solid, never entered. */
  readonly outskirts: Building[] = [];

  /** The outskirts beyond the ring road (north, east, west) and the river's railing in the south. */
  private edgeBlocks(rnd: () => number): void {
    const out = halfWidth(0) + SIDEWALK;
    const far = 40;
    // north row (faces +z), west and east columns
    const rows: { x0: number; x1: number; z: number; rot: number; horiz: boolean }[] = [
      { x0: -far, x1: SIZE + far, z: -out, rot: 0, horiz: true },
    ];
    for (const row of rows) {
      let u = row.x0;
      while (u < row.x1) {
        const p = DOWNTOWN[Math.floor(rnd() * DOWNTOWN.length)];
        const w = p.w;
        const x = u + w / 2;
        this.outskirts.push({ key: p.key, x, z: row.z, rot: Math.PI, s: 1, sy: 0.9 + rnd() * 0.5, box: { x0: u, z0: row.z - p.d, x1: u + w, z1: row.z }, h: p.h, color: p.color });
        u += w;
      }
    }
    for (const side of [-1, 1]) {
      const x = side < 0 ? -out : SIZE + out;
      let u = -out;
      while (u < SIZE + out) {
        const p = TOWN[Math.floor(rnd() * TOWN.length)];
        const w = p.w;
        const z = u + w / 2;
        this.outskirts.push({ key: p.key, x, z, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, s: 1, sy: 1, box: side < 0 ? { x0: x - p.d, z0: u, x1: x, z1: u + w } : { x0: x, z0: u, x1: x + p.d, z1: u + w }, h: p.h, color: p.color });
        u += w;
      }
    }
    this.walls.push({ x0: -200, z0: -out - 30, x1: SIZE + 200, z1: -out });
    this.walls.push({ x0: -out - 30, z0: -200, x1: -out, z1: SIZE + 200 });
    this.walls.push({ x0: SIZE + out, z0: -200, x1: SIZE + out + 30, z1: SIZE + 200 });
    // the river's railing south of Riverside Drive
    this.walls.push({ x0: -200, z0: SIZE + out, x1: SIZE + 200, z1: SIZE + out + 30 });
  }

  /** Lamps along the curbs, signals at the crossings, hydrants, bins, paper boxes, street trees. */
  private streetFurniture(rnd: () => number): void {
    const lamps: number[] = [];
    for (const b of this.blocks) {
      const w = b.walk;
      const curb = SIDEWALK / 2 - 0.5;
      // along each side: a lamp every ~18 m, a few props
      const sides = [
        { x0: w.x0, z0: w.z0 - curb, x1: w.x1, z1: w.z0 - curb },
        { x0: w.x1 + curb, z0: w.z0, x1: w.x1 + curb, z1: w.z1 },
        { x0: w.x0, z0: w.z1 + curb, x1: w.x1, z1: w.z1 + curb },
        { x0: w.x0 - curb, z0: w.z0, x1: w.x0 - curb, z1: w.z1 },
      ];
      sides.forEach((s, si) => {
        // joined park lawns have no sidewalk between them
        if (b.type === 'P' && ((si === 1 && MAP[b.bz][b.bx + 1] === 'P') || (si === 3 && MAP[b.bz][b.bx - 1] === 'P'))) return;
        const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
        const n = Math.max(2, Math.round(len / 18));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t;
          // the lamp leans over the street (head 2 m out from the pole)
          const ox = si === 1 ? 1 : si === 3 ? -1 : 0, oz = si === 0 ? -1 : si === 2 ? 1 : 0;
          lamps.push(x + ox * 1.6, 6.2, z + oz * 1.6);
          this.poles.push({ x, z, r: 0.22 });
          this.lampPosts.push({ x, z, rot: Math.atan2(ox, oz) });
          if (b.type === 'P' || b.type === 'K') continue;
          const r = rnd();
          const px = x + (s.x1 - s.x0) / n * 0.4, pz = z + (s.z1 - s.z0) / n * 0.4;
          if (r < 0.18) this.props.push({ kind: 'hydrant', x: px, z: pz, rot: 0 });
          else if (r < 0.34) this.props.push({ kind: 'bin', x: px, z: pz, rot: 0 });
          else if (r < 0.42) this.props.push({ kind: 'paper', x: px, z: pz, rot: Math.atan2(ox, oz) });
          else if (r < 0.5 && 'DA'.includes(b.type)) this.trees.push({ x: px, z: pz, key: 'nature:CommonTree_' + (1 + Math.floor(rnd() * 3)), s: 1.2 });
        }
      });
    }
    this.lamps = new Float32Array(lamps);
    // traffic lights: a pole on the near-right corner of each approach
    for (const n of this.nodes) {
      if (!n.light) continue;
      for (const eid of n.edges) {
        const e = this.edges[eid];
        const other = this.nodes[e.a === n.id ? e.b : e.a];
        const dx = Math.sign(other.x - n.x), dz = Math.sign(other.z - n.z);
        // traffic arriving from `other` drives towards n: direction -d; its right side
        const fx = -dx, fz = -dz, rx = -fz, rz = fx;
        const hwCross = halfWidth(e.horizontal ? n.i : n.j);
        const hwOwn = halfWidth(e.horizontal ? n.j : n.i);
        const x = n.x + dx * (hwCross + 1.2) + rx * (hwOwn + 1.0), z = n.z + dz * (hwCross + 1.2) + rz * (hwOwn + 1.0);
        this.signals.push({ x, z, rot: Math.atan2(-fx, -fz), node: n.id, ns: !e.horizontal });
        this.poles.push({ x, z, r: 0.25 });
      }
    }
    // a few cones and barriers by works on random streets
    for (let k = 0; k < 10; k++) {
      const e = this.edges[Math.floor(rnd() * this.edges.length)];
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const t = 0.35 + rnd() * 0.3;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const off = halfWidth(e.line) - 1.2;
      for (let c = 0; c < 3; c++) {
        this.props.push({ kind: 'cone', x: x + (e.horizontal ? c * 2 - 2 : off), z: z + (e.horizontal ? off : c * 2 - 2), rot: 0 });
      }
    }
    // signs at some corners
    for (const n of this.nodes) if (!n.light && n.edges.length >= 2 && rnd() < 0.8) {
      this.props.push({ kind: 'sign', x: n.x + halfWidth(n.i) + 1, z: n.z + halfWidth(n.j) + 1, rot: 0 });
    }
  }

  readonly lampPosts: { x: number; z: number; rot: number }[] = [];

  /** A spot in front of the middle of each block side (and the named places). */
  private makeSpots(): void {
    this.blocks.forEach((b, bi) => {
      const w = b.walk;
      const mids = [
        { x: (w.x0 + w.x1) / 2, z: w.z0 - SIDEWALK / 2, line: b.bz, horiz: true, side: 0 },
        { x: w.x1 + SIDEWALK / 2, z: (w.z0 + w.z1) / 2, line: b.bx + 1, horiz: false, side: 1 },
        { x: (w.x0 + w.x1) / 2, z: w.z1 + SIDEWALK / 2, line: b.bz + 1, horiz: true, side: 2 },
        { x: w.x0 - SIDEWALK / 2, z: (w.z0 + w.z1) / 2, line: b.bx, horiz: false, side: 3 },
      ];
      for (const m of mids) {
        // the right lane next to this curb
        const lanes = lanesOn(m.line);
        const off = 0.3 + (lanes - 0.5) * LANE;
        const lineC = m.line * PITCH;
        const x = m.horiz ? m.x : lineC + Math.sign(m.x - lineC) * off;
        const z = m.horiz ? lineC + Math.sign(m.z - lineC) * off : m.z;
        const e = this.edgeNear(x, z);
        if (!e) continue;
        // heading of the traffic in that lane (right-hand traffic)
        let h: number;
        if (m.horiz) h = z > lineC ? Math.PI / 2 : -Math.PI / 2;
        else h = x > lineC ? Math.PI : 0;
        this.spots.push({ x, z, h, edge: e.id, block: bi, side: m.side });
      }
    });
    const at = (bx: number, bz: number, side: number) => this.spots.find((s) => this.blocks[s.block].bx === bx && this.blocks[s.block].bz === bz && s.side === side)!;
    const name = (p: Place, s: Spot) => { s.name = p; this.places.set(p, s); };
    name('garage', at(1, 1, 2));
    name('precinct', at(7, 2, 3));
    name('spray', at(7, 4, 3));
    name('plaza', at(5, 1, 2));
    name('park', at(0, 3, 2));
    name('stunt', at(2, 4, 0));
    name('docks', at(6, 7, 0));
    name('warehouse', at(0, 7, 0));
    name('station', at(6, 5, 2));
    name('bank', at(4, 2, 1));
    name('diner', at(3, 0, 2));
    name('hotel', at(4, 5, 3));
    name('market', at(2, 5, 0));
    name('parking', at(6, 3, 3));
    name('tower', at(5, 3, 0));
    name('gallery', at(3, 2, 2));
  }

  // ---------------------------------------------------------------- queries

  /** The edge whose street contains (x, z), if any (not inside intersections). */
  edgeNear(x: number, z: number): Edge | null {
    let best: Edge | null = null, bd = Infinity;
    const i = Math.round(x / PITCH), j = Math.round(z / PITCH);
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      if (e.horizontal) {
        if (e.line !== j && Math.abs(e.line - j) > 1) continue;
        const d = Math.abs(z - a.z);
        if (x < Math.min(a.x, b.x) - 4 || x > Math.max(a.x, b.x) + 4) continue;
        if (d < bd) { bd = d; best = e; }
      } else {
        if (e.line !== i && Math.abs(e.line - i) > 1) continue;
        const d = Math.abs(x - a.x);
        if (z < Math.min(a.z, b.z) - 4 || z > Math.max(a.z, b.z) + 4) continue;
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best && bd < halfWidth(best.line) + SIDEWALK + 2 ? best : null;
  }

  /** The node nearest to (x, z). */
  nearestNode(x: number, z: number): Node {
    const i = Math.max(0, Math.min(NB, Math.round(x / PITCH))), j = Math.max(0, Math.min(NB, Math.round(z / PITCH)));
    return this.nodes[this.nid(i, j)];
  }

  /** The block (bx, bz) under a point, or null on a street / outside. */
  blockAt(x: number, z: number): Block | null {
    const bx = Math.floor(x / PITCH), bz = Math.floor(z / PITCH);
    if (bx < 0 || bz < 0 || bx >= NB || bz >= NB) return null;
    const b = this.blocks[bz * NB + bx];
    return b;
  }

  /** Is (x, z) on a sidewalk (or a lawn, a plaza) rather than the asphalt? */
  offRoad(x: number, z: number): boolean {
    const b = this.blockAt(x, z);
    if (!b) return false;
    const w = b.walk, s = SIDEWALK / 2;
    if (x < w.x0 - s || x > w.x1 + s || z < w.z0 - s || z > w.z1 + s) return false;
    if (b.alley && x > b.alley.x0 && x < b.alley.x1) return false;
    if (b.type === 'L' || b.type === 'K' || b.type === 'S') {
      const r = b.inner;
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return false;
    }
    return true;
  }

  /** Ground height: the curb, the ramps. */
  groundAt(x: number, z: number): { y: number; ramp: Ramp | null } {
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z;
      const fx = Math.sin(r.rot), fz = Math.cos(r.rot);
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (Math.abs(side) > r.w / 2 || along < -r.len / 2 || along > r.len / 2) continue;
      return { y: r.h * (along + r.len / 2) / r.len, ramp: r };
    }
    return { y: this.offRoad(x, z) ? CURB : 0, ramp: null };
  }

  // ---------------------------------------------------------------- the traffic graph

  /** The edge's direction from node `from` (unit x, z). */
  dir(e: Edge, from: number): [number, number] {
    const a = this.nodes[from], b = this.nodes[from === e.a ? e.b : e.a];
    return [Math.sign(b.x - a.x), Math.sign(b.z - a.z)];
  }

  /** Lane centre offset (to the right of travel) of lane k (0 inner). */
  laneOffset(e: Edge, k: number): number { return 0.3 + (k + 0.5) * LANE - (e.lanes === 1 ? 0 : 0); }

  /** How far before a node traffic stops (the crossing street's half width and the crosswalk). */
  stopBack(e: Edge, node: number): number {
    const n = this.nodes[node];
    return halfWidth(e.horizontal ? n.i : n.j) + 3.4;
  }

  /** Is the light at node green for traffic on edge e? `slack` counts yellow as green. */
  green(node: number, e: Edge, time: number, slack = false): boolean {
    const n = this.nodes[node];
    if (!n.light) return true;
    const st = this.lightState(node, time);
    const ns = !e.horizontal;
    const phase = ns ? st.ns : st.ew;
    return phase === 2 || (slack && phase === 1);
  }

  /** The light at a node: 0 red, 1 yellow, 2 green, for north-south and east-west traffic. */
  lightState(node: number, time: number): { ns: number; ew: number } {
    const n = this.nodes[node];
    const t = (time + n.phase) % 26;
    if (t < 9) return { ns: 2, ew: 0 };
    if (t < 11.5) return { ns: 1, ew: 0 };
    if (t < 13) return { ns: 0, ew: 0 };
    if (t < 22) return { ns: 0, ew: 2 };
    if (t < 24.5) return { ns: 0, ew: 1 };
    return { ns: 0, ew: 0 };
  }

  // ---------------------------------------------------------------- routing

  /** A* over the nodes from a to b; the node path (inclusive), or [] when unreachable. */
  path(a: number, b: number): number[] {
    if (a === b) return [a];
    const open = new Set<number>([a]);
    const g = new Map<number, number>([[a, 0]]);
    const f = new Map<number, number>([[a, this.heur(a, b)]]);
    const from = new Map<number, number>();
    while (open.size) {
      let cur = -1, best = Infinity;
      for (const n of open) { const v = f.get(n)!; if (v < best) { best = v; cur = n; } }
      if (cur === b) {
        const out = [cur];
        while (from.has(cur)) { cur = from.get(cur)!; out.push(cur); }
        return out.reverse();
      }
      open.delete(cur);
      for (const eid of this.nodes[cur].edges) {
        const e = this.edges[eid];
        const nb = e.a === cur ? e.b : e.a;
        const ng = g.get(cur)! + e.len;
        if (ng < (g.get(nb) ?? Infinity)) {
          from.set(nb, cur); g.set(nb, ng); f.set(nb, ng + this.heur(nb, b)); open.add(nb);
        }
      }
    }
    return [];
  }

  private heur(a: number, b: number): number {
    const na = this.nodes[a], nb = this.nodes[b];
    return Math.abs(na.x - nb.x) + Math.abs(na.z - nb.z);
  }

  /**
   * A driving route from (x, z) to (tx, tz) as a polyline [x, z, x, z …]: onto the nearer end of
   * the current street, along the graph, then to the target. Also its length.
   */
  route(x: number, z: number, tx: number, tz: number): { pts: number[]; len: number } {
    const e0 = this.edgeNear(x, z), e1 = this.edgeNear(tx, tz);
    const startNodes = e0 ? [e0.a, e0.b] : [this.nearestNode(x, z).id];
    const endNodes = e1 ? [e1.a, e1.b] : [this.nearestNode(tx, tz).id];
    let best: number[] = [], bestLen = Infinity;
    for (const s of startNodes) for (const t of endNodes) {
      const p = this.path(s, t);
      if (!p.length) continue;
      const ns = this.nodes[s], nt = this.nodes[t];
      let len = Math.hypot(ns.x - x, ns.z - z) + Math.hypot(nt.x - tx, nt.z - tz);
      for (let k = 1; k < p.length; k++) len += this.edgeBetween(p[k - 1], p[k])!.len;
      // on the same street, going straight there beats a loop through a node
      if (e0 && e1 && e0.id === e1.id) { best = []; bestLen = Math.hypot(tx - x, tz - z); break; }
      if (len < bestLen) { bestLen = len; best = p; }
    }
    const pts = [x, z];
    for (const id of best) pts.push(this.nodes[id].x, this.nodes[id].z);
    pts.push(tx, tz);
    // drop a first node that lies behind (when already past it on the same street)
    return { pts, len: bestLen === Infinity ? Math.hypot(tx - x, tz - z) : bestLen };
  }

  // ---------------------------------------------------------------- line of sight and collisions

  /** Does the straight line from a to b stay clear of the blocks' solid parts (height ignored)? */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
    for (const b of this.blocks) {
      for (const r of b.solid) {
        if (r.x1 < minx || r.x0 > maxx || r.z1 < minz || r.z0 > maxz) continue;
        if (segBox(ax, az, bx, bz, r)) return false;
      }
    }
    return true;
  }

  private key(cx: number, cz: number): number { return (cz + 64) * 4096 + (cx + 64); }

  private cell(cx: number, cz: number): { boxes: Rect[]; circles: Circle[] } {
    const k = this.key(cx, cz);
    let c = this.grid.get(k);
    if (!c) { c = { boxes: [], circles: [] }; this.grid.set(k, c); }
    return c;
  }

  private addBox(r: Rect): void {
    for (let cz = Math.floor(r.z0 / 8); cz <= Math.floor(r.z1 / 8); cz++) for (let cx = Math.floor(r.x0 / 8); cx <= Math.floor(r.x1 / 8); cx++) {
      if (cx < -60 || cz < -60 || cx > 120 || cz > 120) continue;
      this.cell(cx, cz).boxes.push(r);
    }
  }

  private addCircle(c: Circle): void { this.cell(Math.floor(c.x / 8), Math.floor(c.z / 8)).circles.push(c); }

  /** Static boxes and circles near (x, z) within r (unique). */
  near(x: number, z: number, r: number, boxes: Rect[], circles: Circle[]): void {
    boxes.length = 0; circles.length = 0;
    const seen = new Set<Rect>();
    for (let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++) for (let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++) {
      const c = this.grid.get(this.key(cx, cz));
      if (!c) continue;
      for (const b of c.boxes) if (!seen.has(b)) { seen.add(b); boxes.push(b); }
      for (const ci of c.circles) circles.push(ci);
    }
  }

  /** A random spot at least `min` and at most `max` metres (straight) from (x, z). */
  spotAway(x: number, z: number, min: number, max: number, rnd: () => number, not?: Spot[]): Spot {
    const list = this.spots.filter((s) => { const d = Math.hypot(s.x - x, s.z - z); return d >= min && d <= max && !not?.includes(s); });
    const pool = list.length ? list : this.spots;
    return pool[Math.floor(rnd() * pool.length)];
  }
}

/**
 * The point `L` metres along a polyline [x, z, …] (from its start), and how sharp the next bend
 * within `look` metres of it is (cosine of the turn, 1 = straight) and how far that bend is.
 */
export function along(pts: number[], L: number, look = 40): { x: number; z: number; bendCos: number; bendDist: number } {
  let acc = 0;
  let x = pts[pts.length - 2] ?? 0, z = pts[pts.length - 1] ?? 0;
  for (let i = 2; i < pts.length; i += 2) {
    const dx = pts[i] - pts[i - 2], dz = pts[i + 1] - pts[i - 1], d = Math.hypot(dx, dz);
    if (acc + d >= L && d > 0) { const k = (L - acc) / d; x = pts[i - 2] + dx * k; z = pts[i - 1] + dz * k; break; }
    acc += d;
  }
  // the sharpest bend ahead (from the start)
  let bendCos = 1, bendDist = Infinity, run = 0;
  for (let i = 2; i + 2 < pts.length; i += 2) {
    run += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (run > look) break;
    const ax = pts[i] - pts[i - 2], az = pts[i + 1] - pts[i - 1], bx = pts[i + 2] - pts[i], bz = pts[i + 3] - pts[i + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 0.5 || lb < 0.5) continue;
    const c = (ax * bx + az * bz) / (la * lb);
    if (c < bendCos) { bendCos = c; bendDist = run; }
  }
  return { x, z, bendCos, bendDist };
}

/** Does segment a→b cross the rectangle? (slab test) */
export function segBox(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, r.x0, r.x1], [az, dz, r.z0, r.z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

let shared: City | null = null;
/** The one city (made once per page). */
export function city(): City { return (shared ??= new City()); }
