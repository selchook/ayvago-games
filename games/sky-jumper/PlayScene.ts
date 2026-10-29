import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';

export const BIOMES = ['grass', 'sand', 'stone', 'snow', 'cake'];

type Kind = 'normal' | 'move' | 'break';
interface Plat {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  vx: number;
  spring?: Phaser.GameObjects.Image;
  dead: boolean;
}
interface Enemy {
  img: Phaser.GameObjects.Image;
  kind: 'flyman' | 'spikeball' | 'wingman';
  x0: number;
  t: number;
  dead: boolean;
}
interface Item {
  img: Phaser.GameObjects.Image;
  kind: 'carrot' | 'gold' | 'jet';
  plat?: Plat;
}

const GRAVITY = 1850;
const JUMP_V = -1060;
const SPRING_V = -1750;
const MOVE_SPEED = 620;
const PLAT_W = 120;
const SKY = [0x7cc8ef, 0x5aa5e0, 0x3a62b8, 0x22246b, 0x0d0a26];

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.GameObjects.Image;
  private jetpack!: Phaser.GameObjects.Image;
  private flames!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars!: Phaser.GameObjects.TileSprite;
  private hills: Phaser.GameObjects.Image[] = [];
  private plats: Plat[] = [];
  private enemies: Enemy[] = [];
  private items: Item[] = [];
  private vx = 0;
  private vy = 0;
  private startY = 0;
  private topY = 0;          // highest y reached (smallest)
  private lastPlatY = 0;
  private bonus = 0;
  private jet = 0;
  private milestone = 0;
  private dying = false;
  private touchDir = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.plats = []; this.enemies = []; this.items = []; this.hills = [];
    this.vx = 0; this.vy = JUMP_V; this.bonus = 0; this.jet = 0; this.milestone = 0; this.dying = false; this.touchDir = 0;
    this.cameras.main.setScroll(0, 0).setBackgroundColor(SKY[0]);

    // starfield that fades in with altitude
    if (!this.textures.exists('sj-stars')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 0; i < 70; i++) { g.fillStyle(0xffffff, rng.int(40, 100) / 100); g.fillRect(rng.int(0, 255), rng.int(0, 255), rng.chance(0.2) ? 4 : 2, rng.chance(0.2) ? 4 : 2); }
      g.generateTexture('sj-stars', 256, 256); g.destroy();
    }
    this.stars = this.add.tileSprite(0, 0, width, height, 'sj-stars').setOrigin(0).setScrollFactor(0).setAlpha(0).setDepth(-10);
    [['bg2', 0.08], ['bg3', 0.18], ['bg4', 0.35]].forEach(([k, sf], i) => {
      // only the hill band near the bottom of each 2048px layer is drawn (cheap on software renderers)
      const img = this.add.image(width / 2, height + 260 + i * 60, k as string).setOrigin(0.5, 1).setScale(0.75).setScrollFactor(1, sf as number).setDepth(-5 + i);
      img.setCrop(544, 700, 960, 1348);
      this.hills.push(img);
    });

    // starting ground
    for (const x of [width * 0.25, width * 0.75]) this.add.image(x, height - 40, 'ground').setScale(0.95, 0.9);
    this.startY = height - 140;
    this.player = this.add.image(width / 2, this.startY, 'bunny-jump').setScale(0.5).setDepth(20);
    this.jetpack = this.add.image(0, 0, 'jetpack').setScale(0.4).setDepth(19).setVisible(false);
    this.flames = this.add.particles(0, 0, 'flame', {
      speedY: { min: 300, max: 500 }, speedX: { min: -40, max: 40 }, scale: { start: 0.6, end: 0 }, lifespan: 300, emitting: false,
    }).setDepth(18);
    this.topY = this.startY;
    this.lastPlatY = height - 130;
    this.generate();

    this.controls = new Controls(this);
    const hint = txt(this, width / 2, height * 0.6, t('steer'), { size: 40, color: '#ffffff' }).setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: hint, alpha: 0, delay: 2200, duration: 600, onComplete: () => hint.destroy() });
    this.updateHud();
  }

  private difficulty(): number {
    return Phaser.Math.Clamp((this.startY - this.lastPlatY) / 30000, 0, 1);   // 0..1 over 3000 m
  }

  private biomeKey(): string {
    const alt = (this.startY - this.lastPlatY) / 10;
    return BIOMES[Math.min(BIOMES.length - 1, Math.floor(alt / 700))];
  }

  /** Builds platforms (and enemies/items) up to a bit above the camera. */
  private generate(): void {
    const { width } = this.scale;
    const limit = this.cameras.main.scrollY - 500;
    while (this.lastPlatY > limit) {
      const d = this.difficulty();
      const gap = rng.int(110 + d * 90, 160 + d * 110);
      this.lastPlatY -= gap;
      const y = this.lastPlatY;
      const r = Math.random();
      const kind: Kind = r < 0.12 + d * 0.38 ? 'move' : 'normal';
      const p = this.addPlat(rng.int(70, width - 70), y, kind);
      // springs, collectibles, power-ups on solid platforms
      if (rng.chance(0.08)) {
        p.spring = this.add.image(p.img.x, y - 22, 'spring').setOrigin(0.5, 1).setScale(0.42).setDepth(9);
      } else if (rng.chance(0.012 + d * 0.02) && y < this.startY - 3000) {
        this.items.push({ img: this.add.image(p.img.x, y - 60, 'pu-jet').setScale(0.75).setDepth(12), kind: 'jet', plat: p });
      } else if (rng.chance(0.22)) {
        const gold = rng.chance(0.15);
        const it = this.add.image(p.img.x + rng.int(-30, 30), y - 70, gold ? 'carrot-gold' : 'carrot').setScale(0.55).setDepth(12);
        this.tweens.add({ targets: it, y: it.y - 12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.items.push({ img: it, kind: gold ? 'gold' : 'carrot', plat: p });
      }
      // decoy breaking platforms between steps
      if (rng.chance(0.15 + d * 0.3)) {
        let x = rng.int(70, width - 70);
        if (Math.abs(x - p.img.x) < 160) x = (x + width / 2) % (width - 140) + 70;
        this.addPlat(x, y + gap / 2, 'break');
      }
      // enemies after a calm start
      if (y < this.startY - 1500 && rng.chance(0.04 + d * 0.1)) this.addEnemy(y - gap / 2, p.img.x);
    }
  }

  private addPlat(x: number, y: number, kind: Kind): Plat {
    const b = this.biomeKey();
    const key = kind === 'move' ? 'plat-wood' : kind === 'break' ? `plat-${b}-broken` : `plat-${b}`;
    const img = this.add.image(x, y, key).setScale(0.6).setDepth(8);
    const p: Plat = { img, kind, vx: kind === 'move' ? rng.pick([-1, 1]) * rng.int(90, 120 + this.difficulty() * 160) : 0, dead: false };
    this.plats.push(p);
    return p;
  }

  private addEnemy(y: number, avoidX: number): void {
    const { width } = this.scale;
    const kind = rng.pick(['flyman', 'spikeball', 'wingman'] as const);
    let x = avoidX < width / 2 ? rng.int(width / 2 + 60, width - 80) : rng.int(80, width / 2 - 60);
    if (kind === 'wingman') x = width / 2;
    const img = this.add.image(x, y, kind).setScale(kind === 'wingman' ? 0.45 : 0.5).setDepth(15);
    if (kind === 'spikeball') this.tweens.add({ targets: img, angle: 360, duration: 3000, repeat: -1 });
    this.enemies.push({ img, kind, x0: x, t: rng.int(0, 100) / 10, dead: false });
  }

  private altitude(): number {
    return Math.max(0, Math.floor((this.startY - this.topY) / 10));
  }

  private updateHud(): void {
    this.hud.setCenter(`${this.altitude()} ${t('meters')}`);
    this.setScore(this.altitude() + this.bonus);
  }

  private bounce(v: number, x: number, y: number): void {
    this.vy = v;
    this.player.setTexture('bunny-jump');
    this.tweens.add({ targets: this.player, scaleX: 0.58, scaleY: 0.42, duration: 70, yoyo: true });
    burst(this, x, y, [0xffffff, 0xc8f0ff], 6, 120);
  }

  private die(reason: 'fell' | 'ouch'): void {
    if (this.dying) return;
    this.dying = true;
    if (reason === 'fell') this.sfx('fall', { volume: 0.65 });
    else this.sfxAt('ouch', this.player.x, { volume: 0.75 });
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 150);
    this.player.setTexture('bunny-hurt');
    if (reason === 'ouch') { this.vy = -400; burst(this, this.player.x, this.player.y, [0xec3013, 0xffd23f], 30, 380); }
    this.endGame({ delay: 1200, title: t(reason) });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const cam = this.cameras.main;

    // steering: keys or touch on the left / right half
    let dir = this.controls.axisX;
    this.touchDir = 0;
    for (const p of this.input.manager.pointers) {
      if (p.isDown && !(p.x > width - 130 && p.y < 130)) this.touchDir = p.x < width / 2 ? -1 : 1;
    }
    if (this.touchDir) dir = this.touchDir;
    if (this.dying) dir = 0;
    this.vx += (dir * MOVE_SPEED - this.vx) * Math.min(1, dt * 10);
    this.player.x += this.vx * dt;
    if (this.player.x < -30) this.player.x = width + 30;
    if (this.player.x > width + 30) this.player.x = -30;
    if (Math.abs(this.vx) > 40) this.player.setFlipX(this.vx < 0);

    // vertical
    const prevFeet = this.player.y + 42;
    if (this.jet > 0) {
      this.jet -= dt;
      this.vy = -1500;
      this.flames.emitParticleAt(this.player.x + (this.player.flipX ? 14 : -14), this.player.y + 40, 2);
      if (this.jet <= 0) { this.jetpack.setVisible(false); this.vy = -700; }
    } else this.vy = Math.min(1300, this.vy + GRAVITY * dt);
    this.player.y += this.vy * dt;
    const feet = this.player.y + 42;
    this.jetpack.setVisible(this.jet > 0).setPosition(this.player.x + (this.player.flipX ? 16 : -16), this.player.y + 6).setFlipX(this.player.flipX);
    if (this.vy > 150 && this.jet <= 0 && !this.dying) this.player.setTexture('bunny-stand');

    // ground at the very start
    if (!this.dying && this.vy > 0 && feet >= height - 70 && this.topY > this.startY - 600) {
      this.player.y = height - 70 - 42;
      this.bounce(JUMP_V, this.player.x, height - 70);
      this.sfxAt(rng.pick(['jump1', 'jump2']), this.player.x, { volume: 0.35 });
    }

    // platforms
    for (const p of this.plats) {
      if (p.dead) continue;
      if (p.vx) {
        p.img.x += p.vx * dt;
        if (p.img.x < 70 || p.img.x > width - 70) { p.vx *= -1; p.img.x = Phaser.Math.Clamp(p.img.x, 70, width - 70); }
        if (p.spring) p.spring.x = p.img.x;
      }
      if (this.dying || this.vy <= 0 || this.jet > 0) continue;
      const top = p.img.y - 24;
      if (prevFeet <= top + 4 && feet >= top && Math.abs(this.player.x - p.img.x) < PLAT_W / 2 + 22) {
        if (p.kind === 'break') {
          p.dead = true;
          this.sfxAt('break', p.img.x, { volume: 0.55 });
          burst(this, p.img.x, p.img.y, [0x8b5a2b, 0xc8955c], 14, 220);
          this.tweens.add({ targets: p.img, y: p.img.y + 300, angle: rng.int(-40, 40), alpha: 0, duration: 600, onComplete: () => p.img.destroy() });
          continue;
        }
        this.player.y = top - 42;
        if (p.spring && Math.abs(this.player.x - p.spring.x) < 46) {
          p.spring.setTexture('spring-out');
          this.time.delayedCall(250, () => p.spring?.active && p.spring.setTexture('spring'));
          this.bounce(SPRING_V, this.player.x, top);
          this.sfxAt('spring', this.player.x, { volume: 0.6 });
          this.tweens.add({ targets: this.player, angle: this.player.flipX ? -360 : 360, duration: 700, onComplete: () => this.player.setAngle(0) });
        } else {
          this.bounce(JUMP_V, this.player.x, top);
          this.sfxAt(rng.pick(['jump1', 'jump2']), this.player.x, { volume: 0.35 });
        }
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.kind === 'flyman') { e.img.x = e.x0 + Math.sin(e.t * 2) * 110; e.img.setTexture(Math.floor(e.t * 8) % 2 ? 'flyman' : 'flyman2'); }
      if (e.kind === 'wingman') { e.img.x = width / 2 + Math.sin(e.t * 1.2) * (width / 2 - 80); e.img.setTexture(Math.floor(e.t * 6) % 2 ? 'wingman' : 'wingman2'); e.img.setFlipX(Math.cos(e.t * 1.2) < 0); }
      if (this.dying) continue;
      const dx = this.player.x - e.img.x, dy = this.player.y - e.img.y;
      if (Math.abs(dx) < 50 && Math.abs(dy) < 60) {
        if (this.jet > 0) this.killEnemy(e, false);
        else if (this.vy > 0 && dy < -15 && e.kind !== 'spikeball') {
          this.killEnemy(e, true);
          this.bounce(JUMP_V * 1.1, this.player.x, this.player.y + 40);
        } else this.die('ouch');
      }
    }

    // items
    for (const it of this.items) {
      if (!it.img.active) continue;
      if (it.plat && it.plat.vx) it.img.x = it.plat.img.x;
      if (this.dying || Phaser.Math.Distance.Between(it.img.x, it.img.y, this.player.x, this.player.y) > 65) continue;
      if (it.kind === 'jet') {
        this.jet = 2.6;
        this.sfxAt('jet', it.img.x, { volume: 0.6 });
        flash(this, 0xffd23f, 120);
      } else {
        const pts = it.kind === 'gold' ? 100 : 20;
        this.bonus += pts;
        popup(this, it.img.x, it.img.y - 30, '+' + pts);
        this.sfxAt(it.kind === 'gold' ? 'gold' : 'carrot', it.img.x, { volume: it.kind === 'gold' ? 0.6 : 0.4 });
      }
      burst(this, it.img.x, it.img.y, [0xff9a2e, 0x5dff7a, 0xffd23f], 14, 240);
      it.img.destroy();
    }

    // camera follows upward only
    if (!this.dying) cam.scrollY = Math.min(cam.scrollY, this.player.y - height * 0.45);
    if (this.player.y < this.topY) {
      this.topY = this.player.y;
      const m = Math.floor(this.altitude() / 500);
      if (m > this.milestone) {
        this.milestone = m;
        this.bonus += 50;
        popup(this, width / 2, cam.scrollY + height * 0.3, `${m * 500} ${t('meters')}!`, '#5dff7a', 40);
        this.sfx('milestone', { volume: 0.6, exact: true });
      }
    }
    this.updateHud();

    // sky colour + stars by altitude
    const k = Phaser.Math.Clamp(this.altitude() / 1000, 0, SKY.length - 1.001);
    const i = Math.floor(k);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(SKY[i]), Phaser.Display.Color.ValueToColor(SKY[i + 1]), 100, (k - i) * 100);
    cam.setBackgroundColor(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    this.stars.setAlpha(Phaser.Math.Clamp((this.altitude() - 1500) / 1500, 0, 0.9));
    this.stars.tilePositionY = cam.scrollY * 0.05;
    for (const h of this.hills) if (h.visible && h.y - cam.scrollY * h.scrollFactorY - 1011 > height) h.setVisible(false);

    this.generate();
    this.cleanup();

    if (!this.dying && this.player.y > cam.scrollY + height + 60) this.die('fell');
  }

  private killEnemy(e: Enemy, stomp: boolean): void {
    e.dead = true;
    this.bonus += 50;
    popup(this, e.img.x, e.img.y - 40, '+50');
    this.sfxAt('stomp', e.img.x, { volume: 0.6 });
    shake(this, 0.008, 120);
    burst(this, e.img.x, e.img.y, [0xffd23f, 0xffffff, 0xff9a2e], 22, 320);
    this.tweens.add({ targets: e.img, y: e.img.y + (stomp ? 600 : -200), angle: 180, alpha: 0, duration: 700, onComplete: () => e.img.destroy() });
  }

  private cleanup(): void {
    const bottom = this.cameras.main.scrollY + this.scale.height + 200;
    this.plats = this.plats.filter((p) => {
      if (p.img.y < bottom && !(p.dead && !p.img.active)) return true;
      if (p.img.active && !p.dead) p.img.destroy();
      p.spring?.destroy();
      return false;
    });
    this.enemies = this.enemies.filter((e) => {
      if (e.img.y < bottom && e.img.active) return true;
      if (!e.dead) e.img.destroy();
      return false;
    });
    this.items = this.items.filter((it) => {
      if (it.img.active && it.img.y < bottom) return true;
      it.img.destroy();
      return false;
    });
  }
}
