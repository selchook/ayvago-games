// Headless balance check: the autopilot plays whole runs on the pure simulation.
// Run: npx tsx games/skull-isle/balance.ts [runs]
//   reports, per difficulty, skill and meta set: islands reached, bosses beaten, deaths by cause,
//   gold earned, Doubloons and run length.
import { Sim } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { ALL_NODES, type NodeId } from './upgrades';
import { DT, type Mode, type HeroId, type Cause } from './defs';

export interface RunResult { islands: number; bosses: number; kraken: boolean; gold: number; doubloons: number; seconds: number; cause: Cause | null; score: number }

export function playRun(mode: Mode, skill: Skill, nodes: NodeId[], seed: number, hero: HeroId = 'anne', limit = 3600): RunResult {
  const sim = new Sim(mode, seed, { hero, nodes });
  const bot = new Bot(sim, skill, seed);
  while (!sim.over && sim.time < limit) {
    if (sim.phase === 'shop') { bot.shop(); sim.leaveShop(); }
    if (sim.phase === 'draft') sim.pickBoon(bot.draft());
    sim.step(DT, bot.input(DT));
    sim.events.length = 0;
  }
  return { islands: sim.islandsCleared, bosses: sim.bosses, kraken: sim.krakenDown, gold: sim.goldEarned, doubloons: sim.doubloons, seconds: sim.time, cause: sim.cause, score: sim.score };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const runs = Number(proc.argv[2] ?? 12);
  const sets: [string, NodeId[]][] = [['no meta', []], ['4 nodes', ['hardy', 'whetstone', 'seaLegs', 'luckyCoin']], ['all meta', ALL_NODES]];
  for (const mode of ['easy', 'normal'] as Mode[]) {
    for (const [skName, sk] of Object.entries(SKILL)) {
      for (const [mName, nodes] of sets) {
        const res: RunResult[] = [];
        for (let i = 0; i < runs; i++) res.push(playRun(mode, sk, nodes, 1000 + i));
        const causes: Record<string, number> = {};
        for (const r of res) causes[r.cause ?? 'alive'] = (causes[r.cause ?? 'alive'] ?? 0) + 1;
        const isl = res.map((r) => r.islands);
        console.log(`${mode.padEnd(6)} ${skName.padEnd(6)} ${mName.padEnd(8)} islands ${avg(isl).toFixed(1)} (min ${Math.min(...isl)}, max ${Math.max(...isl)})  reached boss ${res.filter((r) => r.islands >= 2).length}/${runs}  kraken ${res.filter((r) => r.kraken).length}/${runs}  gold ${Math.round(avg(res.map((r) => r.gold)))}  doubloons ${avg(res.map((r) => r.doubloons)).toFixed(1)}  time ${(avg(res.map((r) => r.seconds)) / 60).toFixed(1)} min  deaths ${Object.entries(causes).map(([c, n]) => `${c}:${n}`).join(' ')}`);
      }
    }
  }
}
