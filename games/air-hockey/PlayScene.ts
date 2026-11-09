import Phaser from 'phaser';
import { ArcadeScene, Controls, shake, t, rng, net, upper, isEasy } from '@core';
import { ftxt, freshTextCanvases, softFlash } from './fasttext';
import {
  W, L, R, T, B, MID, CR, GOAL_L, GOAL_R, POST_R, POCKET, PUCK_R, MAL_R, BIG_R,
  RED, BLUE, GOLD, VIOLET, POWER_COL, type PowerKind, css, tableKey, makeHockeyTextures,
} from './table';

export { makeHockeyTextures } from './table';

// ---------------------------------------------------------------- tuning
// Physics
const MAX_PUCK = 2100;          // puck speed cap (px/s)
const FAST_MAX = 2700;          // cap while the fast-puck power is on
const FAST_MIN = 620;           // ...and the puck never drops below this then
const FRICTION = 0.32;          // exponential air-table drag per second
const WALL_E = 0.9;             // restitution off the rails
const WALL_SLIDE = 0.985;       // tangential speed kept on a rail hit
const MALLET_E = 0.88;          // restitution off a mallet, on top of the mallet's own velocity
const MIN_HIT = 240;            // any touch sends the puck away at least this fast
const FINGER_MAX = 6000;        // px/s: only tames the first jump to a far-off finger
const KEY_SPEED = 1050, KEY_ACCEL = 12000;   // keys: top speed and acceleration (px/s, px/s²)
const STEP_PX = 9;              // sub-steps: nothing moves further than this per step
const MAX_STEPS = 40;
const WIN_GOALS = 7;
const MAX_LEVEL = 7;
/**
 * Normal and Easy (practice). The AI's skill s runs 0 (level 1) to `ramp` (level 7). Easy: skill
 * tops out at 0.45 (between levels 3 and 4), it thinks and reacts to fresh shots 50% later, aims and
 * places itself with 60% more noise and moves at 80% of its speed.
 */
const TUNING = {
  normal: { ramp: 1, react: 1, noise: 1, speed: 1 },
  easy: { ramp: 0.45, react: 1.5, noise: 1.6, speed: 0.8 },
};
// Goal sequence (real seconds)
const SLOWMO = 0.7, SLOW_K = 0.18;
const GOAL_SHOW = 1.95;
const REPLAY_AT = 0.8, REPLAY_DUR = 0.75, REPLAY_SPAN = 1.0;
const COUNT = 3, COUNT_STEP = 0.38;
// Power-ups (solo only)
const PW_FIRST = [9, 14], PW_GAP = [13, 20], PW_LIFE = 8, BIG_TIME = 9, FAST_TIME = 7;
// Online
const MIRROR_Y = T + B;          // guest view: x' = 720 - x, y' = MIRROR_Y - y
const SEND_MS = 50;              // ~20 messages per second each way
const REMOTE_SPEED = 3200;       // the remote mallet follows its reports quickly

type Who = 0 | 1 | -1;           // 0 = bottom player (you / host), 1 = top player (CPU / guest)
type Phase = 'serve' | 'live' | 'goal';

interface Puck {
  x: number; y: number; vx: number; vy: number;
  img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image;
  trail: Phaser.GameObjects.Particles.ParticleEmitter;
  alive: boolean; last: Who; walls: number; sc: number; hist: number[];
}
interface Mallet {
  x: number; y: number; vx: number; vy: number; r: number;
  img: Phaser.GameObjects.Image; pulse: number; bigT: number; col: number; bottom: boolean;
}
interface Pickup { kind: PowerKind; x: number; y: number; t: number; img: Phaser.GameObjects.Image }
/** Host → guest state (host coordinates). `c` = ms left in the serve countdown (optional). */
interface Snap { p: number[]; m: number[]; k: number[]; l: number; h: number; c?: number }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private fxLow!: Phaser.GameObjects.Graphics;
  private fxHigh!: Phaser.GameObjects.Graphics;
  private uiG!: Phaser.GameObjects.Graphics;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bigSparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkCols: number[] = [0xffffff];
  private pucks: Puck[] = [];
  private me!: Mallet;
  private op!: Mallet;
  private ghost!: Phaser.GameObjects.Image;
  // HUD
  private nameMe!: Phaser.GameObjects.Text;
  private nameOp!: Phaser.GameObjects.Text;
  private numMe!: Phaser.GameObjects.Text;
  private numOp!: Phaser.GameObjects.Text;
  private centerLbl!: Phaser.GameObjects.Text;
  private scoreNum?: Phaser.GameObjects.Text;
  private bannerT!: Phaser.GameObjects.Text;
  private countT!: Phaser.GameObjects.Text;
  private replayT!: Phaser.GameObjects.Text;
  private shownScore = -1;
  private shownCenter = '';
  private uiDirty = true;
  // match
  private myGoals = 0;
  private opGoals = 0;
  private phase: Phase = 'serve';
  private phaseT = 0;              // real seconds left in this phase
  private goalAge = 99;            // real seconds since the last goal
  private countShown = -1;
  private serveTo: Who = 0;
  private slowT = 0;
  private replay: { pts: number[]; col: number } | null = null;
  private replayFlashed = false;
  private level = 1;
  tune = TUNING.normal;
  private goalFlash = 0;
  private goalFlashTop = true;
  private shock: Array<{ x: number; y: number; t: number; col: number; max: number }> = [];
  // input
  private pointerId = -1;
  private tx = 360; private ty = 1000;
  private kvx = 0; private kvy = 0;
  // AI
  private aiTx = 360; private aiTy = T + 115;
  private aiThink = 0;
  private aiHes = 0;
  private aiStrike = 0;
  private aiShot: { aim: number; bank: number } | null = null;
  private aiVx = 0; private aiVy = 0;
  private aiMode = '';
  private aiLagged = false;
  private aiCounter = -1;            // -1 undecided, 0 block, 1 counter-shot (decided once per incoming puck)
  private ending = false;
  // power-ups
  private pickup: Pickup | null = null;
  private pwTimer = 0;
  private fastT = 0;
  private hitSfx = 0;
  private wallSfx = 0;
  // online
  private online = false;
  private host = true;
  private sendT = 0;
  private pingT = 0;
  private lat = 0.04;              // estimated one-way latency (s), guest only
  private rx = 360; private ry = T + 150; private rvx = 0; private rvy = 0; private rAt = 0;
  private corrX = 0; private corrY = 0;
  private localHitT = -1e9;
  private hits = 0;
  private seenHits = 0;
  private held = false;
  private quiet = false;
  private snapX = 360; private snapY = MID;

  createGame(): void {
    freshTextCanvases(this);
    makeHockeyTextures(this);
    this.useHud = false;
    this.online = net.active; this.host = !this.online || net.isHost;
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.myGoals = 0; this.opGoals = 0; this.phase = 'serve'; this.phaseT = 0; this.goalAge = 99; this.countShown = -1;
    this.serveTo = 0; this.slowT = 0; this.replay = null; this.replayFlashed = true; this.level = 1;
    this.goalFlash = 0; this.goalFlashTop = true; this.shock = [];
    this.pointerId = -1; this.kvx = this.kvy = 0;
    this.aiTx = 360; this.aiTy = T + 115; this.aiThink = 0; this.aiHes = 0; this.aiStrike = 0; this.aiShot = null; this.aiVx = this.aiVy = 0; this.aiCounter = -1; this.aiLagged = false; this.ending = false;
    this.pickup = null; this.pwTimer = PW_FIRST[0] + Math.random() * (PW_FIRST[1] - PW_FIRST[0]); this.fastT = 0;
    this.hitSfx = 0; this.wallSfx = 0; this.shownScore = -1; this.shownCenter = ''; this.uiDirty = true;
    this.sendT = 0; this.pingT = 0; this.lat = 0.04; this.rx = 360; this.ry = T + 150; this.rvx = this.rvy = 0; this.rAt = 0;
    this.corrX = this.corrY = 0; this.localHitT = -1e9; this.hits = 0; this.seenHits = 0; this.held = false; this.quiet = false;
    this.snapX = 360; this.snapY = MID;
    this.pucks = [];

    // seat colours: the host (and the solo player) is red, the guest blue; you are always at the bottom
    const myCol = this.online && !this.host ? BLUE : RED;
    const opCol = myCol === RED ? BLUE : RED;
    this.add.image(0, 0, tableKey(this, myCol, opCol)).setOrigin(0).setDepth(0);
    this.fxLow = this.add.graphics().setDepth(1);
    this.fxHigh = this.add.graphics().setDepth(8);

    const sparkCfg = (speed: [number, number], life: [number, number], scale: number) => ({
      speed: { min: speed[0], max: speed[1] }, angle: { min: 0, max: 360 },
      lifespan: { min: life[0], max: life[1] }, scale: { start: scale, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, emitting: false,
      tint: { onEmit: () => this.sparkCols[(Math.random() * this.sparkCols.length) | 0] },
    }) as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
    this.sparks = this.add.particles(0, 0, 'ah-dot', sparkCfg([70, 330], [180, 480], 0.75)).setDepth(7);
    this.bigSparks = this.add.particles(0, 0, 'ah-dot', sparkCfg([160, 820], [450, 1150], 1.15)).setDepth(7);

    for (let i = 0; i < 2; i++) this.pucks.push(this.makePuck(i === 0));
    this.ghost = this.add.image(0, 0, 'ah-puck').setDepth(3).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    const meKey = myCol === RED ? 'ah-mallet-red' : 'ah-mallet-blue';
    const opKey = myCol === RED ? 'ah-mallet-blue' : 'ah-mallet-red';
    this.me = this.makeMallet(360, B - 160, meKey, myCol, true);
    this.op = this.makeMallet(360, T + 160, opKey, opCol, false);
    this.tx = this.me.x; this.ty = this.me.y;

    this.buildUi(myCol, opCol);
    this.controls = new Controls(this);
    this.setupPointer();
    if (this.online) this.setupOnline();
    // online: the first serve goes to the round's starter (net.starter): 0 = the host's half
    if (this.host) this.serve(this.online && net.starter === 1 ? 1 : 0, true);
    else { this.pucks[0].sc = 0; this.phase = 'goal'; }
  }

  private makePuck(main: boolean): Puck {
    const glow = this.add.image(0, 0, 'ah-glow').setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(GOLD).setAlpha(0);
    const img = this.add.image(360, MID, 'ah-puck').setDepth(4).setVisible(main);
    const p: Puck = { x: 360, y: MID, vx: 0, vy: 0, img, glow, trail: null as unknown as Phaser.GameObjects.Particles.ParticleEmitter, alive: main, last: -1, walls: 0, sc: 1, hist: [] };
    p.trail = this.add.particles(0, 0, 'ah-dot', {
      speed: 0, lifespan: 300, scale: { start: 1.5, end: 0 }, alpha: { start: 0.45, end: 0 }, frequency: 14,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
      tint: { onEmit: () => (this.fastT > 0 ? POWER_COL.fast : GOLD) },
    } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig).setDepth(2);
    p.trail.startFollow(img);
    return p;
  }

  private makeMallet(x: number, y: number, key: string, col: number, bottom: boolean): Mallet {
    return { x, y, vx: 0, vy: 0, r: MAL_R, img: this.add.image(x, y, key).setDepth(5), pulse: 0, bigT: 0, col, bottom };
  }

  private setupPointer(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.online && p.x > W - 120 && p.y < 120) return;      // the pause button
      this.pointerId = p.id;
      this.tx = p.x; this.ty = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId && p.isDown) { this.tx = p.x; this.ty = p.y; }
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.pointerId) this.pointerId = -1; };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  // ================================================================ HUD
  private buildUi(myCol: number, opCol: number): void {
    const D = 9000;
    this.uiG = this.add.graphics().setScrollFactor(0).setDepth(D);
    const peer = this.online ? upper((net.peerName || t('opponent')).slice(0, 9)) : t('cpu');
    const s = (o: Phaser.GameObjects.Text) => o.setScrollFactor(0).setDepth(D + 1);
    this.nameMe = s(ftxt(this, 158, 35, t('you'), { title: true, size: 20, color: css(myCol), strokeThickness: 4, shadow: false }).setOrigin(0, 0.5));
    this.nameOp = s(ftxt(this, 562, 35, peer, { title: true, size: 20, color: css(opCol), strokeThickness: 4, shadow: false }).setOrigin(1, 0.5));
    this.centerLbl = s(ftxt(this, 360, 34, '', { title: true, size: 15, color: '#ffffff', strokeThickness: 3, shadow: false }));
    this.numMe = s(ftxt(this, 330, 67, '0', { title: true, size: 30, color: css(myCol), strokeThickness: 4, shadow: false }));
    this.numOp = s(ftxt(this, 390, 67, '0', { title: true, size: 30, color: css(opCol), strokeThickness: 4, shadow: false }));
    if (!this.online) {
      s(ftxt(this, 66, 34, t('score'), { title: true, size: 14, color: '#9fb3ff', strokeThickness: 3, shadow: false }));
      this.scoreNum = s(ftxt(this, 66, 64, '0', { title: true, size: 26, color: css(GOLD), strokeThickness: 4, shadow: false }));
    } else this.scoreNum = undefined;
    this.bannerT = ftxt(this, 360, MID - 40, '', { title: true, size: 64, color: '#ffd23f', strokeThickness: 10 }).setDepth(20).setAlpha(0);
    this.countT = ftxt(this, 360, MID, '', { title: true, size: 96, color: '#ffffff', strokeThickness: 10 }).setDepth(20).setAlpha(0);
    this.replayT = ftxt(this, 372, MID + 54, t('replay'), { title: true, size: 22, color: '#ffffff', strokeThickness: 5, shadow: false }).setDepth(20).setAlpha(0);
  }

  private drawUi(): void {
    const g = this.uiG;
    if (this.uiDirty) {
      this.uiDirty = false;
      g.clear();
      g.fillStyle(0x0b1020, 0.74).fillRoundedRect(130, 12, 460, 80, 40);
      g.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(130, 12, 460, 80, 40);
      for (let i = 0; i < WIN_GOALS; i++) {
        const dot = (x: number, on: boolean, col: number) => {
          g.fillStyle(on ? col : 0xffffff, on ? 1 : 0.16).fillCircle(x, 67, 7);
          if (on) g.fillStyle(0xffffff, 0.55).fillCircle(x - 2, 65, 2.2);
        };
        dot(162 + i * 21, i < this.myGoals, this.me.col);
        dot(558 - i * 21, i < this.opGoals, this.op.col);
      }
      g.fillStyle(0xffffff, 0.6).fillRoundedRect(352, 65, 16, 4, 2);
      if (this.scoreNum) g.fillStyle(0x0b1020, 0.62).fillRoundedRect(12, 12, 108, 80, 26);
      this.numMe.setText(String(this.myGoals));
      this.numOp.setText(String(this.opGoals));
    }
    if (this.scoreNum && this.shownScore !== this.score) { this.shownScore = this.score; this.scoreNum.setText(String(this.score)); }
    const mp = this.myGoals === WIN_GOALS - 1 || this.opGoals === WIN_GOALS - 1;
    const label = mp ? t('matchPoint') : this.online ? t('firstTo') : t('lvl', { n: this.level });
    if (label !== this.shownCenter) {
      this.shownCenter = label;
      this.centerLbl.setText(label).setColor(mp ? '#ffd23f' : '#ffffff');
      this.centerLbl.setScale(1.4);
      this.tweens.add({ targets: this.centerLbl, scale: 1, duration: 360, ease: 'Back.easeOut' });
    }
  }

  /** The goal number flips over to its new value with a bounce. */
  private flipNumber(mine: boolean): void {
    const n = mine ? this.numMe : this.numOp;
    this.tweens.killTweensOf(n);
    n.setScale(1);
    this.tweens.add({
      targets: n, scaleY: 0, duration: 110, ease: 'Quad.easeIn',
      onComplete: () => {
        this.uiDirty = true;
        this.drawUi();
        n.setScale(1.7, 0);
        this.tweens.add({ targets: n, scaleY: 1.7, duration: 160, ease: 'Back.easeOut' });
        this.tweens.add({ targets: n, scaleX: 1, scaleY: 1, delay: 260, duration: 420, ease: 'Bounce.easeOut' });
      },
    });
  }

  /** A short call-out that pops in, holds a moment, then floats away (bonuses, power-ups). */
  private callout(x: number, y: number, text: string, color: string): void {
    x = Phaser.Math.Clamp(x, 170, W - 170);
    const c = ftxt(this, x, y, text, { title: true, size: 30, color, strokeThickness: 6, shadow: false }).setDepth(21).setScale(0.3);
    this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: y - 60, alpha: 0, delay: 750, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
  }

  private banner(text: string, color: string, size: number, y = MID - 40): void {
    const b = this.bannerT.setY(y);
    this.tweens.killTweensOf(b);
    const k = size / 64;
    b.setText(text).setColor(color).setScale(0.2 * k).setAlpha(0).setAngle(-6);
    this.tweens.add({ targets: b, scale: k, alpha: 1, angle: 0, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, scale: 1.25 * k, delay: 720, duration: 220 });
  }

  // ================================================================ flow
  /** Puts the puck on `to`'s side and starts the countdown (solo and host). */
  private serve(to: Who, first = false): void {
    this.phase = 'serve';
    this.phaseT = COUNT * COUNT_STEP;
    this.countShown = -1;
    this.serveTo = to;
    this.clearPowers();
    const p = this.pucks[0];
    p.alive = true; p.vx = p.vy = 0; p.last = -1; p.walls = 0; p.hist.length = 0;
    p.x = 360 + rng.int(-70, 70);
    p.y = to === 0 ? MID + 170 : MID - 170;
    p.sc = 0;
    p.img.setAlpha(1).setVisible(true);
    this.tweens.add({ targets: p, sc: 1, duration: 380, ease: 'Back.easeOut' });
    p.trail.stop();
    const by = p.y > MID ? MID - 300 : MID + 300;
    if (first) this.banner(t('firstToWin'), '#ffd23f', 52, by);
    else if (this.myGoals === WIN_GOALS - 1 || this.opGoals === WIN_GOALS - 1) {
      this.banner(t('matchPoint'), '#ffd23f', 50, by);
      this.sfx('matchPoint', { volume: 0.5 });
    }
    if (this.online) this.sendSnap();
  }

  private goLive(): void {
    this.phase = 'live';
    const p = this.pucks[0];
    p.trail.start();
    this.sfx('serve', { volume: 0.55 });
    this.showCount(t('go'), '#5dff7a');
    if (this.online) this.sendSnap();
  }

  private showCount(s: string, color: string): void {
    const c = this.countT;
    this.tweens.killTweensOf(c);
    c.setText(s).setColor(color).setScale(1.8).setAlpha(1);
    this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 240, duration: 150 });
  }

  /** Countdown digits for both the host's own serve and the guest's mirrored one. */
  private tickCountdown(left: number): void {
    const n = Math.ceil(left / COUNT_STEP);
    if (n !== this.countShown && n >= 1 && n <= COUNT) {
      this.countShown = n;
      this.showCount(String(n), '#ffffff');
      this.sfx('tick', { volume: 0.45, rate: 1 + (COUNT - n) * 0.12 });
    }
  }

  /** A goal (solo and host). `by` = who scored. */
  private scored(by: 0 | 1, p: Puck): void {
    const mine = by === 0;
    const speed = Math.hypot(p.vx, p.vy);
    if (mine) this.myGoals++; else this.opGoals++;
    this.phase = 'goal';
    this.phaseT = GOAL_SHOW;
    if (!this.online) {
      if (mine) {
        const bonus = Math.round(Math.max(0, speed - 700) / 10);
        const bank = p.walls > 0 && p.last === 0;
        this.addScore(100 + 25 * (this.level - 1) + bonus + (bank ? 60 : 0));
        if (bank) this.callout(360, MID + 120, t('bank'), '#c77dff');
        else if (bonus > 15) this.callout(360, MID + 120, t('power', { n: bonus }), '#ff4fa3');
      }
      const prev = this.level;
      this.level = Phaser.Math.Clamp(1 + this.myGoals + Math.floor(this.opGoals / 3), 1, MAX_LEVEL);
      if (this.level > prev) this.time.delayedCall(GOAL_SHOW * 1000 + 80, () => { if (!this.isOver && !this.ending) this.callout(360, MID - 240, t('aiUp', { n: this.level }), '#9fb3ff'); });
    } else this.setScore(this.myGoals);
    this.goalFx(mine, p);
    if (this.online) this.sendSnap();
    if (this.myGoals >= WIN_GOALS || this.opGoals >= WIN_GOALS) this.finish();
  }

  /** Effects of a goal on either side of an online match, and in solo play. */
  private goalFx(mine: boolean, p: Puck): void {
    this.phase = 'goal';
    this.goalAge = 0;
    this.slowT = SLOWMO;
    this.held = false;
    const top = mine;                     // you score in the top goal
    const col = mine ? this.me.col : this.op.col;
    const gy = top ? T : B;
    const gx = Phaser.Math.Clamp(p.x, GOAL_L + 20, GOAL_R - 20);
    this.goalFlash = 1; this.goalFlashTop = top;
    this.sparkCols = [col, GOLD, 0xffffff];
    this.bigSparks.explode(70, gx, gy);
    this.sparks.explode(30, gx, gy);
    this.shock.push({ x: gx, y: gy, t: 0, col, max: 260 }, { x: gx, y: gy, t: -0.12, col: 0xffffff, max: 180 });
    shake(this, 0.022, 450);
    softFlash(this, col, 260, 0.3);
    this.sfx('horn', { volume: 0.5, exact: true, rate: 0.9 });
    this.sfx('boom', { volume: 0.55, x: gx });
    if (mine) {
      this.sfx('goal', { volume: 0.6 });
      this.banner(t('goal'), '#ffd23f', 76);
    } else {
      this.sfx('concede', { volume: 0.55 });
      this.banner(t('concede'), css(col), 50);
    }
    this.flipNumber(mine);
    this.replay = p.hist.length >= 12 ? { pts: p.hist.slice(), col } : null;
    this.replayFlashed = false;
    for (const q of this.pucks) q.trail.stop();
    this.bigSparks.timeScale = SLOW_K + 0.1;
    this.sparks.timeScale = SLOW_K + 0.1;
    this.clearPowers();
  }

  private finish(): void {
    const win = this.myGoals >= WIN_GOALS;
    if (!this.online && win) this.addScore(1000 + (WIN_GOALS - this.opGoals) * 150);
    this.time.delayedCall(500, () => this.sfx(win ? 'win' : 'concede', { volume: 0.6, exact: true }));
    this.time.delayedCall(1150, () => { if (win && !this.isOver) this.banner(t('youWin'), '#5dff7a', 64); });
    // the table keeps playing out the last goal before the result screen opens
    this.ending = true;
    this.time.delayedCall(1900, () => { if (!this.isOver) this.endGame({ win, title: this.online ? (win ? t('youWin') : t('youLose')) : undefined, delay: 500 }); });
  }

  // ================================================================ AI (solo)
  /** 0 (level 1) … 1 (level 7). */
  private get aiS(): number { return (this.level - 1) / (MAX_LEVEL - 1) * this.tune.ramp; }
  private get aiReact(): number { return (0.24 - 0.16 * this.aiS) * this.tune.react; }

  /** The solo AI now: skill (0..1), seconds between decisions, aim noise (px, max) and top speed. */
  ai(): { skill: number; react: number; noise: number; speed: number } {
    const s = this.aiS;
    return { skill: s, react: this.aiReact, noise: (8 + 64 * (1 - s)) * this.tune.noise, speed: (540 + 1310 * s) * this.tune.speed };
  }

  /** The puck that matters most to the AI: nearest its goal, weighted by how fast it comes. */
  private aiFocus(): Puck {
    let best = this.pucks[0], bk = Infinity;
    for (const p of this.pucks) {
      if (!p.alive) continue;
      const k = p.y + (p.vy < 0 ? p.vy * 0.25 : 0);
      if (k < bk) { bk = k; best = p; }
    }
    return best;
  }

  /** x where the puck crosses the line y = gy, bouncing off the side rails. */
  private predictX(p: Puck, gy: number): number {
    if (p.vy >= -1) return p.x;
    const tHit = (gy - p.y) / p.vy;
    const w = R - L - PUCK_R * 2;
    let x = p.x + p.vx * tHit - (L + PUCK_R);
    x = ((x % (2 * w)) + 2 * w) % (2 * w);
    if (x > w) x = 2 * w - x;
    return x + L + PUCK_R;
  }

  private thinkAI(): void {
    const op = this.op, s = this.aiS, reach = op.r + PUCK_R;
    if (this.phase !== 'live') {
      this.aiMode = 'idle';
      this.aiTx = 360 + Math.sin(this.time.now / 700) * 40; this.aiTy = T + 125; this.aiShot = null;
      return;
    }
    const p = this.aiFocus();
    const inHalf = p.y < MID - 4;
    if (!inHalf) this.aiShot = null;
    // now and then it hesitates for a moment, more often at low levels
    const speed = Math.hypot(p.vx, p.vy);
    if (inHalf && speed < 420 && this.aiStrike <= 0 && Math.random() < (0.5 - 0.35 * s) * this.aiReact) {
      this.aiHes = 0.22 + Math.random() * 0.3; this.aiMode = 'hes';
      this.aiTx = op.x + (Math.random() - 0.5) * 50; this.aiTy = op.y - 10;
      return;
    }
    const noise = (Math.random() * 2 - 1) * (8 + 64 * (1 - s)) * this.tune.noise;
    const coming = p.vy < -150;
    if (!coming) { this.aiCounter = -1; this.aiLagged = false; }

    // 1. the puck races at our goal: play goalie on the line, reading its path off the rails
    if (coming && (!inHalf || p.vy < -520 || p.y > op.y)) {
      if (this.aiCounter < 0 && !this.aiLagged) {
        // a fresh shot: it takes the AI a moment to react, longer at low levels
        this.aiLagged = true;
        this.aiThink = (0.05 + 0.2 * (1 - s)) * this.tune.react;
        return;
      }
      this.aiMode = 'goalie';
      const gy = T + 92 + (1 - s) * 18;
      const read = 0.2 + 0.8 * s;
      const gx = Phaser.Math.Linear(360 + (p.x - 360) * 0.4, this.predictX(p, gy), read);
      this.aiTx = Phaser.Math.Clamp(gx + noise * 0.6, GOAL_L - 50, GOAL_R + 50);
      this.aiTy = gy;
      // counter-shot: meet the puck on a line that sends it back at your goal instead of just blocking
      if (this.aiCounter < 0) this.aiCounter = Math.random() < 0.1 + 0.55 * s ? 1 : 0;
      const iy = T + 150, ix = this.predictX(p, iy) + noise * 0.4;
      // only when it is safe: away from the rails and not a rocket
      if (this.aiCounter === 1 && p.y > T + 240 && ix > L + 110 && ix < R - 110 && -p.vy < 1600) {
        const tArr = (iy - p.y) / p.vy;
        const me = this.me;
        let aim = me.x < 360 ? GOAL_R - 40 : GOAL_L + 40;
        if (Math.random() < 0.25 + 0.3 * s) aim = ix < 360 ? 2 * (L + PUCK_R) - aim : 2 * (R - PUCK_R) - aim;
        let dx = aim - ix, dy = B - iy;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        if (tArr < 0.13) {
          this.aiTx = ix + dx * 70; this.aiTy = iy + dy * 70; this.aiStrike = 0.18; this.aiMode = 'counter';
        } else if (tArr < 0.9) {
          this.aiTx = ix - dx * (reach + 10); this.aiTy = iy - dy * (reach + 10); this.aiMode = 'counterSet';
        }
      } else if (this.aiCounter === 1 || Math.random() < 0.3 * s) {
        // no clean counter: punch through the block so the save comes back hard
        const tg = (gy - p.y) / p.vy;
        if (tg > 0 && tg < 0.12) { this.aiTy = gy + 55; this.aiStrike = 0.14; this.aiMode = 'punch'; }
      }
      // a slow-ish puck already close: step out and meet it instead
      if (this.aiCounter !== 1 && inHalf && s > 0.3 && p.vy > -650 && p.y < MID - 120) { this.aiTx = p.x; this.aiTy = Math.max(gy, p.y - reach * 0.6); }
      return;
    }
    // 2. puck in the other half, or already on its way there: fall back, guard the goal and shadow it
    if (!inHalf || (p.vy > 260 && this.aiStrike <= 0)) {
      this.aiMode = 'guard';
      this.aiTx = 360 + (p.x - 360) * (0.35 + 0.15 * s) + noise * 0.4;
      this.aiTy = T + 112 + 40 * s;
      return;
    }
    // 3. the puck is pinned against our back rail: sweep it out sideways, away from the goal mouth
    if (p.y < T + reach - 6) {
      this.aiMode = 'sweep';
      const out = p.x < 360 ? -1 : 1;
      this.aiTx = p.x + out * 90; this.aiTy = Math.max(p.y, T + op.r);
      if (Math.abs(op.x - p.x) < reach && (op.x - p.x) * out > 0) { this.aiTx = p.x - out * (reach + 22); this.aiTy = T + op.r + 70; }
      return;
    }
    // 4. attack: line up behind the puck, then drive through it (straight or banked off a rail)
    if (!this.aiShot) {
      // crafty: aim for the side of the goal your mallet does not cover...
      const me = this.me;
      let aim = GOAL_L + 30 + Math.random() * (GOAL_R - GOAL_L - 60);
      if (Math.random() < 0.35 + 0.55 * s) aim = me.x < 360 ? GOAL_R - 34 - Math.random() * 40 : GOAL_L + 34 + Math.random() * 40;
      // ...and bank it off a rail when your mallet stands in the straight line
      const ldx = aim - p.x, ldy = B - p.y, ll = Math.hypot(ldx, ldy) || 1;
      const blocked = Math.abs((me.x - p.x) * ldy - (me.y - p.y) * ldx) / ll < me.r + PUCK_R + 20 && me.y > p.y;
      const bankP = (blocked ? 0.35 + 0.5 * s : 0.08 + 0.3 * s);
      const bank = Math.random() < bankP ? (p.x < 360 ? -1 : 1) * (Math.random() < 0.8 ? 1 : -1) : 0;
      this.aiShot = { aim, bank };
    }
    const { aim, bank } = this.aiShot;
    const gx = bank < 0 ? 2 * (L + PUCK_R) - aim : bank > 0 ? 2 * (R - PUCK_R) - aim : aim;
    let dx = gx + noise * 0.5 - p.x, dy = B + 20 - p.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const ox = op.x - p.x, oy = op.y - p.y;
    const proj = ox * dx + oy * dy;              // < 0: we are behind the puck
    const lat = ox * -dy + oy * dx;               // sideways offset from the shot line
    const sx = p.x - dx * (reach + 26), sy = p.y - dy * (reach + 26);
    if (sy < T + op.r + 2) {
      // no room to get behind it: poke it from where we are
      this.aiTx = p.x + dx * 80; this.aiTy = p.y + dy * 80;
      this.aiStrike = 0.2; this.aiMode = 'poke';
    } else if (proj < -reach * 0.55 && Math.abs(lat) < 20 + 16 * (1 - s)) {
      this.aiTx = p.x + dx * 150; this.aiTy = p.y + dy * 150;
      this.aiStrike = 0.28; this.aiMode = 'strike';
      this.aiShot = null;
    } else if (proj > -reach * 0.2) {
      // we are level with or in front of the puck: go round it on our side, never through it
      const side = lat >= 0 ? 1 : -1; this.aiMode = 'around';
      this.aiTx = p.x - dy * side * (reach + 22) - dx * 24;
      this.aiTy = p.y + dx * side * (reach + 22) - dy * 24;
    } else {
      this.aiTx = sx; this.aiTy = sy; this.aiMode = 'setup';
    }
  }

  /** AI mallet steering for this frame: returns its end position (velocity with acceleration). */
  private steerAI(dt: number): [number, number] {
    const op = this.op, s = this.aiS;
    this.aiThink -= dt;
    this.aiHes = Math.max(0, this.aiHes - dt);
    this.aiStrike = Math.max(0, this.aiStrike - dt);
    if (this.aiThink <= 0 && this.aiHes <= 0) { this.aiThink = this.aiReact; this.thinkAI(); }
    const slow = this.slowT > 0 ? SLOW_K : 1;
    const maxSp = (540 + 1310 * s) * this.tune.speed * (this.aiStrike > 0 ? 1.3 + 0.3 * s : 1) * (this.aiHes > 0 ? 0.3 : 1);
    const acc = (4200 + 9000 * s) * (this.aiStrike > 0 ? 1.6 : 1);
    const dx = this.aiTx - op.x, dy = this.aiTy - op.y, d = Math.hypot(dx, dy);
    const want = Math.min(maxSp, d * 9);
    let ax = (d > 0.5 ? (dx / d) * want : 0) - this.aiVx, ay = (d > 0.5 ? (dy / d) * want : 0) - this.aiVy;
    const la = Math.hypot(ax, ay), max = acc * dt;
    if (la > max) { ax *= max / la; ay *= max / la; }
    this.aiVx += ax; this.aiVy += ay;
    const [x, y] = this.clampMallet(op, op.x + this.aiVx * dt * slow, op.y + this.aiVy * dt * slow);
    // stopped by the rails or the centre line
    if (Math.abs(x - (op.x + this.aiVx * dt * slow)) > 0.01) this.aiVx = 0;
    if (Math.abs(y - (op.y + this.aiVy * dt * slow)) > 0.01) this.aiVy = 0;
    return [x, y];
  }

  // ================================================================ physics
  private clampMallet(m: Mallet, x: number, y: number): [number, number] {
    const minY = m.bottom ? MID + m.r : T + m.r;
    const maxY = m.bottom ? B - m.r : MID - m.r;
    return [Phaser.Math.Clamp(x, L + m.r, R - m.r), Phaser.Math.Clamp(y, minY, maxY)];
  }

  /** Player target for this frame: the finger 1:1, or the keys with a little acceleration. */
  private myTarget(dt: number): [number, number] {
    const c = this.controls;
    if (this.pointerId >= 0) { this.kvx = this.kvy = 0; return [this.tx, this.ty]; }
    let ax = c.axisX, ay = c.axisY;
    const la = Math.hypot(ax, ay);
    if (la > 1) { ax /= la; ay /= la; }
    const wx = ax * KEY_SPEED, wy = ay * KEY_SPEED;
    let dvx = wx - this.kvx, dvy = wy - this.kvy;
    const braking = la === 0 || this.kvx * wx + this.kvy * wy < 0;
    const dv = Math.hypot(dvx, dvy), max = KEY_ACCEL * dt * (braking ? 1.8 : 1);
    if (dv > max) { dvx *= max / dv; dvy *= max / dv; }
    this.kvx += dvx; this.kvy += dvy;
    return [this.me.x + this.kvx * dt, this.me.y + this.kvy * dt];
  }

  private get cap(): number { return this.fastT > 0 ? FAST_MAX : MAX_PUCK; }

  private capSpeed(p: Puck): void {
    const sp = Math.hypot(p.vx, p.vy), cap = this.cap;
    if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
  }

  /** Mallet against puck: velocity transfer, so a moving mallet hits harder. True on a hit. */
  private collide(p: Puck, m: Mallet, who: 0 | 1): boolean {
    const dx = p.x - m.x, dy = p.y - m.y, min = PUCK_R + m.r, d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : (m.bottom ? -1 : 1);
    p.x = m.x + nx * min; p.y = m.y + ny * min;
    const rvx = p.vx - m.vx, rvy = p.vy - m.vy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return false;
    p.vx = m.vx + rvx - (1 + MALLET_E) * vn * nx;
    p.vy = m.vy + rvy - (1 + MALLET_E) * vn * ny;
    const out = p.vx * nx + p.vy * ny;
    if (out < MIN_HIT) { p.vx += nx * (MIN_HIT - out); p.vy += ny * (MIN_HIT - out); }
    this.capSpeed(p);
    this.onHit(p, m, who, -vn, nx, ny);
    return true;
  }

  private onHit(p: Puck, m: Mallet, who: 0 | 1, impact: number, nx: number, ny: number): void {
    const now = this.time.now;
    const hard = impact > 950;
    if (now - this.hitSfx > 60) {
      this.hitSfx = now;
      this.sfx(hard ? 'hit2' : 'hit', { volume: Math.min(0.85, 0.3 + impact / 2000), x: p.x });
      if (hard) this.sfx('smash', { volume: 0.35, x: p.x });
    }
    const cx = p.x - nx * PUCK_R, cy = p.y - ny * PUCK_R;
    this.sparkCols = [m.col, 0xffffff];
    this.sparks.explode(hard ? 18 : impact > 400 ? 7 : 3, cx, cy);
    if (hard) {
      this.sparkCols = [m.col, GOLD, 0xffffff];
      this.bigSparks.explode(10, cx, cy);
      this.shock.push({ x: cx, y: cy, t: 0, col: m.col, max: 90 });
      shake(this, 0.005, 90);
    }
    m.pulse = Math.min(1, 0.4 + impact / 1400);
    // a defensive touch near your goal while the puck rushed in counts as a save
    if (!this.online && who === 0 && p.last === 1 && p.y > B - 280 && impact > 750) {
      this.callout(p.x, p.y - 70, t('save'), '#5dff7a');
      this.addScore(15);
    }
    p.last = who;
    p.walls = 0;
    this.hits++;
    if (this.online && !this.host) this.localHitT = now;
  }

  private wallHit(p: Puck, speed: number, x: number, y: number): void {
    p.walls++;
    if (this.quiet || speed < 140) return;
    const now = this.time.now;
    if (now - this.wallSfx > 55) {
      this.wallSfx = now;
      this.sfx('wall', { volume: Math.min(0.7, speed / 2400), x });
    }
    if (speed > 520) {
      this.sparkCols = [VIOLET, 0xffffff, GOLD];
      this.sparks.explode(Math.min(14, 3 + Math.round(speed / 180)), x, y);
    }
  }

  /** Moves a puck one sub-step. Returns the goal it went into: 'top', 'bottom' or ''. */
  private stepPuck(p: Puck, h: number): '' | 'top' | 'bottom' {
    p.x += p.vx * h; p.y += p.vy * h;
    const inMouth = p.x > GOAL_L && p.x < GOAL_R;
    if (inMouth && (p.y < T - 6 || p.y > B + 6)) {
      if (this.online && !this.host) {
        // guest: the host decides about goals; hold the puck in the mouth until it does
        if (!this.quiet) { this.held = true; p.vx = p.vy = 0; }
        p.y = Phaser.Math.Clamp(p.y, T - 30, B + 30);
        return '';
      }
      return p.y < MID ? 'top' : 'bottom';
    }
    // side rails
    if (p.x < L + PUCK_R) { p.x = L + PUCK_R; if (p.vx < 0) { this.wallHit(p, -p.vx, L, p.y); p.vx = -p.vx * WALL_E; p.vy *= WALL_SLIDE; } }
    if (p.x > R - PUCK_R) { p.x = R - PUCK_R; if (p.vx > 0) { this.wallHit(p, p.vx, R, p.y); p.vx = -p.vx * WALL_E; p.vy *= WALL_SLIDE; } }
    // end rails (except the goal mouth)
    if (!inMouth) {
      if (p.y < T + PUCK_R) { p.y = T + PUCK_R; if (p.vy < 0) { this.wallHit(p, -p.vy, p.x, T); p.vy = -p.vy * WALL_E; p.vx *= WALL_SLIDE; } }
      if (p.y > B - PUCK_R) { p.y = B - PUCK_R; if (p.vy > 0) { this.wallHit(p, p.vy, p.x, B); p.vy = -p.vy * WALL_E; p.vx *= WALL_SLIDE; } }
    }
    // goal posts
    for (let i = 0; i < 4; i++) {
      const gx = i & 1 ? GOAL_R : GOAL_L, gy = i < 2 ? T : B;
      const dx = p.x - gx, dy = p.y - gy, min = PUCK_R + POST_R, d = Math.hypot(dx, dy);
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d;
        p.x = gx + nx * min; p.y = gy + ny * min;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) { p.vx -= (1 + WALL_E) * vn * nx; p.vy -= (1 + WALL_E) * vn * ny; this.wallHit(p, -vn, gx, gy); }
      }
    }
    // rounded corners
    for (let i = 0; i < 4; i++) {
      const cx = i & 1 ? R - CR : L + CR, cy = i < 2 ? T + CR : B - CR;
      if (!((cx < 360 ? p.x < cx : p.x > cx) && (cy < MID ? p.y < cy : p.y > cy))) continue;
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), max = CR - PUCK_R;
      if (d > max) {
        const nx = dx / d, ny = dy / d;
        p.x = cx + nx * max; p.y = cy + ny * max;
        const vn = p.vx * nx + p.vy * ny;
        if (vn > 0) { p.vx -= (1 + WALL_E) * vn * nx; p.vy -= (1 + WALL_E) * vn * ny; this.wallHit(p, vn, p.x, p.y); }
      }
    }
    return '';
  }

  /** Equal-mass bounce between two pucks (multi-puck). */
  private puckPair(a: Puck, b: Puck): void {
    const dx = b.x - a.x, dy = b.y - a.y, min = PUCK_R * 2, d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 0.0001) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return;
    const j = -(1 + 0.95) * vn / 2;
    a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    if (j > 200) { this.sfx('wall', { volume: 0.4, x: a.x }); this.sparkCols = [GOLD, 0xffffff]; this.sparks.explode(6, a.x + nx * PUCK_R, a.y + ny * PUCK_R); }
  }

  /** A puck that is not in play still blocks the mallets (serve, goal). */
  private blockMallet(m: Mallet, p: Puck): boolean {
    if (!p.alive || p.sc < 0.5 || this.phase === 'goal') return false;
    const dx = m.x - p.x, dy = m.y - p.y, min = PUCK_R + m.r, d = Math.hypot(dx, dy);
    if (d >= min) return false;
    const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : (m.bottom ? 1 : -1);
    [m.x, m.y] = this.clampMallet(m, p.x + nx * min, p.y + ny * min);
    return true;
  }

  /**
   * One frame of the table: both mallets travel from where they are to their targets in
   * sub-steps, so a fast mallet or puck never skips through the other or a rail.
   */
  private simulate(dt: number, opEnd: [number, number], simulatePucks: boolean): string {
    const me = this.me, op = this.op;
    const ts = this.slowT > 0 ? SLOW_K : 1;
    // my mallet: straight to the target (the finger), capped only against absurd jumps
    const [ex, ey] = this.clampMallet(me, ...this.myTarget(dt));
    let mdx = ex - me.x, mdy = ey - me.y;
    const md = Math.hypot(mdx, mdy), mmax = FINGER_MAX * dt;
    if (md > mmax) { mdx *= mmax / md; mdy *= mmax / md; }
    me.vx = mdx / dt; me.vy = mdy / dt;
    const [ox1, oy1] = this.clampMallet(op, opEnd[0], opEnd[1]);
    const odx = ox1 - op.x, ody = oy1 - op.y;
    op.vx = odx / dt; op.vy = ody / dt;

    let travel = Math.max(md, Math.hypot(odx, ody));
    for (const p of this.pucks) if (p.alive) travel = Math.max(travel, Math.hypot(p.vx, p.vy) * dt * ts);
    const n = Phaser.Math.Clamp(Math.ceil(travel / STEP_PX), 2, MAX_STEPS);
    const h = (dt * ts) / n;
    const msx = me.x, msy = me.y, osx = op.x, osy = op.y;
    let meBlocked = false, opBlocked = false;
    const live = this.phase === 'live' && simulatePucks;
    let result = '';
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      if (!meBlocked) { me.x = msx + mdx * f; me.y = msy + mdy * f; }
      if (!opBlocked) { op.x = osx + odx * f; op.y = osy + ody * f; }
      if (!live) {
        // the resting puck (serve, goal) blocks both mallets at every step, so none slips past it
        for (const p of this.pucks) {
          if (this.blockMallet(me, p)) meBlocked = true;
          if (this.blockMallet(op, p)) opBlocked = true;
        }
        continue;
      }
      if (this.held) continue;
      for (const p of this.pucks) {
        if (!p.alive) continue;
        const g = this.stepPuck(p, h);
        if (g) { result = g + (p === this.pucks[0] ? '0' : '1'); break; }
        this.collide(p, me, 0);
        this.collide(p, op, 1);
        // a puck squeezed against a rail pushes the mallet back instead of passing through it
        const bx = p.x, by = p.y;
        this.stepPuck(p, 0);
        if (bx !== p.x || by !== p.y) {
          for (const m of [me, op]) {
            const dx = m.x - p.x, dy = m.y - p.y, min = PUCK_R + m.r, d = Math.hypot(dx, dy);
            if (d < min - 0.5) {
              const k = d > 0.001 ? min / d : 0;
              [m.x, m.y] = this.clampMallet(m, p.x + dx * k, p.y + dy * k);
              if (m === me) meBlocked = true; else opBlocked = true;
            }
          }
        }
      }
      if (result) break;
      if (this.pucks[1].alive) this.puckPair(this.pucks[0], this.pucks[1]);
    }
    // drag
    if (live && !this.held) {
      const f = Math.exp(-FRICTION * (this.fastT > 0 ? 0.3 : 1) * dt * ts);
      for (const p of this.pucks) {
        if (!p.alive) continue;
        p.vx *= f; p.vy *= f;
        if (this.fastT > 0) {
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 30 && sp < FAST_MIN) { p.vx *= FAST_MIN / sp; p.vy *= FAST_MIN / sp; }
        }
        // a dead puck right on the centre line creeps to one side so play never stalls
        if (this.host && Math.hypot(p.vx, p.vy) < 25 && Math.abs(p.y - MID) < PUCK_R + 4) p.vy += (p.y < MID ? -1 : 1) * 70 * dt;
      }
    }
    return result;
  }

  // ================================================================ loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.online) { this.updateOnline(dt); return; }
    const opEnd = this.steerAI(dt);
    const g = this.simulate(dt, opEnd, true);
    if (g) this.handleGoal(g);
    this.updatePhase(dt);
    this.updatePowers(dt);
    this.render(dt);
  }

  private handleGoal(g: string): void {
    const p = this.pucks[g.endsWith('1') ? 1 : 0];
    const by: 0 | 1 = g.startsWith('top') ? 0 : 1;
    this.scored(by, p);
    // the other puck (multi-puck) leaves the table
    for (const q of this.pucks) if (q !== p && q.alive && q !== this.pucks[0]) this.retirePuck(q);
    if (p !== this.pucks[0]) {
      // the extra puck scored: it becomes the one that slides into the pocket
      const m = this.pucks[0];
      [m.x, m.y, m.vx, m.vy] = [p.x, p.y, p.vx, p.vy];
      m.hist = p.hist.slice();
      this.retirePuck(p, true);
    }
  }

  private retirePuck(q: Puck, instant = false): void {
    q.alive = false; q.trail.stop();
    this.sparkCols = [POWER_COL.multi, 0xffffff];
    if (!instant) this.sparks.explode(12, q.x, q.y);
    q.img.setVisible(false); q.glow.setAlpha(0);
  }

  /** Phase timers (solo and host). */
  private updatePhase(dt: number): void {
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.slowT <= 0) { this.sparks.timeScale = 1; this.bigSparks.timeScale = 1; }
    this.goalAge += dt;
    if (this.phase === 'serve') {
      this.phaseT -= dt;
      this.tickCountdown(this.phaseT);
      if (this.phaseT <= 0) this.goLive();
    } else if (this.phase === 'goal') {
      this.phaseT -= dt;
      const p = this.pucks[0];
      // the puck slides on into the pocket in slow motion
      const k = this.slowT > 0 ? SLOW_K : 1;
      p.x += p.vx * dt * k; p.y += p.vy * dt * k;
      p.x = Phaser.Math.Clamp(p.x, GOAL_L + 8, GOAL_R - 8);
      p.y = Phaser.Math.Clamp(p.y, T - POCKET + 4, B + POCKET - 4);
      if (this.phaseT <= 0 && !this.isOver && !this.ending) this.serve(this.serveSide());
    } else if (this.phase === 'live') {
      for (const p of this.pucks) if (p.alive) this.record(p);
    }
  }

  /** The last second of a puck's path (x, y, t), for the replay after a goal. */
  private record(p: Puck): void {
    const h = p.hist, now = this.elapsed;
    h.push(p.x, p.y, now);
    let cut = 0;
    while (cut < h.length - 6 && h[cut + 2] < now - REPLAY_SPAN) cut += 3;
    if (cut) h.splice(0, cut);
  }

  /** After a goal the puck goes to whoever conceded. */
  private serveSide(): Who { return this.lastScorer === 0 ? 1 : 0; }
  private get lastScorer(): Who { return this.goalFlashTop ? 0 : 1; }

  // ================================================================ power-ups (solo)
  private updatePowers(dt: number): void {
    if (this.online) return;
    if (this.me.bigT > 0 && (this.me.bigT -= dt) <= 0) this.shrink(this.me);
    if (this.op.bigT > 0 && (this.op.bigT -= dt) <= 0) this.shrink(this.op);
    if (this.fastT > 0) this.fastT = Math.max(0, this.fastT - dt);
    if (this.phase !== 'live') return;
    const pk = this.pickup;
    if (pk) {
      pk.t -= dt;
      for (const p of this.pucks) {
        if (p.alive && Math.hypot(p.x - pk.x, p.y - pk.y) < PUCK_R + 30) { this.collect(pk, p); return; }
      }
      if (pk.t <= 0) {
        this.pickup = null;
        this.tweens.add({ targets: pk.img, scale: 0, alpha: 0, duration: 220, onComplete: () => pk.img.destroy() });
      }
      return;
    }
    if (this.myGoals + this.opGoals < 1 || this.pucks[1].alive || this.me.bigT > 0 || this.op.bigT > 0 || this.fastT > 0) return;
    this.pwTimer -= dt;
    if (this.pwTimer > 0) return;
    this.pwTimer = PW_GAP[0] + Math.random() * (PW_GAP[1] - PW_GAP[0]);
    let x = 360, y = MID;
    for (let i = 0; i < 12; i++) {
      x = rng.int(170, 550); y = MID + rng.int(-150, 150);
      const clear = this.pucks.every((p) => !p.alive || Math.hypot(p.x - x, p.y - y) > 140)
        && Math.hypot(this.me.x - x, this.me.y - y) > 130 && Math.hypot(this.op.x - x, this.op.y - y) > 130;
      if (clear) break;
    }
    const kind = rng.pick(['big', 'fast', 'multi'] as const);
    const img = this.add.image(x, y, `ah-pw-${kind}`).setDepth(3).setScale(0);
    this.tweens.add({ targets: img, scale: 0.8, duration: 380, ease: 'Back.easeOut' });
    this.pickup = { kind, x, y, t: PW_LIFE, img };
    this.sfx('pwSpawn', { volume: 0.45, x });
    this.sparkCols = [POWER_COL[kind], 0xffffff];
    this.sparks.explode(14, x, y);
  }

  private collect(pk: Pickup, p: Puck): void {
    this.pickup = null;
    const owner: 0 | 1 = p.last === -1 ? (pk.y > MID ? 0 : 1) : p.last;
    const m = owner === 0 ? this.me : this.op;
    const col = POWER_COL[pk.kind];
    this.tweens.add({ targets: pk.img, scale: 1.6, alpha: 0, duration: 260, onComplete: () => pk.img.destroy() });
    this.sparkCols = [col, 0xffffff];
    this.bigSparks.explode(26, pk.x, pk.y);
    this.shock.push({ x: pk.x, y: pk.y, t: 0, col, max: 140 });
    this.sfx('pwGet', { volume: 0.6, x: pk.x });
    if (pk.kind === 'big') {
      m.bigT = BIG_TIME; m.r = BIG_R;
      this.tweens.add({ targets: m.img, scale: BIG_R / MAL_R, duration: 300, ease: 'Back.easeOut' });
      this.callout(m.x, m.y - 90, t('pwBig'), css(col));
    } else if (pk.kind === 'fast') {
      this.fastT = FAST_TIME;
      for (const q of this.pucks) if (q.alive) { q.vx *= 1.35; q.vy *= 1.35; this.capSpeed(q); }
      this.callout(pk.x, pk.y - 60, t('pwFast'), css(col));
    } else {
      const q = this.pucks[1];
      q.alive = true; q.x = pk.x; q.y = pk.y; q.last = owner; q.walls = 0; q.hist.length = 0;
      const a = owner === 0 ? -Math.PI / 2 : Math.PI / 2;
      const off = (Math.random() - 0.5) * 1.2;
      q.vx = Math.cos(a + off) * 520; q.vy = Math.sin(a + off) * 520;
      q.sc = 0; q.img.setVisible(true).setAlpha(1);
      this.tweens.add({ targets: q, sc: 1, duration: 300, ease: 'Back.easeOut' });
      q.trail.start();
      this.callout(pk.x, pk.y - 60, t('pwMulti'), css(col));
    }
  }

  private shrink(m: Mallet): void {
    m.bigT = 0;
    if (m.r === MAL_R) return;
    m.r = MAL_R;
    this.tweens.add({ targets: m.img, scale: 1, duration: 260, ease: 'Quad.easeOut' });
  }

  private clearPowers(): void {
    this.shrink(this.me); this.shrink(this.op);
    this.fastT = 0;
    if (this.pickup) { this.pickup.img.destroy(); this.pickup = null; }
    if (this.pucks[1]?.alive) this.retirePuck(this.pucks[1]);
  }

  // ================================================================ rendering
  private render(dt: number): void {
    const lo = this.fxLow, hi = this.fxHigh;
    lo.clear(); hi.clear();
    const now = this.time.now;
    // goal mouth light
    if (this.goalFlash > 0) {
      this.goalFlash = Math.max(0, this.goalFlash - dt * 0.9);
      const top = this.goalFlashTop, col = top ? this.me.col : this.op.col, a = this.goalFlash;
      for (let i = 0; i < 6; i++) {
        const hgt = 30 + i * 34;
        lo.fillStyle(col, a * 0.09).fillRect(GOAL_L - i * 12, top ? T : B - hgt, GOAL_R - GOAL_L + i * 24, hgt);
      }
      lo.fillStyle(0xffffff, a * 0.7).fillRect(GOAL_L, top ? T - 3 : B - 3, GOAL_R - GOAL_L, 6);
    }
    // replay: the scoring run traced again with a ghost puck
    this.drawReplay(lo);
    // shock rings
    for (let i = this.shock.length - 1; i >= 0; i--) {
      const s = this.shock[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = s.t / 0.45;
      if (k >= 1) { this.shock.splice(i, 1); continue; }
      hi.lineStyle(10 * (1 - k) + 2, s.col, (1 - k) * 0.85).strokeCircle(s.x, s.y, 20 + s.max * Phaser.Math.Easing.Cubic.Out(k));
    }
    // pucks: glow, speed streaks, serve ring
    for (const p of this.pucks) {
      if (!p.alive && p !== this.pucks[0]) continue;
      let alpha = 1, sc = p.sc;
      if (this.phase === 'goal' && p === this.pucks[0]) { alpha = Math.max(0, 1 - this.goalAge / 0.6); sc *= 1 - Math.min(0.35, this.goalAge * 0.6); }
      p.img.setPosition(p.x, p.y).setScale(sc).setAlpha(alpha);
      const sp = Math.hypot(p.vx, p.vy);
      const fast = this.fastT > 0;
      p.glow.setPosition(p.x, p.y).setTint(fast ? POWER_COL.fast : GOLD)
        .setAlpha(alpha * Math.min(0.9, (fast ? 0.5 : 0.12) + sp / 2600)).setScale(sc * (0.9 + sp / 2400));
      if (this.phase === 'live' && sp > 760) {
        const ux = p.vx / sp, uy = p.vy / sp, len = Math.min(170, (sp - 700) * 0.14), a = Math.min(0.55, (sp - 760) / 1500);
        const col = fast ? POWER_COL.fast : 0xffffff;
        for (const o of [-16, 0, 16]) {
          const bx = p.x - ux * (PUCK_R + 4) - uy * o, by = p.y - uy * (PUCK_R + 4) + ux * o;
          const l = o === 0 ? len : len * 0.6;
          lo.lineStyle(o === 0 ? 4 : 2.5, col, a).lineBetween(bx, by, bx - ux * l, by - uy * l);
        }
      }
      if (this.phase === 'serve' && p === this.pucks[0] && p.sc > 0.9) {
        const k = (now % 700) / 700;
        hi.lineStyle(4, 0xffffff, 0.6 * (1 - k)).strokeCircle(p.x, p.y, PUCK_R + 6 + k * 34);
      }
    }
    // mallets: hit pulse and power-up aura
    for (const m of [this.me, this.op]) {
      m.pulse = Math.max(0, m.pulse - dt * 4);
      const base = m.r / MAL_R;
      if (!this.tweens.isTweening(m.img)) m.img.setScale(base * (1 + 0.14 * m.pulse));
      m.img.setPosition(m.x, m.y);
      if (m.pulse > 0) hi.lineStyle(6, m.col, m.pulse * 0.8).strokeCircle(m.x, m.y, m.r + 8 + (1 - m.pulse) * 26);
      if (m.bigT > 0) {
        const blink = m.bigT < 2 && Math.floor(now / 120) % 2 === 0;
        if (!blink) lo.lineStyle(4, POWER_COL.big, 0.55 + Math.sin(now / 110) * 0.25).strokeCircle(m.x, m.y, m.r + 10);
      }
    }
    // pickup: bob, spin ring, blink before it goes
    const pk = this.pickup;
    if (pk) {
      const col = POWER_COL[pk.kind];
      if (!this.tweens.isTweening(pk.img)) pk.img.setScale(0.8 + Math.sin(now / 160) * 0.06);
      pk.img.setVisible(!(pk.t < 2 && Math.floor(now / 110) % 2 === 0));
      const a0 = now / 300;
      lo.lineStyle(4, col, 0.8);
      for (let i = 0; i < 3; i++) {
        lo.beginPath().arc(pk.x, pk.y, 48, a0 + (i * Math.PI * 2) / 3, a0 + (i * Math.PI * 2) / 3 + 1.2).strokePath();
      }
    }
    this.drawUi();
  }

  private drawReplay(g: Phaser.GameObjects.Graphics): void {
    const rp = this.replay;
    const age = this.goalAge;
    if (!rp || age < REPLAY_AT || age > REPLAY_AT + REPLAY_DUR + 0.35 || this.phase !== 'goal') {
      this.ghost.setAlpha(0);
      this.replayT.setAlpha(0);
      if (rp && (age > REPLAY_AT + REPLAY_DUR + 0.35 || this.phase !== 'goal')) this.replay = null;
      return;
    }
    const k = Phaser.Math.Clamp((age - REPLAY_AT) / REPLAY_DUR, 0, 1);
    const fade = age > REPLAY_AT + REPLAY_DUR ? 1 - (age - REPLAY_AT - REPLAY_DUR) / 0.35 : Math.min(1, (age - REPLAY_AT) / 0.12);
    const pts = rp.pts, n = pts.length / 3, head = Math.max(1, Math.floor(Phaser.Math.Easing.Sine.InOut(k) * (n - 1)));
    // a light frame around the table, like a broadcast replay
    g.lineStyle(6, 0xffffff, 0.22 * fade).strokeRoundedRect(L + 6, T + 6, R - L - 12, B - T - 12, CR - 6);
    for (let i = 1; i <= head; i++) {
      const f = i / n;
      g.lineStyle(3 + 13 * f, rp.col, (0.08 + 0.5 * f) * fade).lineBetween(pts[i * 3 - 3], pts[i * 3 - 2], pts[i * 3], pts[i * 3 + 1]);
    }
    for (let i = 0; i <= head; i += 4) g.fillStyle(0xffffff, 0.3 * fade).fillCircle(pts[i * 3], pts[i * 3 + 1], 4);
    const hx = pts[head * 3], hy = pts[head * 3 + 1];
    g.fillStyle(rp.col, 0.35 * fade).fillCircle(hx, hy, PUCK_R + 14);
    g.fillStyle(0xffffff, 0.5 * fade).fillCircle(hx, hy, PUCK_R - 6);
    this.ghost.setPosition(hx, hy).setAlpha(0.9 * fade).setTint(rp.col);
    // the "REPLAY" tag with a blinking red dot
    this.replayT.setAlpha(fade);
    if (Math.floor(this.time.now / 260) % 2 === 0) g.fillStyle(0xff3040, fade).fillCircle(372 - this.replayT.width / 2 - 16, MID + 54, 8);
    if (!this.replayFlashed && k >= 1) { this.replayFlashed = true; softFlash(this, 0xffffff, 200, 0.16); }
  }

  // ================================================================ online two-player
  // Host: runs the puck, goals and serves; its mallet is "me", the guest's mallet is "op".
  // Guest: moves its own mallet locally and sends it ('in'); it renders the host's snapshots ('st'),
  // predicting the puck between snapshots and blending towards the host's state.

  private setupOnline(): void {
    if (this.host) {
      net.onScene(this, 'in', (d: { m: number[] }) => {
        if (!d?.m) return;
        this.rx = W - d.m[0]; this.ry = MIRROR_Y - d.m[1]; this.rvx = -d.m[2]; this.rvy = -d.m[3]; this.rAt = this.time.now;
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

  /** Host → guest: puck, host mallet, goals, live flag, hit count and the countdown (host coordinates). */
  private sendSnap(): void {
    const r = Math.round, p = this.pucks[0];
    const snap: Snap = {
      p: [r(p.x), r(p.y), r(p.vx), r(p.vy)],
      m: [r(this.me.x), r(this.me.y), r(this.me.vx), r(this.me.vy)],
      k: [this.myGoals, this.opGoals],
      l: this.phase === 'live' ? 1 : 0,
      h: this.hits,
    };
    if (this.phase === 'serve') snap.c = Math.max(0, r(this.phaseT * 1000));
    net.send('st', snap);
  }

  private updateOnline(dt: number): void {
    // the other player's mallet: last report, extrapolated a little
    const age = Math.min(0.15, (this.time.now - this.rAt) / 1000 + (this.host ? 0 : this.lat));
    const rtx = this.rx + this.rvx * age, rty = this.ry + this.rvy * age;
    let dx = rtx - this.op.x, dy = rty - this.op.y;
    const d = Math.hypot(dx, dy), max = REMOTE_SPEED * dt;
    if (d > max) { dx *= max / d; dy *= max / d; }
    const opEnd: [number, number] = [this.op.x + dx, this.op.y + dy];

    if (this.host) {
      const g = this.simulate(dt, opEnd, true);
      if (g) this.scored(g.startsWith('top') ? 0 : 1, this.pucks[0]);
      this.updatePhase(dt);
    } else {
      this.simulate(dt, opEnd, true);
      this.guestPhase(dt);
    }
    this.render(dt);

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

  /** Guest: local timers and the puck between snapshots. */
  private guestPhase(dt: number): void {
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.slowT <= 0) { this.sparks.timeScale = 1; this.bigSparks.timeScale = 1; }
    this.goalAge += dt;
    const p = this.pucks[0];
    if (this.phase === 'live') {
      const k = Math.min(1, dt * 12);
      p.x += this.corrX * k; p.y += this.corrY * k;
      this.corrX -= this.corrX * k; this.corrY -= this.corrY * k;
    } else {
      // between snapshots the resting / sliding puck eases to the host's position
      const k = Math.min(1, dt * 14);
      p.x += (this.snapX - p.x) * k; p.y += (this.snapY - p.y) * k;
      if (this.phase === 'serve') { this.phaseT -= dt; this.tickCountdown(this.phaseT); }
    }
  }

  /** Guest: a host snapshot arrived (host coordinates → table rotated for the local view). */
  private applySnap(d: Snap): void {
    if (this.isOver || !d?.p || !d.m || !d.k) return;
    const now = this.time.now;
    const p = this.pucks[0];
    this.rx = W - d.m[0]; this.ry = MIRROR_Y - d.m[1]; this.rvx = -d.m[2]; this.rvy = -d.m[3]; this.rAt = now;
    const ax = W - d.p[0], ay = MIRROR_Y - d.p[1], avx = -d.p[2], avy = -d.p[3];

    const me = d.k[1], opp = d.k[0];
    if (me !== this.myGoals || opp !== this.opGoals) {
      const mine = me > this.myGoals;
      this.myGoals = me; this.opGoals = opp;
      this.setScore(this.myGoals);
      this.phase = 'goal';
      this.goalFx(mine, p);
      if (me >= WIN_GOALS || opp >= WIN_GOALS) { this.finish(); return; }
    }

    const wasLive = this.phase === 'live';
    if (!d.l) {
      if (wasLive) { this.phase = 'goal'; }
      this.held = false; this.corrX = this.corrY = 0;
      // a new serve: the puck pops up on its spot
      if (Math.hypot(ax - p.x, ay - p.y) > 150 && d.c !== undefined) {
        p.x = ax; p.y = ay; p.sc = 0; p.img.setAlpha(1).setVisible(true);
        this.tweens.add({ targets: p, sc: 1, duration: 380, ease: 'Back.easeOut' });
        p.hist.length = 0;
      }
      if (d.c !== undefined) {
        if (this.phase !== 'serve') {
          this.phase = 'serve'; this.countShown = -1;
          const by = ay > MID ? MID - 300 : MID + 300;
          if (this.myGoals === WIN_GOALS - 1 || this.opGoals === WIN_GOALS - 1) { this.banner(t('matchPoint'), '#ffd23f', 50, by); this.sfx('matchPoint', { volume: 0.5 }); }
          else if (this.myGoals + this.opGoals === 0) this.banner(t('firstToWin'), '#ffd23f', 52, by);
        }
        this.phaseT = Math.max(0, d.c / 1000 - this.lat);
        if (p.sc === 0 && !this.tweens.isTweening(p)) p.sc = 1;
      }
      this.snapX = ax; this.snapY = ay;
      p.vx = p.vy = 0;
      return;
    }
    // the replay traces the host's real path, not our prediction
    this.record({ x: ax, y: ay, hist: p.hist } as Puck);
    // a mallet hit on the host that we did not predict: let it be heard
    if (d.h < this.seenHits) this.seenHits = d.h;
    if (d.h > this.seenHits) {
      if (now - this.localHitT > 300 && now - this.hitSfx > 70) {
        this.hitSfx = now; this.sfx('hit', { volume: 0.45, x: ax }); this.op.pulse = 0.7;
        this.sparkCols = [this.op.col, 0xffffff]; this.sparks.explode(5, ax, ay);
      }
      this.seenHits = d.h;
    }
    // where the puck is on the host right now: advance the snapshot by the one-way latency
    const save = [p.x, p.y, p.vx, p.vy];
    p.x = ax; p.y = ay; p.vx = avx; p.vy = avy;
    this.quiet = true;
    const n = Math.ceil(this.lat / 0.006);
    for (let i = 0; i < n; i++) if (this.stepPuck(p, this.lat / n)) break;
    this.quiet = false;
    const s = [p.x, p.y, p.vx, p.vy];
    [p.x, p.y, p.vx, p.vy] = save;

    if (!wasLive || this.held) {
      [p.x, p.y, p.vx, p.vy] = s;
      this.corrX = this.corrY = 0; this.held = false;
      if (!wasLive) {
        this.phase = 'live';
        this.sfx('serve', { volume: 0.55 }); this.showCount(t('go'), '#5dff7a');
        p.trail.start(); p.sc = 1; p.img.setAlpha(1).setVisible(true);
      }
      return;
    }
    // we predicted a mallet hit the host has not confirmed yet: keep our prediction a moment
    const keepMs = 150 + this.lat * 2000;
    if (now - this.localHitT < keepMs && s[2] * p.vx + s[3] * p.vy < 0) return;
    p.vx = s[2]; p.vy = s[3];
    const ex = s[0] - p.x, ey = s[1] - p.y;
    if (Math.hypot(ex, ey) > 120) { p.x = s[0]; p.y = s[1]; this.corrX = this.corrY = 0; }
    else { this.corrX = ex; this.corrY = ey; }
  }
}
