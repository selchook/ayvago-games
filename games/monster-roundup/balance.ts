// Monster Roundup: the headless check that every level can be finished with every mech, and that no
// mech is clearly stronger. The autopilot (bot.ts, its play adapted to each weapon) plays each of the
// twenty levels on Normal and Easy with each of the four mechs, no upgrades and no god mode, and
// reports whether it cleared the level, its time against par, the hull lost, the captures, the
// evolutions, the stars and the credits; then a table per mech: levels cleared, mean time and its
// share of the mean of all four (the mechs should stay within about ±15% of each other), and the
// levels a mech failed that another cleared.
// Run: npx tsx games/monster-roundup/balance.ts [levels…] [--mech mike|leela|stan|george] [--normal|--easy] [--god] [--v] [--quiet]
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DT, noRanks, MECH_IDS, type MechId } from './defs';

export interface LevelRun { n: number; easy: boolean; mech: MechId; out: boolean; time: number; par: number; lost: number; hull: number; caps: string; evolved: number; stars: string; credits: number; why: string; tries: number }

/**
 * The autopilot is a plainer player than a person (it plans no ambush, it reads a telegraph only
 * when it is already near), and a run is chaotic: one monster's first turn changes everything after.
 * So a level counts as finishable when one of a few runs, each with its own random seed for the
 * monsters and the autopilot, clears it; the table says which run it was. The time compared between
 * mechs is the mean of the runs that cleared (the first TIMED seeds, all played).
 */
const TRIES = 4;
const TIMED = 2;
/** A level's par from the autopilot's median time: a person's margin. */
const PAR_K = 3;
const PAR_ADD = 30;

export function playLevel(n: number, easy: boolean, mech: MechId = 'mike', god = false, verbose = false): LevelRun & { mean: number } {
  const runs: LevelRun[] = [];
  for (let i = 0; i < TIMED; i++) runs.push(playOnce(n, easy, mech, god, verbose, i));
  let r = runs.find((x) => x.out) ?? runs[0];
  for (let i = TIMED; i < TRIES && !r.out; i++) { r = playOnce(n, easy, mech, god, verbose, i); runs.push(r); }
  const ok = runs.filter((x) => x.out);
  return { ...r, mean: ok.length ? ok.reduce((a, x) => a + x.time, 0) / ok.length : NaN };
}

function playOnce(n: number, easy: boolean, mech: MechId, god: boolean, verbose: boolean, attempt: number): LevelRun {
  const s = new Sim(buildLevel(n), noRanks(), easy, mech, 1 + attempt);
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
    n, easy, mech, out: v.state === 'clear', time: s.stats.time, par: s.c.par, lost: v.max - v.hp, hull: v.max, caps: `${s.captured}/${s.c.total} (quota ${s.c.quota})`,
    evolved: s.stats.evolved, stars: st.map((b) => (b ? '★' : '·')).join(''), credits: s.stats.credits, why, tries: attempt + 1,
  };
}

export function report(levels: number[], o: { god?: boolean; verbose?: boolean; quiet?: boolean; modes?: boolean[]; mechs?: readonly MechId[] } = {}): { text: string; failed: number; spread: number } {
  const modes = o.modes ?? [false, true], mechs = o.mechs ?? MECH_IDS;
  const out: string[] = [];
  let failed = 0;
  const res = new Map<string, LevelRun & { mean: number }>();
  for (const easy of modes) for (const mech of mechs) for (const n of levels) {
    const r = playLevel(n, easy, mech, o.god, o.verbose);
    res.set(`${easy}|${mech}|${n}`, r);
    if (!r.out) failed++;
    const line = `${easy ? 'easy  ' : 'normal'} ${mech.padEnd(6)} ${String(n).padStart(2)} ${r.out ? 'CLEAR' : 'FAIL '} time ${r.time.toFixed(1)}/${r.par} (mean ${isNaN(r.mean) ? '-' : r.mean.toFixed(1)})  hull lost ${r.lost}/${r.hull}  captured ${r.caps}  evolved ${r.evolved}  stars ${r.stars}  credits ${r.credits}${r.tries > 1 ? `  (run ${r.tries})` : ''}${r.why ? '  ' + r.why : ''}`;
    if (!o.quiet) out.push(line);
    if (o.verbose) console.log(line);
  }
  // per mech: clears, mean time over the levels every mech cleared, its share of the all-mech mean
  let spread = 0;
  for (const easy of modes) {
    const common = levels.filter((n) => mechs.every((m) => res.get(`${easy}|${m}|${n}`)!.out));
    const mean = (m: MechId) => common.reduce((a, n) => a + res.get(`${easy}|${m}|${n}`)!.mean, 0) / Math.max(1, common.length);
    const all = mechs.reduce((a, m) => a + mean(m), 0) / mechs.length;
    out.push(`-- ${easy ? 'Easy' : 'Normal'}: per mech (mean time over the ${common.length} levels every mech cleared; all-mech mean ${all.toFixed(1)} s)`);
    for (const m of mechs) {
      const cleared = levels.filter((n) => res.get(`${easy}|${m}|${n}`)!.out).length;
      const k = mean(m) / all;
      spread = Math.max(spread, Math.abs(k - 1));
      const only = levels.filter((n) => !res.get(`${easy}|${m}|${n}`)!.out && mechs.some((q) => res.get(`${easy}|${q}|${n}`)!.out));
      const hurt = levels.reduce((a, n) => a + res.get(`${easy}|${m}|${n}`)!.lost, 0);
      out.push(`   ${m.padEnd(6)} cleared ${cleared}/${levels.length}  mean ${mean(m).toFixed(1)} s  (${k >= 1 ? '+' : ''}${((k - 1) * 100).toFixed(1)}%)  hearts lost ${hurt}${only.length ? '  FAILED where others cleared: ' + only.join(', ') : ''}`);
    }
    out.push(`   per level (mean s): ` + levels.map((n) => `${n}:` + mechs.map((m) => { const r = res.get(`${easy}|${m}|${n}`)!; return isNaN(r.mean) ? '-' : r.mean.toFixed(0); }).join('/')).join('  '));
  }
  // the pars: the autopilot plays far better than a person, so a level's par is the median of the four
  // mechs' Normal times with a human margin (×PAR_K + PAR_ADD s), rounded up to 5 s
  if (modes.includes(false) && mechs.length > 1) {
    const pars = levels.map((n) => {
      const ts = mechs.map((m) => res.get(`false|${m}|${n}`)!.mean).filter((x) => !isNaN(x)).sort((a, b) => a - b);
      const med = ts.length ? (ts[(ts.length - 1) >> 1] + ts[ts.length >> 1]) / 2 : NaN;
      return `${n}:${isNaN(med) ? '-' : Math.ceil((med * PAR_K + PAR_ADD) / 5) * 5}`;
    });
    out.push(`suggested pars (median × ${PAR_K} + ${PAR_ADD} s): ${pars.join(' ')}`);
    out.push(`current pars: ${levels.map((n) => `${n}:${buildLevel(n).par}`).join(' ')}`);
  }
  out.push(failed ? `${failed} run(s) did not finish` : 'every level finished with every mech');
  out.push(`largest gap from the all-mech mean: ${(spread * 100).toFixed(1)}%`);
  return { text: out.join('\n'), failed, spread };
}

// run directly: print the table (exit code 1 when a level was not finished)
const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) {
  const args = proc.argv.slice(2);
  const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const modes = args.includes('--normal') ? [false] : args.includes('--easy') ? [true] : [false, true];
  const mi = args.indexOf('--mech');
  const mechs = mi >= 0 ? [args[mi + 1] as MechId] : MECH_IDS;
  const r = report(only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1), { god: args.includes('--god'), verbose: args.includes('--v'), quiet: args.includes('--quiet'), modes, mechs });
  console.log(r.text);
  proc.exit(r.failed ? 1 : 0);
}
