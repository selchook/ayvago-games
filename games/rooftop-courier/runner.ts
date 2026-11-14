// Rooftop Courier: the courier on screen. The player's own Mini Character plays its clips through
// one AnimationMixer (sprint tied to the running speed so the feet do not slide, jump, fall,
// sit, crouch, idle) and on top of them the bones are posed per move: a tuck in the air, the
// slide leaning back on one hand, the vault with a hand planted on the wall, both hands up on the
// zip-line, hand over hand on a ladder, a forward roll, the stumble and the fall. Hands that touch
// something (the wall, the cable, the rungs, the ledge) are aimed at it bone by bone. The courier
// wears a satchel on the back and, if bought, a cap: plain meshes on the torso and head bones;
// the paper glider power-up rides on its back the same way. Its materials are its own and always
// blend, so the view can fade the courier out (a fall) and back in (a respawn) without a new shader.
import { THREE, model, modelClips } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from './sim';
import type { Mats } from './kit';
import { clamp, lerp } from './defs';

type Bone = 'root' | 'torso' | 'head' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right';
const BONES: Bone[] = ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];
type Clip = 'sprint' | 'jump' | 'fall' | 'sit' | 'crouch' | 'idle' | 'die' | 'walk' | 'emote-yes';

/** The courier's height (m). */
export const HEIGHT = 1.78;
/** Hip height: the pivot of rolls and leans. */
const HIP = 0.8;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export interface Look { bag: number; flap: number; cap: number | null }

export class Runner {
  readonly root = new THREE.Group();
  /** Turned to face the run (−z), leans and rolls. */
  private body = new THREE.Group();
  /** Pitches round the hips (the roll, the slide's lean back, the fall). */
  private spin = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private curName = '';
  private bones = new Map<Bone, THREE.Object3D>();
  private rest = new Map<Bone, { p: THREE.Vector3; q: THREE.Quaternion }>();
  private tips = new Map<Bone, THREE.Vector3>();
  private scale = 2.6;
  private t = 0;
  private lean = 0;
  private roll = 0;
  private yaw = 0;
  private lowK = 0;
  private lastState = '';
  private waveT = 0;
  private bag: THREE.Group;
  private cap: THREE.Group | null = null;
  private bagMat: THREE.MeshLambertMaterial;
  private capMat: THREE.MeshLambertMaterial;
  /** Every material of the courier (faded together). */
  private fadeMats: THREE.Material[] = [];
  private alpha = 1;
  private glider: THREE.Group | null = null;
  private gliderK = 0;
  readonly shadow: THREE.Mesh;
  /** World positions of the chest and the hands (popups, sparkles). */
  readonly chest = new THREE.Vector3();
  /** Test hook: the last aimed hand and how far from its target. */
  aimErr = 0;

  constructor(key: string, mats: Mats, look: Look) {
    this.obj = model(key, { shadows: true });
    let skin: THREE.MeshLambertMaterial | null = null;
    this.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        // its own copy (the shared one is the skyline's too): it fades
        skin ??= mats.of(m.material as THREE.Material).clone();
        m.material = skin;
        m.frustumCulled = false;
        m.castShadow = true;
        m.receiveShadow = false;
      } else if (BONES.includes(o.name as Bone)) {
        this.bones.set(o.name as Bone, o);
        this.rest.set(o.name as Bone, { p: o.position.clone(), q: o.quaternion.clone() });
      }
    });
    const h = new THREE.Box3().setFromObject(this.obj).getSize(_v).y || 0.67;
    this.scale = HEIGHT / h;
    this.obj.scale.setScalar(this.scale);
    this.findTips();
    this.obj.position.y = -HIP;
    this.spin.position.y = HIP;
    this.spin.add(this.obj);
    this.body.add(this.spin);
    this.body.rotation.order = 'YXZ';
    this.root.add(this.body);
    this.mixer = new THREE.AnimationMixer(this.obj);
    for (const c of modelClips(key)) {
      if (!['sprint', 'jump', 'fall', 'sit', 'crouch', 'idle', 'die', 'walk', 'emote-yes'].includes(c.name)) continue;
      const a = this.mixer.clipAction(c);
      if (c.name === 'jump' || c.name === 'die') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(c.name, a);
    }
    this.play('idle', 0);
    // the satchel and the cap (parts of the courier's kit, not limbs)
    this.bagMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.capMat = new THREE.MeshLambertMaterial({ color: look.cap ?? 0xffffff });
    this.bag = this.makeBag();
    this.setLook(look);
    this.glider = this.makeGlider();
    this.fadeMats = [skin!, this.bagMat, this.capMat, this.gliderMat];
    for (const m of this.fadeMats) { m.transparent = true; m.depthWrite = true; }
    // a soft blob under the courier: where it will land
    const blob = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.55 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), blob);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
  }

  /** The satchel's and the cap's colours (the shop). */
  setLook(look: Look): void {
    this.paintBag(look.bag, look.flap);
    if (look.cap !== null) {
      this.capMat.color.setHex(look.cap);
      if (!this.cap) this.cap = this.makeCap();
      this.cap.visible = true;
    } else if (this.cap) this.cap.visible = false;
  }

  private play(name: Clip, fade = 0.15, speed = 1): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.curName === name) return;
    a.reset().setEffectiveWeight(1).play();
    if (this.cur && fade > 0) a.crossFadeFrom(this.cur, fade, false);
    else if (this.cur) this.cur.stop();
    this.cur = a;
    this.curName = name;
  }

  /** A delivery: a quick wave of the free arm while running on. */
  wave(): void { this.waveT = 0.7; }

  /** Fades the whole courier (0 = gone). Below 1 % it is not drawn at all. */
  setOpacity(a: number): void {
    a = clamp(a, 0, 1);
    if (Math.abs(a - this.alpha) < 1e-4) return;
    this.alpha = a;
    for (const m of this.fadeMats) m.opacity = a;
    this.obj.visible = a > 0.01;
  }
  get opacity(): number { return this.alpha; }
  /** Drawn this frame (test hook: never hidden while still more than faintly there). */
  get shown(): boolean { return this.obj.visible && this.root.visible; }

  update(dt: number, sim: Sim, groundY: number): void {
    this.t += dt;
    const st = sim.state;
    if (st !== this.lastState) {
      if (st === 'air' && sim.vy > 0) { const a = this.actions.get('jump'); if (a) { this.curName = ''; } }
      this.lastState = st;
    }
    this.root.position.set(sim.x, sim.y, -sim.s);
    // reset the bones, let the clip pose them, then add the move's pose
    for (const b of BONES) {
      const r = this.rest.get(b), bone = this.bones.get(b);
      if (r && bone) { bone.position.copy(r.p); bone.quaternion.copy(r.q); }
    }
    const k = this.choose(sim);
    this.mixer.update(dt);
    this.pose(sim, k, dt);
    // the paper glider unfolds on the back while it lasts
    const gk = sim.power.glide > 0 ? 1 : 0;
    this.gliderK += clamp(gk - this.gliderK, -dt * 5, dt * 6);
    if (this.glider) {
      this.glider.visible = this.gliderK > 0.01;
      const k = this.gliderK, flap = st === 'air' ? Math.sin(this.t * 7) * 0.08 : 0;
      this.glider.scale.set(k, 0.6 + 0.4 * k, k);
      this.glider.rotation.z = flap;
    }
    this.root.updateMatrixWorld(true);
    // the blob on the ground below
    const h = Math.max(0, sim.y - groundY);
    const sk = clamp(1 - h / 10, 0.35, 1);
    this.shadow.visible = st !== 'fall' && st !== 'done' && st !== 'rescue' && groundY > 0.5 && this.alpha > 0.01;
    this.shadow.position.set(sim.x, groundY + 0.04, -sim.s);
    this.shadow.scale.set(sk, sk, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = (0.5 * sk + (sim.state === 'air' ? 0.2 : 0)) * this.alpha;
    this.bones.get('torso')!.getWorldPosition(this.chest);
    this.waveT = Math.max(0, this.waveT - dt);
  }

  // ------------------------------------------------------------------ clips

  private choose(sim: Sim): number {
    const st = sim.state;
    switch (st) {
      case 'run': {
        if (sim.vs < 0.6) { this.play('idle', 0.2); return 0; }
        // the sprint clip covers about 3.4 m per cycle at this size: tie it to the speed
        this.play('sprint', 0.12, clamp(sim.vs / 6.8, 0.5, 2.4));
        return 0;
      }
      case 'stumble': this.play('sprint', 0.1, clamp(sim.vs / 6.8, 0.4, 1.6)); return 0;
      case 'air': {
        if (sim.vy > 1.5 && sim.stateT < 0.45) this.play('jump', 0.08, 1.3);
        else this.play('fall', 0.25, 1);
        return 0;
      }
      case 'slide': this.play('sit', 0.08); return 0;
      case 'roll': this.play('crouch', 0.06); return 0;
      case 'vault': this.play('jump', 0.06, 1.6); return 0;
      case 'climb': this.play('walk', 0.1, 1.8); return 0;
      case 'mantle': this.play('crouch', 0.08); return 0;
      case 'zip': this.play('fall', 0.15, 0.6); return 0;
      case 'slam': case 'fall': this.play('fall', 0.12, 1.4); return 0;
      case 'rescue': this.play('jump', 0.12, 0.8); return 0;
      case 'done': if (sim.overReason === 'fell') this.play('fall', 0.12, 1.4); else this.play('die', 0.2); return 0;
    }
    return 0;
  }

  // ------------------------------------------------------------------ poses

  private rot(b: Bone, x: number, y: number, z: number): void {
    const bone = this.bones.get(b);
    if (!bone) return;
    _q.setFromEuler(_e.set(x, y, z, 'XYZ'));
    bone.quaternion.multiply(_q);
  }

  private pose(sim: Sim, _k: number, dt: number): void {
    const st = sim.state;
    const T = st === 'slide' || st === 'roll' ? sim.stateT : 0;
    let lean = 0, roll = 0, yaw = 0, low = 0, pitch = 0;
    const torso = this.bones.get('torso')!;
    switch (st) {
      case 'run': {
        lean = 0.12 + clamp(sim.vs / 14, 0, 1) * 0.12 + (sim.rush ? 0.08 : 0);
        roll = -sim.vx * 0.03;
        if (sim.blockedT > 0.1) { lean = -0.05; this.rot('arm-left', -1.4, 0, -0.2); this.rot('arm-right', -1.4, 0, 0.2); }
        break;
      }
      case 'stumble': {
        lean = 0.55;
        const w = Math.sin(this.t * 18);
        this.rot('arm-left', -0.8 + w * 0.6, 0, -0.9);
        this.rot('arm-right', -0.8 - w * 0.6, 0, 0.9);
        break;
      }
      case 'air': {
        // a tuck: knees up, arms forward; big airs reach out, a bounce throws the arms up
        const up = sim.vy > 0;
        const tuck = clamp(1 - Math.abs(sim.vy) / 9, 0, 1);
        this.rot('leg-left', -0.9 * tuck - 0.2, 0, 0);
        this.rot('leg-right', -0.5 * tuck + 0.15, 0, 0);
        lean = 0.15 + 0.15 * tuck;
        if (sim.springs > 0 || sim.stateT < 0.6 && up && sim.vy > 11) {
          this.rot('arm-left', 0, 0, -2.4);
          this.rot('arm-right', 0, 0, 2.4);
        } else {
          const w = Math.sin(this.t * 9) * 0.4 * (up ? 0.3 : 1);
          this.rot('arm-left', -1.1 + w, 0, -0.5);
          this.rot('arm-right', -1.1 - w, 0, 0.5);
        }
        break;
      }
      case 'slide': {
        // leaning back, legs out in front, one hand trailing on the roof
        low = 0.62;
        pitch = -0.95;
        this.rot('leg-left', -0.15, 0, 0.05);
        this.rot('leg-right', 0.05, 0, -0.05);
        this.rot('arm-right', 0.7, 0, 0.5);
        this.rot('arm-left', -0.4, 0, -1.0);
        this.rot('head', 0.4, 0, 0);
        void T;
        break;
      }
      case 'roll': {
        // a forward roll over the shoulder
        const k = clamp(sim.stateT / 0.46, 0, 1);
        pitch = k * Math.PI * 2;
        low = Math.sin(Math.PI * k) * 0.55;
        this.rot('leg-left', -1.6, 0, 0);
        this.rot('leg-right', -1.6, 0, 0);
        this.rot('arm-left', -1.3, 0, -0.3);
        this.rot('arm-right', -1.3, 0, 0.3);
        this.rot('torso', 0.6, 0, 0);
        this.rot('head', 0.5, 0, 0);
        break;
      }
      case 'vault': {
        // a speed vault: body turned and tipped sideways over the wall, legs swung through
        const k = clamp(sim.stateT / 0.42, 0, 1);
        const arc = Math.sin(Math.PI * k);
        yaw = 0.7 * arc;
        roll = -0.55 * arc;
        this.rot('leg-left', -1.2 * arc, 0, 0.5 * arc);
        this.rot('leg-right', -0.9 * arc, 0, 0.6 * arc);
        this.rot('arm-left', 0, 0, -1.4 * arc);
        lean = 0.2;
        break;
      }
      case 'climb': {
        // hand over hand: the arms up in turn, the knees up in turn
        const c = Math.sin(sim.stateT * 11);
        this.rot('arm-left', -2.6 - c * 0.35, 0, -0.15);
        this.rot('arm-right', -2.6 + c * 0.35, 0, 0.15);
        this.rot('leg-left', -0.5 - c * 0.5, 0, 0);
        this.rot('leg-right', -0.5 + c * 0.5, 0, 0);
        this.rot('head', -0.3, 0, 0);
        break;
      }
      case 'mantle': {
        const k = clamp(sim.stateT / 0.3, 0, 1);
        this.rot('arm-left', -2.3 + k * 1.6, 0, -0.2);
        this.rot('arm-right', -2.3 + k * 1.6, 0, 0.2);
        this.rot('leg-left', -1.2 * (1 - k * 0.6), 0, 0);
        this.rot('leg-right', -0.6, 0, 0);
        lean = 0.35 * k;
        break;
      }
      case 'zip': {
        // hanging from the handle with both hands, legs swinging forward
        const sw = Math.sin(this.t * 4) * 0.12;
        this.rot('arm-left', 0, 0, -2.95);
        this.rot('arm-right', 0, 0, 2.95);
        this.rot('leg-left', -0.55 + sw, 0, 0);
        this.rot('leg-right', -0.35 + sw, 0, 0);
        lean = -0.1 + sw * 0.5;
        break;
      }
      case 'slam': {
        this.rot('arm-left', -2.6, 0, -0.3);
        this.rot('arm-right', -2.6, 0, 0.3);
        lean = -0.1;
        break;
      }
      case 'fall': case 'done': {
        if (st === 'done' && sim.overReason !== 'fell') break;
        // tumbling backwards into the alley, arms and legs flailing
        const w = Math.sin(this.t * 14), w2 = Math.sin(this.t * 11 + 1.3);
        this.rot('arm-left', w2 * 0.5, 0, -2.2 + w * 0.6);
        this.rot('arm-right', -w2 * 0.5, 0, 2.2 + w * 0.6);
        this.rot('leg-left', -0.6 + w * 0.5, 0, 0);
        this.rot('leg-right', -0.2 - w * 0.5, 0, 0);
        this.rot('head', -0.3, 0, 0);
        const ft = st === 'fall' ? sim.stateT : 1.4;
        pitch = -Math.min(1.2, ft * 1.4) - Math.max(0, ft - 0.5) * 1.6;
        roll = Math.sin(ft * 3.2) * 0.35;
        yaw = Math.sin(ft * 2.1) * 0.4;
        break;
      }
      case 'rescue': {
        // carried by the bubble: arms out for balance, knees tucked, upright again by the roof
        const w = Math.sin(this.t * 6) * 0.15;
        this.rot('arm-left', -0.3, 0, -1.6 + w);
        this.rot('arm-right', -0.3, 0, 1.6 - w);
        this.rot('leg-left', -0.8, 0, 0);
        this.rot('leg-right', -0.5, 0, 0);
        lean = 0.1;
        break;
      }
      default: break;
    }
    if (this.waveT > 0 && (st === 'run' || st === 'air')) this.rot('arm-right', 0, 0, 2.6 * Math.sin(Math.PI * this.waveT / 0.7));
    this.lean = lerp(this.lean, lean, Math.min(1, dt * 12));
    this.roll = lerp(this.roll, roll, Math.min(1, dt * 12));
    this.yaw = lerp(this.yaw, yaw, Math.min(1, dt * 14));
    this.lowK = lerp(this.lowK, low, Math.min(1, dt * 18));
    this.rot('torso', this.lean, 0, 0);
    // the figure faces the run (its +z towards −z); rolls, leans back and falls pitch it round the hips
    const tumbling = st === 'fall' || (st === 'done' && sim.overReason === 'fell');
    const p = st === 'roll' ? pitch : tumbling ? lerp(this.spin.rotation.x, pitch, Math.min(1, dt * 6)) : lerp(this.spin.rotation.x, pitch, Math.min(1, dt * 14));
    this.body.rotation.set(0, Math.PI + this.yaw, this.roll);
    this.spin.rotation.x = p;
    this.spin.position.y = HIP - this.lowK;
    torso.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ hand aiming

  /** The ends of the limbs in their bones' space (the far end of the vertices each bone moves). */
  private findTips(): void {
    const v = new THREE.Vector3();
    this.obj.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      const g = sm.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
      for (const name of ['arm-left', 'arm-right', 'leg-left', 'leg-right'] as Bone[]) {
        const bi = sm.skeleton.bones.findIndex((b) => b.name === name);
        if (bi < 0) continue;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < pos.count; i++) {
          if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
          pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix).applyMatrix4(sm.skeleton.boneInverses[bi]).clone());
        }
        if (!pts.length) continue;
        const far = Math.max(...pts.map((p) => p.length()));
        const tip = new THREE.Vector3();
        let n = 0;
        for (const p of pts) if (p.length() > far * 0.82) { tip.add(p); n++; }
        this.tips.set(name, tip.divideScalar(Math.max(1, n)));
      }
    });
  }

  /** Turns a limb so its end points at a world point; returns where the end is. */
  aimBone(name: Bone, target: THREE.Vector3, w = 1): THREE.Vector3 {
    const bone = this.bones.get(name), tip = this.tips.get(name);
    const out = new THREE.Vector3();
    if (!bone || !tip || !bone.parent) return out;
    bone.updateWorldMatrix(true, false);
    const s = bone.getWorldPosition(new THREE.Vector3());
    const f = bone.localToWorld(tip.clone()).sub(s).normalize();
    const d = target.clone().sub(s).normalize();
    _q.setFromUnitVectors(f, d);
    if (w < 1) _q.slerp(_q2.identity(), 1 - w);
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.premultiply(pq.clone().invert().multiply(_q).multiply(pq));
    bone.updateMatrixWorld(true);
    bone.localToWorld(out.copy(tip));
    this.aimErr = out.distanceTo(target);
    return out;
  }

  /** Puts the hands on what they hold this frame (cable, rungs, wall top, ledge). */
  hands(sim: Sim, cableY: number | null, wallTop: number | null): void {
    const st = sim.state;
    const z = -sim.s;
    if (st === 'zip' && cableY !== null) {
      this.aimBone('arm-left', _v.set(sim.x + 0.07, cableY, z - 0.05));
      this.aimBone('arm-right', _v.set(sim.x - 0.07, cableY, z - 0.05));
    } else if (st === 'climb') {
      const c = Math.sin(sim.stateT * 11);
      this.aimBone('arm-left', _v.set(sim.x + 0.25, sim.y + 2.05 + c * 0.3, z - 0.42));
      this.aimBone('arm-right', _v.set(sim.x - 0.25, sim.y + 2.05 - c * 0.3, z - 0.42));
    } else if (st === 'vault' && wallTop !== null && sim.stateT < 0.32) {
      this.aimBone('arm-right', _v.set(sim.x - 0.12, wallTop, z - 0.1));
    } else if (st === 'mantle' && wallTop !== null && sim.stateT < 0.22) {
      this.aimBone('arm-left', _v.set(sim.x + 0.22, wallTop, z - 0.55));
      this.aimBone('arm-right', _v.set(sim.x - 0.22, wallTop, z - 0.55));
    } else if (st === 'slide') {
      this.aimBone('arm-right', _v.set(sim.x - 0.45, sim.y + 0.02, z + 0.35));
    }
    this.root.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------ the satchel and the cap

  /** The vertex box of a bone's part of the skin, in the bone's space. */
  private partBox(name: Bone): THREE.Box3 {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    this.obj.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      const pos = sm.geometry.getAttribute('position') as THREE.BufferAttribute;
      const si = sm.geometry.getAttribute('skinIndex') as THREE.BufferAttribute, sw = sm.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
      const bi = sm.skeleton.bones.findIndex((b) => b.name === name);
      if (bi < 0) return;
      for (let i = 0; i < pos.count; i++) {
        if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
        box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix).applyMatrix4(sm.skeleton.boneInverses[bi]));
      }
    });
    // the head mesh is its own (not skinned) in some models: fall back to the bone's children
    if (box.isEmpty()) {
      const bone = this.bones.get(name);
      bone?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m === (bone as unknown)) return;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox!.clone();
        bb.applyMatrix4(m.matrix);
        box.union(bb);
      });
    }
    return box;
  }

  private makeBag(): THREE.Group {
    const torso = this.bones.get('torso')!;
    const b = this.partBox('torso');
    const size = b.isEmpty() ? new THREE.Vector3(0.14, 0.16, 0.1) : b.getSize(new THREE.Vector3());
    const c = b.isEmpty() ? new THREE.Vector3(0, 0.08, 0) : b.getCenter(new THREE.Vector3());
    const g = new THREE.Group();
    const w = size.x * 0.82, h = size.y * 0.72, d = size.z * 0.55;
    // one mesh: the bag, its flap and a buckle (vertex colours: bag, flap, gold)
    const parts: [THREE.BufferGeometry, number][] = [
      [new THREE.BoxGeometry(w, h, d), 0],
      [new THREE.BoxGeometry(w * 1.04, h * 0.45, d * 1.08).translate(0, h * 0.3, -0.002), 1],
      [new THREE.BoxGeometry(w * 0.2, h * 0.12, d * 0.2).translate(0, h * 0.06, -d * 0.55), 2],
    ];
    const geo = mergeGeometries(parts.map(([q]) => q.toNonIndexed()), false)!;
    const kinds: number[] = [];
    for (const [q, k] of parts) { const n = q.toNonIndexed().attributes.position.count; for (let i = 0; i < n; i++) kinds.push(k); q.dispose(); }
    this.bagKinds = kinds;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(kinds.length * 3), 3));
    const mesh = new THREE.Mesh(geo, this.bagMat);
    g.add(mesh);
    this.bagMesh = mesh;
    g.position.set(c.x, c.y + size.y * 0.05, b.isEmpty() ? -0.07 : b.min.z - d * 0.45);
    mesh.castShadow = true;
    torso.add(g);
    return g;
  }
  private bagKinds: number[] = [];
  private bagMesh: THREE.Mesh | null = null;

  private paintBag(bag: number, flap: number): void {
    const m = this.bagMesh;
    if (!m) return;
    const col = m.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cs = [new THREE.Color(bag), new THREE.Color(flap), new THREE.Color(0xffd23f)];
    this.bagKinds.forEach((k, i) => col.setXYZ(i, cs[k].r, cs[k].g, cs[k].b));
    col.needsUpdate = true;
  }

  readonly gliderMat = new THREE.MeshLambertMaterial({ color: 0xf8f6f0, emissive: 0x6a6a70, side: THREE.DoubleSide });

  /** A folded paper glider worn on the back (the glide power-up): two swept wings and a keel. */
  private makeGlider(): THREE.Group {
    const torso = this.bones.get('torso')!;
    const b = this.partBox('torso');
    const size = b.isEmpty() ? new THREE.Vector3(0.14, 0.16, 0.1) : b.getSize(new THREE.Vector3());
    const c = b.isEmpty() ? new THREE.Vector3(0, 0.08, 0) : b.getCenter(new THREE.Vector3());
    const span = size.x * 2.6, chord = size.y * 1.15, back = b.isEmpty() ? -0.1 : b.min.z - size.z * 0.75;
    // in the torso's space: x across, y up the back, z out of the back (−z)
    const v = (x: number, y: number, z: number) => [x, y, z];
    const tri = [
      // left wing (nose up at +y, tip out and back)
      ...v(0, chord * 0.55, 0), ...v(-span, -chord * 0.45, -0.02 * span), ...v(-span * 0.25, -chord * 0.5, 0),
      // right wing
      ...v(0, chord * 0.55, 0), ...v(span * 0.25, -chord * 0.5, 0), ...v(span, -chord * 0.45, -0.02 * span),
      // keel (the fold, out of the back)
      ...v(0, chord * 0.55, 0), ...v(0, -chord * 0.5, 0), ...v(0, -chord * 0.35, -size.z * 0.6),
      // inner wing halves, so the middle reads as folded paper
      ...v(0, chord * 0.55, 0), ...v(-span * 0.25, -chord * 0.5, 0), ...v(0, -chord * 0.5, 0),
      ...v(0, chord * 0.55, 0), ...v(0, -chord * 0.5, 0), ...v(span * 0.25, -chord * 0.5, 0),
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.gliderMat);
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    g.position.set(c.x, c.y + size.y * 0.25, back);
    g.rotation.x = -0.35;
    g.visible = false;
    torso.add(g);
    return g;
  }

  private makeCap(): THREE.Group {
    const head = this.bones.get('head')!;
    const b = this.partBox('head');
    const size = b.isEmpty() ? new THREE.Vector3(0.3, 0.3, 0.3) : b.getSize(new THREE.Vector3());
    const c = b.isEmpty() ? new THREE.Vector3(0, 0.15, 0) : b.getCenter(new THREE.Vector3());
    const g = new THREE.Group();
    const r = Math.max(size.x, size.z) * 0.53;
    const crown = new THREE.CylinderGeometry(r * 0.96, r, size.y * 0.24, 16).toNonIndexed();
    const brim = new THREE.BoxGeometry(r * 1.4, size.y * 0.04, r * 0.9).translate(0, -size.y * 0.1, r * 0.95).toNonIndexed();
    for (const q of [crown, brim]) q.deleteAttribute('uv');
    g.add(new THREE.Mesh(mergeGeometries([crown, brim], false)!, this.capMat));
    g.position.set(c.x, (b.isEmpty() ? 0.3 : b.max.y) - size.y * 0.06, c.z);
    g.traverse((o) => { o.castShadow = true; });
    head.add(g);
    return g;
  }
}

function blobTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  r.addColorStop(0, 'rgba(0,0,0,0.75)');
  r.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
