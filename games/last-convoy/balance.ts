// Last Convoy: the headless balance check. The autopilot (bot.ts) plays whole campaigns on the pure
// simulations (sim.ts on foot, drive.ts for the escape), from a fresh save, on Easy and Normal, as a
// casual and as a good player. Between missions it buys garage ranks and picks power cards like a
// player would. A lost mission ends the run (as in the game); the next run starts at the furthest
// mission unlocked. Reported per mission: clears / attempts, the average time on foot, the health
// left, the drive's armour left and stars; per campaign: the runs it took; plus Last Stand's waves.
// Run: npx tsx games/last-convoy/balance.ts [campaigns] [hero]
import { Mission, newRun, NO_INPUT, mulberry, type RunState } from './sim';
import { Drive } from './drive';
import { Bot, SKILL, driveBot, botPick, botShop, type Skill } from './bot';
import { DT, MISSIONS, HERO_IDS, scrapFor, suppliesFor, type HeroId, type Mode } from './defs';
import { noRanks, rollCards } from './powers';

interface Log { tries: number; foot: number; clears: number; time: number; hp: number; armor: number; stars: number; why: Record<string, number> }

export function playMission(run: RunState, n: number, skill: Skill, seed: number, rnd: () => number, unlocked: HeroId[]): { won: boolean; time: number; hp: number; armor: number; stars: number; scrap: number; supplies: number; why: string; foot: boolean } {
  const def = MISSIONS[n - 1];
  const sim = new Mission(def, run, seed);
  sim.unlocked = unlocked;
  const bot = new Bot(sim, skill, rnd);
  let steps = 0;
  let why = 'timeout';
  while (sim.phase === 'play' && steps < 60 * 600) {
    sim.step(DT, bot.input(DT));
    for (const e of sim.events) if (e.type === 'lose') why = e.why;
    sim.events.length = 0;
    steps++;
  }
  const time = sim.time, hp = sim.hero.hp / sim.hero.max;
  if (sim.phase !== 'won') return { won: false, time, hp, armor: 0, stars: 0, scrap: sim.stats.scrap, supplies: 0, why, foot: false };
  // the drive
  const vehicle = run.ranks.convoy >= 2 ? def.vehicle : def.vehicle;
  const d = new Drive(def, run.mode, vehicle, sim.m, seed + 1);
  let k = 0;
  while ((d.phase === 'count' || d.phase === 'play') && k < 60 * 240) { d.step(DT, driveBot(d, skill, rnd)); d.events.length = 0; k++; }
  const armor = d.armor / d.maxArmor;
  if (d.phase !== 'won') return { won: false, time, hp, armor: 0, stars: 0, scrap: sim.stats.scrap, supplies: 0, why: 'drive', foot: true };
  const stars = 1 + (sim.sideGoal() ? 1 : 0) + (armor >= 0.6 ? 1 : 0);
  run.score += d.stats.pts + d.bonus();
  return { won: true, time, hp, armor, stars, scrap: sim.stats.scrap + d.stats.scrap + scrapFor(n, stars), supplies: sim.stats.supplies + suppliesFor(n, def.stages.some((s) => s.kind === 'boss')), why: '', foot: true };
}

function campaign(mode: Mode, hero: HeroId, skill: Skill, seed: number, logs: Log[]): { runs: number; beaten: boolean } {
  const rnd = mulberry(seed);
  const ranks = noRanks();
  const purse = { scrap: 0, supplies: 0 };
  let unlocked = 1, runs = 0;
  const squad: HeroId[] = [hero];
  while (unlocked <= MISSIONS.length && runs < 16) {
    runs++;
    const run = newRun(mode, 'campaign', hero, squad.find((h) => h !== hero) ?? null, 'shepherd', ranks);
    for (let n = unlocked; n <= MISSIONS.length; n++) {
      const r = playMission(run, n, skill, (seed * 977 + n * 31 + runs * 7) | 0, rnd, squad);
      const L = logs[n - 1];
      L.tries++;
      if (r.foot) L.foot++;
      purse.scrap += r.scrap; purse.supplies += r.supplies;
      if (!r.won) { L.why[r.why] = (L.why[r.why] ?? 0) + 1; break; }
      L.clears++; L.time += r.time; L.hp += r.hp; L.armor += r.armor; L.stars += r.stars;
      if ([2, 8, 11].includes(n)) { const nx = (['matt', 'sam', 'shaun', 'lis'] as HeroId[]).find((h) => !squad.includes(h)); if (nx) squad.push(nx); }
      if (n >= unlocked) unlocked = n + 1;
      run.depth++;
      const offer = rollCards(run.cards, hero, rnd);
      if (offer.length) run.cards.push(offer[botPick(offer, hero)]);
      botShop(ranks, purse, hero);
    }
  }
  return { runs, beaten: unlocked > MISSIONS.length };
}

function stand(mode: Mode, hero: HeroId, skill: Skill, seed: number): number {
  const rnd = mulberry(seed);
  const run = newRun(mode, 'stand', hero, null, 'shepherd', noRanks());
  const sim = new Mission(null, run, seed);
  const bot = new Bot(sim, skill, rnd);
  let steps = 0;
  while (sim.phase === 'play' && steps < 60 * 900) {
    sim.step(DT, bot.input(DT));
    sim.events.length = 0;
    if (sim.wave.pendingDraft) { const offer = rollCards(run.cards, hero, rnd); if (offer.length) run.cards.push(offer[botPick(offer, hero)]); sim.refreshMods(); sim.wave.pendingDraft = false; }
    steps++;
  }
  for (let i = 0; i < 10; i++) { sim.step(DT, NO_INPUT); sim.events.length = 0; }
  return sim.wave.n;
}

const argv = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const N = Number(argv[2] ?? 3);
const heroArg = argv[3] as HeroId | undefined;
const heroes: HeroId[] = heroArg ? [heroArg] : [...HERO_IDS];
for (const mode of ['normal', 'easy'] as Mode[]) {
  for (const sk of ['casual', 'good'] as const) {
    const logs: Log[] = MISSIONS.map(() => ({ tries: 0, foot: 0, clears: 0, time: 0, hp: 0, armor: 0, stars: 0, why: {} }));
    const runs: number[] = [];
    let beaten = 0;
    for (let c = 0; c < N; c++) for (const h of heroes) { const r = campaign(mode, h, SKILL[sk], 1000 + c * 17 + h.length, logs); runs.push(r.runs); if (r.beaten) beaten++; }
    console.log(`\n== ${mode} / ${sk}: beaten ${beaten}/${runs.length}, runs ${runs.join(' ')}`);
    for (const [i, L] of logs.entries()) {
      if (!L.tries) continue;
      const c = L.clears || 1;
      console.log(`  M${String(i + 1).padStart(2)}  clear ${L.clears}/${L.tries} (${Math.round((100 * L.clears) / L.tries)}%)  foot ${L.foot}  time ${Math.round(L.time / c)}s  hp ${Math.round((100 * L.hp) / c)}%  armour ${Math.round((100 * L.armor) / c)}%  stars ${(L.stars / c).toFixed(1)}  lost: ${JSON.stringify(L.why)}`);
    }
    const waves = heroes.map((h, i) => stand(mode, h, SKILL[sk], 77 + i));
    console.log(`  Last Stand waves: ${waves.join(' ')}`);
  }
}
