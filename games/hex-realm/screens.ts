// Hex Realm: the inner screens, in the menu theme (menu.ts): a slate board with a gilt frame, the
// tabs and buttons carved stone (the main ones royal-blue enamel, leaving crimson), the wares,
// quests and talents on illuminated vellum cards.
//   - The village: the INN (rest and save, change class, end the day, New Game+), the MARKET
//     (potions, a potion belt, the trader's four pieces), the SMITHY (upgrade what you wear to +5)
//     and the QUEST board.
//   - The hero: GEAR (stats, what is worn, the bag of twelve with a detail card: equip or sell) and
//     TALENTS (eight talents with ranks).
//   - Class select (the live 3D hero shows above the board), the world map, the battle's spoils.
// Touch: tap a tile, a tab or a button. Keyboard: arrows move the focus, Enter presses, Tab and
// Q/E switch tabs, Esc closes. Everything they show is painted under the Ayvago intro
// (`prebakeScreens`, from the menu theme's prebake): opening a screen only places images.
import Phaser from 'phaser';
import {
  t, getLang, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import {
  CLASS, CLASS_IDS, QUEST, QUEST_IDS, TALENT_IDS, TALENT_MAX, TIERS, TRINKETS, RARITIES, STATS, PCT_STATS, SLOTS, MAX_UP, POWER_IDS,
  tierOf, upgradeCost, itemValue, xpToNext, PLACE_IDS,
  type ClassId, type Item, type Rarity, type Stat, type TalentId, type Slot, type QuestId,
} from './defs';
import { Campaign, itemStats, BAG_MAX, POTION_PRICE, type Spoils } from './campaign';
import { icon, itemIcon, makeArt } from './art';
import { COLS, ROWS, PLACE_HEX, CAMPS, BRIDGE, type HexMap } from './hexmap';
import {
  TILE_W, TILE_H, WARE_H, ROW_W, ROW_H, QUEST_H, GEAR_W, GEAR_H, SLOT_W, SLOT_H, DETAIL_H, CLASS_W, CLASS_H, STATS_H, TUT_W, TUT_H, HINT_H, LOOT_ROW_H,
  SUMMARY_W, SUMMARY_H,
} from './sizes';

export const OVERLAY_DEPTH = 9600;
const INK = '#1a1420';
const BLUE = 0x2c4a9a, STONE = 0x6c6a74, CRIMSON = 0x8a1c2a, MOSS = 0x2e6a3a, GOLDC = 0xb8861a;

/** Every card size the screens use (declared in the theme, painted ahead). */
export const SCREEN_CARDS = [
  { w: TILE_W, h: TILE_H }, { w: TILE_W, h: WARE_H }, { w: ROW_W, h: ROW_H }, { w: ROW_W, h: QUEST_H }, { w: GEAR_W, h: GEAR_H }, { w: SLOT_W, h: SLOT_H },
  { w: ROW_W, h: DETAIL_H }, { w: CLASS_W, h: CLASS_H }, { w: ROW_W, h: STATS_H }, { w: TUT_W, h: TUT_H }, { w: TUT_W, h: HINT_H }, { w: ROW_W, h: LOOT_ROW_H },
  { w: 680, h: 1150 }, { w: SUMMARY_W, h: SUMMARY_H },
];

const BOARD_W = 690, BOARD_H = 1110;
/** The spoils' board heights (the smallest that fits is used). */
const LOOT_BOARDS = [520, 660, 800, 940, 1080];

// ------------------------------------------------------------------ styles (shared with the prebake)

export const S_TITLE: LabelStyle = { size: 52, fill: ['#fffbe0', '#ffd86a', '#c8901c'], stroke: INK, strokeWidth: 8 };
export const S_SUB: LabelStyle = { size: 20, color: '#e8e0d0', stroke: INK, strokeWidth: 3, body: true };
const S_TAB: LabelStyle = { size: 26 };
const S_BTN: LabelStyle = { size: 28 };
const S_BTN_S: LabelStyle = { size: 22 };
const S_PURSE: LabelStyle = { size: 28, color: '#ffe08a', stroke: INK, strokeWidth: 5 };
const S_INFO: LabelStyle = { size: 22, color: '#e8e0f0', stroke: INK, strokeWidth: 4 };
const V_NAME: LabelStyle = { size: 23, color: '#2a1e14', stroke: null, shadow: false };
const V_BIG: LabelStyle = { size: 30, color: '#2a1e14', stroke: null, shadow: false };
const V_DESC: LabelStyle = { size: 16, color: '#4a3424', stroke: null, shadow: false, body: true };
const V_STAT: LabelStyle = { size: 17, color: '#1f4a8a', stroke: null, shadow: false, body: true };
const V_UP: LabelStyle = { size: 17, color: '#2e6a2a', stroke: null, shadow: false, body: true };
const V_PRICE: LabelStyle = { size: 24, color: '#7a4a10', stroke: null, shadow: false };
const V_POOR: LabelStyle = { size: 24, color: '#9a8a7a', stroke: null, shadow: false };
const V_TAG: LabelStyle = { size: 18, color: '#2e6a2a', stroke: null, shadow: false };
const V_WORSE: LabelStyle = { size: 18, color: '#9a2a2a', stroke: null, shadow: false };
const V_STATE: Record<string, LabelStyle> = {
  open: { size: 20, color: '#1f4a8a', stroke: null, shadow: false },
  done: { size: 20, color: '#2e6a2a', stroke: null, shadow: false },
  locked: { size: 20, color: '#8a7a6a', stroke: null, shadow: false },
};
const RARITY_INK: Record<Rarity, string> = { common: '#6a6050', uncommon: '#2e7a2a', rare: '#1f5aa8', epic: '#7a2aa8', legendary: '#b8620a' };
const V_RARITY = (r: Rarity): LabelStyle => ({ size: 15, color: RARITY_INK[r], stroke: null, shadow: false, body: true });
const S_TOAST: LabelStyle = { size: 26, color: '#fff2cc', stroke: INK, strokeWidth: 5 };
const S_KEYS: LabelStyle = { size: 17, color: '#cfc6dc', stroke: INK, strokeWidth: 3, body: true };
const S_GOLD_LINE: LabelStyle = { size: 30, color: '#ffe08a', stroke: INK, strokeWidth: 5 };
const S_XP_LINE: LabelStyle = { size: 30, color: '#bfe8ff', stroke: INK, strokeWidth: 5 };
const S_GREEN_LINE: LabelStyle = { size: 26, color: '#a8ff9a', stroke: INK, strokeWidth: 5 };
const S_MAP_PLACE: LabelStyle = { size: 15, color: '#2a1e14', stroke: '#f4e8c8', strokeWidth: 4, shadow: false };
const S_CLASS: LabelStyle = { size: 22, color: '#2a1e14', stroke: null, shadow: false };
/** Place names floating over the 3D map. */
export const S_MAP_TAG: LabelStyle = { size: 21, color: '#fff2cc', stroke: '#1a1420', strokeWidth: 5 };
const S_CLASS_BIG: LabelStyle = { size: 40, fill: ['#fffbe0', '#ffd86a', '#c8901c'], stroke: INK, strokeWidth: 7 };

const fmtNum = (v: number): string => {
  const s = Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
  return getLang() === 'tr' ? s.replace('.', ',') : s;
};

/** An item's display name (tier and kind). */
export function itemName(it: Item, cls: ClassId): string {
  const noun = it.slot === 'weapon' ? t('w_' + cls) : it.slot === 'armor' ? t('i_armor') : t('i_' + (it.kind ?? 'ring'));
  return t('t_' + tierOf(it.ilvl)) + ' ' + noun;
}

/** The stat lines of an item (main stats first). */
function statLines(it: Item): [Stat, number][] {
  const st = itemStats(it);
  return STATS.filter((s) => st[s] !== undefined).map((s) => [s, st[s]!] as [Stat, number]);
}

// ------------------------------------------------------------------ the prebake

/** Paints, in the current language, everything the inner screens show (Boot, under the intro). */
/** A soft spark for the screens' bursts (painted in the prebake). */
const SPARK = 'hr-spark';

export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  bake(scene, SPARK, 20, 20, (c) => { const g = c.createRadialGradient(10, 10, 0, 10, 10, 10); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 20, 20); });
  skinTexture(scene, 'board', BOARD_W, BOARD_H);
  skinTexture(scene, 'board', BOARD_W, 690);
  for (const c of SCREEN_CARDS) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['v_inn', 'v_market', 'v_smith', 'v_quests', 'tabGear', 'tabTalents']) labelTexture(scene, t(k), S_TAB);
  for (const k of ['innTitle', 'marketTitle', 'smithTitle', 'questsTitle', 'heroTitle', 'chooseTitle', 'mapTitle', 'lootTitle', 'victory', 'levelUp']) labelTexture(scene, t(k), S_TITLE);
  for (const k of ['innSub', 'marketSub', 'smithSub', 'questsSub', 'chooseSub', 'lootSub', 'lootNone']) bakePara(scene, t(k), S_SUB, 620);
  bakeButton(scene, 'button', 152, 60, STONE, false, true);
  bakeButton(scene, 'button', 152, 60, BLUE, false, true);
  bakeButton(scene, 'button', 300, 80, CRIMSON);
  bakeButton(scene, 'button', 300, 80, BLUE);
  bakeButton(scene, 'button', 132, 54, BLUE, true);
  bakeButton(scene, 'button', 132, 54, MOSS, true);
  bakeButton(scene, 'button', 132, 54, CRIMSON, true);
  bakeButton(scene, 'button', 200, 64, BLUE, true);
  bakeButton(scene, 'button', 200, 64, CRIMSON, true);
  bakeButton(scene, 'button', 200, 64, MOSS, true);
  bakeButton(scene, 'button', 200, 64, STONE, true);
  bakeButton(scene, 'round', 64, 64, BLUE, true);
  bakeButton(scene, 'button', 132, 54, GOLDC, true);
  bakeButton(scene, 'plate', SLOT_W, SLOT_H, STONE);
  bakeButton(scene, 'plate', CLASS_W, CLASS_H, BLUE, false, true);
  bakeButton(scene, 'plate', CLASS_W, CLASS_H, STONE, false, true);
  for (const h of LOOT_BOARDS) skinTexture(scene, 'board', BOARD_W, h);
  labelTexture(scene, t('classBtn'), S_BTN_S);
  for (const k of ['leave', 'close', 'buy', 'sell', 'equip', 'upgrade', 'rest', 'endDay', 'ngPlus', 'choose', 'onward', 'tapContinue', 'full', 'maxed']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['restSub', 'endDaySub', 'ngPlusSub', 'potionSub', 'beltSub']) labelTexture(scene, t(k), V_DESC);
  for (const k of ['potion', 'belt']) labelTexture(scene, t(k), V_NAME);
  for (const k of ['maxed', 'full', 'better', 'worse', 'learnt']) { labelTexture(scene, t(k), V_TAG); labelTexture(scene, t(k), V_WORSE); }
  for (const k of ['poor', 'bagFull', 'bought', 'equipped', 'upgraded', 'rested', 'cantRest', 'maxed', 'noPoints', 'full']) labelTexture(scene, t(k), S_TOAST);
  bakeFmt(scene, 'soldFor', ['n'], S_TOAST);
  for (const o of [S_PURSE, V_PRICE, V_POOR, S_INFO, V_NAME, V_BIG, S_GOLD_LINE, S_XP_LINE, V_STAT, V_UP]) glyphAtlas(scene, o);
  for (const k of ['heroLevel', 'pointsN', 'bagN']) bakeFmt(scene, k, k === 'bagN' ? ['n', 'of'] : ['n'], S_INFO);
  // the item names, rarities and stat lines
  const nouns = [...CLASS_IDS.map((c) => 'w_' + c), 'i_armor', ...TRINKETS.map((k) => 'i_' + k)];
  for (const tier of TIERS) for (const n of nouns) labelTexture(scene, t('t_' + tier) + ' ' + t(n), V_NAME);
  for (const r of RARITIES) labelTexture(scene, t('r_' + r), V_RARITY(r));
  for (const s of STATS) { bakeFmt(scene, 'st_' + s, ['n'], V_STAT); bakeFmt(scene, 'st_' + s, ['n'], V_UP); }
  for (const s of SLOTS) labelTexture(scene, t('slot_' + s), V_DESC);
  labelTexture(scene, t('empty'), V_DESC);
  // the stats strip
  for (const k of ['statHp', 'statAtk', 'statDef', 'statCrit', 'statCdr', 'statSpeed']) labelTexture(scene, t(k), V_DESC);
  // talents
  for (const id of TALENT_IDS) {
    if (id !== 'skill1' && id !== 'skill2') { labelTexture(scene, t('tl_' + id), V_NAME); labelTexture(scene, t('tld_' + id), V_DESC); }
  }
  labelTexture(scene, t('tld_skill'), V_DESC);
  // classes and skills
  for (const c of CLASS_IDS) {
    labelTexture(scene, t('c_' + c), S_CLASS);
    labelTexture(scene, t('c_' + c), S_CLASS_BIG);
    bakePara(scene, t('cd_' + c), S_SUB, 600);
    for (const sk of CLASS[c].skills) { labelTexture(scene, t('sk_' + sk.id), V_NAME); labelTexture(scene, t('sk_' + sk.id), S_INFO); bakePara(scene, t('skd_' + sk.id), V_DESC, 250); }
  }
  // quests
  for (const q of QUEST_IDS) { labelTexture(scene, t('q_' + q), V_NAME); bakePara(scene, t('qd_' + q), V_DESC, 470); }
  for (const s of ['open', 'done', 'locked']) labelTexture(scene, t('quest' + s[0].toUpperCase() + s.slice(1)), V_STATE[s]);
  bakeFmt(scene, 'questReward', ['n'], V_STAT);
  // the map
  for (const p of PLACE_IDS) { labelTexture(scene, t('p_' + p), S_MAP_PLACE); labelTexture(scene, t('p_' + p), S_MAP_TAG); }
  for (const k of ['p_camp', 'p_bridge']) labelTexture(scene, t(k), S_MAP_PLACE);
  labelTexture(scene, t('tracked'), V_DESC);
  // the spoils
  for (const k of ['goldN', 'xpN']) bakeFmt(scene, k, ['n'], k === 'goldN' ? S_GOLD_LINE : S_XP_LINE);
  bakeFmt(scene, 'levelUpSub', ['n'], S_GREEN_LINE);
  for (const q of QUEST_IDS) labelTexture(scene, t('questDoneN', { name: t('q_' + q) }), S_GREEN_LINE);
  for (const k of ['staffFound', 'beltUp']) labelTexture(scene, t(k), S_GREEN_LINE);
  bakeFmt(scene, 'soldN', ['n'], S_SUB);
  labelTexture(scene, t('screenKeys'), S_KEYS);
  void POWER_IDS;
}

// ------------------------------------------------------------------ the panel frame

export interface ScreenHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
  /** The campaign changed (gold, gear, level …): the HUD follows. */
  changed(): void;
}

interface Focusable { btn: KitButton; x: number; y: number }

/**
 * An overlay screen: a dim layer, an optional slate board with a title and tabs, content that is
 * rebuilt when something changes, keyboard focus over its buttons, short painted toasts.
 */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected content!: Phaser.GameObjects.Container;
  protected focus: Focusable[] = [];
  protected fi = -1;
  protected tabs: KitButton[] = [];
  protected tab = 0;
  private toastImg: Phaser.GameObjects.Image | Phaser.GameObjects.Container | null = null;
  closed = false;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: number; title?: string; sub?: string; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x06040c, o.dim ?? 0.66).setOrigin(0).setInteractive();
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(width / 2, 95 + o.board / 2 + SKIN_PAD / 2, skinTexture(scene, 'board', BOARD_W, o.board)));
    if (o.title) this.root.add(fitWidth(labelAt(scene, width / 2, 148, o.title, S_TITLE), 600));
    if (o.sub) this.root.add(new Para(scene, width / 2, 182, o.sub, S_SUB, 620, 0.5, 24));
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    // Esc closes the screen instead of pausing the round
    this.release = pushModal(scene);
  }

  private release: () => void;

  /** Tab buttons in a row at y. */
  protected makeTabs(keys: string[], y: number, onTab: (i: number) => void): void {
    const n = keys.length, w = 152, gap = 8;
    keys.forEach((k, i) => {
      const x = this.scene.scale.width / 2 + (i - (n - 1) / 2) * (w + gap);
      const b = new KitButton(this.scene, x, y, { w, h: 60, color: i === this.tab ? BLUE : STONE, on: i === this.tab, label: t(k), style: S_TAB, sfx: 'ui-click' }, () => { this.tab = i; this.refreshTabs(); onTab(i); });
      this.root.add(b);
      this.tabs.push(b);
    });
  }

  protected refreshTabs(): void { this.tabs.forEach((b, i) => b.setLook(i === this.tab ? BLUE : STONE, i === this.tab)); }

  /** Clears the content and the focus list (keeps the focused index when it still exists). */
  protected clear(): void {
    this.content.removeAll(true);
    this.focus = [];
  }

  protected addFocus(btn: KitButton, x: number, y: number): KitButton {
    this.focus.push({ btn, x, y });
    return btn;
  }

  /** Shows the keyboard focus on a button (its hover face). */
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
      case 'Enter': case 'Space': {
        const f = this.focus[this.fi];
        if (f) f.btn.emit('pointerup', { wasTouch: false });
        return true;
      }
      case 'Tab': case 'KeyE': case 'KeyQ':
        if (this.tabs.length) { this.tab = (this.tab + (code === 'KeyQ' ? this.tabs.length - 1 : 1)) % this.tabs.length; this.tabs[this.tab].emit('pointerup', { wasTouch: false }); this.fi = -1; }
        return true;
      case 'Escape': this.close(); return true;
    }
    return false;
  }

  /** A short painted message over the bottom of the board. */
  toast(key: string, vars?: Record<string, number>): void {
    this.toastImg?.destroy();
    const { width } = this.scene.scale;
    const y = 1078;
    this.toastImg = vars ? new FmtLine(this.scene, width / 2, y, S_TOAST).set(key, vars) : labelAt(this.scene, width / 2, y, t(key), S_TOAST);
    this.root.add(this.toastImg);
    const img = this.toastImg;
    img.setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 1300, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  /** A shake of a button that cannot be used now, and why. */
  protected deny(b: KitButton, why: string): void {
    this.scene.tweens.add({ targets: b, x: b.x + 6, duration: 40, yoyo: true, repeat: 2 });
    this.host.sfx('error', 0.35);
    this.toast(why);
  }

  protected onClose: (() => void) | null = null;

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 120, onComplete: () => this.root.destroy() });
    this.onClose?.();
  }

  /** The LEAVE / CLOSE button at the board's foot. */
  protected leaveButton(label = 'leave', y = 1150): KitButton {
    const b = new KitButton(this.scene, this.scene.scale.width / 2, y, { w: 300, h: 80, color: CRIMSON, label: t(label), style: S_BTN }, () => this.close());
    this.root.add(b);
    return b;
  }

  // ------------------------------------------------------------------ shared pieces

  /** An item card: icon, name, rarity, stat lines; an optional price and button, a comparison tag. */
  protected itemCard(x: number, y: number, w: number, h: number, it: Item, cls: ClassId, o: { tag?: 'better' | 'worse' | null; price?: number; afford?: boolean; button?: { label: string; color: number; enabled: boolean; onTap: () => void; why?: string }; lines?: number; next?: boolean } = {}): Phaser.GameObjects.Container {
    const s = this.scene;
    const c = s.add.container(x, y);
    c.add(themeCard(s, 0, 0, w, h));
    const left = -w / 2 + 22;
    // the icon on a rarity-coloured disc
    const g = s.add.graphics();
    const col = Phaser.Display.Color.HexStringToColor(RARITY_INK[it.rarity]).color;
    g.fillStyle(col, 0.22).fillCircle(left + 30, -h / 2 + 46, 30);
    g.lineStyle(3, col, 1).strokeCircle(left + 30, -h / 2 + 46, 30);
    c.add(g);
    c.add(s.add.image(left + 30, -h / 2 + 46, itemIcon(it.slot, it.kind, cls)).setDisplaySize(48, 48));
    const name = labelAt(s, left + 70, -h / 2 + 32, itemName(it, cls), V_NAME, 0);
    fitWidth(name, w - 120 - (it.up ? 40 : 0));
    c.add(name);
    if (it.up) c.add(new GlyphText(s, left + 74 + name.displayWidth - 10, -h / 2 + 32, '+' + it.up, V_PRICE, 0));
    c.add(labelAt(s, left + 70, -h / 2 + 58, t('r_' + it.rarity), V_RARITY(it.rarity), 0));
    const lines = statLines(it).slice(0, o.lines ?? 3);
    // stat lines under the name on a tall card, in a second column on a short one
    const under = h >= 140;
    lines.forEach(([st, v], i) => {
      const lx = under ? left + 6 : left + 300, ly = under ? -h / 2 + 92 + i * 20 : -h / 2 + 28 + i * 21;
      c.add(new FmtLine(s, lx, ly, V_STAT, 0).set('st_' + st, { n: fmtNum(v) }));
    });
    if (o.tag) c.add(labelAt(s, w / 2 - 26, under ? -h / 2 + 58 : h / 2 - 24, t(o.tag), o.tag === 'better' ? V_TAG : V_WORSE, 1));
    if (o.price !== undefined) {
      const py = o.button ? h / 2 - 72 : h / 2 - 26;
      c.add(s.add.image(w / 2 - 92, py, icon('coin')).setDisplaySize(26, 26));
      c.add(new GlyphText(s, w / 2 - 74, py, String(o.price), o.afford === false ? V_POOR : V_PRICE, 0));
    }
    if (o.button) {
      const bt = o.button;
      const b = new KitButton(s, w / 2 - 78, h / 2 - 34, { w: 132, h: 54, color: bt.color, label: bt.label, style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, bt.why ?? 'poor'); return; }
        bt.onTap();
      });
      b.setEnabled(bt.enabled);
      c.add(b);
      this.addFocus(b, x + w / 2 - 78, y + h / 2 - 34);
    }
    return c;
  }

  /** The purse and potions line. */
  protected purse(camp: Campaign, y: number): void {
    const s = this.scene, { width } = s.scale;
    this.content.add(s.add.image(width / 2 - 250, y, icon('coin')).setDisplaySize(34, 34));
    this.content.add(new GlyphText(s, width / 2 - 228, y, String(camp.s.gold), S_PURSE, 0));
    this.content.add(s.add.image(width / 2 + 40, y, icon('potion')).setDisplaySize(36, 36));
    this.content.add(new GlyphText(s, width / 2 + 62, y, `${camp.s.potions}/${camp.s.potionMax}`, S_PURSE, 0));
    this.content.add(s.add.image(width / 2 + 180, y, icon('heart')).setDisplaySize(32, 32));
    this.content.add(new GlyphText(s, width / 2 + 202, y, `${Math.round(camp.s.hp)}/${camp.maxHp}`, S_PURSE, 0));
  }
}

// ------------------------------------------------------------------ the village

export class VillageScreen extends Panel {
  constructor(scene: Phaser.Scene, private camp: Campaign, host: ScreenHost, private act: { endDay: () => void; newGamePlus: () => void; chooseClass: () => void }, onClose: () => void, start = 0) {
    super(scene, host, { board: BOARD_H, title: t('innTitle') });
    this.onClose = onClose;
    this.tab = start;
    this.titleImg = this.root.list[2] as Phaser.GameObjects.Image;
    this.makeTabs(['v_inn', 'v_market', 'v_smith', 'v_quests'], 236, () => this.build());
    this.root.add(labelAt(scene, scene.scale.width / 2, 1218, t('screenKeys'), S_KEYS));
    this.leaveButton();
    this.build();
  }

  private titleImg: Phaser.GameObjects.Image;

  private build(): void {
    this.clear();
    const titles = ['innTitle', 'marketTitle', 'smithTitle', 'questsTitle'];
    const subs = ['innSub', 'marketSub', 'smithSub', 'questsSub'];
    this.titleImg.destroy();
    this.titleImg = fitWidth(labelAt(this.scene, this.scene.scale.width / 2, 148, t(titles[this.tab]), S_TITLE), 600);
    this.root.addAt(this.titleImg, 2);
    this.content.add(new Para(this.scene, this.scene.scale.width / 2, 176, t(subs[this.tab]), S_SUB, 620, 0.5, 24));
    this.purse(this.camp, 306);
    [this.inn, this.market, this.smith, this.quests][this.tab].call(this);
    if (this.fi >= this.focus.length) this.fi = this.focus.length - 1;
    this.showFocus();
  }

  /** A full-width action row: title, a line under it, a button. */
  private actionRow(y: number, title: string, sub: string, btn: { label: string; color: number; enabled: boolean; why?: string; onTap: () => void }, ic?: string): void {
    const s = this.scene, x = s.scale.width / 2;
    const c = s.add.container(x, y);
    c.add(themeCard(s, 0, 0, ROW_W, ROW_H));
    if (ic) c.add(s.add.image(-ROW_W / 2 + 56, 0, ic).setDisplaySize(64, 64));
    const lx = -ROW_W / 2 + (ic ? 100 : 30);
    c.add(fitWidth(labelAt(s, lx, -16, title, V_BIG, 0), 300));
    c.add(fitWidth(labelAt(s, lx, 22, sub, V_DESC, 0), 300));
    const b = new KitButton(s, ROW_W / 2 - 120, 0, { w: 200, h: 64, color: btn.color, label: btn.label, style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
      if (!b.enabled) { this.deny(b, btn.why ?? 'poor'); return; }
      btn.onTap();
    });
    b.setEnabled(btn.enabled);
    c.add(b);
    this.content.add(c);
    this.addFocus(b, x + ROW_W / 2 - 120, y);
  }

  private inn(): void {
    const c = this.camp;
    this.actionRow(410, t('rest'), t('restSub'), { label: t('rest'), color: BLUE, enabled: true, onTap: () => {
      const hurt = c.s.hp < c.maxHp;
      c.rest(); c.save(); this.host.sfx(hurt ? 'heal' : 'move', 0.5); this.host.changed(); this.build(); this.toast(hurt ? 'rested' : 'cantRest');
    } }, icon('heart'));
    this.actionRow(560, t('c_' + c.s.cls), t('cd_' + c.s.cls), { label: t('classBtn'), color: STONE, enabled: true, onTap: () => { this.host.sfx('move', 0.4); this.act.chooseClass(); } }, icon('sk-' + CLASS[c.s.cls].skills[0].id));
    this.actionRow(710, t('endDay'), t('endDaySub'), { label: t('endDay'), color: CRIMSON, enabled: true, onTap: () => this.act.endDay() }, icon('marker'));
    if (c.s.victory) this.actionRow(860, t('ngPlus'), t('ngPlusSub'), { label: t('ngPlus'), color: MOSS, enabled: true, onTap: () => { this.act.newGamePlus(); this.build(); } }, icon('skull'));
  }

  private market(): void {
    const c = this.camp, s = this.scene, x0 = s.scale.width / 2;
    // potion and belt
    const small = (x: number, y: number, name: string, sub: string, price: number | null, ic: string, enabled: boolean, why: string, onTap: () => void) => {
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, TILE_W, TILE_H));
      box.add(s.add.image(-TILE_W / 2 + 50, -18, ic).setDisplaySize(60, 60));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 92, -40, name, V_NAME, 0), 200));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 92, -12, sub, V_DESC, 0), 200));
      if (price !== null) {
        box.add(s.add.image(-TILE_W / 2 + 36, 40, icon('coin')).setDisplaySize(26, 26));
        box.add(new GlyphText(s, -TILE_W / 2 + 54, 40, String(price), c.s.gold >= price ? V_PRICE : V_POOR, 0));
      }
      const b = new KitButton(s, TILE_W / 2 - 78, TILE_H / 2 - 34, { w: 132, h: 54, color: BLUE, label: price === null ? t('maxed') : why === 'full' && !enabled ? t('full') : t('buy'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, why); return; }
        onTap();
      });
      b.setEnabled(enabled);
      box.add(b);
      this.content.add(box);
      this.addFocus(b, x + TILE_W / 2 - 78, y + TILE_H / 2 - 34);
    };
    const fullP = c.s.potions >= c.s.potionMax;
    small(x0 - 162, 420, t('potion'), t('potionSub'), POTION_PRICE, icon('potion'), !fullP && c.s.gold >= POTION_PRICE, fullP ? 'full' : 'poor', () => { c.buyPotion(); c.save(); this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('bought'); });
    const bp = c.beltPrice();
    small(x0 + 162, 420, t('belt'), t('beltSub'), bp, icon('pw-shield'), bp !== null && c.s.gold >= bp, bp === null ? 'maxed' : 'poor', () => { c.buyBelt(); c.save(); this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('bought'); });
    c.s.market.forEach((it, i) => {
      const x = x0 + (i % 2 ? 162 : -162), y = 612 + Math.floor(i / 2) * (WARE_H + 14);
      const price = c.marketPrice(it);
      const full = c.s.bag.length >= BAG_MAX;
      this.content.add(this.itemCard(x, y, TILE_W, WARE_H, it, c.s.cls, {
        tag: c.better(it) ? 'better' : null, price, afford: c.s.gold >= price,
        button: { label: t('buy'), color: BLUE, enabled: c.s.gold >= price && !full, why: full ? 'bagFull' : 'poor', onTap: () => { c.buy(i); c.save(); this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('bought'); } },
      }));
    });
  }

  private smith(): void {
    const c = this.camp, s = this.scene, x = s.scale.width / 2;
    SLOTS.forEach((slot, i) => {
      const y = 430 + i * 170;
      const it = c.s.gear[slot];
      if (!it) {
        const box = s.add.container(x, y);
        box.add(themeCard(s, 0, 0, ROW_W, TILE_H));
        box.add(labelAt(s, 0, -10, t('slot_' + slot), V_NAME));
        box.add(labelAt(s, 0, 20, t('empty'), V_DESC));
        this.content.add(box);
        return;
      }
      const maxed = it.up >= MAX_UP;
      const cost = upgradeCost(it);
      this.content.add(this.itemCard(x, y, ROW_W, TILE_H, it, c.s.cls, {
        price: maxed ? undefined : cost, afford: c.s.gold >= cost, lines: 3,
        button: { label: maxed ? t('maxed') : t('upgrade'), color: GOLDC, enabled: !maxed && c.s.gold >= cost, why: maxed ? 'maxed' : 'poor', onTap: () => { c.upgrade(slot); c.save(); this.host.sfx('anvil', 0.6); this.host.changed(); this.build(); this.toast('upgraded'); } },
      }));
    });
  }

  private quests(): void {
    const c = this.camp, s = this.scene, x = s.scale.width / 2;
    QUEST_IDS.forEach((q, i) => {
      const y = 396 + i * (QUEST_H + 8);
      const st = c.s.quests[q];
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, ROW_W, QUEST_H));
      box.add(s.add.image(-ROW_W / 2 + 46, -6, icon(st === 'done' ? 'coin' : st === 'open' ? 'marker' : 'skull')).setDisplaySize(52, 52).setAlpha(st === 'locked' ? 0.5 : 1));
      box.add(fitWidth(labelAt(s, -ROW_W / 2 + 84, -QUEST_H / 2 + 36, t('q_' + q), V_NAME, 0), 380));
      box.add(labelAt(s, ROW_W / 2 - 30, -QUEST_H / 2 + 36, t('quest' + st[0].toUpperCase() + st.slice(1)), V_STATE[st], 1));
      box.add(new Para(s, -ROW_W / 2 + 84, -QUEST_H / 2 + 50, t('qd_' + q), V_DESC, 470, 0, 18));
      box.add(new FmtLine(s, ROW_W / 2 - 30, QUEST_H / 2 - 28, V_STAT, 1).set('questReward', { n: QUEST[q].gold }));
      if (st === 'locked') box.setAlpha(0.7);
      this.content.add(box);
    });
  }
}

// ------------------------------------------------------------------ the hero

export class HeroScreen extends Panel {
  private pick: number | null = null;

  constructor(scene: Phaser.Scene, private camp: Campaign, host: ScreenHost, onClose: () => void, start = 0) {
    super(scene, host, { board: BOARD_H, title: t('heroTitle') });
    this.onClose = onClose;
    this.tab = start;
    this.makeTabs(['tabGear', 'tabTalents'], 236, () => { this.pick = null; this.build(); });
    this.root.add(labelAt(scene, scene.scale.width / 2, 1218, t('screenKeys'), S_KEYS));
    this.leaveButton('close');
    this.build();
  }

  private build(): void {
    this.clear();
    this.purse(this.camp, 306);
    if (this.tab === 0) this.gear(); else this.talents();
    if (this.fi >= this.focus.length) this.fi = this.focus.length - 1;
    this.showFocus();
  }

  private gear(): void {
    const c = this.camp, s = this.scene, x0 = s.scale.width / 2;
    const st = c.stats();
    // the stats strip
    const strip = s.add.container(x0, 400);
    strip.add(themeCard(s, 0, 0, ROW_W, STATS_H));
    const cells: [string, string][] = [
      ['statHp', String(st.maxHp)], ['statAtk', fmtNum(st.atk)], ['statDef', fmtNum(st.def * 100) + '%'],
      ['statCrit', fmtNum(st.crit * 100) + '%'], ['statCdr', fmtNum(st.cdr * 100) + '%'], ['statSpeed', fmtNum(st.speed * 100) + '%'],
    ];
    cells.forEach(([k, v], i) => {
      const cx = -ROW_W / 2 + 56 + i * ((ROW_W - 112) / 5);
      strip.add(fitWidth(labelAt(s, cx, -18, t(k), V_DESC), 100));
      strip.add(new GlyphText(s, cx, 16, v, V_NAME, 0.5));
    });
    this.content.add(strip);
    // what is worn
    SLOTS.forEach((slot, i) => {
      const x = x0 + (i - 1) * (GEAR_W + 14), y = 560;
      const it = c.s.gear[slot];
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, GEAR_W, GEAR_H));
      box.add(labelAt(s, 0, -GEAR_H / 2 + 22, t('slot_' + slot), V_DESC));
      if (it) {
        const col = Phaser.Display.Color.HexStringToColor(RARITY_INK[it.rarity]).color;
        const g = s.add.graphics();
        g.fillStyle(col, 0.2).fillCircle(0, -14, 30).lineStyle(3, col, 1).strokeCircle(0, -14, 30);
        box.add(g);
        box.add(s.add.image(0, -14, itemIcon(it.slot, it.kind, c.s.cls)).setDisplaySize(46, 46));
        box.add(fitWidth(labelAt(s, 0, 34, itemName(it, c.s.cls), { ...V_NAME, size: 23 }), GEAR_W - 24, 0.82));
        const [stat, v] = statLines(it)[0];
        box.add(new FmtLine(s, 0, 60, V_STAT, 0.5).set('st_' + stat, { n: fmtNum(v) }));
        if (it.up) box.add(new GlyphText(s, GEAR_W / 2 - 18, -GEAR_H / 2 + 22, '+' + it.up, V_PRICE, 1));
      } else box.add(labelAt(s, 0, 10, t('empty'), V_DESC));
      this.content.add(box);
    });
    // the bag
    this.content.add(new FmtLine(s, x0, 670, S_INFO, 0.5).set('bagN', { n: c.s.bag.length, of: BAG_MAX }));
    for (let i = 0; i < BAG_MAX; i++) {
      const x = x0 + ((i % 6) - 2.5) * (SLOT_W + 6), y = 735 + Math.floor(i / 6) * (SLOT_H + 8);
      const it = c.s.bag[i];
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, SLOT_W, SLOT_H).setAlpha(it ? 1 : 0.45));
      if (it) {
        const col = Phaser.Display.Color.HexStringToColor(RARITY_INK[it.rarity]).color;
        const g = s.add.graphics();
        g.lineStyle(this.pick === it.id ? 5 : 3, this.pick === it.id ? 0xffd23f : col, 1).strokeRoundedRect(-SLOT_W / 2 + 8, -SLOT_H / 2 + 8, SLOT_W - 16, SLOT_H - 16, 8);
        box.add(g);
        box.add(s.add.image(0, -4, itemIcon(it.slot, it.kind, c.s.cls)).setDisplaySize(50, 50));
        if (c.better(it)) box.add(s.add.image(SLOT_W / 2 - 20, -SLOT_H / 2 + 22, icon('marker')).setDisplaySize(24, 24));
        if (it.up) box.add(new GlyphText(s, 0, SLOT_H / 2 - 22, '+' + it.up, V_PRICE, 0.5));
        const hit = new KitButton(s, 0, 0, { w: SLOT_W, h: SLOT_H, kind: 'plate', color: STONE, sfx: 'ui-click' }, () => { this.pick = this.pick === it.id ? null : it.id; this.build(); });
        hit.face.setAlpha(0.01);
        box.add(hit);
        this.addFocus(hit, x, y);
      }
      this.content.add(box);
    }
    // the picked item: full card with EQUIP and SELL
    const it = c.s.bag.find((b) => b.id === this.pick);
    if (it) {
      const y = 1000;
      const card = this.itemCard(x0, y, ROW_W, DETAIL_H, it, c.s.cls, { tag: c.better(it) ? 'better' : 'worse', lines: 4 });
      const eq = new KitButton(s, ROW_W / 2 - 114, DETAIL_H / 2 - 40, { w: 200, h: 64, color: BLUE, label: t('equip'), style: S_BTN_S, sfx: null }, () => {
        c.equip(it.id); c.save(); this.pick = null; this.host.sfx('equip', 0.5); this.host.changed(); this.build(); this.toast('equipped');
      });
      const sl = new KitButton(s, ROW_W / 2 - 114, DETAIL_H / 2 - 112, { w: 200, h: 64, color: CRIMSON, label: t('sell'), style: S_BTN_S, sfx: null }, () => {
        const g = c.sell(it.id); c.save(); this.pick = null; this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('soldFor', { n: g });
      });
      card.add([eq, sl]);
      card.add(s.add.image(-ROW_W / 2 + 232, -DETAIL_H / 2 + 58, icon('coin')).setDisplaySize(24, 24));
      card.add(new GlyphText(s, -ROW_W / 2 + 248, -DETAIL_H / 2 + 58, String(Math.round(itemValue(it) / 3)), V_PRICE, 0));
      this.content.add(card);
      this.addFocus(eq, x0 + ROW_W / 2 - 114, y + DETAIL_H / 2 - 40);
      this.addFocus(sl, x0 + ROW_W / 2 - 114, y + DETAIL_H / 2 - 112);
    }
  }

  private talents(): void {
    const c = this.camp, s = this.scene, x0 = s.scale.width / 2;
    this.content.add(new FmtLine(s, x0, 370, S_INFO, 0.5).set('pointsN', { n: c.s.points }));
    TALENT_IDS.forEach((id, i) => {
      const x = x0 + (i % 2 ? 162 : -162), y = 470 + Math.floor(i / 2) * 160;
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, TILE_W, TILE_H));
      const skill = id === 'skill1' ? CLASS[c.s.cls].skills[0] : id === 'skill2' ? CLASS[c.s.cls].skills[1] : null;
      box.add(s.add.image(-TILE_W / 2 + 46, -20, icon(skill ? 'sk-' + skill.id : talentIcon(id))).setDisplaySize(56, 56));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 84, -44, skill ? t('sk_' + skill.id) : t('tl_' + id), V_NAME, 0), 210));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 84, -16, skill ? t('tld_skill') : t('tld_' + id), V_DESC, 0), 210));
      const rank = c.s.talents[id], max = TALENT_MAX[id];
      const g = s.add.graphics();
      for (let k = 0; k < max; k++) {
        const px = -TILE_W / 2 + 30 + k * 26, py = 38;
        g.fillStyle(k < rank ? 0xe0b24a : 0x8a7a6a, k < rank ? 1 : 0.35).fillCircle(px, py, 9);
        g.lineStyle(2, 0x3a2a10, 1).strokeCircle(px, py, 9);
      }
      box.add(g);
      const can = c.s.points > 0 && rank < max;
      const b = new KitButton(s, TILE_W / 2 - 46, TILE_H / 2 - 40, { w: 64, h: 64, kind: 'round', color: BLUE, label: '+', style: { size: 34 }, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, rank >= max ? 'maxed' : 'noPoints'); return; }
        c.spendTalent(id); c.save(); this.host.sfx('levelup', 0.5); this.host.changed(); this.build();
      });
      b.setEnabled(can);
      box.add(b);
      this.content.add(box);
      this.addFocus(b, x + TILE_W / 2 - 46, y + TILE_H / 2 - 40);
    });
  }
}

const talentIcon = (id: TalentId): string => ({ vigor: 'heart', might: 'pw-rage', focus: 'pw-haste', precision: 'sword', fortune: 'coin', potion: 'potion' } as Record<string, string>)[id] ?? 'marker';

// ------------------------------------------------------------------ class select

/** The class tiles under the live 3D hero; `onSee` swaps the hero shown, `onPick` starts. */
export class ClassScreen extends Panel {
  private sel: ClassId;

  constructor(scene: Phaser.Scene, cur: ClassId, host: ScreenHost, private onSee: (c: ClassId) => void, private onPick: (c: ClassId) => void, private closable: boolean) {
    super(scene, host, { dim: 0 });
    this.sel = cur;
    const { width } = scene.scale;
    // only the lower half is the board: the hero stands above it
    this.root.addAt(scene.add.image(width / 2, 560 + 690 / 2 + SKIN_PAD / 2 - 20, skinTexture(scene, 'board', BOARD_W, 690)), 1);
    this.root.add(fitWidth(labelAt(scene, width / 2, 150, t('chooseTitle'), S_TITLE), 640));
    this.build();
  }

  private build(): void {
    this.clear();
    const s = this.scene, x0 = s.scale.width / 2;
    CLASS_IDS.forEach((cls, i) => {
      const x = x0 + ((i % 3) - 1) * (CLASS_W + 10), y = 640 + Math.floor(i / 3) * (CLASS_H + 10);
      const on = cls === this.sel;
      const b = new KitButton(s, x, y, { w: CLASS_W, h: CLASS_H, kind: 'plate', color: on ? BLUE : STONE, on, sfx: null }, () => {
        if (this.sel === cls) { this.onPick(cls); return; }
        this.sel = cls; this.host.sfx('move', 0.45); this.onSee(cls); this.build();
      });
      b.addContent(s.add.image(0, -22, icon('sk-' + CLASS[cls].skills[0].id)).setDisplaySize(64, 64));
      b.addContent(fitWidth(labelAt(s, 0, 40, t('c_' + cls), { ...S_CLASS, color: on ? '#fff2cc' : '#f4ead8', stroke: INK, strokeWidth: 4, shadow: true }), CLASS_W - 20));
      this.content.add(b);
      this.addFocus(b, x, y);
    });
    // the chosen class: name, line and both skills
    const c = CLASS[this.sel];
    this.content.add(fitWidth(labelAt(s, x0, 1000, t('c_' + this.sel), S_CLASS_BIG), 600));
    this.content.add(new Para(s, x0, 1022, t('cd_' + this.sel), S_SUB, 600, 0.5, 24));
    c.skills.forEach((sk, k) => {
      const x = x0 + (k ? 150 : -150);
      this.content.add(s.add.image(x - 110, 1090, icon('sk-' + sk.id)).setDisplaySize(46, 46));
      this.content.add(fitWidth(labelAt(s, x - 80, 1090, t('sk_' + sk.id), S_INFO, 0), 200));
    });
    const go = new KitButton(s, x0, 1172, { w: 300, h: 80, color: BLUE, label: t('choose'), style: S_BTN, sfx: 'ui-click' }, () => this.onPick(this.sel));
    this.content.add(go);
    this.addFocus(go, x0, 1172);
    if (this.fi < 0) this.fi = this.focus.length - 1;
    this.showFocus();
  }

  key(code: string): boolean {
    if (code === 'Escape' && !this.closable) return true;
    return super.key(code);
  }
}

// ------------------------------------------------------------------ the world map

export class MapScreen extends Panel {
  constructor(scene: Phaser.Scene, camp: Campaign, map: HexMap, host: ScreenHost, onClose: () => void) {
    super(scene, host, { dim: 0.7 });
    this.onClose = onClose;
    const s = scene, { width } = s.scale;
    this.root.add(themeCard(s, width / 2, 640, 680, 1150));
    this.root.add(fitWidth(labelAt(s, width / 2, 120, t('mapTitle'), { ...S_TITLE, size: 46 }), 560));
    // the hexes seen so far, in ink and wash
    const R = 30, ox = width / 2, oy = 626;
    const pos = (c: number, r: number) => ({ x: ox + (c + (r & 1 ? 0.5 : 0) - (COLS - 1) / 2 - 0.25) * R * 1.732, y: oy + (r - (ROWS - 1) / 2) * R * 1.5 });
    const g = s.add.graphics();
    const WASH: Record<string, number> = {
      grass: 0x9cc87a, forest: 0x4f8a4a, hill: 0x8ab06a, stone: 0xb0aaa0, rhill: 0x9a948a, mount: 0x7a7470, rocks: 0xa8a298,
      water: 0x7ab8d8, island: 0x7ab8d8, wrocks: 0x7ab8d8, river: 0x7ab8d8, bridge: 0xb08a5a, dirt: 0xc8a878, lumber: 0xb89868, sand: 0xe8d098, srocks: 0xd8c088,
    };
    const seen = new Set(camp.s.seen);
    for (const h of map.hexes) {
      const p = pos(h.c, h.r);
      const known = seen.has(h.i);
      g.fillStyle(known ? WASH[h.terrain] ?? 0x9cc87a : 0xb8a888, known ? 0.95 : 0.35);
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath(); g.fillPath();
      g.lineStyle(1, 0x5a3a1a, known ? 0.5 : 0.2); g.strokePath();
      if (known && h.road) { g.fillStyle(0x8a5a2a, 0.9).fillCircle(p.x, p.y, 4); }
    }
    this.root.add(g);
    // places, camps, the party, the tracked quest
    for (const pl of PLACE_IDS) {
      const [c, r] = PLACE_HEX[pl];
      const h = map.at(c, r);
      if (!seen.has(h.i)) continue;
      const p = pos(c, r);
      this.root.add(s.add.image(p.x, p.y - 2, icon(pl === 'village' ? 'heart' : pl === 'castle' ? 'skull' : 'marker')).setDisplaySize(28, 28).setAlpha(pl === 'village' || pl === 'castle' ? 1 : 0.9));
      this.root.add(labelAt(s, p.x, p.y + 26, t('p_' + pl), S_MAP_PLACE));
    }
    for (const cp of CAMPS) {
      const h = map.at(cp.hex[0], cp.hex[1]);
      if (!seen.has(h.i) || camp.s.camps.includes(cp.id)) continue;
      const p = pos(cp.hex[0], cp.hex[1]);
      this.root.add(s.add.image(p.x, p.y, icon('banner')).setDisplaySize(30, 30));
    }
    if (seen.has(map.at(BRIDGE[0], BRIDGE[1]).i) && !camp.bridgeOpen()) { const p = pos(BRIDGE[0], BRIDGE[1]); this.root.add(labelAt(s, p.x, p.y + 24, t('p_bridge'), S_MAP_PLACE)); }
    const th = camp.trackedHex();
    if (th) {
      const p = pos(th[0], th[1]);
      const m = s.add.image(p.x, p.y - 26, icon('marker')).setDisplaySize(36, 36);
      this.root.add(m);
      s.tweens.add({ targets: m, y: p.y - 34, duration: 500, yoyo: true, repeat: -1 });
    }
    const pp = pos(camp.s.pos[0], camp.s.pos[1]);
    const party = s.add.graphics();
    party.fillStyle(0x2c4a9a, 1).fillCircle(pp.x, pp.y, 11).lineStyle(4, 0xffd23f, 1).strokeCircle(pp.x, pp.y, 11);
    this.root.add(party);
    s.tweens.add({ targets: party, alpha: 0.4, duration: 450, yoyo: true, repeat: -1 });
    const q = camp.tracked();
    if (q) {
      this.root.add(labelAt(s, width / 2, 1092, t('tracked'), V_DESC));
      this.root.add(fitWidth(labelAt(s, width / 2, 1122, t('q_' + q), V_NAME), 560));
    }
    this.focus.push({ btn: this.leaveButton('close', 1178), x: width / 2, y: 1178 });
    this.fi = 0;
    this.showFocus();
    void QUEST;
  }

  key(code: string): boolean {
    if (code === 'KeyM') { this.close(); return true; }
    return super.key(code);
  }
}

// ------------------------------------------------------------------ the spoils

export class LootScreen extends Panel {
  constructor(scene: Phaser.Scene, sp: Spoils, camp: Campaign, host: ScreenHost, onClose: () => void) {
    super(scene, host, { dim: 0.55 });
    this.onClose = onClose;
    const s = scene, { width } = s.scale, x0 = width / 2;
    const rows = Math.min(4, sp.items.length);
    const h = 380 + rows * (LOOT_ROW_H + 8) + (sp.levels ? 50 : 0) + (sp.quest ? 50 : 0);
    const top = 640 - h / 2;
    const bh = LOOT_BOARDS.find((b) => b >= h) ?? LOOT_BOARDS[LOOT_BOARDS.length - 1];
    this.root.add(s.add.image(x0, 640 + SKIN_PAD / 2, skinTexture(s, 'board', BOARD_W, bh)));
    let y = top + 70;
    this.root.add(labelAt(s, x0, y, t('victory'), S_TITLE));
    y += 70;
    this.root.add(s.add.image(x0 - 150, y, icon('coin')).setDisplaySize(40, 40));
    this.root.add(new FmtLine(s, x0 - 124, y, S_GOLD_LINE, 0).set('goldN', { n: sp.gold + sp.questGold }));
    this.root.add(new FmtLine(s, x0 + 60, y, S_XP_LINE, 0).set('xpN', { n: sp.xp }));
    y += 52;
    if (sp.levels) {
      const lv = new FmtLine(s, x0, y, S_GREEN_LINE, 0.5).set('levelUpSub', { n: camp.s.level });
      this.root.add(lv);
      lv.setScale(0.5);
      s.tweens.add({ targets: lv, scale: 1, duration: 420, ease: 'Back.easeOut', delay: 200 });
      const ly = y;
      s.time.delayedCall(260, () => {
        if (this.closed) return;
        const em = s.add.particles(x0, ly, SPARK, {
          speed: { min: 90, max: 330 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
          blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 750 }, tint: [0xa8ff9a, 0xffd23f, 0xffffff], emitting: false,
        });
        this.root.add(em);
        em.explode(36);
        s.time.delayedCall(1000, () => em.destroy());
      });
      y += 50;
    }
    if (sp.quest) { this.root.add(fitWidth(labelAt(s, x0, y, t('questDoneN', { name: t('q_' + sp.quest) }), S_GREEN_LINE), 620)); y += 50; }
    if (sp.staff || (sp.quest === 'port')) { this.root.add(labelAt(s, x0, y, t(sp.staff ? 'staffFound' : 'beltUp'), S_GREEN_LINE)); y += 46; }
    y += 10;
    if (!sp.items.length) { this.root.add(new Para(s, x0, y, t('lootNone'), S_SUB, 600, 0.5, 26)); y += 50; }
    sp.items.slice(0, 4).forEach((it) => {
      y += LOOT_ROW_H / 2;
      const card = this.itemCard(x0, y, ROW_W, LOOT_ROW_H, it, camp.s.cls, { tag: camp.better(it) ? 'better' : null, lines: 2 });
      this.root.add(card);
      card.setScale(0.6).setAlpha(0);
      s.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, delay: 180 + this.root.list.length * 25, ease: 'Back.easeOut' });
      y += LOOT_ROW_H / 2 + 8;
    });
    if (sp.sold) { this.root.add(new FmtLine(s, x0, y + 16, S_SUB, 0.5).set('soldN', { n: sp.sold })); y += 36; }
    const go = new KitButton(s, x0, top + h - 60, { w: 300, h: 80, color: BLUE, label: t('onward'), style: S_BTN }, () => this.close());
    this.root.add(go);
    this.focus.push({ btn: go, x: x0, y: top + h - 60 });
    this.fi = 0;
    this.showFocus();
  }
}

export { xpToNext };
