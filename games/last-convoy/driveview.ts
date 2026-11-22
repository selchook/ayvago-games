// Last Convoy: the 3D view of the escape drive, in the mission view's world (view.ts hides the town
// while it shows). The route (drive.ts) is built in chunks of four 16 m cells as the convoy nears
// them and freed behind it: the kit's street tiles (two wide; a crossing in the turns), sidewalks and
// the town packs' buildings along the town stretch, concrete barriers and fields along the on-ramp
// and the highway, street lamps with warm pools, and at the end the kit's Northdale sign gantry.
// The lead vehicle is the kit's model with its own wheel parts turning and steering, its headlights
// throwing a real spot light; the second vehicle of the convoy follows its tracks. Zombies on the
// road are rigged figures (pooled) that fly when hit; barriers tumble; sparks, smoke, nitro flames.
import { THREE } from '@core/three';
import { partsOf, mergeParts, soloGeometry, partsBox, type MergeJob } from './kit';
import { Figure } from './figure';
import { Extra, type View } from './view';
import { BIG, type Drive, type DriveEvent } from './drive';

const CHUNK = 4;
/** The convoy's second vehicle: how far back along the lead's track it drives, and never closer than this. */
const FOLLOW_GAP = 10;
const FOLLOW_MIN = 7.5;
const DRIVE_BUILDINGS = ['Building2_Small', 'Building3_Small', 'Building3_Big', 'House2', 'Building4', 'House1'];
const ZFILE: Record<string, string> = { basic: 'zombie-basic', runner: 'zombie-ribcage', chubby: 'zombie-chubby' };

interface Chunk { k: number; group: THREE.Group; things: { dispose(): void }[] }
interface Car { root: THREE.Group; wheelsBack: THREE.Object3D | null; fl: THREE.Object3D | null; fr: THREE.Object3D | null; flSpin: THREE.Object3D | null; frSpin: THREE.Object3D | null; mats: THREE.Material[] }

export class DriveView {
  readonly root = new THREE.Group();
  private chunks: Chunk[] = [];
  private car: Car | null = null;
  private follower: Car | null = null;
  private carId = '';
  private spot: THREE.SpotLight;
  private beamMesh: THREE.Mesh;
  private zPool: Figure[] = [];
  private zOf = new Map<number, Figure>();
  private things = new Map<number, THREE.Object3D>();
  private picks = new Map<number, THREE.Object3D>();
  private owned: { dispose(): void }[] = [];
  private cam = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private wheelSpin = 0;
  private sign: THREE.Group | null = null;
  private fov = 52;
  shotCam: [number[], number[]] | null = null;

  constructor(private view: View) {
    view.world.scene.add(this.root);
    this.root.visible = false;
    this.spot = new THREE.SpotLight(0xfff0d0, 60, 42, 0.55, 0.6, 1.2);
    this.spot.castShadow = false;
    this.root.add(this.spot, this.spot.target);
    const beamGeo = new THREE.ConeGeometry(4.2, 20, 18, 1, true);
    beamGeo.translate(0, -10, 0);
    beamGeo.rotateX(-Math.PI / 2);
    this.beamMesh = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.root.add(this.beamMesh);
  }

  /** Clears the last drive and gets ready for this one. */
  start(d: Drive, vehicle: string, followerId: string): void {
    for (const c of this.chunks) this.freeChunk(c);
    this.chunks = [];
    for (const o of this.owned) o.dispose();
    this.owned = [];
    for (const t of this.things.values()) this.root.remove(t);
    this.things.clear();
    for (const t of this.picks.values()) this.root.remove(t);
    this.picks.clear();
    for (const f of this.zOf.values()) { f.root.visible = false; f.free = true; }
    this.zOf.clear();
    if (this.car) this.root.remove(this.car.root);
    if (this.follower) this.root.remove(this.follower.root);
    this.carId = vehicle;
    this.car = this.makeCar(vehicle);
    this.follower = this.makeCar(followerId);
    this.root.add(this.car.root, this.follower.root);
    if (this.sign) { this.root.remove(this.sign); this.sign = null; }
    const last = d.cells[d.cells.length - 1];
    this.sign = new THREE.Group();
    const signMat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x101810 }));
    const sm = new THREE.Mesh(soloGeometry('props:town-sign', undefined, true), signMat);
    sm.scale.set(2.65, 1.7, 1.5);
    this.sign.add(sm);
    this.sign.position.set(last.x, 0, last.z);
    this.root.add(this.sign);
    this.cam.set(0, 0, 0);
    this.view.world.camera.fov = this.fov = 52;
    this.view.world.camera.updateProjectionMatrix();
    const fog = this.view.world.scene.fog as THREE.Fog;
    fog.near = 34; fog.far = 105;
  }

  /** Back to the town's fog and lens. */
  stop(): void {
    const fog = this.view.world.scene.fog as THREE.Fog;
    fog.near = 26; fog.far = 64;
    this.view.world.camera.fov = 40;
    this.view.world.camera.updateProjectionMatrix();
  }

  private own<T extends { dispose(): void }>(t: T): T { this.owned.push(t); return t; }

  private makeCar(id: string): Car {
    const root = new THREE.Group();
    const mats: THREE.Material[] = [];
    const car: Car = { root, wheelsBack: null, fl: null, fr: null, flSpin: null, frSpin: null, mats };
    for (const part of ['body', 'wheel-fl', 'wheel-fr', 'wheels-back']) {
      const ps = partsOf('vehicles:' + id, part);
      if (!ps.length) continue;
      const box = partsBox('vehicles:' + id, part);
      const c = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      pivot.add(spin);
      if (part !== 'body') pivot.position.copy(c);
      for (const p of ps) {
        const mat = this.own(p.material === 'head' ? new THREE.MeshBasicMaterial({ color: 0xfff6d8 }) : p.material === 'brake' ? new THREE.MeshBasicMaterial({ color: 0xff2a1a }) : new THREE.MeshLambertMaterial({ vertexColors: true }));
        mats.push(mat);
        const mesh = new THREE.Mesh(p.geo, mat);
        mesh.applyMatrix4(p.mat);
        if (part !== 'body') mesh.position.sub(c);
        mesh.castShadow = true;
        spin.add(mesh);
      }
      root.add(pivot);
      if (part === 'wheels-back') car.wheelsBack = spin;
      if (part === 'wheel-fl') { car.fl = pivot; car.flSpin = spin; }
      if (part === 'wheel-fr') { car.fr = pivot; car.frSpin = spin; }
    }
    return car;
  }

  // ---------------------------------------------------------------- the route, in chunks

  private buildChunk(d: Drive, k: number): Chunk {
    const group = new THREE.Group();
    const things: { dispose(): void }[] = [];
    const jobs: MergeJob[] = [];
    const ex = new Extra();
    const bj: MergeJob[] = [];
    const at = (x: number, z: number, rot: number, s = 1, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
    const pools: { x: number; z: number }[] = [];
    for (let i = k; i < Math.min(d.cells.length, k + CHUNK); i++) {
      const c = d.cells[i];
      const straight = c.in[0] === c.out[0] && c.in[1] === c.out[1];
      const along = c.out[1] !== 0 ? 0 : Math.PI / 2;
      // the road: four tiles (a crossing in a turn)
      for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) jobs.push({ key: straight ? 'props:street-straight' : 'props:street-4way', m: at(c.x + ox, c.z + oz, along) });
      // the lead-in behind the start (drive.ts closes it with cell 0's extra walls)
      if (i === 0) for (const [ox, oz] of [[-4, BIG - 4], [4, BIG - 4], [-4, BIG + 4], [4, BIG + 4]]) jobs.push({ key: 'props:street-straight', m: at(c.x + ox, c.z + oz, along) });
      // and the stretch past the sign (the last cell's extra walls)
      if (i === d.cells.length - 1) for (const [ox, oz] of [[-4, -BIG - 4], [4, -BIG - 4], [-4, -BIG + 4], [4, -BIG + 4]]) jobs.push({ key: 'props:street-straight', m: at(c.x + ox, c.z + oz, along) });
      // ground beyond the walls (sidewalk in town, verge on the highway), buildings or barriers
      const H = BIG / 2;
      for (const [x0, z0, x1, z1] of c.walls) {
        const vertical = x0 === x1;
        // outward normal of this wall
        const nx = vertical ? Math.sign(x0 - c.x) : 0, nz = vertical ? 0 : Math.sign(z0 - c.z);
        if (c.zone === 'town') {
          // a sidewalk strip and a building behind it
          const sx0 = Math.min(x0, x1 + nx * 3), sx1 = Math.max(x1, x0 + nx * 3), sz0 = Math.min(z0, z1 + nz * 3), sz1 = Math.max(z1, z0 + nz * 3);
          ex.box(vertical ? Math.min(x0, x0 + nx * 3) : sx0, -0.02, vertical ? sz0 : Math.min(z0, z0 + nz * 3), vertical ? Math.max(x0, x0 + nx * 3) : sx1, 0.14, vertical ? sz1 : Math.max(z0, z0 + nz * 3), 0x8a8a90);
          const key = DRIVE_BUILDINGS[(i * 7 + (vertical ? 3 : 1) + (nx + nz > 0 ? 5 : 0)) % DRIVE_BUILDINGS.length];
          const box = partsBox('buildings:' + key);
          const w = 15, dd = 9, h = 7 + ((i * 13 + (nx > 0 ? 3 : 0)) % 6);
          const cx = (x0 + x1) / 2 + nx * (3 + dd / 2), cz = (z0 + z1) / 2 + nz * (3 + dd / 2);
          // the front faces the road (the inward normal)
          const rot = Math.atan2(-nx, -nz);
          const m = at(cx, cz, rot).multiply(new THREE.Matrix4().makeScale(w / (box.max.x - box.min.x), h / (box.max.y - box.min.y), dd / (box.max.z - box.min.z)))
            .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2));
          bj.push({ key: 'buildings:' + key, m, tint: [0xffffff, 0xf2e6d8, 0xe0e8f2, 0xf4dcc8][(i + (nx > 0 ? 1 : 0)) % 4] });
          if ((i + (vertical ? 1 : 0)) % 2 === 0) {
            const lx = (x0 + x1) / 2 + nx * 0.6, lz = (z0 + z1) / 2 + nz * 0.6;
            jobs.push({ key: 'props:street-light', m: at(lx, lz, Math.atan2(-nx, -nz)) });
            pools.push({ x: lx - nx * 2.6, z: lz - nz * 2.6 });
          }
        } else {
          // a concrete barrier along the edge, the verge and a field beyond
          const tx = vertical ? 0 : 1, tz = vertical ? 1 : 0;
          const len = vertical ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          const hw = len / 2;
          ex.box(mx - tx * hw - nx * 0.05 + Math.min(0, nx) * 0.6, 0, mz - tz * hw - nz * 0.05 + Math.min(0, nz) * 0.6, mx + tx * hw + Math.max(0, nx) * 0.6, 0.95, mz + tz * hw + Math.max(0, nz) * 0.6, 0xb8b4aa);
          ex.box(mx - tx * hw + Math.min(0, nx) * 0.62, 0.7, mz - tz * hw + Math.min(0, nz) * 0.62, mx + tx * hw + Math.max(0, nx) * 0.62, 0.78, mz + tz * hw + Math.max(0, nz) * 0.62, 0xd8a83a);
          const fx0 = Math.min(mx - tx * hw, mx - tx * hw + nx * 30), fx1 = Math.max(mx + tx * hw, mx + tx * hw + nx * 30);
          const fz0 = Math.min(mz - tz * hw, mz - tz * hw + nz * 30), fz1 = Math.max(mz + tz * hw, mz + tz * hw + nz * 30);
          ex.flat(fx0, fz0, fx1, fz1, -0.03, c.zone === 'ramp' ? 0x4a4a3a : 0x3a4a30);
          if ((i * 5 + (nx + nz > 0 ? 1 : 0)) % 3 === 0) this.tree(ex, mx + nx * (8 + (i % 3) * 4), mz + nz * (8 + (i % 4) * 3), i);
          if (i % 2 === 0) { const lx = mx + nx * 1.2, lz = mz + nz * 1.2; jobs.push({ key: 'props:street-light', m: at(lx, lz, Math.atan2(-nx, -nz)) }); pools.push({ x: lx - nx * 2.6, z: lz - nz * 2.6 }); }
        }
        void H;
      }
    }
    const merged = mergeParts(jobs, ex);
    for (const [name, geo] of merged) {
      things.push(geo);
      const mat = name === 'lamp' ? new THREE.MeshBasicMaterial({ color: 0xfff0c0 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
      things.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = name === 'lit';
      group.add(mesh);
    }
    if (bj.length) {
      for (const [name, geo] of mergeParts(bj)) {
        things.push(geo);
        if (name === 'glass') {
          const col = geo.getAttribute('color') as THREE.BufferAttribute;
          for (let t = 0; t < col.count; t += 6) { const on = ((t * 7 + k * 13) % 9) < 2; for (let q = t; q < Math.min(col.count, t + 6); q++) col.setXYZ(q, on ? 1 : 0.09, on ? 0.78 : 0.11, on ? 0.42 : 0.17); }
        }
        const mat = name === 'glass' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        things.push(mat);
        group.add(new THREE.Mesh(geo, mat));
      }
    }
    if (pools.length) {
      const pm = this.poolMesh(pools);
      things.push(pm.geometry, pm.material as THREE.Material);
      group.add(pm);
    }
    this.root.add(group);
    return { k, group, things };
  }

  private poolMesh(spots: { x: number; z: number }[]): THREE.Mesh {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    spots.forEach((s, i) => {
      const r = 6.5, y = 0.08;
      pos.push(s.x - r, y, s.z - r, s.x + r, y, s.z - r, s.x + r, y, s.z + r, s.x - r, y, s.z + r);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      const b = i * 4;
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.view.poolTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc890 }));
  }

  private tree(ex: Extra, x: number, z: number, i: number): void {
    const h = 4 + (i % 3);
    ex.cyl(x, z, 0.22, 0, h * 0.4, 0x5a3a24, 6);
    ex.cone(x, z, 1.8, h * 0.3, h * 0.8, 0x2e5a34, 7);
    ex.cone(x, z, 1.3, h * 0.6, h, 0x3a6a3e, 7);
  }

  private freeChunk(c: Chunk): void {
    this.root.remove(c.group);
    for (const t of c.things) t.dispose();
  }

  private streamChunks(d: Drive): void {
    const want = new Set<number>();
    for (let k = Math.max(0, Math.floor((d.ci - 3) / CHUNK) * CHUNK); k <= d.ci + 8 && k < d.cells.length; k += CHUNK) want.add(k);
    this.chunks = this.chunks.filter((c) => { if (want.has(c.k)) return true; this.freeChunk(c); return false; });
    for (const k of want) if (!this.chunks.some((c) => c.k === k)) this.chunks.push(this.buildChunk(d, k));
  }

  // ---------------------------------------------------------------- per frame

  sync(d: Drive, dt: number): void {
    this.streamChunks(d);
    const car = this.car!;
    car.root.position.set(d.x, 0, d.z);
    car.root.rotation.y = d.h;
    // a little body roll and pitch from the steering and the throttle
    car.root.rotation.z = -d.steer * Math.min(1, d.v / 15) * 0.05;
    this.wheelSpin += (d.v / 0.45) * dt;
    if (car.wheelsBack) car.wheelsBack.rotation.x = this.wheelSpin;
    for (const [pivot, spin] of [[car.fl, car.flSpin], [car.fr, car.frSpin]] as [THREE.Object3D | null, THREE.Object3D | null][]) {
      if (pivot) pivot.rotation.y = -d.steer * 0.45;
      if (spin) spin.rotation.x = this.wheelSpin;
    }
    // hit: the body flashes
    for (const m of car.mats) if ((m as THREE.MeshLambertMaterial).emissive) (m as THREE.MeshLambertMaterial).emissive.setRGB(d.hitT * 2, d.hitT * 0.6, d.hitT * 0.4);
    // the convoy's second vehicle follows the lead's tracks close behind
    const f = this.follower!;
    // FOLLOW_GAP m back along the lead's own track: in the countdown's wide shot and in every turn
    // (under the chase camera on the straights)
    let left = FOLLOW_GAP, tr = { x: d.x, z: d.z, h: d.h };
    for (let i = d.trail.length - 1; i > 0 && left > 0; i--) {
      const a = d.trail[i], b = d.trail[i - 1];
      left -= Math.hypot(a.x - b.x, a.z - b.z);
      tr = b;
    }
    if (left > 0) tr = { x: tr.x - Math.sin(tr.h) * left, z: tr.z - Math.cos(tr.h) * left, h: tr.h };
    // never on top of the lead: after a reverse, a spin or a bounce off a wall the track doubles
    // back on itself, so the follower keeps its distance straight behind the lead instead
    if (Math.hypot(tr.x - d.x, tr.z - d.z) < FOLLOW_MIN) tr = { x: d.x - Math.sin(d.h) * FOLLOW_MIN, z: d.z - Math.cos(d.h) * FOLLOW_MIN, h: d.h };
    f.root.position.set(tr.x, 0, tr.z);
    f.root.rotation.y = tr.h;
    if (f.wheelsBack) f.wheelsBack.rotation.x = this.wheelSpin;
    if (f.flSpin) f.flSpin.rotation.x = this.wheelSpin;
    if (f.frSpin) f.frSpin.rotation.x = this.wheelSpin;
    // headlights
    const fx = Math.sin(d.h), fz = Math.cos(d.h);
    this.spot.position.set(d.x + fx * 2.2, 1.3, d.z + fz * 2.2);
    this.spot.target.position.set(d.x + fx * 16, 0, d.z + fz * 16);
    this.beamMesh.position.set(d.x + fx * 2.4, 1.1, d.z + fz * 2.4);
    this.beamMesh.rotation.set(-0.06, d.h, 0);
    // zombies
    const seen = new Set<number>();
    for (const z of d.zombies) {
      seen.add(z.id);
      let fig = this.zOf.get(z.id);
      const file = ZFILE[z.kind];
      if (!fig) {
        fig = this.zPool.find((p) => p.free && p.tag === file);
        if (!fig) { fig = new Figure(file, 1); fig.tag = file; this.zPool.push(fig); this.root.add(fig.root); }
        fig.free = false;
        fig.reset();
        fig.root.visible = true;
        fig.setTint([0xffffff, 0xd8f0d0, 0xd8e0f8][z.id % 3]);
        this.zOf.set(z.id, fig);
      }
      fig.root.scale.setScalar(z.kind === 'chubby' ? 1.3 : z.kind === 'runner' ? 1.45 : 1.25);
      fig.root.position.set(z.x, z.y, z.z);
      fig.root.rotation.y = z.face;
      if (z.state === 'dead') { fig.play('Death', { once: true, speed: 1.5 }); fig.spin.rotation.x += dt * 8 * (z.y > 0.1 ? 1 : 0); if (z.deadT > 2) fig.root.position.y = -(z.deadT - 2) * 0.8; }
      else if (z.state === 'lunge') fig.play('Run', { speed: 1.4 });
      else fig.play(z.kind === 'runner' ? 'Run' : 'Walk', { speed: 0.9 });
      fig.update(dt);
    }
    for (const [id, fig] of this.zOf) if (!seen.has(id)) { fig.root.visible = false; fig.free = true; this.zOf.delete(id); }
    // barriers and wrecks
    for (const o of d.obstacles) {
      if (Math.abs(o.cell - d.ci) > 9) { const t = this.things.get(o.id); if (t) { this.root.remove(t); this.things.delete(o.id); } continue; }
      let t = this.things.get(o.id);
      if (!t) {
        if (o.kind === 'barrier') {
          t = new THREE.Mesh(soloGeometry('props:traffic-barrier-1', undefined, true, 1.3), this.own(new THREE.MeshLambertMaterial({ vertexColors: true })));
        } else {
          const g = new THREE.Group();
          const mat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, color: o.tint }));
          for (const only of ['body', 'wheel-fl', 'wheel-fr', 'wheels-back']) g.add(new THREE.Mesh(soloGeometry('vehicles:' + (o.id % 2 ? 'sports' : 'pickup'), only), mat));
          t = g;
        }
        t.traverse((q) => { q.castShadow = true; });
        this.root.add(t);
        this.things.set(o.id, t);
      }
      t.position.set(o.x, o.down ? Math.max(0, Math.sin(Math.min(1, o.t * 2) * Math.PI) * 1.5) : 0, o.z);
      t.rotation.set(o.down ? o.t * 6 : 0, o.rot, o.down ? o.t * 3 : 0);
      t.visible = !o.down || o.t < 2.5;
    }
    // pickups
    const tt = d.time;
    for (const p of d.picks) {
      let t = this.picks.get(p.id);
      if (p.taken || Math.abs(Math.hypot(p.x - d.x, p.z - d.z)) > 110) { if (t) { this.root.remove(t); this.picks.delete(p.id); } continue; }
      if (!t) {
        const col = p.kind === 'nitro' ? 0x3aa8ff : p.kind === 'repair' ? 0x5ad86a : 0xb8b8c0;
        t = new THREE.Mesh(p.kind === 'scrap' ? this.own(new THREE.OctahedronGeometry(0.45)) : this.own(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10)), this.own(new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 })));
        this.root.add(t);
        this.picks.set(p.id, t);
      }
      t.position.set(p.x, 0.8 + Math.sin(tt * 3 + p.id) * 0.2, p.z);
      t.rotation.y = tt * 2;
    }
    // effects
    if (d.nitroT > 0 && dt > 0) for (let q = 0; q < 3; q++) this.view.glow.dot(d.x - fx * 2.8 + (Math.random() - 0.5) * 0.8, 0.6, d.z - fz * 2.8, -fx * 6, 0.5, -fz * 6, Math.random() < 0.5 ? 0x5ac8ff : 0xffffff, 0.25);
    if (d.armor < d.maxArmor * 0.4 && dt > 0 && Math.random() < dt * 10) this.view.smoke.dot(d.x + fx * 1.8, 1.4, d.z + fz * 1.8, (Math.random() - 0.5), 2, (Math.random() - 0.5), 0x4a4a4a, 1.5, 0.5);
    this.view.sprites.update(dt); this.view.glow.update(dt); this.view.smoke.update(dt); this.view.rings.update(dt);
    this.follow(d, dt);
  }

  private follow(d: Drive, dt: number): void {
    const cam = this.view.world.camera;
    const fx = Math.sin(d.h), fz = Math.cos(d.h);
    // the countdown shows the whole convoy from higher up, then the camera swoops in behind the lead
    const wide = d.phase === 'count' ? Math.min(1, d.count / 1.2) : 0;
    const back = 10.5 + Math.min(3, d.v * 0.08) + wide * 9, up = 6.2 + wide * 5;
    const want = new THREE.Vector3(d.x - fx * back, up, d.z - fz * back);
    const look = new THREE.Vector3(d.x + fx * 7, 1, d.z + fz * 7);
    const k = dt > 0 ? 1 - Math.exp(-dt * 4.5) : 1;
    if (this.cam.lengthSq() === 0 || dt > 0.2) { this.cam.copy(want); this.camLook.copy(look); }
    this.cam.lerp(want, k);
    this.camLook.lerp(look, Math.min(1, k * 1.6));
    if (this.shotCam) {
      const [p, l] = this.shotCam;
      cam.position.set(d.x + p[0], p[1], d.z + p[2]);
      cam.lookAt(d.x + l[0], l[1], d.z + l[2]);
    } else {
      cam.position.copy(this.cam);
      cam.lookAt(this.camLook);
    }
    const wantFov = 52 + (d.nitroT > 0 ? 10 : 0) + Math.min(6, d.v * 0.2);
    this.fov += (wantFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.view.world.followSun(new THREE.Vector3(d.x, 0, d.z));
  }

  handle(ev: DriveEvent, d: Drive): void {
    const v = this.view;
    switch (ev.type) {
      case 'runover': v.sprites.emit(ev.x, 1, ev.z, 0x8a1a1a, ev.kind === 'chubby' ? 24 : 10, { speed: 5, up: 4, life: 0.6, spread: 0.8 }); if (ev.kind === 'chubby') v.smoke.emit(ev.x, 1, ev.z, 0x8ab84a, 14, { speed: 3, up: 1, life: 1.2 }); break;
      case 'crash': v.glow.emit(ev.x, 0.8, ev.z, 0xffc86a, ev.hard ? 24 : 10, { speed: 6, up: 3, life: 0.4 }); v.smoke.emit(ev.x, 0.8, ev.z, 0x6a6a6a, ev.hard ? 8 : 3, { speed: 2, up: 1, life: 1 }); break;
      case 'scrape': v.glow.emit(ev.x, 0.6, ev.z, 0xffd27a, 5, { speed: 5, up: 2, life: 0.25 }); break;
      case 'ram': v.glow.emit(ev.x, 0.8, ev.z, 0xffe0a0, 14, { speed: 5, up: 3, life: 0.35 }); v.sprites.emit(ev.x, 0.8, ev.z, 0xd8d8d8, 10, { speed: 6, up: 4, life: 0.6 }); break;
      case 'pick': v.glow.emit(ev.x, 1, ev.z, ev.kind === 'nitro' ? 0x5ac8ff : ev.kind === 'repair' ? 0x7aff9a : 0xd8d8ff, 18, { speed: 3, up: 3, life: 0.5 }); break;
      case 'nitro': v.rings.add(d.x, d.z, 0x5ac8ff, 1, 5, 0.4); break;
      default: break;
    }
  }

  dispose(): void {
    for (const c of this.chunks) this.freeChunk(c);
    for (const o of this.owned) o.dispose();
    for (const f of this.zPool) f.dispose();
  }
}
