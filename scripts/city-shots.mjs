// City generator: renders sample shots with the preview tool (tools/city-preview).
//
//   node scripts/city-shots.mjs [--out DIR] [--port 5433] [--url http://localhost:5173] [--seed 3]
//                               [--only REGEX]   (re-render the shots whose names match, keep the rest)
//                               [--pick a.png,b.png,…] [--sheet-only]   (re-pick the contact sheet without rendering)
//
// The coast town (the primary style) first: its main street and a low aerial at sunrise, noon,
// sunset and night, a close-up of the kit-built main street, the pier, the lighthouse, the marina
// and the beach, a six-frame time-lapse of one view (timelapse.png) and its plan. Then one or two
// shots of each other style. Writes metrics.json (GL draw calls and triangles per shot, the
// shadow pass included, kit buildings and triangles, plan and view times) and contact-sheet.png.
// Uses the preinstalled Chromium (software WebGL), so frame times here say nothing about devices.
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
const SEED = Number(arg('seed', 3));
const ONLY = arg('only', null) ? new RegExp(arg('only')) : null;
mkdirSync(OUT, { recursive: true });

/** The coast town's hours: sunrise, noon, sunset, night. */
const HOURS = { sunrise: 6.55, noon: 12.5, sunset: 19.15, night: 22.3 };
/** The time-lapse: one view at six hours. */
const LAPSE = [5.7, 6.6, 12, 18.6, 19.5, 22];
/** The other styles. */
const OTHERS = [
  { style: 'metropolis', seed: 1, shots: [['street', 0, 22.5], ['aerial', 0.45, 22.5]] },
  { style: 'industrial', seed: 2, shots: [['aerial', 0.6, 18.4], ['detail', 'docks', 9]] },
  { style: 'suburbia', seed: 4, shots: [['aerial', 0.5, 11], ['detail', 'culdesac', 16]] },
  { style: 'harbor', seed: 5, shots: [['aerial', 0.5, 18.5], ['detail', 'lighthouse', 20.6]] },
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
const metrics = { shots: [], cities: [] };

const save = (name, dataUrl) => { writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64')); return name; };
const shot = async (name, setup, caption = '') => {
  if (ONLY && !ONLY.test(name)) return metrics.shots.find((s) => s.name === name);
  const r = await page.evaluate(async (s) => {
    const c = window.__city;
    await new Function('c', `return (async () => { ${s} })()`)(c);
    await c.settle(3);
    const m = await c.measure(1);
    return { m, url: c.capture() };
  }, setup);
  save(name, r.url);
  const row = { name, caption, calls: r.m.calls, triangles: r.m.triangles, kitBuildings: r.m.kitBuildings, kitTris: r.m.kitTris, chunks: r.m.chunks, geometries: r.m.geometries, textures: r.m.textures, gpu: r.m.gpu };
  const old = metrics.shots.findIndex((s) => s.name === name);
  if (old >= 0) metrics.shots[old] = row; else metrics.shots.push(row);
  console.log(`${name.padEnd(44)} ${String(row.calls).padStart(3)} calls ${String(Math.round(row.triangles / 1000)).padStart(4)}k tris  kit ${row.kitBuildings} bldg ${Math.round(row.kitTris / 1000)}k`);
  return row;
};

const SHEET_ONLY = args.includes('--sheet-only');
try {
  if (SHEET_ONLY || ONLY) try { Object.assign(metrics, JSON.parse(readFileSync(join(OUT, 'metrics.json'), 'utf8'))); metrics.cities = []; } catch { /* first run */ }
  if (!SHEET_ONLY) await render();
  await sheets();
  if (errors.length) { console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  ')); process.exitCode = 1; }
} finally {
  await browser.close();
  stop();
}

async function render() {
  await page.goto(`${BASE}/tools/city-preview/?noui&nominimap&dpr=1`);
  await page.waitForFunction(() => window.__city, null, { timeout: 180000 });
  await page.evaluate(() => window.__city.pause());
  // ---- the coast town
  const id = `coast-${SEED}`;
  const info = await page.evaluate((seed) => window.__city.generate({ seed, style: 'coast' }), SEED);
  metrics.cities.push({ id, plan: info, kitTextureBytes: await page.evaluate(() => window.__city.kitBytes()) });
  console.log(`${id}: plan ${info.ms} ms, view ${info.viewMs} ms, ${info.buildings} buildings (${info.kit} from the kit), ${info.pois} places, ${info.decks} decks`);
  for (const [when, h] of Object.entries(HOURS)) {
    await shot(`${id}-street-mainstreet-${when}.png`, `c.setNear(320); c.setTime(${h}); c.street('mainstreet');`, `main street, ${when}`);
    await shot(`${id}-aerial-${when}.png`, `c.setNear(320); c.setTime(${h}); c.aerial(0.42);`, `aerial, ${when}`);
  }
  await shot(`${id}-street-residential-noon.png`, `c.setNear(320); c.setTime(11); c.street('residential');`, 'residential street, noon');
  await shot(`${id}-street-residential-night.png`, `c.setNear(320); c.setTime(22.3); c.street('residential');`, 'residential street, night');
  await shot(`${id}-street-promenade-sunset.png`, `c.setNear(320); c.setTime(19.0); c.street('promenade');`, 'promenade, sunset');
  // the kit-built main street up close: a shop building seen from across the street
  await shot(`${id}-kit-mainstreet-closeup.png`, `c.setNear(320); c.setTime(10.5); c.kitCloseup();`, 'kit main street, close');
  await shot(`${id}-kit-mainstreet-closeup-night.png`, `c.setNear(320); c.setTime(21.6); c.kitCloseup();`, 'kit main street, night');
  await shot(`${id}-kit-closeup-2.png`, `c.setNear(320); c.setTime(16.5); c.kitCloseup(false, 0.2);`, 'kit buildings, afternoon');
  await shot(`${id}-pier-golden.png`, `c.setNear(320); c.setTime(18.6); c.detail('pier');`, 'pier, golden hour');
  await shot(`${id}-pier-night.png`, `c.setNear(320); c.setTime(22); c.detail('pier');`, 'pier, night');
  await shot(`${id}-lighthouse-dusk.png`, `c.setNear(320); c.setTime(20.2); c.detail('lighthouse');`, 'lighthouse, dusk');
  await shot(`${id}-lighthouse-noon.png`, `c.setNear(320); c.setTime(12.5); c.detail('lighthouse');`, 'lighthouse, noon');
  await shot(`${id}-marina-morning.png`, `c.setNear(320); c.setTime(9); c.detail('marina');`, 'marina, morning');
  await shot(`${id}-beach-noon.png`, `c.setNear(320); c.setTime(13); c.detail('beach');`, 'beach, noon');
  // the time-lapse: one view at six hours
  for (const [i, h] of LAPSE.entries()) await shot(`${id}-lapse-${i}.png`, `c.setNear(320); c.setTime(${h}); c.detail('pier');`, `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
  save(`${id}-plan.png`, await page.evaluate(() => window.__city.minimap({ spawns: true }, 1600)));
  // ---- the other styles
  for (const o of OTHERS) {
    const oid = `${o.style}-${o.seed}`;
    const oi = await page.evaluate((x) => window.__city.generate({ seed: x.seed, style: x.style }), o);
    metrics.cities.push({ id: oid, plan: oi });
    for (const [kind, what, h] of o.shots) {
      const setup = kind === 'street' ? `c.street(${JSON.stringify(what)});` : kind === 'aerial' ? `c.aerial(${what});` : `c.detail(${JSON.stringify(what)});`;
      await shot(`${oid}-${kind}-${String(what).replace('.', '')}-${h}.png`, `c.setNear(${kind === 'aerial' ? 420 : 320}); c.setTime(${h}); ${setup}`, `${o.style}: ${kind} ${kind === 'detail' ? what : ''} ${h} h`);
    }
  }
  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1));
}

async function grid(files, cols, W, H, title, out) {
  const imgs = files.map(({ f, cap }) => ({ cap, url: 'data:image/png;base64,' + readFileSync(join(OUT, f)).toString('base64') }));
  const url = await page.evaluate(async ({ list, cols, W, H, title }) => {
    const pad = 8, cap = 24, head = title ? 40 : 0;
    const rows = Math.ceil(list.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (W + pad) + pad; c.height = rows * (H + cap + pad) + pad + head;
    const g = c.getContext('2d');
    g.fillStyle = '#15171c'; g.fillRect(0, 0, c.width, c.height);
    if (title) { g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText(title, pad + 4, 30); }
    for (const [i, it] of list.entries()) {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = it.url; });
      const x = pad + (i % cols) * (W + pad), y = head + pad + Math.floor(i / cols) * (H + cap + pad);
      g.drawImage(im, x, y, W, H);
      g.fillStyle = '#cfd6e0'; g.font = '15px sans-serif';
      g.fillText(it.cap, x + 2, y + H + 17);
    }
    return c.toDataURL('image/png');
  }, { list: imgs, cols, W, H, title });
  save(out, url);
  console.log(`${out}: ${files.length} shots → ${join(OUT, out)}`);
}

async function sheets() {
  const cap = (f) => metrics.shots.find((s) => s.name === f)?.caption ?? f.replace('.png', '');
  const id = `coast-${SEED}`;
  const lapse = LAPSE.map((_, i) => `${id}-lapse-${i}.png`).filter((f) => metrics.shots.some((s) => s.name === f));
  if (lapse.length) await grid(lapse.map((f) => ({ f, cap: 'time-lapse ' + cap(f) })), 3, 560, 315, 'Sunny Coast Town: one view through the day', 'timelapse.png');
  const picks = (arg('pick', '') || '').split(',').filter(Boolean);
  const want = picks.length ? picks : [
    `${id}-street-mainstreet-sunrise.png`, `${id}-street-mainstreet-noon.png`, `${id}-street-mainstreet-sunset.png`, `${id}-street-mainstreet-night.png`,
    `${id}-aerial-noon.png`, `${id}-aerial-night.png`, `${id}-kit-mainstreet-closeup.png`, `${id}-kit-mainstreet-closeup-night.png`,
    `${id}-pier-golden.png`, `${id}-lighthouse-dusk.png`, `${id}-marina-morning.png`, `${id}-street-promenade-sunset.png`,
    'metropolis-1-street-0-22.5.png', 'harbor-5-aerial-05-18.5.png',
  ];
  const files = want.filter((f) => metrics.shots.some((s) => s.name === f));
  await grid(files.map((f) => ({ f, cap: cap(f) })), 2, 640, 360, 'Ayvago procedural city generator: Sunny Coast Town and the other styles', 'contact-sheet.png');
}
