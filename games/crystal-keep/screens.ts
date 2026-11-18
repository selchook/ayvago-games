// Crystal Keep's own screens in the menu theme (theme.ts): the map select (map tablets, the
// talents row and the powers loadout), the map-cleared card, the card draft and the list of owned
// cards. The styles and sizes they share live here, and `prebakeScreens` paints every piece and
// every fixed label of them in Boot under the Ayvago intro (the theme's `prebake`), so opening a
// screen only places images; descriptions and counts that change are the only live text.
// Cinzel sets lower case as small capitals, where i and ı look alike: every name in the display
// face is upper-cased for the language first (`upper`), so Turkish keeps its İ and I apart.
import Phaser from 'phaser';
import { t, upper, skinTexture, labelTexture, bake, bakeFmt, bakePara, glyphAtlas, type LabelStyle, type SkinState } from '@core';
import { MAPS, POWER_IDS, POWERS, type CardId } from './sim';
import { CARDS, RARITY_COLOR, type Rarity } from './cards';
import { POWER_COLOR } from './ui';

import { AMETHYST, STONE, SLATE, EMERALD, LABEL_STROKE } from './theme';
import { prebakeTalents } from './talentsui';
import { prebakePlay } from './callouts';

const S = LABEL_STROKE;

// ------------------------------------------------------------------ sizes and colours

export const MAP_TILE = { w: 214, h: 316 };
export const PLAY_BTN = { w: 340, h: 96 };
export const SHARD_CHIP = { w: 176, h: 76 };
export const TALENTS_BTN = { w: 270, h: 76 };
export const NEW_BADGE = { w: 96, h: 36 };
export const NEW_COLOR = 0xd8304a;
export const LOADOUT = { w: 4 * 124 + 3 * 14 + 40, h: 236 };
export const POWER_TILE = 124;
export const CLEAR_CARD = { w: 620, h: [720, 640] as const };
export const NEXT_BTN = { w: 380, h: 92 };
export const FINISH_BTN = { w: 300, h: 76 };
export const DRAFT_BTN = { w: 220, h: 84 };
/** The owned-cards list: the board comes in a few heights (the list picks the first that fits). */
export const LIST_W = 660;
export const LIST_H = [420, 560, 700, 840, 980, 1140];
export const MAX_REROLLS = 3;

// ------------------------------------------------------------------ label styles

export const TITLE: LabelStyle = { size: 48, fill: ['#ffffff', '#f2dcff', '#c58cff'], stroke: S, strokeWidth: 8 };
export const GOLD_TITLE: LabelStyle = { size: 48, fill: ['#fffbe6', '#ffe08a', '#e8a020'], stroke: S, strokeWidth: 8 };
export const CLEAR_TITLE: LabelStyle = { size: 46, fill: ['#ffffff', '#c8ffd8', '#4ac87a'], stroke: S, strokeWidth: 8 };
export const MAP_NAME: LabelStyle = { size: 23, color: '#ffffff', stroke: S, strokeWidth: 4, shadow: false };
export const MAP_SUB: LabelStyle = { size: 20, color: '#d8ccec', stroke: null, shadow: false, body: true };
export const CLEAR_MAP: LabelStyle = { size: 28, color: '#d8ccec', stroke: null, shadow: false };
export const LOCK: LabelStyle = { size: 20, color: '#ffd27a', stroke: S, strokeWidth: 5, shadow: false, body: true };
export const DONE: LabelStyle = { size: 28, color: '#9dffb8', stroke: S, strokeWidth: 5 };
export const NEXT_TAG: LabelStyle = { size: 17, color: '#9dffb8', stroke: S, strokeWidth: 4, shadow: false };
export const HINT: LabelStyle = { size: 22, color: '#efe6ff', stroke: S, strokeWidth: 5, shadow: false, body: true };
export const SHARDS: LabelStyle = { size: 30, color: '#f0d0ff', stroke: S, strokeWidth: 5, shadow: false };
export const BADGE: LabelStyle = { size: 17, color: '#ffffff', stroke: null, shadow: false, body: true };
export const POWERS_HEAD: LabelStyle = { size: 22, color: '#ffd27a', stroke: S, strokeWidth: 4, shadow: false };
export const powerName = (on: boolean): LabelStyle => ({ size: 16, color: on ? '#ffffff' : '#c8bcd8', stroke: S, strokeWidth: 4, shadow: false });
export const POWER_KEY: LabelStyle = { size: 16, color: '#e8e0f8', stroke: null, shadow: false, body: true };
export const SLOWER: LabelStyle = { size: 18, color: '#ffc27a', stroke: null, shadow: false, body: true };
export const LINE: LabelStyle = { size: 26, color: '#ffffff', stroke: null, shadow: false, body: true };
export const BONUS: LabelStyle = { size: 30, color: '#ffd23f', stroke: null, shadow: false, body: true };
export const EARNED: LabelStyle = { size: 30, color: '#f0d0ff', stroke: S, strokeWidth: 4, shadow: false, body: true };
export const TALENT_HINT: LabelStyle = { size: 21, color: '#ffd27a', stroke: null, shadow: false, body: true };
export const DRAFT_SUB: LabelStyle = { size: 22, color: '#e6ecff', stroke: S, strokeWidth: 5, shadow: false, body: true };
export const LIST_TITLE: LabelStyle = { size: 40, fill: ['#fffbe6', '#ffe08a', '#e8a020'], stroke: S, strokeWidth: 7 };
export const cardName = (r: Rarity): LabelStyle => ({ size: 23, color: RARITY_COLOR[r].text, stroke: null, shadow: false });
export const RARITY_TAG = (r: Rarity): LabelStyle => ({ size: 14, color: RARITY_COLOR[r].text, stroke: null, shadow: false, body: true });
export const LIST_HINT: LabelStyle = { size: 19, color: '#c8bcd8', stroke: null, shadow: false, body: true };
export const BTN = { play: 36, next: 34, finish: 26, draft: 26, talents: 26 };
export const LOCK_W = MAP_TILE.w - 30;
export const HINT_W = 560;

/** The NEW badge on the TALENTS button: a red stone pill. */
export function badgeTexture(scene: Phaser.Scene): string {
  return bake(scene, 'ck-new-badge', NEW_BADGE.w + 8, NEW_BADGE.h + 8, (c) => {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
    const g = c.createLinearGradient(0, 4, 0, NEW_BADGE.h + 4);
    g.addColorStop(0, '#ff6a80'); g.addColorStop(1, '#a8182e');
    c.fillStyle = g;
    c.beginPath(); c.roundRect(4, 4, NEW_BADGE.w, NEW_BADGE.h, NEW_BADGE.h / 2); c.fill();
    c.restore();
    c.strokeStyle = '#ffd27a'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(4, 4, NEW_BADGE.w, NEW_BADGE.h, NEW_BADGE.h / 2); c.stroke();
  });
}

/** Every face, card and fixed line of the map select, the cleared card, the draft and the card list. */
export function prebakeScreens(scene: Phaser.Scene): void {
  const btn = (w: number, h: number, color: number, off = false) => {
    for (const st of ['up', 'over', 'down', ...(off ? ['off'] : [])] as SkinState[]) skinTexture(scene, 'button', w, h, st, color);
  };
  // the map select
  for (const st of ['up', 'on', 'off'] as SkinState[]) skinTexture(scene, 'board', MAP_TILE.w, MAP_TILE.h, st);
  btn(PLAY_BTN.w, PLAY_BTN.h, AMETHYST);
  skinTexture(scene, 'plate', SHARD_CHIP.w, SHARD_CHIP.h, 'up', SLATE);
  btn(TALENTS_BTN.w, TALENTS_BTN.h, STONE);
  badgeTexture(scene);
  skinTexture(scene, 'board', LOADOUT.w, LOADOUT.h);
  for (const id of POWER_IDS) skinTexture(scene, 'plate', POWER_TILE, POWER_TILE, 'on', POWER_COLOR[id]);
  skinTexture(scene, 'plate', POWER_TILE, POWER_TILE, 'up', STONE);
  skinTexture(scene, 'plate', POWER_TILE, POWER_TILE, 'off', STONE);
  labelTexture(scene, t('chooseMap'), TITLE);
  MAPS.forEach((m) => {
    labelTexture(scene, upper(t('m_' + m.id)), MAP_NAME);
    labelTexture(scene, upper(t('m_' + m.id)), CLEAR_MAP);
    labelTexture(scene, t('wavesN', { n: m.waves.length }), MAP_SUB);
  });
  bakePara(scene, t('locked'), LOCK, LOCK_W);
  labelTexture(scene, t('mapDone'), DONE);
  labelTexture(scene, t('mapNext'), NEXT_TAG);
  labelTexture(scene, t('playMap'), { size: BTN.play });
  for (const k of ['selectTouch', 'selectKeys', 'selectKeys2']) labelTexture(scene, t(k), HINT);
  labelTexture(scene, t('talents'), { size: BTN.talents });
  labelTexture(scene, t('newBadge'), BADGE);
  glyphAtlas(scene, SHARDS);
  bakeFmt(scene, 'powersTitle', ['n', 'm'], POWERS_HEAD);
  for (const id of POWER_IDS) {
    labelTexture(scene, upper(t('p_' + id)), powerName(true));
    labelTexture(scene, upper(t('p_' + id)), powerName(false));
    labelTexture(scene, POWERS[id].key, POWER_KEY);
  }
  labelTexture(scene, t('threeSlower'), SLOWER);
  // the map-cleared card
  for (const h of CLEAR_CARD.h) skinTexture(scene, 'board', CLEAR_CARD.w, h);
  labelTexture(scene, t('mapClear'), CLEAR_TITLE);
  labelTexture(scene, t('allClear'), CLEAR_TITLE);
  bakeFmt(scene, 'livesLeft', ['n'], LINE);
  bakeFmt(scene, 'killsN', ['n'], LINE);
  bakeFmt(scene, 'bonusPts', ['n'], BONUS);
  bakeFmt(scene, 'shardsEarned', ['n'], EARNED);
  bakePara(scene, t('talentHintFirst'), TALENT_HINT, HINT_W);
  btn(NEXT_BTN.w, NEXT_BTN.h, EMERALD);
  btn(FINISH_BTN.w, FINISH_BTN.h, STONE);
  for (const k of ['nextMap', 'finish']) labelTexture(scene, t(k), { size: BTN.next });
  labelTexture(scene, t('finish'), { size: BTN.finish });
  // the draft
  labelTexture(scene, t('chooseCard'), GOLD_TITLE);
  bakeFmt(scene, 'draftSub', ['n'], DRAFT_SUB);
  btn(DRAFT_BTN.w, DRAFT_BTN.h, EMERALD, true);
  btn(DRAFT_BTN.w, DRAFT_BTN.h, STONE, true);
  labelTexture(scene, t('take'), { size: BTN.draft });
  for (let n = 0; n <= MAX_REROLLS; n++) labelTexture(scene, t('reroll', { n }), { size: BTN.draft });
  for (const k of ['draftKeys', 'draftTouch', 'draftMouse']) labelTexture(scene, t(k), HINT);
  // the card list
  for (const h of LIST_H) skinTexture(scene, 'board', LIST_W, h);
  labelTexture(scene, t('cardsTitle'), LIST_TITLE);
  for (const c of CARDS) labelTexture(scene, upper(t('c_' + (c.id as CardId))), cardName(c.rarity));
  for (const r of ['common', 'rare', 'epic'] as Rarity[]) {
    labelTexture(scene, t('r_' + r), RARITY_TAG(r));
    glyphAtlas(scene, cardName(r));
  }
  labelTexture(scene, t('cardsClose'), LIST_HINT);
  // and the talent board
  prebakeTalents(scene);
  // the Play scene's banners and callouts (callouts.ts)
  prebakePlay(scene);
}
