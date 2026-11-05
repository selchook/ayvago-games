import Phaser from 'phaser';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import type { GameDefinition } from './registry';

/**
 * Visual style of a game. Games in the retro genre keep the pixel look (Press Start 2P,
 * Pixelify Sans, scanlines, chunky buttons). Every other game is modern: rounded fonts, smooth
 * scaling, soft particles, rounded buttons and panels, and no scanlines.
 */
export type VisualStyle = 'retro' | 'modern';

let current: VisualStyle = 'retro';

export function styleOf(def: GameDefinition): VisualStyle {
  return def.style ?? (def.meta.genres.includes('retro') ? 'retro' : 'modern');
}

export function setStyle(style: VisualStyle): void {
  current = style;
}

export function visualStyle(): VisualStyle {
  return current;
}

export const isModern = (): boolean => current === 'modern';

export const MODERN_TITLE = 'Fredoka';
export const MODERN_BODY = 'Nunito';

// The pixel fonts are much wider and taller per pixel than the modern ones; titles written for
// Press Start 2P are scaled up a little so they keep their weight on screen.
const TITLE_SCALE = 1.2;
// Nunito sets a little wider than Pixelify Sans, so body text shrinks a touch to keep its line breaks.
const BODY_SCALE = 0.92;

type StyleInput = Phaser.Types.GameObjects.Text.TextStyle | undefined;

/** Maps a pixel font stack to the modern one; returns how much to scale the size by. */
function modernFamily(family: string): [string, number] {
  if (family.includes('Press Start 2P')) return [`"${MODERN_TITLE}", sans-serif`, TITLE_SCALE];
  if (family.includes('Pixelify Sans')) return [`"${MODERN_BODY}", sans-serif`, BODY_SCALE];
  return [family, 1];
}

function scaleSize(size: string | number | undefined, k: number): string | number | undefined {
  if (k === 1 || size === undefined) return size;
  if (typeof size === 'number') return Math.round(size * k);
  const m = /^([\d.]+)px$/.exec(size.trim());
  return m ? `${Math.round(parseFloat(m[1]) * k)}px` : size;
}

/**
 * Rewrites a text style for the modern look: the modern fonts in place of the pixel ones,
 * bolder weights, and half-width outlines (the pixel look relies on thick black strokes).
 */
export function modernTextStyle(style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
  const s = { ...style };
  if (typeof s.fontFamily === 'string') {
    const [family, k] = modernFamily(s.fontFamily);
    if (family !== s.fontFamily) {
      s.fontFamily = family;
      s.fontSize = scaleSize(s.fontSize, k);
      if (!s.fontStyle || s.fontStyle === 'normal') s.fontStyle = family.includes(MODERN_TITLE) ? '700' : '800';
    }
  }
  if (typeof s.font === 'string' && /Press Start 2P|Pixelify Sans/.test(s.font)) {
    const m = /([\d.]+)px/.exec(s.font);
    const pixel = s.font.includes('Press Start 2P');
    const px = m ? Math.round(parseFloat(m[1]) * (pixel ? TITLE_SCALE : BODY_SCALE)) : 32;
    s.font = `${pixel ? 700 : 800} ${px}px "${pixel ? MODERN_TITLE : MODERN_BODY}", sans-serif`;
  }
  if (typeof s.strokeThickness === 'number' && s.strokeThickness > 0) {
    s.strokeThickness = Math.max(2, Math.round(s.strokeThickness * 0.5));
  }
  return s;
}

let installed = false;

/** Patches Phaser text once so every game, including fonts named in game code, gets the style. */
export function installStyle(): void {
  if (installed || !isModern()) return;
  installed = true;
  const Style = Phaser.GameObjects.TextStyle.prototype;

  const setStyleFn = Style.setStyle;
  Style.setStyle = function (style: StyleInput, updateText?: boolean, setDefaults?: boolean) {
    const next = style ? modernTextStyle(style) : style;
    return setStyleFn.call(this, next as Phaser.Types.GameObjects.Text.TextStyle, updateText as boolean, setDefaults as boolean);
  };

  const setFontFamily = Style.setFontFamily;
  Style.setFontFamily = function (family: string) {
    const [f, k] = modernFamily(family);
    if (k !== 1) this.setFontSize(scaleSize(this.fontSize, k) as string);
    return setFontFamily.call(this, f);
  };

  const setStroke = Style.setStroke;
  Style.setStroke = function (color: string, thickness: number) {
    return setStroke.call(this, color, thickness > 0 ? Math.max(2, Math.round(thickness * 0.5)) : thickness);
  };
}
