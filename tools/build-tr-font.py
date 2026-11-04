"""Build the Turkish capital dotted I (U+0130) face for the title font.

Press Start 2P draws every accented capital squashed to five rows so the accent fits inside the
cap height. For Ö or Ğ that still reads well, but its İ ends up the same shape as a lowercase i,
so Turkish titles read "BiTTi". This builds a one-glyph face with a full-height I and the dot
above it. It is a Modified Version under the SIL OFL, so it carries its own family name
("Ayvago Pixel TR"; "Press Start 2P" is a Reserved Font Name). The core lists it first in the
title font stack, and its unicode-range limits it to U+0130 (src/core/fonts/ayvago-pixel-tr.css).

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

# The font's pixel is 125 units: the capital I spans rows 125-1000, the dot sits one row above.
PIXELS = [(125, 125, 875, 250), (375, 250, 625, 875), (125, 875, 875, 1000), (375, 1125, 625, 1250)]


def main():
    font = TTFont(SRC)
    opts = Options()
    opts.name_IDs = []
    opts.notdef_outline = True
    sub = Subsetter(opts)
    sub.populate(unicodes=[0x130])
    sub.subset(font)
    pen = TTGlyphPen(None)
    for x0, y0, x1, y1 in PIXELS:
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    font['glyf']['Idotaccent'] = pen.glyph()
    name = font['name']
    name.names = []
    for nid, value in ((0, 'Copyright 2012 The Press Start 2P Project Authors (cody@zone38.net). '
                           'Modified 2026 for Ayvago: capital dotted I.'),
                       (1, FAMILY), (2, 'Regular'), (3, f'{FAMILY}-Regular'), (4, FAMILY),
                       (5, 'Version 1.0'), (6, 'AyvagoPixelTR-Regular'),
                       (13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'),
                       (14, 'https://openfontlicense.org')):
        name.setName(value, nid, 3, 1, 0x409)
    font.flavor = 'woff'
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    font.save(OUT)
    print(f'{FAMILY}: U+0130 -> {OUT} ({os.path.getsize(OUT)} bytes)')


if __name__ == '__main__':
    main()
