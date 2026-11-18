// Sushi Rush: one of the kit's rigged animals drawn as itself. `rabbits` holds seven rabbits on
// one skeleton (a figure shows one of them, `r-<colour>`) plus a knife and a pan; `panda` holds the
// panda's body, headband, knife and pan. Every move is the model's own clip through one
// AnimationMixer (Walk, Sitting_*, Chop_*, Assembly_*, Pan_*, Yes, No, Wave …), never added limbs.
import { THREE, model, modelClips } from '@core/three';
import { sk } from './kit';

export class Figure {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly mat: THREE.MeshLambertMaterial;
  private parts = new Map<string, THREE.Object3D>();
  private clips = new Map<string, THREE.AnimationClip>();
  private act: THREE.AnimationAction | null = null;
  name = '';
  private flashT = 0;
  private glow = new THREE.Color(0, 0, 0);
  /** A queued follow-up clip (after a `once` clip ends). */
  private then: { name: string; o: PlayOpts } | null = null;

  constructor(readonly kind: 'rabbits' | 'panda', scale: number, mat?: THREE.MeshLambertMaterial) {
    this.body = model(sk(kind), { shadows: true });
    this.body.scale.setScalar(scale);
    this.root.add(this.body);
    this.mat = mat ?? new THREE.MeshLambertMaterial({ vertexColors: true });
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
    this.mixer = new THREE.AnimationMixer(this.body);
    this.mixer.addEventListener('finished', () => {
      if (this.then) { const n = this.then; this.then = null; this.play(n.name, n.o); }
    });
    for (const c of modelClips(sk(kind))) this.clips.set(c.name, c);
  }

  /** Shows only the named parts (a rabbit's body, the knife, the pan …). */
  show(names: string[]): void {
    for (const [n, o] of this.parts) o.visible = names.includes(n);
  }

  setPart(name: string, on: boolean): void {
    const p = this.parts.get(name);
    if (p) p.visible = on;
  }

  has(name: string): boolean { return this.clips.has(name); }

  /** Plays a clip (no-op when it already plays, unless `restart`). `then` follows a `once` clip. */
  play(name: string, o: PlayOpts = {}): void {
    const clip = this.clips.get(name);
    if (!clip) return;
    this.then = o.then ? { name: o.then, o: { fade: 0.12, speed: o.thenSpeed } } : null;
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
    next.play();
    if (this.act && this.act !== next) next.crossFadeFrom(this.act, o.fade ?? 0.15, false);
    this.act = next;
    this.name = name;
  }

  /** A short white flash. */
  flash(t = 0.12): void { this.flashT = t; }
  setGlow(c: number): void { this.glow.setHex(c); }

  update(dt: number): void {
    this.mixer.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT > 0 ? 0.45 : 0;
    this.mat.emissive.setRGB(this.glow.r + f, this.glow.g + f, this.glow.b + f);
  }

  reset(): void {
    this.mixer.stopAllAction();
    this.act = null;
    this.name = '';
    this.then = null;
    this.flashT = 0;
    this.glow.setRGB(0, 0, 0);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.root.visible = true;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}

export interface PlayOpts { fade?: number; speed?: number; once?: boolean; restart?: boolean; then?: string; thenSpeed?: number }
