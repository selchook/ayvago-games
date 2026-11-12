#!/usr/bin/env python3
"""Composes the Ayvago Games lockup for the menu screens: public/assets/ayvago/menu-logo.png.

The lockup is the last frame of the boot intro (src/core/intro.ts), built from the same brand
PNGs with the same geometry: the "AYVAG" wordmark, the round mark (ring + five red seeds) as the
"O", and the spaced "GAMES" line under it with the red rule on its left. The pieces are white art
for a dark ground; the menu draws the logo on a dark chip, and a soft shadow is baked in so the
edges also hold on light menus.

The PNG is 2x its on-screen size: the menu shows it at exactly half scale, which with linear
filtering is a clean 2:1 box filter, sharp in both the modern and the pixel-art (retro) games.

Usage: python3 tools/build-menu-logo.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'public' / 'assets' / 'ayvago'
OUT = ART / 'menu-logo.png'

PAPER = (0xF3, 0xF2, 0xF2)
ACCENT = (0xEC, 0x30, 0x13)

# lockup geometry at the intro's 1920x1080 reference resolution (keep in sync with intro.ts)
FS = 168
MARK = FS * 0.86
LETTERS_W, LETTERS_H = 1148, 336
ROW_W = LETTERS_W + 5 + MARK
GAMES_W, GAMES_H, RULE_W = 364, 66, 332
SLOT_X, SLOT_Y = ROW_W * 0.5 - MARK * 0.5, 52 - 6

# output: logo ink HEIGHT px high (2x the 54 px it is drawn at), plus PAD px for the shadow
HEIGHT = 108
PAD = 8
SS = 4  # supersampling


def recolour(img: Image.Image, keep_red: bool = False) -> Image.Image:
    """White art -> paper white; with keep_red the red seeds of the mark stay as they are."""
    img = img.convert('RGBA')
    r, g, b, a = img.split()
    paper = Image.new('RGBA', img.size, PAPER + (255,))
    paper.putalpha(a)
    if not keep_red:
        return paper
    # red pixels: R high, G low
    red_mask = ImageChops.subtract(r, g).point(lambda v: 255 if v > 80 else 0)
    return Image.composite(img, paper, red_mask)


def ink_bounds() -> tuple[float, float, float, float]:
    """Left, top, right, bottom of the visible ink in reference units (y up)."""
    def box(name: str, cx: float, cy: float, w: float, h: float):
        im = Image.open(ART / name)
        l, t, r, b = im.getbbox()
        sx, sy = w / im.width, h / im.height
        x0, y0 = cx - w / 2, cy + h / 2
        return x0 + l * sx, y0 - t * sy, x0 + r * sx, y0 - b * sy
    boxes = [
        box('boot_ayvag.png', -ROW_W / 2 + LETTERS_W / 2, 52, LETTERS_W, LETTERS_H),
        box('boot_mark.png', SLOT_X, SLOT_Y, MARK, MARK),
        box('boot_games.png', 179, -104, GAMES_W, GAMES_H),
        (-361, -104 + 1.5, -361 + RULE_W, -104 - 1.5),
    ]
    return (min(b[0] for b in boxes), max(b[1] for b in boxes), max(b[2] for b in boxes), min(b[3] for b in boxes))


def main() -> None:
    left, top, right, bottom = ink_bounds()
    k = HEIGHT / (top - bottom)  # output px per reference unit
    hk = k * SS
    W = round((right - left) * k) + PAD * 2
    W += W % 2
    H = HEIGHT + PAD * 2
    canvas = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))

    def px(x: float, y: float) -> tuple[float, float]:
        """Reference point (y up) -> supersampled canvas pixel."""
        return ((x - left) * hk + PAD * SS, (top - y) * hk + PAD * SS)

    def blit(img: Image.Image, cx: float, cy: float, w: float, h: float) -> None:
        size = (round(w * hk), round(h * hk))
        im = img.resize(size, Image.LANCZOS)
        x, y = px(cx - w / 2, cy + h / 2)
        canvas.alpha_composite(im, (round(x), round(y)))

    blit(recolour(Image.open(ART / 'boot_ayvag.png')), -ROW_W / 2 + LETTERS_W / 2, 52, LETTERS_W, LETTERS_H)
    blit(recolour(Image.open(ART / 'boot_mark.png'), keep_red=True), SLOT_X, SLOT_Y, MARK, MARK)
    blit(recolour(Image.open(ART / 'boot_games.png')), 179, -104, GAMES_W, GAMES_H)
    # the red rule; at menu size the intro's 3 units would be under a pixel, so it keeps 2 px (1 on screen)
    thick = max(3 * hk, 2 * SS)
    x0, y0 = px(-361, -104)
    ImageDraw.Draw(canvas).rectangle([x0, y0 - thick / 2, x0 + RULE_W * hk, y0 + thick / 2], fill=ACCENT + (255,))

    logo = canvas.resize((W, H), Image.LANCZOS)
    # soft dark shadow under the ink, so the white edges hold on light menus too
    alpha = logo.getchannel('A')
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.55)))
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(shadow, (0, 2))
    out.alpha_composite(logo)
    # a 256-colour palette keeps the file small (~8 KB instead of ~45 KB) with no visible loss
    out.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE).save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)}: {W}x{H}, {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
