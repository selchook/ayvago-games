#!/usr/bin/env node
// Which games a change touches, so CI builds and smoke-tests only those.
// Usage: node scripts/changed-games.mjs <base-ref>
// Prints the slugs separated by spaces, `all` when shared runtime code changed (src/core, shared
// assets, build config: every game depends on it), or nothing when no game is affected.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2];
if (!base) { console.error('usage: changed-games.mjs <base-ref>'); process.exit(2); }

const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);

// Only these paths change how every game runs: the shared runtime, the shared assets and the build
// setup. Anything else that is not a game's own folder (scripts, tools, CI, docs, the portal, the
// generated registry, .gitignore) cannot break a game, so it selects no game.
const shared = [/^src\/(?!generated\/)/, /^public\/assets\//, /^vite\.config\.ts$/, /^tsconfig\.json$/,
  /^package(-lock)?\.json$/];
// Per-game paths: the game's own folder and its generated platform files.
const own = [/^games\/([^/]+)\//, /^public\/games\/([^/]+)\//];

const slugs = new Set();
let all = false;
for (const f of files) {
  const m = own.map((r) => f.match(r)).find(Boolean);
  if (m) slugs.add(m[1]);
  else if (shared.some((r) => r.test(f))) all = true;
}
if (all) console.log('all');
else console.log([...slugs].filter((s) => existsSync(join(root, 'games', s, 'index.html'))).sort().join(' '));
