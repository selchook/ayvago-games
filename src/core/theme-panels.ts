// Pieces for a themed game's own inner screens (a shop, a map, a draft: the menu theme's look,
// src/core/menu-theme.ts), built so that opening a screen only places images: every face, card and
// line of text is a canvas texture painted once under the Ayvago intro (`menuTheme.prebake`) and
// cached by key.
//   - labelAt: a painted label (`labelTexture`) anchored at its letters' left edge, centre or right edge;
//   - GlyphText: a changing line (counts, prices) set from a glyph atlas painted once per style;
//   - FmtLine: a translated line with values in it ("Best: {n}"): the words as painted labels,
//     the values in glyphs;
//   - Para: a paragraph wrapped into painted lines;
//   - KitButton: a button in the skin with up / over / down / on / off faces and a painted label.
// Each has a `bake*` (or `glyphAtlas`) companion for the prebake. Nothing here runs in play beyond
// placing images. References: Skull Isle (shop.ts, board.ts), Snow Express and Delivery Dash
// (mapui.ts), Rooftop Courier and Coaster Rush (shop.ts).
import Phaser from 'phaser';
import { t } from './i18n';
import { playSfx } from './audio';
import {
  menuTheme, labelTexture, themeLabel, labelFont, glyphTexture, skinTexture, canvas2d, hash, SKIN_PAD,
  type LabelStyle, type SkinKind, type SkinState,
} from './menu-theme';

// ------------------------------------------------------------------ labels

let probeCtx: CanvasRenderingContext2D | null = null;
const probe = (): CanvasRenderingContext2D => (probeCtx ??= canvas2d(1, 1));

/** The advance width of a line in a label style (as `labelTexture` paints it). */
export function labelWidth(s: string, o: LabelStyle): number {
  const c = probe();
  c.font = labelFont(o).font;
  return c.measureText(s).width;
}

/**
 * A painted label (`labelTexture`, cached) with its letters' box anchored at x: `ax` 0 = left edge
 * of the letters, 0.5 = centre (as `themeLabel`), 1 = right edge. The image's y is the letters' middle.
 */
export function labelAt(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle, ax = 0.5): Phaser.GameObjects.Image {
  const img = themeLabel(scene, x, y, s, o);
  if (ax === 0.5) return img;
  const w = img.width, pad = (w - Math.ceil(labelWidth(s, o))) / 2;
  return img.setOrigin(ax === 0 ? pad / w : 1 - pad / w, img.originY);
}

/** Scales an object to `base`, shrunk further to fit `room` px wide (labels for long Turkish words). */
export function fitWidth<T extends Phaser.GameObjects.Components.Transform & { width: number }>(o: T, room: number, base = 1): T {
  o.setScale(base);
  if (o.width * base > room) o.setScale(room / o.width);
  return o;
}

// ------------------------------------------------------------------ glyphs

/** The characters a GlyphText can show by default: counts, prices, ratios, the locale's separators. */
export const NUMERIC_GLYPHS = '0123456789/.,:%+-−×x→ $₺★';

export interface GlyphAtlas {
  key: string;
  /** Each character's advance width (unrounded). */
  adv: Record<string, number>;
  /** The frames' origin on the letters' middle. */
  originY: number;
}

/**
 * One texture with every character of `chars` painted in a label style (as the core's labels:
 * fill or gradient, outline, shadow), one frame each, and their advances (cached). Paint it in
 * the prebake for every style a GlyphText or FmtLine uses.
 */
export function glyphAtlas(scene: Phaser.Scene, o: LabelStyle, chars = NUMERIC_GLYPHS): GlyphAtlas {
  const key = glyphTexture(scene, `mt-gly-${hash(`${JSON.stringify(o)}|${chars}`)}`, o, chars);
  const data = scene.textures.get(key).customData as { adv: Record<string, number>; originY: number };
  return { key, adv: data.adv, originY: data.originY };
}

/** A line that changes (a count, a price) set from a glyph atlas: setText swaps frames, paints nothing. */
export class GlyphText extends Phaser.GameObjects.Container {
  private atlas: GlyphAtlas;
  private imgs: Phaser.GameObjects.Image[] = [];
  text = '';
  /** Width of the line as set (unscaled). */
  textWidth = 0;

  /** `align` 0 / 0.5 / 1 anchors the line's left edge, centre or right edge at x. */
  constructor(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle, private align: 0 | 0.5 | 1 = 0.5, chars = NUMERIC_GLYPHS) {
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

/** A translation split round its values (at most four): the words and the value names, in order. */
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

/** Paints a FmtLine's words ahead (in the current language) and its style's glyph atlas. */
export function bakeFmt(scene: Phaser.Scene, key: string, names: string[], o: LabelStyle, chars = NUMERIC_GLYPHS): void {
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

  constructor(scene: Phaser.Scene, x: number, y: number, private o: LabelStyle, private align: 0 | 0.5 | 1 = 0.5, private chars = NUMERIC_GLYPHS) {
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
    const items: Array<{ obj: Phaser.GameObjects.Image | GlyphText | null; w: number; text: boolean }> = [];
    for (const p of parts) {
      if ('s' in p) {
        const w = labelWidth(p.s, this.o);
        if (!p.s.trim()) { items.push({ obj: null, w, text: false }); continue; }
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
      if (line && labelWidth(next, o) > maxW) { out.push(line); line = word; } else line = next;
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

/** Paints a KitButton's faces ahead: up, over, down (off for one that can be disabled, on for a selected one). */
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
  /** The label (painted once, cached) and its style (default the display face at `size`, default 30). */
  label?: string;
  size?: number;
  style?: LabelStyle;
  /** The tap's sound (default 'ui-click'; null for none, when the action plays its own). */
  sfx?: string | null;
  /** Shown selected: the skin's 'on' face (a rim) in place of 'up'. */
  on?: boolean;
  /** A tap on the disabled button still calls back (to say why it is off). */
  tapWhenOff?: boolean;
}

/**
 * A button in the theme's skin for inner screens: its faces painted once (`bakeButton`), the label
 * a painted label fitted to the face, a pressed face and a little drop of the label while held, the
 * selected face ('on', a tab or a tile) and the disabled face ('off'). Tappable over its whole
 * w x h (`setHit` for more); the tap does not reach objects under it. Extra content (an icon, a
 * GlyphText) is added with `addContent` and drops with the label.
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

  /** Another label (a prebaked one: `labelTexture` with the button's style), centred at y; '' for none. */
  setLabel(s: string, y = 0): this {
    this.label?.destroy();
    this.label = null;
    if (s) {
      const style = this.o.style ?? { size: this.o.size ?? 30 };
      this.label = labelAt(this.scene, 0, y, s, style, 0.5).setData('y0', y);
      fitWidth(this.label, this.o.w - 28);
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
