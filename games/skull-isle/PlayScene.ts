// Skull Isle: the Play scene. Runs the simulation (sim.ts) at a fixed 60 Hz, draws it in 3D
// (view.ts) under a Phaser HUD, reads the stick, the action buttons and the keys, plays the sounds,
// banners, hit-stop and damage numbers, runs the short first-run training, opens the dock shop and
// the boon draft between islands, and banks the run's doubloons at the end.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, hudChip, HudChip, flash, shake,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP, hudRightEdge,
} from '@core';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent } from './sim';
import { DT, PLAYER, FISH_HEAL, POWER_COLOR, islandOf, type Mode, type PowerId, type FoeKind, type HeroId } from './defs';
import { View } from './view';
import { Bot, SKILL } from './bot';
import { loadMeta, saveMeta, bankRun, type Meta } from './meta';
import { makeArt, GOLD, powerArt, DOUBLOON } from './art';
import { HpBar, PowerChips, BossBar, banner, bossIntro, actionButton, drawButton, glass, Pill, type ActionButton } from './ui';
import { ShopOverlay, DraftOverlay, type OverlayHost } from './shop';
import type { ShopId, BoonId } from './upgrades';

const STEP = DT;
const BOTTOM_Y = 1214;
/** Where the core's A and B buttons (ATTACK, DODGE) sit on touch screens. */
const BTN_A: [number, number] = [598, 1110];
const BTN_B: [number, number] = [448, 1188];
const BTN_SPECIAL: [number, number] = [612, 930];
const BTN_KEG: [number, number] = [468, 1030];

interface DmgText { t: Phaser.GameObjects.Text; life: number; x: number; y: number }
type TutStep = 'move' | 'combo' | 'dodge' | 'power' | 'done';

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  meta!: Meta;
  mode: Mode = 'normal';
  hero: HeroId = 'anne';
  private controls!: Controls;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private touch = false;
  private hp!: HpBar;
  private powerChips!: PowerChips;
  private bossBar!: BossBar;
  private goldChip!: HudChip;
  private waveChip!: HudChip;
  private comboChip!: HudChip;
  private specialChip: HudChip | null = null;
  private specialPips: Phaser.GameObjects.Graphics | null = null;
  private kegChip: HudChip | null = null;
  private btnAttack: ActionButton | null = null;
  private btnDodge: ActionButton | null = null;
  private btnSpecial: ActionButton | null = null;
  private btnKeg: ActionButton | null = null;
  private vignette!: Phaser.GameObjects.Graphics;
  private fade!: Phaser.GameObjects.Rectangle;
  private shop: ShopOverlay | null = null;
  private draft: DraftOverlay | null = null;
  private acc = 0;
  private hitStop = 0;
  private slowT = 0;
  private holdT = 0;
  private bossHold = 0;
  private bot: Bot | null = null;
  private dmg: DmgText[] = [];
  private dmgPool: Phaser.GameObjects.Text[] = [];
  private shown = { gold: -1, wave: '', combo: -1, kegs: -1, special: -1, island: -1 };
  private sfxGap: Record<string, number> = {};
  private redT = 0;
  private lowWarned = false;
  private ended = false;
  private banked = false;
  private earned = 0;
  private freedBarb = false;
  private summaryBox: Phaser.GameObjects.Container | null = null;
  private specialWasReady = false;
  // the training
  private tut: TutStep | null = null;
  private tutCard: Phaser.GameObjects.Container | null = null;
  private tutSkip: Pill | null = null;
  private tutMoved = 0;
  private tutAt: { x: number; z: number } | null = null;
  private tutTele: { x: number; z: number; r: number; id: number } | null = null;
  private tutT = 0;
  private hintBox: Phaser.GameObjects.Container | null = null;
  /** Test hooks. */
  quiet = false;
  testSpeed = 1;
  god = false;
  frozen = false;
  private pending = 0;
  firstFrames: number[] = [];
  programsAtStart = -1;
  programsAfter = -1;
  private frameStart = 0;
  perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0, foes: 0 };

  createGame(): void {
    this.mode = isEasy() ? 'easy' : 'normal';
    this.meta = loadMeta();
    this.hero = this.meta.heroes.includes(this.meta.hero) ? this.meta.hero : 'anne';
    const training = !this.meta.tutorial;
    this.sim = new Sim(this.mode, Math.floor(Math.random() * 1e9), { hero: this.hero, nodes: this.meta.nodes }, { tutorial: training });
    this.acc = 0; this.hitStop = 0; this.slowT = 0; this.holdT = 0; this.bossHold = 0;
    this.bot = null;
    this.dmg = []; this.dmgPool = [];
    this.shown = { gold: -1, wave: '', combo: -1, kegs: -1, special: -1, island: -1 };
    this.sfxGap = {};
    this.redT = 0; this.lowWarned = false; this.ended = false; this.banked = false; this.earned = 0; this.freedBarb = false;
    this.summaryBox = null; this.shop = null; this.draft = null;
    this.specialWasReady = false;
    this.tut = null; this.tutCard = null; this.tutSkip = null; this.tutMoved = 0; this.tutAt = null; this.tutTele = null; this.tutT = 0; this.hintBox = null;
    this.quiet = false; this.testSpeed = 1; this.god = false; this.frozen = false; this.pending = 0;
    this.firstFrames = []; this.frameStart = 0;
    this.btnAttack = this.btnDodge = this.btnSpecial = this.btnKeg = null;
    this.specialChip = this.kegChip = null; this.specialPips = null;
    makeArt(this);

    this.view = new View(this, { hero: this.hero });
    this.world = this.view.world;
    const renderer = this.world.renderer;
    this.programsAtStart = (renderer.info.programs ?? []).length;
    this.programsAfter = -1;
    this.perf = { frames: 0, update: 0, render: 0, maxUpdate: 0, maxRender: 0, calls: 0, maxCalls: 0, tris: 0, foes: 0 };
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
      if (this.perf.frames > 5) this.perf.maxCalls = Math.max(this.perf.maxCalls, this.perf.calls);
      if (this.programsAfter < 0 && this.perf.frames > 0) this.programsAfter = (renderer.info.programs ?? []).length;
    };

    this.setupInput();
    this.setupHud();
    this.vignette = this.add.graphics().setDepth(60).setScrollFactor(0);
    this.fade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x02060a, 1).setOrigin(0).setScrollFactor(0).setDepth(9300);
    this.tweens.add({ targets: this.fade, alpha: 0, duration: 500 });

    // a run left through the pause menu still banks what it earned
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (!this.banked && this.sim.islandsCleared > 0) this.bankDoubloons();
      this.view.dispose();
    });
    if (training) this.startTutorial();
    else this.islandBanner(0);
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    this.touch = this.sys.game.device.input.touch;
    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'], buttonPos: { A: BTN_A, B: BTN_B }, buttonScale: 1.06 });
    if (this.controls.touchUi) {
      // the core's A/B circles keep doing the hit testing; this game draws its own buttons over them
      for (const o of this.children.list) {
        const d = o as unknown as { depth: number; x: number; y: number };
        if (d.depth < 9500 || d.depth > 9501) continue;
        const atA = Math.hypot(d.x - BTN_A[0], d.y - BTN_A[1]) < 2, atB = Math.hypot(d.x - BTN_B[0], d.y - BTN_B[1]) < 2;
        if (!atA && !atB) continue;
        if (o instanceof Phaser.GameObjects.Arc) o.setFillStyle(0xffffff, 0.001).setStrokeStyle(0, 0, 0);
        else if (o instanceof Phaser.GameObjects.Text) o.setVisible(false);
      }
      this.btnAttack = actionButton(this, BTN_A[0], BTN_A[1], 78, t('btnAttack'), false, { size: 22 });
      this.btnDodge = actionButton(this, BTN_B[0], BTN_B[1], 60, t('btnDodge'), false, { size: 18 });
      this.btnSpecial = actionButton(this, BTN_SPECIAL[0], BTN_SPECIAL[1], 56, t('btnSpecial'), true, { size: 19 });
      this.btnKeg = actionButton(this, BTN_KEG[0], BTN_KEG[1], 46, t('btnKeg'), true, { badge: true, size: 17 });
    }
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      for (const [n, c] of Object.entries({ j: K.J, k: K.K, l: K.L, e: K.E, q: K.Q })) this.keys[n] = kb.addKey(c, false, false);
      kb.on('keydown', (e: KeyboardEvent) => {
        if (this.draft?.key(e.code)) return;
        if (this.shop?.key(e.code)) return;
        if (e.code === 'KeyQ' && this.tut) this.endTutorial(true);
      });
    }
  }

  private atkRepeat = 0;

  private readInput(dt: number): Input {
    if (this.forced) { this.forced.t -= dt; const f = this.forced.inp; if (this.forced.t <= 0) this.forced = null; return { ...NO_INPUT, ...f }; }
    if (this.bot) return this.bot.input(dt);
    const c = this.controls;
    const jd = (k: string) => !!this.keys[k] && Phaser.Input.Keyboard.JustDown(this.keys[k]);
    const held = c.a || !!this.keys.j?.isDown;
    let attack = c.justA() || jd('j');
    // holding ATTACK keeps the combo going
    if (held) { this.atkRepeat -= dt; if (this.atkRepeat <= 0) { attack = true; this.atkRepeat = 0.17; } } else this.atkRepeat = 0;
    if (attack && held) this.atkRepeat = 0.17;
    const special = jd('l') || !!this.btnSpecial?.pressed;
    const item = jd('e') || !!this.btnKeg?.pressed;
    if (this.btnSpecial) this.btnSpecial.pressed = false;
    if (this.btnKeg) this.btnKeg.pressed = false;
    return { mx: c.axisX, mz: c.axisY, attack, dodge: c.justB() || jd('k'), special, item };
  }

  // ------------------------------------------------------------------ HUD

  private setupHud(): void {
    const { width } = this.scale;
    this.hud.setLevel(1);
    this.goldChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: GOLD, iconSize: 30, text: '0', color: '#ffe68a', minWidth: 96 });
    this.waveChip = hudChip(this, width / 2, HUD_ROW2_Y, { align: 'center', text: '', size: 22, minWidth: 120 });
    this.comboChip = hudChip(this, width - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', text: '', size: 24, color: '#ffd25a' });
    this.comboChip.setVisible(false);
    this.powerChips = new PowerChips(this, HUD_MARGIN, HUD_ROW2_Y + 66);
    this.bossBar = new BossBar(this, width / 2, HUD_ROW2_Y + 130);
    this.hp = new HpBar(this, HUD_MARGIN, BOTTOM_Y);
    if (!this.touch) {
      // keyboard players read the special meter and the kegs in chips by the corner
      this.specialPips = this.add.graphics();
      this.specialPips.setData('chipWidth', 96);
      this.specialChip = hudChip(this, width - HUD_MARGIN, BOTTOM_Y, { align: 'right', text: 'L', size: 22, color: '#ffd23f', items: [this.specialPips], height: 56 });
      this.kegChip = hudChip(this, this.specialChip.left - HUD_GAP, BOTTOM_Y, { align: 'right', icon: powerArt('keg'), iconSize: 40, text: 'E ×0', size: 22, height: 56 });
    }
    void hudRightEdge;
  }

  private updateHud(dt: number): void {
    const sim = this.sim, p = sim.p;
    if (this.score !== sim.score) this.setScore(sim.score);
    if (this.shown.island !== sim.k) { this.shown.island = sim.k; this.hud.setLevel(sim.k + 1); }
    if (sim.gold !== this.shown.gold) {
      if (this.shown.gold >= 0 && sim.gold > this.shown.gold) this.tweens.add({ targets: this.goldChip, scale: 1.12, duration: 70, yoyo: true });
      this.shown.gold = sim.gold;
      this.goldChip.setText(String(sim.gold));
    }
    const waveText = sim.phase === 'tutorial' ? t('tutTitle') : sim.bossActive ? t('bossWave') : t('wave', { n: Math.max(1, sim.wave), of: sim.waves });
    if (waveText !== this.shown.wave) {
      this.shown.wave = waveText;
      this.waveChip.setText(waveText);
      this.waveChip.setTextColor(sim.bossActive ? '#ff8a6a' : '#ffffff');
    }
    const combo = p.combo >= 3 ? p.combo : 0;
    if (combo !== this.shown.combo) {
      this.comboChip.setVisible(combo > 0);
      if (combo > this.shown.combo && combo > 0) this.tweens.add({ targets: this.comboChip, scale: 1.18, duration: 60, yoyo: true });
      this.shown.combo = combo;
      this.comboChip.setText(t('combo', { n: combo }) + ' ' + t('hits'));
      this.comboChip.setTextColor(combo >= 30 ? '#ff6a8a' : combo >= 12 ? '#ffb04a' : '#ffd25a');
    }
    this.powerChips.update(p.powers, { shieldHits: p.shieldHits }, this.elapsed);
    this.hp.update(p.hp, sim.st.maxHp, dt, this.elapsed);
    // the boss bar
    const boss = sim.foes.find((f) => (f.kind === 'head' || f.kind === 'captain'));
    if (boss && boss.state !== 'dead' && sim.bossActive) {
      this.bossBar.show(t('b_' + sim.bossActive));
      const shielded = boss.kind === 'head' ? boss.state !== 'open' : boss.state === 'ship';
      this.bossBar.update(Math.max(0, boss.hp / boss.maxHp), shielded, boss.kind === 'captain' && sim.bossPhase === 3, dt, this.elapsed);
    } else this.bossBar.hide();
    // special meter and kegs
    const pip = PLAYER.pip, pips = sim.st.pips;
    const seg = Array.from({ length: pips }, (_, i) => Math.max(0, Math.min(1, (p.special - i * pip) / pip)));
    const ready = p.special >= pip;
    if (this.btnAttack) drawButton(this.btnAttack, 0xe2553f, { held: this.controls.a });
    if (this.btnDodge) drawButton(this.btnDodge, 0x3aa8d8, { held: this.controls.b, ring: [Math.max(0, 1 - p.dodgeCd / sim.st.dodgeCd)], dim: p.dodgeCd > 0 });
    if (this.btnSpecial) drawButton(this.btnSpecial, 0xd89a1a, { ring: seg, ready, dim: !ready, time: this.elapsed, held: this.btnSpecial.down });
    if (this.btnKeg) {
      drawButton(this.btnKeg, 0x8a5a34, { dim: p.kegs <= 0, held: this.btnKeg.down });
      if (this.shown.kegs !== p.kegs) { this.btnKeg.badge!.setText(p.kegs > 0 ? String(p.kegs) : ''); }
    }
    if (this.specialPips) {
      const g = this.specialPips.clear();
      const w0 = (96 - (pips - 1) * 6) / pips;
      seg.forEach((k, i) => {
        g.fillStyle(0x060914, 0.75).fillRoundedRect(-48 + i * (w0 + 6), -9, w0, 18, 8);
        if (k > 0) g.fillStyle(k >= 1 ? 0xffd23f : 0xbfc8d8, 1).fillRoundedRect(-48 + i * (w0 + 6), -9, Math.max(10, w0 * k), 18, 8);
      });
      if (ready) g.lineStyle(2, 0xffd23f, 0.5 + Math.sin(this.elapsed * 8) * 0.4).strokeRoundedRect(-51, -12, 102, 24, 10);
    }
    if (this.kegChip && this.shown.kegs !== p.kegs) {
      this.kegChip.setText(`E ×${p.kegs}`);
      this.kegChip.setAlpha(p.kegs > 0 ? 1 : 0.55);
      if (this.specialChip) this.kegChip.setAnchor(this.specialChip.left - HUD_GAP, BOTTOM_Y, 'right');
    }
    if (this.shown.kegs >= 0 && p.kegs > this.shown.kegs && (this.btnKeg || this.kegChip)) this.tweens.add({ targets: this.btnKeg?.root ?? this.kegChip, scale: 1.2, duration: 90, yoyo: true });
    this.shown.kegs = p.kegs;
    if (ready && !this.specialWasReady && sim.phase === 'fight') {
      this.sfx('ready', { volume: 0.4, exact: true });
      const barrage = sim.st.pips >= 2 && p.special >= pip * 2;
      this.hint(barrage ? 'hintBarrage' : this.touch ? 'hintSpecialTouch' : 'hintSpecialKeys');
    }
    this.specialWasReady = ready;
    // low health: a red, throbbing edge
    const low = p.state !== 'dead' && p.hp < sim.st.maxHp * 0.3;
    if (low && !this.lowWarned) { this.lowWarned = true; this.floatAt(p.x, p.z, t('lowHp'), '#ff7a6a', 28); }
    if (p.hp > sim.st.maxHp * 0.5) this.lowWarned = false;
    this.redT = Math.max(0, this.redT - dt * 1.6);
    const beat = low ? Math.pow(Math.max(0, Math.sin(this.elapsed * Math.PI * 2.2)), 6) : 0;
    const a = Math.max(this.redT, low ? 0.28 + beat * 0.35 : 0);
    const g = this.vignette.clear();
    if (a > 0.01) {
      const { width: W, height: H } = this.scale;
      for (let i = 0; i < 12; i++) { const d = i * 15; g.lineStyle(17, 0xff2020, a * Math.pow(1 - i / 12, 1.6) * 0.75).strokeRect(d, d, W - d * 2, H - d * 2); }
    }
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    const now = performance.now();
    if (this.firstFrames.length < 8 && this.frameStart) this.firstFrames.push(now - this.frameStart);
    this.frameStart = now;
    let dt = delta / 1000;
    if (this.frozen) { dt = this.pending; this.pending = 0; }
    this.step(dt);
    const d = performance.now() - now;
    this.perf.frames++;
    this.perf.update += d;
    this.perf.maxUpdate = Math.max(this.perf.maxUpdate, d);
    this.perf.foes = this.sim.foes.length;
  }

  testFreeze(on: boolean): void { this.frozen = on; this.pending = 0; }
  testAdvance(s: number): void { this.pending += s; }

  private step(dt: number): void {
    const sim = this.sim;
    let k = this.testSpeed;
    if (this.slowT > 0) { this.slowT -= dt; k *= 0.3; }
    if (this.hitStop > 0) { this.hitStop -= dt; k = 0; }
    if (this.bossHold > 0) { this.bossHold -= dt; k = 0; }
    if (this.shop || this.draft) k = 0;
    this.acc += dt * k;
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      this.acc -= STEP;
      n++;
      const inp = sim.p.state === 'dead' ? NO_INPUT : this.readInput(STEP);
      if (this.god) sim.p.invuln = Math.max(sim.p.invuln, 0.1);
      sim.step(STEP, inp);
      for (const ev of sim.events) this.onEvent(ev);
      sim.events.length = 0;
      if (this.bot && sim.phase === 'shop' && !this.shop) { this.bot.shop(); sim.leaveShop(); for (const ev of sim.events) this.onEvent(ev); sim.events.length = 0; }
      if (this.bot && sim.phase === 'draft' && !this.draft) { sim.pickBoon(this.bot.draft()); for (const ev of sim.events) this.onEvent(ev); sim.events.length = 0; }
      if (this.hitStop > 0 || this.bossHold > 0 || this.shop || this.draft) { this.acc = 0; break; }
    }
    if (n >= 8) this.acc = 0;
    if (this.tut) this.updateTutorial(dt);
    this.view.sync(sim, dt, (this.slowT > 0 ? 0.35 : this.hitStop > 0 ? 0.15 : 1) * Math.min(1, this.testSpeed || 0.0001));
    this.updateHud(dt);
    this.updateDmg(dt);
    for (const key of Object.keys(this.sfxGap)) this.sfxGap[key] -= dt;
    if (sim.over && !this.ended) this.finish();
  }

  // ------------------------------------------------------------------ events

  private sx(x: number, z: number, y = 1) { return this.view.toScreen(x, y, z); }

  /** A sound at most every `gap` seconds (busy fights stay listenable). */
  private s(key: string, volume: number, gap = 0.05, x?: number, rate?: number): void {
    if ((this.sfxGap[key] ?? 0) > 0) return;
    this.sfxGap[key] = gap;
    if (x !== undefined) this.sfxAt(key, x, { volume, rate });
    else this.sfx(key, { volume, rate });
  }

  private onEvent(ev: SimEvent): void {
    const sim = this.sim;
    this.view.handle(ev, sim);
    switch (ev.type) {
      case 'swing':
        this.s(ev.spin ? 'swing3' : ev.anim === 'Punch' ? 'swing2' : 'swing1', ev.spin ? 0.6 : 0.42, 0.04);
        break;
      case 'hit': {
        const sxv = this.sx(ev.x, ev.z).x;
        if (ev.kind === 'chest' || ev.kind === 'barrel' || ev.src === 'hazard') break;
        if (ev.crit || ev.heavy || ev.dmg >= 25 || Math.random() < 0.6) this.dmgNumber(ev.x, ev.z, ev.dmg, ev.crit);
        this.s(ev.crit ? 'crit' : ev.src === 'parrot' ? 'peck' : 'hit', ev.crit ? 0.5 : 0.36, 0.05, sxv);
        if (ev.src === 'finisher' || ev.crit) this.hitStop = Math.max(this.hitStop, 0.07);
        else if (ev.src === 'melee') this.hitStop = Math.max(this.hitStop, 0.035);
        if (ev.src === 'finisher') shake(this, 0.004, 90);
        break;
      }
      case 'kill': {
        if (ev.boss) break;
        const sxv = this.sx(ev.x, ev.z).x;
        this.s(ev.kind === 'shark' ? 'splash' : ev.kind === 'tentacle' || ev.kind === 'arm' ? 'squish' : 'bones', 0.5, 0.06, sxv);
        if (ev.kind === 'brute' || ev.kind === 'arm' || ev.kind === 'tentacle') { this.hitStop = Math.max(this.hitStop, 0.09); this.view.shake(0.25, 0.15); }
        break;
      }
      case 'hurt':
        this.sfx('hurt', { volume: 0.6 });
        this.redT = Math.max(this.redT, 0.4);
        if (ev.dmg >= 15) shake(this, 0.006, 140);
        this.dmgNumber(sim.p.x, sim.p.z, ev.dmg, false, '#ff6a5a');
        break;
      case 'block': this.sfx('clang', { volume: 0.55 }); this.floatAt(ev.x, ev.z, t('blocked'), '#7fe8ff', 26); break;
      case 'dodge': this.s('roll', 0.45, 0.05); break;
      case 'special':
        if (ev.which === 'barrage') { this.sfx('horn', { volume: 0.6 }); banner(this, 420, t('barrage'), '', { color: '#ffc23a', size: 44, hold: 0.8 }); }
        break;
      case 'fire':
        if (ev.kind === 'bullet') this.sfx('pistol', { volume: 0.6 });
        else if (ev.kind === 'barrage') this.sfx('whistle', { volume: 0.5 });
        else if (ev.kind === 'cannon') { this.sfxAt('cannon', this.sx(ev.x, ev.z).x, { volume: 0.55 }); this.sfx('whistle', { volume: 0.25 }); }
        else if (ev.kind === 'skull') this.s('toss', 0.35, 0.1, this.sx(ev.x, ev.z).x);
        else if (ev.kind === 'ink') this.sfx('spit', { volume: 0.6 });
        break;
      case 'boom': {
        const x = this.sx(ev.x, ev.z).x;
        if (ev.kind === 'barrage' || ev.kind === 'cannon') this.s('boom', 0.55, 0.06, x);
        else if (ev.kind === 'keg') { this.sfxAt('bigBoom', x, { volume: 0.75 }); shake(this, 0.008, 200); }
        else if (ev.kind === 'slam') { this.s('slam', 0.6, 0.08, x); shake(this, 0.005, 150); }
        else if (ev.kind === 'ink') this.s('splat', 0.45, 0.08, x);
        else this.s('thud', 0.4, 0.06, x);
        break;
      }
      case 'splash': this.s('splash', ev.big ? 0.55 : 0.35, 0.08, this.sx(ev.x, ev.z).x); break;
      case 'coin': this.s(ev.bag ? 'bag' : 'coin', ev.bag ? 0.5 : 0.28, 0.035); break;
      case 'power': {
        this.sfx(ev.power === 'parrot' ? 'squawk' : ev.power === 'fish' ? 'heal' : 'power', { volume: 0.6 });
        const name = t('p_' + ev.power), sub = ev.power === 'fish' ? t('pd_fish', { n: FISH_HEAL }) : t('pd_' + ev.power);
        this.floatAt(sim.p.x, sim.p.z, name, '#' + POWER_COLOR[ev.power].toString(16).padStart(6, '0'), 34, sub);
        this.flyIcon(ev.power);
        if (ev.power === 'keg' && sim.phase !== 'tutorial') this.hint(this.touch ? 'hintKegTouch' : 'hintKegKeys');
        break;
      }
      case 'expire': this.sfx('expire', { volume: 0.3, exact: true }); break;
      case 'chest': this.sfx('chest', { volume: 0.7 }); this.floatAt(ev.x, ev.z, t('chestOpen'), '#ffd23f', 40); break;
      case 'tele':
        if (!ev.friendly) this.s('tele', 0.18, 0.25);
        break;
      case 'wave':
        if (!sim.bossActive || ev.n < ev.of) {
          banner(this, 390, t('waveN', { n: ev.n }), '', { color: '#ffe6c0', size: 44, hold: 0.8 });
          this.sfx('wave', { volume: 0.45, exact: true });
        }
        break;
      case 'waveClear':
        this.sfx('clear', { volume: 0.4, exact: true });
        if (sim.chests.some((c) => !c.open)) this.time.delayedCall(600, () => this.hint('hintChest'));
        break;
      case 'cleared':
        this.sfx('fanfare', { volume: 0.7, exact: true });
        banner(this, 470, t('islandClear'), t('bonus', { n: ev.bonus }), { color: '#ffd23f', size: 50, hold: 1.8 });
        flash(this, 0xfff0c0, 200, 0.3);
        break;
      case 'shop': this.openShop(); break;
      case 'draft': this.openDraft(ev.boons); break;
      case 'sail':
        this.sfx('sail', { volume: 0.6, exact: true });
        this.tweens.add({ targets: this.fade, alpha: 1, duration: 600 });
        banner(this, 600, t('sailing', { name: t('i_' + islandOf(sim.k + 1).id) }), '', { color: '#bfe8ff', size: 40, hold: 0.9 });
        break;
      case 'island':
        if (ev.k > 0) { this.tweens.add({ targets: this.fade, alpha: 0, duration: 500 }); this.islandBanner(ev.k); }
        break;
      case 'boss': {
        this.sfx('alarm', { volume: 0.55, exact: true });
        this.bossHold = 2;
        const at = ev.kind === 'kraken' ? sim.foes.find((f) => f.kind === 'head') : sim.foes.find((f) => f.kind === 'captain');
        if (at) this.view.focus(at.x, at.z + (ev.kind === 'kraken' ? 3 : 4), 2.3);
        this.view.zoomTarget = 1.18;
        this.time.delayedCall(300, () => { this.sfx('roar', { volume: 0.7 }); this.view.shake(0.4, 0.5); });
        bossIntro(this, t('b_' + ev.kind), t(ev.kind === 'kraken' ? 'bossKrakenSub' : 'bossCaptainSub'));
        break;
      }
      case 'bossPhase':
        if (ev.kind === 'kraken' && ev.phase === 2) { banner(this, 460, t('krakenHead'), '', { color: '#ff9ad0', size: 42, hold: 1.4 }); this.sfx('roar', { volume: 0.6, rate: 1.2 }); }
        if (ev.kind === 'captain' && ev.phase === 2) { banner(this, 460, t('captainLands'), '', { color: '#ffb04a', size: 42, hold: 1.2 }); this.sfx('roar', { volume: 0.6 }); }
        if (ev.kind === 'captain' && ev.phase === 3) { banner(this, 460, t('captainRage'), '', { color: '#ff5a7a', size: 42, hold: 1.2 }); this.sfx('roar', { volume: 0.7, rate: 0.8 }); }
        break;
      case 'bossDown':
        this.slowT = 1.2;
        this.sfx('bossDie', { volume: 0.9 });
        flash(this, 0xffffff, 260, 0.5);
        this.view.zoomTarget = 1;
        this.time.delayedCall(800, () => {
          this.sfx('fanfare2', { volume: 0.7, exact: true });
          banner(this, 420, t('bossDown', { name: t('b_' + ev.kind) }), '', { color: '#ffd23f', hold: 1.6, size: 46 });
        });
        break;
      case 'secondWind':
        this.sfx('revive', { volume: 0.8 });
        flash(this, 0xfff0b0, 400, 0.6);
        banner(this, 420, t('secondWindOn'), '', { color: '#ffd27a', hold: 1.2 });
        break;
      case 'death':
        this.sfx('death', { volume: 0.9 });
        flash(this, 0xff3030, 300, 0.5);
        this.slowT = 1.6;
        this.bankDoubloons();
        this.time.delayedCall(900, () => this.showSummary());
        break;
      case 'peck': this.s('peck', 0.35, 0.2); if (Math.random() < 0.3) this.s('squawk', 0.35, 1.5); break;
      case 'keg': this.sfx('toss', { volume: 0.5 }); this.time.delayedCall(450, () => this.sfx('fuse', { volume: 0.4 })); break;
      case 'roll': this.s('rumble', 0.4, 0.5); if (sim.k < 3) this.hint('hintBarrel'); break;
      case 'tide': this.s('tide', 0.45, 1); this.hint('hintTide'); break;
      case 'heal': if (ev.n > 0) this.floatAt(sim.p.x, sim.p.z - 0.4, t('healed', { n: ev.n }), '#7affa0', 28); break;
      case 'lunge': this.s('lunge', 0.55, 0.2, this.sx(ev.x, ev.z).x); this.hint('hintShark'); break;
      case 'spawn':
        if (ev.kind === 'tentacle') { this.s('splash', 0.5, 0.1); this.hint('hintTentacle'); }
        else if (ev.kind !== 'shark' && ev.kind !== 'arm' && ev.kind !== 'head' && ev.kind !== 'captain') this.s('rise', 0.2, 0.2, this.sx(ev.x, ev.z).x);
        break;
      default: break;
    }
  }

  private islandBanner(k: number): void {
    const isle = islandOf(k);
    const lap = Math.floor(k / 5);
    banner(this, 370, t('islandN', { n: k + 1 }), t('i_' + isle.id) + (lap > 0 ? '  ·  ' + t('lapN', { n: lap + 1 }) : ''), { color: '#ffe6a0', size: 52, hold: 1.25 });
    this.sfx('horn', { volume: 0.45, exact: true });
  }

  /** The pickup's icon flies from the hero to its HUD chip. */
  private flyIcon(id: PowerId): void {
    const p = this.sx(this.sim.p.x, this.sim.p.z, 1.4);
    const to = id === 'keg' ? (this.btnKeg ? { x: this.btnKeg.x, y: this.btnKeg.y } : this.kegChip ? { x: this.kegChip.x - this.kegChip.chipWidth / 2, y: BOTTOM_Y } : p)
      : id === 'fish' ? { x: HUD_MARGIN + 40, y: BOTTOM_Y } : this.powerChips.slot(id);
    const img = this.add.image(p.x, p.y, powerArt(id)).setDisplaySize(60, 60).setScrollFactor(0).setDepth(9350);
    this.tweens.add({ targets: img, x: to.x, y: to.y, displayWidth: 36, displayHeight: 36, duration: 520, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
  }

  // ------------------------------------------------------------------ between islands

  private overlayHost(): OverlayHost {
    return { sfx: (key, v) => this.sfx(key, { volume: v ?? 0.5, exact: true }), touch: this.touch };
  }

  private openShop(): void {
    if (this.shop || this.isOver) return;
    if (this.bot) return;
    this.shop = new ShopOverlay(this, this.sim, this.overlayHost(), () => {
      this.shop = null;
      this.sim.leaveShop();
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    });
  }

  private openDraft(boons: BoonId[]): void {
    if (this.draft || this.isOver || this.bot) return;
    this.sfx('card', { volume: 0.5, exact: true });
    this.draft = new DraftOverlay(this, boons, this.overlayHost(), (i) => {
      this.draft = null;
      this.sim.pickBoon(i);
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    });
  }

  // ------------------------------------------------------------------ the training

  private startTutorial(): void {
    this.tut = 'move';
    this.tutMoved = 0;
    this.tutT = 0;
    const { width } = this.scale;
    this.tutSkip = new Pill(this, width / 2, 912, 170, 60, 0x5a4a6a, () => this.endTutorial(true), 24);
    this.tutSkip.setLabels(t('skip') + (this.touch ? '' : ' (Q)')).setScrollFactor(0).setDepth(9450);
    this.tutPrompt();
  }

  private tutPrompt(): void {
    const step = this.tut;
    if (!step) return;
    this.tutCard?.destroy();
    const { width } = this.scale;
    const n = { move: 1, combo: 2, dodge: 3, power: 4, done: 4 }[step];
    const key = step === 'done' ? 'tut_done' : step === 'power' ? 'tut_power' : `tut_${step}_${this.touch ? 'touch' : 'keys'}`;
    const c = this.add.container(width / 2, 790).setScrollFactor(0).setDepth(9420);
    const tx = txt(this, 0, 8, t(key), { size: 27, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 560 });
    const h = Math.max(110, tx.height + 66);
    c.add(glass(this, 620, h, { r: 24, color: 0x0e1a24, alpha: 0.86, rim: step === 'done' ? 0x7affa0 : 0xffd23f }));
    c.add(txt(this, 0, -h / 2 + 22, t('tutTitle') + '  ' + t('tutStep', { n }), { title: true, size: 18, color: '#ffd23f', strokeThickness: 0, shadow: false }));
    c.add(tx);
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tutCard = c;
    this.sfx('wave', { volume: 0.35, exact: true });
  }

  private tutNext(next: TutStep): void {
    this.sfx('clear', { volume: 0.5, exact: true });
    this.view.handle({ type: 'power', power: 'shield', x: this.sim.p.x, z: this.sim.p.z }, this.sim);
    this.tut = next;
    this.tutT = 0;
    const sim = this.sim;
    if (next === 'combo') sim.tutorialDummy();
    if (next === 'dodge') this.armTutTele();
    if (next === 'power') sim.tutorialPower();
    this.tutPrompt();
    if (next === 'done') this.time.delayedCall(1500, () => this.endTutorial(false));
  }

  private armTutTele(): void {
    const id = this.sim.tutorialTele();
    const T = this.sim.teles.find((x) => x.id === id)!;
    this.tutTele = { x: T.x, z: T.z, r: T.r, id };
  }

  private updateTutorial(dt: number): void {
    const sim = this.sim, p = sim.p;
    if (sim.phase !== 'tutorial') { this.closeTutorialUi(); this.tut = null; return; }
    this.tutT += dt;
    switch (this.tut) {
      case 'move':
        if (this.tutAt) this.tutMoved += Math.min(2, Math.hypot(p.x - this.tutAt.x, p.z - this.tutAt.z));
        this.tutAt = { x: p.x, z: p.z };
        if (this.tutMoved > 3) this.tutNext('combo');
        break;
      case 'combo': {
        const dummy = sim.foes.find((f) => f.passive);
        if (!dummy || dummy.state === 'dead') this.tutNext('dodge');
        break;
      }
      case 'dodge': {
        const T = this.tutTele;
        if (T && !sim.teles.some((x) => x.id === T.id)) {
          const out = Math.hypot(p.x - T.x, p.z - T.z) > T.r + 0.1;
          if (out) { this.tutTele = null; this.tutNext('power'); }
          else { this.floatAt(p.x, p.z, t('tut_dodge_' + (this.touch ? 'touch' : 'keys')).split('!')[0] + '!', '#ff8a6a', 24); this.armTutTele(); }
        }
        break;
      }
      case 'power':
        if (p.powers.rum > 0) this.tutNext('done');
        else if (!sim.loot.some((l) => l.kind === 'power') && this.tutT > 1) sim.tutorialPower();
        break;
    }
  }

  private closeTutorialUi(): void {
    if (this.tutCard) { const c = this.tutCard; this.tweens.add({ targets: c, alpha: 0, duration: 250, onComplete: () => c.destroy() }); }
    this.tutCard = null;
    this.tutSkip?.destroy();
    this.tutSkip = null;
  }

  private endTutorial(skipped: boolean): void {
    if (!this.tut) return;
    this.tut = null;
    this.closeTutorialUi();
    this.sim.endTutorial();
    const m = loadMeta();
    m.tutorial = true;
    saveMeta(m);
    this.meta.tutorial = true;
    if (skipped) this.sfx('move', { volume: 0.4, exact: true });
    this.islandBanner(0);
  }

  // ------------------------------------------------------------------ hints

  /** A first-run hint (each shown once per player). */
  private hint(key: string): void {
    if (this.isOver || this.bot || this.quiet || this.tut) return;
    if (this.meta.hints.includes(key)) return;
    this.meta.hints.push(key);
    const m = loadMeta();
    if (!m.hints.includes(key)) { m.hints.push(key); saveMeta(m); }
    this.hintBox?.destroy();
    const { width } = this.scale;
    const c = this.add.container(width / 2, 800).setScrollFactor(0).setDepth(9400).setAlpha(0);
    const tx = txt(this, 0, 0, t(key), { size: 25, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 600 });
    const bg = this.add.graphics().fillStyle(0x0b1620, 0.78).fillRoundedRect(-tx.width / 2 - 24, -tx.height / 2 - 16, tx.width + 48, tx.height + 32, 22)
      .lineStyle(2, 0xffd27a, 0.6).strokeRoundedRect(-tx.width / 2 - 24, -tx.height / 2 - 16, tx.width + 48, tx.height + 32, 22);
    c.add([bg, tx]);
    this.hintBox = c;
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
    this.tweens.add({ targets: c, alpha: 0, delay: 3800, duration: 500, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ numbers and text

  private dmgNumber(x: number, z: number, n: number, crit: boolean, color?: string): void {
    if (this.dmg.length > 16) return;
    const s = this.sx(x, z, 1.6);
    if (s.x < -20 || s.x > this.scale.width + 20 || s.y < 0 || s.y > this.scale.height) return;
    const tx = this.dmgPool.pop() ?? txt(this, 0, 0, '', { title: true, size: 24, strokeThickness: 5 }).setScrollFactor(0).setDepth(6000);
    tx.setText(String(Math.round(n))).setColor(color ?? (crit ? '#ffe04a' : '#ffffff')).setFontSize(crit ? 34 : 24).setVisible(true).setAlpha(1).setScale(crit ? 1.3 : 1);
    const ox = (Math.random() - 0.5) * 30;
    tx.setPosition(s.x + ox, s.y);
    this.dmg.push({ t: tx, life: crit ? 0.8 : 0.6, x: s.x + ox, y: s.y });
  }

  private updateDmg(dt: number): void {
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.life -= dt;
      if (d.life <= 0) { d.t.setVisible(false); this.dmgPool.push(d.t); this.dmg.splice(i, 1); continue; }
      d.y -= dt * 80;
      d.t.setPosition(d.x, d.y).setAlpha(Math.min(1, d.life * 4));
      if (d.t.scale > 1) d.t.setScale(Math.max(1, d.t.scale - dt * 2));
    }
  }

  private floatAt(x: number, z: number, s: string, color: string, size = 26, sub = ''): void {
    const p = this.sx(x, z, 2);
    const c = this.add.container(p.x, p.y - 20).setScrollFactor(0).setDepth(9300).setScale(0.5);
    c.add(txt(this, 0, 0, s, { title: true, size, color, strokeThickness: 6 }));
    if (sub) c.add(txt(this, 0, size * 0.85, sub, { size: Math.round(size * 0.62), color: '#ffffff', strokeThickness: 4 }));
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: p.y - 90, alpha: 0, delay: 750, duration: 500, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private bankDoubloons(): void {
    if (this.banked) return;
    this.banked = true;
    const sim = this.sim;
    const m = loadMeta();
    this.earned = sim.doubloons;
    const r = bankRun(m, { doubloons: this.earned, islands: sim.islandsCleared, kraken: sim.krakenDown });
    this.freedBarb = r.freedBarbarossa;
    saveMeta(m);
    this.meta = m;
  }

  /** The voyage's summary: how far, how many, who did it, what was earned. */
  private showSummary(): void {
    if (this.summaryBox) return;
    const sim = this.sim;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 560).setScrollFactor(0).setDepth(9500);
    this.summaryBox = c;
    c.add(glass(this, 620, 380, { r: 28, color: 0x0e1a24, alpha: 0.94, rim: 0xff7a6a }));
    c.add(txt(this, 0, -138, t('defeated'), { title: true, size: 46, color: '#ff8a6a', strokeThickness: 8 }));
    c.add(txt(this, 0, -76, t('runStats', { i: sim.islandsCleared, k: sim.kills, g: sim.goldEarned }), { size: 24, color: '#e6eef4', strokeThickness: 0 }));
    const who = sim.cause;
    if (who) c.add(txt(this, 0, -38, t('fallenTo', { who: t('f_' + who) }), { size: 22, color: '#ffb0a0', strokeThickness: 0 }));
    const coin = this.add.image(-120, 30, DOUBLOON).setDisplaySize(54, 54);
    const earned = txt(this, 14, 30, t('doubloonsEarned', { n: 0 }), { title: true, size: 34, color: '#ffe68a', strokeThickness: 6 });
    c.add([coin, earned]);
    c.add(txt(this, 0, 86, t('purse', { n: this.meta.doubloons }) + (this.mode === 'easy' ? '  ·  ' + t('easyHalf') : ''), { size: 20, color: '#cfd8e0', strokeThickness: 0 }));
    if (this.freedBarb) c.add(txt(this, 0, 132, t('barbFreed'), { title: true, size: 24, color: '#7affa0', strokeThickness: 5 }));
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.addCounter({ from: 0, to: this.earned, duration: 900, delay: 350, onUpdate: (tw) => earned.setText(t('doubloonsEarned', { n: Math.round(tw.getValue() ?? 0) })), onComplete: () => { if (this.earned > 0) this.sfx('bag', { volume: 0.6 }); } });
    this.tweens.add({ targets: coin, angle: 360, duration: 1400, delay: 350 });
  }

  private finish(): void {
    this.ended = true;
    const box = this.summaryBox;
    const go = () => this.endGame({ win: false, title: t('defeated'), delay: 0 });
    if (box) this.time.delayedCall(1700, () => this.tweens.add({ targets: box, alpha: 0, scale: 0.9, duration: 260, onComplete: go }));
    else go();
  }

  endGame(o: Parameters<ArcadeScene['endGame']>[0] = {}): void {
    if (!this.isOver) this.bankDoubloons();
    this.shop?.destroy(); this.shop = null;
    this.draft?.destroy(); this.draft = null;
    super.endGame(o);
  }

  // ------------------------------------------------------------------ test hooks

  private forced: { inp: Partial<Input>; t: number } | null = null;
  /** Test hook: plays this input for `seconds` of game time (then the player or the bot again). */
  testInput(inp: Partial<Input>, seconds: number): void { this.forced = { inp, t: seconds }; }
  /** The autopilot plays (store art, screenshots). */
  testAuto(on: boolean, skill: 'good' | 'casual' = 'good'): void { this.bot = on ? new Bot(this.sim, SKILL[skill], 3) : null; }
  testSkipTutorial(): void { if (this.tut) this.endTutorial(true); }
  testIsland(k: number, gold = 0): void { this.testSkipTutorial(); this.sim.testIsland(k, gold); }
  testLastWave(): void { this.testSkipTutorial(); this.sim.testLastWave(); }
  testClear(): void { this.testSkipTutorial(); this.sim.testClear(); }
  testFoes(kind: FoeKind, n: number, near = 5): void { this.sim.testFoes(kind, n, near); }
  testPower(id: PowerId): void { this.sim.takePower(id, this.sim.p.x, this.sim.p.z); for (const ev of this.sim.events) this.onEvent(ev); this.sim.events.length = 0; }
  testDrop(id: PowerId, dx = 1.5, dz = -1): void { this.sim.dropPower(id, this.sim.p.x + dx, this.sim.p.z + dz); }
  testSpecial(full = true): void { this.sim.p.special = full ? this.sim.maxSpecial : PLAYER.pip; }
  testShopBuy(id: ShopId | 'patch'): void { this.shop?.testBuy(id); }
  testPick(i: number): void { this.draft?.pick(i); }
  testSail(): void { if (this.shop) (this.shop as unknown as { leave(): void }).leave(); }
  testTele(kind: 'circle' | 'cone' | 'line'): void { const p = this.sim.p; this.sim.testTele(kind, p.x, p.z - 0.5); }
  testSnap(): void { this.view.snap(this.sim); }
  /** Test hook: scene timers and tweens run k times faster (slow software rendering). */
  testTimeScale(k: number): void { this.time.timeScale = k; this.tweens.timeScale = k; }
  testClean(): void { for (const o of [...this.children.list]) if ((o as Phaser.GameObjects.Container).depth === 9400) o.destroy(); this.hintBox?.destroy(); }
  testHint(key: string): void { this.meta.hints = this.meta.hints.filter((h) => h !== key); this.hint(key); }
  get tutorialStep(): TutStep | null { return this.tut; }
  /** Steps the simulation by seconds of game time at once (the renderer may be slow). */
  testStep(seconds: number): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      if (this.shop || this.draft) break;
      this.sim.step(STEP, this.sim.p.state === 'dead' ? NO_INPUT : this.readInput(STEP));
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    }
    this.hitStop = 0;
    this.bossHold = 0;
  }
}
