// Headless balance check: the autopilot skates whole sessions on the pure simulation.
// Run: npx tsx games/kickflip-park/balance.ts [sessions]
//   reports per park, difficulty and skill: average score, goals completed (and which), bail rate
//   (bails per minute and per trick), combos, best combo.
import { Sim } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { park, PARKS, type ParkId } from './parks';
import type { Mode } from './defs';

export interface RunResult { score: number; goals: string[]; bails: number; tricks: number; combos: number; best: number; seconds: number; tapes: number }

export function playRun(id: ParkId, mode: Mode, skill: Skill, seed: number): RunResult {
  const sim = new Sim(park(id), mode, seed);
  const bot = new Bot(sim, skill, seed * 13 + 5);
  const dt = 1 / 60;
  let t = 0;
  while (!sim.over && t < 400) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
    t += dt;
  }
  return {
    score: sim.score, goals: [...sim.done], bails: sim.stats.bails, tricks: sim.stats.tricks, combos: sim.stats.combos,
    best: sim.stats.bestCombo, seconds: sim.time, tapes: sim.tapes.filter(Boolean).length,
  };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const runs = Number(proc.argv[2] ?? 8);
  const only = proc.argv.slice(3) as ParkId[];
  for (const id of (only.length ? only : PARKS)) {
    for (const mode of ['easy', 'normal'] as Mode[]) {
      for (const [name, sk] of Object.entries(SKILL)) {
        const res: RunResult[] = [];
        for (let i = 0; i < runs; i++) res.push(playRun(id, mode, sk, 100 + i));
        const goalCount: Record<string, number> = {};
        for (const r of res) for (const g of r.goals) goalCount[g] = (goalCount[g] ?? 0) + 1;
        const mins = avg(res.map((r) => r.seconds)) / 60;
        console.log(`${id.padEnd(6)} ${mode.padEnd(6)} ${name.padEnd(6)} score ${Math.round(avg(res.map((r) => r.score))).toString().padStart(6)} (min ${Math.min(...res.map((r) => r.score))}, max ${Math.max(...res.map((r) => r.score))})`
          + `  goals ${avg(res.map((r) => r.goals.length)).toFixed(1)}  bails/min ${(avg(res.map((r) => r.bails)) / mins).toFixed(1)}  bail/trick ${(avg(res.map((r) => r.bails)) / Math.max(1, avg(res.map((r) => r.tricks)))).toFixed(2)}`
          + `  combos ${avg(res.map((r) => r.combos)).toFixed(0)}  best ${Math.round(avg(res.map((r) => r.best)))}  tapes ${avg(res.map((r) => r.tapes)).toFixed(1)}`
          + `\n         ${Object.entries(goalCount).map(([g, n]) => `${g}:${n}`).join(' ')}`);
      }
    }
  }
}
