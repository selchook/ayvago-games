// Delivery Dash: the Play scene. Runs a shift or an Endless Rush on the simulation (sim.ts), draws
// it in 3D (view.ts) with the 2D HUD on top (order panel, minimap, goal, badges over the jobs, the
// distance over the van), reads the car steering (arrows, wheel or tilt on touch; ←/→ on keys) and
// the pedals into the van's inputs, and turns the simulation's events into sounds, words, coins and
// shakes. A shift ends with a stars card, then the core's result screen (RETRY reads NEXT after a
// won shift and plays the next one).
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, CarSteering, txt, t, isEasy, hudChip, HudChip, flash, burst, registerStrings,
  HUD_MARGIN, HUD_ROW2_Y, hudRightEdge, getLang,
} from '@core';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type SimEvent, type SimInput, type Order } from './sim';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { shift, rushShift, SHIFTS, type ShiftDef } from './shifts';
import { loadMeta, saveMeta, recordShift, nextShift, bank, type Meta } from './meta';
import { handling, vehicle, METRES, SHOP_CSS, FRAGILE, TURBO_MAX, clamp, type Mode } from './defs';
import { makeArt, OrderPanel, MiniMap, Badges, banner, glass, mmss, UI_DEPTH, badgeKey } from './ui';
import { makeSounds, Loop } from './audio';
import { cx, cz, type Bay } from './town';
import { fmt, money } from './money';

export { fmt, money };

interface Tip { box: Phaser.GameObjects.Container; step: number }

/**
 * Keeps the floating words, the pay popups and the banners from overlapping: each one takes the
 * band it covers (including how far it rises) for as long as it is on screen, and a new one moves
 * up or down to the nearest free band.
 */
class TextLanes {
  private items: { o: Phaser.GameObjects.Container | Phaser.GameObjects.Text; rise: number }[] = [];
  constructor(private scene: Phaser.Scene) {}

  /** What floats now: each item's full-size box, stretched up by how far it still rises. */
  private rects(): { x0: number; x1: number; y0: number; y1: number }[] {
    // still fading in counts too: an item leaves when it is destroyed at the end of its float
    this.items = this.items.filter((it) => it.o.active && it.o.visible);
    return this.items.map(({ o, rise }) => {
      const b = o.getBounds(), k = Math.max(0.05, o.scale);
      const w = b.width / k, h = b.height / k, cx = b.centerX, cy = o.y + (b.centerY - o.y) / k;
      return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2 - rise, y1: cy + h / 2 };
    });
  }

  /**
   * Moves a new floating text (its centre now at y, `h` high, rising `rise` px) to the nearest
   * band where it touches nothing else that floats, then keeps track of it.
   */
  place(o: Phaser.GameObjects.Container | Phaser.GameObjects.Text, rise: number, fixed = false): void {
    const rects = this.rects();
    const b = o.getBounds(), k = Math.max(0.05, o.scale);
    const w = b.width / k, h = b.height / k, x = b.centerX, cy = o.y + (b.centerY - o.y) / k;
    const pad = 8;
    const overlap = (yy: number) => {
      let a = 0;
      for (const r of rects) {
        const ox = Math.min(x + w / 2 + pad, r.x1) - Math.max(x - w / 2 - pad, r.x0);
        const oy = Math.min(yy + h / 2 + pad, r.y1) - Math.max(yy - h / 2 - rise - pad, r.y0);
        if (ox > 0 && oy > 0) a += ox * oy;
      }
      return a;
    };
    if (!fixed) {
      // below the HUD's chips (order panel, minimap, goal) and above the thumb controls: the
      // free spot nearest to where it wants to be, else the least crowded one
      const lo = TextLanes.TOP + rise + h / 2, hi = Math.max(lo, TextLanes.BOTTOM - h / 2);
      let best = clamp(cy, lo, hi), bestScore = Infinity;
      for (let c = lo; c <= hi + 0.1; c += 12) {
        const score = overlap(c) * 1000 + Math.abs(c - cy);
        if (score < bestScore) { bestScore = score; best = c; }
      }
      o.y += best - cy;
    }
    this.items.push({ o, rise });
  }

  /** Does a box overlap (or nearly touch) anything floating now? */
  busy(x: number, y: number, w: number, h: number): boolean {
    const p = 10;
    return this.rects().some((r) => x - w / 2 - p < r.x1 && x + w / 2 + p > r.x0 && y - h / 2 - p < r.y1 && y + h / 2 + p > r.y0);
  }

  /** The highest a floating text may sit: under the minimap, the goal and the turbo chips. */
  static readonly TOP = 410;
  /** The lowest: over the right-thumb buttons (turbo, horn) and the steering. */
  static readonly BOTTOM = 880;
}

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  def!: ShiftDef;
  mode: Mode = 'normal';
  rush = false;
  controls!: Controls;
  steering!: CarSteering;
  private panel!: OrderPanel;
  private minimap!: MiniMap;
  private badges!: Badges;
  private goalChip!: HudChip;
  private turboChip!: HudChip;
  private distChip!: HudChip;
  private speedLines: Phaser.GameObjects.Image[] = [];
  private engine!: Loop;
  private screech!: Loop;
  private rainLoop!: Loop;
  private townLoop!: Loop;
  private bot: Bot | null = null;
  private finished = false;
  private tip: Tip | null = null;
  private tutStep = 0;
  private odo = 0;
  private lastX = 0;
  private lastZ = 0;
  private lastClock = -1;
  private lastEarn = -1;
  private lastStars = -1;
  private mapTick = 0;
  private hornKey = false;
  private hornPrev = false;
  private turboKey = false;
  private lowWarned = false;
  private route: number[] = [];
  private lanes!: TextLanes;
  /** The pay popups on screen: while one floats, the distance chip over the van stays hidden. */
  private payPopups: Phaser.GameObjects.Container[] = [];
  private targetBay: Bay | null = null;
  /** Frame times of the first Play frames (ms), and the shader programs before the first frame (warm-up check). */
  firstFrames: number[] = [];
  programsAtStart = -1;
  /** The programs' cache keys before the first frame (test hook). */
  programKeys: string[] = [];
  private frameStart = 0;
  /** Test hook: runs the simulation faster (slow software rendering in screenshots). */
  testSpeed = 1;
  /** Test hook: the input the van gets instead of the player's (steering checks, screenshots). */
  testInput: Partial<SimInput> | null = null;
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
    this.def = this.rush ? rushShift() : shift(this.meta.shift);
    const seed = PlayScene.forceSeed ?? Math.floor(Math.random() * 1e9);
    const hand = handling(vehicle(this.meta.vehicle), this.meta.up);
    this.sim = new Sim({ shift: this.def, rush: this.rush, mode: this.mode, seed, hand });
    this.bot = null;
    this.finished = false;
    this.tip = null;
    this.tutStep = 0;
    this.odo = 0;
    this.lastX = this.sim.x;
    this.lastZ = this.sim.z;
    this.lastClock = -1;
    this.lastEarn = -1;
    this.lastStars = -1;
    this.mapTick = 0;
    this.lowWarned = false;
    this.route = [];
    this.targetBay = null;
    this.speedLines = [];
    this.lanes = new TextLanes(this);
    this.payPopups = [];
    this.firstFrames = [];
    this.frameStart = 0;
    this.testSpeed = 1;
    this.testInput = null;

    this.view = new View(this, this.sim, { vehicle: this.meta.vehicle, paint: this.meta.paint });
    this.world = this.view.world;
    this.programsAtStart = (this.world.renderer.info.programs ?? []).length;
    this.programKeys = (this.world.renderer.info.programs ?? []).map((q) => q.cacheKey);
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

    // HUD: earnings (core score chip), the clock in the centre; orders down the left, the
    // minimap and the goal on the right (clear of the pause corner)
    this.setScore(0);
    this.hud.setCenter(mmss(this.sim.clock));
    this.panel = new OrderPanel(this, HUD_MARGIN, HUD_ROW2_Y);
    const right = hudRightEdge(this);
    this.minimap = new MiniMap(this, this.sim, right, 128 + 78);
    this.goalChip = hudChip(this, right, 128 + 156 + 34, { align: 'right', icon: 'icon-star', iconSize: 28, label: this.rush ? t('earned') : t('goal'), text: '', size: 22, minWidth: 156, depth: UI_DEPTH - 5 });
    this.turboChip = hudChip(this, right, 128 + 156 + 34 + 54, { align: 'right', icon: 'dd-cup', iconSize: 28, text: '×0', size: 22, minWidth: 90, depth: UI_DEPTH - 5 });
    this.distChip = hudChip(this, 360, 600, { align: 'center', text: '', size: 20, height: 36, minWidth: 70, depth: UI_DEPTH - 25 });
    this.distChip.setVisible(false);
    this.badges = new Badges(this, this.view, true);
    for (let i = 0; i < 10; i++) {
      const img = this.add.image(0, 0, 'dd-speed').setScrollFactor(0).setDepth(UI_DEPTH - 30).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.speedLines.push(img);
    }

    // controls: the car steering (touch: arrows, wheel or tilt + pedals; keys: arrows/WASD)
    this.controls = new Controls(this, {});
    const { width: W, height: H } = this.scale;
    this.steering = new CarSteering(this, {
      touch: this.controls.touchUi,
      buttons: [
        { id: 'gas', shape: 'pedal', x: W - 84, y: H - 140, w: 128, h: 200, color: 0x2fae5a, label: t('gas'), hit: { right: Infinity, bottom: Infinity, left: 20 } },
        { id: 'brake', shape: 'pedal', x: W - 226, y: H - 112, w: 112, h: 150, color: 0xd8453c, label: t('brake'), labelSize: 22, hit: { bottom: Infinity, left: 16 } },
        { id: 'turbo', shape: 'round', x: W - 92, y: H - 338, r: 56, color: 0xff8a1a, icon: 'bolt', count: true, holds: 'gas' },
        { id: 'horn', shape: 'round', x: W - 226, y: H - 268, r: 44, color: 0x3c8ce8, label: t('horn'), labelSize: 18 },
      ],
      ramp: 0.3,
    });
    this.steering.begin();
    this.steering.centre();
    this.turboChip.setVisible(!this.steering.pad);
    this.input.keyboard?.on('keydown-H', () => { this.hornKey = true; });
    this.input.keyboard?.on('keydown-SPACE', () => { this.turboKey = true; });
    this.input.keyboard?.on('keydown-Z', () => { this.turboKey = true; });

    // sound loops
    this.engine = new Loop(this, 'engine');
    this.screech = new Loop(this, 'dd-screech');
    this.rainLoop = new Loop(this, 'dd-rain');
    this.townLoop = new Loop(this, 'dd-town');

    this.startBanner();
    if (!this.rush && this.def.tutorial && !this.meta.tutorial) this.tutStep = 1;
  }

  // ------------------------------------------------------------------ frame

  private input0(dt: number): SimInput {
    const c = this.controls, st = this.steering;
    const steer = st.steer(dt, c.axisX);
    const kb = this.input.keyboard;
    void kb;
    const inp: SimInput = {
      steer,
      gas: c.up || st.isDown('gas') ? 1 : 0,
      brake: c.down || st.isDown('brake') ? 1 : 0,
      turbo: this.turboKey || st.take('turbo'),
      horn: this.hornKey || st.take('horn'),
    };
    this.turboKey = false;
    this.hornKey = false;
    return inp;
  }

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    const dt = delta / 1000;
    const sim = this.sim;
    this.steering.update(dt);
    let inp = this.input0(dt);
    if (this.bot) inp = this.bot.input(dt * this.testSpeed);
    if (this.testInput) inp = { ...NO_INPUT, ...this.testInput };
    if (!this.finished) sim.step(dt * this.testSpeed, inp);
    void this.hornPrev;
    for (const ev of sim.events) this.onEvent(ev);
    sim.events.length = 0;
    this.odo += Math.hypot(sim.x - this.lastX, sim.z - this.lastZ);
    this.lastX = sim.x; this.lastZ = sim.z;
    this.updateRoute();
    this.view.sync(sim, dt);
    this.updateHud(dt);
    this.updateSound(dt);
    this.tutorial();
    if (sim.over && !this.finished) this.finish();
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  /** The route to the next job: the arrow over the van and the minimap line. */
  private updateRoute(): void {
    const sim = this.sim, tw = sim.town;
    const b = sim.target();
    this.targetBay = b;
    if (!b) { this.route = []; this.view.route = []; return; }
    const loc = tw.locate(sim.x, sim.z, sim.h);
    if (!loc) { this.route = []; this.view.route = []; return; }
    this.route = tw.routePoints(loc.edge, loc.s, b, 400, 2);
    this.view.route = this.route;
  }

  private at(x: number, y: number, z: number): { x: number; y: number } { return this.view.toScreen(x, y, z); }

  // ------------------------------------------------------------------ events

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    const W = this.scale.width;
    const vp = this.at(sim.x, sim.y + 1.5, sim.z);
    switch (ev.type) {
      case 'offer': {
        this.sfx('ping', { volume: 0.45 });
        if (ev.order.vip) { this.sfx('vipsting', { volume: 0.5, exact: true }); this.say(W / 2, 360, t('vip'), { color: '#ffd23f', size: 44, hold: 0.8 }); }
        break;
      }
      case 'pickup': {
        this.sfx('pickup', { volume: 0.6 });
        this.sfx('box', { volume: 0.5 });
        const p = this.at(ev.order.shop.x, ev.order.shop.y + 1.5, ev.order.shop.z);
        this.floatWord(p.x, p.y - 30, t('pickedUp'), SHOP_CSS[ev.order.cargo], 32);
        burst(this, p.x, p.y, [0xffffff, 0xffd23f], 16, 220);
        if (FRAGILE[ev.order.cargo]) this.time.delayedCall(500, () => { if (!this.isOver) this.floatWord(vp.x, vp.y - 70, t('careful'), '#ffb35a', 26); });
        break;
      }
      case 'full': this.sfx('error', { volume: 0.35 }); this.floatWord(vp.x, vp.y - 40, t('full'), '#ff9a7a', 28); break;
      case 'deliver': this.delivered(ev); break;
      case 'expire': this.sfx('cancel', { volume: 0.45 }); this.floatWord(W / 2, 420, t('expired'), '#ff9a7a', 30); break;
      case 'late': this.sfx('cancel', { volume: 0.35 }); this.floatWord(W / 2, 420, t('lateMsg'), '#ffb35a', 30); break;
      case 'crash': {
        this.sfx('crash', { volume: 0.8 });
        this.sfx('crunch', { volume: 0.7 });
        this.view.shake(0.6 + ev.speed * 0.08);
        this.cameras.main.shake(260, 0.006 + ev.speed * 0.0012);
        flash(this, 0xffffff, 120, 0.25);
        const p = this.at(ev.x, ev.y + 1.2, ev.z);
        this.say(clamp(p.x, 170, W - 170), clamp(p.y - 80, 300, 900), t('crash'), { color: '#ff5a4f', size: 56, hold: 0.5 });
        if (ev.damage > 0.01) this.floatWord(p.x, p.y - 10, '−' + Math.round(ev.damage * 100) + '%', '#ff8a7a', 28);
        break;
      }
      case 'scrape': this.sfx('scrape', { volume: 0.35 }); break;
      case 'bump': {
        this.sfx(ev.severity > 3 ? 'thump' : 'bumpS', { volume: clamp(0.25 + ev.severity * 0.06, 0.25, 0.8) });
        if (ev.damage > 0.015) {
          this.sfx('glass', { volume: 0.4 });
          this.floatWord(vp.x, vp.y - 50, '−' + Math.round(ev.damage * 100) + '%', '#ffb35a', 26);
        }
        break;
      }
      case 'damage': break;
      case 'scare': {
        this.sfx('hey', { volume: 0.5 });
        const p = this.at(ev.ped.x, ev.ped.y + 2, ev.ped.z);
        this.floatWord(p.x, p.y, t('fine', { n: money(ev.fine) }), '#ff9a7a', 26);
        break;
      }
      case 'hop': this.sfx('hop', { volume: 0.3 }); break;
      case 'coffee': {
        this.sfx('slurp', { volume: 0.6 });
        const p = this.at(ev.x, ev.y + 1, ev.z);
        this.floatWord(p.x, p.y - 20, t('coffee'), '#ffcf8a', 28);
        if (this.tutStep === 6) this.closeTip();
        break;
      }
      case 'turbo': {
        this.sfx('turbo', { volume: 0.6 });
        this.floatWord(vp.x, vp.y - 60, t('turboGo'), '#ffb35a', 36);
        break;
      }
      case 'horn': this.sfx('dd-horn', { volume: 0.55, exact: true }); break;
      case 'honk': if (Math.hypot(ev.car.x - sim.x, ev.car.z - sim.z) < 16) this.sfx('dd-horn', { volume: 0.25, rate: 0.82 }); break;
      case 'wrongWay': this.sfx('error', { volume: 0.3 }); this.say(W / 2, 330, t('wrongWay'), { color: '#ff9a7a', size: 38, hold: 0.6 }); break;
      case 'stop': if (ev.kind === 'house' && !sim.carried().some((o) => o.house === ev.bay)) break; this.sfx('brakeS', { volume: 0.25 }); break;
      case 'weather': {
        const key = ev.kind === 'dusk' ? 'dusk' : ev.kind === 'night' ? 'night' : 'rain';
        this.say(W / 2, 340, t(key), { color: ev.kind === 'rain' ? '#9fd8ff' : '#ffcf8a', size: 34, hold: 1 });
        if (ev.kind === 'rain') this.sfx('thunder', { volume: 0.4 });
        break;
      }
      default: break;
    }
  }

  private floatWord(x: number, y: number, s: string, color: string, size: number): void {
    const W = this.scale.width;
    const tx = txt(this, 0, 0, s, { title: true, size, color, strokeThickness: 7 }).setDepth(UI_DEPTH + 30);
    tx.setPosition(clamp(x, tx.width / 2 + 20, W - tx.width / 2 - 20), clamp(y, 200, 1000));
    this.lanes.place(tx, 60);
    tx.setScale(0.4);
    this.tweens.add({ targets: tx, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tx, y: tx.y - 60, alpha: 0, delay: 650, duration: 450, onComplete: () => tx.destroy() });
  }

  /** A banner that takes its band (start banners keep their place; the others move to a free one). */
  private say(x: number, y: number, s: string, o: Parameters<typeof banner>[4] = {}, fixed = false): void {
    this.lanes.place(banner(this, x, y, s, o), 50, fixed);
  }

  private delivered(ev: Extract<SimEvent, { type: 'deliver' }>): void {
    const W = this.scale.width;
    const b = ev.order.house;
    this.sfx('dd-doorbell', { volume: 0.55, exact: true });
    this.time.delayedCall(380, () => this.sfx('door', { volume: 0.4 }));
    this.time.delayedCall(650, () => { if (ev.tip > 0) this.sfx('dd-till', { volume: 0.6, exact: true }); else this.sfx('coin', { volume: 0.5 }); });
    const p = this.at(b.x, b.y + 2.2, b.z);
    // "+pay" and "+tip" float up, coins fly to the score
    const c = this.add.container(clamp(p.x, 140, W - 140), 0).setDepth(UI_DEPTH + 40);
    c.add(txt(this, 0, 0, '+' + money(ev.pay), { title: true, size: 44, color: '#ffffff', strokeThickness: 8 }));
    if (ev.tip > 0) c.add(txt(this, 0, 46, t('tipN', { n: money(ev.tip) }), { title: true, size: 32, color: '#ffe27a', strokeThickness: 7 }));
    if (ev.perfect) c.add(txt(this, 0, -48, t('perfect'), { title: true, size: 30, color: '#7dffa0', strokeThickness: 7 }));
    if (ev.order.late || ev.order.cond < 0.25) c.add(txt(this, 0, 46, ev.order.late ? t('lateMsg') : t('ruined'), { title: true, size: 26, color: '#ff9a7a', strokeThickness: 6 }));
    c.y = clamp(p.y - 30, 240, 960);
    this.lanes.place(c, 50);
    this.payPopups.push(c);
    c.setScale(0.3);
    this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: c.y - 80, alpha: 0, delay: 1100, duration: 500, onComplete: () => c.destroy() });
    const n = Math.min(14, 4 + Math.round((ev.pay + ev.tip) / 4));
    const sc = this.hud.scoreChip;
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(c.x + Phaser.Math.Between(-40, 40), c.y + Phaser.Math.Between(-20, 30), 'dd-coin').setDisplaySize(30, 30).setDepth(UI_DEPTH + 39);
      this.tweens.add({
        targets: coin, x: sc.x + 40, y: sc.y, delay: 250 + i * 45, duration: 520, ease: 'Cubic.easeIn',
        onComplete: () => { coin.destroy(); if (i === n - 1) this.tweens.add({ targets: sc, scale: { from: 1.25, to: 1 }, duration: 220 }); },
      });
    }
    burst(this, c.x, c.y, [0xffd23f, 0xffffff, 0x7dffa0], 26, 300);
    if (ev.bonusTime > 0) this.floatWord(W / 2, 170, t('addTime', { n: Math.round(ev.bonusTime) }), '#7dffa0', 30);
    if (this.tutStep === 4) this.showTip(5, t('tut_done'));
  }

  // ------------------------------------------------------------------ HUD and sound

  private updateHud(dt: number): void {
    const sim = this.sim;
    const sec = Math.ceil(sim.clock);
    if (sec !== this.lastClock) {
      this.lastClock = sec;
      this.hud.setCenter(mmss(sim.clock));
      if (sec <= 10 && sec > 0) {
        this.sfx('tick', { volume: 0.35 });
        if (!this.lowWarned) { this.lowWarned = true; this.say(this.scale.width / 2, 300, t('timeLow'), { color: '#ff9a7a', size: 34, hold: 0.6 }); }
      } else if (sec > 10) this.lowWarned = false;
    }
    if (sim.earnings !== this.lastEarn) {
      this.lastEarn = sim.earnings;
      this.setScore(sim.earnings);
      if (this.rush) this.goalChip.setText(money(sim.earnings));
      else {
        const tg = this.def.targets;
        const st = sim.stars();
        const next = tg[Math.min(2, st)];
        this.goalChip.setText(st >= 3 ? '★★★' : `${money(sim.earnings)} / ${money(next)}`);
        if (st !== this.lastStars) {
          if (this.lastStars >= 0 && st > this.lastStars) {
            this.sfx('star', { volume: 0.6 });
            burst(this, this.goalChip.x - 60, this.goalChip.y, [0xffd23f, 0xffffff], 20, 220);
            this.tweens.add({ targets: this.goalChip, scale: { from: 1.3, to: 1 }, duration: 320, ease: 'Back.easeOut' });
          }
          this.lastStars = st;
          this.goalChip.setCaption(t('goal') + ' ' + '★'.repeat(st) + '☆'.repeat(3 - st));
        }
      }
    }
    this.panel.sync(sim);
    if (++this.mapTick % 3 === 0) this.minimap.sync(sim, this.route);
    this.badges.sync(sim, dt);
    this.turboChip.setText('×' + sim.turbo);
    this.steering.pad?.setCount('turbo', sim.turbo);
    // the distance to the target over the van
    if (this.targetBay && this.route.length >= 3) {
      let d = 0;
      for (let i = 3; i < this.route.length; i += 3) d += Math.hypot(this.route[i] - this.route[i - 3], this.route[i + 2] - this.route[i - 1]);
      const p = this.at(sim.x, sim.y + 3.6, sim.z);
      this.payPopups = this.payPopups.filter((q) => q.active);
      const quiet = this.payPopups.length > 0 || this.lanes.busy(p.x, p.y - 18, this.distChip.chipWidth + 10, 44);
      this.distChip.setVisible(!quiet).setPosition(p.x, p.y - 18);
      this.distChip.setText(Math.max(0, Math.round(d * METRES / 5) * 5) + ' m');
    } else this.distChip.setVisible(false);
    // speed lines while turbo burns
    const tk = sim.turboT > 0 ? 1 : 0;
    const { width: W, height: H } = this.scale;
    this.speedLines.forEach((s, i) => {
      if (!tk) { s.setAlpha(Math.max(0, s.alpha - dt * 4)); return; }
      if (Math.random() < dt * 8) {
        const left = i % 2 === 0;
        s.setPosition(left ? Phaser.Math.Between(10, 140) : Phaser.Math.Between(W - 140, W - 10), Phaser.Math.Between(260, H - 340)).setScale(1.2, Phaser.Math.FloatBetween(2, 4)).setAlpha(0.6);
      }
      s.y += dt * 900;
      s.setAlpha(Math.max(0, s.alpha - dt * 1.5));
    });
  }

  private updateSound(dt: number): void {
    const sim = this.sim;
    const sp = Math.abs(sim.v) / sim.hand.vmax;
    const live = !this.finished;
    this.engine.set(live ? 0.16 + sp * 0.12 : 0, 0.7 + sp * 0.9 + (sim.turboT > 0 ? 0.25 : 0), dt);
    this.screech.set(live && sim.slide > 1.2 && Math.abs(sim.v) > 4 ? clamp((sim.slide - 1.2) * 0.25, 0, 0.35) : 0, 0.95 + sp * 0.1, dt, 12);
    this.rainLoop.set(live ? sim.rain * 0.3 : 0, 1, dt, 2);
    this.townLoop.set(live ? 0.22 * (1 - sim.rain * 0.6) : 0, 1, dt, 2);
  }

  private startBanner(): void {
    const W = this.scale.width;
    if (this.rush) {
      this.say(W / 2, 560, t('rush'), { color: '#ffd23f', size: 52, hold: 1.1, sub: t('go'), subColor: '#ffffff' }, true);
      return;
    }
    const d = this.def;
    this.say(W / 2, 520, t('shiftN', { n: d.id }) + ' · ' + t('d' + d.district), { color: '#ffffff', size: 44, hold: 1.3, sub: t(d.intro), subColor: '#ffd23f' }, true);
    if (!d.tutorial || this.meta.tutorial) this.time.delayedCall(2000, () => {
      if (!this.isOver) this.say(W / 2, 480, t('target', { n: money(d.targets[0]) }), { color: '#7dffa0', size: 34, hold: 0.8 });
    });
  }

  // ------------------------------------------------------------------ tutorial (shift 1, once)

  private tutorial(): void {
    if (this.tutStep <= 0 || this.finished) return;
    const sim = this.sim;
    const touch = !!this.steering.pad;
    if (this.tutStep === 1 && !this.tip && this.elapsed > 2.2) this.showTip(1, t(touch ? 'tut_driveTouch' : 'tut_driveKeys'));
    else if (this.tutStep === 1 && this.tip && this.odo > 14) this.showTip(2, t('tut_follow'));
    else if (this.tutStep === 2) {
      const b = sim.offered()[0]?.shop;
      if (b && Math.hypot(b.x - sim.x, b.z - sim.z) < 12) this.showTip(3, t('tut_stop'));
      if (sim.carried().length) this.showTip(4, t('tut_deliver'));
    } else if (this.tutStep === 3 && sim.carried().length) this.showTip(4, t('tut_deliver'));
    else if (this.tutStep === 5 && this.tip && this.elapsed - (this.tip.box.getData('at') as number) > 4.5) {
      if (sim.coffees.length && sim.turbo === 0) this.showTip(6, t('tut_coffee'));
      else this.endTutorial();
    } else if (this.tutStep === 6 && this.tip && this.elapsed - (this.tip.box.getData('at') as number) > 7) this.endTutorial();
  }

  private endTutorial(): void {
    this.closeTip();
    this.tutStep = -1;
    this.meta.tutorial = true;
    saveMeta(this.meta);
  }

  private showTip(step: number, msg: string): void {
    this.tutStep = step;
    this.tip?.box.destroy();
    for (const o of this.children.list.filter((c) => c.getData?.('tutHand'))) o.destroy();
    const { width } = this.scale;
    const body = txt(this, 0, 0, msg, { size: 26, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 540 });
    const h = body.height + 40;
    const c = this.add.container(width / 2, 470).setScrollFactor(0).setDepth(UI_DEPTH + 60);
    c.add([glass(this, 600, h, { color: 0x14204a, alpha: 0.92, rim: 0xffd23f }), body]);
    c.setData('at', this.elapsed);
    c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tip = { box: c, step };
    this.sfx('tick', { volume: 0.4 });
    // a hand points at the GAS pedal on touch screens
    if (step === 1 && this.steering.pad) {
      const { width: W, height: H } = this.scale;
      const hand = this.add.image(W - 70, H - 150, 'dd-hand').setDisplaySize(84, 84).setDepth(UI_DEPTH + 61).setAngle(-15).setData('tutHand', true);
      this.tweens.add({ targets: hand, y: H - 130, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private closeTip(): void {
    const tip = this.tip;
    for (const o of this.children.list.filter((c) => c.getData?.('tutHand'))) o.destroy();
    if (!tip) return;
    this.tip = null;
    this.tweens.add({ targets: tip.box, alpha: 0, scale: 0.9, duration: 160, onComplete: () => tip.box.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private finish(): void {
    this.finished = true;
    const sim = this.sim;
    const W = this.scale.width;
    this.closeTip();
    this.steering.end();
    this.distChip.setVisible(false);
    bank(this.meta, sim.earnings);
    this.setScore(sim.earnings);
    this.sfx('whistle', { volume: 0.5 });
    if (this.rush) {
      this.meta.rushRuns++;
      saveMeta(this.meta);
      this.endGame({ win: false, title: t('rushOver'), delay: 900 });
      return;
    }
    const stars = sim.stars();
    const won = stars > 0;
    const opened = won ? recordShift(this.meta, this.def.id, stars) : [];
    if (this.def.tutorial) { this.meta.tutorial = true; saveMeta(this.meta); }
    const next = won ? nextShift(this.meta, this.def.id) : null;
    if (next) { this.meta.shift = next; saveMeta(this.meta); registerStrings({ tr: { retry: 'SONRAKİ' }, en: { retry: 'NEXT' } }); }
    // the stars card
    const c = this.add.container(W / 2, 600).setScrollFactor(0).setDepth(UI_DEPTH + 150);
    c.add(glass(this, 620, 470, { color: 0x14204a, alpha: 0.95 }));
    c.add(txt(this, 0, -190, won ? t('shiftDone', { n: this.def.id }) : t('shiftFail'), { title: true, size: 38, color: won ? '#ffd23f' : '#ff9a7a', strokeThickness: 8 }));
    const starImgs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(-120 + i * 120, -112, 'icon-star').setDisplaySize(84, 84).setTint(0x46507a);
      starImgs.push(s);
      c.add(s);
    }
    const st = sim.stats;
    const rows: [string, string][] = [
      [t('deliveries'), String(st.delivered)],
      [t('tips'), money(st.tips)],
      [t('crashes'), String(st.crashes)],
      [t('wallet'), money(this.meta.cash)],
    ];
    rows.forEach(([k, v], i) => {
      const y = -36 + i * 38;
      c.add(txt(this, -200, y, k, { size: 26, color: '#cfe0ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      c.add(txt(this, 200, y, v, { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(1, 0.5));
    });
    const sc = txt(this, 0, 145, money(0), { title: true, size: 50, color: '#ffe27a', strokeThickness: 7 });
    c.add(sc);
    if (opened.length) c.add(txt(this, 0, 202, t('newDistrict', { d: t('d' + opened[0]) }), { title: true, size: 24, color: '#7dffa0', strokeThickness: 5 }));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    for (let i = 0; i < stars; i++) {
      this.time.delayedCall(450 + i * 380, () => {
        const s = starImgs[i];
        s.setTint(0xffd23f);
        this.tweens.add({ targets: s, scale: { from: s.scale * 1.8, to: s.scale }, duration: 320, ease: 'Back.easeOut' });
        burst(this, W / 2 - 120 + i * 120, 488, [0xffd23f, 0xffffff], 22, 260);
        this.sfx('star', { volume: 0.6, rate: 1 + i * 0.15 });
      });
    }
    this.tweens.addCounter({ from: 0, to: sim.earnings, duration: 900, delay: 400, onUpdate: (tw) => sc.setText(money(tw.getValue() ?? 0)) });
    this.sfx(won ? 'fanfare' : 'cancel', { volume: 0.5, exact: true });
    this.time.delayedCall(3000, () => {
      this.tweens.add({ targets: c, alpha: 0, scale: 0.92, duration: 200, onComplete: () => c.destroy() });
      this.endGame({ win: won, title: won ? t('shiftDone', { n: this.def.id }) : t('timeUp'), delay: 200 });
    });
  }

  // ------------------------------------------------------------------ test hooks

  /** The autopilot drives (store art, screenshots, balance). */
  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void { this.bot = on ? new Bot(this.sim, SKILL[skill], 11) : null; }
  /** Steps the simulation `seconds` at once (the view only sees the end). */
  testStep(seconds: number): void {
    for (let t0 = 0; t0 < seconds && !this.sim.over; t0 += 1 / 30) {
      const inp = this.bot ? this.bot.input(1 / 30) : this.testInput ? { ...NO_INPUT, ...this.testInput } : NO_INPUT;
      this.sim.step(1 / 30, inp);
      for (const ev of this.sim.events) if (ev.type !== 'deliver' && ev.type !== 'pickup' && ev.type !== 'crash') this.view.handle(ev, this.sim);
      this.sim.events.length = 0;
    }
    this.view.snap(this.sim);
  }
  /**
   * Steps until an event of `type` happens (at most `seconds`); that step's events play in full.
   * Returns whether it did.
   */
  testUntil(type: SimEvent['type'], seconds: number): boolean {
    for (let t0 = 0; t0 < seconds && !this.sim.over; t0 += 1 / 30) {
      const inp = this.bot ? this.bot.input(1 / 30) : this.testInput ? { ...NO_INPUT, ...this.testInput } : NO_INPUT;
      this.sim.step(1 / 30, inp);
      const hit = this.sim.events.some((ev) => ev.type === type);
      // the camera first, so words and coins appear over the right spot
      if (hit) { this.view.snap(this.sim); this.updateRoute(); this.view.sync(this.sim, 0); }
      for (const ev of this.sim.events) { if (hit) this.onEvent(ev); else this.view.handle(ev, this.sim); }
      this.sim.events.length = 0;
      if (hit) return true;
    }
    return false;
  }
  /** Puts the van in a cell's lane heading in direction d (0 N, 1 E, 2 S, 3 W) at speed v. */
  testPlace(r: number, c: number, d: number, v = 0): void {
    const tw = this.sim.town;
    const cell = tw.cell(r, c);
    if (!cell) return;
    const lane = 1, rt = (d + 1) % 4;
    const DXs = [0, 1, 0, -1], DZs = [-1, 0, 1, 0];
    const x = cx(c) + DXs[rt] * lane, z = cz(r) + DZs[rt] * lane;
    this.sim.place(x, z, [Math.PI, Math.PI / 2, 0, -Math.PI / 2][d], v);
    this.view.snap(this.sim);
  }
  /** Adds an order already in the van (a cargo to a house far enough away). */
  testCarry(cargo: Order['cargo'], vip = false): void {
    const sim = this.sim, tw = sim.town;
    const shop = tw.shops.find((b) => b.lot.shop === cargo) ?? tw.shops[0];
    const house = tw.houses.find((h) => Math.hypot(h.x - sim.x, h.z - sim.z) > 40 && !sim.orders.some((o) => o.house === h)) ?? tw.houses[0];
    sim.orders.push({ id: 900 + sim.orders.length, cargo, shop, house, total: 60, left: 52, state: 'carried', cond: 1, vip, base: vip ? 30 : 15, late: false, dist: 60 });
  }
  /** One frame of the simulation (dt seconds, the bot or the test input driving) and the view. */
  testFrame(dt: number): void {
    const inp = this.bot ? this.bot.input(dt) : this.testInput ? { ...NO_INPUT, ...this.testInput } : NO_INPUT;
    this.sim.step(dt, inp);
    for (const ev of this.sim.events) this.onEvent(ev);
    this.sim.events.length = 0;
    this.updateRoute();
    this.view.sync(this.sim, dt);
  }
  /** The camera and the delivery shot settle at once (store art). */
  testSettle(): void { this.view.settle(this.sim); }
  /** Adds up to n cars on the lanes 6–22 units from the van (a busy street for the store art). */
  testTraffic(n: number): void {
    const sim = this.sim, tw = sim.town;
    const p = [0, 0, 0, 0];
    let added = 0;
    for (const e of tw.edges) {
      if (added >= n) break;
      if (e.turn !== 'straight') continue;
      tw.pointOn(e, e.len / 2, p);
      const d = Math.hypot(p[0] - sim.x, p[2] - sim.z);
      if (d < 6 || d > 22 || sim.cars.some((c) => c.edge === e.id)) continue;
      sim.cars.push({ id: 700 + added, model: added % 5, edge: e.id, s: e.len / 2, next: -1, v: 4, vmax: 6, x: p[0], y: p[1], z: p[2], h: p[3], wait: 0, honk: 0, halt: 0, color: [0xe8453c, 0x3c8ce8, 0xf5c331, 0x8a52d8, 0x48b86a][added % 5], braking: false });
      added++;
    }
  }
  /** Ends the round now with these earnings (result screens). */
  testEnd(earnings: number): void { this.sim.earnings = earnings; this.sim.clock = 0.05; }
  testWeather(night: number, rain: number): void { this.sim.night = night; this.sim.rain = rain; }
  testSkipTutorial(): void { this.closeTip(); this.tutStep = -1; }
  testCam(pos: [number, number, number] | null, look?: [number, number, number]): void { this.view.debugCam = pos && look ? { pos, look } : null; }
  /** Every shift's id (for the screenshot scripts). */
  static shifts(): number[] { return SHIFTS.map((s) => s.id); }
}

export { badgeKey, TURBO_MAX };
