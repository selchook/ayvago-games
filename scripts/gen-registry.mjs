// Scans games/*/game.json, validates it and writes src/generated/registry.json for the portal.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'games');
const GENRES = ['arcade', 'action', 'casual', 'puzzle', 'retro', 'sports', 'strategy', 'card', 'word'];
const errors = [];
const games = [];

for (const slug of readdirSync(gamesDir).sort()) {
  const dir = join(gamesDir, slug);
  const metaPath = join(dir, 'game.json');
  if (!existsSync(metaPath)) continue;
  let m;
  try {
    m = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (e) {
    errors.push(`${slug}: game.json is not valid JSON (${e.message})`);
    continue;
  }
  const need = (cond, msg) => cond || errors.push(`${slug}: ${msg}`);
  need(m.id === slug, `id "${m.id}" must equal folder name`);
  for (const k of ['title', 'description', 'howTo']) need(m[k]?.tr && m[k]?.en, `${k}.tr and ${k}.en are required`);
  need(Array.isArray(m.genres) && m.genres.length && m.genres.every((g) => GENRES.includes(g)), `genres must be a subset of ${GENRES.join(',')}`);
  need(['portrait', 'landscape'].includes(m.orientation), 'orientation must be portrait|landscape');
  for (const f of ['index.html', 'main.ts']) need(existsSync(join(dir, f)), `missing ${f}`);
  games.push({ ...m, thumb: existsSync(join(root, 'public', 'thumbs', `${slug}.png`)) ? `thumbs/${slug}.png` : null });
}

mkdirSync(join(root, 'src', 'generated'), { recursive: true });
writeFileSync(join(root, 'src', 'generated', 'registry.json'), JSON.stringify({ count: games.length, games }, null, 2));
if (errors.length) {
  console.error('Registry errors:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`registry: ${games.length} games`);
