// Moon Rover: the headless check that the rover can always drive on after a landing. In every
// mission it is dropped from the air at a few hundred spots (random heights, speeds and headings),
// lands, and must then get away with GAS, BRAKE or a turn. A rover that came down with a wheel over
// a ledge or against a building used to be blocked whichever way it drove (1.0.0). It also takes a
// run at every kicker ramp: the rover must leave the lip still going forward (in 1.0.1 the rest of
// the slope under its nose stopped it as a wall at takeoff and threw it back down the ramp).
// Run: npx tsx games/moon-rover/landing.ts [drops per mission]
import { Sim, type Input } from './sim';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DIRS } from './terrain';
import { DT, noRanks, TILE } from './defs';

const idle: Input = { steer: 0, gas: false, brake: false, power: false };

export function landingCheck(drops = 150): { landings: number; stuck: string[] } {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let landings = 0;
  const stuck: string[] = [];
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const lvl = buildLevel(n);
    for (let k = 0; k < drops; k++) {
      const s = new Sim(lvl, noRanks(), false);
      s.god = true;
      const v = s.rover;
      const x = rnd() * lvl.cols * TILE, z = rnd() * lvl.rows * TILE, yaw = rnd() * Math.PI * 2, sp = 4 + rnd() * 12;
      const h = 1 + rnd() * 6, up = rnd() * 4;
      if (s.ter.isHole(x, z) || !s.driveable(x, z)) continue;
      v.x = x; v.z = z; v.yaw = yaw; v.vx = Math.sin(yaw) * sp; v.vz = Math.cos(yaw) * sp;
      v.y = s.groundUnder(x, z, yaw).h + h; v.vy = up; v.air = true; v.airT = 0; v.pitch = v.roll = 0;
      const run = (inp: Input, frames: number) => {
        const x0 = v.x, z0 = v.z;
        let far = 0;
        for (let i = 0; i < frames; i++) { s.step(DT, inp); s.events.length = 0; far = Math.max(far, Math.hypot(v.x - x0, v.z - z0)); }
        return far;
      };
      for (let t = 0; v.air && t < 8; t += DT) { s.step(DT, { ...idle, gas: true }); s.events.length = 0; }
      if (v.air || v.state !== 'drive') continue;
      run(idle, 120);
      if (v.state !== 'drive' || v.air) continue;
      landings++;
      const lx = v.x, lz = v.z;
      let moved = Math.max(run({ ...idle, gas: true }, 90), run({ ...idle, brake: true }, 150));
      for (const steer of [-1, 1]) for (const pedal of ['gas', 'brake'] as const) if (moved < 1) moved = Math.max(moved, run({ ...idle, steer, [pedal]: true }, 120));
      if (moved < 1 && v.state === 'drive') stuck.push(`mission ${n} at tile (${(lx / TILE).toFixed(2)}, ${(lz / TILE).toFixed(2)})`);
    }
  }
  return { landings, stuck };
}

/** Every kicker taken at full speed from a run-up: how many launches, and those thrown back at takeoff. */
export function kickerCheck(): { launches: number; recoil: string[] } {
  let launches = 0;
  const recoil: string[] = [];
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const lvl = buildLevel(n);
    const probe = new Sim(lvl, noRanks(), false);
    for (let r = 0; r < lvl.rows; r++) for (let c = 0; c < lvl.cols; c++) {
      const t = probe.ter.tile(c, r);
      if (!t || t.k !== 'ramp') continue;
      const [kx, kz] = DIRS[t.dir];
      const next = probe.ter.tile(c + kx, r + kz);
      if (next && next.k !== 'chasm' && next.L > t.L) continue; // a connector ramp, not a kicker
      const s = new Sim(lvl, noRanks(), false);
      s.god = true;
      const v = s.rover;
      v.x = (c + 0.5 - kx * 2.5) * TILE; v.z = (r + 0.5 - kz * 2.5) * TILE; v.yaw = Math.atan2(kx, kz);
      if (s.ter.isHole(v.x, v.z) || !s.driveable(v.x, v.z)) continue;
      v.y = s.groundUnder(v.x, v.z, v.yaw).h;
      let air = -1;
      for (let i = 0; i < 60 * 4; i++) {
        s.step(DT, { ...idle, gas: true });
        if (air < 0 && s.events.some((e) => e.e === 'takeoff')) { air = 0; launches++; }
        s.events.length = 0;
        if (air < 0) continue;
        // the first half second of the flight: still going the way it took off
        if ((v.vx * kx + v.vz * kz) < 2) { recoil.push(`mission ${n} kicker at tile (${c}, ${r})`); break; }
        if ((air += DT) > 0.5 || !v.air) break;
      }
    }
  }
  return { launches, recoil };
}

const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('landing.ts')) {
  const r = landingCheck(Number(proc.argv[2]) || 150);
  console.log(`${r.landings} landings, ${r.stuck.length} stuck`);
  for (const l of r.stuck) console.log('  stuck: ' + l);
  const k = kickerCheck();
  console.log(`${k.launches} kicker launches, ${k.recoil.length} thrown back`);
  for (const l of k.recoil) console.log('  thrown back: ' + l);
  proc.exit(r.stuck.length || k.recoil.length || !k.launches ? 1 : 0);
}
