// Headless balance check: the autopilot plays whole campaigns on the pure simulation (map walking,
// encounters, camps, dungeons, bosses, the village), with the time a player spends on the map and
// in the screens counted in.
// Run: npx tsx games/hex-realm/balance.ts [runs] [class]
//   reports, per difficulty and skill: the minute each boss falls, the hero's level then, deaths,
//   battles fought, and the minute of the final victory (or how far it got in the time limit).
import { Campaign, type Fight } from './campaign';
import { Battle } from './battle';
import { BattleBot, MapBot, SKILL, type Skill } from './bot';
import { DT, CLASS_IDS, type Mode, type ClassId, type FoeKind } from './defs';
import { START } from './hexmap';

/** Seconds a player spends outside the fights (looking at loot, shopping, the transitions). */
const SCREEN = { casual: { loot: 7, village: 25, room: 2.5, intro: 2 }, good: { loot: 3, village: 10, room: 2, intro: 1.5 } };

export interface CampaignResult {
  bosses: Partial<Record<FoeKind, { min: number; level: number }>>;
  victory: number | null;
  deaths: number;
  battles: number;
  level: number;
  minutes: number;
  renown: number;
}

export function runBattle(c: Campaign, f: Fight, sk: Skill, seed: number): { b: Battle; secs: number } {
  const b = new Battle({ mode: c.mode, seed, stats: c.stats(), hp: c.s.hp, potions: c.s.potions, rooms: f.rooms, level: f.level });
  const bot = new BattleBot(b, sk, seed);
  let t = 0;
  while (!b.over && t < 600) { b.step(DT, bot.input(DT)); b.events.length = 0; t += DT; }
  if (!b.over) b.over = 'lost';
  return { b, secs: t };
}

export function playCampaign(mode: Mode, skillName: 'casual' | 'good', cls: ClassId, seed: number, limit = 75 * 60): CampaignResult {
  const sk = SKILL[skillName], scr = SCREEN[skillName];
  const c = new Campaign(mode, null);
  c.reset(cls);
  c.s.tutorial = true;
  c.s.chosen = true;
  const mb = new MapBot(c, sk);
  let time = 0, n = seed * 1000;
  const out: CampaignResult = { bosses: {}, victory: null, deaths: 0, battles: 0, level: 1, minutes: 0, renown: 0 };
  const fight = (f: Fight) => {
    const { b, secs } = runBattle(c, f, sk, n++);
    time += secs + scr.loot + scr.intro + (f.rooms.length - 1) * scr.room;
    const sp = c.settle(f, b);
    out.battles++;
    if (!sp.won) { out.deaths++; time += scr.village; mb.village(); }
    if (sp.boss) out.bosses[sp.boss] = { min: time / 60, level: c.s.level };
    if (sp.levels) mb.talents();
    return sp;
  };
  let guard = 0;
  while (time < limit && !c.s.victory && guard++ < 5000) {
    const [gc, gr] = mb.goal();
    const [pc, pr] = c.s.pos;
    if (gc === pc && gr === pr) {
      const h = c.map.at(pc, pr);
      if (h.place === 'village' || (gc === START[0] && gr === START[1])) { mb.village(); time += scr.village; c.s.pos = [START[0], START[1]]; if (mb.goal()[0] === pc && mb.goal()[1] === pr) { c.s.hp = c.maxHp; } }
      if (h.place && h.place !== 'village') {
        const acc = c.access(h.place);
        if (acc === 'ok') fight(c.dungeon(h.place));
        else if (acc === 'rift') fight(c.riftFloor());
      }
      // nothing to do here: wander one step
      const nb = c.map.hexes.find((x) => c.canPass(x) && Math.abs(x.c - pc) + Math.abs(x.r - pr) === 1);
      if (nb && !(h.place && h.place !== 'village')) { const f = c.stepTo(nb.c, nb.r); time += c.map.stepCost(nb); if (f) fight(f); }
      continue;
    }
    const path = c.pathTo(gc, gr);
    if (!path) { c.s.pos = [START[0], START[1]]; continue; }
    for (const [hc, hr] of path) {
      const h = c.map.at(hc, hr);
      time += c.map.stepCost(h);
      const f = c.stepTo(hc, hr);
      if (f) { fight(f); break; }
    }
  }
  out.victory = c.s.victory ? time / 60 : null;
  out.level = c.s.level;
  out.minutes = time / 60;
  out.renown = c.s.renown;
  return out;
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance.ts')) {
  const runs = Number(proc.argv[2] ?? 6);
  const only = proc.argv[3] as ClassId | undefined;
  const classes = only ? [only] : [...CLASS_IDS];
  for (const mode of ['easy', 'normal'] as Mode[]) {
    for (const sk of ['casual', 'good'] as const) {
      const res: CampaignResult[] = [];
      for (const cls of classes) for (let i = 0; i < runs; i++) res.push(playCampaign(mode, sk, cls, 100 + i));
      const boss = (k: FoeKind) => {
        const r = res.filter((x) => x.bosses[k]);
        return r.length ? `${avg(r.map((x) => x.bosses[k]!.min)).toFixed(1)}m L${avg(r.map((x) => x.bosses[k]!.level)).toFixed(1)} (${r.length}/${res.length})` : '—';
      };
      const won = res.filter((r) => r.victory !== null);
      console.log(`${mode.padEnd(6)} ${sk.padEnd(6)} troll ${boss('troll')}  mage ${boss('mage')}  lord ${boss('lord')}  victory ${won.length}/${res.length} ${won.length ? avg(won.map((r) => r.victory!)).toFixed(1) + 'm' : ''}  deaths ${avg(res.map((r) => r.deaths)).toFixed(1)}  battles ${avg(res.map((r) => r.battles)).toFixed(0)}  level ${avg(res.map((r) => r.level)).toFixed(1)}  renown ${Math.round(avg(res.map((r) => r.renown)))}`);
      if (only) for (const r of res) console.log('   ', JSON.stringify(r));
    }
  }
}
