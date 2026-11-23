// City generator tests: the headless plan checks (scripts/city-unit.ts: determinism, lots,
// roads, lane and pedestrian graphs, generation time) and the GPU memory check of chunk
// streaming (scripts/city-memory.mjs).
//
//   node scripts/city-test.mjs [--unit-only] [--url http://localhost:5173]
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const run = (cmd, a) => spawnSync(cmd, a, { cwd: root, stdio: 'inherit' }).status ?? 1;

let failed = 0;
console.log('— plan checks');
failed += run('npx', ['tsx', 'scripts/city-unit.ts']) ? 1 : 0;
if (!args.includes('--unit-only')) {
  console.log('\n— GPU memory while streaming');
  failed += run('node', ['scripts/city-memory.mjs', ...args.filter((a) => a !== '--unit-only')]) ? 1 : 0;
}
console.log(failed ? '\ncity tests: FAIL' : '\ncity tests: PASS');
process.exit(failed ? 1 : 0);
