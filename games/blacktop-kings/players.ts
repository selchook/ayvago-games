// The ballers: rigged Kenney Mini Characters reshaped into tall, lean athletes (body.ts) and
// animated bone by bone. The kit's clips are chibi moves on a 7-bone rig (no knees, no elbows);
// basketball needs feet that stay planted, a hand that meets the ball on every dribble, the ball
// passing between the hands, shot form, slams and falls, so every pose here is built from the
// model's own bones: legs aimed at footholds from a stride cycle tied to the real speed (a short
// leg bone stands in for a bent knee), arms aimed at points (the ball, the rim, the other hand),
// torso lean, twist and roll, and the head looking at the play. Poses blend into each other by
// easing every bone towards its new aim.
//
// The team kit is painted into the model: the triangles of the torso (and the sleeves and shorts,
// found by the colour cells they sample) take the team colour through vertex colours over a white
// cell of the shared colormap.
import { THREE, model } from '@core/three';
import type { Act, BallState } from './sim';
import { ARM_M, FIG, LEG_M, RIG0, SHAPE, SHOULDER_M } from './body';
import { BALL_R, HOOP_X, HOOP_Z, RIM_Y } from './court';
import { MOVES } from './moves';
import { MOVE_POSES, DUNK_POSES } from './poses';

export { FIG };

/** A white cell of the Mini Characters' colormap (u, v): vertex colours tint it to any colour. */
const WHITE_UV: [number, number] = [0.906, 0.875];

export interface Kit { shirt: number; shorts: number; trim: number }

/** What the view knows about a player this frame. */
export interface FigState {
  x: number; z: number; face: number; lift: number; act: Act; actT: number; spd: number; turbo: boolean;
  mood: number;            // 0 play, 1 cheer, 2 sad
  guard: boolean;          // standing in a defensive stance
  /** The dribble move or the dunk (moves.ts), 0 otherwise. */
  kind: number;
}

/** The ball as a figure sees it. */
export interface BallSeen { x: number; y: number; z: number; state: BallState; mine: boolean }

const cell = (u: number, v: number) => Math.floor(u * 16) + Math.floor(v * 16) * 16;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (u: number) => { const k = clamp(u, 0, 1); return k * k * (3 - 2 * k); };
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Half the fist's thickness (m): the ball sits this far below (or above) the fist's middle. */
const FIST_HALF = (0.161 * SHAPE.armT * FIG) / 2;
const HIP_X = RIG0.legX * SHAPE.hipW * FIG;
const HIP_Z = RIG0.pivZ * FIG;
const L = LEG_M;

// ------------------------------------------------------------------ the model

/** Paints the team kit into a copy of a skinned body geometry and reshapes it (body.ts). */
function kitGeometry(mesh: THREE.SkinnedMesh, kit: Kit, skinCells: Set<number>): THREE.BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const boneAt = (g: THREE.BufferGeometry, i: number) => {
    const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
    let j = si.getX(i), w = sw.getX(i);
    if (sw.getY(i) > w) { j = si.getY(i); w = sw.getY(i); }
    if (sw.getZ(i) > w) { j = si.getZ(i); w = sw.getZ(i); }
    if (sw.getW(i) > w) { j = si.getW(i); }
    return bones[j] ?? '';
  };
  // the athlete's build: each part about its own joint (positions are in the bind space, which
  // for these models is the model's own space)
  const bind = mesh.bindMatrix, unbind = mesh.bindMatrixInverse;
  const v = new THREE.Vector3();
  {
    const pos = src.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(bind);
      reshapePoint(boneAt(src, i), v);
      v.applyMatrix4(unbind);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  // basketball legs: the long Kenney trousers are cut into shorts to the knee, bare shins and
  // socks over the shoes (new edges where the leg triangles cross those lines)
  const g = sliceLegs(src, (i) => boneAt(src, i).startsWith('leg'), [KNEE_Y, SOCK_Y], bind);
  src.dispose();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const n = pos.count;
  // the shirt's colour cells: what the torso samples, except skin (the neck)
  const shirtCells = new Set<number>();
  for (let i = 0; i < n; i++) if (boneAt(g, i) === 'torso' && !skinCells.has(cell(uv.getX(i), uv.getY(i)))) shirtCells.add(cell(uv.getX(i), uv.getY(i)));
  const skinUv = [...skinCells][0] ?? -1;
  const col = new Float32Array(n * 3);
  const shirt = new THREE.Color(kit.shirt), shorts = new THREE.Color(kit.shorts), white = new THREE.Color(0xffffff), sock = new THREE.Color(0xf4f4f4);
  for (let t = 0; t < n; t += 3) {
    const b = boneAt(g, t);
    // the triangle's height in the model (for the legs)
    let y = 0;
    for (let k = 0; k < 3; k++) y += v.fromBufferAttribute(pos, t + k).applyMatrix4(bind).y / 3;
    for (let k = 0; k < 3; k++) {
      const i = t + k, c = cell(uv.getX(i), uv.getY(i));
      let to: THREE.Color | null = null;
      if (b === 'torso' && !skinCells.has(c)) to = shirt;
      else if (b.startsWith('arm') && shirtCells.has(c)) to = shirt;
      else if (b.startsWith('leg') && y > KNEE_Y) to = shorts;
      else if (b.startsWith('leg') && y > SOCK_Y) {
        // the shins in the head's skin colour
        if (skinUv >= 0) uv.setXY(i, ((skinUv % 16) + 0.5) / 16, (Math.floor(skinUv / 16) + 0.5) / 16);
        white.toArray(col, i * 3);
        continue;
      } else if (b.startsWith('leg') && y > RIG0.shoe) to = sock;
      (to ?? white).toArray(col, i * 3);
      if (to) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The bottom of the shorts and the top of the socks (model units, after the reshape). */
const KNEE_Y = 0.215;
const SOCK_Y = 0.13;

/** Cuts the chosen triangles where they cross horizontal planes (bind-space heights). */
function sliceLegs(g: THREE.BufferGeometry, pick: (i: number) => boolean, planes: number[], bind: THREE.Matrix4): THREE.BufferGeometry {
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => g.getAttribute(n) as THREE.BufferAttribute);
  const pi = names.indexOf('position');
  type V = number[][];
  interface Tri { v: V[]; cut: boolean }
  const read = (i: number): V => attrs.map((a) => { const o: number[] = []; for (let k = 0; k < a.itemSize; k++) o.push(a.getComponent(i, k)); return o; });
  const mix = (a: V, b: V, u: number): V => a.map((x, j) => (attrs[j].array instanceof Float32Array ? x.map((y, k) => y + (b[j][k] - y) * u) : x.slice()));
  const yOf = (p: V) => _y.set(p[pi][0], p[pi][1], p[pi][2]).applyMatrix4(bind).y;
  let tris: Tri[] = [];
  const count = g.getAttribute('position').count;
  for (let t = 0; t < count; t += 3) tris.push({ v: [read(t), read(t + 1), read(t + 2)], cut: pick(t) });
  for (const h of planes) {
    const out: Tri[] = [];
    for (const tri of tris) {
      const ys = tri.v.map(yOf);
      const na = ys.filter((y) => y > h).length;
      if (!tri.cut || na === 0 || na === 3) { out.push(tri); continue; }
      // the lone vertex on one side, and the two on the other
      const lone = ys.findIndex((y) => (na === 1 ? y > h : y <= h));
      const a = tri.v[lone], b = tri.v[(lone + 1) % 3], c = tri.v[(lone + 2) % 3];
      const ya = ys[lone], yb = ys[(lone + 1) % 3], yc = ys[(lone + 2) % 3];
      const ab = mix(a, b, (h - ya) / (yb - ya)), ac = mix(a, c, (h - ya) / (yc - ya));
      out.push({ v: [a, ab, ac], cut: true }, { v: [ab, b, c], cut: true }, { v: [ab, c, ac], cut: true });
    }
    tris = out;
  }
  const n = tris.length * 3;
  const og = new THREE.BufferGeometry();
  attrs.forEach((a, j) => {
    const Arr = a.array.constructor as new (n: number) => THREE.TypedArray;
    const arr = new Arr(n * a.itemSize);
    let o = 0;
    for (const tri of tris) for (const p of tri.v) for (const x of p[j]) arr[o++] = x;
    og.setAttribute(names[j], new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  });
  return og;
}
const _y = new THREE.Vector3();

/** The old (Kenney) and new joint of each bone, in model units. */
function joints(name: string): { from: THREE.Vector3; to: THREE.Vector3 } | null {
  const S = SHAPE, R = RIG0;
  const torso0 = new THREE.Vector3(0, R.hip, R.pivZ), torso1 = new THREE.Vector3(0, R.hip * S.leg, R.pivZ);
  switch (name) {
    case 'leg-left': case 'leg-right': {
      const s = name === 'leg-left' ? 1 : -1;
      return { from: new THREE.Vector3(s * R.legX, R.hip, R.pivZ), to: new THREE.Vector3(s * R.legX * S.hipW, R.hip * S.leg, R.pivZ) };
    }
    case 'torso': return { from: torso0, to: torso1 };
    case 'arm-left': case 'arm-right': {
      const s = name === 'arm-left' ? 1 : -1;
      return {
        from: torso0.clone().add(new THREE.Vector3(s * R.armX, R.armY, R.armZ)),
        to: torso1.clone().add(new THREE.Vector3(s * R.armX * S.torsoW, S.shoulderY * S.torsoH, R.armZ * S.torsoD)),
      };
    }
    case 'head':
      return { from: torso0.clone().add(new THREE.Vector3(0, R.headY, R.headZ)), to: torso1.clone().add(new THREE.Vector3(0, R.headY * S.torsoH, R.headZ * S.torsoD)) };
    default: return null;
  }
}

const JOINTS = new Map<string, { from: THREE.Vector3; to: THREE.Vector3 }>();
for (const n of ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head']) JOINTS.set(n, joints(n)!);

/** Moves one bind-pose vertex of a part to the athlete's build. */
function reshapePoint(bone: string, v: THREE.Vector3): void {
  const j = JOINTS.get(bone);
  if (!j) return;
  const S = SHAPE, R = RIG0;
  const lx = v.x - j.from.x, ly = v.y - j.from.y, lz = v.z - j.from.z;
  let x = lx, y = ly, z = lz;
  if (bone.startsWith('leg')) {
    // above the shoes the leg stretches; the shoes keep their height and move down with it
    const top = R.shoe - R.hip;                       // the shoe line in the leg's space (< 0)
    const k = (R.hip * S.leg - R.shoe) / (R.hip - R.shoe);
    const shoe = ly < top;
    y = ly >= 0 ? ly : shoe ? top * k + (ly - top) : ly * k;
    // a soft change of width between the shin and the shoe
    const w = shoe ? 1 : clamp((ly - top) / 0.03, 0, 1);
    x = lx * lerp(S.shoeW, S.legW, w);
    z = shoe ? lz * S.shoeD : lz * lerp(S.shoeD, S.legD, w);
  } else if (bone === 'torso') {
    x = lx * S.torsoW; y = ly * S.torsoH; z = lz * S.torsoD;
  } else if (bone.startsWith('arm')) {
    x = lx * S.armL; y = ly * S.armT; z = lz * S.armT;
  } else if (bone === 'head') {
    x = lx * S.head; y = ly * S.head; z = lz * S.head;
  }
  v.set(j.to.x + x, j.to.y + y, j.to.z + z);
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

// ------------------------------------------------------------------ scratch

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const RIM = new THREE.Vector3(HOOP_X, RIM_Y, HOOP_Z);

/** One arm's aim this frame: a point in the body's space (metres) and how fast the arm gets there. */
interface ArmAim { p: THREE.Vector3; k: number; level: boolean }

type Side = 1 | -1;     // 1 = the figure's left (+x in its own space), -1 = its right

export class Figure {
  readonly root = new THREE.Group();
  /** Turned to the facing, lifted for jumps; its space ("body space") is where poses are built. */
  readonly body = new THREE.Group();
  private obj: THREE.Object3D;
  readonly mat: THREE.MeshLambertMaterial;
  private bTorso!: THREE.Object3D;
  private bHead!: THREE.Object3D;
  private bArm: Record<Side, THREE.Object3D> = {} as Record<Side, THREE.Object3D>;
  private bLeg: Record<Side, THREE.Object3D> = {} as Record<Side, THREE.Object3D>;
  /** Rest offsets of the joints (model units, in the parent bone). */
  private shoulderRest: Record<Side, THREE.Vector3> = { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() } as Record<Side, THREE.Vector3>;
  private fist: Record<Side, THREE.Vector3> = { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() } as Record<Side, THREE.Vector3>;
  private fistAxis: Record<Side, THREE.Vector3> = { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() } as Record<Side, THREE.Vector3>;
  private headRest = new THREE.Vector3();
  // the pose being built this frame
  private hipY = L;
  private hipDrop = 0;
  private lean = 0;
  private twist = 0;
  private roll = 0;
  private yaw = 0;
  private pitch = 0;
  private faceNow = 0;
  private torsoQ = new THREE.Quaternion();
  private aim: Record<Side, ArmAim> = { 1: { p: new THREE.Vector3(), k: 10, level: false }, [-1]: { p: new THREE.Vector3(), k: 10, level: false } } as Record<Side, ArmAim>;
  private foot: Record<Side, THREE.Vector3> = { 1: new THREE.Vector3(), [-1]: new THREE.Vector3() } as Record<Side, THREE.Vector3>;
  private plant: Record<Side, boolean> = { 1: true, [-1]: true } as Record<Side, boolean>;
  private legK = 18;
  private feetSet = false;
  private look = new THREE.Vector3();
  private looking = false;
  // motion
  private px = NaN;
  private pz = NaN;
  private vel = new THREE.Vector2();
  private phase = 0;
  private still = 0;
  private legFwd: Record<Side, number> = { 1: 0, [-1]: 0 } as Record<Side, number>;
  private t = 0;
  // the ball
  /** The dribbling hand. */
  hand: Side = -1;
  /** A move: the hand the ball started in, and the way the move goes. */
  private from: Side = -1;
  private side: Side = 1;
  private du = 0.86;
  private rel = new THREE.Vector3();
  private hadBall = false;
  private lastAct: Act = 'free';
  private lastKind = 0;
  private lastActT = 0;
  /** Where the ball is drawn while this figure has it (world). */
  readonly ballAt = new THREE.Vector3();
  /** The dribble hit the floor this frame. */
  bounced = false;
  /** The ball is in this figure's hands (not bouncing): passes and shots start from here. */
  inHands = true;

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
      // the joints moved: each skeleton gets its own inverse bind matrices (the clones share them)
      const sk = m.skeleton;
      sk.boneInverses = sk.boneInverses.map((inv, i) => {
        const j = JOINTS.get(sk.bones[i].name);
        const out = inv.clone();
        if (j) out.multiply(_m.makeTranslation(j.from.x - j.to.x, j.from.y - j.to.y, j.from.z - j.to.z));
        return out;
      });
    }
    this.bTorso = bones.get('torso')!;
    this.bHead = bones.get('head')!;
    this.bArm[1] = bones.get('arm-left')!; this.bArm[-1] = bones.get('arm-right')!;
    this.bLeg[1] = bones.get('leg-left')!; this.bLeg[-1] = bones.get('leg-right')!;
    // the new joints
    for (const [name, b] of bones) {
      const j = JOINTS.get(name);
      if (!j) continue;
      const parent = name.startsWith('arm') || name === 'head' ? JOINTS.get('torso')!.to : new THREE.Vector3();
      b.position.copy(j.to).sub(parent);
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
    }
    for (const s of [1, -1] as Side[]) this.shoulderRest[s].copy(this.bArm[s].position);
    this.headRest.copy(this.bHead.position);
    // the fists: the outer ends of the arms in the bind pose (arms out to the sides), in the arm's space
    for (const s of [1, -1] as Side[]) {
      const name = s === 1 ? 'arm-left' : 'arm-right';
      const j = JOINTS.get(name)!;
      const box = new THREE.Box3();
      for (const sm of skinned) {
        const g = sm.geometry;
        const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const bi = sm.skeleton.bones.findIndex((x) => x.name === name);
        for (let i = 0; i < pos.count; i++) {
          if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
          box.expandByPoint(_a.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix));
        }
      }
      const c = box.isEmpty() ? new THREE.Vector3(j.to.x + s * 0.3, j.to.y, j.to.z) : box.getCenter(new THREE.Vector3());
      const outer = box.isEmpty() ? c.x : s === 1 ? box.max.x - 0.04 : box.min.x + 0.04;
      this.fist[s].set(outer - j.to.x, c.y - j.to.y, c.z - j.to.z);
      this.fistAxis[s].copy(this.fist[s]).normalize();
    }
    this.obj.scale.setScalar(FIG);
    this.body.add(this.obj);
    this.root.add(this.body);
  }

  // ------------------------------------------------------------------ frame

  /** Poses the figure from the game state. `ball` is where the ball is drawn (when not in a hand). */
  update(dt: number, s: FigState, ball: BallSeen): void {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.bounced = false;
    // velocity from the drawn motion (the same for the host's simulation and the guest's snapshots)
    if (Number.isNaN(this.px) || Math.hypot(s.x - this.px, s.z - this.pz) > 1.5 || dt <= 0) this.vel.set(0, 0);
    else {
      const k = Math.min(1, dt * 14);
      this.vel.x += ((s.x - this.px) / dt - this.vel.x) * k;
      this.vel.y += ((s.z - this.pz) / dt - this.vel.y) * k;
    }
    this.px = s.x; this.pz = s.z;
    const fresh = s.act !== this.lastAct || s.kind !== this.lastKind || s.actT < this.lastActT - 0.05;
    if (fresh) this.onNewAct(s, ball.mine);
    this.lastAct = s.act; this.lastKind = s.kind; this.lastActT = s.actT;
    if (ball.mine && !this.hadBall) { this.du = 0.86; this.rel.set(0, 0, 0); }
    this.hadBall = ball.mine;

    this.root.position.set(s.x, 0, s.z);
    this.body.position.y = s.lift;
    this.faceNow = s.face;
    // body-space velocity
    const c = Math.cos(s.face), sn = Math.sin(s.face);
    const lvx = this.vel.x * c - this.vel.y * sn, lvz = this.vel.x * sn + this.vel.y * c;
    const speed = Math.hypot(lvx, lvz);

    // defaults: upright, arms down, feet from the stride
    this.hipDrop = 0; this.lean = 0.05; this.twist = 0; this.roll = 0; this.yaw = 0; this.pitch = 0; this.legK = 18;
    this.looking = false;
    this.inHands = true;
    this.feetSet = false;
    const air = s.lift > 0.04;
    this.gait(dt, lvx, lvz, speed, s.guard && !ball.mine ? 0.34 : 0.19);
    const run = clamp(speed / 5, 0, 1);
    this.lean = 0.05 + 0.05 * speed + (s.turbo ? 0.1 : 0);
    this.twist = -0.16 * this.legFwd[1] * clamp(speed / 2, 0, 1);
    for (const sd of [1, -1] as Side[]) {
      // arms swing against the legs
      const sw = this.legFwd[(-sd) as Side] * 0.85 * clamp(speed / 3, 0, 1);
      this.armDir(sd, sd * (0.3 + 0.1 * run), -1, sw + 0.12, 9);
    }
    switch (s.act) {
      case 'shot': this.shotPose(s, ball); break;
      case 'dunk': this.dunkPose(s, ball); break;
      case 'jump': this.jumpPose(s, ball); break;
      case 'pass': this.passPose(s); break;
      case 'steal': this.stealPose(s, ball); break;
      case 'cross': this.movePose(s, speed); break;
      case 'stumble': this.stumblePose(s); break;
      default:
        if (s.mood === 1) this.cheerPose(s);
        else if (s.mood === 2) this.sadPose();
        else if (ball.mine) this.dribblePose(dt, speed);
        else this.offBallPose(s, ball, speed);
    }
    if (air && s.act !== 'stumble' && !this.feetSet) this.airLegs(s);
    this.apply(dt, s, ball);
  }

  private onNewAct(s: FigState, mine: boolean): void {
    // a move: the ball goes from the hand it is in to the hand on the side of the cut
    if (s.act === 'cross') {
      this.from = this.hand;
      this.side = s.kind & 8 ? -1 : 1;
      if (mine && MOVES[s.kind & 7]?.swap) this.hand = this.side;
    }
    if (this.lastAct === 'cross' || this.lastAct === 'shot' || this.lastAct === 'dunk' || this.lastAct === 'pass') this.du = 0.86;
  }

  // ------------------------------------------------------------------ legs

  /** Footholds from the stride: a planted foot moves back exactly as fast as the body moves on. */
  private gait(dt: number, lvx: number, lvz: number, speed: number, width: number): void {
    const cad = speed < 0.3 ? 0 : 0.8 + 0.2 * speed;          // strides (two steps) a second
    if (cad > 0) { this.phase = (this.phase + cad * dt) % 1; this.still = 0; } else this.still += dt;
    const duty = lerp(0.62, 0.38, clamp((speed - 1.5) / 3.5, 0, 1));
    const ux = speed > 0.01 ? lvx / speed : 0, uz = speed > 0.01 ? lvz / speed : 1;
    const stride = cad > 0 ? (speed * duty) / cad : 0;
    const amt = clamp(speed / 0.9, 0, 1);
    for (const sd of [1, -1] as Side[]) {
      const ph = (this.phase + (sd === 1 ? 0 : 0.5)) % 1;
      let rel: number, up = 0, planted = true;
      if (ph < duty) rel = stride * (0.5 - ph / duty);
      else {
        const u = (ph - duty) / (1 - duty);
        rel = stride * (-0.5 + smooth(u));
        up = Math.sin(Math.PI * u) * (0.05 + 0.035 * speed);
        planted = false;
      }
      this.legFwd[sd] = stride > 0.01 ? (rel / (stride * 0.5)) * uz * amt : 0;
      const standZ = HIP_Z + sd * 0.05;
      this.foot[sd].set(lerp(sd * width, sd * width * 0.75 + ux * rel, amt), up * amt, lerp(standZ, HIP_Z + uz * rel, amt));
      this.plant[sd] = planted || amt < 0.5;
    }
  }

  /** In the air: the legs tuck a little, one ahead of the other. */
  private airLegs(s: FigState): void {
    const k = clamp(s.lift / 0.4, 0, 1);
    for (const sd of [1, -1] as Side[]) {
      this.foot[sd].set(sd * 0.16, -s.lift * 0 + lerp(0, 0.16, k), HIP_Z + sd * 0.14 * k);
      this.plant[sd] = false;
    }
    this.legK = 12;
  }

  // ------------------------------------------------------------------ arms

  /** Aims an arm along a direction from its shoulder (body space). */
  private armDir(sd: Side, x: number, y: number, z: number, k = 10): void {
    const a = this.aim[sd];
    a.p.set(x, y, z).normalize().multiplyScalar(ARM_M * 3).add(this.shoulderGuess(sd));
    a.k = k;
    a.level = false;
  }

  /** Aims an arm at a point in body space. */
  private armAt(sd: Side, p: THREE.Vector3, k = 10, level = false): void {
    this.aim[sd].p.copy(p);
    this.aim[sd].k = k;
    this.aim[sd].level = level;
  }

  /** Aims an arm at a world point. */
  private armAtWorld(sd: Side, x: number, y: number, z: number, k = 10): void {
    this.toBody(_c.set(x, y, z));
    this.armAt(sd, _c, k);
  }

  /** World → body space (the body's own transform may lag a frame, which is fine for aiming). */
  private toBody(v: THREE.Vector3): THREE.Vector3 {
    const s = this.root.position;
    const dx = v.x - s.x, dz = v.z - s.z;
    const f = this.faceNow + this.yaw;
    const c = Math.cos(f), sn = Math.sin(f);
    return v.set(dx * c - dz * sn, v.y - this.body.position.y, dx * sn + dz * c);
  }

  /** Rough shoulder place in body space (before the torso turns), for direction aims. */
  private shoulderGuess(sd: Side): THREE.Vector3 {
    return _b.set(sd * 0.18, this.hipY - this.hipDrop + (SHOULDER_M - L), 0);
  }

  // ------------------------------------------------------------------ poses

  private offBallPose(s: FigState, ball: BallSeen, speed: number): void {
    const dx = ball.x - s.x, dz = ball.z - s.z, d = Math.hypot(dx, dz);
    this.lookAt(ball.x, ball.y, ball.z);
    if (s.guard) {
      // the defensive stance: low, wide, hands out and active
      this.hipDrop = 0.17;
      this.lean = 0.3 + 0.03 * speed;
      // one hand up to bother a shot, the other low in the passing lane
      const wob = Math.sin(this.t * 7) * 0.08;
      this.armDir(1, 0.55, -0.45 + wob, 0.7, 8);
      this.armDir(-1, -0.3, 0.75 - wob, 0.6, 8);
    }
    // a pass coming: both hands out to it; a loose ball low and near: reach down for it
    if (ball.state === 'pass' && d < 2.6) {
      for (const sd of [1, -1] as Side[]) this.armAtWorld(sd, ball.x, ball.y, ball.z, 14);
    } else if (ball.state === 'loose' && d < 1.4 && ball.y < 1.1) {
      this.lean = 0.55;
      this.hipDrop = 0.15;
      this.armAtWorld(-1, ball.x, ball.y, ball.z, 12);
    }
  }

  /** Dribbling: the ball from the hand to the floor and back, about 2 bounces a second walking. */
  private dribblePose(dt: number, speed: number): void {
    const sd = this.hand;
    this.hipDrop = 0.1;
    this.lean = 0.14 + 0.025 * speed + (this.lean > 0.3 ? 0.06 : 0);
    this.lookAt(HOOP_X, RIM_Y, HOOP_Z);
    const f = 1.7 + 0.32 * Math.min(speed, 7);
    const was = this.du;
    this.du += f * dt;
    if (this.du >= 1) this.du -= 1;
    if (was < 0.5 && this.du >= 0.5) this.bounced = true;
    // the top of the bounce: the hand out to the side and ahead, about hip high
    const ahead = 0.3 + 0.05 * Math.min(speed, 7);
    const u = this.du;
    // the hand: rides the ball down, comes back up to wait for it, meets it and rides it up
    let push = 0;
    if (u < 0.16) push = smooth(u / 0.16);
    else if (u < 0.5) push = 1 - smooth((u - 0.16) / 0.3) * 0.8;
    else if (u < 0.86) push = 0.2 + 0.1 * smooth((u - 0.5) / 0.36);
    else push = 0.3 * (1 - smooth((u - 0.86) / 0.14));
    this.armAt(sd, _a.set(sd * 0.4, 1.06 - this.hipDrop * 0.5 - 0.3 * push, ahead + 0.05 * push), 30, true);
    // the other hand guards the ball
    this.armDir((-sd) as Side, -sd * 0.55, -0.5, 0.75, 8);
    this.inHands = false;
  }

  private shotPose(s: FigState, ball: BallSeen): void {
    const t = s.actT;
    this.lookAt(HOOP_X, RIM_Y, HOOP_Z);
    this.lean = 0.05;
    const sd: Side = -1;                       // the right hand shoots
    if (t < 0.14) {
      // the gather: the ball to the chest, a dip in the knees
      this.hipDrop = 0.16 * smooth(t / 0.1);
      for (const a of [1, -1] as Side[]) this.armDir(a, -a * 0.25, -0.35, 1, 16);
    } else if (ball.mine) {
      // up into the set point: the ball over the forehead, the guide hand at its side
      this.armDir(sd, 0.12, 2.6, 0.75, 14);
      this.armDir(1, -0.55, 2.0, 0.9, 14);
    } else {
      // the follow-through: the shooting arm reaching for the rim, the wrist "in the cookie jar"
      this.armAtWorld(sd, RIM.x, RIM.y + 1.1, RIM.z, 12);
      this.armDir(1, 0.2, 2.2, 0.6, 10);
    }
  }

  private passPose(s: FigState): void {
    const t = s.actT;
    // a two-hand chest pass: the arms snap out to the receiver and come back
    const out = t < 0.05 ? 0.3 : 1 - seg(t, 0.16, 0.28) * 0.6;
    for (const sd of [1, -1] as Side[]) this.armDir(sd, sd * 0.12, -0.25 + 0.2 * out, 0.4 + out, 22);
    this.lean = 0.2 + 0.12 * out;
    this.inHands = false;
  }

  private stealPose(s: FigState, ball: BallSeen): void {
    const t = s.actT;
    const k = t < 0.22 ? smooth(t / 0.12) : 1 - smooth((t - 0.22) / 0.18);
    this.lean = 0.25 + 0.3 * k;
    this.hipDrop = 0.12;
    this.lookAt(ball.x, ball.y, ball.z);
    if (k > 0.2) this.armAtWorld(-1, ball.x, Math.max(0.3, ball.y), ball.z, 24);
    else this.armDir(-1, -0.3, -0.6, 0.8, 12);
    this.armDir(1, 0.6, -0.3, 0.6, 10);
    this.foot[-1].z += 0.35 * k;
  }

  private jumpPose(s: FigState, ball: BallSeen): void {
    this.lookAt(ball.x, ball.y, ball.z);
    const d = Math.hypot(ball.x - s.x, ball.z - s.z);
    if (d < 2.6 && ball.y > 1.6 && !ball.mine) {
      // a block, a rebound or the tip: the hands go for the ball
      this.armAtWorld(-1, ball.x, ball.y, ball.z, 20);
      this.armAtWorld(1, ball.x, ball.y + 0.1, ball.z, 16);
    } else {
      this.armDir(-1, -0.15, 3, 0.35, 16);
      this.armDir(1, 0.15, 3, 0.35, 16);
    }
    if (s.actT < 0.08) this.hipDrop = 0.15;
  }

  private stumblePose(s: FigState): void {
    const t = s.actT;
    const a = smooth(t / 0.28), down = seg(t, 0.25, 0.42), up = smooth((t - 0.62) / 0.28);
    const sit = down * (1 - up);
    this.lookAt(s.x, 1.2, s.z);
    // the legs go: one slides out, the other back; the body falls back and sits down
    this.foot[1].set(0.35 * a, 0, HIP_Z + lerp(0.4 * a, 0.8, sit));
    this.foot[-1].set(-0.25 * a, 0, HIP_Z + lerp(-0.35 * a, 0.75, sit));
    this.plant[1] = this.plant[-1] = true;
    this.hipDrop = lerp(0.18 * a, L - 0.3, sit);
    this.lean = lerp(-0.45 * a, -0.35, sit);
    this.roll = 0.35 * a * (1 - sit);
    for (const sd of [1, -1] as Side[]) {
      if (sit > 0.5) this.armDir(sd, sd * 0.5, -0.6, -0.7, 10);
      else this.armDir(sd, sd * 0.8, 1.2 + Math.sin(this.t * 22 + sd) * 0.6, 0.2, 18);
    }
    this.legK = 20;
  }

  private cheerPose(_s: FigState): void {
    const pump = Math.sin(this.t * 9);
    this.armDir(1, 0.35, 2 + pump * 0.8, 0.2, 10);
    this.armDir(-1, -0.35, 2 - pump * 0.8, 0.2, 10);
    this.hipDrop = Math.max(0, pump) * 0.06;
    this.lean = -0.05;
  }

  private sadPose(): void {
    // hands on the knees
    this.lean = 0.75;
    this.hipDrop = 0.12;
    for (const sd of [1, -1] as Side[]) this.armAt(sd, _a.set(sd * 0.2, 0.55, 0.32), 6);
    this.looking = true;
    this.look.set(0, 0.9, 1.5);
  }

  /** The dribble moves (moves.ts) are drawn in their own module-level helper. */
  private movePose(s: FigState, speed: number): void {
    const k = s.kind & 7;
    const m = MOVES[k] ?? MOVES[0];
    (MOVE_POSES[k] ?? MOVE_POSES[0])(this.moveApi, clamp(s.actT / m.T, 0, 1), s, speed);
  }

  private dunkPose(s: FigState, ball: BallSeen): void {
    (DUNK_POSES[s.kind] ?? DUNK_POSES[0])(this.moveApi, s, ball);
  }

  /** What moves.ts may do with the figure. */
  readonly moveApi = {
    fig: this,
    set: (o: { hipDrop?: number; lean?: number; twist?: number; roll?: number; yaw?: number; pitch?: number }) => {
      if (o.hipDrop !== undefined) this.hipDrop = o.hipDrop;
      if (o.lean !== undefined) this.lean = o.lean;
      if (o.twist !== undefined) this.twist = o.twist;
      if (o.roll !== undefined) this.roll = o.roll;
      if (o.yaw !== undefined) this.yaw = o.yaw;
      if (o.pitch !== undefined) this.pitch = o.pitch;
    },
    armDir: (sd: Side, x: number, y: number, z: number, k = 14) => this.armDir(sd, x, y, z, k),
    armAt: (sd: Side, x: number, y: number, z: number, k = 14, level = false) => this.armAt(sd, _a.set(x, y, z), k, level),
    armAtWorld: (sd: Side, x: number, y: number, z: number, k = 14) => this.armAtWorld(sd, x, y, z, k),
    foot: (sd: Side, x: number, y: number, z: number, planted = true) => { this.foot[sd].set(x, y, z + HIP_Z); this.plant[sd] = planted; this.feetSet = true; },
    footShift: (sd: Side, x: number, z: number) => { this.foot[sd].x += x; this.foot[sd].z += z; },
    look: (x: number, y: number, z: number) => this.lookAt(x, y, z),
    /** The ball in a hand this frame (or in both, side 0). */
    hold: (sd: Side | 0) => { this.bmode = 1; this.bside = sd; },
    /** The ball in the air from where a hand let it go to the hand `to` (k: 0..1), off the floor at `bounce`. */
    fly: (to: Side, k: number, bounce: { x: number; z: number; at: number } | null = null, arc = 0) => {
      this.bmode = 2; this.bside = to; this.bk = k; this.barc = arc;
      if (bounce) { this.bounceP.set(bounce.x, BALL_R, bounce.z); this.bAt = bounce.at; } else this.bAt = -1;
    },
    /** A ball that is not in the hands: its place in body space. */
    ballAt: (x: number, y: number, z: number) => { this.bmode = 3; this.bounceP.set(x, y, z); },
    get hand(): Side { return this.fig.hand; },
    get from(): Side { return this.fig.from; },
    get side(): Side { return this.fig.side; },
    get t(): number { return this.fig.t; },
    shoulder: (sd: Side) => this.shoulderGuess(sd).clone(),
    legK: (k: number) => { this.legK = k; },
  };
  private bmode = 0;
  private bside: Side | 0 = -1;
  private bk = 0;
  private barc = 0;
  private bAt = -1;
  private bWas = 0;
  private bounceP = new THREE.Vector3();

  private lookAt(x: number, y: number, z: number): void {
    this.looking = true;
    this.toBody(this.look.set(x, y, z));
  }

  // ------------------------------------------------------------------ apply

  private apply(dt: number, s: FigState, ball: BallSeen): void {
    const legK = Math.min(1, dt * this.legK);
    // hips: as high as the planted feet allow, minus the crouch
    let hip = Infinity;
    for (const sd of [1, -1] as Side[]) {
      if (!this.plant[sd]) continue;
      const f = this.foot[sd];
      const h = Math.hypot(f.x - sd * HIP_X, f.z - HIP_Z);
      hip = Math.min(hip, Math.sqrt(Math.max(0.05, L * L - h * h)) - f.y);
    }
    if (!Number.isFinite(hip)) hip = L * 0.97;
    hip = Math.max(0.2, hip - this.hipDrop);
    this.hipY += (hip - this.hipY) * Math.min(1, dt * 22);
    this.obj.position.y = this.hipY - L;
    // the whole body: facing, spins and falls
    this.body.rotation.set(this.pitch, s.face + this.yaw, 0, 'YXZ');
    // torso
    _e.set(this.lean, this.twist, this.roll, 'YXZ');
    this.torsoQ.setFromEuler(_e);
    this.bTorso.quaternion.slerp(this.torsoQ, Math.min(1, dt * 14));
    // legs: aimed at the footholds; a foot nearer than the leg is long bends the "knee"
    for (const sd of [1, -1] as Side[]) {
      const f = this.foot[sd];
      _a.set(f.x - sd * HIP_X, f.y - this.hipY, f.z - HIP_Z);
      const len = _a.length();
      _a.divideScalar(len || 1);
      _q.setFromUnitVectors(DOWN, _a);
      const leg = this.bLeg[sd];
      leg.quaternion.slerp(_q, legK);
      const k = clamp(len / L, 0.7, 1);
      leg.scale.y += (k - leg.scale.y) * legK;
    }
    this.root.updateMatrixWorld(true);
    // arms: aimed at their points from the real shoulder
    const tq = this.bTorso.quaternion;
    _q2.copy(tq).invert();
    for (const sd of [1, -1] as Side[]) {
      const a = this.aim[sd];
      // the shoulder in body space
      const sh = this.shoulderBody(sd, _b);
      _a.copy(a.p).sub(sh);
      if (a.level && Math.abs(_a.y) < ARM_M) {
        // reach out level with the point, so the fist ends at its height
        const hd = Math.sqrt(ARM_M * ARM_M - _a.y * _a.y), h = Math.hypot(_a.x, _a.z) || 1;
        _a.x *= hd / h; _a.z *= hd / h;
      }
      _a.applyQuaternion(_q2);
      if (_a.lengthSq() < 1e-6) _a.set(sd, -1, 0);
      _a.normalize();
      _q.setFromUnitVectors(this.fistAxis[sd], _a);
      this.bArm[sd].quaternion.slerp(_q, Math.min(1, dt * a.k));
    }
    // head: looks at the play, stays level against the torso's lean
    if (this.looking) {
      const sh = this.shoulderBody(1, _b);
      _a.copy(this.look).sub(sh);
      const yaw = clamp(Math.atan2(_a.x, _a.z), -0.9, 0.9);
      const pitch = clamp(-Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -0.5, 0.6);
      _e.set(pitch - this.lean * 0.6, yaw - this.twist, -this.roll * 0.5, 'YXZ');
    } else _e.set(-this.lean * 0.6, -this.twist, 0, 'YXZ');
    _q.setFromEuler(_e);
    this.bHead.quaternion.slerp(_q, Math.min(1, dt * 8));
    this.root.updateMatrixWorld(true);
    // the ball
    if (ball.mine) this.placeBall(s);
  }

  /** A shoulder joint in body space (after the torso turned). */
  private shoulderBody(sd: Side, out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.shoulderRest[sd]).multiplyScalar(FIG).applyQuaternion(this.bTorso.quaternion);
    out.y += this.hipY;
    out.z += HIP_Z;
    return out;
  }

  /** A fist in body space. */
  fistBody(sd: Side, out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.fist[sd]).applyQuaternion(this.bArm[sd].quaternion).multiplyScalar(FIG);
    _c.copy(this.shoulderRest[sd]).multiplyScalar(FIG);
    out.add(_c).applyQuaternion(this.bTorso.quaternion);
    out.y += this.hipY;
    out.z += HIP_Z;
    return out;
  }

  /** Body space → world. */
  toWorld(v: THREE.Vector3): THREE.Vector3 {
    return v.applyMatrix4(this.body.matrixWorld);
  }

  private placeBall(s: FigState): void {
    const out = this.ballAt;
    if (this.bmode === 1) {
      if (this.bside === 0) this.between(out, 0.1); else this.palm(this.bside, out);
      this.rel.copy(out);
    } else if (this.bmode === 2) {
      // from the release to the catching hand, through the floor or on a little arc
      const to = _d;
      if (this.bside === 0) this.between(to, 0.1); else this.palm(this.bside, to);
      const k = this.bk, r = this.rel, at = this.bAt;
      if (at > 0) {
        const f = this.bounceP;
        if (k < at) {
          const u = k / at;
          out.set(lerp(r.x, f.x, u), r.y - (r.y - BALL_R) * (0.35 * u + 0.65 * u * u), lerp(r.z, f.z, u));
        } else {
          const u = (k - at) / (1 - at);
          out.set(lerp(f.x, to.x, u), BALL_R + (to.y - BALL_R) * (1 - (1 - u) * (1 - u) * 0.85 - 0.15 * (1 - u)), lerp(f.z, to.z, u));
        }
        if (this.bWas < at && k >= at) this.bounced = true;
      } else {
        out.lerpVectors(r, to, smooth(k));
        out.y += Math.sin(Math.PI * k) * this.barc;
      }
      this.bWas = k;
    } else if (this.bmode === 3) {
      out.copy(this.bounceP);
      this.rel.copy(out);
    } else if (s.act === 'free' && s.mood === 0) {
      this.dribbleBall(out);
    } else if (s.act === 'shot') {
      if (s.actT < 0.14) this.between(out, 0.05);
      else {
        // on the shooting hand, over the forehead
        this.fistBody(-1, out);
        out.y += FIST_HALF * 0.6 + BALL_R;
        out.z += 0.04;
      }
      this.rel.copy(out);
    } else { this.between(out, 0.08); this.rel.copy(out); }
    this.toWorld(out);
    this.bmode = 0;
  }

  /** The ball palmed in one hand: past the fist along the arm, and below it when the arm hangs. */
  private palm(sd: Side, out: THREE.Vector3): THREE.Vector3 {
    this.fistBody(sd, out);
    const sh = this.shoulderBody(sd, _e2);
    sh.subVectors(out, sh).normalize();
    const down = 0.8 * (1 - Math.max(0, sh.y));
    sh.y -= down;
    sh.normalize();
    return out.addScaledVector(sh, FIST_HALF * 0.8 + BALL_R * 0.92);
  }

  /** The ball between both hands (a little in front of them). */
  private between(out: THREE.Vector3, fwd: number): void {
    this.fistBody(1, out);
    this.fistBody(-1, _a);
    out.add(_a).multiplyScalar(0.5);
    out.z += fwd;
  }

  /** The dribble's ball: under the hand, free down to the floor, back up into the hand. */
  private dribbleBall(out: THREE.Vector3): void {
    const sd = this.hand, u = this.du;
    this.palm(sd, _a);
    const hx = _a.x, hy = _a.y, hz = _a.z;
    if (u < 0.16 || u >= 0.86) {
      out.set(hx, hy, hz);
      this.rel.set(hx, hy, hz);
      return;
    }
    const floor = _b.set(sd * 0.46, BALL_R, hz + 0.1);
    if (u < 0.5) {
      // thrown down: fast and getting faster
      const k = (u - 0.16) / 0.34;
      const r = this.rel;
      out.set(lerp(r.x, floor.x, k), r.y - (r.y - BALL_R) * (0.4 * k + 0.6 * k * k), lerp(r.z, floor.z, k));
    } else {
      // back up, slowing, into the waiting hand
      const k = (u - 0.5) / 0.36;
      const e = 1 - (1 - k) * (1 - k) * 0.85 - 0.15 * (1 - k);
      out.set(lerp(floor.x, hx, k), BALL_R + (hy - BALL_R) * e, lerp(floor.z, hz, k));
    }
    this.inHands = false;
  }

  // ------------------------------------------------------------------ the ball in the world

  /** World position of the right fist. */
  handRight(out: THREE.Vector3): THREE.Vector3 {
    return this.toWorld(this.fistBody(-1, out));
  }

  handLeft(out: THREE.Vector3): THREE.Vector3 {
    return this.toWorld(this.fistBody(1, out));
  }

  dispose(): void {
    // no mixer: every pose is built from the bones
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

export type FigApi = Figure['moveApi'];
export type { Side };
export { FIST_HALF, HIP_X, HIP_Z, smooth, seg, lerp, clamp, UP };
