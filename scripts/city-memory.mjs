// City generator: GPU memory check of chunk streaming (like test:three-memory for games).
// Drives the preview tool's camera across a city and back several times and reads three.js
// renderer.info.memory at the same spot after each pass: geometries and textures must not grow.
// Then regenerates the city a few times (the old CityView is disposed) and checks the same.
//
// The first pass is a warm-up (instanced props first seen on the way upload their mesh once).
//
//   node scripts/city-memory.mjs [--url http://localhost:5173] [--port 5434] [--passes 3]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(arg('port', 5434));
const PASSES = Number(arg('passes', 3));
let server = null;
let BASE = arg('url', null);
if (!BASE) {
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${PORT}`) },
  });
  await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 15000); });
  BASE = `http://localhost:${PORT}`;
}
const stop = () => { if (server) try { process.kill(-server.pid); } catch { server.kill(); } };

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let ok = true;
try {
  await page.goto(`${BASE}/tools/city-preview/?noui&nominimap&dpr=1`);
  await page.waitForFunction(() => window.__city, null, { timeout: 120000 });
  const result = await page.evaluate(async (passes) => {
    const c = window.__city;
    c.pause();
    c.generate({ seed: 1, style: 'metropolis', look: 'day' });
    c.setMode('street');
    c.setNear(300);
    const p = c.plan();
    const z = p.centre.z, S = p.size;
    const at = async (x) => { c.pose(x, 1.7, z, x + 50, 1.7, z); for (let i = 0; i < 3; i++) c.frame(); };
    const home = async () => { await at(S * 0.12); await c.settle(2); return { ...c.memory(), chunks: c.stats().chunks }; };
    const out = { start: await home(), passes: [], peak: 0, regen: [] };
    for (let k = 0; k < passes; k++) {
      // across the city and back, 40 m a step
      for (let x = S * 0.12; x <= S * 0.88; x += 40) { await at(x); out.peak = Math.max(out.peak, c.memory().geometries); }
      for (let x = S * 0.88; x >= S * 0.12; x -= 40) { await at(x); out.peak = Math.max(out.peak, c.memory().geometries); }
      out.passes.push(await home());
    }
    for (let k = 0; k < 3; k++) {
      c.generate({ seed: 1, style: 'metropolis', look: 'day' });
      c.setMode('street');
      out.regen.push(await home());
    }
    return out;
  }, PASSES);
  const row = (a, k) => a.map((r) => r[k]).join(' → ');
  const flat = (a, k) => a.every((r) => r[k] === a[0][k]);
  // the first pass is the warm-up: meshes first drawn on the way (props of other districts) upload once
  const passOk = flat(result.passes, 'geometries') && flat(result.passes, 'textures');
  const regenOk = flat(result.regen, 'geometries') && flat(result.regen, 'textures');
  ok = passOk && regenOk && !errors.length;
  console.log(`streaming  start geometries ${result.start.geometries} textures ${result.start.textures} (chunks ${result.start.chunks})`);
  console.log(`           after each pass  geometries ${row(result.passes, 'geometries')}   textures ${row(result.passes, 'textures')}   (peak ${result.peak})  ${passOk ? 'PASS' : 'FAIL'}`);
  console.log(`regenerate geometries ${row(result.regen, 'geometries')}   textures ${row(result.regen, 'textures')}  ${regenOk ? 'PASS' : 'FAIL'}`);
  if (errors.length) console.log('page errors: ' + errors.join(' | '));
} finally {
  await browser.close();
  stop();
}
console.log(ok ? 'city memory: PASS' : 'city memory: FAIL');
process.exit(ok ? 0 : 1);
