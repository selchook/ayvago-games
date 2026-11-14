// Rooftop Courier: the Play scene. Runs the simulation (sim.ts) at a fixed step, draws it (view.ts)
// under a Phaser HUD, reads the keyboard and the touch pad, and turns the simulation's events into
// sound, words, the delivery stamp, shakes, slow motion on big gaps and the Rush speed lines. A
// first run gets four short lessons, each power-up a one-line hint the first time it turns up;
// missions are tracked live and paid at the end of the run. A fall is a short sequence: slow
// motion as the courier goes over, the camera looking down into the alley, the courier fading out
// as it sinks while the screen darkens, and only then the lost heart (a fade-in respawn) or the
// run's summary.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, hudChip, HudChip, flash, burst, getLang,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP, HUD_CHIP_H,
} from '@core';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent } from './sim';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { THEMES, PRAISE_TIERS, POWERS, POWER_COLOR, clamp, smooth, isPower, type Mode, type Power } from './defs';
import { loadMeta, saveMeta, bankRun, missionAt, missionProgress, lookOf, districtName, type Meta, type Mission } from './meta';
import { TouchPad, FlowMeter, toast, TutorialCard, PowerBar, HintCard, UI_DEPTH, type PowerShown } from './ui';
import { Callouts } from './callouts';
import { makeSounds, Loop } from './audio';
import { makeIcons, PARCEL_ICON, STAMP_ICON, FLAG_ICON, POWER_ICON, VIGNETTE } from './art';

/** Numbers with thousands separators (TR: 12.345, EN: 12,345). */
export const fmt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');

/** A mission's line of text. */
export function missionText(ms: Mission): string {
  if (ms.kind === 'district') return t('ms_district', { name: t('d_' + districtName(ms.n)) });
  return t('ms_' + ms.kind, { n: fmt(ms.n) });
}

/** Stamps of the last finished run (the 2× reward on the result screen). */
export let lastRunStamps = 0;

const STEP = 1 / 60;
const TUT = ['steer', 'jump', 'slide', 'vault'] as const;
const MOVE_COLOR: Record<string, string> = {
  gap: '#ffffff', bigGap: '#ffd23f', vault: '#9fe8ff', slide: '#9fe8ff', roll: '#7dffa0', perfectRoll: '#7dffa0',
  zip: '#ffb24a', bounce: '#ff9ae6', climb: '#ffffff', mantle: '#ffffff', pigeons: '#d8dce4', drop: '#ffd23f',
};

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
  private parcelChip!: HudChip;
  private missionChip!: HudChip;
  private powerBar!: PowerBar;
  /** The fall's darkening (vignette and a dim) and the watch's blue edges. */
  private vignette!: Phaser.GameObjects.Image;
  private dim!: Phaser.GameObjects.Rectangle;
  private tint!: Phaser.GameObjects.Image;
  private darkK = 0;
  private watchK = 0;
  private hint: HintCard | null = null;
  private hintQueue: Power[] = [];
  private flow!: FlowMeter;
  /** Every floating word and banner goes through the text lanes. */
  co!: Callouts;
  private lines!: Phaser.GameObjects.Graphics;
  private loops: { zip: Loop; wind: Loop; city: Loop } | null = null;
  private missions: Mission[] = [];
  private missionShown: boolean[] = [];
  private missionIdx = 0;
  private missionT = 0;
  private lastSec = -1;
  private lastStamps = -1;
  private lastHearts = -1;
  private finished = false;
  private summaryT = -1;
  private flashT = 0;
  private windT = 0;
  private tipsShown = new Set<string>();
  private praiseTier = -1;
  // tutorial
  private tut: TutorialCard | null = null;
  private tutStep = 0;
  private tutWait = -1;
  private steerT = 0;
  /** Frame times of the first Play frames (ms) and the shader programs before the first frame (warm-up check). */
  firstFrames: number[] = [];
  programsAtStart = -1;
  private frameStart = 0;
  /** Test hook: runs the simulation faster or slower (slow software rendering in screenshots). */
  testSpeed = 1;
  /** Frame cost (test hook). */
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0 };

  createGame(): void {
    makeIcons(this);
    makeSounds(this.game);
    this.meta = loadMeta();
    this.mode = isEasy() ? 'easy' : 'normal';
    this.sim = new Sim(this.mode, Math.floor(Math.random() * 1e9), { ...this.meta.upgrades });
    this.darkK = 0; this.watchK = 1; this.hint = null; this.hintQueue = [];
    this.bot = null; this.forced = null;
    this.acc = 0; this.timeScale = 1; this.slowT = 0; this.slowK = 1;
    this.lastSec = -1; this.lastStamps = -1; this.lastHearts = -1;
    this.finished = false; this.summaryT = -1; this.flashT = 0; this.windT = 0;
    this.tipsShown = new Set(); this.praiseTier = -1;
    this.firstFrames = []; this.frameStart = 0; this.testSpeed = 1;
    this.missionIdx = 0; this.missionT = 0;

    this.view = new View(this, this.sim, lookOf(this.meta));
    this.world = this.view.world;
    this.programsAtStart = (this.world.renderer.info.programs ?? []).length;
    this.perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0 };
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
    };

    // input
    this.controls = new Controls(this, {});
    this.pad = this.sys.game.device.input.touch ? new TouchPad(this, { jump: t('btnJump'), slide: t('btnSlide') }) : null;

    // HUD: score (core), stamps and hearts (right), parcel and flow (row 2), mission and spring (row 3)
    const row3 = HUD_ROW2_Y + HUD_CHIP_H + 20;
    this.hud.setRight('0', STAMP_ICON);
    if (this.sim.maxHearts) this.hud.setLives(this.sim.hearts, this.sim.maxHearts);
    this.parcelChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: PARCEL_ICON, iconSize: 30, text: '--', minWidth: 190 });
    this.flow = new FlowMeter(this, this.scale.width - HUD_MARGIN, HUD_ROW2_Y, t('flow'));
    this.missionChip = hudChip(this, HUD_MARGIN, row3, { icon: FLAG_ICON, iconSize: 28, text: '', size: 20, color: '#c8ffd8' });
    this.powerBar = new PowerBar(this, this.scale.width - HUD_MARGIN, row3);
    this.lines = this.add.graphics().setDepth(40).setScrollFactor(0);
    const { width: W, height: H } = this.scale;
    this.dim = this.add.rectangle(0, 0, W, H, 0x05030c, 1).setOrigin(0).setScrollFactor(0).setDepth(36).setAlpha(0);
    this.vignette = this.add.image(W / 2, H / 2, VIGNETTE).setDisplaySize(W, H).setScrollFactor(0).setDepth(37).setTint(0x000000).setAlpha(0);
    this.tint = this.add.image(W / 2, H / 2, VIGNETTE).setDisplaySize(W, H).setScrollFactor(0).setDepth(38).setTint(0x5a7aff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.view.onPoof = () => this.sfx('poof', { volume: 0.55 });
    this.co = new Callouts(this);
    if (this.pad) {
      const J = TouchPad.JUMP, S = TouchPad.SLIDE;
      this.co.block({ x0: J.x - J.r - 14, y0: J.y - J.r - 14, x1: J.x + J.r + 14, y1: J.y + J.r + 14 });
      this.co.block({ x0: S.x - S.r - 14, y0: S.y - S.r - 14, x1: S.x + S.r + 14, y1: S.y + S.r + 14 });
    }
    this.missions = this.meta.missions.map(missionAt);
    this.missionShown = this.missions.map(() => false);
    this.updateMissionChip(true);

    // sound
    this.loops = { zip: new Loop(this, 'zip-loop'), wind: new Loop(this, 'wind-loop'), city: new Loop(this, 'city-loop') };

    // the first run: four short lessons
    this.tut = null; this.tutStep = 0; this.tutWait = -1; this.steerT = 0;
    if (!this.meta.tutorial) this.time.delayedCall(500, () => this.startTutorial());
    else this.districtBanner(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (!this.finished && this.sim.time > 8) this.bank(); });
  }

  // ------------------------------------------------------------------ input

  private readInput(): Input {
    if (this.forced) return this.forced;
    if (this.bot) return this.bot.input(STEP);
    const c = this.controls, pad = this.pad;
    let steer = c.axisX;
    if (pad && steer === 0) steer = pad.steer;
    const jump = c.a || c.up || !!pad?.jump;
    const down = c.down || c.b || !!pad?.down;
    return { steer, jump, down };
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    const dt = delta / 1000;
    const sim = this.sim;
    // slow motion (big gaps, the first moment of a fall, the tutorial's waits, the watch)
    let ts = 1;
    if (this.slowT > 0) { this.slowT -= dt; ts = this.slowK; }
    if (this.tutHold()) ts = Math.min(ts, 0.3);
    this.watchK += (sim.timeScale - this.watchK) * Math.min(1, dt * 4);
    ts *= this.watchK;
    this.timeScale += (ts - this.timeScale) * Math.min(1, dt * (ts < this.timeScale ? 14 : 5));
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
        if (this.watch && this.watch(sim)) { this.watch = null; this.testSpeed = 0.02; this.acc = 0; break; }
        if (sim.over) break;
      }
      if (n >= 6) this.acc = 0;
    }
    this.view.sync(sim, dt, sdt);
    this.updateHud(dt);
    this.updateFx(dt);
    this.updateHints();
    this.updateTutorial(dt);
    this.updateSound(dt);
    this.drawLines(dt);
    if (sim.over && !this.finished) this.finish();
    if (this.summaryT >= 0) {
      this.summaryT += dt;
      if (this.summaryT > 3.2) this.endGame({ title: t('runOver'), win: false, delay: 0 });
    }
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  // ------------------------------------------------------------------ events

  private at(dy = 1.9): { x: number; y: number } {
    const s = this.sim;
    const p = this.view.toScreen(s.x, s.y + dy, -s.s);
    return { x: clamp(p.x, 150, this.scale.width - 150), y: clamp(p.y, 330, 980) };
  }

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    const W = this.scale.width;
    switch (ev.type) {
      case 'step': this.sfx('step' + (1 + Math.floor(Math.random() * 3)), { volume: 0.22 }); break;
      case 'jump':
        this.sfx(ev.spring ? 'spring' : 'jump', { volume: ev.spring ? 0.5 : 0.4 });
        this.sfx('woosh', { volume: 0.25 });
        if (ev.big) { this.slowT = 0.42; this.slowK = 0.45; this.windT = 1.2; this.sfx('woosh2', { volume: 0.45 }); }
        this.tutorialEvent('jump');
        break;
      case 'land': {
        this.sfx(ev.drop > 3 ? 'landHard' : 'land', { volume: clamp(0.35 + ev.drop * 0.06, 0.35, 0.85) });
        if (ev.surf === 'metal' || ev.surf === 'beam') this.sfx('metal', { volume: 0.35 });
        if (ev.surf === 'plank') this.sfx('wood', { volume: 0.4 });
        if (ev.hard && !ev.roll) {
          const p = this.at();
          this.co.pop( p.x, p.y, t('hardLanding'), '#ff9a6a', 28);
          if (!this.tipsShown.has('roll') && this.meta.runs < 4) { this.tipsShown.add('roll'); this.tip(t(this.pad ? 'rollTipTouch' : 'rollTip')); }
        }
        if (ev.roll) this.sfx('roll', { volume: 0.5 });
        if (ev.roll === 'perfect') this.sfx('perfect', { volume: 0.45 });
        break;
      }
      case 'slide': this.sfx('slide', { volume: 0.45 }); this.tutorialEvent('slide'); break;
      case 'vault': this.sfx('vault', { volume: 0.55 }); this.sfx('woosh', { volume: 0.3, rate: 1.2 }); this.tutorialEvent('vault'); break;
      case 'climb': this.sfx('climb1', { volume: 0.5 }); break;
      case 'climbTop': case 'mantle': this.sfx('mantle', { volume: 0.5 }); break;
      case 'zip': this.sfx('zipGrab', { volume: 0.55 }); break;
      case 'zipEnd': this.sfx('woosh', { volume: 0.35 }); break;
      case 'bounce': this.sfx('bounce', { volume: 0.6 }); this.sfx('spring', { volume: 0.35, rate: 1.25 }); break;
      case 'move': this.onMove(ev.kind, ev.pts, ev.chain); break;
      case 'stumble': {
        this.sfx(ev.smash ? 'smash' : 'stumble', { volume: 0.7 });
        if (!ev.smash) { this.flashT = 0.35; this.cameras.main.shake(180, 0.006); }
        const p = this.at();
        this.co.pop( p.x, p.y, t(ev.smash ? 'smash' : 'stumble'), ev.smash ? '#7fe0ff' : '#ff7a6a', 30);
        break;
      }
      case 'bonk':
        this.sfx('bonk', { volume: 0.6 });
        if (!this.tipsShown.has('bonk')) { this.tipsShown.add('bonk'); this.tip(t('bonk')); }
        break;
      case 'slam': this.sfx('bonk', { volume: 0.7 }); break;
      case 'falling':
        // a moment of slow motion as the courier goes over the edge
        this.sfx('fall', { volume: 0.6 });
        this.slowT = 0.45; this.slowK = 0.42;
        this.loops?.wind.set(0, 1, 1);
        break;
      case 'fell':
        this.cameras.main.shake(160, 0.004);
        if (ev.hearts > 0) {
          this.co.banner(t('fellHeart'), { color: '#ff7a6a', size: 44, hold: 0.9 }, 3);
          this.sfx('late', { volume: 0.5 });
        }
        break;
      case 'respawn': this.view.snapCamera(); this.sfx('respawn', { volume: 0.5 }); this.sfx('parcel', { volume: 0.3 }); break;
      case 'pickup': {
        const p = ev.p;
        if (p.kind === 'stamp') this.sfx(ev.value > 1 ? 'stamp2' : 'stamp', { volume: 0.35, rate: 1 + Math.min(0.5, (this.sim.stamps % 10) * 0.04) });
        else if (p.kind === 'bottle') { this.sfx('bottle', { volume: 0.6 }); this.co.banner(t('bottle'), { color: '#7fe6ff', size: 36, hold: 0.6 }, 1); }
        else if (p.kind === 'spring') { this.sfx('springGet', { volume: 0.6 }); this.co.banner(t('spring'), { color: '#ffd23f', size: 36, hold: 0.6 }, 1); }
        break;
      }
      case 'power': {
        const k = ev.kind, name = t('pw_' + k);
        this.sfx('pw_' + k, { volume: 0.6 });
        const col = '#' + POWER_COLOR[k].toString(16).padStart(6, '0');
        if (ev.again) { const p = this.at(2.2); this.co.pop(p.x, p.y, t('pwAgain', { name }), col, 26); }
        else this.co.banner(name, { color: col, size: 46, hold: 0.8, sub: t('pwSub_' + k), subColor: '#ffffff' }, 1);
        flash(this, POWER_COLOR[k], 120, 0.18);
        break;
      }
      case 'powerEnd': {
        this.sfx(ev.kind === 'watch' ? 'watchOut' : 'pwEnd', { volume: 0.4 });
        const p = this.at(2.4);
        this.co.pop(p.x, p.y, t('pwEnd', { name: t('pw_' + ev.kind) }), '#c8cce0', 22);
        break;
      }
      case 'shieldPop':
        this.sfx('shieldPop', { volume: 0.7 });
        if (ev.save) {
          this.sfx('rescue', { volume: 0.55 });
          this.co.banner(t('shieldSaved'), { color: '#7fe0ff', size: 50, hold: 1, sub: t('shieldSavedSub') }, 3);
          this.slowT = 0.35; this.slowK = 0.5;
        } else { const p = this.at(); this.co.pop(p.x, p.y, t('shieldPop'), '#7fe0ff', 28); }
        break;
      case 'rescued': this.sfx('land', { volume: 0.6 }); break;
      case 'gold':
        this.sfx('gold', { volume: 0.7, exact: true });
        this.co.banner(t('gold'), { color: '#ffd23f', size: 50, hold: 1, sub: t('goldSub') }, 2);
        burst(this, W / 2, 400, [0xffd23f, 0xfff1a0, 0xffffff], 40, 380);
        break;
      case 'pigeons': this.sfx('flutter', { volume: 0.5 }); break;
      case 'parcel':
        if (ev.first) { this.co.banner(t('firstParcel'), { color: '#ffc040', size: 34, hold: 1.4 }, 2); this.sfx('parcel', { volume: 0.5 }); }
        break;
      case 'deliver': {
        this.sfx('deliver', { volume: 0.8 });
        this.sfx('cash', { volume: 0.5 });
        this.sfx('paper', { volume: 0.4, rate: 1.4 });
        const sub = (ev.perfect ? t('perfect') + ' ' : '') + '+' + fmt(ev.pts);
        this.co.stamp(t('delivered'), sub);
        if (ev.streak >= 2) this.time.delayedCall(500, () => this.co.pop( W / 2, 610, t('streak', { n: ev.streak }), '#ffd23f', 26));
        this.tweens.add({ targets: this.parcelChip, scale: 1.2, duration: 120, yoyo: true });
        this.tweens.add({ targets: this.hud.scoreChip, scale: 1.15, duration: 120, yoyo: true });
        if (ev.bank > 0.5) this.time.delayedCall(700, () => this.co.pop( this.parcelChip.right + 70, HUD_ROW2_Y + 10, t('timeBonus', { n: ev.bank.toFixed(1).replace('.', getLang() === 'tr' ? ',' : '.') }), '#7dffa0', 22));
        break;
      }
      case 'missed': this.sfx('missed', { volume: 0.6 }); this.co.banner(t('missed'), { color: '#ff9a6a', size: 36, hold: 1 }, 2); break;
      case 'late':
        this.sfx('late', { volume: 0.7 });
        if (ev.hearts > 0) this.co.banner(t('lateHeart'), { color: '#ff7a6a', size: 40, hold: 1 }, 3);
        else this.co.banner(t('late'), { color: '#ff5a4f', size: 60, hold: 1.2 }, 3);
        break;
      case 'flowLost':
        this.sfx('flowLost', { volume: 0.3 });
        this.co.pop( W - 170, HUD_ROW2_Y + 56, t('flowLost'), '#9aa6c8', 22);
        this.praiseTier = -1;
        break;
      case 'rush':
        this.sfx('rush', { volume: 0.7 });
        this.co.banner(t('rushOn'), { color: '#7fe0ff', size: 66, hold: 0.8, sub: t('rushSub') }, 3);
        flash(this, 0xbff0ff, 160, 0.3);
        break;
      case 'rushEnd': break;
      case 'districtSoon': this.time.delayedCall(1400, () => this.co.pop( W / 2, 640, t('districtSoon', { name: t('d_' + ev.theme) }), '#ffe08a', 26)); break;
      case 'district': this.districtBanner(ev.n); this.sfx('district', { volume: 0.6, exact: true }); break;
      case 'over': break;
    }
    this.checkMissions();
  }

  private onMove(kind: string, pts: number, chain: number): void {
    const p = this.at(2.2);
    if (kind !== 'drop') this.co.addMove(t('m_' + kind), pts, MOVE_COLOR[kind] ?? '#ffffff', p.x, p.y);
    this.sfx('move', { volume: 0.22, rate: 1 + Math.min(0.7, chain * 0.05), exact: true });
    // praise for a growing chain
    let tier = -1;
    for (let i = 0; i < PRAISE_TIERS.length; i++) if (chain >= PRAISE_TIERS[i]) tier = i;
    if (tier > this.praiseTier) {
      this.praiseTier = tier;
      this.co.banner(t('praise' + tier), { color: ['#9fe8ff', '#7dffa0', '#ffd23f', '#ffb24a', '#ff7ae0'][tier], size: 40 + tier * 3, hold: 0.6 }, 0);
      this.sfx('praise', { volume: 0.4 + tier * 0.05 });
    }
  }

  private districtBanner(n: number): void {
    const theme = THEMES[n % THEMES.length];
    this.co.banner(t('d_' + theme), { size: 52, color: '#ffffff', hold: 1.6, sub: t('districtN', { n: n + 1 }) + ' · ' + t('dSub_' + theme), subColor: '#ffd23f' }, 2);
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(dt: number): void {
    const sim = this.sim;
    const sc = Math.round(sim.score);
    if (sc !== this.score) this.setScore(sc);
    if (sim.stamps !== this.lastStamps) {
      if (this.lastStamps >= 0) this.tweens.add({ targets: this.hud.rightChip, scale: 1.15, duration: 90, yoyo: true });
      this.lastStamps = sim.stamps;
      this.hud.setRight(String(sim.stamps), STAMP_ICON);
    }
    if (sim.maxHearts && sim.hearts !== this.lastHearts) { this.lastHearts = sim.hearts; this.hud.setLives(sim.hearts, sim.maxHearts); }
    const p = sim.parcel;
    if (p) {
      const left = Math.max(0, p.left), sec = Math.ceil(left);
      const dist = Math.max(0, Math.round(p.s - sim.s));
      const key = sec * 10000 + dist;
      // the express ribbon stops the clock: it shows pink
      const frozen = sim.power.express > 0;
      if (key !== this.lastSec) {
        const warn = left < 6 && !frozen;
        if (warn && Math.ceil(left) !== Math.ceil(left + dt) && left > 0) {
          this.sfx('tick', { volume: 0.35, exact: true });
          this.tweens.add({ targets: this.parcelChip, scale: 1.12, duration: 100, yoyo: true });
        }
        this.lastSec = key;
        this.parcelChip.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}  ·  ${dist} m`);
      }
      this.parcelChip.setTextColor(frozen ? '#ff9ad0' : left < 6 ? '#ff7a6a' : left < 12 ? '#ffd23f' : '#ffffff');
    }
    this.flow.set(sim.meter, sim.flowMult, sim.rush, this.elapsed);
    // the courier's box on screen: small lines keep clear of it
    const head = this.view.toScreen(sim.x, sim.y + 2.0, -sim.s), feet = this.view.toScreen(sim.x, sim.y - 0.1, -sim.s);
    if (head.visible && feet.visible) {
      const hh = Math.max(60, feet.y - head.y), hw = Math.max(70, hh * 0.45);
      this.co.setCourier({ x0: head.x - hw, y0: head.y - 30, x1: head.x + hw, y1: feet.y + 20 });
    } else this.co.setCourier(null);
    this.co.update();
    // the active power-ups (and the spring's jumps) as small chips with their rings
    const shown: PowerShown[] = [];
    if (sim.springs > 0) shown.push({ id: 'spring', icon: POWER_ICON('spring'), color: 0xffd23f, k: sim.springs / 3, left: 99, text: '×' + sim.springs });
    for (const k of POWERS) {
      const v = sim.power[k];
      if (v <= 0) continue;
      shown.push(k === 'shield'
        ? { id: k, icon: POWER_ICON(k), color: POWER_COLOR[k], k: 1, left: 99 }
        : { id: k, icon: POWER_ICON(k), color: POWER_COLOR[k], k: v / sim.powerMax[k], left: v / (k === 'watch' ? sim.timeScale : 1) });
    }
    this.powerBar.update(shown, this.elapsed);
    // the mission line makes room when the power-ups reach it
    const ma = this.missionChip.right + 12 < this.powerBar.left ? 1 : 0;
    if (Math.abs(this.missionChip.alpha - ma) > 0.01) this.missionChip.setAlpha(clamp(this.missionChip.alpha + Math.sign(ma - this.missionChip.alpha) * dt * 5, 0, 1));
    this.missionT -= dt;
    if (this.missionT <= 0) this.updateMissionChip(false);
    if (this.flashT > 0) this.flashT -= dt;
  }

  /** The fall's darkening and the slow-motion watch's blue edges. */
  private updateFx(dt: number): void {
    const sim = this.sim, st = sim.state;
    const want = st === 'fall' ? 0.3 + 0.62 * smooth(sim.fallK * 1.2) : st === 'slam' ? 0.25 : sim.fallK >= 1 ? 0.92 : 0;
    this.darkK += clamp(want - this.darkK, -dt * 2.2, dt * 3.5);
    this.vignette.setAlpha(this.darkK);
    this.dim.setAlpha(this.darkK * 0.4);
    const w = sim.power.watch > 0 ? 0.55 + 0.1 * Math.sin(this.elapsed * 3) : 0;
    this.tint.setAlpha(this.tint.alpha + clamp(w - this.tint.alpha, -dt * 2, dt * 2));
  }

  /** The first time each power-up turns up ahead, a one-line hint says what it does. */
  private updateHints(): void {
    const sim = this.sim, seen = this.meta.seen;
    if (seen.length >= POWERS.length || this.isOver) return;
    for (const p of sim.course.pickups) {
      if (p.taken || !isPower(p.kind) || p.s < sim.s || p.s > sim.s + 48) continue;
      if (seen.includes(p.kind) || this.hintQueue.includes(p.kind)) continue;
      this.hintQueue.push(p.kind);
    }
    if (!this.hintQueue.length || this.tut || (this.hint && this.hint.c.active)) return;
    const k = this.hintQueue.shift()!;
    if (!seen.includes(k)) { seen.push(k); saveMeta(this.meta); }
    this.hint = new HintCard(this, 278, POWER_ICON(k), t('hintHead', { name: t('pw_' + k) }), t('hint_' + k));
    this.sfx('hint', { volume: 0.5 });
  }

  private updateMissionChip(first: boolean): void {
    this.missionT = 4;
    const open = this.missions.map((m, i) => i).filter((i) => !this.missionShown[i]);
    if (!open.length) { this.missionChip.setText(t('missionDone')); return; }
    if (!first) this.missionIdx = (this.missionIdx + 1) % open.length;
    const i = open[this.missionIdx % open.length];
    const ms = this.missions[i];
    const prog = Math.min(ms.n, missionProgress(ms, this.sim.stats, this.sim.district));
    this.missionChip.setText(`${missionText(ms)}  ${fmt(prog)}/${fmt(ms.n)}`);
  }

  private checkMissions(): void {
    this.missions.forEach((ms, i) => {
      if (this.missionShown[i]) return;
      if (missionProgress(ms, this.sim.stats, this.sim.district) >= ms.n) {
        this.missionShown[i] = true;
        toast(this, 250, t('missionDone'), missionText(ms) + '  ' + t('missionReward', { n: ms.reward }), FLAG_ICON);
        this.sfx('mission', { volume: 0.6, exact: true });
        this.updateMissionChip(true);
      }
    });
  }

  private updateSound(dt: number): void {
    const sim = this.sim, L = this.loops;
    if (!L) return;
    L.zip.set(sim.state === 'zip' ? 0.45 : 0, 0.8 + sim.zipV * 0.035, dt, 14);
    if (this.windT > 0) this.windT -= dt;
    const wind = sim.state === 'air' ? clamp((sim.vs - 6) / 10, 0, 0.5) + (this.windT > 0 ? 0.25 : 0) : sim.rush ? 0.25 : 0;
    L.wind.set(wind, 0.8 + sim.vs * 0.03, dt, 6);
    L.city.set(this.isOver ? 0 : 0.16, 1, dt, 2);
  }

  /** Speed lines on the screen's edges in Rush and on big jumps; red edges after a stumble. */
  private drawLines(dt: number): void {
    const g = this.lines.clear();
    const sim = this.sim;
    const { width: W, height: H } = this.scale;
    const k = sim.rush ? 1 : this.windT > 0 ? Math.min(1, this.windT) * 0.6 : 0;
    if (k > 0) {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + Math.sin(this.elapsed * 3 + i * 7) * 0.1;
        const ph = (this.elapsed * 3.2 + i * 0.37) % 1;
        const r0 = 380 + ph * 220, r1 = r0 + 110 + k * 160;
        g.lineStyle(3 + k * 3, sim.rush ? 0xbff0ff : 0xffffff, 0.3 * k * (1 - ph));
        g.lineBetween(W / 2 + Math.cos(a) * r0, H * 0.48 + Math.sin(a) * r0 * 1.55, W / 2 + Math.cos(a) * r1, H * 0.48 + Math.sin(a) * r1 * 1.55);
      }
    }
    if (this.flashT > 0) for (let i = 0; i < 5; i++) g.lineStyle(18, 0xff2a2a, this.flashT * 0.6 * (1 - i / 5)).strokeRect(i * 16, i * 16, W - i * 32, H - i * 32);
    void dt;
  }

  private tip(s: string): void {
    const h = txt(this, this.scale.width / 2, 960, s, { size: 26, color: '#ffffff', strokeThickness: 6, wrap: 620 }).setScrollFactor(0).setDepth(UI_DEPTH + 40).setAlpha(0);
    this.tweens.add({ targets: h, alpha: 1, duration: 220 });
    this.tweens.add({ targets: h, alpha: 0, delay: 2600, duration: 400, onComplete: () => h.destroy() });
  }

  // ------------------------------------------------------------------ the first-run tutorial

  private startTutorial(): void {
    if (this.isOver || this.tut || this.bot || this.meta.tutorial) return;
    this.tut = new TutorialCard(this, 265, t('tut_skip'), () => this.endTutorial(true));
    this.tutStep = 0;
    this.showLesson();
  }

  private showLesson(): void {
    if (!this.tut) return;
    const id = TUT[this.tutStep];
    this.tut.set(t('tut_head', { n: this.tutStep + 1 }), t(`tut_${id}_${this.pad ? 'touch' : 'keys'}`));
    this.tutWait = -1;
  }

  private tutorialEvent(kind: 'jump' | 'slide' | 'vault'): void {
    if (!this.tut || this.tutWait >= 0) return;
    if (TUT[this.tutStep] === kind) this.lessonDone();
  }

  private lessonDone(): void {
    if (!this.tut) return;
    this.tut.done();
    this.sfx('perfect', { volume: 0.5 });
    this.co.pop( this.scale.width / 2, 520, t('tut_nice'), '#7dffa0', 40);
    this.tutStep++;
    this.tutWait = 0.9;
  }

  /** While a lesson waits for its move and the moment is close, time slows right down. */
  private tutHold(): boolean {
    if (!this.tut || this.tutWait >= 0) return false;
    const sim = this.sim, id = TUT[this.tutStep];
    if (!sim.grounded) return false;
    if (id === 'jump') { const b = sim.course.blockAt(sim.s); return !!b && b.s1 - sim.s < 2.4 && b.s1 - sim.s > 0; }
    if (id === 'slide') return sim.course.boxes.some((b) => b.kind === 'over' && b.s0 - sim.s < 3 && b.s0 - sim.s > 0.4);
    if (id === 'vault') return !!sim.lowAhead(2.4);
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
    if (TUT[this.tutStep] === 'steer') {
      if (Math.abs(this.readInput().steer) > 0.3) this.steerT += dt;
      if (this.steerT > 0.35) this.lessonDone();
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
      this.co.banner(t('tut_done'), { color: '#7dffa0', size: 52, hold: 1.1, sub: t('tut_doneSub'), subColor: '#ffd23f' }, 2);
      this.sfx('mission', { volume: 0.5, exact: true });
    } else this.sfx('tick', { volume: 0.4 });
  }

  // ------------------------------------------------------------------ the end

  private banked: Mission[] | null = null;

  private bank(): Mission[] {
    if (this.banked) return this.banked;
    lastRunStamps = this.sim.stamps;
    this.banked = bankRun(this.meta, this.sim.stamps, this.sim.stats, this.sim.district);
    return this.banked;
  }

  /** The run's summary over the city, then the result screen. */
  private finish(): void {
    this.finished = true;
    const done = this.bank();
    this.summaryT = 0;
    this.pad?.setVisible(false);
    this.endTutorial(true);
    const sim = this.sim;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 620).setScrollFactor(0).setDepth(UI_DEPTH + 150);
    const rows: [string, string][] = [
      [t('sumDeliveries'), fmt(sim.stats.deliveries)],
      [t('sumDistance'), fmt(sim.stats.distance) + ' m'],
      [t('sumStamps'), '+' + fmt(sim.stamps)],
      [t('sumDistrict'), `${sim.district + 1} · ${t('d_' + sim.theme)}`],
      [t('sumChain'), String(sim.stats.bestChain)],
      ...(sim.stats.powers ? [[t('sumPowers'), String(sim.stats.powers)] as [string, string]] : []),
    ];
    const H = 210 + rows.length * 44 + done.length * 40;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-310, -H / 2 + 8, 620, H, 28);
    g.fillStyle(0x14112a, 0.94).fillRoundedRect(-310, -H / 2, 620, H, 28);
    g.lineStyle(2, 0xffb24a, 0.5).strokeRoundedRect(-310, -H / 2, 620, H, 28);
    c.add(g);
    c.add(txt(this, 0, -H / 2 + 50, t('runOver'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 8 }));
    c.add(txt(this, 0, -H / 2 + 98, t(sim.overReason === 'late' ? 'reasonLate' : 'reasonFell'), { size: 24, color: '#ffb0a0', strokeThickness: 0, shadow: false }));
    rows.forEach(([k, v], i) => {
      const y = -H / 2 + 150 + i * 44;
      c.add(txt(this, -260, y, k, { size: 24, color: '#cfd2f0', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      c.add(txt(this, 260, y, v, { title: true, size: 24, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(1, 0.5));
    });
    done.forEach((ms, i) => {
      const y = -H / 2 + 160 + rows.length * 44 + i * 40;
      c.add(txt(this, 0, y, '✓ ' + missionText(ms) + '  ' + t('missionReward', { n: ms.reward }), { size: 22, color: '#7dffa0', strokeThickness: 0, shadow: false, wrap: 580 }));
    });
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2900, duration: 300 });
    if (done.length) { this.sfx('mission', { volume: 0.6, exact: true }); burst(this, width / 2, 620, [0x7dffa0, 0xffd23f, 0xffffff], 40, 380); }
    if (sim.overReason === 'fell') this.co.banner(t('fell'), { color: '#ff5a4f', size: 58, hold: 1.4 }, 3);
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    if (!this.isOver && !this.finished) { this.finished = true; this.bank(); }
    this.loops?.zip.set(0, 1, 1);
    this.loops?.wind.set(0, 1, 1);
    super.endGame(o);
  }

  /** A rewarded continue (ads.continue): back on the last safe roof with one heart. */
  revive(): void {
    this.sim.revive();
    this.finished = false;
    this.summaryT = -1;
    this.banked = null;
    // the run's stamps were banked at its end: carry on counting from zero so nothing pays twice
    this.sim.stamps = 0;
    this.pad?.setVisible(true);
    this.view.snapCamera();
    this.darkK = Math.min(this.darkK, 0.6);
    if (this.sim.maxHearts) this.hud.setLives(this.sim.hearts, this.sim.maxHearts);
  }

  // ------------------------------------------------------------------ test hooks

  /** Test hook: slows the run right down the moment `fn` is true (screenshots of a move). */
  watch: ((sim: Sim) => boolean) | null = null;
  testWatch(src: string): void { this.watch = new Function('sim', 'return (' + src + ');') as (sim: Sim) => boolean; }
  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void {
    this.bot = on ? new Bot(this.sim, SKILL[skill], 11) : null;
    if (on) this.forced = null;
    if (on) this.endTutorial(true);
  }
  testCam(yaw: number, dist: number, h: number): void { this.view.debugCam = dist > 0 ? { yaw, dist, h } : null; }
  testTutorial(open: boolean): void {
    if (open) { this.meta.tutorial = false; this.endTutorial(true); this.meta.tutorial = false; this.startTutorial(); } else { this.endTutorial(true); this.meta.tutorial = true; saveMeta(this.meta); }
  }
  testInput(inp: Partial<Input> | null): void { this.bot = null; this.forced = inp ? { ...NO_INPUT, ...inp } : null; }
  /** Puts the courier at a point of the course and keeps the run going. */
  testPlace(s: number, x: number): void { this.sim.place(s, x); this.sim.reroute(); this.view.snapCamera(); }
  /** Jumps to just before the next block of a link kind ahead (screenshots); returns its s0. */
  testFind(link: string, before = 10, district = -1): number {
    const c = this.sim.course;
    const home: Record<string, number> = { awning: 1, scaffold: 2, plank: 2, kicker: 3 };
    const d = district >= 0 ? district : home[link] ?? -1;
    if (d >= 0 && c.district !== d) { c.district = d; }
    for (let k = 0; k < 200; k++) {
      c.ensure(this.sim.s + 200 + k * 60);
      const b = c.blocks.find((q) => q.link === link && q.s0 > this.sim.s + 30 && (d < 0 || q.district === d));
      if (b) {
        const prev = c.blocks.find((q) => q.i === b.i - 1)!;
        const fx = link === 'zip' ? c.zips.find((z) => z.block === b.i)!.x : b.feature ? (b.feature.x0 + b.feature.x1) / 2 : 0;
        this.testPlace(Math.max(prev.s0 + 1, prev.s1 - before), fx);
        return b.s0;
      }
    }
    return -1;
  }
  testDistrict(n: number): void {
    this.sim.course.district = n;
    this.sim.course.ensure(this.sim.s + 600);
    const b = this.sim.course.blocks.find((q) => q.district === n && q.s0 > this.sim.s);
    if (b) this.testPlace(b.s0 + 2, 0);
  }
  /**
   * Test hook: steps the run by `ms` at once (bot or forced input), then draws it: frame sequences
   * at exact game-time intervals however slow the renderer is. Normal stepping waits meanwhile.
   */
  testAdvance(ms: number): void {
    this.testSpeed = 0;
    const n = Math.max(1, Math.round(ms / (STEP * 1000)));
    for (let i = 0; i < n; i++) {
      this.sim.step(STEP, this.readInput());
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    }
    this.view.sync(this.sim, ms / 1000, ms / 1000);
    this.updateHud(ms / 1000);
    this.updateFx(ms / 1000);
  }
  /** Test hook: clears banners and words off the screen (store art of a frozen moment). */
  testClearUi(): void {
    for (const o of [...this.children.list]) {
      const d = (o as unknown as { depth: number }).depth;
      if (d >= UI_DEPTH + 39 && d < UI_DEPTH + 100) { this.tweens.killTweensOf(o); o.destroy(); }
    }
  }
  /**
   * Test hook: runs the autopilot through a district for `seconds` of game time (stepped, not
   * rendered) and samples how often the courier is hidden from the camera: every 0.1 s, how many of
   * head, chest and hips are behind geometry. `legacy` uses the camera from before the overhead fix.
   */
  testOcclusion(district: number, seconds: number, legacy = false): { samples: number; full: number; partial: number; underOver: number; underOverHidden: number; states: Record<string, number> } {
    this.view.legacyCam = legacy;
    this.testDistrict(district);
    this.sim.course.district = district;
    this.testAuto(true);
    this.sim.hearts = 99;
    const r = { samples: 0, full: 0, partial: 0, underOver: 0, underOverHidden: 0, states: {} as Record<string, number> };
    for (let t = 0; t < seconds; t += 0.1) {
      this.testAdvance(100);
      if (this.sim.over) this.sim.revive();
      const h = this.view.hiddenPoints(this.sim);
      r.samples++;
      if (h === 3) r.full++;
      if (h >= 2) { r.partial++; r.states[this.sim.state] = (r.states[this.sim.state] ?? 0) + 1; }
      const under = this.sim.course.boxes.some((b) => b.kind === 'over' && b.s0 - 6 < this.sim.s && b.s1 + 1 > this.sim.s);
      if (under) { r.underOver++; if (h >= 2) r.underOverHidden++; }
    }
    this.view.legacyCam = false;
    return r;
  }
  /**
   * Test hook: a delivery, a Rush start, a pigeon scatter and two style moves in the same instant
   * (what used to pile up). Returns the floating boxes and any pair that overlaps.
   */
  testPileUp(): { boxes: { kind: string; r: { x0: number; y0: number; x1: number; y1: number } }[]; overlaps: number } {
    const evs: SimEvent[] = [
      { type: 'move', kind: 'bounce', pts: 196, chain: 7 },
      { type: 'deliver', pts: 450, perfect: true, streak: 3, bank: 2.4 },
      { type: 'rush' },
      { type: 'move', kind: 'pigeons', pts: 89, chain: 8 },
      { type: 'move', kind: 'gap', pts: 120, chain: 9 },
      { type: 'stumble', box: null, smash: true },
    ];
    for (const e of evs) this.onEvent(e);
    return this.pileCheck();
  }
  pileCheck(): { boxes: { kind: string; r: { x0: number; y0: number; x1: number; y1: number } }[]; overlaps: number } {
    const boxes = this.co.boxes();
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2) overlaps++;
    }
    return { boxes, overlaps };
  }
  /** Test hook: a power-up starts now. */
  testPower(k: Power): void { this.sim.grant(k); }
  /** Test hook: the autopilot with a custom skill (many falls: a high fumble rate). */
  testAutoSkill(sk: Partial<typeof SKILL.casual>, seed = 11): void {
    this.bot = new Bot(this.sim, { ...SKILL.casual, ...sk }, seed);
    this.forced = null;
    this.endTutorial(true);
  }
  /** Test hook: what the fall looks like this frame. */
  fallProbe(): { state: string; t: number; y: number; alpha: number; shown: boolean; hidden: number; under: boolean; inWall: boolean; dark: number } {
    const sim = this.sim, r = this.view.runner;
    const inWall = sim.course.boxes.some((b) => b.kind === 'roof' && sim.s > b.s0 + 0.05 && sim.s < b.s1 - 0.05 && sim.y < b.y1 - 0.3);
    return { state: sim.state, t: sim.stateT, y: sim.y, alpha: r.opacity, shown: r.shown, hidden: this.view.hiddenPoints(sim), under: sim.y < 0, inWall, dark: this.darkK };
  }
  testRush(): void { this.sim.meter = 0.999; (this.sim as unknown as { move: (k: string, n: number) => void }).move('vault', 600); }
}
