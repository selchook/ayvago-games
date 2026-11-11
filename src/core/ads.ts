// Ads through the Ayvago platform (GHA_AD_REQUEST → GHA_AD_RESULT, via the vendored adapter).
// Games never ask the adapter for ads themselves; they go through these helpers:
// - adsAvailable(): the platform turned ads on (GHA_START `adsEnabled`) and this is a solo run.
//   Standalone, in the portal and in online matches it is always false. `?ads=sim` (rewarded ad
//   watched) or `?ads=sim-skip` (ad not finished) fake the platform's answer after a short delay
//   so the flow can be tried outside ayvago.com; inside the platform's frame the flag is ignored.
// - showRewarded(placement): the player's choice only (a button they press). Resolves true when
//   the platform confirms the reward.
// - showInterstitial(placement): at natural breaks only (result screen → menu, every few
//   replays); the platform enforces the real frequency caps.
// While an ad runs the Play scene is paused, the game is silent (the sound switch itself is not
// touched) and a small "Loading ad…" card blocks the screen; everything is restored afterwards.
// The result screen (scenes.ts) offers the standard placements: 'continue' and 'double'.
import Phaser from 'phaser';
import { sdk } from './sdk';
import { net } from './net';
import { setAdSilence } from './audio';
import { t } from './i18n';
import { txt, COLORS } from './theme';
import { isModern } from './style';

/** Standard placements; the platform may report or cap them separately. */
export type AdPlacement = 'continue' | 'double' | 'menu' | 'replay' | (string & {});
export type AdFormat = 'rewarded' | 'interstitial';

/** How long a simulated ad takes (`?ads=sim`). */
const SIM_MS = 1400;
/** The result screen asks for a 'replay' interstitial on every Nth "play again". */
export const REPLAY_INTERSTITIAL_EVERY = 3;

let game: Phaser.Game | null = null;
let busy = false;

/** launch() hands the game over, so an ad break can pause and silence it. */
export function bindAds(g: Phaser.Game): void {
  game = g;
}

type Simulation = 'reward' | 'skip';

/** The test flag: standalone only, so a page on ayvago.com always gets the platform's answer. */
function simulation(): Simulation | null {
  if (sdk.embedded) return null;
  const flag = new URLSearchParams(location.search).get('ads');
  return flag === 'sim' ? 'reward' : flag === 'sim-skip' ? 'skip' : null;
}

/** True when ads may be offered: the platform turned them on and this is not an online match. */
export function adsAvailable(): boolean {
  if (net.active) return false;
  if (simulation()) return true;
  return sdk.embedded && sdk.adapter?.config?.adsEnabled === true;
}

/** True while an ad break is running. */
export function adBusy(): boolean {
  return busy;
}

/**
 * A rewarded ad the player chose to watch. Resolves true only when the platform confirms the
 * reward; false when ads are off, the player skipped it, nothing was shown or it timed out.
 * `scene` hosts the loading card (default: the top running scene).
 */
export function showRewarded(placement: AdPlacement, scene?: Phaser.Scene): Promise<boolean> {
  return adBreak('rewarded', placement, scene);
}

/** An interstitial at a natural break. Always resolves, at once when ads are off. */
export async function showInterstitial(placement: AdPlacement, scene?: Phaser.Scene): Promise<void> {
  await adBreak('interstitial', placement, scene);
}

async function adBreak(format: AdFormat, placement: AdPlacement, scene?: Phaser.Scene): Promise<boolean> {
  if (busy || !game || !adsAvailable()) return false;
  busy = true;
  const restore = hold(game, scene ?? topScene(game));
  sdk.emit('adStart', { format, placement });
  let rewarded = false;
  try {
    rewarded = await request(format, placement);
  } catch {
    rewarded = false;
  } finally {
    restore();
    busy = false;
  }
  const ok = format === 'rewarded' && rewarded;
  sdk.emit('adEnd', { format, placement, rewarded: ok });
  return ok;
}

function request(format: AdFormat, placement: AdPlacement): Promise<boolean> {
  const sim = simulation();
  if (sim) return new Promise((resolve) => setTimeout(() => resolve(sim === 'reward'), SIM_MS));
  const adapter = sdk.adapter;
  if (!adapter) return Promise.resolve(false);
  if (format === 'rewarded') return adapter.requestRewarded(placement);
  return adapter.requestInterstitial(placement).then(() => false);
}

function topScene(g: Phaser.Game): Phaser.Scene | undefined {
  return g.scene.getScenes(true, true)[0];
}

/** Pauses the round, silences the game and shows the loading card; returns the undo. */
function hold(g: Phaser.Game, scene: Phaser.Scene | undefined): () => void {
  const play = g.scene.keys['Play'] as Phaser.Scene | undefined;
  const pausedPlay = !!play && play.sys.isActive();
  if (pausedPlay) play!.scene.pause();
  setAdSilence(g, true);
  const keyboard = scene?.input.keyboard;
  const keysWere = keyboard?.enabled ?? false;
  if (keyboard) keyboard.enabled = false;
  const card = scene ? loadingCard(scene) : null;
  return () => {
    card?.destroy();
    if (keyboard) keyboard.enabled = keysWere;
    setAdSilence(g, false);
    if (pausedPlay && play!.sys.isPaused()) play!.scene.resume();
  };
}

/** "Loading ad…": a small card over a dim screen that also swallows taps. */
function loadingCard(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const modern = isModern();
  const root = scene.add.container(0, 0).setDepth(20000).setScrollFactor(0);
  const dim = scene.add.rectangle(0, 0, width, height, modern ? 0x0b1020 : COLORS.dark, 0.72).setOrigin(0).setInteractive();
  const W = 470, H = 120, cx = width / 2, cy = height / 2;
  const box = scene.add.graphics({ x: cx, y: cy });
  if (modern) {
    box.fillStyle(0x000000, 0.3).fillRoundedRect(-W / 2, -H / 2 + 8, W, H, H / 2);
    box.fillStyle(0x151b30, 0.96).fillRoundedRect(-W / 2, -H / 2, W, H, H / 2);
    box.lineStyle(2, 0xffffff, 0.18).strokeRoundedRect(-W / 2, -H / 2, W, H, H / 2);
  } else {
    box.fillStyle(0x000000, 0.6).fillRect(-W / 2, -H / 2 + 8, W, H);
    box.fillStyle(COLORS.panel, 1).fillRect(-W / 2, -H / 2, W, H);
    box.lineStyle(4, 0xffffff, 0.85).strokeRect(-W / 2, -H / 2, W, H);
  }
  // a spinner (a bright arc turning on a faint ring) and the label, centred together
  const label = txt(scene, 0, cy + 1, t('adLoading'), { size: 30, color: '#f3f2f2' }).setOrigin(0, 0.5);
  const R = 26, GAP = 26, left = cx - (R * 2 + GAP + label.width) / 2;
  const sx = left + R;
  label.setX(left + R * 2 + GAP);
  const ring = scene.add.graphics({ x: sx, y: cy });
  ring.lineStyle(8, 0xffffff, 0.15).strokeCircle(0, 0, R);
  const arc = scene.add.graphics({ x: sx, y: cy });
  arc.lineStyle(8, COLORS.yellow, 1).beginPath().arc(0, 0, R, 0, Math.PI * 0.6).strokePath();
  scene.tweens.add({ targets: arc, angle: 360, duration: 800, repeat: -1 });
  scene.tweens.add({ targets: label, alpha: 0.55, duration: 650, yoyo: true, repeat: -1 });
  root.add([dim, box, ring, arc, label]);
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: 160 });
  for (const o of [box, ring, arc]) {
    o.setAlpha(0);
    scene.tweens.add({ targets: o, alpha: 1, duration: 200, delay: 60 });
  }
  return root;
}
