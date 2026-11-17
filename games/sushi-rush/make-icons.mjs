// Sushi Rush: renders the icon sheet (icons.ts) from the kit's models in the running game and
// saves it as public/assets/quaternius/sushi-kit/icons.png. Kept as a record; not part of the build.
//   npx vite --port 5391 &   then   node games/sushi-rush/make-icons.mjs [port]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const port = process.argv[2] ?? '5391';
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${port}/games/sushi-rush/?nointro&icons`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu') || typeof window.__sushi?.iconSheet === 'function', null, { timeout: 90000 });
await page.evaluate(() => { if (typeof window.__sushi?.iconSheet !== 'function') window.__ayvago.game.scene.getScene('Menu').scene.start('Play'); });
await page.waitForFunction(() => typeof window.__sushi?.iconSheet === 'function', null, { timeout: 90000 });
const url = await page.evaluate(() => window.__sushi.iconSheet());
const out = join(import.meta.dirname, '../../public/assets/quaternius/sushi-kit/icons.png');
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
