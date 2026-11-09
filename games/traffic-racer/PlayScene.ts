import Phaser from 'phaser';
import { ArcadeScene, Controls, CarSteering, burst, shake, t, rng, ensurePixel, isEasy, type CarPadButton } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

const ROAD_L = 120, ROAD_R = 600, LANE_W = 120, LANES = 4;
const LANE_X = [180, 300, 420, 540];
/** Player car centre: high enough that the thumbs on the touch pad never cover it. */
const PY = 960;
const PW = 54, PH = 112;                 // player hitbox
const MAX_SPEED = 1150;
/**
 * Sideways speed at full lock (px/s), and how quickly the car follows the steering. 640 and an
 * instant key response before v1.1: the shared car steering now eases keys and arrows in.
 */
const STEER_V = 600;
const STEER_FOLLOW = 9;
/** Seconds the keys and arrows take to full lock (quicker than a racing game's: lane changes). */
const STEER_RAMP = 0.25;
/** BOOST: faster, double points, thirstier. BRAKE: slows to a share of the cruising speed. */
const BOOST_SPEED = 1.32;
const BOOST_FUEL = 1.7;
const BRAKE_SPEED = 0.55;
/** Near misses within this many px of the other car's side count. */
const NEAR_GAP = 40;

/** Normal and Easy side by side (new-game skill §7c). Normal is the game as it always was. */
const TUNING = {
  normal: {
    lives: 3,
    /** Fuel burnt per second at cruising speed. */
    fuelDrain: 2.6,
    /** Cruising speed added per level. */
    levelSpeed: 75,
    /** Seconds between cars: at level 1, less per level, at least. */
    carGap: 1.3, carGapStep: 0.12, carGapMin: 0.42,
    /** Cars that change lane: from this level, share at most. */
    changerFrom: 2, changerMax: 0.55,
    /** Cones and barrels from this level; oil from this level. */
    obstacleFrom: 3, oilFrom: 4,
    /** Seconds between fuel cans (random range), plus this per level. */
    fuelMin: 8.5, fuelMax: 12, fuelPerLevel: 0.4,
  },
  easy: {
    lives: 4,
    fuelDrain: 2.0,
    levelSpeed: 50,
    carGap: 1.5, carGapStep: 0.09, carGapMin: 0.6,
    changerFrom: 3, changerMax: 0.35,
    obstacleFrom: 4, oilFrom: 6,
    fuelMin: 7, fuelMax: 10, fuelPerLevel: 0.25,
  },
};
type Tuning = typeof TUNING.normal;

export const TRAFFIC = [
  'car_black_1', 'car_black_2', 'car_black_3', 'car_black_4', 'car_black_5',
  'car_blue_1', 'car_blue_2', 'car_blue_3', 'car_blue_4', 'car_blue_5',
  'car_green_1', 'car_green_2', 'car_green_3', 'car_green_4', 'car_green_5',
  'car_yellow_1', 'car_yellow_2', 'car_yellow_3', 'car_yellow_4', 'car_yellow_5',
  'motorcycle_blue', 'motorcycle_green', 'motorcycle_yellow',
];

export function makeRacerTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('tr-lines')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // lane dashes + rumble strips, tiles vertically every 120 px
  g.fillStyle(0xffffff, 0.85);
  for (let i = 1; i < LANES; i++) g.fillRect(i * LANE_W - 4, 0, 8, 64);
  for (let y = 0; y < 120; y += 40) {
    g.fillStyle(y % 80 === 0 ? 0xd62828 : 0xffffff, 1).fillRect(0, y, 12, 40).fillRect(LANE_W * LANES - 12, y, 12, 40);
  }
  g.generateTexture('tr-lines', LANE_W * LANES, 120);
  g.clear();
  // jerry can
  g.fillStyle(0x000000, 0.3).fillRoundedRect(6, 10, 44, 54, 8);
  g.fillStyle(0xd62828, 1).fillRoundedRect(2, 6, 44, 54, 8);
  g.fillStyle(0x8f1020, 1).fillRect(10, 0, 18, 10);
  g.fillStyle(0x2a2a2a, 1).fillRect(32, 0, 10, 10);
  g.lineStyle(4, 0xffd23f, 1).lineBetween(10, 18, 38, 50).lineBetween(38, 18, 10, 50);
  g.generateTexture('tr-fuel', 52, 66);
  g.clear();
  // a soft round puff for smoke and the boost flame
  for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.08 + (16 - r) * 0.05).fillCircle(16, 16, r);
  g.generateTexture('tr-puff', 32, 32);
  g.clear();
  // red screen edges for the fuel warning (stretched over the whole screen)
  for (let i = 0; i < 24; i++) {
    g.fillStyle(0xff2a2a, 0.05 * (1 - i / 24) ** 1.5);
    g.fillRect(i * 2, 0, 2, 64).fillRect(126 - i * 2, 0, 2, 64);
  }
  g.generateTexture('tr-edge', 128, 64);
  g.destroy();
}

type Kind = 'car' | 'coin' | 'fuel' | 'cone' | 'barrel' | 'oil' | 'tree';
interface Thing {
  kind: Kind; img: Phaser.GameObjects.Image; x: number; y: number; w: number; h: number; speed: number;
  passed: boolean; hit: boolean; changer: boolean; changeT: number; fromX: number; toX: number; lane: number;
}
/** Speed streaks (boost) and tyre marks, in road pixels; both scroll with the road. */
interface Streak { x: number; y: number; len: number; a: number }
interface Mark { x: number; y: number; h: number; a: number }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private steering!: CarSteering;
  /** Normal or Easy tuning for this run (exposed for tests). */
  tune: Tuning = TUNING.normal;
  /** Sideways speed at full lock and how fast the car follows the steering (exposed for tests). */
  steerV = STEER_V;
  steerFollow = STEER_FOLLOW;
  private grassL!: Phaser.GameObjects.TileSprite;
  private grassR!: Phaser.GameObjects.TileSprite;
  private lines!: Phaser.GameObjects.TileSprite;
  private marksG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private uiG!: Phaser.GameObjects.Graphics;
  private edge!: Phaser.GameObjects.Image;
  private car!: Phaser.GameObjects.Image;
  private speedText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private exhaust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flame!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private engine: Phaser.Sound.BaseSound | null = null;
  private things: Thing[] = [];
  private streaks: Streak[] = [];
  private marks: Mark[] = [];
  private px = 360;
  private pvx = 0;
  private speed = 0;
  private lives = 3;
  private fuel = 100;
  private dist = 0;
  private distScore = 0;
  private level = 1;
  private invuln = 0;
  private skid = 0;
  private skidDir = 0;
  private combo = 0;
  private comboT = 0;
  private started = false;
  private outOfFuel = false;
  private boosting = false;
  private braking = false;
  private smokeT = 0;
  private carT = 0; private coinT = 0; private fuelT = 0; private obstT = 0; private treeT = 0;
  private lowT = 0;
  private driveT = 0;
  private streakT = 0;
  private screechCd = 0;

  createGame(): void {
    freshTextCanvases(this);
    makeRacerTextures(this);
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.steerV = STEER_V; this.steerFollow = STEER_FOLLOW;
    this.things = []; this.streaks = []; this.marks = [];
    this.px = 360; this.pvx = 0; this.speed = 0; this.lives = this.tune.lives; this.fuel = 100; this.dist = 0; this.distScore = 0;
    this.level = 1; this.invuln = 0; this.skid = 0; this.skidDir = 0; this.combo = 0; this.comboT = 0; this.started = false; this.outOfFuel = false;
    this.boosting = false; this.braking = false; this.smokeT = 0; this.streakT = 0; this.screechCd = 0;
    this.carT = 1.2; this.coinT = 2; this.fuelT = 9; this.obstT = 6; this.treeT = 0; this.lowT = 0; this.driveT = 0;

    this.grassL = this.add.tileSprite(0, 0, ROAD_L, 1280, 'grass').setOrigin(0).setDepth(0);
    this.grassR = this.add.tileSprite(ROAD_R, 0, 720 - ROAD_R, 1280, 'grass').setOrigin(0).setDepth(0);
    this.add.rectangle(ROAD_L, 0, ROAD_R - ROAD_L, 1280, 0x3a3d45).setOrigin(0).setDepth(0);
    this.marksG = this.add.graphics().setDepth(0.5);
    this.lines = this.add.tileSprite(ROAD_L, 0, ROAD_R - ROAD_L, 1280, 'tr-lines').setOrigin(0).setDepth(1);
    this.fxG = this.add.graphics().setDepth(6);
    this.uiG = this.add.graphics().setDepth(20);
    this.edge = this.add.image(360, 640, 'tr-edge').setDisplaySize(720, 1280).setDepth(19).setAlpha(0);
    for (let i = 0; i < 6; i++) this.spawnTree(rng.int(0, 1200));

    const pixel = ensurePixel(this);
    this.exhaust = this.add.particles(0, 0, pixel, {
      speedY: { min: 120, max: 220 }, speedX: { min: -25, max: 25 }, scale: { start: 2, end: 5 }, alpha: { start: 0.4, end: 0 },
      lifespan: 380, frequency: 45, tint: 0xbbbbbb,
    }).setDepth(4);
    // BOOST: a flame out of the exhaust
    this.flame = this.add.particles(0, 0, 'tr-puff', {
      speedY: { min: 260, max: 420 }, speedX: { min: -30, max: 30 }, scale: { start: 0.8, end: 0.1 }, alpha: { start: 0.9, end: 0 },
      lifespan: 220, frequency: 18, tint: [0xffd23f, 0xff7a1a, 0xff4a1a], blendMode: 'ADD', emitting: false,
    }).setDepth(4);
    // a damaged car smokes for a while after a crash
    this.smoke = this.add.particles(0, 0, 'tr-puff', {
      speedY: { min: 80, max: 160 }, speedX: { min: -40, max: 40 }, scale: { start: 0.6, end: 2.2 }, alpha: { start: 0.45, end: 0 },
      lifespan: 900, frequency: 70, tint: [0x555555, 0x777777, 0x333333], emitting: false,
    }).setDepth(7);
    this.car = this.add.image(this.px, PY + 400, 'player').setDepth(5);
    this.tweens.add({ targets: this.car, y: PY, duration: 700, ease: 'Cubic.easeOut' });

    // speed + distance in a small panel under the pause button, combo under the fuel gauge
    this.speedText = ftxt(this, 692, 150, '', { title: true, size: 20, color: '#3ee6ff' }).setOrigin(1, 0.5).setDepth(21);
    this.distText = ftxt(this, 692, 182, '', { title: true, size: 16, color: '#ffffff' }).setOrigin(1, 0.5).setDepth(21);
    this.comboText = ftxt(this, 24, 146, '', { title: true, size: 18, color: '#3ee6ff' }).setOrigin(0, 0.5).setDepth(21).setVisible(false);

    // keys from the core (arrows / WASD, Space / Z / Enter); on touch screens the shared car pad:
    // the steering chosen on the menu under the left thumb, BOOST and BRAKE under the right one
    this.controls = new Controls(this, {});
    const buttons: CarPadButton[] = [
      { id: 'boost', shape: 'pedal', x: 626, y: 1146, w: 132, h: 200, color: 0xff7a1a, icon: 'bolt', label: t('boost'), labelY: -64, labelSize: 20, hit: { left: 10, top: 24, right: Infinity, bottom: Infinity } },
      { id: 'brake', shape: 'pedal', x: 490, y: 1186, w: 112, h: 124, color: 0xe8402f, label: t('brake'), labelY: -18, labelSize: 18, hit: { left: 24, top: 20, right: 6, bottom: Infinity } },
    ];
    this.steering = new CarSteering(this, { touch: this.controls.touchUi, buttons, steer: { x: 191, y: 1166 }, ramp: STEER_RAMP });
    this.steering.begin();

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
    });

    this.updateHud();
    // countdown
    const steps = ['3', '2', '1', t('go')];
    steps.forEach((s, i) => this.time.delayedCall(300 + i * 450, () => {
      if (this.isOver) return;
      this.banner(s, i === 3 ? '#5dff7a' : '#ffd23f', i === 3 ? 56 : 72, 380);
      this.sfx('beep', { volume: 0.5, rate: i === 3 ? 1.5 : 1, exact: true });
      if (i === 3) {
        this.started = true;
        this.speed = 480;
        this.steering.centre();
      }
    }));
  }

  private updateHud(): void {
    this.hud.setLevel(this.level);
    this.hud.setLives(this.lives, this.tune.lives);
  }

  private banner(text: string, color: string, size = 44, hold = 900, y = 520): void {
    const a = ftxt(this, 360, y, text, { title: true, size, color, strokeThickness: 10, wrap: 660 }).setDepth(30).setScale(0.3);
    this.tweens.add({ targets: a, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: a, alpha: 0, delay: hold, duration: 250, onComplete: () => a.destroy() });
  }

  /** Stops the run: engine off, pad away. */
  private finish(title?: string, delay = 1100): void {
    this.steering.end();
    this.flame.emitting = false;
    if (this.engine) this.tweens.add({ targets: this.engine, volume: 0, duration: 500 });
    this.endGame({ title, delay });
  }

  // ---------------------------------------------------------------- spawning
  private put(kind: Kind, key: string, x: number, y: number, speed: number, scale = 1): Thing {
    const img = this.add.image(x, y, key).setScale(scale).setDepth(kind === 'tree' ? 7 : kind === 'oil' ? 2 : 3);
    const th: Thing = {
      kind, img, x, y, w: img.displayWidth, h: img.displayHeight, speed,
      passed: false, hit: false, changer: false, changeT: -1, fromX: x, toX: x, lane: LANE_X.indexOf(x),
    };
    this.things.push(th);
    return th;
  }

  private spawnTree(y = -120): void {
    const left = rng.chance(0.5);
    const x = left ? rng.int(10, ROAD_L - 30) : rng.int(ROAD_R + 30, 710);
    this.put('tree', 'tree', x, y, 0, rng.int(45, 75) / 100);
  }

  private laneFree(lane: number, band = 260): boolean {
    return !this.things.some((o) => (o.kind === 'car' || o.kind === 'cone' || o.kind === 'barrel') && Math.abs(o.x - LANE_X[lane]) < 70 && o.y < band);
  }

  private spawnCar(): void {
    // never wall off all four lanes near the top of the screen
    const busy = new Set<number>();
    for (const o of this.things) if ((o.kind === 'car' || o.kind === 'cone' || o.kind === 'barrel') && o.y < 360) busy.add(Math.round((o.x - 180) / 120));
    const free = [0, 1, 2, 3].filter((l) => this.laneFree(l, 220));
    if (!free.length || (busy.size >= 3 && free.every((l) => !busy.has(l)))) return;
    const lane = rng.pick(free);
    const key = rng.pick(TRAFFIC);
    const moto = key.startsWith('motorcycle');
    const th = this.put('car', key, LANE_X[lane], -100, rng.int(180, 330) + (moto ? 60 : 0));
    th.w = th.img.displayWidth * 0.82; th.h = th.img.displayHeight * 0.88;
    const tu = this.tune;
    th.changer = this.level >= tu.changerFrom && rng.chance(Math.min(tu.changerMax, 0.15 + this.level * 0.07));
  }

  private spawnCoins(): void {
    const lane = rng.int(0, 3);
    if (!this.laneFree(lane, 420)) return;
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const c = this.put('coin', 'coin', LANE_X[lane], -60 - i * 90, 0, 0.42);
      this.tweens.add({ targets: c.img, scaleX: 0.1, duration: 300, yoyo: true, repeat: -1, delay: i * 60 });
    }
  }

  private spawnFuel(): void {
    const lane = rng.int(0, 3);
    const f = this.put('fuel', 'tr-fuel', LANE_X[lane], -80, 0, 1);
    this.tweens.add({ targets: f.img, scale: 1.15, duration: 350, yoyo: true, repeat: -1 });
  }

  private spawnObstacle(): void {
    const lane = rng.int(0, 3);
    // cones and barrels stand still, so they would catch up with (and slide through) a car still
    // ahead of the player in their lane: only a lane without traffic down to the player gets one
    if (!this.laneFree(lane, PY - 60)) return;
    const r = Math.random();
    if (this.level >= this.tune.oilFrom && r < 0.35) this.put('oil', 'oil', LANE_X[lane] + rng.int(-20, 20), -100, 0, 0.9);
    else if (r < 0.7) {
      for (let i = 0; i < 3; i++) {
        const c = this.put('cone', 'cone', LANE_X[lane] - 36 + i * 36, -60 - i * 4, 0, 1);
        c.w = 40; c.h = 40;
      }
    } else {
      const b = this.put('barrel', 'barrel', LANE_X[lane], -70, 0, 1);
      b.w = 50; b.h = 50;
    }
  }

  // ---------------------------------------------------------------- events
  private crash(o: Thing): void {
    if (this.invuln > 0 || this.isOver) return;
    o.hit = true;
    this.lives--;
    this.invuln = 2.2;
    this.combo = 0;
    this.speed = Math.max(380, this.speed * 0.55);
    this.updateHud();
    this.sfxAt(this.lives > 0 ? 'crash' : 'wreck', this.px, { volume: this.lives > 0 ? 0.75 : 0.85 });
    this.sfxAt('skid', this.px, { volume: 0.5 });
    shake(this, 0.025, 380);
    softFlash(this, 0xec3013, 220, 0.4);
    const mx = (this.px + o.x) / 2, my = (PY + o.y) / 2;
    burst(this, mx, my, [0xffd23f, 0xec3013, 0x555555, 0xffffff], 40, 460);
    this.smoke.explode(10, mx, my);
    this.banner(t('crash'), '#ec3013', 48, 600, 420);
    // knock the other vehicle away
    const dir = o.x < this.px ? -1 : 1;
    this.tweens.add({ targets: o.img, angle: dir * rng.int(120, 260), x: o.x + dir * 160, alpha: 0, duration: 700, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.car, angle: { from: -dir * 30, to: 0 }, duration: 500, ease: 'Back.easeOut' });
    // the car smokes for a while, and a sideways kick leaves tyre marks
    this.smokeT = 2.4;
    this.pvx = -dir * 260;
    if (this.lives <= 0) {
      this.car.setTint(0x555555);
      burst(this, this.px, PY, [0xec3013, 0xffd23f], 60, 520);
      this.smoke.explode(24, this.px, PY);
      this.tweens.add({ targets: this.car, angle: -dir * 200, duration: 900, ease: 'Cubic.easeOut' });
      this.finish(undefined, 1100);
    }
  }

  private nearMiss(o: Thing): void {
    this.combo = Math.min(5, this.combo + 1);
    this.comboT = 3;
    const pts = 50 * this.combo * (this.boosting ? 2 : 1);
    this.addScore(pts);
    this.sfxAt('near', o.x, { volume: 0.5, rate: 1 + this.combo * 0.08 });
    const mx = (this.px + o.x) / 2;
    fpopup(this, mx, PY - 110, this.combo > 1 ? `${t('near')} x${this.combo}` : t('near'), '#3ee6ff', 22);
    fpopup(this, mx, PY - 60, `+${pts}`, this.boosting ? '#ff9a2a' : '#ffd23f', 22);
    burst(this, mx, PY - 20, [0x3ee6ff, 0xffffff], 12 + this.combo * 3, 240);
    // a rush of air between the two cars: white streaks along the gap
    for (let i = 0; i < 6; i++) this.streaks.push({ x: mx + rng.int(-10, 10), y: PY - 80 + i * 30, len: 70 + rng.int(0, 60), a: 0.8 });
    // the combo label pops
    this.comboText.setVisible(true).setText(`${t('combo')} x${this.combo}`);
    this.tweens.killTweensOf(this.comboText);
    this.comboText.setScale(1.4);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const tu = this.tune;
    this.steering.update(dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.screechCd -= dt;
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) {
      this.combo = 0;
      this.tweens.add({ targets: this.comboText, alpha: 0, duration: 250, onComplete: () => this.comboText.setVisible(false).setAlpha(1) });
    }

    // pedals: ↑ / W, Space, Z, Enter or BOOST; ↓ / S or BRAKE
    const c = this.controls;
    const live = this.started && !this.outOfFuel;
    const wantBrake = live && (c.axisY > 0.3 || this.steering.isDown('brake'));
    const wantBoost = live && !wantBrake && (c.axisY < -0.3 || c.a || this.steering.isDown('boost')) && this.fuel > 0;
    if (wantBoost && !this.boosting) {
      this.sfx('boost', { volume: 0.55 });
      shake(this, 0.004, 160);
    }
    if (wantBrake && !this.braking && this.speed > 520 && this.screechCd <= 0) {
      this.sfxAt('skid', this.px, { volume: 0.35 });
      this.screechCd = 0.8;
    }
    this.boosting = wantBoost;
    this.braking = wantBrake;
    this.flame.emitting = this.boosting;

    if (live) {
      this.driveT += dt;
      const cruise = Math.min(MAX_SPEED, 480 + (this.level - 1) * tu.levelSpeed + Math.min(70, this.driveT * 2));
      const target = this.braking ? Math.max(300, cruise * BRAKE_SPEED) : this.boosting ? Math.min(MAX_SPEED * BOOST_SPEED, cruise * BOOST_SPEED) : cruise;
      this.speed += Phaser.Math.Clamp(target - this.speed, (this.braking ? -720 : -400) * dt, (this.boosting ? 320 : 160) * dt);
      this.fuel = Math.max(0, this.fuel - tu.fuelDrain * dt * (0.8 + this.speed / 2400) * (this.boosting ? BOOST_FUEL : 1));
      if (this.fuel <= 0) {
        this.outOfFuel = true;
        this.sfx('empty', { volume: 0.65 });
        this.banner(t('outOfFuel'), '#ec3013', 40, 1400);
        this.finish(t('outOfFuel'), 1600);
      }
      if (this.fuel < 25) {
        this.lowT -= dt;
        if (this.lowT <= 0) { this.lowT = 2; this.sfx('low', { volume: 0.35, exact: true }); fpopup(this, 170, 190, t('lowFuel'), '#ec3013', 18); }
      }
    } else if (this.outOfFuel) this.speed = Math.max(0, this.speed - 500 * dt);

    // steering: the shared car steering (keys, arrows, wheel or tilt) sets the sideways speed
    let want = this.steering.steer(dt, c.axisX);
    if (this.skid > 0) { this.skid -= dt; want = this.skidDir; }
    this.pvx += (want * this.steerV - this.pvx) * Math.min(1, dt * this.steerFollow);
    if (!this.started) this.pvx = 0;
    this.px = Phaser.Math.Clamp(this.px + this.pvx * dt, ROAD_L + 34, ROAD_R - 34);
    if (this.px <= ROAD_L + 34 || this.px >= ROAD_R - 34) this.pvx *= 0.5;
    this.car.x = this.px;
    if (this.skid <= 0 && this.lives > 0) this.car.angle += (this.pvx * 0.02 - this.car.angle) * Math.min(1, dt * 14);
    else if (this.skid > 0) this.car.angle += this.skidDir * 600 * dt;
    this.car.setAlpha(this.invuln > 0 && this.lives > 0 ? (Math.floor(this.invuln * 12) % 2 ? 0.35 : 1) : 1);
    this.exhaust.setPosition(this.px, PY + 62);
    this.flame.setPosition(this.px, PY + 58);
    this.smokeT -= dt;
    this.smoke.emitting = this.smokeT > 0 || this.lives <= 0;
    this.smoke.setPosition(this.px, PY - 30);

    // scrolling world
    const scroll = this.speed * dt;
    this.lines.tilePositionY -= scroll;
    this.grassL.tilePositionY -= scroll;
    this.grassR.tilePositionY -= scroll;
    const meters = (this.speed * 0.2 * dt) / 3.6;
    this.dist += meters;
    this.distScore += (meters / 10) * (this.boosting ? 2 : 1);
    if (this.distScore >= 1) { const n = Math.floor(this.distScore); this.distScore -= n; this.addScore(n); }
    const lvl = 1 + Math.floor(this.dist / 900);
    if (lvl > this.level) {
      this.level = lvl;
      this.updateHud();
      this.sfx('level', { volume: 0.55, exact: true });
      this.banner(`${t('level')} ${lvl}`, '#5dff7a', 44, 900, 600);
      softFlash(this, 0x5dff7a, 200, 0.2);
      burst(this, 360, 600, [0x5dff7a, 0xffd23f, 0xffffff], 30, 380);
    }

    // spawners
    if (live) {
      const rate = this.speed / 500;
      this.carT -= dt * rate; this.coinT -= dt; this.fuelT -= dt; this.obstT -= dt; this.treeT -= dt * rate;
      if (this.carT <= 0) { this.carT = Math.max(tu.carGapMin, tu.carGap - (this.level - 1) * tu.carGapStep) * rng.int(80, 120) / 100; this.spawnCar(); }
      if (this.coinT <= 0) { this.coinT = rng.int(25, 40) / 10; this.spawnCoins(); }
      if (this.fuelT <= 0) { this.fuelT = rng.int(tu.fuelMin * 10, tu.fuelMax * 10) / 10 + this.level * tu.fuelPerLevel; this.spawnFuel(); }
      if (this.level >= tu.obstacleFrom && this.obstT <= 0) { this.obstT = Math.max(2, 6 - this.level * 0.4); this.spawnObstacle(); }
      if (this.treeT <= 0) { this.treeT = rng.int(4, 10) / 10; this.spawnTree(); }
    }

    this.updateMarks(dt, scroll);

    // move + interact
    const g = this.fxG;
    g.clear();
    const blink = Math.floor(this.elapsed * 6) % 2 === 0;
    for (let i = this.things.length - 1; i >= 0; i--) {
      const o = this.things[i];
      o.y += (this.speed - o.speed) * dt;
      if (o.kind === 'car' && !o.hit) {
        // signalled lane change
        if (o.changer && o.changeT < 0 && o.y > 60 && o.y < 520) {
          const lane = Math.round((o.x - 180) / 120);
          const opts = [lane - 1, lane + 1].filter((l) => l >= 0 && l < LANES && !this.things.some((q) => q !== o && q.kind === 'car' && Math.abs(q.x - LANE_X[l]) < 80 && Math.abs(q.y - o.y) < 230));
          if (opts.length) { o.changeT = 0; o.fromX = o.x; o.toX = LANE_X[rng.pick(opts)]; } else o.changer = false;
        }
        if (o.changeT >= 0 && o.changeT < 1.5) {
          o.changeT += dt;
          if (o.changeT > 0.8) {
            const k = Math.min(1, (o.changeT - 0.8) / 0.7);
            o.x = Phaser.Math.Linear(o.fromX, o.toX, Phaser.Math.Easing.Sine.InOut(k));
            o.img.angle = Math.sin(k * Math.PI) * (o.toX > o.fromX ? 8 : -8);
          }
          if (o.changeT < 1.5 && blink) {
            const sx = o.toX > o.fromX ? 1 : -1;
            g.fillStyle(0xffa500, 1).fillRect(o.x + sx * (o.w / 2) - 5, o.y - o.h / 2 + 4, 10, 10).fillRect(o.x + sx * (o.w / 2) - 5, o.y + o.h / 2 - 14, 10, 10);
          }
        }
        o.img.x = o.x;
      }
      o.img.y = o.y;

      const dx = Math.abs(o.x - this.px), dy = Math.abs(o.y - PY);
      if (!o.hit && o.kind !== 'tree' && this.lives > 0) {
        if (o.kind === 'coin' && dx < 50 && dy < 70) {
          o.hit = true;
          this.addScore(25);
          this.sfxAt(rng.pick(['coin1', 'coin2']), o.x, { volume: 0.4 });
          burst(this, o.x, o.y, [0xffd23f, 0xffffff], 10, 200);
          this.tweens.killTweensOf(o.img);
          this.tweens.add({ targets: o.img, y: o.y - 60, alpha: 0, scale: 0.6, duration: 250 });
        } else if (o.kind === 'fuel' && dx < 60 && dy < 80) {
          o.hit = true;
          this.fuel = Math.min(100, this.fuel + 45);
          this.addScore(20);
          this.sfxAt('fuel', o.x, { volume: 0.6 });
          softFlash(this, 0x5dff7a, 150, 0.2);
          burst(this, o.x, o.y, [0x5dff7a, 0xffffff], 16, 260);
          fpopup(this, o.x, o.y - 40, t('fuelUp'), '#5dff7a', 22);
          this.tweens.killTweensOf(o.img);
          this.tweens.add({ targets: o.img, alpha: 0, scale: 1.8, duration: 250 });
        } else if (o.kind === 'oil' && dx < 60 && dy < 70 && this.skid <= 0) {
          o.hit = true;
          this.skid = 0.6;
          this.skidDir = this.px < 360 ? 1 : -1;
          this.sfxAt('skid', this.px, { volume: 0.6 });
          fpopup(this, this.px, PY - 120, t('oil'), '#ffd23f', 22);
        } else if ((o.kind === 'car' || o.kind === 'cone' || o.kind === 'barrel') && dx < (PW + o.w) / 2 && dy < (PH + o.h) / 2) {
          if (o.kind === 'car') this.crash(o);
          else if (this.invuln <= 0) {
            o.hit = true;
            this.sfxAt('bump', o.x, { volume: 0.55 });
            this.speed *= 0.75;
            this.fuel = Math.max(0, this.fuel - 8);
            shake(this, 0.01, 160);
            burst(this, o.x, o.y, [0xff8c00, 0xffffff], 14, 260);
            fpopup(this, o.x, o.y - 50, `-8 ${t('fuel')}`, '#ff9a7a', 18);
            this.tweens.add({ targets: o.img, x: o.x + rng.int(-120, 120), y: o.y - 200, angle: 360, alpha: 0, duration: 500 });
            o.speed = this.speed;     // tumble along with the car
          }
        }
      }
      // passing a car closely is a near miss
      if (o.kind === 'car' && !o.passed && !o.hit && o.y - o.h / 2 > PY - PH / 2) {
        o.passed = true;
        const gap = dx - (PW + o.w) / 2;
        if (gap < NEAR_GAP && gap >= -2 && this.invuln <= 0 && this.lives > 0) this.nearMiss(o);
      }
      if (o.y > 1400 || o.y < -400) { o.img.destroy(); this.things.splice(i, 1); }
    }

    this.drawCarFx(g, dt);
    this.drawUi(blink);
    this.updateEngine();
  }

  /** Tyre marks: laid on hard braking, sharp swerves and oil, then carried away with the road. */
  private updateMarks(dt: number, scroll: number): void {
    const swerve = Math.abs(this.pvx) > this.steerV * 0.8 && this.speed > 700;
    const lay = this.started && this.lives > 0 && (this.skid > 0 || (this.braking && this.speed > 420) || swerve);
    if (lay) {
      const a = this.skid > 0 ? 0.5 : this.braking ? 0.4 : 0.22;
      for (const side of [-1, 1]) this.marks.push({ x: this.px + side * 20, y: PY + 40, h: scroll + 2, a });
    }
    const mg = this.marksG;
    mg.clear();
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.y += scroll;
      if (m.y > 1320) { this.marks.splice(i, 1); continue; }
      mg.fillStyle(0x15161a, m.a).fillRect(m.x - 4, m.y, 8, m.h);
    }
    if (this.marks.length > 600) this.marks.splice(0, this.marks.length - 600);
    // boost and top speed: streaks of wind rush past
    this.streakT -= dt;
    const fast = this.boosting || this.speed > 950;
    if (fast && this.streakT <= 0) {
      this.streakT = this.boosting ? 0.025 : 0.07;
      this.streaks.push({ x: rng.int(20, 700), y: -80, len: rng.int(80, 200), a: rng.int(25, 55) / 100 });
    }
  }

  private drawCarFx(g: Phaser.GameObjects.Graphics, dt: number): void {
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.y += (this.speed * 1.6 + 600) * dt;
      s.a -= dt * 0.9;
      if (s.y > 1300 || s.a <= 0) { this.streaks.splice(i, 1); continue; }
      g.fillStyle(0xffffff, s.a).fillRect(s.x - 1.5, s.y, 3, s.len);
    }
    if (this.lives <= 0) return;
    // brake lights glow at the back of the car
    if (this.braking) {
      const r = Phaser.Math.DegToRad(this.car.angle);
      for (const side of [-1, 1]) {
        const lx = side * 17, ly = 52;
        const x = this.px + lx * Math.cos(r) - ly * Math.sin(r), y = PY + lx * Math.sin(r) + ly * Math.cos(r);
        g.fillStyle(0xff2a2a, 0.35).fillCircle(x, y, 14);
        g.fillStyle(0xff5050, 1).fillRect(x - 7, y - 3, 14, 6);
      }
    }
  }

  private drawUi(blink: boolean): void {
    const u = this.uiG;
    u.clear();
    // fuel gauge
    const low = this.fuel < 25;
    u.fillStyle(0x000000, 0.55).fillRoundedRect(20, 84, 300, 32, 10);
    if (low) u.lineStyle(3, 0xec3013, blink ? 1 : 0.4).strokeRoundedRect(20, 84, 300, 32, 10);
    u.fillStyle(low ? (blink ? 0xec3013 : 0x8f1020) : this.fuel < 50 ? 0xffd23f : 0x5dff7a, 1).fillRoundedRect(64, 90, 250 * (this.fuel / 100), 20, 6);
    const wob = low ? Math.sin(this.elapsed * 30) * 2 : 0;
    u.fillStyle(0xd62828, 1).fillRoundedRect(28 + wob, 88, 26, 24, 4);
    u.fillStyle(0xffd23f, 1).fillRect(34 + wob, 98, 14, 4);
    if (this.combo > 0) {
      const k = Math.max(0, this.comboT / 3);
      u.fillStyle(0x000000, 0.45).fillRoundedRect(20, 164, 160, 10, 4);
      u.fillStyle(0x3ee6ff, 0.9).fillRoundedRect(20, 164, 160 * k, 10, 4);
    }
    // speed panel
    u.fillStyle(0x000000, 0.45).fillRoundedRect(548, 130, 160, 70, 12);
    this.speedText.setText(`${Math.round(this.speed * 0.2)} ${t('kmh')}`).setColor(this.boosting ? '#ff9a2a' : this.braking ? '#ff6a6a' : '#3ee6ff');
    this.distText.setText(`${(this.dist / 1000).toFixed(2)} ${t('km')}`);
    // the screen edges pulse red while the tank runs low
    const want = low && this.started && !this.isOver ? 0.55 + Math.sin(this.elapsed * 7) * 0.35 : 0;
    this.edge.setAlpha(this.edge.alpha + (want - this.edge.alpha) * 0.2);
  }

  private updateEngine(): void {
    const e = this.engine as Phaser.Sound.WebAudioSound | null;
    if (!e) return;
    const k = Phaser.Math.Clamp(this.speed / MAX_SPEED, 0, 1.4);
    try {
      e.setRate(0.7 + k * 0.75 + (this.boosting ? 0.2 : 0));
      e.setVolume(this.started ? 0.06 + k * 0.05 + (this.boosting ? 0.03 : 0) : 0.03);
    } catch { /* not started */ }
  }
}
