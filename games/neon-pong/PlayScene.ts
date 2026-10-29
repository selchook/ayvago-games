import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng, net, upper } from '@core';

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

// Online match: the field is symmetric around the two paddles (ME_Y / AI_Y), so the guest sees the
// host's field mirrored (x' = 720 - x, y' = MIRROR_Y - y) with its own paddle at the bottom.
const ON_MID = 660, ON_BOT_GOAL = 1200, MIRROR_Y = ME_Y + AI_Y;
const ON_ROUND = 2;          // speed tier used for online matches
const SEND_MS = 50;          // ~20 messages per second each way
const REMOTE_HIT_SLACK = 18; // the remote paddle is a little stale on the host: be forgiving

interface Snap { b: number[]; p: number[]; k: number[]; l: number; r: number }

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
  // online
  private online = false;
  private host = true;
  private mid = 640;
  private botGoal = BOT_GOAL;
  private sendT = 0;
  private pingT = 0;
  private lat = 0.04;                 // estimated one-way latency (s), guest only
  private remoteX = 360;              // other player's paddle as last reported (local coords)
  private remoteV = 0;
  private remoteAt = 0;
  private corrX = 0;
  private corrY = 0;
  private localHitT = -1e9;
  private seenRally = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.round = 1; this.myPts = 0; this.aiPts = 0; this.rally = 0; this.spin = 0;
    this.live = false; this.targetX = null; this.meVel = 0; this.aiVel = 0; this.aiTarget = 360; this.aiThink = 0;
    this.online = net.active; this.host = net.isHost;
    this.mid = this.online ? ON_MID : 640;
    this.botGoal = this.online ? ON_BOT_GOAL : BOT_GOAL;
    if (this.online) this.round = ON_ROUND;
    this.sendT = 0; this.pingT = 0; this.lat = 0.04; this.remoteX = 360; this.remoteV = 0; this.remoteAt = 0;
    this.corrX = 0; this.corrY = 0; this.localHitT = -1e9; this.seenRally = 0;
    const mid = this.mid;

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
    for (let x = L + 10; x < R; x += 44) g.lineBetween(x, mid, x + 22, mid);
    g.lineStyle(4, 0xff4fa3, 0.25).strokeCircle(360, mid, 90);

    this.aiText = txt(this, 360, mid - 170, '0', { title: true, size: 110, color: '#ff4fa3', strokeThickness: 0, shadow: false }).setAlpha(0.28);
    this.meText = txt(this, 360, mid + 180, '0', { title: true, size: 110, color: '#3ee6ff', strokeThickness: 0, shadow: false }).setAlpha(0.28);
    const oppLabel = this.online ? upper((net.peerName || t('opponent')).slice(0, 16)) : t('cpu');
    txt(this, 360, mid - 270, oppLabel, { title: true, size: 18, color: '#ff4fa3', strokeThickness: 0, shadow: false }).setAlpha(0.5);
    txt(this, 360, mid + 280, t('you'), { title: true, size: 18, color: '#3ee6ff', strokeThickness: 0, shadow: false }).setAlpha(0.5);

    this.trail = this.add.particles(0, 0, 'spark', {
      lifespan: 320, scale: { start: 0.16, end: 0 }, alpha: { start: 0.7, end: 0 }, frequency: -1, blendMode: 'ADD',
    }).setDepth(4);

    this.aiGlow = this.add.image(360, AI_Y, 'glow').setDisplaySize(PW * 1.5, PH * 3).setTint(0xff2266).setAlpha(0.45).setBlendMode('ADD');
    this.meGlow = this.add.image(360, ME_Y, 'glow').setDisplaySize(PW * 1.5, PH * 3).setTint(0x22ccff).setAlpha(0.45).setBlendMode('ADD');
    this.ai = this.add.image(360, AI_Y, 'paddle-ai').setDisplaySize(PW, PH).setDepth(5);
    this.me = this.add.image(360, ME_Y, 'paddle-me').setDisplaySize(PW, PH).setDepth(5);
    this.ballGlow = this.add.image(360, mid, 'glow').setDisplaySize(90, 90).setTint(0xffd23f).setAlpha(0.5).setBlendMode('ADD').setDepth(5);
    this.ball = this.add.image(360, mid, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(6);

    this.controls = new Controls(this);
    const follow = (p: Phaser.Input.Pointer) => { if (p.y > 130 && (p.isDown || !this.sys.game.device.input.touch)) this.targetX = p.x; };
    this.input.on('pointerdown', follow);
    this.input.on('pointermove', follow);

    this.updateHud();
    if (this.online) this.setupOnline();
    // online: the first serve goes to the round's starter (net.starter), who gets the first hit;
    // dir 1 = towards the host's paddle, -1 = towards the guest's
    if (!this.online || this.host) this.serve(this.online && net.starter === 1 ? -1 : 1, 1.4);
  }

  private updateHud(): void {
    this.hud.setRight(this.online ? t('firstTo') : `${t('round')} ${this.round}/${ROUNDS}`);
    this.meText.setText(String(this.myPts));
    this.aiText.setText(String(this.aiPts));
  }

  /** dir: 1 = towards the player, -1 = towards the CPU */
  private serve(dir: number, delay = 1): void {
    this.live = false;
    this.spin = 0;
    this.rally = 0;
    this.speed = 500 + this.round * 40;
    this.ball.setPosition(360, this.mid).setScale(0);
    this.tweens.add({ targets: this.ball, displayWidth: BALL_R * 2, displayHeight: BALL_R * 2, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(delay * 1000, () => {
      if (this.isOver) return;
      const a = Phaser.Math.DegToRad(rng.int(-28, 28));
      this.vx = Math.sin(a) * this.speed;
      this.vy = Math.cos(a) * this.speed * dir;
      this.live = true;
      this.newAiErr();
      this.sfx('serve', { volume: 0.35 });
      if (this.online) this.sendSnap();
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

  /** Player paddle: keys or finger. */
  private movePlayer(dt: number): void {
    const c = this.controls;
    const half = PW / 2;
    const prevX = this.me.x;
    if (c.axisX) { this.targetX = null; this.me.x += c.axisX * 820 * dt; }
    else if (this.targetX !== null) {
      const d = this.targetX - this.me.x;
      this.me.x += Phaser.Math.Clamp(d * Math.min(1, dt * 20), -2200 * dt, 2200 * dt);
    }
    this.me.x = Phaser.Math.Clamp(this.me.x, L + half, R - half);
    this.meVel = Phaser.Math.Linear(this.meVel, (this.me.x - prevX) / Math.max(dt, 0.001), 0.5);
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.online) { this.updateOnline(dt); return; }
    const half = PW / 2;

    // player paddle
    this.movePlayer(dt);

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
    else if (this.vy < 0 && this.overPaddle(this.ai, AI_Y, this.online ? REMOTE_HIT_SLACK : 0)) this.paddleHit(this.ai, AI_Y, 1, this.aiVel, false);

    if (b.y < TOP_GOAL) this.point(true);
    else if (b.y > this.botGoal) this.point(false);
  }

  private overPaddle(p: Phaser.GameObjects.Image, py: number, slack = 0): boolean {
    return Math.abs(this.ball.y - py) < PH / 2 + BALL_R && Math.abs(this.ball.x - p.x) < PW / 2 + BALL_R * 0.7 + slack;
  }

  private wallHit(): void {
    this.spin *= -0.5;
    this.sfx('wall', { volume: 0.25, x: this.ball.x });
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
    this.hitFx(p, py, mine);
    if (mine && !this.online) {
      this.addScore(5 + this.rally);
      if (Math.abs(this.spin) > 0.45) popup(this, this.ball.x, py - 60, t('spin'), '#ff4fa3', 20);
      else if (this.rally >= 10 && this.rally % 5 === 0) popup(this, this.ball.x, py - 60, `${t('rally')} ${this.rally}`, '#ffd23f', 20);
    } else if (mine && Math.abs(this.spin) > 0.45) popup(this, this.ball.x, py - 60, t('spin'), '#ff4fa3', 20);
    if (this.speed > 900) shake(this, 0.003, 60);
    if (this.online) this.sendSnap();
  }

  private hitFx(p: Phaser.GameObjects.Image, py: number, mine: boolean): void {
    // a long rally climbs in pitch
    this.sfx(mine ? 'hit' : 'hit2', { volume: 0.4, detune: Math.min(600, this.rally * 30), x: this.ball.x });
    burst(this, this.ball.x, py, mine ? [0x3ee6ff, 0xffffff] : [0xff4fa3, 0xffffff], 14, 260);
    const glow = mine ? this.meGlow : this.aiGlow;
    this.tweens.add({ targets: glow, alpha: 0.95, duration: 70, yoyo: true });
    this.tweens.add({ targets: p, displayHeight: PH * 0.7, duration: 60, yoyo: true });
  }

  private point(mine: boolean): void {
    if (this.online) { this.hostPoint(mine); return; }
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

  // ================================================================ online two-player
  // Host: runs the ball, scoring and serves; its paddle is "me", the guest's paddle is "ai".
  // Guest: moves its own paddle locally, sends it ('in'), and renders the host's snapshots ('st'),
  // predicting the ball between snapshots and blending towards the host's state.

  private setupOnline(): void {
    if (this.host) {
      net.onScene(this, 'in', (d: { x: number; v: number }) => {
        this.remoteX = 720 - d.x; this.remoteV = -d.v; this.remoteAt = this.time.now;
      });
      net.onScene(this, 'pi', (d: unknown) => net.send('po', d));
    } else {
      net.onScene(this, 'st', (d: Snap) => this.applySnap(d));
      net.onScene(this, 'po', (d: { t: number }) => {
        const rtt = (this.time.now - d.t) / 1000;
        if (rtt >= 0 && rtt < 1) this.lat = Phaser.Math.Linear(this.lat, rtt / 2, 0.5);
      });
    }
  }

  /** Host → guest: ball, host paddle, score, live flag, rally count (host coordinates). */
  private sendSnap(): void {
    const r = Math.round;
    net.send('st', {
      b: [r(this.ball.x), r(this.ball.y), r(this.vx), r(this.vy), r(this.spin * 1000)],
      p: [r(this.me.x), r(this.meVel)],
      k: [this.myPts, this.aiPts],
      l: this.live ? 1 : 0,
      r: this.rally,
    });
  }

  private updateOnline(dt: number): void {
    const half = PW / 2;
    this.movePlayer(dt);

    // the other player's paddle: last report, extrapolated a little and smoothed
    const age = Math.min(0.15, (this.time.now - this.remoteAt) / 1000 + (this.host ? 0 : this.lat));
    const target = Phaser.Math.Clamp(this.remoteX + this.remoteV * age, L + half, R - half);
    const aiPrev = this.ai.x;
    this.ai.x += (target - this.ai.x) * Math.min(1, dt * 22);
    this.ai.x = Phaser.Math.Clamp(this.ai.x, L + half, R - half);
    this.aiVel = Phaser.Math.Linear(this.aiVel, (this.ai.x - aiPrev) / Math.max(dt, 0.001), 0.5);
    this.meGlow.x = this.me.x; this.aiGlow.x = this.ai.x;

    // fixed real-time rate (the scene delta is clamped, so it can lag behind on slow frames)
    const now = this.time.now;
    if (now - this.sendT >= SEND_MS) {
      this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS);
      if (this.host) this.sendSnap();
      else net.send('in', { x: Math.round(this.me.x), v: Math.round(this.meVel) });
    }
    if (!this.host && now >= this.pingT) { this.pingT = now + 1000; net.send('pi', { t: Math.round(now) }); }

    this.ballGlow.setVisible(this.ball.scaleX > 0.05);
    if (this.live) {
      const steps = Math.ceil((Math.hypot(this.vx, this.vy) * dt) / 8);
      if (this.host) for (let i = 0; i < steps && this.live; i++) this.stepBall(dt / steps);
      else {
        for (let i = 0; i < steps; i++) this.predictStep(dt / steps);
        const k = Math.min(1, dt * 12);
        this.ball.x += this.corrX * k; this.ball.y += this.corrY * k;
        this.corrX -= this.corrX * k; this.corrY -= this.corrY * k;
      }
      this.spin *= Math.exp(-1.8 * dt);
      this.ball.rotation += this.spin * dt * 20 + dt * 2;
      this.trail.setParticleTint(Math.abs(this.spin) > 0.25 ? 0xff4fa3 : 0xffd23f);
      this.trail.emitParticleAt(this.ball.x, this.ball.y);
    }
    this.ballGlow.setPosition(this.ball.x, this.ball.y);
  }

  /** Host: a point in the online match. `mine` = the host scored. */
  private hostPoint(mine: boolean): void {
    this.live = false;
    if (mine) this.myPts++; else this.aiPts++;
    this.pointFx(mine);
    this.sendSnap();
    if (this.myPts >= TO_WIN || this.aiPts >= TO_WIN) { this.finishOnline(); return; }
    this.serve(mine ? -1 : 1);
    this.sendSnap();
  }

  private pointFx(mine: boolean): void {
    const b = this.ball;
    burst(this, b.x, b.y, mine ? [0x3ee6ff, 0xffd23f, 0xffffff] : [0xff4fa3, 0xec3013], 40, 450);
    shake(this, mine ? 0.008 : 0.018, 220);
    b.setScale(0);
    if (mine) {
      this.sfx('goal', { volume: 0.45 });
      flash(this, 0x3ee6ff, 120);
      popup(this, 360, this.mid + 60, t('youPoint'), '#3ee6ff', 34);
    } else {
      this.sfx('miss', { volume: 0.45 });
      flash(this, 0xec3013, 150);
      popup(this, 360, this.mid + 60, t('cpuPoint'), '#ec3013', 34);
    }
    this.setScore(this.myPts);
    this.updateHud();
    const txtObj = mine ? this.meText : this.aiText;
    txtObj.setAlpha(0.9).setScale(1.4);
    this.tweens.add({ targets: txtObj, alpha: 0.28, scale: 1, duration: 600 });
  }

  /** Both sides: the score reached 7. */
  private finishOnline(): void {
    const win = this.myPts >= TO_WIN;
    if (win) {
      this.sfx('match', { volume: 0.5 });
      for (let i = 0; i < 4; i++) this.time.delayedCall(i * 150, () => burst(this, rng.int(100, 620), rng.int(400, 900), [0xffd23f, 0x3ee6ff, 0xff4fa3], 30, 400));
    } else this.sfx('lose', { volume: 0.5 });
    this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 1100 });
  }

  /** Guest: a host snapshot arrived (host coordinates → mirrored local view). */
  private applySnap(d: Snap): void {
    if (this.isOver || !d?.b) return;
    const now = this.time.now;
    const bx = 720 - d.b[0], by = MIRROR_Y - d.b[1], bvx = -d.b[2], bvy = -d.b[3], bspin = -d.b[4] / 1000;
    this.remoteX = 720 - d.p[0]; this.remoteV = -d.p[1]; this.remoteAt = now;

    const me = d.k[1], opp = d.k[0];
    if (me !== this.myPts || opp !== this.aiPts) {
      const mine = me > this.myPts;
      this.myPts = me; this.aiPts = opp;
      this.live = false;
      this.pointFx(mine);
      if (me >= TO_WIN || opp >= TO_WIN) { this.finishOnline(); return; }
      this.ball.setPosition(360, this.mid);
      this.tweens.add({ targets: this.ball, displayWidth: BALL_R * 2, displayHeight: BALL_R * 2, duration: 300, ease: 'Back.easeOut' });
    }

    const wasLive = this.live;
    this.live = !!d.l;
    if (d.r < this.seenRally) this.seenRally = d.r;
    if (!this.live) {
      this.ball.setPosition(bx, by);
      this.vx = this.vy = 0; this.corrX = this.corrY = 0;
      return;
    }
    // the host registered a paddle hit we did not predict: show it now
    if (d.r > this.seenRally) {
      if (now - this.localHitT > 300) {
        const mine = bvy < 0;
        this.hitFx(mine ? this.me : this.ai, mine ? ME_Y : AI_Y, mine);
      }
      this.seenRally = d.r;
    }
    // where the ball is on the host right now: advance the snapshot by the one-way latency
    const s = { x: bx, y: by, vx: bvx, vy: bvy, spin: bspin };
    const n = Math.ceil(this.lat / 0.008);
    for (let i = 0; i < n; i++) this.advance(s, this.lat / n);
    if (!wasLive) {
      this.ball.setPosition(s.x, s.y);
      this.vx = s.vx; this.vy = s.vy; this.spin = s.spin; this.corrX = this.corrY = 0;
      this.sfx('serve', { volume: 0.35 });
      return;
    }
    // we predicted a paddle bounce the host has not confirmed yet: keep our prediction a moment
    if (now - this.localHitT < 150 + this.lat * 2000 && Math.sign(s.vy) !== Math.sign(this.vy)) return;
    this.vx = s.vx; this.vy = s.vy; this.spin = s.spin;
    const ex = s.x - this.ball.x, ey = s.y - this.ball.y;
    if (Math.hypot(ex, ey) > 140) { this.ball.setPosition(s.x, s.y); this.corrX = this.corrY = 0; }
    else { this.corrX = ex; this.corrY = ey; }
  }

  /** Free flight with wall bounces only (latency compensation). */
  private advance(s: { x: number; y: number; vx: number; vy: number; spin: number }, dt: number): void {
    s.vx += s.spin * 1100 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < L + BALL_R) { s.x = L + BALL_R; s.vx = Math.abs(s.vx); s.spin *= -0.5; }
    if (s.x > R - BALL_R) { s.x = R - BALL_R; s.vx = -Math.abs(s.vx); s.spin *= -0.5; }
    s.spin *= Math.exp(-1.8 * dt);
  }

  /** Guest: local prediction of the ball between snapshots (no scoring; the host decides). */
  private predictStep(dt: number): void {
    const b = this.ball;
    this.vx += this.spin * 1100 * dt;
    b.x += this.vx * dt;
    b.y += this.vy * dt;
    if (b.x < L + BALL_R) { b.x = L + BALL_R; this.vx = Math.abs(this.vx); this.wallHit(); }
    if (b.x > R - BALL_R) { b.x = R - BALL_R; this.vx = -Math.abs(this.vx); this.wallHit(); }
    if (this.vy > 0 && this.overPaddle(this.me, ME_Y)) this.predictBounce(this.me, ME_Y, -1, this.meVel, true);
    else if (this.vy < 0 && this.overPaddle(this.ai, AI_Y)) this.predictBounce(this.ai, AI_Y, 1, this.aiVel, false);
    // past a goal line: hold the ball there until the host's verdict arrives
    if (b.y < TOP_GOAL - 30 || b.y > this.botGoal + 30) { b.y = Phaser.Math.Clamp(b.y, TOP_GOAL - 30, this.botGoal + 30); this.vx = this.vy = 0; }
  }

  private predictBounce(p: Phaser.GameObjects.Image, py: number, dir: number, pvel: number, mine: boolean): void {
    const off = Phaser.Math.Clamp((this.ball.x - p.x) / (PW / 2), -1, 1);
    const sp = Math.min(850 + this.round * 80, Math.hypot(this.vx, this.vy) * 1.045);
    const a = Phaser.Math.DegToRad(off * 52);
    this.vx = Math.sin(a) * sp;
    this.vy = Math.cos(a) * sp * dir;
    this.spin = Phaser.Math.Clamp(pvel / 1400, -1, 1);
    this.ball.y = py + dir * (PH / 2 + BALL_R + 1);
    this.localHitT = this.time.now;
    this.hitFx(p, py, mine);
    if (mine && Math.abs(this.spin) > 0.45) popup(this, this.ball.x, py - 60, t('spin'), '#ff4fa3', 20);
    if (sp > 900) shake(this, 0.003, 60);
  }
}
