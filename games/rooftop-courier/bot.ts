// Rooftop Courier: the autopilot. It reads the course ahead the way a player reads the screen:
// picks a lane (the hatch, the ladder, the bridge, the cable, the awning, round the clutter,
// through the power-ups and the stamps), times its jumps at the roof edge with a hold planned by
// replaying the jump physics, vaults low walls, slides under beams and cables, rolls hard
// landings and climbs. Power-ups work by themselves once picked up.
// Two skills: a good courier and a casual one (late reactions, sloppy timing, missed rolls,
// now and then a jump it forgets). It drives the menu backdrop, the store art and balance.ts.
import { Sim, NO_INPUT, HOLD_T, HOLD_G, HARD, type Input } from './sim';
import type { Block, Box } from './course';
import { GRAV, HW, RAD, REACH, clamp, seeded, isPower } from './defs';

export interface Skill {
  /** Reaction delay (s) and its spread. */
  react: number;
  jitter: number;
  /** Chance per feature to fumble it (no jump, a late one, the wrong hold). */
  fumble: number;
  /** Chance to roll a hard landing. */
  rolls: number;
  /** Steering gain and noise. */
  gain: number;
  wobble: number;
  /** Goes for stamps off its line. */
  greed: number;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { react: 0.02, jitter: 0.02, fumble: 0.0, rolls: 0.95, gain: 1.6, wobble: 0.04, greed: 0.8 },
  casual: { react: 0.12, jitter: 0.08, fumble: 0.07, rolls: 0.45, gain: 1.0, wobble: 0.22, greed: 0.35 },
};

const DT = 1 / 60;

export class Bot {
  private rnd: () => number;
  private holdLeft = 0;
  private downLeft = 0;
  private wait = -1;
  private planHold = 0;
  private planFor = -1;
  private fumbled = new Set<number>();
  private decided = new Set<number>();
  private decidedBox = new Set<number>();
  private decidedZip = new Set<number>();
  private noise = 0;
  private noiseT = 0;
  private laneX = 0;
  private rolledFor = -1;
  private slidFor = new Set<number>();

  constructor(private sim: Sim, readonly skill: Skill, seed = 7) {
    this.rnd = seeded(seed * 31 + 5);
  }

  private lastS = 0;

  input(dt: number): Input {
    const sim = this.sim;
    if (sim.over) return NO_INPUT;
    // put back on a roof behind (a respawn, a continue): every feature ahead is new again
    if (sim.s < this.lastS - 1) { this.decided.clear(); this.decidedBox.clear(); this.decidedZip.clear(); this.slidFor.clear(); this.planFor = -1; this.wait = -1; this.holdLeft = 0; }
    this.lastS = sim.s;
    const inp: Input = { ...NO_INPUT };
    this.noiseT -= dt;
    if (this.noiseT <= 0) { this.noiseT = 0.4 + this.rnd() * 0.6; this.noise = (this.rnd() * 2 - 1) * this.skill.wobble; }
    // steering
    const want = this.lane();
    this.laneX += clamp(want - this.laneX, -9 * dt, 9 * dt);
    const err = this.laneX - sim.x + this.noise;
    inp.steer = Math.abs(err) < 0.08 ? 0 : clamp(err * this.skill.gain, -1, 1);
    // jumping: a planned jump fires after the reaction delay and is held for its planned time
    if (this.wait >= 0) {
      this.wait -= dt;
      if (this.wait < 0) this.holdLeft = Math.max(DT * 2, this.planHold);
    } else this.plan();
    if (this.holdLeft > 0) { this.holdLeft -= dt; inp.jump = true; }
    // slide under overhead pieces, roll hard landings
    if (this.downLeft > 0) { this.downLeft -= dt; inp.down = true; } else this.duck();
    return inp;
  }

  // ------------------------------------------------------------------ lanes

  /** Where across the roof it wants to be. */
  private lane(): number {
    const sim = this.sim, c = sim.course;
    let x = sim.x;
    const cur = c.blockAt(sim.s);
    const nb = c.nextBlock(sim.s);
    // the hatch of the parcel when it is close
    const p = sim.parcel;
    if (p && p.s > sim.s - 1 && p.s - sim.s < 28) x = p.x;
    // the next link's feature when the edge is near (it wins over everything once it is close)
    let locked = false;
    const fx = nb ? this.featureX(nb) : null;
    if (nb && fx !== null && (!cur || nb.s0 - sim.s < 26) && !(p && p.s > sim.s && p.s < nb.s0 - 3 && p.s - sim.s < 12)) {
      x = fx;
      locked = !cur || nb.s0 - sim.s < 13;
    }
    // on a bridge or a cable: stay on it
    const br = c.boxes.find((b) => b.kind === 'bridge' && sim.s > b.s0 - 2 && sim.s < b.s1);
    if (br) { x = (br.x0 + br.x1) / 2; locked = true; }
    if (!locked) {
      // a power-up ahead: worth a detour (a casual courier sees it a little later)
      let took = false;
      for (const pk of c.pickups) {
        if (pk.taken || !isPower(pk.kind) || pk.s < sim.s + 1.5 || pk.s > sim.s + 6 + 10 * this.skill.greed) continue;
        if (Math.abs(pk.x - x) < 3.4 && pk.y < sim.y + 2.5 && (!cur || pk.s < cur.s1 - 0.5)) { x = pk.x; took = true; break; }
      }
      // stamps just ahead, a little off the line
      if (!took && this.rnd() < this.skill.greed) {
        for (const pk of c.pickups) {
          if (pk.taken || pk.s < sim.s + 2 || pk.s > sim.s + 9) continue;
          if (Math.abs(pk.x - x) < 1.6 && pk.y < sim.y + 2.5) { x = pk.x; break; }
        }
      }
    }
    // round tall clutter ahead
    for (const b of c.boxes) {
      if (b.s0 > sim.s + 14) break;
      if (b.kind !== 'tall' || b.hit || b.s1 < sim.s - RAD) continue;
      if (locked && b.s0 > (cur ? cur.s1 : sim.s)) continue;
      if (x + RAD + 0.25 > b.x0 && x - RAD - 0.25 < b.x1) x = this.freeX(b, x);
    }
    return clamp(x, -HW + 0.5, HW - 0.5);
  }

  /** Where across the roof the next link must be taken (null: anywhere). */
  private featureX(nb: Block): number | null {
    if (!nb.feature || nb.link === 'kicker') return null;
    if (nb.link === 'zip') return this.sim.course.zips.find((q) => q.block === nb.i)?.x ?? null;
    return (nb.feature.x0 + nb.feature.x1) / 2;
  }

  /** The nearest x beside an obstacle that is clear of the others at its depth. */
  private freeX(b: Box, x: number): number {
    const c = this.sim.course;
    const cands = [b.x0 - RAD - 0.5, b.x1 + RAD + 0.5].filter((v) => v > -HW + 0.4 && v < HW - 0.4);
    cands.sort((u, v) => Math.abs(u - x) - Math.abs(v - x));
    for (const cx of cands) {
      const clash = c.boxes.some((o) => o !== b && o.kind === 'tall' && !o.hit && o.s0 < b.s1 + 2 && o.s1 > b.s0 - 2 && cx + RAD > o.x0 - 0.2 && cx - RAD < o.x1 + 0.2);
      if (!clash) return cx;
    }
    return cands[0] ?? x;
  }

  // ------------------------------------------------------------------ jumps

  private plan(): void {
    const sim = this.sim, c = sim.course;
    if (sim.state === 'zip' || sim.state === 'climb' || sim.state === 'mantle' || sim.state === 'vault' || sim.state === 'rescue') return;
    // blocked at a wall without a ladder: jump to the ledge
    if (sim.blockedT > 0.25 && sim.state === 'run') { this.fire(HOLD_T, 0); return; }
    if (!sim.grounded || sim.state === 'stumble') return;
    const cur = c.blockAt(sim.s);
    // low walls: vault them
    const low = sim.lowAhead(2.1);
    if (low && low.s0 - sim.s < 1.0 + sim.vs * 0.09 && !this.decidedBox.has(low.id)) {
      this.decidedBox.add(low.id);
      if (this.fumbleOnce(-low.id)) return;
      this.fire(0.05, this.reaction());
      return;
    }
    if (!cur) return;
    const nb = c.nextBlock(sim.s);
    if (!nb) return;
    // a cable: jump under it to grab
    if (nb.link === 'zip') {
      const z = c.zips.find((q) => q.block === nb.i);
      if (z && sim.s > z.sa + 0.6 && Math.abs(sim.x - z.x) < 1.0 && !this.decidedZip.has(nb.i)) {
        this.decidedZip.add(nb.i);
        if (this.fumbleOnce(nb.i + 0.5)) return;
        this.fire(0.12, this.reaction());
      }
      return;
    }
    if (nb.link === 'beam' || nb.link === 'plank' || nb.link === 'scaffold' || (nb.link === 'ladder' && nb.gap === 0) || (nb.link === 'flat' && nb.y <= cur.y)) return;
    const edge = cur.s1 - sim.s;
    if (edge > 3.2 || this.decided.has(nb.i)) return;
    // plan the hold once, then jump near the edge
    if (this.planFor !== nb.i) { this.planFor = nb.i; this.planHold = this.holdFor(cur, nb); }
    const lead = 0.3 + sim.vs * (this.skill.react * 0.5);
    if (edge < lead + 0.25) {
      this.decided.add(nb.i);
      if (this.fumbleOnce(nb.i)) {
        // a fumble: a late jump (it may still make it) or a short one
        this.fire(this.planHold * 0.5, this.skill.react + 0.1);
        return;
      }
      this.fire(this.planHold, this.reaction() * 0.6);
    }
  }

  private fire(hold: number, delay: number): void {
    this.planHold = hold;
    this.wait = Math.max(0, delay);
  }

  private reaction(): number {
    return Math.max(0, this.skill.react + (this.rnd() * 2 - 1) * this.skill.jitter);
  }

  private fumbleOnce(id: number): boolean {
    if (this.fumbled.has(id)) return false;
    if (this.rnd() < this.skill.fumble) { this.fumbled.add(id); return true; }
    return false;
  }

  /** The shortest hold that carries the jump onto the next roof (or the awning, or the ladder). */
  private holdFor(cur: Block, nb: Block): number {
    const sim = this.sim;
    const holds = [0.02, 0.08, 0.14, 0.2, HOLD_T];
    const takeoff = cur.s1 - 0.35;
    const v = Math.max(sim.vs, sim.target * 0.95);
    const aw = nb.link === 'awning' ? sim.course.boxes.find((b) => b.kind === 'awning' && b.block === nb.i) : null;
    for (const h of holds) {
      if (aw) {
        // come down on the awning before the wall
        const r = this.predict(takeoff, cur.y, v, h, aw.y1, aw.s0 + 0.15, nb.s0 - RAD, nb.y);
        if (r.land !== null) return h;
        continue;
      }
      const r = this.predict(takeoff, cur.y, v, h, nb.y, nb.s0 + 0.6, nb.s0 - RAD, nb.y);
      if (r.land !== null || r.ledge) return h;
    }
    return aw ? 0.02 : HOLD_T;
  }

  /**
   * Replays a jump from `s0`/`y0` at speed `v`, holding for `hold` s: where it comes down to
   * `yLand` past `sLand`, or whether it meets the wall at `wallS` within a ledge's reach of `wallTop`.
   */
  private predict(s0: number, y0: number, v: number, hold: number, yLand: number, sLand: number, wallS: number, wallTop: number): { land: number | null; ledge: boolean } {
    let s = s0, y = y0, vy = this.sim.jumpV * (this.sim.springs > 0 ? 1.38 : 1), ht = Math.min(hold, HOLD_T);
    for (let i = 0; i < 240; i++) {
      let g = GRAV;
      if (ht > 0) { ht -= DT; if (vy > 0) g *= HOLD_G; }
      vy -= g * DT;
      s += v * DT;
      y += vy * DT;
      if (vy < 0 && y <= yLand && s >= sLand && s < wallS + 0.01) return { land: s, ledge: false };
      if (s >= wallS && y < wallTop) return { land: null, ledge: wallTop - y <= REACH };
      if (vy < 0 && y <= yLand && s >= sLand) return { land: s, ledge: false };
      if (y < y0 - 8) break;
    }
    return { land: null, ledge: false };
  }

  // ------------------------------------------------------------------ slides and rolls

  private duck(): void {
    const sim = this.sim, c = sim.course;
    if (sim.grounded && sim.state !== 'slide') {
      for (const b of c.boxes) {
        if (b.s0 > sim.s + 4) break;
        if (b.kind !== 'over' || b.hit || b.s1 < sim.s) continue;
        if (sim.x + RAD <= b.x0 || sim.x - RAD >= b.x1) continue;
        const d = b.s0 - sim.s;
        if (d < 0.6 + sim.vs * 0.12 && !this.slidFor.has(b.id)) {
          this.slidFor.add(b.id);
          if (this.rnd() < this.skill.fumble * 1.5) return;
          this.downLeft = 0.08;
          return;
        }
      }
    }
    // a hard landing coming: roll
    if (sim.state === 'air' && sim.vy < 0) {
      const g = c.groundAt(sim.s + sim.vs * 0.1, sim.x, sim.y).y;
      const tLand = (sim.y - g) / Math.max(1, -sim.vy);
      const apexDrop = sim.apexY - g;
      if (g > 0.5 && tLand < 0.1 + this.skill.jitter * this.rnd() && apexDrop > HARD - 0.4 && this.rolledFor !== Math.round(sim.s)) {
        this.rolledFor = Math.round(sim.s);
        if (this.rnd() < this.skill.rolls) this.downLeft = 0.06;
      }
    }
  }
}
