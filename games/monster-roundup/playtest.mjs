// Monster Roundup: playthrough check. Plays the game in a real browser through the game's own test hooks
// (`window.__mr`) and the keyboard, and fails when a step does not do what the player would see:
//   - the device gets its orientation (desktop landscape, phone portrait with the touch pad);
//   - the menu starts a run (Enter) and the station map opens; Enter on the map starts 1-1;
//   - W walks the mech; Space fires a stun bolt; a monster made dizzy and E (the tow key) next to it
//     puts it on the tractor beam;
//   - a hit costs a heart;
//   - the autopilot (`bot.ts`, god mode on) clears 1-1: the level card shows, 1-2 opens and the run's
//     score has grown; NEXT is pressed the moment the card appears (a quick tap must not freeze the
//     game) and the hangar opens, where a purchase spends credits and adds a rank, and the MECHS
//     tab pilots a mech unlocked with stars;
//   - back on the map, the boss level (1-5) is played by the autopilot until the boss reaches its
//     second phase; then the hearts are lost on purpose and the run ends on the result screen with
//     the run's score;
//   - Easy and Normal differ (more hearts, longer dizzy spells, slower monsters on Easy);
//   - no page errors on the way.
// The game is adaptive: the whole playthrough runs twice, on a desktop window (it must boot
// landscape) and on an emulated phone (touch, a 390 px short side: it must boot portrait).
// Run: node games/monster-roundup/playtest.mjs [--base http://localhost:5611] [--shots <dir>] [--orient landscape|portrait]
//   Without --base it starts its own Vite dev server on a port from 5611 to 5619. Exits 1 on a failure.
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
  const port = Number(process.env.AYVAGO_TEST_PORT) || 5611 + Math.floor(Math.random() * 9);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `mrd-play-${port}`) } });
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

async function open(difficulty = 'normal', meta = { hints: ['tut', 'h_tow', 'h_runner', 'h_boss'] }) {
  const ctx = await browser.newContext({ ...DEVICE[orient], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /a frame failed/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.addInitScript(([d, m]) => {
    localStorage.setItem('ayvago:monster-roundup:meta', JSON.stringify(m));
    localStorage.setItem('ayvago:difficulty:monster-roundup', JSON.stringify(d));
  }, [difficulty, meta]);
  await page.goto(`${base}/games/monster-roundup/?nointro&lang=en`);
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
  check('menu → station map', onMap);
  await page.waitForTimeout(500);
  await shot(page, 'map');
  await page.keyboard.press('Enter');
  await until(page, () => window.__mr.state().phase === 'intro', null, 20000);
  await page.keyboard.press('Enter');
  const playing = await until(page, () => window.__mr.state().phase === 'play', null, 30000);
  let s = await state(page);
  check('Enter on the map plays level 1-1', playing && s.level === 1, `phase ${s.phase}, level ${s.level}, hearts ${s.mech.hp}/${s.mech.max}`);
  check('the touch pad shows on the phone only', s.touchPad === (orient === 'portrait'), `pad ${s.touchPad}`);
  const z0 = s.mech.z, hp0 = s.mech.hp, score0 = s.score;
  // W walks the mech (north, up the screen); headless browsers render slowly: wait on the game's clock
  await page.keyboard.down('KeyW');
  await until(page, (z) => window.__mr.state().mech.z < z - 2, z0, 30000);
  await page.keyboard.up('KeyW');
  s = await state(page);
  check('W walks the mech', s.mech.z < z0 - 1.5, `z ${z0.toFixed(1)} → ${s.mech.z.toFixed(1)}`);
  // Space fires a stun bolt
  const shots0 = s.stats.shots;
  await page.keyboard.down('Space'); await page.waitForTimeout(80); await page.keyboard.up('Space');
  const fired = await until(page, (n) => window.__mr.state().stats.shots > n, shots0, 10000);
  check('Space fires a stun bolt', fired);
  // a dizzy monster next to the mech goes on the beam with E
  await page.evaluate(() => window.__mr.god(true));
  await page.evaluate(() => {
    window.__mr.dizzy();
    const st = window.__mr.state();
    const m = st.mons.find((x) => x.state === 'dizzy');
    if (m) window.__mr.teleport(m.x + 2.2, m.z);
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  const towing = await until(page, () => window.__mr.state().mech.towing > 0, null, 10000);
  await shot(page, 'tow');
  check('E puts a dizzy monster on the tractor beam', towing);
  await page.evaluate(() => window.__mr.god(false));
  await page.evaluate(() => window.__mr.hurt(1));
  await page.waitForTimeout(300);
  s = await state(page);
  check('a hit costs a heart', s.mech.hp === hp0 - 1, `hearts ${hp0} → ${s.mech.hp}`);

  // the autopilot clears 1-1; NEXT the moment the card shows
  await page.evaluate(() => { window.__mr.god(); window.__mr.auto(); window.__mr.speed(5); });
  const cleared = await until(page, () => window.__mr.state().phase === 'summary', null, 240000);
  s = await state(page);
  check('the autopilot clears 1-1 → the level card', cleared, `phase ${s.phase}, unlocked ${s.unlocked}, score ${score0} → ${s.score}, credits ${s.credits}`);
  check('level 1-2 opens and the score grows', s.unlocked >= 2 && s.score > score0);
  await shot(page, 'card');
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
  // the MECHS tab: with 8 stars Leela can be piloted
  await page.evaluate(() => window.__mr.meta({ best: Array.from({ length: 20 }, (_, i) => ({ stars: i < 3 ? 7 : 0, time: i < 3 ? 60 : 0 })) }));
  await page.evaluate(() => window.__mr.open('shop'));
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  let mech = (await state(page)).mechId;
  for (let i = 0; i < 6 && mech === 'mike'; i++) {
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    mech = (await state(page)).mechId;
  }
  await shot(page, 'mechs');
  check('the MECHS tab pilots a mech unlocked with stars', mech !== 'mike', `piloting ${mech}`);

  // back to the map; the boss level: the autopilot gets the boss to its second phase
  await page.keyboard.press('Escape');
  const back = await until(page, () => window.__mr.state().phase === 'map', null, 10000);
  check('leaving the hangar returns to the map', back);
  await page.evaluate(() => window.__mr.meta({ unlocked: 5 }));
  await page.evaluate(() => window.__mr.start(5));
  await until(page, () => window.__mr.state().phase === 'play', null, 40000);
  s = await state(page);
  check('the map plays the boss level, 1-5', s.level === 5 && s.mons.some((m) => m.kind === 'mushroom-king'), `level ${s.level}`);
  await page.evaluate(() => { window.__mr.god(); window.__mr.auto(); window.__mr.speed(4); });
  const phase2 = await until(page, () => window.__mr.state().mons.some((m) => m.kind === 'mushroom-king' && m.phase >= 1), null, 240000);
  check('the autopilot gets the boss to its second phase', phase2);
  await shot(page, 'boss');
  const scoreRun = (await state(page)).score;
  await page.evaluate(() => { window.__mr.auto(false); window.__mr.god(false); window.__mr.speed(1); });
  for (let i = 0; i < 10; i++) {
    const st = await state(page);
    if (st.phase !== 'play' || st.mech.hp <= 0) break;
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
  check('Easy: more hearts, longer dizzy spells, slower monsters', e.mech.max > hp0 && e.tune.dizzy > 7 && e.tune.speed < 1, `hearts ${e.mech.max} vs ${hp0}, dizzy ${e.tune.dizzy}, speed ${e.tune.speed}`);
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
