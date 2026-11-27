// Sushi Rush: the inner screens, in the menu theme (menu.ts): a walnut board with a gold line and
// sakura in its corners, red-lacquer and hinoki buttons, washi-paper cards.
//   - The chef choice (before a run; the live 3D chef stands left of the board).
//   - The day's opening card (goal, today's menu with the new dishes, the critic's warning).
//   - The power-card draft (three cards, one reroll) at the start of every day.
//   - The day's summary (takings, tips, served, the best seller).
//   - The upgrades (nine tracks, three ranks each), between days.
//   - Recipes and all power cards (from the menu's row), and beside the pause: the run's cards
//     and today's recipes.
// Touch: tap a tile or a button. Keyboard: arrows move the focus, Enter presses, number keys pick,
// Esc closes. Everything they show is painted under the Ayvago intro (`prebakeScreens`, from the
// menu theme's prebake): opening a screen only places images (and a few live numbers as glyphs).
import Phaser from 'phaser';
import {
  t, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, keyHelpShown, type LabelStyle,
} from '@core';
import {
  DISHES, DISH, STATION_IDS, CHEF_IDS, menuOn, type DishId, type ChefId, type StationId, type DishDef,
} from './defs';
import {
  CARDS, CARD, UPGRADE, UPGRADE_IDS, UPGRADE_DAY, MAX_RANK, RARITY_COLOR, RARITIES, type CardId, type UpgradeId, type Rarity,
} from './powers';
import { makeArt, iconImg, SPARK } from './art';
import { nextPrice, buy, type Meta } from './meta';

export const OVERLAY_DEPTH = 9600;
const INK = '#3a1a0e';
const RED = 0xc2282e, WOOD = 0xd9a066, GREEN = 0x3f8a46, GOLDC = 0xc8901c, INDIGO = 0x2f4a8a;

// ------------------------------------------------------------------ sizes

/** The big board (landscape 1280 × 720). */
const BOARD_W = 1220, BOARD_H = 670;
/** Upgrade tiles (3 × 3) in the right column. */
const UP_W = 282, UP_H = 180;
/** The shop's board: below the pause button's corner. */
const SHOP_W = 1220, SHOP_H = 596;
/** Recipe tiles (4 × 4) and card tiles (4 × 3, two pages). */
const REC_W = 286, REC_H = 118;
const CT_W = 286, CT_H = 150;
/** The draft's cards. */
export const CARD_W = 250, CARD_H = 340;
/** The chef board, its rows. */
const CHEF_BOARD_W = 440, CHEF_BOARD_H = 600, CHEF_ROW_W = 390, CHEF_ROW_H = 78;
/** The day's opening card and the summary card. */
export const DAY_W = 680, DAY_H = 540;
/** The pause's side cards (shorter above the desktop key strip). */
export const PSIDE_W = 300, PSIDE_H = 580, PSIDE_KEYS_H = 496;
/** The left column of the shop. */
const SIDE_X = 186, SIDE_PARA = 300;
/** The chef board's centre x. */
const CHEF_X = 990;

/** Every card size the screens use (declared in the theme, painted ahead). */
export const SCREEN_CARDS = [
  { w: UP_W, h: UP_H }, { w: REC_W, h: REC_H }, { w: CT_W, h: CT_H }, { w: CHEF_ROW_W, h: CHEF_ROW_H }, { w: DAY_W, h: DAY_H }, { w: PSIDE_W, h: PSIDE_H }, { w: PSIDE_W, h: PSIDE_KEYS_H },
];
/** The menu row's buttons (RECIPES, CARDS): painted ahead. */
export const MENU_ROW_W = 196, MENU_ROW_H = 84;
export const MENU_ROW_PIECES = [{ kind: 'button' as const, w: MENU_ROW_W, h: MENU_ROW_H }];

// ------------------------------------------------------------------ styles (shared with the prebake)

export const S_TITLE: LabelStyle = { size: 50, fill: ['#fffdf6', '#ffe2a8', '#f7a63a'], stroke: INK, strokeWidth: 8 };
export const S_SUB: LabelStyle = { size: 19, color: '#f6e6c8', stroke: INK, strokeWidth: 3, body: true };
const S_BTN: LabelStyle = { size: 30 };
const S_BTN_S: LabelStyle = { size: 22 };
const S_PURSE: LabelStyle = { size: 34, color: '#ffe08a', stroke: INK, strokeWidth: 5 };
const S_TOAST: LabelStyle = { size: 26, color: '#fff2cc', stroke: INK, strokeWidth: 5 };
const S_KEYS: LabelStyle = { size: 16, color: '#e8d6b8', stroke: INK, strokeWidth: 3, body: true };
const S_PRICE: LabelStyle = { size: 22, color: '#fff6dc', stroke: INK, strokeWidth: 4 };
const V_NAME: LabelStyle = { size: 22, color: '#3a1a0e', stroke: null, shadow: false };
const V_BIG: LabelStyle = { size: 30, color: '#3a1a0e', stroke: null, shadow: false };
const V_HEAD: LabelStyle = { size: 44, color: '#b0222a', stroke: null, shadow: false };
const V_DESC: LabelStyle = { size: 15, color: '#5a3a24', stroke: null, shadow: false, body: true };
const V_DESC_L: LabelStyle = { size: 18, color: '#4a2a18', stroke: null, shadow: false, body: true };
const V_RANK: LabelStyle = { size: 15, color: '#2f6a2a', stroke: null, shadow: false, body: true };
const V_TAG: LabelStyle = { size: 16, color: '#b0222a', stroke: null, shadow: false };
const V_LOCK: LabelStyle = { size: 16, color: '#8a7a6a', stroke: null, shadow: false, body: true };
const V_STAT: LabelStyle = { size: 26, color: '#3a1a0e', stroke: null, shadow: false };
const V_GOLD: LabelStyle = { size: 40, fill: ['#fff6c8', '#f4c430', '#b8801a'], stroke: INK, strokeWidth: 6 };
const V_CARD: LabelStyle = { size: 23, color: '#3a1a0e', stroke: null, shadow: false };
const V_CARD_D: LabelStyle = { size: 17, color: '#4a2a18', stroke: null, shadow: false, body: true };
const V_RAR = (r: Rarity): LabelStyle => ({ size: 15, color: RARITY_COLOR[r].ink, stroke: null, shadow: false, body: true });
const P_HEAD: LabelStyle = { size: 24, color: '#b0222a', stroke: null, shadow: false };
const P_NAME: LabelStyle = { size: 17, color: '#3a1a0e', stroke: null, shadow: false, body: true };
const S_NEW: LabelStyle = { size: 16, color: '#fff8ec', stroke: '#8a1418', strokeWidth: 4 };
const CARD_KEY = (r: Rarity): string => 'sr-card-' + r;
const CARD_GLOW = 'sr-card-glow';

/** The icon of a recipe step (the fridge's step shows the fish). */
export function stepIcon(s: { st: StationId; item?: string }): string {
  if (s.st === 'fridge') return s.item === 'tuna' ? 'tuna' : s.item === 'salmon' ? 'salmon-fish' : s.item === 'cucumber' ? 'cucumber' : s.item === 'ebi' ? 'ebi' : s.item === 'octo' ? 'tentacle' : 'urchin';
  return STATION_ICON[s.st];
}
export const STATION_ICON: Record<StationId, string> = { fridge: 'fridge', rice: 'rice', nori: 'nori', knife: 'cutting-table', mat: 'board', pot: 'pot1', steamer: 'steamer' };
export const dishIcon = (d: DishId): string => DISH[d].model;

// ------------------------------------------------------------------ the prebake

/** Paints, in the current language, everything the inner screens show (Boot, under the intro). */
export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const [w, h] of [[BOARD_W, BOARD_H], [SHOP_W, SHOP_H], [CHEF_BOARD_W, CHEF_BOARD_H], [1000, 640]]) skinTexture(scene, 'board', w, h);
  for (const c of SCREEN_CARDS) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['chefTitle', 'draftTitle', 'shopTitle', 'recipesTitle', 'cardsTitle']) labelTexture(scene, t(k), S_TITLE);
  for (const k of ['chefSub', 'draftSub', 'shopSub', 'recipesSub', 'cardsSub']) { bakePara(scene, t(k), S_SUB, 620); bakePara(scene, t(k), S_SUB, SIDE_PARA); }
  for (const [w, h, col, off] of [[300, 76, RED, false], [240, 70, WOOD, true], [200, 64, RED, false], [124, 50, GREEN, true], [80, 64, WOOD, false], [MENU_ROW_W, MENU_ROW_H, WOOD, false]] as [number, number, number, boolean][]) bakeButton(scene, 'button', w, h, col, off);
  bakeButton(scene, 'plate', CHEF_ROW_W, CHEF_ROW_H, WOOD, false, true);
  bakeButton(scene, 'plate', CARD_W, CARD_H, WOOD);
  for (const k of ['start', 'back', 'close', 'openShop', 'reroll', 'toShop', 'nextDay', 'buy', 'maxed', 'menuRecipes', 'menuCards']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  labelTexture(scene, '‹', S_BTN); labelTexture(scene, '›', S_BTN);
  for (const k of ['poor', 'bought', 'maxed']) labelTexture(scene, t(k), S_TOAST);
  for (const o of [S_PURSE, S_PRICE, V_STAT, V_GOLD, V_BIG]) glyphAtlas(scene, o);
  labelTexture(scene, t('draftKeys'), S_KEYS);
  // chefs
  for (const c of CHEF_IDS) { labelTexture(scene, t('c_' + c), V_NAME); labelTexture(scene, t('cd_' + c), V_DESC); }
  // upgrades
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), V_NAME);
    for (let r = 1; r <= MAX_RANK; r++) bakePara(scene, t(`u_${u}_${r}`), V_DESC, UP_W - 34);
  }
  bakeFmt(scene, 'fromDay', ['n'], V_LOCK);
  // dishes and recipes
  for (const d of DISHES) { labelTexture(scene, t('d_' + d.id), V_NAME); labelTexture(scene, t('d_' + d.id), P_NAME); labelTexture(scene, t('d_' + d.id), V_DESC_L); }
  bakeFmt(scene, 'fromDayShort', ['n'], V_LOCK);
  labelTexture(scene, '→', V_NAME); labelTexture(scene, '=', V_NAME); labelTexture(scene, '+', V_NAME);
  // cards
  prebakeCards(scene);
  // the day card and the summary
  for (const k of ['dayN', 'sumTitle']) bakeFmt(scene, k, ['n'], V_HEAD);
  bakeFmt(scene, 'goalN', ['n'], V_STAT);
  for (const k of ['sumEarned', 'sumTips', 'sumServed', 'sumLost']) bakeFmt(scene, k, ['n'], V_STAT);
  for (const k of ['todayMenu', 'sumBest']) labelTexture(scene, t(k), P_HEAD);
  labelTexture(scene, t('newDish'), S_NEW);
  bakePara(scene, t('vipToday'), V_DESC_L, DAY_W - 80);
  bakePara(scene, t('hintStart'), V_DESC_L, DAY_W - 80);
  bakePara(scene, t('hintKeys'), V_DESC, DAY_W - 80);
  // the pause's side cards
  for (const k of ['yourCards', 'todayMenu']) labelTexture(scene, t(k), P_HEAD);
  bakePara(scene, t('noCards'), P_NAME, PSIDE_W - 50);
}

/** A power card's face: washi paper, a rarity frame and a glowing disc for the picture. */
function paintCard(c: CanvasRenderingContext2D, w: number, h: number, r: Rarity): void {
  const col = RARITY_COLOR[r];
  const hex = (v: number, a = 1) => `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  c.save();
  c.translate(12, 12);
  if (r !== 'common') { c.save(); c.shadowColor = hex(col.glow, r === 'legendary' ? 1 : 0.8); c.shadowBlur = r === 'legendary' ? 18 : 10; c.fillStyle = hex(col.glow); c.beginPath(); c.roundRect(0, 0, w, h, 14); c.fill(); c.restore(); }
  c.shadowColor = 'rgba(30,10,0,0.45)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
  c.fillStyle = '#f6ecd8'; c.beginPath(); c.roundRect(0, 0, w, h, 14); c.fill();
  c.shadowColor = 'transparent';
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fbf4e4'); g.addColorStop(1, '#ead8b6');
  c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, 14); c.fill();
  c.lineWidth = 6; c.strokeStyle = hex(col.frame, 0.95);
  c.beginPath(); c.roundRect(10, 10, w - 20, h - 20, 9); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = hex(col.frame, 0.5);
  c.beginPath(); c.roundRect(18, 18, w - 36, h - 36, 6); c.stroke();
  const d = c.createRadialGradient(w / 2, 112, 8, w / 2, 112, 56);
  d.addColorStop(0, hex(col.glow, 0.75)); d.addColorStop(1, hex(col.frame, 0.15));
  c.fillStyle = d; c.beginPath(); c.arc(w / 2, 112, 54, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3; c.strokeStyle = hex(col.frame); c.stroke();
  if (r === 'legendary') {
    c.fillStyle = '#f4c430';
    for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) { c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}

function prebakeCards(scene: Phaser.Scene): void {
  for (const r of RARITIES) bake(scene, CARD_KEY(r), CARD_W + 24, CARD_H + 24, (c) => paintCard(c, CARD_W, CARD_H, r));
  bake(scene, CARD_GLOW, CARD_W + 44, CARD_H + 44, (c) => { c.shadowColor = 'rgba(255,220,120,1)'; c.shadowBlur = 18; c.strokeStyle = 'rgba(255,236,170,1)'; c.lineWidth = 6; c.beginPath(); c.roundRect(22, 22, CARD_W, CARD_H, 14); c.stroke(); });
  for (const r of RARITIES) labelTexture(scene, t('r_' + r), V_RAR(r));
  for (const card of CARDS) {
    labelTexture(scene, t('k_' + card.id), V_CARD);
    labelTexture(scene, t('k_' + card.id), V_NAME);
    labelTexture(scene, t('k_' + card.id), P_NAME);
    bakePara(scene, t('kd_' + card.id), V_CARD_D, CARD_W - 50);
    bakePara(scene, t('kd_' + card.id), V_DESC, CT_W - 30);
  }
}

// ------------------------------------------------------------------ the panel frame

export interface ScreenHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
}

interface Focusable { btn: KitButton; x: number; y: number }

/**
 * An overlay screen: a dim layer, an optional walnut board with a title, content, keyboard focus
 * over its buttons, short painted toasts.
 */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected content: Phaser.GameObjects.Container;
  protected focus: Focusable[] = [];
  protected fi = -1;
  private toastImg: Phaser.GameObjects.Image | Phaser.GameObjects.Container | null = null;
  closed = false;
  private release: () => void;
  onClose: (() => void) | null = null;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number?, number?]; title?: string; titleX?: number; titleY?: number; titleW?: number; sub?: string; subW?: number; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x120804, o.dim ?? 0.6).setOrigin(0).setInteractive();
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(o.board[2] ?? width / 2, (o.board[3] ?? height / 2) + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    const tx = o.titleX ?? width / 2, ty = o.titleY ?? 64;
    if (o.title) this.root.add(fitWidth(labelAt(scene, tx, ty, o.title, S_TITLE), o.titleW ?? 560));
    if (o.sub) this.root.add(new Para(scene, tx, ty + 30, o.sub, S_SUB, o.subW ?? 620, 0.5, 23));
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    this.release = pushModal(scene);
  }

  protected addFocus(btn: KitButton, x: number, y: number): KitButton {
    this.focus.push({ btn, x, y });
    return btn;
  }

  protected showFocus(): void {
    if (this.host.touch) return;
    this.focus.forEach((f, i) => f.btn.emit(i === this.fi ? 'pointerover' : 'pointerout'));
  }

  protected moveFocus(dx: number, dy: number): void {
    if (!this.focus.length) return;
    if (this.fi < 0 || this.fi >= this.focus.length) { this.fi = 0; this.showFocus(); return; }
    const cur = this.focus[this.fi];
    let best = -1, bd = Infinity;
    this.focus.forEach((f, i) => {
      if (i === this.fi) return;
      const vx = f.x - cur.x, vy = f.y - cur.y, d = Math.hypot(vx, vy);
      if (d < 1) return;
      const along = (vx * dx + vy * dy) / d;
      if (along < 0.45) return;
      const score = d * (2 - along);
      if (score < bd) { bd = score; best = i; }
    });
    if (best >= 0) { this.fi = best; this.showFocus(); this.host.sfx('move', 0.3); }
  }

  /** Keyboard: true when the key was used. */
  key(code: string): boolean {
    if (this.closed) return false;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.moveFocus(-1, 0); return true;
      case 'ArrowRight': case 'KeyD': this.moveFocus(1, 0); return true;
      case 'ArrowUp': case 'KeyW': this.moveFocus(0, -1); return true;
      case 'ArrowDown': case 'KeyS': this.moveFocus(0, 1); return true;
      case 'Enter': case 'Space': case 'NumpadEnter': {
        const f = this.focus[this.fi];
        if (f) f.btn.emit('pointerup', { wasTouch: false });
        return true;
      }
      case 'Escape': this.escape(); return true;
    }
    return false;
  }

  protected escape(): void { this.close(); }

  toast(key: string, y = this.scene.scale.height - 48, x = this.scene.scale.width / 2): void {
    this.toastImg?.destroy();
    this.toastImg = labelAt(this.scene, x, y, t(key), S_TOAST);
    this.root.add(this.toastImg);
    const img = this.toastImg;
    img.setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 1200, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  protected deny(b: Phaser.GameObjects.Container, why: string): void {
    this.scene.tweens.add({ targets: b, x: b.x + 6, duration: 40, yoyo: true, repeat: 2 });
    this.host.sfx('deny', 0.4);
    this.toast(why);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
    const off = (o: Phaser.GameObjects.GameObject): void => {
      if (o.input) o.disableInteractive();
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(off);
    };
    off(this.root);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 120, onComplete: () => this.root.destroy() });
    this.onClose?.();
  }

  /** A burst of sparks at (x, y) in the screen. */
  protected sparkle(x: number, y: number, tint: number[], n = 30, paper = false): void {
    const em = this.scene.add.particles(x, y, SPARK, {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: paper ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => em.destroy());
  }
}

// ------------------------------------------------------------------ the chef choice

/** The chef for this run: five rows on a board right of the live chef; START begins the day. */
export class ChefScreen extends Panel {
  private rows: KitButton[] = [];

  constructor(scene: Phaser.Scene, host: ScreenHost, private chef: ChefId, private onPick: (c: ChefId) => void, private onDone: (c: ChefId) => void) {
    super(scene, host, { board: [CHEF_BOARD_W, CHEF_BOARD_H, CHEF_X, 400], title: t('chefTitle'), titleX: CHEF_X, titleY: 140, titleW: CHEF_BOARD_W - 50, sub: t('chefSub'), subW: CHEF_BOARD_W - 60, dim: 0.12 });
    const x = CHEF_X;
    CHEF_IDS.forEach((c, i) => {
      const y = 232 + i * (CHEF_ROW_H + 8);
      const b = new KitButton(scene, x, y, { w: CHEF_ROW_W, h: CHEF_ROW_H, kind: 'plate', color: WOOD, on: c === this.chef, sfx: null }, () => this.select(c));
      b.addContent(iconImg(scene, -CHEF_ROW_W / 2 + 46, 0, 'chef-' + c, 68));
      b.addContent(labelAt(scene, -CHEF_ROW_W / 2 + 92, -12, t('c_' + c), V_NAME, 0));
      b.addContent(fitWidth(labelAt(scene, -CHEF_ROW_W / 2 + 92, 15, t('cd_' + c), V_DESC, 0), CHEF_ROW_W - 110));
      this.root.add(b);
      this.rows.push(b);
      this.addFocus(b, x, y);
    });
    const go = new KitButton(scene, x, 652, { w: 300, h: 76, color: RED, label: t('start'), style: S_BTN, sfx: null }, () => this.finish());
    this.root.add(go);
    this.addFocus(go, x, 652);
    this.fi = this.host.touch ? -1 : CHEF_IDS.length;
    this.showFocus();
  }

  private select(c: ChefId): void {
    if (this.closed) return;
    this.chef = c;
    this.rows.forEach((b, i) => b.setSelected(CHEF_IDS[i] === c));
    this.host.sfx('pick', 0.5);
    this.onPick(c);
  }

  key(code: string): boolean {
    const n = Number(code.replace('Digit', ''));
    if (code.startsWith('Digit') && n >= 1 && n <= CHEF_IDS.length) { this.select(CHEF_IDS[n - 1]); return true; }
    return super.key(code);
  }

  protected escape(): void { this.finish(); }

  private finish(): void {
    if (this.closed) return;
    this.host.sfx('start', 0.5);
    this.close();
    this.onDone(this.chef);
  }
}

// ------------------------------------------------------------------ the day's opening card

/** Day N, its goal, today's menu (the new dishes marked) and OPEN SHOP. */
export class DayScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, day: number, goal: number, vip: boolean, coach: boolean, private onGo: () => void) {
    super(scene, host, { dim: 0.42 });
    const s = scene, cx = 640, cy = 360, top = cy - DAY_H / 2;
    const card = themeCard(s, cx, cy, DAY_W, DAY_H);
    this.root.add(card);
    this.root.add(new FmtLine(s, cx, top + 58, V_HEAD).set('dayN', { n: day }));
    const gl = new FmtLine(s, cx + 22, top + 116, V_STAT).set('goalN', { n: goal });
    this.root.add(gl);
    this.root.add(iconImg(s, cx + 22 - gl.textWidth / 2 - 28, top + 116, 'p-coin', 40));
    this.root.add(labelAt(s, cx, top + 170, t('todayMenu'), P_HEAD));
    const menu = menuOn(day);
    const per = Math.min(menu.length, 7), size = 70, gap = 84;
    menu.forEach((d, i) => {
      const row = Math.floor(i / per), col = i % per, n = Math.min(per, menu.length - row * per);
      const x = cx + (col - (n - 1) / 2) * gap, y = top + 228 + row * 86;
      const img = iconImg(s, x, y, dishIcon(d.id), size);
      this.root.add(img);
      if (d.day === day && day > 1) {
        const tag = labelAt(s, x, y + 34, t('newDish'), S_NEW);
        this.root.add(tag);
        s.tweens.add({ targets: [img], scale: img.scale * 1.12, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
    let y = top + 228 + Math.ceil(menu.length / per) * 86 - 30;
    // the new dishes' recipes: the dish = its steps
    const fresh = menu.filter((d) => d.day === day).slice(0, 2);
    for (const d of fresh) {
      const n = d.steps.length, size = 40, gap = 14;
      const w = 52 + 34 + n * (size + gap) - gap;
      const x0 = cx - w / 2;
      this.root.add(iconImg(s, x0 + 26, y, dishIcon(d.id), 52));
      this.root.add(labelAt(s, x0 + 52 + 17, y, '=', V_NAME));
      this.root.add(stepsRow(s, x0 + 86, y, d, size, gap));
      y += 54;
    }
    y += 6;
    if (coach) {
      const p = new Para(s, cx, y - 10, t('hintStart'), V_DESC_L, DAY_W - 80, 0.5, 22);
      this.root.add(p);
      y += p.textHeight;
      if (!host.touch) { const k = new Para(s, cx, y - 6, t('hintKeys'), V_DESC, DAY_W - 80, 0.5, 19); this.root.add(k); y += k.textHeight; }
    } else if (vip) {
      const p = new Para(s, cx, y - 10, t('vipToday'), V_DESC_L, DAY_W - 80, 0.5, 22);
      this.root.add(p);
    }
    const go = new KitButton(s, cx, top + DAY_H - 52, { w: 300, h: 76, color: RED, label: t('openShop'), style: S_BTN, sfx: null }, () => this.go());
    this.root.add(go);
    this.addFocus(go, cx, top + DAY_H - 52);
    this.fi = 0;
    this.showFocus();
    card.setScale(0.9);
    s.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  protected escape(): void { this.go(); }

  private go(): void {
    if (this.closed) return;
    this.host.sfx('start', 0.5);
    this.close();
    this.onGo();
  }
}

// ------------------------------------------------------------------ power cards

/** A card face for the draft: its rarity's frame, the picture, the name and what it does. */
export function cardFace(s: Phaser.Scene, x: number, y: number, id: CardId): Phaser.GameObjects.Container {
  const def = CARD[id];
  const c = s.add.container(x, y);
  c.add(s.add.image(0, 0, CARD_KEY(def.rarity)));
  c.add(labelAt(s, 0, -CARD_H / 2 + 36, t('r_' + def.rarity), V_RAR(def.rarity)));
  c.add(iconImg(s, 0, -CARD_H / 2 + 112, def.icon, 84));
  c.add(fitWidth(labelAt(s, 0, 16, t('k_' + id), V_CARD), CARD_W - 50));
  c.add(new Para(s, 0, 38, t('kd_' + id), V_CARD_D, CARD_W - 50, 0.5, 21));
  return c;
}

/** Three cards side by side, one reroll; a tap (Enter on the focused card, or 1–3) takes one. */
export class DraftScreen extends Panel {
  private faces: { c: Phaser.GameObjects.Container; id: CardId; hit: KitButton }[] = [];
  private glow: Phaser.GameObjects.Image;
  private rerolled = false;
  private picked = false;
  private reroll!: KitButton;
  private y = 370;

  constructor(scene: Phaser.Scene, host: ScreenHost, private offer: CardId[], private dealAgain: () => CardId[], private onPick: (id: CardId) => void) {
    super(scene, host, { board: [1000, 640], title: t('draftTitle'), titleY: 82, sub: t('draftSub'), dim: 0.55 });
    this.glow = scene.add.image(0, 0, CARD_GLOW).setVisible(false);
    this.root.add(this.glow);
    this.deal(false);
  }

  private deal(again: boolean): void {
    const s = this.scene, x0 = 640, y = this.y;
    for (const f of this.faces) f.c.destroy();
    this.faces = [];
    this.focus = [];
    this.offer.forEach((id, i) => {
      const x = x0 + (i - 1) * (CARD_W + 36);
      const c = cardFace(s, x, y, id);
      const hit = new KitButton(s, 0, 0, { w: CARD_W, h: CARD_H, kind: 'plate', color: WOOD, sfx: null }, () => this.take(i));
      hit.face.setAlpha(0.001);
      hit.on('pointerover', () => { this.fi = i; this.showGlow(); });
      c.add(hit);
      this.root.add(c);
      this.faces.push({ c, id, hit });
      this.addFocus(hit, x, y);
      c.setScale(0.2, 1).setAlpha(0);
      s.tweens.add({ targets: c, scaleX: 1, alpha: 1, duration: 220, delay: 80 + i * 110, ease: 'Back.easeOut' });
      if (CARD[id].rarity === 'legendary') s.time.delayedCall(300 + i * 110, () => { if (!this.closed) this.host.sfx('fanfare', 0.35); });
    });
    if (!this.reroll) {
      this.reroll = new KitButton(s, x0, y + CARD_H / 2 + 52, { w: 240, h: 70, color: WOOD, label: t('reroll'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (this.rerolled || this.picked) { this.deny(this.reroll, 'maxed'); return; }
        this.rerolled = true;
        this.offer = this.dealAgain();
        this.host.sfx('card', 0.5);
        this.reroll.setEnabled(false);
        this.deal(true);
      });
      this.root.add(this.reroll);
      if (!this.host.touch) this.root.add(labelAt(s, x0, y + CARD_H / 2 + 104, t('draftKeys'), S_KEYS));
    }
    this.addFocus(this.reroll, x0, y + CARD_H / 2 + 52);
    this.fi = this.host.touch ? -1 : 1;
    this.showGlow();
    this.host.sfx(again ? 'card' : 'deal', 0.45);
  }

  private showGlow(): void {
    const f = this.faces[this.fi];
    if (!f || this.host.touch) { this.glow.setVisible(false); return; }
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    this.root.bringToTop(this.glow);
    this.root.bringToTop(f.c);
  }

  protected showFocus(): void { super.showFocus(); this.showGlow(); }

  protected escape(): void { /* a card must be picked */ }

  key(code: string): boolean {
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { this.take(Number(code.slice(5)) - 1); return true; }
    if (code === 'KeyR') { this.reroll.emit('pointerup', { wasTouch: false }); return true; }
    return super.key(code);
  }

  take(i: number): void {
    const f = this.faces[i];
    if (!f || this.picked) return;
    this.picked = true;
    const rar = CARD[f.id].rarity;
    this.host.sfx(rar === 'legendary' || rar === 'epic' ? 'fanfare' : 'power', 0.5);
    const s = this.scene;
    this.faces.forEach((o, k) => { if (k !== i) s.tweens.add({ targets: o.c, y: o.c.y + 60, alpha: 0, duration: 260 }); });
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    s.tweens.add({ targets: [f.c, this.glow], x: 640, y: this.y, scale: 1.12, duration: 320, ease: 'Back.easeOut' });
    s.time.delayedCall(330, () => { if (!this.closed) this.sparkle(640, this.y, [RARITY_COLOR[rar].glow, 0xffffff, 0xffd23f], 40); });
    s.time.delayedCall(900, () => { this.close(); this.onPick(f.id); });
  }
}

// ------------------------------------------------------------------ the day's summary

export interface DaySummary { day: number; coins: number; goal: number; tips: number; served: number; lost: number; best: DishId | null }

/** The day's takings counted up, the best seller, then UPGRADES. */
export class SummaryScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, sum: DaySummary, private onGo: () => void) {
    super(scene, host, { dim: 0.5 });
    const s = scene, cx = 640, cy = 360, top = cy - DAY_H / 2;
    const card = themeCard(s, cx, cy, DAY_W, DAY_H);
    this.root.add(card);
    this.root.add(new FmtLine(s, cx, top + 60, V_HEAD).set('sumTitle', { n: sum.day }));
    // the takings, counting up
    this.root.add(iconImg(s, cx - 92, top + 136, 'p-coin', 60));
    const gold = new GlyphText(s, cx - 52, top + 138, '0', V_GOLD, 0);
    this.root.add(gold);
    const n = { v: 0 };
    s.tweens.add({ targets: n, v: sum.coins, duration: 900, ease: 'Cubic.easeOut', onUpdate: () => gold.setText(String(Math.round(n.v))), onComplete: () => { gold.setText(String(sum.coins)); this.sparkle(cx, top + 138, [0xf4c430, 0xe8742a, 0xc2282e], 26, true); } });
    let y = top + 206;
    for (const [k, v] of [['sumTips', sum.tips], ['sumServed', sum.served], ['sumLost', sum.lost]] as [string, number][]) {
      this.root.add(new FmtLine(s, cx - 150, y, V_STAT, 0).set(k, { n: v }));
      y += 40;
    }
    if (sum.best) {
      this.root.add(labelAt(s, cx + 170, top + 214, t('sumBest'), P_HEAD));
      this.root.add(iconImg(s, cx + 170, top + 290, dishIcon(sum.best), 104));
      this.root.add(fitWidth(labelAt(s, cx + 170, top + 352, t('d_' + sum.best), V_DESC_L), 230));
    }
    const go = new KitButton(s, cx, top + DAY_H - 56, { w: 300, h: 76, color: RED, label: t('toShop'), style: S_BTN, sfx: null }, () => this.go());
    this.root.add(go);
    this.addFocus(go, cx, top + DAY_H - 56);
    this.fi = 0;
    this.showFocus();
    card.setScale(0.9);
    s.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  protected escape(): void { this.go(); }

  private go(): void {
    if (this.closed) return;
    this.host.sfx('click', 0.5);
    this.close();
    this.onGo();
  }
}

// ------------------------------------------------------------------ the upgrades

/** Nine upgrade tiles (3 × 3) right of a column with the title, the purse and NEXT DAY. */
export class ShopScreen extends Panel {
  private purse!: GlyphText;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private day: number, private onBuy: (u: UpgradeId) => void, private onDone: () => void) {
    super(scene, host, { board: [SHOP_W, SHOP_H, 640, 404], title: t('shopTitle'), titleX: SIDE_X, titleY: 150, titleW: 320, sub: t('shopSub'), subW: SIDE_PARA, dim: 0.5 });
    const s = scene;
    this.root.add(iconImg(s, SIDE_X - 56, 330, 'p-coin', 52));
    this.purse = new GlyphText(s, SIDE_X - 22, 332, String(meta.coins), S_PURSE, 0);
    this.root.add(this.purse);
    this.build();
    const go = new KitButton(s, SIDE_X, 620, { w: 300, h: 76, color: RED, label: t('nextDay'), style: S_BTN, sfx: null }, () => this.finish());
    this.root.add(go);
    this.addFocus(go, SIDE_X, 620);
    this.fi = this.host.touch ? -1 : this.focus.length - 1;
    this.showFocus();
  }

  private build(): void {
    const s = this.scene, m = this.meta;
    const keepFi = this.fi;
    const go = this.focus.find((f) => f.btn.o.label === t('nextDay'));
    this.content.removeAll(true);
    this.focus = [];
    UPGRADE_IDS.forEach((u, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 520 + col * (UP_W + 12), y = 210 + row * (UP_H + 8);
      const c = s.add.container(x, y);
      c.add(themeCard(s, 0, 0, UP_W, UP_H));
      const L = -UP_W / 2 + 20, T = -UP_H / 2;
      c.add(iconImg(s, L + 30, T + 42, UPGRADE[u].icon, 58));
      c.add(fitWidth(labelAt(s, L + 66, T + 30, t('u_' + u), V_NAME, 0), UP_W - 100));
      // rank pips
      const r = m.ranks[u];
      const g = s.add.graphics();
      for (let k = 0; k < MAX_RANK; k++) {
        const px = L + 74 + k * 22, py = T + 58;
        g.fillStyle(k < r ? 0xc2282e : 0xe8d8c0, 1).fillCircle(px, py, 7).lineStyle(2, 0x5a3420, 1).strokeCircle(px, py, 7);
      }
      c.add(g);
      const locked = UPGRADE_DAY[u] > this.day + 1;
      const price = nextPrice(m, u);
      if (price === null) {
        c.add(new Para(s, L, T + 76, t(`u_${u}_${MAX_RANK}`), V_RANK, UP_W - 34, 0, 19));
        c.add(labelAt(s, 0, UP_H / 2 - 32, t('maxed'), V_TAG));
      } else {
        c.add(new Para(s, L, T + 76, t(`u_${u}_${r + 1}`), V_DESC, UP_W - 34, 0, 19));
        if (locked) {
          c.add(iconImg(s, -46, UP_H / 2 - 32, 'p-lock', 30));
          c.add(new FmtLine(s, -26, UP_H / 2 - 32, V_LOCK, 0).set('fromDay', { n: UPGRADE_DAY[u] }));
        } else {
          const afford = price <= m.coins;
          const b = new KitButton(s, 0, UP_H / 2 - 34, { w: 124, h: 50, color: GREEN, tapWhenOff: true, sfx: null }, () => {
            if (!b.enabled) { this.deny(b, 'poor'); return; }
            if (buy(m, u)) {
              this.host.sfx('buy', 0.6);
              this.onBuy(u);
              this.sparkle(x, y, [0xf4c430, 0xe8742a, 0xff8fb4], 30, true);
              this.toast('bought', 700, 830);
              this.purse.setText(String(m.coins));
              const at = this.focus.findIndex((f) => f.btn === b);
              this.fi = at;
              this.build();
            }
          });
          const coin = iconImg(s, -36, 0, 'p-coin', 26), num = new GlyphText(s, -18, 1, String(price), S_PRICE, 0);
          b.addContent(coin, num);
          b.setEnabled(afford);
          if (!afford) { coin.setAlpha(0.55); num.setAlpha(0.55); }
          c.add(b);
          this.addFocus(b, x, y + UP_H / 2 - 34);
        }
      }
      this.content.add(c);
    });
    if (go) this.focus.push(go);
    this.fi = keepFi;
    this.showFocus();
  }

  protected escape(): void { this.finish(); }

  private finish(): void {
    if (this.closed) return;
    this.host.sfx('start', 0.5);
    this.close();
    this.onDone();
  }
}

// ------------------------------------------------------------------ recipes and the card list

/** A recipe's steps as icons with arrows, ending in the dish. */
function stepsRow(s: Phaser.Scene, x: number, y: number, d: DishDef, size: number, gap: number): Phaser.GameObjects.Container {
  const c = s.add.container(x, y);
  let px = 0;
  d.steps.forEach((st, i) => {
    if (i) { c.add(labelAt(s, px - gap / 2 + 2, 0, '+', V_NAME)); }
    c.add(iconImg(s, px + size / 2, 0, stepIcon(st), size));
    px += size + gap;
  });
  return c;
}

/** Every dish: picture, name, the day it joins the menu, its steps. */
export class RecipeScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, day = 99) {
    super(scene, host, { board: [BOARD_W, BOARD_H], title: t('recipesTitle'), titleY: 66, sub: t('recipesSub'), dim: 0.62 });
    const s = scene;
    DISHES.forEach((d, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 640 + (col - 1.5) * (REC_W + 8), y = 196 + row * (REC_H + 8);
      const c = s.add.container(x, y);
      c.add(themeCard(s, 0, 0, REC_W, REC_H));
      const L = -REC_W / 2 + 14, T = -REC_H / 2;
      const img = iconImg(s, L + 40, 0, dishIcon(d.id), 76);
      c.add(img);
      c.add(fitWidth(labelAt(s, L + 88, T + 28, t('d_' + d.id), V_NAME, 0), REC_W - 110));
      const n = d.steps.length, room = REC_W - 88 - 26;
      c.add(stepsRow(s, L + 88, T + 70, d, Math.min(34, Math.floor(room / n) - 12), 12));
      c.add(new FmtLine(s, REC_W / 2 - 16, T + REC_H - 18, V_LOCK, 1).set('fromDayShort', { n: d.day }));
      if (d.day > day) { img.setAlpha(0.45); }
      this.content.add(c);
    });
    const close = new KitButton(s, 640, 690 - 14, { w: 240, h: 70, color: WOOD, label: t('close'), style: S_BTN_S }, () => this.close());
    void close;
    this.root.add(close);
    this.addFocus(close, 640, 676);
    this.fi = 0;
    this.showFocus();
  }
}

/** All the power cards, twelve to a page. */
export class CardListScreen extends Panel {
  private page = 0;

  constructor(scene: Phaser.Scene, host: ScreenHost) {
    super(scene, host, { board: [BOARD_W, BOARD_H], title: t('cardsTitle'), titleY: 66, sub: t('cardsSub'), dim: 0.62 });
    this.show();
  }

  private show(): void {
    const s = this.scene;
    this.content.removeAll(true);
    this.focus = [];
    CARDS.slice(this.page * 12, this.page * 12 + 12).forEach((card, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 640 + (col - 1.5) * (CT_W + 8), y = 210 + row * (CT_H + 8);
      const c = s.add.container(x, y);
      c.add(themeCard(s, 0, 0, CT_W, CT_H));
      const L = -CT_W / 2 + 14, T = -CT_H / 2;
      const g = s.add.graphics();
      const col2 = RARITY_COLOR[card.rarity];
      g.fillStyle(col2.glow, 0.5).fillCircle(L + 30, T + 40, 28).lineStyle(3, col2.frame, 1).strokeCircle(L + 30, T + 40, 28);
      c.add(g);
      c.add(iconImg(s, L + 30, T + 40, card.icon, 46));
      c.add(fitWidth(labelAt(s, L + 68, T + 30, t('k_' + card.id), V_NAME, 0), CT_W - 92));
      c.add(labelAt(s, L + 68, T + 54, t('r_' + card.rarity), V_RAR(card.rarity), 0));
      c.add(new Para(s, L, T + 80, t('kd_' + card.id), V_DESC, CT_W - 30, 0, 18));
      this.content.add(c);
    });
    const pages = Math.ceil(CARDS.length / 12);
    const prev = new KitButton(s, 450, 676, { w: 80, h: 64, color: WOOD, label: '‹', style: S_BTN }, () => this.flip(-1));
    const close = new KitButton(s, 640, 676, { w: 240, h: 70, color: WOOD, label: t('close'), style: S_BTN_S }, () => this.close());
    const next = new KitButton(s, 830, 676, { w: 80, h: 64, color: WOOD, label: '›', style: S_BTN }, () => this.flip(1));
    prev.setVisible(this.page > 0);
    next.setVisible(this.page < pages - 1);
    this.content.add([prev, close, next]);
    if (this.page > 0) this.addFocus(prev, 450, 676);
    this.addFocus(close, 640, 676);
    if (this.page < pages - 1) this.addFocus(next, 830, 676);
    this.fi = this.focus.findIndex((f) => f.btn === close);
    this.showFocus();
  }

  private flip(d: number): void {
    const pages = Math.ceil(CARDS.length / 12);
    const p = Math.max(0, Math.min(pages - 1, this.page + d));
    if (p === this.page) return;
    this.page = p;
    this.host.sfx('card', 0.4);
    this.show();
  }

  key(code: string): boolean {
    if (code === 'KeyQ' || code === 'PageUp') { this.flip(-1); return true; }
    if (code === 'KeyE' || code === 'PageDown' || code === 'Tab') { this.flip(1); return true; }
    return super.key(code);
  }
}

// ------------------------------------------------------------------ beside the pause

/** Added to the Pause scene as it opens: the run's cards on the left, today's recipes on the right. */
export function pauseSides(scene: Phaser.Scene, cards: CardId[], day: number): void {
  // on a desktop the pause draws the keys in a strip along the bottom: the sides end above it
  const keys = keyHelpShown(scene);
  const PH = keys ? PSIDE_KEYS_H : PSIDE_H;
  const top = 82, y = top + PH / 2;
  const root = scene.add.container(0, 0).setDepth(5);
  const lx = 196, rx = 1084;
  root.add(themeCard(scene, lx, y, PSIDE_W, PH));
  root.add(labelAt(scene, lx, top + 34, t('yourCards'), P_HEAD));
  if (!cards.length) root.add(new Para(scene, lx, top + 64, t('noCards'), P_NAME, PSIDE_W - 50, 0.5, 21));
  const rowH = Math.min(cards.length > 10 ? 40 : 48, Math.floor((PH - 110) / Math.max(1, Math.min(12, cards.length) - 1)));
  cards.slice(0, 12).forEach((id, i) => {
    const x = lx - PSIDE_W / 2 + 44, yy = top + 80 + i * rowH;
    const def = CARD[id];
    const g = scene.add.graphics();
    g.fillStyle(RARITY_COLOR[def.rarity].glow, 0.55).fillCircle(x, yy, 18).lineStyle(2, RARITY_COLOR[def.rarity].frame, 1).strokeCircle(x, yy, 18);
    root.add(g);
    root.add(iconImg(scene, x, yy, def.icon, 30));
    root.add(fitWidth(labelAt(scene, x + 28, yy, t('k_' + id), P_NAME, 0), PSIDE_W - 96));
  });
  root.add(themeCard(scene, rx, y, PSIDE_W, PH));
  root.add(labelAt(scene, rx, top + 34, t('todayMenu'), P_HEAD));
  const menu = menuOn(day);
  const step = Math.min(58, (PH - 84) / Math.max(1, menu.length));
  menu.forEach((d, i) => {
    const yy = top + 86 + i * step;
    const x = rx - PSIDE_W / 2 + 36;
    root.add(iconImg(scene, x, yy, dishIcon(d.id), Math.min(58, step + 4)));
    const room = PSIDE_W - 42 - 64;
    root.add(stepsRow(scene, x + 42, yy, d, Math.min(46, step - 2, Math.floor(room / d.steps.length) - 8), 8));
  });
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
}

export { STATION_IDS, INDIGO, GOLDC };
