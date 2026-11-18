// Pirate Cove's floating callouts in the menu theme's look (theme.ts): "SUNK! +120", "COMBO ×3",
// "FORT DOWN!", the storm and convoy warnings, repairs and the wave bonus are painted labels in the
// theme's Berkshire Swash with the navy ink outline of the menu, gold ones in the logo's brass
// gradient, cached by string (labelTexture). The fixed lines are painted ahead under the Ayvago
// intro (`prebakeCallouts`, from the theme's prebake); lines with a number are painted the first
// time they show, then reused.
import Phaser from 'phaser';
import { t, labelAt, labelTexture, fitWidth, type LabelStyle } from '@core';
import { LABEL_STROKE } from './theme';

/** The brass of the logo and the WAVE CLEAR banner, for gold and score callouts. */
const BRASS_FILL = ['#fffbe6', '#ffe08a', '#e8b040', '#a8661a'];

/** A callout's style: the theme face a quarter bigger than the old pixel face's size (it reads the same). */
export function popStyle(color: string, size: number): LabelStyle {
  const px = Math.round(size * 1.25);
  const gold = color === '#ffd23f';
  return {
    size: px,
    ...(gold ? { fill: BRASS_FILL } : { color }),
    stroke: LABEL_STROKE,
    strokeWidth: Math.max(4, Math.round(px * 0.2)),
  };
}

/** A callout that floats up and fades (as the core's popup, in the theme's look). */
export function pop(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28): void {
  const img = labelAt(scene, x, y, s, popStyle(color, size)).setDepth(6000).setScrollFactor(0);
  fitWidth(img, scene.scale.width - 40);
  const m = 20;
  img.x = Phaser.Math.Clamp(x, img.displayWidth / 2 + m, scene.scale.width - img.displayWidth / 2 - m);
  scene.tweens.add({ targets: img, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
}

/** The chart's north mark on the minimap. */
export const NORTH: LabelStyle = { size: 19, fill: ['#fffbe6', '#ffe08a', '#e8b040'], stroke: LABEL_STROKE, strokeWidth: 5, shadow: false };

/** The callouts with a fixed text, as the scene shows them: [key, colour, size]. */
const FIXED: [string, string, number][] = [
  ['repaired', '#7dff9a', 28],
  ['repairFull', '#7dff9a', 28],
  ['rapid', '#7fd8ff', 30],
  ['stormSoon', '#ffb36b', 30],
  ['stormHit', '#ff8a6a', 34],
  ['turnBack', '#ffb36b', 26],
  ['bossSummons', '#3dffb0', 28],
  ['bossRage', '#ff5a3c', 30],
  ['lowHull', '#ff5a3c', 32],
  ['convoyHome', '#7dff9a', 34],
  ['convoyLost', '#ff8a6a', 32],
];

/** Paints the fixed callouts and the north mark ahead (under the Ayvago intro, in the current language). */
export function prebakeCallouts(scene: Phaser.Scene): void {
  for (const [k, c, s] of FIXED) labelTexture(scene, t(k), popStyle(c, s));
  for (let n = 2; n <= 6; n++) labelTexture(scene, t('combo', { n }), popStyle('#ff9a3c', 26));
  labelTexture(scene, t('north'), NORTH);
}
