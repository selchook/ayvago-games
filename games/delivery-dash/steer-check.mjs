// Delivery Dash: steering check. Proves that every way of steering turns the van the way the
// screen says (new-game skill §7d):
//   - keyboard: ↑ + ← for about 0.6 s moves the van to the screen's left and turns its nose left;
//     ↑ + → to the right;
//   - touch ARROWS: the left arrow button held together with the GAS pedal (two fingers, CDP
//     touch events) turns left, the right arrow right, and the pedal drives;
//   - touch WHEEL: a quarter turn of the on-screen wheel clockwise gives about +0.48 and turns the
//     van right; letting go springs back to 0;
//   - TILT: device orientation with the right edge down (gamma > 0) steers right; with
//     DeviceOrientationEvent.requestPermission answering 'denied' the menu stays on ARROWS.
// Run: node games/delivery-dash/steer-check.mjs [--base http://localhost:5173] [--shots <dir>]
//   Without --base it starts its own Vite dev server. Exits 1 when a check fails.
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
  const port = 4800 + Math.floor(Math.random() * 400);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `dd-steer-${port}`) } });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail}`); };
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function open(touch, steer, deny = false) {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(([steer, deny]) => {
    localStorage.setItem('ayvago:delivery-dash:meta', JSON.stringify({ mode: 'shift', shift: 2, tutorial: true, stars: { 1: 3 } }));
    if (steer) localStorage.setItem('ayvago:steer', JSON.stringify(steer));
    if (deny) window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
    // a phone held upright: the sensors report all the time (window.__gamma tilts it)
    if (steer === 'tilt') {
      // the player allowed the sensors (Chromium's mobile emulation asks, and says no without a tap)
      window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
      window.__gamma = 0;
      setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 30, gamma: window.__gamma })), 20);
    }
  }, [steer, deny]);
  await page.goto(`${base}/games/delivery-dash/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 90000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

async function play(page) {
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Menu').scene.start('Play'));
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
}

/** The van on Old Town's long north–south street (col 4), heading north at speed v, no traffic near. */
async function place(page, v = 6) {
  await page.evaluate((v) => {
    const p = window.__ayvago.game.scene.getScene('Play');
    p.sim.cars.length = 0;
    p.testPlace(9, 4, 0, v);
  }, v);
  await page.waitForTimeout(300);
  await page.evaluate((v) => { const p = window.__ayvago.game.scene.getScene('Play'); p.testPlace(9, 4, 0, v); p.world.camera.updateMatrixWorld(); window.__cam0 = p.world.camera.clone(); }, v);
}

/** Waits until the simulation has run `sec` more seconds (software WebGL is slow: wall time says little). */
const playFor = (page, sec) => page.evaluate(() => window.__ayvago.game.scene.getScene('Play').sim.time)
  .then((t0) => page.waitForFunction(([t0, sec]) => window.__ayvago.game.scene.getScene('Play').sim.time >= t0 + sec, [t0, sec], { timeout: 60000, polling: 16 }));

/** The van's screen x and its nose's screen x relative to it, through the camera frozen at the start. */
const probe = (page) => page.evaluate(() => {
  const p = window.__ayvago.game.scene.getScene('Play'), s = p.sim, cam = window.__cam0;
  const px = (x, y, z) => (p.world.camera.position.clone().set(x, y, z).project(cam).x + 1) / 2 * 720;
  const x = px(s.x, s.y + 0.6, s.z);
  const nose = px(s.x + Math.sin(s.h) * 2, s.y + 0.6, s.z + Math.cos(s.h) * 2) - x;
  return { x, nose, steer: s.steer, v: s.v, t: s.time };
});

async function keyRun(page, key) {
  await place(page);
  const a = await probe(page);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down(key);
  await playFor(page, 0.6);
  const b = await probe(page);
  if (shots) await page.screenshot({ path: join(shots, `steer-key-${key}.png`) });
  await page.keyboard.up(key);
  await page.keyboard.up('ArrowUp');
  return { d: b.x - a.x, nose: b.nose, steer: b.steer };
}

/** Two fingers: one on a steering point, one on the GAS pedal (CDP touch events). */
async function touchRun(page, steerAt, moveTo, label) {
  await place(page);
  const box = await page.locator('canvas').first().boundingBox();
  const k = box.width / 720;
  const P = (x, y) => ({ x: box.x + x * k, y: box.y + y * k });
  const cdp = await page.context().newCDPSession(page);
  const gas = P(720 - 84, 1280 - 140);
  const s0 = P(...steerAt);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const a = await probe(page);
  await send('touchStart', [{ ...gas, id: 1 }]);
  await send('touchStart', [{ ...gas, id: 1 }, { ...s0, id: 2 }]);
  if (moveTo) {
    for (let i = 1; i <= 6; i++) {
      const [mx, my] = moveTo(i / 6);
      await send('touchMove', [{ ...gas, id: 1 }, { ...P(mx, my), id: 2 }]);
      await page.waitForTimeout(30);
    }
  }
  await playFor(page, 0.6);
  const b = await probe(page);
  const value = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.current);
  if (shots) await page.screenshot({ path: join(shots, `steer-touch-${label}.png`) });
  await send('touchEnd', [{ ...gas, id: 1 }]);
  await send('touchEnd', []);
  await playFor(page, 0.5);
  const after = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.pad?.steer ?? 0);
  return { d: b.x - a.x, nose: b.nose, v: b.v, value, after };
}

try {
  {
    const { ctx, page } = await open(false, null);
    await play(page);
    for (const [key, sign] of [['ArrowLeft', -1], ['KeyA', -1], ['ArrowRight', 1], ['KeyD', 1]]) {
      const r = await keyRun(page, key);
      check(`key ${key} turns the van ${sign < 0 ? 'left' : 'right'} on screen`, r.d * sign > 4 && r.nose * sign > 4, `screen dx ${r.d.toFixed(1)} px, nose ${r.nose.toFixed(1)} px, steer ${r.steer.toFixed(2)}`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'arrows');
    const menuOk = await page.evaluate(() => window.__ayvago.game.scene.getScene('Menu').children.list.some((o) => o.text === 'STEERING' || o.text === 'KONTROL'));
    check('touch menu shows the STEERING switch', menuOk, '');
    if (shots) await page.screenshot({ path: join(shots, 'steer-menu-touch.png') });
    await play(page);
    for (const [x, sign] of [[191 - 85, -1], [191 + 85, 1]]) {
      const r = await touchRun(page, [x, 1280 - 114], null, sign < 0 ? 'arrow-left' : 'arrow-right');
      check(`ARROWS ${sign < 0 ? 'left' : 'right'} + GAS turn the van ${sign < 0 ? 'left' : 'right'}`, r.d * sign > 4 && Math.abs(r.value) > 0.6, `screen dx ${r.d.toFixed(1)} px, value ${r.value.toFixed(2)}, speed ${r.v.toFixed(1)}`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'wheel');
    await play(page);
    // a quarter turn clockwise: from the top of the wheel round to its right side
    const cx = 191, cy = 1280 - 114 - 4, R = 70;
    const r = await touchRun(page, [cx, cy - R], (k) => [cx + Math.sin(k * Math.PI / 2) * R, cy - Math.cos(k * Math.PI / 2) * R], 'wheel-right');
    check('WHEEL quarter turn clockwise gives about +0.48', Math.abs(r.value - 0.48) < 0.12, `value ${r.value.toFixed(2)}`);
    check('WHEEL clockwise + GAS turns the van right', r.d > 4, `screen dx ${r.d.toFixed(1)} px`);
    check('WHEEL springs back when let go', Math.abs(r.after) < 0.05, `after ${r.after.toFixed(2)}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'tilt');
    await play(page);
    await place(page);
    const a = await probe(page);
    const box = await page.locator('canvas').first().boundingBox();
    const k = box.width / 720;
    const cdp = await page.context().newCDPSession(page);
    const gas = { x: box.x + (720 - 84) * k, y: box.y + (1280 - 140) * k, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gas] });
    await page.evaluate(() => { window.__gamma = 20; });
    await playFor(page, 0.6);
    const b = await probe(page);
    const value = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.current);
    if (shots) await page.screenshot({ path: join(shots, 'steer-tilt-right.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('TILT right edge down steers right', value > 0.2 && b.x - a.x > 4, `value ${value.toFixed(2)}, screen dx ${(b.x - a.x).toFixed(1)} px`);
    await ctx.close();
  }
  {
    // iOS refusing the sensors: choosing TILT on the menu keeps ARROWS
    const { ctx, page } = await open(true, 'arrows', true);
    const seg = await page.evaluate(() => {
      const m = window.__ayvago.game.scene.getScene('Menu');
      const lb = m.children.list.find((o) => o.text === 'TILT');
      return lb ? { x: lb.x, y: lb.y } : null;
    });
    const box = await page.locator('canvas').first().boundingBox();
    const k = box.width / 720;
    if (seg) await page.touchscreen.tap(box.x + seg.x * k, box.y + seg.y * k);
    await page.waitForTimeout(800);
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('ayvago:steer') ?? '"arrows"'));
    check('TILT refused: the menu stays on ARROWS', !!seg && mode === 'arrows', `mode ${mode}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAIL  ${failed} of ${results.length} steering checks` : `PASS  ${results.length} steering checks`);
process.exit(failed ? 1 : 0);
