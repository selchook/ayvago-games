// Headless balance check: the autopilot plays whole runs on the pure simulation.
// Run: npx tsx games/sushi-rush/balance.ts [runs]
//   reports, per difficulty and skill: the day reached (first run from a fresh save, and a later
//   run with the upgrades of a few runs), coins earned, served dishes, lost customers.
import { Day, mulberry, type RunState } from './sim';
import { Bot, SKILL, botShop, botPick, type Skill } from './bot';
import { DT, type Mode } from './defs';
import { noRanks, rollCards, type Ranks } from './powers';

export interface RunResult { day: number; earned: number; served: number; lost: number; wrong: number; purse: number; fail: string }

export function playRun(mode: Mode, skill: Skill, seed: number, ranks: Ranks, purse: number, limit = 30): RunResult {
  const rnd = mulberry(seed * 7 + 1);
  const run: RunState = { mode, day: 1, earned: 0, cards: [], ranks, seed, served: 0, tips: 0 };
  let lost = 0, wrong = 0, fail = '';
  for (;;) {
    const offer = rollCards(run.cards, rnd);
    run.cards.push(offer[botPick(offer)]);
    const day = new Day(run, seed * 100 + run.day);
    const bot = new Bot(day, skill, rnd);
    while (!day.over) { bot.step(DT); day.step(DT); day.events.length = 0; }
    lost += day.stats.lost; wrong += day.stats.wrong;
    purse += Math.max(0, day.coins);
    if (!day.won) { fail = `${day.why} d${run.day} ${day.coins}/${day.goal}`; break; }
    if (run.day >= limit) break;
    purse = botShop(ranks, purse, run.day);
    run.day++;
  }
  return { day: run.day, earned: run.earned, served: run.served, lost, wrong, purse, fail };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const runs = Number(proc.argv[2] ?? 8);
  for (const mode of ['easy', 'normal'] as Mode[]) {
    for (const [name, skill] of Object.entries(SKILL)) {
      const first: RunResult[] = [], later: RunResult[] = [];
      for (let i = 0; i < runs; i++) {
        const ranks = noRanks();
        let purse = 0;
        // a fresh save's first run, then three more runs with what they bought
        for (let k = 0; k < 4; k++) {
          const r = playRun(mode, skill, 1000 + i * 17 + k, ranks, purse);
          purse = r.purse;
          (k === 0 ? first : later).push(r);
        }
      }
      const line = (rs: RunResult[]) => `day ${avg(rs.map((r) => r.day)).toFixed(1)} [${Math.min(...rs.map((r) => r.day))}-${Math.max(...rs.map((r) => r.day))}] earned ${Math.round(avg(rs.map((r) => r.earned)))} lost ${avg(rs.map((r) => r.lost)).toFixed(1)} wrong ${avg(rs.map((r) => r.wrong)).toFixed(1)}`;
      console.log(`${mode.padEnd(6)} ${name.padEnd(6)} first: ${line(first)}`);
      console.log(`${''.padEnd(13)} later: ${line(later)}   fails: ${first.slice(0, 4).map((r) => r.fail).join(', ')}`);
    }
  }
}
