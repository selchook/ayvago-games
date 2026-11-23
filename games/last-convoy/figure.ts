// Last Convoy: one of the kit's rigged figures drawn as itself. `heroes` holds the four survivors on
// one skeleton (a figure shows one body, `h-<name>`, plus the weapon in hand: the ten weapons hang on
// the left hand's bone and only the equipped one is shown); the zombies and the dogs have a body
// each. Every move is the model's own clip through one AnimationMixer: Slash, Stab, Run_Slash and
// Run_Stab for the melee chain, Idle_Gun / Run_Gun / Walk_Gun for guns, Duck for the dodge roll
// (spun forward by the root), HitReact, Death, Wave and Yes; the zombies' Walk, Run, Crawl,
// Idle_Attack, Punch, Run_Attack and Death; the dogs' Run, Attack, Eating and Idle_2_HeadLow. Never
// added limbs. Each figure has its own material, so it can flash white when hit or be tinted.
import { THREE, model, modelClips } from '@core/three';
import { kk } from './kit';

export interface PlayOpts { fade?: number; speed?: number; once?: boolean; restart?: boolean; then?: string; thenSpeed?: number; at?: number }

const WEAPON_NODES = ['axe', 'guitar', 'knife', 'pistol', 'rifle', 'shotgun', 'smg', 'spear', 'bat-barbed', 'bat-saw'];

export class Figure {
  readonly root = new THREE.Group();
  /** The spin layer (the dodge roll, the whirl) between the root and the model. */
  readonly spin = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly mat: THREE.MeshLambertMaterial;
  private parts = new Map<string, THREE.Object3D>();
  private clips = new Map<string, THREE.AnimationClip>();
  private act: THREE.AnimationAction | null = null;
  name = '';
  tag = '';
  /** Free in its pool. */
  free = true;
  private flashT = 0;
  private flashCd = 0;
  private glow = new THREE.Color(0, 0, 0);
  private then: { name: string; o: PlayOpts } | null = null;
  /** The shown weapon's mesh and its tip in its own space (guns: the muzzle). */
  weapon: THREE.Object3D | null = null;
  private tips = new Map<string, THREE.Vector3>();

  constructor(readonly file: string, scale: number, show?: string[]) {
    this.body = model(kk(file), { shadows: true });
    this.body.scale.setScalar(scale);
    this.spin.add(this.body);
    this.root.add(this.spin);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.body.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = this.mat;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        this.parts.set(mesh.name, mesh);
      }
    });
    if (show) this.show(show);
    this.mixer = new THREE.AnimationMixer(this.body);
    this.mixer.addEventListener('finished', () => {
      if (this.then) { const n = this.then; this.then = null; this.play(n.name, n.o); }
    });
    for (const c of modelClips(kk(file))) this.clips.set(c.name, c);
    // the weapons' tips, from their boxes: the far end along +z, the top third (the barrel)
    for (const w of WEAPON_NODES) {
      const m = this.parts.get(w) as THREE.Mesh | undefined;
      if (!m) continue;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!;
      this.tips.set(w, new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y * 0.62 + b.min.y * 0.38, b.max.z));
    }
  }

  /** Shows only the named parts (one survivor's body and a weapon …). */
  show(names: string[]): void {
    for (const [n, o] of this.parts) o.visible = names.includes(n);
    const w = names.find((n) => WEAPON_NODES.includes(n));
    this.weapon = w ? this.parts.get(w) ?? null : null;
  }

  /** The shown weapon's tip in the world (null without a weapon). */
  tip(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.weapon) return null;
    const t = this.tips.get(this.weapon.name);
    if (!t) return null;
    return out.copy(t).applyMatrix4(this.weapon.matrixWorld);
  }

  has(name: string): boolean { return this.clips.has(name); }

  /** Plays a clip (no-op when it already plays, unless `restart`). `then` follows a `once` clip. */
  play(name: string, o: PlayOpts = {}): void {
    const clip = this.clips.get(name);
    if (!clip) return;
    this.then = o.then ? { name: o.then, o: { fade: 0.15, speed: o.thenSpeed } } : null;
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
    if (this.act && this.act !== next) next.crossFadeFrom(this.act, o.fade ?? 0.12, false);
    this.act = next;
    this.name = name;
  }

  /** The playing clip's speed. */
  setSpeed(s: number): void { if (this.act) this.act.timeScale = s; }

  flash(t = 0.08): void { if (this.flashCd > 0) return; this.flashT = t; this.flashCd = 0.12; }
  setGlow(c: number): void { this.glow.setHex(c); }
  setTint(c: number): void { this.mat.color.setHex(c); }

  update(dt: number): void {
    this.mixer.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flashCd = Math.max(0, this.flashCd - dt);
    const f = this.flashT > 0 ? 0.6 : 0;
    this.mat.emissive.setRGB(this.glow.r + f, this.glow.g + f, this.glow.b + f);
  }

  reset(): void {
    this.mixer.stopAllAction();
    this.act = null;
    this.name = '';
    this.then = null;
    this.flashT = 0;
    this.glow.setRGB(0, 0, 0);
    this.mat.color.setHex(0xffffff);
    this.mat.opacity = 1;
    this.mat.transparent = false;
    this.mat.depthWrite = true;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.spin.rotation.set(0, 0, 0);
    this.spin.position.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.root.visible = true;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}
