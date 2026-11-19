// Headless balance check: the autopilot plays whole campaigns on the pure simulation.
// Run: npx tsx games/astro-crew/balance.ts [campaigns] [hero]
//   For each difficulty and bot skill: from a fresh save, runs are played one after another (each
//   run goes from the furthest unlocked planet on, buying base modules between missions, until the
//   hero falls) until the campaign is beaten or 14 runs are used. Reported: the clear rate of each
//   mission (clears / attempts), its average time and the hero's health left, the runs it took to
//   beat the campaign, and the level reached per run.
import { Mission, newRun, NO_INPUT, type RunState } from './sim';
import { Bot, SKILL, botShop, botPick, type Skill } from './bot';
import { DT, MISSIONS, crystalsFor, type HeroId, type Mode } from './defs';
import { noRanks, rollCards } from './powers';
import { mulberry } from './sim';

interface MissionLog { tries: number; clears: number; time: number; hp: number; stars: number }

export function playMission(run: RunState, n: number, skill: Skill, seed: number, rnd: () => number): { won: boolean; time: number; hp: number; stars: number; crystals: number } {
  const sim = new Mission(MISSIONS[n - 1], run, seed);
  const bot = new Bot(sim, skill, rnd);
  let steps = 0;
  while (sim.phase === 'play' && steps < 60 * 720) {
    sim.step(DT, bot.input(DT));
    sim.events.length = 0;
    while (sim.pendingLevels > 0) {
      const offer = rollCards(run.cards, rnd);
      if (offer.length) { run.cards.push(offer[botPick(offer)]); sim.refreshMods(); }
      sim.tookLevel();
    }
    steps++;
  }
  for (let i = 0; i < 60; i++) { sim.step(DT, NO_INPUT); sim.events.length = 0; }
  const st = sim.stars().filter(Boolean).length;
  const won = sim.phase === 'won';
  return { won, time: sim.time, hp: sim.stats.low, stars: st, crystals: (won ? crystalsFor(n, st) : 0) + sim.stats.crystals };
}

export function campaign(mode: Mode, hero: HeroId, skill: Skill, seed: number, logs: MissionLog[]): { runs: number; beaten: boolean; levels: number[]; scores: number[] } {
  const rnd = mulberry(seed);
  const ranks = noRanks();
  let purse = 0, unlocked = 1, runs = 0;
  const levels: number[] = [], scores: number[] = [];
  while (runs < 14 && unlocked <= 12) {
    runs++;
    const run = newRun(mode, hero, ranks);
    let n = unlocked;
    for (;;) {
      const r = playMission(run, n, skill, seed * 1000 + runs * 50 + run.depth, rnd);
      const L = logs[n - 1];
      L.tries++;
      run.depth++;
      purse += r.crystals;
      if (!r.won) break;
      L.clears++; L.time += r.time; L.hp += r.hp; L.stars += r.stars;
      run.score += 400 * n + Math.max(0, Math.round((MISSIONS[n - 1].par - r.time) * 4)) + r.stars * 250;
      if (n === unlocked) unlocked++;
      purse = botShop(ranks, purse);
      if (n >= 12) { unlocked = 13; break; }
      n++;
    }
    levels.push(run.level);
    scores.push(run.score);
  }
  return { runs, beaten: unlocked > 12, levels, scores };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const count = Number(proc.argv[2] ?? 4);
  const hero = (proc.argv[3] ?? 'frog') as HeroId;
  for (const mode of ['easy', 'normal'] as Mode[]) {
    for (const [name, skill] of Object.entries(SKILL)) {
      if (name === 'good' && mode === 'easy') continue;
      const logs: MissionLog[] = MISSIONS.map(() => ({ tries: 0, clears: 0, time: 0, hp: 0, stars: 0 }));
      const res = [];
      for (let i = 0; i < count; i++) res.push(campaign(mode, hero, skill, 101 + i * 7, logs));
      console.log(`\n${mode} ${name} (${hero}): campaigns beaten ${res.filter((r) => r.beaten).length}/${count}, runs ${avg(res.map((r) => r.runs)).toFixed(1)}, first-run level ${avg(res.map((r) => r.levels[0])).toFixed(1)}, best score ${Math.round(avg(res.map((r) => Math.max(...r.scores))))}`);
      console.log('  mission  clear-rate  time  lowest-hp  stars');
      logs.forEach((L, i) => {
        if (!L.tries) return;
        console.log(`  ${String(i + 1).padStart(2)} ${MISSIONS[i].kind.padEnd(7)} ${String(L.clears).padStart(3)}/${String(L.tries).padEnd(3)} ${(100 * L.clears / L.tries).toFixed(0).padStart(4)}%  ${(L.time / Math.max(1, L.clears)).toFixed(0).padStart(4)}s  ${(100 * L.hp / Math.max(1, L.clears)).toFixed(0).padStart(4)}%  ${(L.stars / Math.max(1, L.clears)).toFixed(1)}`);
      });
    }
  }
}
