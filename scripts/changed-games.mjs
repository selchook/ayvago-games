#!/usr/bin/env node
// Which games a change touches, so CI builds and smoke-tests only those.
// Usage: node scripts/changed-games.mjs <base-ref> [--why]
// Prints the slugs separated by spaces, `all` when a dependency upgrade could break any game, or
// nothing when no game is affected (docs, scripts, tools, CI). --why explains the choice on stderr.
//
//   games/<slug>/, public/games/<slug>/       -> that game
//   public/assets/kenney/<pack>/...           -> the games that load that pack
//   public/assets/oga/<pack>/<dir>/...        -> the games that load sounds from that folder
//   public/assets/characters/, characters.ts  -> the games with player characters
//   any other shared runtime (src/core, ...)  -> the canary set: one game for every combination of
//                                               style, orientation, online, physics, pixel art and
//                                               characters (an error in shared code shows up in
//                                               every game alike; the variants catch the rest)
//   package.json / package-lock.json          -> all (a library upgrade can break any game)
// The full suite runs every night and on demand (Actions -> ci -> Run workflow).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2];
const why = process.argv.includes('--why');
if (!base) { console.error('usage: changed-games.mjs <base-ref> [--why]'); process.exit(2); }

const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);

const slugsAll = readdirSync(join(root, 'games')).filter((s) => existsSync(join(root, 'games', s, 'index.html'))).sort();
const source = (dir) => readdirSync(dir).filter((f) => /\.(ts|json)$/.test(f)).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const gameSrc = new Map(slugsAll.map((s) => [s, source(join(root, 'games', s))]));
const coreSrc = source(join(root, 'src', 'core'));
const usesCharacters = (s) => /loadCharacter\(/.test(gameSrc.get(s));

/** One game per combination of the properties that change how the shared runtime behaves. */
function canary() {
  const pick = new Map();
  for (const s of slugsAll) {
    const src = gameSrc.get(s);
    const meta = JSON.parse(readFileSync(join(root, 'games', s, 'game.json'), 'utf8'));
    const sig = [
      meta.genres.includes('retro') ? 'retro' : 'modern',
      meta.orientation,
      meta.multiplayer ? 'online' : 'solo',
      (src.match(/physics: '(\w+)'/) || [])[1] ?? 'arcade',
      /pixelArt: true/.test(src) ? 'pixel' : 'smooth',
      usesCharacters(s) ? 'characters' : 'plain',
    ].join(' ');
    if (!pick.has(sig)) pick.set(sig, s);
  }
  return [...pick.values()];
}

const out = new Set();
let all = false;
const say = (f, what) => { if (why) console.error(`${f} -> ${what}`); };
const add = (f, list, what) => { list.forEach((s) => out.add(s)); say(f, `${what} (${list.length})`); };

for (const f of files) {
  let m;
  if ((m = f.match(/^games\/([^/]+)\//) || f.match(/^public\/games\/([^/]+)\//))) {
    if (slugsAll.includes(m[1])) add(f, [m[1]], m[1]);
  } else if (/^package(-lock)?\.json$/.test(f)) {
    all = true; say(f, 'all');
  } else if (/^public\/assets\/characters\//.test(f) || /^src\/core\/(characters\.ts|character-rig\.json)$/.test(f)) {
    add(f, slugsAll.filter(usesCharacters), 'character games');
  } else if ((m = f.match(/^public\/assets\/kenney\/([^/]+)\//))) {
    const key = `${m[1]}/`;
    if (coreSrc.includes(`'${key}`) || coreSrc.includes(`\`${key}`)) add(f, canary(), 'canary (the core loads it)');
    else add(f, slugsAll.filter((s) => gameSrc.get(s).includes(key)), `games using kenney/${m[1]}`);
  } else if ((m = f.match(/^public\/assets\/oga\/([^/]+)\/(.+)\/[^/]+$/))) {
    const key = `${m[2]}/`;
    if (coreSrc.includes(`oga/${m[1]}`)) add(f, canary(), 'canary (the core loads it)');
    else add(f, slugsAll.filter((s) => gameSrc.get(s).includes(key)), `games using oga/${m[1]}/${m[2]}`);
  } else if (/^src\/(?!generated\/)/.test(f) || /^public\/assets\//.test(f) || /^(vite\.config\.ts|tsconfig\.json)$/.test(f)) {
    add(f, canary(), 'canary');
  } else say(f, 'no game');
}
if (all) console.log('all');
else console.log([...out].sort().join(' '));
