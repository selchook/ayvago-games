// Headless check of the online sync: a host simulation (two bots, one of them "remote"), the real
// snapshot encoder, a network with latency and jitter both ways, and the guest's real
// interpolation buffer sampled at 60 frames a second. Reports the snapshot and input rates, how
// far the guest's drawn ball moves per frame (a teleport would show as a jump far above what the
// real ball ever does in a frame) and how far the guest's players are from the host's truth.
// Run: npx tsx games/blacktop-kings/netbench.ts [seconds] [latency ms] [jitter ms]
import { Game, NO_INPUT, type Input } from './sim';
import { MATES } from './ai';
import { Bot, SKILL } from './bot';
import { EventLog, SnapBuffer, emptyIn, encodeSnap, HELD_SNAP, type InMsg, type Snap } from './netcode';

export function bench(seconds = 120, latency = 60, jitter = 25, seed = 7) {
  const g = new Game({ seed, ai: [null, null], mates: MATES });
  const hostBot = new Bot(g, 0, SKILL.good, rnd(seed + 1));
  const guestBot = new Bot(g, 1, SKILL.good, rnd(seed + 2));
  const r = rnd(seed + 3);
  const FRAME = 1000 / 60;
  const toGuest: Array<{ at: number; s: Snap }> = [];
  const toHost: Array<{ at: number; m: InMsg }> = [];
  const log = new EventLog(700);
  const buf = new SnapBuffer(110);
  let remote = emptyIn(), seen = emptyIn(), remoteAt = 0;
  const counters = { sd: 0, su: 0, sh: 0, ps: 0, pt: -1, jp: 0, ac: 0, sw: 0 };
  let sent = emptyIn(), sendT = -1e9, snapT = -1e9, snaps = 0, ins = 0;
  let lastGuestArrive = 0, lastHostArrive = 0;
  const truth: Array<{ t: number; bx: number; by: number; bz: number; held: number; p: Array<[number, number]> }> = [];
  let drawn: { x: number; y: number; z: number } | null = null;
  const off = { x: 0, y: 0, z: 0 };
  let lastState = '', lastHolder = -2;
  const jumps: number[] = [], trueJumps: number[] = [], errs: number[] = [];
  let lastTrue: { x: number; y: number; z: number } | null = null;
  for (let f = 0; f * FRAME < seconds * 1000; f++) {
    const now = f * FRAME;
    // the guest's input: what its bot would press, sent as counters at most every 25 ms on a change
    const gi = guestBot.input(1 / 60);
    if (gi.shootDown) counters.sd++;
    if (gi.shootUp >= 0) { counters.su++; counters.sh = Math.round(gi.shootUp * 1000); }
    if (gi.pass) { counters.ps++; counters.pt = gi.passTo; }
    if (gi.jump) counters.jp++;
    if (gi.action) counters.ac++;
    if (gi.swap) counters.sw++;
    const want: InMsg = { x: gi.mx, z: gi.mz, tb: gi.turbo ? 1 : 0, ...counters, q: sent.q };
    const changed = want.x !== sent.x || want.z !== sent.z || want.tb !== sent.tb || want.sd !== sent.sd || want.su !== sent.su || want.ps !== sent.ps || want.jp !== sent.jp || want.ac !== sent.ac || want.sw !== sent.sw;
    if ((changed && now - sendT >= 25) || now - sendT >= 50) {
      sendT = now; want.q = sent.q + 1; sent = want; ins++;
      lastHostArrive = Math.max(lastHostArrive, now + latency + r() * jitter);
      toHost.push({ at: lastHostArrive, m: { ...want } });
    }
    while (toHost.length && toHost[0].at <= now) {
      const m = toHost.shift()!.m;
      if (m.q !== remote.q) remoteAt = now;
      remote = m;
    }
    // the host steps with both inputs (the guest's edges from its counters)
    const ri: Input = { ...NO_INPUT, mx: remote.x, mz: remote.z, turbo: !!remote.tb };
    if (remote.sd > seen.sd) ri.shootDown = true;
    if (remote.su > seen.su) ri.shootUp = remote.sh / 1000;
    if (remote.ps > seen.ps) { ri.pass = true; ri.passTo = remote.pt; }
    if (remote.jp > seen.jp) ri.jump = true;
    if (remote.ac > seen.ac) ri.action = true;
    if (remote.sw > seen.sw) ri.swap = true;
    seen = { ...remote };
    g.step(1 / 60, [hostBot.input(1 / 60), ri]);
    for (const e of g.events) log.add(e, now);
    const b = g.ball;
    if (lastTrue) trueJumps.push(Math.hypot(b.x - lastTrue.x, b.y - lastTrue.y, b.z - lastTrue.z));
    lastTrue = { x: b.x, y: b.y, z: b.z };
    truth.push({ t: now, bx: b.x, by: b.y, bz: b.z, held: b.state === 'held' ? b.holder : -1, p: g.p.map((q) => [q.x, q.z] as [number, number]) });
    if (truth.length > 400) truth.shift();
    if (now - snapT >= 50) {
      snapT = now; snaps++;
      lastGuestArrive = Math.max(lastGuestArrive, now + latency + r() * jitter);
      toGuest.push({ at: lastGuestArrive, s: JSON.parse(JSON.stringify(encodeSnap(g, now, log.recent(now), remote.q, now - remoteAt))) });
    }
    // the guest draws
    while (toGuest.length && toGuest[0].at <= now) buf.push(toGuest.shift()!.s, now);
    const smp = buf.sample(now);
    if (!smp) continue;
    let tx = smp.ball.x, ty = smp.ball.y, tz = smp.ball.z;
    if (smp.ball.state === 'held' && smp.ball.holder >= 0) {
      const p = smp.p[smp.ball.holder];
      tx = p.x + Math.sin(p.face) * 0.42; ty = 1.0 + p.lift; tz = p.z + Math.cos(p.face) * 0.42;
    }
    // the view's easing (view.ts placeBall): a hand-off, or a held ball that would jump
    if (drawn) {
      const d = Math.hypot(drawn.x - tx, drawn.y - ty, drawn.z - tz);
      const handOff = smp.ball.state !== lastState || smp.ball.holder !== lastHolder;
      if ((handOff && d > 0.05 && d < 3) || (smp.ball.state === 'held' && d > HELD_SNAP && d < 3)) { off.x = drawn.x - tx; off.y = drawn.y - ty; off.z = drawn.z - tz; }
    }
    lastState = smp.ball.state; lastHolder = smp.ball.holder;
    const k = Math.max(0, 1 - (1 / 60) * 12);
    off.x *= k; off.y *= k; off.z *= k;
    const nx = tx + off.x, ny = ty + off.y, nz = tz + off.z;
    if (drawn) {
      const j = Math.hypot(nx - drawn.x, ny - drawn.y, nz - drawn.z);
      jumps.push(j);
      if (j > 0.38 && (globalThis as { process?: { env: Record<string, string> } }).process?.env.BENCH_DEBUG) console.log('jump', j.toFixed(2), 'snaps', JSON.stringify(buf.snaps.slice(-6).map((x) => [x.s.t, x.at, x.s.b.slice(0, 5).join(',')])), 'target', (now - buf.offset - 110).toFixed(0), smp.ball.state, smp.ball.holder, smp.p[Math.max(0, smp.ball.holder)].act, 'from', drawn.x.toFixed(2), drawn.y.toFixed(2), drawn.z.toFixed(2), 'to', nx.toFixed(2), ny.toFixed(2), nz.toFixed(2));
    }
    drawn = { x: nx, y: ny, z: nz };
    // players against the truth at the moment the guest shows
    const shown = now - latency - 110;
    const tr = truth.find((x) => x.t >= shown);
    if (tr) for (let i = 0; i < 6; i++) errs.push(Math.hypot(smp.p[i].x - tr.p[i][0], smp.p[i].z - tr.p[i][1]));
    if (g.phase === 'final' && g.phaseT > 2) break;
  }
  const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
  const dur = truth[truth.length - 1].t / 1000;
  return {
    seconds: +dur.toFixed(1), score: g.score.join('-'), snapsPerSec: +(buf.count / dur).toFixed(1), inputsPerSec: +(ins / dur).toFixed(1),
    snapBytes: JSON.stringify(encodeSnap(g, 0, log.recent(truth[truth.length - 1].t), 0, 0)).length,
    ballStep: { p50: +q(jumps, 0.5).toFixed(3), p99: +q(jumps, 0.99).toFixed(3), max: +Math.max(...jumps).toFixed(3), over05: jumps.filter((j) => j > 0.5).length },
    trueBallStep: { p99: +q(trueJumps, 0.99).toFixed(3), max: +Math.max(...trueJumps).toFixed(3) },
    playerErr: { p50: +q(errs, 0.5).toFixed(3), p95: +q(errs, 0.95).toFixed(3) },
  };
}

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc && proc.argv[1]?.endsWith('netbench.ts')) {
  const [s, l, j] = proc.argv.slice(2).map(Number);
  for (const lat of l ? [l] : [30, 60, 120]) console.log(`latency ${lat} ms ±${j || 25}:`, JSON.stringify(bench(s || 120, lat, j || 25)));
}
