// Last Convoy: the sounds the CC0 packs do not have, synthesised once at start-up into audio buffers
// and added to Phaser's audio cache, so they play like any loaded sound and follow the mute switch:
// zombie groans (three voices), the bosses' roar, the dog's bark and whimper, and the low-health
// heartbeat. Everything else comes from Juhani Junkala's CC0 effects and Kenney (main.ts).
import Phaser from 'phaser';

function buffer(ctx: BaseAudioContext, seconds: number, fn: (t: number) => number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < n; i++) { d[i] = fn(i / rate); peak = Math.max(peak, Math.abs(d[i])); }
  if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.85 / peak;
  return buf;
}

function noise(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}

/** A throaty moan: a buzzing source through a slowly opening low-pass, with breath. */
function groan(ctx: BaseAudioContext, seconds: number, f0: number, f1: number, open: number, seed: number): AudioBuffer {
  let ph = 0, lp1 = 0, lp2 = 0;
  const rnd = noise(seed);
  const rate = ctx.sampleRate;
  return buffer(ctx, seconds, (t) => {
    const u = t / seconds;
    const f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * 5.5) * 4 + Math.sin(t * 2 * Math.PI * 1.7) * 6;
    ph += f / rate;
    const saw = (ph % 1) * 2 - 1;
    const pulse = (ph % 1) < 0.3 ? 1 : -0.4;
    const src = saw * 0.6 + pulse * 0.4 + rnd() * 0.35;
    const cut = 0.025 + open * Math.sin(Math.PI * Math.min(1, u * 1.2)) ** 1.5;
    lp1 += cut * (src - lp1);
    lp2 += cut * 1.4 * (lp1 - lp2);
    const env = Math.min(1, t / 0.08) * Math.min(1, (seconds - t) / 0.25);
    return Math.tanh(lp2 * 3.2) * env;
  });
}

/** One bark: a short pitched burst with a growl, falling. */
function bark(ctx: BaseAudioContext, f0: number, seed: number): AudioBuffer {
  let ph = 0, lp = 0;
  const rnd = noise(seed);
  const rate = ctx.sampleRate;
  return buffer(ctx, 0.26, (t) => {
    const f = f0 * (1.25 - t * 1.6);
    ph += f / rate;
    const src = Math.sin(ph * Math.PI * 2) * 0.6 + ((ph % 1) * 2 - 1) * 0.4 + rnd() * 0.5;
    lp += 0.25 * (src - lp);
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 11);
    return Math.tanh(lp * 2.5) * env;
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
    game.cache.audio.add('bark', bark(ctx, 520, 7));
    game.cache.audio.add('barkS', bark(ctx, 820, 9));
    game.cache.audio.add('whimper', buffer(ctx, 0.5, (t) => Math.sin(2 * Math.PI * (900 - t * 500) * t) * Math.exp(-t * 6) * Math.min(1, t / 0.02)));
    game.cache.audio.add('heartbeat', buffer(ctx, 0.75, (t) => {
      const thump = (t0: number, f: number, a: number) => { const x = t - t0; if (x < 0) return 0; return Math.sin(2 * Math.PI * f * x * (1 - x * 1.5)) * Math.exp(-x * 26) * a; };
      return Math.tanh((thump(0, 58, 1) + thump(0.2, 50, 0.75)) * 1.6);
    }));
  } catch {
    /* no Web Audio: the game simply has no groans */
  }
}
