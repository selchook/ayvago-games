import Phaser from 'phaser';
import { ArcadeScene, CHARACTER_FRAME, Controls, burst, characterRig, playerCharacter, shake, flash, popup, txt, t, rng } from '@core';
import { W, H, GROUND, RING_COLORS, ARCHER_SCALE, ARCHER_ORIGIN_Y, BACK_SHOULDER, makeArcheryTextures, makeDrawBody, glass } from './art';

const BX = 214;            // bow hand
const BY = GROUND - 74;
const ARCHER_X = BX - 44;
const GRAV = 900;
const MIN_V = 600;
const MAX_V = 1750;
const ARROWS = 5;
const PX_PER_M = 14;
const MIN_ANGLE = Phaser.Math.DegToRad(-75);
const MAX_ANGLE = Phaser.Math.DegToRad(25);

interface Stuck { img: Phaser.GameObjects.Image; dy: number; onTarget: boolean }
type Phase = 'aim' | 'flight' | 'result' | 'between';

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private phase: Phase = 'between';
  private round = 0;
  private arrowsLeft = ARROWS;
  private roundScore = 0;
  private need = 0;
  private angle = Phaser.Math.DegToRad(-12);
  private power = 0;
  private drawing = false;
  private dragFrom: { x: number; y: number } | null = null;
  private kbDraw = false;
  private wind = 0;
  private windBase = 0;
  private tx = 700;
  private tyBase = 470;
  private ty = 470;
  private tr = 60;
  private amp = 0;
  private tspeed = 0;
  private tt = 0;
  private ax = 0; private ay = 0; private avx = 0; private avy = 0;
  private flying?: Phaser.GameObjects.Image;
  private stuck: Stuck[] = [];
  private face!: Phaser.GameObjects.Image;
  private stand!: Phaser.GameObjects.Graphics;
  private bowG!: Phaser.GameObjects.Graphics;
  private flagG!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private needText!: Phaser.GameObjects.Text;
  private quiver: Phaser.GameObjects.Image[] = [];
  private dots: Phaser.GameObjects.Image[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private offMark!: Phaser.GameObjects.Triangle;
  private archer!: Phaser.GameObjects.Image;
  // The archer stands side-on in the character's `hold1` pose, bow arm out in front. While the
  // bow is drawn the hanging back arm is left out (pc-hold1-draw) and the character's own `arm`
  // runs from that shoulder to the string; after the release it follows through past the ear.
  private drawArm!: Phaser.GameObjects.Image;
  private drawHand!: Phaser.GameObjects.Image;
  private drawBody = 'pc-hold1';
  private grip: [number, number] = [124, 106];   // bow hand on the pose frame
  private gx = BX; private gy = BY;               // bow hand in the world
  private lean = 0;
  private releaseT = 0;
  private trailG!: Phaser.GameObjects.Graphics;
  private trail: { x: number; y: number }[] = [];
  private arrowShadow!: Phaser.GameObjects.Image;
  private rig = characterRig(playerCharacter());
  private wave = 0;

  createGame(): void {
    makeArcheryTextures(this);
    this.phase = 'between'; this.round = 0; this.arrowsLeft = ARROWS; this.roundScore = 0; this.need = 0;
    this.angle = Phaser.Math.DegToRad(-12); this.power = 0; this.drawing = false; this.dragFrom = null; this.kbDraw = false;
    this.wind = 0; this.windBase = 0; this.stuck = []; this.quiver = []; this.dots = []; this.clouds = []; this.flying = undefined; this.wave = 0;

    this.add.image(0, 0, 'ar-sky').setOrigin(0).setDepth(-20);
    this.add.image(0, 0, 'ar-hills-far').setOrigin(0).setDepth(-16);
    this.add.image(0, 0, 'ar-hills-near').setOrigin(0).setDepth(-12);
    this.lean = 0; this.releaseT = 0; this.trail = [];
    for (let i = 0; i < 4; i++) {
      const c = this.add.image(rng.int(0, W), rng.int(150, 300), i % 2 ? 'cloud1' : 'cloud2').setDepth(-15).setAlpha(0.9).setScale(rng.int(70, 110) / 100);
      this.clouds.push(c);
    }
    [[80, 'tree_pine', 0.9], [420, 'tree_oak', 0.8], [980, 'tree_pine', 0.75], [1180, 'tree_oak', 0.9], [760, 'tree_oak', 0.6]].forEach(([x, k, s]) => {
      this.add.image(x as number, GROUND - 6, k as string).setOrigin(0.5, 1).setScale(s as number).setDepth(-10).setTint(0xcfe8cf);
    });
    this.add.tileSprite(0, GROUND - 12, W, 112, 'turf').setOrigin(0).setDepth(-5);

    this.stand = this.add.graphics().setDepth(1);
    this.face = this.add.image(this.tx, this.ty, 'face').setDepth(2);
    const made = makeDrawBody(this);
    this.drawBody = made.body; this.grip = made.grip;
    this.archer = this.add.image(ARCHER_X, GROUND + 2, 'pc-hold1').setOrigin(0.5, ARCHER_ORIGIN_Y).setScale(ARCHER_SCALE).setDepth(5);
    this.add.image(ARCHER_X, GROUND + 4, 'ar-glow').setTint(0x000000).setAlpha(0.35).setDisplaySize(90, 18).setDepth(4);
    this.rig = characterRig(playerCharacter());
    const shoulderY = 4 / this.rig.arm[1];   // pivot a few px below the top of the arm
    this.bowG = this.add.graphics().setDepth(7);
    this.drawArm = this.add.image(0, 0, 'pc-arm').setOrigin(0.5, shoulderY).setDepth(8).setVisible(false);
    this.drawHand = this.add.image(0, 0, 'pc-hand').setScale(ARCHER_SCALE).setDepth(9).setVisible(false);
    this.trailG = this.add.graphics().setDepth(7);
    this.arrowShadow = this.add.image(0, GROUND + 4, 'ar-glow').setTint(0x000000).setAlpha(0).setDisplaySize(60, 8).setDepth(-4);
    this.flagG = this.add.graphics().setDepth(3);
    for (let i = 0; i < 9; i++) this.dots.push(this.add.image(0, 0, 'dot').setDepth(7).setVisible(false));
    this.offMark = this.add.triangle(0, 30, 0, 18, 12, 0, 24, 18, 0xec3013).setDepth(50).setVisible(false);

    this.windText = txt(this, W / 2, 196, '', { size: 24, color: '#ffffff' }).setDepth(40);
    this.distText = txt(this, 0, GROUND + 40, '', { title: true, size: 18, color: '#ffffff' }).setDepth(40);
    this.add.image(W / 2, 82, glass(this, 380, 46)).setDepth(39);
    this.add.image(92, 90, glass(this, 150, 56)).setDepth(39);
    this.add.image(W / 2, 190, glass(this, 330, 42)).setDepth(2.5);
    this.needText = txt(this, W / 2, 82, '', { title: true, size: 20, color: '#ffd23f' }).setDepth(40);
    for (let i = 0; i < ARROWS; i++) {
      this.quiver.push(this.add.image(40 + i * 26, 90, 'arrow').setAngle(-90).setScale(0.5).setDepth(40));
    }

    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'aim') return;
      if (p.x > W - 140 && p.y < 140) return;   // pause button
      this.dragFrom = { x: p.x, y: p.y };
      this.drawing = true;
      this.power = 0;
      this.sfx('creak', { volume: 0.4 });
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !p.isDown || this.phase !== 'aim') return;
      const dx = this.dragFrom.x - p.x, dy = this.dragFrom.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len > 12) this.angle = Phaser.Math.Clamp(Math.atan2(dy, Math.max(1, dx)), MIN_ANGLE, MAX_ANGLE);
      this.power = Phaser.Math.Clamp(len / 260, 0, 1);
    });
    const release = () => {
      if (!this.dragFrom) return;
      this.dragFrom = null;
      this.drawing = false;
      if (this.phase === 'aim' && this.power > 0.12) this.shoot();
      else this.power = 0;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.nextRound();
  }

  // ---------------------------------------------------------------- rounds

  private nextRound(): void {
    this.round++;
    const r = this.round;
    this.arrowsLeft = ARROWS;
    this.roundScore = 0;
    // +3 a round while the target is still, +2 once it moves; capped at 40 of 50 (an 8 average)
    this.need = Math.min(40, r <= 4 ? 20 + r * 3 : 32 + (r - 4) * 2);
    for (const s of this.stuck) s.img.destroy();
    this.stuck = [];
    this.tx = Math.min(1150, 600 + (r - 1) * 80);
    this.tr = Math.max(34, 64 - (r - 1) * 4);
    this.amp = r >= 4 ? Math.min(130, (r - 3) * 34) : 0;
    this.tspeed = r >= 4 ? Math.min(2.4, 0.9 + (r - 4) * 0.22) : 0;
    this.tyBase = this.amp ? Math.max(this.tr + 150 + this.amp, 430) : GROUND - 150;
    this.tt = 0;
    this.windBase = r === 1 ? 0 : (rng.chance(0.5) ? 1 : -1) * Math.min(260, 30 + r * 28) * rng.int(60, 100) / 100;
    // the flag and the read-out show this round's wind during the banner, not the last arrow's
    this.wind = this.windBase;
    this.showWind();
    this.face.setScale(this.tr / 128).setPosition(this.tx, this.tyBase);
    this.ty = this.tyBase;
    this.drawStand();
    this.distText.setText(`${Math.round((this.tx - BX) / PX_PER_M)} m`).setPosition(this.tx, GROUND + 44);
    this.hud.setCenter(`${t('round')} ${r}`);
    this.updatePanel();

    this.phase = 'between';
    const b = txt(this, W / 2, H * 0.4, `${t('round')} ${r}`, { title: true, size: 54, color: '#ffd23f', strokeThickness: 12 }).setDepth(80).setScale(0.3);
    const s = txt(this, W / 2, H * 0.4 + 70, t('needPts', { n: this.need }) + (this.amp ? `  ·  ${t('moving')}` : ''), { size: 32, color: '#ffffff' }).setDepth(80).setAlpha(0);
    this.tweens.add({ targets: b, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.tweens.add({ targets: s, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({ targets: [b, s], alpha: 0, delay: 1500, duration: 350, onComplete: () => { b.destroy(); s.destroy(); } });
    this.face.setScale(0);
    this.tweens.add({ targets: this.face, scale: this.tr / 128, duration: 400, delay: 200, ease: 'Back.easeOut' });
    this.sfx('round', { volume: 0.6 });
    this.time.delayedCall(1300, () => this.readyArrow());
  }

  private readyArrow(): void {
    if (this.isOver) return;
    this.wind = this.windBase * rng.int(80, 120) / 100;
    if (this.round === 1) this.wind = 0;
    this.showWind();
    this.phase = 'aim';
    this.power = 0;
    this.sfx('nock', { volume: 0.4 });
  }

  private showWind(): void {
    const ms = Math.abs(this.wind) / 40;
    this.windText.setText(ms < 0.05 ? t('noWind') : `${t('wind')} ${ms.toFixed(1)} m/s ${this.wind > 0 ? '→' : '←'}`);
  }

  private updatePanel(): void {
    this.needText.setText(`${t('roundPts')} ${this.roundScore} / ${this.need}`);
    this.needText.setColor(this.roundScore >= this.need ? '#5dff7a' : '#ffd23f');
    this.quiver.forEach((q, i) => q.setAlpha(i < this.arrowsLeft ? 1 : 0.2));
    this.hud.setRight(`${t('arrows')} ${this.arrowsLeft}`);
  }

  private drawStand(): void {
    const g = this.stand;
    g.clear();
    if (this.amp) {
      // a rail the moving target slides on
      const top = this.tyBase - this.amp - this.tr - 20;
      g.fillStyle(0x6b7398).fillRect(this.tx + this.tr * 0.2, top, 10, GROUND - top);
      g.fillStyle(0x9aa3c8).fillRect(this.tx + this.tr * 0.2 + 2, top, 3, GROUND - top);
      g.fillStyle(0x3b3f52).fillRect(this.tx + this.tr * 0.2 - 10, top - 8, 30, 10);
    } else {
      const y = this.tyBase;
      g.lineStyle(10, 0x8a5a2b).lineBetween(this.tx - this.tr * 0.5, GROUND, this.tx - 4, y);
      g.lineStyle(10, 0x8a5a2b).lineBetween(this.tx + this.tr * 0.5, GROUND, this.tx + 4, y);
      g.lineStyle(10, 0x6e4520).lineBetween(this.tx + 12, GROUND, this.tx + 22, y);
    }
  }

  // ---------------------------------------------------------------- shooting

  private shoot(): void {
    const v = MIN_V + (MAX_V - MIN_V) * this.power;
    this.ax = this.gx + Math.cos(this.angle) * 30;
    this.ay = this.gy + Math.sin(this.angle) * 30;
    this.releaseT = 0.42;
    this.trail = [];
    this.avx = Math.cos(this.angle) * v;
    this.avy = Math.sin(this.angle) * v;
    this.flying = this.add.image(this.ax, this.ay, 'arrow').setOrigin(1, 0.5).setDepth(8).setRotation(this.angle);
    this.phase = 'flight';
    this.arrowsLeft--;
    this.updatePanel();
    this.power = 0;
    this.sfx('release', { volume: 0.6 });
    this.sfx('whoosh', { volume: 0.35 });
    this.cameras.main.shake(60, 0.002);
  }

  private resolve(points: number, x: number, y: number, label?: string): void {
    this.phase = 'result';
    this.flying = undefined;
    if (points > 0) {
      this.roundScore += points;
      const bonus = label === 'X' ? 5 : 0;
      this.addScore(points + bonus);
      const rc = RING_COLORS[points - 1];
      const col = '#' + (rc === 0x262626 ? 0xaaaaaa : rc).toString(16).padStart(6, '0');
      popup(this, x, y - 50, label ?? String(points), col, points >= 9 ? 44 : 32);
      if (points === 10) {
        flash(this, 0xffd23f, 140, 0.25);
        shake(this, 0.008, 200);
        burst(this, x, y, [0xffd23f, 0xffffff, 0xff4fa3], 36, 420);
        this.sfx('bull', { volume: 0.7 });
        if (label === 'X') popup(this, x, y - 110, '+5', '#ff4fa3', 24);
      }
    } else {
      popup(this, x, Math.min(y, GROUND) - 40, t('miss'), '#ff5a5a', 30);
      this.sfx('miss', { volume: 0.5 });
    }
    this.updatePanel();
    this.time.delayedCall(points === 10 ? 1000 : 750, () => this.afterArrow());
  }

  private afterArrow(): void {
    if (this.isOver) return;
    const canReach = this.roundScore + this.arrowsLeft * 10 >= this.need;
    if (!canReach) { this.failRound(); return; }
    if (this.arrowsLeft > 0) { this.readyArrow(); return; }
    if (this.roundScore >= this.need) this.passRound();
    else this.failRound();
  }

  private passRound(): void {
    this.phase = 'between';
    const bonus = 20 * this.round + Math.max(0, this.roundScore - this.need) * 5;
    this.addScore(bonus);
    this.sfx('pass', { volume: 0.7, exact: true });
    // a happy hop, bow in hand (the arms follow the archer every frame)
    this.tweens.add({
      targets: this.archer, y: GROUND - 22, duration: 220, yoyo: true, repeat: 1, ease: 'Sine.easeOut',
      onComplete: () => { this.archer.y = GROUND + 2; },
    });
    const b = txt(this, W / 2, H * 0.36, t('roundClear'), { title: true, size: 46, color: '#5dff7a', strokeThickness: 12 }).setDepth(80).setScale(0.3);
    const s = txt(this, W / 2, H * 0.36 + 64, `${this.roundScore} / ${this.need}   +${bonus}`, { title: true, size: 24, color: '#ffd23f' }).setDepth(80);
    this.tweens.add({ targets: b, scale: 1, duration: 360, ease: 'Back.easeOut' });
    burst(this, W / 2, H * 0.36, [0xffd23f, 0x5dff7a, 0xff4fa3, 0x3ee6ff], 50, 520);
    this.time.delayedCall(1800, () => { b.destroy(); s.destroy(); if (!this.isOver) this.nextRound(); });
  }

  private failRound(): void {
    this.phase = 'between';
    this.sfx('fail', { volume: 0.7 });
    for (const o of [this.archer, this.drawArm, this.drawHand]) o.setTint(0xff9a9a);
    shake(this, 0.01, 250);
    this.endGame({ title: t('roundFail'), delay: 900 });
  }

  // ---------------------------------------------------------------- loop

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    this.wave += dt;

    // moving target
    if (this.amp) {
      this.tt += dt * this.tspeed;
      this.ty = this.tyBase + Math.sin(this.tt) * this.amp;
    } else this.ty = this.tyBase;
    if (this.face.scale > 0) this.face.y = this.ty;
    for (const s of this.stuck) if (s.onTarget) s.img.y = this.ty + s.dy;

    // keyboard aim
    if (this.phase === 'aim') {
      const turn = Phaser.Math.DegToRad(55) * dt;
      if (c.up || c.left) this.angle = Math.max(MIN_ANGLE, this.angle - turn);
      if (c.down || c.right) this.angle = Math.min(MAX_ANGLE, this.angle + turn);
      if (c.a && !this.dragFrom) {
        if (!this.kbDraw) { this.kbDraw = true; this.power = 0; this.sfx('creak', { volume: 0.4 }); }
        this.power = Math.min(1, this.power + dt / 1.1);
      } else if (this.kbDraw) {
        this.kbDraw = false;
        if (this.power > 0.12) this.shoot(); else this.power = 0;
      }
    } else this.kbDraw = false;

    // arrow flight
    if (this.phase === 'flight' && this.flying) this.fly(dt);

    // clouds drift with the wind
    for (const cl of this.clouds) {
      cl.x += (8 + this.wind * 0.15) * dt;
      if (cl.x > W + 120) cl.x = -120;
      if (cl.x < -120) cl.x = W + 120;
    }

    this.releaseT = Math.max(0, this.releaseT - dt);
    this.drawBow(dt);
    this.drawFlag();
    this.drawPreview();
    // a fading streak behind the arrow and its shadow on the grass
    const tg = this.trailG;
    tg.clear();
    if (this.phase === 'flight') {
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i], f = i / this.trail.length;
        tg.lineStyle(1 + f * 3, 0xffffff, 0.45 * f).lineBetween(a.x, a.y, b.x, b.y);
      }
      const h = Math.max(0, GROUND - this.ay);
      this.arrowShadow.setPosition(this.ax - 30, GROUND + 4).setAlpha(Math.max(0.08, 0.4 - h / 1200)).setDisplaySize(70 + h * 0.08, 8);
    } else this.arrowShadow.setAlpha(0);
  }

  private fly(dt: number): void {
    const a = this.flying!;
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      const h = dt / steps;
      const px = this.ax, py = this.ay;
      this.avy += GRAV * h;
      this.avx += this.wind * h;
      this.ax += this.avx * h;
      this.ay += this.avy * h;
      // crossing the target plane
      if (px < this.tx && this.ax >= this.tx) {
        const yc = py + (this.ay - py) * (this.tx - px) / (this.ax - px);
        const d = Math.abs(yc - this.ty);
        // the painted face is 124 of the texture's 128 px radius: score exactly what is drawn
        const faceR = this.tr * 124 / 128;
        if (d <= faceR) {
          const ringW = faceR / 10;
          const pts = Math.max(1, 10 - Math.floor(d / ringW));
          const x = d < ringW / 2;
          a.setPosition(this.tx + 14, yc).setRotation(Math.atan2(this.avy, this.avx));
          this.stuck.push({ img: a, dy: yc - this.ty, onTarget: true });
          this.tweens.add({ targets: a, scaleX: { from: 1.08, to: 1 }, duration: 120, yoyo: true });
          this.tweens.add({ targets: this.face, x: this.tx + 6, duration: 50, yoyo: true });
          burst(this, this.tx, yc, [0xc9a26b, 0xffffff, RING_COLORS[pts - 1]], 14, 220);
          const ring = this.add.image(this.tx, yc, 'ar-ring').setScale(0.1).setDepth(6).setTint(pts >= 9 ? 0xffd23f : 0xffffff);
          this.tweens.add({ targets: ring, scale: this.tr / 40, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
          this.trail = [];
          this.sfx('thunk', { volume: 0.7 });
          shake(this, 0.004, 120);
          this.resolve(pts, this.tx, yc, x ? 'X' : undefined);
          return;
        }
      }
      if (this.ay >= GROUND - 2) {
        a.setPosition(this.ax, GROUND + 6).setRotation(Math.atan2(this.avy, this.avx));
        this.stuck.push({ img: a, dy: 0, onTarget: false });
        burst(this, this.ax, GROUND, [0x6b4a2b, 0x58b947], 12, 200);
        this.trail = [];
        this.sfx('ground', { volume: 0.6 });
        this.resolve(0, this.ax, GROUND);
        return;
      }
      if (this.ax > W + 80 || this.ax < -80) {
        a.destroy();
        this.resolve(0, Phaser.Math.Clamp(this.ax, 80, W - 80), H * 0.5);
        return;
      }
    }
    a.setPosition(this.ax, this.ay).setRotation(Math.atan2(this.avy, this.avx));
    this.trail.push({ x: this.ax, y: this.ay });
    if (this.trail.length > 14) this.trail.shift();
    // off the top of the screen: a marker shows where the arrow is
    this.offMark.setVisible(this.ay < 0).setPosition(Phaser.Math.Clamp(this.ax, 20, W - 20), 26);
    if (this.ay >= 0) this.offMark.setVisible(false);
  }

  /** A point of the pose frame (px) in the world, with the archer's position, scale and lean. */
  private framePt(fx: number, fy: number): [number, number] {
    const lx = (fx - CHARACTER_FRAME.width / 2) * ARCHER_SCALE, ly = (fy - CHARACTER_FRAME.height * CHARACTER_FRAME.originY) * ARCHER_SCALE;
    const c = Math.cos(this.lean), s = Math.sin(this.lean);
    return [this.archer.x + lx * c - ly * s, this.archer.y + lx * s + ly * c];
  }

  private drawBow(dt: number): void {
    const g = this.bowG;
    g.clear();
    const drawing = this.phase === 'aim' && (this.power > 0 || !!this.dragFrom || this.kbDraw);
    const follow = this.releaseT > 0;
    // the archer leans back a little to shoot high, and steps into it with the draw
    const target = this.phase === 'aim' || follow ? Phaser.Math.Clamp(this.angle * 0.42, -0.36, 0.1) : 0;
    this.lean += (target - this.lean) * Math.min(1, dt * 10);
    this.archer.setRotation(this.lean).setTexture(drawing || follow ? this.drawBody : 'pc-hold1');
    const [gx, gy] = this.framePt(this.grip[0], this.grip[1]);
    this.gx = gx; this.gy = gy;
    const ang = this.angle;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const P = (lx: number, ly: number): [number, number] => [gx + lx * cos - ly * sin, gy + lx * sin + ly * cos];
    // the string comes back to the anchor by the jaw at once, then a little further with power
    const pull = drawing ? (30 + this.power * 12) * ARCHER_SCALE / 0.76 : follow ? 2 : 4;
    const shakeAmt = this.power > 0.95 ? Math.sin(this.wave * 60) * 1.2 : 0;
    // after the release the string thrums
    const thrum = follow ? Math.sin(this.releaseT * 90) * 6 * (this.releaseT / 0.42) : 0;
    // limbs bend more as the string comes back
    const bend = 26 + (drawing ? this.power * 8 : 0);
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(...P(-6, -52)), new Phaser.Math.Vector2(...P(bend, 0)), new Phaser.Math.Vector2(...P(-6, 52)));
    g.lineStyle(9, 0x4a2608).strokePoints(curve.getPoints(16));
    g.lineStyle(4, 0xc08546).strokePoints(curve.getPoints(16));
    const [sx1, sy1] = P(-6, -52), [sx2, sy2] = P(-6, 52), [nx, ny] = P(-pull + thrum, shakeAmt);
    g.lineStyle(2, 0xffffff, 0.9).lineBetween(sx1, sy1, nx, ny).lineBetween(nx, ny, sx2, sy2);
    // grip wrap over the bow hand
    const [wx, wy] = P(4, 0);
    g.fillStyle(0x2a1405).fillCircle(wx, wy, 5);
    // the drawing arm: from the back shoulder to the string, or flung back after the release
    if (drawing || follow) {
      const shoulder = this.framePt(BACK_SHOULDER[0], BACK_SHOULDER[1]);
      let hx = nx, hy = ny;
      if (follow) {
        const k = 1 - this.releaseT / 0.42;
        const [ax, ay] = P(-34, 0);
        const back = Phaser.Math.Easing.Cubic.Out(Math.min(1, k * 2.5));
        hx = ax - back * 26 * ARCHER_SCALE / 0.76; hy = ay - back * 14 * ARCHER_SCALE / 0.76;
      }
      this.drawArm.setVisible(true); this.drawHand.setVisible(true);
      this.poseArm(this.drawArm, this.drawHand, shoulder, hx, hy);
    } else { this.drawArm.setVisible(false); this.drawHand.setVisible(false); }
    // nocked arrow
    if (this.phase === 'aim') {
      const [tx, ty] = P(-pull + 92, shakeAmt);
      g.lineStyle(4, 0x8a5a2b).lineBetween(nx, ny, tx, ty);
      g.fillStyle(0xc9cdd8).fillTriangle(tx + cos * 8, ty + sin * 8, tx - sin * 5, ty + cos * 5, tx + sin * 5, ty - cos * 5);
      const [fx1, fy1] = P(-pull + 4, -5), [fx2, fy2] = P(-pull + 4, 5), [fx3, fy3] = P(-pull + 16, 0);
      g.fillStyle(0xec3013).fillTriangle(fx1, fy1, fx2, fy2, fx3, fy3);
    }
    // power gauge
    if (this.phase === 'aim' && this.power > 0) {
      g.fillStyle(0x000000, 0.5).fillRoundedRect(BX - 82, GROUND + 22, 164, 22, 8);
      const col = this.power > 0.85 ? 0xec3013 : this.power > 0.5 ? 0xffd23f : 0x5dff7a;
      g.fillStyle(col).fillRoundedRect(BX - 78, GROUND + 26, 156 * this.power, 14, 6);
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(BX - 76, GROUND + 27, 152 * this.power, 4, 2);
    }
  }

  /** Points an arm from a shoulder (world) to a hand position in the world. */
  private poseArm(arm: Phaser.GameObjects.Image, hand: Phaser.GameObjects.Image, shoulder: [number, number], hx: number, hy: number): void {
    const [sx, sy] = shoulder;
    const dist = Math.hypot(hx - sx, hy - sy);
    // the arm image hangs down from the shoulder; it shortens a little when the hand comes close
    const length = this.rig.arm[1] * ARCHER_SCALE;
    arm.setPosition(sx, sy).setRotation(Math.atan2(hy - sy, hx - sx) - Math.PI / 2)
      .setScale(ARCHER_SCALE, ARCHER_SCALE * Phaser.Math.Clamp(dist / length, 0.6, 1.25));
    hand.setPosition(hx, hy).setRotation(arm.rotation);
  }

  private drawPreview(): void {
    const show = this.phase === 'aim' && this.power > 0.05;
    const v = MIN_V + (MAX_V - MIN_V) * this.power;
    const span = Math.max(0.16, 0.5 - this.round * 0.04);
    this.dots.forEach((d, i) => {
      if (!show) { d.setVisible(false); return; }
      const tt = ((i + 1) / this.dots.length) * span;
      const x = this.gx + Math.cos(this.angle) * (30 + v * tt);
      const y = this.gy + Math.sin(this.angle) * 30 + Math.sin(this.angle) * v * tt + 0.5 * GRAV * tt * tt;
      d.setVisible(true).setPosition(x, y).setAlpha(1 - i / this.dots.length).setScale(0.9 - i * 0.06);
    });
  }

  private drawFlag(): void {
    const g = this.flagG;
    g.clear();
    const px = W / 2, top = 118, bottom = 178;
    g.fillStyle(0x6b7398).fillRect(px - 3, top, 6, bottom - top);
    g.fillStyle(0xffd23f).fillCircle(px, top, 5);
    const strength = Math.min(1, Math.abs(this.wind) / 260);
    const dir = this.wind >= 0 ? 1 : -1;
    const len = 26 + strength * 90;
    const droop = (1 - strength) * 26;
    const pts: Phaser.Math.Vector2[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const wave = Math.sin(this.wave * (4 + strength * 8) - f * 5) * (3 + strength * 5) * f;
      pts.push(new Phaser.Math.Vector2(px + dir * f * len, top + 2 + f * droop + wave));
    }
    for (let i = n; i >= 0; i--) {
      const f = i / n;
      const wave = Math.sin(this.wave * (4 + strength * 8) - f * 5) * (3 + strength * 5) * f;
      pts.push(new Phaser.Math.Vector2(px + dir * f * len, top + 30 - f * (12 - droop * 0.6) + wave + f * droop));
    }
    g.fillStyle(0xec3013).fillPoints(pts, true);
    g.lineStyle(2, 0x000000, 0.4).strokePoints(pts, true);
  }
}
