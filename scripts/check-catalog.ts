// Parses the generated platform catalog (platform/arcade-catalog.ts) with the platform's schema,
// exactly as apps/web/lib/catalog does on the platform. Run: npx tsx scripts/check-catalog.ts
import { ARCADE_GAMES } from '../platform/arcade-catalog';
import { parseGameManifest } from './vendor/manifest';

let bad = 0;
for (const seed of ARCADE_GAMES) {
  const r = parseGameManifest(seed.manifest);
  if (!r.ok) {
    bad++;
    console.log(`FAIL ${seed.slug}: ${r.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  }
}
console.log(`${ARCADE_GAMES.length - bad}/${ARCADE_GAMES.length} catalog entries parse`);
process.exit(bad ? 1 : 0);
