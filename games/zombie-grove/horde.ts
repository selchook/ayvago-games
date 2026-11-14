// Zombie Grove: draws the horde. Every zombie kind is a Mini Character (the zombie itself, or a
// raider, an alien or a worker in the zombie palette), tinted and scaled; each model's parts are
// one InstancedMesh, posed from the model's own walk / sprint / attack / die clips (kit.ts bake).
// Per instance: the tint (instanceColor), the effects (aFx: dissolve, flash, palette, embers) and a
// rim light (aRim), all shared by all parts of a model so they upload once. The fallen play their
// death clip and dissolve with glowing edges. The Hulk is drawn light, big and with a sword, in a
// warm rim; the freeze bell turns the horde to ice.
import { THREE } from '@core/three';
import { bake, hordeMaterial, FRAMES, PERSON, ROSTER, type RosterModel, type BakedClip, type ClipPoses } from './kit';
import { FUSE, isBoss, type ZombieKind } from './defs';
import type { Sim, Zombie, Corpse } from './sim';

export interface Look { model: RosterModel; scale: number; wide: number; tint: number; zomb: number; clip: BakedClip; rate: number; gain?: number; rim: number; rimK: number }

export const LOOK: Record<Exclude<ZombieKind, 'brute' | 'matron' | 'knight' | 'king'>, Look> = {
  shambler: { model: 'character-zombie', scale: PERSON, wide: 1, tint: 0xffffff, zomb: 0, clip: 'walk', rate: 0.75, rim: 0x8affb0, rimK: 0.28 },
  runner: { model: 'character-zombie', scale: PERSON * 0.96, wide: 0.94, tint: 0xffd2c2, zomb: 0.15, clip: 'sprint', rate: 0.45, rim: 0xffb0a0, rimK: 0.32 },
  swarm: { model: 'character-zombie', scale: PERSON * 0.7, wide: 1, tint: 0xa4d48c, zomb: 0.25, clip: 'sprint', rate: 0.62, rim: 0x8affb0, rimK: 0.25 },
  spitter: { model: 'character-alien', scale: PERSON * 1.04, wide: 1, tint: 0xd8ffb0, zomb: 0.3, clip: 'walk', rate: 0.75, rim: 0xc8ff5a, rimK: 0.4 },
  exploder: { model: 'character-worker', scale: PERSON * 1.04, wide: 1.32, tint: 0xffa888, zomb: 0.45, clip: 'walk', rate: 0.6, rim: 0xff8a4a, rimK: 0.45 },
  tank: { model: 'character-raider', scale: PERSON * 1.85, wide: 1.16, tint: 0xf2ffe2, zomb: 0.38, clip: 'walk', rate: 0.55, gain: 1.7, rim: 0xffa040, rimK: 1.25 },
};

const ICE = new THREE.Color(0x9fe4ff);

const CAP: Record<RosterModel, number> = { 'character-zombie': 520, 'character-raider': 90, 'character-alien': 110, 'character-worker': 110 };

interface ModelSet {
  meshes: { mesh: THREE.InstancedMesh; part: number }[];
  clips: Map<BakedClip, ClipPoses>;
  color: THREE.InstancedBufferAttribute;
  fx: THREE.InstancedBufferAttribute;
  rim: THREE.InstancedBufferAttribute;
  n: number;
  cap: number;
}

const up = new THREE.Vector3(0, 1, 0);

export class Horde {
  private sets = new Map<RosterModel, ModelSet>();
  private w = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private white = new THREE.Color(0xffffff);
  private ember = new THREE.Color(0.25, 0.08, 0);
  /** Drawn this frame. */
  drawn = 0;

  constructor(parent: THREE.Object3D) {
    for (const name of ROSTER) {
      const b = bake(name);
      const mat = hordeMaterial(b.map);
      const cap = CAP[name];
      const color = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      color.setUsage(THREE.DynamicDrawUsage);
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      fx.setUsage(THREE.DynamicDrawUsage);
      const rim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      rim.setUsage(THREE.DynamicDrawUsage);
      const meshes = b.parts.map((part, i) => {
        const geo = part.geo;
        geo.setAttribute('aFx', fx);
        geo.setAttribute('aRim', rim);
        const mesh = new THREE.InstancedMesh(geo, mat, cap);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = color;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.count = 0;
        parent.add(mesh);
        return { mesh, part: i };
      });
      this.sets.set(name, { meshes, clips: b.clips, color, fx, rim, n: 0, cap });
    }
  }

  get drawCalls(): number { let n = 0; for (const s of this.sets.values()) n += s.meshes.length; return n; }

  /** One figure: model, world placement, pose, tint and effects. */
  private rimC = new THREE.Color();

  private put(set: ModelSet, x: number, y: number, z: number, face: number, sc: number, wide: number, clip: BakedClip, u: number, tint: THREE.Color, fx: [number, number, number, number], rim: THREE.Color, rimK: number): void {
    if (set.n >= set.cap) return;
    const poses = set.clips.get(clip) ?? set.clips.get('walk')!;
    const fi = Math.max(0, Math.min(FRAMES - 1, Math.floor(u * FRAMES)));
    const frame = poses.frames[fi];
    this.q.setFromAxisAngle(up, face);
    this.w.compose(this.p.set(x, y, z), this.q, this.s.set(sc * wide, sc, sc * wide));
    const i = set.n++;
    for (const { mesh, part } of set.meshes) mesh.setMatrixAt(i, this.m.multiplyMatrices(this.w, frame[part]));
    set.color.setXYZ(i, tint.r, tint.g, tint.b);
    set.fx.setXYZW(i, fx[0], fx[1], fx[2], fx[3]);
    set.rim.setXYZW(i, rim.r, rim.g, rim.b, rimK);
  }

  update(sim: Sim, time: number, cull: (x: number, z: number) => boolean): void {
    for (const s of this.sets.values()) s.n = 0;
    const fx: [number, number, number, number] = [0, 0, 0, 0];
    // the freeze bell: ice creeps over the horde and thaws in its last second
    const ice = Math.min(1, sim.buffs.freeze * 2, (4 - sim.buffs.freeze) * 6) * (sim.buffs.freeze > 0 ? 1 : 0);
    for (const zb of sim.zombies) {
      if (zb.dead || isBoss(zb.kind)) continue;
      if (!cull(zb.x, zb.z)) continue;
      const lk = LOOK[zb.kind as keyof typeof LOOK];
      const set = this.sets.get(lk.model)!;
      const poses = set.clips.get(lk.clip)!;
      let clip: BakedClip = lk.clip, u: number;
      if (zb.atk > 0) { clip = 'attack-melee-right'; u = 1 - zb.atk / 0.45; } else u = ((zb.anim * lk.rate) % poses.dur) / poses.dur;
      let sc = lk.scale * (0.94 + zb.vary * 0.12);
      let flash = zb.flash > 0 ? 0.5 : 0;
      this.c.setHex(lk.tint).lerp(this.white, (zb.vary - 0.5) * 0.3).multiplyScalar(lk.gain ?? 1.12);
      if (zb.fuse >= 0) {
        // the fuse: it swells and blinks faster and faster
        const k = 1 - zb.fuse / FUSE;
        sc *= 1 + k * 0.35;
        flash = Math.max(flash, Math.sin(time * (14 + k * 30)) > 0 ? 0.55 * k + 0.2 : 0);
        this.c.setRGB(1, 0.75 - k * 0.4, 0.6 - k * 0.4);
      }
      if (zb.burn > 0) this.c.multiplyScalar(0.8).add(this.ember);
      this.rimC.setHex(lk.rim);
      let rimK = lk.rimK;
      if (ice > 0) { this.c.lerp(ICE, ice * 0.75); this.rimC.lerp(ICE, ice); rimK = Math.max(rimK, ice * 0.9); }
      else if (zb.stun > 0) { this.rimC.setRGB(1, 1, 0.6); rimK = Math.max(rimK, 0.8); }
      // rising out of the ground (horde rushes, summons)
      const y = zb.born > 0 ? -zb.born * 1.4 : 0;
      fx[0] = 0; fx[1] = flash; fx[2] = lk.zomb; fx[3] = 0;
      this.put(set, zb.x, y, zb.z, zb.face, sc, lk.wide, clip, u, this.c, fx, this.rimC, rimK);
    }
    for (const c of sim.corpses) {
      if (isBoss(c.kind) || !cull(c.x, c.z)) continue;
      const lk = LOOK[c.kind as keyof typeof LOOK];
      const set = this.sets.get(lk.model)!;
      const u = Math.min(1, c.t / 0.55);
      const dis = Math.max(0, Math.min(1, (c.t - 0.3) / 0.85));
      this.c.setHex(lk.tint).multiplyScalar(lk.gain ?? 1.12);
      if (c.burnt) this.c.multiplyScalar(0.45);
      fx[0] = dis; fx[1] = c.t < 0.08 ? 0.4 : 0; fx[2] = lk.zomb; fx[3] = c.burnt ? 1.6 : 0.9;
      this.rimC.setHex(lk.rim);
      this.put(set, c.x, -Math.max(0, c.t - 0.7) * 0.4, c.z, c.face, lk.scale * (0.94 + c.vary * 0.12), lk.wide, 'die', u, this.c, fx, this.rimC, lk.rimK * (1 - dis));
    }
    this.drawn = 0;
    for (const s of this.sets.values()) {
      this.drawn += s.n;
      for (const { mesh } of s.meshes) {
        mesh.count = s.n;
        if (s.n) mesh.instanceMatrix.needsUpdate = true;
      }
      if (s.n) { s.color.needsUpdate = true; s.fx.needsUpdate = true; s.rim.needsUpdate = true; }
    }
  }
}

export type { Zombie, Corpse };
