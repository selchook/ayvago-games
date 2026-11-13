// The 3D view of a match: the court and city (kit.ts), six ballers (players.ts), the ball and its
// shadow, the control rings, the crowd and the particles, and the broadcast camera with its dunk
// close-up. It draws whatever state it is given: the solo game and the online host pass the
// simulation itself, the online guest passes the host's snapshots, interpolated.
import { THREE, World3D, model } from '@core/three';
import { BALL_R, HOOP_X, HOOP_Z, RIM_Y } from './court';
import { HEIGHT_M } from './body';
import { buildCourt, blobCanvas, type Court } from './kit';
import { Figure, type BallSeen, type FigState, type Kit } from './players';
import { Crowd } from './crowd';
import { Fx } from './fx3d';
import type { BallState } from './sim';
import { HELD_SNAP } from './netcode';
import { DUNKS } from './moves';

export interface ViewBall { x: number; y: number; z: number; state: BallState; holder: number }
export interface ViewState {
  p: FigState[];
  ball: ViewBall;
  fire: [boolean, boolean];
  /** Controlled player per team (-1: computer). */
  ctrl: [number, number];
  /** The local person's team (-1 in the menu). */
  me: number;
  /** The local team must take the ball back behind the arc. */
  takeBack: boolean;
}

export const CAM_FOV = 35;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();

export class CourtView {
  readonly court: Court;
  readonly figs: Figure[] = [];
  readonly ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private arrow: THREE.Mesh;
  readonly fx: Fx;
  readonly crowd: Crowd;
  private drawn = new THREE.Vector3(4, 1.2, 0);
  private off = new THREE.Vector3();
  private lastState: BallState = 'tip';
  private lastHolder = -1;
  /** Called when a dribbled ball hits the floor (the scene plays the bounce). */
  onDribble: ((x: number) => void) | null = null;
  private camX = 6;
  private dunk = 0;
  private dunkWant = 0;
  private shakeAmp = 0;
  private netSim: NetSim;
  private rimT = 9;
  private rimAmp = 0;
  /** The rim pulled down by a dunker hanging on it (radians). */
  private rimBend = 0;
  private rimBendV = 0;
  private boardT = 9;
  private boardAmp = 0;
  private time = 0;
  private flameT = 0;
  private spin = new THREE.Quaternion();

  constructor(private world: World3D, kits: [Kit, Kit], keys: string[], private menu = false) {
    const scene = world.scene;
    this.court = buildCourt(scene);
    const mat = this.figureMaterial(keys[0]);
    this.figMat = mat;
    for (let i = 0; i < 6; i++) {
      const f = new Figure(keys[i], kits[i < 3 ? 0 : 1], mat);
      scene.add(f.root);
      this.figs.push(f);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.court.ballMat);
    this.ball.castShadow = false; // the blob below it is its shadow
    scene.add(this.ball);
    const blob = new THREE.CanvasTexture(blobCanvas());
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.renderOrder = 1;
    scene.add(this.ballShadow);
    const ringGeo = new THREE.RingGeometry(0.42, 0.56, 36);
    for (let t = 0; t < 2; t++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: kits[t].trim, transparent: true, opacity: 0.85, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.renderOrder = 2;
      r.visible = false;
      scene.add(r);
      this.rings.push(r);
    }
    const cone = new THREE.ConeGeometry(0.16, 0.3, 4);
    cone.rotateX(Math.PI);
    this.arrow = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.fx = new Fx(scene);
    this.netSim = new NetSim(this.court.net);
    // spectators behind the fence: the far side, behind the half-court line and the baseline
    const spots: Array<{ x: number; z: number; rot: number }> = [];
    for (let i = 0; i < 13; i++) spots.push({ x: -1.6 + i * 1.15 + (i % 2) * 0.3, z: -10.2 - (i % 3) * 0.55, rot: 0.15 * Math.sin(i * 1.7) });
    for (let i = 0; i < 5; i++) spots.push({ x: -4.3 - (i % 2) * 0.6, z: -6 + i * 2.4, rot: Math.PI / 2 });
    for (let i = 0; i < 5; i++) spots.push({ x: 15.4 + (i % 2) * 0.6, z: -7 + i * 2.2, rot: -Math.PI / 2 });
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this.crowd = new Crowd(scene, ['character-male-b', 'character-male-e'], spots, rnd);
  }

  /** One matte material for all six ballers: the kit's colormap tinted by the team-kit vertex colours. */
  private figureMaterial(key: string): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ map: mapOfMini(key), vertexColors: true });
    mat.name = 'ballers';
    return mat;
  }

  private figMat: THREE.MeshLambertMaterial;

  /** A new crew on one team: three new figures in its kit (the old ones are freed). */
  setTeam(team: 0 | 1, kit: Kit, keys: string[]): void {
    for (let i = 0; i < 3; i++) {
      const idx = team * 3 + i;
      const old = this.figs[idx];
      this.world.scene.remove(old.root);
      old.dispose();
      old.free();
      const f = new Figure(keys[i], kit, this.figMat);
      this.world.scene.add(f.root);
      this.figs[idx] = f;
    }
    (this.rings[team].material as THREE.MeshBasicMaterial).color.setHex(kit.trim);
  }

  // ------------------------------------------------------------------ juice

  swish(clean: boolean): void { this.netSim.whip(clean ? 1 : 0.7); }
  rimHit(a = 1): void { this.rimT = 0; this.rimAmp = Math.max(this.rimT < 0.3 ? this.rimAmp : 0, 0.25 + 0.75 * a); this.netSim.sway(0.4 + a); }
  boardHit(a = 0.6): void { this.boardT = 0; this.boardAmp = 0.3 + a; }
  /** A slam yanks the rim down and the net with it. */
  slam(a = 1): void { this.rimBendV -= 2.2 * a; this.netSim.whip(1.4 * a); this.rimHit(1); }
  shake(a: number): void { this.shakeAmp = Math.max(this.shakeAmp, a); }
  /** A quick push of the camera towards a spot (an ankle breaker, a slam). */
  nudge(x: number, y: number, z: number, a = 0.8): void { this.kickAt.set(x, y, z); this.kickAmp = Math.max(this.kickAmp, a); }
  private kickAt = new THREE.Vector3();
  private kickAmp = 0;
  private kickT = 0;
  /** The dunk close-up, framed for the kind of dunk (moves.ts). */
  dunkCam(on: boolean, kind = -1): void {
    this.dunkWant = on ? 1 : 0;
    if (on && kind >= 0) this.dunkShot = DUNK_CAMS[kind] ?? DUNK_CAMS[1];
  }
  private dunkShot = DUNK_CAMS[1];

  /** Screen point of a world spot (for popups). */
  screen(x: number, y: number, z: number): { x: number; y: number } {
    const s = this.world.toScreen(_v.set(x, y, z));
    return { x: s.x, y: s.y };
  }

  /** Where the ball is drawn now. */
  get ballPos(): THREE.Vector3 { return this.drawn; }

  // ------------------------------------------------------------------ frame

  update(dt: number, vs: ViewState): void {
    this.time += dt;
    const seen = this.seen;
    seen.x = this.drawn.x; seen.y = this.drawn.y; seen.z = this.drawn.z; seen.state = vs.ball.state;
    for (let i = 0; i < 6; i++) {
      seen.mine = vs.ball.state === 'held' && vs.ball.holder === i;
      this.figs[i].update(dt, vs.p[i], seen);
    }
    this.placeBall(dt, vs);
    // control rings: the local player bright and pulsing, the online rival's softer
    for (let t = 0; t < 2; t++) {
      const id = vs.ctrl[t], r = this.rings[t];
      r.visible = id >= 0 && !this.menu;
      if (!r.visible) continue;
      const p = vs.p[id];
      r.position.set(p.x, 0.03, p.z);
      const mine = t === vs.me;
      const k = mine ? 1 + Math.sin(this.time * 7) * 0.08 : 0.85;
      r.scale.set(k, k, k);
      (r.material as THREE.MeshBasicMaterial).opacity = mine ? 0.9 : 0.5;
    }
    const mine = vs.me >= 0 ? vs.ctrl[vs.me] : -1;
    this.arrow.visible = mine >= 0 && !this.menu;
    if (mine >= 0) {
      const p = vs.p[mine];
      this.arrow.position.set(p.x, HEIGHT_M + 0.5 + p.lift + Math.sin(this.time * 5) * 0.06, p.z);
      this.arrow.rotation.y = this.time * 2;
    }
    // fire: the ball burns while the team on fire has it or shot it
    this.flameT -= dt;
    const team: number = vs.ball.holder >= 0 ? (vs.ball.holder < 3 ? 0 : 1) : -1;
    const fireOf = (t: number) => t === 0 ? vs.fire[0] : t === 1 ? vs.fire[1] : false;
    const burning = fireOf(team) || (team < 0 && (vs.ball.state === 'shot' || vs.ball.state === 'rattle') && fireOf(this.lastFireTeam));
    if (team >= 0) this.lastFireTeam = team;
    if (burning && this.flameT <= 0) {
      this.flameT = 1 / 45;
      this.fx.flame(this.drawn.x, this.drawn.y, this.drawn.z, vs.ball.state === 'shot' ? 1.15 : 0.8);
    }
    for (let t = 0; t < 2; t++) {
      if (!vs.fire[t]) continue;
      // flames lick round the feet of the crew on fire
      for (let i = 0; i < 3; i++) {
        if (Math.random() > dt * 9) continue;
        const p = vs.p[t * 3 + i];
        this.fx.flame(p.x + (Math.random() - 0.5) * 0.4, 0.15 + p.lift, p.z + (Math.random() - 0.5) * 0.4, 0.6);
      }
    }
    // the take-back arc glows
    const glow = this.court.arcGlow.material as THREE.MeshBasicMaterial;
    const want = vs.takeBack ? 0.45 + Math.sin(this.time * 6) * 0.2 : 0;
    glow.opacity += (want - glow.opacity) * Math.min(1, dt * 8);
    this.court.arcGlow.visible = glow.opacity > 0.01;
    this.animateHoop(dt, vs);
    this.crowd.update(dt);
    this.fx.update(dt, this.world.camera);
    this.camera(dt, vs);
  }

  private lastFireTeam = -1;
  private seen: BallSeen = { x: 0, y: 0, z: 0, state: 'tip', mine: false };

  private placeBall(dt: number, vs: ViewState): void {
    const b = vs.ball;
    const target = _w;
    if (b.state === 'held' && b.holder >= 0) {
      // in the hands, or on its way to the floor and back on a dribble (players.ts)
      const f = this.figs[b.holder];
      target.copy(f.ballAt);
      if (f.bounced) this.onDribble?.(target.x);
    } else target.set(b.x, b.y, b.z);
    // a change of who has it (a catch, a release) eases in instead of jumping, and so does a
    // held ball whose hold changes at once (the dribble hand to over the head for a shot)
    const gap = this.drawn.distanceTo(target);
    const handOff = b.state !== this.lastState || b.holder !== this.lastHolder;
    if ((handOff && gap > 0.05 && gap < 3) || (b.state === 'held' && gap > HELD_SNAP && gap < 3)) this.off.copy(this.drawn).sub(target);
    this.lastState = b.state;
    this.lastHolder = b.holder;
    this.off.multiplyScalar(Math.max(0, 1 - dt * 12));
    const prev = _v.copy(this.drawn);
    this.drawn.copy(target).add(this.off);
    this.ball.position.copy(this.drawn);
    // roll the ball along its path
    const dx = this.drawn.x - prev.x, dz = this.drawn.z - prev.z, dy = this.drawn.y - prev.y;
    const d = Math.hypot(dx, dz) + Math.abs(dy) * 0.3;
    if (d > 1e-4 && d < 2) {
      const ax = new THREE.Vector3(dz, 0, -dx);
      if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0);
      ax.normalize();
      this.spin.setFromAxisAngle(ax, d / BALL_R * (b.state === 'shot' ? -0.6 : 1));
      this.ball.quaternion.premultiply(this.spin);
    }
    const h = Math.max(0, this.drawn.y - BALL_R);
    const k = Math.max(0.35, 1 - h / 5);
    this.ballShadow.position.set(this.drawn.x, 0.025, this.drawn.z);
    this.ballShadow.scale.set(k, k, k);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - h / 4);
  }

  private animateHoop(dt: number, vs: ViewState): void {
    const c = this.court;
    // a dunker hanging on the rim holds it down; otherwise it springs back with a wobble
    let hang = 0;
    for (const p of vs.p) if (p.act === 'dunk' && p.lift > 1.0) hang = Math.max(hang, hangOn(p));
    this.rimBendV += (-(this.rimBend - 0.11 * hang) * 260 - this.rimBendV * 9) * dt;
    this.rimBend += this.rimBendV * dt;
    // the rim rattles
    this.rimT += dt;
    const rk = this.rimT < 0.7 ? Math.exp(-this.rimT * 7) * this.rimAmp : 0;
    c.rim.rotation.z = Math.sin(this.rimT * 55) * 0.05 * rk + this.rimBend;
    c.rim.position.y = RIM_Y + Math.sin(this.rimT * 48) * 0.012 * rk - this.rimBend * 0.2;
    this.boardT += dt;
    const bk = this.boardT < 0.5 ? Math.exp(-this.boardT * 8) * this.boardAmp : 0;
    c.board.position.x = -Math.abs(Math.sin(this.boardT * 60)) * 0.015 * bk;
    // the net: each knot on a spring, pushed open by the ball dropping through
    this.netSim.update(dt, this.drawn, c.rim.position);
  }

  private camera(dt: number, vs: ViewState): void {
    const cam = this.world.camera;
    const bx = this.menu ? 6.5 + Math.sin(this.time * 0.15) * 1.2 : this.drawn.x;
    const want = 6.4 + (Math.max(0, Math.min(12, bx)) - 6) * 0.22;
    this.camX += (want - this.camX) * Math.min(1, dt * 2.2);
    this.dunk += (this.dunkWant - this.dunk) * Math.min(1, dt * (this.dunkWant ? 5 : 2.5));
    const d = this.dunk;
    const zoom = this.menu ? 1.06 : 1;
    // broadcast: high on the near sideline; dunk: close on the near side, level with the rim,
    // the backboard edge-on, a wider lens
    const D = this.dunkShot;
    const px = this.camX * (1 - d) + (HOOP_X + D.p[0]) * d;
    const py = 9.4 * zoom * (1 - d) + D.p[1] * d;
    const pz = 18.6 * zoom * (1 - d) + D.p[2] * d;
    const lx = (this.camX + 0.2) * (1 - d) + (HOOP_X + D.l[0]) * d;
    const ly = 0.8 * (1 - d) + D.l[1] * d;
    const lz = -0.2 * (1 - d) + (HOOP_Z + D.l[2]) * d;
    const fov = CAM_FOV + D.fov * d;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.8);
    const s = this.shakeAmp;
    cam.position.set(px + (Math.random() - 0.5) * s, py + (Math.random() - 0.5) * s, pz + (Math.random() - 0.5) * s * 0.5);
    if (this.kickAmp > 0.001) {
      // a dolly push towards the spot, out and back
      this.kickT += dt;
      const k = this.kickAmp * Math.sin(Math.min(1, this.kickT / 0.5) * Math.PI);
      _h.copy(this.kickAt).sub(cam.position).normalize().multiplyScalar(k);
      cam.position.add(_h);
      if (this.kickT > 0.5) { this.kickAmp = 0; this.kickT = 0; }
    }
    cam.lookAt(lx, ly, lz);
    // in the close-up, players right in front of the lens step out of the picture
    for (let i = 0; i < 6; i++) {
      const f = this.figs[i].root;
      const near = d > 0.4 && vs.p[i]?.act !== 'dunk' && Math.hypot(f.position.x - cam.position.x, f.position.z - cam.position.z) < 5.6;
      f.visible = !near;
    }
    this.world.followSun(_v.set(6, 0, 0));
  }

  dispose(): void {
    for (const f of this.figs) f.dispose();
  }
}

/** The Mini Characters' shared colormap (taken from a loaded model). */
function mapOfMini(key: string): THREE.Texture | null {
  let map: THREE.Texture | null = null;
  model(key, { shadows: false }).traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.map && !map) map = m.map;
  });
  return map;
}


/** How hard a dunker pulls on the rim now (0..1): hanging after the slam. */
function hangOn(p: FigState): number {
  const d = DUNKS[p.kind] ?? DUNKS[0];
  const t = p.actT - d.rise;
  if (t < 0 || t > d.hang) return 0;
  return d.id === 'hang' ? 1 : 0.6;
}

/**
 * The net as springs: every vertex of the net's cylinder keeps an offset from its rest place with
 * its own velocity. The ball pushes the knots it touches out of its way and drags them down; a
 * swish whips the whole net, a rim hit makes it sway. The top row is tied to the rim.
 */
class NetSim {
  private rest: Float32Array;
  private off: Float32Array;
  private vel: Float32Array;
  private tie: Float32Array;
  private pos: THREE.BufferAttribute;
  private seed = 1;
  private calm = 0;

  constructor(private net: THREE.Mesh) {
    this.pos = net.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.rest = Float32Array.from(this.pos.array as Float32Array);
    const n = this.pos.count;
    this.off = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.tie = new Float32Array(n);
    let low = 0;
    for (let i = 0; i < n; i++) low = Math.min(low, this.rest[i * 3 + 1]);
    for (let i = 0; i < n; i++) this.tie[i] = Math.min(1, this.rest[i * 3 + 1] / (low || -1));
  }

  private rnd(): number { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647 - 0.5; }

  whip(a: number): void {
    for (let i = 0; i < this.pos.count; i++) {
      const t = this.tie[i];
      this.vel[i * 3] -= this.rest[i * 3] * 9 * a * t;
      this.vel[i * 3 + 1] -= 1.6 * a * t;
      this.vel[i * 3 + 2] -= this.rest[i * 3 + 2] * 9 * a * t;
    }
    this.calm = 0;
  }

  sway(a: number): void {
    const sx = this.rnd() * a, sz = this.rnd() * a;
    for (let i = 0; i < this.pos.count; i++) {
      const t = this.tie[i];
      this.vel[i * 3] += sx * t; this.vel[i * 3 + 2] += sz * t;
    }
    this.calm = 0;
  }

  update(dt: number, ball: THREE.Vector3, rim: THREE.Vector3): void {
    dt = Math.min(dt, 1 / 30);
    const bx = ball.x - rim.x, by = ball.y - rim.y, bz = ball.z - rim.z;
    const near = by < 0.25 && by > -0.75 && Math.hypot(bx, bz) < 0.5;
    if (!near && this.calm > 2) return;
    this.calm = near ? 0 : this.calm + dt;
    const R = BALL_R + 0.02;
    const n = this.pos.count, a = this.pos.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const t = this.tie[i];
      if (t <= 0) continue;
      const o = i * 3;
      // spring back to rest, damped
      for (let k = 0; k < 3; k++) {
        this.vel[o + k] += (-this.off[o + k] * 160 - this.vel[o + k] * 7) * dt;
        this.off[o + k] += this.vel[o + k] * dt;
      }
      let x = this.rest[o] + this.off[o], y = this.rest[o + 1] + this.off[o + 1], z = this.rest[o + 2] + this.off[o + 2];
      if (near) {
        // the ball pushes the knot out of its way (sideways) and drags it along
        const dx = x - bx, dz = z - bz, dy = y - by;
        const dh = Math.hypot(dx, dz);
        if (Math.abs(dy) < R && dh < R) {
          const want = Math.sqrt(Math.max(0, R * R - dy * dy));
          if (dh < want) {
            const k = (want - dh) / (dh || 1e-3);
            x += dx * k * t; z += dz * k * t;
            this.off[o] = x - this.rest[o]; this.off[o + 2] = z - this.rest[o + 2];
            this.vel[o + 1] -= 18 * dt * t;
          }
        }
      }
      // the net does not stretch far
      this.off[o + 1] = Math.max(-0.22 * t, Math.min(0.08, this.off[o + 1]));
      y = this.rest[o + 1] + this.off[o + 1];
      a[o] = x; a[o + 1] = y; a[o + 2] = z;
    }
    this.pos.needsUpdate = true;
  }
}

/** Dunk cameras by kind (moves.ts DUNKS): the lens's place and aim relative to the rim, and the extra field of view. */
const DUNK_CAMS: Array<{ p: [number, number, number]; l: [number, number, number]; fov: number }> = [
  { p: [-2.3, 2.9, 4.0], l: [-0.7, 3.0, -0.3], fov: 12 },    // tomahawk: high on the side, the whip
  { p: [-2.0, 2.4, 4.3], l: [-0.6, 2.85, -0.4], fov: 12 },   // power: level with the rim
  { p: [-0.6, 2.1, 4.0], l: [-0.3, 2.95, 0], fov: 14 },      // reverse: from the baseline corner
  { p: [-3.0, 3.9, 3.9], l: [-0.6, 2.6, 0], fov: 12 },       // 360: from above, the turn reads
  { p: [-1.0, 2.7, 4.8], l: [-0.8, 2.8, 0], fov: 10 },       // windmill: square on the side, the arm's circle
  { p: [-4.4, 3.4, 6.6], l: [-1.6, 2.7, 0], fov: 8 },        // alley-oop: wide, the lob and the catch
  { p: [-2.6, 1.5, 3.4], l: [-0.7, 3.0, 0], fov: 14 },       // between the legs: low, looking up
  { p: [-1.7, 1.5, 3.1], l: [-0.2, 3.1, 0], fov: 16 },       // rim hang: under the rim
];
