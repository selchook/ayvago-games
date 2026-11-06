import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng, loc, getLang, COLORS } from '@core';
import {
  World, Hit, Seg, Pt, BALL_R, W, TH, LANE_X, PLUNGER_Y, DRAIN_Y, LANES, LANE_Y, PIVOT_Y,
  SLING_L, SLING_R, ORBIT_L, ORBIT_R, ORBIT_BOT, step,
} from './table';
import { TABLES, TableDef, HoleDef, Mission, CATCH_SPEED, buildTable, bankTargets, targetOf, tuning } from './tables';
import { makeTextures, paintTable, paintApron, paintRamps, paintCard, makeButton, css, insertsOf, PROGRESS, APRON_Y } from './art';

const BALLS = 3;
const LETTERS = ['A', 'Y', 'V', 'A'];
const MAX_MULT = 5;
const TILT_AT = 2.4;          // three quick nudges (the meter drains slowly)
const BTN_Y = 1232, BTN_H = 84, BTN_W = 164;
const NUDGE_X = 92, LAUNCH_X = 628;
const DMD_X = 298, DMD_Y = 58;
const BAR_TOP = 1180;
const SCROLL_MIN = -110, SCROLL_MAX = TH - BAR_TOP;
const STORE_KEY = 'ayvago.pinball.tables';
const HOLD: Record<HoleDef['kind'], number> = { saucer: 1, cannon: 0.8, vortex: 0.9, wormhole: 0.45 };
const VALUE: Record<HoleDef['kind'], number> = { saucer: 1500, cannon: 1000, vortex: 2500, wormhole: 3000 };

type Zone = 'L' | 'R' | 'P' | 'N' | null;

const darken = (c: number, k: number): number =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
const short = (n: number): string => (n >= 1000 ? `${Math.floor(n / 100) / 10}K`.replace('.0K', 'K') : `${n}`);
const hexColor = (s: string): number => Phaser.Display.Color.HexStringToColor(s).color;
const fmt = (n: number): string => n.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US');

function loadUnlocked(): number {
  try { return Phaser.Math.Clamp(Number(localStorage.getItem(STORE_KEY)) || 1, 1, TABLES.length); } catch { return 1; }
}
function saveUnlocked(n: number): void {
  try { if (n > loadUnlocked()) localStorage.setItem(STORE_KEY, String(n)); } catch { /* storage may be blocked */ }
}

interface BumperView { body: Phaser.GameObjects.Image; cap: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; r: number }
interface Row { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; y: number }
interface BallCount { ramps: number; orbits: number; holes: number; bumpers: number; spins: number }
interface InsertView { lamp: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; missions: Mission[] }

export class PlayScene extends ArcadeScene {
  private world!: World;
  private def: TableDef = TABLES[0];
  private tableIdx = 0;
  private round = 1;
  private stage = 0;
  private target = 0;
  private tableScore = 0;
  private table!: Phaser.GameObjects.Container;
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
  private inserts: InsertView[] = [];
  private arrows: Phaser.GameObjects.Image[] = [];
  private spinnerImgs: Phaser.GameObjects.Image[] = [];
  private holeGlows: Phaser.GameObjects.Image[] = [];
  private holeSpins: (Phaser.GameObjects.Image | null)[] = [];
  private fxGfx!: Phaser.GameObjects.Graphics;
  private plungerGfx!: Phaser.GameObjects.Graphics;
  private saveText!: Phaser.GameObjects.Text;
  private saveGlow!: Phaser.GameObjects.Image;
  private launchHint!: Phaser.GameObjects.Text;
  private barGfx!: Phaser.GameObjects.Graphics;
  private rows: Row[] = [];
  private btnImgs: Phaser.GameObjects.Image[] = [];
  private btnGfx!: Phaser.GameObjects.Graphics;
  private btnLabels: Phaser.GameObjects.Text[] = [];
  private dmdScore!: Phaser.GameObjects.Text;
  private dmdInfo!: Phaser.GameObjects.Text;
  private dmdMsg!: Phaser.GameObjects.Text;
  private picker: Phaser.GameObjects.Container | null = null;
  private pickIdx = 0;
  private pickCards: Phaser.GameObjects.Image[] = [];
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  private balls = BALLS;
  private ballNo = 1;
  private extra = 0;
  private mult = 1;
  private missions: [Mission, number][] = [];
  private prog: Partial<Record<Mission, number>> = {};
  private jackpots = 0;
  private clearing = false;
  private lit = [false, false, false, false];
  private inLane = -1;
  private charge = 0;
  private charging = false;
  private plungerLock = false;
  private ballSave = 0;
  private saveArmed = false;
  private nudgeCd = 0;
  private tiltWarn = 0;
  private tilted = false;
  private stall = 0;
  private waiting = 0;
  private inPlay = false;
  private slingFlash = [0, 0];
  private bankOf: number[] = [];
  private bankTimers: number[] = [];
  private prevHeld = [false, false];
  private hitCd: Record<string, number> = {};
  private pulse = [0, 0];
  private guard: Seg | null = null;
  private guardT = 0;
  private hold: { i: number; t: number } | null = null;
  private holeCd: number[] = [];
  private combo = 0;
  private lastHit = -9;
  private ride: { r: number; s: number; v: number } | null = null;
  private rampPaths: Pt[][] = [];
  private rampLens: number[][] = [];
  private lastRamp = -99;
  private rampCombo = 0;
  private orbitFrom: { side: 'L' | 'R'; t: number } | null = null;
  private prevY = 0;
  private spinPending: number[] = [];
  private spinPhase: number[] = [];
  private bc: BallCount = { ramps: 0, orbits: 0, holes: 0, bumpers: 0, spins: 0 };
  private msgQ: string[] = [];
  private msgT = 0;
  private camY = SCROLL_MAX;

  createGame(): void {
    makeTextures(this);
    this.keys = {}; this.rows = []; this.btnImgs = []; this.btnLabels = []; this.picker = null; this.pickCards = [];
    this.balls = BALLS; this.ballNo = 1; this.extra = 0; this.mult = 1; this.round = 1; this.stage = 0; this.tableScore = 0;
    this.clearing = false; this.charge = 0; this.charging = false; this.plungerLock = false;
    this.nudgeCd = 0; this.tiltWarn = 0; this.tilted = false; this.waiting = 0; this.inPlay = false;
    this.prevHeld = [false, false]; this.pulse = [0, 0]; this.combo = 0; this.lastHit = -9; this.lastRamp = -99; this.rampCombo = 0;
    this.msgQ = []; this.msgT = 0; this.camY = SCROLL_MAX;
    this.useHud = false;   // the score lives on the dot-matrix display

    // two thumbs plus the launch button; the pointers live on the game, so add them only once
    const pointers = this.input.manager.pointersTotal;
    if (pointers < 6) this.input.addPointer(6 - pointers);
    this.cameras.main.setScroll(0, this.camY);
    this.table = this.add.container(0, 0);
    this.buildOverlay();
    this.bindInput();
    const unlocked = loadUnlocked();
    if (unlocked > 1) {
      this.loadTable(unlocked - 1);
      this.showPicker(unlocked);
    } else this.startTable(0, true);
  }

  // ================================================================ tables

  /** Builds table i (its physics, art and parts) without serving a ball. */
  private loadTable(i: number): void {
    this.tableIdx = i;
    this.def = TABLES[i];
    const tu = tuning(this.stage);
    const bt = buildTable(this.def, tu.gravity, tu.kick);
    this.world = bt.world;
    this.world.ball.x = LANE_X; this.world.ball.y = PLUNGER_Y;
    this.bankOf = bt.bankOf;
    this.bankTimers = this.def.banks.map(() => 0);
    this.guard = bt.guard; this.guardT = 0;
    this.rampPaths = bt.rampPaths;
    this.rampLens = bt.rampPaths.map((p) => {
      const len = [0];
      for (let k = 1; k < p.length; k++) len.push(len[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
      return len;
    });
    this.holeCd = this.def.holes.map(() => 0);
    this.spinPending = this.def.spinners.map(() => 0);
    this.spinPhase = this.def.spinners.map(() => 0);
    this.hold = null; this.ride = null; this.orbitFrom = null;
    this.target = targetOf(this.def, this.round);
    this.tableScore = 0;
    this.jackpots = 0;
    this.missions = this.def.missions;
    this.prog = {};
    this.lit = [false, false, false, false]; this.inLane = -1;
    this.slingFlash = [0, 0]; this.hitCd = {};
    this.buildView();
    this.layoutRows();
    this.updateRows();
  }

  /** Starts play on table i: builds it, shows its name and serves a ball. */
  private startTable(i: number, first: boolean): void {
    this.loadTable(i);
    this.updateDmd();
    this.serveBall(first);
    this.dmd(`${t('tableN', { n: i + 1 })}\n${loc(this.def.title)}`);
    if (this.round > 1) this.dmd(t('round', { n: this.round }));
    this.dmd(`${t('target')}\n${fmt(this.target)}`);
  }

  private buildView(): void {
    this.table.removeAll(true);
    this.flipImgs = []; this.bumpers = []; this.targetImgs = []; this.targetGlows = []; this.lamps = []; this.lampGlows = [];
    this.laneTexts = []; this.inserts = []; this.arrows = []; this.spinnerImgs = []; this.holeGlows = []; this.holeSpins = [];
    const def = this.def, th = def.theme;
    const add = (o: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) => this.table.add(o);
    add(this.add.image(0, 0, paintTable(this, def, getLang() === 'tr' ? 'tr' : 'en')).setOrigin(0));

    for (const ins of insertsOf(def)) {
      const glow = this.add.image(ins.x, ins.y, 'pb-glow').setScale(0.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setTint(th.lamp);
      const lamp = this.add.image(ins.x, ins.y + 2, 'pb-arrow').setRotation(ins.rot).setScale(0.72).setTint(th.lamp);
      this.inserts.push({ lamp, glow, missions: ins.missions });
      add([glow, lamp]);
    }
    for (const [x, y] of PROGRESS) {
      const a = this.add.image(x, y + 2, 'pb-arrow').setScale(0.72).setAlpha(0.25).setTint(th.lamp);
      this.arrows.push(a);
      add(a);
    }
    def.holes.forEach((h) => {
      let spin: Phaser.GameObjects.Image | null = null;
      if (h.kind === 'vortex') spin = this.add.image(h.x, h.y, 'pb-vortex').setScale(((h.pull ?? 90) * 2) / 220).setAlpha(0.45).setTint(hexColor(th.glow)).setBlendMode(Phaser.BlendModes.ADD);
      if (h.kind === 'wormhole') spin = this.add.image(h.x, h.y, 'pb-portal').setScale(0.9).setAlpha(0.8).setTint(th.lamp).setBlendMode(Phaser.BlendModes.ADD);
      const glow = this.add.image(h.x, h.y, 'pb-glow').setScale(0.75).setBlendMode(Phaser.BlendModes.ADD).setTint(th.lamp);
      this.holeGlows.push(glow); this.holeSpins.push(spin);
      add(spin ? [spin, glow] : [glow]);
      if (h.kind === 'saucer' || h.kind === 'cannon') add(this.add.image(h.x, h.y, 'pb-saucer'));
    });
    for (const sp of def.spinners) {
      const img = this.add.image(sp.x, sp.y, 'pb-spinner').setDisplaySize(sp.x1 - sp.x0, 16);
      this.spinnerImgs.push(img);
      add(img);
    }
    LANES.forEach((x, i) => {
      const glow = this.add.image(x, LANE_Y + 4, 'pb-glow').setScale(0.55).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setTint(th.lamp);
      const lamp = this.add.image(x, LANE_Y + 4, 'pb-lamp');
      const letter = txt(this, x, LANE_Y + 52, LETTERS[i], { title: true, size: 24, color: '#4a4170', strokeThickness: 4 });
      this.lampGlows.push(glow); this.lamps.push(lamp); this.laneTexts.push(letter);
      add([glow, lamp, letter]);
    });
    for (const s of this.world.targets) {
      const x = (s.ax + s.bx) / 2, y = (s.ay + s.by) / 2, vert = s.ax === s.bx;
      const glow = this.add.image(x, y, 'pb-glow').setScale(vert ? 0.3 : 0.6, vert ? 0.6 : 0.3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setTint(th.target);
      const img = this.add.image(x, y, 'pb-target').setAngle(vert ? 90 : 0).setTint(th.target);
      this.targetGlows.push(glow); this.targetImgs.push(img);
      add([glow, img]);
    }
    for (const b of this.world.bumpers) {
      const s = b.r / 36;
      const shadow = this.add.image(b.x + 4, b.y + 8, 'pb-glow').setTint(0x000000).setScale(0.75 * s).setAlpha(0.7);
      const halo = this.add.image(b.x, b.y, 'pb-glow').setScale(1.1 * s).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25).setTint(th.bumper);
      const body = this.add.image(b.x, b.y, 'pb-bumper').setScale(0.82 * s).setTint(th.bumper);
      const cap = this.add.image(b.x, b.y - 2, 'pb-cap').setScale(0.95 * s);
      this.bumpers.push({ body, cap, halo, r: b.r });
      add([shadow, halo, body, cap]);
    }
    this.fxGfx = this.add.graphics();
    this.plungerGfx = this.add.graphics();
    add([this.fxGfx, this.plungerGfx]);

    this.trail = this.add.particles(0, 0, 'pb-glow', {
      speed: 0, lifespan: 260, scale: { start: 0.24, end: 0 }, alpha: { start: 0.5, end: 0 },
      blendMode: Phaser.BlendModes.ADD, frequency: 14, emitting: false, tint: hexColor(th.glow),
    });
    this.ballGlow = this.add.image(LANE_X, PLUNGER_Y, 'pb-glow').setScale(0.42).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setTint(hexColor(th.glow));
    this.ballImg = this.add.image(LANE_X, PLUNGER_Y, 'pb-ball');
    add([this.trail, this.ballGlow, this.ballImg]);
    // ramps run over the table; a ball riding one is drawn above it
    if (def.ramps.length) add(this.add.image(0, 0, paintRamps(this, def, this.rampPaths)).setOrigin(0));
    this.riderGlow = this.add.image(0, 0, 'pb-glow').setScale(0.5).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setTint(hexColor(th.glow));
    this.riderImg = this.add.image(0, 0, 'pb-ball').setScale(1.12).setVisible(false);
    add([this.riderGlow, this.riderImg]);

    add(this.add.image(0, APRON_Y, paintApron(this, th)).setOrigin(0));
    for (const f of this.world.flippers) {
      const img = this.add.image(f.px, f.py, 'pb-flipper').setOrigin(16 / 148, 0.5).setRotation(f.angle).setScale(f.scale).setTint(th.flipper);
      this.flipImgs.push(img);
      add([img, this.add.image(f.px, f.py, 'pb-pivot').setScale(f.scale)]);
    }
    this.saveGlow = this.add.image(340, PIVOT_Y + 81, 'pb-glow').setScale(1.4, 0.3).setTint(0x5dff7a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.saveText = txt(this, 340, PIVOT_Y + 81, t('ballSave'), { title: true, size: 12, color: '#5dff7a', strokeThickness: 3 });
    this.launchHint = txt(this, 340, 1690, t('holdLaunch'), { size: 24, color: '#f3f2f2', strokeThickness: 5, align: 'center' }).setVisible(false);
    add([this.saveGlow, this.saveText, this.launchHint]);
    this.refreshLanes();
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
    for (let i = 0; i < 4; i++) {
      const label = fix(txt(this, 202, 0, '', { title: true, size: 12, color: '#ffffff', strokeThickness: 3 }).setOrigin(0, 0.5), 52);
      const value = fix(txt(this, 518, 0, '', { title: true, size: 12, color: '#ffffff', strokeThickness: 3 }).setOrigin(1, 0.5), 52);
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
      kb.on('keydown-UP', () => (this.picker ? this.movePick(-1) : this.nudge()));
      kb.on('keydown-DOWN', () => { if (this.picker) this.movePick(1); });
      kb.on('keydown-X', () => this.nudge());
      kb.on('keydown-N', () => this.nudge());
      kb.on('keydown-ENTER', () => { if (this.picker) this.choosePick(this.pickIdx); });
      kb.on('keydown-SPACE', () => { if (this.picker) this.choosePick(this.pickIdx); });
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.picker) return;
      const z = this.zoneAt(p.x, p.y);
      if (z === 'N') this.nudge();
      else if (z === 'L') this.pulse[0] = 0.1;
      else if (z === 'R') this.pulse[1] = 0.1;
    });
  }

  // ================================================================ table picker

  private showPicker(unlocked: number): void {
    const box = this.add.container(0, 0).setScrollFactor(0).setDepth(70);
    box.add(this.add.rectangle(0, 0, W, 1280, 0x04030c, 0.88).setOrigin(0).setInteractive());
    box.add(txt(this, W / 2, 150, t('pickTable'), { title: true, size: 34, color: '#ffd23f' }));
    this.pickCards = [];
    TABLES.forEach((def, i) => {
      const y = 290 + i * 168, open = i < unlocked;
      const card = this.add.image(W / 2, y, paintCard(this, def, i));
      const name = txt(this, 196, y - 22, loc(def.title), { title: true, size: 22, color: def.theme.accent }).setOrigin(0, 0.5);
      const info = txt(this, 196, y + 26, open ? `${t('target')} ${fmt(targetOf(def, 1))}` : t('locked'), { size: 22, color: open ? '#ffffff' : '#9a98a8' }).setOrigin(0, 0.5);
      const num = txt(this, W - 90, y, `${i + 1}`, { title: true, size: 40, color: open ? '#ffffff' : '#55536a' });
      box.add([card, name, info, num]);
      if (!open) box.add(this.add.rectangle(W / 2, y, 584, 134, 0x000000, 0.55));
      else card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.choosePick(i));
      this.pickCards.push(card);
    });
    box.add(txt(this, W / 2, 1150, t('pickHint'), { size: 22, color: '#b9b6cc' }));
    // fixed to the screen, children included, so taps land on the cards whatever the camera's scroll
    box.each((o: Phaser.GameObjects.GameObject) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0));
    this.picker = box;
    this.pickIdx = unlocked - 1;
    this.movePick(0);
  }

  private movePick(d: number): void {
    const n = loadUnlocked();
    this.pickIdx = Phaser.Math.Clamp(this.pickIdx + d, 0, n - 1);
    this.pickCards.forEach((c, i) => c.setScale(i === this.pickIdx ? 1.04 : 0.96).setAlpha(i === this.pickIdx ? 1 : 0.8));
    if (d) this.sfx('lane', { volume: 0.35 });
  }

  private choosePick(i: number): void {
    if (!this.picker || i >= loadUnlocked()) return;
    this.picker.destroy();
    this.picker = null;
    this.plungerLock = true;
    this.sfx('newball', { volume: 0.6 });
    this.stage = i;
    this.startTable(i, true);
  }

  // ================================================================ display

  private dmd(s: string): void {
    this.msgQ.push(s);
  }

  private updateDmd(): void {
    this.dmdScore.setText(fmt(this.score));
    this.dmdInfo.setText(`${t('ball')} ${this.ballNo}/${BALLS + this.extra}   ${t('tableN', { n: this.tableIdx + 1 })}   x${this.mult}`);
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

  // ================================================================ target, missions, jackpot

  private label(m: Mission): string {
    const own = this.def.labels?.[m];
    return own ? loc(own) : t(`m_${m}`);
  }

  private need(i: number): number {
    return Math.ceil(this.missions[i][1] * (1 + this.jackpots * 0.5));
  }

  private missionFrac(i: number): number {
    return Math.min(1, (this.prog[this.missions[i][0]] ?? 0) / this.need(i));
  }

  private missionOpen(m: Mission): boolean {
    const i = this.missions.findIndex(([g]) => g === m);
    return i >= 0 && this.missionFrac(i) < 1;
  }

  private layoutRows(): void {
    const n = this.missions.length + 1;
    const gap = Math.min(28, 84 / n), y0 = 1232 - ((n - 1) * gap) / 2;
    this.rows.forEach((r, i) => {
      const on = i < n;
      r.label.setVisible(on); r.value.setVisible(on);
      if (!on) return;
      r.y = y0 + i * gap;
      r.label.setY(r.y).setText(i === 0 ? t('target') : this.label(this.missions[i - 1][0]));
      r.value.setY(r.y);
    });
  }

  private updateRows(): void {
    const th = this.def.theme, g = this.barGfx;
    g.clear();
    const bar = (r: Row, f: number, color: number, done: boolean) => {
      g.fillStyle(0xffffff, 0.07).fillRoundedRect(196, r.y - 10, 328, 20, 6);
      if (f > 0) g.fillStyle(color, done ? 0.6 : 0.34).fillRoundedRect(196, r.y - 10, Math.max(12, 328 * f), 20, 6);
    };
    const tf = Math.min(1, this.tableScore / this.target);
    bar(this.rows[0], tf, hexColor(th.accent), tf >= 1);
    this.rows[0].value.setText(`${short(Math.min(this.tableScore, this.target))}/${short(this.target)}`).setColor(th.accent);
    this.rows[0].label.setColor(th.accent);
    this.missions.forEach(([m], i) => {
      const r = this.rows[i + 1], f = this.missionFrac(i), done = f >= 1, need = this.need(i);
      bar(r, f, th.lamp, done);
      r.value.setText(done ? t('done') : `${Math.min(need, this.prog[m] ?? 0)}/${need}`).setColor(done ? th.accent : '#ffffff');
      r.label.setColor(done ? th.accent : '#ffffff');
    });
  }

  /** Every point scored goes through here: it counts towards this table's target. */
  private gain(n: number): void {
    if (this.isOver || n <= 0) return;
    this.addScore(n);
    this.tableScore += n;
    this.updateRows();
    if (!this.clearing && this.tableScore >= this.target) this.tableClear();
  }

  private bump(m: Mission, n = 1): void {
    if (this.clearing || this.isOver) return;
    const i = this.missions.findIndex(([g]) => g === m);
    if (i < 0) return;
    const before = this.missionFrac(i);
    this.prog[m] = (this.prog[m] ?? 0) + n;
    if (before < 1 && this.missionFrac(i) >= 1) {
      this.sfx('saved', { volume: 0.45 });
      this.dmd(t('goalDone', { g: this.label(m) }));
      const row = this.rows[i + 1];
      this.tweens.add({ targets: [row.label, row.value], scale: 1.25, duration: 120, yoyo: true });
    }
    this.updateRows();
    if (this.missions.every((_, k) => this.missionFrac(k) >= 1)) this.jackpot();
  }

  private jackpot(): void {
    const value = Math.round((this.target * 0.25) / 1000) * 1000;
    this.jackpots++;
    this.prog = {};
    this.sfx('bank', { volume: 0.75, exact: true });
    this.time.delayedCall(300, () => this.sfx('lanes', { volume: 0.6, exact: true }));
    flash(this, hexColor(this.def.theme.glow), 220, 0.3);
    shake(this, 0.01, 220);
    this.dmd(`${t('jackpot')}\n${fmt(value)}`);
    popup(this, W / 2, this.camY + 600, `+${fmt(value)}`, this.def.theme.accent, 34);
    this.gain(value);
  }

  private tableClear(): void {
    this.clearing = true;
    const next = this.tableIdx + 1;
    saveUnlocked(Math.min(TABLES.length, next + 1));
    const newlyOpen = next < TABLES.length && next + 1 > loadUnlocked() - 1;
    this.sfx('bank', { volume: 0.8, exact: true });
    this.time.delayedCall(350, () => this.sfx('lanes', { volume: 0.7, exact: true }));
    flash(this, hexColor(this.def.theme.glow), 300, 0.4);
    shake(this, 0.014, 300);
    this.msgQ = []; this.msgT = 0;
    this.dmd(t('tableClear'));
    if (newlyOpen && next < TABLES.length) this.dmd(t('newTable'));
    this.extra++; this.balls++;
    this.dmd(t('extraBall'));
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 120, () => burst(this, rng.int(100, 620), this.camY + rng.int(250, 1000), [0xffffff, this.def.theme.lamp, this.def.theme.bumper], 24, 400));
    // the ball is lifted off the table; the next table starts with it on the plunger
    this.inPlay = false; this.ride = null; this.hold = null;
    this.ballImg.setVisible(false); this.ballGlow.setVisible(false); this.riderImg.setVisible(false); this.riderGlow.setVisible(false);
    this.trail.stop();
    this.ring(this.world.ball.x, this.world.ball.y, 0xffffff, 0.2, 1.4, 500);
    this.time.delayedCall(1800, () => {
      if (this.isOver) return;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        if (this.isOver) return;
        if (next >= TABLES.length) this.round++;
        this.stage++;
        this.camY = SCROLL_MAX;
        this.startTable(next % TABLES.length, true);
        this.ballSave = 0; this.saveArmed = true;
        this.clearing = false;
        this.cameras.main.fadeIn(500, 0, 0, 0);
      });
    });
  }

  /** Test hook: clear the current table at once (used by screenshot scripts). */
  clearForTest(): void {
    this.gain(Math.max(0, this.target - this.tableScore));
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
    if (this.isOver || !this.inPlay || this.tilted || this.picker) return;
    if (this.nudgeCd > 0) return;
    this.nudgeCd = 0.45;
    this.tiltWarn += 1;
    const b = this.world.ball;
    if (b.x < 650 && !this.hold && !this.ride) {
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
    this.prevY = b.y;
    this.hold = null; this.ride = null; this.tilted = false; this.tiltWarn = 0; this.orbitFrom = null;
    this.bc = { ramps: 0, orbits: 0, holes: 0, bumpers: 0, spins: 0 };
    this.ballImg.setVisible(true).setPosition(b.x, b.y).setScale(0.2).setAlpha(1);
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
    const bonus = (c.ramps * 2000 + c.orbits * 1500 + c.holes * 1000 + c.bumpers * 50 + c.spins * 10) * this.mult;
    if (!this.tilted && bonus > 0) {
      this.dmd(`${t('ballBonus')}\n${fmt(bonus)}`);
      this.gain(bonus);
    } else if (!this.tilted) this.dmd(t('lost'));
    if (this.clearing) return;   // the bonus finished the table: the next one serves a ball
    this.balls--;
    if (this.balls <= 0) {
      this.endGame({ delay: 1600 });
      return;
    }
    this.waiting = bonus > 0 ? 2 : 1.4;
  }

  // ================================================================ scoring

  private award(base: number, x: number, y: number, color = '#ffd23f'): void {
    const n = base * this.mult;
    popup(this, x, y - 20, `+${n}`, color, n >= 1000 ? 26 : 18);
    this.gain(n);
  }

  private chain(): void {
    this.combo = this.elapsed - this.lastHit < 1.1 ? this.combo + 1 : 1;
    this.lastHit = this.elapsed;
    if (this.combo >= 5 && this.combo % 5 === 0) {
      this.dmd(t('combo', { n: this.combo }));
      this.sfx('lane', { volume: 0.5 });
      this.award(50 * this.combo, this.world.ball.x, this.world.ball.y - 40, '#ff8cf0');
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
    const th = this.def.theme;
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
        this.bc.bumpers++;
        this.award(100 + this.stage * 20, v.body.x, v.body.y - 30);
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
        const tx = (s.ax + s.bx) / 2, ty = (s.ay + s.by) / 2;
        burst(this, tx, ty, [th.target, 0xffd23f, 0xffffff], 14, 240);
        this.sfxAt('target', tx, { volume: 0.6 });
        this.award(500, tx, ty);
        this.chain();
        const bi = this.bankOf[h.id];
        if (this.world.targets.every((tg, k) => this.bankOf[k] !== bi || !tg.active)) this.bankDown(bi);
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

  private bankDown(bi: number): void {
    const pts = bankTargets(this.def.banks[bi]);
    const [x, y] = pts[Math.floor(pts.length / 2)];
    this.sfx('bank', { volume: 0.7, exact: true });
    shake(this, 0.01, 220);
    flash(this, this.def.theme.target, 150, 0.25);
    this.dmd(t('bank'));
    this.bankTimers[bi] = 2.2;
    this.award(5000, x, y - 40, css(this.def.theme.target));
    this.bump('banks');
  }

  private laneCheck(): void {
    const b = this.world.ball;
    let lane = -1;
    if (Math.abs(b.y - LANE_Y) < 18) LANES.forEach((x, i) => { if (Math.abs(b.x - x) < 26) lane = i; });
    if (lane >= 0 && lane !== this.inLane) {
      if (!this.lit[lane]) {
        this.lit[lane] = true;
        this.sfxAt('lane', b.x, { volume: 0.55 });
        burst(this, LANES[lane], LANE_Y, this.def.theme.lamp, 10, 180);
        this.ring(LANES[lane], LANE_Y + 4, this.def.theme.lamp, 0.2, 0.6, 300);
        this.award(250, LANES[lane], LANE_Y);
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
    flash(this, this.def.theme.lamp, 150, 0.25);
    this.dmd(t('multUp', { n: this.mult }));
    this.updateDmd();
    this.lamps.forEach((l, i) => {
      this.tweens.add({ targets: l, scale: 1.5, duration: 120, yoyo: true, repeat: 2, delay: i * 60 });
      this.tweens.add({ targets: this.lampGlows[i], scale: 0.85, duration: 120, yoyo: true, repeat: 2, delay: i * 60 });
    });
    this.time.delayedCall(900, () => { this.lit = [false, false, false, false]; this.refreshLanes(); });
    this.award(2500, W / 2, LANE_Y + 90);
    this.bump('lanes');
  }

  private refreshLanes(): void {
    const th = this.def.theme;
    this.lit.forEach((on, i) => {
      this.lamps[i]?.setTint(on ? th.lamp : darken(th.lamp, 0.3));
      this.lampGlows[i]?.setAlpha(on ? 0.9 : 0);
      this.laneTexts[i]?.setColor(on ? css(th.lamp) : '#4a4170');
    });
  }

  // ================================================================ holes, ramps, orbits, spinners

  /** Vortex holes pull the ball in and swirl it around. */
  private pull(dt: number): void {
    const b = this.world.ball;
    for (const h of this.def.holes) {
      if (h.kind !== 'vortex' || !h.pull) continue;
      const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy);
      if (d >= h.pull || d < 1) continue;
      const k = 2400 * (1 - d / h.pull);
      b.vx += ((dx / d) * k + (-dy / d) * k * 0.5) * dt;
      b.vy += ((dy / d) * k + (dx / d) * k * 0.5) * dt;
    }
  }

  private holeCheck(dt: number): void {
    const b = this.world.ball;
    this.holeCd = this.holeCd.map((v) => Math.max(0, v - dt));
    if (this.hold) {
      const h = this.def.holes[this.hold.i];
      this.hold.t -= dt;
      const life = 1 - this.hold.t / HOLD[h.kind];
      if (h.kind === 'vortex') { const a = this.elapsed * 14; b.x = h.x + Math.cos(a) * 10 * (1 - life); b.y = h.y + Math.sin(a) * 10 * (1 - life); }
      else { b.x = h.x; b.y = h.y; }
      b.vx = 0; b.vy = 0;
      if (h.kind === 'wormhole') this.ballImg.setScale(Math.max(0.1, 1 - life));
      if (h.kind === 'cannon') this.ballImg.setPosition(h.x + rng.int(-2, 2), h.y + rng.int(-2, 2));
      if (this.hold.t <= 0) this.release(this.hold.i);
      return;
    }
    this.def.holes.forEach((h, i) => {
      if (this.hold || this.holeCd[i] > 0) return;
      if (Math.hypot(b.x - h.x, b.y - h.y) < (h.kind === 'vortex' ? 16 : 17) && Math.hypot(b.vx, b.vy) < CATCH_SPEED[h.kind]) this.capture(i);
    });
  }

  private capture(i: number): void {
    const h = this.def.holes[i], th = this.def.theme;
    this.hold = { i, t: HOLD[h.kind] };
    this.trail.stop();
    this.sfxAt('target', h.x, { volume: 0.7 });
    this.ring(h.x, h.y, th.lamp, 0.2, 1.1, 500);
    this.holeGlows[i].setAlpha(1);
    const value = VALUE[h.kind] * (1 + Math.floor(this.stage / 2));
    const name = h.kind === 'saucer' ? this.label('saucer') : this.label(h.kind);
    this.dmd(`${name}\n${fmt(value * this.mult)}`);
    this.time.delayedCall(150, () => this.sfx('lanes', { volume: 0.5, exact: true }));
    this.bc.holes++;
    this.award(value, h.x, h.y - 30, th.accent);
    this.bump(h.kind === 'saucer' ? 'saucer' : h.kind);
    this.chain();
  }

  private release(i: number): void {
    const h = this.def.holes[i], b = this.world.ball, th = this.def.theme;
    this.hold = null;
    this.holeCd[i] = 0.8;
    if (h.kind === 'wormhole' && h.to) {
      b.x = h.to[0]; b.y = h.to[1]; b.vx = rng.int(-80, 80); b.vy = 150;
      this.ballImg.setScale(0.2);
      this.tweens.add({ targets: this.ballImg, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.ring(b.x, b.y, th.lamp, 0.1, 1, 500);
      burst(this, b.x, b.y, [th.lamp, 0xffffff], 16, 260);
      this.sfx('launch', { volume: 0.5 });
      return;
    }
    if (h.kind === 'vortex') {
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      b.vx = Math.cos(a) * 950; b.vy = Math.sin(a) * 950;
    } else {
      const [ex, ey] = h.eject ?? [0, -600];
      b.vx = ex + rng.int(-40, 40); b.vy = ey;
    }
    if (h.kind === 'cannon') { flash(this, 0xffd23f, 120, 0.25); shake(this, 0.012, 200); this.sfx('nudge', { volume: 0.6 }); }
    this.sfxAt('launch', h.x, { volume: 0.55 });
    burst(this, h.x, h.y, [0xffffff, th.lamp], 12, 240);
  }

  /** A fast ball reaching the top of a ramp's lane rides it. */
  private rampCheck(): void {
    const b = this.world.ball;
    this.def.ramps.forEach((r, i) => {
      if (this.ride) return;
      const l = r.lane;
      if (b.x > l.x0 + 4 && b.x < l.x1 - 4 && b.y < l.top + 50 && b.y > l.top - 10 && b.vy < -380) {
        this.ride = { r: i, s: 0, v: Phaser.Math.Clamp(-b.vy, 900, 1500) };
        this.ballImg.setVisible(false); this.ballGlow.setVisible(false);
        this.riderImg.setVisible(true); this.riderGlow.setVisible(true);
        this.trail.stop();
        this.sfxAt('launch', b.x, { volume: 0.5 });
      }
    });
  }

  private rideStep(dt: number): void {
    const r = this.ride!, pts = this.rampPaths[r.r], len = this.rampLens[r.r];
    r.v = Math.max(650, r.v - 250 * dt);
    r.s += r.v * dt;
    let i = 1;
    while (i < len.length - 1 && len[i] < r.s) i++;
    const f = Phaser.Math.Clamp((r.s - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]), 0, 1);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
    this.riderImg.setPosition(x, y);
    this.riderGlow.setPosition(x, y);
    const b = this.world.ball;
    b.x = x; b.y = y;
    if (r.s >= len[len.length - 1]) this.rideEnd();
  }

  private rideEnd(): void {
    const r = this.ride!, b = this.world.ball, pts = this.rampPaths[r.r];
    const [x, y] = pts[pts.length - 1], [ex, ey] = this.def.ramps[r.r].exit;
    b.x = x; b.y = y + 4; b.vx = ex; b.vy = ey;
    this.prevY = b.y;
    this.ride = null;
    this.riderImg.setVisible(false); this.riderGlow.setVisible(false);
    this.ballImg.setVisible(true); this.ballGlow.setVisible(true);
    this.rampCombo = this.elapsed - this.lastRamp < 7 ? this.rampCombo + 1 : 0;
    this.lastRamp = this.elapsed;
    const value = 2500 * (1 + this.rampCombo);
    this.sfx('lanes', { volume: 0.55, exact: true });
    this.dmd(this.rampCombo ? `${t('rampCombo')}\nx${this.rampCombo + 1}` : `${t('ramp')}\n${fmt(value * this.mult)}`);
    this.bc.ramps++;
    this.award(value, x - 40, y - 60, this.def.theme.accent);
    this.bump('ramps');
    this.chain();
  }

  /** Orbits (in one side lane and out of the other) and the spinners. */
  private laneSensors(): void {
    const b = this.world.ball, def = this.def;
    if (def.orbitL && def.orbitR) {
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
    }
    def.spinners.forEach((sp, i) => {
      if (b.x > sp.x0 && b.x < sp.x1 && (this.prevY - sp.y) * (b.y - sp.y) < 0) this.spinPending[i] += Phaser.Math.Clamp(Math.round(Math.abs(b.vy) / 140), 2, 22);
    });
  }

  private orbit(): void {
    this.sfx('bank', { volume: 0.5, exact: true });
    this.dmd(`${t('orbit')}\n${fmt(2000 * this.mult)}`);
    this.bc.orbits++;
    this.award(2000, W / 2, this.world.ball.y - 80, this.def.theme.accent);
    this.bump('orbits');
    this.chain();
  }

  private spinStep(dt: number): void {
    this.def.spinners.forEach((sp, i) => {
      const img = this.spinnerImgs[i];
      if (this.spinPending[i] <= 0) { this.spinPhase[i] = 0; img.setScale(img.scaleX, 1); return; }
      this.spinPhase[i] += dt * 22;
      while (this.spinPhase[i] >= Math.PI && this.spinPending[i] > 0) {
        this.spinPhase[i] -= Math.PI;
        this.spinPending[i]--;
        this.bc.spins++;
        this.gain(100 * this.mult);
        this.bump('spinner');
        if (this.spinPending[i] % 2 === 0) this.sfxAt('flipdown', sp.x, { volume: 0.25 });
      }
      img.setScale(img.scaleX, Math.max(0.12, Math.abs(Math.cos(this.spinPhase[i]))));
    });
  }

  // ================================================================ frame

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.tickDmd(dt);
    if (this.picker) { this.drawButtons(); return; }
    const w = this.world, b = w.ball;
    const inp = this.readInput();

    const held = this.tilted || this.clearing ? [false, false] : [inp.left, inp.right];
    for (const f of w.flippers) f.held = held[f.side === 'L' ? 0 : 1];
    for (let i = 0; i < 2; i++) {
      if (held[i] && !this.prevHeld[i]) {
        this.sfxAt('flip', i ? 484 : 196, { volume: 0.45 });
        if (this.inPlay && !this.lit.every(Boolean)) {
          // lane change: rotate the lit lamps
          this.lit = i === 0 ? [...this.lit.slice(1), this.lit[0]] : [this.lit[3], ...this.lit.slice(0, 3)];
          this.refreshLanes();
        }
      } else if (!held[i] && this.prevHeld[i]) this.sfxAt('flipdown', i ? 484 : 196, { volume: 0.2 });
    }
    this.prevHeld = held;
    this.pulse = this.pulse.map((v) => v - dt);

    // plunger
    if (this.plungerLock && !inp.plunger) this.plungerLock = false;
    const inShooter = this.inPlay && !this.ride && b.x > 652 && b.y > PLUNGER_Y - 40;
    if (inp.plunger && this.inPlay && !this.plungerLock) {
      if (!this.charging) { this.charging = true; this.charge = 0; this.sfx('charge', { volume: 0.4 }); }
      this.charge = Math.min(1, this.charge + dt / 1.1);
    } else if (this.charging) {
      this.charging = false;
      if (inShooter) {
        b.vy = -(1000 + 1700 * this.charge);
        this.sfxAt('launch', LANE_X, { volume: 0.4 + this.charge * 0.4 });
        burst(this, LANE_X, PLUNGER_Y + 10, [0xffffff, hexColor(this.def.theme.glow)], 10, 200);
        this.ring(LANE_X, PLUNGER_Y, 0xffffff, 0.15, 0.5, 260);
      }
      this.charge = 0;
    }
    this.launchHint.setVisible(inShooter && Math.floor(this.elapsed * 2) % 2 === 0);

    for (const k of Object.keys(this.hitCd)) this.hitCd[k] -= dt;
    this.slingFlash = this.slingFlash.map((v) => Math.max(0, v - dt));
    this.tiltWarn = Math.max(0, this.tiltWarn - dt * 0.25);

    const tu = tuning(this.stage);
    if (this.guard && this.def.guard) {
      const g = this.def.guard;
      this.guardT += dt * g.speed * tu.guard;
      const cx = g.cx + Math.sin(this.guardT) * g.sweep;
      this.guard.ax = cx - g.half; this.guard.bx = cx + g.half;
    }

    if (this.inPlay) {
      if (inShooter && this.charging) { b.vy = Math.min(b.vy, 0); b.y = Math.min(b.y, PLUNGER_Y + this.charge * 26); }
      const free = !this.ride && !this.hold;
      if (free) this.pull(dt);
      this.prevY = b.y;
      const hits = step(w, dt, free);
      for (const h of hits) this.onHit(h);
      if (this.ride) this.rideStep(dt);
      else {
        this.holeCheck(dt);
        if (!this.hold) {
          this.rampCheck();
          this.laneSensors();
          this.laneCheck();
        }
      }
      if (this.saveArmed && b.x < 640) { this.saveArmed = false; this.ballSave = tu.save; }
      this.ballSave = Math.max(0, this.ballSave - dt);
      // anti-stall: a ball resting anywhere but on a flipper, the plunger or in a hole gets a shove
      const slow = Math.hypot(b.vx, b.vy) < 25;
      if (slow && free && !inShooter && !w.flippers.some((f) => f.held) && b.y < PIVOT_Y - 60) {
        this.stall += dt;
        if (this.stall > 1.5) { this.stall = 0; b.vx += rng.pick([-1, 1]) * 120; b.vy -= 200; this.sfx('nudge', { volume: 0.3 }); }
      } else this.stall = 0;
      if (this.inPlay && !this.ride && b.y > DRAIN_Y) this.drain();
    } else {
      step(w, dt, false);
      if (this.waiting > 0 && !this.clearing) {
        this.waiting -= dt;
        if (this.waiting <= 0 && !this.isOver) {
          this.ballNo++;
          this.serveBall();
        }
      }
    }
    this.spinStep(dt);

    // drop targets pop back up once the ball is clear of their bank
    this.bankTimers.forEach((tmr, bi) => {
      if (tmr <= 0) return;
      this.bankTimers[bi] = tmr - dt;
      if (this.bankTimers[bi] > 0) return;
      const pts = bankTargets(this.def.banks[bi]);
      const near = pts.some(([x, y]) => Math.hypot(b.x - x, b.y - y) < 50);
      if (near) { this.bankTimers[bi] = 0.3; return; }
      w.targets.forEach((s, k) => { if (this.bankOf[k] === bi) s.active = true; });
      this.refreshTargets();
      this.sfx('target', { volume: 0.4 });
    });

    this.nudgeCd = Math.max(0, this.nudgeCd - dt);
    this.render(inShooter, dt);
  }

  private render(inShooter: boolean, dt: number): void {
    const w = this.world, b = w.ball, th = this.def.theme;
    if (!this.hold || this.def.holes[this.hold.i].kind !== 'cannon') this.ballImg.setPosition(b.x, b.y);
    this.ballGlow.setPosition(b.x, b.y);
    const fast = Math.hypot(b.vx, b.vy) > 800;
    if (this.inPlay && fast && !this.ride && !this.hold) { this.trail.setPosition(b.x, b.y); if (!this.trail.emitting) this.trail.start(); }
    else if (this.trail.emitting) this.trail.stop();
    this.flipImgs.forEach((img, i) => img.setRotation(w.flippers[i].angle));

    // the camera follows the ball up and down the table
    const focus = this.inPlay ? b.y : PLUNGER_Y;
    const target = Phaser.Math.Clamp(focus - 640, SCROLL_MIN, SCROLL_MAX);
    this.camY += (target - this.camY) * (1 - Math.exp(-dt * 7));
    this.cameras.main.setScroll(0, Math.round(this.camY));

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
    const blink = (Math.sin(this.elapsed * 7) + 1) / 2;
    this.def.holes.forEach((h, i) => {
      const held = this.hold?.i === i;
      const open = this.missionOpen(h.kind === 'saucer' ? 'saucer' : h.kind);
      this.holeGlows[i].setAlpha(held ? 1 : open ? 0.3 + blink * 0.35 : 0.15);
      const spin = this.holeSpins[i];
      if (spin) spin.rotation += dt * (h.kind === 'vortex' ? (held ? 9 : 2.5) : -1.5);
    });
    for (const ins of this.inserts) {
      const open = ins.missions.some((m) => this.missionOpen(m));
      ins.lamp.setAlpha(open ? 0.4 + blink * 0.6 : 0.2);
      ins.glow.setAlpha(open ? blink * 0.7 : 0);
    }
    const on = Math.floor(Math.min(1, this.tableScore / this.target) * 3 + 1e-6);
    this.arrows.forEach((a, i) => a.setAlpha(i < on ? 1 : i === on ? 0.3 + blink * 0.6 : 0.18));

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
