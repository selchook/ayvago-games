// Astro Crew: one of the kit's rigged figures drawn as itself. `astronauts` holds the four crew
// animals on one skeleton (a figure shows one body, `a-<animal>`, plus the `pistol` on its hand);
// `blobs` holds the two blob aliens (`e-xs`, `e-s`); the mechs, the flyer and the brute have a body
// each. Every move is the model's own clip through one AnimationMixer (Run_Gun_Shoot, Duck for the
// roll, Punch, Jump, Death, Wave; the mech's Shoot_Big and Kick; the aliens' Headbutt and Punch ...),
// never added limbs. Each figure has its own material, so it can flash white when hit.
import { THREE, model, modelClips } from '@core/three';
import { sk } from './kit';

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
