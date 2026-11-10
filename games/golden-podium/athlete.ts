// Athletes are rigged 3D models from Kenney Mini Characters 2.0: one AnimationMixer each, with
// crossfades between the model's own clips (idle, crouch, sprint, jump, fall, sit, emote-yes,
// emote-no, holding-both …). The running clip's speed follows the athlete's real speed so the
// feet keep pace with the ground. Swimming lays the model flat in the water and turns its own arm
// and leg bones (a crawl), and the archer holds the kit's bow in the left hand. A soft blob shadow
// and a ring in the team colour sit under the feet.
import { THREE, model, modelClips, miniKey } from '@core/three';

/** Height of a standing athlete in metres. */
export const ATHLETE_H = 1.8;
/** Height of the Mini Characters' reference model (character-male-a) in model units. */
const MODEL_H = 0.671;
/** Metres per model unit: every athlete shares the scale, so bodies match (hats stick out). */
export const UNIT = ATHLETE_H / MODEL_H;
/** Hip height (leg joints) in metres: the pivot for dives and swimming. */
export const HIP = 0.176 * UNIT;

/** Metres covered by one loop of the sprint and walk clips (two steps), so feet do not skate. */
const SPRINT_LOOP_M = 2.7;
const WALK_LOOP_M = 1.7;

export type Clip =
  | 'static' | 'idle' | 'walk' | 'sprint' | 'jump' | 'fall' | 'crouch' | 'sit' | 'die' | 'pick-up'
  | 'emote-yes' | 'emote-no' | 'holding-both' | 'holding-both-shoot' | 'holding-left' | 'holding-left-shoot'
  | 'holding-right' | 'holding-right-shoot' | 'interact-right';

/** Clips that play once and hold their last frame. */
const ONCE = new Set<Clip>(['die', 'pick-up', 'holding-both-shoot', 'holding-left-shoot', 'holding-right-shoot']);

const textures = new Map<string, THREE.Texture>();

/** A canvas texture made once (track markings, target faces, banners …). */
export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.Texture {
  let tx = textures.get(key);
  if (tx) return tx;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  if (repeat) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(repeat[0], repeat[1]);
  }
  textures.set(key, tx);
  return tx;
}

/** A soft round shadow. */
export function blobTexture(): THREE.Texture {
  return canvasTex('blob', 128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

// ------------------------------------------------------------------ shared look

let skin: THREE.MeshLambertMaterial | null = null;
const ringGeo = new THREE.RingGeometry(0.34, 0.42, 32);
const blobGeo = new THREE.PlaneGeometry(1.1, 0.55);
let blobMat: THREE.MeshBasicMaterial | null = null;

/**
 * One matte material for every character (they all use the kit's colormap): the kit's PBR
 * material renders flat and dark under this light, and one material keeps state changes down.
 */
function skinOf(src: THREE.Material): THREE.MeshLambertMaterial {
  if (!skin) {
    const map = (src as THREE.MeshStandardMaterial).map ?? null;
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
    skin = new THREE.MeshLambertMaterial({ map, color: 0xffffff });
    skin.name = 'mini-characters';
  }
  return skin;
}

/** The bow of the kit, one shared copy of its geometry. */
export function bowModel(): THREE.Object3D {
  const b = model('bow', { shadows: true });
  b.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = skinOf(m.material as THREE.Material);
  });
  return b;
}

/**
 * Joy at the finish and on the podium: bursts of emote-yes, and with `hops` a few jumps with the
 * jump clip in between. `t` is the time since the celebration began.
 */
export function celebrate(a: Athlete, t: number, hops = true): void {
  const cyc = t % 2.6;
  if (hops && cyc > 1.34) {
    const k = ((cyc - 1.34) / 0.42) % 1;
    a.lift = Math.sin(k * Math.PI) * 0.42;
    a.play('jump', { fade: 0.08 });
  } else {
    a.lift = 0;
    a.play('emote-yes', { fade: 0.15 });
  }
}

const Q = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

type Bone = 'root' | 'torso' | 'head' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right';

export class Athlete {
  /** On the ground at the athlete's place (shadow and ring live here). */
  readonly root = new THREE.Group();
  /** Turned to face the way and lifted for jumps. */
  readonly body = new THREE.Group();
  /** Pivot at the hips: tilts the body for dives and swimming. */
  private tilt = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private bones = new Map<Bone, THREE.Object3D>();
  private shadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private bow: THREE.Object3D | null = null;
  clip: Clip = 'idle';
  /** Extra height of the body above the root (jumps, dives); the shadow stays on the ground. */
  lift = 0;
  /** Swimming: the body lies in the water and the crawl phase (strokes) drives arms and legs. */
  swimming = false;
  private strokePhase = 0;
  private strokeRate = 0;
  private breathe = 0;
  /** Body tilt forward in radians (0 upright … π/2 flat), for the dive. */
  pitch = 0;

  constructor(readonly key: string, readonly color: number, readonly scale = 1) {
    this.obj = model(key, { shadows: true });
    this.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = skinOf(m.material as THREE.Material);
        // the skinned bounds come from the bind pose; jumps and dives move far from it
        m.frustumCulled = false;
      }
      if (['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'].includes(o.name) && !(o as THREE.Mesh).isMesh) {
        this.bones.set(o.name as Bone, o);
      }
    });
    this.obj.scale.setScalar(UNIT * scale);
    this.obj.position.y = -HIP * scale;
    this.tilt.position.y = HIP * scale;
    this.tilt.add(this.obj);
    this.body.add(this.tilt);
    this.face(0);
    this.mixer = new THREE.AnimationMixer(this.obj);
    for (const c of modelClips(key)) {
      const a = this.mixer.clipAction(c);
      if (ONCE.has(c.name as Clip)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(c.name as Clip, a);
    }
    blobMat ??= new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(blobGeo, blobMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.scale.setScalar(scale);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.set(1.4 * scale, 0.8 * scale, 1);
    this.ring.position.y = 0.025;
    this.ring.userData.ownMaterial = true;
    this.root.add(this.shadow, this.ring, this.body);
    this.play('idle', { fade: 0 });
  }

  /** Turns the athlete: 0 faces +x (down the track), π/2 faces the camera side (+z). */
  face(yaw: number): this {
    // the models face +z; +π/2 turns them to +x
    this.body.rotation.y = Math.PI / 2 - yaw;
    return this;
  }

  /**
   * Crossfades to a clip. `speed` is the clip's time scale; `restart` plays it again from the
   * start when it is already on.
   */
  play(clip: Clip, o: { fade?: number; speed?: number; restart?: boolean; at?: number } = {}): this {
    const next = this.actions.get(clip);
    if (!next) return this;
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.current === next && !o.restart) return this;
    const fade = o.fade ?? 0.18;
    next.reset();
    if (o.speed === undefined) next.timeScale = 1;
    if (o.at !== undefined) next.time = o.at * next.getClip().duration;
    next.play();
    if (this.current && this.current !== next && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current && this.current !== next) this.current.stop();
    this.current = next;
    this.clip = clip;
    return this;
  }

  /** True while a play-once clip is still running. */
  get busy(): boolean {
    const a = this.current;
    return !!a && ONCE.has(this.clip) && a.isRunning();
  }

  /**
   * Running at `v` m/s: the sprint clip (a walk when slow) with its speed set from v, so one
   * loop covers the distance the clip's two steps would.
   */
  run(v: number): this {
    if (v < 2.6) {
      const ts = Math.max(0.35, v / WALK_LOOP_M) * this.dur('walk');
      return this.play('walk', { speed: ts, fade: 0.2 });
    }
    const ts = (v / SPRINT_LOOP_M) * this.dur('sprint');
    return this.play('sprint', { speed: ts, fade: this.clip === 'walk' ? 0.25 : 0.12 });
  }

  private dur(c: Clip): number {
    return this.actions.get(c)?.getClip().duration ?? 0.5;
  }

  /** Shows or hides the shadow and the team ring. */
  showMarks(shadow: boolean, ring = shadow): void {
    this.shadow.visible = shadow;
    this.ring.visible = ring;
  }

  /**
   * The archer's stance: the kit's bow in the left fist, the left arm held out straight to the
   * side (towards the target when the athlete faces the camera side), the right arm from the
   * holding-right / holding-right-shoot clips drawing and releasing.
   */
  holdBow(on: boolean): void {
    if (on && !this.bow) {
      const arm = this.bones.get('arm-left');
      if (!arm) return;
      const b = bowModel();
      // the middle of the stave in the fist at the end of the arm, upright, bulging outwards
      b.position.set(0.04, -0.24, -0.19);
      const g = new THREE.Group();
      g.add(b);
      g.position.set(0.3, 0.0, 0);
      g.rotation.set(0, Math.PI / 2, 0);
      arm.add(g);
      this.bow = g;
    }
    if (this.bow) this.bow.visible = on;
    if (this.bowArm && !on) {
      this.bones.get('head')?.quaternion.identity();
      this.bones.get('arm-left')?.quaternion.identity();
    }
    this.bowArm = on;
  }
  private bowArm = false;

  /** Lays the model flat in the water (head to +x, face down) or stands it up again. */
  setSwim(on: boolean): void {
    this.swimming = on;
    this.strokeRate = 0;
    if (on) {
      this.play('static', { fade: 0 });
      this.pitch = Math.PI / 2;
    } else {
      this.pitch = 0;
      this.restoreBones();
    }
  }

  /** Swimming speed of the arms: strokes per second (0 = gliding). */
  setStroke(rate: number): void {
    this.strokeRate = rate;
  }

  /** Turns the head out of the water for a breath. */
  breath(): void {
    this.breathe = 1;
  }

  private restoreBones(): void {
    for (const b of this.bones.values()) b.quaternion.identity();
  }

  /** Frees what this copy owns (its skeletons and ring); the geometry stays shared. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.obj);
    this.obj.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
    (this.ring.material as THREE.Material).dispose();
  }

  /** Advances the animation by `dt` seconds of game time; call every frame. */
  update(dt: number): void {
    const vis = this.root.visible && (this.root.parent?.visible ?? false);
    if (vis) {
      this.mixer.update(dt);
      if (this.swimming) this.crawl(dt);
      // the bow arm stays out towards the target whatever the clip does with the other arm
      // and the archer looks along it
      if (this.bowArm) {
        this.bones.get('arm-left')?.quaternion.identity();
        this.bones.get('head')?.quaternion.setFromAxisAngle(AY, 1.15);
      }
    }
    this.body.position.y = this.lift;
    this.tilt.rotation.x = this.pitch;
    const s = Math.max(0.45, Math.min(1, 1 - this.lift * 0.25));
    this.shadow.scale.set(s * this.scale, s * this.scale, 1);
  }

  /**
   * Freestyle on the model's own bones: the arms turn over at the shoulders half a stroke
   * apart, the legs flutter, the body rolls with each stroke and the head turns for air.
   */
  private crawl(dt: number): void {
    this.strokePhase += dt * this.strokeRate * Math.PI;   // one arm stroke = π
    this.breathe = Math.max(0, this.breathe - dt * 1.6);
    const ph = this.strokePhase;
    const arm = (name: Bone, side: number, off: number) => {
      const b = this.bones.get(name);
      if (!b) return;
      // the arm down along the body (towards the feet), then over and round the shoulder
      Q2.setFromAxisAngle(AZ, -side * Math.PI / 2);
      Q.setFromAxisAngle(AX, -(ph + off));
      b.quaternion.copy(Q).multiply(Q2);
    };
    arm('arm-left', 1, 0);
    arm('arm-right', -1, Math.PI);
    const kick = Math.sin(ph * 3) * 0.32;
    this.bones.get('leg-left')?.quaternion.setFromAxisAngle(AX, kick);
    this.bones.get('leg-right')?.quaternion.setFromAxisAngle(AX, -kick);
    // body roll about its own length and a breath to the side
    this.bones.get('torso')?.quaternion.setFromAxisAngle(AY, Math.sin(ph) * 0.35 * Math.min(1, this.strokeRate));
    this.bones.get('head')?.quaternion.setFromAxisAngle(AY, this.breathe * 1.1);
  }
}

/** The model key of an athlete's model name. */
export const athleteKey = miniKey;
