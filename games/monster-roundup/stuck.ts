// Monster Roundup: the headless check that nothing gets stuck. In every level the mech is dropped at a
// few hundred spots (anywhere on the floor, also half inside a wall, a closed door, a crate stack, a
// pod, a terminal or furniture) and must then (1) be pushed out of whatever it overlaps, never
// ending with its centre in a wall, and (2) get at least a metre away walking in one of eight
// directions. Monsters are dropped the same way and must come out of walls too. A body that overlaps
// something must always be allowed to move out of it, and no spot may hold it (bug class 6).
// Run: npx tsx games/monster-roundup/stuck.ts [drops per level]
import { Sim, NO_INPUT, type Input } from './sim';
import { buildLevel, LEVEL_COUNT } from './levels';
import { DT, BLOCK, MECH, noRanks } from './defs';

export function stuckCheck(drops = 200): { drops: number; inside: string[]; stuck: string[] } {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let total = 0;
  const inside: string[] = [], stuck: string[] = [];
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const L = buildLevel(n);
    for (let k = 0; k < drops; k++) {
      const s = new Sim(L, noRanks(), false, 'mike', k + 1);
      s.god = true;
      // keep the monsters out of the way (they would push the mech about)
      for (const m of s.mons) m.state = 'gone';
      const v = s.mech;
      // a spot on the floor, or right at an edge of something
      const x = rnd() * L.cols * BLOCK, z = rnd() * L.rows * BLOCK;
      const c = Math.floor(x / BLOCK), r = Math.floor(z / BLOCK);
      if (L.map[r]?.[c] === undefined || L.map[r][c] === '#') {
        // a wall block next to floor: put the centre just inside it (half in the wall)
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => L.map[r + dr]?.[c + dc] && L.map[r + dr][c + dc] !== '#');
        if (!near) continue;
        v.x = (c + 0.5 + near[0] * 0.45) * BLOCK; v.z = (r + 0.5 + near[1] * 0.45) * BLOCK;
      } else { v.x = x; v.z = z; }
      total++;
      const tag = `level ${n} at (${(v.x / BLOCK).toFixed(2)}, ${(v.z / BLOCK).toFixed(2)})`;
      // settle: a few still steps push it out of what it overlaps
      for (let i = 0; i < 10; i++) { s.step(DT, NO_INPUT); s.events.length = 0; }
      if (s.solidAt(v.x, v.z)) { inside.push(tag); continue; }
      // walk away in one of eight directions
      let best = 0;
      for (let d = 0; d < 8 && best < 1; d++) {
        const a = (d / 8) * Math.PI * 2;
        const x0 = v.x, z0 = v.z;
        const inp: Input = { ...NO_INPUT, mx: Math.sin(a), mz: Math.cos(a) };
        for (let i = 0; i < 60 * 1.2; i++) { s.step(DT, inp); s.events.length = 0; }
        best = Math.max(best, Math.hypot(v.x - x0, v.z - z0));
        if (s.solidAt(v.x, v.z)) { inside.push(tag + ' (walked into a wall)'); break; }
      }
      if (best < 1) stuck.push(tag);
    }
    // monsters dropped half into walls come out
    const s = new Sim(L, noRanks(), false, 'mike', 3);
    for (const m of s.mons) {
      if (m.boss) continue;
      const c = Math.floor(m.x / BLOCK), r = Math.floor(m.z / BLOCK);
      m.x = (c + 0.02) * BLOCK; m.z = (r + 0.02) * BLOCK;
    }
    for (let i = 0; i < 120; i++) { s.step(DT, NO_INPUT); s.events.length = 0; }
    for (const m of s.mons) if (m.state !== 'gone' && m.state !== 'vent' && s.solidAt(m.x, m.z)) inside.push(`level ${n} monster ${m.kind} stays in a wall at (${(m.x / BLOCK).toFixed(2)}, ${(m.z / BLOCK).toFixed(2)})`);
  }
  return { drops: total, inside, stuck };
}

const proc = (globalThis as { process?: { argv: string[]; exit(code: number): void } }).process;
if (proc && proc.argv[1]?.endsWith('stuck.ts')) {
  const r = stuckCheck(Number(proc.argv[2]) || 200);
  console.log(`${r.drops} drops (mech radius ${MECH.radius} m), ${r.inside.length} left inside, ${r.stuck.length} stuck`);
  for (const l of r.inside.slice(0, 20)) console.log('  inside: ' + l);
  for (const l of r.stuck.slice(0, 20)) console.log('  stuck: ' + l);
  proc.exit(r.inside.length || r.stuck.length ? 1 : 0);
}
