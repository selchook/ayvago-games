// Relic Ruins: the headless check that every level can be finished. The autopilot (bot.ts) plays
// each of the twenty levels on Normal and Easy without upgrades and without god mode, and reports
// whether it got out, its time against par, the hearts lost, the gems found, the lowest torch and
// the coins. Run: npx tsx games/relic-ruins/balance.ts [levels…] [--god]
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DT, noRanks } from './defs';

export interface LevelRun { n: number; easy: boolean; out: boolean; time: number; par: number; lost: number; hearts: number; gems: number; allGems: number; coins: number; minTorch: number }

export function playLevel(n: number, easy: boolean, god = false): LevelRun {
  const s = new Sim(buildLevel(n), noRanks(), easy);
  s.god = god;
  const bot = new Bot(s);
  let steps = 0, minTorch = 1;
  while (steps < 60 * 400 && s.hero.state !== 'clear' && s.hero.state !== 'dead') {
    s.step(DT, bot.input());
    s.events.length = 0;
    minTorch = Math.min(minTorch, s.hero.torch / s.hero.tmax);
    steps++;
  }
  const h = s.hero;
  return { n, easy, out: h.state === 'clear', time: s.stats.time, par: s.c.par, lost: (h.max - h.hp) / 2, hearts: h.max / 2, gems: s.stats.gems, allGems: s.c.gems, coins: s.stats.coins, minTorch };
}

export function report(levels: number[], god = false): { text: string; failed: number } {
  const out: string[] = [];
  let failed = 0;
  for (const easy of [false, true]) for (const n of levels) {
    const r = playLevel(n, easy, god);
    if (!r.out) failed++;
    out.push(`${easy ? 'easy  ' : 'normal'} ${String(n).padStart(2)} ${r.out ? 'OUT ' : 'FAIL'} time ${r.time.toFixed(1)}/${r.par}  hearts lost ${r.lost}/${r.hearts}  gems ${r.gems}/${r.allGems}  coins ${r.coins}  lowest torch ${(r.minTorch * 100).toFixed(0)}%`);
  }
  out.push(failed ? `${failed} run(s) did not get out` : 'every level finished');
  return { text: out.join('\n'), failed };
}

// run directly: print the table (exit code 1 when a level was not finished)
const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) {
  const args = proc.argv.slice(2);
  const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const r = report(only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1), args.includes('--god'));
  console.log(r.text);
  proc.exit(r.failed ? 1 : 0);
}
