// Headless balance check: the autopilot runs whole deliveries on the pure simulation.
// Run: npx tsx games/rooftop-courier/balance.ts [runs]
//   reports per difficulty and skill: run length, distance, deliveries, district reached, the
//   cause of the end (fell / late / cap), falls, stumbles, rolls and score.
import { Sim } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import type { Mode } from './defs';

export interface RunResult { seconds: number; distance: number; deliveries: number; district: number; reason: string; falls: number; stumbles: number; zips: number; score: number; stamps: number; rushes: number }

export function playRun(mode: Mode, skill: Skill, seed: number, cap = 600): RunResult {
  const sim = new Sim(mode, seed);
  const bot = new Bot(sim, skill, seed * 13 + 5);
  const dt = 1 / 60;
  while (!sim.over && sim.time < cap) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
  }
  return {
    seconds: sim.time, distance: sim.stats.distance, deliveries: sim.stats.deliveries, district: sim.district + 1,
    reason: sim.overReason ?? 'cap', falls: sim.stats.falls, stumbles: sim.stats.stumbles, zips: sim.stats.zips,
    score: Math.round(sim.score), stamps: sim.stamps, rushes: sim.stats.rushes,
  };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const med = (a: number[]) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] ?? 0; };

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const runs = Number(proc.argv[2] ?? 12);
  for (const mode of ['normal', 'easy'] as Mode[]) {
    for (const [name, sk] of Object.entries(SKILL)) {
      const res: RunResult[] = [];
      for (let i = 0; i < runs; i++) res.push(playRun(mode, sk, 100 + i));
      const reasons: Record<string, number> = {};
      for (const r of res) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      const dist: Record<number, number> = {};
      for (const r of res) dist[r.district] = (dist[r.district] ?? 0) + 1;
      console.log(`${mode.padEnd(6)} ${name.padEnd(6)} time ${avg(res.map((r) => r.seconds)).toFixed(0)}s (median ${med(res.map((r) => r.seconds)).toFixed(0)}, min ${Math.min(...res.map((r) => r.seconds)).toFixed(0)}, max ${Math.max(...res.map((r) => r.seconds)).toFixed(0)})`
        + `  dist ${avg(res.map((r) => r.distance)).toFixed(0)} m  deliveries ${avg(res.map((r) => r.deliveries)).toFixed(1)}  score ${avg(res.map((r) => r.score)).toFixed(0)}`
        + `  stamps ${avg(res.map((r) => r.stamps)).toFixed(0)}  falls ${avg(res.map((r) => r.falls)).toFixed(1)}  stumbles ${avg(res.map((r) => r.stumbles)).toFixed(1)}  zips ${avg(res.map((r) => r.zips)).toFixed(1)}  rushes ${avg(res.map((r) => r.rushes)).toFixed(1)}`
        + `\n                end: ${Object.entries(reasons).map(([k, n]) => `${k} ${n}`).join(', ')}   district reached: ${Object.entries(dist).map(([k, n]) => `${k}:${n}`).join(' ')}`);
    }
  }
}
