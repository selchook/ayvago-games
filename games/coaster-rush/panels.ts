// Pieces for the game's own themed screens (the menu theme's look, src/core/menu-theme.ts), built
// so that opening a screen only places images: every face, card and line of text is a canvas
// texture painted once under the Ayvago intro (the screen's `prebake`) and cached by key.
//   - label / labelAt: a line in the display face (or the body font), the core's painted label;
//   - GlyphText: a changing line (counts, prices) set from a glyph atlas painted once per style;
//   - FmtLine: a translated line with values in it ("Best: {n}"): the words as painted labels,
//     the values in glyphs;
//   - Para: a paragraph wrapped into painted lines;
//   - KitButton: a button in the skin with up / over / down / off faces and a painted label.
// The same file sits in each themed game's folder (games own their code); nothing here runs in play
// beyond placing images.
import Phaser from 'phaser';
import { t, menuTheme, labelTexture, skinTexture, playSfx, SKIN_PAD, type LabelStyle, type SkinKind, type SkinState } from '@core';

// ------------------------------------------------------------------ canvases

/** A texture painted once on a software canvas (cached by key). */
export function bakeTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  draw(c);
  scene.textures.addCanvas(key, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

const probe = (() => {
  let c: CanvasRenderingContext2D | null = null;
  return () => (c ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })!);
})();

/** The CSS font a label style paints with (as `labelTexture` does: modern style, display face scaled by fontScale). */
export function fontOf(o: LabelStyle): { font: string; size: number } {
  const theme = menuTheme()!;
  const base = o.size ?? 32;
  if (o.body) {
    const size = Math.round(base * 0.92);
    return { font: `800 ${size}px "Nunito", sans-serif`, size };
  }
  const size = Math.round(base * (theme.fontScale ?? 1));
  return { font: `${size}px "${theme.font}", serif`, size };
}

/** The advance width of a line in a label style. */
export function textWidth(s: string, o: LabelStyle): number {
  const c = probe();
  c.font = fontOf(o).font;
  return c.measureText(s).width;
}

const strokeOf = (o: LabelStyle, size: number): number => (o.stroke === null ? 0 : Math.round(o.strokeWidth ?? size * 0.14));
const padOf = (o: LabelStyle, size: number): number => Math.ceil(strokeOf(o, size) / 2 + (o.shadow === false ? 0 : Math.round(size * 0.12)) + 2);

// ------------------------------------------------------------------ labels

/**
 * A painted label (cached) with its letters' box anchored at x: `ax` 0 = left edge of the
 * letters, 0.5 = centre, 1 = right edge. The image's y is the letters' middle.
 */
export function labelAt(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle, ax = 0.5): Phaser.GameObjects.Image {
  const key = labelTexture(scene, s, o);
  const img = scene.add.image(x, y, key);
  const tex = scene.textures.get(key);
  const oy = ((tex.customData as Record<string, unknown>).originY as number | undefined) ?? 0.5;
  const w = img.width, pad = (w - Math.ceil(textWidth(s, o))) / 2;
  img.setOrigin(ax === 0.5 ? 0.5 : ax === 0 ? pad / w : 1 - pad / w, oy);
  return img;
}

/** Shrinks an object to fit `room` px wide (labels for long Turkish words). */
export function fit<T extends Phaser.GameObjects.Components.Transform & { width: number }>(o: T, room: number, base = 1): T {
  o.setScale(base);
  if (o.width * base > room) o.setScale(room / o.width);
  return o;
}

// ------------------------------------------------------------------ glyphs

/** The characters a GlyphText can show by default: counts, prices, ratios, the locale's separators. */
export const NUMERIC = '0123456789/.,:%+-−×x→ $₺★';

interface Atlas { key: string; adv: Record<string, number>; originY: number }
const atlases = new Map<string, Atlas>();

/**
 * One texture with every character of `chars` painted in a label style (fill or gradient,
 * outline, shadow: as the core's labels), one frame each, and their advances.
 */
export function glyphAtlas(scene: Phaser.Scene, o: LabelStyle, chars = NUMERIC): Atlas {
  const theme = menuTheme()!;
  const id = `${JSON.stringify(o)}|${chars}`;
  const key = `pn-gly-${hashStr(id)}`;
  const known = atlases.get(key);
  if (known && scene.textures.exists(key)) return known;
  const { font, size } = fontOf(o);
  const c0 = probe();
  c0.font = font;
  const m = c0.measureText('ÇĞİÖŞÜ' + chars);
  const asc = Math.ceil(Math.max(m.actualBoundingBoxAscent || 0, size * 0.78));
  const desc = Math.ceil(Math.max(m.actualBoundingBoxDescent || 0, size * 0.2));
  const sw = strokeOf(o, size), pad = padOf(o, size);
  const offY = o.shadow === false ? 0 : Math.max(2, Math.round(size * 0.06));
  const list = [...new Set([...chars])];
  const adv: Record<string, number> = {};
  const cells = list.map((ch) => { adv[ch] = c0.measureText(ch).width; return Math.ceil(adv[ch]) + pad * 2; });
  const W = cells.reduce((a, b) => a + b, 0), H = asc + desc + pad * 2 + offY;
  const P = theme.palette;
  bakeTex(scene, key, W, H, (c) => {
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round'; c.miterLimit = 2;
    let x = 0;
    list.forEach((ch, i) => {
      const cx = x + cells[i] / 2, y = pad + asc;
      let fill: string | CanvasGradient = o.color ?? P.label;
      if (o.fill?.length) {
        const g = c.createLinearGradient(0, y - asc * 0.8, 0, y + desc * 0.3);
        o.fill.forEach((f, k) => g.addColorStop(k / Math.max(1, o.fill!.length - 1), f));
        fill = g;
      }
      c.save();
      if (o.shadow !== false) { c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = Math.round(size * 0.12); c.shadowOffsetY = offY; }
      if (sw > 0) { c.strokeStyle = o.stroke ?? P.labelStroke; c.lineWidth = sw; c.strokeText(ch, cx, y); c.shadowColor = 'transparent'; }
      c.fillStyle = fill; c.fillText(ch, cx, y);
      c.restore();
      x += cells[i];
    });
  });
  const tex = scene.textures.get(key);
  let x = 0;
  list.forEach((ch, i) => { if (!tex.has(ch)) tex.add(ch, 0, x, 0, cells[i], H); x += cells[i]; });
  const at: Atlas = { key, adv, originY: (pad + (asc + desc) / 2) / H };
  atlases.set(key, at);
  return at;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A line that changes (a count, a price) set from a glyph atlas: setText swaps frames, paints nothing. */
export class GlyphText extends Phaser.GameObjects.Container {
  private atlas: Atlas;
  private imgs: Phaser.GameObjects.Image[] = [];
  text = '';
  /** Width of the line as set (unscaled). */
  textWidth = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle, private align: 0 | 0.5 | 1 = 0.5, chars = NUMERIC) {
    super(scene, x, y);
    this.atlas = glyphAtlas(scene, o, chars);
    scene.add.existing(this);
    this.setText(s);
  }

  setText(s: string): this {
    if (s === this.text) return this;
    this.text = s;
    const { key, adv, originY } = this.atlas;
    const chars = [...s];
    while (this.imgs.length < chars.length) {
      const img = this.scene.add.image(0, 0, key, '0').setOrigin(0.5, originY);
      this.imgs.push(img);
      this.add(img);
    }
    this.textWidth = chars.reduce((a, ch) => a + (adv[ch] ?? adv[' '] ?? 0), 0);
    this.setSize(this.textWidth, 1);
    let x = -this.textWidth * this.align;
    this.imgs.forEach((img, i) => {
      const ch = chars[i];
      const a = ch !== undefined ? adv[ch] : undefined;
      img.setVisible(a !== undefined && ch !== ' ');
      if (a === undefined) return;
      if (ch !== ' ') img.setFrame(ch).setX(x + a / 2);
      x += a;
    });
    return this;
  }
}

// ------------------------------------------------------------------ translated lines with values

const MARK = ['\u0001', '\u0002', '\u0003', '\u0004'];

/** A translation split round its values: words (static, painted labels) and the value names. */
export function fmtParts(key: string, names: string[]): Array<{ s: string } | { v: string }> {
  const vars: Record<string, string> = {};
  names.forEach((n, i) => { vars[n] = MARK[i]; });
  const out: Array<{ s: string } | { v: string }> = [];
  for (const part of t(key, vars).split(/([\u0001-\u0004])/)) {
    if (!part) continue;
    const i = MARK.indexOf(part);
    out.push(i >= 0 ? { v: names[i] } : { s: part });
  }
  return out;
}

/** Paints a FmtLine's words ahead (the values come from the glyph atlas). */
export function bakeFmt(scene: Phaser.Scene, key: string, names: string[], o: LabelStyle, chars = NUMERIC): void {
  for (const p of fmtParts(key, names)) if ('s' in p && p.s.trim()) labelTexture(scene, p.s, o);
  glyphAtlas(scene, o, chars);
}

/**
 * A translated line with values ("Best: {n}", "{a} → {b}"): the words are painted labels (cached),
 * the values glyphs. `set` lays it out again; `align` 0 / 0.5 / 1 anchors it at x.
 */
export class FmtLine extends Phaser.GameObjects.Container {
  textWidth = 0;
  private key = '';

  constructor(scene: Phaser.Scene, x: number, y: number, private o: LabelStyle, private align: 0 | 0.5 | 1 = 0.5, private chars = NUMERIC) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  set(key: string, vars: Record<string, string | number>): this {
    const names = Object.keys(vars);
    const sig = key + '|' + names.map((n) => `${n}=${vars[n]}`).join('|');
    if (sig === this.key) return this;
    this.key = sig;
    this.removeAll(true);
    const parts = fmtParts(key, names);
    const items: Array<{ obj: Phaser.GameObjects.Image | GlyphText; w: number; text: boolean }> = [];
    for (const p of parts) {
      if ('s' in p) {
        const w = textWidth(p.s, this.o);
        if (!p.s.trim()) { items.push({ obj: null as unknown as Phaser.GameObjects.Image, w, text: false }); continue; }
        items.push({ obj: labelAt(this.scene, 0, 0, p.s, this.o, 0.5), w, text: true });
      } else {
        const g = new GlyphText(this.scene, 0, 0, String(vars[p.v]), this.o, 0, this.chars);
        items.push({ obj: g, w: g.textWidth, text: false });
      }
    }
    this.textWidth = items.reduce((a, it) => a + it.w, 0);
    this.setSize(this.textWidth, 1);
    let x = -this.textWidth * this.align;
    for (const it of items) {
      if (it.obj) {
        it.obj.x = it.text ? x + it.w / 2 : x;
        this.add(it.obj);
      }
      x += it.w;
    }
    return this;
  }
}

// ------------------------------------------------------------------ paragraphs

/** Splits a text into lines no wider than maxW in a style (words kept whole; explicit breaks kept). */
export function wrapLines(s: string, o: LabelStyle, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (line && textWidth(next, o) > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Paints a paragraph's lines ahead. */
export function bakePara(scene: Phaser.Scene, s: string, o: LabelStyle, maxW: number): void {
  for (const line of wrapLines(s, o, maxW)) if (line) labelTexture(scene, line, o);
}

/**
 * A paragraph wrapped at maxW into painted lines; (x, y) is its top-left (`align` 0), top-centre
 * (0.5) or top-right (1). `lineH` in px (default 1.2 x the size).
 */
export class Para extends Phaser.GameObjects.Container {
  lines = 0;
  textHeight = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, s: string, private o: LabelStyle, private maxW: number, private align: 0 | 0.5 | 1 = 0, private lineH = Math.round((o.size ?? 32) * 1.2)) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setText(s);
  }

  setText(s: string): this {
    this.removeAll(true);
    const lines = wrapLines(s, this.o, this.maxW);
    lines.forEach((line, i) => { if (line) this.add(labelAt(this.scene, 0, this.lineH * (i + 0.5), line, this.o, this.align)); });
    this.lines = lines.length;
    this.textHeight = lines.length * this.lineH;
    return this;
  }
}

// ------------------------------------------------------------------ buttons

/** Paints a button's faces ahead: up, over, down (off for one that can be disabled, on for a selected one). */
export function bakeButton(scene: Phaser.Scene, kind: SkinKind, w: number, h: number, color: number, off = false, on = false): void {
  for (const st of ['up', 'over', 'down'] as SkinState[]) skinTexture(scene, kind, w, h, st, color);
  if (off) skinTexture(scene, kind, w, h, 'off', color);
  if (on) skinTexture(scene, kind, w, h, 'on', color);
}

export interface KitButtonOptions {
  w: number;
  h: number;
  kind?: SkinKind;
  /** Face colour (default the palette's secondary). */
  color?: number;
  /** The label (painted once, cached) and its style (default the display face at `size`). */
  label?: string;
  size?: number;
  style?: LabelStyle;
  sfx?: string | null;
  /** Shown selected: the skin's 'on' face (a rim) in place of 'up'. */
  on?: boolean;
  /** A tap on the disabled button still calls back (to say why it is off). */
  tapWhenOff?: boolean;
}

/**
 * A button in the theme's skin: its faces painted once (`bakeButton`), the label a painted label,
 * a pressed face and a little drop of the label while held, the disabled face ('off') when off.
 * Tappable over its whole w x h. Extra content (an icon, a GlyphText) can be added to it.
 */
export class KitButton extends Phaser.GameObjects.Container {
  readonly face: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Image | null = null;
  enabled = true;
  private color: number;
  private sel = false;
  private content: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, readonly o: KitButtonOptions, private onTap: () => void) {
    super(scene, x, y);
    const P = menuTheme()!.palette;
    this.color = o.color ?? P.secondary;
    this.sel = !!o.on;
    this.face = scene.add.image(0, SKIN_PAD / 2, this.faceKey('up'));
    this.add(this.face);
    if (o.label !== undefined) this.setLabel(o.label);
    this.setSize(o.w, o.h).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { if (this.enabled) this.show('over'); });
    this.on('pointerout', () => this.show('up'));
    this.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      if (!this.enabled) return;
      this.show('down');
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.show(p.wasTouch ? 'up' : 'over');
      if (!this.enabled) { if (o.tapWhenOff) this.onTap(); return; }
      if (o.sfx !== null) playSfx(scene, o.sfx ?? 'ui-click');
      this.onTap();
    });
    scene.add.existing(this);
  }

  private faceKey(s: SkinState): string {
    const kind = this.o.kind ?? 'button';
    if (!this.enabled) return skinTexture(this.scene, kind, this.o.w, this.o.h, 'off', this.color);
    if (this.sel && s === 'up') return skinTexture(this.scene, kind, this.o.w, this.o.h, 'on', this.color);
    return skinTexture(this.scene, kind, this.o.w, this.o.h, s, this.color);
  }

  private show(s: SkinState): void {
    this.face.setTexture(this.faceKey(s));
    const dy = s === 'down' ? 3 : 0;
    for (const c of [this.label, ...this.content]) if (c) (c as unknown as Phaser.GameObjects.Components.Transform).y = ((c as Phaser.GameObjects.Image).getData('y0') as number ?? 0) + dy;
  }

  /** Adds content that moves with the label when pressed. */
  addContent(...objs: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform>): this {
    for (const o of objs) { o.setData('y0', o.y); this.content.push(o); this.add(o); }
    return this;
  }

  setLabel(s: string, y = 0): this {
    this.label?.destroy();
    this.label = null;
    if (s) {
      const style = this.o.style ?? { size: this.o.size ?? 30 };
      this.label = labelAt(this.scene, 0, y, s, style, 0.5).setData('y0', y);
      fit(this.label, this.o.w - 28);
      this.add(this.label);
    }
    return this;
  }

  /** A larger (or offset) tap area than the face: w x h centred (dx, dy) from the button's centre. */
  setHit(w: number, h: number, dx = 0, dy = 0): this {
    const r = this.input!.hitArea as Phaser.Geom.Rectangle;
    r.setTo(this.o.w / 2 - w / 2 + dx, this.o.h / 2 - h / 2 + dy, w, h);
    return this;
  }

  setColor(c: number): this {
    if (c !== this.color) { this.color = c; this.show('up'); }
    return this;
  }

  /** Colour and selection at once (a tab): one face change. */
  setLook(color: number, on: boolean): this {
    if (color !== this.color || on !== this.sel) { this.color = color; this.sel = on; this.show('up'); }
    return this;
  }

  setSelected(on: boolean): this {
    if (on !== this.sel) { this.sel = on; this.show('up'); }
    return this;
  }

  setEnabled(on: boolean): this {
    if (on !== this.enabled) { this.enabled = on; this.show('up'); if (this.label) this.label.setAlpha(on ? 1 : 0.6); }
    return this;
  }
}
