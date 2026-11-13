// Kickflip Park: the looping sounds. The wheels' roll and the grind scrapes are cut from Kenney
// Foley recordings at start-up (the steady middle of a drag, its ends cross-faded so the loop has
// no seam; the roll is low-passed into a rumble) and the Timber Yard's crowd murmur and roar are
// filtered noise. They are added to Phaser's audio cache and play like any loaded sound, so they
// follow the mute switch.
import Phaser from 'phaser';

function loopFrom(ctx: BaseAudioContext, src: AudioBuffer, from: number, to: number, fade: number, lowpass = 0): AudioBuffer {
  const rate = src.sampleRate;
  const a = Math.floor(from * rate), b = Math.min(src.length, Math.floor(to * rate));
  const f = Math.floor(fade * rate);
  const n = b - a - f;
  const out = ctx.createBuffer(src.numberOfChannels, n, rate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const s = src.getChannelData(ch), d = out.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = s[a + i];
    // the tail fades over the head
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = s[a + i] * k + s[a + n + i] * (1 - k);
    }
    if (lowpass > 0) {
      let y = d[n - 1];
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { y += lowpass * (d[i] - y); d[i] = y; }
    }
    // even out the level
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.8 / peak;
  }
  return out;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, shape: (t: number) => number, bright: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, n, rate);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp1 = 0, lp2 = 0, hp = 0;
    const a1 = 0.18 * bright, a2 = 0.25 * bright, ah = 0.012;
    const voices = Array.from({ length: 9 }, () => ({ f: 0.6 + rnd() * 2.2, p: rnd() * 6.28 }));
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const w = rnd() * 2 - 1;
      lp1 += a1 * (w - lp1);
      lp2 += a2 * (lp1 - lp2);
      hp += ah * (lp2 - hp);
      let mod = 0;
      for (const v of voices) mod += 0.5 + 0.5 * Math.sin(t * v.f * 6.28 + v.p + ch);
      mod /= voices.length;
      d[i] = (lp2 - hp) * (0.55 + 0.6 * mod) * shape(t) * 2.4;
    }
  }
  return buf;
}

/** Builds the loops once (needs the Foley sounds loaded as roll-src, grind-src, ledge-src). */
export function makeLoops(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  const cache = game.cache.audio;
  if (!ctx || cache.exists('roll-loop')) return;
  try {
    const roll = cache.get('roll-src') as AudioBuffer | undefined;
    if (roll?.getChannelData) cache.add('roll-loop', loopFrom(ctx, roll, 0.35, 1.45, 0.25, 0.08));
    const rail = cache.get('grind-src') as AudioBuffer | undefined;
    if (rail?.getChannelData) cache.add('grind-loop', loopFrom(ctx, rail, 0.12, 0.62, 0.12));
    const ledge = cache.get('ledge-src') as AudioBuffer | undefined;
    if (ledge?.getChannelData) cache.add('ledge-loop', loopFrom(ctx, ledge, 0.35, 1.5, 0.25, 0.3));
    const murmur = noiseBuffer(ctx, 4.4, () => 1, 0.75);
    const fade = Math.floor(ctx.sampleRate * 0.4);
    const n = murmur.length - fade;
    const m2 = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const s = murmur.getChannelData(ch), d = m2.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = s[i];
      for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = s[i] * k + s[n + i] * (1 - k); }
    }
    cache.add('crowd', m2);
    cache.add('roar', noiseBuffer(ctx, 2.6, (t) => Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.5) * 1.3), 1));
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

  /** Eases towards a level and a pitch. */
  set(volume: number, rate: number, dt: number, k = 10): void {
    if (!this.snd) return;
    this.vol += (volume - this.vol) * Math.min(1, dt * k);
    this.rate += (rate - this.rate) * Math.min(1, dt * k);
    this.snd.setVolume(Math.max(0, this.vol));
    this.snd.setRate(Math.max(0.3, this.rate));
  }

  stop(): void { this.snd?.stop(); }
}
