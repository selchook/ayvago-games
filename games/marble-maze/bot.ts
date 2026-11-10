// A level-playing bot: plans a route through every gem, key and switch to the goal and steers the
// marble along it with the same analogue input a player has (tilt -1..1 on both axes). Used by the
// solvability check (tests) and by the in-game autopilot hook (window.__mm.autopilot).
import { Sim, T, DIRV, type ParsedLevel } from './sim';

type Pt = [number, number];

interface WalkSeg { kind: 'walk'; pts: Pt[]; lim: number[]; must: number[] }
interface RideSeg { kind: 'ride'; mover: number; from: Pt; to: Pt; boardEnd: 0 | 1 }
type Seg = WalkSeg | RideSeg;

interface Edge { to: number; cost: number; ride?: { mover: number; boardEnd: 0 | 1 }; jump?: boolean }

const SQ2 = Math.SQRT2;

function moverEnds(L: ParsedLevel, i: number): [Set<number>, Set<number>] {
  const m = L.movers[i];
  const cells = (ox: number, oy: number) => {
    const s = new Set<number>();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) s.add((m.y + oy + y) * L.w + m.x + ox + x);
    return s;
  };
  return [cells(0, 0), cells(Math.round(m.dx), Math.round(m.dy))];
}

/** Every cell a mover's swing passes over. */
function moverSweep(L: ParsedLevel, i: number): Set<number> {
  const m = L.movers[i];
  const s = new Set<number>();
  const steps = Math.max(Math.abs(m.dx), Math.abs(m.dy));
  for (let k = 0; k <= steps; k++) {
    const ox = Math.round((m.dx * k) / steps), oy = Math.round((m.dy * k) / steps);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) s.add((m.y + oy + y) * L.w + m.x + ox + x);
  }
  return s;
}

export class Planner {
  private L: ParsedLevel;
  constructor(private sim: Sim) {
    this.L = sim.L;
  }

  /** The goal cell while targets remain (rolling over it would end the level early). */
  private avoid = -1;

  private walkable(c: number, open: Set<number>): boolean {
    const L = this.L;
    if (c === this.avoid) return false;
    const t = L.tiles[c];
    if (t === T.WALL || t === T.VOID || t === T.HOLE) return false;
    if (t === T.GATE) {
      const g = L.gates.find((q) => q.cy * L.w + q.cx === c);
      return !!g && open.has(g.ch);
    }
    if (L.bumpers.some((b) => b.cy * L.w + b.cx === c)) return false;
    return true;
  }

  private hazard(c: number): number {
    const L = this.L, x = c % L.w, y = (c / L.w) | 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = this.sim.tile(x + dx, y + dy);
        if (t === T.HOLE || t === T.VOID) n += dx && dy ? 0.5 : 1;
      }
    }
    return n;
  }

  private edges(c: number, open: Set<number>): Edge[] {
    const L = this.L, x = c % L.w, y = (c / L.w) | 0;
    const out: Edge[] = [];
    const spring = L.springs.find((s) => s.cy * L.w + s.cx === c);
    if (spring) {
      const [dx, dy] = DIRV[spring.dir];
      const land = (y + dy * 3) * L.w + x + dx * 3;
      if (this.walkable(land, open)) out.push({ to: land, cost: 3, jump: true });
      return out;
    }
    const surf = L.tiles[c];
    const base = surf === T.SAND ? 2.2 : 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const n = ny * L.w + nx;
        if (!this.walkable(n, open)) continue;
        if (dx && dy && (!this.walkable(y * L.w + nx, open) || !this.walkable(ny * L.w + x, open))) continue;
        out.push({ to: n, cost: (dx && dy ? SQ2 : 1) * base + this.hazard(n) * 0.7 });
      }
    }
    // moving platforms: board at one end, ride, step off at the other
    L.movers.forEach((m, i) => {
      const ends = moverEnds(L, i);
      const sweep = moverSweep(L, i);
      for (const e of [0, 1] as const) {
        let adj = false;
        for (const cell of ends[e]) {
          const cx = cell % L.w, cy = (cell / L.w) | 0;
          if (Math.abs(cx - x) + Math.abs(cy - y) === 1) adj = true;
        }
        if (!adj) continue;
        const other = ends[1 - e];
        for (const cell of other) {
          const cx = cell % L.w, cy = (cell / L.w) | 0;
          for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = (cy + ddy) * L.w + cx + ddx;
            if (sweep.has(n) || !this.walkable(n, open)) continue;
            out.push({ to: n, cost: m.period * 2 + 4, ride: { mover: i, boardEnd: e } });
          }
        }
      }
    });
    return out;
  }

  /** Dijkstra from cell `from`; returns distances and back-links. */
  private search(from: number, open: Set<number>): { dist: Float64Array; prev: Int32Array; via: (Edge | null)[] } {
    const N = this.L.w * this.L.h;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const via: (Edge | null)[] = new Array(N).fill(null);
    const done = new Uint8Array(N);
    dist[from] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const e of this.edges(u, open)) {
        const d = best + e.cost;
        if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = u; via[e.to] = e; }
      }
    }
    return { dist, prev, via };
  }

  /** The whole route: greedy nearest target (gems, keys, switches), then the goal. */
  plan(): Seg[] | null {
    const L = this.L;
    const open = new Set<number>();
    const cell = (p: { cx: number; cy: number }) => p.cy * L.w + p.cx;
    type Target = { c: number; kind: 'gem' | 'key' | 'switch'; ch?: number };
    const todo: Target[] = [
      ...L.gems.map((g) => ({ c: cell(g), kind: 'gem' as const })),
      ...L.keys.map((g) => ({ c: cell(g), kind: 'key' as const })),
      ...L.switches.map((s) => ({ c: cell(s), kind: 'switch' as const, ch: s.ch })),
    ];
    let at = Math.floor(L.start.y) * L.w + Math.floor(L.start.x);
    const cells: { c: number; e: Edge | null; must?: boolean }[] = [{ c: at, e: null }];
    let guard = 0;
    while (guard++ < 64) {
      this.avoid = todo.length ? cell(L.goal) : -1;
      const { dist, prev, via } = this.search(at, open);
      // nearest target first, but never one that leaves another target (or the goal) behind a
      // one-way jump
      const order = todo.filter((t) => dist[t.c] < Infinity).sort((a, b) => dist[a.c] - dist[b.c]);
      let pick: Target | null = null;
      for (const t of order) {
        const rest = todo.filter((q) => q !== t);
        const open2 = new Set(open);
        if (t.kind === 'switch') open2.add(t.ch!);
        this.avoid = rest.length ? cell(L.goal) : -1;
        const after = this.search(t.c, open2).dist;
        this.avoid = todo.length ? cell(L.goal) : -1;
        if (rest.every((q) => after[q.c] < Infinity || q.kind === 'switch') && after[cell(L.goal)] < Infinity || rest.length && rest.every((q) => after[q.c] < Infinity)) { pick = t; break; }
      }
      if (!pick && order.length) pick = order[0];
      const goalC = cell(L.goal);
      let dest: number;
      if (pick) dest = pick.c;
      else if (todo.length) return null;          // something left that cannot be reached
      else if (dist[goalC] < Infinity) dest = goalC;
      else return null;
      const chain: { c: number; e: Edge | null; must?: boolean }[] = [];
      for (let c = dest; c !== at; c = prev[c]) chain.push({ c, e: via[c] });
      chain.reverse();
      if (chain.length) chain[chain.length - 1].must = true;
      cells.push(...chain);
      at = dest;
      if (!pick) break;
      todo.splice(todo.indexOf(pick), 1);
      if (pick.kind === 'switch') open.add(pick.ch!);
    }
    return this.segments(cells);
  }

  private segments(cells: { c: number; e: Edge | null; must?: boolean }[]): Seg[] {
    const L = this.L;
    const ctr = (c: number): Pt => [(c % L.w) + 0.5, ((c / L.w) | 0) + 0.5];
    const segs: Seg[] = [];
    let walk: Pt[] = [ctr(cells[0].c)];
    let must: number[] = [];
    const flush = () => {
      if (walk.length) segs.push({ kind: 'walk', pts: walk, lim: [], must });
    };
    for (let i = 1; i < cells.length; i++) {
      const { c, e } = cells[i];
      if (e?.ride) {
        flush();
        segs.push({ kind: 'ride', mover: e.ride.mover, from: ctr(cells[i - 1].c), to: ctr(c), boardEnd: e.ride.boardEnd });
        walk = [ctr(c)];
        must = [];
      } else walk.push(ctr(c));
      if (cells[i].must) must.push(walk.length - 1);
    }
    flush();
    for (const s of segs) if (s.kind === 'walk') s.lim = this.limits(s.pts);
    return segs;
  }

  /** Safe speed at every point: slow near holes and edges, round corners, on ice; then braking room. */
  private limits(pts: Pt[]): number[] {
    const tune = this.sim.tune;
    const top = tune.maxSpeed * 0.92;
    const lim = pts.map(([x, y], i) => {
      const c = Math.floor(y) * this.L.w + Math.floor(x);
      let v = top;
      const hz = this.hazard(c);
      if (hz > 0) v = Math.min(v, 4.2 - Math.min(2, hz) * 0.5);
      const t = this.L.tiles[c];
      if (t === T.ICE) v = Math.min(v, 3.4);
      if (this.L.springs.some((s) => s.cy * this.L.w + s.cx === c)) v = Math.min(v, 3.5);
      if (i > 0 && i < pts.length - 1) {
        const ax = x - pts[i - 1][0], ay = y - pts[i - 1][1], bx = pts[i + 1][0] - x, by = pts[i + 1][1] - y;
        const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
        if (cos < 0.9) v = Math.min(v, cos < 0.1 ? (hz > 0 ? 1.5 : 2.3) : 3.6);
      }
      return v;
    });
    const brake = tune.acc * 0.5;
    for (let i = lim.length - 2; i >= 0; i--) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      // a jump pad flight covers three cells without braking
      lim[i] = Math.min(lim[i], Math.sqrt(lim[i + 1] ** 2 + 2 * brake * Math.min(d, 1.5)));
    }
    return lim;
  }
}

/** Steers a Sim along a planned route. Call `input()` every frame before `sim.step`. */
export class Bot {
  segs: Seg[] | null;
  private si = 0;
  private pi = 0;
  private phase: 'wait' | 'board' | 'ride' | 'exit' = 'wait';
  failed = false;

  constructor(private sim: Sim) {
    this.segs = new Planner(sim).plan();
    if (!this.segs) this.failed = true;
  }

  /** After a fall the marble is back at a checkpoint: plan again from there. */
  replan(): void {
    const s = this.sim;
    const save = { ...s.L.start };
    s.L.start.x = s.x;
    s.L.start.y = s.y;
    // only what is still to do
    const p = new Planner(s);
    const gemsLeft = s.L.gems.filter((g) => !g.taken), keysLeft = s.L.keys.filter((g) => !g.taken), swLeft = s.L.switches.filter((g) => !g.taken);
    const L2 = { ...s.L, gems: gemsLeft, keys: keysLeft, switches: swLeft };
    (p as unknown as { L: ParsedLevel }).L = L2;
    this.segs = p.plan();
    s.L.start.x = save.x;
    s.L.start.y = save.y;
    this.si = 0;
    this.pi = 0;
    this.phase = 'wait';
    if (!this.segs) this.failed = true;
  }

  private steerTo(vx: number, vy: number, k = 0.55): Pt {
    const s = this.sim;
    let ix = (vx - s.vx) * k, iy = (vy - s.vy) * k;
    const l = Math.hypot(ix, iy);
    if (l > 1) { ix /= l; iy /= l; }
    return [ix, iy];
  }

  private hold(tx: number, ty: number, max = 2.2): Pt {
    const s = this.sim;
    let vx = (tx - s.x) * 3, vy = (ty - s.y) * 3;
    const l = Math.hypot(vx, vy);
    if (l > max) { vx *= max / l; vy *= max / l; }
    return this.steerTo(vx, vy, 0.8);
  }

  input(): Pt {
    const s = this.sim;
    if (!this.segs || s.state !== 'roll') return [0, 0];
    const seg = this.segs[this.si];
    if (!seg) return this.hold(s.L.goal.x, s.L.goal.y, 3);
    if (seg.kind === 'ride') return this.ride(seg);
    return this.walk(seg);
  }

  private next(): void {
    this.si++;
    this.pi = 0;
    this.phase = 'wait';
  }

  private walk(seg: WalkSeg): Pt {
    const s = this.sim, pts = seg.pts;
    if (pts.length === 1) { this.next(); return [0, 0]; }
    // a target point (gem, key, switch) must be touched before the route goes on past it
    while (seg.must.length && Math.hypot(pts[seg.must[0]][0] - s.x, pts[seg.must[0]][1] - s.y) < 0.3) {
      // reached: the route goes on from that point
      this.pi = Math.max(this.pi, Math.min(seg.must.shift()!, pts.length - 2));
    }
    const cap = seg.must.length ? seg.must[0] : pts.length - 1;
    // closest segment ahead
    let best = Infinity, bi = this.pi, bt = 0;
    for (let i = this.pi; i < Math.min(cap, pts.length - 1, this.pi + 4); i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y - ay) * dy) / l2));
      const d = Math.hypot(ax + dx * t - s.x, ay + dy * t - s.y);
      if (d < best - 1e-6 || (d < best + 0.05 && bt > 0.95)) { best = Math.min(best, d); bi = i; bt = t; }
    }
    this.pi = bi;
    if (bi >= pts.length - 2 && bt > 0.85) {
      const last = pts[pts.length - 1];
      if (Math.hypot(last[0] - s.x, last[1] - s.y) < 0.35 || this.si < this.segs!.length - 1 && this.segs![this.si + 1].kind !== 'ride') {
        if (this.si < this.segs!.length - 1) { this.next(); return this.input(); }
      }
    }
    // look ahead along the path
    let look = 0.65, i = bi, t = bt;
    let tx = pts[i][0], ty = pts[i][1];
    for (;;) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const l = Math.hypot(bx - ax, by - ay);
      const rest = l * (1 - t);
      if (rest >= look || i + 1 >= cap) {
        const f = Math.min(1, t + look / l);
        tx = ax + (bx - ax) * f;
        ty = ay + (by - ay) * f;
        break;
      }
      look -= rest;
      i++;
      t = 0;
    }
    const lim = seg.lim[bi] + (seg.lim[bi + 1] - seg.lim[bi]) * bt;
    const end = this.si === this.segs!.length - 1 || this.segs![this.si + 1].kind === 'ride';
    const lastP = pts[pts.length - 1];
    const left = Math.hypot(lastP[0] - s.x, lastP[1] - s.y);
    const v = end ? Math.min(lim, Math.max(0.4, left * 2.2)) : lim;
    const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy) || 1;
    return this.steerTo((dx / d) * v, (dy / d) * v);
  }

  private ride(seg: RideSeg): Pt {
    const s = this.sim;
    const m = s.L.movers[seg.mover];
    const f = s.moverF(seg.mover);
    const p = s.moverPos[seg.mover];
    const cx = p.x + m.w / 2, cy = p.y + m.h / 2;
    // the ride's direction (board side → exit side) and the platform's half length along it
    let ex = seg.to[0] - seg.from[0], ey = seg.to[1] - seg.from[1];
    if (Math.abs(ex) > Math.abs(ey)) { ex = Math.sign(ex); ey = 0; } else { ey = Math.sign(ey); ex = 0; }
    const half = Math.abs(ex) * m.w / 2 + Math.abs(ey) * m.h / 2;
    const boardF = seg.boardEnd === 0 ? f : 1 - f;     // 0 at the boarding end
    if (this.phase === 'wait') {
      const later = s.moverF(seg.mover, s.t + 0.45);
      const boardLater = seg.boardEnd === 0 ? later : 1 - later;
      if (boardF < 0.002 && boardLater < 0.002 && Math.hypot(seg.from[0] - s.x, seg.from[1] - s.y) < 0.45) this.phase = 'board';
      else return this.hold(seg.from[0], seg.from[1]);
    }
    if (this.phase === 'board') {
      const tx = cx - ex * (half - 0.45), ty = cy - ey * (half - 0.45);
      if (s.riding === seg.mover && Math.hypot(tx - s.x, ty - s.y) < 0.3) this.phase = 'ride';
      else return this.hold(tx, ty, 3);
    }
    if (this.phase === 'ride') {
      if (boardF > 0.998) this.phase = 'exit';
      else return this.hold(cx + ex * (half - 0.4), cy + ey * (half - 0.4), 1.5);
    }
    // exit: roll onto the floor cell at the far end
    if (Math.hypot(seg.to[0] - s.x, seg.to[1] - s.y) < 0.4) {
      this.next();
      return [0, 0];
    }
    return this.hold(seg.to[0], seg.to[1], 3);
  }
}
