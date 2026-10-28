import Phaser from 'phaser';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { playAyvagoIntro } from './intro';
import { registerStrings, loc, getLang, setLang } from './i18n';
import { sdk } from './sdk';
import { wireNet } from './net';
import { installMasterBus, isMuted, isSilenced, setHostMuted } from './audio';
import type { PlatformAdapter } from './ayvago/adapter';
import { GameDefinition, setCurrentGame, gameSize } from './registry';
import { BootScene, MenuScene, PauseScene, GameOverScene, setIntroPromise } from './scenes';

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
  adapter.onMute((muted) => setHostMuted(game, muted));
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
    document.fonts.load('32px "Pixelify Sans"', 'AĞŞİ'),
    // Canvas text never triggers a font download, so the bold face (Latin + Latin Extended) is
    // loaded here too; otherwise bold Turkish letters fall back to another font.
    document.fonts.load('bold 32px "Pixelify Sans"', 'AĞŞİ'),
  ]).then(() => undefined);
  await Promise.race([loads, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/**
 * Entry point for every Ayvago game: plays the boot intro, preloads the game under it,
 * then runs Menu -> Play -> GameOver with the shared platform services.
 */
export async function launch(def: GameDefinition): Promise<Phaser.Game> {
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
  wireNet();
  document.documentElement.lang = getLang();
  document.title = `${loc(def.meta.title)} · Ayvago Games`;

  const { width, height } = gameSize(def);
  const physics: Phaser.Types.Core.PhysicsConfig | undefined =
    def.physics === 'none' ? undefined
      : def.physics === 'matter'
        ? { default: 'matter', matter: { gravity: { x: 0, y: (def.gravityY ?? 0) / 1000 }, debug: false } }
        : { default: 'arcade', arcade: { gravity: { x: 0, y: def.gravityY ?? 0 }, debug: false } };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width,
    height,
    backgroundColor: def.background ?? '#0e0d12',
    pixelArt: !!def.pixelArt,
    roundPixels: !!def.pixelArt,
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

  window.__ayvago = { game, def, silenced: isSilenced };
  return game;
}
