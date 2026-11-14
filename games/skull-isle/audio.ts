// Skull Isle: the sounds the CC0 packs do not have, synthesised once at start-up into audio
// buffers and added to Phaser's audio cache, so they play like any loaded sound and follow the
// mute switch: the Kraken's and the captain's roar, the parrot's squawk and water splashes.
import Phaser from 'phaser';

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

/** A parrot's squawk: two rough, falling chirps. */
function squawk(ctx: BaseAudioContext): AudioBuffer {
  let ph = 0, lp = 0;
  const rnd = noise(77);
  const rate = ctx.sampleRate;
  return buffer(ctx, 0.42, (t) => {
    const syl = t < 0.17 ? t / 0.17 : (t - 0.2) / 0.22;
    if (t >= 0.17 && t < 0.2) return 0;
    const f = (t < 0.17 ? 1900 : 1650) - syl * 600 + Math.sin(t * 2 * Math.PI * 70) * 140;
    ph += f / rate;
    const src = Math.sin(ph * 2 * Math.PI) + 0.5 * Math.sin(ph * 4 * Math.PI + 0.3) + rnd() * 0.35;
    lp += 0.45 * (src - lp);
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, syl))) ** 0.6;
    return Math.tanh(lp * 1.8) * env * 0.42;
  });
}

/** A splash: a burst of filtered noise that sinks to a bubbly tail. */
function splash(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  let lp = 0, hp = 0, prev = 0;
  const rnd = noise(seed);
  let bub = 0, bubF = 0, bph = 0;
  const rate = ctx.sampleRate;
  return buffer(ctx, seconds, (t) => {
    const u = t / seconds;
    const n = rnd();
    lp += (0.5 - u * 0.4) * (n - lp);
    hp = lp - prev;
    prev = lp;
    if (Math.random() < 0.0009 && u > 0.2) { bub = 0.5; bubF = 500 + Math.random() * 700; }
    bub *= 0.9993;
    bph += (bubF * (1 + (1 - bub) * 0.6)) / rate;
    const env = Math.min(1, t / 0.01) * Math.exp(-u * 5);
    return Math.tanh((lp * 0.9 + hp * 1.6) * env * 1.4 + Math.sin(bph * 2 * Math.PI) * bub * 0.25) * 0.55;
  });
}

/** Adds the synthesised sounds to the audio cache (once per page). */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('roar')) return;
  try {
    game.cache.audio.add('roar', roar(ctx, 1.9, 70, 44, 0.12, 51));
    game.cache.audio.add('squawk', squawk(ctx));
    game.cache.audio.add('splash', splash(ctx, 0.7, 13));
    game.cache.audio.add('tide', splash(ctx, 1.3, 29));
  } catch {
    /* no Web Audio: the game simply has none of these */
  }
}
