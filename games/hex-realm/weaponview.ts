// Hex Realm 1.2: the weapons in 3D. Every weapon in sight (the hero's, the warrior's shield, the
// foes', arrows in flight and weapons lying on the ground) is one instance of one BatchedMesh, so all
// of them together cost one draw call (and one in the shadow pass). The models come from
// weapons.glb (import-weapons.mjs): vertex colours, flat shading, the grip at the origin, +Y towards
// the tip.
//   - A weapon in hand hangs on the hand's Weapon.R bone. The RPG heroes have their own weapon
//     welded into the body on that bone: the figure hides it by shrinking the bone (figure.ts) and
//     the grip follows the bone's place and turn instead. GRIP holds, per model, where the welded
//     weapon pointed in the bone's frame (measured from the GLBs), so a new weapon lies the same way.
//   - The shield hangs on the left forearm (LowerArm.L).
import { THREE, model } from '@core/three';
import { WEAPON_MODELS, type WeaponModel } from './weapons';
import type { Figure } from './figure';

export const WEAPONS_KEY = 'hr:weapons';

/** Per hero model: the welded weapon's tip and width directions in the Weapon.R frame, and the scale. */
const GRIP: Record<string, { tip: [number, number, number]; width: [number, number, number]; scale: number; off?: number }> = {
  warrior: { tip: [-1, 0, 0], width: [0, 1, 0], scale: 0.37 },
  monk: { tip: [-1, 0, 0], width: [0, 1, 0], scale: 0.37 },
  rogue: { tip: [1, 0, 0], width: [0, 1, 0], scale: 0.47 },
  ranger: { tip: [1, 0, 0], width: [0, 1, 0], scale: 0.42 },
  cleric: { tip: [-1, 0, 0], width: [0, 1, 0], scale: 0.37, off: -0.15 },
  wizard: { tip: [-1, 0, 0], width: [0, 1, 0], scale: 0.37, off: -0.15 },
};

/** The shield on the left forearm (in LowerArm.L's frame). */
export const SHIELD_GRIP = { pos: [0.2, 0.2, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number], scale: 0.55 };

/** How big a weapon lying on the ground is (world units per model unit). */
const GROUND_SCALE = 0.21;

const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

/** The grip matrix of a hero model (model space of the weapon → Weapon.R space without its scale). */
function gripMatrix(look: string): THREE.Matrix4 {
  const g = GRIP[look] ?? GRIP.warrior;
  const y = new THREE.Vector3(...g.tip), x = new THREE.Vector3(...g.width), z = new THREE.Vector3().crossVectors(x, y);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.scale(_s.setScalar(g.scale));
  m.setPosition(y.clone().multiplyScalar(g.off ?? 0));
  return m;
}

/** The weapons' geometry (float positions and colours, indexed), one per model. */
function weaponGeometries(): Map<WeaponModel, THREE.BufferGeometry> {
  const out = new Map<WeaponModel, THREE.BufferGeometry>();
  const root = model(WEAPONS_KEY, { shadows: true });
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (WEAPON_MODELS as readonly string[]).includes(mesh.name) ? mesh.name : mesh.parent?.name ?? '';
    if (!(WEAPON_MODELS as readonly string[]).includes(name)) return;
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    const pa = src.getAttribute('position'), ca = src.getAttribute('color');
    const pos = new Float32Array(pa.count * 3), col = new Float32Array(pa.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      col[i * 3] = ca ? ca.getX(i) : 0.7; col[i * 3 + 1] = ca ? ca.getY(i) : 0.7; col[i * 3 + 2] = ca ? ca.getZ(i) : 0.7;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = src.getIndex();
    g.setIndex(idx ? Array.from(idx.array as ArrayLike<number>) : [...Array(pa.count).keys()]);
    g.computeBoundingSphere();
    out.set(name as WeaponModel, g);
  });
  return out;
}

export class WeaponRack {
  readonly batch: THREE.BatchedMesh;
  private ids = new Map<WeaponModel, number>();
  private slotGeo: number[] = [];
  private n = 0;
  private grips = new Map<string, THREE.Matrix4>();
  private shieldLocal: THREE.Matrix4;
  /** Weapons drawn this frame (test hook). */
  drawn = 0;

  constructor(parent: THREE.Object3D, private cap = 48) {
    const geos = weaponGeometries();
    let verts = 0, idx = 0;
    for (const g of geos.values()) { verts += g.getAttribute('position').count; idx += g.getIndex()!.count; }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.batch = new THREE.BatchedMesh(cap, verts, idx, mat);
    this.batch.castShadow = true;
    this.batch.receiveShadow = true;
    this.batch.sortObjects = false;
    for (const [k, g] of geos) { this.ids.set(k, this.batch.addGeometry(g)); g.dispose(); }
    const first = this.ids.values().next().value ?? 0;
    for (let i = 0; i < cap; i++) { this.batch.addInstance(first); this.batch.setVisibleAt(i, false); this.slotGeo.push(first); }
    this.batch.frustumCulled = false;
    parent.add(this.batch);
    this.shieldLocal = new THREE.Matrix4().compose(new THREE.Vector3(...SHIELD_GRIP.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...SHIELD_GRIP.rot)), new THREE.Vector3().setScalar(SHIELD_GRIP.scale));
  }

  /** Re-reads SHIELD_GRIP (a tuning hook). */
  retuneShield(): void {
    this.shieldLocal.compose(new THREE.Vector3(...SHIELD_GRIP.pos), _q.setFromEuler(_e.set(...SHIELD_GRIP.rot)), _s.setScalar(SHIELD_GRIP.scale));
  }

  begin(): void { this.n = 0; }

  /** A weapon at a world matrix. */
  add(m: WeaponModel, world: THREE.Matrix4): void {
    if (this.n >= this.cap) return;
    const id = this.ids.get(m);
    if (id === undefined) return;
    const i = this.n++;
    if (this.slotGeo[i] !== id) { this.batch.setGeometryIdAt(i, id); this.slotGeo[i] = id; }
    this.batch.setMatrixAt(i, world);
    this.batch.setVisibleAt(i, true);
  }

  /** A weapon in a figure's hand (its own welded weapon hidden). */
  inHand(fig: Figure, look: string, m: WeaponModel): void {
    const bone = fig.weaponBone;
    if (!bone?.parent) return;
    fig.hideWeapon = true;
    bone.parent.updateWorldMatrix(true, false);
    _l.compose(bone.position, bone.quaternion, _s.set(1, 1, 1));
    let g = this.grips.get(look);
    if (!g) { g = gripMatrix(look); this.grips.set(look, g); }
    _m.multiplyMatrices(bone.parent.matrixWorld, _l).multiply(g);
    this.add(m, _m);
  }

  /** A shield on a figure's left forearm. */
  onArm(fig: Figure, m: WeaponModel): void {
    const bone = fig.bones.get('LowerArmL');
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    _m.multiplyMatrices(bone.matrixWorld, this.shieldLocal);
    this.add(m, _m);
  }

  /** A weapon lying on the ground (a drop), turning slowly, `lift` over the ground. */
  onGround(m: WeaponModel, x: number, z: number, lift: number, spin: number, scale = 1): void {
    const shield = m.startsWith('Shield');
    _q.setFromEuler(_e.set(shield ? -1.2 : Math.PI / 2 - 0.25, spin, shield ? 0 : Math.PI / 4, 'YXZ'));
    _m.compose(_p.set(x, lift, z), _q, _s.setScalar(GROUND_SCALE * scale));
    this.add(m, _m);
  }

  /** An arrow in flight along `ang` (atan2(dx, dz)). */
  arrow(x: number, y: number, z: number, ang: number, scale = 0.32): void {
    _q.setFromEuler(_e.set(Math.PI / 2, ang, 0, 'YXZ'));
    _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale));
    // the arrow's point is at +y: centre it on the shot
    _l.makeTranslation(0, -1.2, 0);
    _m.multiply(_l);
    this.add('Arrow', _m);
  }

  end(): void {
    for (let i = this.n; i < this.cap; i++) { if (this.batch.getVisibleAt(i)) this.batch.setVisibleAt(i, false); }
    this.drawn = this.n;
  }

  clear(): void { this.begin(); this.end(); }

  dispose(): void { this.batch.dispose(); (this.batch.material as THREE.Material).dispose(); }
}

const keepers: THREE.Scene[] = [];

/** Keeps the batch's shader program alive behind the menu (the core's keepPrograms does not know batches). */
export function keepRackProgram(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera, rack: WeaponRack): void {
  if (keepers.length) return;
  const s = new THREE.Scene();
  s.fog = world.fog;
  world.traverse((o) => {
    if (!(o as THREE.Light).isLight) return;
    const l = (o as THREE.Light).clone();
    s.add(l);
    if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
  });
  const b = new THREE.BatchedMesh(1, 3, 3, (rack.batch.material as THREE.Material).clone());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setIndex([0, 1, 2]);
  b.addInstance(b.addGeometry(g));
  b.castShadow = true; b.receiveShadow = true; b.frustumCulled = false;
  s.add(b);
  renderer.compile(s, camera);
  keepers.push(s);
}
