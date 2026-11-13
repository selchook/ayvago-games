// Snow Express: the Play scene. Runs a Journey level or a Holiday Rush on the simulation (sim.ts),
// draws it in 3D (view.ts) with 2D badges on top (ui.ts Overlay), reads taps and keys into switch
// flips and powers, and turns the simulation's events into sound, words, shakes and slow motion.
// At the end of a Journey level a stars card shows the score, then the core result screen opens
// (its RETRY reads NEXT after a cleared level, and plays the next one).
import Phaser from 'phaser';
import {
  ArcadeScene, txt, t, isEasy, hudChip, HudChip, flash, burst, getLang, registerStrings,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP,
} from '@core';
import type { World3D } from '@core/three';
import { Sim, type SimEvent, type SimInput } from './sim';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { level, RUSH, timetable, LEVELS, CHAPTERS, type LevelDef } from './levels';
import { Board } from './graph';
import { loadMeta, saveMeta, recordLevel, nextLevel, type Meta } from './meta';
import { CSS, HEX, POWER_EVERY, COCOA_TIME, GLOBE_TIME, clamp, type ColorId, type Mode } from './defs';
import { makeArt, Overlay, PowerButton, banner, badgeKey, glass, UI_DEPTH } from './ui';
import { makeSounds, Loop } from './audio';

/** Numbers with thousands separators (TR: 12.345, EN: 12,345). */
export const fmt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Tip { box: Phaser.GameObjects.Container; wait: 'flip' | 'ok' | 'none'; want?: { control: number; opt: number } }

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  def!: LevelDef;
  mode: Mode = 'normal';
  rush = false;
  par = 0;
  private overlay!: Overlay;
  private cocoaBtn!: PowerButton;
  private globeBtn!: PowerButton;
  private leftChip!: HudChip;
  private nextChip!: HudChip;
  private nextIcons: Phaser.GameObjects.Image[] = [];
  private comboChip: HudChip | null = null;
  private keysChip: HudChip | null = null;
  private chug!: Loop;
  private bot: Bot | null = null;
  private flips: number[] = [];
  private power: SimInput['power'] = null;
  private slowT = 0;
  private timeScale = 1;
  private finished = false;
  private tip: Tip | null = null;
  private tutStep = 0;
  private lastNext = '';
  private lastLeft = -1;
  private lastScore = -1;
  private frost = 0;
  private frostG!: Phaser.GameObjects.Graphics;
  private globeTint!: Phaser.GameObjects.Rectangle;
  private wasCocoa = false;
  private shut: boolean[] = [];
  /** Frame times of the first Play frames (ms), and the shader programs before the first frame (warm-up check). */
  firstFrames: number[] = [];
  programsAtStart = -1;
  private frameStart = 0;
  /** Test hook: runs the simulation faster (slow software rendering in screenshots). */
  testSpeed = 1;
  /** Test hook: the next rounds use this seed. */
  static forceSeed: number | null = null;
  /** Frame cost (test hook). */
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0 };

  createGame(): void {
    makeArt(this);
    makeSounds(this.game);
    registerStrings({ tr: { retry: 'TEKRAR' }, en: { retry: 'RETRY' } });
    this.meta = loadMeta();
    this.rush = this.meta.mode === 'rush';
    this.mode = isEasy() ? 'easy' : 'normal';
    this.def = this.rush ? RUSH[this.meta.rushRuns % RUSH.length] : level(this.meta.level);
    const seed = PlayScene.forceSeed ?? Math.floor(Math.random() * 1e9);
    const spawns = this.rush ? null : timetable(this.def, this.mode, seed);
    this.sim = new Sim({ map: this.def, mode: this.mode, seed, spawns, speed: this.def.spec.speed });
    this.par = spawns ? Sim.par(new Board(this.def), spawns, this.mode, this.def.spec.speed) : 0;
    this.bot = null;
    this.flips = [];
    this.power = null;
    this.slowT = 0;
    this.timeScale = 1;
    this.finished = false;
    this.tip = null;
    this.tutStep = 0;
    this.lastNext = '';
    this.lastLeft = -1;
    this.lastScore = -1;
    this.frost = 0;
    this.wasCocoa = false;
    this.nextIcons = [];
    this.comboChip = null;
    this.keysChip = null;
    this.firstFrames = [];
    this.frameStart = 0;
    this.testSpeed = 1;

    this.view = new View(this, this.def, { evening: this.rush ? 0 : undefined });
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
    this.overlay = new Overlay(this, this.view, true);
    this.shut = this.view.board.stops.map(() => false);

    // HUD: score (core), hearts, level / combo; row 2: deliveries left (Journey) and the next trains
    this.hud.setLives(this.sim.hearts, this.sim.maxHearts);
    if (!this.rush) this.hud.setLevel(this.def.id);
    this.leftChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: 'se-gift', iconSize: 28, label: t('left'), text: '0', minWidth: 120 });
    this.leftChip.setVisible(!this.rush);
    this.nextChip = hudChip(this, this.scale.width - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', label: t('next'), text: '', minWidth: 170 });
    if (this.rush) {
      this.comboChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { label: t('combo'), text: '×1', color: '#ffd23f', minWidth: 110 });
    }
    this.frostG = this.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH - 10);
    this.globeTint = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x9fd8ff, 0).setOrigin(0).setScrollFactor(0).setDepth(UI_DEPTH - 11);

    // powers, bottom left and right
    const H = this.scale.height;
    this.cocoaBtn = new PowerButton(this, 86, H - 112, 'cocoa', t('cocoaShort'), 'Z', () => this.usePower('cocoa'));
    this.globeBtn = new PowerButton(this, this.scale.width - 86, H - 112, 'globe', t('globeShort'), 'X', () => this.usePower('globe'));
    this.cocoaBtn.showKey(false);
    this.globeBtn.showKey(false);

    // input: taps on switches, number keys, arrows + Space, Z / X for the powers
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(p.x, p.y));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.key(e));

    this.chug = new Loop(this, 'se-chug');
    this.startBanner();
    if (!this.meta.tutorial && this.def.id <= 2 && !this.rush) this.tutStep = 1;
  }

  // ------------------------------------------------------------------ input

  private setKeys(on: boolean): void {
    if (this.overlay.keys === on) return;
    this.overlay.keys = on;
    if (on && this.overlay.selected < 0) this.overlay.selected = 0;
    this.cocoaBtn.showKey(on);
    this.globeBtn.showKey(on);
    if (on && !this.keysChip && !this.meta.keysSeen) {
      this.keysChip = hudChip(this, this.scale.width / 2, this.scale.height - 34, { align: 'center', text: t('keysHint'), size: 20, height: 40, depth: UI_DEPTH });
      this.time.delayedCall(6000, () => { this.keysChip?.destroy(); this.keysChip = null; });
      this.meta.keysSeen = true;
      saveMeta(this.meta);
    }
  }

  private tap(x: number, y: number): void {
    if (this.isOver || this.finished) return;
    this.setKeys(false);
    if (this.tip && this.tip.wait === 'ok') { this.closeTip(); return; }
    if (y > this.scale.height - 190 && (x < 170 || x > this.scale.width - 170)) return; // the power buttons
    const i = this.overlay.pick(x, y);
    if (i >= 0) this.flip(i);
  }

  private key(e: KeyboardEvent): void {
    if (this.isOver || this.finished) return;
    const n = this.view.board.controls.length;
    if (/^Digit[1-9]$/.test(e.code) || /^Numpad[1-9]$/.test(e.code)) {
      this.setKeys(true);
      const i = Number(e.code.slice(-1)) - 1;
      if (i < n) { this.overlay.selected = i; this.flip(i); }
      return;
    }
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
      this.setKeys(true);
      if (!n) return;
      const back = ['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code);
      this.overlay.selected = ((this.overlay.selected < 0 ? 0 : this.overlay.selected) + (back ? n - 1 : 1)) % n;
      this.sfx('tick', { volume: 0.3 });
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      if (this.tip && this.tip.wait === 'ok') { this.closeTip(); return; }
      this.setKeys(true);
      if (this.overlay.selected >= 0 && this.overlay.selected < n) this.flip(this.overlay.selected);
      return;
    }
    if (e.code === 'KeyZ') { this.setKeys(true); this.usePower('cocoa'); }
    if (e.code === 'KeyX') { this.setKeys(true); this.usePower('globe'); }
  }

  private flip(i: number): void {
    if (this.tip?.wait === 'ok') return;
    if (this.tip?.wait === 'flip' && this.tip.want && this.tip.want.control !== i) return;
    this.flips.push(i);
    this.overlay.pulseSwitch(i);
  }

  private usePower(k: 'cocoa' | 'globe'): void {
    if (this.tip) return;
    if (this.sim.powers[k] <= 0) { this.sfx('error', { volume: 0.35 }); return; }
    this.power = k;
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    const dt = delta / 1000;
    const sim = this.sim;
    // slow motion after a crash
    let ts = 1;
    if (this.slowT > 0) { this.slowT -= dt; ts = 0.25; }
    this.timeScale += (ts - this.timeScale) * Math.min(1, dt * (ts < this.timeScale ? 30 : 4));
    const sdt = dt * this.timeScale * this.testSpeed;
    this.tutorial();
    const paused = !!this.tip && this.tip.wait !== 'none';
    let inp: SimInput = { flips: this.flips, power: this.power };
    if (this.bot) inp = this.bot.input(sdt);
    this.flips = [];
    this.power = null;
    if (!this.finished) {
      if (paused) { if (inp.flips.length) sim.step(0, { flips: inp.flips, power: null }); }
      else {
        // big steps are cut so the simulation stays exact when sped up for tests
        let left = sdt, first = true;
        while (left > 1e-6) {
          const d = Math.min(left, 1 / 30);
          sim.step(d, first ? inp : { flips: [], power: null });
          first = false;
          left -= d;
        }
      }
    }
    for (const ev of sim.events) this.onEvent(ev);
    sim.events.length = 0;
    if (this.rush) this.view.evening = clamp(sim.clock / 210, 0, 1);
    this.view.slow = this.timeScale;
    this.view.frozen = sim.globeT > 0 ? 1 : 0;
    this.view.sync(sim, dt);
    this.overlay.sync(sim, dt);
    this.updateHud(dt);
    this.updateSound(dt);
    if (sim.over && !this.finished) this.finish();
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  // ------------------------------------------------------------------ events

  private at(x: number, y: number, z: number): { x: number; y: number } { return this.view.toScreen(x, y, z); }

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    const W = this.scale.width;
    switch (ev.type) {
      case 'warn':
        this.sfx('ding', { volume: 0.22, rate: 1.4 });
        if (ev.kind === 'plow') banner(this, W / 2, 330, t('plowOut'), { color: '#ffb35a', size: 34, hold: 0.9 });
        break;
      case 'spawn':
        if (ev.train.kind !== 'plow') this.sfx('se-whistle', { volume: ev.train.kind === 'express' ? 0.32 : 0.22, rate: ev.train.kind === 'express' ? 1.25 : 1 });
        break;
      case 'flip': this.sfx('flip', { volume: 0.55 }); this.sfx('clack', { volume: 0.4 }); break;
      case 'signal': this.sfx('signal', { volume: 0.5 }); break;
      case 'blocked':
        this.sfx('bonk', { volume: 0.7 });
        this.sfx('error', { volume: 0.25 });
        this.overlay.shakeSwitch(ev.control);
        if (this.def.id <= 3 && !this.rush) { const p = this.overlay.switches[ev.control]; if (p) banner(this, clamp(p.x, 170, W - 170), p.y - 60, t('blocked'), { color: '#ffb35a', size: 26, hold: 0.5 }); }
        break;
      case 'enter': this.sfx(Math.random() < 0.5 ? 'clack' : 'clack2', { volume: 0.22 }); break;
      case 'deliver': this.delivered(ev); break;
      case 'carIn': if (ev.correct && ev.car > 0) this.sfx('glass', { volume: 0.25, rate: 1 + ev.car * 0.12 }); break;
      case 'plowDone': {
        this.sfx('coin', { volume: 0.4 });
        break;
      }
      case 'clear': {
        this.sfx('snow', { volume: 0.8 }); this.sfx('snow2', { volume: 0.6 });
        const x = (ev.tile % 8) - 3.5, z = Math.floor(ev.tile / 8) - 5.5;
        const p = this.at(x, 0.8, z);
        banner(this, clamp(p.x, 170, W - 170), p.y - 40, t('cleared'), { color: '#bfe6ff', size: 30, hold: 0.6 });
        break;
      }
      case 'stuck': {
        this.sfx('snow', { volume: 0.8 });
        this.sfx('se-trombone', { volume: 0.4, exact: true });
        const x = (ev.tile % 8) - 3.5, z = Math.floor(ev.tile / 8) - 5.5;
        const p = this.at(x, 0.8, z);
        banner(this, clamp(p.x, 170, W - 170), p.y - 40, t('stuck'), { color: '#9fd8ff', size: 32, hold: 0.7 });
        this.frost = 1;
        break;
      }
      case 'lost': {
        this.sfx('se-trombone', { volume: 0.4, exact: true });
        banner(this, W / 2, 360, t('lost'), { color: '#9fd8ff', size: 32, hold: 0.8 });
        this.frost = 1;
        break;
      }
      case 'crash': {
        this.sfx('crash', { volume: 0.9 }); this.sfx('crash2', { volume: 0.5 }); this.sfx('thump', { volume: 0.8 }); this.sfx('snow', { volume: 0.7 });
        this.slowT = 0.9;
        this.cameras.main.shake(380, 0.012);
        flash(this, 0xffffff, 140, 0.35);
        const p = this.at(ev.x, ev.y + 0.6, ev.z);
        banner(this, clamp(p.x, 170, W - 170), clamp(p.y - 40, 300, 900), t('crash'), { color: '#ff5a4f', size: 64, hold: 1 });
        break;
      }
      case 'heart':
        this.sfx('heart', { volume: 0.5 });
        this.hud.setLives(ev.hearts, sim.maxHearts);
        if (ev.hearts === 1) this.time.delayedCall(700, () => { if (!this.isOver) banner(this, W / 2, 420, t('lastHeart'), { color: '#ff7a8a', size: 36, hold: 0.6 }); });
        if (this.tutStep > 0 && this.def.id === 2) { this.tutStep = -1; this.showTip(t('tut_hearts'), 'ok'); }
        break;
      case 'power': {
        this.sfx('power', { volume: 0.6 });
        this.sfx('se-jingle', { volume: 0.35, exact: true });
        const name = t(ev.kind);
        banner(this, W / 2, 470, t('powerGot', { p: name }), { color: '#ffd23f', size: 36, hold: 0.9 });
        const btn = ev.kind === 'cocoa' ? this.cocoaBtn : this.globeBtn;
        burst(this, btn.x, btn.y, [0xffd23f, 0xffffff, ev.kind === 'cocoa' ? 0xb0703a : 0x8fd0ff], 30, 300);
        break;
      }
      case 'usePower':
        if (ev.kind === 'cocoa') { this.sfx('cocoa', { volume: 0.6 }); banner(this, W / 2, 470, t('cocoaOn'), { color: '#ffcf9a', size: 40, hold: 0.8 }); this.wasCocoa = true; }
        else { this.sfx('globe', { volume: 0.7 }); this.sfx('glass', { volume: 0.5 }); banner(this, W / 2, 470, t('globeOn'), { color: '#bfe6ff', size: 44, hold: 0.8 }); flash(this, 0xcfeaff, 200, 0.4); }
        break;
      case 'open': {
        this.sfx('se-bells', { volume: 0.5, exact: true });
        const st = this.view.board.stops[ev.stop];
        this.view.setClosed(ev.stop, false);
        this.overlay.setClosed(ev.stop, false);
        const p = this.at(...this.cabinTop(ev.stop));
        banner(this, W / 2, 400, t('newColor'), { color: CSS[st.color], size: 36, hold: 0.9 });
        burst(this, p.x, p.y, [HEX[st.color], 0xffffff], 30, 280);
        break;
      }
      case 'held': break;
      default: break;
    }
  }

  private cabinTop(stop: number): [number, number, number] {
    const p = this.view.stopPoint(stop, 1.4);
    return [p.x, p.y, p.z];
  }

  private delivered(ev: Extract<SimEvent, { type: 'deliver' }>): void {
    const W = this.scale.width;
    const st = this.view.board.stops[ev.stop];
    const p = this.at(...this.cabinTop(ev.stop));
    this.overlay.pop(ev.stop, ev.correct);
    if (ev.correct) {
      this.sfx('se-bells', { volume: 0.45, exact: true });
      this.sfx('coin', { volume: 0.45 });
      const color = ev.train.color ? CSS[ev.train.color] : '#ffffff';
      // "+1" with the colour's icon
      const c = this.add.container(clamp(p.x, 80, W - 80), p.y - 20).setDepth(UI_DEPTH + 40);
      const icon = this.add.image(-34, 0, badgeKey(st.color)).setDisplaySize(44, 44);
      const label = this.rush ? '+' + fmt(ev.points) : '+1';
      const tx = txt(this, 14, 0, label, { title: true, size: 36, color, strokeThickness: 8 }).setOrigin(0, 0.5);
      c.add([icon, tx]);
      c.setScale(0.4);
      this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.tweens.add({ targets: c, y: c.y - 70, alpha: 0, delay: 650, duration: 450, onComplete: () => c.destroy() });
      burst(this, p.x, p.y, [HEX[st.color], 0xffffff, 0xffd23f], 18, 220);
      if (this.rush && ev.mult > 1 && this.comboChip) {
        this.tweens.add({ targets: this.comboChip, scale: { from: 1.35, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        if (this.sim.streak % 3 === 1) { this.sfx('combo', { volume: 0.5 }); banner(this, W / 2, 300, t('comboUp', { n: ev.mult }), { color: '#ffd23f', size: 40, hold: 0.6 }); }
      }
      const pf = this.sim.perfect;
      if (pf > 0 && pf % POWER_EVERY !== 0 && pf % 3 === 0) banner(this, W / 2, 520, t('perfect' + Math.min(3, Math.floor(pf / 3) - 1)), { color: '#7dffa0', size: 40, hold: 0.5 });
      if (this.tutStep === 2) { this.tutStep = 3; this.showTip(t('tut_done'), 'ok'); }
    } else {
      this.sfx('se-trombone', { volume: 0.45, exact: true });
      this.frost = 1;
      banner(this, clamp(p.x, 170, W - 170), clamp(p.y - 30, 300, 900), t('wrong'), { color: '#9fd8ff', size: 40, hold: 0.7 });
      this.cameras.main.shake(200, 0.006);
    }
    this.tweens.add({ targets: this.hud.scoreChip, scale: { from: 1.15, to: 1 }, duration: 220 });
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(dt: number): void {
    const sim = this.sim;
    const score = this.rush ? sim.score : sim.stats.correct * 100;
    if (score !== this.lastScore) { this.lastScore = score; this.setScore(score); }
    if (!this.rush) {
      const left = sim.toDeliver();
      if (left !== this.lastLeft) {
        this.lastLeft = left;
        this.leftChip.setText(String(left));
        this.tweens.add({ targets: this.leftChip, scale: { from: 1.2, to: 1 }, duration: 200 });
      }
    } else if (this.comboChip) this.comboChip.setText('×' + sim.mult);
    // the next trains: colour badges (the plow as a gift-less orange dot)
    const up = sim.upcoming(3);
    const key = up.map((s) => s.color ?? 'plow').join(',');
    if (key !== this.lastNext) {
      this.lastNext = key;
      for (const i of this.nextIcons) i.destroy();
      this.nextIcons = up.map((s) => s.color ? this.add.image(0, 0, badgeKey(s.color as ColorId)).setDisplaySize(32, 32) : this.add.image(0, 0, 'se-gift').setDisplaySize(26, 26).setTint(0xffa040));
      this.nextIcons.forEach((im) => im.setData('chipWidth', 36));
      this.nextChip.setItems(this.nextIcons);
      this.nextChip.setVisible(up.length > 0);
      if (up.length) this.tweens.add({ targets: this.nextChip, scale: { from: 1.12, to: 1 }, duration: 180 });
    }
    this.hud.setLives(sim.hearts, sim.maxHearts);
    if (this.rush) {
      this.view.board.stops.forEach((st, i) => {
        const shut = !sim.open.includes(st.color);
        if (shut !== this.shut[i]) { this.shut[i] = shut; this.view.setClosed(i, shut); this.overlay.setClosed(i, shut); }
      });
    }
    this.cocoaBtn.set(sim.powers.cocoa, sim.cocoaT / COCOA_TIME);
    this.globeBtn.set(sim.powers.globe, sim.globeT / GLOBE_TIME);
    if (this.wasCocoa && sim.cocoaT <= 0) { this.wasCocoa = false; this.sfx('cocoaOut', { volume: 0.5 }); }
    // a blue frost around the edges after a mistake
    this.frost = Math.max(0, this.frost - dt * 1.4);
    const g = this.frostG.clear();
    if (this.frost > 0) {
      const { width: W, height: H } = this.scale;
      for (let i = 0; i < 7; i++) g.lineStyle(20, 0x9fdcff, this.frost * 0.45 * (1 - i / 7)).strokeRect(i * 18, i * 18, W - i * 36, H - i * 36);
    }
    this.globeTint.setAlpha(sim.globeT > 0 ? 0.16 + Math.sin(this.elapsed * 6) * 0.03 : sim.cocoaT > 0 ? 0 : 0);
    this.globeTint.setFillStyle(sim.globeT > 0 ? 0x9fd8ff : 0xffb070);
  }

  private updateSound(dt: number): void {
    const run = this.sim.trains.filter((tr) => tr.state === 'run' || tr.state === 'deliver');
    const v = run.length ? run.reduce((s, tr) => s + tr.speed, 0) / run.length : 0;
    const vol = run.length ? Math.min(0.32, 0.12 + run.length * 0.05) : 0;
    this.chug.set(this.finished ? 0 : vol, 0.55 + v * 0.55 * this.timeScale, dt);
  }

  private startBanner(): void {
    const W = this.scale.width;
    if (this.rush) {
      banner(this, W / 2, 600, t('rush'), { color: '#ffd23f', size: 54, hold: 1.2, sub: t('go'), subColor: '#ffffff' });
      return;
    }
    const ch = CHAPTERS[this.def.chapter];
    const sub = this.def.intro ? t(this.def.intro) : t('ch' + ch.id);
    banner(this, W / 2, 600, t('levelN', { n: this.def.id }), { color: '#ffffff', size: 54, hold: 1.3, sub, subColor: '#ffd23f' });
  }

  // ------------------------------------------------------------------ tutorial

  /** Levels 1 and 2, the first time: the game waits for the player at each step. */
  private tutorial(): void {
    if (this.tutStep <= 0 || this.tip) return;
    const sim = this.sim;
    if (this.def.id === 1 && this.tutStep === 1) {
      // the first train is out: ask for the switch
      const tr = sim.trains[0];
      if (!tr || tr.age < 0.6) return;
      const j = 0;
      const ci = sim.board.controls.findIndex((c) => c.kind === 'switch' && c.id === j);
      const want = sim.board.stops.findIndex((s) => s.color === tr.color);
      const bot = new Bot(sim, SKILL.good);
      const r = bot.route(tr);
      const need = r?.choices.find((c) => c.junction === j)?.opt ?? 1;
      void want;
      const c = tr.color as ColorId;
      const msg = t(this.overlay.keys ? 'tut_switchKeys' : 'tut_switchTouch', { c: t('c_' + c), c2: t('c2_' + c) });
      if (sim.state[j] === need) { this.tutStep = 2; return; }
      this.showTip(msg, 'flip', { control: ci, opt: need });
      return;
    }
    if (this.def.id === 2 && this.tutStep === 1) {
      const tr = sim.trains[0];
      if (!tr || tr.age < 0.4) return;
      this.tutStep = 4;
      this.showTip(t('tut_busy'), 'ok');
    }
  }

  private showTip(msg: string, wait: Tip['wait'], want?: Tip['want']): void {
    this.tip?.box.destroy();
    const { width } = this.scale;
    const body = txt(this, 0, 0, msg, { size: 26, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 560 });
    const h = body.height + (wait === 'ok' ? 130 : 60);
    const c = this.add.container(width / 2, this.tipY(h)).setScrollFactor(0).setDepth(UI_DEPTH + 200);
    const g = glass(this, 620, h, { color: 0x14204a, alpha: 0.95 });
    body.setY(-h / 2 + 30 + body.height / 2);
    c.add([g, body]);
    if (wait === 'ok') {
      const okY = h / 2 - 46;
      const ok = this.add.graphics().fillStyle(0x2fae5a, 1).fillRoundedRect(-110, okY - 30, 220, 60, 30).fillStyle(0xffffff, 0.18).fillRoundedRect(-104, okY - 26, 208, 24, 12);
      c.add([ok, txt(this, 0, okY, t('tut_ok'), { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false })]);
    }
    if (wait === 'flip' && want) {
      // a hand points at the switch
      const s = this.overlay.switches[want.control];
      if (s) {
        const hand = this.add.image(s.x + 30, s.y + 50, 'se-hand').setDisplaySize(72, 72).setDepth(UI_DEPTH + 199).setAngle(-20);
        this.tweens.add({ targets: hand, x: s.x + 18, y: s.y + 34, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const ring = this.add.circle(s.x, s.y, 40).setStrokeStyle(5, 0xffd23f, 1).setDepth(UI_DEPTH + 198);
        this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 900, repeat: -1 });
        c.add([]);
        c.setData('extra', [hand, ring]);
      }
    }
    c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tip = { box: c, wait, want };
    this.sfx('tick', { volume: 0.4 });
  }

  /** Where a tip box of height h goes: in the free band under the board, else over the mountains. */
  private tipY(h: number): number {
    const below = this.view.contentBottom + 12 + h / 2;
    if (below + h / 2 <= 1062) return below;
    return Math.max(this.view.contentTop - 12 - h / 2, 150 + h / 2);
  }

  private closeTip(): void {
    const tip = this.tip;
    if (!tip) return;
    this.tip = null;
    for (const o of (tip.box.getData('extra') as Phaser.GameObjects.GameObject[] | undefined) ?? []) o.destroy();
    this.tweens.add({ targets: tip.box, alpha: 0, scale: 0.9, duration: 160, onComplete: () => tip.box.destroy() });
    // what comes after
    if (this.def.id === 1 && this.tutStep === 3) { this.tutStep = 5; this.time.delayedCall(400, () => { if (!this.isOver) this.showTip(t('tut_icons'), 'ok'); }); }
    else if (this.def.id === 1 && this.tutStep === 5) this.tutStep = -1;
  }

  /** Called every frame while the flip step waits: done once the switch is set right. */
  private checkFlipTip(): void {
    const tip = this.tip;
    if (!tip || tip.wait !== 'flip' || !tip.want) return;
    const ctl = this.sim.board.controls[tip.want.control];
    if (this.sim.state[ctl.id] === tip.want.opt) {
      this.tip = null;
      for (const o of (tip.box.getData('extra') as Phaser.GameObjects.GameObject[] | undefined) ?? []) o.destroy();
      tip.box.destroy();
      this.tutStep = 2;
      const s = this.overlay.switches[tip.want.control];
      banner(this, this.scale.width / 2, this.tipY(60), t('tut_arrow'), { color: '#ffffff', size: 28, hold: 1.6 });
      if (s) burst(this, s.x, s.y, [0xffd23f, 0xffffff], 20, 200);
    }
  }

  // ------------------------------------------------------------------ the end

  private finish(): void {
    this.finished = true;
    const sim = this.sim;
    const W = this.scale.width;
    if (this.tip) this.closeTip();
    if (this.rush) {
      this.meta.rushRuns++;
      saveMeta(this.meta);
      this.setScore(sim.score);
      this.endGame({ win: false, title: sim.failReason === 'crash' ? t('crashEnd') : t('rushOver'), delay: 900 });
      return;
    }
    if (this.def.id <= 2 && sim.won) { this.meta.tutorial = this.def.id === 2 || this.meta.tutorial; }
    if (!sim.won) {
      saveMeta(this.meta);
      this.setScore(sim.stats.correct * 100);
      this.endGame({ win: false, title: sim.failReason === 'crash' ? t('crashEnd') : t('levelFail', { n: this.def.id }), delay: 700 });
      return;
    }
    // stars, the time bonus and the score: stars × 1000 + 100 per delivery + up to 500 for time
    const stars = sim.stars(this.par);
    const bonus = Math.round(clamp((this.par - sim.time) * 10, 0, 500));
    const score = stars * 1000 + sim.stats.correct * 100 + bonus;
    const opened = recordLevel(this.meta, this.def.id, stars);
    const next = nextLevel(this.meta, this.def.id);
    if (next) { this.meta.level = next; saveMeta(this.meta); registerStrings({ tr: { retry: 'SONRAKİ' }, en: { retry: 'NEXT' } }); }
    this.setScore(score);
    // the stars card over the board
    const c = this.add.container(W / 2, 600).setScrollFactor(0).setDepth(UI_DEPTH + 150);
    const g = glass(this, 600, 400, { color: 0x14204a, alpha: 0.94 });
    c.add(g);
    c.add(txt(this, 0, -150, LEVELS.length === this.def.id ? t('allDone') : t('levelDone', { n: this.def.id }), { title: true, size: 40, color: '#ffd23f', strokeThickness: 8 }));
    const starImgs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(-120 + i * 120, -50, 'icon-star').setDisplaySize(96, 96).setTint(0x46507a);
      starImgs.push(s);
      c.add(s);
    }
    c.add(txt(this, 0, 40, t('timeIs', { t: mmss(sim.time), p: mmss(this.par) }), { size: 26, color: '#cfe0ff', strokeThickness: 0, shadow: false }));
    const sc = txt(this, 0, 100, '0', { title: true, size: 48, color: '#ffffff', strokeThickness: 6 });
    c.add(sc);
    if (opened.length) c.add(txt(this, 0, 160, t('newChapter', { c: t('ch' + opened[0]) }), { title: true, size: 24, color: '#7dffa0', strokeThickness: 5 }));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    for (let i = 0; i < stars; i++) {
      this.time.delayedCall(450 + i * 380, () => {
        const s = starImgs[i];
        s.setTint(0xffd23f);
        this.tweens.add({ targets: s, scale: { from: s.scale * 1.8, to: s.scale }, duration: 320, ease: 'Back.easeOut' });
        burst(this, W / 2 - 120 + i * 120, 550, [0xffd23f, 0xffffff], 22, 260);
        this.sfx('star', { volume: 0.6, rate: 1 + i * 0.15 });
      });
    }
    this.tweens.addCounter({ from: 0, to: score, duration: 900, delay: 400, onUpdate: (tw) => sc.setText(fmt(tw.getValue() ?? 0)) });
    this.sfx('se-jingle', { volume: 0.5, exact: true });
    this.time.delayedCall(2900, () => {
      this.tweens.add({ targets: c, alpha: 0, scale: 0.92, duration: 200, onComplete: () => c.destroy() });
      this.endGame({ win: true, title: t('levelDone', { n: this.def.id }), delay: 200 });
    });
  }

  update(time: number, delta: number): void {
    this.checkFlipTip();
    super.update(time, delta);
  }

  // ------------------------------------------------------------------ test hooks

  /** The autopilot plays (store art, screenshots, balance). */
  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void { this.bot = on ? new Bot(this.sim, SKILL[skill], 11) : null; }
  /** Fills the power buttons. */
  testPowers(n = 2): void { this.sim.powers.cocoa = n; this.sim.powers.globe = n; }
  testEvening(k: number): void { this.view.evening = k; }
  /** Hides the 2D badges (close-up shots with a test camera). */
  testOverlay(on: boolean): void { this.overlay.setVisible(on); }
  /** Steps the simulation `seconds` at once (no rendering in between). */
  testStep(seconds: number): void { this.testUntil(null, seconds); }
  /**
   * Steps the simulation until an event of `type` happened (with `ok` for deliveries: true = a
   * correct one, false = a wrong one), at most `seconds`. Returns whether it did.
   */
  testUntil(type: SimEvent['type'] | null, seconds: number, ok?: boolean): boolean {
    for (let t0 = 0; t0 < seconds && !this.sim.over; t0 += 1 / 30) {
      const inp = this.bot ? this.bot.input(1 / 30) : { flips: [], power: null };
      this.sim.step(1 / 30, inp);
      // only the step that hits shows its words and sounds; the ones before only move the 3D
      const hit = this.sim.events.some((ev) => ev.type === type && (ok === undefined || (ev.type === 'deliver' && ev.correct === ok)));
      for (const ev of this.sim.events) {
        if (hit) this.onEvent(ev);
        else this.view.handle(ev, this.sim);
      }
      this.sim.events.length = 0;
      if (hit) return true;
    }
    return false;
  }
  /** Ends the tutorial at once. */
  testSkipTutorial(): void { this.tutStep = -1; if (this.tip) { const tip = this.tip; this.tip = null; for (const o of (tip.box.getData('extra') as Phaser.GameObjects.GameObject[] | undefined) ?? []) o.destroy(); tip.box.destroy(); } }
}

export { CSS };
