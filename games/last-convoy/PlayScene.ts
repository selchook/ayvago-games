// Last Convoy: the Play scene. A campaign run goes the squad → the town map → the briefing → the
// mission on foot → the escape drive → the summary → a power-card draft → the map … until a mission
// is lost (the result screen; a rewarded ad may continue it once) or the last one is won (the
// campaign's end: a won run). Last Stand goes the squad → its briefing → endless waves at the square
// (a draft every second wave) until the truck or the survivor falls.
// The mission is the pure simulation (sim.ts) stepped at 60 Hz and drawn in 3D (view.ts); the drive
// is drive.ts drawn by driveview.ts in the same world, steered with the shared @core car steering.
// On top: the HUD chips (score, the objective, health, ammo, the horde meter, the night clock,
// scrap, cards, the boss's bar; on the drive armour, nitro, the road left), a minimap, the right-thumb
// buttons (ATTACK, DODGE, ABILITY, SWAP, DOG and USE when something is in reach), edge arrows to the
// objectives, damage numbers, finisher names, banners and toasts, all painted ahead in the theme.
// Touch: the stick (anywhere off the buttons) moves. Keys: WASD / arrows move, the mouse aims and its
// button attacks; Space / J / Z attack, Shift / K / X dodge, Q swap, R reload, E use (or the ability
// when nothing is in reach), C ability, F / L the dog; on the drive ←/→ steer, ↑ gas, ↓ brake, Space
// nitro. The gamepad's core mapping lands on the same keys.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, CarSteering, t, isEasy, hudChip, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge, labelAt, labelTexture, fitWidth,
  FmtLine, GlyphText, isModalOpen, upper, playerCharacter, type HudChip, type LabelStyle,
} from '@core';
import { THREE, type World3D } from '@core/three';
import { View } from './view';
import { DriveView } from './driveview';
import { Mission, newRun, mulberry, NO_INPUT, type RunState, type SimEvent, type Input, type DogKind } from './sim';
import { Drive, NO_DRIVE, type DriveEvent, type DriveInput } from './drive';
import { Bot, SKILL, driveBot, botPick } from './bot';
import { DT, HERO, MISSIONS, GUN, STAND, START_HERO, scrapFor, suppliesFor, RESCUE_MISSIONS, type HeroId, type MissionDef } from './defs';
import { rollCards, CARD, type CardId } from './powers';
import { loadMeta, saveMeta, type Meta } from './meta';
import { makeArt, iconKey, arrowKey } from './art';
import { HALF } from './town';
import {
  SquadScreen, MapScreen, BriefScreen, DraftScreen, SummaryScreen, GarageScreen, CardsScreen, CombosScreen, pauseSides, freedIn, type Panel, type ScreenHost,
} from './screens';
import { ActionButton, S_BANNER, S_BIG, S_RED, S_TOAST, S_DMG, S_CRIT, S_HURT, S_FIN, S_DIST, S_BTN, S_KEY, DIST_GLYPHS } from './hud';
import { renderIconSheet, ICON_SHEET, iconFrame } from './icons';

type Phase = 'squad' | 'map' | 'brief' | 'play' | 'drive' | 'summary' | 'draft' | 'garage' | 'cards' | 'combos' | 'end';

const COL = { attack: 0xe8453a, dodge: 0x3ac8e8, ability: 0xf2b21a, swap: 0x9aa0a8, dog: 0xc89a5a, use: 0x5ad86a };
const ITEM_ICON: Record<string, string> = { fuel: 'fuel', part: 'part', key: 'key', battery: 'battery' };

/** Controls has no switch for its stick: while the car steering owns the left thumb, its drawing is hidden. */
function stickShown(c: Controls, on: boolean): void {
  const s = c as unknown as { base?: Phaser.GameObjects.Arc; knob?: Phaser.GameObjects.Arc };
  s.base?.setAlpha(on ? 1 : 0);
  s.knob?.setAlpha(on ? 1 : 0);
}

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (the view's; the GPU memory check finds the renderer through it). */
  world!: World3D;
  driveView!: DriveView;
  sim: Mission | null = null;
  drive: Drive | null = null;
  run!: RunState;
  meta!: Meta;
  phase: Phase = 'squad';
  panel: Panel | null = null;
  mission: MissionDef | null = null;
  bot: Bot | null = null;
  autoDrive = false;
  testSpeed = 1;
  private quiet = false;
  private controls!: Controls;
  steering!: CarSteering;
  private acc = 0;
  private rnd!: () => number;
  private host!: ScreenHost;
  private touch = false;
  private mapSel = 0;
  private lostIn: 'foot' | 'drive' | null = null;
  private revived = false;
  // HUD
  private hpChip!: HudChip; private hpBar!: Phaser.GameObjects.Graphics;
  private ammoChip!: HudChip;
  private hordeChip!: HudChip; private hordeBar!: Phaser.GameObjects.Graphics;
  private nightChip!: HudChip;
  private scrapChip!: HudChip;
  private cardChip!: HudChip;
  private bossChip!: HudChip; private bossBar!: Phaser.GameObjects.Graphics;
  private mapChip!: HudChip; private mapG!: Phaser.GameObjects.Graphics;
  private armorChip!: HudChip; private armorBar!: Phaser.GameObjects.Graphics;
  private nitroChip!: HudChip;
  private roadChip!: HudChip; private roadBar!: Phaser.GameObjects.Graphics;
  private holdRing!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Image;
  private arrows: { img: Phaser.GameObjects.Image; dist: GlyphText }[] = [];
  private markers: Phaser.GameObjects.Image[] = [];
  private btn: Record<'attack' | 'dodge' | 'ability' | 'swap' | 'dog' | 'use', ActionButton> = {} as never;
  private padBox = { left: 0, top: 0 };
  private keys = { dodge: false, swap: false, reload: false, ability: false, dog: false, use: false, atkPress: false, nitro: false };
  private keyHeld = { use: false };
  private mouse = { down: false, x: 0, y: 0, t: -9, aim: false };
  private atkWas = false;
  private atkLatch = true;
  private dmgPool: GlyphText[] = [];
  private toastImg: Phaser.GameObjects.Image | null = null;
  private lowT = 0;
  private hpShown = -1;
  private lastEvents = new Set<string>();
  private hordeDir: { x: number; z: number; t: number } | null = null;
  private groanT = 3;
  private engine: Phaser.Sound.BaseSound | null = null;
  private tut: { step: number; t: number; skip: KitSkip | null } | null = null;
  private hinted = new Set<string>();
  private driveKeys!: { left: Phaser.Input.Keyboard.Key[]; right: Phaser.Input.Keyboard.Key[]; up: Phaser.Input.Keyboard.Key[]; down: Phaser.Input.Keyboard.Key[]; nitro: Phaser.Input.Keyboard.Key[] };
  perf = { frames: 0 };

  createGame(): void {
    this.meta = loadMeta();
    this.meta.runs++;
    saveMeta(this.meta);
    this.phase = 'squad';
    this.perf.frames = 0;
    this.panel = null;
    this.sim = null;
    this.drive = null;
    this.mission = null;
    this.bot = null;
    this.autoDrive = false;
    this.acc = 0;
    this.testSpeed = 1;
    this.quiet = false;
    this.lostIn = null;
    this.revived = false;
    this.keys = { dodge: false, swap: false, reload: false, ability: false, dog: false, use: false, atkPress: false, nitro: false };
    this.keyHeld = { use: false };
    this.mouse = { down: false, x: 0, y: 0, t: -9, aim: false };
    this.atkWas = false;
    this.atkLatch = true;
    this.dmgPool = [];
    this.toastImg = null;
    this.lowT = 0;
    this.hpShown = -1;
    this.lastEvents = new Set();
    this.hordeDir = null;
    this.groanT = 3;
    this.engine = null;
    this.tut = null;
    this.hinted = new Set(this.meta.hints);
    this.arrows = [];
    this.markers = [];
    this.touch = this.sys.game.device.input.touch;
    this.rnd = mulberry((Date.now() & 0xffffff) ^ 0x51c0);
    if (!this.meta.heroes.includes(this.meta.hero)) this.meta.hero = this.meta.heroes[0];
    this.run = this.newRun('campaign');
    this.mapSel = Math.min(MISSIONS.length, this.meta.unlocked) - 1;
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.touch };
    makeArt(this);
    this.view = new View(this, { hero: this.meta.hero, dog: this.meta.dog });
    this.world = this.view.world;
    this.driveView = new DriveView(this.view);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.view.dispose(); this.driveView.dispose(); this.engine?.destroy(); });
    this.controls = new Controls(this, { joystick: true });
    this.steering = new CarSteering(this, {
      touch: this.touch,
      buttons: [
        { id: 'gas', shape: 'pedal', x: 1180, y: 560, w: 150, h: 230, color: 0x2fae5a, label: t('gas'), hit: { right: Infinity, bottom: Infinity } },
        { id: 'brake', shape: 'pedal', x: 1012, y: 600, w: 130, h: 160, color: 0xc8382a, label: t('brake') },
        { id: 'nitro', shape: 'round', x: 1050, y: 418, r: 62, color: 0x3aa8ff, icon: 'bolt', count: true, holds: 'gas', label: t('nitro'), labelY: -84, labelSize: 18 },
      ],
      steer: { x: 200, y: 600 },
    });
    this.steering.end();
    const K = Phaser.Input.Keyboard.KeyCodes, kb = this.input.keyboard!;
    const k = (c: number) => kb.addKey(c, false, false);
    this.driveKeys = { left: [k(K.LEFT), k(K.A)], right: [k(K.RIGHT), k(K.D)], up: [k(K.UP), k(K.W)], down: [k(K.DOWN), k(K.S)], nitro: [k(K.SPACE), k(K.Z), k(K.ENTER)] };
    this.setupHud();
    this.setupButtons();
    this.setupKeys();
    // the run's cards and the mission beside the pause card
    // (scene events outlive a restart: both listeners go at shutdown, or every retry would add one more)
    const onPause = () => {
      const ps = this.scene.get('Pause');
      ps?.events.once(Phaser.Scenes.Events.CREATE, () => {
        if (this.isOver) return;
        const m = this.phase === 'play' || this.phase === 'drive' || this.phase === 'brief' ? this.mission : null;
        pauseSides(ps, this.run.cards, m, m ? this.meta.stars[m.n - 1] : 0);
      });
    };
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    const latch = () => { this.atkLatch = true; };
    this.events.on(Phaser.Scenes.Events.RESUME, latch);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.events.off(Phaser.Scenes.Events.PAUSE, onPause); this.events.off(Phaser.Scenes.Events.RESUME, latch); });
    this.hooks();
    this.showPlayUi('none');
    this.openSquad();
  }

  private newRun(kind: RunState['kind']): RunState {
    const buddy = this.meta.heroes.find((h) => h !== this.meta.hero) ?? null;
    return newRun(isEasy() ? 'easy' : 'normal', kind, this.meta.hero, buddy, this.meta.dog, this.meta.ranks);
  }

  // ---------------------------------------------------------------- the HUD

  private bar(w: number): Phaser.GameObjects.Graphics { const g = this.add.graphics(); g.setData('chipWidth', w); return g; }

  private setupHud(): void {
    const y = HUD_ROW2_Y;
    this.hpBar = this.bar(140);
    this.hpChip = hudChip(this, HUD_MARGIN, y, { icon: iconKey('heart'), iconSize: 28, text: '100', minWidth: 90, items: [this.hpBar] });
    this.ammoChip = hudChip(this, this.hpChip.right + HUD_GAP, y, { icon: ICON_SHEET, iconFrame: iconFrame('w-pistol'), iconSize: 40, text: '12/48', minWidth: 120 });
    this.hordeBar = this.bar(110);
    this.hordeChip = hudChip(this, this.ammoChip.right + HUD_GAP, y, { icon: iconKey('horde'), iconSize: 30, text: '', items: [this.hordeBar] });
    this.cardChip = hudChip(this, hudRightEdge(this), y, { align: 'right', icon: iconKey('card'), iconSize: 30, text: '×0', minWidth: 76 });
    this.scrapChip = hudChip(this, this.cardChip.left - HUD_GAP, y, { align: 'right', icon: iconKey('scrap'), iconSize: 28, text: '0', minWidth: 86 });
    this.nightChip = hudChip(this, this.scrapChip.left - HUD_GAP, y, { align: 'right', icon: iconKey('sun'), iconSize: 28, text: '19:30', minWidth: 110 });
    this.bossBar = this.bar(300);
    this.bossChip = hudChip(this, this.scale.width / 2, y + 56, { align: 'center', icon: iconKey('skull'), iconSize: 32, items: [this.bossBar] });
    this.hud.centerChip.setIcon(iconKey('fuel'), undefined, 30);
    this.mapG = this.add.graphics();
    this.mapG.setData('chipWidth', 150);
    this.mapChip = hudChip(this, HUD_MARGIN, y + 112, { height: 162, minWidth: 166, text: '', items: [this.mapG] });
    // the drive's chips
    this.armorBar = this.bar(150);
    this.armorChip = hudChip(this, HUD_MARGIN, y, { icon: ICON_SHEET, iconFrame: iconFrame('v-truck'), iconSize: 42, text: '100', minWidth: 90, items: [this.armorBar] });
    this.nitroChip = hudChip(this, this.armorChip.right + HUD_GAP, y, { icon: iconKey('nitro'), iconSize: 30, text: '×2', minWidth: 76 });
    this.roadBar = this.bar(200);
    this.roadChip = hudChip(this, this.scale.width / 2, y, { align: 'center', icon: ICON_SHEET, iconFrame: iconFrame('town-sign'), iconSize: 38, text: '', items: [this.roadBar] });
    this.holdRing = this.add.graphics().setDepth(8900);
    this.vignette = this.add.image(0, 0, 'lc-vignette').setOrigin(0).setDisplaySize(this.scale.width, this.scale.height).setDepth(8800).setScrollFactor(0).setAlpha(0);
    for (const k of ['obj', 'obj', 'surv', 'horde']) {
      const img = this.add.image(0, 0, arrowKey(k)).setDepth(9000).setScrollFactor(0).setVisible(false).setDisplaySize(46, 46);
      const dist = new GlyphText(this, 0, 0, '0m', S_DIST, 0.5, DIST_GLYPHS).setDepth(9001).setScrollFactor(0).setVisible(false);
      this.add.existing(dist);
      this.arrows.push({ img, dist });
    }
  }

  /** The right-thumb cluster: ATTACK in the corner, the others on an arc round it. */
  private setupButtons(): void {
    const { width, height } = this.scale;
    const touch = this.touch;
    const k = touch ? 1 : 0.72;
    const cx = width - 108 * k - 16, cy = height - 108 * k - (touch ? 10 : 30);
    const sp = touch ? k : k * 1.16;
    const at = (deg: number, d: number): [number, number] => [cx + Math.cos(deg * Math.PI / 180) * d * sp, cy - Math.sin(deg * Math.PI / 180) * d * sp];
    const key = (s: string) => (touch ? '' : s);
    this.btn.attack = new ActionButton(this, cx, cy, 78 * k, 'attack', 'crosshair', t('attack'), key(t('keySpace')), COL.attack);
    this.btn.dodge = new ActionButton(this, ...at(180, 172), 54 * k, 'dodge', 'dodge', t('dodge'), key('Shift'), COL.dodge);
    this.btn.ability = new ActionButton(this, ...at(136, 182), 54 * k, 'ability', 'a-heal', t('abilityBtn'), key('C'), COL.ability);
    this.btn.swap = new ActionButton(this, ...at(92, 172), 50 * k, 'swap', 'swap', t('swap'), key('Q'), COL.swap);
    this.btn.dog = new ActionButton(this, ...at(160, 300), 46 * k, 'dog', 'paw', t('dogBtn'), key('F'), COL.dog);
    this.btn.use = new ActionButton(this, ...at(118, 300), 52 * k, 'use', 'hand', t('use'), key('E'), COL.use);
    const bs = Object.values(this.btn);
    this.padBox = { left: Math.min(...bs.map((b) => b.x - b.r * 1.15)), top: Math.min(...bs.map((b) => b.y - b.r * 1.15)) };
  }

  /** Which HUD shows: on foot, on the drive, or none (screens). */
  private showPlayUi(mode: 'foot' | 'drive' | 'none'): void {
    const foot = mode === 'foot', drive = mode === 'drive';
    // first: the core HUD's layout (setCenter) shows the score chip again
    if (!foot) this.hud.setCenter('');
    for (const c of [this.hud.scoreChip, this.hpChip, this.ammoChip, this.cardChip, this.scrapChip]) c.setVisible(foot || drive);
    for (const c of [this.hud.centerChip, this.hordeChip, this.nightChip, this.mapChip]) c.setVisible(foot);
    this.hpChip.setVisible(foot); this.ammoChip.setVisible(foot);
    for (const c of [this.armorChip, this.nitroChip, this.roadChip]) c.setVisible(drive);
    this.hud.rightChip.setVisible(false);
    this.bossChip.setVisible(false);
    for (const b of Object.values(this.btn)) b.setVisible(foot && b.kind !== 'use');
    if (!foot) { for (const a of this.arrows) { a.img.setVisible(false); a.dist.setVisible(false); } this.holdRing.clear(); for (const m of this.markers) m.setVisible(false); }
    if (this.sim?.run.kind === 'stand') this.hordeChip.setVisible(false);
    stickShown(this.controls, !drive);
    this.vignette.setAlpha(0);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, w: number, k: number, col: number, h = 18): void {
    g.clear();
    g.fillStyle(0x0a0806, 0.8).fillRect(-w / 2, -h / 2, w, h);
    if (k > 0) g.fillStyle(col, 1).fillRect(-w / 2, -h / 2, Math.max(6, w * Math.min(1, k)), h);
    g.fillStyle(0xffffff, 0.2).fillRect(-w / 2 + 2, -h / 2 + 2, Math.max(3, w * Math.min(1, k) - 4), 4);
    g.lineStyle(2, 0x000000, 0.8).strokeRect(-w / 2, -h / 2, w, h);
  }

  private refreshHud(dt: number): void {
    const s = this.sim;
    if (!s) return;
    const h = s.hero, time = this.time.now / 1000;
    this.setScore(this.run.score);
    // health
    const k = Math.max(0, h.hp / h.max);
    const low = k < 0.3;
    this.drawBar(this.hpBar, 140, k, low ? (Math.floor(this.time.now / 160) % 2 ? 0xff3b3b : 0xff7a5a) : k < 0.6 ? 0xffc23f : 0x4fe07a);
    const n = Math.max(0, Math.ceil(h.hp));
    if (n !== this.hpShown) { if (n < this.hpShown) this.tweens.add({ targets: this.hpChip, scale: 1.08, duration: 70, yoyo: true }); this.hpShown = n; this.hpChip.setText(String(n)); }
    this.vignette.setAlpha(low ? 0.35 + Math.sin(time * 6) * 0.15 : Math.max(0, this.vignette.alpha - dt * 2));
    // ammo: the weapon in hand (the gun's mag and reserve, or the melee weapon)
    const H = HERO[h.id];
    if (h.weapon === 'gun') { this.ammoChip.setIcon(ICON_SHEET, iconFrame('w-' + H.gun), 40); this.ammoChip.setText(h.reloadT > 0 ? '…' : `${h.mag}/${h.reserve}`); this.ammoChip.setTextColor(h.mag === 0 ? '#ff7a5a' : '#fff4d8'); }
    else { this.ammoChip.setIcon(ICON_SHEET, iconFrame('w-' + H.melee), 40); this.ammoChip.setText('∞'); this.ammoChip.setTextColor('#fff4d8'); }
    this.ammoChip.setAnchor(this.hpChip.right + HUD_GAP, HUD_ROW2_Y, 'left');
    this.hordeChip.setAnchor(this.ammoChip.right + HUD_GAP, HUD_ROW2_Y, 'left');
    // the horde meter
    const hk = s.horde / 100;
    this.drawBar(this.hordeBar, 110, hk, hk > 0.75 ? (Math.floor(this.time.now / 180) % 2 ? 0xff3b3b : 0xff8a5a) : hk > 0.45 ? 0xffb03a : 0x9ad84a, 14);
    // the night clock (19:30 to 23:30)
    if (s.run.kind === 'stand') { this.nightChip.setIcon(iconKey('skull'), undefined, 28); this.nightChip.setText(String(s.stats.kills)); }
    else {
      const mins = 19 * 60 + 30 + Math.floor(s.night * 240);
      this.nightChip.setText(`${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`);
      this.nightChip.setIcon(iconKey(s.night > 0.5 ? 'moon' : 'sun'), undefined, 28);
    }
    this.scrapChip.setText(String(this.meta.scrap + this.run.scrap));
    this.cardChip.setText('×' + this.run.cards.length);
    // the right-hand chips grow leftwards with their numbers: keep them in a row
    this.scrapChip.setAnchor(this.cardChip.left - HUD_GAP, HUD_ROW2_Y, 'right');
    this.nightChip.setAnchor(this.scrapChip.left - HUD_GAP, HUD_ROW2_Y, 'right');
    // the objective
    const ctr = this.hud.centerChip;
    if (s.run.kind === 'stand') {
      const tk = s.truck ? Math.max(0, s.truck.hp / s.truck.max) : 0;
      this.hud.setCenter(`${t('wave', { n: s.wave.n })}  ·  ${Math.ceil(tk * 100)}%`);
      ctr.setIcon(ICON_SHEET, iconFrame('v-truck'), 40);
      ctr.setTextColor(tk < 0.35 ? '#ff8a7a' : '#ffffff');
    } else {
      const st = s.stageDef;
      const [done, of] = s.progress();
      ctr.setTextColor('#ffffff');
      if (st?.kind === 'collect') { this.hud.setCenter(`${done}/${of}`); ctr.setIcon(iconKey(ITEM_ICON[st.item!]), undefined, 30); }
      else if (st?.kind === 'rescue') { this.hud.setCenter(`${done}/${of}`); ctr.setIcon(iconKey('survivor'), undefined, 30); }
      else if (st?.kind === 'hold') { this.hud.setCenter(s.hold.on ? `${Math.max(0, Math.ceil((st.secs ?? 30) - s.hold.t))}` : t('use_start')); ctr.setIcon(iconKey('clock'), undefined, 30); ctr.setTextColor(s.hold.on && Math.hypot(h.x - s.hold.x, h.z - s.hold.z) > s.hold.r ? '#ff8a7a' : '#9affc0'); }
      else if (st?.kind === 'boss') { this.hud.setCenter(upper(t('b_' + st.boss))); ctr.setIcon(iconKey('skull'), undefined, 30); }
      else if (st?.kind === 'clear') { this.hud.setCenter(upper(t('k_clear'))); ctr.setIcon(iconKey('a-barricade'), undefined, 30); }
      else { this.hud.setCenter(upper(t('k_return'))); ctr.setIcon(iconKey('truck'), undefined, 30); }
    }
    // the boss
    const b = s.boss;
    if (b && b.state !== 'dead') {
      if (!this.bossChip.visible) { this.bossChip.setVisible(true); this.bossChip.setScale(0.6); this.tweens.add({ targets: this.bossChip, scale: 1, duration: 300, ease: 'Back.easeOut' }); }
      this.drawBar(this.bossBar, 300, b.hp / b.max, b.armor ? 0x5a9aff : b.phase === 3 ? 0xff3a2a : 0xff8a3a, 20);
    } else if (this.bossChip.visible) this.bossChip.setVisible(false);
    this.drawMap(s);
    // the buttons
    const ab = this.btn;
    const charge = h.step === 'pre3' ? Math.min(1, h.chargeT / (0.35 * s.m.charge)) : 0;
    ab.attack.down = h.step !== 'none' || h.firedT < 0.15;
    ab.attack.setIcon(h.weapon === 'gun' ? 'crosshair' : 'blade');
    ab.attack.draw(1, h.alive, time, dt, charge);
    ab.dodge.draw(h.dodgeCd > 0 ? 1 - h.dodgeCd / 0.75 : 1, h.dodgeCd <= 0, time, dt);
    ab.ability.setIcon('a-' + H.ability);
    ab.ability.draw(h.abilityCd > 0 ? 1 - h.abilityCd / (H.cd * s.m.abilityCd) : 1, h.abilityCd <= 0, time, dt);
    ab.swap.setIcon(h.weapon === 'gun' && h.mag < GUN[H.gun].mag * 0.25 && h.reserve > 0 ? 'reload' : 'swap');
    ab.swap.setLabel(h.weapon === 'gun' && h.mag === 0 && h.reserve > 0 ? t('reload') : t('swap'));
    ab.swap.draw(1, h.swapT <= 0, time, dt);
    ab.dog.draw(s.dog.cmdCd > 0 ? 1 - s.dog.cmdCd : 1, s.dog.state !== 'down', time, dt);
    const ctx = s.context();
    if (ctx) {
      if (!ab.use.shown) { ab.use.setVisible(true); ab.use.root.setScale(0.3); this.tweens.add({ targets: ab.use.root, scale: 1, duration: 180, ease: 'Back.easeOut' }); }
      ab.use.setLabel(t('use_' + ctx.kind));
      ab.use.draw(ctx.need > 0 && h.useT > 0 ? h.useT / ctx.need : 1, true, time, dt);
    } else if (ab.use.shown) ab.use.setVisible(false);
  }

  /** The district, north up: blocks, the objectives, the convoy, zombies near, the survivor. */
  private drawMap(s: Mission): void {
    const g = this.mapG.clear();
    const R = 72, k = R / HALF;
    const h = s.hero;
    g.fillStyle(0x0a0806, 0.55).fillRect(-R, -R, R * 2, R * 2);
    for (const b of s.plan.blocks) {
      const r = b.rect;
      const col = b.kind === 'bldg' ? 0x5a5650 : b.kind === 'park' || b.kind === 'tower' ? 0x3a6a3a : 0x3a3a3a;
      g.fillStyle(col, 0.9).fillRect(r.x0 * k, r.z0 * k, (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    }
    const dot = (x: number, z: number, c: number, r: number) => g.fillStyle(c, 1).fillCircle(x * k, z * k, r);
    // chests the dog found, the convoy, the objectives
    for (const c of s.chests) if (!c.opened && (c.item || s.dog.chest === c.id)) dot(c.x, c.z, 0x8affc8, 2.5);
    { const c = s.convoy; g.fillStyle(0x7aff9a, 1).fillRect(c.x * k - 4, c.z * k - 3, 8, 6); }
    for (const o of s.objectives()) { const px = o.x * k, pz = o.z * k; g.fillStyle(0xffd23f, 1).fillTriangle(px, pz - 5, px - 4.5, pz + 3.5, px + 4.5, pz + 3.5); g.lineStyle(1.5, 0x14100c, 1).strokeTriangle(px, pz - 5, px - 4.5, pz + 3.5, px + 4.5, pz + 3.5); }
    for (const v of s.survivors) if (v.state === 'follow') dot(v.x, v.z, 0x7ae8ff, 2.5);
    for (const z of s.zombies) {
      if (z.state === 'dead' || z.state === 'lurk' || (z.state !== 'hunt' && !z.boss && Math.hypot(z.x - h.x, z.z - h.z) > 18)) continue;
      dot(z.x, z.z, z.boss ? 0xff6a3a : z.wave ? 0xff3b3b : 0xc8786a, z.boss ? 4.5 : 1.4);
    }
    const [hx, hz] = [h.x * k, h.z * k];
    const a = h.face, c = Math.cos(a), sn = Math.sin(a);
    const pt = (f: number, sd: number): [number, number] => [hx + sn * f + c * sd, hz + c * f - sn * sd];
    const [ax, ay] = pt(6, 0), [bx, by] = pt(-4, 4), [cx2, cy2] = pt(-4, -4);
    g.fillStyle(0xffffff, 1).fillTriangle(ax, ay, bx, by, cx2, cy2);
    g.lineStyle(1.5, 0x14100c, 1).strokeTriangle(ax, ay, bx, by, cx2, cy2);
    g.lineStyle(2, 0xf2b21a, 0.8).strokeRect(-R, -R, R * 2, R * 2);
  }

  /** Arrows at the screen's edge to the objectives (and the horde), rings over what is being used, "!" over revealed crawlers. */
  private syncMarkers(): void {
    const s = this.sim!;
    const h = s.hero;
    this.holdRing.clear();
    const ring = (x: number, z: number, k: number, col: number) => {
      const p = this.view.screen(x, 2.8, z);
      this.holdRing.lineStyle(9, 0x0a0806, 0.6).strokeCircle(p.x, p.y, 26);
      this.holdRing.lineStyle(7, col, 1).beginPath().arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)).strokePath();
    };
    const ctx = s.context();
    if (ctx && ctx.need > 0 && h.useT > 0) ring(ctx.x, ctx.z, h.useT / ctx.need, 0x7aff9a);
    if (s.stageDef?.kind === 'hold' && s.hold.on) ring(s.hold.x, s.hold.z, s.hold.t / (s.stageDef.secs ?? 30), 0xffd23f);
    // "!" over the crawlers the dog barked at
    let mi = 0;
    for (const z of s.zombies) {
      if (z.state !== 'lurk' || z.reveal <= 0) continue;
      let m = this.markers[mi];
      if (!m) { m = this.add.image(0, 0, iconKey('horde')).setDepth(8950).setDisplaySize(30, 30); this.markers.push(m); }
      const p = this.view.screen(z.x, 1.4, z.z);
      m.setVisible(true).setPosition(p.x, p.y - 10 + Math.sin(this.time.now / 120) * 4).setTint(0xff5a3a);
      mi++;
    }
    for (; mi < this.markers.length; mi++) this.markers[mi].setVisible(false);
    // the arrows
    const want: ({ x: number; z: number } | null)[] = [null, null, null, null];
    const objs = s.objectives();
    want[0] = objs[0] ?? null;
    want[1] = objs[1] ?? null;
    const lost = s.survivors.find((v) => v.state === 'follow' && Math.hypot(v.x - h.x, v.z - h.z) > 14);
    if (lost) want[2] = lost;
    if (this.hordeDir && this.hordeDir.t > 0) want[3] = this.hordeDir;
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2 + 20;
    const mb = this.mapChip.getBounds();
    want.forEach((p, i) => {
      const a = this.arrows[i];
      if (!p) { a.img.setVisible(false); a.dist.setVisible(false); return; }
      const sp = this.view.screen(p.x, 1.2, p.z);
      const inside = sp.x > 60 && sp.x < width - 60 && sp.y > 140 && sp.y < height - 60;
      if (inside) { a.img.setVisible(false); a.dist.setVisible(false); return; }
      const dx = p.x - h.x, dz = p.z - h.z;
      const ang = Math.atan2(dz * 0.8, dx);
      // (top: under the second HUD row)
      const mx = 54, top = 174, bottom = this.toastImg ? 110 : 60;
      const kx = (Math.cos(ang) > 0 ? width - mx - cx : cx - mx) / Math.max(1e-3, Math.abs(Math.cos(ang)));
      const ky = (Math.sin(ang) > 0 ? height - bottom - cy : cy - top) / Math.max(1e-3, Math.abs(Math.sin(ang)));
      const kk = Math.min(kx, ky);
      let x = cx + Math.cos(ang) * kk, y = cy + Math.sin(ang) * kk;
      const pb = this.padBox;
      if (x > pb.left - 30 && y > pb.top - 30) { if (kx < ky) y = pb.top - 30; else x = pb.left - 30; }
      // and clear of the minimap's chip (top left)
      if (x < mb.right + 30 && y < mb.bottom + 30) { if (kx < ky) y = mb.bottom + 30; else x = mb.right + 30; }
      const pulse = 1 + Math.sin(this.time.now / 120 + i) * 0.08;
      a.img.setVisible(true).setPosition(x, y).setRotation(ang).setScale((46 / 64) * pulse * (i === 1 ? 0.8 : 1)).setAlpha(i === 1 ? 0.75 : 1);
      a.dist.setVisible(true).setText(`${Math.round(Math.hypot(dx, dz))}m`).setPosition(x - Math.cos(ang) * 38, y - Math.sin(ang) * 32);
    });
  }

  // ---------------------------------------------------------------- keys and input

  private setupKeys(): void {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.isOver) return;
      if (this.panel && !this.panel.closed) { if (this.panel.key(e.code)) e.preventDefault(); return; }
      if (this.phase === 'drive' && !e.repeat && (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'NumpadEnter')) { this.keys.nitro = true; return; }
      if (this.phase !== 'play' || isModalOpen(this)) return;
      if (this.tut && e.code === 'Tab') { this.endTutorial(); return; }
      if (e.repeat) return;
      switch (e.code) {
        case 'ShiftLeft': case 'ShiftRight': case 'KeyK': case 'KeyX': this.keys.dodge = true; this.btn.dodge.kick(); break;
        case 'KeyQ': this.keys.swap = true; this.btn.swap.kick(); break;
        case 'KeyR': case 'KeyB': this.keys.reload = true; this.btn.swap.kick(); break;
        case 'KeyC': this.keys.ability = true; this.btn.ability.kick(); break;
        case 'KeyF': case 'KeyL': this.keys.dog = true; this.btn.dog.kick(); break;
        case 'KeyE': this.keyHeld.use = true; if (this.sim?.context()) this.keys.use = true; else { this.keys.ability = true; this.btn.ability.kick(); } break;
        case 'Space': case 'KeyJ': case 'KeyZ': case 'Enter': if (!this.atkLatch) { this.keys.atkPress = true; this.btn.attack.kick(); } break;
      }
    });
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => { if (e.code === 'KeyE') this.keyHeld.use = false; });
    // desktop: the mouse aims, its left button attacks
    if (!this.touch) {
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.t = this.time.now; this.mouse.aim = true; });
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (this.phase !== 'play' || this.panel || !p.leftButtonDown()) return;
        this.mouse.down = true; this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.t = this.time.now; this.mouse.aim = true;
        this.keys.atkPress = true;
      });
      this.input.on('pointerup', () => { this.mouse.down = false; });
    }
  }

  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
  private readonly hit = new THREE.Vector3();

  /** The mouse's point on the ground (NaN when the mouse is not aiming). */
  private mouseGround(): { x: number; z: number } {
    if (this.touch || !this.mouse.aim || this.time.now - this.mouse.t > 2500) return { x: NaN, z: NaN };
    const { width, height } = this.scale;
    this.ray.setFromCamera(new THREE.Vector2((this.mouse.x / width) * 2 - 1, -(this.mouse.y / height) * 2 + 1), this.world.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return { x: NaN, z: NaN };
    return { x: this.hit.x, z: this.hit.z };
  }

  private readInput(): Input {
    const c = this.controls;
    const held = c.a || this.btn.attack.held || this.mouse.down || this.input.keyboard!.checkDown(this.input.keyboard!.addKey('J', false, false), 0);
    if (!held) this.atkLatch = false;
    const press = (this.keys.atkPress || this.btn.attack.take() || (held && !this.atkWas)) && !this.atkLatch;
    this.atkWas = held;
    const aim = this.mouseGround();
    const inp: Input = {
      mx: c.axisX, mz: c.axisY,
      atk: held && !this.atkLatch, atkPress: press,
      ax: aim.x, az: aim.z,
      dodge: this.keys.dodge || this.btn.dodge.take(),
      swap: this.keys.swap || (this.btn.swap.take() && !(this.sim && this.sim.hero.weapon === 'gun' && this.sim.hero.mag === 0 && this.sim.hero.reserve > 0)),
      reload: this.keys.reload || (this.btn.swap.presses > 0),
      ability: this.keys.ability || this.btn.ability.take(),
      dog: this.keys.dog || this.btn.dog.take(),
      use: this.keys.use || this.btn.use.take(),
      useHeld: this.keyHeld.use || this.btn.use.held,
    };
    this.btn.swap.take();
    this.keys = { dodge: false, swap: false, reload: false, ability: false, dog: false, use: false, atkPress: false, nitro: false };
    return inp;
  }

  private readDrive(dt: number): DriveInput {
    const down = (ks: Phaser.Input.Keyboard.Key[]) => ks.some((k) => k.isDown);
    const keyAxis = (down(this.driveKeys.right) ? 1 : 0) - (down(this.driveKeys.left) ? 1 : 0);
    const steer = this.steering.steer(dt, keyAxis);
    const nitro = this.steering.take('nitro') || this.keys.nitro;
    this.keys.nitro = false;
    return { steer, gas: down(this.driveKeys.up) || this.steering.isDown('gas'), brake: down(this.driveKeys.down) || this.steering.isDown('brake'), nitro };
  }

  // ---------------------------------------------------------------- the screens

  private squadSim(): void {
    // a still scene by the convoy: the survivor, the squadmate and the dog under the lamps
    const def = MISSIONS[Math.min(MISSIONS.length, this.meta.unlocked) - 1];
    const run = this.newRun('campaign');
    const sim = new Mission(def, run, 7);
    sim.unlocked = this.meta.heroes;
    sim.zombies = [];
    sim.chests = [];
    sim.items = [];
    sim.survivors = [];
    sim.walls = [];
    const c = sim.convoy;
    sim.hero.x = c.x - 5; sim.hero.z = c.z - 0.6; sim.hero.face = -Math.PI / 2 - 0.3;
    if (sim.buddy) { sim.buddy.x = c.x - 3.6; sim.buddy.z = c.z + 1.5; sim.buddy.face = -Math.PI / 2 + 0.3; }
    sim.dog.x = c.x - 6.6; sim.dog.z = c.z - 2.5; sim.dog.face = -Math.PI / 2 - 0.7;
    this.sim = sim;
    this.mission = null;
    this.view.setMode('foot');
    this.view.setHero(this.meta.hero);
    this.view.setDog(this.meta.dog);
    this.view.buildTown(sim.plan, { id: this.convoyId(def), ...sim.convoy });
    this.view.freeCam = null;
    this.view.shotCam = [[-8.5, 2.9, -1.6], [0, 1.1, 2.7]];
  }

  private openSquad(): void {
    this.leaveDrive();
    this.phase = 'squad';
    this.showPlayUi('none');
    this.squadSim();
    this.panel = new SquadScreen(this, this.host, this.meta, (h) => {
      this.meta.hero = h; saveMeta(this.meta);
      this.view.setHero(h);
      const sim = this.sim!;
      sim.run.hero = h; (sim.hero as { id: HeroId }).id = h;
      const b = this.meta.heroes.find((x) => x !== h) ?? null;
      sim.run.buddy = b;
      if (sim.buddy && b) sim.buddy.id = b; else if (sim.buddy && !b) sim.buddy = null;
      this.view.hero.play('Wave', { once: true, restart: true, then: 'Idle' });
    }, (d) => {
      this.meta.dog = d; saveMeta(this.meta);
      this.view.setDog(d);
    }, () => {
      this.panel = null;
      this.run = this.newRun('campaign');
      this.openMap();
    }, () => {
      this.panel = null;
      this.run = this.newRun('stand');
      this.openStandBrief();
    });
  }

  private openMap(): void {
    this.leaveDrive();
    this.phase = 'map';
    this.showPlayUi('none');
    this.view.shotCam = null;
    this.mission = null;
    this.mapSel = Math.max(0, Math.min(this.mapSel, this.meta.unlocked - 1, MISSIONS.length - 1));
    this.buildDistrictFor(this.mapSel);
    this.panel = new MapScreen(this, this.host, this.meta, this.mapSel, (i) => { this.mapSel = i; this.buildDistrictFor(i); }, (i) => {
      this.panel = null;
      this.mapSel = i;
      this.openBrief(i);
    }, {
      garage: () => this.openGarage(),
      cards: () => { this.phase = 'cards'; this.panel = new CardsScreen(this, this.host, this.run.cards, () => { this.panel = null; this.openMap(); }); },
      combos: () => { this.phase = 'combos'; this.panel = new CombosScreen(this, this.host, this.run.hero, () => { this.panel = null; this.openMap(); }); },
      back: () => { this.panel = null; this.openSquad(); },
    });
  }

  /** The map's backdrop: the district of the chosen mission from the air. */
  private buildDistrictFor(i: number): void {
    const def = MISSIONS[i];
    if (this.sim && this.sim.plan.district === def.district && this.phase !== 'squad' && !this.mission) return;
    const sim = new Mission(def, this.newRun('campaign'), 3);
    sim.unlocked = this.meta.heroes;
    this.sim = sim;
    this.view.buildTown(sim.plan, { id: this.convoyId(def), ...sim.convoy });
  }

  private convoyId(def: MissionDef | null): string {
    const v = def ? def.vehicle : 'truck';
    return this.meta.ranks.convoy >= 2 ? v + '-armored' : v;
  }

  private openBrief(i: number): void {
    this.leaveDrive();
    this.phase = 'brief';
    const def = MISSIONS[i];
    this.mission = def;
    const sim = new Mission(def, this.run, (this.rnd() * 1e9) | 0);
    sim.unlocked = this.meta.heroes;
    this.sim = sim;
    this.drive = null;
    this.bot?.setSim(sim);
    this.view.setMode('foot');
    this.view.freeCam = null;
    this.view.shotCam = null;
    this.view.decals.clear();
    this.view.buildTown(sim.plan, { id: this.convoyId(def), ...sim.convoy });
    this.panel = new BriefScreen(this, this.host, def, this.meta.stars[i], () => { this.panel = null; this.startMission(); }, () => { this.panel = null; this.openMap(); });
  }

  private openStandBrief(): void {
    this.leaveDrive();
    this.phase = 'brief';
    this.mission = null;
    const sim = new Mission(null, this.run, (this.rnd() * 1e9) | 0);
    this.sim = sim;
    this.view.setMode('foot');
    this.view.freeCam = null;
    this.view.shotCam = null;
    this.view.decals.clear();
    this.view.buildTown(sim.plan, { id: this.convoyId(null), ...sim.convoy });
    this.panel = new BriefScreen(this, this.host, null, 0, () => { this.panel = null; this.startMission(); }, () => { this.panel = null; this.openSquad(); });
  }

  private startMission(): void {
    const s = this.sim!;
    this.phase = 'play';
    this.revived = false;
    this.hpShown = -1;
    this.atkLatch = true;
    this.toastImg?.destroy();
    this.toastImg = null;
    this.showPlayUi('foot');
    this.sfx('start', { volume: 0.5 });
    if (s.run.kind === 'stand') { this.banner(t('standTitle')); this.later(2000, () => this.toast(t('gunNoise'), 3)); return; }
    this.banner(t('m_' + s.def!.n));
    if (s.def!.n === 1 && !this.meta.tutorial && !this.bot) this.startTutorial();
    else this.later(2200, () => this.stageToast());
  }

  private later(ms: number, fn: () => void): void { this.time.delayedCall(ms, () => { if (this.phase === 'play' && !this.isOver) fn(); }); }

  private stageToast(): void {
    const st = this.sim?.stageDef;
    if (!st) return;
    this.toast(t({ collect: 'stageCollect', rescue: 'stageRescue', clear: 'stageClear', hold: 'stageHold', boss: 'stageBoss', return: 'stageReturn' }[st.kind]), 3);
  }

  // ---------------------------------------------------------------- the tutorial (mission 1, first time)

  private static TUT = ['move', 'attack', 'hold', 'dodge', 'use', 'dog', 'swap'];

  private startTutorial(): void {
    const s = this.sim!;
    // a chest close by, a few shamblers to practise on
    const c = s.convoy;
    s.chests.push({ id: 9001, x: c.x - 10, z: c.z - 7, special: false, opened: false, item: null, rot: 0.4 });
    s.zombies = s.zombies.filter((z) => Math.hypot(z.x - c.x, z.z - c.z) > 22);
    for (let i = 0; i < 3; i++) { const z = s.spawn('basic', c.x - 4 + i * 3, c.z - 15, 'idle'); z.walk *= 0.5; }
    const skip = new KitSkip(this, () => this.endTutorial());
    this.tut = { step: 0, t: 0, skip };
    this.tutToast();
  }

  private tutToast(): void {
    if (!this.tut) return;
    const k = PlayScene.TUT[this.tut.step];
    this.toast(t('tut_' + k + (this.touch ? '' : 'Key')), 60);
  }

  private updateTutorial(dt: number): void {
    const tu = this.tut, s = this.sim;
    if (!tu || !s) return;
    tu.t += dt;
    const h = s.hero, c = s.convoy;
    const done = [
      () => Math.hypot(h.x - (c.x - 4), h.z - (c.z - 3.5)) > 3,
      () => s.used.has('fa') || tu.t > 25,
      () => s.used.has('fb') || tu.t > 25,
      () => s.used.has('fc') || (s.used.has('dodge') && tu.t > 12) || tu.t > 25,
      () => s.stats.chests > 0 || tu.t > 30,
      () => s.used.has('dog') || tu.t > 20,
      () => h.swapT > 0 || tu.t > 15,
    ][tu.step]();
    if (done) {
      tu.step++;
      tu.t = 0;
      this.sfx('pick', { volume: 0.5 });
      if (tu.step >= PlayScene.TUT.length) { this.endTutorial(); return; }
      this.tutToast();
    }
  }

  private endTutorial(): void {
    if (!this.tut) return;
    this.tut.skip?.destroy();
    this.tut = null;
    this.meta.tutorial = true;
    saveMeta(this.meta);
    this.toast(t('tut_done'), 3);
  }

  // ---------------------------------------------------------------- the drive

  private startDrive(): void {
    const s = this.sim!, def = this.mission!;
    this.phase = 'drive';
    this.endTutorial();
    this.view.setMode('drive');
    this.driveView.root.visible = true;
    this.drive = new Drive(def, this.run.mode, def.vehicle, s.m, (this.rnd() * 1e9) | 0);
    const id = this.convoyId(def);
    this.driveView.start(this.drive, id, this.meta.ranks.convoy >= 2 ? 'sports-armored' : 'sports');
    this.view.decals.clear();
    this.showPlayUi('drive');
    this.steering.begin();
    this.steering.pad?.setCount('nitro', this.drive.nitro);
    this.sfx('engineStart', { volume: 0.5 });
    if (!this.engine && this.cache.audio.exists('engine')) this.engine = this.sound.add('engine', { loop: true, volume: 0 });
    this.engine?.play();
    if (!this.meta.driveTaught) { this.toast(t(this.touch ? 'drive_tut' : 'drive_tutKey'), 4); this.meta.driveTaught = true; saveMeta(this.meta); }
  }

  private stopEngine(): void { if (this.engine?.isPlaying) this.engine.stop(); }

  /** Back from the drive to the town: the pad and the engine off, the road hidden, the town's fog and lens. */
  private leaveDrive(): void {
    this.steering?.end();
    this.stopEngine();
    if (this.driveView?.root.visible) { this.driveView.root.visible = false; this.driveView.stop(); }
    this.drive = null;
    this.view?.setMode('foot');
  }

  private driveHud(dt: number): void {
    const d = this.drive!;
    this.setScore(this.run.score + d.stats.pts);
    const k = d.armor / d.maxArmor;
    this.drawBar(this.armorBar, 150, k, k < 0.3 ? (Math.floor(this.time.now / 160) % 2 ? 0xff3b3b : 0xff7a5a) : k < 0.6 ? 0xffc23f : 0x4fe07a);
    this.armorChip.setText(String(Math.ceil(k * 100)));
    this.nitroChip.setText('×' + d.nitro);
    this.steering.pad?.setCount('nitro', d.nitro);
    this.drawBar(this.roadBar, 200, d.progress, 0xf2b21a, 14);
    this.scrapChip.setText(String(this.meta.scrap + this.run.scrap + d.stats.scrap));
    this.cardChip.setText('×' + this.run.cards.length);
    this.scrapChip.setAnchor(this.cardChip.left - HUD_GAP, HUD_ROW2_Y, 'right');
    this.vignette.setAlpha(k < 0.3 ? 0.3 + Math.sin(this.time.now / 160) * 0.12 : Math.max(0, this.vignette.alpha - dt * 2));
    if (this.engine && 'setRate' in this.engine) {
      const e = this.engine as Phaser.Sound.WebAudioSound;
      e.setRate(0.7 + Math.min(1.4, Math.abs(d.v) / 18) * 0.8 + (d.nitroT > 0 ? 0.25 : 0));
      e.setVolume(d.phase === 'play' || d.phase === 'count' ? 0.28 : Math.max(0, e.volume - dt));
    }
  }

  private driveWon(): void {
    const s = this.sim!, d = this.drive!, def = this.mission!;
    this.phase = 'summary';
    this.stopEngine();
    this.steering.end();
    this.sfx('fanfare', { volume: 0.6 });
    this.banner(t('driveSign'), S_BIG);
    this.time.delayedCall(1800, () => {
      if (this.isOver) return;
      const armor = d.armor / d.maxArmor;
      const stars = [true, s.sideGoal(), armor >= 0.6];
      const nStars = stars.filter(Boolean).length;
      this.run.score += d.stats.pts + d.bonus() + 400 * def.n + nStars * 250;
      const i = def.n - 1;
      const scrap = this.run.scrap + d.stats.scrap + Math.round(scrapFor(def.n, nStars) * s.m.scrap);
      const supplies = this.run.supplies + suppliesFor(def.n, def.stages.some((st) => st.kind === 'boss')) + (stars[1] ? 1 : 0);
      this.meta.scrap += scrap;
      this.meta.supplies += supplies;
      this.run.scrap = 0; this.run.supplies = 0;
      this.meta.stars[i] = Math.max(this.meta.stars[i], nStars);
      // the story: a survivor freed in this mission joins; the pug after the docks
      let join: HeroId | undefined;
      if (RESCUE_MISSIONS.includes(def.n)) { const who = s.survivors.find((v) => v.who !== 'civ')?.who as HeroId | undefined; if (who && !this.meta.heroes.includes(who)) { this.meta.heroes.push(who); join = who; } }
      const pug = def.n === 6 && !this.meta.pug;
      if (pug) this.meta.pug = true;
      if (def.n >= this.meta.unlocked) this.meta.unlocked = Math.min(MISSIONS.length + 1, def.n + 1);
      saveMeta(this.meta);
      this.run.depth++;
      if (join && !this.run.buddy) this.run.buddy = join;
      this.showPlayUi('none');
      this.mapSel = Math.min(MISSIONS.length - 1, def.n < MISSIONS.length ? def.n : i);
      this.panel = new SummaryScreen(this, this.host, { n: def.n, stars, kills: s.stats.kills, time: s.time, runover: d.stats.runover, armor, scrap, supplies, score: this.run.score, join, pug }, () => {
        this.panel = null;
        if (def.n === MISSIONS.length) { this.phase = 'end'; this.endGame({ win: true, title: t('winCampaign'), delay: 200 }); return; }
        this.openDraft(() => this.openMap());
      });
    });
  }

  // ---------------------------------------------------------------- drafts, garage

  private openDraft(then: () => void): void {
    const prev = this.phase;
    this.phase = 'draft';
    this.sfx('levelup', { volume: 0.5 });
    const deal = () => rollCards(this.run.cards, this.run.hero, this.rnd);
    const offer = deal();
    if (!offer.length) { this.phase = prev; then(); return; }
    this.panel = new DraftScreen(this, this.host, this.run.cards, offer, deal, (id) => {
      this.panel = null;
      this.takeCard(id);
      then();
    });
  }

  private takeCard(id: CardId): void {
    this.run.cards.push(id);
    this.sim?.refreshMods();
    this.tweens.add({ targets: this.cardChip, scale: 1.25, duration: 140, yoyo: true });
    void CARD;
  }

  private openGarage(): void {
    this.phase = 'garage';
    this.panel = new GarageScreen(this, this.host, this.meta, () => { this.run.ranks = this.meta.ranks; }, () => { this.panel = null; this.openMap(); });
  }

  /** A rewarded continue: the survivor back up (or the convoy patched) and the mission goes on. */
  revive(): void {
    this.revived = true;
    if (this.phase !== 'end') return;
    if (this.lostIn === 'drive' && this.drive) {
      this.drive.revive();
      this.phase = 'drive';
      this.showPlayUi('drive');
      this.steering.begin();
      this.engine?.play();
    } else if (this.sim) {
      this.sim.revive();
      this.phase = 'play';
      this.showPlayUi('foot');
    }
    this.lostIn = null;
  }

  /** Once per run. In play every loss sets `lostIn`; a loss ended from outside (the platform
   *  harness, from the map) has nothing to revive, so `revive()` then just hands the run back. */
  canContinue(): boolean { return !this.revived; }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.perf.frames++;
    if (this.perf.frames === 1) this.showPlayUi(this.phase === 'play' ? 'foot' : this.phase === 'drive' ? 'drive' : 'none');
    this.steering.update(dt);
    const s = this.sim;
    if (this.phase !== 'play') this.atkLatch = true;
    if (this.phase === 'drive' || (this.phase === 'summary' && this.drive)) this.updateDrive(dt);
    else if (s) {
      if (this.phase === 'play' || (this.phase === 'end' && this.lostIn === 'foot')) {
        this.acc += dt * this.testSpeed;
        let n = 0;
        while (this.acc >= DT && n < 4) {
          this.acc -= DT;
          n++;
          const inp = this.phase === 'play' ? (this.bot ? this.bot.input(DT) : this.readInput()) : NO_INPUT;
          s.step(DT, inp);
          this.handleEvents();
          if (this.phase !== 'play' && this.phase !== 'end') break;
          if (s.run.kind === 'stand' && s.wave.pendingDraft && this.phase === 'play') {
            s.wave.pendingDraft = false;
            if (this.bot) { const offer = rollCards(this.run.cards, this.run.hero, this.rnd); if (offer.length) this.takeCard(offer[botPick(offer, this.run.hero)]); }
            else { this.showPlayUi('none'); this.openDraft(() => { this.phase = 'play'; this.showPlayUi('foot'); this.atkLatch = true; }); }
            break;
          }
        }
        if (n >= 4) this.acc = 0;
      }
      const frozen = this.phase === 'brief' || this.phase === 'draft' || this.phase === 'garage' || this.phase === 'cards' || this.phase === 'combos';
      if (this.phase === 'map') {
        const a = this.time.now / 9000, R = 70;
        this.view.freeCam = [[Math.cos(a) * R * 0.5, 62, 40 + Math.sin(a) * R * 0.3], [0, 0, 0]];
      }
      if (this.view.mode !== 'drive') this.view.sync(s, frozen ? 0 : dt * this.testSpeed);
      if (this.phase === 'squad') this.view.sync(s, 0);
      if (this.phase === 'play') { this.refreshHud(dt); this.syncMarkers(); this.updateTutorial(dt); this.ambience(dt); }
    }
    if (this.hordeDir) this.hordeDir.t -= dt;
  }

  private updateDrive(dt: number): void {
    const d = this.drive;
    if (!d) return;
    this.acc += dt * this.testSpeed;
    let n = 0;
    while (this.acc >= DT && n < 4) {
      this.acc -= DT;
      n++;
      const inp = this.phase === 'drive' ? (this.bot || this.autoDrive ? driveBot(d, SKILL.good, this.rnd) : this.readDrive(DT)) : NO_DRIVE;
      if (this.phase === 'drive' && d.phase === 'count' && d.count <= DT && d.count > 0) { this.steering.centre(); this.banner(t('driveGo'), S_BIG); this.sfx('go', { volume: 0.6 }); }
      d.step(DT, inp);
      for (const e of d.events) { this.driveView.handle(e, d); this.reactDrive(e); }
      d.events.length = 0;
      if (this.phase !== 'drive') break;
    }
    if (n >= 4) this.acc = 0;
    this.driveView.sync(d, dt * this.testSpeed);
    if (this.phase === 'drive') this.driveHud(dt);
  }

  private ambience(dt: number): void {
    const s = this.sim!;
    // groans from the zombies near, more of them as night falls
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 2.2 + Math.random() * 3 - s.night * 1.2;
      let near = null as null | { x: number; z: number };
      for (const z of s.zombies) if (z.state !== 'dead' && z.state !== 'lurk' && Math.hypot(z.x - s.hero.x, z.z - s.hero.z) < 16) { near = z; break; }
      if (near) this.sfxAt('groan' + (1 + Math.floor(Math.random() * 3)), this.view.screen(near.x, 1, near.z).x, { volume: 0.22 });
    }
    // low health
    this.lowT -= dt;
    if (s.hero.alive && s.hero.hp < s.hero.max * 0.3 && this.lowT <= 0) { this.lowT = 1.1; this.sfx('heartbeat', { volume: 0.4 }); }
    // the combo hints, once each, in a fight
    if (!this.bot && !this.tut && s.time > 20) for (const k of ['fa', 'fb', 'fc']) {
      if (this.hinted.has(k) || s.used.has(k)) continue;
      if (s.hero.lastBlow > s.time - 1 && Math.random() < dt * 0.2) { this.hinted.add(k); this.meta.hints = [...this.hinted]; saveMeta(this.meta); this.toast(t('hint_' + k), 3); break; }
    }
  }

  private handleEvents(): void {
    const s = this.sim!;
    this.lastEvents.clear();
    for (const ev of s.events) { this.view.handle(ev, s); this.react(ev); }
    s.events.length = 0;
  }

  private once(k: string): boolean { if (this.lastEvents.has(k)) return false; this.lastEvents.add(k); return true; }

  /** Sounds, numbers, shakes and banners for a mission event. */
  private react(ev: SimEvent): void {
    const s = this.sim!, v = this.view;
    const sx = (x: number, z: number) => v.screen(x, 1, z).x;
    switch (ev.type) {
      case 'shot': if (this.once('shot' + ev.who)) this.sfx('shot_' + ev.gun, { volume: ev.who === 'hero' ? (ev.big ? 0.6 : 0.42) : 0.18 }); if (ev.who === 'hero' && (ev.gun === 'shotgun' || ev.big)) this.cameras.main.shake(90, ev.big ? 0.006 : 0.0035); break;
      case 'swing': this.sfx(ev.step === 'fb' ? 'swingHeavy' : 'swing', { volume: 0.4 }); break;
      case 'hit': if (ev.id >= 0 && (ev.big || ev.crit || Math.random() < 0.5)) this.dmgNum(ev.x, ev.z, ev.dmg, ev.crit ? S_CRIT : S_DMG); if (this.once('hit')) this.sfxAt(ev.big ? 'hitBig' : 'hit', sx(ev.x, ev.z), { volume: ev.big ? 0.45 : 0.28 }); break;
      case 'kill': {
        if (this.once('kill')) this.sfxAt(ev.boss ? 'bossDie' : ev.kind === 'chubby' ? 'splatBig' : 'splat', sx(ev.x, ev.z), { volume: ev.boss ? 0.7 : 0.4 });
        if (ev.boss) { this.cameras.main.flash(260, 255, 240, 200); this.cameras.main.shake(500, 0.012); this.sfx('roar', { volume: 0.6 }); }
        break;
      }
      case 'finisher': {
        this.sfx(ev.kind === 'fb' ? 'finisherB' : 'finisherA', { volume: 0.55 });
        this.cameras.main.shake(ev.kind === 'fb' ? 180 : 110, ev.kind === 'fb' ? 0.01 : 0.006);
        const p = v.screen(ev.x, 2, ev.z);
        const img = labelAt(this, p.x, p.y, t('cmb_' + ev.name), S_FIN).setDepth(9040).setScale(0.5);
        this.tweens.add({ targets: img, scale: 0.9, duration: 120, ease: 'Back.easeOut' });
        this.tweens.add({ targets: img, alpha: 0, y: p.y - 40, delay: 450, duration: 300, onComplete: () => img.destroy() });
        break;
      }
      case 'hurt': {
        if (ev.who === 'hero') {
          this.sfx('hurt', { volume: 0.5 });
          this.cameras.main.flash(110, 255, 50, 30, false);
          this.cameras.main.shake(120, 0.005);
          this.dmgNum(s.hero.x, s.hero.z, ev.dmg, S_HURT, v.screen(s.hero.x, 2.4, s.hero.z));
          this.vignette.setAlpha(0.6);
        } else if (ev.who === 'truck') { if (this.once('truck')) this.sfx('metal', { volume: 0.3 }); }
        else if (this.once('hurt' + ev.who)) this.sfx('hurtSoft', { volume: 0.25 });
        break;
      }
      case 'grab': this.sfx('grab', { volume: 0.5 }); this.toast(t('grabbed'), 1.6); break;
      case 'free': this.sfx('punch', { volume: 0.5 }); break;
      case 'pull': this.toast(t('pulled'), 1); break;
      case 'dodge': this.sfx('roll', { volume: 0.4 }); break;
      case 'reload': this.sfx('reload', { volume: 0.5 }); break;
      case 'reloaded': this.sfx('reloaded', { volume: 0.4 }); break;
      case 'swap': this.sfx('swap', { volume: 0.4 }); break;
      case 'empty': this.sfx('empty', { volume: 0.5 }); this.toast(t('empty'), 2); break;
      case 'ability': {
        const k = ev.kind;
        this.sfx('ab_' + k, { volume: 0.6 });
        if (k === 'warcry') this.cameras.main.shake(200, 0.008);
        break;
      }
      case 'abilityReady': this.sfx('ready', { volume: 0.4 }); break;
      case 'bark': if (this.once('bark')) this.sfxAt(this.run.dog === 'pug' ? 'barkS' : 'bark', sx(ev.x, ev.z), { volume: 0.5 }); break;
      case 'reveal': this.toast(t('bark'), 1.6); break;
      case 'rise': this.sfxAt('groan3', sx(ev.x, ev.z), { volume: 0.35 }); break;
      case 'sniff': this.sfx(this.run.dog === 'pug' ? 'barkS' : 'bark', { volume: 0.4 }); this.toast(t('sniff'), 2); break;
      case 'sic': this.sfx(this.run.dog === 'pug' ? 'barkS' : 'bark', { volume: 0.5 }); break;
      case 'found': this.sfx('found', { volume: 0.5 }); this.toastAt(t('found'), ev.x, ev.z); break;
      case 'bite': if (this.once('bite')) this.sfx('bite', { volume: 0.35 }); break;
      case 'dogDown': this.sfx('whimper', { volume: 0.5 }); this.toast(t('dogDown'), 2); break;
      case 'pickup': {
        const x = sx(ev.x, ev.z);
        if (ev.kind === 'scrap') { if (this.once('scrap')) this.sfxAt('coin', x, { volume: 0.3 }); }
        else if (ev.kind === 'ammo') { this.sfxAt('ammo', x, { volume: 0.5 }); this.fmtToastAt('ammoN', { n: ev.v }, ev.x, ev.z); }
        else { this.sfxAt('heal', x, { volume: 0.5 }); this.toastAt(t('medkit'), ev.x, ev.z); }
        break;
      }
      case 'chest': this.sfx('chest', { volume: 0.6 }); this.fmtToastAt('chestScrap', { n: ev.scrap }, ev.x, ev.z); if (ev.special) this.time.delayedCall(500, () => this.fmtToastAt('supplyN', { n: 1 }, ev.x, ev.z)); break;
      case 'item': this.sfx('item', { volume: 0.6 }); this.fmtToastAt('itemN', { item: t('it_' + ev.kind), n: ev.got, m: ev.of }, s.hero.x, s.hero.z); this.tweens.add({ targets: this.hud.centerChip, scale: 1.2, duration: 140, yoyo: true }); break;
      case 'freed': this.sfx('freed', { volume: 0.6 }); this.toastAt(t('freed'), ev.x, ev.z); break;
      case 'help': if (this.once('help')) this.toastAt(t('help'), ev.x, ev.z); break;
      case 'safe': this.sfx('item', { volume: 0.4 }); this.toastAt(t('safe'), s.convoy.x, s.convoy.z); break;
      case 'stage': if (ev.i > 0) { this.sfx('stage', { volume: 0.5 }); this.later(400, () => this.stageToast()); } break;
      case 'holdStart': this.sfx('alarm', { volume: 0.45 }); this.toast(t('holdStart'), 2); break;
      case 'holdDone': this.sfx('fanfareS', { volume: 0.5 }); this.toast(t('holdDone'), 1.6); break;
      case 'horde': {
        this.sfx('alarm', { volume: 0.5 });
        this.sfx('roar', { volume: 0.35 });
        this.banner(t('horde'), S_RED);
        this.cameras.main.shake(300, 0.005);
        const wz = s.zombies.filter((z) => z.wave && z.state !== 'dead');
        if (wz.length) this.hordeDir = { x: wz.reduce((a, z) => a + z.x, 0) / wz.length, z: wz.reduce((a, z) => a + z.z, 0) / wz.length, t: 5 };
        this.later(1300, () => this.fmtToast('hordeN', { n: ev.n }));
        if (!this.hinted.has('noise')) { this.hinted.add('noise'); this.later(3500, () => this.toast(t('gunNoise'), 3)); }
        break;
      }
      case 'night': this.toast(t('night'), 3); this.sfx('roar', { volume: 0.25 }); break;
      case 'boss': this.sfx('bossIn', { volume: 0.6 }); this.sfx('roar', { volume: 0.6 }); this.banner(t('bossIn'), S_RED); this.cameras.main.shake(500, 0.01); break;
      case 'tell': if (ev.move === 'roar') this.sfx('roar', { volume: 0.55 }); else this.sfx('tell', { volume: 0.4 }); break;
      case 'slam': this.sfx('slam', { volume: 0.6 }); this.cameras.main.shake(260, 0.012); break;
      case 'roar': this.cameras.main.shake(400, 0.008); break;
      case 'armor': this.later(600, () => this.toast(t('armor'), 2.6)); this.sfx('shield', { volume: 0.5 }); break;
      case 'armorBreak': this.sfx('break', { volume: 0.7 }); this.banner(t('armorBreak')); this.cameras.main.shake(260, 0.012); break;
      case 'burst': this.sfxAt('burst', sx(ev.x, ev.z), { volume: 0.55 }); this.cameras.main.shake(160, 0.006); break;
      case 'blast': this.sfx('blast', { volume: 0.5 }); break;
      case 'wallHit': if (this.once('wall')) this.sfx('wood', { volume: 0.35 }); break;
      case 'wallDown': this.sfx(ev.gate ? 'gate' : 'wood', { volume: 0.6 }); if (ev.gate) this.cameras.main.shake(300, 0.01); break;
      case 'locked': this.toast(t('locked2'), 2); break;
      case 'wave': this.sfx('alarm', { volume: 0.5 }); this.fmtBanner(ev.boss ? 'waveBoss' : 'wave', { n: ev.n }); break;
      case 'waveClear': this.sfx('fanfareS', { volume: 0.5 }); this.toast(t('waveClear'), 2); this.later(2600, () => this.toast(t('nextWave'), 2)); break;
      case 'buddyDown': this.toast(t('buddyDown'), 2); this.sfx('hurtSoft', { volume: 0.4 }); break;
      case 'buddyUp': this.toast(t('buddyUp'), 1.4); break;
      case 'revive': this.sfx('revive', { volume: 0.6 }); this.toast(t('revived'), 1.6); break;
      case 'groan': this.sfxAt('groan' + (1 + Math.floor(Math.random() * 3)), sx(ev.x, ev.z), { volume: 0.25 }); break;
      case 'tellZ': if (this.once('tellZ')) this.sfx('tellSmall', { volume: 0.25 }); break;
      case 'win': {
        // everyone aboard: a beat, then the escape drive (the phase is 'summary' meanwhile, so no input lands)
        this.sfx('board', { volume: 0.6 });
        this.time.delayedCall(300, () => { if (this.phase === 'summary' && this.sim === s && !this.drive && !this.isOver) this.startDrive(); });
        this.phase = 'summary';
        this.showPlayUi('none');
        break;
      }
      case 'lose': {
        this.phase = 'end';
        this.lostIn = 'foot';
        this.sfx('lose', { volume: 0.6 });
        this.endTutorial();
        this.showPlayUi('none');
        const title = s.run.kind === 'stand' ? 'standOver' : ev.why === 'surv' ? 'loseSurv' : ev.why === 'truck' ? 'loseTruck' : 'loseHero';
        if (s.run.kind === 'stand') { this.meta.bestWave = Math.max(this.meta.bestWave, s.wave.n); this.meta.scrap += this.run.scrap; this.meta.supplies += this.run.supplies; this.run.scrap = 0; this.run.supplies = 0; saveMeta(this.meta); }
        this.setScore(this.run.score);
        this.endGame({ title: t(title), delay: 1600 });
        break;
      }
    }
  }

  private reactDrive(ev: DriveEvent): void {
    const d = this.drive!;
    switch (ev.type) {
      case 'runover': if (this.once('run')) this.sfx(ev.kind === 'chubby' ? 'splatBig' : 'splat', { volume: 0.5 }); this.dmgNum(ev.x, ev.z, ev.pts, S_DMG, this.view.screen(ev.x, 1.5, ev.z)); if (ev.kind === 'chubby') this.cameras.main.shake(160, 0.008); break;
      case 'crash': this.sfx(ev.hard ? 'crash' : 'metal', { volume: ev.hard ? 0.7 : 0.4 }); if (ev.hard) { this.cameras.main.shake(260, 0.014); this.banner(t('crash'), S_RED); } break;
      case 'scrape': if (this.once('scrape')) this.sfx('scrape', { volume: 0.3 }); break;
      case 'ram': this.sfx('wood', { volume: 0.6 }); this.cameras.main.shake(140, 0.008); break;
      case 'pick': this.sfx(ev.kind === 'nitro' ? 'ready' : ev.kind === 'repair' ? 'heal' : 'coin', { volume: 0.5 }); this.toastAt(t(ev.kind === 'nitro' ? 'nitroUp' : ev.kind === 'repair' ? 'repaired' : 'scrapUp'), d.x, d.z); break;
      case 'nitro': this.sfx('nitro', { volume: 0.6 }); this.banner(t('nitroGo')); this.cameras.main.shake(200, 0.004); break;
      case 'zone': this.toast(t('zone_' + ev.zone), 1.8); break;
      case 'sign': break;
      case 'win': this.driveWon(); break;
      case 'lose': {
        this.phase = 'end';
        this.lostIn = 'drive';
        this.stopEngine();
        this.steering.end();
        this.sfx('explode', { volume: 0.7 });
        this.cameras.main.shake(500, 0.015);
        this.showPlayUi('none');
        this.setScore(this.run.score + d.stats.pts);
        this.endGame({ title: t('loseDrive'), delay: 1500 });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- feedback

  private banner(s: string, style: LabelStyle = S_BANNER): void {
    if (this.quiet) return;
    const { width } = this.scale;
    const img = labelAt(this, width / 2, 210, s, style).setDepth(9100).setScrollFactor(0);
    fitWidth(img, width - 300);
    const sc = img.scale;
    img.setScale(sc * 0.3).setAlpha(0);
    this.tweens.add({ targets: img, scale: sc, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: 180, delay: 1150, duration: 360, onComplete: () => img.destroy() });
  }

  private fmtBanner(key: string, vals: Record<string, number>): void {
    if (this.quiet) return;
    const line = new FmtLine(this, this.scale.width / 2, 210, S_BANNER).set(key, vals).setDepth(9100).setScrollFactor(0);
    line.setScale(0.3).setAlpha(0);
    this.add.existing(line);
    this.tweens.add({ targets: line, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line, alpha: 0, y: 180, delay: 1150, duration: 360, onComplete: () => line.destroy() });
  }

  /** A line over the bottom middle (hints, warnings). */
  /** The bottom line's middle and width: left of the action buttons on foot, between the steering and the pedals on the drive. */
  private toastSpot(): { x: number; w: number } {
    const W = this.scale.width;
    return this.phase === 'drive' && this.touch ? { x: 655, w: 520 } : { x: W / 2 - 110, w: W - 560 };
  }

  private toast(s: string, hold = 1.2): void {
    if (this.quiet) return;
    this.toastImg?.destroy();
    const at = this.toastSpot();
    const img = labelAt(this, at.x, this.scale.height - 54, s, S_TOAST).setDepth(9050);
    fitWidth(img, at.w);
    this.toastImg = img;
    const sc = img.scale;
    img.setScale(sc * 0.6);
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: hold * 1000, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  private fmtToast(key: string, vals: Record<string, number | string>): void {
    if (this.quiet) return;
    const line = new FmtLine(this, this.toastSpot().x, this.scale.height - 54, S_TOAST).set(key, vals).setDepth(9050);
    this.add.existing(line);
    this.tweens.add({ targets: line, alpha: 0, delay: 1800, duration: 300, onComplete: () => line.destroy() });
  }

  private toastAt(s: string, x: number, z: number): void {
    if (this.quiet) return;
    const p = this.view.screen(x, 2.6, z);
    const img = labelAt(this, p.x, p.y, s, S_TOAST).setDepth(9040);
    fitWidth(img, 360, 0.8);
    const sc = img.scale;
    img.setScale(sc * 0.5);
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: p.y - 44, delay: 800, duration: 350, onComplete: () => img.destroy() });
  }

  private fmtToastAt(key: string, vals: Record<string, number | string>, x: number, z: number): void {
    if (this.quiet) return;
    const p = this.view.screen(x, 2.6, z);
    const line = new FmtLine(this, p.x, p.y, S_TOAST).set(key, vals).setDepth(9040);
    this.add.existing(line);
    line.setScale(0.5);
    this.tweens.add({ targets: line, scale: 0.85, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line, alpha: 0, y: p.y - 44, delay: 800, duration: 350, onComplete: () => line.destroy() });
  }

  /** A small damage number popping off a point (pooled glyph lines: no new textures). */
  private dmgNum(x: number, z: number, n: number, style: LabelStyle, at?: { x: number; y: number }): void {
    if (this.dmgPool.length > 22) { const old = this.dmgPool.shift()!; this.tweens.killTweensOf(old); old.destroy(); }
    const p = at ?? this.view.screen(x + (Math.random() - 0.5) * 0.8, 2.1, z);
    const g = new GlyphText(this, p.x, p.y, String(n), style, 0.5).setDepth(9030);
    this.add.existing(g);
    this.dmgPool.push(g);
    g.setScale(style === S_CRIT ? 0.55 : 0.4);
    this.tweens.add({ targets: g, scale: style === S_CRIT ? 0.95 : 0.7, duration: 110, ease: 'Back.easeOut' });
    this.tweens.add({ targets: g, y: p.y - 38, alpha: 0, delay: 240, duration: 420, onComplete: () => { const i = this.dmgPool.indexOf(g); if (i >= 0) this.dmgPool.splice(i, 1); g.destroy(); } });
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__lcIcons = () => renderIconSheet(this.world.renderer);
    w.__lc = {
      state: () => ({
        phase: this.phase, mission: this.mission?.n ?? 0, time: this.sim?.time ?? 0, hp: this.sim?.hero.hp ?? 0, score: this.run.score, cards: this.run.cards,
        zombies: this.sim?.alive ?? 0, simPhase: this.sim?.phase, drive: this.drive ? { phase: this.drive.phase, ci: this.drive.ci, of: this.drive.cells.length, armor: this.drive.armor } : null,
        unlocked: this.meta.unlocked, scrap: this.meta.scrap, textures: this.textures.getTextureKeys().length, wave: this.sim?.wave.n ?? 0,
      }),
      auto: (on = true) => { this.bot = on && this.sim ? new Bot(this.sim, SKILL.good, this.rnd) : null; this.autoDrive = on; },
      skip: (o: { mission?: number; hero?: HeroId; cards?: CardId[] } = {}) => this.skipTo(o),
      stand: () => { this.closePanel(); this.run = this.newRun('stand'); this.openStandBrief(); this.closePanel(); this.startMission(); },
      drive: (n?: number) => { if (n) this.skipTo({ mission: n }); this.startDrive(); },
      fast: (sec: number) => this.fastForward(sec),
      open: (which: string) => this.openForShot(which),
      stage: (name = 'busy') => this.stage(name),
      key: (code: string) => this.panel?.key(code),
      cam: (pos?: number[], look?: number[]) => { this.view.shotCam = pos && look ? [pos, look] : null; },
      meta: (m: Partial<Meta>) => { Object.assign(this.meta, m); saveMeta(this.meta); },
      play: this,
    };
  }

  private closePanel(): void { this.panel?.close(); this.panel = null; }

  /** The steering check: the car on a long straight north, at speed v, nothing in the way. */
  testPlace(v = 8): void {
    const d = this.drive;
    if (!d) return;
    let k = 3;
    for (; k < d.cells.length - 4; k++) {
      const ok = [0, 1, 2].every((q) => { const c = d.cells[k + q]; return c.in[1] === -1 && c.out[1] === -1; });
      if (ok) break;
    }
    const c = d.cells[k];
    d.x = c.x; d.z = c.z + 4; d.h = Math.PI; d.v = v; d.ci = k; d.count = 0; d.phase = 'play'; d.armor = d.maxArmor;
    d.zombies = [];
    d.obstacles = d.obstacles.filter((o) => Math.abs(o.cell - k) > 4);
  }

  skipTo(o: { mission?: number; hero?: HeroId; cards?: CardId[] }): void {
    this.closePanel();
    if (o.hero) { this.meta.hero = o.hero; if (!this.meta.heroes.includes(o.hero)) this.meta.heroes.push(o.hero); this.view.setHero(o.hero); }
    this.run = this.newRun('campaign');
    if (o.cards) this.run.cards = [...o.cards];
    const i = Math.max(0, Math.min(MISSIONS.length - 1, (o.mission ?? 1) - 1));
    this.meta.tutorial = true;
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
    }
    this.view.sync(s, 0.3);
  }

  private openForShot(which: string): void {
    this.closePanel();
    switch (which) {
      case 'squad': this.openSquad(); break;
      case 'map': this.openMap(); break;
      case 'brief': this.openBrief(this.mapSel); break;
      case 'draft': this.phase = 'draft'; this.panel = new DraftScreen(this, this.host, this.run.cards, rollCards(this.run.cards, this.run.hero, this.rnd), () => rollCards(this.run.cards, this.run.hero, this.rnd), (id) => { this.panel = null; this.takeCard(id); }); break;
      case 'summary': this.phase = 'summary'; this.showPlayUi('none'); this.panel = new SummaryScreen(this, this.host, { n: this.mission?.n ?? 2, stars: [true, true, false], kills: 86, time: 164, runover: 23, armor: 0.72, scrap: 148, supplies: 2, score: Math.max(this.run.score, 9840), join: 'lis' }, () => { this.panel = null; }); break;
      case 'garage': this.openGarage(); break;
      case 'cards': this.phase = 'cards'; this.panel = new CardsScreen(this, this.host, this.run.cards, () => { this.panel = null; }); break;
      case 'combos': this.phase = 'combos'; this.panel = new CombosScreen(this, this.host, this.run.hero, () => { this.panel = null; }); break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /** The store art's stage: a fight at the square, the horde thick round the survivor and the dog. */
  private stage(name: string): void {
    this.quiet = true;
    if (name === 'drive') {
      this.skipTo({ mission: 4, hero: 'matt' });
      this.startDrive();
      const d = this.drive!;
      for (let i = 0; i < 60 * 4; i++) { d.step(DT, driveBot(d, SKILL.good, this.rnd)); d.events.length = 0; }
      this.autoDrive = true;
      this.time.removeAllEvents();
      return;
    }
    this.skipTo({ mission: 3, hero: 'lis', cards: ['fury', 'heavy', 'hound'] });
    const s = this.sim!;
    this.bot = new Bot(s, SKILL.good, mulberry(4));
    const a = s.plan.arena;
    s.hero.x = a.x; s.hero.z = a.z + 3;
    s.dog.x = a.x + 2; s.dog.z = a.z + 4;
    for (let i = 0; i < 14; i++) { const ang = (i / 14) * Math.PI * 2; const z = s.spawn(i % 5 === 0 ? 'chubby' : i % 3 === 0 ? 'runner' : 'basic', a.x + Math.cos(ang) * 6, a.z + 3 + Math.sin(ang) * 5, 'hunt'); z.wave = true; }
    this.fastForward(1.2);
    this.view.sync(s, 0.016);
    this.time.removeAllEvents();
    this.testSpeed = 0.35;
  }
}

/** The tutorial's SKIP button (top middle, under the objective chip). */
class KitSkip {
  private b: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, onSkip: () => void) {
    const btn = new (class extends Phaser.GameObjects.Container {})(scene, scene.scale.width - 170, 178);
    const bg = scene.add.image(0, 0, iconKey('card')).setVisible(false);
    void bg;
    const g = scene.add.graphics();
    g.fillStyle(0x1a1814, 0.85).fillRoundedRect(-62, -20, 124, 40, 8).lineStyle(2, 0xf2b21a, 0.9).strokeRoundedRect(-62, -20, 124, 40, 8);
    btn.add([g, labelAt(scene, 0, 0, t('skip'), S_BTN)]);
    if (!scene.sys.game.device.input.touch) btn.add(labelAt(scene, 0, 30, 'Tab', S_KEY));
    btn.setSize(124, 40).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(9070);
    btn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev?.stopPropagation?.(); onSkip(); });
    scene.add.existing(btn);
    this.b = btn;
  }
  destroy(): void { this.b.destroy(); }
}

void START_HERO; void playerCharacter; void freedIn; void STAND;
