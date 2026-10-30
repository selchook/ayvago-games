import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng, COLORS } from '@core';
import {
  World, Hit, BALL_R, LANE_X, PLUNGER_Y, DRAIN_Y, LANES, LANE_Y, TARGET_Y, TARGETS, PIVOT_Y,
  SLING_L, SLING_R, GUIDE_L, GUIDE_R, archPoints, buildWalls, buildTargets, buildBumpers, buildFlippers, step,
} from './table';
import { makeTextures } from './art';

const W = 720;
const BALLS = 3;
const LETTERS = ['A', 'Y', 'V', 'A'];
const NUDGE_CD = 3;
const MAX_MULT = 5;
const BTN_Y = 1226, BTN_H = 92, BTN_W = 168;
const NUDGE_X = 96, LAUNCH_X = 624;

type Zone = 'L' | 'R' | 'P' | 'N' | null;

export class PlayScene extends ArcadeScene {
  private world!: World;
  private ballImg!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flipImgs: Phaser.GameObjects.Image[] = [];
  private bumperImgs: Phaser.GameObjects.Image[] = [];
  private targetGfx!: Phaser.GameObjects.Graphics;
  private slingGfx!: Phaser.GameObjects.Graphics;
  private plungerGfx!: Phaser.GameObjects.Graphics;
  private laneTexts: Phaser.GameObjects.Text[] = [];
  private laneLamps: Phaser.GameObjects.Arc[] = [];
  private saveText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private launchHint!: Phaser.GameObjects.Text;
  private nudgeBtn!: Phaser.GameObjects.Graphics;
  private launchBtn!: Phaser.GameObjects.Graphics;
  private table!: Phaser.GameObjects.Container;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  private balls = BALLS;
  private ballNo = 1;
  private mult = 1;
  private level = 1;
  private lit = [false, false, false, false];
  private inLane = -1;
  private charge = 0;
  private charging = false;
  private ballSave = 0;
  private saveArmed = false;
  private nudgeCd = 0;
  private stall = 0;
  private waiting = 0;          // seconds until the next ball is served (0 = ball in play)
  private inPlay = false;
  private slingFlash = [0, 0];
  private bankTimer = 0;
  private prevHeld = [false, false];
  private hitCd: Record<string, number> = {};
  /** A tap shorter than a frame still flips: each press holds its flipper up for a moment. */
  private pulse = [0, 0];

  createGame(): void {
    makeTextures(this);
    this.flipImgs = []; this.bumperImgs = []; this.laneTexts = []; this.laneLamps = []; this.keys = {};
    this.balls = BALLS; this.ballNo = 1; this.mult = 1; this.level = 1;
    this.lit = [false, false, false, false]; this.inLane = -1; this.charge = 0; this.charging = false;
    this.ballSave = 0; this.saveArmed = false; this.nudgeCd = 0; this.stall = 0; this.waiting = 0; this.inPlay = false;
    this.slingFlash = [0, 0]; this.bankTimer = 0; this.prevHeld = [false, false]; this.hitCd = {}; this.pulse = [0, 0];

    this.world = {
      ball: { x: LANE_X, y: PLUNGER_Y, vx: 0, vy: 0 },
      walls: buildWalls(), targets: buildTargets(), bumpers: buildBumpers(), flippers: buildFlippers(),
      gravity: 1250,
    };

    this.input.addPointer(3);
    this.table = this.add.container(0, 0);
    this.drawTable();

    this.trail = this.add.particles(0, 0, 'spark', {
      speed: 0, lifespan: 260, scale: { start: 0.9, end: 0 }, alpha: { start: 0.35, end: 0 },
      tint: [0x3ee6ff, 0xffffff], frequency: 16, emitting: false,
    }).setDepth(9);
    this.ballImg = this.add.image(LANE_X, PLUNGER_Y, 'ball').setDepth(10);
    this.table.add(this.trail);
    this.table.add(this.ballImg);
    for (const f of this.world.flippers) {
      const img = this.add.image(f.px, f.py, 'flipper').setOrigin(16 / 145, 0.5).setRotation(f.angle).setDepth(11);
      this.flipImgs.push(img);
      this.table.add(img);
    }
    this.drawApron();

    const kb = this.input.keyboard;
    if (kb) {
      for (const k of ['LEFT', 'RIGHT', 'Z', 'FORWARD_SLASH', 'A', 'D', 'SPACE', 'DOWN', 'S', 'UP', 'X', 'N']) {
        this.keys[k] = kb.addKey(k, true);
      }
      for (const k of ['LEFT', 'Z', 'A']) kb.on(`keydown-${k}`, () => { this.pulse[0] = 0.1; });
      for (const k of ['RIGHT', 'FORWARD_SLASH', 'D']) kb.on(`keydown-${k}`, () => { this.pulse[1] = 0.1; });
      kb.on('keydown-UP', () => this.nudge());
      kb.on('keydown-X', () => this.nudge());
      kb.on('keydown-N', () => this.nudge());
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const z = this.zoneAt(p.x, p.y);
      if (z === 'N') this.nudge();
      else if (z === 'L') this.pulse[0] = 0.1;
      else if (z === 'R') this.pulse[1] = 0.1;
    });

    this.updateHud();
    this.serveBall(true);
    const hint = txt(this, W / 2, 760, t('touchHint'), { size: 30, color: '#3ee6ff' }).setDepth(40);
    this.tweens.add({ targets: hint, alpha: 0, delay: 2600, duration: 500, onComplete: () => hint.destroy() });
  }

  // ---------- drawing ----------

  private drawTable(): void {
    const bg = this.add.graphics();
    this.table.add(bg);
    bg.fillGradientStyle(0x1d1050, 0x1d1050, 0x090717, 0x090717, 1).fillRect(0, 0, W, 1280);
    // playfield art: rings under the bumpers, rays, star dots
    bg.lineStyle(2, 0x8b5cff, 0.25);
    for (let r = 60; r < 420; r += 36) bg.strokeCircle(340, 450, r);
    bg.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < 40; i++) bg.fillCircle(rng.int(40, 640), rng.int(120, 880), rng.pick([1, 1, 2]));
    // insert arrows pointing up the middle
    for (let i = 0; i < 3; i++) {
      const y = 860 - i * 46;
      bg.fillStyle(0xffd23f, 0.18 + i * 0.1).fillTriangle(340, y - 22, 316, y + 10, 364, y + 10);
    }
    // the shooter lane
    bg.fillStyle(0x000000, 0.35).fillRect(652, 330, 52, PLUNGER_Y - 300);

    const walls = this.add.graphics();
    this.table.add(walls);
    const neon = (pts: number[][], width: number) => {
      walls.lineStyle(width + 10, 0x3ee6ff, 0.18).strokePoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
      walls.lineStyle(width, 0x9ff3ff, 1).strokePoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
    };
    const arch = archPoints();
    neon([[706, PLUNGER_Y + 16], ...arch, [30, GUIDE_L[0][1]], [GUIDE_L[1][0], GUIDE_L[1][1]]], 8);
    neon([[650, 470], [650, GUIDE_R[0][1]], [GUIDE_R[1][0], GUIDE_R[1][1]]], 8);
    neon([[650, GUIDE_R[0][1]], [650, PLUNGER_Y + 16]], 8);
    for (const s of this.world.walls) if (s.kind === 'post') {
      walls.lineStyle(14, 0xffd23f, 1).lineBetween(s.ax, s.ay, s.bx, s.by);
      walls.fillStyle(0xffd23f, 1).fillCircle(s.ax, s.ay, 7).fillCircle(s.bx, s.by, 7);
    }
    // slingshot bodies
    for (const s of [SLING_L, SLING_R]) {
      walls.fillStyle(0x8b5cff, 0.55).fillTriangle(s.a[0], s.a[1], s.b[0], s.b[1], s.c[0], s.c[1]);
      walls.lineStyle(6, 0xb9a2ff, 1).strokeTriangle(s.a[0], s.a[1], s.b[0], s.b[1], s.c[0], s.c[1]);
    }
    this.slingGfx = this.add.graphics();
    this.table.add(this.slingGfx);

    // rollover lanes: lamps and letters
    LANES.forEach((x, i) => {
      const lamp = this.add.circle(x, LANE_Y + 4, 14, 0x332a55).setStrokeStyle(3, 0xffd23f, 0.6);
      const letter = txt(this, x, LANE_Y + 50, LETTERS[i], { title: true, size: 26, color: '#4a4170' });
      this.laneLamps.push(lamp);
      this.laneTexts.push(letter);
      this.table.add([lamp, letter]);
    });

    this.targetGfx = this.add.graphics();
    this.table.add(this.targetGfx);
    this.drawTargets();

    for (const b of this.world.bumpers) {
      const img = this.add.image(b.x, b.y + 2, 'bumper').setDepth(3);
      this.bumperImgs.push(img);
      this.table.add(img);
    }
    this.plungerGfx = this.add.graphics();
    this.table.add(this.plungerGfx);
  }

  private drawTargets(): void {
    const g = this.targetGfx;
    g.clear();
    for (const s of this.world.targets) {
      const x = (s.ax + s.bx) / 2;
      if (s.active) {
        g.fillStyle(0x000000, 0.4).fillRoundedRect(x - 26, TARGET_Y - 6, 52, 20, 5);
        g.fillStyle(0xff8a1f, 1).fillRoundedRect(x - 26, TARGET_Y - 9, 52, 18, 5);
        g.fillStyle(0xffffff, 0.5).fillRect(x - 20, TARGET_Y - 6, 40, 3);
      } else {
        g.lineStyle(3, 0xff8a1f, 0.4).strokeRoundedRect(x - 26, TARGET_Y - 6, 52, 12, 4);
      }
    }
  }

  private drawSlings(): void {
    const g = this.slingGfx;
    g.clear();
    [SLING_L, SLING_R].forEach((s, i) => {
      const lit = this.slingFlash[i] > 0;
      g.lineStyle(lit ? 12 : 8, lit ? 0xffffff : 0xff4fa3, 1).lineBetween(s.a[0], s.a[1], s.c[0], s.c[1]);
    });
  }

  private drawApron(): void {
    const g = this.add.graphics().setDepth(20);
    // the apron covers the area under the flippers; the ball drains behind it
    g.fillStyle(0x15112e, 1).fillPoints([
      new Phaser.Math.Vector2(0, GUIDE_L[0][1] - 10), new Phaser.Math.Vector2(30, GUIDE_L[0][1]),
      new Phaser.Math.Vector2(GUIDE_L[1][0], GUIDE_L[1][1]), new Phaser.Math.Vector2(176, 1040),
      new Phaser.Math.Vector2(176, 1140), new Phaser.Math.Vector2(504, 1140), new Phaser.Math.Vector2(504, 1040),
      new Phaser.Math.Vector2(GUIDE_R[1][0], GUIDE_R[1][1]),
      new Phaser.Math.Vector2(650, GUIDE_R[0][1]), new Phaser.Math.Vector2(650, PLUNGER_Y + 20),
      new Phaser.Math.Vector2(720, PLUNGER_Y + 20), new Phaser.Math.Vector2(720, 1280), new Phaser.Math.Vector2(0, 1280),
    ], true);
    g.lineStyle(4, 0xec3013, 1).lineBetween(176, 1140, 504, 1140);
    g.lineStyle(3, 0x3ee6ff, 0.5).lineBetween(176, 1040, 176, 1140).lineBetween(504, 1040, 504, 1140);
    this.table.add(g);
    // the flippers stay above the apron, the draining ball goes behind it
    for (const img of this.flipImgs) this.table.bringToTop(img);

    this.saveText = txt(this, W / 2, 1172, t('ballSave'), { title: true, size: 16, color: '#5dff7a' }).setDepth(21);
    this.infoText = txt(this, W / 2, 1222, '', { title: true, size: 18, color: '#ffd23f' }).setDepth(21);
    this.launchHint = txt(this, 520, 1060, t('holdLaunch'), { size: 22, color: '#f3f2f2', align: 'right' }).setOrigin(1, 0.5).setDepth(21);
    this.table.add([this.saveText, this.infoText, this.launchHint]);

    this.nudgeBtn = this.add.graphics().setDepth(22);
    this.launchBtn = this.add.graphics().setDepth(22);
    const nl = txt(this, NUDGE_X, BTN_Y, t('nudge'), { title: true, size: 18, color: '#ffffff' }).setDepth(23);
    const ll = txt(this, LAUNCH_X, BTN_Y, t('launch'), { title: true, size: 18, color: '#ffffff' }).setDepth(23);
    this.table.add([this.nudgeBtn, this.launchBtn, nl, ll]);
    this.drawButtons();
  }

  private drawButtons(): void {
    const btn = (g: Phaser.GameObjects.Graphics, x: number, color: number, fill: number, pressed: boolean) => {
      g.clear();
      const y = BTN_Y - BTN_H / 2 + (pressed ? 4 : 0);
      g.fillStyle(0x000000, 0.5).fillRoundedRect(x - BTN_W / 2, BTN_Y - BTN_H / 2 + 8, BTN_W, BTN_H, 14);
      g.fillStyle(0x2a2450, 1).fillRoundedRect(x - BTN_W / 2, y, BTN_W, BTN_H, 14);
      g.fillStyle(color, 1).fillRoundedRect(x - BTN_W / 2, y + BTN_H * (1 - fill), BTN_W, BTN_H * fill, 14);
      g.lineStyle(4, 0x000000, 1).strokeRoundedRect(x - BTN_W / 2, y, BTN_W, BTN_H, 14);
    };
    btn(this.nudgeBtn, NUDGE_X, COLORS.purple, 1 - this.nudgeCd / NUDGE_CD, false);
    btn(this.launchBtn, LAUNCH_X, COLORS.red, this.charging ? Math.max(0.12, this.charge) : 1, this.charging);
  }

  private updateHud(): void {
    this.hud.setRight(`${t('ball')} ${this.ballNo}/${BALLS}`);
    this.infoText?.setText(`${t('levelUp', { n: this.level })}  ·  x${this.mult}`);
  }

  // ---------- input ----------

  private zoneAt(x: number, y: number): Zone {
    if (x > W - 130 && y < 130) return null;                       // pause button
    if (Math.abs(y - BTN_Y) <= BTN_H / 2 + 10) {
      if (Math.abs(x - NUDGE_X) <= BTN_W / 2 + 10) return 'N';
      if (Math.abs(x - LAUNCH_X) <= BTN_W / 2 + 10) return 'P';
    }
    return x < W / 2 ? 'L' : 'R';
  }

  private readInput(): { left: boolean; right: boolean; plunger: boolean } {
    const k = this.keys;
    const down = (n: string) => !!k[n]?.isDown;
    let left = down('LEFT') || down('Z') || down('A') || this.pulse[0] > 0;
    let right = down('RIGHT') || down('FORWARD_SLASH') || down('D') || this.pulse[1] > 0;
    let plunger = down('SPACE') || down('DOWN') || down('S');
    for (const p of this.input.manager.pointers) {
      if (!p || !p.isDown) continue;
      const z = this.zoneAt(p.x, p.y);
      if (z === 'L') left = true;
      else if (z === 'R') right = true;
      else if (z === 'P') plunger = true;
    }
    return { left, right, plunger };
  }

  private nudge(): void {
    if (this.isOver || !this.inPlay) return;
    if (this.nudgeCd > 0) { this.sfx('deny', { volume: 0.35 }); return; }
    this.nudgeCd = NUDGE_CD;
    const b = this.world.ball;
    if (b.x < 650) {
      b.vx += (b.x < 340 ? 1 : -1) * rng.int(90, 170);
      b.vy -= rng.int(260, 360);
    }
    this.sfx('nudge', { volume: 0.7 });
    shake(this, 0.008, 160);
    this.tweens.add({ targets: this.table, x: rng.pick([-10, 10]), y: -6, duration: 50, yoyo: true });
    popup(this, W / 2, 820, t('shake'), '#b9a2ff', 22);
  }

  // ---------- balls ----------

  private serveBall(first = false): void {
    const b = this.world.ball;
    b.x = LANE_X; b.y = PLUNGER_Y; b.vx = 0; b.vy = 0;
    this.ballImg.setVisible(true).setPosition(b.x, b.y).setScale(0.2);
    this.tweens.add({ targets: this.ballImg, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.inPlay = true;
    this.waiting = 0;
    this.saveArmed = true;
    this.ballSave = 0;
    if (!first) this.sfx('newball', { volume: 0.5 });
    if (this.ballNo === BALLS && !first) {
      const tx = txt(this, W / 2, 600, t('lastBall'), { title: true, size: 36, color: '#ff4fa3', strokeThickness: 8 }).setDepth(40).setScale(0.3);
      this.tweens.add({ targets: tx, scale: 1, duration: 250, ease: 'Back.easeOut' });
      this.tweens.add({ targets: tx, alpha: 0, delay: 1300, duration: 300, onComplete: () => tx.destroy() });
    }
  }

  private drain(): void {
    const b = this.world.ball;
    this.inPlay = false;
    this.ballImg.setVisible(false);
    this.trail.stop();
    if (this.ballSave > 0) {
      this.ballSave = 0;
      this.sfx('saved', { volume: 0.6 });
      this.banner(t('saved'), '#5dff7a');
      this.time.delayedCall(700, () => { if (!this.isOver) this.serveBall(true); });
      return;
    }
    this.sfx('drain', { volume: 0.7 });
    shake(this, 0.014, 280);
    flash(this, COLORS.red, 180, 0.25);
    burst(this, Phaser.Math.Clamp(b.x, 200, 480), 1140, [COLORS.red, 0xffd23f], 24, 300);
    this.balls--;
    if (this.balls <= 0) {
      this.endGame({ delay: 1200 });
      return;
    }
    this.banner(t('lost'), '#ec3013');
    this.waiting = 1.4;
  }

  private banner(s: string, color: string): void {
    const tx = txt(this, W / 2, 600, s, { title: true, size: 34, color, strokeThickness: 8, wrap: 640 }).setDepth(40).setScale(0.3);
    this.tweens.add({ targets: tx, scale: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tx, alpha: 0, y: 560, delay: 1100, duration: 350, onComplete: () => tx.destroy() });
  }

  // ---------- scoring ----------

  private award(base: number, x: number, y: number, color = '#ffd23f'): void {
    const n = base * this.mult;
    this.addScore(n);
    popup(this, x, y - 20, `+${n}`, color, n >= 1000 ? 26 : 18);
  }

  private onHit(h: Hit): void {
    const key = `${h.kind}${h.id}`;
    if ((this.hitCd[key] ?? 0) > 0) return;
    switch (h.kind) {
      case 'bumper': {
        this.hitCd[key] = 0.06;
        const img = this.bumperImgs[h.id];
        this.tweens.killTweensOf(img);
        img.setScale(1.22).setTint(0xfff3a0);
        this.tweens.add({ targets: img, scale: 1, duration: 160, ease: 'Back.easeOut', onComplete: () => img.clearTint() });
        burst(this, h.x, h.y, [0xff4fa3, 0xffd23f, 0xffffff], 10, 260);
        this.sfxAt(`bumper${h.id + 1}`, h.x, { volume: 0.55 });
        this.award(100, img.x, img.y - 30);
        break;
      }
      case 'sling':
        this.hitCd[key] = 0.12;
        this.slingFlash[h.id] = 0.12;
        burst(this, h.x, h.y, [0xff4fa3, 0xffffff], 8, 200);
        this.sfxAt('sling', h.x, { volume: 0.6 });
        this.award(30, h.x, h.y);
        break;
      case 'target': {
        const s = this.world.targets[h.id];
        if (!s.active) return;
        s.active = false;
        this.drawTargets();
        burst(this, h.x, TARGET_Y, [0xff8a1f, 0xffd23f], 14, 240);
        this.sfxAt('target', h.x, { volume: 0.6 });
        this.award(500, h.x, TARGET_Y);
        if (this.world.targets.every((tg) => !tg.active)) this.bankDown();
        break;
      }
      case 'flipper':
        if (h.speed > 500) this.sfxAt('wall', h.x, { volume: 0.25 });
        break;
      default:
        this.hitCd[key] = 0.08;
        this.sfxAt('wall', h.x, { volume: Math.min(0.45, h.speed / 3000) });
    }
  }

  private bankDown(): void {
    this.level++;
    this.world.gravity = 1250 * (1 + (this.level - 1) * 0.06);
    for (const b of this.world.bumpers) b.kick = 880 + (this.level - 1) * 40;
    this.sfx('bank', { volume: 0.7, exact: true });
    shake(this, 0.01, 220);
    flash(this, 0xff8a1f, 150, 0.25);
    this.award(5000, W / 2, TARGET_Y - 40, '#ff8a1f');
    this.banner(`${t('bank')}\n${t('levelUp', { n: this.level })}`, '#ff8a1f');
    this.bankTimer = 2.2;
    this.updateHud();
  }

  private laneCheck(): void {
    const b = this.world.ball;
    let lane = -1;
    if (Math.abs(b.y - LANE_Y) < 18) LANES.forEach((x, i) => { if (Math.abs(b.x - x) < 26) lane = i; });
    if (lane >= 0 && lane !== this.inLane) {
      if (!this.lit[lane]) {
        this.lit[lane] = true;
        this.sfxAt('lane', b.x, { volume: 0.55 });
        this.award(250, LANES[lane], LANE_Y);
        burst(this, LANES[lane], LANE_Y, 0xffd23f, 10, 180);
        if (this.lit.every(Boolean)) this.allLanes();
      } else this.award(50, LANES[lane], LANE_Y);
      this.refreshLanes();
    }
    this.inLane = lane;
  }

  private allLanes(): void {
    this.mult = Math.min(MAX_MULT, this.mult + 1);
    this.sfx('lanes', { volume: 0.7, exact: true });
    flash(this, 0xffd23f, 150, 0.25);
    this.award(2500, W / 2, LANE_Y + 90);
    this.banner(t('multUp', { n: this.mult }), '#ffd23f');
    this.updateHud();
    this.laneLamps.forEach((l, i) => this.tweens.add({ targets: l, scale: 1.6, duration: 120, yoyo: true, repeat: 2, delay: i * 60 }));
    this.time.delayedCall(900, () => { this.lit = [false, false, false, false]; this.refreshLanes(); });
  }

  private refreshLanes(): void {
    this.lit.forEach((on, i) => {
      this.laneLamps[i].setFillStyle(on ? 0xffd23f : 0x332a55);
      this.laneTexts[i].setColor(on ? '#ffd23f' : '#4a4170');
    });
  }

  // ---------- frame ----------

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const w = this.world, b = w.ball;
    const inp = this.readInput();

    // flippers (and lane change on each new press)
    const held = [inp.left, inp.right];
    for (let i = 0; i < 2; i++) {
      w.flippers[i].held = held[i];
      if (held[i] && !this.prevHeld[i]) {
        this.sfxAt('flip', w.flippers[i].px, { volume: 0.45 });
        if (this.inPlay && !this.lit.every(Boolean)) {
          // lane change: rotate the lit lamps
          this.lit = i === 0 ? [...this.lit.slice(1), this.lit[0]] : [this.lit[3], ...this.lit.slice(0, 3)];
          this.refreshLanes();
        }
      } else if (!held[i] && this.prevHeld[i]) this.sfxAt('flipdown', w.flippers[i].px, { volume: 0.2 });
    }
    this.prevHeld = held;
    this.pulse = this.pulse.map((v) => v - dt);

    // plunger
    const inShooter = this.inPlay && b.x > 652 && b.y > PLUNGER_Y - 40;
    if (inp.plunger && this.inPlay) {
      if (!this.charging) { this.charging = true; this.charge = 0; this.sfx('charge', { volume: 0.4 }); }
      this.charge = Math.min(1, this.charge + dt / 1.1);
    } else if (this.charging) {
      this.charging = false;
      if (inShooter) {
        b.vy = -(1000 + 1700 * this.charge);
        this.sfxAt('launch', LANE_X, { volume: 0.4 + this.charge * 0.4 });
        burst(this, LANE_X, PLUNGER_Y + 10, [0xffffff, 0x3ee6ff], 10, 200);
      }
      this.charge = 0;
    }
    this.launchHint.setVisible(inShooter && Math.floor(this.elapsed * 2) % 2 === 0);

    for (const k of Object.keys(this.hitCd)) this.hitCd[k] -= dt;
    this.slingFlash = this.slingFlash.map((v) => Math.max(0, v - dt));

    if (this.inPlay) {
      // keep the ball on the plunger while it charges
      if (inShooter && this.charging) { b.vy = Math.min(b.vy, 0); b.y = Math.min(b.y, PLUNGER_Y + this.charge * 26); }
      const hits = step(w, dt);
      for (const h of hits) this.onHit(h);
      this.laneCheck();
      // ball save starts when the ball leaves the shooter lane
      if (this.saveArmed && b.x < 640) { this.saveArmed = false; this.ballSave = Math.max(4, 9 - this.level); }
      this.ballSave = Math.max(0, this.ballSave - dt);
      // anti-stall: a ball resting anywhere but on a flipper or the plunger gets a gentle shove
      const slow = Math.hypot(b.vx, b.vy) < 25;
      if (slow && !inShooter && !w.flippers.some((f) => f.held) && b.y < PIVOT_Y - 60) {
        this.stall += dt;
        if (this.stall > 1.5) { this.stall = 0; b.vx += rng.pick([-1, 1]) * 120; b.vy -= 200; this.sfx('nudge', { volume: 0.3 }); }
      } else this.stall = 0;
      if (b.y > DRAIN_Y) this.drain();
    } else {
      // keep the flippers moving while no ball is on the table
      for (const f of w.flippers) {
        const target = f.held ? f.up : f.rest;
        f.angle += Phaser.Math.Clamp(target - f.angle, -26 * dt, 26 * dt);
      }
      if (this.waiting > 0) {
        this.waiting -= dt;
        if (this.waiting <= 0 && !this.isOver) {
          this.ballNo++;
          this.updateHud();
          this.serveBall();
        }
      }
    }

    // drop targets pop back up once the ball is clear of them
    if (this.bankTimer > 0) {
      this.bankTimer -= dt;
      if (this.bankTimer <= 0) {
        if (Math.abs(b.y - TARGET_Y) < 50 && b.x > 220 && b.x < 460) this.bankTimer = 0.3;
        else {
          for (const s of w.targets) s.active = true;
          this.drawTargets();
          this.sfx('target', { volume: 0.4 });
        }
      }
    }

    this.nudgeCd = Math.max(0, this.nudgeCd - dt);
    this.render(inShooter);
  }

  private render(inShooter: boolean): void {
    const w = this.world, b = w.ball;
    this.ballImg.setPosition(b.x, b.y);
    const fast = Math.hypot(b.vx, b.vy) > 900;
    if (this.inPlay && fast) { this.trail.setPosition(b.x, b.y); if (!this.trail.emitting) this.trail.start(); }
    else if (this.trail.emitting) this.trail.stop();
    this.flipImgs.forEach((img, i) => img.setRotation(w.flippers[i].angle));
    this.drawSlings();
    // plunger spring
    const g = this.plungerGfx;
    g.clear();
    const top = PLUNGER_Y + BALL_R + 2 + (inShooter || !this.inPlay ? this.charge * 26 : 0);
    g.fillStyle(0xec3013, 1).fillRect(LANE_X - 18, top, 36, 8);
    g.lineStyle(3, 0xb9c3d1, 1);
    for (let y = top + 8; y < PLUNGER_Y + 60; y += 8) g.lineBetween(LANE_X - 12, y, LANE_X + 12, y + 4);
    this.saveText.setAlpha(this.ballSave > 0 ? (this.ballSave < 2 ? (Math.floor(this.elapsed * 8) % 2 ? 1 : 0.3) : 1) : 0.15);
    this.drawButtons();
  }
}

