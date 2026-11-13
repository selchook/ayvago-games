// Headless balance check: the autopilot plays the pure simulation (no rendering).
// Run: npx tsx games/delivery-dash/balance.ts [runs] [shift ids, comma separated]
//   Shifts: stars, earnings and crashes per shift for the good and the casual bot on Easy and
//   Normal (the default van, no upgrades). Endless Rush: earnings and run length.
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL, type Skill } from './bot';
import { SHIFTS, rushShift, type ShiftDef } from './shifts';
import { handling, vehicle, type Mode } from './defs';

const BASE = handling(vehicle('van'), { engine: 0, handling: 0, capacity: 0, padding: 0 });

export interface ShiftRun { stars: number; earnings: number; delivered: number; crashes: number; ruined: number; late: number; expired: number }

export function playShift(def: ShiftDef, mode: Mode, skill: Skill, seed: number): ShiftRun {
  const sim = new Sim({ shift: def, rush: false, mode, seed, hand: BASE });
  const bot = new Bot(sim, skill, seed);
  const dt = 1 / 30;
  while (!sim.over) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
  }
  const s = sim.stats;
  return { stars: sim.stars(), earnings: sim.earnings, delivered: s.delivered, crashes: s.crashes, ruined: s.ruined, late: s.late, expired: s.expired };
}

export function playRush(mode: Mode, skill: Skill, seed: number): { earnings: number; seconds: number; delivered: number } {
  const sim = new Sim({ shift: rushShift(), rush: true, mode, seed, hand: BASE });
  const bot = new Bot(sim, skill, seed);
  const dt = 1 / 30;
  while (!sim.over && sim.time < 1200) {
    sim.step(dt, bot.input(dt));
    sim.events.length = 0;
  }
  return { earnings: sim.earnings, seconds: sim.time, delivered: sim.stats.delivered };
}

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc && /balance\.ts$/.test(proc.argv[1] ?? '')) {
  const runs = Number(proc.argv[2] ?? 4);
  const only = proc.argv[3] ? proc.argv[3].split(',').map(Number) : null;
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const f1 = (n: number) => n.toFixed(1);
  const suggest: string[] = [];
  for (const def of SHIFTS) {
    if (only && !only.includes(def.id)) continue;
    const parts: string[] = [];
    const means: number[] = [];
    for (const [mode, sk] of [['normal', 'casual'], ['normal', 'good'], ['easy', 'casual']] as const) {
      const rs = Array.from({ length: runs }, (_, i) => playShift(def, mode, SKILL[sk], 1000 + i * 17));
      means.push(avg(rs.map((r) => r.earnings)));
      parts.push(`${mode[0].toUpperCase()}/${sk}: ★${f1(avg(rs.map((r) => r.stars)))} $${Math.round(avg(rs.map((r) => r.earnings)))} (${rs.map((r) => r.earnings).join(' ')}) del ${f1(avg(rs.map((r) => r.delivered)))} crash ${f1(avg(rs.map((r) => r.crashes)))} ruin ${f1(avg(rs.map((r) => r.ruined)))} late ${f1(avg(rs.map((r) => r.late)))}`);
    }
    console.log(`shift ${def.id} (d${def.district}, targets ${def.targets.join('/')}):\n  ${parts.join('\n  ')}`);
    // suggested targets: casual (Normal) earns about two stars in Old Town, nearer one in Hilltop
    const [cas, good] = means;
    const k = [[0.55, 0.92, 0.85], [0.62, 1.0, 0.9], [0.8, 1.12, 0.95]][def.district];
    const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
    suggest.push(`${def.id}: [${r5(cas * k[0])}, ${r5(Math.min(cas * k[1], good * 0.8))}, ${r5(Math.max(good * k[2], cas * 1.3))}]`);
  }
  if (suggest.length) console.log('suggested targets\n  ' + suggest.join('\n  '));
  if (!only || only.includes(0)) {
    for (const [mode, sk] of [['normal', 'casual'], ['normal', 'good'], ['easy', 'casual']] as const) {
      const rs = Array.from({ length: runs }, (_, i) => playRush(mode, SKILL[sk], 500 + i * 13));
      console.log(`rush ${mode}/${sk}: ${f1(avg(rs.map((r) => r.seconds)))} s, $${Math.round(avg(rs.map((r) => r.earnings)))}, ${f1(avg(rs.map((r) => r.delivered)))} deliveries (${rs.map((r) => Math.round(r.seconds)).join(' ')} s)`);
    }
  }
  void NO_INPUT;
}
