// Kickflip Park: the skater on screen. The player's Mini Character plays the Mini Skate kit's own
// skate clips (push, stance, air, grab: they share the Mini Characters' skeleton) through one
// AnimationMixer; on top of them the bones are posed per trick (crouch, arms out on rails, lean
// back in manuals, tucks and splits in the air) and the Kenney board turns under the feet:
// kickflips roll it, shove-its spin it, grabs lift it into the hand, grinds lock it on the rail.
// A bail throws board and rider apart; both come back on recovery.
import { THREE, model, modelClips } from '@core/three';
import type { Sim } from './sim';
import { clamp, wrap, lerp } from './defs';
import { SKATE_CLIPS, type Mats } from './kit';
import { C, buildBoardModel, type BoardModel } from './boardmodel';
import type { BoardDef } from './boards';

export { C };

type Bone = 'root' | 'torso' | 'head' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right';
const BONES: Bone[] = ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];

type ClipName = 'skate' | 'skate-stand' | 'skate-air' | 'skate-grab' | 'idle' | 'fall' | 'die' | 'emote-yes' | 'crouch';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ the rider

export class Skater {
  /** At the skater's place; tilted to the ground. */
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private yawG = new THREE.Group();
  /** The board's pivot (its middle) and the board itself. */
  readonly boardPivot = new THREE.Group();
  private board: THREE.Group;
  /** The rider (turned for the stance). */
  private fig = new THREE.Group();
  private body = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private curName = '';
  private bones = new Map<Bone, THREE.Object3D>();
  private rest = new Map<Bone, { p: THREE.Vector3; q: THREE.Quaternion }>();
  private shadow: THREE.Mesh;
  // smoothed view state
  private yaw = 0;
  private stance = Math.PI / 2;
  private crouchK = 0;
  private armsK = 0;
  private leanK = 0;
  private carveK = 0;
  private tiltQ = new THREE.Quaternion();
  private t = 0;
  private lastState = '';
  // the bail: board and rider apart
  private loose: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; wx: number; wy: number } | null = null;
  private bailT = 0;
  private flipRoll = 0;
  private flipYaw = 0;
  private flipPitch = 0;
  private lastFlip = '';
  private boardY = 0;
  private specialT = 0;
  /** The board's model and measures (deck top, pivot, length, trucks). */
  bm: BoardModel;
  /** The board this skater rides. */
  boardDef: BoardDef;
  /** World position of the board's middle (sparks, dust). */
  readonly boardWorld = new THREE.Vector3();
  /** World position of the rider's chest (popups, glow). */
  readonly chest = new THREE.Vector3();

  constructor(key: string, private mats: Mats, board: BoardDef, private terrainH: (x: number, z: number) => number) {
    this.obj = model(key, { shadows: true });
    let skin: THREE.MeshLambertMaterial | null = null;
    this.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        skin ??= mats.of(m.material as THREE.Material);
        m.material = skin;
        m.frustumCulled = false;
        m.castShadow = true;
        m.receiveShadow = false;
      } else if (BONES.includes(o.name as Bone)) {
        this.bones.set(o.name as Bone, o);
        this.rest.set(o.name as Bone, { p: o.position.clone(), q: o.quaternion.clone() });
      }
    });
    this.obj.scale.setScalar(C);
    this.findTips();
    this.body.add(this.obj);
    this.fig.add(this.body);
    this.boardDef = board;
    this.bm = buildBoardModel(board, mats);
    this.board = this.bm.group;
    this.fig.position.y = this.bm.deckTop;
    this.board.position.y = -this.bm.pivotY;
    this.boardPivot.add(this.board);
    this.boardPivot.position.y = this.bm.pivotY;
    this.yawG.add(this.boardPivot, this.fig);
    this.tilt.add(this.yawG);
    this.root.add(this.tilt);
    // a soft shadow blob that stays on the ground under the board
    const blob = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.6 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), blob);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    this.mixer = new THREE.AnimationMixer(this.obj);
    const add = (clip: THREE.AnimationClip) => {
      const a = this.mixer.clipAction(clip);
      if (clip.name === 'die') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(clip.name, a);
    };
    for (const c of modelClips(SKATE_CLIPS)) if (c.name.startsWith('skate')) add(c);
    for (const c of modelClips(key)) if (['idle', 'fall', 'die', 'emote-yes', 'crouch'].includes(c.name)) add(c);
    this.play('skate-stand', 0);
  }

  /** The shadow lives in the world (not under the tilted rider). */
  get shadowMesh(): THREE.Mesh { return this.shadow; }

  private play(name: ClipName, fade = 0.18, speed = 1): void {
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

  /** Puts another board under the feet (the old one's own resources are freed). */
  setBoard(def: BoardDef): void {
    this.boardPivot.remove(this.board);
    this.bm.dispose();
    this.boardDef = def;
    this.bm = buildBoardModel(def, this.mats);
    this.board = this.bm.group;
    this.board.position.y = -this.bm.pivotY;
    this.boardPivot.add(this.board);
  }

  /** A bail: the board flies off on its own. */
  bail(sim: Sim): void {
    const hx = Math.sin(sim.heading), hz = Math.cos(sim.heading);
    const sp = Math.max(3, Math.hypot(sim.vx, sim.vz) || sim.speed);
    this.loose = { x: sim.x, y: sim.y + 0.3, z: sim.z, vx: hx * sp * 0.9 + (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 2, vz: hz * sp * 0.9 + (Math.random() - 0.5) * 2, rx: 0, ry: 0, wx: 10 + Math.random() * 8, wy: (Math.random() - 0.5) * 12 };
    this.bailT = 0;
  }

  update(dt: number, sim: Sim): void {
    this.t += dt;
    const st = sim.state;
    if (st !== this.lastState) {
      if (this.lastState === 'bail') { this.loose = null; this.board.visible = true; }
      this.lastState = st;
    }
    // where and which way
    this.root.position.set(sim.x, sim.y, sim.z);
    const target = sim.heading;
    if (st === 'air') this.yaw = target;
    else this.yaw += wrap(target - this.yaw) * Math.min(1, dt * 16);
    // carving: board and rider lean into the turn (more with speed)
    const carve = st === 'ground' || st === 'manual' ? clamp(sim.carve * Math.abs(sim.speed) * 0.03, -0.32, 0.32) : 0;
    this.carveK = lerp(this.carveK, carve, Math.min(1, dt * 8));
    this.yawG.rotation.set(0, this.yaw, this.carveK);
    // tilt to the ground's slope (on the ground and in manuals), upright in the air
    if (st === 'ground' || st === 'manual') {
      _n.set(-sim.gx, 1, -sim.gz).normalize();
      _q.setFromUnitVectors(UP, _n);
      this.tiltQ.slerp(_q, Math.min(1, dt * 18));
    } else if (st === 'air' && sim.air!.vert) {
      // a vert air: the board leaves the wall square to it, comes upright at the top of the arc and
      // is square to the wall again when it lands (the turn round happens meanwhile)
      const a = sim.air!;
      const k = clamp(a.t / Math.max(0.3, a.tTotal), 0, 1);
      // upright for most of the air (readable), leaning into the wall only at the ends, and at
      // most about 55°
      const w = Math.pow(1 - Math.sin(Math.PI * k), 3) * 0.7;
      _q.setFromUnitVectors(UP, _n.set(a.nx, a.ny, a.nz));
      _q2.identity().slerp(_q, w);
      this.tiltQ.slerp(_q2, Math.min(1, dt * 14));
    } else this.tiltQ.slerp(_q.identity(), Math.min(1, dt * (st === 'air' ? 3.5 : 12)));
    this.tilt.quaternion.copy(this.tiltQ);

    // reset the bones, let the clip pose them, then add our own pose
    for (const b of BONES) {
      const r = this.rest.get(b), bone = this.bones.get(b);
      if (r && bone) { bone.position.copy(r.p); bone.quaternion.copy(r.q); }
    }
    const pose = this.choose(sim, dt);
    this.mixer.update(dt);
    this.applyPose(pose, sim, dt);
    this.placeBoard(sim, pose, dt);
    if (st === 'air' && sim.air!.grab) this.pinGrab(sim.air!.grab.def.id, sim.air!.grab.t);

    // the ground shadow
    const gy = st === 'bail' && this.loose ? this.terrainH(sim.x, sim.z) : this.terrainH(sim.x, sim.z);
    const h = Math.max(0, sim.y - gy);
    this.shadow.position.set(sim.x, gy + 0.03, sim.z);
    this.shadow.rotation.z = -this.yaw;
    const k = clamp(1 - h / 8, 0.25, 1);
    this.shadow.scale.set(k, k, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    this.root.updateMatrixWorld(true);
    this.boardPivot.getWorldPosition(this.boardWorld);
    this.bones.get('torso')!.getWorldPosition(this.chest);
    this.chest.y += 0.35;
  }

  // ------------------------------------------------------------------ grabs: the hand on the board

  /**
   * The ends of the arms (fists) and legs (soles) in their bones' own space, from the skin: the
   * vertices that bone moves, in its bind pose, the far end of them. The Mini Characters' limbs are
   * one bone each, so aiming a bone at a point puts its end there (as far as the limb reaches).
   */
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
  private tips = new Map<Bone, THREE.Vector3>();
  /** The last grab's hand and how far it is from the grab point (m; test hook). */
  pinErr: { hand: string; err: number; reach: number; at: number[] } = { hand: '', err: 0, reach: 0, at: [] };

  /** Turns a limb bone so its tip points at a world point (`w` 0…1 of the way); returns the tip's world position. */
  private aimBone(name: Bone, target: THREE.Vector3, w: number): THREE.Vector3 {
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
    return bone.localToWorld(out.copy(tip));
  }

  /**
   * A grab: the grabbing hand on the board's edge. The arm reaches for the grab point (nose, tail,
   * toe-side edge for the indy, heel-side for the melon), the board tilts round its middle and moves
   * the rest of the way into the hand, and the legs follow the board so the feet stay on the deck.
   */
  private pinGrab(id: string, t: number): void {
    const w = clamp(t / 0.12, 0, 1);
    if (w <= 0 || !this.tips.size) return;
    const bp = this.boardPivot, bm = this.bm;
    this.root.updateMatrixWorld(true);
    // which hand is the front one (nearer the nose) and where the feet stand on the deck
    const local = (name: Bone) => this.yawG.worldToLocal(this.bones.get(name)!.getWorldPosition(new THREE.Vector3()));
    const front: Bone = local('arm-left').z > local('arm-right').z ? 'arm-left' : 'arm-right';
    const back: Bone = front === 'arm-left' ? 'arm-right' : 'arm-left';
    const feet = (['leg-left', 'leg-right'] as Bone[]).map((n) => {
      const bone = this.bones.get(n), tip = this.tips.get(n);
      return bone && tip ? bp.worldToLocal(bone.localToWorld(tip.clone())) : null;
    });
    // the grab point on the board (board pivot space: x across, toe side +x; z to the nose)
    const top = bm.deckTop - bm.pivotY, L = bm.len / 2, W = bm.width / 2;
    let hand: Bone, p: THREE.Vector3;
    switch (id) {
      // the fist closes round the edge: its middle just outside the deck
      case 'nosegrab': hand = front; p = new THREE.Vector3(W * 0.3, top + 0.02, L - 0.06); break;
      case 'tailgrab': hand = back; p = new THREE.Vector3(W * 0.3, top + 0.02, -L + 0.06); break;
      case 'melon': hand = front; p = new THREE.Vector3(-W - 0.03, top - 0.03, L * 0.12); break;
      default: hand = back; p = new THREE.Vector3(W + 0.03, top - 0.03, -L * 0.12); break; // indy
    }
    const target = bp.localToWorld(p.clone());
    const h = this.aimBone(hand, target, w);
    // tilt the board round its middle towards the hand (at most ~50°), then move it the rest
    const c = bp.getWorldPosition(new THREE.Vector3());
    _q.setFromUnitVectors(target.clone().sub(c).normalize(), h.clone().sub(c).normalize());
    const ang = 2 * Math.acos(clamp(Math.abs(_q.w), 0, 1));
    const k = (ang > 0.87 ? 0.87 / ang : 1) * w;
    _q.slerp(_q2.identity(), 1 - k);
    const pq = bp.parent!.getWorldQuaternion(new THREE.Quaternion());
    bp.quaternion.premultiply(pq.clone().invert().multiply(_q).multiply(pq));
    bp.updateMatrixWorld(true);
    const t2 = bp.localToWorld(p.clone());
    const move = h.clone().sub(t2);
    if (move.length() > 0.35) move.setLength(0.35);
    move.multiplyScalar(w);
    const wp = bp.getWorldPosition(new THREE.Vector3()).add(move);
    bp.position.copy(bp.parent!.worldToLocal(wp));
    bp.updateMatrixWorld(true);
    // the hand onto the point where it is now, the feet back onto the deck
    const got = this.aimBone(hand, bp.localToWorld(p.clone()), w);
    this.pinErr = { hand, err: got.distanceTo(bp.localToWorld(p.clone())), reach: got.distanceTo(this.bones.get(hand)!.getWorldPosition(new THREE.Vector3())), at: got.toArray() };
    (['leg-left', 'leg-right'] as Bone[]).forEach((n, i) => { const f = feet[i]; if (f) this.aimBone(n, bp.localToWorld(f.clone()), w); });
    this.boardPivot.getWorldPosition(this.boardWorld);
  }

  // ------------------------------------------------------------------ poses

  private choose(sim: Sim, dt: number): Pose {
    const p: Pose = { crouch: 0, arms: 0, lean: 0, back: 0, split: 0, tuck: 0, stance: Math.PI / 2, wave: 0, tumble: 0, oneFoot: 0 };
    const st = sim.state;
    switch (st) {
      case 'ground':
        if (sim.pushing > 0) { this.play('skate', 0.12, 1.1); p.stance = 0; }
        else this.play('skate-stand', 0.2);
        p.crouch = sim.crouching ? clamp(sim.crouchT / 0.5, 0.35, 1) : 0;
        p.lean = clamp(Math.abs(sim.speed) / 14, 0, 0.3);
        if (sim.sketchT > 0) {
          // a sketchy landing: arms windmill, the body rocks
          const k = sim.sketchT / 0.6;
          p.arms = Math.max(p.arms, 0.9 * k);
          p.lean += Math.sin(this.t * 22) * 0.35 * k;
          p.crouch = Math.max(p.crouch, 0.5 * k);
        }
        break;
      case 'manual': {
        this.play('skate-stand', 0.15);
        const mn = sim.manual!;
        p.back = mn.def.id === 'nosemanual' ? -1 : 1;
        p.arms = 0.6 + Math.abs(mn.bal) * 0.6;
        p.lean = mn.bal * 0.25;
        if (mn.special) { p.wave = 1; p.arms = 1; }
        p.crouch = sim.crouching ? 0.6 : 0.15;
        break;
      }
      case 'grind': {
        const g = sim.grind!;
        this.play('skate-stand', 0.1);
        p.arms = 0.7 + Math.abs(g.bal) * 0.5;
        p.lean = -g.bal * 0.5;
        p.crouch = sim.crouching ? 0.8 : 0.35;
        if (g.special) { p.oneFoot = 1; p.arms = 1; }
        break;
      }
      case 'air': {
        const a = sim.air!;
        if (a.grab) { this.play('skate-grab', 0.08); p.tuck = 1; }
        else if (a.flip?.special) {
          this.play('skate-air', 0.08);
          if (a.flip.def.id === 'comet') p.split = Math.sin(Math.PI * clamp(a.flip.t / (a.flip.def.dur ?? 1), 0, 1));
          else { p.tuck = 1; p.arms = 1; }
        } else {
          this.play('skate-air', 0.12);
          p.tuck = a.flip ? 0.9 : 0.4;
        }
        if (sim.crouching) p.crouch = 0.4;
        break;
      }
      case 'bail':
        if (sim.stateT < 0.05) this.play('fall', 0.05);
        else if (sim.stateT > 0.55) this.play('die', 0.25);
        p.tumble = sim.stateT;
        p.stance = this.stance;
        break;
    }
    this.stance += wrap(p.stance - this.stance) * Math.min(1, dt * 12);
    this.crouchK = lerp(this.crouchK, p.crouch, Math.min(1, dt * 14));
    this.armsK = lerp(this.armsK, p.arms, Math.min(1, dt * 10));
    this.leanK = lerp(this.leanK, p.lean, Math.min(1, dt * 10));
    return p;
  }

  private rot(b: Bone, x: number, y: number, z: number): void {
    const bone = this.bones.get(b);
    if (!bone) return;
    _q.setFromEuler(_e.set(x, y, z, 'XYZ'));
    bone.quaternion.multiply(_q);
  }

  private applyPose(p: Pose, sim: Sim, dt: number): void {
    const torso = this.bones.get('torso')!;
    // crouch: the hips sink between the legs, the back bends forward
    const c = this.crouchK;
    torso.position.y -= 0.07 * c;
    this.rot('torso', 0.42 * c, 0, 0);
    this.rot('head', -0.25 * c, 0, 0);
    this.rot('arm-left', 0, 0, 0.35 * c);
    this.rot('arm-right', 0, 0, -0.35 * c);
    // arms out for balance (rails, manuals)
    const a = this.armsK;
    if (a > 0.01) {
      const wob = Math.sin(this.t * 7) * 0.15 * a;
      this.rot('arm-left', 0, 0, -0.9 * a + wob);
      this.rot('arm-right', 0, 0, 0.9 * a + wob);
    }
    // lean sideways along the board (balance) — the stance faces across the board
    this.rot('torso', 0, 0, this.leanK);
    if (p.back !== 0) {
      // a manual: lean back over the tail (or forward over the nose)
      this.rot('torso', -0.32 * p.back, 0, 0);
      this.rot('head', 0.2 * p.back, 0, 0);
    }
    if (p.tuck > 0) {
      this.rot('leg-left', -0.5 * p.tuck, 0, 0);
      this.rot('leg-right', -0.5 * p.tuck, 0, 0);
      torso.position.y -= 0.03 * p.tuck;
    }
    if (p.split > 0) {
      // the comet: legs flung apart, arms up
      this.rot('leg-left', 0, 0, 0.9 * p.split);
      this.rot('leg-right', 0, 0, -0.9 * p.split);
      this.rot('arm-left', 0, 0, -1.6 * p.split);
      this.rot('arm-right', 0, 0, 1.6 * p.split);
    }
    if (p.wave > 0) {
      const w = Math.sin(this.t * 9);
      this.rot('arm-left', 0, 0, -1.2 + w * 0.5);
      this.rot('arm-right', 0, 0, 1.2 + w * 0.5);
    }
    if (p.oneFoot > 0) this.rot('leg-right', -0.9, 0, -0.3);
    // the stance: across the board while riding (head turned to look ahead), facing ahead while pushing
    this.fig.rotation.y = this.stance;
    const across = clamp(this.stance / (Math.PI / 2), 0, 1);
    if (sim.state !== 'bail') this.rot('head', 0, -0.75 * across, 0);
    // tumbling in a bail
    if (sim.state === 'bail') {
      const k = clamp(p.tumble / 0.6, 0, 1);
      this.body.rotation.set(0, 0, 0);
      this.body.rotation.x = k * Math.PI * 0.5 + Math.sin(k * Math.PI) * 0.8;
      this.body.position.y = -this.bm.deckTop + Math.sin(k * Math.PI) * 0.6;
    } else {
      this.body.rotation.set(0, 0, 0);
      this.body.position.y = 0;
    }
    // rider height: on the deck, lifted with the board in flips and grabs
    this.fig.position.y = this.bm.deckTop + this.boardY * 0.9;
    void dt;
  }

  private placeBoard(sim: Sim, p: Pose, dt: number): void {
    const bp = this.boardPivot;
    const st = sim.state;
    let roll = 0, yaw = 0, pitch = 0, y = 0;
    if (st === 'air') {
      const a = sim.air!;
      const f = a.flip;
      if (f) {
        const k = clamp(f.t / (f.def.dur ?? 0.4), 0, 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        roll = (f.def.roll ?? 0) * Math.PI * 2 * e;
        yaw = (f.def.yaw ?? 0) * Math.PI * 2 * e;
        pitch = (f.def.pitch ?? 0) * Math.PI * 2 * e;
        y = Math.sin(Math.PI * k) * (f.special ? 0.6 : 0.32);
        if (f.def.id === 'pinwheel') {
          // the board orbits the rider
          const ang = e * Math.PI * 4;
          bp.position.set(Math.sin(ang) * 0.7, this.bm.pivotY + 0.5 * Math.sin(Math.PI * k), Math.cos(ang) * 0.7);
          bp.rotation.set(0, ang, Math.PI / 2 * Math.sin(Math.PI * k));
          this.boardY = 0.35 * Math.sin(Math.PI * k);
          return;
        }
        this.lastFlip = f.def.id;
        this.flipRoll = roll; this.flipYaw = yaw; this.flipPitch = pitch;
      } else if (a.grab) {
        // lifted to the hand; pinGrab tilts it into the grabbing hand
        y = 0.22;
      } else y = p.tuck * 0.12;
    } else if (st === 'grind') {
      const g = sim.grind!;
      const id = g.def.id;
      y = -0.12;
      if (id === 'boardslide' || g.special) { yaw = Math.PI / 2; y = -0.18; }
      else if (id === 'smith') { roll = 0.35; pitch = 0.12; }
      else if (id === 'nosegrind') pitch = 0.22;
      else if (id === 'fiveo') pitch = -0.22;
      if (yaw) this.fig.rotation.y = this.stance + yaw;
    } else if (st === 'manual') {
      const mn = sim.manual!;
      const nose = mn.def.id === 'nosemanual';
      pitch = nose ? 0.32 : -0.32;
      if (mn.special) yaw = Math.sin(this.t * 6) * 0.6;
    }
    this.boardY = lerp(this.boardY, y, Math.min(1, dt * 20));
    if (st === 'manual') {
      // pivot on the back (or front) wheels
      const L = this.bm.truckZ;
      bp.position.set(0, this.bm.pivotY + Math.abs(Math.sin(pitch)) * L * 0.9, 0);
    } else bp.position.set(0, this.bm.pivotY + this.boardY, 0);
    bp.rotation.set(pitch, yaw, roll, 'YXZ');
    // in a bail the board flies on its own (in world space, drawn through the pivot)
    if (st === 'bail' && this.loose) {
      const L = this.loose;
      this.bailT += dt;
      L.vy -= 15 * dt;
      L.x += L.vx * dt; L.y += L.vy * dt; L.z += L.vz * dt;
      const gh = this.terrainH(L.x, L.z) + 0.15;
      if (L.y < gh) { L.y = gh; L.vy = Math.abs(L.vy) * 0.35; L.vx *= 0.7; L.vz *= 0.7; L.wx *= 0.6; }
      L.rx += L.wx * dt; L.ry += L.wy * dt;
      // world → this group's space (only translation and yaw matter here)
      _v.set(L.x, L.y, L.z);
      this.yawG.worldToLocal(_v);
      bp.position.copy(_v);
      bp.rotation.set(L.rx, L.ry, 0);
    }
  }
}

interface Pose {
  crouch: number;
  arms: number;
  lean: number;
  back: number;
  split: number;
  tuck: number;
  stance: number;
  wave: number;
  tumble: number;
  oneFoot: number;
}

let blob: THREE.CanvasTexture | null = null;
function blobTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d')!;
  const r = g.createRadialGradient(32, 64, 4, 32, 64, 30);
  r.addColorStop(0, 'rgba(0,0,0,0.6)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 2); g.fillStyle = r; g.fillRect(0, 0, 64, 64); g.restore();
  blob = new THREE.CanvasTexture(cv);
  return blob;
}
