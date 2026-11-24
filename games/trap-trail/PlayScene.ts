// Trap Trail: the play scene. A run starts on the trail map; each stage played adds to the run's
// score, its coins go to the purse at once and the shop opens between stages. The run ends when
// the hearts run out (a rewarded ad may bring the hero back to the last checkpoint once), when the
// player ends it on the map, or when the last stage of the Storm Keep is cleared.
//   map → (PLAY) intro fly-over → play → goal → summary → shop → map (next stage picked)
// The sim runs at a fixed 60 Hz (sim.ts); the view draws it (view.ts); the HUD and the touch
// buttons are hud.ts; the inner screens screens.ts.
import Phaser from 'phaser';
import { ArcadeScene, Controls, t, isEasy, flash, padRumble, labelAt, labelTexture, type LabelStyle } from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Sim, NO_INPUT, FOE, type Input, type SimEvent } from './sim';
import { Bot } from './bot';
import { buildStage, STAGE_COUNT, worldOf } from './levels';
import { DT, SCORE, CLEAR_COINS, STAR_COINS, WORLD_IDS, POWER_COLOR, GEM_POINTS, type UpgradeId } from './defs';
import { loadMeta, saveMeta, type Meta } from './meta';
import { MapScreen, SummaryScreen, ShopScreen, type Panel, type ScreenHost } from './screens';
import { PlayHud, ActionButton, S_BANNER, S_BIG, S_SUBBANNER, S_TOAST, S_POWER, S_HINT, stageLabel } from './hud';
import { ORANGE, BLUE } from './paint';
import { makeArt } from './art';
import { renderIconSheet } from './icons';

type Phase = 'map' | 'intro' | 'play' | 'clear' | 'summary' | 'shop' | 'dead' | 'end';

const INTRO_TIME = 1.9;

/** Coins the current (or last) run earned: the 2× reward is offered only when there are some. */
let runCoinsNow = 0;
export const lastRunCoins = (): number => runCoinsNow;

export class PlayScene extends ArcadeScene {
  phase: Phase = 'map';
  meta!: Meta;
  view!: View;
  /** The stage's 3D world (also found by the GPU memory check). */
  world!: World3D;
  sim: Sim | null = null;
  stageN = 1;
  private controls!: Controls;
  private hudp!: PlayHud;
  private jumpBtn!: ActionButton;
  private dashBtn!: ActionButton;
  private panel: Panel | null = null;
  private host!: ScreenHost;
  private touch = false;
  private acc = 0;
  private phaseT = 0;
  private hitStop = 0;
  private bot: Bot | null = null;
  private revived = false;
  /** Coins of the current stage already put in the purse (a death banks them, a clear adds the rest). */
  private banked = 0;
  /** Coins earned in this run (for the 2× reward). */
  get runCoins(): number { return runCoinsNow; }
  set runCoins(n: number) { runCoinsNow = n; }
  private toastImg: Phaser.GameObjects.Image | null = null;
  private bannerImgs: Phaser.GameObjects.Image[] = [];
  private tut: { step: number; t: number; x: number; z: number } | null = null;
  private jumpPressed = false;
  private dashPressed = false;
  private keyJump = false;
  testSpeed = 1;
  perf = { frames: 0 };

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
    this.runCoins = 0;
    this.toastImg = null;
    this.bannerImgs = [];
    this.tut = null;
    this.jumpPressed = this.dashPressed = this.keyJump = false;
    this.testSpeed = 1;
    this.perf.frames = 0;
    this.stageN = Math.min(this.meta.last, this.meta.unlocked, STAGE_COUNT);
    this.touch = this.sys.game.device.input.touch;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this);
    this.world = this.view.world;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.dispose());
    this.controls = new Controls(this, { joystick: true });
    const W = this.scale.width, H = this.scale.height;
    this.jumpBtn = new ActionButton(this, W - 128, H - 132, 88, 'tt-up', t('jump'), ORANGE);
    this.dashBtn = new ActionButton(this, W - 300, H - 98, 62, 'tt-dash', t('dash'), BLUE);
    this.hudp = new PlayHud(this, this.hud);
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.panel && !this.panel.closed) { this.panel.key(e.code); return; }
      if (this.phase === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.phaseT = INTRO_TIME;
    });
    this.showPlayUi(false);
    this.hooks();
    this.openMap();
  }

  // ---------------------------------------------------------------- the map, the shop

  private showPlayUi(on: boolean): void {
    this.hudp.setVisible(on);
    this.jumpBtn.setVisible(on && this.touch);
    this.dashBtn.setVisible(on && this.touch);
  }

  openMap(): void {
    this.closePanel();
    this.phase = 'map';
    this.showPlayUi(false);
    this.preview(this.stageN);
    this.panel = new MapScreen(this, this.host, this.meta, this.stageN, this.score, {
      select: (n) => { if (n !== this.stageN || !this.sim) this.preview(n); this.stageN = n; this.meta.last = n; saveMeta(this.meta); },
      play: (n) => this.startStage(n),
      shop: () => this.openShop(() => this.openMap()),
      endRun: () => this.endRun(),
    });
  }

  /** The chosen stage turning on the right of the map (its traps running, nobody on it). */
  private preview(n: number): void {
    this.stageN = n;
    const c = buildStage(n);
    this.sim = new Sim(c, this.meta.ranks, isEasy(), false);
    this.sim.hero.state = 'goal';
    this.sim.hero.y = -999;
    this.view.build(c);
    this.view.hero.visible = false;
    this.bot = null;
  }

  openShop(then: () => void): void {
    this.closePanel();
    this.phase = 'shop';
    this.showPlayUi(false);
    this.panel = new ShopScreen(this, this.host, this.meta, (u: UpgradeId) => void u, () => { this.panel = null; then(); });
  }

  private closePanel(): void { this.panel?.close(); this.panel = null; }

  private endRun(): void {
    this.closePanel();
    this.phase = 'end';
    this.endGame({ win: true, title: t('runDone'), delay: 150 });
  }

  // ---------------------------------------------------------------- a stage

  startStage(n: number): void {
    this.closePanel();
    this.stageN = n;
    this.meta.last = n;
    saveMeta(this.meta);
    const c = buildStage(n);
    this.sim = new Sim(c, this.meta.ranks, isEasy(), this.meta.ranks.shield >= 1);
    this.view.build(c);
    this.view.hero.visible = true;
    this.view.snap(this.sim);
    this.view.warm();
    this.banked = 0;
    this.bot = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.acc = 0;
    this.showPlayUi(true);
    this.jumpBtn.setVisible(false);
    this.dashBtn.setVisible(false);
    this.clearBanners();
    this.banner(t('s' + n), S_BANNER, 240, 1700);
    this.banner(stageLabel(n) + '', S_SUBBANNER, 186, 1700);
    this.sfx('start', { volume: 0.5 });
    this.tut = n === 1 && !this.meta.hints.includes('tut') ? { step: 0, t: 0, x: 0, z: 0 } : null;
  }

  private go(): void {
    this.phase = 'play';
    this.phaseT = 0;
    this.showPlayUi(true);
    this.banner(t('go'), S_BIG, 330, 700);
    this.sfx('go', { volume: 0.55 });
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = (delta / 1000) * this.testSpeed;
    this.perf.frames++;
    // the core shows its HUD after createGame: the map keeps it hidden
    if (this.perf.frames === 1) this.showPlayUi(this.phase === 'play' || this.phase === 'intro');
    this.phaseT += dt;
    this.readButtons();
    const s = this.sim;
    if (!s) return;
    if (this.phase === 'intro' && this.phaseT >= INTRO_TIME) this.go();
    // the fixed-step sim (a hit stops it for a few frames)
    if (this.hitStop > 0) this.hitStop -= dt;
    else {
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
    }
    const mode = this.phase === 'map' || this.phase === 'shop' ? 'preview' : this.phase === 'intro' ? 'intro' : 'follow';
    this.view.sync(s, dt, { camera: mode, introT: this.phaseT / INTRO_TIME });
    if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'dead' || this.phase === 'clear') this.hudp.update(s, this.stageN);
    if (this.phase === 'play') {
      const cd = s.hero.dashCd;
      this.dashBtn.draw(cd > 0 ? 1 - cd / 0.9 : 1, dt);
      this.jumpBtn.draw(1, dt);
      this.tutorial(dt);
    }
    if (this.phase === 'clear' && this.phaseT > 2.4) this.finishStage();
  }

  private readButtons(): void {
    if (this.jumpBtn.take()) this.jumpPressed = true;
    if (this.dashBtn.take()) this.dashPressed = true;
    if (this.controls.justA()) this.jumpPressed = true;
    if (this.controls.justB()) this.dashPressed = true;
    if (this.phase === 'intro' && (this.jumpPressed || this.dashPressed) && this.phaseT > 0.3) { this.phaseT = INTRO_TIME; this.jumpPressed = this.dashPressed = false; }
  }

  private readInput(first: boolean): Input {
    const c = this.controls;
    const inp: Input = {
      mx: c.axisX, mz: c.axisY,
      jump: c.a || this.jumpBtn.held,
      jumpPressed: first && this.jumpPressed,
      dashPressed: first && this.dashPressed,
    };
    if (first) { this.jumpPressed = false; this.dashPressed = false; }
    return inp;
  }

  // ---------------------------------------------------------------- what happened

  private at(x: number, y: number, z: number): number { return this.view.screen(x, y, z).x; }

  /** Volume falls off with distance from the hero. */
  private near(x: number, z: number, v: number): number {
    const h = this.sim!.hero;
    const d = Math.hypot(x - h.x, z - h.z);
    return v * Math.max(0, 1 - d / 26);
  }

  private handle(evs: SimEvent[], s: Sim): void {
    const fx = this.view.fx, h = s.hero;
    for (const e of evs) {
      switch (e.e) {
        case 'jump': this.sfx('jump', { volume: 0.45 }); fx.dust(e.x, e.y, e.z, 6); break;
        case 'airjump': this.sfx('jump2', { volume: 0.5 }); fx.sparks(e.x, e.y + 0.2, e.z, 10, [0xffffff, POWER_COLOR.spring], 3, 0.5, 0.06); break;
        case 'land': this.sfx('land', { volume: Math.min(0.6, 0.15 + e.v / 40) }); fx.dust(e.x, e.y, e.z, Math.min(14, 4 + Math.floor(e.v / 2))); break;
        case 'dash': this.sfx('dash', { volume: 0.55 }); fx.sparks(e.x, e.y + 0.6, e.z, 12, [0xffffff, 0xbfe6ff], 4, 1, 0.07); padRumble(60, 0.3); break;
        case 'bounce': this.sfxAt('boing', this.at(e.x, e.y, e.z), { volume: 0.6 }); fx.sparks(e.x, e.y + 1.2, e.z, 14, [0xffd23a, 0xffffff], 4, 4, 0.07); this.view.shake(0.25); break;
        case 'pickup': this.pickup(e, s); break;
        case 'hurt':
          this.sfx('hurt', { volume: 0.6 });
          this.view.shake(0.75);
          this.hitStop = 0.085;
          flash(this, 0xff4a3a);
          fx.sparks(e.x, e.y + 0.8, e.z, 16, [0xff5a4a, 0xffffff], 5, 4, 0.08);
          padRumble(160, 0.7);
          break;
        case 'shieldPop': this.sfx('shieldPop', { volume: 0.6 }); fx.sparks(e.x, e.y + 0.7, e.z, 26, [0x8ad8ff, 0xffffff], 6, 3, 0.08); this.toast(t('shieldPop')); this.view.shake(0.4); this.hitStop = 0.05; break;
        case 'fall': this.sfx('fall', { volume: 0.5 }); this.toast(t('fell')); break;
        case 'respawn': this.sfx('respawn', { volume: 0.45 }); this.view.snap(s); fx.sparks(e.x, e.y + 0.6, e.z, 20, [0xffffff, 0xffd23a], 3, 3, 0.07); this.bot?.reset(); break;
        case 'die': this.die(); break;
        case 'checkpoint': this.sfx('checkpoint', { volume: 0.55 }); this.toast(t('checkpoint')); fx.confetti(e.x, e.y + 1.4, e.z, 30); break;
        case 'lever': this.sfx('lever', { volume: 0.6 }); fx.sparks(e.x, e.y + 0.8, e.z, 8, [0xffffff], 2, 2, 0.05); break;
        case 'door': this.sfx('door', { volume: 0.6 }); this.toast(t('gateOpen')); this.view.shake(0.25); break;
        case 'chest': this.sfx('chest', { volume: 0.6 }); this.toast(t('chestOpen')); fx.sparks(e.x, e.y + 1, e.z, 30, [0xffd23a, 0xffffff, 0xffa31a], 5, 7, 0.09); break;
        case 'needKey': this.sfx('deny', { volume: 0.4 }); this.toast(t('needKey')); break;
        case 'crumble': this.sfxAt('crumble', this.at(e.x, e.y, e.z), { volume: 0.5 }); fx.dust(e.x, e.y - 0.3, e.z, 10, 0xc8a070, 3); break;
        case 'trapUp': this.sfxAt('spike', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.3) }); break;
        case 'fire': {
          this.sfxAt('cannon', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.55) });
          for (let i = 0; i < 6; i++) fx.spawn(e.x, e.y + 0.6, e.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.3, 0.7, 0xd8d4cc, { drag: 2, grow: 1 });
          break;
        }
        case 'boom': {
          const d = Math.hypot(e.x - h.x, e.z - h.z);
          this.sfxAt('boom', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.7) });
          fx.boom(e.x, e.y, e.z, 1);
          if (d < 9) this.view.shake(0.6 * (1 - d / 9));
          break;
        }
        case 'fuse': this.sfxAt('fuse', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.4) }); break;
        case 'roll': this.sfxAt('roll', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.35) }); break;
        case 'drop': this.sfxAt('drop', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.35) }); break;
        case 'break': this.sfxAt('break', this.at(e.x, e.y, e.z), { volume: 0.55 }); fx.sparks(e.x, e.y, e.z, 18, [0xffe36a, 0xffffff, 0x5a5a66], 6, 4, 0.08); this.addScore(50, this.view.screen(e.x, e.y + 1, e.z).x, this.view.screen(e.x, e.y + 1, e.z).y); break;
        case 'powerEnd': this.sfx('powerDown', { volume: 0.4 }); break;
        case 'goal': this.goal(e.x, e.y, e.z); break;
        case 'stomp': case 'smash': {
          this.sfx(e.e === 'stomp' ? 'stomp' : 'smash', { volume: 0.6 });
          fx.sparks(e.x, e.y + 0.5, e.z, 18, [0xffffff, 0xffd23a, 0xff7a5a], 5, 5, 0.08);
          fx.dust(e.x, e.y, e.z, 8);
          this.view.shake(0.3);
          this.hitStop = 0.05;
          const p = this.view.screen(e.x, e.y + 1.2, e.z);
          this.addScore(FOE[e.kind].points, p.x, p.y);
          padRumble(80, 0.4);
          break;
        }
        case 'foeAlert': this.sfxAt(e.kind === 'bee' ? 'buzz' : 'roar', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.55) }); fx.sparks(e.x, e.y + 1, e.z, 6, [0xff3a2a, 0xffffff], 2, 2, 0.06); break;
        case 'foeHop': this.sfxAt('hop', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.35) }); break;
        case 'foeSwoop': this.sfxAt('dash', this.at(e.x, e.y, e.z), { volume: this.near(e.x, e.z, 0.45) }); break;
        case 'bump': this.sfx('bump', { volume: 0.55 }); if (!e.used) { this.sfx('chest', { volume: 0.4 }); fx.sparks(e.x, e.y + 0.6, e.z, 14, [0xffd23a, 0xffffff], 3, 5, 0.08); } this.view.shake(0.15); break;
      }
    }
  }

  private pickup(e: Extract<SimEvent, { e: 'pickup' }>, s: Sim): void {
    const p = e.p, fx = this.view.fx;
    const sx = this.view.screen(p.x, p.y + 0.6, p.z);
    switch (p.kind) {
      case 'coin': this.sfx('coin', { volume: 0.4 }); fx.glint(p.x, p.y, p.z, 0xffd23a, 6); this.addScore(SCORE.coin); break;
      case 'gem': this.sfx('gem', { volume: 0.55 }); fx.glint(p.x, p.y, p.z, p.gem === 'green' ? 0x5ae05a : p.gem === 'blue' ? 0x5ac8ff : 0xff5a9a, 14); this.addScore(GEM_POINTS[p.gem!], sx.x, sx.y); break;
      case 'star': this.sfx('star', { volume: 0.6 }); fx.glint(p.x, p.y, p.z, 0xffd23a, 22); this.toast(t('gotStar')); this.view.shake(0.15); break;
      case 'heart': case 'half': this.sfx('heal', { volume: 0.5 }); fx.glint(p.x, p.y, p.z, 0xff5a6a, 12); this.toast(t('gotHeart')); break;
      case 'key': this.sfx('key', { volume: 0.6 }); fx.glint(p.x, p.y, p.z, 0xffd23a, 14); this.toast(t('gotKey')); break;
      case 'power': {
        const id = p.power!;
        this.sfx('power', { volume: 0.6 });
        fx.sparks(p.x, p.y, p.z, 26, [POWER_COLOR[id], 0xffffff], 5, 4, 0.08);
        this.banner(t('p_' + id), S_POWER, 250, 1100);
        this.toast(t('pd_' + id));
        if (id === 'thunder') this.view.shake(0.3);
        break;
      }
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
    this.banner(t('loseHearts'), S_BANNER, 300, 1600);
    this.endGame({ title: t('loseHearts'), delay: 1500 });
  }

  /** The stage's coins go to the purse as soon as the run could end (none twice). */
  private bank(s: Sim): void {
    const more = s.stats.coins - this.banked;
    if (more > 0) { this.meta.coins += more; this.runCoins += more; this.banked = s.stats.coins; saveMeta(this.meta); }
  }

  private goal(x: number, y: number, z: number): void {
    this.phase = 'clear';
    this.phaseT = 0;
    this.showPlayUi(false);
    this.hudp.setVisible(true);
    this.sfx('fanfare', { volume: 0.6, exact: true });
    this.view.fx.confetti(x, y + 2, z, 90);
    this.banner(t('stageClear'), S_BIG, 260, 2200);
    padRumble(200, 0.5);
  }

  private finishStage(): void {
    const s = this.sim!, n = this.stageN, st = s.stats;
    this.phase = 'summary';
    this.clearBanners();
    this.showPlayUi(false);
    const w = WORLD_IDS.indexOf(worldOf(n));
    const best = this.meta.best[n - 1];
    const starsNow = st.stars.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
    const newStars = st.stars.map((on, i) => on && !((best.stars >> i) & 1));
    const bonus = Math.round(Math.max(0, s.c.par - st.time) * SCORE.perSecond);
    const noHit = st.hits === 0 && st.falls === 0 ? SCORE.noHit : 0;
    const starPts = st.stars.filter(Boolean).length * SCORE.star;
    const extra = bonus + noHit + starPts + SCORE.clear + SCORE.perWorld * w;
    this.addScore(extra);
    this.bank(s);
    const prize = CLEAR_COINS(w) + newStars.filter(Boolean).length * STAR_COINS;
    this.meta.coins += prize;
    this.runCoins += prize;
    const newBest = !best.time || st.time < best.time;
    best.stars |= starsNow;
    if (newBest) best.time = Math.round(st.time * 10) / 10;
    if (n >= this.meta.unlocked) this.meta.unlocked = Math.min(STAGE_COUNT + 1, n + 1);
    if (n === 1) this.meta.hints = [...new Set([...this.meta.hints, 'tut'])];
    this.meta.last = Math.min(STAGE_COUNT, n + 1);
    saveMeta(this.meta);
    this.panel = new SummaryScreen(this, this.host, {
      n, stars: st.stars, newStars, coins: st.coins + prize, gems: st.gems, time: st.time, newBest, bonus, noHit, score: s.points + extra,
    }, () => {
      this.panel = null;
      if (n === STAGE_COUNT) { this.phase = 'end'; this.endGame({ win: true, title: t('winTrail'), delay: 200 }); return; }
      this.stageN = Math.min(STAGE_COUNT, n + 1);
      this.openShop(() => this.openMap());
    });
  }

  // ---------------------------------------------------------------- the continue and the 2× reward

  /** A rewarded continue: back on the last checkpoint with full hearts (on the map: nothing to undo). */
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

  // ---------------------------------------------------------------- banners, toasts, the tutorial

  private banner(text: string, style: LabelStyle, y: number, ms: number): void {
    labelTexture(this, text, style);
    const img = labelAt(this, this.scale.width / 2, y, text, style).setScrollFactor(0).setDepth(9100).setScale(0.3);
    this.bannerImgs.push(img);
    this.tweens.add({ targets: img, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: y - 30, delay: ms, duration: 380, onComplete: () => { img.destroy(); this.bannerImgs = this.bannerImgs.filter((b) => b !== img); } });
  }

  private clearBanners(): void { for (const b of this.bannerImgs) { this.tweens.killTweensOf(b); b.destroy(); } this.bannerImgs = []; }

  toast(text: string, style: LabelStyle = S_TOAST, ms = 1300): void {
    this.toastImg?.destroy();
    const img = labelAt(this, this.scale.width / 2, this.scale.height - 150, text, style).setScrollFactor(0).setDepth(9100).setScale(0.6);
    this.toastImg = img;
    this.tweens.add({ targets: img, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: ms, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  private tutorial(dt: number): void {
    const tu = this.tut, s = this.sim;
    if (!tu || !s) return;
    tu.t += dt;
    const h = s.hero;
    const key = !this.touch;
    if (tu.step === 0 && tu.t > 0.6) { this.toast(t(key ? 'tut_moveKey' : 'tut_move'), S_HINT, 3200); tu.step = 1; tu.x = h.x; tu.z = h.z; }
    else if (tu.step === 1 && (Math.hypot(h.x - tu.x, h.z - tu.z) > 4 || tu.t > 5)) { this.toast(t(key ? 'tut_jumpKey' : 'tut_jump'), S_HINT, 3600); tu.step = 2; tu.t = 0; }
    else if (tu.step === 2 && tu.t > 7) { this.toast(t(key ? 'tut_dashKey' : 'tut_dash'), S_HINT, 3600); tu.step = 3; }
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__ttIcons = () => renderIconSheet(this.view.world.renderer);
    w.__tt = {
      state: () => {
        const s = this.sim;
        return {
          phase: this.phase, stage: this.stageN, score: this.score, coins: this.meta.coins, unlocked: this.meta.unlocked,
          hero: s ? { x: s.hero.x, y: s.hero.y, z: s.hero.z, hp: s.hero.hp, max: s.hero.max, state: s.hero.state, keys: s.hero.keys, shield: s.hero.shield, powers: { ...s.hero.powers }, ground: !!s.hero.ground } : null,
          stats: s ? { ...s.stats } : null, checkpoint: s?.checkpoint ?? -1, clock: s?.clock ?? 0, ranks: { ...this.meta.ranks },
          tune: s ? { ...s.tune } : null, textures: this.textures.getTextureKeys().length, view: this.view.stats(), waypoints: s?.c.waypoints.length ?? 0, botI: this.bot?.i ?? -1,
        };
      },
      start: (n = 1) => { this.startStage(n); this.phaseT = INTRO_TIME; },
      god: (on = true) => { if (this.sim) this.sim.god = on; },
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim) : null; },
      teleport: (x: number, y: number, z: number) => { const h = this.sim?.hero; if (h) { h.x = x; h.y = y; h.z = z; h.vx = h.vy = h.vz = 0; this.view.snap(this.sim!); } },
      goalPos: () => this.sim?.c.goal,
      checkpoints: () => this.sim?.c.checkpoints.map((c) => ({ x: c.x, y: c.y, z: c.z })),
      pickups: (kind?: string) => this.sim?.c.pickups.filter((p) => !p.taken && (!kind || p.kind === kind)).map((p) => ({ kind: p.kind, power: p.power, x: p.x, y: p.y, z: p.z })),
      hurt: (dmg = 1) => { const h = this.sim?.hero; if (h) this.sim!.hurt(dmg, h.x, h.z + 1); },
      fall: () => { const h = this.sim?.hero; if (h) { h.y = this.sim!.c.floor - 20; } },
      speed: (k: number) => { this.testSpeed = k; },
      open: (which: string) => this.openForShot(which),
      meta: (m: Partial<Meta>) => { Object.assign(this.meta, m); saveMeta(this.meta); },
      key: (code: string) => this.panel?.key(code),
      cam: (pos?: number[], look?: number[]) => { this.view.shotCam = pos && look ? [pos, look] : null; },
      stage: (name = 'busy') => this.stage(name),
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
        this.panel = new SummaryScreen(this, this.host, { n: this.stageN, stars: [true, true, false], newStars: [false, true, false], coins: 46, gems: 2, time: 63.4, newBest: true, bonus: 425, noHit: 750, score: 3240 }, () => { this.panel = null; });
        break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /** The store art's stage: the autopilot mid-course with traps all round it. */
  private stage(name: string): void {
    const n = name === 'canyon' ? 7 : name === 'frost' ? 12 : name === 'storm' ? 19 : 2;
    this.startStage(n);
    this.phaseT = INTRO_TIME;
    this.go();
    const s = this.sim!;
    s.god = true;
    this.bot = new Bot(s);
    this.clearBanners();
    for (let i = 0; i < 60 * 9 && s.hero.state === 'play'; i++) { s.step(DT, this.bot.input()); s.events.length = 0; }
    this.view.snap(s);
  }
}
