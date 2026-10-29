import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, t, rng, ensurePixel } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

const ROAD_L = 120, ROAD_R = 600, LANE_W = 120, LANES = 4;
const LANE_X = [180, 300, 420, 540];
const PY = 1060;                         // player car centre
const PW = 54, PH = 112;                 // player hitbox
const MAX_SPEED = 1150;
const FUEL_DRAIN = 2.6;                  // per second

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
  g.destroy();
}

type Kind = 'car' | 'coin' | 'fuel' | 'cone' | 'barrel' | 'oil' | 'tree';
interface Thing {
  kind: Kind; img: Phaser.GameObjects.Image; x: number; y: number; w: number; h: number; speed: number;
  passed: boolean; hit: boolean; changer: boolean; changeT: number; fromX: number; toX: number; lane: number;
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private grassL!: Phaser.GameObjects.TileSprite;
  private grassR!: Phaser.GameObjects.TileSprite;
  private lines!: Phaser.GameObjects.TileSprite;
  private fxG!: Phaser.GameObjects.Graphics;
  private uiG!: Phaser.GameObjects.Graphics;
  private car!: Phaser.GameObjects.Image;
  private speedText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private exhaust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private things: Thing[] = [];
  private px = 360;
  private pvx = 0;
  private speed = 0;
  private targetX: number | null = null;
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
  private carT = 0; private coinT = 0; private fuelT = 0; private obstT = 0; private treeT = 0;
  private lowT = 0;
  private driveT = 0;

  createGame(): void {
    freshTextCanvases(this);
    makeRacerTextures(this);
    this.things = [];
    this.px = 360; this.pvx = 0; this.speed = 0; this.targetX = null; this.lives = 3; this.fuel = 100; this.dist = 0; this.distScore = 0;
    this.level = 1; this.invuln = 0; this.skid = 0; this.skidDir = 0; this.combo = 0; this.comboT = 0; this.started = false; this.outOfFuel = false;
    this.carT = 1.2; this.coinT = 2; this.fuelT = 9; this.obstT = 6; this.treeT = 0; this.lowT = 0; this.driveT = 0;

    this.grassL = this.add.tileSprite(0, 0, ROAD_L, 1280, 'grass').setOrigin(0).setDepth(0);
    this.grassR = this.add.tileSprite(ROAD_R, 0, 720 - ROAD_R, 1280, 'grass').setOrigin(0).setDepth(0);
    this.add.rectangle(ROAD_L, 0, ROAD_R - ROAD_L, 1280, 0x3a3d45).setOrigin(0).setDepth(0);
    this.lines = this.add.tileSprite(ROAD_L, 0, ROAD_R - ROAD_L, 1280, 'tr-lines').setOrigin(0).setDepth(1);
    this.fxG = this.add.graphics().setDepth(6);
    this.uiG = this.add.graphics().setDepth(20);
    for (let i = 0; i < 6; i++) this.spawnTree(rng.int(0, 1200));

    this.exhaust = this.add.particles(0, 0, ensurePixel(this), {
      speedY: { min: 120, max: 220 }, speedX: { min: -25, max: 25 }, scale: { start: 2, end: 5 }, alpha: { start: 0.4, end: 0 },
      lifespan: 380, frequency: 45, tint: 0xbbbbbb,
    }).setDepth(4);
    this.car = this.add.image(this.px, PY + 300, 'player').setDepth(5);
    this.tweens.add({ targets: this.car, y: PY, duration: 700, ease: 'Cubic.easeOut' });

    this.speedText = ftxt(this, 696, 100, '', { title: true, size: 20, color: '#3ee6ff' }).setOrigin(1, 0.5).setDepth(21);
    this.distText = ftxt(this, 24, 1250, '', { title: true, size: 18, color: '#ffffff' }).setOrigin(0, 0.5).setDepth(21);

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 590 && p.y < 140) return;
      this.targetX = p.x;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown && this.targetX !== null) this.targetX = p.x; });
    this.input.on('pointerup', () => { this.targetX = null; });

    this.updateHud();
    // countdown
    const steps = ['3', '2', '1', t('go')];
    steps.forEach((s, i) => this.time.delayedCall(300 + i * 450, () => {
      if (this.isOver) return;
      this.banner(s, i === 3 ? '#5dff7a' : '#ffd23f', i === 3 ? 56 : 72, 380);
      this.sfx('beep', { volume: 0.5, rate: i === 3 ? 1.5 : 1, exact: true });
      if (i === 3) { this.started = true; this.speed = 480; }
    }));
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
  }

  private banner(text: string, color: string, size = 44, hold = 900): void {
    const a = ftxt(this, 360, 540, text, { title: true, size, color, strokeThickness: 10, wrap: 660 }).setDepth(30).setScale(0.3);
    this.tweens.add({ targets: a, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: a, alpha: 0, delay: hold, duration: 250, onComplete: () => a.destroy() });
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
    th.changer = this.level >= 2 && rng.chance(Math.min(0.55, 0.15 + this.level * 0.07));
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
    if (!this.laneFree(lane, 300)) return;
    const r = Math.random();
    if (this.level >= 4 && r < 0.35) this.put('oil', 'oil', LANE_X[lane] + rng.int(-20, 20), -100, 0, 0.9);
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
    shake(this, 0.025, 380);
    softFlash(this, 0xec3013, 220, 0.4);
    burst(this, (this.px + o.x) / 2, (PY + o.y) / 2, [0xffd23f, 0xec3013, 0x555555, 0xffffff], 40, 460);
    this.banner(t('crash'), '#ec3013', 48, 600);
    // knock the other vehicle away
    const dir = o.x < this.px ? -1 : 1;
    this.tweens.add({ targets: o.img, angle: dir * rng.int(120, 260), x: o.x + dir * 160, alpha: 0, duration: 700, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.car, angle: { from: -dir * 30, to: 0 }, duration: 500, ease: 'Back.easeOut' });
    if (this.lives <= 0) {
      this.car.setTint(0x555555);
      burst(this, this.px, PY, [0xec3013, 0xffd23f], 60, 520);
      this.endGame({ delay: 1100 });
    }
  }

  private nearMiss(o: Thing): void {
    this.combo = Math.min(5, this.combo + 1);
    this.comboT = 3;
    const pts = 50 * this.combo;
    this.addScore(pts);
    this.sfxAt('near', o.x, { volume: 0.45, rate: 1 + this.combo * 0.08 });
    fpopup(this, (this.px + o.x) / 2, PY - 110, this.combo > 1 ? `${t('near')} x${this.combo}` : t('near'), '#3ee6ff', 22);
    fpopup(this, (this.px + o.x) / 2, PY - 60, `+${pts}`, '#ffd23f', 22);
    burst(this, (this.px + o.x) / 2, PY - 20, [0x3ee6ff, 0xffffff], 12, 220);
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    if (this.started && !this.outOfFuel) {
      this.driveT += dt;
      const target = Math.min(MAX_SPEED, 480 + (this.level - 1) * 75 + Math.min(70, this.driveT * 2));
      this.speed += Phaser.Math.Clamp(target - this.speed, -400 * dt, 160 * dt);
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * dt * (0.8 + this.speed / 2400));
      if (this.fuel <= 0) {
        this.outOfFuel = true;
        this.sfx('empty', { volume: 0.65 });
        this.banner(t('outOfFuel'), '#ec3013', 40, 1400);
        this.endGame({ title: t('outOfFuel'), delay: 1600 });
      }
      if (this.fuel < 25) {
        this.lowT -= dt;
        if (this.lowT <= 0) { this.lowT = 2; this.sfx('low', { volume: 0.35, exact: true }); fpopup(this, 160, 150, t('lowFuel'), '#ec3013', 18); }
      }
    } else if (this.outOfFuel) this.speed = Math.max(0, this.speed - 500 * dt);

    // steering
    const c = this.controls;
    let want = 0;
    if (this.targetX !== null) want = Phaser.Math.Clamp((this.targetX - this.px) / 60, -1, 1);
    else want = c.axisX;
    if (this.skid > 0) { this.skid -= dt; want = this.skidDir; }
    const maxV = 640;
    this.pvx += (want * maxV - this.pvx) * Math.min(1, dt * 10);
    if (!this.started) this.pvx = 0;
    this.px = Phaser.Math.Clamp(this.px + this.pvx * dt, ROAD_L + 34, ROAD_R - 34);
    if (this.px <= ROAD_L + 34 || this.px >= ROAD_R - 34) this.pvx *= 0.5;
    this.car.x = this.px;
    if (this.skid <= 0) this.car.angle = this.pvx * 0.018;
    else this.car.angle += this.skidDir * 600 * dt;
    this.car.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 12) % 2 ? 0.35 : 1) : 1);
    this.exhaust.setPosition(this.px, PY + 66);

    // scrolling world
    this.lines.tilePositionY -= this.speed * dt;
    this.grassL.tilePositionY -= this.speed * dt;
    this.grassR.tilePositionY -= this.speed * dt;
    const meters = (this.speed * 0.2 * dt) / 3.6;
    this.dist += meters;
    this.distScore += meters / 10;
    if (this.distScore >= 1) { const n = Math.floor(this.distScore); this.distScore -= n; this.addScore(n); }
    const lvl = 1 + Math.floor(this.dist / 900);
    if (lvl > this.level) {
      this.level = lvl;
      this.updateHud();
      this.sfx('level', { volume: 0.55, exact: true });
      this.banner(`${t('level')} ${lvl}`, '#5dff7a', 44);
      softFlash(this, 0x5dff7a, 200, 0.2);
    }

    // spawners
    if (this.started && !this.outOfFuel) {
      const rate = this.speed / 500;
      this.carT -= dt * rate; this.coinT -= dt; this.fuelT -= dt; this.obstT -= dt; this.treeT -= dt * rate;
      if (this.carT <= 0) { this.carT = Math.max(0.42, 1.3 - (this.level - 1) * 0.12) * rng.int(80, 120) / 100; this.spawnCar(); }
      if (this.coinT <= 0) { this.coinT = rng.int(25, 40) / 10; this.spawnCoins(); }
      if (this.fuelT <= 0) { this.fuelT = rng.int(85, 120) / 10 + this.level * 0.4; this.spawnFuel(); }
      if (this.level >= 3 && this.obstT <= 0) { this.obstT = Math.max(2, 6 - this.level * 0.4); this.spawnObstacle(); }
      if (this.treeT <= 0) { this.treeT = rng.int(4, 10) / 10; this.spawnTree(); }
    }

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
      if (!o.hit && o.kind !== 'tree') {
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
            this.tweens.add({ targets: o.img, x: o.x + rng.int(-120, 120), y: o.y - 200, angle: 360, alpha: 0, duration: 500 });
            o.speed = this.speed;     // tumble along with the car
          }
        }
      }
      // passing a car closely is a near miss
      if (o.kind === 'car' && !o.passed && !o.hit && o.y - o.h / 2 > PY - PH / 2) {
        o.passed = true;
        const gap = dx - (PW + o.w) / 2;
        if (gap < 40 && gap >= -2 && this.invuln <= 0) this.nearMiss(o);
      }
      if (o.y > 1400 || o.y < -400) { o.img.destroy(); this.things.splice(i, 1); }
    }

    // ui: fuel gauge + speed + distance
    const u = this.uiG;
    u.clear();
    u.fillStyle(0x000000, 0.55).fillRoundedRect(20, 84, 300, 32, 10);
    const low = this.fuel < 25;
    u.fillStyle(low ? (blink ? 0xec3013 : 0x8f1020) : this.fuel < 50 ? 0xffd23f : 0x5dff7a, 1).fillRoundedRect(64, 90, 250 * (this.fuel / 100), 20, 6);
    u.fillStyle(0xd62828, 1).fillRoundedRect(28, 88, 26, 24, 4);
    u.fillStyle(0xffd23f, 1).fillRect(34, 98, 14, 4);
    if (this.combo > 1) {
      u.fillStyle(0x3ee6ff, 0.8).fillRoundedRect(20, 124, 26 * this.combo, 10, 4);
    }
    this.speedText.setText(`${Math.round(this.speed * 0.2)} ${t('kmh')}`);
    this.distText.setText(`${(this.dist / 1000).toFixed(2)} ${t('km')}`);
  }
}
