// Skull Isle: the Play scene. Runs the simulation (sim.ts) at a fixed 60 Hz, draws it in 3D
// (view.ts) under a Phaser HUD, reads the stick, the action buttons and the keys, plays the sounds,
// banners, hit-stop and damage numbers, runs the short first-run training, opens the dock shop,
// the boon draft and the sea chart between islands, sails the voyages (the same buttons fire the
// broadsides and evade; the HUD shows the hull and the way to the island), shows the first-voyage
// card and the swimming hints, and banks the run's doubloons at the end.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, hudChip, HudChip, flash, shake,
  HUD_MARGIN, HUD_ROW_Y, HUD_ROW2_Y, HUD_GAP, hudRightEdge, themeCard, themeLabel, themeText, overlayHeadingStyle,
  labelAt, labelTexture, fitWidth, GlyphText, showKeyHelp, type LabelStyle, type KeyHelpHint,
} from '@core';
import { SUMMARY_W, SUMMARY_H } from './menu';
import { INK } from './chart';
import type { World3D } from '@core/three';
import { Sim, NO_INPUT, type Input, type SimEvent } from './sim';
import {
  DT, PLAYER, FISH_HEAL, POWER_COLOR, TIMED_POWERS, SEA_POWERS, SEA_POWER_COLOR, islandOf,
  type Mode, type PowerId, type FoeKind, type HeroId, type TimedPower, type SeaPower, type Route, type SeaKind, type FloatKind,
} from './defs';
import { View } from './view';
import { shorePoint } from './island';
import { Bot, SKILL } from './bot';
import { loadMeta, saveMeta, bankRun, type Meta } from './meta';
import { makeArt, GOLD, powerArt, seaPowerArt, DOUBLOON, SHIP } from './art';
import { HpBar, PowerChips, BossBar, ProgressChip, SailLever, SailChip, banner, bossIntro, calloutStyle, SUB_STYLE, FLOAT_PX, actionButton, drawButton, showButton, relabel, glass, Pill, type ActionButton } from './ui';
import { ShopOverlay, DraftOverlay, RouteOverlay, type OverlayHost } from './shop';
import type { ShopId, BoonId, ShipId } from './upgrades';

const STEP = DT;
/** The training card's width. */
const TUT_W = 560;
// 1.3: landscape (1280 × 720). The HUD runs in rows along the top (the core's score, level and
// pause; health or hull and gold, the wave or the sails and the combo; the power-ups), the
// keyboard's special and keg chips sit in the bottom-right corner; on touch the stick floats on the
// left half and ATTACK, DODGE, SPECIAL and KEG make an arc round the right thumb, sized for 720 × 405
// and 844 × 390 phones.
const BOTTOM_Y = 672;
/** The second and third HUD rows (a little lower than the core's row 2: the HP chip is taller). */
const ROW2_Y = HUD_ROW2_Y + 6;
const ROW3_Y = ROW2_Y + 68;
/** Where the core's A and B buttons (ATTACK, DODGE) sit on touch screens. */
const BTN_A: [number, number] = [1150, 594];
const BTN_B: [number, number] = [982, 642];
const BTN_SPECIAL: [number, number] = [1004, 484];
const BTN_KEG: [number, number] = [1148, 414];
/** The touch sail lever at sea: up the right edge, above FIRE (SPECIAL and KEG are away at sea). */
const SAIL_LEVER: [number, number] = [1192, 330];
/** Banners: between the HUD rows and the hero (who stands a little above the screen's middle). */
const BANNER_Y = 236;

interface DmgText { t: GlyphText; color: string; base: number; life: number; x: number; y: number }

/** The damage numbers' colours (each its own glyph atlas): plain, critical, the hero's and the ship's hurt, burning. */
const DMG_PLAIN = '#ffffff', DMG_CRIT = '#ffe04a';
const DMG_COLORS = [DMG_PLAIN, DMG_CRIT, '#ff6a5a', '#ffb04a'];
/** The training cards' headings: the theme's face, gilded (the sea card in sea blue). */
const TUT_HEAD: LabelStyle = calloutStyle('#ffd23f', 30);
const SEA_HEAD: LabelStyle = calloutStyle('#9fe8ff', 40);

/**
 * The fixed callouts in their colours and kinds (`say` banners at ui.ts TITLE_PX, `floatAt` at FLOAT_PX),
 * painted ahead (Boot, under the intro; again in create after a language change) so a raid
 * paints nothing new when they first show.
 */
const BANNER_WORDS: Array<[string, string]> = [
  ['barrage', '#ffc23a'], ['islandClear', '#ffd23f'], ['krakenHead', '#ff9ad0'], ['captainLands', '#ffb04a'], ['captainRage', '#ff5a7a'],
  ['secondWindOn', '#ffd27a'], ['landHo', '#ffe6a0'], ['sunk', '#ff8a6a'], ['isletFound', '#ffd23f'],
  ['r_calm', '#9fe8ff'], ['r_storm', '#c8d4e8'],
];
const FLOAT_WORDS: Array<[string, string]> = [['lowHp', '#ff7a6a'], ['blocked', '#7fe8ff'], ['chestOpen', '#ffd23f'], ['rockHit', '#ffb08a'], ['current', '#9fe8ff']];

/** Paints the Play scene's callouts ahead (main.ts under the intro, and each create: cached by text). */
export function prebakePlay(scene: Phaser.Scene): void {
  const has = (k: string) => t(k) !== k;
  for (const [k, c] of BANNER_WORDS) if (has(k)) labelTexture(scene, t(k), calloutStyle(c));
  for (const [k, c] of FLOAT_WORDS) if (has(k)) labelTexture(scene, t(k), calloutStyle(c, FLOAT_PX));
  for (let n = 1; n <= 8; n++) {
    labelTexture(scene, t('islandN', { n }), calloutStyle('#ffe6a0'));
    labelTexture(scene, t('waveN', { n }), calloutStyle('#ffe6c0'));
  }
  for (let n = 1; n <= 4; n++) labelTexture(scene, t('tutTitle') + '  ' + t('tutStep', { n }), TUT_HEAD);
  labelTexture(scene, t('seaTutTitle'), SEA_HEAD);
  for (const c of DMG_COLORS) new GlyphText(scene, 0, 0, '', calloutStyle(c, FLOAT_PX), 0.5, '0123456789').destroy();
}
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
  private hullBar!: HpBar;
  private progress!: ProgressChip;
  private sailLever: SailLever | null = null;
  private sailChip!: SailChip;
  private powerChips!: PowerChips<TimedPower>;
  private seaChips!: PowerChips<SeaPower>;
  private bossBar!: BossBar;
  private seaHud = false;
  private route: RouteOverlay | null = null;
  private seaCard: Phaser.GameObjects.Container | null = null;
  private seaCardT = 0;
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
  /** 1.3: arrows at the screen's edge towards foes out of sight (red and pulsing while they wind up). */
  private threats!: Phaser.GameObjects.Graphics;
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
  private dmgPool: DmgText[] = [];
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
  /** The first-time keys along the bottom (desktop, once): the first island goes on under them. */
  private keyHint: KeyHelpHint | null = null;
  private calloutBox: Phaser.GameObjects.Container | null = null;
  private bannerBox: Phaser.GameObjects.Container | null = null;
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
    this.summaryBox = null; this.shop = null; this.draft = null; this.route = null; this.seaCard = null; this.seaCardT = 0; this.seaHud = false;
    this.specialWasReady = false;
    this.tut = null; this.tutCard = null; this.tutSkip = null; this.tutMoved = 0; this.tutAt = null; this.tutTele = null; this.tutT = 0; this.hintBox = null; this.calloutBox = null; this.bannerBox = null;
    this.keyHint = null;
    this.quiet = false; this.testSpeed = 1; this.god = false; this.frozen = false; this.pending = 0;
    this.firstFrames = []; this.frameStart = 0;
    this.btnAttack = this.btnDodge = this.btnSpecial = this.btnKeg = null;
    this.sailLever = null; this.sailStep = 0;
    this.specialChip = this.kegChip = null; this.specialPips = null;
    makeArt(this);
    prebakePlay(this);

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
    this.threats = this.add.graphics().setDepth(70).setScrollFactor(0);
    this.fade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x02060a, 1).setOrigin(0).setScrollFactor(0).setDepth(9300);
    this.tweens.add({ targets: this.fade, alpha: 0, duration: 500 });

    // a run left through the pause menu still banks what it earned
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (!this.banked && this.sim.islandsCleared > 0) this.bankDoubloons();
      this.view.dispose();
    });
    if (training) this.startTutorial();
    else { this.islandBanner(0); this.openKeyHint(); }
  }

  /**
   * Desktop, once: the keys and what they do along the bottom when the fighting starts (at once, or
   * after the training, whose cards sit low in the middle), lifted over the keyboard's special and
   * keg chips in the bottom-right corner.
   */
  private openKeyHint(): void {
    if (this.isOver || this.bot || this.tut) return;
    this.keyHint = showKeyHelp(this, { bottom: this.scale.height - BOTTOM_Y + 40 });
  }

  /** The first-time keys never stay over the shop, the route, the draft, the sea card or the summary. */
  private closeKeyHint(): void { this.keyHint?.close(); this.keyHint = null; }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    this.touch = this.sys.game.device.input.touch;
    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'], buttonPos: { A: BTN_A, B: BTN_B }, buttonScale: 1.15 });
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
      this.btnAttack = actionButton(this, BTN_A[0], BTN_A[1], 84, t('btnAttack'), false, { size: 23 });
      this.btnDodge = actionButton(this, BTN_B[0], BTN_B[1], 62, t('btnDodge'), false, { size: 19 });
      this.btnSpecial = actionButton(this, BTN_SPECIAL[0], BTN_SPECIAL[1], 56, t('btnSpecial'), true, { size: 19 });
      this.btnKeg = actionButton(this, BTN_KEG[0], BTN_KEG[1], 48, t('btnKeg'), true, { badge: true, size: 17 });
    }
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      for (const [n, c] of Object.entries({ j: K.J, k: K.K, l: K.L, e: K.E, q: K.Q, w: K.W, s: K.S, up: K.UP, down: K.DOWN })) this.keys[n] = kb.addKey(c, false, false);
      kb.on('keydown', (e: KeyboardEvent) => {
        if (this.seaCard && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Escape' || e.code === 'KeyQ')) { this.closeSeaCard(); return; }
        if (this.route?.key(e.code)) return;
        if (this.draft?.key(e.code)) return;
        if (this.shop?.key(e.code)) { if (e.code === 'Tab') e.preventDefault(); return; }
        if (e.code === 'KeyQ' && this.tut) this.endTutorial(true);
      });
    }
  }

  private atkRepeat = 0;
  private gunN = 0;
  /** Sail steps from the touch lever, read with the next input. */
  private sailStep = 0;

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
    // at sea W/S and the arrows (or the touch lever) step the sails; the stick only steers
    let sail = 0;
    if (this.sim.atSea) {
      // the lever's steps reach the ship one a frame
      const lever = Math.sign(this.sailStep);
      this.sailStep -= lever;
      sail = lever + (jd('w') || jd('up') ? 1 : 0) - (jd('s') || jd('down') ? 1 : 0);
    }
    return { mx: c.axisX, mz: this.sim.atSea ? 0 : c.axisY, attack, dodge: c.justB() || jd('k'), special, item, sail };
  }

  // ------------------------------------------------------------------ HUD

  private setupHud(): void {
    const { width } = this.scale;
    this.hud.setLevel(1);
    // row 2: health (the hull at sea) and gold on the left, the wave in the middle, the combo (the
    // sails at sea) on the right; row 3: the power-ups. The boss bar and, at sea, the way to the
    // island take the level badge's place on the top row.
    this.hp = new HpBar(this, HUD_MARGIN, ROW2_Y);
    this.hullBar = new HpBar(this, HUD_MARGIN, ROW2_Y, 'hull');
    this.hullBar.chip.setVisible(false);
    this.goldChip = hudChip(this, this.hp.chip.right + HUD_GAP, ROW2_Y, { icon: GOLD, iconSize: 30, text: '0', color: '#ffe68a', minWidth: 96 });
    this.waveChip = hudChip(this, width / 2, ROW2_Y, { align: 'center', text: '', size: 22, minWidth: 120 });
    this.comboChip = hudChip(this, width - HUD_MARGIN, ROW2_Y, { align: 'right', text: '', size: 24, color: '#ffd25a' });
    this.comboChip.setVisible(false);
    this.powerChips = new PowerChips<TimedPower>(this, HUD_MARGIN, ROW3_Y, TIMED_POWERS, (id) => powerArt(id), (id) => POWER_COLOR[id]);
    this.seaChips = new PowerChips<SeaPower>(this, HUD_MARGIN, ROW3_Y, SEA_POWERS, (id) => seaPowerArt(id), (id) => SEA_POWER_COLOR[id]);
    this.bossBar = new BossBar(this, width / 2, HUD_ROW_Y);
    this.progress = new ProgressChip(this, width / 2, HUD_ROW_Y);
    this.sailChip = new SailChip(this, width - HUD_MARGIN, ROW2_Y);
    if (this.touch) this.sailLever = new SailLever(this, SAIL_LEVER[0], SAIL_LEVER[1], (d) => { this.sailStep += d; });
    if (!this.touch) {
      // keyboard players read the special meter and the kegs in chips by the corner
      this.specialPips = this.add.graphics();
      this.specialPips.setData('chipWidth', 96);
      this.specialChip = hudChip(this, width - HUD_MARGIN, BOTTOM_Y, { align: 'right', text: 'L', size: 22, color: '#ffd23f', items: [this.specialPips], height: 56 });
      this.kegChip = hudChip(this, this.specialChip.left - HUD_GAP, BOTTOM_Y, { align: 'right', icon: powerArt('keg'), iconSize: 40, text: 'E ×0', size: 22, height: 56 });
    }
    void hudRightEdge;
  }

  /** Swaps the HUD between the island (HP, wave, combo, special and keg) and the sea (hull, voyage, broadsides). */
  private switchHud(sea: boolean): void {
    this.seaHud = sea;
    this.hp.chip.setVisible(!sea);
    this.hullBar.chip.setVisible(sea);
    this.waveChip.setVisible(!sea);
    if (sea) { this.comboChip.setVisible(false); this.shown.combo = -1; this.progress.show(t('i_' + islandOf(this.sim.voyage?.dest ?? this.sim.k + 1).id)); }
    else this.progress.hide();
    this.hud.levelChip.setVisible(!sea);
    this.powerChips.clear();
    this.seaChips.clear();
    this.bossBar.hide();
    if (this.btnAttack) relabel(this.btnAttack, t(sea ? 'btnFire' : 'btnAttack'));
    if (this.btnDodge) relabel(this.btnDodge, t(sea ? 'btnEvade' : 'btnDodge'));
    if (this.btnSpecial) showButton(this.btnSpecial, !sea);
    if (this.btnKeg) showButton(this.btnKeg, !sea);
    this.sailLever?.show(sea);
    this.sailChip.show(sea);
    if (this.kegChip) this.kegChip.setVisible(!sea);
    if (this.specialChip) this.specialChip.setText(sea ? 'J' : 'L');
    this.shown.kegs = -1;
  }

  private updateHud(dt: number): void {
    const sim = this.sim, p = sim.p;
    const v = sim.voyage;
    const sea = !!v && sim.atSea;
    if (sea !== this.seaHud) this.switchHud(sea);
    if (this.score !== sim.score) this.setScore(sim.score);
    if (this.shown.island !== sim.k) { this.shown.island = sim.k; this.hud.setLevel(sim.k + 1); }
    if (sim.gold !== this.shown.gold) {
      if (this.shown.gold >= 0 && sim.gold > this.shown.gold) this.tweens.add({ targets: this.goldChip, scale: 1.12, duration: 70, yoyo: true });
      this.shown.gold = sim.gold;
      this.goldChip.setText(String(sim.gold));
    }
    if (sea) { this.threats.clear(); this.updateSeaHud(dt); return; }
    this.drawThreats();
    const waveText = sim.phase === 'tutorial' ? t('tutTitle') : sim.phase === 'wreck' ? t('i_' + sim.L.id) : sim.bossActive ? t('bossWave') : t('wave', { n: Math.max(1, sim.wave), of: sim.waves });
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
    this.hud.levelChip.setVisible(!this.bossBar.chip.visible);
    // special meter and kegs (dimmed while swimming: no attacks in deep water)
    const pip = PLAYER.pip, pips = sim.st.pips;
    const seg = Array.from({ length: pips }, (_, i) => Math.max(0, Math.min(1, (p.special - i * pip) / pip)));
    const ready = p.special >= pip;
    const wet = p.swim;
    if (this.btnAttack) drawButton(this.btnAttack, 0xe2553f, { held: this.controls.a, dim: wet });
    if (this.btnDodge) drawButton(this.btnDodge, 0x3aa8d8, { held: this.controls.b, ring: [Math.max(0, 1 - p.dodgeCd / sim.st.dodgeCd)], dim: p.dodgeCd > 0 || wet });
    if (this.btnSpecial) drawButton(this.btnSpecial, 0xd89a1a, { ring: seg, ready: ready && !wet, dim: !ready || wet, time: this.elapsed, held: this.btnSpecial.down });
    if (this.btnKeg) {
      drawButton(this.btnKeg, 0x8a5a34, { dim: p.kegs <= 0 || wet, held: this.btnKeg.down });
      if (this.shown.kegs !== p.kegs) { this.btnKeg.badge!.setText(p.kegs > 0 ? String(p.kegs) : ''); }
    }
    if (this.specialPips) this.drawPips(seg, ready);
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
    // the hidden islet: a hint once the gulls are in sight
    const isl = sim.L.islet;
    if (isl && (sim.phase === 'fight' || sim.phase === 'breather') && Math.hypot(p.x - isl.x, p.z - isl.z) < 13 && sim.chests.some((c) => c.islet && !c.open)) this.hint('hintIslet');
    // low health: a red, throbbing edge
    const low = p.state !== 'dead' && p.hp < sim.st.maxHp * 0.3;
    if (low && !this.lowWarned) { this.lowWarned = true; this.floatAt(p.x, p.z, t('lowHp'), '#ff7a6a', 28); }
    if (p.hp > sim.st.maxHp * 0.5) this.lowWarned = false;
    this.edge(dt, low);
  }

  /**
   * The wide view is shallower than the portrait one was: a foe out of sight above or below (or
   * past a side) gets a small arrow on the screen's edge pointing at it, inside the room left by the
   * HUD rows and the thumbs; red and pulsing while it winds up an attack.
   */
  private drawThreats(): void {
    const g = this.threats.clear();
    const sim = this.sim, p = sim.p;
    if (sim.p.state === 'dead' || sim.phase === 'tutorial') return;
    const { width: W, height: H } = this.scale;
    const x0 = 34, x1 = W - 34, y0 = ROW2_Y + 50, y1 = H - 30;
    const cx = W / 2, cy = (y0 + y1) / 2;
    let n = 0;
    const winding = new Set<number>();
    for (const T of sim.teles) if (!T.friendly) winding.add(T.owner);
    for (const f of sim.foes) {
      if (n >= 6) break;
      if (f.state === 'dead' || f.passive || f.kind === 'head' || f.kind === 'arm') continue;
      if (Math.hypot(f.x - p.x, f.z - p.z) > 17) continue;
      const s = this.sx(f.x, f.z, 0.8);
      if (s.x > 0 && s.x < W && s.y > ROW3_Y + 20 && s.y < H) continue;
      // where the line from the middle to the foe leaves the room
      const dx = s.x - cx, dy = s.y - cy;
      const k = Math.min(dx ? Math.abs((dx > 0 ? x1 - cx : cx - x0) / dx) : 1e9, dy ? Math.abs((dy > 0 ? y1 - cy : cy - y0) / dy) : 1e9);
      const ax = cx + dx * k, ay = cy + dy * k, a = Math.atan2(dy, dx);
      const warn = winding.has(f.id);
      const pulse = warn ? 0.65 + 0.35 * Math.sin(this.elapsed * 14) : 0.75;
      const col = warn ? 0xff4a3a : 0xffd27a, r = warn ? 18 : 14;
      // a notched arrowhead pointing at the foe
      const at = (d: number, side: number) => new Phaser.Math.Vector2(ax + Math.cos(a) * d - Math.sin(a) * side, ay + Math.sin(a) * d + Math.cos(a) * side);
      const pts = [at(r * 1.15, 0), at(-r * 0.75, r * 0.8), at(-r * 0.3, 0), at(-r * 0.75, -r * 0.8)];
      g.fillStyle(0x000000, 0.3 * pulse).fillCircle(ax, ay + 2, r + 6);
      g.fillStyle(col, pulse).fillPoints(pts, true);
      g.lineStyle(2.5, 0x2a1206, 0.85 * pulse).strokePoints(pts, true);
      n++;
    }
  }

  private drawPips(seg: number[], ready: boolean): void {
    const g = this.specialPips!.clear();
    const n = seg.length;
    const w0 = (96 - (n - 1) * 6) / n;
    seg.forEach((k, i) => {
      g.fillStyle(0x060914, 0.75).fillRoundedRect(-48 + i * (w0 + 6), -9, w0, 18, 8);
      if (k > 0) g.fillStyle(k >= 1 ? 0xffd23f : 0xbfc8d8, 1).fillRoundedRect(-48 + i * (w0 + 6), -9, Math.max(10, w0 * k), 18, 8);
    });
    if (ready) g.lineStyle(2, 0xffd23f, 0.5 + Math.sin(this.elapsed * 8) * 0.4).strokeRoundedRect(-51, -12, 102, 24, 10);
  }

  /** The red edge: a hit, low health, a hull close to sinking. */
  private edge(dt: number, low: boolean): void {
    this.redT = Math.max(0, this.redT - dt * 1.6);
    const beat = low ? Math.pow(Math.max(0, Math.sin(this.elapsed * Math.PI * 2.2)), 6) : 0;
    const a = Math.max(this.redT, low ? 0.28 + beat * 0.35 : 0);
    const g = this.vignette.clear();
    if (a > 0.01) {
      const { width: W, height: H } = this.scale;
      for (let i = 0; i < 12; i++) { const d = i * 15; g.lineStyle(17, 0xff2020, a * Math.pow(1 - i / 12, 1.6) * 0.75).strokeRect(d, d, W - d * 2, H - d * 2); }
    }
  }

  /** At sea: the hull, the way to the island, the sea's power-ups, the ghost ship, the broadsides' reload. */
  private updateSeaHud(dt: number): void {
    const sim = this.sim, v = sim.voyage!, s = v.ship;
    this.progress.update(v.progress, v.storm, this.elapsed);
    this.hullBar.update(s.hull, sim.shipSt.maxHull, dt, this.elapsed);
    this.seaChips.update(v.powers, { shieldHits: 0 }, this.elapsed);
    this.sailChip.update(s.sail, s.speed, this.elapsed);
    this.sailLever?.update(s.sail, this.elapsed);
    const ghost = v.foes.find((f) => f.kind === 'ghost' && f.state !== 'dead' && f.state !== 'gone');
    if (ghost) {
      this.bossBar.show(t('b_ghost'));
      this.bossBar.update(Math.max(0, ghost.hp / ghost.maxHp), ghost.state === 'rise', false, dt, this.elapsed);
    } else this.bossBar.hide();
    // the ghost ship's bar takes the way to the island's place while it fights
    if (this.bossBar.chip.visible === this.progress.chip.visible) this.progress.chip.setVisible(!this.bossBar.chip.visible);
    this.hud.levelChip.setVisible(false);
    const max = sim.shipSt.reload;
    const seg = [0, 1].map((i) => Math.max(0, Math.min(1, 1 - s.reload[i] / max)));
    const ready = !!v.aim && s.reload[v.aim.side] <= 0;
    if (this.btnAttack) drawButton(this.btnAttack, 0xe2553f, { held: this.controls.a, ring: seg, ready, time: this.elapsed });
    if (this.btnDodge) drawButton(this.btnDodge, 0x3aa8d8, { held: this.controls.b, ring: [Math.max(0, 1 - s.evadeCd / 2.2)], dim: s.evadeCd > 0 });
    if (this.specialPips) this.drawPips(seg, ready);
    const low = !s.sunk && s.hull < sim.shipSt.maxHull * 0.3;
    if (low && !this.lowWarned) { this.lowWarned = true; this.sfx('alarm', { volume: 0.3, exact: true }); }
    if (s.hull > sim.shipSt.maxHull * 0.5) this.lowWarned = false;
    this.edge(dt, low);
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
    if (this.shop || this.draft || this.route || this.seaCard) k = 0;
    if (this.seaCard) { this.seaCardT += dt; if (this.seaCardT > 9) this.closeSeaCard(); }
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
      if (this.bot && sim.phase === 'chart' && !this.route) { sim.pickRoute(this.bot.route()); for (const ev of sim.events) this.onEvent(ev); sim.events.length = 0; }
      if (this.god && sim.voyage) sim.voyage.ship.invuln = Math.max(sim.voyage.ship.invuln, 0.1);
      if (this.hitStop > 0 || this.bossHold > 0 || this.shop || this.draft || this.route || this.seaCard) { this.acc = 0; break; }
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
        if (ev.which === 'barrage') { this.sfx('horn', { volume: 0.6 }); this.say(BANNER_Y, t('barrage'), '', { color: '#ffc23a', size: 44, hold: 0.8 }); }
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
        this.callout(name, sub, '#' + POWER_COLOR[ev.power].toString(16).padStart(6, '0'));
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
          this.say(BANNER_Y, t('waveN', { n: ev.n }), '', { color: '#ffe6c0', size: 44, hold: 0.8 });
          this.sfx('wave', { volume: 0.45, exact: true });
        }
        break;
      case 'waveClear':
        this.sfx('clear', { volume: 0.4, exact: true });
        if (sim.chests.some((c) => !c.open)) this.time.delayedCall(600, () => this.hint('hintChest'));
        break;
      case 'cleared':
        this.sfx('fanfare', { volume: 0.7, exact: true });
        this.say(BANNER_Y + 20, t('islandClear'), t('bonus', { n: ev.bonus }), { color: '#ffd23f', size: 50, hold: 1.8 });
        flash(this, 0xfff0c0, 200, 0.3);
        break;
      case 'shop': this.openShop(); break;
      case 'draft': this.openDraft(ev.boons); break;
      case 'chart': this.openRoute(); break;
      case 'sail':
        this.sfx('sail', { volume: 0.6, exact: true });
        this.tweens.add({ targets: this.fade, alpha: 1, duration: 500 });
        break;
      case 'island':
        if (ev.k > 0) {
          // ashore: a quick dip to black while the ship goes to its anchorage
          this.tweens.killTweensOf(this.fade);
          this.fade.setAlpha(Math.max(this.fade.alpha, 0.75));
          this.tweens.add({ targets: this.fade, alpha: 0, duration: 450 });
          this.islandBanner(ev.k);
        }
        break;
      default: this.onSeaEvent(ev); break;
      case 'boss': {
        this.sfx('alarm', { volume: 0.55, exact: true });
        this.bossHold = 2;
        const at = ev.kind === 'kraken' ? sim.foes.find((f) => f.kind === 'head') : sim.foes.find((f) => f.kind === 'captain');
        if (at) this.view.focus(at.x, at.z + (ev.kind === 'kraken' ? 3 : 4), 2.3);
        this.view.zoomTarget = 1.18;
        this.time.delayedCall(300, () => { this.sfx('roar', { volume: 0.7 }); this.view.shake(0.4, 0.5); });
        this.bannerBox?.destroy(); bossIntro(this, t('b_' + ev.kind), t(ev.kind === 'kraken' ? 'bossKrakenSub' : 'bossCaptainSub'));
        break;
      }
      case 'bossPhase':
        if (ev.kind === 'kraken' && ev.phase === 2) { this.say(BANNER_Y + 10, t('krakenHead'), '', { color: '#ff9ad0', size: 42, hold: 1.4 }); this.sfx('roar', { volume: 0.6, rate: 1.2 }); }
        if (ev.kind === 'captain' && ev.phase === 2) { this.say(BANNER_Y + 10, t('captainLands'), '', { color: '#ffb04a', size: 42, hold: 1.2 }); this.sfx('roar', { volume: 0.6 }); }
        if (ev.kind === 'captain' && ev.phase === 3) { this.say(BANNER_Y + 10, t('captainRage'), '', { color: '#ff5a7a', size: 42, hold: 1.2 }); this.sfx('roar', { volume: 0.7, rate: 0.8 }); }
        break;
      case 'bossDown':
        this.slowT = 1.2;
        this.sfx('bossDie', { volume: 0.9 });
        flash(this, 0xffffff, 260, 0.5);
        this.view.zoomTarget = 1;
        this.time.delayedCall(800, () => {
          this.sfx('fanfare2', { volume: 0.7, exact: true });
          this.say(BANNER_Y, t('bossDown', { name: t('b_' + ev.kind) }), '', { color: '#ffd23f', hold: 1.6, size: 46 });
        });
        break;
      case 'secondWind':
        this.sfx('revive', { volume: 0.8 });
        flash(this, 0xfff0b0, 400, 0.6);
        this.say(BANNER_Y, t('secondWindOn'), '', { color: '#ffd27a', hold: 1.2 });
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
        else if (ev.kind !== 'shark' && ev.kind !== 'arm' && ev.kind !== 'head' && ev.kind !== 'captain' && ev.kind !== 'hunter') this.s('rise', 0.2, 0.2, this.sx(ev.x, ev.z).x);
        break;
    }
  }

  /** The voyage's and the water's events: sounds, banners and floating text. */
  private onSeaEvent(ev: SimEvent): void {
    const sim = this.sim, v = sim.voyage;
    const sxv = (x: number, z: number) => this.sx(x, z).x;
    switch (ev.type) {
      case 'seaStart': {
        this.tweens.killTweensOf(this.fade);
        this.tweens.add({ targets: this.fade, alpha: 0, duration: 600 });
        const name = t('i_' + islandOf(ev.dest).id);
        this.say(BANNER_Y, t('r_' + ev.route), t('sailing', { name }), { color: ev.route === 'storm' ? '#c8d4e8' : '#9fe8ff', size: 46, hold: 1.6 });
        this.sfx(ev.route === 'storm' ? 'thunder' : 'horn', { volume: 0.45, exact: true });
        this.lowWarned = false;
        if (!this.bot && !this.quiet && !this.meta.hints.includes('seaTut')) this.time.delayedCall(700, () => this.openSeaCard());
        break;
      }
      case 'broadside':
        // the guns themselves boom one after another ('gun')
        if (ev.fire) this.s('fuse', 0.3, 0.3);
        break;
      case 'gun':
        if (ev.kind === 'skull') break;
        if (ev.friendly) {
          this.gunN = (this.gunN + 1) % 3;
          this.sfxAt(['cannon2', 'cannon3', 'cannon'][this.gunN], this.scale.width / 2 + ev.side * 170, { volume: 0.55 });
          shake(this, 0.0035, 90);
        } else this.sfxAt('cannon', sxv(ev.x, ev.z), { volume: ev.kind === 'ghost' ? 0.42 : 0.34 });
        break;
      case 'evade': this.s('roll', 0.5, 0.1); this.s('splash', 0.4, 0.1); break;
      case 'seaFire':
        this.time.delayedCall(260, () => this.s('whistle', 0.25, 0.2));
        if (ev.kind === 'ghost') this.s('ghost', 0.25, 1);
        break;
      case 'seaBoom':
        if (ev.friendly) this.s('boom', 0.4, 0.05, sxv(ev.x, ev.z));
        else this.s('splash', 0.35, 0.06, sxv(ev.x, ev.z));
        break;
      case 'hullHit':
        this.sfx('hullHit', { volume: 0.75 });
        this.s('thud', 0.45, 0.1);
        this.redT = Math.max(this.redT, 0.45);
        shake(this, ev.dmg >= 12 ? 0.008 : 0.005, 160);
        if (v) this.dmgNumber(v.ship.x, v.ship.z, ev.dmg, false, '#ff6a5a');
        break;
      case 'seaHit':
        if (ev.src === 'ball' || Math.random() < 0.4) this.dmgNumber(ev.x, ev.z, ev.dmg, false, ev.src === 'burn' ? '#ffb04a' : undefined);
        if (ev.src === 'ball') this.s(ev.kind === 'tentacle' || ev.kind === 'shark' ? 'squish' : 'bones', 0.4, 0.06, sxv(ev.x, ev.z));
        break;
      case 'seaKill':
        if (ev.kind === 'sloop' || ev.kind === 'ghost') {
          this.sfxAt('bigBoom', sxv(ev.x, ev.z), { volume: 0.8 });
          this.time.delayedCall(260, () => this.s('splash', 0.6, 0.1));
          shake(this, 0.007, 220);
          if (ev.kind === 'ghost') {
            this.slowT = 1;
            this.time.delayedCall(500, () => { this.sfx('fanfare2', { volume: 0.7, exact: true }); this.say(BANNER_Y, t('bossDown', { name: t('b_ghost') }), '', { color: '#7affc0', hold: 1.4, size: 46 }); });
          }
        } else this.s(ev.kind === 'tentacle' ? 'squish' : 'splash', 0.55, 0.08, sxv(ev.x, ev.z));
        break;
      case 'ram': this.s('bones', 0.6, 0.1); break;
      case 'float': this.onFloat(ev.kind, ev.value, ev.repair ?? 0); break;
      case 'seaPower': {
        const k = ev.power;
        this.sfx('power', { volume: 0.55 });
        const extra: Record<SeaPower, string> = { wind: 'wind', chain: 'clang', mermaid: 'bling', fire: 'fireUp', spyglass: 'spy' };
        this.time.delayedCall(120, () => this.sfx(extra[k], { volume: 0.5 }));
        this.callout(t('sp_' + k), t('spd_' + k), '#' + SEA_POWER_COLOR[k].toString(16).padStart(6, '0'));
        this.flySea(k);
        break;
      }
      case 'seaExpire': this.sfx('expire', { volume: 0.3, exact: true }); break;
      case 'rockHit':
        this.sfx('rockHit', { volume: 0.8 });
        this.floatAt(ev.x, ev.z, t('rockHit'), '#ffb08a', 26);
        break;
      case 'gust': this.s('gust', 0.25, 2); break;
      case 'lightning':
        flash(this, 0xeef4ff, 140, 0.32);
        this.time.delayedCall(260, () => this.sfx('thunder', { volume: 0.4, rate: 0.7 }));
        break;
      case 'ghost':
        this.sfx('ghost', { volume: 0.7, exact: true });
        this.time.delayedCall(250, () => this.sfx('roar', { volume: 0.5, rate: 1.3 }));
        this.bannerBox?.destroy(); bossIntro(this, t('ghostShip'), t('ghostSub'));
        break;
      case 'seaSpawn':
        if (ev.kind === 'tentacle') this.s('splash', 0.5, 0.1);
        break;
      case 'dock':
        this.sfx('horn', { volume: 0.55, exact: true });
        if (v) this.say(BANNER_Y, t('landHo'), v.salvaged || v.sunkFoes ? t('seaHaul', { g: v.salvaged, n: v.sunkFoes }) : '', { color: '#ffe6a0', size: 48, hold: 1.4 });
        break;
      case 'jumpAshore': this.sfx('toss', { volume: 0.5 }); break;
      case 'sink':
        this.sfx('bossDie', { volume: 0.8 });
        this.time.delayedCall(300, () => this.sfx('splash', { volume: 0.8 }));
        flash(this, 0x2060a0, 400, 0.4);
        this.slowT = 1;
        this.say(BANNER_Y, t('sunk'), '', { color: '#ff8a6a', size: 52, hold: 1.6 });
        this.time.delayedCall(1300, () => this.tweens.add({ targets: this.fade, alpha: 1, duration: 600 }));
        break;
      case 'wreck':
        this.tweens.killTweensOf(this.fade);
        this.fade.setAlpha(1);
        this.tweens.add({ targets: this.fade, alpha: 0, duration: 600 });
        this.say(BANNER_Y, t('sunkSub', { n: ev.lost }), '', { color: '#bfe8ff', size: 38, hold: 1.6 });
        this.sfx('splash', { volume: 0.7 });
        break;
      case 'washed':
        this.sfx('gasp', { volume: 0.5 });
        if (ev.hp > 0) this.floatAt(sim.p.x, sim.p.z, t('washed', { n: ev.hp }), '#ffb0a0', 26);
        break;
      case 'swim':
        this.s('splash', ev.on ? 0.45 : 0.25, 0.3);
        if (ev.on) this.hint('hintSwim');
        break;
      case 'current':
        this.s('splash', 0.3, 1);
        this.floatAt(sim.p.x, sim.p.z, t('current'), '#9fe8ff', 24);
        break;
      case 'sails':
        this.sfx('sail', { volume: 0.45, rate: 0.8 + ev.level * 0.15 });
        this.s('gust', 0.25, 0.3);
        break;
      case 'islet':
        this.sfx('treasure', { volume: 0.7, exact: true });
        this.say(BANNER_Y, t('isletFound'), t('doubloonsEarned', { n: ev.n }), { color: '#ffd23f', size: 46, hold: 1.4 });
        break;
      default: break;
    }
  }

  private onFloat(kind: FloatKind, value: number, repair: number): void {
    const v = this.sim.voyage;
    if (!v) return;
    const s = v.ship;
    switch (kind) {
      case 'barrel': this.sfx('bag', { volume: 0.55 }); this.floatAt(s.x, s.z, t('fl_barrel', { n: value }), '#ffe68a', 28); break;
      case 'crate': this.sfx('repair', { volume: 0.6 }); this.floatAt(s.x, s.z, t('fl_crate', { n: repair }), '#7affa0', 28, t('fl_barrel', { n: value })); break;
      case 'chest': this.sfx('chest', { volume: 0.7 }); this.floatAt(s.x, s.z, t('fl_chest', { n: value }), '#ffd23f', 34); break;
      case 'bottle': this.sfx('card', { volume: 0.4 }); break;
    }
  }

  /** A sea power's icon flies from the ship to its HUD chip. */
  private flySea(id: SeaPower): void {
    const v = this.sim.voyage;
    if (!v) return;
    const p = this.sx(v.ship.x, v.ship.z, 2);
    const to = this.seaChips.slot(id);
    const img = this.add.image(p.x, p.y, seaPowerArt(id)).setDisplaySize(64, 64).setScrollFactor(0).setDepth(9350);
    this.tweens.add({ targets: img, x: to.x, y: to.y, displayWidth: 36, displayHeight: 36, duration: 520, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
  }

  private islandBanner(k: number): void {
    const isle = islandOf(k);
    const lap = Math.floor(k / 5);
    this.say(BANNER_Y, t('islandN', { n: k + 1 }), t('i_' + isle.id) + (lap > 0 ? '  ·  ' + t('lapN', { n: lap + 1 }) : ''), { color: '#ffe6a0', size: 52, hold: 1.25 });
    this.sfx('horn', { volume: 0.45, exact: true });
  }

  /** The pickup's icon flies from the hero to its HUD chip. */
  private flyIcon(id: PowerId): void {
    const p = this.sx(this.sim.p.x, this.sim.p.z, 1.4);
    const to = id === 'keg' ? (this.btnKeg ? { x: this.btnKeg.x, y: this.btnKeg.y } : this.kegChip ? { x: this.kegChip.x - this.kegChip.chipWidth / 2, y: BOTTOM_Y } : p)
      : id === 'fish' ? { x: HUD_MARGIN + 40, y: ROW2_Y } : this.powerChips.slot(id);
    const img = this.add.image(p.x, p.y, powerArt(id)).setDisplaySize(60, 60).setScrollFactor(0).setDepth(9350);
    this.tweens.add({ targets: img, x: to.x, y: to.y, displayWidth: 36, displayHeight: 36, duration: 520, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
  }

  // ------------------------------------------------------------------ between islands

  private overlayHost(): OverlayHost {
    return { sfx: (key, v) => this.sfx(key, { volume: v ?? 0.5, exact: true }), touch: this.touch };
  }

  private openShop(): void {
    this.closeKeyHint();
    if (this.shop || this.isOver) return;
    if (this.bot) return;
    this.shop = new ShopOverlay(this, this.sim, this.overlayHost(), () => {
      this.shop = null;
      this.sim.leaveShop();
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    });
  }

  private openRoute(): void {
    this.closeKeyHint();
    if (this.route || this.isOver || this.bot) return;
    this.sfx('card', { volume: 0.5, exact: true });
    this.route = new RouteOverlay(this, this.sim, this.overlayHost(), (r: Route) => {
      this.route = null;
      this.sim.pickRoute(r);
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    });
  }

  /** The first voyage's card: steer, fire, salvage (once per player; the sea waits while it shows). */
  private openSeaCard(): void {
    this.closeKeyHint();
    if (this.seaCard || this.isOver || this.bot || !this.sim.atSea) return;
    this.meta.hints.push('seaTut');
    const m = loadMeta();
    if (!m.hints.includes('seaTut')) { m.hints.push('seaTut'); saveMeta(m); }
    const { width } = this.scale;
    const c = this.add.container(width / 2, 380).setScrollFactor(0).setDepth(9450);
    const lines = [
      [SHIP, t(this.touch ? 'seaTut_steer_touch' : 'seaTut_steer_keys')],
      [seaPowerArt('fire'), t(this.touch ? 'seaTut_fire_touch' : 'seaTut_fire_keys')],
      [GOLD, t('seaTut_loot')],
    ];
    const h = 470;
    c.add(glass(this, 640, h, { r: 26, color: 0x0e1a24, alpha: 0.92, rim: 0x7ad8ff }));
    c.add(fitWidth(labelAt(this, 0, -h / 2 + 36, t('seaTutTitle'), SEA_HEAD), 580));
    lines.forEach(([icon, text], i) => {
      const y = -h / 2 + 116 + i * 104;
      c.add(this.add.image(-262, y, icon).setDisplaySize(62, 62));
      const tx = txt(this, -218, y, text, { size: 22, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 500, align: 'left' }).setOrigin(0, 0.5);
      if (tx.height > 96) tx.setScale(96 / tx.height);
      c.add(tx);
    });
    const ok = new Pill(this, 0, h / 2 - 46, 240, 66, 0x2f8ad0, () => this.closeSeaCard(), 26);
    ok.setLabels(t('seaTutOk') + (this.touch ? '' : ' (Enter)'));
    c.add(ok);
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.sfx('wave', { volume: 0.4, exact: true });
    this.seaCard = c;
    this.seaCardT = 0;
  }

  private closeSeaCard(): void {
    const c = this.seaCard;
    if (!c) return;
    this.seaCard = null;
    this.sfx('move', { volume: 0.4, exact: true });
    this.tweens.add({ targets: c, alpha: 0, scale: 0.9, duration: 200, onComplete: () => c.destroy() });
  }

  private openDraft(boons: BoonId[]): void {
    this.closeKeyHint();
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
    // under the HUD rows in the middle (the card sits low, between the thumbs)
    this.tutSkip = new Pill(this, width / 2, ROW3_Y + 4, 170, 56, 0x5a4a6a, () => this.endTutorial(true), 24);
    this.tutSkip.setLabels(t('skip') + (this.touch ? '' : ' (Q)')).setScrollFactor(0).setDepth(9450);
    this.tutPrompt();
  }

  /** The middle of the room between the thumbs: a little left of centre on touch (the buttons' arc). */
  private get midX(): number { return this.touch ? 596 : this.scale.width / 2; }

  private tutPrompt(): void {
    const step = this.tut;
    if (!step) return;
    this.tutCard?.destroy();
    const n = { move: 1, combo: 2, dodge: 3, power: 4, done: 4 }[step];
    const key = step === 'done' ? 'tut_done' : step === 'power' ? 'tut_power' : `tut_${step}_${this.touch ? 'touch' : 'keys'}`;
    // low in the middle, under the hero and clear of the right thumb's buttons
    const tx = txt(this, 0, 8, t(key), { size: 25, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 520 });
    const h = Math.max(104, tx.height + 62);
    const c = this.add.container(this.midX, 676 - h / 2).setScrollFactor(0).setDepth(9420);
    c.add(glass(this, TUT_W, h, { r: 24, color: 0x0e1a24, alpha: 0.86, rim: step === 'done' ? 0x7affa0 : 0xffd23f }));
    c.add(fitWidth(labelAt(this, 0, -h / 2 + 24, t('tutTitle') + '  ' + t('tutStep', { n }), TUT_HEAD), TUT_W - 40));
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
    this.openKeyHint();
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
    const tx = txt(this, 0, 0, t(key), { size: 24, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 520 });
    const c = this.add.container(this.midX, 660 - tx.height / 2).setScrollFactor(0).setDepth(9400).setAlpha(0);
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
    // pooled glyph lines, one atlas per colour (painted ahead): a hit only swaps frames
    const col = color ?? (crit ? DMG_CRIT : DMG_PLAIN);
    const i = this.dmgPool.findIndex((d) => d.color === col);
    const d = i >= 0 ? this.dmgPool.splice(i, 1)[0] : { t: new GlyphText(this, 0, 0, '', calloutStyle(col, FLOAT_PX), 0.5, '0123456789').setScrollFactor(0).setDepth(6000), color: col, base: 1, life: 0, x: 0, y: 0 };
    const base = (crit ? 34 : 24) / FLOAT_PX;
    const ox = (Math.random() - 0.5) * 30;
    d.t.setText(String(Math.round(n))).setVisible(true).setAlpha(1).setScale(crit ? base * 1.3 : base).setPosition(s.x + ox, s.y);
    Object.assign(d, { base, life: crit ? 0.8 : 0.6, x: s.x + ox, y: s.y });
    this.dmg.push(d);
  }

  private updateDmg(dt: number): void {
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.life -= dt;
      if (d.life <= 0) { d.t.setVisible(false); this.dmgPool.push(d); this.dmg.splice(i, 1); continue; }
      d.y -= dt * 80;
      d.t.setPosition(d.x, d.y).setAlpha(Math.min(1, d.life * 4));
      if (d.t.scale > d.base) d.t.setScale(Math.max(d.base, d.t.scale - dt * 2 * d.base));
    }
  }

  /** A banner in the one banner slot between the HUD and the hero: a new one replaces the one showing. */
  private say(...a: Parameters<typeof banner> extends [unknown, ...infer R] ? R : never): void {
    this.bannerBox?.destroy();
    this.bannerBox = banner(this, ...a);
  }

  /**
   * A pickup's name and what it does (a power-up ashore or at sea): a small banner in the middle,
   * between the HUD rows and the hero, clear of the thumbs (a new one replaces the last).
   */
  private callout(name: string, sub: string, color: string): void {
    this.calloutBox?.destroy();
    // just under the HUD rows (lower in the training, where SKIP sits there), above the hero's own floating text
    const y = this.tut ? BANNER_Y + 30 : ROW3_Y - 6;
    this.calloutBox = banner(this, y, name, sub, { color, size: 36, subSize: 22, hold: 0.9, x: this.midX, wrap: 480 });
  }

  /**
   * Text that floats up from a spot in the world, kept whole on the screen: inside its edges, under
   * the HUD rows (it rises 70 px) and, on touch, left of the right thumb's buttons.
   */
  private floatAt(x: number, z: number, s: string, color: string, size = 26, sub = ''): void {
    const p = this.sx(x, z, 2);
    const main = fitWidth(labelAt(this, 0, 0, s, calloutStyle(color, FLOAT_PX)), 560, size / FLOAT_PX);
    const small = sub ? fitWidth(labelAt(this, 0, size * 0.85, sub, SUB_STYLE), 520, (size * 0.62) / (SUB_STYLE.size ?? 26)) : null;
    const half = Math.max(main.displayWidth, small?.displayWidth ?? 0) / 2 + 10;
    const { width: W, height: H } = this.scale;
    const right = this.touch ? BTN_B[0] - 70 : W - 12;
    const y = Phaser.Math.Clamp(p.y - 20, ROW3_Y + 112, H - 40 - (small ? size : 0));
    const cx = Phaser.Math.Clamp(p.x, 12 + half, Math.max(12 + half, right - half));
    const c = this.add.container(cx, y).setScrollFactor(0).setDepth(9300).setScale(0.5);
    c.add(main);
    if (small) c.add(small);
    this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, y: y - 70, alpha: 0, delay: 750, duration: 500, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private bankDoubloons(): void {
    if (this.banked) return;
    this.banked = true;
    const sim = this.sim;
    const m = loadMeta();
    this.earned = sim.doubloons;
    const r = bankRun(m, { doubloons: this.earned, islands: sim.islandsCleared, kraken: sim.krakenDown, voyages: sim.voyages, islets: sim.bonusDoubloons / 2 });
    this.freedBarb = r.freedBarbarossa;
    saveMeta(m);
    this.meta = m;
  }

  /**
   * The voyage's summary: how far, how many, who did it, what was earned. On the menu theme's
   * parchment (painted in Boot, menu.ts `cards`), the heading in the result screen's painted style.
   */
  private showSummary(): void {
    if (this.summaryBox) return;
    // the run is over: lesson cards and hints must not sit over the summary
    this.closeKeyHint();
    this.tutCard?.destroy(); this.tutCard = null;
    this.tutSkip?.destroy(); this.tutSkip = null;
    this.hintBox?.destroy(); this.hintBox = null;
    const sim = this.sim;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 380).setScrollFactor(0).setDepth(9500);
    this.summaryBox = c;
    const ink = { strokeThickness: 0, shadow: false } as const;
    c.add(themeCard(this, 0, 0, SUMMARY_W, SUMMARY_H));
    const head = themeLabel(this, 0, -138, t('defeated'), overlayHeadingStyle(false));
    head.setScale(Math.min(64 / 84, (SUMMARY_W - 90) / head.width));
    c.add(head);
    c.add(txt(this, 0, -74, t('runStats', { i: sim.islandsCleared, k: sim.kills, g: sim.goldEarned }), { size: 25, color: INK, ...ink }));
    const who = sim.cause;
    if (who) c.add(txt(this, 0, -38, t('fallenTo', { who: t('f_' + who) }), { size: 23, color: '#8e1c22', ...ink }));
    // the coin and the count centred together (at the final count; the count grows to the right)
    const earned = themeText(this, 0, 22, t('doubloonsEarned', { n: this.earned }), { size: 50, color: '#ffd23f' }).setOrigin(0, 0.5);
    const row = 58 + 8 + earned.width;
    const coin = this.add.image(-row / 2 + 29, 26, DOUBLOON).setDisplaySize(58, 58);
    earned.setX(-row / 2 + 66).setText(t('doubloonsEarned', { n: 0 }));
    c.add([coin, earned]);
    c.add(txt(this, 0, 92, t('purse', { n: this.meta.doubloons }) + (this.mode === 'easy' ? '  ·  ' + t('easyHalf') : ''), { size: 21, color: INK, ...ink }));
    if (this.freedBarb) c.add(themeText(this, 0, 140, t('barbFreed'), { size: 34, color: '#1f6b2a', strokeWidth: 0, shadow: false }));
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
    this.route?.destroy(); this.route = null;
    this.seaCard?.destroy(); this.seaCard = null;
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
  testShark(cd = 0): number { return this.sim.testShark(cd).id; }
  /** Puts the hero `off` units off the south shore (negative: up the beach), facing the sea. */
  testShore(off = -0.2, th = Math.PI / 2): void {
    const p = this.sim.p, at = shorePoint(this.sim.L, th, off);
    p.x = at.x; p.z = at.z; p.vx = p.vz = 0; p.face = 0;
    this.testSnap();
  }
  testPower(id: PowerId): void { this.sim.takePower(id, this.sim.p.x, this.sim.p.z); for (const ev of this.sim.events) this.onEvent(ev); this.sim.events.length = 0; }
  testDrop(id: PowerId, dx = 1.5, dz = -1): void { this.sim.dropPower(id, this.sim.p.x + dx, this.sim.p.z + dz); }
  testSpecial(full = true): void { this.sim.p.special = full ? this.sim.maxSpecial : PLAYER.pip; }
  testShopBuy(id: ShopId | 'patch' | ShipId | 'repair'): void { this.shop?.testBuy(id); }
  testShopTab(tab: 'crew' | 'ship'): void { this.shop?.testTab(tab); }
  testRoute(i: number): void { this.route?.pick(i); }
  /** Straight to a sea leg (the route given). */
  testSea(r: Route = 'calm'): void { this.testSkipTutorial(); this.shop?.destroy(); this.shop = null; this.sim.testSea(r); this.flushEvents(); }
  testSeaFoe(kind: SeaKind, x = 5, ahead = 18): void { this.sim.voyage?.testSpawn(kind, x, ahead); this.flushEvents(); }
  testFloat(kind: FloatKind, x = 0, ahead = 10, power?: SeaPower): void { const v = this.sim.voyage; if (v) v.addFloat(kind, x, v.ship.z - ahead, power ?? null); }
  testRocks(x = 0, ahead = 20): void { this.sim.voyage?.testRocks(x, ahead); }
  testSeaPower(id: SeaPower): void { this.sim.voyage?.givePower(id); this.flushEvents(); }
  testSink(): void { const v = this.sim.voyage; if (v) { v.ship.invuln = 0; this.god = false; v.hurtShip(9999, 'sloop', v.ship.x, v.ship.z); this.flushEvents(); } }
  testDock(): void { const v = this.sim.voyage; if (v) v.ship.z = v.dockZ + 18; }
  testSeaCard(): void { this.meta.hints = this.meta.hints.filter((h) => h !== 'seaTut'); this.openSeaCard(); }
  /** Puts the hero in the deep water (dx, dz from the south beach), or by the islet. */
  testSwim(where: 'south' | 'islet' = 'south', off = 3): void {
    const L = this.sim.L, p = this.sim.p;
    if (where === 'islet' && L.islet) { const a = Math.atan2(L.islet.z, L.islet.x); p.x = L.islet.x - Math.cos(a) * (L.islet.r + off); p.z = L.islet.z - Math.sin(a) * (L.islet.r + off); }
    else { p.x = 1.5; p.z = L.rz + off; }
    p.vx = p.vz = 0;
    this.testSnap();
  }
  private flushEvents(): void { for (const ev of this.sim.events) this.onEvent(ev); this.sim.events.length = 0; }
  testPick(i: number): void { this.draft?.pick(i); }
  testSail(): void { if (this.shop) (this.shop as unknown as { leave(): void }).leave(); }
  testTele(kind: 'circle' | 'cone' | 'line'): void { const p = this.sim.p; this.sim.testTele(kind, p.x, p.z - 0.5); }
  testSnap(): void { this.view.snap(this.sim); }
  /** Test hook: scene timers and tweens run k times faster (slow software rendering). */
  testTimeScale(k: number): void { this.time.timeScale = k; this.tweens.timeScale = k; }
  testClean(): void { for (const o of [...this.children.list]) if ((o as Phaser.GameObjects.Container).depth === 9400) o.destroy(); this.hintBox?.destroy(); }
  testHint(key: string): void { this.meta.hints = this.meta.hints.filter((h) => h !== key); this.hint(key); }
  get tutorialStep(): TutStep | null { return this.tut; }
  /** Plays seconds of game time frame by frame, the drawing state with it (wakes, sails, the parrot), rendering only the last frame. */
  testRun(seconds: number): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) this.step(STEP);
  }
  /** Steps the simulation by seconds of game time at once (the renderer may be slow). */
  testStep(seconds: number): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      if (this.shop || this.draft || this.route || this.seaCard) break;
      this.sim.step(STEP, this.sim.p.state === 'dead' ? NO_INPUT : this.readInput(STEP));
      for (const ev of this.sim.events) this.onEvent(ev);
      this.sim.events.length = 0;
    }
    this.hitStop = 0;
    this.bossHold = 0;
  }
}
