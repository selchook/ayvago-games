// Monster Roundup: the play scene. A run starts on the station map; each level cleared adds to the run's
// score, its credits go to the purse at once and the hangar opens between levels. The run ends when
// the hull is lost (a rewarded ad may bring the mech back once, where it fell, with full hearts),
// when the player ends it on the map, or when the last level is done.
//   map → (GO) intro swoop over the level down to the mech → play → all banked (or the exit) → card →
//   hangar → map
// The sim runs at a fixed 60 Hz (sim.ts); the view draws it (view.ts); the HUD and the touch pad are
// hud.ts, the inner screens screens.ts. Keyboard: WASD / arrows walk, Shift (or L) sprints, Space (J,
// Z) stuns (hold to charge), E (X, K) tows and drops, Q (C) uses the power. Touch: the floating stick
// on the left, STUN, TOW / DROP, POWER and DASH on the right.
import Phaser from 'phaser';
import { ArcadeScene, Controls, t, isEasy, isLandscape, flash, padRumble, playMusic, labelAt, labelTexture, fitWidth, type LabelStyle } from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Sim, NO_INPUT, type Input, type SimEvent } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT, sectorIndex, sectorOf } from './levels';
import { DT, SCORE, CLEAR_CREDITS, STAR_CREDITS, POWER_COLOR, SECTORS, MONSTERS, BOSSES, type PowerId } from './defs';
import { loadMeta, saveMeta, type Meta } from './meta';
import { MapScreen, SummaryScreen, ShopScreen, type Panel, type ScreenHost } from './screens';
import { PlayHud, TouchPad, S_BANNER, S_BIG, S_SUBBANNER, S_TOAST, S_WARN, S_GOOD, S_POWER, S_HINT, S_BOSS, levelLabel, bossName, splitLine } from './hud';
import { makeArt } from './art';

type Phase = 'map' | 'intro' | 'play' | 'clear' | 'summary' | 'shop' | 'dead' | 'end';

const INTRO_TIME = 2.3;
const MUSIC = ['stage1', 'level1', 'level3', 'stage2'] as const;

/** Credits the current (or last) run earned: the 2× reward is offered only when there are some. */
let runCreditsNow = 0;
export const lastRunCredits = (): number => runCreditsNow;

export class PlayScene extends ArcadeScene {
  phase: Phase = 'map';
  meta!: Meta;
  view!: View;
  /** The level's 3D world (also found by the GPU memory check). */
  world!: World3D;
  sim: Sim | null = null;
  levelN = 1;
  private controls!: Controls;
  private pad: TouchPad | null = null;
  private hudp!: PlayHud;
  private panel: Panel | null = null;
  private host!: ScreenHost;
  private touch = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private acc = 0;
  private phaseT = 0;
  private hitStop = 0;
  private bot: Bot | null = null;
  private revived = false;
  private banked = 0;
  private scored = 0;
  get runCredits(): number { return runCreditsNow; }
  set runCredits(n: number) { runCreditsNow = n; }
  private toastImg: Phaser.GameObjects.Container | null = null;
  private toastKey = '';
  private toastT = 0;
  private bannerImgs: Phaser.GameObjects.Image[] = [];
  private towPressed = false;
  private powerPressed = false;
  private tut: { step: number; t: number } | null = null;
  private lowWarned = false;
  testSpeed = 1;
  perf = { frames: 0, maxCalls: 0, maxTris: 0 };

  createGame(): void {
    this.meta = loadMeta();
    this.meta.runs++;
    saveMeta(this.meta);
    this.phase = 'map';
    this.sim = null;
    this.bot = null;
    this.panel = null;
    this.acc = 0;
    this.phaseT = 0;
    this.hitStop = 0;
    this.revived = false;
    this.banked = 0;
    this.scored = 0;
    this.runCredits = 0;
    this.toastImg = null;
    this.toastKey = '';
    this.toastT = 0;
    this.bannerImgs = [];
    this.towPressed = false;
    this.powerPressed = false;
    this.tut = null;
    this.lowWarned = false;
    this.testSpeed = 1;
    this.perf = { frames: 0, maxCalls: 0, maxTris: 0 };
    this.levelN = Math.min(this.meta.last, this.meta.unlocked, LEVEL_COUNT);
    this.touch = this.sys.game.device.input.touch;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this);
    this.world = this.view.world;
    // the core's floating stick on the left half (its own A/B buttons are not used: the pad has four)
    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'], buttonPos: { A: [-400, -400], B: [-400, -400] } });
    this.pad = null;
    if (this.controls.touchUi) {
      for (const o of [...this.children.list]) {
        const d = (o as unknown as { depth: number }).depth;
        if ((d === 9500 || d === 9501) && (o as unknown as { x: number }).x < 0) o.destroy();
      }
      this.pad = new TouchPad(this);
    }
    this.hudp = new PlayHud(this, this.hud, !!this.pad);
    const kb = this.input.keyboard;
    this.keys = {};
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const map: Record<string, number> = { space: K.SPACE, j: K.J, z: K.Z, x: K.X, e: K.E, k: K.K, q: K.Q, c: K.C, shift: K.SHIFT, l: K.L };
      for (const [n, c] of Object.entries(map)) this.keys[n] = kb.addKey(c, true, false);
      kb.on('keydown', (e: KeyboardEvent) => {
        if (this.panel && !this.panel.closed) { this.panel.key(e.code); return; }
        if (this.phase === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.phaseT = INTRO_TIME;
        if (this.phase !== 'play') return;
        if (e.code === 'KeyX' || e.code === 'KeyE' || e.code === 'KeyK') this.towPressed = true;
        if (e.code === 'KeyQ' || e.code === 'KeyC') this.powerPressed = true;
      });
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.dispose());
    this.showPlayUi(false);
    this.hooks();
    this.openMap();
  }

  // ---------------------------------------------------------------- the map, the hangar

  private showPlayUi(on: boolean): void {
    this.hudp.setVisible(on);
    this.pad?.setVisible(on);
  }

  openMap(): void {
    this.closePanel();
    this.phase = 'map';
    this.showPlayUi(false);
    this.preview(this.levelN);
    this.panel = new MapScreen(this, this.host, this.meta, this.levelN, this.score, {
      select: (n) => { if (n !== this.levelN || !this.sim) this.preview(n); this.levelN = n; this.meta.last = n; saveMeta(this.meta); },
      play: (n) => this.startLevel(n),
      shop: () => this.openShop(() => this.openMap()),
      endRun: () => this.endRun(),
    });
  }

  /** The chosen level under the map, with its monsters roaming. */
  private preview(n: number): void {
    this.levelN = n;
    this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy(), this.meta.mech);
    this.sim.god = true;
    this.view.build(this.sim);
    this.view.snap(this.sim);
    this.bot = null;
  }

  openShop(then: () => void): void {
    this.closePanel();
    this.phase = 'shop';
    this.showPlayUi(false);
    if (!this.sim) this.preview(this.levelN);
    this.panel = new ShopScreen(this, this.host, this.meta, (mech) => { if (mech) { this.view.setMech(this.meta.mech); this.sfx('hello', { volume: 0.4 }); } }, () => { this.panel = null; then(); });
  }

  private closePanel(): void { this.panel?.close(); this.panel = null; }

  private endRun(): void {
    this.closePanel();
    this.phase = 'end';
    this.endGame({ win: true, title: t('runDone'), delay: 150 });
  }

  // ---------------------------------------------------------------- a level

  startLevel(n: number): void {
    this.closePanel();
    this.levelN = n;
    this.meta.last = n;
    saveMeta(this.meta);
    this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy(), this.meta.mech, this.meta.runs);
    this.view.build(this.sim);
    this.view.snap(this.sim);
    this.view.warm();
    this.banked = 0;
    this.scored = 0;
    this.bot = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.acc = 0;
    this.lowWarned = false;
    this.showPlayUi(true);
    this.pad?.setVisible(false);
    this.clearBanners();
    const boss = this.sim.c.boss;
    if (boss) {
      this.banner(t('bossIn'), S_BOSS, 240, 1900);
      this.banner(bossName(boss.id), S_BANNER, 318, 1900, true);
      this.sfx('roar', { volume: 0.6 });
    } else {
      this.banner(t('l' + n), S_BANNER, 250, 1900);
      this.banner(levelLabel(n) + '  ·  ' + t('r_' + sectorOf(n)), S_SUBBANNER, 318, 1900, true);
      this.sfx('start', { volume: 0.5 });
    }
    playMusic(this, boss ? 'boss' : MUSIC[sectorIndex(n)]);
    this.tut = n === 1 && !this.meta.hints.includes('tut') ? { step: 0, t: 0 } : null;
  }

  private go(): void {
    this.phase = 'play';
    this.phaseT = 0;
    this.showPlayUi(true);
    this.banner(t('go'), S_BIG, 360, 600);
    this.sfx('go', { volume: 0.5 });
    const hint = this.sim?.c.hint;
    const key = hint ? 'h_' + hint : '';
    if (key && !this.meta.hints.includes(key)) {
      const n = this.levelN;
      this.time.delayedCall(this.tut ? 14000 : 1000, () => { if (this.phase === 'play' && this.levelN === n) this.toast(key, S_HINT, 5600); });
      this.meta.hints = [...new Set([...this.meta.hints, key])];
      saveMeta(this.meta);
    }
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = (delta / 1000) * this.testSpeed;
    this.perf.frames++;
    this.phaseT += dt;
    this.toastT = Math.max(0, this.toastT - dt);
    const s = this.sim;
    if (!s) return;
    if (this.phase === 'intro' && this.phaseT >= INTRO_TIME) this.go();
    if (this.phase === 'intro' && this.pad && (this.pad.pressed('stun') || this.pad.pressed('tow')) && this.phaseT > 0.3) this.phaseT = INTRO_TIME;
    if (this.hitStop > 0) this.hitStop -= dt;
    else if (this.phase !== 'map' && this.phase !== 'shop') {
      this.acc += Math.min(dt, 0.1 * this.testSpeed);
      let first = true;
      while (this.acc >= DT) {
        this.acc -= DT;
        const inp = this.phase === 'play' ? (this.bot ? this.bot.input() : this.readInput(first)) : NO_INPUT;
        first = false;
        s.step(DT, inp);
        this.handle(s.events, s);
        s.events.length = 0;
        if (this.hitStop > 0) { this.acc = 0; break; }
      }
    } else {
      // the map's backdrop: the level's monsters roam (the mech stands)
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= DT) { this.acc -= DT; s.step(DT, NO_INPUT); s.events.length = 0; }
    }
    if (this.phase === 'play' || this.phase === 'clear' || this.phase === 'dead') {
      const more = s.points - this.scored;
      if (more > 0) { this.addScore(more); this.scored = s.points; }
    }
    const mode = this.phase === 'map' ? 'preview' : this.phase === 'shop' ? 'hangar' : this.phase === 'intro' ? 'intro' : 'follow';
    this.view.sync(s, dt, { camera: mode, introT: this.phaseT / INTRO_TIME });
    if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'dead' || this.phase === 'clear') this.hudp.update(s, this.levelN, this.time.now, (x, y, z) => this.view.screen(x, y, z));
    if (this.pad) {
      const v = s.mech;
      this.pad.charge = v.charge > 0.1 ? Math.min(1, v.charge / s.chargeTime) : 0;
      const grab = s.mons.some((m) => m.state === 'dizzy' && Math.hypot(m.x - v.x, m.z - v.z) - m.radius < s.grabR);
      this.pad.frame(v.power, v.towing.length > 0 && !grab);
    }
    if (this.phase === 'play') {
      this.tutorial(dt);
      const st = this.view.stats();
      this.perf.maxCalls = Math.max(this.perf.maxCalls, st.calls);
      this.perf.maxTris = Math.max(this.perf.maxTris, st.triangles);
    }
    if (this.phase === 'clear' && this.phaseT > 2.4) this.finishLevel();
  }

  private readInput(first: boolean): Input {
    const c = this.controls, k = this.keys, p = this.pad;
    const down = (n: string) => !!k[n]?.isDown;
    const inp: Input = {
      mx: c.axisX,
      mz: c.axisY,
      stun: down('space') || down('j') || down('z') || !!p?.held('stun'),
      tow: false,
      power: false,
      dash: down('shift') || down('l') || !!p?.held('dash'),
    };
    if (first) {
      inp.tow = this.towPressed || !!p?.pressed('tow');
      inp.power = this.powerPressed || !!p?.pressed('power');
      this.towPressed = false;
      this.powerPressed = false;
    }
    return inp;
  }

  // ---------------------------------------------------------------- what happened

  private at(x: number, z: number): number { return this.view.screen(x, 1, z).x; }

  private handle(evs: SimEvent[], s: Sim): void {
    const fx = this.view.fx, v = s.mech, look = SECTORS[s.c.sector];
    for (const e of evs) {
      switch (e.e) {
        case 'shot':
          this.sfx(e.charged ? 'shotBig' : 'shot', { volume: e.charged ? 0.55 : 0.35 });
          fx.sparks(v.x + Math.sin(v.yaw) * 1.1, 1.5, v.z + Math.cos(v.yaw) * 1.1, e.charged ? 12 : 5, e.charged ? [0xffe060, 0xffffff] : [0x7ae8ff, 0xffffff], 3, 1.5, 0.07);
          if (e.charged) { this.view.shake(0.18); padRumble(60, 0.3); }
          break;
        case 'hit': {
          const m = s.mons[e.i];
          if (e.glance) { this.sfxAt('glance', this.at(e.x, e.z), { volume: 0.4 }); fx.sparks(e.x, e.y + 1, e.z, 6, [0xffffff, 0xaab8c8], 3, 2, 0.06); if (!m.boss) this.toast(this.pad ? 'glance' : 'glanceKey', S_WARN, 2000); break; }
          this.sfxAt(e.charged ? 'zapBig' : 'zap', this.at(e.x, e.z), { volume: 0.5 });
          fx.sparks(e.x, (m.y || 0) + m.height * 0.5, e.z, e.charged ? 18 : 10, [0x7ae8ff, 0xffffff, 0xffe060], 4, 3, 0.08);
          if (m.boss) this.view.shake(0.12);
          break;
        }
        case 'dizzy': {
          const m = s.mons[e.i];
          this.sfxAt(m.boss ? 'bossDizzy' : 'dizzy', this.at(e.x, e.z), { volume: 0.55 });
          fx.sparks(e.x, m.height, e.z, 16, [0xffe060, 0xffffff], 3, 4, 0.09);
          if (this.tut && this.tut.step < 3 && !m.boss) { this.tut.step = 3; this.toast(this.pad ? 'tut_tow' : 'tut_towKey', S_HINT, 3800); }
          if (m.boss) { this.banner(t('bossDizzy'), S_GOOD, 300, 2200); this.view.shake(0.5); }
          break;
        }
        case 'wake': {
          const m = s.mons[e.i];
          this.sfxAt('wake', this.at(e.x, e.z), { volume: 0.45 });
          if (m.boss) { this.toast('bossFree', S_WARN, 1800); this.view.shake(0.4); }
          else this.toast(e.free ? 'escaped' : 'woke', S_WARN, 1300);
          break;
        }
        case 'grab':
          this.sfx('grab', { volume: 0.55 });
          this.toast('grabbed', S_TOAST, 1100);
          fx.sparks(e.x, 1.2, e.z, 14, [look.glow, 0xffffff], 3, 3, 0.08);
          if (this.tut && this.tut.step < 4) { this.tut.step = 4; this.toast('tut_bank', S_HINT, 3600); }
          break;
        case 'drop': this.sfx('drop', { volume: 0.4 }); break;
        case 'full': this.toast('full', S_WARN, 1600); this.sfx('deny', { volume: 0.4 }); break;
        case 'heavy': this.toast('heavy', S_WARN, 1800); this.sfx('deny', { volume: 0.4 }); break;
        case 'capture': {
          this.sfx(e.boss ? 'fanfare' : 'capture', { volume: 0.65, exact: true });
          fx.confetti(e.x, 2.5, e.z, e.boss ? 120 : 34);
          fx.sparks(e.x, 2.8, e.z, 24, [look.glow, 0xffffff], 5, 6, 0.1);
          this.view.shake(e.boss ? 0.9 : 0.2);
          const p = this.view.screen(e.x, 3.5, e.z);
          this.popup(p.x, p.y, '+' + e.pts);
          if (e.combo > 1) { this.banner(t('combo', { n: e.combo }), S_POWER, 400, 700); this.sfx('combo', { volume: 0.5, exact: true }); }
          else this.toast('captured', S_GOOD, 900);
          padRumble(90, 0.4);
          break;
        }
        case 'split': this.sfxAt('split', this.at(e.x, e.z), { volume: 0.55 }); this.toast('split', S_TOAST, 1500); fx.dust(e.x, 0.3, e.z, 16, 0x6ad84a, 3, 2, 0.25); break;
        case 'blink': this.sfxAt('blink', this.at(e.fx, e.fz), { volume: 0.5 }); fx.sparks(e.fx, 1, e.fz, 16, [0xc07aff, 0xffffff], 3, 3, 0.09); fx.sparks(e.x, 1, e.z, 16, [0xc07aff, 0xffffff], 3, 3, 0.09); if (!s.mons[e.i].boss) this.toast('blinked', S_TOAST, 1200); break;
        case 'evolveWarn': this.toast('evolveWarn', S_WARN, 2200); this.sfx('warn', { volume: 0.4 }); break;
        case 'evolve': this.sfxAt('evolve', this.at(e.x, e.z), { volume: 0.65 }); this.toast('evolved', S_WARN, 1800); fx.sparks(e.x, 1.5, e.z, 36, [0xff9a2a, 0xffe060, 0xffffff], 5, 6, 0.12); fx.ring(e.x, 0.2, e.z, 24, 0xffb03a, 6, 0.25); this.view.shake(0.35); break;
        case 'eat': this.sfxAt('eat', this.at(e.x, e.z), { volume: 0.5 }); fx.sparks(e.x, 0.8, e.z, 10, [look.accent, 0xffffff], 2, 2, 0.07); break;
        case 'snack': this.sfx('snack', { volume: 0.5 }); fx.sparks(e.x, 0.9, e.z, 10, [look.accent, 0xffffff], 3, 3, 0.07); { const p = this.view.screen(e.x, 2, e.z); this.popup(p.x, p.y, '+' + SCORE.snack); } break;
        case 'hurt':
          this.sfx('hurt', { volume: 0.65 });
          this.view.shake(0.65);
          this.hitStop = 0.07;
          flash(this, 0xd83a1a);
          fx.sparks(e.x, 1.6, e.z, 16, [0xff5a3a, 0xffffff], 4, 3, 0.08);
          padRumble(150, 0.6);
          this.toast('hurt_' + e.by, S_WARN, 1100);
          if (v.hp === 1 && !this.lowWarned) { this.lowWarned = true; this.time.delayedCall(1200, () => { if (this.phase === 'play') { this.toast('lowHull', S_WARN, 1800); this.sfx('alarm', { volume: 0.45 }); } }); }
          break;
        case 'shielded': this.sfx('shieldHit', { volume: 0.55 }); this.toast('shielded', S_TOAST, 1000); fx.sparks(v.x, 1.6, v.z, 20, [0x4ab8ff, 0xffffff], 5, 3, 0.09); break;
        case 'squawk': this.sfxAt('squawk', this.at(e.x, e.z), { volume: 0.6 }); this.toast('squawk', S_TOAST, 1500); fx.ring(e.x, 1.2, e.z, 20, 0xffffff, 8, 0.15); break;
        case 'vent': this.sfxAt('vent', this.at(e.x, e.z), { volume: 0.4 }); fx.dust(e.x, 0.2, e.z, 10, 0x9aa4b4, 2.5, 2, 0.2); if (!e.out) this.toast('vent', S_TOAST, 1200); break;
        case 'tele': this.sfx('tele', { volume: 0.5 }); fx.sparks(e.x, 1, e.z, 18, [0x7ad8ff, 0xffffff], 3, 4, 0.09); fx.sparks(e.tx, 1, e.tz, 18, [0x7ad8ff, 0xffffff], 3, 4, 0.09); break;
        case 'door': if (Math.hypot(s.c.doors[e.i].x - v.x, s.c.doors[e.i].z - v.z) < 12) this.sfx(e.open ? 'doorOpen' : 'doorClose', { volume: 0.3 }); break;
        case 'unlock': this.sfx('unlock', { volume: 0.6, exact: true }); this.toast('unlocked', S_GOOD, 1600); fx.sparks(e.x, 2, e.z, 20, [0x5aff8a, 0xffffff], 3, 4, 0.08); break;
        case 'crate': this.sfxAt(e.broken ? 'crate' : 'thunk', this.at(e.x, e.z), { volume: 0.5 }); if (e.broken) { fx.blast(e.x, 0.3, e.z, false, 0xb8a888); this.view.shake(0.2); } break;
        case 'pickup': this.pickup(e.id, e.x, e.z); break;
        case 'handsFull': this.toast('handsFull', S_WARN, 1200); break;
        case 'use': this.usePower(e.id, s); break;
        case 'powerEnd': this.sfx('powerDown', { volume: 0.35 }); break;
        case 'freeze': this.sfx('freeze', { volume: 0.7 }); flash(this, 0x9af0ff); this.view.shake(0.4); fx.ring(e.x, 0.4, e.z, 50, 0x9af0ff, 20, 0.22); break;
        case 'attack': this.sfxAt('growl', this.at(e.x, e.z), { volume: 0.35 }); break;
        case 'bite': break;
        case 'bossWindup': this.sfx(e.attack === 'summon' ? 'roar' : 'windup', { volume: 0.45 }); break;
        case 'bossAttack': this.bossAttack(e.attack, e.x, e.z, s); break;
        case 'bossLand': this.sfx('slam', { volume: 0.8 }); this.view.shake(0.8); fx.blast(e.x, 0.2, e.z, true, look.dark); padRumble(200, 0.7); break;
        case 'bossThud': this.sfx('slam', { volume: 0.7 }); this.view.shake(0.7); this.toast('bossThud', S_GOOD, 1600); fx.blast(e.x, 1, e.z, false, look.dark); break;
        case 'bossDaze': this.sfx('bossDizzy', { volume: 0.6 }); this.toast('bossDazed', S_GOOD, 1800); break;
        case 'bossPhase': this.sfx('roar', { volume: 0.7 }); this.banner(t('bossPhase'), S_WARN, 300, 1500); this.view.shake(0.6); break;
        case 'bossDizzy': break;
        case 'summon': fx.sparks(e.x, 2, e.z, 30, [0xffe060, 0xffffff], 5, 5, 0.1); break;
        case 'lobLand': this.sfxAt('slam', this.at(e.x, e.z), { volume: 0.55 }); fx.blast(e.x, 0.2, e.z, false, e.kind === 'ice' ? 0xc8f0ff : 0xc07aff); this.view.shake(0.3); break;
        case 'exitOpen':
          if (s.captured < s.c.total) { this.banner(t('exitOpen'), S_BIG, 330, 1300); this.time.delayedCall(1200, () => { if (this.phase === 'play') this.toast('exitOpenSub', S_TOAST, 2600); }); this.sfx('exitOpen', { volume: 0.6, exact: true }); }
          break;
        case 'clear': this.clear(e.x, e.z, s); break;
        case 'die': this.die(); break;
      }
    }
  }

  private bossAttack(a: string, x: number, z: number, s: Sim): void {
    const fx = this.view.fx, look = SECTORS[s.c.sector];
    switch (a) {
      case 'slam': this.sfx('slam', { volume: 0.8 }); this.view.shake(0.7); fx.blast(x, 0.2, z, true, look.dark); padRumble(160, 0.6); break;
      case 'volley': case 'ring': this.sfx('volley', { volume: 0.55 }); break;
      case 'lob': this.sfx('lob', { volume: 0.5 }); break;
      case 'charge': this.sfx('charge', { volume: 0.6 }); break;
      case 'beam': this.sfx('beam', { volume: 0.6 }); break;
      case 'leap': this.sfx('leap', { volume: 0.55 }); break;
      case 'summon': this.sfx('summon', { volume: 0.6 }); break;
      case 'blink': this.sfx('blink', { volume: 0.55 }); break;
    }
  }

  private popup(x: number, y: number, text: string): void {
    const tx = this.add.text(x, y, text, { fontFamily: 'Righteous, Fredoka, Nunito, sans-serif', fontSize: '30px', color: '#c8fff4', stroke: '#101626', strokeThickness: 6 }).setOrigin(0.5).setScrollFactor(0).setDepth(9050);
    this.tweens.add({ targets: tx, y: y - 60, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => tx.destroy() });
  }

  private pickup(id: PowerId, x: number, z: number): void {
    this.sfx('power', { volume: 0.6 });
    this.view.fx.sparks(x, 1.6, z, 24, [POWER_COLOR[id], 0xffffff], 4, 4, 0.09);
    this.banner(t('p_' + id), S_POWER, 300, 1100);
    this.toast('pd_' + id + (this.pad ? '' : 'Key'), S_TOAST, 2400);
  }

  private usePower(id: PowerId, s: Sim): void {
    const v = s.mech, fx = this.view.fx;
    if (id !== 'freeze') this.sfx(id === 'shield' ? 'shield' : id === 'magnet' ? 'magnet' : 'powerUse', { volume: 0.6 });
    fx.sparks(v.x, 1.6, v.z, 18, [POWER_COLOR[id], 0xffffff], 4, 3, 0.09);
  }

  private die(): void {
    const s = this.sim!;
    this.phase = 'dead';
    this.sfx('lose', { volume: 0.6 });
    this.sfx('mechDown', { volume: 0.5 });
    this.view.shake(1);
    this.bank(s);
    this.showPlayUi(false);
    this.hudp.setVisible(true);
    this.banner(t('loseHull'), S_BANNER, 330, 1600);
    this.endGame({ title: t('loseHull'), delay: 1600 });
  }

  /** The level's credits go to the purse as soon as the run could end (none twice). */
  private bank(s: Sim): void {
    const more = s.stats.credits - this.banked;
    if (more > 0) { this.meta.credits += more; this.runCredits += more; this.banked = s.stats.credits; saveMeta(this.meta); }
  }

  private clear(x: number, z: number, s: Sim): void {
    this.phase = 'clear';
    this.phaseT = 0;
    this.showPlayUi(false);
    this.hudp.setVisible(true);
    this.sfx('fanfare', { volume: 0.6, exact: true });
    this.view.fx.confetti(x, 3, z, 90);
    this.banner(t('levelDone'), S_BIG, 330, 2100);
    padRumble(200, 0.5);
  }

  private finishLevel(): void {
    const s = this.sim!, n = this.levelN, st = s.stats;
    this.phase = 'summary';
    this.clearBanners();
    this.showPlayUi(false);
    const r = sectorIndex(n);
    const best = this.meta.best[n - 1];
    const stars = s.stars();
    const starsNow = stars.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
    const newStars = stars.map((on, i) => on && !((best.stars >> i) & 1));
    const timeBonus = Math.max(0, Math.round((s.c.par - st.time) * SCORE.parSecond));
    const unharmed = st.hurt === 0 ? SCORE.unharmed : 0;
    const starPts = stars.filter(Boolean).length * SCORE.star;
    const extra = timeBonus + unharmed + starPts + SCORE.clear + SCORE.perSector * r;
    this.addScore(extra);
    this.bank(s);
    const prize = CLEAR_CREDITS(r) + newStars.filter(Boolean).length * STAR_CREDITS;
    this.meta.credits += prize;
    this.runCredits += prize;
    const newBest = !best.time || st.time < best.time;
    best.stars |= starsNow;
    if (newBest) best.time = Math.round(st.time * 10) / 10;
    if (n >= this.meta.unlocked) this.meta.unlocked = Math.min(LEVEL_COUNT + 1, n + 1);
    if (n === 1) this.meta.hints = [...new Set([...this.meta.hints, 'tut'])];
    this.meta.last = Math.min(LEVEL_COUNT, n + 1);
    saveMeta(this.meta);
    this.panel = new SummaryScreen(this, this.host, {
      n, stars, newStars, credits: st.credits + prize, captured: `${s.captured}/${s.c.total}`, time: st.time, newBest, bonus: timeBonus, unharmed, combo: st.best,
      score: s.points + extra, boss: !!s.c.boss,
    }, () => {
      this.panel = null;
      if (n === LEVEL_COUNT) { this.phase = 'end'; this.endGame({ win: true, title: t('winAll'), delay: 200 }); return; }
      this.levelN = Math.min(LEVEL_COUNT, n + 1);
      this.openShop(() => this.openMap());
    });
  }

  // ---------------------------------------------------------------- the continue and the 2× reward

  /** A rewarded continue: full hearts where the mech fell, the monsters round it nudged away. */
  revive(): void {
    this.revived = true;
    if (this.phase !== 'dead' || !this.sim) return;
    this.sim.revive();
    this.phase = 'play';
    this.clearBanners();
    this.showPlayUi(true);
    this.view.snap(this.sim);
    this.bot?.reset();
    this.lowWarned = false;
  }

  /** Once per run. */
  canContinue(): boolean { return !this.revived; }

  /** The 2× reward: the run's credits once more (never the score). */
  doubleCredits(): void {
    this.meta.credits += this.runCredits;
    this.runCredits *= 2;
    saveMeta(this.meta);
  }

  // ---------------------------------------------------------------- banners, toasts, the tutorial

  /** Portrait has room above the mech; landscape keeps banners in the band above it. */
  private bannerY(y: number): number { return isLandscape() ? Math.round(y * 0.62) : y; }

  private banner(text: string, style: LabelStyle, y0: number, ms: number, fit = false): void {
    labelTexture(this, text, style);
    const y = this.bannerY(y0);
    const img = labelAt(this, this.scale.width / 2, y, text, style).setScrollFactor(0).setDepth(9100);
    fitWidth(img, fit ? 660 : this.scale.width - 60);
    const sc = img.scale;
    img.setScale(sc * 0.3);
    this.bannerImgs.push(img);
    this.tweens.add({ targets: img, scale: sc, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: y - 30, delay: ms, duration: 380, onComplete: () => { img.destroy(); this.bannerImgs = this.bannerImgs.filter((b) => b !== img); } });
  }

  private clearBanners(): void { for (const b of this.bannerImgs) { this.tweens.killTweensOf(b); b.destroy(); } this.bannerImgs = []; }

  toast(key: string, style: LabelStyle = S_TOAST, ms = 1300): void {
    if (key === this.toastKey && this.toastT > 0) return;
    this.toastKey = key; this.toastT = (ms / 1000) * 0.6;
    this.toastImg?.destroy();
    const land = isLandscape(), pad = !!this.pad;
    const y = land ? this.scale.height - (pad ? 380 : 110) : this.scale.height - (pad ? 470 : 170);
    const lines = splitLine(t(key));
    const box = this.add.container(this.scale.width / 2 - (land && pad ? 120 : 0), y).setScrollFactor(0).setDepth(9100);
    const lh = (style.size ?? 26) * 1.25;
    lines.forEach((line, i) => box.add(fitWidth(labelAt(this, 0, (i - (lines.length - 1) / 2) * lh, line, style), land ? (pad ? 640 : 900) : 670)));
    box.setScale(0.6);
    this.toastImg = box;
    this.tweens.add({ targets: box, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: box, alpha: 0, delay: ms, duration: 300, onComplete: () => { if (this.toastImg === box) this.toastImg = null; box.destroy(); } });
  }

  private tutorial(dt: number): void {
    const tu = this.tut;
    if (!tu) return;
    tu.t += dt;
    const key = !this.pad;
    if (tu.step === 0 && tu.t > 0.6) { this.toast(key ? 'tut_moveKey' : 'tut_move', S_HINT, 3600); tu.step = 1; tu.t = 0; }
    else if (tu.step === 1 && tu.t > 4.4) { this.toast(key ? 'tut_stunKey' : 'tut_stun', S_HINT, 4200); tu.step = 2; tu.t = 0; }
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__mr = {
      state: () => {
        const s = this.sim;
        const v = s?.mech;
        return {
          phase: this.phase, level: this.levelN, score: this.score, credits: this.meta.credits, unlocked: this.meta.unlocked, mechId: this.meta.mech,
          mech: v ? { x: v.x, z: v.z, yaw: v.yaw, hp: v.hp, max: v.max, state: v.state, energy: v.energy, emax: v.emax, towing: v.towing.length, power: v.power, charge: v.charge, sprint: v.sprint } : null,
          stats: s ? { ...s.stats } : null, captured: s?.captured ?? 0, total: s?.c.total ?? 0, quota: s?.c.quota ?? 0, exitOpen: s?.exitOpen ?? false,
          mons: s ? s.mons.filter((m) => m.state !== 'gone').map((m) => ({ i: m.i, kind: m.kind ?? m.boss, state: m.state, x: m.x, z: m.z, hp: m.hp, evolved: m.evolved, phase: m.phase, bar: m.bar })) : [],
          ranks: { ...this.meta.ranks }, tune: s ? { ...s.tune } : null, textures: this.textures.getTextureKeys().length,
          view: this.view.stats(), perf: { ...this.perf }, touchPad: !!this.pad,
        };
      },
      start: (n = 1) => { this.startLevel(n); this.phaseT = INTRO_TIME; },
      god: (on = true) => { if (this.sim) this.sim.god = on; },
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim) : null; },
      teleport: (x: number, z: number) => { const v = this.sim?.mech; if (v) { v.x = x; v.z = z; v.vx = v.vz = 0; this.view.snap(this.sim!); } },
      hurt: (n = 1) => { this.sim?.hurt(n, 'boss', this.sim.mech.x + 1, this.sim.mech.z, true); },
      give: (id: PowerId) => { const v = this.sim?.mech; if (v) v.power = id; },
      dizzy: () => { const s = this.sim; if (!s) return; for (const m of s.mons) if (!m.boss && s.loose(m)) { s.daze(m, 99, true); break; } },
      speed: (k: number) => { this.testSpeed = k; },
      open: (which: string) => this.openForShot(which),
      meta: (m: Partial<Meta>) => { Object.assign(this.meta, m); saveMeta(this.meta); },
      key: (code: string) => this.panel?.key(code),
      cam: (pos?: number[], look?: number[]) => { this.view.shotCam = pos && look ? [pos, look] : null; },
      stage: (n = 3, secs = 8) => this.stageShot(n, secs),
      card: () => this.cardStage(),
      play: this,
    };
  }

  private openForShot(which: string): void {
    this.closePanel();
    switch (which) {
      case 'map': this.openMap(); break;
      case 'shop': this.openShop(() => this.openMap()); break;
      case 'summary':
        this.phase = 'summary'; this.showPlayUi(false);
        this.panel = new SummaryScreen(this, this.host, { n: this.levelN, stars: [true, true, false], newStars: [false, true, false], credits: 64, captured: '5/5', time: 71.4, newBest: true, bonus: 360, unharmed: 400, combo: 3, score: 4280, boss: false }, () => { this.panel = null; });
        break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /**
   * The store art's card: Split Decision (1-3) frozen in a moment: the mech towing a dizzy monster
   * on its beam past a crate, a monster fleeing, another dizzy with stars, a stun bolt in flight,
   * a staged camera low beside the mech (closer and higher on a phone).
   */
  private cardStage(): void {
    this.meta.hints = [...new Set([...this.meta.hints, 'tut', 'h_split', 'h_tow'])];
    this.startLevel(3);
    this.phaseT = INTRO_TIME;
    this.go();
    this.clearBanners();
    this.time.removeAllEvents();
    this.toastImg?.destroy();
    const s = this.sim!, v = s.mech;
    s.god = true;
    // the mech in the first room, a monster on its beam, another dizzy, one fleeing
    const pod = s.c.pods[0];
    v.x = pod.x + 5.5; v.z = pod.z + 1.2; v.yaw = -Math.PI / 2 - 0.35;
    const ms = s.mons.filter((m) => !m.boss);
    const a = ms[0], b = ms[1] ?? ms[0], c = ms[2] ?? ms[0];
    a.state = 'towed'; a.dizzy = a.dizzyMax = 10; v.towing = [a];
    a.x = v.x + 2.6; a.z = v.z + 0.9; a.y = 0.9;
    b.state = 'dizzy'; b.dizzy = b.dizzyMax = 6; b.x = v.x - 1.5; b.z = v.z - 5.5;
    c.state = 'flee'; c.x = v.x + 6; c.z = v.z - 6.5; c.yaw = 0.8; c.vx = 2; c.vz = -1;
    s.bolts.push({ x: v.x + 2.2, z: v.z - 3.2, vx: 2, vz: -10, life: 1, charged: true, hit: [], arc: false });
    v.shootT = 0.3;
    this.testSpeed = 0.02;
    const land = this.scale.width > this.scale.height;
    const x = v.x, z = v.z;
    this.view.shotCam = land ? [[x + 1.5, 10.5, z + 13], [x + 0.8, 0.6, z - 1.8]] : [[x + 0.5, 13, z + 15], [x + 0.3, 0.4, z - 2.4]];
    this.pad?.setVisible(false);
    this.view.snap(s);
  }

  /** The store art's stage: the autopilot some seconds into a level. */
  private stageShot(n: number, secs: number): void {
    this.startLevel(n);
    this.phaseT = INTRO_TIME;
    this.go();
    const s = this.sim!;
    s.god = true;
    this.bot = new Bot(s);
    this.clearBanners();
    for (let i = 0; i < 60 * secs && s.mech.state === 'play'; i++) { s.step(DT, this.bot.input()); s.events.length = 0; }
    this.view.snap(s);
  }
}

export { MONSTERS, BOSSES };
