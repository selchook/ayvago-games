// Validates every public/games/*/ayvago.json (and the generated platform catalog) against the
// platform's own zod schema (vendored from selchook/ayvago) and checks the art exists with the
// right dimensions (the logos: transparent PNGs within their size).
// Run: npx tsx scripts/validate-manifests.ts
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
// WebP: a RIFF container whose first chunk holds the size (lossy VP8, lossless VP8L or extended VP8X).
function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return [0, 0];
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  return [0, 0];
}
// Catalog card art (assets.card / card2x), both required for the studio's games, each in English
// and Turkish (the same frame with the logo in that language), within the size budget.
const CARDS = [['card', '640x360', 45 * 1024], ['card2x', '1280x720', 110 * 1024]] as const;
// Game logos (assets.logo, en + tr, both required here): PNG with transparency, at most
// 640×320 px and 60 KB.
const LOGO_MAX = [640, 320] as const;
const LOGO_BYTES = 60 * 1024;
function logoProblem(file: string): string | null {
  const b = readFileSync(file);
  if (b.toString('latin1', 1, 4) !== 'PNG') return 'not a PNG';
  const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  const type = b[25];
  // alpha: an RGBA or grey + alpha image, or a palette image with a tRNS chunk
  const chunks: string[] = [];
  for (let i = 8; i + 8 <= b.length; i += 12 + b.readUInt32BE(i)) chunks.push(b.toString('latin1', i + 4, i + 8));
  const alpha = type === 6 || type === 4 || (type === 3 && chunks.includes('tRNS'));
  if (!alpha) return 'has no transparency';
  if (w > LOGO_MAX[0] || h > LOGO_MAX[1]) return `is ${w}x${h}, over ${LOGO_MAX.join('x')}`;
  if (b.length > LOGO_BYTES) return `is ${Math.round(b.length / 1024)} KB, over ${LOGO_BYTES / 1024} KB`;
  return null;
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
    for (const [key, size, budget] of CARDS) {
      const ref = m.assets[key];
      for (const lang of ['en', 'tr'] as const) {
        const one = typeof ref === 'string' ? (lang === 'en' ? ref : undefined) : ref?.[lang];
        const file = one && join(root, 'public', one);
        if (!file) problems.push(`assets.${key}.${lang} missing`);
        else if (!existsSync(file)) problems.push(`${key} ${lang} file missing`);
        else if (webpSize(file).join('x') !== size) problems.push(`${key} ${lang} is ${webpSize(file).join('x')}, not a ${size} WebP`);
        else if (readFileSync(file).length > budget) problems.push(`${key} ${lang} is ${Math.round(readFileSync(file).length / 1024)} KB, over ${budget / 1024} KB`);
      }
    }
    for (const lang of ['en', 'tr'] as const) {
      const ref = m.assets.logo?.[lang];
      const file = ref && join(root, 'public', ref);
      if (!file) problems.push(`assets.logo.${lang} missing`);
      else if (!existsSync(file)) problems.push(`logo ${lang} file missing`);
      else {
        const problem = logoProblem(file);
        if (problem) problems.push(`logo ${lang} ${problem}`);
      }
    }
  }
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${slug}${problems.length ? '  ' + problems.join('; ') : ''}`);
}
console.log(`\n${ids.size} manifests valid against the platform schema, ${failed} failing`);
process.exit(failed ? 1 : 0);
