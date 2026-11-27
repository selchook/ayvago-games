// Dungeon Rescue: the play scene. A run starts on the dungeon map; each level cleared adds to the
// run's score, its coins go to the purse at once and the map opens again (the hideout from there).
// The run ends when the hearts run out in a level (a rewarded ad may bring the knight back once, at
// the last campfire), when the player ends it on the map, or when the Jailer Chief is locked in his
// own cell at the top of the Tower.
//   map → (PLAY) the level's figures load → intro sweep from the exit to the knight → play → out of
//   the exit stairs with the crowd → level-clear card → map
// The sim runs at a fixed 60 Hz (sim.ts); the view draws it (view.ts); the HUD and the touch buttons
// are hud.ts; the inner screens screens.ts.
import Phaser from 'phaser';
import { ArcadeScene, Controls, t, isEasy, isLandscape, flash, padRumble, playMusic, labelAt, labelTexture, fitWidth, type LabelStyle } from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Sim, NO_INPUT, cellX, cellZ, type Input, type SimEvent, type Guard } from './sim';
import { Bot } from './bot';
import { buildLevel, castOf, LEVEL_COUNT, wingOf, isBossLevel } from './levels';
import { DT, SCORE, CLEAR_COINS, STAR_COINS, WING_IDS, CREW, MOVE, CHIEF, perksOf, MUSIC } from './defs';
import { loadMeta, saveMeta, type Meta } from './meta';
import { MapScreen, SummaryScreen, HideoutScreen, type Panel, type ScreenHost, type HideoutTab } from './screens';
import { PlayHud, ActionButton, buttonLayout, S_BANNER, S_BIG, S_ALARM, S_SUBBANNER, S_TOAST, S_WARN, S_GOOD, S_POWER, S_HINT, S_PROMPT, S_BOSS, levelLabel, joinedText } from './hud';
import { CRIMSON, ROYAL, MOSS, SLATE } from './paint';
import { makeArt, POWER_ICON } from './art';
import { loadFigures } from './kit';

type Phase = 'map' | 'load' | 'intro' | 'play' | 'clear' | 'summary' | 'hideout' | 'dead' | 'end';

const INTRO_TIME = 2.2;

/** Coins the current (or last) run earned: the 2× reward is offered only when there are some. */
let runCoinsNow = 0;
export const lastRunCoins = (): number => runCoinsNow;

interface Mark { img: Phaser.GameObjects.Image; key: string; ring: Phaser.GameObjects.Graphics; pop: number }

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
  private btn!: { act: ActionButton; throw: ActionButton; power: ActionButton; crew: ActionButton; run: ActionButton };
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
  private pickRing!: Phaser.GameObjects.Graphics;
  private marks: Mark[] = [];
  private arrows: Phaser.GameObjects.Image[] = [];
  private tut: { step: number; t: number; x: number; z: number } | null = null;
  private pressed = { act: false, power: false, crew: false, throwUp: false };
  private keys!: Record<'e' | 'space' | 'q' | 'f' | 'c' | 'j' | 'k' | 'shift', Phaser.Input.Keyboard.Key>;
  private bellT = 0;
  private hideTab: HideoutTab = 'crew';
  private loadToken = 0;
  private wasAiming = false;
  testSpeed = 1;
  perf = { frames: 0, maxCalls: 0, maxTris: 0, chars: 0 };

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
    this.marks = [];
    this.arrows = [];
    this.tut = null;
    this.pressed = { act: false, power: false, crew: false, throwUp: false };
    this.bellT = 0;
    this.hideTab = 'crew';
    this.loadToken = 0;
    this.wasAiming = false;
    this.testSpeed = 1;
    this.perf = { frames: 0, maxCalls: 0, maxTris: 0, chars: 0 };
    this.levelN = Math.min(this.meta.last, this.meta.unlocked, LEVEL_COUNT);
    this.touch = this.sys.game.device.input.touch;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this);
    this.view.heroLook = this.meta.look;
    this.world = this.view.world;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.dispose());
    this.controls = new Controls(this, { joystick: true });
    const W = this.scale.width, H = this.scale.height;
    const L = buttonLayout(W, H);
    this.btn = {
      act: new ActionButton(this, L.act[0], L.act[1], L.act[2], 'dr-hand', t('act'), CRIMSON),
      throw: new ActionButton(this, L.throw[0], L.throw[1], L.throw[2], 'dr-vase', t('throw'), ROYAL, true),
      power: new ActionButton(this, L.power[0], L.power[1], L.power[2], 'dr-smoke', t('power'), MOSS, true),
      crew: new ActionButton(this, L.crew[0], L.crew[1], L.crew[2], 'dr-crew', t('crew'), SLATE),
      // the stick only walks (quiet); RUN is held to sprint (the armour clanks)
      run: new ActionButton(this, L.run[0], L.run[1], L.run[2], 'dr-swift', t('run'), SLATE),
    };
    this.hudp = new PlayHud(this, this.hud);
    this.pickRing = this.add.graphics().setScrollFactor(0).setDepth(9010);
    const kb = this.input.keyboard!;
    this.keys = { e: kb.addKey('E'), space: kb.addKey('SPACE'), q: kb.addKey('Q'), f: kb.addKey('F'), c: kb.addKey('C'), j: kb.addKey('J', false), k: kb.addKey('K', false), shift: kb.addKey('SHIFT') };
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.panel && !this.panel.closed) { this.panel.key(e.code); return; }
      if (this.phase === 'intro' && (e.code === 'Space' || e.code === 'Enter')) this.phaseT = INTRO_TIME;
    });
    this.showPlayUi(false);
    this.hooks();
    this.openMap();
  }

  // ---------------------------------------------------------------- the map, the hideout

  private showPlayUi(on: boolean): void {
    this.hudp.setVisible(on);
    for (const b of Object.values(this.btn)) b.setVisible(on && this.touch);
    if (!on) { this.clearPrompt(); this.pickRing.clear(); for (const m of this.marks) { m.img.setVisible(false); m.ring.clear(); } for (const a of this.arrows) a.setVisible(false); }
  }

  openMap(): void {
    this.closePanel();
    this.phase = 'map';
    this.showPlayUi(false);
    this.view.clearHideout();
    this.preview(this.levelN);
    this.panel = new MapScreen(this, this.host, this.meta, this.levelN, this.score, {
      select: (n) => { if (n !== this.levelN || !this.sim) this.preview(n); this.levelN = n; this.meta.last = n; saveMeta(this.meta); },
      play: (n) => this.startLevel(n),
      hideout: () => this.openHideout(),
      endRun: () => this.endRun(),
    });
  }

  /** The chosen level turning beside the board (its figures are loaded first). */
  private preview(n: number): void {
    this.levelN = n;
    const token = ++this.loadToken;
    loadFigures(this, this.figuresFor(n)).then(() => {
      if (token !== this.loadToken || (this.phase !== 'map' && this.phase !== 'hideout')) return;
      this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy(), perksOf(this.meta.companions));
      this.sim.god = true;
      this.view.setLook(this.meta.look);
      this.view.build(this.sim);
      this.view.snap(this.sim);
      this.bot = null;
    });
  }

  /** The figures a level shows, the knight's armour and the disguise. */
  private figuresFor(n: number): string[] { return [...castOf(n), this.meta.look, 'soldier']; }

  openHideout(): void {
    this.closePanel();
    this.phase = 'hideout';
    this.showPlayUi(false);
    const crew = this.meta.companions;
    loadFigures(this, [this.meta.look, ...crew]).then(() => { if (this.phase === 'hideout') this.view.showHideout(this.meta.look, this.meta.companions); });
    this.panel = new HideoutScreen(this, this.host, this.meta, this.hideTab, {
      changed: () => {
        loadFigures(this, [this.meta.look, ...this.meta.companions]).then(() => { if (this.phase === 'hideout') { this.view.setLook(this.meta.look); this.view.showHideout(this.meta.look, this.meta.companions); } });
      },
      back: () => { this.panel = null; this.view.clearHideout(); this.openMap(); },
    });
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
    this.phase = 'load';
    this.toast('loading', S_TOAST, 4000);
    const token = ++this.loadToken;
    loadFigures(this, this.figuresFor(n)).then(() => { if (token === this.loadToken && this.phase === 'load') this.begin(n); });
  }

  private begin(n: number): void {
    this.sim = new Sim(buildLevel(n), this.meta.ranks, isEasy(), perksOf(this.meta.companions));
    this.view.setLook(this.meta.look);
    this.view.build(this.sim);
    this.view.snap(this.sim);
    this.view.warm();
    this.banked = 0;
    this.scored = 0;
    this.bot = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.acc = 0;
    this.bellT = 0;
    this.showPlayUi(true);
    for (const b of Object.values(this.btn)) b.setVisible(false);
    this.clearBanners();
    this.makeMarks();
    this.toastImg?.destroy(); this.toastImg = null; this.toastT = 0;
    this.banner(t('l' + n), S_BANNER, 250, 1800);
    this.banner(levelLabel(n) + '  ·  ' + t('w_' + wingOf(n)), S_SUBBANNER, 194, 1800, true);
    this.sfx('start', { volume: 0.5 });
    playMusic(this, MUSIC);
    if (isBossLevel(n)) this.time.delayedCall(900, () => { if (this.levelN === n && (this.phase === 'intro' || this.phase === 'play')) this.chiefEntrance(); });
    this.tut = n === 1 && !this.meta.hints.includes('tut') ? { step: 0, t: 0, x: 0, z: 0 } : null;
  }

  private chiefEntrance(): void {
    this.banner(t('chiefName'), S_BOSS, 330, 1700);
    this.sfx('sting', { volume: 0.6, exact: true });
    this.view.shake(0.35);
    padRumble(220, 0.5);
  }

  private go(): void {
    this.phase = 'play';
    this.phaseT = 0;
    this.showPlayUi(true);
    this.banner(t('go'), S_BIG, 360, 600);
    this.sfx('go', { volume: 0.5 });
    const hint = this.sim?.c.hint;
    if (hint && !this.meta.hints.includes(hint)) {
      const n = this.levelN;
      this.time.delayedCall(this.tut ? 7600 : 900, () => { if (this.phase === 'play' && this.levelN === n) this.toast(hint, S_HINT, 5600, true); });
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
    if (this.phase === 'hideout') { this.view.syncHideout(dt); return; }
    this.readButtons();
    const s = this.sim;
    if (!s) return;
    if (this.phase === 'intro' && this.phaseT >= INTRO_TIME) this.go();
    if (this.hitStop > 0) this.hitStop -= dt;
    else if (this.phase !== 'map' && this.phase !== 'load' && this.phase !== 'summary') {
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
    } else s.clock += dt;
    if (this.phase === 'play' || this.phase === 'clear' || this.phase === 'dead') {
      const more = s.points - this.scored;
      if (more > 0) { this.addScore(more); this.scored = s.points; }
    }
    const mode = this.phase === 'map' || this.phase === 'load' || this.phase === 'summary' ? 'preview' : this.phase === 'intro' ? 'intro' : 'follow';
    this.view.sync(s, dt, { camera: mode, introT: this.phaseT / INTRO_TIME });
    if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'dead' || this.phase === 'clear') this.hudp.update(s, this.levelN, this.time.now);
    if (this.phase === 'play') {
      this.drawPlay(s, dt);
      const st = this.view.stats();
      this.perf.maxCalls = Math.max(this.perf.maxCalls, st.calls);
      this.perf.maxTris = Math.max(this.perf.maxTris, st.triangles);
      this.perf.chars = s.guards.length + s.followers.length + 1;
    }
    if (this.phase === 'clear' && this.phaseT > 2.8) this.finishLevel();
    // the alarm bell
    if (s.alarm && this.phase === 'play') { this.bellT -= dt; if (this.bellT <= 0) { this.bellT = s.alarmT < 15 ? 0.9 : 1.8; this.sfx('bell', { volume: 0.32 }); } }
  }

  private drawPlay(s: Sim, dt: number): void {
    const h = s.hero;
    const tg = s.target();
    const verb = h.state === 'hidden' ? 'v_unhide' : !tg ? '' : tg.kind === 'celldoor' ? (h.keys > 0 ? 'v_key' : 'v_pick') : tg.kind === 'barrel' || tg.kind === 'crate' ? 'v_hide' : 'v_' + tg.kind;
    this.btn.act.setWord(t(verb || 'act'));
    this.btn.act.draw(dt, !!verb);
    this.btn.throw.draw(dt, h.throws > 0 || s.stats.coins > 0, h.throws > 0 ? h.throws : -1);
    if (h.bag.length) this.btn.power.setIcon(POWER_ICON[h.bag[0]]);
    this.btn.power.draw(dt, h.bag.length > 0, h.bag.length || -1);
    this.btn.crew.draw(dt, s.followers.some((f) => f.mode !== 'cell'));
    this.btn.run.draw(dt, true);
    this.showPrompt(verb, tg);
    // the lock-pick / key-ring ring
    const g = this.pickRing.clear();
    const k = h.pick > 0 ? h.pick : h.steal;
    if (k > 0) {
      const th = h.pick > 0 ? s.things[h.pickId] : null;
      const p = th ? this.view.screen(th.x, 1.4, th.z) : this.view.screen(h.x, 2.2, h.z);
      g.lineStyle(10, 0x1a1214, 0.7).beginPath().arc(p.x, p.y, 30, 0, Math.PI * 2).strokePath();
      g.lineStyle(7, h.steal > 0 ? 0xffd060 : 0x8ae070, 1).beginPath().arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)).strokePath();
    }
    this.drawMarks(s, dt);
    this.drawArrows(s);
    this.tutorial(dt);
    // leaving with someone missing
    if (h.atExit && h.state === 'play' && s.followers.some((f) => f.mode !== 'cell') && s.followers.some((f) => f.mode === 'cell' || f.mode === 'wait')) this.toast('leaveNow', S_TOAST, 1400);
  }

  private readButtons(): void {
    const k = this.keys, JD = Phaser.Input.Keyboard.JustDown, JU = Phaser.Input.Keyboard.JustUp;
    if (this.btn.act.take() || JD(k.e) || JD(k.space)) this.pressed.act = true;
    // F / C, and the pad's Y and X (the core sends them as K and J)
    if (this.btn.power.take() || JD(k.f) || JD(k.k)) this.pressed.power = true;
    if (this.btn.crew.take() || JD(k.c) || JD(k.j)) this.pressed.crew = true;
    this.btn.throw.take();
    this.btn.run.take(); this.btn.run.takeRelease();
    if (this.btn.throw.takeRelease() || JU(k.q)) this.pressed.throwUp = true;
    if (this.controls.justA()) this.pressed.act = true;
    if (this.phase === 'intro' && (this.pressed.act || this.pressed.power) && this.phaseT > 0.3) { this.phaseT = INTRO_TIME; this.pressed.act = this.pressed.power = false; }
  }

  private readInput(first: boolean): Input {
    const c = this.controls, k = this.keys;
    const throwHeld = k.q.isDown || this.btn.throw.held;
    const inp: Input = {
      mx: c.axisX, mz: c.axisY,
      sprint: k.shift.isDown || c.b || this.btn.run.held,
      act: k.e.isDown || k.space.isDown || this.btn.act.held || c.a,
      actPressed: first && this.pressed.act,
      throwHeld,
      throwReleased: first && this.pressed.throwUp,
      powerPressed: first && this.pressed.power,
      crewPressed: first && this.pressed.crew,
    };
    if (first) this.pressed = { act: false, power: false, crew: false, throwUp: false };
    this.wasAiming = throwHeld;
    return inp;
  }

  // ---------------------------------------------------------------- the marks over the guards' heads

  private makeMarks(): void {
    for (const m of this.marks) { m.img.destroy(); m.ring.destroy(); }
    for (const a of this.arrows) a.destroy();
    this.marks = (this.sim?.guards ?? []).map(() => ({ img: this.add.image(0, 0, 'dr-q').setScrollFactor(0).setDepth(9005).setVisible(false), key: '', ring: this.add.graphics().setScrollFactor(0).setDepth(9004), pop: 0 }));
    this.arrows = (this.sim?.guards ?? []).map(() => this.add.image(0, 0, 'dr-arrow').setScrollFactor(0).setDepth(9006).setDisplaySize(40, 40).setVisible(false));
  }

  private drawMarks(s: Sim, dt: number): void {
    s.guards.forEach((g, i) => {
      const m = this.marks[i];
      if (!m) return;
      const key = g.mark === '!' ? 'dr-x' : g.mark === '?' ? 'dr-q' : g.mark === 'z' ? 'dr-z' : '';
      const showRing = !key && g.susp > 0.05 && s.awake(g);
      m.ring.clear();
      if (!key && !showRing) { m.img.setVisible(false); m.key = ''; return; }
      const p = this.view.screen(g.x, (g.boss ? CHIEF.scale : 1) * 1.95, g.z);
      if (showRing) {
        m.img.setVisible(false);
        m.ring.lineStyle(6, 0x1a1214, 0.6).beginPath().arc(p.x, p.y - 26, 16, 0, Math.PI * 2).strokePath();
        m.ring.lineStyle(4, 0xffd060, 1).beginPath().arc(p.x, p.y - 26, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g.susp / 0.42)).strokePath();
        return;
      }
      if (key !== m.key) { m.key = key; m.img.setTexture(key); m.pop = 0.25; }
      m.pop = Math.max(0, m.pop - dt);
      const sc = (key === 'dr-z' ? 0.4 : 0.56) * (1 + m.pop * 2.2);
      m.img.setVisible(true).setPosition(p.x, p.y - 30 + (key === 'dr-z' ? Math.sin(this.time.now / 300) * 4 : 0)).setScale(sc);
      if (key === 'dr-q' && g.susp < 1 && g.state === 'search') {
        m.ring.lineStyle(5, 0xff6030, 0.9).beginPath().arc(p.x, p.y - 32, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g.susp)).strokePath();
      }
    });
  }

  /** The Elf's sharp eyes: arrows at the screen's edge toward awake guards out of view. */
  private drawArrows(s: Sim): void {
    const on = s.perks.sharp;
    const W = this.scale.width, H = this.scale.height;
    s.guards.forEach((g, i) => {
      const a = this.arrows[i];
      if (!a) return;
      if (!on || !s.awake(g)) { a.setVisible(false); return; }
      const p = this.view.screen(g.x, 1, g.z);
      if (p.x > 40 && p.x < W - 40 && p.y > 160 && p.y < H - 40 && p.visible) { a.setVisible(false); return; }
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const k = Math.min((W / 2 - 34) / Math.max(1, Math.abs(dx)), (H / 2 - 120) / Math.max(1, Math.abs(dy)));
      a.setVisible(true).setPosition(cx + dx * k, cy + dy * k).setRotation(Math.atan2(dy, dx)).setTint(g.state === 'chase' ? 0xff6050 : 0xffffff);
    });
  }

  // ---------------------------------------------------------------- what happened

  private at(x: number, z: number, y = 0.5): number { return this.view.screen(x, y, z).x; }
  private near(x: number, z: number, v: number): number {
    const h = this.sim!.hero;
    return v * Math.max(0.15, 1 - Math.hypot(x - h.x, z - h.z) / 24);
  }

  private handle(evs: SimEvent[], s: Sim): void {
    const fx = this.view.fx, h = s.hero;
    for (const e of evs) {
      switch (e.e) {
        case 'step':
          if (e.sprint) { this.sfx('clank', { volume: 0.32 }); fx.ring(e.x, e.z, s.k.sprintNoise * (s.hero.swift > 0 ? 0 : 1), 0x9ac8ff, 0.55); }
          else this.sfx('step', { volume: 0.12 });
          break;
        case 'pickup': this.pickup(e); break;
        case 'full': this.toast('full'); this.sfx('deny', { volume: 0.3 }); break;
        case 'unlock':
          this.sfxAt('unlock', this.at(e.x, e.z), { volume: 0.6 });
          fx.sparks(e.x, 1.1, e.z, 14, [0xd8d8e0, 0xffd070], 3, 3, 0.06);
          this.sfx('gate', { volume: 0.45 });
          break;
        case 'pickTick': this.sfx('tick', { volume: 0.35, rate: 0.9 + e.k * 0.5 }); break;
        case 'pickBreak': this.toast('pickBreak', S_WARN, 1400); this.sfx('deny', { volume: 0.4 }); break;
        case 'gate': this.sfxAt('gate', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.6) }); fx.dust(e.x, 0.1, e.z, 8, 0x8a8a92, 1.6); this.toast(e.open ? 'gateOpen' : 'gateShut', S_TOAST, 1200); break;
        case 'lever': this.sfxAt('lever', this.at(e.x, e.z), { volume: 0.6 }); fx.sparks(e.x, 0.9, e.z, 8, [0xffffff, 0xffd070], 2, 2, 0.05); break;
        case 'torchOut': this.sfxAt('puff', this.at(e.x, e.z), { volume: 0.5 }); fx.dust(e.x, 1.5, e.z, 6, 0x6a6470, 0.8); this.toast('torchOut', S_TOAST, 1000); break;
        case 'hide': this.sfxAt('hide', this.at(e.x, e.z), { volume: 0.5 }); fx.dust(e.x, 0.4, e.z, 6, 0x8a7a66, 1.2); break;
        case 'unhide': this.sfx('hide', { volume: 0.35, rate: 1.2 }); break;
        case 'throw': this.sfx('whoosh', { volume: 0.45 }); break;
        case 'land':
          this.sfxAt(e.kind === 'coin' ? 'coin' : e.kind === 'vase' ? 'smash' : 'thud', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.7) });
          fx.ring(e.x, e.z, 6.6 * s.k.lure, 0xffd060, 0.8);
          fx.sparks(e.x, 0.3, e.z, 12, e.kind === 'coin' ? [0xffd040, 0xffffff] : [0xc07a4a, 0x8a5a30, 0xd8a060], 3, 4, 0.07);
          break;
        case 'mark': {
          if (e.mark === '?') this.sfxAt('huh', this.at(s.guards[e.g].x, s.guards[e.g].z), { volume: this.near(s.guards[e.g].x, s.guards[e.g].z, 0.45) });
          if (e.mark === '!') { this.sfx('alert', { volume: 0.55 }); this.view.shake(0.18); padRumble(120, 0.4); }
          break;
        }
        case 'caught':
          this.sfx('caught', { volume: 0.65 });
          this.view.shake(0.9);
          this.hitStop = 0.12;
          flash(this, 0xd83a1a);
          fx.sparks(e.x, 1, e.z, 16, [0xff5a3a, 0xffffff], 4, 3, 0.07);
          padRumble(220, 0.7);
          if (h.hp > 0) this.banner(t('caught'), S_BIG, 330, 1000);
          break;
        case 'die': this.die(); break;
        case 'respawn': this.sfx('respawn', { volume: 0.45 }); this.view.snap(s); this.bot?.reset(); break;
        case 'fall': this.sfx('fall', { volume: 0.55 }); this.toast('fell', S_WARN, 1800); this.view.shake(0.4); break;
        case 'freed': this.freed(e.id, e.x, e.z); break;
        case 'crew': this.toast(e.mode === 'wait' ? 'crewWait' : 'crewFollow', S_TOAST, 1100); this.sfx(e.mode === 'wait' ? 'move' : 'start', { volume: 0.4 }); break;
        case 'power': this.powerUsed(e.id, e.x, e.z); break;
        case 'noPower': this.toast('noPower'); this.sfx('deny', { volume: 0.35 }); break;
        case 'noThrow': this.toast('noThrow'); this.sfx('deny', { volume: 0.35 }); break;
        case 'decoy': this.sfxAt(e.moo ? 'moo' : 'rattle', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.6), rate: e.moo ? 0.55 : 1 }); fx.ring(e.x, e.z, 8, e.moo ? 0xffffff : 0xffc040, 0.9); break;
        case 'spikes': if (e.up) this.sfxAt('spikes', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.4) }); break;
        case 'spiked': this.sfx('hurt', { volume: 0.6 }); this.toast('spiked', S_WARN, 1300); this.view.shake(0.6); flash(this, 0xd83a1a); this.hitStop = 0.08; break;
        case 'creak': this.sfxAt('creak', this.at(e.x, e.z), { volume: 0.5 }); break;
        case 'trapdoor': this.sfxAt('trapdoor', this.at(e.x, e.z), { volume: this.near(e.x, e.z, 0.55) }); fx.dust(e.x, 0.1, e.z, 8, 0x8a7a66, 1.6); break;
        case 'guardFall': this.sfx('fall', { volume: 0.5 }); this.toast('guardFell', S_GOOD, 1400); fx.dust(e.x, 0.1, e.z, 12, 0x8a7a66, 2); break;
        case 'locked': this.sfx('gate', { volume: 0.6 }); this.toast('lockedIn', S_GOOD, 1400); break;
        case 'wake': this.sfxAt('huh', this.at(s.guards[e.g].x, s.guards[e.g].z), { volume: 0.4, rate: 0.85 }); break;
        case 'doze': this.sfx('powder', { volume: 0.5 }); this.toast('dozing', S_GOOD, 1200); break;
        case 'shrug': this.toast('shrug', S_WARN, 1600); this.sfx('deny', { volume: 0.45 }); break;
        case 'chiefCall': this.toast('chiefCall', S_WARN, 1800); this.sfx('shout', { volume: 0.55 }); this.view.shake(0.2); break;
        case 'chiefWind': if (e.kind === 'charge') this.sfx('huh', { volume: 0.5, rate: 0.7 }); else this.sfx('whoosh', { volume: 0.5, rate: 0.7 }); break;
        case 'chiefCharge': fx.dust(e.x, 0.05, e.z, 3, 0x8a7a66, 1.4); this.sfx('step', { volume: 0.35, rate: 0.7 }); break;
        case 'chiefDaze': this.sfx('thud', { volume: 0.7 }); this.view.shake(0.5); fx.sparks(e.x, 1.6, e.z, 14, [0xffffff, 0xffe080], 3, 3, 0.06); break;
        case 'chiefSlam': this.sfx('slam', { volume: 0.7 }); this.view.shake(0.8); fx.ring(e.x, e.z, CHIEF.slamR, 0xff8050, 0.7); fx.dust(e.x, 0.05, e.z, 16, 0x8a7a66, 3.4); padRumble(200, 0.6); break;
        case 'chiefCheck': this.sfx('hide', { volume: 0.4, rate: 0.8 }); break;
        case 'stealTick': this.sfx('tick', { volume: 0.3, rate: 1.2 + e.k * 0.4 }); break;
        case 'stolen': this.sfx('keys', { volume: 0.7 }); this.toast('stolen', S_GOOD, 1500); fx.glint(e.x, 1.3, e.z, 0xffd060, 14); if (s.c.boss?.trick === 'final') this.time.delayedCall(1200, () => { if (this.phase === 'play') this.toast('h_final2', S_HINT, 4200, true); }); break;
        case 'outwit': this.outwit(e.x, e.z); break;
        case 'keysBack': this.time.delayedCall(900, () => { if (this.phase === 'play') this.toast('keysBack', S_WARN, 2600); }); break;
        case 'alarm': break;
        case 'alarmLow': this.toast('alarmLow', S_WARN, 1800); break;
        case 'timeUp': this.toast('timeUp', S_WARN, 1800); break;
        case 'chest': this.sfx('fanfare', { volume: 0.5, exact: true }); this.toast('chest', S_GOOD, 1500); fx.glint(e.x, 1.2, e.z, 0xffd040, 22); fx.sparks(e.x, 1, e.z, 26, [0xffd040, 0xffffff, 0xffa020], 4, 6, 0.08); break;
        case 'needMore': this.toast(t('needMore', { n: e.n }), S_WARN, 1600, false, true); this.sfx('deny', { volume: 0.35 }); break;
        case 'checkpoint': this.sfxAt('ignite', this.at(e.x, e.z), { volume: 0.5 }); this.toast('checkpoint', S_TOAST, 1500); fx.embers(e.x, 0.6, e.z, 8, 0xffa040); break;
        case 'door': if (this.near(e.x, e.z, 1) > 0.5) this.sfxAt('door', this.at(e.x, e.z), { volume: 0.25 }); break;
        case 'clear': this.clear(e.x, e.z); break;
      }
    }
  }

  private pickup(e: Extract<SimEvent, { e: 'pickup' }>): void {
    const fx = this.view.fx;
    switch (e.kind) {
      case 'coins': case 'bag': case 'coin':
        this.sfx(e.kind === 'bag' ? 'coins' : 'coin', { volume: 0.45 });
        fx.glint(e.x, 0.6, e.z, 0xffd040, e.kind === 'bag' ? 14 : 8);
        fx.sparks(e.x, 0.4, e.z, e.kind === 'bag' ? 14 : 6, [0xffd040, 0xffe880], 2, 4, 0.06);
        break;
      case 'key': this.sfx('keys', { volume: 0.6 }); fx.glint(e.x, 0.6, e.z, 0xffd040, 12); break;
      case 'vase': case 'bucket': this.sfx('grab', { volume: 0.45 }); break;
      case 'power': {
        const id = e.power!;
        this.sfx('power', { volume: 0.6 });
        fx.sparks(e.x, 0.8, e.z, 24, [0xffffff, 0xffe080], 4, 4, 0.07);
        this.banner(t('p_' + id), S_POWER, 300, 1100);
        this.toast('pd_' + id, S_TOAST, 2200);
        break;
      }
    }
  }

  private freed(id: string, x: number, z: number): void {
    const fx = this.view.fx;
    const first = !this.meta.crew.includes(id);
    if (first) { this.meta.crew.push(id); saveMeta(this.meta); }
    this.sfx('cheer', { volume: 0.6, exact: true });
    fx.confetti(x, 2, z, 40);
    if (first && CREW[id]) this.toast(joinedText(id), S_GOOD, 2000, false, true);
    else this.toast('freed', S_GOOD, 1300);
    padRumble(120, 0.3);
  }

  private powerUsed(id: string, x: number, z: number): void {
    const fx = this.view.fx;
    switch (id) {
      case 'smoke': this.sfx('smoke', { volume: 0.6 }); fx.smoke(x, 0.2, z, 34); this.view.shake(0.2); break;
      case 'disguise': this.sfx('power', { volume: 0.5, rate: 0.8 }); fx.sparks(x, 1, z, 20, [0x6a8a4a, 0xffffff], 3, 3, 0.06); break;
      case 'swift': this.sfx('power', { volume: 0.5, rate: 1.2 }); fx.dust(x, 0, z, 10, 0x40c8ff, 2); break;
      case 'decoy': this.sfx('grab', { volume: 0.5 }); break;
      case 'powder': this.sfx('powder', { volume: 0.5 }); fx.sparks(x, 1.2, z, 22, [0xc8a0ff, 0xffffff], 2, 2, 0.05); break;
    }
  }

  private outwit(x: number, z: number): void {
    const s = this.sim!;
    this.sfx('fanfare', { volume: 0.6, exact: true });
    this.banner(t('outwit'), S_BANNER, 300, 1700);
    this.view.fx.confetti(x, 2.4, z, 50);
    this.view.shake(0.5);
    padRumble(240, 0.6);
    // then the bell
    this.time.delayedCall(1300, () => {
      if (this.phase !== 'play') return;
      this.banner(t('alarm'), S_ALARM, 330, 1100);
      this.toast('alarmRun', S_WARN, 2400);
      this.sfx('alarm', { volume: 0.6 });
      flash(this, 0xd02010);
      this.view.shake(0.6);
      this.bellT = 0;
    });
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
    this.sfx('cheer', { volume: 0.5, exact: true });
    this.view.fx.confetti(x, 2.2, z, 70);
    this.banner(t('escaped'), S_BIG, 330, 2400);
    padRumble(200, 0.5);
  }

  private finishLevel(): void {
    const s = this.sim!, n = this.levelN, st = s.stats;
    this.phase = 'summary';
    this.clearBanners();
    this.showPlayUi(false);
    const w = WING_IDS.indexOf(wingOf(n));
    const best = this.meta.best[n - 1];
    const stars = [st.rescued >= st.total, !st.spotted, st.time <= s.c.par];
    const starsNow = stars.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
    const newStars = stars.map((on, i) => on && !((best.stars >> i) & 1));
    const bonus = Math.max(0, Math.round((s.c.par - st.time) * SCORE.parSecond));
    const unseen = st.spotted ? 0 : SCORE.unseen;
    const starPts = stars.filter(Boolean).length * SCORE.star;
    const extra = bonus + unseen + starPts + SCORE.clear + SCORE.perWing * w;
    this.addScore(extra);
    this.bank(s);
    const prize = CLEAR_COINS(w) + newStars.filter(Boolean).length * STAR_COINS;
    this.meta.coins += prize;
    this.runCoins += prize;
    const newBest = !best.time || st.time < best.time;
    best.stars |= starsNow;
    if (st.chest) best.chest = true;
    if (newBest) best.time = Math.round(st.time * 10) / 10;
    if (n >= this.meta.unlocked) this.meta.unlocked = Math.min(LEVEL_COUNT + 1, n + 1);
    if (n === 1) this.meta.hints = [...new Set([...this.meta.hints, 'tut'])];
    this.meta.last = Math.min(LEVEL_COUNT, n + 1);
    saveMeta(this.meta);
    this.panel = new SummaryScreen(this, this.host, {
      n, stars, newStars, rescued: `${st.rescued}/${st.total}`, coins: st.coins + prize, time: st.time, newBest, unseen, bonus, chief: st.outwit ? SCORE.outwit : 0, score: s.points + extra,
    }, () => {
      this.panel = null;
      if (n === LEVEL_COUNT) { this.phase = 'end'; this.endGame({ win: true, title: t('winAll'), delay: 200 }); return; }
      this.levelN = Math.min(LEVEL_COUNT, n + 1);
      this.openMap();
    });
  }

  // ---------------------------------------------------------------- the continue and the 2× reward

  /** A rewarded continue: full hearts at the last campfire (on the map: nothing to undo). */
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

  /** Once per run; a run ended on purpose (END RUN, the last level) has nothing to continue. */
  canContinue(): boolean { return !this.revived && this.phase !== 'end'; }

  /** The 2× reward: the run's coins once more (never the score). */
  doubleCoins(): void {
    this.meta.coins += this.runCoins;
    this.runCoins *= 2;
    saveMeta(this.meta);
  }

  // ---------------------------------------------------------------- banners, toasts, the prompt, the tutorial

  /** Portrait has room above the knight; landscape keeps the banners in the band above him. */
  private bannerY(y: number): number { return isLandscape() ? Math.round(y * 0.62) : y; }

  private banner(text: string, style: LabelStyle, y0: number, ms: number, fit = false): void {
    labelTexture(this, text, style);
    const y = this.bannerY(y0);
    const img = labelAt(this, this.scale.width / 2, y, text, style).setScrollFactor(0).setDepth(9100);
    if (fit) fitWidth(img, 660);
    const sc = img.scale;
    img.setScale(sc * 0.3);
    this.bannerImgs.push(img);
    this.tweens.add({ targets: img, scale: sc, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: y - 30, delay: ms, duration: 380, onComplete: () => { img.destroy(); this.bannerImgs = this.bannerImgs.filter((b) => b !== img); } });
  }

  private clearBanners(): void { for (const b of this.bannerImgs) { this.tweens.killTweensOf(b); b.destroy(); } this.bannerImgs = []; }

  /** A toast under the knight; `raw` takes the text as given (else an i18n key). */
  toast(key: string, style: LabelStyle = S_TOAST, ms = 1300, wrapLong = false, raw = false): void {
    if (key === this.toastKey && this.toastT > 0) return;
    this.toastKey = key; this.toastT = (ms / 1000) * 0.6;
    this.toastImg?.destroy();
    const land = isLandscape();
    const img = labelAt(this, this.scale.width / 2, this.scale.height - (land ? 118 : this.touch ? 440 : 190), raw ? key : t(key), style).setScrollFactor(0).setDepth(9100);
    fitWidth(img, land ? (this.touch ? 560 : 780) : wrapLong ? 690 : 660);
    const sc = img.scale;
    img.setScale(sc * 0.6);
    this.toastImg = img;
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: ms, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  /** The verb over the thing ACT would use (keyboard and pad; touch reads it on the button). */
  private showPrompt(verb: string, tg: ReturnType<Sim['target']>): void {
    if (!verb || this.touch) { this.clearPrompt(); return; }
    if (verb !== this.promptKey) {
      this.clearPrompt();
      this.promptKey = verb;
      this.prompt = labelAt(this, 0, 0, t(verb), S_PROMPT).setScrollFactor(0).setDepth(9000);
    }
    const s = this.sim!, h = s.hero;
    const g: Guard | null = tg?.g ?? null;
    const x = tg?.th ? tg.th.x + (tg.th.kind === 'torch' ? tg.th.dc * 0.9 : 0) : g ? g.x : h.x;
    const z = tg?.th ? tg.th.z + (tg.th.kind === 'torch' ? tg.th.dr * 0.9 : 0) : g ? g.z : h.z;
    const p = this.view.screen(x, tg?.th?.kind === 'torch' ? 2.4 : 2.1, z);
    this.prompt!.setPosition(p.x, p.y + Math.sin(this.time.now / 180) * 3);
  }

  private clearPrompt(): void { this.prompt?.destroy(); this.prompt = null; this.promptKey = ''; }

  private tutorial(dt: number): void {
    const tu = this.tut, s = this.sim;
    if (!tu || !s) return;
    tu.t += dt;
    const h = s.hero;
    const key = !this.touch;
    if (tu.step === 0 && tu.t > 0.6) { this.toast(key ? 'tut_moveKey' : 'tut_move', S_HINT, 3400, true); tu.step = 1; tu.x = h.x; tu.z = h.z; }
    else if (tu.step === 1 && (Math.hypot(h.x - tu.x, h.z - tu.z) > 2 || tu.t > 5)) { this.toast(key ? 'tut_actKey' : 'tut_act', S_HINT, 4200, true); tu.step = 2; tu.t = 0; }
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__dr = {
      state: () => {
        const s = this.sim;
        return {
          phase: this.phase, level: this.levelN, score: this.score, coins: this.meta.coins, unlocked: this.meta.unlocked, crew: [...this.meta.crew], companions: [...this.meta.companions], look: this.meta.look,
          hero: s ? { x: s.hero.x, z: s.hero.z, hp: s.hero.hp, max: s.hero.max, state: s.hero.state, keys: s.hero.keys, throws: s.hero.throws, bag: [...s.hero.bag], disguise: s.hero.disguise } : null,
          stats: s ? { ...s.stats } : null, alarm: s?.alarm ?? false, alarmT: s?.alarmT ?? 0, phase2: s?.phase ?? 0,
          followers: s ? s.followers.map((f) => f.mode) : [], start: s?.c.start ?? null, ranks: { ...this.meta.ranks },
          tune: s ? { ...s.tune } : null, textures: this.textures.getTextureKeys().length, view: this.view.stats(), perf: { ...this.perf }, botI: this.bot?.i ?? -1,
          guards: s ? s.guards.map((g) => ({ k: g.k, x: g.x, z: g.z, state: g.state, susp: g.susp, mark: g.mark })) : [],
          detection: s?.detection() ?? '',
        };
      },
      start: (n = 1) => { this.startLevel(n); },
      skipIntro: () => { if (this.phase === 'intro') this.phaseT = INTRO_TIME; },
      god: (on = true) => { if (this.sim) this.sim.god = on; },
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim) : null; },
      teleport: (c: number, r: number) => { const h = this.sim?.hero; if (h) { h.x = cellX(c); h.z = cellZ(r); h.vx = h.vz = 0; this.view.snap(this.sim!); } },
      caught: () => { const s = this.sim; const g = s?.guards[0]; if (s && g) (s as unknown as { caught(g: Guard): void }).caught(g); },
      speed: (k: number) => { this.testSpeed = k; },
      open: (which: string) => this.openForShot(which),
      meta: (m: Partial<Meta>) => { Object.assign(this.meta, m); saveMeta(this.meta); },
      key: (code: string) => this.panel?.key(code),
      cam: (pos?: number[], look?: number[]) => { this.view.shotCam = pos && look ? [pos, look] : null; },
      stage: (n = 3, secs = 8) => this.stageShot(n, secs),
      give: (id: string) => { this.sim?.hero.bag.push(id as never); },
      play: this,
    };
  }

  private openForShot(which: string): void {
    this.closePanel();
    switch (which) {
      case 'map': this.openMap(); break;
      case 'hideout': this.hideTab = 'crew'; this.openHideout(); break;
      case 'looks': this.hideTab = 'looks'; this.openHideout(); break;
      case 'shop': this.hideTab = 'shop'; this.openHideout(); break;
      case 'summary':
        this.phase = 'summary'; this.showPlayUi(false);
        this.panel = new SummaryScreen(this, this.host, { n: this.levelN, stars: [true, true, false], newStars: [false, true, false], rescued: '2/2', coins: 46, time: 63.4, newBest: true, unseen: 600, bonus: 220, chief: this.levelN % 5 === 0 ? 1000 : 0, score: 3240 }, () => { this.panel = null; });
        break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /** The store art's stage: the autopilot a few seconds into a level. */
  private stageShot(n: number, secs: number): Promise<void> {
    return new Promise((resolve) => {
      this.startLevel(n);
      const wait = () => {
        if (this.phase !== 'intro') { this.time.delayedCall(50, wait); return; }
        this.phaseT = INTRO_TIME;
        this.go();
        const s = this.sim!;
        s.god = true;
        this.bot = new Bot(s);
        this.clearBanners();
        for (let i = 0; i < 60 * secs && s.hero.state === 'play'; i++) { s.step(DT, this.bot.input()); s.events.length = 0; }
        this.view.snap(s);
        resolve();
      };
      wait();
    });
  }
}

void S_HINT;
