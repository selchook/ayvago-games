// Skull Isle: one rigged Quaternius model drawn as itself (the hero, skeletons, headless runners,
// sharks, tentacles, the skeleton captain). Every move is the model's own clip (Idle, Run, Walk,
// Sword, Punch, HitReact, Death, Duck, Jump, Yes; the shark's Swim and Swim_Bite; the tentacle's
// Tentacle_* clips) through one AnimationMixer. Each figure has its own Lambert so it can flash
// white when hit and take a tint; the mixer runs at a lower rate when the figure is far or off
// screen (animation LOD).
import { THREE, model, modelClips } from '@core/three';

export class Figure {
  readonly root = new THREE.Group();
  /** The model, inside `pivot` (rolls and spins turn the pivot round the figure's middle). */
  readonly body: THREE.Object3D;
  readonly pivot = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly mat: THREE.MeshLambertMaterial;
  readonly bones = new Map<string, THREE.Object3D>();
  private clips = new Map<string, THREE.AnimationClip>();
  private act: THREE.AnimationAction | null = null;
  name = '';
  private flashT = 0;
  private tint = new THREE.Color(1, 1, 1);
  private glow = new THREE.Color(0, 0, 0);
  private hurt = 0;
  /** Seconds of animation not yet applied (LOD skips frames). */
  private pending = 0;
  private skip = 0;

  constructor(readonly key: string, scale = 1, o: { shadows?: boolean; mid?: number } = {}) {
    this.body = model(key, { shadows: o.shadows ?? false });
    this.body.scale.setScalar(scale);
    // the pivot sits at the figure's middle so a roll turns round the waist, not the feet
    const mid = (o.mid ?? 0.7) * scale;
    this.pivot.position.y = mid;
    this.body.position.y = -mid;
    this.pivot.add(this.body);
    this.root.add(this.pivot);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.body.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) this.bones.set(obj.name, obj);
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = this.mat;
        mesh.frustumCulled = false;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const c of modelClips(key)) this.clips.set(c.name, c);
  }

  has(name: string): boolean { return this.clips.has(name); }

  /** Plays a clip (no-op when it already plays, unless `restart`). */
  play(name: string, o: { fade?: number; speed?: number; once?: boolean; restart?: boolean; at?: number } = {}): void {
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
    if (this.act && this.act !== next) next.crossFadeFrom(this.act, o.fade ?? 0.15, false);
    this.act = next;
    this.name = name;
  }

  /** Seconds the current clip has played (0 when none). */
  get clipTime(): number { return this.act?.time ?? 0; }

  /** A white flash (hit). */
  flash(t = 0.09): void { this.flashT = t; }
  /** A red flush that fades (the hero hurt). */
  hurtFlush(k = 1): void { this.hurt = k; }
  setTint(c: number): void { this.tint.setHex(c); this.mat.color.copy(this.tint); }
  setGlow(c: number): void { this.glow.setHex(c); }

  /** Animation LOD: `every` = 1 updates every frame, 2 every other frame … */
  update(dt: number, every = 1): void {
    this.pending += dt;
    if (++this.skip >= every) {
      this.skip = 0;
      this.mixer.update(this.pending);
      this.pending = 0;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.hurt = Math.max(0, this.hurt - dt * 3);
    const f = this.flashT > 0 ? 0.6 : 0;
    this.mat.emissive.setRGB(this.glow.r + f + this.hurt * 0.9, this.glow.g + f, this.glow.b + f);
  }

  /** Something held: a model on a bone (e.g. 'Index1.L'). */
  hold(obj: THREE.Object3D, bone: string): void {
    this.bones.get(bone)?.add(obj);
  }

  /** Back to a clean state for reuse from a pool. */
  reset(): void {
    this.mixer.stopAllAction();
    this.act = null;
    this.name = '';
    this.flashT = 0;
    this.hurt = 0;
    this.pivot.rotation.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.root.visible = true;
    this.mat.color.setRGB(1, 1, 1);
    this.glow.setRGB(0, 0, 0);
    this.mat.transparent = false;
    this.mat.opacity = 1;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}

/** A pool of figures of one model: taken when a foe appears, given back when it is gone. */
export class FigurePool {
  private free: Figure[] = [];
  readonly all: Figure[] = [];

  constructor(private scene: THREE.Object3D, readonly key: string, private scale: number, private o: { shadows?: boolean; mid?: number } = {}, prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.make());
  }

  private make(): Figure {
    const f = new Figure(this.key, this.scale, this.o);
    f.root.visible = false;
    this.scene.add(f.root);
    this.all.push(f);
    return f;
  }

  take(): Figure {
    const f = this.free.pop() ?? this.make();
    f.reset();
    return f;
  }

  give(f: Figure): void {
    f.root.visible = false;
    f.mixer.stopAllAction();
    this.free.push(f);
  }

  dispose(): void { for (const f of this.all) f.dispose(); }
}
