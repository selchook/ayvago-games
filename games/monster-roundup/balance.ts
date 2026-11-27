// Monster Roundup: the headless check that every level can be finished. The autopilot (bot.ts) plays
// each of the twenty levels on Normal and Easy with the starting mech, no upgrades and no god mode,
// and reports whether it cleared the level, its time against par, the hull lost, the captures, the
// evolutions, the stars and the credits.
// Run: npx tsx games/monster-roundup/balance.ts [levels…] [--god] [--v]
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DT, noRanks } from './defs';

export interface LevelRun { n: number; easy: boolean; out: boolean; time: number; par: number; lost: number; hull: number; caps: string; evolved: number; stars: string; credits: number; why: string; tries: number }

/**
 * The autopilot is a plainer player than a person (it plans no ambush, it reads a telegraph only
 * when it is already near), and a run is chaotic: one monster's first turn changes everything after.
 * So a level counts as finishable when one of a few runs, each with its own random seed for the
 * monsters and the autopilot, clears it; the table says which run it was.
 */
const TRIES = 4;

export function playLevel(n: number, easy: boolean, god = false, verbose = false): LevelRun {
  let r = playOnce(n, easy, god, verbose, 0);
  for (let i = 1; i < TRIES && !r.out; i++) r = playOnce(n, easy, god, verbose, i);
  return r;
}

function playOnce(n: number, easy: boolean, god: boolean, verbose: boolean, attempt: number): LevelRun {
  const s = new Sim(buildLevel(n), noRanks(), easy, 'mike', 1 + attempt);
  s.god = god;
  const bot = new Bot(s, 1 + attempt);
  let steps = 0;
  const counts: Record<string, number> = {};
  while (steps < 60 * 400 && s.mech.state === 'play') {
    s.step(DT, bot.input());
    for (const e of s.events) {
      counts[e.e] = (counts[e.e] ?? 0) + 1;
      if (verbose && ['hurt', 'capture', 'evolve', 'clear', 'die', 'bossPhase', 'bossDizzy', 'unlock', 'exitOpen'].includes(e.e)) console.log(`  ${s.clock.toFixed(1)}s ${JSON.stringify(e)}`);
    }
    s.events.length = 0;
    steps++;
  }
  const v = s.mech;
  const loose = s.mons.filter((m) => s.loose(m) && !m.minion).map((m) => `${m.kind ?? m.boss}@(${(m.x / 4).toFixed(1)},${(m.z / 4).toFixed(1)}) ${m.state}`);
  const why = v.state === 'clear' ? '' : v.state === 'dead' ? 'dead' : `timeout at (${(v.x / 4).toFixed(1)}, ${(v.z / 4).toFixed(1)}) towing ${v.towing.length}; loose: ${loose.join(', ')}`;
  if (verbose) console.log('  events', JSON.stringify(counts));
  const st = s.stars();
  return {
    n, easy, out: v.state === 'clear', time: s.stats.time, par: s.c.par, lost: v.max - v.hp, hull: v.max, caps: `${s.captured}/${s.c.total} (quota ${s.c.quota})`,
    evolved: s.stats.evolved, stars: st.map((b) => (b ? '★' : '·')).join(''), credits: s.stats.credits, why, tries: attempt + 1,
  };
}

export function report(levels: number[], god = false, verbose = false, modes = [false, true]): { text: string; failed: number } {
  const out: string[] = [];
  let failed = 0;
  for (const easy of modes) for (const n of levels) {
    const r = playLevel(n, easy, god, verbose);
    if (!r.out) failed++;
    const line = `${easy ? 'easy  ' : 'normal'} ${String(n).padStart(2)} ${r.out ? 'CLEAR' : 'FAIL '} time ${r.time.toFixed(1)}/${r.par}  hull lost ${r.lost}/${r.hull}  captured ${r.caps}  evolved ${r.evolved}  stars ${r.stars}  credits ${r.credits}${r.tries > 1 ? `  (run ${r.tries})` : ''}${r.why ? '  ' + r.why : ''}`;
    out.push(line);
    if (verbose) console.log(line);
  }
  out.push(failed ? `${failed} run(s) did not finish` : 'every level finished');
  return { text: out.join('\n'), failed };
}

// run directly: print the table (exit code 1 when a level was not finished)
const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) {
  const args = proc.argv.slice(2);
  const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const modes = args.includes('--normal') ? [false] : args.includes('--easy') ? [true] : [false, true];
  const r = report(only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1), args.includes('--god'), args.includes('--v'), modes);
  console.log(r.text);
  proc.exit(r.failed ? 1 : 0);
}
