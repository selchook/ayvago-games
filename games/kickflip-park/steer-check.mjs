// Kickflip Park: steering check. Proves that the controls turn the rider the way the screen says:
//   - keyboard: holding ← / A for about 0.5 s on flat ground moves the rider left on screen,
//     → / D moves them right;
//   - touch: a left-thumb stick drag (CDP touch events) to the left and to the right does the same;
//   - air: holding ← in the air turns the board's nose to the screen's left (counter-clockwise
//     seen from above and behind), → to the right.
// Run: node games/kickflip-park/steer-check.mjs [--base http://localhost:5173] [--shots <dir>]
//   Without --base it starts its own Vite dev server. Exits 1 when a check fails.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
let base = opt('--base');
const shots = opt('--shots');
if (shots) mkdirSync(shots, { recursive: true });

let server = null;
if (!base) {
  const port = 4800 + Math.floor(Math.random() * 400);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `kf-steer-${port}`) } });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function open(touch) {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  // no first-session tutorial in the way
  await page.addInitScript(() => localStorage.setItem('ayvago:kickflip-park:meta', JSON.stringify({ hinted: true, tutorial: 9 })));
  await page.goto(`${base}/games/kickflip-park/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Menu').scene.start('Play'));
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 30000 });
  // PLAY opens the session setup (1.2): START the session as the button does
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').testStart?.());
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** Puts the rider on the plaza's open flat (heading south, rolling), with the camera snapped behind. */
async function place(page, speed = 4.5) {
  await page.evaluate((sp) => {
    const p = window.__ayvago.game.scene.getScene('Play');
    p.testTutorial?.(false);
    p.testPlace(0, 28, Math.PI, sp);
  }, speed);
  await page.waitForTimeout(500);
  await page.evaluate((sp) => { const p = window.__ayvago.game.scene.getScene('Play'); p.testPlace(p.sim.x, p.sim.z, Math.PI, sp); }, speed);
  await page.waitForTimeout(120);
}

/** Freezes a copy of the camera as it is now (the reference view for the next probes). */
const freeze = (page) => page.evaluate(() => { const p = window.__ayvago.game.scene.getScene('Play'); p.world.camera.updateMatrixWorld(); window.__kfCam0 = p.world.camera.clone(); });

/**
 * The rider's screen x (game pixels) and the nose's screen x relative to the rider, both through
 * the camera frozen at the start of the move (the chase camera swings round after the rider, so
 * the live view would hide most of a turn); `live` is the live view's x.
 */
/** Waits until the simulation has run `sec` more seconds (software WebGL is slow: wall time says little). */
const playFor = (page, sec) => page.evaluate((sec) => window.__ayvago.game.scene.getScene('Play').sim.time, sec)
  .then((t0) => page.waitForFunction(([t0, sec]) => window.__ayvago.game.scene.getScene('Play').sim.time >= t0 + sec, [t0, sec], { timeout: 60000, polling: 16 }));

const probe = (page) => page.evaluate(() => {
  const p = window.__ayvago.game.scene.getScene('Play'), s = p.sim, cam = window.__kfCam0 ?? p.world.camera;
  const px = (x, y, z) => (p.world.camera.position.clone().set(x, y, z).project(cam).x + 1) / 2 * 720;
  const x = px(s.x, s.y + 0.6, s.z);
  const nose = px(s.x + Math.sin(s.heading) * 1.2, s.y + 0.6, s.z + Math.cos(s.heading) * 1.2) - x;
  return { x, nose, live: p.view.toScreen(s.x, s.y + 0.6, s.z).x, heading: s.heading, state: s.state, t: s.time };
});

async function keyRun(page, key) {
  await place(page);
  await freeze(page);
  const a = await probe(page);
  await page.keyboard.down(key);
  await playFor(page, 0.5);
  const b = await probe(page);
  if (shots) await page.screenshot({ path: join(shots, `steer-key-${key}.png`) });
  await page.keyboard.up(key);
  return { d: b.x - a.x, live: b.live - a.live, t: b.t - a.t };
}

async function airRun(page, key) {
  await place(page, 6);
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').sim.testAir(9));
  await freeze(page);
  await page.keyboard.down(key);
  await playFor(page, 0.25);
  const b = await probe(page);
  if (shots) await page.screenshot({ path: join(shots, `steer-air-${key}.png`) });
  await page.keyboard.up(key);
  await playFor(page, 1.6);
  return b;
}

async function touchRun(page, dx) {
  await place(page);
  const box = await page.locator('canvas').first().boundingBox();
  const k = box.width / 720;
  const x0 = box.x + 180 * k, y0 = box.y + 1000 * k;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await freeze(page);
  const a = await probe(page);
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', x0 + dx * k * i / 4, y0); await page.waitForTimeout(16); }
  await playFor(page, 0.5);
  const b = await probe(page);
  if (shots) await page.screenshot({ path: join(shots, `steer-touch-${dx < 0 ? 'left' : 'right'}.png`) });
  await touch('touchEnd', 0, 0);
  return { d: b.x - a.x, live: b.live - a.live, t: b.t - a.t };
}

try {
  {
    const { ctx, page } = await open(false);
    for (const [key, sign] of [['ArrowLeft', -1], ['KeyA', -1], ['ArrowRight', 1], ['KeyD', 1]]) {
      const { d, live, t } = await keyRun(page, key);
      check(`key ${key} moves the rider ${sign < 0 ? 'left' : 'right'} on screen`, d * sign > 8, `screen dx ${d.toFixed(1)} px (live view ${live.toFixed(1)} px, ${t.toFixed(2)} s of play)`);
    }
    for (const [key, sign] of [['ArrowLeft', -1], ['ArrowRight', 1]]) {
      const b = await airRun(page, key);
      check(`air ${key} turns the nose ${sign < 0 ? 'left' : 'right'} on screen`, b.state === 'air' && b.nose * sign > 4, `nose dx ${b.nose.toFixed(1)} px (${b.state})`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true);
    for (const dx of [-90, 90]) {
      const { d, live, t } = await touchRun(page, dx);
      check(`touch stick ${dx < 0 ? 'left' : 'right'} moves the rider ${dx < 0 ? 'left' : 'right'} on screen`, d * Math.sign(dx) > 8, `screen dx ${d.toFixed(1)} px (live view ${live.toFixed(1)} px, ${t.toFixed(2)} s of play)`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAIL  ${failed} of ${results.length} steering checks` : `PASS  ${results.length} steering checks`);
process.exit(failed ? 1 : 0);
