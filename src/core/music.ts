import Phaser from 'phaser';
import { ASSET_ROOT } from './assets';
import { currentGame } from './registry';

// Background music: CC0 chiptunes by Juhani Junkala (public/assets/oga/junkala-music, see
// docs/assets/LICENSES.md), or a game's own file (MusicFile). Tracks load lazily the first time
// they are needed, so they never slow down the boot; one track plays at a time and changes
// cross-fade.

export const TRACKS = {
  title: 'title-screen',
  select: '4-stage-select',
  stage1: '1-stage-1',
  stage2: '2-stage-2',
  boss: '3-boss-fight',
  level1: 'level-1',
  level2: 'level-2',
  level3: 'level-3',
  ending: 'ending',
} as const;
export type Track = keyof typeof TRACKS;

/**
 * A game's own music file instead of one of the shared TRACKS: a path under public/assets
 * (e.g. 'music/owner/rolling-sea-shanty.mp3'), loaded as it is, and an optional loudness factor
 * on the core's music volumes (quieter recordings next to the chiptunes).
 */
export interface MusicFile {
  file: string;
  gain?: number;
}
/** What a game's `music.menu` / `music.play` may name. */
export type MusicChoice = Track | MusicFile;

const MENU_VOLUME = 0.3;
const PLAY_VOLUME = 0.24;
const DUCKED = 0.08;
const FADE_MS = 700;

// Fast genres get the driving level themes, calm ones the lighter stage tunes. A game picks
// one deterministically from its id, so it always sounds the same.
const ENERGETIC: Track[] = ['level1', 'level2', 'level3', 'stage2', 'boss'];
const CALM: Track[] = ['stage1', 'select', 'ending'];
const CALM_GENRES = new Set(['puzzle', 'casual', 'card', 'word', 'strategy']);

let current: Phaser.Sound.BaseSound | null = null;
let currentKey = '';
let wanted = '';
let baseVolume = PLAY_VOLUME;
let gain = 1;

const keyOf = (track: MusicChoice) => (typeof track === 'string' ? `music-${track}` : `music-file:${track.file}`);

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** The track a game plays during rounds: its own choice, else one picked from its genre. */
export function playTrack(): MusicChoice | false {
  const def = currentGame();
  if (def.music?.play !== undefined) return def.music.play;
  const pool = CALM_GENRES.has(def.meta.genres[0]) ? CALM : ENERGETIC;
  return pool[hash(def.meta.id) % pool.length];
}

export function menuTrack(): MusicChoice | false {
  return currentGame().music?.menu ?? 'title';
}

// Fades run on the clock, not on a scene's tweens: the scene that starts a fade (a pause
// overlay, the menu) is often stopped before the fade ends.
const fades = new WeakMap<Phaser.Sound.BaseSound, number>();

function fadeTo(sound: Phaser.Sound.BaseSound, volume: number, then?: () => void): void {
  const s = sound as Phaser.Sound.WebAudioSound;
  const from = s.volume;
  const startedAt = performance.now();
  const id = (fades.get(sound) ?? 0) + 1;
  fades.set(sound, id);
  const step = () => {
    if (fades.get(sound) !== id) return;
    const k = Math.min(1, (performance.now() - startedAt) / FADE_MS);
    try {
      s.setVolume(from + (volume - from) * k);
    } catch {
      return;
    }
    if (k < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

/** Starts (or keeps) a looping track; `false` fades the music out. */
export function playMusic(scene: Phaser.Scene, track: MusicChoice | false, volume = PLAY_VOLUME): void {
  if (track === false) {
    stopMusic();
    return;
  }
  const key = keyOf(track);
  wanted = key;
  gain = typeof track === 'string' ? 1 : track.gain ?? 1;
  volume *= gain;
  baseVolume = volume;
  if (currentKey === key && current?.isPlaying) {
    fadeTo(current, volume);
    return;
  }
  const start = () => {
    if (wanted !== key || !scene.sys.isActive()) return;
    const old = current;
    if (old) fadeTo(old, 0, () => old.destroy());
    try {
      current = scene.sound.add(key, { loop: true, volume: 0 });
      currentKey = key;
      current.play();
      fadeTo(current, volume);
    } catch {
      /* audio context locked; the next scene tries again */
    }
  };
  if (scene.cache.audio.exists(key)) {
    start();
    return;
  }
  if (typeof track === 'string') {
    const base = ASSET_ROOT + 'oga/junkala-music/' + TRACKS[track];
    scene.load.audio(key, [base + '.ogg', base + '.mp3']);
  } else scene.load.audio(key, ASSET_ROOT + track.file);
  scene.load.once(`filecomplete-audio-${key}`, start);
  if (!scene.load.isLoading()) scene.load.start();
}

/** Fades the music out and stops it. */
export function stopMusic(): void {
  wanted = '';
  const old = current;
  current = null;
  currentKey = '';
  if (old) fadeTo(old, 0, () => old.destroy());
}

/** Lowers the music under an overlay (pause, result screen); restoreMusic() brings it back. */
export function duckMusic(): void {
  if (current) fadeTo(current, DUCKED * gain);
}

export function restoreMusic(): void {
  if (current) fadeTo(current, baseVolume);
}

export const MUSIC_VOLUME = { menu: MENU_VOLUME, play: PLAY_VOLUME };
