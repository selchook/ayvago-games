// Headless balance check: the autopilot plays the whole campaign on the pure simulation.
// Run: npx tsx games/neon-ronin/balance.ts [campaigns] [skill]
//   For each difficulty and skill: a fresh save plays from 1-1 the way a player would (a run goes
//   level after level; out of lives, the next run starts at the level that was lost; gears are
//   banked and spent on cyberware between levels; the implant pick a level's first checkpoint
//   banks is taken on its results screen, as 1.1 offers it (a run lost before the clear loses
//   it), plus the boss's chip). Reports, per level: the share of attempts that cleared it, deaths
//   per attempt, the clear time against par, chips found, and where the failed attempts ended;
//   then one summary line per difficulty and skill.
import { Sim, newRun, mulberry, type RunState } from './sim';
import { Bot, SKILL, botPick, botShop, type Skill } from './bot';
import { DT, type Mode } from './defs';
import { LEVELS, checkLevels } from './levels';
import { noRanks, rollCards, ABILITY_AT, ABILITY_IDS, type AbilityId } from './powers';

interface LevelStat { tries: number; clears: number; deaths: number; hits: number; time: number[]; chips: number; fails: number[]; stars: number }

export function playLevel(run: RunState, li: number, skill: Skill, seed: number, rnd: () => number, limit = 360): { sim: Sim; cleared: boolean } {
  const sim = new Sim(li, run, seed);
  const bot = new Bot(sim, skill, mulberry(seed * 3 + 1));
  let tClear = -1;
  while (sim.time < limit) {
    sim.step(DT, bot.input(DT));
    for (const e of sim.events) if (e.type === 'clear') tClear = sim.time;
    sim.events.length = 0;
    if (sim.over) break;
    if (tClear >= 0 && sim.time > tClear + 0.1) break;
  }
  // the results screen: the banked pick (a boss's card starts the next district's set instead)
  if (sim.cleared && !LEVELS[li].boss) {
    while (run.picks > 0) {
      const offer = rollCards(run.cards, rnd);
      if (offer.length) run.cards.push(offer[botPick(offer)]);
      run.picks--;
    }
  }
  return { sim, cleared: sim.cleared };
}

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const bad = checkLevels();
  if (bad.length) console.log('level data:', bad);
  const campaigns = Number(proc.argv[2] ?? 3);
  const only = proc.argv[3];
  for (const mode of ['easy', 'normal'] as Mode[]) {
    for (const [name, skill] of Object.entries(SKILL)) {
      if (only && name !== only) continue;
      const stats: LevelStat[] = LEVELS.map(() => ({ tries: 0, clears: 0, deaths: 0, hits: 0, time: [], chips: 0, fails: [], stars: 0 }));
      let finished = 0;
      for (let c = 0; c < campaigns; c++) {
        const rnd = mulberry(1000 + c * 31);
        const ranks = noRanks();
        const abilities: AbilityId[] = [];
        let gears = 0;
        let li = 0;
        let run = newRun(mode, ranks, abilities);
        let attempts = 0;
        while (li < LEVELS.length && attempts < 60) {
          attempts++;
          const st = stats[li];
          st.tries++;
          const livesBefore = run.lives;
          const { sim, cleared } = playLevel(run, li, skill, 7000 + c * 101 + attempts, rnd);
          st.deaths += sim.deaths;
          st.hits += sim.hits;
          gears += sim.gears;
          void livesBefore;
          if (cleared) {
            st.clears++;
            st.time.push(sim.time);
            st.chips += sim.chips.filter(Boolean).length;
            st.stars += sim.stars().filter(Boolean).length;
            run.score += sim.score;
            for (const a of ABILITY_IDS) if (ABILITY_AT[a] === li && !abilities.includes(a)) abilities.push(a);
            gears = botShop(ranks, gears);
            const boss = LEVELS[li].boss;
            li++;
            if (boss && li < LEVELS.length) {
              // a new district: the boss's chip carries over, one life back
              const offer = rollCards([], rnd);
              run.cards = [offer[botPick(offer)]];
              run.lives = Math.min(run.lives + 1, 5);
            }
          } else {
            st.fails.push(Math.round(sim.p.x));
            if (proc?.argv[4] === 'v' && st.fails.length === 1) console.log('   fail', LEVELS[li].id, 'cards', run.cards.join(','), 'ranks', JSON.stringify(ranks), 'seed', 7000 + c * 101 + attempts);
            // a new run from this level
            gears = botShop(ranks, gears);
            run = newRun(mode, ranks, abilities);
          }
        }
        if (li >= LEVELS.length) finished++;
      }
      console.log(`\n${mode} / ${name}: campaign finished ${finished}/${campaigns}`);
      stats.forEach((st, i) => {
        const L = LEVELS[i];
        const avgT = st.time.length ? st.time.reduce((a, b) => a + b, 0) / st.time.length : 0;
        console.log(`  ${L.id.padEnd(4)} clear ${st.clears}/${st.tries} (${st.tries ? Math.round(st.clears / st.tries * 100) : 0}%)  deaths/try ${(st.deaths / Math.max(1, st.tries)).toFixed(1)}  hits/try ${(st.hits / Math.max(1, st.tries)).toFixed(1)}  time ${avgT.toFixed(0)}s/par ${L.par}  chips ${(st.chips / Math.max(1, st.clears)).toFixed(1)}  stars ${(st.stars / Math.max(1, st.clears)).toFixed(1)}  fails@x ${st.fails.slice(0, 6).join(',')}`);
      });
      const sum = (f: (s: LevelStat) => number) => stats.reduce((a, s) => a + f(s), 0);
      const tries = sum((s) => s.tries), clears = sum((s) => s.clears);
      const tpar = sum((s) => s.time.reduce((a, b) => a + b, 0)) / Math.max(1, stats.reduce((a, s, i) => a + s.time.length * LEVELS[i].par, 0));
      console.log(`  SUMMARY ${mode}/${name}: campaigns ${finished}/${campaigns}, level clears ${clears}/${tries} (${Math.round(clears / Math.max(1, tries) * 100)}%), deaths/attempt ${(sum((s) => s.deaths) / Math.max(1, tries)).toFixed(2)}, hits/attempt ${(sum((s) => s.hits) / Math.max(1, tries)).toFixed(1)}, time/par ${tpar.toFixed(2)}`);
    }
  }
}
