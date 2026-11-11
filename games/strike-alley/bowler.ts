// A person in the alley: a rigged Kenney Mini Character with one AnimationMixer, crossfading
// between the model's own clips (idle, walk, sprint, crouch, holding-right, interact-right,
// pick-up, emote-yes, emote-no, jump, sit). The bowler's ball rides in the right hand: it is
// parented to the model's own right arm bone, so it follows every clip without extra limbs.
import { THREE, model, modelClips } from '@core/three';
import { blobTexture } from './alley';

/** Height of a person in metres, and the Mini Characters' model height. */
const HEIGHT = 1.5;
const MODEL_H = 0.671;
export const UNIT = HEIGHT / MODEL_H;
/** Metres covered by one loop of the walk clip (two steps), so the feet do not skate. */
const WALK_LOOP_M = 1.5;

export type Clip =
  | 'idle' | 'walk' | 'sprint' | 'jump' | 'crouch' | 'sit' | 'pick-up' | 'emote-yes' | 'emote-no'
  | 'holding-right' | 'holding-right-shoot' | 'interact-right' | 'holding-both' | 'static';

const ONCE = new Set<Clip>(['pick-up', 'holding-right-shoot', 'interact-right']);

let skin: THREE.MeshLambertMaterial | null = null;
function skinOf(src: THREE.Material): THREE.MeshLambertMaterial {
  if (!skin) {
    const map = (src as THREE.MeshStandardMaterial).map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    skin = new THREE.MeshLambertMaterial({ map });
  }
  return skin;
}

export class Person {
  /** On the floor (shadow lives here). */
  readonly root = new THREE.Group();
  /** Turned and lifted (jumps). */
  readonly body = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  readonly bones = new Map<string, THREE.Object3D>();
  clip: Clip = 'idle';
  lift = 0;

  constructor(key: string) {
    this.obj = model(key, { shadows: true });
    this.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = skinOf(m.material as THREE.Material);
        m.frustumCulled = false;
      } else if (o.name) this.bones.set(o.name, o);
    });
    this.obj.scale.setScalar(UNIT);
    this.body.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    for (const c of modelClips(key)) {
      const a = this.mixer.clipAction(c);
      if (ONCE.has(c.name as Clip)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(c.name as Clip, a);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.userData.ownMaterial = true;
    this.root.add(shadow, this.body);
    this.play('idle', { fade: 0 });
  }

  /** Faces a direction: yaw 0 looks down the lane (-z), π looks back at the settee. */
  face(yaw: number): this {
    this.body.rotation.y = Math.PI - yaw;
    return this;
  }

  play(clip: Clip, o: { fade?: number; speed?: number; restart?: boolean } = {}): this {
    const next = this.actions.get(clip);
    if (!next) return this;
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.current === next && !o.restart) return this;
    next.reset();
    if (o.speed === undefined) next.timeScale = 1;
    next.play();
    const fade = o.fade ?? 0.2;
    if (this.current && this.current !== next) {
      if (fade > 0) this.current.crossFadeTo(next, fade, false);
      else this.current.stop();
    }
    this.current = next;
    this.clip = clip;
    return this;
  }

  /** Walking at v m/s with the walk clip's speed matched to it. */
  walk(v: number): this {
    const dur = this.actions.get('walk')?.getClip().duration ?? 0.67;
    return this.play('walk', { speed: Math.max(0.4, (v / WALK_LOOP_M) * dur * 1.0), fade: 0.15 });
  }

  /** Clip progress 0..1 of the current clip. */
  get progress(): number {
    const a = this.current;
    if (!a) return 1;
    return a.time / a.getClip().duration;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.body.position.y = this.lift;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.obj);
    this.obj.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
  }
}

/** The right fist in the arm bone's space (model units; the arm runs along -x in the bind pose). */
export const HAND = new THREE.Vector3(-0.24, 0, 0.073);
/** The ball hangs this far (m) under the fist's centre. */
export const BALL_DROP = 0.09;
/** …this far in front of it… */
export const BALL_AHEAD = 0.02;
/** …and this far to its outer side. */
export const BALL_SIDE = 0.11;

/** World position of the ball in a person's right hand. */
export function ballInHand(p: Person, out = new THREE.Vector3()): THREE.Vector3 {
  const arm = p.bones.get('arm-right');
  if (!arm) return out.copy(p.root.position).add(new THREE.Vector3(0.3, 0.6, -0.4));
  p.root.updateMatrixWorld(true);
  out.copy(HAND);
  arm.localToWorld(out);
  // held in the fingers: a little in front of, beside and under the fist
  const yaw = p.body.rotation.y;
  out.x += Math.sin(yaw) * BALL_AHEAD - Math.cos(yaw) * BALL_SIDE;
  out.z += Math.cos(yaw) * BALL_AHEAD + Math.sin(yaw) * BALL_SIDE;
  out.y -= BALL_DROP;
  return out;
}
