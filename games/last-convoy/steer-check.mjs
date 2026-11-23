// Last Convoy: steering check of the escape drive. Proves that every way of steering turns the
// convoy the way the screen says (new-game skill §7d), in the game's landscape frame:
//   - keyboard: ↑ + ← (or A) for about 0.6 s moves the car to the screen's left and turns its nose
//     left; ↑ + → (or D) to the right;
//   - touch ARROWS: the left arrow button held together with the GAS pedal (two fingers, CDP touch
//     events) turns left, the right arrow right, and the pedal drives;
//   - touch WHEEL: a quarter turn of the on-screen wheel clockwise gives about +0.48 and turns the
//     car right; letting go springs back to 0;
//   - TILT (screen angle 90, landscape): the right edge down (beta > 0) steers right; with
//     DeviceOrientationEvent.requestPermission answering 'denied' the menu stays on ARROWS;
//   - the touch menu shows the STEERING switch, and the drive's NITRO button fires a nitro.
// Run: node games/last-convoy/steer-check.mjs [--base http://localhost:5421] [--shots <dir>]
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
  const port = 5425 + Math.floor(Math.random() * 4);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `lc-steer-${port}`) } });
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
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(([steer, deny]) => {
    localStorage.setItem('ayvago:last-convoy:meta', JSON.stringify({ tutorial: true, driveTaught: true, unlocked: 3 }));
    if (steer) localStorage.setItem('ayvago:steer', JSON.stringify(steer));
    // a phone held in landscape (its top on the player's left)
    try { Object.defineProperty(screen.orientation, 'angle', { get: () => 90 }); } catch { /* read-only here */ }
    if (deny) window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
    if (steer === 'tilt') {
      window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
      window.__beta = 0;
      setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: window.__beta, gamma: -30 })), 20);
    }
  }, [steer, deny]);
  await page.goto(`${base}/games/last-convoy/?nointro&lang=en`);
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

/** Into the Play scene and straight onto the drive of mission 1. */
async function drive(page) {
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Menu').scene.start('Play'));
  await page.waitForFunction(() => window.__lc?.play?.sys?.isActive(), null, { timeout: 60000 });
  await page.evaluate(() => window.__lc.drive(1));
  await page.waitForTimeout(800);
}

async function place(page, v = 8) {
  await page.evaluate((v) => { const p = window.__lc.play; p.testPlace(v); }, v);
  await page.waitForTimeout(250);
  await page.evaluate((v) => { const p = window.__lc.play; p.testPlace(v); p.driveView.sync(p.drive, 0.3); p.world.camera.updateMatrixWorld(); window.__cam0 = p.world.camera.clone(); }, v);
}

/** Waits until the drive has run `sec` more seconds of its own time. */
const playFor = (page, sec) => page.evaluate(() => window.__lc.play.drive.time)
  .then((t0) => page.waitForFunction(([t0, sec]) => window.__lc.play.drive.time >= t0 + sec, [t0, sec], { timeout: 90000, polling: 16 }));

/** The car's screen x and its nose's screen x relative to it, through the camera frozen at the start. */
const probe = (page) => page.evaluate(([W]) => {
  const p = window.__lc.play, d = p.drive, cam = window.__cam0;
  const px = (x, y, z) => (p.world.camera.position.clone().set(x, y, z).project(cam).x + 1) / 2 * W;
  const x = px(d.x, 0.6, d.z);
  const nose = px(d.x + Math.sin(d.h) * 2.5, 0.6, d.z + Math.cos(d.h) * 2.5) - x;
  return { x, nose, steer: d.steer, v: d.v, t: d.time, nitro: d.nitro, nitroT: d.nitroT };
}, [W]);

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
  const k = box.width / W;
  const P = (x, y) => ({ x: box.x + x * k, y: box.y + y * k });
  const cdp = await page.context().newCDPSession(page);
  const gas = P(1180, 560);
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
  const value = await page.evaluate(() => window.__lc.play.steering.current);
  if (shots) await page.screenshot({ path: join(shots, `steer-touch-${label}.png`) });
  await send('touchEnd', [{ ...gas, id: 1 }]);
  await send('touchEnd', []);
  await playFor(page, 0.5);
  const after = await page.evaluate(() => window.__lc.play.steering.pad?.steer ?? 0);
  return { d: b.x - a.x, nose: b.nose, v: b.v, value, after };
}

try {
  {
    const { ctx, page } = await open(false, null);
    await drive(page);
    for (const [key, sign] of [['ArrowLeft', -1], ['KeyA', -1], ['ArrowRight', 1], ['KeyD', 1]]) {
      const r = await keyRun(page, key);
      check(`key ${key} turns the convoy ${sign < 0 ? 'left' : 'right'} on screen`, r.d * sign > 4 && r.nose * sign > 4, `screen dx ${r.d.toFixed(1)} px, nose ${r.nose.toFixed(1)} px, steer ${r.steer.toFixed(2)}`);
    }
    // Space fires a nitro
    await place(page, 10);
    const n0 = await probe(page);
    await page.keyboard.press('Space');
    await playFor(page, 0.2);
    const n1 = await probe(page);
    check('Space fires a nitro', n1.nitro === n0.nitro - 1 && n1.nitroT > 0, `nitro ${n0.nitro} → ${n1.nitro}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'arrows');
    const menuOk = await page.evaluate(() => window.__ayvago.game.scene.getScene('Menu').children.list.some((o) => o.text === 'STEERING' || o.text === 'KONTROL'));
    check('touch menu shows the STEERING switch', menuOk, '');
    if (shots) await page.screenshot({ path: join(shots, 'steer-menu-touch.png') });
    await drive(page);
    const pad = await page.evaluate(() => { const p = window.__lc.play.steering.pad; return { x: p.steerX, y: p.steerY }; });
    for (const [x, sign] of [[pad.x - 85, -1], [pad.x + 85, 1]]) {
      const r = await touchRun(page, [x, pad.y], null, sign < 0 ? 'arrow-left' : 'arrow-right');
      check(`ARROWS ${sign < 0 ? 'left' : 'right'} + GAS turn the convoy ${sign < 0 ? 'left' : 'right'}`, r.d * sign > 4 && Math.abs(r.value) > 0.6, `screen dx ${r.d.toFixed(1)} px, value ${r.value.toFixed(2)}, speed ${r.v.toFixed(1)}`);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'wheel');
    await drive(page);
    const pad = await page.evaluate(() => { const p = window.__lc.play.steering.pad; return { x: p.steerX, y: p.steerY }; });
    const cx = pad.x, cy = pad.y - 4, R = 70;
    const r = await touchRun(page, [cx, cy - R], (k) => [cx + Math.sin(k * Math.PI / 2) * R, cy - Math.cos(k * Math.PI / 2) * R], 'wheel-right');
    check('WHEEL quarter turn clockwise gives about +0.48', Math.abs(r.value - 0.48) < 0.12, `value ${r.value.toFixed(2)}`);
    check('WHEEL clockwise + GAS turns the convoy right', r.d > 4, `screen dx ${r.d.toFixed(1)} px`);
    check('WHEEL springs back when let go', Math.abs(r.after) < 0.05, `after ${r.after.toFixed(2)}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(true, 'tilt');
    await drive(page);
    await place(page);
    const a = await probe(page);
    const box = await page.locator('canvas').first().boundingBox();
    const k = box.width / W;
    const cdp = await page.context().newCDPSession(page);
    const gas = { x: box.x + 1180 * k, y: box.y + 560 * k, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gas] });
    await page.evaluate(() => { window.__beta = 20; });
    await playFor(page, 0.6);
    const b = await probe(page);
    const value = await page.evaluate(() => window.__lc.play.steering.current);
    if (shots) await page.screenshot({ path: join(shots, 'steer-tilt-right.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('TILT (landscape) right edge down steers right', value > 0.2 && b.x - a.x > 4, `value ${value.toFixed(2)}, screen dx ${(b.x - a.x).toFixed(1)} px`);
    // the NITRO button
    await place(page, 10);
    const n0 = await probe(page);
    const nb = { x: box.x + 1050 * k, y: box.y + 418 * k, id: 3 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [nb] });
    await playFor(page, 0.2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const n1 = await probe(page);
    check('the NITRO button fires a nitro', n1.nitro === n0.nitro - 1, `nitro ${n0.nitro} → ${n1.nitro}`);
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
    const k = box.width / W;
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
