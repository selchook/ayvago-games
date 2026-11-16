// Crypt Crawler's own screens in the menu theme (theme.ts): the shrine's three blessings, the
// floor-cleared card and the camp (lasting upgrades). The styles and sizes they share live here,
// and `prebakeScreens` paints every piece and every fixed label of them in Boot under the Ayvago
// intro (the theme's `prebake`), so opening a screen only places images: no text is rasterised.
import Phaser from 'phaser';
import { t, getLang, skinTexture, labelTexture, bakeFmt, bakePara, glyphAtlas, type LabelStyle, type SkinState } from '@core';
import { UPGRADES, META } from './sim';
import { upKey, metaKey } from './strings';
import { CRYPT, NIGHT, MOSSY, OAK, LABEL_STROKE, BONE } from './theme';

const S = LABEL_STROKE;

export const BLESSING = { w: 620, h: 176 };
export const CLEAR = { w: 580, h: 560 };
export const CAMP = { w: 640, h: 845 };
export const CAMP_ROW = { w: 600, h: 92 };
export const BANK = { w: 300, h: 60 };
export const NEXT_BTN = { w: 400, h: 96 };
export const ENTER_BTN = { w: 460, h: 96 };
export const BLESS_COLOR = 0x3a3346;
export const ROW_COLOR = 0x3a3442;

export const TITLE: LabelStyle = { size: 50, fill: ['#fff6dc', '#f2d8a0', '#d8902a'], stroke: S, strokeWidth: 8 };
export const SUB: LabelStyle = { size: 28, color: '#f4ead4', stroke: S, strokeWidth: 5, shadow: false, body: true };
export const NAME: LabelStyle = { size: 32, color: '#ffffff', stroke: S, strokeWidth: 5, shadow: false };
export const DESC: LabelStyle = { size: 25, color: '#ddd4ec', stroke: null, shadow: false, body: true };
export const LEVEL: LabelStyle = { size: 22, color: '#ffd27a', stroke: S, strokeWidth: 4, shadow: false, body: true };
export const NEW_TAG: LabelStyle = { size: 22, color: '#8aff9a', stroke: S, strokeWidth: 4, shadow: false, body: true };
export const NUM: LabelStyle = { size: 22, color: '#bfb6cc', stroke: null, shadow: false, body: true };
export const CLEAR_TITLE: LabelStyle = { size: 44, fill: ['#fff6dc', '#f2d8a0', '#d8902a'], stroke: S, strokeWidth: 8 };
export const STAT: LabelStyle = { size: 30, color: BONE, stroke: null, shadow: false, body: true };
export const STAT_VALUE: LabelStyle = { size: 34, color: '#ffffff', stroke: S, strokeWidth: 5, shadow: false };
export const CAMP_SUB: LabelStyle = { size: 24, color: '#d8d0e0', stroke: null, shadow: false, body: true };
export const BANK_LABEL: LabelStyle = { size: 24, color: '#d8d0e0', stroke: null, shadow: false, body: true };
export const BANK_VALUE: LabelStyle = { size: 30, color: '#ffd23f', stroke: S, strokeWidth: 5, shadow: false };
export const ROW_NAME: LabelStyle = { size: 27, color: '#ffffff', stroke: S, strokeWidth: 4, shadow: false };
export const ROW_DESC: LabelStyle = { size: 21, color: '#d0c8e0', stroke: null, shadow: false, body: true };
export const price = (k: 'can' | 'poor' | 'max'): LabelStyle => ({ size: 28, color: k === 'can' ? '#ffd23f' : k === 'poor' ? '#9a8a7a' : '#8aff9a', stroke: S, strokeWidth: 4, shadow: false });
export const BTN = { next: 36, enter: 34 };
export const DESC_W = BLESSING.w - 190;
export const SUB_W = 580;

/** The NEW tag of a blessing not taken yet (the game's own word). */
export const newWord = (): string => (getLang() === 'tr' ? 'YENİ' : 'NEW');

/** Every face, card and fixed line of the shrine, the cleared card and the camp (current language). */
export function prebakeScreens(scene: Phaser.Scene): void {
  const btn = (w: number, h: number, color: number) => { for (const st of ['up', 'over', 'down'] as SkinState[]) skinTexture(scene, 'button', w, h, st, color); };
  // the shrine
  for (const st of ['up', 'over'] as SkinState[]) skinTexture(scene, 'plate', BLESSING.w, BLESSING.h, st, BLESS_COLOR);
  labelTexture(scene, t('shrine'), TITLE);
  labelTexture(scene, t('choose'), SUB);
  for (const u of UPGRADES) {
    labelTexture(scene, t(upKey(u)), NAME);
    bakePara(scene, t(upKey(u) + '_d'), DESC, DESC_W);
  }
  bakeFmt(scene, 'levelN', ['n'], LEVEL);
  labelTexture(scene, newWord(), NEW_TAG);
  glyphAtlas(scene, NUM);
  // the floor-cleared card
  skinTexture(scene, 'board', CLEAR.w, CLEAR.h, 'up', NIGHT);
  bakeFmt(scene, 'floorClear', ['n'], CLEAR_TITLE);
  for (const k of ['statGold', 'statKills', 'statTime', 'statUpgrades']) labelTexture(scene, t(k), STAT);
  glyphAtlas(scene, STAT_VALUE);
  btn(NEXT_BTN.w, NEXT_BTN.h, MOSSY);
  labelTexture(scene, t('next'), { size: BTN.next });
  // the camp
  skinTexture(scene, 'board', CAMP.w, CAMP.h, 'up', NIGHT);
  labelTexture(scene, t('camp'), TITLE);
  bakePara(scene, t('campSub'), CAMP_SUB, SUB_W);
  skinTexture(scene, 'plate', BANK.w, BANK.h, 'up', CRYPT);
  labelTexture(scene, t('bank'), BANK_LABEL);
  glyphAtlas(scene, BANK_VALUE);
  for (const st of ['up', 'on'] as SkinState[]) skinTexture(scene, 'plate', CAMP_ROW.w, CAMP_ROW.h, st, ROW_COLOR);
  for (const m of META) {
    labelTexture(scene, t(metaKey(m)), ROW_NAME);
    labelTexture(scene, t(metaKey(m) + '_d'), ROW_DESC);
  }
  for (const k of ['can', 'poor', 'max'] as const) glyphAtlas(scene, price(k));
  labelTexture(scene, t('maxed'), price('max'));
  btn(ENTER_BTN.w, ENTER_BTN.h, OAK);
  labelTexture(scene, t('enter'), { size: BTN.enter });
}
