#!/usr/bin/env node
// Build and test only the games a change touches (scripts/changed-games.mjs): the smoke test and,
// unless --smoke-only, the platform protocol check. Shared code changes test every game.
// Usage: node scripts/test-changed.mjs [base-ref | all, default origin/main] [--games "a b"] [--shard i/n] [--smoke-only]
// --games skips the diff and tests the listed games (CI passes the list it already worked out);
// --shard i/n tests every n-th of them, starting with the i-th (CI splits big runs over parallel jobs).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gi = args.indexOf('--games');
const given = gi >= 0 ? args[gi + 1] : undefined;
const si = args.indexOf('--shard');
const [shard, shards] = si >= 0 ? args[si + 1].split('/').map(Number) : [1, 1];
const base = args.find((a, i) => !a.startsWith('--') && (gi < 0 || i !== gi + 1) && (si < 0 || i !== si + 1)) ?? 'origin/main';
const smokeOnly = args.includes('--smoke-only');

const run = (cmd, cmdArgs, env = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

const list = given !== undefined ? given.trim() : base === 'all' ? 'all'
  : execFileSync('node', ['scripts/changed-games.mjs', base], { cwd: root, encoding: 'utf8' }).trim();
if (!list) {
  console.log(`No game changed since ${base}; nothing to test.`);
  process.exit(0);
}
const every = readdirSync(join(root, 'games')).filter((s) => existsSync(join(root, 'games', s, 'index.html'))).sort();
let slugs = list === 'all' ? (shards > 1 ? every : []) : list.split(/\s+/).filter(Boolean);
if (shards > 1) slugs = slugs.filter((_, k) => k % shards === shard - 1);
if (shards > 1 && !slugs.length) {
  console.log(`Shard ${shard}/${shards} has no games.`);
  process.exit(0);
}
console.log(!slugs.length ? 'Testing every game.' : `Testing ${slugs.join(', ')}${shards > 1 ? ` (shard ${shard}/${shards})` : ''}.`);

run('node', ['scripts/gen-registry.mjs']);
run('npx', ['tsc', '--noEmit']);
// Always set GAMES, so a value inherited from the environment cannot narrow a full build.
run('npx', ['vite', 'build'], { GAMES: slugs.join(' ') });
run('node', ['scripts/smoke-test.mjs', ...slugs]);
if (!smokeOnly) run('node', ['scripts/platform-harness.mjs', ...slugs]);
