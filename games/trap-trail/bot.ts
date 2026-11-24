// Trap Trail: the autopilot. It walks the stage's waypoints (left by the course writer): runs at
// the next one, jumps where a waypoint says jump (holding JUMP for the full height), waits where it
// says hold (a spring, a lever, a moving floe), and after a respawn picks the trail up at its
// checkpoint. It does not dodge: tests and the store art run it with the sim's `god` flag on.
import { DT } from './defs';
import { NO_INPUT, type Input, type Sim } from './sim';

export class Bot {
  i = 1;
  private hold = 0;
  private jumpT = 0;
  private stuck = 0;
  private lastD = 0;
  /** Running up to a floe jump. */
  private go = false;

  constructor(private sim: Sim) {}

  /** Back on the trail after a respawn. */
  reset(): void {
    const cp = this.sim.c.checkpoints[this.sim.checkpoint];
    this.i = cp ? cp.wp : 1;
    this.hold = 0; this.jumpT = 0; this.go = false;
  }

  input(): Input {
    const s = this.sim, h = s.hero, wps = s.c.waypoints;
    if (h.state !== 'play') return NO_INPUT;
    this.jumpT = Math.max(0, this.jumpT - DT);
    const w0 = wps[this.i] ?? { x: s.c.goal.x, y: s.c.goal.y, z: s.c.goal.z };
    const w = this.ride(w0);
    const dx = w.x - h.x, dz = w.z - h.z, d = Math.hypot(dx, dz);
    let jumpPressed = false;
    // a jump point: take off as it comes within reach (after the floe it aims for has come round), then aim for the next point
    // a floe to jump to or from: wait behind the take-off until the jump will land
    if (w.jump && (w0.wait !== undefined || w0.on !== undefined) && d < 2.2 && h.ground && !this.go) {
      const lead = 1.2 / 6.2;
      const ok = (w0.wait === undefined || this.ready(w0.wait, lead + 0.75, w.z + this.drift(w0.on, lead))) && (w0.on === undefined || this.canLeave(w0.on, lead));
      if (!ok) {
        // wait 1.2 m behind the take-off point (on the floe it rides, if any)
        const p = this.ride(wps[this.i - 1] ?? w0);
        const ux = w.x - p.x, uz = w.z - p.z, ul = Math.hypot(ux, uz) || 1;
        const bx = w.x - (ux / ul) * 1.2 - h.x, bz = w.z - (uz / ul) * 1.2 - h.z, bl = Math.hypot(bx, bz);
        return bl > 0.15 ? { ...NO_INPUT, mx: (bx / bl) * Math.min(1, bl * 2), mz: (bz / bl) * Math.min(1, bl * 2) } : { ...NO_INPUT };
      }
      this.go = true;
    }
    if (w.jump && d < 0.45 && h.ground) {
      this.go = false;
      if (w.hold && this.hold < w.hold) { this.hold += DT; return { ...NO_INPUT }; }
      jumpPressed = true; this.jumpT = 0.34; this.hold = 0; this.i++;
    } else if (!w.jump && d < 0.65 && Math.abs(h.y - w.y) < 1.8) {
      if (w.hold && this.hold < w.hold) { this.hold += DT; return { ...NO_INPUT }; }
      this.hold = 0; this.i++;
    }
    // unstick: no progress for a while (a ledge, a gate not yet open) → hop
    this.stuck = Math.abs(d - this.lastD) < 0.002 && h.ground ? this.stuck + DT : 0;
    this.lastD = d;
    if (this.stuck > 0.6) { jumpPressed = true; this.jumpT = 0.3; this.stuck = 0; }
    const n = this.ride(wps[this.i] ?? w0);
    const tx = n.x - h.x, tz = n.z - h.z, tl = Math.hypot(tx, tz) || 1;
    return { mx: tx / tl, mz: tz / tl, jump: jumpPressed || this.jumpT > 0, jumpPressed, dashPressed: !!n.dash && tl < 3 };
  }

  /** A point on a moving floe, where the floe is now. */
  private ride<T extends { x: number; y: number; z: number; on?: number }>(w: T): T {
    if (w.on === undefined) return w;
    const m = this.sim.c.movers[w.on];
    return { ...w, x: w.x + m.solid.b.x0 - m.rest.x0, y: w.y + m.solid.b.y0 - m.rest.y0, z: w.z + m.solid.b.z0 - m.rest.z0 };
  }

  /** The floe the hero rides is placed for the jump off it (at its far end, in line, not low). */
  private canLeave(k: number, lead: number): boolean {
    const s = this.sim, m = s.c.movers[k];
    const f = Math.sin(((s.time + lead) * s.tune.pace * Math.PI * 2) / m.period + m.phase);
    if (m.az) return f < -0.6;
    if (m.ax) return Math.abs(f) < 0.35;
    return m.ay * f > -0.4;
  }

  /** How far the floe `k` carries the hero along z in the next `dt` seconds. */
  private drift(k: number | undefined, dt: number): number {
    if (k === undefined) return 0;
    const s = this.sim, m = s.c.movers[k];
    const f = (t: number) => Math.sin((t * s.tune.pace * Math.PI * 2) / m.period + m.phase);
    return m.az * (f(s.time + dt) - f(s.time));
  }

  /** The floe is where a jump reaches it: near its middle place (and not high above the hero). */
  private ready(k: number, lead: number, jumpZ: number): boolean {
    const s = this.sim, m = s.c.movers[k], r = m.rest;
    const f = Math.sin(((s.time + lead) * s.tune.pace * Math.PI * 2) / m.period + m.phase);
    if (m.ay) return m.ay * f < 0.6;
    // a jump from jumpZ lands about 3.2 m on: the floe must be under it then
    if (m.az) { const land = jumpZ - 3.2; return land > r.z0 + m.az * f + 0.25 && land < r.z1 + m.az * f - 0.1; }
    return Math.abs(f) < 0.3;
  }

  get done(): boolean { return this.i >= this.sim.c.waypoints.length; }
}
