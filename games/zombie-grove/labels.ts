// Zombie Grove: the in-play words in the theme's display face (Rubik Wet Paint, menu.ts), painted
// once as label textures: the banners, the boss warning, the floating callouts, the damage numbers
// (glyph atlases). Colours come from the grove's palette: a pale highlight
// running into the banner's hue, the near-black ink outline.
import Phaser from 'phaser';
import { t, labelTexture, glyphAtlas, type LabelStyle } from '@core';

export const INK = '#0b1208';

/** Mixes a #rrggbb colour toward white (k > 0) or black (k < 0). */
function mix(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** A banner's title: a gradient from a pale top into the hue and a dark drip, the ink outline. */
export function bannerStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.65), color, mix(color, -0.4)], stroke: INK, strokeWidth: Math.max(6, Math.round(size * 0.16)) };
}
/** The line under a banner. */
export const S_SUB: LabelStyle = { size: 26, color: '#eef3d6', stroke: INK, strokeWidth: 5 };
/** A floating callout over the hero (+health, LEVEL 4, a card's name). */
export function floatStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.5), color], stroke: INK, strokeWidth: Math.max(5, Math.round(size * 0.2)) };
}
export const S_FLOAT_SUB: LabelStyle = { size: 20, color: '#eef3d6', stroke: INK, strokeWidth: 4 };
/** The damage numbers: bone white, and the crits in toxic gold. */
export const S_DMG: LabelStyle = { size: 22, color: '#eef3d6', stroke: INK, strokeWidth: 5, shadow: false };
export const S_CRIT: LabelStyle = { size: 30, fill: ['#fffbd0', '#ffe04a', '#c88a10'], stroke: INK, strokeWidth: 6, shadow: false };
/** The boss warning. */
export const S_WARN: LabelStyle = { size: 70, fill: ['#ffd0c0', '#ff4a3a', '#8a120a'], stroke: INK, strokeWidth: 11 };
export const S_WARN_SUB: LabelStyle = { size: 32, color: '#ffe6d8', stroke: INK, strokeWidth: 6 };
/** The card bar's heading, the banish hint and the BANISHED stamp. */
export const S_BAR_TITLE: LabelStyle = { size: 24, fill: ['#fff3c0', '#ffd23f'], stroke: INK, strokeWidth: 4, shadow: false };
export const S_BANISH_HINT: LabelStyle = { size: 17, color: '#ff8a9a', stroke: INK, strokeWidth: 3, shadow: false };
export const S_STAMP: LabelStyle = { size: 24, fill: ['#ffb0b8', '#ff4a5a', '#a01020'], stroke: INK, strokeWidth: 5 };

/** Banner colours and sizes PlayScene uses (title key → [colour, size]). */
export const BANNERS: Record<string, [string, number]> = {
  nightFalls: ['#ffb27a', 54], pw_nuke: ['#ffe07a', 48], endlessBanner: ['#ff6a7a', 58], evolution: ['#ffd23f', 56],
  rage: ['#ff6a8a', 40], horde: ['#ff8a6a', 46], dawn: ['#ffd27a', 64], secondWind: ['#ffd27a', 54], lastMinute: ['#ff8a6a', 44],
};
const SUBS = ['surviveDawn', 'endlessSub', 'dawnSub'];

/** Paints the Play scene's fixed words ahead (under the intro, and again in create for a new language). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, [c, s]] of Object.entries(BANNERS)) labelTexture(scene, t(k), bannerStyle(c, s));
  for (const k of SUBS) labelTexture(scene, t(k), S_SUB);
  labelTexture(scene, t('warning'), S_WARN);
  for (const k of ['offerPlus', 'cardsWaiting']) labelTexture(scene, t(k), floatStyle('#ffd23f', 24));
  labelTexture(scene, t('lowHp'), floatStyle('#ff7a6a', 30));
  for (const [k, st] of [['barTitle', S_BAR_TITLE], ['banishPick', S_BANISH_HINT], ['banished', S_STAMP]] as const) labelTexture(scene, t(k), st);
  glyphAtlas(scene, S_DMG);
  glyphAtlas(scene, S_CRIT);
}
