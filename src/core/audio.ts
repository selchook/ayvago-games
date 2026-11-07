import Phaser from 'phaser';
import { storage } from './storage';

// One sound switch. The player's sound button in the game and, inside Ayvago, the toolbar's sound
// button on the platform page are the same switch (protocol 2.5): the platform's GHA_MUTE sets it,
// and a change made in the game is reported back with GHA_MUTE_STATE. It is kept in the game's
// storage, so the choice carries over between visits.
let muted = storage.get<boolean>('muted', false);
const listeners = new Set<(m: boolean) => void>();
let reporter: ((m: boolean) => void) | null = null;

export function isMuted(): boolean {
  return muted;
}

/** True when nothing should be heard. */
export function isSilenced(): boolean {
  return muted;
}

/**
 * Sets the switch. `from: 'host'` is a change made on the platform page; it is not reported back,
 * so the two sides never echo each other.
 */
export function setMuted(game: Phaser.Game, m: boolean, from: 'player' | 'host' = 'player'): void {
  const changed = muted !== m;
  muted = m;
  storage.set('muted', m);
  game.sound.mute = m;
  if (changed) listeners.forEach((cb) => cb(m));
  if (from === 'player') reporter?.(m);
}

/** Called on every change of the switch (sound buttons keep their icon in step). */
export function onMuteChange(cb: (m: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The platform hook: launch() passes the adapter's reportMute here. */
export function setMuteReporter(fn: ((m: boolean) => void) | null): void {
  reporter = fn;
}

export type SfxConfig = Phaser.Types.Sound.SoundConfig & {
  /** Play exactly at the given pitch and volume (jingles, musical notes). */
  exact?: boolean;
  /** World x of the source: pans the sound left or right. */
  x?: number;
};

// Every effect gets a slightly different pitch and level, so repeats (hits, coins, bounces) do not
// sound like a machine gun of identical samples. A sound with an explicit rate (a musical note)
// keeps it.
const PITCH_JITTER = 0.04;
const VOLUME_JITTER = 0.12;
// The same effect twice within this window is one event (a pile of collisions in one frame).
const MIN_GAP_MS = 28;
// At most this many copies of one effect at once; the oldest stops first.
const MAX_VOICES = 4;
const PAN_WIDTH = 0.6;

const lastPlayed = new Map<string, number>();
const voices = new Map<string, Phaser.Sound.BaseSound[]>();

/** Plays a loaded sound if it exists; silently ignores missing keys. */
export function playSfx(scene: Phaser.Scene, key: string, config: SfxConfig = {}): void {
  if (isSilenced() || !scene.cache.audio.exists(key)) return;
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -Infinity) < MIN_GAP_MS) return;
  lastPlayed.set(key, now);

  const { exact, x, ...sound } = config;
  if (!exact) {
    if (sound.rate === undefined) sound.rate = 1 + (Math.random() * 2 - 1) * PITCH_JITTER;
    sound.volume = (sound.volume ?? 1) * (1 - Math.random() * VOLUME_JITTER);
  }
  if (x !== undefined && scene.scale.width > 0) {
    sound.pan = Phaser.Math.Clamp((x / scene.scale.width) * 2 - 1, -1, 1) * PAN_WIDTH;
  }
  try {
    const playing = (voices.get(key) ?? []).filter((v) => v.isPlaying);
    while (playing.length >= MAX_VOICES) playing.shift()?.stop();
    const voice = scene.sound.add(key, sound);
    const release = () => {
      const list = voices.get(key);
      if (list) voices.set(key, list.filter((v) => v !== voice));
      voice.destroy();
    };
    voice.once(Phaser.Sound.Events.COMPLETE, release);
    voice.once(Phaser.Sound.Events.STOP, release);
    playing.push(voice);
    voices.set(key, playing);
    voice.play();
  } catch {
    /* audio context locked */
  }
}

/**
 * Master bus: a gentle compressor between Phaser's master volume and the speakers. It glues the
 * effects together and stops stacked sounds from clipping (Web Audio only; HTML5 audio is left
 * as it is).
 */
export function installMasterBus(game: Phaser.Game): void {
  const manager = game.sound as Phaser.Sound.WebAudioSoundManager;
  const context = manager.context;
  const master = manager.masterVolumeNode;
  if (!context || !master) return;
  try {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    master.disconnect();
    master.connect(compressor);
    compressor.connect(context.destination);
    master.gain.value = 0.9;
  } catch {
    /* keep Phaser's default chain */
  }
}
