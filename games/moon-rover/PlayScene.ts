// Moon Rover: the play scene. A run starts on the mission map; each mission cleared adds to the
// run's score, its credits go to the purse at once and the hangar opens between missions. The run
// ends when the hearts run out (a rewarded ad may bring the rover back once, at the last checkpoint
// with a full battery), when the player ends it on the map, or when the last mission is done.
//   map → (DRIVE) intro swoop from the goal down to the rover → play → back at the base → card →
//   hangar → map
// The sim runs at a fixed 60 Hz (sim.ts); the view draws it (view.ts); the HUD is hud.ts, the inner
// screens screens.ts. Steering is the core's car steering (ARROWS | WHEEL | TILT on touch, ←/→ on
// the keyboard) with GAS, BRAKE and POWER under the right thumb.
import Phaser from 'phaser';
import { ArcadeScene, Controls, CarSteering, t, isEasy, isLandscape, showKeyHelp, flash, padRumble, labelAt, labelTexture, fitWidth, type LabelStyle, type CarPadButton, type KeyHelpHint } from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Sim, NO_INPUT, clearBonus, type Input, type SimEvent } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT, regionIndex, regionOf } from './levels';
import { DT, SCORE, CLEAR_CREDITS, STAR_CREDITS, POWER_COLOR, REGIONS, type PowerId } from './defs';
import { loadMeta, saveMeta, type Meta } from './meta';
import { MapScreen, SummaryScreen, ShopScreen, type Panel, type ScreenHost } from './screens';
import { PlayHud, S_BANNER, S_BIG, S_SUBBANNER, S_TOAST, S_WARN, S_GOOD, S_LAND, S_POWER, S_HINT, levelLabel, splitLine } from './hud';
import { ORANGE, TEAL, RED, GREEN } from './paint';
import { makeArt, ic } from './art';

type Phase = 'map' | 'intro' | 'play' | 'clear' | 'summary' | 'shop' | 'dead' | 'end';

const INTRO_TIME = 2.4;

/** Credits the current (or last) run earned: the 2× reward is offered only when there are some. */
let runCreditsNow = 0;
export const lastRunCredits = (): number => runCreditsNow;

/** The right-thumb buttons, per orientation (game units). */
function padButtons(W: number, H: number): CarPadButton[] {
  const land = W > H;
  const gas = land ? { x: W - 100, y: H - 154, w: 150, h: 220 } : { x: W - 92, y: H - 160, w: 140, h: 220 };
  const brake = land ? { x: W - 262, y: H - 110, w: 132, h: 132 } : { x: W - 246, y: H - 112, w: 124, h: 128 };
  const power = land ? { x: W - 262, y: H - 278, r: 62 } : { x: W - 246, y: H - 282, r: 62 };
  return [
    { id: 'gas', shape: 'pedal', ...gas, color: 0x2fae5a, label: t('gas'), labelY: -40, hit: { left: 8, top: 20, right: Infinity, bottom: Infinity } },
    { id: 'brake', shape: 'pedal', ...brake, color: 0xe8402f, label: t('brake'), labelY: -22, hit: { left: 24, top: 16, right: 8, bottom: Infinity } },
    { id: 'power', shape: 'round', ...power, color: 0x8a5ad8, label: t('power'), labelY: 40, labelSize: 20, hit: 14 },
  ];
}

export class PlayScene extends ArcadeScene {
  phase: Phase = 'map';
  meta!: Meta;
  view!: View;
  /** The level's 3D world (also found by the GPU memory check). */
  world!: World3D;
  sim: Sim | null = null;
  levelN = 1;
  private controls!: Controls;
  private steering!: CarSteering;
  private hudp!: PlayHud;
  private panel: Panel | null = null;
  private host!: ScreenHost;
  private touch = false;
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
  private powerIcon: Phaser.GameObjects.Image | null = null;
  private powerBtn = { x: 0, y: 0 };
  private powerPressed = false;
  private engine: Phaser.Sound.BaseSound | null = null;
  private tut: { step: number; t: number } | null = null;
  /** The first-time keys along the bottom (desktop, once): the drive goes on under them. */
  private keyHint: KeyHelpHint | null = null;
  private landT = 0;
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
    this.powerPressed = false;
    this.tut = null;
    this.keyHint = null;
    this.landT = 0;
    this.testSpeed = 1;
    this.perf = { frames: 0, maxCalls: 0, maxTris: 0 };
    this.levelN = Math.min(this.meta.last, this.meta.unlocked, LEVEL_COUNT);
    this.touch = this.sys.game.device.input.touch;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this);
    this.view.setSkin(this.meta.skin);
    this.world = this.view.world;
    this.controls = new Controls(this, {});
    const W = this.scale.width, H = this.scale.height;
    const buttons = padButtons(W, H);
    this.steering = new CarSteering(this, { touch: this.controls.touchUi, buttons, steer: isLandscape() ? undefined : { x: 186, y: H - 120 } });
    const pb = buttons.find((b) => b.id === 'power')!;
    this.powerBtn = { x: pb.x, y: pb.y };
    this.powerIcon = this.steering.pad ? this.add.image(pb.x, pb.y - 8, ic('p-boost')).setDisplaySize(64, 64).setScrollFactor(0).setDepth(9401).setVisible(false) : null;
    this.hudp = new PlayHud(this, this.hud, !!this.steering.pad);
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.panel && !this.panel.closed) { this.panel.key(e.code); return; }
      if (this.phase === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.phaseT = INTRO_TIME;
    });
    // the motor's hum
    this.engine = null;
    if (this.cache.audio.exists('engine')) {
      this.engine = this.sound.add('engine', { loop: true, volume: 0 });
      try { this.engine.play(); } catch { /* audio locked */ }
    }
    const onPause = () => this.engine?.pause();
    const onResume = () => this.engine?.resume();
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.engine?.stop();
      this.engine?.destroy();
      this.engine = null;
      this.view.dispose();
    });
    this.showPlayUi(false);
    this.hooks();
    this.openMap();
  }

  // ---------------------------------------------------------------- the map, the hangar

  private showPlayUi(on: boolean): void {
    this.hudp.setVisible(on);
    if (on) this.steering.begin(); else this.steering.end();
    this.powerIcon?.setVisible(false);
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

  /** The chosen mission's ground turning under the map. */
  private preview(n: number): void {
    this.levelN = n;
    this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy());
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
    this.panel = new ShopScreen(this, this.host, this.meta, (skin) => { if (skin) this.view.setSkin(this.meta.skin); }, () => { this.panel = null; then(); });
  }

  private closePanel(): void { this.panel?.close(); this.panel = null; }

  private endRun(): void {
    this.closePanel();
    this.phase = 'end';
    this.endGame({ win: true, title: t('runDone'), delay: 150 });
  }

  // ---------------------------------------------------------------- a mission

  startLevel(n: number): void {
    this.closePanel();
    this.levelN = n;
    this.meta.last = n;
    saveMeta(this.meta);
    this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy());
    this.view.setSkin(this.meta.skin);
    this.view.build(this.sim);
    this.view.snap(this.sim);
    this.view.warm();
    this.banked = 0;
    this.scored = 0;
    this.bot = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.acc = 0;
    this.showPlayUi(true);
    this.steering.end();
    this.clearBanners();
    const sp = this.sim.c.setpiece;
    if (sp) {
      this.banner(t('sp_' + sp), S_BANNER, 250, 1900);
      this.banner(t('sp_' + sp + 'Sub'), S_SUBBANNER, 318, 1900, true);
      this.sfx('sting', { volume: 0.6, exact: true });
    } else {
      this.banner(t('l' + n), S_BANNER, 250, 1900);
      this.banner(levelLabel(n) + '  ·  ' + t('r_' + regionOf(n)), S_SUBBANNER, 318, 1900, true);
      this.sfx('start', { volume: 0.5 });
    }
    this.tut = n === 1 && !this.meta.hints.includes('tut') ? { step: 0, t: 0 } : null;
    this.keyHint?.close();
    this.keyHint = null;
  }

  private go(): void {
    this.phase = 'play';
    this.phaseT = 0;
    this.showPlayUi(true);
    this.steering.centre();
    this.banner(t('go'), S_BIG, 360, 600);
    // desktop, once: the keys and what they do along the bottom for the first seconds of driving
    this.keyHint = showKeyHelp(this);
    this.sfx('go', { volume: 0.5 });
    const hint = this.sim?.c.hint;
    if (hint && !this.meta.hints.includes(hint)) {
      const n = this.levelN;
      this.time.delayedCall(this.tut ? 9000 : 900, () => { if (this.phase === 'play' && this.levelN === n) this.toast(hint, S_HINT, 5600, true); });
      this.meta.hints = [...new Set([...this.meta.hints, hint])];
      saveMeta(this.meta);
    }
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = (delta / 1000) * this.testSpeed;
    this.perf.frames++;
    this.phaseT += dt;
    this.toastT = Math.max(0, this.toastT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.steering.update(delta / 1000);
    this.readButtons();
    const s = this.sim;
    if (!s) return;
    if (this.phase === 'intro' && this.phaseT >= INTRO_TIME) this.go();
    let steer = 0;
    if (this.phase === 'play') steer = this.steering.steer(delta / 1000, this.controls.axisX);
    if (this.hitStop > 0) this.hitStop -= dt;
    else if (this.phase !== 'map' && this.phase !== 'shop') {
      this.acc += Math.min(dt, 0.1 * this.testSpeed);
      let first = true;
      while (this.acc >= DT) {
        this.acc -= DT;
        const inp = this.phase === 'play' ? (this.bot ? this.bot.input() : this.readInput(first, steer)) : NO_INPUT;
        first = false;
        s.step(DT, inp);
        this.handle(s.events, s);
        s.events.length = 0;
        if (this.hitStop > 0) { this.acc = 0; break; }
      }
    } else s.clock += dt;
    // the run's score follows the mission's points
    if (this.phase === 'play' || this.phase === 'clear' || this.phase === 'dead') {
      const more = s.points - this.scored;
      if (more > 0) { this.addScore(more); this.scored = s.points; }
    }
    const mode = this.phase === 'map' ? 'preview' : this.phase === 'shop' ? 'hangar' : this.phase === 'intro' ? 'intro' : 'follow';
    this.view.sync(s, dt, { camera: mode, introT: this.phaseT / INTRO_TIME });
    if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'dead' || this.phase === 'clear') this.hudp.update(s, this.levelN, this.time.now);
    if (this.phase === 'play') {
      this.padLook(s);
      this.tutorial(dt);
      const st = this.view.stats();
      this.perf.maxCalls = Math.max(this.perf.maxCalls, st.calls);
      this.perf.maxTris = Math.max(this.perf.maxTris, st.triangles);
    } else this.powerIcon?.setVisible(false);
    this.updateEngine(s);
    if (this.phase === 'clear' && this.phaseT > (s.launched ? 3.4 : 2.6)) this.finishLevel();
  }

  private readButtons(): void {
    if (this.steering.take('power')) this.powerPressed = true;
    if (this.controls.justA() || this.controls.justB()) this.powerPressed = true;
    if (this.phase === 'intro' && this.powerPressed && this.phaseT > 0.3) { this.phaseT = INTRO_TIME; this.powerPressed = false; }
    if (this.phase !== 'play') this.powerPressed = false;
  }

  private readInput(first: boolean, steer: number): Input {
    const c = this.controls;
    const inp: Input = {
      steer,
      gas: c.axisY < -0.3 || this.steering.isDown('gas'),
      brake: c.axisY > 0.3 || this.steering.isDown('brake'),
      power: first && this.powerPressed,
    };
    if (first) this.powerPressed = false;
    return inp;
  }

  /** The touch buttons: a little see-through at rest, solid while held; the carried power on POWER. */
  private padLook(s: Sim): void {
    const pad = this.steering.pad as unknown as { btns?: { id: string; root: Phaser.GameObjects.Container; down: boolean }[] } | null;
    if (!pad?.btns) return;
    const has = !!s.rover.power;
    for (const b of pad.btns) {
      if (b.id === 'left' || b.id === 'right') continue;
      const base = b.id === 'power' && !has ? 0.38 : 0.7;
      b.root.setAlpha(b.down ? 1 : base);
    }
    if (this.powerIcon) {
      this.powerIcon.setVisible(has);
      if (has) {
        const key = ic('p-' + s.rover.power);
        if (this.powerIcon.texture.key !== key) this.powerIcon.setTexture(key).setDisplaySize(64, 64);
        this.powerIcon.setPosition(this.powerBtn.x, this.powerBtn.y - 8 + Math.sin(this.time.now / 180) * 2);
      }
    }
  }

  private updateEngine(s: Sim): void {
    const e = this.engine as Phaser.Sound.WebAudioSound | null;
    if (!e) return;
    const v = s.rover;
    const live = this.phase === 'play' || this.phase === 'intro' || this.phase === 'clear';
    const k = Math.min(1.3, Math.abs(v.speed) / s.topSpeed);
    const rate = 0.6 + k * 0.7 + Math.abs(v.throttle) * 0.15 + (v.air ? 0.25 : 0) + (v.active.boost > 0 ? 0.25 : 0);
    try {
      e.setRate(rate);
      e.setVolume(live && v.state === 'drive' ? 0.05 + k * 0.06 + Math.abs(v.throttle) * 0.03 : 0);
    } catch { /* not started */ }
  }

  // ---------------------------------------------------------------- what happened

  private at(x: number, z: number, y = 1): number { return this.view.screen(x, y, z).x; }

  /** Volume falls off with distance from the rover. */
  private near(x: number, z: number, v: number): number {
    const r = this.sim!.rover;
    return v * Math.max(0, 1 - Math.hypot(x - r.x, z - r.z) / 50);
  }

  private handle(evs: SimEvent[], s: Sim): void {
    const fx = this.view.fx, v = s.rover, lk = REGIONS[s.c.region];
    for (const e of evs) {
      switch (e.e) {
        case 'crystal':
          this.sfx('crystal', { volume: 0.45 });
          fx.glint(e.x, e.y, e.z, lk.crystal, 14);
          break;
        case 'wave': this.sfxAt('hey', this.at(s.astronauts[e.i].x, s.astronauts[e.i].z), { volume: 0.35 }); break;
        case 'board':
          this.sfx('board', { volume: 0.55 });
          this.toast('boarded');
          fx.sparks(v.x, v.y + 2, v.z, 14, [0xffa040, 0xffffff], 3, 3, 0.08);
          break;
        case 'rescue':
          if (e.n > 0) { this.sfx('rescue', { volume: 0.6, exact: true }); this.toast('rescued', S_GOOD, 1500); fx.confetti(e.x, 2, e.z, 30); }
          break;
        case 'deliver':
          this.sfx('deliver', { volume: 0.6, exact: true });
          this.toast(e.left ? 'delivered' : s.c.generators.length && s.generators.some((g) => !g.off) ? 'delivered' : 'returnBase', S_GOOD, 1700);
          fx.sparks(e.x, 1.5, e.z, 26, [0x3ad8ff, 0xffffff, 0xffd040], 5, 5, 0.1);
          this.view.shake(0.15);
          break;
        case 'seatsFull': this.toast('seatsFull', S_WARN, 2600); this.sfx('deny', { volume: 0.4 }); break;
        case 'needCargo': this.toast('needCargo', S_WARN, 2200); this.sfx('deny', { volume: 0.4 }); break;
        case 'needGenerators': this.toast('needGen', S_WARN, 2200); this.sfx('deny', { volume: 0.4 }); break;
        case 'charge': this.sfx('charge', { volume: 0.45 }); if (v.battery < v.bmax * 0.9) this.toast('charging'); break;
        case 'charged': break;
        case 'checkpoint': this.sfx('checkpoint', { volume: 0.5 }); this.toast('checkpoint'); fx.sparks(e.x, 3, e.z, 16, [0x5aff9a, 0xffffff], 4, 3, 0.08); break;
        case 'takeoff': this.sfx('jump', { volume: 0.35 }); break;
        case 'land': this.landed(e, s); break;
        case 'bump':
          this.sfxAt('bump', this.at(e.x, e.z), { volume: Math.min(0.7, 0.2 + e.speed / 20) });
          fx.sparks(e.x, v.y + 1, e.z, Math.round(e.speed), [0xffd08a, 0xffffff], 3, 2, 0.07);
          fx.dust(e.x, v.y, e.z, 6, lk.rock, 2.4);
          this.view.shake(Math.min(0.5, e.speed / 22));
          if (e.speed > 8) padRumble(120, 0.5);
          break;
        case 'flip':
          this.sfx('crash', { volume: 0.65 });
          this.toast('flipped', S_WARN, 1500);
          fx.dust(e.x, v.y, e.z, 22, lk.rock, 4, 2, 0.35);
          fx.sparks(e.x, v.y + 1, e.z, 20, [0xffd08a, 0xffffff, 0xff8a3a], 5, 4, 0.09);
          this.view.shake(0.8);
          this.hitStop = 0.09;
          padRumble(220, 0.8);
          break;
        case 'fall': this.sfx('fall', { volume: 0.6 }); this.toast('fell', S_WARN, 1500); this.view.shake(0.3); break;
        case 'empty': this.sfx('powerDown', { volume: 0.6 }); this.toast('empty', S_WARN, 1800); break;
        case 'lowBattery': this.sfx('alarm', { volume: 0.4 }); this.toast('lowBattery', S_WARN, 2400); break;
        case 'tow': this.sfx('tow', { volume: 0.55 }); break;
        case 'respawn': this.view.snap(s); this.view.dropIn(); this.toast('towed'); this.sfx('respawn', { volume: 0.45 }); this.bot?.reset(); break;
        case 'hurt':
          if (e.by !== 'fall' && e.by !== 'battery' && e.by !== 'flip' && e.by !== 'time') {
            this.sfx('hurt', { volume: 0.6 });
            this.view.shake(0.7);
            this.hitStop = 0.08;
            flash(this, 0xd83a1a);
            fx.sparks(e.x, v.y + 1.2, e.z, 16, [0xff5a3a, 0xffffff], 4, 3, 0.08);
            padRumble(150, 0.6);
            if (e.by === 'bolt') this.toast('hurtBolt', S_WARN);
            else if (e.by === 'meteor') this.toast('hurtMeteor', S_WARN);
            else if (e.by === 'train') this.toast('hurtTrain', S_WARN);
            else if (e.by === 'miner') this.toast('minerHit', S_WARN);
          }
          break;
        case 'shielded': this.sfx('shieldHit', { volume: 0.55 }); this.toast('shielded'); fx.sparks(v.x, v.y + 1.2, v.z, 20, [0x4ab8ff, 0xffffff], 5, 3, 0.09); break;
        case 'meteorWarn': if (e.i === 0) this.toast('meteors', S_WARN, 2400); this.sfxAt('whistle', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.4) }); break;
        case 'meteor': {
          const d = Math.hypot(e.x - v.x, e.z - v.z);
          this.sfxAt('boom', this.at(e.x, e.z), { volume: Math.max(0.15, this.near(e.x, e.z, 0.8)) });
          fx.blast(e.x, e.y, e.z, d < 0, lk.rock);
          if (d < 26) this.view.shake(Math.max(0.12, 0.6 - d / 45));
          break;
        }
        case 'charging': { const tu = s.turrets[e.i]; this.sfxAt('tcharge', this.at(tu.x, tu.z), { volume: this.near(tu.x, tu.z, 0.3) }); break; }
        case 'fire': this.sfxAt('laser', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.5) }); fx.sparks(e.x, e.y, e.z, 8, [0xff7a3a, 0xffd08a], 3, 2, 0.08); break;
        case 'trainNear': this.sfx('horn', { volume: 0.55 }); this.toast('train', S_WARN, 1400); break;
        case 'zap': this.sfxAt('zap', this.at(e.x, e.z), { volume: 0.5 }); this.toast('zap', S_TOAST, 1500); fx.sparks(e.x, 2, e.z, 14, [0x5ab8ff, 0xffffff], 4, 3, 0.08); break;
        case 'pickup': this.pickup(e.id, e.x, e.z); break;
        case 'use': this.usePower(e.id, s); break;
        case 'powerEnd': this.sfx('powerDown', { volume: 0.35 }); break;
        case 'emp':
          this.sfx('emp', { volume: 0.7 });
          fx.ring(e.x, v.y + 1, e.z, 40, 0xc890ff, 18, 0.25);
          flash(this, 0xc890ff);
          this.view.shake(0.3);
          this.toast('emp');
          break;
        case 'alien':
          this.sfx('alien', { volume: 0.7, exact: true });
          this.toast('alien', S_GOOD, 2000);
          fx.confetti(e.x, 3, e.z, 50);
          break;
        case 'generator':
          this.sfx('genOff', { volume: 0.7 });
          fx.sparks(e.x, 2.5, e.z, 30, [0xff3a2a, 0xffd08a, 0xffffff], 6, 5, 0.1);
          fx.dust(e.x, s.generators[e.i].y, e.z, 12, lk.rock, 3);
          this.view.shake(0.4);
          this.toast('gen' + Math.min(3, e.left), e.left ? S_TOAST : S_GOOD, 1800);
          break;
        case 'minerOff':
          this.sfx('sting', { volume: 0.7, exact: true });
          this.banner(t('minerOff'), S_BIG, 330, 1500);
          fx.sparks(e.x, 3, e.z, 50, [0xff5a3a, 0xffd08a, 0xffffff], 8, 6, 0.12);
          this.view.shake(0.6);
          this.time.delayedCall(1700, () => { if (this.phase === 'play') this.toast('returnBase', S_GOOD, 2000); });
          break;
        case 'minerHit': break;
        case 'stormStart': this.sfx('storm', { volume: 0.6 }); this.toast('storm', S_WARN, 2600); break;
        case 'stormEnd': this.toast('stormEnd'); break;
        case 'timeLow': this.sfx('alarm', { volume: 0.5 }); this.toast('timeLow', S_WARN, 2000); break;
        case 'timeUp': this.toast('timeUp', S_WARN, 2600); break;
        case 'clear': this.clear(e.x, e.z, s); break;
        case 'die': this.die(); break;
      }
    }
  }

  private landed(e: Extract<SimEvent, { e: 'land' }>, s: Sim): void {
    const fx = this.view.fx, lk = REGIONS[s.c.region], v = s.rover;
    const big = e.impact > 7.5;
    this.sfx(big ? 'landBig' : 'land', { volume: Math.min(0.8, 0.25 + e.impact / 14) });
    fx.ring(e.x, v.y, e.z, big ? 30 : 16, lk.rock, big ? 7 : 4.5, big ? 0.38 : 0.28);
    if (big) { this.view.shake(0.55); this.hitStop = 0.06; padRumble(120, 0.55); }
    else if (e.impact > 4) this.view.shake(0.18);
    if (e.air > 0.6 && this.landT <= 0) {
      this.landT = 0.9;
      if (e.q === 'perfect') { this.banner(t('perfect'), S_LAND, 300, 700); this.sfx('perfect', { volume: 0.5, exact: true }); fx.sparks(v.x, v.y + 0.5, v.z, 18, [0x8ae8ff, 0xffffff], 4, 3, 0.08); }
      else if (e.q === 'rough') this.toast('rough', S_TOAST, 900);
      else if (e.air > 1.4) this.toast('good', S_TOAST, 900);
      const pts = (e.q === 'perfect' ? SCORE.perfect : e.q === 'good' ? SCORE.good : 0) + Math.round(SCORE.airSecond * e.air);
      if (pts > 0) { const p = this.view.screen(v.x, v.y + 3, v.z); this.popup(p.x, p.y, '+' + pts); }
    }
  }

  private popup(x: number, y: number, text: string): void {
    const tx = this.add.text(x, y, text, { fontFamily: 'Fredoka, Nunito, sans-serif', fontSize: '30px', fontStyle: '700', color: '#ffe08a', stroke: '#0b1020', strokeThickness: 6 }).setOrigin(0.5).setScrollFactor(0).setDepth(9050);
    this.tweens.add({ targets: tx, y: y - 60, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => tx.destroy() });
  }

  private pickup(id: PowerId, x: number, z: number): void {
    this.sfx('power', { volume: 0.6 });
    this.view.fx.sparks(x, 1.6, z, 24, [POWER_COLOR[id], 0xffffff], 4, 4, 0.09);
    this.banner(t('p_' + id), S_POWER, 300, 1100);
    this.toast('pd_' + id + (this.steering.pad ? '' : 'Key'), S_TOAST, 2200);
  }

  private usePower(id: PowerId, s: Sim): void {
    const v = s.rover, fx = this.view.fx;
    this.sfx(id === 'boost' ? 'boost' : id === 'shield' ? 'shield' : id === 'hover' ? 'hover' : id === 'magnet' ? 'magnet' : 'power', { volume: 0.6 });
    fx.sparks(v.x, v.y + 1.4, v.z, 18, [POWER_COLOR[id], 0xffffff], 4, 3, 0.09);
    if (id === 'boost') { this.view.shake(0.25); this.view.cam.kick = 1; }
  }

  private die(): void {
    const s = this.sim!;
    this.phase = 'dead';
    this.sfx('lose', { volume: 0.6 });
    this.view.shake(0.9);
    this.bank(s);
    this.showPlayUi(false);
    this.hudp.setVisible(true);
    this.banner(t('loseHearts'), S_BANNER, 330, 1600);
    this.endGame({ title: t('loseHearts'), delay: 1500 });
  }

  /** The mission's credits go to the purse as soon as the run could end (none twice). */
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
    this.banner(t(s.launched ? 'launch' : 'missionDone'), S_BIG, 330, 2300);
    if (s.launched) { this.sfx('rocket', { volume: 0.8 }); this.view.shake(0.9); }
    padRumble(200, 0.5);
  }

  private finishLevel(): void {
    const s = this.sim!, n = this.levelN, st = s.stats;
    this.phase = 'summary';
    this.clearBanners();
    this.showPlayUi(false);
    const r = regionIndex(n);
    const best = this.meta.best[n - 1];
    const stars = s.stars();
    const starsNow = stars.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
    const newStars = stars.map((on, i) => on && !((best.stars >> i) & 1));
    const b = clearBonus(s);
    const starPts = stars.filter(Boolean).length * SCORE.star;
    const extra = b.time + b.unharmed + starPts + SCORE.clear + SCORE.perRegion * r;
    this.addScore(extra);
    this.bank(s);
    const prize = CLEAR_CREDITS(r) + newStars.filter(Boolean).length * STAR_CREDITS;
    this.meta.credits += prize;
    this.runCredits += prize;
    const newBest = !best.time || st.time < best.time;
    best.stars |= starsNow;
    if (st.alien) best.alien = true;
    if (newBest) best.time = Math.round(st.time * 10) / 10;
    if (n >= this.meta.unlocked) this.meta.unlocked = Math.min(LEVEL_COUNT + 1, n + 1);
    if (n === 1) this.meta.hints = [...new Set([...this.meta.hints, 'tut'])];
    this.meta.last = Math.min(LEVEL_COUNT, n + 1);
    saveMeta(this.meta);
    this.panel = new SummaryScreen(this, this.host, {
      n, stars, newStars, credits: st.credits + prize, crystals: `${st.crystals}/${s.c.crystals.length}`, crew: `${st.rescued}/${s.c.astronauts.length}`,
      time: st.time, newBest, bonus: b.time, unharmed: b.unharmed, score: s.points + extra, alien: st.alien, setpiece: s.c.setpiece,
    }, () => {
      this.panel = null;
      if (n === LEVEL_COUNT) { this.phase = 'end'; this.endGame({ win: true, title: t('winAll'), delay: 200 }); return; }
      this.levelN = Math.min(LEVEL_COUNT, n + 1);
      this.openShop(() => this.openMap());
    });
  }

  // ---------------------------------------------------------------- the continue and the 2× reward

  /** A rewarded continue: full hearts and battery at the last checkpoint. */
  revive(): void {
    this.revived = true;
    if (this.phase !== 'dead' || !this.sim) return;
    this.sim.revive();
    this.phase = 'play';
    this.clearBanners();
    this.showPlayUi(true);
    this.view.snap(this.sim);
    this.bot?.reset();
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

  /** Portrait has room above the rover; landscape keeps banners in the band above it. */
  private bannerY(y: number): number { return isLandscape() ? Math.round(y * 0.6) : y; }

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

  toast(key: string, style: LabelStyle = S_TOAST, ms = 1300, wrapLong = false): void {
    if (key === this.toastKey && this.toastT > 0) return;
    this.toastKey = key; this.toastT = (ms / 1000) * 0.6;
    this.toastImg?.destroy();
    // above the touch buttons (portrait) or in the band between the pad's two thumbs (landscape);
    // a long line goes on two
    const land = isLandscape(), pad = !!this.steering.pad;
    const y = land ? this.scale.height - (pad ? 300 : 120) : this.scale.height - (pad ? 420 : 180);
    const lines = splitLine(t(key));
    const box = this.add.container(this.scale.width / 2, y).setScrollFactor(0).setDepth(9100);
    const lh = (style.size ?? 26) * 1.25;
    lines.forEach((line, i) => box.add(fitWidth(labelAt(this, 0, (i - (lines.length - 1) / 2) * lh, line, style), land ? (pad ? 620 : 900) : 670)));
    void wrapLong;
    box.setScale(0.6);
    this.toastImg = box;
    this.tweens.add({ targets: box, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: box, alpha: 0, delay: ms, duration: 300, onComplete: () => { if (this.toastImg === box) this.toastImg = null; box.destroy(); } });
  }

  private tutorial(dt: number): void {
    const tu = this.tut, s = this.sim;
    if (!tu || !s) return;
    tu.t += dt;
    const key = !this.steering.pad;
    // (the first-time keys along the bottom already say how to drive)
    if (tu.step === 0 && tu.t > 0.5) { if (!this.keyHint) this.toast(key ? 'tut_driveKey' : 'tut_drive', S_HINT, 3600); tu.step = 1; tu.t = 0; }
    else if (tu.step === 1 && tu.t > 4.5) { this.toast('tut_air', S_HINT, 3600); tu.step = 2; tu.t = 0; }
    else if (tu.step === 2 && s.rover.power) { this.toast(key ? 'tut_powerKey' : 'tut_power', S_HINT, 3600); tu.step = 3; }
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__mr = {
      state: () => {
        const s = this.sim;
        const v = s?.rover;
        return {
          phase: this.phase, level: this.levelN, score: this.score, credits: this.meta.credits, unlocked: this.meta.unlocked,
          rover: v ? { x: v.x, y: v.y, z: v.z, yaw: v.yaw, speed: v.speed, air: v.air, hp: v.hp, max: v.max, state: v.state, battery: v.battery, bmax: v.bmax, aboard: v.aboard, seats: v.seats, cargo: v.cargo, power: v.power, active: { ...v.active } } : null,
          stats: s ? { ...s.stats } : null, checkpoint: s ? { ...s.checkpoint } : null, start: s?.c.start ?? null, ready: s?.ready ?? false,
          ranks: { ...this.meta.ranks }, skin: this.meta.skin, tune: s ? { ...s.tune } : null, textures: this.textures.getTextureKeys().length,
          view: this.view.stats(), perf: { ...this.perf }, countdown: s?.countdown ?? -1, storm: s?.storm ?? false,
          meteors: s?.meteors.length ?? 0, bolts: s?.bolts.length ?? 0, miner: s?.miner ? { x: s.miner.x, z: s.miner.z, off: s.miner.off } : null,
          touchPad: !!this.steering.pad, steer: this.steering.current,
        };
      },
      start: (n = 1) => { this.startLevel(n); this.phaseT = INTRO_TIME; },
      god: (on = true) => { if (this.sim) this.sim.god = on; },
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim) : null; },
      teleport: (x: number, z: number, yaw?: number) => { const v = this.sim?.rover; if (v) { v.x = x; v.z = z; if (yaw !== undefined) v.yaw = yaw; v.vx = v.vz = 0; v.y = this.sim!.groundUnder(x, z, v.yaw).h; this.view.snap(this.sim!); } },
      battery: (k: number) => { const v = this.sim?.rover; if (v) v.battery = v.bmax * k; },
      hurt: (n = 1) => { this.sim?.hurt(n, 'test', true); },
      give: (id: PowerId) => { const v = this.sim?.rover; if (v) v.power = id; },
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
        this.panel = new SummaryScreen(this, this.host, { n: this.levelN, stars: [true, true, false], newStars: [false, true, false], credits: 86, crystals: '9/9', crew: '2/2', time: 71.4, newBest: true, bonus: 120, unharmed: 400, score: 4280, alien: true, setpiece: null }, () => { this.panel = null; });
        break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /**
   * The store art's card: the Crater Hop (1-2) frozen in a moment, the rover in mid-jump over the
   * big crater's rim, crystals round it, an astronaut waving, a meteor coming down on its red ring,
   * a staged camera low beside the jump (closer and higher on a phone).
   */
  private cardStage(): void {
    // no first-time hint over the scene
    this.meta.hints = [...new Set([...this.meta.hints, 'h_craters', 'tut'])];
    this.startLevel(2);
    this.phaseT = INTRO_TIME;
    this.go();
    this.clearBanners();
    this.time.removeAllEvents();
    this.toastImg?.destroy();
    const s = this.sim!, v = s.rover;
    s.god = true;
    const cr = s.c.craters.find((c) => c.large) ?? s.c.craters[0];
    const gy = s.ter.ground(cr.x, cr.z);
    v.x = cr.x - 1.5; v.z = cr.z + 2.5; v.y = gy + 3.4;
    v.yaw = Math.PI * 0.86; v.air = true; v.vy = 0.6; v.pitch = 0.14; v.roll = -0.05;
    v.vx = Math.sin(v.yaw) * 9; v.vz = Math.cos(v.yaw) * 9; v.speed = 9;
    v.aboard = 1;
    const a = s.astronauts[0];
    if (a) { a.x = cr.x - 7.5; a.z = cr.z - 4; a.y = s.ter.ground(a.x, a.z); a.state = 'wave'; a.yaw = Math.atan2(v.x - a.x, v.z - a.z); }
    const b = s.astronauts[1];
    if (b) { b.state = 'aboard'; b.seat = 0; }
    s.meteors.push({ x: cr.x + 6, z: cr.z - 7, y: s.ter.ground(cr.x + 6, cr.z - 7), t: 0.7, warn: 1.7, big: true });
    s.meteors.push({ x: cr.x - 9, z: cr.z + 3, y: s.ter.ground(cr.x - 9, cr.z + 3), t: 1.3, warn: 1.7, big: false });
    // crystals close by the jump
    s.crystals.slice(0, 3).forEach((c, i) => { c.x = cr.x - 4 + i * 3.5; c.z = cr.z - 2.5 - (i % 2) * 2; c.y = s.ter.ground(c.x, c.z); });
    this.testSpeed = 0.02;
    const land = this.scale.width > this.scale.height;
    const x = v.x, y = v.y, z = v.z;
    this.view.shotCam = land ? [[x + 5.2, y + 1.6, z + 6.4], [x - 2.6, y - 1.2, z - 1.2]] : [[x + 2.6, y + 1.6, z + 7.8], [x - 0.4, y - 0.9, z - 1.4]];
    this.steering.end();
    this.view.snap(s);
  }

  /** The store art's stage: the autopilot some seconds into a mission. */
  private stageShot(n: number, secs: number): void {
    this.startLevel(n);
    this.phaseT = INTRO_TIME;
    this.go();
    const s = this.sim!;
    s.god = true;
    this.bot = new Bot(s);
    this.clearBanners();
    for (let i = 0; i < 60 * secs && s.rover.state !== 'clear'; i++) { s.step(DT, this.bot.input()); s.events.length = 0; }
    this.view.snap(s);
  }
}

export { ORANGE, TEAL, RED, GREEN };
