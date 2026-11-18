// Rooftop Courier: the in-play words in the theme's display face (Saira Stencil One, menu.ts),
// painted once as label textures: the banners, the delivery stamp, the small lines by the courier
// (words painted, their numbers in glyphs), the tutorial's and the hint card's headings. Colours
// come from the courier's palette: a cream top running into the banner's hue, the indigo ink.
import Phaser from 'phaser';
import { t, labelTexture, labelAt, labelWidth, glyphAtlas, GlyphText, bakePara, type LabelStyle } from '@core';
import { POWERS } from './defs';

export const INK = '#1d1230';

/** Mixes a #rrggbb colour toward white (k > 0) or black (k < 0). */
function mix(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** A banner's word: a cream top into the hue and a deeper base, the indigo outline. */
export function bannerStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.7), color, mix(color, -0.3)], stroke: INK, strokeWidth: Math.max(6, Math.round(size * 0.17)) };
}
/** The line under a banner. */
export function subStyle(color: string): LabelStyle { return { size: 28, color, stroke: INK, strokeWidth: 6 }; }
/** A small line by the courier (a landing word, a pickup, a style move and its points). */
export function popStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.55), color], stroke: INK, strokeWidth: Math.max(5, Math.round(size * 0.24)) };
}
/** The delivery stamp's word (red ink, no outline) and the line under it. */
export const S_STAMP: LabelStyle = { size: 64, color: '#e8443a', stroke: null, shadow: false };
export const S_STAMP_SUB: LabelStyle = { size: 26, color: '#fff3c4', stroke: INK, strokeWidth: 6 };
/** The tutorial's and the hint card's headings, the SKIP pill. */
export const S_CARD_HEAD: LabelStyle = { size: 22, color: '#ffc94a', stroke: null, shadow: false };
export const S_SKIP: LabelStyle = { size: 22, color: '#fff6e6', stroke: null, shadow: false };
/** A first-run tip: the body font, cream with the indigo outline. */
export const S_TIP: LabelStyle = { size: 26, color: '#fff6e6', stroke: INK, strokeWidth: 6, body: true };

/** Numbers inside a line ("+345", "+1.5 s", "x3"): signed digit runs with their separators. */
const NUM = /([+\-−]?\d[\d.,:%]*)/;

/**
 * One line of display text with numbers in it: the words are painted labels (cached), the numbers
 * glyphs, so a line whose points change ("Gap · Vault +345") never paints a texture per value.
 * Centred on (x, y); `width` / `height` are the line's own (unscaled).
 */
export class ThemeLine extends Phaser.GameObjects.Container {
  text = '';

  constructor(scene: Phaser.Scene, x: number, y: number, s: string, private o: LabelStyle) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setText(s);
  }

  setText(s: string): this {
    if (s === this.text) return this;
    this.text = s;
    this.removeAll(true);
    const parts = s.split(NUM).filter((p) => p !== '');
    const items = parts.map((p) => {
      if (NUM.test(p) && /^[+\-−]?\d[\d.,:%]*$/.test(p)) {
        const g = new GlyphText(this.scene, 0, 0, p, this.o, 0);
        return { obj: g as Phaser.GameObjects.GameObject & { x: number }, w: g.textWidth, text: false };
      }
      const w = labelWidth(p, this.o);
      return { obj: p.trim() ? labelAt(this.scene, 0, 0, p, this.o, 0.5) : null, w, text: true };
    });
    const total = items.reduce((a, it) => a + it.w, 0);
    let x = -total / 2;
    for (const it of items) {
      if (it.obj) { it.obj.x = it.text ? x + it.w / 2 : x; this.add(it.obj); }
      x += it.w;
    }
    this.setSize(total, Math.round((this.o.size ?? 32) * 1.3));
    return this;
  }
}

/** Banner words PlayScene uses (key → [colour, size]). */
const BANNERS: Record<string, [string, number]> = {
  fellHeart: ['#ff7a6a', 44], bottle: ['#7fe6ff', 36], spring: ['#ffd23f', 36], shieldSaved: ['#7fe0ff', 50], gold: ['#ffd23f', 50],
  firstParcel: ['#ffc040', 34], missed: ['#ff9a6a', 36], lateHeart: ['#ff7a6a', 40], late: ['#ff5a4f', 60], rushOn: ['#7fe0ff', 66],
  tut_done: ['#7dffa0', 52], fell: ['#ff5a4f', 58],
};
const PRAISE = ['#9fe8ff', '#7dffa0', '#ffd23f', '#ffb24a', '#ff7ae0'];

/** Paints the Play scene's fixed words ahead (in create, so a changed language is painted too). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, [c, s]] of Object.entries(BANNERS)) labelTexture(scene, t(k), bannerStyle(c, s));
  PRAISE.forEach((c, tier) => labelTexture(scene, t('praise' + tier), bannerStyle(c, 40 + tier * 3)));
  for (const k of ['shieldSavedSub', 'goldSub', 'rushSub']) labelTexture(scene, t(k), subStyle('#ffffff'));
  labelTexture(scene, t('delivered'), S_STAMP);
  for (let n = 1; n <= 4; n++) labelTexture(scene, t('tut_head', { n }), S_CARD_HEAD);
  labelTexture(scene, t('tut_skip'), S_SKIP);
  for (const k of POWERS) labelTexture(scene, t('hintHead', { name: t('pw_' + k) }), S_CARD_HEAD);
  for (const k of ['rollTipTouch', 'rollTip', 'bonk']) bakePara(scene, t(k), S_TIP, 620);
  for (const [k, c, s] of [['hardLanding', '#ff9a6a', 28], ['smash', '#7fe0ff', 30], ['stumble', '#ff7a6a', 30], ['shieldPop', '#7fe0ff', 28], ['flowLost', '#9aa6c8', 22], ['tut_nice', '#7dffa0', 40]] as const) labelTexture(scene, t(k), popStyle(c, s));
  // the style moves' colours (PlayScene MOVE_COLOR) and the streak's
  for (const c of ['#ffffff', '#ffd23f', '#9fe8ff', '#7dffa0', '#ffb24a', '#ff9ae6', '#d8dce4']) glyphAtlas(scene, popStyle(c, 26));
  glyphAtlas(scene, popStyle('#7dffa0', 22));
}
