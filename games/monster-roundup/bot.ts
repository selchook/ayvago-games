// Monster Roundup: the autopilot. It plays the sim the way a careful player would, through the same
// Input a player gives: it walks paths on the floor grid (a breadth-first search round walls, stacks,
// crates, props and locked doors), sprints after runners and back to the pod, stuns the nearest
// monster it can see (a charged shot for flyers up high, wizards and bosses), tows the dizzy ones and
// banks them, grabs snacks on the way, uses the terminal when a locked door is in its way, waits at
// laser gates that are on, backs off from biting monsters and from every boss telegraph (slam and
// leap rings, a charge's line, lobs, the beam, spikes in flight) and uses its powers.
// Used by the menu's backdrop, the store art, balance.ts and the playtest (window.__mr.auto()).
import { CELL, MECH, MONSTERS } from './defs';
import { Sim, NO_INPUT, segDist, POD_R, FIELD_R, type Input, type Mon } from './sim';
import type { Pt } from './levels';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Bot {
  private path: Pt[] = [];
  private pathFor = '';
  private pathT = 0;
  private stunHeld = 0;
  private wantCharge = false;
  private released = true;
  private stuckT = 0;
  private jig = 0;
  private jigA = 0;
  private lastX = 0;
  private lastZ = 0;
  private towCd = 0;
  private powerCd = 0;
  private sinceProgress = 0;
  private lastCaptured = 0;
  private blocked: Uint8Array | null = null;
  private blockedFor = '';

  private seed: number;
  constructor(private s: Sim, seed = 1) { this.seed = 1 + Math.abs(Math.floor(seed * 7919)) % 2147483646; }
  private rand(): number { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  reset(): void { this.path = []; this.pathFor = ''; this.stunHeld = 0; this.released = true; this.stuckT = 0; this.jig = 0; }

  // ---------------------------------------------------------------- the grid

  private cellBlocked(): Uint8Array {
    const s = this.s;
    const key = s.doors.map((d) => (d.locked ? 1 : 0)).join('') + s.crates.map((c) => (c.broken ? 1 : 0)).join('');
    if (this.blocked && key === this.blockedFor) return this.blocked;
    const b = new Uint8Array(s.cols * s.rows);
    for (let r = 0; r < s.rows; r++) for (let q = 0; q < s.cols; q++) {
      const x = (q + 0.5) * CELL, z = (r + 0.5) * CELL;
      let bl = s.solidAt(x, z);
      for (const p of s.c.stacks) if (Math.abs(x - p.x) < 1.6 && Math.abs(z - p.z) < 1.6) bl = true;
      for (const p of [...s.c.pods, ...s.c.terminals, ...s.c.turrets]) if (Math.hypot(x - p.x, z - p.z) < 1.5) bl = true;
      for (const c of s.crates) if (!c.broken && Math.hypot(x - c.x, z - c.z) < 1.5) bl = true;
      for (const p of s.c.decor) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.6) bl = true;
      s.c.doors.forEach((d, i) => { if (s.doors[i].locked && Math.abs(x - d.x) < 2 && Math.abs(z - d.z) < 2) bl = true; });
      b[r * s.cols + q] = bl ? 1 : 0;
    }
    this.blocked = b;
    this.blockedFor = key;
    return b;
  }

  /** Cells from the mech to the goal (breadth first); null when there is no way. */
  private route(gx: number, gz: number): Pt[] | null {
    const s = this.s, v = s.mech, B = this.cellBlocked();
    const C = s.cols, R = s.rows;
    const q0 = Math.floor(v.x / CELL), r0 = Math.floor(v.z / CELL);
    let gq = Math.floor(gx / CELL), gr = Math.floor(gz / CELL);
    const ok = (q: number, r: number) => q >= 0 && r >= 0 && q < C && r < R && !B[r * C + q];
    if (!ok(gq, gr)) {
      // the goal sits on a prop: the nearest open cell next to it
      let best = -1, bd = Infinity;
      for (const [dx, dz] of [...DIRS, [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const q = gq + dx, r = gr + dz;
        if (!ok(q, r)) continue;
        const d = Math.hypot((q + 0.5) * CELL - v.x, (r + 0.5) * CELL - v.z);
        if (d < bd) { bd = d; best = r * C + q; }
      }
      if (best < 0) return null;
      gq = best % C; gr = Math.floor(best / C);
    }
    const prev = new Int32Array(C * R).fill(-2);
    const start = r0 * C + q0;
    if (start < 0 || start >= C * R) return null;
    prev[start] = -1;
    const queue = [start];
    const goal = gr * C + gq;
    for (let h = 0; h < queue.length; h++) {
      const cur = queue[h];
      if (cur === goal) break;
      const q = cur % C, r = Math.floor(cur / C);
      for (const [dx, dz] of DIRS) {
        const nq = q + dx, nr = r + dz;
        if (!ok(nq, nr)) continue;
        // no corner cutting
        if (dx && dz && (!ok(q + dx, r) || !ok(q, r + dz))) continue;
        const n = nr * C + nq;
        if (prev[n] !== -2) continue;
        prev[n] = cur;
        queue.push(n);
      }
    }
    if (prev[goal] === -2) return null;
    const out: Pt[] = [];
    for (let c = goal; c !== -1 && c !== start; c = prev[c]) out.push({ x: (c % C + 0.5) * CELL, z: (Math.floor(c / C) + 0.5) * CELL });
    out.reverse();
    return out;
  }

  private pathLen(gx: number, gz: number): number {
    const p = this.route(gx, gz);
    return p ? p.length * CELL : Infinity;
  }

  /** A clear corridor (the mech's width) from a to b. */
  private wide(ax: number, az: number, bx: number, bz: number): boolean {
    const s = this.s, dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1, nx = -dz / d * 0.75, nz = dx / d * 0.75;
    return s.clearLine(ax + nx, az + nz, bx + nx, bz + nz) && s.clearLine(ax - nx, az - nz, bx - nx, bz - nz) && s.clearLine(ax, az, bx, bz) && this.noProps(ax, az, bx, bz);
  }

  private noProps(ax: number, az: number, bx: number, bz: number): boolean {
    const s = this.s;
    for (const p of [...s.c.pods, ...s.c.terminals, ...s.c.turrets]) if (segDist(p.x, p.z, ax, az, bx, bz) < 1.9) return false;
    for (const c of s.crates) if (!c.broken && segDist(c.x, c.z, ax, az, bx, bz) < 1.5) return false;
    for (const p of s.c.decor) if (segDist(p.x, p.z, ax, az, bx, bz) < p.r + 0.9) return false;
    return true;
  }

  /** The direction to walk toward a goal (string-pulled along the path). */
  private steerTo(gx: number, gz: number, key: string): [number, number] | null {
    const s = this.s, v = s.mech;
    if (this.wide(v.x, v.z, gx, gz) || (Math.hypot(gx - v.x, gz - v.z) < 3.4 && this.s.clearLine(v.x, v.z, gx, gz))) { this.path = []; return this.norm(gx - v.x, gz - v.z); }
    if (key !== this.pathFor || this.pathT <= 0 || !this.path.length) {
      const p = this.route(gx, gz);
      if (!p) return null;
      this.path = p; this.pathFor = key; this.pathT = 0.4;
    }
    // drop the cells already reached; aim at the farthest one in clear sight
    while (this.path.length > 1 && Math.hypot(this.path[0].x - v.x, this.path[0].z - v.z) < 0.9) this.path.shift();
    let tgt = this.path[0];
    for (let k = Math.min(this.path.length - 1, 5); k > 0; k--) if (this.wide(v.x, v.z, this.path[k].x, this.path[k].z)) { tgt = this.path[k]; break; }
    if (!tgt) return this.norm(gx - v.x, gz - v.z);
    return this.norm(tgt.x - v.x, tgt.z - v.z);
  }

  private norm(x: number, z: number): [number, number] { const d = Math.hypot(x, z) || 1; return [x / d, z / d]; }

  // ---------------------------------------------------------------- the plan

  input(): Input {
    const s = this.s, v = s.mech, dt = 1 / 60;
    this.pathT -= dt;
    this.towCd -= dt;
    this.powerCd -= dt;
    if (v.state !== 'play') return { ...NO_INPUT };
    if (s.captured !== this.lastCaptured) { this.lastCaptured = s.captured; this.sinceProgress = 0; } else this.sinceProgress += dt;
    const inp: Input = { ...NO_INPUT };
    let dir: [number, number] | null = null;
    let dash = false;
    let shootAt: Mon | null = null;
    let charge = false;

    const boss = s.boss;
    const cap = s.towCap;
    const dizzy = s.mons.filter((m) => m.state === 'dizzy' && !v.towing.includes(m));
    // 1: towing: bank them (or pick up one more on the way)
    const near = dizzy.filter((m) => Math.hypot(m.x - v.x, m.z - v.z) < 9 && !m.boss).sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z));
    const towBoss = v.towing.some((m) => m.boss);
    const towLow = v.towing.some((m) => m.dizzy < 4);
    if (dizzy.length && (v.towing.length < cap && !towBoss) && (!v.towing.length || (near.length && !towLow))) {
      const m = v.towing.length ? near[0] : dizzy.filter((o) => !o.boss || !v.towing.length).sort((a, b) => this.pathLen(a.x, a.z) - this.pathLen(b.x, b.z))[0];
      if (m) {
        const d = Math.hypot(m.x - v.x, m.z - v.z) - m.radius;
        if (d < s.grabR - 0.4 && this.towCd <= 0) { inp.tow = true; this.towCd = 0.3; }
        dir = d > 1.4 ? this.steerTo(m.x, m.z, 'm' + m.i) : null;
        dash = d > 5 && m.dizzy < 4;
      }
    } else if (v.towing.length) {
      const goal = this.bank(towBoss);
      if (goal) {
        // walk past the pod, so the monsters on the beam are pulled through its ring
        const d = Math.hypot(goal.x - v.x, goal.z - v.z);
        const last = v.towing[v.towing.length - 1];
        if (d > 9) dir = this.steerTo(goal.x, goal.z, 'pod' + goal.x + goal.z);
        else {
          const base = d > 4 ? Math.atan2(goal.x - v.x, goal.z - v.z) : Math.atan2(goal.x - last.x, goal.z - last.z);
          let through: Pt | null = null;
          for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.2, -2.2]) {
            const a = base + off, x = goal.x + Math.sin(a) * 3.4, z = goal.z + Math.cos(a) * 3.4;
            if (s.solidAt(x, z) || s.solidAt(x + Math.sin(a), z + Math.cos(a))) continue;
            through = { x, z };
            break;
          }
          const t = through ?? goal;
          dir = this.steerTo(t.x, t.z, 'thru' + Math.round(t.x / 2) + ',' + Math.round(t.z / 2)) ?? this.steerTo(goal.x, goal.z, 'pod' + goal.x + goal.z);
        }
        dash = d > 6 || v.towing.some((m) => m.dizzy < 3);
      }
    } else {
      // 2: hunt the best monster (or the boss)
      const loose = s.mons.filter((m) => (m.boss ? m.state !== 'captured' && m.state !== 'gone' && m.state !== 'dizzy' : s.loose(m) && m.state !== 'blink'));
      let tgt: Mon | null = null, best = Infinity;
      for (const m of loose) {
        const pl = this.pathLen(m.x, m.z);
        const close = Math.hypot(m.x - v.x, m.z - v.z);
        const threat = !m.boss && (s.biter(m) || m.def?.kind === 'spiky') && close < 6.5 ? -12 : 0;
        const sc = pl + threat + (m.minion && boss && boss.state !== 'dizzy' ? 6 : 0) + (m.boss ? -4 : 0) + (MONSTERS[m.kind ?? 'mushnub']?.kind === 'flyer' ? 2 : 0);
        if (sc < best) { best = sc; tgt = m; }
      }
      if (!tgt && loose.length && !s.unlocked && s.c.terminals.length) {
        const t = s.c.terminals[0];
        dir = Math.hypot(t.x - v.x, t.z - v.z) > 1.4 ? this.steerTo(t.x, t.z, 'term') : null;
      } else if (tgt) {
        const d = Math.hypot(tgt.x - v.x, tgt.z - v.z);
        const see = s.clearLine(v.x, v.z, tgt.x, tgt.z);
        const flyHigh = tgt.def?.kind === 'flyer' && tgt.y > 1.2;
        charge = !!tgt.boss || flyHigh || tgt.def?.kind === 'blinker' || (tgt.hp >= 3 && d > 3);
        const range = tgt.boss ? 9 : 8;
        if (see && d < range) {
          shootAt = tgt;
          // keep a little distance from biters and bosses, else close in a bit
          const keep = tgt.boss ? 6.5 : s.biter(tgt) ? 4.5 : 3;
          if (d < keep) dir = this.norm(v.x - tgt.x, v.z - tgt.z);
          else if (d > range - 2) dir = this.norm(tgt.x - v.x, tgt.z - v.z);
          if (tgt.boss && dir) { const a = Math.atan2(tgt.x - v.x, tgt.z - v.z) + Math.PI / 2; dir = this.norm(dir[0] + Math.sin(a) * 0.6, dir[1] + Math.cos(a) * 0.6); }
        } else {
          dir = this.steerTo(tgt.x, tgt.z, 'm' + tgt.i);
          dash = d > 7 && (tgt.state === 'flee' || tgt.def?.kind === 'runner');
        }
      } else if (s.exitOpen && s.c.exit) {
        dir = this.steerTo(s.c.exit.x, s.c.exit.z, 'exit');
      }
      // a quick snack on the way
      if (!shootAt && !v.towing.length) for (const sn of s.snacks) if (sn.on && Math.hypot(sn.x - v.x, sn.z - v.z) < 4 && s.clearLine(v.x, v.z, sn.x, sn.z)) { dir = this.norm(sn.x - v.x, sn.z - v.z); break; }
    }
    // a long while without a capture with the exit open: leave
    if (this.sinceProgress > 70 && s.exitOpen && s.c.exit) dir = this.steerTo(s.c.exit.x, s.c.exit.z, 'exit');

    // 3: danger first
    const away = this.danger();
    if (away) { dir = away; dash = v.energy > 25; }
    // laser gates: wait in front of one that is on (or about to be)
    if (dir && !away) dir = this.laserWait(dir);

    // 4: shoot: face the target, hold for a charged shot, release
    if (shootAt) {
      const want = charge ? s.chargeTime + 0.05 : 0.04;
      if (this.released) { this.stunHeld = 0; this.released = false; this.wantCharge = charge; }
      this.stunHeld += dt;
      inp.stun = this.stunHeld < (this.wantCharge ? want : 0.04);
      if (!inp.stun) this.released = true;
      if (!dir) { const a = Math.atan2(shootAt.x - v.x, shootAt.z - v.z); dir = [Math.sin(a) * 0.15, Math.cos(a) * 0.15]; }
    } else if (!this.released) { inp.stun = false; this.released = true; }

    // 5: powers
    if (v.power && this.powerCd <= 0) {
      const close = s.mons.filter((m) => s.shootable(m) && Math.hypot(m.x - v.x, m.z - v.z) < 8).length;
      const p = v.power;
      if ((p === 'freeze' && (close >= 2 || (boss && boss.state.startsWith('b-') && Math.hypot(boss.x - v.x, boss.z - v.z) < 9))) ||
        (p === 'shield' && (away || (boss && boss.state === 'b-windup'))) || (p === 'spread' && shootAt) || (p === 'magnet' && dizzy.length) || (p === 'decoy' && close >= 2)) {
        inp.power = true; this.powerCd = 1;
      }
    }

    // stuck: a short wiggle
    const moved = Math.hypot(v.x - this.lastX, v.z - this.lastZ);
    this.lastX = v.x; this.lastZ = v.z;
    if (dir && Math.hypot(dir[0], dir[1]) > 0.5 && moved < 0.01) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.6) { this.jig = 0.4; this.jigA = this.rand() * Math.PI * 2; this.stuckT = 0; this.pathT = 0; }
    if (this.jig > 0) { this.jig -= dt; dir = [Math.sin(this.jigA), Math.cos(this.jigA)]; }

    if (dir) { inp.mx = dir[0]; inp.mz = dir[1]; }
    inp.dash = dash && v.energy > 15;
    return inp;
  }

  /** Where to bank: the nearest pod by path (the field for a boss). */
  private bank(boss: boolean): Pt | null {
    const s = this.s;
    if (boss || !s.c.pods.length) return s.c.field;
    let best: Pt | null = null, bd = Infinity;
    for (const p of [...s.c.pods, ...(s.c.field ? [s.c.field] : [])]) { const d = this.pathLen(p.x, p.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  /** A way out of the nearest danger, or null. */
  private danger(): [number, number] | null {
    const s = this.s, v = s.mech;
    let fx = 0, fz = 0, any = false;
    const push = (x: number, z: number, w: number) => { const d = Math.hypot(v.x - x, v.z - z) || 0.1; fx += ((v.x - x) / d) * w; fz += ((v.z - z) / d) * w; any = true; };
    for (const m of s.mons) {
      if (m.state === 'windup' && Math.hypot(m.x - v.x, m.z - v.z) < 3.2) push(m.x, m.z, 1);
      if (m.def?.kind === 'spiky' && s.loose(m) && Math.hypot(m.x - v.x, m.z - v.z) < 2.6) push(m.x, m.z, 1);
      if (!m.boss) continue;
      const d = Math.hypot(m.x - v.x, m.z - v.z);
      if (m.state === 'b-windup' || m.state === 'b-act') {
        const a = m.attack;
        if ((a === 'slam') && d < 5.2) push(m.x, m.z, 1.5);
        if ((a === 'leap' || a === 'lob') && Math.hypot(m.aim.x - v.x, m.aim.z - v.z) < 4.6) push(m.aim.x, m.aim.z, 1.5);
        if (a === 'charge' || a === 'beam') {
          const ex = m.x + Math.sin(m.aimYaw) * 16, ez = m.z + Math.cos(m.aimYaw) * 16;
          const sd = segDist(v.x, v.z, m.x, m.z, ex, ez);
          if (sd < 3.4) {
            // step sideways off the line
            const side = (v.x - m.x) * Math.cos(m.aimYaw) - (v.z - m.z) * Math.sin(m.aimYaw) >= 0 ? 1 : -1;
            fx += Math.cos(m.aimYaw) * side * 1.6; fz += -Math.sin(m.aimYaw) * side * 1.6; any = true;
          }
          if (a === 'beam' && d < 4) push(m.x, m.z, 1);
        }
      } else if (s.loose(m) && d < 3.6 && m.state !== 'b-daze') push(m.x, m.z, 1);
    }
    for (const sh of s.shots) {
      const d = Math.hypot(sh.x - v.x, sh.z - v.z);
      if (d > 4.5) continue;
      // is it coming this way?
      if ((v.x - sh.x) * sh.vx + (v.z - sh.z) * sh.vz <= 0) continue;
      const sp = Math.hypot(sh.vx, sh.vz);
      const side = (v.x - sh.x) * sh.vz - (v.z - sh.z) * sh.vx >= 0 ? 1 : -1;
      fx += (sh.vz / sp) * side * 1.2; fz += (-sh.vx / sp) * side * 1.2; any = true;
    }
    for (const l of s.lobs) if (Math.hypot(l.x - v.x, l.z - v.z) < 2.6) push(l.x, l.z, 1.4);
    for (const w of s.waves) if (w.color === 'boss' && !w.hit && Math.abs(Math.hypot(v.x - w.x, v.z - w.z) - w.r) < 2.2 && Math.hypot(v.x - w.x, v.z - w.z) > w.r) push(w.x, w.z, 1);
    for (let i = 0; i < s.c.turrets.length; i++) {
      const t = s.c.turrets[i], [ex, ez] = s.turretEnd(i);
      if (segDist(v.x, v.z, t.x, t.z, ex, ez) < 2.0) {
        const ang = s.turretA[i], dir = i % 2 ? -1 : 1;
        // step against the sweep
        fx += -Math.cos(ang) * dir * 1.2; fz += Math.sin(ang) * dir * 1.2; any = true;
      }
    }
    if (!any) return null;
    // keep out of walls: if the way is shut, try the sides
    const d = Math.hypot(fx, fz) || 1;
    let a = Math.atan2(fx / d, fz / d);
    for (let k = 0; k < 6; k++) {
      const ta = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
      const x = v.x + Math.sin(ta) * 1.6, z = v.z + Math.cos(ta) * 1.6;
      if (!s.solidAt(x, z)) { a = ta; break; }
    }
    return [Math.sin(a), Math.cos(a)];
  }

  /** Stops short of a laser gate that is on (or will be on before the mech is through). */
  private laserWait(dir: [number, number]): [number, number] {
    const s = this.s, v = s.mech;
    for (let i = 0; i < s.c.lasers.length; i++) {
      const [ax, az, bx, bz] = s.laserSeg(i);
      const d = segDist(v.x, v.z, ax, az, bx, bz);
      if (d > 3.2) continue;
      // heading into it?
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if ((mx - v.x) * dir[0] + (mz - v.z) * dir[1] <= 0) continue;
      const T = s.tune.laserOn + s.tune.laserOff;
      const ph = (s.clock + i * 0.9) % T;
      const safeLeft = ph >= s.tune.laserOn ? T - ph : 0;
      if (safeLeft < 0.8 && d > MECH.radius + 0.4) return [0, 0];
    }
    return dir;
  }
}

export { POD_R, FIELD_R };
