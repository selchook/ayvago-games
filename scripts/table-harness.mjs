// Okey table bench (protocol 2.7): embeds three Okey pages as one table, the way ayvago.com
// seats players, and plays the platform's part in between (no Firebase): GHA_START with the
// seats, the table settings (11 hands, 15 s turns) and the host seat; every GHA_MOVE_OUT from one
// page is delivered to every other page still at the table as GHA_MOVE_IN { from } (after
// --latency ms, default 60); leaving removes a page and sends GHA_PEER_LEAVE { seat }; coming
// back loads it again and sends GHA_PEER_JOIN { seat }; GHA_HOST_CHANGE { hostSeat } hands the
// table over. Seats 0–2 are players (driven by the bench: draw, then throw), seat 3 a bot.
//
// Checks, in order:
//   1. settings applied on every page: 11 hands ("EL 1/11"), 15 s turns;
//   2. a present player whose game stalls (its loop asleep, like a throttled tab) gets the
//      automatic move from the host after 15 s + 5 s grace, and its page catches up;
//   3. a non-host leaves: the host's bot stands in for that seat (marked, shown on the seat);
//   4. that player comes back: their page resyncs and plays the seat again;
//   5. the host leaves, then GHA_HOST_CHANGE to seat 1: seat 1 plays the bot and the stand-in
//      and the hand goes on to its end; the new host starts the next hand;
//   6. the old host comes back as a normal player (isHost false), resyncs from the new host and
//      plays only its own seat;
//   6b. a host whose page stays open hands over (GHA_HOST_CHANGE to seat 2): it stops playing
//      other seats at once and resyncs;
//   7. never two different moves for the same place of a hand; every page ends with the same log
//      and scores; no page errors.
// Usage: node scripts/table-harness.mjs [--dev] [--shots] [--latency 60]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const shots = args.includes('--shots');
const latency = args.includes('--latency') ? Number(args[args.indexOf('--latency') + 1]) : 60;
const slug = 'okey';
if (!existsSync(dev ? join(root, 'games', slug, 'index.html') : join(root, 'dist', 'games', slug, 'index.html'))) {
  console.error('okey is not built (run npm run build, or pass --dev)');
  process.exit(1);
}

const GAME_PORT = 4700 + Math.floor(Math.random() * 90);
const HOST_PORT = 3000;   // an allowed platform origin in the adapter
const GAME_ORIGIN = `http://localhost:${GAME_PORT}`;

const server = spawn('npx', dev ? ['vite', '--port', String(GAME_PORT), '--strictPort'] : ['vite', 'preview', '--port', String(GAME_PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${GAME_PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });

const page = `<!doctype html><html><body style="margin:0;background:#111;display:flex;gap:8px" id="b">
<script>
  const SEATS = [
    { name: 'Ada', character: 'zombie', bot: false },
    { name: 'Bora', character: 'rookie', bot: false },
    { name: 'Cem', bot: false },
    { name: 'Ayşe', bot: true },
  ];
  const SETTINGS = { hands: 11, turnSeconds: 15, bots: true };
  window.hostSeat = 0;
  window.frames_ = [null, null, null];
  window.moves = [];        // every relayed move: { from, data, at }
  window.ends = [];
  window.errors = [];
  window.send = (i, m) => { const f = frames_[i]; if (f) f.contentWindow.postMessage(m, '${GAME_ORIGIN}'); };
  window.sit = (i) => {
    const f = document.createElement('iframe');
    f.id = 'f' + i;
    f.src = '${GAME_ORIGIN}/games/${slug}/?nointro';
    f.style.cssText = 'width:640px;height:360px;border:0;order:' + i;
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-forms');
    f.setAttribute('referrerpolicy', 'origin');
    frames_[i] = f;
    document.getElementById('b').appendChild(f);
  };
  window.leave = (i) => {
    frames_[i].remove();
    frames_[i] = null;
    for (let k = 0; k < 3; k++) if (k !== i) send(k, { type: 'GHA_PEER_LEAVE', seat: i });
  };
  window.join = (i) => {
    sit(i);
    for (let k = 0; k < 3; k++) if (k !== i) send(k, { type: 'GHA_PEER_JOIN', seat: i, name: SEATS[i].name });
  };
  window.handOver = (seat) => {
    hostSeat = seat;
    for (let k = 0; k < 3; k++) send(k, { type: 'GHA_HOST_CHANGE', hostSeat: seat });
  };
  addEventListener('message', (e) => {
    const i = frames_.findIndex((f) => f && f.contentWindow === e.source);
    if (i < 0 || e.origin !== '${GAME_ORIGIN}') return;
    const m = e.data || {};
    if (m.type === 'GHA_END') ends.push({ i, ...m });
    if (m.type === 'GHA_READY') send(i, { type: 'GHA_START', config: {
      mode: 'multiplayer', isHost: i === hostSeat, playerIndex: i, playerCount: 4, peerName: '', protocol: 2,
      character: SEATS[i].character, seats: SEATS, table: { settings: SETTINGS, hostSeat },
      theme: 'cartoon', colorMode: 'dark', tokens: {}, locale: 'tr', adsEnabled: false } });
    if (m.type === 'GHA_MOVE_OUT') {
      moves.push({ from: i, data: m.data, at: Date.now() });
      setTimeout(() => { for (let k = 0; k < 3; k++) if (k !== i) send(k, { type: 'GHA_MOVE_IN', data: m.data, from: i }); }, ${latency});
    }
  });
  for (let i = 0; i < 3; i++) sit(i);
</script></body></html>`;
const host = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(HOST_PORT);

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const tab = await browser.newPage({ viewport: { width: 1940, height: 380 } });
const errors = [];
tab.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
tab.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
if (shots) mkdirSync(join(root, 'reports', 'table'), { recursive: true });
const shot = async (name) => { if (shots) await tab.screenshot({ path: join(root, 'reports', 'table', `${slug}-${name}.png`) }); };

const frameOf = async (i) => (await tab.$(`#f${i}`))?.contentFrame() ?? null;
/** Runs fn(scene) inside seat i's Play scene; null when it is not running. */
async function inPlay(i, fn, arg) {
  const f = await frameOf(i);
  if (!f) return null;
  return f.evaluate(([src, a]) => {
    const s = window.__ayvago?.game.scene.getScene('Play');
    if (!s || !s.scene.isActive()) return null;
    return new Function('s', 'a', `return (${src})(s, a)`)(s, a);
  }, [fn.toString(), arg]).catch(() => null);
}
const sceneOf = async (i) => {
  const f = await frameOf(i);
  return f ? f.evaluate(() => window.__ayvago?.game.scene.getScenes(true).map((x) => x.scene.key).join('+') ?? '').catch(() => '?') : 'gone';
};
const state = (i) => inPlay(i, (s) => ({
  hand: s.hand, n: s.log.length, turn: s.turn, phase: s.phase, host: s.wasHost, away: [...s.away], over: s.isOver,
  hands: s.handsPerMatch, turnMs: s.turnMs, hud: s.handText.text, scores: [...s.scores],
  log: JSON.stringify(s.log.map((a) => [a.s, a.a, a.id ?? -1])),
  notes: s.seatUi.map((u) => u.note.visible),
}));
const until = async (what, cond, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await tab.waitForTimeout(150);
  }
  throw new Error('timed out: ' + what);
};

// The bench plays the people: on a seat's own turn, draw from the middle, then throw (or finish).
const frozen = new Set();
let driving = true;
async function drive() {
  while (driving) {
    for (let i = 0; i < 3; i++) {
      if (frozen.has(i)) continue;
      await inPlay(i, (s) => {
        s.time.timeScale = 3;   // bots and hand-end pauses run faster; the turn clock stays real
        if (s.isOver || s.phase === 'over' || !s.myTurn() || s.time.now - s.turnStarted < 250) return;
        if (s.phase === 'draw') s.humanDraw('draw');
        else if (s.myFinish()) s.humanFinish();
        else { s.selected = s.hands[s.me][s.hands[s.me].length - 1]; s.humanDiscard(); }
      });
    }
    await tab.waitForTimeout(120);
  }
}

const step = {};
const fail = (msg) => { throw new Error(msg); };
const acts = () => tab.evaluate(() => moves.filter((m) => m.data && m.data.t === 'act').map((m) => ({ from: m.from, at: m.at, ...m.data.d })));
let driver;
try {
  await tab.goto(`http://localhost:${HOST_PORT}/`);
  for (const i of [0, 1, 2]) await until(`menu ${i}`, async () => (await sceneOf(i)).includes('Menu'), dev ? 60000 : 20000);
  // the host starts the match
  await (await frameOf(0)).evaluate(() => window.__ayvago.game.scene.getScene('Menu').startGame());
  for (const i of [0, 1, 2]) await until(`play ${i}`, async () => !!(await state(i)), 15000);

  // 1. settings
  const st = await Promise.all([0, 1, 2].map(state));
  step.settings = st.every((x) => x.hands === 11 && x.turnMs === 15000 && x.hud === 'EL 1/11');
  if (!step.settings) fail('settings not applied: ' + JSON.stringify(st.map((x) => [x.hands, x.turnMs, x.hud])));
  await shot('1-start');
  driver = drive();
  await until('a few moves', async () => (await state(0)).n >= 8, 60000);

  // 2. seat 2 stalls on its turn (its game loop asleep, like a throttled tab): the host plays it
  frozen.add(2);
  await until('seat 2 to draw', async () => { const x = await state(0); return x.turn === 2 && x.phase === 'draw' && x.n > 0; }, 90000);
  const turnAt = Date.now();
  await (await frameOf(2)).evaluate(() => window.__ayvago.game.loop.sleep());
  await until('host plays seat 2', async () => (await acts()).some((a) => a.s === 2 && a.x === 1 && a.from === 0 && a.a !== 'draw'), 40000);
  const took = (await acts()).filter((a) => a.s === 2 && a.x === 1);
  const waited = (took[0].at - turnAt) / 1000;
  step.hostAuto = waited >= 19 && waited <= 27;
  if (!step.hostAuto) fail(`host took seat 2's turn after ${waited.toFixed(1)} s (expected 20 s)`);
  await (await frameOf(2)).evaluate(() => window.__ayvago.game.loop.wake());
  frozen.delete(2);
  await tab.waitForTimeout(800);
  const [h0, h2] = [await state(0), await state(2)];
  step.throttledCatchUp = h0.log === h2.log;
  if (!step.throttledCatchUp) fail('the stalled page did not keep the table');
  step.hostAutoSeconds = Number(waited.toFixed(1));

  // 3. seat 1 leaves: the host's bot stands in
  const before = (await acts()).length;
  await tab.evaluate(() => leave(1));
  await until('stand-in moves', async () => (await acts()).slice(before).filter((a) => a.s === 1 && a.x === 2 && a.from === 0).length >= 2, 60000);
  const shown = await Promise.all([0, 2].map(async (i) => { const x = await state(i); const rel = (1 - i + 4) % 4; return x.notes[rel]; }));
  step.standIn = shown.every(Boolean);
  if (!step.standIn) fail('the stand-in is not shown on the seat');
  await shot('3-standin');

  // 4. seat 1 comes back: resync, then it plays its own seat again
  await tab.evaluate(() => join(1));
  await until('seat 1 back in play', async () => !!(await state(1)), dev ? 60000 : 20000);
  const backFrom = (await acts()).length;
  await until('seat 1 plays itself', async () => (await acts()).slice(backFrom).some((a) => a.s === 1 && a.from === 1), 60000);
  const s1 = await state(1), s0 = await state(0);
  step.rejoin = s1.away.length === 0 && s0.away.length === 0;
  if (!step.rejoin) fail('seat 1 still marked away: ' + JSON.stringify([s0.away, s1.away]));
  step.noStandInAfterBack = (await acts()).slice(backFrom).filter((a) => a.s === 1 && a.from !== 1).length <= 2;   // at most the turn it came back in

  // 5. the host leaves; seat 1 takes over
  const hand0 = (await state(1)).hand;
  await tab.evaluate(() => leave(0));
  await tab.waitForTimeout(1500);
  const stalled = await state(1);
  await tab.evaluate(() => handOver(1));
  await until('seat 1 is host', async () => (await state(1))?.host === true && (await state(2))?.host === false, 5000);
  const overFrom = (await acts()).length;
  await until('new host plays the bot and the stand-in', async () => {
    const a = (await acts()).slice(overFrom);
    return a.some((x) => x.s === 3 && x.from === 1) && a.some((x) => x.s === 0 && x.from === 1 && x.x === 2);
  }, 120000);
  step.newHostPlays = true;
  await until('hand ends', async () => { const x = await state(1); return x.hand > hand0 || x.phase === 'over'; }, 240000);
  await tab.waitForTimeout(1500);
  const [e1, e2] = [await state(1), await state(2)];
  step.handEnd = e1.log === e2.log && JSON.stringify(e1.scores) === JSON.stringify(e2.scores);
  if (!step.handEnd) fail('pages differ at the end of the hand');
  await shot('5-handend');
  // the new host starts the next hand
  await inPlay(1, (s) => { const b = s.panelCtl.find((o) => typeof o.press === 'function'); b?.press(); });
  await until('next hand on both', async () => (await state(1)).hand === hand0 + 1 && (await state(2)).hand === hand0 + 1, 15000);
  step.nextHand = (await state(2)).hud === `EL ${hand0 + 2}/11`;
  step.stalledBeforeHandOver = stalled ? stalled.n : null;

  // 6. the old host comes back as a normal player
  await tab.evaluate(() => join(0));
  await until('seat 0 back in play', async () => !!(await state(0)), dev ? 60000 : 20000);
  const oldFrom = (await acts()).length;
  await until('seat 0 plays itself', async () => (await acts()).slice(oldFrom).some((a) => a.s === 0 && a.from === 0), 90000);
  await tab.waitForTimeout(3000);
  const later = (await acts()).slice(oldFrom);
  step.oldHostNormal = (await state(0)).host === false && later.every((a) => a.from !== 0 || a.s === 0);
  if (!step.oldHostNormal) fail('the old host still acts for other seats');

  // 6b. a host whose page is still open loses the role (it was cut off for a while): seat 2
  // hosts now; seat 1 stops playing the bot at once and resyncs, seat 2 plays it
  await tab.evaluate(() => handOver(2));
  await until('seat 2 is host', async () => (await state(2))?.host === true && (await state(1))?.host === false, 5000);
  const demoteFrom = (await acts()).length;
  await until('seat 2 plays the bot', async () => (await acts()).slice(demoteFrom).some((a) => a.s === 3 && a.from === 2), 60000);
  await tab.waitForTimeout(2000);
  step.demoted = (await acts()).slice(demoteFrom).every((a) => a.from !== 1 || a.s === 1);
  if (!step.demoted) fail('the demoted host still acts for other seats');

  // 7. no double moves and one game on every page
  driving = false;
  await driver;
  await tab.waitForTimeout(1500);
  const all = await acts();
  const seen = new Map();
  const doubles = [];
  for (const a of all) {
    const key = `${a.h}:${a.n}`;
    const val = `${a.s}:${a.a}:${a.id ?? -1} from ${a.from}${a.x ? ' x' + a.x : ''}`;
    if (seen.has(key) && seen.get(key).split(' ')[0] !== val.split(' ')[0]) doubles.push(`${key} ${seen.get(key)} / ${val}`);
    else if (seen.has(key)) doubles.push(`${key} sent twice: ${seen.get(key)} / ${val}`);
    seen.set(key, val);
  }
  step.doubleMoves = doubles.length;
  if (doubles.length) errors.push('double moves: ' + doubles.join('; '));
  // the bots play on (and moves are in flight), so compare until the pages agree at one moment
  const same = (fin) => fin.every((x) => x && x.log === fin[0].log && x.hand === fin[0].hand && JSON.stringify(x.scores) === JSON.stringify(fin[0].scores));
  let fin = [];
  step.samePages = await until('same pages', async () => same(fin = await Promise.all([0, 1, 2].map(state))), 12000).catch(() => false);
  if (!step.samePages) errors.push('pages differ: ' + fin.map((x) => x && `${x.hand}/${x.n}/${x.phase}`).join(' '));
  step.moves = all.length;
  await shot('7-end');
} catch (e) {
  const scenes = await Promise.all([0, 1, 2].map(sceneOf));
  errors.push('flow: ' + String(e.message).split('\n')[0] + ` | scenes=${scenes.join(' / ')}`);
  await shot('fail');
}
driving = false;
await driver?.catch(() => {});
await browser.close();
host.close();
try { process.kill(-server.pid); } catch { server.kill(); }
const ok = errors.length === 0 && step.doubleMoves === 0 && step.samePages && step.nextHand && step.noStandInAfterBack && step.demoted;
console.log(`${ok ? 'PASS' : 'FAIL'}  okey table  ${JSON.stringify(step)}${errors.length ? '\n      ' + [...new Set(errors)].slice(0, 8).join('\n      ') : ''}`);
process.exit(ok ? 0 : 1);
