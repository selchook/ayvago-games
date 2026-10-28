import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, t, rng } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

// Board geometry (720 x 1280 world)
const L = 40, R = 680, W = R - L;
const BALL_R = 15, PEG_R = 8, BUMP_R = 24;
const PEG_TOP = 300, ROW_H = 60, ROWS = 11;
const DIV_TOP = 1000, FLOOR = 1150;
const SLOTS = 9, SLOT_W = W / SLOTS;
const DROP_Y = 205;
const GRAV = 2300, MAX_V = 1250, SUB = 5;
const BALLS_PER_ROUND = 10;

type PegKind = 'n' | 'gold' | 'mult' | 'bump';
interface Peg { x: number; y: number; r: number; kind: PegKind; img: Phaser.GameObjects.Image; used: boolean }
interface Bar { x0: number; y: number; half: number; amp: number; speed: number; phase: number; x: number; vx: number; img: Phaser.GameObjects.Image }
interface Ball { x: number; y: number; vx: number; vy: number; mult: number; img: Phaser.GameObjects.Image; still: number }
interface Slot { kind: 'pts' | 'ball' | 'zero'; value: number }

const SLOT_COLORS: Record<number, number> = { 0: 0x3a3450, 5: 0x2b6cb0, 10: 0x2f855a, 20: 0x38a169, 25: 0xb7791f, 50: 0xdd6b20, 100: 0xe53e3e };

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private boardG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private livesG!: Phaser.GameObjects.Graphics;
  private holder!: Phaser.GameObjects.Image;
  private ballsText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private gateText!: Phaser.GameObjects.Text;
  private pegs: Peg[] = [];
  private bars: Bar[] = [];
  private balls: Ball[] = [];
  private slots: Slot[] = [];
  private slotFlash: number[] = [];
  private round = 1;
  private lives = 3;
  private ballsLeft = 0;
  private roundScore = 0;
  private target = 0;
  private dropX = 360;
  private aiming = false;
  private dropCd = 0;
  private between = true;
  private gateSlot = -1;
  private gateMult = 2;
  private gateT = 0;
  private gateEvery = 1.6;
  private goldLeft = 0;
  private lastPing = 0;
  private pingStep = 0;
  private roundT = 0;

  createGame(): void {
    freshTextCanvases(this);
    this.pegs = []; this.bars = []; this.balls = []; this.slots = []; this.slotTexts = []; this.slotFlash = [];
    this.round = 1; this.lives = 3; this.ballsLeft = 0; this.roundScore = 0; this.target = 0;
    this.dropX = 360; this.aiming = false; this.dropCd = 0; this.between = true;
    this.gateSlot = -1; this.gateMult = 2; this.gateT = 0; this.goldLeft = 0; this.lastPing = 0; this.pingStep = 0; this.roundT = 0;
    this.makeTextures();

    this.boardG = this.add.graphics().setDepth(0);
    this.fxG = this.add.graphics().setDepth(1);
    this.livesG = this.add.graphics().setDepth(10);
    for (let i = 0; i < SLOTS; i++) {
      this.slotTexts.push(ftxt(this, L + SLOT_W * (i + 0.5), FLOOR - 40, '', { title: true, size: 20, strokeThickness: 5 }).setDepth(3));
      this.slotFlash.push(0);
    }
    this.gateText = ftxt(this, 0, DIV_TOP - 26, 'x2', { title: true, size: 22, color: '#ff4fa3', strokeThickness: 5 }).setDepth(4).setVisible(false);
    this.holder = this.add.image(this.dropX, DROP_Y, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(6);
    this.ballsText = ftxt(this, 30, 104, '', { title: true, size: 20, color: '#3ee6ff' }).setOrigin(0, 0.5).setDepth(10);
    this.targetText = ftxt(this, 690, 104, '', { title: true, size: 20, color: '#ffd23f' }).setOrigin(1, 0.5).setDepth(10);
    ftxt(this, 360, 1215, t('hint'), { size: 26, color: '#b9b4d6' }).setDepth(10);

    this.controls = new Controls(this);
    for (const k of ['SPACE', 'Z', 'ENTER', 'DOWN', 'S']) this.input.keyboard?.on(`keydown-${k}`, () => this.drop());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 590 && p.y < 140) return;                 // pause button
      this.aiming = true;
      this.dropX = this.clampDrop(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.aiming && p.isDown) this.dropX = this.clampDrop(p.x);
    });
    this.input.on('pointerup', () => {
      if (!this.aiming) return;
      this.aiming = false;
      this.drop();
    });

    this.startRound();
  }

  private makeTextures(): void {
    if (!this.textures.exists('pk-peg')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 0.18).fillCircle(16, 16, 16);
      g.fillStyle(0xdedcff, 1).fillCircle(16, 16, 9);
      g.fillStyle(0xffffff, 1).fillCircle(13, 13, 3);
      g.generateTexture('pk-peg', 32, 32);
      g.clear();
      g.fillStyle(0x8b5cff, 0.35).fillCircle(32, 32, 32);
      g.fillStyle(0x8b5cff, 1).fillCircle(32, 32, 25);
      g.lineStyle(5, 0xffffff, 1).strokeCircle(32, 32, 20);
      g.fillStyle(0xffffff, 0.8).fillCircle(24, 24, 5);
      g.generateTexture('pk-bump', 64, 64);
      g.clear();
      g.fillStyle(0x3ee6ff, 1).fillRoundedRect(0, 0, 100, 16, 8);
      g.fillStyle(0xffffff, 0.6).fillRoundedRect(6, 3, 88, 4, 2);
      g.generateTexture('pk-bar', 100, 16);
      g.destroy();
    }
  }

  private clampDrop(x: number): number {
    return Phaser.Math.Clamp(x, L + BALL_R + 4, R - BALL_R - 4);
  }

  // ---------------------------------------------------------------- rounds
  private startRound(): void {
    const r = this.round;
    this.between = true;
    this.roundScore = 0;
    this.ballsLeft = BALLS_PER_ROUND;
    this.target = r < 8 ? 180 + (r - 1) * 90 : 810 + (r - 8) * 130;
    for (const p of this.pegs) p.img.destroy();
    for (const b of this.bars) b.img.destroy();
    for (const b of this.balls) b.img.destroy();
    this.pegs = []; this.bars = []; this.balls = [];

    // pegs: staggered rows; some rows give way to sliding bars on later rounds
    const barRows = r >= 4 ? (r >= 7 ? [3, 7] : [5]) : [];
    const coords: Array<[number, number]> = [];
    for (let row = 0; row < ROWS; row++) {
      if (barRows.includes(row)) continue;
      const y = PEG_TOP + row * ROW_H;
      const odd = row % 2 === 1;
      const n = odd ? 9 : 10;
      for (let i = 0; i < n; i++) coords.push([odd ? L + 64 + i * 64 : L + 32 + i * 64, y]);
    }
    // later rounds punch a few holes into the field
    const holes = r >= 5 ? Math.min(10, (r - 4) * 2) : 0;
    const order = rng.shuffle(coords.map((_, i) => i));
    const holeSet = new Set(order.slice(0, holes));
    const bumpers = r >= 3 ? Math.min(4, r - 2) : 0;
    const golds = Math.min(12, 5 + r);
    const mults = r >= 2 ? (r >= 6 ? 2 : 1) : 1;
    let k = holes;
    const kinds: PegKind[] = coords.map(() => 'n');
    for (let i = 0; i < bumpers; i++, k++) {
      // bumpers sit in the middle band so they never clog the drop lane
      const idx = order[k];
      if (coords[idx][1] > PEG_TOP + ROW_H && coords[idx][1] < PEG_TOP + ROW_H * 9) kinds[idx] = 'bump';
    }
    for (let i = 0; i < golds; i++, k++) kinds[order[k]] = 'gold';
    for (let i = 0; i < mults; i++, k++) kinds[order[k]] = 'mult';
    this.goldLeft = 0;
    coords.forEach(([x, y], i) => {
      if (holeSet.has(i)) return;
      const kind = kinds[i];
      let img: Phaser.GameObjects.Image;
      let rad = PEG_R;
      if (kind === 'gold') { img = this.add.image(x, y, 'peg-gold').setDisplaySize(24, 24); rad = 11; this.goldLeft++; }
      else if (kind === 'mult') { img = this.add.image(x, y, 'spark').setDisplaySize(32, 32).setTint(0xff4fa3); rad = 12; }
      else if (kind === 'bump') { img = this.add.image(x, y, 'pk-bump').setDisplaySize(BUMP_R * 2.6, BUMP_R * 2.6); rad = BUMP_R; }
      else img = this.add.image(x, y, 'pk-peg').setDisplaySize(32, 32);
      img.setDepth(2).setScale(0);
      const s = kind === 'gold' ? 24 / 128 : kind === 'mult' ? 32 / img.width : kind === 'bump' ? (BUMP_R * 2.6) / 64 : 1;
      this.tweens.add({ targets: img, scale: s, duration: 300, delay: 40 + (y - PEG_TOP) * 0.6 + rng.int(0, 120), ease: 'Back.easeOut' });
      img.setData('base', s);
      this.pegs.push({ x, y, r: rad, kind, img, used: false });
    });
    for (const row of barRows) {
      const y = PEG_TOP + row * ROW_H;
      const img = this.add.image(360, y, 'pk-bar').setDepth(2);
      this.bars.push({ x0: 360, y, half: 50, amp: 210, speed: 0.9 + r * 0.08, phase: rng.int(0, 6), x: 360, vx: 0, img });
    }

    // slots: shuffled values; zero traps from round 3, an extra-ball pocket now and then
    const pool = rng.shuffle([5, 10, 10, 20, 25, 25, 50, 50, 100]);
    this.slots = pool.map((v) => ({ kind: 'pts', value: v } as Slot));
    const zeros = r >= 3 ? (r >= 6 ? 2 : 1) : 0;
    const idxs = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 0; i < zeros; i++) this.slots[idxs[i]] = { kind: 'zero', value: 0 };
    if (rng.chance(r === 1 ? 1 : 0.6)) this.slots[idxs[zeros]] = { kind: 'ball', value: 0 };
    this.gateSlot = r >= 2 ? rng.int(0, SLOTS - 1) : -1;
    this.gateMult = r >= 6 ? 3 : 2;
    this.gateEvery = Math.max(0.6, 1.8 - r * 0.12);
    this.gateT = 0;
    this.slotTexts.forEach((tx, i) => {
      const s = this.slots[i];
      tx.setText(s.kind === 'ball' ? '+1' : String(s.value)).setColor(s.kind === 'ball' ? '#5dff7a' : s.kind === 'zero' ? '#8a84a8' : '#ffffff');
      tx.setScale(0);
      this.tweens.add({ targets: tx, scale: 1, duration: 300, delay: 300 + i * 50, ease: 'Back.easeOut' });
    });

    this.hud.setRight(`${t('round')} ${r}`);
    this.updateHud();
    this.drawBoard();
    this.banner(`${t('round')} ${r}`, '#ffd23f', `${t('target')} ${this.target}`);
    this.time.delayedCall(900, () => { if (!this.isOver) this.between = false; });
  }

  private finishRound(): void {
    this.between = true;
    if (this.roundScore >= this.target) {
      const bonus = 40 * this.round + Math.max(0, this.roundScore - this.target);
      this.addScore(bonus);
      this.sfx('clear');
      softFlash(this, 0x5dff7a, 160);
      burst(this, 360, 600, [0xffd23f, 0x5dff7a, 0x3ee6ff], 50, 520);
      this.banner(t('roundClear'), '#5dff7a', t('bonus', { n: bonus }));
      this.round++;
      this.time.delayedCall(1700, () => !this.isOver && this.startRound());
    } else {
      this.lives--;
      this.updateHud();
      this.tweens.add({ targets: this.livesG, alpha: 0.2, duration: 120, yoyo: true, repeat: 3 });
      this.sfx('fail');
      shake(this, 0.015, 300);
      softFlash(this, 0xec3013, 160);
      this.banner(t('roundFail'), '#ec3013', t('lifeLost'));
      if (this.lives <= 0) this.endGame({ delay: 1500 });
      else this.time.delayedCall(1700, () => !this.isOver && this.startRound());
    }
  }

  private banner(main: string, color: string, sub?: string): void {
    const a = ftxt(this, 360, 560, main, { title: true, size: 40, color, strokeThickness: 8, wrap: 660 }).setDepth(20).setScale(0.2);
    const b = sub ? ftxt(this, 360, 630, sub, { title: true, size: 22, color: '#ffffff', strokeThickness: 6 }).setDepth(20).setAlpha(0) : null;
    this.tweens.add({ targets: a, scale: 1, duration: 350, ease: 'Back.easeOut' });
    if (b) this.tweens.add({ targets: b, alpha: 1, duration: 300, delay: 150 });
    this.tweens.add({ targets: b ? [a, b] : [a], alpha: 0, delay: 1250, duration: 300, onComplete: () => { a.destroy(); b?.destroy(); } });
  }

  private updateHud(): void {
    this.drawLives();
    this.ballsText.setText(`${t('balls')} ${this.ballsLeft}`);
    this.targetText.setText(`${t('target')} ${this.roundScore}/${this.target}`);
    this.targetText.setColor(this.roundScore >= this.target ? '#5dff7a' : '#ffd23f');
  }

  private drawLives(): void {
    const g = this.livesG;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const x = 316 + i * 44, y = 100;
      g.fillStyle(i < this.lives ? 0xec3013 : 0x3a3450, 1);
      g.fillCircle(x - 7, y - 4, 9).fillCircle(x + 7, y - 4, 9);
      g.fillTriangle(x - 16, y - 1, x + 16, y - 1, x, y + 16);
    }
  }

  private drawBoard(): void {
    const g = this.boardG;
    g.clear();
    g.fillStyle(0x1d1640, 1).fillRoundedRect(L - 14, 140, W + 28, FLOOR - 140 + 24, 24);
    g.lineStyle(6, 0x8b5cff, 1).strokeRoundedRect(L - 14, 140, W + 28, FLOOR - 140 + 24, 24);
    // target progress bar
    g.fillStyle(0x000000, 0.5).fillRoundedRect(30, 124, 660, 10, 5);
    for (let i = 0; i < SLOTS; i++) {
      const s = this.slots[i];
      const col = s.kind === 'ball' ? 0x1f7a3a : s.kind === 'zero' ? SLOT_COLORS[0] : SLOT_COLORS[s.value] ?? 0x555555;
      g.fillStyle(col, 0.9).fillRect(L + i * SLOT_W + 3, DIV_TOP + 30, SLOT_W - 6, FLOOR - DIV_TOP - 30);
      g.fillStyle(0xffffff, 0.12).fillRect(L + i * SLOT_W + 3, DIV_TOP + 30, SLOT_W - 6, 8);
    }
    g.fillStyle(0xdedcff, 1);
    for (let i = 1; i < SLOTS; i++) g.fillRoundedRect(L + i * SLOT_W - 4, DIV_TOP, 8, FLOOR - DIV_TOP, 4);
    g.fillStyle(0x8b5cff, 1).fillRect(L - 14, FLOOR, W + 28, 10);
  }

  // ---------------------------------------------------------------- dropping
  private drop(): void {
    if (this.between || this.isOver || this.ballsLeft <= 0 || this.dropCd > 0) return;
    this.ballsLeft--;
    this.dropCd = 0.3;
    const img = this.add.image(this.dropX, DROP_Y, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(5);
    this.balls.push({ x: this.dropX + rng.int(-2, 2), y: DROP_Y, vx: 0, vy: 40, mult: 1, img, still: 0 });
    this.sfx('drop', { volume: 0.5 });
    this.pingStep = 0;
    this.holder.setScale(0);
    this.tweens.add({ targets: this.holder, scale: (BALL_R * 2) / this.holder.width, duration: 220, delay: 120, ease: 'Back.easeOut' });
    this.updateHud();
  }

  // ---------------------------------------------------------------- physics
  private collideCircle(b: Ball, cx: number, cy: number, cr: number, rest: number, kick = 0, ovx = 0): boolean {
    const dx = b.x - cx, dy = b.y - cy;
    const min = BALL_R + cr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) return false;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = cx + nx * min; b.y = cy + ny * min;
    const rvx = b.vx - ovx, vn = rvx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
      // tiny random spin keeps balls from balancing on a peg
      b.vx += rng.int(-18, 18);
      if (kick > 0) { b.vx += nx * kick; b.vy += ny * kick; }
      return true;
    }
    return false;
  }

  private stepBall(b: Ball, dt: number): void {
    b.vy += GRAV * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // side walls
    if (b.x < L + BALL_R) { b.x = L + BALL_R; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > R - BALL_R) { b.x = R - BALL_R; b.vx = -Math.abs(b.vx) * 0.6; }
    // pegs
    for (const p of this.pegs) {
      if (Math.abs(p.y - b.y) > 50) continue;
      const bump = p.kind === 'bump';
      if (this.collideCircle(b, p.x, p.y, p.r, bump ? 0.9 : 0.32, bump ? 260 : 0)) this.onPeg(b, p);
    }
    // sliding bars (capsules)
    for (const bar of this.bars) {
      const cx = Phaser.Math.Clamp(b.x, bar.x - bar.half, bar.x + bar.half);
      if (this.collideCircle(b, cx, bar.y, 8, 0.55, 0, bar.vx)) {
        b.vx += bar.vx * 0.5;
        this.ping(1.4);
      }
    }
    // slot dividers (vertical capsules)
    if (b.y > DIV_TOP - BALL_R - 6) {
      for (let i = 1; i < SLOTS; i++) {
        const dx = L + i * SLOT_W;
        if (Math.abs(b.x - dx) > BALL_R + 6) continue;
        this.collideCircle(b, dx, Phaser.Math.Clamp(b.y, DIV_TOP, FLOOR), 4, 0.35);
      }
    }
  }

  private onPeg(b: Ball, p: Peg): void {
    const base = p.img.getData('base') as number;
    this.tweens.killTweensOf(p.img);
    p.img.setScale(base * 1.45);
    this.tweens.add({ targets: p.img, scale: base, duration: 220, ease: 'Quad.easeOut' });
    if (p.kind === 'n') {
      p.img.setTint(0x3ee6ff);
      this.time.delayedCall(180, () => p.img.active && p.img.clearTint());
      this.ping(1 + Math.min(1.2, this.pingStep * 0.08));
      this.pingStep++;
    } else if (p.kind === 'bump') {
      this.sfx('bump', { volume: 0.35 });
      burst(this, p.x, p.y, [0x8b5cff, 0xffffff], 10, 220);
      this.addScore(2);
      this.roundScore += 2;
    } else if (!p.used) {
      p.used = true;
      if (p.kind === 'gold') {
        this.sfx('gold', { volume: 0.5 });
        burst(this, p.x, p.y, [0xffd23f, 0xffffff], 14, 240);
        fpopup(this, p.x, p.y - 20, '+10', '#ffd23f', 20);
        this.addScore(10);
        this.roundScore += 10;
        this.goldLeft--;
        p.img.setTexture('pk-peg').setDisplaySize(32, 32).setData('base', 1);
        p.r = PEG_R; p.kind = 'n';
        if (this.goldLeft === 0) {
          const bonus = 100 + this.round * 20;
          this.addScore(bonus);
          this.roundScore += bonus;
          this.sfx('mult');
          softFlash(this, 0xffd23f, 140);
          this.banner(t('allGold', { n: bonus }), '#ffd23f');
        }
      } else if (p.kind === 'mult') {
        b.mult = Math.min(4, b.mult * 2);
        b.img.setTexture('ball-gold');
        this.sfx('mult', { volume: 0.6 });
        burst(this, p.x, p.y, [0xff4fa3, 0xffd23f], 18, 280);
        fpopup(this, p.x, p.y - 24, `x${b.mult}`, '#ff4fa3', 26);
        p.img.setAlpha(0.35);
      }
      this.updateHud();
    }
  }

  private ping(rate: number): void {
    const now = this.time.now;
    if (now - this.lastPing < 45) return;
    this.lastPing = now;
    this.sfx('ping', { volume: 0.25, rate });
  }

  private land(b: Ball): void {
    const i = Phaser.Math.Clamp(Math.floor((b.x - L) / SLOT_W), 0, SLOTS - 1);
    const s = this.slots[i];
    const cx = L + SLOT_W * (i + 0.5);
    this.slotFlash[i] = 1;
    if (s.kind === 'ball') {
      this.ballsLeft++;
      this.sfx('extra');
      burst(this, cx, FLOOR - 30, [0x5dff7a, 0xffffff], 22, 300);
      fpopup(this, cx, FLOOR - 90, t('extraBall'), '#5dff7a', 22);
      this.tweens.add({ targets: this.ballsText, scale: 1.3, duration: 120, yoyo: true });
    } else if (s.kind === 'zero') {
      this.sfx('zero', { volume: 0.5 });
      burst(this, cx, FLOOR - 30, [0x555566, 0x8a84a8], 12, 160);
      fpopup(this, cx, FLOOR - 90, '0', '#8a84a8', 26);
    } else {
      const gate = i === this.gateSlot ? this.gateMult : 1;
      const pts = s.value * b.mult * gate;
      this.addScore(pts);
      this.roundScore += pts;
      const big = pts >= 100;
      this.sfx(big ? 'big' : 'land', { volume: big ? 0.7 : 0.5 });
      burst(this, cx, FLOOR - 30, [SLOT_COLORS[s.value] ?? 0xffffff, 0xffd23f, 0xffffff], big ? 40 : 18, big ? 420 : 260);
      if (big) shake(this, 0.008, 160);
      if (gate > 1 || b.mult > 1) softFlash(this, 0xff4fa3, 90);
      fpopup(this, cx, FLOOR - 90, `+${pts}`, gate > 1 || b.mult > 1 ? '#ff4fa3' : '#ffd23f', big ? 30 : 24);
    }
    this.tweens.add({ targets: this.slotTexts[i], scale: 1.5, duration: 110, yoyo: true });
    b.img.destroy();
    this.updateHud();
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.roundT += dt;
    this.dropCd = Math.max(0, this.dropCd - dt);
    const c = this.controls;
    if (c.axisX) this.dropX = this.clampDrop(this.dropX + c.axisX * 460 * dt);
    if (!this.aiming && !c.axisX && this.ballsLeft > 0 && !this.between) {
      // idle sway hint
      this.holder.y = DROP_Y + Math.sin(this.roundT * 4) * 3;
    }
    this.holder.setPosition(this.dropX, this.holder.y).setVisible(this.ballsLeft > 0);

    // bars + multiplier gate
    for (const bar of this.bars) {
      const nx = bar.x0 + Math.sin(this.roundT * bar.speed + bar.phase) * bar.amp;
      bar.vx = (nx - bar.x) / Math.max(dt, 0.001);
      bar.x = nx;
      bar.img.x = nx;
    }
    if (this.gateSlot >= 0) {
      this.gateT += dt;
      if (this.gateT >= this.gateEvery) {
        this.gateT = 0;
        this.gateSlot = (this.gateSlot + 1) % SLOTS;
      }
      this.gateText.setVisible(true).setText(`x${this.gateMult}`).setPosition(L + SLOT_W * (this.gateSlot + 0.5), DIV_TOP + 14);
    } else this.gateText.setVisible(false);

    // physics
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (const b of this.balls) this.stepBall(b, h);
      // ball vs ball
      for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < BALL_R * 2) {
          const nx = dx / d, ny = dy / d, o = (BALL_R * 2 - d) / 2;
          a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn < 0) { a.vx += vn * nx * 0.9; a.vy += vn * ny * 0.9; b.vx -= vn * nx * 0.9; b.vy -= vn * ny * 0.9; }
        }
      }
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.img.setPosition(b.x, b.y);
      b.img.rotation += b.vx * dt * 0.02;
      // unstick balls resting on something
      if (Math.hypot(b.vx, b.vy) < 40) b.still += dt; else b.still = 0;
      if (b.still > 0.8) { b.vx = rng.pick([-160, 160]); b.vy = -120; b.still = 0; }
      if (b.y >= FLOOR - BALL_R - 2) {
        this.balls.splice(i, 1);
        this.land(b);
      }
    }

    // effects layer: aim guide, slot flashes, gate highlight, progress bar
    const g = this.fxG;
    g.clear();
    if (this.ballsLeft > 0 && !this.between) {
      g.fillStyle(0xffffff, 0.35);
      for (let y = DROP_Y + 30; y < PEG_TOP - 16; y += 16) g.fillRect(this.dropX - 2, y, 4, 8);
    }
    for (let i = 0; i < SLOTS; i++) {
      if (this.slotFlash[i] > 0) {
        g.fillStyle(0xffffff, this.slotFlash[i] * 0.5).fillRect(L + i * SLOT_W + 3, DIV_TOP + 30, SLOT_W - 6, FLOOR - DIV_TOP - 30);
        this.slotFlash[i] = Math.max(0, this.slotFlash[i] - dt * 3);
      }
    }
    if (this.gateSlot >= 0) {
      const a = 0.55 + Math.sin(this.roundT * 10) * 0.25;
      g.lineStyle(5, 0xff4fa3, a).strokeRect(L + this.gateSlot * SLOT_W + 4, DIV_TOP + 2, SLOT_W - 8, FLOOR - DIV_TOP - 4);
    }
    for (const p of this.pegs) if (p.kind === 'mult') p.img.rotation += dt * 2;
    const pr = Math.min(1, this.roundScore / Math.max(1, this.target));
    g.fillStyle(pr >= 1 ? 0x5dff7a : 0xffd23f, 1).fillRoundedRect(30, 124, Math.max(10, 660 * pr), 10, 5);

    if (!this.between && this.ballsLeft === 0 && this.balls.length === 0) this.finishRound();
  }
}
