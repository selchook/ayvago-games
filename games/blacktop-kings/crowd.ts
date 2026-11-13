// The people round the court and the sounds the CC0 packs do not have.
//   - Spectators behind the fence: Mini Characters drawn with one InstancedMesh per body part
//     (the model's triangles split by bone, posed from its own idle / emote-yes / jump clips
//     sampled once), so twenty-odd people cost a handful of draw calls. They jump after baskets.
//   - Crowd murmur and roar, the sneaker squeak, the net swish and the shot-clock buzzer are
//     synthesised at start-up into audio buffers and added to Phaser's audio cache, so they play
//     like any loaded sound and follow the mute switch.
import Phaser from 'phaser';
import { THREE, model, modelClips, miniKey } from '@core/three';
import { isMuted } from '@core';
import { FIG } from './players';

interface ClipPoses { dur: number; frames: THREE.Matrix4[][] }
interface Baked { parts: { joint: number; geo: THREE.BufferGeometry }[]; clips: Map<string, ClipPoses>; map: THREE.Texture | null }
const FRAMES = 20;
const baked = new Map<string, Baked>();

/** Splits a rigged Mini Character into rigid parts (by bone) and samples a few clips. */
function bake(name: string, clipNames: string[]): Baked {
  const key = miniKey(name);
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
  const bones = skinned[0].skeleton.bones;
  const map = ((skinned[0].material as THREE.MeshStandardMaterial).map ?? null);
  const byJoint = new Map<number, THREE.BufferGeometry[]>();
  for (const sm of skinned) {
    const g = sm.geometry.index ? sm.geometry.toNonIndexed() : sm.geometry.clone();
    const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
    const tris = new Map<number, number[]>();
    for (let t = 0; t < g.getAttribute('position').count; t += 3) {
      let j = si.getX(t), w = sw.getX(t);
      if (sw.getY(t) > w) { j = si.getY(t); w = sw.getY(t); }
      if (sw.getZ(t) > w) { j = si.getZ(t); }
      const bi = bones.indexOf(sm.skeleton.bones[j]);
      if (!tris.has(bi)) tris.set(bi, []);
      tris.get(bi)!.push(t);
    }
    for (const [bi, list] of tris) {
      const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const P = new Float32Array(list.length * 9), N = new Float32Array(list.length * 9), U = new Float32Array(list.length * 6);
      list.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          const v = t + k, o = i * 3 + k;
          P[o * 3] = pos.getX(v); P[o * 3 + 1] = pos.getY(v); P[o * 3 + 2] = pos.getZ(v);
          N[o * 3] = nor.getX(v); N[o * 3 + 1] = nor.getY(v); N[o * 3 + 2] = nor.getZ(v);
          U[o * 2] = uv.getX(v); U[o * 2 + 1] = uv.getY(v);
        }
      });
      const part = new THREE.BufferGeometry();
      part.setAttribute('position', new THREE.BufferAttribute(P, 3));
      part.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      part.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      part.applyMatrix4(sm.bindMatrix);
      if (!byJoint.has(bi)) byJoint.set(bi, []);
      byJoint.get(bi)!.push(part);
    }
    g.dispose();
  }
  const parts: Baked['parts'] = [];
  for (const [joint, geos] of byJoint) {
    let n = 0;
    for (const g of geos) n += g.getAttribute('position').count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    let o = 0;
    for (const g of geos) {
      P.set(g.getAttribute('position').array as Float32Array, o * 3);
      N.set(g.getAttribute('normal').array as Float32Array, o * 3);
      U.set(g.getAttribute('uv').array as Float32Array, o * 2);
      o += g.getAttribute('position').count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    parts.push({ joint, geo });
  }
  const inverses = skinned[0].skeleton.boneInverses;
  const mixer = new THREE.AnimationMixer(root);
  const all = modelClips(key);
  const clips = new Map<string, ClipPoses>();
  for (const cn of clipNames) {
    const clip = all.find((c) => c.name === cn);
    if (!clip) continue;
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    const frames: THREE.Matrix4[][] = [];
    for (let f = 0; f < FRAMES; f++) {
      mixer.setTime((f / FRAMES) * clip.duration);
      root.updateMatrixWorld(true);
      frames.push(parts.map((p) => new THREE.Matrix4().multiplyMatrices(bones[p.joint].matrixWorld, inverses[p.joint])));
    }
    clips.set(cn, { dur: clip.duration, frames });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return { parts, clips, map };
}

interface Fan { x: number; z: number; rot: number; ph: number; tint: THREE.Color; kind: number }

const TINTS = [0xffffff, 0xffe6d0, 0xd8e8ff, 0xffd8e0, 0xe0ffe0, 0xfff2c0];

/** Spectators along the fence, two figures, every part of each one InstancedMesh. */
export class Crowd {
  private meshes: Array<{ joint: number; mesh: THREE.InstancedMesh }[]> = [];
  private clips: Array<Map<string, ClipPoses>> = [];
  private fans: Fan[] = [];
  private excite = 0;
  private time = 0;
  private m = new THREE.Matrix4();
  private w = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(FIG, FIG, FIG);
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(parent: THREE.Object3D, names: string[], spots: Array<{ x: number; z: number; rot: number }>, rnd: () => number) {
    names.forEach((name, k) => {
      let b = baked.get(name);
      if (!b) { b = bake(name, ['idle', 'emote-yes', 'jump']); baked.set(name, b); }
      const mat = new THREE.MeshLambertMaterial({ map: b.map });
      const count = Math.ceil(spots.length / names.length) + 1;
      this.meshes.push(b.parts.map((p) => {
        const mesh = new THREE.InstancedMesh(p.geo, mat, count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        parent.add(mesh);
        return { joint: p.joint, mesh };
      }));
      this.clips.push(b.clips);
      void k;
    });
    spots.forEach((s, i) => this.fans.push({ ...s, ph: rnd() * 10, tint: new THREE.Color(TINTS[Math.floor(rnd() * TINTS.length)]), kind: i % names.length }));
    this.update(0);
  }

  /** A roar: everyone jumps for a while. */
  cheer(level = 1): void {
    this.excite = Math.max(this.excite, level);
  }

  update(dt: number): void {
    this.time += dt;
    this.excite = Math.max(0, this.excite - dt * 0.4);
    const counts = this.meshes.map(() => 0);
    for (const f of this.fans) {
      const clips = this.clips[f.kind];
      const hop = this.excite > 0.25 && Math.sin(this.time * 3 + f.ph) > 0.2 - this.excite * 0.6;
      const clip = this.excite > 0.6 && hop ? 'jump' : this.excite > 0.15 ? 'emote-yes' : 'idle';
      const c = clips.get(clip) ?? clips.get('idle');
      if (!c) continue;
      const t = (this.time * (clip === 'idle' ? 0.8 : 1.4) + f.ph) % c.dur;
      const frame = c.frames[Math.min(FRAMES - 1, Math.floor((t / c.dur) * FRAMES))];
      const lift = clip === 'jump' ? Math.abs(Math.sin(this.time * 6 + f.ph)) * 0.35 : 0;
      this.q.setFromAxisAngle(this.up, f.rot);
      this.p.set(f.x, lift, f.z);
      this.w.compose(this.p, this.q, this.s);
      const i = counts[f.kind]++;
      this.meshes[f.kind].forEach((part, k) => {
        part.mesh.setMatrixAt(i, this.m.multiplyMatrices(this.w, frame[k]));
        part.mesh.setColorAt(i, f.tint);
      });
    }
    this.meshes.forEach((parts, k) => parts.forEach((p) => {
      p.mesh.count = counts[k];
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }));
  }

  get drawCalls(): number { return this.meshes.reduce((n, m) => n + m.length, 0); }
}

// ------------------------------------------------------------------ synthesised sounds

function noiseBuffer(ctx: BaseAudioContext, seconds: number, shape: (t: number) => number, bright: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
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

function toneBuffer(ctx: BaseAudioContext, seconds: number, fn: (t: number) => number): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = fn(i / rate);
  return buf;
}

/** Adds crowd, roar, squeak, swish and buzzer to the audio cache (once per page). */
export function makeSounds(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr.context;
  if (!ctx || game.cache.audio.exists('crowd')) return;
  try {
    const loop = 4;
    const murmur = noiseBuffer(ctx, loop, () => 1, 0.75);
    const fade = Math.floor(ctx.sampleRate * 0.4);
    for (let ch = 0; ch < 2; ch++) {
      const d = murmur.getChannelData(ch);
      for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = d[i] * k + d[d.length - fade + i] * (1 - k); }
    }
    const trimmed = ctx.createBuffer(2, murmur.length - fade, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) trimmed.getChannelData(ch).set(murmur.getChannelData(ch).subarray(0, murmur.length - fade));
    game.cache.audio.add('crowd', trimmed);
    game.cache.audio.add('roar', noiseBuffer(ctx, 2.6, (t) => Math.min(1, t / 0.2) * Math.exp(-Math.max(0, t - 0.5) * 1.3), 1));
    game.cache.audio.add('ooh', noiseBuffer(ctx, 1.4, (t) => Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.4) * 2.2) * 0.7, 0.45));
    // a rubber sole on the court: a fast, wobbly chirp
    let ph = 0;
    game.cache.audio.add('squeak', toneBuffer(ctx, 0.13, (t) => {
      const f = 2300 + 1500 * (t / 0.13) + Math.sin(t * 420) * 260;
      ph += (f / ctx.sampleRate) * Math.PI * 2;
      const env = Math.min(1, t / 0.01) * Math.max(0, 1 - t / 0.13);
      return (Math.sin(ph) * 0.6 + Math.sin(ph * 2.01) * 0.25) * env * 0.5;
    }));
    // the net: a breathy swish
    let lp = 0;
    game.cache.audio.add('swishNet', toneBuffer(ctx, 0.38, (t) => {
      lp += 0.35 * (Math.random() * 2 - 1 - lp);
      const env = Math.min(1, t / 0.03) * Math.exp(-t * 9);
      return (Math.random() * 2 - 1 - lp) * env * 0.55;
    }));
    // the shot-clock horn
    game.cache.audio.add('buzzer', toneBuffer(ctx, 0.9, (t) => {
      const env = Math.min(1, t / 0.02) * (t > 0.82 ? Math.max(0, (0.9 - t) / 0.08) : 1);
      const s = Math.sign(Math.sin(t * 2 * Math.PI * 196)) * 0.5 + Math.sign(Math.sin(t * 2 * Math.PI * 247)) * 0.35;
      return s * env * 0.32;
    }));
  } catch {
    /* no Web Audio: the game simply has no crowd */
  }
}

/** The looping murmur of the crowd (`level` swells it). */
export class CrowdLoop {
  private snd: Phaser.Sound.BaseSound | null = null;

  constructor(private scene: Phaser.Scene, vol = 0.16) {
    if (!scene.cache.audio.exists('crowd')) return;
    try {
      this.snd = scene.sound.add('crowd', { loop: true, volume: vol });
      if (!isMuted()) this.snd.play();
    } catch {
      this.snd = null;
    }
    const onPause = () => this.pause(true), onResume = () => this.pause(false);
    scene.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    scene.events.on(Phaser.Scenes.Events.RESUME, onResume);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      scene.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.stop();
    });
  }

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
