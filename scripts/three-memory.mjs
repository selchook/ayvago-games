// GPU memory check for 3D games: restarts the Play scene and reads three.js renderer.info.memory
// (textures, geometries) right after each shutdown, when the old World3D is freed and the next
// one is not built yet. What is left there must not grow from one restart to the next.
//
// Every round starts from the same random numbers, so each builds the same world: a model drawn
// for the first time uploads its shared buffers once, which would otherwise look like growth.
// One warm-up restart comes first for the same reason.
//
// Usage: node scripts/three-memory.mjs [--dist] [--restarts=N] [slug ...]
//   default: every game that imports @core/three, served by the Vite dev server, 5 restarts.
//   --dist   serve the production build in dist/ (run npm run build first).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dist = args.includes('--dist');
const restarts = Number(args.find((a) => a.startsWith('--restarts='))?.split('=')[1] ?? 5);
const only = args.filter((a) => !a.startsWith('--'));
const uses3d = (slug) => readdirSync(join(root, 'games', slug), { recursive: true })
  .some((f) => String(f).endsWith('.ts') && readFileSync(join(root, 'games', slug, String(f)), 'utf8').includes('@core/three'));
const slugs = (only.length ? only : readdirSync(join(root, 'games')).filter(uses3d))
  .filter((s) => existsSync(dist ? join(root, 'dist', 'games', s, 'index.html') : join(root, 'games', s, 'index.html')));
if (!slugs.length) { console.error('no 3D game to check' + (dist ? ' (run npm run build first)' : '')); process.exit(1); }

const PORT = 4800 + Math.floor(Math.random() * 400);
const server = spawn('npx', dist ? ['vite', 'preview', '--port', String(PORT), '--strictPort'] : ['vite', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });
const stopServer = () => { try { process.kill(-server.pid); } catch { server.kill(); } };
const BASE = `http://localhost:${PORT}`;

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
let failed = 0;

async function check(slug) {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    let a = 1;
    window.__seed = (n) => { a = n >>> 0; window.Phaser?.Math.RND.sow([String(n)]); };
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await page.goto(`${BASE}/games/${slug}/?nointro&lang=en`);
  const isActive = (k) => page.waitForFunction((key) => window.__ayvago?.game.scene.isActive(key), k, { timeout: 60000 });
  await page.waitForFunction(() => ['Menu', 'Play'].some((k) => window.__ayvago?.game.scene.isActive(k)), null, { timeout: 60000 });
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => window.__ayvago.game.scene.isActive('Play')))) await page.keyboard.press('Enter');
  await isActive('Play');

  // the shared renderer, found through the Play scene's World3D (whatever the field is called)
  const sample = () => page.evaluate(() => {
    const play = window.__ayvago.game.scene.getScene('Play');
    const w = Object.values(play).find((v) => v?.renderer?.info && v.scene && v.camera);
    window.__renderer = w.renderer;
    return { ...w.renderer.info.memory };
  });
  const restart = () => page.evaluate(() => new Promise((done) => {
    const play = window.__ayvago.game.scene.getScene('Play');
    // runs after World3D's own shutdown handler, which was registered first
    play.events.once('shutdown', () => done({ ...window.__renderer.info.memory }));
    window.__seed(12345);
    play.scene.restart();
  }));
  const round = async () => { await isActive('Play'); await page.waitForTimeout(2500); return sample(); };

  await page.waitForTimeout(2500);
  await sample();
  await restart(); // warm-up
  const live = [await round()], left = [];
  for (let i = 0; i < restarts; i++) {
    left.push(await restart());
    live.push(await round());
  }
  await page.close();

  const row = (a, k) => a.map((r) => r[k]).join(' → ');
  const grows = (k) => left.some((r) => r[k] > left[0][k]);
  const ok = !grows('textures') && !grows('geometries') && !errors.length;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${slug}
      after shutdown  textures ${row(left, 'textures')}   geometries ${row(left, 'geometries')}
      in play         textures ${row(live, 'textures')}   geometries ${row(live, 'geometries')}${errors.length ? '\n      errors: ' + errors.join(' | ') : ''}`);
}

try {
  for (const slug of slugs) {
    try { await check(slug); } catch (e) { failed++; console.log(`FAIL  ${slug}\n      ${String(e.message).split('\n')[0]}`); }
  }
} finally {
  await browser.close();
  stopServer();
}
console.log(`\n${slugs.length - failed}/${slugs.length} 3D games keep GPU memory flat over ${restarts} restarts`);
process.exit(failed ? 1 : 0);
