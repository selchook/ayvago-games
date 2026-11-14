// Zombie Grove: the Play scene. Runs the simulation (sim.ts) at a fixed 60 Hz, draws it in 3D
// (view.ts) under a Phaser HUD, reads the stick and the keys, banks the level-up offers and opens
// them in the card bar when the player wants (the fight runs on in slow motion), shows the power-ups
// (timer chips) and the gold chest's reveal, plays the sounds, banners and damage numbers, offers
// the endless night after the dawn, and banks the night's coins (and new heroes) at the end.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, playMusic, hudChip, HudChip, flash, shake, storage,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP,
} from '@core';
import { ChestReveal } from './chestui';
import type { Card as ChestCard } from './cards';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent, type Offer } from './sim';
import { TUNING, isBoss, type Mode, type BossKind, type WeaponId, type PassiveId, type ZombieKind, type PowerId, type BuffId, type HeroId } from './defs';
import { RARITY_COLOR, type Card } from './cards';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { metaFx, runBonus, bankRun, type Meta } from './meta';
import { loadMeta, saveMeta } from './save';
import { makeArt, cardArt, COIN, SKULL, MOON, SUN, OFFER, INFINITY, POWER_HUE } from './art';
import { HpBar, XpChip, WeaponTray, BossBar, BuffChips, banner, bossWarning, glass, Pill, UI_DEPTH } from './ui';
import { CardBar, OfferButton, DRAFT_DEPTH, BAR_BOTTOM, BAR_H, cardText } from './cardsui';
import { xpToNext } from './defs';

const STEP = 1 / 60;
const BAR_SLOW = 0.4;
const SLOW_EASE = 7;
const GRACE = 0.6;
const GRACE_CD = 4;
const BOTTOM_Y = 1214;
const SEEN_KEY = 'zombie-grove:seen';
/** Each power-up's pickup sound. */
const POWER_SFX: Record<PowerId, string> = { heal: 'heal', vacuum: 'magnet', nuke: 'nuke', freeze: 'bell', rage: 'rage', boots: 'boots' };
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface DmgText { t: Phaser.GameObjects.Text; life: number; x: number; y: number }

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  mode: Mode = 'normal';
  private controls!: Controls;
  private hp!: HpBar;
  private xp!: XpChip;
  private tray!: WeaponTray;
  private bossBar!: BossBar;
  private buffChips!: BuffChips;
  private chest: ChestReveal | null = null;
  private chestQueue: { cards: ChestCard[]; coins: number }[] = [];
  private choice: { root: Phaser.GameObjects.Container; pills: Pill[]; focus: number } | null = null;
  private newHeroes: HeroId[] = [];
  private killChip!: HudChip;
  private coinChip!: HudChip;
  private offerBtn!: OfferButton;
  private vignette!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private bar: CardBar | null = null;
  private barOffer = -1;
  slow = 1;
  private graceCd = 0;
  private acc = 0;
  private bulletT = 0;
  private inputKind: 'touch' | 'keys' = 'touch';
  private bot: Bot | null = null;
  private botCards = true;
  private dmg: DmgText[] = [];
  private dmgPool: Phaser.GameObjects.Text[] = [];
  private bolts: { pts: { x: number; z: number }[]; t: number; seed: number }[] = [];
  private groanT = 2;
  private stepT = 0;
  private beatT = 0;
  private hitSfx = 0;
  private killSfx = 0;
  private gemSfx = 0;
  private gemPitch = 0;
  private lowWarned = false;
  private lastMinute = false;
  private ended = false;
  private banked = false;
  private coinsEarned = 0;
  private summaryBox: Phaser.GameObjects.Container | null = null;
  private seen = new Set<string>();
  private shownCoins = -1;
  private shownKills = -1;
  private shownTime = '';
  /** Frame times of the first Play frames (ms), and the shader programs before the first one. */
  firstFrames: number[] = [];
  programsAtStart = -1;
  programsAfter = -1;
  private frameStart = 0;
  /** Test hook: CPU cost per frame and the draw calls of the last render. */
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0 };
  testSpeed = 1;

  createGame(): void {
    this.mode = isEasy() ? 'easy' : 'normal';
    this.meta = loadMeta();
    const fx = metaFx(this.meta);
    this.sim = new Sim(this.mode, Math.floor(Math.random() * 1e9), fx);
    this.bar = null;
    this.barOffer = -1;
    this.slow = 1;
    this.graceCd = 0;
    this.acc = 0;
    this.bulletT = 0;
    this.bot = null;
    this.botCards = true;
    this.dmg = [];
    this.dmgPool = [];
    this.bolts = [];
    this.groanT = 2;
    this.stepT = 0;
    this.beatT = 0;
    this.hitSfx = this.killSfx = this.gemSfx = this.gemPitch = 0;
    this.lowWarned = false;
    this.lastMinute = false;
    this.ended = false;
    this.banked = false;
    this.coinsEarned = 0;
    this.summaryBox = null;
    this.chest = null;
    this.chestQueue = [];
    this.choice = null;
    this.newHeroes = [];
    // the won night waits for the keep-going choice
    this.sim.hold = true;
    this.shownCoins = this.shownKills = -1;
    this.shownTime = '';
    this.firstFrames = [];
    this.frameStart = 0;
    this.testSpeed = 1;
    this.quiet = false;
    this.seen = new Set(storage.get<string[]>(SEEN_KEY, []));
    this.inputKind = this.sys.game.device.input.touch ? 'touch' : 'keys';
    makeArt(this);

    this.view = new View(this, { hero: this.meta.hero });
    this.world = this.view.world;
    const renderer = this.world.renderer;
    this.programsAtStart = (renderer.info.programs ?? []).length;
    this.programsAfter = -1;
    this.perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0 };
    const w = this.world;
    const render = w.render.bind(w);
    w.render = () => {
      const t0 = performance.now();
      render();
      const d = performance.now() - t0;
      this.perf.render += d;
      this.perf.maxRender = Math.max(this.perf.maxRender, d);
      this.perf.calls = renderer.info.render.calls;
      this.perf.tris = renderer.info.render.triangles;
      this.perf.maxCalls = Math.max(this.perf.maxCalls, this.perf.calls);
      if (this.programsAfter < 0 && this.perf.frames > 0) this.programsAfter = (renderer.info.programs ?? []).length;
    };
    this.controls = new Controls(this, { joystick: true });
    const { width } = this.scale;

    // HUD: score (core), the time to dawn in the centre chip; level + XP, kills and coins on row 2;
    // health, the weapon tray and the card-offer button along the bottom
    this.hud.setCenter(this.clock());
    this.hud.centerChip.setIcon(MOON, undefined, 28);
    this.xp = new XpChip(this, HUD_MARGIN, HUD_ROW2_Y);
    this.killChip = hudChip(this, this.xp.chip.right + HUD_GAP, HUD_ROW2_Y, { icon: SKULL, iconSize: 28, text: '0', minWidth: 90, depth: UI_DEPTH });
    this.coinChip = hudChip(this, this.killChip.right + HUD_GAP, HUD_ROW2_Y, { icon: COIN, iconSize: 28, text: '0', color: '#ffe68a', minWidth: 90, depth: UI_DEPTH });
    this.bossBar = new BossBar(this, width / 2, HUD_ROW2_Y + 62);
    this.buffChips = new BuffChips(this, width - HUD_MARGIN, HUD_ROW2_Y + 126);
    this.hp = new HpBar(this, HUD_MARGIN, BOTTOM_Y);
    this.tray = new WeaponTray(this, width / 2, BOTTOM_Y - 74);
    const keys = !this.sys.game.device.input.touch;
    this.offerBtn = new OfferButton(this, width - HUD_MARGIN - OfferButton.R, BOTTOM_Y - 14, keys, () => this.toggleBar());
    this.overlay = this.add.graphics().setDepth(50).setScrollFactor(0);
    this.vignette = this.add.graphics().setDepth(60).setScrollFactor(0);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.choice && this.choiceKey(e.code)) return;
      if (this.chest && !this.chest.done && this.chest.key(e.code)) return;
      if (this.barOpen && this.bar!.key(e.code)) return;
      if (e.code === 'KeyE') { this.toggleBar(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.inputKind = 'keys';
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.wasTouch) this.inputKind = 'touch'; });

    // a run left through the pause menu still banks what it earned
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (!this.banked && this.sim.time > 20) this.bankCoins(); this.view.dispose(); });
    playMusic(this, 'level3');
    banner(this, 400, t('nightFalls'), t('surviveDawn'), { color: '#ffb27a', hold: 1.6 });
    this.time.delayedCall(1900, () => this.hint(this.inputKind === 'touch' ? 'hintTouch' : 'hintKeys', true));
  }

  get tune() { return TUNING[this.mode]; }

  private clock(): string {
    // the endless night counts up from the dawn
    const left = this.sim.endless ? Math.floor(this.sim.time - this.sim.endlessT0) : Math.max(0, Math.ceil(this.sim.tune.night - this.sim.time));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }

  private readInput(dt: number): Input {
    if (this.bot) return this.bot.input(dt);
    return { mx: this.controls.axisX, mz: this.controls.axisY };
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    this.step(delta / 1000);
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  /** Test hook: the clock stands still and only moves by testAdvance() (screenshot sequences). */
  frozen = false;
  private pending = 0;
  testFreeze(on: boolean): void { this.frozen = on; this.pending = 0; }
  testAdvance(s: number): void { this.pending += s; }

  private step(dt: number): void {
    if (this.frozen) { dt = this.pending; this.pending = 0; }
    const sim = this.sim;
    const target = this.barOpen || this.chestOpen ? BAR_SLOW : 1;
    this.slow += (target - this.slow) * Math.min(1, dt * SLOW_EASE);
    if (Math.abs(target - this.slow) < 0.004) this.slow = target;
    let k = this.slow * this.testSpeed;
    if (this.bulletT > 0) { this.bulletT -= dt; k *= 0.3; }
    this.graceCd -= dt * k;
    if (this.bot && this.botCards && !this.bar && sim.offers.length) sim.takeAll((c) => this.bot!.choose(c));
    this.acc += dt * k;
    let n = 0;
    while (this.acc >= STEP && n < 10) {
      this.acc -= STEP;
      n++;
      sim.step(STEP, sim.player.alive ? this.readInput(STEP) : NO_INPUT);
      for (const ev of sim.events) this.onEvent(ev);
      sim.events.length = 0;
    }
    if (n >= 10) this.acc = 0;
    this.bar?.update(dt);
    this.chest?.update(dt);
    this.view.sync(sim, dt * Math.max(0.3, this.slow) * Math.min(1, this.testSpeed || 0.0001) * (this.bulletT > 0 ? 0.4 : 1));
    this.updateHud(dt);
    this.updateSounds(dt);
    this.drawOverlay(dt);
    this.updateDmg(dt);
    if (sim.over && !this.ended) this.finish();
  }

  // ------------------------------------------------------------------ events

  private sx(x: number, z: number, y = 0.9) { return this.view.toScreen(x, y, z); }

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    switch (ev.type) {
      case 'hit':
        if (ev.crit || ev.boss || ev.dmg >= 30 || Math.random() < 0.25) this.dmgNumber(ev.x, ev.z, ev.dmg, ev.crit);
        if (this.hitSfx <= 0) { this.hitSfx = 0.06; this.sfxAt(ev.crit ? 'crit' : 'hit', this.sx(ev.x, ev.z).x, { volume: ev.crit ? 0.32 : 0.16 }); }
        break;
      case 'kill':
        if (ev.by === 'dawn') break;
        if (this.killSfx <= 0) { this.killSfx = 0.05; this.sfxAt('squish', this.sx(ev.z.x, ev.z.z).x, { volume: 0.32 }); }
        if (ev.z.kind === 'tank') this.view.shake(0.2, 0.15);
        break;
      case 'swing': if (ev.n === 0) this.sfx(ev.evo ? 'swingBig' : 'swing', { volume: ev.evo ? 0.5 : 0.38 }); break;
      case 'thrust': this.sfx('thrust', { volume: 0.4 }); break;
      case 'chain': this.bolts.push({ pts: ev.pts, t: 0.22, seed: Math.random() * 100 }); this.sfx('zap', { volume: 0.3 }); break;
      case 'fire':
        if (ev.w === 'bow') this.sfx('bow', { volume: 0.3 });
        else if (ev.w === 'blaster') this.sfx('blaster', { volume: 0.13 });
        else if (ev.w === 'robot') this.sfx('laser', { volume: 0.16 });
        break;
      case 'torch': this.sfx('toss', { volume: 0.3 }); break;
      case 'ignite': this.sfxAt('ignite', this.sx(ev.x, ev.z).x, { volume: 0.4 }); break;
      case 'ward': if (Math.random() < 0.3) this.sfx('clang', { volume: 0.18 }); break;
      case 'hurt':
        this.sfx('hurt', { volume: 0.5 });
        this.redT = Math.max(this.redT, 0.35);
        if (ev.dmg >= 12) { this.view.shake(0.35, 0.2); shake(this, 0.004, 120); }
        break;
      case 'gem':
        if (this.gemSfx <= 0) {
          this.gemSfx = 0.045;
          this.gemPitch = Math.min(12, this.gemPitch + 1);
          this.sfx('gem', { volume: 0.18, rate: 1 + this.gemPitch * 0.04 });
        }
        break;
      case 'coin': this.sfx('coin', { volume: 0.35 }); break;
      case 'heal': {
        this.sfx('heal', { volume: 0.5 });
        const p = this.sx(sim.player.x, sim.player.z, 1.6);
        this.floatText(p.x, p.y - 20, t('healed', { n: ev.n }), '#7affa0', 26);
        break;
      }
      case 'power': {
        this.sfx(POWER_SFX[ev.kind], { volume: ev.kind === 'nuke' ? 0.9 : 0.6 });
        const pp = this.sx(sim.player.x, sim.player.z, 1.8);
        // the name, and what it does (the stew shows the health it gave)
        if (ev.kind !== 'heal' && ev.kind !== 'nuke') this.floatText(pp.x, pp.y - 96, t('pw_' + ev.kind), hex(POWER_HUE[ev.kind]), 30, t('pws_' + ev.kind));
        if (ev.kind === 'freeze') { flash(this, 0xbff0ff, 260, 0.35); this.sfx('freezeHit', { volume: 0.4 }); }
        if (ev.kind === 'rage') flash(this, 0xff3a4a, 180, 0.25);
        break;
      }
      case 'nuke':
        flash(this, 0xfff6d0, 520, 0.85);
        shake(this, 0.012, 380);
        this.time.delayedCall(250, () => this.sfx('boom', { volume: 0.6, rate: 0.7 }));
        banner(this, 430, t('pw_nuke'), t('pws_nuke', { n: ev.n }), { color: '#ffe07a', size: 48, hold: 1 });
        break;
      case 'buffEnd': this.sfx('slowOut', { volume: 0.25, exact: true }); break;
      case 'drop': this.sfxAt('dropPop', this.sx(ev.x, ev.z).x, { volume: 0.3 }); break;
      case 'bash':
        if (ev.n === 0) this.sfx('bash', { volume: ev.hits ? 0.45 : 0.25 });
        if (ev.n === 0 && ev.hits >= 3) this.sfx('clang', { volume: 0.25 });
        break;
      case 'chest': {
        this.sfx('chest', { volume: 0.7 });
        this.chestQueue.push({ cards: ev.cards, coins: ev.coins });
        if (!this.chest) this.openChest();
        break;
      }
      case 'endless':
        this.sfx('roar', { volume: 0.8, rate: 0.65 });
        flash(this, 0xff3050, 500, 0.45);
        banner(this, 400, t('endlessBanner'), t('endlessSub'), { color: '#ff6a7a', size: 58, hold: 2 });
        this.hud.centerChip.setIcon(INFINITY, undefined, 28);
        this.hud.centerChip.setTextColor('#ff8a9a');
        playMusic(this, 'boss');
        this.time.delayedCall(4000, () => { if (!this.isOver && !this.sim.boss) playMusic(this, 'level3'); });
        break;
      case 'level': {
        this.sfx('levelup', { volume: 0.55 });
        const p = this.sx(sim.player.x, sim.player.z, 1.8);
        this.floatText(p.x, p.y - 30, t('levelUp', { n: ev.n }), '#fff07a', 32);
        break;
      }
      case 'offer': this.onOffer(ev.offer); break;
      case 'card':
        if (ev.card.kind === 'evo') {
          banner(this, 360, t('evolution'), t('e_' + ev.card.id), { color: '#ffd23f', size: 56, hold: 1.4 });
          this.sfx('evolve', { volume: 0.7 });
          flash(this, 0xfff0b0, 220, 0.35);
        }
        break;
      case 'explode':
        this.sfxAt('boom', this.sx(ev.x, ev.z).x, { volume: 0.55 });
        break;
      case 'fuse': this.sfxAt('fuse', this.sx(ev.z.x, ev.z.z).x, { volume: 0.35 }); break;
      case 'spit': this.sfxAt('spit', this.sx(ev.x, ev.z).x, { volume: ev.boss ? 0.5 : 0.25 }); break;
      case 'gooHit': break;
      case 'warn':
        bossWarning(this, t('z_' + ev.boss));
        this.sfx('alarm', { volume: 0.5 });
        if (ev.boss === 'king') this.sfx('roar', { volume: 0.8, rate: 0.8 });
        // a gentle nudge: cards are waiting and a boss is coming
        if (sim.offers.length >= 2 && !this.barOpen && !(this.bot && this.botCards)) {
          this.time.delayedCall(600, () => {
            if (this.isOver || this.barOpen || this.sim.offers.length < 2) return;
            this.offerBtn.flash();
            this.floatText(this.offerBtn.x - 60, this.offerBtn.y - 90, t('cardsWaiting'), '#ffd23f', 24);
          });
        }
        break;
      case 'boss':
        this.bossBar.show(t('z_' + ev.z.kind));
        this.sfx('roar', { volume: 0.7, rate: ev.z.kind === 'king' ? 0.75 : 1 });
        playMusic(this, 'boss');
        this.view.shake(0.4, 0.4);
        break;
      case 'telegraph': this.sfx(ev.kind === 'slam' ? 'charge' : 'charge', { volume: 0.35, rate: ev.kind === 'slam' ? 0.8 : 1.1 }); break;
      case 'slam': this.sfx('slam', { volume: 0.7 }); shake(this, 0.006, 200); break;
      case 'rage': this.sfx('roar', { volume: 0.8, rate: 0.7 }); banner(this, 420, t('rage'), '', { color: '#ff6a8a', size: 40, hold: 1 }); break;
      case 'bossDead':
        this.bulletT = 1.1;
        this.sfx('bossDie', { volume: 0.9 });
        flash(this, 0xffffff, 260, 0.5);
        this.time.delayedCall(700, () => {
          this.sfx('fanfare', { volume: 0.6 });
          banner(this, 420, t('bossDown', { name: t('z_' + ev.z.kind) }), '+' + (ev.z.kind === 'king' ? 3000 : 500), { color: '#ffd23f', hold: 1.4, size: 44 });
          if (!this.sim.boss) { this.bossBar.hide(); if (!this.isOver) playMusic(this, 'level3'); }
        });
        break;
      case 'rush':
        banner(this, 470, t('horde'), '', { color: '#ff8a6a', size: 46, hold: 1 });
        this.sfx('roar', { volume: 0.5, rate: 1.3 });
        break;
      case 'dawn':
        this.sfx('dawn', { volume: 0.8 });
        flash(this, 0xffe0b0, 600, 0.5);
        banner(this, 400, t('dawn'), t('dawnSub'), { color: '#ffd27a', size: 64, hold: 2.2 });
        this.bossBar.hide();
        if (this.bar) { this.bar.destroy(); this.bar = null; }
        break;
      case 'won':
        this.sfx('fanfare', { volume: 0.8 });
        // the autopilot (tests, store art) ends the night; a player chooses
        if (this.bot) { this.endTheNight(); break; }
        this.time.delayedCall(500, () => this.showChoice());
        break;
      case 'revive':
        this.sfx('revive', { volume: 0.8 });
        flash(this, 0xfff0b0, 400, 0.6);
        banner(this, 420, t('secondWind'), '', { color: '#ffd27a', hold: 1.2 });
        break;
      case 'death':
        this.sfx('death', { volume: 0.9 });
        flash(this, 0xff3030, 300, 0.5);
        this.bulletT = 1.4;
        this.bankCoins();
        if (this.bar) { this.bar.destroy(); this.bar = null; }
        this.closeChest();
        this.time.delayedCall(1200, () => this.showSummary(this.sim.won));
        break;
    }
  }

  // ------------------------------------------------------------------ cards

  get barOpen(): boolean { return !!this.bar && !this.bar.done; }

  private onOffer(_o: Offer): void {
    const btn = this.offerBtn;
    if (this.bar) this.bar.setWaiting(Math.max(0, this.sim.offers.length - 1));
    const card = this.add.image(this.scale.width / 2, 560, OFFER).setDisplaySize(30, 30).setScrollFactor(0).setDepth(9350).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, displayWidth: 90, displayHeight: 90, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: card, x: btn.x, y: btn.y, displayWidth: 56, displayHeight: 56, delay: 380, duration: 480, ease: 'Cubic.easeIn',
      onComplete: () => {
        card.destroy();
        btn.bump();
        this.sfx('offer', { volume: 0.4, exact: true });
        this.floatText(btn.x - 40, btn.y - 80, t('offerPlus'), '#ffd23f', 24);
      },
    });
    if (!this.bot) this.time.delayedCall(1300, () => this.hint(this.inputKind === 'touch' ? 'hintOfferTouch' : 'hintOfferKeys', true));
  }

  private toggleBar(): void {
    if (this.barOpen) { this.bar!.close(); return; }
    this.openBar();
  }

  private barIndex(): number { return this.sim.offers.findIndex((o) => o.id === this.barOffer); }

  private openBar(): void {
    const sim = this.sim;
    if (this.isOver || !sim.player.alive || sim.phase !== 'night' || this.barOpen) return;
    const o = sim.offers[0];
    if (!o) { this.sfx('error', { volume: 0.25 }); return; }
    this.bar?.destroy();
    this.barOffer = o.id;
    this.sfx('slowIn', { volume: 0.45, exact: true });
    if (this.graceCd <= 0) { sim.grace(GRACE); this.graceCd = GRACE_CD; }
    this.bar = new CardBar(this, {
      cards: o.cards,
      sub: o.from === 'chest' ? t('barFromChest') : t('barFromLevel', { n: o.n }),
      input: this.inputKind === 'touch' ? 'touch' : 'desk',
      rerolls: () => sim.rerolls,
      roll: () => { const i = this.barIndex(); return i >= 0 && sim.reroll(i) ? sim.offers[i].cards : null; },
      banishes: () => sim.banishes,
      banish: (k) => { const i = this.barIndex(); return i >= 0 ? sim.banish(i, k) : null; },
      onPick: (k, x, y) => this.takeCard(k, x, y),
      onClose: () => { this.bar = null; this.sfx('slowOut', { volume: 0.4, exact: true }); },
      sfx: (key, v) => this.sfx(key, { volume: v ?? 0.5, exact: true }),
    }, sim.offers.length - 1);
  }

  private takeCard(k: number, fx: number, fy: number): void {
    const sim = this.sim;
    const i = this.barIndex();
    this.bar = null;
    this.sfx('slowOut', { volume: 0.4, exact: true });
    const card = sim.offers[i]?.cards[k];
    if (i < 0 || !card || !sim.take(i, k)) return;
    const col = RARITY_COLOR[card.rarity];
    const p = this.sx(sim.player.x, sim.player.z, 1.8);
    this.floatText(p.x, p.y - 40, cardText(card).name, col.text, 28);
    const fly = this.add.image(fx, fy, cardArt(card.kind, card.id)).setDisplaySize(78, 78).setScrollFactor(0).setDepth(9800);
    this.tweens.add({
      targets: fly, x: this.tray.chip.x, y: this.tray.chip.y, displayWidth: 40, displayHeight: 40, duration: 460, ease: 'Cubic.easeIn',
      onComplete: () => { fly.destroy(); this.sfx('star', { volume: 0.35 }); },
    });
    if (card.kind === 'weapon' && card.to >= 5 && !this.seen.has('hintEvolve')) this.time.delayedCall(1200, () => this.hint('hintEvolve', true));
  }

  // ------------------------------------------------------------------ the gold chest

  get chestOpen(): boolean { return !!this.chest && !this.chest.done; }

  private openChest(): void {
    const next = this.chestQueue.shift();
    if (!next || this.isOver) return;
    this.sim.grace(2.5);
    this.chest = new ChestReveal(this, next.cards, next.coins,
      (key, v, rate) => this.sfx(key, { volume: v ?? 0.5, exact: rate === undefined, rate }),
      () => { this.chest = null; this.time.delayedCall(250, () => this.openChest()); });
  }

  private closeChest(): void {
    this.chestQueue = [];
    this.chest?.destroy();
    this.chest = null;
  }

  // ------------------------------------------------------------------ the dawn's choice

  /** After the dawn: keep going into the endless night, or end the night and bank. */
  private showChoice(): void {
    if (this.choice || this.isOver || this.sim.phase !== 'won') return;
    const { width } = this.scale;
    const root = this.add.container(width / 2, 700).setScrollFactor(0).setDepth(9600);
    root.add(this.add.zone(0, 0, 640, 470).setInteractive());
    root.add(glass(this, 640, 470, { alpha: 0.92, r: 30, color: 0x1a1410, rim: 0xffd27a }));
    root.add(txt(this, 0, -180, t('dawnChoice'), { title: true, size: 36, color: '#ffd27a', strokeThickness: 6 }));
    const keep = new Pill(this, 0, -70, 500, 120, 0xa0304a, () => this.choose(0), 34);
    keep.setLabels(t('keepGoing'), t('keepSub'));
    const end = new Pill(this, 0, 80, 500, 120, 0x2f8a5a, () => this.choose(1), 34);
    end.setLabels(t('endNight'), t('endSub'));
    root.add([keep, end]);
    if (this.inputKind === 'keys') root.add(txt(this, 0, 196, t('choiceKeys'), { size: 18, color: '#b8c8b0', strokeThickness: 0, shadow: false }));
    this.choice = { root, pills: [keep, end], focus: 0 };
    this.focusChoice(0);
    root.setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.sfx('offer', { volume: 0.5, exact: true });
  }

  private focusChoice(i: number): void {
    const c = this.choice;
    if (!c) return;
    c.focus = i;
    c.pills.forEach((p, k) => { p.setScale(k === i ? 1.04 : 0.96); p.setAlpha(k === i ? 1 : 0.75); });
  }

  private choiceKey(code: string): boolean {
    const c = this.choice;
    if (!c) return false;
    if (['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(code)) { this.focusChoice(0); this.sfx('move', { volume: 0.3 }); return true; }
    if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'].includes(code)) { this.focusChoice(1); this.sfx('move', { volume: 0.3 }); return true; }
    if (code === 'Enter' || code === 'Space') { this.choose(c.focus); return true; }
    return false;
  }

  /** 0: keep going, 1: end the night. */
  choose(i: number): void {
    const c = this.choice;
    if (!c) return;
    this.choice = null;
    this.sfx('cardPick', { volume: 0.6, exact: true });
    this.tweens.add({ targets: c.root, scale: 0.85, alpha: 0, duration: 220, onComplete: () => c.root.destroy() });
    if (i === 0 && this.sim.keepGoing()) return;
    this.endTheNight();
  }

  private endTheNight(): void {
    this.sim.endNight();
    this.bankCoins();
    this.time.delayedCall(300, () => this.showSummary(true));
  }

  // ------------------------------------------------------------------ HUD

  private redT = 0;

  private updateHud(dt: number): void {
    const sim = this.sim, p = sim.player;
    if (this.score !== sim.score) this.setScore(sim.score);
    const clock = sim.phase === 'night' || sim.endless ? this.clock() : '0:00';
    if (clock !== this.shownTime) {
      this.shownTime = clock;
      this.hud.setCenter(clock);
      const left = sim.tune.night - sim.time;
      if (left <= 60 && sim.phase === 'night' && !sim.endless) {
        this.hud.centerChip.setTextColor('#ff8a6a');
        if (!this.lastMinute) { this.lastMinute = true; banner(this, 470, t('lastMinute'), '', { color: '#ff8a6a', size: 44, hold: 1 }); this.sfx('alarm', { volume: 0.35 }); }
        this.tweens.add({ targets: this.hud.centerChip, scale: 1.08, duration: 90, yoyo: true });
      }
      if (sim.phase !== 'night' && !sim.endless) { this.hud.centerChip.setIcon(SUN, undefined, 28); this.hud.centerChip.setTextColor('#ffd27a'); }
    }
    this.xp.update(sim.level, Math.min(1, sim.xp / xpToNext(sim.level)), dt, this.elapsed);
    if (sim.run.kills !== this.shownKills) {
      this.shownKills = sim.run.kills;
      this.killChip.setText(String(sim.run.kills));
    }
    if (sim.coins !== this.shownCoins) {
      if (this.shownCoins >= 0) this.tweens.add({ targets: this.coinChip, scale: 1.12, duration: 70, yoyo: true });
      this.shownCoins = sim.coins;
      this.coinChip.setText(String(sim.coins));
    }
    this.killChip.setAnchor(this.xp.chip.right + HUD_GAP, HUD_ROW2_Y);
    this.coinChip.setAnchor(this.killChip.right + HUD_GAP, HUD_ROW2_Y);
    this.tray.sync(sim.weapons, sim.passives);
    this.buffChips.update(sim.buffs, this.elapsed);
    this.offerBtn.set(p.alive && sim.phase === 'night' ? sim.offers.length : 0, this.barOpen);
    this.offerBtn.update(dt, this.elapsed);
    this.hp.update(p.hp, p.maxHp, dt, this.elapsed);
    const b = sim.boss;
    if (b && !b.dead) this.bossBar.update(Math.max(0, b.hp / b.maxHp), b.rage, dt, this.elapsed);
    const low = p.alive && p.hp < p.maxHp * 0.3;
    if (low && !this.lowWarned) {
      this.lowWarned = true;
      const s = this.sx(p.x, p.z, 1.8);
      this.floatText(s.x, s.y - 40, t('lowHp'), '#ff7a6a', 30);
    }
    if (!low && p.hp > p.maxHp * 0.5) this.lowWarned = false;
    this.drawVignette(low, dt);
  }

  private drawVignette(low: boolean, dt: number): void {
    this.redT = Math.max(0, this.redT - dt * 1.6);
    // the heartbeat: two beats a second, the edges throb with it
    const beat = low ? Math.pow(Math.max(0, Math.sin(this.elapsed * Math.PI * 2.2)), 6) : 0;
    const a = Math.max(this.redT, low ? 0.32 + beat * 0.38 : 0);
    const bar = ((1 - this.slow) / (1 - BAR_SLOW)) * 0.3;
    const g = this.vignette.clear();
    if (a <= 0.01 && bar <= 0.01) return;
    const { width: w, height: h } = this.scale;
    const col = bar > a ? 0x5ab8ff : 0xff2020;
    const k = Math.max(a, bar);
    for (let i = 0; i < 12; i++) {
      const d = i * 15;
      g.lineStyle(17, col, k * Math.pow(1 - i / 12, 1.6) * 0.75).strokeRect(d, d, w - d * 2, h - d * 2);
    }
  }

  private drawOverlay(dt: number): void {
    const g = this.overlay.clear();
    // chain lightning
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bl = this.bolts[i];
      bl.t -= dt;
      if (bl.t <= 0) { this.bolts.splice(i, 1); continue; }
      const pts = bl.pts.map((p) => this.sx(p.x, p.z, 0.8));
      const p0 = this.sx(this.sim.player.x, this.sim.player.z, 0.8);
      void p0;
      for (const [w, c, al] of [[10, 0x5ab8ff, 0.35], [3, 0xffffff, 1]] as [number, number, number][]) {
        g.lineStyle(w, c, al * Math.min(1, bl.t * 6));
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], c2 = pts[k];
          for (let s = 1; s <= 4; s++) {
            const f = s / 4;
            const j = s < 4 ? Math.sin(bl.seed + k * 7 + s * 13 + this.elapsed * 40) * 12 : 0;
            g.lineTo(a.x + (c2.x - a.x) * f + j, a.y + (c2.y - a.y) * f - j * 0.5);
          }
        }
        g.strokePath();
      }
    }
    // the open card bar may cover the hero: an outline shows through
    if (this.barOpen && this.sim.player.alive) {
      const p = this.sx(this.sim.player.x, this.sim.player.z, 0.6);
      const top = BAR_BOTTOM - BAR_H, bottom = BAR_BOTTOM + 30;
      if (p.y > top && p.y < bottom) {
        this.overlay.setDepth(DRAFT_DEPTH + 2);
        g.lineStyle(4, 0x7ad8ff, 0.95).strokeCircle(p.x, p.y, 26);
        for (const zb of this.sim.zombies) {
          const s = this.sx(zb.x, zb.z, 0.6);
          if (s.y < top || s.y > bottom || Math.abs(s.x - p.x) > 220) continue;
          g.lineStyle(3, 0xff3b5c, 0.85).strokeCircle(s.x, s.y, 14);
        }
      }
    } else this.overlay.setDepth(50);
  }

  // ------------------------------------------------------------------ sounds

  private updateSounds(dt: number): void {
    const sim = this.sim, p = sim.player;
    this.hitSfx -= dt; this.killSfx -= dt; this.gemSfx -= dt;
    if (this.gemSfx < -0.6) this.gemPitch = 0;
    if (!p.alive || sim.phase !== 'night') return;
    // footsteps on the grass
    if (p.moving && Math.hypot(p.vx, p.vz) > 1) {
      this.stepT -= dt * this.slow;
      if (this.stepT <= 0) { this.stepT = 0.34; this.sfx('step', { volume: 0.12 }); }
    }
    // groans from the dark, more and louder as they close in
    this.groanT -= dt;
    if (this.groanT <= 0) {
      let near = 0;
      let nx = 0;
      for (const zb of sim.zombies) {
        const d = Math.hypot(zb.x - p.x, zb.z - p.z);
        if (d < 10) { near++; nx = zb.x; }
      }
      this.groanT = near > 20 ? 0.9 + Math.random() : near > 5 ? 1.6 + Math.random() * 1.5 : 3 + Math.random() * 2;
      if (near > 0) {
        const k = ['groan1', 'groan2', 'groan3'][Math.floor(Math.random() * 3)];
        this.sfxAt(k, this.sx(nx, p.z).x, { volume: Math.min(0.42, 0.16 + near * 0.012), rate: 0.85 + Math.random() * 0.35 });
      }
    }
    // the heartbeat at low health
    if (p.hp < p.maxHp * 0.3) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beatT = 0.9; this.sfx('heartbeat', { volume: 0.55, exact: true }); }
    } else this.beatT = 0;
  }

  // ------------------------------------------------------------------ numbers and text

  private dmgNumber(x: number, z: number, n: number, crit: boolean): void {
    if (this.dmg.length > 18) return;
    const s = this.sx(x, z, 1.3);
    if (s.x < -20 || s.x > this.scale.width + 20 || s.y < 0 || s.y > this.scale.height) return;
    const tx = this.dmgPool.pop() ?? txt(this, 0, 0, '', { title: true, size: 22, strokeThickness: 5 }).setScrollFactor(0).setDepth(6000);
    tx.setText(String(Math.round(n))).setColor(crit ? '#ffe04a' : '#ffffff').setFontSize(crit ? 30 : 21).setVisible(true).setAlpha(1).setScale(crit ? 1.3 : 1);
    const ox = (Math.random() - 0.5) * 24;
    tx.setPosition(s.x + ox, s.y);
    this.dmg.push({ t: tx, life: crit ? 0.75 : 0.55, x: s.x + ox, y: s.y });
  }

  private updateDmg(dt: number): void {
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.life -= dt;
      if (d.life <= 0) { d.t.setVisible(false); this.dmgPool.push(d.t); this.dmg.splice(i, 1); continue; }
      d.y -= dt * 70;
      d.t.setPosition(d.x, d.y).setAlpha(Math.min(1, d.life * 4));
      if (d.t.scale > 1) d.t.setScale(Math.max(1, d.t.scale - dt * 2));
    }
  }

  private floatText(x: number, y: number, s: string, color: string, size = 26, sub = ''): void {
    // kept on the screen (a hero near the edge still shows the whole text)
    const c = this.add.container(0, y).setScrollFactor(0).setDepth(9300).setScale(0.5);
    const tx = txt(this, 0, 0, s, { title: true, size, color, strokeThickness: 6 });
    c.add(tx);
    let w = tx.width;
    if (sub) { const st = txt(this, 0, size * 0.5 + 16, sub, { size: 20, color: '#ffffff', strokeThickness: 5 }); c.add(st); w = Math.max(w, st.width); }
    c.x = Math.max(w / 2 + 12, Math.min(this.scale.width - w / 2 - 12, x));
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: y - 60, alpha: 0, delay: sub ? 1100 : 650, duration: 500, onComplete: () => c.destroy() });
  }

  private hintText: Phaser.GameObjects.Container | null = null;

  /** A first-run hint (each shown once per browser; `force` shows it on the first runs). */
  private hint(key: string, firstRuns = false): void {
    if (this.isOver || this.bot || this.quiet) return;
    if (this.seen.has(key) && !(firstRuns && this.meta.runs < 2 && !this.seen.has(key + ':2'))) return;
    if (this.seen.has(key)) this.seen.add(key + ':2'); else this.seen.add(key);
    storage.set(SEEN_KEY, [...this.seen]);
    this.hintText?.destroy();
    const { width } = this.scale;
    const c = this.add.container(width / 2, 700).setScrollFactor(0).setDepth(9400).setAlpha(0);
    const tx = txt(this, 0, 0, t(key), { size: 26, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 600 });
    const bg = this.add.graphics().fillStyle(0x0b120d, 0.72).fillRoundedRect(-tx.width / 2 - 24, -tx.height / 2 - 16, tx.width + 48, tx.height + 32, 22)
      .lineStyle(2, 0xffd27a, 0.6).strokeRoundedRect(-tx.width / 2 - 24, -tx.height / 2 - 16, tx.width + 48, tx.height + 32, 22);
    c.add([bg, tx]);
    this.hintText = c;
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
    this.tweens.add({ targets: c, alpha: 0, delay: 4200, duration: 500, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private bankCoins(): number {
    if (this.banked) return 0;
    this.banked = true;
    const sim = this.sim;
    const base = sim.coins + runBonus(sim.run.kills, sim.run.time, sim.won, sim.run.minis + sim.run.bosses, sim.run.endless);
    const coins = Math.round(base * sim.coinMul);
    // fresh from storage: the camp may have changed it in another tab
    const m = loadMeta();
    this.newHeroes = bankRun(m, coins, sim.won, { level: sim.level, time: sim.run.time, kills: sim.run.kills });
    saveMeta(m);
    this.meta = m;
    this.coinsEarned = coins;
    return coins;
  }

  /** The night's summary: how long, how far, who did it, what was earned. */
  private showSummary(won: boolean): void {
    if (this.summaryBox) return;
    const sim = this.sim;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 560).setScrollFactor(0).setDepth(9500);
    this.summaryBox = c;
    const extra = (sim.endless ? 34 : 0) + (this.newHeroes.length ? 46 : 0);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.3).fillRoundedRect(-310, -180 + 8, 620, 360 + extra, 28);
    bg.fillStyle(0x0d140f, 0.93).fillRoundedRect(-310, -180, 620, 360 + extra, 28);
    bg.lineStyle(2, won ? 0xffd27a : 0xff7a6a, 0.5).strokeRoundedRect(-310, -180, 620, 360 + extra, 28);
    c.add(bg);
    const title = sim.endless ? t('endlessOver') : won ? t('survived') : t('youFell');
    const tt = txt(this, 0, -128, title, { title: true, size: 46, color: won ? '#ffd27a' : '#ff7a6a', strokeThickness: 8 });
    if (tt.width > 580) tt.setScale(580 / tt.width);
    c.add(tt);
    const secs = Math.floor(sim.run.time);
    c.add(txt(this, 0, -62, t('runStats', { t: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, l: sim.level, k: sim.run.kills }), { size: 24, color: '#e6efdf', strokeThickness: 0 }));
    const who = sim.run.killer as ZombieKind | 'goo' | 'blast' | null;
    c.add(txt(this, 0, -24, won ? t('dawnWin') : who ? t('fallenTo', { who: t('z_' + who) }) : '', { size: 22, color: won ? '#ffe68a' : '#ffb0a0', strokeThickness: 0 }));
    // the weapons carried
    const row = this.add.container(0, 30);
    sim.weapons.forEach((w, i) => row.add(this.add.image((i - (sim.weapons.length - 1) / 2) * 56, 0, cardArt(w.evo ? 'evo' : 'weapon', w.id)).setDisplaySize(50, 50)));
    c.add(row);
    const coin = this.add.image(-110, 96, COIN).setDisplaySize(48, 48);
    const earned = txt(this, 10, 96, t('coinsEarned', { n: 0 }), { title: true, size: 34, color: '#ffe68a', strokeThickness: 6 });
    c.add([coin, earned]);
    c.add(txt(this, 0, 148, t('purse', { n: this.meta.coins }), { size: 20, color: '#cfd8c8', strokeThickness: 0 }));
    let y = 148;
    if (sim.endless) {
      y += 34;
      const e = Math.floor(sim.run.endless);
      c.add(txt(this, 0, y, t('endlessStat', { t: `${Math.floor(e / 60)}:${String(e % 60).padStart(2, '0')}` }), { size: 22, color: '#ff9aab', strokeThickness: 0 }));
    }
    if (this.newHeroes.length) {
      y += 46;
      const nh = txt(this, 0, y, t('newHero', { h: this.newHeroes.map((h) => t('h_' + h)).join(', ') }), { title: true, size: 26, color: '#7affc0', strokeThickness: 5 });
      c.add(nh);
      this.tweens.add({ targets: nh, scale: { from: 1.25, to: 1 }, duration: 500, delay: 900, ease: 'Back.easeOut', onStart: () => this.sfx('evolve', { volume: 0.6 }) });
    }
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.addCounter({ from: 0, to: this.coinsEarned, duration: 900, delay: 350, onUpdate: (tw) => earned.setText(t('coinsEarned', { n: Math.round(tw.getValue() ?? 0) })), onComplete: () => { if (this.coinsEarned > 0) this.sfx('coins', { volume: 0.6 }); } });
    this.tweens.add({ targets: coin, angle: 360, duration: 1400, delay: 350 });
  }

  private finish(): void {
    this.ended = true;
    const won = this.sim.won;
    const box = this.summaryBox;
    const go = () => this.endGame({ win: won, title: this.sim.endless ? t('endlessOver') : won ? t('survived') : t('runOver'), delay: 0 });
    if (box) {
      this.time.delayedCall(1600, () => this.tweens.add({ targets: box, alpha: 0, scale: 0.9, duration: 260, onComplete: go }));
    } else go();
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    if (!this.isOver) this.bankCoins();
    if (this.bar) { this.bar.destroy(); this.bar = null; }
    this.closeChest();
    if (this.choice) { this.choice.root.destroy(); this.choice = null; }
    super.endGame(o);
  }

  // ------------------------------------------------------------------ test hooks

  /** The autopilot plays (store art, screenshots); with `cards` false it leaves the offers alone. */
  testAuto(on: boolean, cards = true): void { this.bot = on ? new Bot(this.sim, SKILL.good) : null; this.botCards = cards; }
  testTime(t: number): void { this.sim.setTime(t); }
  testHorde(n: number, kinds?: ZombieKind[]): void { this.sim.horde(n, kinds); }
  testBoss(kind: BossKind): void { this.sim.bossNow(kind); }
  testHp(k: number): void { this.sim.player.hp = this.sim.player.maxHp * k; }
  /** Gives weapons [id, level, evolved] and trinkets [id, level]. */
  testKit(weapons: [WeaponId, number, boolean?][], passives: [PassiveId, number][] = []): void {
    const sim = this.sim;
    sim.weapons = weapons.map(([id, lv, evo]) => ({ id, lv, evo: !!evo }));
    sim.passives = passives.map(([id, lv]) => ({ id, lv }));
    sim.recalc();
  }
  /** Opens the card bar with these cards (or the next real offer). */
  testDraft(cards?: Card[]): void {
    if (cards) this.sim.forceOffer(cards);
    else if (!this.sim.offers.length) this.sim.forceOffer(this.sim.offers[0]?.cards ?? []);
    if (this.barOpen) { this.bar!.destroy(); this.bar = null; }
    this.openBar();
  }
  testPick(i: number): void { this.bar?.testPick(i); }
  get testDraftReady(): boolean { return !!this.bar?.ready; }
  get testDrawn(): number { return this.view ? (this.view as unknown as { horded: number }).horded : 0; }
  /** Test hook: no hints (screenshot sequences). */
  quiet = false;
  testSnap(): void { this.view.snap(this.sim); }
  testDawn(): void { this.lastMinute = true; this.sim.setTime(this.sim.tune.night - 0.3); }
  /** Test hook: clears the banners on screen (slow software rendering keeps them up for long). */
  testClean(): void { for (const o of [...this.children.list]) if ((o as Phaser.GameObjects.Container).depth === 9400) o.destroy(); this.hintText?.destroy(); }
  testHint(key: string): void { this.seen.delete(key); this.seen.delete(key + ':2'); this.meta.runs = 0; this.hint(key, true); }
  /** Drops a power-up (or the gold chest) next to the hero. */
  testPower(kind: PowerId | 'chest', dx = 1.2, dz = 0): void { this.sim.dropAt(kind, this.sim.player.x + dx, this.sim.player.z + dz); }
  /** Sets a timed power-up running. */
  testBuff(id: BuffId, s: number): void { this.sim.buffs[id] = s; }
  get testChestReady(): boolean { return !!this.chest?.ready; }
  get testChoice(): boolean { return !!this.choice; }
}

export { isBoss };
