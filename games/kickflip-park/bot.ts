// Kickflip Park: the autopilot. It skates the park's lines (parks.ts): steers for the next
// waypoint, pushes to the line's speed, ollies where the line says, holds grind near rails, and in
// the air picks tricks that fit the time left before landing (flips, grabs, spins, specials).
// Rails and manuals are balanced with a small controller. Two skills: a good skater and a casual
// one (slower, sloppier balance, fewer and later tricks). It drives the menu backdrop, the store
// art and the headless balance run (balance.ts).
import { clamp, wrap, seeded, FLIPS, SPECIALS, type Dir } from './defs';
import { onSeg } from './park';
import { Sim, NO_INPUT, type Input } from './sim';
import type { Waypoint } from './parks';

export interface Skill {
  /** Extra margin kept before landing when starting a flip (s); negative = risky. */
  margin: number;
  /** Spread of that margin (s). */
  sloppy: number;
  /** Most half turns it spins. */
  spins: number;
  /** Chance per landing (with a combo) to link a manual. */
  manual: number;
  /** Balance controller gain and its reaction lag (s). */
  gain: number;
  lag: number;
  /** Chance per air to try tricks at all. */
  tricky: number;
  /** Chance to go for a rail the line passes. */
  rails: number;
  /** Target speed factor. */
  pace: number;
  /** Uses the special meter. */
  specials: boolean;
  /** Steering noise. */
  wobble: number;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { margin: 0.05, sloppy: 0.03, spins: 3, manual: 0.85, gain: 1.35, lag: 0.02, tricky: 0.97, rails: 0.95, pace: 1.05, specials: true, wobble: 0.05 },
  casual: { margin: -0.02, sloppy: 0.12, spins: 1, manual: 0.4, gain: 0.85, lag: 0.16, tricky: 0.85, rails: 0.7, pace: 0.9, specials: false, wobble: 0.25 },
};

export class Bot {
  private line = 0;
  private wp = 0;
  private pending: string | null = null;
  private comboCap = 8000;
  private pendingWp = -1;
  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private crouch = false;
  private crouchFor = 0;
  private grindHold = 0;
  private wantManual = false;
  private manualFor = 0;
  private plan: { spin: number; grab: number; flips: number; special: boolean } | null = null;
  private grabT = 0;
  private flipCool = 0;
  private lastState = '';
  private balHist: number[] = [];
  private noiseT = 0;
  private noise = 0;
  private rnd: () => number;
  private goRail = true;
  private airDir: Dir = 0;

  constructor(private sim: Sim, readonly skill: Skill, seed = 7) {
    this.rnd = seeded(seed);
    this.line = Math.floor(this.rnd() * sim.park.lines.length);
    this.wp = this.nearest();
  }

  private get points(): Waypoint[] { return this.sim.park.lines[this.line]; }

  private nearest(): number {
    const s = this.sim, pts = this.points;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - s.x, pts[i].z - s.z);
      const ahead = (pts[i].x - s.x) * Math.sin(s.heading) + (pts[i].z - s.z) * Math.cos(s.heading);
      const score = d + (ahead < 0 ? 20 : 0);
      if (score < bd) { bd = score; best = i; }
    }
    return best;
  }

  private next(): void {
    if (this.points[this.wp].act === 'big') this.crouch = false;
    this.wp++;
    if (this.wp >= this.points.length) {
      this.wp = 0;
      if (this.sim.park.lines.length > 1 && this.rnd() < 0.5) {
        this.line = (this.line + 1) % this.sim.park.lines.length;
        this.wp = this.nearest();
      }
    }
    this.goRail = this.rnd() < this.skill.rails;
  }

  input(dt: number): Input {
    const s = this.sim, sk = this.skill;
    const inp: Input = { ...NO_INPUT };
    if (s.over) return inp;
    if (s.state !== this.lastState) this.onState(s.state);
    this.lastState = s.state;
    this.noiseT -= dt;
    if (this.noiseT <= 0) { this.noiseT = 0.4; this.noise = (this.rnd() - 0.5) * 2 * sk.wobble; }
    if (s.state === 'bail') { this.crouch = false; return inp; }
    const w = this.points[this.wp];
    const dx = w.x - s.x, dz = w.z - s.z;
    const dist = Math.hypot(dx, dz);
    const hx = Math.sin(s.heading), hz = Math.cos(s.heading);
    const ahead = dx * hx + dz * hz;
    // reached or passed the waypoint
    if (s.state === 'ground' || s.state === 'manual') {
      if ((w.act !== 'big' && dist < (w.act && w.act !== 'none' ? 1.5 : 3)) || (ahead < 0 && dist < 8)) this.next();
      // stuck against something: give up on this waypoint
      this.stuckT += dt;
      if (this.stuckT > 2) {
        if (Math.hypot(s.x - this.stuckX, s.z - this.stuckZ) < 2.5) this.next();
        this.stuckT = 0; this.stuckX = s.x; this.stuckZ = s.z;
      }
    }
    const tw = this.points[this.wp];
    // aim a little towards the waypoint after, so turns start early (not past an act)
    let ax = tw.x, az = tw.z;
    const nw = this.points[(this.wp + 1) % this.points.length];
    const td0 = Math.hypot(tw.x - s.x, tw.z - s.z);
    if (!tw.act && td0 < 7) { const k = (1 - td0 / 7) * 0.6; ax += (nw.x - tw.x) * k; az += (nw.z - tw.z) * k; }
    const want = Math.atan2(ax - s.x, az - s.z);
    const diff = wrap(want - s.heading);
    switch (s.state) {
      case 'ground': case 'manual': {
        inp.steer = clamp(diff * 2.4 + this.noise, -1, 1);
        // no carving up a steep wall: ride straight at the lip
        if ((s.gx * hx + s.gz * hz) * s.speed > 0.5) inp.steer *= 0.15;
        const v = (tw.v ?? 8.6) * sk.pace;
        if (s.state === 'ground') inp.fwd = Math.abs(diff) > 1.2 ? -0.2 : s.speed < v ? 1 : 0;
        // acts on the way to this waypoint
        const td = Math.hypot(tw.x - s.x, tw.z - s.z);
        const eta = td / Math.max(1, s.speed);
        const act = tw.act ?? 'none';
        if ((act === 'ollie' || (act === 'grind' && this.goRail)) && eta < 0.62 && Math.abs(diff) < 0.5 && !this.pending) {
          this.crouch = true;
          this.pending = act;
          this.pendingWp = this.wp;
        }
        if (this.pending) {
          this.crouchFor += dt;
          if (this.wp !== this.pendingWp || eta < 0.12 || td < 1.2 || this.crouchFor > 0.9) {
            this.crouch = false;
            if (this.pending === 'grind') this.grindHold = 1.4;
            this.pending = null;
          }
        } else {
          if (this.crouch) this.crouchFor += dt; else this.crouchFor = 0;
          if (this.crouch && act !== 'big' && this.crouchFor > 0.6) this.crouch = false;
        }
        // on a ramp heading for its lip or a kicker's top: crouch, pop at the top
        const slope = s.gx * hx + s.gz * hz;
        if (act === 'big' && slope > 0.1 && s.speed > 4 && td < 7) {
          const yAhead = s.terrain.height(s.x + hx * 0.7, s.z + hz * 0.7);
          const atTop = yAhead < s.y - 0.05 || slope > 3.6;
          if (!atTop && sk.margin > 0) this.crouch = true;
          if (atTop && this.crouch) this.crouch = false;
          if (!atTop && sk.margin <= 0 && slope > 0.5 && this.rnd() < 0.02) this.crouch = true;
        }
        inp.crouch = this.crouch;
        // manuals
        if (s.state === 'manual') {
          this.manualFor -= dt;
          inp.fwd = this.balance(s.manual!.bal, s.manual!.balV, s.tune.manualTip + s.tune.manualTipRamp * s.manual!.t, 4.5);
          if (sk.specials && s.specialReady && !s.manual!.special) inp.special = true;
          if (this.manualFor <= 0) {
            // end it: ollie into the next thing, or put the wheels down
            if (act === 'ollie' || act === 'grind') this.manualFor = 0.5;
            else inp.manual = true;
          }
        } else if (this.wantManual && s.combo.length && s.linkT > 0 && s.comboValue() < this.comboCap) {
          this.wantManual = false;
          inp.manual = true;
          this.manualFor = this.skill.margin > 0 ? 1.5 + this.rnd() * 3.2 : 0.8 + this.rnd() * 2.2;
        }
        break;
      }
      case 'air': this.fly(inp, diff); break;
      case 'grind': {
        const g = s.grind!;
        inp.steer = this.balance(g.bal, g.balV, s.tune.grindTip + s.tune.grindTipRamp * g.t, 5.5);
        if (sk.specials && s.specialReady && !g.special) inp.special = true;
        // pop off near the end
        const seg = g.seg;
        const left = (g.dir > 0 ? 1 - g.u : g.u) * seg.len;
        const last = !s.park.segs.some((q) => q.rail === seg.rail && q.i === seg.i + g.dir);
        if (last && left < s.speed * 0.45 && sk.margin > 0) this.crouch = left > s.speed * 0.12;
        else this.crouch = false;
        inp.crouch = this.crouch;
        break;
      }
    }
    if (this.grindHold > 0) { this.grindHold -= dt; inp.grind = true; }
    return inp;
  }

  private onState(st: string): void {
    if (st === 'air') {
      if (this.points[this.wp].act === 'big' && Math.hypot(this.points[this.wp].x - this.sim.x, this.points[this.wp].z - this.sim.z) < 6) this.next();
      this.plan = null;
      this.grabT = 0;
      this.flipCool = 0;
    }
    if (st === 'ground' && this.lastState === 'air' && this.rnd() < this.skill.manual) this.wantManual = true;
    if (st === 'bail' || (st === 'ground' && !this.sim.combo.length)) this.comboCap = this.skill.margin > 0 ? 6000 + this.rnd() * 16000 : 1200 + this.rnd() * 3000;
    if (st === 'ground') { this.crouch = false; this.pending = null; }
    if (st === 'air') this.pending = null;
  }

  /** Keeps a balance (−1 … 1) near zero; returns the stick. */
  private balance(bal: number, balV: number, tip: number, auth: number): number {
    this.balHist.push(bal);
    const lagN = Math.max(1, Math.round(this.skill.lag * 60));
    while (this.balHist.length > lagN) this.balHist.shift();
    const seen = this.balHist[0];
    const u = (seen * (tip + 3) + balV * 2.2) / auth * this.skill.gain;
    return clamp(u + this.noise * 0.3, -1, 1);
  }

  private fly(inp: Input, diff: number): void {
    const s = this.sim, sk = this.skill, a = s.air!;
    const T = s.timeToLand();
    if (!this.plan) {
      const total = T;
      const tricky = this.rnd() < sk.tricky;
      let spin = 0;
      if (tricky && sk.spins > 0) {
        const halfTime = Math.PI / 7.4 + 0.12;
        const can = Math.floor((total - 0.25) / halfTime);
        const pick = Math.min(sk.spins, can);
        // even half turns land forward; odd ones fakie (fine too) — prefer even off kickers
        spin = pick >= 2 ? (this.rnd() < 0.6 ? 2 : pick) : pick >= 1 && this.rnd() < 0.4 ? 1 : 0;
        if (pick >= 3 && this.rnd() < 0.35) spin = 3;
      }
      const special = tricky && sk.specials && s.specialReady && total > 1.15;
      const grab = tricky && !special && total > 0.85 && this.rnd() < 0.6 ? 0.25 + (total - 0.85) * (0.4 + this.rnd() * 0.4) : 0;
      this.plan = { spin: spin * Math.PI * (this.rnd() < 0.5 ? -1 : 1), grab, flips: tricky ? 1 + (total > 1.3 ? 1 : 0) : 0, special };
      this.airDir = Math.floor(this.rnd() * 4) as Dir;
    }
    const p = this.plan;
    // spin to the planned angle, easing off in time
    const rem = p.spin - a.spin;
    const brake = (a.spinVel * a.spinVel) / (2 * 26) + 0.05;
    inp.steer = Math.abs(rem) > brake && Math.sign(rem) === Math.sign(p.spin) ? Math.sign(rem) : 0;
    // over a rail of the line: hold grind
    const w = this.points[this.wp];
    if (w.act === 'grind' && this.goRail) inp.grind = true;
    else if (this.goRail && this.railNear()) inp.grind = true;
    if (inp.grind) inp.dir = this.rnd() < 0.5 ? -1 : this.airDir;
    // tricks
    this.flipCool -= 1 / 60;
    const margin = sk.margin + (this.rnd() - 0.5) * sk.sloppy;
    if (p.special && !a.flip) {
      inp.special = true;
      inp.dir = this.rnd() < 0.5 ? 2 : 0;
      p.special = false;
      return;
    }
    if (p.grab > 0 && !a.flip) {
      this.grabT += 1 / 60;
      if (this.grabT < p.grab && T > 0.22 + margin) inp.grab = this.airDir;
      else p.grab = 0;
      return;
    }
    if (p.flips > 0 && !a.flip && !a.grab && this.flipCool <= 0 && !inp.grind) {
      const dir = (this.rnd() < 0.5 ? this.airDir : Math.floor(this.rnd() * 4)) as Dir;
      const dur = FLIPS[dir].dur ?? 0.4;
      if (T > dur + 0.08 + margin) {
        inp.flip = dir;
        p.flips--;
        this.flipCool = 0.1;
      }
    }
    void diff; void SPECIALS;
  }

  /** A rail close below or ahead of the board. */
  private railNear(): boolean {
    const s = this.sim;
    for (const seg of s.park.segs) {
      const r = onSeg(seg, s.x + s.vx * 0.15, s.z + s.vz * 0.15);
      if (r.d < 1.2 && s.y > r.y - 0.2 && s.y < r.y + 1.6) return true;
    }
    return false;
  }
}
