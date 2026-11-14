// Zombie Grove: the sounds the CC0 packs do not have, synthesised once at start-up into audio
// buffers and added to Phaser's audio cache, so they play like any loaded sound and follow the
// mute switch: zombie groans (three voices and a deep boss roar), the low-health heartbeat and the
// campfire's crackle.
import Phaser from 'phaser';

function buffer(ctx: BaseAudioContext, seconds: number, fn: (t: number, i: number) => number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = fn(i / rate, i);
  return buf;
}

/** A throaty moan: a buzzing source through a slowly opening and closing low-pass, with breath. */
function groan(ctx: BaseAudioContext, seconds: number, f0: number, f1: number, open: number, seed: number): AudioBuffer {
  let ph = 0, lp1 = 0, lp2 = 0, s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rate = ctx.sampleRate;
  return buffer(ctx, seconds, (t) => {
    const u = t / seconds;
    const f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * 5.5) * 4 + Math.sin(t * 2 * Math.PI * 1.7) * 6;
    ph += f / rate;
    const saw = (ph % 1) * 2 - 1;
    const pulse = (ph % 1) < 0.3 ? 1 : -0.4;
    const src = saw * 0.6 + pulse * 0.4 + (rnd() * 2 - 1) * 0.35;
    // the "mouth": a low-pass that opens in the middle of the moan
    const cut = 0.025 + open * Math.sin(Math.PI * Math.min(1, u * 1.2)) ** 1.5;
    lp1 += cut * (src - lp1);
    lp2 += cut * 1.4 * (lp1 - lp2);
    const env = Math.min(1, t / 0.08) * Math.min(1, (seconds - t) / 0.25);
    return Math.tanh(lp2 * 3.2) * env * 0.55;
  });
}

/** Adds the synthesised sounds to the audio cache (once per page). */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('groan1')) return;
  try {
    game.cache.audio.add('groan1', groan(ctx, 1.1, 105, 78, 0.07, 11));
    game.cache.audio.add('groan2', groan(ctx, 0.8, 140, 96, 0.09, 23));
    game.cache.audio.add('groan3', groan(ctx, 1.3, 88, 70, 0.06, 37));
    game.cache.audio.add('roar', groan(ctx, 1.9, 70, 44, 0.12, 51));
    // lub-dub
    game.cache.audio.add('heartbeat', buffer(ctx, 0.75, (t) => {
      const thump = (t0: number, f: number, a: number) => {
        const x = t - t0;
        if (x < 0) return 0;
        return Math.sin(2 * Math.PI * f * x * (1 - x * 1.5)) * Math.exp(-x * 26) * a;
      };
      return Math.tanh((thump(0, 58, 1) + thump(0.2, 50, 0.75)) * 1.6) * 0.8;
    }));
    // fire: soft noise with random pops
    let lp = 0, s = 99;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let pop = 0;
    game.cache.audio.add('crackle', buffer(ctx, 0.6, (t) => {
      lp += 0.08 * (rnd() * 2 - 1 - lp);
      if (rnd() < 0.0012) pop = 1;
      pop *= 0.996;
      const env = Math.min(1, t / 0.05) * Math.min(1, (0.6 - t) / 0.15);
      return (lp * 0.5 + (rnd() * 2 - 1) * pop * 0.6) * env;
    }));
  } catch {
    /* no Web Audio: the game simply has no groans */
  }
}
