// Hex Realm: overworld UI check (1.2.1). Proves, by screen position as a player would:
//   - the map's MAP and HERO buttons open the world map and the hero screen with the mouse
//     (1280 × 720) and with a finger (touch at 720 × 405 and 844 × 390), and M / I do on the keys;
//   - ENTER on a place opens it, the pause button pauses;
//   - the zoom: the mouse wheel zooms round the cursor, + / - and the numpad zoom, a two-finger
//     pinch zooms (CDP touch events) and never walks the hero, both ends are clamped, the view
//     stays inside the scenery, and the zoom is kept for the next round;
//   - in battle the touch ATTACK and ROLL buttons and a skill button answer after the landscape relayout.
// Run: node games/hex-realm/ui-check.mjs [--base http://localhost:5173] [--shots <dir>]
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
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `hr-ui-${port}`) } });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}
const stop = () => { if (server) { try { process.kill(-server.pid); } catch { server.kill(); } } };

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fails.push(what); };

/** A page in Play on the map, the class chosen and the training skipped. */
async function open({ w, h, touch, lang }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/games/hex-realm/?nointro&lang=${lang}`);
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__ayvago.game.scene.getScene('Play').testSkipTutorial());
  await page.waitForTimeout(900);
  const box = await page.locator('canvas').first().boundingBox();
  const k = box.width / 1280;
  /** Game pixels to page pixels. */
  const at = (x, y) => ({ x: box.x + x * k, y: box.y + y * k });
  const play = (fn, arg) => page.evaluate(([f, a]) => new Function('p', 'a', `return (${f})(p, a)`)(window.__ayvago.game.scene.getScene('Play'), a), [fn.toString(), arg]);
  const tap = async (x, y) => { const p = at(x, y); if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  return { ctx, page, errors, at, play, tap, shot, k };
}

const panel = async (s) => {
  const r = await s.page.evaluate(() => {
    const sc = window.__ayvago.game.scene, p = sc.getScene('Play');
    return { panel: p.panel?.constructor.name ?? null, scenes: sc.getScenes(true).map((x) => x.scene.key).join(',') };
  });
  if (r.scenes !== 'Play') console.log('      (scenes: ' + r.scenes + ')');
  return r.panel;
};
const closePanel = async (s) => { await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(400); };
const zoom = (s) => s.play((p) => +p.view.zoom.toFixed(3));
const goal = (s) => s.play((p) => +p.view.zoomGoal.toFixed(3));
const settle = (s, ms = 900) => s.page.waitForTimeout(ms);
/** The camera's view on the ground stays inside the scenery (sampled along the screen's edges). */
const inside = (s) => s.play((p) => {
  const out = [];
  for (const [x, y] of [[0, 0], [640, 0], [1279, 0], [0, 719], [1279, 719]]) { const w = p.view.pick(x, y); if (w) out.push([+w.x.toFixed(2), +w.z.toFixed(2)]); }
  return out;
});

// ---------------------------------------------------------------- desktop, mouse and keys
{
  const s = await open({ w: 1280, h: 720, touch: false, lang: 'en' });
  await s.shot('en-1280-hint');
  check((await s.play((p) => p.camp.s.hints.includes('hint_zoom'))), 'desktop: the first map shows the zoom hint');
  await s.play((p) => { p.hintCard?.destroy(); p.hintCard = null; p.hintQueue = []; });
  await s.tap(1064, 656);
  await settle(s, 500);
  check(await panel(s) === 'MapScreen', 'desktop: clicking MAP opens the world map');
  await s.shot('en-1280-mapscreen-mouse');
  await closePanel(s);
  check(await panel(s) === null, 'desktop: Esc closes the world map');
  await s.tap(1196, 638);
  await settle(s, 500);
  check(await panel(s) === 'HeroScreen', 'desktop: clicking HERO opens the hero screen');
  await s.shot('en-1280-heroscreen-mouse');
  await closePanel(s);
  await s.page.keyboard.press('KeyM');
  await settle(s, 400);
  check(await panel(s) === 'MapScreen', 'desktop: M opens the world map');
  await closePanel(s);
  await s.page.keyboard.press('KeyI');
  await settle(s, 400);
  check(await panel(s) === 'HeroScreen', 'desktop: I opens the hero screen');
  await closePanel(s);
  // the tooltip under the mouse
  const hp = s.at(1196, 638);
  await s.page.mouse.move(hp.x, hp.y);
  await settle(s, 300);
  await s.shot('en-1280-tooltip');
  await s.page.mouse.move(s.at(640, 400).x, s.at(640, 400).y);
  // ENTER on the village
  await settle(s, 300);
  await s.tap(640, 626);
  await settle(s, 500);
  check(await panel(s) === 'VillageScreen', 'desktop: ENTER on the village opens it');
  await closePanel(s);
  await settle(s, 400);
  // the zoom: default, the wheel round the cursor, both clamps
  check(await zoom(s) === 1, 'desktop: the zoom starts at 1');
  await s.shot('en-1280-zoom-default');
  const pos0 = await s.play((p) => p.camp.s.pos.join(','));
  const c = s.at(900, 430);
  await s.page.mouse.move(c.x, c.y);
  const under0 = await s.play((p) => { const w = p.view.pick(900, 430); return [w.x, w.z]; });
  await s.page.mouse.wheel(0, -100);
  await settle(s, 300);
  const z1 = await goal(s);
  await settle(s, 1200);
  const under1 = await s.play((p) => { const w = p.view.pick(900, 430); return [w.x, w.z]; });
  check(z1 > 1.1, `desktop: a wheel notch up zooms in (${z1})`);
  check(Math.hypot(under0[0] - under1[0], under0[1] - under1[1]) < 0.35, 'desktop: the wheel zooms round the cursor');
  for (let i = 0; i < 20; i++) await s.page.mouse.wheel(0, -120);
  await settle(s, 1400);
  const zmax = await zoom(s);
  check(zmax === 3, `desktop: zooming in stops at the closest view (${zmax})`);
  await s.play((p) => { p.view.camFree = 0; });
  await settle(s, 1500);
  await s.shot('en-1280-zoom-min');
  for (let i = 0; i < 30; i++) await s.page.mouse.wheel(0, 120);
  await settle(s, 1400);
  const zmin = await zoom(s);
  check(zmin === 0.78, `desktop: zooming out stops at the farthest view (${zmin})`);
  await s.shot('en-1280-zoom-max');
  // drag at the farthest zoom towards every corner: the view stays inside the scenery
  let worst = 0;
  for (const [dx, dy] of [[600, 400], [-600, 400], [600, -400], [-600, -400]]) {
    for (let i = 0; i < 3; i++) {
      const a = s.at(640, 400);
      await s.page.mouse.move(a.x, a.y); await s.page.mouse.down();
      await s.page.mouse.move(a.x + dx * s.k * 0.5, a.y + dy * s.k * 0.5, { steps: 6 });
      await s.page.mouse.up();
    }
    await settle(s, 200);
    const pts = await inside(s);
    for (const [x, z] of pts) {
      const S = { zN: -16.45, zS: 10.39, wN: 19.5, wS: 13 };
      const w = S.wS + (S.wN - S.wS) * Math.min(1, Math.max(0, (S.zS - z) / (S.zS - S.zN)));
      worst = Math.max(worst, Math.abs(x) - w, S.zN - z, z - S.zS);
    }
  }
  check(worst < 0.6, `desktop: dragged to the corners at the farthest zoom, the view stays over the scenery (worst ${worst.toFixed(2)})`);
  await s.shot('en-1280-zoom-max-corner');
  const pos1 = await s.play((p) => p.camp.s.pos.join(','));
  check(pos0 === pos1, 'desktop: zooming and dragging never walked the hero');
  // keys + / - and the numpad
  await s.play((p) => p.view.setZoom(1));
  await s.page.keyboard.press('Equal');
  const zk1 = await goal(s);
  await s.page.keyboard.press('NumpadSubtract');
  await s.page.keyboard.press('NumpadSubtract');
  const zk2 = await goal(s);
  await s.page.keyboard.press('NumpadAdd');
  const zk3 = await goal(s);
  await settle(s, 1500);
  const zk4 = await zoom(s);
  check(zk1 === 1.25 && zk2 === 0.8 && zk3 === 1 && Math.abs(zk4 - 1) < 0.02, `desktop: = / numpad - / numpad + zoom (goals ${zk1}, ${zk2}, ${zk3}; eased to ${zk4})`);
  await s.page.keyboard.press('Minus');
  check(await goal(s) === 0.8, 'desktop: - zooms out');
  // the pause button
  await s.tap(1228, 52);
  await settle(s, 500);
  check(await s.page.evaluate(() => window.__ayvago.game.scene.isActive('Pause')), 'desktop: the pause button pauses');
  await s.page.keyboard.press('Escape');
  await settle(s, 500);
  // the zoom is kept for the next round
  await settle(s, 800);
  const kept = await goal(s);
  await s.page.evaluate(() => window.__ayvago.game.scene.getScene('Play').scene.restart());
  await s.page.waitForTimeout(2500);
  const after = await zoom(s);
  check(Math.abs(after - kept) < 0.01, `desktop: the zoom is kept for the next round (${kept} -> ${after})`);
  check(s.errors.length === 0, 'desktop: no page errors ' + s.errors.join(' | '));
  await s.ctx.close();
}

// ---------------------------------------------------------------- touch: phones in landscape
for (const [w, h] of [[720, 405], [844, 390]]) {
  const s = await open({ w, h, touch: true, lang: 'tr' });
  const tag = `tr-${w}x${h}`;
  check(await s.play((p) => p.controls.touchUi), `${tag}: touch UI`);
  await s.shot(`${tag}-hint`);
  await s.play((p) => { p.hintCard?.destroy(); p.hintCard = null; p.hintQueue = []; });
  await s.tap(1064, 656);
  await settle(s, 500);
  check(await panel(s) === 'MapScreen', `${tag}: tapping HARİTA opens the world map`);
  await s.shot(`${tag}-mapscreen-touch`);
  await closePanel(s);
  await s.tap(1196, 638);
  await settle(s, 500);
  check(await panel(s) === 'HeroScreen', `${tag}: tapping KAHRAMAN opens the hero screen`);
  await s.shot(`${tag}-heroscreen-touch`);
  await closePanel(s);
  await settle(s, 300);
  await s.shot(`${tag}-zoom-default`);
  // a pinch with two fingers (CDP touch events): out, then in; the hero never walks
  const cdp = await s.ctx.newCDPSession(s.page);
  const pinch = async (cx, cy, from, to) => {
    const pts = (d) => [{ x: s.at(cx - d, cy).x, y: s.at(cx, cy).y, id: 1 }, { x: s.at(cx + d, cy).x, y: s.at(cx, cy).y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts(from)[0]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * (i / 8)) });
      await s.page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pts(to)[1]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(s, 500);
  };
  const pos0 = await s.play((p) => p.camp.s.pos.join(','));
  const z0 = await zoom(s);
  await pinch(700, 420, 60, 300);
  const zin = await zoom(s);
  check(zin > z0 * 2.5, `${tag}: spreading two fingers zooms in (${z0} -> ${zin})`);
  await pinch(700, 420, 120, 360);
  check(await zoom(s) === 3, `${tag}: the pinch stops at the closest view`);
  await s.play((p) => { p.view.camFree = 0; });
  await settle(s, 1500);
  await s.shot(`${tag}-zoom-min`);
  await pinch(640, 420, 380, 40);
  await pinch(640, 420, 380, 40);
  await pinch(640, 420, 380, 40);
  check(await zoom(s) === 0.78, `${tag}: pinching stops at the farthest view (${await zoom(s)})`);
  await s.shot(`${tag}-zoom-max`);
  const pos1 = await s.play((p) => [p.camp.s.pos.join(','), p.path.length]);
  check(pos1[0] === pos0 && pos1[1] === 0, `${tag}: a pinch never walks the hero`);
  // one finger still walks: tap a neighbour of the village
  await s.play((p) => p.view.setZoom(1));
  await s.play((p) => { p.view.camFree = 0; });
  await settle(s, 1200);
  const target = await s.play((p) => { const h = p.camp.map.at(7, 13); const q = p.view.toScreen(h.x, 0.2, h.z); return [q.x, q.y]; });
  await s.tap(target[0], target[1]);
  await settle(s, 300);
  const walks = await s.play((p) => p.path.length > 0 || p.view.walking || p.camp.s.pos.join(',') !== '5,13');
  check(walks, `${tag}: a one-finger tap still walks`);
  // the battle's buttons after the landscape relayout
  await s.play((p) => { p.testFight(); p.battle.passive = true; });
  await settle(s, 1200);
  await s.play((p) => { p.__ev = []; const on = p.onEvent.bind(p); p.onEvent = (e) => { p.__ev.push(e.type); on(e); }; });
  // one button at a time, each when the hero stands ready (the game clock runs slow here)
  for (const [x, y, ev, name] of [[1150, 592, 'swing', 'SALDIR swings'], [984, 642, 'dodge', 'KAÇIŞ rolls'], [1006, 486, 'skill', 'the first skill casts it']]) {
    await s.page.waitForFunction(() => { const h = window.__ayvago.game.scene.getScene('Play').battle.hero; return h.state === 'idle' || h.state === 'run'; }, null, { timeout: 15000 }).catch(() => {});
    await s.play((p) => { p.__ev = []; });
    await s.tap(x, y);
    const ok = await s.page.waitForFunction((e) => window.__ayvago.game.scene.getScene('Play').__ev.includes(e), ev, { timeout: 8000 }).then(() => true, () => false);
    check(ok, `${tag}: tapping ${name}`);
  }
  await s.shot(`${tag}-battle`);
  check(s.errors.length === 0, `${tag}: no page errors ` + s.errors.join(' | '));
  await s.ctx.close();
}

await browser.close();
stop();
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
