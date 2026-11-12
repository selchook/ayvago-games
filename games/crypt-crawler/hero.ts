// The hero: the player's platform character as a rigged Kenney Mini Character on one
// AnimationMixer, every move from its own clips (idle, walk, sprint, attack-melee-right,
// holding-right for the charge, die, emote-yes). The Mini Dungeon sword sits in its right fist and
// the round shield on its left arm, both parented to the arm bones so they follow the clips.
import { THREE, model, modelClips } from '@core/three';
import { md, mdMat } from './kit';
import type Phaser from 'phaser';

/** Figures are drawn a bit larger than the kit's tiles so the action reads on a phone. */
export const FIG = 1.3;
const WALK_LOOP = 1.15;   // tiles covered by one loop of the walk clip at scale 1
const SPRINT_LOOP = 1.9;

type Clip = 'idle' | 'walk' | 'sprint' | 'attack-melee-right' | 'holding-right' | 'die' | 'emote-yes' | 'pick-up' | 'jump' | 'fall';
const ONCE = new Set<Clip>(['attack-melee-right', 'die', 'emote-yes', 'pick-up', 'jump']);

let heroSkin: THREE.MeshLambertMaterial | null = null;

export class HeroFigure {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private obj: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  clip: Clip = 'idle';
  readonly sword: THREE.Object3D;
  /** The sword's tip in world space (trails). */
  readonly tip = new THREE.Object3D();
  private glowMats: THREE.MeshLambertMaterial[] = [];
  private spin = 0;

  constructor(scene: Phaser.Scene, key: string) {
    this.obj = model(key, { shadows: true });
    const bones = new Map<string, THREE.Object3D>();
    let srcMat: THREE.MeshStandardMaterial | null = null;
    const skinned: THREE.SkinnedMesh[] = [];
    this.obj.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        srcMat ??= m.material as THREE.MeshStandardMaterial;
        m.frustumCulled = false;
        if (m.isSkinnedMesh) skinned.push(m);
      } else if (o.name) bones.set(o.name, o);
    });
    heroSkin ??= new THREE.MeshLambertMaterial({ map: (srcMat as THREE.MeshStandardMaterial | null)?.map ?? null });
    // the hero's own copy of the skin, so it can flash when hurt
    const skin = heroSkin.clone();
    skin.emissive = new THREE.Color(0x000000);
    this.glowMats.push(skin);
    this.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = skin; });
    this.obj.updateMatrixWorld(true);
    // the fist: the far end of the right arm's triangles, in rest space
    const fist = (bone: string, side: 1 | -1) => {
      const box = new THREE.Box3();
      for (const sm of skinned) {
        const g = sm.geometry;
        const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const bi = sm.skeleton.bones.findIndex((b) => b.name === bone);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
          v.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix);
          box.expandByPoint(v);
        }
      }
      if (box.isEmpty()) return new THREE.Vector3(-0.3 * side, 0.36, 0);
      const c = box.getCenter(new THREE.Vector3());
      return new THREE.Vector3(side === 1 ? box.min.x + 0.04 : box.max.x - 0.04, c.y, c.z);
    };
    const attach = (bone: string, obj: THREE.Object3D, rest: THREE.Matrix4) => {
      const b = bones.get(bone);
      if (!b) return;
      b.updateMatrixWorld(true);
      const local = b.matrixWorld.clone().invert().multiply(rest);
      local.decompose(obj.position, obj.quaternion, obj.scale);
      b.add(obj);
    };
    const mat = mdMat(scene, 0);
    this.sword = model(md('weapon-sword'), { shadows: true });
    this.sword.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat; });
    // the grip in the right fist, the blade pointing forward (+z in the rest pose)
    const fr = fist('arm-right', 1);
    const swordRest = new THREE.Matrix4().compose(fr.clone().add(new THREE.Vector3(0, 0, 0.0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1.15, 1.15, 1.15));
    attach('arm-right', this.sword, swordRest);
    this.tip.position.set(0, 0.36, 0);
    this.sword.add(this.tip);
    const shield = model(md('shield-round'), { shadows: true });
    shield.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat; });
    const fl = fist('arm-left', -1);
    const shieldRest = new THREE.Matrix4().compose(fl.clone().add(new THREE.Vector3(0.05, 0, 0.02)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(0.75, 0.75, 0.75));
    attach('arm-left', shield, shieldRest);

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

  play(clip: Clip, o: { fade?: number; speed?: number; restart?: boolean } = {}): void {
    const next = this.actions.get(clip);
    if (!next) return;
    if (o.speed !== undefined) next.timeScale = o.speed;
    if (this.current === next && !o.restart) return;
    next.reset();
    if (o.speed === undefined) next.timeScale = 1;
    next.play();
    const fade = o.fade ?? 0.12;
    if (this.current && this.current !== next) {
      if (fade > 0) this.current.crossFadeTo(next, fade, false); else this.current.stop();
    }
    this.current = next;
    this.clip = clip;
  }

  /** True while a play-once clip runs. */
  get busy(): boolean {
    return !!this.current && ONCE.has(this.clip) && this.current.isRunning();
  }

  private dur(c: Clip): number {
    return this.actions.get(c)?.getClip().duration ?? 0.5;
  }

  /**
   * Picks the clip from what the hero does. `speed` in tiles per second, `face` the yaw
   * (atan2(dx, dz)), `swing` > 0 while a sword swing runs, `spin` > 0 while spinning,
   * `charge` 0..1 while charging.
   */
  drive(dt: number, s: { x: number; z: number; face: number; speed: number; swing: boolean; swingStart: boolean; spin: number; charge: number; dash: boolean; alive: boolean; hurt: number; inv: number }): void {
    this.root.position.set(s.x, 0, s.z);
    if (s.spin > 0) {
      this.spin += dt * 17;
      this.body.rotation.y = s.face + this.spin;
    } else {
      this.spin = 0;
      this.body.rotation.y = s.face;
    }
    if (!s.alive) this.play('die', { fade: 0.1 });
    else if (s.swingStart) this.play('attack-melee-right', { fade: 0.05, restart: true, speed: 1.9 });
    else if (s.spin > 0) this.play('attack-melee-right', { fade: 0.05, speed: 1.2 });
    else if (s.charge > 0) this.play('holding-right', { fade: 0.15 });
    else if (this.clip === 'attack-melee-right' && this.busy) { /* let the swing finish */ }
    else if (s.dash) this.play('sprint', { fade: 0.05, speed: 2.2 });
    else if (s.speed > 0.4) {
      if (s.speed > 2.6) this.play('sprint', { fade: 0.15, speed: (s.speed / (SPRINT_LOOP * FIG)) * this.dur('sprint') });
      else this.play('walk', { fade: 0.15, speed: Math.max(0.5, s.speed / (WALK_LOOP * FIG)) * this.dur('walk') });
    } else if (!(this.busy && (this.clip === 'emote-yes' || this.clip === 'pick-up'))) this.play('idle', { fade: 0.2 });
    // dash lean, hurt flash, blink while invulnerable
    this.body.rotation.x = s.dash ? 0.35 : 0;
    const flash = s.hurt < 0.12 ? 1 : 0;
    const charge = s.charge >= 1 ? 0.35 + Math.sin(performance.now() / 60) * 0.15 : s.charge * 0.2;
    for (const m of this.glowMats) m.emissive.setRGB(flash + charge, flash * 0.2 + charge * 0.8, flash * 0.2 + charge * 0.3);
    this.obj.visible = !(s.inv > 0 && s.alive && s.hurt < 1.2 && Math.floor(s.inv * 12) % 2 === 0);
    this.mixer.update(dt);
  }

  cheer(): void { this.play('emote-yes', { fade: 0.1, restart: true }); }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.obj);
  }
}
