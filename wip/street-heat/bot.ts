// Street Heat: the autopilot. It drives any job the way a player would: along the GPS route to the
// marker and stops in it, through checkpoints, away from the police (and out of their sight) to
// lose the heat, keeps the band behind a car it tails, rams a car it chases and the cops that
// attack the SUV it escorts. Used by the balance runs (balance.ts), the store art and screenshots.
import type { Sim, DriveInput } from './sim';
import type { Job } from './jobs';
import { clamp } from './defs';
import { along } from './city';

export interface Skill { lookahead: number; corner: number; top: number; brakeK: number; nitro: boolean; handbrake: boolean }
export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { lookahead: 9, corner: 13, top: 1, brakeK: 1, nitro: true, handbrake: true },
  casual: { lookahead: 7, corner: 10, top: 0.82, brakeK: 1.25, nitro: false, handbrake: false },
};

export class Bot {
  private route: number[] = [];
  private routeT = 0;
  private goal: { x: number; z: number } | null = null;
  private fleeGoal: { x: number; z: number } | null = null;
  private stuck = 0;
  private rev = 0;
  private fleeT = 0;

  constructor(private sim: Sim, private job: Job, private skill: Skill = SKILL.good) {}

  input(dt: number): DriveInput {
    const sim = this.sim, job = this.job, p = sim.player;
    const st = job.def?.stages[job.stage];
    let tx: number, tz: number;
    let vMax = sim.hand.top * this.skill.top;
    let stopAt = false;
    let direct = false;
    const lose = sim.stars > 0 && (st?.type === 'lose' || job.mode === 'getaway' || (st?.type === 'goto' && !job.nav) || (job.mode !== 'story' && sim.pursuit));
    if (st?.type === 'tail' && job.actor) {
      const a = job.actor;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      [tx, tz] = [a.x, a.z];
      vMax = clamp(a.speedAbs + (d - 38) * 0.35, 0, sim.hand.top);
      direct = d < 45 && sim.city.los(p.x, p.z, a.x, a.z);
    } else if ((st?.type === 'chase') && job.actor) {
      const a = job.actor;
      [tx, tz] = [a.x + a.vx * 0.4, a.z + a.vz * 0.4];
      direct = Math.hypot(a.x - p.x, a.z - p.z) < 40 && sim.city.los(p.x, p.z, a.x, a.z);
    } else if (st?.type === 'escort' && job.actor) {
      const a = job.actor;
      let best: { x: number; z: number } | null = null, bd = 35;
      for (const c of sim.cars) if (c.role === 'cop' && c.cop === 'pursue' && !c.disabled) { const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < bd) { bd = d; best = c; } }
      if (best) { [tx, tz] = [best.x, best.z]; direct = Math.hypot(best.x - p.x, best.z - p.z) < 30; }
      else { [tx, tz] = [a.x - Math.sin(a.h) * 10, a.z - Math.cos(a.h) * 10]; vMax = Math.min(vMax, a.speedAbs + 6); }
    } else if (lose) {
      // a cop ahead on the way: pick another way out
      const sh = Math.sin(p.h), ch = Math.cos(p.h);
      const ahead = sim.cars.some((c) => c.role === 'cop' && c.cop !== 'out' && !c.disabled && ((c.x - p.x) * sh + (c.z - p.z) * ch) > 0 && Math.hypot(c.x - p.x, c.z - p.z) < 35);
      this.fleeT -= dt;
      if (!this.fleeGoal || Math.hypot(this.fleeGoal.x - p.x, this.fleeGoal.z - p.z) < 25 || (ahead && this.fleeT <= 0)) {
        this.fleeT = 3;
        // the spot farthest from every police car, among a few far ones
        let best = null as null | { x: number; z: number }, bestScore = -Infinity;
        for (let k = 0; k < 8; k++) {
          const s = sim.city.spotAway(p.x, p.z, 120, 260, sim.rnd);
          let score = 0;
          for (const c of sim.cars) if (c.role === 'cop' && c.cop !== 'out') score += Math.min(150, Math.hypot(c.x - s.x, c.z - s.z)) - Math.max(0, 60 - Math.hypot(c.x - (p.x + s.x) / 2, c.z - (p.z + s.z) / 2)) * 2;
          if (score > bestScore) { bestScore = score; best = { x: s.x, z: s.z }; }
        }
        this.fleeGoal = best;
        this.routeT = 0;
      }
      [tx, tz] = [this.fleeGoal!.x, this.fleeGoal!.z];
    } else if (job.nav) {
      [tx, tz] = [job.nav.x, job.nav.z];
      stopAt = !job.markers.some((m) => m.kind === 'check' && Math.hypot(m.x - tx, m.z - tz) < 1);
    } else {
      [tx, tz] = [p.x + Math.sin(p.h) * 30, p.z + Math.cos(p.h) * 30];
    }
    // the route
    this.routeT -= dt;
    if (this.routeT <= 0 || !this.goal || Math.hypot(this.goal.x - tx, this.goal.z - tz) > 12) {
      this.routeT = 0.5;
      this.goal = { x: tx, z: tz };
      this.route = sim.city.route(p.x, p.z, tx, tz).pts;
    }
    let ax = tx, az = tz;
    let vCorner = Infinity;
    if (!direct && this.route.length >= 4) {
      const off = Math.hypot(this.route[0] - p.x, this.route[1] - p.z);
      const a = along(this.route, off + this.skill.lookahead + p.speedAbs * 0.3, 45);
      ax = a.x; az = a.z;
      // slow for the bend ahead: corner speed plus what braking can take off before it
      if (a.bendCos < 0.6) vCorner = this.skill.corner + Math.sqrt(2 * 10 * Math.max(0, a.bendDist - off - 6)) / this.skill.brakeK;
    }
    // traffic ahead: slow down behind it and swing out to pass
    let block = Infinity, blockV = 0;
    if (!direct) {
      const sh = Math.sin(p.h), ch = Math.cos(p.h);
      const reach = 10 + p.speedAbs * 1.1;
      for (const c of sim.cars) {
        if (c === p || c === job.actor) continue;
        const dx = c.x - p.x, dz = c.z - p.z;
        if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
        const al = dx * sh + dz * ch;
        if (al < 2 || al > reach) continue;
        if (Math.abs(dx * ch - dz * sh) > 2.4) continue;
        if (al < block) { block = al; blockV = c.speedAbs; }
      }
      if (block < Infinity) {
        // pass on the left (the other side of the road)
        ax += -Math.cos(p.h) * -3.2; az += Math.sin(p.h) * -3.2;
      }
    }
    const want = Math.atan2(ax - p.x, az - p.z);
    let err = want - p.h;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const sp = p.fwd;
    // stuck: back out
    // backing out, the wheel turned the other way
    if (this.rev > 0) { this.rev -= dt; return { steer: clamp(-err * 2, -1, 1), gas: 0, brake: 1, handbrake: false, nitro: false, horn: false }; }
    if (Math.abs(sp) < 1 && !sim.frozen) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 1.0 && !(stopAt && Math.hypot(tx - p.x, tz - p.z) < 6)) { this.stuck = 0; this.rev = 1.3; }
    let v = vMax;
    v = Math.min(v, vCorner);
    if (block < Infinity) v = Math.min(v, blockV + 3 + Math.max(0, block - 8) * 0.5);
    if (Math.abs(err) > 0.7) v = Math.min(v, this.skill.corner);
    if (stopAt) {
      const d = Math.hypot(tx - p.x, tz - p.z);
      v = Math.min(v, Math.sqrt(2 * 9 * Math.max(0, d - 2)) / this.skill.brakeK);
      if (d < 4) v = 0;
    }
    const steer = clamp(-err * 2.2, -1, 1);
    const gas = sp < v ? 1 : 0;
    const brake = sp > v + 2 ? 1 : 0;
    const nitro = this.skill.nitro && Math.abs(err) < 0.15 && sp > 15 && v > 30 && sim.nitro > 0 && (lose || st?.type === 'chase' || (job.clock !== Infinity && job.clock < 40));
    const handbrake = this.skill.handbrake && Math.abs(err) > 1.0 && sp > 14;
    return { steer, gas, brake, handbrake, nitro, horn: false };
  }
}
