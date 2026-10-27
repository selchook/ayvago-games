import Phaser from 'phaser';
import { storage } from './storage';

// Two independent switches: the player's own toggle (persisted) and the host platform's
// GHA_MUTE. Sound plays only when neither is on.
let muted = storage.get<boolean>('muted', false);
let hostMuted = false;

export function isMuted(): boolean {
  return muted;
}

/** True when nothing should be heard (player or platform muted). */
export function isSilenced(): boolean {
  return muted || hostMuted;
}

export function setMuted(game: Phaser.Game, m: boolean): void {
  muted = m;
  storage.set('muted', m);
  game.sound.mute = isSilenced();
}

export function setHostMuted(game: Phaser.Game, m: boolean): void {
  hostMuted = m;
  game.sound.mute = isSilenced();
}

/** Plays a loaded sound if it exists; silently ignores missing keys. */
export function playSfx(scene: Phaser.Scene, key: string, config?: Phaser.Types.Sound.SoundConfig): void {
  if (isSilenced() || !scene.cache.audio.exists(key)) return;
  try {
    scene.sound.play(key, config);
  } catch {
    /* audio context locked */
  }
}
