// Neon Ronin: the Play scene. A round is a run through the campaign:
//   the district map → a level's brief → the level (an implant draft at its first checkpoint) →
//   the results → the ripperdoc → the next level's brief … → the district boss → the district card
//   and the boss's implant → the next district … until the lives run out (the result screen; a
//   rewarded ad may continue from the last checkpoint once), the player banks the run from the
//   results (MAP), or the last boss falls.
// The level is the pure simulation (sim.ts) stepped at 60 Hz and drawn in 3D (view.ts); on top: the
// HUD chips, the touch pad, rain, banners, tutorial prompts, damage numbers and finisher names, all
// painted ahead in the theme's face (prebakePlay) so play paints no text.
// Keys: A/D or ←/→ run, W/Space/↑ jump, J or Z attack, K or X shoot, L, C or Shift roll, S/↓ down
// (drop through ledges, ground slam), P/Esc pause. Touch: stick on the left half, JUMP, SLASH,
// SHOOT and ROLL on the right.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, t, upper, labelWidth, isEasy, hudChip, playMusic, labelAt, labelTexture, fitWidth, GlyphText, bake, isModalOpen, Para, bakePara,
  HUD_MARGIN, HUD_GAP, HUD_ROW2_Y, type HudChip, type LabelStyle,
} from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Sim, newRun, mulberry, NO_INPUT, type Input, type RunState, type SimEvent } from './sim';
import { Bot, SKILL, botPick } from './bot';
import { DT, TUNING, FOE, type Mode, type FoeKind } from './defs';
import { LEVELS } from './levels';
import { rollCards, CARDS, ABILITY_AT, ABILITY_IDS, type CardId, type AbilityId } from './powers';
import { loadMeta, saveMeta, type Meta } from './meta';
import { icon } from './art';
import { TouchPad, HpChip, HeatChip, BossBar } from './hud';
import { INK } from './palette';
import {
  MapScreen, BriefScreen, ShopScreen, DraftScreen, ResultScreen, EndCard, pauseSides, clock, type Panel, type ScreenHost, type LevelResult,
} from './screens';

type Phase = 'map' | 'brief' | 'shop' | 'intro' | 'play' | 'draft' | 'clear' | 'results' | 'end';

/** Where a (re)started Play scene opens: the map (from the menu, after banking a run) or a level's brief (RETRY). */
export const entry = { to: 'map' as 'map' | 'brief', level: 0 };

// ---------------------------------------------------------------- painted words

const S_BANNER: LabelStyle = { size: 64, fill: ['#ffffff', '#ffc4ea', '#ff3fa8'], stroke: INK, strokeWidth: 10 };
const S_BANNER_C: LabelStyle = { size: 64, fill: ['#ffffff', '#c4fbff', '#3ff0ff'], stroke: INK, strokeWidth: 10 };
const S_SUBB: LabelStyle = { size: 30, color: '#ffe040', stroke: INK, strokeWidth: 6 };
const S_TIP: LabelStyle = { size: 23, color: '#ffffff', stroke: INK, strokeWidth: 4, body: true };
const S_FIN: LabelStyle = { size: 30, fill: ['#ffffff', '#c4fbff', '#3ff0ff'], stroke: INK, strokeWidth: 6 };
const S_CALL: LabelStyle = { size: 28, color: '#ffe040', stroke: INK, strokeWidth: 6 };
const DMG: Record<'w' | 'c' | 'r' | 'y', LabelStyle> = {
  w: { size: 28, color: '#ffffff', stroke: INK, strokeWidth: 6 },
  c: { size: 36, color: '#5ff4ff', stroke: INK, strokeWidth: 7 },
  r: { size: 32, color: '#ff5a6a', stroke: INK, strokeWidth: 6 },
  y: { size: 26, color: '#ffe040', stroke: INK, strokeWidth: 5 },
};
const BANNERS_M = ['bnBoss', 'bnPhase2', 'bnPhase3', 'bnReboot', 'bnOverheat', 'bnLastLife'];
const BANNERS_C = ['bnCheckpoint', 'bnClear', 'bnBossDown', 'bnGo', 'bnSecond'];
const CALLS = ['bnArmour', 'bnBlocked', 'bnCoolant', 'bnRepair', 'bnMaxUp', 'bnLever', 'bnParry'];
const FINISHERS = ['fNeonCut', 'fCleave', 'fLunge', 'fSlam'];
const TIPS = ['tipMove', 'tipJump', 'tipDouble', 'tipAttack', 'tipShoot', 'tipCheck', 'tipRoll', 'tipLunge', 'tipChips', 'tipFall', 'tipExit', 'tipCleave', 'tipCable', 'tipLever', 'tipSteam', 'tipTele', 'tipLaser', 'tipSlam', 'tipWall'];
const TIP_W = 860, TIP_H = 62;
const BANNER_Y = 262;

/** Paints the Play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const k of BANNERS_M) labelTexture(scene, t(k), S_BANNER);
  for (const k of BANNERS_C) labelTexture(scene, t(k), S_BANNER_C);
  for (const k of CALLS) labelTexture(scene, t(k), S_CALL);
  for (const k of FINISHERS) labelTexture(scene, t(k), S_FIN);
  for (let n = 1; n <= 3; n++) labelTexture(scene, t('bnChip', { n }), S_CALL);
  for (let d = 0; d < 4; d++) labelTexture(scene, t('d' + d), S_SUBB);
  for (const L of LEVELS) { labelTexture(scene, upper(t('lv_' + L.id)), S_BANNER_C); labelTexture(scene, t('levelN', { n: L.id }), S_SUBB); }
  for (const k of TIPS) for (const v of ['_k', '_t']) bakePara(scene, t(k + v), S_TIP, TIP_W - 110);
  for (const s of Object.values(DMG)) new GlyphText(scene, 0, 0, '', s, 0.5, '0123456789+×').destroy();
  bake(scene, 'nr-tipcard', TIP_W, TIP_H, (c) => {
    c.fillStyle = 'rgba(10,6,22,0.86)';
    c.beginPath(); c.moveTo(18, 0); c.lineTo(TIP_W, 0); c.lineTo(TIP_W, TIP_H - 18); c.lineTo(TIP_W - 18, TIP_H); c.lineTo(0, TIP_H); c.lineTo(0, 18); c.closePath(); c.fill();
    c.strokeStyle = '#3ff0ff'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#ff3fa8'; c.fillRect(24, 0, 80, 3);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 1; y < TIP_H; y += 3) c.fillRect(0, y, TIP_W, 1);
  });
}

interface Dmg { g: GlyphText; life: number; vy: number }

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (also found by the GPU memory check, scripts/three-memory.mjs). */
  world!: World3D;
  sim!: Sim;
  run!: RunState;
  meta!: Meta;
  mode: Mode = 'normal';
  phase: Phase = 'map';
  panel: Panel | null = null;
  bot: Bot | null = null;
  level = 0;
  private levelScores = new Map<number, number>();
  private acc = 0;
  private rnd!: () => number;
  private controls!: Controls;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private pad: TouchPad | null = null;
  private hp!: HpChip;
  private heat!: HeatChip;
  private gearChip!: HudChip;
  private chipChip!: HudChip;
  private clockChip!: HudChip;
  private comboChip!: HudChip;
  private cardChip!: HudChip;
  private bossBar!: BossBar;
  private tipCard: Phaser.GameObjects.Container | null = null;
  private dmgs: Dmg[] = [];
  private banked = false;
  private drafted = false;
  private host!: ScreenHost;
  private touch = false;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private vignette!: Phaser.GameObjects.Image;
  private lastTip = '';
  private keepRun = false;
  private calls = new Map<string, number>();
  /** The store-art stage slows the level down. */
  testSpeed = 1;

  createGame(): void {
    this.meta = loadMeta();
    this.meta.runs++;
    saveMeta(this.meta);
    this.mode = isEasy() ? 'easy' : 'normal';
    this.phase = 'map';
    this.panel = null;
    this.bot = null;
    this.acc = 0;
    this.dmgs = [];
    this.tipCard = null;
    this.banked = true;
    this.drafted = false;
    this.lastTip = '';
    this.keepRun = false;
    this.testSpeed = 1;
    this.levelScores = new Map();
    this.keys = {};
    this.pad = null;
    this.rnd = mulberry((Date.now() & 0xffffff) ^ 0x2077);
    this.touch = this.sys.game.device.input.touch;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5, exact: true }), touch: this.touch };
    this.run = this.freshRun();
    this.level = entry.to === 'brief' ? Math.min(entry.level, this.meta.unlocked) : Math.min(this.meta.unlocked, LEVELS.length - 1);
    this.view = new View(this);
    this.world = this.view.world;
    this.sim = new Sim(this.level, this.run, 1);
    this.view.build(this.sim);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.bank(); this.view.dispose(); });
    this.setupHud();
    this.setupInput();
    this.rain = this.add.particles(0, 0, 'nr-rain', {
      x: { min: -60, max: 1340 }, y: -50, lifespan: 800, speedY: { min: 1000, max: 1250 }, speedX: -170, rotate: 9,
      alpha: { start: 0.42, end: 0.18 }, quantity: 2, frequency: 22, blendMode: Phaser.BlendModes.ADD,
    }).setScrollFactor(0).setDepth(-60);
    this.vignette = this.add.image(640, 360, 'nr-vignette').setDisplaySize(1280, 720).setScrollFactor(0).setDepth(8000).setAlpha(0);
    // the run's implants, the combos and the goals beside the pause card
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      const ps = this.scene.get('Pause');
      ps?.events.once(Phaser.Scenes.Events.CREATE, () => { if (!this.isOver) pauseSides(ps, this.run.cards, this.run.abilities, this.sim.chips.filter(Boolean).length, this.sim.time); });
    });
    this.hooks();
    this.showHud(false);
    // the core shows its HUD after createGame(): hide it again on the first frame
    this.events.once(Phaser.Scenes.Events.UPDATE, () => this.showHud(this.hudOn));
    if (entry.to === 'brief') this.openBrief(this.level, false);
    else this.openMap();
    entry.to = 'brief';
    entry.level = this.level;
  }

  private freshRun(): RunState { return newRun(this.mode, { ...this.meta.ranks }, [...this.meta.abilities]); }

  // ---------------------------------------------------------------- the HUD

  private setupHud(): void {
    const y = HUD_ROW2_Y;
    this.hp = new HpChip(this, HUD_MARGIN, y);
    this.heat = new HeatChip(this, this.hp.chip.right + HUD_GAP, y);
    this.gearChip = hudChip(this, this.heat.chip.right + HUD_GAP, y, { icon: icon('gear'), iconSize: 30, text: '0', color: '#ffc27a', minWidth: 96 });
    this.chipChip = hudChip(this, this.gearChip.right + HUD_GAP, y, { icon: icon('chip'), iconSize: 30, text: '0/3', color: '#9aff8a', minWidth: 96 });
    this.clockChip = hudChip(this, this.scale.width / 2 + 120, y, { align: 'center', icon: icon('clock'), iconSize: 26, text: '0:00', minWidth: 112 });
    this.cardChip = hudChip(this, this.scale.width - HUD_MARGIN, y, { align: 'right', icon: icon('chip'), iconSize: 26, text: '×0', color: '#d98bff', minWidth: 80 });
    this.comboChip = hudChip(this, this.cardChip.left - HUD_GAP, y, { align: 'right', label: t('bnCombo'), text: '×0', color: '#ffe040', minWidth: 120 });
    this.comboChip.setVisible(false);
    this.bossBar = new BossBar(this);
  }

  private hudOn = true;
  private showHud(on: boolean): void {
    this.hudOn = on;
    this.hud.setVisible(on);
    for (const c of [this.hp.chip, this.heat.chip, this.gearChip, this.chipChip, this.clockChip, this.cardChip]) c.setVisible(on);
    if (!on) { this.comboChip.setVisible(false); this.bossBar.hide(); }
    this.pad?.setVisible(on);
  }

  private refreshHud(): void {
    const s = this.sim, p = s.p;
    const prev = this.levelScores.get(this.level) ?? 0;
    this.setScore(this.run.score + Math.max(0, s.score - prev));
    this.hud.setLives(this.run.lives, Math.max(this.run.lives, TUNING[this.mode].lives));
    this.hp.set(Math.max(0, p.hp), p.maxHp, p.shield, this.time.now / 1000);
    this.heat.set(p.heat, p.hot, p.coolant > 0, this.time.now / 1000);
    this.gearChip.setText(String(s.gears));
    this.chipChip.setText(s.L.boss ? '—' : `${s.chips.filter(Boolean).length}/3`);
    this.clockChip.setText(clock(s.time));
    const par = s.L.par + TUNING[this.mode].parBonus;
    this.clockChip.setTextColor(s.time > par ? '#ff8a9a' : '#ffffff');
    this.cardChip.setText('×' + this.run.cards.length);
    const combo = s.combo >= 2 && this.hudOn;
    if (combo !== this.comboChip.visible) this.comboChip.setVisible(combo);
    if (combo) this.comboChip.setText('×' + s.combo);
    if (s.boss && s.bossOn) this.bossBar.set(s.boss.hp, s.boss.maxHp, s.boss.state === 'vent', this.game.loop.delta / 1000);
    if (this.pad) this.pad.charge = p.state === 'charge' ? p.charge : 0;
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    // the core's floating stick on the left half (its A/B buttons stay off screen; the pad has four)
    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'], buttonPos: { A: [-400, -400], B: [-400, -400] } });
    if (this.controls.touchUi) {
      for (const o of [...this.children.list]) {
        const d = (o as unknown as { depth: number }).depth;
        if ((d === 9500 || d === 9501) && ((o as unknown as { x: number }).x < 0)) o.destroy();
      }
      this.pad = new TouchPad(this);
    }
    const kb = this.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const map: Record<string, number> = { w: K.W, up: K.UP, space: K.SPACE, j: K.J, z: K.Z, k: K.K, x: K.X, l: K.L, c: K.C, shift: K.SHIFT, s: K.S, down: K.DOWN };
    for (const [n, c] of Object.entries(map)) this.keys[n] = kb.addKey(c, true, false);
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.isOver) return;
      if (this.panel && !this.panel.closed) { if (this.panel.key(e.code)) e.preventDefault(); }
    });
  }

  private readInput(): Input {
    if (this.bot) return this.bot.input(DT);
    const k = this.keys, c = this.controls, pad = this.pad;
    const jd = (...n: string[]) => n.some((x) => k[x] && Phaser.Input.Keyboard.JustDown(k[x]));
    const held = (...n: string[]) => n.some((x) => k[x]?.isDown);
    const inp: Input = {
      mx: c.axisX,
      down: held('s', 'down') || c.axisY > 0.6,
      jump: jd('w', 'up', 'space') || !!pad?.pressed('jump'),
      jumpHeld: held('w', 'up', 'space') || !!pad?.held('jump'),
      attack: jd('j', 'z') || !!pad?.pressed('attack'),
      attackHeld: held('j', 'z') || !!pad?.held('attack'),
      shoot: jd('k', 'x') || !!pad?.pressed('shoot'),
      shootHeld: held('k', 'x') || !!pad?.held('shoot'),
      roll: jd('l', 'c', 'shift') || !!pad?.pressed('roll'),
    };
    pad?.frame();
    return inp;
  }

  // ---------------------------------------------------------------- screens

  private openMap(): void {
    this.phase = 'map';
    this.showHud(false);
    this.panel = new MapScreen(this, this.host, this.meta, (i) => { this.panel?.close(); this.openBrief(i, false); }, () => this.openShop(() => this.openMap(), true));
  }

  private openBrief(i: number, keep: boolean): void {
    this.phase = 'brief';
    this.showHud(false);
    this.keepRun = keep;
    // the level behind the card
    if (this.sim.levelIndex !== i) { this.sim = new Sim(i, this.run, 1); this.view.build(this.sim); }
    this.level = i;
    this.panel = new BriefScreen(this, this.host, this.meta, i, this.mode, () => { this.panel = null; this.startLevel(i, this.keepRun); }, () => this.openShop(() => this.openBrief(i, this.keepRun), true), () => { this.panel = null; this.openMap(); });
  }

  /** The ripperdoc, then `after`. */
  private openShop(after: () => void, closePrev: boolean): void {
    if (closePrev) this.panel?.close();
    this.phase = 'shop';
    this.showHud(false);
    this.panel = new ShopScreen(this, this.host, this.meta, () => { this.run.ranks = { ...this.meta.ranks }; }, () => { this.panel = null; after(); });
  }

  private openDraft(boss: boolean, then: (id: CardId) => void): void {
    const deal = () => rollCards(boss ? [] : this.run.cards, this.rnd);
    const offer = deal();
    if (!offer.length) { then(CARDS[0].id); return; }
    this.phase = 'draft';
    if (this.bot) {
      // the autopilot picks at once
      then(offer[botPick(offer)]);
      return;
    }
    this.panel = new DraftScreen(this, this.host, offer, deal, (id) => { this.panel = null; then(id); }, boss);
  }

  // ---------------------------------------------------------------- the level

  private startLevel(i: number, keep: boolean, quiet = false): void {
    if (!keep) { this.run = this.freshRun(); this.levelScores = new Map(); }
    this.run.ranks = { ...this.meta.ranks };
    this.run.abilities = [...this.meta.abilities];
    this.level = i;
    entry.level = i;
    this.sim = new Sim(i, this.run, Math.floor(this.rnd() * 1e6));
    this.view.build(this.sim);
    this.bot?.setSim(this.sim);
    this.banked = false;
    this.drafted = false;
    this.acc = 0;
    this.lastTip = '';
    this.hideTip();
    const L = LEVELS[i];
    this.hud.setLevel(L.id);
    this.showHud(true);
    this.phase = 'intro';
    playMusic(this, L.boss ? 'boss' : L.district % 2 ? 'level3' : 'level2');
    this.refreshHud();
    if (quiet) { this.phase = 'play'; return; }
    // the level's name, then GO
    this.banner(upper(t('lv_' + L.id)), S_BANNER_C, t('d' + L.district) + '  ·  ' + t('levelN', { n: L.id }));
    this.sfx('start', { volume: 0.5, exact: true });
    this.time.delayedCall(1300, () => {
      if (this.phase !== 'intro' || this.isOver) return;
      this.phase = 'play';
      this.banner(t('bnGo'), S_BANNER_C);
    });
  }

  /** The level is cleared: results, the meta, the next step. */
  private finishLevel(): void {
    const s = this.sim, i = this.level, L = s.L, m = this.meta;
    const bonus = s.clearBonus();
    const total = s.score + bonus.clear + bonus.time + bonus.noHit;
    const prev = this.levelScores.get(i) ?? 0;
    if (total > prev) { this.run.score += total - prev; this.levelScores.set(i, total); }
    this.setScore(this.run.score);
    const stars = s.stars();
    const bits = (stars[0] ? 1 : 0) | (stars[1] ? 2 : 0) | (stars[2] ? 4 : 0);
    const newStars = bits & ~m.stars[i];
    m.stars[i] |= bits;
    // a new record beats an earlier clear (the first clear sets the mark)
    const record = m.times[i] > 0 && (s.time < m.times[i] || total > m.scores[i]);
    if (m.times[i] === 0 || s.time < m.times[i]) m.times[i] = Math.round(s.time * 10) / 10;
    m.scores[i] = Math.max(m.scores[i], total);
    m.unlocked = Math.max(m.unlocked, Math.min(LEVELS.length - 1, i + 1));
    let ability: AbilityId | null = null;
    for (const a of ABILITY_IDS) if (ABILITY_AT[a] === i && !m.abilities.includes(a)) { m.abilities.push(a); ability = a; }
    this.bank();
    saveMeta(m);
    this.phase = 'results';
    this.showHud(false);
    const r: LevelResult = {
      level: i, time: s.time, par: L.par + TUNING[this.mode].parBonus, kills: s.kills, gears: s.gears, chips: s.chips.filter(Boolean).length,
      combo: s.bestCombo, score: total, stars, newStars: newStars ? 1 : 0, record, ability, boss: L.boss, last: i === LEVELS.length - 1,
    };
    const next = () => this.afterLevel();
    if (this.bot) { next(); return; }
    this.panel = new ResultScreen(this, this.host, r, next, () => { this.panel = null; this.startLevel(i, true); }, () => {
      this.panel = null;
      entry.to = 'map';
      this.phase = 'end';
      this.endGame({ win: true, title: t('runBanked'), delay: 200 });
    });
  }

  /** NEXT after a level: the ripperdoc and the next brief; after a boss, its card and implant. */
  private afterLevel(): void {
    const i = this.level, L = LEVELS[i];
    this.panel = null;
    if (L.boss) {
      const last = i === LEVELS.length - 1;
      this.panel = new EndCard(this, this.host, last, this.run.score, () => {
        this.panel = null;
        if (last) { entry.to = 'map'; this.phase = 'end'; this.endGame({ win: true, title: t('cityFree'), delay: 200 }); return; }
        this.openDraft(true, (id) => {
          this.run.cards = [id];
          this.run.lives = Math.min(this.run.lives + 1, TUNING[this.mode].lives + 2);
          this.openShop(() => this.openBrief(i + 1, true), false);
        });
      });
      if (this.bot) { (this.panel as EndCard).key('Enter'); }
      return;
    }
    if (this.bot) { this.startLevel(i + 1, true); return; }
    this.openShop(() => this.openBrief(i + 1, true), false);
  }

  /** Banks the level's gears once (level end, game over, leaving). */
  private bank(): void {
    if (this.banked || !this.sim) return;
    this.banked = true;
    this.meta.gears += this.sim.gears;
    saveMeta(this.meta);
  }

  /** The rewarded continue: back at the last checkpoint with one life. */
  revive(): void {
    // a round ended from a screen (the map, a brief): the screen stays
    if (this.panel && !this.panel.closed) return;
    if (this.phase !== 'end' && this.phase !== 'play') return;
    this.sim.revive();
    this.banked = false;
    this.phase = 'play';
    this.showHud(true);
    this.refreshHud();
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if ((this.phase === 'play' || this.phase === 'clear') && !this.panel && !isModalOpen(this)) {
      this.acc += dt * this.testSpeed;
      let n = 0;
      while (this.acc >= DT && n < 4) {
        this.acc -= DT;
        n++;
        this.sim.step(DT, this.phase === 'play' ? this.readInput() : NO_INPUT);
        this.handleEvents();
        if (this.sim.over) break;
      }
      if (n >= 4) this.acc = 0;
    } else {
      this.pad?.frame();
    }
    this.view.sync(this.sim, dt);
    this.updateDmg(dt);
    if (this.hudOn) this.refreshHud();
    this.vignette.setAlpha(Math.max(0, this.vignette.alpha - dt * 1.5));
  }

  private handleEvents(): void {
    const s = this.sim;
    for (const e of s.events) {
      this.view.handle(e, s);
      this.react(e);
    }
    s.events.length = 0;
  }

  private at(x: number, y: number): { x: number; y: number } { return this.view.screen(x, y); }

  /** Sounds, banners, callouts and numbers for a simulation event. */
  private react(e: SimEvent): void {
    const s = this.sim, p = s.p;
    const v = (k: string, vol = 0.5) => this.sfx(k, { volume: vol });
    switch (e.type) {
      case 'jump': v(e.air ? 'airJump' : 'jump', 0.35); break;
      case 'land': if (e.hard) v('land', 0.4); break;
      case 'roll': v('roll', 0.5); break;
      case 'dash': v('dash', 0.55); break;
      case 'swing': v(e.kind === 'punch' ? 'punch' : e.kind === 'kick' ? 'kick' : e.kind === 'cleave' ? 'slash3' : e.kind === 'slam' ? 'dash' : e.step === 3 ? 'slash2' : 'slash1', e.kind === 'cleave' ? 0.7 : 0.5); break;
      case 'charge': v('tick', 0.35); break;
      case 'chargeReady': v('power', 0.45); break;
      case 'shoot': this.sfxAt(e.heavy ? 'heavy' : 'shoot', this.at(e.x, e.y).x, { volume: e.heavy ? 0.6 : 0.32 }); break;
      case 'overheat': v('overheat', 0.6); this.callout(t('bnOverheat'), p.x, p.y + 2.2, S_CALL); break;
      case 'cooled': v('cooled', 0.35); break;
      case 'coolant': v('coolant', 0.5); this.callout(t('bnCoolant'), p.x, p.y + 2.2, S_CALL); break;
      case 'hit': {
        const sp = this.at(e.x, e.y);
        this.sfxAt(e.big ? 'crit' : 'hit', sp.x, { volume: e.big ? 0.6 : 0.45 });
        if (e.foe.maxArmour > 0 && e.foe.armour > 0) this.sfxAt('clang', sp.x, { volume: 0.4 });
        this.number(e.x, e.y + 0.4, String(Math.max(1, Math.round(e.dmg * 10))), e.big ? 'c' : 'w');
        if (e.name) this.callout(t(e.name), e.x, e.y + 1.6, S_FIN);
        break;
      }
      case 'armour': if (e.broken) { v('break', 0.6); this.callout(t('bnArmour'), e.foe.x, e.foe.y + e.foe.h + 1, S_CALL); } break;
      case 'kill': {
        const sp = this.at(e.foe.x, e.foe.y);
        this.sfxAt(e.foe.kind === 'boss' ? 'bossDie' : FOE[e.foe.kind].fixed ? 'boom' : 'robotDie', sp.x, { volume: e.foe.kind === 'boss' ? 0.8 : 0.4 });
        if (e.score > 0) this.number(e.foe.x, e.foe.y + e.foe.h + 0.8, '+' + e.score, 'y');
        break;
      }
      case 'parry': v('parry', 0.35); break;
      case 'tell': {
        const sp = this.at(e.foe.x, e.foe.y);
        if (e.move === 'warp') this.sfxAt('warp', sp.x, { volume: 0.4 });
        else if (e.foe.kind === 'boss' || Math.abs(e.foe.x - p.x) < 12) this.sfxAt('tell', sp.x, { volume: e.foe.kind === 'boss' ? 0.55 : 0.25 });
        break;
      }
      case 'foeFire': {
        const sp = this.at(e.foe.x, e.foe.y);
        if (Math.abs(e.foe.x - p.x) > 18) break;
        const k = e.move === 'shot' || e.move === 'volley' ? 'foeShot' : e.move === 'slam' || e.move === 'stompLand' ? 'stomp' : e.move === 'lob' || e.move === 'barrage' ? 'boom' : e.move.startsWith('laser') ? 'laserGate' : e.move === 'summon' ? 'warp' : 'dash';
        this.sfxAt(k, sp.x, { volume: e.move === 'shot' ? 0.3 : 0.5 });
        break;
      }
      case 'hurt': v('hurt', 0.6); this.vignette.setAlpha(0.85); this.number(e.x, e.y + 0.6, String(Math.round(e.dmg * 10)), 'r'); this.cameras.main.flash(80, 120, 0, 30); break;
      case 'blocked': v('parry', 0.5); this.callout(t('bnBlocked'), e.x, e.y + 1.2, S_CALL); break;
      case 'secondHeart': v('power', 0.6); this.banner(t('bnSecond'), S_BANNER_C); break;
      case 'die': v('die', 0.6); this.vignette.setAlpha(1); break;
      case 'respawn': {
        v('warp', 0.5);
        this.banner(t('bnReboot'), S_BANNER);
        if (this.run.lives === 1) this.time.delayedCall(900, () => { if (!this.isOver) this.banner(t('bnLastLife'), S_BANNER); });
        break;
      }
      case 'pit': v('hurt', 0.5); this.vignette.setAlpha(0.7); break;
      case 'gameOver': {
        this.bank();
        entry.to = 'brief';
        entry.level = this.level;
        this.phase = 'end';
        this.endGame({ title: t('flatlined'), delay: 900 });
        break;
      }
      case 'pickup':
        if (e.kind === 'gear') this.sfxAt('gear', this.at(e.x, e.y).x, { volume: 0.32 });
        else if (e.kind === 'health') { v('heal', 0.5); this.callout(t('bnRepair'), e.x, e.y + 1.2, S_CALL); this.hp.pulse(); }
        else if (e.kind === 'heart') { v('heal', 0.6); this.callout(t('bnMaxUp'), e.x, e.y + 1.2, S_CALL); this.hp.pulse(); }
        break;
      case 'chip': {
        v('chip', 0.6);
        const n = s.chips.filter(Boolean).length;
        this.callout(t('bnChip', { n }), e.x, e.y + 1.4, S_CALL);
        this.tweens.add({ targets: this.chipChip, scale: { from: 1.4, to: 1 }, duration: 320, ease: 'Back.easeOut' });
        break;
      }
      case 'checkpoint':
        v('checkpoint', 0.55);
        this.banner(t('bnCheckpoint'), S_BANNER_C);
        if (e.first && !this.drafted && this.run.cards.length < CARDS.length) {
          this.drafted = true;
          this.time.delayedCall(700, () => {
            if (this.isOver || this.phase !== 'play') return;
            this.openDraft(false, (id) => {
              this.run.cards.push(id);
              const mh = this.sim.maxHp();
              this.sim.p.hp = Math.min(mh, this.sim.p.hp + Math.max(0, mh - this.sim.p.maxHp));
              this.sim.p.maxHp = mh;
              this.sim.p.airJumps = Math.max(this.sim.p.airJumps, 0);
              this.phase = 'play';
              this.sfx('power', { volume: 0.5 });
            });
          });
        }
        break;
      case 'lever': v('lever', 0.6); this.callout(t('bnLever'), e.x, e.y + 1.5, S_CALL); break;
      case 'gate': v(e.gate.kind === 'door' ? 'door' : 'bridge', 0.6); break;
      case 'loot': v('buy', 0.5); break;
      case 'boom': this.sfxAt(e.r > 2 ? 'bigBoom' : 'boom', this.at(e.x, e.y).x, { volume: 0.5 }); break;
      case 'shell': break;
      case 'slamLand': v('stomp', 0.6); break;
      case 'wave': v('slash3', 0.45); break;
      case 'hazard':
        if (e.h.phase === 'on' && Math.abs(e.h.x - p.x) < 10) this.sfxAt(e.h.kind === 'steam' ? 'steam' : e.h.kind === 'cable' ? 'zap' : 'laserGate', this.at(e.h.x, e.h.y0).x, { volume: 0.22 });
        break;
      case 'fall': if (e.f.state === 'shake') v('tick', 0.3); break;
      case 'tip': this.tip(e.key); break;
      case 'clear': {
        v('exit', 0.6);
        this.time.delayedCall(300, () => this.sfx('fanfare', { volume: 0.55, exact: true }));
        this.phase = 'clear';
        this.hideTip();
        this.banner(t(s.L.boss ? 'bnBossDown' : 'bnClear'), S_BANNER_C);
        this.time.delayedCall(2100, () => { if (!this.isOver && this.phase === 'clear') this.finishLevel(); });
        break;
      }
      case 'bossStart': {
        this.sfx('alarm', { volume: 0.4 });
        this.banner(t('bnBoss'), S_BANNER, upper(t('lv_' + s.L.id)));
        this.bossBar.show(t('lv_' + s.L.id));
        break;
      }
      case 'bossPhase': v('phase', 0.55); this.banner(t(e.phase === 2 ? 'bnPhase2' : 'bnPhase3'), S_BANNER); break;
      case 'bossDown': this.bossBar.hide(); break;
      case 'spawn': this.sfxAt('warp', this.at(e.foe.x, e.foe.y).x, { volume: 0.35 }); break;
      case 'combo':
        if (e.n % 10 === 0) { this.tweens.add({ targets: this.comboChip, scale: { from: 1.45, to: 1 }, duration: 300, ease: 'Back.easeOut' }); v('power', 0.3); }
        break;
      case 'score': break;
      case 'heal': break;
    }
  }

  // ---------------------------------------------------------------- feedback (all painted ahead)

  /** A big banner with an optional line under it. */
  private banner(s: string, style: LabelStyle, sub?: string): void {
    const { width } = this.scale;
    const img = labelAt(this, width / 2, BANNER_Y, s, style).setDepth(9100).setScrollFactor(0);
    fitWidth(img, width - 240);
    const sc = img.scale;
    img.setScale(sc * 0.3).setAlpha(0);
    this.tweens.add({ targets: img, scale: sc, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: BANNER_Y - 30, delay: 1150, duration: 360, onComplete: () => img.destroy() });
    // a glitch echo
    const echo = labelAt(this, width / 2 + 6, BANNER_Y + 2, s, style).setDepth(9099).setScrollFactor(0).setTint(0x3ff0ff).setAlpha(0.5).setScale(sc);
    echo.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: echo, x: width / 2 - 4, alpha: 0, duration: 260, onComplete: () => echo.destroy() });
    if (sub) {
      const st = labelAt(this, width / 2, BANNER_Y + 56, sub, S_SUBB).setDepth(9100).setScrollFactor(0).setAlpha(0);
      fitWidth(st, width - 300);
      this.tweens.add({ targets: st, alpha: 1, duration: 200, delay: 120 });
      this.tweens.add({ targets: st, alpha: 0, delay: 1250, duration: 300, onComplete: () => st.destroy() });
    }
  }

  /** A short painted callout at a world point (finisher names, pickups, armour break). */
  private callout(s: string, x: number, y: number, style: LabelStyle): void {
    // one of each at a time (a lunge through two foes names itself once)
    const now = this.time.now;
    if ((this.calls.get(s) ?? -1e9) > now - 350) return;
    this.calls.set(s, now);
    const p = this.at(x, y);
    const img = labelAt(this, p.x, p.y, s, style).setDepth(9060).setScrollFactor(0);
    fitWidth(img, 420, 0.9);
    const sc = img.scale;
    img.setScale(sc * 0.4);
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: p.y - 34, delay: 700, duration: 360, onComplete: () => img.destroy() });
  }

  /** Damage numbers and score pops (glyphs). */
  private number(x: number, y: number, s: string, kind: keyof typeof DMG): void {
    const p = this.at(x, y);
    const g = new GlyphText(this, p.x + (Math.random() - 0.5) * 20, p.y, s, DMG[kind], 0.5, '0123456789+×').setDepth(9070).setScrollFactor(0);
    g.setScale(kind === 'c' ? 1.4 : 1.15);
    this.tweens.add({ targets: g, scale: 1, duration: 160 });
    this.dmgs.push({ g, life: kind === 'y' ? 1.0 : 0.75, vy: kind === 'y' ? -50 : -90 });
  }

  private updateDmg(dt: number): void {
    for (const d of this.dmgs) {
      d.life -= dt;
      d.g.y += d.vy * dt;
      d.vy *= 0.94;
      if (d.life < 0.3) d.g.setAlpha(Math.max(0, d.life / 0.3));
    }
    this.dmgs = this.dmgs.filter((d) => { if (d.life > 0) return true; d.g.destroy(); return false; });
  }

  /** A tutorial prompt in a card under the HUD. */
  private tip(key: string): void {
    if (!key) return;
    this.hideTip();
    const text = t(key + (this.touch ? '_t' : '_k'));
    const c = this.add.container(this.scale.width / 2, 196).setScrollFactor(0).setDepth(9050);
    const w = Math.min(TIP_W, labelWidth(text, S_TIP) + 130);
    c.add(this.add.image(0, 0, 'nr-tipcard').setDisplaySize(w, TIP_H));
    const ic = this.add.image(-w / 2 + 40, 0, icon('chip'));
    ic.setScale(34 / ic.height);
    c.add(ic);
    const para = new Para(this, -w / 2 + 74, -TIP_H / 2 + 6, text, S_TIP, TIP_W - 110, 0, 25);
    para.y = -para.textHeight / 2;
    c.add(para);
    c.setScale(0.9, 0.2).setAlpha(0);
    this.tweens.add({ targets: c, scaleY: 1, scaleX: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
    this.tipCard = c;
    this.lastTip = key;
    this.sfx('tick', { volume: 0.3 });
    this.time.delayedCall(4300, () => { if (this.tipCard === c) this.hideTip(); });
  }

  private hideTip(): void {
    const c = this.tipCard;
    if (!c) return;
    this.tipCard = null;
    this.tweens.add({ targets: c, alpha: 0, scaleY: 0.2, duration: 160, onComplete: () => c.destroy() });
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__neon = {
      state: () => ({
        phase: this.phase, level: this.level, id: this.sim.L.id, time: this.sim.time, x: this.sim.p.x, y: this.sim.p.y, hp: this.sim.p.hp, lives: this.run.lives,
        score: this.score, gears: this.meta.gears, cards: this.run.cards, chips: this.sim.chips, foes: this.sim.foes.filter((f) => f.state !== 'dead').length,
        textures: this.textures.getTextureKeys().length, mode: this.mode, tune: TUNING[this.mode], over: this.isOver,
      }),
      /** Starts a level at once (a new run), optionally with ranks, abilities and cards. */
      skip: (i: number, o: { cards?: CardId[]; abilities?: AbilityId[] } = {}) => this.skipTo(i, o),
      /** The autopilot plays (and picks through the draft). */
      auto: (on = true) => { this.bot = on ? new Bot(this.sim, SKILL.good, this.rnd) : null; },
      /** Steps the level ahead headless (seconds). */
      fast: (sec: number) => this.fastForward(sec),
      /** Opens a screen for a screenshot. */
      open: (which: string) => this.openForShot(which),
      /** The store-art stage: a fight on the rooftops. */
      stage: (name = 'busy') => this.stage(name),
      key: (code: string) => this.panel?.key(code),
      /** Moves the hero (screenshots). */
      put: (x: number, y?: number) => { this.sim.p.x = x; if (y !== undefined) this.sim.p.y = y; },
      /** Takes damage until the run is over (the platform harness). */
      lose: () => { this.run.lives = 1; this.sim.p.hp = 0.5; this.sim.p.iframes = 0; this.sim.hurt(5, 1); },
      sim: () => this.sim,
    };
  }

  private skipTo(i: number, o: { cards?: CardId[]; abilities?: AbilityId[]; quiet?: boolean } = {}): void {
    this.panel?.close();
    this.panel = null;
    if (o.abilities) this.meta.abilities = [...o.abilities];
    this.startLevel(i, false, o.quiet);
    if (o.cards) this.run.cards = [...o.cards];
    this.phase = 'play';
  }

  private fastForward(sec: number): void {
    const steps = Math.round(sec / DT);
    for (let i = 0; i < steps && !this.sim.over && !this.sim.cleared; i++) {
      this.sim.step(DT, this.bot ? this.bot.input(DT) : NO_INPUT);
      for (const e of this.sim.events) this.view.handle(e, this.sim);
      this.sim.events.length = 0;
    }
    this.view.snap(this.sim);
  }

  private openForShot(which: string): void {
    this.panel?.close();
    this.panel = null;
    switch (which) {
      case 'map': this.openMap(); break;
      case 'brief': this.openBrief(this.level, false); break;
      case 'shop': this.openShop(() => undefined, false); break;
      case 'draft': this.openDraft(false, () => { this.phase = 'play'; }); break;
      case 'bossDraft': this.openDraft(true, () => { this.phase = 'play'; }); break;
      case 'results': {
        const s = this.sim;
        this.phase = 'results';
        this.showHud(false);
        this.panel = new ResultScreen(this, this.host, { level: this.level, time: Math.max(s.time, 71.4), par: s.L.par, kills: Math.max(s.kills, 23), gears: Math.max(s.gears, 41), chips: 2, combo: Math.max(s.bestCombo, 17), score: Math.max(s.score, 8450), stars: [true, false, true], newStars: 1, record: true, ability: 'cleave', boss: false, last: false }, () => undefined, () => undefined, () => undefined);
        break;
      }
      case 'district': this.panel = new EndCard(this, this.host, false, Math.max(this.run.score, 24680), () => undefined); break;
      case 'campaign': this.panel = new EndCard(this, this.host, true, Math.max(this.run.score, 98340), () => undefined); break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /** A fight on neon rooftops for the store art: level 2-3, the autopilot among several foes. */
  private stage(name: string): void {
    if (name !== 'busy' && name !== 'boss') return;
    if (name === 'boss') {
      this.skipTo(7, { abilities: ['wall', 'cleave', 'slam'], cards: ['voltBlade', 'kitsune'], quiet: true });
      this.bot = new Bot(this.sim, SKILL.good, mulberry(5));
      this.fastForward(9);
      return;
    }
    this.skipTo(6, { abilities: ['wall', 'cleave', 'slam'], cards: ['voltBlade', 'kitsune', 'twinBarrel'], quiet: true });
    this.run.ranks = { ...this.run.ranks, sword: 3, gun: 2 };
    this.bot = new Bot(this.sim, SKILL.good, mulberry(11));
    this.sim.demo = true;
    // on until three foes are close and the hero is mid-swing
    for (let i = 0; i < 60 * 70; i++) {
      this.sim.step(DT, this.bot.input(DT));
      for (const e of this.sim.events) this.view.handle(e, this.sim);
      this.sim.events.length = 0;
      const p = this.sim.p;
      const near = this.sim.foes.filter((f) => f.state !== 'dead' && Math.abs(f.x - p.x) < 7).length;
      if (near >= 3 && p.state === 'attack' && i > 60 * 8) break;
    }
    // a crowd round the hero for the frame
    const p = this.sim.p, gy = this.sim.groundBelow(p.x + 5, p.y + 1);
    for (const [k, dx, dy] of [['brute', 5, 0], ['gunner', 8.5, 0], ['drone', 3, 3.2], ['gdrone', -4, 4], ['walker', -3, 0]] as Array<[FoeKind, number, number]>) {
      const f = this.sim.spawn(k, p.x + dx, (dy ? p.y : gy) + dy);
      f.face = (dx > 0 ? -1 : 1) as 1 | -1;
      f.t = 0.3;
      f.hp = f.maxHp = f.maxHp * 4;
    }
    // slowed right down while the frames are taken, the hero holding the spot, so the fight stays in them
    this.testSpeed = 0.3;
    this.bot.anchor = p.x;
    this.hideTip();
    this.view.zoom = 0.86;
    this.view.snap(this.sim);
  }
}
