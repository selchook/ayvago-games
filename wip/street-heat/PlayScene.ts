// Street Heat: the Play scene. PLAY opens the DISPATCH board over the city at night (story jobs,
// free roam, the quick modes, the garage, the map); START runs the job on the simulation (sim.ts,
// jobs.ts) drawn in 3D (view.ts) with the themed HUD (hud.ts) on top. The car steers through the
// shared car steering (arrows, wheel or tilt on touch; ←/→ on keys; the stick and triggers on a
// pad). A finished job plays a short instant replay and its card, then the core's result screen;
// RETRY there replays the job (NEXT after a won story job) from its case file.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, CarSteering, isEasy, t, padAxes, padConnected, padRumble, flash, burst, registerStrings,
  labelAt, fitWidth, themeCard, overlayHeadingStyle, themeLabel, GlyphText, iconButton, hudChip, HudChip, HUD_MARGIN, HUD_ROW2_Y, HUD_CHIP_H, labelTexture, type LabelStyle,
} from '@core';
import { model, type World3D } from '@core/three';
import { View, type CamMode } from './view';
import { Sim, NO_INPUT, type DriveInput, type SimEvent } from './sim';
import { Job, MISSIONS, type Mode, type JobEvent } from './jobs';
import { TUNING, clamp, fmtMoney, mmss, carSpec, CARS, KMH, COP_MODEL, type Tuning, type CarId } from './defs';
import { loadMeta, saveMeta, unlocked, type Meta } from './meta';
import { adoptPack, loadCity, cityReady } from './kit';
import { city, type Spot } from './city';
import { DriveHud, makeIcons, UI_DEPTH } from './hud';
import { Dispatch, Garage, type DispatchChoice } from './screens';
import { calloutAt, calloutStyle, subStyle, BANNER_PX, WORD_PX, PANEL, caps, INK } from './theme';
import { makeSounds, Loop } from './audio';
import type { MapData } from './mapui';
import { Bot, SKILL } from './bot';

type Phase = 'hub' | 'garage' | 'brief' | 'drive' | 'replay' | 'end';

/** The callouts' fixed words and colours (painted under the Ayvago intro: prebakeCallouts). */
const BANNERS: [string, string][] = [['busted', '#ff4060'], ['wrecked', '#ff4060'], ['lost', '#5dff7a'], ['roadblock', '#ff4060'], ['popped', '#ff8a1e'],
  ['delivered', '#5dff7a'], ['pickedUp', '#3ef2ff'], ['passengerIn', '#3ef2ff'], ['jobDone', '#5dff7a'], ['shiftOver', '#5dff7a'], ['timeLow', '#ff6070']];
const WORDS: [string, string][] = [['pursuit', '#ff4060'], ['searchOn', '#7ff6ff'], ['takedown', '#ffb03a'], ['spikes', '#ff8a1e'], ['redLight', '#ff4060'],
  ['nitroGo', '#7ff6ff'], ['checkpoint', '#ffd23f'], ['careful', '#ffb03a'], ['newJob', '#ffd23f'], ['smokeWarn', '#c8c8d0'], ['fireWarn', '#ff6a1a']];

/** Paints the fixed callouts ahead (menuTheme.prebake, under the Ayvago intro): light, a few dozen labels. */
export function prebakeCallouts(scene: Phaser.Scene): void {
  for (const [k, c] of BANNERS) labelTexture(scene, caps(t(k)), calloutStyle(c));
  for (const [k, c] of WORDS) labelTexture(scene, caps(t(k)), calloutStyle(c, WORD_PX));
  for (let n = 1; n <= 5; n++) labelTexture(scene, caps(t('heatN', { n })), calloutStyle('#ff4060'));
  for (const m of ['story', 'roam', 'getaway', 'rush']) labelTexture(scene, caps(t('m_' + m)), calloutStyle(m === 'story' ? '#ffb03a' : '#3ef2ff'));
  labelTexture(scene, caps(t('go')), subStyle('#fff4e2'));
  labelTexture(scene, caps(t('replay')), calloutStyle('#ff4060', 40));
}

/** RETRY on the result screen comes back here: straight to the job's case file. */
let pendingRetry = false;
export function clearRetry(): void { pendingRetry = false; }
let banked = 0;
/** What the last finished run put in the bank (the 2× reward offers it again). */
export const lastBanked = (): number => banked;

const CARD_ROW: LabelStyle = { size: 26, color: '#5a3a1a', stroke: null, shadow: false, body: true };
const CARD_VAL: LabelStyle = { size: 28, color: '#2a1d14', stroke: null, shadow: false };

interface Snap { t: number; data: Float32Array }

export class PlayScene extends ArcadeScene {
  protected useHud = false;
  view!: View;
  world!: World3D;
  sim!: Sim;
  job: Job | null = null;
  meta!: Meta;
  tune!: Tuning;
  controls!: Controls;
  steering!: CarSteering;
  dhud!: DriveHud;
  phase: Phase = 'hub';
  private dispatch: Dispatch | null = null;
  private garage: Garage | null = null;
  private goal!: HudChip;
  private route: number[] = [];
  private routeT = 0;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private hornKey = false;
  private nitroKey = false;
  private engine!: Loop;
  private squeal!: Loop;
  private siren!: Loop;
  private hum!: Loop;
  private snaps: Snap[] = [];
  private snapT = 0;
  private replayT = 0;
  private banked = 0;
  private lastClockSec = -1;
  private tipT = 0;
  private tipStep = 0;
  /** The job just ended (the replay and the card follow once). */
  private ending = false;
  private camBtn: Phaser.GameObjects.Container | null = null;
  private replayLabel: Phaser.GameObjects.Container | null = null;
  private card: Phaser.GameObjects.Container | null = null;
  private endTitle = '';
  private endWin = false;
  private hubSpot!: Spot;
  /** Test hooks. */
  testInput: Partial<DriveInput> | null = null;
  testSpeed = 1;
  perf = { frames: 0, update: 0, maxUpdate: 0, calls: 0, maxCalls: 0 };
  static forceSeed: number | null = null;
  private bot: Bot | null = null;

  createGame(): void {
    adoptPack('cars', model('sh-cars', { shadows: false }));
    void loadCity();
    makeIcons(this);
    makeSounds(this.game);
    this.useHudChipsOnce();
    this.meta = loadMeta();
    this.tune = TUNING[isEasy() ? 'easy' : 'normal'];
    this.phase = 'hub';
    this.job = null;
    this.dispatch = null;
    this.garage = null;
    this.route = [];
    this.snaps = [];
    this.banked = 0;
    this.card = null;
    this.replayLabel = null;
    this.tipBox = null;
    this.tipStep = 0;
    this.ending = false;
    this.routeT = 0;
    this.snapT = 0;
    this.replayT = 0;
    this.cardAt = 0;
    this.newCar = null;
    this.hornKey = false;
    this.nitroKey = false;
    this.lastClockSec = -1;
    this.testInput = null;
    this.testSpeed = 1;
    this.bot = null;
    this.perf = { frames: 0, update: 0, maxUpdate: 0, calls: 0, maxCalls: 0 };
    registerStrings({ tr: { retry: 'TEKRAR' }, en: { retry: 'RETRY' } });
    this.hubSpot = city().places.get('garage')!;
    this.sim = this.makeSim('roam', 1);
    this.sim.frozen = true;
    this.view = new View(this, { night: 1 });
    this.world = this.view.world;
    this.view.cam = this.meta.cam;
    this.view.orbit = true;
    this.view.snap(this.sim);
    // build the nearest chunks before the first frame
    for (let i = 0; i < 12 && cityReady(); i++) this.view.buildStep(1);

    this.controls = new Controls(this, {});
    const { width: W, height: H } = this.scale;
    this.steering = new CarSteering(this, {
      touch: this.controls.touchUi,
      buttons: [
        { id: 'gas', shape: 'pedal', x: W - 78, y: H - 128, w: 118, h: 210, color: 0x2fae5a, label: t('gas'), labelY: -40, hit: { right: Infinity, bottom: Infinity, left: 12 } },
        { id: 'brake', shape: 'pedal', x: W - 212, y: H - 104, w: 108, h: 156, color: 0xd8453c, label: t('brake'), labelY: -22, labelSize: 20, hit: { bottom: Infinity, left: 12 } },
        { id: 'hbrake', shape: 'round', x: W - 222, y: H - 266, r: 50, color: 0xff3fa4, label: t('hbrake'), labelSize: 15 },
        { id: 'nitro', shape: 'round', x: W - 82, y: H - 300, r: 50, color: 0x2aa8ff, icon: 'bolt', count: true, holds: 'gas' },
        { id: 'horn', shape: 'round', x: W - 340, y: H - 190, r: 40, color: 0xffb03a, label: t('horn'), labelSize: 15 },
      ],
      ramp: 0.32,
    });
    this.dhud = new DriveHud(this, () => this.openMap(), !!this.steering.pad);
    this.goal = hudChip(this, W / 2, 50, { align: 'center', text: '', size: 22, depth: UI_DEPTH - 5 });
    // touch only: under the job meter chip (cargo, calm, suspicion, the SUV) on the second HUD row
    this.camBtn = iconButton(this, HUD_MARGIN + 36, HUD_ROW2_Y + HUD_CHIP_H / 2 + 46, 'sh-cam', () => this.cycleCam(), 64).setScrollFactor(0).setDepth(UI_DEPTH - 5);
    this.camBtn.setVisible(false);
    this.setHudVisible(false);

    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { space: kb.addKey(KC.SPACE), shift: kb.addKey(KC.SHIFT), n: kb.addKey(KC.N) };
    // keys and the pad's keys (gamepad.ts): horn H / X / Q, nitro Shift / N / J / E, camera C / K
    for (const k of ['H', 'X', 'Q']) kb.on('keydown-' + k, () => { if (this.phase === 'drive') this.hornKey = true; });
    for (const k of ['N', 'SHIFT', 'J', 'E']) kb.on('keydown-' + k, () => { if (this.phase === 'drive') this.nitroKey = true; });
    for (const k of ['C', 'K']) kb.on('keydown-' + k, () => { if (this.phase === 'drive') this.cycleCam(); });
    kb.on('keydown-M', () => { if (this.phase === 'drive') this.openMap(); });
    kb.on('keydown-ENTER', () => { if (this.phase === 'replay') this.replayT = 99; else if (this.phase === 'end') this.finishCard(); });
    this.input.on('pointerup', () => { if (this.phase === 'replay') this.replayT = 99; else if (this.phase === 'end' && this.cardAt > 0.6) this.finishCard(); });

    this.engine = new Loop(this, 'engine');
    this.squeal = new Loop(this, 'sh-squeal');
    this.siren = new Loop(this, 'sh-siren');
    this.hum = new Loop(this, 'sh-city');

    if (pendingRetry && (this.meta.mode !== 'story' || unlocked(this.meta, this.meta.mission))) this.openBrief();
    else this.openHub();
  }

  /** The score chip reads cash. */
  private useHudChipsOnce(): void { this.hud.setScore(0); this.hud.scoreChip.setText(fmtMoney(0)); this.hud.layout(); }

  private makeSim(mode: Mode, mission: number): Sim {
    const c = city();
    const def = mode === 'story' ? MISSIONS.find((m) => m.id === mission) ?? MISSIONS[0] : null;
    const start = def ? c.places.get(def.start)! : mode === 'getaway' ? c.places.get('docks')! : c.places.get('garage')!;
    return new Sim({
      car: this.meta.car, up: this.meta.up, paint: this.meta.paint, tune: this.tune,
      seed: PlayScene.forceSeed ?? Math.floor(Math.random() * 1e9), start, night: def?.night ?? 1, police: def?.police ?? true,
    });
  }

  private setHudVisible(v: boolean): void {
    this.dhud.setVisible(v);
    this.hud.setVisible(v);
    this.goal.setVisible(v);
    this.camBtn?.setVisible(v && !!this.steering.pad);
  }

  // ---------------------------------------------------------------- the hub, the garage, the brief

  private openHub(): void {
    this.phase = 'hub';
    this.view.orbit = true;
    this.setHudVisible(false);
    this.steering.end();
    this.dispatch = new Dispatch(this, this.meta, this.tune.time, (c) => this.startJob(c), () => this.openGarage(), () => this.openMap());
  }

  private openBrief(): void {
    this.phase = 'brief';
    this.view.orbit = true;
    this.setHudVisible(false);
    this.steering.end();
    this.dispatch = new Dispatch(this, this.meta, this.tune.time, (c) => this.startJob(c), () => this.openGarage(), () => this.openMap(), 'file');
  }

  private openGarage(): void {
    this.dispatch?.close();
    this.dispatch = null;
    this.phase = 'garage';
    this.view.orbit = true;
    this.garage = new Garage(this, this.meta, () => this.refreshCar(), () => { this.garage = null; this.openHub(); });
  }

  /** The garage changed the car or its paint: the parked car shows it. */
  private refreshCar(): void {
    const p = this.sim.player;
    p.model = carSpec(this.meta.car).model;
    p.paint = this.meta.paint;
    this.sfx('ui-click');
  }

  private openMap(): void {
    if (!this.scene.isActive() || this.scene.isActive('Map')) return;
    this.scene.pause();
    const data: MapData = { sim: this.sim, job: this.job, route: this.route, from: this.scene.key };
    this.scene.launch('Map', data);
  }

  private cycleCam(): void {
    const order: CamMode[] = ['chase', 'far', 'bumper'];
    this.view.cam = order[(order.indexOf(this.view.cam) + 1) % 3];
    this.meta.cam = this.view.cam;
    saveMeta(this.meta);
    this.sfx('ui-click');
  }

  // ---------------------------------------------------------------- running a job

  private startJob(c: DispatchChoice): void {
    this.dispatch = null;
    this.meta.mode = c.mode;
    this.meta.mission = c.mission;
    saveMeta(this.meta);
    this.sim = this.makeSim(c.mode, c.mission);
    this.job = new Job(this.sim, c.mode, c.mission, this.tune);
    const night = c.mode === 'story' ? MISSIONS[c.mission - 1].night : 1;
    this.view.setNight(night);
    this.view.orbit = false;
    this.view.reset();
    this.view.snap(this.sim);
    this.phase = 'drive';
    this.ending = false;
    this.setHudVisible(true);
    this.steering.begin();
    this.steering.centre();
    this.lastClockSec = -1;
    this.snaps = [];
    this.setCash(0);
    const W = this.scale.width;
    this.startBanner = c.mode === 'story' ? this.banner(W / 2, 250, t(`m${c.mission}t`), '#ffb03a', 58, t('jobN', { n: c.mission }))
      : this.banner(W / 2, 250, t('m_' + c.mode), '#3ef2ff', 58, t('go'));
    this.sfx('go', { volume: 0.6 });
    // the first job teaches the controls
    this.tipT = 0;
    this.tipStep = 0;
    if (!this.meta.seenIntro) this.time.delayedCall(2200, () => { if (this.phase === 'drive') this.tip(t(this.steering.pad ? 'tip_touch' : 'tip_keys'), 7); });
  }

  private setCash(n: number): void {
    this.score = n;
    this.hud.scoreChip.setText(fmtMoney(n));
    this.hud.layout();
  }

  private readInput(dt: number): DriveInput {
    const c = this.controls, st = this.steering;
    let steer = st.steer(dt, c.axisX);
    let gas = c.up || st.isDown('gas') ? 1 : 0;
    let brake = c.down || st.isDown('brake') ? 1 : 0;
    if (padConnected()) {
      const a = padAxes();
      if (Math.abs(a.lx) > 0.12) steer = Math.sign(a.lx) * Math.pow(Math.abs(a.lx), 1.3);
      gas = Math.max(gas, a.rt);
      brake = Math.max(brake, a.lt);
    }
    const nitro = this.nitroKey || st.take('nitro');
    const horn = this.hornKey || st.take('horn');
    this.nitroKey = false;
    this.hornKey = false;
    return { steer, gas, brake, handbrake: this.keys.space.isDown || st.isDown('hbrake'), nitro, horn };
  }

  updateGame(_time: number, delta: number): void {
    const t0 = performance.now();
    const dt = delta / 1000;
    this.steering.update(dt);
    this.view.buildStep(this.phase === 'drive' ? 2 : 3);
    if (this.phase === 'drive' && this.job) this.driveStep(dt);
    else if (this.phase === 'replay') this.replayStep(dt);
    else if (this.phase === 'end') this.cardAt += dt;
    else {
      // the hub: traffic goes on round the parked car
      this.sim.step(dt, NO_INPUT);
      this.sim.events.length = 0;
    }
    this.view.sync(this.sim, this.phase === 'drive' ? this.job : null, dt);
    this.sounds(dt);
    const d = performance.now() - t0;
    this.perf.frames++; this.perf.update += d; this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
    this.perf.calls = this.view.drawCalls; this.perf.maxCalls = Math.max(this.perf.maxCalls, this.view.drawCalls);
  }

  private driveStep(dt: number): void {
    const sim = this.sim, job = this.job!;
    const inp = this.bot ? this.bot.input(dt) : this.testInput ? { ...NO_INPUT, ...this.testInput } : this.readInput(dt);
    const step = dt * this.testSpeed;
    sim.step(step, inp);
    job.update(step);
    for (const ev of sim.events) this.onSim(ev);
    for (const ev of job.events) this.onJob(ev);
    sim.events.length = 0;
    job.events.length = 0;
    // the route to the target (every 0.4 s)
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 0.4;
      const nav = job.nav;
      this.route = nav ? sim.city.route(sim.player.x, sim.player.z, nav.x, nav.z).pts : [];
    }
    if (job.cash !== this.score) this.setCash(job.cash);
    this.updateGoal();
    this.dhud.sync(sim, job, this.route, job.nav, (x, y, z) => this.view.toScreen(x, y, z), dt);
    this.steering.pad?.setCount('nitro', sim.nitro);
    this.record(dt);
    // the clock's last seconds tick
    const sec = job.clock === Infinity ? -1 : Math.ceil(job.clock);
    if (sec !== this.lastClockSec) {
      if (sec > 0 && sec <= 10) this.sfx('tick', { volume: 0.35 });
      if (sec === 10) this.banner(this.scale.width / 2, 300, t('timeLow'), '#ff6070', 40);
      this.lastClockSec = sec;
    }
    // the first job: point at the marker when it comes close
    if (!this.meta.seenIntro && job.nav && this.tipStep < 2) {
      const d = Math.hypot(job.nav.x - sim.player.x, job.nav.z - sim.player.z);
      if (this.tipStep === 0 && sim.time > 12) { this.tipStep = 1; this.tip(t('tip_gps'), 5); }
      if (d < 45 && job.markers.length && sim.time > 4) { this.tipStep = 2; this.tip(t('tip_marker'), 5); }
    }
    if (job.over) this.jobOver();
  }

  private updateGoal(): void {
    const job = this.job!;
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(job.goal.vars)) vars[k] = typeof v === 'string' && v.startsWith('pl_') ? t(v) : v === '' ? t('g_mark') : v;
    let s = t(job.goal.key, vars);
    if (job.def) s = job.stageLabel + '  ' + s;
    if (this.goal.text.text !== s) {
      this.goal.setText(s);
      // room between the cash chip and the heat chip
      const room = this.dhud.heat.left - this.hud.scoreChip.right - 30;
      this.goal.setScale(Math.min(1, room / Math.max(1, this.goal.chipWidth)));
      this.goal.setPosition((this.hud.scoreChip.right + this.dhud.heat.left) / 2, 50);
      this.tweens.add({ targets: this.goal, alpha: { from: 0.3, to: 1 }, duration: 300 });
    }
  }

  // ---------------------------------------------------------------- events

  private onSim(ev: SimEvent): void {
    const sim = this.sim, p = sim.player;
    const W = this.scale.width;
    this.view.handle(ev, sim);
    const at = (x: number, z: number) => this.view.toScreen(x, 1.2, z);
    switch (ev.type) {
      case 'crash': {
        const k = clamp(ev.impact / 16, 0.2, 1);
        this.sfx(ev.impact > 9 ? 'crashBig' : 'crash', { volume: 0.4 + k * 0.5 });
        this.sfx('crunch', { volume: 0.3 + k * 0.4 });
        this.cameras.main.shake(180 + k * 160, 0.003 + k * 0.006);
        if (ev.impact > 10) flash(this, 0xffffff, 100, 0.2);
        padRumble(160, 0.3 + k * 0.6);
        break;
      }
      case 'scrape': this.sfx('scrape', { volume: 0.25 }); break;
      case 'prop': {
        this.sfx(ev.kind === 'cone' || ev.kind === 'sign' ? 'clonk' : ev.kind === 'bin' ? 'bin' : 'thump', { volume: 0.5 });
        break;
      }
      case 'honk': if (Math.hypot(ev.x - p.x, ev.z - p.z) < 30) this.sfx('sh-horn', { volume: 0.22, rate: 0.85 }); break;
      case 'horn': this.sfx('sh-horn', { volume: 0.55, exact: true }); break;
      case 'nitro': this.sfx('nitro', { volume: 0.6 }); this.word(W / 2, 420, t('nitroGo'), '#7ff6ff'); padRumble(300, 0.5); break;
      case 'stars': {
        this.sfx('alarm', { volume: 0.5 });
        this.banner(W / 2, 200, t('heatN', { n: ev.stars }), '#ff4060', 46);
        if (ev.stars === 1 && !this.meta.seenIntro) this.tip(t('tip_heat'), 6);
        break;
      }
      case 'pursuit': if (this.sim.stars > 0) this.word(W / 2, 260, t('pursuit'), '#ff4060'); break;
      case 'search': this.word(W / 2, 260, t('searchOn'), '#7ff6ff'); this.sfx('blip', { volume: 0.4 }); break;
      case 'lost': this.banner(W / 2, 220, t('lost'), '#5dff7a', 52); this.sfx('lostThem', { volume: 0.6, exact: true }); burst(this, W / 2, 220, [0x5dff7a, 0xffffff], 30, 320); break;
      case 'busted': this.sfx('busted', { volume: 0.7, exact: true }); break;
      case 'wrecked': this.sfx('crashBig', { volume: 0.9 }); this.sfx('explode', { volume: 0.7 }); flash(this, 0xff7a1a, 260, 0.4); padRumble(500, 1); break;
      case 'takedown': {
        const s = at(ev.x, ev.z);
        this.sfx('explode', { volume: 0.5 });
        this.word(clamp(s.x, 160, W - 160), clamp(s.y - 60, 160, 520), t('takedown'), '#ffb03a');
        break;
      }
      case 'roadblock': this.banner(W / 2, 200, t('roadblock'), '#ff4060', 44); this.sfx('alarm', { volume: 0.4 }); break;
      case 'spikes': this.word(W / 2, 300, t('spikes'), '#ff8a1e'); break;
      case 'popped': this.banner(W / 2, 220, t('popped'), '#ff8a1e', 44); this.sfx('pop', { volume: 0.7 }); break;
      case 'redLight': if (this.sim.seen) this.word(W / 2, 330, t('redLight'), '#ff4060'); break;
      case 'land': if (ev.impact > 5) this.sfx('land', { volume: clamp(ev.impact / 14, 0.3, 0.8) }); break;
      case 'jump': if (ev.dist > 10) { this.word(W / 2, 260, t('airM', { n: Math.round(ev.dist) }), '#ffd23f'); sim.stats.jumps++; } break;
      case 'smoke': this.word(W / 2, 380, t(ev.level >= 3 ? 'fireWarn' : 'smokeWarn'), ev.level >= 3 ? '#ff6a1a' : '#c8c8d0'); break;
      default: break;
    }
  }

  private onJob(ev: JobEvent): void {
    const W = this.scale.width;
    switch (ev.type) {
      case 'stage': {
        const vars: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(ev.vars ?? {})) vars[k] = typeof v === 'string' && v.startsWith('pl_') ? t(v) : v === '' ? t('g_mark') : v;
        if (this.job?.def && this.job.stage > 0) this.word(W / 2, 340, t(ev.key, vars), '#fff4e2', 30);
        break;
      }
      case 'pickup': {
        this.sfx('pickup', { volume: 0.6 });
        const k = this.job?.def?.stages[this.job.stage - 1];
        const passenger = k?.type === 'goto' && k.act === 'passenger';
        this.banner(W / 2, 250, t(passenger ? 'passengerIn' : 'pickedUp'), '#3ef2ff', 50);
        if (this.job?.cargoKind === 'fragile') this.time.delayedCall(900, () => this.word(W / 2, 330, t('careful'), '#ffb03a'));
        if (this.job?.mode === 'roam' || this.job?.mode === 'rush') this.word(W / 2, 330, t('newJob'), '#ffd23f');
        break;
      }
      case 'deliver': {
        this.sfx('deliver', { volume: 0.6, exact: true });
        this.banner(W / 2, 250, t('delivered'), '#5dff7a', 54, ev.pay ? '+' + fmtMoney(ev.pay) : undefined);
        burst(this, W / 2, 250, [0x5dff7a, 0xffd23f, 0xffffff], 34, 360);
        break;
      }
      case 'checkpoint': {
        this.sfx('check', { volume: 0.6, rate: 1 + (8 - ev.left) * 0.04 });
        this.word(W / 2, 280, t('checkpoint'), '#ffd23f', 40);
        break;
      }
      case 'cash': this.word(W / 2, 300, `${t(ev.key)} ${ev.n > 0 ? '+' : '−'}${fmtMoney(Math.abs(ev.n))}`, ev.n > 0 ? '#5dff7a' : '#ffb03a', 32); this.sfx(ev.n > 0 ? 'cash' : 'spray', { volume: 0.6 }); break;
      case 'time': this.word(W / 2, 170, t('addTime', { n: ev.n }), '#5dff7a', 30); break;
      case 'warn': this.word(W / 2, 330, t(ev.key), '#ffb03a', 30); this.sfx('deny', { volume: 0.4 }); break;
      case 'cargo': this.sfx('glass', { volume: 0.4 }); break;
      case 'swap': {
        // the impound: the car changes under you
        const p = this.sim.player;
        const spec = carSpec(ev.car);
        p.model = spec.model; p.len = spec.length; p.wid = spec.width; p.paint = 0xd8342a;
        this.sfx('pickup', { volume: 0.6 });
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- floating words

  /** The mode's name over the street as a run starts (the autopilot clears it). */
  private startBanner: Phaser.GameObjects.Container | null = null;
  private banner(x: number, y: number, s: string, color: string, size: number, sub?: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH + 50);
    c.add(fitWidth(calloutAt(this, 0, 0, s, calloutStyle(color)), 900, size / BANNER_PX));
    if (sub) c.add(fitWidth(calloutAt(this, 0, size * 0.55 + 22, sub, subStyle('#fff4e2')), 800));
    c.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: y - 40, alpha: 0, delay: 1300, duration: 380, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
    return c;
  }

  private word(x: number, y: number, s: string, color: string, size = 36): void {
    const img = fitWidth(calloutAt(this, x, y, s, calloutStyle(color, WORD_PX)), 800, size / WORD_PX).setScrollFactor(0).setDepth(UI_DEPTH + 40);
    const k = img.scale;
    img.setScale(k * 0.4);
    this.tweens.add({ targets: img, scale: k, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, y: y - 50, alpha: 0, delay: 800, duration: 420, onComplete: () => img.destroy() });
  }

  private tipBox: Phaser.GameObjects.Container | null = null;
  private tip(s: string, secs: number): void {
    this.tipBox?.destroy();
    // the autopilot (store art, screenshots) needs no tutorial
    if (this.bot) { this.tipBox = null; return; }
    const W = this.scale.width;
    const txtObj = this.add.text(0, 0, s, { fontFamily: '"Nunito", sans-serif', fontStyle: '800', fontSize: '22px', color: '#fff4e2', align: 'center', wordWrap: { width: 640 } }).setOrigin(0.5);
    const g = this.add.graphics();
    const w = Math.min(700, txtObj.width + 50), h = txtObj.height + 26;
    // its top under the clock chip (second HUD row), however many lines it has
    const c = this.add.container(W / 2, HUD_ROW2_Y + HUD_CHIP_H / 2 + 14 + h / 2).setScrollFactor(0).setDepth(UI_DEPTH + 60);
    g.fillStyle(0x0a0614, 0.86).fillRoundedRect(-w / 2, -h / 2, w, h, 14).lineStyle(2, 0x3ef2ff, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add([g, txtObj]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 250 });
    this.tipBox = c;
    this.time.delayedCall(secs * 1000, () => { if (this.tipBox === c) { this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() }); this.tipBox = null; } });
  }

  // ---------------------------------------------------------------- sound

  private sounds(dt: number): void {
    const sim = this.sim, p = sim.player;
    const live = this.phase === 'drive' && !sim.busted && !sim.wrecked;
    const sp = p.speedAbs / Math.max(20, sim.hand.top);
    // revs: rise with speed, drop at each "gear"
    const gear = (sp * 4) % 1;
    this.engine.set(live ? 0.18 + sp * 0.14 : 0, 0.65 + gear * 0.55 + sp * 0.5 + (p.nitroT > 0 ? 0.25 : 0), dt, 10);
    this.squeal.set(live && p.skid > 1.2 && p.speedAbs > 5 ? clamp((p.skid - 1.2) * 0.12, 0, 0.32) : 0, 0.95 + sp * 0.1, dt, 12);
    let near = Infinity;
    for (const c of sim.cars) if (c.siren) near = Math.min(near, Math.hypot(c.x - p.x, c.z - p.z));
    this.siren.set(this.phase !== 'end' && near < 120 ? 0.32 * (1 - near / 120) : 0, 1, dt, 3);
    this.hum.set(this.phase === 'end' ? 0 : 0.18, 1, dt, 2);
  }

  // ---------------------------------------------------------------- the replay

  private record(dt: number): void {
    this.snapT += dt;
    if (this.snapT < 0.05) return;
    this.snapT = 0;
    const sim = this.sim, p = sim.player;
    const list = sim.cars.filter((c) => Math.abs(c.x - p.x) < 70 && Math.abs(c.z - p.z) < 70).slice(0, 24);
    const data = new Float32Array(list.length * 6);
    list.forEach((c, i) => { data.set([c.id, c.x, c.z, c.h, c.y, c.brakeLight ? 1 : 0], i * 6); });
    this.snaps.push({ t: sim.time, data });
    if (this.snaps.length > 140) this.snaps.shift();
  }

  private startReplay(): void {
    if (this.snaps.length < 30) { this.showCard(); return; }
    this.phase = 'replay';
    this.replayT = 0;
    this.steering.end();
    this.setHudVisible(false);
    const W = this.scale.width;
    const c = this.add.container(W / 2, 640).setScrollFactor(0).setDepth(UI_DEPTH + 50);
    const dot = this.add.circle(-170, 0, 9, 0xff3040);
    this.tweens.add({ targets: dot, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
    c.add([dot, calloutAt(this, 0, 0, t('replay'), calloutStyle('#ff4060', 40))]);
    this.replayLabel = c;
  }

  private replayStep(dt: number): void {
    this.replayT += dt;
    const total = 4.5;
    const sim = this.sim;
    if (this.replayT >= total) {
      this.view.replay = null;
      this.replayLabel?.destroy();
      this.replayLabel = null;
      this.showCard();
      return;
    }
    // play the last ~5.5 s from 6 s ago, a little slowed
    const frames = this.snaps;
    const span = frames[frames.length - 1].t - frames[0].t;
    const startT = frames[frames.length - 1].t - Math.min(span, 5.5);
    const at = startT + this.replayT * 1.2;
    let i = frames.findIndex((f) => f.t >= at);
    if (i < 0) i = frames.length - 1;
    const f = frames[i];
    const byId = new Map(sim.cars.map((c) => [c.id, c]));
    const shown = new Set<number>();
    for (let k = 0; k < f.data.length; k += 6) {
      const c = byId.get(f.data[k]);
      if (!c) continue;
      c.x = f.data[k + 1]; c.z = f.data[k + 2]; c.h = f.data[k + 3]; c.y = f.data[k + 4]; c.brakeLight = f.data[k + 5] > 0;
      shown.add(c.id);
    }
    for (const c of sim.cars) if (!shown.has(c.id)) c.y = -50;
    const p = sim.player;
    this.view.replay = { x: p.x, y: p.y, z: p.z, h: p.h, t: this.replayT, shot: Math.floor(this.replayT / 1.5) % 3 };
  }

  // ---------------------------------------------------------------- the end of a job

  private jobOver(): void {
    const job = this.job!, sim = this.sim;
    if (this.phase !== 'drive' || this.ending) return;
    this.ending = true;
    sim.frozen = true;
    this.tipBox?.destroy();
    this.tipBox = null;
    const reason = job.over!;
    const won = reason === 'done' || reason === 'shift';
    // a Getaway always ends busted or wrecked: a lost run, so the rewarded continue (revive) can take it on
    this.endWin = job.mode === 'story' ? reason === 'done' : reason === 'shift' || reason === 'done';
    this.endTitle = reason === 'done' ? t('jobDone') : reason === 'shift' ? t('shiftOver') : reason === 'busted' ? t('busted') : reason === 'wrecked' ? t('wrecked') : t('f_' + reason);
    const W = this.scale.width;
    this.banner(W / 2, 240, this.endTitle, won ? '#5dff7a' : '#ff4060', 72);
    if (won) { this.sfx('fanfare', { volume: 0.6, exact: true }); burst(this, W / 2, 240, [0x5dff7a, 0xffd23f, 0xff3fa4], 40, 380); }
    else if (reason !== 'busted' && reason !== 'wrecked') this.sfx('lose', { volume: 0.5, exact: true });
    this.time.delayedCall(1300, () => {
      if (this.phase !== 'drive') return;
      if (reason === 'done' || reason === 'busted' || reason === 'wrecked') this.startReplay();
      else this.showCard();
    });
  }

  private cardAt = 0;
  private newCar: CarId | null = null;

  /** The job's card: heading, stars, pay and bonus, what was banked. */
  private showCard(): void {
    const job = this.job!, sim = this.sim, m = this.meta;
    this.phase = 'end';
    this.cardAt = 0;
    this.steering.end();
    this.setHudVisible(false);
    // bank the run
    const reason = job.over!;
    let cash = job.cash;
    if (job.mode === 'story' && reason !== 'done') cash = 0;
    this.banked = cash;
    banked = cash;
    m.cash += cash;
    this.newCar = null;
    if (job.mode === 'story' && reason === 'done' && job.def) {
      const before = m.stars[job.def.id] ?? 0;
      m.stars[job.def.id] = Math.max(before, job.rating);
      const car = CARS.find((c) => c.unlock === job.def!.id);
      if (car && !before) this.newCar = car.id;
      if (job.def.id < MISSIONS.length) { m.mission = job.def.id + 1; registerStrings({ tr: { retry: 'SONRAKİ' }, en: { retry: 'NEXT' } }); }
    }
    if (job.mode !== 'story') {
      const key = job.mode as 'roam' | 'getaway' | 'rush';
      m.best[key] = Math.max(m.best[key], job.cash);
    }
    m.seenIntro = true;
    saveMeta(m);
    this.setCash(job.cash);
    if (job.mode === 'story' && reason !== 'done') this.setCash(0);
    // the card
    const W = this.scale.width, H = this.scale.height;
    const c = this.add.container(W / 2, H / 2 + 10).setScrollFactor(0).setDepth(UI_DEPTH + 150);
    c.add(themeCard(this, 0, 0, PANEL.cardW, PANEL.cardH));
    const head = themeLabel(this, 0, -170, this.endTitle, overlayHeadingStyle(this.endWin));
    head.setScale(Math.min(52 / 84, (PANEL.cardW - 140) / head.width));
    c.add(head);
    let y = -110;
    const starImgs: Phaser.GameObjects.Image[] = [];
    if (job.mode === 'story' && reason === 'done') {
      for (let i = 0; i < 3; i++) { const s = this.add.image(-90 + i * 90, y, 'sh-star-off').setDisplaySize(64, 64); starImgs.push(s); c.add(s); }
      y += 62;
    } else if (job.mode === 'story') {
      c.add(fitWidth(labelAt(this, 0, y, t(`m${job.def!.id}t`), CARD_VAL), PANEL.cardW - 100));
      y += 50;
    }
    const rows: [string, string][] = [];
    if (job.mode === 'story') {
      rows.push([t('pay'), reason === 'done' ? fmtMoney(job.def!.pay) : '$0']);
      rows.push([t('bonus'), reason === 'done' ? fmtMoney(job.cash - job.def!.pay) : '$0']);
    } else if (job.mode === 'getaway') {
      rows.push([t('survived'), mmss(job.survived)]);
      rows.push([t('takedowns'), String(sim.stats.takedowns)]);
    } else {
      rows.push([t('deliveries'), String(job.deliveries)]);
      if (reason === 'busted') rows.push([t('fine'), '−25%']);
    }
    rows.push([t('topSpeed'), Math.round(sim.stats.topSpeed * KMH) + ' ' + t('kmh')]);
    rows.push([t('banked'), fmtMoney(cash)]);
    rows.forEach(([k, v], i) => {
      const yy = y + i * 40;
      c.add(fitWidth(labelAt(this, -230, yy, k, CARD_ROW, 0), 260));
      c.add(new GlyphText(this, 230, yy + 2, v, CARD_VAL, 1, '0123456789/.,:%+-−×$ km/hsa'));
    });
    if (this.newCar) c.add(fitWidth(labelAt(this, 0, PANEL.cardH / 2 - 50, t('newCar', { car: t('car_' + this.newCar) }), { size: 26, color: '#1a7a3a', stroke: null, shadow: false }), PANEL.cardW - 80));
    else if (job.mode === 'story' && reason === 'done' && job.def?.id === MISSIONS.length) c.add(fitWidth(labelAt(this, 0, PANEL.cardH / 2 - 50, t('theEnd'), { size: 22, color: '#2a1d14', stroke: null, shadow: false, body: true }), PANEL.cardW - 60));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    const stars = job.mode === 'story' && reason === 'done' ? job.rating : 0;
    for (let i = 0; i < stars; i++) {
      this.time.delayedCall(450 + i * 380, () => {
        const s = starImgs[i];
        s.setTexture('sh-star-on').setDisplaySize(64, 64);
        this.tweens.add({ targets: s, scale: { from: s.scale * 1.8, to: s.scale }, duration: 320, ease: 'Back.easeOut' });
        burst(this, W / 2 - 90 + i * 90, H / 2 + 10 - 110, [0xffd23f, 0xffffff], 22, 260);
        this.sfx('star', { volume: 0.6, rate: 1 + i * 0.15 });
      });
    }
    this.card = c;
    this.time.delayedCall(3600, () => this.finishCard());
  }

  private finishCard(): void {
    if (this.phase !== 'end' || !this.card) return;
    const c = this.card;
    this.card = null;
    this.tweens.add({ targets: c, alpha: 0, scale: 0.92, duration: 200, onComplete: () => c.destroy() });
    pendingRetry = true;
    this.endGame({ win: this.endWin, title: this.endTitle, delay: 150 });
  }

  // ---------------------------------------------------------------- ads

  /** A run that ended busted or wrecked may go on after a rewarded ad. */
  canContinue(): boolean {
    // a run that ended some other way (from the board, the platform) may go on too
    if (!this.job || !this.job.over) return true;
    const r = this.job.over;
    return r === 'busted' || r === 'wrecked';
  }

  revive(): void {
    const job = this.job;
    if (!job || this.phase === 'hub' || this.phase === 'brief' || this.phase === 'garage') {
      // ended before a job ran: back to the board
      this.card?.destroy();
      this.card = null;
      if (this.garage) this.garage.close(); // its close opens the board
      else { this.dispatch?.close(); this.openHub(); }
      pendingRetry = false;
      return;
    }
    // the bank gives back what the card banked; the run goes on
    this.meta.cash -= this.banked;
    saveMeta(this.meta);
    this.banked = 0;
    banked = 0;
    job.revive();
    this.sim.frozen = false;
    this.card?.destroy();
    this.card = null;
    this.view.replay = null;
    this.phase = 'drive';
    this.ending = false;
    this.setHudVisible(true);
    this.steering.begin();
    this.steering.centre();
    this.setCash(job.cash);
    pendingRetry = false;
  }

  /** The 2× reward: the run's banked cash once more. */
  doubleCash(): void { this.meta.cash += this.banked; saveMeta(this.meta); banked = 0; }
  get bankedCash(): number { return this.banked; }

  // ---------------------------------------------------------------- test hooks

  /** Starts a job at once (screenshots, the bot, the store art). */
  testStart(mode: Mode, mission = 1): void {
    this.dispatch?.close(); this.dispatch = null;
    this.garage?.close(); this.garage = null;
    this.startJob({ mode, mission });
  }
  /** Steps the simulation `seconds` at once (with the test input or the bot). */
  testStep(seconds: number, input?: (sim: Sim) => DriveInput): void {
    for (let s = 0; s < seconds && this.job && !this.job.over; s += 1 / 30) {
      const inp = input ? input(this.sim) : this.bot ? this.bot.input(1 / 30) : this.testInput ? { ...NO_INPUT, ...this.testInput } : NO_INPUT;
      this.sim.step(1 / 30, inp);
      this.job.update(1 / 30);
      for (const ev of this.sim.events) this.view.handle(ev, this.sim);
      this.sim.events.length = 0; this.job.events.length = 0;
    }
    this.view.snap(this.sim);
  }
  testBuildAll(): void { this.view.buildAll(); }
  /** Skips the end's banner delay and replay: the job's card at once (screenshots). */
  testEndNow(): void {
    if (!this.job) return;
    if (!this.job.over) this.job.update(0);
    if (!this.job.over) return;
    this.ending = true;
    this.sim.frozen = true;
    const r = this.job.over;
    this.endWin = this.job.mode === 'story' ? r === 'done' : r === 'shift' || r === 'done';
    this.endTitle = r === 'done' ? t('jobDone') : r === 'shift' ? t('shiftOver') : r === 'busted' ? t('busted') : r === 'wrecked' ? t('wrecked') : t('f_' + r);
    this.showCard();
  }
  /** Police cars right behind and beside the player, in pursuit (screenshots, the store art). */
  testPursuers(n: number): void {
    const sim = this.sim, p = sim.player;
    if (!sim.stars) sim.forceStars(3);
    for (let i = 0; i < n; i++) {
      const c = sim.addCar('cop', COP_MODEL, 0xffffff);
      const back = 4 + i * 7, side = (i % 2 ? 1 : -1) * 3.6;
      sim.place(c, p.x - Math.sin(p.h) * back + Math.cos(p.h) * side, p.z - Math.cos(p.h) * back - Math.sin(p.h) * side, p.h, p.speedAbs);
      sim.toPursuit(c);
    }
  }
  /** Steps with the autopilot until the job's stage reaches `stage` or it ends (at most `max` s). */
  testUntilStage(stage: number, max = 120): void {
    if (!this.bot && this.job) this.bot = new Bot(this.sim, this.job, SKILL.good);
    for (let s = 0; s < max && this.job && !this.job.over && this.job.stage < stage; s += 1 / 30) {
      this.sim.step(1 / 30, this.bot!.input(1 / 30));
      this.job.update(1 / 30);
      for (const ev of this.sim.events) this.view.handle(ev, this.sim);
      for (const ev of this.job.events) this.onJob(ev);
      this.sim.events.length = 0; this.job.events.length = 0;
      this.record(1 / 30);
    }
    this.view.snap(this.sim);
  }
  /** The autopilot drives the job (store art, screenshots); off with false. */
  testAuto(on = true): void {
    this.bot = on && this.job ? new Bot(this.sim, this.job, SKILL.good) : null;
    // its frames (store art, screenshots) show the street, not the tutorial or the start callout
    if (this.bot) {
      this.tipBox?.destroy(); this.tipBox = null;
      if (this.startBanner?.active) { this.tweens.killTweensOf(this.startBanner); this.startBanner.destroy(); }
      this.startBanner = null;
    }
  }
}

export { INK, caps };
