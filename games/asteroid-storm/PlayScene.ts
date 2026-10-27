import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng, ensurePixel } from '@core';

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
const EXTRA_LIFE = 10000;

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private ship!: Img;
  private flame!: Img;
  private shieldFx!: Img;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
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
  private nextLife = EXTRA_LIFE;
  private beat = 0;
  private lifeIcons: Img[] = [];

  createGame(): void {
    const { width, height } = this.scale;
    this.rocks = []; this.shots = []; this.eshots = []; this.ufo = null; this.lifeIcons = [];
    this.heading = -Math.PI / 2; this.vx = this.vy = 0;
    this.lives = 3; this.wave = 0; this.alive = true; this.respawnIn = 0; this.invuln = 2;
    this.fireCd = 0; this.hyperCd = 0; this.waveCd = 0; this.ufoCd = 18; this.nextLife = EXTRA_LIFE; this.beat = 0;

    // static starfield with a few twinkling stars
    for (let i = 0; i < 90; i++) {
      const s = this.add.image(rng.int(0, width), rng.int(0, height), 'star').setScale(0.08 + Math.random() * 0.22).setAlpha(0.25 + Math.random() * 0.5);
      if (i % 6 === 0) this.tweens.add({ targets: s, alpha: 0.1, duration: rng.int(600, 1600), yoyo: true, repeat: -1 });
    }

    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      speed: { min: 40, max: 120 }, lifespan: 380, scale: { start: 1.6, end: 0 }, tint: [0xffd23f, 0xff7b00, 0xec3013],
      frequency: 22, emitting: false,
    }).setDepth(8);
    this.flame = this.add.image(0, 0, 'flame').setDepth(9).setVisible(false);
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
    // lives as little ship icons under the score
    const n = Math.max(0, this.lives);
    while (this.lifeIcons.length < Math.min(n, 8)) this.lifeIcons.push(this.add.image(40 + this.lifeIcons.length * 42, 82, 'life').setDepth(9000).setScrollFactor(0));
    while (this.lifeIcons.length > n) this.lifeIcons.pop()!.destroy();
  }

  private banner(s: string, color = '#ffd23f'): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.38, s, { title: true, size: 40, color }).setDepth(7000).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1300, duration: 400, onComplete: () => b.destroy() });
  }

  private nextWave(): void {
    this.wave++;
    this.updateHud();
    this.banner(`${t('wave')} ${this.wave}`);
    this.sfx('wave', { volume: 0.4 });
    const { width, height } = this.scale;
    const n = Math.min(3 + this.wave, 11);
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

  private spawnRock(x: number, y: number, size: number, baseVx = 0, baseVy = 0): void {
    const def = ROCK[size];
    const speed = (60 + size * 45 + this.wave * 9) * (0.7 + Math.random() * 0.6);
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
    this.sfx(rock.size === 0 ? 'boom-big' : 'boom-small', { volume: 0.35 });
    if (rock.size === 0) shake(this, 0.006, 120);
    if (rock.size < 2) for (let k = 0; k < 2; k++) this.spawnRock(img.x, img.y, rock.size + 1, rock.vx, rock.vy);
    img.destroy();
    this.checkExtraLife();
  }

  private checkExtraLife(): void {
    if (this.score < this.nextLife) return;
    this.nextLife += EXTRA_LIFE;
    this.lives++;
    this.updateHud();
    this.sfx('life');
    this.banner(t('extraLife'), '#5dff7a');
  }

  private fire(): void {
    if (this.shots.length >= 6) return;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const img = this.add.image(this.ship.x + c * 30, this.ship.y + s * 30, 'shot').setRotation(this.heading + Math.PI / 2).setScale(0.75).setDepth(7);
    this.shots.push({ img, vx: c * 820 + this.vx, vy: s * 820 + this.vy, life: 0.85 });
    this.sfx('shoot', { volume: 0.22 });
  }

  private hyperspace(): void {
    if (this.hyperCd > 0 || !this.alive) return;
    const { width, height } = this.scale;
    this.hyperCd = 3;
    burst(this, this.ship.x, this.ship.y, [0x3ee6ff, 0xffffff], 24, 260);
    this.ship.setPosition(rng.int(60, width - 60), rng.int(140, height - 80));
    this.vx = this.vy = 0;
    this.invuln = Math.max(this.invuln, 0.6);
    burst(this, this.ship.x, this.ship.y, [0x3ee6ff, 0xffffff], 24, 260);
    flash(this, 0x3ee6ff, 90);
    this.sfx('hyper', { volume: 0.4 });
  }

  private die(): void {
    if (!this.alive || this.invuln > 0 || this.isOver) return;
    this.alive = false;
    this.lives--;
    this.updateHud();
    burst(this, this.ship.x, this.ship.y, [0x3ee6ff, 0xffd23f, 0xec3013, 0xffffff], 50, 420);
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 160);
    this.sfx('hurt');
    this.ship.setVisible(false); this.flame.setVisible(false); this.trail.emitting = false;
    if (this.lives <= 0) { this.endGame({ delay: 1200 }); return; }
    this.respawnIn = 1.6;
  }

  private respawn(): void {
    const { width, height } = this.scale;
    this.alive = true;
    this.ship.setPosition(width / 2, height / 2).setVisible(true).setScale(0);
    this.tweens.add({ targets: this.ship, scale: 0.7, duration: 300, ease: 'Back.easeOut' });
    this.heading = -Math.PI / 2; this.vx = this.vy = 0;
    this.invuln = 2.5;
  }

  private spawnUfo(): void {
    const { width, height } = this.scale;
    const small = this.wave >= 3 && rng.chance(Math.min(0.75, 0.2 + this.wave * 0.08));
    const fromLeft = rng.chance(0.5);
    const y0 = rng.int(220, height - 220);
    const img = this.add.image(fromLeft ? -50 : width + 50, y0, small ? 'ufo-small' : 'ufo-big').setScale(small ? 0.5 : 0.85).setDepth(6);
    this.tweens.add({ targets: img, angle: 360, duration: 1800, repeat: -1 });
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
    this.sfx('boom-big', { volume: 0.5 });
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
        u.fireCd = u.small ? Math.max(0.6, 1.2 - this.wave * 0.05) : 1.4;
        let a = Math.random() * Math.PI * 2;
        if (u.small) a = Phaser.Math.Angle.Between(u.img.x, u.img.y, this.ship.x, this.ship.y) + (Math.random() - 0.5) * Math.max(0.15, 0.7 - this.wave * 0.06);
        const img = this.add.image(u.img.x, u.img.y, 'eshot').setScale(0.6).setDepth(7);
        this.eshots.push({ img, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, life: 1.6 });
        this.sfx('eshoot', { volume: 0.2 });
      }
      for (const r of this.rocks) {
        if (Phaser.Math.Distance.Between(u.img.x, u.img.y, r.img.x, r.img.y) < r.r + u.r - 6) { this.breakRock(r, false); this.killUfo(false); break; }
      }
      if (this.ufo && (u.img.x < -80 || u.img.x > width + 80)) { u.img.destroy(); this.ufo = null; }
    } else if (this.wave >= 2) {
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
      this.sfx('beat', { volume: 0.07, rate: 0.5 });
    }
    if (this.rocks.length === 0 && !this.ufo) {
      if (this.waveCd <= 0) {
        this.waveCd = 2.2;
        this.addScore(this.wave * 100, width / 2, height * 0.46);
        this.banner(t('waveClear'), '#5dff7a');
      } else {
        this.waveCd -= dt;
        if (this.waveCd <= 0.01) { this.waveCd = 0; this.nextWave(); }
      }
    }
  }
}
