// Headless balance check: the autopilot plays whole runs on the pure simulation.
// Run: npx tsx games/star-squadron/balance.ts [runs] [--cards]
//   reports, per difficulty, skill and talent set: sector reached, score, run length, and with
//   --cards how much each card is worth (average sector reached by runs that took it vs not).
import { Sim, seeded } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { talentFx, ALL_TALENTS, stardustFor, type TalentId } from './talents';
import { CARDS, type CardId } from './cards';
import type { Mode } from './defs';

export interface RunResult { sector: number; waves: number; score: number; seconds: number; stardust: number; cards: CardId[]; bosses: number }

export function playRun(mode: Mode, skill: Skill, talents: TalentId[], seed: number, limit = 1800, force?: CardId): RunResult {
  const sim = new Sim(mode, seed, talentFx(talents));
  const bot = new Bot(sim, skill, seeded(seed * 7 + 3));
  const dt = 1 / 60;
  let t = 0;
  if (force) sim.apply(force);
  while (!sim.over && t < limit) {
    sim.takeAll((cards) => bot.choose(cards));
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
    t += dt;
  }
  return {
    sector: sim.sector + (sim.phase === 'warp' ? 1 : 0), waves: sim.run.wavesCleared, score: sim.score, seconds: sim.run.time,
    stardust: stardustFor(sim.run.wavesCleared, sim.run.bosses, sim.run.creditsEarned, mode === 'easy'), cards: sim.cardOrder, bosses: sim.run.bosses,
  };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const fmt = (v: number, d = 1) => v.toFixed(d);

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const runs = Number(proc.argv[2] ?? 12);
  const cards = proc.argv.includes('--cards');
  const sets: [string, TalentId[]][] = [['no talents', []], ['all talents', ALL_TALENTS]];
  for (const mode of ['easy', 'normal'] as Mode[]) {
    for (const [skName, sk] of Object.entries(SKILL)) {
      for (const [tName, tl] of sets) {
        const res: RunResult[] = [];
        for (let i = 0; i < runs; i++) res.push(playRun(mode, sk, tl, 1000 + i));
        const sectors = res.map((r) => r.sector + 1);
        console.log(`${mode.padEnd(6)} ${skName.padEnd(6)} ${tName.padEnd(11)} sector ${fmt(avg(sectors))} (min ${Math.min(...sectors)}, max ${Math.max(...sectors)})  waves ${fmt(avg(res.map((r) => r.waves)))}  bosses ${fmt(avg(res.map((r) => r.bosses)))}  score ${Math.round(avg(res.map((r) => r.score)))}  time ${fmt(avg(res.map((r) => r.seconds)) / 60)} min  stardust ${fmt(avg(res.map((r) => r.stardust)))}`);
      }
    }
  }
  if (cards) {
    // each card forced from the start of a Normal run vs no card: the casual pilot (short runs,
    // so one card shows) over 3× the runs, and the good pilot
    for (const [name, sk, n] of [['casual', SKILL.casual, runs * 3], ['good', SKILL.good, runs]] as [string, Skill, number][]) {
      const base = avg(Array.from({ length: n }, (_, i) => playRun('normal', sk, [], 2000 + i).waves));
      console.log(`\ncard value (Normal, ${name} pilot, ${n} runs, card given at the start): waves cleared, baseline ${fmt(base)}`);
      const rows: [string, number][] = [];
      for (const c of CARDS) {
        if (c.needs || c.id === 'repair') continue;
        rows.push([c.id, avg(Array.from({ length: n }, (_, i) => playRun('normal', sk, [], 2000 + i, 1800, c.id).waves))]);
      }
      rows.sort((a, b) => b[1] - a[1]);
      console.log(rows.map(([id, w]) => `  ${id.padEnd(14)} ${fmt(w)}  (${w >= base ? '+' : ''}${fmt(w - base)})`).join('\n'));
    }
  }
}
