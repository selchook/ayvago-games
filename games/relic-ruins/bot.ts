// Relic Ruins: the autopilot. It plays a level by its plan (`route` in levels.ts: go here, use that,
// push this block so far), finding its own way between the steps (Dijkstra over the cells: around
// bear traps, over cracked floors only when it must, onto trapdoors only when they stay shut long
// enough), refills the torch at a brazier when it runs low, throws a flare at a creature that comes
// close, then takes the relic and walks out. It drives the menu's live backdrop, the store art and
// the tests that every level can be finished.
import { CELL } from './defs';
import { Sim, NO_INPUT, cellX, cellZ, TRAP_CYCLE, type Input } from './sim';
import type { Step } from './levels';

const DIRV: Record<'N' | 'S' | 'E' | 'W', [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Bot {
  /** The step of the plan being done (-1: done; then the relic and the exit). */
  i = 0;
  private t = 0;
  private path: [number, number][] = [];
  private pathT = 0;
  private goal: [number, number] | null = null;
  private pushBlock = -1;
  private pushFrom: [number, number] = [0, 0];
  private acted = false;
  private refill = false;
  private stuck = 0;
  private lastPos = [0, 0];
  private jiggle = 0;
  private detour: [number, number][] = [];

  constructor(private sim: Sim) {}

  reset(): void { this.path = []; this.pathT = 0; this.goal = null; this.acted = false; this.refill = false; this.stuck = 0; this.detour = []; }

  input(): Input {
    const s = this.sim, h = s.hero;
    if (h.state !== 'play' && h.state !== 'dark') return NO_INPUT;
    this.t += 1 / 60;
    this.pathT -= 1 / 60;
    const inp: Input = { mx: 0, mz: 0, act: false, actPressed: false, flarePressed: false };
    // a creature too close: a flare
    if (h.flares > 0 && s.flareT === 0 && s.foes.some((f) => f.stun <= 0 && (f.state === 'chase' || f.state === 'dive' || f.state === 'move') && Math.hypot(f.x - h.x, f.z - h.z) < 2.8)) inp.flarePressed = true;
    // the torch low: to a brazier first (not while escaping)
    if (!this.refill && s.escapeT < 0 && h.torch < h.tmax * (s.foes.some((f) => f.kind === 'wisp') ? 0.34 : 0.24)) this.refill = true;
    if (this.refill) {
      if (h.torch >= h.tmax * 0.97 || s.escapeT >= 0) { this.refill = false; this.path = []; }
      else {
        const b = this.nearestBrazier();
        if (b) { const done = this.walkNextTo(b[0], b[1], inp, 1.5); if (done) { /* warming */ } return inp; }
        this.refill = false;
      }
    }
    // loose coins and gems close by (from a pot, or beside the way)
    if (this.pushBlock < 0 && !this.acted) {
      const p = this.nearPick();
      if (p) { this.walkTo(p[0], p[1], inp); return inp; }
    }
    const route = s.c.route;
    if (this.i >= 0 && this.i < route.length) {
      if (this.doStep(route[this.i], inp)) { this.i++; this.t = 0; this.path = []; this.acted = false; this.pushBlock = -1; }
      else if (this.t > 40) { this.i++; this.t = 0; this.path = []; this.acted = false; this.pushBlock = -1; }
      return inp;
    }
    // the plan is done: the relic, then out
    if (!h.relic) { const [c, r] = s.c.relic; this.doStep(['act', c, r], inp); return inp; }
    const [ec, er] = s.c.exit;
    this.walkTo(ec, er, inp, true);
    return inp;
  }

  private doStep(st: Step, inp: Input): boolean {
    const s = this.sim, h = s.hero;
    switch (st[0]) {
      case 'go': return this.walkTo(st[1], st[2], inp);
      case 'wait': return this.t >= st[1];
      case 'flare': inp.flarePressed = true; return true;
      case 'act': {
        const [, c, r] = st;
        if (this.acted) return h.busy <= 0.02;
        if (!this.walkNextTo(c, r, inp, 1.55)) return false;
        // face it and use it
        const dx = cellX(c) - h.x, dz = cellZ(r) - h.z;
        const tgt = s.target();
        if (!tgt || tgt.c !== c || tgt.r !== r) {
          // turn to it first
          const l = Math.hypot(dx, dz) || 1;
          h.yaw = Math.atan2(dx / l, dz / l);
          const again = s.target();
          if (!again || again.c !== c || again.r !== r) { inp.mx = dx / l * 0.6; inp.mz = dz / l * 0.6; return this.t > 6; }
        }
        inp.act = true; inp.actPressed = true;
        this.acted = true;
        return false;
      }
      case 'push': {
        const [, c, r, d, n] = st;
        const [dc, dr] = DIRV[d];
        if (this.pushBlock < 0) {
          const b = s.blocks.find((x) => x.c === c && x.r === r && !x.sunk);
          if (!b) return true;
          this.pushBlock = b.id; this.pushFrom = [c, r];
        }
        const b = s.blocks.find((x) => x.id === this.pushBlock)!;
        const moved = Math.abs(b.c - this.pushFrom[0]) + Math.abs(b.r - this.pushFrom[1]);
        if (moved >= n || b.sunk || b.fall > 0) return b.t >= 1 && !b.roll[0] && !b.roll[1];
        if (b.t < 1 || b.roll[0] || b.roll[1]) return false;
        // stand behind it, then lean on it
        const bc = b.c - dc, br = b.r - dr;
        const [hc, hr] = s.cellOf(h.x, h.z);
        if (hc !== bc || hr !== br || Math.hypot(h.x - cellX(bc), h.z - cellZ(br)) > 0.45 && !(hc === bc && hr === br)) {
          if (hc === bc && hr === br) { this.steer(cellX(bc), cellZ(br), inp); return false; }
          this.walkTo(bc, br, inp);
          return false;
        }
        // line up across the push, then go
        const off = dc ? h.z - cellZ(br) : h.x - cellX(bc);
        inp.mx = dc; inp.mz = dr;
        if (Math.abs(off) > 0.2) { if (dc) inp.mz = -Math.sign(off) * 0.6; else inp.mx = -Math.sign(off) * 0.6; }
        return false;
      }
    }
    return true;
  }

  /** A pick-up worth a short detour: within a few cells by path, not on a hole. */
  private nearPick(): [number, number] | null {
    const s = this.sim, h = s.hero;
    const [hc, hr] = s.cellOf(h.x, h.z);
    let best: [number, number] | null = null, bd = 5.5;
    let dist: Map<number, number> | null = null;
    for (const p of s.picks) {
      if (p.taken || p.hidden || p.vy !== 0) continue;
      if (Math.hypot(p.x - h.x, p.z - h.z) > 9) continue;
      const [c, r] = s.cellOf(p.x, p.z);
      dist ??= this.costs(hc, hr);
      const v = dist.get(s.idx(c, r));
      if (v !== undefined && v < bd) { bd = v; best = [c, r]; }
    }
    return best;
  }

  private nearestBrazier(): [number, number] | null {
    const s = this.sim, h = s.hero;
    const [hc, hr] = s.cellOf(h.x, h.z);
    const d = s.bfs(hc, hr);
    let best: [number, number] | null = null, bd = 9999;
    for (const t of s.things) {
      if (t.kind !== 'brazier') continue;
      for (const [dc, dr] of NB) {
        const v = d[s.idx(t.c + dc, t.r + dr)] ?? -1;
        if (v >= 0 && v < bd) { bd = v; best = [t.c, t.r]; }
      }
    }
    return bd < 26 ? best : null;
  }

  /** Walks to a cell next to (c, r) (within `reach` of its centre); true once there. */
  private walkNextTo(c: number, r: number, inp: Input, reach: number): boolean {
    const s = this.sim, h = s.hero;
    const [hc, hr] = s.cellOf(h.x, h.z);
    const d = Math.hypot(cellX(c) - h.x, cellZ(r) - h.z);
    if (Math.abs(hc - c) + Math.abs(hr - r) === 1) {
      // beside it: step up to it, lined up with its middle
      if (d <= Math.min(reach, 1.45)) return true;
      const tx = hc === c ? cellX(c) : cellX(hc), tz = hr === r ? cellZ(r) : cellZ(hr);
      const ax = hc === c ? cellX(c) : cellX(c) - Math.sign(cellX(c) - h.x) * 1.3, az = hr === r ? cellZ(r) : cellZ(r) - Math.sign(cellZ(r) - h.z) * 1.3;
      void tx; void tz;
      this.steer(ax, az, inp);
      return false;
    }
    const dist = this.costs(hc, hr);
    let best: [number, number] | null = null, bd = Infinity;
    for (const [dc, dr] of NB) {
      const v = dist.get(s.idx(c + dc, r + dr));
      if (v !== undefined && v < bd) { bd = v; best = [c + dc, r + dr]; }
    }
    if (!best) return false;
    this.walkTo(best[0], best[1], inp);
    return false;
  }

  /** Dijkstra over the cells from the hero: costs to every reachable cell. */
  private costs(c0: number, r0: number, goal?: [number, number]): Map<number, number> {
    const s = this.sim;
    const dist = new Map<number, number>();
    const open: [number, number, number][] = [[0, c0, r0]];
    dist.set(s.idx(c0, r0), 0);
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [d, c, r] = open.splice(bi, 1)[0];
      if (d > (dist.get(s.idx(c, r)) ?? Infinity)) continue;
      for (const [dc, dr] of NB) {
        const nc = c + dc, nr = r + dr;
        const w = this.weight(c, r, nc, nr, goal);
        if (w === Infinity) continue;
        const nd = d + w, k = s.idx(nc, nr);
        if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); open.push([nd, nc, nr]); }
      }
    }
    return dist;
  }

  private weight(c: number, r: number, nc: number, nr: number, goal?: [number, number]): number {
    const s = this.sim, h = s.hero;
    const cell = s.cell(nc, nr);
    if (!cell) return Infinity;
    const isGoal = goal && goal[0] === nc && goal[1] === nr;
    if (cell.k === 'exit') return isGoal && s.open[s.idx(nc, nr)] ? 1 : Infinity;
    // a locked door opens when walked into with a key
    if (cell.k === 'lock' && !s.open[s.idx(nc, nr)]) return h.keys > 0 ? 2 : Infinity;
    if (s.solid(nc, nr)) return Infinity;
    if (!s.stepOk(c, r, nc, nr)) return Infinity;
    const i = s.idx(nc, nr);
    if (cell.k === 'trapdoor') return s.sunkAt(nc, nr) ? 1 : 2.5;
    if (s.hole(nc, nr)) return Infinity;
    const th = s.thingAt(nc, nr);
    if (th?.kind === 'beartrap' && !th.on && h.powers.ghost <= 0) return 5; // passed hugging a wall
    if (cell.k === 'cracked' && !s.collapsed[i]) return s.crack[i] >= 0 ? (s.escapeT >= 0 ? 3 : 60) : s.escapeT >= 0 ? 4 : 12;
    return 1;
  }

  /** Walks the path to a cell; true once standing on it. */
  private walkTo(c: number, r: number, inp: Input, into = false): boolean {
    const s = this.sim, h = s.hero;
    const [hc, hr] = s.cellOf(h.x, h.z);
    if (hc === c && hr === r && Math.hypot(h.x - cellX(c), h.z - cellZ(r)) < 0.4) return true;
    if (!this.goal || this.goal[0] !== c || this.goal[1] !== r || this.pathT <= 0 || !this.path.length) {
      this.goal = [c, r];
      this.pathT = 0.35;
      this.path = this.find(hc, hr, c, r);
    }
    while (this.path.length && this.path[0][0] === hc && this.path[0][1] === hr && this.path.length > 1) this.path.shift();
    if (!this.path.length) return false;
    let [nc, nr] = this.path[0];
    if (nc === hc && nr === hr && this.path.length === 1) { this.steer(cellX(c), cellZ(r), inp); return false; }
    // trapdoors: wait on firm ground until the ones ahead stay shut long enough
    const here = s.cell(hc, hr);
    if (s.cell(nc, nr)?.k === 'trapdoor' && here?.k !== 'trapdoor') {
      let n = 0;
      for (const [pc, pr] of this.path) { if (s.cell(pc, pr)?.k !== 'trapdoor') break; n++; }
      const need = (n + 0.7) * CELL / 4.4;
      const firstOpen = Math.min(...this.path.slice(0, n).map(([pc, pr]) => s.trapUntilOpen(pc, pr)));
      if (firstOpen < need || s.trapState(nc, nr) !== 0) { this.steer(cellX(hc), cellZ(hr), inp, 0.5); return false; }
    }
    void into; void TRAP_CYCLE;
    // a bear trap on the way: pass it along the cell's edge (or round the corner), clear of its jaws
    if (this.detour.length) {
      const [dx, dz] = this.detour[0];
      this.steer(dx, dz, inp);
      if (Math.hypot(h.x - dx, h.z - dz) < 0.22) {
        this.detour.shift();
        if (!this.detour.length) { this.path = this.path.slice(1); }
      }
      return false;
    }
    const trap = s.thingAt(nc, nr);
    if (trap?.kind === 'beartrap' && !trap.on && h.powers.ghost <= 0 && !(nc === c && nr === r)) {
      const [ac, ar] = this.path[1] ?? [nc + (nc - hc), nr + (nr - hr)];
      const ix = nc - hc, iz = nr - hr, ox = ac - nc, oz = ar - nr;
      let p1: [number, number], p2: [number, number];
      if (ix === ox && iz === oz) {
        // straight through: along the side with more room (any side when both are walls)
        p1 = p2 = [-iz, ix];
      } else { p1 = [ox, oz]; p2 = [-ix, -iz]; }
      const cx = cellX(nc), cz = cellZ(nr);
      this.detour = [
        [cx - ix * 0.85 + p1[0] * 0.66, cz - iz * 0.85 + p1[1] * 0.66],
        [cx + ox * 0.85 + p2[0] * 0.66, cz + oz * 0.85 + p2[1] * 0.66],
        [cx + ox * 1.6 + p2[0] * 0.3, cz + oz * 1.6 + p2[1] * 0.3],
      ];
      return false;
    }
    this.steer(cellX(nc), cellZ(nr), inp);
    // unstick: a nudge sideways when the hero has not moved for a while
    const moved = Math.hypot(h.x - this.lastPos[0], h.z - this.lastPos[1]);
    this.lastPos = [h.x, h.z];
    if (moved < 0.004 && (inp.mx || inp.mz)) this.stuck += 1 / 60; else this.stuck = Math.max(0, this.stuck - 1 / 30);
    if (this.stuck > 0.6) { this.jiggle = 0.25; this.stuck = 0; this.path = []; }
    if (this.jiggle > 0) { this.jiggle -= 1 / 60; this.steer(cellX(hc), cellZ(hr), inp); }
    return false;
  }

  private steer(x: number, z: number, inp: Input, k = 1): void {
    const h = this.sim.hero;
    const dx = x - h.x, dz = z - h.z, l = Math.hypot(dx, dz);
    if (l < 0.05) return;
    inp.mx = (dx / l) * Math.min(1, l * 3) * k;
    inp.mz = (dz / l) * Math.min(1, l * 3) * k;
  }

  private find(c0: number, r0: number, c1: number, r1: number): [number, number][] {
    const s = this.sim;
    const dist = this.costs(c0, r0, [c1, r1]);
    if (!dist.has(s.idx(c1, r1))) return [];
    const path: [number, number][] = [[c1, r1]];
    let [c, r] = [c1, r1];
    let guard = 0;
    while ((c !== c0 || r !== r0) && guard++ < 999) {
      let best: [number, number] | null = null, bd = dist.get(s.idx(c, r))!;
      for (const [dc, dr] of NB) {
        const v = dist.get(s.idx(c + dc, r + dr));
        if (v !== undefined && v < bd && this.weight(c + dc, r + dr, c, r, [c1, r1]) !== Infinity) { bd = v; best = [c + dc, r + dr]; }
      }
      if (!best) break;
      [c, r] = best;
      path.unshift([c, r]);
    }
    return path;
  }
}
