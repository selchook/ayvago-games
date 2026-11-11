// Embeds games the way ayvago.com does (cross-origin sandboxed iframe on an allowed platform
// origin) and checks the GHA_* protocol end to end:
//   GHA_READY → GHA_START(locale) → GHA_LOADING → intro → menu → GHA_SESSION_START
//   → GHA_PAUSE pauses → GHA_MUTE mutes → forced game over → GHA_END{score}
// The game reports its own sound switch after the handshake and on every change of its menu button
// and never echoes GHA_MUTE back.
// GHA_START carries a platform best (protocol 2.4) above the forced score: the game must adopt
// it as its own best and must not celebrate the lower score as a new record.
// Difficulty (protocol 2.6): a game with `difficulty: true` gets Easy picked on its menu toggle
// before PLAY, and its GHA_END must carry difficulty 'easy'; every other game's GHA_END carries
// 'normal' or no difficulty at all.
// Ads: with adsEnabled false (the platform's default) no game sends GHA_AD_REQUEST and the result
// screen offers no ad. Games that opt in to the rewarded continue (`ads.continue`) get a second
// run with adsEnabled true, where the host answers ad requests like the platform's ad manager:
//   lost run → continue offered, GHA_END held back → tap CONTINUE → GHA_AD_REQUEST
//   {format:'rewarded', placement:'continue'} with the game silent → GHA_AD_RESULT rewarded →
//   the run goes on → second loss: no second offer, one GHA_END (with continues: 1 once the
//   vendored adapter forwards the field) → MENU → GHA_AD_REQUEST interstitial 'menu' → menu →
//   a new run: offered again, Enter (RETRY) turns it down → GHA_END at once, without continues.
// Usage: node scripts/platform-harness.mjs [--dev] [slug ...]   (default: dist/ via vite preview)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = (only.length ? only : readdirSync(join(root, 'games')))
  .filter((s) => existsSync(dev ? join(root, 'games', s, 'index.html') : join(root, 'dist', 'games', s, 'index.html')));

const GAME_PORT = 4900 + Math.floor(Math.random() * 90);
const HOST_PORT = 3000;   // http://localhost:3000 is an allowed platform origin in the adapter
const GAME_ORIGIN = `http://localhost:${GAME_PORT}`;

const server = spawn('npx', dev ? ['vite', '--port', String(GAME_PORT), '--strictPort'] : ['vite', 'preview', '--port', String(GAME_PORT), '--strictPort'],
  { cwd: root, stdio: 'pipe', detached: true, env: { ...process.env, VITE_CACHE_DIR: join(tmpdir(), `ayvago-vite-${GAME_PORT}`) } });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('Local') && r()); setTimeout(r, 10000); });

// Minimal stand-in for apps/web/components/game/game-player.tsx
// GHA_END carries `continues` only once the vendored adapter forwards it (platform adapter > 2.7.0).
const ADAPTER_FORWARDS_CONTINUES = /end\.continues|continues:/.test(readFileSync(join(root, 'src', 'core', 'ayvago', 'adapter.ts'), 'utf8'));

const hostPage = (slug, locale, ads) => `<!doctype html><html><body style="margin:0;background:#111">
<iframe id="g" src="${GAME_ORIGIN}/games/${slug}/" style="width:540px;height:960px;border:0"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
  allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope" referrerpolicy="origin"></iframe>
<script>
  window.log = [];
  window.adQueue = [];
  const frame = document.getElementById('g');
  window.send = (m) => frame.contentWindow.postMessage(m, '${GAME_ORIGIN}');
  // the ad manager stand-in: the test answers each request with answerAd()
  window.answerAd = (shown, rewarded) => {
    const req = window.adQueue.shift();
    if (req) send({ type: 'GHA_AD_RESULT', id: req.id, shown, rewarded: req.format === 'rewarded' && rewarded });
    return !!req;
  };
  addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== '${GAME_ORIGIN}') return;
    window.log.push(e.data);
    if (e.data && e.data.type === 'GHA_AD_REQUEST') window.adQueue.push(e.data);
    if (e.data && e.data.type === 'GHA_READY') send({ type: 'GHA_START', config: {
      mode: 'solo', isHost: true, playerIndex: 0, playerCount: 1, protocol: 2,
      theme: 'retro', colorMode: 'dark', tokens: { '--accent': '#ec3013' }, locale: '${locale}', adsEnabled: ${ads ? 'true' : 'false'}, best: ${PLATFORM_BEST} } });
  });
</script></body></html>`;
const PLATFORM_BEST = 1000000;
const host = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(hostPage(u.searchParams.get('slug'), u.searchParams.get('locale') || 'tr', u.searchParams.get('ads') === '1'));
}).listen(HOST_PORT);

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];

async function check(slug) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]/.test(m.text())) errors.push('console: ' + m.text()); });
  const types = () => page.evaluate(() => window.log.map((m) => m.type));
  const step = {};
  try {
    await page.goto(`http://localhost:${HOST_PORT}/?slug=${slug}&locale=tr`);
    const frame = () => page.frames().find((f) => f.url().startsWith(GAME_ORIGIN));
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_READY'), null, { timeout: dev ? 30000 : 8000 });
    step.ready = true;
    const ready = await page.evaluate(() => window.log.find((m) => m.type === 'GHA_READY'));
    step.gameId = ready.gameId;
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_LOADING'), null, { timeout: 15000 });
    step.loading = true;
    await page.waitForTimeout(800);
    await page.mouse.click(270, 40);    // skip intro (away from the menu's PLAY button)
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 15000 });
    step.locale = await frame().evaluate(() => document.documentElement.lang);
    step.best = await frame().evaluate((id) => Number(localStorage.getItem(`ayvago:best:${id}`)), slug);
    // the menu's own sound button: off and on again, both reported to the platform
    const box = await frame().locator('canvas').first().boundingBox();
    const [gw, gh] = await frame().evaluate(() => [window.__ayvago.game.scale.width, window.__ayvago.game.scale.height]);
    for (let i = 0; i < 2; i++) {
      await page.mouse.click(box.x + (60 * box.width) / gw, box.y + ((gh - 60) * box.height) / gh);
      await page.waitForTimeout(250);
    }
    // difficulty: games that offer it get Easy from a tap on the menu toggle
    step.offersDifficulty = await frame().evaluate(() => !!window.__ayvago.def.difficulty);
    if (step.offersDifficulty) {
      const hit = await frame().evaluate(() => window.__ayvago.game.scene.getScene('Menu').difficultyHit?.easy);
      if (!hit) throw new Error('difficulty toggle missing on the menu');
      await page.mouse.click(box.x + (hit.x * box.width) / gw, box.y + (hit.y * box.height) / gh);
      await page.waitForTimeout(250);
      step.easyPicked = await frame().evaluate((id) => localStorage.getItem(`ayvago:difficulty:${id}`) === '"easy"', slug);
    }
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 5000 });
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_SESSION_START'), null, { timeout: 3000 });
    step.sessionStart = true;
    await page.waitForTimeout(1500);
    await page.evaluate(() => send({ type: 'GHA_PAUSE' }));
    await frame().waitForFunction(() => window.__ayvago.game.scene.isActive('Pause'), null, { timeout: 3000 });
    step.pause = true;
    await page.evaluate(() => send({ type: 'GHA_MUTE', muted: true }));
    await page.waitForTimeout(200);
    step.mute = await frame().evaluate(() => window.__ayvago.silenced());
    // protocol 2.5: one sound switch. The game reported its switch after the handshake and does
    // not echo the platform's own GHA_MUTE back.
    const states = await page.evaluate(() => window.log.filter((m) => m.type === 'GHA_MUTE_STATE').map((m) => m.muted));
    step.muteState = states.join() === 'false,true,false';
    await frame().evaluate(() => {
      const g = window.__ayvago.game;
      g.scene.stop('Pause');
      const play = g.scene.getScene('Play');
      play.scene.resume();
      play.addScore?.(123);
      play.endGame({ delay: 0 });
    });
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_END'), null, { timeout: 6000 });
    const end = await page.evaluate(() => window.log.find((m) => m.type === 'GHA_END'));
    step.endScore = end.score;
    step.end = typeof end.score === 'number' && end.score >= 123;
    step.difficulty = end.difficulty ?? null;
    step.difficultyOk = step.offersDifficulty ? step.easyPicked && end.difficulty === 'easy' : end.difficulty === undefined || end.difficulty === 'normal';
    await page.waitForTimeout(300);
    step.noFalseBest = !(await page.evaluate(() => window.log.some((m) => m.type === 'GHA_HAPPY_TIME')));
    // ads off (the platform's default): no ad offer on the result screen, no ad request at all
    const offer = await frame().evaluate(() => window.__ayvago.game.scene.getScene('GameOver').adHit);
    step.noAds = !offer && !(await page.evaluate(() => window.log.some((m) => m.type === 'GHA_AD_REQUEST')));
    step.adsContinue = await frame().evaluate(() => !!window.__ayvago.def.ads?.continue);
  } catch (e) {
    errors.push('flow: ' + String(e.message).split('\n')[0] + ' | messages=' + (await types().catch(() => '?')));
  }
  await page.close();
  const ok = step.ready && step.loading && step.locale === 'tr' && step.sessionStart && step.pause && step.mute && step.end && step.best === PLATFORM_BEST && step.noFalseBest && step.muteState && step.difficultyOk && step.noAds && errors.length === 0;
  return { slug, ok: !!ok, step, errors: [...new Set(errors)].slice(0, 8) };
}

/** Ads on: the rewarded continue end to end, then the 'menu' interstitial (games with `ads.continue`). */
async function checkAds(slug) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/\[vite\]/.test(m.text())) errors.push('console: ' + m.text()); });
  const log = (type) => page.evaluate((t) => window.log.filter((m) => m.type === t), type);
  const step = {};
  try {
    await page.goto(`http://localhost:${HOST_PORT}/?slug=${slug}&locale=en&ads=1`);
    const frame = () => page.frames().find((f) => f.url().startsWith(GAME_ORIGIN));
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_LOADING'), null, { timeout: dev ? 30000 : 15000 });
    await page.waitForTimeout(800);
    await page.mouse.click(270, 40);
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Menu'), null, { timeout: 15000 });
    const box = await frame().locator('canvas').first().boundingBox();
    const [gw, gh] = await frame().evaluate(() => [window.__ayvago.game.scale.width, window.__ayvago.game.scale.height]);
    const tap = (p) => page.mouse.click(box.x + (p.x * box.width) / gw, box.y + (p.y * box.height) / gh);
    await page.keyboard.press('Enter');
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 5000 });
    await page.waitForTimeout(1200);
    // first loss: the continue is offered and GHA_END waits for the player's choice
    await frame().evaluate(() => { const play = window.__ayvago.game.scene.getScene('Play'); play.addScore?.(123); play.endGame({ delay: 0 }); });
    await frame().waitForFunction(() => window.__ayvago.game.scene.getScene('GameOver').adHit?.placement === 'continue', null, { timeout: 6000 });
    await page.waitForTimeout(600);
    step.offered = true;
    step.endHeld = (await log('GHA_END')).length === 0;
    await tap(await frame().evaluate(() => window.__ayvago.game.scene.getScene('GameOver').adHit));
    await page.waitForFunction(() => window.adQueue.length > 0, null, { timeout: 4000 });
    const req = (await log('GHA_AD_REQUEST'))[0];
    step.request = `${req.format}/${req.placement}`;
    // during the ad: silent, the round still paused, the player's own sound switch untouched
    step.heldDuringAd = await frame().evaluate(() => {
      const g = window.__ayvago.game;
      return window.__ayvago.silenced() && g.sound.mute && !g.scene.isActive('Play') && localStorage.getItem('ayvago:muted') !== 'true';
    });
    step.muteStateQuiet = (await log('GHA_MUTE_STATE')).every((m) => m.muted === false);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.answerAd(true, true));
    await frame().waitForFunction(() => {
      const g = window.__ayvago.game;
      return g.scene.isActive('Play') && !g.scene.isActive('GameOver') && !g.scene.getScene('Play').isOver;
    }, null, { timeout: 4000 });
    step.resumed = true;
    step.soundBack = await frame().evaluate(() => !window.__ayvago.silenced() && !window.__ayvago.game.sound.mute);
    step.oneSession = (await log('GHA_SESSION_START')).length === 1;
    await page.waitForTimeout(1500);
    step.endHeldAfter = (await log('GHA_END')).length === 0;
    // the continued run ends: no second offer, one GHA_END for the whole run
    await frame().evaluate(() => { const play = window.__ayvago.game.scene.getScene('Play'); play.addScore?.(50); play.endGame({ delay: 0 }); });
    await page.waitForFunction(() => window.log.some((m) => m.type === 'GHA_END'), null, { timeout: 6000 });
    await page.waitForTimeout(400);
    const ends = await log('GHA_END');
    step.endScore = ends[0].score;
    step.endContinues = ends[0].continues ?? null;
    step.oneEnd = ends.length === 1 && typeof ends[0].score === 'number';
    step.continuesOk = ADAPTER_FORWARDS_CONTINUES ? ends[0].continues === 1 : true;
    step.noSecondOffer = !(await frame().evaluate(() => window.__ayvago.game.scene.getScene('GameOver').adHit));
    // MENU: an interstitial at the break, then the menu
    await tap(await frame().evaluate(() => window.__ayvago.game.scene.getScene('GameOver').menuHit));
    await page.waitForFunction(() => window.adQueue.length > 0, null, { timeout: 4000 });
    const inter = (await log('GHA_AD_REQUEST'))[1];
    step.interstitial = `${inter.format}/${inter.placement}`;
    await page.evaluate(() => window.answerAd(true, false));
    await frame().waitForFunction(() => window.__ayvago.game.scene.isActive('Menu'), null, { timeout: 4000 });
    step.menu = true;
    // a new run gets the offer again; Enter (RETRY) turns it down, so its GHA_END goes out at once
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await frame().waitForFunction(() => window.__ayvago?.game.scene.isActive('Play'), null, { timeout: 5000 });
    await page.waitForTimeout(800);
    await frame().evaluate(() => { const play = window.__ayvago.game.scene.getScene('Play'); play.addScore?.(10); play.endGame({ delay: 0 }); });
    await frame().waitForFunction(() => window.__ayvago.game.scene.getScene('GameOver').adHit?.placement === 'continue', null, { timeout: 6000 });
    await page.waitForTimeout(600);
    step.endHeldAgain = (await log('GHA_END')).length === 1;
    // the result screen arms Enter after 400 ms of game time, which can run slow under load
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Enter');
      const sent = await page.waitForFunction(() => window.log.filter((m) => m.type === 'GHA_END').length === 2, null, { timeout: 1500 }).then(() => true, () => false);
      if (sent) break;
    }
    await frame().waitForFunction(() => window.__ayvago.game.scene.isActive('Play'), null, { timeout: 5000 });
    const declined = (await log('GHA_END'))[1];
    step.declined = declined.continues === undefined && (await log('GHA_AD_REQUEST')).length === 2;
  } catch (e) {
    errors.push('ads flow: ' + String(e.message).split('\n')[0]);
  }
  await page.close();
  const ok = step.offered && step.endHeld && step.request === 'rewarded/continue' && step.heldDuringAd && step.muteStateQuiet
    && step.resumed && step.soundBack && step.oneSession && step.endHeldAfter && step.oneEnd && step.continuesOk
    && step.noSecondOffer && step.interstitial === 'interstitial/menu' && step.menu && step.endHeldAgain && step.declined && errors.length === 0;
  return { ok: !!ok, step, errors: [...new Set(errors)].slice(0, 8) };
}

for (const slug of slugs) {
  const r = await check(slug);
  if (r.step.adsContinue) {
    const a = await checkAds(slug);
    r.ads = a.step;
    r.ok = r.ok && a.ok;
    r.errors.push(...a.errors);
  }
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${slug}  ${JSON.stringify(r.step)}${r.ads ? '\n      ads: ' + JSON.stringify(r.ads) : ''}${r.errors.length ? '\n      ' + r.errors.join('\n      ') : ''}`);
}
if (!ADAPTER_FORWARDS_CONTINUES && results.some((r) => r.ads)) {
  console.log('\nnote: the vendored adapter (src/core/ayvago/adapter.ts) does not forward `continues` in GHA_END yet; the continue check only asks for one GHA_END after the continued run.');
}
await browser.close();
host.close();
try { process.kill(-server.pid); } catch { server.kill(); }
mkdirSync(join(root, 'reports'), { recursive: true });
if (!only.length) writeFileSync(join(root, 'reports', 'platform.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed the platform protocol check`);
process.exit(failed ? 1 : 0);
