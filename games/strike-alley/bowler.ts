// A person in the alley: a rigged Kenney Mini Character (root, torso, head, arm-left/right,
// leg-left/right: seven bones, one per limb) animated in layers on one AnimationMixer:
//
//   1. the base clip (idle, walk, emote-yes, pick-up …), crossfaded as usual;
//   2. a legs layer: the walk clip masked to the legs, its time driven by the distance the feet
//      cover (so they stay planted), under base clips that leave the legs alone (emotes, pick-up);
//   3. a carry layer: holding-right masked to the right arm, while the base clip plays without its
//      right-arm track (a masked copy), so the legs walk and the right arm holds the ball;
//   4. procedural poses on top of the clips, each with its own weight: the bowling swing of the
//      right arm (push-away, backswing, forward swing, release, follow-through), the left arm out
//      for balance, the torso's lean, the slide's lunge (front leg forward, back leg trailing);
//   5. grounding: after everything, the body is lowered or raised so the lowest foot touches
//      the floor (a lunge sinks the hips; nothing floats or sinks into the boards).
//
// The ball rides on a grip point parented to the right arm bone (the arm is one bone, the fist at
// its end): it sits on the palm side of the fist, finger holes towards the hand, so it moves
// exactly with the hand through every frame.
import { THREE, model, modelClips } from '@core/three';
import { blobTexture } from './alley';
import { BALL_R } from './sim';

/** Height of a person in metres, and the Mini Characters' model height. */
const HEIGHT = 1.5;
const MODEL_H = 0.671;
export const UNIT = HEIGHT / MODEL_H;
/** Length of a leg (hip joint to sole) in model units. */
const LEG = 0.176;

export type Clip =
  | 'idle' | 'walk' | 'sprint' | 'jump' | 'crouch' | 'sit' | 'pick-up' | 'emote-yes' | 'emote-no'
  | 'holding-right' | 'holding-right-shoot' | 'interact-right' | 'holding-both' | 'static';

const ONCE = new Set<string>(['pick-up', 'holding-right-shoot', 'interact-right']);
const LEGS = new Set(['leg-left', 'leg-right']);

/** A copy of a clip with only the tracks whose bone passes `keep` (masked animation). */
export function maskClip(clip: THREE.AnimationClip, name: string, keep: (bone: string, prop: string) => boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => {
    const dot = t.name.lastIndexOf('.');
    return keep(t.name.slice(0, dot), t.name.slice(dot + 1));
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

let skin: THREE.MeshLambertMaterial | null = null;
function skinOf(src: THREE.Material): THREE.MeshLambertMaterial {
  if (!skin) {
    const map = (src as THREE.MeshStandardMaterial).map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    skin = new THREE.MeshLambertMaterial({ map });
  }
  return skin;
}

/** A procedural arm: swing forward (+) or back (−) from hanging, out to the side, twist about itself. */
export interface ArmPose { w: number; swing: number; abd: number; twist: number }
/** The slide: front (left) leg forward, back (right) leg trailing behind and across. */
export interface LegPose { w: number; front: number; back: number; cross: number; spread: number }

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion();
const ID = new THREE.Quaternion();
const qArm = new THREE.Quaternion();
const v1 = new THREE.Vector3();

/** Torso-space rotation of a right (side −1) or left (side +1) arm from the T-pose. */
function armQuat(side: number, swing: number, abd: number, twist: number, out: THREE.Quaternion): THREE.Quaternion {
  // twist about the arm's own axis, lower it from the T-pose to the side (minus the abduction),
  // then swing it about the shoulder's x axis (forward is +z, the model's facing)
  qa.setFromAxisAngle(AX, twist * -side);
  qb.setFromAxisAngle(AZ, -side * (Math.PI / 2 - abd));
  qc.setFromAxisAngle(AX, -swing);
  return out.copy(qc).multiply(qb).multiply(qa);
}

export class Person {
  /** On the floor (shadow lives here). */
  readonly root = new THREE.Group();
  /** Turned and lifted (jumps, grounding). */
  readonly body = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  readonly bones = new Map<string, THREE.Object3D>();
  /** Where the ball sits in the right hand (a child of the right arm bone). */
  readonly grip = new THREE.Object3D();
  private feet: { bone: THREE.Object3D; pts: THREE.Vector3[] }[] = [];
  /** The clips' own rotation of every bone the layers touch (see update). */
  private clipPose = new Map<THREE.Object3D, THREE.Quaternion>();
  private shadow: THREE.Mesh;
  clip: Clip = 'idle';
  /** Extra height (jumps); with `ground` on, the lowest foot is put on the floor first. */
  lift = 0;
  /** Keep the lowest foot on the floor. */
  ground = true;

  // layers
  private legsAction: THREE.AnimationAction | null = null;
  private carryAction: THREE.AnimationAction | null = null;
  /** Holding the ball in the right hand: the base clips play without their right-arm tracks. */
  carrying = false;
  /** Distance walked (m), driving the walk clip's time so the feet stay planted. */
  private gaitDist = 0;
  /** Leg swing amplitude (1 = the clip's own ±60°). */
  stride = 1;
  /** Metres per loop of the walk clip (two steps) at `stride` 1. */
  static WALK_LOOP = 1.45;

  // procedural layers
  readonly armR: ArmPose = { w: 0, swing: 0, abd: 0.2, twist: -Math.PI / 2 };
  readonly armL: ArmPose = { w: 0, swing: 0, abd: 0.3, twist: 0 };
  readonly legs: LegPose = { w: 0, front: 0, back: 0, cross: 0, spread: 0 };
  /** Torso: weight of the override, lean forward (rad), how much of the clip's own twist to keep. */
  readonly torso = { w: 0, pitch: 0, yaw: 0, keep: 1 };
  /** Head pitch added on top (rad, + looks down), and a turn (rad, + to the person's left). */
  headPitch = 0;
  headYaw = 0;

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
    for (const c of modelClips(key)) this.clips.set(c.name, c);
    // the grip: on the palm side of the fist, finger holes towards the hand
    const arm = this.bones.get('arm-right');
    if (arm) {
      arm.add(this.grip);
      this.grip.position.copy(GRIP);
      // the texture's finger holes sit at (0, 0.81, 0.59) on the ball: turn them to the palm (+y here)
      this.grip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0.81, 0.59).normalize(), new THREE.Vector3(0, 1, 0));
      this.grip.scale.setScalar(1 / UNIT);
    }
    for (const [name] of [['leg-left'], ['leg-right']]) {
      const bone = this.bones.get(name);
      if (bone) this.feet.push({ bone, pts: [new THREE.Vector3(0, -LEG, 0.12), new THREE.Vector3(0, -LEG, -0.075), new THREE.Vector3(0, -LEG, 0.03)] });
    }
    for (const n of ['torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']) {
      const bone = this.bones.get(n);
      if (bone) this.clipPose.set(bone, bone.quaternion.clone());
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.shadow.userData.ownMaterial = true;
    this.root.add(this.shadow, this.body);
    this.play('idle', { fade: 0 });
  }

  /** The action of a clip, or of a masked copy ('walk~R': no right arm; 'walk~legs': legs only). */
  private action(name: string): THREE.AnimationAction | null {
    let a = this.actions.get(name);
    if (a) return a;
    const [base, mask] = name.split('~');
    const src = this.clips.get(base);
    if (!src) return null;
    const clip = !mask ? src
      : mask === 'R' ? maskClip(src, name, (b) => b !== 'arm-right')
      : mask === 'arm' ? maskClip(src, name, (b) => b === 'arm-right')
      : maskClip(src, name, (b) => LEGS.has(b));
    a = this.mixer.clipAction(clip);
    if (ONCE.has(base)) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    this.actions.set(name, a);
    return a;
  }

  /** Faces a direction: yaw 0 looks down the lane (-z), π looks back at the settee. */
  face(yaw: number): this {
    this.body.rotation.y = Math.PI - yaw;
    return this;
  }

  get yaw(): number {
    return Math.PI - this.body.rotation.y;
  }

  /** Crossfades the base layer to a clip (its masked copy while carrying the ball). */
  play(clip: Clip, o: { fade?: number; speed?: number; restart?: boolean; at?: number } = {}): this {
    const next = this.action(this.carrying ? clip + '~R' : clip);
    if (!next) return this;
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.current === next && !o.restart) return this;
    next.reset();
    if (o.speed === undefined) next.timeScale = 1;
    if (o.at !== undefined) next.time = o.at * next.getClip().duration;
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

  /** Takes the ball in the right hand (holding-right on the arm alone) or lets it go. */
  setCarry(on: boolean, fade = 0.2): this {
    if (on === this.carrying) return this;
    this.carrying = on;
    const arm = this.action('holding-right~arm');
    if (arm) {
      if (on) { arm.reset().setEffectiveWeight(1).play(); if (fade > 0) arm.fadeIn(fade); }
      else if (fade > 0) arm.fadeOut(fade);
      else arm.stop();
      this.carryAction = on ? arm : null;
    }
    // swap the base clip for its copy with (or without) the right arm
    const clip = this.clip;
    const at = this.current ? this.current.time / this.current.getClip().duration : 0;
    const prev = this.current;
    const next = this.action(on ? clip + '~R' : clip);
    if (next && prev && next !== prev) {
      next.reset();
      next.timeScale = prev.timeScale;
      next.time = at * next.getClip().duration;
      next.play();
      if (fade > 0) prev.crossFadeTo(next, fade, false);
      else prev.stop();
      this.current = next;
    }
    return this;
  }

  /**
   * Walks: the walk clip (base layer) with its time set from the distance walked, so one loop of
   * the clip covers WALK_LOOP·stride metres and the feet do not skate.
   */
  walk(dist: number, o: { fade?: number; stride?: number } = {}): this {
    this.stride = o.stride ?? 1;
    this.gaitDist += dist;
    this.play('walk', { fade: o.fade ?? 0.15, speed: 0 });
    const a = this.current!;
    const loop = Person.WALK_LOOP * this.stride;
    a.time = (((this.gaitDist / loop) % 1) + 1) % 1 * a.getClip().duration;
    return this;
  }

  /** Sets the walk cycle so the next steps start from the given phase (0.45: feet together, right leg next). */
  gaitPhase(phase: number): this {
    this.gaitDist = phase * Person.WALK_LOOP * this.stride;
    return this;
  }

  /**
   * The legs layer: steps on the spot (turning, cheering) under a base clip that leaves the legs
   * alone. `dist` is the ground the feet cover this frame; `w` the layer's weight.
   */
  stepLegs(dist: number, w: number, stride = 0.5): this {
    const a = this.action('walk~legs');
    if (!a) return this;
    if (w <= 0.001) {
      if (this.legsAction) { this.legsAction.stop(); this.legsAction = null; }
      return this;
    }
    if (!this.legsAction) { a.reset().play(); a.timeScale = 0; this.legsAction = a; }
    this.stride = stride;
    this.gaitDist += dist;
    a.setEffectiveWeight(w);
    a.time = (((this.gaitDist / (Person.WALK_LOOP * stride)) % 1) + 1) % 1 * a.getClip().duration;
    return this;
  }

  /** Clip progress 0..1 of the current clip. */
  get progress(): number {
    const a = this.current;
    if (!a) return 1;
    return a.time / a.getClip().duration;
  }

  update(dt: number): void {
    // The mixer only writes a bone when its blended value changes, so the layers below must not
    // build on their own output: put back what the clips said last frame before the mixer runs,
    // and keep what it says now as the base the layers start from.
    for (const [bone, q] of this.clipPose) bone.quaternion.copy(q);
    this.mixer.update(dt);
    for (const [bone, q] of this.clipPose) q.copy(bone.quaternion);
    this.applyLayers();
    this.body.position.y = this.lift;
    this.root.updateMatrixWorld(true);
    if (this.ground) {
      // the lowest point of either sole on the floor
      let low = Infinity;
      for (const f of this.feet) for (const p of f.pts) low = Math.min(low, f.bone.localToWorld(v1.copy(p)).y);
      if (Number.isFinite(low)) {
        this.body.position.y += this.root.position.y - low;
        this.root.updateMatrixWorld(true);
      }
    }
    // the blob shadow shrinks as the body leaves the floor
    const s = Math.max(0.4, 1 - Math.max(0, this.body.position.y) * 0.8);
    this.shadow.scale.setScalar(s);
  }

  /** The procedural poses, blended over what the clips left in the bones. */
  private applyLayers(): void {
    const b = this.bones;
    const torso = b.get('torso');
    const t = this.torso;
    if (torso && t.w > 0) {
      // keep part of the clip's own twist, add the lean
      const clipQ = qa.copy(torso.quaternion);
      const kept = qb.copy(ID).slerp(clipQ, t.keep);
      qc.setFromAxisAngle(AY, t.yaw).multiply(qd.setFromAxisAngle(AX, t.pitch)).multiply(kept);
      torso.quaternion.slerp(qc, t.w);
    }
    const pitch = t.w * t.pitch;
    const arm = b.get('arm-right');
    if (arm && this.armR.w > 0) {
      const a = this.armR;
      // the swing is measured from hanging straight down in the world, whatever the torso's lean
      armQuat(-1, a.swing + pitch, a.abd, a.twist, qArm);
      arm.quaternion.slerp(qArm, a.w);
    }
    const armL = b.get('arm-left');
    if (armL && this.armL.w > 0) {
      const a = this.armL;
      armQuat(1, a.swing + pitch, a.abd, a.twist, qArm);
      armL.quaternion.slerp(qArm, a.w);
    }
    // leg amplitude (the walk clip swings ±60°; shorter strides swing less)
    const L = b.get('leg-left'), R = b.get('leg-right');
    const amp = Math.min(1, 0.55 + this.stride * 0.45);
    if (L && R && amp < 1) {
      L.quaternion.slerp(ID, 1 - amp);
      R.quaternion.slerp(ID, 1 - amp);
    }
    const g = this.legs;
    if (L && R && g.w > 0) {
      // left (front) leg forward, right (back) leg trailing behind and across, hips turned open
      qa.setFromAxisAngle(AX, -g.front).multiply(qb.setFromAxisAngle(AZ, -g.spread * 0.5));
      L.quaternion.slerp(qa, g.w);
      qa.setFromAxisAngle(AX, g.back).multiply(qb.setFromAxisAngle(AZ, g.cross));
      R.quaternion.slerp(qa, g.w);
    }
    const head = b.get('head');
    if (head && (this.headPitch || this.headYaw)) head.quaternion.premultiply(qa.setFromAxisAngle(AY, this.headYaw)).multiply(qb.setFromAxisAngle(AX, this.headPitch));
  }

  /** Clears the procedural layers (the clips alone drive the body again). */
  relax(): this {
    this.armR.w = this.armL.w = this.legs.w = this.torso.w = 0;
    this.headPitch = this.headYaw = 0;
    return this;
  }

  /** World position of the ball's centre in the right hand (call after update). */
  ballAt(out = new THREE.Vector3()): THREE.Vector3 {
    return this.grip.getWorldPosition(out);
  }

  /** World orientation of the ball in the right hand. */
  ballQuat(out = new THREE.Quaternion()): THREE.Quaternion {
    return this.grip.getWorldQuaternion(out);
  }

  /** World position of the fist's centre. */
  fistAt(out = new THREE.Vector3()): THREE.Vector3 {
    const arm = this.bones.get('arm-right');
    if (!arm) return out.copy(this.root.position);
    return arm.localToWorld(out.copy(FIST));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.obj);
    this.obj.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
  }
}

/** The right fist's centre in the arm bone's space (model units; the arm runs along -x in the T-pose). */
export const FIST = new THREE.Vector3(-0.245, 0, 0.06);
/** Ball centre in the arm bone's space: on the palm side (-y) of the fist, the fingers in the holes. */
export const GRIP = new THREE.Vector3(-0.25, -(0.05 + BALL_R / UNIT * 0.82), 0.06);

/** World position of the ball in a person's right hand (call after the person's update). */
export function ballInHand(p: Person, out = new THREE.Vector3()): THREE.Vector3 {
  return p.ballAt(out);
}
