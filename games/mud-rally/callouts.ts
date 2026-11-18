// Mud Rally's words in play: the race banner, the shouts (countdown, laps, places, wrong way) and
// the small pops (cash, nitro, the view), painted as labels in the theme's Black Ops One with the
// garage's hazard gradients and dark ink, the same look as the results and the shop (panels.ts).
// The fixed ones are painted ahead under the intro (the theme's prebake); a label is cached by its
// string, so a pop of a new amount paints once.
import { Phaser, t, loc, labelAt, labelTexture, fitWidth, shadeColor, bakePara, type LabelStyle } from '@core';
import { ordinal, money } from './strings';
import { LAYOUTS } from './tracks';

/** The theme's ink (theme.ts; kept here, theme.ts imports this file). */
const INK = '#1a1410';

const hex6 = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** A gradient from pale to the colour to its shade, inked: the shouts and pops. */
export function calloutStyle(color: string, size: number): LabelStyle {
  const c = parseInt(color.slice(1), 16);
  return { size, fill: [hex6(shadeColor(c, 0.75)), color, hex6(shadeColor(c, -0.35))], stroke: INK, strokeWidth: Math.max(5, Math.round(size * 0.14)) };
}

/** The race banner: hazard orange like the results' title, the track's name in white under it. */
export const S_BANNER: LabelStyle = { size: 64, fill: ['#fff4c8', '#ffc21a', '#e0700e'], stroke: INK, strokeWidth: 10 };
export const S_BANNER_SUB: LabelStyle = { size: 34, color: '#ffffff', stroke: INK, strokeWidth: 7 };
/** The first race's control hints: the words in the display face, the sentence in the body font. */
export const S_HINT_HEAD: LabelStyle = { size: 24, color: '#ffc21a', stroke: INK, strokeWidth: 5 };
export const S_HINT_KEY: LabelStyle = { size: 22, color: '#ffc21a', stroke: null, shadow: false };
export const S_HINT_BODY: LabelStyle = { size: 21, color: '#ffffff', stroke: INK, strokeWidth: 4, body: true };
/** The key on a light key cap. */
export const S_CAP: LabelStyle = { size: 15, color: '#24324a', stroke: null, shadow: false };

/** Every shout of the race, with its colour and size (PlayScene.shout). */
export const SHOUT = {
  count: ['#ffd23f', 130], go: ['#7dff9a', 120], wrongWay: ['#ff6b6b', 60], missedCp: ['#ff6b6b', 40],
  first: ['#ffd23f', 76], podium: ['#ffffff', 76], back: ['#ff7a7a', 76], finalLap: ['#ff9f43', 64], lap: ['#ffffff', 64],
} as const satisfies Record<string, readonly [string, number]>;
/** The pops (PlayScene.pop). */
export const POP = { nitroGo: ['#ffb02e', 30], noMoney: ['#ff7a7a', 28], cash: ['#ffd23f', 26], nitroUp: ['#ff9f43', 26], view: ['#ffffff', 24] } as const satisfies Record<string, readonly [string, number]>;

/** A shout's style by its kind. */
export const shoutStyle = (k: keyof typeof SHOUT): LabelStyle => calloutStyle(SHOUT[k][0], SHOUT[k][1]);
export const popStyle = (k: keyof typeof POP): LabelStyle => calloutStyle(POP[k][0], POP[k][1]);

/** Paints the race's fixed words ahead (under the intro). */
export function prebakeCallouts(scene: Phaser.Scene): void {
  for (let n = 1; n <= 12; n++) labelTexture(scene, t('raceN', { n }), S_BANNER);
  for (const l of LAYOUTS) labelTexture(scene, loc(l.name), S_BANNER_SUB);
  for (const n of ['3', '2', '1']) labelTexture(scene, n, shoutStyle('count'));
  labelTexture(scene, t('go'), shoutStyle('go'));
  labelTexture(scene, t('wrongWay'), shoutStyle('wrongWay'));
  labelTexture(scene, t('missedCp'), shoutStyle('missedCp'));
  labelTexture(scene, t('finalLap'), shoutStyle('finalLap'));
  for (let n = 2; n <= 4; n++) labelTexture(scene, t('lapN', { n }), shoutStyle('lap'));
  for (let p = 1; p <= 8; p++) labelTexture(scene, t('placeShout', { p: ordinal(p) }), shoutStyle(p === 1 ? 'first' : p < 4 ? 'podium' : 'back'));
  labelTexture(scene, t('nitroGo'), popStyle('nitroGo'));
  labelTexture(scene, t('noMoney'), popStyle('noMoney'));
  labelTexture(scene, '+1 ' + t('nitroUp'), popStyle('nitroUp'));
  for (const k of ['camCockpit', 'camClassic']) labelTexture(scene, t(k), popStyle('view'));
  labelTexture(scene, t('hintSteer'), S_HINT_HEAD);
  for (const k of ['hintSteer', 'gas', 'hintBrake', 'nitroUp']) labelTexture(scene, t(k), S_HINT_KEY);
  bakePara(scene, t('hintPedals'), S_HINT_BODY, 400);
  for (const k of ['camHintKeys', 'camHintTouch', 'camHintKeysOut', 'camHintTouchOut']) labelTexture(scene, t(k), S_HINT_BODY);
  // the cash pickups' amounts, race by race (PlayScene: 500 + 15% a race, to the 50)
  for (let n = 1; n <= 12; n++) labelTexture(scene, '+' + money(Math.round((500 * (1 + 0.15 * (n - 1))) / 50) * 50), popStyle('cash'));
  labelTexture(scene, t('keySpace'), S_CAP);
  labelTexture(scene, 'C', S_CAP);
}

/** A word that rises and fades from (x, y), like the core's popup, in the theme's face. */
export function pop(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle): void {
  const img = fitWidth(labelAt(scene, x, y, s, o), scene.scale.width - 120).setDepth(6000).setScrollFactor(0);
  scene.tweens.add({ targets: img, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
}
