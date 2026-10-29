import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';

const G = 2300;          // gravity px/s²
const R = 31;            // ball radius
const RW = 64;           // rim half width
const FLOOR = 1180;
const START_TIME = 45;

/** Side-view hoop: backboard, rim and net. `swing` 0..1 stretches the net after a basket. */
export function drawHoop(g: Phaser.GameObjects.Graphics, hx: number, hy: number, swing: number, sway: number): void {
  // pole + arm
  g.fillStyle(0x55525e).fillRect(hx + RW + 30, hy - 120, 10, 30);
  // backboard
  g.fillStyle(0x000000, 0.35).fillRect(hx + RW + 14, hy - 146, 16, 186);
  g.fillStyle(0xf3f2f2).fillRect(hx + RW + 10, hy - 150, 14, 186);
  g.fillStyle(0xec3013).fillRect(hx + RW + 10, hy - 70, 14, 50);
  // net
  const drop = 78 + swing * 26;
  const narrow = 26 - swing * 8;
  g.lineStyle(3, 0xffffff, 0.9);
  for (let i = 0; i <= 6; i++) {
    const tx = hx - RW + (i / 6) * RW * 2;
    const bx = hx - RW + narrow + (i / 6) * (RW - narrow) * 2 + sway;
    g.lineBetween(tx, hy, bx, hy + drop);
  }
  for (let k = 1; k <= 3; k++) {
    const f = k / 3.4, y = hy + drop * f, inset = narrow * f;
    g.lineBetween(hx - RW + inset + sway * f, y, hx + RW - inset + sway * f, y);
  }
  // rim (side view: a thick orange bar with bright end caps)
  g.fillStyle(0xd04a00).fillRect(hx - RW - 4, hy - 5, RW * 2 + 18, 10);
  g.fillStyle(0xff7a1a).fillRect(hx - RW - 4, hy - 5, RW * 2 + 18, 4);
  g.fillStyle(0xffb066).fillCircle(hx - RW, hy, 7);
}

interface Rect { x: number; y: number; w: number; h: number }

export class PlayScene extends ArcadeScene {
  private ball!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private hoopG!: Phaser.GameObjects.Graphics;
  private aimG!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private bx = 0; private by = 0; private vx = 0; private vy = 0;
  private flying = false;
  private ready = false;
  private flightT = 0;
  private scoredThisShot = false;
  private rimTouched = false;
  private boardTouched = false;
  private hx = 360; private hy = 420; private hoopT = 0;
  private netSwing = 0; private netSway = 0;
  private aimAngle = 0;    // degrees from vertical
  private aimPower = 0.62; // 0..1
  private aiming = false;
  private dragStart: Phaser.Math.Vector2 | null = null;
  private timeLeft = START_TIME;
  private lastTick = 0;
  private baskets = 0;
  private streak = 0;
  private level = 1;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  createGame(): void {
    const { width } = this.scale;
    this.bx = 0; this.by = 0; this.vx = 0; this.vy = 0;
    this.flying = false; this.ready = false; this.flightT = 0; this.scoredThisShot = false; this.rimTouched = false; this.boardTouched = false;
    this.hx = width / 2; this.hy = 420; this.hoopT = 0; this.netSwing = 0; this.netSway = 0;
    this.aimAngle = 0; this.aimPower = 0.4; this.aiming = false; this.dragStart = null;
    this.timeLeft = START_TIME; this.lastTick = 0; this.baskets = 0; this.streak = 0; this.level = 1;
    this.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.drawCourt();
    this.hoopG = this.add.graphics().setDepth(6);
    this.aimG = this.add.graphics().setDepth(4);
    this.shadow = this.add.ellipse(0, FLOOR + 8, 60, 14, 0x000000, 0.35).setDepth(2);
    this.ball = this.add.image(0, 0, 'ball').setScale((R * 2.1) / 18).setDepth(5);

    // scoreboard
    this.add.rectangle(width / 2, 150, 250, 92, 0x0a0a0a).setStrokeStyle(5, 0x55525e).setDepth(1);
    this.clockText = txt(this, width / 2, 152, '45', { title: true, size: 52, color: '#ec3013', strokeThickness: 0 }).setDepth(2);
    this.infoText = txt(this, width / 2, 222, '', { title: true, size: 18, color: '#ffd23f' }).setDepth(2);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT), up: kb.addKey(K.UP), down: kb.addKey(K.DOWN),
      a: kb.addKey(K.A), d: kb.addKey(K.D), w: kb.addKey(K.W), s: kb.addKey(K.S),
    };
    kb.on('keydown-SPACE', () => this.shoot());
    kb.on('keydown-Z', () => this.shoot());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 140 && p.y < 140) return;
      this.dragStart = new Phaser.Math.Vector2(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || !p.isDown) return;
      this.setAimFromDrag(p.x - this.dragStart.x, p.y - this.dragStart.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart) return;
      const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
      this.dragStart = null;
      if (dy < -30 && this.setAimFromDrag(dx, dy)) this.shoot();
      else this.aiming = false;
    });

    this.hud.setRight(`${t('level')} 1`);
    this.spawnBall();
  }

  private drawCourt(): void {
    const { width, height } = this.scale;
    if (this.textures.exists('hs-court')) { this.add.image(0, 0, 'hs-court').setOrigin(0).setDepth(0); return; }
    const g = this.make.graphics({}, false);
    // wall
    g.fillGradientStyle(0x2a1f3d, 0x2a1f3d, 0x3d2a4a, 0x3d2a4a).fillRect(0, 0, width, FLOOR - 120);
    g.lineStyle(2, 0xffffff, 0.05);
    for (let y = 40; y < FLOOR - 120; y += 40) {
      g.lineBetween(0, y, width, y);
      for (let x = (y / 40) % 2 ? 0 : 40; x < width; x += 80) g.lineBetween(x, y, x, y + 40);
    }
    // padded wall strip + crowd silhouettes
    g.fillStyle(0x1a1226).fillRect(0, FLOOR - 220, width, 100);
    for (let i = 0; i < 18; i++) {
      const cx = 20 + i * 40 + rng.int(-6, 6), cy = FLOOR - 190 + rng.int(-8, 8);
      g.fillStyle(rng.pick([0x3a2d55, 0x45365e, 0x2e2444]));
      g.fillCircle(cx, cy, 14).fillRect(cx - 16, cy + 10, 32, 50);
    }
    g.fillStyle(0xec3013).fillRect(0, FLOOR - 124, width, 8);
    // wooden floor in perspective
    g.fillStyle(0xc98a4b).fillRect(0, FLOOR - 116, width, height - FLOOR + 116);
    g.lineStyle(2, 0x8f5a2a, 0.6);
    for (let y = FLOOR - 116; y < height; y += 22) g.lineBetween(0, y, width, y);
    for (let i = -10; i <= 10; i++) g.lineBetween(width / 2 + i * 50, FLOOR - 116, width / 2 + i * 130, height);
    g.lineStyle(6, 0xffffff, 0.8).strokeEllipse(width / 2, FLOOR + 20, 520, 120);
    g.generateTexture('hs-court', 720, 1280);
    g.destroy();
    this.add.image(0, 0, 'hs-court').setOrigin(0).setDepth(0);
  }

  private spawnBall(): void {
    const { width } = this.scale;
    const spread = this.level >= 2 ? Math.min(250, 80 + this.level * 30) : 0;
    this.bx = width / 2 + (spread ? rng.int(-spread, spread) : 0);
    this.by = 1040 - (this.level >= 4 ? rng.int(0, 120) : 0);
    this.vx = this.vy = 0;
    this.flying = false; this.ready = true; this.flightT = 0;
    this.scoredThisShot = false; this.rimTouched = false; this.boardTouched = false;
    this.ball.setPosition(this.bx, this.by).setAngle(0).setScale(0.2 * (R * 2.1) / 18).setAlpha(1);
    this.tweens.add({ targets: this.ball, scale: (R * 2.1) / 18, duration: 250, ease: 'Back.easeOut' });
  }

  /** Swipe vector → aim. Returns false if the swipe is too short to be a shot. */
  private setAimFromDrag(dx: number, dy: number): boolean {
    const len = Math.hypot(dx, dy);
    if (dy > -10 || len < 30) { this.aiming = false; return false; }
    this.aiming = true;
    this.aimAngle = Phaser.Math.Clamp(Phaser.Math.RadToDeg(Math.atan2(dx, -dy)), -50, 50);
    this.aimPower = Phaser.Math.Clamp((len - 30) / 330, 0, 1);
    return true;
  }

  private launchVel(): { vx: number; vy: number } {
    const speed = 1150 + this.aimPower * 1150;
    const a = Phaser.Math.DegToRad(this.aimAngle);
    return { vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed };
  }

  private shoot(): void {
    if (!this.ready || this.flying || this.isOver || this.timeLeft <= 0) return;
    this.ready = false;
    const v = this.launchVel();
    this.vx = v.vx; this.vy = v.vy;
    this.flying = true; this.aiming = false; this.flightT = 0;
    this.aimG.clear();
    this.sfxAt('throw', this.bx, { volume: 0.45 });
    burst(this, this.bx, this.by + R, [0xffffff, 0xc98a4b], 8, 140);
  }

  private hoopRects(): Rect[] {
    return [{ x: this.hx + RW + 10, y: this.hy - 150, w: 14, h: 186 }];
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width } = this.scale;

    // clock
    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      const s = Math.ceil(this.timeLeft);
      if (s <= 5 && s !== this.lastTick && s > 0) { this.lastTick = s; this.sfx('tick', { volume: s <= 2 ? 0.6 : 0.45, rate: s <= 2 ? 1.12 : 1 }); this.clockText.setScale(1.3); this.tweens.add({ targets: this.clockText, scale: 1, duration: 200 }); }
      if (this.timeLeft === 0) this.sfx('buzzer', { volume: 0.7, exact: true });
    }
    this.clockText.setText(String(Math.ceil(this.timeLeft))).setColor(this.timeLeft <= 5 ? '#ffd23f' : '#ec3013');
    if (this.timeLeft <= 0 && !this.flying) { this.endGame({ title: t('timeUp'), delay: 700 }); return; }

    // moving hoop from level 3
    this.hoopT += dt;
    if (this.level >= 3) {
      const amp = Math.min(200, 70 + (this.level - 3) * 30);
      const spd = Math.min(2.2, 0.8 + (this.level - 3) * 0.22);
      this.hx = width / 2 - 30 + Math.sin(this.hoopT * spd) * amp;
      this.hy = 420 + (this.level >= 5 ? Math.sin(this.hoopT * spd * 0.7) * 60 : 0);
    }
    this.netSwing = Math.max(0, this.netSwing - dt * 2.5);
    this.netSway *= Math.pow(0.02, dt);

    // keyboard aim
    if (this.ready) {
      const k = this.keys;
      const ax = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ay = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
      if (ax || ay) {
        this.aiming = true;
        this.aimAngle = Phaser.Math.Clamp(this.aimAngle + ax * 40 * dt, -50, 50);
        this.aimPower = Phaser.Math.Clamp(this.aimPower + ay * 0.5 * dt, 0, 1);
      }
      this.drawAim();
    }

    if (this.flying) this.stepBall(dt);

    this.ball.setPosition(this.bx, this.by);
    const hgt = Phaser.Math.Clamp((FLOOR - this.by) / 900, 0, 1);
    this.shadow.setPosition(this.bx, FLOOR + 8).setScale(1 - hgt * 0.6).setAlpha(1 - hgt * 0.7);
    this.hoopG.clear();
    drawHoop(this.hoopG, this.hx, this.hy, this.netSwing, this.netSway);
  }

  private drawAim(): void {
    const g = this.aimG;
    g.clear();
    if (!this.aiming) {
      // idle hint: pulsing arrow above the ball
      const a = 0.4 + Math.sin(this.elapsed * 6) * 0.3;
      g.fillStyle(0xffffff, a).fillTriangle(this.bx - 16, this.by - R - 20, this.bx + 16, this.by - R - 20, this.bx, this.by - R - 44);
      return;
    }
    const v = this.launchVel();
    const preview = Math.max(0.12, 0.34 - (this.level - 1) * 0.03);
    for (let i = 1; i <= 9; i++) {
      const tt = (i / 9) * preview;
      const x = this.bx + v.vx * tt, y = this.by + v.vy * tt + 0.5 * G * tt * tt;
      g.fillStyle(0xffd23f, 1 - i / 11).fillCircle(x, y, 9 - i * 0.6);
    }
    // power bar
    g.fillStyle(0x000000, 0.5).fillRect(this.bx - 60, this.by + R + 18, 120, 14);
    g.fillStyle(Phaser.Display.Color.GetColor(255, Math.round(210 - this.aimPower * 160), 60)).fillRect(this.bx - 58, this.by + R + 20, 116 * this.aimPower, 10);
  }

  private stepBall(dt: number): void {
    const { width } = this.scale;
    this.flightT += dt;
    const steps = 5, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const prevY = this.by;
      this.vy += G * h;
      this.bx += this.vx * h;
      this.by += this.vy * h;
      // rim end caps
      for (const px of [this.hx - RW, this.hx + RW]) this.collidePoint(px, this.hy, 7, 0.55);
      for (const r of this.hoopRects()) this.collideRect(r, 0.65);
      // basket: crossing the rim line downward between the caps
      if (!this.scoredThisShot && prevY < this.hy && this.by >= this.hy && this.vy > 0 && Math.abs(this.bx - this.hx) < RW - 8) {
        this.scoredThisShot = true;
        this.onBasket();
      }
      // walls / floor
      if (this.bx < R) { this.bx = R; this.vx = Math.abs(this.vx) * 0.7; }
      if (this.bx > width - R) { this.bx = width - R; this.vx = -Math.abs(this.vx) * 0.7; }
      if (this.by > FLOOR - R && this.vy > 0) {
        this.by = FLOOR - R;
        if (this.vy > 250) this.sfxAt(rng.pick(['bounce', 'bounce2']), this.bx, { volume: Math.min(0.8, this.vy / 2000) });
        this.vy = -this.vy * 0.55; this.vx *= 0.8;
        if (!this.scoredThisShot && this.flightT > 0.2) this.onMiss();
      }
    }
    this.ball.angle += this.vx * dt * 0.4;
    if ((this.scoredThisShot && this.by > this.hy + 140 && this.flightT > 0.6) || this.flightT > 3.2 || (Math.abs(this.vy) < 120 && this.by >= FLOOR - R - 2)) {
      if (!this.scoredThisShot) this.onMiss();
      this.flying = false;
      this.tweens.add({ targets: this.ball, alpha: 0, duration: 120, onComplete: () => { if (!this.isOver) this.spawnBall(); } });
      this.flightT = -99; // prevent double handling while fading
    }
  }

  private collidePoint(px: number, py: number, pr: number, e: number): void {
    const dx = this.bx - px, dy = this.by - py, d = Math.hypot(dx, dy), min = R + pr;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d;
    this.bx = px + nx * min; this.by = py + ny * min;
    const vn = this.vx * nx + this.vy * ny;
    if (vn < 0) {
      this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
      if (-vn > 120) { this.sfxAt(rng.pick(['rim', 'rim2', 'rim3']), px, { volume: Math.min(0.7, -vn / 1200) }); this.netSway = rng.int(-10, 10); }
      this.rimTouched = true;
    }
  }

  private collideRect(r: Rect, e: number): void {
    const cx = Phaser.Math.Clamp(this.bx, r.x, r.x + r.w), cy = Phaser.Math.Clamp(this.by, r.y, r.y + r.h);
    const dx = this.bx - cx, dy = this.by - cy, d = Math.hypot(dx, dy);
    if (d >= R || d === 0) return;
    const nx = dx / d, ny = dy / d;
    this.bx = cx + nx * R; this.by = cy + ny * R;
    const vn = this.vx * nx + this.vy * ny;
    if (vn < 0) {
      this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
      if (-vn > 120) this.sfxAt(rng.pick(['board', 'board2']), this.bx, { volume: Math.min(0.65, 0.3 - vn / 2400) });
      this.boardTouched = true;
    }
  }

  private onBasket(): void {
    this.baskets++;
    this.streak++;
    const swish = !this.rimTouched && !this.boardTouched;
    const buzzer = this.timeLeft <= 0;
    let pts = swish ? 3 : 2;
    pts *= 10 * Math.min(5, this.streak);
    if (buzzer) pts *= 2;
    this.addScore(pts, this.hx, this.hy - 60);
    const bonus = swish ? 3 : 2;
    if (!buzzer) this.timeLeft += bonus;
    this.netSwing = 1;
    this.sfxAt('net', this.hx, { volume: swish ? 0.5 : 0.35 });
    // The basket sound climbs with the streak.
    this.sfxAt(swish ? 'swish' : 'score', this.hx, { volume: 0.6, rate: 1 + (Math.min(5, this.streak) - 1) * 0.05 });
    if (buzzer) this.sfx('beater', { volume: 0.75, exact: true });
    burst(this, this.hx, this.hy + 40, [0xffd23f, 0xff7a1a, 0xffffff], swish ? 30 : 18, 300);
    if (this.streak >= 3) shake(this, 0.006, 120);
    const msg = buzzer ? t('buzzer') : swish ? t('swish') : this.boardTouched ? t('bank') : '';
    if (msg) popup(this, this.scale.width / 2, this.hy + 170, msg, swish ? '#5dff7a' : '#3ee6ff', 30);
    if (buzzer) flash(this, 0xffd23f, 200);
    this.infoText.setText(`${this.streak >= 2 ? t('streak', { n: Math.min(5, this.streak) }) + '  ' : ''}${buzzer ? '' : t('secs', { n: bonus })}`);
    this.infoText.setAlpha(1);
    this.tweens.killTweensOf(this.infoText);
    this.tweens.add({ targets: this.infoText, alpha: 0, delay: 1100, duration: 400 });

    const newLevel = 1 + Math.floor(this.baskets / 4);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.hud.setRight(`${t('level')} ${this.level}`);
      this.time.delayedCall(350, () => {
        this.sfx('levelup', { volume: 0.6 });
        const lt = txt(this, this.scale.width / 2, 640, t('levelUp', { n: this.level }), { title: true, size: 40, color: '#ffd23f' }).setDepth(20).setScale(0.3);
        this.tweens.add({ targets: lt, scale: 1, duration: 300, ease: 'Back.easeOut', hold: 600, yoyo: true, onComplete: () => lt.destroy() });
      });
    }
  }

  private onMiss(): void {
    if (this.scoredThisShot || this.flightT < 0) return;
    this.scoredThisShot = true; // handled
    if (this.streak >= 2) { this.sfxAt('miss', this.bx, { volume: 0.4 }); popup(this, this.bx, this.by - 60, '×', '#ec3013', 32); }
    this.streak = 0;
  }
}
