#!/usr/bin/env node
// `npm run test:unity`: the Unity pipeline without Unity.
//   1. check:unity (the package's .meta files, the SDK doc copy, the adapter bundle, the JS, C# with mcs)
//   2. the smoke test of the Unity fixture (the package's real WebGL template and jslib, a canvas game
//      in place of Unity; desktop landscape and phone portrait)
//   3. the platform harness on the fixture (the full GHA flow, ads on and off), unless --smoke-only
// The fixture is staged in a temporary folder for each step and never touches public/ or dist/.
// Usage: node scripts/test-unity.mjs [--smoke-only]
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const smokeOnly = process.argv.includes('--smoke-only');
const run = (script, ...args) => execFileSync('node', [join('scripts', script), ...args], { cwd: root, stdio: 'inherit' });

run('check-unity.mjs');
run('smoke-test.mjs', '--unity-fixture');
if (!smokeOnly) run('platform-harness.mjs', '--unity-fixture');
console.log('\ntest:unity passed');
