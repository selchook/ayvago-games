#!/usr/bin/env node
// Build and test only the games a change touches (scripts/changed-games.mjs): the smoke test and,
// unless --smoke-only, the platform protocol check. Shared code changes test every game.
// Usage: node scripts/test-changed.mjs [base-ref | all, default origin/main] [--smoke-only]
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'origin/main';
const smokeOnly = args.includes('--smoke-only');

const run = (cmd, cmdArgs, env = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

const list = base === 'all' ? 'all'
  : execFileSync('node', ['scripts/changed-games.mjs', base], { cwd: root, encoding: 'utf8' }).trim();
if (!list) {
  console.log(`No game changed since ${base}; nothing to test.`);
  process.exit(0);
}
const slugs = list === 'all' ? [] : list.split(' ');
console.log(list === 'all' ? 'Shared code changed: testing every game.' : `Testing ${slugs.join(', ')}.`);

run('node', ['scripts/gen-registry.mjs']);
run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build'], slugs.length ? { GAMES: slugs.join(' ') } : {});
run('node', ['scripts/smoke-test.mjs', ...slugs]);
if (!smokeOnly) run('node', ['scripts/platform-harness.mjs', ...slugs]);
