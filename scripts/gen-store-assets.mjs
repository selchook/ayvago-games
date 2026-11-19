// Store art for the Ayvago platform catalog, made from the games themselves:
//   public/games/<slug>/ayvago/cover-1920x1080.jpg   catalog / game page cover
//   public/games/<slug>/ayvago/icon-512.png          square icon
//   public/games/<slug>/ayvago/screenshot.jpg        in-game frame (platform Arcade theme tiles)
//   public/games/<slug>/ayvago/card-640x360.webp     catalog card (Minimal / Modern theme tiles)
//   public/games/<slug>/ayvago/card-1280x720.webp    the same card for high-density screens
//   public/games/<slug>/ayvago/card-tr-640x360.webp, card-tr-1280x720.webp  the Turkish cards: the
//                                                    same frame with the Turkish logo
//   public/games/<slug>/ayvago/logo-en.png, logo-tr.png  the title logo on a transparent background
//   public/thumbs/<slug>.png                         thumbnail for this repo's own portal
// Each game is opened (no intro), its menu and a few seconds of play are captured, then the
// captures are composed on a branded HTML template and rendered by Chromium. The card uses the
// busiest, most colourful of several frames from the run (frameStats) with only a small title logo.
// A game with a menu theme (src/core/menu-theme.ts) gets its themed logo (the English title,
// rendered by the game itself: window.__ayvago.menuLogo) on the card and the cover instead of the
// plain title, so it looks the same on ayvago.com as on its menu; the Turkish card gets the
// Turkish one (menuLogo('tr')), a plain card the Turkish title in upper case (tr-TR).
// Usage: npm run build && node scripts/gen-store-assets.mjs [--dev] [--card-only] [slug ...]
//   --card-only   regenerate just the cards, both languages (covers, icons, screenshots and
//                 thumbnails stay)
//   --tr-from-en  re-compose just the Turkish cards of portrait games from their current English
//                 cards, which stay as they are: the frame is taken from the English card (the logo
//                 sits beside it) and its logo colour is matched. A landscape card's logo covers
//                 part of its frame, so a landscape game needs --card-only
//   --logo-only   regenerate just the logos (logo-en.png, logo-tr.png); a plain logo takes its colour
//                 from the game's current card, a themed one is rendered by the game
//   CARD_FRAMES=<dir> keeps the card candidate frames; with --card-only --from-frames the cards are
//   re-composed from them without opening the games
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const cardOnly = args.includes('--card-only');
const logoOnly = args.includes('--logo-only');
const trFromEn = args.includes('--tr-from-en');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = (only.length ? only : readdirSync(join(root, 'public', 'games')))
  .filter((s) => existsSync(join(root, 'public', 'games', s, 'ayvago.json')));

// Cover title size: smaller for long titles, and small enough that the longest word fits the text column.
/**
 * The cover's description size: 40 px, smaller for a long text so the column (brand, logo, text,
 * category chip) still fits the 1080 px height (a themed logo with its emblem is taller).
 */
function descSize(text) {
  return text.length <= 420 ? 40 : Math.max(24, Math.round(38 * Math.sqrt(420 / text.length)));
}

function titleSize(title) {
  const size = title.length > 14 ? 74 : 92;
  const longest = Math.max(...title.split(/[\s-]+/).map((w) => w.length));
  return longest * size > 840 ? Math.floor(760 / longest) : size;
}

const font = (pkg, file) => readFileSync(join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const FONTS = `
@font-face { font-family: P2P; src: url(data:font/woff2;base64,${font('press-start-2p', 'press-start-2p-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: P2P; src: url(data:font/woff2;base64,${font('press-start-2p', 'press-start-2p-latin-ext-400-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: PTR; src: url(data:font/woff;base64,${readFileSync(join(root, 'src', 'core', 'fonts', 'ayvago-pixel-tr.woff')).toString('base64')}) format('woff'); unicode-range: U+0130, U+00D6, U+00DC; }
@font-face { font-family: PX; font-weight: 700; src: url(data:font/woff2;base64,${font('pixelify-sans', 'pixelify-sans-latin-700-normal.woff2')}) format('woff2'); }
@font-face { font-family: PX; font-weight: 700; src: url(data:font/woff2;base64,${font('pixelify-sans', 'pixelify-sans-latin-ext-700-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: MT; font-weight: 700; src: url(data:font/woff2;base64,${font('fredoka', 'fredoka-latin-700-normal.woff2')}) format('woff2'); }
@font-face { font-family: MT; font-weight: 700; src: url(data:font/woff2;base64,${font('fredoka', 'fredoka-latin-ext-700-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: MB; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito', 'nunito-latin-800-normal.woff2')}) format('woff2'); }
@font-face { font-family: MB; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito', 'nunito-latin-ext-800-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }`;

// Modern games (every genre but retro, src/core/style.ts) get the modern fonts and no scanlines.
const isModern = (m) => !(m.categories ?? [m.category]).includes('retro');
const modernCss = `
  .brand, h1, .chip, .name { font-family: MT !important; font-weight: 700 !important; letter-spacing: 1px !important; }
  h1 { line-height: 1.05 !important; }
  p, body { font-family: MB !important; font-weight: 800 !important; }
  .scan { display: none; }
  .chip { border-radius: 999px; padding: 14px 28px !important; }
  .shot { border-radius: 28px; overflow: hidden; }
  .frame { border-radius: 0; }`;
const mark = readFileSync(join(root, 'public', 'assets', 'ayvago', 'boot_mark.png')).toString('base64');

// Primary platform category (the game's first genre) shown as a chip on the cover.
/** Renders the captured frame at 540×960 (960×540 landscape) as a compact JPEG. */
async function renderScreenshot(browser, b64, land, path) {
  const [w, h] = land ? [960, 540] : [540, 960];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<body style="margin:0"><img src="data:image/png;base64,${b64}" style="width:${w}px;height:${h}px;display:block">`);
  await page.screenshot({ path, type: 'jpeg', quality: 82 });
  await page.close();
}

// Games starring a player character get the character on the cover, large and in a pose from
// the game, so the art matches what players see (public/assets/characters/<id>/<pose>.png).
const COVER_HERO = {
  archery: ['explorer', 'action2'],
  'bomb-maze': ['soldier', 'cheer1'],
  'coin-catcher': ['rookie', 'cheer2'],
  'dungeon-dash': ['explorer', 'action2'],
  'head-soccer': ['adventurer', 'kick'],
  'jetpack-rush': ['soldier', 'jump'],
  'penalty-kick': ['zombie', 'kick'],
  'pixel-runner': ['rookie', 'walk1'],
  'platform-hopper': ['explorer', 'jump'],
  'rope-swing': ['adventurer', 'hang'],
  'sky-jumper': ['zombie', 'jump'],
  'tito-tank': ['soldier', 'cheer1'],
};
const heroImage = (slug) => {
  const h = COVER_HERO[slug];
  return h && readFileSync(join(root, 'public', 'assets', 'characters', h[0], `${h[1]}.png`)).toString('base64');
};

const CATEGORY = {
  arcade: 'ARCADE', action: 'ACTION', casual: 'CASUAL', puzzle: 'PUZZLE', retro: 'RETRO',
  sports: 'SPORTS', strategy: 'STRATEGY', card: 'CARD', word: 'WORD',
};

function coverHtml(m, menu, play, hero, logo) {
  const land = m.orientation === 'landscape';
  const shot = (b64, cls) => `<div class="shot ${cls}"><img src="data:image/png;base64,${b64}"></div>`;
  return `<!doctype html><html><head><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1920px; height: 1080px; overflow: hidden; background: #201e1d; font-family: PX; color: #f3f2f2; position: relative; }
  .glow { position: absolute; inset: -200px; background: radial-gradient(circle at 75% 55%, rgba(236,48,19,.45), transparent 55%), radial-gradient(circle at 10% 90%, rgba(62,230,255,.18), transparent 45%); }
  .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 5px); z-index: 5; pointer-events: none; }
  .left { position: absolute; left: 110px; top: 0; bottom: 0; width: ${land ? 760 : 900}px; display: flex; flex-direction: column; justify-content: center; gap: 36px; z-index: 2; }
  .brand { display: flex; align-items: center; gap: 18px; font-family: P2P; font-size: 26px; letter-spacing: 4px; }
  .brand .mark { width: 58px; height: 58px; }
  .brand b { color: #ec3013; font-size: 16px; letter-spacing: 6px; font-weight: normal; }
  h1 { font-family: P2P; font-weight: normal; font-size: ${titleSize(m.title.en)}px; line-height: 1.25; color: #ffd23f; text-shadow: 0 10px 0 #000, 0 0 40px rgba(255,210,63,.35); }
  p { font-size: ${descSize(m.description.en)}px; font-weight: 700; line-height: 1.3; color: #d8d4d2; max-width: 820px; }
  .chip { align-self: flex-start; font-family: P2P; font-size: 20px; background: #ec3013; color: #fff; padding: 14px 20px; box-shadow: 0 6px 0 #000; }
  .shot { position: absolute; z-index: 3; border: 10px solid #0a0909; box-shadow: 0 30px 0 rgba(0,0,0,.5), 0 0 0 4px #ec3013; background: #000; }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .p1 { width: 420px; height: 747px; right: 150px; top: 166px; transform: rotate(3deg); }
  .p2 { width: 330px; height: 587px; right: 560px; top: 300px; transform: rotate(-5deg); opacity: .9; }
  .l1 { width: 900px; height: 506px; right: 90px; top: 230px; transform: rotate(2deg); }
  .hero { position: absolute; z-index: 4; height: 470px; bottom: 30px; filter: drop-shadow(0 18px 0 rgba(0,0,0,.55)) drop-shadow(0 0 30px rgba(255,210,63,.25)); image-rendering: auto; }
  .hero.p { left: ${land ? 0 : 880}px; }
  .hero.l { left: 790px; }
  .logo-img { display: block; align-self: flex-start; max-width: ${land ? 740 : 820}px; max-height: 330px; margin: -10px 0 -6px -14px;
    filter: drop-shadow(0 12px 18px rgba(0,0,0,.55)); }
  ${isModern(m) ? modernCss : ''}
  </style></head><body><div class="glow"></div>
  <div class="left">
    <div class="brand"><img class="mark" src="data:image/png;base64,${mark}">AYVAGO <b>GAMES</b></div>
    ${logo ? `<img class="logo-img" src="data:image/png;base64,${logo}">` : `<h1>${m.title.en.toUpperCase()}</h1>`}
    <p>${m.description.en}</p>
    <span class="chip">${CATEGORY[m.category] ?? 'ARCADE'}</span>
  </div>
  ${land ? shot(play, 'l1') : shot(menu, 'p2') + shot(play, 'p1')}
  ${hero ? `<img class="hero ${land ? 'l' : 'p'}" src="data:image/png;base64,${hero}">` : ''}
  <div class="scan"></div></body></html>`;
}

function iconHtml(m, play) {
  return `<!doctype html><html><head><style>${FONTS}
  * { margin: 0; box-sizing: border-box; }
  body { width: 512px; height: 512px; overflow: hidden; background: #201e1d; position: relative; }
  .crop { position: absolute; inset: 0; background: url(data:image/png;base64,${play}) center 72% / cover; filter: saturate(1.15); }
  .shade { position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,.85), transparent 45%); }
  .name { position: absolute; left: 28px; right: 110px; top: 34px; font-family: P2P; font-size: ${m.title.en.length > 12 ? 30 : 38}px; line-height: 1.3; color: #ffd23f; text-shadow: 0 5px 0 #000; }
  .frame { position: absolute; inset: 0; border: 14px solid #ec3013; }
  .mark { position: absolute; right: 26px; bottom: 26px; width: 64px; height: 64px; filter: drop-shadow(0 4px 0 #000); }
  ${isModern(m) ? modernCss : ''}
  </style></head><body><div class="crop"></div><div class="shade"></div>
  <img class="mark" src="data:image/png;base64,${mark}">
  <div class="name">${m.title.en.toUpperCase()}</div><div class="frame"></div></body></html>`;
}

// ---- Catalog card: a 16:9 in-game frame with a small title logo, no other text. ----
// The logo sits bottom-left: the platform tile draws its "New" / "Coming soon" badges top-left.
// Laid out at 640×360 CSS px and rendered at device scale 1 and 2, so both sizes are drawn
// natively sharp. Per-game tuning when the default capture misses the action:
//   wait    ms to let the round start (banners, countdowns) before the scripted play
//   pick    candidate frame to use (index into CAPTURES) instead of the liveliest one
//   accent  logo fill colour instead of the one taken from the frame
//   stage   source of an async function run in the page once Play is active, to set up the
//           scene the card should show through the game's own test hooks (a feature screen,
//           a busy moment). With a stage the scripted play sends no input: the captures are
//           taken of the staged scene as it runs.
// The picks below were chosen by eye on the November 2026 run (frames without a round-start,
// "wrong" or game-over banner); check them when the cards are regenerated.
const CARD = {
  // a 3D tip-off that runs slowly in software WebGL: wait for the ball to be in play
  'blacktop-kings': { wait: 30000 },
  // Air Hockey's card shows a live rally: the default capture caught the serve (a still puck) or
  // a "CONCEDED!" banner, so once the countdown is over the stage strikes the puck up the table
  // from the player's mallet; the frames show it flying with its trail and the CPU going for it.
  'air-hockey': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      for (let i = 0; i < 100 && p.phase !== 'live'; i++) await new Promise((r) => setTimeout(r, 100));
      const puck = p.pucks[0];
      p.me.x = 470; p.me.y = 1010;
      puck.x = 430; puck.y = 900; puck.vx = -620; puck.vy = -1450;
      await new Promise((r) => setTimeout(r, 120));
    }`,
    // frame 1: the puck streaking at the CPU's goal (later frames reach the goal and its replay)
    pick: 1,
  },
  'color-bounce': { pick: 2 },
  'crypt-crawler': { wait: 2500 },
  // Crystal Keep's card shows a card draft over a built-up defence: the autopilot plays the
  // first map for a while, then a draft with one card of each rarity opens.
  'crystal-keep': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      p.testStart(0);
      await new Promise((r) => setTimeout(r, 1500));
      p.testAuto(true);
      p.testStep(75);
      p.testSync();
      p.testAuto(false);
      p.testSettle();
      p.testDraft(['goldRain', 'criticalStrikes', 'deepFreeze']);
      await new Promise((r) => setTimeout(r, 2500));
    }`,
    pick: 4,
  },
  // Star Squadron's card shows the card bar open over a live 3D fight: the autopilot flies the
  // first sector with a few cards for a while (sped up for software rendering), then a card offer
  // with a rare, an epic and the synergy they make opens in the bar while the fight runs on.
  'star-squadron': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      p.testSpeed = 3;
      p.testAuto(true);
      p.testCards(['spread', 'drone', 'drone', 'homing']);
      await new Promise((r) => setTimeout(r, 9000));
      p.testDraft(['homing', 'chain', 'stormMissiles']);
      await new Promise((r) => setTimeout(r, 3500));
    }`,
    pick: 2,
  },
  // Kickflip Park's card shows a big air: the skater launched high over the plaza with the
  // special meter full, mid Comet Twist (the board flipping under the feet, the glow on), the
  // simulation slowed right down so every candidate frame catches the trick in the air. The
  // first-session tutorial is closed first, and the rider is on the owner's Blue Cruiser (the
  // most colourful board; the default black one reads dark this small).
  'kickflip-park': {
    // PLAY opens the session setup (1.2): START it as the button does
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      if (p.testStart?.()) await new Promise((r) => setTimeout(r, 1200));
      p.testHint(false);
      p.testTutorial?.(false);
      p.testBoard?.('blue');
      p.testSpecial();
      p.testPlace(-3, 20, Math.PI, 5);
      p.testInput({ fwd: -0.35 });
      await new Promise((r) => setTimeout(r, 1800));
      p.testCam(Math.PI / 2 + 0.4, 5.8, 1.5);
      p.sim.testAir(11.5);
      for (let i = 0; i < 100 && p.sim.y < 2.6; i++) await new Promise((r) => setTimeout(r, 50));
      p.testSpeed = 0.05;
      p.testInput({ fwd: -0.35, special: true, dir: 0 });
      await new Promise((r) => setTimeout(r, 1500));
    }`,
    pick: 4,
  },
  // Zombie Grove's card shows the survivor at dusk amid a big horde with weapon effects: the
  // autopilot fights on with evolved weapons (blade spin, warding shields, fires, arrows, the
  // tower shield, the robot) while two hundred zombies and a few sword-carrying Hulks close in,
  // two power-ups glowing on the ground; hints off, nothing hurts the hero (sim.god).
  'zombie-grove': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      p.quiet = true;
      p.testTime(30);
      p.testKit([['blade', 5, true], ['wards', 5, true], ['torch', 5, true], ['bow', 5, true], ['shield', 4], ['robot', 4]], [['reach', 5], ['armor', 5], ['vigor', 5]]);
      p.sim.player.hp = p.sim.player.maxHp;
      p.sim.god = true;
      p.sim.player.x = 3; p.sim.player.z = 12; p.testSnap();
      p.testHorde(210);
      p.testHorde(6, ['tank']);
      p.testPower('rage', -5, -6);
      p.testPower('freeze', 6, -3);
      p.testAuto(true, true);
      await new Promise((r) => setTimeout(r, 2500));
    }`,
  },
  // Rooftop Courier's card shows a dramatic gap jump at dusk: the run jumps far ahead (deep into
  // the evening: lit windows, lamps on) to an Old Factory kicker, the autopilot launches off it with
  // the paper glider and the express ribbon on (the 1.1 power-ups) and the run is stepped on (game
  // time, however slow the renderer) to the moment the courier hangs over the alley; there it
  // stops and the camera swings out to a three-quarter view from above, the glider's wings spread.
  'rooftop-courier': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      p.testTutorial(false);
      p.testPlace(1500, 0);
      p.testFind('kicker', 14);
      p.testAuto(true);
      p.testPower('glide');
      p.testPower('express');
      const sim = p.sim;
      for (let i = 0; i < 400; i++) {
        p.testAdvance(1000 / 60);
        if (sim.state === 'air' && !sim.course.blockAt(sim.s) && sim.vy < 1.5) break;
      }
      p.testCam(0.95, 6.5, 2.6);
      p.testClearUi();
      await sleep(1500);
    }`,
    pick: 2,
  },
  // Coaster Rush's card shows the steel train plunging down Windmill Hill's first drop over the
  // town, every seat full and the riders' hands in the air, seen from the front side; the ride is
  // stepped to the moment and held there (testAdvance stops the clock), so every frame shows it.
  'coaster-rush': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      p.testTutorial(false);
      p.meta.seen = ['turbo', 'magnet', 'safety', 'slowmo', 'golden', 'balloon', 'loop', 'lean', 'fork', 'style_steel', 'style_mouse', 'style_hanging', 'style_monorail', 'style_flume'];
      p.testAuto(true);
      p.testArea(1);
      const sim = p.sim;
      sim.riders = sim.seats;
      const sec = sim.sectionAt(sim.s);
      const f = sec.features.find((q) => q.kind === 'drop' && q.s0 > sim.s);
      sim.place(f.s0 + 0.3, 3.2);
      for (let i = 0; i < 400; i++) { p.testAdvance(1000 / 60); if (sim.at(sim.s - sim.length * 0.55).ty < -0.6) break; }
      p.view.forceMood = 'thrill';
      p.testPower('golden');
      for (let i = 0; i < 12; i++) p.testAdvance(1000 / 60);
      p.testCam(Math.PI * 0.68, 5.4, 1.3, 1.2, -0.3);
      p.testAdvance(16);
      p.banners.clear();
      p.testClearUi();
      await sleep(1500);
    }`,
  },
  // Skull Isle's card (landscape since 1.3, cover-fit) shows the hero mid-combo against a skeleton
  // crew on Sandy Cove's north beach, Ernest the parrot over the fight and the crew's ship at anchor
  // behind: the training is skipped, nothing hurts the hero, the camera looks a little past them so
  // the ship shows over the fight (clear of the logo in the bottom-left corner) and comes a little
  // closer than in play, and the run is
  // slowed right down while the attack is held, so every candidate frame catches a swing.
  'skull-isle': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      p.testSkipTutorial();
      p.quiet = true;
      p.god = true;
      p.testTimeScale(5);
      p.sim.p.x = -3.2; p.sim.p.z = -8.2; p.sim.p.face = Math.PI * 0.85;
      p.testStep(1.9);
      p.testFoes('skel', 3, 2.3);
      p.testFoes('runner', 1, 3.2);
      p.testStep(1.05);
      p.testPower('fury');
      p.testPower('parrot');
      p.testClean();
      p.view.lookAhead = 1.2;
      p.view.zoom = p.view.zoomTarget = 0.84;
      p.testSnap();
      p.testInput({ attack: true }, 60);
      p.testSpeed = 0.2;
      await sleep(1500);
    }`,
  },
  // Hex Realm's card (landscape since 1.2, cover-fit) shows the troll fight in the Old Mine's
  // cavern: the hero (a warrior, the default) with an epic weapon and a golden shield mid-combo
  // against Grukk the Mine Troll and his skeleton miners, with the red warning rings of a quake on
  // the stone floor. The class choice and the training are skipped, nothing hurts the hero, the
  // boss banners are cleared and the fight is slowed right down, so every candidate frame catches
  // a swing.
  'hex-realm': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      p.testSkipTutorial();
      p.quiet = true;
      p.god = true;
      p.camp.s.level = 9;
      p.camp.s.gear.weapon = p.camp.makeItem('weapon', 9, 'epic');
      p.camp.s.gear.armor = p.camp.makeItem('armor', 9, 'legendary');
      p.testRoom('mine', 2);
      p.testAuto(true);
      p.testStep(3.2);
      const b = p.battle, h = b.hero, boss = b.bossUp;
      h.x = -0.6; h.z = 3.4; boss.x = 0.4; boss.z = 0.6; boss.face = Math.PI; h.face = 0.2;
      b.zones.length = 0;
      b.spawn('skeleton', -3.2, 1.2, 0); b.spawn('ghoul', 3.0, 2.4, 0);
      p.view.battle.camPos.set(0, 0, 0);
      p.testStep(1.0);
      p.children.list.filter((o) => o.depth === 9400).forEach((o) => o.destroy());
      p.testSpeed = 0.2;
      await sleep(1500);
    }`,
  },
  // Sushi Rush's card (landscape, cover-fit) shows a busy evening at the bar on day 6: six rabbits
  // on the stools with their orders over them, the noodle pot and the steamer going, the lanterns
  // and the sakura tree in, and the chef just handing a finished dish to the customer who ordered
  // it, so the first frame catches the coins popping (picked; the critic walks in at the front).
  // The chef choice is skipped; the autopilot keeps cooking while the frames are taken.
  'sushi-rush': {
    pick: 0,
    stage: `async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__sushi.stage('busy');
      await sleep(300);
    }`,
  },
  // Neon Ronin's card (landscape, cover-fit) shows a fight on the neon rooftops of 2-3 (Night
  // Bazaar): the hero (upgraded katana and blaster, three implants) mid-combo among walkers, a gunner
  // and drones, the signs and the rain behind. The map is skipped; the autopilot plays the level
  // ahead headless until three foes are close and a swing is out, then keeps fighting (it cannot be
  // hurt) while the frames are taken, the camera a little closer than in play.
  'neon-ronin': {
    stage: `async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__neon.stage('busy');
      await sleep(400);
    }`,
  },
  // Astro Crew's card (landscape, cover-fit) shows a heroic fight in the Dune Titan's lair on the
  // orange planet (1.1: planets are open worlds): the hives round the lair just broken, the Titan
  // awake and close, a ring of aliens round the crew member as it jumps into its mech (the
  // arrival's shockwave, cannon shells from its two cannons, damage numbers and the boss's bar); the
  // simulation then runs slowly so every candidate frame keeps the moment.
  'astro-crew': {
    pick: 0,
    stage: `async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__astro.stage('busy');
      await sleep(300);
    }`,
  },
  // Pirate Cove's card (landscape since 1.1, cover-fit) shows a broadside fight on the bright first
  // wave: a brig alongside to starboard, a frigate and two sloops ahead, cannonballs in the air both
  // ways. The wave card and hints are skipped, the wave's own ships held back, nothing sinks the
  // player, and the guns fire a broadside every 0.9 s (port and starboard in turn) while the ship
  // sails on, so every candidate frame catches shot in the air (picked: a brig blowing apart off
  // the starboard bow, gun smoke along both sides and red landing rings round the ship).
  'pirate-cove': {
    pick: 2,
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      p.testGo();
      p.hint.setVisible(false);
      p.pending = [];
      p.testFoe('brig', 4, 18);
      p.testFoe('frigate', 30, 22);
      p.testFoe('sloop', 34, -12);
      p.testFoe('sloop', 52, 8);
      p.testStep(1.6);
      p.invuln = 9999;
      let side = 1;
      const fire = setInterval(() => {
        if (!p.scene.isActive() || p.isOver) return clearInterval(fire);
        p.invuln = 9999;
        p.testFire(side);
        side = -side;
      }, 900);
      p.testFire(1);
      await sleep(600);
    }`,
  },
  'fruit-slash': { pick: 3 },
  'golden-podium': { pick: 0 },
  'light-cycles': { pick: 4 },
  'lights-out': { pick: 3 },
  // mid-run with coins in the air (the runner often falls soon after, so the frame is not "live")
  'pixel-runner': { pick: 2 },
  'rope-swing': { pick: 2 },
  'simon-says': { pick: 1 },
  // Snow Express's card shows a busy evening village: a Holiday Rush on the frozen-lake board,
  // the autopilot well into the run (several trains out, five cabins lit, the fairy lights on),
  // then slowed right down so every candidate frame keeps the trains on the tracks.
  'snow-express': {
    stage: `async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      localStorage.setItem('ayvago:snow-express:meta', JSON.stringify({ mode: 'rush', level: 1, stars: {}, rushRuns: 0, tutorial: true, keysSeen: true }));
      const g = window.__ayvago.game;
      g.scene.getScene('Play').scene.restart();
      await wait(1500);
      for (let i = 0; i < 100 && !g.scene.isActive('Play'); i++) await wait(100);
      const p = g.scene.getScene('Play');
      p.testAuto(true);
      p.testStep(150);
      for (let i = 0; i < 60 && p.sim.trains.filter((t) => t.state === 'run').length < 4; i++) p.testStep(0.5);
      p.testPowers(1);
      p.testSpeed = 0.25;
      await wait(3500);
    }`,
  },
  // Delivery Dash's card shows the van mid-delivery in a busy rush-hour street of Old Town: the
  // autopilot drives until a delivery, the camera holds the delivery shot (the house, the resident
  // waving at the door, coins popping and the pay floating up, cars passing) while the simulation
  // is slowed right down so every candidate frame keeps the moment.
  'delivery-dash': {
    stage: `async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const stars = {};
      for (let i = 1; i <= 18; i++) stars[i] = 2;
      localStorage.setItem('ayvago:delivery-dash:meta', JSON.stringify({ mode: 'shift', shift: 5, stars, tutorial: true, paint: 1, paints: [0, 1] }));
      const g = window.__ayvago.game;
      const old = g.scene.getScene('Play').sim;
      g.scene.getScene('Play').constructor.forceSeed = 11;
      g.scene.getScene('Play').scene.restart();
      // wait for the new round (its own simulation), not the one the menu's Enter started
      for (let i = 0; i < 300 && !(g.scene.isActive('Play') && g.scene.getScene('Play').sim && g.scene.getScene('Play').sim !== old); i++) await wait(100);
      const p = g.scene.getScene('Play');
      // no start banners (and no "target" banner waiting to pop up) over the scene
      p.time.removeAllEvents();
      p.children.list.filter((o) => o.depth === 9350).forEach((o) => o.destroy());
      p.testAuto(true);
      p.testStep(18);
      p.testUntil('deliver', 160);
      p.testTraffic(5);
      p.testSpeed = 0.04;
      p.testSettle();
      // a three-quarter view down the street: the van in its bay, the house with the resident at
      // the door, the street with its traffic
      const o = p.sim.orders.filter((q) => q.state === 'done').pop();
      if (o) {
        const b = o.house, d = p.view.houseDoors.get(b) ?? { x: b.x, y: b.y, z: b.z };
        const n = Math.hypot(d.x - b.x, d.z - b.z) || 1, dx = (d.x - b.x) / n, dz = (d.z - b.z) / n;
        const ax = dz, az = -dx;
        p.testCam([b.x - dx * 7 + ax * 10, b.y + 10, b.z - dz * 7 + az * 10], [b.x + (d.x - b.x) * 0.3 - ax * 0.5, b.y + 0.8, b.z + (d.z - b.z) * 0.3 - az * 0.5]);
      }
      await wait(1200);
    }`,
  },
  'space-blaster': { pick: 2 },
  'whack-a-mole': { pick: 3 },
};
// Steps of the scripted play (see the capture loop) after which a card candidate is taken.
const CAPTURES = [7, 11, 15, 19, 23];
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Colour statistics of a captured frame: how lively it is (score) and its accent hue. */
async function frameStats(lab, b64, type = 'png') {
  return lab.evaluate(async ({ src, type }) => {
    const img = new Image();
    img.src = `data:image/${type};base64,${src}`;
    await img.decode();
    const w = 96, h = Math.round((96 * img.height) / img.width);
    const ctx = new OffscreenCanvas(w, h).getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const n = w * h, lum = new Float32Array(n), hues = new Float32Array(12);
    let rg = 0, yb = 0, rg2 = 0, yb2 = 0, l1 = 0, l2 = 0, dark = 0;
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const a = r - g, c = (r + g) / 2 - b, l = 0.299 * r + 0.587 * g + 0.114 * b;
      rg += a; yb += c; rg2 += a * a; yb2 += c * c; l1 += l; l2 += l * l; lum[i] = l;
      if (l < 28) dark++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
      if (s > 0.45 && mx > 110) {
        let hu = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn);
        hu = ((hu * 60) + 360) % 360;
        hues[Math.floor(hu / 30) % 12] += s * mx;
      }
    }
    const sd = (s1, s2) => Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2));
    // Hasler–Süsstrunk colourfulness, plus edge density for busy frames, minus near-black area.
    const colourful = Math.hypot(sd(rg, rg2), sd(yb, yb2)) + 0.3 * Math.hypot(rg / n, yb / n);
    let edge = 0;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      edge += Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]);
    }
    edge /= (w - 1) * (h - 1);
    const darkShare = dark / n;
    const score = colourful + 0.8 * edge + 0.25 * sd(l1, l2) - 160 * Math.max(0, darkShare - 0.5);
    const top = hues.indexOf(Math.max(...hues));
    const accent = hues[top] > n * 6 ? `hsl(${top * 30 + 15} 92% 64%)` : '#ffd23f';
    return { score, accent, colourful, edge, darkShare };
  }, { src: b64, type });
}

// The plain title logo (games without a menu theme), on the card and as logo-en/tr.png: the modern
// style's Fredoka with a gradient fill in the frame's accent over a dark stroke, or Press Start 2P
// (with the İ face in front) in the accent for retro games.
const plainLogoCss = (accent) => `
  .logo span { display: block; }
  .logo .front { position: absolute; inset: 0; }
  .modern-logo { font-family: MT, MB; font-weight: 700; line-height: .98; letter-spacing: .5px; }
  .modern-logo .back { color: #1a1310; -webkit-text-stroke: 8px #1a1310;
    text-shadow: 0 3px 0 #1a1310, 0 5px 12px rgba(0,0,0,.7); }
  .modern-logo .front { background: linear-gradient(#fff 0%, color-mix(in srgb, ${accent} 55%, #fff) 30%, ${accent} 75%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .retro-logo { font-family: PTR, P2P; line-height: 1.3; letter-spacing: 1px; }
  .retro-logo .back { color: #000; -webkit-text-stroke: 6px #000; text-shadow: 3px 3px 0 #000, 0 4px 10px rgba(0,0,0,.6); }
  .retro-logo .front { color: ${accent}; }`;

/** The card in `lang`: the frame (base64 PNG), the logo in `accent`, or the themed logo image. */
function cardHtml(m, b64, accent, logo, lang = 'en') {
  const land = m.orientation === 'landscape';
  const modern = isModern(m);
  const shot = `data:image/png;base64,${b64}`;
  const text = esc(title(m, lang));
  // Logo width limit: 45% of the card, or the free band left of a portrait frame.
  const maxW = land ? 270 : 192;
  return `<!doctype html><html><head><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { width: 640px; height: 360px; overflow: hidden; background: #141212; position: relative; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .blur { filter: blur(10px) brightness(.55) saturate(1.3); transform: scale(1.12); }
  .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,.45)); }
  .glow { position: absolute; inset: 0; mix-blend-mode: screen; opacity: .32;
    background: radial-gradient(circle at 12% 88%, ${accent}, transparent 42%), radial-gradient(circle at 90% 18%, ${accent}, transparent 40%); }
  .frame { position: absolute; left: 50%; top: 50%; height: 94%; aspect-ratio: 9 / 16; transform: translate(-50%, -50%);
    overflow: hidden; background: #000; box-shadow: 0 10px 28px rgba(0,0,0,.65), 0 2px 6px rgba(0,0,0,.5); }
  .frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .frame.modern { border-radius: 14px; }
  .frame.retro { border: 2px solid #f3efe9; outline: 2px solid #000; }
  .scrim { position: absolute; left: 0; bottom: 0; width: 64%; height: 50%;
    background: radial-gradient(farthest-side at 0 100%, rgba(0,0,0,.62), rgba(0,0,0,.32) 55%, transparent); }
  .logo { position: absolute; left: 18px; bottom: 14px; display: inline-block; max-width: ${maxW}px; text-wrap: balance; }
  ${plainLogoCss(accent)}
  .logo-img { position: absolute; left: 12px; bottom: 8px; max-width: ${maxW + 12}px; max-height: ${land ? 150 : 138}px;
    filter: drop-shadow(0 3px 6px rgba(0,0,0,.6)); }
  </style></head><body>
  ${land ? `<img class="bg" src="${shot}">` : `<img class="bg blur" src="${shot}"><div class="vig"></div><div class="glow"></div>
  <div class="frame ${modern ? 'modern' : 'retro'}"><img src="${shot}"></div>`}
  <div class="scrim"></div>
  ${logo ? `<img class="logo-img" src="data:image/png;base64,${logo}">` : `<div class="logo ${modern ? 'modern-logo' : 'retro-logo'}" style="font-size:${modern ? 30 : 20}px"><span class="back">${text}</span><span class="front">${text}</span></div>`}
  <script>
  // Shrink the logo until it fits its width on at most two lines (a themed logo image is fitted by CSS).
  window.fitLogo = () => {
    const img = document.querySelector('.logo-img');
    if (img) return { size: Math.round(img.getBoundingClientRect().height), lines: 1, w: Math.round(img.getBoundingClientRect().width), fits: true };
    const el = document.querySelector('.logo');
    let size = parseFloat(el.style.fontSize);
    const lh = parseFloat(getComputedStyle(el).lineHeight) / size;
    const fits = () => el.scrollWidth <= ${maxW} + 1 && el.offsetHeight <= 2 * size * lh + 2;
    while (!fits() && size > 12) el.style.fontSize = (size -= 0.5) + 'px';
    return { size, lines: Math.round(el.offsetHeight / (size * lh)), w: el.offsetWidth, fits: fits() };
  };
  </script></body></html>`;
}

/** Draws the card at device scale `scale`: the screenshot (base64 PNG) and the logo's fit. */
async function shootCard(browser, html, scale, text) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: scale });
  await page.setContent(html);
  // the faces for the title's letters: the latin-ext subsets (İ, Ş, Ğ ...) only load on demand,
  // and fonts.ready can settle before the page asks for them
  await page.evaluate((text) => Promise.all(['700 30px MT', '20px P2P', '20px PTR'].map((f) => document.fonts.load(f, text))), text);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const fit = await page.evaluate(() => window.fitLogo());
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.close();
  return { png, fit };
}

/**
 * Renders the card at device scale `scale` and encodes it as WebP no larger than `maxBytes`.
 * `keep` ({ src: base64 WebP of the same card at this scale, rect: [x, y, w, h] in CSS px }) puts
 * that area of an existing card back over the new one (--tr-from-en: the English card's frame).
 */
async function renderCard(browser, lab, html, scale, maxBytes, text, keep = null) {
  const { png, fit } = await shootCard(browser, html, scale, text);
  const webp = await lab.evaluate(async ({ src, maxBytes, keep, scale }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    if (keep) {
      const old = new Image();
      old.src = `data:image/webp;base64,${keep.src}`;
      await old.decode();
      const [x, y, w, h] = keep.rect.map((v) => v * scale);
      c.getContext('2d').drawImage(old, x, y, w, h, x, y, w, h);
    }
    let url;
    for (const q of [0.92, 0.88, 0.84, 0.8, 0.75, 0.7, 0.65, 0.6]) {
      url = c.toDataURL('image/webp', q);
      if ((url.length - 23) * 0.75 <= maxBytes) break;
    }
    return url;
  }, { src: png, maxBytes, keep, scale });
  if (!webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot encode WebP');
  return { buf: Buffer.from(webp.split(',')[1], 'base64'), fit };
}

// ---- Turkish cards from the English ones (--tr-from-en, portrait games). The frame of a portrait
// card stands in the middle, clear of the logo: it is cut out of the English 1280×720 card back to
// the capture's size (its border trimmed, the edges stretched over the margin the frame's crop hid),
// the Turkish card is drawn from it in the English card's logo colour, and the English card's frame
// area (KEEP_FRAME) is put back over it at each size, so both cards show the very same frame.
const KEEP_FRAME = [222, 8, 196, 344];
// The logo colours frameStats can give (its accent hues and the default gold).
const ACCENTS = ['#ffd23f', ...Array.from({ length: 12 }, (_, i) => `hsl(${i * 30 + 15} 92% 64%)`)];

/** The captured 720×1280 frame of a portrait card (base64 WebP at 1280×720), as base64 PNG. */
async function recoverFrame(lab, card, modern) {
  return lab.evaluate(async ({ src, modern }) => {
    const img = new Image();
    img.src = `data:image/webp;base64,${src}`;
    await img.decode();
    const S = img.width / 640, W = 720, H = 1280;
    // cardHtml's .frame: 94 % of the height, 9:16, centred; retro frames have a 2 px border inside
    const fh = 0.94 * 360, fw = (fh * 9) / 16, b = modern ? 0 : 2;
    const vb = { x: 320 - fw / 2 + b, y: 180 - fh / 2 + b, w: fw - 2 * b, h: fh - 2 * b };
    const k = Math.max(vb.w / W, vb.h / H);
    const ib = { x: vb.x + (vb.w - W * k) / 2, y: vb.y + (vb.h - H * k) / 2 };
    // the visible box, one device pixel in from its edges, mapped back to frame pixels
    const e = 1 / S, x0 = vb.x + e, y0 = vb.y + e, x1 = vb.x + vb.w - e, y1 = vb.y + vb.h - e;
    const [ix0, iy0, ix1, iy1] = [(x0 - ib.x) / k, (y0 - ib.y) / k, (x1 - ib.x) / k, (y1 - ib.y) / k];
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S, ix0, iy0, ix1 - ix0, iy1 - iy0);
    // the margins the frame's crop and border hid: the edge columns and rows stretched over them
    const L = Math.ceil(ix0), T = Math.ceil(iy0), R = Math.floor(ix1), B = Math.floor(iy1);
    if (L > 0) g.drawImage(c, L, 0, 1, H, 0, 0, L, H);
    if (R < W) g.drawImage(c, R - 1, 0, 1, H, R, 0, W - R, H);
    if (T > 0) g.drawImage(c, 0, T, W, 1, 0, 0, W, T);
    if (B < H) g.drawImage(c, 0, B - 1, W, 1, 0, B, W, H - B);
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { src: card, modern });
}

/**
 * The English card's logo colour: the card is redrawn from its recovered frame in every colour
 * frameStats can give and compared with the English card left of the frame (logo, scrim, glow).
 * Returns the closest colour, its mean difference per channel and the runner-up's.
 */
async function matchAccent(browser, lab, m, frame, logo, card) {
  const tries = [];
  for (const accent of ACCENTS) {
    const { png } = await shootCard(browser, cardHtml(m, frame, accent, logo, 'en'), 2, title(m, 'en'));
    const diff = await lab.evaluate(async ({ a, b }) => {
      const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
      const [x, y] = await Promise.all([load(`data:image/png;base64,${a}`), load(`data:image/webp;base64,${b}`)]);
      const px = (i) => { const c = new OffscreenCanvas(444, 420).getContext('2d'); c.drawImage(i, 0, 300, 444, 420, 0, 0, 444, 420); return c.getImageData(0, 0, 444, 420).data; };
      const [p, q] = [px(x), px(y)];
      let d = 0;
      for (let i = 0; i < p.length; i += 4) d += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
      return d / (p.length * 0.75);
    }, { a: png, b: card });
    tries.push({ accent, diff });
  }
  tries.sort((a, b) => a.diff - b.diff);
  return { accent: tries[0].accent, diff: tries[0].diff, next: tries[1].diff };
}

// ---- Game logos: logo-en.png / logo-tr.png (manifest assets.logo), the game's title art on a
// transparent background, which ayvago.com draws over a screenshot on the game page. A themed
// game's logo is its menu logo (window.__ayvago.menuLogo, rendered by the game in that language);
// any other game's is the card's plain title logo in that language. Trimmed to the art with a
// small margin, fitted into LOGO_MAX (drawn at twice the size or more, then scaled down) and
// written as a PNG compressed here (zlib level 9, the best filter per row).
const LOGO_MAX = [640, 320];
const LOGO_MARGIN = 6;
const title = (m, lang) => (lang === 'tr' ? m.title.tr.toLocaleUpperCase('tr-TR') : m.title.en.toLocaleUpperCase('en-US'));

function logoHtml(m, lang, accent) {
  const modern = isModern(m);
  const text = esc(title(m, lang));
  // the card's logo at about 1.8 times its size, at most two lines of a 300 px column
  const maxW = 300;
  return `<!doctype html><html><head><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; }
  .logo { position: absolute; left: 30px; top: 30px; display: inline-block; max-width: ${maxW}px; text-wrap: balance; }
  ${plainLogoCss(accent)}
  </style></head><body>
  <div class="logo ${modern ? 'modern-logo' : 'retro-logo'}" style="font-size:${modern ? 54 : 36}px"><span class="back">${text}</span><span class="front">${text}</span></div>
  <script>
  window.fitLogo = () => {
    const el = document.querySelector('.logo');
    let size = parseFloat(el.style.fontSize);
    const lh = parseFloat(getComputedStyle(el).lineHeight) / size;
    const fits = () => el.scrollWidth <= ${maxW} + 1 && el.offsetHeight <= 2 * size * lh + 2;
    while (!fits() && size > 12) el.style.fontSize = (size -= 0.5) + 'px';
  };
  </script></body></html>`;
}

/** The plain logo in `lang`, rendered at device scale 2 on a transparent page (PNG, base64). */
async function renderPlainLogo(browser, m, lang, accent) {
  const page = await browser.newPage({ viewport: { width: 380, height: 220 }, deviceScaleFactor: 2 });
  try {
    await page.setContent(logoHtml(m, lang, accent));
    // load the faces for this title's letters first: the latin-ext subsets (Ğ, İ ...) only load on
    // demand, and fonts.ready can settle before the page asks for them
    await page.evaluate((text) => Promise.all(['700 54px MT', '800 54px MB', '36px P2P', '36px PTR'].map((f) => document.fonts.load(f, text))), title(m, lang));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.fitLogo());
    return (await page.screenshot({ type: 'png', omitBackground: true })).toString('base64');
  } finally {
    await page.close();
  }
}

/** A themed game's menu logo in `lang`, rendered by the game itself (null without a menu theme). */
async function themedLogo(browser, slug, land, lang) {
  const page = await browser.newPage({ viewport: land ? { width: 1280, height: 720 } : { width: 720, height: 1280 } });
  try {
    await page.goto(`http://localhost:${PORT}/games/${slug}/?nointro&lang=${lang}`);
    await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: dev ? 60000 : 20000 });
    return await page.evaluate(async (lang) => {
      const a = window.__ayvago;
      if (!a.menuLogo) return null;
      // the display face's subset for this title's letters (latin-ext: ç ğ ı İ ö ş ü) loads on demand
      await document.fonts.load(`64px "${a.def.menuTheme.font}"`, a.def.meta.title[lang]);
      return a.menuLogo(lang).split(',')[1];
    }, lang);
  } finally {
    await page.close();
  }
}

/** Whether a game has a menu theme (its definition sets `menuTheme`); the game itself has the last word. */
const hasTheme = (slug) => {
  const dir = join(root, 'games', slug);
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.ts') && /\bmenuTheme\b/.test(readFileSync(join(dir, f), 'utf8')));
};

/** Both menu logos of a themed game, or null when it has no menu theme. */
async function themedLogos(browser, slug, land) {
  const en = await themedLogo(browser, slug, land, 'en');
  return en && { en, tr: await themedLogo(browser, slug, land, 'tr') };
}

/** Trims a logo to its art plus LOGO_MARGIN and scales it into LOGO_MAX; RGBA pixels back. */
async function fitLogoImage(lab, b64) {
  const r = await lab.evaluate(async ({ src, max, margin }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      if (d[(y * img.width + x) * 4 + 3] <= 6) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) throw new Error('empty logo');
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const k = Math.min(1, (max[0] - 2 * margin) / w, (max[1] - 2 * margin) / h);
    const W = Math.round(w * k) + 2 * margin, H = Math.round(h * k) + 2 * margin;
    const out = new OffscreenCanvas(W, H), o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.drawImage(c, x0, y0, w, h, margin, margin, W - 2 * margin, H - 2 * margin);
    const px = o.getImageData(0, 0, W, H).data;
    let bin = '';
    for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
    return { W, H, rgba: btoa(bin) };
  }, { src: b64, max: LOGO_MAX, margin: LOGO_MARGIN });
  return { w: r.W, h: r.H, rgba: Buffer.from(r.rgba, 'base64') };
}

/**
 * Filtered, deflated scanlines (`bpp` bytes a pixel): every row with no filter, or the
 * smallest-sum filter per row, whichever deflates smaller.
 */
function pngData(w, h, px, bpp) {
  const stride = w * bpp, plain = Buffer.alloc((stride + 1) * h), adaptive = Buffer.alloc((stride + 1) * h);
  const row = Buffer.alloc(stride), zero = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const cur = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : zero;
    cur.copy(plain, y * (stride + 1) + 1);
    let best = -1, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let p;
        if (f === 0) p = cur[i];
        else if (f === 1) p = cur[i] - a;
        else if (f === 2) p = cur[i] - b;
        else if (f === 3) p = cur[i] - ((a + b) >> 1);
        else {
          const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
          p = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        p &= 0xff;
        row[i] = p;
        sum += p < 128 ? p : 256 - p;
      }
      if (sum < bestSum) { bestSum = sum; best = f; row.copy(adaptive, y * (stride + 1) + 1); }
    }
    adaptive[y * (stride + 1)] = best;
  }
  const z = (raw) => deflateSync(raw, { level: 9, memLevel: 9 });
  const [x, y] = [z(plain), z(adaptive)];
  return x.length < y.length ? x : y;
}

function pngFile(w, h, colourType, chunks) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colourType;   // 8 bits: 6 RGBA, 3 indexed
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), ...chunks.map(([t, d]) => chunk(t, d)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Up to 256 RGBA colours for the pixels (median cut on a 5-bit histogram, refined by a few
 * k-means rounds, colours compared premultiplied so faint shadow pixels weigh little).
 */
function palette(rgba) {
  const hist = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const key = ((rgba[i] >> 3) << 15) | ((rgba[i + 1] >> 3) << 10) | ((rgba[i + 2] >> 3) << 5) | (rgba[i + 3] >> 3);
    let e = hist.get(key);
    if (!e) hist.set(key, (e = [0, 0, 0, 0, 0]));
    e[0] += rgba[i]; e[1] += rgba[i + 1]; e[2] += rgba[i + 2]; e[3] += rgba[i + 3]; e[4]++;
  }
  // one entry a histogram cell: its mean colour (premultiplied rgb + alpha) and its pixel count
  const cells = [...hist.values()].map(([r, g, b, a, n]) => {
    const al = a / n / 255;
    return [(r / n) * al, (g / n) * al, (b / n) * al, a / n, n];
  });
  const boxes = [cells];
  const spread = (box) => {
    let best = [0, 0];
    for (let c = 0; c < 4; c++) {
      let lo = Infinity, hi = -Infinity;
      for (const e of box) { if (e[c] < lo) lo = e[c]; if (e[c] > hi) hi = e[c]; }
      const n = box.reduce((s, e) => s + e[4], 0);
      const v = (hi - lo) * Math.sqrt(n);
      if (v > best[0]) best = [v, c];
    }
    return best;
  };
  while (boxes.length < 255) {
    let pick = -1, ch = 0, top = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const [v, c] = spread(box);
      if (v > top) { top = v; pick = i; ch = c; }
    });
    if (pick < 0) break;
    const box = boxes[pick].sort((x, y) => x[ch] - y[ch]);
    const half = box.reduce((s, e) => s + e[4], 0) / 2;
    let acc = 0, cut = 1;
    for (; cut < box.length - 1; cut++) { acc += box[cut - 1][4]; if (acc >= half) break; }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  let pal = boxes.map((box) => {
    const t = [0, 0, 0, 0, 0];
    for (const e of box) for (let c = 0; c < 4; c++) t[c] += e[c] * e[4];
    const n = box.reduce((s, e) => s + e[4], 0);
    return [t[0] / n, t[1] / n, t[2] / n, t[3] / n];
  });
  const nearest = (e) => {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const p = pal[j], d = (e[0] - p[0]) ** 2 + (e[1] - p[1]) ** 2 + (e[2] - p[2]) ** 2 + (e[3] - p[3]) ** 2;
      if (d < bd) { bd = d; bi = j; }
    }
    return bi;
  };
  for (let round = 0; round < 4; round++) {
    const sums = pal.map(() => [0, 0, 0, 0, 0]);
    for (const e of cells) { const s = sums[nearest(e)]; for (let c = 0; c < 4; c++) s[c] += e[c] * e[4]; s[4] += e[4]; }
    pal = pal.map((p, j) => (sums[j][4] ? sums[j].slice(0, 4).map((v) => v / sums[j][4]) : p));
  }
  return pal;
}

/**
 * The pixels as an 8-bit RGBA PNG, or as an indexed PNG (palette() with a light Floyd–Steinberg
 * dither, index 0 fully transparent) when that saves more than a third: big themed logos with
 * their gradients, glows and emblems come out at about a third of the RGBA size.
 */
function encodePng(w, h, rgba) {
  // fully transparent pixels carry no colour (they compress to runs of zeros)
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] === 0) rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
  const full = pngFile(w, h, 6, [['IDAT', pngData(w, h, rgba, 4)]]);
  const pal = palette(rgba);   // premultiplied
  const cache = new Map();
  const nearest = (r, g, b, a) => {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const p = pal[j], d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2 + (a - p[3]) ** 2;
      if (d < bd) { bd = d; bi = j; }
    }
    return bi;
  };
  // error diffusion in premultiplied space, at 3/4 strength so flat areas stay clean
  const idx = Buffer.alloc(w * h), err = new Float32Array((w + 2) * 2 * 4);
  for (let y = 0; y < h; y++) {
    const cur = (y & 1) * (w + 2) * 4, nxt = ((y + 1) & 1) * (w + 2) * 4;
    err.fill(0, nxt, nxt + (w + 2) * 4);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] === 0) continue;   // index 0
      const al = rgba[i + 3] / 255, e = cur + (x + 1) * 4;
      const v = [rgba[i] * al + err[e], rgba[i + 1] * al + err[e + 1], rgba[i + 2] * al + err[e + 2], rgba[i + 3] + err[e + 3]];
      const key = v.map((q) => Math.round(Math.max(0, Math.min(255, q)) / 2)).join();
      let j = cache.get(key);
      if (j === undefined) cache.set(key, (j = nearest(v[0], v[1], v[2], v[3])));
      idx[y * w + x] = j + 1;
      for (let c = 0; c < 4; c++) {
        const d = (v[c] - pal[j][c]) * 0.75;
        err[e + 4 + c] += (d * 7) / 16;
        err[nxt + x * 4 + c] += (d * 3) / 16;
        err[nxt + (x + 1) * 4 + c] += (d * 5) / 16;
        err[nxt + (x + 2) * 4 + c] += d / 16;
      }
    }
  }
  const plte = Buffer.alloc((pal.length + 1) * 3), trns = Buffer.alloc(pal.length + 1);
  pal.forEach((p, j) => {
    const a = Math.max(1, Math.round(p[3])), k = 255 / a;
    for (let c = 0; c < 3; c++) plte[(j + 1) * 3 + c] = Math.max(0, Math.min(255, Math.round(p[c] * k)));
    trns[j + 1] = a;
  });
  const indexed = pngFile(w, h, 3, [['PLTE', plte], ['tRNS', trns], ['IDAT', pngData(w, h, idx, 1)]]);
  return indexed.length < full.length * 0.67 ? indexed : full;
}

/**
 * Writes logo-en.png and logo-tr.png. `themed` holds a themed game's menu logos ({ en, tr }, base64
 * PNG); without them the plain logo is drawn in the card's accent.
 */
async function writeLogos(browser, lab, m, out, themed, accent) {
  const sizes = [];
  for (const lang of ['en', 'tr']) {
    const src = themed?.[lang] ?? (await renderPlainLogo(browser, m, lang, accent));
    const { w, h, rgba } = await fitLogoImage(lab, src);
    const png = encodePng(w, h, rgba);
    writeFileSync(join(out, `logo-${lang}.png`), png);
    sizes.push(`${w}x${h} ${Math.round(png.length / 1024)} KB`);
  }
  return `logo ${themed ? 'themed' : 'plain'} ${sizes.join(' / ')}`;
}

// Opens a game, captures its menu and a scripted few seconds of play. The cover, icon, screenshot
// and thumbnail use the frame after step 15 (`play`); the card candidates are the frames after
// each CAPTURES step (`shots`, `live` = the round was still running).
async function capture(browser, slug, land, tune) {
  const page = await browser.newPage({ viewport: land ? { width: 1280, height: 720 } : { width: 720, height: 1280 } });
  try {
    await page.goto(`http://localhost:${PORT}/games/${slug}/?nointro&lang=en`);
    await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: dev ? 60000 : 20000 });
    // a themed menu's logo (English), and time for its entrance to finish before the menu shot
    const logo = await page.evaluate(() => window.__ayvago.menuLogo?.('en')?.split(',')[1] ?? null);
    await page.waitForTimeout(logo ? 3000 : 900);
    const canvas = page.locator('canvas').first();
    const menu = (await canvas.screenshot()).toString('base64');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__ayvago.game.scene.isActive('Play'), null, { timeout: 15000 });
    if (tune.wait) await page.waitForTimeout(tune.wait);
    if (tune.stage) await page.evaluate(`(${tune.stage})()`);
    const box = await canvas.boundingBox();
    let play, thumb;
    const shots = [];
    for (let i = 0; i < 24; i++) {
      const k = ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp'][i % 4];
      if (tune.stage) await page.waitForTimeout(140);
      else {
        await page.keyboard.down(k);
        await page.mouse.click(box.x + box.width * (0.2 + 0.6 * Math.random()), box.y + box.height * (0.35 + 0.5 * Math.random()));
        await page.waitForTimeout(140);
        await page.keyboard.up(k);
      }
      if (!CAPTURES.includes(i)) continue;
      // Hide the pause overlay if a random tap opened it. A frame is live when the round runs
      // both before and after it is taken (not over, no result screen).
      const running = () => page.evaluate(() => {
        const g = window.__ayvago.game;
        if (g.scene.isActive('Pause')) { g.scene.stop('Pause'); g.scene.resume('Play'); }
        return g.scene.isActive('Play') && !g.scene.isActive('GameOver') && !g.scene.getScene('Play').isOver;
      });
      const before = await running();
      await page.waitForTimeout(i === 15 ? 500 : 250);
      const b64 = (await canvas.screenshot()).toString('base64');
      shots.push({ b64, live: before && (await running()) });
      if (i === 15) {
        play = b64;
        if (!cardOnly) thumb = await canvas.screenshot({ scale: 'css' });
      }
    }
    return { menu, play, thumb, shots, logo };
  } finally {
    await page.close();   // stop the game so it does not slow the rendering that follows
  }
}

// CARD_FRAMES=<dir> keeps every card candidate there; --from-frames re-composes the cards from
// the kept frames without opening the games (for tuning the layout and the CARD table).
const framesDir = process.env.CARD_FRAMES;
const fromFrames = args.includes('--from-frames');
if (fromFrames && !framesDir) throw new Error('--from-frames needs CARD_FRAMES=<dir>');
const PORT = 5600 + Math.floor(Math.random() * 300);
const server = fromFrames ? null : spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${PORT}`) } });
if (server) await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const lab = await browser.newPage();   // frame statistics and WebP encoding
let made = 0;
for (const slug of slugs) {
  const m = JSON.parse(readFileSync(join(root, 'public', 'games', slug, 'ayvago.json'), 'utf8'));
  const land = m.orientation === 'landscape';
  const tune = CARD[slug] ?? {};
  const out = join(root, 'public', 'games', slug, 'ayvago');
  mkdirSync(out, { recursive: true });
  try {
    if (logoOnly) {
      const themed = hasTheme(slug) ? await themedLogos(browser, slug, land) : null;
      const card = join(out, 'card-640x360.webp');
      const accent = themed ? null : tune.accent ?? (await frameStats(lab, readFileSync(card).toString('base64'), 'webp')).accent;
      console.log(`ok    ${slug}  ${await writeLogos(browser, lab, m, out, themed, accent)}`);
      made++;
      continue;
    }
    if (trFromEn) {
      if (land) throw new Error('a landscape card\'s logo covers part of its frame: use --card-only');
      const themed = hasTheme(slug) ? await themedLogos(browser, slug, land) : null;
      const [en1, en2] = ['card-640x360.webp', 'card-1280x720.webp'].map((f) => readFileSync(join(out, f)).toString('base64'));
      const frame = await recoverFrame(lab, en2, isModern(m));
      const match = tune.accent ? { accent: tune.accent } : await matchAccent(browser, lab, m, frame, themed?.en ?? null, en2);
      const html = cardHtml(m, frame, match.accent, themed?.tr ?? null, 'tr');
      const big = await renderCard(browser, lab, html, 2, 110_000, title(m, 'tr'), { src: en2, rect: KEEP_FRAME });
      const small = await renderCard(browser, lab, html, 1, 45_000, title(m, 'tr'), { src: en1, rect: KEEP_FRAME });
      if (!big.fit.fits || !small.fit.fits) throw new Error(`the Turkish logo does not fit (${big.fit.size}px x${big.fit.lines})`);
      writeFileSync(join(out, 'card-tr-1280x720.webp'), big.buf);
      writeFileSync(join(out, 'card-tr-640x360.webp'), small.buf);
      const how = match.diff === undefined ? 'tuned' : `matched ${match.diff.toFixed(1)} (next ${match.next.toFixed(1)})`;
      console.log(`ok    ${slug}  card tr ${Math.round(small.buf.length / 1024)}+${Math.round(big.buf.length / 1024)} KB, accent ${match.accent} ${how}, logo ${themed ? `themed ${big.fit.w}x${big.fit.size}px` : `${big.fit.size}px x${big.fit.lines}`}`);
      made++;
      continue;
    }
    let shots, logo = null, logoTr = null;
    if (fromFrames) {
      const live = JSON.parse(readFileSync(join(framesDir, `${slug}.json`), 'utf8'));
      shots = live.map((l, n) => ({ live: l, b64: readFileSync(join(framesDir, `${slug}-${n}.png`)).toString('base64') }));
      const kept = join(framesDir, `${slug}-logo.png`);
      if (existsSync(kept)) logo = readFileSync(kept).toString('base64');
      const keptTr = join(framesDir, `${slug}-logo-tr.png`);
      if (logo && !existsSync(keptTr)) throw new Error(`${keptTr} missing (the Turkish menu logo)`);
      if (logo) logoTr = readFileSync(keptTr).toString('base64');
    } else {
      const cap = await capture(browser, slug, land, tune);
      shots = cap.shots;
      logo = cap.logo;
      // the Turkish menu logo, rendered by the game in Turkish
      if (logo) logoTr = await themedLogo(browser, slug, land, 'tr');
      if (framesDir) {
        mkdirSync(framesDir, { recursive: true });
        shots.forEach((s, n) => writeFileSync(join(framesDir, `${slug}-${n}.png`), Buffer.from(s.b64, 'base64')));
        writeFileSync(join(framesDir, `${slug}.json`), JSON.stringify(shots.map((s) => s.live)));
        if (logo) writeFileSync(join(framesDir, `${slug}-logo.png`), Buffer.from(logo, 'base64'));
        if (logoTr) writeFileSync(join(framesDir, `${slug}-logo-tr.png`), Buffer.from(logoTr, 'base64'));
      }
      if (!cardOnly) {
        mkdirSync(join(root, 'public', 'thumbs'), { recursive: true });
        writeFileSync(join(root, 'public', 'thumbs', `${slug}.png`), cap.thumb);
        // Light in-game screenshot for the platform's Arcade theme tiles (manifest assets.screenshot).
        await renderScreenshot(browser, cap.play, land, join(out, 'screenshot.jpg'));
        const art = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await art.setContent(coverHtml(m, cap.menu, cap.play, heroImage(slug), logo));
        await art.evaluate(() => document.fonts.ready);
        await art.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
        await art.screenshot({ path: join(out, 'cover-1920x1080.jpg'), type: 'jpeg', quality: 86 });
        await art.setViewportSize({ width: 512, height: 512 });
        await art.setContent(iconHtml(m, cap.play));
        await art.evaluate(() => document.fonts.ready);
        await art.screenshot({ path: join(out, 'icon-512.png') });
        await art.close();
      }
    }

    // Catalog card: frames during live play first, then the liveliest of them, with a small lean
    // towards later frames (past the round-start banners).
    for (const [n, s] of shots.entries()) Object.assign(s, await frameStats(lab, s.b64), { n });
    for (const s of shots) s.rank = s.score + 3 * s.n;
    const ranked = [...shots].sort((a, b) => (b.live - a.live) || (b.rank - a.rank));
    const best = tune.pick !== undefined ? shots[tune.pick] : ranked[0];
    // the same frame in both languages, only the logo differs (card-*, card-tr-*)
    const sizes = [];
    let big;
    for (const lang of ['en', 'tr']) {
      const html = cardHtml(m, best.b64, tune.accent ?? best.accent, lang === 'en' ? logo : logoTr, lang);
      const b = await renderCard(browser, lab, html, 2, 110_000, title(m, lang));
      const small = await renderCard(browser, lab, html, 1, 45_000, title(m, lang));
      if (!b.fit.fits || !small.fit.fits) throw new Error(`the ${lang} logo does not fit (${b.fit.size}px x${b.fit.lines})`);
      const name = lang === 'en' ? 'card' : 'card-tr';
      writeFileSync(join(out, `${name}-1280x720.webp`), b.buf);
      writeFileSync(join(out, `${name}-640x360.webp`), small.buf);
      sizes.push(`${lang} ${Math.round(small.buf.length / 1024)}+${Math.round(b.buf.length / 1024)} KB`);
      big ??= b;
    }
    const stats = shots.map((s) => `${s.n}${s === best ? '*' : ''}:${s.live ? '' : 'x'}${Math.round(s.rank)}`).join(' ');
    // the logo files with the full set (the card's colour, the menu logo in both languages)
    const logos = cardOnly || fromFrames ? '' : `, ${await writeLogos(browser, lab, m, out, logo && { en: logo, tr: logoTr }, tune.accent ?? best.accent)}`;
    console.log(`ok    ${slug}  card [${stats}] ${sizes.join(', ')}, logo ${logo ? `themed ${big.fit.w}x${big.fit.size}px` : `${big.fit.size}px x${big.fit.lines}`}${logos}`);
    made++;
  } catch (e) {
    console.log(`FAIL  ${slug}: ${String(e.message).split('\n')[0]}`);
  }
}
await browser.close();
if (server) try { process.kill(-server.pid); } catch { server.kill(); }
console.log(`\nstore assets: ${made}/${slugs.length}`);
process.exit(made === slugs.length ? 0 : 1);
