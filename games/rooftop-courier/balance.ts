// Headless balance check: the autopilot runs whole deliveries on the pure simulation.
// Run: npx tsx games/rooftop-courier/balance.ts [runs] [upgrades] [mode] [skill]
//   upgrades: none (default), half (every upgrade at half its levels, rounded up) or max;
//   mode: normal | easy | all; skill: good | casual | all.
//   Reports per difficulty and skill: run length, distance, deliveries, district reached, the
//   cause of the end (fell / late / cap), falls, shield saves, power-ups, stumbles and score.
import { Sim, NO_UPGRADES, type Upgrades } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { UPGRADES, UPGRADE_IDS } from './upgrades';
import type { Mode } from './defs';

export interface RunResult { seconds: number; distance: number; deliveries: number; district: number; reason: string; falls: number; saves: number; powers: number; stumbles: number; zips: number; score: number; stamps: number; rushes: number }

export function playRun(mode: Mode, skill: Skill, seed: number, upg: Upgrades = NO_UPGRADES, cap = 600): RunResult {
  const sim = new Sim(mode, seed, upg);
  const bot = new Bot(sim, skill, seed * 13 + 5);
  const dt = 1 / 60;
  while (!sim.over && sim.time < cap) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
  }
  return {
    seconds: sim.time, distance: sim.stats.distance, deliveries: sim.stats.deliveries, district: sim.district + 1,
    reason: sim.overReason ?? 'cap', falls: sim.stats.falls, saves: sim.stats.saves, powers: sim.stats.powers, stumbles: sim.stats.stumbles, zips: sim.stats.zips,
    score: Math.round(sim.score), stamps: sim.stamps, rushes: sim.stats.rushes,
  };
}

export function preset(name: string): Upgrades {
  const u = { ...NO_UPGRADES };
  for (const id of UPGRADE_IDS) u[id] = name === 'max' ? UPGRADES[id].length : name === 'half' ? Math.ceil(UPGRADES[id].length / 2) : 0;
  return u;
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const med = (a: number[]) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] ?? 0; };

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const [runsArg = '12', up = 'none', modeArg = 'all', skillArg = 'all'] = proc.argv.slice(2);
  const runs = Number(runsArg);
  const upg = preset(up);
  for (const mode of (['normal', 'easy'] as Mode[]).filter((m) => modeArg === 'all' || m === modeArg)) {
    for (const [name, sk] of Object.entries(SKILL).filter(([n]) => skillArg === 'all' || n === skillArg)) {
      const res: RunResult[] = [];
      const seed0 = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEED0 ?? 100);
      for (let i = 0; i < runs; i++) res.push(playRun(mode, sk, seed0 + i, upg));
      const dump = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.DUMP;
      if (dump) console.log('RUNS ' + JSON.stringify(res.map((r) => [Math.round(r.seconds), r.reason, Math.round(r.distance), r.deliveries, r.stamps])));
      const reasons: Record<string, number> = {};
      for (const r of res) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      const dist: Record<number, number> = {};
      for (const r of res) dist[r.district] = (dist[r.district] ?? 0) + 1;
      console.log(`${mode.padEnd(6)} ${name.padEnd(6)} [${up}] time ${avg(res.map((r) => r.seconds)).toFixed(0)}s (median ${med(res.map((r) => r.seconds)).toFixed(0)}, min ${Math.min(...res.map((r) => r.seconds)).toFixed(0)}, max ${Math.max(...res.map((r) => r.seconds)).toFixed(0)})`
        + `  dist ${avg(res.map((r) => r.distance)).toFixed(0)} m  deliveries ${avg(res.map((r) => r.deliveries)).toFixed(1)}  score ${avg(res.map((r) => r.score)).toFixed(0)}`
        + `  stamps ${avg(res.map((r) => r.stamps)).toFixed(0)}  falls ${avg(res.map((r) => r.falls)).toFixed(1)}  saves ${avg(res.map((r) => r.saves)).toFixed(1)}  powers ${avg(res.map((r) => r.powers)).toFixed(1)}  stumbles ${avg(res.map((r) => r.stumbles)).toFixed(1)}  zips ${avg(res.map((r) => r.zips)).toFixed(1)}  rushes ${avg(res.map((r) => r.rushes)).toFixed(1)}`
        + `\n                end: ${Object.entries(reasons).map(([k, n]) => `${k} ${n}`).join(', ')}   district reached: ${Object.entries(dist).map(([k, n]) => `${k}:${n}`).join(' ')}`);
    }
  }
}
