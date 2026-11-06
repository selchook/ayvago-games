import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';
import { BRICK_COLORS, LEVELS } from './levels';
import { makeBackdrop, makeBanner, makeCapsule, makeFx } from './art';

interface Brick { x: number; y: number; hp: number; max: number; color: string; steel: boolean; img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; crack?: Phaser.GameObjects.Image; }
interface Ball { x: number; y: number; vx: number; vy: number; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; stuck: boolean; off: number; }
interface Drop { kind: Power; obj: Phaser.GameObjects.Container; }
const ADD = Phaser.BlendModes.ADD;
const DANGER_Y = 1196;
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
  private padGlow!: Phaser.GameObjects.Image;
  private danger!: Phaser.GameObjects.Graphics;
  private dangerFlash = 0;
  private timers!: Phaser.GameObjects.Graphics;
  private timerText: Phaser.GameObjects.Text[] = [];
  private wallSfxT = 0;
  private comboText!: Phaser.GameObjects.Text;

  createGame(): void {
    const { width, height } = this.scale;
    this.bricks = []; this.balls = []; this.drops = []; this.lifeIcons = [];
    this.lives = 3; this.level = 0; this.wideT = 0; this.slowT = 0; this.combo = 0; this.hits = 0;
    this.targetX = null; this.stuckT = 0; this.busy = false; this.paddleW = 150;

    this.dangerFlash = 0; this.wallSfxT = 0; this.timerText = [];
    // backdrop: night sky, synthwave floor and a neon frame around the field
    makeFx(this); makeBanner(this);
    for (const [k, col] of Object.entries(POWER_COLORS)) makeCapsule(this, 'bk-cap-' + k, '#' + col.toString(16).padStart(6, '0'));
    makeBackdrop(this, 'bk-bg', width, height, { l: FIELD_L, r: FIELD_R, t: FIELD_T });
    this.add.image(0, 0, 'bk-bg').setOrigin(0).setDepth(-10);
    for (let i = 0; i < 14; i++) {
      const st = this.add.image(rng.int(30, width - 30), rng.int(FIELD_T + 20, 860), 'spark').setScale(0.05).setBlendMode(ADD).setDepth(-9).setAlpha(0);
      this.tweens.add({ targets: st, alpha: 0.8, scale: 0.09, duration: 700, delay: rng.int(0, 4000), yoyo: true, repeat: -1, repeatDelay: rng.int(1500, 5000) });
    }
    this.danger = this.add.graphics().setDepth(2);
    this.comboText = txt(this, width / 2, 74, '', { title: true, size: 16, color: '#ff4fa3', strokeThickness: 4, shadow: false }).setDepth(9000);
    this.timers = this.add.graphics().setDepth(20);
    for (const k of ['wide', 'slow'] as Power[]) this.timerText.push(txt(this, 0, 0, POWER_LETTER[k], { title: true, size: 14, strokeThickness: 4, shadow: false }).setDepth(21).setVisible(false));

    this.trail = this.add.particles(0, 0, 'spark', {
      lifespan: 300, scale: { start: 0.16, end: 0 }, alpha: { start: 0.7, end: 0 }, tint: 0x3ee6ff, frequency: -1, blendMode: 'ADD',
    }).setDepth(4);

    this.padGlow = this.add.image(width / 2, PADDLE_Y + 14, 'bk-glow').setBlendMode(ADD).setTint(0x3ee6ff).setAlpha(0.35).setDepth(3);
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
    for (const b of this.bricks) { b.img.destroy(); b.sh.destroy(); b.crack?.destroy(); }
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
        const sh = this.add.image(x + 6, y - 400 + 7, 'bk-shadow').setDepth(1);
        const brick: Brick = { x, y, hp, max: hp, color, steel, img, sh };
        this.styleBrick(brick);
        this.tweens.add({ targets: img, y, duration: 450, delay: r * 60 + c * 15, ease: 'Bounce.easeOut' });
        this.tweens.add({ targets: sh, y: y + 7, duration: 450, delay: r * 60 + c * 15, ease: 'Bounce.easeOut' });
        this.bricks.push(brick);
      });
    });
    this.updateHud();
    for (const b of this.balls) { b.img.destroy(); b.glow.destroy(); }
    this.balls = [];
    this.addBall(true);
    const n = this.level % LEVELS.length;
    this.banner(`${t('level')} ${this.level + 1}`, t('lv' + (n + 1)), '#ffd23f', 0xffd23f);
  }

  /** A ribbon with a title and subtitle that slide in, hold and slide out. */
  private banner(title: string, sub: string, color: string, tint: number): void {
    const y = 760;
    const band = this.add.image(360, y, 'bk-banner').setDisplaySize(720, 150).setTint(tint).setDepth(29);
    const sy = band.scaleY;
    band.scaleY = 0;
    const a = txt(this, 1000, y - 22, title, { title: true, size: 44, color }).setDepth(30);
    const b = txt(this, -300, y + 38, sub, { size: 28, color: '#e6dcff' }).setDepth(30);
    this.tweens.add({ targets: band, scaleY: sy, duration: 170, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: a, x: 360, duration: 360, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, x: 360, duration: 360, delay: 80, ease: 'Back.easeOut' });
    this.time.delayedCall(1400, () => {
      this.tweens.add({ targets: a, x: -400, duration: 260, ease: 'Cubic.easeIn', onComplete: () => a.destroy() });
      this.tweens.add({ targets: b, x: 1100, duration: 260, ease: 'Cubic.easeIn', onComplete: () => b.destroy() });
      this.tweens.add({ targets: band, scaleY: 0, delay: 150, duration: 180, onComplete: () => band.destroy() });
    });
  }

  private glowAt(x: number, y: number, tint: number, scale: number, ms: number, depth = 7): void {
    const g = this.add.image(x, y, 'bk-glow').setBlendMode(ADD).setTint(tint).setScale(scale * 0.4).setDepth(depth);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  private ringAt(x: number, y: number, tint: number, scale: number, ms: number): void {
    const r = this.add.image(x, y, 'bk-ring').setTint(tint).setScale(0.1).setAlpha(0.9).setDepth(7);
    this.tweens.add({ targets: r, scale, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  /** The brick splits into four pieces that tumble away. */
  private shatter(b: Brick): void {
    const key = b.img.texture.key, fw = b.img.width, fh = b.img.height;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const p = this.add.image(b.x, b.y, key).setDisplaySize(BRICK_W, BRICK_H).setCrop(i * fw / 2, j * fh / 2, fw / 2, fh / 2).setDepth(6);
      const dir = i ? 1 : -1;
      this.tweens.add({ targets: p, x: b.x + dir * rng.int(40, 120), duration: 620, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: p, y: b.y + rng.int(140, 280), angle: dir * rng.int(90, 260), duration: 620, ease: 'Back.easeIn' });
      this.tweens.add({ targets: p, alpha: 0, delay: 300, duration: 320, onComplete: () => p.destroy() });
    }
  }

  private styleBrick(b: Brick): void {
    if (b.steel) return;
    b.img.setTexture(b.hp >= 2 ? `brick-${b.color}2` : `brick-${b.color}`).setDisplaySize(BRICK_W, BRICK_H);
    b.img.setAlpha(b.color === 'k' && b.hp === 1 ? 0.75 : 1);
    const dmg = b.max - b.hp;
    if (dmg > 0) {
      if (!b.crack) b.crack = this.add.image(b.x, b.y, 'bk-crack1').setDisplaySize(BRICK_W, BRICK_H).setDepth(5.5);
      b.crack.setTexture(dmg >= 2 ? 'bk-crack2' : 'bk-crack1').setDisplaySize(BRICK_W, BRICK_H);
    }
  }

  private addBall(stuck: boolean, from?: Ball, angle = 0): void {
    const img = this.add.image(this.paddle.x, PADDLE_Y - PADDLE_H / 2 - BALL_R, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(8);
    const glow = this.add.image(img.x, img.y, 'bk-glow').setBlendMode(ADD).setTint(0x3ee6ff).setScale(0.75).setAlpha(0.55).setDepth(7);
    const ball: Ball = { x: img.x, y: img.y, vx: 0, vy: 0, img, glow, stuck, off: rng.int(-30, 30) };
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
    if (any) {
      this.sfxAt('launch', this.paddle.x, { volume: 0.45 }); this.hint.setVisible(false);
      this.ringAt(this.paddle.x, PADDLE_Y - PADDLE_H, 0x3ee6ff, 0.7, 300);
    }
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
      this.glowAt(b.x, b.y, 0xcfd8ff, 0.6, 160);
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
      this.glowAt(b.x, b.y, tint, 0.7, 180);
      this.addScore(5);
      return;
    }
    this.combo++;
    const pts = 10 * Math.min(8, this.combo) + this.level * 2;
    this.addScore(pts, b.x, b.y);
    if (this.combo >= 4 && this.combo % 2 === 0) popup(this, b.x, b.y - 40, `${t('combo')} x${Math.min(8, this.combo)}`, '#ff4fa3', 22);
    this.sfxAt('brick', b.x, { volume: 0.45, detune: Math.min(1200, this.combo * 80), exact: true });
    this.sfxAt('debris', b.x, { volume: 0.3 });
    burst(this, b.x, b.y, [tint, 0xffffff], 14, 300);
    shake(this, 0.004, 80);
    this.bricks.splice(this.bricks.indexOf(b), 1);
    this.glowAt(b.x, b.y, tint, 1.1, 260);
    this.shatter(b);
    b.img.destroy(); b.sh.destroy(); b.crack?.destroy();
    this.updateCombo();
    if (rng.chance(0.15) && this.drops.length < 3) this.spawnDrop(b.x, b.y);
    if (!this.bricks.some((x) => !x.steel)) this.levelClear();
  }

  private spawnDrop(x: number, y: number): void {
    const kind: Power = rng.chance(0.08) ? 'life' : rng.pick(['wide', 'multi', 'slow'] as Power[]);
    const c = this.add.container(x, y).setDepth(9);
    const glow = this.add.image(0, 0, 'bk-glow').setBlendMode(ADD).setTint(POWER_COLORS[kind]).setScale(0.9).setAlpha(0.6);
    const pill = this.add.image(0, 0, 'bk-cap-' + kind).setDisplaySize(68, 34);
    const letter = txt(this, 0, -1, POWER_LETTER[kind], { title: true, size: 18, strokeThickness: 4, shadow: false });
    c.add([glow, pill, letter]);
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    // the capsule rolls as it falls
    this.tweens.add({ targets: [pill, letter], scaleY: { from: pill.scaleY, to: pill.scaleY * 0.55 }, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: glow, alpha: 0.25, duration: 400, yoyo: true, repeat: -1 });
    this.drops.push({ kind, obj: c });
    this.sfxAt('drop', x, { volume: 0.3 });
  }

  private collect(d: Drop): void {
    this.sfxAt(d.kind === 'life' ? 'life' : 'power', d.obj.x, { volume: d.kind === 'life' ? 0.7 : 0.6 });
    flash(this, POWER_COLORS[d.kind], 90);
    burst(this, d.obj.x, d.obj.y, POWER_COLORS[d.kind], 20, 260);
    this.ringAt(d.obj.x, d.obj.y, POWER_COLORS[d.kind], 1.4, 380);
    this.glowAt(this.paddle.x, PADDLE_Y, POWER_COLORS[d.kind], 2.2, 420, 9);
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
    this.banner(t('levelClear'), `+${bonus}`, '#5dff7a', 0x5dff7a);
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 180, () => {
        const x = rng.int(120, 600), y = rng.int(260, 600);
        burst(this, x, y, [0xffd23f, 0xff4fa3, 0x3ee6ff, 0x5dff7a], 26, 360);
        this.glowAt(x, y, rng.pick([0xffd23f, 0xff4fa3, 0x3ee6ff]), 1.6, 420);
      });
    }
    this.comboText.setText('');
    for (const b of this.balls) { b.img.destroy(); b.glow.destroy(); }
    this.balls = [];
    for (const d of this.drops) d.obj.destroy();
    this.drops = [];
    this.time.delayedCall(1600, () => {
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
    this.dangerFlash = 1;
    this.updateCombo();
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
    this.padGlow.setPosition(this.paddle.x, PADDLE_Y + 14).setDisplaySize(this.paddleW * 1.6, 70).setVisible(this.paddle.visible);
    this.wallSfxT -= dt;
    this.drawDanger(dt);
    this.drawTimers();
    if (c.justA() || c.up) this.launchBalls();

    // timers
    if (this.wideT > 0 && (this.wideT -= dt) <= 0) this.setPaddleWidth(150);
    if (this.slowT > 0 && (this.slowT -= dt) <= 0) {
      for (const b of this.balls) { b.vx /= 0.68; b.vy /= 0.68; }
    }
    if (this.balls.some((b) => b.stuck) && !this.busy && (this.stuckT += dt) > 4) this.launchBalls();

    // balls (sub-stepped axis-separated movement)
    for (const b of [...this.balls]) {
      if (b.stuck) { b.x = this.paddle.x + b.off; b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R; b.img.setPosition(b.x, b.y); b.glow.setPosition(b.x, b.y); continue; }
      const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 6);
      for (let i = 0; i < steps && !b.stuck; i++) this.stepBall(b, dt / steps);
      if (!this.balls.includes(b)) continue;
      b.img.setPosition(b.x, b.y).rotation += dt * 6;
      b.glow.setPosition(b.x, b.y);
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
    if (b.x < FIELD_L + BALL_R) { b.x = FIELD_L + BALL_R; b.vx = Math.abs(b.vx); this.wallHit(FIELD_L - 2, b.y); }
    if (b.x > FIELD_R - BALL_R) { b.x = FIELD_R - BALL_R; b.vx = -Math.abs(b.vx); this.wallHit(FIELD_R + 2, b.y); }
    let hit = this.brickAt(b.x, b.y);
    if (hit) { b.x -= b.vx * dt; b.vx = -b.vx; this.hitBrick(hit); }
    // Y axis
    b.y += b.vy * dt;
    if (b.y < FIELD_T + BALL_R) { b.y = FIELD_T + BALL_R; b.vy = Math.abs(b.vy); this.wallHit(b.x, FIELD_T - 2); }
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
      this.glowAt(b.x, top, 0x3ee6ff, 0.8, 180, 11);
      this.updateCombo();
      this.tweens.add({ targets: this.paddle, displayHeight: PADDLE_H * 0.7, duration: 60, yoyo: true });
    }
    // keep the ball from flattening into a horizontal loop
    const sp = Math.hypot(b.vx, b.vy);
    if (Math.abs(b.vy) < sp * 0.22) { b.vy = Math.sign(b.vy || -1) * sp * 0.22; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }
    // lost
    if (b.y > this.scale.height + 30) {
      b.img.destroy(); b.glow.destroy();
      this.dangerFlash = Math.max(this.dangerFlash, 0.6);
      this.balls.splice(this.balls.indexOf(b), 1);
      b.stuck = true; // stop stepping
      if (this.balls.length === 0 && !this.busy) this.loseLife();
    }
  }

  private wallHit(x: number, y: number): void {
    this.glowAt(x, y, 0xa98bff, 0.55, 200, 3);
    if (this.wallSfxT > 0) return;
    this.wallSfxT = 0.05;
    this.sfxAt('wall', x, { volume: 0.25 });
  }

  /** Combo shown in the HUD; the ball trail warms up with it. */
  private updateCombo(): void {
    const n = Math.min(8, this.combo);
    const label = this.combo >= 2 ? `${t('combo')} x${n}` : '';
    if (label && label !== this.comboText.text) this.tweens.add({ targets: this.comboText, scale: { from: 1.35, to: 1 }, duration: 160, ease: 'Quad.easeOut' });
    this.comboText.setText(label);
    const col = this.combo >= 6 ? 0xff4fa3 : this.combo >= 3 ? 0xffd23f : 0x3ee6ff;
    this.comboText.setColor(this.combo >= 6 ? '#ff4fa3' : this.combo >= 3 ? '#ffd23f' : '#3ee6ff');
    this.trail.particleTint = col;
    for (const b of this.balls) b.glow.setTint(col);
  }

  /** A dashed laser line under the paddle; it flares when a ball is lost. */
  private drawDanger(dt: number): void {
    this.dangerFlash = Math.max(0, this.dangerFlash - dt * 1.5);
    const g = this.danger;
    g.clear();
    const a = 0.22 + 0.08 * Math.sin(this.time.now / 300) + this.dangerFlash * 0.7;
    const off = (this.time.now / 40) % 28;
    if (this.dangerFlash > 0) g.fillStyle(0xec3013, this.dangerFlash * 0.25).fillRect(FIELD_L, DANGER_Y - 10, FIELD_R - FIELD_L, 20);
    g.fillStyle(0xec3013, a);
    for (let x = FIELD_L - off; x < FIELD_R; x += 28) {
      const x0 = Math.max(FIELD_L, x), x1 = Math.min(FIELD_R, x + 16);
      if (x1 > x0) g.fillRect(x0, DANGER_Y - 2, x1 - x0, 4);
    }
  }

  /** Remaining time of the timed power-ups, bottom right. */
  private drawTimers(): void {
    const g = this.timers;
    g.clear();
    const list: [Power, number, number][] = [['wide', this.wideT, 12], ['slow', this.slowT, 10]];
    let x = FIELD_R - 52;
    list.forEach(([k, v, max], i) => {
      const lbl = this.timerText[i];
      if (v <= 0) { lbl.setVisible(false); return; }
      const w = 80, h = 22, y = 1232, col = POWER_COLORS[k];
      g.fillStyle(0x000000, 0.7).fillRoundedRect(x - w / 2, y - h / 2, w, h, 11);
      g.fillStyle(col, 1).fillRoundedRect(x - w / 2 + 3, y - h / 2 + 3, Math.max(16, (w - 6) * (v / max)), h - 6, 8);
      g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 11);
      lbl.setPosition(x - w / 2 - 14, y).setVisible(v > 2.5 || Math.floor(this.time.now / 150) % 2 === 0);
      x -= w + 30;
    });
  }
}
