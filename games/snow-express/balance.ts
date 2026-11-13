// Headless balance check: the autopilot plays the pure simulation.
// Run: npx tsx games/snow-express/balance.ts [runs]
//   Journey: stars per level for the good and the casual bot on Easy and Normal (average and the
//   share of failed runs, with what failed them). Holiday Rush: score and run length.
import { Sim } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { LEVELS, RUSH, timetable, type LevelDef } from './levels';
import { Board } from './graph';
import type { Mode } from './defs';

export interface LevelRun { stars: number; won: boolean; reason: string; time: number; par: number; score: number; mistakes: number }

export function playLevel(def: LevelDef, mode: Mode, skill: Skill, seed: number): LevelRun {
  const spawns = timetable(def, mode, seed);
  const sim = new Sim({ map: def, mode, seed, spawns, speed: def.spec.speed });
  const par = Sim.par(new Board(def), spawns, mode, def.spec.speed);
  const bot = new Bot(sim, skill, seed * 31 + 7);
  const dt = 1 / 30;
  while (!sim.over && sim.time < 600) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
  }
  const stars = sim.stars(par);
  return {
    stars, won: sim.won, reason: sim.won ? '' : sim.failReason ?? 'timeout', time: sim.time, par, score: sim.score,
    mistakes: sim.stats.wrong + sim.stats.lost + sim.stats.stuck + sim.stats.crashes,
  };
}

export function playRush(board: number, mode: Mode, skill: Skill, seed: number): { score: number; seconds: number; delivered: number; reason: string } {
  const def = RUSH[board % RUSH.length];
  const sim = new Sim({ map: def, mode, seed, spawns: null });
  const bot = new Bot(sim, skill, seed * 17 + 3);
  const dt = 1 / 30;
  while (!sim.over && sim.time < 1200) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
  }
  return { score: sim.score, seconds: sim.time, delivered: sim.stats.correct, reason: sim.failReason ?? 'timeout' };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc && /balance\.ts$/.test(proc.argv[1] ?? '')) {
  const runs = Number(proc.argv[2] ?? 6);
  const only = proc.argv[3] ? proc.argv[3].split(',').map(Number) : null;
  for (const mode of ['normal', 'easy'] as Mode[]) {
    console.log(`\n=== Journey, ${mode} (${runs} runs per level) ===`);
    console.log('lvl  good: stars fail%        casual: stars fail% (why)');
    for (const def of LEVELS) {
      if (only && !only.includes(def.id)) continue;
      const row: string[] = [];
      for (const sk of ['good', 'casual'] as const) {
        const rs = Array.from({ length: runs }, (_, i) => playLevel(def, mode, SKILL[sk], i + 1));
        const fails = rs.filter((r) => !r.won);
        const why = [...new Set(fails.map((r) => r.reason))].join('/');
        row.push(`${avg(rs.map((r) => r.stars)).toFixed(2)} ${String(Math.round(fails.length / runs * 100)).padStart(3)}% m${avg(rs.map((r) => r.mistakes)).toFixed(1)}${why ? ' (' + why + ')' : ''}`.padEnd(30));
      }
      console.log(`L${String(def.id).padEnd(3)} ${row.join(' ')}`);
    }
    console.log(`\n=== Holiday Rush, ${mode} ===`);
    for (const sk of ['good', 'casual'] as const) {
      const rs = Array.from({ length: runs }, (_, i) => playRush(i, mode, SKILL[sk], i + 1));
      console.log(`${sk.padEnd(7)} score ${Math.round(avg(rs.map((r) => r.score)))} (min ${Math.min(...rs.map((r) => r.score))}, max ${Math.max(...rs.map((r) => r.score))})  length ${Math.round(avg(rs.map((r) => r.seconds)))} s (min ${Math.round(Math.min(...rs.map((r) => r.seconds)))}, max ${Math.round(Math.max(...rs.map((r) => r.seconds)))})  deliveries ${avg(rs.map((r) => r.delivered)).toFixed(1)}  ends: ${rs.map((r) => r.reason[0]).join('')}`);
    }
  }
}
