// Coaster Rush: the Play scene. Runs the ride (sim.ts) at a fixed step, draws it (view.ts) under a
// Phaser HUD, reads the keyboard and the touch pedals, and turns the ride's events into sounds,
// words, banners, shakes and slow motion (a derail, the slow-mo brakes). A first ride gets four
// short lessons (hold to climb the lift, coast down the drop, brake before a corner while watching
// the lean meter, stop in the station's bay); every power-up, the first loop and the first
// junction get a one-line hint the first time they turn up.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, hudChip, HudChip, flash, burst, getLang, themeCard, themeLabel, overlayHeadingStyle,
  HUD_MARGIN, HUD_ROW2_Y, HUD_CHIP_H, labelAt, labelTexture, showKeyHelp, type LabelStyle, type KeyHelpHint,
} from '@core';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent } from './sim';
import { View } from './view';
import { SUMMARY_W, SUMMARY_H } from './menu';
import { forkTickets } from './shop';
import { Bot, SKILL } from './bot';
import { AREAS, KMH, POWERS, POWER_COLOR, areaOf, clamp, isPower, lapOf, type Mode, type Power } from './defs';
import { loadMeta, saveMeta, lookOf, type Meta } from './meta';
import { TouchPad, SpeedPanel, PowerBar, TutorialCard, HintCard, Banners, popWord, UI_DEPTH, calloutStyle, subStyle, HEAD_STYLE, WORD_PX, type PowerShown } from './ui';

/** The run summary's values on the marquee card: the theme's face in its ink. */
const SUM_VALUE: LabelStyle = { size: 25, color: '#3a1a10', stroke: null, shadow: false };

/**
 * Paints the fixed callouts ahead (main.ts under the Ayvago intro; again in create, cached by text
 * and style, so only a language change paints anything), so a ride paints nothing new when they show.
 */
export function prebakePlay(scene: Phaser.Scene): void {
  const B: Array<[string, string]> = [
    ['loopDone', '#7dffa0'], ['derailed', '#ff5a4f'], ['safetySaved', '#7fe0ff'], ['stalled', '#ffb24a'], ['stationAhead', '#7dffa0'],
    ['stop_perfect', '#ffd23f'], ['stop_good', '#7dffa0'], ['stop_ok', '#7dffa0'], ['missedStation', '#ff9a6a'], ['tut_done', '#7dffa0'],
  ];
  for (const [k, c] of B) labelTexture(scene, t(k), calloutStyle(c));
  for (const k of ['derailSub', 'safetySavedSub', 'stalledSub', 'stationSubTouch', 'stationSubKeys', 'missedSub']) labelTexture(scene, t(k), subStyle('#ffffff'));
  labelTexture(scene, t('tut_doneSub'), subStyle('#ffd23f'));
  for (const a of AREAS) labelTexture(scene, t('a_' + a.id), calloutStyle('#ffffff'));
  for (const k of POWERS) {
    labelTexture(scene, t('pw_' + k), calloutStyle('#' + POWER_COLOR[k].toString(16).padStart(6, '0')));
    labelTexture(scene, t('pwSub_' + k), subStyle('#ffffff'));
    labelTexture(scene, t('pwEnd', { name: t('pw_' + k) }), calloutStyle('#c8cce0', WORD_PX));
  }
  const W: Array<[string, string]> = [['launch', '#7fe0ff'], ['harsh', '#ff9a6a'], ['thrillRide', '#ff9ad8'], ['safeRide', '#9fe8ff'], ['tut_nice', '#7dffa0'], ['camRide', '#ffffff'], ['camChase', '#ffffff']];
  for (const [k, c] of W) labelTexture(scene, t(k), calloutStyle(c, WORD_PX));
  labelTexture(scene, '+5', calloutStyle('#ff9ad8', WORD_PX));
  for (let n = 1; n <= 4; n++) labelTexture(scene, t('tut_head', { n }), HEAD_STYLE);
}
import { makeSounds, Loop } from './audio';
import { makeIcons, TOKEN_ICON, SEAT_ICON, POWER_ICON, VIGNETTE, happyKey } from './art';

/** Numbers with thousands separators (TR: 12.345, EN: 12,345). */
export const fmt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');

/** Tokens of the last finished ride (the 2× reward on the result screen). */
export let lastRunTokens = 0;

const STEP = 1 / 60;
/** The first-time keys sit above the speed panel at the bottom (desktop: y 1196, 78 high). */
const KEY_HELP_BOTTOM = 140;
const TUT = ['lift', 'coast', 'brake', 'station'] as const;
type Lesson = typeof TUT[number];

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  mode: Mode = 'normal';
  private controls!: Controls;
  private pad: TouchPad | null = null;
  private bot: Bot | null = null;
  private forced: Input | null = null;
  private acc = 0;
  private timeScale = 1;
  private slowT = 0;
  private slowK = 1;
  private happyChip!: HudChip;
  private seatChip!: HudChip;
  private speed!: SpeedPanel;
  private powerBar!: PowerBar;
  private vignette!: Phaser.GameObjects.Image;
  private tint!: Phaser.GameObjects.Image;
  private lines!: Phaser.GameObjects.Graphics;
  private banners!: Banners;
  private loops: { roll: Loop; wind: Loop; chain: Loop } | null = null;
  private lastTokens = -1;
  private lastHearts = -1;
  private lastHappy = -1;
  private lastSeats = '';
  private finished = false;
  private summaryT = -1;
  private flashT = 0;
  private hint: HintCard | null = null;
  private hintQueue: string[] = [];
  private keyC: Phaser.Input.Keyboard.Key | null = null;
  /** The first-time keys along the bottom (desktop, once): the ride goes on under them. */
  private keyHint: KeyHelpHint | null = null;
  private brakeT = 0;
  private wheeT = 0;
  private forkSide = 0;
  private forkWas = false;
  // tutorial
  private tut: TutorialCard | null = null;
  private tutStep = 0;
  private tutWait = -1;
  private coastT = 0;
  /** Frame times of the first Play frames (ms) and the shader programs before the first frame. */
  firstFrames: number[] = [];
  programsAtStart = -1;
  /** Program cache keys present when the Play scene started (warm-up check). */
  programKeys: string[] = [];
  private frameStart = 0;
  /** Test hook: runs the simulation faster or slower. */
  testSpeed = 1;
  /** Frame cost (test hook). */
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0, programs: 0 };

  createGame(): void {
    makeIcons(this);
    prebakePlay(this);
    makeSounds(this.game);
    this.meta = loadMeta();
    this.mode = isEasy() ? 'easy' : 'normal';
    this.sim = new Sim(this.mode, Math.floor(Math.random() * 1e9), { ...this.meta.upgrades });
    this.bot = null; this.forced = null;
    this.acc = 0; this.timeScale = 1; this.slowT = 0; this.slowK = 1;
    this.lastTokens = -1; this.lastHearts = -1; this.lastHappy = -1; this.lastSeats = '';
    this.finished = false; this.summaryT = -1; this.flashT = 0;
    this.hint = null; this.hintQueue = [];
    this.firstFrames = []; this.frameStart = 0; this.testSpeed = 1;
    this.brakeT = 0; this.wheeT = 0; this.forkSide = 0; this.forkWas = false;
    this.banked = false;

    this.view = new View(this, this.sim, lookOf(this.meta));
    this.view.rideCam = this.meta.rideCam;
    this.world = this.view.world;
    this.programsAtStart = (this.world.renderer.info.programs ?? []).length;
    this.programKeys = (this.world.renderer.info.programs ?? []).map((p) => p.cacheKey);
    this.perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0, programs: this.programsAtStart };
    const w = this.world, render = w.render.bind(w);
    w.render = () => {
      const t0 = performance.now();
      render();
      const d = performance.now() - t0;
      this.perf.render += d;
      this.perf.maxRender = Math.max(this.perf.maxRender, d);
      const info = w.renderer.info.render;
      this.perf.calls = info.calls;
      this.perf.tris = info.triangles;
      this.perf.maxCalls = Math.max(this.perf.maxCalls, info.calls);
      this.perf.programs = (w.renderer.info.programs ?? []).length;
    };
    this.view.onSplash = () => this.sfx('splash', { volume: 0.7 });

    // input
    this.controls = new Controls(this, {});
    this.pad = this.sys.game.device.input.touch ? new TouchPad(this, { go: t('btnGo'), brake: t('btnBrake'), left: t('safe'), right: t('thrill') }) : null;
    this.keyC = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.C) ?? null;

    // HUD: score (core), tokens and hearts (right), area flag (centre), happiness and seats (row 2),
    // power-ups (row 3), the speed panel at the bottom
    const { width: W, height: H } = this.scale;
    this.hud.setRight('0', TOKEN_ICON);
    this.hud.setLives(this.sim.hearts, this.sim.maxHearts);
    this.hud.setLevel(1);
    this.happyChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: happyKey(3), iconSize: 34, text: '70%', minWidth: 132 });
    this.seatChip = hudChip(this, W - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', icon: SEAT_ICON, iconSize: 30, text: '0/0', minWidth: 120 });
    this.powerBar = new PowerBar(this, W - HUD_MARGIN, HUD_ROW2_Y + HUD_CHIP_H + 20);
    this.speed = new SpeedPanel(this, W / 2, this.pad ? 968 : 1196, t('kmh'), t('lean'));
    this.lines = this.add.graphics().setDepth(40).setScrollFactor(0);
    this.banners = new Banners(this, W / 2, 480);
    this.vignette = this.add.image(W / 2, H / 2, VIGNETTE).setDisplaySize(W, H).setScrollFactor(0).setDepth(37).setTint(0x000000).setAlpha(0);
    this.tint = this.add.image(W / 2, H / 2, VIGNETTE).setDisplaySize(W, H).setScrollFactor(0).setDepth(38).setTint(0x9a7aff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    // sound
    this.loops = { roll: new Loop(this, 'roll-loop'), wind: new Loop(this, 'wind-loop'), chain: new Loop(this, 'chain-loop') };

    // the first ride: four short lessons
    this.tut = null; this.tutStep = 0; this.tutWait = -1; this.coastT = 0;
    if (!this.meta.tutorial) this.time.delayedCall(400, () => this.startTutorial());
    else this.time.delayedCall(300, () => this.areaBanner(this.sim.area));
    // desktop, once: the keys and what they do for the first seconds of the ride, above the speed panel
    this.keyHint = showKeyHelp(this, { bottom: this.pad ? undefined : KEY_HELP_BOTTOM });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (!this.finished && this.sim.time > 8) this.bank(); });
  }

  // ------------------------------------------------------------------ input

  private readInput(): Input {
    if (this.forced) return this.forced;
    if (this.bot) return this.bot.input(STEP);
    const c = this.controls, pad = this.pad;
    const power = c.a || c.up || !!pad?.power;
    const brake = c.down || c.b || !!pad?.brakeHeld;
    let pick = 0;
    if (c.left) pick = 1; else if (c.right) pick = -1;
    if (pad?.pick) pick = pad.pick;
    return { power, brake, pick };
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    const dt = delta / 1000;
    const sim = this.sim;
    if (this.keyC && Phaser.Input.Keyboard.JustDown(this.keyC)) this.toggleCam();
    if (this.pad?.takeCam()) this.toggleCam();
    // slow motion: a derail's first moment, the tutorial's waits, the slow-mo brakes
    let ts = 1;
    if (this.slowT > 0) { this.slowT -= dt; ts = this.slowK; }
    if (this.tutHold()) ts = Math.min(ts, 0.3);
    ts *= sim.timeScale;
    this.timeScale += (ts - this.timeScale) * Math.min(1, dt * (ts < this.timeScale ? 12 : 4));
    const sdt = dt * this.timeScale * this.testSpeed;
    this.pad?.update(dt);
    if (this.summaryT < 0) {
      this.acc += sdt;
      let n = 0;
      while (this.acc >= STEP && n < 6) {
        this.acc -= STEP;
        n++;
        sim.step(STEP, this.readInput());
        for (const ev of sim.events) this.onEvent(ev);
        sim.events.length = 0;
        if (sim.over) break;
      }
      if (n >= 6) this.acc = 0;
    }
    this.view.sync(sim, dt, sdt);
    this.updateHud(dt);
    this.updateFx(dt);
    this.banners.update();
    this.updateHints();
    this.updateTutorial(dt);
    this.updateSound(dt);
    this.drawLines();
    if (sim.over && !this.finished) this.finish();
    if (this.summaryT >= 0) {
      this.summaryT += dt;
      if (this.summaryT > 3.0) this.endGame({ title: t('rideOver'), win: false, delay: 0 });
    }
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  private toggleCam(): void {
    this.view.rideCam = !this.view.rideCam;
    this.meta.rideCam = this.view.rideCam;
    saveMeta(this.meta);
    this.sfx('tick', { volume: 0.4 });
    popWord(this, this.scale.width / 2, 860, t(this.view.rideCam ? 'camRide' : 'camChase'), '#ffffff', 26);
  }

  // ------------------------------------------------------------------ events

  /** Where the train is on screen (for words), kept clear of the HUD. */
  private at(dy = 1.4): { x: number; y: number } {
    const c = this.view.train.centres[0];
    if (!c) return { x: this.scale.width / 2, y: 600 };
    const p = this.view.toScreen(c.clone().setY(c.y + dy));
    return { x: clamp(p.x, 170, this.scale.width - 170), y: clamp(p.y, 430, 880) };
  }

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    const W = this.scale.width;
    const golden = sim.power.golden > 0;
    switch (ev.type) {
      case 'chain': break;
      case 'crest': this.sfx('woosh2', { volume: 0.35 }); this.tutorialEvent('crest'); break;
      case 'drop':
        if (ev.height > 3) { this.sfx('wheee', { volume: 0.55, rate: 0.95 + Math.random() * 0.1 }); this.wheeT = 1; }
        break;
      case 'airtime': {
        const p = this.at();
        popWord(this, p.x, p.y, t('airtime') + '  +' + fmt(ev.pts), '#9fe8ff', 30);
        this.sfx('air', { volume: 0.35, rate: 1 + Math.min(0.5, ev.t) });
        break;
      }
      case 'loop':
        this.banners.show(t('loopDone'), { color: '#7dffa0', size: 50, hold: 0.5, sub: '+' + fmt(ev.pts) }, 1);
        this.sfx('loop', { volume: 0.55, exact: true });
        this.sfx('wheee', { volume: 0.5, rate: 1.15 });
        break;
      case 'nearMiss': {
        const p = this.at(0.6);
        popWord(this, p.x, p.y, t('nearMiss') + '  +' + fmt(ev.pts), '#ffd23f', 28);
        this.sfx('woosh', { volume: 0.5 });
        break;
      }
      case 'pickup': {
        const p = ev.p;
        if (p.kind === 'coin') this.sfx('coin', { volume: 0.3, rate: 1 + Math.min(0.4, (sim.tokens % 10) * 0.04) });
        else if (p.kind === 'ticket') { this.sfx('ticket', { volume: 0.5 }); const q = this.at(); popWord(this, q.x, q.y, '+5', '#ff9ad8', 30); }
        break;
      }
      case 'power': {
        const k = ev.kind, name = t('pw_' + k);
        this.sfx('pw_' + k, { volume: 0.6 });
        const col = '#' + POWER_COLOR[k].toString(16).padStart(6, '0');
        if (ev.again) { const p = this.at(1.8); popWord(this, p.x, p.y, t('pwAgain', { name }), col, 26); }
        else this.banners.show(name, { color: col, size: 46, hold: 0.8, sub: t('pwSub_' + k) }, 1);
        flash(this, POWER_COLOR[k], 120, 0.16);
        break;
      }
      case 'powerEnd': {
        this.sfx('pwEnd', { volume: 0.4 });
        const p = this.at(1.9);
        popWord(this, p.x, p.y, t('pwEnd', { name: t('pw_' + ev.kind) }), '#c8cce0', 22);
        break;
      }
      case 'leanWarn':
        this.sfx('lean', { volume: 0.5 });
        if (!this.meta.seen.includes('lean')) this.queueHint('lean');
        break;
      case 'derail':
        this.slowT = 0.9; this.slowK = 0.3;
        this.flashT = 0.6;
        this.sfx('crash', { volume: 0.8 });
        this.sfx('derail', { volume: 0.6 });
        this.sfx('wheee', { volume: 0.6, rate: 1.4 });
        this.cameras.main.shake(320, 0.012);
        this.banners.show(t('derailed'), { color: '#ff5a4f', size: 62, hold: 1.2, sub: ev.hearts > 0 ? t('derailSub') : '' }, 3);
        break;
      case 'saved':
        this.sfx('saved', { volume: 0.7 });
        this.banners.show(t('safetySaved'), { color: '#7fe0ff', size: 50, hold: 1, sub: t('safetySavedSub') }, 2);
        this.slowT = 0.35; this.slowK = 0.45;
        break;
      case 'respawn': this.sfx('respawn', { volume: 0.5 }); this.view.snapCamera(); break;
      case 'stall':
        this.sfx('stall', { volume: 0.6 });
        this.banners.show(t('stalled'), { color: '#ffb24a', size: 50, hold: 0.9, sub: t('stalledSub') }, 2);
        break;
      case 'launch':
        this.sfx('launch', { volume: 0.6 });
        popWord(this, W / 2, 620, t('launch'), '#7fe0ff', 34);
        break;
      case 'boost': this.sfx('boost', { volume: 0.5 }); break;
      case 'brakeHarsh': {
        const p = this.at(1.6);
        popWord(this, p.x, p.y, t('harsh'), '#ff9a6a', 24);
        break;
      }
      case 'stationNear':
        this.sfx('hint', { volume: 0.4 });
        this.banners.show(t('stationAhead'), { color: '#7dffa0', size: 40, hold: 1, sub: t(this.pad ? 'stationSubTouch' : 'stationSubKeys') }, 1);
        break;
      case 'stop': {
        const word = t('stop_' + ev.quality);
        this.sfx(ev.quality === 'perfect' ? 'perfect' : 'good', { volume: 0.6, exact: true });
        this.sfx('cheer', { volume: 0.55 });
        if (ev.fare > 0) this.time.delayedCall(350, () => this.sfx('fare', { volume: 0.5 }));
        this.banners.show(word, { color: ev.quality === 'perfect' ? '#ffd23f' : '#7dffa0', size: 56, hold: 1.4, sub: t('fareLine', { off: ev.off, on: ev.on, fare: ev.fare }) }, 2);
        this.time.delayedCall(500, () => popWord(this, W / 2, 620, '+' + fmt(ev.pts * (golden ? 1 : 1)), '#ffffff', 32));
        burst(this, W / 2, 470, [0xffd23f, 0x7dffa0, 0xff8ae6, 0x7fe0ff], 34, 420);
        this.tutorialEvent('station');
        break;
      }
      case 'boarded': this.sfx('depart', { volume: 0.5 }); break;
      case 'missed':
        this.sfx('missed', { volume: 0.6 });
        this.banners.show(t('missedStation'), { color: '#ff9a6a', size: 44, hold: 1.1, sub: t('missedSub') }, 2);
        break;
      case 'area':
        this.areaBanner(ev.n);
        this.sfx('area', { volume: 0.6, exact: true });
        this.hud.setLevel(ev.n + 1);
        break;
      case 'forkNear':
        this.sfx('hint', { volume: 0.5 });
        if (!this.meta.seen.includes('fork')) this.queueHint('fork');
        break;
      case 'fork': {
        const p = this.at(1.6);
        popWord(this, p.x, p.y, t(ev.thrill ? 'thrillRide' : 'safeRide'), ev.thrill ? '#ff9ad8' : '#9fe8ff', 30);
        this.sfx('tick', { volume: 0.5 });
        break;
      }
      case 'splash': break;
      case 'over': break;
    }
  }

  private areaBanner(n: number): void {
    const a = areaOf(n);
    const lap = lapOf(n);
    this.banners.show(t('a_' + a.id), { size: 52, color: '#ffffff', hold: 1.6, sub: t('areaN', { n: n + 1 }) + (lap ? '  ·  ' + t('lapN', { n: lap + 1 }) : '') + '  ·  ' + t('style_' + a.style), subColor: '#ffd23f' }, 2, 'area');
    if (a.id === 'river' || a.id === 'rooftops' || a.id === 'splash' || a.id === 'market' || a.id === 'windmill') {
      if (!this.meta.seen.includes('style_' + a.style)) this.queueHint('style_' + a.style);
    }
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(dt: number): void {
    const sim = this.sim;
    const sc = Math.round(sim.score);
    if (sc !== this.score) this.setScore(sc);
    if (sim.tokens !== this.lastTokens) {
      if (this.lastTokens >= 0) this.tweens.add({ targets: this.hud.rightChip, scale: 1.15, duration: 90, yoyo: true });
      this.lastTokens = sim.tokens;
      this.hud.setRight(fmt(sim.tokens), TOKEN_ICON);
    }
    if (sim.hearts !== this.lastHearts) { this.lastHearts = sim.hearts; this.hud.setLives(Math.max(0, sim.hearts), sim.maxHearts); }
    const hp = Math.round(sim.happy);
    if (hp !== this.lastHappy) {
      if (this.lastHappy >= 0 && hp < this.lastHappy - 4) this.tweens.add({ targets: this.happyChip, scale: 1.15, duration: 100, yoyo: true });
      this.lastHappy = hp;
      this.happyChip.setText(hp + '%');
      this.happyChip.setIcon(happyKey(Math.min(4, Math.floor(hp / 20))));
      this.happyChip.setTextColor(hp < 25 ? '#ff7a6a' : hp < 45 ? '#ffd23f' : '#ffffff');
    }
    const seats = `${sim.riders}/${sim.seats}`;
    if (seats !== this.lastSeats) { this.lastSeats = seats; this.seatChip.setText(seats); }
    const b = sim.band;
    this.speed.set(Math.abs(sim.v) * KMH, b.min * KMH, b.max * KMH, sim.lean, this.elapsed);
    // the junction's arrows
    const forkOn = !!sim.fork && sim.fork.s - sim.s < 34 && sim.state === 'ride';
    if (forkOn !== this.forkWas || (forkOn && this.forkSide !== sim.choice)) {
      this.forkWas = forkOn;
      this.forkSide = sim.choice;
      if (forkOn) {
        const f = sim.fork!;
        const ltKey = f.thrillSide > 0 ? 'thrill' : 'safe', rtKey = f.thrillSide < 0 ? 'thrill' : 'safe';
        this.pad?.setFork(true, sim.choice, t(ltKey), t(rtKey));
        this.forkCard(true, sim.choice, ltKey, rtKey);
      } else { this.pad?.setFork(false); this.forkCard(false, 0, '', ''); }
    }
    // power-ups as chips with rings
    const shown: PowerShown[] = [];
    for (const k of POWERS) {
      const v = sim.power[k];
      if (v <= 0) continue;
      shown.push(k === 'safety' ? { id: k, icon: POWER_ICON(k), color: POWER_COLOR[k], k: 1, left: 99 } : { id: k, icon: POWER_ICON(k), color: POWER_COLOR[k], k: v / sim.powerMax[k], left: v });
    }
    this.powerBar.update(shown, this.elapsed);
    if (this.flashT > 0) this.flashT -= dt;
  }

  /** On keyboards the junction shows as a card naming the two branches (← and →): two tickets painted in Boot (shop.ts). */
  private forkLabel: Phaser.GameObjects.Container | null = null;
  private forkCard(on: boolean, chosen: number, ltKey: string, rtKey: string): void {
    this.forkLabel?.destroy();
    this.forkLabel = null;
    if (!on || this.pad) return;
    const W = this.scale.width;
    const c = this.add.container(W / 2, 760).setScrollFactor(0).setDepth(UI_DEPTH + 20);
    forkTickets(this, c, chosen, ltKey, rtKey);
    this.forkLabel = c;
  }

  private updateFx(dt: number): void {
    const sim = this.sim;
    const want = sim.state === 'derail' ? 0.75 : sim.lean > 0.85 ? 0.35 * clamp((sim.lean - 0.85) / 0.25, 0, 1) : 0;
    this.vignette.setAlpha(this.vignette.alpha + clamp(want - this.vignette.alpha, -dt * 2, dt * 3));
    this.vignette.setTint(sim.state === 'derail' ? 0x000000 : 0xff2020);
    const w = sim.power.slowmo > 0 ? 0.5 + 0.1 * Math.sin(this.elapsed * 3) : 0;
    this.tint.setAlpha(this.tint.alpha + clamp(w - this.tint.alpha, -dt * 2, dt * 2));
  }

  private queueHint(id: string): void {
    if (this.meta.seen.includes(id) || this.hintQueue.includes(id)) return;
    this.hintQueue.push(id);
  }

  /** The first time each power-up turns up ahead (and the first loop or junction), a hint. */
  private updateHints(): void {
    const sim = this.sim, seen = this.meta.seen;
    if (this.isOver) return;
    const sec = sim.sectionAt(sim.s);
    for (const p of sec.pickups) {
      if (p.taken || !isPower(p.kind) || p.s < sim.s || p.s > sim.s + 40) continue;
      this.queueHint(p.kind);
    }
    for (const f of sec.features) if (f.kind === 'loop' && f.s0 > sim.s && f.s0 - sim.s < 30) this.queueHint('loop');
    if (this.finished || !this.hintQueue.length || this.tut || !this.meta.tutorial || this.elapsed < 1.5 || (this.hint && this.hint.c.active)) return;
    const k = this.hintQueue.shift()!;
    if (!seen.includes(k)) { seen.push(k); saveMeta(this.meta); }
    const icon = isPower(k) ? POWER_ICON(k as Power) : k === 'loop' || k === 'lean' ? happyKey(k === 'lean' ? 1 : 4) : TOKEN_ICON;
    const head = isPower(k) ? t('hintHead', { name: t('pw_' + k) }) : t('hh_' + k);
    const body = t('hint_' + k + (k === 'fork' ? (this.pad ? 'Touch' : 'Keys') : ''));
    this.hint = new HintCard(this, 300, icon, head, body);
    this.sfx('hint', { volume: 0.5 });
  }

  private updateSound(dt: number): void {
    const sim = this.sim, L = this.loops;
    if (!L) return;
    const v = Math.abs(sim.v);
    const riding = sim.state === 'ride' && !this.isOver;
    L.roll.set(riding ? clamp(v / 12, 0, 1) * 0.5 : 0, 0.6 + v * 0.05, dt, 8);
    L.wind.set(riding ? clamp((v - 6) / 10, 0, 0.45) : 0, 0.8 + v * 0.03, dt, 6);
    L.chain.set(riding && sim.onLift && sim.powerOn ? 0.4 : 0, 0.8 + v * 0.1, dt, 12);
    // a squeal when the brakes bite at speed
    if (sim.braking && v > 6) { this.brakeT += dt; if (this.brakeT > 0 && this.brakeT < dt * 1.5) this.sfx('brake', { volume: 0.4 }); }
    else this.brakeT = 0;
    this.wheeT = Math.max(0, this.wheeT - dt);
  }

  /** Speed lines on the screen's edges at speed and in the turbo; red edges after a derail. */
  private drawLines(): void {
    const g = this.lines.clear();
    const sim = this.sim;
    const { width: W, height: H } = this.scale;
    const v = Math.abs(sim.v);
    const k = sim.power.turbo > 0 ? 1 : clamp((v - 9) / 6, 0, 1) * (this.view.rideCam ? 1 : 0.8);
    if (k > 0 && sim.state === 'ride') {
      const col = sim.power.turbo > 0 ? 0xffb070 : 0xffffff;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + Math.sin(this.elapsed * 3 + i * 7) * 0.1;
        const ph = (this.elapsed * (2.5 + v * 0.12) + i * 0.37) % 1;
        const r0 = 360 + ph * 240, r1 = r0 + 90 + k * 170;
        g.lineStyle(2 + k * 3, col, 0.28 * k * (1 - ph));
        g.lineBetween(W / 2 + Math.cos(a) * r0, H * 0.46 + Math.sin(a) * r0 * 1.6, W / 2 + Math.cos(a) * r1, H * 0.46 + Math.sin(a) * r1 * 1.6);
      }
    }
    if (this.flashT > 0) for (let i = 0; i < 5; i++) g.lineStyle(18, 0xff2a2a, this.flashT * 0.6 * (1 - i / 5)).strokeRect(i * 16, i * 16, W - i * 32, H - i * 32);
  }

  // ------------------------------------------------------------------ the first-ride tutorial

  private startTutorial(): void {
    // (never over the run's summary: the delayed start can land after a quick end on a slow device)
    if (this.isOver || this.finished || this.tut || this.bot || this.meta.tutorial) return;
    if (this.hint?.c.active) this.hint.c.destroy();
    this.tut = new TutorialCard(this, 290, t('tut_skip'), () => this.endTutorial(true));
    this.tutStep = 0;
    this.showLesson();
  }

  private showLesson(): void {
    if (!this.tut) return;
    const id = TUT[this.tutStep];
    this.tut.set(t('tut_head', { n: this.tutStep + 1 }), t(`tut_${id}_${this.pad ? 'touch' : 'keys'}`));
    this.tutWait = -1;
    this.coastT = 0;
  }

  private tutorialEvent(kind: 'crest' | 'station'): void {
    if (!this.tut || this.tutWait >= 0) return;
    const id: Lesson = TUT[this.tutStep];
    if ((id === 'lift' && kind === 'crest') || (id === 'station' && kind === 'station')) this.lessonDone();
  }

  private lessonDone(): void {
    if (!this.tut) return;
    this.tut.done();
    this.sfx('good', { volume: 0.5, exact: true });
    popWord(this, this.scale.width / 2, 400, t('tut_nice'), '#7dffa0', 36);
    this.tutStep++;
    this.tutWait = 1.1;
  }

  /** While a lesson waits for its move and the moment is close, time slows right down. */
  private tutHold(): boolean {
    if (!this.tut || this.tutWait >= 0) return false;
    const sim = this.sim, id = TUT[this.tutStep];
    if (id === 'brake') {
      // slow down before the first corner the train is too fast for
      for (let d = 2; d < 14; d += 1) { const lim = sim.limitAt(sim.s + d); if (isFinite(lim) && Math.abs(sim.v) > lim * 0.95) return true; }
    }
    if (id === 'station') { const st = sim.nextStation(); return !!st && st.stop - sim.s < 14 && st.stop - sim.s > 2 && Math.abs(sim.v) > 4; }
    return false;
  }

  private updateTutorial(dt: number): void {
    if (!this.tut) return;
    if (this.tutWait >= 0) {
      this.tutWait -= dt;
      if (this.tutWait < 0) {
        if (this.tutStep >= TUT.length) this.endTutorial(false);
        else this.showLesson();
      }
      return;
    }
    const sim = this.sim, id = TUT[this.tutStep], inp = this.readInput();
    if (id === 'coast') {
      if (!inp.power && Math.abs(sim.v) > 5 && !sim.onLift) this.coastT += dt;
      if (this.coastT > 1.2) this.lessonDone();
    }
    if (id === 'brake' && inp.brake && Math.abs(sim.v) > 2) {
      for (let d = 0; d < 18; d += 1) if (isFinite(sim.limitAt(sim.s + d))) { this.lessonDone(); break; }
    }
  }

  private endTutorial(skipped: boolean): void {
    const c = this.tut;
    if (!c) return;
    this.tut = null;
    c.destroy();
    this.meta.tutorial = true;
    saveMeta(this.meta);
    if (!skipped) {
      this.banners.show(t('tut_done'), { color: '#7dffa0', size: 50, hold: 1.1, sub: t('tut_doneSub'), subColor: '#ffd23f' }, 2);
      this.sfx('area', { volume: 0.5, exact: true });
    } else this.sfx('tick', { volume: 0.4 });
  }

  // ------------------------------------------------------------------ the end

  private banked = false;

  private bank(): void {
    if (this.banked) return;
    this.banked = true;
    lastRunTokens = this.sim.tokens;
    const m = this.meta;
    m.tokens += this.sim.tokens;
    m.runs++;
    m.best = Math.max(m.best, this.sim.area + 1);
    saveMeta(m);
  }

  /** The ride's summary over the park, then the result screen. */
  private finish(): void {
    this.finished = true;
    this.bank();
    this.summaryT = 0;
    this.banners.clear();
    this.pad?.setVisible(false);
    this.endTutorial(true);
    // the summary stands alone: no lesson card, skip button or hint card over it
    this.hint?.c.destroy(); this.hint = null; this.hintQueue.length = 0;
    const sim = this.sim;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 640).setScrollFactor(0).setDepth(UI_DEPTH + 150);
    const rows: [string, string][] = [
      [t('sumArea'), `${sim.area + 1} · ${t('a_' + areaOf(sim.area).id)}`],
      [t('sumStations'), `${sim.stats.stations}  (${t('sumPerfect', { n: sim.stats.perfect })})`],
      [t('sumRiders'), fmt(sim.stats.riders)],
      [t('sumAir'), (Math.round(sim.stats.airtime * 10) / 10).toString().replace('.', getLang() === 'tr' ? ',' : '.') + ' s'],
      [t('sumLoops'), String(sim.stats.loops)],
      [t('sumTop'), Math.round(sim.stats.topSpeed * KMH) + ' ' + t('kmh')],
      [t('sumTokens'), '+' + fmt(sim.tokens)],
    ];
    const H = 200 + rows.length * 44;
    // the menu theme's marquee (menu.ts), painted under the Ayvago intro
    c.add(themeCard(this, 0, 0, SUMMARY_W, SUMMARY_H));
    const head = themeLabel(this, 0, -H / 2 + 52, t('rideOver'), overlayHeadingStyle(false));
    head.setScale(Math.min(56 / 84, (SUMMARY_W - 90) / head.width));
    c.add(head);
    c.add(txt(this, 0, -H / 2 + 100, t(sim.overReason === 'refund' ? 'reasonRefund' : 'reasonDerail'), { size: 23, color: '#8a1a22', strokeThickness: 0, shadow: false, wrap: 530 }));
    rows.forEach(([k, v], i) => {
      const y = -H / 2 + 152 + i * 44;
      c.add(txt(this, -250, y, k, { size: 24, color: '#6a4030', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      c.add(labelAt(this, 250, y, v, SUM_VALUE, 1));
    });
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2700, duration: 300 });
    void AREAS;
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    if (!this.isOver && !this.finished) { this.finished = true; this.bank(); }
    this.loops?.roll.set(0, 1, 1);
    this.loops?.wind.set(0, 1, 1);
    this.loops?.chain.set(0, 1, 1);
    super.endGame(o);
  }

  /** A rewarded continue (ads.continue): another train, calmer riders, back before the trouble. */
  revive(): void {
    this.sim.revive();
    this.finished = false;
    this.summaryT = -1;
    this.banked = false;
    // the ride's tokens were banked at its end: count again from zero so nothing pays twice
    this.sim.tokens = 0;
    this.pad?.setVisible(true);
    this.view.snapCamera();
    this.hud.setLives(this.sim.hearts, this.sim.maxHearts);
  }

  // ------------------------------------------------------------------ test hooks

  /** The Easy / Normal tuning in use (test hook, §7c). */
  get tune(): Sim['tune'] { return this.sim.tune; }

  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void {
    this.bot = on ? new Bot(this.sim, SKILL[skill], 11) : null;
    if (on) { this.forced = null; this.endTutorial(true); }
  }
  /** Test hook: the autopilot drives but the tutorial stays open (screenshots of the lessons). */
  testDrive(skill: 'good' | 'casual' = 'good'): void { this.bot = new Bot(this.sim, SKILL[skill], 11); this.forced = null; }
  /** Test hook: the tutorial's state. */
  testTut(): { open: boolean; step: number; waiting: boolean } { return { open: !!this.tut, step: this.tutStep, waiting: this.tutWait >= 0 }; }
  testInput(inp: Partial<Input> | null): void { this.bot = null; this.forced = inp ? { ...NO_INPUT, ...inp } : null; }
  testTutorial(open: boolean): void {
    if (open) { this.endTutorial(true); this.meta.tutorial = false; this.startTutorial(); } else { this.endTutorial(true); this.meta.tutorial = true; saveMeta(this.meta); }
  }
  testCam(yaw: number, dist: number, h: number, at = 0.3, lookUp = 0): void { this.view.debugCam = dist > 0 ? { yaw, dist, h, at, lookUp } : null; }
  testRideCam(on: boolean): void { this.view.rideCam = on; }
  testPower(k: Power): void { this.sim.grant(k); }
  /** Steps the ride by `ms` at once (bot or forced input), then draws it. */
  testAdvance(ms: number): void {
    this.testSpeed = 0;
    const n = Math.max(1, Math.round(ms / (STEP * 1000)));
    for (let i = 0; i < n; i++) {
      this.sim.step(STEP, this.readInput());
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
      if (this.sim.over) break;
    }
    this.view.sync(this.sim, ms / 1000, ms / 1000);
    this.updateHud(ms / 1000);
    this.updateTutorial(ms / 1000);
    this.banners.update();
  }
  /** Runs the autopilot (stepped, not drawn) until `fn(sim)` holds or `seconds` pass. */
  testUntil(src: string, seconds = 120): boolean {
    const fn = new Function('sim', 'return (' + src + ');') as (sim: Sim) => boolean;
    for (let i = 0; i < seconds * 60; i++) {
      this.sim.step(STEP, this.readInput());
      for (const ev of this.sim.events) this.view.handle(ev, this.sim);
      this.sim.events.length = 0;
      if (fn(this.sim)) { this.view.snapCamera(); this.view.sync(this.sim, 0.016, 0.016); return true; }
      if (this.sim.over) return false;
    }
    return false;
  }
  /** Jumps the train to a feature of `kind` ahead (`before` units before it) at speed `v`. */
  testFind(kind: string, before = 6, v = -1): boolean {
    for (let k = 0; k < 8; k++) {
      for (const sec of [...this.sim.route, ...(this.sim.fork ? [this.sim.choice > 0 ? this.sim.fork.left : this.sim.fork.right] : [])]) {
        const f = sec.features.find((q) => q.kind === kind && q.s0 > this.sim.s + 2);
        if (f) {
          this.sim.place(f.s0 - before, v >= 0 ? v : Math.abs(this.sim.v));
          this.view.snapCamera();
          this.view.sync(this.sim, 0.016, 0.016);
          return true;
        }
      }
      // not built yet: ride on (stepped) to the next area
      this.testUntil('sim.fork === null || sim.s > sim.fork.s - 5', 400);
      this.sim.place(this.sim.routeEnd - 40, 4);
    }
    return false;
  }
  /** Moves the ride to area `n` (the start of its main section). */
  testArea(n: number): void {
    for (let k = 0; k < 20 && this.sim.course.built <= n + 1; k++) {
      const f = this.sim.fork;
      if (f) this.sim.place(f.s + 1, 4); else break;
    }
    const sec = this.sim.course.sections.find((q) => q.area === n && q.part === 0);
    if (sec) { this.sim.place(sec.s0 + 6, 3); this.view.snapCamera(); this.view.sync(this.sim, 0.016, 0.016); }
  }
  /** Test hook: clears banners and words off the screen (store art of a frozen moment). */
  testClearUi(): void {
    for (const o of [...this.children.list]) {
      const d = (o as unknown as { depth: number }).depth;
      if (d >= UI_DEPTH + 29 && d < UI_DEPTH + 100) { this.tweens.killTweensOf(o); o.destroy(); }
    }
  }
}
