// Crystal Keep's in-play words in the menu theme's look (theme.ts): wave banners, the map title,
// the boss ribbon and every floating callout ("Built!", "+40", "CRIT!") are painted labels in the
// theme's Cinzel Black with the keep's violet ink outline, cached by string (labelTexture). The
// fixed ones are painted ahead under the Ayvago intro (`prebakePlay`, from the theme's prebake);
// lines with a number in them are painted the first time they show, then reused.
// Cinzel sets lower case as small capitals where i and ı look alike, so every display line is
// upper-cased for the language first (`upper`); sentences use the body font in the theme colours.
import Phaser from 'phaser';
import { t, upper, labelAt, labelTexture, fitWidth, skinTexture, glyphAtlas, type LabelStyle } from '@core';
import { MAPS, ENEMIES, POWER_IDS, type EnemyKind } from './sim';
import { LABEL_STROKE } from './theme';
import { CD_STYLE } from './ui';

const S = LABEL_STROKE;

/** The banner board's width and its heights (title only, with a line, with the wave's enemies). */
export const BANNER_W = 560;
export const BANNER_H = [96, 128, 196];

/** Banner fills (top to bottom) for the colours the scene asks for. */
const BANNER_FILL: Record<string, string[]> = {
  '#ffffff': ['#ffffff', '#f2dcff', '#c58cff'],
  '#ff9a7a': ['#fff2ec', '#ffb49a', '#e0503a'],
  '#ffd23f': ['#fffbe6', '#ffe08a', '#e8a020'],
  '#9dffb8': ['#ffffff', '#c8ffd8', '#4ac87a'],
};

/** The big line of a banner (wave n, final wave, boss defeated, wave clear, the map's name). */
export const bannerStyle = (color: string, size = 46): LabelStyle =>
  ({ size, fill: BANNER_FILL[color] ?? [color, color], stroke: S, strokeWidth: Math.round(size * 0.17) });

/** A banner's second line (a sentence, so the body font) in the theme's colours. */
export const subStyle = (color: string, size = 24): LabelStyle =>
  ({ size, color: color === '#ffffff' ? '#efe6ff' : color, stroke: S, strokeWidth: Math.round(size * 0.26), body: true });

/** The count under an enemy portrait in a wave banner. */
export const COUNT: LabelStyle = { size: 22, color: '#ffe8a8', stroke: S, strokeWidth: 5, shadow: false };

/** The boss ribbon: the gold tag and the boss's name. */
export const BOSS_TAG: LabelStyle = { size: 28, fill: ['#fffbe6', '#ffe08a', '#e8a020'], stroke: '#3a0810', strokeWidth: 6 };
export const BOSS_NAME: LabelStyle = { size: 46, fill: ['#ffffff', '#ffe2dc', '#ffb0a0'], stroke: '#3a0810', strokeWidth: 8 };

/**
 * A floating callout's style: the display face a third bigger than the old pixel face's size (it
 * reads the same), or the body font for a sentence.
 */
export function popStyle(color: string, size: number, body = false): LabelStyle {
  const px = Math.round(size * (body ? 1.15 : 1.3));
  return { size: px, color, stroke: S, strokeWidth: Math.max(4, Math.round(px * (body ? 0.24 : 0.2))) };
}

const bodyPop = (color: string, size: number): LabelStyle => ({ ...popStyle(color, size, true), body: true });

/**
 * A callout that floats up and fades (as the core's popup, in the theme's look). `body` keeps a
 * sentence in the body font; anything else is upper-cased into the display face.
 */
export function pop(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28, body = false): void {
  const img = labelAt(scene, x, y, body ? s : upper(s), body ? bodyPop(color, size) : popStyle(color, size)).setDepth(6000).setScrollFactor(0);
  fitWidth(img, scene.scale.width - 40);
  const m = 20;
  img.x = Phaser.Math.Clamp(x, img.displayWidth / 2 + m, scene.scale.width - img.displayWidth / 2 - m);
  scene.tweens.add({ targets: img, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
}

/** The callouts with a fixed text, as the scene shows them: [key, colour, size, body]. */
const FIXED_POPS: [string, string, number, boolean][] = [
  ['built', '#9dffb8', 24, false],
  ['crit', '#ff7a5a', 24, false],
  ['thornsHit', '#bff58a', 24, false],
  ['guardsOut', '#ffd27a', 28, false],
  ['revived', '#9dffb8', 30, false],
  ['cantBuild', '#ffb0a0', 22, true],
  ['notEnough', '#ff8a7a', 22, true],
  ['noTarget', '#ffc27a', 22, true],
  ['powersFirst', '#ffc27a', 22, true],
  ['powerLocked', '#ffc27a', 24, true],
  ['slotsFull', '#ffc27a', 24, true],
  ['tmd_first', '#9fd8ff', 22, true],
  ['tmd_strong', '#9fd8ff', 22, true],
  ['tmd_close', '#9fd8ff', 22, true],
];

/** Paints the Play scene's fixed words ahead (under the Ayvago intro, in the current language). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, c, s, body] of FIXED_POPS) labelTexture(scene, body ? t(k) : upper(t(k)), body ? bodyPop(c, s) : popStyle(c, s));
  const most = Math.max(...MAPS.map((m) => m.waves.length));
  for (let n = 1; n <= most; n++) labelTexture(scene, upper(t('waveBanner', { n })), bannerStyle('#ffffff'));
  labelTexture(scene, upper(t('finalWave')), bannerStyle('#ff9a7a'));
  labelTexture(scene, upper(t('bossDown')), bannerStyle('#ffd23f'));
  labelTexture(scene, upper(t('waveClear')), bannerStyle('#9dffb8', 44));
  for (const m of MAPS) labelTexture(scene, upper(t('m_' + m.id)), bannerStyle('#ffffff', 56));
  labelTexture(scene, upper(t('bossTag')), BOSS_TAG);
  for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
    if (ENEMIES[k].boss) {
      labelTexture(scene, upper(t('e_' + k)), BOSS_NAME);
      labelTexture(scene, `${t('bossIncoming')} ${t('e_' + k)}`, subStyle('#ffb0a0'));
    }
  }
  // the powers' cooldown seconds on the dock (ui.ts)
  glyphAtlas(scene, CD_STYLE, '0123456789');
  // the banners' slate boards (PlayScene.banner)
  for (const h of BANNER_H) skinTexture(scene, 'board', BANNER_W, h);
  for (const id of POWER_IDS) labelTexture(scene, upper(t('powerReady', { name: t('p_' + id) })), popStyle('#ffc27a', 22));
}
