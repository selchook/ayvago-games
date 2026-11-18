// Astro Crew: renders the icon sheet (icons.ts) from the kit's models in the running game and
// saves it as public/assets/quaternius/space-kit/icons.png. Kept as a record; not part of the build.
//   npx vite --port 5301 &   then   node games/astro-crew/make-icons.mjs [port]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const port = process.argv[2] ?? '5301';
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:${port}/games/astro-crew/?nointro&icons`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ayvago?.game?.scene?.isActive('Menu') || typeof window.__astro?.iconSheet === 'function', null, { timeout: 90000 });
await page.evaluate(() => { if (typeof window.__astro?.iconSheet !== 'function') window.__ayvago.game.scene.getScene('Menu').scene.start('Play'); });
await page.waitForFunction(() => typeof window.__astro?.iconSheet === 'function', null, { timeout: 90000 });
const url = await page.evaluate(() => window.__astro.iconSheet());
const out = join(import.meta.dirname, '../../public/assets/quaternius/space-kit/icons.png');
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
