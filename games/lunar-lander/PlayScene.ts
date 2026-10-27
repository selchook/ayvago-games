import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng, ensurePixel } from '@core';

interface Pad { x0: number; x1: number; y: number; mult: number }

const W = 720;
const TOP_TERRAIN = 720, BOTTOM_TERRAIN = 1000;
const LS = 1.3;                         // lander display scale
const FOOT_X = 27 * LS, FOOT_Y = 29 * LS; // feet offset from the lander centre
const SAFE_VY = 60, SAFE_VX = 40, SAFE_ANGLE = 12;
const FUEL_MAX = 1000;

/** Retro lunar module drawn once with Graphics (64x64, feet at y=59). */
export function makeLanderTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('lander')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(3, 0xb0b4c0);
  g.lineBetween(16, 38, 5, 58).lineBetween(48, 38, 59, 58).lineBetween(22, 42, 12, 58).lineBetween(42, 42, 52, 58);
  g.fillStyle(0xb0b4c0).fillRect(0, 57, 12, 4).fillRect(52, 57, 12, 4);
  g.fillStyle(0x55555f).fillTriangle(26, 44, 38, 44, 42, 54).fillTriangle(26, 44, 22, 54, 42, 54);
  g.fillStyle(0xd9a520).fillRect(12, 30, 40, 15);
  g.fillStyle(0xf2c94c).fillRect(12, 30, 40, 4);
  g.fillStyle(0xa77a12).fillRect(20, 36, 3, 9).fillRect(41, 36, 3, 9);
  g.fillStyle(0xd7dbe6).fillPoints([{ x: 20, y: 30 }, { x: 18, y: 18 }, { x: 25, y: 7 }, { x: 39, y: 7 }, { x: 46, y: 18 }, { x: 44, y: 30 }], true);
  g.fillStyle(0x9aa0b0).fillRect(18, 22, 28, 3);
  g.fillStyle(0x1e3a7a).fillCircle(32, 17, 6);
  g.fillStyle(0x7fb2ff).fillCircle(30, 15, 2);
  g.fillStyle(0xd7dbe6).fillRect(31, 0, 2, 7);
  g.generateTexture('lander', 64, 64);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private lander!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private exhaust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private terrainG!: Phaser.GameObjects.Graphics;
  private padLabels: Phaser.GameObjects.Text[] = [];
  private gauge!: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text[] = [];
  private windText!: Phaser.GameObjects.Text;
  private thrustSnd?: Phaser.Sound.BaseSound;
  private pts: number[] = [];      // terrain heights every STEP px
  private pads: Pad[] = [];
  private vx = 0;
  private vy = 0;
  private ang = 0;                 // degrees, 0 = upright
  private fuel = FUEL_MAX;
  private lives = 3;
  private level = 0;
  private flying = false;
  private gravity = 60;
  private wind = 0;
  private warnCd = 0;
  private touchL = false;
  private touchR = false;
  private readonly STEP = 24;

  createGame(): void {
    const { width, height } = this.scale;
    makeLanderTexture(this);
    this.padLabels = []; this.pts = []; this.pads = []; this.info = [];
    this.fuel = FUEL_MAX; this.lives = 3; this.level = 0; this.flying = false; this.warnCd = 0; this.touchL = this.touchR = false;

    for (let i = 0; i < 110; i++) this.add.image(rng.int(0, width), rng.int(60, BOTTOM_TERRAIN), 'star').setScale(0.05 + Math.random() * 0.16).setAlpha(0.2 + Math.random() * 0.5);
    this.add.image(width * 0.8, 240, 'planet').setScale(1.1).setTint(0x8fb4ff).setAlpha(0.8);
    this.terrainG = this.add.graphics().setDepth(2);

    this.exhaust = this.add.particles(0, 0, ensurePixel(this), {
      speed: { min: 60, max: 160 }, lifespan: 420, scale: { start: 1.8, end: 0 }, tint: [0xffd23f, 0xff7b00, 0xffffff], frequency: 16, emitting: false,
    }).setDepth(8);
    this.dust = this.add.particles(0, 0, ensurePixel(this), {
      speedX: { min: -220, max: 220 }, speedY: { min: -60, max: -10 }, lifespan: 500, scale: { start: 1.6, end: 0 }, tint: 0x9a9aa8, frequency: 25, emitting: false,
    }).setDepth(8);
    this.flame = this.add.image(0, 0, 'flame').setOrigin(0.5, 0).setDepth(9).setVisible(false);
    this.lander = this.add.image(width / 2, 160, 'lander').setDepth(10);

    this.gauge = this.add.graphics().setDepth(9000);
    this.info = [0, 1, 2].map((i) => txt(this, 24, 176 + i * 30, '', { size: 26, align: 'left' }).setOrigin(0, 0).setDepth(9000));
    this.windText = txt(this, width - 24, 140, '', { size: 24, align: 'right', color: '#3ee6ff' }).setOrigin(1, 0).setDepth(9000);

    this.controls = new Controls(this, { buttons: ['A'] });
    if (this.controls.touchUi) this.buildRotateButtons();

    this.thrustSnd = undefined;
    if (this.cache.audio.exists('thrust')) this.thrustSnd = this.sound.add('thrust', { loop: true, volume: 0.25 });
    const stop = () => this.thrustSnd?.stop();
    this.events.on(Phaser.Scenes.Events.PAUSE, stop);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, stop);
      this.thrustSnd?.destroy(); this.thrustSnd = undefined;
    });

    this.nextLevel();
  }

  private buildRotateButtons(): void {
    const { height } = this.scale;
    [[-1, 100], [1, 260]].forEach(([dir, x]) => {
      const y = height - 130;
      const c = this.add.circle(x, y, 72, 0x3ee6ff, 0.3).setStrokeStyle(5, 0xffffff, 0.6).setDepth(9500).setInteractive();
      const tri = this.add.triangle(x, y, 0, 0, 0, 44, 36 * dir, 22, 0xffffff, 0.85).setDepth(9501);
      tri.setPosition(x - dir * 4, y);
      const set = (v: boolean) => {
        if (dir < 0) this.touchL = v; else this.touchR = v;
        c.setFillStyle(0x3ee6ff, v ? 0.6 : 0.3);
      };
      c.on('pointerdown', () => set(true));
      c.on('pointerup', () => set(false));
      c.on('pointerout', () => set(false));
    });
  }

  // ---------- level ----------
  private nextLevel(): void {
    this.level++;
    this.gravity = Math.min(95, 52 + this.level * 5);
    this.wind = this.level >= 3 ? rng.pick([-1, 1]) * Math.min(32, (this.level - 2) * 7) : 0;
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.updateLives();
    this.buildTerrain();
    this.spawn();
    this.banner(`${t('level')} ${this.level}`, '#ffd23f');
  }

  private buildTerrain(): void {
    const n = Math.ceil(W / this.STEP) + 1;
    // pads: narrower = higher multiplier; later levels shrink every pad
    const shrink = Math.max(0.55, 1 - (this.level - 1) * 0.06);
    const defs = this.level <= 2 ? [{ w: 7, m: 2 }, { w: 5, m: 3 }, { w: 4, m: 5 }] : [{ w: 6, m: 2 }, { w: 4, m: 4 }, { w: 3, m: 6 }].slice(0, this.level >= 6 ? 2 : 3);
    const slots: Array<{ i: number; w: number; m: number }> = [];
    for (const d of rng.shuffle([...defs])) {
      const w = Math.max(3, Math.round(d.w * shrink));
      for (let tries = 0; tries < 40; tries++) {
        const i = rng.int(1, n - w - 2);
        if (slots.every((s) => i + w + 2 < s.i || i > s.i + s.w + 2)) { slots.push({ i, w, m: d.m }); break; }
      }
    }
    const pts: number[] = [];
    let y = rng.int(TOP_TERRAIN + 60, BOTTOM_TERRAIN - 60);
    const rough = 30 + Math.min(50, this.level * 6);
    for (let i = 0; i < n; i++) {
      const pad = slots.find((s) => i > s.i && i <= s.i + s.w);
      if (!pad) y = Phaser.Math.Clamp(y + rng.int(-rough, rough), TOP_TERRAIN, BOTTOM_TERRAIN);
      pts.push(y);
    }
    this.pts = pts;
    this.pads = slots.map((s) => ({ x0: s.i * this.STEP, x1: (s.i + s.w) * this.STEP, y: pts[s.i + 1], mult: s.m }));
    for (const p of this.pads) for (let i = Math.round(p.x0 / this.STEP); i <= Math.round(p.x1 / this.STEP); i++) pts[i] = p.y;
    this.drawTerrain();
  }

  private drawTerrain(): void {
    const g = this.terrainG;
    const { height } = this.scale;
    g.clear();
    g.fillStyle(0x2c2c36).beginPath().moveTo(0, height);
    this.pts.forEach((y, i) => g.lineTo(i * this.STEP, y));
    g.lineTo(W, height).closePath().fillPath();
    // a lighter rim + some craters
    g.lineStyle(4, 0x9a9aa8).beginPath();
    this.pts.forEach((y, i) => (i ? g.lineTo(i * this.STEP, y) : g.moveTo(0, y)));
    g.strokePath();
    const r = rng.seeded(this.level * 977);
    for (let k = 0; k < 18; k++) {
      const x = r() * W, i = Math.min(this.pts.length - 1, Math.floor(x / this.STEP));
      g.fillStyle(0x23232c).fillEllipse(x, this.pts[i] + 40 + r() * 140, 20 + r() * 40, 8 + r() * 12);
    }
    for (const l of this.padLabels) l.destroy();
    this.padLabels = [];
    for (const p of this.pads) {
      g.fillStyle(0x5dff7a).fillRect(p.x0, p.y - 3, p.x1 - p.x0, 6);
      g.fillStyle(0xffd23f).fillRect(p.x0, p.y - 10, 4, 10).fillRect(p.x1 - 4, p.y - 10, 4, 10);
      const lbl = txt(this, (p.x0 + p.x1) / 2, p.y + 26, `x${p.mult}`, { title: true, size: 18, color: '#5dff7a' }).setDepth(3);
      this.padLabels.push(lbl);
    }
  }

  private groundAt(x: number): number {
    const fx = Phaser.Math.Clamp(x, 0, W - 0.01) / this.STEP;
    const i = Math.floor(fx), f = fx - i;
    return this.pts[i] * (1 - f) + this.pts[Math.min(i + 1, this.pts.length - 1)] * f;
  }

  private spawn(): void {
    this.lander.setPosition(rng.int(120, W - 120), 170).setAngle(0).setVisible(true).setScale(0);
    this.tweens.add({ targets: this.lander, scale: LS, duration: 400, ease: 'Back.easeOut' });
    this.vx = rng.int(-50, 50); this.vy = 10; this.ang = 0;
    this.flying = true;
    this.sfx('ready', { volume: 0.3 });
  }

  // ---------- helpers ----------
  private banner(s: string, color: string, sub?: string): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.33, s, { title: true, size: 36, color, wrap: width - 60 }).setDepth(7000).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1400, duration: 400, onComplete: () => b.destroy() });
    if (sub) {
      const s2 = txt(this, width / 2, height * 0.33 + 60, sub, { size: 30, color: '#f3f2f2' }).setDepth(7000).setAlpha(0);
      this.tweens.add({ targets: s2, alpha: 1, duration: 200, delay: 200, hold: 1200, yoyo: true, onComplete: () => s2.destroy() });
    }
  }

  private updateLives(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
  }

  private drawGauges(): void {
    const g = this.gauge;
    g.clear();
    const f = this.fuel / FUEL_MAX;
    g.fillStyle(0x000000, 0.5).fillRect(24, 150, 220, 18);
    g.fillStyle(f > 0.3 ? 0x5dff7a : f > 0.12 ? 0xffd23f : 0xec3013).fillRect(26, 152, 216 * Math.min(1, f), 14);
    g.lineStyle(2, 0xffffff, 0.7).strokeRect(24, 150, 220, 18);
    const hs = Math.round(this.vx / 2), vs = Math.round(this.vy / 2);
    const okH = Math.abs(this.vx) < SAFE_VX, okV = this.vy < SAFE_VY, okA = Math.abs(this.ang) < SAFE_ANGLE;
    const col = (ok: boolean) => (ok ? '#5dff7a' : '#ff6a4f');
    this.info[0].setText(`${t('hspeed')} ${hs}`).setColor(col(okH));
    this.info[1].setText(`${t('vspeed')} ${vs}`).setColor(col(okV));
    this.info[2].setText(`${t('fuel')} ${Math.ceil(this.fuel)}`).setColor(f > 0.15 ? '#f3f2f2' : '#ff6a4f');
    this.lander.setTint(this.flying && okH && okV && okA ? 0xffffff : this.flying ? 0xffe0d0 : 0xffffff);
    if (this.wind) this.windText.setText(`${t('wind')} ${this.wind > 0 ? '>>' : '<<'} ${Math.abs(Math.round(this.wind))}`);
    else this.windText.setText('');
  }

  // ---------- outcomes ----------
  private touchdown(): void {
    const { x, y } = this.lander;
    const lx = x - FOOT_X, rx = x + FOOT_X;
    const pad = this.pads.find((p) => lx >= p.x0 - 8 && rx <= p.x1 + 8);
    let reason = '';
    if (!pad) reason = t('noPad');
    else if (this.vy >= SAFE_VY || Math.abs(this.vx) >= SAFE_VX) reason = t('tooFast');
    else if (Math.abs(this.ang) >= SAFE_ANGLE) reason = t('tilted');
    if (reason || !pad) { this.crash(reason); return; }

    this.flying = false;
    this.lander.setY(pad.y - FOOT_Y - 3).setAngle(0);
    this.stopThrust();
    const perfect = this.vy < 25 && Math.abs(this.ang) < 4 && Math.abs(this.vx) < 12;
    const pts = 50 * pad.mult * (perfect ? 2 : 1) + this.level * 25;
    this.addScore(pts, x, y - 70);
    const refuel = perfect ? 450 : 300;
    this.time.delayedCall(500, () => popup(this, x, y - 120, `+${refuel} ${t('fuelBonus')}`, '#3ee6ff', 20));
    this.fuel = Math.min(FUEL_MAX, this.fuel + refuel);
    burst(this, x, pad.y, [0x5dff7a, 0xffd23f, 0xffffff, 0x3ee6ff], 40, 300);
    this.dust.explode(30, x, pad.y);
    this.sfx('touch', { volume: 0.6 });
    this.sfx(perfect ? 'perfect' : 'land');
    flash(this, 0x5dff7a, 120);
    this.banner(perfect ? t('perfect') : t('landed'), '#5dff7a', `x${pad.mult}`);
    this.time.delayedCall(2300, () => { if (!this.isOver) this.nextLevel(); });
  }

  private crash(reason: string): void {
    this.flying = false;
    this.stopThrust();
    const { x, y } = this.lander;
    this.lander.setVisible(false);
    burst(this, x, y, [0xec3013, 0xffd23f, 0xd9a520, 0xffffff], 60, 420);
    burst(this, x, y, [0x9a9aa8, 0x55555f], 30, 200);
    shake(this, 0.025, 400);
    flash(this, 0xec3013, 180);
    this.sfx('crash', { volume: 0.6 });
    this.sfx('boom', { volume: 0.5 });
    this.lives--;
    this.updateLives();
    this.banner(t('crashed'), '#ec3013', reason);
    if (this.lives <= 0) { this.endGame({ delay: 1600 }); return; }
    this.fuel = Math.max(this.fuel, 400);
    this.time.delayedCall(2100, () => { if (!this.isOver) this.spawn(); });
  }

  private stopThrust(): void {
    this.flame.setVisible(false);
    this.exhaust.emitting = false;
    this.dust.emitting = false;
    if (this.thrustSnd?.isPlaying) this.thrustSnd.stop();
  }

  // ---------- loop ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.drawGauges();
    if (!this.flying) return;
    const c = this.controls;
    const rot = (c.left || this.touchL ? -1 : 0) + (c.right || this.touchR ? 1 : 0);
    this.ang = Phaser.Math.Clamp(this.ang + rot * 140 * dt, -90, 90);
    const thrust = (c.up || c.a) && this.fuel > 0;

    const rad = Phaser.Math.DegToRad(this.ang);
    if (thrust) {
      this.vx += Math.sin(rad) * 150 * dt;
      this.vy -= Math.cos(rad) * 150 * dt;
      this.fuel = Math.max(0, this.fuel - 65 * dt);
      if (this.fuel === 0) this.banner(t('noFuel'), '#ec3013');
    }
    this.vy += this.gravity * dt;
    this.vx += this.wind * dt;
    const L = this.lander;
    L.x += this.vx * dt; L.y += this.vy * dt;
    if (L.x < 30 || L.x > W - 30) { L.x = Phaser.Math.Clamp(L.x, 30, W - 30); this.vx *= -0.4; }
    if (L.y < 90) { L.y = 90; this.vy = Math.max(0, this.vy); }
    L.setAngle(this.ang);

    // exhaust visuals + looped engine sound
    const nx = L.x - Math.sin(rad) * 26 * LS, ny = L.y + Math.cos(rad) * 26 * LS;
    this.flame.setVisible(thrust).setPosition(nx, ny).setAngle(this.ang).setScale(1.6, 1.2 + Math.random() * 0.9);
    this.exhaust.setPosition(nx, ny);
    this.exhaust.emitting = thrust;
    if (thrust && this.thrustSnd && !this.thrustSnd.isPlaying) this.thrustSnd.play();
    if (!thrust && this.thrustSnd?.isPlaying) this.thrustSnd.stop();
    const alt = this.groundAt(L.x) - (L.y + FOOT_Y);
    this.dust.setPosition(L.x, this.groundAt(L.x));
    this.dust.emitting = thrust && alt < 120;

    // low-fuel warning
    this.warnCd -= dt;
    if (this.fuel > 0 && this.fuel < 150 && this.warnCd <= 0) { this.warnCd = 1; this.sfx('warn', { volume: 0.25 }); popup(this, L.x, L.y - 60, t('lowFuel'), '#ec3013', 18); }

    // collision: both feet + body against the terrain polyline
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const probe = (ox: number, oy: number) => {
      const px = L.x + ox * cos - oy * sin, py = L.y + ox * sin + oy * cos;
      return py >= this.groundAt(px);
    };
    const feet = probe(-FOOT_X, FOOT_Y) || probe(FOOT_X, FOOT_Y);
    const body = probe(-20 * LS, 0) || probe(20 * LS, 0) || probe(0, -30 * LS) || probe(0, 14 * LS);
    if (body) this.crash('');
    else if (feet) this.touchdown();
  }
}
