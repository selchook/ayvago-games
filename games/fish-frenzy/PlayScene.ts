import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';

/** Swimming species: texture key, fish tile number and the fish's visible width inside the 64px tile. */
export const SPECIES = [
  { key: 'ff-fish-green', tile: 73, w: 58 },
  { key: 'ff-fish-pink', tile: 75, w: 44 },
  { key: 'ff-fish-blue', tile: 77, w: 62 },
  { key: 'ff-fish-red', tile: 79, w: 60 },
];
const PLAYER_W = 58;
const PUFFER_W = 58;
const SHARK_W = 236;

const SEA_TOP = 70;
const SEA_BOTTOM = 640;
const START_SIZE = 56;
const MAX_LIVES = 3;

type Kind = 'fish' | 'puffer' | 'shark';
interface Fish {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  size: number;        // body length in px (what is compared with the player)
  baseW: number;       // visible width of the texture at scale 1
  vx: number;
  vy: number;
  t: number;
  puffed: boolean;
  chase: number;       // seconds of chasing left (sharks)
  dead: boolean;
  glow?: Phaser.GameObjects.Ellipse;
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.GameObjects.Image;
  private fish: Fish[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private barFill!: Phaser.GameObjects.Rectangle;
  private bubbles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private size = START_SIZE;
  private target = 140;
  private level = 1;
  private lives = MAX_LIVES;
  private vx = 0;
  private vy = 0;
  private invuln = 0;
  private spawnCd = 0;
  private sharkCd = 0;
  private eatenCount = 0;
  private pointer: { x: number; y: number } | null = null;
  private transition = false;

  createGame(): void {
    const { width, height } = this.scale;
    this.fish = []; this.hearts = [];
    this.size = START_SIZE; this.level = 1; this.lives = MAX_LIVES; this.vx = 0; this.vy = 0;
    this.invuln = 0; this.spawnCd = 0.5; this.sharkCd = 0; this.eatenCount = 0; this.pointer = null; this.transition = false;
    this.target = this.targetFor(1);

    this.buildSea(width, height);

    this.player = this.add.image(width / 2, height / 2, 'ff-player').setDepth(20);
    this.applySize();

    for (let i = 0; i < MAX_LIVES; i++) this.hearts.push(this.add.image(width - 300 + i * 46, 38, 'ff-heart').setDepth(9000));
    txt(this, width / 2, 74, t('growth'), { title: true, size: 14, color: '#bfefff' }).setDepth(9000);
    this.add.rectangle(width / 2, 98, 300, 20, 0x000000, 0.5).setStrokeStyle(3, 0xffffff, 0.7).setDepth(9000);
    this.barFill = this.add.rectangle(width / 2 - 146, 98, 0, 12, 0xffa31a).setOrigin(0, 0.5).setDepth(9000);

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;
      this.pointer = { x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown && this.pointer) this.pointer = { x: p.x, y: p.y }; });
    this.input.on('pointerup', () => { this.pointer = null; });

    // a starting school of small fish so there's food right away
    for (let i = 0; i < 5; i++) this.spawnFish(true, rng.int(100, width - 100));
    this.updateHud();
    this.banner(`${t('level')} 1`, '#ffd23f');
  }

  private targetFor(level: number): number {
    return Math.min(200, 120 + level * 16);
  }

  private buildSea(width: number, height: number): void {
    if (!this.textures.exists('ff-shark')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const body = 0x6f8aa3, dark = 0x4c6378, belly = 0xdfe8ef;
      g.fillStyle(dark).fillTriangle(0, 8, 0, 104, 52, 58);                       // tail
      g.fillStyle(dark).fillTriangle(104, 30, 140, 0, 150, 34);                    // dorsal fin
      g.fillStyle(body).fillEllipse(130, 60, 212, 76);
      g.fillStyle(belly).fillEllipse(150, 74, 150, 34);
      g.fillStyle(body).fillRect(60, 40, 60, 24);
      g.fillStyle(dark).fillTriangle(116, 76, 150, 74, 120, 106);                  // pectoral fin
      g.fillStyle(0xffffff).fillCircle(196, 50, 8);
      g.fillStyle(0x000000).fillCircle(198, 50, 5);
      g.lineStyle(3, dark).lineBetween(160, 46, 156, 66).lineBetween(150, 46, 146, 66).lineBetween(140, 46, 136, 66);
      g.lineStyle(3, 0x2b3a47).lineBetween(204, 72, 232, 66);
      g.fillStyle(0xffffff).fillTriangle(206, 71, 210, 71, 208, 77).fillTriangle(214, 70, 218, 70, 216, 76).fillTriangle(222, 69, 226, 69, 224, 75);
      g.generateTexture('ff-shark', 240, 110);
      g.clear();
      g.fillStyle(0x000000).fillCircle(11, 13, 11).fillCircle(29, 13, 11).fillTriangle(1, 18, 39, 18, 20, 38);
      g.fillStyle(0xec3013).fillCircle(11, 13, 8).fillCircle(29, 13, 8).fillTriangle(4, 16, 36, 16, 20, 34);
      g.fillStyle(0xffffff, 0.6).fillCircle(9, 10, 3);
      g.generateTexture('ff-heart', 40, 40);
      g.clear();
      g.fillStyle(0x000000).fillCircle(11, 13, 11).fillCircle(29, 13, 11).fillTriangle(1, 18, 39, 18, 20, 38);
      g.fillStyle(0x334455).fillCircle(11, 13, 8).fillCircle(29, 13, 8).fillTriangle(4, 16, 36, 16, 20, 34);
      g.generateTexture('ff-heart-empty', 40, 40);
      g.destroy();
    }
    const sea = this.add.graphics().setDepth(-20);
    sea.fillGradientStyle(0x56c2ee, 0x56c2ee, 0x0b3560, 0x0b3560, 1).fillRect(0, 0, width, height);
    // light rays
    for (let i = 0; i < 5; i++) {
      const ray = this.add.triangle(0, 0, 0, 0, 120, 0, 260, 620, 0xffffff, 0.06).setOrigin(0).setPosition(80 + i * 260, -10).setDepth(-19);
      this.tweens.add({ targets: ray, alpha: 0.25, duration: 2000 + i * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // sand floor
    for (let x = 32; x < width + 64; x += 64) {
      this.add.image(x, height - 32, 'ff-sand' + rng.pick([2, 3, 4, 5, 6, 7, 8, 9])).setDepth(-5);
    }
    // seaweed, coral and rocks sway gently
    const decos = [28, 29, 30, 32, 34, 48, 10, 11, 12, 14, 64, 65, 70, 47, 51, 82, 84, 86];
    for (let x = 30; x < width; x += rng.int(70, 130)) {
      const k = rng.pick(decos);
      const d = this.add.image(x, height - 52, 'ff-deco' + k).setOrigin(0.5, 1).setScale(rng.int(12, 18) / 10).setDepth(-6);
      if (k < 80) this.tweens.add({ targets: d, angle: rng.pick([-6, 6]), duration: rng.int(1200, 2000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.bubbles = this.add.particles(0, height - 50, 'ff-bubble', {
      x: { min: 0, max: width }, speedY: { min: -60, max: -130 }, speedX: { min: -12, max: 12 },
      scale: { min: 0.2, max: 0.55 }, alpha: { start: 0.7, end: 0 }, lifespan: 6000, frequency: 260,
    }).setDepth(-4);
  }

  private applySize(): void {
    this.player.setScale(this.size / PLAYER_W);
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? 'ff-heart' : 'ff-heart-empty'));
    const f = Phaser.Math.Clamp((this.size - START_SIZE) / (this.target - START_SIZE), 0, 1);
    this.barFill.width = 292 * f;
  }

  private banner(s: string, color: string): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.4, s, { title: true, size: 46, color }).setDepth(60).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1000, duration: 400, onComplete: () => b.destroy() });
  }

  // ---------- spawning ----------
  private spawnFish(small = false, atX?: number): void {
    const { width } = this.scale;
    const lvl = this.level;
    const p = this.size;
    const bigShare = Math.min(0.5, 0.3 + lvl * 0.03);
    const bigger = !small && rng.chance(bigShare);
    let size = bigger ? p * rng.int(118, 200) / 100 : p * rng.int(35, 85) / 100;
    size = Phaser.Math.Clamp(size, 26, 300);
    const puffer = !bigger && lvl >= 2 && rng.chance(0.18);
    const sp = rng.pick(SPECIES);
    const fromLeft = rng.chance(0.5);
    const x = atX ?? (fromLeft ? -size : width + size);
    const y = rng.int(SEA_TOP + 40, SEA_BOTTOM - 20);
    const img = this.add.image(x, y, puffer ? 'ff-puffer' : sp.key).setDepth(10).setAlpha(atX !== undefined ? 0 : 1);
    if (atX !== undefined) this.tweens.add({ targets: img, alpha: 1, duration: 500 });
    const baseW = puffer ? PUFFER_W : sp.w;
    img.setScale(size / baseW);
    const speed = (puffer ? 55 : 150 - Math.min(80, size * 0.3)) * (1 + 0.07 * (lvl - 1)) * rng.int(80, 125) / 100;
    const dir = atX !== undefined ? (rng.chance(0.5) ? 1 : -1) : fromLeft ? 1 : -1;
    img.setFlipX(dir < 0);
    this.fish.push({ img, kind: puffer ? 'puffer' : 'fish', size, baseW, vx: speed * dir, vy: 0, t: rng.int(0, 100) / 10, puffed: false, chase: 0, dead: false });
  }

  private spawnShark(): void {
    const { width } = this.scale;
    const fromLeft = rng.chance(0.5);
    const y = Phaser.Math.Clamp(this.player.y + rng.int(-80, 80), SEA_TOP + 60, SEA_BOTTOM - 40);
    const size = Math.max(230, this.size * 2.1);
    // warning arrow on the side it will come from
    const wx = fromLeft ? 60 : width - 60;
    const warn = txt(this, wx, y, '!', { title: true, size: 56, color: '#ec3013' }).setDepth(50);
    const label = txt(this, wx + (fromLeft ? 120 : -120), y, t('shark'), { title: true, size: 18, color: '#ffffff' }).setDepth(50);
    this.tweens.add({ targets: [warn, label], alpha: 0.2, duration: 160, yoyo: true, repeat: 3, onComplete: () => { warn.destroy(); label.destroy(); } });
    this.sfx('warn', { volume: 0.4 });
    this.time.delayedCall(1100, () => {
      if (this.isOver) return;
      const img = this.add.image(fromLeft ? -size : width + size, y, 'ff-shark').setDepth(15).setScale(size / SHARK_W).setFlipX(!fromLeft);
      const speed = Math.min(420, 250 + this.level * 18);
      this.fish.push({ img, kind: 'shark', size, baseW: SHARK_W, vx: fromLeft ? speed : -speed, vy: 0, t: 0, puffed: false, chase: this.level >= 3 ? 1.6 : 0, dead: false });
    });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    this.invuln = Math.max(0, this.invuln - dt);

    // player movement
    const maxV = Math.max(260, 380 - (this.size - START_SIZE) * 0.6);
    let ax = this.controls.axisX, ay = this.controls.axisY;
    if (this.pointer) {
      const dx = this.pointer.x - this.player.x, dy = this.pointer.y - this.player.y;
      const len = Math.hypot(dx, dy);
      if (len > 10) { const k = Math.min(1, len / 120) / len; ax = dx * k; ay = dy * k; } else { ax = 0; ay = 0; }
    }
    const acc = 9;
    this.vx += (ax * maxV - this.vx) * Math.min(1, acc * dt);
    this.vy += (ay * maxV - this.vy) * Math.min(1, acc * dt);
    const half = this.size / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x + this.vx * dt, half, width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y + this.vy * dt, SEA_TOP + half * 0.5, SEA_BOTTOM);
    if (Math.abs(this.vx) > 20) this.player.setFlipX(this.vx < 0);
    const tilt = Phaser.Math.Clamp(this.vy / maxV, -1, 1) * 20;
    this.player.setAngle(this.player.flipX ? -tilt : tilt);
    this.player.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 10) % 2 ? 0.35 : 1) : 1);

    // spawning (paused while the level-clear transition runs)
    this.spawnCd -= dt;
    const maxFish = 8 + this.level;
    if (!this.transition && this.spawnCd <= 0) {
      if (this.fish.filter((f) => f.kind !== 'shark').length < maxFish) {
        // keep enough food around: if few edible fish exist, force a small one
        const edible = this.fish.filter((f) => f.kind === 'fish' && f.size < this.size * 0.92).length;
        this.spawnFish(edible < 3);
      }
      this.spawnCd = Math.max(0.45, 1.3 - this.level * 0.08) * rng.int(70, 130) / 100;
    }
    if (this.level >= 2 && !this.transition) {
      this.sharkCd -= dt;
      if (this.sharkCd <= 0) {
        this.spawnShark();
        this.sharkCd = Math.max(5, 15 - this.level * 1.5) * rng.int(80, 120) / 100;
      }
    }

    // fish behaviour + collisions
    const px = this.player.x, py = this.player.y;
    for (const f of this.fish) {
      if (f.dead) continue;
      f.t += dt;
      const dx = f.img.x - px, dy = f.img.y - py;
      const dist = Math.hypot(dx, dy);
      if (f.kind === 'shark') {
        if (f.chase > 0 && Math.sign(-dx) === Math.sign(f.vx)) {
          f.chase -= dt;
          f.vy += Phaser.Math.Clamp(-dy, -1, 1) * 260 * dt;
          f.vy = Phaser.Math.Clamp(f.vy, -150, 150);
        } else f.vy *= 0.97;
      } else {
        f.vy = Math.sin(f.t * 2) * 20;
        // small fish flee when the player is close (level 2+)
        if (this.level >= 2 && f.size < this.size * 0.92 && dist < 170) f.vy += Math.sign(dy || 1) * 110;
        if (f.kind === 'puffer') {
          const near = dist < 170;
          if (near !== f.puffed) {
            f.puffed = near;
            if (near) this.sfx('puff', { volume: 0.25 });
            this.tweens.add({ targets: f.img, scale: (f.size * (near ? 1.7 : 1)) / f.baseW, duration: 200, ease: 'Back.easeOut' });
          }
        }
      }
      f.img.x += f.vx * dt;
      f.img.y = Phaser.Math.Clamp(f.img.y + f.vy * dt, SEA_TOP + 20, SEA_BOTTOM);
      const eff = f.kind === 'puffer' && f.puffed ? f.size * 1.7 : f.size;
      // danger tint: anything bigger than you glows reddish
      const danger = eff > this.size * 1.08;
      if (danger) {
        if (!f.glow) f.glow = this.add.ellipse(0, 0, 100, 100, 0xff2a2a, 0.3).setStrokeStyle(4, 0xff4040, 0.9).setDepth(9);
        f.glow.setPosition(f.img.x, f.img.y)
          .setScale(f.img.displayWidth * 1.05 / 100, f.img.displayHeight * (f.kind === 'shark' ? 0.8 : 0.75) / 100)
          .setAlpha(0.55 + Math.sin(f.t * 8) * 0.3).setVisible(true);
      } else f.glow?.setVisible(false);
      const reach = this.size * 0.36 + eff * (f.kind === 'shark' ? 0.3 : 0.36);
      if (dist < reach && !this.transition) {
        if (eff < this.size * 0.92) this.eat(f);
        else if (danger) this.hurt(f);
      }
      if ((f.vx > 0 && f.img.x > width + f.size + 40) || (f.vx < 0 && f.img.x < -f.size - 40)) {
        f.dead = true;
        f.img.destroy();
      }
    }
    for (const f of this.fish) if (f.dead) f.glow?.destroy();
    this.fish = this.fish.filter((f) => !f.dead);
  }

  private eat(f: Fish): void {
    f.dead = true;
    const { x, y } = f.img;
    this.tweens.killTweensOf(f.img);
    this.tweens.add({ targets: f.img, x: this.player.x, y: this.player.y, scale: 0, duration: 120, onComplete: () => f.img.destroy() });
    const bone = this.add.image(x, y, `ff-bone${rng.pick([90, 92, 94])}`).setScale(f.size / 50).setDepth(12).setFlipX(f.vx < 0);
    this.tweens.add({ targets: bone, y: y - 60, alpha: 0, angle: rng.int(-30, 30), duration: 900, onComplete: () => bone.destroy() });
    this.bubbles.explode(6, x, y);
    this.eatenCount++;
    const pts = Math.max(5, Math.round(f.size / 4)) * this.level;
    this.addScore(pts, x, y - 30);
    const big = f.size > this.size * 0.6;
    this.sfx(big ? 'eatbig' : 'eat', { volume: 0.45, detune: rng.int(-150, 150) });
    burst(this, x, y, [0xffffff, 0xbfefff], 8, 160);
    // grow
    this.size = Math.min(this.target, this.size + f.size * 0.11);
    this.applySize();
    this.tweens.add({ targets: this.player, scaleY: this.player.scaleY * 1.25, duration: 70, yoyo: true });
    this.updateHud();
    if (this.size >= this.target) this.levelClear();
  }

  private hurt(f: Fish): void {
    if (this.invuln > 0 || this.isOver) return;
    this.lives--;
    this.invuln = 2.2;
    this.sfx('bite', { volume: 0.6 });
    this.sfx('hurt', { volume: 0.4 });
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 160);
    burst(this, this.player.x, this.player.y, [0xec3013, 0xffffff], 26, 340);
    // the attacker lunges
    this.tweens.add({ targets: f.img, scaleX: f.img.scaleX * 1.15, scaleY: f.img.scaleY * 1.15, duration: 90, yoyo: true });
    // knock the player away
    const a = Phaser.Math.Angle.Between(f.img.x, f.img.y, this.player.x, this.player.y);
    this.vx = Math.cos(a) * 700; this.vy = Math.sin(a) * 700;
    this.updateHud();
    this.tweens.add({ targets: this.hearts[Math.max(0, this.lives)], scale: 1.6, duration: 120, yoyo: true });
    if (this.lives <= 0) {
      this.player.setVisible(false);
      const bone = this.add.image(this.player.x, this.player.y, 'ff-bone90').setScale(this.size / 50).setDepth(21);
      this.tweens.add({ targets: bone, y: bone.y - 120, angle: 180, alpha: 0, duration: 1200 });
      this.endGame({ title: t('eaten'), delay: 1100 });
    }
  }

  private levelClear(): void {
    this.transition = true;
    const bonus = 150 * this.level + this.lives * 50;
    this.addScore(bonus, this.player.x, this.player.y - 60);
    this.sfx('level', { volume: 0.55 });
    flash(this, 0xffffff, 140);
    this.banner(t('levelClear'), '#5dff7a');
    burst(this, this.player.x, this.player.y, [0xffd23f, 0x5dff7a, 0xffffff], 40, 420);
    // the sea clears: everyone else swims away fast
    for (const f of this.fish) {
      f.vx = (f.img.x < this.player.x ? -1 : 1) * 700;
      f.img.setFlipX(f.vx < 0);
    }
    this.time.delayedCall(1600, () => {
      if (this.isOver) return;
      this.level++;
      this.target = this.targetFor(this.level);
      this.size = START_SIZE;
      this.tweens.add({ targets: this.player, scale: START_SIZE / PLAYER_W, duration: 400, ease: 'Back.easeOut' });
      this.sfx('grow', { volume: 0.35 });
      this.updateHud();
      this.banner(`${t('level')} ${this.level}`, '#ffd23f');
      this.sharkCd = 4;
      this.transition = false;
      for (let i = 0; i < 4; i++) this.spawnFish(true);
    });
  }
}
