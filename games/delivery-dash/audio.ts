// Delivery Dash: sounds made at start-up with Web Audio (no files): a two-tone horn, a doorbell
// (ding-dong), the cash register's "ka-ching" for tips, a tyre screech loop, rain and a town
// ambience loop (distant traffic, birds). They go into Phaser's audio cache and play like loaded
// sounds, so they follow the mute switch. Loop is a looping sound whose level and pitch the scene
// eases every frame (the engine follows the van's speed).
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

/** A cheerful two-tone van horn (two square-ish tones, a little buzz). */
function horn(ctx: Ctx): AudioBuffer {
  return buffer(ctx, 0.42, (t) => {
    const env = Math.min(1, t / 0.015) * Math.min(1, (0.42 - t) / 0.05);
    let v = 0;
    for (const f of [392, 494]) {
      const p = (t * f) % 1;
      v += (p < 0.5 ? 1 : -1) * 0.35 + Math.sin(t * Math.PI * 2 * f) * 0.4;
    }
    return Math.tanh(v * 1.2) * env;
  });
}

/** A bell tone. */
function bell(t: number, f: number, decay = 3.5): number {
  if (t < 0) return 0;
  const e = Math.exp(-t * decay);
  return (Math.sin(t * Math.PI * 2 * f) + 0.4 * Math.sin(t * Math.PI * 2 * f * 2.0) * Math.exp(-t * 2) + 0.18 * Math.sin(t * Math.PI * 2 * f * 3.01) * Math.exp(-t * 6)) * e * Math.min(1, t / 0.003);
}

/** The doorbell: ding-dong. */
function doorbell(ctx: Ctx): AudioBuffer {
  return buffer(ctx, 1.6, (t) => bell(t, 784, 2.6) + bell(t - 0.42, 622, 2.2));
}

/** The till: a bright bell and a drawer of rattling coins. */
function till(ctx: Ctx): AudioBuffer {
  const rnd = noise(31);
  const hits: { t: number; f: number }[] = [];
  for (let i = 0; i < 14; i++) hits.push({ t: 0.08 + Math.abs(rnd()) * 0.32, f: 3200 + Math.abs(rnd()) * 2600 });
  let lp = 0;
  return buffer(ctx, 0.9, (t) => {
    let v = bell(t - 0.02, 1568, 5) * 0.8 + bell(t - 0.09, 2093, 5) * 0.6;
    for (const h of hits) {
      const d = t - h.t;
      if (d < 0 || d > 0.12) continue;
      v += Math.sin(d * Math.PI * 2 * h.f) * Math.exp(-d * 40) * 0.5;
    }
    // the drawer's thunk
    const d0 = t - 0.06;
    if (d0 > 0 && d0 < 0.12) { lp += 0.1 * (rnd() - lp); v += lp * 3 * Math.exp(-d0 * 30); }
    return v;
  });
}

/** Tyre screech: a squealing band of noise with a wobble (a loop). */
function screech(ctx: Ctx): AudioBuffer {
  const rnd = noise(7);
  let b1 = 0, b2 = 0;
  const len = 1;
  return buffer(ctx, len, (t) => {
    const f = 0.38 + Math.sin(t * Math.PI * 2 * 3) * 0.03 + Math.sin(t * Math.PI * 2 * 7) * 0.015;
    // a resonant two-pole band-pass around ~2.4 kHz
    const x = rnd();
    const y = x + 1.9 * Math.cos(f) * b1 * 0.985 - 0.97 * b2;
    b2 = b1; b1 = y;
    const tone = Math.sin(t * Math.PI * 2 * 1650 * (1 + Math.sin(t * Math.PI * 2 * 5) * 0.02)) * 0.6;
    const edge = Math.min(1, t / 0.02, (len - t) / 0.02);
    return (y * 0.05 + tone) * (0.85 + 0.15 * edge);
  }, 2, 0.7);
}

/** Rain: a soft hiss with drips (a loop). */
function rain(ctx: Ctx): AudioBuffer {
  const rnd = noise(91);
  let lp = 0, lp2 = 0;
  const drips: number[] = [];
  for (let i = 0; i < 40; i++) drips.push(Math.abs(rnd()) * 2);
  return buffer(ctx, 2, (t, _i, ch) => {
    const w = rnd();
    lp += 0.35 * (w - lp);
    lp2 += 0.05 * (w - lp2);
    let v = (w - lp) * 0.5 + lp2 * 0.6;
    for (let k = ch; k < drips.length; k += 2) { const d = t - drips[k]; if (d > 0 && d < 0.03) v += Math.sin(d * 9000) * Math.exp(-d * 200) * 0.6; }
    return v;
  });
}

/** A small town far off: traffic rumble, a car passing now and then, birds (a loop). */
function town(ctx: Ctx): AudioBuffer {
  const rnd = noise(55);
  let lp = 0, lp2 = 0;
  const len = 6;
  const chirps: { t: number; f: number }[] = [];
  for (let i = 0; i < 9; i++) chirps.push({ t: Math.abs(rnd()) * (len - 0.5), f: 2600 + Math.abs(rnd()) * 1800 });
  return buffer(ctx, len, (t, _i, ch) => {
    const w = rnd();
    lp += 0.02 * (w - lp);
    lp2 += 0.004 * (w - lp2);
    // a passing car swells (seamless over the loop)
    const pass = Math.pow(Math.sin(Math.PI * t / len), 2) * (ch ? 0.7 : 1) + Math.pow(Math.sin(Math.PI * ((t + len / 2) % len) / len), 8) * (ch ? 1 : 0.6);
    let v = lp * 3 * (0.6 + pass * 0.6) + lp2 * 6;
    for (const c of chirps) {
      const d = t - c.t;
      if (d < 0 || d > 0.35) continue;
      const k = Math.floor(d / 0.07);
      const dd = d - k * 0.07;
      if (dd < 0.05) v += Math.sin(dd * Math.PI * 2 * (c.f + dd * 9000)) * Math.sin(dd / 0.05 * Math.PI) * 0.12;
    }
    return v;
  }, 2, 0.6);
}

/** Builds the sounds once. */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  const cache = game.cache.audio;
  if (!ctx || cache.exists('dd-horn')) return;
  try {
    cache.add('dd-horn', horn(ctx));
    cache.add('dd-doorbell', doorbell(ctx));
    cache.add('dd-till', till(ctx));
    cache.add('dd-screech', screech(ctx));
    cache.add('dd-rain', rain(ctx));
    cache.add('dd-town', town(ctx));
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

  stop(): void { this.snd?.stop(); }
}
