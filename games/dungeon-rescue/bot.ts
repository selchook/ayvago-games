// Dungeon Rescue: the autopilot. It plays a level by its plan (`route` in levels.ts: go here, use
// that, throw there, sit the crew down, take the Chief's keys), finding its own way between the steps
// (a grid path) and sneaking: before it steps into a cell it checks every awake guard's cone (with a
// margin for the head's sweep and the next few steps) and waits for a gap; caught in the open, it
// backs off to a cell nobody watches; after a catch it picks the plan up again at its last campfire.
// It drives the menu's live backdrop, the store art and the check that every level can be finished.
import { MOVE } from './defs';
import { Sim, NO_INPUT, cellX, cellZ, type Input, type Thing, type Guard } from './sim';
import type { C2, Step } from './levels';

const NB4: C2[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ang = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Bot {
  /** The step of the plan being done (past the end: done). */
  i = 0;
  private cpI = 0;
  private t = 0;
  private path: C2[] = [];
  private goal: C2 | null = null;
  private pathT = 0;
  private waited = 0;
  private hold = 0;
  private flip = false;
  private lever0: boolean | null = null;
  private thrown = false;
  private stuck = 0;
  private last: [number, number] = [0, 0];
  /** How careful: 1 sneaks, lower takes more chances (the menu backdrop). */
  patience = 1;
  /** after a bait: run on to the lever even with the Chief at the knight's heels */
  private dash = false;

  constructor(private sim: Sim) {}

  reset(): void {
    this.i = this.cpI;
    // skip ahead past what is already done (an opened cell, a pulled lever)
    for (let guard = 0; guard < 40; guard++) {
      const j = this.sim.c.route.findIndex((st, k) => k >= this.i && (st[0] === 'act' || st[0] === 'steal'));
      if (j < 0) break;
      const st = this.sim.c.route[j];
      const done = st[0] === 'steal' ? this.sim.stats.outwit || this.sim.phase > 0 : (() => { const th = this.sim.thingAt(st[1] as number, st[2] as number); return !!th && this.doneWith(th, true); })();
      if (!done) break;
      this.i = j + 1;
    }
    this.path = []; this.goal = null; this.waited = 0; this.hold = 0; this.lever0 = null; this.thrown = false; this.stuck = 0; this.dash = false;
  }

  private get step(): Step | null { return this.sim.c.route[this.i] ?? null; }
  private next(): void { this.i++; this.path = []; this.goal = null; this.waited = 0; this.hold = 0; this.lever0 = null; this.thrown = false; this.stuck = 0; }

  input(): Input {
    const s = this.sim, h = s.hero;
    const inp: Input = { ...NO_INPUT };
    if (h.state === 'caught' || h.state === 'fall') { this.reset(); return inp; }
    if (h.state !== 'play' && h.state !== 'hidden') return inp;
    this.t += 1 / 60;
    if (h.state === 'hidden') {
      // out again once nobody is looking for us, or when the Chief has walked into the trap
      const st = this.step;
      const trap = s.c.trap;
      const forLever = st && st[0] === 'act' && trap && st[1] === trap.lever[0] && st[2] === trap.lever[1];
      if (forLever ? this.chiefReady() : !s.guards.some((g) => g.state === 'chase' || g.state === 'search' || g.state === 'check')) { inp.actPressed = true; }
      return inp;
    }
    // the plan
    for (let guard = 0; guard < 4; guard++) {
      const st = this.step;
      if (!st) return this.goExit(inp);
      const r = this.run(st, inp);
      if (r === 'done') { this.next(); continue; }
      return inp;
    }
    return inp;
  }

  // ---------------------------------------------------------------- the steps

  private run(st: Step, inp: Input): 'done' | 'busy' {
    const s = this.sim, h = s.hero;
    switch (st[0]) {
      case 'cp': this.cpI = this.i + 1; return 'done';
      case 'wait': this.hold += 1 / 60; return this.hold >= st[1] ? 'done' : 'busy';
      case 'crew': {
        const waiting = s.crewWaiting;
        if ((st[1] === 'wait') === waiting || !s.followers.some((f) => f.mode !== 'cell')) return 'done';
        inp.crewPressed = true;
        return 'busy';
      }
      case 'go': return this.goTo([st[1], st[2]], inp, 0.5) ? 'done' : 'busy';
      case 'exit': this.goExit(inp); return 'busy';
      case 'throw': {
        if (this.thrown) { this.hold += 1 / 60; return this.hold > 0.7 ? 'done' : 'busy'; }
        if (h.throws <= 0 && s.stats.coins <= 0) return 'done';
        const aim: [number, number] = [cellX(st[1]), cellZ(st[2])];
        inp.aim = aim;
        if (!this.flip) { inp.throwHeld = true; this.flip = true; return 'busy'; }
        inp.throwReleased = true; this.flip = false; this.thrown = true;
        return 'busy';
      }
      case 'power': {
        if (!h.bag.length) return 'done';
        if (h.bag[0] === 'powder') return this.powder(inp, st[1] ?? -1);
        // a decoy for the Chief: only once he is in earshot
        const b = s.boss;
        if (h.bag[0] === 'decoy' && b && !s.stats.outwit && Math.hypot(b.x - h.x, b.z - h.z) > 15 && this.hold < 40) { this.hold += 1 / 60; this.keepSafe(inp); return 'busy'; }
        if (h.bag[0] === 'decoy' && st[2] !== undefined) inp.aim = [cellX(st[1]!), cellZ(st[2])];
        inp.powerPressed = true;
        return 'done';
      }
      case 'hide': {
        const th = s.thingAt(st[1], st[2]);
        if (!th) return 'done';
        if (!this.near(th, inp)) return 'busy';
        inp.actPressed = true;
        return 'done';
      }
      case 'steal': return this.steal(inp);
      case 'bait': {
        // wait where the Chief will see the knight; off once he is close and coming
        const b = s.boss;
        if (!b || s.stats.outwit || s.phase !== 1) return 'done';
        const d = Math.hypot(b.x - h.x, b.z - h.z);
        if ((b.state === 'chase' || b.state === 'search') && d < 5.5) { this.dash = true; return 'done'; }
        const gx = cellX(st[1]), gz = cellZ(st[2]);
        if (Math.hypot(gx - h.x, gz - h.z) > 0.4) {
          if (d < 3.5) { this.dash = false; this.flee(inp); return 'busy'; }
          const p = s.findPath([Sim.toC(h.x), Sim.toC(h.z)], [st[1], st[2]], false, false);
          const c = p?.[0] ?? [st[1], st[2]];
          this.moveToward(cellX(c[0]), cellZ(c[1]), inp, true);
          return 'busy';
        }
        h.yaw = Math.atan2(b.x - h.x, b.z - h.z);
        return 'busy';
      }
      case 'act': {
        const th = s.thingAt(st[1], st[2]) ?? s.things.find((t) => t.c === st[1] && t.r === st[2] && !t.taken) ?? null;
        if (!th || this.doneWith(th)) return 'done';
        if (!this.near(th, inp)) return 'busy';
        // face it and use it (hold for a lock)
        h.yaw = Math.atan2(th.x - h.x, th.z - h.z);
        if (th.kind === 'celldoor' && h.keys <= 0) {
          if (this.danger(h.x, h.z, 0.3, true)) { this.backOff(inp); return 'busy'; }
          inp.act = true;
          return 'busy';
        }
        // the Chief's trap lever: only once he is in the pen or on the trapdoor (throw again if he
        // does not come)
        const trap = s.c.trap;
        if (th.kind === 'lever' && trap && trap.lever[0] === th.c && trap.lever[1] === th.r && !s.stats.outwit && this.lever0 === null) {
          if (!this.chiefReady()) {
            this.waited += 1 / 60;
            this.keepSafe(inp);
            if (this.waited > 9) { const k = s.c.route.slice(0, this.i).map((x) => x[0]).lastIndexOf('throw'); if (k >= 0) { this.i = k - 1; this.next(); } }
            return 'busy';
          }
        }
        if (this.lever0 === null) this.lever0 = th.on;
        inp.actPressed = !this.flip; this.flip = !this.flip;
        return 'busy';
      }
    }
    return 'done';
  }

  private doneWith(th: Thing, settled = false): boolean {
    switch (th.kind) {
      case 'celldoor': return th.want > 0.5;
      case 'lever': return settled ? false : this.lever0 !== null && th.on !== this.lever0;
      case 'torch': return !th.on;
      case 'chest': return th.want > 0.5;
      default: return false;
    }
  }

  /** Standing and waiting: step aside to a refuge when a guard is about to look this way. */
  private keepSafe(inp: Input): void {
    const s = this.sim, h = s.hero;
    this.ensurePreds();
    if (this.safeRoute(this.along([], [h.x, h.z]), 0.2)) return;
    this.plan.t = 0;
    this.path = [];
    this.decide();
    if (this.plan.kind === 'refuge' && this.plan.cell) {
      const p = s.findPath([Sim.toC(h.x), Sim.toC(h.z)], this.plan.cell, false, false);
      const c = p?.[0] ?? this.plan.cell;
      this.moveToward(cellX(c[0]), cellZ(c[1]), inp, false);
    }
  }

  /** The Chief stands where the lever will catch him. */
  private chiefReady(): boolean {
    const s = this.sim, b = s.boss, trap = s.c.trap;
    if (!b || !trap) return true;
    if (trap.area) {
      const [[c0, r0], [c1, r1]] = trap.area;
      const c = Sim.toC(b.x), r = Sim.toC(b.z);
      return c >= c0 && c <= c1 && r >= r0 && r <= r1 && (b.state === 'search' || b.state === 'chase' || b.state === 'check');
    }
    return !!trap.doors?.some(([c, r]) => Math.hypot(cellX(c) - b.x, cellZ(r) - b.z) < 0.7);
  }

  /** Walks next to a thing (an open side, the nearest by path). */
  private near(th: Thing, inp: Input): boolean {
    const s = this.sim, h = s.hero;
    let px = th.x, pz = th.z;
    if (th.kind === 'torch') { px = th.x + th.dc * 2; pz = th.z + th.dr * 2; }
    const d = Math.hypot(px - h.x, pz - h.z);
    const tg = s.target();
    const reach = th.kind === 'barrel' || th.kind === 'crate' || th.kind === 'celldoor' || th.kind === 'chest' ? MOVE.reach + 0.55 : MOVE.reach * 0.95;
    if (d < reach && (tg?.th === th || th.kind === 'barrel' || th.kind === 'crate')) return true;
    // the best side
    let best: C2 | null = null, bd = Infinity;
    const cells: C2[] = th.kind === 'torch' ? [[th.c + th.dc, th.r + th.dr]] : s.walkable(th.c, th.r) ? [[th.c, th.r]] : NB4.map(([dc, dr]) => [th.c + dc, th.r + dr] as C2);
    for (const c of cells) {
      if (!s.walkable(c[0], c[1])) continue;
      const p = s.findPath([Sim.toC(h.x), Sim.toC(h.z)], c, false, false);
      const len = p ? p.length : Infinity;
      if (len < bd) { bd = len; best = c; }
    }
    if (!best) return true;
    return this.goTo(best, inp, 0.35) && d < reach;
  }

  private goExit(inp: Input): Input {
    const s = this.sim, h = s.hero;
    // the last steps: straight for the stairs, whatever is behind
    const ex = cellX(s.c.exit[0]), ez = cellZ(s.c.exit[1]);
    if (!h.atExit && Math.hypot(ex - h.x, ez - h.z) < 2.6 && s.los(h.x, h.z, ex, ez)) { this.moveToward(ex, ez, inp, false); return inp; }
    if (this.goTo(s.c.exit, inp, 0.4) || h.atExit) inp.actPressed = !this.flip, this.flip = !this.flip;
    return inp;
  }

  /** Sleepy powder: close in on the guard from where he is not looking, then puff. */
  private powder(inp: Input, gi: number): 'done' | 'busy' {
    const s = this.sim, h = s.hero;
    const g = gi >= 0 ? s.guards[gi] : s.boss && s.awake(s.boss) ? s.boss : s.guards.filter((x) => s.awake(x)).sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
    if (!g || !s.awake(g)) return 'done';
    const d = Math.hypot(g.x - h.x, g.z - h.z);
    if (g.boss) {
      // the Chief only from behind: wait out of his sight, then close in on his back
      const back = Math.abs(ang(Math.atan2(h.x - g.x, h.z - g.z) - g.yaw)) > 1.9;
      if (d < 2.2 && back) { h.yaw = Math.atan2(g.x - h.x, g.z - h.z); inp.powerPressed = true; return 'done'; }
      if (this.chiefLooking(g)) { this.keepSafe(inp); return 'busy'; }
      this.moveToward(g.x - Math.sin(g.yaw) * 1.4, g.z - Math.cos(g.yaw) * 1.4, inp, false);
      return 'busy';
    }
    if (d < 2.3) { h.yaw = Math.atan2(g.x - h.x, g.z - h.z); inp.powerPressed = true; return 'done'; }
    // the boss only from behind: aim for the spot behind him
    const bx = g.boss ? g.x - Math.sin(g.yaw) * 1.6 : g.x, bz = g.boss ? g.z - Math.cos(g.yaw) * 1.6 : g.z;
    const watching = Math.abs(ang(Math.atan2(h.x - g.x, h.z - g.z) - (g.yaw + g.head))) < s.fovOf(g) + 0.35 && d < 5;
    if (watching && this.waited < 6) { this.waited += 1 / 60; return 'busy'; }
    this.moveToward(bx, bz, inp, false);
    return 'busy';
  }

  /** The Chief faces the knight (or is about to): no time to creep up on him. */
  private chiefLooking(b: Guard): boolean {
    const s = this.sim, h = s.hero;
    const d = Math.hypot(h.x - b.x, h.z - b.z);
    return s.sees(b, h.x, h.z) || (Math.abs(ang(Math.atan2(h.x - b.x, h.z - b.z) - b.yaw)) < 1.6 && d < 9) || (b.wait > 0 && d < 6);
  }

  /** The key ring: in behind the Chief while he walks away or dozes, hold ACT. */
  private steal(inp: Input): 'done' | 'busy' {
    const s = this.sim, h = s.hero, b = s.boss;
    if (!b || s.stats.outwit || s.phase > 0) return 'done';
    if (s.canSteal(b)) { inp.act = true; return 'busy'; }
    const behindX = b.x - Math.sin(b.yaw) * 1.3, behindZ = b.z - Math.cos(b.yaw) * 1.3;
    if (b.state !== 'doze' && this.chiefLooking(b)) {
      // keep out of his sight until he turns his back
      this.keepSafe(inp);
      return 'busy';
    }
    this.moveToward(behindX, behindZ, inp, false);
    return 'busy';
  }

  // ---------------------------------------------------------------- sneaking

  /** Would a guard see this spot now or in a moment? */
  danger(x: number, z: number, margin = 0, now = false): boolean {
    const s = this.sim;
    for (const g of s.guards) {
      if (!s.awake(g) && g.state !== 'daze') continue;
      if (g.state === 'daze') continue;
      const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
      if (d < (now ? 1.4 : 2.6) * (g.boss ? 1.3 : 1)) return true;
      const R = s.rangeAt(g, x, z) + (now ? 0.3 : 1.3 + margin);
      if (d > R) continue;
      const a = Math.atan2(dx, dz);
      const fov = s.fovOf(g) + (now ? 0.1 : 0.55 + margin);
      const nh = now ? null : s.nextHeading(g);
      const aimed = Math.abs(ang(a - s.lookOf(g))) < fov || (!now && Math.abs(ang(a - g.yaw)) < fov + (g.def.p.length === 1 || g.wait > 0 || g.state === 'search' ? 1.1 : 0.2))
        || (nh !== null && Math.abs(ang(a - nh)) < fov + 0.5);
      if (!aimed) continue;
      if (s.los(g.x, g.z, x, z)) return true;
    }
    return false;
  }

  private backOff(inp: Input): void {
    const s = this.sim, h = s.hero;
    const c0 = Sim.toC(h.x), r0 = Sim.toC(h.z);
    let best: C2 | null = null, bd = Infinity;
    for (let r = r0 - 3; r <= r0 + 3; r++) for (let c = c0 - 3; c <= c0 + 3; c++) {
      if (!s.walkable(c, r) || this.danger(cellX(c), cellZ(r), 0.3)) continue;
      const p = s.findPath([c0, r0], [c, r], false, false);
      if (!p || p.length > 5) continue;
      if (p.some(([pc, pr]) => this.danger(cellX(pc), cellZ(pr), -0.6, true))) continue;
      const d = p.length;
      if (d < bd) { bd = d; best = [c, r]; }
    }
    if (best) this.moveToward(cellX(best[0]), cellZ(best[1]), inp, true);
  }

  // ---------------------------------------------------------------- looking ahead

  private preds: { x: number; z: number; look: number; awake: boolean }[][] = [];
  private predT = 0;
  private plan: { kind: 'move' | 'stay' | 'refuge'; cell: C2 | null; t: number } = { kind: 'move', cell: null, t: 0 };
  private static readonly STEP = 0.2;
  private static readonly HORIZON = 3.2;

  private ensurePreds(): void {
    this.predT -= 1 / 60;
    if (this.predT > 0 && this.preds.length) return;
    const s = this.sim;
    this.preds = s.guards.map((g) => s.predict(g, Bot.HORIZON, Bot.STEP));
    this.predT = Bot.STEP;
  }

  /** Does some guard see this point at sample k (with a margin)? */
  private seenAt(x: number, z: number, k: number, margin: number): boolean {
    const s = this.sim;
    for (let i = 0; i < s.guards.length; i++) {
      const pr = this.preds[i];
      if (!pr) continue;
      const p = pr[Math.min(k, pr.length - 1)];
      if (!p.awake) continue;
      const g = s.guards[i];
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.7 * (g.boss ? 1.3 : 1)) return true;
      if (d > s.rangeAt(g, x, z) + margin) continue;
      if (Math.abs(ang(Math.atan2(dx, dz) - p.look)) > s.fovOf(g) + 0.22 + margin * 0.12) continue;
      if (s.los(p.x, p.z, x, z)) return true;
    }
    return false;
  }

  /** The knight's positions every STEP walking a path (then standing at its end). */
  private along(path: C2[], from: [number, number]): [number, number][] {
    const out: [number, number][] = [];
    const speed = this.sim.k.walk * 0.92;
    let px = from[0], pz = from[1], i = 0;
    const n = Math.round(Bot.HORIZON / Bot.STEP) + 1;
    for (let k = 0; k < n; k++) {
      out.push([px, pz]);
      let left = speed * Bot.STEP;
      while (left > 0 && i < path.length) {
        const tx = cellX(path[i][0]), tz = cellZ(path[i][1]);
        const d = Math.hypot(tx - px, tz - pz);
        if (d <= left) { px = tx; pz = tz; left -= d; i++; } else { px += ((tx - px) / d) * left; pz += ((tz - pz) / d) * left; left = 0; }
      }
    }
    return out;
  }

  /** Safe to walk this way (the crew in tow) for the whole look-ahead? */
  private safeRoute(pos: [number, number][], margin: number): boolean {
    const s = this.sim;
    const crew = s.followers.filter((f) => f.mode === 'trail' || f.mode === 'join');
    for (let k = 0; k < pos.length; k++) {
      if (this.seenAt(pos[k][0], pos[k][1], k, margin)) return false;
      for (let j = 0; j < crew.length; j++) {
        const lag = Math.round(((0.95 + j * 0.95) / (s.k.walk * 0.92)) / Bot.STEP);
        const f = crew[j];
        const p = k - lag >= 0 ? pos[k - lag] : [f.x, f.z];
        if (this.seenAt(p[0], p[1], k, margin - 0.6)) return false;
      }
    }
    return true;
  }

  private decide(): void {
    const s = this.sim, h = s.hero;
    const here: [number, number] = [h.x, h.z];
    const route = this.path.slice(0, 7);
    if (this.safeRoute(this.along(route, here), 0.4)) { this.plan = { kind: 'move', cell: null, t: 0.2 }; return; }
    if (this.safeRoute(this.along([], here), 0.2)) { this.plan = { kind: 'stay', cell: null, t: 0.2 }; return; }
    // a refuge: a cell close by, safe to reach and to stand in
    const c0 = Sim.toC(h.x), r0 = Sim.toC(h.z);
    let best: C2 | null = null, bd = Infinity;
    for (let r = r0 - 4; r <= r0 + 4; r++) for (let c = c0 - 4; c <= c0 + 4; c++) {
      if (!s.walkable(c, r) || s.isTrapdoor(c, r) || s.isSpikes(c, r)) continue;
      const p = s.findPath([c0, r0], [c, r], false, false, (cc, rr) => s.isTrapdoor(cc, rr));
      if (!p || p.length > 6 || p.length >= bd) continue;
      if (!this.safeRoute(this.along(p, here), 0)) continue;
      bd = p.length; best = [c, r];
    }
    this.plan = best ? { kind: 'refuge', cell: best, t: 0.4 } : { kind: 'stay', cell: null, t: 0.2 };
  }

  /** Along a grid path to a cell, waiting for gaps; true when there. */
  private goTo(goal: C2, inp: Input, tol: number): boolean {
    const s = this.sim, h = s.hero;
    const gx = cellX(goal[0]), gz = cellZ(goal[1]);
    if (Math.hypot(gx - h.x, gz - h.z) < tol) return true;
    this.pathT -= 1 / 60;
    if (!this.goal || this.goal[0] !== goal[0] || this.goal[1] !== goal[1] || this.pathT <= 0 || !this.path.length) {
      this.goal = goal;
      this.pathT = 0.5;
      // round trapdoors (they give way); over spikes only when there is no other way
      this.path = s.findPath([Sim.toC(h.x), Sim.toC(h.z)], goal, false, true, (c, r) => s.isTrapdoor(c, r) || s.isSpikes(c, r))
        ?? s.findPath([Sim.toC(h.x), Sim.toC(h.z)], goal, false, true, (c, r) => s.isTrapdoor(c, r))
        ?? s.findPath([Sim.toC(h.x), Sim.toC(h.z)], goal, false) ?? [];
    }
    // skip cells already reached
    while (this.path.length > 1 && Math.hypot(cellX(this.path[0][0]) - h.x, cellZ(this.path[0][1]) - h.z) < 0.45) this.path.shift();
    const nx = this.path[0];
    if (!nx) return true;
    const chased = s.guards.some((g) => g.state === 'chase' || g.state === 'charge');
    if (chased && !this.dash) { this.flee(inp); return false; }
    if (this.dash) { this.moveToward(cellX(nx[0]), cellZ(nx[1]), inp, true); return false; }
    // spikes: step on only right after they sink (a run of them needs the whole gap)
    const onSpikes = s.isSpikes(Sim.toC(h.x), Sim.toC(h.z));
    let run = 0;
    for (const [pc, pr] of this.path) { if (!s.isSpikes(pc, pr)) break; run++; }
    const spikeBad = !onSpikes && run > 0 && (s.spikeUp > 0 || s.spikeIn() < run * 0.75 + 0.5 || s.spikeIn() > 2.05);
    this.ensurePreds();
    this.plan.t -= 1 / 60;
    if (this.plan.t <= 0) this.decide();
    const impatient = this.waited > 25 * this.patience;
    if (this.plan.kind === 'refuge' && this.plan.cell && !impatient) {
      this.waited += 1 / 60;
      const p = s.findPath([Sim.toC(h.x), Sim.toC(h.z)], this.plan.cell, false, false);
      const c = p?.[0] ?? this.plan.cell;
      this.moveToward(cellX(c[0]), cellZ(c[1]), inp, false);
      return false;
    }
    if ((this.plan.kind === 'stay' || spikeBad) && !impatient) { this.waited += 1 / 60; return false; }
    if (this.plan.kind === 'move') this.waited = Math.max(0, this.waited - 1 / 120);
    this.moveToward(cellX(nx[0]), cellZ(nx[1]), inp, impatient && !spikeBad);
    // unstick
    if (Math.hypot(h.x - this.last[0], h.z - this.last[1]) < 0.02) { this.stuck += 1 / 60; if (this.stuck > 1.2) { this.path = []; this.stuck = 0; } } else this.stuck = 0;
    this.last = [h.x, h.z];
    return false;
  }

  /** Spotted: sprint to the nearest cell the chasers cannot see, as far from them as can be. */
  private flee(inp: Input): void {
    const s = this.sim, h = s.hero;
    const chasers = s.guards.filter((g) => g.state === 'chase' || g.state === 'charge');
    const c0 = Sim.toC(h.x), r0 = Sim.toC(h.z);
    let best: C2 | null = null, bs = -Infinity;
    for (let r = r0 - 5; r <= r0 + 5; r++) for (let c = c0 - 5; c <= c0 + 5; c++) {
      if (!s.walkable(c, r)) continue;
      const x = cellX(c), z = cellZ(r);
      const p = s.findPath([c0, r0], [c, r], false, false);
      if (!p || p.length > 8) continue;
      let score = -p.length * 0.6;
      // never into another guard's eyes
      this.ensurePreds();
      if (this.seenAt(x, z, Math.min(8, p.length * 2), 0)) score -= 14;
      for (const g of s.guards) if (!chasers.includes(g) && s.awake(g) && Math.hypot(g.x - x, g.z - z) < 4) score -= 8;
      for (const g of chasers) {
        const d = Math.hypot(g.x - x, g.z - z);
        score += Math.min(d, 12);
        if (s.los(g.x, g.z, x, z)) score -= 6;
        // never through the chaser
        if (p.some(([pc, pr]) => Math.hypot(cellX(pc) - g.x, cellZ(pr) - g.z) < 1.8)) score -= 30;
      }
      if (score > bs) { bs = score; best = [c, r]; }
    }
    if (!best) return;
    const p = s.findPath([c0, r0], best, false, false);
    const nx = p?.[0] ?? best;
    this.moveToward(cellX(nx[0]), cellZ(nx[1]), inp, true);
  }

  private moveToward(x: number, z: number, inp: Input, sprint: boolean): void {
    const h = this.sim.hero;
    const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const k = Math.min(1, d / 0.5);
    inp.mx = (dx / d) * k; inp.mz = (dz / d) * k;
    inp.sprint = sprint;
  }
}

export type { Guard };
