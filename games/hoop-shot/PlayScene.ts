import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';
import {
  type V3, type Ball, v3, add, mul, norm, len, dot, launch, stepBall, preview, SPOTS, BALL_R, RIM_Y, RIM_R,
} from './sim';
import { Cam, Arena, camFor, camBetween, drawHoop, drawBall, drawShadow, type NetState, type BallLook } from './view';
import { makeHoopTextures, glass } from './fx';

/** Arena lights hanging over the court (world), and where each one points. */
const LIGHTS: [V3, V3][] = [
  [v3(-7, 12, -1), v3(-2.5, 0, 2.5)], [v3(7, 12, -1), v3(2.5, 0, 2.5)],
  [v3(-7, 12, 9), v3(-3, 0, 6.5)], [v3(7, 12, 9), v3(3, 0, 6.5)], [v3(0, 12.5, 4), v3(0, 0, 1.5)],
];

const RACK = 5;
const IDEAL = 0.7;             // the meter value of a perfect shot
const ANGLE = 52;              // release angle in degrees
const SPIN = 13;               // backspin in rad/s
const PICKUP_S = 0.32;
const MOVE_S = 1.05;
const LIFT_S = 0.35;           // the ball rises from the chest to the set point

type Phase = 'intro' | 'shoot' | 'move' | 'wait' | 'between';

interface Flying {
  b: Ball;
  g: Phaser.GameObjects.Graphics;
  shade: Phaser.GameObjects.Image;
  trail: { x: number; y: number; r: number }[];
  fire: boolean;
  look: BallLook;
  spot: number;
  idx: number;
  resolved: boolean;
  fade: number;
  label: boolean;
}

/** Difficulty of round n (1-based). */
function roundRules(n: number) {
  const k = n - 1;
  return {
    time: Math.max(36, 62 - k * 6),
    need: Math.min(26, 9 + k * 3),
    meter: Math.max(0.55, 1.0 - k * 0.09),          // seconds from empty to full
    spread: Math.min(0.22, 0.12 + k * 0.025),       // how much a meter error changes the speed
    drift: Math.min(2.2, 0.35 + k * 0.45),          // nerves: aim sway in degrees while charging
  };
}

export class PlayScene extends ArcadeScene {
  private cam = new Cam();
  private arena!: Arena;
  private bg!: Phaser.GameObjects.Graphics;
  private bgRT!: Phaser.GameObjects.RenderTexture;
  private clockShown = '';
  private shadows!: Phaser.GameObjects.Graphics;
  private gBoard!: Phaser.GameObjects.Graphics;
  private gBack!: Phaser.GameObjects.Graphics;
  private gFront!: Phaser.GameObjects.Graphics;
  private gHeld!: Phaser.GameObjects.Graphics;
  private gHint!: Phaser.GameObjects.Graphics;
  private gMeter!: Phaser.GameObjects.Graphics;
  private gRack!: Phaser.GameObjects.Graphics;
  private gBoardHud!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  private ptsText!: Phaser.GameObjects.Text;
  private spotText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Image;
  private hintText!: Phaser.GameObjects.Text;
  private flying: Flying[] = [];
  private pool: Phaser.GameObjects.Graphics[] = [];
  private net: NetState = { stretch: 0, sway: 0, swayZ: 0, bulge: null, t: 0 };
  private rimGlow = 0;
  private camDirty = true;

  private phase: Phase = 'intro';
  private round = 1;
  private rules = roundRules(1);
  private spot = 0;
  private ball = 0;              // next ball of the rack
  private racks: (boolean | null)[][] = [];
  private pts = 0;
  private timeLeft = 60;
  private lastTick = -1;
  private streak = 0;
  private moveT = 0;
  private holding = false;
  private pickT = 0;
  private charging = false;
  private chargeT = 0;
  private liftT = 0;
  private power = 0;
  private aim = 0;
  private aimStart = 0;
  private downX = 0;
  private driftPhase = 0;
  private driftW = 2.6;
  private wasGreen = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touchUi = false;
  private shotsTaken = 0;
  private beams: Phaser.GameObjects.Image[] = [];
  private lamps: Phaser.GameObjects.Image[] = [];
  private sheens: Phaser.GameObjects.Image[] = [];
  private heldShade!: Phaser.GameObjects.Image;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flashT = 0;
  private shadePool: Phaser.GameObjects.Image[] = [];

  createGame(): void {
    this.flying = []; this.pool = [];
    this.net = { stretch: 0, sway: 0, swayZ: 0, bulge: null, t: 0 };
    this.rimGlow = 0; this.camDirty = true;
    this.phase = 'intro'; this.round = 1; this.rules = roundRules(1); this.spot = 0; this.ball = 0;
    this.racks = []; this.pts = 0; this.timeLeft = this.rules.time; this.lastTick = -1; this.streak = 0; this.moveT = 0; this.moveFrom = 0; this.moveTo = 0;
    this.holding = false; this.pickT = 0; this.charging = false; this.chargeT = 0; this.liftT = 0; this.power = 0;
    this.aim = 0; this.aimStart = 0; this.downX = 0; this.driftPhase = 0; this.driftW = 2.6; this.wasGreen = false; this.shotsTaken = 0;
    this.touchUi = this.sys.game.device.input.touch;

    makeHoopTextures(this);
    this.beams = []; this.lamps = []; this.sheens = []; this.shadePool = []; this.flashT = 0;
    this.arena = new Arena();
    // the arena is baked into a texture and only redrawn when the camera moves
    this.bg = this.make.graphics({}, false);
    this.bgRT = this.add.renderTexture(0, 0, 720, 1280).setOrigin(0).setDepth(0);
    this.clockShown = '';
    this.shadows = this.add.graphics().setDepth(1);
    this.gBoard = this.add.graphics();
    this.gBack = this.add.graphics();
    this.gFront = this.add.graphics();
    // arena lights: beams from the roof, the lamps themselves and their reflections in the varnish
    for (let i = 0; i < LIGHTS.length; i++) {
      this.beams.push(this.add.image(0, 0, 'hs-beam').setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2).setDepth(2));
      this.lamps.push(this.add.image(0, 0, 'hs-glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff2cc).setDepth(2));
      this.sheens.push(this.add.image(0, 0, 'hs-glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff2cc).setAlpha(0.38).setDepth(1.5));
    }
    this.fire = this.add.particles(0, 0, 'hs-glow', {
      speed: { min: 10, max: 60 }, angle: { min: 240, max: 300 }, lifespan: 380, scale: { start: 0.42, end: 0 }, alpha: { start: 0.8, end: 0 },
      tint: [0xffe27a, 0xff9a2a, 0xff4a1a], blendMode: Phaser.BlendModes.ADD, frequency: 14, emitting: false,
    }).setDepth(79);
    this.gHeld = this.add.graphics().setDepth(80);
    this.heldShade = this.add.image(0, 0, 'hs-shade').setDepth(80.5).setVisible(false);
    this.gHint = this.add.graphics().setDepth(78);
    this.gMeter = this.add.graphics().setDepth(90);
    this.gRack = this.add.graphics().setDepth(90);
    this.gBoardHud = this.add.graphics().setDepth(90);

    // scoreboard: shot clock, points against the target, on glass with LED-style glowing digits
    this.add.image(110, 106, glass(this, 180, 80, '#ff6a4a')).setDepth(89);
    this.add.image(520, 106, glass(this, 140, 80, '#ffd23f')).setDepth(89);
    this.add.image(360, 1198, glass(this, 360, 80, '#9aa3b4')).setDepth(89);
    this.clockText = txt(this, 110, 106, '', { title: true, size: 34, color: '#ec3013', strokeThickness: 0 }).setDepth(92);
    this.clockText.setShadow(0, 0, '#ff2a1a', 14, false, true);
    this.ptsText = txt(this, 520, 106, '', { title: true, size: 15, color: '#ffd23f', strokeThickness: 0 }).setDepth(92);
    this.ptsText.setShadow(0, 0, '#ffb020', 10, false, true);
    this.spotText = txt(this, 360, 760, '', { title: true, size: 28, color: '#f3f2f2' }).setDepth(92);
    this.bannerBg = this.add.image(360, 594, glass(this, 600, 170, '#ffd23f')).setDepth(94).setVisible(false);
    this.banner = txt(this, 360, 560, '', { title: true, size: 40, color: '#ffd23f', wrap: 660 }).setDepth(95).setVisible(false);
    this.sub = txt(this, 360, 630, '', { size: 32, color: '#ffffff', wrap: 660 }).setDepth(95).setVisible(false);
    this.hintText = txt(this, 360, 1258, '', { size: 22, color: '#cfc6e6' }).setDepth(92);

    this.setupInput();
    this.cam.set(camFor(SPOTS[0]).pos, camFor(SPOTS[0]).look);
    this.startRound();
  }

  // ---------------------------------------------------------------- input
  private setupInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT), a: kb.addKey(K.A), d: kb.addKey(K.D) };
    for (const k of ['SPACE', 'UP', 'W', 'Z']) {
      kb.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.beginCharge(); });
      kb.on(`keyup-${k}`, () => this.release());
    }
    // touch / mouse: hold anywhere to charge, slide sideways to aim, let go to shoot
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 600 && p.y < 130) return;          // pause button
      this.downX = p.x;
      this.beginCharge();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.charging || !p.isDown) return;
      this.aim = Phaser.Math.Clamp(this.aimStart + (p.x - this.downX) * 0.014, -6, 6);
    });
    this.input.on('pointerup', () => this.release());
    this.input.on('pointerupoutside', () => this.release());
  }

  private canShoot(): boolean {
    return this.phase === 'shoot' && this.holding && this.pickT >= 1 && this.timeLeft > 0 && !this.isOver;
  }

  private beginCharge(): void {
    if (!this.canShoot() || this.charging) return;
    this.charging = true;
    this.chargeT = 0;
    this.aimStart = this.aim;
    this.wasGreen = false;
    this.driftPhase = rng.int(0, 628) / 100;
    this.driftW = 2.2 + rng.int(0, 120) / 100;
  }

  private drift(): number {
    return this.rules.drift * Math.sin(this.driftPhase + this.chargeT * this.driftW);
  }

  private meterAt(tc: number): number {
    const x = tc / this.rules.meter;
    const m = x % 2;
    return m < 1 ? m : 2 - m;
  }

  // ---------------------------------------------------------------- flow
  private startRound(): void {
    this.rules = roundRules(this.round);
    this.racks = SPOTS.map(() => new Array(RACK).fill(null));
    this.pts = 0; this.timeLeft = this.rules.time; this.lastTick = -1;
    this.ball = 0; this.holding = false; this.charging = false;
    this.hud.setRight(t('round', { n: this.round }));
    const from = this.spot;
    this.spot = 0;
    this.phase = 'intro';
    if (from !== 0) this.moveCamera(from, 0);
    this.showBanner(t('round', { n: this.round }), '#ffd23f', t('target', { n: this.rules.need }));
    this.sfx('levelup', { volume: 0.5 });
    this.time.delayedCall(1500, () => {
      if (this.isOver) return;
      this.hideBanner();
      this.phase = 'shoot';
      this.announceSpot();
      this.pickUp();
    });
    this.updateBoard();
  }

  private moveFrom = 0;
  private moveTo = 0;
  private moveCamera(from: number, to: number): void {
    this.moveFrom = from; this.moveTo = to; this.moveT = 0;
    this.sfx('throw', { volume: 0.25, rate: 0.7 });
  }

  private announceSpot(): void {
    const key = SPOTS[this.spot].key;
    this.tweens.killTweensOf(this.spotText);
    this.spotText.setText(t(key)).setScale(0.6).setAlpha(1);
    this.tweens.add({ targets: this.spotText, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.spotText, alpha: 0, delay: 1100, duration: 350 });
  }

  private pickUp(): void {
    if (this.isOver) return;
    this.holding = true;
    this.pickT = 0;
    this.liftT = 0;
    this.power = 0;
    this.aim = 0;
    this.updateBoard();
  }

  private release(): void {
    if (!this.charging) return;
    this.charging = false;
    if (!this.canShoot()) return;
    const from = this.holdPos();
    const money = this.ball === RACK - 1;
    const b = launch(from, { power: this.power, ideal: IDEAL, spread: this.rules.spread, aimDeg: this.aim + this.drift(), angleDeg: ANGLE, spin: SPIN }, money);
    const g = this.pool.pop() ?? this.add.graphics();
    g.setVisible(true).setAlpha(1);
    const shade = this.shadePool.pop() ?? this.add.image(0, 0, 'hs-shade');
    shade.setVisible(true).setAlpha(1);
    this.flying.push({ b, g, shade, trail: [], fire: this.streak >= 3, look: { phase: 0, roll: 0, money }, spot: this.spot, idx: this.ball, resolved: false, fade: 1, label: false });
    this.shotsTaken++;
    this.holding = false;
    this.gHeld.clear();
    this.heldShade.setVisible(false);
    this.sfx('throw', { volume: 0.5, rate: 1.05 });
    const s = this.cam.project(from);
    if (s) burst(this, s.x, s.y, [0xffffff, 0xffd23f], 6, 120);
    this.ball++;
    if (this.ball < RACK) this.time.delayedCall(PICKUP_S * 1000, () => { if (this.phase === 'shoot') this.pickUp(); });
    else if (this.spot < SPOTS.length - 1) {
      this.time.delayedCall(420, () => {
        if (this.isOver || this.phase !== 'shoot') return;
        this.phase = 'move';
        this.moveCamera(this.spot, this.spot + 1);
      });
    } else this.phase = 'wait';
    this.updateBoard();
  }

  private holdPos(): V3 {
    const s = SPOTS[this.spot];
    const h = norm(v3(-s.x, 0, -s.z));
    const lift = Phaser.Math.Easing.Sine.Out(Math.min(1, this.liftT / LIFT_S));
    return add(v3(s.x, 1.4 + lift * 0.85, s.z), mul(h, 0.32));
  }

  private endRound(): void {
    if (this.isOver || this.phase === 'between') return;
    this.phase = 'between';
    this.holding = false; this.charging = false;
    this.gHeld.clear(); this.gMeter.clear(); this.gHint.clear();
    if (this.pts >= this.rules.need) {
      const bonus = Math.ceil(this.timeLeft) * 20;
      if (bonus > 0) this.addScore(bonus);
      this.showBanner(t('qualified'), '#5dff7a', `${this.pts} / ${this.rules.need}${bonus > 0 ? '   ' + t('timeBonus', { n: bonus }) : ''}`);
      this.sfx('beater', { volume: 0.6, exact: true });
      flash(this, 0x5dff7a, 160);
      burst(this, 360, 560, [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xffffff], 60, 520);
      this.time.delayedCall(2300, () => { if (!this.isOver) { this.round++; this.startRound(); } });
    } else {
      this.showBanner(t('out'), '#ec3013', `${this.pts} / ${this.rules.need}`);
      this.sfx('miss', { volume: 0.6 });
      shake(this, 0.01, 260);
      this.endGame({ title: this.timeLeft <= 0 ? t('timeUp') : t('out'), delay: 1500 });
    }
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;

    // shot clock
    if ((this.phase === 'shoot' || this.phase === 'move' || this.phase === 'wait') && this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      const s = Math.ceil(this.timeLeft);
      if (s <= 5 && s > 0 && s !== this.lastTick) {
        this.lastTick = s;
        this.sfx('tick', { volume: s <= 2 ? 0.6 : 0.45, rate: s <= 2 ? 1.12 : 1 });
        this.clockText.setScale(1.25);
        this.tweens.add({ targets: this.clockText, scale: 1, duration: 200 });
      }
      if (this.timeLeft === 0) {
        this.sfx('buzzer', { volume: 0.6, exact: true });
        this.charging = false; this.holding = false; this.gHeld.clear();
        this.phase = 'wait';
        this.showBanner(t('timeUp'), '#ffd23f', '');
        this.time.delayedCall(900, () => this.hideBanner());
      }
    }
    const clock = this.clockStr();
    if (clock !== this.clockShown) {
      this.clockShown = clock;
      this.clockText.setText(clock).setColor(this.timeLeft <= 5 ? '#ffd23f' : '#ec3013');
    }

    // camera between racks
    if (this.moveT < 1 && this.moveFrom !== this.moveTo) {
      this.moveT = Math.min(1, this.moveT + dt / MOVE_S);
      const e = Phaser.Math.Easing.Sine.InOut(this.moveT);
      const c = camBetween(SPOTS[this.moveFrom], SPOTS[this.moveTo], e);
      this.cam.set(c.pos, c.look);
      this.camDirty = true;
      if (this.moveT >= 1) {
        this.moveFrom = this.moveTo;
        if (this.phase === 'move') {
          this.spot = this.moveTo;
          this.ball = 0;
          this.phase = 'shoot';
          this.announceSpot();
          this.pickUp();
          this.updateBoard();
        }
      }
    }
    if (this.camDirty) {
      this.arena.draw(this.bg, this.cam);
      this.bgRT.clear().draw(this.bg);
      this.camDirty = false;
      this.placeLights();
    }
    // camera flashes in the crowd now and then
    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashT = 0.25 + Math.random() * 0.5; this.flashes(1); }

    // the ball in hand
    if (this.holding) {
      this.pickT = Math.min(1, this.pickT + dt / PICKUP_S);
      if (this.charging) {
        this.chargeT += dt;
        this.liftT += dt;
        this.power = this.meterAt(this.chargeT);
        const green = Math.abs(this.power - IDEAL) < this.greenHalf();
        if (green && !this.wasGreen) this.sfx('tick', { volume: 0.18, rate: 1.6 });
        this.wasGreen = green;
      }
      const k = this.keys;
      const ax = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      if (ax) this.aim = Phaser.Math.Clamp(this.aim + ax * 4 * dt, -6, 6);
    }
    this.drawHeld();
    this.drawMeter();
    this.drawHint();

    // balls in flight
    this.shadows.clear();
    let bulge: V3 | null = null;
    for (const f of this.flying) {
      const ev = stepBall(f.b, dt);
      this.ballEvents(f, ev);
      if (f.b.made && f.b.p.y < RIM_Y + 0.1 && f.b.p.y > RIM_Y - 0.6 && Math.hypot(f.b.p.x, f.b.p.z) < RIM_R + 0.1) bulge = f.b.p;
      // seams: backspin about the spin axis as the camera sees it
      const w = f.b.w, wl = len(w);
      if (wl > 0.01) {
        const ax = dot(w, this.cam.right), ay = dot(w, this.cam.up);
        f.look.roll = Math.atan2(-ay, ax);
        f.look.phase += wl * dt * (dot(w, this.cam.right) >= 0 ? 1 : -1);
      }
      if (!f.resolved && (f.b.floor >= 1 || f.b.t > 4) && !f.b.made) this.onMiss(f);
      if (f.b.made && f.b.floor >= 2 || f.b.t > 5 || (f.resolved && f.b.floor >= 3)) f.fade -= dt * 3;
    }
    this.net.bulge = bulge ? { p: bulge } : null;
    for (const f of this.flying) {
      if (f.fade <= 0) { f.g.clear().setVisible(false); this.pool.push(f.g); f.shade.setVisible(false); this.shadePool.push(f.shade); }
    }
    this.flying = this.flying.filter((f) => f.fade > 0);
    for (const f of this.flying) {
      const pr = this.cam.project(f.b.p);
      f.g.clear();
      if (!pr) continue;
      drawShadow(this.shadows, this.cam, f.b.p, BALL_R);
      f.g.setDepth(this.depthOf(pr.z));
      const r = BALL_R * pr.s, a = Math.max(0, Math.min(1, f.fade));
      // a fading trail behind a ball in the air
      if (!f.b.made && f.b.floor === 0) { f.trail.push({ x: pr.x, y: pr.y, r }); if (f.trail.length > 7) f.trail.shift(); } else if (f.trail.length) f.trail.shift();
      f.trail.forEach((p, i) => f.g.fillStyle(f.fire ? 0xff8a2a : 0xffe2c0, (0.22 * (i + 1)) / f.trail.length * a).fillCircle(p.x, p.y, p.r * (0.45 + 0.5 * (i / f.trail.length))));
      drawBall(f.g, pr.x, pr.y, r, f.look, a);
      f.shade.setPosition(pr.x, pr.y).setDisplaySize(r * 2.02, r * 2.02).setDepth(f.g.depth + 0.01).setAlpha(a);
      if (f.look.money && !f.b.made && f.b.t < 2 && rng.chance(0.4)) burst(this, pr.x, pr.y, [0xffd23f, 0xffffff], 1, 40);
    }
    // a ball shot on a hot streak burns
    const hot = this.flying.find((f) => f.fire && !f.b.made && f.b.floor === 0 && f.fade > 0.5);
    const hp = hot ? this.cam.project(hot.b.p) : null;
    if (hp) { this.fire.setPosition(hp.x, hp.y); this.fire.setDepth(this.depthOf(hp.z) - 0.1); if (!this.fire.emitting) this.fire.start(); }
    else if (this.fire.emitting) this.fire.stop();
    if (this.holding) {
      const hp = this.holdPos();
      if (this.pickT >= 1) drawShadow(this.shadows, this.cam, hp, BALL_R);
    }

    // hoop
    this.net.t += dt;
    this.net.stretch = Math.max(0, this.net.stretch - dt * 1.6);
    this.net.sway *= Math.pow(0.05, dt);
    this.net.swayZ *= Math.pow(0.05, dt);
    this.rimGlow = Math.max(0, this.rimGlow - dt * 2.5);
    drawHoop(this.gBoard, this.gBack, this.gFront, this.cam, this.net, this.rimGlow);
    const rz = this.cam.depth(v3(0, RIM_Y, 0));
    this.gBoard.setDepth(this.depthOf(this.cam.depth(v3(0, 3.4, -0.4))));
    this.gBack.setDepth(this.depthOf(rz + 0.1));
    this.gFront.setDepth(this.depthOf(rz - 0.1));

    // the round ends when the last ball (or the buzzer) has played out
    if ((this.phase === 'wait') && this.flying.every((f) => f.resolved)) this.endRound();
  }

  private depthOf(z: number): number {
    return 10 + Math.max(0, 60 - z);
  }

  private clockStr(): string {
    const s = Math.ceil(this.timeLeft);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private greenHalf(): number {
    return 0.034 * (0.12 / this.rules.spread);
  }

  // ---------------------------------------------------------------- events
  private ballEvents(f: Flying, ev: { rim: number; board: number; floor: number; made: boolean; rimX: number }): void {
    const rimS = this.cam.project(v3(ev.rimX, RIM_Y, 0));
    if (ev.rim > 0) {
      this.sfxAt(ev.rim > 3 ? 'rim3' : rng.pick(['rim', 'rim2']), rimS?.x ?? 360, { volume: Math.min(0.8, 0.2 + ev.rim / 8) });
      this.net.sway += (f.b.v.x > 0 ? 1 : -1) * Math.min(0.06, ev.rim * 0.012);
      this.net.swayZ += Math.min(0.05, ev.rim * 0.01);
      this.rimGlow = Math.min(1, this.rimGlow + ev.rim / 6);
      if (rimS) burst(this, rimS.x, rimS.y, [0xffb066, 0xffffff], Math.min(10, 2 + Math.round(ev.rim)), 140);
      if (ev.rim > 3) shake(this, 0.004, 90);
    }
    if (ev.board > 0) {
      const bs = this.cam.project(f.b.p);
      this.sfxAt(rng.pick(['board', 'board2']), bs?.x ?? 360, { volume: Math.min(0.7, 0.25 + ev.board / 10) });
      if (ev.board > 4) shake(this, 0.003, 70);
    }
    if (ev.floor > 0) {
      const fs = this.cam.project(f.b.p);
      this.sfxAt(rng.pick(['bounce', 'bounce2']), fs?.x ?? 360, { volume: Math.min(0.6, ev.floor / 12) });
    }
    if (ev.made) this.onMake(f);
  }

  private onMake(f: Flying): void {
    if (f.resolved) return;
    f.resolved = true;
    this.racks[f.spot][f.idx] = true;
    const swish = !f.b.rim && !f.b.board;
    const value = f.b.money ? 2 : 1;
    this.pts += value;
    this.streak++;
    let pts = value * 100;
    if (swish) pts += 50;
    if (this.streak >= 3) pts += Math.min(150, 25 * (this.streak - 2));
    const at = this.cam.project(v3(0, RIM_Y, 0));
    const ax = at?.x ?? 360, ay = at?.y ?? 400;
    this.addScore(pts, ax, ay - 70);
    this.net.stretch = swish ? 1.25 : 0.9;
    this.sfxAt('net', ax, { volume: swish ? 0.55 : 0.4 });
    this.sfxAt(swish ? 'swish' : 'score', ax, { volume: 0.55, rate: 1 + Math.min(6, this.streak - 1) * 0.04 });
    burst(this, ax, ay + 30, swish ? [0xffffff, 0x5dff7a, 0x3ee6ff] : [0xffd23f, 0xff7a1a, 0xffffff], swish ? 26 : 16, swish ? 320 : 240);
    if (swish) this.swishRing(ax, ay);
    const glow = this.add.image(ax, ay + 20, 'hs-glow').setDepth(86).setBlendMode(Phaser.BlendModes.ADD).setTint(swish ? 0xbfffd8 : 0xffd27a).setScale(0.8);
    this.tweens.add({ targets: glow, scale: 3.2, alpha: 0, duration: 450, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
    this.flashes(f.b.money ? 26 : swish ? 14 : 8);
    if (this.streak === 3) { popup(this, ax, ay + 250, t('onFire'), '#ff8a2a', 30); this.sfx('swish', { volume: 0.4, rate: 0.8 }); }
    // the big call goes under the hoop
    let msg = '', color = '#ffffff';
    if (f.b.money) { msg = t('moneyBall'); color = '#ffd23f'; }
    else if (swish) { msg = t('swish'); color = '#5dff7a'; }
    else if (f.b.board) { msg = t('bank'); color = '#3ee6ff'; }
    if (f.b.money) {
      this.sfx('beater', { volume: 0.55, exact: true });
      flash(this, 0xffd23f, 140);
      shake(this, 0.007, 160);
      burst(this, ax, ay, [0xffd23f, 0xec3013, 0x2d6cdf, 0xffffff], 40, 420);
    }
    if (msg) popup(this, ax, ay + 150, msg, color, 30);
    if (this.streak >= 3) popup(this, ax, ay + 200, t('streak', { n: this.streak }), '#ff4fa3', 24);
    if (this.racks[f.spot].every((r) => r === true)) {
      this.time.delayedCall(450, () => {
        if (this.isOver) return;
        this.addScore(250, 360, 700);
        popup(this, 360, 760, t('perfectRack'), '#5dff7a', 34);
        this.sfx('levelup', { volume: 0.55 });
        flash(this, 0x5dff7a, 120);
      });
    }
    this.updateBoard();
  }

  private swishRing(x: number, y: number): void {
    const ring = this.add.ellipse(x, y + 20, 60, 16).setStrokeStyle(4, 0xffffff, 0.9).setDepth(85);
    this.tweens.add({ targets: ring, scaleX: 3, scaleY: 2.2, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

  private onMiss(f: Flying): void {
    if (f.resolved) return;
    f.resolved = true;
    this.racks[f.spot][f.idx] = false;
    const broke = this.streak >= 3;
    this.streak = 0;
    const at = this.cam.project(v3(0, RIM_Y, 0));
    const ax = at?.x ?? 360, ay = at?.y ?? 400;
    let msg: string;
    if (!f.b.rim && !f.b.board) msg = t('airball');
    else if (f.b.rim && Math.abs(f.b.power - f.b.ideal) < this.greenHalf() * 1.3) msg = t('rimOut');
    else msg = f.b.power < f.b.ideal ? t('short') : t('long');
    popup(this, ax, ay + 150, msg, '#ec3013', 26);
    if (broke) this.sfx('miss', { volume: 0.35 });
    this.updateBoard();
  }

  // ---------------------------------------------------------------- lights and crowd
  /** Lines the beams, lamps and floor reflections up with the camera (called when it moves). */
  private placeLights(): void {
    LIGHTS.forEach(([L, T], i) => {
      const top = this.cam.project(L), bot = this.cam.project(T);
      const beam = this.beams[i], lamp = this.lamps[i], sheen = this.sheens[i];
      if (top && bot) {
        const dx = bot.x - top.x, dy = bot.y - top.y;
        beam.setVisible(true).setPosition(top.x, top.y).setRotation(Math.atan2(dy, dx) - Math.PI / 2).setDisplaySize(Math.max(80, 6 * bot.s), Math.hypot(dx, dy));
      } else beam.setVisible(false);
      if (top) lamp.setVisible(true).setPosition(top.x, top.y).setScale(Math.max(0.25, Math.min(1.2, top.s / 120)));
      else lamp.setVisible(false);
      // the pool of light where the beam meets the varnished floor
      if (bot && bot.y > 0 && bot.y < 1280) sheen.setVisible(true).setPosition(bot.x, bot.y).setDisplaySize(Math.min(520, 4.5 * bot.s), Math.min(170, 1.3 * bot.s));
      else sheen.setVisible(false);
    });
  }

  /** Camera flashes popping in the stands. */
  private flashes(n: number): void {
    const seen = this.arena.seen;
    if (!seen.length) return;
    for (let i = 0; i < n; i++) {
      const p = seen[Math.floor(Math.random() * seen.length)];
      const st = this.add.image(p.x, p.y, 'hs-star').setBlendMode(Phaser.BlendModes.ADD).setDepth(3).setScale(0).setAngle(Math.random() * 45);
      this.tweens.add({ targets: st, scale: Math.min(0.7, 0.2 + p.s * 0.08), duration: 70, delay: i * 25, yoyo: true, hold: 40, onComplete: () => st.destroy() });
    }
  }

  // ---------------------------------------------------------------- drawing
  private drawHeld(): void {
    const g = this.gHeld;
    g.clear();
    if (!this.holding) { this.heldShade.setVisible(false); return; }
    const hp = this.holdPos();
    const pr = this.cam.project(hp);
    if (!pr) return;
    let x = pr.x, y = pr.y, r = BALL_R * pr.s;
    if (this.pickT < 1) {
      // from the rack at the bottom into the hands
      const e = Phaser.Math.Easing.Quadratic.Out(this.pickT);
      const [rx, ry] = this.rackSlot(this.ball);
      x = Phaser.Math.Linear(rx, x, e); y = Phaser.Math.Linear(ry, y, e) - Math.sin(Math.PI * e) * 60; r = Phaser.Math.Linear(24, r, e);
    }
    const money = this.ball === RACK - 1;
    drawBall(g, x, y, r, { phase: 0.7, roll: -0.25, money });
    this.heldShade.setVisible(true).setPosition(x, y).setDisplaySize(r * 2.02, r * 2.02);
    if (this.streak >= 3 && this.pickT >= 1) {
      const a = 0.35 + Math.sin(this.elapsed * 10) * 0.2;
      g.lineStyle(6, 0xff8a2a, a).strokeCircle(x, y, r + 6);
      g.lineStyle(3, 0xffe27a, a).strokeCircle(x, y, r + 12);
    }
    if (money && this.pickT >= 1) {
      const a = 0.35 + Math.sin(this.elapsed * 8) * 0.2;
      g.lineStyle(4, 0xffd23f, a).strokeCircle(x, y, r + 8);
    }
  }

  private rackSlot(i: number): [number, number] {
    return [232 + i * 64, 1196];
  }

  /** The aim direction (yaw) the shot would leave at now. */
  private aimNow(): number {
    return this.aim + (this.charging ? this.drift() : 0);
  }

  private drawMeter(): void {
    const g = this.gMeter;
    g.clear();
    if (!this.holding || this.pickT < 1 || this.phase !== 'shoot') return;
    const x = 640, y0 = 1060, h = 330, w = 34;
    g.fillStyle(0x000000, 0.55).fillRoundedRect(x - w / 2 - 6, y0 - h - 6, w + 12, h + 12, 10);
    const gh = this.greenHalf();
    const yOf = (p: number) => y0 - p * h;
    g.fillStyle(0xffd23f, 0.35).fillRect(x - w / 2, yOf(IDEAL + gh * 2), w, gh * 4 * h);
    g.fillStyle(0x5dff7a, 0.85).fillRect(x - w / 2, yOf(IDEAL + gh), w, gh * 2 * h);
    if (this.charging) {
      const p = this.power;
      const green = Math.abs(p - IDEAL) < gh;
      g.fillStyle(green ? 0x5dff7a : p > IDEAL ? 0xff7a1a : 0xffffff, 0.95).fillRect(x - w / 2 + 6, yOf(p), w - 12, p * h);
      g.fillStyle(0xffffff, 1).fillTriangle(x - w / 2 - 18, yOf(p) - 10, x - w / 2 - 18, yOf(p) + 10, x - w / 2 - 4, yOf(p));
    } else {
      const a = 0.4 + Math.sin(this.elapsed * 6) * 0.3;
      g.lineStyle(3, 0xffffff, a).strokeRoundedRect(x - w / 2 - 6, y0 - h - 6, w + 12, h + 12, 10);
    }
    g.lineStyle(3, 0xffffff, 0.6).strokeRoundedRect(x - w / 2, y0 - h, w, h, 6);
  }

  private drawHint(): void {
    const g = this.gHint;
    g.clear();
    if (!this.holding || this.pickT < 1 || this.phase !== 'shoot') return;
    const from = this.holdPos();
    const sp = { power: this.charging ? this.power : IDEAL, ideal: IDEAL, spread: this.rules.spread, aimDeg: this.aimNow(), angleDeg: ANGLE, spin: SPIN };
    // aim marker at the rim: where this direction crosses the ring's distance
    const s = SPOTS[this.spot];
    const d = Math.hypot(s.x, s.z) - 0.32;
    const yaw = Math.atan2(-from.x, -from.z) + (this.aimNow() * Math.PI) / 180;
    const target = v3(from.x + Math.sin(yaw) * d, RIM_Y + 0.55, from.z + Math.cos(yaw) * d);
    const pr = this.cam.project(target);
    const ok = Math.abs(this.aimNow()) < 0.6;
    if (pr) {
      const c = ok ? 0x5dff7a : 0xffd23f;
      g.lineStyle(4, c, 0.9);
      g.lineBetween(pr.x - 18, pr.y - 10, pr.x, pr.y + 4).lineBetween(pr.x + 18, pr.y - 10, pr.x, pr.y + 4);
    }
    // trajectory hint: the whole arc early in the first round, then a short stub, then nothing
    const full = this.round === 1 && this.spot <= 1;
    const stub = (this.round === 1) || (this.round === 2 && this.spot === 0);
    if (!full && !stub) return;
    const pts = preview(from, sp);
    const n = full ? pts.length : Math.floor(pts.length * 0.35);
    for (let i = 2; i < n; i += 2) {
      const q = this.cam.project(pts[i]);
      if (!q) continue;
      const a = full ? 0.75 - (i / pts.length) * 0.4 : 0.7 * (1 - i / n);
      g.fillStyle(0xffffff, a).fillCircle(q.x, q.y, Math.min(9, Math.max(2.5, 0.022 * q.s)));
    }
  }

  /** Scoreboard: clock, points, the five racks (made / missed / to come) and the current rack. */
  private updateBoard(): void {
    const g = this.gBoardHud;
    g.clear();
    // clock on the left, points against the target on the right: the middle stays free for the arc
    this.ptsText.setText(`${t('ptsLabel')} ${this.pts}\n${t('needLabel')} ${this.rules.need}`).setColor(this.pts >= this.rules.need ? '#5dff7a' : '#ffd23f');
    // rack grid (one column per spot)
    for (let s = 0; s < SPOTS.length; s++) {
      for (let i = 0; i < RACK; i++) {
        const x = 32 + s * 34 + i * 6, y = 160;
        const v = this.racks[s]?.[i];
        const col = v === true ? 0x5dff7a : v === false ? 0xec3013 : s === this.spot && this.phase !== 'between' ? 0xffffff : 0x55525e;
        g.fillStyle(col, v === null && s !== this.spot ? 0.6 : 1).fillCircle(x, y, i === RACK - 1 ? 3.2 : 2.5);
      }
    }
    // the rack at the bottom: balls still to shoot
    const r = this.gRack;
    r.clear();
    r.lineStyle(6, 0x8a8f9e, 1).lineBetween(196, 1222, 524, 1222);
    r.lineStyle(4, 0x6c7180, 1).lineBetween(206, 1222, 200, 1240).lineBetween(514, 1222, 520, 1240);
    for (let i = 0; i < RACK; i++) {
      const left = i >= this.ball || this.phase === 'intro';
      if (!left || (i === this.ball && this.holding)) continue;
      const [x, y] = this.rackSlot(i);
      drawBall(r, x, y, 24, { phase: 0.7, roll: 0.2 * i, money: i === RACK - 1 });
    }
    this.hintText.setText(this.shotsTaken < 6 ? (this.touchUi ? t('hintTouch') : t('hintKeys')) : '');
  }

  private showBanner(title: string, color: string, sub: string): void {
    this.banner.setText(title).setColor(color).setVisible(true).setScale(0.3).setAlpha(1);
    this.sub.setText(sub).setVisible(!!sub).setAlpha(0);
    this.tweens.killTweensOf([this.banner, this.sub, this.bannerBg]);
    this.bannerBg.setVisible(true).setAlpha(1).setScale(0.4, 0.4);
    this.tweens.add({ targets: [this.banner, this.bannerBg], scale: 1, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.sub, alpha: 1, duration: 300, delay: 150 });
  }

  private hideBanner(): void {
    this.tweens.add({ targets: [this.banner, this.sub, this.bannerBg], alpha: 0, duration: 250 });
  }
}

