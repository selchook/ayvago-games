import Phaser from 'phaser';
import './fonts/ayvago-pixel-tr.css';

// Press Start 2P draws the capitals İ, Ö and Ü squashed to the shape of a lowercase i, ö and ü,
// so Turkish titles read "BiTTi" or "GöKTAŞI". "Ayvago Pixel TR" (tools/build-tr-font.py) is a
// three-glyph face with full-height İ, Ö and Ü; its unicode-range limits it to those letters, so
// it can go first in any stack.
export const TURKISH_I_FAMILY = 'Ayvago Pixel TR';

const TITLE_FAMILY = 'Press Start 2P';
// Phaser measures a text's height from this string; the marks of İ, Ö and Ü sit above it, so text
// that contains one is measured with İ too (same height), or the marks are cut off.
const TEST_STRING = '|MÉqgy';
const TEST_STRING_I = '|MÉqgyİ';

/** Puts the Turkish capitals face in front of Press Start 2P in a font-family list or a `font` shorthand. */
export function withTurkishI(font: string): string {
  if (!font.includes(TITLE_FAMILY) || font.includes(TURKISH_I_FAMILY)) return font;
  return font.replace(/(["']?)Press Start 2P\1/, `"${TURKISH_I_FAMILY}", $&`);
}

type StyleInput = Phaser.Types.GameObjects.Text.TextStyle | undefined;

let installed = false;

/** Patches Phaser text once so every game's titles get the Turkish capitals face, with no per-game changes. */
export function installTurkishI(): void {
  if (installed) return;
  installed = true;
  const Style = Phaser.GameObjects.TextStyle.prototype;

  const setStyle = Style.setStyle;
  Style.setStyle = function (style: StyleInput, updateText?: boolean, setDefaults?: boolean) {
    if (style && (typeof style.fontFamily === 'string' || typeof style.font === 'string')) {
      style = { ...style };
      if (typeof style.fontFamily === 'string') style.fontFamily = withTurkishI(style.fontFamily);
      if (typeof style.font === 'string') style.font = withTurkishI(style.font);
    }
    return setStyle.call(this, style as Phaser.Types.GameObjects.Text.TextStyle, updateText as boolean, setDefaults as boolean);
  };

  const setFontFamily = Style.setFontFamily;
  Style.setFontFamily = function (family: string) {
    return setFontFamily.call(this, withTurkishI(family));
  };

  const setFont = Style.setFont;
  Style.setFont = function (font: string | object, updateText?: boolean) {
    return setFont.call(this, typeof font === 'string' ? withTurkishI(font) : font, updateText as boolean);
  };

  const Text = Phaser.GameObjects.Text.prototype;
  const updateText = Text.updateText;
  Text.updateText = function (this: Phaser.GameObjects.Text) {
    const style = this.style;
    const want = /[İÖÜ]/.test(this.text) && style.fontFamily.includes(TURKISH_I_FAMILY) ? TEST_STRING_I : TEST_STRING;
    if (style.testString !== want) {
      style.testString = want;
      // metrics is public in Phaser's TextStyle but missing from its typings.
      (style as unknown as { metrics: unknown }).metrics = Phaser.GameObjects.MeasureText(style);
    }
    return updateText.call(this);
  };
}
