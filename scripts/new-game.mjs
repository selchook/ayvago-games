// Usage: npm run new-game -- <slug> "<Title>"   → scaffolds games/<slug> from templates/game
//        npm run new-game -- <slug> "<Title>" --unity   → a Unity game: only game.json ("engine":
//        "unity") and guide.json; the WebGL build goes to public/games/<slug>/ (Ayvago → Build WebGL… in Unity)
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const unity = process.argv.includes('--unity');
const [slug, title = slug] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: npm run new-game -- <kebab-slug> "<Title>"');
  process.exit(1);
}
const dest = join(root, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists`);
  process.exit(1);
}
cpSync(join(root, 'templates', 'game'), dest, { recursive: true, filter: (src) => !unity || !/\.(ts|html)$/.test(src) });
for (const f of readdirSync(dest)) {
  const p = join(dest, f);
  let text = readFileSync(p, 'utf8').replaceAll('__SLUG__', slug).replaceAll('__TITLE__', title)
    .replaceAll('__TODAY__', new Date().toISOString().slice(0, 10));
  if (unity && f === 'game.json') {
    const meta = JSON.parse(text);
    text = JSON.stringify({ id: meta.id, engine: 'unity', ...meta, credits: ['Made with Unity; art and audio: list every pack (CC0 or owner-supplied)'] }, null, 2) + '\n';
  }
  writeFileSync(p, text);
}
console.log(unity
  ? `created games/${slug} (Unity) — build into public/games/${slug}/ with Ayvago → Build WebGL…, then npm run registry`
  : `created games/${slug} — dev: npm run dev, then open /games/${slug}/`);
