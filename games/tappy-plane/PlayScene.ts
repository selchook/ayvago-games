import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, txt, t, rng } from '@core';

interface Obstacle {
  x: number;
  gapY: number;
  baseGapY: number;
  gap: number;
  amp: number;
  phase: number;
  top: Phaser.GameObjects.Image;
  bot: Phaser.GameObjects.Image;
  passed: boolean;
}

const BIOMES = [
  { ground: 'ground-grass', rock: 'rockgrass', tint: 0xffffff },
  { ground: 'ground-dirt', rock: 'rock', tint: 0xffe2c4 },
  { ground: 'ground-snow', rock: 'rocksnow', tint: 0xf4f8ff },
  { ground: 'ground-ice', rock: 'rockice', tint: 0xc9e6ff },
];
const MEDALS: Array<[number, string, number]> = [[10, 'bronze', 50], [25, 'silver', 100], [50, 'gold', 250]];

const ROCK_W = 150;
const GROUND_H = 110;
const EDGE = 74;           // solid part of ground / ceiling
const GRAVITY = 2050;
const FLAP_V = -700;
const SPACING = 470;

export class PlayScene extends ArcadeScene {
  private bg!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private ceiling!: Phaser.GameObjects.TileSprite;
  private plane!: Phaser.GameObjects.Sprite;
  private puffs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readyGroup: Phaser.GameObjects.GameObject[] = [];
  private obstacles: Obstacle[] = [];
  private stars: Phaser.GameObjects.Image[] = [];
  private state: 'ready' | 'fly' | 'dead' = 'ready';
  private vy = 0;
  private gaps = 0;
  private biome = 0;
  private nextSpawnX = 0;
  private puffCd = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.obstacles = []; this.stars = []; this.readyGroup = [];
    this.state = 'ready'; this.vy = 0; this.gaps = 0; this.biome = 0; this.puffCd = 0;

    this.cameras.main.setBackgroundColor('#d5ecf5');
    this.bg = this.add.tileSprite(0, 0, width, height, 'bg').setOrigin(0).setDepth(0);
    this.bg.tileScaleX = this.bg.tileScaleY = height / 480;

    const gs = GROUND_H / 71;
    this.ground = this.add.tileSprite(0, height - GROUND_H, width, GROUND_H, BIOMES[0].ground).setOrigin(0).setDepth(20);
    this.ground.tileScaleX = this.ground.tileScaleY = gs;
    this.ceiling = this.add.tileSprite(0, 0, width, GROUND_H, BIOMES[0].ground).setOrigin(0).setDepth(20).setFlipY(true);
    this.ceiling.tileScaleX = this.ceiling.tileScaleY = gs;

    if (!this.anims.exists('prop')) {
      this.anims.create({ key: 'prop', frames: [{ key: 'plane1' }, { key: 'plane2' }, { key: 'plane3' }, { key: 'plane2' }], frameRate: 18, repeat: -1 });
    }
    this.plane = this.add.sprite(width * 0.3, height * 0.45, 'plane1').setDepth(30).play('prop');

    this.puffs = this.add.particles(0, 0, 'puff-s', {
      speedX: { min: -260, max: -160 }, speedY: { min: -30, max: 30 },
      scale: { start: 1.1, end: 0.2 }, alpha: { start: 0.9, end: 0 }, lifespan: 650, emitting: false,
    }).setDepth(25);

    // "get ready" overlay
    const title = txt(this, width / 2, height * 0.26, t('getReady'), { title: true, size: 46, color: '#ffd23f', strokeThickness: 10 });
    const sub = txt(this, width / 2, height * 0.34, t('tapFly'), { size: 34 });
    const tap = this.add.image(width * 0.3, height * 0.58, 'tap').setScale(1.6).setDepth(40);
    this.tweens.add({ targets: tap, y: tap.y + 18, duration: 420, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: title, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    for (const o of [title, sub]) o.setDepth(40);
    this.readyGroup = [title, sub, tap];

    this.nextSpawnX = width + 120;
    this.updateHud();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;   // pause button
      this.tapInput();
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'Enter'].includes(e.code)) this.tapInput();
    });
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('gaps')} ${this.gaps}`);
  }

  private tapInput(): void {
    if (this.isOver || this.state === 'dead') return;
    if (this.state === 'ready') {
      this.state = 'fly';
      for (const o of this.readyGroup) this.tweens.add({ targets: o, alpha: 0, duration: 250, onComplete: () => o.destroy() });
    }
    this.vy = FLAP_V;
    this.sfx(rng.pick(['flap1', 'flap2']), { volume: 0.32 });
    this.puffs.emitParticleAt(this.plane.x - 40, this.plane.y + 6, 3);
    this.tweens.add({ targets: this.plane, scaleX: 1.12, scaleY: 0.9, duration: 70, yoyo: true });
  }

  private speed(): number {
    return Math.min(470, 280 + this.gaps * 4.5);
  }

  private spawnObstacle(x: number): void {
    const { height } = this.scale;
    const gap = Math.max(265, 400 - this.gaps * 4);
    const minY = EDGE + gap / 2 + 70, maxY = height - EDGE - gap / 2 - 70;
    const gapY = rng.int(minY, maxY);
    const amp = this.gaps >= 18 && rng.chance(Math.min(0.7, 0.25 + (this.gaps - 18) * 0.02))
      ? Math.min(Math.min(gapY - minY, maxY - gapY) + 40, 60 + (this.gaps - 18) * 2.5) : 0;
    const key = BIOMES[this.biome].rock;
    const top = this.add.image(x, 0, key + 'down').setOrigin(0.5, 0).setDepth(10);
    const bot = this.add.image(x, 0, key).setOrigin(0.5, 1).setDepth(10);
    const o: Obstacle = { x, gapY, baseGapY: gapY, gap, amp, phase: rng.int(0, 628) / 100, top, bot, passed: false };
    this.layout(o);
    this.obstacles.push(o);
    // a bonus star floats between this gap and the next one
    if (rng.chance(0.45)) {
      const s = this.add.image(x + SPACING / 2, rng.int(EDGE + 150, height - EDGE - 150), 'star').setDepth(15).setScale(1.3);
      this.tweens.add({ targets: s, angle: 360, duration: 2400, repeat: -1 });
      this.stars.push(s);
    }
  }

  private layout(o: Obstacle): void {
    const { height } = this.scale;
    const topH = o.gapY - o.gap / 2 - 20, botH = height - 20 - (o.gapY + o.gap / 2);
    o.top.setPosition(o.x, 20).setDisplaySize(ROCK_W, topH);
    o.bot.setPosition(o.x, height - 20).setDisplaySize(ROCK_W, botH);
  }

  private hitsRock(o: Obstacle, c: Phaser.Geom.Circle): boolean {
    const { height } = this.scale;
    const hw = ROCK_W / 2 * 0.86;
    const botBase = height - 20, botTip = o.gapY + o.gap / 2;
    const topBase = 20, topTip = o.gapY - o.gap / 2;
    const triB = new Phaser.Geom.Triangle(o.x - hw, botBase, o.x + hw, botBase, o.x - ROCK_W / 2 + ROCK_W * 0.63, botTip + 8);
    const triT = new Phaser.Geom.Triangle(o.x - hw, topBase, o.x + hw, topBase, o.x - ROCK_W / 2 + ROCK_W * 0.57, topTip - 8);
    return Phaser.Geom.Intersects.TriangleToCircle(triB, c) || Phaser.Geom.Intersects.TriangleToCircle(triT, c);
  }

  private passGap(o: Obstacle): void {
    o.passed = true;
    this.gaps++;
    this.addScore(10, this.plane.x + 40, this.plane.y - 60);
    this.sfx('pass', { volume: 0.4 });
    this.updateHud();
    for (const [n, m, bonus] of MEDALS) if (this.gaps === n) this.medal(m, bonus);
    if (this.gaps % 12 === 0) this.nextBiome();
  }

  private medal(kind: string, bonus: number): void {
    const { width, height } = this.scale;
    const img = this.add.image(width / 2, height * 0.3, 'medal-' + kind).setDepth(60).setScale(0);
    const label = txt(this, width / 2, height * 0.3 + 100, t(kind), { title: true, size: 28, color: '#ffd23f' }).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: img, scale: 1.3, duration: 450, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, alpha: 1, duration: 300 });
    this.tweens.add({ targets: [img, label], alpha: 0, delay: 1600, duration: 400, onComplete: () => { img.destroy(); label.destroy(); } });
    burst(this, width / 2, height * 0.3, [0xffd23f, 0xffffff, 0xff4fa3], 50, 420);
    this.addScore(bonus, width / 2, height * 0.3 - 80);
    this.sfx('medal', { volume: 0.6, exact: true });
  }

  private nextBiome(): void {
    this.biome = (this.biome + 1) % BIOMES.length;
    const b = BIOMES[this.biome];
    this.ground.setTexture(b.ground);
    this.ceiling.setTexture(b.ground);
    this.bg.setTint(b.tint);
    flash(this, 0xffffff, 200);
    this.sfx('biome', { volume: 0.45 });
  }

  private crash(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    const { height } = this.scale;
    this.sfx('crash', { volume: 0.7 });
    this.time.delayedCall(120, () => this.sfx('fall', { volume: 0.45 }));
    shake(this, 0.025, 320);
    flash(this, 0xec3013, 160);
    burst(this, this.plane.x, this.plane.y, [0xec3013, 0xffd23f, 0x444444], 40, 420);
    this.plane.anims.stop();
    this.plane.setTint(0x999999);
    this.tweens.add({ targets: this.plane, y: height - EDGE - 20, angle: 90, duration: 600, ease: 'Quad.easeIn' });
    this.endGame({ delay: 1100, title: t('crashed') });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const flying = this.state === 'fly';
    const sp = this.state === 'ready' ? 140 : this.speed();

    this.bg.tilePositionX += sp * dt * 0.15 / this.bg.tileScaleX;
    this.ground.tilePositionX += sp * dt / this.ground.tileScaleX;
    this.ceiling.tilePositionX += sp * dt / this.ceiling.tileScaleX;

    if (this.state === 'ready') {
      this.plane.y = height * 0.45 + Math.sin(this.elapsed * 4) * 16;
      return;
    }
    if (!flying) return;

    // plane physics
    this.vy = Math.min(950, this.vy + GRAVITY * dt);
    this.plane.y += this.vy * dt;
    const targetAngle = Phaser.Math.Clamp(this.vy * 0.06, -28, 75);
    this.plane.angle += (targetAngle - this.plane.angle) * Math.min(1, dt * 10);
    this.puffCd -= dt;
    if (this.puffCd <= 0) { this.puffCd = 0.12; this.puffs.emitParticleAt(this.plane.x - 44, this.plane.y + 4, 1); }

    // world scroll + spawning
    const dx = sp * dt;
    this.nextSpawnX -= dx;
    if (this.nextSpawnX <= width + 120) { this.spawnObstacle(this.nextSpawnX); this.nextSpawnX += SPACING; }

    const body = new Phaser.Geom.Circle(this.plane.x + 4, this.plane.y + 4, 27);
    for (const o of this.obstacles) {
      o.x -= dx;
      if (o.amp) o.gapY = o.baseGapY + Math.sin(this.elapsed * 1.8 + o.phase) * o.amp;
      this.layout(o);
      if (!o.passed && o.x < this.plane.x - ROCK_W / 2) this.passGap(o);
      if (Math.abs(o.x - this.plane.x) < ROCK_W && this.hitsRock(o, body)) { this.crash(); return; }
    }
    this.obstacles = this.obstacles.filter((o) => {
      if (o.x > -ROCK_W) return true;
      o.top.destroy(); o.bot.destroy();
      return false;
    });

    this.stars = this.stars.filter((s) => {
      s.x -= dx;
      if (Phaser.Math.Distance.Between(s.x, s.y, this.plane.x, this.plane.y) < 55) {
        burst(this, s.x, s.y, [0xffd23f, 0xffffff], 18, 260);
        this.addScore(25, s.x, s.y - 30);
        this.sfx('star', { volume: 0.55 });
        s.destroy();
        return false;
      }
      if (s.x < -60) { s.destroy(); return false; }
      return true;
    });

    if (this.plane.y + 24 > height - EDGE || this.plane.y - 24 < EDGE) this.crash();
  }
}
