// Which games the test scripts can open, and what kind they are.
// A Phaser game has games/<slug>/index.html (Vite builds it into dist/games/<slug>/). A Unity game
// ("engine": "unity" in games/<slug>/game.json) has no index.html there: its WebGL build lives in
// public/games/<slug>/ (index.html, Build/, TemplateData/), which Vite copies into dist/ as is.
// The Unity test fixture (scripts/unity-fixture.mjs) is a Unity game with the slug
// "unity-fixture" that exists only while a script serves it (AYVAGO_UNITY_FIXTURE).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_SLUG, fixtureMeta } from './unity-fixture.mjs';

export { FIXTURE_SLUG };

/** game.json of a game (the fixture's own while it is served), or null. */
export function metaOf(root, slug) {
  if (slug === FIXTURE_SLUG && process.env.AYVAGO_UNITY_FIXTURE) return fixtureMeta();
  try {
    return JSON.parse(readFileSync(join(root, 'games', slug, 'game.json'), 'utf8'));
  } catch {
    return null;
  }
}

export const isUnity = (root, slug) => metaOf(root, slug)?.engine === 'unity';

/** Every Unity game in games/ (not the fixture). */
export const unitySlugs = (root) => readdirSync(join(root, 'games')).filter((s) => isUnity(root, s)).sort();

/**
 * Whether a game can be opened: in dev from its source (games/<slug>/index.html, or a Unity game's
 * build in public/games/<slug>/), otherwise from the production build in dist/.
 */
export function servable(root, slug, dev) {
  if (slug === FIXTURE_SLUG) return !!process.env.AYVAGO_UNITY_FIXTURE;
  if (!dev) return existsSync(join(root, 'dist', 'games', slug, 'index.html'));
  if (existsSync(join(root, 'games', slug, 'index.html'))) return true;
  return isUnity(root, slug) && existsSync(join(root, 'public', 'games', slug, 'index.html'));
}

/** The minimum run length the platform accepts for a game (game.json platform.scoring.minDurationMs, studio default 3000). */
export const minDurationOf = (root, slug) => metaOf(root, slug)?.platform?.scoring?.minDurationMs ?? 3000;
