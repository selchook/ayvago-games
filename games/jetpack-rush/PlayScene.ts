import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';
import { W, H, CEIL, FLOOR, makeLabTextures } from './art';

const HERO_X = 270;
const GRAVITY = 2100;
const THRUST = 4300;
const MAX_UP = -620;
const MAX_DOWN = 900;
const PX_PER_M = 40;
const COIN_GAP = 46;

interface Zap {
  x: number; y: number; len: number; ang: number; spin: number;
  a: Phaser.GameObjects.Image; b: Phaser.GameObjects.Image;
  offs: number[];
}
interface Coin { img: Phaser.GameObjects.Image }
interface Missile { img: Phaser.GameObjects.Image; trail: Phaser.GameObjects.Particles.ParticleEmitter; vx: number }
interface Warning { icon: Phaser.GameObjects.Image; y: number; t: number; lock: number; count: number }
interface Pickup { img: Phaser.GameObjects.Image; t: number; y0: number }

const PATTERNS: string[][] = [
  ['oooooooooooo'],
  ['oooooooooo', 'oooooooooo'],
  ['oooooooooooo', 'oooooooooooo', 'oooooooooooo'],
  ['...oo...', '.oooooo.', 'oooooooo', '.oooooo.', '...oo...'],
  ['.oo..oo.', 'oooooooo', 'oooooooo', '.oooooo.', '..oooo..', '...oo...'],
  ['o.......o', '.o.....o.', '..o...o..', '...o.o...', '....o....'],
  ['oooooooooooooo', '..............', 'oooooooooooooo'],
];

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private hero!: Phaser.GameObjects.Sprite;
  private pack!: Phaser.GameObjects.Image;
  private bubble!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Particles.ParticleEmitter;
  private wall!: Phaser.GameObjects.TileSprite;
  private floor!: Phaser.GameObjects.TileSprite;
  private ceil!: Phaser.GameObjects.TileSprite;
  private zapG!: Phaser.GameObjects.Graphics;
  private jet?: Phaser.Sound.BaseSound;
  private hy = FLOOR - 50;
  private vy = 0;
  private speed = 430;
  private dist = 0;
  private coins = 0;
  private toNext = 900;
  private missileCd = 9;
  private zaps: Zap[] = [];
  private coinList: Coin[] = [];
  private missiles: Missile[] = [];
  private warnings: Warning[] = [];
  private pickups: Pickup[] = [];
  private pointerHeld = false;
  private grounded = true;
  private runT = 0;
  private flicker = 0;
  private shield = false;
  private invuln = 0;
  private dying = false;
  private dieT = 0;
  private milestone = 500;
  private thrusting = false;

  createGame(): void {
    makeLabTextures(this);
    this.hy = FLOOR - 50; this.vy = 0; this.speed = 430; this.dist = 0; this.coins = 0; this.toNext = 900;
    this.missileCd = 9; this.zaps = []; this.coinList = []; this.missiles = []; this.warnings = []; this.pickups = [];
    this.pointerHeld = false; this.grounded = true; this.runT = 0; this.flicker = 0; this.shield = false; this.invuln = 0;
    this.dying = false; this.dieT = 0; this.milestone = 500; this.thrusting = false;

    this.wall = this.add.tileSprite(0, 0, W, H, 'lab-wall').setOrigin(0).setDepth(0);
    this.ceil = this.add.tileSprite(0, CEIL - 84, W, 84, 'lab-floor').setOrigin(0).setDepth(2).setFlipY(true);
    this.floor = this.add.tileSprite(0, FLOOR, W, 84, 'lab-floor').setOrigin(0).setDepth(2);
    this.zapG = this.add.graphics().setDepth(12);

    this.flame = this.add.particles(0, 0, 'dot', {
      speedY: { min: 280, max: 420 }, speedX: { min: -140, max: -60 }, scale: { start: 0.9, end: 0 },
      lifespan: { min: 160, max: 320 }, tint: [0xffd23f, 0xff7a1a, 0xff3b1a], blendMode: 'ADD', frequency: 16, emitting: false,
    }).setDepth(19);
    this.pack = this.add.image(0, 0, 'jetpack').setDepth(19).setScale(0.9);
    this.hero = this.add.sprite(HERO_X, this.hy, 'hero-walk1').setScale(0.5).setDepth(20);
    this.bubble = this.add.image(HERO_X, this.hy, 'bubble').setDepth(21).setScale(0.85).setVisible(false);

    this.controls = new Controls(this);
    this.input.on('pointerdown', () => { this.pointerHeld = true; });
    this.input.on('pointerup', () => { this.pointerHeld = false; });
    this.input.on('pointerupoutside', () => { this.pointerHeld = false; });

    // jetpack hiss, a loop whose level follows the thrust
    this.jet = this.sound.add('jet', { loop: true, volume: 0 });
    this.jet.play();
    const onPause = () => this.jet?.pause();
    const onResume = () => { if (!this.dying) this.jet?.resume(); };
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.jet?.destroy();
      this.jet = undefined;
    });

    const hint = txt(this, W / 2, H * 0.38, t('startHint'), { size: 34, color: '#ffffff', wrap: 900 }).setDepth(80);
    this.tweens.add({ targets: hint, alpha: 0, delay: 3000, duration: 600, onComplete: () => hint.destroy() });
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setCenter(`${Math.floor(this.dist / PX_PER_M)} m`);
    this.hud.setRight(`${t('coins')} ${this.coins}`);
  }

  private get meters(): number {
    return this.dist / PX_PER_M;
  }

  // ---------------------------------------------------------------- spawning

  private spawnChunk(): void {
    const m = this.meters;
    const x = W + 120;
    const roll = Math.random();
    let width = 300;
    if (m < 60 || roll < 0.28) width = this.spawnCoins(x, rng.int(CEIL + 60, FLOOR - 180));
    else if (m > 450 && roll < 0.45) width = this.spawnRotating(x);
    else if (m > 250 && roll < 0.6) width = this.spawnPair(x);
    else width = this.spawnZapper(x, true);
    // rare shield
    if (!this.shield && m > 150 && rng.chance(0.06)) {
      const img = this.add.image(x + width + 140, rng.int(CEIL + 80, FLOOR - 80), 'gem').setScale(0.65).setDepth(15);
      this.pickups.push({ img, t: 0, y0: img.y });
    }
    const gap = Math.max(260, 560 - m * 0.18);
    this.toNext = width + gap * rng.int(80, 120) / 100;
  }

  private spawnCoins(x: number, y: number): number {
    const p = rng.pick(PATTERNS);
    const rows = p.length;
    const top = Phaser.Math.Clamp(y, CEIL + 40, FLOOR - 30 - (rows - 1) * COIN_GAP);
    p.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== 'o') continue;
        const img = this.add.image(x + c * COIN_GAP, top + r * COIN_GAP, 'coin').setScale(0.32).setDepth(14);
        this.coinList.push({ img });
      }
    });
    return p[0].length * COIN_GAP;
  }

  private addZap(x: number, y: number, len: number, ang: number, spin = 0): void {
    const a = this.add.image(0, 0, 'orb').setDepth(13);
    const b = this.add.image(0, 0, 'orb').setDepth(13);
    const z: Zap = { x, y, len, ang, spin, a, b, offs: [] };
    this.placeOrbs(z);
    this.zaps.push(z);
  }

  private placeOrbs(z: Zap): void {
    const dx = Math.cos(z.ang) * z.len / 2, dy = Math.sin(z.ang) * z.len / 2;
    z.a.setPosition(z.x - dx, z.y - dy);
    z.b.setPosition(z.x + dx, z.y + dy);
  }

  private zapLen(): number {
    return Math.min(380, 170 + this.meters * 0.09) * rng.int(85, 115) / 100;
  }

  private spawnZapper(x: number, withCoins: boolean): number {
    const len = this.zapLen();
    const kind = rng.int(0, 3);
    const ang = [Math.PI / 2, 0, Math.PI / 4, -Math.PI / 4][kind];
    const half = Math.abs(Math.sin(ang)) * len / 2 + 30;
    const y = rng.int(CEIL + half, FLOOR - half);
    this.addZap(x + len / 2, y, len, ang);
    // coins dodge around it
    if (withCoins && rng.chance(0.55)) {
      const cy = y < (CEIL + FLOOR) / 2 ? Math.min(FLOOR - 40, y + half + 70) : Math.max(CEIL + 40, y - half - 70);
      for (let k = 0; k < 6; k++) {
        const img = this.add.image(x + k * COIN_GAP, cy, 'coin').setScale(0.32).setDepth(14);
        this.coinList.push({ img });
      }
    }
    return Math.max(len * Math.abs(Math.cos(ang)), 60) + 80;
  }

  private spawnPair(x: number): number {
    // a horizontal gate: two zappers leave one opening the player must thread
    const gapH = Math.max(170, 260 - this.meters * 0.03);
    const gapY = rng.int(CEIL + 40 + gapH / 2, FLOOR - 40 - gapH / 2);
    const topLen = gapY - gapH / 2 - CEIL - 10;
    const botLen = FLOOR - (gapY + gapH / 2) - 10;
    if (topLen > 60) this.addZap(x + 40, CEIL + 10 + topLen / 2, topLen, Math.PI / 2);
    if (botLen > 60) this.addZap(x + 40, gapY + gapH / 2 + botLen / 2, botLen, Math.PI / 2);
    for (let k = 0; k < 3; k++) this.coinList.push({ img: this.add.image(x + 40 + (k - 1) * COIN_GAP, gapY, 'coin').setScale(0.32).setDepth(14) });
    return 160;
  }

  private spawnRotating(x: number): number {
    const len = Math.min(340, 200 + this.meters * 0.05);
    const y = rng.int(CEIL + len / 2 + 10, FLOOR - len / 2 - 10);
    const spin = (rng.chance(0.5) ? 1 : -1) * Phaser.Math.DegToRad(Math.min(150, 60 + this.meters * 0.03));
    this.addZap(x + len / 2, y, len, rng.int(0, 180) * Math.PI / 180, spin);
    return len + 60;
  }

  private queueMissiles(): void {
    const m = this.meters;
    const n = m > 1600 ? rng.int(1, 3) : m > 800 ? rng.int(1, 2) : 1;
    for (let i = 0; i < n; i++) {
      const icon = this.add.image(W - 50, this.hy, 'warn').setDepth(60).setScale(0.8);
      this.warnings.push({ icon, y: this.hy + (i - (n - 1) / 2) * 120, t: 0, lock: 1.1 + i * 0.35, count: 0 });
    }
    this.sfx('alarm', { volume: 0.5 });
    this.missileCd = Math.max(2.4, 8 - m * 0.003) * rng.int(80, 125) / 100;
  }

  private launchMissile(y: number): void {
    const img = this.add.image(W + 60, y, 'missile').setDepth(16);
    const trail = this.add.particles(0, 0, 'dot', {
      speedX: { min: 40, max: 160 }, speedY: { min: -40, max: 40 }, scale: { start: 0.8, end: 0 },
      lifespan: 300, tint: [0xffd23f, 0xff7a1a, 0x999999], blendMode: 'ADD', frequency: 14, follow: img, followOffset: { x: 44, y: 0 },
    }).setDepth(15);
    this.missiles.push({ img, trail, vx: -(this.speed + 760) });
    this.sfx('launch', { volume: 0.55 });
  }

  // ---------------------------------------------------------------- hits

  private hit(kind: 'zap' | 'missile', x: number, y: number): void {
    if (this.invuln > 0 || this.dying) return;
    if (this.shield) {
      this.shield = false;
      this.bubble.setVisible(false);
      this.invuln = 1.4;
      burst(this, HERO_X, this.hy, [0x3ee6ff, 0xffffff], 30, 380);
      flash(this, 0x3ee6ff, 120, 0.3);
      shake(this, 0.01, 200);
      this.sfx('pop', { volume: 0.7 });
      return;
    }
    this.dying = true;
    this.dieT = 0;
    this.vy = -520;
    this.hero.setTexture('hero-hit');
    this.flame.emitting = false;
    this.jet?.stop();
    if (kind === 'zap') {
      this.sfx('zap', { volume: 0.8 });
      flash(this, 0xfff3a0, 200, 0.6);
      this.hero.setTintFill(0xffffff);
      this.time.delayedCall(90, () => this.hero.setTint(0x222233));
      this.time.delayedCall(180, () => this.hero.setTintFill(0xffffff));
      this.time.delayedCall(270, () => this.hero.clearTint());
      burst(this, HERO_X, this.hy, [0xffe14d, 0xffffff, 0x3ee6ff], 30, 420);
    } else {
      this.sfx('boom', { volume: 0.8 });
      flash(this, 0xffa040, 200, 0.6);
      burst(this, x, y, [0xffd23f, 0xff7a1a, 0x555555], 40, 520);
    }
    shake(this, 0.02, 400);
    popup(this, HERO_X + 60, this.hy - 80, `${Math.floor(this.meters)} m`, '#3ee6ff', 30);
  }

  private collectCoin(c: Coin): void {
    this.coins++;
    this.sfxAt('coin', c.img.x, { volume: 0.4 });
    burst(this, c.img.x, c.img.y, [0xffd23f, 0xffffff], 6, 160);
    const img = c.img;
    this.tweens.add({ targets: img, scale: 0.55, alpha: 0, y: img.y - 30, duration: 180, onComplete: () => img.destroy() });
  }

  // ---------------------------------------------------------------- loop

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    const held = !this.dying && (this.pointerHeld || c.a || c.up);

    if (this.dying) {
      this.dieT += dt;
      this.speed *= Math.pow(0.35, dt);
      this.hero.angle += (this.grounded ? 0 : -260) * dt;
      if (this.dieT > 1.8 || (this.grounded && this.speed < 60 && this.dieT > 0.9)) {
        this.endGame({ title: t('crashed'), delay: 200 });
      }
    } else {
      this.speed = Math.min(1050, 430 + this.meters * 0.26);
    }
    const move = this.speed * dt;
    this.dist += move;

    // hero physics
    this.vy += (held ? -THRUST : 0) * dt + GRAVITY * dt;
    this.vy = Phaser.Math.Clamp(this.vy, MAX_UP, MAX_DOWN);
    this.hy += this.vy * dt;
    const footY = FLOOR - 48;
    if (this.hy >= footY) {
      if (!this.grounded && this.vy > 300) {
        this.sfx('land', { volume: 0.4 });
        burst(this, HERO_X, FLOOR, [0x8a93c0, 0xffffff], 8, 160);
        if (this.dying) { this.vy = -this.vy * 0.35; this.hy = footY; if (Math.abs(this.vy) < 120) this.vy = 0; }
      }
      if (!this.dying || this.vy >= 0) { this.hy = footY; this.vy = 0; this.grounded = true; }
    } else this.grounded = false;
    if (this.hy < CEIL + 46) { this.hy = CEIL + 46; this.vy = Math.max(0, this.vy); }

    // hero visuals
    if (!this.dying) {
      if (this.grounded && !held) {
        this.runT += dt * (this.speed / 60);
        this.hero.setTexture(Math.floor(this.runT) % 2 ? 'hero-walk1' : 'hero-walk2');
        this.hero.angle = 0;
      } else {
        this.hero.setTexture('hero-jump');
        this.hero.angle = Phaser.Math.Clamp(this.vy / 90, -6, 8);
      }
      if (held && !this.thrusting) this.sfx('thrust', { volume: 0.3 });
      this.thrusting = held;
      this.flame.emitting = held;
      (this.jet as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | undefined)?.setVolume(held ? 0.3 : 0);
    }
    this.hero.y = this.hy;
    this.pack.setPosition(HERO_X - 30, this.hy + 2).setAngle(this.hero.angle);
    this.flame.setPosition(HERO_X - 30, this.hy + 32);
    this.bubble.setPosition(HERO_X, this.hy).setVisible(this.shield);
    if (this.invuln > 0) { this.invuln -= dt; this.hero.setAlpha(Math.floor(this.invuln * 12) % 2 ? 0.4 : 1); } else this.hero.setAlpha(1);

    // scrolling
    this.wall.tilePositionX += move * 0.5;
    this.floor.tilePositionX += move;
    this.ceil.tilePositionX += move;

    // spawning
    if (!this.dying) {
      this.toNext -= move;
      if (this.toNext <= 0) this.spawnChunk();
      if (this.meters > 120) {
        this.missileCd -= dt;
        if (this.missileCd <= 0) this.queueMissiles();
      }
    }

    // zappers (the lightning re-jitters every 50 ms, the beams are redrawn every frame)
    this.flicker -= dt;
    const jitter = this.flicker <= 0;
    if (jitter) this.flicker = 0.05;
    this.zapG.clear();
    for (const z of [...this.zaps]) {
      z.x -= move;
      z.ang += z.spin * dt;
      this.placeOrbs(z);
      if (z.x + z.len < -100) {
        z.a.destroy(); z.b.destroy();
        this.zaps.splice(this.zaps.indexOf(z), 1);
        continue;
      }
      if (jitter || !z.offs.length) {
        const steps = Math.max(4, Math.round(z.len / 28));
        z.offs = Array.from({ length: steps + 1 }, (_, i) => (i === 0 || i === steps ? 0 : rng.int(-9, 9)));
      }
      this.drawBeam(z);
      // collision: hero circle vs beam segment
      if (!this.dying && segDist(HERO_X, this.hy, z.a.x, z.a.y, z.b.x, z.b.y) < 34) this.hit('zap', HERO_X, this.hy);
    }

    // coins
    for (const cn of [...this.coinList]) {
      cn.img.x -= move;
      if (cn.img.x < -40) { cn.img.destroy(); this.coinList.splice(this.coinList.indexOf(cn), 1); continue; }
      if (!this.dying && Math.abs(cn.img.x - HERO_X) < 40 && Math.abs(cn.img.y - this.hy) < 52) {
        this.coinList.splice(this.coinList.indexOf(cn), 1);
        this.collectCoin(cn);
      }
    }

    // pickups
    for (const p of [...this.pickups]) {
      p.t += dt;
      p.img.x -= move;
      p.img.y = p.y0 + Math.sin(p.t * 4) * 14;
      if (p.img.x < -60) { p.img.destroy(); this.pickups.splice(this.pickups.indexOf(p), 1); continue; }
      if (!this.dying && Math.abs(p.img.x - HERO_X) < 50 && Math.abs(p.img.y - this.hy) < 60) {
        this.shield = true;
        burst(this, p.img.x, p.img.y, [0x3ee6ff, 0xffffff], 20, 300);
        this.sfx('shield', { volume: 0.7 });
        popup(this, p.img.x, p.img.y - 40, t('shield'), '#3ee6ff', 22);
        p.img.destroy();
        this.pickups.splice(this.pickups.indexOf(p), 1);
      }
    }

    // missile warnings
    for (const w of [...this.warnings]) {
      w.t += dt;
      if (w.t < w.lock) w.y += (this.hy - w.y) * Math.min(1, dt * 5);
      w.icon.y = Phaser.Math.Clamp(w.y, CEIL + 40, FLOOR - 30);
      const fast = w.t > w.lock;
      w.icon.setAlpha(Math.floor(w.t * (fast ? 16 : 7)) % 2 ? 0.35 : 1).setScale(fast ? 1 : 0.8);
      const beeps = Math.floor(w.t * (fast ? 8 : 3));
      if (beeps !== w.count) { w.count = beeps; this.sfx('beep', { volume: 0.25 }); }
      if (w.t > w.lock + 0.45 || this.dying) {
        if (!this.dying) this.launchMissile(w.icon.y);
        w.icon.destroy();
        this.warnings.splice(this.warnings.indexOf(w), 1);
      }
    }
    for (const ms of [...this.missiles]) {
      ms.img.x += ms.vx * dt;
      if (ms.img.x < -120) {
        ms.trail.stop();
        const tr = ms.trail;
        this.time.delayedCall(400, () => tr.destroy());
        ms.img.destroy();
        this.missiles.splice(this.missiles.indexOf(ms), 1);
        continue;
      }
      if (!this.dying && Math.abs(ms.img.x - HERO_X) < 50 && Math.abs(ms.img.y - this.hy) < 34) {
        this.hit('missile', ms.img.x, ms.img.y);
        ms.trail.stop();
        ms.img.destroy();
        this.missiles.splice(this.missiles.indexOf(ms), 1);
      }
    }

    // score and milestones
    if (!this.dying) {
      this.setScore(Math.floor(this.meters) + this.coins * 10);
      if (this.meters >= this.milestone) {
        const b = txt(this, W / 2, H * 0.3, `${this.milestone} m!`, { title: true, size: 44, color: '#5dff7a', strokeThickness: 10 }).setDepth(80).setScale(0.3);
        this.tweens.add({ targets: b, scale: 1, duration: 300, ease: 'Back.easeOut' });
        this.tweens.add({ targets: b, alpha: 0, delay: 900, duration: 400, onComplete: () => b.destroy() });
        this.sfx('milestone', { volume: 0.6 });
        this.milestone += 500;
      }
      this.updateHud();
    }
  }

  private drawBeam(z: Zap): void {
    const g = this.zapG;
    const ax = z.a.x, ay = z.a.y, bx = z.b.x, by = z.b.y;
    const nx = -(by - ay) / z.len, ny = (bx - ax) / z.len;
    const steps = z.offs.length - 1;
    g.lineStyle(24, 0xffe14d, 0.16).lineBetween(ax, ay, bx, by);
    for (const [w, col, a] of [[9, 0xffe14d, 0.6], [3, 0xffffff, 1]] as Array<[number, number, number]>) {
      g.lineStyle(w, col, a).beginPath();
      for (let i = 0; i <= steps; i++) {
        const f = i / steps, o = z.offs[i];
        const x = ax + (bx - ax) * f + nx * o, y = ay + (by - ay) * f + ny * o;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }
}

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let k = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}
