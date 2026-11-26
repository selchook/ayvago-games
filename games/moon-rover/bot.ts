// Moon Rover: the autopilot. It plays a mission the way a player would, through the same Input:
//   - a planner over the tile grid (Dijkstra from the rover's tile): flat steps, connector ramps
//     taken straight, drops of up to two levels, kicker jumps over chasms to the first tile beyond;
//     ice, dust, crystal fields, craters, tracks and turret zones cost more, pits and solid tiles
//     are out;
//   - the next goal by path cost: crystals, waving astronauts (it slows beside them until they are
//     aboard), outposts while it carries supplies, generators in the miner set-piece, power
//     capsules close by, a charging pad when the battery will not last, an outpost or the base when
//     the seats are full, and the base (or the rocket) once the job is done;
//   - steering at the farthest waypoint in a clear straight line, slowing for sharp turns, full
//     speed into kickers, GAS held in the air (the nose level for a clean landing), waiting for
//     trains and force fields, backing out when stuck, and using each power soon after taking it.
// The menu backdrop, the store art, the playtest and the headless balance check (balance.ts) use it.
import { TILE, STEP } from './defs';
import { ABYSS, DIRS, PIT_IN } from './terrain';
import { TRAIN, type Sim, type Input } from './sim';
import type { Tile } from './levels';

interface Target { x: number; z: number; kind: 'crystal' | 'astro' | 'outpost' | 'gen' | 'power' | 'charge' | 'drop' | 'goal'; key: string; stop?: boolean }

const INF = 1e9;

export class Bot {
  /** Current waypoint index (tests). */
  i = 0;
  /** Seconds to wait in place before setting off (the menu backdrop's pause at the start). */
  patience = 0;
  private dist: Float64Array;
  private prev: Int32Array;
  private jumpFrom: Int8Array;
  private path: number[] = [];
  target: Target | null = null;
  private planT = 0;
  private stuckT = 0;
  private backT = 0;
  private lastPos = { x: 0, z: 0, t: 0 };
  private skip = new Set<string>();
  private targetT = 0;
  private bestD = INF;
  private charging = false;
  private blocked: Uint8Array;
  private clock = 0;
  private backing = false;
  /** The ramp the rover is lined up for (its tile). */
  private approach = -1;
  private kickRun = false;
  private backSteer = 1;

  constructor(private sim: Sim) {
    const n = sim.c.cols * sim.c.rows;
    this.dist = new Float64Array(n);
    this.prev = new Int32Array(n);
    this.jumpFrom = new Int8Array(n);
    this.blocked = new Uint8Array(n);
    this.markBlocked();
    this.lastPos = { x: sim.rover.x, z: sim.rover.z, t: 0 };
  }

  reset(): void { this.path = []; this.target = null; this.planT = 0; this.stuckT = 0; this.backT = 0; this.bestD = INF; this.targetT = 0; }

  // ---------------------------------------------------------------- the grid

  private markBlocked(): void {
    const L = this.sim.c;
    L.tiles.forEach((t, i) => { this.blocked[i] = t.k === 'chasm' || t.solid ? 1 : 0; });
    for (const cr of L.craters) if (cr.pit) {
      const c = Math.floor(cr.x / TILE), r = Math.floor(cr.z / TILE);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= L.cols || rr >= L.rows) continue;
        const d = Math.hypot((cc + 0.5) * TILE - cr.x, (rr + 0.5) * TILE - cr.z);
        if (d < cr.R * PIT_IN + 1.5) this.blocked[rr * L.cols + cc] = 1;
      }
    }
    // obstacles that are not on their own tile's centre still block it
    for (const o of L.obstacles) {
      const c = Math.floor(o.x / TILE), r = Math.floor(o.z / TILE);
      if (c >= 0 && r >= 0 && c < L.cols && r < L.rows && o.kind !== 'rocket') this.blocked[r * L.cols + c] = 1;
    }
  }

  private tile(i: number): Tile { return this.sim.c.tiles[i]; }

  /** A tile's height at the middle of one side (null for a ramp's flank: no way across). */
  private edgeH(t: Tile, d: number): number | null {
    if (t.k !== 'ramp') return t.L * STEP;
    if (d === t.dir) return (t.L + 1) * STEP;
    if (d === (t.dir + 2) % 4) return t.L * STEP;
    return null;
  }

  private cost(i: number): number {
    const t = this.tile(i), L = this.sim.c;
    let k = t.surf === 'ice' ? 1.5 : t.surf === 'dust' ? 1.25 : t.surf === 'field' ? 2.6 : 1;
    if (t.ch === 'o' || t.ch === 'O') k += 0.3;
    if (t.ch === 't') k += 1.2;
    const c = i % L.cols, r = (i - c) / L.cols, x = (c + 0.5) * TILE, z = (r + 0.5) * TILE;
    for (const tu of this.sim.turrets) { const d = Math.hypot(tu.x - x, tu.z - z); if (d < 14) k += (14 - d) / 7; }
    return k;
  }

  /** Dijkstra over the tiles from the rover's tile. */
  private plan(): void {
    const L = this.sim.c, v = this.sim.rover, cols = L.cols, n = cols * L.rows;
    this.dist.fill(INF); this.prev.fill(-1); this.jumpFrom.fill(0);
    const c0 = Math.max(0, Math.min(cols - 1, Math.floor(v.x / TILE))), r0 = Math.max(0, Math.min(L.rows - 1, Math.floor(v.z / TILE)));
    const s = r0 * cols + c0;
    this.dist[s] = 0;
    const open: number[] = [s];
    const done = new Uint8Array(n);
    while (open.length) {
      // a small binary-heap-free pick: the grids are small
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (this.dist[open[k]] < this.dist[open[bi]]) bi = k;
      const p = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (done[p]) continue;
      done[p] = 1;
      const pc = p % cols, pr = (p - pc) / cols, pt = this.tile(p);
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = DIRS[d];
        const nc = pc + dx, nr = pr + dz;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= L.rows) continue;
        const q = nr * cols + nc, qt = this.tile(q);
        const ha = this.edgeH(pt, d);
        if (ha === null) continue;
        let to = q, steps = 1, jump = false;
        if (qt.k === 'chasm' && pt.k === 'ramp' && pt.dir === d) {
          // a kicker over a gap: lands on the first ground beyond
          to = -1;
          for (let k = 2; k <= 7; k++) {
            const jc = pc + dx * k, jr = pr + dz * k;
            if (jc < 0 || jr < 0 || jc >= cols || jr >= L.rows) break;
            const j = jr * cols + jc, jt = this.tile(j);
            if (jt.k === 'chasm') continue;
            if (!this.blocked[j] && jt.k !== 'ramp' && jt.L * STEP <= ha + 0.1) { to = j; steps = k; jump = true; }
            break;
          }
          if (to < 0) continue;
        } else {
          if (this.blocked[q] && q !== this.goalTile()) continue;
          const hb = this.edgeH(qt, (d + 2) % 4);
          if (hb === null) continue;
          if (hb > ha + 0.6) continue;
          if (ha - hb > STEP * 2 + 0.1) continue;
        }
        const nd = this.dist[p] + this.cost(to) * steps + (jump ? 1.5 : 0);
        if (nd < this.dist[to]) { this.dist[to] = nd; this.prev[to] = p; this.jumpFrom[to] = jump ? 1 : 0; open.push(to); }
      }
    }
  }

  private goalTile(): number {
    const g = this.sim.goal, L = this.sim.c;
    return Math.floor(g.z / TILE) * L.cols + Math.floor(g.x / TILE);
  }

  private tileOf(x: number, z: number): number {
    const L = this.sim.c;
    const c = Math.max(0, Math.min(L.cols - 1, Math.floor(x / TILE))), r = Math.max(0, Math.min(L.rows - 1, Math.floor(z / TILE)));
    return r * L.cols + c;
  }

  /** The cheapest tile next to a spot that the planner reached (for solid goals: the rocket). */
  private reach(x: number, z: number): number {
    const L = this.sim.c, t = this.tileOf(x, z);
    if (this.dist[t] < INF || !this.blocked[t]) return this.dist[t] < INF ? t : -1;
    const c = t % L.cols, r = (t - c) / L.cols;
    let best = -1, bd = INF;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= L.cols || rr >= L.rows) continue;
      const q = rr * L.cols + cc;
      if (this.dist[q] < bd) { bd = this.dist[q]; best = q; }
    }
    return best;
  }

  // ---------------------------------------------------------------- choosing the next goal

  private choose(): Target | null {
    const s = this.sim, v = s.rover, L = s.c;
    const cand: { t: Target; w: number }[] = [];
    const add = (t: Target, w: number) => {
      if (this.skip.has(t.key)) return;
      const q = this.reach(t.x, t.z);
      if (q < 0 || this.dist[q] >= INF) return;
      cand.push({ t, w: this.dist[q] * w });
    };
    const escape = L.setpiece === 'escape';
    const hurry = escape && s.countdown >= 0 && s.countdown < this.estimate(s.goal.x, s.goal.z) * 1.6 + 12;
    // the battery first: will it last to the next goal and on to a charger?
    const chargers = [...L.chargers.map((c) => ({ x: c.x, z: c.z })), { x: L.base.x, z: L.base.z }];
    const nearestCharge = chargers.map((c) => ({ c, d: this.estimate(c.x, c.z) })).sort((a, b) => a.d - b.d)[0];
    const drain = 1.35 * s.tune.drain * (s.storm ? 1.9 : 1);
    if (this.charging && v.battery < v.bmax * 0.96 && nearestCharge) return { x: nearestCharge.c.x, z: nearestCharge.c.z, kind: 'charge', key: 'charge', stop: true };
    this.charging = false;
    if (!s.god && nearestCharge && nearestCharge.d < INF && v.battery < (nearestCharge.d * 1.5 + 22) * drain) {
      this.charging = true;
      return { x: nearestCharge.c.x, z: nearestCharge.c.z, kind: 'charge', key: 'charge', stop: true };
    }
    if (!hurry) {
      // in an escape only what lies close to the way is worth it
      const near = (x: number, z: number, tiles: number) => !escape || (this.reach(x, z) >= 0 && this.dist[this.reach(x, z)] <= tiles);
      s.crystals.forEach((c, i) => { if (!c.taken && near(c.x, c.z, 3)) add({ x: c.x, z: c.z, kind: 'crystal', key: 'c' + i }, escape ? 2.2 : 1); });
      if (v.aboard < v.seats) s.astronauts.forEach((a, i) => { if ((a.state === 'wait' || a.state === 'wave' || a.state === 'run') && near(a.home.x, a.home.z, 5)) add({ x: a.home.x, z: a.home.z, kind: 'astro', key: 'a' + i, stop: true }, 0.8); });
      if (!v.power) s.powers.forEach((p, i) => { if (!p.taken && near(p.x, p.z, 4)) add({ x: p.x, z: p.z, kind: 'power', key: 'p' + i }, 1.6); });
    }
    L.outposts.forEach((o, i) => { if (!s.delivered[i] && v.cargo > 0) add({ x: o.x, z: o.z, kind: 'outpost', key: 'o' + i }, 0.85); });
    s.generators.forEach((g, i) => { if (!g.off) add({ x: g.x, z: g.z, kind: 'gen', key: 'g' + i }, 0.7); });
    const leftAstro = s.astronauts.some((a) => a.state === 'wait' || a.state === 'wave' || a.state === 'run');
    if (v.aboard >= v.seats && leftAstro && !hurry) {
      // seats full: drop the crew at the nearest outpost or the base
      for (const o of [...L.outposts, L.base]) add({ x: o.x, z: o.z, kind: 'drop', key: 'drop' + o.x + ',' + o.z }, 0.9);
    }
    if (!cand.length || hurry || (escape && cand.every((c) => c.t.kind === 'crystal' || c.t.kind === 'power') && cand.length && this.dist[this.reach(cand[0].t.x, cand[0].t.z)] > 3)) {
      if (s.ready) return { x: s.goal.x, z: s.goal.z, kind: 'goal', key: 'goal' };
    }
    if (!cand.length) return s.ready ? { x: s.goal.x, z: s.goal.z, kind: 'goal', key: 'goal' } : null;
    cand.sort((a, b) => a.w - b.w);
    return cand[0].t;
  }

  /** Seconds to drive to a spot by the current plan (rough). */
  private estimate(x: number, z: number): number {
    const q = this.reach(x, z);
    return q < 0 || this.dist[q] >= INF ? INF : (this.dist[q] * TILE) / 9 + 2;
  }

  private buildPath(t: Target): void {
    const q = this.reach(t.x, t.z);
    const out: number[] = [];
    for (let p = q; p >= 0 && out.length < 400; p = this.prev[p]) out.push(p);
    out.reverse();
    this.path = out;
    this.i = 1;
  }

  // ---------------------------------------------------------------- driving

  input(): Input {
    const s = this.sim, v = s.rover, L = s.c;
    const dt = 1 / 60;
    this.clock += dt;
    const out: Input = { steer: 0, gas: false, brake: false, power: false };
    if (v.state !== 'drive') return out;
    if (this.patience > 0) { this.patience -= dt; return out; }
    // in the air: GAS keeps the nose level for a clean landing
    if (v.air) { out.gas = true; out.steer = 0; return out; }
    this.planT -= dt;
    if (this.planT <= 0 || !this.target) {
      this.planT = 0.4;
      this.plan();
      const t = this.choose();
      if (t && (!this.target || t.key !== this.target.key)) { this.target = t; this.targetT = 0; this.bestD = INF; this.approach = -1; }
      if (!t) this.target = null;
      if (this.target) this.buildPath(this.target);
    }
    const t = this.target;
    if (!t) return out;
    this.targetT += dt;
    const dT = Math.hypot(t.x - v.x, t.z - v.z);
    if (dT < this.bestD - 1) { this.bestD = dT; this.targetT = 0; }
    // give up on a goal that does not come closer (an astronaut it cannot reach, a crystal on a ledge)
    if (this.targetT > 14 && t.kind !== 'goal' && t.kind !== 'outpost' && t.kind !== 'gen' && t.kind !== 'charge') { this.skip.add(t.key); this.target = null; return out; }
    // use a power soon after taking it
    if (v.power && this.wantPower(v.power, dT)) out.power = true;
    // stuck: back off a little
    if (this.backT > 0) {
      this.backT -= dt;
      out.brake = true;
      // reversing turns the nose the other way: a three-point turn towards the way to go
      out.steer = this.backSteer;
      return out;
    }
    if (Math.hypot(v.x - this.lastPos.x, v.z - this.lastPos.z) > 1.5) { this.lastPos = { x: v.x, z: v.z, t: this.clock }; }
    else if (this.clock - this.lastPos.t > 1.6 && !this.waiting(t, dT) && !v.charging) {
      const a = this.aimPoint();
      let da = Math.atan2(a.x - v.x, a.z - v.z) - v.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.backSteer = da > 0 ? 1 : -1;
      this.backT = 1.1; this.lastPos.t = this.clock; this.planT = 0; return out;
    }
    // the point to steer at
    const aim = this.aimPoint();
    let ax = aim.x, az = aim.z;
    if ((dT < 6 || this.path.length <= 2) && this.clear(v.x, v.z, t.x, t.z)) { ax = t.x; az = t.z; }
    // the miner winding up or charging close by: dodge to the side
    const m = s.miner;
    if (m && !m.off && m.frozen <= 0 && (m.mode === 'wind' || m.mode === 'charge') && Math.hypot(m.x - v.x, m.z - v.z) < 20) {
      const mx = v.x - m.x, mz = v.z - m.z, md = Math.hypot(mx, mz) || 1;
      // the side of the miner's line the rover is already on, along the way it was going
      const px = -mz / md, pz = mx / md;
      const side = (ax - v.x) * px + (az - v.z) * pz >= 0 ? 1 : -1;
      const dx = px * side * 12 + (ax - v.x) * 0.3, dz = pz * side * 12 + (az - v.z) * 0.3;
      if (this.clear(v.x, v.z, v.x + dx * 0.6, v.z + dz * 0.6)) { ax = v.x + dx; az = v.z + dz; }
    }
    if (aim.back) {
      // reverse straight back out, steering the rear towards the axis
      const wantB = Math.atan2(v.x - ax, v.z - az);
      let db = wantB - v.yaw;
      while (db > Math.PI) db -= Math.PI * 2;
      while (db < -Math.PI) db += Math.PI * 2;
      out.steer = Math.max(-1, Math.min(1, db * 2));
      if (v.speed > 0.5) out.brake = true; else if (v.speed > -3.5) out.brake = true;
      return out;
    }
    const want = Math.atan2(ax - v.x, az - v.z);
    let da = want - v.yaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    out.steer = Math.max(-1, Math.min(1, -da * 2.4));
    // speed: slow for sharp turns, for slippery ground, for goals that need a stop
    let top = s.topSpeed;
    if (Math.abs(da) > 0.5) top = Math.min(top, 5 + 6 * (1 - Math.min(1, (Math.abs(da) - 0.5) / 1)));
    if (v.surf === 'ice') top = Math.min(top, 7.5);
    // on a kicker already: all the way, whatever the line
    const here = s.ter.tileAt(v.x, v.z);
    const onKicker = !!here && here.k === 'ramp' && (() => { const [kx, kz] = DIRS[here.dir]; const nt = s.ter.tileAt(v.x + kx * TILE, v.z + kz * TILE); return !nt || nt.k === 'chasm' || nt.L <= here.L; })();
    // stuck slow on a kicker (knocked onto it, no run-up): back down and take a run at it
    if (onKicker && v.speed < 6 && !this.kickRun) { this.backT = 0; out.brake = true; out.gas = false; out.steer = 0; this.approach = -1; return out; }
    this.kickRun = onKicker && v.speed >= 6;
    if (aim.jump || onKicker) top = s.topSpeed * 1.2;
    else if (aim.line) top = Math.min(top, 4.5);
    else if (aim.ramp) top = Math.min(top, 9);
    if (t.stop) {
      if (t.kind === 'astro' && dT < 14) top = Math.min(top, dT < 9 ? 1 : 4);
      if (t.kind === 'charge' && dT < 6) top = Math.min(top, 1);
    }
    if (t.kind === 'goal' || t.kind === 'outpost' || t.kind === 'drop') top = Math.min(top, Math.max(3, dT * 0.9));
    // trains and force fields: wait; a drop ahead that is not the way: brake
    if (this.trainAhead() || this.gateAhead()) top = 0;
    if (!aim.jump && this.dropAhead()) top = Math.min(top, 1.5);
    // a bolt or a meteor coming: keep moving, sideways if need be
    // a turret winding up at a rover that waits: keep rolling
    if (Math.abs(v.speed) < 3 && s.turrets.some((tu) => tu.charge > 0 && tu.frozen <= 0 && Math.hypot(tu.x - v.x, tu.z - v.z) < 22)) { top = Math.max(top, 6); out.steer = Math.max(-1, Math.min(1, out.steer + 0.5)); }
    const threat = this.threat();
    if (threat) { top = Math.max(top, 8); out.steer = Math.max(-1, Math.min(1, out.steer + threat)); }
    const sp = v.speed;
    if (sp < top - 0.4) out.gas = true;
    else if (sp > top + 1.5) out.brake = true;
    if (top <= 0.01 && sp < 0.6) { out.gas = false; out.brake = false; }
    return out;
  }

  /** Holes ahead along the heading (a chasm or a pit within a few metres). */
  private dropAhead(): boolean {
    const s = this.sim, v = s.rover;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const reach = Math.max(4, Math.abs(v.speed) * 0.7);
    const rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw);
    for (let k = 1.5; k <= reach; k += 1) for (const side of [0, -1, 1]) if (s.ter.ground(v.x + fx * k + rx * side, v.z + fz * k + rz * side) <= ABYSS + 1) return true;
    return false;
  }

  /** When to fire the carried power. */
  private wantPower(id: string, dT: number): boolean {
    const s = this.sim, v = s.rover;
    const near = (x: number, z: number, r: number) => Math.hypot(x - v.x, z - v.z) < r;
    if (id === 'emp') return (!!s.miner && !s.miner.off && near(s.miner.x, s.miner.z, 22)) || s.turrets.some((t) => near(t.x, t.z, 22));
    if (id === 'shield') return s.meteors.length > 0 || s.bolts.length > 0 || (!!s.miner && !s.miner.off && near(s.miner.x, s.miner.z, 25)) || s.turrets.some((t) => near(t.x, t.z, 26));
    if (id === 'boost') return Math.abs(v.speed) > 7 && dT > 30;
    if (id === 'magnet') return s.crystals.some((c) => !c.taken && near(c.x, c.z, 16));
    return true;
  }

  /** A bolt heading for the rover or a meteor ring under it: which way to swerve (0: none). */
  private threat(): number {
    const s = this.sim, v = s.rover;
    const rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw);
    for (const b of s.bolts) {
      const dx = v.x - b.x, dz = v.z - b.z, sp = Math.hypot(b.vx, b.vz) || 1;
      const ux = b.vx / sp, uz = b.vz / sp;
      const along = dx * ux + dz * uz;
      if (along < 0 || along > 14) continue;
      const miss = dx * uz - dz * ux;
      if (Math.abs(miss) > 2.4) continue;
      // swerve to the side the rover already leans to
      const side = (ux * rz - uz * rx) * Math.sign(miss || 1);
      return side >= 0 ? 0.8 : -0.8;
    }
    for (const m of s.meteors) {
      const R = (m.big ? 4.6 : 3.4) + 1;
      const d = Math.hypot(m.x - v.x, m.z - v.z);
      if (d < R && m.t < 1.2) { const side = (m.x - v.x) * rx + (m.z - v.z) * rz; return side > 0 ? 0.9 : -0.9; }
    }
    return 0;
  }

  /** A point back along a ramp's axis from the tile before it, as far as the ground allows (up to 6 m). */
  private runUp(pre: number, dx: number, dz: number): { x: number; z: number } {
    const L = this.sim.c, c = pre % L.cols, r = (pre - c) / L.cols;
    const x0 = (c + 0.5) * TILE, z0 = (r + 0.5) * TILE;
    let k = 0;
    for (const step of [2, 4, 6, 8, 10]) {
      const q = this.tileOf(x0 - dx * step, z0 - dz * step);
      if (this.blocked[q] || this.tile(q).k !== 'ground' || this.tile(q).L !== this.tile(pre).L) break;
      k = step;
    }
    return { x: x0 - dx * k, z: z0 - dz * k };
  }

  private waiting(t: Target, dT: number): boolean {
    return (t.stop === true && dT < 14) || this.trainAhead() || this.gateAhead();
  }

  /** The farthest waypoint in a clear straight line, and whether the way there takes a ramp or a jump. */
  private aimPoint(): { x: number; z: number; jump: boolean; ramp: boolean; line?: boolean; back?: boolean } {
    const s = this.sim, v = s.rover, L = s.c, P = this.path;
    const at = (q: number) => { const c = q % L.cols, r = (q - c) / L.cols; return { x: (c + 0.5) * TILE, z: (r + 0.5) * TILE }; };
    // drop waypoints already passed
    const here = this.tileOf(v.x, v.z);
    const k = P.indexOf(here);
    if (k >= 0 && k + 1 > this.i) this.i = k + 1;
    if (this.i >= P.length) { const p = at(P[P.length - 1] ?? here); return { ...p, jump: false, ramp: false }; }
    let best = this.i;
    for (let j = this.i; j < Math.min(P.length, this.i + 8); j++) {
      const special = this.jumpFrom[P[j]] === 1 || this.tile(P[j]).k === 'ramp';
      if (special && j >= 1) {
        // line up on the ramp's axis (from the tile before it), then drive along it
        const a0 = at(P[j - 1]), a1 = at(P[j]);
        const ux = a1.x - a0.x, uz = a1.z - a0.z, ul = Math.hypot(ux, uz) || 1;
        const dx = ux / ul, dz = uz / ul;
        const along = (v.x - a0.x) * dx + (v.z - a0.z) * dz;
        const off = Math.abs((v.x - a0.x) * dz - (v.z - a0.z) * dx);
        let hd = Math.atan2(dx, dz) - v.yaw;
        while (hd > Math.PI) hd -= Math.PI * 2;
        while (hd < -Math.PI) hd += Math.PI * 2;
        const jump = this.jumpFrom[P[j]] === 1 || this.jumpFrom[P[j + 1] ?? -1] === 1;
        if (along > -12) {
          const lined = off < 1.3 && Math.abs(hd) < 0.6;
          // a kicker taken crooked or slow ends in the gap: never go up one unless lined up
          if (jump && !lined && along > -2.5 && along < 1.5) { this.approach = -1; const back = this.runUp(P[j - 1], dx, dz); return { x: back.x, z: back.z, jump: false, ramp: true, line: true }; }
          if (lined || along > 1.5 || this.approach === P[j]) {
            // on the axis: straight up the ramp
            if (lined || along > 1.5) this.approach = P[j];
            // pure pursuit along the axis: a point a few metres ahead of the rover's place on it
            const ahead = along + (lined ? 7 : 4.5);
            return { x: a0.x + dx * ahead, z: a0.z + dz * ahead, jump: jump && off < 1.6, ramp: true, line: off > 1.2 };
          }
          // not lined up: first to a point well back on the axis, then turn in
          const back = this.runUp(P[j - 1], dx, dz);
          if (Math.hypot(back.x - v.x, back.z - v.z) < 3) this.approach = P[j];
          return { x: back.x, z: back.z, jump: false, ramp: true, line: true };
        }
        best = j - 1;
        break;
      }
      if (this.clear(v.x, v.z, at(P[j]).x, at(P[j]).z)) best = j; else break;
    }
    const p = at(P[best]);
    // a jump edge ahead: aim along the kicker's line
    const jump = P.slice(this.i, best + 2).some((q) => this.jumpFrom[q] === 1);
    const ramp = P.slice(this.i, best + 1).some((q) => this.tile(q).k === 'ramp');
    return { x: p.x, z: p.z, jump, ramp };
  }

  /** A straight drive without steps, ramps, holes or obstacles in the way. */
  private clear(x0: number, z0: number, x1: number, z1: number): boolean {
    const s = this.sim, L = s.c;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const h0 = s.ter.tileAt(x0, z0)?.L ?? -1;
    for (let k = 0.5; k < d; k += 1) {
      const x = x0 + ((x1 - x0) * k) / d, z = z0 + ((z1 - z0) * k) / d;
      for (const [ox, oz] of [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) {
        const q = this.tileOf(x + ox, z + oz), t = this.tile(q);
        if (!t || t.k !== 'ground' || this.blocked[q] || t.L !== h0) return false;
      }
      if (s.ter.ground(x, z) <= ABYSS + 1) return false;
    }
    for (const o of L.obstacles) {
      const r = (o.box ? Math.max(o.box[0], o.box[1]) : o.r) + 1.4;
      if (segDist(o.x, o.z, x0, z0, x1, z1) < r) return false;
    }
    return true;
  }

  private trainAhead(): boolean {
    const s = this.sim, v = s.rover;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    for (let i = 0; i < s.c.tracks.length; i++) {
      const tr = s.c.tracks[i];
      const across = tr.axis === 'x' ? v.z : v.x;
      const toward = tr.axis === 'x' ? fz : fx;
      const gap = tr.at - across;
      if (Math.abs(gap) > 9 || gap * toward <= 0 && Math.abs(gap) > TRAIN.width) continue;
      // will a train be over the crossing in the next few seconds?
      const along = tr.axis === 'x' ? v.x : v.z;
      for (let dtk = 0; dtk <= 3.2; dtk += 0.4) {
        const p = s.trainPos(i, s.clock + dtk);
        if (!p.on) continue;
        const lo = Math.min(p.head, p.tail) - 4, hi = Math.max(p.head, p.tail) + 4;
        if (along > lo && along < hi) return true;
      }
    }
    return false;
  }

  private gateAhead(): boolean {
    const s = this.sim, v = s.rover;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    for (let i = 0; i < s.c.gates.length; i++) {
      const g = s.c.gates[i];
      const dx = g.x - v.x, dz = g.z - v.z, d = Math.hypot(dx, dz);
      if (d > 9 || d < 1.5 || (dx * fx + dz * fz) / d < 0.6) continue;
      // on now, or on before the rover is through
      if (s.gateOn(i) || s.gateOn(i, s.clock + d / Math.max(4, Math.abs(v.speed)) + 0.4)) return true;
    }
    return false;
  }
}

function segDist(px: number, pz: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l2)) : 0;
  return Math.hypot(px - (x0 + dx * k), pz - (z0 + dz * k));
}
