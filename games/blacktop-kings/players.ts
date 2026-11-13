// The ballers: rigged Kenney Mini Characters, one AnimationMixer each, every move one of the
// model's own clips (idle, walk, sprint, jump, crouch, interact-right for a pass,
// attack-melee-right for a steal swipe and the dunk slam, holding-both for the shot, fall for a
// stumble, emote-yes / emote-no at the end). The team kit is painted into the model: the
// triangles of the torso (and the sleeves and shorts, found by the colour cells they sample)
// take the team colour through vertex colours over a white cell of the shared colormap.
import { THREE, model, modelClips } from '@core/three';
import type { Act } from './sim';

/** Metres per model unit: a 0.67-unit Mini Character stands about 1.95 m. */
export const FIG = 2.9;

type Clip = 'idle' | 'walk' | 'sprint' | 'jump' | 'fall' | 'crouch' | 'interact-right' | 'attack-melee-right' | 'holding-both' | 'emote-yes' | 'emote-no' | 'pick-up';
const ONCE = new Set<Clip>(['interact-right', 'attack-melee-right', 'jump', 'pick-up']);
const WALK_LOOP = 1.75;    // metres covered by one loop of the walk clip
const SPRINT_LOOP = 3.4;

/** A white cell of the Mini Characters' colormap (u, v): vertex colours tint it to any colour. */
const WHITE_UV: [number, number] = [0.906, 0.875];

export interface Kit { shirt: number; shorts: number; trim: number }

/** What the view knows about a player this frame. */
export interface FigState {
  x: number; z: number; face: number; lift: number; act: Act; actT: number; spd: number; turbo: boolean;
  mood: number;            // 0 play, 1 cheer, 2 sad
  guard: boolean;          // standing in a defensive stance
}

const cell = (u: number, v: number) => Math.floor(u * 16) + Math.floor(v * 16) * 16;

/** Paints the team kit into a copy of a skinned body geometry. */
function kitGeometry(mesh: THREE.SkinnedMesh, kit: Kit, skinCells: Set<number>): THREE.BufferGeometry {
  const g = mesh.geometry.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const n = pos.count;
  const boneOf = (i: number) => {
    let j = si.getX(i), w = sw.getX(i);
    if (sw.getY(i) > w) { j = si.getY(i); w = sw.getY(i); }
    if (sw.getZ(i) > w) { j = si.getZ(i); w = sw.getZ(i); }
    if (sw.getW(i) > w) { j = si.getW(i); }
    return bones[j] ?? '';
  };
  // the shirt's colour cells: what the torso samples, except skin (the neck)
  const shirtCells = new Set<number>();
  const legCells = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const b = boneOf(i), c = cell(uv.getX(i), uv.getY(i));
    if (b === 'torso' && !skinCells.has(c)) shirtCells.add(c);
    if (b.startsWith('leg') && pos.getY(i) > 0.09) legCells.set(c, (legCells.get(c) ?? 0) + 1);
  }
  // the shorts: the cell most of the upper legs use
  let shortsCell = -1, most = 0;
  for (const [c, k] of legCells) if (k > most && !skinCells.has(c)) { most = k; shortsCell = c; }
  const col = new Float32Array(n * 3);
  const shirt = new THREE.Color(kit.shirt), shorts = new THREE.Color(kit.shorts), white = new THREE.Color(0xffffff);
  for (let i = 0; i < n; i++) {
    const b = boneOf(i), c = cell(uv.getX(i), uv.getY(i));
    let to: THREE.Color | null = null;
    if (b === 'torso' && !skinCells.has(c)) to = shirt;
    else if (b.startsWith('arm') && shirtCells.has(c)) to = shirt;
    else if (b.startsWith('leg') && c === shortsCell && pos.getY(i) > 0.06) to = shorts;
    (to ?? white).toArray(col, i * 3);
    if (to) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** The colour cells of a model's head (skin), so the neck keeps its skin colour. */
function skinCellsOf(obj: THREE.Object3D): Set<number> {
  const counts = new Map<number, number>();
  obj.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !/head/.test(m.name)) return;
    const uv = m.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) { const c = cell(uv.getX(i), uv.getY(i)); counts.set(c, (counts.get(c) ?? 0) + 1); }
  });
  // the head's main colour is the skin
  const out = new Set<number>();
  let best = -1, most = 0;
  for (const [c, k] of counts) if (k > most) { most = k; best = c; }
  if (best >= 0) out.add(best);
  return out;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  clip: Clip = 'idle';
  private handR: THREE.Object3D | null = null;
  private handL: THREE.Object3D | null = null;
  private fistR = new THREE.Vector3();
  private fistL = new THREE.Vector3();
  private lastAct: Act = 'free';
  private lastActT = 0;
  /** Lean of the body (crossovers, turbo). */
  private lean = 0;
  private spin = 0;
  readonly mat: THREE.MeshLambertMaterial;

  constructor(key: string, kit: Kit, mat: THREE.MeshLambertMaterial) {
    this.mat = mat;
    this.obj = model(key, { shadows: true });
    const skin = skinCellsOf(this.obj);
    const skinned: THREE.SkinnedMesh[] = [];
    const bones = new Map<string, THREE.Object3D>();
    this.obj.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) skinned.push(m);
      else if (o.name) bones.set(o.name, o);
    });
    for (const m of skinned) {
      m.geometry = kitGeometry(m, kit, skin);
      m.material = mat;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = false;
    }
    this.obj.updateMatrixWorld(true);
    // the fists: the outer ends of the arms in the rest pose (arms out to the sides)
    const fist = (bone: string, side: 1 | -1, out: THREE.Vector3): THREE.Object3D | null => {
      const b = bones.get(bone);
      if (!b) return null;
      const box = new THREE.Box3();
      for (const sm of skinned) {
        const g = sm.geometry;
        const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const bi = sm.skeleton.bones.findIndex((x) => x.name === bone);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
          v.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix);
          box.expandByPoint(v);
        }
      }
      const c = box.isEmpty() ? new THREE.Vector3(-0.33 * side, 0.29, 0) : box.getCenter(new THREE.Vector3());
      const p = box.isEmpty() ? c : new THREE.Vector3(side === 1 ? box.min.x + 0.035 : box.max.x - 0.035, c.y, c.z);
      b.updateMatrixWorld(true);
      out.copy(p).applyMatrix4(b.matrixWorld.clone().invert());
      return b;
    };
    this.handR = fist('arm-right', 1, this.fistR);
    this.handL = fist('arm-left', -1, this.fistL);
    this.obj.scale.setScalar(FIG);
    this.body.add(this.obj);
    this.root.add(this.body);
    this.mixer = new THREE.AnimationMixer(this.obj);
    for (const c of modelClips(key)) {
      const a = this.mixer.clipAction(c);
      if (ONCE.has(c.name as Clip)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(c.name as Clip, a);
    }
    this.play('idle', { fade: 0 });
  }

  private play(clip: Clip, o: { fade?: number; speed?: number; restart?: boolean; at?: number } = {}): void {
    const next = this.actions.get(clip);
    if (!next) return;
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.current === next && !o.restart) return;
    next.reset();
    if (o.speed === undefined) next.timeScale = 1;
    if (o.at !== undefined) next.time = o.at * next.getClip().duration;
    next.play();
    const fade = o.fade ?? 0.12;
    if (this.current && this.current !== next) {
      if (fade > 0) this.current.crossFadeTo(next, fade, false); else this.current.stop();
    }
    this.current = next;
    this.clip = clip;
  }

  private dur(c: Clip): number {
    return this.actions.get(c)?.getClip().duration ?? 0.5;
  }

  /** Poses the figure from the game state and advances its clips. */
  update(dt: number, s: FigState, hasBall: boolean): void {
    this.root.position.set(s.x, 0, s.z);
    this.body.position.y = s.lift;
    const fresh = s.act !== this.lastAct || s.actT < this.lastActT - 0.05;
    this.lastAct = s.act; this.lastActT = s.actT;
    let leanTo = 0;
    let spinTo = 0;
    switch (s.act) {
      case 'shot':
        // the gather: both hands up with the ball, then up into the jump
        if (s.actT < 0.95) this.play('holding-both', { fade: 0.08 });
        else this.play('fall', { fade: 0.15 });
        break;
      case 'dunk':
        if (s.actT < 0.42) this.play('jump', { fade: 0.06, speed: 0.9 });
        else if (s.actT < 0.95) this.play('attack-melee-right', { fade: 0.05, speed: 1.4, restart: fresh });
        else this.play('fall', { fade: 0.1 });
        // a full spin on the way up
        if (s.actT < 0.58) spinTo = (s.actT / 0.58) * Math.PI * 2;
        break;
      case 'jump':
        if (fresh) this.play('jump', { fade: 0.05, restart: true, speed: 0.75 });
        else this.play('jump', { fade: 0.05, speed: 0.75 });
        break;
      case 'pass':
        this.play('interact-right', { fade: 0.05, restart: fresh, speed: 1.8 });
        break;
      case 'steal':
        this.play('attack-melee-right', { fade: 0.05, restart: fresh, speed: 1.6 });
        leanTo = 0.25;
        break;
      case 'cross':
        this.play('sprint', { fade: 0.05, speed: 2 });
        leanTo = 0.3;
        break;
      case 'stumble':
        this.play('fall', { fade: 0.08, speed: 1.2 });
        leanTo = -0.35;
        break;
      default:
        if (s.mood === 1 && s.spd < 0.6) this.play('emote-yes', { fade: 0.2 });
        else if (s.mood === 2 && s.spd < 0.6) this.play('emote-no', { fade: 0.2 });
        else if (s.spd > 5.6) this.play('sprint', { fade: 0.15, speed: (s.spd / SPRINT_LOOP) * this.dur('sprint') });
        else if (s.spd > 0.45) this.play('walk', { fade: 0.15, speed: Math.max(0.6, s.spd / WALK_LOOP) * this.dur('walk') });
        else if (s.guard) this.play('crouch', { fade: 0.2 });
        else this.play('idle', { fade: 0.2 });
        if (s.turbo) leanTo = 0.18;
    }
    this.lean += (leanTo - this.lean) * Math.min(1, dt * 10);
    this.spin = spinTo;
    this.body.rotation.set(this.lean, s.face + this.spin, 0, 'YXZ');
    this.mixer.update(dt);
    void hasBall;
  }

  /** World position of the right fist (the dribbling hand). */
  handRight(out: THREE.Vector3): THREE.Vector3 {
    if (!this.handR) return out.set(this.root.position.x, 1, this.root.position.z);
    this.root.updateMatrixWorld(true);
    return out.copy(this.fistR).applyMatrix4(this.handR.matrixWorld);
  }

  handLeft(out: THREE.Vector3): THREE.Vector3 {
    if (!this.handL) return out.set(this.root.position.x, 1, this.root.position.z);
    return out.copy(this.fistL).applyMatrix4(this.handL.matrixWorld);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.obj);
  }

  /** Frees this figure's own GPU data (its kit-painted geometry and its skeleton) when it leaves mid-round. */
  free(): void {
    this.obj.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry.dispose();
      m.skeleton.dispose();
    });
  }
}
