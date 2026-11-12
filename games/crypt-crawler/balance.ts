// Headless balance check: the autopilot (bot.ts) plays whole runs on the pure simulation.
// Run: npx tsx games/crypt-crawler/balance.ts [runs]
import { Sim, seeded, BOSS_EVERY, type Tune, type MetaLevels } from './sim';
import { Bot, SKILL, type Skill } from './bot';

export interface RunResult { floor: number; cleared: number; firstBoss: boolean; gold: number; score: number; time: number }

export function playRun(mode: Tune, seed: number, skill: Skill, meta: MetaLevels = {}, maxFloor = 15): RunResult {
  const sim = new Sim(mode, seed, meta);
  const bot = new Bot(sim, skill, seeded(seed * 7 + 1));
  const dt = 1 / 30;
  let t = 0;
  let firstBoss = false;
  while (!sim.over && t < 60 * 60 && sim.floorNo <= maxFloor) {
    bot.update(dt);
    sim.step(dt);
    t += dt;
    for (const ev of sim.events) {
      if (ev.type === 'shrine') sim.applyUpgrade(bot.choose(sim.offer()));
      else if (ev.type === 'bossDie' && sim.floorNo === BOSS_EVERY) firstBoss = true;
    }
    if (sim.events.some((e) => e.type === 'stairs')) sim.nextFloor();
  }
  return { floor: sim.floorNo, cleared: sim.cleared, firstBoss, gold: sim.goldRun, score: sim.score, time: t };
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function report(runs = 40): string {
  const out: string[] = [];
  for (const skillName of ['good', 'casual'] as const) for (const mode of ['easy', 'normal'] as Tune[]) {
    const rs = Array.from({ length: runs }, (_, i) => playRun(mode, 1000 + i, SKILL[skillName]));
    const floors = rs.map((r) => r.floor);
    const boss = rs.filter((r) => r.firstBoss).length / runs;
    const reach3 = rs.filter((r) => r.floor >= BOSS_EVERY).length / runs;
    out.push(`${skillName.padEnd(6)} ${mode.padEnd(6)} median floor ${median(floors)} (min ${Math.min(...floors)} max ${Math.max(...floors)}), reach boss ${(reach3 * 100).toFixed(0)}%, beat first boss ${(boss * 100).toFixed(0)}%, median gold ${median(rs.map((r) => r.gold))}, median minutes ${(median(rs.map((r) => r.time)) / 60).toFixed(1)}`);
  }
  return out.join('\n');
}

// run directly (npx tsx games/crypt-crawler/balance.ts [runs]): print the table
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) console.log(report(Number(proc.argv[2] ?? 40)));
