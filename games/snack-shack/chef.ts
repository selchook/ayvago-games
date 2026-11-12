// Snack Shack: the chef is the player's own platform character (a rigged Mini Character) with one
// AnimationMixer. It dashes along the aisle to the station the player used and works it with the
// model's own clips (sprint, interact-right, pick-up, emote-yes, emote-no, idle).
import { THREE, model, modelClips, playerCharacter3d } from '@core/three';
import { AISLE_Z, C } from './diner';

type Clip = 'idle' | 'sprint' | 'walk' | 'interact-right' | 'interact-left' | 'pick-up' | 'emote-yes' | 'emote-no';
const ONCE = new Set<Clip>(['interact-right', 'interact-left', 'pick-up', 'emote-yes', 'emote-no']);

export class Chef {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private clip: Clip = 'idle';
  private target = 0;
  /** Which way to face once there: +1 the kitchen row (towards the camera), -1 the pass. */
  private faceDir = 1;
  private pending: Clip | null = null;
  private busyT = 0;
  x = 0;

  constructor(parent: THREE.Object3D, key = playerCharacter3d()) {
    const obj = model(key, { shadows: true });
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
    obj.scale.setScalar(C * 0.86);
    this.root.add(obj);
    this.root.position.set(0, 0, AISLE_Z);
    parent.add(this.root);
    this.mixer = new THREE.AnimationMixer(obj);
    for (const c of modelClips(key)) {
      const a = this.mixer.clipAction(c);
      if (ONCE.has(c.name as Clip)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(c.name as Clip, a);
    }
    this.play('idle', 0);
  }

  private play(clip: Clip, fade = 0.12, speed = 1): void {
    const next = this.actions.get(clip);
    if (!next) return;
    next.timeScale = speed;
    if (this.current === next && !ONCE.has(clip)) return;
    next.reset().play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.clip = clip;
  }

  /** Dash to x and work there: `dir` +1 = a kitchen-row station, -1 = the pass. */
  goTo(x: number, dir: 1 | -1, work: Clip = 'interact-right'): void {
    this.target = x;
    this.faceDir = dir;
    this.pending = work;
  }

  /** A short reaction on the spot (cheer at the day's end, a head shake on a mistake). */
  react(clip: 'emote-yes' | 'emote-no'): void {
    this.pending = null;
    this.target = this.x;
    this.play(clip, 0.1);
    this.busyT = 0.9;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    const d = this.target - this.x;
    const yawTo = (y: number) => {
      let diff = y - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, dt * 16);
    };
    if (Math.abs(d) > 0.04) {
      // a fast dash (the action itself already happened: the chef only shows where)
      const v = Math.sign(d) * Math.min(Math.abs(d) * 9, 7.5);
      this.x += v * dt;
      if (Math.abs(this.target - this.x) < 0.04 || Math.sign(this.target - this.x) !== Math.sign(d)) this.x = this.target;
      yawTo(d > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.play('sprint', 0.08, 1.6);
      this.busyT = 0;
    } else {
      yawTo(this.faceDir > 0 ? 0 : Math.PI);
      if (this.pending) {
        this.play(this.pending, 0.08, 1.7);
        this.pending = null;
        this.busyT = 0.45;
      } else if (this.busyT > 0) {
        this.busyT -= dt;
        if (this.busyT <= 0) this.play('idle', 0.2);
      } else if (this.clip === 'sprint') this.play('idle', 0.15);
    }
    this.root.position.x = this.x;
  }
}
