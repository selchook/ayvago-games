import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';
import { FRUITS, ICE, STAR, makeFruitTextures, type FruitKind } from './art';

const W = 720;
const H = 1280;
const G = 1500;                 // gravity, px/s²
const TRAIL_MS = 140;           // how long trail points live
const MIN_SPEED = 260;          // px/s the blade must move to cut
const MAX_MISSES = 3;
const KB_SLASH = 0.7;           // seconds one Space press keeps the keyboard blade cutting

interface Item {
  img: Phaser.GameObjects.Image;
  kind: FruitKind | null;       // null = bomb
  vx: number;
  vy: number;
  spin: number;
  r: number;
  glow?: Phaser.GameObjects.Image;
  fuse?: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface Piece { img: Phaser.GameObjects.Image; vx: number; vy: number; spin: number }
interface Pt { x: number; y: number; t: number }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private items: Item[] = [];
  private pieces: Piece[] = [];
  private trail: Pt[] = [];
  private trailG!: Phaser.GameObjects.Graphics;
  private blade!: Phaser.GameObjects.Image;
  private bx = W / 2;
  private by = H * 0.6;
  private kbMode = false;
  private pointerDown = false;
  private kbSlash = false;
  private kbHeld = 0;
  private strokeHits = 0;
  private strokeX = 0;
  private strokeY = 0;
  private lastHit = 0;
  private misses = 0;
  private missMarks: Phaser.GameObjects.Image[] = [];
  private wave = 0;
  private waveTimer = 1.2;
  private sinceWave = 0;
  private waveDur = 2;
  private pending = 0;
  private freeze = 0;
  private freezeTint!: Phaser.GameObjects.Rectangle;
  private dead = false;
  private sliced = 0;
  private bestCombo = 0;

  createGame(): void {
    makeFruitTextures(this);
    this.items = []; this.pieces = []; this.trail = [];
    this.bx = W / 2; this.by = H * 0.6; this.kbMode = false; this.pointerDown = false; this.kbSlash = false; this.kbHeld = 0;
    this.strokeHits = 0; this.lastHit = 0; this.misses = 0; this.wave = 0; this.waveTimer = 1.2; this.sinceWave = 0;
    this.waveDur = 2; this.pending = 0; this.freeze = 0; this.dead = false; this.sliced = 0; this.bestCombo = 0;

    this.drawBackground();
    this.freezeTint = this.add.rectangle(0, 0, W, H, 0x5ee8ff, 0).setOrigin(0).setDepth(40);
    this.trailG = this.add.graphics().setDepth(60);
    this.blade = this.add.image(this.bx, this.by, 'blade').setDepth(61).setVisible(false);

    this.missMarks = [];
    for (let i = 0; i < MAX_MISSES; i++) {
      const m = this.add.image(452 + i * 56, 46, 'xmark').setScale(0.8).setTint(0x555566).setDepth(9001);
      this.missMarks.push(m);
    }

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.dead) return;
      this.pointerDown = true;
      this.kbMode = false;
      this.blade.setVisible(false);
      this.endStroke();
      this.trail = [{ x: p.x, y: p.y, t: this.time.now }];
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.pointerDown || !p.isDown || this.dead) return;
      this.addPoint(p.x, p.y);
    });
    const up = () => { this.pointerDown = false; this.endStroke(); };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);

    const hint = txt(this, W / 2, H * 0.42, t('startHint'), { size: 32, color: '#ffffff', wrap: 620 }).setDepth(80);
    this.tweens.add({ targets: hint, alpha: 0, delay: 3200, duration: 600, onComplete: () => hint.destroy() });
    this.hud.setCenter('');
    this.hud.setRight('');
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    const plank = 120;
    for (let i = 0; i * plank < W; i++) {
      g.fillStyle(i % 2 ? 0x4a2c17 : 0x412612).fillRect(i * plank, 0, plank, H);
      g.fillStyle(0x2a170b).fillRect(i * plank, 0, 5, H);
      g.fillStyle(0x5a3820, 0.5).fillRect(i * plank + 5, 0, 3, H);
      // grain and knots
      for (let k = 0; k < 7; k++) {
        const y = ((i * 397 + k * 211) % H);
        g.fillStyle(0x2f1a0c, 0.45).fillRect(i * plank + 20 + ((k * 37) % 70), y, 4, 60 + (k * 23) % 90);
      }
      g.fillStyle(0x2a170b, 0.7).fillEllipse(i * plank + 60, (i * 523) % H + 80, 22, 34);
    }
    // vignette
    g.fillStyle(0x000000, 0.35).fillRect(0, 0, W, 90);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0).fillRect(0, 0, W, 260);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.6, 0.6).fillRect(0, H - 300, W, 300);
  }

  // ---------------------------------------------------------------- spawning

  private launchWave(): void {
    this.wave++;
    this.sinceWave = 0;
    const w = this.wave;
    const frenzy = w % 6 === 0;
    let n = frenzy ? Math.min(12, 5 + Math.floor(w / 3)) : Math.min(8, 1 + Math.floor(w * 0.55));
    const bombP = frenzy || w < 3 ? 0 : Math.min(0.3, 0.06 + w * 0.018);
    const stream = !frenzy && w > 2 && rng.chance(0.4);
    const kinds: Array<FruitKind | null> = [];
    for (let i = 0; i < n; i++) kinds.push(rng.chance(bombP) ? null : rng.pick(FRUITS));
    if (!kinds.some((k) => k !== null)) kinds[0] = rng.pick(FRUITS);
    if (w >= 4 && rng.chance(0.1)) kinds.push(STAR);
    if (w >= 5 && this.freeze <= 0 && rng.chance(0.12)) kinds.push(ICE);
    n = kinds.length;
    if (frenzy) this.banner(t('frenzy'), '#ff4fa3');
    const step = frenzy ? 0.12 : stream ? Math.max(0.16, 0.34 - w * 0.008) : 0.06;
    const fromLeft = rng.chance(0.5);
    kinds.forEach((k, i) => {
      this.pending++;
      this.time.delayedCall(i * step * 1000 + rng.int(0, 60), () => {
        this.pending--;
        if (this.dead) return;
        const x0 = stream ? 110 + (((fromLeft ? i : n - 1 - i) * 90) % 500) : rng.int(110, 610);
        this.spawn(k, x0, frenzy);
      });
    });
    this.waveDur = Math.max(1.0, 2.8 - w * 0.07) + n * step;
    this.waveTimer = Math.max(0.3, 1.0 - w * 0.03);
  }

  private spawn(kind: FruitKind | null, x0: number, frenzy: boolean): void {
    const r = kind ? kind.r : 46;
    const y0 = H + r + 10;
    const apex = rng.int(frenzy ? 240 : 200, frenzy ? 480 : 560);
    const vy = -Math.sqrt(2 * G * (y0 - apex));
    const T = (2 * -vy) / G;
    const target = Phaser.Math.Clamp(x0 + rng.int(-260, 260), 120, 600);
    const vx = (target - x0) / T;
    const img = this.add.image(x0, y0, kind ? `fruit-${kind.key}` : 'bomb').setDepth(20);
    const it: Item = { img, kind, vx, vy, spin: rng.int(-200, 200), r };
    if (!kind) {
      img.setDisplaySize(104, 104).setTint(0x3a3a46);
      it.glow = this.add.image(x0, y0, 'glow').setDepth(19).setTint(0xff2a2a).setScale(0.32).setAlpha(0.9).setBlendMode('ADD');
      this.tweens.add({ targets: it.glow, scale: 0.42, alpha: 0.35, duration: 220, yoyo: true, repeat: -1 });
      it.fuse = this.add.particles(0, 0, 'spark', {
        speed: { min: 40, max: 140 }, angle: { min: 200, max: 340 }, scale: { start: 1.1, end: 0 },
        lifespan: 260, frequency: 30, tint: [0xffd23f, 0xff7a1a, 0xffffff], blendMode: 'ADD',
      }).setDepth(21);
      this.sfxAt('fuse', x0, { volume: 0.35 });
    } else {
      this.sfxAt('toss', x0, { volume: 0.25 });
      if (kind === STAR || kind === ICE) {
        it.glow = this.add.image(x0, y0, 'glow').setDepth(19).setTint(kind.skin).setScale(0.35).setAlpha(0.6).setBlendMode('ADD');
      }
    }
    this.items.push(it);
  }

  // ---------------------------------------------------------------- blade

  private addPoint(x: number, y: number): void {
    const now = this.time.now;
    const prev = this.trail[this.trail.length - 1];
    this.trail.push({ x, y, t: now });
    if (!prev) return;
    const len = Math.hypot(x - prev.x, y - prev.y);
    const dt = Math.max(8, now - prev.t) / 1000;
    if (len < 2 || len / dt < MIN_SPEED) return;
    this.cutAlong(prev.x, prev.y, x, y);
  }

  private cutAlong(x1: number, y1: number, x2: number, y2: number): void {
    const pad = this.kbMode ? 34 : 8;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    for (const it of [...this.items]) {
      if (!it.img.active) continue;
      const d = distToSegment(it.img.x, it.img.y, x1, y1, x2, y2);
      if (d > it.r * 0.9 + pad) continue;
      if (!it.kind) { this.hitBomb(it); return; }
      this.slice(it, ang);
    }
  }

  private endStroke(): void {
    if (this.strokeHits >= 3) {
      const n = this.strokeHits;
      const bonus = n * 10 * (n - 2);
      this.addScore(bonus);
      this.bestCombo = Math.max(this.bestCombo, n);
      const x = Phaser.Math.Clamp(this.strokeX, 160, W - 160), y = Phaser.Math.Clamp(this.strokeY - 60, 200, H - 200);
      const c = txt(this, x, y, `${t('combo')} x${n}\n+${bonus}`, { title: true, size: 30, color: '#ffd23f', strokeThickness: 8 }).setDepth(90).setScale(0.3);
      this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: c, y: y - 80, alpha: 0, delay: 650, duration: 450, onComplete: () => c.destroy() });
      this.sfx('combo', { volume: 0.7 });
      shake(this, 0.004 * Math.min(4, n - 1), 160);
    }
    this.strokeHits = 0;
  }

  // ---------------------------------------------------------------- hits

  private slice(it: Item, ang: number): void {
    const k = it.kind!;
    const { x, y } = it.img;
    this.removeItem(it);
    this.sliced++;
    // two halves fly apart across the cut line
    const nx = Math.sin(ang), ny = -Math.cos(ang);
    for (const s of [1, -1]) {
      const img = this.add.image(x, y, `half-${k.key}`).setOrigin(0.5, 1).setDepth(22).setRotation(ang + (s < 0 ? Math.PI : 0));
      this.pieces.push({ img, vx: it.vx * 0.6 + nx * s * 170, vy: Math.min(it.vy, 0) * 0.4 + ny * s * 170 - 120, spin: s * rng.int(120, 260) });
    }
    // slash streak + juice
    const streak = this.add.rectangle(x, y, k.r * 3, 7, 0xffffff).setRotation(ang).setDepth(62).setScale(0.2, 1);
    this.tweens.add({ targets: streak, scaleX: 1, alpha: 0, duration: 220, onComplete: () => streak.destroy() });
    burst(this, x, y, [k.juice, k.flesh, 0xffffff], 18, 300);
    const splat = this.add.image(x, y, 'splat').setTint(k.juice).setScale(0.22 + k.r / 400).setAlpha(0.75).setRotation(rng.int(0, 6)).setDepth(2);
    this.tweens.add({ targets: splat, alpha: 0, delay: 2200, duration: 1600, onComplete: () => splat.destroy() });

    const crit = k !== ICE && rng.chance(0.1);
    let pts = k.pts;
    if (crit) {
      pts += 40;
      const c = txt(this, x, y - 70, t('critical'), { title: true, size: 26, color: '#ff4fa3', strokeThickness: 8 }).setDepth(90);
      this.tweens.add({ targets: c, y: y - 140, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
      burst(this, x, y, [0xff4fa3, 0xffd23f, 0xffffff], 28, 480);
      flash(this, 0xffffff, 80, 0.18);
      this.sfxAt('crit', x, { volume: 0.6 });
    }
    this.addScore(pts, x, y - 30);
    this.sfxAt(rng.pick(['slice1', 'slice2', 'slice3']), x, { volume: 0.55 });
    this.sfxAt('squish', x, { volume: 0.5 });

    if (k === ICE) {
      this.freeze = 4.5;
      this.freezeTint.setFillStyle(0x5ee8ff, 0.18);
      this.banner(t('freeze'), '#5ee8ff');
      this.sfx('freeze', { volume: 0.7 });
    }
    if (k === STAR) {
      burst(this, x, y, [0xffd23f, 0xffffff], 36, 520);
      this.sfx('star', { volume: 0.7 });
    }

    this.strokeHits++;
    this.strokeX = x; this.strokeY = y;
    this.lastHit = this.time.now;
  }

  private hitBomb(it: Item): void {
    const { x, y } = it.img;
    this.dead = true;
    this.removeItem(it);
    this.trail = [];
    this.trailG.clear();
    const scorch = this.add.image(x, y, 'scorch').setDepth(70).setScale(0.2).setTint(0xffd23f).setBlendMode('ADD');
    this.tweens.add({ targets: scorch, scale: 2.4, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => scorch.destroy() });
    burst(this, x, y, [0xffd23f, 0xff7a1a, 0xffffff, 0x333333], 60, 700);
    flash(this, 0xffffff, 400, 0.85);
    shake(this, 0.03, 600);
    this.sfxAt('boom', x, { volume: 0.9 });
    // everything else on screen pops harmlessly
    for (const o of [...this.items]) {
      burst(this, o.img.x, o.img.y, o.kind ? o.kind.juice : 0x888888, 10, 200);
      this.removeItem(o);
    }
    const b = txt(this, W / 2, H * 0.42, t('boom'), { title: true, size: 56, color: '#ec3013', strokeThickness: 12 }).setDepth(95).setScale(0.2);
    this.tweens.add({ targets: b, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.endGame({ title: t('boom'), delay: 1500 });
  }

  private miss(fx: number): void {
    this.misses++;
    const x = Phaser.Math.Clamp(fx, 60, W - 60);
    const m = this.add.image(x, H - 70, 'xmark').setTint(0xff3b3b).setDepth(80).setScale(0.3);
    this.tweens.add({ targets: m, scale: 1.3, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: m, alpha: 0, y: H - 150, delay: 600, duration: 500, onComplete: () => m.destroy() });
    const mark = this.missMarks[this.misses - 1];
    if (mark) {
      mark.setTint(0xff3b3b);
      this.tweens.add({ targets: mark, scale: 1.3, duration: 140, yoyo: true });
    }
    this.sfxAt('miss', x, { volume: 0.6 });
    shake(this, 0.006, 140);
    if (this.misses >= MAX_MISSES && !this.dead) {
      this.dead = true;
      this.endGame({ title: t('tooManyMiss'), delay: 900 });
    }
  }

  private removeItem(it: Item): void {
    it.img.destroy();
    it.glow?.destroy();
    if (it.fuse) { it.fuse.stop(); const f = it.fuse; this.time.delayedCall(300, () => f.destroy()); }
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  }

  private banner(s: string, color: string): void {
    const b = txt(this, W / 2, H * 0.3, s, { title: true, size: 38, color, strokeThickness: 10, wrap: 660 }).setDepth(90).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1100, duration: 400, onComplete: () => b.destroy() });
  }

  // ---------------------------------------------------------------- loop

  updateGame(_time: number, delta: number): void {
    const real = delta / 1000;
    const ramp = 1 + Math.min(0.4, this.wave * 0.018);
    if (this.freeze > 0) {
      this.freeze -= real;
      if (this.freeze <= 0) this.tweens.add({ targets: this.freezeTint, fillAlpha: 0, duration: 400 });
    }
    const dt = real * ramp * (this.freeze > 0 ? 0.45 : 1);

    // keyboard blade
    const c = this.controls;
    if (c.axisX || c.axisY || c.a) {
      if (!this.kbMode) { this.kbMode = true; this.blade.setVisible(true); this.trail = []; }
    }
    if (this.kbMode && !this.dead) {
      const sp = 1300;
      this.bx = Phaser.Math.Clamp(this.bx + c.axisX * sp * real, 20, W - 20);
      this.by = Phaser.Math.Clamp(this.by + c.axisY * sp * real, 130, H - 20);
      this.blade.setPosition(this.bx, this.by);
      // A held Space slashes for a short burst (then it must be pressed again), so the blade
      // can cut fruit that flies into it as well as fruit it sweeps through.
      if (c.a && this.kbHeld < KB_SLASH) {
        if (!this.kbSlash) { this.kbSlash = true; this.endStroke(); this.trail = []; this.sfx('swish', { volume: 0.35 }); }
        this.kbHeld += real;
        const prev = this.trail[this.trail.length - 1];
        this.trail.push({ x: this.bx, y: this.by, t: this.time.now });
        if (prev) this.cutAlong(prev.x, prev.y, this.bx, this.by);
      } else if (this.kbSlash) { this.kbSlash = false; this.endStroke(); }
      if (!c.a) this.kbHeld = 0;
      this.blade.setScale(this.kbSlash ? 1.3 : 0.9).setAlpha(this.kbSlash ? 1 : 0.6);
    }

    // stroke combo window
    if (this.strokeHits > 0 && this.time.now - this.lastHit > 260) this.endStroke();

    // waves
    if (!this.dead) {
      this.sinceWave += dt;
      this.waveTimer -= dt;
      const alive = this.items.length + this.pending;
      if (this.waveTimer <= 0 && (alive === 0 || this.sinceWave > this.waveDur)) this.launchWave();
      if (this.waveTimer <= 0 && alive === 0 && this.sinceWave < this.waveDur) this.sinceWave = this.waveDur;
    }

    // items
    for (const it of [...this.items]) {
      it.vy += G * dt;
      it.img.x += it.vx * dt;
      it.img.y += it.vy * dt;
      it.img.angle += it.spin * dt;
      it.glow?.setPosition(it.img.x, it.img.y);
      if (it.fuse) {
        const a = it.img.rotation - 0.75;
        it.fuse.setPosition(it.img.x + Math.cos(a - Math.PI / 2) * 46, it.img.y + Math.sin(a - Math.PI / 2) * 46);
      }
      if (it.vy > 0 && it.img.y > H + it.r + 30) {
        const counts = it.kind && it.kind !== ICE && it.kind !== STAR;
        const x = it.img.x;
        this.removeItem(it);
        if (counts && !this.dead) this.miss(x);
      }
    }
    for (const p of [...this.pieces]) {
      p.vy += G * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.angle += p.spin * dt;
      if (p.img.y > H + 120) { p.img.destroy(); this.pieces.splice(this.pieces.indexOf(p), 1); }
    }

    this.drawTrail();
  }

  private drawTrail(): void {
    const now = this.time.now;
    while (this.trail.length && now - this.trail[0].t > TRAIL_MS) this.trail.shift();
    const g = this.trailG;
    g.clear();
    const n = this.trail.length;
    if (n < 2) return;
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const f = i / (n - 1);
      g.lineStyle(10 + 22 * f, 0x3ee6ff, 0.22 * f).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(4 + 10 * f, 0xbff8ff, 0.55 * f).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(2 + 4 * f, 0xffffff, f).lineBetween(a.x, a.y, b.x, b.y);
    }
    const tip = this.trail[n - 1];
    g.fillStyle(0xffffff, 0.9).fillCircle(tip.x, tip.y, 6);
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let k = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}
