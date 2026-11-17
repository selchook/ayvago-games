"""Build the Turkish capitals face for the title font (İ, Ö, Ü).

Press Start 2P draws every accented capital squashed to five rows so the accent fits inside the
cap height. For Ç, Ş and Ğ that still reads well (their marks sit below the line, and ğ has a
descender), but İ ends up the same shape as a lowercase i ("BiTTi"), and Ö and Ü the same shape
as ö and ü ("GöKTAŞI", "SöNDüR"). This builds a three-glyph face with full-height I, O and U and
their marks above the cap height. It is a Modified Version under the SIL OFL, so it carries its
own family name ("Ayvago Pixel TR"; "Press Start 2P" is a Reserved Font Name). The core lists it
first in the title font stack, and its unicode-range limits it to these three letters
(src/core/fonts/ayvago-pixel-tr.css).

Usage: python3 tools/build-tr-font.py
"""
import os

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'node_modules', '@fontsource', 'press-start-2p', 'files',
                   'press-start-2p-latin-ext-400-normal.woff')
OUT = os.path.join(ROOT, 'src', 'core', 'fonts', 'ayvago-pixel-tr.woff')
FAMILY = 'Ayvago Pixel TR'

# The font's pixel is 125 units: capitals span rows 125-1000, the marks sit one row above
# (1125-1250), like the dot of the İ. The letter shapes copy Press Start 2P's own I, O and U.
DOTS = [(125, 1125, 375, 1250), (500, 1125, 750, 1250)]
GLYPHS = {
    0x130: ('Idotaccent', [(125, 125, 875, 250), (375, 250, 625, 875), (125, 875, 875, 1000),
                           (375, 1125, 625, 1250)]),
    0xD6: ('Odieresis', [(125, 875, 750, 1000), (0, 250, 250, 875), (625, 250, 875, 875),
                         (125, 125, 750, 250)] + DOTS),
    0xDC: ('Udieresis', [(0, 250, 250, 1000), (625, 250, 875, 1000), (125, 125, 750, 250)] + DOTS),
}


def draw(rects):
    pen = TTGlyphPen(None)
    for x0, y0, x1, y1 in rects:
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    return pen.glyph()


def main():
    font = TTFont(SRC)
    opts = Options()
    opts.name_IDs = []
    opts.notdef_outline = True
    sub = Subsetter(opts)
    sub.populate(unicodes=[0x130])
    sub.subset(font)
    # The Latin-1 letters are not in the latin-ext file: add them with the İ's metrics.
    order = font.getGlyphOrder()
    for code, (glyph, rects) in GLYPHS.items():
        if glyph not in order:
            order.append(glyph)
        font['glyf'][glyph] = draw(rects)
        font['hmtx'][glyph] = (1000, min(r[0] for r in rects))
        for table in font['cmap'].tables:
            table.cmap[code] = glyph
    font.setGlyphOrder(order)
    font['glyf'].glyphOrder = order
    name = font['name']
    name.names = []
    for nid, value in ((0, 'Copyright 2012 The Press Start 2P Project Authors (cody@zone38.net). '
                           'Modified 2026 for Ayvago: full-height capital I, O and U with marks.'),
                       (1, FAMILY), (2, 'Regular'), (3, f'{FAMILY}-Regular'), (4, FAMILY),
                       (5, 'Version 1.1'), (6, 'AyvagoPixelTR-Regular'),
                       (13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'),
                       (14, 'https://openfontlicense.org')):
        name.setName(value, nid, 3, 1, 0x409)
    font.flavor = 'woff'
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    font.save(OUT)
    print(f'{FAMILY}: U+0130 U+00D6 U+00DC -> {OUT} ({os.path.getsize(OUT)} bytes)')


if __name__ == '__main__':
    main()
