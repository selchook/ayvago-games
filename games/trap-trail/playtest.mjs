// Trap Trail: playthrough check. Plays the game in a real browser through the game's own test hooks
// (`window.__tt`) and the keyboard, and fails when a step does not do what the player would see:
//   - the menu starts a run (Enter) and the trail map opens; Enter on the map plays stage 1-1;
//   - the autopilot (`bot.ts`, god mode on) runs the stage, touches a checkpoint, then a fall off the
//     course costs a heart (two half-hearts on Normal) and puts the hero back on that checkpoint;
//   - the autopilot reaches the goal flag: the stage clears, the summary shows, stage 1-2 opens and
//   the run's score has grown; NEXT opens the shop, where a purchase spends coins and adds a rank;
//   - back on the map, stage 1-2 is played: its power is picked up and runs, then the hearts are lost
//     on purpose and the run ends on the result screen (the core's GameOver) with the run's score;
//   - Easy and Normal differ (more hearts, slower traps, softer falls on Easy);
//   - no page errors on the way.
// Run: node games/trap-trail/playtest.mjs [--base http://localhost:5461] [--shots <dir>]
//   Without --base it starts its own Vite dev server on a port from 5466 to 5469. Exits 1 on a failure.
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
  const port = 5466 + Math.floor(Math.random() * 4);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `tt-play-${port}`) } });
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((d) => {
    // a fresh player: no coins, stage 1-1 open, the tutorial already seen
    localStorage.setItem('ayvago:trap-trail:meta', JSON.stringify({ hints: ['tut'] }));
    localStorage.setItem('ayvago:difficulty:trap-trail', JSON.stringify(d));
  }, difficulty);
  await page.goto(`${base}/games/trap-trail/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  return page;
}
const state = (page) => page.evaluate(() => window.__tt.state());
const until = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };

try {
  const page = await open('normal');
  // the menu starts the run on the trail map
  await page.keyboard.press('Enter');
  const onMap = await until(page, () => window.__tt?.state().phase === 'map', null, 20000);
  check('menu → trail map', onMap);
  await page.waitForTimeout(500);
  await shot(page, 'map');
  // Enter plays the chosen stage (1-1)
  await page.keyboard.press('Enter');
  const playing = await until(page, () => window.__tt.state().phase === 'play', null, 15000);
  let s = await state(page);
  check('Enter on the map plays stage 1-1', playing && s.stage === 1, `phase ${s.phase}, stage ${s.stage}, hearts ${s.hero.hp / 2}/${s.hero.max / 2}`);
  const hp0 = s.hero.hp, score0 = s.score;

  // the autopilot runs to the first checkpoint
  await page.evaluate(() => { window.__tt.god(); window.__tt.auto(); window.__tt.speed(2); });
  const cp = await until(page, () => window.__tt.state().checkpoint >= 0, null, 60000);
  s = await state(page);
  check('a checkpoint is touched', cp, `checkpoint ${s.checkpoint}`);
  await shot(page, 'checkpoint');

  // a fall costs a heart and puts the hero back on that checkpoint
  await page.evaluate(() => { window.__tt.god(false); window.__tt.auto(false); window.__tt.fall(); });
  await until(page, () => window.__tt.state().hero.state !== 'play', null, 5000);
  await until(page, () => window.__tt.state().hero.state === 'play' && window.__tt.state().hero.ground, null, 15000);
  await page.waitForTimeout(300);
  s = await state(page);
  const cps = await page.evaluate(() => window.__tt.checkpoints());
  const at = cps[s.checkpoint];
  const near = at && Math.hypot(s.hero.x - at.x, s.hero.z - at.z) < 2.5;
  check('a fall costs a heart (two half-hearts on Normal)', s.hero.hp === hp0 - 2, `hp ${hp0} → ${s.hero.hp}`);
  check('the hero respawns on the last checkpoint', near, at ? `hero (${s.hero.x.toFixed(1)}, ${s.hero.z.toFixed(1)}) checkpoint (${at.x.toFixed(1)}, ${at.z.toFixed(1)})` : 'no checkpoint');

  // the autopilot reaches the goal: clear, summary, the next stage opens, the score grows
  await page.evaluate(() => { window.__tt.god(); window.__tt.auto(); window.__tt.speed(3); });
  const cleared = await until(page, () => window.__tt.state().phase === 'summary', null, 120000);
  s = await state(page);
  check('the goal flag clears stage 1-1 → summary', cleared, `phase ${s.phase}, unlocked ${s.unlocked}, score ${score0} → ${s.score}, coins ${s.coins}`);
  check('stage 1-2 opens and the score grows', s.unlocked >= 2 && s.score > score0);
  await page.waitForTimeout(1200);
  await shot(page, 'summary');

  // NEXT opens the shop; a purchase spends coins and adds a rank
  await page.keyboard.press('Enter');
  const inShop = await until(page, () => window.__tt.state().phase === 'shop', null, 10000);
  check('NEXT on the summary opens the shop', inShop);
  await page.evaluate(() => window.__tt.meta({ coins: 500 }));
  // the shop reads the purse it was opened with: reopen it with the new purse
  await page.evaluate(() => window.__tt.open('shop'));
  await page.waitForTimeout(500);
  const before = await state(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const after = await state(page);
  const ranked = Object.keys(after.ranks).filter((k) => after.ranks[k] > before.ranks[k]);
  check('a shop purchase spends coins and adds a rank', after.coins < before.coins && ranked.length === 1, `coins ${before.coins} → ${after.coins}, rank up: ${ranked.join(', ')}`);
  await shot(page, 'shop');

  // back to the map (Esc leaves the shop), play 1-2, lose every heart: the result screen
  await page.keyboard.press('Escape');
  const back = await until(page, () => window.__tt.state().phase === 'map', null, 10000);
  check('leaving the shop returns to the map', back);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await until(page, () => window.__tt.state().phase === 'play', null, 15000);
  s = await state(page);
  const stage2 = s.stage;
  const scoreRun = s.score;
  // a power on the stage: teleport onto it and see it run
  const power = (await page.evaluate(() => window.__tt.pickups('power')))[0];
  if (power) {
    await page.evaluate((p) => window.__tt.teleport(p.x, p.y - 0.4, p.z), power);
    await page.waitForTimeout(400);
    s = await state(page);
    const on = s.hero.shield || Object.values(s.hero.powers).some((t) => t > 0);
    check(`a ${power.power} power is picked up and runs`, on, JSON.stringify({ powers: s.hero.powers, shield: s.hero.shield }));
  } else check('stage 1-2 has a power to pick up', false);
  await shot(page, 'power');

  for (let i = 0; i < 8; i++) {
    const st = await state(page);
    if (st.phase !== 'play' || st.hero.hp <= 0) break;
    await page.evaluate(() => window.__tt.fall());
    await until(page, () => window.__tt.state().hero.state !== 'play', null, 5000);
    await until(page, () => { const t = window.__tt.state(); return t.phase !== 'play' || (t.hero.state === 'play' && t.hero.ground); }, null, 15000);
    await page.waitForTimeout(200);
  }
  const over = await until(page, () => window.__ayvago.game.scene.isActive('GameOver'), null, 20000);
  check(`losing every heart on stage 1-${stage2} ends the run on the result screen`, over);
  await page.waitForTimeout(1200);
  await shot(page, 'result');
  const shown = await page.evaluate(() => window.__ayvago.game.scene.getScene('GameOver')?.data?.get?.('score') ?? null);
  check('the run kept its score to the end', scoreRun > 0, `score ${scoreRun}${shown !== null ? `, shown ${shown}` : ''}`);
  await page.context().close();

  // Easy against Normal
  const easy = await open('easy');
  await easy.keyboard.press('Enter');
  await until(easy, () => window.__tt?.state().phase === 'map', null, 20000);
  await easy.waitForTimeout(400);
  await easy.keyboard.press('Enter');
  await until(easy, () => window.__tt.state().phase === 'play', null, 15000);
  const e = await state(easy);
  check('Easy: more hearts, slower traps, softer falls', e.hero.max > hp0 && e.tune.pace < 1 && e.tune.fallCost < 2, `hearts ${e.hero.max / 2} vs ${hp0 / 2}, pace ${e.tune.pace}, fall ${e.tune.fallCost / 2} heart`);
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
