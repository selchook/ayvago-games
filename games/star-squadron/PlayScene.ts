// Star Squadron: the Play scene. Runs the simulation (sim.ts) at 60 Hz, draws it in 3D (view.ts)
// under a Phaser HUD, reads touch (relative drag), mouse (hold to steer) and keys, banks the card
// offers the run earns and opens them in the card bar when the player wants (the fight runs on in
// slow motion), plays the sounds and banners, and banks the run's Stardust at the end.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, playMusic, hudChip, HudChip, flash, popup,
  HUD_MARGIN, HUD_ROW2_Y,
} from '@core';
import { THREE, type World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent, type CardId, type Offer } from './sim';
import { TUNING, FIELD, playerHalfWidth, type Mode, type PowerId, POWER_IDS } from './defs';
import { CARD, RARITY_COLOR } from './cards';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { talentFx, stardustFor } from './talents';
import { loadMeta, bankRun, type Meta } from './meta';
import { makeArt, COIN, DUST, OFFER, cardArt } from './art';
import { PowerButton, HullBar, BossBar, banner, bossWarning, UI_DEPTH } from './ui';
import { CardBar, CardTray, CardList, OfferButton, DRAFT_DEPTH, BAR_BOTTOM, BAR_H } from './cardsui';

const BAR_Y = 1212;
/** Time scale while the card bar is open, and how fast the fight eases into it and back. */
const BAR_SLOW = 0.4;
const SLOW_EASE = 7;
/** Seconds without damage when the bar opens (at most once per GRACE_CD seconds of play). */
const GRACE = 0.5;
const GRACE_CD = 4;
const seenHints = new Set<string>();

interface Bolt { pts: { x: number; z: number }[]; t: number; seed: number }

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  mode: Mode = 'normal';
  private controls!: Controls;
  private drag: { id: number; sx: number; sz: number; px: number; pz: number } | null = null;
  private mouseHold = false;
  private inputKind: 'touch' | 'mouse' | 'keys' = 'touch';
  private want: Record<PowerId, boolean> = { bomb: false, shield: false, overdrive: false };
  private hull!: HullBar;
  private powerBtns: PowerButton[] = [];
  private bossBar!: BossBar;
  private creditChip!: HudChip;
  private tray!: CardTray;
  private overlay!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  /** Over the open card bar: the ship and the enemy shots behind it. */
  private ghost!: Phaser.GameObjects.Graphics;
  private offerBtn!: OfferButton;
  /** The open card bar and the offer it shows. */
  private bar: CardBar | null = null;
  private barOffer = -1;
  /** The fight's time scale (eases to BAR_SLOW while the bar is open). */
  slow = 1;
  private graceCd = 0;
  private cardList: CardList | null = null;
  private bolts: Bolt[] = [];
  private bulletT = 0;
  private deathT = -1;
  private banked = false;
  private summary = false;
  private lastCredits = -1;
  private lowWarned = false;
  private critT = 0;
  private hitSfxT = 0;
  private bot: Bot | null = null;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ray = new THREE.Raycaster();
  private hit3 = new THREE.Vector3();
  private ndc = new THREE.Vector2();
  /** Frame times of the first Play frames (ms), for the shader warm-up check. */
  firstFrames: number[] = [];
  private frameStart = 0;

  createGame(): void {
    this.mode = isEasy() ? 'easy' : 'normal';
    this.meta = loadMeta();
    this.sim = new Sim(this.mode, Math.floor(Math.random() * 1e9), talentFx(this.meta.talents));
    this.drag = null;
    this.mouseHold = false;
    this.inputKind = this.sys.game.device.input.touch ? 'touch' : 'mouse';
    this.want = { bomb: false, shield: false, overdrive: false };
    this.powerBtns = [];
    this.bar = null;
    this.barOffer = -1;
    this.slow = 1;
    this.graceCd = 0;
    this.botCards = true;
    this.cardList = null;
    this.bolts = [];
    this.bulletT = 0;
    this.deathT = -1;
    this.banked = false;
    this.summary = false;
    this.summaryBox = null;
    this.summaryOut = false;
    this.dustEarned = 0;
    this.lastCredits = -1;
    this.lowWarned = false;
    this.critT = 0;
    this.hitSfxT = 0;
    this.bot = null;
    this.firstFrames = [];
    this.testSpeed = 1;
    makeArt(this);

    this.view = new View(this);
    this.world = this.view.world;
    // frame cost (test hook): CPU time of the simulation + scene sync and of the 3D render call
    this.perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0 };
    const w = this.view.world;
    const render = w.render.bind(w);
    w.render = () => {
      const t0 = performance.now();
      render();
      const d = performance.now() - t0;
      this.perf.render += d;
      this.perf.maxRender = Math.max(this.perf.maxRender, d);
    };
    this.controls = new Controls(this, {});
    const { width } = this.scale;

    // HUD: score (core), sector / wave in the centre chip, credits and the card tray on row 2,
    // the hull, the card-offer button and the powers along the bottom
    this.hud.setCenter(t('hudWave', { s: 1, n: 1, m: this.sim.wavesInSector }));
    this.creditChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: COIN, iconSize: 28, text: '0', color: '#ffd23f', minWidth: 96 });
    this.tray = new CardTray(this, this.creditChip.right, HUD_ROW2_Y, () => this.openCardList());
    this.bossBar = new BossBar(this, width / 2 + 50, HUD_ROW2_Y);
    this.hull = new HullBar(this, HUD_MARGIN, BAR_Y);
    const keys = !this.sys.game.device.input.touch;
    const R = PowerButton.R;
    const ids: PowerId[] = ['overdrive', 'shield', 'bomb'];
    ids.forEach((id, i) => {
      const x = width - HUD_MARGIN - R - (2 - i) * (R * 2 + 14);
      this.powerBtns.push(new PowerButton(this, x, BAR_Y - 14, id, keys, () => this.firePower(id)));
    });
    // the offer button sits in the gap between the hull and the powers
    const ox = Math.round((this.hull.chip.right + this.powerBtns[0].chip.x - R) / 2);
    this.offerBtn = new OfferButton(this, ox, BAR_Y - 14, keys, () => this.toggleBar());
    this.overlay = this.add.graphics().setDepth(50).setScrollFactor(0);
    this.vignette = this.add.graphics().setDepth(60).setScrollFactor(0);
    this.ghost = this.add.graphics().setDepth(DRAFT_DEPTH + 2).setScrollFactor(0);

    this.setupInput();
    // a run left through the pause menu still banks what it earned
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (!this.banked && this.sim.run.wavesCleared > 0) this.bankStardust(); });
    playMusic(this, 'level2');
    banner(this, 380, t('sectorN', { n: 1 }), t('sec_' + this.sim.sectorDef.id), { color: '#9fe8ff', hold: 1.4 });
    this.time.delayedCall(900, () => this.hint(this.inputKind === 'touch' ? 'hintTouch' : 'hintMouse'));
  }

  get tune() { return TUNING[this.mode]; }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.cardList || over.length) return;
      if (p.wasTouch) {
        this.inputKind = 'touch';
        if (this.drag) return;
        const g = this.ground(p.x, p.y);
        if (!g) return;
        this.drag = { id: p.id, sx: g.x, sz: g.z, px: this.sim.player.x, pz: this.sim.player.z };
      } else if (p.leftButtonDown()) {
        this.inputKind = 'mouse';
        this.mouseHold = true;
      }
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.drag && this.drag.id === p.id) this.drag = null;
      if (!p.wasTouch) this.mouseHold = false;
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.cardList) { if (e.code === 'Escape' || e.code === 'KeyC' || e.code === 'Enter') this.cardList.close(); return; }
      if (this.barOpen && this.bar!.key(e.code)) return;
      if (e.code === 'KeyE') { this.toggleBar(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        if (this.inputKind !== 'keys') { this.inputKind = 'keys'; this.hint('hintKeys'); }
      }
      if (e.code === 'KeyJ' || e.code === 'Space') this.firePower('bomb');
      else if (e.code === 'KeyK') this.firePower('shield');
      else if (e.code === 'KeyL') this.firePower('overdrive');
      else if (e.code === 'KeyC' && this.sim.cardOrder.length) this.openCardList();
    });
  }

  private firePower(id: PowerId): void {
    if (this.isOver) return;
    if (!this.sim.canUse(id)) {
      if (this.sim.player.alive && this.sim.powers[id].cd > 0) this.sfx('error', { volume: 0.25 });
      return;
    }
    this.want[id] = true;
  }

  /** Where a screen point meets the play plane. */
  private ground(px: number, py: number): { x: number; z: number } | null {
    const { width, height } = this.scale;
    this.ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.view.world.camera);
    const p = this.ray.ray.intersectPlane(this.plane, this.hit3);
    return p ? { x: p.x, z: p.z } : null;
  }

  private readInput(dt: number): Input {
    if (this.bot) {
      const b = this.bot.input(dt);
      for (const id of POWER_IDS) if (this.want[id]) b[id] = true;
      this.want = { bomb: false, shield: false, overdrive: false };
      return b;
    }
    const inp: Input = { ...NO_INPUT, mx: this.controls.axisX, mz: this.controls.axisY, bomb: this.want.bomb, shield: this.want.shield, overdrive: this.want.overdrive };
    this.want = { bomb: false, shield: false, overdrive: false };
    const keys = inp.mx !== 0 || inp.mz !== 0;
    if (!keys && this.drag) {
      const ptr = this.input.manager.pointers.find((q) => q.id === this.drag!.id);
      const g = ptr ? this.ground(ptr.x, ptr.y) : null;
      if (g) {
        // the ship moves as the finger moves (never under it); past the edges the anchor slides,
        // so the ship answers at once when the finger comes back
        let tx = this.drag.px + (g.x - this.drag.sx), tz = this.drag.pz + (g.z - this.drag.sz);
        const cz = Phaser.Math.Clamp(tz, FIELD.pTop, FIELD.pBottom);
        this.drag.sz += tz - cz; tz = cz;
        const hw = playerHalfWidth(tz);
        const cx = Phaser.Math.Clamp(tx, -hw, hw);
        this.drag.sx += tx - cx; tx = cx;
        inp.tx = tx; inp.tz = tz;
      }
    } else if (!keys && this.mouseHold) {
      const p = this.input.activePointer;
      const g = this.ground(p.x, p.y);
      if (g) { inp.tx = g.x; inp.tz = Phaser.Math.Clamp(g.z + 0.6, FIELD.pTop, FIELD.pBottom); }
    }
    if (keys && this.drag) this.drag = null;
    return inp;
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    this.updateBody(delta);
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
  }

  /** Test hook: CPU cost per frame. */
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0 };

  private updateBody(delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    const dt = delta / 1000;
    const sim = this.sim;
    const paused = !!this.cardList;
    // the card bar slows the fight down (eased in and out), it never stops it
    const target = this.barOpen ? BAR_SLOW : 1;
    this.slow += (target - this.slow) * Math.min(1, dt * SLOW_EASE);
    if (Math.abs(target - this.slow) < 0.004) this.slow = target;
    if (!paused) {
      let sdt = dt * this.testSpeed * this.slow;
      if (this.bulletT > 0) { this.bulletT -= dt; sdt = dt * 0.25 * this.slow; }
      this.graceCd -= sdt;
      // the autopilot takes every offer at once (as balance.ts does), unless a test opened the bar
      if (this.bot && this.botCards && !this.bar && sim.offers.length) sim.takeAll((c) => this.bot!.choose(c));
      sim.step(sdt, this.readInput(dt));
      for (const ev of sim.events) this.onEvent(ev);
      sim.events.length = 0;
    }
    this.bar?.update(dt);
    // the backdrop: a warp between sectors, a quick fly-in at their start
    const vdt = dt * this.slow;
    const speed = sim.phase === 'warp' ? (sim.phaseT < 2.6 ? 70 : 5) : sim.phase === 'intro' ? 10 : 5;
    this.view.speed += (speed - this.view.speed) * Math.min(1, vdt * (speed > this.view.speed ? 1.6 : 3));
    if (this.view.speed > 16) this.warpLines(vdt);
    this.view.sync(sim, vdt);
    this.updateHud(dt);
    this.drawOverlay(dt);
    this.drawGhost();
    if (this.deathT >= 0) {
      this.deathT += dt;
      if (this.deathT > 1.6 && !this.summary) this.showSummary();
      if (this.deathT > 4.8 && this.summaryBox && !this.summaryOut) {
        this.summaryOut = true;
        this.tweens.add({ targets: this.summaryBox, alpha: 0, scale: 0.9, duration: 260 });
      }
      if (this.deathT > 5.1) this.endGame({ title: t('runOver'), delay: 0 });
    }
  }

  private warpLines(dt: number): void {
    const n = Math.round(dt * this.view.speed * 3);
    const P = this.view.particles;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 16, z = -24 + Math.random() * 10, y = -1 - Math.random() * 6;
      P.emit(x, y, z, 0, 0, this.view.speed * 1.2, 0.5, 0.18, 0.12, Math.random() < 0.5 ? 0x9fe8ff : 0xffffff, 0, 0.06);
    }
  }

  // ------------------------------------------------------------------ events

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    const sx = (x: number, z: number) => this.view.toScreen(x, 0.3, z);
    switch (ev.type) {
      case 'fire': this.sfx('shot', { volume: ev.heavy ? 0.16 : 0.11 }); break;
      case 'missile': this.sfx('missile', { volume: 0.22 }); break;
      case 'eshot': this.sfxAt(ev.big ? 'bigShot' : 'eshot', sx(ev.x, ev.z).x, { volume: ev.big ? 0.22 : 0.16 }); break;
      case 'hit':
        this.hitSfxT -= 1;
        if (ev.armour) { if (this.hitSfxT < -6) { this.hitSfxT = 0; this.sfx('clink', { volume: 0.18 }); } break; }
        if (ev.crit) {
          if (this.critT <= 0) {
            this.critT = 0.12;
            const p = sx(ev.x, ev.z);
            this.dmgNumber(p.x, p.y - 30, Math.round(ev.dmg));
            this.sfx('crit', { volume: 0.25 });
          }
        } else if (this.hitSfxT < -3) { this.hitSfxT = 0; this.sfx('hit', { volume: 0.15 }); }
        break;
      case 'kill': {
        const p = sx(ev.e.x, ev.e.z);
        const big = ev.e.kind === 'gunship' || ev.e.kind === 'bomber' || ev.e.kind === 'carrier';
        this.sfxAt(big ? 'boomBig' : 'boom', p.x, { volume: big ? 0.7 : 0.4 });
        if (big && ev.score) popup(this, p.x, p.y - 20, '+' + ev.score, '#ffd23f', 24);
        break;
      }
      case 'partKill': {
        const p = sx(ev.part.x, ev.part.z);
        this.sfxAt('partBoom', p.x, { volume: 0.8 });
        popup(this, p.x, p.y - 20, '+' + Math.round(800 * sim.scoreMul), '#ffd23f', 26);
        if (!ev.boss.parts.some((q) => q.alive)) {
          banner(this, 470, t('armourDown'), '', { color: '#9fe8ff', hold: 1, size: 44 });
          this.sfx('fanfare', { volume: 0.4 });
        }
        break;
      }
      case 'chain':
        this.bolts.push({ pts: ev.pts, t: 0.22, seed: Math.random() * 100 });
        this.sfx('chain', { volume: 0.22 });
        break;
      case 'hurt':
        if (ev.shield) this.sfx('deflect', { volume: 0.45 });
        else {
          this.sfx('hurt', { volume: 0.6 });
          this.redFlash(0.45);
        }
        break;
      case 'deflect': this.sfx('deflect', { volume: 0.2 }); break;
      case 'pickup': {
        const p = sx(ev.x, ev.z);
        if (ev.kind === 'credit') this.sfx('coin', { volume: 0.22 });
        else {
          this.sfx('pickup', { volume: 0.6 });
          const label = ev.kind === 'repair' ? t('pickup_repair', { n: Math.round(ev.value) }) : ev.kind === 'cell' ? t('pickup_cell', { n: Math.round(ev.value) }) : t('pickup_' + ev.kind);
          this.floatText(p.x, p.y - 40, label, ev.kind === 'repair' ? '#7dffa0' : ev.kind === 'cell' ? '#8fd8ff' : ev.kind === 'charge' ? '#d9a8ff' : '#ffc27a');
        }
        break;
      }
      case 'power':
        if (ev.id === 'bomb') { this.sfx('bomb', { volume: 0.9 }); this.sfx('nova', { volume: 0.6 }); flash(this, 0xfff2c0, 200, 0.4); }
        else if (ev.id === 'shield') this.sfx('shieldUp', { volume: 0.7 });
        else { this.sfx('overdrive', { volume: 0.6 }); flash(this, 0xffd23f, 120, 0.18); }
        if (!seenHints.has('hintPowers')) seenHints.add('hintPowers');
        break;
      case 'ready': this.sfx('ready', { volume: 0.18 }); break;
      case 'mine': this.sfxAt('mine', sx(ev.x, ev.z).x, { volume: 0.3 }); break;
      case 'wave': {
        const last = ev.n + 1 === sim.wavesInSector;
        this.hud.setCenter(t('hudWave', { s: sim.sector + 1, n: ev.n + 1, m: sim.wavesInSector }));
        this.tweens.add({ targets: this.hud.centerChip, scale: 1.2, duration: 120, yoyo: true });
        banner(this, 400, last ? t('finalWave') : t('waveN', { n: ev.n + 1, m: sim.wavesInSector }), '', { size: 46, hold: 0.9 });
        this.sfx('waveStart', { volume: 0.45 });
        if (sim.sector === 0 && ev.n === 1) this.time.delayedCall(2500, () => this.hint('hintPowers'));
        break;
      }
      case 'clear':
        banner(this, 420, ev.flawless ? t('flawless') : t('waveClear'), '+' + ev.bonus, { color: ev.flawless ? '#ffd23f' : '#7dffa0', size: 46, hold: 0.8 });
        this.sfx('waveClear', { volume: 0.55 });
        break;
      case 'offer': this.onOffer(ev.offer); break;
      case 'card':
        if (CARD[ev.id].rarity === 'synergy') banner(this, 300, t('newSynergy'), t('c_' + ev.id), { color: '#ffd23f', size: 42, hold: 1.4 });
        break;
      case 'warning':
        bossWarning(this, t('boss_' + sim.sectorDef.boss));
        this.sfx('alarm', { volume: 0.55 });
        this.hud.setCenter(t('hudBoss', { s: sim.sector + 1 }));
        // a gentle nudge: cards are waiting and the boss is coming
        if (sim.offers.length >= 2 && !this.barOpen && !(this.bot && this.botCards)) {
          this.time.delayedCall(400, () => {
            if (this.isOver || this.barOpen || this.sim.offers.length < 2) return;
            this.offerBtn.flash();
            this.floatText(this.offerBtn.x, this.offerBtn.y - 84, t('cardsWaiting'), '#ffd23f', 24);
            this.sfx('offer', { volume: 0.3, exact: true });
          });
        }
        break;
      case 'bossSpawn':
        this.bossBar.show(t('boss_' + ev.boss.kind));
        this.tray.setVisible(false);
        playMusic(this, 'boss');
        this.time.delayedCall(2600, () => { if (this.sim.boss && this.sim.boss.parts.some((p) => p.alive)) this.hint('armoured'); });
        break;
      case 'bossPhase': this.sfx('boomBig', { volume: 0.6 }); break;
      case 'bossKill':
        this.bulletT = 1.6;
        this.sfx('bossBoom', { volume: 1 });
        flash(this, 0xffffff, 300, 0.6);
        this.time.delayedCall(1400, () => {
          this.sfx('fanfare', { volume: 0.7 });
          banner(this, 420, t('bossDown'), '+' + ev.score, { color: '#ffd23f', hold: 1.4 });
          this.bossBar.hide();
          this.tray.setVisible(true);
        });
        break;
      case 'warp':
        this.sfx('warp', { volume: 0.7 });
        banner(this, 420, t('sectorClear'), t('warpTo', { name: t('sec_' + nextSector(sim.sector + 1)) }), { color: '#7dffa0', hold: 1.6 });
        playMusic(this, 'level2');
        break;
      case 'sector':
        if (ev.n > 0) {
          flash(this, 0xffffff, 260, 0.7);
          this.view.scenery.show(ev.n);
          this.hud.setCenter(t('hudWave', { s: ev.n + 1, n: 1, m: sim.wavesInSector }));
          const loop = Math.floor(ev.n / 4);
          banner(this, 380, t('sectorN', { n: ev.n + 1 }), t('sec_' + sim.sectorDef.id) + (loop > 0 ? '\n' + t('loopN', { n: loop + 1 }) : ''), { color: '#9fe8ff', hold: 1.4 });
        }
        break;
      case 'reflex':
        this.sfx('reflex', { volume: 0.5 });
        this.floatText(this.scale.width / 2, 560, t('slowmo'), '#c9a8ff', 40);
        break;
      case 'phoenix':
        this.sfx('phoenix', { volume: 0.8 });
        banner(this, 420, t('phoenixUp'), '', { color: '#ff9a3d', hold: 1.2 });
        flash(this, 0xff8a3d, 300, 0.5);
        break;
      case 'death':
        this.sfx('death', { volume: 1 });
        flash(this, 0xffffff, 300, 0.6);
        this.deathT = 0;
        this.bankStardust();
        // unopened offers are lost with the ship
        if (this.bar) { this.bar.destroy(); this.bar = null; }
        break;
    }
  }

  // ------------------------------------------------------------------ cards

  get barOpen(): boolean { return !!this.bar && !this.bar.done; }

  /** A new offer: the button counts it, a card flies into it with a soft chime and "+1 CARD". */
  private onOffer(_o: Offer): void {
    const btn = this.offerBtn;
    if (this.bar) this.bar.setWaiting(Math.max(0, this.sim.offers.length - 1));
    const card = this.add.image(this.scale.width / 2, 520, OFFER).setDisplaySize(30, 30).setScrollFactor(0).setDepth(9350).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, displayWidth: 84, displayHeight: 84, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: card, x: btn.x, y: btn.y, displayWidth: 56, displayHeight: 56, delay: 380, duration: 480, ease: 'Cubic.easeIn',
      onComplete: () => {
        card.destroy();
        btn.bump();
        this.sfx('offer', { volume: 0.4, exact: true });
        this.floatText(btn.x, btn.y - 76, t('offerPlus'), '#ffd23f', 24);
      },
    });
    if (!this.bot) this.time.delayedCall(1500, () => this.hint(this.inputKind === 'touch' ? 'hintOfferTouch' : 'hintOfferKeys'));
  }

  /** E, or a tap on the offer button: opens the front offer, or closes the open bar. */
  private toggleBar(): void {
    if (this.barOpen) { this.bar!.close(); return; }
    this.openBar();
  }

  private barIndex(): number { return this.sim.offers.findIndex((o) => o.id === this.barOffer); }

  private openBar(): void {
    const sim = this.sim;
    if (this.isOver || !sim.player.alive || this.cardList || this.barOpen) return;
    const o = sim.offers[0];
    if (!o) { this.sfx('error', { volume: 0.25 }); return; }
    this.bar?.destroy();
    this.barOffer = o.id;
    this.sfx('slowIn', { volume: 0.45, exact: true });
    // the switch costs no free hit: a short grace (not again for a few seconds of play)
    if (this.graceCd <= 0) { sim.grace(GRACE); this.graceCd = GRACE_CD; }
    this.bar = new CardBar(this, {
      ctx: { stack: (id) => sim.stack(id) },
      cards: o.cards,
      sub: o.from === 'boss' ? t('barFromBoss') : t('barFromWave', { n: o.n }),
      input: this.inputKind === 'touch' ? 'touch' : 'desk',
      credits: () => sim.credits,
      rerollCost: () => sim.rerollCost(Math.max(0, this.barIndex())),
      roll: () => { const i = this.barIndex(); return i >= 0 && sim.reroll(i) ? sim.offers[i].cards : null; },
      onPick: (id, x, y) => this.takeCard(id, x, y),
      onClose: () => { this.bar = null; this.sfx('slowOut', { volume: 0.4, exact: true }); },
      sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5, exact: true }),
    }, sim.offers.length - 1);
  }

  /** A card from the bar: it applies at once and its icon flies into the tray. */
  private takeCard(id: CardId, fx: number, fy: number): void {
    const sim = this.sim;
    const i = this.barIndex();
    this.bar = null;
    this.sfx('slowOut', { volume: 0.4, exact: true });
    if (i < 0 || !sim.take(i, id)) return;
    const col = RARITY_COLOR[CARD[id].rarity];
    const p = this.view.toScreen(sim.player.x, 0.3, sim.player.z);
    this.floatText(p.x, p.y - 90, t('c_' + id), col.text, 26);
    const trayOn = this.tray.chip.getData('show') !== false;
    this.tray.hide(id, true);
    const to = this.tray.slotPos(sim.cardOrder, (c) => sim.stack(c), id);
    const repair = id === 'repair';
    const fly = this.add.image(fx, fy, cardArt(id)).setDisplaySize(70, 70).setScrollFactor(0).setDepth(9800);
    this.tweens.add({
      targets: fly, x: repair ? this.hull.chip.x + 100 : to.x, y: repair ? BAR_Y : to.y, displayWidth: 38, displayHeight: 38,
      alpha: !repair && !trayOn ? 0 : 1, duration: 480, ease: 'Cubic.easeIn',
      onComplete: () => { fly.destroy(); this.tray.hide(id, false); this.tray.sync(sim.cardOrder, (c) => sim.stack(c)); if (trayOn) this.tray.pop(id); this.sfx('star', { volume: 0.35 }); },
    });
  }

  private openCardList(): void {
    if (this.cardList || !this.sim.cardOrder.length || this.isOver) return;
    if (this.barOpen) this.bar!.close();
    this.sfx('move', { volume: 0.4 });
    this.cardList = new CardList(this, this.sim.cardOrder, (c) => this.sim.stack(c), () => { this.cardList = null; });
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(dt: number): void {
    const sim = this.sim, p = sim.player;
    if (this.score !== sim.score) this.setScore(sim.score);
    const cr = Math.floor(sim.credits);
    if (cr !== this.lastCredits) {
      if (cr > this.lastCredits && this.lastCredits >= 0) this.tweens.add({ targets: this.creditChip, scale: 1.08, duration: 70, yoyo: true });
      this.lastCredits = cr;
      this.creditChip.setText(String(cr));
      this.tray.place(this.creditChip.right);
    }
    this.tray.sync(sim.cardOrder, (c) => sim.stack(c));
    this.tray.update(dt, (c) => sim.stack(c));
    // offers go down with the ship
    this.offerBtn.set(p.alive ? sim.offers.length : 0, this.barOpen);
    this.offerBtn.update(dt, this.elapsed);
    this.hull.update(p.hull, p.maxHull, p.shield, sim.stats.shieldMax, dt, this.elapsed);
    const on: Record<PowerId, number> = { bomb: 0, shield: sim.shieldT / 3.6, overdrive: sim.overdriveT / sim.stats.overdriveT };
    for (const b of this.powerBtns) {
      const pw = sim.powers[b.id];
      b.update(pw.cd, pw.max, Math.max(0, on[b.id]), sim.canUse(b.id) || pw.cd > 0, this.elapsed);
    }
    const b = sim.boss;
    if (b && !b.dead && !b.entering) this.bossBar.update(Math.max(0, b.hp / b.maxHp), b.parts.some((q) => q.alive), dt, this.elapsed);
    // low hull: red edges and one alarm
    const low = p.alive && p.hull < p.maxHull * 0.3;
    if (low && !this.lowWarned) { this.lowWarned = true; this.sfx('lowHull', { volume: 0.45 }); this.floatText(this.scale.width / 2, 980, t('lowHull'), '#ff7a6a', 30); }
    if (!low && p.hull > p.maxHull * 0.5) this.lowWarned = false;
    this.drawVignette(low, dt);
  }

  private redT = 0;
  private redFlash(k: number): void { this.redT = Math.max(this.redT, k); }

  private drawVignette(low: boolean, dt: number): void {
    this.redT = Math.max(0, this.redT - dt * 1.6);
    const pulse = low ? 0.22 + 0.12 * Math.sin(this.elapsed * 6) : 0;
    const a = Math.max(this.redT, pulse);
    const slow = this.sim.slowT > 0 ? 0.25 : 0;
    // the card bar's slow motion: cool blue edges
    const bar = ((1 - this.slow) / (1 - BAR_SLOW)) * 0.3;
    const g = this.vignette.clear();
    if (a <= 0.01 && slow <= 0 && bar <= 0.01) return;
    const { width: w, height: h } = this.scale;
    const col = slow > a && slow >= bar ? 0x9a6bff : bar > a ? 0x5ab8ff : 0xff2a2a;
    const k = Math.max(a, slow, bar);
    for (let i = 0; i < 8; i++) {
      const d = i * 14;
      g.lineStyle(16, col, k * (1 - i / 8) * 0.6).strokeRect(d, d, w - d * 2, h - d * 2);
    }
  }

  private drawOverlay(dt: number): void {
    const g = this.overlay.clear();
    const sim = this.sim;
    // kamikaze lock-on lines
    for (const e of View.lockOns(sim)) {
      const a = this.view.toScreen(e.x, 0.2, e.z), b = this.view.toScreen(sim.player.x, 0.2, sim.player.z);
      const k = 0.35 + 0.35 * Math.sin(this.elapsed * 26);
      const steps = 14;
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        g.lineStyle(4, 0xff3b3b, k).lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
    // boss parts: little health arcs
    const b = sim.boss;
    if (b && !b.dead && !b.entering) {
      for (const pt of b.parts) {
        if (!pt.alive) continue;
        const s = this.view.toScreen(pt.x, 0.6, pt.z);
        const k = pt.hp / pt.maxHp;
        g.lineStyle(6, 0x060914, 0.75).beginPath().arc(s.x, s.y, 34, -Math.PI / 2, Math.PI * 1.5).strokePath();
        g.lineStyle(5, k > 0.5 ? 0x7dffa0 : k > 0.25 ? 0xffc23f : 0xff4f4f, 0.95).beginPath().arc(s.x, s.y, 34, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
      }
    }
    // chain lightning
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bl = this.bolts[i];
      bl.t -= dt;
      if (bl.t <= 0) { this.bolts.splice(i, 1); continue; }
      const pts = bl.pts.map((p) => this.view.toScreen(p.x, 0.4, p.z));
      for (const [w, c, al] of [[9, 0x5ab8ff, 0.35], [3, 0xffffff, 1]] as [number, number, number][]) {
        g.lineStyle(w, c, al * Math.min(1, bl.t * 6));
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], c2 = pts[k];
          for (let s = 1; s <= 4; s++) {
            const f = s / 4;
            const j = s < 4 ? (Math.sin(bl.seed + k * 7 + s * 13 + this.elapsed * 40) * 12) : 0;
            g.lineTo(a.x + (c2.x - a.x) * f + j, a.y + (c2.y - a.y) * f - j * 0.5);
          }
        }
        g.strokePath();
      }
    }
  }

  /** The card bar may cover the ship: its outline and the enemy shots near it show through. */
  private drawGhost(): void {
    const g = this.ghost.clear();
    const sim = this.sim;
    if (!this.barOpen || !sim.player.alive) return;
    const top = BAR_BOTTOM - BAR_H - 8, bottom = BAR_BOTTOM + 8;
    for (const b of sim.ebullets) {
      if (b.dead) continue;
      const s = this.view.toScreen(b.x, 0.3, b.z);
      if (s.y < top || s.y > bottom) continue;
      g.fillStyle(0xff3b5c, 0.9).fillCircle(s.x, s.y, 7).lineStyle(2, 0xffffff, 0.85).strokeCircle(s.x, s.y, 7);
    }
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const s = this.view.toScreen(e.x, 0.3, e.z);
      if (s.y < top || s.y > bottom) continue;
      g.lineStyle(4, 0xff3b5c, 0.9).strokeCircle(s.x, s.y, 22);
    }
    const p = this.view.toScreen(sim.player.x, 0.3, sim.player.z);
    if (p.y < top || p.y > bottom + 40) return;
    const pts = [new Phaser.Math.Vector2(p.x, p.y - 30), new Phaser.Math.Vector2(p.x + 26, p.y + 20), new Phaser.Math.Vector2(p.x, p.y + 10), new Phaser.Math.Vector2(p.x - 26, p.y + 20)];
    g.fillStyle(0x5ad1ff, 0.3).fillPoints(pts, true);
    g.lineStyle(3, 0x9fe8ff, 0.95).strokePoints(pts, true, true);
  }

  private dmgNumber(x: number, y: number, n: number): void {
    const tx = txt(this, x + (Math.random() - 0.5) * 30, y, t('crit') + ' ' + n, { title: true, size: 22, color: '#fff3b0', strokeThickness: 5 }).setScrollFactor(0).setDepth(6000);
    this.tweens.add({ targets: tx, y: y - 50, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => tx.destroy() });
  }

  private floatText(x: number, y: number, s: string, color: string, size = 26): void {
    const tx = txt(this, x, y, s, { title: true, size, color, strokeThickness: 6 }).setScrollFactor(0).setDepth(9300).setScale(0.5);
    this.tweens.add({ targets: tx, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tx, y: y - 60, alpha: 0, delay: 600, duration: 500, onComplete: () => tx.destroy() });
  }

  private hintText: Phaser.GameObjects.Text | null = null;
  private hint(key: string): void {
    if (seenHints.has(key) || this.isOver) return;
    seenHints.add(key);
    this.hintText?.destroy();
    const h = txt(this, this.scale.width / 2, 640, t(key), { size: 25, color: '#ffffff', strokeThickness: 6, wrap: 620 }).setScrollFactor(0).setDepth(9400).setAlpha(0);
    this.hintText = h;
    this.tweens.add({ targets: h, alpha: 1, duration: 300 });
    this.tweens.add({ targets: h, alpha: 0, delay: 3800, duration: 500, onComplete: () => h.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private bankStardust(): number {
    if (this.banked) return 0;
    this.banked = true;
    const sim = this.sim;
    const dust = stardustFor(sim.run.wavesCleared, sim.run.bosses, sim.run.creditsEarned, this.mode === 'easy');
    bankRun(this.meta, dust, sim.sector + 1);
    this.dustEarned = dust;
    return dust;
  }
  private dustEarned = 0;
  private summaryBox: Phaser.GameObjects.Container | null = null;
  private summaryOut = false;

  /** The run's summary over the wreck: how far, what was earned. */
  private showSummary(): void {
    this.summary = true;
    const sim = this.sim;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 560).setScrollFactor(0).setDepth(9500);
    this.summaryBox = c;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.3).fillRoundedRect(-300, -170 + 8, 600, 340, 28);
    bg.fillStyle(0x0d1430, 0.92).fillRoundedRect(-300, -170, 600, 340, 28);
    bg.lineStyle(2, 0xffffff, 0.2).strokeRoundedRect(-300, -170, 600, 340, 28);
    c.add(bg);
    c.add(txt(this, 0, -118, t('runOver'), { title: true, size: 44, color: '#ff7a6a', strokeThickness: 8 }));
    c.add(txt(this, 0, -56, t('reached', { n: sim.sector + 1 }) + ' · ' + t('sec_' + sim.sectorDef.id), { size: 26, color: '#e6ecff', strokeThickness: 0 }));
    c.add(txt(this, 0, -16, t('runStats', { w: sim.run.wavesCleared, b: sim.run.bosses, k: sim.run.kills }), { size: 22, color: '#9fb0d8', strokeThickness: 0 }));
    const lost = sim.offers.length;
    if (lost > 0) c.add(txt(this, 0, 16, t('offersLost', { n: lost }), { size: 19, color: '#ff9aab', strokeThickness: 0 }));
    const dy = lost > 0 ? 14 : 0;
    const dustIcon = this.add.image(-120, 50 + dy, DUST).setDisplaySize(56, 56);
    const dustTxt = txt(this, 10, 50 + dy, t('dustEarned', { n: 0 }), { title: true, size: 36, color: '#f0d0ff', strokeThickness: 6 });
    c.add([dustIcon, dustTxt]);
    c.add(txt(this, 0, 118 + dy / 2, t('dustTotal', { n: this.meta.dust }), { size: 20, color: '#cfd8f0', strokeThickness: 0 }));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.addCounter({ from: 0, to: this.dustEarned, duration: 900, delay: 350, onUpdate: (tw) => dustTxt.setText(t('dustEarned', { n: Math.round(tw.getValue() ?? 0) })), onComplete: () => { if (this.dustEarned > 0) this.sfx('dust', { volume: 0.6 }); } });
    this.tweens.add({ targets: dustIcon, angle: 360, duration: 1400, delay: 350 });
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    if (!this.isOver) this.bankStardust();
    super.endGame(o);
  }

  // ------------------------------------------------------------------ test hooks

  /** Test hook: runs the simulation faster (slow software rendering in screenshots). */
  testSpeed = 1;
  /** The autopilot plays (store art, screenshots); with `cards` false it leaves the offers alone. */
  testAuto(on: boolean, cards = true): void { this.bot = on ? new Bot(this.sim, SKILL.good) : null; this.botCards = cards; }
  private botCards = true;
  /** Puts an offer with these cards at the front of the queue and opens it in the card bar. */
  testDraft(cards: CardId[]): void {
    this.sim.forceOffer(cards);
    if (this.barOpen) { this.bar!.destroy(); this.bar = null; }
    this.openBar();
  }
  /** Banks an offer with these cards behind the others (the bar stays closed). */
  testOffer(cards: CardId[]): void { this.sim.forceOffer(cards); const o = this.sim.offers.shift()!; this.sim.offers.push(o); }
  testPick(i: number): void { this.bar?.testPick(i); }
  get testDraftReady(): boolean { return !!this.bar?.ready; }
  testCards(ids: CardId[]): void { for (const id of ids) this.sim.apply(id); }
  testBoss(): void { this.sim.skipToBoss(); }
  testSector(n: number): void {
    this.sim.sector = n;
    this.view.scenery.show(n);
    this.hud.setCenter(t('hudWave', { s: n + 1, n: 1, m: this.sim.wavesInSector }));
  }
  testPower(id: PowerId): void { this.sim.powers[id].cd = 0; this.want[id] = true; }
  testHull(k: number): void { this.sim.player.hull = this.sim.player.maxHull * k; }
}

function nextSector(n: number): string {
  return ['ember', 'belt', 'station', 'rift'][n % 4];
}

export { POWER_IDS, UI_DEPTH };
