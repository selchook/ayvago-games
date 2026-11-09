import { Phaser, ArcadeScene, Controls, CarSteering, shake, flash, popup, t, rng } from '@core';
import { World3D, THREE, model, grounded } from '@core/three';

// A lane-based track of floating blocks, driven along -z.
const TILE = 1.6;
const LANES = [-TILE, 0, TILE];
const AHEAD = 46;       // rows kept in front of the car
const BEHIND = 6;
const EDGE = TILE * 1.5 - 0.42;   // how far the car may steer from the centre
const GRAVITY = 26;
const JUMP_V = 8.2;
const START_LIVES = 3;
const CAR_HALF_W = 0.36;
const CAR_HALF_L = 0.62;
/** Sideways speed at full lock (keys, arrows, the wheel or the phone's tilt). */
const STEER_SPEED = 7.5;
/**
 * Phone tilt for full lock. Lower than a racing game's 24 degrees: a lane change wants a quick,
 * small turn, and a tall portrait phone is awkward to turn far like a wheel.
 */
const TILT_LOCK = 18;

type ObjKind = 'coin' | 'crate' | 'spikes' | 'heart';

interface Obj {
  kind: ObjKind;
  lane: number;
  y: number;
  mesh: THREE.Object3D;
  done: boolean;
}

interface Row {
  i: number;
  solid: boolean[];
  blocks: THREE.Object3D[];
  objs: Obj[];
}

interface RowPlan {
  solid: boolean[];
  objs: { kind: ObjKind; lane: number; y?: number }[];
}

export class PlayScene extends ArcadeScene {
  private world!: World3D;
  private controls!: Controls;
  private steering!: CarSteering;
  private car!: THREE.Group;
  private body!: THREE.Object3D;
  private wheels: THREE.Object3D[] = [];
  private rows = new Map<number, Row>();
  private plan: RowPlan[] = [];
  private nextRow = 0;
  private clouds: THREE.Mesh[] = [];
  private islands: THREE.Object3D[] = [];
  private shards: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];

  private x = 0;
  private y = 0;
  private z = 0;
  private vx = 0;
  private vy = 0;
  private speed = 11;
  private airborne = false;
  private falling = false;
  private lives = START_LIVES;
  private coins = 0;
  private level = 1;
  private invuln = 0;
  private respawnAt = 0;
  private upWasDown = false;

  createGame(): void {
    this.rows = new Map();
    this.plan = [];
    this.nextRow = 0;
    this.clouds = [];
    this.islands = [];
    this.shards = [];
    this.wheels = [];
    this.x = this.y = this.z = this.vx = this.vy = 0;
    this.speed = 11;
    this.airborne = this.falling = false;
    this.lives = START_LIVES;
    this.coins = 0;
    this.level = 1;
    this.invuln = 0;
    this.respawnAt = 0;
    this.upWasDown = false;

    this.world = new World3D(this, { fov: 62, background: 0x8fd3ff, fog: { color: 0xbfe6ff, near: 26, far: 70 } });
    this.world.addLights({ sky: 0xeaf6ff, ground: 0x8a7a64, ambient: 1.7, intensity: 2.4, dir: [-0.6, 1, 0.35], extent: 16 });
    // keys from the core (arrows / WASD, Space / Z / Enter); on touch screens the shared car pad:
    // the steering chosen on the menu under the left thumb, a big JUMP button under the right one
    this.controls = new Controls(this, {});
    const { width, height } = this.scale;
    this.steering = new CarSteering(this, {
      touch: this.controls.touchUi,
      buttons: [{ id: 'jump', shape: 'round', x: width - 136, y: height - 130, r: 96, color: 0xec3013, label: t('jump'), labelY: 34, labelSize: 26, icon: 'up', hit: 34 }],
      tiltLock: TILT_LOCK,
      // the car already eases its sideways speed, so keys and arrows give full lock at once
      ramp: false,
    });
    this.steering.begin();
    this.steering.centre();
    this.hud.setLives(this.lives, START_LIVES);
    this.hud.setLevel(this.level);

    // the car
    const carModel = model('car');
    this.body = carModel;
    carModel.traverse((o) => { if (o.name.startsWith('wheel')) this.wheels.push(o); });
    this.car = grounded(carModel);
    this.car.scale.setScalar(0.62);
    this.world.scene.add(this.car);

    this.makeClouds();
    for (let i = 0; i < 12; i++) this.plan.push({ solid: [true, true, true], objs: [] });
    this.ensureRows();
    this.placeCamera(1);
  }

  // ---------------------------------------------------------------- track generation

  private blockTemplate(): THREE.Object3D {
    const b = grounded(model('block'));
    const s = TILE / 1.27;
    b.scale.set(s, s, s);
    return b;
  }

  private planChunk(): void {
    const d = Math.min(1, this.z / -900);   // 0 → 1 over the first ~900 m
    const roll = Math.random();
    const full = (): boolean[] => [true, true, true];
    const rows: RowPlan[] = [];
    if (roll < 0.22) {
      // straight with a line of coins
      const n = rng.int(5, 8), lane = rng.int(0, 2);
      for (let k = 0; k < n; k++) rows.push({ solid: full(), objs: [{ kind: 'coin', lane }] });
      if (Math.random() < 0.18 && this.lives < START_LIVES) rows[n - 1].objs = [{ kind: 'heart', lane }];
    } else if (roll < 0.45) {
      // missing lanes: one or two lanes drop away for a stretch
      const n = rng.int(4, 6 + Math.round(d * 4));
      const keep = rng.int(0, 2);
      const two = Math.random() < 0.3 + d * 0.4;
      for (let k = 0; k < n; k++) {
        const solid = [0, 1, 2].map((l) => l === keep || (!two && l === (keep + 1) % 3));
        rows.push({ solid, objs: k % 2 ? [{ kind: 'coin', lane: keep }] : [] });
      }
      rows.unshift({ solid: full(), objs: [] });
    } else if (roll < 0.75) {
      // obstacles: crates and spikes, always one free lane
      const n = rng.int(7, 11);
      for (let k = 0; k < n; k++) {
        const objs: RowPlan['objs'] = [];
        if (k % (d > 0.5 ? 2 : 3) === 1) {
          const lanes = rng.shuffle([0, 1, 2]);
          const count = Math.random() < 0.25 + d * 0.45 ? 2 : 1;
          for (let c = 0; c < count; c++) objs.push({ kind: Math.random() < 0.6 ? 'crate' : 'spikes', lane: lanes[c] });
          objs.push({ kind: 'coin', lane: lanes[2] });
        }
        rows.push({ solid: full(), objs });
      }
    } else {
      // a gap across the whole road: jump it, with coins on the arc
      const airRows = Math.floor((this.speed * (2 * JUMP_V / GRAVITY)) / TILE);
      const gap = Phaser.Math.Clamp(rng.int(2, 2 + Math.round(d * 2)), 2, Math.max(2, airRows - 2));
      const lane = rng.int(0, 2);
      rows.push({ solid: full(), objs: [] }, { solid: full(), objs: [] });
      for (let k = 0; k < gap; k++) {
        const f = (k + 1) / (gap + 1);
        rows.push({ solid: [false, false, false], objs: [{ kind: 'coin', lane, y: 0.6 + Math.sin(f * Math.PI) * 1.6 }] });
      }
      rows.push({ solid: full(), objs: [] }, { solid: full(), objs: [] });
    }
    this.plan.push(...rows);
  }

  private ensureRows(): void {
    const carRow = Math.round(-this.z / TILE);
    while (this.nextRow <= carRow + AHEAD) {
      if (!this.plan.length) this.planChunk();
      this.buildRow(this.nextRow++, this.plan.shift()!);
    }
    for (const [i, row] of this.rows) {
      if (i < carRow - BEHIND) {
        row.blocks.forEach((b) => this.world.scene.remove(b));
        row.objs.forEach((o) => this.world.scene.remove(o.mesh));
        this.rows.delete(i);
      }
    }
  }

  private buildRow(i: number, p: RowPlan): void {
    const z = -i * TILE;
    const row: Row = { i, solid: p.solid, blocks: [], objs: [] };
    p.solid.forEach((s, l) => {
      if (!s) return;
      const b = this.blockTemplate();
      b.position.set(LANES[l], -TILE / 1.27, z);
      // a little height jitter on the edges reads as hand-built
      if (l !== 1 && Math.random() < 0.15) b.position.y -= 0.04;
      this.world.scene.add(b);
      row.blocks.push(b);
    });
    for (const o of p.objs) {
      const mesh = this.objMesh(o.kind);
      const y = o.y ?? (o.kind === 'coin' || o.kind === 'heart' ? 0.55 : 0);
      mesh.position.set(LANES[o.lane], y, z);
      this.world.scene.add(mesh);
      row.objs.push({ kind: o.kind, lane: o.lane, y, mesh, done: false });
    }
    this.rows.set(i, row);
    // floating islands with trees at the sides now and then
    if (i % 9 === 0 && i > 0) this.addIsland(z);
  }

  private objMesh(kind: ObjKind): THREE.Object3D {
    const key = kind === 'coin' ? 'coin' : kind;
    const m = grounded(model(key));
    const scale = { coin: 2, crate: 1.5, spikes: 1.5, heart: 2.2 }[kind];
    m.scale.setScalar(scale);
    if (kind === 'crate') m.rotation.y = (Math.random() - 0.5) * 0.4;
    return m;
  }

  private addIsland(z: number): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const g = new THREE.Group();
    const base = this.blockTemplate();
    base.scale.multiplyScalar(1.4);
    g.add(base);
    const top = grounded(model(Math.random() < 0.7 ? 'tree' : 'rocks'));
    top.scale.setScalar(1.6);
    top.position.y = TILE / 1.27 * 1.4;
    g.add(top);
    g.position.set(side * (6 + Math.random() * 4), -2.5 + Math.random() * 2.5, z - Math.random() * 4);
    this.world.scene.add(g);
    this.islands.push(g);
    this.tweens.addCounter({
      from: 0, to: Math.PI * 2, duration: 4000 + Math.random() * 3000, repeat: -1,
      onUpdate: (tw) => { g.position.y += Math.sin(tw.getValue() ?? 0) * 0.003; },
    });
  }

  private makeClouds(): void {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Mesh(geo, mat);
      c.scale.set(3 + Math.random() * 5, 1 + Math.random() * 1.2, 2.5 + Math.random() * 3);
      c.position.set((Math.random() - 0.5) * 50, -9 - Math.random() * 8, -Math.random() * 90);
      this.world.scene.add(c);
      this.clouds.push(c);
    }
  }

  // ---------------------------------------------------------------- play

  private groundAt(x: number, z: number): boolean {
    const row = this.rows.get(Math.round(-z / TILE));
    if (!row) return false;
    const lane = Math.round(x / TILE) + 1;
    if (lane < 0 || lane > 2 || Math.abs(x - LANES[lane]) > TILE / 2 + 0.05) return false;
    return row.solid[lane];
  }

  /** The car stands if any of its four corners is over a block. */
  private supported(): boolean {
    for (const dx of [-CAR_HALF_W, CAR_HALF_W]) for (const dz of [-CAR_HALF_L, CAR_HALF_L]) if (this.groundAt(this.x + dx, this.z + dz)) return true;
    return false;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.steering.update(dt);
    // read every frame, so a tap during a respawn does not jump later
    const padJump = this.steering.take('jump');
    this.updateShards(dt);
    for (const row of this.rows.values()) {
      for (const o of row.objs) if (!o.done && (o.kind === 'coin' || o.kind === 'heart')) o.mesh.rotation.y += dt * 3.2;
    }

    if (this.respawnAt > 0) {
      this.respawnAt -= dt;
      if (this.respawnAt <= 0) this.respawn();
      this.placeCamera(dt);
      return;
    }

    // speed rises with distance; a new level every 250 m
    const dist = -this.z;
    this.speed = 11 + Math.min(15, dist / 55);
    const lvl = 1 + Math.floor(dist / 250);
    if (lvl !== this.level) {
      this.level = lvl;
      this.hud.setLevel(lvl);
      this.sfx('level', { exact: true });
      popup(this, this.scale.width / 2, 260, t('levelUp'), '#ffd23f', 40);
    }

    // steering
    const target = this.steering.steer(dt, this.controls.axisX) * STEER_SPEED;
    this.vx += (target - this.vx) * Math.min(1, dt * 10);
    this.x = Phaser.Math.Clamp(this.x + this.vx * dt, -EDGE, EDGE);
    this.z -= this.speed * dt;

    // jump: A (Space / Z / Enter), Up or the JUMP button
    const up = this.controls.up;
    const jump = this.controls.justA() || (up && !this.upWasDown) || padJump;
    this.upWasDown = up;
    if (jump && !this.airborne && !this.falling) {
      this.vy = JUMP_V;
      this.airborne = true;
      this.sfx('jump');
    }

    if (this.airborne || this.falling) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (!this.falling && this.y <= 0 && this.vy < 0) {
        if (this.supported()) {
          this.y = 0;
          this.vy = 0;
          this.airborne = false;
          this.sfx('land');
          this.squash();
        } else {
          this.startFall();
        }
      }
    } else if (!this.supported()) {
      this.startFall();
      this.vy = 0;
    }
    if (this.falling && this.y < -6) this.loseLife(false);

    this.collide();
    this.ensureRows();
    this.recycleScenery();
    this.poseCar(dt);
    this.placeCamera(dt);
    this.setScore(Math.floor(dist / TILE) + this.coins * 10);
  }

  private startFall(): void {
    this.falling = true;
    this.sfx('fall');
  }

  private collide(): void {
    const ri = Math.round(-this.z / TILE);
    for (const i of [ri - 1, ri, ri + 1]) {
      const row = this.rows.get(i);
      if (!row) continue;
      for (const o of row.objs) {
        if (o.done) continue;
        const dz = Math.abs(o.mesh.position.z - this.z);
        const dx = Math.abs(o.mesh.position.x - this.x);
        if (o.kind === 'coin' || o.kind === 'heart') {
          if (dz < 0.9 && dx < 0.85 && Math.abs(this.y + 0.3 - o.y) < 1.1) this.collect(o);
        } else if (dz < CAR_HALF_L + 0.3 && dx < CAR_HALF_W + 0.42 && this.invuln <= 0) {
          const h = o.kind === 'crate' ? 0.8 : 0.3;
          if (this.y < h) this.crash(o);
        }
      }
    }
  }

  private collect(o: Obj): void {
    o.done = true;
    const p = this.world.toScreen(o.mesh.position.clone().setY(o.y + 0.4));
    this.world.scene.remove(o.mesh);
    if (o.kind === 'heart') {
      this.lives = Math.min(START_LIVES, this.lives + 1);
      this.hud.setLives(this.lives, START_LIVES);
      this.sfx('heart');
      popup(this, p.x, p.y, '+1 ♥', '#ff5d8f', 34);
      return;
    }
    this.coins++;
    this.sfx('coin', { volume: 0.6 });
    popup(this, p.x, p.y, '+10', '#ffd23f', 26);
  }

  private crash(o: Obj): void {
    o.done = true;
    this.world.scene.remove(o.mesh);
    this.burst3d(o.mesh.position, o.kind === 'crate' ? 0xc0813f : 0x9aa4b1);
    this.sfx('crash');
    this.loseLife(true);
  }

  private loseLife(hit: boolean): void {
    if (this.isOver) return;
    this.lives--;
    this.hud.setLives(this.lives, START_LIVES);
    shake(this, 0.012, 260);
    flash(this, 0xff4d6d, 160, 0.35);
    if (this.lives <= 0) {
      this.steering.end();
      this.endGame({ delay: 900 });
      this.respawnAt = 99;   // freeze the car while the result screen comes up
      return;
    }
    if (hit) {
      this.invuln = 1.6;
    } else {
      this.respawnAt = 0.6;
    }
  }

  private respawn(): void {
    // drop back in over the next solid stretch
    let i = Math.round(-this.z / TILE) + 2;
    for (let k = 0; k < 30; k++, i++) {
      const row = this.rows.get(i), next = this.rows.get(i + 1);
      if (row && next) {
        const lane = [1, 0, 2].find((l) => row.solid[l] && next.solid[l] && !row.objs.some((o) => o.lane === l && (o.kind === 'crate' || o.kind === 'spikes')));
        if (lane !== undefined) {
          this.x = LANES[lane];
          this.z = -i * TILE;
          break;
        }
      }
    }
    this.y = 2.2;
    this.vy = 0;
    this.vx = 0;
    this.falling = false;
    this.airborne = true;
    this.invuln = 1.6;
    this.sfx('respawn');
  }

  private squash(): void {
    this.tweens.addCounter({
      from: 0, to: 1, duration: 220,
      onUpdate: (tw) => {
        const k = Math.sin((tw.getValue() ?? 0) * Math.PI) * 0.18;
        this.body.scale.set(1 + k * 0.5, 1 - k, 1 + k * 0.5);
      },
      onComplete: () => this.body.scale.set(1, 1, 1),
    });
  }

  private poseCar(dt: number): void {
    this.car.position.set(this.x, this.y, this.z);
    this.car.rotation.z = -this.vx * 0.035;
    this.car.rotation.y = -this.vx * 0.05;
    this.car.rotation.x = this.airborne || this.falling ? Phaser.Math.Clamp(this.vy * 0.03, -0.35, 0.3) : 0;
    for (const w of this.wheels) w.rotation.x -= (this.speed * dt) / 0.3;
    if (this.invuln > 0) {
      this.invuln -= dt;
      this.car.visible = this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0;
    } else {
      this.car.visible = true;
    }
    this.world.followSun(new THREE.Vector3(this.x, 0, this.z - 4));
  }

  private placeCamera(dt: number): void {
    const cam = this.world.camera;
    const want = new THREE.Vector3(this.x * 0.55, 3.4 + Math.max(0, this.y) * 0.35, this.z + 5.6);
    cam.position.lerp(want, Math.min(1, dt * 6));
    cam.lookAt(this.x * 0.7, 0.4 + Math.max(0, this.y) * 0.3, this.z - 7);
    const fov = 60 + (this.speed - 11) * 0.55;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 2);
      cam.updateProjectionMatrix();
    }
  }

  private recycleScenery(): void {
    for (const c of this.clouds) {
      if (c.position.z > this.z + 10) {
        c.position.z -= 95;
        c.position.x = (Math.random() - 0.5) * 50;
      }
    }
    this.islands = this.islands.filter((g) => {
      if (g.position.z > this.z + 12) {
        this.world.scene.remove(g);
        return false;
      }
      return true;
    });
  }

  private burst3d(at: THREE.Vector3, color: number): void {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshLambertMaterial({ color });
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(at).add(new THREE.Vector3(0, 0.4, 0));
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6 - this.speed * 0.4);
      this.world.scene.add(m);
      this.shards.push({ m, v, life: 0.9 });
    }
  }

  private updateShards(dt: number): void {
    this.shards = this.shards.filter((s) => {
      s.life -= dt;
      s.v.y -= GRAVITY * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += dt * 8;
      s.m.rotation.y += dt * 6;
      if (s.life > 0) return true;
      this.world.scene.remove(s.m);
      return false;
    });
  }
}
