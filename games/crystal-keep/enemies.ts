// Crystal Keep: how the enemies look. Ground enemies are rigged Mini Characters (zombies; the
// armoured brutes are soldiers) drawn with RigInstances, flying ones are the kit's UFOs; every
// kind is instanced, so a crowded wave costs the same few draw calls as a quiet one.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { Instances, RigInstances, kitGeo, kitMat, ZOMBIE, SOLDIER, GUARD } from './kit';
import { ENEMIES, type Enemy, type EnemyKind, type Ally } from './sim';
import { PATH_Y } from './board';

interface Look {
  rig?: 'zombie' | 'soldier';
  ufo?: 'ufo' | 'gunship' | 'mothership';
  scale: number;
  tint: [number, number, number];
  clip: string;
  /** Tiles per second the clip shows at scale 1 (ties the stride to the real speed). */
  stride: number;
}

export const LOOKS: Record<EnemyKind, Look> = {
  zombie: { rig: 'zombie', scale: 1.3, tint: [1, 1, 1], clip: 'walk', stride: 0.75 },
  runner: { rig: 'zombie', scale: 1.1, tint: [1.25, 0.72, 0.62], clip: 'sprint', stride: 1.5 },
  brute: { rig: 'soldier', scale: 1.38, tint: [0.78, 0.86, 1.05], clip: 'walk', stride: 0.75 },
  giant: { rig: 'zombie', scale: 2.9, tint: [0.75, 1.05, 0.7], clip: 'walk', stride: 0.75 },
  ufo: { ufo: 'ufo', scale: 0.72, tint: [1, 1, 1], clip: '', stride: 1 },
  gunship: { ufo: 'gunship', scale: 0.95, tint: [1, 1, 1], clip: '', stride: 1 },
  mothership: { ufo: 'mothership', scale: 2.2, tint: [1, 1, 1], clip: '', stride: 1 },
};

/** Flying height of the UFOs. */
export const FLY_Y = 1.35;

interface Vis {
  t: number;
  yaw: number;
  born: number;
  flash: number;
}

interface Corpse {
  kind: EnemyKind;
  x: number; z: number; y: number;
  yaw: number;
  t: number;
  spin: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ICE = new THREE.Color(0.45, 0.78, 1.25);

export class EnemyView {
  private zombies: RigInstances;
  private soldiers: RigInstances;
  private ufos: Record<'ufo' | 'gunship' | 'mothership', Instances>;
  private guards: RigInstances;
  /** Frost Nova's ice: a translucent shell around every frozen enemy. */
  private ice: Instances;
  private iceMat: THREE.MeshBasicMaterial;
  private guardVis = new Map<number, { t: number; yaw: number; born: number }>();
  private vis = new Map<number, Vis>();
  private corpses: Corpse[] = [];
  /** Called when a falling UFO hits the ground (for an explosion). */
  onCrash: ((x: number, z: number, big: boolean) => void) | null = null;

  constructor(scene: Phaser.Scene, parent: THREE.Object3D) {
    this.zombies = new RigInstances(parent, ZOMBIE, ['walk', 'sprint', 'die', 'attack-melee-left'], 60);
    this.soldiers = new RigInstances(parent, SOLDIER, ['walk', 'die', 'attack-melee-left'], 24);
    this.guards = new RigInstances(parent, GUARD, ['walk', 'attack-melee-right', 'emote-yes'], 8);
    // the same kind of material as the effects' rings, so it needs no shader of its own
    this.iceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
    this.ice = new Instances(parent, new THREE.IcosahedronGeometry(1, 0), this.iceMat, 60, { colors: true });
    const mat = kitMat(scene);
    this.ufos = {
      ufo: new Instances(parent, kitGeo('enemy-ufo-a'), mat, 40, { shadows: true, colors: true }),
      gunship: new Instances(parent, kitGeo('enemy-ufo-b-weapon'), mat, 20, { shadows: true, colors: true }),
      mothership: new Instances(parent, kitGeo('enemy-ufo-d-weapon'), mat, 3, { shadows: true, colors: true }),
    };
  }

  get drawCalls(): number { return this.zombies.drawCalls + this.soldiers.drawCalls + this.guards.drawCalls + 4; }

  /** A hit: the figure flashes white. */
  hit(e: Enemy): void {
    const v = this.vis.get(e.id);
    if (v) v.flash = 0.12;
  }

  /** A kill: the figure plays its death (UFOs spin down and crash). */
  kill(e: Enemy, yaw?: number): void {
    const v = this.vis.get(e.id);
    this.vis.delete(e.id);
    const fly = ENEMIES[e.kind].flying;
    this.corpses.push({ kind: e.kind, x: e.x, z: e.z, y: fly ? FLY_Y : PATH_Y, yaw: yaw ?? v?.yaw ?? 0, t: 0, spin: (Math.random() - 0.5) * 8 });
  }

  /** An enemy that reached the keep or was cleared: no corpse. */
  drop(e: Enemy): void {
    this.vis.delete(e.id);
  }

  /** Head height of an enemy (health bars, popups). */
  headY(kind: EnemyKind): number {
    const L = LOOKS[kind];
    return L.ufo ? FLY_Y + 0.55 * L.scale + 0.15 : PATH_Y + 0.72 * L.scale + 0.1;
  }

  /** Height of a guard's head (its time bar). */
  static GUARD_SCALE = 1.25;

  update(dt: number, time: number, enemies: Enemy[], allies: Ally[] = []): void {
    this.zombies.begin();
    this.soldiers.begin();
    this.guards.begin();
    this.ice.begin();
    // the keep's guards: march with their own walk, swing with their own attack
    for (const a of allies) {
      if (!a.alive) continue;
      let v = this.guardVis.get(a.id);
      if (!v) { v = { t: Math.random(), yaw: Math.atan2(a.fx, a.fz), born: 0 }; this.guardVis.set(a.id, v); }
      v.born = Math.min(1, v.born + dt * 2.5);
      let d = Math.atan2(a.fx, a.fz) - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.yaw += d * Math.min(1, dt * 10);
      const fight = a.fight !== 0;
      v.t += dt * (fight ? 1.3 : 1.15 / (0.75 * EnemyView.GUARD_SCALE));
      // a short shrink as their time runs out
      const out = a.life < 0.35 ? a.life / 0.35 : 1;
      const sc = EnemyView.GUARD_SCALE * Phaser.Math.Easing.Back.Out(v.born) * out;
      _m.compose(_v.set(a.x, PATH_Y, a.z), _q.setFromAxisAngle(UP, v.yaw), _s.set(sc, sc, sc));
      this.guards.put(_m, fight ? 'attack-melee-right' : 'walk', v.t, _c.setRGB(1.08, 1.05, 1.0));
    }
    for (const id of [...this.guardVis.keys()]) if (!allies.some((a) => a.id === id && a.alive)) this.guardVis.delete(id);
    for (const k in this.ufos) this.ufos[k as keyof typeof this.ufos].begin();
    for (const e of enemies) {
      if (!e.alive) continue;
      let v = this.vis.get(e.id);
      if (!v) { v = { t: Math.random() * 2, yaw: Math.atan2(e.dx, e.dz), born: 0, flash: 0 }; this.vis.set(e.id, v); }
      const L = LOOKS[e.kind];
      v.born = Math.min(1, v.born + dt * 3);
      v.flash = Math.max(0, v.flash - dt);
      let d = Math.atan2(e.dx, e.dz) - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.yaw += d * Math.min(1, dt * 8);
      const pop = v.born < 1 ? Phaser.Math.Easing.Back.Out(v.born) : 1;
      const s = L.scale * pop;
      const f = v.flash > 0 ? 2.6 : 1;
      const frozen = e.frozen > 0;
      if (frozen) _c.setRGB(0.62 * f, 0.88 * f, 1.35 * f);
      else _c.setRGB(L.tint[0] * f, L.tint[1] * f, L.tint[2] * f);
      if (frozen) {
        const k = L.ufo ? 0.6 * L.scale : 0.55 * L.scale;
        const wob = 1 + Math.sin(time * 20 + e.id) * 0.02 * Math.min(1, e.frozen);
        _m.compose(_v.set(e.x, L.ufo ? FLY_Y : PATH_Y + 0.42 * L.scale, e.z), _q.setFromAxisAngle(UP, e.id), _s.set(k * wob, k * 1.2 * wob, k * wob));
        this.ice.put(_m, ICE);
      }
      if (L.rig) {
        // held up by a guard: they fight back with their own attack
        if (!frozen) v.t += e.blocked ? dt * 1.2 : dt * e.speed / (L.stride * L.scale);
        _m.compose(_v.set(e.x, PATH_Y, e.z), _q.setFromAxisAngle(UP, v.yaw), _s.set(s, s, s));
        (L.rig === 'zombie' ? this.zombies : this.soldiers).put(_m, e.blocked && !frozen ? 'attack-melee-left' : L.clip, v.t, _c);
      } else {
        if (!frozen) v.t += dt;
        const bob = frozen ? 0 : Math.sin(time * 3 + e.id) * 0.08;
        const tilt = new THREE.Euler(Math.sin(time * 2 + e.id) * 0.08, v.t * (e.kind === 'mothership' ? 0.6 : 2.2), Math.cos(time * 2.3 + e.id) * 0.08);
        _m.compose(_v.set(e.x, FLY_Y + bob, e.z), _q.setFromEuler(tilt), _s.set(s, s, s));
        this.ufos[L.ufo!].put(_m, _c);
      }
    }
    // the fallen: ground enemies play their death and sink; UFOs spin down and crash
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      const L = LOOKS[c.kind];
      _c.setRGB(L.tint[0] * 0.8, L.tint[1] * 0.8, L.tint[2] * 0.8);
      if (L.rig) {
        const rig = L.rig === 'zombie' ? this.zombies : this.soldiers;
        const dur = rig.clipDuration('die');
        const sink = Math.max(0, c.t - dur - 0.35) * 0.6;
        if (sink > 0.5) { this.corpses.splice(i, 1); continue; }
        _m.compose(_v.set(c.x, PATH_Y - sink, c.z), _q.setFromAxisAngle(UP, c.yaw), _s.set(L.scale, L.scale, L.scale));
        rig.put(_m, 'die', c.t, _c, true);
      } else {
        c.y -= dt * (1.5 + c.t * 6);
        c.yaw += c.spin * dt;
        if (c.y <= PATH_Y + 0.1) {
          this.onCrash?.(c.x, c.z, c.kind === 'mothership');
          this.corpses.splice(i, 1);
          continue;
        }
        const tilt = new THREE.Euler(c.t * 2, c.yaw, c.t * 1.5);
        _m.compose(_v.set(c.x, c.y, c.z), _q.setFromEuler(tilt), _s.set(L.scale, L.scale, L.scale));
        this.ufos[L.ufo!].put(_m, _c);
      }
    }
    this.zombies.end();
    this.soldiers.end();
    this.guards.end();
    this.ice.end();
    for (const k in this.ufos) this.ufos[k as keyof typeof this.ufos].end();
  }
}
