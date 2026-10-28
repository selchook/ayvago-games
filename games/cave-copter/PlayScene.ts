import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';

const W = 720, H = 1280;
const SL = 24;                 // cave slice width
const TOPMIN = 110;            // ceiling never goes above the HUD
const HX = 180;                // helicopter screen x
const ZONE_LEN = 4000;         // px per zone (400 m)

interface Slice { x: number; top: number; bot: number; }
interface Spike { img: Phaser.GameObjects.Image; x: number; base: number; tip: number; w: number; fromTop: boolean; }
interface Star { img: Phaser.GameObjects.Image; x: number; y: number; }

const BIOMES = [
  { wall: 0x3b2618, edge: 0x8a5a3a, bg: 0x1a110c, up: 'rock', down: 'rockdown' },
  { wall: 0x23331c, edge: 0x6fbf3f, bg: 0x0f1a0e, up: 'rockgrass', down: 'rockgrassdown' },
  { wall: 0x1b3346, edge: 0x9fe8ff, bg: 0x0b1620, up: 'rockice', down: 'rockicedown' },
  { wall: 0x3a3440, edge: 0xf3f2f2, bg: 0x16131a, up: 'rocksnow', down: 'rocksnowdown' },
  { wall: 0x3a1410, edge: 0xff7a3d, bg: 0x1d0a08, up: 'rock', down: 'rockdown' },
];

export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('heli')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // helicopter body facing right, 120x70
  g.fillStyle(0x9a1d0b).fillRect(6, 32, 40, 10);
  g.fillStyle(0xec3013).fillRect(6, 30, 40, 8);
  g.fillStyle(0xec3013).fillTriangle(0, 14, 12, 14, 14, 36);
  g.fillStyle(0xcccccc).fillCircle(7, 22, 7);
  g.fillStyle(0x666666).fillCircle(7, 22, 3);
  g.fillStyle(0x9a1d0b).fillEllipse(72, 42, 74, 42);
  g.fillStyle(0xec3013).fillEllipse(72, 39, 72, 36);
  g.fillStyle(0x9fe8ff).fillEllipse(88, 36, 30, 22);
  g.fillStyle(0xffffff, 0.7).fillEllipse(92, 31, 10, 6);
  g.fillStyle(0xffd23f).fillRect(48, 40, 18, 4);
  g.fillStyle(0x333333).fillRect(68, 10, 8, 14);
  g.lineStyle(4, 0x333333).lineBetween(54, 58, 54, 66).lineBetween(88, 58, 88, 66);
  g.lineStyle(5, 0x333333).lineBetween(40, 66, 100, 66);
  g.generateTexture('heli', 120, 70);
  g.clear();
  g.fillStyle(0x444444).fillRoundedRect(0, 0, 130, 8, 4);
  g.fillStyle(0x888888).fillRect(4, 2, 122, 3);
  g.generateTexture('rotor', 130, 8);
  g.clear();
  // parallax back layer: soft rock silhouettes (tinted per zone)
  g.fillStyle(0xffffff, 1);
  for (let x = 0; x < 512; x += 64) {
    const h1 = 120 + ((x * 37) % 140), h2 = 100 + ((x * 53) % 160);
    g.fillTriangle(x, 0, x + 64, 0, x + 32, h1);
    g.fillTriangle(x + 10, 1280, x + 74, 1280, x + 40, 1280 - h2);
  }
  g.fillRect(0, 0, 512, 40).fillRect(0, 1240, 512, 40);
  g.generateTexture('backrocks', 512, 1280);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private heli!: Phaser.GameObjects.Container;
  private rotor!: Phaser.GameObjects.Image;
  private wallG!: Phaser.GameObjects.Graphics;
  private back!: Phaser.GameObjects.TileSprite;
  private bgRect!: Phaser.GameObjects.Rectangle;
  private puffs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hint!: Phaser.GameObjects.Text;
  private slices: Slice[] = [];
  private spikes: Spike[] = [];
  private stars: Star[] = [];
  private camX = 0;
  private hy = 640;
  private vy = 0;
  private speed = 300;
  private started = false;
  private dead = false;
  private touching = false;
  private center = 690;
  private centerTarget = 690;
  private gap = 820;
  private sinceTurn = 0;
  private nextSpike = 1400;
  private nextStar = 900;
  private zone = 0;
  private bonus = 0;
  private lastMeters = 0;
  private hp = 3;
  private invuln = 0;

  createGame(): void {
    makeTextures(this);
    this.slices = []; this.spikes = []; this.stars = [];
    this.camX = 0; this.hy = 640; this.vy = 0; this.speed = 300; this.started = false; this.dead = false; this.touching = false;
    this.center = 690; this.centerTarget = 690; this.gap = 820; this.sinceTurn = 0;
    this.nextSpike = 1500; this.nextStar = 900; this.zone = 0; this.bonus = 0; this.lastMeters = 0; this.hp = 3; this.invuln = 0;

    this.bgRect = this.add.rectangle(0, 0, W, H, BIOMES[0].bg).setOrigin(0);
    this.back = this.add.tileSprite(0, 0, W, H, 'backrocks').setOrigin(0).setTint(BIOMES[0].wall).setAlpha(0.55);
    this.wallG = this.add.graphics().setDepth(10);
    this.puffs = this.add.particles(0, 0, 'puffsmall', {
      lifespan: 700, speedX: { min: -260, max: -180 }, speedY: { min: -20, max: 20 },
      scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.6, end: 0 }, emitting: false,
    }).setDepth(15);
    this.heli = this.add.container(HX, this.hy).setDepth(20);
    this.rotor = this.add.image(4, -34, 'rotor');
    this.heli.add([this.add.image(0, 0, 'heli'), this.rotor]);

    for (let x = 0; x < W + SL * 2; x += SL) this.genSlice(x);

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!(p.x > W - 130 && p.y < 130)) this.touching = true; });
    const release = () => { this.touching = this.input.manager.pointers.some((p) => p.isDown && !(p.x > W - 130 && p.y < 130)); };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.hint = txt(this, W / 2, 900, t('hold'), { title: true, size: 24, color: '#ffd23f', wrap: 640 }).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
    this.updateHud();
  }

  private updateHud(): void {
    const m = Math.floor(this.camX / 10);
    this.hud.setCenter(`${m} m`);
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.hp)}`);
  }

  private get biome() {
    return BIOMES[this.zone % BIOMES.length];
  }

  private genSlice(x: number): void {
    const d = x;
    const minGap = Math.max(280, 340 - d * 0.001);
    const targetGap = Math.max(minGap, 820 - d * 0.035);
    this.gap = Phaser.Math.Linear(this.gap, targetGap, 0.2);
    this.sinceTurn--;
    if (this.sinceTurn <= 0) {
      this.sinceTurn = rng.int(8, 22);
      const lo = TOPMIN + this.gap / 2 + 20, hi = H - this.gap / 2 - 30;
      this.centerTarget = rng.int(Math.round(lo), Math.round(Math.max(lo, hi)));
    }
    const maxStep = Math.min(26, 9 + d * 0.0012);
    this.center += Phaser.Math.Clamp(this.centerTarget - this.center, -maxStep, maxStep);
    const jag = () => rng.int(-8, 8);
    const top = Math.max(TOPMIN - 30, this.center - this.gap / 2 + jag());
    const bot = Math.min(H + 30, this.center + this.gap / 2 + jag());
    this.slices.push({ x, top, bot });

    // obstacles: rock spikes from the ceiling or floor
    if (x >= this.nextSpike) {
      this.nextSpike = x + Math.max(380, 1000 - d * 0.02) + rng.int(0, 300);
      const fromTop = rng.chance(0.5);
      const room = bot - top;
      const h = Phaser.Math.Clamp(room * (rng.int(30, 52) / 100), 120, room - 230);
      if (h >= 100) {
        const b = this.biome;
        const w = 86;
        const base = fromTop ? top - 30 : bot + 30;
        const tip = fromTop ? base + h + 30 : base - h - 30;
        const img = this.add.image(x - this.camX, base, fromTop ? b.down : b.up).setOrigin(0.5, fromTop ? 0 : 1).setDepth(9);
        img.setDisplaySize(w, Math.abs(tip - base));
        this.spikes.push({ img, x, base, tip, w: w * 0.62, fromTop });
      }
    }
    if (x >= this.nextStar) {
      this.nextStar = x + rng.int(500, 900);
      const y = (top + bot) / 2 + rng.int(-60, 60);
      const clear = this.spikes.every((s) => Math.abs(s.x - x) > 120);
      if (clear) {
        const img = this.add.image(x - this.camX, y, 'stargold').setDepth(14).setScale(1.2);
        this.tweens.add({ targets: img, angle: 360, duration: 2000, repeat: -1 });
        this.stars.push({ img, x, y });
      }
    }
  }

  private wallAt(x: number): { top: number; bot: number } {
    const i = Math.floor((x - this.slices[0].x) / SL);
    const a = this.slices[Phaser.Math.Clamp(i, 0, this.slices.length - 1)];
    const b = this.slices[Phaser.Math.Clamp(i + 1, 0, this.slices.length - 1)];
    const f = Phaser.Math.Clamp((x - a.x) / SL, 0, 1);
    return { top: Phaser.Math.Linear(a.top, b.top, f), bot: Phaser.Math.Linear(a.bot, b.bot, f) };
  }

  private hit(fromCeiling: boolean): void {
    this.hp--;
    this.updateHud();
    if (this.hp <= 0) { this.crash(); return; }
    this.invuln = 2.2;
    this.vy = fromCeiling ? 260 : -420;
    this.sfx('boom', { volume: 0.6 });
    shake(this, 0.018, 260);
    flash(this, 0xec3013, 140);
    burst(this, this.heli.x, this.heli.y, [0xec3013, 0xffd23f, 0x333333], 26, 340);
  }

  private crash(): void {
    if (this.dead) return;
    this.dead = true;
    this.sfx('crash', { volume: 0.6 });
    this.sfx('boom', { volume: 0.6 });
    shake(this, 0.03, 400);
    flash(this, 0xec3013, 180);
    burst(this, this.heli.x, this.heli.y, [0xec3013, 0xffd23f, 0xffffff, 0x333333], 60, 520);
    for (let i = 0; i < 6; i++) this.puffs.emitParticleAt(this.heli.x + rng.int(-30, 30), this.heli.y + rng.int(-20, 20), 1);
    this.tweens.add({ targets: this.heli, angle: 160, y: this.heli.y + 120, alpha: 0, duration: 700, ease: 'Quad.easeIn' });
    this.endGame({ delay: 1000 });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const hold = this.touching || this.controls.a || this.controls.up;
    this.rotor.scaleX = 0.2 + Math.abs(Math.sin(this.elapsed * 40)) * 0.8;
    if (this.dead) return;

    if (!this.started) {
      this.heli.y = this.hy + Math.sin(this.elapsed * 3) * 10;
      if (hold) {
        this.started = true;
        this.sfx('start', { volume: 0.4 });
        this.tweens.add({ targets: this.hint, alpha: 0, duration: 200, onComplete: () => this.hint.destroy() });
      }
      this.drawCave();
      return;
    }

    // flight
    this.vy += (hold ? -2100 : 1500) * dt;
    this.vy = Phaser.Math.Clamp(this.vy, -620, 720);
    this.hy += this.vy * dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.invuln > 0) {
      // while recovering, the walls push the helicopter back instead of hurting it
      const w = this.wallAt(HX + this.camX);
      if (this.hy < w.top + 40) { this.hy = w.top + 40; this.vy = Math.max(this.vy, 120); }
      if (this.hy > w.bot - 40) { this.hy = w.bot - 40; this.vy = Math.min(this.vy, -200); }
    }
    this.heli.setPosition(HX, this.hy).setAngle(this.vy * 0.025);
    this.heli.setAlpha(this.invuln > 0 ? (Math.floor(this.elapsed * 14) % 2 ? 0.35 : 1) : 1);
    if (hold && Math.random() < 0.7) this.puffs.emitParticleAt(HX - 60, this.hy + 2, 1);

    // scroll + difficulty
    this.speed = Math.min(640, 300 + this.camX * 0.012);
    this.camX += this.speed * dt;
    this.back.tilePositionX = this.camX * 0.3;
    while (this.slices[this.slices.length - 1].x < this.camX + W + SL) this.genSlice(this.slices[this.slices.length - 1].x + SL);
    while (this.slices.length > 2 && this.slices[1].x < this.camX - SL) this.slices.shift();

    // zones
    const z = Math.floor(this.camX / ZONE_LEN);
    if (z !== this.zone) {
      this.zone = z;
      this.sfx('zone', { volume: 0.5 });
      this.bonus += 100;
      this.setScore(Math.floor(this.camX / 10) + this.bonus);
      popup(this, W / 2, 560, '+100', '#5dff7a', 34);
      const b = txt(this, W / 2, 480, t('zoneN', { n: z + 1 }), { title: true, size: 44, color: '#ffd23f' }).setDepth(60).setScale(0.3);
      this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
      this.tweens.add({ targets: b, alpha: 0, delay: 1100, duration: 400, onComplete: () => b.destroy() });
      this.bgRect.setFillStyle(this.biome.bg);
      this.back.setTint(this.biome.wall);
      flash(this, this.biome.edge, 120);
    }

    // score = metres + bonus
    const meters = Math.floor(this.camX / 10);
    if (meters !== this.lastMeters) {
      this.lastMeters = meters;
      this.setScore(meters + this.bonus);
      this.updateHud();
      if (meters % 100 === 0) this.sfx('blip', { volume: 0.4 });
    }

    // spikes and stars follow the scroll
    for (const s of this.spikes) s.img.x = s.x - this.camX;
    this.spikes = this.spikes.filter((s) => { if (s.x - this.camX < -100) { s.img.destroy(); return false; } return true; });
    for (const s of this.stars) s.img.x = s.x - this.camX;
    this.stars = this.stars.filter((s) => {
      if (!s.img.active) return false;
      if (s.x - this.camX < -60) { s.img.destroy(); return false; }
      if (Phaser.Math.Distance.Between(s.img.x, s.y, HX, this.hy) < 52) {
        this.bonus += 25;
        this.setScore(meters + this.bonus);
        popup(this, s.img.x, s.y - 30, '+25');
        burst(this, s.img.x, s.y, [0xffd23f, 0xffffff], 18, 260);
        this.sfx('star', { volume: 0.45 });
        s.img.destroy();
        return false;
      }
      return true;
    });

    this.drawCave();

    // collisions: sample the helicopter outline against walls and spikes
    const pts: Array<[number, number]> = [[50, 4], [-56, -10], [0, 26], [0, -26], [30, 18], [30, -16], [-30, 8]];
    const rot = Phaser.Math.DegToRad(this.heli.angle);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (const [px, py] of pts) {
      const x = HX + px * cos - py * sin, y = this.hy + px * sin + py * cos;
      const wall = this.wallAt(x + this.camX);
      if (this.invuln > 0) break;
      if (y < wall.top || y > wall.bot) { this.hit(y < wall.top); return; }
      for (const s of this.spikes) {
        const sx = s.x - this.camX;
        if (Math.abs(sx - x) > s.w) continue;
        if (Phaser.Geom.Triangle.Contains(new Phaser.Geom.Triangle(sx - s.w / 2, s.base, sx + s.w / 2, s.base, sx, s.tip), x, y)) { this.hit(s.fromTop); return; }
      }
    }
  }

  private drawCave(): void {
    const g = this.wallG;
    const b = this.biome;
    g.clear();
    const top: Phaser.Geom.Point[] = [new Phaser.Geom.Point(-SL, 0)];
    const bot: Phaser.Geom.Point[] = [new Phaser.Geom.Point(-SL, H)];
    for (const s of this.slices) {
      const x = s.x - this.camX;
      top.push(new Phaser.Geom.Point(x, s.top));
      bot.push(new Phaser.Geom.Point(x, s.bot));
    }
    const lastX = this.slices[this.slices.length - 1].x - this.camX;
    top.push(new Phaser.Geom.Point(lastX, 0));
    bot.push(new Phaser.Geom.Point(lastX, H));
    g.fillStyle(b.wall, 1).fillPoints(top, true).fillPoints(bot, true);
    g.lineStyle(8, b.edge, 1).strokePoints(top.slice(1, -1), false).strokePoints(bot.slice(1, -1), false);
    g.lineStyle(14, 0x000000, 0.25);
    g.strokePoints(top.slice(1, -1).map((p) => new Phaser.Geom.Point(p.x, p.y - 14)), false);
    g.strokePoints(bot.slice(1, -1).map((p) => new Phaser.Geom.Point(p.x, p.y + 14)), false);
  }
}
