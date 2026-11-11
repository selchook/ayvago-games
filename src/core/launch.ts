import Phaser from 'phaser';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { installTurkishI, TURKISH_I_FAMILY } from './turkish-font';
import { installStyle, isModern, MODERN_BODY, MODERN_TITLE, setStyle, styleOf } from './style';
import { playAyvagoIntro } from './intro';
import { registerStrings, loc, getLang, setLang } from './i18n';
import { sdk } from './sdk';
import { wireNet } from './net';
import { installMasterBus, isMuted, isSilenced, setMuted, setMuteReporter } from './audio';
import type { PlatformAdapter } from './ayvago/adapter';
import { GameDefinition, setCurrentGame, gameSize } from './registry';
import { BootScene, MenuScene, PauseScene, GameOverScene, setIntroPromise } from './scenes';
import { setHostScanlines, themeHasScanlines } from './fx';
import { installKeyboardOnce } from './keyboard-once';
import { adoptPlatformBest } from './storage';
import { bindAds } from './ads';

declare global {
  interface Window {
    __ayvago?: { game: Phaser.Game; def: GameDefinition; silenced: () => boolean };
  }
}

/** Platform → game commands: pause, mute and locale changes from the Ayvago host page. */
function bindPlatform(game: Phaser.Game, adapter: PlatformAdapter): void {
  adapter.onPause(() => {
    const play = game.scene.getScene('Play') as Phaser.Scene & { pauseGame?: () => void };
    if (play?.scene.isActive()) play.pauseGame?.();
  });
  // One sound switch with the platform's toolbar button (protocol 2.5): its GHA_MUTE sets the
  // game's switch, and the game tells the platform its own state now and after every change.
  adapter.onMute((muted) => setMuted(game, muted, 'host'));
  setMuteReporter((muted) => adapter.reportMute(muted));
  adapter.reportMute(isMuted());
  adapter.onThemeChange((th) => setHostScanlines(themeHasScanlines(th.theme)));
  adapter.onLocaleChange((locale) => {
    setLang(locale.toLowerCase().startsWith('tr') ? 'tr' : 'en');
    document.documentElement.lang = getLang();
    const menu = game.scene.getScene('Menu');
    if (menu?.scene.isActive()) menu.scene.restart();
  });
}

async function fontsReady(timeoutMs = 3000): Promise<void> {
  const loads = Promise.all([
    document.fonts.load('32px "Press Start 2P"', 'AĞŞİ'),
    document.fonts.load(`32px "${TURKISH_I_FAMILY}"`, 'İ'),
    document.fonts.load('32px "Pixelify Sans"', 'AĞŞİ'),
    // Canvas text never triggers a font download, so the bold face (Latin + Latin Extended) is
    // loaded here too; otherwise bold Turkish letters fall back to another font.
    document.fonts.load('bold 32px "Pixelify Sans"', 'AĞŞİ'),
    ...(isModern() ? [
      document.fonts.load(`700 32px "${MODERN_TITLE}"`, 'AĞŞİ'),
      document.fonts.load(`600 32px "${MODERN_TITLE}"`, 'AĞŞİ'),
      document.fonts.load(`800 32px "${MODERN_BODY}"`, 'AĞŞİ'),
      document.fonts.load(`700 32px "${MODERN_BODY}"`, 'AĞŞİ'),
    ] : []),
  ]).then(() => undefined);
  await Promise.race([loads, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/**
 * Entry point for every Ayvago game: plays the boot intro, preloads the game under it,
 * then runs Menu -> Play -> GameOver with the shared platform services.
 */
export async function launch(def: GameDefinition): Promise<Phaser.Game> {
  setStyle(styleOf(def));
  installTurkishI();
  installStyle();
  setCurrentGame(def);
  if (def.strings) registerStrings(def.strings);
  // The handshake (GHA_READY) goes out first so the platform reveals the frame and the intro shows.
  const platform = sdk.init(def.meta.id);
  sdk.emit('loaded');
  document.body.style.background = def.background ?? '#0e0d12';

  const params = new URLSearchParams(location.search);
  const intro = params.has('nointro') ? Promise.resolve() : playAyvagoIntro();
  setIntroPromise(intro);
  const [adapter] = await Promise.all([platform, fontsReady()]);
  if (adapter.name === 'ayvago') setLang(adapter.locale.toLowerCase().startsWith('tr') ? 'tr' : 'en');
  setHostScanlines(themeHasScanlines(adapter.config?.theme));
  // The platform's record wins over this browser's (absent = the platform does not know).
  const platformBest = adapter.config?.best;
  if (platformBest !== undefined) adoptPlatformBest(def.meta.id, platformBest);
  wireNet();
  document.documentElement.lang = getLang();
  document.title = `${loc(def.meta.title)} · Ayvago Games`;

  const { width, height } = gameSize(def);
  const physics: Phaser.Types.Core.PhysicsConfig | undefined =
    def.physics === 'none' ? undefined
      : def.physics === 'matter'
        ? { default: 'matter', matter: { gravity: { x: 0, y: (def.gravityY ?? 0) / 1000 }, debug: false } }
        : { default: 'arcade', arcade: { gravity: { x: 0, y: def.gravityY ?? 0 }, debug: false } };

  installKeyboardOnce();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width,
    height,
    backgroundColor: def.background ?? '#0e0d12',
    // The modern style scales everything smoothly, pixel-art packs included.
    pixelArt: !!def.pixelArt && !isModern(),
    roundPixels: !!def.pixelArt && !isModern(),
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics,
    input: { activePointers: 3 },
    audio: { disableWebAudio: false },
    fps: { target: 60 },
    scene: [BootScene, MenuScene, ...def.scenes, PauseScene, GameOverScene],
  });
  game.sound.mute = isSilenced();
  installMasterBus(game);

  bindPlatform(game, adapter);
  bindAds(game);

  window.__ayvago = { game, def, silenced: isSilenced };
  return game;
}
