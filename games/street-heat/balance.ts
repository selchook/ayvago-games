// Street Heat: headless balance runs (not part of the build). Plays every story mission and the
// quick modes with the autopilot on Easy and Normal and prints how often it wins, the time left,
// the damage and the stars, so the clocks, the police and the damage stay fair.
//   npx tsx games/street-heat/balance.ts [runs] [skill good|casual] [mission ids]
import { Sim, DT } from './sim';
import { Job, MISSIONS, type Mode } from './jobs';
import { Bot, SKILL } from './bot';
import { TUNING, carSpec, type CarId } from './defs';
import { city } from './city';

declare const process: { argv: string[] };
type Result = { over: string; clock: number; hp: number; stars: number; cash: number; t: number; maxStars: number };

const runs = Number(process.argv[2] ?? 4);
const skill = (process.argv[3] ?? 'good') as 'good' | 'casual';
const only = process.argv.slice(4).map(Number);

export function play(mode: Mode, mission: number, diff: 'easy' | 'normal', seed: number, car: CarId, log?: (sim: Sim, job: Job, t: number) => void): Result {
  const c = city();
  const def = MISSIONS.find((m) => m.id === mission);
  const start = def ? c.places.get(def.start)! : mode === 'getaway' ? c.places.get('docks')! : c.places.get('garage')!;
  const sim = new Sim({ car, up: { engine: 1, grip: 1, armour: 1, nitro: 0 }, paint: 0xd8342a, tune: TUNING[diff], seed, start, night: 1, police: def?.police ?? true });
  const job = new Job(sim, mode, mission, TUNING[diff]);
  const bot = new Bot(sim, job, SKILL[skill]);
  const limit = mode === 'getaway' ? 600 : mode === 'roam' ? 500 : 420;
  let t = 0;
  while (!job.over && t < limit) {
    sim.step(DT, bot.input(DT));
    job.update(DT);
    for (const e of job.events) if (e.type === 'swap') { const s = carSpec(e.car); sim.player.model = s.model; }
    log?.(sim, job, t);
    sim.events.length = 0; job.events.length = 0;
    t += DT;
  }
  return { over: job.over ?? 'limit', clock: job.clock, hp: sim.player.health / sim.player.hp, stars: job.rating, cash: job.cash, t, maxStars: sim.stats.maxStars };
}

const main = !process.argv[1]?.includes('dbg');
if (main) for (const diff of ['easy', 'normal'] as const) {
  console.log(`\n=== ${diff} (${skill}) ===`);
  for (const m of MISSIONS) {
    if (only.length && !only.includes(m.id)) continue;
    const res: Result[] = [];
    for (let r = 0; r < runs; r++) res.push(play('story', m.id, diff, 100 + r * 17, m.id >= 8 ? 'sports' : 'sedan'));
    const wins = res.filter((r) => r.over === 'done');
    const avg = (f: (r: typeof res[0]) => number, list = wins) => list.length ? (list.reduce((a, r) => a + f(r), 0) / list.length).toFixed(1) : '-';
    console.log(`m${String(m.id).padStart(2, '0')} win ${wins.length}/${runs}  t ${avg((r) => r.t)}s  left ${avg((r) => (r.clock === Infinity ? 0 : r.clock))}s  hp ${avg((r) => r.hp * 100)}%  ★${avg((r) => r.stars)}  heat ${avg((r) => r.maxStars, res)}  fails: ${res.filter((r) => r.over !== 'done').map((r) => r.over).join(',')}`);
  }
  if (!only.length) for (const mode of ['getaway', 'rush', 'roam'] as Mode[]) {
    const res: Result[] = [];
    for (let r = 0; r < runs; r++) res.push(play(mode, 0, diff, 300 + r * 11, 'sedan'));
    console.log(`${mode.padEnd(8)} cash ${(res.reduce((a, r) => a + r.cash, 0) / runs).toFixed(0)}  t ${(res.reduce((a, r) => a + r.t, 0) / runs).toFixed(0)}s  end ${res.map((r) => r.over).join(',')}`);
  }
}
