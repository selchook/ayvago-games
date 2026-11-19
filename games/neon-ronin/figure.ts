// Neon Ronin: a rigged figure from the kit drawn as itself: the hero (body + katana), the walker
// and drone families (their `plain` or `gun` body on one skeleton), the brute and the boss mech.
// Every move is the model's own clip through one AnimationMixer (Run, Sword_Slash, Punch_Right,
// Kick_Left, Gun_Shoot, Roll, HitRecieve, Death, Wave … / Walk, Attack, Shoot, Jump, Death …),
// never added limbs. A hit flashes the figure's own copy of the lit material.
import { THREE } from '@core/three';
import { rig, type Mats, type RigId } from './kit';

export interface PlayOpts { fade?: number; speed?: number; once?: boolean; restart?: boolean; at?: number }

export class Figure {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private flashMat: THREE.MeshStandardMaterial;
  private parts = new Map<string, THREE.Object3D>();
  private clips = new Map<string, THREE.AnimationClip>();
  act: THREE.AnimationAction | null = null;
  name = '';
  private flashT = 0;
  private glow = new THREE.Color(0, 0, 0);
  private bones = new Map<string, THREE.Object3D>();

  constructor(readonly id: RigId, scale: number, m: Mats) {
    const r = rig(id, m);
    this.body = r.root;
    this.flashMat = r.flash;
    this.body.scale.setScalar(scale);
    this.root.add(this.body);
    this.body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.parts.set(o.uuid, o);
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o);
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const c of r.clips) this.clips.set(c.name, c);
  }

  /** The part a mesh belongs to: its own name, or its group's (a mesh with several materials). */
  private partOf(name: string, o: THREE.Object3D): boolean {
    return o.name === name || o.name.startsWith(name + '_') || o.parent?.name === name;
  }
  /** Shows only the named parts (a family's `plain` or `gun` body). */
  show(names: string[]): void { for (const o of this.parts.values()) o.visible = names.some((n) => this.partOf(n, o)); }
  setPart(name: string, on: boolean): void { for (const o of this.parts.values()) if (this.partOf(name, o)) o.visible = on; }
  bone(name: string): THREE.Object3D | undefined { return this.bones.get(name); }
  has(name: string): boolean { return this.clips.has(name); }
  clipLength(name: string): number { return this.clips.get(name)?.duration ?? 1; }

  /** Plays a clip (no-op when it already plays, unless `restart`). */
  play(name: string, o: PlayOpts = {}): void {
    const clip = this.clips.get(name);
    if (!clip) return;
    if (this.name === name && !o.restart) {
      if (o.speed !== undefined && this.act) this.act.timeScale = o.speed;
      return;
    }
    const next = this.mixer.clipAction(clip);
    next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!o.once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.reset();
    next.timeScale = o.speed ?? 1;
    if (o.at) next.time = o.at * clip.duration;
    next.play();
    if (this.act && this.act !== next) next.crossFadeFrom(this.act, o.fade ?? 0.1, false);
    this.act = next;
    this.name = name;
  }

  /** Holds a clip at a fraction of its length (a pose). */
  pose(name: string, at: number, fade = 0.08): void {
    this.play(name, { fade, speed: 0, at });
    if (this.act) { this.act.timeScale = 0; this.act.time = at * (this.clips.get(name)?.duration ?? 1); }
  }

  private flashK = 0.32;
  /**
   * A neon rim: a fresnel glow on the figure's edges in `color`, so it reads against busy scenes
   * and big foes (added to its own material's shader; the program is cached by the key).
   */
  rim(color: number, strength: number): void {
    const m = this.flashMat;
    const c = new THREE.Color(color);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.rimColor = { value: c.multiplyScalar(strength) };
      sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += rimColor * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);',
      );
    };
    m.customProgramCacheKey = () => 'nr-rim';
    m.needsUpdate = true;
  }

  flash(t = 0.1, k = 0.32): void { this.flashT = t; this.flashK = k; }
  setGlow(c: number): void { this.glow.setHex(c); }

  update(dt: number): void {
    this.mixer.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT > 0 ? this.flashK : 0;
    this.flashMat.emissive.setRGB(this.glow.r + f, this.glow.g + f, this.glow.b + f);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}
