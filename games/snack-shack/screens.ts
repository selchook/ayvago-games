// Snack Shack's own screens in the menu theme (theme.ts): the day's intro card (the chalkboard),
// the day's result (an order ticket) and the upgrade shop (a chalkboard menu with awning rows).
// The styles and sizes they share live here, and `prebakeScreens` paints every piece and every
// fixed label of them in Boot under the Ayvago intro (the theme's `prebake`), so opening a screen
// only places images; the new items' names are the only live text.
import Phaser from 'phaser';
import { t, skinTexture, labelTexture, bakeFmt, glyphAtlas, type LabelStyle, type SkinState } from '@core';
import { UPGRADES } from './sim';
import { RED, TEAL, GREEN, CHALK, INK, LABEL_STROKE, CHALK_INK, SHOP_W, shopH, ticketTexture } from './theme';

const S = LABEL_STROKE;

export const ROW = { w: 620, h: 92 };
export const PRICE = { w: 118, h: 44 };
export const RESULT_BTN = { w: 420, h: 92 };
export const OPEN_BTN = { w: 460, h: 96 };
export const ROW_COLOR = 0x3a5048;
export const PRICE_COLOR = { can: GREEN, poor: 0x9a3a32, max: 0x5a6670 };

/** The chalk headings: the day's number, the shop's title. */
export const DAY_TITLE: LabelStyle = { size: 64, fill: ['#fffbe6', '#ffe27a', '#ffb020'], stroke: S, strokeWidth: 10 };
export const SHOP_TITLE: LabelStyle = { size: 44, fill: ['#fffbe6', '#ffe27a', '#ffb020'], stroke: S, strokeWidth: 8 };
export const CHALK_LINE: LabelStyle = { size: 30, color: CHALK_INK, stroke: null, shadow: false, body: true };
export const CHALK_SMALL: LabelStyle = { size: 24, color: '#9fe3ff', stroke: null, shadow: false, body: true };
/** On the ticket: the heading in red, the rows in ink, the values per colour. */
export const TICKET_TITLE: LabelStyle = { size: 44, color: '#c42a1e', stroke: null, shadow: false };
export const TICKET_ROW: LabelStyle = { size: 28, color: INK, stroke: null, shadow: false, body: true };
export const tickValue = (color: string): LabelStyle => ({ size: 32, color, stroke: null, shadow: false });
export const VALUE_COLORS = { happy: '#1f8a3e', angry: '#c42a1e', plain: INK, gold: '#b07a00' };
export const HEART_BACK: LabelStyle = { size: 26, color: '#d0306a', stroke: null, shadow: false, body: true };
/** The shop's rows. */
export const ROW_NAME: LabelStyle = { size: 25, color: '#ffffff', stroke: S, strokeWidth: 4, shadow: false };
export const ROW_DESC: LabelStyle = { size: 20, color: '#e6f0ea', stroke: null, shadow: false, body: true };
export const PRICE_STYLE: LabelStyle = { size: 24, color: '#ffffff', stroke: S, strokeWidth: 4, shadow: false };
export const WALLET: LabelStyle = { size: 28, color: CHALK_INK, stroke: null, shadow: false, body: true };
export const KEY_TAG: LabelStyle = { size: 16, color: '#ffd23f', stroke: S, strokeWidth: 4, shadow: false, body: true };
export const OPEN_LABEL: LabelStyle = { size: 34 };
export const BTN = { shop: 32 };

/** Every face, card and fixed line of the day's intro, its result and the shop (current language). */
export function prebakeScreens(scene: Phaser.Scene): void {
  const btn = (w: number, h: number, color: number) => { for (const st of ['up', 'over', 'down'] as SkinState[]) skinTexture(scene, 'button', w, h, st, color); };
  // the intro
  bakeFmt(scene, 'dayN', ['n'], DAY_TITLE);
  labelTexture(scene, t('goal'), CHALK_LINE);
  labelTexture(scene, t('rushDay'), CHALK_LINE);
  // the result ticket
  ticketTexture(scene);
  bakeFmt(scene, 'dayDone', ['n'], TICKET_TITLE);
  for (const k of ['happy', 'angry', 'earned', 'tipsToday', 'starBonus', 'bestCombo']) labelTexture(scene, t(k), TICKET_ROW);
  for (const c of Object.values(VALUE_COLORS)) glyphAtlas(scene, tickValue(c));
  labelTexture(scene, t('heartBack'), HEART_BACK);
  btn(RESULT_BTN.w, RESULT_BTN.h, TEAL);
  labelTexture(scene, t('toShop'), { size: BTN.shop });
  // the shop
  for (const rows of [UPGRADES.filter((u) => u.day <= 1).length, UPGRADES.length]) skinTexture(scene, 'board', SHOP_W, shopH(rows), 'up', CHALK);
  labelTexture(scene, t('shopTitle'), SHOP_TITLE);
  labelTexture(scene, t('yourTips') + ':', WALLET);
  glyphAtlas(scene, WALLET);
  for (const st of ['up', 'on'] as SkinState[]) skinTexture(scene, 'plate', ROW.w, ROW.h, st, ROW_COLOR);
  for (const c of Object.values(PRICE_COLOR)) skinTexture(scene, 'plate', PRICE.w, PRICE.h, 'up', c);
  for (const u of UPGRADES) {
    labelTexture(scene, t('u_' + u.id), ROW_NAME);
    labelTexture(scene, t('d_' + u.id), ROW_DESC);
  }
  labelTexture(scene, t('maxed'), PRICE_STYLE);
  glyphAtlas(scene, PRICE_STYLE);
  glyphAtlas(scene, KEY_TAG);
  btn(OPEN_BTN.w, OPEN_BTN.h, RED);
  bakeFmt(scene, 'openDay', ['n'], OPEN_LABEL);
}
