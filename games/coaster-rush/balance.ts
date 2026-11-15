// Headless balance check: the autopilot rides whole runs on the pure simulation.
// Run: npx tsx games/coaster-rush/balance.ts [runs] [upgrades] [mode] [skill]
//   upgrades: none (default), half (every upgrade at half its levels, rounded up) or max;
//   mode: normal | easy | all; skill: good | casual | all.
//   Reports per difficulty and skill: run length, areas reached, the cause of the end (derail /
//   refund / cap), derails, stalls, stations (perfect, missed), airtime, loops, near-misses,
//   tokens and score.
import { Sim, type OverReason } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { NO_UPGRADES, UPGRADES, UPGRADE_IDS, type Upgrades } from './upgrades';
import type { Mode } from './defs';

export interface RunResult {
  seconds: number; areas: number; reason: OverReason | 'cap'; derails: number; stalls: number; stations: number; perfect: number;
  missed: number; airtime: number; loops: number; near: number; tokens: number; score: number; powers: number; happy: number;
}

export function playRun(mode: Mode, skill: Skill, seed: number, upg: Upgrades = NO_UPGRADES, cap = 900): RunResult {
  const sim = new Sim(mode, seed, upg);
  const bot = new Bot(sim, skill, seed * 13 + 5);
  const dt = 1 / 60;
  while (!sim.over && sim.time < cap) {
    sim.step(dt * sim.timeScale, bot.input(dt));
    sim.events.length = 0;
  }
  const st = sim.stats;
  return {
    seconds: sim.time, areas: st.areas + 1, reason: sim.overReason ?? 'cap', derails: st.derails, stalls: st.stalls, stations: st.stations,
    perfect: st.perfect, missed: st.missed, airtime: st.airtime, loops: st.loops, near: st.nearMiss, tokens: sim.tokens, score: Math.round(sim.score),
    powers: st.powers, happy: Math.round(sim.happy),
  };
}

export function preset(name: string): Upgrades {
  const u = { ...NO_UPGRADES };
  for (const id of UPGRADE_IDS) u[id] = name === 'max' ? UPGRADES[id].length : name === 'half' ? Math.ceil(UPGRADES[id].length / 2) : 0;
  return u;
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const med = (a: number[]) => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] ?? 0; };

const proc = (globalThis as { process?: { argv: string[]; env: Record<string, string | undefined> } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const [runsArg = '12', up = 'none', modeArg = 'all', skillArg = 'all'] = proc.argv.slice(2);
  const runs = Number(runsArg);
  const upg = preset(up);
  const seed0 = Number(proc.env.SEED0 ?? 100);
  for (const mode of (['normal', 'easy'] as Mode[]).filter((m) => modeArg === 'all' || m === modeArg)) {
    for (const [name, sk] of Object.entries(SKILL).filter(([n]) => skillArg === 'all' || n === skillArg)) {
      const res: RunResult[] = [];
      for (let i = 0; i < runs; i++) res.push(playRun(mode, sk, seed0 + i, upg));
      if (proc.env.DUMP) console.log('RUNS ' + JSON.stringify(res.map((r) => [Math.round(r.seconds), r.reason, r.areas, r.derails, r.stalls, r.missed, r.tokens, r.score])));
      const reasons: Record<string, number> = {};
      for (const r of res) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      const areas: Record<number, number> = {};
      for (const r of res) areas[r.areas] = (areas[r.areas] ?? 0) + 1;
      const f = (k: keyof RunResult, d = 1) => avg(res.map((r) => r[k] as number)).toFixed(d);
      console.log(`${mode.padEnd(6)} ${name.padEnd(6)} [${up}] time ${f('seconds', 0)}s (median ${med(res.map((r) => r.seconds)).toFixed(0)}, min ${Math.min(...res.map((r) => r.seconds)).toFixed(0)}, max ${Math.max(...res.map((r) => r.seconds)).toFixed(0)})`
        + `  areas ${f('areas')}  derails ${f('derails')}  stalls ${f('stalls')}  stations ${f('stations')} (perfect ${f('perfect')}, missed ${f('missed')})`
        + `  air ${f('airtime')}s  loops ${f('loops')}  near ${f('near')}  powers ${f('powers')}  tokens ${f('tokens', 0)}  score ${f('score', 0)}  happy ${f('happy', 0)}`
        + `\n                end: ${Object.entries(reasons).map(([k, n]) => `${k} ${n}`).join(', ')}   areas reached: ${Object.entries(areas).map(([k, n]) => `${k}:${n}`).join(' ')}`);
    }
  }
}
