import { Phaser, ArcadeScene, Controls, shake, flash, popup, t, loc, txt, storage } from '@core';
import { World3D, THREE, model, grounded } from '@core/three';
import { LAYOUTS, Track } from './tracks';
import { buildArena, type Arena } from './scenery';
import { Particles } from './particles';
import { Truck, TRUCK_R, turnFactor, type DriveInput, type Stats, type StepEvents } from './truck';
import { SURF_MUD, SURF_PUDDLE, SURF_BERM, SURF_GRASS } from './terrain';
import { ResultsPanel, ShopPanel, MAX_LEVEL, price, type Upgrade, type ResultRow } from './panels';
import { money, ordinal } from './strings';
import { matte } from './look';
import { TouchPad } from './touch';
import { SkidMarks } from './marks';

const LAPS = 4;
const NCP = 4;                 // checkpoints per lap (besides the line)
const START_LIVES = 3;
const PRIZES = [10000, 6000, 3000, 0];
const BASE_TOP = 13.5;
const BASE_ACCEL = 15;
const NITRO_TIME = 1.6;
/** AI: steering gain (steer per radian of heading error) and corner speed margin. */
const AI_STEER_GAIN = 3;
const AI_CORNER = 0.85;
const FOV = 38;
const CAM_POS = new THREE.Vector3(0, 47, 30.5);
const CAM_LOOK = new THREE.Vector3(0, 0, 1.6);
const PLAYER_COLOR = 0x2f7dff;
/** Storage key: the controls hint has been shown once (first race only). */
const HINT_KEY = 'mud-rally:controlsHint';
const RIVALS = [
  { model: 'suvLux', color: 0xe8402f, name: 'driverRed' },
  { model: 'truck', color: 0xf5c52b, name: 'driverYellow' },
  { model: 'truckFlat', color: 0x35c46a, name: 'driverGreen' },
];

type Phase = 'intro' | 'count' | 'race' | 'finish' | 'results' | 'shop';

interface Pickup {
  kind: 'cash' | 'nitro';
  obj: THREE.Object3D;
  x: number;
  z: number;
  y: number;
  alive: boolean;
  t: number;
}

export class PlayScene extends ArcadeScene {
  private world!: World3D;
  private controls!: Controls;
  private trucks: Truck[] = [];
  private player!: Truck;
  private names = new Map<Truck, string>();
  private arena: Arena | null = null;
  private track!: Track;
  private dust!: Particles;
  private glow!: Particles;
  private marker!: THREE.Mesh;
  private pickups: Pickup[] = [];
  private pickupT = 0;
  private nitroSpawned = 0;
  private wrongT = 0;
  private wrongShown = -9;
  private dtNow = 0;
  private dustAcc = new Map<Truck, number>();
  private aiDelay = new Map<Truck, number>();
  private touch: TouchPad | null = null;
  private marks!: SkidMarks;
  private steerIn = 0;
  private wrongArrow!: THREE.Mesh;
  private hint: Phaser.GameObjects.Container | null = null;
  private skidCd = 0;
  private wasBraking = false;
  private fovKick = 0;

  private phase: Phase = 'intro';
  private phaseT = 0;
  private count = 0;
  private raceNo = 0;
  private raceTime = 0;
  private lateT = -1;
  private finishOrder: Truck[] = [];
  private lives = START_LIVES;
  private bank = 0;
  private earned = 0;
  private raceCash = 0;
  private levels: Record<Upgrade, number> = { engine: 0, tires: 0, shocks: 0, nitro: 0 };
  private camShake = 0;
  private centerText = '';
  private engine: Phaser.Sound.BaseSound | null = null;
  private nitroText!: Phaser.GameObjects.Text;
  private nitroIcon!: Phaser.GameObjects.Container;
  private shown = -1;

  createGame(): void {
    this.trucks = [];
    this.names = new Map();
    this.arena = null;
    this.pickups = [];
    this.pickupT = 0;
    this.nitroSpawned = 0;
    this.wrongT = 0;
    this.wrongShown = -9;
    this.dustAcc = new Map();
    this.aiDelay = new Map();
    this.steerIn = 0;
    this.hint = null;
    this.skidCd = 0;
    this.wasBraking = false;
    this.fovKick = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.count = 0;
    this.raceNo = 0;
    this.raceTime = 0;
    this.lateT = -1;
    this.finishOrder = [];
    this.lives = START_LIVES;
    this.bank = 0;
    this.earned = 0;
    this.raceCash = 0;
    this.levels = { engine: 0, tires: 0, shocks: 0, nitro: 0 };
    this.camShake = 0;
    this.centerText = '';
    this.shown = -1;

    this.world = new World3D(this, { fov: FOV, background: 0x9fd0ff, fog: { color: 0xb9dcf5, near: 70, far: 150 } });
    const sun = this.world.addLights({ sky: 0xeaf6ff, ground: 0x8a6a4a, ambient: 1.55, intensity: 2.5, dir: [-0.45, 1, 0.5], extent: 40 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far = 140;
    this.world.camera.position.copy(CAM_POS);
    this.world.camera.lookAt(CAM_LOOK);
    // keys from the core (arrows / WASD, Space / Z / Enter); on touch screens the scene draws its
    // own car controls (steer left / right, GAS, BRAKE, NITRO) instead of the stick
    this.controls = new Controls(this, {});
    this.touch = this.controls.touchUi ? new TouchPad(this) : null;

    this.dust = new Particles(900, false, this.scale.height, FOV);
    this.glow = new Particles(320, true, this.scale.height, FOV);
    this.marks = new SkidMarks();
    this.world.scene.add(this.marks.mesh, this.dust.points, this.glow.points);

    this.player = new Truck('suv', PLAYER_COLOR, true);
    this.trucks.push(this.player);
    this.names.set(this.player, t('you'));
    for (const r of RIVALS) {
      const tr = new Truck(r.model, r.color, false);
      this.trucks.push(tr);
      this.names.set(tr, t(r.name));
    }
    for (const tr of this.trucks) this.world.scene.add(tr.root, tr.blob);

    // a bobbing arrow over the player's truck
    const mgeo = new THREE.ConeGeometry(0.42, 0.9, 4);
    mgeo.rotateX(Math.PI);
    const mmat = new THREE.MeshLambertMaterial({ color: 0x3ee6ff, emissive: 0x1a6a80 });
    this.marker = new THREE.Mesh(mgeo, mmat);
    this.marker.userData.ownMaterial = true;
    this.world.scene.add(this.marker);

    // wrong way: a red arrow on the ground under the player, pointing the way the race goes
    const shape = new THREE.Shape();
    shape.moveTo(1.6, 0).lineTo(0.1, 1.25).lineTo(0.1, 0.5).lineTo(-1.4, 0.5).lineTo(-1.4, -0.5).lineTo(0.1, -0.5).lineTo(0.1, -1.25).closePath();
    const ageo = new THREE.ShapeGeometry(shape);
    ageo.rotateX(-Math.PI / 2);
    this.wrongArrow = new THREE.Mesh(ageo, new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.wrongArrow.userData.ownMaterial = true;
    this.wrongArrow.renderOrder = 2;
    this.wrongArrow.visible = false;
    this.world.scene.add(this.wrongArrow);

    this.buildNitroHud();
    this.hud.setLives(this.lives, START_LIVES);
    this.setScore(0);

    if (this.cache.audio.exists('engine')) {
      this.engine = this.sound.add('engine', { loop: true, volume: 0 });
      try { this.engine.play(); } catch { /* audio locked */ }
    }
    const onPause = () => this.engine?.pause();
    const onResume = () => this.engine?.resume();
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.engine?.stop();
      this.engine?.destroy();
      this.engine = null;
      this.arena?.dispose();
      this.arena = null;
      this.dust.dispose();
      this.glow.dispose();
      this.marks.dispose();
      mgeo.dispose();
      ageo.dispose();
    });

    this.startRace();
  }

  // ---------------------------------------------------------------- races

  private stats(tr: Truck): Stats {
    if (tr.isPlayer && !tr.finished) {
      const L = this.levels;
      return {
        top: BASE_TOP * (1 + 0.075 * L.engine),
        accel: BASE_ACCEL * (1 + 0.1 * L.engine),
        grip: 7 + 1.6 * L.tires,
        turn: 3.5 + 0.1 * L.tires,
        shocks: 0.14 * L.shocks,
      };
    }
    // rubber band: a little faster behind the player, a little slower ahead
    const gap = this.key(this.player) - this.key(tr);
    const rb = tr.isPlayer ? 1 : Phaser.Math.Clamp(1 + gap * 0.004, 0.9, 1.12);
    return {
      top: BASE_TOP * tr.skill * rb,
      accel: BASE_ACCEL * (0.92 + 0.12 * tr.skill),
      grip: Math.min(13, 8 + this.raceNo * 0.35),
      turn: 3.5,
      shocks: 0.3,
    };
  }

  private startRace(): void {
    this.raceNo++;
    const layout = LAYOUTS[(this.raceNo - 1) % LAYOUTS.length];
    this.track = new Track(layout);
    if (this.arena) {
      this.world.scene.remove(this.arena.group);
      this.arena.dispose();
    }
    this.arena = buildArena(this.track, this.raceNo * 7 + 3);
    this.world.scene.add(this.arena.group);
    for (const p of this.pickups) this.world.scene.remove(p.obj);
    this.pickups = [];
    this.dust.clear();
    this.glow.clear();
    this.marks.clear();
    this.finishOrder = [];
    this.raceTime = 0;
    this.lateT = -1;
    this.raceCash = 0;

    // the starting grid, behind the line: rivals by speed, the player on the second row
    const tk = this.track, hw = tk.half, terrain = this.arena.terrain;
    // race 1 is a gentle start for the car controls; the field gets faster every race after
    const base = Math.min(1.26, 0.86 + 0.047 * (this.raceNo - 1));
    const rivals = this.trucks.filter((x) => !x.isPlayer);
    rivals.forEach((r, i) => {
      r.skill = base - i * 0.035;
      r.lane = [-0.3, 0.28, 0.02][i] * hw;
      r.phase = Math.random() * 6;
      r.nitro = Math.min(3, 1 + Math.floor((this.raceNo - 1) / 2));
      r.aiNitroCd = 3 + Math.random() * 4;
    });
    const order = [rivals[0], rivals[1], this.player, rivals[2]];
    const slots: [number, number][] = [[-3.4, 0.42], [-3.4, -0.42], [-8.6, 0.42], [-8.6, -0.42]];
    order.forEach((tr, i) => {
      const p = tk.pointAt(slots[i][0], slots[i][1] * hw);
      tr.place(p.x, p.z, Math.atan2(p.tz, p.tx), terrain);
      tr.near = tk.nearest(p.x, p.z);
      tr.s = tr.near.s;
      tr.lapsDone = -1;
      tr.cpNext = NCP;
      tr.finished = false;
      tr.finishTime = 0;
      tr.pose(1, terrain);
      this.dustAcc.set(tr, 0);
    });
    this.player.nitro = 1 + this.levels.nitro;
    this.shown = -1;
    this.updateNitroHud();
    this.nitroIcon.setVisible(!this.touch);
    this.touch?.setVisible(true);
    this.steerIn = 0;
    this.wrongT = 0;
    this.nitroSpawned = 0;

    for (let k = 0; k < 3; k++) this.spawnPickup('cash');
    this.spawnPickup('nitro');
    this.pickupT = 4;

    this.phase = 'intro';
    this.phaseT = 0;
    this.count = 0;
    this.hud.setLevel(this.raceNo);
    this.setCenter('');
    this.world.camera.position.set(CAM_POS.x - 26, CAM_POS.y - 22, CAM_POS.z + 20);
    this.world.camera.lookAt(CAM_LOOK);
    this.banner(t('raceN', { n: this.raceNo }), loc(layout.name));
    if (this.raceNo === 1 && !storage.get<boolean>(HINT_KEY, false)) this.showHint();
  }

  /** The first race ever: how the car controls work, over the grid until the start. */
  private showHint(): void {
    const c = this.add.container(0, 0).setDepth(7100).setScrollFactor(0);
    const pill = (x: number, y: number, w: number, h: number) =>
      this.add.graphics().fillStyle(0x0b1020, 0.72).fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2)
        .lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    if (this.touch) {
      const a = TouchPad.anchors;
      const steer = txt(this, a.steer.x, a.steer.y - 34, t('hintSteer'), { title: true, size: 26, color: '#ffd23f', strokeThickness: 6 });
      const ped = txt(this, a.pedals.x, a.pedals.y - 50, t('hintPedals'), { size: 22, color: '#ffffff', strokeThickness: 6, wrap: 400 });
      c.add([pill(a.steer.x, a.steer.y - 34, steer.width + 44, 52), steer, pill(a.pedals.x, a.pedals.y - 50, ped.width + 44, ped.height + 22), ped]);
      this.touch.pulse();
    } else {
      // key caps: arrows drawn as triangles (they read the same in every font)
      const cap = (x: number, y: number, w: number, dir: number | null, label = '') => {
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.35).fillRoundedRect(x - w / 2, y - 21, w, 48, 10);
        g.fillStyle(0xf3f2f2, 1).fillRoundedRect(x - w / 2, y - 24, w, 46, 10);
        g.fillStyle(0x24324a, 1);
        if (dir !== null) {
          const ux = Math.cos(dir), uy = Math.sin(dir);
          g.fillTriangle(x + ux * 11, y - 1 + uy * 11, x - ux * 8 - uy * 10, y - 1 - uy * 8 + ux * 10, x - ux * 8 + uy * 10, y - 1 - uy * 8 - ux * 10);
        }
        c.add(g);
        if (label) c.add(txt(this, x, y - 1, label, { title: true, size: 16, color: '#24324a', strokeThickness: 0 }));
      };
      // laid out left to right from the label widths, then centred
      const y = 520;
      const groups: [Array<number | string>, string][] = [
        [[Math.PI, 0], t('hintSteer')], [[-Math.PI / 2], t('gas')], [[Math.PI / 2], t('hintBrake')], [[t('keySpace')], t('nitroUp')],
      ];
      const labels = groups.map(([, l]) => txt(this, 0, y, l, { title: true, size: 22, color: '#ffd23f', strokeThickness: 0 }).setOrigin(0, 0.5));
      const capW = (k: number | string) => (typeof k === 'string' ? 34 + k.length * 12 : 46);
      const widths = groups.map(([keys], i) => keys.reduce<number>((w, k) => w + capW(k) + 6, 0) + 8 + labels[i].width);
      const gap = 44;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (groups.length - 1);
      c.add(pill(640, y + 2, total + 64, 96));
      let x = 640 - total / 2;
      groups.forEach(([keys], i) => {
        for (const k of keys) {
          const w = capW(k);
          if (typeof k === 'string') cap(x + w / 2, y, w, null, k);
          else cap(x + w / 2, y, w, k);
          x += w + 6;
        }
        labels[i].setX(x + 8);
        c.add(labels[i]);
        x += 8 + labels[i].width + gap;
      });
    }
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 300, delay: 600 });
    this.hint = c;
  }

  private dropHint(): void {
    const c = this.hint;
    if (!c) return;
    this.hint = null;
    storage.set(HINT_KEY, true);
    this.tweens.add({ targets: c, alpha: 0, duration: 400, delay: 900, onComplete: () => c.destroy() });
  }

  private banner(title: string, sub: string): void {
    const { width } = this.scale;
    const a = txt(this, width / 2, 250, title, { title: true, size: 64, color: '#ffd23f', strokeThickness: 10 }).setDepth(7000);
    const b = txt(this, width / 2, 320, sub, { title: true, size: 34, color: '#ffffff', strokeThickness: 8 }).setDepth(7000);
    for (const [o, d] of [[a, 0], [b, 120]] as const) {
      o.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 360, delay: d, ease: 'Back.easeOut' });
      this.tweens.add({ targets: o, alpha: 0, y: o.y - 30, duration: 300, delay: 1500 + d, onComplete: () => o.destroy() });
    }
  }

  private shout(s: string, color = '#ffd23f', size = 120, hold = 520): void {
    const { width } = this.scale;
    const o = txt(this, width / 2, 300, s, { title: true, size, color, strokeThickness: 12 }).setDepth(7000);
    o.setScale(1.8).setAlpha(0);
    this.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: o, scale: 0.7, alpha: 0, duration: 260, delay: hold, onComplete: () => o.destroy() });
  }

  private setCenter(s: string): void {
    if (s === this.centerText) return;
    this.centerText = s;
    this.hud.setCenter(s);
  }

  // ---------------------------------------------------------------- update

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.phaseT += dt;
    const terrain = this.arena!.terrain;
    this.touch?.update();

    if (this.phase === 'intro') {
      const k = Phaser.Math.Easing.Cubic.InOut(Math.min(1, this.phaseT / 1.7));
      this.world.camera.position.set(CAM_POS.x - 26 * (1 - k), CAM_POS.y - 22 * (1 - k), CAM_POS.z + 20 * (1 - k));
      this.world.camera.lookAt(CAM_LOOK);
      if (this.phaseT >= 1.9) {
        this.phase = 'count';
        this.phaseT = 0;
        this.count = 0;
      }
    }
    if (this.phase === 'count') {
      const n = Math.floor(this.phaseT / 0.85);
      if (n >= this.count && this.count <= 3) {
        if (this.count < 3) {
          this.shout(String(3 - this.count), '#ffd23f', 130, 420);
          this.sfx('beep', { exact: true, volume: 0.8 });
        } else {
          this.shout(t('go'), '#7dff9a', 120, 380);
          this.sfx('beep', { exact: true, rate: 1.6, volume: 0.9 });
          this.sfx('go', { volume: 0.6 });
          this.phase = 'race';
          this.phaseT = 0;
          for (const tr of this.trucks) if (!tr.isPlayer) this.aiDelay.set(tr, 0.05 + Math.random() * 0.3);
          this.dropHint();
        }
        this.count++;
      }
      this.updateLapHud();
    }

    if (this.phase === 'race' || this.phase === 'finish') this.simulate(dt, terrain);
    else {
      for (const tr of this.trucks) {
        // revving on the grid
        tr.pose(dt, terrain);
      }
    }

    // pickups spin and bob
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.t += dt;
      p.obj.rotation.y += dt * (p.kind === 'cash' ? 3 : 1.4);
      p.obj.position.y = p.y + Math.sin(p.t * 3) * 0.15;
    }

    this.dust.update(dt);
    this.glow.update(dt);
    this.marks.update(dt);
    this.updateEngine();
    this.updateMarker();
    this.updateCamera(dt);
  }

  private simulate(dt: number, terrain: Arena['terrain']): void {
    this.raceTime += dt;
    this.dtNow = dt;
    const tk = this.track;
    for (const tr of this.trucks) {
      let input: DriveInput;
      if (tr.isPlayer && !tr.finished) input = this.playerInput(dt);
      else input = this.aiInput(tr, dt);
      const ev = tr.drive(dt, input, this.stats(tr), terrain, tk);
      this.onEvents(tr, ev);
    }
    this.collideTrucks();
    for (const tr of this.trucks) {
      this.progress(tr);
      tr.pose(dt, terrain);
      this.emitDust(tr, dt);
    }
    this.updatePickups(dt);
    this.updateLapHud();

    if (this.phase === 'finish' && this.phaseT > 2.6) this.finalize();
    if (this.phase === 'race') {
      if (this.lateT >= 0) {
        this.lateT -= dt;
        if (this.lateT < 0) this.finalize();
      } else if (this.raceTime > 300) this.finalize();
    }
  }

  private playerInput(dt: number): DriveInput {
    const c = this.controls, tp = this.touch, tr = this.player;
    const keyNitro = c.justA();
    const padNitro = tp?.takeNitro() ?? false;
    if ((keyNitro || padNitro) && tr.nitro > 0 && tr.nitroT <= 0) this.fireNitro(tr);
    // car controls, relative to the truck: left / right turn it, up is gas, down brakes and
    // reverses once stopped. The wheel follows the keys quickly but not at once, so a tap is a
    // small correction and a held key is full lock.
    const want = tp && tp.steer !== 0 ? tp.steer : Math.sign(c.axisX) * (Math.abs(c.axisX) > 0.3 ? 1 : 0);
    const back = want === 0 || Math.sign(want) !== Math.sign(this.steerIn);
    const step = (back ? 9 : 5.5) * dt;
    this.steerIn += Phaser.Math.Clamp(want - this.steerIn, -step, step);
    const gas = c.axisY < -0.3 || !!tp?.gas;
    const brake = c.axisY > 0.3 || !!tp?.brake;
    return { steer: this.steerIn, throttle: brake ? -1 : gas ? 1 : 0 };
  }

  /** The AI picks a point to drive at, then steers and uses the pedals under the player's rules. */
  private aiInput(tr: Truck, dt: number): DriveInput {
    const delay = this.aiDelay.get(tr) ?? 0;
    if (delay > 0) {
      this.aiDelay.set(tr, delay - dt);
      return { steer: 0, throttle: 0 };
    }
    const tk = this.track, hw = tk.half;
    const sp = tr.speed;
    const look = 4.5 + sp * 0.42;
    const ahead = 6 + sp * 0.9;
    const turn = tk.turnAhead(tr.s, ahead);
    const wander = Math.sin(this.raceTime * 0.45 + tr.phase) * 0.2 * hw;
    const lane = Phaser.Math.Clamp(tr.lane + wander, -(hw - 1.4), hw - 1.4);
    let target = tk.pointAt(tr.s + look, lane);
    // go for a nitro can (or now and then a coin) just ahead
    for (const p of this.pickups) {
      if (!p.alive || (p.kind === 'cash' && tr.phase > 3)) continue;
      const n = tk.nearest(p.x, p.z, tr.near.i, 60);
      let ds = n.s - tr.s;
      if (ds < -tk.length / 2) ds += tk.length;
      if (ds > 2.5 && ds < look + 3 && turn < 0.9) {
        target = { x: p.x, z: p.z, tx: 0, tz: 0 };
        break;
      }
    }
    const angle = Math.atan2(target.z - tr.z, target.x - tr.x);
    const diff = Math.atan2(Math.sin(angle - tr.heading), Math.cos(angle - tr.heading));
    const st = this.stats(tr);
    // the fastest speed that still makes the bend ahead at this truck's turn rate
    const radius = ahead / Math.max(0.05, turn);
    const want = Math.min(st.top, Math.max(5, radius * st.turn * turnFactor(st.top) * AI_CORNER));
    const vf = tr.forward;
    tr.aiNitroCd -= dt;
    if (this.phase === 'race' && !tr.isPlayer && tr.nitro > 0 && tr.nitroT <= 0 && tr.aiNitroCd <= 0 && turn < 0.3 && !tr.airborne && Math.random() < dt * 0.9) {
      this.fireNitro(tr);
      tr.aiNitroCd = 5 + Math.random() * 5;
    }
    // steering: proportional to the angle still to turn, full lock beyond about 20 degrees
    const steer = Phaser.Math.Clamp(diff * AI_STEER_GAIN, -1, 1);
    let throttle = vf < want ? 1 : 0;
    if (Math.abs(diff) > 1.9) throttle *= 0.35;   // facing the wrong way: slow down and turn first
    return { steer, throttle, brake: vf > want + 1.2 };
  }

  private fireNitro(tr: Truck): void {
    tr.nitro--;
    tr.nitroT = NITRO_TIME;
    const p = this.world.toScreen(new THREE.Vector3(tr.x, tr.y, tr.z));
    this.sfxAt('nitro', p.x, { volume: tr.isPlayer ? 0.75 : 0.35 });
    if (tr.isPlayer) {
      this.updateNitroHud();
      popup(this, p.x, p.y - 40, t('nitroGo'), '#ffb02e', 30);
      this.camShake = Math.max(this.camShake, 0.18);
      this.fovKick = 1;
    }
    for (let k = 0; k < 14; k++) {
      const e = tr.local((Math.random() - 0.5) * 0.6, 1.25, 0.5);
      this.glow.emit({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.4, size: 1.3, grow: 0.2, color: 0xff9a2a, alpha: 0.9 });
    }
  }

  private onEvents(tr: Truck, ev: StepEvents): void {
    const near = tr.isPlayer;
    const sx = () => this.world.toScreen(new THREE.Vector3(tr.x, tr.y, tr.z)).x;
    if (ev.launched) {
      if (near || Math.random() < 0.5) this.sfxAt('jump', sx(), { volume: near ? 0.55 : 0.25 });
      for (let k = 0; k < 6; k++) {
        const e = tr.local((Math.random() - 0.5) * 1.4, 1, 0);
        this.dust.emit({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 0.8, size: 0.8, grow: 2.2, color: 0xd8b48a, alpha: 0.55, drag: 2 });
      }
    }
    if (ev.landed > 0) {
      const big = ev.landed > 6;
      if (big || near) this.sfxAt('land', sx(), { volume: near ? 0.8 : 0.35 });
      const n = big ? 22 : 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const sp = 2 + Math.random() * 2.5;
        this.dust.emit({ x: tr.x + Math.cos(a) * 0.8, y: tr.y + 0.15, z: tr.z + Math.sin(a) * 0.8, vx: Math.cos(a) * sp, vy: 0.6 + Math.random(), vz: Math.sin(a) * sp, life: 0.9 + Math.random() * 0.5, size: 0.9, grow: 2.6, color: 0xd8b48a, alpha: 0.6, drag: 2.4 });
      }
      if (near && big) {
        this.camShake = Math.max(this.camShake, Math.min(0.55, ev.landed * 0.05));
        tr.surface === SURF_MUD && this.mudSplash(tr, 18);
      }
    }
    if (ev.wall > 0) {
      if (near || ev.wall > 6) this.sfxAt('wall', sx(), { volume: near ? 0.6 : 0.25 });
      for (let k = 0; k < 8; k++) {
        this.glow.emit({ x: tr.x, y: tr.y + 0.5, z: tr.z, vx: (Math.random() - 0.5) * 7, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 7, life: 0.35, size: 0.35, grow: 0.1, color: 0xffd36b, gravity: 14 });
        this.dust.emit({ x: tr.x, y: tr.y + 0.2, z: tr.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 3, life: 0.9, size: 1, grow: 2.4, color: 0xc28d5c, alpha: 0.6, drag: 2 });
      }
      if (near && ev.wall > 4) this.camShake = Math.max(this.camShake, Math.min(0.45, ev.wall * 0.05));
    }
  }

  private collideTrucks(): void {
    const T = this.trucks;
    for (let i = 0; i < T.length; i++) {
      for (let j = i + 1; j < T.length; j++) {
        const a = T[i], b = T[j];
        if (Math.abs(a.y - b.y) > 1.2) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = TRUCK_R * 2;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d, push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vrel > 0) {
          const imp = vrel * 0.8;
          a.vx -= nx * imp * 0.5; a.vz -= nz * imp * 0.5;
          b.vx += nx * imp * 0.5; b.vz += nz * imp * 0.5;
          if (vrel > 2.2) {
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2 + 0.6;
            const sx = this.world.toScreen(new THREE.Vector3(mx, my, mz)).x;
            const mine = a.isPlayer || b.isPlayer;
            this.sfxAt('bump', sx, { volume: mine ? 0.7 : 0.3 });
            for (let k = 0; k < 7; k++) {
              this.glow.emit({ x: mx, y: my, z: mz, vx: (Math.random() - 0.5) * 6, vy: 1.5 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.3, size: 0.3, grow: 0.1, color: 0xfff1a8, gravity: 12 });
            }
            if (mine && vrel > 4) this.camShake = Math.max(this.camShake, 0.2);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- laps and places

  private key(tr: Truck): number {
    return tr.finished ? 1e6 - tr.finishTime : tr.lapsDone * this.track.length + tr.s;
  }

  private progress(tr: Truck): void {
    const tk = this.track, L = tk.length;
    const prev = tr.s;
    tr.near = tk.nearest(tr.x, tr.z, tr.near.i);
    const s = tr.near.s;
    let ds = s - prev;
    if (ds > L / 2) ds -= L;
    if (ds < -L / 2) ds += L;
    tr.s = s;
    if (Math.abs(ds) > 6) return;   // the tracker jumped (a cut across the infield): no credit
    if (tr.isPlayer && this.phase === 'race') {
      // driving the wrong way round for a while gets a warning
      this.wrongT = ds < -0.02 && tr.speed > 3 ? this.wrongT + this.dtNow : Math.max(0, this.wrongT - this.dtNow * 2);
      if (this.wrongT > 1.2 && this.elapsed - this.wrongShown > 2.5) {
        this.wrongShown = this.elapsed;
        this.shout(t('wrongWay'), '#ff6b6b', 60, 900);
        this.sfx('nope', { volume: 0.5 });
      }
    }
    if (ds > 0 && prev > s) {
      // forwards over the line: a lap counts only with every checkpoint passed
      if (tr.cpNext === NCP) {
        tr.lapsDone++;
        tr.cpNext = 0;
        this.onLap(tr);
      } else if (tr.isPlayer && tr.lapsDone >= 0) {
        this.shout(t('missedCp'), '#ff6b6b', 40, 1300);
        this.sfx('nope', { volume: 0.6 });
      }
    } else if (ds < 0 && prev < s) {
      if (tr.cpNext === 0 && tr.lapsDone >= 0) {
        tr.lapsDone--;
        tr.cpNext = NCP;
      }
    } else {
      for (let i = 0; i < NCP; i++) {
        const cp = (L * (i + 1)) / (NCP + 1);
        if (ds > 0 && prev < cp && s >= cp && tr.cpNext === i) tr.cpNext = i + 1;
        if (ds < 0 && s < cp && prev >= cp && tr.cpNext === i + 1) tr.cpNext = i;
      }
    }
  }

  private onLap(tr: Truck): void {
    if (tr.finished) return;
    if (tr.lapsDone >= LAPS) {
      tr.finished = true;
      tr.finishTime = this.raceTime;
      this.finishOrder.push(tr);
      const place = this.finishOrder.length;
      if (tr.isPlayer) {
        this.phase = 'finish';
        this.phaseT = 0;
        this.lateT = -1;
        this.shout(t('placeShout', { p: ordinal(place) }), place === 1 ? '#ffd23f' : place < 4 ? '#ffffff' : '#ff7a7a', 76, 1400);
        this.sfx(place < 4 ? 'finish' : 'lose', { exact: true, volume: 0.8 });
        if (place === 1) {
          flash(this, 0xffffff, 200, 0.3);
          for (let k = 0; k < 40; k++) {
            const e = { x: tr.x, y: tr.y + 1, z: tr.z };
            this.glow.emit({ ...e, vx: (Math.random() - 0.5) * 9, vy: 4 + Math.random() * 6, vz: (Math.random() - 0.5) * 9, life: 1.1, size: 0.5, grow: 0.2, color: [0xffd23f, 0x3ee6ff, 0xff4fa3, 0x7dff9a][k % 4], gravity: 10 });
          }
        }
      } else if (!this.player.finished && this.finishOrder.length >= 3) {
        this.lateT = 2.2;
      }
      return;
    }
    if (tr.isPlayer && tr.lapsDone >= 1) {
      const lap = tr.lapsDone + 1;
      this.shout(lap === LAPS ? t('finalLap') : t('lapN', { n: lap }), lap === LAPS ? '#ff9f43' : '#ffffff', 64, 700);
      this.sfx('lap', { exact: true, volume: 0.7 });
    }
  }

  private standings(): Truck[] {
    return [...this.trucks].sort((a, b) => this.key(b) - this.key(a));
  }

  private updateLapHud(): void {
    const order = this.standings();
    const place = order.indexOf(this.player) + 1;
    const lap = Phaser.Math.Clamp(this.player.lapsDone + 1, 1, LAPS);
    this.setCenter(`${t('lap')} ${lap}/${LAPS} · ${ordinal(place)}`);
  }

  private finalize(): void {
    if (this.phase === 'results' || this.phase === 'shop') return;
    const L = this.track.length;
    const rest = this.standings().filter((x) => !x.finished);
    for (const tr of rest) {
      const left = Math.max(0, LAPS * L - (tr.lapsDone * L + tr.s));
      tr.finishTime = this.raceTime + left / (BASE_TOP * 0.8);
      this.finishOrder.push(tr);
    }
    // estimated times must not beat real ones
    for (let i = 1; i < this.finishOrder.length; i++) {
      const a = this.finishOrder[i - 1], b = this.finishOrder[i];
      if (b.finishTime <= a.finishTime) b.finishTime = a.finishTime + 0.4 + Math.random() * 0.6;
    }
    const mult = 1 + 0.15 * (this.raceNo - 1);
    const rows: ResultRow[] = this.finishOrder.map((tr, i) => ({
      name: this.names.get(tr) ?? '',
      color: tr.color,
      time: tr.finishTime,
      prize: Math.round(PRIZES[i] * mult),
      player: tr.isPlayer,
    }));
    const place = this.finishOrder.indexOf(this.player) + 1;
    const prize = rows[place - 1].prize;
    this.earned += prize;
    this.bank += prize;
    this.setScore(this.earned);
    let note = '';
    if (place === 4) {
      this.lives--;
      this.hud.setLives(this.lives, START_LIVES);
      note = this.lives === 1 ? t('lastLife') : this.lives > 1 ? t('lostLife') : '';
      shake(this, 0.01, 260);
      if (this.lives <= 0) note = t('lostLife');
    }
    this.phase = 'results';
    this.phaseT = 0;
    this.player.nitroT = 0;
    for (const tr of this.trucks) {
      tr.vx = tr.vz = 0;
      tr.nitroT = 0;
    }
    this.setCenter('');
    this.nitroIcon.setVisible(false);
    this.touch?.setVisible(false);
    this.wrongArrow.visible = false;
    new ResultsPanel(this, this.raceNo, rows, this.raceCash, prize + this.raceCash, note, () => {
      if (this.lives <= 0) {
        this.endGame({ title: t('champOver'), delay: 200 });
        return;
      }
      this.openShop();
    });
  }

  private openShop(): void {
    this.phase = 'shop';
    const next = LAYOUTS[this.raceNo % LAYOUTS.length];
    const state = { bank: this.bank, levels: this.levels, nextTrack: t('nextTrack', { name: loc(next.name) }), touch: !!this.touch };
    new ShopPanel(this, state, (u) => {
      const lvl = this.levels[u];
      const p = price(u, lvl);
      if (lvl >= MAX_LEVEL || this.bank < p) {
        this.sfx('nope', { volume: 0.6 });
        if (lvl < MAX_LEVEL) popup(this, 640, 210, t('noMoney'), '#ff7a7a', 28);
        return false;
      }
      this.bank -= p;
      state.bank = this.bank;
      this.levels[u] = lvl + 1;
      this.sfx('buy', { volume: 0.7 });
      return true;
    }, () => this.startRace());
  }

  // ---------------------------------------------------------------- pickups

  private spawnPickup(kind: Pickup['kind']): void {
    const tk = this.track, terrain = this.arena!.terrain;
    let x = 0, z = 0;
    for (let tries = 0; tries < 30; tries++) {
      const s = Math.random() * tk.length;
      if (s > tk.length - 14 || s < 4) continue;
      const p = tk.pointAt(s, (Math.random() * 2 - 1) * (tk.half - 1.4));
      if (this.pickups.some((o) => o.alive && Math.hypot(o.x - p.x, o.z - p.z) < 7)) continue;
      if (this.trucks.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 5)) continue;
      x = p.x; z = p.z;
      break;
    }
    if (!x && !z) return;
    let obj: THREE.Object3D;
    if (kind === 'cash') {
      const m = matte(model('coin'));
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(mat.name === 'gold' ? 0x6a4a00 : 0x2a1a00);
        mesh.material = mat;
        mesh.userData.ownMaterial = true;
      });
      obj = grounded(m);
      obj.scale.setScalar(3.8);
    } else {
      const m = matte(model('barrel'));
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (mat.name === 'wood') mat.color.setHex(0xe8402f);
        else if (mat.name === 'woodDark') mat.color.setHex(0x9a2418);
        else mat.color.setHex(0xffd23f);
        mat.emissive = new THREE.Color(0x3a0a00);
        mesh.material = mat;
        mesh.userData.ownMaterial = true;
      });
      obj = grounded(m);
      obj.scale.setScalar(2.3);
    }
    const y = terrain.heightAt(x, z) + (kind === 'cash' ? 0.35 : 0.2);
    obj.position.set(x, y, z);
    const s0 = obj.scale.x;
    obj.scale.setScalar(0.01);
    this.tweens.add({ targets: obj.scale, x: s0, y: s0, z: s0, duration: 380, ease: 'Back.easeOut' });
    this.world.scene.add(obj);
    this.pickups.push({ kind, obj, x, z, y, alive: true, t: Math.random() * 6 });
  }

  private updatePickups(dt: number): void {
    for (const p of this.pickups) {
      if (!p.alive) continue;
      for (const tr of this.trucks) {
        if (Math.hypot(tr.x - p.x, tr.z - p.z) > 1.7 || tr.y > p.y + 1.6) continue;
        this.collect(p, tr);
        break;
      }
    }
    this.pickups = this.pickups.filter((p) => p.alive || p.obj.parent);
    this.pickupT -= dt;
    if (this.pickupT <= 0 && this.phase === 'race') {
      this.pickupT = 3 + Math.random() * 2;
      const alive = this.pickups.filter((p) => p.alive);
      const cash = alive.filter((p) => p.kind === 'cash').length;
      const nitro = alive.length - cash;
      if (nitro === 0 && this.nitroSpawned < 2 + Math.floor(this.raceNo / 3) && Math.random() < 0.3) {
        this.nitroSpawned++;
        this.spawnPickup('nitro');
      }
      else if (cash < 4) this.spawnPickup('cash');
    }
  }

  private collect(p: Pickup, tr: Truck): void {
    p.alive = false;
    const obj = p.obj;
    this.tweens.add({ targets: obj.position, y: p.y + 1.8, duration: 260, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: obj.scale, x: 0.01, y: 0.01, z: 0.01, duration: 260, ease: 'Back.easeIn', onComplete: () => this.world.scene.remove(obj) });
    const color = p.kind === 'cash' ? 0xffd23f : 0xff7a2a;
    for (let k = 0; k < 12; k++) {
      this.glow.emit({ x: p.x, y: p.y + 0.6, z: p.z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.6, size: 0.6, grow: 0.1, color, gravity: 8 });
    }
    if (p.kind === 'nitro') tr.nitro = Math.min(9, tr.nitro + 1);
    if (!tr.isPlayer) return;
    const sc = this.world.toScreen(new THREE.Vector3(p.x, p.y + 1, p.z));
    if (p.kind === 'cash') {
      const v = Math.round((500 * (1 + 0.15 * (this.raceNo - 1))) / 50) * 50;
      this.raceCash += v;
      this.earned += v;
      this.bank += v;
      this.setScore(this.earned);
      this.sfxAt('cash', sc.x, { volume: 0.7 });
      popup(this, sc.x, sc.y, '+' + money(v), '#ffd23f', 26);
    } else {
      this.updateNitroHud();
      this.sfxAt('nitroPick', sc.x, { volume: 0.7 });
      popup(this, sc.x, sc.y, '+1 ' + t('nitroUp'), '#ff9f43', 26);
      this.tweens.add({ targets: this.nitroIcon, scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    }
  }

  // ---------------------------------------------------------------- effects

  private emitDust(tr: Truck, dt: number): void {
    const sp = tr.speed;
    if (tr.nitroT > 0) {
      for (let k = 0; k < 2; k++) {
        const e = tr.local((Math.random() - 0.5) * 0.25, 1.35, 0.62);
        const fx = Math.cos(tr.heading), fz = Math.sin(tr.heading);
        this.glow.emit({ x: e.x, y: e.y, z: e.z, vx: -fx * 5 + (Math.random() - 0.5), vy: Math.random() * 0.8, vz: -fz * 5 + (Math.random() - 0.5), life: 0.28, size: 1.0, grow: 0.25, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, alpha: 0.95 });
      }
    }
    const surf = tr.surface;
    this.skidMarks(tr, dt);
    if (tr.airborne || sp < 2) return;
    // a slide throws up more dirt than rolling straight
    const slideDust = tr.slip > 2.5 && surf !== SURF_PUDDLE ? tr.slip * 1.6 : 0;
    const rate = sp * (surf === SURF_MUD ? 2.2 : surf === SURF_PUDDLE ? 2.6 : 1.1) + slideDust;
    let acc = (this.dustAcc.get(tr) ?? 0) + rate * dt;
    const fx = Math.cos(tr.heading), fz = Math.sin(tr.heading);
    while (acc >= 1) {
      acc -= 1;
      const side = Math.random() < 0.5 ? -0.62 : 0.62;
      const e = tr.local(side, 0.95, 0.12);
      const r = () => Math.random() - 0.5;
      if (surf === SURF_MUD) {
        this.dust.emit({ x: e.x, y: e.y, z: e.z, vx: -fx * sp * 0.25 + r() * 3 + side * fz * -2, vy: 2.5 + Math.random() * 3, vz: -fz * sp * 0.25 + r() * 3 + side * fx * 2, life: 0.55, size: 0.38, grow: 0.3, color: Math.random() < 0.5 ? 0x4a2c16 : 0x6b4224, alpha: 1, gravity: 16 });
        if (Math.random() < 0.3) this.dust.emit({ x: e.x, y: e.y, z: e.z, vx: r(), vy: 0.3, vz: r(), life: 1.2, size: 0.8, grow: 1.6, color: 0x5a3a22, alpha: 0.45, drag: 2 });
      } else if (surf === SURF_PUDDLE) {
        const out = side > 0 ? 1 : -1;
        this.dust.emit({ x: e.x, y: e.y + 0.1, z: e.z, vx: -fz * out * -3.5 + r() * 2 - fx * 1.5, vy: 3 + Math.random() * 2.5, vz: fx * out * 3.5 + r() * 2 - fz * 1.5, life: 0.5, size: 0.35, grow: 0.15, color: 0xe2f1ff, alpha: 0.9, gravity: 15 });
        if (tr.isPlayer && Math.random() < 0.05) this.sfx('splash', { volume: 0.25, rate: 1.5 });
      } else if (surf === SURF_BERM || surf === SURF_GRASS) {
        this.dust.emit({ x: e.x, y: e.y, z: e.z, vx: -fx * 2 + r() * 2, vy: 1.5 + Math.random() * 2, vz: -fz * 2 + r() * 2, life: 0.6, size: 0.4, grow: 0.5, color: 0x7a6a3a, alpha: 0.9, gravity: 10 });
      } else {
        this.dust.emit({ x: e.x, y: e.y, z: e.z, vx: -fx * sp * 0.12 + r() * 1.2, vy: 0.5 + Math.random() * 0.9, vz: -fz * sp * 0.12 + r() * 1.2, life: 0.9 + Math.random() * 0.6, size: 0.75, grow: 2.6, color: Math.random() < 0.5 ? 0xdcb88e : 0xc9a072, alpha: 0.5, drag: 1.6 });
      }
    }
    this.dustAcc.set(tr, acc);
  }

  /** Tyre marks under the rear wheels while a truck slides or brakes hard, and the screech. */
  private skidMarks(tr: Truck, dt: number): void {
    const id = this.trucks.indexOf(tr);
    const surf = tr.surface;
    const sliding = !tr.airborne && surf !== SURF_PUDDLE && surf !== SURF_GRASS && (tr.slip > 2.6 || tr.braking);
    if (!sliding) {
      if (tr.airborne) { this.marks.lift(id + 'l'); this.marks.lift(id + 'r'); }
      if (tr.isPlayer) this.wasBraking = false;
      return;
    }
    const k = tr.braking ? 0.85 : Phaser.Math.Clamp((tr.slip - 2.6) / 4, 0.3, 1);
    const strength = k * (surf === SURF_MUD ? 1.3 : surf === SURF_BERM ? 0.7 : 1);
    for (const side of [-0.6, 0.6]) {
      const w = tr.local(side, 0.85, 0);
      this.marks.mark(id + (side < 0 ? 'l' : 'r'), w.x, w.y, w.z, strength, surf === SURF_MUD ? 0.42 : 0.3);
    }
    if (!tr.isPlayer) return;
    this.skidCd -= dt;
    const start = (tr.braking && !this.wasBraking && tr.speed > 7) || (!tr.braking && tr.slip > 4.5);
    this.wasBraking = tr.braking;
    if (start && this.skidCd <= 0 && surf !== SURF_MUD) {
      this.skidCd = tr.braking ? 0.9 : 2.2;
      const x = this.world.toScreen(new THREE.Vector3(tr.x, tr.y, tr.z)).x;
      this.sfxAt('skid', x, { volume: tr.braking ? 0.45 : 0.3 });
    }
  }

  private mudSplash(tr: Truck, n: number): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      this.dust.emit({ x: tr.x, y: tr.y + 0.3, z: tr.z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 4, vz: Math.sin(a) * sp, life: 0.7, size: 0.45, grow: 0.3, color: 0x4a2c16, alpha: 1, gravity: 16 });
    }
    this.sfx('splash', { volume: 0.4 });
  }

  private updateEngine(): void {
    const e = this.engine as Phaser.Sound.WebAudioSound | null;
    if (!e) return;
    const tr = this.player;
    const racing = this.phase === 'race' || this.phase === 'finish' || this.phase === 'count' || this.phase === 'intro';
    const top = BASE_TOP * (1 + 0.075 * this.levels.engine);
    let k = Phaser.Math.Clamp(tr.speed / top, 0, 1.5);
    if (this.phase === 'count' || this.phase === 'intro') k = this.controls.axisY < -0.3 || this.touch?.gas ? 0.7 : 0;
    const rate = 0.7 + k * 0.8 + (tr.nitroT > 0 ? 0.2 : 0) + (tr.airborne ? 0.15 : 0);
    try {
      e.setRate(rate);
      e.setVolume(racing ? 0.07 + k * 0.05 : 0.025);
    } catch { /* not started */ }
  }

  private updateMarker(): void {
    const tr = this.player;
    this.marker.position.set(tr.x, tr.y + 2.6 + Math.sin(performance.now() / 220) * 0.2, tr.z);
    this.marker.rotation.y += 0.05;
    this.marker.visible = this.phase !== 'results' && this.phase !== 'shop';
    // wrong way: the ground arrow shows which way the race goes
    const show = this.phase === 'race' && this.wrongT > 0.5 && !tr.finished;
    this.wrongArrow.visible = show;
    if (show) {
      const p = this.track.sampleAt(tr.s);
      const pulse = 1.4 + Math.sin(performance.now() / 120) * 0.15;
      this.wrongArrow.position.set(tr.x + p.tx * 2.4, this.arena!.terrain.heightAt(tr.x + p.tx * 2.4, tr.z + p.tz * 2.4) + 0.12, tr.z + p.tz * 2.4);
      this.wrongArrow.rotation.y = Math.atan2(-p.tz, p.tx);
      this.wrongArrow.scale.setScalar(pulse);
    }
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'intro') return;
    const cam = this.world.camera;
    this.camShake *= Math.exp(-dt * 7);
    const a = this.camShake;
    cam.position.set(CAM_POS.x + (Math.random() - 0.5) * a, CAM_POS.y + (Math.random() - 0.5) * a, CAM_POS.z + (Math.random() - 0.5) * a);
    // nitro: a short widening of the lens, eased back while the boost lasts
    this.fovKick *= Math.exp(-dt * (this.player.nitroT > 0 ? 1.2 : 4));
    const fov = FOV + this.fovKick * 2.2;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(CAM_LOOK.x + (Math.random() - 0.5) * a * 0.5, CAM_LOOK.y, CAM_LOOK.z + (Math.random() - 0.5) * a * 0.5);
  }

  // ---------------------------------------------------------------- HUD

  private buildNitroHud(): void {
    const { height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(0x0b1020, 0.55).fillRoundedRect(-30, -30, 132, 60, 30);
    g.lineStyle(2, 0xffffff, 0.3).strokeRoundedRect(-30, -30, 132, 60, 30);
    g.fillStyle(0xe8402f).fillRoundedRect(-12, -18, 24, 36, 7);
    g.fillStyle(0x9a2418).fillRect(-5, -24, 10, 7);
    g.fillStyle(0xffd23f).fillTriangle(-6, 3, 2, -11, 0, 0).fillTriangle(6, -3, -2, 11, 0, 0);
    this.nitroText = txt(this, 24, 1, '', { title: true, size: 28, color: '#ffffff' }).setOrigin(0, 0.5);
    this.nitroIcon = this.add.container(58, height - 52, [g, this.nitroText]).setDepth(9000).setScrollFactor(0);
  }

  private updateNitroHud(): void {
    if (this.shown === this.player.nitro) return;
    this.shown = this.player.nitro;
    this.nitroText.setText(`×${this.player.nitro}`);
    this.nitroIcon.setAlpha(this.player.nitro > 0 ? 1 : 0.55);
    this.touch?.setNitro(this.player.nitro);
  }
}

