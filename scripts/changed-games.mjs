#!/usr/bin/env node
// Which games a change touches, so CI builds and smoke-tests only those.
// Usage: node scripts/changed-games.mjs <base-ref>
// Prints the slugs separated by spaces, `all` when shared code changed (core, scripts, assets,
// config: every game depends on it), or nothing when no game is affected (docs only).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2];
if (!base) { console.error('usage: changed-games.mjs <base-ref>'); process.exit(2); }

const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);

// Paths that never change how a game runs. src/generated/registry.json is the portal's list,
// rebuilt from every game.json, so adding a game must not count as a shared change.
const inert = [/^docs\//, /\.md$/, /^\.claude\//, /^platform\//, /^public\/thumbs\//, /^tools\//, /^portal\//,
  /^src\/generated\//];
// Per-game paths: the game's own folder and its generated platform files.
const own = [/^games\/([^/]+)\//, /^public\/games\/([^/]+)\//];

const slugs = new Set();
let all = false;
for (const f of files) {
  if (inert.some((r) => r.test(f))) continue;
  const m = own.map((r) => f.match(r)).find(Boolean);
  if (m) slugs.add(m[1]);
  else all = true;
}
if (all) console.log('all');
else console.log([...slugs].filter((s) => existsSync(join(root, 'games', s, 'index.html'))).sort().join(' '));
