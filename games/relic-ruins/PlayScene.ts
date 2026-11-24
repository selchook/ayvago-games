// Relic Ruins: the play scene. A run starts on the ruin map; each ruin cleared adds to the run's
// score, its coins go to the purse at once and the camp opens between ruins. The run ends when the
// hearts run out (a rewarded ad may bring the hero back once, at the last brazier), when the player
// ends it on the map, or when the last ruin of the Collapsing Cathedral is cleared.
//   map → (PLAY) intro sweep from the relic to the hero → play → out with the relic → card → camp → map
// The sim runs at a fixed 60 Hz (sim.ts); the view draws it (view.ts); the HUD and the touch
// buttons are hud.ts; the inner screens screens.ts.
import Phaser from 'phaser';
import { ArcadeScene, Controls, t, isEasy, flash, padRumble, labelAt, labelTexture, fitWidth, type LabelStyle } from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Sim, NO_INPUT, cellX, cellZ, clearBonus, type Input, type SimEvent } from './sim';
import { Bot } from './bot';
import { buildLevel, LEVEL_COUNT, worldOf } from './levels';
import { DT, SCORE, CLEAR_COINS, STAR_COINS, WORLD_IDS, POWER_COLOR, RAISE } from './defs';
import { loadMeta, saveMeta, type Meta } from './meta';
import { MapScreen, SummaryScreen, ShopScreen, type Panel, type ScreenHost } from './screens';
import { PlayHud, ActionButton, S_BANNER, S_BIG, S_SUBBANNER, S_TOAST, S_WARN, S_POWER, S_HINT, S_PROMPT, levelLabel } from './hud';
import { AMBER, VERDIGRIS } from './paint';
import { makeArt } from './art';

type Phase = 'map' | 'intro' | 'play' | 'clear' | 'summary' | 'shop' | 'dead' | 'end';

const INTRO_TIME = 2.1;

/** Coins the current (or last) run earned: the 2× reward is offered only when there are some. */
let runCoinsNow = 0;
export const lastRunCoins = (): number => runCoinsNow;

export class PlayScene extends ArcadeScene {
  phase: Phase = 'map';
  meta!: Meta;
  view!: View;
  /** The level's 3D world (also found by the GPU memory check). */
  world!: World3D;
  sim: Sim | null = null;
  levelN = 1;
  private controls!: Controls;
  private hudp!: PlayHud;
  private actBtn!: ActionButton;
  private flareBtn!: ActionButton;
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
  get runCoins(): number { return runCoinsNow; }
  set runCoins(n: number) { runCoinsNow = n; }
  private toastImg: Phaser.GameObjects.Image | null = null;
  private toastKey = '';
  private toastT = 0;
  private bannerImgs: Phaser.GameObjects.Image[] = [];
  private prompt: Phaser.GameObjects.Image | null = null;
  private promptKey = '';
  private tut: { step: number; t: number; x: number; z: number } | null = null;
  private actPressed = false;
  private flarePressed = false;
  private keyAct = false;
  private keys!: { e: Phaser.Input.Keyboard.Key; f: Phaser.Input.Keyboard.Key; shift: Phaser.Input.Keyboard.Key; space: Phaser.Input.Keyboard.Key };
  private needT = 0;
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
    this.runCoins = 0;
    this.toastImg = null;
    this.toastKey = '';
    this.toastT = 0;
    this.bannerImgs = [];
    this.prompt = null;
    this.promptKey = '';
    this.tut = null;
    this.actPressed = this.flarePressed = this.keyAct = false;
    this.needT = 0;
    this.testSpeed = 1;
    this.perf = { frames: 0, maxCalls: 0, maxTris: 0 };
    this.levelN = Math.min(this.meta.last, this.meta.unlocked, LEVEL_COUNT);
    this.touch = this.sys.game.device.input.touch;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this);
    this.world = this.view.world;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.dispose());
    this.controls = new Controls(this, { joystick: true });
    const W = this.scale.width, H = this.scale.height;
    this.actBtn = new ActionButton(this, W - 120, H - 150, 84, 'rr-hand', t('act'), AMBER);
    this.flareBtn = new ActionButton(this, W - 290, H - 104, 58, 'rr-flare', t('flare'), VERDIGRIS, true);
    this.hudp = new PlayHud(this, this.hud);
    const kb = this.input.keyboard!;
    this.keys = { e: kb.addKey('E'), f: kb.addKey('F'), shift: kb.addKey('SHIFT'), space: kb.addKey('SPACE') };
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.panel && !this.panel.closed) { this.panel.key(e.code); return; }
      if (this.phase === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.phaseT = INTRO_TIME;
    });
    this.showPlayUi(false);
    this.hooks();
    this.openMap();
  }

  // ---------------------------------------------------------------- the map, the camp

  private showPlayUi(on: boolean): void {
    this.hudp.setVisible(on);
    this.actBtn.setVisible(on && this.touch);
    this.flareBtn.setVisible(on && this.touch);
    if (!on) this.clearPrompt();
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

  /** The chosen ruin turning in the top half of the map (nobody in it). */
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
    this.panel = new ShopScreen(this, this.host, this.meta, () => undefined, () => { this.panel = null; then(); });
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
    this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy());
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
    this.actBtn.setVisible(false);
    this.flareBtn.setVisible(false);
    this.clearBanners();
    this.banner(t('l' + n), S_BANNER, 250, 1800);
    this.banner(levelLabel(n) + '  ·  ' + t('w_' + worldOf(n)), S_SUBBANNER, 194, 1800, true);
    this.sfx('start', { volume: 0.5 });
    this.tut = n === 1 && !this.meta.hints.includes('tut') ? { step: 0, t: 0, x: 0, z: 0 } : null;
  }

  private go(): void {
    this.phase = 'play';
    this.phaseT = 0;
    this.showPlayUi(true);
    this.banner(t('go'), S_BIG, 360, 600);
    this.sfx('go', { volume: 0.5 });
    // the new idea's hint, once
    const hint = this.sim?.c.hint;
    if (hint && !this.meta.hints.includes(hint)) {
      const n = this.levelN;
      this.time.delayedCall(this.tut ? 7200 : 900, () => { if (this.phase === 'play' && this.levelN === n) this.toast(hint, S_HINT, 5200, true); });
      this.meta.hints = [...new Set([...this.meta.hints, hint])];
      saveMeta(this.meta);
    }
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = (delta / 1000) * this.testSpeed;
    this.perf.frames++;
    if (this.perf.frames === 1) this.showPlayUi(this.phase === 'play' || this.phase === 'intro');
    this.phaseT += dt;
    this.toastT = Math.max(0, this.toastT - dt);
    this.readButtons();
    const s = this.sim;
    if (!s) return;
    if (this.phase === 'intro' && this.phaseT >= INTRO_TIME) this.go();
    if (this.hitStop > 0) this.hitStop -= dt;
    else if (this.phase !== 'map' && this.phase !== 'shop') {
      this.acc += Math.min(dt, 0.1);
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
    } else s.clock += dt;
    // the run's score follows the level's points
    if (this.phase === 'play' || this.phase === 'clear' || this.phase === 'dead') {
      const more = s.points - this.scored;
      if (more > 0) { this.addScore(more); this.scored = s.points; }
    }
    const mode = this.phase === 'map' || this.phase === 'shop' ? 'preview' : this.phase === 'intro' ? 'intro' : 'follow';
    this.view.sync(s, dt, { camera: mode, introT: this.phaseT / INTRO_TIME });
    if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'dead' || this.phase === 'clear') this.hudp.update(s, this.levelN, this.time.now);
    if (this.phase === 'play') {
      const tg = s.target();
      const verb = !tg ? 'v_roll' : tg.kind === 'sconce' || tg.kind === 'puzzle' || tg.kind === 'candles' ? 'v_light' : 'v_' + tg.kind;
      this.actBtn.setWord(t(verb));
      this.actBtn.draw(dt, !tg ? s.hero.rollCd <= 0 : true);
      this.flareBtn.draw(dt, s.hero.flares > 0, s.hero.flares);
      this.showPrompt(tg ? verb : '', tg);
      this.tutorial(dt);
      // the exit is shut until the relic is taken
      this.needT -= dt;
      if (!s.hero.relic && this.needT <= 0 && Math.hypot(cellX(s.c.exit[0]) - s.hero.x, cellZ(s.c.exit[1]) - s.hero.z) < 2.6) { this.toast('needRelic'); this.needT = 4; }
      const st = this.view.stats();
      this.perf.maxCalls = Math.max(this.perf.maxCalls, st.calls);
      this.perf.maxTris = Math.max(this.perf.maxTris, st.triangles);
    }
    if (this.phase === 'clear' && this.phaseT > 2.6) this.finishLevel();
  }

  private readButtons(): void {
    if (this.actBtn.take()) this.actPressed = true;
    if (this.flareBtn.take()) this.flarePressed = true;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space)) this.actPressed = true;
    if (Phaser.Input.Keyboard.JustDown(k.f) || Phaser.Input.Keyboard.JustDown(k.shift)) this.flarePressed = true;
    if (this.controls.justA()) this.actPressed = true;
    if (this.controls.justB()) this.flarePressed = true;
    this.keyAct = k.e.isDown || k.space.isDown || this.controls.a;
    if (this.phase === 'intro' && (this.actPressed || this.flarePressed) && this.phaseT > 0.3) { this.phaseT = INTRO_TIME; this.actPressed = this.flarePressed = false; }
  }

  private readInput(first: boolean): Input {
    const c = this.controls;
    const inp: Input = {
      mx: c.axisX, mz: c.axisY,
      act: this.keyAct || this.actBtn.held,
      actPressed: first && this.actPressed,
      flarePressed: first && this.flarePressed,
    };
    if (first) { this.actPressed = false; this.flarePressed = false; }
    return inp;
  }

  // ---------------------------------------------------------------- what happened

  private at(x: number, z: number, y = 0.5): number { return this.view.screen(x, y, z).x; }

  /** Volume falls off with distance from the hero. */
  private near(x: number, z: number, v: number): number {
    const h = this.sim!.hero;
    return v * Math.max(0, 1 - Math.hypot(x - h.x, z - h.z) / 22);
  }

  private handle(evs: SimEvent[], s: Sim): void {
    const fx = this.view.fx, h = s.hero, flameC = 0xffa040;
    for (const e of evs) {
      switch (e.e) {
        case 'step': this.sfx('step', { volume: 0.16 }); break;
        case 'roll': this.sfx('roll', { volume: 0.45 }); fx.dust(e.x, h.y, e.z, 6, 0x9a8a72, 2); break;
        case 'pickup': this.pickup(e.p); break;
        case 'hurt':
          if (e.by !== 'fall' && e.by !== 'dark') {
            this.sfx('hurt', { volume: 0.6 });
            this.view.shake(0.7);
            this.hitStop = 0.08;
            flash(this, 0xd83a1a);
            fx.sparks(e.x, h.y + 0.8, e.z, 14, [0xff5a3a, 0xffffff], 4, 3, 0.07);
            padRumble(150, 0.6);
          }
          break;
        case 'fall': this.sfx('fall', { volume: 0.55 }); this.toast('fell'); this.view.shake(0.4); break;
        case 'respawn': this.sfx('respawn', { volume: 0.45 }); this.view.snap(s); fx.sparks(e.x, h.y + 0.6, e.z, 18, [0xffd070, 0xffffff], 3, 3, 0.07); this.bot?.reset(); break;
        case 'darkWarn': if (h.dark >= 0) { this.toast('torchOut', S_WARN, 2400); this.sfx('dark', { volume: 0.5 }); } else this.toast('torchLow', S_WARN, 1600); break;
        case 'darkOut': this.toast('darkHit', S_TOAST, 1800); this.sfx('hurt', { volume: 0.5 }); this.view.shake(0.5); flash(this, 0x000000); break;
        case 'die': this.die(); break;
        case 'brazier':
          this.sfxAt('ignite', this.at(e.x, e.z), { volume: 0.6 });
          fx.sparks(e.x, 1.2, e.z, 22, [flameC, 0xffe08a, 0xffffff], 3, 4, 0.07);
          if (e.first) this.toast('brazierLit');
          break;
        case 'light': this.sfxAt('ignite', this.at(e.x, e.z), { volume: 0.45 }); fx.sparks(e.x, 1.2, e.z, 12, [flameC, 0xffe08a], 2, 2, 0.05); break;
        case 'candleOut': this.sfxAt('puff', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.5) }); this.toast('candleOut', S_WARN, 1300); fx.dust(e.x, 0.8, e.z, 4, 0x6a6a6a, 0.6); break;
        case 'lever': this.sfxAt('lever', this.at(e.x, e.z), { volume: 0.6 }); fx.sparks(e.x, 0.9, e.z, 8, [0xffffff, 0xffd070], 2, 2, 0.05); break;
        case 'door': {
          const x = cellX(e.c), z = cellZ(e.r);
          this.sfxAt(e.kind === 'sealed' ? 'seal' : 'door', this.at(x, z), { volume: this.near(x, z, 0.65) + 0.15 });
          fx.dust(x, 0.1, z, 12, 0xb8aa96, 2.6);
          if (e.kind === 'door') { this.toast(e.open ? 'doorOpen' : 'doorShut', S_TOAST, 1200); this.view.shake(0.18); }
          break;
        }
        case 'needKey': this.sfx('deny', { volume: 0.4 }); this.toast('needKey'); break;
        case 'unlock': this.sfx('unlock', { volume: 0.6 }); this.toast('unlock'); break;
        case 'sealed': this.toast('sealedOpen', S_TOAST, 1600); this.view.shake(0.35); this.sfx('magic', { volume: 0.6 }); break;
        case 'shelf': { const x = cellX(e.c), z = cellZ(e.r); this.sfxAt('grind', this.at(x, z), { volume: 0.6 }); this.toast('secret'); fx.dust(x, 0.2, z, 14, 0xb8aa96, 2.4); this.view.shake(0.2); break; }
        case 'pot': this.sfxAt(e.barrel ? 'barrel' : 'pot', this.at(e.x, e.z), { volume: 0.6 }); fx.sparks(e.x, 0.6, e.z, 16, e.barrel ? [0x6a4a2a, 0x8a6a3a] : [0xa86a3a, 0x7a4a24, 0xd8a060], 4, 5, 0.08); break;
        case 'relic': this.relic(e.x, e.z); break;
        case 'exitOpen': this.time.delayedCall(900, () => { if (this.phase === 'play') this.toast('exitOpen', S_TOAST, 1600); }); break;
        case 'clear': this.clear(e.x, e.z); break;
        case 'push': this.sfxAt(e.kind === 'cart' ? 'cart' : 'push', this.at(e.x, e.z), { volume: 0.5 }); fx.dust(e.x, 0.05, e.z, 6, 0x9a8a72, 1.4); break;
        case 'blockFall': this.sfxAt('splash', this.at(e.x, e.z), { volume: 0.6 }); fx.rubble(e.x, 0, e.z, 12, s.c.world === 'library' ? 0x5aa0c8 : 0x8a7a66); this.view.shake(0.25); break;
        case 'cartStop': this.sfxAt('bump', this.at(e.x, e.z), { volume: 0.5 }); break;
        case 'plate': this.sfxAt('plate', this.at(e.x, e.z), { volume: 0.5 }); break;
        case 'flare':
          this.sfx('flare', { volume: 0.7 });
          fx.sparks(e.x, 2.2, e.z, 40, [0xff7a50, 0xffe08a, 0xffffff], 7, 6, 0.08);
          flash(this, 0xffc890);
          this.view.shake(0.3);
          break;
        case 'snap': this.sfx('snap', { volume: 0.7 }); this.toast('snap'); fx.sparks(e.x, 0.3, e.z, 12, [0xd8d8e0, 0xffffff], 3, 3, 0.06); this.view.shake(0.5); break;
        case 'trapdoor': if (this.near(cellX(e.c), cellZ(e.r), 1) > 0.5) this.sfxAt('trapdoor', this.at(cellX(e.c), cellZ(e.r)), { volume: 0.22 }); break;
        case 'crack': this.sfxAt('crack', this.at(cellX(e.c), cellZ(e.r)), { volume: this.near(cellX(e.c), cellZ(e.r), 0.35) }); break;
        case 'collapse': {
          const x = cellX(e.c), z = cellZ(e.r), y = (s.cell(e.c, e.r)?.h ?? 0) * RAISE;
          this.sfxAt('collapse', this.at(x, z), { volume: this.near(x, z, 0.5) });
          fx.rubble(x, y, z, 8, 0x8a7a66);
          if (Math.hypot(x - h.x, z - h.z) < 6) this.view.shake(0.15);
          break;
        }
        case 'brickWarn': this.sfxAt('whistle', this.at(e.x, e.z), { volume: 0.25 }); break;
        case 'brick': this.sfxAt('brick', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.6) }); fx.rubble(e.x, 0, e.z, 10, 0x9a8a76); if (Math.hypot(e.x - h.x, e.z - h.z) < 4) this.view.shake(0.25); break;
        case 'foeAlert': this.sfxAt('growl', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.55) }); break;
        case 'foeStun': fx.sparks(e.x, 1, e.z, 10, [0xffe08a, 0xffffff], 2, 3, 0.05); break;
        case 'grind': this.sfxAt('grind', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.35) }); break;
        case 'powerEnd': this.sfx('powerDown', { volume: 0.4 }); break;
      }
    }
  }

  private pickup(p: Extract<SimEvent, { e: 'pickup' }>['p']): void {
    const fx = this.view.fx;
    switch (p.kind) {
      case 'coin': this.sfx('coin', { volume: 0.4 }); fx.glint(p.x, p.y + 0.5, p.z, 0xffd040, 6); break;
      case 'gem': this.sfx('gem', { volume: 0.6 }); fx.glint(p.x, p.y + 0.6, p.z, 0x6af0ff, 16); this.toast('gotGem'); this.view.shake(0.12); break;
      case 'key': this.sfx('key', { volume: 0.6 }); fx.glint(p.x, p.y + 0.5, p.z, 0xffd040, 12); this.toast('gotKey'); break;
      case 'power': {
        const id = p.power!;
        this.sfx('power', { volume: 0.6 });
        fx.sparks(p.x, p.y + 0.6, p.z, 24, [POWER_COLOR[id], 0xffffff], 4, 4, 0.07);
        this.banner(t('p_' + id), S_POWER, 300, 1100);
        this.toast('pd_' + id, S_TOAST, 2000);
        break;
      }
    }
  }

  private relic(x: number, z: number): void {
    const s = this.sim!;
    this.sfx('relic', { volume: 0.7, exact: true });
    this.view.fx.sparks(x, 1.2, z, 46, [0xffd070, 0xffffff, 0xffa040], 5, 7, 0.09);
    this.view.fx.glint(x, 1.4, z, 0xffe090, 24);
    this.view.shake(0.35);
    flash(this, 0xffe0a0);
    this.banner(t('relicTaken'), S_BIG, 330, 1300);
    padRumble(200, 0.5);
    if (s.c.escape) {
      this.time.delayedCall(1100, () => {
        if (this.phase !== 'play') return;
        this.banner(t('run'), S_BIG, 330, 900);
        this.toast('collapse', S_WARN, 2200);
        this.sfx('collapse', { volume: 0.7 });
        this.view.shake(0.9);
      });
    }
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

  /** The level's coins go to the purse as soon as the run could end (none twice). */
  private bank(s: Sim): void {
    const more = s.stats.coins - this.banked;
    if (more > 0) { this.meta.coins += more; this.runCoins += more; this.banked = s.stats.coins; saveMeta(this.meta); }
  }

  private clear(x: number, z: number): void {
    this.phase = 'clear';
    this.phaseT = 0;
    this.showPlayUi(false);
    this.hudp.setVisible(true);
    this.sfx('fanfare', { volume: 0.6, exact: true });
    this.view.fx.confetti(x, 2.2, z, 70);
    this.banner(t('levelClear'), S_BIG, 330, 2300);
    padRumble(200, 0.5);
  }

  private finishLevel(): void {
    const s = this.sim!, n = this.levelN, st = s.stats;
    this.phase = 'summary';
    this.clearBanners();
    this.showPlayUi(false);
    const w = WORLD_IDS.indexOf(worldOf(n));
    const best = this.meta.best[n - 1];
    const stars = [true, st.gems >= s.c.gems, st.time <= s.c.par];
    const starsNow = stars.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
    const newStars = stars.map((on, i) => on && !((best.stars >> i) & 1));
    const b = clearBonus(s);
    const starPts = stars.filter(Boolean).length * SCORE.star;
    const extra = b.time + b.noHit + starPts + SCORE.clear + SCORE.perWorld * w;
    this.addScore(extra);
    this.bank(s);
    const prize = CLEAR_COINS(w) + newStars.filter(Boolean).length * STAR_COINS;
    this.meta.coins += prize;
    this.runCoins += prize;
    const newBest = !best.time || st.time < best.time;
    best.stars |= starsNow;
    if (newBest) best.time = Math.round(st.time * 10) / 10;
    if (n >= this.meta.unlocked) this.meta.unlocked = Math.min(LEVEL_COUNT + 1, n + 1);
    if (n === 1) this.meta.hints = [...new Set([...this.meta.hints, 'tut'])];
    this.meta.last = Math.min(LEVEL_COUNT, n + 1);
    saveMeta(this.meta);
    this.panel = new SummaryScreen(this, this.host, {
      n, stars, newStars, coins: st.coins + prize, gems: `${st.gems}/${s.c.gems}`, time: st.time, newBest, bonus: b.time, noHit: b.noHit, score: s.points + extra,
    }, () => {
      this.panel = null;
      if (n === LEVEL_COUNT) { this.phase = 'end'; this.endGame({ win: true, title: t('winAll'), delay: 200 }); return; }
      this.levelN = Math.min(LEVEL_COUNT, n + 1);
      this.openShop(() => this.openMap());
    });
  }

  // ---------------------------------------------------------------- the continue and the 2× reward

  /** A rewarded continue: full hearts and torch at the last brazier (on the map: nothing to undo). */
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

  /** The 2× reward: the run's coins once more (never the score). */
  doubleCoins(): void {
    this.meta.coins += this.runCoins;
    this.runCoins *= 2;
    saveMeta(this.meta);
  }

  // ---------------------------------------------------------------- banners, toasts, the prompt, the tutorial

  private banner(text: string, style: LabelStyle, y: number, ms: number, fit = false): void {
    labelTexture(this, text, style);
    const img = labelAt(this, this.scale.width / 2, y, text, style).setScrollFactor(0).setDepth(9100);
    if (fit) fitWidth(img, 660);
    const sc = img.scale;
    img.setScale(sc * 0.3);
    this.bannerImgs.push(img);
    this.tweens.add({ targets: img, scale: sc, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: y - 30, delay: ms, duration: 380, onComplete: () => { img.destroy(); this.bannerImgs = this.bannerImgs.filter((b) => b !== img); } });
  }

  private clearBanners(): void { for (const b of this.bannerImgs) { this.tweens.killTweensOf(b); b.destroy(); } this.bannerImgs = []; }

  toast(key: string, style: LabelStyle = S_TOAST, ms = 1300, wrapLong = false): void {
    if (key === this.toastKey && this.toastT > 0) return;
    this.toastKey = key; this.toastT = ms / 1000 * 0.6;
    this.toastImg?.destroy();
    const img = labelAt(this, this.scale.width / 2, this.scale.height - (this.touch ? 300 : 170), t(key), style).setScrollFactor(0).setDepth(9100);
    fitWidth(img, wrapLong ? 680 : 660);
    const sc = img.scale;
    img.setScale(sc * 0.6);
    this.toastImg = img;
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: ms, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  /** The verb over the thing ACT would use. */
  private showPrompt(verb: string, tg: { c: number; r: number } | null): void {
    if (!verb || !tg || this.touch) { this.clearPrompt(); return; }
    if (verb !== this.promptKey) {
      this.clearPrompt();
      this.promptKey = verb;
      this.prompt = labelAt(this, 0, 0, t(verb), S_PROMPT).setScrollFactor(0).setDepth(9000);
    }
    const s = this.sim!;
    const p = this.view.screen(cellX(tg.c), (s.cell(tg.c, tg.r)?.h ?? 0) * RAISE + 1.9, cellZ(tg.r));
    this.prompt!.setPosition(p.x, p.y + Math.sin(this.time.now / 180) * 3);
  }

  private clearPrompt(): void { this.prompt?.destroy(); this.prompt = null; this.promptKey = ''; }

  private tutorial(dt: number): void {
    const tu = this.tut, s = this.sim;
    if (!tu || !s) return;
    tu.t += dt;
    const h = s.hero;
    const key = !this.touch;
    if (tu.step === 0 && tu.t > 0.6) { this.toast(key ? 'tut_moveKey' : 'tut_move', S_HINT, 3200); tu.step = 1; tu.x = h.x; tu.z = h.z; }
    else if (tu.step === 1 && (Math.hypot(h.x - tu.x, h.z - tu.z) > 2 || tu.t > 5)) { this.toast(key ? 'tut_actKey' : 'tut_act', S_HINT, 3800); tu.step = 2; tu.t = 0; }
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__rr = {
      state: () => {
        const s = this.sim;
        return {
          phase: this.phase, level: this.levelN, score: this.score, coins: this.meta.coins, unlocked: this.meta.unlocked,
          hero: s ? { x: s.hero.x, z: s.hero.z, y: s.hero.y, hp: s.hero.hp, max: s.hero.max, state: s.hero.state, torch: s.hero.torch, tmax: s.hero.tmax, keys: s.hero.keys, flares: s.hero.flares, relic: s.hero.relic, powers: { ...s.hero.powers }, dark: s.hero.dark } : null,
          stats: s ? { ...s.stats } : null, checkpoint: s?.checkpoint ?? -1, ranks: { ...this.meta.ranks }, escape: s?.escapeT ?? -1,
          tune: s ? { ...s.tune } : null, textures: this.textures.getTextureKeys().length, view: this.view.stats(), perf: { ...this.perf }, botI: this.bot?.i ?? -1,
          foes: s ? s.foes.map((f) => ({ kind: f.kind, x: f.x, z: f.z, state: f.state, stun: f.stun })) : [],
        };
      },
      start: (n = 1) => { this.startLevel(n); this.phaseT = INTRO_TIME; },
      god: (on = true) => { if (this.sim) this.sim.god = on; },
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim) : null; },
      teleport: (c: number, r: number) => { const h = this.sim?.hero; if (h) { h.x = cellX(c); h.z = cellZ(r); h.vx = h.vz = 0; this.view.snap(this.sim!); } },
      torch: (k: number) => { const h = this.sim?.hero; if (h) h.torch = h.tmax * k; },
      hurt: (n = 1) => { const h = this.sim?.hero; if (h) this.sim!.damage(n, h.x, h.z + 1, 'test', true); },
      pickups: (kind?: string) => this.sim?.picks.filter((p) => !p.taken && (!kind || p.kind === kind)).map((p) => ({ kind: p.kind, power: p.power, c: Math.round(p.x / 2), r: Math.round(p.z / 2) })),
      speed: (k: number) => { this.testSpeed = k; },
      open: (which: string) => this.openForShot(which),
      meta: (m: Partial<Meta>) => { Object.assign(this.meta, m); saveMeta(this.meta); },
      key: (code: string) => this.panel?.key(code),
      cam: (pos?: number[], look?: number[]) => { this.view.shotCam = pos && look ? [pos, look] : null; },
      stage: (n = 3, secs = 8) => this.stageShot(n, secs),
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
        this.panel = new SummaryScreen(this, this.host, { n: this.levelN, stars: [true, true, false], newStars: [false, true, false], coins: 46, gems: '1/1', time: 63.4, newBest: true, bonus: 220, noHit: 500, score: 3240 }, () => { this.panel = null; });
        break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /** The store art's stage: the autopilot a few seconds into a ruin, the light round him. */
  private stageShot(n: number, secs: number): void {
    this.startLevel(n);
    this.phaseT = INTRO_TIME;
    this.go();
    const s = this.sim!;
    s.god = true;
    this.bot = new Bot(s);
    this.clearBanners();
    for (let i = 0; i < 60 * secs && s.hero.state === 'play'; i++) { s.step(DT, this.bot.input()); s.events.length = 0; }
    this.view.snap(s);
  }
}
