// Sushi Rush: the Play scene. A run is a string of days at the bar:
//   chef choice (a run's first day) → the day's card (goal, menu) → a power-card draft → the day
//   itself → the summary → the upgrades → the next day … until a day's goal is missed or the
//   hearts run out (the result screen; a rewarded ad may continue that day once).
// The day is the pure simulation (sim.ts), stepped at 60 Hz and drawn in 3D (view.ts). On top:
// the HUD chips (earnings, day, hearts, the day's goal, the clock, the cards), the order bubbles
// with patience rings over the customers, timers over the pot and the steamer, and a tray of big
// station buttons with the plate's contents, BIN and BELL.
// Touch: tap a station (in the room or on the tray), then the customer. Keys: 1–7 stations,
// ←/→ choose a seat and Enter / Space serve, Backspace bins, B rings the bell, P / Esc pause.
import Phaser from 'phaser';
import {
  ArcadeScene, t, isEasy, hudChip, HUD_ROW2_Y, HUD_MARGIN, hudRightEdge, labelAt, labelTexture, fitWidth, KitButton, skinImage,
  bakeButton, isModalOpen, showKeyHelp, type HudChip, type LabelStyle, type KeyHelpHint,
} from '@core';
import type { World3D } from '@core/three';
import { View } from './view';
import { Day, mulberry, plateDish, type RunState, type SimEvent, type Action } from './sim';
import { Bot, SKILL } from './bot';
import {
  DT, STATION, STATION_IDS, MAX_SEATS, menuOn,
  type StationId, type FridgeItem, type CookId, type DishId, type Item,
} from './defs';
import { rollCards, type CardId } from './powers';
import { loadMeta, saveMeta, type Meta } from './meta';
import { iconImg, setIcon, BUBBLE, BUBBLE_VIP, BUBBLE_R, TIMER, SEAT_MARK, makeArt } from './art';
import {
  ChefScreen, DayScreen, DraftScreen, SummaryScreen, ShopScreen, pauseSides, dishIcon, STATION_ICON, type Panel, type ScreenHost,
} from './screens';
import { renderIconSheet } from './icons';

type Phase = 'chef' | 'intro' | 'draft' | 'play' | 'closing' | 'summary' | 'shop' | 'end';

/** The tray along the bottom. */
const TRAY_Y = 664, TRAY_H = 90, ST_W = 104, PLATE_W = 214;
const TRAY_X0 = 16 + PLATE_W + 10;
/** Banner and toast styles (painted ahead, see prebakePlay). */
const S_BANNER: LabelStyle = { size: 64, fill: ['#fffdf6', '#ffe2a8', '#f7a63a'], stroke: '#3a1a0e', strokeWidth: 10 };
const S_TOAST: LabelStyle = { size: 26, color: '#fff2cc', stroke: '#3a1a0e', strokeWidth: 5 };
const S_TRAY: LabelStyle = { size: 17, color: '#fff8ec', stroke: '#3a1a0e', strokeWidth: 4 };
const S_KEY: LabelStyle = { size: 16, color: '#ffe08a', stroke: '#3a1a0e', strokeWidth: 4 };
/** The coins a dish brings (and a refund's loss), floating up from the customer. */
const S_COIN: LabelStyle = { size: 34, fill: ['#fff6cc', '#ffe08a', '#f2b23a'], stroke: '#3a1a0e', strokeWidth: 7 };
const S_COIN_LOST: LabelStyle = { size: 34, color: '#ff7a6a', stroke: '#3a1a0e', strokeWidth: 7 };
const BANNERS = ['goalHit', 'closing', 'lastSecs', 'vip', 'wrong', 'forgiven', 'golden', 'lucky', 'burnt', 'zen', 'calm', 'lostOne', 'bellRing', 'pickFish', 'pickCook'];
const DENIES = ['full', 'queueFull', 'hasRice', 'hasNori', 'hasFilling', 'noCut', 'cantRoll', 'needCut', 'busy', 'notEmpty', 'nothing', 'noDish', 'noCustomer', 'rolled', 'notReady', 'bell'];
const WOOD = 0xd9a066;

/** The icon of a plate item. */
const ITEM_ICON: Record<Item, string> = {
  rice: 'rice', nori: 'nori', tuna: 'tuna', salmon: 'salmon-fish', ebi: 'ebi', octo: 'tentacle', cucumber: 'cucumber', urchin: 'urchin',
  'tuna-cut': 'maguro-nigiri', 'salmon-cut': 'salmon', 'ebi-cut': 'ebi', 'octo-cut': 'tentacle', 'cucumber-cut': 'cucumber-cut',
};
const FRIDGE_ICON: Record<FridgeItem | 'prep', string> = { tuna: 'tuna', salmon: 'salmon-fish', cucumber: 'cucumber', ebi: 'ebi', octo: 'tentacle', urchin: 'urchin', prep: 'roll' };

/** Paints the Play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const k of BANNERS) { labelTexture(scene, t(k), S_BANNER); labelTexture(scene, t(k), S_TOAST); }
  for (let n = 2; n <= 12; n++) labelTexture(scene, t('streakN', { n }), S_TOAST);
  for (let n = 1; n <= 40; n++) labelTexture(scene, '+' + n, S_COIN);
  for (const k of DENIES) labelTexture(scene, t('no_' + k), S_TOAST);
  for (const st of STATION_IDS) labelTexture(scene, t('sb_' + st), S_TRAY);
  for (const k of ['bin', 'bell']) labelTexture(scene, t(k), S_TRAY);
  for (let i = 1; i <= 7; i++) labelTexture(scene, String(i), S_KEY);
  for (const k of ['B', '⌫']) labelTexture(scene, k, S_KEY);
  for (const d of [...menuOn(99)]) labelTexture(scene, t('d_' + d.id), S_TRAY);
  for (let n = 1; n <= 30; n++) labelTexture(scene, t('dayN', { n }), S_BANNER);
  bakeButton(scene, 'plate', ST_W, TRAY_H, WOOD, true, true);
  bakeButton(scene, 'plate', 96, 96, WOOD);
  bakeButton(scene, 'plate', 100, TRAY_H, WOOD, true);
  skinImage(scene, 0, 0, 'board', PLATE_W, TRAY_H).destroy();
  skinImage(scene, 0, 0, 'board', 96 * 4 + 40, 150).destroy();
}

interface Bubble { root: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Image; icons: Phaser.GameObjects.Image[]; ring: Phaser.GameObjects.Graphics; id: number; shown: string }
interface TimerUi { root: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Graphics; state: string }

export class PlayScene extends ArcadeScene {
  view!: View;
  /** The 3D world (the view's; the GPU memory check finds the renderer through it). */
  world!: World3D;
  day!: Day;
  run!: RunState;
  meta!: Meta;
  phase: Phase = 'chef';
  panel: Panel | null = null;
  private acc = 0;
  private rnd!: () => number;
  /** The autopilot (test hooks and the store-art stage). */
  bot: Bot | null = null;
  private goalChip!: HudChip;
  private clockChip!: HudChip;
  private cardChip!: HudChip;
  private trayBtns = new Map<StationId, KitButton>();
  private binBtn!: KitButton;
  private bellBtn!: KitButton;
  private plateIcons: Phaser.GameObjects.Image[] = [];
  private plateName!: Phaser.GameObjects.Image;
  private plateSig = '';
  private bubbles: (Bubble | null)[] = [];
  private seatZones: Phaser.GameObjects.Zone[] = [];
  private stationZones = new Map<StationId, Phaser.GameObjects.Zone>();
  private timers: { pot: TimerUi[]; steamer: TimerUi[] } = { pot: [], steamer: [] };
  private seatSel = 0;
  private seatMark!: Phaser.GameObjects.Image;
  private picker: Phaser.GameObjects.Container | null = null;
  private pickerKeys: (() => void)[] = [];
  private toastImg: Phaser.GameObjects.Image | null = null;
  private lastTick = -1;
  private goalHit = false;
  private paidOut = 0;
  private revived = false;
  private hintsOn = false;
  /** The first-time keys along the bottom (desktop, once): the day runs on under them. */
  private keyHint: KeyHelpHint | null = null;
  private host!: ScreenHost;
  /** Real seconds since the round started (for the timing scripts). */
  perf = { frames: 0, calls: 0 };

  createGame(): void {
    this.meta = loadMeta();
    this.meta.runs++;
    saveMeta(this.meta);
    this.phase = 'chef';
    this.panel = null;
    this.acc = 0;
    this.bot = null;
    this.goalHit = false;
    this.paidOut = 0;
    this.revived = false;
    this.keyHint = null;
    this.lastTick = -1;
    this.plateSig = '';
    this.bubbles = new Array(MAX_SEATS).fill(null);
    this.seatZones = [];
    this.stationZones = new Map();
    this.trayBtns = new Map();
    this.timers = { pot: [], steamer: [] };
    this.picker = null;
    this.pickerKeys = [];
    this.toastImg = null;
    this.seatSel = 0;
    const seed = (Date.now() & 0xffffff) ^ 0x5eed;
    this.rnd = mulberry(seed);
    this.run = { mode: isEasy() ? 'easy' : 'normal', day: 1, earned: 0, cards: [], ranks: this.meta.ranks, seed, served: 0, tips: 0 };
    this.host = { sfx: (k, v) => this.sfx(k, { volume: v ?? 0.5 }), touch: this.sys.game.device.input.touch };
    makeArt(this);
    this.day = new Day(this.run, seed);
    this.day.frozen = true;
    this.view = new View(this, { chef: this.meta.chef, ranks: this.run.ranks, day: 1, seats: this.day.seats });
    this.world = this.view.world;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.view.dispose());
    this.setupHud();
    this.setupTray();
    this.setupZones();
    this.setupKeys();
    this.seatMark = this.add.image(-100, -100, SEAT_MARK).setDepth(8400).setVisible(false);
    this.tweens.add({ targets: this.seatMark, scale: 1.15, duration: 420, yoyo: true, repeat: -1 });
    // the run's cards and today's recipes beside the pause card
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      const ps = this.scene.get('Pause');
      ps?.events.once(Phaser.Scenes.Events.CREATE, () => { if (!this.isOver) pauseSides(ps, this.run.cards, this.run.day); });
    });
    this.hooks();
    this.refreshHud();
    // the chef for this run, then the first day
    this.day.chef.x = -3.6;
    this.panel = new ChefScreen(this, this.host, this.meta.chef, (c) => { this.view.setChef(c); this.view.chef.play('Wave', { once: true, then: 'Idle' }); }, (c) => {
      this.meta.chef = c;
      saveMeta(this.meta);
      this.view.setChef(c);
      this.panel = null;
      this.openDay();
    });
  }

  // ---------------------------------------------------------------- the HUD

  private setupHud(): void {
    this.hud.setLevel(this.run.day);
    const y = HUD_ROW2_Y;
    this.goalChip = hudChip(this, HUD_MARGIN, y, { icon: 'sr-p-coin', iconSize: 30, text: '0/0', minWidth: 150 });
    this.clockChip = hudChip(this, this.scale.width / 2, y, { align: 'center', icon: 'sr-p-clock', iconSize: 30, text: '0:00', minWidth: 120 });
    this.cardChip = hudChip(this, hudRightEdge(this), y, { align: 'right', icon: 'sr-p-cat', iconSize: 30, text: '×0', minWidth: 80 });
  }

  private refreshHud(): void {
    const d = this.day;
    this.setScore(this.run.earned);
    this.hud.setLevel(this.run.day);
    this.hud.setLives(d.hearts, d.maxHearts);
    this.goalChip.setText(`${Math.max(0, d.coins)}/${d.goal}`);
    this.goalChip.setTextColor(d.coins >= d.goal ? '#9aff9a' : '#ffffff');
    const left = Math.ceil(d.timeLeft);
    this.clockChip.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this.clockChip.setTextColor(left <= 15 && this.phase === 'play' ? '#ff7a6a' : '#ffffff');
    this.cardChip.setText('×' + this.run.cards.length);
  }

  // ---------------------------------------------------------------- the tray

  private setupTray(): void {
    const s = this;
    s.add.existing(skinImage(s, 16 + PLATE_W / 2, TRAY_Y, 'board', PLATE_W, TRAY_H).setDepth(8500));
    this.plateIcons = [];
    for (let i = 0; i < 4; i++) this.plateIcons.push(iconImg(s, 0, TRAY_Y - 8, 'plate', 50).setDepth(8501).setVisible(false));
    this.plateName = s.add.image(16 + PLATE_W / 2, TRAY_Y + 30, '__DEFAULT').setDepth(8501).setVisible(false);
    STATION_IDS.forEach((st, i) => {
      const x = TRAY_X0 + ST_W / 2 + i * (ST_W + 6);
      const b = new KitButton(s, x, TRAY_Y, { w: ST_W, h: TRAY_H, kind: 'plate', color: WOOD, tapWhenOff: true, sfx: null }, () => this.tapStation(st, b));
      b.addContent(iconImg(s, 0, -10, STATION_ICON[st], 54), labelAt(s, 0, 30, t('sb_' + st), S_TRAY), labelAt(s, -ST_W / 2 + 14, -TRAY_H / 2 + 14, String(STATION[st].key), S_KEY));
      b.setDepth(8500);
      this.trayBtns.set(st, b);
    });
    const bx = TRAY_X0 + 7 * (ST_W + 6) + 50;
    this.binBtn = new KitButton(s, bx, TRAY_Y, { w: 100, h: TRAY_H, kind: 'plate', color: WOOD, sfx: null }, () => this.doBin());
    this.binBtn.addContent(iconImg(s, 0, -10, 'p-bin', 50), labelAt(s, 0, 30, t('bin'), S_TRAY), labelAt(s, -36, -TRAY_H / 2 + 14, '⌫', S_KEY));
    this.binBtn.setDepth(8500);
    this.bellBtn = new KitButton(s, bx + 106, TRAY_Y, { w: 100, h: TRAY_H, kind: 'plate', color: WOOD, tapWhenOff: true, sfx: null }, () => this.ringBell());
    this.bellBtn.addContent(iconImg(s, 0, -10, 'bell', 54), labelAt(s, 0, 30, t('bell'), S_TRAY), labelAt(s, -36, -TRAY_H / 2 + 14, 'B', S_KEY));
    this.bellBtn.setDepth(8500);
  }

  /** Locks the stations the day's menu does not use; the bell shows from Bell II. */
  private refreshTray(): void {
    for (const [st, b] of this.trayBtns) b.setEnabled(this.day.stations.includes(st));
    this.bellBtn.setVisible(this.day.m.bell);
    this.bellBtn.setEnabled(this.day.bellCd <= 0);
  }

  private showPlate(): void {
    const p = this.day.plate;
    const sig = JSON.stringify([p.items, p.rolled, p.ready]);
    if (sig === this.plateSig) return;
    this.plateSig = sig;
    const d = plateDish(p);
    for (const img of this.plateIcons) img.setVisible(false);
    const cx = 16 + PLATE_W / 2;
    if (d) {
      const img = setIcon(this.plateIcons[0], dishIcon(d), 62).setPosition(cx, TRAY_Y - 10).setVisible(true).setTint(0xffffff);
      this.tweens.add({ targets: img, scale: img.scale * 1.25, duration: 140, yoyo: true });
      this.plateName.setVisible(true).setTexture(labelTexture(this, t('d_' + d), S_TRAY));
      fitWidth(this.plateName, PLATE_W - 20);
      this.plateName.setPosition(cx, TRAY_Y + 30);
    } else {
      this.plateName.setVisible(false);
      const items = p.items;
      if (!items.length) {
        setIcon(this.plateIcons[0], 'plate', 54).setPosition(cx, TRAY_Y).setVisible(true).setAlpha(0.6).setTint(0xffffff);
      }
      items.forEach((it, i) => {
        const x = cx + (i - (items.length - 1) / 2) * 52;
        setIcon(this.plateIcons[i], ITEM_ICON[it], 48).setPosition(x, TRAY_Y).setVisible(true).setAlpha(1);
      });
    }
  }

  // ---------------------------------------------------------------- tapping the room

  private setupZones(): void {
    for (const st of STATION_IDS) {
      const z = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true }).setDepth(50);
      z.on('pointerdown', () => { if (this.canPlay()) this.tapStation(st, this.trayBtns.get(st)!); });
      this.stationZones.set(st, z);
    }
    for (let i = 0; i < MAX_SEATS; i++) {
      const z = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true }).setDepth(60);
      z.on('pointerdown', () => { if (this.canPlay()) this.serve(i); });
      this.seatZones.push(z);
    }
    this.placeZones();
  }

  /** Puts the tap zones over the stations and the seats as the camera sees them. */
  private placeZones(): void {
    const v = this.view;
    STATION_IDS.forEach((st, i) => {
      const x = STATION[st].x;
      const prev = STATION[STATION_IDS[i - 1]]?.x ?? x - 3, next = STATION[STATION_IDS[i + 1]]?.x ?? x + 3;
      const a = v.screen((prev + x) / 2, 1.9, -5.35), b = v.screen((x + next) / 2, 1.9, -5.35);
      const top = v.screen(x, 4.3, -5.35).y, bot = v.screen(x, 1.6, -4.4).y;
      const z = this.stationZones.get(st)!;
      z.setPosition((a.x + b.x) / 2, (top + bot) / 2).setSize(Math.abs(b.x - a.x), Math.abs(bot - top));
      z.input!.hitArea.setTo(0, 0, z.width, z.height);
      z.setVisible(this.day.stations.includes(st));
      if (!this.day.stations.includes(st)) z.disableInteractive(); else z.setInteractive();
    });
    const xs = v.seatX;
    for (let i = 0; i < MAX_SEATS; i++) {
      const z = this.seatZones[i];
      if (i >= xs.length) { z.disableInteractive(); continue; }
      const gap = xs.length > 1 ? Math.abs(xs[1] - xs[0]) : 3;
      const a = v.screen(xs[i] - gap * 0.45, 0, 1), b = v.screen(xs[i] + gap * 0.45, 0, 1);
      const top = v.bubbleAt(i).y - 58, bot = v.screen(xs[i], 0, 1.6).y;
      z.setPosition((a.x + b.x) / 2, (top + bot) / 2).setSize(Math.abs(b.x - a.x), bot - top);
      z.input!.hitArea.setTo(0, 0, z.width, z.height);
      z.setInteractive();
    }
  }

  private canPlay(): boolean {
    return this.phase === 'play' && !this.panel && !this.isOver && !isModalOpen(this);
  }

  // ---------------------------------------------------------------- actions

  private tapStation(st: StationId, btn?: KitButton): void {
    if (!this.canPlay()) return;
    const d = this.day;
    if (!d.stations.includes(st)) { this.shakeBtn(btn); this.sfx('deny', { volume: 0.4 }); return; }
    this.closePicker();
    if (st === 'fridge') {
      const items: (FridgeItem | 'prep')[] = [...d.fridge];
      if (d.prepLeft > 0) items.push('prep');
      if (items.length === 1) { this.act({ kind: 'station', st, item: items[0] }, btn); return; }
      this.openPicker(st, items.map((it) => ({ icon: FRIDGE_ICON[it], go: () => this.act({ kind: 'station', st, item: it }, btn) })));
      return;
    }
    if (st === 'pot' || st === 'steamer') {
      const plan = d.cookerPlan(st, {});
      if (plan) { this.act({ kind: 'station', st }, btn); return; }
      const opts = st === 'pot' ? d.pots : d.steams;
      if (!(st === 'pot' ? d.potSlots : d.basketSlots).some((s) => s.state === 'empty')) { this.act({ kind: 'station', st, cook: opts[0] }, btn); return; }
      if (opts.length === 1) { this.act({ kind: 'station', st, cook: opts[0] }, btn); return; }
      this.openPicker(st, opts.map((c) => ({ icon: dishIcon(c), go: () => this.act({ kind: 'station', st, cook: c as CookId }, btn) })));
      return;
    }
    this.act({ kind: 'station', st }, btn);
  }

  private act(a: Action, btn?: KitButton): void {
    this.closePicker();
    if (this.day.tap(a)) {
      this.sfx('click', { volume: 0.35 });
      if (btn) this.tweens.add({ targets: btn, scale: 1.08, duration: 70, yoyo: true });
    } else this.shakeBtn(btn);
  }

  private serve(seat: number): void {
    if (!this.canPlay()) return;
    this.seatSel = seat;
    this.act({ kind: 'serve', seat });
  }

  private doBin(): void {
    if (!this.canPlay()) return;
    this.closePicker();
    this.day.bin();
  }

  private ringBell(): void {
    if (!this.canPlay()) return;
    if (!this.day.ringBell()) this.shakeBtn(this.bellBtn);
  }

  private shakeBtn(b?: Phaser.GameObjects.Container): void {
    if (!b) return;
    const x0 = b.getData('x0') ?? b.x;
    b.setData('x0', x0);
    this.tweens.add({ targets: b, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => b.setX(x0) });
  }

  // ---------------------------------------------------------------- the picker

  private openPicker(st: StationId, opts: { icon: string; go: () => void }[]): void {
    this.closePicker();
    const s = this;
    const btn = this.trayBtns.get(st)!;
    const w = opts.length * 104 + 24, h = 150;
    const x = Phaser.Math.Clamp(btn.x, w / 2 + 10, this.scale.width - w / 2 - 10), y = TRAY_Y - TRAY_H / 2 - h / 2 - 6;
    const c = s.add.container(x, y).setDepth(8800);
    c.add(skinImage(s, 0, 0, 'board', 96 * 4 + 40, h).setDisplaySize(w + 28, h + 42));
    c.add(labelAt(s, 0, -h / 2 + 22, t(st === 'fridge' ? 'pickFish' : 'pickCook'), S_TOAST).setScale(0.75));
    this.pickerKeys = [];
    opts.forEach((o, i) => {
      const bx = (i - (opts.length - 1) / 2) * 104;
      const b = new KitButton(s, bx, 16, { w: 96, h: 96, kind: 'plate', color: WOOD, sfx: null }, () => o.go());
      b.addContent(iconImg(s, 0, -2, o.icon, 70), labelAt(s, -34, -34, String(i + 1), S_KEY));
      c.add(b);
      this.pickerKeys.push(o.go);
    });
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' });
    this.picker = c;
    this.sfx('pick', { volume: 0.4 });
  }

  private closePicker(): void {
    if (!this.picker) return;
    this.picker.destroy();
    this.picker = null;
    this.pickerKeys = [];
  }

  // ---------------------------------------------------------------- keys

  private setupKeys(): void {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.isOver) return;
      if (this.panel && !this.panel.closed) { if (this.panel.key(e.code)) e.preventDefault(); return; }
      if (!this.canPlay()) return;
      const n = Number(e.code.replace(/^(Digit|Numpad)/, ''));
      if (/^(Digit|Numpad)\d$/.test(e.code)) {
        if (this.picker) { this.pickerKeys[n - 1]?.(); return; }
        const st = STATION_IDS.find((x) => STATION[x].key === n);
        if (st) this.tapStation(st, this.trayBtns.get(st));
        return;
      }
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.moveSeat(-1); break;
        case 'ArrowRight': case 'KeyD': this.moveSeat(1); break;
        case 'Enter': case 'Space': case 'NumpadEnter': case 'ArrowUp': case 'KeyW':
          if (this.picker) { this.pickerKeys[0]?.(); break; }
          this.serve(this.seatSel);
          break;
        case 'Backspace': case 'Delete': case 'KeyX': this.doBin(); break;
        case 'KeyB': this.ringBell(); break;
        case 'Escape': if (this.picker) this.closePicker(); break;
      }
    });
  }

  private moveSeat(dir: number): void {
    const n = this.day.seats;
    // jump between seats with someone waiting; else step
    for (let k = 1; k <= n; k++) {
      const i = (this.seatSel + dir * k + n * 4) % n;
      const c = this.day.occupant[i];
      if (c && (c.state === 'wait' || c.state === 'sit')) { this.seatSel = i; this.sfx('move', { volume: 0.25 }); return; }
    }
    this.seatSel = (this.seatSel + dir + n) % n;
  }

  // ---------------------------------------------------------------- the day's flow

  /** The day's card (goal, menu), then the draft, then the day. */
  private openDay(): void {
    this.phase = 'intro';
    this.day = new Day(this.run, this.run.seed * 31 + this.run.day);
    this.day.frozen = true;
    this.goalHit = false;
    this.paidOut = 0;
    this.revived = false;
    this.lastTick = -1;
    this.view.build(this.run.ranks, this.day.seats, this.run.day);
    this.placeZones();
    this.refreshTray();
    this.refreshHud();
    this.hintsOn = isEasy() || this.run.day <= 2;
    const coach = this.run.day === 1 && !this.meta.coached;
    this.panel = new DayScreen(this, this.host, this.run.day, this.day.goal, this.day.tune.vips > 0, coach, () => {
      this.panel = null;
      if (coach) { this.meta.coached = true; saveMeta(this.meta); }
      this.openDraft();
    });
  }

  private openDraft(): void {
    this.phase = 'draft';
    const deal = () => rollCards(this.run.cards, this.rnd);
    this.panel = new DraftScreen(this, this.host, deal(), deal, (id) => {
      this.panel = null;
      this.run.cards.push(id);
      this.startDay();
    });
  }

  private startDay(quiet = false): void {
    // the card may change the day (hearts, seats, speed …): build it again with the cards
    this.day = new Day(this.run, this.run.seed * 31 + this.run.day);
    this.view.build(this.run.ranks, this.day.seats, this.run.day);
    this.placeZones();
    this.refreshTray();
    this.phase = 'play';
    this.hintsOn = isEasy() || this.run.day <= 2;
    this.bot?.setDay(this.day);
    this.refreshHud();
    if (quiet) return;
    this.banner(t('dayN', { n: this.run.day }));
    this.sfx('start', { volume: 0.5 });
    // desktop, once: the keys and what they do, above the station tray, once the shop opens for the day
    if (!this.keyHint) this.keyHint = showKeyHelp(this, { bottom: 118 });
  }

  /** The day ended: a closing banner, then the summary and the shop; or the end of the run. */
  private dayOver(won: boolean, why: 'time' | 'hearts'): void {
    const d = this.day;
    this.meta.coins += Math.max(0, d.coins - this.paidOut);
    this.paidOut = Math.max(this.paidOut, d.coins);
    this.meta.bestDay = Math.max(this.meta.bestDay, this.run.day);
    saveMeta(this.meta);
    this.closePicker();
    if (!won) {
      this.phase = 'end';
      this.sfx('lose', { volume: 0.6 });
      this.endGame({ title: t(why === 'hearts' ? 'outHearts' : 'missedGoal'), delay: 1400 });
      return;
    }
    this.phase = 'closing';
    this.banner(t('closing'));
    this.sfx('fanfare', { volume: 0.55 });
    this.time.delayedCall(1700, () => {
      if (this.isOver) return;
      this.phase = 'summary';
      let best: DishId | null = null;
      for (const [k, v] of Object.entries(d.stats.best)) if (!best || v > (d.stats.best[best] ?? 0)) best = k as DishId;
      this.panel = new SummaryScreen(this, this.host, { day: this.run.day, coins: d.coins, goal: d.goal, tips: d.stats.tips, served: d.stats.served, lost: d.stats.lost, best }, () => {
        this.phase = 'shop';
        this.panel = new ShopScreen(this, this.host, this.meta, this.run.day, () => this.view.build(this.run.ranks, this.day.seats, this.run.day), () => {
          this.panel = null;
          this.run.day++;
          this.openDay();
        });
      });
    });
  }

  /** A rewarded continue: the failed day goes on (hearts back, or 30 more seconds). */
  revive(): void {
    this.revived = true;
    if (this.phase !== 'end') return;
    this.day.revive();
    this.phase = 'play';
    this.refreshHud();
  }

  // ---------------------------------------------------------------- per frame

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.perf.frames++;
    if (this.phase === 'play' && !this.panel) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 5) {
        this.acc -= DT;
        n++;
        this.bot?.step(DT);
        this.day.step(DT);
        this.handleEvents();
        if (this.day.over) break;
      }
      if (n >= 5) this.acc = 0;
    } else this.handleEvents();
    const hints = this.hintsOn && this.phase === 'play' ? this.day.usefulStations() : undefined;
    this.view.sync(this.day, this.phase === 'play' ? dt : dt * 0.5, hints);
    for (const [st, b] of this.trayBtns) b.setSelected(!!hints?.has(st));
    this.syncBubbles();
    this.syncTimers();
    this.showPlate();
    this.refreshHud();
    if (this.day.m.bell) this.bellBtn.setEnabled(this.day.bellCd <= 0);
    // the last 15 seconds tick
    if (this.phase === 'play') {
      const left = Math.ceil(this.day.timeLeft);
      if (left <= 15 && left !== this.lastTick && left > 0) {
        if (left === 15) this.banner(t('lastSecs'), 0.7);
        this.lastTick = left;
        this.sfx('tick', { volume: 0.35 });
      }
    }
  }

  private handleEvents(): void {
    const d = this.day;
    for (const ev of d.events) {
      this.view.handle(ev);
      this.react(ev);
    }
    d.events.length = 0;
  }

  /** Sounds, popups and banners for a simulation event. */
  private react(ev: SimEvent): void {
    const v = this.view;
    switch (ev.type) {
      case 'arrive': this.sfx('door', { volume: 0.35 }); if (ev.c.vip) { this.banner(t('vip'), 0.8); this.sfx('vip', { volume: 0.5 }); } break;
      case 'order': this.sfxAt('order', v.bubbleAt(ev.c.seat).x, { volume: 0.4 }); break;
      case 'work':
        if (ev.st === 'knife') this.sfx('chop', { volume: 0.6 });
        else if (ev.st === 'mat') this.sfx('roll', { volume: 0.5 });
        else if (ev.st === 'fridge') this.sfx('fridge', { volume: 0.4 });
        else if (ev.st === 'pot' || ev.st === 'steamer') this.sfx('boil', { volume: 0.35 });
        else this.sfx('add', { volume: 0.4 });
        break;
      case 'add': this.sfx('add', { volume: 0.45 }); break;
      case 'cut': this.sfx('chop', { volume: 0.7 }); if (ev.spare) this.sfx('ding', { volume: 0.3 }); break;
      case 'roll': this.sfx('done', { volume: 0.5 }); break;
      case 'cookStart': this.sfx('boil', { volume: 0.5 }); break;
      case 'cookDone': { const p = v.cookerAt(ev.st, ev.slot); this.sfxAt('ding', p.x, { volume: 0.55 }); break; }
      case 'burnt': { const p = v.cookerAt('pot', ev.slot); this.toastAt(t('burnt'), p.x, p.y - 40); this.sfx('burnt', { volume: 0.6 }); break; }
      case 'take': this.sfx('serve', { volume: 0.45 }); break;
      case 'dump': this.sfx('bin', { volume: 0.5 }); break;
      case 'bin': this.sfx('bin', { volume: 0.55 }); break;
      case 'serve': {
        const p = v.bubbleAt(ev.c.seat);
        this.sfxAt('coin', p.x, { volume: 0.6 });
        if (ev.tip > 0) this.time.delayedCall(140, () => this.sfxAt('tip', p.x, { volume: 0.45 }));
        this.coinPop(p.x, p.y - 10, ev.coins, ev.tip);
        if (ev.golden) { this.banner(t('golden'), 0.7); this.sfx('golden', { volume: 0.6 }); }
        else if (ev.lucky) this.toastAt(t('lucky'), p.x, p.y - 80);
        if (ev.streak >= 2 && this.day.m.streak) this.toastAt(t('streakN', { n: ev.streak + 1 }), p.x, p.y - 110);
        this.sfx(ev.last ? 'happy' : 'serve', { volume: 0.5 });
        if (!this.goalHit && this.day.coins >= this.day.goal) {
          this.goalHit = true;
          this.time.delayedCall(300, () => { this.banner(t('goalHit')); this.sfx('fanfare2', { volume: 0.5 }); });
          this.goalChip.setScale(1.3);
          this.tweens.add({ targets: this.goalChip, scale: 1, duration: 400, ease: 'Back.easeOut' });
        }
        this.hud.scoreChip.setScale(1.15);
        this.tweens.add({ targets: this.hud.scoreChip, scale: 1, duration: 260 });
        break;
      }
      case 'wrong': {
        const p = v.bubbleAt(ev.c.seat);
        this.sfx('wrong', { volume: 0.6 });
        this.toastAt(ev.forgiven ? t('forgiven') : t('wrong'), p.x, p.y - 70);
        if (ev.coins) this.coinPop(p.x, p.y, -ev.coins, 0);
        this.cameras.main.shake(140, 0.004);
        break;
      }
      case 'angry': {
        const p = v.bubbleAt(ev.c.seat);
        this.sfx('angry', { volume: 0.6 });
        this.toastAt(ev.forgiven ? t('forgiven') : t('lostOne'), p.x, p.y - 40);
        if (!ev.forgiven) this.cameras.main.shake(220, 0.007);
        break;
      }
      case 'calm': this.toastAt(t('calm'), v.bubbleAt(ev.c.seat).x, v.bubbleAt(ev.c.seat).y - 70); this.sfx('zen', { volume: 0.5 }); break;
      case 'zen': this.banner(t('zen'), 0.7); this.sfx('zen', { volume: 0.5 }); break;
      case 'bell': this.sfx('bell', { volume: 0.6 }); this.toastAt(t('bellRing'), this.bellBtn.x, TRAY_Y - 70); break;
      case 'heart': this.hud.setLives(ev.left, this.day.maxHearts); break;
      case 'deny':
        this.sfx('deny', { volume: 0.4 });
        this.toast(t('no_' + ev.why));
        if (ev.st) this.shakeBtn(this.trayBtns.get(ev.st));
        break;
      case 'eatDone': this.sfx('happy', { volume: 0.35 }); break;
      case 'end': if (this.phase === 'play') this.dayOver(ev.won, ev.why); break;
    }
  }

  // ---------------------------------------------------------------- bubbles and timers

  private syncBubbles(): void {
    const d = this.day, v = this.view;
    let selOk = false;
    for (let i = 0; i < MAX_SEATS; i++) {
      const c = i < d.seats ? d.occupant[i] : null;
      const show = !!c && (c.state === 'wait' || c.state === 'sit') && c.served < c.orders.length;
      let b = this.bubbles[i];
      if (!show) {
        if (b && b.root.visible) {
          const r = b.root;
          this.tweens.add({ targets: r, scale: 0.2, alpha: 0, duration: 160, onComplete: () => r.setVisible(false) });
          b.shown = '';
          b.id = -1;
        }
        continue;
      }
      if (!b) { b = this.makeBubble(); this.bubbles[i] = b; }
      const p = v.bubbleAt(i);
      b.root.setPosition(p.x, p.y);
      const want = c!.orders.slice(c!.served);
      const sig = c!.id + ':' + want.join(',') + (c!.vip ? 'v' : '');
      if (b.shown !== sig) {
        const fresh = b.id !== c!.id;
        b.shown = sig;
        b.id = c!.id;
        b.bg.setTexture(c!.vip ? BUBBLE_VIP : BUBBLE);
        b.icons.forEach((im, k) => {
          if (k >= want.length) { im.setVisible(false); return; }
          setIcon(im, dishIcon(want[k]), want.length > 1 ? 46 : 70).setVisible(true);
          im.setPosition(want.length > 1 ? (k ? 15 : -15) : 0, want.length > 1 ? (k ? 9 : -11) : -4);
        });
        b.root.setVisible(true).setAlpha(1);
        if (fresh) { b.root.setScale(0.2); this.tweens.add({ targets: b.root, scale: 1, duration: 260, ease: 'Back.easeOut' }); }
      }
      // the patience ring: green → yellow → red, pulsing when low
      const k = Math.max(0, c!.patience);
      const col = k > 0.5 ? 0x4ccf5a : k > 0.25 ? 0xf4c430 : 0xe8402e;
      b.ring.clear();
      b.ring.lineStyle(7, 0x3a1a0e, 0.35).beginPath().arc(0, -4, BUBBLE_R - 2, 0, Math.PI * 2).strokePath();
      b.ring.lineStyle(7, col, 1).beginPath().arc(0, -4, BUBBLE_R - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
      if (c!.state === 'sit') b.ring.clear();
      if (k < 0.25 && c!.state === 'wait') b.root.setScale(1 + Math.sin(this.time.now / 90) * 0.05);
      else if (!this.tweens.isTweening(b.root)) b.root.setScale(1);
      if (i === this.seatSel) selOk = true;
    }
    // the keyboard's seat: follow a customer who wants what is on the plate
    const pd = plateDish(d.plate);
    if (pd) {
      const cur = d.occupant[this.seatSel];
      if (!cur || !cur.orders.slice(cur.served).includes(pd)) {
        let best = -1, bp = 2;
        d.occupant.forEach((c, i) => { if (c && c.state === 'wait' && c.orders.slice(c.served).includes(pd) && c.patience < bp) { bp = c.patience; best = i; } });
        if (best >= 0) { this.seatSel = best; selOk = true; }
      }
    }
    const kb = !this.host.touch;
    if (kb && selOk && this.phase === 'play') {
      const p = v.bubbleAt(this.seatSel);
      this.seatMark.setVisible(true).setPosition(p.x, p.y - BUBBLE_R - 34);
    } else this.seatMark.setVisible(false);
  }

  private makeBubble(): Bubble {
    const root = this.add.container(0, 0).setDepth(8300);
    const bg = this.add.image(0, 2, BUBBLE);
    const ring = this.add.graphics();
    const icons = [iconImg(this, 0, 0, 'plate', 70), iconImg(this, 0, 0, 'plate', 46)];
    root.add([bg, ring, ...icons]);
    return { root, bg, icons, ring, id: -1, shown: '' };
  }

  private syncTimers(): void {
    const d = this.day, v = this.view;
    for (const st of ['pot', 'steamer'] as const) {
      const slots = st === 'pot' ? d.potSlots : d.basketSlots;
      const uis = this.timers[st];
      slots.forEach((s, i) => {
        let ui = uis[i];
        if (!ui) {
          const root = this.add.container(0, 0).setDepth(8200);
          const icon = iconImg(this, 0, 0, 'ramen', 44);
          const ring = this.add.graphics();
          root.add([this.add.image(0, 0, TIMER), ring, icon]);
          ui = { root, icon, ring, state: '' };
          uis[i] = ui;
        }
        const on = s.state !== 'empty' && this.phase !== 'intro';
        ui.root.setVisible(on);
        if (!on) { ui.state = ''; return; }
        const p = v.cookerAt(st, i);
        ui.root.setPosition(p.x, p.y);
        const key = s.state + (s.what ?? '');
        if (ui.state !== key) {
          ui.state = key;
          setIcon(ui.icon, s.state === 'burnt' ? 'p-flame' : dishIcon(s.what as DishId), 44);
          ui.root.setScale(0.5);
          this.tweens.add({ targets: ui.root, scale: 1, duration: 200, ease: 'Back.easeOut' });
        }
        ui.ring.clear();
        if (s.state === 'cooking') {
          const k = 1 - s.t / s.max;
          ui.ring.lineStyle(6, 0x3a1a0e, 0.3).beginPath().arc(0, 0, 30, 0, Math.PI * 2).strokePath();
          ui.ring.lineStyle(6, 0x4aa8e8, 1).beginPath().arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
        } else if (s.state === 'done') {
          const spoil = st === 'pot' && !d.m.noBurn ? s.t / 7 : 1;
          ui.ring.lineStyle(6, spoil < 0.4 ? 0xe8402e : 0x4ccf5a, 1).beginPath().arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * spoil).strokePath();
          ui.root.setScale(1 + Math.sin(this.time.now / 120) * 0.06);
        } else {
          ui.ring.lineStyle(6, 0x2a2020, 1).strokeCircle(0, 0, 30);
        }
      });
      for (let i = slots.length; i < uis.length; i++) uis[i].root.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- feedback

  private banner(s: string, scale = 1): void {
    const { width } = this.scale;
    const img = labelAt(this, width / 2, 250, s, S_BANNER).setDepth(9100).setScrollFactor(0);
    fitWidth(img, width - 200, scale);
    const sc = img.scale;
    img.setScale(sc * 0.3).setAlpha(0);
    this.tweens.add({ targets: img, scale: sc, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: 220, delay: 1100, duration: 380, onComplete: () => img.destroy() });
  }

  private toast(s: string): void {
    this.toastImg?.destroy();
    const img = labelAt(this, this.scale.width / 2, TRAY_Y - TRAY_H / 2 - 30, s, S_TOAST).setDepth(9050);
    this.toastImg = img;
    img.setScale(0.6);
    this.tweens.add({ targets: img, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: 1000, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  private toastAt(s: string, x: number, y: number): void {
    const img = labelAt(this, x, y, s, S_TOAST).setDepth(9050);
    fitWidth(img, 360, 0.85);
    const sc = img.scale;
    img.setScale(sc * 0.5);
    this.tweens.add({ targets: img, scale: sc, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, y: y - 30, delay: 900, duration: 350, onComplete: () => img.destroy() });
  }

  /** "+12" and the tip floating up from the customer, coins flying to the HUD. */
  private coinPop(x: number, y: number, coins: number, tip: number): void {
    const neg = coins < 0;
    // a painted label (cached by its string): a repeat amount only places an image
    const txt = labelAt(this, x, y, (neg ? '' : '+') + coins + (tip > 0 ? `  +${tip}` : ''), neg ? S_COIN_LOST : S_COIN).setDepth(9060).setScale(0.5);
    this.tweens.add({ targets: txt, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: txt, y: y - 90, duration: 1500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: txt, alpha: 0, delay: 950, duration: 550, onComplete: () => txt.destroy() });
    if (neg) return;
    const n = Math.min(6, 2 + Math.floor((coins + tip) / 8));
    const target = { x: this.hud.scoreChip.x + 60, y: this.hud.scoreChip.y };
    for (let i = 0; i < n; i++) {
      const c = iconImg(this, x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 30, 'p-coin', 26).setDepth(9055);
      this.tweens.add({ targets: c, y: c.y - 40 - Math.random() * 30, duration: 260, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: c, x: target.x, y: target.y, scale: c.scale * 0.6, duration: 620 + i * 70, delay: 300 + i * 50, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
    }
    const em = this.add.particles(x, y, 'sr-spark', { speed: { min: 80, max: 260 }, angle: { min: 200, max: 340 }, scale: { start: 1, end: 0 }, lifespan: 500, tint: [0xffd23f, 0xffffff], blendMode: 'ADD', emitting: false }).setDepth(9054);
    em.explode(14);
    this.time.delayedCall(700, () => em.destroy());
  }

  // ---------------------------------------------------------------- test hooks

  private hooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__sushi = {
      iconSheet: () => renderIconSheet(this.view.world.renderer),
      state: () => ({
        phase: this.phase, day: this.run.day, time: this.day.time, coins: this.day.coins, goal: this.day.goal, hearts: this.day.hearts,
        earned: this.run.earned, cards: this.run.cards, plate: this.day.plate, customers: this.day.customers.map((c) => ({ seat: c.seat, state: c.state, orders: c.orders })),
        textures: this.textures.getTextureKeys().length,
      }),
      /** The autopilot plays (and picks through the screens). */
      auto: (on = true) => { this.bot = on ? new Bot(this.day, SKILL.good, this.rnd) : null; },
      /** Skips the screens to a playing day (optionally day n, with upgrades and cards). */
      skip: (o: { day?: number; ranks?: Partial<Meta['ranks']>; cards?: CardId[] } = {}) => this.skipToDay(o),
      /** Runs the day's simulation ahead headless (seconds). */
      fast: (sec: number) => this.fastForward(sec),
      /** Opens a screen for a screenshot. */
      open: (which: string) => this.openForShot(which),
      /** The store-art stage: a busy moment at the bar. */
      stage: (name = 'busy') => this.stage(name),
      key: (code: string) => this.panel?.key(code),
    };
  }

  private skipToDay(o: { day?: number; ranks?: Partial<Meta['ranks']>; cards?: CardId[]; quiet?: boolean }): void {
    this.panel?.close();
    this.panel = null;
    if (o.day) this.run.day = o.day;
    if (o.ranks) Object.assign(this.run.ranks, o.ranks);
    if (o.cards) this.run.cards = [...o.cards];
    this.startDay(o.quiet);
  }

  private fastForward(sec: number): void {
    const steps = Math.round(sec / DT);
    for (let i = 0; i < steps && !this.day.over; i++) {
      this.bot?.step(DT);
      this.day.step(DT);
      for (const ev of this.day.events) this.view.handle(ev);
      this.day.events.length = 0;
    }
  }

  private openForShot(which: string): void {
    this.panel?.close();
    this.panel = null;
    const d = this.day;
    switch (which) {
      case 'chef': this.panel = new ChefScreen(this, this.host, this.meta.chef, (c) => this.view.setChef(c), () => { this.panel = null; }); break;
      case 'intro': this.panel = new DayScreen(this, this.host, this.run.day, d.goal, d.tune.vips > 0, this.run.day === 1, () => { this.panel = null; }); break;
      case 'draft': this.panel = new DraftScreen(this, this.host, rollCards(this.run.cards, this.rnd), () => rollCards(this.run.cards, this.rnd), () => { this.panel = null; }); break;
      case 'summary': this.panel = new SummaryScreen(this, this.host, { day: this.run.day, coins: Math.max(d.coins, 312), goal: d.goal, tips: Math.max(d.stats.tips, 96), served: Math.max(d.stats.served, 21), lost: d.stats.lost, best: 'sakeroll' }, () => { this.panel = null; }); break;
      case 'shop': this.panel = new ShopScreen(this, this.host, this.meta, this.run.day, () => this.view.build(this.run.ranks, this.day.seats, this.run.day), () => { this.panel = null; }); break;
      case 'picker': this.tapStation('fridge'); break;
      case 'pause': this.pauseGame(); break;
    }
  }

  /**
   * A busy moment for the store art: day 6 with a full bar of six, the pot and the steamer going,
   * and the chef just about to hand a finished dish to the customer who ordered it (the coins pop
   * in the first frames). Nothing is saved: the upgrades are this run's only.
   */
  private stage(name: string): void {
    if (name !== 'busy') return;
    this.run.ranks = { ...this.run.ranks, decor: 2, seats: 2, pot: 2, steamer: 2, tea: 2, knife: 2 };
    this.skipToDay({ day: 6, cards: ['happyHour', 'luckyCat', 'goldenPlate'], quiet: true });
    this.bot = new Bot(this.day, SKILL.good, mulberry(6));
    this.fastForward(30);
    // on until a dish is served while at least four others wait: that serve plays live (coins fly)
    for (let i = 0; i < 60 * 40; i++) {
      this.bot.step(DT);
      this.day.step(DT);
      const serve = this.day.events.find((e) => e.type === 'serve');
      const busy = this.day.customers.filter((c) => c.state === 'wait').length >= 4;
      for (const ev of this.day.events) { this.view.handle(ev); if (ev === serve && busy) this.react(ev); }
      this.day.events.length = 0;
      if (serve && busy) break;
    }
  }
}

