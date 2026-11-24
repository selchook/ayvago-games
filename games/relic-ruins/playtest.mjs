// Relic Ruins: playthrough check. Plays the game in a real browser through the game's own test hooks
// (`window.__rr`) and the keyboard, and fails when a step does not do what the player would see:
//   - the menu starts a run (Enter) and the ruin map opens; Enter on the map plays ruin 1-1;
//   - the torch is let burn out: the hero gets a few seconds of grace, then loses a heart (two
//     half-hearts on Normal) and wakes beside the last brazier with a full torch;
//   - the autopilot (`bot.ts`, god mode on) takes the relic and walks out: the ruin clears, the
//     level-clear card shows, ruin 1-2 opens and the run's score has grown; NEXT opens the camp,
//     where a purchase spends coins and adds a rank;
//   - back on the map, ruin 1-2 is played by the autopilot until a crate on a plate opens a door;
//     then the hearts are lost on purpose and the run ends on the result screen (the core's
//     GameOver) with the run's score;
//   - Easy and Normal differ (more hearts, a slower torch, slower creatures on Easy);
//   - no page errors on the way.
// Run: node games/relic-ruins/playtest.mjs [--base http://localhost:5471] [--shots <dir>]
//   Without --base it starts its own Vite dev server on a port from 5476 to 5479. Exits 1 on a failure.
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
if (shots) mkdirSync(shots, { recursive: true });

let server = null;
if (!base) {
  const port = 5476 + Math.floor(Math.random() * 4);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `rr-play-${port}`) } });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail}`); };
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(difficulty = 'normal') {
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((d) => {
    // a fresh player: no coins, ruin 1-1 open, the tutorial and the hints already seen
    localStorage.setItem('ayvago:relic-ruins:meta', JSON.stringify({ hints: ['tut', 'h_torch', 'h_push'] }));
    localStorage.setItem('ayvago:difficulty:relic-ruins', JSON.stringify(d));
  }, difficulty);
  await page.goto(`${base}/games/relic-ruins/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  return page;
}
const state = (page) => page.evaluate(() => window.__rr.state());
const until = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };

try {
  const page = await open('normal');
  await page.keyboard.press('Enter');
  const onMap = await until(page, () => window.__rr?.state().phase === 'map', null, 20000);
  check('menu → ruin map', onMap);
  await page.waitForTimeout(500);
  await shot(page, 'map');
  await page.keyboard.press('Enter');
  // the intro sweep (from the relic down to the hero) can be skipped with Enter
  await until(page, () => window.__rr.state().phase === 'intro', null, 20000);
  await page.keyboard.press('Enter');
  const playing = await until(page, () => window.__rr.state().phase === 'play', null, 30000);
  let s = await state(page);
  check('Enter on the map plays ruin 1-1', playing && s.level === 1, `phase ${s.phase}, level ${s.level}, hearts ${s.hero.hp / 2}/${s.hero.max / 2}`);
  const hp0 = s.hero.hp, score0 = s.score;
  await page.evaluate(() => window.__rr.speed(4));

  // the torch burns out: grace, then a heart, then back at the brazier with a full torch
  await page.evaluate(() => { window.__rr.teleport(4, 9); window.__rr.torch(0.002); });
  const dark = await until(page, () => window.__rr.state().hero.dark >= 0, null, 10000);
  check('an empty torch gives a few seconds of grace', dark);
  await shot(page, 'dark');
  const woke = await until(page, (hp) => window.__rr.state().hero.hp < hp, hp0, 90000);
  await page.waitForTimeout(400);
  s = await state(page);
  const near = s.cpCell && Math.abs(Math.round(s.hero.x / 2) - s.cpCell[0]) + Math.abs(Math.round(s.hero.z / 2) - s.cpCell[1]) <= 1;
  check('then it costs a heart (two half-hearts on Normal)', woke && s.hero.hp === hp0 - 2, `hp ${hp0} → ${s.hero.hp}`);
  check('and the hero wakes beside the last brazier with a full torch', near && s.hero.torch >= s.hero.tmax * 0.95, `hero (${(s.hero.x / 2).toFixed(1)}, ${(s.hero.z / 2).toFixed(1)}) brazier ${JSON.stringify(s.cpCell)} torch ${Math.round(s.hero.torch)}`);

  // the autopilot takes the relic and walks out
  await page.evaluate(() => { window.__rr.god(); window.__rr.auto(); window.__rr.speed(5); });
  const relic = await until(page, () => window.__rr.state().hero.relic, null, 240000);
  check('the autopilot opens the relic', relic);
  await shot(page, 'relic');
  const cleared = await until(page, () => window.__rr.state().phase === 'summary', null, 240000);
  s = await state(page);
  check('walking out with the relic clears 1-1 → the level-clear card', cleared, `phase ${s.phase}, unlocked ${s.unlocked}, score ${score0} → ${s.score}, coins ${s.coins}`);
  check('ruin 1-2 opens and the score grows', s.unlocked >= 2 && s.score > score0);
  await page.waitForTimeout(1400);
  await shot(page, 'summary');

  // NEXT opens the camp; a purchase spends coins and adds a rank
  await page.keyboard.press('Enter');
  const inShop = await until(page, () => window.__rr.state().phase === 'shop', null, 10000);
  check('NEXT on the card opens the camp', inShop);
  await page.evaluate(() => window.__rr.meta({ coins: 500 }));
  await page.evaluate(() => window.__rr.open('shop'));
  await page.waitForTimeout(500);
  const before = await state(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const after = await state(page);
  const ranked = Object.keys(after.ranks).filter((k) => after.ranks[k] > before.ranks[k]);
  check('a camp purchase spends coins and adds a rank', after.coins < before.coins && ranked.length === 1, `coins ${before.coins} → ${after.coins}, rank up: ${ranked.join(', ')}`);
  await shot(page, 'shop');

  // back to the map, play 1-2: a crate on a plate opens a door
  await page.keyboard.press('Escape');
  const back = await until(page, () => window.__rr.state().phase === 'map', null, 10000);
  check('leaving the camp returns to the map', back);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await until(page, () => window.__rr.state().phase === 'play', null, 40000);
  s = await state(page);
  const open0 = s.open;
  check('the map plays the next ruin, 1-2', s.level === 2, `level ${s.level}`);
  await page.evaluate(() => { window.__rr.god(); window.__rr.auto(); window.__rr.speed(5); });
  const opened = await until(page, (o) => window.__rr.state().open > o, open0, 240000);
  check('a crate pushed onto a plate opens a door', opened);
  await shot(page, 'door');
  const scoreRun = (await state(page)).score;
  await page.evaluate(() => { window.__rr.auto(false); window.__rr.god(false); window.__rr.speed(1); });
  for (let i = 0; i < 8; i++) {
    const st = await state(page);
    if (st.phase !== 'play' || st.hero.hp <= 0) break;
    await page.evaluate(() => window.__rr.hurt(2));
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
  await until(easy, () => window.__rr?.state().phase === 'map', null, 20000);
  await easy.waitForTimeout(400);
  await easy.keyboard.press('Enter');
  await until(easy, () => window.__rr.state().phase === 'play', null, 40000);
  const e = await state(easy);
  check('Easy: more hearts, a slower torch, slower creatures', e.hero.max > hp0 && e.tune.burn < 1.55 && e.tune.pace < 1, `hearts ${e.hero.max / 2} vs ${hp0 / 2}, burn ${e.tune.burn}, pace ${e.tune.pace}`);
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
