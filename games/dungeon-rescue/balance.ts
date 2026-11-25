// Dungeon Rescue: the headless check that every level can be finished. The autopilot (bot.ts) plays
// each of the twenty levels on Normal and Easy without upgrades, crew bonuses or god mode, and reports
// whether it got out, its time against par, the hearts lost, the prisoners rescued, whether a guard
// ever spotted it, the coins and, on the Chief's levels, whether he was outwitted.
// Run: npx tsx games/dungeon-rescue/balance.ts [levels…] [--god] [--seeds n] (default up to 6 runs a level)
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DT, noRanks } from './defs';

export interface LevelRun { n: number; easy: boolean; out: boolean; time: number; par: number; lost: number; hearts: number; rescued: number; total: number; spotted: boolean; coins: number; outwit: boolean; boss: boolean; step: number }

export function playLevel(n: number, easy: boolean, god = false, seed = 1): LevelRun {
  // the sim's few random numbers (idle timers) from a fixed seed, so runs repeat
  let a = seed * 7919;
  const rand = Math.random;
  Math.random = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  try {
    const s = new Sim(buildLevel(n), noRanks(), easy);
    s.god = god;
    const bot = new Bot(s);
    let steps = 0;
    while (steps < 60 * 420 && s.hero.state !== 'clear' && s.hero.state !== 'dead') {
      s.step(DT, bot.input());
      for (const e of s.events) if (e.e === 'respawn') bot.reset();
      s.events.length = 0;
      steps++;
    }
    const h = s.hero;
    return { n, easy, out: h.state === 'clear', time: s.stats.time, par: s.c.par, lost: h.max - h.hp, hearts: h.max, rescued: s.stats.rescued, total: s.stats.total, spotted: s.stats.spotted, coins: s.stats.coins, outwit: s.stats.outwit, boss: !!s.c.boss, step: bot.i };
  } finally { Math.random = rand; }
}

/**
 * Every level on Normal and Easy, `seeds` runs each (the guards' head sweeps and idle timers start
 * differently): a level is completable when the autopilot gets out in at least one run; the share of
 * runs it got out of says how hard the level is for it.
 */
export function report(levels: number[], god = false, seeds = 6): { text: string; failed: number } {
  const out: string[] = [];
  let failed = 0;
  for (const easy of [false, true]) for (const n of levels) {
    const runs: LevelRun[] = [];
    for (let sd = 1; sd <= seeds; sd++) {
      const r = playLevel(n, easy, god, sd);
      runs.push(r);
      if (r.out && sd >= 2) break;
    }
    const ok = runs.filter((r) => r.out);
    if (!ok.length) failed++;
    const r = ok[0] ?? runs[runs.length - 1];
    out.push(`${easy ? 'easy  ' : 'normal'} ${String(n).padStart(2)} ${ok.length ? 'OUT ' : 'FAIL'} ${ok.length}/${runs.length} runs  time ${r.time.toFixed(1)}/${r.par}  hearts lost ${r.lost}/${r.hearts}  rescued ${r.rescued}/${r.total}  ${r.spotted ? 'spotted' : 'unseen '}  coins ${r.coins}${r.boss ? (r.outwit ? '  chief outwitted' : '  CHIEF NOT OUTWITTED') : ''}${r.out ? '' : `  (stuck at step ${r.step})`}`);
  }
  out.push(failed ? `${failed} level run(s) never got out` : 'every level finished on Normal and Easy');
  return { text: out.join('\n'), failed };
}

// run directly: print the table (exit code 1 when a level was not finished)
const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) {
  const args = proc.argv.slice(2);
  const only = args.filter((x) => /^\d+$/.test(x)).map(Number);
  const si = args.indexOf('--seeds');
  const r = report(only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1), args.includes('--god'), si >= 0 ? Number(args[si + 1]) : 6);
  console.log(r.text);
  proc.exit(r.failed ? 1 : 0);
}
