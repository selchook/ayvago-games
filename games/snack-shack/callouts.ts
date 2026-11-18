// Snack Shack's in-play words in the menu theme's look (theme.ts): the banner ("Closing time!"),
// every floating callout ("+42", "COMBO ×3", "Burnt!", "Lightning fast!") and the tags on the
// stations are painted labels in the theme's Spicy Rice with the diner's dark-brown outline, gold
// ones in the day title's mustard gradient, cached by string (labelTexture). The fixed lines are
// painted ahead under the Ayvago intro (`prebakePlay`, from the theme's prebake); lines with a
// number are painted the first time they show, then reused. Sentences ("Nobody ordered that")
// stay in the body font, in the same colours.
import Phaser from 'phaser';
import { t, labelAt, labelTexture, fitWidth, type LabelStyle } from '@core';
import { LABEL_STROKE } from './theme';
import { STATION_DAY } from './sim';

const S = LABEL_STROKE;

/** The day title's mustard (screens.ts DAY_TITLE), for gold callouts. */
const MUSTARD = ['#fffbe6', '#ffe27a', '#ffb020'];

/** A callout's style: the theme face a fifth bigger than the old pixel face's size, or the body font. */
export function popStyle(color: string, size: number, body = false): LabelStyle {
  const px = Math.round(size * (body ? 1.15 : 1.2));
  return {
    size: px,
    ...(color === '#ffd23f' ? { fill: MUSTARD } : { color }),
    stroke: S,
    strokeWidth: Math.max(4, Math.round(px * (body ? 0.24 : 0.2))),
    ...(body ? { body: true } : {}),
  };
}

/** A callout that floats up and fades (as the core's popup, in the theme's look). */
export function pop(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28, body = false, depth = 6000): void {
  const img = labelAt(scene, x, y, s, popStyle(color, size, body)).setDepth(depth);
  fitWidth(img, scene.scale.width - 40);
  const m = 20;
  img.x = Phaser.Math.Clamp(x, img.displayWidth / 2 + m, scene.scale.width - img.displayWidth / 2 - m);
  scene.tweens.add({ targets: img, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
}

/** The banner's fills for the colours the scene asks for. */
const BANNER_FILL: Record<string, string[]> = {
  '#ffd23f': MUSTARD,
  '#ffb070': ['#fff6e8', '#ffc890', '#f07a2a'],
  '#7dffa0': ['#f4fff6', '#bdf5c8', '#3fbf62'],
};

export const bannerStyle = (color: string): LabelStyle =>
  ({ size: 44, fill: BANNER_FILL[color] ?? [color, color], stroke: S, strokeWidth: 9 });

/** The tags on the stations: their key number and the day a locked one opens. */
export const tagStyle = (color: string, size: number): LabelStyle =>
  ({ size: Math.round(size * 1.1), color, stroke: S, strokeWidth: 4, shadow: false });

/** The callouts with a fixed text, as the scene shows them: [key, colour, size, body]. */
const FIXED: [string, string, number, boolean][] = [
  ['poor', '#ff8a7a', 26, false],
  ['bought', '#7dffa0', 30, false],
  ['burnt', '#ff8a7a', 26, false],
  ['binned', '#c9d3ea', 22, false],
  ['fast', '#9fe3ff', 24, false],
  ['angryPop', '#ff6a5a', 30, false],
  ['e_busy', '#ffb0a0', 24, true],
  ['e_nobody', '#ffb0a0', 24, true],
  ['e_empty', '#ffb0a0', 24, true],
  ['e_platesFull', '#ffb0a0', 24, true],
];

/** Paints the Play scene's fixed words ahead (under the Ayvago intro, in the current language). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, c, s, body] of FIXED) labelTexture(scene, t(k), popStyle(c, s, body));
  for (let n = 2; n <= 8; n++) labelTexture(scene, t('comboPop', { n }), popStyle('#ff9a3c', 40));
  labelTexture(scene, t('closing'), bannerStyle('#ffb070'));
  labelTexture(scene, t('revived'), bannerStyle('#7dffa0'));
  for (let i = 1; i <= 7; i++) labelTexture(scene, String(i), tagStyle('#ffd23f', 18));
  for (const n of new Set(Object.values(STATION_DAY))) labelTexture(scene, t('lockDay', { n }), tagStyle('#ffffff', 20));
}
