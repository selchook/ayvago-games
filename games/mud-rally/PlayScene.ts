import { Phaser, ArcadeScene, Controls, CarSteering, RAMP_TIME, shake, flash, popup, t, loc, txt, storage, isEasy, hudChip, HudChip, HUD_MARGIN, iconButton, tilt, type CarPadButton } from '@core';
import { World3D, THREE, model, grounded } from '@core/three';
import { LAYOUTS, Track } from './tracks';
import { buildArena, type Arena } from './scenery';
import { Particles } from './particles';
import { Truck, TRUCK_GEOM, TRUCK_R, turnFactor, type DriveInput, type Stats, type StepEvents, type TruckModel } from './truck';
import { SURF_MUD, SURF_PUDDLE, SURF_BERM, SURF_GRASS } from './terrain';
import { ResultsPanel, ShopPanel, MAX_LEVEL, price, type Upgrade, type ResultRow } from './panels';
import { money, ordinal } from './strings';
import { matte } from './look';
import { SkidMarks } from './marks';
import { Cockpit, COCKPIT_LAYER } from './cockpit';

const LAPS = 4;
const NCP = 4;                 // checkpoints per lap (besides the line)
const PRIZES = [10000, 6000, 3000, 0];
const BASE_TOP = 13.5;
const BASE_ACCEL = 15;
const NITRO_TIME = 1.6;
/** AI: steering gain (steer per radian of heading error). */
const AI_STEER_GAIN = 3;
/** Seconds the rivals take to bring the wheel back to straight (the keys' RAMP_TIME the other way). */
const AI_RETURN = 0.15;
/**
 * Yaw rate at full lock (rad/s, before the speed factor), the same rule for every truck: the
 * player's grows with the tires. 3.5 before steering was calmed down for touch players.
 */
const TURN = 3.1;
const TURN_PER_TIRE = 0.1;

/** Normal and Easy side by side (new-game skill §7c). Normal is the game as it always was. */
const TUNING = {
  normal: {
    lives: 3,
    /** Rival pace (share of BASE_TOP) in race 1, its rise per race and its cap. */
    rivalBase: 0.86, rivalStep: 0.047, rivalCap: 1.26,
    /** Rubber band on rival pace: ahead of the player .. behind the player. */
    bandMin: 0.9, bandMax: 1.12,
    /** AI corner speed margin (share of the fastest speed that still makes the bend). */
    aiCorner: 0.85,
    /** Rival nitro: cans at the start (cap), chance per second to fire one, chasing nitro cans. */
    rivalNitroCap: 3, aiNitroRate: 0.9, aiChaseNitro: true,
    /** Share of the mud's pull taken off the player's truck. */
    mudEase: 0,
  },
  easy: {
    lives: 4,
    rivalBase: 0.8, rivalStep: 0.03, rivalCap: 1.08,
    bandMin: 0.86, bandMax: 1.04,
    aiCorner: 0.8,
    rivalNitroCap: 1, aiNitroRate: 0.45, aiChaseNitro: false,
    mudEase: 0.45,
  },
};
type Tuning = typeof TUNING.normal;
const FOV = 38;
const CAM_POS = new THREE.Vector3(0, 47, 30.5);
const CAM_LOOK = new THREE.Vector3(0, 0, 1.6);
const PLAYER_COLOR = 0x2f7dff;
/** The right-thumb pedals and NITRO on touch screens (the steering is the core CarPad's). */
const GAS = { x: 1180, y: 566, w: 150, h: 220 };
const BRAKE = { x: 1018, y: 610, w: 132, h: 132 };
const NITRO = { x: 1018, y: 448, r: 64 };
/** Where the first-race hint about the pedals sits. */
const PEDALS_HINT = { x: 1050, y: NITRO.y - NITRO.r - 6 };
/** Storage key: the controls hint has been shown once (first race only). */
const HINT_KEY = 'mud-rally:controlsHint';
/** Storage key: the chosen camera view ('classic' or 'cockpit'). */
const CAM_KEY = 'mud-rally:camera';
/** Storage key: the camera button's hint has been shown once. */
const CAM_HINT_KEY = 'mud-rally:cameraHint';
/** The camera button: a round glass button under the pause button. */
const CAM_BTN = { x: 1228, y: 140 };
/** Seconds of the blend between the two views. */
const VIEW_BLEND = 0.3;
/** In-car view: where the "this way" and "rival" chips sit on the screen edges. */
const DIR_Y = 236;
const RIVAL_Y = 316;
type View = 'classic' | 'cockpit';
const RIVALS: { model: TruckModel; color: number; name: string }[] = [
  { model: 'pickup', color: 0xe8402f, name: 'driverRed' },
  { model: 'monster', color: 0xf5c52b, name: 'driverYellow' },
  { model: 'pickup', color: 0x35c46a, name: 'driverGreen' },
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
  /** The rivals' current steering (they turn the wheel at the keys' pace). */
  private aiSteer = new Map<Truck, number>();
  private aiDelay = new Map<Truck, number>();
  private steering!: CarSteering;
  private marks!: SkidMarks;
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
  private lives = 3;
  /** Normal or Easy tuning for this run (exposed for tests). */
  tune: Tuning = TUNING.normal;
  private bank = 0;
  private earned = 0;
  private raceCash = 0;
  private levels: Record<Upgrade, number> = { engine: 0, tires: 0, shocks: 0, nitro: 0 };
  private camShake = 0;
  private centerText = '';
  private engine: Phaser.Sound.BaseSound | null = null;
  private nitroIcon!: HudChip;
  private shown = -1;
  // the in-car view
  private cockpit!: Cockpit;
  /** The chosen view (stored); the blend follows it during the race. Exposed for tests. */
  view: View = 'classic';
  /** 0 = classic .. 1 = in-car (linear in time), and its eased value. */
  private viewK = 0;
  viewE = 0;
  private inCar = false;
  private camBtn!: Phaser.GameObjects.Container;
  private camHint: Phaser.GameObjects.Container | null = null;
  private dirChips: HudChip[] = [];
  private dirShow = 0;
  private dirSide = 1;
  private rivalChips: HudChip[] = [];
  private rivalIcons: Phaser.GameObjects.Image[] = [];
  private speedLines!: Phaser.GameObjects.Graphics;
  /** The steering shown on the 3D wheel. */
  private wheelVis = 0;
  private mudAcc = 0;

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
    this.aiSteer = new Map();
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
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.lives = this.tune.lives;
    this.bank = 0;
    this.earned = 0;
    this.raceCash = 0;
    this.levels = { engine: 0, tires: 0, shocks: 0, nitro: 0 };
    this.camShake = 0;
    this.centerText = '';
    this.shown = -1;
    this.view = storage.get<string>(CAM_KEY, 'classic') === 'cockpit' ? 'cockpit' : 'classic';
    this.viewK = this.viewE = 0;
    this.inCar = false;
    this.camHint = null;
    this.dirShow = 0;
    this.dirSide = 1;
    this.wheelVis = 0;
    this.mudAcc = 0;

    this.world = new World3D(this, { fov: FOV, background: 0x9fd0ff, fog: { color: 0xb9dcf5, near: 70, far: 150 } });
    const sun = this.world.addLights({ sky: 0xeaf6ff, ground: 0x8a6a4a, ambient: 1.55, intensity: 2.5, dir: [-0.45, 1, 0.5], extent: 40 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far = 140;
    this.world.camera.position.copy(CAM_POS);
    this.world.camera.lookAt(CAM_LOOK);
    // keys from the core (arrows / WASD, Space / Z / Enter); on touch screens the scene draws its
    // own car controls (steer left / right, GAS, BRAKE, NITRO) instead of the stick
    this.controls = new Controls(this, {});
    const buttons: CarPadButton[] = [
      { id: 'gas', shape: 'pedal', ...GAS, color: 0x2fae5a, label: t('gas'), labelY: -40, hit: { left: 8, top: 20, right: Infinity, bottom: Infinity } },
      { id: 'brake', shape: 'pedal', ...BRAKE, color: 0xe8402f, label: t('brake'), labelY: -22, hit: { left: 30, top: 16, right: Infinity, bottom: Infinity } },
      // a thumb on NITRO keeps the gas on: firing the boost never lifts off the pedal
      { id: 'nitro', shape: 'round', ...NITRO, color: 0xff7a1a, icon: 'bolt', count: true, holds: 'gas' },
    ];
    this.steering = new CarSteering(this, { touch: this.controls.touchUi, buttons });

    this.dust = new Particles(900, false, this.scale.height, FOV);
    this.glow = new Particles(320, true, this.scale.height, FOV);
    this.marks = new SkidMarks();
    this.world.scene.add(this.marks.mesh, this.dust.points, this.glow.points);

    this.player = new Truck('monster', PLAYER_COLOR, true);
    this.trucks.push(this.player);
    this.names.set(this.player, t('you'));
    for (const r of RIVALS) {
      const tr = new Truck(r.model, r.color, false);
      this.trucks.push(tr);
      this.names.set(tr, t(r.name));
    }
    for (const tr of this.trucks) this.world.scene.add(tr.root, tr.blob);

    // the in-car view: the cockpit rides with the player's truck; its mirror is drawn first
    this.cockpit = new Cockpit(PLAYER_COLOR);
    this.cockpit.onSound = (key, cfg) => this.sfx(key, cfg);
    this.world.scene.add(this.cockpit.rig);
    this.world.onFrame = () => this.cockpit.renderMirror(this.world.renderer, this.world.scene);

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
    this.buildViewUi();
    this.hud.setLives(this.lives, this.tune.lives);
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
      this.cockpit.dispose();
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
        turn: TURN + TURN_PER_TIRE * L.tires,
        shocks: 0.14 * L.shocks,
        mudEase: this.tune.mudEase,
      };
    }
    // rubber band: a little faster behind the player, a little slower ahead
    const gap = this.key(this.player) - this.key(tr);
    const rb = tr.isPlayer ? 1 : Phaser.Math.Clamp(1 + gap * 0.004, this.tune.bandMin, this.tune.bandMax);
    return {
      top: BASE_TOP * tr.skill * rb,
      accel: BASE_ACCEL * (0.92 + 0.12 * tr.skill),
      grip: Math.min(13, 8 + this.raceNo * 0.35),
      turn: TURN,
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
    this.aiSteer.clear();
    this.raceTime = 0;
    this.lateT = -1;
    this.raceCash = 0;

    // the starting grid, behind the line: rivals by speed, the player on the second row
    const tk = this.track, hw = tk.half, terrain = this.arena.terrain;
    // race 1 is a gentle start for the car controls; the field gets faster every race after
    const tu = this.tune;
    const base = Math.min(tu.rivalCap, tu.rivalBase + tu.rivalStep * (this.raceNo - 1));
    const rivals = this.trucks.filter((x) => !x.isPlayer);
    rivals.forEach((r, i) => {
      r.skill = base - i * 0.035;
      r.lane = [-0.3, 0.28, 0.02][i] * hw;
      r.phase = Math.random() * 6;
      r.nitro = Math.min(tu.rivalNitroCap, 1 + Math.floor((this.raceNo - 1) / 2));
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
    this.cockpit.setTrack(tk);
    this.cockpit.reset(this.player);
    this.shown = -1;
    this.updateNitroHud();
    this.nitroIcon.setVisible(!this.steering.pad);
    this.steering.begin();
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
    if (this.raceNo === 1 && !storage.get<boolean>(CAM_HINT_KEY, false)) this.showCamHint();
  }

  /** The first race ever: how the car controls work, over the grid until the start. */
  private showHint(): void {
    const c = this.add.container(0, 0).setDepth(7100).setScrollFactor(0);
    const pill = (x: number, y: number, w: number, h: number) =>
      this.add.graphics().fillStyle(0x0b1020, 0.72).fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2)
        .lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    const pad = this.steering.pad;
    if (pad) {
      const a = { steer: pad.steerAnchor, pedals: PEDALS_HINT };
      const steer = txt(this, a.steer.x, a.steer.y - 34, t('hintSteer'), { title: true, size: 26, color: '#ffd23f', strokeThickness: 6 });
      const ped = txt(this, a.pedals.x, a.pedals.y - 50, t('hintPedals'), { size: 22, color: '#ffffff', strokeThickness: 6, wrap: 400 });
      c.add([pill(a.steer.x, a.steer.y - 34, steer.width + 44, 52), steer, pill(a.pedals.x, a.pedals.y - 50, ped.width + 44, ped.height + 22), ped]);
      pad.pulse();
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
    this.steering.update(dt);

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
          this.arena?.cheer();
          this.phase = 'race';
          this.phaseT = 0;
          for (const tr of this.trucks) if (!tr.isPlayer) this.aiDelay.set(tr, 0.05 + Math.random() * 0.3);
          this.dropHint();
          // the way the phone is held at the start is straight ahead
          this.steering.centre();
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

    this.arena!.update(dt);
    this.dust.update(dt);
    this.glow.update(dt);
    this.marks.update(dt);
    this.updateEngine();
    this.updateMarker();
    this.updateCamera(dt);
    this.updateView(dt);
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
    const c = this.controls, st = this.steering, tr = this.player;
    const keyNitro = c.justA();
    const padNitro = st.take('nitro');
    if ((keyNitro || padNitro) && tr.nitro > 0 && tr.nitroT <= 0) this.fireNitro(tr);
    // car controls, relative to the truck: left / right turn it, up is gas, down brakes and
    // reverses once stopped. Keys and arrow buttons ease to full lock; the wheel and tilt are analogue.
    const steer = st.steer(dt, c.axisX);
    const gas = c.axisY < -0.3 || st.isDown('gas');
    const brake = c.axisY > 0.3 || st.isDown('brake');
    return { steer, throttle: brake ? -1 : gas ? 1 : 0 };
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
      if (!p.alive || (p.kind === 'cash' && tr.phase > 3) || (p.kind === 'nitro' && !this.tune.aiChaseNitro)) continue;
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
    const want = Math.min(st.top, Math.max(5, radius * st.turn * turnFactor(st.top) * this.tune.aiCorner));
    const vf = tr.forward;
    tr.aiNitroCd -= dt;
    if (this.phase === 'race' && !tr.isPlayer && tr.nitro > 0 && tr.nitroT <= 0 && tr.aiNitroCd <= 0 && turn < 0.3 && !tr.airborne && Math.random() < dt * this.tune.aiNitroRate) {
      this.fireNitro(tr);
      tr.aiNitroCd = 5 + Math.random() * 5;
    }
    // steering: proportional to the angle still to turn, full lock beyond about 20 degrees. Rivals
    // turn their wheel no faster than the player's keys and arrows do (RAMP_TIME to full lock,
    // quicker back to straight), so the calmer steering costs everyone the same
    const aim = Phaser.Math.Clamp(diff * AI_STEER_GAIN, -1, 1);
    let steer = aim;
    if (!tr.isPlayer) {
      const cur = this.aiSteer.get(tr) ?? 0;
      const back = aim * cur < 0 || Math.abs(aim) < Math.abs(cur);
      const step = dt / (back ? AI_RETURN : RAMP_TIME);
      steer = cur + Phaser.Math.Clamp(aim - cur, -step, step);
      this.aiSteer.set(tr, steer);
    }
    let throttle = vf < want ? 1 : 0;
    if (Math.abs(diff) > 1.9) throttle *= 0.35;   // facing the wrong way: slow down and turn first
    return { steer, throttle, brake: vf > want + 1.2 };
  }

  private fireNitro(tr: Truck): void {
    tr.nitro--;
    tr.nitroT = NITRO_TIME;
    const p = this.screenOf(tr.x, tr.y, tr.z);
    this.sfxAt('nitro', p.x, { volume: tr.isPlayer ? 0.75 : 0.35 });
    if (tr.isPlayer) {
      this.updateNitroHud();
      popup(this, p.x, p.y - 40, t('nitroGo'), '#ffb02e', 30);
      this.camShake = Math.max(this.camShake, 0.18);
      this.fovKick = 1;
    }
    for (let k = 0; k < 14; k++) {
      const e = tr.local((Math.random() - 0.5) * 0.6, TRUCK_GEOM.exhaustBack + 0.1, TRUCK_GEOM.exhaustUp);
      this.glow.emit({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.4, size: 1.3, grow: 0.2, color: 0xff9a2a, alpha: 0.9 });
    }
  }

  private onEvents(tr: Truck, ev: StepEvents): void {
    const near = tr.isPlayer;
    const sx = () => this.screenOf(tr.x, tr.y, tr.z).x;
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
        this.dust.emit({ x: tr.x + Math.cos(a) * 1.1, y: tr.y + 0.15, z: tr.z + Math.sin(a) * 1.1, vx: Math.cos(a) * sp, vy: 0.6 + Math.random(), vz: Math.sin(a) * sp, life: 0.9 + Math.random() * 0.5, size: 0.9, grow: 2.6, color: 0xd8b48a, alpha: 0.6, drag: 2.4 });
      }
      if (near && big) {
        this.camShake = Math.max(this.camShake, Math.min(0.55, ev.landed * 0.05));
        if (tr.surface === SURF_MUD) {
          this.mudSplash(tr, 18);
          if (this.inCar) this.cockpit.splat(9);
        }
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
            const sx = this.screenOf(mx, my, mz).x;
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
        if (place < 4) this.arena?.cheer();
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
      this.arena?.cheer();
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
      this.hud.setLives(this.lives, this.tune.lives);
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
    this.steering.end();
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
    const state = { bank: this.bank, levels: this.levels, nextTrack: t('nextTrack', { name: loc(next.name) }), touch: !!this.steering.pad };
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
    const sc = this.screenOf(p.x, p.y + 1, p.z);
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
        const e = tr.local((Math.random() - 0.5) * 0.25, TRUCK_GEOM.exhaustBack + 0.35, TRUCK_GEOM.exhaustUp);
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
      const side = Math.random() < 0.5 ? -TRUCK_GEOM.wheelSide : TRUCK_GEOM.wheelSide;
      const e = tr.local(side, TRUCK_GEOM.wheelBack + 0.2, 0.15);
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
    for (const side of [-TRUCK_GEOM.wheelSide, TRUCK_GEOM.wheelSide]) {
      const w = tr.local(side, TRUCK_GEOM.wheelBack, 0);
      this.marks.mark(id + (side < 0 ? 'l' : 'r'), w.x, w.y, w.z, strength, TRUCK_GEOM.tyre * (surf === SURF_MUD ? 1.15 : 0.85));
    }
    if (!tr.isPlayer) return;
    this.skidCd -= dt;
    const start = (tr.braking && !this.wasBraking && tr.speed > 7) || (!tr.braking && tr.slip > 4.5);
    this.wasBraking = tr.braking;
    if (start && this.skidCd <= 0 && surf !== SURF_MUD) {
      this.skidCd = tr.braking ? 0.9 : 2.2;
      const x = this.screenOf(tr.x, tr.y, tr.z).x;
      this.sfxAt('skid', x, { volume: tr.braking ? 0.45 : 0.3 });
    }
  }

  private mudSplash(tr: Truck, n: number): void {
    for (let k = 0; k < n; k++) {
      // thrown off the four big tyres
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      const w = tr.local((k & 1 ? 1 : -1) * TRUCK_GEOM.wheelSide, (k & 2 ? 1 : -1) * TRUCK_GEOM.wheelBack, 0.3);
      this.dust.emit({ x: w.x, y: w.y, z: w.z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 4, vz: Math.sin(a) * sp, life: 0.7, size: 0.45, grow: 0.3, color: 0x4a2c16, alpha: 1, gravity: 16 });
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
    if (this.phase === 'count' || this.phase === 'intro') k = this.controls.axisY < -0.3 || this.steering.isDown('gas') ? 0.7 : 0;
    const rate = 0.7 + k * 0.8 + (tr.nitroT > 0 ? 0.2 : 0) + (tr.airborne ? 0.15 : 0);
    try {
      e.setRate(rate);
      e.setVolume(racing ? 0.07 + k * 0.05 : 0.025);
    } catch { /* not started */ }
  }

  private updateMarker(): void {
    const tr = this.player;
    this.marker.position.set(tr.x, tr.y + 3.3 + Math.sin(performance.now() / 220) * 0.2, tr.z);
    this.marker.rotation.y += 0.05;
    this.marker.visible = this.phase !== 'results' && this.phase !== 'shop' && !this.inCar;
    // wrong way: the ground arrow shows which way the race goes
    const show = this.phase === 'race' && this.wrongT > 0.5 && !tr.finished;
    this.wrongArrow.visible = show;
    if (show) {
      const p = this.track.sampleAt(tr.s);
      const pulse = 1.4 + Math.sin(performance.now() / 120) * 0.15;
      // from the driver's seat it lies on the ground ahead, where the windscreen shows it
      const ox = this.inCar ? Math.cos(tr.heading) * 5.5 : p.tx * 2.4, oz = this.inCar ? Math.sin(tr.heading) * 5.5 : p.tz * 2.4;
      this.wrongArrow.position.set(tr.x + ox, this.arena!.terrain.heightAt(tr.x + ox, tr.z + oz) + 0.12, tr.z + oz);
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

  // ---------------------------------------------------------------- camera views

  /**
   * Where a world point shows on the screen, for popups and sound panning. From the driver's
   * seat a point beside or under the truck has no useful spot: it is placed over the bonnet.
   */
  private screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(new THREE.Vector3(x, y, z));
    if (!this.inCar) return p;
    const ok = p.visible && p.x > 40 && p.x < this.scale.width - 40 && p.y > 80 && p.y < 500;
    return ok ? p : { x: this.scale.width / 2, y: 420 };
  }

  /** The views can be switched from the grid until the finish (not on the result or garage screens). */
  private viewAllowed(): boolean {
    return this.phase === 'intro' || this.phase === 'count' || this.phase === 'race' || this.phase === 'finish';
  }

  /** Switches between the classic overview and the in-car view (button or C), and remembers it. */
  toggleView(): void {
    if (!this.viewAllowed() || this.isOver) return;
    this.view = this.view === 'classic' ? 'cockpit' : 'classic';
    storage.set(CAM_KEY, this.view);
    this.sfx('move', { volume: 0.4, rate: 0.85 });
    popup(this, this.scale.width / 2, 196, t(this.view === 'cockpit' ? 'camCockpit' : 'camClassic'), '#ffffff', 24);
    this.tweens.add({ targets: this.camBtn, scale: { from: 1.18, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    this.dropCamHint();
  }

  private buildViewUi(): void {
    const { width } = this.scale;
    // a camera, drawn once: body, viewfinder bump and lens
    if (!this.textures.exists('mr-cam')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRoundedRect(4, 18, 56, 38, 9).fillRoundedRect(18, 10, 22, 12, 4);
      g.fillStyle(0x24324a).fillCircle(32, 37, 13);
      g.fillStyle(0xffffff).fillCircle(32, 37, 8);
      g.fillStyle(0x24324a).fillCircle(32, 37, 5);
      g.fillStyle(0xffd23f).fillCircle(51, 26, 3.5);
      g.generateTexture('mr-cam', 64, 64);
      g.clear();
      // a chevron for the "this way" chip, pointing left
      g.fillStyle(0xffd23f).fillTriangle(2, 20, 22, 2, 22, 38).fillRect(20, 13, 18, 14);
      g.generateTexture('mr-arrow', 40, 40);
      g.clear();
      // a little truck for the rival chips (tinted with the rival's colour)
      g.fillStyle(0xffffff).fillRoundedRect(0, 8, 44, 14, 4).fillRoundedRect(8, 0, 20, 12, 3);
      g.fillStyle(0x15171d).fillCircle(10, 23, 5).fillCircle(34, 23, 5);
      g.generateTexture('mr-rival', 44, 28);
      g.destroy();
    }
    this.camBtn = iconButton(this, CAM_BTN.x, CAM_BTN.y, 'mr-cam', () => this.toggleView(), 72);
    this.camBtn.setScrollFactor(0).setDepth(9600).setData('label', t('camBtn'));
    if (!this.steering.pad) {
      // desktop: the key on a small cap in the button's corner
      const cap = this.add.graphics().fillStyle(0xf3f2f2, 1).fillRoundedRect(12, 12, 24, 24, 6).lineStyle(2, 0x24324a, 0.6).strokeRoundedRect(12, 12, 24, 24, 6);
      const key = txt(this, 24, 24, 'C', { title: true, size: 15, color: '#24324a', strokeThickness: 0 });
      this.camBtn.add([cap, key]);
    }
    // C switches the view; a key event, so even a very short tap counts (listeners go with the scene)
    this.input.keyboard?.on('keydown-C', (ev: KeyboardEvent) => { if (!ev.repeat) this.toggleView(); });

    const arrowR = this.add.image(0, 0, 'mr-arrow').setFlipX(true).setScale(0.7);
    this.dirChips = [
      hudChip(this, HUD_MARGIN, DIR_Y, { icon: 'mr-arrow', iconSize: 28, text: t('thisWay'), color: '#ffd23f' }),
      hudChip(this, width - HUD_MARGIN, DIR_Y, { align: 'right', text: t('thisWay'), color: '#ffd23f', items: [arrowR] }),
    ];
    const truckR = this.add.image(0, 0, 'mr-rival').setScale(0.8);
    this.rivalChips = [
      hudChip(this, HUD_MARGIN, RIVAL_Y, { icon: 'mr-rival', iconSize: 22, text: t('rivalBehind'), size: 22 }),
      hudChip(this, width - HUD_MARGIN, RIVAL_Y, { align: 'right', text: t('rivalBehind'), size: 22, items: [truckR] }),
    ];
    this.rivalIcons = [this.rivalChips[0].icon!, truckR];
    for (const c of [...this.dirChips, ...this.rivalChips]) c.setVisible(false);
    // nitro in the in-car view: streaks rushing past the windscreen
    this.speedLines = this.add.graphics().setDepth(-90).setScrollFactor(0);
  }

  /** The first race: a hint beside the camera button. */
  private showCamHint(): void {
    // it names the view the button leads to
    const s = t((this.steering.pad ? 'camHintTouch' : 'camHintKeys') + (this.view === 'cockpit' ? 'Out' : ''));
    const label = txt(this, 0, 0, s, { size: 20, color: '#ffffff', strokeThickness: 5 }).setOrigin(1, 0.5);
    const w = label.width + 36;
    const x = CAM_BTN.x - 50;
    const pill = this.add.graphics().fillStyle(0x0b1020, 0.72).fillRoundedRect(-w + 8, -22, w, 44, 22)
      .lineStyle(2, 0xffd23f, 0.6).strokeRoundedRect(-w + 8, -22, w, 44, 22);
    label.setX(-10);
    const c = this.add.container(x, CAM_BTN.y, [pill, label]).setDepth(9550).setScrollFactor(0).setAlpha(0);
    this.camHint = c;
    storage.set(CAM_HINT_KEY, true);
    this.tweens.add({ targets: c, alpha: 1, x: x - 8, duration: 320, delay: 900 });
    this.tweens.add({ targets: this.camBtn, scale: { from: 1, to: 1.14 }, duration: 300, yoyo: true, repeat: 3, delay: 1100 });
    this.time.delayedCall(7000, () => this.dropCamHint());
  }

  private dropCamHint(): void {
    const c = this.camHint;
    if (!c) return;
    this.camHint = null;
    this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() });
  }

  /** Blends the camera between the views and runs everything the in-car view shows. */
  private updateView(dt: number): void {
    const cam = this.world.camera;
    const tr = this.player;
    const ph = this.phase;
    const live = ph === 'count' || ph === 'race' || ph === 'finish';
    const want = this.view === 'cockpit' && (live || (ph === 'intro' && this.phaseT > 1.35)) ? 1 : 0;
    this.viewK = Phaser.Math.Clamp(this.viewK + Math.sign(want - this.viewK) * (dt / VIEW_BLEND), 0, 1);
    const e = (this.viewE = this.viewK * this.viewK * (3 - 2 * this.viewK));
    this.camBtn.setVisible(this.viewAllowed());

    // the wheel: in the race it is the steering itself; on the grid it follows the thumb or keys
    const pad = this.steering.pad;
    if (ph === 'race' && !tr.finished) this.wheelVis = this.steering.current;
    else if (ph === 'race' || ph === 'finish') this.wheelVis = tr.steer / 0.55;
    else {
      const keys = Math.abs(this.controls.axisX) > 0.3 ? Math.sign(this.controls.axisX) : 0;
      if (!keys && pad && pad.mode === 'tilt' && tilt.active) this.wheelVis = tilt.steer;
      else if (!keys && pad && pad.mode === 'wheel') this.wheelVis = pad.steer;
      else {
        const aim = keys || (pad?.steer ?? 0);
        const step = dt / RAMP_TIME;
        this.wheelVis += Phaser.Math.Clamp(aim - this.wheelVis, -step, step);
      }
    }

    const inCar = e >= 0.5;
    if (e > 0) {
      const surf = tr.surface;
      const rough = tr.airborne ? 0 : surf === SURF_MUD ? 1 : surf === SURF_PUDDLE ? 0.6 : surf === SURF_BERM || surf === SURF_GRASS ? 0.5 : 0.12;
      this.cockpit.update(dt, {
        truck: tr,
        steer: this.wheelVis,
        top: BASE_TOP * (1 + 0.075 * this.levels.engine),
        gas: this.controls.axisY < -0.3 || this.steering.isDown('gas'),
        racing: ph === 'race' || ph === 'finish',
        shake: this.camShake,
        kick: this.fovKick,
        rough,
        trucks: this.trucks,
      });
      if (ph === 'intro') cam.fov = FOV;
      cam.position.lerp(this.cockpit.camPos, e);
      cam.quaternion.slerp(this.cockpit.camQuat, e);
      cam.fov += (this.cockpit.fov - cam.fov) * e;
      cam.near = 0.04;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.cockpit.mirrorOn = inCar;
      if (inCar && (ph === 'race' || ph === 'finish')) this.windscreenMud(dt);
    } else if (cam.near !== 0.1) {
      cam.near = 0.1;
      cam.updateProjectionMatrix();
    }
    if (inCar !== this.inCar) {
      this.inCar = inCar;
      if (inCar) cam.layers.enable(COCKPIT_LAYER);
      else cam.layers.disable(COCKPIT_LAYER);
      tr.setGhost(inCar);
    }
    this.dust.setView(cam.fov, inCar ? 0.9 : 0, inCar ? 180 : 4096);
    this.glow.setView(cam.fov, inCar ? 0.9 : 0, inCar ? 180 : 4096);

    // HUD: the dashboard shows nitro in the car; the chips that only the in-car view needs
    if (ph !== 'results' && ph !== 'shop') this.nitroIcon.setVisible(!pad && !inCar);
    this.updateDirChip(dt, inCar && ph === 'race' && !tr.finished);
    this.updateRivalChip(inCar && (ph === 'race' || ph === 'finish'));
    this.drawSpeedLines(inCar && tr.nitroT > 0 && ph !== 'results' && ph !== 'shop');
  }

  /** Mud and water on the windscreen: from the player's own wheels and from a truck just ahead. */
  private windscreenMud(dt: number): void {
    const tr = this.player, sp = tr.speed;
    let rate = 0, water = false;
    if (!tr.airborne && tr.surface === SURF_MUD && sp > 3) rate = sp * 0.28;
    else if (!tr.airborne && tr.surface === SURF_PUDDLE && sp > 4) { rate = sp * 0.35; water = true; }
    const fx = Math.cos(tr.heading), fz = Math.sin(tr.heading);
    for (const o of this.trucks) {
      if (o === tr || o.surface !== SURF_MUD || o.speed < 4 || o.airborne) continue;
      const dx = o.x - tr.x, dz = o.z - tr.z;
      const along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
      if (along > 1.5 && along < 7.5 && side < 1.8) rate += 2.6;
    }
    this.mudAcc += rate * dt;
    if (this.mudAcc >= 1) {
      const n = Math.floor(this.mudAcc);
      this.mudAcc -= n;
      this.cockpit.splat(n, water);
      if (Math.random() < 0.25) this.sfx('splash', { volume: 0.18, rate: 1.4 });
    }
  }

  /** In the car: a "this way" chip on the screen edge when the track ahead is out of sight. */
  private updateDirChip(dt: number, on: boolean): void {
    const tr = this.player;
    let need = false;
    if (on) {
      const p = this.track.pointAt(tr.s + 14);
      const sc = this.world.toScreen(new THREE.Vector3(p.x, this.arena!.terrain.heightAt(p.x, p.z) + 0.5, p.z));
      const seen = sc.visible && sc.x > 70 && sc.x < this.scale.width - 70 && sc.y > 70 && sc.y < 520;
      need = !seen || this.wrongT > 0.5;
      if (need) {
        const a = Math.atan2(p.z - tr.z, p.x - tr.x) - tr.heading;
        const side = Math.atan2(Math.sin(a), Math.cos(a)) > 0 ? 1 : 0;
        // keep the side while it is shown, unless the target swings well across
        if (this.dirShow <= 0 || Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.25) this.dirSide = side;
      }
    }
    this.dirShow = Phaser.Math.Clamp(this.dirShow + (need ? dt / 0.25 : -dt / 0.4), 0, 1);
    const show = on && this.dirShow > 0.5;
    this.dirChips.forEach((c, i) => {
      const v = show && i === this.dirSide;
      if (v && !c.visible) this.tweens.add({ targets: c, scale: { from: 1.3, to: 1 }, duration: 240, ease: 'Back.easeOut' });
      c.setVisible(v);
      if (v) c.setAlpha(0.75 + 0.25 * Math.sin(this.elapsed * 9));
    });
  }

  /** In the car: a rival close behind or alongside (out of the windscreen) gets a chip on its side. */
  private updateRivalChip(on: boolean): void {
    const tr = this.player;
    let best: Truck | null = null, bestD = 8.5, along = 0, lat = 0;
    if (on) {
      const fx = Math.cos(tr.heading), fz = Math.sin(tr.heading);
      for (const o of this.trucks) {
        if (o === tr) continue;
        const dx = o.x - tr.x, dz = o.z - tr.z, d = Math.hypot(dx, dz);
        const a = dx * fx + dz * fz;
        if (d < bestD && a < 1.2) { best = o; bestD = d; along = a; lat = -dx * fz + dz * fx; }
      }
    }
    const side = lat > 0 ? 1 : 0;
    this.rivalChips.forEach((c, i) => {
      const v = !!best && i === side;
      if (v && best) {
        if (!c.visible) this.tweens.add({ targets: c, scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.easeOut' });
        c.setText(t(along < -1.5 ? 'rivalBehind' : 'rivalBeside'));
        this.rivalIcons[i].setTint(best.color);
        c.setAlpha(bestD < 4 ? 0.8 + 0.2 * Math.sin(this.elapsed * 14) : 1);
      }
      c.setVisible(v);
    });
  }

  /** Nitro from the driver's seat: white streaks rushing out from the middle of the windscreen. */
  private drawSpeedLines(on: boolean): void {
    const g = this.speedLines;
    g.clear();
    if (!on) return;
    const cx = this.scale.width / 2, cy = 330;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 300 + Math.random() * 160, r1 = r0 + 90 + Math.random() * 200;
      const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0 * 0.62;
      const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1 * 0.62;
      if (y1 > 500 || y0 > 500 || y1 < 96 || y0 < 96) continue;
      g.lineStyle(2 + Math.random() * 3, Math.random() < 0.3 ? 0xffd9a0 : 0xffffff, 0.18 + Math.random() * 0.3);
      g.lineBetween(x0, y0, x1, y1);
    }
  }

  // ---------------------------------------------------------------- HUD

  private buildNitroHud(): void {
    const { height } = this.scale;
    // the nitro bottle, drawn once into a texture for the chip's icon
    if (!this.textures.exists('mr-nitro')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xe8402f).fillRoundedRect(2, 8, 24, 36, 7);
      g.fillStyle(0x9a2418).fillRect(9, 2, 10, 7);
      g.fillStyle(0xffd23f).fillTriangle(8, 29, 16, 15, 14, 26).fillTriangle(20, 23, 12, 37, 14, 26);
      g.generateTexture('mr-nitro', 28, 46);
      g.destroy();
    }
    this.nitroIcon = hudChip(this, HUD_MARGIN + 12, height - 52, { icon: 'mr-nitro', iconSize: 36, text: '×0', height: 56, size: 30 });
  }

  private updateNitroHud(): void {
    if (this.shown === this.player.nitro) return;
    this.shown = this.player.nitro;
    this.nitroIcon.setText(`×${this.player.nitro}`);
    this.nitroIcon.setAlpha(this.player.nitro > 0 ? 1 : 0.55);
    this.steering.pad?.setCount('nitro', this.player.nitro);
  }
}

