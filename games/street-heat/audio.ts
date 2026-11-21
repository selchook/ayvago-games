// Street Heat: sounds made at start-up with Web Audio (no files): the car horn, a police siren
// (a wail that loops), a tyre squeal loop and the city's hum at night. They go into Phaser's audio
// cache and play like loaded sounds, so they follow the mute switch. Loop is a looping sound whose
// level and pitch the scene eases every frame (the engine follows the revs, the siren the nearest
// police car).
import Phaser from 'phaser';

type Ctx = BaseAudioContext;

function buffer(ctx: Ctx, seconds: number, fill: (t: number, i: number, ch: number) => number, channels = 2, level = 0.85): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const b = ctx.createBuffer(channels, n, rate);
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = fill(i / rate, i, ch);
  }
  let peak = 0;
  for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); }
  if (peak > 0) for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= level / peak; }
  return b;
}

function noise(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}

/** A big American-style horn: two detuned buzzy tones. */
function horn(ctx: Ctx): AudioBuffer {
  return buffer(ctx, 0.5, (t) => {
    const env = Math.min(1, t / 0.02) * Math.min(1, (0.5 - t) / 0.06);
    let v = 0;
    for (const f of [311, 370]) {
      const p = (t * f) % 1;
      v += (p < 0.5 ? 1 : -1) * 0.3 + (2 * p - 1) * 0.25 + Math.sin(t * Math.PI * 2 * f) * 0.35;
    }
    return Math.tanh(v * 1.4) * env;
  });
}

/** The siren: a wail rising and falling (4 s, loops seamlessly). */
function siren(ctx: Ctx): AudioBuffer {
  let ph = 0;
  const rate = ctx.sampleRate;
  return buffer(ctx, 4, (t) => {
    const k = 0.5 - 0.5 * Math.cos((t / 4) * Math.PI * 2 * 2);
    const f = 640 + k * 760;
    ph += f / rate;
    const s = Math.sin(ph * Math.PI * 2);
    return Math.tanh((s + 0.3 * Math.sin(ph * Math.PI * 4)) * 1.6);
  }, 2, 0.6);
}

/** Tyre squeal: a resonant band of noise with a wobbling tone (a loop). */
function squeal(ctx: Ctx): AudioBuffer {
  const rnd = noise(7);
  let b1 = 0, b2 = 0;
  return buffer(ctx, 1, (t) => {
    const f = 0.42 + Math.sin(t * Math.PI * 2 * 3) * 0.03;
    const x = rnd();
    const y = x + 1.9 * Math.cos(f) * b1 * 0.985 - 0.97 * b2;
    b2 = b1; b1 = y;
    const tone = Math.sin(t * Math.PI * 2 * 1500 * (1 + Math.sin(t * Math.PI * 2 * 6) * 0.02)) * 0.6;
    return y * 0.05 + tone;
  }, 2, 0.6);
}

/** The city at night: a low rumble of traffic far off (a loop). */
function city(ctx: Ctx): AudioBuffer {
  const rnd = noise(55);
  let lp = 0, lp2 = 0;
  const len = 6;
  return buffer(ctx, len, (t, _i, ch) => {
    const w = rnd();
    lp += 0.02 * (w - lp);
    lp2 += 0.004 * (w - lp2);
    const pass = Math.pow(Math.sin(Math.PI * t / len), 2) * (ch ? 0.7 : 1) + Math.pow(Math.sin(Math.PI * ((t + len / 2) % len) / len), 8) * (ch ? 1 : 0.6);
    return lp * 3 * (0.6 + pass * 0.6) + lp2 * 6;
  }, 2, 0.5);
}

/** Builds the sounds once per game. */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  const cache = game.cache.audio;
  if (!ctx || cache.exists('sh-horn')) return;
  try {
    cache.add('sh-horn', horn(ctx));
    cache.add('sh-siren', siren(ctx));
    cache.add('sh-squeal', squeal(ctx));
    cache.add('sh-city', city(ctx));
  } catch {
    /* no Web Audio: no synthesized sounds */
  }
}

/** A looping sound whose level and pitch the game sets every frame. */
export class Loop {
  private snd: Phaser.Sound.WebAudioSound | null = null;
  private vol = 0;
  private rate = 1;

  constructor(scene: Phaser.Scene, key: string) {
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
  set(volume: number, rate: number, dt: number, k = 6): void {
    if (!this.snd) return;
    this.vol += (volume - this.vol) * Math.min(1, dt * k);
    this.rate += (rate - this.rate) * Math.min(1, dt * k);
    this.snd.setVolume(Math.max(0, this.vol));
    this.snd.setRate(Math.max(0.3, this.rate));
  }
}
