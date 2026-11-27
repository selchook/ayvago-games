// Monster Roundup: one rigged figure (a mech or a monster) drawn as itself. Every move is the model's
// own clip through one AnimationMixer: the mechs' Walk, Run, Shoot, Pickup, HitRecieve_1, Death, Hello
// and Dance; the blobs' Walk, Jump, Bite_Front, HitRecieve, Death (dizzy), Dance; the flyers'
// Flying_Idle, Fast_Flying, Headbutt, HitReact, Death; the bosses' Walk, Run, Punch, Weapon, Jump, Wave
// and Death. Never added limbs.
//
// Layers. A mech walks and shoots at once: each clip is split by bones into a lower half (the legs
// and the body's root) and an upper half (the torso and everything on it), played as two actions.
// `overlay()` swaps only the upper half for a while (Shoot, Pickup), so the legs keep walking. The
// halves touch disjoint bones, so nothing is premultiplied and no bone drifts.
import { THREE, model, modelClips } from '@core/three';
import { figKey } from './kit';

export interface PlayOpts { fade?: number; speed?: number; once?: boolean; restart?: boolean }

const boxes = new Map<string, { h: number; minY: number; w: number }>();
/** The model's rest box (height, lowest point, footprint), measured once. */
export function restBox(file: string): { h: number; minY: number; w: number } {
  let b = boxes.get(file);
  if (b) return b;
  const o = model(figKey(file), { shadows: false });
  o.updateMatrixWorld(true);
  // the skinned vertices in the rest pose (not the bind-space geometry box)
  const box = new THREE.Box3().setFromObject(o, true);
  const size = box.getSize(new THREE.Vector3());
  b = { h: size.y, minY: box.min.y, w: Math.max(size.x, size.z) };
  boxes.set(file, b);
  return b;
}

interface Half { lower: THREE.AnimationClip; upper: THREE.AnimationClip }

const splits = new Map<string, Map<string, Half>>();

export class Figure {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly mat: THREE.MeshLambertMaterial;
  private clips = new Map<string, THREE.AnimationClip>();
  private act: THREE.AnimationAction | null = null;
  private upAct: THREE.AnimationAction | null = null;
  name = '';
  private over = '';
  private overT = 0;
  private flashT = 0;
  private glow = new THREE.Color(0, 0, 0);
  private halves: Map<string, Half> | null = null;
  /** Scale from model units to metres. */
  readonly scale: number;

  constructor(readonly file: string, height: number, o: { layered?: boolean; heightOf?: 'box' | 'above' } = {}) {
    this.body = model(figKey(file), { shadows: false });
    const rb = restBox(file);
    const h = o.heightOf === 'above' ? rb.h + rb.minY : rb.h;
    this.scale = height / Math.max(0.01, h);
    this.body.scale.setScalar(this.scale);
    this.root.add(this.body);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.body.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = this.mat;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const c of modelClips(figKey(file))) this.clips.set(c.name, c);
    if (o.layered) this.halves = this.split();
  }

  /** Each clip split into lower and upper halves at the torso (cached per file). */
  private split(): Map<string, Half> {
    let m = splits.get(this.file);
    if (m) return m;
    m = new Map();
    const upper = new Set<string>();
    const torso = this.body.getObjectByName('Torso');
    torso?.traverse((b) => { if (b !== torso || true) upper.add(b.name); });
    for (const [name, clip] of this.clips) {
      const lo: THREE.KeyframeTrack[] = [], up: THREE.KeyframeTrack[] = [];
      for (const t of clip.tracks) (upper.has(t.name.split('.')[0]) ? up : lo).push(t);
      m.set(name, { lower: new THREE.AnimationClip(name + '_lo', clip.duration, lo), upper: new THREE.AnimationClip(name + '_up', clip.duration, up) });
    }
    splits.set(this.file, m);
    return m;
  }

  has(name: string): boolean { return this.clips.has(name); }

  private start(clip: THREE.AnimationClip, o: PlayOpts, from: THREE.AnimationAction | null): THREE.AnimationAction {
    const next = this.mixer.clipAction(clip);
    next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!o.once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.reset();
    next.timeScale = o.speed ?? 1;
    next.play();
    if (from && from !== next) next.crossFadeFrom(from, o.fade ?? 0.15, false);
    return next;
  }

  /** Plays a clip on the whole body (no-op when it already plays, unless `restart`). */
  play(name: string, o: PlayOpts = {}): void {
    const clip = this.clips.get(name);
    if (!clip) return;
    if (this.name === name && !o.restart) {
      if (o.speed !== undefined) { if (this.act) this.act.timeScale = o.speed; if (this.upAct && !this.over) this.upAct.timeScale = o.speed; }
      return;
    }
    this.name = name;
    if (this.halves) {
      const h = this.halves.get(name)!;
      this.act = this.start(h.lower, o, this.act);
      if (!this.over) { this.upAct = this.start(h.upper, o, this.upAct); this.upAct.time = this.act.time; }
      return;
    }
    this.act = this.start(clip, o, this.act);
  }

  /** The upper half plays `name` for `secs` (a layered figure), then follows the legs again. */
  overlay(name: string, secs: number, o: PlayOpts = {}): void {
    if (!this.halves) { this.play(name, { ...o, restart: true, once: true }); return; }
    const h = this.halves.get(name);
    if (!h) return;
    if (this.over === name && !o.restart) { this.overT = Math.max(this.overT, secs); return; }
    this.over = name;
    this.overT = secs;
    this.upAct = this.start(h.upper, { fade: 0.08, ...o }, this.upAct);
  }

  /** Seconds the current clip has run, as a share of its length. */
  progress(): number { return this.act ? this.act.time / Math.max(0.01, this.act.getClip().duration) : 0; }

  flash(t = 0.12): void { this.flashT = Math.max(this.flashT, t); }
  setGlow(c: number): void { this.glow.setHex(c); }
  setGlowRGB(r: number, g: number, b: number): void { this.glow.setRGB(r, g, b); }

  update(dt: number): void {
    if (this.over) {
      this.overT -= dt;
      if (this.overT <= 0) {
        this.over = '';
        const h = this.halves?.get(this.name);
        if (h && this.act) { this.upAct = this.start(h.upper, { fade: 0.18, speed: this.act.timeScale }, this.upAct); this.upAct.time = this.act.time; }
      }
    }
    this.mixer.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT > 0 ? 0.55 : 0;
    this.mat.emissive.setRGB(this.glow.r + f, this.glow.g + f, this.glow.b + f);
  }

  /** Frees what this figure made (its material and the skeletons' bone textures). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    this.root.parent?.remove(this.root);
    this.body.traverse((o) => { const s = o as THREE.SkinnedMesh; if (s.isSkinnedMesh) s.skeleton.dispose(); });
    this.mat.dispose();
  }
}
