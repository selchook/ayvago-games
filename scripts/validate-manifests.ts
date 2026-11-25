// Validates every public/games/*/ayvago.json (and the generated platform catalog) against the
// platform's own zod schema (vendored from selchook/ayvago) and checks the art exists with the
// right dimensions (the logos: transparent PNGs within their size; the portrait cards on adaptive
// games only), then the game guides
// (platform/arcade-guides.json) against the platform's guide schema and the studio's writing rules.
// Run: npx tsx scripts/validate-manifests.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGameManifest } from './vendor/manifest';
import { gameGuideSchema, guideFileSchema, GUIDE_INPUTS, type GameGuide } from './vendor/guide';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'public', 'games');
let failed = 0;
const ids = new Set<string>();
/** The inputs each shipped game's manifest declares, by slug (the guide's controls must match). */
const inputs = new Map<string, string[]>();

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
// Portrait card art (assets.cardPortrait / cardPortrait2x): required for adaptive games
// (orientation 'any', shown on phones), en + tr; a fixed-orientation game has none.
const PORTRAIT_CARDS = [['cardPortrait', '360x640', 60 * 1024], ['cardPortrait2x', '720x1280', 140 * 1024]] as const;
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
    inputs.set(slug, m.input);
    if (!m.title.tr || !m.description.tr) problems.push('Turkish text missing');
    const icon = join(root, 'public', m.assets.icon);
    const cover = join(root, 'public', m.assets.cover);
    if (!existsSync(icon)) problems.push('icon missing');
    else if (pngSize(icon).join('x') !== '512x512') problems.push(`icon is ${pngSize(icon).join('x')}`);
    if (m.assets.screenshot && !existsSync(join(root, 'public', m.assets.screenshot))) problems.push('screenshot missing');
    if (!existsSync(cover)) problems.push('cover missing');
    else if (jpgSize(cover).join('x') !== '1920x1080') problems.push(`cover is ${jpgSize(cover).join('x')}`);
    const adaptive = m.orientation === 'any';
    for (const [key, size, budget] of [...CARDS, ...(adaptive ? PORTRAIT_CARDS : [])]) {
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
    if (!adaptive) {
      for (const [key] of PORTRAIT_CARDS) if (m.assets[key]) problems.push(`assets.${key} on a ${m.orientation} game (adaptive games only)`);
      const art = join(root, 'public', 'games', slug, 'ayvago');
      if (existsSync(art) && readdirSync(art).some((f) => f.startsWith('card-portrait'))) problems.push(`portrait card files on a ${m.orientation} game`);
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

// ---------------------------------------------------------------- game guides
// The schema (vendored from the platform) checks the shape and the limits; the studio adds its
// writing rules (new-game skill, "Game guide"): both languages everywhere, 2–3 paragraphs about the
// game, roughly 300–600 words per language, real Turkish, no untranslated text and controls only
// for the inputs the game declares.
type Text = { en: string; tr?: string };
const GUIDE_FILE = join(root, 'platform', 'arcade-guides.json');
const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
/** Every text of a guide with where it sits, in reading order. */
function guideTexts(g: GameGuide): Array<[string, Text]> {
  const out: Array<[string, Text]> = [['about', g.about]];
  g.howToPlay.forEach((x, i) => out.push([`howToPlay[${i}]`, x]));
  for (const k of GUIDE_INPUTS) if (g.controls[k]) out.push([`controls.${k}`, g.controls[k]!]);
  g.tips.forEach((x, i) => out.push([`tips[${i}]`, x]));
  g.features?.forEach((x, i) => out.push([`features[${i}]`, x]));
  g.faq?.forEach((x, i) => out.push([`faq[${i}].q`, x.q], [`faq[${i}].a`, x.a]));
  return out;
}
/** The studio's ranges (a warning outside them; the schema's own limits are wider). */
const RANGES: Array<[string, (g: GameGuide) => number, number, number]> = [
  ['about words (en)', (g) => words(g.about.en), 120, 200],
  ['howToPlay steps', (g) => g.howToPlay.length, 3, 6],
  ['tips', (g) => g.tips.length, 3, 6],
  ['features', (g) => g.features?.length ?? 0, 3, 6],
  ['faq', (g) => g.faq?.length ?? 0, 3, 4],
];

let guidesFailed = 0;
let guideCount = 0;
if (!existsSync(GUIDE_FILE)) {
  console.log('\nFAIL  platform/arcade-guides.json missing: run node scripts/gen-platform.mjs');
  guidesFailed++;
} else {
  const raw = JSON.parse(readFileSync(GUIDE_FILE, 'utf8'));
  console.log('');
  // the whole file against the platform's schema (what the platform's sync parses) ...
  const parsed = guideFileSchema.safeParse(raw);
  if (!parsed.success) {
    guidesFailed++;
    for (const i of parsed.error.issues) console.log(`FAIL  guides  ${i.path.join('.')}: ${i.message}`);
  }
  // ... and every guide on its own, so one broken guide does not hide the others' problems
  const entries: Array<[string, unknown]> = raw && typeof raw.guides === 'object' && raw.guides ? Object.entries(raw.guides) : [];
  for (const [slug, one] of entries) {
    guideCount++;
    const problems: string[] = [];
    const warnings: string[] = [];
    if (!inputs.has(slug)) problems.push('not a shipped game (no public/games/<slug>/ayvago.json)');
    const res = gameGuideSchema.safeParse(one);
    if (!res.success) {
      guidesFailed++;
      console.log(`FAIL  guide ${slug}  ${[...problems, ...res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)].join('; ')}`);
      continue;
    }
    const g = res.data;
    const all = guideTexts(g);
    for (const [where, x] of all) {
      if (!x.tr) problems.push(`${where}: Turkish missing`);
      else if (x.tr.trim() === x.en.trim()) problems.push(`${where}: Turkish is the same as English`);
      if (/TODO/.test(x.en + (x.tr ?? ''))) problems.push(`${where}: TODO left`);
    }
    const paras = (s?: string) => (s ?? '').split(/\n\s*\n/).filter((p) => p.trim()).length;
    for (const lang of ['en', 'tr'] as const) {
      const n = paras(g.about[lang]);
      if (n < 2 || n > 3) problems.push(`about (${lang}) has ${n} paragraphs, not 2–3`);
    }
    const trAll = all.map(([, x]) => x.tr ?? '').join(' ');
    if (!TURKISH.test(trAll)) problems.push('the Turkish text has no Turkish letters (ç ğ ı İ ö ş ü)');
    const declared = inputs.get(slug);
    if (declared) for (const k of GUIDE_INPUTS) {
      if (g.controls[k] && !declared.includes(k)) problems.push(`controls.${k}: the game's manifest input is [${declared.join(', ')}]`);
    }
    const count = { en: 0, tr: 0 };
    for (const [, x] of all) { count.en += words(x.en); count.tr += words(x.tr ?? ''); }
    for (const lang of ['en', 'tr'] as const) {
      if (count[lang] < 200) problems.push(`${count[lang]} words (${lang}), under 200`);
      else if (count[lang] < 300 || count[lang] > 600) warnings.push(`${count[lang]} words (${lang}), outside 300–600`);
    }
    for (const [what, get, lo, hi] of RANGES) {
      const n = get(g);
      if (n < lo || n > hi) warnings.push(`${what}: ${n}, outside ${lo}–${hi}`);
    }
    if (problems.length) guidesFailed++;
    const note = [...problems, ...warnings.map((w) => `warn: ${w}`)];
    console.log(`${problems.length ? 'FAIL' : 'ok  '}  guide ${slug}  en ${count.en} · tr ${count.tr} words${note.length ? '  ' + note.join('; ') : ''}`);
  }
  const missing = [...inputs.keys()].filter((s) => !entries.some(([k]) => k === s)).length;
  // the scaffold's stub (or a guide still being written): gen-platform leaves it out until no TODO is left
  const drafts = [...inputs.keys()].filter((s) => {
    const f = join(root, 'games', s, 'guide.json');
    return existsSync(f) && readFileSync(f, 'utf8').includes('TODO');
  });
  console.log(`\n${guideCount} guides checked, ${guidesFailed} failing; ${missing} shipped games have no guide yet` +
    (drafts.length ? ` (drafts with a TODO left: ${drafts.join(', ')})` : ''));
}
process.exit(failed || guidesFailed ? 1 : 0);
