// Generates the Ayvago platform integration files for every finished game:
//   public/games/<slug>/ayvago.json   manifest served next to the game (schema: selchook/ayvago
//                                     packages/shared/src/manifest.ts, sdkVersion 2)
//   platform/arcade-catalog.ts        SeedGame entries to drop into the platform repo
//                                     (packages/shared/src/arcade-catalog.ts)
// Usage: node scripts/gen-platform.mjs [--origin https://games.example.com] [--live] [--require-smoke]
//   --live            catalog status 'live' (only once the origin is deployed); default 'coming_soon'
//   --require-smoke   only include games that PASS in reports/smoke.json (full run)
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const ORIGIN = (arg('--origin', process.env.AYVAGO_GAMES_ORIGIN) ?? 'https://ayvago-games.vercel.app').replace(/\/$/, '');
const REPO = 'selchook/ayvago-games';
const ADDED_AT = arg('--added-at', new Date().toISOString().slice(0, 10));
const STATUS = args.includes('--live') ? 'live' : 'coming_soon';

let passing = null;
if (args.includes('--require-smoke')) {
  const report = JSON.parse(readFileSync(join(root, 'reports', 'smoke.json'), 'utf8'));
  passing = new Set(report.filter((r) => r.ok).map((r) => r.slug));
}

// Platform categories are the same genres as game.json: the first genre is the primary category
// (icon, breadcrumb) and the game is listed under all of them.
function category(m) {
  return m.genres[0];
}

function tags(m) {
  const out = new Set();
  for (const part of m.id.split('-')) if (part.length >= 3) out.add(part);
  out.add('retro');
  return [...out].filter((t) => /^[a-z0-9-]{2,24}$/.test(t)).slice(0, 10);
}

const SCORE = { en: 'Score', tr: 'Puan' };
const DEFAULT_SCORING = {
  metric: 'points', order: 'desc', format: 'number', label: SCORE,
  // Generous first limits: the platform only flags during the calibration window.
  minDurationMs: 3000, maxPerSecond: 1000, maxScore: 10_000_000,
};

const games = [];
for (const slug of readdirSync(join(root, 'games')).sort()) {
  const metaPath = join(root, 'games', slug, 'game.json');
  if (!existsSync(metaPath)) continue;
  const m = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (m.description?.en === 'Short description.') continue;           // untouched scaffold
  if (passing && !passing.has(slug)) continue;
  const id = slug.replace(/[^a-z0-9]/g, '');
  const manifest = {
    $schema: 'https://ayvago.com/schemas/manifest.v1.json',
    id,
    title: { en: m.title.en, tr: m.title.tr },
    description: { en: m.description.en, tr: m.description.tr },
    category: category(m),
    categories: m.genres,
    tags: tags(m),
    entry: `${ORIGIN}/games/${slug}/`,
    orientation: m.orientation,
    input: [...new Set([...m.controls, 'mouse'])].filter((i) => ['touch', 'mouse', 'keyboard', 'gamepad'].includes(i)),
    players: { min: 1, max: 1 },
    scoring: { ...DEFAULT_SCORING, ...(m.platform?.scoring ?? {}) },
    ads: { rewarded: [], interstitial: [] },
    ageRating: m.platform?.ageRating ?? '3+',
    sdkVersion: 2,
    assets: {
      icon: `/games/${slug}/ayvago/icon-512.png`,
      cover: `/games/${slug}/ayvago/cover-1920x1080.jpg`,
      screenshot: `/games/${slug}/ayvago/screenshot.jpg`,
    },
    version: /^\d+\.\d+\.\d+$/.test(m.version) ? m.version : '1.0.0',
  };
  const dir = join(root, 'public', 'games', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ayvago.json'), JSON.stringify(manifest, null, 2) + '\n');
  games.push({ slug, manifest });
}

// Only what differs per game goes into the catalog; arcadeGame() fills the shared defaults.
const DEFAULT_TEXT = JSON.stringify(DEFAULT_SCORING);
const featuredSlugs = new Set(
  games.filter(({ slug }) => JSON.parse(readFileSync(join(root, 'games', slug, 'game.json'), 'utf8')).platform?.featured).map((g) => g.slug),
);
const entries = games.map(({ slug, manifest: m }) => {
  const e = { slug, title: m.title, description: m.description, category: m.category, categories: m.categories, tags: m.tags, orientation: m.orientation, input: m.input };
  if (m.ageRating !== '3+') e.ageRating = m.ageRating;
  if (JSON.stringify(m.scoring) !== DEFAULT_TEXT) e.scoring = m.scoring;
  if (m.version !== '1.0.0') e.version = m.version;
  if (featuredSlugs.has(slug)) e.featured = true;
  return e;
});
const catalogTs = `import type { GameManifestInput } from './manifest';
import type { CatalogStatus, SeedGame } from './seed-catalog';

// Ayvago Arcade: in-house retro games built on one shared runtime (selchook/ayvago-games) and
// served from one origin, each at \${ARCADE_ORIGIN}/games/<slug>/ with its ayvago.json, icon and
// cover beside it. Generated by scripts/gen-platform.mjs in that repository: regenerate there
// instead of editing by hand.

export const ARCADE_ORIGIN = '${ORIGIN}';

// 'coming_soon' until the origin is deployed and checked (docs/setup/phase-2.md, slice 2.6).
export const ARCADE_STATUS: CatalogStatus = '${STATUS}';

const ARCADE_ADDED_AT = '${ADDED_AT}';

// Generous first limits: scores are only flagged during the calibration window.
const ARCADE_SCORING: GameManifestInput['scoring'] = ${JSON.stringify(DEFAULT_SCORING)};

type ArcadeEntry = Pick<
  GameManifestInput,
  'title' | 'description' | 'category' | 'categories' | 'tags' | 'orientation' | 'input'
> &
  Partial<Pick<GameManifestInput, 'ageRating' | 'scoring' | 'version'>> & {
    slug: string;
    featured?: boolean;
  };

function arcadeGame({ slug, featured, ageRating, scoring, version, ...text }: ArcadeEntry): SeedGame {
  return {
    slug,
    repo: '${REPO}',
    status: ARCADE_STATUS,
    addedAt: ARCADE_ADDED_AT,
    ...(featured ? { featured } : {}),
    manifest: {
      id: slug.replace(/-/g, ''),
      ...text,
      entry: \`\${ARCADE_ORIGIN}/games/\${slug}/\`,
      players: { min: 1, max: 1 },
      scoring: scoring ?? ARCADE_SCORING,
      ads: { rewarded: [], interstitial: [] },
      ageRating: ageRating ?? '3+',
      sdkVersion: 2,
      assets: {
        icon: \`/games/\${slug}/ayvago/icon-512.png\`,
        cover: \`/games/\${slug}/ayvago/cover-1920x1080.jpg\`,
        screenshot: \`/games/\${slug}/ayvago/screenshot.jpg\`,
      },
      version: version ?? '1.0.0',
    },
  };
}

export const ARCADE_GAMES: SeedGame[] = [
${entries.map((e) => `  arcadeGame(${JSON.stringify(e)}),`).join('\n')}
];
`;
// Same Prettier settings as the platform repository (its CI runs prettier --check).
const formatted = await format(catalogTs, { parser: 'typescript', printWidth: 100, singleQuote: true, trailingComma: 'all' });
writeFileSync(join(root, 'platform', 'arcade-catalog.ts'), formatted);
console.log(`platform: ${games.length} manifests → public/games/*/ayvago.json, platform/arcade-catalog.ts (origin ${ORIGIN})`);
