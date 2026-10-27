import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';

const L = 24, R = 696, TOP_GOAL = 120, BOT_GOAL = 1210;
const ME_Y = 1110, AI_Y = 210, PW = 170, PH = 40, BALL_R = 17;
const ROUNDS = 5, TO_WIN = 7;
// per round: AI max speed, aim error (px), reaction delay (s), how far down the table it starts tracking
const AI = [
  { speed: 320, err: 175, react: 0.4, vision: 560 },
  { speed: 400, err: 155, react: 0.3, vision: 660 },
  { speed: 480, err: 138, react: 0.22, vision: 760 },
  { speed: 560, err: 124, react: 0.15, vision: 880 },
  { speed: 650, err: 112, react: 0.1, vision: 1000 },
];

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private me!: Phaser.GameObjects.Image;
  private ai!: Phaser.GameObjects.Image;
  private meGlow!: Phaser.GameObjects.Image;
  private aiGlow!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private ballGlow!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private meText!: Phaser.GameObjects.Text;
  private aiText!: Phaser.GameObjects.Text;
  private vx = 0;
  private vy = 0;
  private spin = 0;
  private speed = 520;
  private live = false;
  private round = 1;
  private myPts = 0;
  private aiPts = 0;
  private rally = 0;
  private targetX: number | null = null;
  private meVel = 0;
  private aiVel = 0;
  private aiTarget = 360;
  private aiThink = 0;
  private aiErr = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.round = 1; this.myPts = 0; this.aiPts = 0; this.rally = 0; this.spin = 0;
    this.live = false; this.targetX = null; this.meVel = 0; this.aiVel = 0; this.aiTarget = 360; this.aiThink = 0;

    // neon arena
    const g = this.add.graphics();
    g.lineStyle(2, 0x2b1660, 0.7);
    for (let x = L; x <= R; x += 48) g.lineBetween(x, 90, x, height);
    for (let y = 90; y <= height; y += 48) g.lineBetween(L, y, R, y);
    const glowLine = (color: number, x1: number, y1: number, x2: number, y2: number) => {
      g.lineStyle(14, color, 0.15).lineBetween(x1, y1, x2, y2);
      g.lineStyle(6, color, 0.5).lineBetween(x1, y1, x2, y2);
      g.lineStyle(2, 0xffffff, 0.9).lineBetween(x1, y1, x2, y2);
    };
    glowLine(0x3ee6ff, L, 90, L, height);
    glowLine(0x3ee6ff, R, 90, R, height);
    g.lineStyle(4, 0xff4fa3, 0.45);
    for (let x = L + 10; x < R; x += 44) g.lineBetween(x, 640, x + 22, 640);
    g.lineStyle(4, 0xff4fa3, 0.25).strokeCircle(360, 640, 90);

    this.aiText = txt(this, 360, 470, '0', { title: true, size: 110, color: '#ff4fa3', strokeThickness: 0, shadow: false }).setAlpha(0.28);
    this.meText = txt(this, 360, 820, '0', { title: true, size: 110, color: '#3ee6ff', strokeThickness: 0, shadow: false }).setAlpha(0.28);
    txt(this, 360, 370, t('cpu'), { title: true, size: 18, color: '#ff4fa3', strokeThickness: 0, shadow: false }).setAlpha(0.5);
    txt(this, 360, 920, t('you'), { title: true, size: 18, color: '#3ee6ff', strokeThickness: 0, shadow: false }).setAlpha(0.5);

    this.trail = this.add.particles(0, 0, 'spark', {
      lifespan: 320, scale: { start: 0.16, end: 0 }, alpha: { start: 0.7, end: 0 }, frequency: -1, blendMode: 'ADD',
    }).setDepth(4);

    this.aiGlow = this.add.image(360, AI_Y, 'glow').setDisplaySize(PW * 1.5, PH * 3).setTint(0xff2266).setAlpha(0.45).setBlendMode('ADD');
    this.meGlow = this.add.image(360, ME_Y, 'glow').setDisplaySize(PW * 1.5, PH * 3).setTint(0x22ccff).setAlpha(0.45).setBlendMode('ADD');
    this.ai = this.add.image(360, AI_Y, 'paddle-ai').setDisplaySize(PW, PH).setDepth(5);
    this.me = this.add.image(360, ME_Y, 'paddle-me').setDisplaySize(PW, PH).setDepth(5);
    this.ballGlow = this.add.image(360, 640, 'glow').setDisplaySize(90, 90).setTint(0xffd23f).setAlpha(0.5).setBlendMode('ADD').setDepth(5);
    this.ball = this.add.image(360, 640, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(6);

    this.controls = new Controls(this);
    const follow = (p: Phaser.Input.Pointer) => { if (p.y > 130 && (p.isDown || !this.sys.game.device.input.touch)) this.targetX = p.x; };
    this.input.on('pointerdown', follow);
    this.input.on('pointermove', follow);

    this.updateHud();
    this.serve(1, 1.4);
  }

  private updateHud(): void {
    this.hud.setRight(`${t('round')} ${this.round}/${ROUNDS}`);
    this.meText.setText(String(this.myPts));
    this.aiText.setText(String(this.aiPts));
  }

  /** dir: 1 = towards the player, -1 = towards the CPU */
  private serve(dir: number, delay = 1): void {
    this.live = false;
    this.spin = 0;
    this.rally = 0;
    this.speed = 500 + this.round * 40;
    this.ball.setPosition(360, 640).setScale(0);
    this.tweens.add({ targets: this.ball, displayWidth: BALL_R * 2, displayHeight: BALL_R * 2, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(delay * 1000, () => {
      if (this.isOver) return;
      const a = Phaser.Math.DegToRad(rng.int(-28, 28));
      this.vx = Math.sin(a) * this.speed;
      this.vy = Math.cos(a) * this.speed * dir;
      this.live = true;
      this.newAiErr();
      this.sfx('serve', { volume: 0.35 });
    });
  }

  private newAiErr(): void {
    const e = AI[this.round - 1].err;
    this.aiErr = rng.int(-e, e);
  }

  /** Predict where the ball crosses y (with wall bounces, ignoring spin). */
  private predictX(y: number): number {
    if (this.vy === 0) return 360;
    const tt = (y - this.ball.y) / this.vy;
    if (tt < 0) return 360;
    const span = R - L - BALL_R * 2;
    let x = this.ball.x - L - BALL_R + this.vx * tt;
    x = ((x % (2 * span)) + 2 * span) % (2 * span);
    if (x > span) x = 2 * span - x;
    return x + L + BALL_R;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    const half = PW / 2;

    // player paddle
    const prevX = this.me.x;
    if (c.axisX) { this.targetX = null; this.me.x += c.axisX * 820 * dt; }
    else if (this.targetX !== null) {
      const d = this.targetX - this.me.x;
      this.me.x += Phaser.Math.Clamp(d * Math.min(1, dt * 20), -2200 * dt, 2200 * dt);
    }
    this.me.x = Phaser.Math.Clamp(this.me.x, L + half, R - half);
    this.meVel = Phaser.Math.Linear(this.meVel, (this.me.x - prevX) / Math.max(dt, 0.001), 0.5);

    // CPU paddle
    const ai = AI[this.round - 1];
    this.aiThink -= dt;
    if (this.aiThink <= 0) {
      this.aiThink = ai.react;
      this.aiTarget = this.live && this.vy < 0 && this.ball.y < AI_Y + ai.vision ? this.predictX(AI_Y + PH / 2) + this.aiErr : 360 + (this.ball.x - 360) * 0.3;
    }
    const aiPrev = this.ai.x;
    const ad = this.aiTarget - this.ai.x;
    this.ai.x += Phaser.Math.Clamp(ad * 6 * dt, -ai.speed * dt, ai.speed * dt);
    this.ai.x = Phaser.Math.Clamp(this.ai.x, L + half, R - half);
    this.aiVel = (this.ai.x - aiPrev) / Math.max(dt, 0.001);
    this.meGlow.x = this.me.x; this.aiGlow.x = this.ai.x;

    this.ballGlow.setVisible(this.ball.scaleX > 0.05);
    if (!this.live) { this.ballGlow.setPosition(this.ball.x, this.ball.y); return; }

    // ball (sub-stepped)
    const steps = Math.ceil((Math.hypot(this.vx, this.vy) * dt) / 8);
    for (let i = 0; i < steps && this.live; i++) this.stepBall(dt / steps);
    this.spin *= Math.exp(-1.8 * dt);
    this.ball.rotation += this.spin * dt * 20 + dt * 2;
    this.ballGlow.setPosition(this.ball.x, this.ball.y);
    this.trail.setParticleTint(Math.abs(this.spin) > 0.25 ? 0xff4fa3 : 0xffd23f);
    this.trail.emitParticleAt(this.ball.x, this.ball.y);
  }

  private stepBall(dt: number): void {
    const b = this.ball;
    this.vx += this.spin * 1100 * dt;           // curve from spin
    b.x += this.vx * dt;
    b.y += this.vy * dt;
    if (b.x < L + BALL_R) { b.x = L + BALL_R; this.vx = Math.abs(this.vx); this.wallHit(); }
    if (b.x > R - BALL_R) { b.x = R - BALL_R; this.vx = -Math.abs(this.vx); this.wallHit(); }

    // paddles
    if (this.vy > 0 && this.overPaddle(this.me, ME_Y)) this.paddleHit(this.me, ME_Y, -1, this.meVel, true);
    else if (this.vy < 0 && this.overPaddle(this.ai, AI_Y)) this.paddleHit(this.ai, AI_Y, 1, this.aiVel, false);

    if (b.y < TOP_GOAL) this.point(true);
    else if (b.y > BOT_GOAL) this.point(false);
  }

  private overPaddle(p: Phaser.GameObjects.Image, py: number): boolean {
    return Math.abs(this.ball.y - py) < PH / 2 + BALL_R && Math.abs(this.ball.x - p.x) < PW / 2 + BALL_R * 0.7;
  }

  private wallHit(): void {
    this.spin *= -0.5;
    this.sfx('wall', { volume: 0.2 });
    burst(this, this.ball.x, this.ball.y, 0x3ee6ff, 6, 140);
  }

  private paddleHit(p: Phaser.GameObjects.Image, py: number, dir: number, pvel: number, mine: boolean): void {
    const off = Phaser.Math.Clamp((this.ball.x - p.x) / (PW / 2), -1, 1);
    this.speed = Math.min(850 + this.round * 80, this.speed * 1.045);
    const a = Phaser.Math.DegToRad(off * 52);
    this.vx = Math.sin(a) * this.speed;
    this.vy = Math.cos(a) * this.speed * dir;
    this.spin = Phaser.Math.Clamp(pvel / 1400, -1, 1);
    if (mine) this.newAiErr();
    this.ball.y = py + dir * (PH / 2 + BALL_R + 1);
    this.rally++;
    this.sfx(mine ? 'hit' : 'hit2', { volume: 0.4, detune: Math.min(600, this.rally * 30) });
    burst(this, this.ball.x, py, mine ? [0x3ee6ff, 0xffffff] : [0xff4fa3, 0xffffff], 14, 260);
    const glow = mine ? this.meGlow : this.aiGlow;
    this.tweens.add({ targets: glow, alpha: 0.95, duration: 70, yoyo: true });
    this.tweens.add({ targets: p, displayHeight: PH * 0.7, duration: 60, yoyo: true });
    if (mine) {
      this.addScore(5 + this.rally);
      if (Math.abs(this.spin) > 0.45) popup(this, this.ball.x, py - 60, t('spin'), '#ff4fa3', 20);
      else if (this.rally >= 10 && this.rally % 5 === 0) popup(this, this.ball.x, py - 60, `${t('rally')} ${this.rally}`, '#ffd23f', 20);
    }
    if (this.speed > 900) shake(this, 0.003, 60);
  }

  private point(mine: boolean): void {
    this.live = false;
    const b = this.ball;
    burst(this, b.x, b.y, mine ? [0x3ee6ff, 0xffd23f, 0xffffff] : [0xff4fa3, 0xec3013], 40, 450);
    shake(this, mine ? 0.008 : 0.018, 220);
    b.setScale(0);
    if (mine) {
      this.myPts++;
      this.addScore(100 * this.round + this.rally * 10, 360, 560);
      this.sfx('goal', { volume: 0.45 });
      flash(this, 0x3ee6ff, 120);
      popup(this, 360, 700, t('youPoint'), '#3ee6ff', 34);
    } else {
      this.aiPts++;
      this.sfx('miss', { volume: 0.45 });
      flash(this, 0xec3013, 150);
      popup(this, 360, 700, t('cpuPoint'), '#ec3013', 34);
    }
    this.updateHud();
    const txtObj = mine ? this.meText : this.aiText;
    txtObj.setAlpha(0.9).setScale(1.4);
    this.tweens.add({ targets: txtObj, alpha: 0.28, scale: 1, duration: 600 });

    if (this.aiPts >= TO_WIN) { this.endGame({ delay: 900 }); return; }
    if (this.myPts >= TO_WIN) { this.matchWon(); return; }
    this.serve(mine ? -1 : 1);
  }

  private matchWon(): void {
    const bonus = 500 * this.round + (TO_WIN - this.aiPts) * 100;
    this.addScore(bonus, 360, 640);
    this.sfx('match', { volume: 0.5 });
    flash(this, 0xffd23f, 250);
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 150, () => burst(this, rng.int(100, 620), rng.int(400, 900), [0xffd23f, 0x3ee6ff, 0xff4fa3], 30, 400));
    if (this.round >= ROUNDS) { this.endGame({ win: true, title: t('champion'), delay: 1500 }); return; }
    const banner = txt(this, 360, 640, t('matchWon'), { title: true, size: 40, color: '#ffd23f' }).setDepth(30).setScale(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 400, ease: 'Back.easeOut', hold: 1200, yoyo: true, onComplete: () => banner.destroy() });
    this.time.delayedCall(2200, () => {
      if (this.isOver) return;
      this.round++; this.myPts = 0; this.aiPts = 0;
      this.updateHud();
      const r = txt(this, 360, 640, `${t('round')} ${this.round}`, { title: true, size: 52, color: '#ff4fa3' }).setDepth(30).setAlpha(0);
      this.tweens.add({ targets: r, alpha: 1, duration: 250, hold: 700, yoyo: true, onComplete: () => r.destroy() });
      this.serve(1, 1.5);
    });
  }
}
