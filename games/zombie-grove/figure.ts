// Zombie Grove: one rigged Mini Character drawn as itself (the hero, the robot helper and the
// bosses). Every move is the model's own clip through one AnimationMixer, in two layers: the
// body (legs, torso, head) walks or idles while the arms swing, thrust, shoot or throw. A clip
// split into those two layers is built once per model.
import { THREE, model, modelClips } from '@core/three';
import { addRim } from './kit';

const ARM = /arm-(left|right)/;
const split = new Map<string, Map<string, { body: THREE.AnimationClip; arms: THREE.AnimationClip; full: THREE.AnimationClip }>>();

function clipsOf(key: string) {
  let m = split.get(key);
  if (m) return m;
  m = new Map();
  for (const c of modelClips(key)) {
    m.set(c.name, {
      full: c,
      body: new THREE.AnimationClip(c.name + '#body', c.duration, c.tracks.filter((t) => !ARM.test(t.name))),
      arms: new THREE.AnimationClip(c.name + '#arms', c.duration, c.tracks.filter((t) => ARM.test(t.name))),
    });
  }
  split.set(key, m);
  return m;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private clips: ReturnType<typeof clipsOf>;
  private bodyAct: THREE.AnimationAction | null = null;
  private armsAct: THREE.AnimationAction | null = null;
  private bodyName = '';
  private armsName = '';
  /** Seconds the arms' one-shot move has left (then they follow the body again). */
  private armsT = 0;
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private flashT = 0;
  readonly bones = new Map<string, THREE.Object3D>();

  private glow = new THREE.Color(0, 0, 0);
  /** The rim light's colour uniforms (bosses), and the arms' resting clip (a held item). */
  readonly rims: { value: THREE.Color }[] = [];
  armsRest: string | null = null;

  constructor(readonly key: string, scale: number, o: { tint?: number; glow?: number; shadows?: boolean; ownMaterials?: boolean; rim?: [number, number] } = {}) {
    if (o.glow !== undefined) this.glow.setHex(o.glow);
    this.body = model(key, { shadows: o.shadows ?? true });
    this.body.scale.setScalar(scale);
    this.root.add(this.body);
    this.mixer = new THREE.AnimationMixer(this.body);
    this.clips = clipsOf(key);
    this.body.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) this.bones.set(obj.name, obj);
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (o.ownMaterials || o.tint !== undefined || o.rim) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (o.tint !== undefined) mat.color.setHex(o.tint);
        if (o.rim) this.rims.push(addRim(mat, o.rim[0], o.rim[1]));
        mesh.material = mat;
        this.mats.push(mat);
      }
    });
  }

  /** Plays a clip on the body (and the arms, unless they are busy). */
  play(name: string, o: { fade?: number; speed?: number; once?: boolean } = {}): void {
    const c = this.clips.get(name);
    if (!c) return;
    if (this.bodyName !== name) {
      const next = this.mixer.clipAction(c.body);
      this.setup(next, o.once);
      next.reset().play();
      if (this.bodyAct) next.crossFadeFrom(this.bodyAct, o.fade ?? 0.18, false);
      this.bodyAct = next;
      this.bodyName = name;
    }
    if (o.speed !== undefined && this.bodyAct) this.bodyAct.timeScale = o.speed;
    if (this.armsT <= 0) {
      if (this.armsRest) this.arms(this.armsRest, { fade: o.fade, follow: false });
      else this.arms(name, { fade: o.fade, speed: o.speed, once: o.once, follow: true });
    } else if (o.speed !== undefined && this.armsName === name && this.armsAct) this.armsAct.timeScale = o.speed;
  }

  /** A one-shot arm move (swing, thrust, throw) for `hold` seconds; then the arms follow the body. */
  act(name: string, hold: number, speed = 1): void {
    this.armsT = hold;
    this.arms(name, { fade: 0.06, speed, once: true, follow: false, restart: true });
  }

  private arms(name: string, o: { fade?: number; speed?: number; once?: boolean; follow: boolean; restart?: boolean }): void {
    const c = this.clips.get(name);
    if (!c) return;
    if (this.armsName === name && !o.restart) {
      if (o.speed !== undefined && this.armsAct) this.armsAct.timeScale = o.speed;
      return;
    }
    const next = this.mixer.clipAction(c.arms);
    this.setup(next, o.once);
    next.reset().play();
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.armsAct && this.armsAct !== next) next.crossFadeFrom(this.armsAct, o.fade ?? 0.18, false);
    // keep the arms in step with the legs when they follow
    if (o.follow && this.bodyAct && this.bodyName === name) next.time = this.bodyAct.time;
    this.armsAct = next;
    this.armsName = name;
  }

  private setup(a: THREE.AnimationAction, once?: boolean): void {
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!once;
    a.enabled = true;
    a.setEffectiveWeight(1);
  }

  /** A white flash on the materials (bosses being hit). */
  flash(): void { this.flashT = 0.1; }

  update(dt: number): void {
    if (this.armsT > 0) {
      this.armsT -= dt;
      if (this.armsT <= 0 && this.armsRest) this.arms(this.armsRest, { fade: 0.15, follow: false });
      else if (this.armsT <= 0 && this.bodyName) this.arms(this.bodyName, { fade: 0.15, follow: true });
    }
    this.mixer.update(dt);
    if (this.mats.length) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT > 0 ? 0.9 : 0;
      for (const m of this.mats) m.emissive.setRGB(this.glow.r + k, this.glow.g + k, this.glow.b + k);
    }
  }

  /** Something held in a hand: a model on the arm bone at the fist. */
  hold(obj: THREE.Object3D, side: 'left' | 'right'): void {
    const bone = this.bones.get('arm-' + side);
    if (bone) bone.add(obj);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}
