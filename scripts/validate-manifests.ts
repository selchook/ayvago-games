// Validates every public/games/*/ayvago.json (and the generated platform catalog) against the
// platform's own zod schema (vendored from selchook/ayvago) and checks the art exists with the
// right dimensions. Run: npx tsx scripts/validate-manifests.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGameManifest } from './vendor/manifest';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'public', 'games');
let failed = 0;
const ids = new Set<string>();

function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function jpgSize(file: string): [number, number] {
  const b = readFileSync(file);
  for (let i = 2; i < b.length; ) {
    const len = b.readUInt16BE(i + 2);
    if (b[i + 1] >= 0xc0 && b[i + 1] <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

for (const slug of readdirSync(dir).sort()) {
  const file = join(dir, slug, 'ayvago.json');
  if (!existsSync(file)) continue;
  const problems: string[] = [];
  const result = parseGameManifest(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.ok) problems.push(...result.issues.map((i) => `${i.path}: ${i.message}`));
  else {
    const m = result.manifest;
    if (ids.has(m.id)) problems.push(`duplicate id ${m.id}`);
    ids.add(m.id);
    if (!m.title.tr || !m.description.tr) problems.push('Turkish text missing');
    const icon = join(root, 'public', m.assets.icon);
    const cover = join(root, 'public', m.assets.cover);
    if (!existsSync(icon)) problems.push('icon missing');
    else if (pngSize(icon).join('x') !== '512x512') problems.push(`icon is ${pngSize(icon).join('x')}`);
    if (m.assets.screenshot && !existsSync(join(root, 'public', m.assets.screenshot))) problems.push('screenshot missing');
    if (!existsSync(cover)) problems.push('cover missing');
    else if (jpgSize(cover).join('x') !== '1920x1080') problems.push(`cover is ${jpgSize(cover).join('x')}`);
  }
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${slug}${problems.length ? '  ' + problems.join('; ') : ''}`);
}
console.log(`\n${ids.size} manifests valid against the platform schema, ${failed} failing`);
process.exit(failed ? 1 : 0);
