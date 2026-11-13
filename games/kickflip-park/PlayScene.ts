// Kickflip Park: the Play scene. Runs a session of the simulation (sim.ts) in the chosen park,
// draws it in 3D (view.ts) under a Phaser HUD, reads the keyboard and the touch pad, and turns the
// simulation's events into sound, words, shakes, hit-stops and slow motion. At the end it shows
// the session's goals and unlocks, banks them (meta.ts) and opens the result screen.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, hudChip, HudChip, flash, burst, getLang,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP,
} from '@core';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent, type Entry } from './sim';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { park, type ParkId, type GoalDef } from './parks';
import { loadMeta, saveMeta, bankSession, type Meta } from './meta';
import { PRAISE, clamp, type Mode } from './defs';
import { TouchPad, Meter, BalanceBar, banner, goalToast, dirOf, UI_DEPTH } from './ui';
import { makeLoops, Loop } from './audio';
import { makeIcons, TAPE_ICON, CLOCK_ICON } from './art';

/** Numbers with thousands separators (TR: 12.345, EN: 12,345). */
export const fmt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');

/** A trick's name in the combo string. */
export function trickName(e: Entry): string {
  if (e.id === 'gap') return t('gap_' + e.key);
  if (e.id === 'spin') return t('tr_spin', { n: e.n * 180 });
  const name = t('tr_' + e.id);
  if (e.n >= 3) return t('tr_triple', { t: name });
  if (e.n === 2) return t('tr_double', { t: name });
  return name;
}

/** A decimal number in the language's style (TR: 2,5 · EN: 2.5). */
const dec = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', getLang() === 'tr' ? ',' : '.');

/** A goal's line of text (score goals scale in Easy). */
export function goalText(g: GoalDef, need: number): string {
  switch (g.kind) {
    case 'score': return t('goal_score', { n: fmt(need) });
    case 'combo': return t('goal_combo', { n: fmt(need) });
    case 'tapes': return t('goal_tapes');
    case 'rail': return t('goal_rail_' + g.tag, { n: dec(need) });
    case 'gap': return t('goal_gap_' + g.tag);
    case 'manual': return t('goal_manual', { n: dec(need) });
    case 'vert': return t('goal_vert', { n: dec(need) });
    case 'spin': return t('goal_spin', { n: need });
    case 'rails': return t('goal_rails', { n: need });
    case 'special': return t('goal_special');
  }
}

export function goalNeed(g: GoalDef, mode: Mode): number {
  const scale = mode === 'easy' ? 0.7 : 1;
  return g.kind === 'score' || g.kind === 'combo' ? Math.round(g.n * scale / 500) * 500 : g.n;
}

const SPIN_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];

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

  createGame(): void {
    makeIcons(this);
    makeLoops(this.game);
    this.meta = loadMeta();
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
    this.flashT = 0;
    this.specialHinted = false;
    this.newGoals = [];
    this.firstFrames = [];
    this.frameStart = 0;
    this.testSpeed = 1;

    this.view = new View(this, this.parkId, { deck: this.meta.deck, wheel: this.meta.wheel });
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

    if (!this.meta.hinted) this.time.delayedCall(250, () => this.showHint());
    else this.parkBanner();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (!this.banked && this.sim.time > 5) this.bank(); });
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
    this.updateSound(dt);
    this.drawSpeedLines(dt);
    if (sim.over && !this.finished) this.finish();
    if (this.summaryT >= 0) {
      this.summaryT += dt;
      if (this.summaryT > 3.6) this.endGame({ title: t('sessionOver'), win: this.newGoals.length > 0, delay: 0 });
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
      case 'ollie': this.sfx('pop', { volume: 0.55 + ev.power * 0.3 }); break;
      case 'launch': if (ev.vert) this.sfx('whoosh2', { volume: 0.35 }); break;
      case 'land':
        this.sfx(ev.surf === 'wood' ? 'landWood' : 'land', { volume: Math.min(0.9, 0.35 + ev.impact * 0.06) });
        if (ev.impact > 8) this.sfx('thud', { volume: 0.5 });
        break;
      case 'flip': this.sfx(ev.def.id === 'shoveit' ? 'whoosh4' : 'whoosh1', { volume: 0.5 }); this.sfx('flick', { volume: 0.3 }); break;
      case 'grab': this.sfx('grab', { volume: 0.35 }); break;
      case 'grindStart': this.sfx(ev.kind === 'rail' ? 'clank' : 'ledgeHit', { volume: 0.6 }); break;
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
      case 'combo': this.landedCombo(ev.score, ev.tricks); break;
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

  private landedCombo(score: number, tricks: number): void {
    const W = this.scale.width;
    this.comboOut(false);
    let tier = -1;
    for (let i = 0; i < PRAISE.length; i++) if (score >= PRAISE[i]) tier = i;
    const big = score >= 5000;
    banner(this, W / 2, 470, '+' + fmt(score), { color: tier >= 3 ? '#ffb020' : '#7dffa0', size: big ? 62 : 48, hold: 0.7, sub: tier >= 0 ? t('praise' + tier) : tricks > 1 ? t('landed') : '', subColor: '#ffffff' });
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
    return bankSession(this.meta, this.parkId, this.sim.score, this.sim.done);
  }

  /** The session's summary over the park, then the result screen. */
  private finish(): void {
    this.finished = true;
    const res = this.bank() ?? { goals: [], parks: [], decks: [], wheels: [] };
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
    for (const d of res.decks) lines.push([t('newDeck', { name: t('deck_' + d) }), '#ff9ae6', 24]);
    for (const w of res.wheels) lines.push([t('newWheel', { name: t('wheel_' + w) }), '#9fe8ff', 24]);
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
    if (res.parks.length || res.decks.length || res.wheels.length) { this.sfx('unlock', { volume: 0.7, exact: true }); burst(this, width / 2, 600, [0xffd23f, 0xff9ae6, 0x9fe8ff], 50, 420); }
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    if (!this.isOver) this.bank();
    super.endGame(o);
  }

  // ------------------------------------------------------------------ test hooks

  /** The autopilot plays (store art, screenshots). */
  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void { this.bot = on ? new Bot(this.sim, SKILL[skill], 11) : null; }
  testCam(yaw: number, dist: number, h: number): void { this.view.debugCam = dist > 0 ? { yaw, dist, h } : null; }
  testHint(open: boolean): void {
    if (open) { this.meta.hinted = false; this.showHint(); } else { this.meta.hinted = true; this.closeHint(); }
  }
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
