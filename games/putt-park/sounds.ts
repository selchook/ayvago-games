// Two sounds the CC0 packs do not have, synthesised once at start-up into Phaser's audio cache
// (so they follow the mute switch like any loaded sound):
//   'roll'     a seamless rumble of a ball rolling on felt (looped, its level follows the speed)
//   'applause' a short burst of clapping for a hole in one
import Phaser from 'phaser';

function rollBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate, n = Math.floor(rate * 2);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  let lp1 = 0, lp2 = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    lp1 += 0.06 * (w - lp1);
    lp2 += 0.08 * (lp1 - lp2);
    hp += 0.004 * (lp2 - hp);
    // a faint flutter, like the seams of the felt
    const flutter = 0.85 + 0.15 * Math.sin((i / rate) * Math.PI * 2 * 23);
    d[i] = (lp2 - hp) * 9 * flutter;
  }
  // seamless loop: crossfade the ends
  const fade = Math.floor(rate * 0.25);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[n - fade + i] * (1 - k);
  }
  const out = ctx.createBuffer(1, n - fade, rate);
  out.getChannelData(0).set(d.subarray(0, n - fade));
  return out;
}

function applauseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate, secs = 2.4, n = Math.floor(rate * secs);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // many hands: short filtered noise clicks at random times, swelling then fading
    for (let k = 0; k < 900; k++) {
      const t0 = Math.pow(Math.random(), 1.4) * (secs - 0.1);
      const env = Math.min(1, t0 / 0.15) * Math.exp(-Math.max(0, t0 - 0.6) * 1.6);
      const start = Math.floor(t0 * rate), len = Math.floor(rate * (0.008 + Math.random() * 0.01));
      const amp = (0.25 + Math.random() * 0.35) * env;
      let lp = 0;
      for (let i = 0; i < len && start + i < n; i++) {
        lp += 0.5 * (Math.random() * 2 - 1 - lp);
        d[start + i] += lp * amp * Math.exp(-i / (len * 0.35));
      }
    }
  }
  return buf;
}

export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('roll')) return;
  try {
    game.cache.audio.add('roll', rollBuffer(ctx));
    game.cache.audio.add('applause', applauseBuffer(ctx));
  } catch {
    /* no Web Audio: no rolling sound */
  }
}
