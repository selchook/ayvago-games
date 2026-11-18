// Crypt Crawler: the in-play callouts' looks (floor banners, guardians, floating words, damage
// numbers, the hover tag) in the menu theme's New Rocker, torch-gilded in each callout's colour
// and outlined in the crypt's soot (the theme's labelStroke). `prebakeCallouts` paints the fixed
// ones in Boot under the Ayvago intro, so a floor paints nothing new when they first show.
import Phaser from 'phaser';
import { t, upper, labelTexture, glyphAtlas, type LabelStyle } from '@core';
import { LABEL_STROKE } from './theme';
import { ENEMIES, UPGRADES } from './sim';
import { bossKey, upKey } from './strings';

/** The size banners are painted at (scaled to each banner). */
export const BANNER_PX = 64;
/** The size floating words and numbers are painted at. */
export const FLOAT_PX = 32;

/** `c` mixed toward `to` by k (both #rrggbb). */
function mix(c: string, to: string, k: number): string {
  const a = parseInt(c.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/** A callout in the theme's face: torchlit on top, the colour in the middle, ember-dark at the foot. */
export function calloutStyle(color: string, size = BANNER_PX): LabelStyle {
  return { size, fill: [mix(color, '#fff6dc', 0.6), color, mix(color, '#3a1a10', 0.38)], stroke: LABEL_STROKE, strokeWidth: Math.round(size * 0.16) };
}

/** A banner's second line: bone white in the display face. */
export const SUB_STYLE: LabelStyle = { size: 30, color: '#f4ead4', stroke: LABEL_STROKE, strokeWidth: 6 };
/** The desktop hover tag over chests, doors and the stairs. */
export const TIP_STYLE: LabelStyle = { size: 24, color: '#f4ead4', stroke: LABEL_STROKE, strokeWidth: 5 };

/** Damage and gem numbers: their colours, one glyph atlas each. */
export const NUM_PLAIN = '#ffffff', NUM_BIG = '#8affe8', NUM_GEM = '#9ff3ff';
export const NUM_CHARS = '0123456789+';

/** The fixed floating words and their colours (PlayScene.floatText). */
const FLOATS: Array<[string, string]> = [
  ['blocked', '#c8e0ff'], ['heal', '#ff8aa0'], ['gotKey', '#ffd23f'], ['cleared', '#bfffb0'], ['rage', '#ff6a4a'],
  ['unlocked', '#ffd23f'], ['needKey', '#ffd23f'],
];

export function prebakeCallouts(scene: Phaser.Scene): void {
  for (let n = 1; n <= 12; n++) {
    labelTexture(scene, t('floorN', { n }), calloutStyle('#ffe9b0'));
    labelTexture(scene, t('floorN', { n }), calloutStyle('#ff8a6a'));
    labelTexture(scene, t('floorN', { n }), SUB_STYLE);
  }
  for (const k of ['floorSub', 'bossFloor']) labelTexture(scene, t(k), SUB_STYLE);
  labelTexture(scene, t('bossDown'), calloutStyle('#ffd23f'));
  for (const kind of Object.keys(ENEMIES) as Array<keyof typeof ENEMIES>) {
    if (ENEMIES[kind].boss) labelTexture(scene, upper(t(bossKey(kind))), calloutStyle('#ff8a6a'));
  }
  for (const [k, c] of FLOATS) labelTexture(scene, t(k), calloutStyle(c, FLOAT_PX));
  labelTexture(scene, '✶ ✶', calloutStyle('#ffe08a', FLOAT_PX));
  for (const u of UPGRADES) labelTexture(scene, t(upKey(u)), calloutStyle('#ffd27a', FLOAT_PX));
  for (const c of [NUM_PLAIN, NUM_BIG, NUM_GEM]) glyphAtlas(scene, calloutStyle(c, FLOAT_PX), NUM_CHARS);
  for (const k of ['chest', 'clickOpen', 'lockedDoor', 'sealedDoor', 'pot', 'altar', 'stairs']) labelTexture(scene, t(k), TIP_STYLE);
}
