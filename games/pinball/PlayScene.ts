import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng, loc, getLang, COLORS } from '@core';
import {
  World, Hit, Seg, BALL_R, W, TH, LANE_X, PLUNGER_Y, DRAIN_Y, LANES, LANE_Y, PIVOT_Y, BANK_X, BANK_Y,
  SLING_L, SLING_R, ORBIT_L, ORBIT_R, ORBIT_BOT, RAMP, SAUCER, SPINNER, BUMPER4, GUARD,
  buildWalls, buildTargets, buildBumpers, buildFlippers, rampPath, step,
} from './table';
import { makeTextures, paintTable, paintApron, paintRamp, makeButton, css, INSERTS, RAMP_Y0, APRON_Y } from './art';
import { THEMES, Theme, Goal, levelGoals, themeOf, tuning, UNLOCK, extraBallFor } from './levels';

const BALLS = 3;
const LETTERS = ['A', 'Y', 'V', 'A'];
const MAX_MULT = 5;
const TILT_AT = 2.4;          // three quick nudges (the meter drains slowly)
const BTN_Y = 1232, BTN_H = 84, BTN_W = 164;
const NUDGE_X = 92, LAUNCH_X = 628;
const DMD_X = 298, DMD_Y = 58;
const BAR_TOP = 1180;
const SCROLL_MIN = -110, SCROLL_MAX = TH - BAR_TOP;

type Zone = 'L' | 'R' | 'P' | 'N' | null;
type Shot = 'ramp' | 'orbitL' | 'orbitR' | 'saucer' | 'bank';
const SHOT_GOALS: Record<Shot, Goal[]> = { ramp: ['ramps'], orbitL: ['orbits', 'spinner'], orbitR: ['orbits'], saucer: ['saucer'], bank: ['targets'] };

const darken = (c: number, k: number): number =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
const short = (n: number): string => (n >= 1000 ? `${Math.floor(n / 100) / 10}K`.replace('.0K', 'K') : `${n}`);
const hexColor = (s: string): number => Phaser.Display.Color.HexStringToColor(s).color;

interface BumperView { body: Phaser.GameObjects.Image; cap: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; r: number }
interface GoalRow { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; y: number }
interface BallCount { ramps: number; orbits: number; saucers: number; bumpers: number; spins: number }

export class PlayScene extends ArcadeScene {
  private world!: World;
  private table!: Phaser.GameObjects.Container;
  private tableImgs: Phaser.GameObjects.Image[] = [];
  private apronImgs: Phaser.GameObjects.Image[] = [];
  private slot = 0;
  private ballImg!: Phaser.GameObjects.Image;
  private ballGlow!: Phaser.GameObjects.Image;
  private riderImg!: Phaser.GameObjects.Image;
  private riderGlow!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flipImgs: Phaser.GameObjects.Image[] = [];
  private bumpers: BumperView[] = [];
  private targetImgs: Phaser.GameObjects.Image[] = [];
  private targetGlows: Phaser.GameObjects.Image[] = [];
  private lamps: Phaser.GameObjects.Image[] = [];
  private lampGlows: Phaser.GameObjects.Image[] = [];
  private laneTexts: Phaser.GameObjects.Text[] = [];
  private inserts: Partial<Record<Shot, [Phaser.GameObjects.Image, Phaser.GameObjects.Image]>> = {};
  private arrows: Phaser.GameObjects.Image[] = [];
  private spinnerImg!: Phaser.GameObjects.Image;
  private saucerGlow!: Phaser.GameObjects.Image;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private plungerGfx!: Phaser.GameObjects.Graphics;
  private saveText!: Phaser.GameObjects.Text;
  private saveGlow!: Phaser.GameObjects.Image;
  private launchHint!: Phaser.GameObjects.Text;
  private barGfx!: Phaser.GameObjects.Graphics;
  private rows: GoalRow[] = [];
  private btnImgs: Phaser.GameObjects.Image[] = [];
  private btnGfx!: Phaser.GameObjects.Graphics;
  private btnLabels: Phaser.GameObjects.Text[] = [];
  private dmdScore!: Phaser.GameObjects.Text;
  private dmdInfo!: Phaser.GameObjects.Text;
  private dmdMsg!: Phaser.GameObjects.Text;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  private balls = BALLS;
  private ballNo = 1;
  private extra = 0;
  private mult = 1;
  private level = 1;
  private theme: Theme = THEMES[0];
  private goals: [Goal, number][] = [];
  private prog: Partial<Record<Goal, number>> = {};
  private clearing = false;
  private lit = [false, false, false, false];
  private inLane = -1;
  private charge = 0;
  private charging = false;
  private ballSave = 0;
  private saveArmed = false;
  private nudgeCd = 0;
  private tiltWarn = 0;
  private tilted = false;
  private stall = 0;
  private waiting = 0;
  private inPlay = false;
  private slingFlash = [0, 0];
  private bankTimer = 0;
  private prevHeld = [false, false];
  private hitCd: Record<string, number> = {};
  private pulse = [0, 0];
  private guard: Seg | null = null;
  private guardT = 0;
  private held = 0;
  private saucerCd = 0;
  private combo = 0;
  private lastHit = -9;
  private ride: { s: number; v: number } | null = null;
  private rampPts: [number, number][] = [];
  private rampLen: number[] = [];
  private lastRamp = -99;
  private rampCombo = 0;
  private orbitFrom: { side: 'L' | 'R'; t: number } | null = null;
  private prevX = 0;
  private prevY = 0;
  private spinPending = 0;
  private spinPhase = 0;
  private bc: BallCount = { ramps: 0, orbits: 0, saucers: 0, bumpers: 0, spins: 0 };
  private msgQ: string[] = [];
  private msgT = 0;
  private camY = SCROLL_MAX;

  createGame(): void {
    makeTextures(this);
    this.flipImgs = []; this.bumpers = []; this.targetImgs = []; this.targetGlows = []; this.lamps = []; this.lampGlows = [];
    this.laneTexts = []; this.inserts = {}; this.arrows = []; this.rows = []; this.btnImgs = []; this.btnLabels = []; this.keys = {};
    this.tableImgs = []; this.apronImgs = []; this.slot = 0;
    this.balls = BALLS; this.ballNo = 1; this.extra = 0; this.mult = 1; this.level = 1; this.theme = THEMES[0];
    this.goals = levelGoals(1); this.prog = {}; this.clearing = false;
    this.lit = [false, false, false, false]; this.inLane = -1; this.charge = 0; this.charging = false;
    this.ballSave = 0; this.saveArmed = false; this.nudgeCd = 0; this.tiltWarn = 0; this.tilted = false;
    this.stall = 0; this.waiting = 0; this.inPlay = false;
    this.slingFlash = [0, 0]; this.bankTimer = 0; this.prevHeld = [false, false]; this.hitCd = {}; this.pulse = [0, 0];
    this.guard = null; this.guardT = 0; this.held = 0; this.saucerCd = 0; this.combo = 0; this.lastHit = -9;
    this.ride = null; this.lastRamp = -99; this.rampCombo = 0; this.orbitFrom = null; this.spinPending = 0; this.spinPhase = 0;
    this.bc = { ramps: 0, orbits: 0, saucers: 0, bumpers: 0, spins: 0 };
    this.msgQ = []; this.msgT = 0; this.camY = SCROLL_MAX;
    this.useHud = false;   // the score lives on the dot-matrix display

    this.world = {
      ball: { x: LANE_X, y: PLUNGER_Y, vx: 0, vy: 0 },
      walls: buildWalls(), targets: buildTargets(), bumpers: buildBumpers(), flippers: buildFlippers(),
      gravity: tuning(1).gravity,
    };
    this.rampPts = rampPath();
    this.rampLen = [0];
    for (let i = 1; i < this.rampPts.length; i++) {
      const [ax, ay] = this.rampPts[i - 1], [bx, by] = this.rampPts[i];
      this.rampLen.push(this.rampLen[i - 1] + Math.hypot(bx - ax, by - ay));
    }

    // two thumbs plus the launch button; the pointers live on the game, so add them only once
    const pointers = this.input.manager.pointersTotal;
    if (pointers < 6) this.input.addPointer(6 - pointers);
    this.cameras.main.setScroll(0, this.camY);
    this.table = this.add.container(0, 0);
    this.buildTable();
    this.buildApron();
    this.buildOverlay();
    this.bindInput();
    this.applyTheme(false);
    this.applyLevel();
    this.updateDmd();
    this.serveBall(true);
    this.dmd(`${t('levelUp', { n: 1 })}\n${loc(this.theme.name)}`);
    const hint = txt(this, W / 2, 1560, t('touchHint'), { size: 28, color: '#3ee6ff' }).setDepth(40);
    this.tweens.add({ targets: hint, alpha: 0, delay: 2600, duration: 500, onComplete: () => hint.destroy() });
  }

  // ================================================================ building

  private buildTable(): void {
    const key = paintTable(this, this.theme, 0);
    for (let i = 0; i < 2; i++) this.tableImgs.push(this.add.image(0, 0, key).setOrigin(0).setAlpha(i ? 0 : 1));
    this.table.add(this.tableImgs);

    // arrow inserts that point at the shots
    const add = (o: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) => this.table.add(o);
    for (const shot of Object.keys(SHOT_GOALS) as Shot[]) {
      const [x, y, rot] = INSERTS[shot];
      const glow = this.add.image(x, y, 'pb-glow').setScale(0.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const lamp = this.add.image(x, y + 2, 'pb-arrow').setRotation(rot).setScale(0.72);
      this.inserts[shot] = [lamp, glow];
      add([glow, lamp]);
    }
    for (const [x, y] of INSERTS.progress) {
      const a = this.add.image(x, y + 2, 'pb-arrow').setScale(0.72).setAlpha(0.25);
      this.arrows.push(a);
      add(a);
    }

    // saucer and spinner
    this.saucerGlow = this.add.image(SAUCER.x, SAUCER.y, 'pb-glow').setScale(0.75).setBlendMode(Phaser.BlendModes.ADD);
    const saucer = this.add.image(SAUCER.x, SAUCER.y, 'pb-saucer');
    this.spinnerImg = this.add.image(SPINNER.x, SPINNER.y, 'pb-spinner');
    add([this.saucerGlow, saucer, this.spinnerImg]);

    // rollover lanes
    LANES.forEach((x, i) => {
      const glow = this.add.image(x, LANE_Y + 4, 'pb-glow').setScale(0.55).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const lamp = this.add.image(x, LANE_Y + 4, 'pb-lamp');
      const letter = txt(this, x, LANE_Y + 52, LETTERS[i], { title: true, size: 24, color: '#4a4170', strokeThickness: 4 });
      this.lampGlows.push(glow); this.lamps.push(lamp); this.laneTexts.push(letter);
      add([glow, lamp, letter]);
    });

    // drop targets (a vertical bank, struck from the left)
    for (const s of this.world.targets) {
      const y = (s.ay + s.by) / 2;
      const glow = this.add.image(BANK_X, y, 'pb-glow').setScale(0.3, 0.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const img = this.add.image(BANK_X, y, 'pb-target').setAngle(90);
      this.targetGlows.push(glow); this.targetImgs.push(img);
      add([glow, img]);
    }

    for (const b of this.world.bumpers) this.addBumperView(b.x, b.y, b.r);

    this.fxGfx = this.add.graphics();
    this.plungerGfx = this.add.graphics();
    add([this.fxGfx, this.plungerGfx]);

    this.trail = this.add.particles(0, 0, 'pb-glow', {
      speed: 0, lifespan: 260, scale: { start: 0.24, end: 0 }, alpha: { start: 0.5, end: 0 },
      blendMode: Phaser.BlendModes.ADD, frequency: 14, emitting: false,
    });
    this.ballGlow = this.add.image(LANE_X, PLUNGER_Y, 'pb-glow').setScale(0.42).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    this.ballImg = this.add.image(LANE_X, PLUNGER_Y, 'pb-ball');
    add([this.trail, this.ballGlow, this.ballImg]);

    // the ramp runs over the table; a ball riding it is drawn above it
    add(this.add.image(0, RAMP_Y0, paintRamp(this)).setOrigin(0));
    this.riderGlow = this.add.image(0, 0, 'pb-glow').setScale(0.5).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.riderImg = this.add.image(0, 0, 'pb-ball').setScale(1.12).setVisible(false);
    add([this.riderGlow, this.riderImg]);
  }

  private addBumperView(x: number, y: number, r: number): void {
    const s = r / 36;
    const shadow = this.add.image(x + 4, y + 8, 'pb-glow').setTint(0x000000).setScale(0.75 * s).setAlpha(0.7);
    const halo = this.add.image(x, y, 'pb-glow').setScale(1.1 * s).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25);
    const body = this.add.image(x, y, 'pb-bumper').setScale(0.82 * s);
    const cap = this.add.image(x, y - 2, 'pb-cap').setScale(0.95 * s);
    this.bumpers.push({ body, cap, halo, shadow, r });
    this.table.add([shadow, halo, body, cap]);
    // a bumper added during play (level 4) goes under the ball; on a fresh table the ball comes later
    if (this.trail && this.table.exists(this.trail as Phaser.GameObjects.GameObject)) for (const o of [shadow, halo, body, cap]) this.table.moveBelow(o as Phaser.GameObjects.GameObject, this.trail as Phaser.GameObjects.GameObject);
  }

  private buildApron(): void {
    const key = paintApron(this, this.theme, 0);
    for (let i = 0; i < 2; i++) this.apronImgs.push(this.add.image(0, APRON_Y, key).setOrigin(0).setAlpha(i ? 0 : 1));
    this.table.add(this.apronImgs);
    // the flippers stay above the apron, the draining ball goes behind it
    for (const f of this.world.flippers) {
      const img = this.add.image(f.px, f.py, 'pb-flipper').setOrigin(16 / 148, 0.5).setRotation(f.angle).setScale(f.scale);
      const piv = this.add.image(f.px, f.py, 'pb-pivot').setScale(f.scale);
      this.flipImgs.push(img);
      this.table.add([img, piv]);
    }
    // shoot-again lamp between the flippers
    this.saveGlow = this.add.image(340, PIVOT_Y + 81, 'pb-glow').setScale(1.4, 0.3).setTint(0x5dff7a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.saveText = txt(this, 340, PIVOT_Y + 81, t('ballSave'), { title: true, size: 12, color: '#5dff7a', strokeThickness: 3 });
    this.launchHint = txt(this, 340, 1690, t('holdLaunch'), { size: 24, color: '#f3f2f2', strokeThickness: 5, align: 'center' });
    this.table.add([this.saveGlow, this.saveText, this.launchHint]);
  }

  /** Fixed to the screen: the dot-matrix display at the top, the control bar at the bottom. */
  private buildOverlay(): void {
    const fix = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, d: number): T => { o.setScrollFactor(0); o.setDepth(d); return o; };
    fix(this.add.image(DMD_X, DMD_Y, 'pb-dmd'), 50);
    const dmdText = (y: number, size: number) => {
      const tx = txt(this, DMD_X, y, '', { title: true, size, color: '#ffb54d', strokeThickness: 0, shadow: false, align: 'center' });
      tx.setShadow(0, 0, '#ff6a00', 12, false, true);
      return fix(tx, 51);
    };
    this.dmdScore = dmdText(DMD_Y - 13, 34);
    this.dmdInfo = dmdText(DMD_Y + 27, 15);
    this.dmdMsg = dmdText(DMD_Y, 22).setLineSpacing(12).setVisible(false);
    fix(this.add.image(DMD_X, DMD_Y - 1, 'pb-dmdgrid'), 52);

    fix(this.add.image(360, BAR_TOP + 56, 'pb-bar'), 50);
    this.barGfx = fix(this.add.graphics(), 51);
    for (let i = 0; i < 3; i++) {
      const label = fix(txt(this, 202, 0, '', { title: true, size: 13, color: '#ffffff', strokeThickness: 3 }).setOrigin(0, 0.5), 52);
      const value = fix(txt(this, 518, 0, '', { title: true, size: 13, color: '#ffffff', strokeThickness: 3 }).setOrigin(1, 0.5), 52);
      this.rows.push({ label, value, y: 0 });
    }
    const bk = makeButton(this, BTN_W, BTN_H);
    for (const [x, tint, key] of [[NUDGE_X, COLORS.purple, 'nudge'], [LAUNCH_X, COLORS.red, 'launch']] as const) {
      this.btnImgs.push(fix(this.add.image(x, BTN_Y + 4, bk).setTint(tint), 51));
      this.btnLabels.push(fix(txt(this, x, BTN_Y, t(key), { title: true, size: 17, color: '#ffffff', strokeThickness: 5 }), 53));
    }
    this.btnGfx = fix(this.add.graphics(), 52);
  }

  private bindInput(): void {
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
  }

  // ================================================================ dot-matrix display

  /** Shows a message on the display (queued; about 1.5 s each). */
  private dmd(s: string): void {
    this.msgQ.push(s);
  }

  private updateDmd(): void {
    const n = this.score.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US');
    this.dmdScore.setText(n);
    this.dmdInfo.setText(`${t('ball')} ${this.ballNo}/${BALLS + this.extra}   ${t('levelUp', { n: this.level })}   x${this.mult}`);
  }

  private tickDmd(dt: number): void {
    if (this.msgT > 0) {
      this.msgT -= dt;
      this.dmdMsg.setAlpha(this.msgT > 1.15 ? (Math.floor(this.msgT * 12) % 2 ? 1 : 0.25) : 1);
      if (this.msgT > 0) return;
    }
    const next = this.msgQ.shift();
    const on = next !== undefined;
    this.dmdMsg.setVisible(on);
    this.dmdScore.setVisible(!on);
    this.dmdInfo.setVisible(!on);
    if (on) {
      this.dmdMsg.setText(next).setFontSize(Math.max(...next.split('\n').map((l) => l.length)) > 20 ? 18 : 22);
      this.msgT = this.msgQ.length ? 1.2 : 1.5;
    }
  }

  // ================================================================ themes and levels

  /** Tints every part for the current theme; with fade, the new table cross-fades over the old one. */
  private applyTheme(fade: boolean): void {
    const th = this.theme;
    const next = fade ? 1 - this.slot : this.slot;
    const tk = paintTable(this, th, next), ak = paintApron(this, th, next);
    const tNew = this.tableImgs[next], tOld = this.tableImgs[1 - next];
    const aNew = this.apronImgs[next], aOld = this.apronImgs[1 - next];
    tNew.setTexture(tk); aNew.setTexture(ak);
    if (fade) {
      this.table.moveAbove(tNew, tOld);
      this.table.moveAbove(aNew, aOld);
      tNew.setAlpha(0); aNew.setAlpha(0);
      this.tweens.add({ targets: [tNew, aNew], alpha: 1, duration: 800, ease: 'Sine.easeInOut', onComplete: () => { tOld.setAlpha(0); aOld.setAlpha(0); } });
      this.slot = next;
    }
    for (const b of this.bumpers) { b.body.setTint(th.bumper); b.halo.setTint(th.bumper); }
    for (const img of this.flipImgs) img.setTint(th.flipper);
    this.targetImgs.forEach((img) => img.setTint(th.target));
    this.targetGlows.forEach((g) => g.setTint(th.target));
    this.lampGlows.forEach((g) => g.setTint(th.lamp));
    this.arrows.forEach((a) => a.setTint(th.lamp));
    for (const [lamp, glow] of Object.values(this.inserts)) { lamp.setTint(th.lamp); glow.setTint(th.lamp); }
    this.saucerGlow.setTint(th.lamp);
    this.ballGlow.setTint(hexColor(th.glow));
    this.riderGlow.setTint(hexColor(th.glow));
    this.trail.particleTint = hexColor(th.glow);
    this.refreshLanes();
  }

  /** Difficulty, unlocks and goals of the current level. */
  private applyLevel(): void {
    const tu = tuning(this.level);
    this.world.gravity = tu.gravity;
    for (const b of this.world.bumpers) b.kick = tu.kick;
    this.goals = levelGoals(this.level);
    this.prog = {};
    if (this.level >= UNLOCK.bumper4 && this.world.bumpers.length < 4) {
      this.world.bumpers.push({ x: BUMPER4.x, y: BUMPER4.y, r: BUMPER4.r, kick: tu.kick, id: 3 });
      this.addBumperView(BUMPER4.x, BUMPER4.y, BUMPER4.r);
      this.bumpers[3].body.setTint(this.theme.bumper); this.bumpers[3].halo.setTint(this.theme.bumper);
    }
    if (this.level >= UNLOCK.guard && !this.guard) {
      this.guard = { ax: GUARD.cx - GUARD.half, ay: GUARD.y, bx: GUARD.cx + GUARD.half, by: GUARD.y, r: 7, e: 0.7, kind: 'post' };
      this.world.walls.push(this.guard);
    }
    this.layoutGoals();
    this.updateGoals();
  }

  private layoutGoals(): void {
    const n = this.goals.length;
    const ys = n === 3 ? [1208, 1236, 1264] : n === 2 ? [1220, 1252] : [1236];
    this.rows.forEach((r, i) => {
      const on = i < n;
      r.label.setVisible(on); r.value.setVisible(on);
      if (!on) return;
      r.y = ys[i];
      r.label.setY(ys[i]).setText(t(`g_${this.goals[i][0]}`));
      r.value.setY(ys[i]);
    });
  }

  private goalFrac(i: number): number {
    const [g, need] = this.goals[i];
    return Math.min(1, (this.prog[g] ?? 0) / need);
  }

  private goalOpen(goal: Goal): boolean {
    const i = this.goals.findIndex(([g]) => g === goal);
    return i >= 0 && this.goalFrac(i) < 1;
  }

  private updateGoals(): void {
    const th = this.theme;
    const g = this.barGfx;
    g.clear();
    this.goals.forEach(([goal, need], i) => {
      const f = this.goalFrac(i), r = this.rows[i], done = f >= 1;
      g.fillStyle(0xffffff, 0.07).fillRoundedRect(196, r.y - 11, 328, 22, 6);
      if (f > 0) g.fillStyle(th.lamp, done ? 0.55 : 0.32).fillRoundedRect(196, r.y - 11, Math.max(12, 328 * f), 22, 6);
      const have = Math.min(need, this.prog[goal] ?? 0);
      r.value.setText(done ? t('done') : goal === 'points' ? `${short(have)}/${short(need)}` : `${have}/${need}`);
      r.value.setColor(done ? th.accent : '#ffffff');
      r.label.setColor(done ? th.accent : '#ffffff');
    });
  }

  /** Counts towards a goal of this level. */
  private bump(goal: Goal, n = 1): void {
    if (this.clearing || this.isOver) return;
    const i = this.goals.findIndex(([g]) => g === goal);
    if (i < 0) return;
    const before = this.goalFrac(i);
    this.prog[goal] = (this.prog[goal] ?? 0) + n;
    if (before < 1 && this.goalFrac(i) >= 1) {
      this.sfx('saved', { volume: 0.45 });
      this.dmd(t('goalDone', { g: t(`g_${goal}`) }));
      const row = this.rows[i];
      this.tweens.add({ targets: [row.label, row.value], scale: 1.25, duration: 120, yoyo: true });
    }
    this.updateGoals();
    if (this.goals.every((_, k) => this.goalFrac(k) >= 1)) this.levelClear();
  }

  private levelClear(): void {
    this.clearing = true;
    const cleared = this.level;
    const bonus = 10000 * cleared;
    this.sfx('bank', { volume: 0.75, exact: true });
    this.time.delayedCall(350, () => this.sfx('lanes', { volume: 0.6, exact: true }));
    flash(this, hexColor(this.theme.glow), 220, 0.35);
    shake(this, 0.012, 260);
    this.award(bonus, W / 2, this.camY + 600, this.theme.accent, false);
    this.dmd(`${t('levelClear', { n: cleared })}\n${t('bonus', { n: (bonus * this.mult).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US') })}`);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 140, () => burst(this, rng.int(120, 600), this.camY + rng.int(250, 900), [0xffffff, this.theme.lamp, this.theme.bumper], 22, 380));
    this.time.delayedCall(900, () => {
      if (this.isOver) return;
      this.level++;
      this.theme = THEMES[themeOf(this.level)];
      this.applyTheme(true);
      const unlocks: string[] = [];
      if (this.level === UNLOCK.bumper4) unlocks.push(t('unlockBumper'));
      if (this.level === UNLOCK.guard) unlocks.push(t('unlockGuard'));
      this.applyLevel();
      for (const s of this.world.targets) s.active = true;
      this.refreshTargets();
      this.lit = [false, false, false, false];
      this.refreshLanes();
      this.dmd(`${t('levelUp', { n: this.level })}\n${loc(this.theme.name)}`);
      for (const u of unlocks) this.dmd(u);
      if (extraBallFor(cleared)) {
        this.extra++; this.balls++;
        this.sfx('newball', { volume: 0.6 });
        this.dmd(t('extraBall'));
      }
      if (this.inPlay) this.ballSave = Math.max(this.ballSave, 5);
      this.updateDmd();
      this.clearing = false;
    });
  }

  /** Test hook: jump straight to level n (used by screenshot scripts). */
  jumpToLevel(n: number): void {
    while (this.level < n) {
      this.level++;
      this.theme = THEMES[themeOf(this.level)];
      this.applyLevel();
    }
    this.applyTheme(true);
    this.updateDmd();
  }

  // ================================================================ input

  private zoneAt(x: number, y: number): Zone {
    if (x > W - 130 && y < 130) return null;                       // pause button
    if (Math.abs(y - BTN_Y) <= BTN_H / 2 + 8) {
      if (Math.abs(x - NUDGE_X) <= BTN_W / 2 + 8) return 'N';
      if (Math.abs(x - LAUNCH_X) <= BTN_W / 2 + 8) return 'P';
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

  /** A nudge shakes the ball loose; three close together tilt the machine. */
  private nudge(): void {
    if (this.isOver || !this.inPlay || this.tilted) return;
    if (this.nudgeCd > 0) return;
    this.nudgeCd = 0.45;
    this.tiltWarn += 1;
    const b = this.world.ball;
    if (b.x < 650 && this.held <= 0 && !this.ride) {
      b.vx += (b.x < 340 ? 1 : -1) * rng.int(90, 170);
      b.vy -= rng.int(260, 360);
    }
    this.sfx('nudge', { volume: 0.7 });
    shake(this, 0.008, 160);
    this.tweens.add({ targets: this.table, x: rng.pick([-10, 10]), y: -6, duration: 50, yoyo: true });
    if (this.tiltWarn >= TILT_AT) this.tilt();
    else if (this.tiltWarn >= TILT_AT - 1) { this.msgQ = []; this.msgT = 0; this.dmd(t('danger')); this.sfx('deny', { volume: 0.5 }); }
  }

  private tilt(): void {
    this.tilted = true;
    this.ballSave = 0;
    this.msgQ = []; this.msgT = 0;
    this.dmd(t('tilt')); this.dmd(t('tilt'));
    this.sfx('drain', { volume: 0.6 });
    flash(this, COLORS.red, 300, 0.35);
    for (const f of this.world.flippers) f.held = false;
  }

  // ================================================================ balls

  private serveBall(first = false): void {
    const b = this.world.ball;
    b.x = LANE_X; b.y = PLUNGER_Y; b.vx = 0; b.vy = 0;
    this.prevX = b.x; this.prevY = b.y;
    this.held = 0; this.ride = null; this.tilted = false; this.tiltWarn = 0; this.orbitFrom = null;
    this.bc = { ramps: 0, orbits: 0, saucers: 0, bumpers: 0, spins: 0 };
    this.ballImg.setVisible(true).setPosition(b.x, b.y).setScale(0.2);
    this.ballGlow.setVisible(true);
    this.riderImg.setVisible(false); this.riderGlow.setVisible(false);
    this.tweens.add({ targets: this.ballImg, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.inPlay = true;
    this.waiting = 0;
    this.saveArmed = true;
    this.ballSave = 0;
    this.updateDmd();
    if (!first) this.sfx('newball', { volume: 0.5 });
    if (this.balls === 1 && !first) this.dmd(t('lastBall'));
  }

  private drain(): void {
    const b = this.world.ball;
    this.inPlay = false;
    this.ballImg.setVisible(false);
    this.ballGlow.setVisible(false);
    this.trail.stop();
    this.combo = 0;
    if (this.ballSave > 0 && !this.tilted) {
      this.ballSave = 0;
      this.sfx('saved', { volume: 0.6 });
      this.dmd(t('saved'));
      this.time.delayedCall(700, () => { if (!this.isOver) this.serveBall(true); });
      return;
    }
    this.sfx('drain', { volume: 0.7 });
    shake(this, 0.014, 280);
    flash(this, COLORS.red, 180, 0.25);
    burst(this, Phaser.Math.Clamp(b.x, 200, 480), PIVOT_Y + 90, [COLORS.red, 0xffd23f], 24, 300);
    // end-of-ball bonus (lost to a tilt)
    const c = this.bc;
    const bonus = (c.ramps * 2000 + c.orbits * 1500 + c.saucers * 1000 + c.bumpers * 50 + c.spins * 10) * this.mult;
    if (!this.tilted && bonus > 0) {
      this.addScore(bonus);
      this.bump('points', bonus);
      this.dmd(`${t('ballBonus')}\n${bonus.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US')}`);
    } else if (!this.tilted) this.dmd(t('lost'));
    this.balls--;
    if (this.balls <= 0) {
      this.endGame({ delay: 1600 });
      return;
    }
    this.waiting = bonus > 0 ? 2 : 1.4;
  }

  // ================================================================ scoring

  private award(base: number, x: number, y: number, color = '#ffd23f', count = true): void {
    const n = base * this.mult;
    this.addScore(n);
    if (count) this.bump('points', n);
    popup(this, x, y - 20, `+${n}`, color, n >= 1000 ? 26 : 18);
  }

  private chain(): void {
    this.combo = this.elapsed - this.lastHit < 1.1 ? this.combo + 1 : 1;
    this.lastHit = this.elapsed;
    if (this.combo >= 5 && this.combo % 5 === 0) {
      this.award(50 * this.combo, this.world.ball.x, this.world.ball.y - 40, '#ff8cf0');
      this.dmd(t('combo', { n: this.combo }));
      this.sfx('lane', { volume: 0.5 });
    }
  }

  private ring(x: number, y: number, tint: number, from: number, to: number, dur: number): void {
    const r = this.add.image(x, y, 'pb-ring').setTint(tint).setScale(from).setBlendMode(Phaser.BlendModes.ADD);
    this.table.add(r);
    this.table.moveBelow(r as Phaser.GameObjects.GameObject, this.trail as Phaser.GameObjects.GameObject);
    this.tweens.add({ targets: r, scale: to, alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  private onHit(h: Hit): void {
    const key = `${h.kind}${h.id}`;
    if ((this.hitCd[key] ?? 0) > 0) return;
    const th = this.theme;
    switch (h.kind) {
      case 'bumper': {
        this.hitCd[key] = 0.06;
        const v = this.bumpers[h.id], s = v.r / 36;
        this.tweens.killTweensOf([v.body, v.cap, v.halo]);
        v.body.setScale(0.82 * s * 1.18); v.cap.setScale(0.95 * s * 1.25); v.halo.setAlpha(1).setScale(1.6 * s);
        this.tweens.add({ targets: v.body, scale: 0.82 * s, duration: 170, ease: 'Back.easeOut' });
        this.tweens.add({ targets: v.cap, scale: 0.95 * s, duration: 170, ease: 'Back.easeOut' });
        this.tweens.add({ targets: v.halo, alpha: 0.25, scale: 1.1 * s, duration: 380 });
        this.ring(v.body.x, v.body.y, th.bumper, 0.6 * s, 1.3 * s, 300);
        burst(this, h.x, h.y, [th.bumper, 0xffffff, th.lamp], 10, 260);
        this.sfxAt(`bumper${(h.id % 3) + 1}`, h.x, { volume: 0.55 });
        this.award(100 + (this.level - 1) * 20, v.body.x, v.body.y - 30);
        this.bc.bumpers++;
        this.bump('bumpers');
        this.chain();
        break;
      }
      case 'sling':
        this.hitCd[key] = 0.12;
        this.slingFlash[h.id] = 0.14;
        burst(this, h.x, h.y, [th.sling, 0xffffff], 8, 200);
        this.sfxAt('sling', h.x, { volume: 0.6 });
        this.award(30, h.x, h.y);
        this.chain();
        break;
      case 'target': {
        const s = this.world.targets[h.id];
        if (!s.active) return;
        s.active = false;
        this.refreshTargets();
        const g = this.targetGlows[h.id];
        g.setAlpha(1);
        this.tweens.add({ targets: g, alpha: 0, duration: 450 });
        burst(this, BANK_X, h.y, [th.target, 0xffd23f, 0xffffff], 14, 240);
        this.sfxAt('target', h.x, { volume: 0.6 });
        this.award(500, BANK_X - 30, h.y);
        this.chain();
        if (this.world.targets.every((tg) => !tg.active)) this.bankDown();
        break;
      }
      case 'flipper':
        if (h.speed > 500) this.sfxAt('wall', h.x, { volume: 0.25 });
        break;
      default:
        this.hitCd[key] = 0.08;
        this.sfxAt('wall', h.x, { volume: Math.min(0.45, h.speed / 3000) });
        if (h.speed > 900) this.ring(h.x, h.y, 0xffffff, 0.1, 0.35, 220);
    }
  }

  private refreshTargets(): void {
    this.world.targets.forEach((s, i) => this.targetImgs[i].setTexture(s.active ? 'pb-target' : 'pb-slot'));
  }

  private bankDown(): void {
    this.sfx('bank', { volume: 0.7, exact: true });
    shake(this, 0.01, 220);
    flash(this, this.theme.target, 150, 0.25);
    this.award(5000, BANK_X - 60, BANK_Y[1], css(this.theme.target));
    this.dmd(t('bank'));
    this.bankTimer = 2.2;
    this.bump('targets');
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
        burst(this, LANES[lane], LANE_Y, this.theme.lamp, 10, 180);
        this.ring(LANES[lane], LANE_Y + 4, this.theme.lamp, 0.2, 0.6, 300);
        this.chain();
        if (this.lit.every(Boolean)) this.allLanes();
      } else this.award(50, LANES[lane], LANE_Y);
      this.refreshLanes();
    }
    this.inLane = lane;
  }

  private allLanes(): void {
    this.mult = Math.min(MAX_MULT, this.mult + 1);
    this.sfx('lanes', { volume: 0.7, exact: true });
    flash(this, this.theme.lamp, 150, 0.25);
    this.award(2500, W / 2, LANE_Y + 90);
    this.dmd(t('multUp', { n: this.mult }));
    this.updateDmd();
    this.lamps.forEach((l, i) => {
      this.tweens.add({ targets: l, scale: 1.5, duration: 120, yoyo: true, repeat: 2, delay: i * 60 });
      this.tweens.add({ targets: this.lampGlows[i], scale: 0.85, duration: 120, yoyo: true, repeat: 2, delay: i * 60 });
    });
    this.time.delayedCall(900, () => { this.lit = [false, false, false, false]; this.refreshLanes(); });
    this.bump('lanes');
  }

  private refreshLanes(): void {
    const th = this.theme;
    this.lit.forEach((on, i) => {
      this.lamps[i].setTint(on ? th.lamp : darken(th.lamp, 0.3));
      this.lampGlows[i].setAlpha(on ? 0.9 : 0);
      this.laneTexts[i].setColor(on ? css(th.lamp) : '#4a4170');
    });
  }

  // ================================================================ shots: saucer, ramp, orbits, spinner

  private saucerCheck(dt: number): void {
    const b = this.world.ball;
    if (this.held > 0) {
      this.held -= dt;
      b.x = SAUCER.x; b.y = SAUCER.y; b.vx = 0; b.vy = 0;
      if (this.held <= 0) {
        // kick out up and to the left, back into the bumpers
        b.vx = -rng.int(320, 440); b.vy = -rng.int(380, 520);
        this.saucerCd = 0.8;
        this.sfxAt('launch', SAUCER.x, { volume: 0.5 });
        burst(this, SAUCER.x, SAUCER.y, [0xffffff, this.theme.lamp], 10, 220);
      }
      return;
    }
    this.saucerCd = Math.max(0, this.saucerCd - dt);
    if (this.saucerCd > 0) return;
    if (Math.hypot(b.x - SAUCER.x, b.y - SAUCER.y) < SAUCER.r && Math.hypot(b.vx, b.vy) < 1600) {
      this.held = SAUCER.hold;
      this.sfxAt('target', SAUCER.x, { volume: 0.7 });
      this.time.delayedCall(150, () => this.sfx('lanes', { volume: 0.5, exact: true }));
      this.ring(SAUCER.x, SAUCER.y, this.theme.lamp, 0.2, 1.1, 500);
      this.award(1500 * this.level, SAUCER.x, SAUCER.y - 30, this.theme.accent);
      this.dmd(`${t('g_saucer')}\n${(1500 * this.level * this.mult).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US')}`);
      this.bc.saucers++;
      this.bump('saucer');
      this.chain();
    }
  }

  /** A fast ball reaching the top of the ramp lane rides the ramp. */
  private rampCheck(): void {
    const b = this.world.ball;
    if (b.x > RAMP.x0 + 4 && b.x < RAMP.x1 - 4 && b.y < RAMP.top + 50 && b.y > RAMP.top && b.vy < -380) {
      this.ride = { s: 0, v: Phaser.Math.Clamp(-b.vy, 900, 1500) };
      this.ballImg.setVisible(false); this.ballGlow.setVisible(false);
      this.riderImg.setVisible(true); this.riderGlow.setVisible(true);
      this.trail.stop();
      this.sfxAt('launch', b.x, { volume: 0.5 });
    }
  }

  private rideStep(dt: number): void {
    const r = this.ride!;
    const pts = this.rampPts, len = this.rampLen;
    r.v = Math.max(650, r.v - 250 * dt);
    r.s += r.v * dt;
    const total = len[len.length - 1];
    let i = 1;
    while (i < len.length - 1 && len[i] < r.s) i++;
    const f = Phaser.Math.Clamp((r.s - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]), 0, 1);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
    this.riderImg.setPosition(x, y);
    this.riderGlow.setPosition(x, y);
    const b = this.world.ball;
    b.x = x; b.y = y;
    if (r.s >= total) this.rideEnd();
  }

  private rideEnd(): void {
    const b = this.world.ball;
    const [x, y] = this.rampPts[this.rampPts.length - 1];
    b.x = x; b.y = y + 4; b.vx = -60; b.vy = 280;
    this.prevX = b.x; this.prevY = b.y;
    this.ride = null;
    this.riderImg.setVisible(false); this.riderGlow.setVisible(false);
    this.ballImg.setVisible(true); this.ballGlow.setVisible(true);
    this.rampCombo = this.elapsed - this.lastRamp < 7 ? this.rampCombo + 1 : 0;
    this.lastRamp = this.elapsed;
    const value = 2500 * (1 + this.rampCombo);
    this.award(value, x - 40, y - 60, this.theme.accent);
    this.sfx('lanes', { volume: 0.55, exact: true });
    this.dmd(this.rampCombo ? `${t('rampCombo')}\nx${this.rampCombo + 1}` : `${t('ramp')}\n${(value * this.mult).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US')}`);
    this.bc.ramps++;
    this.bump('ramps');
    this.chain();
  }

  /** Orbits (in one side lane and out of the other) and the spinner in the left lane. */
  private laneSensors(): void {
    const b = this.world.ball;
    const inL = b.x > 30 && b.x < ORBIT_L && b.y > ORBIT_BOT - 70 && b.y < ORBIT_BOT;
    const inR = b.x > ORBIT_R && b.x < 650 && b.y > ORBIT_BOT - 70 && b.y < ORBIT_BOT;
    if (inL || inR) {
      const side = inL ? 'L' : 'R';
      if (b.vy < -150 && (!this.orbitFrom || this.orbitFrom.side !== side)) this.orbitFrom = { side, t: this.elapsed };
      else if (b.vy > 150 && this.orbitFrom && this.orbitFrom.side !== side) {
        if (this.elapsed - this.orbitFrom.t < 4) this.orbit();
        this.orbitFrom = null;
      } else if (b.vy > 150 && this.orbitFrom?.side === side && this.elapsed - this.orbitFrom.t > 0.3) this.orbitFrom = null;
    }
    // spinner: the ball crossing its line spins it in proportion to the speed
    if (b.x > 34 && b.x < 90 && (this.prevY - SPINNER.y) * (b.y - SPINNER.y) < 0) {
      this.spinPending += Phaser.Math.Clamp(Math.round(Math.abs(b.vy) / 140), 2, 22);
    }
  }

  private orbit(): void {
    this.award(2000, W / 2, this.world.ball.y - 80, this.theme.accent);
    this.sfx('bank', { volume: 0.5, exact: true });
    this.dmd(`${t('orbit')}\n${(2000 * this.mult).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US')}`);
    this.bc.orbits++;
    this.bump('orbits');
    this.chain();
  }

  private spinStep(dt: number): void {
    if (this.spinPending <= 0) { this.spinPhase = 0; this.spinnerImg.setScale(1, 1); return; }
    this.spinPhase += dt * 22;
    while (this.spinPhase >= Math.PI && this.spinPending > 0) {
      this.spinPhase -= Math.PI;
      this.spinPending--;
      this.addScore(100 * this.mult);
      this.bump('points', 100 * this.mult);
      this.bc.spins++;
      this.bump('spinner');
      if (this.spinPending % 2 === 0) this.sfxAt('flipdown', SPINNER.x, { volume: 0.25 });
    }
    this.spinnerImg.setScale(1, Math.max(0.12, Math.abs(Math.cos(this.spinPhase))));
  }

  // ================================================================ frame

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const w = this.world, b = w.ball;
    const inp = this.readInput();

    const held = this.tilted ? [false, false] : [inp.left, inp.right];
    w.flippers[0].held = held[0]; w.flippers[2].held = held[0]; w.flippers[1].held = held[1];
    for (let i = 0; i < 2; i++) {
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
    const inShooter = this.inPlay && !this.ride && b.x > 652 && b.y > PLUNGER_Y - 40;
    if (inp.plunger && this.inPlay) {
      if (!this.charging) { this.charging = true; this.charge = 0; this.sfx('charge', { volume: 0.4 }); }
      this.charge = Math.min(1, this.charge + dt / 1.1);
    } else if (this.charging) {
      this.charging = false;
      if (inShooter) {
        b.vy = -(1000 + 1700 * this.charge);
        this.sfxAt('launch', LANE_X, { volume: 0.4 + this.charge * 0.4 });
        burst(this, LANE_X, PLUNGER_Y + 10, [0xffffff, hexColor(this.theme.glow)], 10, 200);
        this.ring(LANE_X, PLUNGER_Y, 0xffffff, 0.15, 0.5, 260);
      }
      this.charge = 0;
    }
    this.launchHint.setVisible(inShooter && Math.floor(this.elapsed * 2) % 2 === 0);

    for (const k of Object.keys(this.hitCd)) this.hitCd[k] -= dt;
    this.slingFlash = this.slingFlash.map((v) => Math.max(0, v - dt));
    this.tiltWarn = Math.max(0, this.tiltWarn - dt * 0.25);

    const tu = tuning(this.level);
    if (this.guard) {
      this.guardT += dt * tu.guard;
      const cx = GUARD.cx + Math.sin(this.guardT) * GUARD.sweep;
      this.guard.ax = cx - GUARD.half; this.guard.bx = cx + GUARD.half;
    }

    if (this.inPlay) {
      if (inShooter && this.charging) { b.vy = Math.min(b.vy, 0); b.y = Math.min(b.y, PLUNGER_Y + this.charge * 26); }
      const free = !this.ride && this.held <= 0;
      this.prevX = b.x; this.prevY = b.y;
      const hits = step(w, dt, free);
      for (const h of hits) this.onHit(h);
      if (this.ride) this.rideStep(dt);
      else {
        this.saucerCheck(dt);
        if (this.held <= 0) {
          this.rampCheck();
          this.laneSensors();
          this.laneCheck();
        }
      }
      if (this.saveArmed && b.x < 640) { this.saveArmed = false; this.ballSave = tu.save; }
      this.ballSave = Math.max(0, this.ballSave - dt);
      // anti-stall: a ball resting anywhere but on a flipper, the plunger or the saucer gets a shove
      const slow = Math.hypot(b.vx, b.vy) < 25;
      if (slow && free && this.held <= 0 && !inShooter && !w.flippers.some((f) => f.held) && b.y < PIVOT_Y - 60) {
        this.stall += dt;
        if (this.stall > 1.5) { this.stall = 0; b.vx += rng.pick([-1, 1]) * 120; b.vy -= 200; this.sfx('nudge', { volume: 0.3 }); }
      } else this.stall = 0;
      if (!this.ride && b.y > DRAIN_Y) this.drain();
    } else {
      step(w, dt, false);
      if (this.waiting > 0) {
        this.waiting -= dt;
        if (this.waiting <= 0 && !this.isOver) {
          this.ballNo++;
          this.serveBall();
        }
      }
    }
    this.spinStep(dt);

    // drop targets pop back up once the ball is clear of them
    if (this.bankTimer > 0) {
      this.bankTimer -= dt;
      if (this.bankTimer <= 0) {
        if (Math.abs(b.x - BANK_X) < 60 && b.y > BANK_Y[0] - 40 && b.y < BANK_Y[3] + 40) this.bankTimer = 0.3;
        else {
          for (const s of w.targets) s.active = true;
          this.refreshTargets();
          this.sfx('target', { volume: 0.4 });
        }
      }
    }

    this.nudgeCd = Math.max(0, this.nudgeCd - dt);
    this.tickDmd(dt);
    this.render(inShooter, dt);
  }

  private render(inShooter: boolean, dt: number): void {
    const w = this.world, b = w.ball, th = this.theme;
    this.ballImg.setPosition(b.x, b.y);
    this.ballGlow.setPosition(b.x, b.y);
    const fast = Math.hypot(b.vx, b.vy) > 800;
    if (this.inPlay && fast && !this.ride && this.held <= 0) { this.trail.setPosition(b.x, b.y); if (!this.trail.emitting) this.trail.start(); }
    else if (this.trail.emitting) this.trail.stop();
    this.flipImgs.forEach((img, i) => img.setRotation(w.flippers[i].angle));

    // the camera follows the ball up and down the table
    const focus = this.inPlay ? b.y : PLUNGER_Y;
    const target = Phaser.Math.Clamp(focus - 640, SCROLL_MIN, SCROLL_MAX);
    this.camY += (target - this.camY) * (1 - Math.exp(-dt * 7));
    this.cameras.main.setScroll(0, Math.round(this.camY));

    // sling rubbers and the guard
    const g = this.fxGfx;
    g.clear();
    [SLING_L, SLING_R].forEach((s, i) => {
      const lit = this.slingFlash[i] > 0;
      g.lineStyle(lit ? 22 : 14, th.sling, lit ? 0.55 : 0.2).lineBetween(s.a[0], s.a[1], s.c[0], s.c[1]);
      g.lineStyle(lit ? 9 : 7, lit ? 0xffffff : 0xf2f2f2, 1).lineBetween(s.a[0], s.a[1], s.c[0], s.c[1]);
    });
    if (this.guard) {
      const gd = this.guard;
      g.lineStyle(26, th.bumper, 0.22).lineBetween(gd.ax, gd.ay, gd.bx, gd.by);
      g.lineStyle(14, th.bumper, 1).lineBetween(gd.ax, gd.ay, gd.bx, gd.by);
      g.lineStyle(4, 0xffffff, 0.85).lineBetween(gd.ax + 4, gd.ay - 3, gd.bx - 4, gd.by - 3);
    }
    this.saucerGlow.setAlpha(this.held > 0 ? 1 : this.goalOpen('saucer') ? 0.35 + Math.sin(this.elapsed * 5) * 0.2 : 0.15);

    // inserts: a shot that counts for an open goal blinks
    const blink = (Math.sin(this.elapsed * 7) + 1) / 2;
    for (const [shot, goals] of Object.entries(SHOT_GOALS) as [Shot, Goal[]][]) {
      const [lamp, glow] = this.inserts[shot]!;
      const open = goals.some((gl) => this.goalOpen(gl));
      lamp.setAlpha(open ? 0.4 + blink * 0.6 : 0.2);
      glow.setAlpha(open ? blink * 0.7 : 0);
    }
    const total = this.goals.reduce((s, _, i) => s + this.goalFrac(i), 0) / Math.max(1, this.goals.length);
    const on = Math.floor(total * 3 + 1e-6);
    this.arrows.forEach((a, i) => a.setAlpha(i < on ? 1 : i === on ? 0.3 + blink * 0.6 : 0.18));

    // plunger spring
    const p = this.plungerGfx;
    p.clear();
    const top = PLUNGER_Y + BALL_R + 2 + (inShooter || !this.inPlay ? this.charge * 26 : 0);
    p.lineStyle(3, 0xb9c3d1, 1);
    for (let y = top + 8; y < PLUNGER_Y + 60; y += 8) p.lineBetween(LANE_X - 12, y, LANE_X + 12, y + 4);
    p.fillStyle(0xffffff, 1).fillRoundedRect(LANE_X - 19, top - 1, 38, 10, 3);
    p.fillStyle(th.flipper, 1).fillRoundedRect(LANE_X - 18, top, 36, 8, 3);

    const save = this.ballSave > 0 ? (this.ballSave < 2 ? (Math.floor(this.elapsed * 8) % 2 ? 1 : 0.3) : 1) : 0.15;
    this.saveText.setAlpha(save);
    this.saveGlow.setAlpha(this.ballSave > 0 ? save * 0.5 : 0);

    if (!this.dmdMsg.visible) this.updateDmd();
    this.drawButtons();
  }

  private drawButtons(): void {
    const g = this.btnGfx;
    g.clear();
    const [nudge, launch] = this.btnImgs;
    const top = (img: Phaser.GameObjects.Image) => img.y - BTN_H / 2 - 4;
    nudge.setTint(this.tilted ? 0x4a3a3a : COLORS.purple);
    if (this.tiltWarn > 0.05) {
      const f = Math.min(1, this.tiltWarn / TILT_AT);
      g.fillStyle(f > 0.6 ? COLORS.red : 0xffd23f, 0.55).fillRoundedRect(NUDGE_X - BTN_W / 2 + 4, top(nudge) + BTN_H * (1 - f), BTN_W - 8, BTN_H * f - 4, 12);
    }
    launch.setY(BTN_Y + 4 + (this.charging ? 4 : 0));
    this.btnLabels[1].setY(BTN_Y + (this.charging ? 4 : 0));
    if (this.charging) {
      const f = Math.max(0.08, this.charge);
      g.fillStyle(0xffd23f, 0.6).fillRoundedRect(LAUNCH_X - BTN_W / 2 + 4, top(launch) + BTN_H * (1 - f), BTN_W - 8, BTN_H * f - 4, 12);
    }
  }
}
