// Store art for the Ayvago platform catalog, made from the games themselves:
//   public/games/<slug>/ayvago/cover-1920x1080.jpg   catalog / game page cover
//   public/games/<slug>/ayvago/icon-512.png          square icon
//   public/games/<slug>/ayvago/screenshot.jpg        in-game frame (platform Arcade theme tiles)
//   public/games/<slug>/ayvago/card-640x360.webp     catalog card (Minimal / Modern theme tiles)
//   public/games/<slug>/ayvago/card-1280x720.webp    the same card for high-density screens
//   public/thumbs/<slug>.png                         thumbnail for this repo's own portal
// Each game is opened (no intro), its menu and a few seconds of play are captured, then the
// captures are composed on a branded HTML template and rendered by Chromium. The card uses the
// busiest, most colourful of several frames from the run (frameStats) with only a small title logo.
// Usage: npm run build && node scripts/gen-store-assets.mjs [--dev] [--card-only] [slug ...]
//   --card-only   regenerate just the cards (covers, icons, screenshots and thumbnails stay)
//   CARD_FRAMES=<dir> keeps the card candidate frames; with --card-only --from-frames the cards are
//   re-composed from them without opening the games
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const cardOnly = args.includes('--card-only');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = (only.length ? only : readdirSync(join(root, 'public', 'games')))
  .filter((s) => existsSync(join(root, 'public', 'games', s, 'ayvago.json')));

// Cover title size: smaller for long titles, and small enough that the longest word fits the text column.
function titleSize(title) {
  const size = title.length > 14 ? 74 : 92;
  const longest = Math.max(...title.split(/[\s-]+/).map((w) => w.length));
  return longest * size > 840 ? Math.floor(760 / longest) : size;
}

const font = (pkg, file) => readFileSync(join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const FONTS = `
@font-face { font-family: P2P; src: url(data:font/woff2;base64,${font('press-start-2p', 'press-start-2p-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: P2P; src: url(data:font/woff2;base64,${font('press-start-2p', 'press-start-2p-latin-ext-400-normal.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }
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

function coverHtml(m, menu, play, hero) {
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
  p { font-size: 40px; font-weight: 700; line-height: 1.3; color: #d8d4d2; max-width: 820px; }
  .chip { align-self: flex-start; font-family: P2P; font-size: 20px; background: #ec3013; color: #fff; padding: 14px 20px; box-shadow: 0 6px 0 #000; }
  .shot { position: absolute; z-index: 3; border: 10px solid #0a0909; box-shadow: 0 30px 0 rgba(0,0,0,.5), 0 0 0 4px #ec3013; background: #000; }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .p1 { width: 420px; height: 747px; right: 150px; top: 166px; transform: rotate(3deg); }
  .p2 { width: 330px; height: 587px; right: 560px; top: 300px; transform: rotate(-5deg); opacity: .9; }
  .l1 { width: 900px; height: 506px; right: 90px; top: 230px; transform: rotate(2deg); }
  .hero { position: absolute; z-index: 4; height: 470px; bottom: 30px; filter: drop-shadow(0 18px 0 rgba(0,0,0,.55)) drop-shadow(0 0 30px rgba(255,210,63,.25)); image-rendering: auto; }
  .hero.p { left: ${land ? 0 : 880}px; }
  .hero.l { left: 790px; }
  ${isModern(m) ? modernCss : ''}
  </style></head><body><div class="glow"></div>
  <div class="left">
    <div class="brand"><img class="mark" src="data:image/png;base64,${mark}">AYVAGO <b>GAMES</b></div>
    <h1>${m.title.en.toUpperCase()}</h1>
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
  // robot) while two hundred zombies close in; hints off, nothing hurts the hero (sim.god).
  'zombie-grove': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      p.quiet = true;
      p.testTime(30);
      p.testKit([['blade', 5, true], ['wards', 5, true], ['torch', 5], ['bow', 5, true], ['robot', 4]], [['reach', 5], ['armor', 5], ['vigor', 5]]);
      p.sim.player.hp = p.sim.player.maxHp;
      p.sim.god = true;
      p.sim.player.x = 3; p.sim.player.z = 12; p.testSnap();
      p.testHorde(230);
      p.testAuto(true, true);
      await new Promise((r) => setTimeout(r, 2500));
    }`,
  },
  // Rooftop Courier's card shows a dramatic gap jump at dusk: the run jumps far ahead (deep into
  // the evening: lit windows, lamps on) to an Old Factory kicker, the autopilot launches off it and
  // the run is stepped on (game time, however slow the renderer) to the moment the courier hangs
  // over the alley; there it stops and the camera swings out to the side, the low sun behind.
  'rooftop-courier': {
    stage: `async () => {
      const p = window.__ayvago.game.scene.getScene('Play');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      p.testTutorial(false);
      p.testPlace(1500, 0);
      p.testFind('kicker', 14);
      p.testAuto(true);
      const sim = p.sim;
      for (let i = 0; i < 400; i++) {
        p.testAdvance(1000 / 60);
        if (sim.state === 'air' && !sim.course.blockAt(sim.s) && sim.vy < 1.5) break;
      }
      p.testCam(1.6, 6, 0.6);
      p.testClearUi();
      await sleep(1500);
    }`,
    pick: 2,
  },
  'fruit-slash': { pick: 3 },
  'golden-podium': { pick: 0 },
  'light-cycles': { pick: 4 },
  'lights-out': { pick: 3 },
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
async function frameStats(lab, b64) {
  return lab.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
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
  }, b64);
}

function cardHtml(m, b64, accent) {
  const land = m.orientation === 'landscape';
  const modern = isModern(m);
  const shot = `data:image/png;base64,${b64}`;
  const title = esc(m.title.en.toUpperCase());
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
  .logo span { display: block; }
  .logo .front { position: absolute; inset: 0; }
  .modern-logo { font-family: MT; font-weight: 700; line-height: .98; letter-spacing: .5px; }
  .modern-logo .back { color: #1a1310; -webkit-text-stroke: 8px #1a1310;
    text-shadow: 0 3px 0 #1a1310, 0 5px 12px rgba(0,0,0,.7); }
  .modern-logo .front { background: linear-gradient(#fff 0%, color-mix(in srgb, ${accent} 55%, #fff) 30%, ${accent} 75%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .retro-logo { font-family: P2P; line-height: 1.3; letter-spacing: 1px; }
  .retro-logo .back { color: #000; -webkit-text-stroke: 6px #000; text-shadow: 3px 3px 0 #000, 0 4px 10px rgba(0,0,0,.6); }
  .retro-logo .front { color: ${accent}; }
  </style></head><body>
  ${land ? `<img class="bg" src="${shot}">` : `<img class="bg blur" src="${shot}"><div class="vig"></div><div class="glow"></div>
  <div class="frame ${modern ? 'modern' : 'retro'}"><img src="${shot}"></div>`}
  <div class="scrim"></div>
  <div class="logo ${modern ? 'modern-logo' : 'retro-logo'}" style="font-size:${modern ? 30 : 20}px"><span class="back">${title}</span><span class="front">${title}</span></div>
  <script>
  // Shrink the logo until it fits its width on at most two lines.
  window.fitLogo = () => {
    const el = document.querySelector('.logo');
    let size = parseFloat(el.style.fontSize);
    const lh = parseFloat(getComputedStyle(el).lineHeight) / size;
    const fits = () => el.scrollWidth <= ${maxW} + 1 && el.offsetHeight <= 2 * size * lh + 2;
    while (!fits() && size > 12) el.style.fontSize = (size -= 0.5) + 'px';
    return { size, lines: Math.round(el.offsetHeight / (size * lh)), w: el.offsetWidth };
  };
  </script></body></html>`;
}

/** Renders the card at device scale `scale` and encodes it as WebP no larger than `maxBytes`. */
async function renderCard(browser, lab, html, scale, maxBytes) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: scale });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const fit = await page.evaluate(() => window.fitLogo());
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.close();
  const webp = await lab.evaluate(async ({ src, maxBytes }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    let url;
    for (const q of [0.92, 0.88, 0.84, 0.8, 0.75, 0.7, 0.65, 0.6]) {
      url = c.toDataURL('image/webp', q);
      if ((url.length - 23) * 0.75 <= maxBytes) break;
    }
    return url;
  }, { src: png, maxBytes });
  if (!webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot encode WebP');
  return { buf: Buffer.from(webp.split(',')[1], 'base64'), fit };
}

// Opens a game, captures its menu and a scripted few seconds of play. The cover, icon, screenshot
// and thumbnail use the frame after step 15 (`play`); the card candidates are the frames after
// each CAPTURES step (`shots`, `live` = the round was still running).
async function capture(browser, slug, land, tune) {
  const page = await browser.newPage({ viewport: land ? { width: 1280, height: 720 } : { width: 720, height: 1280 } });
  try {
    await page.goto(`http://localhost:${PORT}/games/${slug}/?nointro&lang=en`);
    await page.waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: dev ? 60000 : 20000 });
    await page.waitForTimeout(900);
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
    return { menu, play, thumb, shots };
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
    let shots;
    if (fromFrames) {
      const live = JSON.parse(readFileSync(join(framesDir, `${slug}.json`), 'utf8'));
      shots = live.map((l, n) => ({ live: l, b64: readFileSync(join(framesDir, `${slug}-${n}.png`)).toString('base64') }));
    } else {
      const cap = await capture(browser, slug, land, tune);
      shots = cap.shots;
      if (framesDir) {
        mkdirSync(framesDir, { recursive: true });
        shots.forEach((s, n) => writeFileSync(join(framesDir, `${slug}-${n}.png`), Buffer.from(s.b64, 'base64')));
        writeFileSync(join(framesDir, `${slug}.json`), JSON.stringify(shots.map((s) => s.live)));
      }
      if (!cardOnly) {
        mkdirSync(join(root, 'public', 'thumbs'), { recursive: true });
        writeFileSync(join(root, 'public', 'thumbs', `${slug}.png`), cap.thumb);
        // Light in-game screenshot for the platform's Arcade theme tiles (manifest assets.screenshot).
        await renderScreenshot(browser, cap.play, land, join(out, 'screenshot.jpg'));
        const art = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await art.setContent(coverHtml(m, cap.menu, cap.play, heroImage(slug)));
        await art.evaluate(() => document.fonts.ready);
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
    const html = cardHtml(m, best.b64, tune.accent ?? best.accent);
    const big = await renderCard(browser, lab, html, 2, 110_000);
    const small = await renderCard(browser, lab, html, 1, 45_000);
    writeFileSync(join(out, 'card-1280x720.webp'), big.buf);
    writeFileSync(join(out, 'card-640x360.webp'), small.buf);
    const stats = shots.map((s) => `${s.n}${s === best ? '*' : ''}:${s.live ? '' : 'x'}${Math.round(s.rank)}`).join(' ');
    console.log(`ok    ${slug}  card [${stats}] ${Math.round(small.buf.length / 1024)}+${Math.round(big.buf.length / 1024)} KB, logo ${big.fit.size}px x${big.fit.lines}`);
    made++;
  } catch (e) {
    console.log(`FAIL  ${slug}: ${String(e.message).split('\n')[0]}`);
  }
}
await browser.close();
if (server) try { process.kill(-server.pid); } catch { server.kill(); }
console.log(`\nstore assets: ${made}/${slugs.length}`);
process.exit(made === slugs.length ? 0 : 1);
