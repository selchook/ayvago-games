// Last Convoy: renders the icon sheet (icons.ts) from the kit's models in the running game and saves
// it as public/assets/quaternius/zombie-kit/icons.png. Kept as a record; not part of the build.
//   npx vite --port 5421 &   then   node games/last-convoy/make-icons.mjs [port] [node_modules with sharp]
// With sharp's node_modules given, the sheet is saved as a palette PNG (about a third of the size).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const port = process.argv[2] ?? '5421';
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:${port}/games/last-convoy/?nointro`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu') || typeof window.__lcIcons === 'function', null, { timeout: 120000 });
await page.evaluate(() => { if (typeof window.__lcIcons !== 'function') window.__ayvago.game.scene.getScene('Menu').scene.start('Play'); });
await page.waitForFunction(() => typeof window.__lcIcons === 'function', null, { timeout: 120000 });
const url = await page.evaluate(() => window.__lcIcons());
const out = join(import.meta.dirname, '../../public/assets/quaternius/zombie-kit/icons.png');
let png = Buffer.from(url.split(',')[1], 'base64');
if (process.argv[3]) {
  const sharp = createRequire(join(process.argv[3], 'x.js'))('sharp');
  png = await sharp(png).png({ palette: true, quality: 92, effort: 10 }).toBuffer();
}
writeFileSync(out, png);
console.log('wrote', out);
await browser.close();
