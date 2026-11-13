// Delivery Dash: the autopilot. It drives the van through the same inputs a player gives: it
// follows the lane graph to the next shop or house (pure pursuit on the route), slows for turns,
// bumps (with fragile cargo), traffic and people on crosswalks, stops in the bays, backs out when
// stuck and uses turbo on long runs. The menu backdrop, the store art and balance.ts use it; the
// casual skill drives slower, steers less cleanly and plans worse.
import { clamp, wrapAngle, lerp, Rng, FRAGILE } from './defs';
import type { Sim, SimInput } from './sim';
import type { Bay } from './town';

export interface Skill {
  /** Share of top speed it cruises at. */
  speed: number;
  /** Corner speed factor. */
  corner: number;
  /** Steering noise (wobble). */
  noise: number;
  /** Seconds between rethinking the target. */
  think: number;
  /** Chance per decision to pick a worse job. */
  mistake: number;
  /** How much it slows for bumps with fragile cargo (0 = not at all). */
  care: number;
  turbo: boolean;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { speed: 0.97, corner: 1, noise: 0.02, think: 0.5, mistake: 0, care: 1, turbo: true },
  casual: { speed: 0.84, corner: 0.88, noise: 0.12, think: 2.5, mistake: 0.12, care: 0.55, turbo: false },
};

export class Bot {
  private rng: Rng;
  private bay: Bay | null = null;
  private thinkT = 0;
  private stuckT = 0;
  private headT = 0;
  private backT = 0;
  private backSteer = 0;
  private wob = 0;
  private wobT = 0;
  private wander: Bay | null = null;

  constructor(private sim: Sim, private skill: Skill, seed = 1) {
    this.rng = new Rng(seed * 97 + 13);
  }

  /** The bay it drives to now (for the menu camera). */
  get goal(): Bay | null { return this.bay; }

  input(dt: number): SimInput {
    const sim = this.sim, t = sim.town, sk = this.skill;
    // what to do next: stick with the job in hand until it is done (the good driver rethinks
    // while it is still far away)
    this.thinkT -= dt;
    const live = this.bay && (sim.activeBays().includes(this.bay) || this.bay === this.wander);
    const far = this.bay ? Math.hypot(this.bay.x - sim.x, this.bay.z - sim.z) > 30 : true;
    if (!live || (this.thinkT <= 0 && far && sk.mistake === 0) || (this.bay === this.wander && sim.activeBays().length)) {
      this.thinkT = sk.think;
      let b = sim.target();
      if (b && sk.mistake > 0 && this.rng.chance(sk.mistake)) {
        const all = sim.activeBays().filter((q) => q !== b && (sim.carried().length < sim.hand.capacity || t.houses.includes(q)));
        if (all.length) b = this.rng.pick(all);
      }
      if (!b) {
        if (!this.wander || Math.hypot(this.wander.x - sim.x, this.wander.z - sim.z) < 6) {
          const list = t.shops.filter((q) => t.drivable(q.cell));
          this.wander = list.length ? this.rng.pick(list) : null;
        }
        b = this.wander;
      }
      this.bay = b;
    }
    const inp: SimInput = { steer: 0, gas: 0, brake: 0, turbo: false, horn: false };
    const bay = this.bay;
    if (!bay) return inp;

    // backing out after getting stuck
    if (this.backT > 0) {
      this.backT -= dt;
      inp.brake = 1;
      inp.steer = this.backSteer;
      return inp;
    }

    const loc = t.locate(sim.x, sim.z, sim.h);
    if (!loc) return inp;
    const dist = t.routeDist(loc.edge, loc.s, bay);
    const pts = t.routePoints(loc.edge, loc.s, bay, 16, 1);
    const sp = Math.abs(sim.v);
    const look = 2.6 + sp * 0.32;
    let tx = sim.x + Math.sin(sim.h) * 3, tz = sim.z + Math.cos(sim.h) * 3;
    if (pts.length >= 3) {
      const i = Math.min(pts.length / 3 - 1, Math.round(look));
      tx = pts[i * 3]; tz = pts[i * 3 + 2];
    }
    // the turn ahead: the largest heading change along the next few metres
    let bend = 0;
    for (let i = 3; i + 3 < pts.length && i < 30; i += 3) {
      const a0 = Math.atan2(pts[i] - pts[i - 3], pts[i + 2] - pts[i - 1]);
      const a1 = Math.atan2(pts[i + 3] - pts[i], pts[i + 5] - pts[i + 2]);
      bend += Math.abs(wrapAngle(a1 - a0));
    }
    const err = wrapAngle(Math.atan2(tx - sim.x, tz - sim.z) - sim.h);
    // wobble (casual)
    this.wobT -= dt;
    if (this.wobT <= 0) { this.wobT = this.rng.range(0.3, 0.9); this.wob = this.rng.range(-1, 1) * sk.noise; }

    const vmax = sim.hand.vmax;
    let want = vmax * sk.speed;
    want = Math.min(want, lerp(vmax, 4.2, clamp(bend / 1.3, 0, 1)) * sk.corner + (1 - sk.corner) * 2);
    // stop in the bay
    want = Math.min(want, Math.sqrt(Math.max(0, 2 * 9 * (dist - 0.4))));
    // bumps with fragile cargo
    if (sim.carried().some((o) => FRAGILE[o.cargo]) && sk.care > 0) {
      for (let i = 0; i < pts.length && i < 24; i += 3) {
        const c = t.cellAt(pts[i], pts[i + 2]);
        if (c && (c.bump || c.bridge === 'hump' || c.ramp >= 0)) { want = Math.min(want, lerp(want, c.bump ? 4.6 : 6.5, sk.care)); break; }
      }
    }
    // traffic and people ahead
    const fx = Math.sin(sim.h), fz = Math.cos(sim.h);
    let headOn = false;
    for (const car of sim.cars) {
      const dx = car.x - sim.x, dz = car.z - sim.z;
      const along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
      if (along <= 0 || along > 9 || lat > 1.35) continue;
      want = Math.min(want, Math.max(0, (along - 2.8) * 1.6) + Math.max(0, car.v * Math.cos(car.h - sim.h)) * 0.8);
      if (along < 4 && Math.cos(car.h - sim.h) < 0) headOn = true;
    }
    // nose to nose with a car (in a junction): back off and let it pass
    if (headOn && sp < 0.5) this.headT += dt; else this.headT = 0;
    if (this.headT > 1.2) { this.headT = 0; this.backT = 0.8; this.backSteer = 0; }
    for (const p of sim.peds) {
      if (p.state !== 'cross' && p.state !== 'wait') continue;
      const dx = p.x - sim.x, dz = p.z - sim.z;
      const along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
      if (along > 0 && along < 8 && lat < 2.2) want = Math.min(want, Math.max(0, (along - 2.4) * 1.5));
    }

    if (Math.abs(err) > 1.9 && sp < 3) {
      // facing away: back up while turning
      this.backT = 0.9;
      this.backSteer = err > 0 ? 1 : -1;
      inp.brake = 1;
      inp.steer = this.backSteer;
      return inp;
    }
    inp.steer = clamp(-err * 2.4 + this.wob, -1, 1);
    const v = sim.v;
    if (v < want - 0.3) inp.gas = clamp((want - v) / 2.5, 0.35, 1);
    else if (v > want + 0.6) inp.brake = clamp((v - want) / 5, 0.2, 1);
    if (dist < 0.9 && v > 0.2) { inp.gas = 0; inp.brake = 1; }
    // stuck against something
    if (inp.gas > 0.3 && sp < 0.4) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.4) { this.stuckT = 0; this.backT = 1; this.backSteer = err > 0 ? 1 : -1; }
    // turbo on a long clear run
    if (sk.turbo && sim.turbo > 0 && sim.turboT <= 0 && dist > 45 && bend < 0.3 && want > vmax * 0.9 && !sim.carried().some((o) => FRAGILE[o.cargo])) inp.turbo = true;
    return inp;
  }
}
