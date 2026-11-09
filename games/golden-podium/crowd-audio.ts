// Crowd sound, made at start-up: there is no crowd recording in the CC0 packs, so the murmur of
// the stands and the roar of a cheer are synthesised from filtered noise into audio buffers and
// added to Phaser's audio cache. They then play like any loaded sound (and follow the mute switch).
import Phaser from 'phaser';
import { isMuted } from '@core';

function noiseBuffer(ctx: BaseAudioContext, seconds: number, shape: (t: number) => number, bright: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // band-limited noise: two one-pole low-passes minus a slower one (a soft band-pass), with
    // many slow "voices" swelling in and out so it sounds like people rather than wind
    let lp1 = 0, lp2 = 0, hp = 0;
    const a1 = 0.18 * bright, a2 = 0.25 * bright, ah = 0.012;
    const voices = Array.from({ length: 9 }, () => ({ f: 0.6 + Math.random() * 2.2, p: Math.random() * 6.28 }));
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const w = Math.random() * 2 - 1;
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

/** Adds 'crowd' (a seamless 4 s murmur) and 'roar' (a 2.6 s cheer) to the audio cache. */
export function makeCrowdSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('crowd')) return;
  try {
    const loop = 4;
    const murmur = noiseBuffer(ctx, loop, () => 1, 0.75);
    // crossfade the ends so the loop has no click
    const fade = Math.floor(ctx.sampleRate * 0.4);
    for (let ch = 0; ch < 2; ch++) {
      const d = murmur.getChannelData(ch);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = d[i] * k + d[d.length - fade + i] * (1 - k);
      }
    }
    const trimmed = ctx.createBuffer(2, murmur.length - fade, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) trimmed.getChannelData(ch).set(murmur.getChannelData(ch).subarray(0, murmur.length - fade));
    game.cache.audio.add('crowd', trimmed);
    const roar = noiseBuffer(ctx, 2.6, (t) => Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.5) * 1.3), 1);
    game.cache.audio.add('roar', roar);
  } catch {
    /* no Web Audio: the game simply has no crowd */
  }
}

/** The looping murmur of a scene's stands (call `level` to swell it, `stop` on shutdown). */
export class CrowdLoop {
  private snd: Phaser.Sound.BaseSound | null = null;
  private vol = 0.18;

  constructor(private scene: Phaser.Scene) {
    if (!scene.cache.audio.exists('crowd')) return;
    try {
      this.snd = scene.sound.add('crowd', { loop: true, volume: this.vol });
      if (!isMuted()) this.snd.play();
    } catch {
      this.snd = null;
    }
    // the pause overlay and the result screen pause the scene: the stands go quiet with it
    const onPause = () => this.pause(true), onResume = () => this.pause(false);
    scene.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    scene.events.on(Phaser.Scenes.Events.RESUME, onResume);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      scene.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.stop();
    });
  }

  /** Target loudness 0..1 (eased). */
  level(v: number, ms = 600): void {
    if (!this.snd) return;
    const s = this.snd as Phaser.Sound.WebAudioSound;
    if (!s.isPlaying && !isMuted()) s.play();
    this.scene.tweens.add({ targets: s, volume: v, duration: ms });
  }

  pause(on: boolean): void {
    if (!this.snd) return;
    if (on) this.snd.pause();
    else if (this.snd.isPaused) this.snd.resume();
  }

  stop(): void {
    this.snd?.destroy();
    this.snd = null;
  }
}
