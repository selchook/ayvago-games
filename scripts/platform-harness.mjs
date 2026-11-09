// Embeds games the way ayvago.com does (cross-origin sandboxed iframe on an allowed platform
// origin) and checks the GHA_* protocol end to end:
//   GHA_READY → GHA_START(locale) → GHA_LOADING → intro → menu → GHA_SESSION_START
//   → GHA_PAUSE pauses → GHA_MUTE mutes → forced game over → GHA_END{score}
// The game reports its own sound switch after the handshake and on every change of its menu button
// and never echoes GHA_MUTE back.
// GHA_START carries a platform best (protocol 2.4) above the forced score: the game must adopt
// it as its own best and must not celebrate the lower score as a new record.
// Difficulty (protocol 2.6): a game with `difficulty: true` gets Easy picked on its menu toggle
// before PLAY, and its GHA_END must carry difficulty 'easy'; every other game's GHA_END carries
// 'normal' or no difficulty at all.
// Usage: node scripts/platform-harness.mjs [--dev] [slug ...]   (default: dist/ via vite preview)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = (only.length ? only : readdirSync(join(root, 'games')))
  .filter((s) => existsSync(dev ? join(root, 'games', s, 'index.html') : join(root, 'dist', 'games', s, 'index.html')));

const GAME_PORT = 4900 + Math.floor(Math.random() * 90);
const HOST_PORT = 3000;   // http://localhost:3000 is an allowed platform origin in the adapter
const GAME_ORIGIN = `http://localhost:${GAME_PORT}`;

const server = spawn('npx', dev ? ['vite', '--port', String(GAME_PORT), '--strictPort'] : ['vite', 'preview', '--port', String(GAME_PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${GAME_PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });

// Minimal stand-in for apps/web/components/game/game-player.tsx
const hostPage = (slug, locale) => `<!doctype html><html><body style="margin:0;background:#111">
<iframe id="g" src="${GAME_ORIGIN}/games/${slug}/" style="width:540px;height:960px;border:0"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
  allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope" referrerpolicy="origin"></iframe>
<script>
  window.log = [];
  const frame = document.getElementById('g');
  window.send = (m) => frame.contentWindow.postMessage(m, '${GAME_ORIGIN}');
  addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== '${GAME_ORIGIN}') return;
    window.log.push(e.data);
    if (e.data && e.data.type === 'GHA_READY') send({ type: 'GHA_START', config: {
      mode: 'solo', isHost: true, playerIndex: 0, playerCount: 1, protocol: 2,
      theme: 'retro', colorMode: 'dark', tokens: { '--accent': '#ec3013' }, locale: '${locale}', adsEnabled: false, best: ${PLATFORM_BEST} } });
  });
</script></body></html>`;
const PLATFORM_BEST = 1000000;
const host = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(hostPage(u.searchParams.get('slug'), u.searchParams.get('locale') || 'tr'));
}).listen(HOST_PORT);

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];

async function check(slug) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]/.test(m.text())) errors.push('console: ' + m.text()); });
  const types = () => page.evaluate(() => window.log.map((m) => m.type));
  const step = {};
  try {
    await page.goto(`http://localhost:${HOST_PORT}/?slug=${slug}&locale=tr`);
    const frame = () => page.frames().find((f) => f.url().startsWith(GAME_ORIGIN));
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_READY'), null, { timeout: dev ? 30000 : 8000 });
    step.ready = true;
    const ready = await page.evaluate(() => window.log.find((m) => m.type === 'GHA_READY'));
    step.gameId = ready.gameId;
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_LOADING'), null, { timeout: 15000 });
    step.loading = true;
    await page.waitForTimeout(800);
    await page.mouse.click(270, 40);    // skip intro (away from the menu's PLAY button)
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 15000 });
    step.locale = await frame().evaluate(() => document.documentElement.lang);
    step.best = await frame().evaluate((id) => Number(localStorage.getItem(`ayvago:best:${id}`)), slug);
    // the menu's own sound button: off and on again, both reported to the platform
    const box = await frame().locator('canvas').first().boundingBox();
    const [gw, gh] = await frame().evaluate(() => [window.__ayvago.game.scale.width, window.__ayvago.game.scale.height]);
    for (let i = 0; i < 2; i++) {
      await page.mouse.click(box.x + (60 * box.width) / gw, box.y + ((gh - 60) * box.height) / gh);
      await page.waitForTimeout(250);
    }
    // difficulty: games that offer it get Easy from a tap on the menu toggle
    step.offersDifficulty = await frame().evaluate(() => !!window.__ayvago.def.difficulty);
    if (step.offersDifficulty) {
      const hit = await frame().evaluate(() => window.__ayvago.game.scene.getScene('Menu').difficultyHit?.easy);
      if (!hit) throw new Error('difficulty toggle missing on the menu');
      await page.mouse.click(box.x + (hit.x * box.width) / gw, box.y + (hit.y * box.height) / gh);
      await page.waitForTimeout(250);
      step.easyPicked = await frame().evaluate((id) => localStorage.getItem(`ayvago:difficulty:${id}`) === '"easy"', slug);
    }
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 5000 });
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_SESSION_START'), null, { timeout: 3000 });
    step.sessionStart = true;
    await page.waitForTimeout(1500);
    await page.evaluate(() => send({ type: 'GHA_PAUSE' }));
    await frame().waitForFunction(() => window.__ayvago.game.scene.isActive('Pause'), null, { timeout: 3000 });
    step.pause = true;
    await page.evaluate(() => send({ type: 'GHA_MUTE', muted: true }));
    await page.waitForTimeout(200);
    step.mute = await frame().evaluate(() => window.__ayvago.silenced());
    // protocol 2.5: one sound switch. The game reported its switch after the handshake and does
    // not echo the platform's own GHA_MUTE back.
    const states = await page.evaluate(() => window.log.filter((m) => m.type === 'GHA_MUTE_STATE').map((m) => m.muted));
    step.muteState = states.join() === 'false,true,false';
    await frame().evaluate(() => {
      const g = window.__ayvago.game;
      g.scene.stop('Pause');
      const play = g.scene.getScene('Play');
      play.scene.resume();
      play.addScore?.(123);
      play.endGame({ delay: 0 });
    });
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_END'), null, { timeout: 6000 });
    const end = await page.evaluate(() => window.log.find((m) => m.type === 'GHA_END'));
    step.endScore = end.score;
    step.end = typeof end.score === 'number' && end.score >= 123;
    step.difficulty = end.difficulty ?? null;
    step.difficultyOk = step.offersDifficulty ? step.easyPicked && end.difficulty === 'easy' : end.difficulty === undefined || end.difficulty === 'normal';
    await page.waitForTimeout(300);
    step.noFalseBest = !(await page.evaluate(() => window.log.some((m) => m.type === 'GHA_HAPPY_TIME')));
  } catch (e) {
    errors.push('flow: ' + String(e.message).split('\n')[0] + ' | messages=' + (await types().catch(() => '?')));
  }
  await page.close();
  const ok = step.ready && step.loading && step.locale === 'tr' && step.sessionStart && step.pause && step.mute && step.end && step.best === PLATFORM_BEST && step.noFalseBest && step.muteState && step.difficultyOk && errors.length === 0;
  return { slug, ok: !!ok, step, errors: [...new Set(errors)].slice(0, 8) };
}

for (const slug of slugs) {
  const r = await check(slug);
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${slug}  ${JSON.stringify(r.step)}${r.errors.length ? '\n      ' + r.errors.join('\n      ') : ''}`);
}
await browser.close();
host.close();
try { process.kill(-server.pid); } catch { server.kill(); }
mkdirSync(join(root, 'reports'), { recursive: true });
if (!only.length) writeFileSync(join(root, 'reports', 'platform.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed the platform protocol check`);
process.exit(failed ? 1 : 0);
