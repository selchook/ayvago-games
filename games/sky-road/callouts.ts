// Sky Road's words in play: the level-up shout and the pickups' pops, painted as labels in the
// theme's Racing Sans One with the logo's sunny gradient and navy outline (theme.ts). They are
// painted ahead under the intro (the theme's prebake), so a pickup only places an image.
import { Phaser, t, labelAt, labelTexture, type LabelStyle } from '@core';

/** The theme's navy outline (theme.ts; kept here, theme.ts imports this file). */
const NAVY = '#0d2a55';

/** "SPEED UP!": the logo's white-to-amber gradient. */
export const S_LEVEL: LabelStyle = { size: 54, fill: ['#ffffff', '#fff2a6', '#ffb21a'], stroke: NAVY, strokeWidth: 8 };
/** "+10" from a coin: gold. */
export const S_COIN: LabelStyle = { size: 36, fill: ['#fffbe0', '#ffd23f', '#e08a10'], stroke: NAVY, strokeWidth: 6 };
/** "+1 ♥" from a heart: pink. */
export const S_HEART: LabelStyle = { size: 40, fill: ['#ffe6ef', '#ff5d8f', '#c8285a'], stroke: NAVY, strokeWidth: 6 };

export const COIN_POP = '+10';
export const HEART_POP = '+1 ♥';

/** Paints the run's words ahead (under the intro). */
export function prebakeCallouts(scene: Phaser.Scene): void {
  labelTexture(scene, t('levelUp'), S_LEVEL);
  labelTexture(scene, COIN_POP, S_COIN);
  labelTexture(scene, HEART_POP, S_HEART);
}

/** A word that rises and fades from (x, y), like the core's popup, in the theme's face. */
export function pop(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle): void {
  const img = labelAt(scene, x, y, s, o).setDepth(6000);
  img.setScale(0.6);
  scene.tweens.add({ targets: img, scale: 1, duration: 160, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: img, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
}
