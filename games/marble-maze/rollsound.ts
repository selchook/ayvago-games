// The marble's rolling rumble, synthesised at start-up: the CC0 packs have no rolling sound, so a
// low, gritty noise loop is made into an audio buffer and added to Phaser's audio cache. It
// plays like any loaded sound (and follows the mute switch); its level and pitch follow the speed.
import Phaser from 'phaser';
import { isMuted } from '@core';

/** Adds 'roll' (a seamless 2 s loop) to the audio cache. */
export function makeRollSound(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('roll')) return;
  try {
    const rate = ctx.sampleRate, n = Math.floor(rate * 2);
    const buf = ctx.createBuffer(1, n, rate);
    const d = buf.getChannelData(0);
    let lp1 = 0, lp2 = 0, hp = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      lp1 += 0.09 * (w - lp1);
      lp2 += 0.12 * (lp1 - lp2);
      hp += 0.004 * (lp2 - hp);
      // the grain of the board: small irregular ticks under the rumble
      const tick = Math.random() < 0.0016 ? (Math.random() * 2 - 1) * 0.6 : 0;
      d[i] = (lp2 - hp) * 3.2 + tick * Math.exp(-((i % 97) / 12));
    }
    // crossfade the ends so the loop has no click
    const fade = Math.floor(rate * 0.15);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
    const out = ctx.createBuffer(1, n - fade, rate);
    out.getChannelData(0).set(d.subarray(0, n - fade));
    game.cache.audio.add('roll', out);
  } catch {
    /* no Web Audio: the marble rolls silently */
  }
}

/** The rolling loop of a scene: `set(speed, surface)` every frame. */
export class RollLoop {
  private snd: Phaser.Sound.WebAudioSound | null = null;

  constructor(scene: Phaser.Scene) {
    if (!scene.cache.audio.exists('roll')) return;
    try {
      this.snd = scene.sound.add('roll', { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
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

  /** Speed in cells/s; `kind` shapes the sound (ice rings higher, sand and snow are dull). */
  set(speed: number, kind: 'floor' | 'ice' | 'sand' | 'air' | 'wood'): void {
    if (!this.snd) return;
    const v = kind === 'air' || isMuted() ? 0 : Math.min(1, speed / 6);
    const vol = v * (kind === 'sand' ? 0.35 : kind === 'ice' ? 0.45 : 0.75);
    this.snd.volume += (vol - this.snd.volume) * 0.25;
    const pitch = (kind === 'ice' ? 1.5 : kind === 'sand' ? 0.6 : kind === 'wood' ? 0.85 : 1) * (0.7 + v * 0.6);
    this.snd.setRate(pitch);
  }
}
