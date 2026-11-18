// Snow Express: the in-play words in the theme's display face (Baloo 2, theme.ts), painted once as
// label textures: the level and Rush banners, the callouts by the tracks, the "+1" over a cabin
// (Rush points in glyphs), the tip's OK button. Colours come from the winter palette: a snowy top
// running into the banner's hue, the deep navy outline.
import Phaser from 'phaser';
import { t, labelTexture, glyphAtlas, type LabelStyle } from '@core';
import { LEVELS } from './levels';
import { CSS, type ColorId } from './defs';

export const NAVY = '#12305e';

/** Mixes a #rrggbb colour toward white (k > 0) or black (k < 0). */
function mix(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** A banner's word: a snowy top into the hue and a deeper base, the navy outline. */
export function bannerStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.75), color, mix(color, -0.22)], stroke: NAVY, strokeWidth: Math.max(6, Math.round(size * 0.18)) };
}
/** The line under a banner. */
export function subStyle(color: string): LabelStyle { return { size: 28, color, stroke: NAVY, strokeWidth: 7 }; }
/** "+1" (or Rush points) over a cabin, in the train's colour. */
export function plusStyle(color: string): LabelStyle { return { size: 36, fill: [mix(color, 0.6), color], stroke: NAVY, strokeWidth: 8 }; }
/** The tip card's OK button. */
export const S_OK: LabelStyle = { size: 28, color: '#ffffff', stroke: null, shadow: false };

/** Banner words PlayScene uses (key → [colour, size]). */
const BANNERS: Record<string, [string, number]> = {
  plowOut: ['#ffb35a', 34], blocked: ['#ffb35a', 26], cleared: ['#bfe6ff', 30], stuck: ['#9fd8ff', 32], lost: ['#9fd8ff', 32],
  crash: ['#ff5a4f', 64], lastHeart: ['#ff7a8a', 36], cocoaOn: ['#ffcf9a', 40], globeOn: ['#bfe6ff', 44], newColor: ['#ffffff', 36],
  wrong: ['#9fd8ff', 40], rush: ['#ffd23f', 54], tut_arrow: ['#ffffff', 28],
};

/** Paints the Play scene's fixed words ahead (under the intro, and again in create for a new language). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, [c, s]] of Object.entries(BANNERS)) labelTexture(scene, t(k), bannerStyle(c, s));
  for (let i = 0; i <= 3; i++) labelTexture(scene, t('perfect' + i), bannerStyle('#7dffa0', 40));
  labelTexture(scene, t('go'), subStyle('#ffffff'));
  for (const d of LEVELS) {
    labelTexture(scene, t('levelN', { n: d.id }), bannerStyle('#ffffff', 54));
    if (d.intro) labelTexture(scene, t(d.intro), subStyle('#ffd23f'));
  }
  labelTexture(scene, t('tut_ok'), S_OK);
  for (const c of Object.keys(CSS) as ColorId[]) { labelTexture(scene, '+1', plusStyle(CSS[c])); glyphAtlas(scene, plusStyle(CSS[c]), '0123456789+.,'); }
  labelTexture(scene, '+1', plusStyle('#ffffff'));
  glyphAtlas(scene, plusStyle('#ffffff'), '0123456789+.,');
}
