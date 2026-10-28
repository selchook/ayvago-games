import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng, ensurePixel } from '@core';

/** Cyan, magenta, yellow, purple: the four gate colours. */
export const PALETTE = [0x3ee6ff, 0xff4fa3, 0xffd23f, 0x8b5cff];

const GRAVITY = 1750;
const HOP_V = -650;
const BALL_R = 20;
const RING_T = 28;
const BAR_T = 28;
const SEG_W = 180;          // bar segment width (4 segments = one 720px period)
const LEVEL_EVERY = 5;      // gates per level
const MAX_LIVES = 3;

interface Ring {
  g: Phaser.GameObjects.Graphics;
  r: number;
  cols: number[];
  speed: number;            // degrees per second (signed)
  wobble: number;           // 0 = steady, >0 = speed pulses
  mirrorOf?: Ring;          // inner ring of a double gate: mirror image of the outer ring
}
interface Bar {
  g: Phaser.GameObjects.Graphics;
  y: number;
  cols: number[];
  phase: number;            // 0..720
  speed: number;            // px per second (signed)
}
interface Gate {
  y: number;
  top: number;
  bottom: number;
  rings: Ring[];
  bars: Bar[];
  star?: Phaser.GameObjects.Image;
  sw?: Phaser.GameObjects.Graphics;
  passed: boolean;
}


/** Screen flash that never fully covers the view (the core camera flash starts opaque). */
function softFlash(scene: Phaser.Scene, color: number, ms = 120): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, 0.4).setOrigin(0).setScrollFactor(0).setDepth(8000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms * 2, onComplete: () => r.destroy() });
}

export class PlayScene extends ArcadeScene {
  private ball!: Phaser.GameObjects.Arc;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bg!: Phaser.GameObjects.TileSprite;
  private hint!: Phaser.GameObjects.Text;
  private starText!: Phaser.GameObjects.Text;
  private gates: Gate[] = [];
  private colorIdx = 0;
  private vy = 0;
  private started = false;
  private dead = false;
  private lastY = 0;
  private made = 0;
  private passed = 0;
  private level = 1;
  private stars = 0;
  private clock = 0;
  private lives = MAX_LIVES;
  private invuln = 0;
  private restY = 0;          // where the ball waits before the first hop (start / respawn point)
  private hearts: Phaser.GameObjects.Image[] = [];

  createGame(): void {
    const { width, height } = this.scale;
    this.gates = []; this.vy = 0; this.started = false; this.dead = false;
    this.made = 0; this.passed = 0; this.level = 1; this.stars = 0; this.clock = 0;
    this.lives = MAX_LIVES; this.invuln = 0; this.hearts = [];
    this.colorIdx = rng.int(0, 3);
    this.cameras.main.setScroll(0, 0);

    if (!this.textures.exists('cg-dots')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 0; i < 60; i++) {
        g.fillStyle(rng.pick(PALETTE), rng.int(15, 45) / 100);
        const s = rng.chance(0.25) ? 4 : 2;
        g.fillRect(rng.int(0, 254), rng.int(0, 254), s, s);
      }
      g.generateTexture('cg-dots', 256, 256);
      g.destroy();
    }
    if (!this.textures.exists('cg-heart')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (const [key, fill] of [['cg-heart', 0xec3013], ['cg-heart-empty', 0x3a3550]] as const) {
        g.clear();
        g.fillStyle(0x000000).fillCircle(11, 13, 11).fillCircle(29, 13, 11).fillTriangle(1, 18, 39, 18, 20, 38);
        g.fillStyle(fill).fillCircle(11, 13, 8).fillCircle(29, 13, 8).fillTriangle(4, 16, 36, 16, 20, 34);
        g.generateTexture(key, 40, 40);
      }
      g.destroy();
    }
    for (let i = 0; i < MAX_LIVES; i++) {
      this.hearts.push(this.add.image(width - 150 - (MAX_LIVES - 1 - i) * 42, 88, 'cg-heart').setScale(0.9).setScrollFactor(0).setDepth(9000));
    }
    this.bg = this.add.tileSprite(0, 0, width, height, 'cg-dots').setOrigin(0).setScrollFactor(0).setDepth(-10);

    const startY = height * 0.8;
    this.restY = startY;
    // starting pad
    const pad = this.add.graphics({ x: width / 2, y: startY + BALL_R + 10 });
    pad.fillStyle(0xffffff, 0.15).fillRoundedRect(-70, 0, 140, 14, 7);
    this.ball = this.add.circle(width / 2, startY, BALL_R, PALETTE[this.colorIdx]).setStrokeStyle(4, 0xffffff, 0.9).setDepth(20);
    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      follow: this.ball, lifespan: 320, frequency: 22, speed: { min: 0, max: 20 },
      scale: { start: 3.5, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: PALETTE[this.colorIdx],
    }).setDepth(19);

    this.hint = txt(this, width / 2, height * 0.9, t('tapHop'), { size: 34, color: '#f3f2f2' }).setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

    this.add.image(44, 92, 'cg-star').setScale(0.3).setScrollFactor(0).setDepth(9000);
    this.starText = txt(this, 72, 92, '0', { title: true, size: 22, color: '#ffd23f' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(9000);

    this.lastY = startY - 60;
    this.fillGates();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;     // pause button
      this.hop();
    });
    for (const k of ['SPACE', 'UP', 'W', 'ENTER', 'Z']) {
      this.input.keyboard?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.hop(); });
    }
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.starText.setText(String(this.stars));
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? 'cg-heart' : 'cg-heart-empty'));
  }

  private hop(): void {
    if (this.dead || this.isOver) return;
    if (!this.started) {
      this.started = true;
      this.tweens.killTweensOf(this.hint);
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 250 });
      if (this.lives < MAX_LIVES) this.invuln = 1.2;     // grace period after a respawn
    }
    this.vy = HOP_V;
    this.sfx('hop', { volume: 0.25 });
    this.tweens.add({ targets: this.ball, scaleX: 0.8, scaleY: 1.2, duration: 70, yoyo: true });
  }

  // ---------- gate generation ----------
  private fillGates(): void {
    while (this.lastY > this.cameras.main.scrollY - 900) this.makeGate();
  }

  private makeGate(): void {
    const { width } = this.scale;
    const lvl = 1 + Math.floor(this.made / LEVEL_EVERY);
    const kinds: string[] = ['ring'];
    if (lvl >= 2) kinds.push('bar', 'ring');
    if (lvl >= 3) kinds.push('double');
    if (lvl >= 4) kinds.push('bars', 'small');
    if (lvl >= 6) kinds.push('double', 'small');
    const kind = this.made === 0 ? 'ring' : rng.pick(kinds);
    const dir = rng.chance(0.5) ? 1 : -1;
    const rot = Math.min(220, 62 + lvl * 13) * dir;
    const slide = Math.min(430, 130 + lvl * 26) * dir;
    const wobble = lvl >= 5 && rng.chance(0.4) ? 0.7 : 0;
    // vertical extent of this gate around its centre
    const ext: Record<string, [number, number]> = {
      ring: [190, 190], small: [140, 140], double: [230, 230], bar: [16, 150], bars: [90, 90],
    };
    const [up, down] = ext[kind];
    const gap = this.made === 0 ? 250 : Math.max(250, 340 - lvl * 9);
    const y = this.lastY - gap - down;

    const gate: Gate = { y, top: y - up, bottom: y + down, rings: [], bars: [], passed: false };
    let starY = y;
    if (kind === 'ring' || kind === 'small') {
      const r = kind === 'small' ? 125 : 175;
      gate.rings.push(this.makeRing(width / 2, y, r, kind === 'small' ? rot * 1.35 : rot, wobble));
    } else if (kind === 'double') {
      // the inner ring mirrors the outer one (gear look) so the colours meet at the top and bottom
      const outer = this.makeRing(width / 2, y, 215, rot, wobble);
      gate.rings.push(outer, this.makeRing(width / 2, y, 158, 0, 0, outer));
    } else if (kind === 'bar') {
      gate.bars.push(this.makeBar(y, slide));
      starY = y + 115;
    } else {
      gate.bars.push(this.makeBar(y - 75, slide));
      gate.bars.push(this.makeBar(y + 75, -slide * 0.85));
    }
    gate.star = this.add.image(width / 2, starY, 'cg-star').setScale(0.42).setDepth(10);
    this.tweens.add({ targets: gate.star, scale: 0.5, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // colour switcher halfway between the previous gate and this one
    if (this.made > 0) {
      const sw = this.add.graphics({ x: width / 2, y: this.lastY - gap / 2 }).setDepth(10);
      PALETTE.forEach((c, i) => {
        sw.fillStyle(c, 1).slice(0, 0, 26, Phaser.Math.DegToRad(i * 90), Phaser.Math.DegToRad((i + 1) * 90)).fillPath();
      });
      sw.lineStyle(3, 0xffffff, 0.8).strokeCircle(0, 0, 26);
      this.tweens.add({ targets: sw, angle: 360, duration: 1800, repeat: -1 });
      gate.sw = sw;
    }

    // spawn tween: gates fade in
    for (const o of [...gate.rings.map((r) => r.g), ...gate.bars.map((b) => b.g)]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 400 });
    }

    this.gates.push(gate);
    this.lastY = gate.top;
    this.made++;
  }

  private makeRing(x: number, y: number, r: number, speed: number, wobble: number, mirrorOf?: Ring): Ring {
    const cols = mirrorOf ? mirrorOf.cols : rng.shuffle([...PALETTE]);
    const g = this.add.graphics({ x, y }).setDepth(5);
    cols.forEach((c, i) => {
      const a0 = mirrorOf ? 180 - (i + 1) * 90 : i * 90;
      g.lineStyle(RING_T, c, 1).beginPath();
      g.arc(0, 0, r, Phaser.Math.DegToRad(a0 + 1.5), Phaser.Math.DegToRad(a0 + 90 - 1.5));
      g.strokePath();
    });
    g.angle = mirrorOf ? -mirrorOf.g.angle : rng.int(0, 3) * 90 + 45;
    return { g, r, cols, speed, wobble, mirrorOf };
  }

  /** Colour of a ring at world angle `ang` (degrees, y down). */
  private ringColour(r: Ring, ang: number): number {
    const src = r.mirrorOf ?? r;
    const a = r.mirrorOf ? 180 - ang : ang;
    const local = (((a - src.g.angle) % 360) + 360) % 360;
    return src.cols[Math.floor(local / 90) % 4];
  }

  private makeBar(y: number, speed: number): Bar {
    const cols = rng.shuffle([...PALETTE]);
    const g = this.add.graphics({ x: 0, y }).setDepth(5);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(cols[i % 4], 1).fillRoundedRect(i * SEG_W + 3, -BAR_T / 2, SEG_W - 6, BAR_T, 8);
    }
    const phase = rng.int(0, 719);
    g.x = -phase;
    return { g, y, cols, phase, speed };
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const cam = this.cameras.main;
    this.clock += dt;

    for (const gate of this.gates) {
      for (const r of gate.rings) {
        if (r.mirrorOf) { r.g.angle = -r.mirrorOf.g.angle; continue; }
        const k = r.wobble ? 1 + r.wobble * Math.sin(this.clock * 2.4) : 1;
        r.g.angle += r.speed * k * dt;
      }
      for (const b of gate.bars) {
        b.phase = (((b.phase + b.speed * dt) % 720) + 720) % 720;
        b.g.x = -b.phase;
      }
    }
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.ball.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 12) % 2 ? 0.35 : 1) : 1);

    if (this.started) {
      this.vy = Math.min(this.vy + GRAVITY * dt, 1100);
      this.ball.y += this.vy * dt;
    } else {
      this.ball.y = this.restY + Math.sin(this.clock * 4) * 6;
    }

    // camera only climbs
    const target = this.ball.y - height * 0.56;
    if (target < cam.scrollY) cam.scrollY += (target - cam.scrollY) * Math.min(1, dt * 10);
    this.bg.tilePositionY = cam.scrollY * 0.35;

    if (this.started && this.ball.y - cam.scrollY > height + BALL_R) {
      this.die(t('fell'));
      return;
    }

    const bx = width / 2, by = this.ball.y;
    const myCol = PALETTE[this.colorIdx];
    for (const gate of this.gates) {
      if (this.invuln > 0 || by - gate.bottom > 120 || gate.top - by > 120) {
        // far away; only check passing
      } else {
        for (const r of gate.rings) {
          const dy = by - gate.y;
          if (Math.abs(Math.abs(dy) - r.r) < RING_T / 2 + BALL_R - 5) {
            if (this.ringColour(r, dy > 0 ? 90 : 270) !== myCol) { this.die(t('wrong')); return; }
          }
        }
        for (const b of gate.bars) {
          if (Math.abs(by - b.y) < BAR_T / 2 + BALL_R - 5) {
            const local = (bx + b.phase) % 720;
            if (b.cols[Math.floor(local / SEG_W) % 4] !== myCol) { this.die(t('wrong')); return; }
          }
        }
      }
      if (gate.star && Math.abs(by - gate.star.y) < 42) this.collectStar(gate);
      if (gate.sw && Math.abs(by - gate.sw.y) < 40) this.switchColour(gate);
      if (!gate.passed && by < gate.top - BALL_R) this.passGate(gate);
    }

    // recycle gates far below the screen and build new ones above
    const bottom = cam.scrollY + height + 400;
    this.gates = this.gates.filter((g) => {
      if (g.top < bottom) return true;
      for (const r of g.rings) r.g.destroy();
      for (const b of g.bars) b.g.destroy();
      g.star?.destroy(); g.sw?.destroy();
      return false;
    });
    this.fillGates();
  }

  private collectStar(gate: Gate): void {
    const s = gate.star!;
    gate.star = undefined;
    this.stars++;
    this.addScore(10 * this.level, s.x + 70, s.y);
    this.sfx('star', { volume: 0.45 });
    burst(this, s.x, s.y, [0xffd23f, 0xffffff], 18, 300);
    this.tweens.killTweensOf(s);
    this.tweens.add({ targets: s, scale: 0.9, alpha: 0, angle: 180, duration: 300, onComplete: () => s.destroy() });
    this.updateHud();
    this.tweens.add({ targets: this.starText, scale: 1.4, duration: 90, yoyo: true });
  }

  private switchColour(gate: Gate): void {
    const sw = gate.sw!;
    gate.sw = undefined;
    let n = rng.int(0, 3);
    if (n === this.colorIdx) n = (n + rng.int(1, 3)) % 4;
    this.colorIdx = n;
    const c = PALETTE[n];
    this.ball.setFillStyle(c);
    this.trail.particleTint = c;
    this.sfx('switch', { volume: 0.35 });
    burst(this, sw.x, sw.y, PALETTE, 24, 280);
    this.tweens.add({ targets: this.ball, scale: 1.5, duration: 90, yoyo: true });
    this.tweens.killTweensOf(sw);
    this.tweens.add({ targets: sw, scale: 2, alpha: 0, duration: 250, onComplete: () => sw.destroy() });
  }

  private passGate(gate: Gate): void {
    gate.passed = true;
    this.passed++;
    for (const o of [...gate.rings.map((r) => r.g), ...gate.bars.map((b) => b.g)]) {
      this.tweens.add({ targets: o, alpha: 0.35, duration: 400 });
    }
    if (this.passed % LEVEL_EVERY === 0) {
      this.level++;
      const { width, height } = this.scale;
      this.addScore(25 * this.level);
      this.sfx('level', { volume: 0.5 });
      softFlash(this, 0xffffff, 90);
      const banner = txt(this, width / 2, height * 0.3, `${t('level')} ${this.level}`, { title: true, size: 48, color: '#ffd23f' })
        .setScrollFactor(0).setDepth(60).setScale(0.3);
      this.tweens.add({ targets: banner, scale: 1, duration: 350, ease: 'Back.easeOut' });
      this.tweens.add({ targets: banner, alpha: 0, delay: 900, duration: 400, onComplete: () => banner.destroy() });
      popup(this, width / 2, this.ball.y + 60, `+${25 * this.level}`, '#5dff7a');
      this.updateHud();
    }
  }

  private die(reason: string): void {
    if (this.dead) return;
    this.dead = true;
    const { x, y } = this.ball;
    this.ball.setVisible(false);
    this.trail.stop();
    burst(this, x, y, PALETTE, 50, 520);
    burst(this, x, y, PALETTE[this.colorIdx], 30, 300);
    this.sfx('shatter', { volume: 0.5 });
    this.sfx('die', { volume: 0.45 });
    shake(this, 0.025, 320);
    softFlash(this, 0xec3013, 160);
    this.lives--;
    this.updateHud();
    const heart = this.hearts[Math.max(0, this.lives)];
    this.tweens.add({ targets: heart, scale: 1.5, duration: 120, yoyo: true });
    if (this.lives <= 0) {
      this.endGame({ title: reason, delay: 1000 });
      return;
    }
    popup(this, x, y - 40, reason, '#ec3013', 24);
    this.time.delayedCall(900, () => this.respawn());
  }

  /** Put the ball back below the first gate it hasn't cleared yet; it waits for a tap. */
  private respawn(): void {
    if (this.isOver) return;
    const { width, height } = this.scale;
    const gate = this.gates.find((g) => !g.passed);
    this.restY = gate ? gate.bottom + 70 : this.ball.y;
    this.ball.setPosition(width / 2, this.restY).setVisible(true).setScale(0.2);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.vy = 0;
    this.started = false;
    this.dead = false;
    this.trail.start();
    const cam = this.cameras.main;
    this.tweens.add({ targets: cam, scrollY: this.restY - height * 0.75, duration: 300, ease: 'Sine.easeOut' });
    this.hint.setAlpha(1);
    this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    this.sfx('switch', { volume: 0.3 });
  }
}
