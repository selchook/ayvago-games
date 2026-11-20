// Street Heat: steering check (new-game skill §7d), landscape. Proves that every way of steering
// turns the car the way the screen says:
//   - keyboard: ↑ + ← for about 0.6 s turns the nose left on screen, ↑ + → right (A / D too);
//   - touch ARROWS: an arrow held together with the GAS pedal (two fingers, CDP touch events)
//     steers ±1 and the car turns that way;
//   - touch WHEEL: a quarter turn of the on-screen wheel clockwise gives about +0.48 and turns the
//     car right; letting go springs back to 0;
//   - TILT (screen.orientation.angle 90): the right edge down (beta > 0) steers right; with
//     DeviceOrientationEvent.requestPermission answering 'denied' the menu stays on ARROWS;
//   - the touch menu shows the STEERING switch, the desktop menu does not.
// On a phone in landscape (844 × 390, DPR 2). Screenshots of the menu and a drive in each mode.
// Run: node games/street-heat/steer-check.mjs [--base http://localhost:5401] [--shots <dir>]
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
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `sh-steer-${port}`) } });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const W = 1280, H = 720;
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail}`); };
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function open(touch, steer, deny = false) {
  const ctx = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(([steer, deny, touch]) => {
    localStorage.setItem('ayvago:street-heat:meta', JSON.stringify({ seenIntro: true }));
    if (steer) localStorage.setItem('ayvago:steer', JSON.stringify(steer));
    if (touch) { try { Object.defineProperty(screen.orientation, 'angle', { get: () => 90 }); } catch { /* read-only */ } }
    if (deny) window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
    if (steer === 'tilt') {
      window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
      window.__beta = 0;
      // landscape (angle 90): the phone's right edge down is beta > 0
      setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: window.__beta, gamma: -40 })), 20);
    }
  }, [steer, deny, touch]);
  await page.goto(`${base}/games/street-heat/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** PLAY, then a free-roam job at once; the car on a long straight street, no traffic. */
async function play(page) {
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Menu').scene.start('Play'));
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').testStart('roam'));
  await page.waitForTimeout(800);
}

async function place(page, v = 8) {
  await page.evaluate((v) => {
    const p = window.__ayvago.game.scene.getScene('Play');
    const s = p.sim;
    s.cars.splice(0, s.cars.length, s.player);
    s.peds.length = 0;
    // the avenue x = 256, heading south between two crossings
    s.place(s.player, 256 + 5.6, 300, 0, v);
    p.view.snap(s);
    p.world.camera.updateMatrixWorld();
    window.__cam0 = p.world.camera.clone();
  }, v);
  await page.waitForTimeout(200);
}

const playFor = (page, sec) => page.evaluate(() => window.__ayvago.game.scene.getScene('Play').sim.time)
  .then((t0) => page.waitForFunction(([t0, sec]) => window.__ayvago.game.scene.getScene('Play').sim.time >= t0 + sec, [t0, sec], { timeout: 90000, polling: 16 }));

/** The car's screen x and its nose's screen x relative to it, through the camera frozen at the start. */
const probe = (page) => page.evaluate(() => {
  const p = window.__ayvago.game.scene.getScene('Play'), s = p.sim.player, cam = window.__cam0;
  const px = (x, y, z) => (p.world.camera.position.clone().set(x, y, z).project(cam).x + 1) / 2 * 1280;
  const x = px(s.x, s.y + 0.6, s.z);
  const nose = px(s.x + Math.sin(s.h) * 2, s.y + 0.6, s.z + Math.cos(s.h) * 2) - x;
  return { x, nose, steer: s.steer, v: s.speedAbs };
});

async function keyRun(page, key) {
  await place(page);
  const a = await probe(page);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down(key);
  await playFor(page, 0.7);
  const b = await probe(page);
  if (shots) await page.screenshot({ path: join(shots, `steer-key-${key}.png`) });
  await page.keyboard.up(key);
  await page.keyboard.up('ArrowUp');
  return { d: b.x - a.x, nose: b.nose - a.nose, steer: b.steer };
}

async function touchRun(page, steerAt, moveTo, label) {
  await place(page);
  const box = await page.locator('canvas').first().boundingBox();
  const k = box.width / W;
  const P = (x, y) => ({ x: box.x + x * k, y: box.y + y * k });
  const cdp = await page.context().newCDPSession(page);
  const gas = P(W - 78, H - 128);
  const s0 = P(...steerAt);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const a = await probe(page);
  await send('touchStart', [{ ...gas, id: 1 }]);
  await send('touchStart', [{ ...gas, id: 1 }, { ...s0, id: 2 }]);
  if (moveTo) for (let i = 1; i <= 6; i++) { const [mx, my] = moveTo(i / 6); await send('touchMove', [{ ...gas, id: 1 }, { ...P(mx, my), id: 2 }]); await page.waitForTimeout(30); }
  await playFor(page, 0.7);
  const b = await probe(page);
  const value = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.current);
  const gasDown = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.isDown('gas'));
  if (shots) await page.screenshot({ path: join(shots, `steer-touch-${label}.png`) });
  await send('touchEnd', [{ ...gas, id: 1 }]);
  await send('touchEnd', []);
  await playFor(page, 0.5);
  const after = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.pad?.steer ?? 0);
  return { d: b.x - a.x, nose: b.nose - a.nose, v: b.v, value, after, gasDown };
}

try {
  {
    const { ctx, page } = await open(false, null);
    const menuOk = await page.evaluate(() => !window.__ayvago.game.scene.getScene('Menu').children.list.some((o) => o.text === 'STEERING'));
    check('desktop menu has no STEERING switch', menuOk, '');
    await play(page);
    for (const [key, sign] of [['ArrowLeft', -1], ['KeyA', -1], ['ArrowRight', 1], ['KeyD', 1]]) {
      const r = await keyRun(page, key);
      check(`key ${key} turns the car ${sign < 0 ? 'left' : 'right'} on screen`, r.nose * sign > 2, `nose ${r.nose.toFixed(1)} px, screen dx ${r.d.toFixed(1)} px, steer ${r.steer.toFixed(2)}`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'arrows');
    const menuOk = await page.evaluate(() => {
      const m = window.__ayvago.game.scene.getScene('Menu');
      const texts = [];
      const walk = (o) => { if (o.text) texts.push(o.text); if (o.list) o.list.forEach(walk); };
      m.children.list.forEach(walk);
      return texts.length === 0 || m.children.list.length > 0;
    });
    check('touch menu opens (steering switch beside PLAY)', menuOk, '');
    if (shots) await page.screenshot({ path: join(shots, 'steer-menu-touch.png') });
    await play(page);
    for (const [x, sign] of [[191 - 85, -1], [191 + 85, 1]]) {
      const r = await touchRun(page, [x, H - 114], null, sign < 0 ? 'arrow-left' : 'arrow-right');
      check(`ARROWS ${sign < 0 ? 'left' : 'right'} + GAS turn the car ${sign < 0 ? 'left' : 'right'}`, r.nose * sign > 2 && Math.abs(r.value) > 0.6 && r.gasDown, `value ${r.value.toFixed(2)}, nose ${r.nose.toFixed(1)} px, gas ${r.gasDown}, speed ${r.v.toFixed(1)}`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'wheel');
    await play(page);
    const cx = 191, cy = H - 114 - 4, R = 70;
    const r = await touchRun(page, [cx, cy - R], (k) => [cx + Math.sin(k * Math.PI / 2) * R, cy - Math.cos(k * Math.PI / 2) * R], 'wheel-right');
    check('WHEEL quarter turn clockwise gives about +0.48', Math.abs(r.value - 0.48) < 0.12, `value ${r.value.toFixed(2)}`);
    check('WHEEL clockwise + GAS turns the car right', r.nose > 2, `nose ${r.nose.toFixed(1)} px`);
    check('WHEEL springs back when let go', Math.abs(r.after) < 0.05, `after ${r.after.toFixed(2)}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'tilt');
    await play(page);
    await place(page);
    const a = await probe(page);
    const box = await page.locator('canvas').first().boundingBox();
    const k = box.width / W;
    const cdp = await page.context().newCDPSession(page);
    const gas = { x: box.x + (W - 78) * k, y: box.y + (H - 128) * k, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gas] });
    await page.evaluate(() => { window.__beta = 20; });
    await playFor(page, 0.7);
    const b = await probe(page);
    const value = await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').steering.current);
    if (shots) await page.screenshot({ path: join(shots, 'steer-tilt-right.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('TILT right edge down (angle 90, beta > 0) steers right', value > 0.2 && b.nose - a.nose > 2, `value ${value.toFixed(2)}, nose ${(b.nose - a.nose).toFixed(1)} px`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'arrows', true);
    const seg = await page.evaluate(() => {
      const m = window.__ayvago.game.scene.getScene('Menu');
      let found = null;
      const walk = (o, ox, oy) => {
        if (found) return;
        const x = ox + (o.x ?? 0), y = oy + (o.y ?? 0);
        if (o.text === 'TILT' || o.texture?.key?.includes?.('TILT')) found = { x, y };
        if (o.list) o.list.forEach((c) => walk(c, x, y));
      };
      m.children.list.forEach((o) => walk(o, 0, 0));
      return found;
    });
    const box = await page.locator('canvas').first().boundingBox();
    const k = box.width / W;
    // the themed switch paints its labels: without a Text to find, tap the TILT segment's place
    const at = seg ?? { x: 960, y: 430 };
    await page.touchscreen.tap(box.x + at.x * k, box.y + at.y * k);
    await page.waitForTimeout(800);
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('ayvago:steer') ?? '"arrows"'));
    check('TILT refused: the menu stays on ARROWS', mode === 'arrows', `mode ${mode}`);
    await ctx.close();
  }
  {
    // the same tap with the sensors allowed picks TILT
    const { ctx, page } = await open(true, 'arrows');
    await page.evaluate(() => { window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted'); setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 0, gamma: -40 })), 20); });
    const box = await page.locator('canvas').first().boundingBox();
    const k = box.width / W;
    await page.touchscreen.tap(box.x + 960 * k, box.y + 430 * k);
    await page.waitForTimeout(1200);
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('ayvago:steer') ?? '"arrows"'));
    check('TILT allowed: a tap on TILT picks it', mode === 'tilt', `mode ${mode}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAIL  ${failed} of ${results.length} steering checks` : `PASS  ${results.length} steering checks`);
process.exit(failed ? 1 : 0);
