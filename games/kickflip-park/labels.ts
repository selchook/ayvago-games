// Kickflip Park: the in-play words in the theme's display face (Shrikhand, theme.ts), painted once
// as label textures: the banners, the landing words, the combo's trick line, the combo summary's
// total (glyphs), the tutorial's heading and SKIP, the hint card's button. Colours come from the
// sticker palette: a sunny top running into the banner's hue, the grip-tape ink outline.
import Phaser from 'phaser';
import { t, labelTexture, labelAt, labelWidth, glyphAtlas, GlyphText, bakePara, type LabelStyle } from '@core';
import { PRAISE, SPECIALS } from './defs';
import { PARKS } from './parks';

export const INK = '#1a1020';

/** Mixes a #rrggbb colour toward white (k > 0) or black (k < 0). */
function mix(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** A banner's word: a pale top into the hue and a deeper base, the ink outline. */
export function bannerStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.7), color, mix(color, -0.28)], stroke: INK, strokeWidth: Math.max(6, Math.round(size * 0.17)) };
}
/** The line under a banner. */
export function subStyle(color: string): LabelStyle { return { size: 30, color, stroke: INK, strokeWidth: 7 }; }
/** A landing word by the rider. */
export function popStyle(color: string, size: number): LabelStyle {
  return { size, fill: [mix(color, 0.55), color], stroke: INK, strokeWidth: Math.max(5, Math.round(size * 0.24)) };
}
/** The trick line under the combo chip (one label per trick, laid out in lines). */
export const S_TRICKS: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 7 };
/** The combo summary: points × tricks, the landing, the total, the praise. */
export const S_SUM_LINE: LabelStyle = { size: 24, color: '#ffffff', stroke: null, shadow: false };
export function qualityStyle(color: string): LabelStyle { return { size: 20, color, stroke: null, shadow: false }; }
export function totalStyle(tier: number): LabelStyle {
  return tier >= 3
    ? { size: 58, fill: ['#fff3c0', '#ffb020', '#e8641c'], stroke: INK, strokeWidth: 8 }
    : { size: 58, fill: ['#e8ffe8', '#7dffa0', '#2fae5a'], stroke: INK, strokeWidth: 8 };
}
export const S_PRAISE: LabelStyle = { size: 26, fill: ['#ffffff', '#ffe14a'], stroke: INK, strokeWidth: 6 };
/** The tutorial's heading, the SKIP pill, the hint card's button. */
export const S_CARD_HEAD: LabelStyle = { size: 22, color: '#ffe14a', stroke: null, shadow: false };
export const S_SKIP: LabelStyle = { size: 22, color: '#ffffff', stroke: null, shadow: false };
export const S_OK: LabelStyle = { size: 30, color: '#ffffff', stroke: INK, strokeWidth: 5, shadow: false };
/** A first-run tip: the body font, white with the ink outline. */
export const S_TIP: LabelStyle = { size: 25, color: '#ffffff', stroke: INK, strokeWidth: 6, body: true };

/** Numbers inside a line ("×1.5", "+1,200"): signed digit runs with their separators. */
const NUM_PART = /^[+\-−×]?\d[\d.,:%]*$/;
const NUM_SPLIT = /([+\-−×]?\d[\d.,:%]*)/;

/**
 * One line of display text with numbers in it: the words are painted labels (cached), the numbers
 * glyphs, so a value never paints a texture of its own. Centred on (x, y).
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
    const items = s.split(NUM_SPLIT).filter((p) => p !== '').map((p) => {
      if (NUM_PART.test(p)) { const g = new GlyphText(this.scene, 0, 0, p, this.o, 0); return { obj: g as Phaser.GameObjects.Container | Phaser.GameObjects.Image | null, w: g.textWidth, text: false }; }
      return { obj: p.trim() ? labelAt(this.scene, 0, 0, p, this.o) : null, w: labelWidth(p, this.o), text: true };
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

/**
 * Words joined by a separator (" + ") and wrapped into centred lines no wider than maxW; each word
 * is its own cached label, so a growing combo never paints a new texture. (x, y) is the top centre.
 */
export class WordFlow extends Phaser.GameObjects.Container {
  private key = '';

  constructor(scene: Phaser.Scene, x: number, y: number, private o: LabelStyle, private maxW: number, private sep = ' + ') {
    super(scene, x, y);
    scene.add.existing(this);
  }

  set(words: string[]): this {
    const key = words.join('\u0001');
    if (key === this.key) return this;
    this.key = key;
    this.removeAll(true);
    const sepW = labelWidth(this.sep, this.o);
    const lines: { w: string[]; width: number }[] = [];
    let cur: { w: string[]; width: number } = { w: [], width: 0 };
    for (let i = 0; i < words.length; i++) {
      const ww = labelWidth(words[i], this.o) + (i < words.length - 1 ? sepW : 0);
      if (cur.w.length && cur.width + ww > this.maxW) { lines.push(cur); cur = { w: [], width: 0 }; }
      cur.w.push(words[i]); cur.width += ww;
    }
    if (cur.w.length) lines.push(cur);
    const lh = Math.round((this.o.size ?? 32) * 1.25);
    let n = 0;
    lines.forEach((line, li) => {
      let x = -line.width / 2;
      const y = lh * (li + 0.5);
      for (const w of line.w) {
        const ww = labelWidth(w, this.o);
        this.add(labelAt(this.scene, x + ww / 2, y, w, this.o));
        x += ww;
        n++;
        if (n < words.length) { this.add(labelAt(this.scene, x + sepW / 2, y, this.sep.trim(), this.o)); x += sepW; }
      }
    });
    this.setSize(this.maxW, lines.length * lh);
    return this;
  }

  /** Tints every word (a lost combo turns red). */
  tint(c: number | null): this {
    for (const o of this.list as Phaser.GameObjects.Image[]) { if (c === null) o.clearTint(); else o.setTint(c); }
    return this;
  }
}

/** Banner words PlayScene uses (key → [colour, size]). */
const BANNERS: Record<string, [string, number]> = {
  specialReady: ['#ffc23a', 44], fell: ['#ff5a4f', 56], bail: ['#ff5a4f', 56], timeUp: ['#ffffff', 64], tenLeft: ['#ff7a6a', 40],
  tut_done: ['#7dffa0', 52], newBoardTitle: ['#ffd23f', 46],
};

/** Paints the Play scene's fixed words ahead (in create, so a changed language is painted too). */
export function prebakePlay(scene: Phaser.Scene): void {
  for (const [k, [c, s]] of Object.entries(BANNERS)) labelTexture(scene, t(k), bannerStyle(c, s));
  for (const id of PARKS) { labelTexture(scene, t('park_' + id), bannerStyle('#ffffff', 50)); labelTexture(scene, t('parkSub_' + id), subStyle('#ffd23f')); }
  for (const k of ['lastTrick', 'tut_doneSub']) labelTexture(scene, t(k), subStyle(k === 'lastTrick' ? '#ffffff' : '#ffd23f'));
  for (const d of Object.values(SPECIALS)) labelTexture(scene, t('tr_' + d.id), bannerStyle('#ffb020', 50));
  for (const [q, c] of [['perfect', '#ffd23f'], ['clean', '#9fe8ff'], ['sketchy', '#ff9a6a']] as const) {
    labelTexture(scene, t('q_' + q), popStyle(c, q === 'perfect' ? 34 : 28));
    labelTexture(scene, t('q_' + q), qualityStyle(c));
    glyphAtlas(scene, qualityStyle(c));
  }
  for (let i = 0; i < PRAISE.length; i++) labelTexture(scene, t('praise' + i), S_PRAISE);
  labelTexture(scene, t('landed'), S_PRAISE);
  labelTexture(scene, '+', S_TRICKS);
  for (let n = 1; n <= 4; n++) labelTexture(scene, t('tut_head', { n }), S_CARD_HEAD);
  for (const k of ['tut_skip', 'tut_skipKey']) labelTexture(scene, t(k), S_SKIP);
  labelTexture(scene, t('hintGotIt'), S_OK);
  labelTexture(scene, t('tut_nice'), popStyle('#7dffa0', 40));
  glyphAtlas(scene, S_SUM_LINE);
  glyphAtlas(scene, totalStyle(0));
  glyphAtlas(scene, totalStyle(3));
  bakePara(scene, t('hintSpecial'), S_TIP, 620);
}
