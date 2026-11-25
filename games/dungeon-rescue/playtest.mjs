// Dungeon Rescue: playthrough check. Plays the game in a real browser through the game's own test hooks
// (`window.__dr`) and the keyboard, and fails when a step does not do what the player would see:
//   - the menu starts a run (Enter) and the level map opens; Enter on the map plays level 1-1;
//   - a guard catches the knight: it costs a heart and the knight is back at the last campfire;
//   - the autopilot (`bot.ts`, god mode on) frees the prisoner and leads him out: the level clears,
//     the level-clear card shows, level 1-2 opens and the run's score has grown;
//   - the card's NEXT returns to the map; H opens the hideout, where a shop purchase spends coins
//     and adds a rank, and a freed kind is taken along as a companion;
//   - the wing's last level: the autopilot outwits the Jailer Chief (the alarm rings) and gets the
//     crowd out; the card counts the Chief;
//   - every heart lost ends the run on the result screen (the core's GameOver) with its score;
//   - Easy and Normal differ (more hearts, slower notice, slower guards, a longer alarm on Easy);
//   - no page errors on the way.
// The completability of every level is checked headless by balance.ts (all twenty, Normal and Easy).
// The game is adaptive: the whole playthrough runs twice, on a desktop window (it must boot
// landscape) and on an emulated phone (touch, a 390 px short side: it must boot portrait).
// Run: node games/dungeon-rescue/playtest.mjs [--base http://localhost:5501] [--shots <dir>] [--orient landscape|portrait]
//   Without --base it starts its own Vite dev server on a port from 5501 to 5509. Exits 1 on a failure.
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
/** The browser context of each run: a desktop window, or a phone (touch, no hover, a short screen). */
const DEVICE = {
  landscape: { viewport: { width: 1280, height: 720 } },
  portrait: { viewport: { width: 720, height: 1280 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
let orient = ORIENTS[0];
if (shots) mkdirSync(shots, { recursive: true });

let server = null;
if (!base) {
  const port = 5501 + Math.floor(Math.random() * 9);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `dr-play-${port}`) } });
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
  await page.addInitScript((d) => {
    // a fresh player: no coins, level 1-1 open, the tutorial and the first hints already seen
    localStorage.setItem('ayvago:dungeon-rescue:meta', JSON.stringify({ hints: ['tut', 'h_cone', 'h_pick', 'h_boss1'] }));
    localStorage.setItem('ayvago:difficulty:dungeon-rescue', JSON.stringify(d));
  }, difficulty);
  await page.goto(`${base}/games/dungeon-rescue/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  return page;
}
const state = (page) => page.evaluate(() => window.__dr.state());
const until = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `${orient}-${name}.png`) }); };
/** Starts level n from the hooks and skips its intro sweep. */
async function play(page, n) {
  await page.evaluate((k) => window.__dr.start(k), n);
  await until(page, () => window.__dr.state().phase === 'intro', null, 40000);
  await page.evaluate(() => window.__dr.skipIntro());
  return until(page, () => window.__dr.state().phase === 'play', null, 20000);
}

for (orient of ORIENTS) try {
  const page = await open('normal');
  const got = await page.evaluate(() => [window.__ayvago.orientation, window.__ayvago.game.scale.width, window.__ayvago.game.scale.height]);
  check(`the device gets ${orient}`, got[0] === orient, got.join(' '));
  await page.keyboard.press('Enter');
  const onMap = await until(page, () => window.__dr?.state().phase === 'map', null, 20000);
  check('menu → level map', onMap);
  await page.waitForTimeout(500);
  await shot(page, 'map');
  await page.keyboard.press('Enter');
  // the intro sweep (from the exit down to the knight) can be skipped with Enter
  await until(page, () => window.__dr.state().phase === 'intro', null, 40000);
  await page.keyboard.press('Enter');
  const playing = await until(page, () => window.__dr.state().phase === 'play', null, 30000);
  let s = await state(page);
  check('Enter on the map plays level 1-1', playing && s.level === 1, `phase ${s.phase}, level ${s.level}, hearts ${s.hero.hp}/${s.hero.max}, look ${s.look}`);
  const hp0 = s.hero.hp, score0 = s.score, start = s.start;

  // a guard catches the knight: a heart, then back at the campfire (the game sped up: a software
  // renderer draws only a few frames a second)
  await page.evaluate(() => { window.__dr.speed(6); window.__dr.teleport(4, 4); window.__dr.caught(); });
  const back = await until(page, (hp) => { const st = window.__dr.state(); return st.hero.hp < hp && st.hero.state === 'play'; }, hp0, 60000);
  s = await state(page);
  const atStart = Math.abs(s.hero.x / 2 - start[0]) + Math.abs(s.hero.z / 2 - start[1]) <= 1.5;
  check('being caught costs a heart and returns the knight to the campfire', back && s.hero.hp === hp0 - 1 && atStart, `hp ${hp0} → ${s.hero.hp}, knight (${(s.hero.x / 2).toFixed(1)}, ${(s.hero.z / 2).toFixed(1)}), start ${JSON.stringify(start)}`);

  // the autopilot frees the prisoner and leads him out
  await page.evaluate(() => { window.__dr.god(); window.__dr.auto(); window.__dr.speed(4); });
  const freed = await until(page, () => window.__dr.state().followers.some((m) => m !== 'cell'), null, 180000);
  check('the autopilot opens the cell and the prisoner follows', freed);
  await shot(page, 'follow');
  const cleared = await until(page, () => window.__dr.state().phase === 'summary', null, 180000);
  s = await state(page);
  check('leading him to the stairs clears 1-1 → the level-clear card', cleared && s.stats.rescued === s.stats.total, `phase ${s.phase}, rescued ${s.stats?.rescued}/${s.stats?.total}, unlocked ${s.unlocked}, score ${score0} → ${s.score}, coins ${s.coins}`);
  check('level 1-2 opens and the score grows', s.unlocked >= 2 && s.score > score0);
  await page.waitForTimeout(1400);
  await shot(page, 'summary');

  // NEXT returns to the map; H opens the hideout; a purchase spends coins and adds a rank
  await page.keyboard.press('Enter');
  const mapAgain = await until(page, () => window.__dr.state().phase === 'map', null, 10000);
  check('NEXT on the card returns to the map', mapAgain);
  await page.evaluate(() => window.__dr.meta({ coins: 2000, crew: ['casual', 'chef', 'doctor'], companions: [] }));
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyH');
  const inHide = await until(page, () => window.__dr.state().phase === 'hideout', null, 10000);
  check('H on the map opens the hideout', inHide);
  await page.waitForTimeout(600);
  let before = await state(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  let after = await state(page);
  check('a freed kind is taken along as a companion', after.companions.length === before.companions.length + 1, `companions ${JSON.stringify(before.companions)} → ${JSON.stringify(after.companions)}`);
  await shot(page, 'crew');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(500);
  before = await state(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  after = await state(page);
  const ranked = Object.keys(after.ranks).filter((k) => after.ranks[k] > before.ranks[k]);
  check('a shop purchase spends coins and adds a rank', after.coins < before.coins && ranked.length === 1, `coins ${before.coins} → ${after.coins}, rank up: ${ranked.join(', ')}`);
  await shot(page, 'shop');
  await page.keyboard.press('Escape');
  const mapBack = await until(page, () => window.__dr.state().phase === 'map', null, 10000);
  check('leaving the hideout returns to the map', mapBack);

  // the wing's last level: the Jailer Chief is outwitted and the alarm rings
  await page.evaluate(() => window.__dr.meta({ unlocked: 5 }));
  check('the Cellblock Alarm (1-5) starts with the Jailer Chief', await play(page, 5));
  s = await state(page);
  const chiefThere = s.guards.some((g) => g.k === 'chief');
  check('the Chief stands among the guards', chiefThere, s.guards.map((g) => g.k).join(' '));
  await page.evaluate(() => { window.__dr.god(); window.__dr.auto(); window.__dr.speed(8); });
  const outwit = await until(page, () => { const st = window.__dr.state(); return st.stats.outwit && st.alarm; }, null, 480000);
  check('the autopilot lifts his key ring: Chief outwitted, the alarm rings', outwit);
  await page.waitForTimeout(500);
  await shot(page, 'alarm');
  const out = await until(page, () => window.__dr.state().phase === 'summary', null, 480000);
  s = await state(page);
  check('the crowd gets out before the gates shut', out, `phase ${s.phase}, rescued ${s.stats?.rescued}/${s.stats?.total}`);
  await page.waitForTimeout(1200);
  await shot(page, 'chief-card');

  // every heart lost ends the run on the result screen
  await page.keyboard.press('Enter');
  await until(page, () => window.__dr.state().phase === 'map', null, 10000);
  await play(page, 2);
  const scoreRun = (await state(page)).score;
  await page.evaluate(() => window.__dr.speed(6));
  for (let i = 0; i < 120; i++) {
    const st = await state(page);
    if (st.phase !== 'play' || st.hero.hp <= 0) break;
    if (st.hero.state === 'play') await page.evaluate(() => window.__dr.caught());
    await page.waitForTimeout(300);
  }
  const over = await until(page, () => window.__ayvago.game.scene.isActive('GameOver'), null, 30000);
  check('losing every heart ends the run on the result screen', over);
  await page.waitForTimeout(1500);
  await shot(page, 'result');
  check('the run kept its score to the end', scoreRun > 0, `score ${scoreRun}`);
  await page.context().close();

  // Easy against Normal
  const easy = await open('easy');
  await easy.keyboard.press('Enter');
  await until(easy, () => window.__dr?.state().phase === 'map', null, 20000);
  await easy.waitForTimeout(400);
  await play(easy, 1);
  const e = await state(easy);
  check('Easy: more hearts, slower notice, slower guards, a longer alarm', e.hero.max > hp0 && e.tune.susp < 1 && e.tune.pace < 1 && e.tune.alarm > 80, `hearts ${e.hero.max} vs ${hp0}, notice ${e.tune.susp}, pace ${e.tune.pace}, alarm ${e.tune.alarm}`);
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
