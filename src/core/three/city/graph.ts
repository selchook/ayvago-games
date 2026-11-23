// City generator: the raw planar road graph used while the layout is drawn. Straight segments
// only (curves are chains of short segments); inserting a segment splits every edge it crosses
// and snaps to nearby nodes, so the graph stays planar. Faces (blocks) come from walking the
// half-edges. Pure data.
import { type P, dist, segX, segDist, sub, cross, angleOf, signedArea, unit, dot, lerp } from './geom';
import type { RoadClass } from './types';

export interface GNode { id: number; x: number; z: number; e: number[]; alive: boolean }
export interface GEdge { id: number; a: number; b: number; cls: RoadClass; pri: number; alive: boolean; bridge: boolean; line: number }

const CELL = 48;

export class Graph {
  readonly nodes: GNode[] = [];
  readonly edges: GEdge[] = [];
  private nodeCells = new Map<number, number[]>();
  private edgeCells = new Map<number, number[]>();

  constructor(readonly snap = 8) {}

  private key(cx: number, cz: number): number { return (cx + 2048) * 4096 + (cz + 2048); }

  addNode(x: number, z: number): number {
    const id = this.nodes.length;
    this.nodes.push({ id, x, z, e: [], alive: true });
    const k = this.key(Math.floor(x / CELL), Math.floor(z / CELL));
    let c = this.nodeCells.get(k);
    if (!c) this.nodeCells.set(k, (c = []));
    c.push(id);
    return id;
  }

  /** Nearest alive node within r (or -1). */
  findNode(x: number, z: number, r: number): number {
    let best = -1, bd = r;
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
    const d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      for (const id of this.nodeCells.get(this.key(cx, cz)) ?? []) {
        const n = this.nodes[id];
        if (!n.alive) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) { bd = d; best = id; }
      }
    }
    return best;
  }

  private cellsOf(a: P, b: P, pad = 0): number[] {
    const out: number[] = [];
    const c0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL), c1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
    const d0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL), d1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) out.push(this.key(cx, cz));
    return out;
  }

  /** Alive edges whose cells touch the box of ab (grown by pad). */
  edgesNear(a: P, b: P, pad = 0): number[] {
    const seen = new Set<number>();
    for (const k of this.cellsOf(a, b, pad)) for (const id of this.edgeCells.get(k) ?? []) if (this.edges[id].alive) seen.add(id);
    return [...seen];
  }

  addEdge(a: number, b: number, cls: RoadClass, pri: number, line = -1, bridge = false): number {
    if (a === b) return -1;
    const na = this.nodes[a], nb = this.nodes[b];
    for (const e of na.e) {
      const E = this.edges[e];
      if (E.alive && (E.a === b || E.b === b)) return e;
    }
    const id = this.edges.length;
    this.edges.push({ id, a, b, cls, pri, alive: true, bridge, line });
    na.e.push(id); nb.e.push(id);
    na.alive = true; nb.alive = true;
    for (const k of this.cellsOf(na, nb)) {
      let c = this.edgeCells.get(k);
      if (!c) this.edgeCells.set(k, (c = []));
      c.push(id);
    }
    return id;
  }

  removeEdge(id: number): void {
    const e = this.edges[id];
    if (!e.alive) return;
    e.alive = false;
    for (const n of [e.a, e.b]) {
      const N = this.nodes[n];
      N.e = N.e.filter((x) => x !== id);
      if (!N.e.length) N.alive = false;
    }
  }

  /** Splits an edge at a point (a new node there) and returns that node. */
  splitEdge(id: number, q: P): number {
    const e = this.edges[id];
    const n = this.addNode(q.x, q.z);
    this.removeEdge(id);
    this.nodes[e.a].alive = true; this.nodes[e.b].alive = true;
    this.addEdge(e.a, n, e.cls, e.pri, e.line, e.bridge);
    this.addEdge(n, e.b, e.cls, e.pri, e.line, e.bridge);
    return n;
  }

  other(e: GEdge, n: number): number { return e.a === n ? e.b : e.a; }

  /** Node for an end point: an existing node, a split of a nearby edge, or a new node. */
  private endNode(q: P): number {
    const n = this.findNode(q.x, q.z, this.snap);
    if (n >= 0) return n;
    let best = -1, bd = this.snap * 0.75, bt = 0;
    for (const id of this.edgesNear(q, q, this.snap)) {
      const e = this.edges[id];
      const r = segDist(q, this.nodes[e.a], this.nodes[e.b]);
      if (r.d < bd) { bd = r.d; best = id; bt = r.t; }
    }
    if (best >= 0) {
      const e = this.edges[best];
      return this.splitEdge(best, lerp(this.nodes[e.a], this.nodes[e.b], bt));
    }
    return this.addNode(q.x, q.z);
  }

  /** Inserts the segment pq, splitting what it crosses. Returns the chain of node ids. */
  insertSegment(pp: P, q: P, cls: RoadClass, pri: number, line = -1): number[] {
    const a = this.endNode(pp);
    const b = this.endNode(q);
    if (a === b) return [a];
    const A = this.nodes[a], B = this.nodes[b];
    const hits: { t: number; node?: number; edge?: number; at: P }[] = [];
    for (const id of this.edgesNear(A, B, 1)) {
      const e = this.edges[id];
      if (e.a === a || e.b === a || e.a === b || e.b === b) continue;
      const x = segX(A, B, this.nodes[e.a], this.nodes[e.b]);
      if (!x || x.t <= 0 || x.t >= 1) continue;
      hits.push({ t: x.t, edge: id, at: lerp(A, B, x.t) });
    }
    // nodes lying on the new segment
    const ab = dist(A, B);
    for (let cx = Math.floor((Math.min(A.x, B.x) - this.snap) / CELL); cx <= Math.floor((Math.max(A.x, B.x) + this.snap) / CELL); cx++) {
      for (let cz = Math.floor((Math.min(A.z, B.z) - this.snap) / CELL); cz <= Math.floor((Math.max(A.z, B.z) + this.snap) / CELL); cz++) {
        for (const id of this.nodeCells.get(this.key(cx, cz)) ?? []) {
          if (id === a || id === b || !this.nodes[id].alive) continue;
          const r = segDist(this.nodes[id], A, B);
          if (r.d < this.snap * 0.5 && r.t * ab > this.snap && (1 - r.t) * ab > this.snap) hits.push({ t: r.t, node: id, at: this.nodes[id] });
        }
      }
    }
    hits.sort((u, v) => u.t - v.t);
    const chain = [a];
    for (const h of hits) {
      let n: number;
      if (h.node !== undefined) n = h.node;
      else {
        const e = this.edges[h.edge!];
        if (!e.alive) {
          // the edge was split by an earlier hit of this same segment: find the piece now there
          n = this.endNode(h.at);
        } else {
          const ea = this.nodes[e.a], eb = this.nodes[e.b];
          if (dist(h.at, ea) < this.snap) n = e.a;
          else if (dist(h.at, eb) < this.snap) n = e.b;
          else {
            const near = this.findNode(h.at.x, h.at.z, this.snap);
            n = near >= 0 ? near : this.splitEdge(h.edge!, h.at);
          }
        }
      }
      if (n !== chain[chain.length - 1] && n !== b) chain.push(n);
    }
    chain.push(b);
    for (let i = 0; i < chain.length - 1; i++) this.addEdge(chain[i], chain[i + 1], cls, pri, line);
    return chain;
  }

  /**
   * Inserts a polyline. Pieces that would run alongside an existing road (nearly parallel and
   * closer than `sep`) are left out, so roads never overlap.
   */
  insertPolyline(pts: P[], cls: RoadClass, pri: number, sep: number, line = -1, piece = 24): void {
    // resample into pieces of at most `piece` metres
    const res: P[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(1, Math.ceil(dist(a, b) / piece));
      for (let k = 1; k <= n; k++) res.push(lerp(a, b, k / n));
    }
    let run: P[] = [];
    const flush = () => {
      if (run.length >= 2) for (let i = 0; i < run.length - 1; i++) this.insertSegment(run[i], run[i + 1], cls, pri, line);
      run = [];
    };
    for (let i = 0; i < res.length - 1; i++) {
      const a = res[i], b = res[i + 1];
      if (this.blocked(a, b, sep)) { flush(); continue; }
      if (!run.length) run.push(a);
      run.push(b);
    }
    flush();
  }

  /** Would the segment ab run alongside an existing edge? */
  private blocked(a: P, b: P, sep: number): boolean {
    const d = unit(sub(b, a));
    const m = lerp(a, b, 0.5);
    for (const id of this.edgesNear(a, b, sep)) {
      const e = this.edges[id];
      const ea = this.nodes[e.a], eb = this.nodes[e.b];
      const ed = unit(sub(eb, ea));
      if (Math.abs(dot(d, ed)) < 0.9) continue; // more than ~25° apart: they cross
      const dd = Math.min(segDist(m, ea, eb).d, segDist(a, ea, eb).d, segDist(b, ea, eb).d, segDist(ea, a, b).d, segDist(eb, a, b).d);
      if (dd < sep) return true;
    }
    return false;
  }

  aliveEdges(): GEdge[] { return this.edges.filter((e) => e.alive); }
  degree(n: number): number { return this.nodes[n].e.length; }

  /** Incident edges of a node sorted by the angle of their direction away from it. */
  sorted(n: number): number[] {
    const N = this.nodes[n];
    const ang = new Map<number, number>();
    for (const e of N.e) ang.set(e, this.dirAngle(e, n));
    return [...N.e].sort((x, y) => ang.get(x)! - ang.get(y)!);
  }

  dirAngle(e: number, from: number): number {
    const E = this.edges[e];
    const o = this.nodes[this.other(E, from)], f = this.nodes[from];
    return Math.atan2(o.z - f.z, o.x - f.x);
  }

  /** Merges node b into node a (edges re-attached; ones that would duplicate are dropped). */
  mergeNodes(a: number, b: number): void {
    if (a === b) return;
    const B = this.nodes[b];
    const A = this.nodes[a];
    A.x = (A.x + B.x) / 2; A.z = (A.z + B.z) / 2;
    const k = this.key(Math.floor(A.x / CELL), Math.floor(A.z / CELL));
    let c = this.nodeCells.get(k);
    if (!c) this.nodeCells.set(k, (c = []));
    if (!c.includes(a)) c.push(a);
    for (const id of [...B.e]) {
      const e = this.edges[id];
      const o = this.other(e, b);
      this.removeEdge(id);
      if (o !== a) this.addEdge(a, o, e.cls, e.pri, e.line, e.bridge);
    }
    A.alive = A.e.length > 0;
    B.alive = false;
  }

  /**
   * Faces: cycles of half-edges with the face on their N side. Interior faces have positive
   * area; the outer face (negative) is returned separately.
   */
  faces(): { inner: { nodes: number[]; edges: number[] }[]; outer: { nodes: number[]; edges: number[] }[] } {
    const order = new Map<number, number[]>();
    for (const n of this.nodes) if (n.alive && n.e.length) order.set(n.id, this.sorted(n.id));
    const used = new Set<string>();
    const inner: { nodes: number[]; edges: number[] }[] = [];
    const outer: { nodes: number[]; edges: number[] }[] = [];
    for (const e of this.edges) {
      if (!e.alive) continue;
      for (const [s, t] of [[e.a, e.b], [e.b, e.a]]) {
        if (used.has(e.id + ':' + s)) continue;
        const nodes: number[] = [], edges: number[] = [];
        let cur = e.id, from = s, to = t, guard = 0;
        while (!used.has(cur + ':' + from) && guard++ < 100000) {
          used.add(cur + ':' + from);
          nodes.push(from); edges.push(cur);
          const list = order.get(to)!;
          const k = list.indexOf(cur);
          const nxt = list[(k - 1 + list.length) % list.length];
          from = to;
          to = this.other(this.edges[nxt], to);
          cur = nxt;
        }
        const area = signedArea(nodes.map((n) => this.nodes[n]));
        (area > 0 ? inner : outer).push({ nodes, edges });
      }
    }
    return { inner, outer };
  }

  /** Angle at node n between edges x and y (radians, 0..π). */
  angleBetween(n: number, x: number, y: number): number {
    const N = this.nodes[n];
    const a = unit(sub(this.nodes[this.other(this.edges[x], n)], N));
    const b = unit(sub(this.nodes[this.other(this.edges[y], n)], N));
    return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  }

  crosses(a: P, b: P): boolean {
    for (const id of this.edgesNear(a, b, 1)) {
      const e = this.edges[id];
      const x = segX(a, b, this.nodes[e.a], this.nodes[e.b]);
      if (x && x.t > 1e-3 && x.t < 1 - 1e-3 && x.s > 1e-3 && x.s < 1 - 1e-3) return true;
    }
    return false;
  }
}

export const turnSign = (a: P, b: P, c: P): number => cross(sub(b, a), sub(c, b));
