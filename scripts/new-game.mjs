// Usage: npm run new-game -- <slug> "<Title>"   → scaffolds games/<slug> from templates/game
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, title = slug] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: npm run new-game -- <kebab-slug> "<Title>"');
  process.exit(1);
}
const dest = join(root, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists`);
  process.exit(1);
}
cpSync(join(root, 'templates', 'game'), dest, { recursive: true });
for (const f of readdirSync(dest)) {
  const p = join(dest, f);
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__SLUG__', slug).replaceAll('__TITLE__', title)
    .replaceAll('__TODAY__', new Date().toISOString().slice(0, 10)));
}
console.log(`created games/${slug} — dev: npm run dev, then open /games/${slug}/`);
