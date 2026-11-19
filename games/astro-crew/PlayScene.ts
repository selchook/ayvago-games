// Astro Crew: the Play scene. A run is a string of missions, each on a whole planet to explore:
//   the crew choice → the star map → the brief → the mission (power-card drafts at level-ups) →
//   the summary → the base (modules) → the star map … until the hero falls or a dome is lost
//   (the result screen; a rewarded ad may continue that mission once), or the Magma King falls
//   (the galaxy is saved: a won run).
// The mission is the pure simulation (sim.ts), stepped at 60 Hz and drawn in 3D (view.ts); the star
// map and the base are 3D too (mapview.ts). On top: the HUD chips (score, the objective, health,
// level, the hive alert, crystals, cards, the boss's health), a round minimap of the planet in its
// own chip, the three action buttons (DODGE, SKILL, MECH) with their cooldown rings, arrows at the
// screen's edge (with the distance) to the objectives off screen, the castaway and a hunting wave,
// damage numbers, banners and toasts, all painted in the theme's face ahead of time.
// Touch: the stick (anywhere left of the buttons) moves; the buttons roll, fire the skill and call
// the mech. Keys: WASD / arrows move, Space rolls, Q or J the skill, E or K the mech, P / Esc pause.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, t, isEasy, hudChip, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge, labelAt, labelTexture, fitWidth,
  bakeFmt, glyphAtlas, FmtLine, GlyphText, isModalOpen, NUMERIC_GLYPHS, type HudChip, type LabelStyle,
} from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { MapView, BaseView } from './mapview';
import { Mission, newRun, mulberry, NO_INPUT, type RunState, type SimEvent, type Input } from './sim';
import { Bot, SKILL } from './bot';
import { DT, HERO, MISSIONS, OBJ, WORLD_R, xpNeed, crystalsFor, type HeroId, type MissionDef } from './defs';
import { THEME } from './arena';
import type { Spot } from './world';
import { rollCards, CARD, type CardId } from './powers';
import { loadMeta, saveMeta, crewOpen, type Meta } from './meta';
import { makeArt, iconImg, setIcon, ARROW, ARROW_RED, ARROW_CYAN, BTN_FACE } from './art';
import {
  CrewScreen, MapScreen, BriefScreen, DraftScreen, SummaryScreen, BaseScreen, pauseSides, type Panel, type ScreenHost,
} from './screens';
import { renderIconSheet } from './icons';

type Phase = 'crew' | 'map' | 'brief' | 'play' | 'draft' | 'won' | 'summary' | 'base' | 'end';

const INK = '#170c3a';
/** Banner and toast styles (painted ahead, see prebakePlay). */
const S_BANNER: LabelStyle = { size: 64, fill: ['#fffbe8', '#ffe27a', '#ff9a3a'], stroke: INK, strokeWidth: 10 };
const S_BIG: LabelStyle = { size: 78, fill: ['#ffffff', '#9af0ff', '#4ac8ff'], stroke: INK, strokeWidth: 12 };
const S_TOAST: LabelStyle = { size: 26, color: '#fff2cc', stroke: INK, strokeWidth: 5 };
const S_BTN: LabelStyle = { size: 17, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_KEY: LabelStyle = { size: 15, color: '#ffe08a', stroke: INK, strokeWidth: 4 };
const S_DMG: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_CRIT: LabelStyle = { size: 34, color: '#ffd84a', stroke: INK, strokeWidth: 6 };
const S_HURT: LabelStyle = { size: 30, color: '#ff6a5a', stroke: INK, strokeWidth: 6 };
const S_BOSS: LabelStyle = { size: 20, color: '#ffd0c0', stroke: INK, strokeWidth: 4 };
/** The distance beside an edge arrow ("42m"). */
const S_DIST: LabelStyle = { size: 20, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const DIST_GLYPHS = NUMERIC_GLYPHS + 'm';
const TOASTS = ['rage', 'mechReady', 'beacon', 'fixed', 'domeHit', 'angel', 'hullRevive', 'shield', 'overdrive', 'thunder', 'healed', 'keycard', 'lowHp', 'fixing', 'powerShot',
  'hintMove', 'hintKeys', 'hintSkill', 'hintTouch', 'hintRescue', 'hintKeysObj', 'hintDefend', 'hintClear', 'hintBoss', 'hintMap', 'hintAlert', 'crit',
  'alertDome', 'alertHunt', 'alertEnd', 'nestWake', 'nestDown', 'shielded', 'castaway', 'castHelp', 'burn', 'holdBeacon'];
const BANNERS = ['bossIn', 'mechGo', 'complete', 'levelUp', 'beacon', 'hiveAlert', 'shieldDown'];
const SKILL_ICON: Record<HeroId, string> = { frog: 'p-blast', bee: 'p-storm', flamingo: 'p-pierce', panda: 'p-flame' };

/** Paints the Play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const k of BANNERS) labelTexture(scene, t(k), k === 'mechGo' || k === 'complete' ? S_BIG : S_BANNER);
  for (const k of TOASTS) labelTexture(scene, t(k), S_TOAST);
  bakeFmt(scene, 'alertN', ['n', 'm'], S_BANNER);
  bakeFmt(scene, 'nestsLeft', ['n'], S_TOAST);
  glyphAtlas(scene, S_DIST, DIST_GLYPHS);
  bakeFmt(scene, 'keyN', ['n', 'm'], S_TOAST);
  bakeFmt(scene, 'crystalsN', ['n'], S_TOAST);
  for (const m of MISSIONS) labelTexture(scene, t('m_' + m.n), S_BANNER);
  for (const k of ['dodge', 'skillBtn', 'mech']) labelTexture(scene, t(k), S_BTN);
  for (const k of [t('keySpace'), 'Q', 'E']) labelTexture(scene, k, S_KEY);
  for (const b of ['titan', 'queen', 'king']) labelTexture(scene, t('b_' + b), S_BOSS);
  for (const o of [S_DMG, S_CRIT, S_HURT]) glyphAtlas(scene, o);
}

/** A round action button: a glass disc, an icon, a ring for its cooldown or charge, its words. */
class ActionButton {
  readonly root: Phaser.GameObjects.Container;
  private ring: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Image;
  readonly icon: Phaser.GameObjects.Image;
  presses = 0;
  private pop = 0;
  private lastReady = false;

  constructor(private scene: Phaser.Scene, x: number, y: number, readonly r: number, private kind: 'dodge' | 'skill' | 'mech', icon: string, label: string, keyHint: string, private color: number) {
    this.root = scene.add.container(x, y).setScrollFactor(0).setDepth(9050);
    this.face = scene.add.image(0, 0, BTN_FACE + kind).setDisplaySize(r * 2.2, r * 2.2);
    this.icon = iconImg(scene, 0, -r * 0.14, icon, r * 0.95);
    this.ring = scene.add.graphics();
    const lab = fitWidth(labelAt(scene, 0, r * 0.56, label, S_BTN), r * 1.7);
    this.root.add([this.face, this.ring, this.icon, lab]);
    if (keyHint) this.root.add(labelAt(scene, 0, r + 16, keyHint, S_KEY));
    // a generous hit circle; the press never starts the movement stick
    const R = r * 1.15;
    const zone = scene.add.zone(x, y, R * 2, R * 2).setScrollFactor(0).setDepth(9060)
      .setInteractive(new Phaser.Geom.Circle(R, R, R), Phaser.Geom.Circle.Contains);
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      this.presses++;
      this.kick();
    });
    this.zoneObj = zone;
  }

  private zoneObj: Phaser.GameObjects.Zone;

  take(): boolean { const n = this.presses > 0; this.presses = 0; return n; }
  kick(): void { this.pop = 0.16; }

  setVisible(on: boolean): void { this.root.setVisible(on); if (on) this.zoneObj.setInteractive(); else this.zoneObj.disableInteractive(); }

  /** `k` 0..1 filled; ready lights it; a count badge for the skill's charges. */
  draw(k: number, ready: boolean, time: number, dt: number): void {
    this.pop = Math.max(0, this.pop - dt);
    const g = this.ring.clear();
    const R = this.r * 1.02;
    g.lineStyle(7, 0x0a0620, 0.6).strokeCircle(0, 0, R);
    if (k > 0) g.lineStyle(7, ready ? this.color : 0x8a84b0, 1).beginPath().arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)).strokePath();
    if (ready && this.kind === 'mech') g.lineStyle(4, 0xffffff, 0.4 + Math.sin(time * 8) * 0.3).strokeCircle(0, 0, R + 7);
    this.face.setTexture(BTN_FACE + (ready ? this.kind : 'off'));
    this.icon.setAlpha(ready ? 1 : 0.5);
    const s = 1 + this.pop * 0.6 + (ready && this.kind === 'mech' ? Math.sin(time * 8) * 0.03 : 0);
    this.root.setScale(s);
    if (ready && !this.lastReady && this.kind !== 'dodge') this.scene.tweens.add({ targets: this.root, scale: 1.18, duration: 120, yoyo: true });
    this.lastReady = ready;
  }
}

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (the view's; the GPU memory check finds the renderer through it). */
  world!: World3D;
  mapView!: MapView;
  baseView!: BaseView;
  sim: Mission | null = null;
  run!: RunState;
  meta!: Meta;
  phase: Phase = 'crew';
  panel: Panel | null = null;
  mission: MissionDef | null = null;
  bot: Bot | null = null;
  /** Slows the simulation (the store art's stage). */
  testSpeed = 1;
  /** No banners or hints over the store art's stage. */
  private quiet = false;
  private controls!: Controls;
  private acc = 0;
  private rnd!: () => number;
  private host!: ScreenHost;
  private hpChip!: HudChip;
  private hpBar!: Phaser.GameObjects.Graphics;
  private xpChip!: HudChip;
  private xpBar!: Phaser.GameObjects.Graphics;
  private crystalChip!: HudChip;
  private cardChip!: HudChip;
  private bossChip!: HudChip;
  private bossBar!: Phaser.GameObjects.Graphics;
  private btnDodge!: ActionButton;
  private btnSkill!: ActionButton;
  private btnMech!: ActionButton;
  private threatChip!: HudChip;
  private threatBar!: Phaser.GameObjects.Graphics;
  private mapChip!: HudChip;
  private mapG!: Phaser.GameObjects.Graphics;
  /** Edge arrows (objectives, the castaway, a hunting wave) and their distances. */
  private arrows: { img: Phaser.GameObjects.Image; dist: GlyphText }[] = [];
  private fixRing!: Phaser.GameObjects.Graphics;
  private burnT = 0;
  private wakeToasts = 0;
  private keys = { dodge: false, skill: false, mech: false };
  private dmgPool: GlyphText[] = [];
  private toastImg: Phaser.GameObjects.Image | null = null;
  private lowT = 0;
  private hpShown = -1;
  private mapSel = 0;
  private mapAt = 0;
  private revived = false;
  /** Level-ups won after a mission's end (the orbs fly in): drafted when the next mission starts. */
  private carry = 0;
  private lastEvents = new Set<string>();
  private touch = false;
  /** Frame counters for the timing scripts. */
  perf = { frames: 0 };

  createGame(): void {
    this.meta = loadMeta();
    this.meta.runs++;
    saveMeta(this.meta);
    this.phase = 'crew';
    this.perf.frames = 0;
    this.panel = null;
    this.sim = null;
    this.mission = null;
    this.bot = null;
    this.acc = 0;
    this.testSpeed = 1;
    this.quiet = false;
    this.revived = false;
    this.carry = 0;
    this.keys = { dodge: false, skill: false, mech: false };
    this.dmgPool = [];
    this.toastImg = null;
    this.lowT = 0;
    this.burnT = 0;
    this.wakeToasts = 0;
    this.hpShown = -1;
    this.lastEvents = new Set();
    this.touch = this.sys.game.device.input.touch;
    this.rnd = mulberry((Date.now() & 0xffffff) ^ 0xa57c);
    if (!crewOpen(this.meta, this.meta.crew)) this.meta.crew = 'frog';
    this.run = newRun(isEasy() ? 'easy' : 'normal', this.meta.crew, this.meta.ranks);
    this.mapSel = this.mapAt = Math.min(MISSIONS.length, this.meta.unlocked) - 1;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this, { hero: this.meta.crew });
    this.world = this.view.world;
    this.mapView = new MapView(this.view);
    this.baseView = new BaseView(this.view, this.meta.crew);
    this.baseView.build(this.meta.ranks);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.view.dispose(); this.baseView.dispose(); });
    this.controls = new Controls(this, { joystick: true });
    this.setupHud();
    this.setupButtons();
    this.setupKeys();
    // the run's cards and the mission beside the pause card
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      const ps = this.scene.get('Pause');
      ps?.events.once(Phaser.Scenes.Events.CREATE, () => {
        if (this.isOver) return;
        const m = this.phase === 'play' || this.phase === 'draft' || this.phase === 'brief' ? this.mission : null;
        pauseSides(ps, this.run.cards, m, m ? this.meta.stars[m.n - 1] : 0);
      });
    });
    this.hooks();
    this.showPlayUi(false);
    this.openCrew();
  }

  // ---------------------------------------------------------------- the HUD

  private setupHud(): void {
    const y = HUD_ROW2_Y;
    this.hpBar = this.add.graphics();
    this.hpBar.setData('chipWidth', 150);
    this.hpChip = hudChip(this, HUD_MARGIN, y, { icon: 'ac-p-heart', iconSize: 30, text: '100', minWidth: 90, items: [this.hpBar] });
    this.xpBar = this.add.graphics();
    this.xpBar.setData('chipWidth', 90);
    this.xpChip = hudChip(this, this.hpChip.right + HUD_GAP, y, { icon: 'ac-p-xp', iconSize: 30, text: t('lvl') + ' 1', items: [this.xpBar] });
    this.cardChip = hudChip(this, hudRightEdge(this), y, { align: 'right', icon: 'ac-p-card', iconSize: 30, text: '×0', minWidth: 80 });
    this.crystalChip = hudChip(this, this.cardChip.left - HUD_GAP, y, { align: 'right', icon: 'ac-p-crystal', iconSize: 30, text: '0', minWidth: 90 });
    this.bossBar = this.add.graphics();
    this.bossBar.setData('chipWidth', 300);
    this.bossChip = hudChip(this, this.scale.width / 2, y + 58, { align: 'center', icon: 'ac-p-skull', iconSize: 34, items: [this.bossBar] });
    this.bossChip.setVisible(false);
    this.hud.centerChip.setIcon('ac-p-nest', undefined, 30);
    // the hive alert: a bar filling up (or the countdown to the next attack on the dome)
    this.threatBar = this.add.graphics();
    this.threatBar.setData('chipWidth', 120);
    this.threatChip = hudChip(this, this.scale.width / 2, y, { align: 'center', icon: 'ac-p-alert', iconSize: 30, text: '', items: [this.threatBar] });
    // the minimap: the planet in a round glass chip, north up
    this.mapG = this.add.graphics();
    this.mapG.setData('chipWidth', 156);
    this.mapChip = hudChip(this, HUD_MARGIN, y + 22 + 12 + 86, { height: 172, minWidth: 172, text: '', items: [this.mapG] });
    this.arrows = [ARROW, ARROW, ARROW_CYAN, ARROW_RED].map((key) => {
      const img = this.add.image(0, 0, key).setDepth(9000).setScrollFactor(0).setVisible(false).setDisplaySize(48, 48);
      const dist = new GlyphText(this, 0, 0, '0m', S_DIST, 0.5, DIST_GLYPHS).setDepth(9001).setScrollFactor(0).setVisible(false);
      this.add.existing(dist);
      return { img, dist };
    });
    this.fixRing = this.add.graphics().setDepth(8900);
  }

  private setupButtons(): void {
    const { width, height } = this.scale;
    const k = this.touch ? 1 : 0.78;
    const hero = this.run.hero;
    this.btnDodge = new ActionButton(this, width - 104 * k - 16, height - 108 * k - (this.touch ? 6 : 24), 66 * k, 'dodge', 'p-dodge', t('dodge'), this.touch ? '' : t('keySpace'), 0x5ae8ff);
    this.btnSkill = new ActionButton(this, width - 262 * k - 16, height - 84 * k - (this.touch ? 6 : 24), 54 * k, 'skill', SKILL_ICON[hero], t('skillBtn'), this.touch ? '' : 'Q', 0xff8a2a);
    this.btnMech = new ActionButton(this, width - 104 * k - 16, height - 270 * k - (this.touch ? 6 : 24), 54 * k, 'mech', 'mech-' + hero, t('mech'), this.touch ? '' : 'E', 0xffd84a);
  }

  private showPlayUi(on: boolean): void {
    for (const c of [this.hud.scoreChip, this.hud.centerChip, this.hpChip, this.xpChip, this.crystalChip, this.cardChip, this.threatChip, this.mapChip]) c.setVisible(on);
    this.hud.rightChip.setVisible(false);
    if (!on) this.bossChip.setVisible(false);
    for (const b of [this.btnDodge, this.btnSkill, this.btnMech]) b.setVisible(on);
    if (!on) { for (const a of this.arrows) { a.img.setVisible(false); a.dist.setVisible(false); } this.fixRing.clear(); }
  }

  private refreshHud(dt: number): void {
    const s = this.sim;
    if (!s) return;
    const h = s.hero;
    this.setScore(this.run.score);
    // health
    const k = Math.max(0, h.hp / h.max);
    const W = 150, H = 20;
    const g = this.hpBar.clear();
    g.fillStyle(0x060414, 0.75).fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    const low = k < 0.3;
    const col = low ? (Math.floor(this.time.now / 160) % 2 ? 0xff3b3b : 0xff7a5a) : k < 0.6 ? 0xffc23f : 0x4fe07a;
    if (k > 0) g.fillStyle(col, 1).fillRoundedRect(-W / 2, -H / 2, Math.max(16, W * k), H, 8);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-W / 2 + 3, -H / 2 + 2, Math.max(8, W * k - 6), 5, 3);
    const n = Math.max(0, Math.ceil(h.hp));
    if (n !== this.hpShown) {
      if (n < this.hpShown) this.tweens.add({ targets: this.hpChip, scale: 1.08, duration: 70, yoyo: true });
      this.hpShown = n;
      this.hpChip.setText(String(n));
    }
    // level
    const need = xpNeed(this.run.level);
    this.xpChip.setText(`${t('lvl')} ${this.run.level}`);
    const xg = this.xpBar.clear();
    xg.fillStyle(0x060414, 0.75).fillRoundedRect(-45, -8, 90, 16, 7);
    xg.fillStyle(0xc87aff, 1).fillRoundedRect(-45, -8, Math.max(10, 90 * Math.min(1, this.run.xp / need)), 16, 7);
    this.crystalChip.setText(String(s.stats.crystals));
    this.cardChip.setText('×' + this.run.cards.length);
    // the objective
    const [done, of] = s.progress();
    const d = s.def;
    const ctr = this.hud.centerChip;
    ctr.setTextColor('#ffffff');
    if (d.kind === 'keys') {
      if (s.keys.hold >= 0) { this.hud.setCenter(String(Math.max(0, Math.ceil(s.keys.hold)))); ctr.setIcon('ac-p-clock', undefined, 30); ctr.setTextColor(s.keys.near ? '#9affc0' : '#ffd84a'); }
      else { this.hud.setCenter(`${done}/${of}`); ctr.setIcon('ac-p-key', undefined, 30); }
    }
    else if (d.kind === 'rescue') { this.hud.setCenter(`${done}/${of}`); ctr.setIcon('ac-p-rover', undefined, 32); }
    else if (d.kind === 'defend') { this.hud.setCenter(`${done}/${of}  ·  ${Math.ceil((100 * s.dome.hp) / s.dome.max)}%`); ctr.setIcon('ac-p-dome', undefined, 30); ctr.setTextColor(s.dome.hp < s.dome.max * 0.35 ? '#ff8a7a' : '#ffffff'); }
    else if (d.kind === 'boss' && !s.shielded) { this.hud.setCenter(t('b_' + d.boss)); ctr.setIcon('ac-p-skull', undefined, 30); }
    else { this.hud.setCenter(`${Math.min(done, of)}/${of}`); ctr.setIcon('ac-p-nest', undefined, 32); }
    // the hive alert (or the countdown to the next attack on the dome)
    const tg = this.threatBar.clear();
    const TW = 120;
    tg.fillStyle(0x060414, 0.75).fillRoundedRect(-TW / 2, -8, TW, 16, 7);
    let tk = s.threat, tcol = s.threat > 0.75 ? 0xff5a3a : s.threat > 0.45 ? 0xffb03a : 0xff8ad0;
    let ttext = '';
    if (s.alerts.active) { tk = 1; tcol = Math.floor(this.time.now / 180) % 2 ? 0xff3b3b : 0xff8a5a; }
    else if (d.kind === 'defend') {
      tk = s.alerts.n >= s.alerts.of ? 0 : 1 - s.alerts.next / (s.alerts.n ? OBJ.alertGap : OBJ.firstAlert);
      ttext = s.alerts.n >= s.alerts.of ? '' : String(Math.max(0, Math.ceil(s.alerts.next)));
    } else if (d.kind === 'keys' && s.keys.hold >= 0) { tk = 1; tcol = 0xff8a5a; }
    if (tk > 0) tg.fillStyle(tcol, 1).fillRoundedRect(-TW / 2, -8, Math.max(12, TW * Math.min(1, tk)), 16, 7);
    tg.fillStyle(0xffffff, 0.22).fillRoundedRect(-TW / 2 + 3, -6, Math.max(6, TW * Math.min(1, tk) - 6), 4, 2);
    this.threatChip.setText(ttext);
    this.drawMap(s);
    // the boss
    const b = s.boss;
    if (b && b.state !== 'dead' && s.bossAwake && b.engaged) {
      if (!this.bossChip.visible) {
        this.bossChip.setVisible(true);
        this.bossChip.setScale(0.6);
        this.tweens.add({ targets: this.bossChip, scale: 1, duration: 300, ease: 'Back.easeOut' });
      }
      const bk = Math.max(0, b.hp / b.max);
      const bg = this.bossBar.clear();
      bg.fillStyle(0x060414, 0.8).fillRoundedRect(-150, -10, 300, 20, 8);
      bg.fillStyle(b.rage ? 0xff4a2a : 0xff8a3a, 1).fillRoundedRect(-150, -10, Math.max(14, 300 * bk), 20, 8);
      bg.fillStyle(0xffffff, 0.25).fillRoundedRect(-147, -8, Math.max(8, 300 * bk - 6), 5, 3);
    } else if (this.bossChip.visible) this.bossChip.setVisible(false);
    // the buttons
    const H2 = HERO[this.run.hero];
    const time = this.time.now / 1000;
    const skillK = h.charges > 0 ? 1 : 1 - h.skillCd / (H2.skillCd * s.m.skillCd);
    this.btnSkill.draw(skillK, h.charges > 0 && h.mech <= 0, time, dt);
    this.btnDodge.draw(1 - h.rollCd / (1.6 * s.m.dodgeCd), h.rollCd <= 0 && h.mech <= 0, time, dt);
    this.btnMech.draw(h.mech > 0 ? h.mech / s.m.mechTime : h.charge, h.charge >= 1 && h.mech <= 0, time, dt);
  }

  /** The planet, north up: the rim, pools, the base, nests, objectives, caches, aliens near, the hero. */
  private drawMap(s: Mission): void {
    const g = this.mapG.clear();
    const R = 78, k = R / (WORLD_R + 3);
    const P = s.plan, h = s.hero, L = THEME[s.def.theme];
    const at = (p: Spot): [number, number] => [p.x * k, p.z * k];
    const alert = s.alerts.active > 0;
    g.fillStyle(0x0a0620, 0.5).fillCircle(0, 0, R);
    g.lineStyle(3, alert ? (Math.floor(this.time.now / 200) % 2 ? 0xff4a3a : 0x8a2a2a) : 0x8a84b0, 0.9).strokeCircle(0, 0, R);
    for (const p of P.pools) { const [x, y] = at(p); g.fillStyle(P.lava ? 0xff6a1a : L.pool, P.lava ? 0.85 : 0.45).fillCircle(x, y, Math.max(2, p.r * k)); }
    for (const l of P.landmarks) {
      const [x, y] = at(l);
      if (l.kind === 'rocks') g.fillStyle(0x8a84b0, 0.55).fillCircle(x, y, Math.max(2, l.r * k * 0.8));
      else if (l.kind === 'ship' || l.kind === 'wreck') g.fillStyle(0xc8c4d8, 0.7).fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    // the landing site
    { const [x, y] = at(P.base); g.fillStyle(0x5ae8ff, 1).fillRect(x - 4, y - 4, 8, 8); g.lineStyle(1.5, 0x0a0620, 1).strokeRect(x - 4, y - 4, 8, 8); }
    // caches still full, the castaway
    for (const p of s.picks) if (p.kind === 'jar' && p.t >= 1 && !p.pull) { const [x, y] = at(p); g.fillStyle(0x7ad8ff, 0.9).fillCircle(x, y, 1.6); }
    if (s.castaway && !s.castaway.saved) { const [x, y] = at(s.castaway); g.fillStyle(0x9af0ff, 1).fillCircle(x, y, 3.5); g.lineStyle(1.5, 0x0a0620, 1).strokeCircle(x, y, 3.5); }
    // nests: triangles (the objective's big and outlined), fallen ones a dark cross
    for (const n of s.nests) {
      const [x, y] = at(n);
      if (!n.alive) { g.lineStyle(2, 0x4a3a5a, 0.9).lineBetween(x - 3, y - 3, x + 3, y + 3).lineBetween(x - 3, y + 3, x + 3, y - 3); continue; }
      const big = n.target || n.guard, r = big ? 6 : 4.5;
      g.fillStyle(n.awake ? 0xff3a5a : 0xd84a8a, 1).fillTriangle(x, y - r, x - r, y + r * 0.8, x + r, y + r * 0.8);
      if (big) g.lineStyle(1.5, 0xffffff, 0.9).strokeTriangle(x, y - r, x - r, y + r * 0.8, x + r, y + r * 0.8);
    }
    // the objective's own marks
    for (const r of s.rovers) { const [x, y] = at(r); g.fillStyle(r.fixed ? 0x3a6a4a : 0x6affa0, 1).fillRect(x - 3.5, y - 3.5, 7, 7); }
    for (const p of s.picks) if (p.kind === 'key') { const [x, y] = at(p); g.fillStyle(0xffe04a, 1).fillTriangle(x, y - 5, x + 4, y, x, y + 5).fillTriangle(x, y - 5, x - 4, y, x, y + 5); }
    if (s.def.kind === 'keys' && s.keys.hold >= 0) { const [x, y] = at(P.base); g.lineStyle(2, 0x8af0ff, 0.6 + Math.sin(this.time.now / 150) * 0.4).strokeCircle(x, y, OBJ.beaconR * k + 2); }
    if (s.def.kind === 'defend') { const [x, y] = at(s.dome); g.lineStyle(2, 0x8af0ff, 1).strokeCircle(x, y, 6); }
    const b = s.boss;
    if (b && b.state !== 'dead') { const [x, y] = at(b); g.fillStyle(0xff6a3a, 1).fillCircle(x, y, 5.5); g.lineStyle(2, 0xffffff, 1).strokeCircle(x, y, 5.5); }
    // aliens close by (fighting or hunting)
    for (const f of s.foes) {
      if (f.state === 'dead' || f.sleep || f.kind === 'nest' || f.kind === 'boss' || !f.engaged) continue;
      if (Math.abs(f.x - h.x) > 34 || Math.abs(f.z - h.z) > 34) continue;
      const [x, y] = at(f);
      g.fillStyle(f.wave ? 0xff3b3b : 0xff9a7a, 1).fillCircle(x, y, f.kind === 'brute' ? 2.2 : 1.5);
    }
    // the hero: an arrowhead the way it faces
    const [hx, hy] = at(h);
    const a = h.face, c = Math.cos(a), sn = Math.sin(a);
    const pt = (f: number, sd: number): [number, number] => [hx + sn * f + c * sd, hy + c * f - sn * sd];
    const [ax, ay] = pt(7, 0), [bx, by] = pt(-4, 4.5), [cx, cy] = pt(-4, -4.5);
    g.fillStyle(0xffffff, 1).fillTriangle(ax, ay, bx, by, cx, cy);
    g.lineStyle(1.5, 0x0a0620, 1).strokeTriangle(ax, ay, bx, by, cx, cy);
  }

  /** Arrows at the screen's edge (with the distance) to the objectives, the castaway and a hunting wave off screen; rings round what is being fixed. */
  private syncMarkers(): void {
    const s = this.sim!;
    const h = s.hero;
    this.fixRing.clear();
    const ring = (x: number, z: number, k: number, col: number) => {
      const p = this.view.screen(x, 2.6, z);
      this.fixRing.lineStyle(9, 0x0a0620, 0.6).strokeCircle(p.x, p.y, 30);
      this.fixRing.lineStyle(7, col, 1).beginPath().arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
    };
    for (const r of s.rovers) if (!r.fixed && r.prog > 0) ring(r.x, r.z, r.prog, 0x5affa0);
    if (s.castaway && !s.castaway.saved && s.castaway.prog > 0) ring(s.castaway.x, s.castaway.z, s.castaway.prog, 0x9af0ff);
    const want: (Spot | null)[] = [null, null, null, null];
    if (this.phase === 'play') {
      const objs = s.objectives();
      want[0] = objs[0] ?? null;
      want[1] = objs[1] ?? null;
      if (s.castaway && !s.castaway.saved && Math.hypot(s.castaway.x - h.x, s.castaway.z - h.z) < 50) want[2] = s.castaway;
      // a hunting wave on its way: the middle of it
      let wx = 0, wz = 0, wn = 0;
      for (const f of s.foes) if (f.wave && f.state !== 'dead' && f.mode === 'hunt') { wx += f.x; wz += f.z; wn++; }
      if (wn) want[3] = { x: wx / wn, z: wz / wn };
    }
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2 + 30;
    want.forEach((p, i) => {
      const a = this.arrows[i];
      if (!p) { a.img.setVisible(false); a.dist.setVisible(false); return; }
      const sp = this.view.screen(p.x, 1.2, p.z);
      const inside = sp.x > 60 && sp.x < width - 60 && sp.y > 140 && sp.y < height - 60;
      if (inside) { a.img.setVisible(false); a.dist.setVisible(false); return; }
      // aim from the screen's middle along the ground direction (the screen point of far things can flip)
      const dx = p.x - h.x, dz = p.z - h.z;
      const ang = Math.atan2(dz * 0.8, dx);
      const mx = 54, top = 150, bottom = 60;
      const kx = (Math.cos(ang) > 0 ? width - mx - cx : cx - mx) / Math.max(1e-3, Math.abs(Math.cos(ang)));
      const ky = (Math.sin(ang) > 0 ? height - bottom - cy : cy - top) / Math.max(1e-3, Math.abs(Math.sin(ang)));
      const kk = Math.min(kx, ky);
      const x = cx + Math.cos(ang) * kk, y = cy + Math.sin(ang) * kk;
      const pulse = 1 + Math.sin(this.time.now / 120 + i) * 0.08;
      a.img.setVisible(true).setPosition(x, y).setRotation(ang).setScale((48 / 64) * pulse * (i === 1 ? 0.8 : 1)).setAlpha(i === 1 ? 0.75 : 1);
      a.dist.setVisible(true).setText(`${Math.round(Math.hypot(dx, dz))}m`).setPosition(x - Math.cos(ang) * 40, y - Math.sin(ang) * 34);
    });
  }

  // ---------------------------------------------------------------- keys

  private setupKeys(): void {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.isOver) return;
      if (this.panel && !this.panel.closed) { if (this.panel.key(e.code)) e.preventDefault(); return; }
      if (this.phase !== 'play' || isModalOpen(this)) return;
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': case 'ShiftLeft': case 'ShiftRight': this.keys.dodge = true; this.btnDodge.kick(); break;
        case 'KeyQ': case 'KeyJ': this.keys.skill = true; this.btnSkill.kick(); break;
        case 'KeyE': case 'KeyK': this.keys.mech = true; this.btnMech.kick(); break;
      }
    });
  }

  private readInput(): Input {
    const inp: Input = {
      mx: this.controls.axisX, mz: this.controls.axisY,
      dodge: this.keys.dodge || this.btnDodge.take(), skill: this.keys.skill || this.btnSkill.take(), mech: this.keys.mech || this.btnMech.take(),
    };
    this.keys = { dodge: false, skill: false, mech: false };
    return inp;
  }

  // ---------------------------------------------------------------- the run's screens

  private openCrew(): void {
    this.phase = 'crew';
    this.view.setMode('base');
    this.baseView.camera(this.world.camera);
    this.baseView.crew.play('Wave', { once: true, restart: true, then: 'Idle_Gun' });
    this.panel = new CrewScreen(this, this.host, this.meta, this.meta.crew, (h) => this.setCrew(h), (h) => {
      this.setCrew(h);
      this.meta.crew = h;
      saveMeta(this.meta);
      this.panel = null;
      this.openMap();
    });
  }

  private setCrew(h: HeroId): void {
    this.run.hero = h;
    this.view.setHero(h);
    this.mapView.setHero(h);
    this.baseView.setHero(h);
    setIcon(this.btnSkill.icon, SKILL_ICON[h], this.btnSkill.r * 0.95);
    setIcon(this.btnMech.icon, 'mech-' + h, this.btnMech.r * 0.95);
  }

  private openMap(): void {
    this.phase = 'map';
    this.showPlayUi(false);
    this.view.setMode('map');
    this.mapView.camera(this.world.camera);
    this.mapView.show(this.meta.unlocked, this.mapSel, this.mapAt);
    this.world.camera.updateMatrixWorld();
    const pos = (i: number) => this.world.toScreen(this.mapView.planetAt(i).clone());
    this.panel = new MapScreen(this, this.host, this.meta, this.mapSel, pos, (i) => { this.mapSel = i; this.mapView.select(i); }, (i) => {
      this.panel = null;
      this.mapSel = i;
      this.sfx('warp', { volume: 0.5 });
      this.mapView.travel(i, () => { this.mapAt = i; this.openBrief(i); });
    }, () => { this.panel = null; this.openBase(); });
  }

  private openBrief(i: number): void {
    this.phase = 'brief';
    const def = MISSIONS[i];
    this.mission = def;
    this.sim = new Mission(def, this.run, (this.rnd() * 1e9) | 0);
    this.sim.pendingLevels = this.carry;
    this.carry = 0;
    this.bot?.setSim(this.sim);
    this.view.setMode('arena');
    this.view.buildMission(def, this.sim);
    this.panel = new BriefScreen(this, this.host, def, this.meta.stars[i], () => { this.panel = null; this.startMission(); });
  }

  private startMission(): void {
    const s = this.sim!;
    this.phase = 'play';
    this.revived = false;
    this.hpShown = -1;
    this.toastImg?.destroy();
    this.toastImg = null;
    this.showPlayUi(true);
    this.sfx('land', { volume: 0.5 });
    this.banner(t('m_' + s.def.n));
    // the first missions teach the buttons and the way round a planet
    const later = (ms: number, key: string) => this.time.delayedCall(ms, () => { if (this.phase === 'play') this.toast(t(key), 5); });
    const kindHint = { rescue: 'hintRescue', keys: 'hintKeysObj', defend: 'hintDefend', clear: 'hintClear', boss: 'hintBoss' }[s.def.kind];
    if (!this.meta.coached || s.def.n <= 2) {
      later(2200, this.touch ? 'hintMove' : 'hintKeys');
      later(7600, kindHint);
      later(13000, 'hintMap');
      later(18400, this.touch ? 'hintTouch' : 'hintSkill');
      if (s.def.n === 1) later(30000, 'hintAlert');
      this.meta.coached = true;
      saveMeta(this.meta);
    } else later(2600, kindHint);
  }

  /** A level-up: a draft over the paused mission (one at a time). */
  private openDraft(): void {
    const s = this.sim!;
    this.phase = 'draft';
    this.sfx('levelup', { volume: 0.55 });
    const deal = () => rollCards(this.run.cards, this.rnd);
    const offer = deal();
    if (!offer.length) { s.tookLevel(); this.phase = 'play'; return; }
    this.panel = new DraftScreen(this, this.host, this.run.level - s.pendingLevels + 1, this.run.cards, offer, deal, (id) => {
      this.panel = null;
      this.takeCard(id);
      s.tookLevel();
      this.phase = 'play';
    });
  }

  private takeCard(id: CardId): void {
    const s = this.sim!;
    this.run.cards.push(id);
    s.refreshMods();
    if (id === 'medic') s.heal(0.35);
    this.tweens.add({ targets: this.cardChip, scale: 1.25, duration: 140, yoyo: true });
    void CARD;
  }

  private missionWon(): void {
    const s = this.sim!, def = s.def, i = def.n - 1;
    this.phase = 'won';
    this.banner(t('complete'), S_BIG);
    this.sfx('fanfare', { volume: 0.6 });
    this.time.delayedCall(2600, () => {
      if (this.isOver) return;
      const stars = s.stars();
      const nStars = stars.filter(Boolean).length;
      const bonus = 400 * def.n, fast = Math.max(0, Math.round((def.par - s.stats.time) * 4)), starBonus = nStars * 250;
      this.run.score += bonus + fast + starBonus;
      this.setScore(this.run.score);
      const crystals = crystalsFor(def.n, nStars) + s.stats.crystals;
      const before = this.meta.unlocked;
      this.meta.crystals += crystals;
      this.meta.stars[i] = Math.max(this.meta.stars[i], nStars);
      this.meta.cleared++;
      if (def.n >= this.meta.unlocked) this.meta.unlocked = Math.min(MISSIONS.length + 1, def.n + 1);
      saveMeta(this.meta);
      this.run.depth++;
      this.carry += s.pendingLevels;
      s.pendingLevels = 0;
      const join = (['flamingo', 'panda'] as HeroId[]).find((h) => HERO[h].unlock >= before && HERO[h].unlock < this.meta.unlocked);
      this.phase = 'summary';
      this.showPlayUi(false);
      this.mapSel = this.mapAt = Math.min(MISSIONS.length - 1, def.n < MISSIONS.length && def.n + 1 <= this.meta.unlocked ? def.n : i);
      this.panel = new SummaryScreen(this, this.host, { n: def.n, stars, kills: s.stats.kills, time: s.stats.time, bonus, fast, starBonus, score: this.run.score, crystals, join }, () => {
        this.panel = null;
        if (def.n === MISSIONS.length) { this.phase = 'end'; this.endGame({ win: true, title: t('galaxySaved'), delay: 200 }); return; }
        this.openBase();
      });
    });
  }

  private openBase(): void {
    this.phase = 'base';
    this.showPlayUi(false);
    this.view.setMode('base');
    this.baseView.build(this.meta.ranks);
    this.baseView.camera(this.world.camera);
    this.baseView.crew.play('Yes', { once: true, restart: true, then: 'Idle_Gun' });
    this.panel = new BaseScreen(this, this.host, this.meta, () => {
      this.baseView.build(this.meta.ranks);
      this.baseView.crew.play('Yes', { once: true, restart: true, then: 'Idle_Gun' });
      this.view.glow.emit(0, 2, -2, 0x9ae8ff, 20, { speed: 3, up: 3, life: 0.6, spread: 4 });
    }, () => { this.panel = null; this.openMap(); });
  }

  /** A rewarded continue: the hero gets back up (or the dome is patched) and the mission goes on. */
  revive(): void {
    this.revived = true;
    if (!this.sim || this.phase !== 'end' || this.sim.phase !== 'lost') return;
    this.sim.revive();
    this.view.heroPose = 'play';
    this.phase = 'play';
    this.showPlayUi(true);
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.perf.frames++;
    // the core shows the HUD after createGame: only a mission shows it
    if (this.perf.frames === 1) this.showPlayUi(this.phase === 'play');
    const s = this.sim;
    if (s && (this.phase === 'play' || this.phase === 'won' || this.phase === 'end')) {
      this.acc += dt * this.testSpeed;
      let n = 0;
      while (this.acc >= DT && n < 4) {
        this.acc -= DT;
        n++;
        const inp = this.phase === 'play' ? (this.bot ? this.bot.input(DT) : this.readInput()) : NO_INPUT;
        s.step(DT, inp);
        this.handleEvents();
        if (this.phase === 'play' && s.pendingLevels > 0) { this.openDraft(); break; }
        if (this.phase !== 'play' && this.phase !== 'won' && this.phase !== 'end') break;
      }
      if (n >= 4) this.acc = 0;
    }
    if (s && this.view.mode === 'arena') {
      this.view.sync(s, this.phase === 'draft' || this.phase === 'brief' ? 0 : dt * this.testSpeed);
      if (this.phase === 'play' || this.phase === 'won' || this.phase === 'draft') { this.refreshHud(dt); this.syncMarkers(); }
    }
    if (this.view.mode === 'map') { this.mapView.update(dt); this.view.glow.update(dt); }
    if (this.view.mode === 'base') { this.baseView.update(dt); this.view.glow.update(dt); }
    // low health
    this.burnT -= dt;
    if (s && this.phase === 'play' && s.hero.alive) {
      this.lowT -= dt;
      if (s.hero.hp < s.hero.max * 0.3 && this.lowT <= 0) { this.lowT = 4; this.sfx('lowhp', { volume: 0.35 }); this.toast(t('lowHp'), 1.6); }
    }
  }

  private handleEvents(): void {
    const s = this.sim!;
    this.lastEvents.clear();
    for (const ev of s.events) {
      this.view.handle(ev, s);
      this.react(ev);
    }
    s.events.length = 0;
  }

  /** Sounds, numbers and banners for a simulation event. */
  private react(ev: SimEvent): void {
    const s = this.sim!, v = this.view;
    const once = (k: string) => { if (this.lastEvents.has(k)) return false; this.lastEvents.add(k); return true; };
    switch (ev.type) {
      case 'shoot': if (once('shoot')) this.sfx('shot_' + ev.kind, { volume: ev.kind === 'sting' ? 0.22 : 0.35 }); if (ev.big) { this.sfx('power', { volume: 0.3 }); } break;
      case 'hit': if (ev.id >= 0) this.dmgNum(ev.x, ev.z, ev.dmg, ev.crit ? S_CRIT : S_DMG); if (once('hit')) this.sfxAt('hit', v.screen(ev.x, 1, ev.z).x, { volume: 0.25 }); break;
      case 'kill': {
        const big = ev.kind === 'brute' || ev.kind === 'boss' || ev.elite;
        if (once('kill')) this.sfxAt(ev.kind === 'boss' ? 'bossDie' : big ? 'boom' : 'pop', v.screen(ev.x, 1, ev.z).x, { volume: big ? 0.55 : 0.35 });
        if (ev.kind === 'boss') { this.cameras.main.flash(260, 255, 240, 200); this.sfx('scream', { volume: 0.5 }); }
        break;
      }
      case 'hurt': {
        this.sfx('hurt', { volume: 0.5 });
        this.cameras.main.flash(120, 255, 60, 40, false);
        const p = v.screen(s.hero.x, 2.4, s.hero.z);
        this.dmgNum(s.hero.x, s.hero.z, ev.dmg, S_HURT, p);
        break;
      }
      case 'blocked': this.sfx('shieldHit', { volume: 0.5 }); this.toastAt(t('shield'), s.hero.x, s.hero.z); break;
      case 'die': this.sfx('death', { volume: 0.6 }); break;
      case 'revive': this.sfx('revive', { volume: 0.6 }); this.toastAt(t(ev.how === 'angel' ? 'angel' : 'hullRevive'), s.hero.x, s.hero.z); break;
      case 'dodge': this.sfx('roll', { volume: 0.4 }); break;
      case 'punch': this.sfx('punch', { volume: 0.5 }); break;
      case 'kick': this.sfx('kick', { volume: 0.6 }); break;
      case 'skill': this.sfx('skill_' + ev.hero, { volume: 0.55 }); break;
      case 'boom': {
        if (ev.kind === 'slam') { this.sfx('slam', { volume: 0.5 }); this.cameras.main.shake(160, 0.006); }
        else if (ev.kind === 'meteor' || ev.kind === 'leap' || ev.kind === 'mech') { this.sfx('bigBoom', { volume: 0.6 }); this.cameras.main.shake(220, 0.01); }
        else if (ev.kind === 'nova' || ev.kind === 'wave' || ev.kind === 'decoy') this.sfx('nova', { volume: 0.45 });
        else if (once('boom')) this.sfx('ember', { volume: 0.3 });
        break;
      }
      case 'mechReady': this.sfx('ready', { volume: 0.55 }); this.toast(t('mechReady'), 2); break;
      case 'mechOn': this.sfx('mechOn', { volume: 0.7 }); this.banner(t('mechGo'), S_BIG); this.cameras.main.flash(200, 255, 240, 160); break;
      case 'mechOff': this.sfx('mechOff', { volume: 0.5 }); break;
      case 'pickup': {
        const x = v.screen(ev.x, 1, ev.z).x;
        if (ev.kind === 'xp') { if (once('xp')) this.sfxAt('gem', x, { volume: 0.25 }); }
        else if (ev.kind === 'health') { this.sfxAt('heal', x, { volume: 0.5 }); this.toastAt(t('healed'), ev.x, ev.z); }
        else if (ev.kind === 'bullets') { this.sfxAt('ammo', x, { volume: 0.5 }); this.toastAt(t('overdrive'), ev.x, ev.z); }
        else if (ev.kind === 'thunder') { this.sfxAt('thunder', x, { volume: 0.55 }); this.toastAt(t('thunder'), ev.x, ev.z); }
        else if (ev.kind === 'jar') { this.sfxAt('coins', x, { volume: 0.5 }); this.fmtToastAt('crystalsN', { n: ev.v }, ev.x, ev.z); this.tweens.add({ targets: this.crystalChip, scale: 1.2, duration: 120, yoyo: true }); }
        break;
      }
      case 'level': this.sfx('levelup', { volume: 0.4 }); break;
      case 'alert': {
        this.fmtBanner('alertN', { n: ev.n, m: ev.of }, ev.of ? undefined : t('hiveAlert'));
        this.sfx('alarm', { volume: 0.45 });
        this.time.delayedCall(900, () => { if (this.phase === 'play') this.toast(t(ev.dome ? 'alertDome' : 'alertHunt'), 2.2); });
        this.cameras.main.shake(260, 0.004);
        break;
      }
      case 'alertEnd': this.sfx('fixed', { volume: 0.4 }); this.toast(t('alertEnd'), 1.6); break;
      case 'nestWake': {
        this.sfxAt('rage', v.screen(ev.x, 1, ev.z).x, { volume: 0.3 });
        if (this.wakeToasts++ < 2) this.toastAt(t('nestWake'), ev.x, ev.z);
        break;
      }
      case 'nestDown': {
        this.sfxAt('bigBoom', v.screen(ev.x, 1, ev.z).x, { volume: 0.65 });
        this.sfx('scream', { volume: 0.35 });
        this.cameras.main.shake(260, 0.009);
        this.toastAt(t('nestDown'), ev.x, ev.z);
        if (s.def.kind === 'clear' && ev.left > 0) this.time.delayedCall(900, () => { if (this.phase === 'play') this.fmtToastAt('nestsLeft', { n: ev.left }, s.hero.x, s.hero.z); });
        break;
      }
      case 'shieldDown': this.sfx('power', { volume: 0.6 }); this.banner(t('shieldDown')); break;
      case 'castaway': this.sfx('revive', { volume: 0.6 }); this.toastAt(t('castaway'), ev.x, ev.z); this.tweens.add({ targets: this.hpChip, scale: 1.15, duration: 120, yoyo: true }); break;
      case 'fixing': this.sfx('tele', { volume: 0.4 }); this.toast(t('fixing'), 1.6); break;
      case 'burn': if (this.burnT <= 0) { this.burnT = 3; this.toast(t('burn'), 1.2); } break;
      case 'portal': if (once('portal')) this.sfxAt('portal', v.screen(ev.x, 1, ev.z).x, { volume: 0.2 }); break;
      case 'spit': if (once('spit')) this.sfxAt('spit', v.screen(ev.x, 1, ev.z).x, { volume: 0.35 }); break;
      case 'tele': if (once('tele')) this.sfx('tele', { volume: 0.3 }); break;
      case 'crate': this.sfx('crate', { volume: 0.5 }); break;
      case 'key': this.sfx('key', { volume: 0.6 }); this.fmtToastAt('keyN', { n: ev.got, m: ev.of }, s.hero.x, s.hero.z); break;
      case 'beacon': this.sfx('beacon', { volume: 0.6 }); this.banner(t('beacon')); this.cameras.main.shake(200, 0.004); break;
      case 'fixed': this.sfx('fixed', { volume: 0.6 }); this.toastAt(t('fixed'), s.rovers[ev.i].x, s.rovers[ev.i].z); break;
      case 'domeHit': if (once('dome') && Math.random() < 0.15) this.sfx('domeHit', { volume: 0.4 }); if (ev.hp < ev.max * 0.5 && this.lowT <= 0) { this.lowT = 5; this.toast(t('domeHit'), 2); } break;
      case 'boss': {
        this.sfx('bossIn', { volume: 0.6 }); this.banner(t('bossIn')); this.cameras.main.shake(400, 0.008);
        if (s.shielded) this.time.delayedCall(1500, () => { if (this.phase === 'play') this.toast(t('shielded'), 2.4); });
        break;
      }
      case 'rage': this.sfx('rage', { volume: 0.6 }); this.toast(t('rage'), 2); break;
      case 'chain': this.sfx('zap', { volume: 0.4 }); break;
      case 'win': this.missionWon(); break;
      case 'lose': {
        this.phase = 'end';
        this.sfx('lose', { volume: 0.6 });
        this.endGame({ title: t(ev.why === 'dome' ? 'loseDome' : 'loseHero'), delay: 1700 });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- feedback

  private banner(s: string, style: LabelStyle = S_BANNER): void {
    if (this.quiet) return;
    const { width } = this.scale;
    const img = labelAt(this, width / 2, 238, s, style).setDepth(9100).setScrollFactor(0);
    fitWidth(img, width - 260);
    const sc = img.scale;
    img.setScale(sc * 0.3).setAlpha(0);
    this.tweens.add({ targets: img, scale: sc, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: 206, delay: 1150, duration: 380, onComplete: () => img.destroy() });
  }

  /** A banner with values ("Attack 2/5"); with `head`, that word instead (the open hive alert). */
  private fmtBanner(key: string, vals: Record<string, number>, head?: string): void {
    if (this.quiet) return;
    if (head) { this.banner(head); return; }
    const line = new FmtLine(this, this.scale.width / 2, 238, S_BANNER).set(key, vals).setDepth(9100).setScrollFactor(0);
    line.setScale(0.3).setAlpha(0);
    this.add.existing(line);
    this.tweens.add({ targets: line, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line, alpha: 0, y: 206, delay: 1150, duration: 380, onComplete: () => line.destroy() });
  }

  /** A line over the bottom middle (hints, warnings). */
  private toast(s: string, hold = 1.2): void {
    if (this.quiet) return;
    this.toastImg?.destroy();
    const img = labelAt(this, this.scale.width / 2 - 120, this.scale.height - 60, s, S_TOAST).setDepth(9050);
    fitWidth(img, this.scale.width - 560);
    this.toastImg = img;
    const sc = img.scale;
    img.setScale(sc * 0.6);
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: hold * 1000, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  /** A word rising over a point of the arena. */
  private toastAt(s: string, x: number, z: number): void {
    const p = this.view.screen(x, 2.6, z);
    const img = labelAt(this, p.x, p.y, s, S_TOAST).setDepth(9040);
    fitWidth(img, 360, 0.85);
    const sc = img.scale;
    img.setScale(sc * 0.5);
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: p.y - 46, delay: 800, duration: 350, onComplete: () => img.destroy() });
  }

  private fmtToastAt(key: string, vals: Record<string, number>, x: number, z: number): void {
    const p = this.view.screen(x, 2.6, z);
    const line = new FmtLine(this, p.x, p.y, S_TOAST).set(key, vals).setDepth(9040);
    this.add.existing(line);
    line.setScale(0.5);
    this.tweens.add({ targets: line, scale: 0.9, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line, alpha: 0, y: p.y - 46, delay: 800, duration: 350, onComplete: () => line.destroy() });
  }

  /** A damage number popping off a point (pooled glyph lines: no new textures). */
  private dmgNum(x: number, z: number, n: number, style: LabelStyle, at?: { x: number; y: number }): void {
    if (this.dmgPool.length > 26) {
      const old = this.dmgPool.shift()!;
      this.tweens.killTweensOf(old);
      old.destroy();
    }
    const p = at ?? this.view.screen(x + (Math.random() - 0.5) * 0.8, 2.2, z);
    const g = new GlyphText(this, p.x, p.y, String(n), style, 0.5).setDepth(9030);
    this.add.existing(g);
    this.dmgPool.push(g);
    g.setScale(style === S_CRIT ? 0.6 : 0.45);
    this.tweens.add({ targets: g, scale: style === S_CRIT ? 1.1 : 0.8, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({ targets: g, y: p.y - 44, alpha: 0, delay: 260, duration: 460, onComplete: () => { const i = this.dmgPool.indexOf(g); if (i >= 0) this.dmgPool.splice(i, 1); g.destroy(); } });
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__astro = {
      iconSheet: (keys?: string[]) => renderIconSheet(this.world.renderer, keys),
      state: () => ({
        phase: this.phase, mission: this.mission?.n ?? 0, time: this.sim?.time ?? 0, hp: this.sim?.hero.hp ?? 0, level: this.run.level, score: this.run.score,
        cards: this.run.cards, foes: this.sim?.alive ?? 0, simPhase: this.sim?.phase, unlocked: this.meta.unlocked, crystals: this.meta.crystals,
        textures: this.textures.getTextureKeys().length,
      }),
      /** The autopilot plays (and picks through the drafts). */
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim, SKILL.good, this.rnd) : null; },
      /** Skips the screens to a mission in play (optionally with a level and cards). */
      skip: (o: { mission?: number; level?: number; cards?: CardId[]; hero?: HeroId } = {}) => this.skipTo(o),
      /** Runs the mission's simulation ahead headless (seconds; level-ups are drafted by the bot). */
      fast: (sec: number) => this.fastForward(sec),
      /** Opens a screen for a screenshot. */
      open: (which: string) => this.openForShot(which),
      /** The store-art stage: a heroic fight. */
      stage: (name = 'busy') => this.stage(name),
      key: (code: string) => this.panel?.key(code),
      /** A close-up camera relative to the hero for screenshots (no arguments: the game's camera). */
      cam: (pos?: number[], look?: number[]) => { this.view.shotCam = pos && look ? [pos, look] : null; },
      meta: (m: Partial<Meta>) => { Object.assign(this.meta, m); saveMeta(this.meta); },
      play: this,
    };
  }

  private closePanel(): void {
    this.panel?.close();
    this.panel = null;
  }

  skipTo(o: { mission?: number; level?: number; cards?: CardId[]; hero?: HeroId }): void {
    this.closePanel();
    if (o.hero) this.setCrew(o.hero);
    if (o.level) this.run.level = o.level;
    if (o.cards) this.run.cards = [...o.cards];
    const i = Math.max(0, Math.min(MISSIONS.length - 1, (o.mission ?? 1) - 1));
    this.openBrief(i);
    this.closePanel();
    this.startMission();
  }

  fastForward(sec: number): void {
    const s = this.sim;
    if (!s) return;
    const bot = this.bot ?? new Bot(s, SKILL.good, this.rnd);
    for (let i = 0; i < Math.round(sec / DT) && s.phase === 'play'; i++) {
      s.step(DT, bot.input(DT));
      for (const ev of s.events) this.view.handle(ev, s);
      s.events.length = 0;
      while (s.pendingLevels > 0) {
        const offer = rollCards(this.run.cards, this.rnd);
        if (offer.length) this.takeCard(offer[0]);
        s.tookLevel();
      }
    }
  }

  private openForShot(which: string): void {
    this.closePanel();
    switch (which) {
      case 'crew': this.openCrew(); break;
      case 'map': this.openMap(); break;
      case 'brief': this.openBrief(this.mapSel); break;
      case 'draft': if (this.sim) { this.phase = 'draft'; this.panel = new DraftScreen(this, this.host, this.run.level, this.run.cards, rollCards(this.run.cards, this.rnd), () => rollCards(this.run.cards, this.rnd), (id) => { this.panel = null; this.takeCard(id); this.phase = 'play'; }); } break;
      case 'summary': {
        const n = this.mission?.n ?? 1;
        this.phase = 'summary';
        this.showPlayUi(false);
        this.panel = new SummaryScreen(this, this.host, { n, stars: [true, true, false], kills: 148, time: 163, bonus: 400 * n, fast: 0, starBonus: 500, score: Math.max(this.run.score, 12840), crystals: 96, join: n === 4 ? 'flamingo' : undefined }, () => { this.panel = null; });
        break;
      }
      case 'base': this.openBase(); break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /**
   * The store art's heroic fight: the Dune Titan's lair, its hives just broken, the swarm thick
   * round the crew member, who has just called the mech; the simulation then runs slowly so every
   * frame is busy.
   */
  private stage(name: string): void {
    if (name !== 'busy') return;
    this.quiet = true;
    this.skipTo({ mission: 4, level: 9, cards: ['twin', 'blades', 'buddy', 'rapid'] });
    const s = this.sim!;
    this.bot = new Bot(s, SKILL.good, mulberry(4));
    // the lair's hives fall, the Titan wakes and comes at the crew member
    for (const n of s.nests) if (n.guard) { const f = s.foes.find((o) => o.id === n.id); if (f) s.damage(f, 1e6, false, 0, 0, 0, false, false); }
    const b = s.boss!;
    s.hero.x = b.x + 1.5; s.hero.z = b.z + 9;
    s.hero.hp = s.hero.max;
    s.hero.charge = 1;
    this.fastForward(0.4);
    b.x = s.hero.x + 2.5; b.z = s.hero.z - 4.5; b.cd = 3;
    s.rush(16);
    this.fastForward(0.25);
    s.step(DT, { mx: 0, mz: 0, dodge: false, skill: false, mech: true });
    for (const ev of s.events) this.view.handle(ev, s);
    s.events.length = 0;
    this.fastForward(0.5);
    this.view.follow(s, 1, true);
    this.time.removeAllEvents();
    this.testSpeed = 0.35;
  }
}
