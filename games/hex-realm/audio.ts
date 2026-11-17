// Hex Realm: the sounds the CC0 packs do not have, synthesised once at start-up into audio
// buffers and added to Phaser's audio cache (as Skull Isle does), so they play like any loaded
// sound and follow the mute switch: the bosses' roar.
import Phaser from 'phaser';
import type { MusicFile } from '@core';

function buffer(ctx: BaseAudioContext, seconds: number, fn: (t: number, i: number) => number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = fn(i / rate, i);
  return buf;
}

const noise = (seed: number) => {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
};

/** A deep, throaty roar: a buzzing source through a low-pass that opens and closes. */
function roar(ctx: BaseAudioContext, seconds: number, f0: number, f1: number, open: number, seed: number): AudioBuffer {
  let ph = 0, lp1 = 0, lp2 = 0;
  const rnd = noise(seed);
  const rate = ctx.sampleRate;
  return buffer(ctx, seconds, (t) => {
    const u = t / seconds;
    const f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * 5.5) * 4 + Math.sin(t * 2 * Math.PI * 1.7) * 6;
    ph += f / rate;
    const saw = (ph % 1) * 2 - 1;
    const pulse = (ph % 1) < 0.3 ? 1 : -0.4;
    const src = saw * 0.6 + pulse * 0.4 + rnd() * 0.45;
    const cut = 0.025 + open * Math.sin(Math.PI * Math.min(1, u * 1.2)) ** 1.5;
    lp1 += cut * (src - lp1);
    lp2 += cut * 1.4 * (lp1 - lp2);
    const env = Math.min(1, t / 0.08) * Math.min(1, (seconds - t) / 0.3);
    return Math.tanh(lp2 * 3.4) * env * 0.6;
  });
}

/** Adds the synthesised sounds to the audio cache (once per page). */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('bossRoar')) return;
  try {
    game.cache.audio.add('bossRoar', roar(ctx, 1.6, 82, 50, 0.14, 61));
  } catch {
    /* no Web Audio: the game simply has none of these */
  }
}

// 1.2.1: the owner's two tracks, made loop-ready (docs/assets/LICENSES.md): Ancient Echoes on the
// menu and the map, Measured Pulse in every battle. The core loads each the first time it plays and
// cross-fades between them.
export const MAP_MUSIC: MusicFile = { file: 'music/owner/ancient-echoes.mp3', gain: 1.85 };
export const BATTLE_MUSIC: MusicFile = { file: 'music/owner/measured-pulse.mp3', gain: 1.8 };
