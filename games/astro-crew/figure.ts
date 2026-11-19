// Astro Crew: one of the kit's rigged figures drawn as itself. `astronauts` holds the four crew
// animals on one skeleton (a figure shows one body, `a-<animal>`, plus the `pistol` on its hand);
// `blobs` holds the two blob aliens (`e-xs`, `e-s`); the mechs, the flyer and the brute have a body
// each. Every move is the model's own clip through one AnimationMixer (Run_Gun_Shoot, Duck for the
// roll, Punch, Jump, Death, Wave; the mech's Shoot_Big, Shoot_Small and Kick; the aliens' Headbutt
// and Punch ...), never added limbs. Each figure has its own material, so it can flash white when hit.
//
// Aiming. The kit has no standing-and-aiming clip, so `Aim_Stand` is layered from the model's own
// clips: Idle_Gun everywhere but the right arm, which holds Run_Gun_Shoot's raised, pointing pose.
// After the mixer, `aim()` turns the upper arm (one bone, the model's own) so the barrel points
// exactly at the target, standing or running. `muzzle()` gives the gun's tip in the world from the
// pistol's (or, for a mech, the chest's) transform, so shots, flashes and beams start right there.
import { THREE, model, modelClips } from '@core/three';
import { sk } from './kit';

/** The right arm's bones (the layered Aim_Stand takes them from Run_Gun_Shoot). */
const ARM_R = ['ShoulderR', 'UpperArmR', 'LowerArmR', 'Pinky1R', 'Pinky2R', 'Pinky3R', 'Middle1R', 'Middle2R', 'Middle3R', 'Index1R', 'Index2R', 'Index3R', 'Thumb1R', 'Thumb2R'];
/** The pistol's tip in its own (quantized) space: the barrel runs along +z, its bore at y 0.415. */
const PISTOL_TIP = new THREE.Vector3(0, 0.415, 1.0);
/** The mechs' two cannon mouths in model units (left, right), on the chest bone. */
export const MECH_GUNS: Record<string, [number, number, number]> = {
  'mech-frog': [1.06, 2.2, 0.98], 'mech-bee': [0.98, 1.92, 0.7], 'mech-flamingo': [0.42, 1.96, 0.7], 'mech-panda': [0.62, 2.12, 0.6],
};

const layered = new Map<string, THREE.AnimationClip>();
/** Idle_Gun with the right arm held in Run_Gun_Shoot's aiming pose (cached per file). */
function aimStand(file: string, clips: Map<string, THREE.AnimationClip>): THREE.AnimationClip | null {
  const hit = layered.get(file);
  if (hit) return hit;
  const base = clips.get('Idle_Gun'), top = clips.get('Run_Gun_Shoot');
  if (!base || !top) return null;
  const arm = new Set(ARM_R);
  const tracks: THREE.KeyframeTrack[] = base.tracks.filter((t) => !arm.has(t.name.split('.')[0])).map((t) => t.clone());
  for (const t of top.tracks) {
    if (!arm.has(t.name.split('.')[0])) continue;
    const v = Array.from(t.createInterpolant().evaluate(0.25) as ArrayLike<number>);
    const Ctor = t.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    tracks.push(new Ctor(t.name, [0, base.duration], [...v, ...v]));
  }
  const clip = new THREE.AnimationClip('Aim_Stand', base.duration, tracks);
  layered.set(file, clip);
  return clip;
}

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tq3 = new THREE.Quaternion();
const ID = new THREE.Quaternion();

export interface PlayOpts { fade?: number; speed?: number; once?: boolean; restart?: boolean; then?: string; thenSpeed?: number }

export class Figure {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly mat: THREE.MeshLambertMaterial;
  private parts = new Map<string, THREE.Object3D>();
  private clips = new Map<string, THREE.AnimationClip>();
  private act: THREE.AnimationAction | null = null;
  name = '';
  /** The pool this figure belongs to (the view's alien pools). */
  tag = '';
  private flashT = 0;
  private flashCd = 0;
  private glow = new THREE.Color(0, 0, 0);
  private then: { name: string; o: PlayOpts } | null = null;

  constructor(readonly file: string, scale: number, show?: string[]) {
    this.body = model(sk(file), { shadows: true });
    this.body.scale.setScalar(scale);
    this.root.add(this.body);
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
    for (const c of modelClips(sk(file))) this.clips.set(c.name, c);
    if (file === 'astronauts') {
      const a = aimStand(file, this.clips);
      if (a) this.clips.set('Aim_Stand', a);
      this.upper = this.body.getObjectByName('UpperArmR') ?? null;
      this.pistol = this.body.getObjectByName('pistol') ?? null;
    }
    const guns = MECH_GUNS[file];
    if (guns) {
      // the cannons' mouths on the chest bone, measured once in the rest pose
      this.chest = this.body.getObjectByName('Chest') ?? null;
      if (this.chest) {
        this.play('Idle');
        this.mixer.update(0);
        this.root.updateMatrixWorld(true);
        const inv = this.chest.matrixWorld.clone().invert();
        for (const side of [1, -1]) {
          const p = new THREE.Vector3(guns[0] * side, guns[1], guns[2]).applyMatrix4(this.body.matrixWorld).applyMatrix4(inv);
          this.guns.push(p);
        }
        this.mixer.stopAllAction();
        this.act = null;
        this.name = '';
      }
    }
  }

  private upper: THREE.Object3D | null = null;
  private pistol: THREE.Object3D | null = null;
  private chest: THREE.Object3D | null = null;
  private guns: THREE.Vector3[] = [];

  /** The gun's tip in the world (a mech: cannon 0 = its left, 1 = its right). */
  muzzle(out: THREE.Vector3, side = 0): THREE.Vector3 | null {
    if (this.pistol) return out.copy(PISTOL_TIP).applyMatrix4(this.pistol.matrixWorld);
    if (this.chest && this.guns.length) return out.copy(this.guns[side % this.guns.length]).applyMatrix4(this.chest.matrixWorld);
    return null;
  }

  /**
   * Points the gun at `target` (weight 0..1): turns the upper arm by the rotation that takes the
   * barrel's direction onto the line from the tip to the target (twice, as the tip moves with it).
   * Call after update(), with the root placed.
   */
  aim(target: THREE.Vector3, w: number): void {
    if (!this.upper || !this.pistol || w <= 0.01) return;
    this.root.updateMatrixWorld(true);
    for (let k = 0; k < 3; k++) {
      const m = tv.copy(PISTOL_TIP).applyMatrix4(this.pistol.matrixWorld);
      const dir = tv2.set(0, 0, 1).transformDirection(this.pistol.matrixWorld);
      const want = target.clone().sub(m).normalize();
      // no wild twists when the target is behind (the body turns to it first)
      if (dir.dot(want) < -0.5) return;
      tq.setFromUnitVectors(dir, want);
      tq.slerpQuaternions(ID, tq, w);
      this.upper.getWorldQuaternion(tq2);
      this.upper.parent!.getWorldQuaternion(tq3);
      tq2.premultiply(tq);
      this.upper.quaternion.copy(tq3.invert().multiply(tq2));
      this.upper.updateMatrixWorld(true);
    }
  }

  /** Shows only the named parts (one animal's body and the pistol ...). */
  show(names: string[]): void {
    for (const [n, o] of this.parts) o.visible = names.includes(n);
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
    if (this.act && this.act !== next) next.crossFadeFrom(this.act, o.fade ?? 0.12, false);
    this.act = next;
    this.name = name;
  }

  /** A short white flash (not more than every 0.2 s, so a figure under fire still shows its colours). */
  flash(t = 0.1): void { if (this.flashCd > 0) return; this.flashT = t; this.flashCd = 0.2; }
  setGlow(c: number): void { this.glow.setHex(c); }
  setTint(c: number): void { this.mat.color.setHex(c); }

  update(dt: number): void {
    this.mixer.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flashCd = Math.max(0, this.flashCd - dt);
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
    this.mat.color.setHex(0xffffff);
    this.mat.opacity = 1;
    this.mat.transparent = false;
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
