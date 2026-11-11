// The sea under the ship and the storm wind, synthesised at start-up: the CC0 packs have no ocean
// ambience, so two seamless noise loops are made into audio buffers and added to Phaser's audio
// cache, where they play like loaded sounds (and follow the mute switch).
import Phaser from 'phaser';

function loop(ctx: BaseAudioContext, seconds: number, fill: (d: Float32Array, rate: number) => void): AudioBuffer {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  fill(d, rate);
  // crossfade the ends so the loop has no click
  const fade = Math.floor(rate * 0.3);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[n - fade + i] * (1 - k);
  }
  const out = ctx.createBuffer(1, n - fade, rate);
  out.getChannelData(0).set(d.subarray(0, n - fade));
  return out;
}

/** Adds 'sea' (slow swells of surf) and 'wind' (a howling storm) to the audio cache. */
export function makeSeaSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx) return;
  try {
    if (!game.cache.audio.exists('sea')) {
      game.cache.audio.add('sea', loop(ctx, 8.3, (d, rate) => {
        let lp1 = 0, lp2 = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          lp1 += 0.05 * (w - lp1);
          lp2 += 0.08 * (lp1 - lp2);
          const t = i / rate;
          // two overlapping swells: waves washing along the hull
          const swell = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.76 * Math.PI * 2 / 2.3), 2) * (0.6 + 0.4 * Math.sin(t * 0.37 * Math.PI * 2 / 2.3 + 1));
          d[i] = lp2 * 4.2 * swell;
        }
      }));
    }
    if (!game.cache.audio.exists('wind')) {
      game.cache.audio.add('wind', loop(ctx, 6.4, (d, rate) => {
        let bp = 0, lp = 0, f = 0.04;
        for (let i = 0; i < d.length; i++) {
          const t = i / rate;
          // a gust filter that sweeps up and down: the wind's howl
          f = 0.025 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.9 + Math.sin(t * 0.31) * 2));
          const w = Math.random() * 2 - 1;
          lp += f * (w - lp);
          bp += f * (lp - bp);
          d[i] = (lp - bp) * 9 * (0.5 + 0.5 * Math.sin(t * 0.5) ** 2);
        }
      }));
    }
  } catch {
    /* no Web Audio: a silent sea */
  }
}

/** A looping ambience whose level follows the game (fades, pauses and stops with the scene). */
export class Ambience {
  private snd: Phaser.Sound.WebAudioSound | null = null;
  private target = 0;

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

  set(volume: number, rate = 1): void {
    this.target = volume;
    if (!this.snd) return;
    this.snd.volume += (this.target - this.snd.volume) * 0.05;
    this.snd.setRate(rate);
  }
}
