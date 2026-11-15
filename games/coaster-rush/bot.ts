// Coaster Rush: the autopilot. It reads the track ahead the way a player reads the HUD's speed
// band: it brakes when the speed would be too much for a corner it can still stop for, holds
// POWER on the chain lifts, the boosters and when a crest or a loop needs more speed, brakes
// into each station's bay and picks a branch at every junction. The menu's backdrop ride, the
// store art and the headless balance runs use it. Skills: `good` brakes on time with a safety
// margin; `casual` reacts late, misjudges corners now and then and stops less precisely.
import { G, Rng, STYLES } from './defs';
import { BASE, UP } from './upgrades';
import type { Sim, Input } from './sim';

export interface Skill {
  /** Share of the corner limit aimed for (and how much that wobbles from corner to corner). */
  margin: number;
  wobble: number;
  /** Seconds between looks at the road (reaction). */
  react: number;
  /** Chance per corner to brake too late. */
  late: number;
  /** How far off the bay's middle it may aim. */
  stopSloppy: number;
  /** Chance to take the thrill branch. */
  thrill: number;
  /** Chance per second to coast when it should be holding POWER (a lapse on a lift or a climb). */
  lapse: number;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { margin: 0.9, wobble: 0.03, react: 0.05, late: 0, stopSloppy: 0.15, thrill: 0.65, lapse: 0 },
  casual: { margin: 0.97, wobble: 0.1, react: 0.22, late: 0.12, stopSloppy: 0.9, thrill: 0.5, lapse: 0.04 },
};

export class Bot {
  private rng: Rng;
  private t = 0;
  private out: Input = { power: false, brake: false, pick: 0 };
  private cornerK = 1;
  private lateUntil = -1;
  private stopAim = 0;
  private aimFor: unknown = null;
  private lapseT = 0;
  private picked: unknown = null;

  constructor(private sim: Sim, readonly skill: Skill, seed: number) {
    this.rng = new Rng(seed);
  }

  input(dt: number): Input {
    this.t -= dt;
    this.lapseT -= dt;
    if (this.t > 0) return this.out;
    this.t = this.skill.react * (0.6 + this.rng.next() * 0.8);
    this.out = this.decide();
    return this.out;
  }

  private decide(): Input {
    const sim = this.sim, sk = this.skill;
    const out: Input = { power: false, brake: false, pick: 0 };
    if (sim.state !== 'ride') return out;
    const s = sim.s, v = sim.v;
    const brakeA = (BASE.brake + sim.up.brakes * UP.brakes) * (sim.power.slowmo > 0 ? 1.4 : 1);
    // the junction
    if (sim.fork && sim.fork.s - s < 40 && this.picked !== sim.fork) {
      this.picked = sim.fork;
      const thrill = this.rng.next() < sk.thrill && sim.hearts > 1 && sim.happy > 35;
      out.pick = thrill ? sim.fork.thrillSide : -sim.fork.thrillSide;
    }
    // a station ahead: brake to stop in the bay (or creep up to it)
    const st = sim.nextStation();
    if (st && st.stop - s < 30 && st.stop - s > -st.half) {
      if (this.aimFor !== st) { this.aimFor = st; this.stopAim = (this.rng.next() * 2 - 1) * sk.stopSloppy; }
      const d = st.stop + this.stopAim - s;
      const want = Math.sqrt(Math.max(0, 2 * brakeA * 0.8 * d));
      if (v > want + 0.25) out.brake = true;
      else if (v < Math.min(2.4, want) && d > 0.4) out.power = true;
      if (d < 3 && v > 0.1 && v > want) out.brake = true;
      return out;
    }
    // corners ahead: brake if the speed would be too much even with full brakes from here
    let mustBrake = false;
    const pitch = STYLES[sim.style].pitch;
    const y0 = sim.at(s).y;
    for (let d = 0; d < 34; d += 0.5) {
      const lim = sim.limitAt(s + d);
      if (!isFinite(lim)) continue;
      const dy = sim.at(s + d).y - y0;
      if (d < 1 && this.rng.next() < 0.5) this.cornerK = sk.margin + (this.rng.next() * 2 - 1) * sk.wobble;
      let k = this.cornerK;
      if (this.lateUntil > sim.time) k += 0.12;
      const target = lim * k;
      // a train is as long as its cars: the corner's limit counts from the first car
      // braking from here (gravity helps uphill and works against the brakes downhill)
      const reach = Math.sqrt(Math.max(0, target * target + 2 * brakeA * 0.9 * Math.max(0, d - 0.3) + 2 * G * dy));
      if (v > reach) { mustBrake = true; break; }
      void pitch;
    }
    if (mustBrake && sk.late > 0 && this.lateUntil < sim.time - 2 && this.rng.next() < sk.late * this.skill.react * 4) this.lateUntil = sim.time + 0.6;
    if (mustBrake && this.lateUntil < sim.time) out.brake = true;
    // power where it helps: chain lifts, boosters, and when what comes next needs more speed
    const here = sim.at(s);
    if (!out.brake) {
      if (here.flag === 'lift') out.power = true;
      else if (here.flag === 'boost') out.power = v < sim.needSpeed(s + 8) + 2.5 || v < 11;
      else if (here.flag === 'station') out.power = true;
      else if (v < sim.needSpeed(s) * 1.02) out.power = true;
      else if (v < 4) out.power = true;
    }
    if (sk.lapse > 0 && out.power && this.lapseT < -1 && this.rng.next() < sk.lapse * this.skill.react) this.lapseT = 0.7;
    if (this.lapseT > 0) out.power = false;
    void G;
    return out;
  }
}
