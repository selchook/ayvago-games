// Menu themes: a game's own look for the core menu (the live backdrop stays). A game declares a
// `menuTheme` in its definition (palette, display font, logo style with an emblem, a skin for the
// buttons, switches and plates, and a frame); the core menu draws the same layout in that skin.
// Every ornament is a canvas texture painted once and cached by key: nothing is redrawn per frame,
// and nothing here runs in play. Games without a theme never reach this file's drawing code.
import Phaser from 'phaser';
import { currentGame } from './registry';
import { playSfx } from './audio';
import { isModern } from './style';
import { upper } from './i18n';

// ------------------------------------------------------------------ the API

export interface MenuPalette {
  /** Face of the main button (PLAY). */
  primary: number;
  /** Face of the other buttons, the plates (sound, language) and the selected switch segment. */
  secondary: number;
  /** Boards and sunk pieces: the switch's track, the hero board, the logo plate. */
  board: number;
  /** Gold trim: hover rims, rivets, the selected segment's rim. */
  trim: number;
  /** Button label fill and outline. */
  label: string;
  labelStroke: string;
  /** Unselected switch labels. */
  muted: string;
  /** The best score line. */
  accent: string;
  /** The "HOW TO PLAY" heading and the how-to body text (drawn on the notes card). */
  heading: string;
  body: string;
  /** Icon tint on plates (the white Kenney icons). */
  icon: number;
  /** Colour of the vignette over the live backdrop. */
  shade: number;
}

/** Draws an emblem centred in a `size` x `size` box whose top-left is (0, 0). */
export type EmblemPainter = (c: CanvasRenderingContext2D, size: number) => void;

export interface LogoStyle {
  /** Gradient stops of the letters, top to bottom. */
  fill: string[];
  /** The thick outline around the letters. */
  outline: string;
  /** Outline width as a fraction of the font size (default 0.13). */
  outlineWidth?: number;
  /** A thin second rim outside the outline (default none). */
  rim?: string;
  /** The extruded side under the letters (default the outline colour). */
  depth?: string;
  /** Bevel highlight on the letters' top edges and a gloss band (default true). */
  bevel?: boolean;
  /** Drop shadow colour (default rgba(0,0,0,0.55)). */
  shadow?: string;
  /** Font size in px before fitting (default 140). */
  size?: number;
  /** Upper-case the title (locale-aware; default false: the title as written in game.json). */
  upper?: boolean;
  /** Line height of a two-line title, as a fraction of the font size (default 0.9). */
  lineHeight?: number;
  /**
   * An emblem behind the title (a skull and crossed cutlasses ...), painted procedurally.
   * `overlap` is how much of it the first line covers (fraction of its size, default 0.3).
   */
  emblem?: { draw: EmblemPainter; size: number; overlap?: number };
}

export type SkinKind = 'button' | 'plate' | 'board' | 'track' | 'round';
export type SkinState = 'up' | 'over' | 'down' | 'on' | 'off';

export interface SkinPaint {
  color: number;
  state: SkinState;
  palette: MenuPalette;
  /** Seed of the piece's random detail (grain, knots), so a size always looks the same. */
  seed: number;
}

/**
 * Paints one piece of a skin: a w x h face with its top-left at (0, 0). The canvas has SKIN_PAD
 * room on every side (more below) for shadows and glows.
 */
export type SkinPainter = (c: CanvasRenderingContext2D, kind: SkinKind, w: number, h: number, o: SkinPaint) => void;

/** Paints the card behind the how-to text: w x h, top-left (0, 0), SKIN_PAD room around it. */
export type NotesPainter = (c: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * A game's own ornament round the screen edge, the counterpart of the rope: an edge strip and a
 * corner piece, each painted once on a canvas (four strips and four corners, plain images).
 */
export interface BorderStyle {
  /** Thickness of the edge strips in px. */
  thick: number;
  /** Distance of the strips' outer side from the screen edge (default 8). */
  inset?: number;
  /**
   * Paints the top strip, `len` x `thick`, its outer side (towards the screen edge) at y = 0. The
   * bottom strip is its mirror image, the sides the same strip turned. Omit for corners only.
   */
  edge?: (c: CanvasRenderingContext2D, len: number, thick: number) => void;
  /**
   * Paints the top-left corner piece, `size` x `size`, the screen's corner at (0, 0); the other
   * corners are its mirror images. It sits `inset` from the screen edge (default the strips').
   */
  corner?: { size: number; draw: (c: CanvasRenderingContext2D, size: number) => void; inset?: number };
}

export interface MenuFrame {
  /**
   * An ornament around the screen edge: 'rope' (a twisted rope with brass corner rings) or the
   * game's own strips and corners (`BorderStyle`).
   */
  border?: 'rope' | BorderStyle | null;
  /** The card behind the how-to text: 'board' (the skin's board) or the game's own painter. */
  notes?: 'board' | NotesPainter | null;
  /** Strength of the vignette over the live backdrop (0 to 1, default 0.6). */
  vignette?: number;
  /**
   * A flat darkening of the whole backdrop under the vignette (0 to 1, default 0). A game that
   * dims its live backdrop itself can hand that to the theme, so the screen keeps one full-screen
   * layer (software-rendered phones and test machines pay for every one).
   */
  dim?: number;
}

export interface MenuTheme {
  /**
   * Display face for the logo, labels and headings (a CSS family). It must cover Turkish
   * (ç ğ ı İ ö ş ü) and be bundled with the game: import its module (`@core/fonts/pirata-one`).
   * Body text (the how-to) stays in the style's body font.
   */
  font: string;
  /** Size factor for labels in the display face (condensed faces read small; default 1). */
  fontScale?: number;
  palette: MenuPalette;
  logo: LogoStyle;
  /** Buttons, switches and plates: 'plank' (weathered wood, iron straps, rivets) or a painter. */
  skin: 'plank' | SkinPainter;
  frame?: MenuFrame;
  /**
   * The skin pieces the game's own menu widgets use (`menuOption`), painted ahead in Boot under
   * the Ayvago intro like the core's own. Buttons, plates and round knobs get all three states.
   */
  pieces?: Array<{
    kind: SkinKind; w: number; h: number; variant?: 'primary' | 'secondary';
    /** Any face colour (wins over `variant`): a tile per state colour, a red RESET ... */
    color?: number;
    /** The states to paint (default: all three of a button, plate or knob; 'up' of a board or track). */
    states?: SkinState[];
  }>;
  /**
   * The pause overlay and the result screen in the same look (src/core/overlay-theme.ts): on by
   * default for a themed game; `false` keeps the plain screens.
   */
  overlays?: OverlayStyle | false;
  /** Sizes of the cards (`themeCard`) the game's own panels use, painted ahead in Boot. */
  cards?: Array<{ w: number; h: number }>;
  /**
   * The game's own textures for its themed inner screens (a shop, a talent board, a setup page):
   * painted in Boot under the Ayvago intro, after the core's pieces, cards and overlays, so opening
   * those screens only places images. Paint with `bake` / `skinTexture` / `labelTexture`.
   */
  prebake?: (scene: Phaser.Scene) => void;
}

/** How the pause overlay and the result screen wear the theme. Every field is optional. */
export interface OverlayStyle {
  /**
   * The card behind the content: 'notes' (the frame's notes painter, the how-to card; the
   * default when the frame has one), 'board' (the skin's board) or the game's own painter.
   */
  card?: 'notes' | 'board' | NotesPainter;
  /** Flat darkening over the frozen round (0 to 1, default 0.5), under the vignette. */
  dim?: number;
  /** Vignette strength (default the frame's vignette, or 0.6). */
  vignette?: number;
  /** The emblem on the card's top edge (portrait): default the logo's emblem; null: none. */
  emblem?: EmblemPainter | null;
  /** The frame's border (the rope or the game's own) round the screen on these screens too (default: as on the menu). */
  border?: boolean;
  /** Text drawn on the card (labels, the best line, notes): default palette.body. */
  ink?: string;
  /** Result heading of a loss (default palette.heading, ink without outline) and of a win (default palette.accent, outlined). */
  lose?: string;
  win?: string;
  /** Face of the rewarded-ad button (default a sea green). */
  adColor?: number;
  /**
   * i18n keys of the headings the game passes to `endGame({ title })`, painted ahead in Boot
   * (in the current language, loss and win colours); others are painted when first shown.
   */
  titles?: string[];
}

/** The current game's menu theme, or null (the plain menu). */
export function menuTheme(): MenuTheme | null {
  return currentGame().menuTheme ?? null;
}

// ------------------------------------------------------------------ helpers

/** Room around every skin texture for the shadow and glow; one more half of it below. */
export const SKIN_PAD = 14;

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

/** Lightens (k > 0) or darkens (k < 0) a colour. */
export function shadeColor(c: number, k: number): number {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** FNV-1a hash of a string (texture keys, seeds). */
export const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * A 2D context on a plain software canvas. Chrome may back a canvas with the GPU, where every
 * blur and big stroke is slow to rasterise when WebGL is emulated (and the texture upload has
 * to read it back); these are painted once and uploaded, so the CPU is the right place.
 */
export function canvas2d(w: number, h: number): CanvasRenderingContext2D {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  return cv.getContext('2d', { willReadFrequently: true })!;
}

/** A canvas texture painted once; later calls return the cached key. */
export function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const c = canvas2d(w, h);
  draw(c);
  scene.textures.addCanvas(key, c.canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

function painter(theme: MenuTheme): SkinPainter {
  return typeof theme.skin === 'function' ? theme.skin : plankPainter;
}

/** The texture of one skin piece (cached). Its face is w x h, centred in the texture but SKIN_PAD / 2 higher. */
export function skinTexture(scene: Phaser.Scene, kind: SkinKind, w: number, h: number, state: SkinState = 'up', color?: number): string {
  const theme = menuTheme()!;
  const P = theme.palette;
  const col = color ?? (kind === 'board' || kind === 'track' ? P.board : P.secondary);
  w = Math.round(w); h = Math.round(h);
  const key = `mt-${kind}-${w}x${h}-${col.toString(16)}-${state}`;
  return bake(scene, key, w + SKIN_PAD * 2, h + SKIN_PAD * 3, (c) => {
    c.translate(SKIN_PAD, SKIN_PAD);
    painter(theme)(c, kind, w, h, { color: col, state, palette: P, seed: hash(`${kind}${w}x${h}`) });
  });
}

/** A skin piece as an image centred on (x, y). */
export function skinImage(scene: Phaser.Scene, x: number, y: number, kind: SkinKind, w: number, h: number, state: SkinState = 'up', color?: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y + SKIN_PAD / 2, skinTexture(scene, kind, w, h, state, color));
}

/**
 * Text in the theme's display face: a painted label with a dark outline and a soft shadow.
 * `size` is scaled by the theme's fontScale.
 */
export function themeText(scene: Phaser.Scene, x: number, y: number, s: string, o: { size?: number; color?: string; stroke?: string; strokeWidth?: number; shadow?: boolean } = {}): Phaser.GameObjects.Text {
  const theme = menuTheme()!;
  const size = Math.round((o.size ?? 32) * (theme.fontScale ?? 1));
  // the modern style halves outlines (src/core/style.ts): ask for twice the width
  const sw = Math.round(o.strokeWidth ?? size * 0.14);
  const t = scene.add.text(x, y, s, {
    fontFamily: `"${theme.font}", serif`,
    fontSize: `${size}px`,
    color: o.color ?? theme.palette.label,
    stroke: o.stroke ?? theme.palette.labelStroke,
    strokeThickness: sw > 0 && isModern() ? sw * 2 : sw,
    align: 'center',
    padding: { x: Math.ceil(size * 0.12), y: Math.ceil(size * 0.08) },
  }).setOrigin(0.5);
  if (o.shadow !== false) t.setShadow(0, Math.max(2, Math.round(size * 0.06)), 'rgba(0,0,0,0.55)', Math.round(size * 0.12), true, true);
  return t;
}

// ------------------------------------------------------------------ painted labels

export interface LabelStyle {
  /** Size in px; the display face's is scaled by the theme's fontScale (default 32). */
  size?: number;
  /** Fill colour (default palette.label), or a gradient top to bottom. */
  color?: string;
  fill?: string[];
  /** Outline colour (default palette.labelStroke); null: no outline. */
  stroke?: string | null;
  /** Outline width (default 0.14 of the size, as `themeText` looks). */
  strokeWidth?: number;
  /** Soft drop shadow (default true). */
  shadow?: boolean;
  /** The style's body font instead of the display face. */
  body?: boolean;
}

interface LabelMetrics { font: string; size: number; sw: number; pad: number; padBottom: number; asc: number; desc: number }

/**
 * The CSS font and pixel size a label style paints with: the display face scaled by the theme's
 * fontScale, or the style's body font. Measure with it to lay out painted labels.
 */
export function labelFont(o: LabelStyle, theme: MenuTheme = menuTheme()!): { font: string; size: number } {
  const base = o.size ?? 32;
  const size = o.body ? Math.round(base * (isModern() ? 0.92 : 1)) : Math.round(base * (theme.fontScale ?? 1));
  const font = o.body
    ? (isModern() ? `800 ${size}px "Nunito", sans-serif` : `${size}px "Pixelify Sans", sans-serif`)
    : `${size}px "${theme.font}", serif`;
  return { font, size };
}

function labelMetrics(theme: MenuTheme, o: LabelStyle, probeText: string): LabelMetrics {
  const { font, size } = labelFont(o, theme);
  const sw = o.stroke === null ? 0 : Math.round(o.strokeWidth ?? size * 0.14);
  const blur = o.shadow === false ? 0 : Math.round(size * 0.12);
  const offY = o.shadow === false ? 0 : Math.max(2, Math.round(size * 0.06));
  const probe = canvas2d(1, 1);
  probe.font = font;
  // one ascent and descent for every label of a style (the Turkish capitals' dots and cedillas
  // included), so labels side by side share a baseline
  const m = probe.measureText('ÇĞİÖŞÜ' + probeText);
  const asc = Math.ceil(Math.max(m.actualBoundingBoxAscent || 0, size * 0.78));
  const desc = Math.ceil(Math.max(m.actualBoundingBoxDescent || 0, size * 0.2));
  const pad = Math.ceil(sw / 2 + blur + 2);
  return { font, size, sw, pad, padBottom: pad + offY, asc, desc };
}

/** Draws one line of text with its outline and shadow; (x, y) is the baseline's centre. */
function paintLabel(c: CanvasRenderingContext2D, s: string, x: number, y: number, M: LabelMetrics, o: LabelStyle, P: MenuPalette): void {
  c.font = M.font;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.miterLimit = 2;
  const shadow = () => {
    if (o.shadow === false) return;
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = Math.round(M.size * 0.12);
    c.shadowOffsetY = Math.max(2, Math.round(M.size * 0.06));
  };
  let fill: string | CanvasGradient = o.color ?? P.label;
  if (o.fill?.length) {
    const g = c.createLinearGradient(0, y - M.asc * 0.8, 0, y + M.desc * 0.3);
    o.fill.forEach((f, i) => g.addColorStop(i / Math.max(1, o.fill!.length - 1), f));
    fill = g;
  }
  c.save();
  shadow();
  if (M.sw > 0) {
    c.strokeStyle = o.stroke ?? P.labelStroke;
    c.lineWidth = M.sw;
    c.strokeText(s, x, y);
    c.shadowColor = 'transparent';
  }
  c.fillStyle = fill;
  c.fillText(s, x, y);
  c.restore();
}

/**
 * A line of text painted once into a cached canvas texture: the display face (or the body font),
 * fill or gradient, outline and shadow. The image's origin sits on the middle of the letters'
 * box. Until the face has loaded the key differs, so the real label is painted later.
 */
export function labelTexture(scene: Phaser.Scene, s: string, o: LabelStyle = {}): string {
  const theme = menuTheme()!;
  const family = o.body ? '"Nunito"' : `"${theme.font}"`;
  const ready = typeof document.fonts?.check !== 'function' || document.fonts.check(`32px ${family}`, s || 'A');
  const key = `mt-lbl-${hash(s + '|' + JSON.stringify(o))}${ready ? '' : '-fallback'}`;
  if (scene.textures.exists(key)) return key;
  const M = labelMetrics(theme, o, s);
  const probe = canvas2d(1, 1);
  probe.font = M.font;
  const w = Math.ceil(probe.measureText(s).width) + M.pad * 2;
  const h = M.asc + M.desc + M.pad + M.padBottom;
  bake(scene, key, w, h, (c) => paintLabel(c, s, w / 2, M.pad + M.asc, M, o, theme.palette));
  (scene.textures.get(key).customData as Record<string, unknown>).originY = (M.pad + (M.asc + M.desc) / 2) / h;
  return key;
}

/** Points an image at a label texture and centres it on the letters. */
export function placeLabel(img: Phaser.GameObjects.Image, key: string): Phaser.GameObjects.Image {
  img.setTexture(key);
  return img.setOrigin(0.5, ((img.texture.customData as Record<string, unknown>).originY as number | undefined) ?? 0.5);
}

/** A painted label (`labelTexture`) as an image centred on (x, y). */
export function themeLabel(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle = {}): Phaser.GameObjects.Image {
  return placeLabel(scene.add.image(x, y, '__DEFAULT'), labelTexture(scene, s, o));
}

/**
 * Paints the characters `list` side by side in a label style into the texture `key`, one frame
 * per character named by it, each cell as wide as the character plus the label's padding, and
 * the frames' originY (the letters' middle) in its customData. `probeText` sets the ascent and
 * descent (as a label of that text). Returns each character's advance, unrounded.
 */
function paintGlyphs(scene: Phaser.Scene, key: string, list: string[], o: LabelStyle, probeText: string): number[] {
  const theme = menuTheme()!;
  const M = labelMetrics(theme, o, probeText);
  const probe = canvas2d(1, 1);
  probe.font = M.font;
  const adv = list.map((ch) => probe.measureText(ch).width);
  const cells = adv.map((a) => Math.ceil(a) + M.pad * 2);
  const w = cells.reduce((a, b) => a + b, 0), h = M.asc + M.desc + M.pad + M.padBottom;
  bake(scene, key, w, h, (c) => {
    let x = 0;
    list.forEach((ch, i) => { paintLabel(c, ch, x + cells[i] / 2, M.pad + M.asc, M, o, theme.palette); x += cells[i]; });
  });
  const tex = scene.textures.get(key);
  let x = 0;
  list.forEach((ch, i) => { if (!tex.has(ch)) tex.add(ch, 0, x, 0, cells[i], h); x += cells[i]; });
  (tex.customData as Record<string, unknown>).originY = (M.pad + (M.asc + M.desc) / 2) / h;
  return adv;
}

const DIGITS = '0123456789';

/** The ten digits in one label style, one frame each (cached): what `ThemeNumber` counts with. */
export function digitTexture(scene: Phaser.Scene, o: LabelStyle = {}): string {
  const theme = menuTheme()!;
  const ready = typeof document.fonts?.check !== 'function' || document.fonts.check(`32px "${theme.font}"`, DIGITS);
  const key = `mt-dig-${hash(JSON.stringify(o))}${ready ? '' : '-fallback'}`;
  if (scene.textures.exists(key)) return key;
  const M = labelMetrics(theme, o, DIGITS);
  const probe = canvas2d(1, 1);
  probe.font = M.font;
  const adv = [...DIGITS].map((d) => Math.ceil(probe.measureText(d).width));
  const cells = adv.map((a) => a + M.pad * 2);
  const w = cells.reduce((a, b) => a + b, 0), h = M.asc + M.desc + M.pad + M.padBottom;
  bake(scene, key, w, h, (c) => {
    let x = 0;
    [...DIGITS].forEach((d, i) => { paintLabel(c, d, x + cells[i] / 2, M.pad + M.asc, M, o, theme.palette); x += cells[i]; });
  });
  const tex = scene.textures.get(key);
  let x = 0;
  [...DIGITS].forEach((d, i) => { tex.add(d, 0, x, 0, cells[i], h); x += cells[i]; });
  const data = tex.customData as Record<string, unknown>;
  data.adv = Object.fromEntries([...DIGITS].map((d, i) => [d, adv[i]]));
  data.originY = (M.pad + (M.asc + M.desc) / 2) / h;
  return key;
}

/**
 * Every character of `chars` in one label style, one frame each, as the texture `key` (cached):
 * customData `adv` (each character's advance, unrounded) and `originY`. What `GlyphText`
 * (src/core/theme-panels.ts) sets its lines from.
 */
export function glyphTexture(scene: Phaser.Scene, key: string, o: LabelStyle, chars: string): string {
  if (scene.textures.exists(key)) return key;
  const list = [...new Set([...chars])];
  const adv = paintGlyphs(scene, key, list, o, chars);
  (scene.textures.get(key).customData as Record<string, unknown>).adv = Object.fromEntries(list.map((ch, i) => [ch, adv[i]]));
  return key;
}

/**
 * A number set from painted digits (`digitTexture`): changing it swaps frames, so a score can
 * count up every frame without rasterising any text. Centred on its position.
 */
export class ThemeNumber extends Phaser.GameObjects.Container {
  private key: string;
  private digits: Phaser.GameObjects.Image[] = [];
  private shown = '';
  /** Width of the digits as set (unscaled). */
  textWidth = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, value: number, o: LabelStyle = {}) {
    super(scene, x, y);
    this.key = digitTexture(scene, o);
    scene.add.existing(this);
    this.setValue(value);
  }

  setValue(n: number): this {
    const s = String(Math.max(0, Math.round(n)));
    if (s === this.shown) return this;
    this.shown = s;
    const tex = this.scene.textures.get(this.key);
    const data = tex.customData as { adv: Record<string, number>; originY: number };
    const adv = data.adv, oy = data.originY;
    while (this.digits.length < s.length) {
      const d = this.scene.add.image(0, 0, this.key, '0').setOrigin(0.5, oy);
      this.digits.push(d);
      this.add(d);
    }
    this.textWidth = [...s].reduce((a, d) => a + adv[d], 0);
    let x = -this.textWidth / 2;
    this.digits.forEach((img, i) => {
      const d = s[i];
      img.setVisible(!!d);
      if (!d) return;
      img.setFrame(d).setX(x + adv[d] / 2);
      x += adv[d];
    });
    return this;
  }
}

// ------------------------------------------------------------------ the 'plank' skin

/** A plank's outline: a rectangle with small, slightly uneven chamfered corners. */
function plankShape(w: number, h: number, r: () => number, kind: SkinKind): Path2D {
  const p = new Path2D();
  if (kind === 'round') {
    p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    return p;
  }
  const k = Math.min(10, h * 0.16);
  const j = () => (r() - 0.5) * k * 0.5;
  p.moveTo(k + j(), 0);
  p.lineTo(w - k + j(), 0);
  p.lineTo(w, k + j());
  p.lineTo(w, h - k + j());
  p.lineTo(w - k + j(), h);
  p.lineTo(k + j(), h);
  p.lineTo(0, h - k + j());
  p.lineTo(0, k + j());
  p.closePath();
  return p;
}

function rivet(c: CanvasRenderingContext2D, x: number, y: number, rad: number, trim: number): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.arc(x + rad * 0.25, y + rad * 0.35, rad * 1.1, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
  g.addColorStop(0, css(shadeColor(trim, 0.6)));
  g.addColorStop(0.5, css(trim));
  g.addColorStop(1, css(shadeColor(trim, -0.55)));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Wood grain: long wavy fibres, a few knots, the seams between boards. */
function grain(c: CanvasRenderingContext2D, w: number, h: number, color: number, r: () => number, boards: number): void {
  const dark = css(shadeColor(color, -0.5), 1);
  const lines = Math.round(h / 4);
  for (let i = 0; i < lines; i++) {
    const y0 = r() * h, amp = 1 + r() * 2.5, ph = r() * 6, freq = 0.01 + r() * 0.02;
    c.strokeStyle = r() < 0.18 ? 'rgba(255,236,200,0.10)' : dark;
    c.globalAlpha = 0.1 + r() * 0.18;
    c.lineWidth = 0.8 + r() * 1.6;
    c.beginPath();
    for (let x = -4; x <= w + 4; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp;
      x < 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
  const knots = w > 140 ? 1 + Math.floor(r() * 2) : r() < 0.5 ? 1 : 0;
  for (let i = 0; i < knots; i++) {
    const x = w * (0.2 + r() * 0.6), y = h * (0.25 + r() * 0.5), rx = 5 + r() * 7, ry = rx * (0.4 + r() * 0.2);
    for (let k = 3; k >= 0; k--) {
      c.strokeStyle = css(shadeColor(color, -0.55), 0.22 + k * 0.05);
      c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(x, y, rx + k * 3.2, ry + k * 1.7, 0, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = css(shadeColor(color, -0.6), 0.55);
    c.beginPath(); c.ellipse(x, y, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2); c.fill();
  }
  for (let b = 1; b < boards; b++) {
    const y = (h * b) / boards + (r() - 0.5) * 2;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, y - 1.5, w, 3);
    c.fillStyle = 'rgba(255,240,210,0.16)'; c.fillRect(0, y + 1.5, w, 1.5);
  }
}

/**
 * The built-in 'plank' skin: weathered wooden planks with grain and knots, chipped paint on the
 * main button, iron straps with brass rivets on big buttons, nails on small plates.
 */
export const plankPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const dy = o.state === 'down' ? 3 : 0;
  const color = o.state === 'off' ? shadeColor(o.color, -0.35) : o.color;
  const shape = plankShape(w, h, r, kind);
  c.save();
  c.translate(0, dy);
  // shadow (a sunk piece casts almost none)
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = sunk ? 3 : 10;
  c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000';
  c.fill(shape);
  c.restore();
  // the wood: lighter on top, darker at the bottom
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shadeColor(color, sunk ? -0.1 : 0.16)));
  body.addColorStop(0.5, css(color));
  body.addColorStop(1, css(shadeColor(color, -0.3)));
  c.fillStyle = body;
  c.fill(shape);
  c.save();
  c.clip(shape);
  const boards = kind === 'round' ? 1 : h >= 70 && kind !== 'plate' ? 2 : 1;
  grain(c, w, h, color, r, boards);
  // chipped paint: bare wood showing through near the edges of a painted (reddish) face
  if (kind === 'button' && color === P.primary) {
    for (let i = 0; i < 9; i++) {
      const edge = r() < 0.5, x = edge ? r() * w : r() < 0.5 ? r() * 14 : w - r() * 14, y = edge ? (r() < 0.5 ? r() * 7 : h - r() * 7) : r() * h;
      c.fillStyle = css(shadeColor(P.secondary, 0.1), 0.55);
      c.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = 2 + r() * 5;
        k ? c.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr);
      }
      c.fill();
    }
  }
  // inner bevel: a light top edge, a dark bottom edge, darker sides
  const side = c.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.28)'); side.addColorStop(0.08, 'rgba(0,0,0,0)');
  side.addColorStop(0.92, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.32)');
  c.fillStyle = side; c.fillRect(0, 0, w, h);
  if (sunk) {
    // a sunk piece: shadow under its top edge
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.5)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  } else {
    c.fillStyle = 'rgba(255,240,210,0.28)'; c.fillRect(0, 0, w, 3);
    c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(0, h - 5, w, 5);
  }
  c.restore();
  // the outline
  c.lineWidth = 3;
  c.strokeStyle = css(shadeColor(color, -0.75));
  c.stroke(shape);
  // hardware
  const rv = Math.max(3, Math.min(5, h * 0.06));
  if (kind === 'round') {
    c.lineWidth = 4;
    c.strokeStyle = css(shadeColor(P.trim, -0.35));
    c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) / 2 - 4, 0, Math.PI * 2); c.stroke();
  } else if (kind === 'button' && w >= 260) {
    // iron straps across both ends, two brass rivets on each
    for (const x0 of [24, w - 40]) {
      const g = c.createLinearGradient(x0, 0, x0 + 16, 0);
      g.addColorStop(0, '#2a2d33'); g.addColorStop(0.45, '#5a6068'); g.addColorStop(1, '#1d1f24');
      c.fillStyle = g; c.fillRect(x0, -1, 16, h + 2);
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.strokeRect(x0, -1, 16, h + 2);
      rivet(c, x0 + 8, 13, rv + 1, P.trim);
      rivet(c, x0 + 8, h - 13, rv + 1, P.trim);
    }
  } else if (kind === 'board') {
    // a gold inlay line and brass corner brackets
    c.strokeStyle = css(P.trim, 0.55); c.lineWidth = 2;
    c.strokeRect(9, 9, w - 18, h - 18);
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
      c.save(); c.translate(x, y); c.scale(sx, sy);
      c.fillStyle = css(shadeColor(P.trim, -0.2));
      c.beginPath(); c.moveTo(2, 2); c.lineTo(30, 2); c.lineTo(30, 9); c.lineTo(9, 9); c.lineTo(9, 30); c.lineTo(2, 30); c.closePath(); c.fill();
      c.strokeStyle = css(shadeColor(P.trim, -0.7)); c.lineWidth = 1.5; c.stroke();
      rivet(c, 6, 6, 3, P.trim);
      c.restore();
    }
  } else if (kind !== 'track') {
    // nails in the corners
    const m = Math.max(8, Math.min(12, h * 0.16));
    for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) rivet(c, x, y, rv, P.trim);
  }
  // states: a gold rim (hover, the selected segment)
  if (o.state === 'over' || o.state === 'on') {
    c.save();
    c.shadowColor = css(P.trim, 0.9); c.shadowBlur = o.state === 'over' ? 14 : 8;
    c.lineWidth = o.state === 'over' ? 4 : 3;
    c.strokeStyle = css(shadeColor(P.trim, 0.25));
    c.stroke(shape);
    c.restore();
  }
  if (o.state === 'down') {
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.fill(shape);
  }
  c.restore();
};

// ------------------------------------------------------------------ the logo

export interface LogoLayout {
  canvas: HTMLCanvasElement;
  /** The letters only (white), same size and place as `canvas`: the mask of the shine. */
  letters: HTMLCanvasElement;
  /** Box of the letters inside the canvas. */
  text: { x: number; y: number; w: number; h: number };
}

/** The ways to set a title: on one line, and on two split at the space that makes them most even. */
function logoCandidates(c: CanvasRenderingContext2D, text: string): string[][] {
  const words = text.split(' ');
  const out: string[][] = [[text]];
  let best: string[] | null = null, bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const w = Math.max(c.measureText(a).width, c.measureText(b).width);
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  if (best) out.push(best);
  return out;
}

/** Every measure of a logo set in `lines` at font size `fs`. */
function measureLogo(theme: MenuTheme, probe: CanvasRenderingContext2D, lines: string[], fs: number) {
  const L = theme.logo;
  probe.font = `${fs}px "${theme.font}", serif`;
  const ow = fs * (L.outlineWidth ?? 0.13);
  const rimW = L.rim ? Math.max(2, fs * 0.035) : 0;
  const depth = Math.round(fs * 0.06);
  const lh = fs * (L.lineHeight ?? 0.9);
  const m = probe.measureText('ÇĞİÖŞÜ' + lines.join(''));
  const asc = Math.max(m.actualBoundingBoxAscent, fs * 0.72), desc = Math.max(m.actualBoundingBoxDescent, fs * 0.18);
  const textW = Math.max(...lines.map((l) => probe.measureText(l).width));
  const textH = asc + desc + lh * (lines.length - 1);
  const halo = Math.ceil(ow / 2 + rimW + fs * 0.12);
  const E = L.emblem;
  // the emblem grows and shrinks with the letters
  const eSize = E ? E.size * Phaser.Math.Clamp(fs / (L.size ?? 140), 0.6, 1.3) : 0;
  const eTop = E ? -eSize * (1 - (E.overlap ?? 0.3)) : 0;
  const top = Math.min(0, eTop) - halo, bottom = textH + depth + halo + 6;
  const W = Math.ceil(Math.max(textW + halo * 2, eSize + 24)), H = Math.ceil(bottom - top);
  return { lines, fs, ow, rimW, depth, lh, asc, desc, textW, textH, eSize, eTop, top, W, H };
}

/**
 * Renders a title as the theme's logo: the emblem behind, then per line a drop shadow, an
 * extruded side, the rim and outline, a gradient fill, a bevel highlight and a gloss band.
 * The layout is fitted to maxW x maxH: one line or two (whichever lets the letters be larger),
 * drawn at the fitted size so it is never scaled afterwards. Pure canvas (no Phaser), so the
 * store-art script takes the same picture.
 */
export function renderLogo(theme: MenuTheme, title: string, maxW: number, size?: number, maxH = Infinity): LogoLayout {
  const L = theme.logo;
  const text = L.upper ? upper(title) : title;
  const size0 = size ?? L.size ?? 140;
  const probe = canvas2d(1, 1);
  probe.font = `${size0}px "${theme.font}", serif`;
  let pick: ReturnType<typeof measureLogo> | null = null;
  for (const lines of logoCandidates(probe, text)) {
    let fit = measureLogo(theme, probe, lines, size0);
    for (let i = 0; i < 5; i++) {
      const k = Math.min(1, maxW / fit.W, maxH / fit.H);
      if (k >= 0.995) break;
      fit = measureLogo(theme, probe, lines, Math.floor(fit.fs * k));
    }
    // two lines only when they let the letters be clearly larger
    if (!pick || fit.fs > pick.fs * 1.15) pick = fit;
  }
  const { lines, fs, ow, rimW, depth, lh, asc, desc, textW, textH, eSize, eTop, top, W, H } = pick!;
  const E = L.emblem;
  const font = (s: number) => `${s}px "${theme.font}", serif`;
  const ox = W / 2, oy = -top;   // text box: x centred on ox, its top at oy

  const make = (w = W, h = H) => canvas2d(w, h).canvas;
  const canvas = make(), letters = make();
  const c = canvas.getContext('2d')!;
  // Every layer is drawn once into its own canvas and copied: a canvas shadow blur or a big
  // stroked text costs a lot on software canvases, a copy almost nothing.
  if (E) {
    const em = make(Math.ceil(eSize), Math.ceil(eSize));
    E.draw(em.getContext('2d')!, eSize);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.drawImage(em, ox - eSize / 2, oy + eTop);
    c.restore();
  }
  const setup = (g: CanvasRenderingContext2D) => {
    g.font = font(fs); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.miterLimit = 2;
  };
  const baseY = (i: number) => oy + asc + i * lh;
  const each = (fn: (line: string, y: number) => void) => lines.forEach((l, i) => fn(l, baseY(i)));
  const layer = (paint: (g: CanvasRenderingContext2D) => void) => {
    const cv = make(), g = cv.getContext('2d')!;
    setup(g);
    paint(g);
    return cv;
  };
  setup(c);
  const outer = layer((g) => { g.strokeStyle = L.rim ?? L.outline; g.lineWidth = ow + rimW * 2; each((l, y) => g.strokeText(l, 0 + ox, y)); });
  // drop shadow under the extruded side, then the side: the rim, the outline and the depth colour
  // stacked a pixel or two at a time
  c.save();
  c.shadowColor = L.shadow ?? 'rgba(0,0,0,0.55)'; c.shadowBlur = fs * 0.12; c.shadowOffsetY = fs * 0.06;
  c.drawImage(outer, 0, depth);
  c.restore();
  for (let d = 0; d <= depth; d += 2) c.drawImage(outer, 0, d);
  if (L.rim) {
    const inner = layer((g) => { g.strokeStyle = L.outline; g.lineWidth = ow; each((l, y) => g.strokeText(l, ox, y)); });
    for (let d = 0; d <= depth; d += 2) c.drawImage(inner, 0, d);
  }
  const side = layer((g) => { g.fillStyle = L.depth ?? L.outline; each((l, y) => g.fillText(l, ox, y)); });
  for (let d = 1; d <= depth; d++) c.drawImage(side, 0, d);
  // the letters: gradient fill
  each((l, y) => {
    const g = c.createLinearGradient(0, y - asc, 0, y + desc * 0.4);
    L.fill.forEach((s, i) => g.addColorStop(i / Math.max(1, L.fill.length - 1), s));
    c.fillStyle = g;
    c.fillText(l, ox, y);
  });
  // the letters alone (the shine's mask)
  const lc = letters.getContext('2d')!;
  setup(lc);
  lc.fillStyle = '#fff';
  each((l, y) => lc.fillText(l, ox, y));
  if (L.bevel !== false) {
    // bevel: a light crescent on the top edges (the letters minus themselves shifted down) and a
    // darker one on the bottom edges, then a soft gloss band over the upper half
    const off = make(), g = off.getContext('2d')!;
    setup(g);
    const crescent = (dyOut: number, colour: string, alpha: number) => {
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = colour;
      each((l, y) => g.fillText(l, ox, y));
      g.globalCompositeOperation = 'destination-out';
      each((l, y) => g.fillText(l, ox, y + dyOut));
      c.globalAlpha = alpha;
      c.drawImage(off, 0, 0);
      c.globalAlpha = 1;
    };
    crescent(Math.max(2, fs * 0.035), '#fffbe8', 0.85);
    crescent(-Math.max(2, fs * 0.03), '#000000', 0.3);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff';
    each((l, y) => g.fillText(l, ox, y));
    g.globalCompositeOperation = 'source-in';
    each((_l, y) => {
      const gl = g.createLinearGradient(0, y - asc, 0, y - asc * 0.35);
      gl.addColorStop(0, 'rgba(255,255,255,0.42)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(0, y - asc - 4, W, asc * 0.7);
    });
    c.drawImage(off, 0, 0);
  }
  return { canvas, letters, text: { x: ox - textW / 2, y: oy, w: textW, h: textH } };
}

/**
 * The logo of a title as a texture and its letters' mask (cached). Until the display face has
 * loaded (a slow network past launch's wait) the key differs, so the real logo is made later.
 */
function logoTextures(scene: Phaser.Scene, theme: MenuTheme, title: string, maxW: number, maxH: number): { key: string; mask: string } {
  const ready = typeof document.fonts?.check !== 'function' || document.fonts.check(`64px "${theme.font}"`, title);
  const key = `mt-logo-${hash(title)}-${Math.round(maxW)}x${Math.round(maxH)}${ready ? '' : '-fallback'}`;
  if (scene.textures.exists(key)) return { key, mask: key + '-m' };
  const layout = renderLogo(theme, title, maxW, undefined, maxH);
  scene.textures.addCanvas(key, layout.canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  scene.textures.addCanvas(key + '-m', layout.letters);
  return { key, mask: key + '-m' };
}

/** Paints the logo ahead of time (the Boot scene does it under the Ayvago intro). */
export function bakeMenuLogo(scene: Phaser.Scene, title: string, maxW: number, maxH: number): void {
  const theme = menuTheme();
  if (theme) logoTextures(scene, theme, title, maxW, maxH);
}

/**
 * The themed title: the logo image placed between `top` and `bottom` (its bottom edge on
 * `bottom`, shrunk when taller than the room), centred on x. Returns the image.
 */
export function themeLogo(scene: Phaser.Scene, x: number, top: number, bottom: number, title: string, maxW: number): Phaser.GameObjects.Image {
  const theme = menuTheme()!;
  const { key, mask } = logoTextures(scene, theme, title, maxW, bottom - top);
  const img = scene.add.image(x, bottom, key).setOrigin(0.5, 1);
  const k = Math.min(1, (bottom - top) / img.height, maxW / img.width);
  img.setScale(k).setData('maskKey', mask);
  return img;
}

// ------------------------------------------------------------------ frame and backdrop

/** Vignette over the live backdrop: darker at the edges and behind the logo, over an optional flat dim (one small texture, scaled). */
export function themeShade(scene: Phaser.Scene, strength: number, dim = 0): Phaser.GameObjects.Image {
  const { width, height } = scene.scale;
  return scene.add.image(0, 0, shadeTexture(scene, strength, dim)).setOrigin(0).setDisplaySize(width, height).setDepth(-50);
}

function shadeTexture(scene: Phaser.Scene, strength: number, dim: number): string {
  const theme = menuTheme()!;
  const { width, height } = scene.scale;
  const tw = 90, th = Math.round((90 * height) / width);
  return bake(scene, `mt-shade-${tw}x${th}-${strength}-${dim}`, tw, th, (c) => {
    const col = theme.palette.shade;
    if (dim > 0) { c.fillStyle = css(col, dim); c.fillRect(0, 0, tw, th); }
    const v = c.createRadialGradient(tw / 2, th * 0.5, Math.min(tw, th) * 0.25, tw / 2, th * 0.5, Math.max(tw, th) * 0.62);
    v.addColorStop(0, css(col, 0.08 * strength)); v.addColorStop(1, css(col, 0.9 * strength));
    c.fillStyle = v; c.fillRect(0, 0, tw, th);
    // a soft dark pool behind the logo
    const l = c.createRadialGradient(tw / 2, th * 0.19, 0, tw / 2, th * 0.19, tw * 0.55);
    l.addColorStop(0, css(col, 0.55 * strength)); l.addColorStop(1, css(col, 0));
    c.fillStyle = l; c.fillRect(0, 0, tw, th);
  });
}

const ROPE_T = 12, ROPE_RING = 30, ROPE_INSET = 8;

/** A rope tile (twisted strands) of `len` x `thick` px, repeated along the edges. */
function ropeTile(scene: Phaser.Scene, thick: number): string {
  const len = Math.round(thick * 1.25);
  return bake(scene, `mt-rope-${thick}`, len, thick + 4, (c) => {
    const y0 = 2, h = thick;
    const g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#6b4a22'); g.addColorStop(0.3, '#d9b36c'); g.addColorStop(0.55, '#c49a52'); g.addColorStop(1, '#5a3c18');
    c.fillStyle = g; c.fillRect(0, y0, len, h);
    // the strands: slanted dark grooves with a light edge
    for (let i = -1; i < 2; i++) {
      const x = i * len * 0.5 + len * 0.25;
      c.strokeStyle = 'rgba(50,30,10,0.75)'; c.lineWidth = Math.max(1.5, thick * 0.13);
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x + len * 0.5, y0 + h); c.stroke();
      c.strokeStyle = 'rgba(255,236,190,0.45)'; c.lineWidth = Math.max(1, thick * 0.07);
      c.beginPath(); c.moveTo(x + thick * 0.16, y0); c.lineTo(x + len * 0.5 + thick * 0.16, y0 + h); c.stroke();
    }
    c.fillStyle = 'rgba(40,22,6,0.7)';
    c.fillRect(0, y0, len, 1.2); c.fillRect(0, y0 + h - 1.2, len, 1.2);
  });
}

/** A brass ring where the ropes meet in a corner. */
function ringTexture(scene: Phaser.Scene, size: number, trim: number): string {
  return bake(scene, `mt-ring-${size}-${trim.toString(16)}`, size + 8, size + 8, (c) => {
    const cx = size / 2 + 4, cy = size / 2 + 4, R = size / 2;
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
    c.lineWidth = size * 0.22;
    const g = c.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, css(shadeColor(trim, 0.5))); g.addColorStop(0.5, css(trim)); g.addColorStop(1, css(shadeColor(trim, -0.55)));
    c.strokeStyle = g;
    c.beginPath(); c.arc(cx, cy, R - c.lineWidth / 2, 0, Math.PI * 2); c.stroke();
    c.shadowColor = 'transparent';
    c.lineWidth = 1.5; c.strokeStyle = css(shadeColor(trim, -0.7));
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, R - size * 0.22, 0, Math.PI * 2); c.stroke();
  });
}

/** A rope around the screen, inset a little, with brass rings in the corners (four tile sprites). */
export function ropeBorder(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const theme = menuTheme()!;
  const { width: W, height: H } = scene.scale;
  const a = ROPE_INSET + ROPE_T / 2;
  const across = ropeStrip(scene, W - a * 2, false), down = ropeStrip(scene, H - a * 2, true);
  const ring = ringTexture(scene, ROPE_RING, theme.palette.trim);
  // plain images of strips painted once: they batch with the rest of the menu (a TileSprite keeps
  // its own canvas and texture and costs far more to draw on software-rendered GPUs)
  const out: Phaser.GameObjects.Image[] = [
    scene.add.image(W / 2, a, across),
    scene.add.image(W / 2, H - a, across).setFlipY(true),
    scene.add.image(a, H / 2, down),
    scene.add.image(W - a, H / 2, down).setFlipX(true),
  ];
  for (const [x, y] of [[a, a], [W - a, a], [a, H - a], [W - a, H - a]]) out.push(scene.add.image(x, y, ring));
  for (const o of out) o.setDepth(-40);
  return out;
}

/** A rope `len` px long, across or down: the tile repeated along a strip (cached). */
function ropeStrip(scene: Phaser.Scene, len: number, vertical: boolean): string {
  len = Math.round(len);
  const tile = scene.textures.get(ropeTile(scene, ROPE_T)).getSourceImage() as HTMLCanvasElement;
  const tw = tile.width, th = tile.height;
  return bake(scene, `mt-rope-${vertical ? 'v' : 'h'}-${len}`, vertical ? th : len, vertical ? len : th, (c) => {
    if (vertical) { c.translate(th, 0); c.rotate(Math.PI / 2); }
    for (let x = 0; x < len; x += tw) c.drawImage(tile, x, 0);
  });
}

/**
 * The theme's ornament round the screen (the rope or the game's `BorderStyle`), or nothing
 * without one. Depth -40, under the menu's widgets.
 */
export function frameBorder(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const border = menuTheme()?.frame?.border;
  if (!border) return [];
  if (border === 'rope') return ropeBorder(scene);
  const { width: W, height: H } = scene.scale;
  const inset = border.inset ?? 8;
  const out: Phaser.GameObjects.Image[] = [];
  if (border.edge) {
    const across = borderStrip(scene, border, W - inset * 2, false), down = borderStrip(scene, border, H - inset * 2, true);
    out.push(
      scene.add.image(W / 2, inset, across).setOrigin(0.5, 0),
      scene.add.image(W / 2, H - inset, across).setOrigin(0.5, 1).setFlipY(true),
      scene.add.image(inset, H / 2, down).setOrigin(0, 0.5),
      scene.add.image(W - inset, H / 2, down).setOrigin(1, 0.5).setFlipX(true),
    );
  }
  if (border.corner) {
    const key = borderCorner(scene, border), ci = border.corner.inset ?? inset;
    out.push(
      scene.add.image(ci, ci, key).setOrigin(0, 0),
      scene.add.image(W - ci, ci, key).setOrigin(1, 0).setFlipX(true),
      scene.add.image(ci, H - ci, key).setOrigin(0, 1).setFlipY(true),
      scene.add.image(W - ci, H - ci, key).setOrigin(1, 1).setFlipX(true).setFlipY(true),
    );
  }
  for (const o of out) o.setDepth(-40);
  return out;
}

/** One edge strip of a `BorderStyle`, across or down (cached); down: its outer side at x = 0. */
function borderStrip(scene: Phaser.Scene, b: BorderStyle, len: number, vertical: boolean): string {
  len = Math.round(len);
  const t = Math.ceil(b.thick);
  return bake(scene, `mt-border-${hash(String(b.edge))}-${vertical ? 'v' : 'h'}-${len}x${t}`, vertical ? t : len, vertical ? len : t, (c) => {
    // turned a quarter clockwise and mirrored: the strip's y = 0 lies on x = 0, its start on top
    if (vertical) c.setTransform(0, 1, 1, 0, 0, 0);
    b.edge!(c, len, t);
  });
}

/** The corner piece of a `BorderStyle` (cached). */
function borderCorner(scene: Phaser.Scene, b: BorderStyle): string {
  const s = Math.ceil(b.corner!.size);
  return bake(scene, `mt-corner-${hash(String(b.corner!.draw))}-${s}`, s, s, (c) => b.corner!.draw(c, s));
}

/** The card behind the how-to text: the theme's notes painter or the skin's board. */
export function notesCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Image | null {
  const key = notesTexture(scene, w, h);
  return key ? scene.add.image(x, y + SKIN_PAD / 2, key).setDepth(-10) : null;
}

/** The notes card's texture (cached), or null without one. */
export function notesTexture(scene: Phaser.Scene, w: number, h: number): string | null {
  const notes = menuTheme()!.frame?.notes;
  if (!notes) return null;
  if (notes === 'board') return skinTexture(scene, 'board', w, h);
  w = Math.round(w); h = Math.round(h);
  return bake(scene, `mt-notes-${w}x${h}`, w + SKIN_PAD * 2, h + SKIN_PAD * 3, (c) => {
    c.translate(SKIN_PAD, SKIN_PAD);
    notes(c, w, h);
  });
}

/**
 * Paints, ahead of the menu, every texture the themed menu will use: the vignette, the rope,
 * the core's buttons, switch and plates (`brandW`: the width of the Ayvago logo's plate) and the
 * game's declared pieces. Boot runs it under the Ayvago intro: a menu with a live 3D backdrop
 * queues that world's shader compilation as it opens, and on a software-rendered GPU every
 * texture uploaded after that waits behind it (and the first round with it).
 */
export function prebakeMenuTheme(scene: Phaser.Scene, brandW: number): void {
  const theme = menuTheme();
  if (!theme) return;
  const P = theme.palette;
  shadeTexture(scene, theme.frame?.vignette ?? 0.6, theme.frame?.dim ?? 0);
  const border = theme.frame?.border;
  if (border === 'rope') {
    const { width: W, height: H } = scene.scale, a = ROPE_INSET + ROPE_T / 2;
    ropeStrip(scene, W - a * 2, false);
    ropeStrip(scene, H - a * 2, true);
    ringTexture(scene, ROPE_RING, P.trim);
  } else if (border) {
    const { width: W, height: H } = scene.scale, inset = border.inset ?? 8;
    if (border.edge) { borderStrip(scene, border, W - inset * 2, false); borderStrip(scene, border, H - inset * 2, true); }
    if (border.corner) borderCorner(scene, border);
  }
  const states = (kind: SkinKind, w: number, h: number, color?: number) => {
    for (const st of ['up', 'over', 'down'] as SkinState[]) skinTexture(scene, kind, w, h, st, color);
  };
  states('button', 380, 110, P.primary);                    // PLAY
  skinTexture(scene, 'track', 336, 94);                      // the Easy | Normal switch
  skinTexture(scene, 'button', 152, 72, 'on');
  skinTexture(scene, 'button', 152, 72, 'off');
  states('plate', 72, 72);                                   // sound, leaderboard
  states('plate', 100, 72);                                  // language
  skinTexture(scene, 'plate', brandW, 72, 'up', P.board);    // under the Ayvago logo
  for (const p of theme.pieces ?? []) {
    const color = p.color ?? (p.variant === 'primary' ? P.primary : undefined);
    if (p.states) for (const st of p.states) skinTexture(scene, p.kind, p.w, p.h, st, color);
    else if (p.kind === 'board' || p.kind === 'track') skinTexture(scene, p.kind, p.w, p.h, 'up', color);
    else states(p.kind, p.w, p.h, color);
  }
}

// ------------------------------------------------------------------ widgets

export interface SkinButtonOptions {
  width?: number;
  height?: number;
  /** 'primary' (PLAY) or 'secondary' (default). */
  variant?: 'primary' | 'secondary';
  kind?: SkinKind;
  /** Label size before the theme's fontScale (default 30). */
  size?: number;
  /** The tap's sound (default 'ui-click'; '' for none, when the action plays its own). */
  sfx?: string;
  /**
   * The label as a texture painted once and cached by text (`labelTexture`) instead of a live
   * Text object: the pause and result screens open without any text rasterising.
   */
  baked?: boolean;
  /** Face colour (default by variant). */
  color?: number;
}

/** The baked label's style of a SkinButton of label size `size`. */
export const buttonLabelStyle = (size: number): LabelStyle => ({ size });

/**
 * A button in the theme's skin, the themed menu's counterpart of `Button`: a baked texture per
 * state (up, over with a gold rim, down pressed in), the label in the display face.
 */
export class SkinButton extends Phaser.GameObjects.Container {
  readonly face: Phaser.GameObjects.Image;
  /** A live Text, or with `baked` an image of the painted label. */
  readonly label: Phaser.GameObjects.Text | Phaser.GameObjects.Image;
  /** The small second line under the label (`setSub`), made on first use. */
  sub: Phaser.GameObjects.Text | null = null;
  readonly w: number;
  readonly h: number;
  /** False: the face shows the skin's 'off' state and a tap calls `onDenied` instead (`setEnabled`). */
  enabled = true;
  /** A tap while disabled (a locked choice on show): shake it, say why. */
  onDenied: (() => void) | null = null;
  private keys: Record<'up' | 'over' | 'down', string>;
  private kind: SkinKind;
  private color: number;
  private labelY = 0;
  private labelSize: number;
  private shown: 'up' | 'over' | 'down' = 'up';

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, private onClick: () => void, o: SkinButtonOptions = {}) {
    super(scene, x, y);
    const theme = menuTheme()!;
    this.w = o.width ?? 360; this.h = o.height ?? 96;
    this.kind = o.kind ?? 'button';
    this.color = o.color ?? (o.variant === 'primary' ? theme.palette.primary : theme.palette.secondary);
    this.labelSize = o.size ?? 30;
    this.keys = this.faceKeys();
    this.face = scene.add.image(0, SKIN_PAD / 2, this.keys.up);
    this.label = o.baked ? themeLabel(scene, 0, 0, text, buttonLabelStyle(this.labelSize)) : themeText(scene, 0, 0, text, { size: this.labelSize });
    this.add([this.face, this.label]);
    this.fitLabel();
    this.setSize(this.w, this.h).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.show('over'));
    this.on('pointerout', () => this.show('up'));
    this.on('pointerdown', () => this.show('down'));
    // a finger leaves no hover behind
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.show(p.wasTouch ? 'up' : 'over');
      if (!this.enabled) { this.onDenied?.(); return; }
      if (o.sfx !== '') playSfx(scene, o.sfx ?? 'ui-click');
      this.onClick();
    });
    scene.add.existing(this);
  }

  private faceKeys(): Record<'up' | 'over' | 'down', string> {
    const { scene, kind, w, h, color } = this;
    return {
      up: skinTexture(scene, kind, w, h, 'up', color),
      over: skinTexture(scene, kind, w, h, 'over', color),
      down: skinTexture(scene, kind, w, h, 'down', color),
    };
  }

  private show(s: 'up' | 'over' | 'down'): void {
    this.shown = s;
    // a disabled button keeps its 'off' face (no hover, no press)
    this.face.setTexture(this.enabled ? this.keys[s] : skinTexture(this.scene, this.kind, this.w, this.h, 'off', this.color));
    const dy = this.enabled && s === 'down' ? 3 : 0;
    this.label.y = this.labelY + dy;
    if (this.sub) this.sub.y = this.subY + dy;
  }

  /**
   * Enables or disables the button. Disabled, it shows the skin's 'off' state (declare it in
   * `pieces` with `states`, or it is painted on first use) and taps go to `onDenied`.
   */
  setEnabled(on: boolean): this {
    if (on === this.enabled) return this;
    this.enabled = on;
    this.label.setAlpha(on ? 1 : 0.6);
    this.sub?.setAlpha(on ? 1 : 0.6);
    this.show(this.shown);
    return this;
  }

  /** Shows the hover face while `on` (the keyboard's focus), the plain face when not. */
  setHighlight(on: boolean): this {
    this.show(on ? 'over' : 'up');
    return this;
  }

  /** Another face colour (each colour's states are textures of their own: declare them in `pieces`). */
  setColor(color: number): this {
    if (color === this.color) return this;
    this.color = color;
    this.keys = this.faceKeys();
    this.show(this.shown);
    return this;
  }

  private subY = 0;

  /**
   * A small second line in the body font under the label (the price, what it starts); the label
   * moves up to make room. An empty string takes it away again.
   */
  setSub(s: string, o: { size?: number; color?: string } = {}): this {
    const theme = menuTheme()!;
    if (!this.sub) {
      this.sub = this.scene.add.text(0, 0, '', {
        fontFamily: isModern() ? '"Nunito", sans-serif' : '"Pixelify Sans", sans-serif',
        fontStyle: isModern() ? '800' : 'normal',
        fontSize: `${o.size ?? Math.round(this.labelSize * 0.52)}px`,
        color: o.color ?? theme.palette.label,
        stroke: theme.palette.labelStroke,
        strokeThickness: isModern() ? 6 : 3,
        align: 'center',
        padding: { x: 4, y: 3 },
      }).setOrigin(0.5).setAlpha(this.enabled ? 1 : 0.6);
      this.add(this.sub);
    }
    if (o.color) this.sub.setColor(o.color);
    if (this.sub.text !== s) this.sub.setText(s);
    this.sub.setVisible(!!s).setScale(1);
    if (this.sub.width > this.w - 30) this.sub.setScale((this.w - 30) / this.sub.width);
    const lh = (this.label.height * this.label.scaleY) * 0.5;
    this.setLabelY(s ? -Math.min(this.h * 0.2, lh * 0.6) : 0);
    this.subY = s ? Math.min(this.h / 2 - 16, this.labelY + lh + 4) : 0;
    this.sub.y = this.subY;
    return this;
  }

  /** Moves the label (e.g. to make room for an icon or a second line). */
  setLabelY(y: number): this {
    this.labelY = y;
    this.label.y = y;
    return this;
  }

  setText(s: string): this {
    if (this.label instanceof Phaser.GameObjects.Text) this.label.setText(s);
    else placeLabel(this.label, labelTexture(this.scene, s, buttonLabelStyle(this.labelSize)));
    this.fitLabel();
    return this;
  }

  /** Shrinks a long label (German-long Turkish words) to the button's width. */
  fitLabel(room = this.w - 36): this {
    this.label.setScale(1);
    if (this.label.width > room) this.label.setScale(room / this.label.width);
    return this;
  }

  press(): void {
    playSfx(this.scene, 'ui-click');
    this.onClick();
  }
}

/** A square plate with an icon (sound, leaderboard), keeping `iconButton`'s data('icon'). */
export function skinIconButton(scene: Phaser.Scene, x: number, y: number, icon: string, onClick: () => void, size = 72): Phaser.GameObjects.Container {
  const theme = menuTheme()!;
  const c = scene.add.container(x, y);
  const keys = {
    up: skinTexture(scene, 'plate', size, size, 'up'),
    over: skinTexture(scene, 'plate', size, size, 'over'),
    down: skinTexture(scene, 'plate', size, size, 'down'),
  };
  const bg = scene.add.image(0, SKIN_PAD / 2, keys.up);
  const img = scene.add.image(0, 0, icon).setDisplaySize(size * 0.56, size * 0.56).setTint(theme.palette.icon);
  c.add([bg, img]);
  c.setSize(size, size).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => bg.setTexture(keys.over));
  c.on('pointerout', () => { bg.setTexture(keys.up); img.y = 0; });
  c.on('pointerdown', () => { bg.setTexture(keys.down); img.y = 3; });
  c.on('pointerup', (p: Phaser.Input.Pointer) => {
    bg.setTexture(p.wasTouch ? keys.up : keys.over); img.y = 0;
    playSfx(scene, 'ui-click');
    onClick();
  });
  c.setData('icon', img);
  return c;
}

// ------------------------------------------------------------------ the intro

/**
 * The menu's entrance: the logo drops in and bounces, a shine sweeps across its letters (WebGL),
 * then the buttons and the rest pop in one after another. `after` runs when it is done (the
 * logo's idle bob starts there).
 */
export function playMenuIntro(scene: Phaser.Scene, logo: Phaser.GameObjects.Image, items: Phaser.GameObjects.GameObject[], after: () => void): number {
  const y = logo.y;
  logo.y = y - scene.scale.height * 0.3;
  logo.setAlpha(0);
  scene.tweens.add({ targets: logo, alpha: 1, duration: 160 });
  scene.tweens.add({
    targets: logo, y, duration: 760, ease: 'Bounce.easeOut',
    onComplete: () => {
      // the idle bob waits for the sweep: the shine's mask stays where the logo landed
      if (shine(scene, logo)) scene.time.delayedCall(740, after);
      else after();
    },
  });
  // row by row from the top (objects within 70 px of each other's centre line pop together)
  type Item = Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle & { setAlpha?: unknown };
  const rows = [...new Set(items.map((o) => Math.round((o as unknown as Item).y / 70)))].sort((a, b) => a - b);
  items.forEach((o) => {
    const t = o as unknown as Item;
    if (o instanceof Phaser.GameObjects.Zone || typeof t.setAlpha !== 'function') return;
    const delay = 200 + rows.indexOf(Math.round(t.y / 70)) * 70;
    const a = t.alpha;
    // not quite 0: Phaser ignores taps on fully transparent objects, and the menu must answer at once
    t.setAlpha(0.002);
    if (o instanceof Phaser.GameObjects.Container) {
      const s = o.scale;
      o.setScale(s * 0.6);
      scene.tweens.add({ targets: o, scale: s, alpha: a, duration: 380, delay, ease: 'Back.easeOut' });
    } else {
      const y0 = t.y;
      t.y = y0 + 22;
      scene.tweens.add({ targets: o, y: y0, alpha: a, duration: 360, delay, ease: 'Back.easeOut' });
    }
  });
  // when the last row has landed
  return Math.max(800, 200 + rows.length * 70 + 400);
}

/** One shine sweep across the logo's letters: a soft white band, masked to the letters (WebGL only). */
function shine(scene: Phaser.Scene, logo: Phaser.GameObjects.Image): boolean {
  // The letters' white copy, cropped to a moving band and added on top: three nested bands make
  // a soft edge. Plain quads (no mask, no extra render passes), so it costs next to nothing and
  // works on the Canvas renderer too.
  const maskKey = logo.getData('maskKey') as string | undefined;
  if (!maskKey || !scene.textures.exists(maskKey) || !scene.scene.isActive()) return false;
  const src = scene.textures.get(maskKey).getSourceImage();
  const tw = src.width, th = src.height;
  const bands = ([[0.12, 0.2], [0.065, 0.28], [0.028, 0.42]] as const).map(([wf, a]) => ({
    w: tw * wf,
    img: scene.add.image(logo.x, logo.y, maskKey).setOrigin(0.5, 1).setScale(logo.scaleX)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(a).setDepth(logo.depth + 1),
  }));
  const sweep = { x: -tw * 0.08 };
  const place = () => { for (const b of bands) b.img.setCrop(sweep.x - b.w / 2, 0, b.w, th); };
  place();
  scene.tweens.add({
    targets: sweep, x: tw * 1.08, duration: 720, ease: 'Sine.easeInOut',
    onUpdate: place,
    onComplete: () => { for (const b of bands) b.img.destroy(); },
  });
  return true;
}
