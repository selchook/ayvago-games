// Snow Express: the sounds made at start-up with Web Audio (no files): a looping steam chug whose
// rate follows the trains' speed, a three-note steam whistle, sleigh bells for deliveries, a sad
// trombone for a wrong stop and the opening of "Jingle Bells" (J. L. Pierpont, 1857, public
// domain) on bells. They go into Phaser's audio cache and play like loaded sounds, so they follow
// the mute switch. Loop is a looping sound whose level and pitch the scene eases every frame.
import Phaser from 'phaser';

type Ctx = BaseAudioContext;

function buffer(ctx: Ctx, seconds: number, fill: (t: number, i: number, ch: number) => number, channels = 2): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const b = ctx.createBuffer(channels, n, rate);
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = fill(i / rate, i, ch);
  }
  // even out the level
  let peak = 0;
  for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); }
  if (peak > 0) for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= 0.85 / peak; }
  return b;
}

function noise(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}

/** Steam chug: four soft chuffs per loop (a filtered noise burst each) over a low rumble. */
function chug(ctx: Ctx): AudioBuffer {
  const len = 1.2;
  const rnd = noise(11);
  let lp = 0, lp2 = 0, hp = 0;
  return buffer(ctx, len, (t) => {
    const w = rnd();
    lp += 0.22 * (w - lp);
    lp2 += 0.08 * (w - lp2);
    hp += 0.02 * (lp - hp);
    const ph = (t / len) * 4 % 1;
    const accent = Math.floor((t / len) * 4) % 2 === 0 ? 1 : 0.7;
    const env = Math.exp(-ph * 9) * accent;
    const rumble = Math.sin(t * Math.PI * 2 * 55) * 0.08 + lp2 * 0.25;
    return (lp - hp) * env * 1.6 + rumble;
  });
}

/** A steam whistle: three detuned tones with breath, swelling in and fading out. */
function whistle(ctx: Ctx): AudioBuffer {
  const rnd = noise(5);
  let lp = 0;
  return buffer(ctx, 0.9, (t) => {
    const env = Math.min(1, t / 0.06) * Math.min(1, (0.9 - t) / 0.25);
    const bend = 1 + Math.min(0, t - 0.08) * 0.4;
    let v = 0;
    for (const [f, a] of [[622, 0.5], [740, 0.4], [932, 0.3]]) v += Math.sin(t * Math.PI * 2 * f * bend) * a;
    lp += 0.3 * (rnd() - lp);
    return (v * 0.6 + lp * 0.5) * env;
  });
}

/** Sleigh bells: a shower of tiny bright bells. */
function bells(ctx: Ctx): AudioBuffer {
  const rnd = noise(23);
  const hits: { t: number; f: number; a: number }[] = [];
  for (let i = 0; i < 26; i++) hits.push({ t: Math.abs(rnd()) * 0.55 + (i % 3) * 0.02, f: 2600 + Math.abs(rnd()) * 2400, a: 0.4 + Math.abs(rnd()) * 0.6 });
  return buffer(ctx, 1.1, (t) => {
    let v = 0;
    for (const h of hits) {
      const d = t - h.t;
      if (d < 0 || d > 0.4) continue;
      const e = Math.exp(-d * 18) * h.a;
      v += (Math.sin(d * Math.PI * 2 * h.f) + 0.5 * Math.sin(d * Math.PI * 2 * h.f * 2.76)) * e;
    }
    return v;
  });
}

/** A bell tone (for the jingle). */
function bell(t: number, f: number): number {
  if (t < 0) return 0;
  const e = Math.exp(-t * 4.5);
  return (Math.sin(t * Math.PI * 2 * f) + 0.45 * Math.sin(t * Math.PI * 2 * f * 2.01) * Math.exp(-t * 3) + 0.2 * Math.sin(t * Math.PI * 2 * f * 3.98) * Math.exp(-t * 8)) * e * Math.min(1, t / 0.004);
}

/** "Jingle bells, jingle bells, jingle all the way" (the opening, public domain). */
function jingle(ctx: Ctx): AudioBuffer {
  const E = 659.25, G = 783.99, C = 523.25, D = 587.33;
  const beat = 0.17;
  const notes: [number, number][] = [[E, 0], [E, 1], [E, 2], [E, 4], [E, 5], [E, 6], [E, 8], [G, 9], [C, 10], [D, 11.5], [E, 12]];
  return buffer(ctx, 13 * beat + 1, (t) => {
    let v = 0;
    for (const [f, at] of notes) v += bell(t - at * beat, f);
    return v;
  });
}

/** "Wah, wah, wah, waaah": four sliding, wobbling notes going down. */
function trombone(ctx: Ctx): AudioBuffer {
  const notes: [number, number, number][] = [[311, 0, 0.32], [293, 0.34, 0.32], [277, 0.68, 0.32], [262, 1.02, 0.9]];
  let ph = 0;
  return buffer(ctx, 2, (t) => {
    let f = 0, env = 0;
    for (const [nf, at, len] of notes) {
      const d = t - at;
      if (d >= 0 && d < len) {
        const last = len > 0.5;
        f = nf * (1 - d * 0.04) * (last ? 1 + Math.sin(d * 30) * 0.02 * Math.min(1, d * 3) : 1);
        env = Math.min(1, d / 0.04) * Math.min(1, (len - d) / 0.08);
      }
    }
    if (!f) return 0;
    ph += f / ctx.sampleRate;
    // a brassy buzz: a few odd and even harmonics
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(ph * Math.PI * 2 * h) / (h * 0.9);
    return v * env * 0.6;
  });
}

/** Builds the sounds once. */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  const cache = game.cache.audio;
  if (!ctx || cache.exists('se-chug')) return;
  try {
    cache.add('se-chug', chug(ctx));
    cache.add('se-whistle', whistle(ctx));
    cache.add('se-bells', bells(ctx));
    cache.add('se-jingle', jingle(ctx));
    cache.add('se-trombone', trombone(ctx));
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
