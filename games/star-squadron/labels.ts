// Star Squadron: the in-play words in the theme's display face (Audiowide, theme.ts), painted once
// as label textures: the wave and sector banners, the boss warning, the floating callouts, the
// score popups and the crit numbers (glyph atlases), the hint line. Colours come from the cockpit
// palette: a white-hot top running into the banner's hue, the deep navy outline.
import Phaser from 'phaser';
import { t, labelTexture, glyphAtlas, GlyphText, labelAt, labelWidth, bakePara, type LabelStyle } from '@core';
import { SECTORS } from './defs';

export const NAVY = '#061230';

/** Mixes a #rrggbb colour toward white (k > 0) or black (k < 0). */
function mix(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** A banner's title: white-hot top, the hue, a darker base; the navy outline. */
export function bannerStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.75), color, mix(color, -0.35)], stroke: NAVY, strokeWidth: Math.max(6, Math.round(size * 0.15)) };
}
/** The line under a banner (the sector's name, the bonus). */
export const S_SUB: LabelStyle = { size: 26, color: '#dbe8ff', stroke: NAVY, strokeWidth: 5 };
/** A floating callout (a pickup, a card's name, SLOW-MO). */
export function floatStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.6), color], stroke: NAVY, strokeWidth: Math.max(5, Math.round(size * 0.2)) };
}
/** The score popups (+800) and the crit numbers. */
export const S_SCORE: LabelStyle = { size: 26, fill: ['#fff6c8', '#ffd23f', '#e08a1a'], stroke: NAVY, strokeWidth: 5, shadow: false };
export const S_CRIT: LabelStyle = { size: 22, fill: ['#ffffff', '#fff3b0', '#ffb347'], stroke: NAVY, strokeWidth: 5, shadow: false };
/** The boss warning. */
export const S_WARN: LabelStyle = { size: 72, fill: ['#ffe0e4', '#ff3b4f', '#9a0a20'], stroke: '#2a0008', strokeWidth: 11 };
export const S_WARN_SUB: LabelStyle = { size: 34, color: '#ffe0e4', stroke: '#2a0008', strokeWidth: 6 };
/** The first-run hints: the body font in the palette's body colour, the navy outline. */
export const S_HINT: LabelStyle = { size: 25, color: '#dbe8ff', stroke: NAVY, strokeWidth: 6, body: true };
/** The card bar's heading. */
export const S_BAR_TITLE: LabelStyle = { size: 24, fill: ['#fff3c0', '#ffd23f'], stroke: NAVY, strokeWidth: 4, shadow: false };

/** Banner colours and sizes PlayScene uses (title key → [colour, size]). */
const BANNERS: Record<string, [string, number]> = {
  armourDown: ['#9fe8ff', 44], finalWave: ['#ffffff', 46], flawless: ['#ffd23f', 46], waveClear: ['#7dffa0', 46],
  newSynergy: ['#ffd23f', 42], bossDown: ['#ffd23f', 54], sectorClear: ['#7dffa0', 54], phoenixUp: ['#ff9a3d', 54],
};

/** A score popup in the theme's face (replaces the core's pixel `popup`). */
export function scorePopup(scene: Phaser.Scene, x: number, y: number, s: string, size = 26): void {
  const g = new GlyphText(scene, x, y, s, S_SCORE).setDepth(6000).setScrollFactor(0).setScale(size / 26);
  scene.tweens.add({ targets: g, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
}

/** "CRIT 120": the word painted once, the number in glyphs, centred on (x, y). */
export function critLine(scene: Phaser.Scene, x: number, y: number, n: number): Phaser.GameObjects.Container {
  const gap = 8, ww = labelWidth(t('crit'), S_CRIT);
  const num = new GlyphText(scene, 0, 0, String(n), S_CRIT, 0);
  const x0 = -(ww + gap + num.textWidth) / 2;
  const word = labelAt(scene, x0, 0, t('crit'), S_CRIT, 0);
  num.setX(x0 + ww + gap);
  return scene.add.container(x, y, [word, num]).setScrollFactor(0).setDepth(6000);
}

/** Paints the Play scene's fixed words ahead (under the intro, and again in create for a new language). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, [c, s]] of Object.entries(BANNERS)) labelTexture(scene, t(k), bannerStyle(c, s));
  for (let n = 1; n <= 12; n++) labelTexture(scene, t('sectorN', { n }), bannerStyle('#9fe8ff', 54));
  for (const s of SECTORS) {
    labelTexture(scene, t('sec_' + s.id), S_SUB);
    for (let n = 1; n <= s.waves; n++) labelTexture(scene, t('waveN', { n, m: s.waves }), bannerStyle('#ffffff', 46));
  }
  labelTexture(scene, t('warning'), S_WARN);
  labelTexture(scene, t('crit'), S_CRIT);
  labelTexture(scene, t('barTitle'), S_BAR_TITLE);
  for (const k of ['offerPlus', 'cardsWaiting']) labelTexture(scene, t(k), floatStyle('#ffd23f', 24));
  labelTexture(scene, t('lowHull'), floatStyle('#ff7a6a', 30));
  labelTexture(scene, t('slowmo'), floatStyle('#c9a8ff', 40));
  for (const k of ['hintTouch', 'hintMouse', 'hintKeys', 'hintPowers', 'armoured', 'hintOfferTouch', 'hintOfferKeys']) bakePara(scene, t(k), S_HINT, 620);
  glyphAtlas(scene, S_SCORE);
  glyphAtlas(scene, S_CRIT);
}
