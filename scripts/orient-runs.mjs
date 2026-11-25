// The runs a browser test makes of one game. A fixed-orientation game gets one run in the test's
// own context, as always. An adaptive game (game.json "orientation": "adaptive": landscape
// 1280×720 on desktops and tablets, portrait 720×1280 on phones, src/core/registry.ts isPhone)
// gets two: a desktop run (no touch, a landscape window) and a phone run (Playwright's iPhone 13:
// touch, no hover, a 390 px short side), each checked to boot in the orientation its device must
// get. With `tablet`, a third run on an iPad (touch, an 810 px short side) must boot landscape.
// No ?orient= override is used here: the runs prove the device rule itself.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const isAdaptive = (root, slug) => {
  try { return JSON.parse(readFileSync(join(root, 'games', slug, 'game.json'), 'utf8')).orientation === 'adaptive'; } catch { return false; }
};

/** Playwright device descriptors, rendered at device scale 1 (software WebGL is slow enough). */
const device = (playwright, name) => ({ ...playwright.devices[name], deviceScaleFactor: 1 });

/**
 * [{ slug, label, expect, context }]: `context` is null for a fixed game (the test keeps its own),
 * else the browser context options; `expect` the orientation the game must report.
 */
export function runsOf(playwright, root, slug, o = {}) {
  if (!isAdaptive(root, slug)) return [{ slug, label: slug, expect: null, context: null }];
  const runs = [
    { slug, label: `${slug} [desktop landscape]`, expect: 'landscape', context: { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 } },
    { slug, label: `${slug} [phone portrait]`, expect: 'portrait', context: device(playwright, 'iPhone 13') },
  ];
  if (o.tablet) runs.push({ slug, label: `${slug} [tablet landscape]`, expect: 'landscape', context: device(playwright, 'iPad (gen 7)') });
  return runs;
}

/** The page's viewport for a run (for clicks placed in page pixels). */
export const viewportOf = (run, fallback) => run.context?.viewport ?? fallback;
