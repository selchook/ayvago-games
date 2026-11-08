import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng, ensurePixel, isEasy } from '@core';
import { makeFx, makeNebula, makePlanet, makeStars } from './art';

type Img = Phaser.GameObjects.Image;

interface Rock { img: Img; vx: number; vy: number; r: number; size: number; spin: number }
interface Shot { img: Img; vx: number; vy: number; life: number }
interface Ufo { img: Img; small: boolean; vx: number; t: number; y0: number; fireCd: number; r: number }

// per size: radius, score, display scale, texture keys
const ROCK = [
  { r: 52, pts: 20, scale: 1.15, keys: ['rock0-1', 'rock0-2', 'rock0-3', 'rock0-4'] },
  { r: 28, pts: 50, scale: 1.35, keys: ['rock1-1', 'rock1-2'] },
  { r: 17, pts: 100, scale: 1.3, keys: ['rock2-1', 'rock2-2'] },
];
const SHIP_R = 22;
const PAD = 60;            // wrap margin outside the screen
/**
 * Normal and Easy (practice). Easy: two more lives, slower rocks, a ramp at half speed, an extra
 * life every 5000 points instead of 10000, UFOs from wave 3 that fire 60% slower, and a longer
 * shield after a respawn. `ramp` scales how fast the waves get harder: wave w plays like wave
 * 1 + (w - 1) * ramp.
 */
const TUNING = {
  normal: { lives: 3, speed: 1, ramp: 1, extraLife: 10000, ufoWave: 2, ufoFire: 1, shield: 2.5 },
  easy: { lives: 5, speed: 0.7, ramp: 0.5, extraLife: 5000, ufoWave: 3, ufoFire: 1.6, shield: 3.5 },
};
const ADD = Phaser.BlendModes.ADD;
const ROCK_TINT = [0xb0b0b8, 0x9a9aa6, 0x8a8a96];

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private ship!: Img;
  private flame!: Img;
  private shieldFx!: Img;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private layers: { ts: Phaser.GameObjects.TileSprite; speed: number }[] = [];
  private planet!: Img;
  private engine!: Img;
  private vig!: Img;
  private hurtT = 0;
  private rocks: Rock[] = [];
  private shots: Shot[] = [];
  private eshots: Shot[] = [];
  private ufo: Ufo | null = null;
  private heading = -Math.PI / 2;
  private vx = 0;
  private vy = 0;
  private lives = 3;
  private wave = 0;
  private alive = true;
  private respawnIn = 0;
  private invuln = 0;
  private fireCd = 0;
  private hyperCd = 0;
  private waveCd = 0;
  private ufoCd = 0;
  private nextLife = TUNING.normal.extraLife;
  private beat = 0;
  tune = TUNING.normal;

  createGame(): void {
    const { width, height } = this.scale;
    this.rocks = []; this.shots = []; this.eshots = []; this.ufo = null;
    this.heading = -Math.PI / 2; this.vx = this.vy = 0;
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.lives = this.tune.lives; this.wave = 0; this.alive = true; this.respawnIn = 0; this.invuln = 2;
    this.fireCd = 0; this.hyperCd = 0; this.waveCd = 0; this.ufoCd = 18; this.nextLife = this.tune.extraLife; this.beat = 0;

    // deep space: a drifting nebula, two star layers, a far planet and a few twinkling stars
    makeFx(this); makeNebula(this, width, height); makePlanet(this);
    makeStars(this, 'as-stars-far', width, height, 240, false, 5);
    makeStars(this, 'as-stars-near', width, height, 70, true, 13);
    this.layers = [
      { ts: this.add.tileSprite(0, 0, width, height, 'as-nebula').setOrigin(0).setDepth(-10), speed: 6 },
      { ts: this.add.tileSprite(0, 0, width, height, 'as-stars-far').setOrigin(0).setDepth(-8), speed: 12 },
      { ts: this.add.tileSprite(0, 0, width, height, 'as-stars-near').setOrigin(0).setDepth(-7), speed: 26 },
    ];
    this.planet = this.add.image(width * 0.2, height * 0.3, 'as-planet').setDepth(-9).setAlpha(0.7).setScale(0.75);
    for (let i = 0; i < 10; i++) {
      const s = this.add.image(rng.int(0, width), rng.int(0, height), 'star').setScale(0.12 + Math.random() * 0.2).setAlpha(0).setDepth(-6);
      this.tweens.add({ targets: s, alpha: 0.9, duration: rng.int(500, 1200), yoyo: true, repeat: -1, delay: rng.int(0, 3000), repeatDelay: rng.int(800, 4000) });
    }
    this.hurtT = 0;
    this.vig = this.add.image(width / 2, height / 2, 'as-vig').setDisplaySize(width, height).setDepth(50).setAlpha(0);

    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      speed: { min: 40, max: 120 }, lifespan: 380, scale: { start: 1.6, end: 0 }, tint: [0xffd23f, 0xff7b00, 0xec3013],
      frequency: 22, emitting: false,
    }).setDepth(8);
    this.flame = this.add.image(0, 0, 'flame').setDepth(9).setVisible(false);
    this.engine = this.add.image(0, 0, 'as-glow').setBlendMode(ADD).setTint(0xff9a3d).setScale(0.5).setDepth(8).setVisible(false);
    this.ship = this.add.image(width / 2, height / 2, 'ship').setScale(0.7).setDepth(10);
    this.shieldFx = this.add.image(0, 0, 'shield').setScale(0.55).setDepth(11).setAlpha(0.7).setVisible(false);

    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'] });
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { l: kb.addKey(K.LEFT), r: kb.addKey(K.RIGHT), u: kb.addKey(K.UP), a: kb.addKey(K.A), d: kb.addKey(K.D), w: kb.addKey(K.W) };

    this.updateHud();
    this.nextWave();
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('wave')} ${this.wave}`);
    this.hud.setLives(this.lives);
  }

  /** A ribbon across the screen with a title that slides in, holds and slides out. */
  private banner(s: string, color = '#ffd23f', tint = 0x3ee6ff): void {
    const { width, height } = this.scale;
    const y = height * 0.38;
    const band = this.add.image(width / 2, y, 'as-ribbon').setDisplaySize(width, 110).setTint(tint).setDepth(6999);
    const sy = band.scaleY;
    band.scaleY = 0;
    const b = txt(this, width + 320, y, s, { title: true, size: 40, color }).setDepth(7000);
    this.tweens.add({ targets: band, scaleY: sy, duration: 160 });
    this.tweens.add({ targets: b, x: width / 2, duration: 340, ease: 'Back.easeOut' });
    this.time.delayedCall(1250, () => {
      this.tweens.add({ targets: b, x: -320, duration: 260, ease: 'Cubic.easeIn', onComplete: () => b.destroy() });
      this.tweens.add({ targets: band, scaleY: 0, delay: 140, duration: 180, onComplete: () => band.destroy() });
    });
  }

  // ---------- effects ----------
  private glow(x: number, y: number, tint: number, scale: number, ms: number, depth = 20): void {
    const g = this.add.image(x, y, 'as-glow').setBlendMode(ADD).setTint(tint).setScale(scale * 0.4).setDepth(depth);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  private ring(x: number, y: number, tint: number, scale: number, ms: number): void {
    const r = this.add.image(x, y, 'as-ring').setBlendMode(ADD).setTint(tint).setScale(0.1).setDepth(21);
    this.tweens.add({ targets: r, scale, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  /** The image breaks into four tumbling pieces that drift on with its speed. */
  private pieces(img: Img, vx: number, vy: number, tint: number, power = 1): void {
    const key = img.texture.key, fw = img.width, fh = img.height;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const p = this.add.image(img.x, img.y, key).setScale(img.scaleX, img.scaleY).setAngle(img.angle).setCrop(i * fw / 2, j * fh / 2, fw / 2, fh / 2).setDepth(5).setTint(tint);
      const a = Math.atan2(j - 0.5, i - 0.5) + rng.int(-50, 50) / 100, d = rng.int(40, 110) * power;
      this.tweens.add({ targets: p, x: img.x + Math.cos(a) * d + vx * 0.5, y: img.y + Math.sin(a) * d + vy * 0.5, angle: p.angle + rng.int(-200, 200), duration: 700, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: p, alpha: 0, delay: 320, duration: 380, onComplete: () => p.destroy() });
    }
  }

  /** Soft grey dust left where a rock breaks. */
  private dust(x: number, y: number, n: number, scale: number): void {
    for (let i = 0; i < n; i++) {
      const d = this.add.image(x + rng.int(-14, 14), y + rng.int(-14, 14), 'as-glow').setTint(0x8a8a9a).setAlpha(0.35).setScale(scale * 0.3).setDepth(4);
      this.tweens.add({ targets: d, scale: scale * (0.7 + Math.random() * 0.4), alpha: 0, x: d.x + rng.int(-30, 30), y: d.y + rng.int(-30, 30), duration: rng.int(600, 900), ease: 'Quad.easeOut', onComplete: () => d.destroy() });
    }
  }

  private nextWave(): void {
    this.wave++;
    this.updateHud();
    this.banner(`${t('wave')} ${this.wave}`);
    this.sfx('wave', { volume: 0.45 });
    this.ring(this.ship.x, this.ship.y, 0x3ee6ff, 6, 900);
    const { width, height } = this.scale;
    const n = Math.min(3 + Math.floor(this.lvl()), 11);
    for (let i = 0; i < n; i++) {
      // spawn along the edges, away from the ship
      let x = 0, y = 0;
      do {
        if (rng.chance(0.5)) { x = rng.chance(0.5) ? -40 : width + 40; y = rng.int(0, height); }
        else { x = rng.int(0, width); y = rng.chance(0.5) ? -40 : height + 40; }
      } while (Phaser.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 260);
      this.spawnRock(x, y, 0);
    }
  }

  /** How hard the current wave plays (equals the wave number in Normal). */
  private lvl(): number {
    return 1 + (this.wave - 1) * this.tune.ramp;
  }

  private spawnRock(x: number, y: number, size: number, baseVx = 0, baseVy = 0): void {
    const def = ROCK[size];
    const speed = (60 + size * 45 + this.lvl() * 9) * (0.7 + Math.random() * 0.6) * this.tune.speed;
    const a = Math.random() * Math.PI * 2;
    const img = this.add.image(x, y, rng.pick(def.keys)).setScale(0).setAngle(rng.int(0, 360)).setDepth(5);
    this.tweens.add({ targets: img, scale: def.scale, duration: 220, ease: 'Back.easeOut' });
    this.rocks.push({ img, vx: Math.cos(a) * speed + baseVx * 0.3, vy: Math.sin(a) * speed + baseVy * 0.3, r: def.r, size, spin: rng.int(-120, 120) });
  }

  private breakRock(rock: Rock, scored: boolean): void {
    const i = this.rocks.indexOf(rock);
    if (i < 0) return;
    this.rocks.splice(i, 1);
    const { img } = rock;
    if (scored) this.addScore(ROCK[rock.size].pts, img.x, img.y);
    burst(this, img.x, img.y, [0xb0b0b8, 0x7d7d88, 0xffd23f], 14 + (2 - rock.size) * 10, 200 + (2 - rock.size) * 90);
    const big = 2 - rock.size;
    this.glow(img.x, img.y, 0xffb36b, 0.9 + big * 0.6, 260 + big * 60);
    this.dust(img.x, img.y, 2 + big * 2, 0.8 + big * 0.5);
    if (rock.size === 2) this.pieces(img, rock.vx, rock.vy, ROCK_TINT[2], 0.8);
    if (rock.size === 0) this.ring(img.x, img.y, 0xffd2a0, 2.2, 420);
    this.sfxAt(`boom${rock.size}${rng.pick(['a', 'b'])}`, img.x, { volume: [0.65, 0.5, 0.4][rock.size] });
    if (rock.size === 0) shake(this, 0.006, 120);
    if (rock.size < 2) for (let k = 0; k < 2; k++) this.spawnRock(img.x, img.y, rock.size + 1, rock.vx, rock.vy);
    img.destroy();
    this.checkExtraLife();
  }

  private checkExtraLife(): void {
    if (this.score < this.nextLife) return;
    this.nextLife += this.tune.extraLife;
    this.lives++;
    this.updateHud();
    this.sfx('life', { volume: 0.7, exact: true });
    this.banner(t('extraLife'), '#5dff7a', 0x5dff7a);
    this.glow(this.ship.x, this.ship.y, 0x5dff7a, 2.2, 500, 12);
  }

  private fire(): void {
    if (this.shots.length >= 6) return;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const img = this.add.image(this.ship.x + c * 30, this.ship.y + s * 30, 'shot').setRotation(this.heading + Math.PI / 2).setScale(0.75).setDepth(7).setBlendMode(ADD);
    const m = this.add.image(this.ship.x + c * 30, this.ship.y + s * 30, 'as-glow').setBlendMode(ADD).setTint(0x6fd8ff).setScale(0.3).setDepth(12);
    this.tweens.add({ targets: m, scale: 0.1, alpha: 0, duration: 90, onComplete: () => m.destroy() });
    this.shots.push({ img, vx: c * 820 + this.vx, vy: s * 820 + this.vy, life: 0.85 });
    this.sfxAt(rng.pick(['shoot1', 'shoot2']), this.ship.x, { volume: 0.3 });
  }

  private hyperspace(): void {
    if (this.hyperCd > 0 || !this.alive) return;
    const { width, height } = this.scale;
    this.hyperCd = 3;
    burst(this, this.ship.x, this.ship.y, [0x3ee6ff, 0xffffff], 24, 260);
    this.ring(this.ship.x, this.ship.y, 0x3ee6ff, 1.6, 320);
    this.glow(this.ship.x, this.ship.y, 0x3ee6ff, 1.6, 300);
    this.ship.setPosition(rng.int(60, width - 60), rng.int(140, height - 80));
    this.ring(this.ship.x, this.ship.y, 0x3ee6ff, 1.6, 320);
    this.ship.setScale(0);
    this.tweens.add({ targets: this.ship, scale: 0.7, duration: 220, ease: 'Back.easeOut' });
    this.vx = this.vy = 0;
    this.invuln = Math.max(this.invuln, 0.6);
    burst(this, this.ship.x, this.ship.y, [0x3ee6ff, 0xffffff], 24, 260);
    flash(this, 0x3ee6ff, 90);
    this.sfxAt('hyper', this.ship.x, { volume: 0.5 });
  }

  private die(): void {
    if (!this.alive || this.invuln > 0 || this.isOver) return;
    this.alive = false;
    this.lives--;
    this.updateHud();
    burst(this, this.ship.x, this.ship.y, [0x3ee6ff, 0xffd23f, 0xec3013, 0xffffff], 50, 420);
    shake(this, 0.02, 300);
    this.hurtT = 0.5;
    this.glow(this.ship.x, this.ship.y, 0xffa040, 2.6, 420, 22);
    this.ring(this.ship.x, this.ship.y, 0xffd2a0, 2.6, 460);
    this.pieces(this.ship, this.vx, this.vy, 0xffffff, 1.3);
    if (this.lives <= 0) {
      flash(this, 0xffffff, 160);
      for (let i = 0; i < 4; i++) {
        const ox = this.ship.x + rng.int(-50, 50), oy = this.ship.y + rng.int(-50, 50);
        this.time.delayedCall(i * 120, () => { this.glow(ox, oy, 0xffa040, 2, 380, 22); burst(this, ox, oy, [0xffd23f, 0xec3013, 0xffffff], 14, 300); });
      }
    }
    this.sfxAt(this.lives <= 0 ? 'death' : 'hurt', this.ship.x, { volume: this.lives <= 0 ? 0.9 : 0.8 });
    this.ship.setVisible(false); this.flame.setVisible(false); this.engine.setVisible(false); this.trail.emitting = false;
    if (this.lives <= 0) { this.endGame({ delay: 1200 }); return; }
    this.respawnIn = 1.6;
  }

  private respawn(): void {
    const { width, height } = this.scale;
    this.alive = true;
    this.ship.setPosition(width / 2, height / 2).setVisible(true).setScale(0);
    this.ring(width / 2, height / 2, 0x3ee6ff, 2, 500);
    this.tweens.add({ targets: this.ship, scale: 0.7, duration: 300, ease: 'Back.easeOut' });
    this.heading = -Math.PI / 2; this.vx = this.vy = 0;
    this.invuln = this.tune.shield;
    if (this.lives === 1) this.sfx('low', { volume: 0.45 });
  }

  private spawnUfo(): void {
    const { width, height } = this.scale;
    const small = this.wave >= 3 && rng.chance(Math.min(0.75, 0.2 + this.wave * 0.08));
    const fromLeft = rng.chance(0.5);
    const y0 = rng.int(220, height - 220);
    const img = this.add.image(fromLeft ? -50 : width + 50, y0, small ? 'ufo-small' : 'ufo-big').setScale(small ? 0.5 : 0.85).setDepth(6);
    this.tweens.add({ targets: img, angle: 360, duration: 1800, repeat: -1 });
    const halo = this.add.image(img.x, img.y, 'as-glow').setBlendMode(ADD).setTint(small ? 0xffd23f : 0xff4f6a).setScale(small ? 0.9 : 1.3).setAlpha(0.45).setDepth(5);
    this.tweens.add({ targets: halo, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
    img.setData('halo', halo);
    this.ufo = { img, small, vx: (fromLeft ? 1 : -1) * (small ? 210 : 140), t: 0, y0, fireCd: 1, r: small ? 22 : 38 };
    this.sfx('ufo', { volume: 0.4 });
    popup(this, width / 2, 140, t('ufoAlert'), '#ff4fa3', 32);
  }

  private killUfo(scored: boolean): void {
    const u = this.ufo;
    if (!u) return;
    if (scored) {
      this.addScore(u.small ? 1000 : 200, u.img.x, u.img.y);
      this.checkExtraLife();
    }
    burst(this, u.img.x, u.img.y, [0xff4fa3, 0xffd23f, 0x3ee6ff], 40, 380);
    shake(this, 0.012, 200);
    this.glow(u.img.x, u.img.y, 0xff8a3d, 2.4, 420);
    this.ring(u.img.x, u.img.y, 0xffd2a0, 2.4, 420);
    this.pieces(u.img, u.vx, 0, 0xffffff, 1.2);
    (u.img.getData('halo') as Img | undefined)?.destroy();
    this.sfxAt('ufo-boom', u.img.x, { volume: 0.8 });
    u.img.destroy();
    this.ufo = null;
  }

  private wrap(o: Img): void {
    const { width, height } = this.scale;
    if (o.x < -PAD) o.x += width + PAD * 2; else if (o.x > width + PAD) o.x -= width + PAD * 2;
    if (o.y < -PAD) o.y += height + PAD * 2; else if (o.y > height + PAD) o.y -= height + PAD * 2;
  }

  private steer(dt: number): boolean {
    const k = this.keys, c = this.controls;
    const kl = k.l.isDown || k.a.isDown, kr = k.r.isDown || k.d.isDown, ku = k.u.isDown || k.w.isDown;
    if (kl || kr || ku) {
      if (kl) this.heading -= 4.6 * dt;
      if (kr) this.heading += 4.6 * dt;
      return ku;
    }
    // touch joystick: point the stick where you want to go, push it far to thrust
    const mag = Math.hypot(c.axisX, c.axisY);
    if (mag > 0.25) {
      const target = Math.atan2(c.axisY, c.axisX);
      const diff = Phaser.Math.Angle.Wrap(target - this.heading);
      this.heading += Phaser.Math.Clamp(diff, -8 * dt, 8 * dt);
      return mag > 0.7 && Math.abs(diff) < 0.9;
    }
    return false;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const c = this.controls;
    this.fireCd -= dt; this.hyperCd -= dt; this.invuln = Math.max(0, this.invuln - dt);
    for (const l of this.layers) { l.ts.tilePositionY -= l.speed * dt; l.ts.tilePositionX += l.speed * 0.4 * dt; }
    this.planet.y += 3 * dt; this.planet.x += 1.2 * dt;
    if (this.planet.y > height + 160) this.planet.setPosition(rng.int(80, width - 80), -160);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
    this.vig.setAlpha(0.75 * Math.max(this.hurtT, this.lives === 1 && this.alive && !this.isOver ? 0.16 + 0.1 * Math.sin(this.time.now / 180) : 0));

    // --- ship ---
    if (this.alive) {
      const thrust = this.steer(dt);
      if (thrust) {
        this.vx += Math.cos(this.heading) * 520 * dt;
        this.vy += Math.sin(this.heading) * 520 * dt;
      }
      const sp = Math.hypot(this.vx, this.vy), max = 480;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
      const drag = Math.pow(0.55, dt);
      this.vx *= drag; this.vy *= drag;
      this.ship.x += this.vx * dt; this.ship.y += this.vy * dt;
      this.wrap(this.ship);
      this.ship.setRotation(this.heading + Math.PI / 2);
      this.ship.setAlpha(this.invuln > 0 ? (Math.floor(this.elapsed * 12) % 2 ? 0.35 : 1) : 1);
      const bx = this.ship.x - Math.cos(this.heading) * 32, by = this.ship.y - Math.sin(this.heading) * 32;
      this.flame.setVisible(thrust).setPosition(bx, by).setRotation(this.heading + Math.PI / 2).setScale(1, 0.8 + Math.random() * 0.6);
      this.engine.setVisible(thrust).setPosition(bx, by).setScale(0.45 + Math.random() * 0.15);
      this.trail.setPosition(bx, by);
      this.trail.emitting = thrust;
      this.shieldFx.setVisible(this.invuln > 0).setPosition(this.ship.x, this.ship.y);

      if (c.justA() || (c.a && this.fireCd <= 0)) { this.fire(); this.fireCd = 0.24; }
      if (c.justB()) this.hyperspace();
    } else {
      this.shieldFx.setVisible(false);
      this.respawnIn -= dt;
      if (this.respawnIn <= 0 && !this.isOver) this.respawn();
    }

    // --- rocks ---
    for (const r of this.rocks) {
      r.img.x += r.vx * dt; r.img.y += r.vy * dt; r.img.angle += r.spin * dt;
      this.wrap(r.img);
    }

    // --- player shots ---
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.img.x += s.vx * dt; s.img.y += s.vy * dt;
      this.wrap(s.img);
      let hit = s.life <= 0;
      if (!hit) for (const r of this.rocks) {
        if (Phaser.Math.Distance.Between(s.img.x, s.img.y, r.img.x, r.img.y) < r.r + 6) { this.breakRock(r, true); hit = true; break; }
      }
      if (!hit && this.ufo && Phaser.Math.Distance.Between(s.img.x, s.img.y, this.ufo.img.x, this.ufo.img.y) < this.ufo.r + 6) { this.killUfo(true); hit = true; }
      if (hit) { s.img.destroy(); this.shots.splice(i, 1); }
    }

    // --- enemy shots ---
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i];
      s.life -= dt;
      s.img.x += s.vx * dt; s.img.y += s.vy * dt; s.img.angle += 400 * dt;
      this.wrap(s.img);
      let hit = s.life <= 0;
      if (!hit && this.alive && Phaser.Math.Distance.Between(s.img.x, s.img.y, this.ship.x, this.ship.y) < SHIP_R + 8) { this.die(); hit = true; }
      if (hit) { s.img.destroy(); this.eshots.splice(i, 1); }
    }

    // --- ufo ---
    if (this.ufo) {
      const u = this.ufo;
      u.t += dt;
      u.img.x += u.vx * dt;
      u.img.y = u.y0 + Math.sin(u.t * 1.6) * 90;
      u.fireCd -= dt;
      if (u.fireCd <= 0 && this.alive && u.img.x > 0 && u.img.x < width) {
        u.fireCd = (u.small ? Math.max(0.6, 1.2 - this.wave * 0.05) : 1.4) * this.tune.ufoFire;
        let a = Math.random() * Math.PI * 2;
        if (u.small) a = Phaser.Math.Angle.Between(u.img.x, u.img.y, this.ship.x, this.ship.y) + (Math.random() - 0.5) * Math.max(0.15, 0.7 - this.wave * 0.06);
        const img = this.add.image(u.img.x, u.img.y, 'eshot').setScale(0.6).setDepth(7).setBlendMode(ADD);
        this.eshots.push({ img, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, life: 1.6 });
        this.sfxAt('eshoot', u.img.x, { volume: 0.25 });
      }
      for (const r of this.rocks) {
        if (Phaser.Math.Distance.Between(u.img.x, u.img.y, r.img.x, r.img.y) < r.r + u.r - 6) { this.breakRock(r, false); this.killUfo(false); break; }
      }
      (u.img.getData('halo') as Img | undefined)?.setPosition(u.img.x, u.img.y);
      if (this.ufo && (u.img.x < -80 || u.img.x > width + 80)) { (u.img.getData('halo') as Img | undefined)?.destroy(); u.img.destroy(); this.ufo = null; }
    } else if (this.wave >= this.tune.ufoWave) {
      this.ufoCd -= dt;
      if (this.ufoCd <= 0) { this.ufoCd = rng.int(14, 22) - Math.min(6, this.wave); this.spawnUfo(); }
    }

    // --- ship collisions ---
    if (this.alive && this.invuln <= 0) {
      for (const r of this.rocks) {
        if (Phaser.Math.Distance.Between(this.ship.x, this.ship.y, r.img.x, r.img.y) < r.r + SHIP_R - 4) { this.breakRock(r, true); this.die(); break; }
      }
      if (this.alive && this.ufo && Phaser.Math.Distance.Between(this.ship.x, this.ship.y, this.ufo.img.x, this.ufo.img.y) < this.ufo.r + SHIP_R) { this.killUfo(true); this.die(); }
    }

    // --- heartbeat (speeds up as rocks thin out) + wave progression ---
    this.beat -= dt;
    if (this.rocks.length && this.beat <= 0) {
      this.beat = Phaser.Math.Clamp(0.25 + this.rocks.length * 0.05, 0.3, 1.0);
      this.sfx('beat', { volume: 0.1, rate: 0.5, exact: true });
      // the space pulses with the heartbeat
      for (const l of this.layers.slice(1)) this.tweens.add({ targets: l.ts, alpha: { from: 1, to: 0.7 }, duration: 120, yoyo: true });
    }
    if (this.rocks.length === 0 && !this.ufo) {
      if (this.waveCd <= 0) {
        this.waveCd = 2.2;
        this.addScore(this.wave * 100, width / 2, height * 0.46);
        this.banner(t('waveClear'), '#5dff7a', 0x5dff7a);
        this.sfx('clear', { volume: 0.65, exact: true });
      } else {
        this.waveCd -= dt;
        if (this.waveCd <= 0.01) { this.waveCd = 0; this.nextWave(); }
      }
    }
  }
}
