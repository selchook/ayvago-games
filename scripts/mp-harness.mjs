// Online two-player test bench. Embeds the same game twice, side by side, the way ayvago.com
// embeds one game per player, and plays the platform's part in between: GHA_START with the
// seats (host = player 0, guest = player 1), and every GHA_MOVE_OUT from one frame delivered to
// the other as GHA_MOVE_IN (after --latency ms, default 60). No Firebase and no WebRTC: those
// live in the platform; this checks the game side of the protocol.
//
// Checks per game: both frames reach the online menu → the host starts the round → both play
// → moves flow both ways during random play → no errors, canvases not blank → GHA_PEER_LEAVE
// ends the guest's round. With --shots, screenshots of both frames go to reports/mp/.
// Usage: node scripts/mp-harness.mjs [--dev] [--shots] [--latency 120] <slug> [slug ...]
//        (only games whose game.json has "multiplayer": true when no slug is given)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
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
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--latency');
const isMultiplayer = (s) => {
  try { return JSON.parse(readFileSync(join(root, 'games', s, 'game.json'), 'utf8')).multiplayer === true; } catch { return false; }
};
const slugs = (only.length ? only : readdirSync(join(root, 'games')).filter(isMultiplayer))
  .filter((s) => existsSync(dev ? join(root, 'games', s, 'index.html') : join(root, 'dist', 'games', s, 'index.html')));

const GAME_PORT = 4800 + Math.floor(Math.random() * 90);
const HOST_PORT = 3000;   // an allowed platform origin in the adapter
const GAME_ORIGIN = `http://localhost:${GAME_PORT}`;

const server = spawn('npx', dev ? ['vite', '--port', String(GAME_PORT), '--strictPort'] : ['vite', 'preview', '--port', String(GAME_PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${GAME_PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });

// Two players on one page: frame 0 is the host, frame 1 the guest.
const hostPage = (slug, land) => {
  const [w, h] = land ? [640, 360] : [405, 720];
  const frame = (i) => `<iframe id="f${i}" src="${GAME_ORIGIN}/games/${slug}/?nointro" style="width:${w}px;height:${h}px;border:0"
    sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" allow="autoplay" referrerpolicy="origin"></iframe>`;
  return `<!doctype html><html><body style="margin:0;background:#111;display:flex;gap:10px">${frame(0)}${frame(1)}
<script>
  const frames = [document.getElementById('f0'), document.getElementById('f1')];
  const names = ['Host', 'Guest'];
  window.relayed = [[], []];          // messages sent by player i
  window.log = [[], []];
  window.send = (i, m) => frames[i].contentWindow.postMessage(m, '${GAME_ORIGIN}');
  addEventListener('message', (e) => {
    const i = frames.findIndex((f) => f.contentWindow === e.source);
    if (i < 0 || e.origin !== '${GAME_ORIGIN}') return;
    const m = e.data || {};
    window.log[i].push(m.type);
    if (m.type === 'GHA_READY') send(i, { type: 'GHA_START', config: {
      mode: 'multiplayer', isHost: i === 0, playerIndex: i, playerCount: 2, peerName: names[1 - i], protocol: 2,
      theme: 'retro', colorMode: 'dark', tokens: { '--accent': '#ec3013' }, locale: 'tr', adsEnabled: false } });
    if (m.type === 'GHA_MOVE_OUT') {
      window.relayed[i].push(m.data && m.data.t);
      setTimeout(() => send(1 - i, { type: 'GHA_MOVE_IN', data: m.data }), ${latency});
    }
  });
</script></body></html>`;
};
const host = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(hostPage(u.searchParams.get('slug'), u.searchParams.get('land') === '1'));
}).listen(HOST_PORT);

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
if (shots) mkdirSync(join(root, 'reports', 'mp'), { recursive: true });

async function check(slug) {
  const errors = [];
  const land = JSON.parse(readFileSync(join(root, 'games', slug, 'game.json'), 'utf8')).orientation === 'landscape';
  const page = await browser.newPage({ viewport: land ? { width: 1300, height: 380 } : { width: 830, height: 740 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]/.test(m.text())) errors.push('console: ' + m.text()); });
  let gameFrames = [];
  const frames = () => gameFrames;
  const active = (i, key) => frames()[i].evaluate((k) => !!window.__ayvago?.game.scene.isActive(k), key).catch(() => false);
  const waitScene = (i, key, ms) => frames()[i].waitForFunction((k) => window.__ayvago?.game.scene.isActive(k), key, { timeout: ms });
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(root, 'reports', 'mp', `${slug}-${name}.png`) }); };
  const step = { menus: false, start: false, hostToGuest: 0, guestToHost: 0, nonBlank: false, peerLeave: false };
  try {
    await page.goto(`http://localhost:${HOST_PORT}/?slug=${slug}&land=${land ? 1 : 0}`);
    gameFrames = await Promise.all([0, 1].map(async (i) => (await page.$(`#f${i}`)).contentFrame()));
    await page.waitForFunction(() => window.log[0].includes('GHA_READY') && window.log[1].includes('GHA_READY'), null, { timeout: dev ? 40000 : 10000 });
    await waitScene(0, 'Menu', 20000);
    await waitScene(1, 'Menu', 20000);
    step.menus = true;
    await shot('1-menu');

    // The host starts the round; the guest follows on "__start".
    const boxes = await Promise.all([0, 1].map((i) => page.locator('iframe').nth(i).boundingBox()));
    await page.mouse.click(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);   // focus the host frame
    await page.keyboard.press('Enter');
    await waitScene(0, 'Play', 6000);
    await waitScene(1, 'Play', 6000);
    step.start = true;
    await page.waitForTimeout(600);
    await shot('2-start');

    // Random play on both sides: taps, drags and keys.
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    for (let n = 0; n < 48; n++) {
      if (n % 6 === 0 && (await active(0, 'GameOver')) && (await active(1, 'GameOver'))) break;
      const i = n % 2, b = boxes[i];
      const x = b.x + b.width * (0.12 + Math.random() * 0.76), y = b.y + b.height * (0.22 + Math.random() * 0.66);
      if (Math.random() < 0.6) await page.mouse.click(x, y);
      else { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y - 30, { steps: 3 }); await page.mouse.up(); }
      const k = keys[Math.floor(Math.random() * keys.length)];
      await page.keyboard.down(k); await page.waitForTimeout(90); await page.keyboard.up(k);
      await page.waitForTimeout(80);
      if (n === 20) await shot('3-play');
    }
    const relayed = await page.evaluate(() => window.relayed);
    step.hostToGuest = relayed[0].filter((t) => t && !String(t).startsWith('__')).length;
    step.guestToHost = relayed[1].filter((t) => t && !String(t).startsWith('__')).length;

    const canvases = await Promise.all([0, 1].map((i) => page.locator('iframe').nth(i).screenshot()));
    step.nonBlank = canvases.every((c) => new Set(Array.from(c.subarray(200, Math.min(c.length, 20000)))).size > 40);

    // The platform reports the opponent leaving: an unfinished round ends for the guest.
    if (!(await active(1, 'GameOver'))) {
      await page.evaluate(() => send(1, { type: 'GHA_PEER_LEAVE' }));
      await waitScene(1, 'GameOver', 20000);
    }
    step.peerLeave = true;
    await shot('4-end');
  } catch (e) {
    const scenes = await Promise.all([0, 1].map((i) => frames()[i]?.evaluate(() => window.__ayvago?.game.scene.getScenes(true).map((x) => x.scene.key).join('+')).catch(() => '?')));
    errors.push('flow: ' + String(e.message).split('\n')[0] + ` | host=${scenes[0]} guest=${scenes[1]}`);
  }
  await page.close();
  const ok = step.menus && step.start && step.hostToGuest > 0 && step.guestToHost > 0 && step.nonBlank && step.peerLeave && errors.length === 0;
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
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed the online two-player check`);
process.exit(failed ? 1 : 0);
