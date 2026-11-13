// Delivery Dash: the three districts. Each is an ASCII grid of road tiles and lots, parsed into a
// Town: the road cells with their open sides (which road tile each one gets), heights (Hilltop's
// plateau and its ramps, the humped bridges, speed bumps), the lots with their buildings, the
// shops and houses with their delivery bays, crosswalks, coffee spots and roadworks, and the lane
// graph (right-hand traffic) that the traffic, the bot and the arrow all follow. Pure data: no
// Phaser, no three.js.
import { S, LANE, ROAD_HALF, LEVEL_H, DX, DZ, opp, rightOf, HEADING, SHOP_OF_DIGIT, clamp, type Cargo } from './defs';

// Map legend
//   #  road            =  crosswalk        %  speed bump        *  coffee (turbo) on the road
//   x  road that roadworks may close       /  ramp (Hilltop)    b  humped bridge   B  flat bridge
//   o  lot (a building)  H  house          1..6  shop (pizza, flowers, cake, parcel, burger, ice cream)
//   C  café            p  park            t  trees             w  river
// `oneway` marks travel directions (> < ^ v) per cell; `level` marks the plateau (1).
export interface MapDef {
  id: number;
  family: 'city' | 'green';
  rows: string[];
  oneway?: string[];
  level?: string[];
  /** Ring road: traffic runs faster on these rows/cols. */
  highway?: { rows: number[]; cols: number[] };
}

export const MAPS: MapDef[] = [
  {
    // Old Town: a tight grid of shops and narrow streets, crosswalks and a speed bump
    id: 0,
    family: 'city',
    rows: [
      'ooH1ooo32oo',
      'o#########o',
      'H#H2#H#5H#o',
      'o#4H#p#Ho#H',
      'o#=####=##o',
      'o#H6#HxoH#o',
      'H#oH*3#H1#o',
      'o####%####o',
      'o#5HxH#H2#H',
      'o#HC#o#4H#o',
      'o#=#######o',
      'ooo5oHo6Hoo',
      'ooooooooooo',
    ],
  },
  {
    // Riverside: the river splits the town; three bridges (two of them humped) and one-way loops
    id: 1,
    family: 'green',
    rows: [
      'ooHo14o2Ho3oo',
      'o###########o',
      'o#H#oH*H5#H#o',
      'H#6#Hp#oH#2#H',
      'o###=###=###o',
      'ooH#o1xo3#Hoo',
      'ttt#tt#tp#ttt',
      'wwwbwwBwwbwww',
      'ttt#tt#tt#ttt',
      'ooH#2o#Ho#6oo',
      'o###=###=###o',
      'H#4xHo#H1#H#H',
      'o#H#5H#o3*o#o',
      'o###########o',
      'ooHo1Ho2Ho5oo',
    ],
    oneway: [
      '.............',
      '.<<<<<<<<<<<.',
      '.v.........^.',
      '.v.........^.',
      '.>>>>>>>>>>>.',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.<<<<<<<<<<<.',
      '.v.........^.',
      '.v.........^.',
      '.>>>>>>>>>>>.',
      '.............',
    ],
  },
  {
    // Hilltop: villas on a plateau reached by four ramps, and a fast ring road around it all
    id: 2,
    family: 'green',
    rows: [
      'ooHo1ooH2oHoo',
      'o###########o',
      'o#H3oo#H4oH#o',
      'o##x=###=###o',
      'o#5ooo/ooH6#o',
      'H#otoo#Hoto#o',
      'o#HtHo#pHt2#o',
      'o##/#*###/##o',
      'o#HtHp#oHt4#o',
      'o#otoH#5oto#H',
      'o#6Hoo/ooH1#o',
      'o###=###=#x#o',
      'o#H2oo#H5oH#o',
      'o###########o',
      'ooHo3ooH6oHoo',
    ],
    level: [
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000111110000',
      '0000111110000',
      '0000111110000',
      '0000111110000',
      '0000111110000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
      '0000000000000',
    ],
    highway: { rows: [1, 13], cols: [1, 11] },
  },
];

export type LotKind = 'house' | 'shop' | 'generic' | 'park' | 'trees' | 'cafe' | 'water';

export interface Cell {
  r: number;
  c: number;
  ch: string;
  road: boolean;
  /** Open sides (bit d), for road cells. */
  open: number;
  level: number;
  /** Ramp: the side that is high (-1 for none). */
  ramp: number;
  bridge: 'hump' | 'flat' | null;
  crosswalk: boolean;
  bump: boolean;
  coffee: boolean;
  works: boolean;
  /** Travel direction of a one-way cell (-1: two-way). */
  oneway: number;
  highway: boolean;
  lot: Lot | null;
}

export interface Lot {
  id: number;
  r: number;
  c: number;
  kind: LotKind;
  /** Side of the lot that faces its street. */
  face: number;
  shop: Cargo | null;
  level: number;
  /** Solid box (x0, z0, x1, z1) and roof height (for camera clearance). */
  box: [number, number, number, number];
  top: number;
}

export interface Bay {
  id: number;
  lot: Lot;
  cell: Cell;
  /** The bay's centre (the near lane of the street in front of the lot). */
  x: number;
  z: number;
  y: number;
  /** Travel direction of the near lane. */
  dir: number;
  /** Door: the point on the lot's front edge. */
  doorX: number;
  doorZ: number;
}

export interface Edge {
  id: number;
  from: number;
  to: number;
  cell: Cell;
  /** Samples along the lane: x, y, z per point, cumulative length. */
  pts: number[];
  cum: number[];
  len: number;
  turn: 'straight' | 'left' | 'right' | 'uturn';
  /** Entering heading and leaving direction. */
  dirIn: number;
  dirOut: number;
}

export interface Node {
  id: number;
  x: number;
  z: number;
  y: number;
  dir: number;
  out: number[];
  inc: number[];
}

/** Speed bump: height and half length (a cosine hump across the street). */
export const BUMP_H = 0.22;
export const BUMP_HALF = 1.0;

/**
 * A ramp 0 → 1 with its ends rounded over `e` of its length (the tiles bend sharply; the van's
 * ground eases into and out of the slope so a ramp is a bump only when taken fast).
 */
export function fillet(t: number, e: number): number {
  t = clamp(t, 0, 1);
  const m = 1 / (1 - e);
  if (t < e) return (m * t * t) / (2 * e);
  if (t > 1 - e) return 1 - (m * (1 - t) * (1 - t)) / (2 * e);
  return m * (t - e / 2);
}

/** Cell centre in world space. */
export const cx = (c: number): number => (c + 0.5) * S;
export const cz = (r: number): number => (r + 0.5) * S;

export class Town {
  readonly def: MapDef;
  readonly w: number;
  readonly h: number;
  readonly cells: Cell[];
  readonly lots: Lot[] = [];
  readonly shops: Bay[] = [];
  readonly houses: Bay[] = [];
  readonly nodes: Node[] = [];
  readonly edges: Edge[] = [];
  readonly coffees: Cell[] = [];
  readonly crosswalks: Cell[] = [];
  readonly works: Cell[] = [];
  /** Per bay (shops first, then houses): distance from each node to the bay, and the next edge. */
  private routes = new Map<Bay, { dist: Float32Array; next: Int32Array }>();
  private nodeAt = new Map<string, number>();

  constructor(def: MapDef, readonly opts: { oneway: boolean; works: boolean }) {
    this.def = def;
    this.h = def.rows.length;
    this.w = def.rows[0].length;
    this.cells = [];
    for (let r = 0; r < this.h; r++) {
      if (def.rows[r].length !== this.w) throw new Error(`map ${def.id} row ${r} is ${def.rows[r].length} wide`);
      for (let c = 0; c < this.w; c++) {
        const ch = def.rows[r][c];
        const road = '#=%*x/bB'.includes(ch);
        const ow = def.oneway?.[r]?.[c] ?? '.';
        this.cells.push({
          r, c, ch, road, open: 0, level: Number(def.level?.[r]?.[c] ?? '0'), ramp: -1,
          bridge: ch === 'b' ? 'hump' : ch === 'B' ? 'flat' : null,
          crosswalk: ch === '=', bump: ch === '%', coffee: ch === '*', works: ch === 'x',
          oneway: opts.oneway ? '^>v<'.indexOf(ow) : -1,
          highway: !!def.highway && (def.highway.rows.includes(r) || def.highway.cols.includes(c)) && road,
          lot: null,
        });
      }
    }
    // open sides; closed roadworks count as no road for the traffic (the tile stays a road)
    for (const cell of this.cells) {
      if (!cell.road) continue;
      for (let d = 0; d < 4; d++) {
        const n = this.cell(cell.r + DZ[d], cell.c + DX[d]);
        if (n?.road) cell.open |= 1 << d;
      }
      if (!Town.straight(cell)) cell.oneway = -1;
      if (cell.ch === '/') {
        // the high side is the neighbour along the road on the plateau
        for (let d = 0; d < 4; d++) {
          const n = this.cell(cell.r + DZ[d], cell.c + DX[d]);
          if (n?.road && n.level === 1) cell.ramp = d;
        }
        cell.level = 0;
      }
      if (cell.coffee) this.coffees.push(cell);
      if (cell.crosswalk) this.crosswalks.push(cell);
      if (cell.works) this.works.push(cell);
    }
    this.buildLots();
    this.buildGraph();
  }

  cell(r: number, c: number): Cell | null {
    return r >= 0 && c >= 0 && r < this.h && c < this.w ? this.cells[r * this.w + c] : null;
  }

  cellAt(x: number, z: number): Cell | null {
    return this.cell(Math.floor(z / S), Math.floor(x / S));
  }

  /** A road cell the traffic may use (roadworks closed it). */
  drivable(cell: Cell | null): boolean {
    return !!cell && cell.road && !(cell.works && this.opts.works);
  }

  /** Straight road cell (two opposite open sides). */
  static straight(cell: Cell): boolean { return cell.open === 0b0101 || cell.open === 0b1010; }

  // ------------------------------------------------------------------ heights

  /** Ground height of the road surface at a point (plateau, ramps, bridge humps, speed bumps). */
  ground(x: number, z: number): number {
    const cell = this.cellAt(x, z);
    if (!cell) return 0;
    let y = cell.level * LEVEL_H;
    const lx = x / S - cell.c - 0.5, lz = z / S - cell.r - 0.5; // -0.5 .. 0.5 in the tile
    if (cell.ramp >= 0) {
      // rises linearly towards the high side
      const along = cell.ramp === 0 ? -lz : cell.ramp === 2 ? lz : cell.ramp === 1 ? lx : -lx;
      y = fillet(along + 0.5, 0.15) * LEVEL_H;
    }
    if (cell.bridge === 'hump') {
      // the deck rises over the outer quarter on each side to 0.115 of a tile
      const along = (cell.open & 0b0101) ? lz : lx;
      y += fillet(clamp((0.5 - Math.abs(along)) / 0.25, 0, 1), 0.3) * 0.115 * S;
    }
    if (cell.bump) {
      const along = (cell.open & 0b0101) ? lz : lx;
      const k = Math.abs(along * S) / BUMP_HALF;
      if (k < 1) y += BUMP_H * (1 + Math.cos(Math.PI * k)) / 2;
    }
    return y;
  }

  /** Is this point on drivable ground (inside a road cell, not closed)? */
  solidAt(x: number, z: number): boolean {
    return !this.drivable(this.cellAt(x, z));
  }

  // ------------------------------------------------------------------ lots, shops, houses

  private buildLots(): void {
    for (const cell of this.cells) {
      if (cell.road) continue;
      const ch = cell.ch;
      const kind: LotKind = ch === 'H' ? 'house' : SHOP_OF_DIGIT[ch] ? 'shop' : ch === 'C' ? 'cafe' : ch === 'p' ? 'park' : ch === 't' ? 'trees' : ch === 'w' ? 'water' : 'generic';
      // facing: a straight street next to it (not a crosswalk if another one is free), else any road
      let face = -1, best = -1;
      for (let d = 0; d < 4; d++) {
        const n = this.cell(cell.r + DZ[d], cell.c + DX[d]);
        if (!n?.road || n.ch === '/' || n.bridge) continue;
        const score = (Town.straight(n) ? 4 : 0) + (n.crosswalk || n.bump || n.coffee || n.works ? 0 : 2) + (d === 2 ? 1 : 0);
        if (score > best) { best = score; face = d; }
      }
      const x0 = cell.c * S, z0 = cell.r * S;
      const lot: Lot = {
        id: this.lots.length, r: cell.r, c: cell.c, kind, face: face < 0 ? 2 : face, shop: SHOP_OF_DIGIT[ch] ?? null, level: cell.level,
        box: [x0, z0, x0 + S, z0 + S], top: cell.level * LEVEL_H + (kind === 'park' || kind === 'water' ? 0.4 : kind === 'trees' ? 5 : 6),
      };
      cell.lot = lot;
      this.lots.push(lot);
      if (kind === 'house' || kind === 'shop') {
        const road = this.cell(cell.r + DZ[lot.face], cell.c + DX[lot.face]);
        if (!road || face < 0 || !Town.straight(road)) throw new Error(`map ${this.def.id}: ${kind} at ${cell.r},${cell.c} has no straight street`);
        // the near lane: travel direction whose right side is the lot
        const toLot = opp(lot.face);
        const dir = [0, 1, 2, 3].find((t) => rightOf(t) === toLot)!;
        const bx = cx(road.c) + DX[toLot] * LANE, bz = cz(road.r) + DZ[toLot] * LANE;
        const bay: Bay = {
          id: 0, lot, cell: road, x: bx, z: bz, y: road.level * LEVEL_H, dir,
          doorX: cx(cell.c) + DX[lot.face] * (S / 2 - 1.6), doorZ: cz(cell.r) + DZ[lot.face] * (S / 2 - 1.6),
        };
        (kind === 'shop' ? this.shops : this.houses).push(bay);
      }
    }
    this.shops.forEach((b, i) => { b.id = i; });
    this.houses.forEach((b, i) => { b.id = this.shops.length + i; });
  }

  // ------------------------------------------------------------------ lane graph

  /** May traffic cross the boundary of `cell` towards side d (travelling in direction d)? */
  private crossOk(cell: Cell, d: number): boolean {
    const n = this.cell(cell.r + DZ[d], cell.c + DX[d]);
    if (!this.drivable(cell) || !this.drivable(n)) return false;
    if (cell.oneway >= 0 && cell.oneway !== d) return false;
    if (n!.oneway >= 0 && n!.oneway !== d) return false;
    return true;
  }

  /** The node on the boundary of `cell` towards side d, for travel in direction d. */
  private node(cell: Cell, d: number): number {
    const key = `${cell.r},${cell.c},${d}`;
    let id = this.nodeAt.get(key);
    if (id !== undefined) return id;
    const rt = rightOf(d);
    const x = cx(cell.c) + DX[d] * S / 2 + DX[rt] * LANE;
    const z = cz(cell.r) + DZ[d] * S / 2 + DZ[rt] * LANE;
    id = this.nodes.length;
    this.nodes.push({ id, x, z, y: 0, dir: d, out: [], inc: [] });
    this.nodeAt.set(key, id);
    // the same boundary seen from the neighbour
    const n = this.cell(cell.r + DZ[d], cell.c + DX[d]);
    if (n) this.nodeAt.set(`${n.r},${n.c},${opp(d)}:in`, id);
    return id;
  }

  /** Node where traffic enters `cell` through side s (travelling in direction opp(s)). */
  private entry(cell: Cell, s: number): number | null {
    const n = this.cell(cell.r + DZ[s], cell.c + DX[s]);
    if (!n || !this.crossOk(n, opp(s))) return null;
    return this.node(n, opp(s));
  }

  private buildGraph(): void {
    for (const cell of this.cells) {
      if (!this.drivable(cell)) continue;
      const sides = [0, 1, 2, 3].filter((d) => this.drivable(this.cell(cell.r + DZ[d], cell.c + DX[d])));
      for (const s of sides) {
        const a = this.entry(cell, s);
        if (a === null) continue;
        const outs = sides.filter((t) => t !== s && this.crossOk(cell, t));
        // a dead end turns round
        const list = outs.length ? outs : this.crossOk(cell, s) ? [s] : [];
        for (const t of list) this.addEdge(cell, a, this.node(cell, t), opp(s), t);
      }
    }
    for (const n of this.nodes) n.y = this.ground(n.x - DX[n.dir] * 0.01, n.z - DZ[n.dir] * 0.01);
    for (const e of this.edges) { this.nodes[e.from].out.push(e.id); this.nodes[e.to].inc.push(e.id); }
    // every bay's routes
    for (const b of [...this.shops, ...this.houses]) this.routes.set(b, this.dijkstra(b));
  }

  private addEdge(cell: Cell, from: number, to: number, dirIn: number, dirOut: number): void {
    const a = this.nodes[from], b = this.nodes[to];
    const turn: Edge['turn'] = dirIn === dirOut ? 'straight' : dirOut === opp(dirIn) ? 'uturn' : rightOf(dirIn) === dirOut ? 'right' : 'left';
    const pts: number[] = [];
    const P0 = [a.x, a.z], P3 = [b.x, b.z];
    let P1: number[], P2: number[];
    if (turn === 'straight') { P1 = P0; P2 = P3; }
    else if (turn === 'uturn') {
      const k = S * 0.42;
      P1 = [P0[0] + DX[dirIn] * k, P0[1] + DZ[dirIn] * k];
      P2 = [P3[0] - DX[dirOut] * k, P3[1] - DZ[dirOut] * k];
    } else {
      const R = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]) / Math.SQRT2;
      const k = R * 0.552;
      P1 = [P0[0] + DX[dirIn] * k, P0[1] + DZ[dirIn] * k];
      P2 = [P3[0] - DX[dirOut] * k, P3[1] - DZ[dirOut] * k];
    }
    const n = turn === 'straight' ? 8 : 12;
    const cum: number[] = [];
    let len = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0];
      const z = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1];
      if (i > 0) len += Math.hypot(x - pts[pts.length - 3], z - pts[pts.length - 1]);
      // stay inside the cell when sampling the height on its edge
      const ix = clamp(x, cell.c * S + 0.01, (cell.c + 1) * S - 0.01), iz = clamp(z, cell.r * S + 0.01, (cell.r + 1) * S - 0.01);
      pts.push(x, this.ground(ix, iz), z);
      cum.push(len);
    }
    this.edges.push({ id: this.edges.length, from, to, cell, pts, cum, len, turn, dirIn, dirOut });
  }

  /** A point on an edge at distance s: [x, y, z, heading]. */
  pointOn(e: Edge, s: number, out: number[] = [0, 0, 0, 0]): number[] {
    const cum = e.cum;
    s = clamp(s, 0, e.len);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const k = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    const p = e.pts, j = (i - 1) * 3, j2 = i * 3;
    out[0] = p[j] + (p[j2] - p[j]) * k;
    out[1] = p[j + 1] + (p[j2 + 1] - p[j + 1]) * k;
    out[2] = p[j + 2] + (p[j2 + 2] - p[j + 2]) * k;
    out[3] = Math.atan2(p[j2] - p[j], p[j2 + 2] - p[j + 2]);
    return out;
  }

  /** Edges through a bay's street cell (the lanes a van may stop in). */
  bayEdges(b: Bay): Edge[] {
    return this.edges.filter((e) => e.cell === b.cell && e.turn === 'straight');
  }

  /** Reverse Dijkstra: the distance from every node to the bay (via a lane through its street). */
  private dijkstra(b: Bay): { dist: Float32Array; next: Int32Array } {
    const N = this.nodes.length;
    const dist = new Float32Array(N).fill(Infinity);
    const next = new Int32Array(N).fill(-1);
    const open: number[] = [];
    for (const e of this.bayEdges(b)) {
      const d0 = e.len / 2;
      if (d0 < dist[e.from]) { dist[e.from] = d0; next[e.from] = e.id; open.push(e.from); }
    }
    // small graphs: a plain scan for the nearest open node is fast enough
    const done = new Uint8Array(N);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const u = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (done[u]) continue;
      done[u] = 1;
      for (const ei of this.nodes[u].inc) {
        const e = this.edges[ei];
        const nd = dist[u] + e.len + (e.turn === 'uturn' ? 6 : 0);
        if (nd < dist[e.from]) { dist[e.from] = nd; next[e.from] = ei; open.push(e.from); }
      }
    }
    return { dist, next };
  }

  /** Path distance from a node to a bay (Infinity when it cannot be reached). */
  distTo(node: number, b: Bay): number { return this.routes.get(b)!.dist[node]; }

  /** The next edge from a node towards a bay (-1 at the bay's own lane or when unreachable). */
  nextTo(node: number, b: Bay): number { return this.routes.get(b)!.next[node]; }

  /**
   * The best lane for a vehicle at (x, z) heading h to reach a bay: the edge it is on (nearest
   * edge in its cell that runs its way) and the distance along the route.
   */
  locate(x: number, z: number, h: number): { edge: Edge; s: number } | null {
    const cell = this.cellAt(x, z);
    let best: Edge | null = null, bs = 0, bd = Infinity;
    const p = [0, 0, 0, 0];
    const cand = cell ? this.edgesIn(cell) : [];
    const list = cand.length ? cand : this.edges;
    for (const e of list) {
      // nearest sample, weighed by how well its heading matches
      for (let i = 0; i < e.cum.length; i++) {
        const dx = e.pts[i * 3] - x, dz = e.pts[i * 3 + 2] - z;
        this.pointOn(e, e.cum[i], p);
        const align = Math.cos(p[3] - h);
        const d = Math.hypot(dx, dz) + (1 - align) * 3;
        if (d < bd) { bd = d; best = e; bs = e.cum[i]; }
      }
    }
    return best ? { edge: best, s: bs } : null;
  }

  private byCell = new Map<Cell, Edge[]>();
  edgesIn(cell: Cell): Edge[] {
    let l = this.byCell.get(cell);
    if (!l) { l = this.edges.filter((e) => e.cell === cell); this.byCell.set(cell, l); }
    return l;
  }

  /** Route distance from a lane position to a bay (the rest of the edge, then the graph). */
  routeDist(edge: Edge, s: number, b: Bay): number {
    if (edge.cell === b.cell && edge.turn === 'straight') return Math.abs(edge.len / 2 - s);
    return edge.len - s + this.distTo(edge.to, b);
  }

  /**
   * Points along the route from a lane position to a bay, up to `ahead` units: [x, y, z, ...].
   * Ends at the bay.
   */
  routePoints(edge: Edge, s: number, b: Bay, ahead: number, step = 1.5): number[] {
    const out: number[] = [];
    const p = [0, 0, 0, 0];
    let e: Edge | null = edge, at = s, left = ahead, guard = 0;
    while (e && left > 0 && guard++ < 60) {
      const end = e.cell === b.cell && e.turn === 'straight' ? e.len / 2 : e.len;
      for (; at <= end && left > 0; at += step, left -= step) {
        this.pointOn(e, at, p);
        out.push(p[0], p[1], p[2]);
      }
      if (end < e.len) { this.pointOn(e, end, p); out.push(p[0], p[1], p[2]); break; }
      at -= e.len;
      const nx = this.nextTo(e.to, b);
      e = nx >= 0 ? this.edges[nx] : null;
    }
    return out;
  }

  /** Road cell heading for the assist: the axis of a straight street (or -1). */
  axisAt(x: number, z: number): number {
    const cell = this.cellAt(x, z);
    if (!cell || !cell.road) return -1;
    if (cell.open === 0b0101) return 0;
    if (cell.open === 0b1010) return 1;
    return -1;
  }
}

/** Heading of a travel direction (re-exported for the view). */
export { HEADING };

/** Half-width of the asphalt (for crosswalks). */
export const ASPHALT = ROAD_HALF;

const cache = new Map<string, Town>();
/** Towns are pure data: one per map and options, shared by the simulation and the view. */
export function town(id: number, oneway: boolean, works: boolean): Town {
  const key = `${id}:${oneway}:${works}`;
  let t = cache.get(key);
  if (!t) { t = new Town(MAPS[id], { oneway, works }); cache.set(key, t); }
  return t;
}
