// Moon Rover: playthrough check. Plays the game in a real browser through the game's own test hooks
// (`window.__mr`) and the keyboard, and fails when a step does not do what the player would see:
//   - the device gets its orientation (desktop landscape, phone portrait with the touch pad);
//   - the menu starts a run (Enter) and the mission map opens; Enter on the map drives 1-1;
//   - GAS (the up arrow) moves the rover;
//   - the battery is let run dry: the rover stops, a heart is lost and the tow puts it back at the
//     last checkpoint with a full battery;
//   - the autopilot (`bot.ts`, god mode on) clears 1-1: the mission card shows, 1-2 opens and the
//     run's score has grown; NEXT is pressed the moment the card appears (a quick tap must not
//     freeze the game) and the hangar opens, where a purchase spends credits and adds a rank;
//   - back on the map, the miner set-piece (1-5) is played by the autopilot until a generator
//     shuts down; then the hearts are lost on purpose and the run ends on the result screen with
//     the run's score;
//   - Easy and Normal differ (more hearts and battery, slower meteors and bolts on Easy);
//   - no page errors on the way.
// The game is adaptive: the whole playthrough runs twice, on a desktop window (it must boot
// landscape) and on an emulated phone (touch, a 390 px short side: it must boot portrait).
// Run: node games/moon-rover/playtest.mjs [--base http://localhost:5601] [--shots <dir>] [--orient landscape|portrait]
//   Without --base it starts its own Vite dev server on a port from 5601 to 5609. Exits 1 on a failure.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
let base = opt('--base');
const shots = opt('--shots');
const ORIENTS = opt('--orient') ? [opt('--orient')] : ['landscape', 'portrait'];
const DEVICE = {
  landscape: { viewport: { width: 1280, height: 720 } },
  portrait: { viewport: { width: 720, height: 1280 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
let orient = ORIENTS[0];
if (shots) mkdirSync(shots, { recursive: true });

let server = null;
if (!base) {
  const port = Number(process.env.AYVAGO_TEST_PORT) || 5601 + Math.floor(Math.random() * 9);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `mr-play-${port}`) } });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'}  [${orient}] ${name}  ${detail}`); };
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(difficulty = 'normal') {
  const ctx = await browser.newContext({ ...DEVICE[orient], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /a frame failed/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.addInitScript((d) => {
    // a fresh player: no credits, mission 1-1 open, the tutorial and the first hints already seen
    localStorage.setItem('ayvago:moon-rover:meta', JSON.stringify({ hints: ['tut', 'h_drive', 'h_craters'] }));
    localStorage.setItem('ayvago:difficulty:moon-rover', JSON.stringify(d));
  }, difficulty);
  await page.goto(`${base}/games/moon-rover/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu'), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  return page;
}
const state = (page) => page.evaluate(() => window.__mr.state());
const until = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `${orient}-${name}.png`) }); };

for (orient of ORIENTS) try {
  const page = await open('normal');
  const got = await page.evaluate(() => [window.__ayvago.orientation, window.__ayvago.game.scale.width, window.__ayvago.game.scale.height]);
  check(`the device gets ${orient}`, got[0] === orient, got.join(' '));
  await page.keyboard.press('Enter');
  const onMap = await until(page, () => window.__mr?.state().phase === 'map', null, 20000);
  check('menu → mission map', onMap);
  await page.waitForTimeout(500);
  await shot(page, 'map');
  await page.keyboard.press('Enter');
  await until(page, () => window.__mr.state().phase === 'intro', null, 20000);
  await page.keyboard.press('Enter');
  const playing = await until(page, () => window.__mr.state().phase === 'play', null, 30000);
  let s = await state(page);
  check('Enter on the map drives mission 1-1', playing && s.level === 1, `phase ${s.phase}, level ${s.level}, hearts ${s.rover.hp / 2}/${s.rover.max / 2}`);
  check('the touch pad shows on the phone only', s.touchPad === (orient === 'portrait'), `pad ${s.touchPad}`);
  const z0 = s.rover.z, hp0 = s.rover.hp, score0 = s.score;
  // GAS moves the rover
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  s = await state(page);
  check('GAS drives the rover forward', Math.abs(s.rover.z - z0) > 2, `z ${z0.toFixed(1)} → ${s.rover.z.toFixed(1)}`);
  await shot(page, 'drive');

  // the battery runs dry: a heart, a tow, a full battery at the checkpoint
  await page.evaluate(() => window.__mr.speed(3));
  await page.evaluate(() => window.__mr.battery(0.003));
  await page.keyboard.down('ArrowUp');
  const empty = await until(page, () => window.__mr.state().rover.state === 'empty', null, 15000);
  await page.keyboard.up('ArrowUp');
  check('an empty battery stops the rover', empty);
  const towed = await until(page, (hp) => { const r = window.__mr.state().rover; return r.hp < hp && r.state === 'drive'; }, hp0, 30000);
  s = await state(page);
  const cp = s.checkpoint;
  check('then it costs a heart (two halves on Normal) and a tow', towed && s.rover.hp === hp0 - 2, `hp ${hp0} → ${s.rover.hp}`);
  check('back at the checkpoint with a full battery', Math.hypot(s.rover.x - cp.x, s.rover.z - cp.z) < 2 && s.rover.battery >= s.rover.bmax * 0.95, `rover (${s.rover.x.toFixed(1)}, ${s.rover.z.toFixed(1)}) checkpoint (${cp.x.toFixed(1)}, ${cp.z.toFixed(1)}) battery ${Math.round(s.rover.battery)}`);

  // the autopilot clears 1-1; NEXT the moment the card shows
  await page.evaluate(() => { window.__mr.god(); window.__mr.auto(); window.__mr.speed(5); });
  const cleared = await until(page, () => window.__mr.state().phase === 'summary', null, 240000);
  s = await state(page);
  check('the autopilot clears 1-1 → the mission card', cleared, `phase ${s.phase}, unlocked ${s.unlocked}, score ${score0} → ${s.score}, credits ${s.credits}`);
  check('mission 1-2 opens and the score grows', s.unlocked >= 2 && s.score > score0);
  await page.keyboard.press('Enter');
  const inShop = await until(page, () => window.__mr.state().phase === 'shop', null, 10000);
  await page.waitForTimeout(1500);
  const alive = await page.evaluate(() => { const a = window.__mr.state().perf.frames; return new Promise((r) => setTimeout(() => r(window.__mr.state().perf.frames > a || window.__ayvago.game.loop.frame > 0), 600)); });
  check('a quick NEXT on the card opens the hangar and the game goes on', inShop && alive && errors.length === 0, errors.slice(0, 2).join(' | '));
  await shot(page, 'hangar');
  await page.evaluate(() => window.__mr.meta({ credits: 800 }));
  await page.evaluate(() => window.__mr.open('shop'));
  await page.waitForTimeout(500);
  const before = await state(page);
  // up from CONTINUE until a BUY button has focus, then Enter
  let after = before;
  for (let i = 0; i < 8 && after.credits === before.credits; i++) {
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    after = await state(page);
    if (after.phase !== 'shop') break;
  }
  const ranked = Object.keys(after.ranks).filter((k) => after.ranks[k] > before.ranks[k]);
  check('a hangar purchase spends credits and adds a rank', after.credits < before.credits && ranked.length === 1, `credits ${before.credits} → ${after.credits}, rank up: ${ranked.join(', ')}`);

  // back to the map; the miner set-piece: the autopilot shuts a generator down
  await page.keyboard.press('Escape');
  const back = await until(page, () => window.__mr.state().phase === 'map', null, 10000);
  check('leaving the hangar returns to the map', back);
  await page.evaluate(() => window.__mr.meta({ unlocked: 5 }));
  await page.evaluate(() => window.__mr.start(5));
  await until(page, () => window.__mr.state().phase === 'play', null, 40000);
  s = await state(page);
  check('the map plays the set-piece, 1-5', s.level === 5 && !!s.miner, `level ${s.level}`);
  await page.evaluate(() => { window.__mr.god(); window.__mr.auto(); window.__mr.speed(4); });
  const gen = await until(page, () => window.__mr.state().stats.generators > 0, null, 240000);
  check('the autopilot shuts down a generator', gen);
  await shot(page, 'miner');
  const scoreRun = (await state(page)).score;
  await page.evaluate(() => { window.__mr.auto(false); window.__mr.god(false); window.__mr.speed(1); });
  for (let i = 0; i < 8; i++) {
    const st = await state(page);
    if (st.phase !== 'play' || st.rover.hp <= 0) break;
    await page.evaluate(() => window.__mr.hurt(2));
    await page.waitForTimeout(250);
  }
  const over = await until(page, () => window.__ayvago.game.scene.isActive('GameOver'), null, 20000);
  check('losing every heart ends the run on the result screen', over);
  await page.waitForTimeout(1500);
  await shot(page, 'result');
  check('the run kept its score to the end', scoreRun > 0, `score ${scoreRun}`);
  await page.context().close();

  // Easy against Normal
  const easy = await open('easy');
  await easy.keyboard.press('Enter');
  await until(easy, () => window.__mr?.state().phase === 'map', null, 20000);
  await easy.waitForTimeout(400);
  await easy.evaluate(() => window.__mr.start(1));
  await until(easy, () => window.__mr.state().phase === 'play', null, 40000);
  const e = await state(easy);
  check('Easy: more hearts and battery, slower meteors and bolts', e.rover.max > hp0 && e.rover.bmax > 100 && e.tune.bolt < 8 && e.tune.warn > 1.7, `hearts ${e.rover.max / 2} vs ${hp0 / 2}, battery ${e.rover.bmax}, bolt ${e.tune.bolt}, warn ${e.tune.warn}`);
  await easy.context().close();
} catch (err) {
  check('playthrough ran to the end', false, err.message);
}

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : `all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
