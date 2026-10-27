import Phaser from 'phaser';

// All shared art/audio lives in public/assets; games are served from games/<slug>/.
export const ASSET_ROOT = new URL('../../assets/', document.baseURI).href;

/** URL of a file under public/assets, e.g. asset('kenney/space-shooter/png/laserblue01.png'). */
export const asset = (path: string): string => ASSET_ROOT + path;

/** Kenney shortcut: kenney('space-shooter/png/laserblue01.png'). */
export const kenney = (path: string): string => ASSET_ROOT + 'kenney/' + path;

/** Loads an audio file that exists as both .ogg and .mp3 (path without extension). */
export function loadAudio(load: Phaser.Loader.LoaderPlugin, key: string, pathNoExt: string): void {
  const base = ASSET_ROOT + pathNoExt;
  load.audio(key, [base + '.ogg', base + '.mp3']);
}

/** Shortcut for Kenney audio: loadSfx(load, 'laser', 'sfx-digital/audio/laser1'). */
export function loadSfx(load: Phaser.Loader.LoaderPlugin, key: string, kenneyPathNoExt: string): void {
  loadAudio(load, key, 'kenney/' + kenneyPathNoExt);
}
