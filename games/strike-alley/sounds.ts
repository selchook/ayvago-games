// Sounds the CC0 packs do not have, synthesised once at start-up into Phaser's audio cache (so
// they follow the mute switch like any loaded sound):
//   'roll'    the deep, seamless rumble of a ball on maple (looped; level and rate follow speed)
//   'crash'   a clatter of many wooden pin knocks (its volume follows how many pins go down)
//   'knock1…3' single pin-on-pin knocks at three pitches
//   'cheer'   the alley's crowd: clapping and a swelling roar
//   'aww'     a short groan for a gutter ball
//   'whir'    the pinsetter's motor
import Phaser from 'phaser';

function loopify(ctx: BaseAudioContext, d: Float32Array, rate: number, fadeS: number): AudioBuffer {
  const n = d.length, fade = Math.floor(rate * fadeS);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[n - fade + i] * (1 - k);
  }
  const out = ctx.createBuffer(1, n - fade, rate);
  out.getChannelData(0).set(d.subarray(0, n - fade));
  return out;
}

function rollBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate, n = Math.floor(rate * 2.4);
  const d = new Float32Array(n);
  let lp1 = 0, lp2 = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    lp1 += 0.035 * (w - lp1);
    lp2 += 0.05 * (lp1 - lp2);
    hp += 0.002 * (lp2 - hp);
    const t = i / rate;
    // the boards' seams tick under the ball, and a low hum
    const seam = 0.8 + 0.2 * Math.sin(t * Math.PI * 2 * 31);
    d[i] = (lp2 - hp) * 14 * seam + Math.sin(t * Math.PI * 2 * 58) * 0.05;
  }
  return loopify(ctx, d, rate, 0.3);
}

/** One wooden knock: a few inharmonic modes and a click, `f` the base pitch. */
function knock(d: Float32Array, rate: number, at: number, f: number, amp: number): void {
  const len = Math.floor(rate * 0.16);
  const start = Math.floor(at * rate);
  const modes = [[1, 1], [2.32, 0.55], [3.9, 0.3], [5.4, 0.15]];
  for (let i = 0; i < len && start + i < d.length; i++) {
    const t = i / rate;
    let s = 0;
    for (const [m, a] of modes) s += Math.sin(t * Math.PI * 2 * f * m) * a * Math.exp(-t * (38 + m * 14));
    s += (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.7;
    d[start + i] += s * amp;
  }
}

function knockBuffer(ctx: BaseAudioContext, f: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(rate * 0.2), rate);
  knock(buf.getChannelData(0), rate, 0, f, 0.8);
  return buf;
}

function crashBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate, secs = 1.6, n = Math.floor(rate * secs);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // the ball's first hit, then a dense clatter thinning out, pins rattling in the pit
    knock(d, rate, 0, 520, 1);
    knock(d, rate, 0.004, 880, 0.7);
    for (let k = 0; k < 70; k++) {
      const t = Math.pow(Math.random(), 2.1) * (secs - 0.2) + 0.01;
      knock(d, rate, t, 600 + Math.random() * 1500, (0.25 + Math.random() * 0.5) * Math.exp(-t * 1.6));
    }
    // a soft thump of the pit cushion
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      lp += 0.02 * ((Math.random() * 2 - 1) - lp);
      d[i] += lp * 3 * Math.exp(-Math.abs(t - 0.35) * 9) * 0.6;
      d[i] *= 0.62;
    }
  }
  return buf;
}

function crowdBuffer(ctx: BaseAudioContext, secs: number, clap: number, shape: (t: number) => number, bright: number): AudioBuffer {
  const rate = ctx.sampleRate, n = Math.floor(rate * secs);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // voices: soft band-passed noise with slow swells
    let lp1 = 0, lp2 = 0, hp = 0;
    const voices = Array.from({ length: 7 }, () => ({ f: 0.5 + Math.random() * 2, p: Math.random() * 6.28 }));
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const w = Math.random() * 2 - 1;
      lp1 += 0.16 * bright * (w - lp1);
      lp2 += 0.22 * bright * (lp1 - lp2);
      hp += 0.01 * (lp2 - hp);
      let mod = 0;
      for (const v of voices) mod += 0.5 + 0.5 * Math.sin(t * v.f * 6.28 + v.p + ch);
      d[i] = (lp2 - hp) * (0.5 + 0.6 * mod / voices.length) * shape(t) * 2.2;
    }
    // claps
    for (let k = 0; k < clap; k++) {
      const t0 = Math.pow(Math.random(), 1.3) * (secs - 0.1);
      const env = shape(t0);
      const start = Math.floor(t0 * rate), len = Math.floor(rate * (0.008 + Math.random() * 0.01));
      const amp = (0.2 + Math.random() * 0.3) * env;
      let lp = 0;
      for (let i = 0; i < len && start + i < n; i++) {
        lp += 0.5 * (Math.random() * 2 - 1 - lp);
        d[start + i] += lp * amp * Math.exp(-i / (len * 0.35));
      }
    }
  }
  return buf;
}

function awwBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate, secs = 1.3, n = Math.floor(rate * secs);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  // many voices on a falling vowel: buzz through a resonant band that slides down
  const voices = Array.from({ length: 9 }, () => ({ f: 150 + Math.random() * 120, ph: Math.random() }));
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    for (const v of voices) {
      v.ph += (v.f * (1 - t * 0.28)) / rate;
      s += (v.ph % 1) * 2 - 1;
    }
    s /= voices.length;
    // two-pole resonator around a sliding formant
    const fc = 700 - t * 260, r = 0.985;
    const th = (2 * Math.PI * fc) / rate;
    const y = s * 0.08 + 2 * r * Math.cos(th) * y1 - r * r * y2;
    y2 = y1; y1 = y;
    const env = Math.min(1, t / 0.12) * Math.exp(-Math.max(0, t - 0.5) * 3.2);
    d[i] = y * env * 0.9;
  }
  return buf;
}

function whirBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate, secs = 1.6, n = Math.floor(rate * secs);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  let lp = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = 70 + Math.min(1, t * 3) * 40 - Math.max(0, t - 1.2) * 60;
    ph += f / rate;
    lp += 0.08 * ((Math.random() * 2 - 1) - lp);
    const env = Math.min(1, t / 0.1) * Math.min(1, (secs - t) / 0.25);
    d[i] = ((ph % 1) * 2 - 1) * 0.25 * env + lp * 0.5 * env;
  }
  return buf;
}

export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('roll')) return;
  try {
    const c = game.cache.audio;
    c.add('roll', rollBuffer(ctx));
    c.add('crash', crashBuffer(ctx));
    c.add('knock1', knockBuffer(ctx, 620));
    c.add('knock2', knockBuffer(ctx, 860));
    c.add('knock3', knockBuffer(ctx, 1180));
    c.add('cheer', crowdBuffer(ctx, 2.8, 900, (t) => Math.min(1, t / 0.2) * Math.exp(-Math.max(0, t - 0.8) * 1.3), 1));
    c.add('aww', awwBuffer(ctx));
    c.add('whir', whirBuffer(ctx));
  } catch {
    /* no Web Audio: no synthesised sounds */
  }
}
