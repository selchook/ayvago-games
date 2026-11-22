// City generator: renders sample cities to PNGs with the preview tool (tools/city-preview).
//
//   node scripts/city-shots.mjs [--out DIR] [--port 5433] [--url http://localhost:5173] [--only N]
//
// For every sample city: an aerial overview, street-level shots by day and by night, the plan
// (minimap) image, plus the lane graph (plan crop and a low 3D view) of the first city; then
// metrics.json (plan time, chunk build time, draw calls and triangles per shot) and a contact
// sheet of the best shots (contact-sheet.png). Uses the preinstalled Chromium (software WebGL),
// so frame times here say nothing about real devices.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('out', join(tmpdir(), 'city-shots'));
const PORT = Number(arg('port', 5433));
const ONLY = arg('only', null);
mkdirSync(OUT, { recursive: true });

/** The sample cities: style, seed, the look of their aerial shot. */
const CITIES = [
  { style: 'metropolis', seed: 1, look: 'night' },
  { style: 'coast', seed: 3, look: 'day' },
  { style: 'industrial', seed: 2, look: 'golden' },
  { style: 'suburbia', seed: 4, look: 'day' },
  { style: 'harbor', seed: 5, look: 'golden' },
  { style: 'metropolis', seed: 11, look: 'day' },
];

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const metrics = { cities: [] };

const save = (name, dataUrl) => { writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64')); return name; };
const shot = async (name, setup) => {
  const r = await page.evaluate(async (s) => {
    const c = window.__city;
    // eslint-disable-next-line no-new-func
    await new Function('c', `return (async () => { ${s} })()`)(c);
    await c.settle(3);
    const m = await c.measure(1);
    return { m, url: c.capture() };
  }, setup);
  save(name, r.url);
  return { name, calls: r.m.calls, triangles: r.m.triangles, chunks: r.m.chunks, nearTris: r.m.nearTris };
};

try {
  await page.goto(`${BASE}/tools/city-preview/?noui&nominimap&dpr=1`);
  await page.waitForFunction(() => window.__city, null, { timeout: 120000 });
  await page.evaluate(() => window.__city.pause());
  for (const [i, city] of CITIES.entries()) {
    if (ONLY !== null && String(i) !== ONLY) continue;
    const id = `${String(i + 1).padStart(2, '0')}-${city.style}-${city.seed}`;
    const t0 = Date.now();
    const info = await page.evaluate((c) => window.__city.generate({ seed: c.seed, style: c.style, look: c.look }), city);
    const shots = [];
    shots.push(await shot(`${id}-aerial-${city.look}.png`, `c.setNear(650); c.setLook('${city.look}'); c.aerial();`));
    shots.push(await shot(`${id}-aerial-low-${city.look}.png`, `c.setNear(450); c.aerial(0.45);`));
    const spots = await page.evaluate(() => window.__city.spots().map((s) => s.name));
    for (const [k, look] of [[0, 'day'], [0, 'night'], [1, city.look], [2, 'golden'], [3, 'day']]) {
      if (k >= spots.length) continue;
      shots.push(await shot(`${id}-street${k}-${spots[k]}-${look}.png`, `c.setNear(320); c.setLook('${look}'); c.street(${k});`));
    }
    save(`${id}-plan.png`, await page.evaluate(() => window.__city.minimap({ spawns: true }, 1600)));
    if (i === 0) {
      // the lane graph: a crop of the plan round the centre and a low 3D view with the overlay
      save(`${id}-lanes-plan.png`, await page.evaluate(() => { const p = window.__city.plan(); return window.__city.laneCrop(p.centre.x - 160, p.centre.z - 160, 320, 1400); }));
      shots.push(await shot(`${id}-lanes-3d.png`, `c.setNear(320); c.setLook('day'); c.setShow('lanes', true); c.setMode('orbit'); const p = c.plan(); c.pose(p.centre.x - 90, 70, p.centre.z + 110, p.centre.x, 0, p.centre.z);`));
      await page.evaluate(() => window.__city.setShow('lanes', false));
    }
    const view = await page.evaluate(() => window.__city.stats());
    metrics.cities.push({ id, ...city, plan: info, chunkBuildMs: view.avgBuildMs, chunksBuilt: view.built, shots, seconds: (Date.now() - t0) / 1000 });
    console.log(`${id}: plan ${info.ms} ms, view ${info.viewMs} ms, chunk build ${view.avgBuildMs} ms avg, ${shots.length} shots`
      + `, draw calls ${Math.min(...shots.map((s) => s.calls))}–${Math.max(...shots.map((s) => s.calls))}, tris ${Math.round(Math.min(...shots.map((s) => s.triangles)) / 1000)}k–${Math.round(Math.max(...shots.map((s) => s.triangles)) / 1000)}k`);
  }
  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1));

  // contact sheet: the picks (file names) in a 3-column grid with captions
  const picks = (arg('pick', '') || '').split(',').filter(Boolean);
  const files = picks.length ? picks : metrics.cities.flatMap((c) => [c.shots[0]?.name, c.shots.find((s) => /street0.*night|street1/.test(s.name))?.name]).filter(Boolean).slice(0, 10);
  const imgs = files.map((f) => ({ f, url: 'data:image/png;base64,' + readFileSync(join(OUT, f)).toString('base64') }));
  const sheet = await page.evaluate(async (list) => {
    const W = 640, H = 360, cols = 2, pad = 8, cap = 26;
    const rows = Math.ceil(list.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (W + pad) + pad; c.height = rows * (H + cap + pad) + pad + 40;
    const g = c.getContext('2d');
    g.fillStyle = '#15171c'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif';
    g.fillText('Ayvago procedural city generator: sample cities', pad + 4, 30);
    for (const [i, it] of list.entries()) {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = it.url; });
      const x = pad + (i % cols) * (W + pad), y = 40 + pad + Math.floor(i / cols) * (H + cap + pad);
      g.drawImage(im, x, y, W, H);
      g.fillStyle = '#cfd6e0'; g.font = '15px sans-serif';
      g.fillText(it.f.replace('.png', '').replace(/^\d+-/, ''), x + 2, y + H + 18);
    }
    return c.toDataURL('image/png');
  }, imgs);
  save('contact-sheet.png', sheet);
  console.log(`contact sheet: ${files.length} shots → ${join(OUT, 'contact-sheet.png')}`);
  if (errors.length) { console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  ')); process.exitCode = 1; }
} finally {
  await browser.close();
  stop();
}
