# Street Heat: the city's texture layers, step 1 of the import (step 2: import-city.mjs).
# Kept as a record and for a re-import; not part of the build. Nothing from the source folder is
# run: the PNGs are read as data and rewritten.
#
#   python3 -I games/street-heat/import-textures.py <Downtown City MegaKit Textures dir> <out dir>
#
# Writes <out dir>/layers.jpg: the 2048 px PBR base colours of Quaternius' Downtown City MegaKit
# [Standard] (CC0 1.0) reduced to 256 px tiles stacked top to bottom, one per layer of the game's
# array texture (LAYERS in import-city.mjs and scenery.ts, same order). A few layers are made from
# the kit's pictures: the pale brick (the kit tints it in its own shader), lawn grass (its dirt,
# turned green), slabbed pavement (its concrete with joints), worn road paint (a crop of the
# crosswalk stripe) and the road markings (its decal sheet; their alpha goes to decals-alpha.png,
# 256 px grey). Normal, ORM and HDR files are not used.
import sys, os
from PIL import Image, ImageDraw, ImageEnhance, ImageOps, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
T = 256
LAYERS = ['white', 'asphalt', 'pavement', 'metal', 'brick', 'palebrick', 'trim', 'slate', 'ornaments', 'dirt', 'grass',
          'paint', 'decals', 'glass', 'concrete']


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def tile(im):
    return im.resize((T, T), Image.LANCZOS)


def flat(c):
    return Image.new('RGBA', (T, T), c + (255,))


def make(layer):
    if layer == 'white':
        return flat((255, 255, 255))
    if layer == 'asphalt':
        return tile(load('T_Concrete_Asphalt_BaseColor.png'))
    if layer == 'pavement':
        im = ImageEnhance.Brightness(tile(load('T_Concrete_BaseColor.png'))).enhance(0.92)
        d = ImageDraw.Draw(im)
        for k in range(0, T, 64):
            d.line([(k, 0), (k, T)], fill=(70, 70, 72, 255), width=2)
            d.line([(0, k), (T, k)], fill=(70, 70, 72, 255), width=2)
        return im
    if layer == 'metal':
        return tile(load('T_MetalConcrete_BaseColor.png'))
    if layer == 'brick':
        return tile(load('T_RedBrick_BaseColor.png'))
    if layer == 'palebrick':
        b = tile(load('T_RedBrick_BaseColor.png')).convert('RGB')
        b = ImageEnhance.Color(b).enhance(0.35)
        b = ImageEnhance.Brightness(b).enhance(1.55)
        return b.convert('RGBA')
    if layer == 'trim':
        return tile(load('T_Trim_BaseColor.png'))
    if layer == 'slate':
        return tile(load('T_RoofSlate_BaseColor.png'))
    if layer == 'ornaments':
        return tile(load('T_Ornaments_BaseColor.png'))
    if layer == 'dirt':
        return tile(load('T_Dirt_BaseColor.png'))
    if layer == 'grass':
        g = ImageOps.grayscale(tile(load('T_Dirt_BaseColor.png')))
        g = ImageEnhance.Contrast(g).enhance(1.6)
        return ImageOps.colorize(g, (28, 58, 22), (120, 170, 70)).convert('RGBA')
    if layer == 'paint':
        d = load('T_Street_Decals.png').crop((40, 34, 552, 108)).resize((T, T), Image.LANCZOS)
        base = flat((96, 96, 98))
        base.alpha_composite(d)
        w = ImageEnhance.Brightness(base.convert('RGB')).enhance(1.25)
        return w.convert('RGBA')
    if layer == 'decals':
        # the sheet with its alpha; the colour bleeds under the transparent texels so the mipmaps
        # do not fringe dark
        d = load('T_Street_Decals.png').resize((T, T), Image.LANCZOS)
        rgb = Image.new('RGBA', (T, T), (220, 220, 215, 255))
        a = d.split()[3]
        rgb.paste(d.convert('RGB'), (0, 0), a)
        rgb.putalpha(a)
        return rgb
    if layer == 'glass':
        im = Image.new('RGBA', (T, T))
        d = ImageDraw.Draw(im)
        for y in range(T):
            k = y / T
            d.line([(0, y), (T, y)], fill=(int(40 + 30 * k), int(52 + 34 * k), int(70 + 30 * k), 255))
        return im
    if layer == 'concrete':
        return tile(load('T_Concrete_BaseColor.png'))
    raise ValueError(layer)


os.makedirs(OUT, exist_ok=True)
sheet = Image.new('RGBA', (T, T * len(LAYERS)))
for i, name in enumerate(LAYERS):
    sheet.paste(make(name), (0, i * T))
sheet.convert('RGB').save(os.path.join(OUT, 'layers.jpg'), quality=84, optimize=True, progressive=False)
make('decals').split()[3].save(os.path.join(OUT, 'decals-alpha.png'), optimize=True)
for f in ('layers.jpg', 'decals-alpha.png'):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
