// Kickflip Park: draws a session (sim.ts) in 3D. The park is merged per texture (a few draw calls
// for every piece and building), the skater is the player's own Mini Character on the Kenney
// board, the mixtapes spin over their spots, and every spark, puff and glow is instanced. The
// chase camera rides behind and above with a look ahead, holds still through vert airs and swings
// round after them at a limited rate. The Play scene and the menu's autopilot both use it, so the
// menu also compiles every shader the first Play frame needs.
import Phaser from 'phaser';
import { World3D, THREE, model, modelClips } from '@core/three';
import { playerCharacter3d } from '@core/three';
import type { Sim, SimEvent } from './sim';
import { park as getPark, type ParkDef, type ParkId } from './parks';
import { Mats, GeoBuilder, buildCustom, mergeModels, pieceMatrix, propMatrix, CROWD_KEYS, type StyleTex } from './kit';
import { Skater, C } from './skater';
import { Billboards, Particles, glowTex, puffTex, ringTex } from './fx3d';
import { clamp, wrap } from './defs';
import { usableBoard } from './boardmodel';
import { onSeg } from './park';

export const FOV = 62;

/** Where the line of sight from the rider to the camera is checked (shares of the way; close to the rider too: a wall hugging the rider hides them). */
const LOS_STEPS = [0.06, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

interface Fan { obj: THREE.Object3D; mixer: THREE.AnimationMixer; idle: THREE.AnimationAction | null; cheer: THREE.AnimationAction | null; cheerT: number }

export class View {
  readonly world: World3D;
  readonly park: ParkDef;
  readonly skater: Skater;
  readonly mats = new Mats();
  private sparks: Particles;
  private dust: Particles;
  private glows: Particles;
  private halo: Billboards;
  private rings: Billboards;
  private tapes: THREE.InstancedMesh;
  private tapeTaken: boolean[];
  private fans: Fan[] = [];
  private camYaw = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camQ = new THREE.Quaternion();
  private shakeT = 0;
  private shakeAmp = 0;
  private punch = 0;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private flashes: { x: number; y: number; z: number; s: number; t: number; max: number; c: number }[] = [];
  /** Test hook: a fixed camera round the skater (yaw from its heading, distance, height). */
  debugCam: { yaw: number; dist: number; h: number } | null = null;
  /** Camera distance multiplier (menu shots pull back). */
  camDist = 1;
  /** The vert-air side view: how much of it is on, which air and which side. */
  private vertK = 0;
  private vertAir: Sim['air'] = null;
  private vertSide = 1;
  /** Menu backdrop: shifts the picture up by this share of its height (the skater shows above PLAY). */
  menuShift = 0;
  /** The camera snaps instead of easing (first frame, respawns). */
  private snap = true;
  private lastState = '';

  constructor(phaser: Phaser.Scene, id: ParkId, o: { board: string; menu?: boolean }) {
    const park = getPark(id);
    this.park = park;
    const L = park.look;
    const world = new World3D(phaser, { fov: FOV, near: 0.3, far: 420, background: L.sky, fog: { color: L.fog, near: L.fogNear, far: L.fogFar } });
    this.world = world;
    (globalThis as { __kfRenderer?: THREE.WebGLRenderer }).__kfRenderer = world.renderer;
    world.addLights({ sky: L.hemiSky, ground: L.hemiGround, ambient: 1.55, sun: L.sun, intensity: 2.1, dir: [-0.45, 1, 0.55], extent: 26 });
    if (world.sun) {
      world.sun.shadow.mapSize.set(2048, 2048);
      world.sun.shadow.camera.far = 160;
      world.sun.position.multiplyScalar(2);
    }
    const sc = world.scene;
    this.buildPark(sc);
    this.buildSky(sc);
    // the skater
    this.skater = new Skater(playerCharacter3d(), this.mats, usableBoard(o.board), (x, z) => park.terrain.height(x, z));
    sc.add(this.skater.root, this.skater.shadowMesh);
    // effects
    const glow = glowTex();
    this.sparks = new Particles(sc, glow, 500, { order: 13 });
    this.glows = new Particles(sc, glow, 300, { order: 14 });
    this.dust = new Particles(sc, puffTex(), 260, { additive: false, order: 12 });
    this.halo = new Billboards(sc, glow, 40, { order: 11 });
    this.rings = new Billboards(sc, ringTex(), 24, { flat: true, order: 9 });
    // the mixtapes
    this.tapes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.4, 0.12), new THREE.MeshLambertMaterial({ map: tapeTex(), emissive: 0x332211 }), park.tapes.length);
    this.tapes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tapes.frustumCulled = false;
    this.tapes.castShadow = true;
    sc.add(this.tapes);
    this.tapeTaken = park.tapes.map(() => false);
    // the crowd (Timber Yard)
    park.crowd.forEach(([x, y, z, face], i) => {
      const key = CROWD_KEYS[i % CROWD_KEYS.length];
      const obj = model(key, { shadows: true });
      obj.traverse((m) => {
        const mm = m as THREE.Mesh;
        if (mm.isMesh) { mm.material = this.mats.of(mm.material as THREE.Material); mm.frustumCulled = false; }
      });
      obj.scale.setScalar(C);
      obj.position.set(x, y, z);
      obj.rotation.y = face;
      sc.add(obj);
      const mixer = new THREE.AnimationMixer(obj);
      const clips = modelClips(key);
      const idle = clips.find((c) => c.name === 'idle'), cheer = clips.find((c) => c.name === 'emote-yes');
      const fan: Fan = { obj, mixer, idle: idle ? mixer.clipAction(idle) : null, cheer: cheer ? mixer.clipAction(cheer) : null, cheerT: 0 };
      fan.idle?.play();
      mixer.update(i * 0.37);
      this.fans.push(fan);
    });
    void o.menu;
  }

  // ------------------------------------------------------------------ building

  private buildPark(sc: THREE.Scene): void {
    const park = this.park;
    const group = new THREE.Group();
    sc.add(group);
    // Kenney pieces, merged
    const kits = park.pieces.filter((p) => p.model.startsWith('m:')).map((p) => ({ key: 'ms:' + p.model.slice(2), matrix: pieceMatrix(p) }));
    mergeModels(kits, this.mats, group);
    // our own pieces
    const gb = new GeoBuilder();
    for (const p of park.pieces) if (!p.model.startsWith('m:')) buildCustom(gb, p);
    // the floor
    const f = park.floor;
    const fl: StyleTex = park.look.ground === 'wood' ? 'woodfloor' : park.look.ground === 'concrete' ? 'plaza' : 'roof';
    if (f) {
      gb.quad(fl, [-30, f.y, 46], [30, f.y, 46], [30, f.y, -50], [-30, f.y, -50], 'xz');
      // the surroundings: grass or tarmac beyond the park
      const out: StyleTex = park.id === 'plaza' ? 'grass' : 'asphalt';
      gb.quad(out, [f.x0, f.y - 0.02, f.z1], [f.x1, f.y - 0.02, f.z1], [f.x1, f.y - 0.02, f.z0], [f.x0, f.y - 0.02, f.z0], 'xz');
    } else {
      // the street far below the roofs
      gb.quad('asphalt', [-120, -40, 120], [120, -40, 120], [120, -40, -120], [-120, -40, -120], 'xz');
    }
    gb.build(this.mats, group);
    // the scenery props, merged per kit texture (no shadows cast: they are far off)
    mergeModels(park.props.map((p) => ({ key: p.kit + ':' + p.name, matrix: propMatrix(p) })), this.mats, group, { cast: false });
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && park.id !== 'roofs') m.receiveShadow = true;
    });
  }

  private buildSky(sc: THREE.Scene): void {
    const L = this.park.look;
    const g = new THREE.SphereGeometry(380, 24, 12);
    const top = new THREE.Color(L.sky).multiplyScalar(0.8), mid = new THREE.Color(L.sky), bot = new THREE.Color(L.fog);
    const col: number[] = [];
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getY(i) / 380;
      const c = k > 0 ? mid.clone().lerp(top, Math.min(1, k * 1.6)) : bot.clone();
      if (k > 0 && k < 0.15) c.lerp(bot, 1 - k / 0.15);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    sc.add(sky);
    this.sky = sky;
  }
  private sky!: THREE.Mesh;

  // ------------------------------------------------------------------ frame

  shake(amp: number, t: number): void {
    if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = t; }
  }

  /** A quick zoom-in (big landings, specials). */
  zoomPunch(k: number): void { this.punch = Math.max(this.punch, k); }

  sync(sim: Sim, dt: number, sdt = dt): void {
    this.t += dt;
    this.skater.update(sdt, sim);
    this.camera(sim, dt);
    this.sky.position.copy(this.world.camera.position);
    if (this.world.sun) this.world.followSun(this.v.set(sim.x, Math.max(0, sim.y), sim.z));
    this.effects(sim, dt, sdt);
    // tapes
    let n = 0;
    this.park.tapes.forEach(([x, y, z], i) => {
      if (sim.tapes[i] || this.tapeTaken[i]) return;
      const bob = Math.sin(this.t * 2.4 + i) * 0.12;
      this.m.compose(this.v.set(x, y + bob, z), this.q.setFromEuler(this.e.set(0.15, this.t * 2 + i, 0)), this.s.set(1, 1, 1));
      this.tapes.setMatrixAt(n++, this.m);
    });
    this.tapes.count = n;
    this.tapes.instanceMatrix.needsUpdate = true;
    for (const f of this.fans) {
      f.mixer.update(dt);
      if (f.cheerT > 0) {
        f.cheerT -= dt;
        if (f.cheerT <= 0) { f.cheer?.fadeOut(0.3); f.idle?.reset().fadeIn(0.3).play(); }
      }
    }
  }

  private camera(sim: Sim, dt: number): void {
    const cam = this.world.camera;
    const st = sim.state;
    // which way the camera wants to look
    let want = this.camYaw;
    const vh = Math.hypot(sim.vx, sim.vz);
    if (st === 'ground' || st === 'manual') {
      if (Math.abs(sim.speed) > 0.6) want = sim.heading + (sim.speed < 0 ? Math.PI : 0);
    } else if (st === 'grind') want = sim.heading;
    else if (st === 'air') {
      if (!sim.air!.vert && vh > 2) want = Math.atan2(sim.vx, sim.vz);
    }
    if (st !== this.lastState) this.lastState = st;
    // the chase follows the heading quickly enough that a turn reads at once (about 25° behind in
    // a full-lock carve), slowly in the air so spins show against the park
    const rate = st === 'air' ? (sim.air!.vert ? 0 : 1.2) : st === 'bail' ? 0.6 : 2.9;
    let d = wrap(want - this.camYaw);
    // a wall between the camera and the rider (riding round a bowl's outside): swing round to behind
    // the rider quickly when the view from there is clear
    let fast = 1;
    if (st === 'ground' || st === 'manual') {
      const view = (yaw: number) => {
        const cx = sim.x - Math.sin(yaw) * 8.6, cz = sim.z - Math.cos(yaw) * 8.6, cy = sim.y + 3.9;
        return this.clearView(sim.x, sim.y + 1, sim.z, cx, cy, cz, sim.y + 10, sim.y) - cy;
      };
      if (Math.abs(d) > 0.25) {
        const here = view(this.camYaw);
        if (here > 2.5 && view(want) < here - 1.5) fast = 3;
      }
    }
    d = wrap(want - this.camYaw);
    this.camYaw += clamp(d * Math.min(1, dt * 4.4 * fast), -rate * fast * dt, rate * fast * dt);
    if (this.snap) this.camYaw = want;
    // where it sits: behind and above, higher and further at speed and in big airs
    const sp = Math.min(14, Math.abs(st === 'air' ? Math.hypot(vh, sim.vy) : sim.speed));
    const groundY = this.park.terrain.height(sim.x, sim.z);
    const above = st === 'air' ? Math.max(0, sim.y - Math.max(groundY, this.park.fallY + 6)) : 0;
    const vert = st === 'air' && sim.air!.vert;
    const dist = (8.6 + sp * 0.16 + above * 0.35) * this.camDist * (1 - this.punch * 0.2);
    const fy = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const baseY = st === 'air' ? Math.max(sim.y - above * 0.55, sim.air!.startY) : sim.y;
    let tx = sim.x - fy * dist, tz = sim.z - fz * dist;
    let ty = baseY + 3.9 + sp * 0.07 + above * 0.25 - this.punch * 0.6;
    const T = this.park.terrain;
    const ty0 = ty;
    const floorY = Math.min(sim.y, groundY);
    ty = this.clearView(sim.x, sim.y + 1, sim.z, tx, ty, tz, sim.y + 10, floorY);
    // lifted high over walls (a bowl, a deck): come in closer instead, so the rider does not sink to
    // the bottom of the picture under the touch buttons
    const lift0 = ty - ty0;
    if (lift0 > 1) {
      const k = clamp(1 - (lift0 - 1) * 0.09, 0.6, 1);
      tx = sim.x - fy * dist * k; tz = sim.z - fz * dist * k;
      ty = this.clearView(sim.x, sim.y + 1, sim.z, tx, ty0, tz, sim.y + 10, floorY);
    }
    // look ahead of the board, so the line in front shows and the rider sits in the lower third;
    // a camera lifted over something looks up with it, so the bottom edge of the view stays clear
    const ahead = 5.2 + sp * 0.15;
    const lx = sim.x + fy * ahead, ly = sim.y + 1.4 + (ty - ty0) * 0.2, lz = sim.z + fz * ahead;
    // vert airs (half-pipe, bowl): a side view from the flat, out and up, so the coping, the rider
    // above it and the transition all show
    const a = sim.air;
    if (st === 'air' && a?.vert) {
      if (a !== this.vertAir) { this.vertAir = a; this.vertSide = this.pickSide(a, sim); }
      this.vertK = Math.min(1, this.vertK + dt * 5);
    } else this.vertK = Math.max(0, this.vertK - dt * (st === 'air' ? 3 : 1.6));
    let px = tx, py = ty, pz = tz, qx = lx, qy = ly, qz = lz;
    if (this.vertK > 0 && this.vertAir) {
      const v = this.vertAir, k = this.vertK * this.vertK * (3 - 2 * this.vertK);
      const c = this.vertCamPos(v, this.vertSide);
      const vy = this.clearView(sim.x, sim.y + 0.8, sim.z, c[0], c[1], c[2], v.lipY + 9);
      px += (c[0] - px) * k; py += (vy - py) * k; pz += (c[2] - pz) * k;
      const lookY = Math.max(v.lipY + 0.4, sim.y * 0.65 + v.lipY * 0.35 + 0.5);
      qx += (sim.x - qx) * k; qy += (lookY - qy) * k; qz += (sim.z - qz) * k;
      // the chase picks up from where this view looks
      if (k > 0.5) this.camYaw = Math.atan2(sim.x - px, sim.z - pz);
    }
    void T;
    this.v.set(px, py, pz);
    if (this.snap) this.camPos.copy(this.v);
    else this.camPos.lerp(this.v, Math.min(1, dt * (this.vertK > 0 ? 4 : 5)));
    this.v.set(qx, qy, qz);
    if (this.snap) this.camLook.copy(this.v);
    else this.camLook.lerp(this.v, Math.min(1, dt * 8));
    this.snap = false;
    cam.position.copy(this.camPos);
    if (this.debugCam) {
      // a fixed view round the skater (screenshots of poses)
      const a = sim.heading + this.debugCam.yaw;
      const gy = sim.state === 'air' ? Math.min(sim.y, sim.air!.startY) : sim.y;
      cam.position.set(sim.x + Math.sin(a) * this.debugCam.dist, gy + this.debugCam.h, sim.z + Math.cos(a) * this.debugCam.dist);
      this.camLook.set(sim.x, sim.y * 0.6 + gy * 0.4 + 0.9, sim.z);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmp * Math.max(0, Math.min(1, this.shakeT * 5));
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k * 0.7;
      cam.position.z += (Math.random() - 0.5) * k;
    }
    cam.lookAt(this.camLook);
    if (this.menuShift && !cam.view) cam.setViewOffset(1000 * cam.aspect, 1000, 0, 1000 * this.menuShift, 1000 * cam.aspect, 1000);
    this.punch = Math.max(0, this.punch - dt * 1.6);
    const fov = FOV - this.punch * 8 + Math.min(6, sp * 0.35);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.camQ.copy(cam.quaternion);
  }

  /** The camera height that keeps the ground under it and every wall between it and the target out of the view. */
  private clearView(x: number, y: number, z: number, cx: number, cy: number, cz: number, cap: number, floor = y - 1): number {
    const T = this.park.terrain;
    // nothing right round the lens either (a ledge or kicker just under the camera would fill the
    // bottom of the picture): clear everything within 2.5 m
    let near = T.height(cx, cz);
    for (const r of [1.2, 2.5]) for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4;
      near = Math.max(near, T.height(cx + Math.sin(ang) * r, cz + Math.cos(ang) * r));
    }
    if (near > -20) cy = Math.max(cy, near + 1.7);
    // and nothing in the bottom of the picture just ahead of the lens: obstacles (ledges, hips,
    // kickers, rails) within 6 m in front stay under the lower edge of the view
    const dx = x - cx, dz = z - cz, dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl;
    for (let d = 0.6; d <= 6.6; d += 0.6) {
      if (d > dl - 1.5) break;
      // across the width of the picture too (the portrait view is about ±0.34 · d wide)
      for (const side of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const px = cx + ux * d - uz * side * d, pz = cz + uz * d + ux * side * d;
        let h = T.height(px, pz);
        for (const sg of this.park.segs) {
          if (px < Math.min(sg.ax, sg.bx) - 0.5 || px > Math.max(sg.ax, sg.bx) + 0.5 || pz < Math.min(sg.az, sg.bz) - 0.5 || pz > Math.max(sg.az, sg.bz) + 0.5) continue;
          const r = onSeg(sg, px, pz);
          if (r.d < 0.5) h = Math.max(h, r.y + 0.1);
        }
        // only things standing up from the floor the rider is on (not the floor itself)
        if (h > floor + 0.3) cy = Math.max(cy, Math.min(cap, h + 0.6 + d * 0.92));
      }
    }
    for (const k of LOS_STEPS) {
      const h = T.height(x + (cx - x) * k, z + (cz - z) * k);
      if (h < -20) continue;
      const lineY = y + (cy - y) * k;
      if (h + 0.6 > lineY) cy = Math.max(cy, Math.min(cap, y + (h + 0.6 - y) / k));
    }
    return cy;
  }

  /** Where the side view of a vert air sits: out over the flat and to one side of the lip. */
  private vertCamPos(a: NonNullable<Sim['air']>, side: number): [number, number, number] {
    const tx = -a.uz * side, tz = a.ux * side;
    return [a.lipX - a.ux * 7.5 + tx * 7.5, a.lipY + 1.7, a.lipZ - a.uz * 7.5 + tz * 7.5];
  }

  /** The side of the lip with the clearer view (then the one nearer the camera now). */
  private pickSide(a: NonNullable<Sim['air']>, sim: Sim): number {
    let best = 1, bestScore = Infinity;
    for (const side of [1, -1]) {
      const [cx, cy, cz] = this.vertCamPos(a, side);
      let blocked = 0;
      for (let k = 0.1; k <= 1.001; k += 0.1) {
        const h = this.park.terrain.height(sim.x + (cx - sim.x) * k, sim.z + (cz - sim.z) * k);
        if (h > a.lipY + 0.8 + (cy - a.lipY - 0.8) * k - 0.3) blocked++;
      }
      const score = blocked * 10 + Math.hypot(cx - this.camPos.x, cz - this.camPos.z) * 0.1;
      if (score < bestScore) { bestScore = score; best = side; }
    }
    return best;
  }

  /** Puts the camera straight behind the skater (a new session, a respawn). */
  snapCamera(): void { this.snap = true; }

  // ------------------------------------------------------------------ effects

  private effects(sim: Sim, dt: number, sdt: number): void {
    const sk = this.skater, bw = sk.boardWorld;
    // grind sparks and the special glow
    if (sim.state === 'grind') {
      const g = sim.grind!;
      const metal = g.seg.rail.kind === 'rail';
      const n = g.special ? 7 : metal ? 5 : 2;
      for (let i = 0; i < n; i++) {
        if (Math.random() > sdt * 60) continue;
        const back = -Math.sin(sim.heading), backZ = -Math.cos(sim.heading);
        // the board's own spark colour mixes into a metal rail's sparks
        const own = sk.boardDef.spark;
        const c = g.special ? [0x9fe8ff, 0xffffff, 0xff8af0][i % 3] : metal ? [own ?? 0xffd27a, 0xffffff, own ?? 0xff9a3c][i % 3] : 0xd8d0c0;
        this.sparks.emit(bw.x, sim.y + 0.02, bw.z, back * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, backZ * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, 0.35 + Math.random() * 0.3, metal ? 0.22 : 0.26, 0.03, c, 1, 9, 0.06);
      }
    }
    // speed dust off the wheels
    if ((sim.state === 'ground' || sim.state === 'manual') && Math.abs(sim.speed) > 9 && Math.random() < dt * 20) {
      this.dust.emit(sim.x + (Math.random() - 0.5) * 0.6, sim.y + 0.1, sim.z + (Math.random() - 0.5) * 0.6, 0, 0.4, 0, 0.5, 0.3, 0.8, sim.surf === 'wood' ? 0xd9b08a : 0xc8c8d0, 2);
    }
    // the special meter is full: the rider glows
    this.halo.begin(this.camQ);
    if (sim.specialReady && sim.state !== 'bail') {
      const p = 0.75 + 0.25 * Math.sin(this.t * 8);
      this.halo.add(sk.chest.x, sk.chest.y - 0.3, sk.chest.z, 2.6 * p, 2.6 * p, 0, 0xffc23a, 0.45);
      if (Math.random() < dt * 25) this.glows.emit(sk.chest.x + (Math.random() - 0.5) * 0.8, sk.chest.y - 0.6, sk.chest.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, 0.6, 0.3, 0.05, Math.random() < 0.5 ? 0xffd23f : 0xff8a3d, 0.5);
    }
    // a board with a trail leaves a short glowing ribbon of sparkles in the air
    const trail = sk.boardDef.trail;
    if (trail !== undefined && sim.state === 'air' && Math.random() < sdt * 70) {
      this.glows.emit(bw.x + (Math.random() - 0.5) * 0.3, bw.y - 0.05, bw.z + (Math.random() - 0.5) * 0.3, -sim.vx * 0.15, -0.2, -sim.vz * 0.15, 0.45, 0.28, 0.04, Math.random() < 0.3 ? 0xffffff : trail, 0.4);
    }
    if (sim.state === 'air' && sim.air?.flip?.special) {
      for (let i = 0; i < 3; i++) this.glows.emit(bw.x, bw.y, bw.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5, 0.5, 0.05, [0x9fe8ff, 0xff8af0, 0xffffff][i], 1.5);
    }
    // tapes glow
    this.park.tapes.forEach(([x, y, z], i) => {
      if (sim.tapes[i]) return;
      this.halo.add(x, y, z, 1.6 + 0.2 * Math.sin(this.t * 4 + i), 1.6 + 0.2 * Math.sin(this.t * 4 + i), 0, 0xff6fd8, 0.6);
    });
    this.halo.end();
    // rings and flashes
    this.rings.begin(this.camQ);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.max) { this.flashes.splice(i, 1); continue; }
      const k = f.t / f.max;
      this.rings.add(f.x, f.y, f.z, f.s * (0.3 + k), f.s * (0.3 + k), 0, f.c, 1 - k);
    }
    this.rings.end();
    this.sparks.update(dt, this.camQ, this.world.camera.position);
    this.glows.update(dt, this.camQ, this.world.camera.position);
    this.dust.update(dt, this.camQ, this.world.camera.position);
  }

  ring(x: number, y: number, z: number, s: number, c: number, max = 0.45): void {
    this.flashes.push({ x, y: y + 0.05, z, s, t: 0, max, c });
  }

  /** Visuals for a simulation event (the Play scene adds sound and HUD). */
  handle(ev: SimEvent, sim: Sim): void {
    const x = sim.x, y = sim.y, z = sim.z;
    switch (ev.type) {
      case 'ollie':
        this.dust.burst(x, y + 0.1, z, 6, 1.6, [0xd8d4cc], 0.45, 0.45, { up: 0.6 });
        break;
      case 'land': {
        const big = ev.impact > 6;
        this.dust.burst(x, y + 0.08, z, big ? 16 : 8, big ? 3.2 : 2, [ev.surf === 'wood' ? 0xd9b08a : 0xd0ccc4], 0.6, big ? 0.7 : 0.5, { up: 0.5 });
        if (big) { this.ring(x, y, z, 3.4, 0xffffff, 0.4); this.shake(0.12 + Math.min(0.25, ev.impact * 0.02), 0.25); }
        break;
      }
      case 'bail':
        this.skater.bail(sim);
        this.dust.burst(x, y + 0.2, z, 18, 3.5, [0xd8d4cc, 0xbab6ae], 0.8, 0.8, { up: 0.8 });
        this.shake(0.45, 0.4);
        break;
      case 'recover':
        this.snap = sim.y < this.park.fallY + 3 ? true : this.snap;
        break;
      case 'grindStart':
        this.sparks.burst(x, y + 0.05, z, ev.kind === 'rail' ? 18 : 8, 4, ev.kind === 'rail' ? [0xffd27a, 0xffffff] : [0xd8d0c0], 0.35, 0.16, { grav: 9, stretch: 0.05 });
        break;
      case 'tape':
        this.tapeTaken[ev.i] = true;
        this.glows.burst(ev.x, ev.y, ev.z, 36, 6, [0xff6fd8, 0xffd23f, 0x9fe8ff, 0xffffff], 0.8, 0.45);
        this.ring(ev.x, ev.y - 0.4, ev.z, 3.5, 0xff6fd8, 0.5);
        break;
      case 'special':
        this.glows.burst(x, y + 1, z, 40, 7, [0xffd23f, 0xff8af0, 0x9fe8ff], 0.7, 0.5);
        this.zoomPunch(1);
        break;
      case 'combo':
        if (ev.score >= 3000) {
          this.glows.burst(x, y + 1.2, z, Math.min(60, 14 + ev.score / 400), 6, [0xffd23f, 0xffffff, 0x7dffa0], 0.8, 0.4, { up: 2 });
          this.cheer(ev.score);
        }
        break;
      case 'goal':
        this.glows.burst(x, y + 1.4, z, 50, 8, [0xffd23f, 0x7dffa0, 0x9fe8ff, 0xff6fd8], 1, 0.5, { up: 3 });
        this.cheer(99999);
        break;
      case 'wall':
        if (ev.speed > 4) this.shake(0.15, 0.2);
        break;
    }
  }

  /** The crowd cheers (Timber Yard). */
  cheer(score: number): void {
    const n = Math.min(this.fans.length, Math.ceil(score / 2500));
    for (let i = 0; i < n; i++) {
      const f = this.fans[(i * 2 + Math.floor(this.t)) % this.fans.length];
      if (!f.cheer || f.cheerT > 0) continue;
      f.idle?.fadeOut(0.2);
      f.cheer.reset().fadeIn(0.2).play();
      f.cheerT = 1.6 + Math.random() * 0.8;
    }
  }

  get hasCrowd(): boolean { return this.fans.length > 0; }

  /** Projects a world point to game pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    return this.world.toScreen(this.v.set(x, y, z));
  }

  reset(): void {
    this.sparks.clear(); this.dust.clear(); this.glows.clear();
    this.flashes.length = 0;
    this.tapeTaken = this.park.tapes.map(() => false);
    this.snap = true;
  }
}

/** A cassette tape: label, reels and window. */
function tapeTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 84;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2a2433'; g.fillRect(0, 0, 128, 84);
  g.fillStyle = '#ff6fd8'; g.fillRect(8, 8, 112, 46);
  g.fillStyle = '#ffd23f'; g.fillRect(8, 8, 112, 10);
  g.fillStyle = '#ffffff'; g.fillRect(30, 26, 68, 20);
  g.fillStyle = '#2a2433';
  for (const x of [44, 84]) { g.beginPath(); g.arc(x, 36, 8, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff';
  for (const x of [44, 84]) { g.beginPath(); g.arc(x, 36, 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#4a4058'; g.fillRect(28, 62, 72, 16);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ shader warm-up

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive (a World3D frees its materials on
 * shutdown, which drops their programs): compiles a copy of every material and object kind into a
 * keeper scene that is never freed, so the Play scene's first frame finds them ready.
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
      const key = kind + ':' + mat.type + ':' + JSON.stringify([!!a.map, !!a.vertexColors, a.transparent, a.blending, a.side, a.fog, !!a.emissive && a.emissive.getHex() > 0, m.receiveShadow, m.castShadow]);
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      let k: THREE.Object3D;
      if (skinned) {
        // a whole copy of the rigged model, so the skinning variant compiles
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
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}
