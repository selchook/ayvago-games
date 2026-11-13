// Headless balance check: a bot plays whole games against the rival crews on the pure simulation.
// Run: npx tsx games/blacktop-kings/balance.ts [games]
import { Game, type TeamStats } from './sim';
import { MATES } from './ai';
import { Bot, SKILL, type Skill } from './bot';
import { rivalLevel, TUNING, type Tuning } from './tuning';

export interface GameResult { win: boolean; me: number; them: number; seconds: number; me_: TeamStats; ai: TeamStats; ot: boolean }

export function playGame(tune: Tuning, rival: number, seed: number, skill: Skill): GameResult {
  const g = new Game({ seed, ai: [null, rivalLevel(tune, rival)], mates: MATES });
  const bot = new Bot(g, 0, skill, mulberrySeed(seed * 31 + 7));
  const dt = 1 / 60;
  let t = 0;
  while (g.phase !== 'final' && t < 600) {
    g.step(dt, [bot.input(dt), null]);
    t += dt;
  }
  return { win: g.winner === 0, me: g.score[0], them: g.score[1], seconds: t, me_: g.stats[0], ai: g.stats[1], ot: g.overtime };
}

function mulberrySeed(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

export function report(n = 30): string {
  const out: string[] = [];
  for (const skillName of ['good', 'casual'] as const) for (const mode of ['easy', 'normal'] as const) {
    const tune = TUNING[mode];
    for (const rival of [0, 2, 5]) {
      const rs = Array.from({ length: n }, (_, i) => playGame(tune, rival, 500 + i * 13 + rival, SKILL[skillName]));
      const wins = rs.filter((r) => r.win).length / n;
      const sum = (f: (r: GameResult) => number) => avg(rs.map(f)).toFixed(1);
      out.push(`${skillName.padEnd(6)} ${mode.padEnd(6)} crew ${rival + 1}: win ${(wins * 100).toFixed(0)}%  score ${sum((r) => r.me)}-${sum((r) => r.them)}  ` +
        `min ${(avg(rs.map((r) => r.seconds)) / 60).toFixed(1)}  OT ${rs.filter((r) => r.ot).length}  | AI/game: passes ${sum((r) => r.ai.passes)} takebacks ${sum((r) => r.ai.takeBacks)} ` +
        `dunks ${sum((r) => r.ai.dunks)}/${sum((r) => r.ai.dunkTries)} 3PA ${sum((r) => r.ai.threes)} FG ${sum((r) => r.ai.fgm)}/${sum((r) => r.ai.fga)} steals ${sum((r) => r.ai.steals)} blocks ${sum((r) => r.ai.blocks)} TO ${sum((r) => r.ai.turnovers)}` +
        ` | bot: FG ${sum((r) => r.me_.fgm)}/${sum((r) => r.me_.fga)} perfect ${sum((r) => r.me_.perfect)} dunks ${sum((r) => r.me_.dunks)} steals ${sum((r) => r.me_.steals)} TO ${sum((r) => r.me_.turnovers)}`);
    }
  }
  return out.join('\n');
}

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc && proc.argv[1]?.endsWith('balance.ts')) console.log(report(Number(proc.argv[2] ?? 30)));
