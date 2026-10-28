import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, t, rng, ensurePixel, net, upper } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

// Table (720 x 1280 world)
const L = 40, R = 680, T = 140, B = 1236, MID = (T + B) / 2;
const CR = 70;                                // rounded corner radius
const GOAL_L = 250, GOAL_R = 470;             // goal mouth
const PUCK_R = 28, MAL_R = 46;
const MAX_PUCK = 1600, SUB = 6;
const WIN_GOALS = 7;
// Online match: the table is symmetric, so the guest sees the host's table rotated by 180°
// (x' = 720 - x, y' = MIRROR_Y - y) with its own mallet at the bottom.
const MIRROR_Y = T + B;
const SEND_MS = 50;            // ~20 messages per second each way
const REMOTE_SPEED = 3200;     // the remote mallet follows its reports quickly

interface Snap { p: number[]; m: number[]; k: number[]; l: number; h: number }

export function makeHockeyTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('ah-puck')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffd23f, 0.25).fillCircle(36, 36, 36);
  g.fillStyle(0x15151f, 1).fillCircle(36, 36, 28);
  g.lineStyle(5, 0xffd23f, 1).strokeCircle(36, 36, 24);
  g.fillStyle(0xffffff, 0.35).fillCircle(29, 28, 6);
  g.generateTexture('ah-puck', 72, 72);
  const mallet = (key: string, col: number, dark: number) => {
    g.clear();
    g.fillStyle(col, 0.22).fillCircle(56, 56, 56);
    g.fillStyle(dark, 1).fillCircle(56, 56, 46);
    g.fillStyle(col, 1).fillCircle(56, 56, 40);
    g.fillStyle(dark, 1).fillCircle(56, 56, 22);
    g.fillStyle(col, 1).fillCircle(56, 56, 17);
    g.fillStyle(0xffffff, 0.55).fillCircle(50, 49, 7);
    g.generateTexture(key, 112, 112);
  };
  mallet('ah-mallet-red', 0xff4f5e, 0x8f1020);
  mallet('ah-mallet-blue', 0x3ee6ff, 0x0b5c78);
  g.destroy();
}

interface Mallet { x: number; y: number; vx: number; vy: number; img: Phaser.GameObjects.Image }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private tableG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private puck!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private me!: Mallet;
  private cpu!: Mallet;
  private myGoalsText!: Phaser.GameObjects.Text;
  private cpuGoalsText!: Phaser.GameObjects.Text;
  private px = 360; private py = MID; private pvx = 0; private pvy = 0;
  private myGoals = 0;
  private cpuGoals = 0;
  private live = false;
  private pointerId = -1;
  private tx = 360; private ty = 1000;
  private aiTx = 360; private aiTy = T + 100;
  private aiThink = 0;
  private aiNoise = 0;
  private aiAimX = 360;
  private skill = 0.45;
  private wallSfx = 0;
  private hitSfx = 0;
  private lastHitBy: 'me' | 'cpu' | null = null;
  private glow = 0;
  private goalFlash = 0;
  private goalFlashTop = true;
  // online
  private online = false;
  private host = true;
  private sendT = 0;
  private pingT = 0;
  private lat = 0.04;               // estimated one-way latency (s), guest only
  private rx = 360; private ry = T + 150; private rvx = 0; private rvy = 0; private rAt = 0;
  private corrX = 0; private corrY = 0;
  private localHitT = -1e9;
  private hits = 0;
  private seenHits = 0;
  private held = false;
  private quiet = false;

  createGame(): void {
    freshTextCanvases(this);
    makeHockeyTextures(this);
    this.px = 360; this.py = MID; this.pvx = this.pvy = 0;
    this.myGoals = 0; this.cpuGoals = 0; this.live = false; this.pointerId = -1;
    this.tx = 360; this.ty = 1000; this.aiTx = 360; this.aiTy = T + 100; this.aiThink = 0; this.aiNoise = 0; this.aiAimX = 360;
    this.skill = 0.45; this.wallSfx = 0; this.hitSfx = 0; this.lastHitBy = null; this.glow = 0; this.goalFlash = 0;
    this.online = net.active; this.host = net.isHost;
    this.sendT = 0; this.pingT = 0; this.lat = 0.04; this.rx = 360; this.ry = T + 150; this.rvx = this.rvy = 0; this.rAt = 0;
    this.corrX = this.corrY = 0; this.localHitT = -1e9; this.hits = 0; this.seenHits = 0; this.held = false; this.quiet = false;

    this.tableG = this.add.graphics().setDepth(0);
    this.fxG = this.add.graphics().setDepth(1);
    this.drawTable();
    this.cpuGoalsText = ftxt(this, 96, MID - 70, '0', { title: true, size: 60, color: '#3ee6ff' }).setAlpha(0.55).setDepth(1);
    this.myGoalsText = ftxt(this, 96, MID + 70, '0', { title: true, size: 60, color: '#ff4f5e' }).setAlpha(0.55).setDepth(1);
    const oppLabel = this.online ? upper((net.peerName || t('opponent')).slice(0, 8)) : t('cpu');
    ftxt(this, 624, MID - 40, oppLabel, { title: true, size: 18, color: '#3ee6ff' }).setAlpha(0.6).setDepth(1);
    ftxt(this, 624, MID + 40, t('you'), { title: true, size: 18, color: '#ff4f5e' }).setAlpha(0.6).setDepth(1);
    this.hud.setRight(t('firstTo'));

    const px = ensurePixel(this);
    this.trail = this.add.particles(0, 0, px, {
      speed: 0, lifespan: 260, scale: { start: 3.2, end: 0 }, alpha: { start: 0.55, end: 0 }, tint: 0xffd23f, frequency: 16, emitting: false,
    }).setDepth(2);
    this.puck = this.add.image(this.px, this.py, 'ah-puck').setDepth(3);
    this.me = { x: 360, y: B - 150, vx: 0, vy: 0, img: this.add.image(360, B - 150, 'ah-mallet-red').setDepth(4) };
    this.cpu = { x: 360, y: T + 150, vx: 0, vy: 0, img: this.add.image(360, T + 150, 'ah-mallet-blue').setDepth(4) };
    this.tx = this.me.x; this.ty = this.me.y;

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 590 && p.y < 140) return;
      this.pointerId = p.id;
      this.tx = p.x; this.ty = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId && p.isDown) { this.tx = p.x; this.ty = p.y; }
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.pointerId) this.pointerId = -1; };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);

    this.updateHud();
    if (this.online) this.setupOnline();
    if (!this.online || this.host) this.serve('me', 900);
  }

  // ---------------------------------------------------------------- drawing
  private drawTable(): void {
    const g = this.tableG;
    g.clear();
    g.fillStyle(0x0d1433, 1).fillRoundedRect(L, T, R - L, B - T, CR);
    // faint air-hole grid
    g.fillStyle(0x24305e, 1);
    for (let y = T + 30; y < B - 10; y += 38) for (let x = L + 30; x < R - 10; x += 38) g.fillCircle(x, y, 2);
    g.lineStyle(5, 0xff4fa3, 0.55).lineBetween(L, MID, R, MID).strokeCircle(360, MID, 90);
    g.fillStyle(0xff4fa3, 0.55).fillCircle(360, MID, 8);
    // goal creases
    g.lineStyle(5, 0x3ee6ff, 0.45).beginPath().arc(360, T, 150, 0, Math.PI, false).strokePath();
    g.lineStyle(5, 0xff4f5e, 0.45).beginPath().arc(360, B, 150, Math.PI, Math.PI * 2, false).strokePath();
    // rails
    g.lineStyle(10, 0x8b5cff, 1).strokeRoundedRect(L - 5, T - 5, R - L + 10, B - T + 10, CR + 5);
    // goal mouths
    g.fillStyle(0x000000, 1).fillRect(GOAL_L, T - 18, GOAL_R - GOAL_L, 22).fillRect(GOAL_L, B - 4, GOAL_R - GOAL_L, 22);
    g.fillStyle(0x3ee6ff, 1).fillCircle(GOAL_L, T, 9).fillCircle(GOAL_R, T, 9);
    g.fillStyle(0xff4f5e, 1).fillCircle(GOAL_L, B, 9).fillCircle(GOAL_R, B, 9);
  }

  private updateHud(): void {
    this.myGoalsText.setText(String(this.myGoals));
    this.cpuGoalsText.setText(String(this.cpuGoals));
  }

  // ---------------------------------------------------------------- flow
  private serve(to: 'me' | 'cpu', delay: number): void {
    this.live = false;
    this.pvx = this.pvy = 0;
    this.px = 360 + rng.int(-60, 60);
    this.py = to === 'me' ? MID + 170 : MID - 170;
    this.puck.setPosition(this.px, this.py).setScale(0).setAlpha(1);
    this.tweens.add({ targets: this.puck, scale: 1, duration: 350, delay: delay * 0.5, ease: 'Back.easeOut' });
    this.lastHitBy = null;
    this.trail.stop();
    if (this.myGoals === WIN_GOALS - 1 || this.cpuGoals === WIN_GOALS - 1) this.banner(t('matchPoint'), '#ffd23f', 36, delay * 0.4);
    this.time.delayedCall(delay, () => {
      if (this.isOver) return;
      this.live = true;
      this.sfx('serve', { volume: 0.5 });
      this.trail.start();
      if (this.online) this.sendSnap();
    });
  }

  private goal(mine: boolean): void {
    if (this.online) { this.hostGoal(mine); return; }
    this.live = false;
    this.trail.stop();
    const speed = Math.hypot(this.pvx, this.pvy);
    this.goalFlash = 1;
    this.goalFlashTop = mine;
    const gy = mine ? T : B;
    burst(this, this.px, gy, mine ? [0xff4f5e, 0xffd23f, 0xffffff] : [0x3ee6ff, 0xffffff], 60, 600);
    shake(this, 0.02, 380);
    this.tweens.add({ targets: this.puck, alpha: 0, scale: 0.4, duration: 250 });
    if (mine) {
      this.myGoals++;
      const bonus = Math.round(Math.max(0, speed - 700) / 12);
      this.addScore(100 + bonus);
      this.sfx('goal', { volume: 0.7 });
      softFlash(this, 0xff4f5e, 200);
      this.banner(t('goal'), '#ffd23f', 64);
      if (bonus > 10) fpopup(this, 360, MID + 80, t('power', { n: bonus }), '#ff4fa3', 24);
    } else {
      this.cpuGoals++;
      this.sfx('concede', { volume: 0.6 });
      softFlash(this, 0x3ee6ff, 200);
      this.banner(t('concede'), '#3ee6ff', 44);
    }
    // the AI adapts: it sharpens when you lead and eases off when it leads
    this.skill = Phaser.Math.Clamp(0.42 + 0.08 * (this.myGoals - this.cpuGoals) + 0.025 * (this.myGoals + this.cpuGoals), 0.25, 0.97);
    this.updateHud();
    const txt = mine ? this.myGoalsText : this.cpuGoalsText;
    txt.setScale(1.8).setAlpha(1);
    this.tweens.add({ targets: txt, scale: 1, alpha: 0.55, duration: 600, ease: 'Back.easeOut' });

    if (this.myGoals >= WIN_GOALS || this.cpuGoals >= WIN_GOALS) {
      const win = this.myGoals >= WIN_GOALS;
      if (win) this.addScore(1000 + (WIN_GOALS - this.cpuGoals) * 150);
      this.endGame({ win, delay: 1400 });
      return;
    }
    // reset mallets to their home spots and serve to whoever conceded
    this.serve(mine ? 'cpu' : 'me', 1300);
  }

  private banner(text: string, color: string, size: number, delay = 0): void {
    const a = ftxt(this, 360, MID, text, { title: true, size, color, strokeThickness: 10 }).setDepth(20).setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: a, scale: 1, alpha: 1, duration: 300, delay, ease: 'Back.easeOut' });
    this.tweens.add({ targets: a, alpha: 0, delay: delay + 950, duration: 250, onComplete: () => a.destroy() });
  }

  // ---------------------------------------------------------------- AI
  private thinkAI(): void {
    const s = this.skill;
    const inMyHalf = this.py < MID + 30;
    this.aiNoise = rng.int(-1, 1) * (1 - s) * 55;
    const rushing = this.pvy < -260;
    if (inMyHalf && !rushing) {
      if (this.py < T + MAL_R + PUCK_R + 6) {
        // puck pinned against our back wall: sweep it sideways, away from our goal mouth
        const out = this.px < 360 ? -1 : 1;
        this.aiTx = this.px + out * 90;
        this.aiTy = Math.max(this.py, T + MAL_R);
        if (Math.abs(this.cpu.x - this.px) < MAL_R + PUCK_R && (this.cpu.x - this.px) * out > 0) {
          // we are on the wrong side: step back towards the middle first
          this.aiTx = this.px - out * (MAL_R + PUCK_R + 20);
          this.aiTy = T + MAL_R + 70;
        }
      } else if (this.cpu.y > this.py - 20) {
        // puck is between us and our own goal: slide around it first
        const side = this.cpu.x < this.px ? -1 : 1;
        this.aiTx = this.px + side * (MAL_R + PUCK_R + 14);
        this.aiTy = this.py - 34;
      } else {
        // strike towards a spot in the player's goal
        if (rng.chance(0.35)) this.aiAimX = rng.int(GOAL_L + 30, GOAL_R - 30);
        // bank shots off the side walls once the AI is sharp
        let gx = this.aiAimX;
        if (s > 0.6 && rng.chance(0.3)) gx = this.px < 360 ? -this.aiAimX + 2 * L : 2 * R - this.aiAimX;
        const dx = gx - this.px, dy = B - this.py, d = Math.hypot(dx, dy) || 1;
        this.aiTx = this.px + (dx / d) * 150;
        this.aiTy = this.py + (dy / d) * 150;
      }
    } else {
      // defend like a goalie: guard line in front of our goal, read the puck's path
      const D = 100 + (1 - s) * 25, gy = T + D;
      let gx = 360 + (this.px - 360) * 0.45;
      if (this.pvy < -60 && this.py > gy) {
        const tHit = (gy - this.py) / this.pvy;
        const w = R - L - PUCK_R * 2;
        let x = this.px + this.pvx * tHit - (L + PUCK_R);
        x = ((x % (2 * w)) + 2 * w) % (2 * w);
        if (x > w) x = 2 * w - x;
        gx = Phaser.Math.Linear(gx, x + L + PUCK_R, 0.35 + s * 0.65);
      }
      this.aiTx = Phaser.Math.Clamp(gx, GOAL_L - 10, GOAL_R + 10);
      this.aiTy = gy;
    }
    this.aiTx += this.aiNoise;
  }

  // ---------------------------------------------------------------- physics
  private moveMallet(m: Mallet, tx: number, ty: number, maxSpeed: number, h: number, top: boolean): void {
    const minY = top ? T + MAL_R : MID + MAL_R;
    const maxY = top ? MID - MAL_R : B - MAL_R;
    tx = Phaser.Math.Clamp(tx, L + MAL_R, R - MAL_R);
    ty = Phaser.Math.Clamp(ty, minY, maxY);
    let dx = tx - m.x, dy = ty - m.y;
    const d = Math.hypot(dx, dy), step = maxSpeed * h;
    if (d > step) { dx = (dx / d) * step; dy = (dy / d) * step; }
    m.vx = dx / h; m.vy = dy / h;
    m.x += dx; m.y += dy;
  }

  private hitMallet(m: Mallet, who: 'me' | 'cpu'): void {
    const dx = this.px - m.x, dy = this.py - m.y, min = PUCK_R + MAL_R, d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 1, nx = d2 ? dx / d : 0, ny = d2 ? dy / d : -1;
    this.px = m.x + nx * min; this.py = m.y + ny * min;
    const rvx = this.pvx - m.vx, rvy = this.pvy - m.vy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = 0.9;
      this.pvx = m.vx + rvx - (1 + e) * vn * nx;
      this.pvy = m.vy + rvy - (1 + e) * vn * ny;
      const sp = Math.hypot(this.pvx, this.pvy);
      if (sp > MAX_PUCK) { this.pvx *= MAX_PUCK / sp; this.pvy *= MAX_PUCK / sp; }
      if (this.time.now - this.hitSfx > 70) {
        this.hitSfx = this.time.now;
        const hard = -vn > 900;
        this.sfx(hard ? 'hit2' : 'hit', { volume: Math.min(0.8, 0.25 + -vn / 2000) });
        burst(this, this.px - nx * PUCK_R, this.py - ny * PUCK_R, who === 'me' ? [0xff4f5e, 0xffffff] : [0x3ee6ff, 0xffffff], hard ? 16 : 7, hard ? 320 : 180);
        if (hard) shake(this, 0.006, 100);
        this.glow = 1;
        // a defensive touch near our goal while the puck was rushing in counts as a save
        if (who === 'me' && this.lastHitBy === 'cpu' && this.py > B - 260 && -vn > 700) fpopup(this, this.px, this.py - 60, t('save'), '#5dff7a', 20);
      }
      this.lastHitBy = who;
      this.hits++;
      if (this.online && !this.host) this.localHitT = this.time.now;
    }
  }

  private wallHit(speed: number, x: number, y: number): void {
    if (this.quiet || speed < 120 || this.time.now - this.wallSfx < 60) return;
    this.wallSfx = this.time.now;
    this.sfx('wall', { volume: Math.min(0.6, speed / 2600) });
    if (speed > 600) burst(this, x, y, [0x8b5cff, 0xffffff], 6, 160);
  }

  private stepPuck(h: number): boolean {
    this.px += this.pvx * h; this.py += this.pvy * h;
    const inMouth = this.px > GOAL_L && this.px < GOAL_R;
    // goals
    if (inMouth && (this.py < T - 4 || this.py > B + 4) && this.online && !this.host) {
      // guest: the host decides about goals; hold the puck in the mouth until it does
      if (!this.quiet) { this.held = true; this.pvx = this.pvy = 0; }
      this.py = Phaser.Math.Clamp(this.py, T - 30, B + 30);
      return true;
    }
    if (inMouth && this.py < T - 4) { this.goal(true); return true; }
    if (inMouth && this.py > B + 4) { this.goal(false); return true; }
    // side walls
    if (this.px < L + PUCK_R) { this.px = L + PUCK_R; this.wallHit(Math.abs(this.pvx), L, this.py); this.pvx = Math.abs(this.pvx) * 0.92; }
    if (this.px > R - PUCK_R) { this.px = R - PUCK_R; this.wallHit(Math.abs(this.pvx), R, this.py); this.pvx = -Math.abs(this.pvx) * 0.92; }
    // end walls (except the goal mouth)
    if (!inMouth) {
      if (this.py < T + PUCK_R) { this.py = T + PUCK_R; this.wallHit(Math.abs(this.pvy), this.px, T); this.pvy = Math.abs(this.pvy) * 0.92; }
      if (this.py > B - PUCK_R) { this.py = B - PUCK_R; this.wallHit(Math.abs(this.pvy), this.px, B); this.pvy = -Math.abs(this.pvy) * 0.92; }
    }
    // goal posts
    for (const [gx, gy] of [[GOAL_L, T], [GOAL_R, T], [GOAL_L, B], [GOAL_R, B]]) {
      const dx = this.px - gx, dy = this.py - gy, min = PUCK_R + 9, d = Math.hypot(dx, dy);
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d;
        this.px = gx + nx * min; this.py = gy + ny * min;
        const vn = this.pvx * nx + this.pvy * ny;
        if (vn < 0) { this.pvx -= 1.85 * vn * nx; this.pvy -= 1.85 * vn * ny; this.wallHit(-vn, gx, gy); }
      }
    }
    // rounded corners
    for (const [cx, cy] of [[L + CR, T + CR], [R - CR, T + CR], [L + CR, B - CR], [R - CR, B - CR]]) {
      const inX = cx < 360 ? this.px < cx : this.px > cx;
      const inY = cy < MID ? this.py < cy : this.py > cy;
      if (!inX || !inY) continue;
      const dx = this.px - cx, dy = this.py - cy, d = Math.hypot(dx, dy), max = CR - PUCK_R;
      if (d > max) {
        const nx = dx / d, ny = dy / d;
        this.px = cx + nx * max; this.py = cy + ny * max;
        const vn = this.pvx * nx + this.pvy * ny;
        if (vn > 0) { this.pvx -= 1.9 * vn * nx; this.pvy -= 1.9 * vn * ny; this.wallHit(vn, this.px, this.py); }
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.online) { this.updateOnline(dt); return; }
    const c = this.controls;
    // player target: finger or keys
    if (this.pointerId < 0 && (c.axisX || c.axisY)) {
      this.tx = this.me.x + c.axisX * 900 * dt * 1.5;
      this.ty = this.me.y + c.axisY * 900 * dt * 1.5;
    } else if (this.pointerId < 0) { this.tx = this.me.x; this.ty = this.me.y; }

    this.aiThink -= dt;
    if (this.aiThink <= 0) {
      this.aiThink = 0.13 - this.skill * 0.09;
      if (this.live) this.thinkAI();
      else { this.aiTx = 360; this.aiTy = T + 150; }
    }
    const aiSpeed = 620 + this.skill * 1100;
    const meSpeed = this.pointerId >= 0 ? 2600 : 900;

    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      this.moveMallet(this.me, this.tx, this.ty, meSpeed, h, false);
      this.moveMallet(this.cpu, this.aiTx, this.aiTy, aiSpeed, h, true);
      if (!this.live) continue;
      if (this.stepPuck(h)) break;
      this.hitMallet(this.me, 'me');
      this.hitMallet(this.cpu, 'cpu');
    }
    if (this.live) {
      const f = Math.exp(-0.22 * dt);
      this.pvx *= f; this.pvy *= f;
      // a dead puck creeps towards the side that has it so play never stalls
      if (Math.hypot(this.pvx, this.pvy) < 25 && Math.abs(this.py - MID) < PUCK_R + 4) this.pvy += (this.py < MID ? -1 : 1) * 60 * dt;
      this.puck.setPosition(this.px, this.py);
      this.trail.setPosition(this.px, this.py);
      this.puck.rotation += this.pvx * dt * 0.004;
    }
    this.me.img.setPosition(this.me.x, this.me.y);
    this.cpu.img.setPosition(this.cpu.x, this.cpu.y);
    this.drawFx(dt);
  }

  /** Puck glow ring + goal light. */
  private drawFx(dt: number): void {
    const g = this.fxG;
    g.clear();
    this.glow = Math.max(0, this.glow - dt * 4);
    if (this.glow > 0 && this.live) g.lineStyle(6, 0xffffff, this.glow * 0.7).strokeCircle(this.px, this.py, PUCK_R + 10 + (1 - this.glow) * 26);
    if (this.goalFlash > 0) {
      this.goalFlash = Math.max(0, this.goalFlash - dt * 1.2);
      const y = this.goalFlashTop ? T : B - 120;
      g.fillStyle(this.goalFlashTop ? 0xff4f5e : 0x3ee6ff, this.goalFlash * 0.35).fillRect(GOAL_L - 40, y, GOAL_R - GOAL_L + 80, 120);
    }
  }

  // ================================================================ online two-player
  // Host: runs the puck, goals and serves; its mallet is "me", the guest's mallet is "cpu".
  // Guest: moves its own mallet locally and sends it ('in'); it renders the host's snapshots ('st'),
  // predicting the puck between snapshots and blending towards the host's state.

  private setupOnline(): void {
    this.hud.setRight(t('firstTo'));
    if (this.host) {
      net.onScene(this, 'in', (d: { m: number[] }) => {
        this.rx = 720 - d.m[0]; this.ry = MIRROR_Y - d.m[1]; this.rvx = -d.m[2]; this.rvy = -d.m[3]; this.rAt = this.time.now;
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

  /** Host → guest: puck, host mallet, goals, live flag and hit count (host coordinates). */
  private sendSnap(): void {
    const r = Math.round;
    net.send('st', {
      p: [r(this.px), r(this.py), r(this.pvx), r(this.pvy)],
      m: [r(this.me.x), r(this.me.y), r(this.me.vx), r(this.me.vy)],
      k: [this.myGoals, this.cpuGoals],
      l: this.live ? 1 : 0,
      h: this.hits,
    });
  }

  private updateOnline(dt: number): void {
    const c = this.controls;
    if (this.pointerId < 0 && (c.axisX || c.axisY)) {
      this.tx = this.me.x + c.axisX * 900 * dt * 1.5;
      this.ty = this.me.y + c.axisY * 900 * dt * 1.5;
    } else if (this.pointerId < 0) { this.tx = this.me.x; this.ty = this.me.y; }
    const meSpeed = this.pointerId >= 0 ? 2600 : 900;
    // the other player's mallet: last report, extrapolated a little
    const age = Math.min(0.15, (this.time.now - this.rAt) / 1000 + (this.host ? 0 : this.lat));
    const rtx = this.rx + this.rvx * age, rty = this.ry + this.rvy * age;

    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      this.moveMallet(this.me, this.tx, this.ty, meSpeed, h, false);
      this.moveMallet(this.cpu, rtx, rty, REMOTE_SPEED, h, true);
      if (!this.live || this.held) continue;
      if (this.stepPuck(h)) break;
      this.hitMallet(this.me, 'me');
      this.hitMallet(this.cpu, 'cpu');
    }
    if (this.live) {
      if (!this.held) {
        const f = Math.exp(-0.22 * dt);
        this.pvx *= f; this.pvy *= f;
        if (this.host && Math.hypot(this.pvx, this.pvy) < 25 && Math.abs(this.py - MID) < PUCK_R + 4) this.pvy += (this.py < MID ? -1 : 1) * 60 * dt;
      }
      if (!this.host) {
        const k = Math.min(1, dt * 12);
        this.px += this.corrX * k; this.py += this.corrY * k;
        this.corrX -= this.corrX * k; this.corrY -= this.corrY * k;
      }
      this.puck.setPosition(this.px, this.py);
      this.trail.setPosition(this.px, this.py);
      this.puck.rotation += this.pvx * dt * 0.004;
    }
    this.me.img.setPosition(this.me.x, this.me.y);
    this.cpu.img.setPosition(this.cpu.x, this.cpu.y);
    this.drawFx(dt);

    // fixed real-time rate (the scene delta is clamped, so it can lag behind on slow frames)
    const now = this.time.now;
    if (now - this.sendT >= SEND_MS) {
      this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS);
      const r = Math.round;
      if (this.host) this.sendSnap();
      else net.send('in', { m: [r(this.me.x), r(this.me.y), r(this.me.vx), r(this.me.vy)] });
    }
    if (!this.host && now >= this.pingT) { this.pingT = now + 1000; net.send('pi', { t: Math.round(now) }); }
  }

  /** Host: a goal in the online match. `mine` = the host scored. */
  private hostGoal(mine: boolean): void {
    this.live = false;
    if (mine) this.myGoals++; else this.cpuGoals++;
    this.goalFx(mine);
    this.sendSnap();
    if (this.myGoals >= WIN_GOALS || this.cpuGoals >= WIN_GOALS) { this.finishOnline(); return; }
    this.serve(mine ? 'cpu' : 'me', 1300);
    this.sendSnap();
  }

  private goalFx(mine: boolean): void {
    this.trail.stop();
    this.goalFlash = 1;
    this.goalFlashTop = mine;
    burst(this, this.px, mine ? T : B, mine ? [0xff4f5e, 0xffd23f, 0xffffff] : [0x3ee6ff, 0xffffff], 60, 600);
    shake(this, 0.02, 380);
    this.tweens.add({ targets: this.puck, alpha: 0, scale: 0.4, duration: 250 });
    if (mine) {
      this.sfx('goal', { volume: 0.7 });
      softFlash(this, 0xff4f5e, 200);
      this.banner(t('goal'), '#ffd23f', 64);
    } else {
      this.sfx('concede', { volume: 0.6 });
      softFlash(this, 0x3ee6ff, 200);
      this.banner(t('concede'), '#3ee6ff', 44);
    }
    this.setScore(this.myGoals);
    this.updateHud();
    const txt = mine ? this.myGoalsText : this.cpuGoalsText;
    txt.setScale(1.8).setAlpha(1);
    this.tweens.add({ targets: txt, scale: 1, alpha: 0.55, duration: 600, ease: 'Back.easeOut' });
  }

  /** Both sides: someone reached 7 goals. */
  private finishOnline(): void {
    const win = this.myGoals >= WIN_GOALS;
    this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 1400 });
  }

  /** Guest: a host snapshot arrived (host coordinates → table rotated for the local view). */
  private applySnap(d: Snap): void {
    if (this.isOver || !d?.p) return;
    const now = this.time.now;
    this.rx = 720 - d.m[0]; this.ry = MIRROR_Y - d.m[1]; this.rvx = -d.m[2]; this.rvy = -d.m[3]; this.rAt = now;
    const ax = 720 - d.p[0], ay = MIRROR_Y - d.p[1], avx = -d.p[2], avy = -d.p[3];

    const me = d.k[1], opp = d.k[0];
    if (me !== this.myGoals || opp !== this.cpuGoals) {
      const mine = me > this.myGoals;
      this.myGoals = me; this.cpuGoals = opp;
      this.live = false; this.held = false;
      this.goalFx(mine);
      if (me >= WIN_GOALS || opp >= WIN_GOALS) { this.finishOnline(); return; }
      if (me === WIN_GOALS - 1 || opp === WIN_GOALS - 1) this.banner(t('matchPoint'), '#ffd23f', 36, 520);
      this.time.delayedCall(650, () => {
        if (this.isOver) return;
        this.puck.setScale(0).setAlpha(1);
        this.tweens.add({ targets: this.puck, scale: 1, duration: 350, ease: 'Back.easeOut' });
      });
    }

    const wasLive = this.live;
    this.live = !!d.l;
    if (d.h < this.seenHits) this.seenHits = d.h;
    if (!this.live) {
      this.px = ax; this.py = ay; this.pvx = this.pvy = 0; this.corrX = this.corrY = 0; this.held = false;
      this.puck.setPosition(ax, ay);
      return;
    }
    // a mallet hit on the host that we did not predict: let it be heard
    if (d.h > this.seenHits) {
      if (now - this.localHitT > 300 && now - this.hitSfx > 70) { this.hitSfx = now; this.sfx('hit', { volume: 0.4 }); this.glow = 1; }
      this.seenHits = d.h;
    }
    // where the puck is on the host right now: advance the snapshot by the one-way latency
    const save = [this.px, this.py, this.pvx, this.pvy];
    this.px = ax; this.py = ay; this.pvx = avx; this.pvy = avy;
    this.quiet = true;
    const n = Math.ceil(this.lat / 0.006);
    for (let i = 0; i < n; i++) if (this.stepPuck(this.lat / n)) break;
    this.quiet = false;
    const s = [this.px, this.py, this.pvx, this.pvy];
    [this.px, this.py, this.pvx, this.pvy] = save;

    if (!wasLive || this.held) {
      [this.px, this.py, this.pvx, this.pvy] = s;
      this.corrX = this.corrY = 0; this.held = false;
      if (!wasLive) { this.sfx('serve', { volume: 0.5 }); this.trail.start(); this.puck.setAlpha(1).setScale(1); }
      return;
    }
    // we predicted a mallet hit the host has not confirmed yet: keep our prediction a moment
    const keepMs = 150 + this.lat * 2000;
    if (now - this.localHitT < keepMs && s[2] * this.pvx + s[3] * this.pvy < 0) return;
    this.pvx = s[2]; this.pvy = s[3];
    const ex = s[0] - this.px, ey = s[1] - this.py;
    if (Math.hypot(ex, ey) > 120) { this.px = s[0]; this.py = s[1]; this.corrX = this.corrY = 0; }
    else { this.corrX = ex; this.corrY = ey; }
  }
}
