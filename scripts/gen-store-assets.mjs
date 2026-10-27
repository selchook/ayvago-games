// Store art for the Ayvago platform catalog, made from the games themselves:
//   public/games/<slug>/ayvago/cover-1920x1080.jpg   catalog / game page cover
//   public/games/<slug>/ayvago/icon-512.png          square icon
//   public/thumbs/<slug>.png                         thumbnail for this repo's own portal
// Each game is opened (no intro), its menu and a few seconds of play are captured, then the
// captures are composed on a branded HTML template and rendered by Chromium.
// Usage: npm run build && node scripts/gen-store-assets.mjs [--dev] [slug ...]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = (only.length ? only : readdirSync(join(root, 'public', 'games')))
  .filter((s) => existsSync(join(root, 'public', 'games', s, 'ayvago.json')));

const font = (pkg, file) => readFileSync(join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const FONTS = `
@font-face { font-family: P2P; src: url(data:font/woff2;base64,${font('press-start-2p', 'press-start-2p-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: P2P; src: url(data:font/woff2;base64,${font('press-start-2p', 'press-start-2p-latin-ext-400-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: PX; font-weight: 700; src: url(data:font/woff2;base64,${font('pixelify-sans', 'pixelify-sans-latin-700-normal.woff2')}) format('woff2'); }
@font-face { font-family: PX; font-weight: 700; src: url(data:font/woff2;base64,${font('pixelify-sans', 'pixelify-sans-latin-ext-700-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }`;
const mark = readFileSync(join(root, 'public', 'assets', 'ayvago', 'boot_mark.png')).toString('base64');

// Primary platform category (the game's first genre) shown as a chip on the cover.
const CATEGORY = {
  arcade: 'ARCADE', action: 'ACTION', casual: 'CASUAL', puzzle: 'PUZZLE', retro: 'RETRO',
  sports: 'SPORTS', strategy: 'STRATEGY', card: 'CARD', word: 'WORD',
};

function coverHtml(m, menu, play) {
  const land = m.orientation === 'landscape';
  const shot = (b64, cls) => `<div class="shot ${cls}"><img src="data:image/png;base64,${b64}"></div>`;
  return `<!doctype html><html><head><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1920px; height: 1080px; overflow: hidden; background: #201e1d; font-family: PX; color: #f3f2f2; position: relative; }
  .glow { position: absolute; inset: -200px; background: radial-gradient(circle at 75% 55%, rgba(236,48,19,.45), transparent 55%), radial-gradient(circle at 10% 90%, rgba(62,230,255,.18), transparent 45%); }
  .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 5px); z-index: 5; pointer-events: none; }
  .left { position: absolute; left: 110px; top: 0; bottom: 0; width: ${land ? 760 : 900}px; display: flex; flex-direction: column; justify-content: center; gap: 36px; z-index: 2; }
  .brand { display: flex; align-items: center; gap: 18px; font-family: P2P; font-size: 26px; letter-spacing: 4px; }
  .brand .mark { width: 58px; height: 58px; }
  .brand b { color: #ec3013; font-size: 16px; letter-spacing: 6px; font-weight: normal; }
  h1 { font-family: P2P; font-weight: normal; font-size: ${m.title.en.length > 14 ? 74 : 92}px; line-height: 1.25; color: #ffd23f; text-shadow: 0 10px 0 #000, 0 0 40px rgba(255,210,63,.35); }
  p { font-size: 40px; font-weight: 700; line-height: 1.3; color: #d8d4d2; max-width: 820px; }
  .chip { align-self: flex-start; font-family: P2P; font-size: 20px; background: #ec3013; color: #fff; padding: 14px 20px; box-shadow: 0 6px 0 #000; }
  .shot { position: absolute; z-index: 3; border: 10px solid #0a0909; box-shadow: 0 30px 0 rgba(0,0,0,.5), 0 0 0 4px #ec3013; background: #000; }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .p1 { width: 420px; height: 747px; right: 150px; top: 166px; transform: rotate(3deg); }
  .p2 { width: 330px; height: 587px; right: 560px; top: 300px; transform: rotate(-5deg); opacity: .9; }
  .l1 { width: 900px; height: 506px; right: 90px; top: 230px; transform: rotate(2deg); }
  </style></head><body><div class="glow"></div>
  <div class="left">
    <div class="brand"><img class="mark" src="data:image/png;base64,${mark}">AYVAGO <b>GAMES</b></div>
    <h1>${m.title.en.toUpperCase()}</h1>
    <p>${m.description.en}</p>
    <span class="chip">${CATEGORY[m.category] ?? 'ARCADE'}</span>
  </div>
  ${land ? shot(play, 'l1') : shot(menu, 'p2') + shot(play, 'p1')}
  <div class="scan"></div></body></html>`;
}

function iconHtml(m, play) {
  return `<!doctype html><html><head><style>${FONTS}
  * { margin: 0; box-sizing: border-box; }
  body { width: 512px; height: 512px; overflow: hidden; background: #201e1d; position: relative; }
  .crop { position: absolute; inset: 0; background: url(data:image/png;base64,${play}) center 72% / cover; filter: saturate(1.15); }
  .shade { position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,.85), transparent 45%); }
  .name { position: absolute; left: 28px; right: 110px; top: 34px; font-family: P2P; font-size: ${m.title.en.length > 12 ? 30 : 38}px; line-height: 1.3; color: #ffd23f; text-shadow: 0 5px 0 #000; }
  .frame { position: absolute; inset: 0; border: 14px solid #ec3013; }
  .mark { position: absolute; right: 26px; bottom: 26px; width: 64px; height: 64px; filter: drop-shadow(0 4px 0 #000); }
  </style></head><body><div class="crop"></div><div class="shade"></div>
  <img class="mark" src="data:image/png;base64,${mark}">
  <div class="name">${m.title.en.toUpperCase()}</div><div class="frame"></div></body></html>`;
}

const PORT = 5600 + Math.floor(Math.random() * 300);
const server = spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
let made = 0;
for (const slug of slugs) {
  const m = JSON.parse(readFileSync(join(root, 'public', 'games', slug, 'ayvago.json'), 'utf8'));
  const land = m.orientation === 'landscape';
  const page = await browser.newPage({ viewport: land ? { width: 1280, height: 720 } : { width: 720, height: 1280 } });
  try {
    await page.goto(`http://localhost:${PORT}/games/${slug}/?nointro&lang=en`);
    await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: dev ? 60000 : 20000 });
    await page.waitForTimeout(900);
    const canvas = page.locator('canvas').first();
    const menu = (await canvas.screenshot()).toString('base64');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__ayvago.game.scene.isActive('Play'), null, { timeout: 5000 });
    const box = await canvas.boundingBox();
    for (let i = 0; i < 16; i++) {          // a few seconds of "play" so the frame is lively
      const k = ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp'][i % 4];
      await page.keyboard.down(k);
      await page.mouse.click(box.x + box.width * (0.2 + 0.6 * Math.random()), box.y + box.height * (0.35 + 0.5 * Math.random()));
      await page.waitForTimeout(140);
      await page.keyboard.up(k);
    }
    await page.evaluate(() => {           // hide the pause overlay if a random tap opened it
      const g = window.__ayvago.game;
      if (g.scene.isActive('Pause')) { g.scene.stop('Pause'); g.scene.resume('Play'); }
    });
    await page.waitForTimeout(500);
    const play = (await canvas.screenshot()).toString('base64');

    const out = join(root, 'public', 'games', slug, 'ayvago');
    mkdirSync(out, { recursive: true });
    mkdirSync(join(root, 'public', 'thumbs'), { recursive: true });
    await canvas.screenshot({ path: join(root, 'public', 'thumbs', `${slug}.png`), scale: 'css' });

    const art = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await art.setContent(coverHtml(m, menu, play));
    await art.evaluate(() => document.fonts.ready);
    await art.screenshot({ path: join(out, 'cover-1920x1080.jpg'), type: 'jpeg', quality: 86 });
    await art.setViewportSize({ width: 512, height: 512 });
    await art.setContent(iconHtml(m, play));
    await art.evaluate(() => document.fonts.ready);
    await art.screenshot({ path: join(out, 'icon-512.png') });
    await art.close();
    made++;
    console.log(`ok    ${slug}`);
  } catch (e) {
    console.log(`FAIL  ${slug}: ${String(e.message).split('\n')[0]}`);
  }
  await page.close();
}
await browser.close();
try { process.kill(-server.pid); } catch { server.kill(); }
console.log(`\nstore assets: ${made}/${slugs.length}`);
process.exit(made === slugs.length ? 0 : 1);
