// Embeds games the way ayvago.com does (cross-origin sandboxed iframe on an allowed platform
// origin) and checks the GHA_* protocol end to end:
//   GHA_READY → GHA_START(locale) → GHA_LOADING → intro → menu → GHA_SESSION_START
//   → GHA_PAUSE pauses → GHA_MUTE mutes → forced game over → GHA_END{score}
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
      theme: 'retro', colorMode: 'dark', tokens: { '--accent': '#ec3013' }, locale: '${locale}', adsEnabled: false } });
  });
</script></body></html>`;
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
    await page.mouse.click(270, 480);   // skip intro
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 15000 });
    step.locale = await frame().evaluate(() => document.documentElement.lang);
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
  } catch (e) {
    errors.push('flow: ' + String(e.message).split('\n')[0] + ' | messages=' + (await types().catch(() => '?')));
  }
  await page.close();
  const ok = step.ready && step.loading && step.locale === 'tr' && step.sessionStart && step.pause && step.mute && step.end && errors.length === 0;
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
