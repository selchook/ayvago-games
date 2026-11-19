// Hex Realm: the inner screens, in the menu theme (menu.ts): a slate board with a gilt frame, the
// tabs and buttons carved stone (the main ones royal-blue enamel, leaving crimson), the wares,
// quests and talents on illuminated vellum cards.
//   - The village: the INN (rest and save, change class, end the day, New Game+, a new campaign),
//     the MARKET (potions, a potion belt, the trader's four pieces), the SMITHY (upgrade what you
//     wear to +5), the SHRINE of Powers (three ranks for each skill and combo finisher: gold and
//     Sigils) and the QUEST board.
//   - The hero: GEAR (stats, what is worn, the bag of twelve with a detail card: equip or sell),
//     TALENTS (eight talents with ranks), COMBOS (the class's three combos: inputs for touch and
//     keys, what they do, their Shrine rank) and CARDS (the power cards of the journey).
//   - Class select (the live 3D hero shows above the board), the world map, the battle's spoils,
//     the power-card draft (three cards, one reroll) and the strip of cards under the pause.
// Touch: tap a tile, a tab or a button. Keyboard: arrows move the focus, Enter presses, Tab and
// Q/E switch tabs, Esc closes. Everything they show is painted ahead (1.3: by the Play scene, a
// slice per frame, `ScreenBaker`; 1.2 painted it all in Boot, under the Ayvago intro): opening a
// screen only places images.
// 1.2 (landscape, 1280 × 720): the village and the hero screen have a left column (title, line,
// tabs stacked like bookmarks, the purse, LEAVE) and a wide content column; the class choice puts
// its board on the right of the live 3D hero; the map is drawn on the left of its legend and the
// tracked quest; the spoils list the gold on the left and the items (with EQUIP for better ones and
// their stat changes against what is worn) on the right; the pause gets the cards on its left and
// the quest and the controls on its right.
import Phaser from 'phaser';
import {
  t, getLang, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import {
  CLASS, CLASS_IDS, QUEST, QUEST_IDS, TALENT_IDS, TALENT_MAX, TIERS, RARITIES, STATS, PCT_STATS, SLOTS, MAX_UP, POWER_IDS, COMBO_IDS,
  tierOf, upgradeCost, itemValue, xpToNext, PLACE_IDS,
  type ClassId, type Item, type Rarity, type Stat, type TalentId, type Slot, type QuestId, type ComboId,
} from './defs';
import { CARDS, CARD, HAND_MAX, MAX_RANK, TRACK_KINDS, CARD_COLOR, rankKey, type TrackKind, type CardRarity } from './powers';
import { paintVellum } from './vellum';
import { Campaign, itemStats, BAG_MAX, POTION_PRICE, type Spoils } from './campaign';
import { weaponOf, ITEM_NOUNS, WEAPON_TYPES } from './weapons';
import { icon, itemIcon, makeArt } from './art';
import { prebakeBanners } from './ui';
import { COLS, ROWS, PLACE_HEX, CAMPS, BRIDGE, type HexMap } from './hexmap';
import {
  BOARD_W, BOARD_H, SIDE_X, CX, CW, TILE_W, TILE_H, QUEST_H, TILE3_W, TILE3_H, ROW_W, ROW_H, SMITH_H, GEAR_W, GEAR_H, SLOT_W, SLOT_H, DETAIL_H,
  STATS_H, CLASS_BOARD_W, CLASS_BOARD_X, CLASS_W, CLASS_H, TUT_W, TUT_H, HINT_H, LOOT_W, LOOT_H, LOOT_ROW_W, LOOT_ROW_H, SUMMARY_W, SUMMARY_H,
  COMBO_W, COMBO_H, SHRINE_H, CARD_W, CARD_H, DRAFT_W, DRAFT_H, PCARDS_W, PCARDS_H, MAP_W, MAP_H,
} from './sizes';

export const OVERLAY_DEPTH = 9600;
const INK = '#1a1420';
const BLUE = 0x2c4a9a, STONE = 0x6c6a74, CRIMSON = 0x8a1c2a, MOSS = 0x2e6a3a, GOLDC = 0xb8861a;

/** Every card size the screens use (declared in the theme, painted ahead). */
export const SCREEN_CARDS = [
  { w: TILE_W, h: TILE_H }, { w: TILE_W, h: QUEST_H }, { w: TILE3_W, h: TILE3_H }, { w: ROW_W, h: ROW_H }, { w: ROW_W, h: SMITH_H }, { w: GEAR_W, h: GEAR_H },
  { w: SLOT_W, h: SLOT_H }, { w: ROW_W, h: DETAIL_H }, { w: ROW_W, h: STATS_H }, { w: TUT_W, h: TUT_H }, { w: TUT_W, h: HINT_H },
  { w: LOOT_ROW_W, h: LOOT_ROW_H }, { w: MAP_W, h: MAP_H }, { w: SUMMARY_W, h: SUMMARY_H }, { w: COMBO_W, h: COMBO_H }, { w: ROW_W, h: SHRINE_H },
  { w: PCARDS_W, h: PCARDS_H },
];

/** The draft's cards' row. */
const DRAFT_Y = 336;
/** The content column's top and the toast's line (over the content, under the board's rim). */
const TOP = 84;
const TOAST_Y = 40;

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
/** A weapon's kind (Light · quick, Heavy · breaks shields …) on its card. */
const V_KIND: LabelStyle = { size: 15, color: '#6a3a1a', stroke: null, shadow: false, body: true };
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
const S_TAB5: LabelStyle = { size: 24 };
const V_DESC2: LabelStyle = { size: 17, color: '#4a3424', stroke: null, shadow: false, body: true };
const V_KEY: LabelStyle = { size: 17, color: '#1f4a8a', stroke: null, shadow: false, body: true };
const V_CARD: LabelStyle = { size: 22, color: '#2a1e14', stroke: null, shadow: false };
const V_CARD_D: LabelStyle = { size: 17, color: '#3a2a1a', stroke: null, shadow: false, body: true };
const V_FIN: LabelStyle = { size: 27, color: '#8a1c24', stroke: null, shadow: false };
/** A stat's change against what is worn: better green, worse red. */
const V_DUP: LabelStyle = { size: 17, color: '#2e7a2a', stroke: null, shadow: false, body: true };
const V_DDOWN: LabelStyle = { size: 17, color: '#a82a2a', stroke: null, shadow: false, body: true };
/** The pause's quest and controls lines. */
const P_BODY: LabelStyle = { size: 17, color: '#3a2a1a', stroke: null, shadow: false, body: true };
/** The map's legend. */
const V_LEG: LabelStyle = { size: 19, color: '#2a1e14', stroke: null, shadow: false, body: true };
/** The pause's strip of cards (on the dark pause backdrop). */
const P_HEAD: LabelStyle = { size: 22, color: '#8a1c24', stroke: null, shadow: false };
const P_NAME: LabelStyle = { size: 18, color: '#2a1e14', stroke: null, shadow: false, body: true };
/** The finisher's name popping at the impact (1.2: smaller, at the blow, only when it lands). */
export const S_POP: LabelStyle = { size: 28, fill: ['#fffbe0', '#ffd86a', '#e08a1c'], stroke: INK, strokeWidth: 6 };
/** A perfect dodge's word over the hero. */
export const S_PERFECT: LabelStyle = { size: 30, fill: ['#ffffff', '#bff4ff', '#5ac8f0'], stroke: INK, strokeWidth: 6 };
const CARD_KEY = (r: CardRarity): string => 'hr-card-' + r;
const CARD_GLOW = 'hr-card-glow';
/** The Shrine's and the combo screen's icon of a track. */
export const trackIcon = (cls: ClassId, k: TrackKind): string => icon(k === 'skill1' ? 'sk-' + CLASS[cls].skills[0].id : k === 'skill2' ? 'sk-' + CLASS[cls].skills[1].id : 'cb-' + k);
/** A track's name: the skill's, or the class's finisher of that combo. */
export const trackName = (cls: ClassId, k: TrackKind): string => k === 'skill1' ? t('sk_' + CLASS[cls].skills[0].id) : k === 'skill2' ? t('sk_' + CLASS[cls].skills[1].id) : t(`fn_${cls}_${k}`);

const fmtNum = (v: number): string => {
  const s = Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
  return getLang() === 'tr' ? s.replace('.', ',') : s;
};

/** An item's display name (tier and kind; a weapon's noun is its model's: Axe, Claymore, Mace …). */
export function itemName(it: Item, cls: ClassId): string {
  const noun = it.slot === 'weapon' ? t(weaponOf(it, cls).noun) : it.slot === 'armor' ? t('i_armor') : t('i_' + (it.kind ?? 'ring'));
  return t('t_' + tierOf(it.ilvl)) + ' ' + noun;
}

/** The stat lines of an item (main stats first). */
function statLines(it: Item): [Stat, number][] {
  const st = itemStats(it);
  return STATS.filter((s) => st[s] !== undefined).map((s) => [s, st[s]!] as [Stat, number]);
}

// ------------------------------------------------------------------ the prebake

/** A soft spark for the screens' bursts (painted in the prebake). */
const SPARK = 'hr-spark';

/**
 * Paints, in the current language, everything the inner screens show. 1.3: not in Boot any more:
 * the Play scene runs it a slice per frame (`ScreenBaker`), the pause's and the class choice's
 * pieces first; a screen opened before its turn paints what it still misses itself.
 */
export function* screenBake(scene: Phaser.Scene): Generator<void, void, void> {
  // the pause's cards first (the platform may pause at any moment), then the class choice
  yield* bakePauseCards(scene);
  for (const c of SCREEN_CARDS) { themeCard(scene, 0, 0, c.w, c.h).destroy(); yield; }
  for (const [w, h] of [[BOARD_W, BOARD_H], [CLASS_BOARD_W, BOARD_H], [LOOT_W, LOOT_H], [DRAFT_W, DRAFT_H]]) { skinTexture(scene, 'board', w, h); yield; }
  for (const c of CLASS_IDS) {
    labelTexture(scene, t('c_' + c), S_CLASS);
    labelTexture(scene, t('c_' + c), S_CLASS_BIG);
    labelTexture(scene, t('c_' + c), V_BIG);
    labelTexture(scene, t('cd_' + c), V_DESC);
    bakePara(scene, t('cd_' + c), S_SUB, CLASS_BOARD_W - 70);
    for (const sk of CLASS[c].skills) { labelTexture(scene, t('sk_' + sk.id), V_NAME); labelTexture(scene, t('sk_' + sk.id), S_INFO); }
    yield;
  }
  bakeButton(scene, 'plate', CLASS_W, CLASS_H, BLUE, false, true);
  bakeButton(scene, 'plate', CLASS_W, CLASS_H, STONE, false, true);
  yield;
  makeArt(scene);
  bake(scene, SPARK, 20, 20, (c) => { const g = c.createRadialGradient(10, 10, 0, 10, 10, 10); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 20, 20); });
  yield;
  for (const k of ['v_inn', 'v_market', 'v_smith', 'v_shrine', 'v_quests', 'tabGear', 'tabTalents', 'tabCombos', 'tabCards']) labelTexture(scene, t(k), S_TAB);
  yield;
  for (const k of ['innTitle', 'marketTitle', 'smithTitle', 'questsTitle', 'shrineTitle', 'heroTitle', 'chooseTitle', 'mapTitle', 'victory', 'draftTitle']) labelTexture(scene, t(k), S_TITLE);
  yield;
  for (const k of ['innSub', 'marketSub', 'smithSub', 'questsSub', 'shrineSub', 'heroSub']) { bakePara(scene, t(k), S_SUB, SIDE_PARA); yield; }
  for (const k of ['draftSub', 'lootNone']) bakePara(scene, t(k), S_SUB, 620);
  bakePara(scene, t('noCards'), S_SUB, CW - 80);
  yield;
  bakeButton(scene, 'button', TAB_W, TAB_H, STONE, false, true);
  bakeButton(scene, 'button', TAB_W, TAB_H, BLUE, false, true);
  bakeButton(scene, 'button', 300, 70, CRIMSON);
  bakeButton(scene, 'button', 300, 70, BLUE);
  yield;
  for (const col of [BLUE, MOSS, CRIMSON, GOLDC]) bakeButton(scene, 'button', 132, 54, col, true);
  for (const col of [BLUE, CRIMSON, MOSS, STONE]) bakeButton(scene, 'button', 200, 64, col, true);
  yield;
  bakeButton(scene, 'button', 152, 54, GOLDC, true);
  bakeButton(scene, 'button', 200, 50, STONE, true);
  bakeButton(scene, 'button', 240, 70, STONE, true);
  bakeButton(scene, 'round', 64, 64, BLUE, true);
  bakeButton(scene, 'plate', SLOT_W, SLOT_H, STONE);
  bakeButton(scene, 'plate', CARD_W, CARD_H, STONE);
  yield;
  for (const k of ['leave', 'close', 'buy', 'sell', 'equip', 'upgrade', 'rest', 'endDay', 'ngPlus', 'choose', 'onward', 'tapContinue', 'full', 'maxed', 'classBtn', 'empower', 'reroll', 'newGame', 'sure', 'equipped', 'sellWeaker']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  yield;
  for (const k of ['restSub', 'endDaySub', 'ngPlusSub', 'potionSub', 'beltSub', 'newCampSub']) labelTexture(scene, t(k), V_DESC);
  for (const k of ['potion', 'belt']) labelTexture(scene, t(k), V_NAME);
  for (const k of ['maxed', 'full', 'better', 'worse', 'learnt']) { labelTexture(scene, t(k), V_TAG); labelTexture(scene, t(k), V_WORSE); }
  yield;
  for (const k of ['poor', 'bagFull', 'bought', 'equipped', 'upgraded', 'rested', 'cantRest', 'maxed', 'noPoints', 'full', 'noSigils', 'empowered', 'nothingWeaker']) labelTexture(scene, t(k), S_TOAST);
  bakeFmt(scene, 'soldFor', ['n'], S_TOAST);
  yield;
  for (const o of [S_PURSE, V_PRICE, V_POOR, S_INFO, V_NAME, V_BIG, S_GOLD_LINE, S_XP_LINE, V_STAT, V_UP, V_KEY, V_DUP, V_DDOWN]) { glyphAtlas(scene, o); yield; }
  for (const k of ['heroLevel', 'pointsN', 'bagN']) bakeFmt(scene, k, k === 'bagN' ? ['n', 'of'] : ['n'], S_INFO);
  yield;
  // the item names, rarities, weapon kinds and stat lines
  for (const tier of TIERS) { for (const n of ITEM_NOUNS) labelTexture(scene, t('t_' + tier) + ' ' + t(n), V_NAME); yield; }
  for (const r of RARITIES) labelTexture(scene, t('r_' + r), V_RARITY(r));
  for (const w of WEAPON_TYPES) labelTexture(scene, t('wt_' + w), V_KIND);
  yield;
  for (const s of STATS) { bakeFmt(scene, 'st_' + s, ['n'], V_STAT); bakeFmt(scene, 'st_' + s, ['n'], V_UP); }
  for (const s of SLOTS) { labelTexture(scene, t('slot_' + s), V_DESC); labelTexture(scene, t('slot_' + s), V_NAME); }
  yield;
  labelTexture(scene, '+', { size: 34 });
  labelTexture(scene, t('mapTitle'), { ...S_TITLE, size: 46 });
  labelTexture(scene, t('empty'), V_DESC);
  labelTexture(scene, t('vsWorn'), V_KEY);
  bakePara(scene, t('pickItem'), V_DESC2, CW - 80);
  for (const k of ['statHp', 'statAtk', 'statDef', 'statCrit', 'statCdr', 'statSpeed']) labelTexture(scene, t(k), V_DESC);
  yield;
  // talents
  for (const id of TALENT_IDS) if (id !== 'skill1' && id !== 'skill2') { labelTexture(scene, t('tl_' + id), V_NAME); labelTexture(scene, t('tld_' + id), V_DESC); yield; }
  labelTexture(scene, t('tld_skill'), V_DESC);
  // quests
  for (const q of QUEST_IDS) { labelTexture(scene, t('q_' + q), V_NAME); bakePara(scene, t('qd_' + q), V_DESC, QUEST_PARA); yield; }
  for (const s of ['open', 'done', 'locked']) labelTexture(scene, t('quest' + s[0].toUpperCase() + s.slice(1)), V_STATE[s]);
  bakeFmt(scene, 'questReward', ['n'], V_STAT);
  yield;
  // the map and its legend
  for (const p of PLACE_IDS) { labelTexture(scene, t('p_' + p), S_MAP_PLACE); labelTexture(scene, t('p_' + p), S_MAP_TAG); }
  for (const k of ['p_camp', 'p_bridge']) labelTexture(scene, t(k), S_MAP_PLACE);
  labelTexture(scene, t('tracked'), V_KEY);
  yield;
  for (const q of QUEST_IDS) { labelTexture(scene, t('q_' + q), V_BIG); bakePara(scene, t('qd_' + q), V_LEG, MAP_PARA); yield; }
  bakePara(scene, t('sumDone'), V_LEG, MAP_PARA);
  for (const k of LEGEND) labelTexture(scene, t(k), V_LEG);
  yield;
  // the spoils
  for (const k of ['goldN', 'xpN']) bakeFmt(scene, k, ['n'], k === 'goldN' ? S_GOLD_LINE : S_XP_LINE);
  bakeFmt(scene, 'levelUpSub', ['n'], S_GREEN_LINE);
  yield;
  for (const q of QUEST_IDS) bakePara(scene, t('questDoneN', { name: t('q_' + q) }), S_GREEN_LINE, LOOT_SIDE);
  for (const k of ['staffFound', 'beltUp']) bakePara(scene, t(k), S_GREEN_LINE, LOOT_SIDE);
  bakeFmt(scene, 'soldN', ['n'], S_SUB);
  labelTexture(scene, t('screenKeys'), S_KEYS);
  bakePara(scene, t('screenKeys'), S_KEYS, SIDE_PARA);
  yield;
  yield* bakePowers(scene);
  void POWER_IDS;
}

/** Everything at once (a language switch's repaint, tests). */
export function prebakeScreens(scene: Phaser.Scene): void {
  for (const _ of screenBake(scene)) { /* each step paints */ }
}

/**
 * Runs `screenBake` a slice per frame inside a time budget, so the screens are painted while the
 * player looks at the class choice or walks the map, never all in one stall.
 */
export class ScreenBaker {
  private it: Generator<void, void, void> | null;
  done = false;
  constructor(it: Generator<void, void, void>) { this.it = it; }
  /** Paints for up to `ms` milliseconds; true once everything is painted. */
  step(ms: number): boolean {
    if (!this.it) return true;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (this.it.next().done) { this.it = null; this.done = true; break; }
    }
    return this.done;
  }
  finish(): void { while (!this.step(1000)) { /* the rest at once */ } }
}

/** A power card's face: vellum, a rarity gem frame and a jewel at the top, a glow for the rare ones. */
function paintCard(c: CanvasRenderingContext2D, w: number, h: number, r: CardRarity): void {
  const col = CARD_COLOR[r];
  const hex = (v: number, a = 1) => `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  c.save();
  c.translate(12, 12);
  if (r !== 'common') { c.save(); c.shadowColor = hex(col.glow, r === 'legendary' ? 1 : 0.8); c.shadowBlur = r === 'legendary' ? 16 : 10; c.fillStyle = hex(col.glow); c.beginPath(); c.roundRect(0, 0, w, h, 12); c.fill(); c.restore(); }
  paintVellum(c, w, h);
  c.lineWidth = 5; c.strokeStyle = hex(col.gem, 0.9);
  c.beginPath(); c.roundRect(24, 24, w - 48, h - 48, 6); c.stroke();
  const g = c.createRadialGradient(w / 2, 104, 6, w / 2, 104, 52);
  g.addColorStop(0, hex(col.glow, 0.55)); g.addColorStop(1, hex(col.gem, 0.18));
  c.fillStyle = g; c.beginPath(); c.arc(w / 2, 104, 50, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3; c.strokeStyle = hex(col.gem); c.stroke();
  const gy = 12;
  c.fillStyle = '#3a2a10'; c.beginPath(); c.moveTo(w / 2, gy - 12); c.lineTo(w / 2 + 14, gy + 2); c.lineTo(w / 2, gy + 16); c.lineTo(w / 2 - 14, gy + 2); c.closePath(); c.fill();
  const jg = c.createLinearGradient(0, gy - 10, 0, gy + 14);
  jg.addColorStop(0, '#ffffff'); jg.addColorStop(0.4, hex(col.glow)); jg.addColorStop(1, hex(col.gem));
  c.fillStyle = jg; c.beginPath(); c.moveTo(w / 2, gy - 8); c.lineTo(w / 2 + 10, gy + 2); c.lineTo(w / 2, gy + 12); c.lineTo(w / 2 - 10, gy + 2); c.closePath(); c.fill();
  if (r === 'legendary') {
    c.strokeStyle = '#c08a20'; c.lineWidth = 2;
    for (const [x, y, sx, sy] of [[30, 30, 1, 1], [w - 30, 30, -1, 1], [30, h - 30, 1, -1], [w - 30, h - 30, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * 22); c.quadraticCurveTo(x, y, x + sx * 22, y); c.stroke(); }
  }
  c.restore();
}

/** The cards under the pause (and their quest and controls cards). */
function* bakePauseCards(scene: Phaser.Scene): Generator<void, void, void> {
  themeCard(scene, 0, 0, PCARDS_W, PCARDS_H).destroy();
  for (const r of ['common', 'rare', 'epic', 'legendary'] as CardRarity[]) bake(scene, CARD_KEY(r), CARD_W + 24, CARD_H + 24, (c) => paintCard(c, CARD_W, CARD_H, r));
  yield;
  for (const k of ['yourCards', 'pQuest', 'pControls']) labelTexture(scene, t(k), P_HEAD);
  bakePara(scene, t('noCards'), P_BODY, PCARDS_W - 50);
  for (const q of QUEST_IDS) { labelTexture(scene, t('q_' + q), P_NAME); bakePara(scene, t('qd_' + q), P_BODY, PCARDS_W - 50); }
  yield;
  bakePara(scene, t('sumDone'), P_BODY, PCARDS_W - 50);
  for (const k of ['ctlTouch', 'ctlKeys']) bakePara(scene, t(k), P_BODY, PCARDS_W - 50);
  yield;
}

/** Paints the Shrine's, the combos' and the cards' pieces, the battle banners. */
function* bakePowers(scene: Phaser.Scene): Generator<void, void, void> {
  bake(scene, CARD_GLOW, CARD_W + 44, CARD_H + 44, (c) => { c.shadowColor = 'rgba(255,220,120,1)'; c.shadowBlur = 18; c.strokeStyle = 'rgba(255,236,170,1)'; c.lineWidth = 6; c.beginPath(); c.roundRect(22, 22, CARD_W, CARD_H, 12); c.stroke(); });
  for (const k of ['newCampT', 'rest', 'endDay', 'ngPlus']) labelTexture(scene, t(k), V_BIG);
  labelTexture(scene, t('nextRank') + ':', V_KEY);
  labelTexture(scene, t('maxRank'), V_UP);
  for (const k of ['touchL', 'keysL']) labelTexture(scene, t(k) + ':', V_KEY);
  bakePara(scene, t('combatOnly'), S_SUB, CW - 40);
  yield;
  for (const c of COMBO_IDS) { labelTexture(scene, t('cb_' + c), V_DESC); for (const k of ['t', 'k']) bakePara(scene, t('in_' + c + '_' + k), V_DESC2, COMBO_W - 34); yield; }
  bakeFmt(scene, 'cardsN', ['n', 'of'], S_INFO);
  for (const cls of CLASS_IDS) {
    labelTexture(scene, t('combosOf', { name: t('c_' + cls) }), S_INFO);
    for (const c of COMBO_IDS) labelTexture(scene, t(`fn_${cls}_${c}`), S_INFO);
    for (const k of TRACK_KINDS) {
      labelTexture(scene, trackName(cls, k), V_BIG);
      for (let r = 1; r <= MAX_RANK; r++) labelTexture(scene, t(rankKey(cls, k, r)), V_UP);
    }
    yield;
    for (const c of COMBO_IDS) {
      labelTexture(scene, t(`fn_${cls}_${c}`), V_FIN);
      labelTexture(scene, t(`fn_${cls}_${c}`) + '!', S_POP);
      bakePara(scene, t(`fd_${cls}_${c}`), V_DESC2, COMBO_W - 34);
      for (let r = 1; r <= MAX_RANK; r++) bakePara(scene, t(rankKey(cls, c, r)), V_UP, COMBO_W - 34);
      yield;
    }
  }
  labelTexture(scene, t('perfect'), S_PERFECT);
  prebakeBanners(scene);
  yield;
  for (const card of CARDS) {
    labelTexture(scene, t('k_' + card.id), V_CARD);
    labelTexture(scene, t('k_' + card.id), V_NAME);
    labelTexture(scene, t('k_' + card.id), P_NAME);
    bakePara(scene, t('kd_' + card.id), V_CARD_D, CARD_W - 54);
    bakePara(scene, t('kd_' + card.id), V_DESC, TILE3_W - 34);
    yield;
  }
  labelTexture(scene, t('draftKeys'), S_KEYS);
}

// ------------------------------------------------------------------ the panel frame

export interface ScreenHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
  /** The campaign changed (gold, gear, level …): the HUD follows. */
  changed(): void;
}

interface Focusable { btn: KitButton; x: number; y: number }

/** The left column's tabs (stacked like bookmarks). */
const TAB_W = 300, TAB_H = 58;
/** Widths of the left column's line, the quests' and the map's paragraphs, the spoils' left column. */
const SIDE_PARA = 360;
const QUEST_PARA = TILE_W - 110;
const MAP_PARA = 580;
const LOOT_SIDE = 400;
/** The map's legend: what each mark means. */
const LEGEND = ['lgYou', 'lgGoal', 'lgVillage', 'lgDungeon', 'lgCastle', 'lgCamp'];

/**
 * An overlay screen: a dim layer, an optional slate board with a title, content that is rebuilt
 * when something changes, keyboard focus over its buttons, short painted toasts. `side` puts the
 * title, its line and the tabs in the left column (the village, the hero); else the title is centred.
 */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected content!: Phaser.GameObjects.Container;
  protected focus: Focusable[] = [];
  protected fi = -1;
  protected tabs: KitButton[] = [];
  protected tab = 0;
  private toastImg: Phaser.GameObjects.Image | Phaser.GameObjects.Container | null = null;
  protected side: boolean;
  closed = false;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number]; side?: boolean; title?: string; sub?: string; dim?: number; titleY?: number } = {}) {
    const { width, height } = scene.scale;
    this.side = !!o.side;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x06040c, o.dim ?? 0.66).setOrigin(0).setInteractive();
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(width / 2, height / 2 + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    if (o.title) this.root.add(this.side ? fitWidth(labelAt(scene, SIDE_X, 66, o.title, S_TITLE), 390) : fitWidth(labelAt(scene, width / 2, o.titleY ?? 76, o.title, S_TITLE), 860));
    if (o.sub) this.root.add(this.side ? new Para(scene, SIDE_X, 100, o.sub, S_SUB, SIDE_PARA, 0.5, 24) : new Para(scene, width / 2, (o.titleY ?? 76) + 30, o.sub, S_SUB, 620, 0.5, 24));
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    // Esc closes the screen instead of pausing the round
    this.release = pushModal(scene);
  }

  private release: () => void;

  /** Tab buttons stacked in the left column from y. */
  protected makeTabs(keys: string[], y: number, onTab: (i: number) => void): void {
    keys.forEach((k, i) => {
      const b = new KitButton(this.scene, SIDE_X, y + i * (TAB_H + 8), { w: TAB_W, h: TAB_H, color: i === this.tab ? BLUE : STONE, on: i === this.tab, label: t(k), style: S_TAB, sfx: 'ui-click' }, () => { this.tab = i; this.refreshTabs(); onTab(i); });
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

  /** A short painted message over the content (or the board's foot). */
  toast(key: string, vars?: Record<string, number>): void {
    this.toastImg?.destroy();
    const x = this.side ? CX : this.scene.scale.width / 2, y = this.side ? TOAST_Y : this.scene.scale.height - 60;
    this.toastImg = vars ? new FmtLine(this.scene, x, y, S_TOAST).set(key, vars) : labelAt(this.scene, x, y, t(key), S_TOAST);
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
    // 1.2.1: nothing of a closing screen takes a tap while it fades (its dim layer covered the map's
    // buttons for that moment, so a quick tap after LEAVE or Esc went nowhere)
    const off = (o: Phaser.GameObjects.GameObject): void => {
      if (o.input) o.disableInteractive();
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(off);
    };
    off(this.root);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 120, onComplete: () => this.root.destroy() });
    this.onClose?.();
  }

  /** The LEAVE / CLOSE button (the left column's foot by default). */
  protected leaveButton(label = 'leave', x = SIDE_X, y = 646): KitButton {
    const b = new KitButton(this.scene, x, y, { w: 300, h: 70, color: CRIMSON, label: t(label), style: S_BTN }, () => this.close());
    this.root.add(b);
    return b;
  }

  /** The keyboard's keys (keyboard players only): over LEAVE in the left column, or a line at (x, y). */
  protected keysLine(key = 'screenKeys', x?: number, y?: number): void {
    if (this.host.touch) return;
    if (x === undefined || y === undefined) this.root.add(new Para(this.scene, SIDE_X, 568, t(key), S_KEYS, SIDE_PARA, 0.5, 19));
    else this.root.add(labelAt(this.scene, x, y, t(key), S_KEYS));
  }

  // ------------------------------------------------------------------ shared pieces

  /**
   * An item card: icon, name, rarity (and a weapon's kind), stat lines with their change against
   * what is worn; an optional price and button, a comparison tag.
   */
  protected itemCard(x: number, y: number, w: number, h: number, it: Item, camp: Campaign, o: { tag?: 'better' | 'worse' | null; price?: number; afford?: boolean; button?: { label: string; color: number; enabled: boolean; onTap: () => void; why?: string }; lines?: number; delta?: boolean } = {}): Phaser.GameObjects.Container {
    const s = this.scene, cls = camp.s.cls;
    const c = s.add.container(x, y);
    c.add(themeCard(s, 0, 0, w, h));
    const left = -w / 2 + 22;
    const col = Phaser.Display.Color.HexStringToColor(RARITY_INK[it.rarity]).color;
    const g = s.add.graphics();
    g.fillStyle(col, 0.22).fillCircle(left + 30, -h / 2 + 46, 30);
    g.lineStyle(3, col, 1).strokeCircle(left + 30, -h / 2 + 46, 30);
    c.add(g);
    c.add(s.add.image(left + 30, -h / 2 + 46, itemIcon(it, cls)).setDisplaySize(52, 52));
    const name = labelAt(s, left + 70, -h / 2 + 30, itemName(it, cls), V_NAME, 0);
    // a wide card's stats stand in a column from left + 250: the name stops short of it
    fitWidth(name, (h >= 140 && w < 600 ? w - 120 : 166) - (it.up ? 40 : 0));
    c.add(name);
    if (it.up) c.add(new GlyphText(s, left + 74 + name.displayWidth, -h / 2 + 30, '+' + it.up, V_PRICE, 0));
    const rar = labelAt(s, left + 70, -h / 2 + 55, t('r_' + it.rarity), V_RARITY(it.rarity), 0);
    c.add(rar);
    const wt = it.slot === 'weapon' ? weaponOf(it, cls).type : null;
    // a weapon's kind: beside the rarity on a tall card (its stats are under it); under the rarity
    // on a wide one (its stats stand in a column from left + 250), shrunk to stop short of it
    if (wt && wt !== 'plain') {
      const tall = h >= 140 && w < 600;
      const kind = tall ? labelAt(s, left + 80 + rar.displayWidth, -h / 2 + 55, t('wt_' + wt), V_KIND, 0) : labelAt(s, left + 70, -h / 2 + 77, t('wt_' + wt), V_KIND, 0);
      c.add(fitWidth(kind, tall ? w - 130 - rar.displayWidth : 250 - 70 - 14));
    }
    const lines = statLines(it).slice(0, o.lines ?? 3);
    const worn = camp.s.gear[it.slot];
    const wornSt = worn && worn !== it ? itemStats(worn) : null;
    // stat lines under the name on a tall card, in a second column on a short one
    const under = h >= 140 && w < 600;
    lines.forEach(([st, v], i) => {
      const lx = under ? left + 6 : left + 250, ly = under ? -h / 2 + 90 + i * 20 : -h / 2 + 28 + i * 21;
      c.add(new FmtLine(s, lx, ly, V_STAT, 0).set('st_' + st, { n: fmtNum(v) }));
      // its change against what is worn: green better, red worse
      if (o.delta && wornSt) {
        const d = v - (wornSt[st] ?? 0);
        if (Math.abs(d) >= 0.05) c.add(new GlyphText(s, under ? w / 2 - 24 : left + 440, ly, (d > 0 ? '+' : '−') + fmtNum(Math.abs(d)), d > 0 ? V_DUP : V_DDOWN, 1));
      }
    });
    if (o.tag) c.add(labelAt(s, w / 2 - 22, under ? -h / 2 + 30 : h / 2 - 24, t(o.tag), o.tag === 'better' ? V_TAG : V_WORSE, 1));
    if (o.price !== undefined) {
      const py = h / 2 - 32;
      c.add(s.add.image(left + 14, py, icon('coin')).setDisplaySize(26, 26));
      c.add(new GlyphText(s, left + 32, py, String(o.price), o.afford === false ? V_POOR : V_PRICE, 0));
    }
    if (o.button) {
      const bt = o.button;
      const b = new KitButton(s, w / 2 - 82, h / 2 - 36, { w: 132, h: 54, color: bt.color, label: bt.label, style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, bt.why ?? 'poor'); return; }
        bt.onTap();
      });
      b.setEnabled(bt.enabled);
      c.add(b);
      this.addFocus(b, x + w / 2 - 82, y + h / 2 - 36);
    }
    return c;
  }

  /** The purse and potions, two by two in the left column. */
  protected purse(camp: Campaign, y = 498): void {
    const s = this.scene;
    const at = (x: number, yy: number, ic: string, size: number, text: string) => {
      this.content.add(s.add.image(x, yy, icon(ic)).setDisplaySize(size, size));
      this.content.add(new GlyphText(s, x + 24, yy, text, S_PURSE, 0));
    };
    at(SIDE_X - 136, y, 'coin', 36, String(camp.s.gold));
    at(SIDE_X + 34, y, 'sigil', 38, String(camp.s.sigils));
    at(SIDE_X - 136, y + 46, 'potion', 38, `${camp.s.potions}/${camp.s.potionMax}`);
    at(SIDE_X + 34, y + 46, 'heart', 34, `${Math.round(camp.s.hp)}/${camp.maxHp}`);
  }
}

// ------------------------------------------------------------------ the village

export class VillageScreen extends Panel {
  constructor(scene: Phaser.Scene, private camp: Campaign, host: ScreenHost, private act: { endDay: () => void; newGamePlus: () => void; chooseClass: () => void; newCampaign: () => void }, onClose: () => void, start = 0) {
    super(scene, host, { board: [BOARD_W, BOARD_H], side: true });
    this.onClose = onClose;
    this.tab = start;
    this.makeTabs(['v_inn', 'v_market', 'v_smith', 'v_shrine', 'v_quests'], 180, () => { this.armed = false; this.build(); });
    this.keysLine();
    this.leaveButton();
    this.build();
  }

  private build(): void {
    this.clear();
    const titles = ['innTitle', 'marketTitle', 'smithTitle', 'shrineTitle', 'questsTitle'];
    const subs = ['innSub', 'marketSub', 'smithSub', 'shrineSub', 'questsSub'];
    this.content.add(fitWidth(labelAt(this.scene, SIDE_X, 62, t(titles[this.tab]), S_TITLE), 390));
    this.content.add(new Para(this.scene, SIDE_X, 92, t(subs[this.tab]), S_SUB, SIDE_PARA, 0.5, 24));
    this.purse(this.camp);
    [this.inn, this.market, this.smith, this.shrine, this.quests][this.tab].call(this);
    if (this.fi >= this.focus.length) this.fi = this.focus.length - 1;
    this.showFocus();
  }

  /** A full-width action row: icon, title, a line under it, a button. */
  private actionRow(y: number, title: string, sub: string, btn: { label: string; color: number; enabled: boolean; why?: string; onTap: () => void }, ic?: string): void {
    const s = this.scene;
    const c = s.add.container(CX, y);
    c.add(themeCard(s, 0, 0, ROW_W, ROW_H));
    if (ic) c.add(s.add.image(-ROW_W / 2 + 56, 0, ic).setDisplaySize(62, 62));
    const lx = -ROW_W / 2 + (ic ? 100 : 30);
    c.add(fitWidth(labelAt(s, lx, -15, title, V_BIG, 0), 380));
    c.add(fitWidth(labelAt(s, lx, 21, sub, V_DESC, 0), 400));
    const b = new KitButton(s, ROW_W / 2 - 124, 0, { w: 200, h: 64, color: btn.color, label: btn.label, style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
      if (!b.enabled) { this.deny(b, btn.why ?? 'poor'); return; }
      btn.onTap();
    });
    b.setEnabled(btn.enabled);
    c.add(b);
    this.content.add(c);
    this.addFocus(b, CX + ROW_W / 2 - 124, y);
  }

  private inn(): void {
    const c = this.camp;
    const y = (i: number) => TOP + 26 + i * (ROW_H + 10);
    this.actionRow(y(0), t('rest'), t('restSub'), { label: t('rest'), color: BLUE, enabled: true, onTap: () => {
      const hurt = c.s.hp < c.maxHp;
      c.rest(); c.save(); this.host.sfx(hurt ? 'heal' : 'move', 0.5); this.host.changed(); this.build(); this.toast(hurt ? 'rested' : 'cantRest');
    } }, icon('heart'));
    this.actionRow(y(1), t('c_' + c.s.cls), t('cd_' + c.s.cls), { label: t('classBtn'), color: STONE, enabled: true, onTap: () => { this.host.sfx('move', 0.4); this.act.chooseClass(); } }, icon('sk-' + CLASS[c.s.cls].skills[0].id));
    this.actionRow(y(2), t('endDay'), t('endDaySub'), { label: t('endDay'), color: CRIMSON, enabled: true, onTap: () => this.act.endDay() }, icon('marker'));
    if (c.s.victory) this.actionRow(y(3), t('ngPlus'), t('ngPlusSub'), { label: t('ngPlus'), color: MOSS, enabled: true, onTap: () => { this.act.newGamePlus(); this.build(); } }, icon('skull'));
    // a new campaign: the first tap arms it, the second starts over
    this.actionRow(y(c.s.victory ? 4 : 3), t('newCampT'), t('newCampSub'), { label: t(this.armed ? 'sure' : 'newGame'), color: this.armed ? CRIMSON : STONE, enabled: true, onTap: () => {
      if (!this.armed) { this.armed = true; this.host.sfx('error', 0.3); this.build(); return; }
      this.armed = false;
      this.act.newCampaign();
    } }, icon('banner'));
  }

  private armed = false;

  /** The Shrine of Powers: five tracks of the current class, three ranks each. */
  private shrine(): void {
    const c = this.camp, s = this.scene, cls = c.s.cls;
    TRACK_KINDS.forEach((k, i) => {
      const y = TOP + 26 + i * (SHRINE_H + 10);
      const box = s.add.container(CX, y);
      box.add(themeCard(s, 0, 0, ROW_W, SHRINE_H));
      box.add(s.add.image(-ROW_W / 2 + 54, 0, trackIcon(cls, k)).setDisplaySize(64, 64));
      const lx = -ROW_W / 2 + 100;
      const name = fitWidth(labelAt(s, lx, -26, trackName(cls, k), V_BIG, 0), 300);
      box.add(name);
      const rank = c.rankOf(k);
      const g = s.add.graphics();
      for (let r = 0; r < MAX_RANK; r++) {
        const px = lx + name.displayWidth + 26 + r * 28, py = -26;
        g.fillStyle(r < rank ? 0xe0b24a : 0x8a7a6a, r < rank ? 1 : 0.35).fillCircle(px, py, 10);
        g.lineStyle(2, 0x3a2a10, 1).strokeCircle(px, py, 10);
      }
      box.add(g);
      const bx = ROW_W / 2 - 96;
      const room = bx - 86 - lx;
      if (rank < MAX_RANK) {
        const nx = labelAt(s, lx, 20, t('nextRank') + ':', V_KEY, 0);
        box.add(nx);
        box.add(fitWidth(labelAt(s, lx + nx.displayWidth + 8, 20, t(rankKey(cls, k, rank + 1)), V_UP, 0), room - nx.displayWidth - 8));
      } else box.add(fitWidth(labelAt(s, lx, 20, t('maxRank'), V_UP, 0), room));
      const cost = c.rankCost(k);
      // the price (gold and Sigils) over EMPOWER
      if (cost) {
        box.add(s.add.image(bx - 62, -30, icon('coin')).setDisplaySize(24, 24));
        box.add(new GlyphText(s, bx - 46, -30, String(cost.gold), c.s.gold >= cost.gold ? V_PRICE : V_POOR, 0));
        box.add(s.add.image(bx + 26, -30, icon('sigil')).setDisplaySize(26, 26));
        box.add(new GlyphText(s, bx + 42, -30, String(cost.sigils), c.s.sigils >= cost.sigils ? V_PRICE : V_POOR, 0));
      }
      const ok = !!cost && c.s.gold >= cost.gold && c.s.sigils >= cost.sigils;
      const b = new KitButton(s, bx, 18, { w: 152, h: 54, color: GOLDC, label: cost ? t('empower') : t('maxed'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, !cost ? 'maxed' : c.s.sigils < cost.sigils ? 'noSigils' : 'poor'); return; }
        c.buyRank(k); c.save(); this.host.sfx('levelup', 0.55); this.host.changed(); this.build(); this.toast('empowered');
        this.sparkle(CX + lx + 40, y - 6);
      });
      b.setEnabled(ok);
      box.add(b);
      this.content.add(box);
      this.addFocus(b, CX + bx, y + 18);
    });
  }

  /** A burst of gold sparks (a rank bought). */
  private sparkle(x: number, y: number): void {
    const em = this.scene.add.particles(x, y, SPARK, {
      speed: { min: 80, max: 260 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 650 }, tint: [0xffd23f, 0xffffff, 0xe0b24a], emitting: false,
    });
    this.root.add(em);
    em.explode(28);
    this.scene.time.delayedCall(800, () => em.destroy());
  }

  /** Two columns, three rows: the potion and the belt, then the trader's four pieces. */
  private market(): void {
    const c = this.camp, s = this.scene;
    const at = (i: number) => ({ x: CX + (i % 2 ? 1 : -1) * (TILE_W / 2 + 7), y: TOP + 46 + Math.floor(i / 2) * (TILE_H + 12) });
    const small = (i: number, name: string, sub: string, price: number | null, ic: string, enabled: boolean, why: string, onTap: () => void) => {
      const { x, y } = at(i);
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, TILE_W, TILE_H));
      box.add(s.add.image(-TILE_W / 2 + 54, -24, ic).setDisplaySize(64, 64));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 100, -42, name, V_NAME, 0), TILE_W - 120));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 100, -14, sub, V_DESC, 0), TILE_W - 120));
      if (price !== null) {
        box.add(s.add.image(-TILE_W / 2 + 36, TILE_H / 2 - 32, icon('coin')).setDisplaySize(26, 26));
        box.add(new GlyphText(s, -TILE_W / 2 + 54, TILE_H / 2 - 32, String(price), c.s.gold >= price ? V_PRICE : V_POOR, 0));
      }
      const b = new KitButton(s, TILE_W / 2 - 82, TILE_H / 2 - 36, { w: 132, h: 54, color: BLUE, label: price === null ? t('maxed') : why === 'full' && !enabled ? t('full') : t('buy'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, why); return; }
        onTap();
      });
      b.setEnabled(enabled);
      box.add(b);
      this.content.add(box);
      this.addFocus(b, x + TILE_W / 2 - 82, y + TILE_H / 2 - 36);
    };
    const fullP = c.s.potions >= c.s.potionMax;
    small(0, t('potion'), t('potionSub'), POTION_PRICE, icon('potion'), !fullP && c.s.gold >= POTION_PRICE, fullP ? 'full' : 'poor', () => { c.buyPotion(); c.save(); this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('bought'); });
    const bp = c.beltPrice();
    small(1, t('belt'), t('beltSub'), bp, icon('pw-shield'), bp !== null && c.s.gold >= bp, bp === null ? 'maxed' : 'poor', () => { c.buyBelt(); c.save(); this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('bought'); });
    c.s.market.forEach((it, i) => {
      const { x, y } = at(i + 2);
      const price = c.marketPrice(it);
      const full = c.s.bag.length >= BAG_MAX;
      this.content.add(this.itemCard(x, y, TILE_W, TILE_H, it, c, {
        tag: c.better(it) ? 'better' : null, price, afford: c.s.gold >= price, delta: true, lines: 2,
        button: { label: t('buy'), color: BLUE, enabled: c.s.gold >= price && !full, why: full ? 'bagFull' : 'poor', onTap: () => { c.buy(i); c.save(); this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('bought'); } },
      }));
    });
  }

  private smith(): void {
    const c = this.camp, s = this.scene;
    SLOTS.forEach((slot, i) => {
      const y = TOP + 46 + i * (SMITH_H + 14);
      const it = c.s.gear[slot];
      if (!it) {
        const box = s.add.container(CX, y);
        box.add(themeCard(s, 0, 0, ROW_W, SMITH_H));
        box.add(labelAt(s, 0, -10, t('slot_' + slot), V_NAME));
        box.add(labelAt(s, 0, 20, t('empty'), V_DESC));
        this.content.add(box);
        return;
      }
      const maxed = it.up >= MAX_UP;
      const cost = upgradeCost(it);
      this.content.add(this.itemCard(CX, y, ROW_W, SMITH_H, it, c, {
        price: maxed ? undefined : cost, afford: c.s.gold >= cost, lines: 3,
        button: { label: maxed ? t('maxed') : t('upgrade'), color: GOLDC, enabled: !maxed && c.s.gold >= cost, why: maxed ? 'maxed' : 'poor', onTap: () => { c.upgrade(slot); c.save(); this.host.sfx('anvil', 0.6); this.host.changed(); this.build(); this.toast('upgraded'); } },
      }));
    });
  }

  /** The notice board: two columns of three. */
  private quests(): void {
    const c = this.camp, s = this.scene;
    QUEST_IDS.forEach((q, i) => {
      const x = CX + (i % 2 ? 1 : -1) * (TILE_W / 2 + 7), y = TOP + 56 + Math.floor(i / 2) * (QUEST_H + 12);
      const st = c.s.quests[q];
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, TILE_W, QUEST_H));
      const top = -QUEST_H / 2;
      box.add(s.add.image(-TILE_W / 2 + 44, top + 46, icon(st === 'done' ? 'coin' : st === 'open' ? 'marker' : 'skull')).setDisplaySize(52, 52).setAlpha(st === 'locked' ? 0.5 : 1));
      box.add(fitWidth(labelAt(s, -TILE_W / 2 + 80, top + 34, t('q_' + q), V_NAME, 0), TILE_W - 100));
      box.add(labelAt(s, -TILE_W / 2 + 80, top + 60, t('quest' + st[0].toUpperCase() + st.slice(1)), V_STATE[st], 0));
      box.add(new Para(s, -TILE_W / 2 + 80, top + 78, t('qd_' + q), V_DESC, QUEST_PARA, 0, 18));
      box.add(new FmtLine(s, TILE_W / 2 - 24, QUEST_H / 2 - 24, V_STAT, 1).set('questReward', { n: QUEST[q].gold }));
      if (st === 'locked') box.setAlpha(0.7);
      this.content.add(box);
    });
  }
}

// ------------------------------------------------------------------ the hero

export class HeroScreen extends Panel {
  private pick: number | null = null;

  constructor(scene: Phaser.Scene, private camp: Campaign, host: ScreenHost, onClose: () => void, start = 0) {
    super(scene, host, { board: [BOARD_W, BOARD_H], side: true, title: t('heroTitle'), sub: t('heroSub') });
    this.onClose = onClose;
    this.tab = start;
    this.makeTabs(['tabGear', 'tabTalents', 'tabCombos', 'tabCards'], 180, () => { this.pick = null; this.build(); });
    this.keysLine();
    this.leaveButton('close');
    this.build();
  }

  private build(): void {
    this.clear();
    this.purse(this.camp);
    [this.gear, this.talents, this.combos, this.cards][this.tab].call(this);
    if (this.fi >= this.focus.length) this.fi = this.focus.length - 1;
    this.showFocus();
  }

  private gear(): void {
    const c = this.camp, s = this.scene;
    const st = c.stats();
    // the stats strip
    const strip = s.add.container(CX, TOP);
    strip.add(themeCard(s, 0, 0, ROW_W, STATS_H));
    const cells: [string, string][] = [
      ['statHp', String(st.maxHp)], ['statAtk', fmtNum(st.atk)], ['statDef', fmtNum(st.def * 100) + '%'],
      ['statCrit', fmtNum(st.crit * 100) + '%'], ['statCdr', fmtNum(st.cdr * 100) + '%'], ['statSpeed', fmtNum(st.speed * 100) + '%'],
    ];
    cells.forEach(([k, v], i) => {
      const cx = -ROW_W / 2 + 66 + i * ((ROW_W - 132) / 5);
      strip.add(fitWidth(labelAt(s, cx, -14, t(k), V_DESC), 116));
      strip.add(new GlyphText(s, cx, 16, v, V_NAME, 0.5));
    });
    this.content.add(strip);
    // what is worn
    SLOTS.forEach((slot, i) => {
      const x = CX + (i - 1) * (GEAR_W + 14), y = 206;
      const it = c.s.gear[slot];
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, GEAR_W, GEAR_H));
      box.add(labelAt(s, 0, -GEAR_H / 2 + 22, t('slot_' + slot), V_DESC));
      if (it) {
        const col = Phaser.Display.Color.HexStringToColor(RARITY_INK[it.rarity]).color;
        const g = s.add.graphics();
        g.fillStyle(col, 0.2).fillCircle(0, -12, 30).lineStyle(3, col, 1).strokeCircle(0, -12, 30);
        box.add(g);
        box.add(s.add.image(0, -12, itemIcon(it, c.s.cls)).setDisplaySize(50, 50));
        box.add(fitWidth(labelAt(s, 0, 34, itemName(it, c.s.cls), V_NAME), GEAR_W - 24, 0.86));
        const [stat, v] = statLines(it)[0];
        box.add(new FmtLine(s, 0, 58, V_STAT, 0.5).set('st_' + stat, { n: fmtNum(v) }));
        if (it.up) box.add(new GlyphText(s, GEAR_W / 2 - 18, -GEAR_H / 2 + 22, '+' + it.up, V_PRICE, 1));
      } else box.add(labelAt(s, 0, 10, t('empty'), V_DESC));
      this.content.add(box);
    });
    // the bag, and SELL WEAKER for what is worse than what is worn
    this.content.add(new FmtLine(s, CX - ROW_W / 2 + 10, 306, S_INFO, 0).set('bagN', { n: c.s.bag.length, of: BAG_MAX }));
    const weaker = c.s.bag.filter((it) => !c.better(it));
    const sw = new KitButton(s, CX + ROW_W / 2 - 110, 306, { w: 200, h: 50, color: STONE, label: t('sellWeaker'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
      if (!sw.enabled) { this.deny(sw, 'nothingWeaker'); return; }
      let g = 0;
      for (const it of weaker) g += c.sell(it.id);
      c.save(); this.pick = null; this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('soldFor', { n: g });
    });
    sw.setEnabled(weaker.length > 0);
    this.content.add(sw);
    this.addFocus(sw, CX + ROW_W / 2 - 110, 306);
    for (let i = 0; i < BAG_MAX; i++) {
      const x = CX + ((i % 6) - 2.5) * (SLOT_W + 8), y = 382 + Math.floor(i / 6) * (SLOT_H + 6);
      const it = c.s.bag[i];
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, SLOT_W, SLOT_H).setAlpha(it ? 1 : 0.45));
      if (it) {
        const col = Phaser.Display.Color.HexStringToColor(RARITY_INK[it.rarity]).color;
        const g = s.add.graphics();
        g.lineStyle(this.pick === it.id ? 5 : 3, this.pick === it.id ? 0xffd23f : col, 1).strokeRoundedRect(-SLOT_W / 2 + 8, -SLOT_H / 2 + 8, SLOT_W - 16, SLOT_H - 16, 8);
        box.add(g);
        box.add(s.add.image(0, -4, itemIcon(it, c.s.cls)).setDisplaySize(54, 54));
        if (c.better(it)) box.add(s.add.image(SLOT_W / 2 - 20, -SLOT_H / 2 + 22, icon('marker')).setDisplaySize(24, 24));
        if (it.up) box.add(new GlyphText(s, 0, SLOT_H / 2 - 22, '+' + it.up, V_PRICE, 0.5));
        const hit = new KitButton(s, 0, 0, { w: SLOT_W, h: SLOT_H, kind: 'plate', color: STONE, sfx: 'ui-click' }, () => { this.pick = this.pick === it.id ? null : it.id; this.build(); });
        hit.face.setAlpha(0.01);
        box.add(hit);
        this.addFocus(hit, x, y);
      }
      this.content.add(box);
    }
    // the picked item: its full card against what is worn, with EQUIP and SELL
    const it = c.s.bag.find((b) => b.id === this.pick);
    const y = 614;
    if (it) {
      const card = this.itemCard(CX, y, ROW_W, DETAIL_H, it, c, { tag: c.better(it) ? 'better' : 'worse', lines: 3, delta: true });
      if (c.s.gear[it.slot]) card.add(labelAt(s, ROW_W / 2 - 24, -DETAIL_H / 2 + 56, t('vsWorn'), V_KEY, 1));
      const eq = new KitButton(s, ROW_W / 2 - 126, DETAIL_H / 2 - 40, { w: 200, h: 64, color: BLUE, label: t('equip'), style: S_BTN_S, sfx: null }, () => {
        c.equip(it.id); c.save(); this.pick = null; this.host.sfx('equip', 0.5); this.host.changed(); this.build(); this.toast('equipped');
      });
      const sl = new KitButton(s, ROW_W / 2 - 340, DETAIL_H / 2 - 40, { w: 200, h: 64, color: CRIMSON, label: t('sell'), style: S_BTN_S, sfx: null }, () => {
        const g = c.sell(it.id); c.save(); this.pick = null; this.host.sfx('buy', 0.5); this.host.changed(); this.build(); this.toast('soldFor', { n: g });
      });
      sl.setLabel(t('sell'), 0);
      if (sl.label) sl.label.x = -34;
      sl.addContent(s.add.image(26, 0, icon('coin')).setDisplaySize(22, 22), new GlyphText(s, 40, 0, String(Math.round(itemValue(it) / 3)), S_PURSE, 0).setScale(0.8));
      card.add([eq, sl]);
      this.content.add(card);
      this.addFocus(eq, CX + ROW_W / 2 - 126, y + DETAIL_H / 2 - 40);
      this.addFocus(sl, CX + ROW_W / 2 - 340, y + DETAIL_H / 2 - 40);
    } else if (c.s.bag.length) this.content.add(new Para(s, CX, y - 10, t('pickItem'), V_DESC2, CW - 80, 0.5, 22).setAlpha(0.85));
  }

  /** The class's three combos side by side: finisher, kind, rank, what it does, the inputs, its rank's power. */
  private combos(): void {
    const c = this.camp, s = this.scene, cls = c.s.cls;
    this.content.add(labelAt(s, CX, TOP - 26, t('combosOf', { name: t('c_' + cls) }), S_INFO));
    this.content.add(new Para(s, CX, TOP - 8, t('combatOnly'), S_SUB, CW - 40, 0.5, 22));
    COMBO_IDS.forEach((cb: ComboId, i) => {
      const x = CX + (i - 1) * (COMBO_W + 14), y = 404;
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, COMBO_W, COMBO_H));
      const top = -COMBO_H / 2, L = -COMBO_W / 2 + 18;
      box.add(s.add.image(0, top + 50, icon('cb-' + cb)).setDisplaySize(58, 58));
      box.add(fitWidth(labelAt(s, 0, top + 104, t(`fn_${cls}_${cb}`), V_FIN), COMBO_W - 30));
      box.add(labelAt(s, 0, top + 132, t('cb_' + cb), V_DESC));
      const rank = c.rankOf(cb);
      const g = s.add.graphics();
      for (let r = 0; r < MAX_RANK; r++) {
        const px = (r - 1) * 26, py = top + 156;
        g.fillStyle(r < rank ? 0xe0b24a : 0x8a7a6a, r < rank ? 1 : 0.35).fillCircle(px, py, 9);
        g.lineStyle(2, 0x3a2a10, 1).strokeCircle(px, py, 9);
      }
      box.add(g);
      const desc = new Para(s, L, top + 176, t(`fd_${cls}_${cb}`), V_DESC2, COMBO_W - 34, 0, 21);
      box.add(desc);
      // the inputs: touch and keys (the player's own first)
      let yy = top + 186 + desc.textHeight;
      const touchFirst = this.host.touch;
      for (const k of touchFirst ? ['t', 'k'] : ['k', 't']) {
        box.add(labelAt(s, L, yy + 10, t(k === 't' ? 'touchL' : 'keysL') + ':', V_KEY, 0));
        const p = new Para(s, L, yy + 22, t(`in_${cb}_${k}`), V_DESC2, COMBO_W - 34, 0, 21);
        box.add(p);
        yy += 30 + p.textHeight;
      }
      if (rank) box.add(new Para(s, L, yy + 6, t(rankKey(cls, cb, rank)), V_UP, COMBO_W - 34, 0, 21));
      this.content.add(box);
    });
  }

  /** The power cards of the journey: three columns. */
  private cards(): void {
    const c = this.camp, s = this.scene;
    this.content.add(new FmtLine(s, CX, TOP - 20, S_INFO, 0.5).set('cardsN', { n: c.s.cards.length, of: HAND_MAX }));
    if (!c.s.cards.length) { this.content.add(new Para(s, CX, TOP + 40, t('noCards'), S_SUB, CW - 80, 0.5, 26)); return; }
    c.s.cards.forEach((id, i) => {
      const x = CX + ((i % 3) - 1) * (TILE3_W + 14), y = TOP + 92 + Math.floor(i / 3) * (TILE3_H + 12);
      this.content.add(cardTile(s, x, y, id));
    });
  }

  /** Eight talents in three columns. */
  private talents(): void {
    const c = this.camp, s = this.scene;
    this.content.add(new FmtLine(s, CX, TOP - 20, S_INFO, 0.5).set('pointsN', { n: c.s.points }));
    TALENT_IDS.forEach((id, i) => {
      const x = CX + ((i % 3) - 1) * (TILE3_W + 14), y = TOP + 92 + Math.floor(i / 3) * (TILE3_H + 12);
      const box = s.add.container(x, y);
      box.add(themeCard(s, 0, 0, TILE3_W, TILE3_H));
      const skill = id === 'skill1' ? CLASS[c.s.cls].skills[0] : id === 'skill2' ? CLASS[c.s.cls].skills[1] : null;
      const top = -TILE3_H / 2, L = -TILE3_W / 2 + 18;
      box.add(s.add.image(L + 28, top + 44, icon(skill ? 'sk-' + skill.id : talentIcon(id))).setDisplaySize(54, 54));
      box.add(fitWidth(labelAt(s, L + 64, top + 32, skill ? t('sk_' + skill.id) : t('tl_' + id), V_NAME, 0), TILE3_W - 96));
      box.add(fitWidth(labelAt(s, L + 64, top + 58, skill ? t('tld_skill') : t('tld_' + id), V_DESC, 0), TILE3_W - 96));
      const rank = c.s.talents[id], max = TALENT_MAX[id];
      const g = s.add.graphics();
      for (let k = 0; k < max; k++) {
        const px = L + 12 + k * 24, py = TILE3_H / 2 - 40;
        g.fillStyle(k < rank ? 0xe0b24a : 0x8a7a6a, k < rank ? 1 : 0.35).fillCircle(px, py, 9);
        g.lineStyle(2, 0x3a2a10, 1).strokeCircle(px, py, 9);
      }
      box.add(g);
      const can = c.s.points > 0 && rank < max;
      const b = new KitButton(s, TILE3_W / 2 - 46, TILE3_H / 2 - 42, { w: 64, h: 64, kind: 'round', color: BLUE, label: '+', style: { size: 34 }, tapWhenOff: true, sfx: null }, () => {
        if (!b.enabled) { this.deny(b, rank >= max ? 'maxed' : 'noPoints'); return; }
        c.spendTalent(id); c.save(); this.host.sfx('levelup', 0.5); this.host.changed(); this.build();
      });
      b.setEnabled(can);
      box.add(b);
      this.content.add(box);
      this.addFocus(b, x + TILE3_W / 2 - 46, y + TILE3_H / 2 - 42);
    });
  }
}

const talentIcon = (id: TalentId): string => ({ vigor: 'heart', might: 'pw-rage', focus: 'pw-haste', precision: 'sword', fortune: 'coin', potion: 'potion' } as Record<string, string>)[id] ?? 'marker';

// ------------------------------------------------------------------ class select

/** The class board on the right of the live 3D hero; `onSee` swaps the hero shown, `onPick` starts. */
export class ClassScreen extends Panel {
  private sel: ClassId;

  constructor(scene: Phaser.Scene, cur: ClassId, host: ScreenHost, private onSee: (c: ClassId) => void, private onPick: (c: ClassId) => void, private closable: boolean) {
    super(scene, host, { dim: 0 });
    this.sel = cur;
    const { height } = scene.scale;
    this.root.addAt(scene.add.image(CLASS_BOARD_X, height / 2 + SKIN_PAD / 2, skinTexture(scene, 'board', CLASS_BOARD_W, BOARD_H)), 1);
    this.root.add(fitWidth(labelAt(scene, CLASS_BOARD_X, 66, t('chooseTitle'), S_TITLE), CLASS_BOARD_W - 60));
    this.build();
  }

  private build(): void {
    this.clear();
    const s = this.scene, x0 = CLASS_BOARD_X;
    CLASS_IDS.forEach((cls, i) => {
      const x = x0 + ((i % 3) - 1) * (CLASS_W + 10), y = 166 + Math.floor(i / 3) * (CLASS_H + 10);
      const on = cls === this.sel;
      const b = new KitButton(s, x, y, { w: CLASS_W, h: CLASS_H, kind: 'plate', color: on ? BLUE : STONE, on, sfx: null }, () => {
        if (this.sel === cls) { this.onPick(cls); return; }
        this.sel = cls; this.host.sfx('move', 0.45); this.onSee(cls); this.build();
      });
      b.addContent(s.add.image(0, -20, icon('sk-' + CLASS[cls].skills[0].id)).setDisplaySize(60, 60));
      b.addContent(fitWidth(labelAt(s, 0, 38, t('c_' + cls), { ...S_CLASS, color: on ? '#fff2cc' : '#f4ead8', stroke: INK, strokeWidth: 4, shadow: true }), CLASS_W - 20));
      this.content.add(b);
      this.addFocus(b, x, y);
    });
    // the chosen class: name, line, its three combo finishers and both skills
    const c = CLASS[this.sel];
    this.content.add(fitWidth(labelAt(s, x0, 408, t('c_' + this.sel), S_CLASS_BIG), CLASS_BOARD_W - 60));
    this.content.add(new Para(s, x0, 430, t('cd_' + this.sel), S_SUB, CLASS_BOARD_W - 70, 0.5, 24));
    COMBO_IDS.forEach((cb, i) => {
      const cx = x0 + (i - 1) * 200;
      this.content.add(s.add.image(cx - 74, 502, icon('cb-' + cb)).setDisplaySize(40, 40));
      this.content.add(fitWidth(labelAt(s, cx - 48, 502, t(`fn_${this.sel}_${cb}`), S_INFO, 0), 140));
    });
    c.skills.forEach((sk, k) => {
      const x = x0 + (k ? 150 : -150);
      this.content.add(s.add.image(x - 104, 556, icon('sk-' + sk.id)).setDisplaySize(44, 44));
      this.content.add(fitWidth(labelAt(s, x - 76, 556, t('sk_' + sk.id), S_INFO, 0), 200));
    });
    const go = new KitButton(s, x0, 638, { w: 300, h: 70, color: BLUE, label: t('choose'), style: S_BTN, sfx: 'ui-click' }, () => this.onPick(this.sel));
    this.content.add(go);
    this.addFocus(go, x0, 638);
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
    const s = scene, { width, height } = s.scale;
    this.root.add(themeCard(s, width / 2, height / 2, MAP_W, MAP_H));
    // the hexes seen so far, in ink and wash (on the left)
    const R = 21, ox = 300, oy = 372;
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
      if (known && h.road) { g.fillStyle(0x8a5a2a, 0.9).fillCircle(p.x, p.y, 3); }
    }
    this.root.add(g);
    for (const pl of PLACE_IDS) {
      const [c, r] = PLACE_HEX[pl];
      const h = map.at(c, r);
      if (!seen.has(h.i)) continue;
      const p = pos(c, r);
      this.root.add(s.add.image(p.x, p.y - 2, icon(placeIcon(pl))).setDisplaySize(26, 26));
      this.root.add(labelAt(s, p.x, p.y + 22, t('p_' + pl), S_MAP_PLACE));
    }
    for (const cp of CAMPS) {
      const h = map.at(cp.hex[0], cp.hex[1]);
      if (!seen.has(h.i) || camp.s.camps.includes(cp.id)) continue;
      const p = pos(cp.hex[0], cp.hex[1]);
      this.root.add(s.add.image(p.x, p.y, icon('banner')).setDisplaySize(28, 28));
    }
    if (seen.has(map.at(BRIDGE[0], BRIDGE[1]).i) && !camp.bridgeOpen()) { const p = pos(BRIDGE[0], BRIDGE[1]); this.root.add(labelAt(s, p.x, p.y + 22, t('p_bridge'), S_MAP_PLACE)); }
    const th = camp.trackedHex();
    if (th) {
      const p = pos(th[0], th[1]);
      const m = s.add.image(p.x, p.y - 24, icon('marker')).setDisplaySize(34, 34);
      this.root.add(m);
      s.tweens.add({ targets: m, y: p.y - 32, duration: 500, yoyo: true, repeat: -1 });
    }
    const pp = pos(camp.s.pos[0], camp.s.pos[1]);
    const party = s.add.graphics();
    party.fillStyle(0x2c4a9a, 1).fillCircle(pp.x, pp.y, 10).lineStyle(4, 0xffd23f, 1).strokeCircle(pp.x, pp.y, 10);
    this.root.add(party);
    s.tweens.add({ targets: party, alpha: 0.4, duration: 450, yoyo: true, repeat: -1 });
    // the right column: the title, the tracked quest and what to do, the legend
    const rx = 890;
    this.root.add(fitWidth(labelAt(s, rx, 70, t('mapTitle'), { ...S_TITLE, size: 46 }), 600));
    const q = camp.tracked();
    let y = 130;
    if (q || camp.s.victory) {
      this.root.add(labelAt(s, rx, y, t('tracked'), V_KEY));
      y += 34;
      if (q) this.root.add(fitWidth(labelAt(s, rx, y, t('q_' + q), V_BIG), MAP_PARA));
      y += 26;
      const p = new Para(s, rx, y, q ? t('qd_' + q) : t('sumDone'), V_LEG, MAP_PARA, 0.5, 24);
      this.root.add(p);
      y += p.textHeight + 26;
    }
    const lg = s.add.graphics();
    this.root.add(lg);
    LEGEND.forEach((k, i) => {
      const ly = Math.max(y, 330) + i * 40, lx = rx - 200;
      if (k === 'lgYou') lg.fillStyle(0x2c4a9a, 1).fillCircle(lx, ly, 10).lineStyle(4, 0xffd23f, 1).strokeCircle(lx, ly, 10);
      else this.root.add(s.add.image(lx, ly, icon(({ lgGoal: 'marker', lgVillage: 'heart', lgDungeon: 'marker', lgCastle: 'skull', lgCamp: 'banner' } as Record<string, string>)[k])).setDisplaySize(30, 30).setAlpha(k === 'lgDungeon' ? 0.75 : 1));
      this.root.add(labelAt(s, lx + 30, ly, t(k), V_LEG, 0));
    });
    this.focus.push({ btn: this.leaveButton('close', rx, 640), x: rx, y: 640 });
    this.fi = 0;
    this.showFocus();
    void QUEST;
  }

  key(code: string): boolean {
    if (code === 'KeyM') { this.close(); return true; }
    return super.key(code);
  }
}

const placeIcon = (pl: string): string => (pl === 'village' ? 'heart' : pl === 'castle' ? 'skull' : 'marker');

// ------------------------------------------------------------------ the spoils

/** The spoils: the gold, the XP, a level and the quest on the left; the items on the right (EQUIP the better ones). */
export class LootScreen extends Panel {
  constructor(scene: Phaser.Scene, sp: Spoils, private camp: Campaign, host: ScreenHost, onClose: () => void) {
    super(scene, host, { dim: 0.55, board: [LOOT_W, LOOT_H] });
    this.onClose = onClose;
    const s = scene, { width, height } = s.scale;
    const lx = width / 2 - LOOT_W / 2 + 250, top = height / 2 - LOOT_H / 2;
    let y = top + 76;
    this.root.add(fitWidth(labelAt(s, lx, y, t('victory'), S_TITLE), LOOT_SIDE));
    y += 78;
    this.root.add(s.add.image(lx - 110, y, icon('coin')).setDisplaySize(40, 40));
    this.root.add(new FmtLine(s, lx - 82, y, S_GOLD_LINE, 0).set('goldN', { n: sp.gold + sp.questGold }));
    y += 50;
    this.root.add(new FmtLine(s, lx - 82, y, S_XP_LINE, 0).set('xpN', { n: sp.xp }));
    y += 56;
    if (sp.levels) {
      const lv = new FmtLine(s, lx, y, S_GREEN_LINE, 0.5).set('levelUpSub', { n: camp.s.level });
      if (lv.textWidth > LOOT_SIDE) lv.setScale(LOOT_SIDE / lv.textWidth);
      this.root.add(lv);
      const s0 = lv.scale;
      lv.setScale(s0 * 0.5);
      s.tweens.add({ targets: lv, scale: s0, duration: 420, ease: 'Back.easeOut', delay: 200 });
      const ly = y;
      s.time.delayedCall(260, () => {
        if (this.closed) return;
        const em = s.add.particles(lx, ly, SPARK, {
          speed: { min: 90, max: 330 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
          blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 750 }, tint: [0xa8ff9a, 0xffd23f, 0xffffff], emitting: false,
        });
        this.root.add(em);
        em.explode(36);
        s.time.delayedCall(1000, () => em.destroy());
      });
      y += 50;
    }
    if (sp.quest) { const p = new Para(s, lx, y - 16, t('questDoneN', { name: t('q_' + sp.quest) }), S_GREEN_LINE, LOOT_SIDE, 0.5, 32); this.root.add(p); y += p.textHeight + 14; }
    if (sp.staff || sp.quest === 'port') { const p = new Para(s, lx, y - 16, t(sp.staff ? 'staffFound' : 'beltUp'), S_GREEN_LINE, LOOT_SIDE, 0.5, 32); this.root.add(p); y += p.textHeight + 10; }
    if (sp.sold) this.root.add(new FmtLine(s, lx, top + LOOT_H - 150, S_SUB, 0.5).set('soldN', { n: sp.sold }));
    const go = new KitButton(s, lx, top + LOOT_H - 82, { w: 300, h: 70, color: BLUE, label: t('onward'), style: S_BTN }, () => this.close());
    this.root.add(go);
    // the items, each with EQUIP when it beats what is worn
    const rx = width / 2 + LOOT_W / 2 - 30 - LOOT_ROW_W / 2;
    const items = sp.items.slice(0, 4);
    if (!items.length) this.root.add(new Para(s, rx, height / 2 - 20, t('lootNone'), S_SUB, 620, 0.5, 26));
    const y0 = height / 2 - ((items.length - 1) * (LOOT_ROW_H + 12)) / 2;
    items.forEach((it, i) => {
      const iy = y0 + i * (LOOT_ROW_H + 12);
      const inBag = () => camp.s.bag.some((b) => b.id === it.id);
      const better = camp.better(it) && inBag();
      const card = this.itemCard(rx, iy, LOOT_ROW_W, LOOT_ROW_H, it, camp, { tag: better ? 'better' : null, lines: 3, delta: true });
      if (better) {
        const eq: KitButton = new KitButton(s, LOOT_ROW_W / 2 - 82, LOOT_ROW_H / 2 - 36, { w: 132, h: 54, color: MOSS, label: t('equip'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
          if (!eq.enabled || !inBag()) return;
          camp.equip(it.id); camp.save(); this.host.sfx('equip', 0.5); this.host.changed();
          eq.setLabel(t('equipped')).setEnabled(false);
          this.toast('equipped');
        });
        card.add(eq);
        this.focus.push({ btn: eq, x: rx + LOOT_ROW_W / 2 - 82, y: iy + LOOT_ROW_H / 2 - 36 });
      }
      this.root.add(card);
      card.setScale(0.6).setAlpha(0);
      s.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, delay: 180 + i * 90, ease: 'Back.easeOut' });
    });
    this.focus.push({ btn: go, x: lx, y: top + LOOT_H - 82 });
    this.fi = this.focus.length - 1;
    this.showFocus();
  }
}

// ------------------------------------------------------------------ power cards

/** A card in a list (the hero screen): its picture on a rarity disc, name, rarity and what it does. */
export function cardTile(s: Phaser.Scene, x: number, y: number, id: string): Phaser.GameObjects.Container {
  const def = CARD[id];
  const c = s.add.container(x, y);
  c.add(themeCard(s, 0, 0, TILE3_W, TILE3_H));
  const col = CARD_COLOR[def.rarity];
  const top = -TILE3_H / 2, L = -TILE3_W / 2 + 18;
  const g = s.add.graphics();
  g.fillStyle(col.glow, 0.35).fillCircle(L + 28, top + 42, 28);
  g.lineStyle(3, col.gem, 1).strokeCircle(L + 28, top + 42, 28);
  c.add(g);
  c.add(s.add.image(L + 28, top + 42, icon(def.icon)).setDisplaySize(44, 44));
  c.add(fitWidth(labelAt(s, L + 66, top + 30, t('k_' + id), V_NAME, 0), TILE3_W - 100));
  c.add(labelAt(s, L + 66, top + 56, t('r_' + def.rarity), V_RARITY(def.rarity as Rarity), 0));
  c.add(new Para(s, L, top + 80, t('kd_' + id), V_DESC, TILE3_W - 34, 0, 19));
  return c;
}

/** A card face for the draft: the painted frame of its rarity, the picture, its name and what it does. */
export function cardFace(s: Phaser.Scene, x: number, y: number, id: string): Phaser.GameObjects.Container {
  const def = CARD[id];
  const c = s.add.container(x, y);
  c.add(s.add.image(0, 0, CARD_KEY(def.rarity)));
  c.add(labelAt(s, 0, -CARD_H / 2 + 40, t('r_' + def.rarity), { ...V_RARITY(def.rarity as Rarity), size: 15 }));
  c.add(s.add.image(0, -CARD_H / 2 + 104, icon(def.icon)).setDisplaySize(72, 72));
  c.add(fitWidth(labelAt(s, 0, 2, t('k_' + id), V_CARD), CARD_W - 54));
  c.add(new Para(s, 0, 24, t('kd_' + id), V_CARD_D, CARD_W - 54, 0.5, 21));
  return c;
}

/**
 * The draft: three cards side by side (rarity odds richer after a boss or a camp), one reroll. A tap
 * (or Enter on the focused card, or 1–3) takes it; the card stays until the journey ends.
 */
export class DraftScreen extends Panel {
  private faces: { c: Phaser.GameObjects.Container; id: string; hit: KitButton }[] = [];
  private glow: Phaser.GameObjects.Image;
  private rerolled = false;
  private picked = false;
  private reroll!: KitButton;

  constructor(scene: Phaser.Scene, private camp: Campaign, host: ScreenHost, private offer: string[], private rich: boolean, private onPick: (id: string) => void) {
    super(scene, host, { board: [DRAFT_W, DRAFT_H], title: t('draftTitle'), sub: t('draftSub'), dim: 0.7, titleY: 78 });
    this.glow = scene.add.image(0, 0, CARD_GLOW).setVisible(false);
    this.root.add(this.glow);
    this.deal(false);
  }

  private deal(again: boolean): void {
    const s = this.scene, x0 = s.scale.width / 2, y = DRAFT_Y;
    for (const f of this.faces) f.c.destroy();
    this.faces = [];
    this.focus = [];
    this.offer.forEach((id, i) => {
      const x = x0 + (i - 1) * (CARD_W + 40);
      const c = cardFace(s, x, y, id);
      const hit = new KitButton(s, 0, 0, { w: CARD_W, h: CARD_H, kind: 'plate', color: STONE, sfx: null }, () => this.take(i));
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
      this.reroll = new KitButton(s, x0, y + CARD_H / 2 + 56, { w: 240, h: 70, color: STONE, label: t('reroll'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (this.rerolled || this.picked) { this.deny(this.reroll, 'maxed'); return; }
        this.rerolled = true;
        this.offer = this.camp.dealCards(this.rich);
        this.host.sfx('page', 0.5);
        this.reroll.setEnabled(false);
        this.deal(true);
      });
      this.reroll.addContent(s.add.image(-96, 0, icon('card')).setDisplaySize(40, 40));
      this.root.add(this.reroll);
      this.keysLine('draftKeys', x0, y + CARD_H / 2 + 112);
    }
    this.addFocus(this.reroll, x0, y + CARD_H / 2 + 56);
    this.fi = this.host.touch ? -1 : 1;
    this.showGlow();
    this.host.sfx(again ? 'page' : 'shrine', 0.45);
  }

  private showGlow(): void {
    const f = this.faces[this.fi];
    if (!f || this.host.touch) { this.glow.setVisible(false); return; }
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    this.root.bringToTop(this.glow);
    this.root.bringToTop(f.c);
  }

  protected showFocus(): void { super.showFocus(); this.showGlow(); }

  key(code: string): boolean {
    if (code === 'Escape') return true;
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { this.take(Number(code.slice(5)) - 1); return true; }
    if (code === 'KeyR') { this.reroll.emit('pointerup', { wasTouch: false }); return true; }
    return super.key(code);
  }

  /** The card is taken: it rises and glows, the others fall away. */
  take(i: number): void {
    const f = this.faces[i];
    if (!f || this.picked) return;
    this.picked = true;
    this.camp.takeCard(f.id);
    this.camp.save();
    this.host.sfx(CARD[f.id].rarity === 'legendary' || CARD[f.id].rarity === 'epic' ? 'fanfare' : 'power', 0.5);
    this.host.changed();
    const s = this.scene;
    this.faces.forEach((o, k) => { if (k !== i) s.tweens.add({ targets: o.c, y: o.c.y + 60, alpha: 0, duration: 260 }); });
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    s.tweens.add({ targets: [f.c, this.glow], x: s.scale.width / 2, y: DRAFT_Y, scale: 1.12, duration: 320, ease: 'Back.easeOut' });
    s.time.delayedCall(330, () => {
      if (this.closed) return;
      const em = s.add.particles(s.scale.width / 2, DRAFT_Y, SPARK, {
        speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint: [CARD_COLOR[CARD[f.id].rarity].glow, 0xffffff, 0xffd23f], emitting: false,
      });
      this.root.add(em);
      em.explode(40);
    });
    s.time.delayedCall(900, () => { this.close(); this.onPick(f.id); });
  }
}

/**
 * Beside the pause card (added to the Pause scene as it opens): the cards of the journey on the
 * left; the tracked quest (and what to do) and the controls on the right.
 */
export function pauseCards(scene: Phaser.Scene, cards: string[], quest: QuestId | null, done: boolean, touch: boolean): void {
  const y = 316;
  const root = scene.add.container(0, 0).setDepth(5);
  const lx = 196, rx = 1084, top = y - PCARDS_H / 2;
  // the cards
  root.add(themeCard(scene, lx, y, PCARDS_W, PCARDS_H));
  root.add(labelAt(scene, lx, top + 34, t('yourCards'), P_HEAD));
  if (!cards.length) root.add(new Para(scene, lx, top + 62, t('noCards'), P_BODY, PCARDS_W - 50, 0.5, 21));
  cards.slice(0, HAND_MAX).forEach((id, i) => {
    const x = lx - PCARDS_W / 2 + 46, yy = top + 82 + i * 52;
    const def = CARD[id];
    const g = scene.add.graphics();
    g.fillStyle(CARD_COLOR[def.rarity].glow, 0.45).fillCircle(x, yy, 18).lineStyle(2, CARD_COLOR[def.rarity].gem, 1).strokeCircle(x, yy, 18);
    root.add(g);
    root.add(scene.add.image(x, yy, icon(def.icon)).setDisplaySize(28, 28));
    root.add(fitWidth(labelAt(scene, x + 28, yy, t('k_' + id), P_NAME, 0), PCARDS_W - 100));
  });
  // the quest and the controls
  root.add(themeCard(scene, rx, y, PCARDS_W, PCARDS_H));
  let yy = top + 34;
  root.add(labelAt(scene, rx, yy, t('pQuest'), P_HEAD));
  yy += 30;
  if (quest) { root.add(fitWidth(labelAt(scene, rx, yy, t('q_' + quest), P_NAME), PCARDS_W - 50)); yy += 20; }
  const qp = new Para(scene, rx, yy, quest ? t('qd_' + quest) : done ? t('sumDone') : '', P_BODY, PCARDS_W - 50, 0.5, 21);
  root.add(qp);
  yy += qp.textHeight + 30;
  root.add(labelAt(scene, rx, yy, t('pControls'), P_HEAD));
  root.add(new Para(scene, rx, yy + 22, t(touch ? 'ctlTouch' : 'ctlKeys'), P_BODY, PCARDS_W - 50, 0.5, 21));
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
}

export { xpToNext, CW };
