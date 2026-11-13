// Kickflip Park: the Play scene. Runs a session of the simulation (sim.ts) in the chosen park,
// draws it in 3D (view.ts) under a Phaser HUD, reads the keyboard and the touch pad, and turns the
// simulation's events into sound, words, shakes, hit-stops and slow motion. At the end it shows
// the session's goals and unlocks, banks them (meta.ts) and opens the result screen.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, loc, isEasy, hudChip, HudChip, flash, burst, getLang,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP,
} from '@core';
import { World3D } from '@core/three';
import { Setup, takeFromMenu } from './setup';
import { Sim, NO_INPUT, type Input, type SimEvent, type Entry } from './sim';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { park, type ParkId, type GoalDef } from './parks';
import { loadMeta, saveMeta, bankSession, TUTORIAL_STEPS, type Meta } from './meta';
import { onSeg } from './park';
import { PRAISE, clamp, type Mode } from './defs';
import { fmt, dec, goalText, goalNeed } from './goals';
import { boardDef, RARITY_COLOR } from './boards';
import { usableBoard } from './boardmodel';
import { TouchPad, Meter, BalanceBar, banner, goalToast, dirOf, comboSummary, popWord, TutorialCard, UI_DEPTH } from './ui';
import { makeLoops, Loop } from './audio';
import { makeIcons, TAPE_ICON, CLOCK_ICON } from './art';

/** A trick's name in the combo string. */
export function trickName(e: Entry): string {
  if (e.id === 'gap') return t('gap_' + e.key);
  if (e.id === 'spin') return t('tr_spin', { n: e.n * 180 });
  const name = t('tr_' + e.id);
  if (e.n >= 3) return t('tr_triple', { t: name });
  if (e.n === 2) return t('tr_double', { t: name });
  return name;
}

const SPIN_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];

/** Landing sounds per surface (cycled, so no two landings in a row sound the same). */
const LAND_SFX: Record<string, string[]> = { concrete: ['land', 'land2', 'land3'], wood: ['landWood', 'landWood2', 'landWood3'], metal: ['landMetal', 'land2', 'landMetal'] };
/** The landing qualities' colours (popups and the combo summary). */
const QUALITY_COLOR: Record<string, string> = { perfect: '#ffd23f', clean: '#9fe8ff', sketchy: '#ff9a6a' };

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  parkId: ParkId = 'plaza';
  mode: Mode = 'normal';
  private controls!: Controls;
  private pad: TouchPad | null = null;
  private keys!: Record<'J' | 'K' | 'L', Phaser.Input.Keyboard.Key>;
  private jAt = -1;
  private kAt = -1;
  private flipWant = -1;
  private flipBuf: { dir: number; t: number } | null = null;
  private specialWant = false;
  private manualWant = false;
  private consumed = new Set<string>();
  private arrowAt = new Map<string, number>();
  private goalsChip!: HudChip;
  private tapesChip!: HudChip;
  private meter!: Meter;
  private comboChip!: HudChip;
  private comboText!: Phaser.GameObjects.Text;
  private balance!: BalanceBar;
  private speedLines!: Phaser.GameObjects.Graphics;
  private roll!: Loop;
  private grindLoop!: Loop;
  private ledgeLoop!: Loop;
  private crowd: Loop | null = null;
  private bot: Bot | null = null;
  private hintBox: Phaser.GameObjects.Container | null = null;
  private hintAt = 0;
  private timeScale = 1;
  private hitStop = 0;
  private slowT = 0;
  private lastSecond = -1;
  private lastCombo = '';
  private comboShown = false;
  private finished = false;
  private banked = false;
  private summaryT = -1;
  /** Seconds the session summary stays (longer with a new board). */
  private summaryLen = 3.6;
  private flashT = 0;
  private specialHinted = false;
  private newGoals: GoalDef[] = [];
  /** Frame times of the first Play frames (ms), and the shader programs before the first frame (warm-up check). */
  firstFrames: number[] = [];
  programsAtStart = -1;
  private frameStart = 0;
  /** Test hook: runs the simulation faster (slow software rendering in screenshots). */
  testSpeed = 1;
  /** Frame cost (test hook). */
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0 };

  /** 'setup': the session setup is on screen (PLAY on the menu); 'play': the session runs. */
  phase: 'setup' | 'play' = 'play';
  /** The session setup (park, goals, board, START), while it is on screen. */
  setup: Setup | null = null;
  private leaving = false;

  createGame(): void {
    makeIcons(this);
    makeLoops(this.game);
    this.meta = loadMeta();
    this.setup = null;
    this.leaving = false;
    this.world = undefined as unknown as World3D;
    this.view = undefined as unknown as View;
    this.sim = undefined as unknown as Sim;
    this.tut = null; this.tutStep = 0; this.tutWait = -1; this.tutRingT = 0;
    this.hintBox = null;
    this.bot = null;
    this.forced = null;
    // PLAY on the menu opens the setup first; a "play again" (result screen, pause) skates the
    // same park on the same board at once
    if (takeFromMenu()) {
      this.phase = 'setup';
      this.useHud = false;
      // the turntable draws in the scene's world; the session's View takes it over on START
      this.world = new World3D(this, { fov: 30, near: 0.5, far: 60, background: null });
      this.setup = new Setup(this, this.world, this.meta, () => this.begin(), () => this.leave());
    } else {
      this.phase = 'play';
      this.useHud = true;
      this.begin();
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (this.phase === 'play' && !this.banked && this.sim.time > 5) this.bank(); });
  }

  /** BACK on the setup: the menu. */
  private leave(): void {
    this.leaving = true;
    this.setup = null;
    this.scene.start('Menu');
  }

  pauseGame(): void {
    // the setup's Esc goes back to the menu (the core's Esc handler runs after the setup's)
    if (this.leaving) return;
    super.pauseGame();
  }

  /** The session starts: the park and board chosen (or the last ones on a "play again"). */
  private begin(): void {
    this.setup = null;
    this.phase = 'play';
    if (!this.useHud) { this.useHud = true; this.hud.setVisible(true); }
    this.parkId = this.meta.park;
    this.mode = isEasy() ? 'easy' : 'normal';
    this.sim = new Sim(park(this.parkId), this.mode, Math.floor(Math.random() * 1e9));
    this.jAt = this.kAt = -1;
    this.flipWant = -1;
    this.flipBuf = null;
    this.specialWant = this.manualWant = false;
    this.consumed = new Set();
    this.arrowAt = new Map();
    this.bot = null;
    this.hintBox = null;
    this.timeScale = 1; this.hitStop = 0; this.slowT = 0;
    this.lastSecond = -1;
    this.lastCombo = '';
    this.comboShown = false;
    this.finished = false;
    this.banked = false;
    this.summaryT = -1;
    this.summaryLen = 3.6;
    this.flashT = 0;
    this.specialHinted = false;
    this.newGoals = [];
    this.firstFrames = [];
    this.frameStart = 0;
    this.testSpeed = 1;

    this.view = new View(this, this.parkId, { board: this.meta.board, world: this.world });
    this.world = this.view.world;
    this.programsAtStart = (this.world.renderer.info.programs ?? []).length;
    this.perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0 };
    const w = this.world, render = w.render.bind(w);
    w.render = () => {
      const t0 = performance.now();
      render();
      const d = performance.now() - t0;
      this.perf.render += d;
      this.perf.maxRender = Math.max(this.perf.maxRender, d);
      const calls = w.renderer.info.render.calls;
      this.perf.calls = calls;
      this.perf.maxCalls = Math.max(this.perf.maxCalls, calls);
    };

    // input
    this.controls = new Controls(this, {});
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { J: kb.addKey(K.J, true, false), K: kb.addKey(K.K, true, false), L: kb.addKey(K.L, true, false) };
    kb.on('keydown', (e: KeyboardEvent) => this.keyDown(e));
    kb.on('keyup', (e: KeyboardEvent) => { this.consumed.delete(e.code); });
    this.pad = this.sys.game.device.input.touch ? new TouchPad(this) : null;

    // HUD: score (core), time (right), goals + mixtapes (row 2 left), the special meter (row 2 right)
    this.hud.setRight('2:00', CLOCK_ICON);
    this.goalsChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: 'icon-star', iconSize: 28, text: '0/8', color: '#ffd23f', minWidth: 96 });
    this.tapesChip = hudChip(this, this.goalsChip.right + HUD_GAP, HUD_ROW2_Y, { icon: TAPE_ICON, iconSize: 30, text: '0/5', color: '#ff9ae6', minWidth: 96 });
    this.meter = new Meter(this, this.scale.width - HUD_MARGIN, HUD_ROW2_Y, t('special'), 140);
    this.comboChip = hudChip(this, this.scale.width / 2, 196, { align: 'center', label: t('combo'), text: '0', color: '#ffd23f', size: 30, depth: UI_DEPTH });
    this.comboChip.setVisible(false);
    this.comboText = txt(this, this.scale.width / 2, 250, '', { title: true, size: 26, color: '#ffffff', strokeThickness: 7, wrap: 640 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    this.balance = new BalanceBar(this);
    this.speedLines = this.add.graphics().setDepth(40).setScrollFactor(0);
    this.updateGoalsChip();

    // sound loops
    this.roll = new Loop(this, 'roll-loop');
    this.grindLoop = new Loop(this, 'grind-loop');
    this.ledgeLoop = new Loop(this, 'ledge-loop');
    this.crowd = this.view.hasCrowd ? new Loop(this, 'crowd') : null;

    if (this.meta.tutorial < TUTORIAL_STEPS && this.parkId === 'plaza') {
      // the first session: the park's banner, then four short lessons (they replace the controls card)
      this.parkBanner();
      this.meta.hinted = true;
      this.time.delayedCall(1700, () => this.startTutorial(this.meta.tutorial));
    } else if (!this.meta.hinted) this.time.delayedCall(250, () => this.showHint());
    else this.parkBanner();
  }

  // ------------------------------------------------------------------ input

  private keyDown(e: KeyboardEvent): void {
    const now = this.time.now;
    if (this.hintBox && (e.code === 'Space' || e.code === 'Enter')) {
      // not the same key press that started the session
      if (this.time.now - this.hintAt > 400) this.closeHint();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.arrowAt.set(e.code, now);
    if (e.code === 'KeyJ' || e.code === 'KeyK') {
      // an arrow pressed just before picks the trick and does not spin
      for (const [code, at] of this.arrowAt) if (now - at < 260 && SPIN_KEYS.includes(code)) this.consumed.add(code);
      const other = e.code === 'KeyJ' ? this.kAt : this.jAt;
      if (other >= 0 && now - other < 160 && this.sim.specialReady) this.specialWant = true;
      else if (e.code === 'KeyJ') this.flipWant = this.keyDir();
      if (e.code === 'KeyJ') this.jAt = now; else this.kAt = now;
    }
    if (e.code === 'KeyL') this.manualWant = true;
  }

  private keyDir(): number {
    const c = this.controls;
    const d = dirOf(c.up, c.right, c.down, c.left);
    return d < 0 ? 0 : d;
  }

  private readInput(): Input {
    if (this.forced) { const f = this.forced; this.forced = { ...f, flip: -1, manual: false, special: false }; return f; }
    if (this.bot) return this.bot.input(1 / 60);
    if (this.hintBox) return { ...NO_INPUT };
    const c = this.controls, pad = this.pad;
    const inp: Input = { ...NO_INPUT };
    let sx = c.axisX, sy = c.axisY;
    if (pad && sx === 0 && sy === 0) { sx = pad.sx; sy = pad.sy; }
    // spin keys used to pick a trick do not spin
    if (this.sim.state === 'air') {
      const kl = this.consumed.has('ArrowLeft') || this.consumed.has('KeyA'), kr = this.consumed.has('ArrowRight') || this.consumed.has('KeyD');
      if ((sx < 0 && kl) || (sx > 0 && kr)) sx = 0;
    }
    inp.steer = sx;
    inp.fwd = -sy;
    inp.crouch = c.a || !!pad?.big;
    inp.grind = this.keys.L.isDown || c.a || !!pad?.big;
    inp.dir = dirOf(c.up, c.right, c.down, c.left);
    if (inp.dir < 0 && pad) inp.dir = pad.dir();
    // flips and grabs
    inp.flip = this.flipWant;
    if (pad) { const f = pad.takeFlip(); if (f >= 0) inp.flip = f; }
    this.flipWant = -1;
    // a flip pressed a moment before the board leaves the ground still happens (the pop and the
    // flick are one move for the player)
    if (inp.flip >= 0) this.flipBuf = { dir: inp.flip, t: 0.25 };
    inp.flip = -1;
    if (this.flipBuf) {
      if (this.sim.state === 'air') { inp.flip = this.flipBuf.dir; this.flipBuf = null; }
      else if ((this.flipBuf.t -= 1 / 60) <= 0 || this.sim.state === 'bail') this.flipBuf = null;
    }
    inp.grab = this.keys.K.isDown && !this.specialWant ? this.keyDir() : -1;
    if (pad && pad.grab >= 0) inp.grab = pad.grab;
    inp.manual = this.manualWant || !!pad?.takeManual();
    this.manualWant = false;
    inp.special = this.specialWant || !!pad?.takeSpecial();
    this.specialWant = false;
    if (inp.special && inp.dir < 0) inp.dir = this.keyDir();
    return inp;
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    if (this.phase === 'setup') return;
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    const dt = delta / 1000;
    const sim = this.sim;
    // hit-stop and slow motion
    let ts = 1;
    if (this.hitStop > 0) { this.hitStop -= dt; ts = 0.04; }
    else if (this.slowT > 0) { this.slowT -= dt; ts = 0.4; }
    this.timeScale += (ts - this.timeScale) * Math.min(1, dt * (ts < this.timeScale ? 40 : 8));
    const sdt = dt * this.timeScale * this.testSpeed;
    this.pad?.update(sim.crouching ? clamp(sim.crouchT / 0.55, 0, 1) : 0);
    const inp = this.readInput();
    if (!this.hintBox && this.summaryT < 0) sim.step(sdt, inp);
    for (const ev of sim.events) this.onEvent(ev);
    sim.events.length = 0;
    this.view.sync(sim, dt, sdt);
    this.updateHud(dt);
    this.updateTutorial(dt);
    this.updateSound(dt);
    this.drawSpeedLines(dt);
    if (sim.over && !this.finished) this.finish();
    if (this.summaryT >= 0) {
      this.summaryT += dt;
      if (this.summaryT > this.summaryLen) this.endGame({ title: t('sessionOver'), win: this.newGoals.length > 0, delay: 0 });
    }
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  // ------------------------------------------------------------------ events

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    const W = this.scale.width;
    const at = () => this.view.toScreen(sim.x, sim.y + 1.6, sim.z);
    switch (ev.type) {
      case 'push': this.sfx('push', { volume: 0.25 }); break;
      case 'ollie': this.sfx('pop', { volume: 0.55 + ev.power * 0.3 }); this.tutorialEvent('ollie'); break;
      case 'launch': if (ev.vert) this.sfx('whoosh2', { volume: 0.35 }); break;
      case 'land': {
        // a different clack each time: three recordings per surface, harder ones for big drops
        const set = LAND_SFX[ev.surf] ?? LAND_SFX.concrete;
        this.sfx(set[(this.landN++ + (ev.impact > 6 ? 1 : 0)) % set.length], { volume: Math.min(0.9, 0.35 + ev.impact * 0.06) });
        if (ev.impact > 8) this.sfx(ev.impact > 12 ? 'thud2' : 'thud', { volume: 0.5 });
        if (ev.tricks) {
          const p = at(), col = QUALITY_COLOR[ev.quality];
          popWord(this, clamp(p.x, 160, W - 160), clamp(p.y - 40, 300, 980), t('q_' + ev.quality), col, ev.quality === 'perfect' ? 34 : 28);
          if (ev.quality === 'perfect') { this.sfx('perfect', { volume: 0.45 }); this.view.ring(sim.x, sim.y, sim.z, 2.6, 0xffd23f, 0.35); }
          else if (ev.quality === 'sketchy') { this.sfx('scrape', { volume: 0.5 }); this.view.shake(0.1, 0.25); }
        }
        this.tutorialEvent('land');
        break;
      }
      case 'flip': this.sfx(ev.def.id === 'shoveit' ? 'whoosh4' : 'whoosh1', { volume: 0.5 }); this.sfx('flick', { volume: 0.3 }); this.tutorialEvent('flip'); break;
      case 'grab': this.sfx('grab', { volume: 0.35 }); break;
      case 'grindStart': this.sfx(ev.kind === 'rail' ? 'clank' : 'ledgeHit', { volume: 0.6 }); this.tutorialEvent('grind'); break;
      case 'manualStart': this.sfx('tick', { volume: 0.3 }); break;
      case 'trick': break;
      case 'special':
        this.sfx('specialGo', { volume: 0.7 });
        this.slowT = 0.55;
        banner(this, W / 2, 560, t('tr_' + ev.def.id), { color: '#ffb020', size: 50, hold: 0.7 });
        flash(this, 0xffe0a0, 160, 0.25);
        break;
      case 'specialReady':
        this.sfx('specialReady', { volume: 0.6 });
        banner(this, W / 2, 620, t('specialReady'), { color: '#ffc23a', size: 44, hold: 0.8 });
        if (!this.specialHinted) { this.specialHinted = true; this.time.delayedCall(1300, () => this.tip(t('hintSpecial'))); }
        break;
      case 'combo': this.landedCombo(ev); break;
      case 'comboLost':
        this.comboOut(true);
        break;
      case 'bail': {
        const fall = ev.reason === 'fall';
        this.sfx('bail', { volume: 0.8 });
        this.sfx('crash', { volume: 0.6 });
        banner(this, W / 2, 520, fall ? t('fell') : t('bail'), { color: '#ff5a4f', size: 56, hold: 0.7 });
        this.flashT = 0.5;
        this.cameras.main.shake(260, 0.01);
        break;
      }
      case 'gap': break;
      case 'tape': {
        const n = sim.tapes.filter(Boolean).length;
        this.sfx('tape', { volume: 0.7 });
        const p = this.view.toScreen(ev.x, ev.y + 0.6, ev.z);
        banner(this, clamp(p.x, 140, W - 140), clamp(p.y, 300, 900), t('tapeGot', { n }), { color: '#ff9ae6', size: 34, hold: 0.6 });
        this.tweens.add({ targets: this.tapesChip, scale: 1.25, duration: 120, yoyo: true });
        break;
      }
      case 'goal': {
        this.newGoals.push(ev.goal);
        this.sfx('goal', { volume: 0.7, exact: true });
        goalToast(this, 360, t('goalDone'), goalText(ev.goal, sim.goalNeed(ev.goal)));
        burst(this, W / 2, 360, [0xffd23f, 0x7dffa0, 0x9fe8ff, 0xff9ae6], 40, 380);
        this.updateGoalsChip();
        this.tweens.add({ targets: this.goalsChip, scale: 1.25, duration: 140, yoyo: true });
        if (this.crowd) { this.sfx('roar', { volume: 0.5 }); this.sfx('whistle', { volume: 0.35 }); }
        break;
      }
      case 'wall': if (ev.speed > 3) this.sfx('wall', { volume: Math.min(0.6, 0.15 + ev.speed * 0.05) }); break;
      case 'timeUp':
        banner(this, W / 2, 330, t('timeUp'), { color: '#ffffff', size: 64, hold: 1, sub: sim.state !== 'ground' || sim.combo.length ? t('lastTrick') : '' });
        this.sfx('horn', { volume: 0.6 });
        break;
    }
  }

  private landN = 0;

  private landedCombo(ev: Extract<SimEvent, { type: 'combo' }>): void {
    const W = this.scale.width, score = ev.score;
    this.comboOut(false);
    let tier = -1;
    for (let i = 0; i < PRAISE.length; i++) if (score >= PRAISE[i]) tier = i;
    const big = score >= 5000;
    // the combo's summary: its tricks, points × tricks, the landing and what it did, the total
    comboSummary(this, W / 2, 545, {
      names: ev.entries.map(trickName), sum: fmt(ev.sum), count: ev.tricks, total: fmt(score),
      quality: t('q_' + ev.quality), qualityColor: QUALITY_COLOR[ev.quality], mult: ev.mult !== 1 ? '×' + dec(ev.mult) : '',
      praise: tier >= 0 ? t('praise' + tier) : ev.tricks > 1 ? t('landed') : '', big, tier,
    });
    this.sfx(tier >= 2 ? 'comboBig' : 'combo', { volume: tier >= 2 ? 0.7 : 0.5 });
    if (big) {
      this.hitStop = 0.09;
      this.slowT = Math.min(0.5, 0.2 + score / 60000);
      this.view.zoomPunch(Math.min(1, score / 20000));
      flash(this, 0xffffff, 120, 0.18);
    }
    if (this.crowd && score >= 2500) {
      this.sfx('roar', { volume: Math.min(0.75, 0.3 + score / 30000) });
      if (score >= 8000) this.sfx('whistle', { volume: 0.4 });
    }
    this.tweens.add({ targets: this.hud.scoreChip, scale: 1.15, duration: 120, yoyo: true });
  }

  /** The combo display goes away (landed: rises; lost: falls red). */
  private comboOut(lost: boolean): void {
    if (!this.comboShown) return;
    this.comboShown = false;
    const chip = this.comboChip, text = this.comboText;
    this.tweens.killTweensOf([chip, text]);
    if (lost) { chip.setTextColor('#ff5a4f'); text.setColor('#ff9a9a'); }
    this.tweens.add({ targets: [chip, text], alpha: 0, y: `+=${lost ? 40 : -30}`, duration: 380, delay: 220, onComplete: () => {
      chip.setVisible(false).setAlpha(1).setY(196).setTextColor('#ffd23f');
      text.setText('').setAlpha(1).setY(250).setColor('#ffffff');
    } });
    this.lastCombo = '';
  }

  // ------------------------------------------------------------------ HUD

  private updateGoalsChip(): void {
    const total = park(this.parkId).goals.length;
    const done = new Set([...this.meta.goals[this.parkId], ...this.sim.done]).size;
    this.goalsChip.setText(`${done}/${total}`);
  }

  private updateHud(dt: number): void {
    const sim = this.sim;
    if (this.score !== sim.score) this.setScore(sim.score);
    const sec = Math.ceil(sim.timeLeft);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.hud.setRight(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, CLOCK_ICON);
      this.hud.rightChip.setTextColor(sec <= 10 ? '#ff7a6a' : '#ffffff');
      if (sec <= 10 && sec > 0) {
        this.sfx('tick', { volume: 0.35, exact: true });
        this.tweens.add({ targets: this.hud.rightChip, scale: 1.15, duration: 110, yoyo: true });
        if (sec === 10) banner(this, this.scale.width / 2, 400, t('tenLeft'), { color: '#ff7a6a', size: 40, hold: 0.8 });
      }
    }
    this.tapesChip.setText(`${sim.tapes.filter(Boolean).length}/5`);
    this.meter.set(sim.special, sim.specialReady, this.elapsed);
    this.pad?.setSpecial(sim.specialReady && sim.state !== 'bail');
    // the combo: points × tricks in a chip, the trick string under it
    if (sim.combo.length) {
      if (!this.comboShown) {
        this.comboShown = true;
        this.tweens.killTweensOf([this.comboChip, this.comboText]);
        this.comboChip.setVisible(true).setAlpha(1).setY(196).setScale(0.6);
        this.comboText.setAlpha(1).setY(250);
        this.tweens.add({ targets: this.comboChip, scale: 1, duration: 200, ease: 'Back.easeOut' });
      }
      const key = sim.combo.map((e) => e.id + e.n + Math.round(e.pts)).join('|');
      if (key !== this.lastCombo) {
        const grew = sim.combo.length !== this.lastCombo.split('|').length;
        this.lastCombo = key;
        this.comboChip.setText(`${fmt(sim.comboSum())} × ${sim.combo.length}`);
        const names = sim.combo.map(trickName);
        const shown = names.length > 6 ? ['…', ...names.slice(-6)] : names;
        this.comboText.setText(shown.join(' + '));
        if (grew) {
          this.tweens.add({ targets: this.comboChip, scale: { from: 1.18, to: 1 }, duration: 180, ease: 'Back.easeOut' });
          this.sfx('trick', { volume: 0.25, rate: 1 + Math.min(0.6, sim.combo.length * 0.05) });
        }
      }
    }
    // the balance meter under the skater
    if (sim.state === 'grind' || sim.state === 'manual') {
      const p = this.view.toScreen(sim.x, sim.y, sim.z);
      const v = sim.state === 'grind' ? sim.grind!.bal : sim.manual!.bal;
      this.balance.show(clamp(p.x, 140, this.scale.width - 140), clamp(p.y + 120, 600, 1010), v, sim.state === 'manual');
    } else this.balance.hide();
    // red edges after a bail
    if (this.flashT > 0) this.flashT -= dt;
  }

  private updateSound(dt: number): void {
    const sim = this.sim;
    const sp = Math.abs(sim.speed);
    const rolling = (sim.state === 'ground' || sim.state === 'manual') && sp > 0.3;
    const wood = sim.surf === 'wood';
    this.roll.set(rolling ? clamp(sp / 11, 0.08, 1) * (wood ? 0.42 : 0.5) : 0, (wood ? 0.75 : 0.85) + sp * 0.045, dt, rolling ? 12 : 20);
    const grinding = sim.state === 'grind';
    const rail = grinding && sim.grind!.seg.rail.kind === 'rail';
    this.grindLoop.set(rail ? 0.5 : 0, 0.85 + sp * 0.04, dt, 18);
    this.ledgeLoop.set(grinding && !rail ? 0.55 : 0, 0.9 + sp * 0.03, dt, 18);
    this.crowd?.set(0.14 + (sim.combo.length ? Math.min(0.12, sim.comboValue() / 60000) : 0), 1, dt, 2);
  }

  private drawSpeedLines(dt: number): void {
    const sim = this.sim;
    const g = this.speedLines.clear();
    const sp = sim.state === 'air' ? Math.hypot(sim.vx, sim.vy, sim.vz) : Math.abs(sim.speed);
    const k = clamp((sp - 9) / 6, 0, 1);
    if (k > 0) {
      const { width: W, height: H } = this.scale;
      const cx = W / 2, cy = H * 0.46;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + Math.sin(this.elapsed * 3 + i * 7) * 0.12;
        const ph = (this.elapsed * 2.4 + i * 0.37) % 1;
        const r0 = 330 + ph * 260, r1 = r0 + 90 + k * 140;
        g.lineStyle(3 + k * 2, 0xffffff, 0.22 * k * (1 - ph));
        g.lineBetween(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 1.5, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.5);
      }
    }
    // red edges after a bail
    if (this.flashT > 0) {
      const { width: W, height: H } = this.scale;
      for (let i = 0; i < 6; i++) g.lineStyle(18, 0xff2a2a, this.flashT * 0.5 * (1 - i / 6)).strokeRect(i * 16, i * 16, W - i * 32, H - i * 32);
    }
    void dt;
  }

  // ------------------------------------------------------------------ the first-session tutorial

  private tut: TutorialCard | null = null;
  private tutStep = 0;
  /** Seconds until the next lesson after one is done (−1: a lesson is on). */
  private tutWait = -1;
  private tutRingT = 0;
  private static readonly TUT = ['push', 'ollie', 'flip', 'grind'] as const;

  private startTutorial(step: number): void {
    if (this.isOver || this.tut || this.bot || step >= TUTORIAL_STEPS) return;
    const touch = !!this.pad;
    this.tut = new TutorialCard(this, 372, t(touch ? 'tut_skip' : 'tut_skipKey'), () => this.endTutorial(true));
    this.tutStep = step;
    this.showLesson();
  }

  private showLesson(): void {
    if (!this.tut) return;
    const id = PlayScene.TUT[this.tutStep];
    this.tut.set(t('tut_head', { n: this.tutStep + 1 }), t(`tut_${id}_${this.pad ? 'touch' : 'keys'}`));
    this.tutWait = -1;
  }

  /** A move the lessons wait for. */
  private tutorialEvent(kind: 'ollie' | 'flip' | 'grind' | 'land'): void {
    if (!this.tut || this.tutWait >= 0) return;
    if (PlayScene.TUT[this.tutStep] === kind) this.lessonDone();
  }

  private lessonDone(): void {
    if (!this.tut) return;
    this.tut.done();
    this.sfx('combo', { volume: 0.5 });
    popWord(this, this.scale.width / 2, 470, t('tut_nice'), '#7dffa0', 40);
    this.tutStep++;
    this.meta.tutorial = Math.max(this.meta.tutorial, this.tutStep);
    saveMeta(this.meta);
    this.tutWait = 1.1;
  }

  private updateTutorial(dt: number): void {
    if (!this.tut) return;
    if (this.controls.justB()) { this.endTutorial(true); return; }
    if (this.tutWait >= 0) {
      this.tutWait -= dt;
      if (this.tutWait < 0) {
        if (this.tutStep >= TUTORIAL_STEPS) this.endTutorial(false);
        else this.showLesson();
      }
      return;
    }
    const sim = this.sim, id = PlayScene.TUT[this.tutStep];
    if (id === 'push' && sim.state === 'ground' && sim.speed > 7.5) this.lessonDone();
    // the grind lesson: a green ring pulses on the nearest rail or ledge
    if (id === 'grind') {
      this.tutRingT -= dt;
      if (this.tutRingT <= 0) {
        this.tutRingT = 0.7;
        let best: { x: number; y: number; z: number } | null = null, bd = 30;
        for (const sg of this.sim.park.segs) {
          const r = onSeg(sg, sim.x, sim.z);
          if (r.d < bd) { bd = r.d; best = { x: sg.ax + (sg.bx - sg.ax) * r.t, y: r.y, z: sg.az + (sg.bz - sg.az) * r.t }; }
        }
        if (best) this.view.ring(best.x, best.y, best.z, 2.6, 0x7dffa0, 0.6);
      }
    }
  }

  private endTutorial(skipped: boolean): void {
    const c = this.tut;
    if (!c) return;
    this.tut = null;
    c.destroy();
    this.meta.tutorial = TUTORIAL_STEPS;
    saveMeta(this.meta);
    if (!skipped) {
      banner(this, this.scale.width / 2, 400, t('tut_done'), { color: '#7dffa0', size: 52, hold: 1.1, sub: t('tut_doneSub'), subColor: '#ffd23f' });
      this.sfx('goal', { volume: 0.6, exact: true });
    } else this.sfx('tick', { volume: 0.4 });
  }

  // ------------------------------------------------------------------ hints

  private showHint(): void {
    if (this.hintBox || this.isOver || this.meta.hinted) return;
    const { width } = this.scale;
    const touch = !!this.pad;
    const c = this.add.container(width / 2, 640).setScrollFactor(0).setDepth(UI_DEPTH + 200);
    const msg = txt(this, 0, -40, t(touch ? 'hintTouch' : 'hintKeys'), { size: 25, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 600 });
    const h = msg.height + 170;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-320, -h / 2 + 8, 640, h, 28);
    g.fillStyle(0x10162e, 0.94).fillRoundedRect(-320, -h / 2, 640, h, 28);
    g.lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(-320, -h / 2, 640, h, 28);
    msg.setY(-h / 2 + 36 + msg.height / 2);
    const okW = 240, okY = h / 2 - 62;
    const ok = this.add.graphics().fillStyle(0x2fae5a, 1).fillRoundedRect(-okW / 2, okY - 34, okW, 68, 34).fillStyle(0xffffff, 0.18).fillRoundedRect(-okW / 2 + 6, okY - 30, okW - 12, 26, 14);
    const okT = txt(this, 0, okY, t('hintGotIt'), { title: true, size: 28, color: '#ffffff', strokeThickness: 0, shadow: false });
    const zone = this.add.zone(0, 0, 640, h).setInteractive();
    zone.on('pointerup', () => this.closeHint());
    c.add([g, msg, ok, okT, zone]);
    c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.hintBox = c;
    this.hintAt = this.time.now;
    this.pad?.setVisible(true);
  }

  private parkBanner(): void {
    banner(this, this.scale.width / 2, 470, t('park_' + this.parkId), { size: 50, color: '#ffffff', hold: 1.3, sub: t('parkSub_' + this.parkId), subColor: '#ffd23f' });
  }

  private closeHint(): void {
    const c = this.hintBox;
    if (!c) return;
    this.hintBox = null;
    this.parkBanner();
    this.meta.hinted = true;
    saveMeta(this.meta);
    this.sfx('tick', { volume: 0.4 });
    this.tweens.add({ targets: c, alpha: 0, scale: 0.9, duration: 180, onComplete: () => c.destroy() });
  }

  private tip(s: string): void {
    const h = txt(this, this.scale.width / 2, 700, s, { size: 25, color: '#ffffff', strokeThickness: 6, wrap: 620 }).setScrollFactor(0).setDepth(UI_DEPTH + 40).setAlpha(0);
    this.tweens.add({ targets: h, alpha: 1, duration: 260 });
    this.tweens.add({ targets: h, alpha: 0, delay: 3200, duration: 400, onComplete: () => h.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private bank(): ReturnType<typeof bankSession> | null {
    if (this.banked) return null;
    this.banked = true;
    return bankSession(this.meta, this.parkId, this.sim.score, this.sim.done, this.sim.tapes);
  }

  /** The session's summary over the park, then the result screen. */
  private finish(): void {
    this.finished = true;
    const res = this.bank() ?? { goals: [], parks: [], boards: [] };
    this.summaryT = 0;
    this.comboOut(false);
    this.balance.hide();
    this.pad?.setVisible(false);
    const { width } = this.scale;
    const c = this.add.container(width / 2, 600).setScrollFactor(0).setDepth(UI_DEPTH + 150);
    const lines: [string, string, number][] = [];
    for (const g of this.newGoals) lines.push(['• ' + goalText(g, this.sim.goalNeed(g)), '#7dffa0', 24]);
    if (!this.newGoals.length) lines.push([t('noGoals'), '#cfd8f0', 24]);
    for (const p of res.parks) lines.push([t('newPark', { name: t('park_' + p) }), '#ffd23f', 26]);
    for (const b of res.boards) lines.push([t('newBoard', { name: loc(boardDef(b).name) }), '#ff9ae6', 24]);
    const H = 190 + lines.length * 46;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-310, -H / 2 + 8, 620, H, 28);
    g.fillStyle(0x10162e, 0.94).fillRoundedRect(-310, -H / 2, 620, H, 28);
    g.lineStyle(2, 0xffffff, 0.2).strokeRoundedRect(-310, -H / 2, 620, H, 28);
    c.add(g);
    c.add(txt(this, 0, -H / 2 + 50, t('sessionOver'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 8 }));
    c.add(txt(this, 0, -H / 2 + 100, t('park_' + this.parkId) + ' · ' + fmt(this.sim.score), { size: 26, color: '#ffffff', strokeThickness: 0, shadow: false }));
    if (this.newGoals.length) c.add(txt(this, 0, -H / 2 + 140, t('goalsThis'), { size: 20, color: '#9fb0d8', strokeThickness: 0, shadow: false }));
    lines.forEach(([s, col, size], i) => c.add(txt(this, 0, -H / 2 + 186 + i * 46, s, { title: i >= this.newGoals.length, size, color: col, strokeThickness: 0, shadow: false, wrap: 580 })));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 3100, duration: 300 });
    if (res.parks.length || res.boards.length) { this.sfx('unlock', { volume: 0.7, exact: true }); burst(this, width / 2, 600, [0xffd23f, 0xff9ae6, 0x9fe8ff], 50, 420); }
    if (res.boards.length) {
      // the new board moment: a banner over the summary, in the best new board's rarity colour
      const order = ['common', 'rare', 'epic', 'legendary', 'special'];
      const best = res.boards.map(boardDef).sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity))[0];
      const col = '#' + RARITY_COLOR[best.rarity].toString(16).padStart(6, '0');
      // on the tween clock, like the summary card it joins
      this.tweens.addCounter({ from: 0, to: 1, duration: 450, onComplete: () => {
        banner(this, width / 2, 250, t('newBoardTitle'), { color: col, size: 46, hold: 2.6, sub: res.boards.map((b) => loc(boardDef(b).name)).join(' · '), subColor: '#ffffff' });
        this.sfx('specialReady', { volume: 0.6 });
        burst(this, width / 2, 250, [RARITY_COLOR[best.rarity], 0xffffff], 36, 360);
      } });
      this.summaryLen = 4.6;
    }
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    // a round ended from outside before its session began (the platform, a test): nothing to bank
    if (this.setup) { this.setup.close(); this.setup = null; }
    else if (!this.isOver && this.phase === 'play') this.bank();
    super.endGame(o);
  }

  // ------------------------------------------------------------------ test hooks

  /** Starts the session from the setup as START does (store art, screenshots); returns whether it did. */
  testStart(): boolean {
    if (!this.setup) return false;
    this.setup.close();
    this.begin();
    return true;
  }

  /** The autopilot plays (store art, screenshots). */
  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void {
    this.bot = on ? new Bot(this.sim, SKILL[skill], 11) : null;
    if (on) this.endTutorial(true);
  }
  testCam(yaw: number, dist: number, h: number): void { this.view.debugCam = dist > 0 ? { yaw, dist, h } : null; }
  testTutorial(open: boolean, step = 0): void {
    if (open) { this.endTutorial(true); this.meta.tutorial = step; this.startTutorial(step); } else { this.endTutorial(true); this.meta.tutorial = TUTORIAL_STEPS; }
  }
  testHint(open: boolean): void {
    if (open) { this.meta.hinted = false; this.showHint(); } else { this.meta.hinted = true; this.closeHint(); }
  }
  /** Puts another board under the rider (screenshots of the boards in play). */
  testBoard(id: string): void { this.view.skater.setBoard(usableBoard(id)); }
  testSpecial(): void { this.sim.special = 1; this.sim.specialReady = true; }
  testPlace(x: number, z: number, heading: number, speed: number): void {
    this.sim.combo = [];
    this.sim.linkT = -1;
    this.sim.respawn(x, z, heading);
    this.sim.speed = speed;
    this.view.snapCamera();
  }
  /** Feeds one input for `ms` (screenshots of a given move). */
  testInput(inp: Partial<Input>): void { this.bot = null; this.forced = { ...NO_INPUT, ...inp }; }
  private forced: Input | null = null;
  testRelease(): void { this.forced = null; }
}

export { trickName as nameOf };
