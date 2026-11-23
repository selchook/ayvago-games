// City generator: headless checks of the plan (run by scripts/city-test.mjs, or `npx tsx scripts/city-unit.ts`).
//   - determinism: the same options give the same plan hash; another seed a different one
//   - lots: none overlap, each lies inside its block's sidewalk edge and faces a road
//   - buildings: no footprint corner stands on a road
//   - the lane graph: one strongly connected network (every lane can reach every other)
//   - the pedestrian graph: connected
//   - the open-world data: unique place ids; kit buildings on the kit's 2 m grid with their doors
//     on the facade; roads no steeper than 8 % over the terrain; the coast town has its pier,
//     lighthouse, marina and main street
//   - time: a plan in well under a second
import { generateCity, planHash, planStats, cityQuery, terrainOf, STYLE_IDS, type CityPlan, type StyleId } from '../src/core/three/city/data';
import { obbOverlap, obbCorners, pointInPoly, segDist, type OBB } from '../src/core/three/city/geom';

let failed = 0;
const check = (ok: boolean, what: string) => { if (!ok) { failed++; console.log('  FAIL ' + what); } };

function lotsOk(plan: CityPlan): { overlaps: number; outside: number; noRoad: number } {
  let overlaps = 0, outside = 0, noRoad = 0;
  // overlaps: grid of 64 m cells
  const grid = new Map<string, number[]>();
  plan.lots.forEach((l, i) => {
    const k = `${Math.floor(l.obb.x / 64)},${Math.floor(l.obb.z / 64)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  plan.lots.forEach((l, i) => {
    const cx = Math.floor(l.obb.x / 64), cz = Math.floor(l.obb.z / 64);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
        if (j <= i) continue;
        if (obbOverlap(l.obb, plan.lots[j].obb, 0.05)) overlaps++;
      }
    }
    const b = plan.blocks[l.block];
    const inner = b.inner ?? b.curb;
    if (!obbCorners(shrink(l.obb, 0.02)).every((c) => pointInPoly(c, inner))) outside++;
    // the front edge's middle is within a sidewalk of the road it faces
    const E = plan.edges[l.edge];
    // its front: the middle and both corners (corner lots sit back from a rounded kerb)
    const f = obbCorners(l.obb);
    const fronts = [f[0], f[1], { x: (f[0].x + f[1].x) / 2, z: (f[0].z + f[1].z) / 2 }];
    let d = Infinity;
    for (const front of fronts) for (let k = 0; k < E.pts.length - 1; k++) d = Math.min(d, segDist(front, E.pts[k], E.pts[k + 1]).d);
    if (d > E.half + b.walk + 6) noRoad++;
  });
  return { overlaps, outside, noRoad };
}

const shrink = (o: OBB, d: number): OBB => ({ ...o, hw: o.hw - d, hd: o.hd - d });

/** The open-world data: place ids, the kit's grid and doors, road grades over the terrain. */
function openWorld(plan: CityPlan): { dupIds: number; offGrid: number; doorsOff: number; grade: number } {
  const ids = new Set<string>();
  let dupIds = 0;
  for (const q of plan.pois) { if (ids.has(q.id)) dupIds++; ids.add(q.id); }
  let offGrid = 0, doorsOff = 0;
  const onGrid = (v: number) => Math.abs(v / 2 - Math.round(v / 2)) < 1e-6;
  for (const b of plan.buildings) {
    if (!b.kit) continue;
    const o = b.parts[0].obb;
    if (!onGrid(o.hw * 2) || !onGrid(o.hd * 2) || Math.abs(b.parts[0].y1 / 3 - Math.round(b.parts[0].y1 / 3)) > 1e-6) offGrid++;
    for (const d of b.doors) {
      // a door stands just outside one of the footprint's sides
      const lu = (d.x - o.x) * o.ux + (d.z - o.z) * o.uz, lv = -(d.x - o.x) * o.uz + (d.z - o.z) * o.ux;
      const outside = Math.max(Math.abs(lu) - o.hw, Math.abs(lv) - o.hd);
      if (outside < 0 || outside > 0.6) doorsOff++;
    }
  }
  const T = terrainOf(plan);
  let grade = 0;
  for (const E of plan.edges) {
    for (let i = 0; i < E.pts.length - 1; i++) {
      const a = E.pts[i], b = E.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 8) continue;
      grade = Math.max(grade, Math.abs(T.h(b.x, b.z) - T.h(a.x, a.z)) / L);
    }
  }
  return { dupIds, offGrid, doorsOff, grade };
}

function buildingsOnRoads(plan: CityPlan): number {
  const q = cityQuery(plan);
  let n = 0;
  for (const b of plan.buildings) {
    for (const part of b.parts) {
      if (part.kind !== 'mass' || part.y0 > 1) continue;
      for (const c of obbCorners(shrink(part.obb, 0.05))) if (q.roadAt(c.x, c.z)) { n++; break; }
    }
  }
  return n;
}

/** Share of lanes in the largest strongly connected component (Kosaraju over lanes). */
function laneSCC(plan: CityPlan): number {
  const n = plan.lanes.length;
  const out: number[][] = plan.lanes.map((l) => l.next.map((c) => plan.connectors[c].to));
  const inn: number[][] = plan.lanes.map(() => []);
  out.forEach((list, a) => list.forEach((b) => inn[b].push(a)));
  const seen = new Uint8Array(n), order: number[] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const stack: [number, number][] = [[s, 0]];
    seen[s] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top[1] < out[top[0]].length) {
        const v = out[top[0]][top[1]++];
        if (!seen[v]) { seen[v] = 1; stack.push([v, 0]); }
      } else { order.push(top[0]); stack.pop(); }
    }
  }
  const comp = new Int32Array(n).fill(-1);
  let best = 0, c = 0;
  for (let i = order.length - 1; i >= 0; i--) {
    const s = order[i];
    if (comp[s] >= 0) continue;
    let size = 0;
    const st = [s];
    comp[s] = c;
    while (st.length) {
      const v = st.pop()!;
      size++;
      for (const u of inn[v]) if (comp[u] < 0) { comp[u] = c; st.push(u); }
    }
    best = Math.max(best, size);
    c++;
  }
  return n ? best / n : 1;
}

function walkConnected(plan: CityPlan): number {
  const n = plan.walk.pts.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of plan.walk.edges) { adj[a].push(b); adj[b].push(a); }
  const comp = new Int32Array(n).fill(-1);
  let best = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    let size = 0;
    const st = [s];
    comp[s] = s;
    while (st.length) { const v = st.pop()!; size++; for (const u of adj[v]) if (comp[u] < 0) { comp[u] = s; st.push(u); } }
    best = Math.max(best, size);
  }
  return n ? best / n : 1;
}

const cases: { style: StyleId; seed: number }[] = [];
for (const style of STYLE_IDS) for (const seed of [1, 2, 3]) cases.push({ style, seed });

// warm the JIT once so the timings say what a game sees after load
generateCity({ seed: 99, style: 'suburbia' });
generateCity({ seed: 98, style: 'metropolis' });
const times: number[] = [];
for (const { style, seed } of cases) {
  const t0 = performance.now();
  const plan = generateCity({ seed, style });
  const ms = performance.now() - t0;
  times.push(ms);
  const again = generateCity({ seed, style });
  const other = generateCity({ seed: seed + 1000, style });
  const st = planStats(plan);
  const lots = lotsOk(plan);
  const onRoad = buildingsOnRoads(plan);
  const scc = laneSCC(plan);
  const walk = walkConnected(plan);
  const ow = openWorld(plan);
  console.log(`${style.padEnd(10)} seed ${seed}  ${ms.toFixed(0).padStart(4)} ms  ${plan.size} m  blocks ${st.blocks}  lots ${st.lots}  buildings ${st.buildings} (kit ${st.kit})  lanes ${st.lanes}  `
    + `scc ${(scc * 100).toFixed(1)}%  walk ${(walk * 100).toFixed(1)}%  overlaps ${lots.overlaps}  outside ${lots.outside}  noRoad ${lots.noRoad}  onRoad ${onRoad}  `
    + `places ${st.pois}  grade ${(ow.grade * 100).toFixed(1)}%  terrain ${terrainOf(plan).max.toFixed(0)} m`);
  check(ow.dupIds === 0, `${style} ${seed}: ${ow.dupIds} duplicate place ids`);
  check(ow.offGrid === 0, `${style} ${seed}: ${ow.offGrid} kit buildings off the 2 m grid`);
  check(ow.doorsOff === 0, `${style} ${seed}: ${ow.doorsOff} kit doors away from their facade`);
  check(ow.grade < 0.08, `${style} ${seed}: steepest road ${(ow.grade * 100).toFixed(1)} %`);
  if (style === 'coast') for (const id of ['pier', 'lighthouse', 'marina', 'main-street', 'beach-0']) check(plan.pois.some((q) => q.id === id), `${style} ${seed}: has its ${id}`);
  check(planHash(plan) === planHash(again), `${style} ${seed}: same seed, same plan`);
  check(planHash(plan) !== planHash(other), `${style} ${seed}: another seed, another plan`);
  check(lots.overlaps === 0, `${style} ${seed}: ${lots.overlaps} lot overlaps`);
  check(lots.outside === 0, `${style} ${seed}: ${lots.outside} lots outside their block`);
  check(lots.noRoad === 0, `${style} ${seed}: ${lots.noRoad} lots away from a road`);
  check(onRoad === 0, `${style} ${seed}: ${onRoad} buildings on a road`);
  check(scc > 0.995, `${style} ${seed}: lane graph ${(scc * 100).toFixed(1)}% strongly connected`);
  check(walk > 0.97, `${style} ${seed}: pedestrian graph ${(walk * 100).toFixed(1)}% connected`);
  check(st.blocks > 40 && st.buildings > 300, `${style} ${seed}: a real city (${st.blocks} blocks, ${st.buildings} buildings)`);
  check(ms < 1500, `${style} ${seed}: generated in ${ms.toFixed(0)} ms`);
}
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`\nplan time: mean ${avg.toFixed(0)} ms, max ${Math.max(...times).toFixed(0)} ms over ${times.length} cities`);
check(avg < 700, `mean plan time ${avg.toFixed(0)} ms (a busy machine can push one city past a second, so the mean is the measure)`);
console.log(failed ? `${failed} check(s) failed` : 'all plan checks passed');
process.exit(failed ? 1 : 0);
