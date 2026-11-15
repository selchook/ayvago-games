// Skull Isle: draws a sea leg (voyage.ts) inside the island view's world. The crew's ship is the
// island view's own ship mesh, sailing; the sea's foes are instanced Kenney and Quaternius models
// (sloops, the ghost ship, rowboats with a rigged skeleton aboard) and pooled rigged figures
// (tentacles, sharks); rocks, floating loot and cannonballs are instanced; the wakes are foam ribbons
// riding the swell (fx3d Wakes), health bars the view's instanced bars; aim marks, rain ripples and
// the island on the horizon are billboards. Everything is built hidden with the view, so the menu
// compiles its shader programs and the first voyage compiles nothing.
import { THREE } from '@core/three';
import type { Sim } from './sim';
import type { Voyage, SeaFoe } from './voyage';
import { SEA, SEA_POWER_COLOR, type SeaKind } from './defs';
import { pk, kk, soloGeometry } from './kit';
import { Billboards, Particles, TEX, type Wakes } from './fx3d';
import { PORTS, portAt } from './voyage';
import { Figure, FigurePool } from './figure';

const TENTACLE_H = 15.67;

export interface SeaKit {
  scene: THREE.Scene;
  pirateMat: THREE.Material;
  kenneyMat: THREE.Material;
  pools: Record<string, FigurePool>;
  particles: Particles;
  dust: Particles;
  shadows: Billboards;
  glows: Billboards;
  flares: Billboards;
  rings: Billboards;
  streaks: Billboards;
  wakes: Wakes;
  /** The water's surface at (x, z) this frame (flat foam and rings ride it). */
  surf: (x: number, z: number) => number;
  /** A foe's health bar (the view keeps its state between frames). */
  bar: (key: string, hp: number, max: number, dead: boolean, x: number, y: number, z: number, w: number, h: number, color: number, dt: number) => void;
}

interface FoeFig { fig: Figure; pool: FigurePool; state: string; seen: boolean }

export class SeaView {
  private sloops: THREE.InstancedMesh;
  private ghosts: THREE.InstancedMesh;
  private boats: THREE.InstancedMesh;
  private rocks: THREE.InstancedMesh[];
  private barrels: THREE.InstancedMesh;
  private crates: THREE.InstancedMesh;
  private bottles: THREE.InstancedMesh;
  private chests: THREE.InstancedMesh;
  private balls: THREE.InstancedMesh;
  private skulls: THREE.InstancedMesh;
  private horizon: Billboards;
  private figs = new Map<number, FoeFig>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private rainSeed: { x: number; y: number; z: number }[] = [];
  private ripples: { x: number; z: number; t: number }[] = [];
  private sprayT = 0;
  private smokeT = 0;

  constructor(private k: SeaKit) {
    const sc = k.scene;
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadow = false) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.count = 0;
      im.visible = false;
      sc.add(im);
      return im;
    };
    // the Kenney ships stand with their keel at y = 0 and the bow to +z
    this.sloops = inst(soloGeometry(kk('ship-pirate-small'), 'uv', 0.62), k.kenneyMat, 4, true);
    this.ghosts = inst(soloGeometry(kk('ship-ghost'), 'uv', 0.82), k.kenneyMat, 1, true);
    this.boats = inst(soloGeometry(pk('ship-small'), 'color', 0.78), k.pirateMat, 10, true);
    this.rocks = ['rocks-a', 'rocks-b', 'rocks-c'].map((m) => inst(soloGeometry(kk(m), 'uv', 1), k.kenneyMat, 14, true));
    this.barrels = inst(soloGeometry(pk('barrel'), 'color', 0.75), k.pirateMat, 16, true);
    this.crates = inst(soloGeometry(kk('crate'), 'uv', 0.8), k.kenneyMat, 8, true);
    this.bottles = inst(soloGeometry(kk('bottle-large'), 'uv', 1.15), k.kenneyMat, 8, true);
    this.chests = inst(soloGeometry(pk('chest-closed'), 'color', 0.9), k.pirateMat, 3, true);
    this.balls = inst(soloGeometry(kk('cannon-ball'), 'uv', 0.55), k.kenneyMat, 30, true);
    this.skulls = inst(soloGeometry(pk('skull'), 'color', 1), k.pirateMat, 12);
    this.horizon = new Billboards(sc, TEX.isle(), 2, { blend: 'normal', order: -2 });
    for (let i = 0; i < 110; i++) this.rainSeed.push({ x: Math.random(), y: Math.random(), z: Math.random() });
  }

  /** Frees the figures back to their pools (a new island, a new leg). */
  clear(): void {
    for (const f of this.figs.values()) f.pool.give(f.fig);
    this.figs.clear();
    for (const im of [this.sloops, this.ghosts, this.boats, ...this.rocks, this.barrels, this.crates, this.bottles, this.chests, this.balls, this.skulls]) { im.count = 0; im.visible = false; }
    this.ripples.length = 0;
    this.horizon.begin(new THREE.Quaternion()); this.horizon.end();
  }

  /**
   * Places the crew's ship (the island view's mesh) on the sea: it rides the swell (bow and stern
   * following the waves), heels into its turns, kicks back from its own guns (`kick`: a roll away
   * from the side that fired) and lifts its bow a little under full sail.
   */
  placeShip(ship: THREE.Object3D, v: Voyage, t: number, swell: number, sinkK: number, kick = 0): void {
    const s = v.ship, k = this.k;
    const fx = Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const mid = k.surf(s.x, s.z), bow = k.surf(s.x + fx * 3, s.z + fz * 3), stern = k.surf(s.x - fx * 3, s.z - fz * 3);
    const port = k.surf(s.x - fz * 1.6, s.z + fx * 1.6), star = k.surf(s.x + fz * 1.6, s.z - fx * 1.6);
    ship.scale.setScalar(SHIP_SCALE);
    ship.position.set(s.x, SHIP_Y + (mid + 0.17) * 0.9 + Math.sin(t * 1.3) * 0.04 * swell - sinkK * 6, s.z);
    // the model's bow points to −x: turned a quarter so it sails north (−z), then off by the heading;
    // roll round the keel (x), pitch round the beam (z)
    const roll = s.roll + Math.atan2(star - port, 3.2) * 0.8 + Math.sin(t * 0.9) * 0.02 * swell + kick + sinkK * 0.5;
    const pitch = Math.atan2(bow - stern, 6) * 0.9 + (s.sail - 2) * 0.012 - sinkK * 0.35;
    ship.rotation.set(roll, -Math.PI / 2 - s.yaw, -pitch, 'YXZ');
    ship.updateMatrixWorld();
  }

  /** One frame of the sea. */
  sync(sim: Sim, v: Voyage, dt: number, t: number, cq: THREE.Quaternion, swell: number, ship: THREE.Object3D): void {
    const k = this.k;
    const s = v.ship;
    this.horizon.begin(cq);

    // the island on the horizon until the real one comes out of the fog
    const far = s.z - 0;
    const hk = THREE.MathUtils.smoothstep(far, 95, 150);
    if (hk > 0.01) {
      const fog = (k.scene.fog as THREE.Fog).color;
      this.col.copy(fog).multiplyScalar(0.72);
      this.horizon.add(0, 6, s.z - 150, 70, 26, 0, this.col, hk);
    }

    // the wake: a bow wave spreading into a V and the churned water astern, foam ribbons that stay
    // where they were laid and ride the swell; spray off the bow when the sails drive her hard
    const moving = !s.sunk && s.speed > 0.4;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const drive = Math.min(1.4, s.speed / Math.max(1, sim.shipSt.speed));
    if (moving) {
      k.wakes.lay('bow', s.x + sy * 3.1, s.z - cy * 3.1, sy, -cy, 0.55, 1.1 + drive * 1.5, 0.35 + drive * 0.4, 2.8, 0);
      k.wakes.lay('stern', s.x - sy * 3.1, s.z + cy * 3.1, sy, -cy, 0.5, 0.42, 0.45 + drive * 0.35, 3.4, 0.95);
    }
    this.sprayT -= dt;
    if (moving && s.sail >= 2 && this.sprayT <= 0) {
      this.sprayT = s.sail === 3 ? 0.035 : 0.09;
      for (const side of [-1, 1]) {
        const bx = s.x + sy * 3.3 + cy * side * 0.45, bz = s.z - cy * 3.3 + sy * side * 0.45;
        const out = 1.2 + Math.random() * 1.6 * drive;
        k.dust.emit(bx, k.surf(bx, bz) + 0.15, bz, cy * side * out + sy * s.speed * 0.6, 1 + Math.random() * 1.6 * drive, sy * side * out - cy * s.speed * 0.6, 0.55, 0.45, 1.5 + drive, 0xf4fbff, 2.2, 5);
      }
    }
    const hullK = s.hull / Math.max(1, sim.shipSt.maxHull);
    this.smokeT -= dt;
    if ((hullK < 0.4 || s.sunk) && this.smokeT <= 0) {
      this.smokeT = s.sunk ? 0.04 : hullK < 0.2 ? 0.07 : 0.14;
      const at = ship.localToWorld(this.v.set(1.5, 3, (Math.random() - 0.5) * 2));
      k.dust.emit(at.x, at.y, at.z, (Math.random() - 0.5) * 0.6, 1.6, 0.8, 1.6, 0.8, 2.4, s.sunk ? 0x9aa6b0 : 0x5a5650, 0.6, -0.4);
      if (hullK < 0.2 && !s.sunk) k.particles.emit(at.x, at.y - 0.6, at.z, 0, 1.4, 0, 0.5, 0.6, 0.1, 0xff8a2a, 1.5, -1);
    }
    if (s.sunk && Math.random() < dt * 30) k.particles.emit(s.x + (Math.random() - 0.5) * 6, -0.1, s.z + (Math.random() - 0.5) * 8, 0, 1.5 + Math.random() * 2, 0, 0.7, 0.35, 0.1, 0xdff8ff, 1, 4);

    // powers on the ship
    if (v.powers.wind > 0 && Math.random() < dt * 20) {
      const x = s.x + (Math.random() - 0.5) * 10, z = s.z - 6 - Math.random() * 8;
      k.streaks.add(x, 2 + Math.random() * 3, z, 0.12, 2.6, 0, SEA_POWER_COLOR.wind, 0.7);
      k.particles.emit(x, 2 + Math.random() * 3, z, 0, 0, 9, 0.5, 0.25, 0.05, SEA_POWER_COLOR.wind, 0.3, 0);
    }
    if (v.powers.mermaid > 0 && Math.random() < dt * 22) k.particles.emit(s.x + (Math.random() - 0.5) * 4, 0.4 + Math.random(), s.z + (Math.random() - 0.5) * 8, 0, 1.6, 0, 0.8, 0.4, 0.05, SEA_POWER_COLOR.mermaid, 1, -0.5);
    if (v.powers.mermaid > 0) k.rings.add(s.x, k.surf(s.x, s.z), s.z, 9, 9, 0, SEA_POWER_COLOR.mermaid, 0.35 + Math.sin(t * 5) * 0.1);
    if (v.powers.fire > 0 && Math.random() < dt * 10) for (const side of [-1, 1]) k.particles.emit(s.x + side * 1.8, 1.4, s.z + (Math.random() - 0.5) * 4, side * 0.5, 0.8, 0, 0.4, 0.45, 0.05, 0xff8a2a, 1, -1);

    // the net's reach when loot is near
    let near = false;
    for (const f of v.floats) if (v.hullDist(f.x, f.z) < sim.shipSt.net * 2.4) near = true;
    if (near) k.rings.add(s.x, k.surf(s.x, s.z), s.z, (sim.shipSt.net + 1.3) * 2.1, (sim.shipSt.net + 4.6) * 2, -s.yaw, 0xffe27a, 0.07);

    // the broadside's aim: a gold ring on the target and, when the guns are loaded, the arc the
    // balls will fly from the middle gun of that side
    if (v.aim && !s.sunk) {
      const ready = s.reload[v.aim.side] <= 0;
      const a = v.aim;
      const pulse = 0.65 + Math.sin(t * 10) * 0.25;
      k.rings.add(a.x, k.surf(a.x, a.z) + 0.02, a.z, 3.4, 3.4, 0, ready ? 0xffd23f : 0x9aa8b8, ready ? pulse : 0.35);
      if (ready) {
        k.flares.add(a.x, 1.6, a.z, 1.4, 1.4, t * 2, 0xffe27a, 0.6);
        const P = PORTS.crew;
        const po = portAt(s.x, s.z, s.yaw, P.along[1], a.side ? 1 : -1, P.out);
        const dist = Math.hypot(a.x - po.x, a.z - po.z), h = 1.3 + dist * 0.1;
        for (let i = 1; i < 9; i++) {
          const u = i / 9;
          k.glows.add(po.x + (a.x - po.x) * u, P.y + (-0.15 - P.y) * u + 4 * h * u * (1 - u), po.z + (a.z - po.z) * u, 0.42, 0.42, 0, 0xffd23f, 0.32 + 0.2 * Math.sin(t * 8 - i));
        }
      }
    }
    // the reload of each side: a lantern glow at each rail
    for (const side of [0, 1] as const) {
      const ready = s.reload[side] <= 0;
      if (s.sunk) break;
      const sxv = side ? 1 : -1;
      k.glows.add(s.x + sxv * 1.9, 1.3, s.z + 0.5, ready ? 1.4 : 0.8, ready ? 1.4 : 0.8, 0, ready ? 0xffc23a : 0x6a7a8a, ready ? 0.55 : 0.3);
    }

    this.syncFoes(sim, v, dt, t, swell);
    this.syncThings(v, dt, t, swell, cq);
    this.syncRain(v, dt, t);
    this.horizon.end();
  }

  private syncFoes(sim: Sim, v: Voyage, dt: number, t: number, swell: number): void {
    const k = this.k;
    for (const f of this.figs.values()) f.seen = false;
    let sl = 0, gh = 0, bt = 0;
    for (const f of v.foes) {
      const dead = f.state === 'dead';
      const sinkY = dead ? -Math.max(0, f.deadT - 0.4) * 1.6 : 0;
      const tilt = dead ? Math.min(1, f.deadT * 0.8) * 0.5 : 0;
      switch (f.kind) {
        case 'sloop': case 'ghost': {
          const bob = Math.sin(t * 1.2 + f.id) * 0.1 * swell;
          this.e.set(Math.sin(t * 0.9 + f.id) * 0.03 * swell + tilt * 0.3, f.face, Math.sin(t * 0.8 + f.id) * 0.04 * swell + tilt, 'YXZ');
          this.q.setFromEuler(this.e);
          this.m.compose(this.v.set(f.x, (f.kind === 'ghost' ? -0.75 : -0.55) + bob + f.y + sinkY, f.z), this.q, this.s.set(1, 1, 1));
          if (f.kind === 'ghost') { if (gh < 1) this.ghosts.setMatrixAt(gh++, this.m); }
          else if (sl < 4) this.sloops.setMatrixAt(sl++, this.m);
          if (f.flash > 0.05) k.flares.add(f.x, 2, f.z, 3, 3, t * 3, 0xffffff, 0.6);
          if (f.burn > 0 && Math.random() < dt * 25) k.particles.emit(f.x + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, f.z + (Math.random() - 0.5) * 3, 0, 1.6, 0, 0.6, 0.6, 0.1, Math.random() < 0.5 ? 0xff8a2a : 0xffd23f, 1, -1);
          if (f.kind === 'ghost' && !dead) {
            k.glows.add(f.x, 3, f.z, 9, 9, 0, 0x5affb0, 0.16 + Math.sin(t * 3) * 0.05);
            if (Math.random() < dt * 12) k.particles.emit(f.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 4, f.z + (Math.random() - 0.5) * 6, 0, 0.8, 0, 1, 0.5, 0.1, 0x7affc0, 0.5, -0.3);
          }
          if (dead && Math.random() < dt * 20) k.dust.emit(f.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, f.z, 0, 1.4, 0, 1.2, 0.8, 2, 0x6a6460, 0.6, -0.4);
          // the ghost ship has the big boss bar; a sloop its own small one
          if (f.kind === 'sloop') k.bar('s' + f.id, f.hp, f.maxHp, dead, f.x, 6.2, f.z, 3.4, 0.55, 0xff4a3a, dt);
          // its wake (it sails with the crew's ship, so it churns as hard)
          if (!dead && f.y > -1) k.wakes.lay('s' + f.id, f.x - Math.sin(f.face) * 2.4, f.z - Math.cos(f.face) * 2.4, Math.sin(f.face), Math.cos(f.face), 0.5, 1, Math.min(1, 0.4 + Math.hypot(f.vx, f.vz) * 0.08), 2.6, 0.8);
          break;
        }
        case 'rowboat': {
          const bob = Math.sin(t * 2 + f.id) * 0.08 * swell;
          this.e.set(tilt, f.face + Math.PI / 2, Math.sin(t * 1.6 + f.id) * 0.06 * swell, 'YXZ');
          this.q.setFromEuler(this.e);
          const y = -0.3 + bob + f.y + sinkY;
          this.m.compose(this.v.set(f.x, y, f.z), this.q, this.s.set(1, 1, 1));
          if (bt < 10) this.boats.setMatrixAt(bt++, this.m);
          const ff = this.figFor(f, 'skeleton');
          ff.fig.root.position.set(f.x, y + 0.35, f.z);
          ff.fig.root.rotation.set(0, Math.PI, 0);
          ff.fig.root.visible = !(dead && f.deadT > 1.6);
          if (ff.state !== f.state) {
            ff.state = f.state;
            if (dead) ff.fig.play('Death', { once: true, restart: true, fade: 0.08 });
            else if (f.state === 'throw') ff.fig.play('Punch', { once: true, restart: true, speed: 1.1, fade: 0.06 });
            else ff.fig.play('Duck', { speed: 0.6, fade: 0.2, at: 0.3 });
          }
          if (f.flash > 0.08) ff.fig.flash();
          ff.fig.update(dt, 1);
          k.bar('s' + f.id, f.hp, f.maxHp, dead, f.x, 2.5, f.z, 2.5, 0.46, 0xff4a3a, dt);
          if (!dead) k.wakes.lay('s' + f.id, f.x - Math.sin(f.face) * 1.2, f.z - Math.cos(f.face) * 1.2, Math.sin(f.face), Math.cos(f.face), 0.3, 0.5, 0.55, 1.8, 0.5);
          break;
        }
        case 'tentacle': {
          const ff = this.figFor(f, 'tentacle');
          const fig = ff.fig;
          fig.root.scale.setScalar(f.len / TENTACLE_H);
          fig.root.rotation.order = 'YXZ';
          fig.root.position.set(f.bx, f.y - 0.3 + (dead ? -f.deadT * 5 : 0), f.bz);
          fig.root.rotation.set(dead ? Math.PI / 2 * Math.max(0, 1 - f.deadT) : f.pitch, f.yaw, 0);
          fig.setTint(0xd890ff);
          fig.play('Tentacle_Idle', { speed: f.state === 'wind' ? 3 : f.state === 'down' ? 0.4 : 1, fade: 0.3 });
          if (f.flash > 0.08) fig.flash();
          fig.update(dt, 1);
          if (!dead && f.y > -3) k.rings.add(f.bx, k.surf(f.bx, f.bz), f.bz, 3.2, 3.2, 0, 0xe8fbff, 0.4 + Math.sin(t * 3 + f.id) * 0.15);
          if (f.y > -4 || dead) {
            const flat = f.state === 'down' || f.state === 'slam' || f.state === 'lift';
            const u = flat ? f.len * 0.55 : 0.6;
            k.bar('s' + f.id, f.hp, f.maxHp, dead, f.bx + Math.sin(f.yaw) * u, flat ? 2.2 : Math.min(f.len * 0.55, 6.5) + f.y, f.bz + Math.cos(f.yaw) * u, 2.8, 0.5, 0xe05ad8, dt);
          }
          if (f.burn > 0 && Math.random() < dt * 20) { const c = v.aimPoint(f); k.particles.emit(c.x, 1, c.z, 0, 1.4, 0, 0.5, 0.5, 0.1, 0xff8a2a, 1, -1); }
          break;
        }
        case 'shark': {
          const ff = this.figFor(f, 'shark');
          const fig = ff.fig;
          // the fin cuts the surface while it circles; out of the water on the lunge, nose up then down; a dive
          const swim = f.state === 'circle';
          const y = swim ? -0.68 + Math.sin(t * 2.2 + f.id) * 0.04 : f.y;
          const pitch = f.state === 'lunge' ? -Math.cos(Math.min(1, f.t / 0.7) * Math.PI) * 0.55 : f.state === 'dive' ? 0.4 : f.state === 'wind' ? -0.12 : 0;
          fig.root.position.set(f.x, y, f.z);
          fig.root.rotation.order = 'YXZ';
          fig.root.rotation.set(pitch, f.face, dead ? Math.PI : swim ? Math.sin(t * 1.7 + f.id) * 0.08 : 0);
          if (dead) fig.root.position.y = -0.3 - f.deadT * 0.6;
          if ((swim || f.state === 'dive') && f.y < -0.3) k.wakes.lay('s' + f.id, f.x - Math.sin(f.face) * 0.45, f.z - Math.cos(f.face) * 0.45, Math.sin(f.face), Math.cos(f.face), 0.14, 0.6, 0.85, 1.5, 0.35);
          k.bar('s' + f.id, f.hp, f.maxHp, dead, f.x, Math.max(y, -0.4) + 1.5, f.z, 2.2, 0.42, 0xff6a3a, dt);
          if (ff.state !== f.state) {
            ff.state = f.state;
            if (f.state === 'lunge') fig.play('Swim_Bite', { once: true, restart: true, speed: 1.3 });
            else if (f.state === 'wind') fig.play('Swim_Fast', { speed: 1.4 });
            else fig.play('Swim', { speed: 1 });
          }
          if (f.flash > 0.08) fig.flash();
          fig.update(dt, 1);
          if (f.state === 'wind' && Math.random() < dt * 12) k.particles.emit(f.x + (Math.random() - 0.5) * 1.4, -0.1, f.z + (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.5, 0.3, 0.1, 0xeefbff, 0.8, 12);
          break;
        }
      }
    }
    this.finish(this.sloops, sl);
    this.finish(this.ghosts, gh);
    this.finish(this.boats, bt);
    for (const [id, ff] of this.figs) {
      if (ff.seen) continue;
      ff.pool.give(ff.fig);
      this.figs.delete(id);
    }
  }

  private figFor(f: SeaFoe, pool: string): FoeFig {
    let ff = this.figs.get(f.id);
    if (!ff) {
      const p = this.k.pools[pool];
      const fig = p.take();
      fig.root.visible = true;
      fig.root.scale.setScalar(pool === 'skeleton' ? 0.85 : 1);
      ff = { fig, pool: p, state: '', seen: true };
      this.figs.set(f.id, ff);
    }
    ff.seen = true;
    return ff;
  }

  private syncThings(v: Voyage, dt: number, t: number, swell: number, cq: THREE.Quaternion): void {
    const k = this.k, s = v.ship;
    const spy = v.powers.spyglass > 0;
    void cq;
    // rocks, with foam round them (and a warning ring under the spyglass)
    const rc = [0, 0, 0];
    for (const r of v.rocks) {
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), r.rot);
      this.m.compose(this.v.set(r.x, -0.75, r.z), this.q, this.s.setScalar(r.s));
      if (rc[r.model] < 14) this.rocks[r.model].setMatrixAt(rc[r.model]++, this.m);
      k.rings.add(r.x, k.surf(r.x, r.z), r.z, r.r * 2.4 + Math.sin(t * 2 + r.id) * 0.3, r.r * 2.4 + Math.sin(t * 2 + r.id) * 0.3, 0, 0xffffff, 0.35);
      if (spy && r.z < s.z) k.rings.add(r.x, k.surf(r.x, r.z) + 0.25, r.z, r.r * 2.8, r.r * 2.8, 0, 0xff8a2a, 0.55 + Math.sin(t * 6) * 0.2);
    }
    this.rocks.forEach((im, i) => this.finish(im, rc[i]));
    // loot afloat
    let br = 0, cr = 0, bo = 0, ch = 0;
    for (const f of v.floats) {
      if (f.t < 0) continue;
      const bob = Math.sin(t * 2.2 + f.id) * 0.12 * swell;
      this.e.set(Math.sin(t * 1.7 + f.id) * 0.25, f.spin + t * 0.4, Math.cos(t * 1.3 + f.id) * 0.2, 'YXZ');
      this.q.setFromEuler(this.e);
      let col = 0xffd23f;
      switch (f.kind) {
        case 'barrel': this.m.compose(this.v.set(f.x, -0.35 + bob, f.z), this.q, this.s.setScalar(1)); if (br < 16) this.barrels.setMatrixAt(br++, this.m); break;
        case 'crate': this.m.compose(this.v.set(f.x, -0.3 + bob, f.z), this.q, this.s.setScalar(1)); if (cr < 8) this.crates.setMatrixAt(cr++, this.m); col = 0x7affa0; break;
        case 'bottle': {
          this.e.set(1.2, f.spin + t * 0.6, Math.sin(t * 2 + f.id) * 0.3, 'YXZ');
          this.q.setFromEuler(this.e);
          this.m.compose(this.v.set(f.x, -0.05 + bob, f.z), this.q, this.s.setScalar(1));
          if (bo < 8) this.bottles.setMatrixAt(bo++, this.m);
          col = SEA_POWER_COLOR[f.power ?? 'wind'];
          if (Math.random() < dt * 8) k.particles.emit(f.x + (Math.random() - 0.5), 0.2, f.z + (Math.random() - 0.5), 0, 1.4, 0, 0.6, 0.3, 0.05, col, 1, 0);
          break;
        }
        case 'chest': this.m.compose(this.v.set(f.x, -0.4 + bob, f.z), this.q, this.s.setScalar(1)); if (ch < 3) this.chests.setMatrixAt(ch++, this.m); k.flares.add(f.x, 1.4, f.z, 1.6, 1.6, t, 0xfff0a0, 0.6); break;
      }
      k.glows.add(f.x, 0.5, f.z, f.kind === 'chest' ? 3.4 : 2.2, f.kind === 'chest' ? 3.4 : 2.2, 0, col, 0.35 + Math.sin(t * 5 + f.id) * 0.1);
      k.rings.add(f.x, k.surf(f.x, f.z), f.z, 2, 2, 0, col, 0.5);
      if (spy && f.z < s.z) k.flares.add(f.x, 2.4, f.z, 1.2, 1.2, t * 2, col, 0.8);
    }
    this.finish(this.barrels, br);
    this.finish(this.crates, cr);
    this.finish(this.bottles, bo);
    this.finish(this.chests, ch);
    // under the spyglass: where the next tentacles will rise
    if (spy) for (const p of v.upcoming(70)) k.rings.add(p.x, k.surf(p.x, p.z) + 0.02, p.z, 4 + Math.sin(t * 6) * 0.6, 4 + Math.sin(t * 6) * 0.6, 0, 0xff3a2a, 0.55);
    // cannonballs and skulls
    let bl = 0, sk = 0;
    for (const b of v.balls) {
      if (b.t < 0 || b.t > 40) continue;
      if (b.kind === 'skull') {
        this.q.setFromEuler(this.e.set(b.t * 9, b.t * 5, 0));
        this.m.compose(this.v.set(b.x, b.y, b.z), this.q, this.s.setScalar(1));
        if (sk < 12) this.skulls.setMatrixAt(sk++, this.m);
        k.glows.add(b.x, b.y, b.z, 1, 1, 0, 0x9aff7a, 0.5);
      } else {
        this.m.compose(this.v.set(b.x, b.y, b.z), this.q.identity(), this.s.setScalar(b.chain ? 1.15 : 1));
        if (bl < 30) this.balls.setMatrixAt(bl++, this.m);
        const c = b.kind === 'ghost' ? 0x5affb0 : b.fire ? 0xff8a2a : b.chain ? 0xc8c8d8 : 0xd8d8d8;
        if (b.kind === 'ghost' || b.fire) {
          k.glows.add(b.x, b.y, b.z, 1.4, 1.4, 0, c, 0.8);
          if (Math.random() < 0.7) k.particles.emit(b.x, b.y, b.z, 0, 0.4, 0, 0.35, 0.5, 0.1, c, 2, 0);
        } else if (Math.random() < 0.5) k.dust.emit(b.x, b.y, b.z, 0, 0.3, 0, 0.5, 0.4, 0.8, c, 2, -0.5);
        if (b.chain) k.streaks.add(b.x, b.y, b.z, 0.1, 1.4, b.t * 20, 0x9aa0b0, 0.8);
      }
      // its shadow on the water, so the arc reads
      k.shadows.add(b.x, k.surf(b.x, b.z) + 0.01, b.z, 0.7, 0.7, 0, 0xffffff, Math.max(0.15, 0.6 - b.y * 0.08));
    }
    this.finish(this.balls, bl);
    this.finish(this.skulls, sk);
  }

  /** The storm's rain: streaks in a box round the camera's view. */
  private syncRain(v: Voyage, dt: number, t: number): void {
    if (!v.storm) return;
    const k = this.k, s = v.ship;
    const lean = -v.gust * 0.06;
    for (let i = 0; i < this.rainSeed.length; i++) {
      const r = this.rainSeed[i];
      const y = 14 - ((r.y * 14 + t * 22) % 14);
      const x = s.x * 0.55 + (r.x - 0.5) * 30 - v.gust * (14 - y) * 0.05;
      const z = s.z - 22 + r.z * 32;
      k.streaks.add(x, y, z, 0.05, 1.1, lean, 0xc8dcf0, 0.35);
    }
    // drops landing: small rings that open and fade on the water (not specks)
    if (this.ripples.length < 36 && Math.random() < dt * 30) this.ripples.push({ x: s.x * 0.55 + (Math.random() - 0.5) * 24, z: s.z - 18 + Math.random() * 26, t: 0 });
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      if (r.t > 0.7) { this.ripples.splice(i, 1); continue; }
      const u = r.t / 0.7;
      k.rings.add(r.x, k.surf(r.x, r.z), r.z, 0.3 + u * 0.9, 0.3 + u * 0.9, 0, 0xdfeaf6, (1 - u) * 0.35);
    }
  }

  private finish(im: THREE.InstancedMesh, n: number): void {
    im.count = n;
    im.visible = n > 0;
    if (n) im.instanceMatrix.needsUpdate = true;
  }
}

/** The crew's ship on the sea: smaller than at anchor so the lane and its foes fit a phone. */
export const SHIP_SCALE = 0.7;
export const SHIP_Y = -0.62;
/** Where the hero stands at sea: at the helm on the quarterdeck, behind the wheel (the model's own units: the bow is −x). */
export const DECK = new THREE.Vector3(4.3, 1.95, 0);
/** The extra guns along each side of the crew's ship (model x; the hull's own gun stands at −0.55): three a side, matching voyage.ts PORTS.crew. */
export const SHIP_GUNS = [-1.75, 0.7];

export type { SeaKind };
export const SEA_LANE = SEA.lane;
