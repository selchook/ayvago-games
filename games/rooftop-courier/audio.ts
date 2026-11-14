// Rooftop Courier: the looping and made-up sounds. The zip-line's cable hum is cut from a Kenney
// Foley metal slide (its steady middle, the ends cross-faded so the loop has no seam), the wind
// and the city's evening murmur are filtered noise, and the pigeons' wing flutter is noise
// chopped into quick beats. They go into Phaser's audio cache and play like loaded sounds, so
// they follow the mute switch.
import Phaser from 'phaser';

function loopFrom(ctx: BaseAudioContext, src: AudioBuffer, from: number, to: number, fade: number, lowpass = 0): AudioBuffer {
  const rate = src.sampleRate;
  const a = Math.floor(from * rate), b = Math.min(src.length, Math.floor(to * rate));
  const f = Math.floor(fade * rate);
  const n = Math.max(1, b - a - f);
  const out = ctx.createBuffer(src.numberOfChannels, n, rate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const s = src.getChannelData(ch), d = out.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = s[a + i] ?? 0;
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = (s[a + i] ?? 0) * k + (s[a + n + i] ?? 0) * (1 - k); }
    if (lowpass > 0) { let y = d[n - 1]; for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { y += lowpass * (d[i] - y); d[i] = y; } }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.8 / peak;
  }
  return out;
}

function noise(ctx: BaseAudioContext, seconds: number, shape: (t: number) => number, bright: number, seed = 7, loop = true): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, n, rate);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp1 = 0, lp2 = 0, hp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      lp1 += 0.2 * bright * (rnd() * 2 - 1 - lp1);
      lp2 += 0.25 * bright * (lp1 - lp2);
      hp += 0.01 * (lp2 - hp);
      d[i] = (lp2 - hp) * shape(t) * 3;
    }
    if (loop) {
      const f = Math.floor(rate * 0.3);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    }
  }
  return buf;
}

/** Builds the loops once (needs the Foley metal slide loaded as zip-src). */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  const cache = game.cache.audio;
  if (!ctx || cache.exists('zip-loop')) return;
  try {
    const zip = cache.get('zip-src') as AudioBuffer | undefined;
    if (zip?.getChannelData) cache.add('zip-loop', loopFrom(ctx, zip, 0.1, Math.min(zip.duration - 0.05, 0.62), 0.12));
    cache.add('wind-loop', noise(ctx, 3, (t) => 0.7 + 0.3 * Math.sin(t * 2.1), 0.9, 11));
    cache.add('city-loop', noise(ctx, 5, (t) => 0.55 + 0.25 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 3.7), 0.35, 23));
    // wings: quick beats of bright noise, fading
    cache.add('flutter', noise(ctx, 0.9, (t) => Math.max(0, Math.sin(t * 2 * Math.PI * 13)) ** 2 * Math.exp(-t * 2.4), 1.4, 5, false));
  } catch {
    /* no Web Audio: no loops */
  }
}

/** A looping sound whose level and pitch the game sets every frame. */
export class Loop {
  private snd: Phaser.Sound.WebAudioSound | null = null;
  private vol = 0;
  private rate = 1;

  constructor(private scene: Phaser.Scene, key: string) {
    if (!scene.cache.audio.exists(key)) return;
    try {
      this.snd = scene.sound.add(key, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
      this.snd.play();
    } catch {
      this.snd = null;
    }
    const onPause = () => this.snd?.pause(), onResume = () => { if (this.snd?.isPaused) this.snd.resume(); };
    scene.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    scene.events.on(Phaser.Scenes.Events.RESUME, onResume);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      scene.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.snd?.destroy();
      this.snd = null;
    });
  }

  set(volume: number, rate: number, dt: number, k = 10): void {
    if (!this.snd) return;
    this.vol += (volume - this.vol) * Math.min(1, dt * k);
    this.rate += (rate - this.rate) * Math.min(1, dt * k);
    this.snd.setVolume(Math.max(0, this.vol));
    this.snd.setRate(Math.max(0.3, this.rate));
  }
}
