// Marble Maze's in-play words in the menu theme's look (theme.ts): the level's name as it starts,
// GO!, the CENTRE button and every floating callout ("Checkpoint!", "Gate open!", "3/5") are
// painted labels in the theme's Grandstander with the walnut-ink outline of the menu, cached by
// string (labelTexture). The fixed lines are painted ahead under the Ayvago intro
// (`prebakePlay`, from the theme's prebake in screens.ts); lines with a number are painted the
// first time they show, then reused.
import Phaser from 'phaser';
import { t, loc, labelAt, labelTexture, fitWidth, type LabelStyle } from '@core';
import { LEVELS } from './levels';

// the theme's ink (theme.ts imports screens.ts, which imports this file, so it is repeated here)
const INK = '#2a160a';

/** The level's name over the board as it starts: cream to brass, as the menu's title. */
export const LEVEL_NAME: LabelStyle = { size: 52, fill: ['#ffffff', '#fff1d0', '#ffd36b'], stroke: INK, strokeWidth: 10 };
/** GO!: the green of the level-clear title. */
export const GO: LabelStyle = { size: 70, fill: ['#e8ffe0', '#7be05a', '#2e8a2a'], stroke: INK, strokeWidth: 12 };
/** The CENTRE button's word. */
export const CENTRE: LabelStyle = { size: 18, color: '#fff8ec', stroke: INK, strokeWidth: 5, shadow: false };

/** A callout's style: the theme face a fifth bigger than the old pixel face's size (it reads the same). */
export function popStyle(color: string, size: number): LabelStyle {
  const px = Math.round(size * 1.2);
  return { size: px, color, stroke: INK, strokeWidth: Math.max(4, Math.round(px * 0.2)) };
}

/** A callout that floats up and fades (as the core's popup, in the theme's look). */
export function pop(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28): void {
  const img = labelAt(scene, x, y, s, popStyle(color, size)).setDepth(6000);
  fitWidth(img, scene.scale.width - 40);
  const m = 20;
  img.x = Phaser.Math.Clamp(x, img.displayWidth / 2 + m, scene.scale.width - img.displayWidth / 2 - m);
  scene.tweens.add({ targets: img, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
}

/** Paints the Play scene's fixed words ahead (under the Ayvago intro, in the current language). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const lv of LEVELS) labelTexture(scene, loc(lv.name), LEVEL_NAME);
  labelTexture(scene, t('go'), GO);
  labelTexture(scene, t('centre'), CENTRE);
  labelTexture(scene, t('centred'), popStyle('#5dff7a', 24));
  for (const k of ['tiltDenied', 'tiltNone']) labelTexture(scene, t(k), popStyle('#ff9a7a', 22));
  labelTexture(scene, t('goalOpen'), popStyle('#5dff7a', 26));
  labelTexture(scene, t('checkpoint'), popStyle('#5dff7a', 24));
}
