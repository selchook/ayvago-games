// Coaster Rush: the ride's looping sounds, made once at start: the wheels' roar on the rails
// (rumbling filtered noise with a steady rattle), the wind at speed (bright filtered noise), the
// chain lift's clack (sharp ticks), and a crowd's "wheee" for drops (a breathy rising sweep). They
// go into Phaser's audio cache and play like loaded sounds, so they follow the mute switch.
import Phaser from 'phaser';

function buffer(ctx: BaseAudioContext, seconds: number, fill: (d: Float32Array[], rate: number) => void, loop = true): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, n, rate);
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  fill(chans, rate);
  for (const d of chans) {
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.85 / peak;
    if (loop) {
      const f = Math.floor(rate * 0.25);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    }
  }
  return buf;
}

function rnd(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
}

export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  const cache = game.cache.audio;
  if (!ctx || cache.exists('roll-loop')) return;
  try {
    // wheels: low rumble and a rattle at the rail joints
    cache.add('roll-loop', buffer(ctx, 2.4, (ch, rate) => {
      for (let c = 0; c < 2; c++) {
        const r = rnd(11 + c);
        let lp = 0, lp2 = 0;
        const d = ch[c];
        for (let i = 0; i < d.length; i++) {
          const t = i / rate;
          lp += 0.05 * (r() - lp);
          lp2 += 0.3 * (r() - lp2);
          const joint = Math.exp(-((t * 6) % 1) * 30) * 0.8;
          d[i] = lp * 2.2 + lp2 * 0.25 * (0.4 + joint);
        }
      }
    }));
    cache.add('wind-loop', buffer(ctx, 3, (ch, rate) => {
      for (let c = 0; c < 2; c++) {
        const r = rnd(23 + c);
        let a = 0, b = 0, hp = 0;
        const d = ch[c];
        for (let i = 0; i < d.length; i++) {
          const t = i / rate;
          a += 0.25 * (r() - a); b += 0.3 * (a - b); hp += 0.02 * (b - hp);
          d[i] = (b - hp) * (0.75 + 0.25 * Math.sin(t * 2.3 + c));
        }
      }
    }));
    // the chain: a tick every 1/9 s, a metallic ring on each
    cache.add('chain-loop', buffer(ctx, 2, (ch, rate) => {
      for (let c = 0; c < 2; c++) {
        const r = rnd(5 + c);
        const d = ch[c];
        for (let i = 0; i < d.length; i++) {
          const t = i / rate;
          const ph = (t * 9) % 1;
          const env = Math.exp(-ph * 60);
          d[i] = env * (r() * 0.6 + Math.sin(t * 2 * Math.PI * 1900) * 0.5 + Math.sin(t * 2 * Math.PI * 3100) * 0.25);
        }
      }
    }));
    // "wheee": breathy noise through a rising then falling band, a crowd's worth of voices
    cache.add('wheee', buffer(ctx, 1.6, (ch, rate) => {
      for (let c = 0; c < 2; c++) {
        const r = rnd(41 + c);
        const d = ch[c];
        let y1 = 0, y2 = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / rate;
          const f = 700 + 900 * Math.sin(Math.min(1, t / 1.2) * Math.PI * 0.85);
          const w = 2 * Math.PI * f / rate, q = 0.06;
          const x = r() + Math.sin(t * 2 * Math.PI * f * (1 + 0.01 * c)) * 0.6;
          // a resonant band-pass (two-pole)
          const y = x * q + y1 * 2 * Math.cos(w) * (1 - q) - y2 * (1 - q) * (1 - q);
          y2 = y1; y1 = y;
          const env = Math.min(1, t * 6) * Math.max(0, 1 - Math.max(0, t - 1.0) / 0.6);
          d[i] = y * env;
        }
      }
    }, false));
    // a crowd cheering at a station: many short bursts of bright noise
    cache.add('cheer', buffer(ctx, 1.8, (ch, rate) => {
      for (let c = 0; c < 2; c++) {
        const r = rnd(77 + c);
        const d = ch[c];
        let a = 0, b = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / rate;
          a += 0.4 * (r() - a); b += 0.5 * (a - b);
          const flutter = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * (7 + c)) * Math.sin(t * 2 * Math.PI * 3.3);
          const env = Math.min(1, t * 5) * Math.max(0, 1 - t / 1.8);
          d[i] = (a - b) * flutter * env;
        }
      }
    }, false));
  } catch {
    /* no Web Audio: no loops */
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

  set(volume: number, rate: number, dt: number, k = 10): void {
    if (!this.snd) return;
    this.vol += (volume - this.vol) * Math.min(1, dt * k);
    this.rate += (rate - this.rate) * Math.min(1, dt * k);
    this.snd.setVolume(Math.max(0, this.vol));
    this.snd.setRate(Math.max(0.3, this.rate));
  }
}
