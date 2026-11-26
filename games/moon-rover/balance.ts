// Moon Rover: the headless check that every mission can be finished. The autopilot (bot.ts) plays
// each of the twenty missions on Normal and Easy without upgrades and without god mode, and reports
// whether it got back (or to the rocket), its time against par, the hearts lost, the crystals and
// crew it brought, the lowest battery, the flips and the credits.
// Run: npx tsx games/moon-rover/balance.ts [levels…] [--god] [--v]
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DT, noRanks } from './defs';

export interface LevelRun { n: number; easy: boolean; out: boolean; time: number; par: number; lost: number; hearts: number; crystals: string; crew: string; minBattery: number; flips: number; credits: number; why: string; tries: number }

/**
 * The autopilot is a weaker driver than a player (it sees a meteor's warning ring late and makes
 * no plan around the storm), and a run is chaotic: a hundredth of a radian at the start changes
 * every later meteor hit. So a mission counts as finishable when one of a few runs, each starting
 * with the nose turned a little, gets out; the table says which run it was.
 */
const TRIES = [0, 0.02, -0.02, 0.04, -0.04];

export function playLevel(n: number, easy: boolean, god = false, verbose = false): LevelRun {
  let r = playOnce(n, easy, god, verbose, 0);
  for (let i = 1; i < TRIES.length && !r.out; i++) r = playOnce(n, easy, god, verbose, i);
  return r;
}

function playOnce(n: number, easy: boolean, god: boolean, verbose: boolean, attempt: number): LevelRun {
  const s = new Sim(buildLevel(n), noRanks(), easy);
  s.god = god;
  s.rover.yaw += TRIES[attempt];
  const bot = new Bot(s);
  let steps = 0, minB = 1;
  const counts: Record<string, number> = {};
  while (steps < 60 * 420 && s.rover.state !== 'clear' && s.rover.state !== 'dead') {
    s.step(DT, bot.input());
    for (const e of s.events) { counts[e.e] = (counts[e.e] ?? 0) + 1; if (verbose && (e.e === 'hurt' || e.e === 'flip' || e.e === 'fall' || e.e === 'empty' || e.e === 'deliver' || e.e === 'clear' || e.e === 'generator')) console.log(`  ${(s.clock).toFixed(1)}s ${JSON.stringify(e)}`); }
    s.events.length = 0;
    minB = Math.min(minB, s.rover.battery / s.rover.bmax);
    steps++;
  }
  const v = s.rover;
  const why = v.state === 'clear' ? '' : v.state === 'dead' ? 'dead' : `timeout at (${(v.x / 4).toFixed(1)}, ${(v.z / 4).toFixed(1)}) cargo ${v.cargo} gens ${s.generators.filter((g) => !g.off).length}`;
  if (verbose) console.log('  events', JSON.stringify(counts));
  return { n, easy, out: v.state === 'clear', time: s.stats.time, par: s.c.par, lost: (v.max - v.hp) / 2, hearts: v.max / 2, crystals: `${s.stats.crystals}/${s.c.crystals.length}`, crew: `${s.stats.rescued}/${s.c.astronauts.length}`, minBattery: minB, flips: s.stats.flips, credits: s.stats.credits, why, tries: attempt + 1 };
}

export function report(levels: number[], god = false, verbose = false): { text: string; failed: number } {
  const out: string[] = [];
  let failed = 0;
  for (const easy of [false, true]) for (const n of levels) {
    const r = playLevel(n, easy, god, verbose);
    if (!r.out) failed++;
    const line = `${easy ? 'easy  ' : 'normal'} ${String(n).padStart(2)} ${r.out ? 'OUT ' : 'FAIL'} time ${r.time.toFixed(1)}/${r.par}  hearts lost ${r.lost}/${r.hearts}  crystals ${r.crystals}  crew ${r.crew}  flips ${r.flips}  lowest battery ${(r.minBattery * 100).toFixed(0)}%  credits ${r.credits}${r.tries > 1 ? `  (run ${r.tries})` : ''}${r.why ? '  ' + r.why : ''}`;
    out.push(line);
    if (verbose) console.log(line);
  }
  out.push(failed ? `${failed} run(s) did not finish` : 'every mission finished');
  return { text: out.join('\n'), failed };
}

// run directly: print the table (exit code 1 when a mission was not finished)
const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) {
  const args = proc.argv.slice(2);
  const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const r = report(only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1), args.includes('--god'), args.includes('--v'));
  console.log(r.text);
  proc.exit(r.failed ? 1 : 0);
}
