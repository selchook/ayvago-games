// Gamepad test: plays each game with a scripted fake pad only (no keyboard, no taps), through the
// core gamepad layer (src/core/gamepad.ts):
//   connect the pad -> A skips the intro -> A until the round runs (menu, pre-run screens) ->
//   2 s of stick and D-pad -> every action button -> Start pauses, Start resumes -> Start pauses,
//   A resumes -> forced end of round, B goes to the menu, A starts again -> unplug: no key stuck.
// Fails on page errors, console errors, failed requests or a step that does not happen.
// Usage: npm run build && node scripts/gamepad-test.mjs [--canary] [--serial] [--shots <dir>] [slug ...]
//        node scripts/gamepad-test.mjs --dev [...]   (no build needed; uses the Vite dev server)
//   no slugs: every game; --canary: the canary set (scripts/changed-games.mjs --canary);
//   --port <n>: server port (default 5371); --shots <dir>: one gameplay screenshot per game (and one
//   on a failure); --verbose: logs (and with --shots captures) every A press on the way to play.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { availableParallelism, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dev = args.includes('--dev');
const verbose = args.includes('--verbose');
const shots = opt('--shots') ? resolve(opt('--shots')) : null;
const PORT = Number(opt('--port') ?? 5371);
const valued = new Set([opt('--shots'), opt('--port')].filter(Boolean));
let only = args.filter((a) => !a.startsWith('--') && !valued.has(a));
if (args.includes('--canary')) {
  only = [...new Set([...only, ...execFileSync('node', ['scripts/changed-games.mjs', '--canary'], { cwd: root, encoding: 'utf8' }).trim().split(/\s+/)])];
}
const slugs = (only.length ? only : readdirSync(join(root, 'games')))
  .filter((s) => existsSync(dev ? join(root, 'games', s, 'index.html') : join(root, 'dist', 'games', s, 'index.html')));
if (!slugs.length) { console.error('nothing to test — run npm run build first (or pass --dev)'); process.exit(1); }
if (shots) mkdirSync(shots, { recursive: true });

const server = spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });
const stopServer = () => { try { process.kill(-server.pid); } catch { server.kill(); } };
const BASE = `http://localhost:${PORT}`;

/**
 * The fake pad: navigator.getGamepads() returns one standard-mapping pad whose buttons and axes
 * the test sets through window.__pad. It shows up only after connect(), like a real pad after
 * its first button press.
 */
function fakePad() {
  const state = { connected: false, buttons: new Array(17).fill(0), axes: [0, 0, 0, 0] };
  const IDX = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 };
  const snapshot = () => ({
    id: 'Ayvago Test Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', index: 0, connected: true, mapping: 'standard',
    timestamp: performance.now(),
    buttons: state.buttons.map((v) => ({ value: v, pressed: v > 0.5, touched: v > 0 })),
    axes: state.axes.slice(),
    vibrationActuator: { type: 'dual-rumble', playEffect: () => Promise.resolve('complete') },
  });
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => [state.connected ? snapshot() : null, null, null, null] });
  window.__pad = {
    connect() { state.connected = true; window.dispatchEvent(new Event('gamepadconnected')); },
    disconnect() { state.connected = false; window.dispatchEvent(new Event('gamepaddisconnected')); },
    set(b, v) { state.buttons[IDX[b]] = v; },
    stick(x, y) { state.axes[0] = x; state.axes[1] = y; },
    neutral() { state.buttons.fill(0); state.axes.fill(0); },
  };
}

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];

function retryable(r) {
  return r.errors.length > 0 && r.errors.every((e) => e.startsWith('flow: ') && /Timeout \d+ms exceeded/.test(e));
}

function report(r, note = '') {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.slug}${note}${r.ok ? '' : '\n      ' + JSON.stringify(r.step) + '\n      ' + r.errors.join('\n      ')}`);
  if (!r.ok && process.env.GITHUB_ACTIONS) {
    console.log(`::error title=gamepad ${r.slug}::${JSON.stringify(r.step)} ${r.errors.join(' / ').replace(/\r?\n/g, ' ')}`);
  }
}

async function testGame(slug) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(fakePad);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const scenes = () => page.evaluate(() => window.__ayvago?.game.scene.getScenes(true).map((s) => s.scene.key) ?? []);
  const active = (k) => page.evaluate((key) => !!window.__ayvago?.game.scene.isActive(key), k);
  const waitFor = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms });
  const pad = () => page.evaluate(() => window.__ayvago?.pad?.() ?? null);
  const set = (b, v) => page.evaluate(([b, v]) => window.__pad.set(b, v), [b, v]);
  const stick = (x, y) => page.evaluate(([x, y]) => window.__pad.stick(x, y), [x, y]);
  /** Waits for `n` animation frames: the pad layer polls once per frame, however slow the frames are. */
  const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  /** A button press held for at least `ms` and three polled frames, and the release. */
  const tap = async (b, ms = 120) => {
    await set(b, 1); await Promise.all([frames(3), page.waitForTimeout(ms)]);
    await set(b, 0); await Promise.all([frames(3), page.waitForTimeout(60)]);
  };
  const roundOver = () => page.evaluate(() => {
    const sc = window.__ayvago.game.scene;
    return sc.isActive('GameOver') || !!sc.getScene('Play')?.isOver;
  });
  /** Presses A until the pad maps for play (3D games can run at a frame a second in software GL). */
  const startRound = async (ms = 60000) => {
    const until = Date.now() + ms;
    for (let i = 0; Date.now() < until; i++) {
      const p = await pad();
      if (p?.context === 'play' && !(await roundOver())) return true;
      if (verbose) console.log(`  ${slug} start: A #${i} (${p?.context}, ${(await scenes()).join('+')})`);
      if (shots && verbose) await page.locator('canvas').first().screenshot({ path: join(shots, `${slug}-start${i}.png`) });
      await tap('a');
      await page.waitForTimeout(450);
    }
    throw new Error(`Timeout ${ms}ms exceeded: never reached play (pad context ${(await pad())?.context})`);
  };
  const step = { intro: false, menu: false, play: false, phaser: false, move: false, buttons: false, pause: false, resumeStart: false, resumeA: false, backToMenu: false, noStuckKeys: false };
  let note = '';
  let probeResult = null;
  try {
    await page.goto(`${BASE}/games/${slug}/?lang=en`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ayvago-boot canvas', { timeout: dev ? 30000 : 15000 });
    step.intro = true;
    await page.waitForTimeout(1200);
    // the first button press is what makes a browser show the pad
    await page.evaluate(() => window.__pad.connect());
    await tap('a');
    await waitFor(() => ['Menu', 'Play'].some((k) => window.__ayvago?.game.scene.isActive(k)), null, 15000);
    step.menu = true;
    await page.waitForTimeout(900);

    await startRound();
    step.play = true;

    // Phaser and the DOM take the pad's keys like real ones: a Key from addKey, createCursorKeys,
    // keydown-J, JustDown, and listeners on window and document (pad X = J, stick = arrows)
    await page.evaluate(() => {
      const play = window.__ayvago.game.scene.getScene('Play');
      const kb = play.input.keyboard;
      const p = window.__probe = { j: kb.addKey('J', false), cursors: kb.createCursorKeys(), ev: 0, win: 0, doc: 0, just: 0, fields: '' };
      kb.on('keydown-J', () => p.ev++);
      window.addEventListener('keydown', (e) => { if (e.code === 'KeyJ') { p.win++; p.fields = `${e.key} ${e.keyCode} ${e.which}`; } });
      document.addEventListener('keydown', (e) => { if (e.code === 'KeyJ') p.doc++; });
      const justDown = window.Phaser?.Input.Keyboard.JustDown ?? ((k) => { const j = k._justDown; k._justDown = false; return j; });
      play.events.on('update', () => { if (justDown(p.j)) p.just++; });
    });
    await set('x', 1); await stick(1, 0);
    await Promise.all([frames(4), page.waitForTimeout(150)]);
    const held = await page.evaluate(() => ({ j: window.__probe.j.isDown, right: window.__probe.cursors.right.isDown }));
    await set('x', 0); await stick(0, 0);
    await Promise.all([frames(4), page.waitForTimeout(100)]);
    const probe = await page.evaluate(() => {
      const p = window.__probe;
      const running = window.__ayvago.game.scene.isActive('Play');
      return { ev: p.ev, win: p.win, doc: p.doc, just: p.just, running, fields: p.fields, jUp: !p.j.isDown, rightUp: !p.cursors.right.isDown };
    });
    probeResult = probe;
    // JustDown only counts while Play updates (a game may pause or end the round on its J press)
    const fine = held.j && held.right && probe.ev === 1 && probe.win === 1 && probe.doc === 1 && (probe.just === 1 || !probe.running && probe.just === 0)
      && probe.fields === 'j 74 74' && probe.jUp && probe.rightUp;
    if (!fine) errors.push('phaser: ' + JSON.stringify({ held, probe }));
    else step.phaser = true;
    if (await roundOver()) await startRound();

    // 2 s of movement: stick around, then the D-pad
    for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1], [0.7, 0.7]]) {
      if (await roundOver()) break;
      await stick(x, y); await Promise.all([frames(3), page.waitForTimeout(240)]);
      await stick(0, 0); await Promise.all([frames(2), page.waitForTimeout(60)]);
    }
    for (const d of ['left', 'right', 'up', 'down']) {
      if (await roundOver()) break;
      await tap(d, 100);
    }
    step.move = true;
    if (shots) await page.locator('canvas').first().screenshot({ path: join(shots, `${slug}.png`) });

    // every action button (Back opens the map in some games, Start is the pause below)
    for (const b of ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'ls', 'rs', 'back']) {
      if (await roundOver()) break;
      await tap(b, 90);
    }
    // a button may have opened one of the game's own screens: B backs out (or A starts again)
    for (let i = 0; i < 6; i++) {
      const p = await pad();
      if (p?.context === 'play' && !(await roundOver())) break;
      if (await roundOver() || p?.context !== 'menu') { note = ' (round ended during the buttons)'; await startRound(); break; }
      await tap(i % 2 ? 'a' : 'b');
      await page.waitForTimeout(300);
    }
    if ((await pad())?.context !== 'play') await startRound();
    step.buttons = true;

    // Start pauses, Start resumes; Start pauses, A resumes (RESUME has the focus)
    await page.waitForTimeout(250);
    await tap('start');
    await waitFor(() => window.__ayvago.game.scene.isActive('Pause'), null, 4000);
    step.pause = true;
    await page.waitForTimeout(300);
    await tap('start');
    await waitFor(() => !window.__ayvago.game.scene.isActive('Pause') && window.__ayvago.game.scene.isActive('Play'), null, 4000);
    step.resumeStart = true;
    await page.waitForTimeout(300);
    if (await roundOver()) await startRound();
    await tap('start');
    await waitFor(() => window.__ayvago.game.scene.isActive('Pause'), null, 4000);
    await page.waitForTimeout(300);
    await tap('a');
    await waitFor(() => !window.__ayvago.game.scene.isActive('Pause') && window.__ayvago.game.scene.isActive('Play'), null, 4000);
    step.resumeA = true;

    // result screen: B goes to the menu, A starts a new round
    await page.evaluate(() => {
      const play = window.__ayvago.game.scene.getScene('Play');
      if (!play.isOver) play.endGame?.({ delay: 0 });
    });
    await waitFor(() => window.__ayvago.game.scene.isActive('GameOver'), null, 15000);
    for (let i = 0; i < 20 && !(await active('Menu')); i++) {
      await page.waitForTimeout(500);
      await tap('b');
    }
    await waitFor(() => window.__ayvago.game.scene.isActive('Menu'), null, 3000);
    await page.waitForTimeout(600);
    await startRound();
    step.backToMenu = true;

    // hold a few controls, unplug: nothing may stay down, for the pad layer or for Phaser
    await set('a', 1); await set('x', 1); await stick(1, 0);
    await Promise.all([frames(3), page.waitForTimeout(200)]);
    const heldBefore = (await pad())?.held ?? [];
    await page.evaluate(() => window.__pad.disconnect());
    await page.waitForTimeout(200);
    const stuck = await page.evaluate(() => {
      const kb = window.__ayvago.game.scene.getScene('Play').input.keyboard;
      const down = (kb?.keys ?? []).filter((k) => k && k.isDown).map((k) => k.keyCode);
      return { pad: window.__ayvago.pad().held, phaser: down, connected: window.__ayvago.pad().connected };
    });
    if (heldBefore.length === 0) errors.push('stuck: the held controls pressed no key');
    if (stuck.pad.length || stuck.phaser.length || stuck.connected) errors.push('stuck: ' + JSON.stringify(stuck));
    else step.noStuckKeys = true;
  } catch (e) {
    if (shots) await page.locator('canvas').first().screenshot({ path: join(shots, `${slug}-fail.png`) }).catch(() => {});
    errors.push('flow: ' + String(e.message).split('\n')[0] + ' | active=' + (await scenes().catch(() => '?')) + ' pad=' + JSON.stringify(await pad().catch(() => null)));
  }
  await ctx.close();
  const ok = Object.values(step).every(Boolean) && errors.length === 0;
  return { slug, ok, step, note, probe: probeResult, errors: [...new Set(errors)].slice(0, 12) };
}

const queue = [...slugs];
const parallel = args.includes('--serial') ? 1 : Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2)));
const workers = Array.from({ length: Math.min(parallel, queue.length) }, async () => {
  while (queue.length) {
    const slug = queue.shift();
    const r = await testGame(slug);
    results.push(r);
    if (!r.ok && retryable(r)) console.log(`SLOW  ${slug} (timed out under load, retried at the end)`);
    else report(r, r.note);
  }
});
await Promise.all(workers);

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
writeFileSync(join(root, 'reports', 'gamepad.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
