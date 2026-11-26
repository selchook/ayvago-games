// Moon Rover: the autopilot (placeholder until the planner lands).
import type { Sim, Input } from './sim';

export class Bot {
  i = 0;
  constructor(private sim: Sim) {}
  reset(): void { /* nothing yet */ }
  input(): Input {
    const v = this.sim.rover;
    const t = this.sim.crystals.find((c) => !c.taken) ?? this.sim.c.base;
    const want = Math.atan2(t.x - v.x, t.z - v.z);
    let da = want - v.yaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return { steer: Math.max(-1, Math.min(1, -da * 2)), gas: true, brake: false, power: false };
  }
}
