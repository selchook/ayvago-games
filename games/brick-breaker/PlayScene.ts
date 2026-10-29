import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';
import { BRICK_COLORS, LEVELS } from './levels';

interface Brick { x: number; y: number; hp: number; color: string; steel: boolean; img: Phaser.GameObjects.Image; }
interface Ball { x: number; y: number; vx: number; vy: number; img: Phaser.GameObjects.Image; stuck: boolean; off: number; }
interface Drop { kind: Power; obj: Phaser.GameObjects.Container; }
type Power = 'wide' | 'multi' | 'slow' | 'life';

const FIELD_L = 16, FIELD_R = 704, FIELD_T = 100;
const COLS = 10, CELL_W = 68, CELL_H = 34, BRICK_W = 64, BRICK_H = 30, GRID_X = 360 - (COLS * CELL_W) / 2 + CELL_W / 2, GRID_Y = 190;
const PADDLE_Y = 1150, PADDLE_H = 34, BALL_R = 13;
const POWER_COLORS: Record<Power, number> = { wide: 0x2aa7e0, multi: 0xff4fa3, slow: 0x5dff7a, life: 0xec3013 };
const POWER_LETTER: Record<Power, string> = { wide: 'W', multi: 'M', slow: 'S', life: '+' };

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private paddle!: Phaser.GameObjects.Image;
  private bricks: Brick[] = [];
  private balls: Ball[] = [];
  private drops: Drop[] = [];
  private lives = 3;
  private level = 0;
  private speed = 600;
  private paddleW = 150;
  private wideT = 0;
  private slowT = 0;
  private combo = 0;
  private hits = 0;
  private targetX: number | null = null;
  private stuckT = 0;
  private busy = false;
  private hint!: Phaser.GameObjects.Text;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;

  createGame(): void {
    const { width, height } = this.scale;
    this.bricks = []; this.balls = []; this.drops = []; this.lifeIcons = [];
    this.lives = 3; this.level = 0; this.wideT = 0; this.slowT = 0; this.combo = 0; this.hits = 0;
    this.targetX = null; this.stuckT = 0; this.busy = false; this.paddleW = 150;

    // backdrop: soft grid + frame
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a2550, 0.6);
    for (let x = FIELD_L; x <= FIELD_R; x += 34) g.lineBetween(x, FIELD_T, x, height);
    for (let y = FIELD_T; y <= height; y += 34) g.lineBetween(FIELD_L, y, FIELD_R, y);
    g.lineStyle(6, 0x8b5cff, 1).strokeRect(FIELD_L - 3, FIELD_T - 3, FIELD_R - FIELD_L + 6, height - FIELD_T + 20);

    this.trail = this.add.particles(0, 0, 'spark', {
      lifespan: 260, scale: { start: 0.12, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0x3ee6ff, frequency: -1, blendMode: 'ADD',
    }).setDepth(4);

    this.paddle = this.add.image(width / 2, PADDLE_Y, 'paddle').setDepth(10);
    this.setPaddleWidth(150);
    this.hint = txt(this, width / 2, 980, t('launch'), { size: 30, color: '#3ee6ff' }).setDepth(20);
    this.tweens.add({ targets: this.hint, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });

    this.controls = new Controls(this);
    const follow = (p: Phaser.Input.Pointer) => { if (p.y > 130) this.targetX = p.x; };
    this.input.on('pointermove', follow);
    this.input.on('pointerdown', follow);
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.y > 130) this.launchBalls(); });
    // event-based too, so a quick tap of the key is never missed between frames
    for (const k of ['SPACE', 'UP', 'W', 'ENTER', 'Z']) this.input.keyboard?.on(`keydown-${k}`, () => this.launchBalls());

    this.updateHud();
    this.loadLevel();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level + 1}`);
    // lives as little paddles along the bottom edge
    while (this.lifeIcons.length < this.lives) {
      const i = this.lifeIcons.length;
      const img = this.add.image(FIELD_L + 50 + i * 76, 1232, 'paddle').setDisplaySize(64, 16).setDepth(10).setScale(0);
      this.tweens.add({ targets: img, scaleX: 64 / img.width, scaleY: 16 / img.height, duration: 250, ease: 'Back.easeOut' });
      this.lifeIcons.push(img);
    }
    while (this.lifeIcons.length > Math.max(0, this.lives)) {
      const img = this.lifeIcons.pop()!;
      this.tweens.add({ targets: img, alpha: 0, y: img.y + 30, duration: 300, onComplete: () => img.destroy() });
    }
  }

  private setPaddleWidth(w: number): void {
    this.paddleW = w;
    this.tweens.add({ targets: this.paddle, displayWidth: w, duration: 200, ease: 'Back.easeOut' });
    this.paddle.displayHeight = PADDLE_H;
  }

  private loadLevel(): void {
    for (const b of this.bricks) b.img.destroy();
    this.bricks = [];
    const map = LEVELS[this.level % LEVELS.length];
    this.speed = Math.min(900, 560 + this.level * 30);
    map.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '.') return;
        const x = GRID_X + c * CELL_W, y = GRID_Y + r * CELL_H;
        const steel = ch === '#';
        const color = steel ? 'k' : ch.toLowerCase();
        const hp = steel ? 99 : ch === 'K' ? 3 : ch === ch.toUpperCase() ? 2 : 1;
        const img = this.add.image(x, y - 400, steel ? 'steel' : 'brick-' + color).setDisplaySize(BRICK_W, BRICK_H).setDepth(5);
        const brick: Brick = { x, y, hp, color, steel, img };
        this.styleBrick(brick);
        this.tweens.add({ targets: img, y, duration: 450, delay: r * 60 + c * 15, ease: 'Bounce.easeOut' });
        this.bricks.push(brick);
      });
    });
    this.updateHud();
    for (const b of this.balls) b.img.destroy();
    this.balls = [];
    this.addBall(true);
    const banner = txt(this, 360, 760, `${t('level')} ${this.level + 1}`, { title: true, size: 48, color: '#ffd23f' }).setDepth(30).setScale(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 400, ease: 'Back.easeOut', hold: 700, yoyo: true, onComplete: () => banner.destroy() });
  }

  private styleBrick(b: Brick): void {
    if (b.steel) return;
    b.img.setTexture(b.hp >= 2 ? `brick-${b.color}2` : `brick-${b.color}`).setDisplaySize(BRICK_W, BRICK_H);
    b.img.setAlpha(b.color === 'k' && b.hp === 1 ? 0.65 : 1);
  }

  private addBall(stuck: boolean, from?: Ball, angle = 0): void {
    const img = this.add.image(this.paddle.x, PADDLE_Y - PADDLE_H / 2 - BALL_R, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(8);
    const ball: Ball = { x: img.x, y: img.y, vx: 0, vy: 0, img, stuck, off: rng.int(-30, 30) };
    if (from) {
      ball.x = from.x; ball.y = from.y;
      const a = Math.atan2(from.vy, from.vx) + angle;
      const s = this.curSpeed();
      ball.vx = Math.cos(a) * s; ball.vy = Math.sin(a) * s;
      if (Math.abs(ball.vy) < s * 0.35) ball.vy = -s * 0.5;
    }
    this.balls.push(ball);
    this.stuckT = 0;
  }

  private curSpeed(): number {
    return this.speed * (this.slowT > 0 ? 0.68 : 1);
  }

  private launchBalls(): void {
    if (this.isOver || this.busy) return;
    let any = false;
    for (const b of this.balls) if (b.stuck) {
      b.stuck = false; any = true;
      const a = Phaser.Math.DegToRad(-90 + b.off * 0.8);
      b.vx = Math.cos(a) * this.curSpeed(); b.vy = Math.sin(a) * this.curSpeed();
    }
    if (any) { this.sfxAt('launch', this.paddle.x, { volume: 0.45 }); this.hint.setVisible(false); }
  }

  private brickAt(x: number, y: number): Brick | undefined {
    for (const b of this.bricks) {
      if (Math.abs(x - b.x) < BRICK_W / 2 + BALL_R && Math.abs(y - b.y) < BRICK_H / 2 + BALL_R) return b;
    }
    return undefined;
  }

  private hitBrick(b: Brick): void {
    if (b.steel) {
      this.sfxAt('steel', b.x, { volume: 0.4 });
      this.tweens.add({ targets: b.img, scaleX: b.img.scaleX * 1.12, scaleY: b.img.scaleY * 1.12, duration: 60, yoyo: true });
      return;
    }
    b.hp--;
    const tint = BRICK_COLORS[b.color].tint;
    if (b.hp > 0) {
      this.styleBrick(b);
      b.img.setTintFill(0xffffff);
      this.time.delayedCall(50, () => b.img.clearTint());
      this.sfxAt('crack', b.x, { volume: 0.45 });
      burst(this, b.x, b.y, tint, 6, 160);
      this.addScore(5);
      return;
    }
    this.combo++;
    const pts = 10 * Math.min(8, this.combo) + this.level * 2;
    this.addScore(pts, b.x, b.y);
    if (this.combo >= 4 && this.combo % 2 === 0) popup(this, b.x, b.y - 40, `${t('combo')} x${Math.min(8, this.combo)}`, '#ff4fa3', 22);
    this.sfxAt('brick', b.x, { volume: 0.45, detune: Math.min(1200, this.combo * 80), exact: true });
    this.sfxAt('debris', b.x, { volume: 0.3 });
    burst(this, b.x, b.y, [tint, 0xffffff], 18, 300);
    shake(this, 0.004, 80);
    this.bricks.splice(this.bricks.indexOf(b), 1);
    const img = b.img;
    this.tweens.add({ targets: img, scaleX: 0, scaleY: 0, angle: rng.pick([-40, 40]), alpha: 0, duration: 180, onComplete: () => img.destroy() });
    if (rng.chance(0.15) && this.drops.length < 3) this.spawnDrop(b.x, b.y);
    if (!this.bricks.some((x) => !x.steel)) this.levelClear();
  }

  private spawnDrop(x: number, y: number): void {
    const kind: Power = rng.chance(0.08) ? 'life' : rng.pick(['wide', 'multi', 'slow'] as Power[]);
    const c = this.add.container(x, y).setDepth(9);
    const pill = this.add.graphics();
    pill.fillStyle(0x000000, 0.5).fillRoundedRect(-30, -12, 64, 30, 15);
    pill.fillStyle(POWER_COLORS[kind], 1).fillRoundedRect(-32, -16, 64, 30, 15);
    pill.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(-32, -16, 64, 30, 15);
    c.add([pill, txt(this, 0, -1, POWER_LETTER[kind], { title: true, size: 18, strokeThickness: 4, shadow: false })]);
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.drops.push({ kind, obj: c });
    this.sfxAt('drop', x, { volume: 0.3 });
  }

  private collect(d: Drop): void {
    this.sfxAt(d.kind === 'life' ? 'life' : 'power', d.obj.x, { volume: d.kind === 'life' ? 0.7 : 0.6 });
    flash(this, POWER_COLORS[d.kind], 90);
    burst(this, d.obj.x, d.obj.y, POWER_COLORS[d.kind], 20, 260);
    popup(this, d.obj.x, d.obj.y - 30, t(d.kind), '#ffffff', 22);
    this.addScore(25);
    if (d.kind === 'wide') { this.wideT = 12; this.setPaddleWidth(225); }
    else if (d.kind === 'slow') {
      this.slowT = 10;
      for (const b of this.balls) { b.vx *= 0.68; b.vy *= 0.68; }
    } else if (d.kind === 'multi') {
      const src = this.balls.find((b) => !b.stuck) ?? this.balls[0];
      if (src?.stuck) this.launchBalls();
      if (src && this.balls.length < 12) { this.addBall(false, src, 0.45); this.addBall(false, src, -0.45); }
    } else { this.lives = Math.min(6, this.lives + 1); this.updateHud(); }
  }

  private levelClear(): void {
    this.busy = true;
    this.sfx('clear', { volume: 0.6, exact: true });
    flash(this, 0xffd23f, 200);
    const bonus = 250 + this.level * 100 + this.lives * 50;
    this.addScore(bonus, 360, 640);
    txt(this, 360, 560, t('levelClear'), { title: true, size: 40, color: '#5dff7a' }).setDepth(30).setName('clearText');
    for (const b of this.balls) b.img.destroy();
    this.balls = [];
    for (const d of this.drops) d.obj.destroy();
    this.drops = [];
    this.time.delayedCall(1600, () => {
      this.children.getByName('clearText')?.destroy();
      this.level++;
      if (this.level >= LEVELS.length) { this.endGame({ win: true }); return; }
      this.busy = false;
      this.wideT = 0; this.slowT = 0; this.setPaddleWidth(150);
      this.hint.setVisible(true);
      this.loadLevel();
    });
  }

  private loseLife(): void {
    this.lives--;
    this.combo = 0;
    this.updateHud();
    this.sfx('lose', { volume: 0.6 });
    if (this.lives === 1) this.sfx('low', { volume: 0.45, delay: 0.7 });
    shake(this, 0.02, 280);
    flash(this, 0xec3013, 160);
    burst(this, this.paddle.x, PADDLE_Y, [0xec3013, 0xffffff], 30, 380);
    this.wideT = 0; this.slowT = 0; this.setPaddleWidth(150);
    if (this.lives <= 0) { this.paddle.setVisible(false); this.endGame(); return; }
    this.addBall(true);
    this.hint.setVisible(true);
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    // paddle
    if (c.axisX) { this.targetX = null; this.paddle.x += c.axisX * 900 * dt; }
    else if (this.targetX !== null) this.paddle.x += (this.targetX - this.paddle.x) * Math.min(1, dt * 22);
    const half = this.paddleW / 2;
    this.paddle.x = Phaser.Math.Clamp(this.paddle.x, FIELD_L + half, FIELD_R - half);
    if (c.justA() || c.up) this.launchBalls();

    // timers
    if (this.wideT > 0 && (this.wideT -= dt) <= 0) this.setPaddleWidth(150);
    if (this.slowT > 0 && (this.slowT -= dt) <= 0) {
      for (const b of this.balls) { b.vx /= 0.68; b.vy /= 0.68; }
    }
    if (this.balls.some((b) => b.stuck) && !this.busy && (this.stuckT += dt) > 4) this.launchBalls();

    // balls (sub-stepped axis-separated movement)
    for (const b of [...this.balls]) {
      if (b.stuck) { b.x = this.paddle.x + b.off; b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R; b.img.setPosition(b.x, b.y); continue; }
      const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 6);
      for (let i = 0; i < steps && !b.stuck; i++) this.stepBall(b, dt / steps);
      if (!this.balls.includes(b)) continue;
      b.img.setPosition(b.x, b.y).rotation += dt * 6;
      this.trail.emitParticleAt(b.x, b.y);
    }

    // drops
    for (const d of [...this.drops]) {
      d.obj.y += 230 * dt;
      if (Math.abs(d.obj.y - PADDLE_Y) < 30 && Math.abs(d.obj.x - this.paddle.x) < this.paddleW / 2 + 30) {
        this.collect(d); d.obj.destroy(); this.drops.splice(this.drops.indexOf(d), 1);
      } else if (d.obj.y > 1300) { d.obj.destroy(); this.drops.splice(this.drops.indexOf(d), 1); }
    }
  }

  private stepBall(b: Ball, dt: number): void {
    // X axis
    b.x += b.vx * dt;
    if (b.x < FIELD_L + BALL_R) { b.x = FIELD_L + BALL_R; b.vx = Math.abs(b.vx); this.sfxAt('wall', b.x, { volume: 0.25 }); }
    if (b.x > FIELD_R - BALL_R) { b.x = FIELD_R - BALL_R; b.vx = -Math.abs(b.vx); this.sfxAt('wall', b.x, { volume: 0.25 }); }
    let hit = this.brickAt(b.x, b.y);
    if (hit) { b.x -= b.vx * dt; b.vx = -b.vx; this.hitBrick(hit); }
    // Y axis
    b.y += b.vy * dt;
    if (b.y < FIELD_T + BALL_R) { b.y = FIELD_T + BALL_R; b.vy = Math.abs(b.vy); this.sfxAt('wall', b.x, { volume: 0.25 }); }
    hit = this.brickAt(b.x, b.y);
    if (hit) { b.y -= b.vy * dt; b.vy = -b.vy; this.hitBrick(hit); }
    // paddle
    const top = PADDLE_Y - PADDLE_H / 2;
    if (b.vy > 0 && b.y + BALL_R >= top && b.y < PADDLE_Y && Math.abs(b.x - this.paddle.x) < this.paddleW / 2 + BALL_R * 0.6) {
      const off = Phaser.Math.Clamp((b.x - this.paddle.x) / (this.paddleW / 2), -1, 1);
      const a = Phaser.Math.DegToRad(-90 + off * 62);
      this.hits++;
      if (this.hits % 8 === 0 && this.speed < 980) { this.speed += 20; popup(this, this.paddle.x, PADDLE_Y - 70, t('fast'), '#ff4fa3', 18); this.sfx('fast', { volume: 0.35 }); }
      const s = this.curSpeed();
      b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.y = top - BALL_R;
      this.combo = 0;
      this.sfxAt('paddle', b.x, { volume: 0.5 });
      burst(this, b.x, top, 0x3ee6ff, 8, 160);
      this.tweens.add({ targets: this.paddle, displayHeight: PADDLE_H * 0.7, duration: 60, yoyo: true });
    }
    // keep the ball from flattening into a horizontal loop
    const sp = Math.hypot(b.vx, b.vy);
    if (Math.abs(b.vy) < sp * 0.22) { b.vy = Math.sign(b.vy || -1) * sp * 0.22; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }
    // lost
    if (b.y > this.scale.height + 30) {
      b.img.destroy();
      this.balls.splice(this.balls.indexOf(b), 1);
      b.stuck = true; // stop stepping
      if (this.balls.length === 0 && !this.busy) this.loseLife();
    }
  }
}
