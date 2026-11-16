// Hex Realm: the Play scene. One session of the campaign: the hex overworld (walk hex to hex by
// tap or keys, the fog lifts, encounters and camps start fights, places open their dungeons, the
// village its screens) and the battles (the simulation at a fixed 60 Hz, drawn in 3D, read from
// the stick, the action buttons and the keys, with hit-stop, banners, damage numbers and sounds).
// The first run starts with the class choice and a short, skippable training; first-time hints
// follow. A session ends when the hero falls, a boss chapter is won or the player ends the day at
// the inn: a summary card, then the result screen with the campaign's renown as the score.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, txt, t, isEasy, hudChip, HudChip, shake, flash, playMusic,
  HUD_MARGIN, HUD_ROW2_Y, HUD_GAP, hudRightEdge, themeCard, overlayHeadingStyle, labelAt, fitWidth, Para, FmtLine, GlyphText, KitButton,
  type LabelStyle,
} from '@core';
import type { World3D } from '@core/three';
import { Battle, NO_INPUT, type Input, type BattleEvent } from './battle';
import { Campaign, type Fight, type Spoils } from './campaign';
import { View } from './view';
import { BattleBot, MapBot, SKILL } from './bot';
import {
  DT, CLASS, FOE, POWER_IDS, POWER_COLOR, BOSS_KINDS, MINIBOSS_KINDS, xpToNext, CYCLE_LEVELS,
  PLACE_IDS, type ClassId, type PowerId, type FoeKind, type PlaceId, type Mode,
} from './defs';
import { neighbours, CAMPS, BRIDGE, PLACE_HEX, type Hex } from './hexmap';
import { groundY } from './mapview';
import { icon, makeArt } from './art';
import { HpBar, PowerChips, BossBar, actionButton, drawButton, showButton, banner, bossIntro, type ActionButton } from './ui';
import { VillageScreen, HeroScreen, ClassScreen, MapScreen, LootScreen, OVERLAY_DEPTH, S_MAP_TAG, type Panel, type ScreenHost } from './screens';
import { SUMMARY_W, SUMMARY_H, TUT_W, TUT_H, HINT_H } from './sizes';

const STEP = DT;
/** Battle keys (besides the held ones read each frame). */
const BATTLE_KEYS: Record<string, 'attack' | 'dodge' | 'skill1' | 'skill2' | 'potion'> = {
  KeyJ: 'attack', Space: 'attack', KeyZ: 'attack', Enter: 'attack', KeyK: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyX: 'dodge',
  KeyL: 'skill1', Digit1: 'skill1', KeyU: 'skill2', Digit2: 'skill2', KeyE: 'potion', KeyQ: 'potion', KeyR: 'potion',
};
const BOTTOM_Y = 1214;
const BTN_A: [number, number] = [598, 1110];
const BTN_B: [number, number] = [446, 1188];
const BTN_S1: [number, number] = [622, 924];
const BTN_S2: [number, number] = [476, 1012];
const BTN_POT: [number, number] = [650, 790];
const BTN_HERO: [number, number] = [640, 1180];
const BTN_MAP: [number, number] = [520, 1194];

type Phase = 'select' | 'map' | 'battle' | 'screen' | 'summary';
type TutStep = 'move' | 'farm' | 'fight' | 'dodge' | 'skill' | null;

const INK = '#1a1420';
const T_TITLE: LabelStyle = { size: 36, color: '#8a1c24', stroke: null, shadow: false };
const T_BODY: LabelStyle = { size: 21, color: '#2a1e14', stroke: null, shadow: false, body: true };
const S_SUM: LabelStyle = { size: 28, color: '#2a1e14', stroke: null, shadow: false };
const S_SUM_SMALL: LabelStyle = { size: 22, color: '#4a3424', stroke: null, shadow: false, body: true };
const S_PLACE: LabelStyle = { size: 30, color: '#fff2cc', stroke: INK, strokeWidth: 6 };

interface DmgText { t: Phaser.GameObjects.Text; life: number; x: number; y: number; z: number }

/** The themed lines of the tutorial cards and hints, painted in Boot (main.ts). */
export const TUT_KEYS = [
  'tut_move_t', 'tut_move_k', 'tut_move_d', 'tut_farm_d', 'tut_fight_t', 'tut_fight_d_touch', 'tut_fight_d_keys', 'tut_dodge_t', 'tut_dodge_d_touch',
  'tut_dodge_d_keys', 'tut_skill_t', 'tut_skill_d_touch', 'tut_skill_d_keys', 'hint_market', 'hint_points', 'hint_bag', 'hint_shrine', 'hint_potion', 'hint_camp', 'hint_bridge',
  'sealedTower', 'sealedBridge', 'placeDone', 'placeLocked',
];
export { T_TITLE, T_BODY, S_SUM, S_SUM_SMALL, S_PLACE };

export class PlayScene extends ArcadeScene {
  view!: View;
  world!: World3D;
  camp!: Campaign;
  battle: Battle | null = null;
  fight: Fight | null = null;
  mode: Mode = 'normal';
  phase: Phase = 'map';
  private controls!: Controls;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  touch = false;
  private hp!: HpBar;
  private powerChips!: PowerChips<PowerId>;
  private bossBar!: BossBar;
  private goldChip!: HudChip;
  private infoChip!: HudChip;
  private potChip!: HudChip;
  private skillChips: HudChip[] = [];
  private btn: Record<string, ActionButton | null> = {};
  private vignette!: Phaser.GameObjects.Graphics;
  private fade!: Phaser.GameObjects.Rectangle;
  private panel: Panel | null = null;
  private path: [number, number][] = [];
  private stepT = 0;
  private acc = 0;
  private hitStop = 0;
  private slowT = 0;
  private dmg: DmgText[] = [];
  private dmgPool: Phaser.GameObjects.Text[] = [];
  private shown = { gold: -1, level: -1, info: '', pot: -1, renown: -1 };
  private sfxGap: Record<string, number> = {};
  private redT = 0;
  private lowWarned = false;
  private ended = false;
  private session = { renown: 0, kills: 0, gold: 0, level: 1 };
  private placeLabel: Phaser.GameObjects.Image | null = null;
  private placeLabelKey = '';
  private placeBtn: KitButton | null = null;
  private atkRepeat = 0;
  private bot: BattleBot | null = null;
  private mapBot: MapBot | null = null;
  private drag = { on: false, x: 0, y: 0, moved: 0, id: -1 };
  private cursorT = 0;
  // the training
  tut: TutStep = null;
  private tutCard: Phaser.GameObjects.Container | null = null;
  private tutSkip: KitButton | null = null;
  private tutCount = 0;
  private hintCard: Phaser.GameObjects.Container | null = null;
  private hintQueue: string[] = [];
  /** Test hooks. */
  quiet = false;
  testSpeed = 1;
  god = false;
  autoplay = false;
  firstFrames: number[] = [];
  programsAtStart = -1;
  programsAfter = -1;
  programsBattle = -1;
  /** The shader programs alive when the round started (test hook: what the menu compiled). */
  programKeys: string[] = [];
  private frameStart = 0;
  perf = { frames: 0, calls: 0, maxCalls: 0, mapCalls: 0, battleCalls: 0, tris: 0 };

  createGame(): void {
    this.mode = isEasy() ? 'easy' : 'normal';
    this.camp = Campaign.load(this.mode);
    this.battle = null; this.fight = null; this.panel = null; this.path = []; this.stepT = 0;
    this.acc = 0; this.hitStop = 0; this.slowT = 0; this.dmg = []; this.dmgPool = [];
    this.shown = { gold: -1, level: -1, info: '', pot: -1, renown: -1 };
    this.sfxGap = {}; this.redT = 0; this.lowWarned = false; this.ended = false;
    this.session = { renown: this.camp.s.renown, kills: this.camp.s.kills, gold: this.camp.s.goldEarned, level: this.camp.s.level };
    this.placeLabel = null; this.placeLabelKey = ''; this.placeBtn = null; this.atkRepeat = 0; this.tags = []; this.arrow = null; this.queued = {};
    this.bot = null; this.mapBot = null; this.drag = { on: false, x: 0, y: 0, moved: 0, id: -1 }; this.cursorT = 0;
    this.tut = null; this.tutCard = null; this.tutSkip = null; this.tutCount = 0; this.hintCard = null; this.hintQueue = [];
    this.quiet = false; this.testSpeed = 1; this.god = false; this.autoplay = false;
    this.firstFrames = []; this.frameStart = 0;
    this.skillChips = []; this.btn = {};
    makeArt(this);

    this.view = new View(this, this.camp.map, this.camp.s.cls);
    this.world = this.view.world;
    this.view.mapView.syncFog(this.camp, true);
    this.view.placeParty(this.camp);
    const renderer = this.world.renderer;
    this.programsAtStart = (renderer.info.programs ?? []).length;
    this.programKeys = (renderer.info.programs ?? []).map((p) => (p as unknown as { cacheKey: string }).cacheKey);
    this.programsAfter = -1;
    this.programsBattle = -1;
    this.perf = { frames: 0, calls: 0, maxCalls: 0, mapCalls: 0, battleCalls: 0, tris: 0 };
    const w = this.world, render = w.render.bind(w);
    w.render = () => {
      render();
      const calls = renderer.info.render.calls;
      this.perf.calls = calls;
      this.perf.tris = renderer.info.render.triangles;
      if (this.perf.frames > 5) {
        this.perf.maxCalls = Math.max(this.perf.maxCalls, calls);
        if (this.view.mode === 'map') this.perf.mapCalls = Math.max(this.perf.mapCalls, calls);
        else this.perf.battleCalls = Math.max(this.perf.battleCalls, calls);
      }
      if (this.programsAfter < 0 && this.perf.frames > 0) this.programsAfter = (renderer.info.programs ?? []).length;
    };

    this.setupInput();
    this.setupHud();
    this.vignette = this.add.graphics().setDepth(60).setScrollFactor(0);
    this.fade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x06040c, 1).setOrigin(0).setScrollFactor(0).setDepth(9300);
    this.tweens.add({ targets: this.fade, alpha: 0, duration: 500 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.dispose());
    this.setScore(this.camp.s.renown);

    if (!this.camp.s.chosen) this.openClassSelect(false);
    else this.enterMap(true);
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    this.touch = this.sys.game.device.input.touch;
    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'], buttonPos: { A: BTN_A, B: BTN_B }, buttonScale: 1.06 });
    // the floating stick's two circles (shown only in battle; a tap on the map walks)
    this.stickParts = this.children.list.filter((o) => o instanceof Phaser.GameObjects.Arc && (o as Phaser.GameObjects.Arc).depth === 9500 && ((o as Phaser.GameObjects.Arc).radius === 80 || (o as Phaser.GameObjects.Arc).radius === 38)) as Phaser.GameObjects.Arc[];
    if (this.controls.touchUi) {
      // the core's A/B circles do the hit testing for ATTACK and ROLL; the game draws its own buttons
      for (const o of this.children.list) {
        const d = o as unknown as { depth: number; x: number; y: number };
        if (d.depth < 9500 || d.depth > 9501) continue;
        const atA = Math.hypot(d.x - BTN_A[0], d.y - BTN_A[1]) < 2, atB = Math.hypot(d.x - BTN_B[0], d.y - BTN_B[1]) < 2;
        if (!atA && !atB) continue;
        if (o instanceof Phaser.GameObjects.Arc) { o.setFillStyle(0xffffff, 0.001).setStrokeStyle(0, 0, 0); (o as unknown as { __core: boolean }).__core = true; }
        else if (o instanceof Phaser.GameObjects.Text) o.setVisible(false);
      }
      const cls = CLASS[this.camp.s.cls];
      this.btn.attack = actionButton(this, BTN_A[0], BTN_A[1], 78, t('btnAttack'), false, { size: 21 });
      this.btn.dodge = actionButton(this, BTN_B[0], BTN_B[1], 58, t('btnDodge'), false, { size: 19 });
      this.btn.s1 = actionButton(this, BTN_S1[0], BTN_S1[1], 54, '', true, { icon: icon('sk-' + cls.skills[0].id) });
      this.btn.s2 = actionButton(this, BTN_S2[0], BTN_S2[1], 54, '', true, { icon: icon('sk-' + cls.skills[1].id) });
      this.btn.pot = actionButton(this, BTN_POT[0], BTN_POT[1], 42, '', true, { icon: icon('potion'), badge: true });
    }
    // map buttons (touch and mouse): the hero screen and the world map
    this.btn.hero = actionButton(this, BTN_HERO[0], BTN_HERO[1], 50, t('btnHero'), true, { icon: icon('hero'), size: 14 });
    this.btn.map = actionButton(this, BTN_MAP[0], BTN_MAP[1], 44, t('btnMap'), true, { icon: icon('map'), size: 14 });
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      for (const [n, c] of Object.entries({ j: K.J, k: K.K, l: K.L, u: K.U, one: K.ONE, two: K.TWO, e: K.E, q: K.Q, r: K.R, i: K.I, m: K.M })) this.keys[n] = kb.addKey(c, false, false);
      kb.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    }
    // the map: drag to look around, tap a hex to walk there
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'map' || this.panel) return;
      this.drag = { on: true, x: p.x, y: p.y, moved: 0, id: p.id };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag.on || p.id !== this.drag.id || this.phase !== 'map') return;
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      this.drag.moved += Math.hypot(dx, dy);
      if (this.drag.moved > 14) this.view.pan(dx, dy);
      this.drag.x = p.x; this.drag.y = p.y;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.drag.on || p.id !== this.drag.id) return;
      this.drag.on = false;
      if (this.drag.moved > 14 || this.phase !== 'map' || this.panel) return;
      this.tapMap(p.x, p.y);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (this.isOver) return;
    if (this.panel) { if (this.panel.key(ev.code)) { if (ev.code === 'Tab') ev.preventDefault(); } return; }
    if (ev.code === 'Tab' && this.tut && this.tutSkip) { ev.preventDefault(); this.endTutorial(true); return; }
    if (this.phase === 'summary' && (ev.code === 'Enter' || ev.code === 'Space')) { this.finishSession(); return; }
    if (this.phase === 'battle') {
      // presses are queued here too, so a tap shorter than a frame still counts
      const q = BATTLE_KEYS[ev.code];
      if (q) this.queued[q] = true;
      return;
    }
    if (this.phase !== 'map') return;
    switch (ev.code) {
      case 'KeyM': this.openMapScreen(); break;
      case 'KeyI': case 'KeyH': this.openHero(); break;
      case 'Enter': case 'Space': {
        const h = this.hereHex();
        if (h.place || this.camp.campAt(h)) this.openPlace(h);
        break;
      }
      case 'ArrowLeft': case 'KeyA': this.keyStep(3); break;
      case 'ArrowRight': case 'KeyD': this.keyStep(0); break;
      case 'ArrowUp': case 'KeyW': this.keyStep(this.controls.left ? 4 : this.controls.right ? 5 : -1); break;
      case 'ArrowDown': case 'KeyS': this.keyStep(this.controls.left ? 2 : this.controls.right ? 1 : -2); break;
    }
  }

  /** One step by keys: an edge (0 E … 5 NE), or −1 / −2 for straight up / down (the nearer of the two). */
  private keyStep(k: number): void {
    if (this.view.walking || this.path.length) return;
    const [c, r] = this.camp.s.pos;
    const nb = neighbours(c, r);
    let pick = k;
    if (k < 0) {
      const pair = k === -1 ? [4, 5] : [2, 1];
      const here = this.hereHex();
      const opts = pair.map((e) => nb[e]).map((n, i) => ({ n, e: pair[i] })).filter((o) => o.n && this.camp.canPass(this.camp.map.at(o.n[0], o.n[1])));
      if (!opts.length) { this.bump(); return; }
      opts.sort((a, b) => Math.abs(this.camp.map.at(a.n![0], a.n![1]).x - here.x - this.cursorT) - Math.abs(this.camp.map.at(b.n![0], b.n![1]).x - here.x - this.cursorT));
      pick = opts[0].e;
      this.cursorT = this.cursorT > 0 ? -0.1 : 0.1;
    }
    const n = nb[pick];
    if (!n) { this.bump(); return; }
    const h = this.camp.map.at(n[0], n[1]);
    if (!this.camp.canPass(h)) { if (h.c === BRIDGE[0] && h.r === BRIDGE[1]) this.hint('hint_bridge', true); this.bump(); return; }
    this.path = [n];
    this.stepT = 0;
  }

  private bump(): void { this.s('error', 0.25, 0.2); }

  private hereHex(): Hex { return this.camp.map.at(this.camp.s.pos[0], this.camp.s.pos[1]); }

  private tapMap(px: number, py: number): void {
    // the HUD's own spots never walk
    if (py < 150) return;
    const p = this.view.pick(px, py);
    if (!p) return;
    const hexAt = this.pickHex(p.x, p.z);
    if (!hexAt) return;
    const h = this.camp.map.at(hexAt[0], hexAt[1]);
    const [c, r] = this.camp.s.pos;
    if (h.c === c && h.r === r) { if (h.place || this.camp.campAt(h)) this.openPlace(h); return; }
    if (!this.camp.canPass(h)) {
      if (h.c === BRIDGE[0] && h.r === BRIDGE[1]) this.hint('hint_bridge', true);
      this.bump();
      return;
    }
    const path = this.camp.pathTo(h.c, h.r);
    if (!path) { this.bump(); return; }
    this.path = path;
    this.stepT = 0;
    this.s('move', 0.25, 0.05);
    this.closePlacePrompt();
  }

  private pickHex(x: number, z: number): [number, number] | null {
    let best: [number, number] | null = null, bd = 0.62;
    for (const h of this.camp.map.hexes) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < bd) { bd = d; best = [h.c, h.r]; }
    }
    return best;
  }

  private stickParts: Phaser.GameObjects.Arc[] = [];
  private queued: Partial<Record<'attack' | 'dodge' | 'skill1' | 'skill2' | 'potion', boolean>> = {};

  private readInput(dt: number): Input {
    if (this.bot) return this.bot.input(dt);
    const inp = this.liveInput(dt);
    const q = this.queued;
    this.queued = {};
    return { ...inp, attack: inp.attack || !!q.attack, dodge: inp.dodge || !!q.dodge, skill1: inp.skill1 || !!q.skill1, skill2: inp.skill2 || !!q.skill2, potion: inp.potion || !!q.potion };
  }

  private liveInput(dt: number): Input {
    const c = this.controls;
    const jd = (k: string) => !!this.keys[k] && Phaser.Input.Keyboard.JustDown(this.keys[k]);
    const held = c.a || !!this.keys.j?.isDown;
    let attack = c.justA() || jd('j');
    if (held) { this.atkRepeat -= dt; if (this.atkRepeat <= 0) { attack = true; this.atkRepeat = 0.15; } } else this.atkRepeat = 0;
    if (attack && held) this.atkRepeat = 0.15;
    const s1 = jd('l') || jd('one') || !!this.btn.s1?.pressed;
    const s2 = jd('u') || jd('two') || !!this.btn.s2?.pressed;
    const pot = jd('e') || jd('q') || jd('r') || !!this.btn.pot?.pressed;
    for (const k of ['s1', 's2', 'pot']) if (this.btn[k]) this.btn[k]!.pressed = false;
    return { mx: c.axisX, mz: c.axisY, attack, dodge: c.justB() || jd('k'), skill1: s1, skill2: s2, potion: pot };
  }

  // ------------------------------------------------------------------ HUD

  private setupHud(): void {
    const { width } = this.scale;
    this.hud.setLevel(this.camp.s.level);
    this.goldChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: icon('coin'), iconSize: 32, text: '0', color: '#ffe68a', minWidth: 96 });
    this.infoChip = hudChip(this, width - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', text: '', size: 20, minWidth: 150 });
    this.potChip = hudChip(this, this.goldChip.right + HUD_GAP, HUD_ROW2_Y, { icon: icon('potion'), iconSize: 34, text: '0', minWidth: 80 });
    this.powerChips = new PowerChips<PowerId>(this, HUD_MARGIN, HUD_ROW2_Y + 70, POWER_IDS, (id) => icon('pw-' + id), (id) => POWER_COLOR[id]);
    this.bossBar = new BossBar(this, width / 2, HUD_ROW2_Y + 140);
    this.hp = new HpBar(this, HUD_MARGIN, BOTTOM_Y);
    if (!this.controls.touchUi) {
      // keyboard players read the skills and potions in chips by the corner
      const cls = CLASS[this.camp.s.cls];
      const mk = (k: string, sk: string) => {
        const ring = this.add.graphics();
        ring.setData('chipWidth', 44);
        const ic = this.add.image(0, 0, icon('sk-' + sk)).setDisplaySize(40, 40);
        const box = this.add.container(0, 0, [ring, ic]);
        box.setData('chipWidth', 44);
        const chip = hudChip(this, 0, BOTTOM_Y, { align: 'right', text: k, size: 20, color: '#ffd23f', items: [box], height: 58 });
        chip.setData('ring', ring);
        chip.setData('icon', ic);
        return chip;
      };
      const c2 = mk('U', cls.skills[1].id);
      c2.setAnchor(width - HUD_MARGIN, BOTTOM_Y, 'right');
      const c1 = mk('L', cls.skills[0].id);
      c1.setAnchor(c2.left - HUD_GAP, BOTTOM_Y, 'right');
      this.skillChips = [c1, c2];
    }
    this.switchHud();
  }

  /** Shows the battle's HUD or the map's. */
  private switchHud(): void {
    const battle = this.phase === 'battle';
    const map = this.phase === 'map' || this.phase === 'screen';
    for (const k of ['attack', 'dodge', 's1', 's2', 'pot']) if (this.btn[k]) showButton(this.btn[k]!, battle);
    for (const a of this.stickParts) a.setAlpha(battle ? 1 : 0);
    for (const k of ['hero', 'map']) if (this.btn[k]) showButton(this.btn[k]!, map && this.phase !== 'screen');
    for (const c of this.skillChips) c.setVisible(battle);
    this.potChip.setVisible(true);
    this.hp.chip.setVisible(this.phase !== 'select');
    this.goldChip.setVisible(this.phase !== 'select');
    this.infoChip.setVisible(this.phase !== 'select' && this.phase !== 'summary');
    this.potChip.setVisible(this.phase !== 'select');
    this.hud.levelChip.setVisible(this.phase !== 'select');
    if (!battle) { this.powerChips.clear(); this.bossBar.hide(); }
    if (this.phase !== 'map') { for (const tg of this.tags) tg.setVisible(false); this.arrow?.setVisible(false); }
    this.shown.info = '';
  }

  /** The skill buttons' icons follow the class. */
  private relabelSkills(): void {
    const cls = CLASS[this.camp.s.cls];
    if (this.btn.s1?.icon) this.btn.s1.icon.setTexture(icon('sk-' + cls.skills[0].id));
    if (this.btn.s2?.icon) this.btn.s2.icon.setTexture(icon('sk-' + cls.skills[1].id));
    this.skillChips.forEach((chip, i) => { const img = chip.getData('icon') as Phaser.GameObjects.Image | undefined; img?.setTexture(icon('sk-' + cls.skills[i].id)).setDisplaySize(40, 40); });
  }

  private updateHud(dt: number): void {
    const c = this.camp, s = c.s;
    if (this.score !== s.renown) this.setScore(s.renown);
    if (this.shown.level !== s.level) { this.shown.level = s.level; this.hud.setLevel(s.level); }
    const b = this.battle;
    const gold = s.gold + (b && this.phase === 'battle' ? b.gold : 0);
    if (gold !== this.shown.gold) {
      if (this.shown.gold >= 0 && gold > this.shown.gold) this.tweens.add({ targets: this.goldChip, scale: 1.12, duration: 70, yoyo: true });
      this.shown.gold = gold;
      this.goldChip.setText(String(gold));
      this.potChip.setAnchor(this.goldChip.right + HUD_GAP, HUD_ROW2_Y);
    }
    const pots = b && this.phase === 'battle' ? b.hero.potions : s.potions;
    if (pots !== this.shown.pot) {
      this.shown.pot = pots;
      this.potChip.setText(`${pots}/${s.potionMax}`);
      if (this.btn.pot?.badge) this.btn.pot.badge.setText(String(pots));
    }
    // the info chip: the wave in battle, the tracked quest on the map
    let info = '';
    if (this.phase === 'battle' && b) {
      const room = b.roomDef;
      if (b.bossUp && b.bossUp.state !== 'dead') info = t('bossWave');
      else info = b.rooms.length > 1 ? t('room', { n: b.room + 1, of: b.rooms.length }) + ' · ' + t('wave', { n: b.wave + 1, of: Math.max(1, room.waves.length) }) : t('wave', { n: b.wave + 1, of: Math.max(1, room.waves.length) });
    } else if (this.phase === 'map') {
      const q = c.tracked();
      info = s.victory ? t('p_rift') : q ? t('q_' + q) : '';
    }
    if (info !== this.shown.info) {
      this.shown.info = info;
      this.infoChip.setText(info);
      this.infoChip.setVisible(!!info && this.phase !== 'select');
      if (this.phase === 'map' && info) { this.infoChip.setIcon?.(icon('marker')); }
    }
    // health
    const hp = b && this.phase === 'battle' ? b.hero.hp : s.hp;
    const max = b && this.phase === 'battle' ? b.st.maxHp : c.maxHp;
    this.hp.xp = Math.min(1, s.xp / xpToNext(s.level));
    this.hp.update(hp, max, dt, this.elapsed);
    if (this.phase === 'battle' && b) this.updateBattleHud(b, dt);
    else this.edge(dt, false);
  }

  private updateBattleHud(b: Battle, dt: number): void {
    const h = b.hero;
    this.powerChips.update(h.powers, { shieldHits: h.shieldHits }, this.elapsed);
    const boss = b.bossUp;
    if (boss && boss.state !== 'dead') {
      this.bossBar.show(t('f_' + boss.kind));
      this.bossBar.update(Math.max(0, boss.hp / boss.maxHp), boss.guard > 0, boss.phase >= 3, dt, this.elapsed);
    } else this.bossBar.hide();
    const cls = CLASS[b.st.cls];
    const ring = (k: 0 | 1) => [Math.max(0, 1 - h.skillCd[k] / (cls.skills[k].cd * (1 - b.st.cdr)))];
    if (this.btn.attack) drawButton(this.btn.attack, 0xc8463a, { held: this.controls.a });
    if (this.btn.dodge) drawButton(this.btn.dodge, 0x3a7ab8, { held: this.controls.b, ring: [Math.max(0, 1 - h.dodgeCd / 1.17)], dim: h.dodgeCd > 0 });
    if (this.btn.s1) drawButton(this.btn.s1, cls.skills[0].color, { ring: ring(0), ready: h.skillCd[0] <= 0, dim: h.skillCd[0] > 0, time: this.elapsed, held: this.btn.s1.down });
    if (this.btn.s2) drawButton(this.btn.s2, cls.skills[1].color, { ring: ring(1), ready: h.skillCd[1] <= 0, dim: h.skillCd[1] > 0, time: this.elapsed, held: this.btn.s2.down });
    if (this.btn.pot) drawButton(this.btn.pot, 0xc83a4a, { dim: h.potions <= 0, held: this.btn.pot.down });
    this.skillChips.forEach((chip, i) => {
      const g = chip.getData('ring') as Phaser.GameObjects.Graphics;
      const k = ring(i as 0 | 1)[0];
      g.clear().lineStyle(5, 0x000000, 0.5).strokeCircle(0, 0, 22);
      g.lineStyle(5, k >= 1 ? 0xffd23f : 0xffffff, 1).beginPath().arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
      chip.setAlpha(k >= 1 ? 1 : 0.7);
    });
    const low = h.state !== 'dead' && h.hp < b.st.maxHp * 0.3;
    if (low && !this.lowWarned) { this.lowWarned = true; this.floatAt(h.x, h.z, t('lowHp'), '#ff7a6a', 28); if (h.potions > 0) this.hint('hint_potion'); this.sfx('alarm', { volume: 0.3, exact: true }); }
    if (h.hp > b.st.maxHp * 0.5) this.lowWarned = false;
    this.edge(dt, low);
  }

  /** The red edge: a hit, low health. */
  private edge(dt: number, low: boolean): void {
    this.redT = Math.max(0, this.redT - dt * 1.6);
    const beat = low ? Math.pow(Math.max(0, Math.sin(this.elapsed * Math.PI * 2.2)), 6) : 0;
    const a = Math.max(this.redT, low ? 0.26 + beat * 0.35 : 0);
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
    const dt = delta / 1000;
    this.perf.frames++;
    for (const key of Object.keys(this.sfxGap)) this.sfxGap[key] -= dt;
    if (this.phase === 'battle' && this.battle) this.stepBattle(dt);
    else if (this.phase === 'select') this.stepSelect(dt);
    else this.stepMap(dt);
    this.updateHud(dt);
    this.updateDmg(dt);
  }

  // ------------------------------------------------------------------ the map

  private enterMap(first = false): void {
    this.phase = 'map';
    this.view.setMode('map');
    this.view.setClass(this.camp.s.cls);
    this.view.placeParty(this.camp);
    this.view.mapView.syncFog(this.camp, first);
    playMusic(this, 'stage1');
    this.switchHud();
    this.relabelSkills();
    if (first && !this.camp.s.tutorial) this.startTutorial();
    else this.mapHints();
  }

  private mapHints(): void {
    const s = this.camp.s;
    if (s.points > 0) this.hint('hint_points');
    if (s.battles >= 1) this.hint('hint_market');
    const seen = new Set(s.seen);
    if (CAMPS.some((cp) => !s.camps.includes(cp.id) && seen.has(this.camp.map.at(cp.hex[0], cp.hex[1]).i))) this.hint('hint_camp');
  }

  private stepMap(dt: number): void {
    const v = this.view;
    if (this.phase === 'map' && !this.panel) {
      if (this.autoplay && !this.path.length && !v.walking) this.autoMap();
      if (this.path.length && !v.walking) {
        this.stepT -= dt;
        if (this.stepT <= 0) {
          const [c, r] = this.path.shift()!;
          const h = this.camp.map.at(c, r);
          const dur = this.camp.map.stepCost(h) * 0.9;
          v.walkTo(c, r, dur);
          this.stepT = dur;
          this.time.delayedCall(dur * 1000, () => this.arrive(c, r));
          this.s('step', 0.18, 0.08);
        }
      }
    }
    v.updateMap(dt);
    this.updateMapMarks();
    this.updatePlaceLabel();
    this.updateTags();
  }

  /** The party stands on a new hex. */
  private arrive(c: number, r: number): void {
    if (this.phase !== 'map' || this.isOver) return;
    const before = this.camp.s.seen.length;
    const fight = this.camp.stepTo(c, r);
    if (this.camp.s.seen.length > before) { this.view.mapView.syncFog(this.camp); this.s('reveal', 0.25, 0.3); }
    if (this.tut === 'move') { this.tutCount++; if (this.tutCount >= 2) this.tutStep('farm'); }
    const h = this.camp.map.at(c, r);
    if (fight) { this.path = []; this.startFight(fight); return; }
    // a place shows its name and ENTER (Enter on the keyboard); nothing opens by itself
    if (!this.path.length) { this.camp.save(); if (h.place || this.camp.campAt(h)) this.s('door', 0.25, 0.3); }
  }

  /** The bot walks the campaign (menu backdrop, store art). */
  private autoMap(): void {
    this.mapBot ??= new MapBot(this.camp, SKILL.good);
    const [gc, gr] = this.mapBot.goal();
    const [pc, pr] = this.camp.s.pos;
    if (gc === pc && gr === pr) {
      const h = this.hereHex();
      if (h.place === 'village') { this.mapBot.village(); this.camp.s.pos = [PLACE_HEX.castle[0], PLACE_HEX.castle[1]]; return; }
      if (h.place) { const a = this.camp.access(h.place); if (a === 'ok') this.startFight(this.camp.dungeon(h.place as Exclude<PlaceId, 'village'>)); else if (a === 'rift') this.startFight(this.camp.riftFloor()); }
      return;
    }
    this.path = this.camp.pathTo(gc, gr) ?? [];
  }

  /** The tracked quest's marker, camps' banners, the warded bridge, the path. */
  private updateMapMarks(): void {
    const mv = this.view.mapView, cam = this.view.camQuat();
    const t0 = this.elapsed;
    mv.marks.begin(cam); mv.flats.begin(cam); mv.glows.begin(cam);
    const th = this.camp.trackedHex();
    const seen = new Set(this.camp.s.seen);
    if (th) {
      const h = this.camp.map.at(th[0], th[1]);
      const y = groundY(h) + 0.9 + Math.sin(t0 * 3) * 0.08;
      mv.glows.add(h.x, y, h.z, 0.7, 0.7, t0, 0xffc83a, 1);
      mv.flats.add(h.x, groundY(h) + 0.03, h.z, 1.05 + Math.sin(t0 * 4) * 0.08, 1.05 + Math.sin(t0 * 4) * 0.08, t0, 0xffd23f, 0.9);
    }
    for (const cp of CAMPS) {
      if (this.camp.s.camps.includes(cp.id)) continue;
      const h = this.camp.map.at(cp.hex[0], cp.hex[1]);
      if (!seen.has(h.i)) continue;
      mv.marks.add(h.x, groundY(h) + 0.55, h.z, 0.5, 0.5, 0, 0xff3a4a, 0.9);
      mv.flats.add(h.x, groundY(h) + 0.03, h.z, 0.9, 0.9, -t0, 0xff4a4a, 0.6);
    }
    if (!this.camp.bridgeOpen()) {
      const h = this.camp.map.at(BRIDGE[0], BRIDGE[1]);
      if (seen.has(h.i)) mv.marks.add(h.x, 0.8, h.z, 1.4 + Math.sin(t0 * 2) * 0.1, 1.4, 0, 0x9a3aff, 0.8);
    }
    // the party's own ring, so it reads among the trees
    const pp = this.view.partyPos;
    mv.flats.add(pp.x, pp.y + 0.03, pp.z, 0.62, 0.62, -t0 * 1.5, 0x8ab8ff, 0.85);
    // the path ahead
    for (const [c, r] of this.path) { const h = this.camp.map.at(c, r); mv.flats.add(h.x, groundY(h) + 0.03, h.z, 0.35, 0.35, 0, 0xfff2cc, 0.8); }
    if (this.path.length) { const [c, r] = this.path[this.path.length - 1]; const h = this.camp.map.at(c, r); mv.flats.add(h.x, groundY(h) + 0.03, h.z, 0.95, 0.95, t0 * 2, 0xffffff, 0.9); }
    mv.marks.end(); mv.flats.end(); mv.glows.end();
  }

  private tags: Phaser.GameObjects.Image[] = [];
  private arrow: Phaser.GameObjects.Container | null = null;

  /** Place names over the map (the ones seen), and an arrow at the edge towards the tracked quest. */
  private updateTags(): void {
    const show = this.phase === 'map' && !this.panel;
    if (!this.tags.length) {
      PLACE_IDS.forEach((pl) => this.tags.push(labelAt(this, 0, 0, t('p_' + pl), S_MAP_TAG).setScrollFactor(0).setDepth(55).setVisible(false)));
      const g = this.add.graphics();
      g.fillStyle(0x1a1420, 0.9).fillTriangle(30, 0, -12, -20, -12, 20);
      g.fillStyle(0xffd23f, 1).fillTriangle(24, 0, -8, -15, -8, 15);
      this.arrow = this.add.container(0, 0, [g, this.add.image(-34, 0, icon('marker')).setDisplaySize(40, 40)]).setScrollFactor(0).setDepth(56).setVisible(false);
    }
    const seen = new Set(this.camp.s.seen);
    const here = this.hereHex();
    PLACE_IDS.forEach((pl, i) => {
      const [c, r] = PLACE_HEX[pl];
      const h = this.camp.map.at(c, r);
      const tag = this.tags[i];
      if (!show || !seen.has(h.i) || (h.c === here.c && h.r === here.r && !this.view.walking)) { tag.setVisible(false); return; }
      const p = this.view.toScreen(h.x, groundY(h) - 0.05, h.z + 0.42);
      tag.setPosition(p.x, p.y).setVisible(p.y > 160 && p.y < 1150 && p.x > 40 && p.x < 680);
    });
    const th = this.camp.trackedHex();
    const a = this.arrow!;
    if (!show || !th) { a.setVisible(false); return; }
    const h = this.camp.map.at(th[0], th[1]);
    const p = this.view.toScreen(h.x, groundY(h) + 0.8, h.z);
    const { width, height } = this.scale;
    const inside = p.x > 40 && p.x < width - 40 && p.y > 170 && p.y < height - 140;
    if (inside) { a.setVisible(false); return; }
    const cx = width / 2, cy = height / 2, dx = p.x - cx, dy = p.y - cy;
    const k = Math.min((width / 2 - 60) / Math.max(1, Math.abs(dx)), (height / 2 - 200) / Math.max(1, Math.abs(dy)));
    a.setPosition(cx + dx * k, cy + dy * k).setRotation(Math.atan2(dy, dx)).setVisible(true);
    (a.list[1] as Phaser.GameObjects.Image).setRotation(-Math.atan2(dy, dx));
    a.setScale(1 + Math.sin(this.elapsed * 6) * 0.06);
  }

  /** The name of the place the party stands on, and its ENTER button. */
  private updatePlaceLabel(): void {
    const h = this.hereHex();
    const camp = this.camp.campAt(h);
    const key = this.phase === 'map' && !this.view.walking && !this.path.length ? (h.place ? 'p_' + h.place : camp ? 'p_camp' : '') : '';
    if (key === this.placeLabelKey) return;
    this.placeLabelKey = key;
    this.placeLabel?.destroy(); this.placeLabel = null;
    this.placeBtn?.destroy(); this.placeBtn = null;
    if (!key) return;
    const { width } = this.scale;
    this.placeLabel = labelAt(this, width / 2, 1040, t(key), S_PLACE).setScrollFactor(0).setDepth(9050);
    this.placeBtn = new KitButton(this, width / 2, 1108, { w: 200, h: 64, color: 0x2c4a9a, label: h.place === 'village' ? t('enter') : t('enter'), style: { size: 22 }, sfx: 'ui-click' }, () => this.openPlace(h));
    this.placeBtn.setScrollFactor(0).setDepth(9050);
    this.placeLabel.setScale(0.6);
    this.tweens.add({ targets: this.placeLabel, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private closePlacePrompt(): void { this.placeLabelKey = '#'; this.placeLabel?.destroy(); this.placeLabel = null; this.placeBtn?.destroy(); this.placeBtn = null; }

  /** Opens what stands on a hex: the village's screens, a dungeon, a camp, the rift. */
  private openPlace(h: Hex): void {
    if (this.phase !== 'map' || this.panel) return;
    const camp = this.camp.campAt(h);
    if (camp && !h.place) {
      const f = this.camp.stepTo(h.c, h.r);
      if (f) this.startFight(f);
      return;
    }
    if (!h.place) return;
    const acc = this.camp.access(h.place);
    switch (acc) {
      case 'village': this.openVillage(); break;
      case 'ok': this.startFight(this.camp.dungeon(h.place as Exclude<PlaceId, 'village'>)); break;
      case 'rift': this.startFight(this.camp.riftFloor()); break;
      case 'sealed': this.hint('sealedTower', true); this.bump(); break;
      case 'done': this.hint('placeDone', true); break;
      default: this.hint('placeLocked', true); this.bump();
    }
  }

  // ------------------------------------------------------------------ screens

  private host(): ScreenHost {
    return { sfx: (k, v) => this.s(k, v ?? 0.5, 0.03), touch: this.touch, changed: () => { this.shown.gold = -1; this.shown.pot = -1; this.hud.setLevel(this.camp.s.level); } };
  }

  private openPanel(p: Panel): void {
    this.panel = p;
    this.phase = this.phase === 'select' ? 'select' : 'screen';
    this.closePlacePrompt();
    this.switchHud();
  }

  private panelClosed(): void {
    this.panel = null;
    if (this.phase === 'screen') { this.phase = 'map'; this.switchHud(); this.placeLabelKey = '#'; }
  }

  openVillage(tab = 0): void {
    this.camp.rest();
    this.camp.save();
    this.s('door', 0.4, 0.2);
    this.openPanel(new VillageScreen(this, this.camp, this.host(), {
      endDay: () => { this.panel?.close(); this.summary('restTitle', true); },
      newGamePlus: () => { this.camp.newGamePlus(); this.camp.save(); this.view.placeParty(this.camp); this.s('fanfare', 0.5); },
      chooseClass: () => { this.panel?.close(); this.openClassSelect(true); },
    }, () => this.panelClosed(), tab));
  }

  openHero(tab = 0): void {
    if (this.phase !== 'map' || this.panel) return;
    this.openPanel(new HeroScreen(this, this.camp, this.host(), () => { this.panelClosed(); this.relabelSkills(); }, tab));
  }

  openMapScreen(): void {
    if (this.phase !== 'map' || this.panel) return;
    this.s('page', 0.5, 0.1);
    this.openPanel(new MapScreen(this, this.camp, this.camp.map, this.host(), () => this.panelClosed()));
  }

  /** The class choice: the live 3D hero above, the tiles below. */
  openClassSelect(closable: boolean): void {
    this.phase = 'select';
    this.view.setMode('battle', 'court');
    this.view.battle.showArena('court', 7);
    this.view.setClass(this.camp.s.cls);
    this.selectT = 0;
    this.switchHud();
    const pick = (cls: ClassId) => {
      this.camp.setClass(cls);
      if (!this.camp.s.chosen) { this.camp.reset(cls); this.camp.s.chosen = true; }
      this.camp.save();
      this.s('fanfare', 0.45);
      this.panel?.close();
      this.panel = null;
      this.view.battle.clear();
      this.relabelSkills();
      this.fade.setAlpha(1);
      this.tweens.add({ targets: this.fade, alpha: 0, duration: 450 });
      this.enterMap(true);
    };
    const p = new ClassScreen(this, this.camp.s.cls, this.host(), (cls) => { this.view.setClass(cls); this.selectT = 0; }, pick, closable);
    this.panel = p;
    (p as unknown as { onClose: () => void }).onClose = () => { this.panel = null; if (this.phase === 'select') { this.view.battle.clear(); this.enterMap(); } };
  }

  private selectT = 0;

  /** The class choice's stage: the hero shows off its combo and skills on the court. */
  private stepSelect(dt: number): void {
    this.selectT += dt;
    const v = this.view, b = v.battle;
    const fig = b.hero;
    fig.root.visible = true;
    fig.root.position.set(0, 0, 0);
    fig.root.rotation.y = 0.35 + Math.sin(this.selectT * 0.6) * 0.25;
    const cls = CLASS[v.battle.heroCls];
    const cycle = this.selectT % 6;
    const moves = [cls.idle, cls.combo[0].anim, cls.combo[cls.combo.length - 1].anim, cls.skills[0].anim, cls.skills[1].anim, cls.idle];
    const i = Math.floor(cycle);
    fig.play(moves[i], { speed: i === 0 || i === 5 ? 1 : 1.1, once: i > 0 && i < 5, restart: Math.abs(cycle - i) < dt * 1.5 });
    fig.update(dt);
    const cam = v.world.camera;
    cam.position.set(0.3, 1.9, 5.2);
    cam.lookAt(0, 0.55, 0);
    // the hero stands in the upper half (the tiles cover the lower): shift the view
    cam.setViewOffset(this.scale.width, this.scale.height, 0, this.scale.height * 0.2, this.scale.width, this.scale.height);
    v.world.followSun(cam.position);
  }

  // ------------------------------------------------------------------ battle

  startFight(f: Fight): void {
    if (this.phase === 'battle') return;
    this.closePlacePrompt();
    this.fight = f;
    const tutorial = !this.camp.s.tutorial && f.kind === 'dungeon' && f.place === 'farm';
    const b = new Battle({ mode: this.mode, seed: (Math.random() * 1e9) | 0, stats: this.camp.stats(), hp: this.camp.s.hp, potions: this.camp.s.potions, rooms: f.rooms, level: f.level, tutorial });
    this.battle = b;
    this.bot = this.autoplay ? new BattleBot(b, SKILL.good, 7) : null;
    this.acc = 0; this.hitStop = 0; this.slowT = 0; this.lowWarned = false;
    this.phase = 'battle';
    this.view.battle.clear();
    this.view.world.camera.clearViewOffset();
    this.view.setMode('battle', b.roomDef.arena);
    this.view.battle.showArena(b.roomDef.arena, b.layoutSeed);
    this.view.battle.camPos.set(0, 0, 0);
    this.switchHud();
    for (const ev of b.events) this.onEvent(ev);
    b.events.length = 0;
    const boss = f.rooms.some((r) => r.boss && BOSS_KINDS.includes(r.boss));
    playMusic(this, boss && f.rooms.length === 1 ? 'boss' : 'level2');
    this.fade.setAlpha(1);
    this.tweens.add({ targets: this.fade, alpha: 0, duration: 380 });
    const title = f.kind === 'encounter' ? t('ambush') : f.kind === 'camp' ? t('campFight') : f.kind === 'rift' ? t('enterRift', { n: this.camp.s.rift + 1 }) : t('p_' + f.place);
    banner(this, 420, title, f.rooms.length > 1 ? t('room', { n: 1, of: f.rooms.length }) : '', { color: f.kind === 'encounter' ? '#ff9a6a' : '#ffd86a', size: 46, hold: 1.1 });
    this.sfx(f.kind === 'encounter' ? 'ambush' : 'horn', { volume: 0.5 });
    if (tutorial) this.time.delayedCall(900, () => { if (this.phase === 'battle' && this.battle === b && !b.over) this.tutStep('fight'); });
  }

  private stepBattle(dt: number): void {
    const b = this.battle!;
    let k = this.testSpeed;
    if (this.slowT > 0) { this.slowT -= dt; k *= 0.3; }
    if (this.hitStop > 0) { this.hitStop -= dt; k = 0; }
    if (this.panel) k = 0;
    this.acc += dt * k;
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      this.acc -= STEP;
      n++;
      const inp = b.hero.state === 'dead' ? NO_INPUT : this.readInput(STEP);
      if (this.god) b.hero.invuln = Math.max(b.hero.invuln, 0.1);
      b.step(STEP, inp);
      for (const ev of b.events) this.onEvent(ev);
      b.events.length = 0;
      if (this.hitStop > 0 || this.phase !== 'battle') { this.acc = 0; break; }
    }
    if (n >= 8) this.acc = 0;
    if (this.phase !== 'battle') return;
    if (this.tut) this.updateTutorial();
    this.view.syncBattle(b, dt * (this.slowT > 0 ? 0.35 : this.hitStop > 0 ? 0.15 : 1) * Math.min(1, this.testSpeed || 0.0001));
    if (this.programsBattle < 0 && this.perf.frames > 30) this.programsBattle = (this.world.renderer.info.programs ?? []).length;
    if (b.over && !this.ended) this.endFight();
  }

  private sx(x: number, z: number, y = 1) { return this.view.toScreen(x, y, z); }

  /** A sound at most every `gap` seconds. */
  private s(key: string, volume: number, gap = 0.05, x?: number): void {
    if (this.quiet || (this.sfxGap[key] ?? 0) > 0) return;
    this.sfxGap[key] = gap;
    if (x !== undefined) this.sfxAt(key, x, { volume }); else this.sfx(key, { volume });
  }

  private onEvent(ev: BattleEvent): void {
    const b = this.battle!;
    this.view.battle.handle(ev, b);
    switch (ev.type) {
      case 'swing': {
        if (this.tut === 'fight') this.tutCount++;
        const cls = CLASS[b.st.cls];
        if (!cls.ranged) this.s(ev.finisher ? 'swing3' : ev.blow % 2 ? 'swing2' : 'swing1', ev.finisher ? 0.55 : 0.4, 0.04);
        break;
      }
      case 'shot':
        if (ev.side === 'hero') this.s(ev.kind === 'arrow' ? 'bow' : ev.kind === 'fireball' ? 'fireball' : 'zap', 0.4, 0.05);
        else this.s(ev.kind === 'farrow' || ev.kind === 'knife' ? 'bowFoe' : 'orb', 0.35, 0.08, this.sx(ev.x, ev.z).x);
        break;
      case 'hit': {
        const sxv = this.sx(ev.x, ev.z).x;
        if (ev.crit || ev.heavy || ev.dmg >= 30 || Math.random() < 0.65) this.dmgNumber(ev.x, ev.z, ev.dmg, ev.crit);
        this.s(ev.crit ? 'crit' : 'hit', ev.crit ? 0.5 : 0.36, 0.05, sxv);
        if (ev.crit) this.hitStop = Math.max(this.hitStop, 0.06);
        else if (ev.heavy) this.hitStop = Math.max(this.hitStop, 0.045);
        else if (ev.src === 'melee') this.hitStop = Math.max(this.hitStop, 0.025);
        if (ev.heavy) shake(this, 0.004, 90);
        break;
      }
      case 'kill': {
        const sxv = this.sx(ev.x, ev.z).x;
        const bone = FOE[ev.kind].model === 'skeleton' || FOE[ev.kind].model === 'headless';
        this.s(bone ? 'bones' : 'kill', 0.5, 0.06, sxv);
        if (ev.boss) {
          this.slowT = 1.4; this.view.battle.shake(0.6, 0.8); flash(this, 0xffffff);
          this.s('bossDie', 0.8, 1);
          banner(this, 430, t('victory'), t('f_' + ev.kind), { color: '#ffd86a', size: 64, hold: 1.6 });
        } else if (FOE[ev.kind].ai === 'slam' || FOE[ev.kind].ai === 'shield') { this.hitStop = Math.max(this.hitStop, 0.08); this.view.battle.shake(0.25, 0.15); }
        break;
      }
      case 'hurt':
        this.sfx('hurt', { volume: 0.6 });
        this.redT = Math.max(this.redT, 0.4);
        if (ev.dmg >= b.st.maxHp * 0.12) shake(this, 0.006, 140);
        this.dmgNumber(ev.x, ev.z, ev.dmg, false, '#ff6a5a');
        if (b.hero.state === 'dead') { this.slowT = 1.2; this.s('death', 0.7, 1); }
        break;
      case 'shieldHit': this.s('clang', 0.55, 0.05); this.floatAt(ev.x, ev.z, t('blocked'), '#9ad8ff', 24); break;
      case 'block': this.s('clang', 0.45, 0.06); if (ev.broke) { this.floatAt(ev.x, ev.z, t('guardBreak'), '#9ad8ff', 28); this.s('break', 0.6, 0.1); } break;
      case 'dodge': this.s('roll', 0.45, 0.05); if (this.tut === 'dodge') this.tutCount++; break;
      case 'skill': {
        const map: Record<string, string> = { bash: 'bash', whirl: 'whirl', dash: 'dash', smoke: 'smoke', volley: 'volley', trap: 'trap', flurry: 'flurry', palm: 'palm', heal: 'heal', smite: 'smite', fireball: 'fireball', nova: 'nova' };
        this.s(map[ev.id] ?? 'power', 0.55, 0.1);
        if (this.tut === 'skill') this.tutCount++;
        break;
      }
      case 'boom': {
        const x = this.sx(ev.x, ev.z).x;
        if (ev.kind === 'fire' || ev.kind === 'meteor' || ev.kind === 'blast') { this.s('boom', 0.6, 0.06, x); if (ev.r > 2.4) shake(this, 0.005, 140); }
        else if (ev.kind === 'slam' || ev.kind === 'slamLand' || ev.kind === 'quake' || ev.kind === 'rock') { this.s('slam', 0.55, 0.08, x); }
        else if (ev.kind === 'frost' || ev.kind === 'nova') this.s('frost', 0.5, 0.1, x);
        else if (ev.kind === 'smite' || ev.kind === 'holy') this.s('holy', 0.5, 0.08, x);
        else if (ev.kind === 'blink') this.s('blink', 0.5, 0.1, x);
        break;
      }
      case 'pickup':
        if (ev.kind === 'gold') { this.s('coin', 0.35, 0.04); }
        else if (ev.kind === 'potion') { this.s('heal', 0.5, 0.1); this.floatAt(ev.x, ev.z, t('potion'), '#ff8a9a', 26); }
        else if (ev.power) { this.s('power', 0.6, 0.1); banner(this, 520, t('pw_' + ev.power), '', { color: '#' + POWER_COLOR[ev.power].toString(16).padStart(6, '0'), size: 40, hold: 0.7 }); }
        break;
      case 'potion': this.s('drink', 0.6, 0.2); break;
      case 'heal': if (ev.amount > 0 && Math.hypot(ev.x - b.hero.x, ev.z - b.hero.z) < 0.5) this.dmgNumber(ev.x, ev.z, ev.amount, false, '#7aff9a', '+'); break;
      case 'spawn': {
        this.s('spawn', 0.3, 0.1);
        if (ev.boss) {
          this.s('bossRoar', 0.7, 1);
          if (BOSS_KINDS.includes(ev.kind) || MINIBOSS_KINDS.includes(ev.kind)) {
            bossIntro(this, t('f_' + ev.kind), t('bs_' + ev.kind));
            playMusic(this, 'boss');
          }
        }
        break;
      }
      case 'wave': if (ev.n > 1) { banner(this, 420, t('wave', { n: ev.n, of: ev.of }), '', { color: '#ffd86a', size: 46, hold: 0.8 }); this.s('wave', 0.4, 0.5); } break;
      case 'room':
        if (ev.n > 0) {
          this.fade.setAlpha(1);
          this.tweens.add({ targets: this.fade, alpha: 0, duration: 420 });
          this.view.setMode('battle', ev.arena as never);
          this.view.battle.showArena(ev.arena as never, b.layoutSeed);
          this.view.battle.camPos.set(0, 0, 0);
          banner(this, 420, t('room', { n: ev.n + 1, of: ev.of }), '', { color: '#ffd86a', size: 48, hold: 1 });
          this.s('door', 0.5, 0.3);
        }
        break;
      case 'roomClear': this.s('clear', 0.5, 0.3); if (!b.bossesKilled.length || b.room < b.rooms.length - 1) banner(this, 420, t('roomClear'), '', { color: '#a8ff9a', size: 44, hold: 0.9 }); break;
      case 'bossPhase': this.s('bossRoar', 0.6, 0.5); this.view.battle.shake(0.35, 0.4); break;
      case 'tele': if (FOE[ev.kind].ai === 'boss') this.s('tele', 0.35, 0.15); break;
      case 'cast': if (ev.atk === 'fire') this.s('cast', 0.35, 0.1); else if (ev.atk === 'heal') this.s('heal', 0.3, 0.2); break;
      case 'shrine': this.hint('hint_shrine'); this.s('shrine', 0.4, 0.5); break;
      case 'trap': this.s(ev.sprung ? 'trapSnap' : 'trap', 0.5, 0.1); break;
      case 'freeze': break;
      case 'victory': this.s('fanfare', 0.6, 1); break;
      case 'defeat': break;
    }
  }

  /** The fight is over: spoils on a win, the inn on a loss. */
  private endFight(): void {
    const b = this.battle!, f = this.fight!;
    this.ended = true;
    const sp = this.camp.settle(f, b);
    if (this.tut) this.endTutorial(false);
    this.camp.save();
    const won = b.over === 'won';
    this.time.delayedCall(won ? 700 : 300, () => {
      if (!won) { this.summary('fallenTitle', false, sp); return; }
      for (const d of this.dmg) { d.t.setVisible(false); this.dmgPool.push(d.t); }
      this.dmg.length = 0;
      if (sp.levels) this.s('levelup', 0.6, 0.5);
      this.openPanel(new LootScreen(this, sp, this.camp, this.host(), () => {
        this.panel = null;
        this.ended = false;
        this.battle = null;
        this.fade.setAlpha(1);
        this.tweens.add({ targets: this.fade, alpha: 0, duration: 420 });
        if (sp.boss) { this.summary(sp.boss === 'lord' ? 'victoryTitle' : 'chapterTitle', true, sp); return; }
        this.view.battle.clear();
        this.view.battle.dropArenas();
        this.enterMap();
        if (sp.items.length) this.hint('hint_bag');
      }));
      this.phase = 'battle';
    });
  }

  // ------------------------------------------------------------------ the end of a session

  /** The journey's summary card; then the result screen. */
  private summary(titleKey: string, win: boolean, sp?: Spoils): void {
    if (this.phase === 'summary') return;
    this.phase = 'summary';
    this.closePlacePrompt();
    this.switchHud();
    this.camp.save();
    this.summaryWin = win;
    this.summaryTitle = titleKey;
    const { width, height } = this.scale;
    const root = this.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    root.add(this.add.rectangle(0, 0, width, height, 0x06040c, 0.6).setOrigin(0).setInteractive().on('pointerup', () => this.finishSession()));
    const cy = height * 0.47;
    root.add(themeCard(this, width / 2, cy, SUMMARY_W, SUMMARY_H));
    let y = cy - SUMMARY_H / 2 + 74;
    root.add(fitWidth(labelAt(this, width / 2, y, t(titleKey), overlayHeadingStyle(win)), SUMMARY_W - 70, 0.62));
    y += 76;
    const s = this.camp.s;
    root.add(new FmtLine(this, width / 2, y, S_SUM, 0.5).set('sumRenown', { n: s.renown }));
    y += 50;
    root.add(new FmtLine(this, width / 2, y, S_SUM_SMALL, 0.5).set('sumLevel', { n: s.level }));
    y += 38;
    root.add(new FmtLine(this, width / 2, y, S_SUM_SMALL, 0.5).set('sumKills', { n: s.kills - this.session.kills }));
    y += 38;
    root.add(new FmtLine(this, width / 2, y, S_SUM_SMALL, 0.5).set('sumGold', { n: s.goldEarned - this.session.gold }));
    y += 46;
    if (sp && sp.lostGold) { root.add(new FmtLine(this, width / 2, y, { ...S_SUM_SMALL, color: '#8a1c24' }, 0.5).set('lostGold', { n: sp.lostGold })); y += 40; }
    if (!win) { root.add(new Para(this, width / 2, y - 14, t('restore'), S_SUM_SMALL, SUMMARY_W - 90, 0.5, 26)); y += 40; }
    const q = this.camp.tracked();
    const next = s.victory ? t('sumDone') : q ? t('sumNext', { name: t('q_' + q) }) : '';
    if (next) root.add(new Para(this, width / 2, y, next, S_SUM_SMALL, SUMMARY_W - 90, 0.5, 26));
    const go = new KitButton(this, width / 2, cy + SUMMARY_H / 2 - 60, { w: 300, h: 80, color: 0x2c4a9a, label: t('onward'), style: { size: 28 } }, () => this.finishSession());
    root.add(go);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 260 });
    if (win) this.s('fanfare', 0.5, 1); else this.s('lose', 0.5, 1);
  }

  private summaryWin = false;
  private summaryTitle = '';

  private finishSession(): void {
    if (this.isOver) return;
    this.setScore(this.camp.s.renown);
    this.endGame({ win: this.summaryWin, title: t(this.summaryTitle), delay: 100 });
  }

  // ------------------------------------------------------------------ the training and the hints

  private startTutorial(): void {
    this.tutStep('move');
    const { width } = this.scale;
    this.tutSkip = new KitButton(this, width - 110, 432, { w: 152, h: 60, color: 0x6c6a74, label: t('tutSkip'), style: { size: 24 } }, () => this.endTutorial(true));
    this.tutSkip.setScrollFactor(0).setDepth(9450);
  }

  private tutStep(step: TutStep): void {
    this.tut = step;
    this.tutCount = 0;
    this.tutCard?.destroy();
    this.tutCard = null;
    if (!step) return;
    const touch = this.controls.touchUi;
    const lines: Record<string, [string, string]> = {
      move: [touch ? 'tut_move_t' : 'tut_move_k', 'tut_move_d'],
      farm: [touch ? 'tut_move_t' : 'tut_move_k', 'tut_farm_d'],
      fight: ['tut_fight_t', touch ? 'tut_fight_d_touch' : 'tut_fight_d_keys'],
      dodge: ['tut_dodge_t', touch ? 'tut_dodge_d_touch' : 'tut_dodge_d_keys'],
      skill: ['tut_skill_t', touch ? 'tut_skill_d_touch' : 'tut_skill_d_keys'],
    };
    const [title, body] = lines[step];
    this.tutCard = this.card(t(title), t(body), 300);
    if (step === 'dodge' && this.battle) this.battle.lessonSlam();
    this.s('page', 0.4, 0.2);
  }

  /** A themed card with a title and a paragraph (tutorial lessons, hints). */
  private card(title: string, body: string, y: number): Phaser.GameObjects.Container {
    const { width } = this.scale;
    const c = this.add.container(width / 2, y).setScrollFactor(0).setDepth(9440);
    const h = title ? TUT_H : HINT_H;
    c.add(themeCard(this, 0, 0, TUT_W, h));
    if (title) c.add(fitWidth(labelAt(this, 0, -h / 2 + 48, title, T_TITLE), TUT_W - 80));
    const para = new Para(this, 0, 0, body, T_BODY, TUT_W - 90, 0.5, 27);
    para.y = title ? -h / 2 + 76 : -para.textHeight / 2 - 2;
    c.add(para);
    c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    return c;
  }

  private updateTutorial(): void {
    const b = this.battle;
    if (!b) return;
    if (this.tut === 'fight' && this.tutCount >= 4) this.tutStep('dodge');
    else if (this.tut === 'dodge' && !b.zones.some((z) => z.kind === 'slam' && !z.done) && (this.tutCount > 0 || b.time > 1)) { if (b.zones.length === 0 || this.tutCount > 0) this.tutStep('skill'); }
    else if (this.tut === 'skill' && this.tutCount > 0) this.endTutorial(false);
  }

  endTutorial(skipped: boolean): void {
    this.tutStep(null);
    this.tutSkip?.destroy();
    this.tutSkip = null;
    this.camp.s.tutorial = true;
    this.camp.save();
    if (this.battle) { this.battle.passive = false; if (!skipped) banner(this, 420, t('tut_go'), '', { color: '#ffd86a', size: 44, hold: 1.1 }); }
  }

  /** A first-time hint (once per campaign), or a reminder (`always`). */
  hint(key: string, always = false): void {
    const s = this.camp.s;
    if (!always && s.hints.includes(key)) return;
    if (!always) s.hints.push(key);
    if (this.hintCard) { if (!this.hintQueue.includes(key)) this.hintQueue.push(key); return; }
    this.hintCard = this.card('', t(key), this.tut ? 470 : 270);
    const c = this.hintCard;
    c.setDepth(9430);
    this.tweens.add({ targets: c, alpha: 0, delay: 3200, duration: 380, onComplete: () => { c.destroy(); if (this.hintCard === c) this.hintCard = null; const n = this.hintQueue.shift(); if (n) this.hint(n, true); } });
  }

  // ------------------------------------------------------------------ numbers over heads

  private dmgNumber(x: number, z: number, n: number, crit: boolean, color?: string, prefix = ''): void {
    const t0 = this.dmgPool.pop() ?? txt(this, 0, 0, '', { title: true, size: 30, strokeThickness: 6 }).setDepth(9200).setScrollFactor(0);
    t0.setText(prefix + n).setColor(color ?? (crit ? '#ffd23f' : '#ffffff')).setFontSize(crit ? 40 : 30).setVisible(true).setAlpha(1).setScale(crit ? 1.25 : 1);
    this.dmg.push({ t: t0, life: 0.8, x: x + (Math.random() - 0.5) * 0.6, y: 1.4, z });
  }

  private floatAt(x: number, z: number, s: string, color: string, size: number): void {
    const p = this.sx(x, z, 2);
    const tt = txt(this, p.x, p.y, s, { title: true, size, color, strokeThickness: 6 }).setDepth(9200).setScrollFactor(0);
    this.tweens.add({ targets: tt, y: p.y - 60, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => tt.destroy() });
  }

  private updateDmg(dt: number): void {
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.life -= dt;
      d.y += dt * 1.4;
      if (d.life <= 0 || this.phase !== 'battle') { d.t.setVisible(false); this.dmgPool.push(d.t); this.dmg.splice(i, 1); continue; }
      const p = this.sx(d.x, d.z, d.y);
      d.t.setPosition(p.x, p.y).setAlpha(Math.min(1, d.life * 3));
    }
  }

  // ------------------------------------------------------------------ test hooks

  testSkipTutorial(): void { this.camp.s.chosen = true; this.camp.s.tutorial = true; this.panel?.close(); this.panel = null; if (this.phase === 'select') this.enterMap(); }
  testFight(place?: Exclude<PlaceId, 'village'>): void { this.panel?.close(); this.panel = null; this.phase = 'map'; this.startFight(place ? this.camp.dungeon(place) : this.camp.encounter(this.hereHex())); }
  /** One room of a place's dungeon (looks check, store art). */
  testRoom(place: Exclude<PlaceId, 'village'>, room: number): void {
    this.panel?.close(); this.panel = null; this.phase = 'map';
    const f = this.camp.dungeon(place);
    this.startFight({ ...f, rooms: [f.rooms[room]] });
  }
  testAuto(on: boolean): void { this.autoplay = on; if (this.battle) this.bot = on ? new BattleBot(this.battle, SKILL.good, 7) : null; }
  testStep(secs: number): void { const b = this.battle; if (!b) return; for (let t0 = 0; t0 < secs && !b.over; t0 += STEP) { b.step(STEP, this.bot ? this.bot.input(STEP) : NO_INPUT); for (const ev of b.events) this.onEvent(ev); b.events.length = 0; } }
  testCampaign(level: number, quests: string[]): void {
    const s = this.camp.s;
    s.chosen = true; s.tutorial = true; s.level = level;
    for (const q of quests) (s.quests as Record<string, string>)[q] = 'done';
    for (const q of Object.keys(s.quests)) if (s.quests[q as keyof typeof s.quests] === 'locked') { /* recomputed below */ }
    s.staff = quests.includes('staff');
    for (const h of this.camp.map.hexes) if (h.r >= 4) s.seen.push(h.i);
    s.hp = this.camp.maxHp;
    this.camp.save();
  }
  testPower(p: PowerId): void { this.battle?.givePower(p); }
  /** Steps the fight with a given input (the first step only for presses). */
  testInput(inp: Partial<Input>, secs: number): void {
    const b = this.battle;
    if (!b) return;
    let first = true;
    for (let t0 = 0; t0 < secs && !b.over; t0 += STEP) {
      const i: Input = { ...NO_INPUT, mx: inp.mx ?? 0, mz: inp.mz ?? 0, ...(first ? inp : {}) };
      first = false;
      b.step(STEP, i);
      for (const ev of b.events) this.onEvent(ev);
      b.events.length = 0;
    }
  }
  /** Every foe kind in rows, standing still (looks check). */
  testLineup(kinds: FoeKind[], cam = 1.3): void {
    this.panel?.close(); this.panel = null; this.phase = 'map';
    this.startFight({ kind: 'encounter', place: null, camp: null, level: 3, rooms: [{ arena: 'field', waves: [] }] });
    const b = this.battle!;
    b.passive = true;
    b.foes.length = 0;
    kinds.forEach((k, i) => { const f = b.spawn(k, ((i % 4) - 1.5) * 2.6, -4 - Math.floor(i / 4) * 2.8, 0); f.face = 0; });
    b.hero.z = 3;
    this.view.battle.camDist = cam;
  }
  get cycleLevels(): number { return CYCLE_LEVELS; }
}
