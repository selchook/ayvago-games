// Automated QA for every game (or the ones passed as args):
//   intro shown -> skip -> Menu -> Play -> 8s of random input -> forced game over -> retry.
// Fails on page errors, console errors, failed asset requests, blank canvas or stuck flow.
// Usage: npm run build && node scripts/smoke-test.mjs [--thumbs] [slug ...]
//        node scripts/smoke-test.mjs --dev [slug ...]   (no build needed; uses the Vite dev server)
//   --thumbs   also writes public/thumbs/<slug>.png (menu screenshot) for the portal.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { availableParallelism, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const thumbs = args.includes('--thumbs');
const dev = args.includes('--dev');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = (only.length ? only : readdirSync(join(root, 'games')))
  .filter((s) => existsSync(dev ? join(root, 'games', s, 'index.html') : join(root, 'dist', 'games', s, 'index.html')));
if (!slugs.length) { console.error('nothing to test — run npm run build first (or pass --dev)'); process.exit(1); }

const PORT = 4300 + Math.floor(Math.random() * 500);
const server = spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });
const stopServer = () => { try { process.kill(-server.pid); } catch { server.kill(); } };
const BASE = `http://localhost:${PORT}`;

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];

/** True when every error of a failed run is a flow step timeout. */
function retryable(r) {
  return r.errors.length > 0 && r.errors.every((e) => e.startsWith('flow: ') && /Timeout \d+ms exceeded/.test(e));
}

function report(r, note = '') {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.slug}${note}${r.ok ? '' : '\n      ' + JSON.stringify(r.step) + '\n      ' + r.errors.join('\n      ')}`);
  // GitHub Actions: one annotation per failing game, readable without the full job log.
  if (!r.ok && process.env.GITHUB_ACTIONS) {
    console.log(`::error title=smoke ${r.slug}::${JSON.stringify(r.step)} ${r.errors.join(' / ').replace(/\r?\n/g, ' ')}`);
  }
}

async function testGame(slug) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const scenes = () => page.evaluate(() => window.__ayvago?.game.scene.getScenes(true).map((s) => s.scene.key) ?? []);
  const waitScene = (key, ms = 15000) => page.waitForFunction((k) => window.__ayvago?.game.scene.isActive(k), key, { timeout: ms });
  const step = { intro: false, menu: false, play: false, gameOver: false, retry: false, nonBlank: false };
  try {
    await page.goto(`${BASE}/games/${slug}/?lang=tr`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ayvago-boot canvas', { timeout: dev ? 30000 : 15000 });
    step.intro = true;
    await page.waitForTimeout(1200);
    // Tap skips the intro. Near the top edge: the centre is where the menu's PLAY button
    // appears, and a tap landing there after the intro ended would start the round at once.
    await page.mouse.click(270, 40);
    await page.waitForFunction(() => ['Menu', 'Play'].some((k) => window.__ayvago?.game.scene.isActive(k)), null, { timeout: 15000 });
    step.menu = true;
    await page.waitForTimeout(700);
    if (thumbs) {
      const land = await page.evaluate(() => window.__ayvago.def.meta.orientation === 'landscape');
      if (land) await page.setViewportSize({ width: 960, height: 540 });
      await page.waitForTimeout(400);
      mkdirSync(join(root, 'public', 'thumbs'), { recursive: true });
      await page.locator('canvas').first().screenshot({ path: join(root, 'public', 'thumbs', `${slug}.png`) });
      if (land) await page.setViewportSize({ width: 540, height: 960 });
    }
    if (!(await page.evaluate(() => window.__ayvago?.game.scene.isActive('Play')))) await page.keyboard.press('Enter');
    await waitScene('Play', 5000);
    step.play = true;

    // Up to 8 seconds of random play: keys + taps/drags away from the pause button
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyX'];
    const box = await page.locator('canvas').first().boundingBox();
    for (let i = 0; i < 40; i++) {
      // A round may end on its own (three quick deaths in a road crossing are fair): stop before
      // a random tap lands on the result screen's MENU button.
      // Checked before every input, and on the round's own end flag: the result screen only
      // opens after the end delay, so waiting for it can leave one tap too many.
      if (await page.evaluate(() => {
        const sc = window.__ayvago.game.scene;
        return sc.isActive('GameOver') || !!sc.getScene('Play')?.isOver || !sc.isActive('Play');
      })) break;
      const k = keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.down(k);
      const x = box.x + box.width * (0.1 + Math.random() * 0.8), y = box.y + box.height * (0.2 + Math.random() * 0.7);
      if (Math.random() < 0.5) await page.mouse.click(x, y);
      else { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 40, { steps: 3 }); await page.mouse.up(); }
      await page.waitForTimeout(150);
      await page.keyboard.up(k);
    }
    // canvas must not be a flat colour
    const shot = await page.locator('canvas').first().screenshot();
    step.nonBlank = new Set(Array.from(shot.subarray(200, Math.min(shot.length, 20000)))).size > 40;

    // the flow must survive a forced end of round
    // (if a stray input still left the round for the menu, start a fresh one first)
    if (await page.evaluate(() => window.__ayvago.game.scene.isActive('Menu'))) {
      await page.keyboard.press('Enter');
      await waitScene('Play', 5000);
    }
    const active = await scenes();
    if (active.includes('Pause')) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    await page.evaluate(() => {
      const play = window.__ayvago.game.scene.getScene('Play');
      if (play.isOver) return;
      play.scene.resume();
      play.endGame?.({ delay: 0 });
    });
    // The end delay runs on the game clock, which falls behind wall time on a loaded runner
    // (tappy-plane's crash takes over 6 s there): allow as long as the other steps.
    await waitScene('GameOver', 15000);
    step.gameOver = true;
    // The result screen arms its Enter shortcut after a delay counted in game time, which runs
    // slower than wall time on a loaded machine: keep pressing for up to 15 s.
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(750);
      await page.keyboard.press('Enter');
      if (await page.evaluate(() => window.__ayvago.game.scene.isActive('Play')).catch(() => false)) break;
    }
    await waitScene('Play', 5000);
    await page.waitForTimeout(800);
    step.retry = true;
  } catch (e) {
    errors.push('flow: ' + String(e.message).split('\n')[0] + ' | active=' + (await scenes().catch(() => '?')));
  }
  await ctx.close();
  const ok = Object.values(step).every(Boolean) && errors.length === 0;
  return { slug, ok, step, errors: [...new Set(errors)].slice(0, 12) };
}

const queue = [...slugs];
// One browser context per two cores (at most 4): each game renders WebGL in software, and more
// parallel games than the machine can run slow every game's clock past the step timeouts.
const parallel = args.includes('--serial') ? 1 : Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2)));
const workers = Array.from({ length: Math.min(parallel, queue.length) }, async () => {
  while (queue.length) {
    const slug = queue.shift();
    const r = await testGame(slug);
    results.push(r);
    if (!r.ok && retryable(r)) console.log(`SLOW  ${slug} (timed out under load, retried at the end)`);
    else report(r);
  }
});
await Promise.all(workers);

// A run that only timed out (no page, console or network error) is retried once on its own:
// the step timeouts count wall time, and with several games rendering WebGL in software on a
// shared runner a game's clock can fall behind them. Any error, or a second timeout, fails.
for (const [i, r] of results.entries()) {
  if (r.ok || !retryable(r)) continue;
  const again = await testGame(r.slug);
  results[i] = again;
  report(again, again.ok ? ' (passed on its own after a timeout under load)' : '');
}
if (dev) await new Promise((r) => setTimeout(r, 100));
await browser.close();
stopServer();

results.sort((a, b) => a.slug.localeCompare(b.slug));
mkdirSync(join(root, 'reports'), { recursive: true });
if (!only.length) writeFileSync(join(root, 'reports', 'smoke.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
