// Rooftop Courier: draws a run (sim.ts) in 3D. The city chunks, the far skyline, a dusk sky with a
// low sun, the courier, the stamps, bottles, springs, pigeons, the drop point and every puff, glow
// and scrap of paper. The chase camera rides behind and above with a look ahead over the next
// gap, pulls out on long jumps, rises with climbs and never sinks into walls, scaffolding or
// chimneys (it checks the course's shape list round the lens, ahead of it and along the line of
// sight). When the courier drops into an alley the camera leans out over the gap and looks down
// at it (never from behind a wall), while the courier fades out on the way down and goes up in a
// puff of dust; a respawn fades it back in, blinking while it cannot be hurt. The power-ups show
// on the courier: a bubble, a magnet's pull rings, golden sparkles, time ripples, a paper glider
// and a streaming red ribbon. The dusk deepens as the run goes on: windows light up one by one,
// the street lamps come on. The Play scene and the menu's autopilot both use it, so the menu
// compiles every shader the first Play frame needs.
import Phaser from 'phaser';
import { World3D, THREE, model, playerCharacter3d } from '@core/three';
import { FLOOR, type Sim, type SimEvent } from './sim';
import { City, Skyline, type CityMats } from './city';
import type { Block } from './course';
import { kitReady, kitTexture, kitMaterial, Mats, type KitUniforms } from './kit';
import { Runner, type Look } from './runner';
import { Pickups, Pigeons, DropPoint } from './props';
import { Billboards, Particles, Ribbon, glowTex, puffTex, ringTex, bubbleTex } from './fx3d';
import { PALETTES, POWER_COLOR, clamp, lerp, smooth, isPower, type Theme } from './defs';

export const FOV = 70;

const LOS = [0.08, 0.16, 0.26, 0.38, 0.5, 0.62, 0.75, 0.88, 1];

export class View {
  readonly world: World3D;
  readonly city: City;
  readonly runner: Runner;
  private skyline: Skyline;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private hemi: THREE.HemisphereLight;
  private uni: KitUniforms = { uNight: { value: 0.15 }, uWarm: { value: new THREE.Color(1, 0.62, 0.28) } };
  private pickups: Pickups;
  private pigeons: Pigeons;
  private drop: DropPoint;
  private dust: Particles;
  private glows: Particles;
  private paper: Particles;
  private halo: Billboards;
  private lampGlow: Billboards;
  private rings: Billboards;
  private flashes: { x: number; y: number; z: number; s: number; t: number; max: number; c: number }[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camQ = new THREE.Quaternion();
  private refY = 0;
  private airK = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private punch = 0;
  private t = 0;
  private snap = true;
  private night = 0.15;
  private pal = { ...PALETTES.brick };
  private palTarget: Theme = 'brick';
  private v = new THREE.Vector3();
  /** Test hook: a fixed camera round the courier (yaw from behind, distance, height). */
  debugCam: { yaw: number; dist: number; h: number } | null = null;
  /** Menu backdrop: the picture moves up by this share (the courier shows above PLAY). */
  menuShift = 0;
  /** Test hook: the camera as it was before the overhead fix (rises over beams, nothing fades). */
  legacyCam = false;
  /** Camera distance multiplier. */
  camDist = 1;
  private bubbles: Billboards;
  private ribbon: Ribbon;
  /** The courier's fade: back in after a respawn (0 … 1), and whether this fall's puff went off. */
  private fadeIn = 1;
  private poofed = false;
  /** How far the camera has gone over to its look down into an alley (0 … 1). */
  private alleyK = 0;
  private alleyHold = 0;
  private inAlley = false;
  /** The courier's opacity this frame (test hook). */
  alpha = 1;
  /** Called when a falling courier goes up in its puff (the Play scene plays a sound). */
  onPoof: (() => void) | null = null;

  constructor(phaser: Phaser.Scene, readonly sim: Sim, look: Look, quality = 0.72) {
    kitReady(phaser);
    const P = PALETTES.brick;
    const world = new World3D(phaser, { fov: FOV, near: 0.3, far: 420, background: P.fog, fog: { color: P.fog, near: 65, far: 185 }, quality });
    this.world = world;
    const sun = world.addLights({ sky: P.hemi, ground: P.ground, ambient: 1.2, sun: P.sun, intensity: 3.0, dir: [-0.62, 0.42, -0.66], extent: 22 });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.far = 140;
    sun.position.multiplyScalar(1.6);
    this.hemi = world.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    const sc = world.scene;
    // the kit material: one texture array, opaque and cut-out
    const tex = kitTexture(phaser);
    const opaque = kitMaterial(tex, this.uni, false), cut = kitMaterial(tex, this.uni, true);
    opaque.userData.twin = () => kitMaterial(tex, this.uni, false);
    cut.userData.twin = () => kitMaterial(tex, this.uni, true);
    const fadeable = () => {
      const o = kitMaterial(tex, this.uni, false), c = kitMaterial(tex, this.uni, true);
      o.userData.twin = () => kitMaterial(tex, this.uni, false);
      c.userData.twin = () => kitMaterial(tex, this.uni, true);
      return { opaque: o, cut: c };
    };
    const mats: CityMats = { opaque, cut, cable: new THREE.MeshLambertMaterial({ color: 0x2a2630 }), fadeable };
    this.city = new City(sim.course, mats);
    sc.add(this.city.root);
    const other = new Mats();
    this.skyline = new Skyline(other, sim.seed + 3);
    sc.add(this.skyline.group);
    // the sky: a gradient dome with the low sun's glow
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(P.sky) }, uHorizon: { value: new THREE.Color(P.horizon) }, uBottom: { value: new THREE.Color(P.fog) },
        uSun: { value: new THREE.Vector3(-0.62, 0.12, -0.66).normalize() }, uSunCol: { value: new THREE.Color(P.sun) },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h * 2.2, 0.0, 1.0), 0.7)) : mix(uHorizon, uBottom, clamp(-h * 6.0, 0.0, 1.0));
          float d = max(0.0, dot(normalize(vDir), uSun));
          c += uSunCol * (pow(d, 600.0) * 2.5 + pow(d, 24.0) * 0.45 + pow(d, 4.0) * 0.12);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    sc.add(this.sky);
    // the courier
    this.runner = new Runner(playerCharacter3d(), other, look);
    sc.add(this.runner.root, this.runner.shadow);
    // effects and props
    const glow = glowTex();
    this.halo = new Billboards(sc, glow, 220, { order: 11 });
    this.lampGlow = new Billboards(sc, glow, 90, { order: 10 });
    this.rings = new Billboards(sc, ringTex(), 24, { flat: true, order: 9 });
    this.glows = new Particles(sc, glow, 360, { order: 13 });
    this.dust = new Particles(sc, puffTex(), 260, { additive: false, order: 12 });
    this.paper = new Particles(sc, paperTex(), 90, { additive: false, order: 14 });
    this.bubbles = new Billboards(sc, bubbleTex(), 4, { additive: false, order: 15 });
    this.ribbon = new Ribbon(sc);
    this.pickups = new Pickups(sc, this.halo);
    this.pigeons = new Pigeons(sc, this.halo);
    this.drop = new DropPoint(sc);
    this.city.update(sim.s - 40);
    sc.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) this.instanced.push(o as THREE.InstancedMesh); });
  }

  /** Every instanced effect, drawn once (tiny) in the first frames so no first use stalls later. */
  private instanced: THREE.InstancedMesh[] = [];
  private warmFrames = 3;

  private warmUp(): void {
    if (this.warmFrames <= 0) return;
    this.warmFrames--;
    const cam = this.world.camera;
    const p = cam.position.clone().add(cam.getWorldDirection(this.v).multiplyScalar(4));
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001));
    for (const im of this.instanced) {
      if (im.count > 0) continue;
      im.count = 1;
      im.setMatrixAt(0, m);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) { im.setColorAt(0, new THREE.Color(0)); im.instanceColor.needsUpdate = true; }
    }
    this.drop.group.visible = true;
  }

  // ------------------------------------------------------------------ frame

  shake(amp: number, t: number): void {
    if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = t; }
  }
  zoomPunch(k: number): void { this.punch = Math.max(this.punch, k); }
  snapCamera(): void { this.snap = true; }

  sync(sim: Sim, dt: number, sdt = dt): void {
    this.t += dt;
    this.city.update(sim.s - 28);
    this.skyline.follow(sim.s);
    const ground = sim.course.groundAt(sim.s, sim.x, sim.y + 0.2).y;
    this.runner.update(sdt, sim, ground);
    this.fade(sim, sdt);
    const z = sim.zip;
    this.runner.hands(sim, z ? sim.course.cableY(z, sim.s) + 0.02 : null, this.wallTop(sim));
    this.atmosphere(sim, dt);
    this.camera(sim, dt);
    if (!this.legacyCam) this.city.fadeOver(-this.world.camera.position.z, sim.s, dt, this.inAlley);
    this.sky.position.copy(this.world.camera.position);
    this.world.followSun(this.v.set(sim.x, Math.max(0, sim.y), -sim.s - 6));
    this.effects(sim, dt, sdt);
  }

  /**
   * The courier's opacity: a fall fades it out as it sinks (by time and by the depth left to the
   * alley floor, so it is gone before it gets there) and ends in a puff; a respawn fades it back
   * in; while it cannot be hurt it blinks softly. Every change is gradual, frame to frame.
   */
  private fade(sim: Sim, dt: number): void {
    const st = sim.state;
    let a = 1;
    if (st === 'fall') {
      // over the whole drop to the alley floor (gone just above it), and by time for long drops
      const drop = Math.max(1.5, sim.fallY0 - FLOOR - 0.3);
      a = Math.min(1 - smooth((sim.stateT - 0.3) / 0.8), smooth((sim.y - FLOOR - 0.3) / drop * 1.2));
    }
    else if (st === 'done' && sim.overReason === 'fell') a = 0;
    if (this.fadeIn < 1) { this.fadeIn = Math.min(1, this.fadeIn + dt / 0.45); a *= smooth(this.fadeIn); }
    if (sim.ghostT > 0 && st !== 'rescue') a *= 1 - Math.min(1, sim.ghostT / 0.3) * 0.28 * (1 - Math.cos(this.t * Math.PI * 2 * 4.5));
    this.alpha = a;
    this.runner.setOpacity(a);
    if (st === 'fall' && a < 0.12 && !this.poofed) {
      this.poofed = true;
      const x = sim.x, y = sim.y + 0.9, z = -sim.s;
      this.dust.burst(x, y, z, 26, 3.2, [0xd8ccc0, 0xb8aca2, 0xffffff], 0.9, 0.9, { up: 0.8 });
      this.glows.burst(x, y, z, 14, 3, [0xffffff, 0xffd8a0], 0.5, 0.3);
      this.ring(x, y - 0.5, z, 3.2, 0xffffff, 0.5);
      this.onPoof?.();
    }
  }

  /**
   * The alley the courier is dropping into, if any: falling, sliding down a wall, or in the air
   * below the roofs with nothing under it. The camera then looks down into it from over the gap.
   */
  private alley(sim: Sim): { s0: number; s1: number; y: number } | null {
    const st = sim.state, c = sim.course;
    const falling = st === 'fall' || st === 'slam' || (st === 'done' && sim.overReason === 'fell');
    if (!falling) {
      if (st !== 'air' || sim.vy > 0 || sim.power.glide > 0 || c.blockAt(sim.s)) return null;
    }
    let prev: Block | null = null;
    for (const b of c.blocks) { if (b.s1 <= sim.s + 0.01) prev = b; else break; }
    const next = c.nextBlock(sim.s);
    if (!prev || !next) return null;
    if (!falling) {
      if (sim.y > Math.min(prev.y, next.y) - 1.4) return null;
      if (c.groundAt(sim.s, sim.x, sim.y + 0.1).y > 0.5) return null;
    }
    return { s0: prev.s1, s1: next.s0, y: Math.max(prev.y, next.y) };
  }

  /** The top of whatever the hands rest on (vault, mantle). */
  private wallTop(sim: Sim): number | null {
    if (sim.state !== 'vault' && sim.state !== 'mantle') return null;
    let top: number | null = null;
    for (const b of sim.course.boxes) {
      if (b.s0 > sim.s + 1.5) break;
      if (b.s1 < sim.s - 1 || sim.x < b.x0 - 0.5 || sim.x > b.x1 + 0.5) continue;
      if (b.y1 > sim.y - 0.3 && b.y1 < sim.y + 2.6) top = Math.max(top ?? -1, b.y1);
    }
    return top;
  }

  /** The dusk deepens with the distance; each district has its own palette. */
  private atmosphere(sim: Sim, dt: number): void {
    this.night = clamp(0.12 + sim.s / 3200, 0.12, 0.88);
    this.uni.uNight.value = this.night;
    this.palTarget = sim.theme;
    const T = PALETTES[this.palTarget], k = Math.min(1, dt * 0.8);
    const mixc = (a: number, b: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
    const p = this.pal;
    p.sky = mixc(p.sky, T.sky); p.horizon = mixc(p.horizon, T.horizon); p.fog = mixc(p.fog, T.fog); p.sun = mixc(p.sun, T.sun); p.hemi = mixc(p.hemi, T.hemi); p.ground = mixc(p.ground, T.ground);
    const n = this.night;
    const dark = new THREE.Color(0x0e1030);
    const top = new THREE.Color(p.sky).lerp(dark, n * 0.55);
    const hor = new THREE.Color(p.horizon).lerp(new THREE.Color(0x7a3a5a), n * 0.5);
    const fog = new THREE.Color(p.fog).lerp(new THREE.Color(0x2e2240), n * 0.6);
    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).copy(top);
    (u.uHorizon.value as THREE.Color).copy(hor);
    (u.uBottom.value as THREE.Color).copy(fog);
    (u.uSunCol.value as THREE.Color).setHex(p.sun).multiplyScalar(1 - n * 0.5);
    const scn = this.world.scene;
    (scn.fog as THREE.Fog).color.copy(fog);
    (scn.background as THREE.Color).copy(fog);
    this.hemi.color.setHex(p.hemi).multiplyScalar(1 - n * 0.35);
    this.hemi.groundColor.setHex(p.ground);
    this.hemi.intensity = 1.2 - n * 0.3;
    if (this.world.sun) { this.world.sun.color.setHex(p.sun); this.world.sun.intensity = 3.0 * (1 - n * 0.45); }
  }

  // ------------------------------------------------------------------ the camera

  private camera(sim: Sim, dt: number): void {
    const cam = this.world.camera;
    const st = sim.state;
    const c = sim.course;
    // a steady height to follow: the ground the courier runs on, not each hop
    const grounded = sim.grounded || st === 'vault' || st === 'mantle' || st === 'rescue';
    if (grounded) this.refY = this.snap ? sim.y : lerp(this.refY, sim.y, Math.min(1, dt * (st === 'climb' ? 6 : 5)));
    else if (st === 'fall' || st === 'slam') { /* hold: watch the fall */ }
    else this.refY = lerp(this.refY, Math.min(this.refY, sim.y) + Math.max(0, sim.y - this.refY) * 0.35, Math.min(1, dt * 3));
    if (this.snap) this.refY = sim.y;
    // longer airs pull the camera out a little
    const air = st === 'air' || st === 'zip' ? 1 : 0;
    this.airK = lerp(this.airK, air, Math.min(1, dt * (air ? 1.6 : 3)));
    const sp = clamp(sim.vs, 0, 18);
    const dist = (7.2 + sp * 0.12 + this.airK * 1.6) * this.camDist * (1 - this.punch * 0.12);
    const hgt = 4.5 + sp * 0.05 + this.airK * 1.0;
    let cs = sim.s - dist, cx = sim.x * 0.55, cy = this.refY + hgt;
    // climbing: back off and up so the face, the courier and the roof edge above all show
    if (st === 'climb' || st === 'mantle') { cs -= 2.5; cy = Math.max(cy, sim.y + 4.2); }
    // carried up by the shield bubble: back and above, the roof it lands on in view
    if (st === 'rescue') { cs -= 2; cy = Math.max(cy, sim.y + 4); }
    // dropping into an alley: out over the gap (never behind the wall it fell past), looking down
    const al = this.debugCam ? null : this.alley(sim);
    this.inAlley = !!al;
    this.alleyK = lerp(this.alleyK, al ? 1 : 0, Math.min(1, dt * (al ? 8 : 3)));
    const falling = !!al;
    if (al) {
      cs = clamp(sim.s - 1.6, al.s0 + 0.3, Math.max(al.s0 + 0.3, al.s1 - 0.7));
      cx = sim.x;
      // it follows the courier down for a moment (into the alley, between the walls), then holds
      if (st !== 'fall' || sim.stateT < 0.6 || !this.alleyHold) this.alleyHold = Math.min(al.y + 4.6, Math.max(al.y - 4, sim.y + 6.5));
      cy = this.alleyHold;
    } else { cy = this.clear(sim, cs, cx, cy); this.alleyHold = 0; }
    // nothing round the lens, nothing in the lower part of the picture, a clear line of sight
    // looking ahead over the next gap and its landing
    const ahead = 10 + sp * 0.35;
    const ls = sim.s + ahead;
    const nb = c.nextBlock(sim.s);
    let ly = this.refY + 0.1;
    if (nb && nb.s0 < ls + 4) ly = lerp(ly, Math.min(this.refY, nb.y) + 0.1, 0.4);
    if (falling) ly = Math.max(sim.y + 0.4, FLOOR + 1);
    const lx = falling ? sim.x : sim.x * 0.4;
    if (this.debugCam) {
      const a = this.debugCam.yaw;
      cs = sim.s - Math.cos(a) * this.debugCam.dist;
      cx = sim.x + Math.sin(a) * this.debugCam.dist;
      cy = sim.y + this.debugCam.h;
    }
    this.v.set(cx, cy, -cs);
    if (this.snap || this.debugCam) this.camPos.copy(this.v);
    else {
      // fast along the run (no lag at speed), softer up and down; quick out over an alley
      const q = this.alleyK;
      this.camPos.x = lerp(this.camPos.x, this.v.x, Math.min(1, dt * (5 + q * 5)));
      this.camPos.y = lerp(this.camPos.y, this.v.y, Math.min(1, dt * (this.v.y > this.camPos.y ? 6 + q * 6 : 3.5)));
      this.camPos.z = lerp(this.camPos.z, this.v.z, Math.min(1, dt * (9 + q * 5)));
    }
    this.v.set(lx, ly, falling ? -sim.s - 0.8 : -ls);
    if (this.debugCam) this.v.set(sim.x, sim.y + 0.9, -sim.s);
    if (this.snap || this.debugCam) this.camLook.copy(this.v);
    else this.camLook.lerp(this.v, Math.min(1, dt * (7 + this.alleyK * 7)));
    this.snap = false;
    cam.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmp * Math.max(0, Math.min(1, this.shakeT * 5));
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k * 0.7;
      cam.position.z += (Math.random() - 0.5) * k * 0.5;
    }
    cam.lookAt(this.camLook);
    if (this.menuShift && !cam.view) cam.setViewOffset(1000 * cam.aspect, 1000, 0, 1000 * this.menuShift, 1000 * cam.aspect, 1000);
    this.punch = Math.max(0, this.punch - dt * 1.6);
    const fov = FOV - this.punch * 6 + Math.min(7, Math.max(0, sp - 9) * 0.8) + this.airK * 3 + (sim.rush ? 4 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 4)); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.camQ.copy(cam.quaternion);
  }

  /** The lowest camera height at (cs, cx) that keeps walls, chimneys and scaffolding out of the view. */
  private clear(sim: Sim, cs: number, cx: number, cy: number): number {
    const c = sim.course;
    // round the lens
    let near = 0;
    for (const r of [0, 1.2, 2.4]) for (let i = 0; i < (r ? 8 : 1); i++) {
      const a = i * Math.PI / 4;
      near = Math.max(near, c.heightAt(cs + Math.cos(a) * r, cx + Math.sin(a) * r, !this.legacyCam));
    }
    cy = Math.max(cy, near + 1.7);
    // nothing filling the bottom of the picture just ahead of the lens
    const dl = sim.s - cs;
    for (let d = 0.6; d < Math.min(6.6, dl - 1.2); d += 0.6) {
      for (const side of [-0.45, 0, 0.45]) {
        const h = c.heightAt(cs + d, cx + side * d, !this.legacyCam);
        if (h > sim.y + 0.4) cy = Math.max(cy, h + 0.5 + d * 0.85);
      }
    }
    // the line of sight to the courier's head
    const hy = sim.y + 1.4;
    for (const k of LOS) {
      const s = sim.s + (cs - sim.s) * k, x = sim.x + (cx - sim.x) * k;
      const h = c.heightAt(s, x, !this.legacyCam);
      const lineY = hy + (cy - hy) * k;
      if (h + 0.35 > lineY) cy = Math.max(cy, Math.min(hy + 14, hy + (h + 0.35 - hy) / k));
    }
    return cy;
  }

  // ------------------------------------------------------------------ effects

  private effects(sim: Sim, dt: number, sdt: number): void {
    const from = sim.s - 12, to = sim.s + 150;
    this.halo.begin(this.camQ);
    this.pickups.update(sdt, sim.course, from, to, sim.power.double > 0);
    this.pigeons.update(sdt, sim.course, from, to);
    this.drop.update(dt, sim.parcel);
    // the drop point's glow on the roof
    const p = sim.parcel;
    if (p) this.halo.add(p.x, p.y + 0.6, -p.s, 3.2 + Math.sin(this.t * 4) * 0.3, 3.2 + Math.sin(this.t * 4) * 0.3, 0, 0xffc040, 0.8);
    // Rush: the courier glows
    if (sim.rush) {
      const ch = this.runner.chest;
      this.halo.add(ch.x, ch.y, ch.z, 2.4, 2.4, 0, 0x7fe0ff, 0.5 + 0.2 * Math.sin(this.t * 14));
      if (Math.random() < sdt * 40) this.glows.emit(sim.x + (Math.random() - 0.5) * 0.6, sim.y + Math.random() * 1.6, -sim.s + 0.3, 0, 0.3, 2, 0.4, 0.25, 0.02, Math.random() < 0.5 ? 0x7fe0ff : 0xffffff, 1);
    }
    this.powerFx(sim, dt, sdt);
    this.halo.end();
    // street lamps come on as night falls
    const on = clamp((this.night - 0.28) / 0.25, 0, 1);
    this.lampGlow.begin(this.camQ);
    if (on > 0) for (const l of this.city.lamps()) {
      if (-l.z < from || -l.z > sim.s + 90) continue;
      const fl = 0.85 + 0.15 * Math.sin(this.t * 3 + l.x * 7);
      // lights hanging between the camera and the courier stay dim (they would blind the view)
      const camS = -this.world.camera.position.z;
      const near = -l.z > camS - 1 && -l.z < sim.s + 2 && l.y > sim.y + 2.5 ? 0.15 : 1;
      this.lampGlow.add(l.x, l.y, l.z, 2.6, 2.6, 0, 0xffb860, on * fl * near);
      this.lampGlow.add(l.x, l.y, l.z, 0.7, 0.7, 0, 0xffffff, on * near);
    }
    this.lampGlow.end();
    // factory smokestacks smoke
    if (Math.random() < sdt * 6) for (const st of this.city.stacks()) {
      if (-st.z < from || -st.z > to || Math.random() > 0.5) continue;
      this.dust.emit(st.x + (Math.random() - 0.5), st.y + 1, st.z, 0.6 + Math.random() * 0.4, 1.8, 0, 3.2, 1.5, 5, 0x6a5a66, 0.3);
    }
    // running dust and footfalls
    if (sim.state === 'run' && sim.vs > 6 && Math.random() < sdt * 8) this.dust.emit(sim.x + (Math.random() - 0.5) * 0.5, sim.y + 0.1, -sim.s + 0.3, 0, 0.3, 0.6, 0.45, 0.25, 0.6, 0xcbb8a8, 2);
    if (sim.state === 'slide' && Math.random() < sdt * 40) this.dust.emit(sim.x + (Math.random() - 0.5) * 0.6, sim.y + 0.08, -sim.s + 0.4, (Math.random() - 0.5), 0.6, 1.5, 0.4, 0.25, 0.7, 0xd8c8b8, 2);
    if (sim.state === 'zip' && Math.random() < sdt * 30) {
      const cy = sim.zip ? sim.course.cableY(sim.zip, sim.s) : sim.y + 2;
      this.glows.emit(sim.x, cy, -sim.s + 0.1, (Math.random() - 0.5) * 2, Math.random(), 2 + Math.random() * 2, 0.3, 0.12, 0.02, Math.random() < 0.5 ? 0xffd27a : 0xffffff, 0, 9, 0.04);
    }
    // rings
    this.rings.begin(this.camQ);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.max) { this.flashes.splice(i, 1); continue; }
      const k = f.t / f.max;
      // a negative size sweeps inwards (the magnet's pull)
      const sz = f.s < 0 ? -f.s * (1 - k * 0.85) : f.s * (0.3 + k);
      this.rings.add(f.x, f.y, f.z, sz, sz, 0, f.c, f.s < 0 ? 0.5 * Math.sin(Math.PI * k) : 1 - k);
    }
    this.rings.end();
    this.glows.update(sdt, this.camQ, this.world.camera.position);
    this.dust.update(sdt, this.camQ, this.world.camera.position);
    this.paper.update(sdt, this.camQ, this.world.camera.position);
    this.warmUp();
  }

  /** The power-ups on the courier (drawn into the halo pass; the rings come later). */
  private powerFx(sim: Sim, dt: number, sdt: number): void {
    const ch = this.runner.chest, P = sim.power, a = this.alpha;
    // the shield bubble round the courier (bigger while it carries the courier back up)
    this.bubbles.begin(this.camQ);
    if ((P.shield > 0 || sim.state === 'rescue') && a > 0.05) {
      const big = sim.state === 'rescue' ? 1.25 : 1;
      const r = (2.5 + Math.sin(this.t * 3) * 0.08) * big;
      this.bubbles.add(ch.x, ch.y - 0.1, ch.z, r, r * 1.08, Math.sin(this.t * 0.7) * 0.3, 0xffffff, 0.85 * a);
      this.halo.add(ch.x, ch.y, ch.z, r * 1.1, r * 1.1, 0, 0x7fe0ff, 0.22 * a);
    }
    this.bubbles.end();
    if (a < 0.05) { this.ribbon.update(sdt, false, this.v.copy(ch)); return; }
    // the magnet: a red glow on the satchel and its pull rings sweeping in
    if (P.magnet > 0) {
      this.halo.add(ch.x, ch.y, ch.z + 0.25, 1.1, 1.1, 0, 0xff5a5a, 0.45 + 0.2 * Math.sin(this.t * 10));
      this.magT += sdt;
      if (this.magT > 0.32) { this.magT = 0; this.flashes.push({ x: sim.x, y: sim.y + 0.06, z: -sim.s, s: -sim.magnetR * 2, t: 0, max: 0.55, c: 0xff6a6a }); }
    }
    // double stamps: golden sparkles round the courier
    if (P.double > 0 && Math.random() < sdt * 26) {
      const ang = Math.random() * Math.PI * 2;
      this.glows.emit(ch.x + Math.cos(ang) * 0.6, ch.y + (Math.random() - 0.4) * 1.2, ch.z + Math.sin(ang) * 0.6, 0, 0.8, 0, 0.5, 0.22, 0.02, Math.random() < 0.6 ? 0xffd23f : 0xfff1a0, 0.5);
    }
    // the watch: slow blue ripples on the roof
    if (P.watch > 0) {
      this.halo.add(ch.x, ch.y, ch.z, 2.2, 2.2, 0, 0x9fb4ff, 0.18);
      this.watchT += dt;
      if (this.watchT > 0.7) { this.watchT = 0; this.ring(sim.x, sim.y, -sim.s, 5, 0x9fb4ff, 1.1); }
    }
    // the glider: wing-tip trails in the air
    if (P.glide > 0 && sim.state === 'air' && Math.random() < sdt * 30) {
      for (const side of [-1, 1]) this.glows.emit(ch.x + side * 0.9, ch.y + 0.2, ch.z + 0.3, 0, 0, 1.5, 0.35, 0.12, 0.02, 0xffffff, 0);
    }
    // the express ribbon streams from the satchel
    this.ribbon.update(sdt, P.express > 0, this.v.set(ch.x, ch.y + 0.05, ch.z + 0.32));
    void POWER_COLOR;
  }
  private magT = 0;
  private watchT = 0;

  ring(x: number, y: number, z: number, s: number, c: number, max = 0.45): void {
    this.flashes.push({ x, y: y + 0.05, z, s, t: 0, max, c });
  }

  /** Visuals for a simulation event (the Play scene adds sound and HUD). */
  handle(ev: SimEvent, sim: Sim): void {
    const x = sim.x, y = sim.y, z = -sim.s;
    switch (ev.type) {
      case 'jump':
        this.dust.burst(x, y + 0.1, z, 6, 1.6, [0xd8ccc0], 0.45, 0.45, { up: 0.5 });
        if (ev.spring) this.glows.burst(x, y + 0.3, z, 18, 4, [0xffd23f, 0xffffff], 0.5, 0.3);
        break;
      case 'land': {
        const big = ev.drop > 3;
        this.dust.burst(x, y + 0.08, z, big ? 18 : 8, big ? 3.4 : 2, [0xd6c8ba, 0xbfb2a6], 0.6, big ? 0.75 : 0.5, { up: 0.5 });
        if (ev.roll === 'perfect') { this.ring(x, y, z, 3.4, 0x7dffa0, 0.4); this.glows.burst(x, y + 0.4, z, 16, 4, [0x7dffa0, 0xffffff], 0.5, 0.3); }
        else if (big) this.ring(x, y, z, 3, 0xffffff, 0.35);
        if (ev.hard && !ev.roll) this.shake(0.22, 0.25);
        else if (big) this.shake(0.1, 0.18);
        break;
      }
      case 'vault': this.dust.burst(x, ev.box.y1, z - 0.4, 8, 1.6, [0xd0c4b8], 0.4, 0.4, { up: 0.3 }); break;
      case 'bounce':
        this.glows.burst(x, y + 0.2, z, 22, 5, [0xffd23f, 0xff7a5a, 0xffffff], 0.5, 0.35, { up: 2 });
        this.ring(x, y + 0.1, z, 3, 0xffd23f, 0.35);
        this.shake(0.12, 0.2);
        break;
      case 'stumble':
        this.dust.burst(x, y + 0.6, z - 0.4, ev.smash ? 22 : 12, ev.smash ? 5 : 2.6, ev.smash ? [0x7fe0ff, 0xffffff, 0xd0c4b8] : [0xd0c4b8, 0xa89a8e], 0.6, 0.55, { up: 1 });
        this.shake(ev.smash ? 0.18 : 0.28, 0.28);
        break;
      case 'mantle': case 'climbTop': this.dust.burst(x, y + 1.6, z - 0.4, 6, 1.2, [0xd0c4b8], 0.4, 0.3); break;
      case 'zip': this.glows.burst(x, y + 2.2, z, 14, 3, [0xffd27a, 0xffffff], 0.35, 0.18, { grav: 9 }); break;
      case 'slam': this.shake(0.3, 0.3); break;
      case 'pickup': {
        const p = ev.p;
        const col = p.kind === 'stamp' ? (ev.value > 1 ? [0xffd23f, 0xffffff, 0xfff1a0] : [0xffa64a, 0xffffff, 0xff6a3d]) : p.kind === 'bottle' ? [0x7fe6ff, 0xffffff] : isPower(p.kind) ? [POWER_COLOR[p.kind], 0xffffff] : [0xffd23f, 0xffffff];
        this.glows.burst(p.x, p.y, -p.s, p.kind === 'stamp' ? 8 : isPower(p.kind) ? 36 : 26, p.kind === 'stamp' ? 2.5 : 5.5, col, 0.4, 0.25);
        if (p.kind !== 'stamp') this.ring(p.x, p.y, -p.s, isPower(p.kind) ? 3.4 : 2.4, col[0], 0.45);
        break;
      }
      case 'power': {
        const c = POWER_COLOR[ev.kind];
        this.glows.burst(x, y + 1, z, 30, 4.5, [c, 0xffffff], 0.6, 0.35, { up: 1.5 });
        this.ring(x, y + 0.05, z, 4, c, 0.5);
        this.zoomPunch(0.45);
        break;
      }
      case 'powerEnd': this.dust.burst(x, y + 1.1, z, 6, 1.2, [POWER_COLOR[ev.kind], 0xffffff], 0.4, 0.3); break;
      case 'shieldPop': {
        // the bubble bursts: droplets and a bright ring
        const ch = this.runner.chest;
        this.glows.burst(ch.x, ch.y, ch.z, 40, 7, [0x7fe0ff, 0xffffff, 0xbff0ff], 0.6, 0.3, { up: 1 });
        this.ring(ch.x, ch.y - 0.6, ch.z, 5, 0x7fe0ff, 0.5);
        this.shake(0.16, 0.22);
        this.zoomPunch(0.6);
        break;
      }
      case 'rescued':
        this.dust.burst(x, y + 0.08, z, 12, 2.4, [0xd6c8ba, 0xbfb2a6], 0.6, 0.5, { up: 0.5 });
        this.ring(x, y, z, 3.4, 0x7fe0ff, 0.4);
        break;
      case 'pigeons': {
        const f = ev.f;
        this.pigeons.startle(f);
        this.dust.burst(f.x, f.y + 0.3, -f.s, 10, 2.5, [0xd8dce4, 0xb8bcc8], 0.8, 0.22, { up: 1.5 });
        break;
      }
      case 'gold':
        this.glows.burst(ev.f.x, ev.f.y + 0.4, -ev.f.s, 40, 6, [0xffd23f, 0xfff1a0, 0xffffff], 0.8, 0.4, { up: 2 });
        this.ring(ev.f.x, ev.f.y, -ev.f.s, 4, 0xffd23f, 0.5);
        break;
      case 'deliver': {
        const p = sim.parcel;
        void p;
        this.drop.pop();
        // paper scraps flutter up
        for (let i = 0; i < 26; i++) this.paper.emit(x + (Math.random() - 0.5) * 0.8, y + 1.2, z, (Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4, 1.4 + Math.random(), 0.3, 0.2, [0xffffff, 0xfff2d0, 0xffd8a0][i % 3], 1.6, 6);
        this.glows.burst(x, y + 1, z, 30, 5, [0xffc040, 0xffffff, 0x7dffa0], 0.6, 0.35, { up: 2 });
        this.ring(x, y, z, 4.5, 0xffc040, 0.5);
        this.runner.wave();
        break;
      }
      case 'rush': this.glows.burst(x, y + 1, z, 40, 7, [0x7fe0ff, 0xffffff, 0xb070ff], 0.7, 0.45, { up: 1 }); this.zoomPunch(1); break;
      case 'falling': this.shake(0.2, 0.3); this.poofed = false; break;
      case 'respawn':
        this.snap = true;
        this.fadeIn = 0;
        this.poofed = false;
        this.glows.burst(x, y + 1, z, 24, 4, [0x7dffa0, 0xffffff], 0.6, 0.35);
        this.ring(x, y + 0.05, z, 3.4, 0x7dffa0, 0.5);
        break;
      default: break;
    }
  }

  /** Projects a world point to game pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    return this.world.toScreen(this.v.set(x, y, z));
  }

  /** The courier's satchel and cap colours. */
  setLook(look: Look): void { this.runner.setLook(look); }

  reset(): void {
    this.glows.clear(); this.dust.clear(); this.paper.clear();
    this.flashes.length = 0;
    this.snap = true;
  }

  /**
   * Test hook: how much of the courier the camera sees. Rays from the lens to the head, chest and
   * hips; a point is hidden when city geometry (not a faded overhead piece) sits in front of it.
   * Returns how many of the three points are hidden.
   */
  hiddenPoints(sim: Sim): number {
    const cam = this.world.camera.position;
    const targets: THREE.Object3D[] = [];
    this.city.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.thin && !((m.material as THREE.Material).transparent && (m.material as THREE.Material).opacity < 0.5)) targets.push(m);
    });
    let hidden = 0;
    const rc = new THREE.Raycaster();
    for (const dy of [1.75, 1.15, 0.6]) {
      const p = new THREE.Vector3(sim.x, sim.y + (sim.state === 'slide' || sim.state === 'roll' ? dy * 0.45 : dy), -sim.s);
      const dir = p.clone().sub(cam);
      const d = dir.length();
      rc.set(cam, dir.normalize());
      rc.far = d - 0.35;
      if (rc.intersectObjects(targets, false).length) hidden++;
    }
    return hidden;
  }

  /** Draw calls of the last frame (perf hook). */
  get calls(): number { return this.world.renderer.info.render.calls; }
}

function paperTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(6, 9, 20, 14);
  g.fillStyle = 'rgba(120,110,100,0.5)';
  g.fillRect(9, 13, 14, 2); g.fillRect(9, 17, 10, 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ shader warm-up

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive (a World3D frees its materials on
 * shutdown, which drops their programs): compiles a twin of every material and object kind into a
 * keeper scene that is never freed, so the Play scene's first frame finds them ready. Materials
 * with a custom shader say how to make their twin (userData.twin); the others are cloned.
 */
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  const seen = new Set<string>();
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh;
      const skinned = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const kind = skinned ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const a = mat as THREE.MeshLambertMaterial & THREE.MeshBasicMaterial;
      const key = kind + ':' + mat.type + ':' + (mat.customProgramCacheKey?.() ?? '') + JSON.stringify([!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, a.alphaTest, !!a.emissive && a.emissive.getHex() > 0, m.receiveShadow, m.castShadow]);
      if (seen.has(key)) continue;
      seen.add(key);
      const twin = mat.userData.twin as (() => THREE.Material) | undefined;
      const c = twin ? twin() : mat.clone();
      let k: THREE.Object3D;
      if (skinned) {
        const src = model(playerCharacter3d(), { shadows: true });
        src.traverse((q) => { const qm = q as THREE.Mesh; if (qm.isMesh) qm.material = c; });
        k = src;
      } else if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      k.castShadow = m.castShadow;
      k.receiveShadow = m.receiveShadow;
      s.add(k);
      // the kit materials also fade (overhead pieces, awnings and bridges during a fall): their
      // see-through variant is a program of its own
      if (twin && kind === 'mesh' && !mat.transparent) {
        const ct = twin();
        ct.transparent = true; ct.depthWrite = false; ct.opacity = 0.5;
        const kt = new THREE.Mesh(m.geometry, ct);
        kt.castShadow = m.castShadow; kt.receiveShadow = m.receiveShadow;
        s.add(kt);
      }
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}
