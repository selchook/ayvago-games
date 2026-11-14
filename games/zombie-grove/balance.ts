// Headless balance check: the autopilot plays whole nights on the pure simulation.
// Run: npx tsx games/zombie-grove/balance.ts [runs] [--skill=good|casual] [--mode=easy|normal] [--meta=none|full]
//   reports, per difficulty, skill and camp: survival time, win rate, level reached, kills, coins,
//   what killed the survivor most often and which weapons did the damage.
import { Sim, seeded } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { NO_META, fullMeta, runBonus, type MetaFx } from './meta';
import type { Mode, WeaponId } from './defs';

export interface RunResult { seconds: number; won: boolean; level: number; kills: number; coins: number; killer: string; score: number; weapons: string; dmg: Partial<Record<WeaponId, number>>; maxZ: number }

export function playRun(mode: Mode, skill: Skill, meta: MetaFx, seed: number): RunResult {
  const sim = new Sim(mode, seed, meta);
  const bot = new Bot(sim, skill, seeded(seed * 7 + 3));
  const dt = 1 / 60;
  let maxZ = 0;
  while (!sim.over && sim.time < 1200) {
    sim.takeAll((cards) => bot.choose(cards));
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
    maxZ = Math.max(maxZ, sim.zombies.length);
  }
  return {
    seconds: sim.run.time, won: sim.won, level: sim.level, kills: sim.run.kills, score: sim.score,
    coins: sim.run.coins + runBonus(sim.run.kills, sim.run.time, sim.won, sim.run.minis + sim.run.bosses),
    killer: sim.run.killer ?? '-', weapons: sim.weapons.map((w) => w.id + w.lv + (w.evo ? '*' : '')).join(' '), dmg: sim.run.byWeapon, maxZ,
  };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const argv = proc.argv;
  const runs = Number(argv[2] && !argv[2].startsWith('--') ? argv[2] : 10);
  const opt = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const modes = (opt('mode') ? [opt('mode')] : ['easy', 'normal']) as Mode[];
  const skills = opt('skill') ? [opt('skill')!] : ['casual', 'good'];
  const metas: [string, MetaFx][] = opt('meta') === 'full' ? [['full camp', fullMeta()]] : opt('meta') === 'none' ? [['no camp', NO_META]] : [['no camp', NO_META], ['full camp', fullMeta()]];
  const verbose = argv.includes('-v');
  for (const mode of modes) {
    for (const sk of skills) {
      for (const [mName, mfx] of metas) {
        const res: RunResult[] = [];
        for (let i = 0; i < runs; i++) {
          const r = playRun(mode, SKILL[sk as 'good' | 'casual'], mfx, 1000 + i);
          res.push(r);
          if (verbose) console.log(`   ${mmss(r.seconds)} ${r.won ? 'WIN ' : 'dead'} L${r.level} k${r.kills} ${r.killer} peak ${r.maxZ} | ${r.weapons}`);
        }
        const killers: Record<string, number> = {};
        for (const r of res) if (!r.won) killers[r.killer] = (killers[r.killer] ?? 0) + 1;
        const main = Object.entries(killers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' ') || '-';
        const dmg: Record<string, number> = {};
        for (const r of res) for (const [k, v] of Object.entries(r.dmg)) dmg[k] = (dmg[k] ?? 0) + (v ?? 0);
        const tot = Object.values(dmg).reduce((s, v) => s + v, 0) || 1;
        const share = Object.entries(dmg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / tot) * 100)}%`).join(', ');
        console.log(`${mode.padEnd(6)} ${sk.padEnd(6)} ${mName.padEnd(9)} survive ${mmss(avg(res.map((r) => r.seconds)))} (min ${mmss(Math.min(...res.map((r) => r.seconds)))})  win ${Math.round((res.filter((r) => r.won).length / res.length) * 100)}%  level ${avg(res.map((r) => r.level)).toFixed(1)}  kills ${Math.round(avg(res.map((r) => r.kills)))}  peak ${Math.round(avg(res.map((r) => r.maxZ)))}  coins ${Math.round(avg(res.map((r) => r.coins)))}  killed by ${main}\n         damage: ${share}`);
      }
    }
  }
}
