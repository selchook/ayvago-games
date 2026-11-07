// Checks the shared word lists (src/words/<lang>.ts) used by Letter Loop and Letter Rain.
// Usage: node scripts/check-letter-loop-words.mjs <tr|en> [--list-bases]
// Reports bad characters, duplicates, the length histogram and how many level base words
// (5–7 common letters whose letters spell at least 5 common words of 3+ letters) the list gives.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2];
if (lang !== 'tr' && lang !== 'en') {
  console.error('usage: check-letter-loop-words.mjs <tr|en>');
  process.exit(2);
}
const src = readFileSync(join(root, 'src/words', `${lang}.ts`), 'utf8');
const block = (name) => {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\`([^\`]*)\``));
  if (!m) throw new Error(`missing export ${name}`);
  return m[1].split(/\s+/).filter(Boolean);
};
const common = block('COMMON');
const extra = block('EXTRA');
const ALPHA = lang === 'tr' ? 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ok = new Set(ALPHA);
let errors = 0;
const seen = new Map();
for (const [tier, list] of [['COMMON', common], ['EXTRA', extra]]) {
  for (const w of list) {
    const bad = [...w].filter((c) => !ok.has(c));
    if (bad.length) { console.log(`bad chars in ${tier}: ${w} (${bad.join('')})`); errors++; }
    if (w.length < 3 || w.length > 8) { console.log(`bad length in ${tier}: ${w}`); errors++; }
    if (seen.has(w)) { console.log(`duplicate: ${w} (${seen.get(w)} and ${tier})`); errors++; }
    seen.set(w, tier);
  }
}
const hist = (list) => {
  const h = {};
  for (const w of list) h[w.length] = (h[w.length] ?? 0) + 1;
  return Object.entries(h).map(([k, v]) => `${k}:${v}`).join(' ');
};
console.log(`COMMON ${common.length} (${hist(common)})`);
console.log(`EXTRA  ${extra.length} (${hist(extra)})`);

const count = (w) => {
  const m = new Map();
  for (const c of w) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
};
const fits = (sub, base) => {
  for (const [c, n] of sub) if ((base.get(c) ?? 0) < n) return false;
  return true;
};
const commonCounts = common.map((w) => [w, count(w)]);
const bases = [];
for (const [w, c] of commonCounts) {
  if (w.length < 5 || w.length > 7) continue;
  const subs = commonCounts.filter(([s, sc]) => s.length >= 3 && fits(sc, c)).map(([s]) => s);
  if (subs.length >= 5) bases.push([w, subs.length]);
}
const byLen = {};
for (const [w] of bases) byLen[w.length] = (byLen[w.length] ?? 0) + 1;
console.log(`level bases ${bases.length} (${Object.entries(byLen).map(([k, v]) => `${k}:${v}`).join(' ')})`);
if (process.argv.includes('--list-bases')) for (const [w, n] of bases) console.log(`  ${w} ${n}`);
if (errors) { console.log(`${errors} errors`); process.exit(1); }
