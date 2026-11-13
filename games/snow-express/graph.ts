// Snow Express: the track graph. A level's tile map becomes tiles with track segments (edge to
// edge through the tile: straights, quarter-circle corners, ramps and raised bridge pieces),
// switches (a tile whose two segments share the edge a train enters by), signals, snow drifts,
// stops (a cabin at the end of a line) and tunnels (where trains come from). Trains are a distance
// along a chain of segments; this file turns a distance on a segment into a point and a heading.
// Pure: the simulation, the bot, the balance runs and the view all use it.
import type { ColorId } from './defs';
import { COLORS, smooth } from './defs';

export const W = 8;
export const H = 12;

/** Edges of a tile: north (far, −z), east (+x), south (near, +z), west (−x). */
export type Edge = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DZ = [-1, 0, 1, 0];
const EX = [0, 0.5, 0, -0.5];
const EZ = [-0.5, 0, 0.5, 0];
export const opposite = (e: number): Edge => ((e + 2) % 4) as Edge;

/** Height of a raised track (world units) and of a tile's ground. */
export const RAISE = 0.5;

/** Piece characters: which two edges each joins. */
const PIECES: Record<string, [Edge, Edge]> = {
  '|': [0, 2], '-': [3, 1], L: [0, 1], J: [0, 3], F: [2, 1], '7': [2, 3],
};
/** Cabin letters: the cargo colour each stop takes. */
export const STOP_CHARS: Record<string, ColorId> = { r: 'red', b: 'blue', g: 'green', y: 'yellow', p: 'purple', k: 'pink' };

export interface Seg {
  id: number;
  /** Tile index (c + r·W), or −1 for the leads into tunnels and cabins. */
  tile: number;
  /** End points: their edges (−1 on a lead's far end) … */
  a: number;
  b: number;
  /** … and positions (world x, y, z). */
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  kind: 'straight' | 'corner' | 'lead';
  len: number;
  /** Corners: the centre of the arc and the angles of the two ends. */
  ox: number; oz: number; a0: number; a1: number;
  /** A segment on a raised piece (bridge over a crossing). */
  raised: boolean;
}

export interface Junction {
  id: number;
  tile: number;
  c: number;
  r: number;
  /** The edge a train enters by when the switch decides. */
  facing: Edge;
  /** The two segments it chooses between. */
  opts: [number, number];
}

export interface Signal { id: number; tile: number; c: number; r: number }

export interface Stop {
  id: number;
  color: ColorId;
  /** The cabin's tile. */
  c: number;
  r: number;
  /** The edge of the track tile next to it the trains leave by (pointing at the cabin). */
  edge: Edge;
  /** The track tile in front of the cabin. */
  tc: number;
  tr: number;
  /** The lead running into the cabin. */
  lead: number;
}

export interface Tunnel {
  id: number;
  c: number;
  r: number;
  /** The track tile the trains come out onto, and the edge of it they enter by. */
  tc: number;
  tr: number;
  edge: Edge;
  /** The lead inside the mountain the trains start on. */
  lead: number;
}

/** A switch or a signal: what the number keys and taps select, in reading order. */
export interface Control { kind: 'switch' | 'signal'; id: number; c: number; r: number }

export interface LevelMap {
  grid: string[];
  /** Junction tiles ('1'…'9' in the grid): their two pieces, e.g. '|F'. */
  j?: Record<string, string>;
  /** Merge tiles (any other letter in the grid): two pieces, no switch (trains only trail through). */
  m?: Record<string, string>;
  /** Signals and snow drifts: tile coordinates [c, r]. */
  sig?: [number, number][];
  drift?: [number, number][];
}

export const tileX = (c: number): number => c - W / 2 + 0.5;
export const tileZ = (r: number): number => r - H / 2 + 0.5;
export const inside = (c: number, r: number): boolean => c >= 0 && c < W && r >= 0 && r < H;

export class Board {
  readonly segs: Seg[] = [];
  /** Segments per tile. */
  readonly tileSegs: number[][] = [];
  readonly junctions: Junction[] = [];
  /** Junction per tile (−1 if none). */
  readonly junctionAt: number[] = [];
  readonly signals: Signal[] = [];
  readonly signalAt: number[] = [];
  readonly stops: Stop[] = [];
  readonly tunnels: Tunnel[] = [];
  readonly drifts: number[] = [];
  readonly controls: Control[] = [];
  /** Tiles with track (for scenery). */
  readonly track: boolean[] = [];
  /** Cabin and tunnel tiles. */
  readonly cabinAt: number[] = [];
  readonly tunnelAt: number[] = [];
  readonly grid: string[];
  readonly problems: string[] = [];

  constructor(map: LevelMap) {
    this.grid = map.grid.map((row) => row.padEnd(W, '.'));
    for (let i = 0; i < W * H; i++) {
      this.tileSegs.push([]);
      this.junctionAt.push(-1);
      this.signalAt.push(-1);
      this.track.push(false);
      this.cabinAt.push(-1);
      this.tunnelAt.push(-1);
    }
    const ch = (c: number, r: number) => (inside(c, r) ? this.grid[r][c] : '.');
    // the raised pieces first: ramps look at their neighbours to know which end is up
    const raisedEdges = (c: number, r: number): Edge[] => {
      const k = ch(c, r);
      if (k === '#' || k === '=') return [0, 2];
      if (k === '%' || k === '_') return [1, 3];
      return [];
    };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = ch(c, r);
      const t = c + r * W;
      const add = (a: Edge, b: Edge, ha = 0, hb = 0, raised = false) => this.addSeg(t, c, r, a, b, ha, hb, raised);
      if (PIECES[k]) add(...PIECES[k]);
      else if (k === '+') { add(0, 2); add(3, 1); }
      else if (k === '#') { add(0, 2, 1, 1, true); add(3, 1); }
      else if (k === '%') { add(3, 1, 1, 1, true); add(0, 2); }
      else if (k === '=') add(0, 2, 1, 1, true);
      else if (k === '_') add(3, 1, 1, 1, true);
      else if (k === '^' || k === '>') {
        const [a, b]: [Edge, Edge] = k === '^' ? [0, 2] : [3, 1];
        const up = (e: Edge) => (raisedEdges(c + DX[e], r + DZ[e]).includes(opposite(e)) ? 1 : 0);
        add(a, b, up(a), up(b), false);
      } else if (k >= '1' && k <= '9') {
        const spec = map.j?.[k];
        if (!spec || spec.length !== 2 || !PIECES[spec[0]] || !PIECES[spec[1]]) { this.problems.push(`junction ${k} at ${c},${r} has no pieces`); continue; }
        const s0 = add(...PIECES[spec[0]]), s1 = add(...PIECES[spec[1]]);
        const e0 = PIECES[spec[0]], e1 = PIECES[spec[1]];
        const facing = e0.find((e) => e1.includes(e));
        if (facing === undefined) { this.problems.push(`junction ${k} at ${c},${r}: pieces share no edge`); continue; }
        const j: Junction = { id: this.junctions.length, tile: t, c, r, facing, opts: [s0, s1] };
        this.junctions.push(j);
        this.junctionAt[t] = j.id;
      } else if (map.m?.[k]) {
        const spec = map.m[k];
        add(...PIECES[spec[0]]);
        add(...PIECES[spec[1]]);
      } else if (k === 'T') this.tunnelAt[t] = -2;
      else if (STOP_CHARS[k]) this.cabinAt[t] = -2;
    }
    for (const [c, r] of map.sig ?? []) {
      const s: Signal = { id: this.signals.length, tile: c + r * W, c, r };
      this.signals.push(s);
      this.signalAt[s.tile] = s.id;
    }
    for (const [c, r] of map.drift ?? []) this.drifts.push(c + r * W);
    // stops and tunnels: the one track tile next to them whose segment points at them
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = ch(c, r);
      if (k !== 'T' && !STOP_CHARS[k]) continue;
      let found = false;
      for (let e = 0 as Edge; e < 4; e = (e + 1) as Edge) {
        const tc = c + DX[e], tr = r + DZ[e];
        if (!inside(tc, tr)) continue;
        const into = opposite(e); // the edge of the track tile facing this tile
        if (!this.tileSegs[tc + tr * W].some((s) => this.segs[s].a === into || this.segs[s].b === into)) continue;
        found = true;
        const ex = tileX(tc) + EX[into], ez = tileZ(tr) + EZ[into];
        const dx = DX[into], dz = DZ[into];
        if (k === 'T') {
          // the lead runs from deep inside the mountain out to the portal
          const lead = this.addLead(ex + dx * 4.5, ez + dz * 4.5, ex, ez, into, true);
          const tn: Tunnel = { id: this.tunnels.length, c, r, tc, tr, edge: into, lead };
          this.tunnels.push(tn);
          this.tunnelAt[c + r * W] = tn.id;
        } else {
          const lead = this.addLead(ex, ez, ex + dx * 4, ez + dz * 4, into, false);
          const st: Stop = { id: this.stops.length, color: STOP_CHARS[k], c, r, edge: into, tc, tr, lead };
          this.stops.push(st);
          this.cabinAt[c + r * W] = st.id;
        }
        break;
      }
      if (!found) this.problems.push(`${k} at ${c},${r} has no track leading to it`);
    }
    // the controls in reading order
    const ctl: Control[] = [
      ...this.junctions.map((j) => ({ kind: 'switch' as const, id: j.id, c: j.c, r: j.r })),
      ...this.signals.map((s) => ({ kind: 'signal' as const, id: s.id, c: s.c, r: s.r })),
    ];
    ctl.sort((p, q) => p.r - q.r || p.c - q.c);
    this.controls.push(...ctl);
    this.check();
  }

  private addSeg(tile: number, c: number, r: number, a: Edge, b: Edge, ha: number, hb: number, raised: boolean): number {
    const cx = tileX(c), cz = tileZ(r);
    const s: Seg = {
      id: this.segs.length, tile, a, b,
      ax: cx + EX[a], ay: ha * RAISE, az: cz + EZ[a], bx: cx + EX[b], by: hb * RAISE, bz: cz + EZ[b],
      kind: (a + 2) % 4 === b ? 'straight' : 'corner', len: 1, ox: 0, oz: 0, a0: 0, a1: 0, raised,
    };
    if (s.kind === 'corner') {
      // the arc's centre is the tile corner both edges touch
      s.ox = cx + EX[a] + EX[b];
      s.oz = cz + EZ[a] + EZ[b];
      s.a0 = Math.atan2(s.az - s.oz, s.ax - s.ox);
      s.a1 = Math.atan2(s.bz - s.oz, s.bx - s.ox);
      let d = s.a1 - s.a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      s.a1 = s.a0 + d;
      s.len = Math.PI / 4;
    }
    this.segs.push(s);
    this.tileSegs[tile].push(s.id);
    this.track[tile] = true;
    return s.id;
  }

  /** A straight lead off the board: `into` is the edge it attaches to (its board end). */
  private addLead(x0: number, z0: number, x1: number, z1: number, into: Edge, boardEndIsB: boolean): number {
    const s: Seg = {
      id: this.segs.length, tile: -1, a: boardEndIsB ? -1 : into, b: boardEndIsB ? into : -1,
      ax: x0, ay: 0, az: z0, bx: x1, by: 0, bz: z1, kind: 'lead', len: Math.hypot(x1 - x0, z1 - z0), ox: 0, oz: 0, a0: 0, a1: 0, raised: false,
    };
    this.segs.push(s);
    return s.id;
  }

  /** Every track end must meet another track, a stop or a tunnel. */
  private check(): void {
    for (const s of this.segs) {
      if (s.tile < 0) continue;
      const c = s.tile % W, r = Math.floor(s.tile / W);
      for (const e of [s.a, s.b]) {
        const nc = c + DX[e], nr = r + DZ[e];
        if (!inside(nc, nr)) { this.problems.push(`track at ${c},${r} runs off the board`); continue; }
        const nt = nc + nr * W;
        if (this.cabinAt[nt] >= 0 || this.tunnelAt[nt] >= 0) continue;
        const back = opposite(e);
        if (!this.tileSegs[nt].some((q) => this.segs[q].a === back || this.segs[q].b === back)) this.problems.push(`track at ${c},${r} ends at ${nc},${nr}`);
      }
    }
  }

  /**
   * Where a train goes after leaving tile `tile` by edge `e`: the next segment and whether it is
   * run from its a end, a stop it delivers to, a tunnel it disappears into, or nothing.
   * `pick` chooses at a facing switch (default: its current setting).
   */
  next(tile: number, e: number, state: (j: number) => number): { seg: number; fwd: boolean; stop?: number; tunnel?: number; junction?: number } | null {
    const c = tile % W, r = Math.floor(tile / W);
    const nc = c + DX[e], nr = r + DZ[e];
    if (!inside(nc, nr)) return null;
    const nt = nc + nr * W;
    if (this.cabinAt[nt] >= 0) {
      const st = this.stops[this.cabinAt[nt]];
      return { seg: st.lead, fwd: true, stop: st.id };
    }
    if (this.tunnelAt[nt] >= 0) {
      const tn = this.tunnels[this.tunnelAt[nt]];
      return { seg: tn.lead, fwd: false, tunnel: tn.id };
    }
    return this.enter(nt, opposite(e), state);
  }

  /** The segment a train runs on after entering tile `nt` by edge `into` (a switch picks by its setting). */
  enter(nt: number, into: number, state: (j: number) => number): { seg: number; fwd: boolean; junction?: number } | null {
    const j = this.junctionAt[nt];
    if (j >= 0 && this.junctions[j].facing === into) {
      const s = this.junctions[j].opts[state(j)];
      return { seg: s, fwd: this.segs[s].a === into, junction: j };
    }
    for (const s of this.tileSegs[nt]) {
      const g = this.segs[s];
      if (g.a === into) return { seg: s, fwd: true };
      if (g.b === into) return { seg: s, fwd: false };
    }
    return null;
  }

  /** The edge a segment is left by when run in a direction. */
  exitEdge(seg: number, fwd: boolean): number {
    const s = this.segs[seg];
    return fwd ? s.b : s.a;
  }
}

export interface Pose { x: number; y: number; z: number; yaw: number; pitch: number }

/** A point `u` along a segment (from its a end when `fwd`, else from b), with the travel heading. */
export function poseOn(s: Seg, fwd: boolean, u: number, out: Pose): Pose {
  let k = s.len > 0 ? u / s.len : 0;
  if (!fwd) k = 1 - k;
  let x: number, z: number, dx: number, dz: number;
  if (s.kind === 'corner') {
    const a = s.a0 + (s.a1 - s.a0) * k;
    x = s.ox + Math.cos(a) * 0.5;
    z = s.oz + Math.sin(a) * 0.5;
    const da = s.a1 > s.a0 ? 1 : -1;
    dx = -Math.sin(a) * da;
    dz = Math.cos(a) * da;
  } else {
    x = s.ax + (s.bx - s.ax) * k;
    z = s.az + (s.bz - s.az) * k;
    dx = s.bx - s.ax;
    dz = s.bz - s.az;
  }
  // ramps ease in and out
  const y = s.ay + (s.by - s.ay) * smooth(k);
  const slope = (s.by - s.ay) * 6 * k * (1 - k) / Math.max(0.01, s.len);
  if (!fwd) { dx = -dx; dz = -dz; }
  out.x = x; out.y = y; out.z = z;
  out.yaw = Math.atan2(dx, dz);
  out.pitch = fwd ? slope : -slope;
  return out;
}

export const colorIndex = (c: ColorId): number => COLORS.indexOf(c);
