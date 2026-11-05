"""Build the five player characters (public/assets/characters/<id>/<pose>.png) from the figures of
Kenney's CC0 Platformer Characters 1 (from a checkout of the ETdoFresh/kenney.nl mirror). Every pose
the pack draws is imported, so games show the character's own limbs for kicks, hangs and cheers.

It also builds an armless `archer` body with separate `arm` and `hand` parts and writes their
shoulder points to src/core/character-rig.json, for games that pose the arms themselves (Archery),
together with the foot tip of `kick` and the raised fist of `hang` (where a ball or a rope meets them).

Every pose lands on the same 144x176 canvas: the character is scaled so its standing pose is 150 px
tall, its feet sit 2 px above the bottom edge and its standing pose is centred, so games can swap
characters without touching sizes or offsets.

Poses the pack does not draw are derived from the character's own `front` and `back` pictures by
moving its own legs (the rows below the shorts), never by drawing a limb (see DERIVED):
walking towards and away from the camera (`walkdown1/2`, `walkup1/2`) and a penalty kick seen
from behind (`backkick1` wind-up, `backkick2` strike, `backkick3` follow-through).

Usage: python3 tools/import-characters.py <kenney.nl mirror dir>
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'characters')
W, H, TARGET, FOOT = 144, 176, 150, 2

POSES = ['stand', 'front', 'walk1', 'walk2', 'jump', 'hit', 'duck', 'climb1', 'climb2', 'swim1', 'swim2',
         'kick', 'hang', 'fall', 'slide', 'skid', 'cheer1', 'cheer2', 'hold1', 'hold2', 'action1', 'action2',
         'back', 'talk']

# Derived poses: source pose and, per leg, (dx, dy, rotation in degrees counter-clockwise, height
# scale), then the body's dy. Legs are the frame's rows from LEG_Y down, split at the centre; a
# lifted leg is shorter (it points towards or away from the camera). `top` draws that leg over the
# body (a foot swung back towards the camera), otherwise legs go behind the body.
LEG_Y = 160
LEG_L, LEG_R = (28, 72), (72, 118)
DERIVED = {
    'walkdown1': ('front', {'r': (0, -2, 0, 1), 'l': (1, -7, 0, 0.8)}, -2, None),
    'walkdown2': ('front', {'l': (0, -2, 0, 1), 'r': (-1, -7, 0, 0.8)}, -2, None),
    'walkup1': ('back', {'r': (0, -2, 0, 1), 'l': (1, -7, 0, 0.8)}, -2, None),
    'walkup2': ('back', {'l': (0, -2, 0, 1), 'r': (-1, -7, 0, 0.8)}, -2, None),
    'backkick1': ('back', {'l': (-1, 0, 0, 1), 'r': (4, -13, 10, 0.9)}, 1, 'r'),
    'backkick2': ('back', {'r': (8, -3, 0, 0.8), 'l': (-2, 0, 0, 1)}, 1, None),
    'backkick3': ('back', {'r': (6, -6, 0, 0.62), 'l': (-2, 0, 0, 1)}, -1, None),
}

FIGURES = {'adventurer': 'Adventurer/Poses/adventurer', 'explorer': 'Female/Poses/female',
           'rookie': 'Player/Poses/player', 'soldier': 'Soldier/Poses/soldier', 'zombie': 'Zombie/Poses/zombie'}
FIGURE_POSE = {'front': 'idle', 'hit': 'hurt'}


def sources(mirror):
    base = os.path.join(mirror, 'kenney_platformercharacters', 'PNG')
    for cid, stem in FIGURES.items():
        files = {p: os.path.join(base, f'{stem}_{FIGURE_POSE.get(p, p)}.png') for p in POSES}
        limbs = os.path.join(base, stem.split('/')[0], 'Limbs')
        yield cid, files, figure_rig(limbs, os.path.join(base, f'{stem}_idle.png'))


def place(img, scale, ox, oy):
    big = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H))
    if ox >= 0 and oy >= 0:
        canvas.alpha_composite(big, (round(ox), round(oy)))
    else:
        canvas.paste(big, (round(ox), round(oy)), big)
    return canvas


def build(cid, files, rig_source):
    stand = Image.open(files['stand']).convert('RGBA')
    sx0, sy0, sx1, sy1 = stand.getbbox()
    scale = TARGET / (sy1 - sy0)
    # Offsets that put the standing pose's box centred with its feet at the bottom; every pose of
    # this character uses the same offsets, so its motion between frames is kept.
    ox = W / 2 - (sx0 + sx1) / 2 * scale
    oy = H - FOOT - sy1 * scale
    os.makedirs(os.path.join(OUT, cid), exist_ok=True)
    for pose, path in files.items():
        canvas = place(Image.open(path).convert('RGBA'), scale, ox, oy)
        if canvas.getbbox() is None:
            raise SystemExit(f'{cid} {pose}: empty frame')
        canvas.save(os.path.join(OUT, cid, f'{pose}.png'), optimize=True)
    def point(x, y):
        return [round(ox + x * scale), round(oy + y * scale)]

    body, arm, hand, shoulders = rig_source()
    place(body, scale, ox, oy).save(os.path.join(OUT, cid, 'archer.png'), optimize=True)
    for name, part in (('arm', arm), ('hand', hand)):
        part.resize((round(part.width * scale), round(part.height * scale)), Image.LANCZOS) \
            .save(os.path.join(OUT, cid, f'{name}.png'), optimize=True)
    return {
        'shoulders': [point(x, y) for x, y in shoulders],
        'arm': [round(arm.width * scale), round(arm.height * scale)],
        'kickFoot': point(*kick_foot(files['kick'])),
        'hangHand': point(*hang_hand(files['hang'])),
    }


def kick_foot(path):
    """Tip of the kicking foot: the figures face right, so the rightmost opaque column of the lower
    half of the pose, at the middle of its opaque rows."""
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 128
    rows = np.where(a.any(axis=1))[0]
    low = a[(rows.min() + rows.max()) // 2:]
    x = int(np.where(low.any(axis=0))[0].max())
    ys = np.where(low[:, x - 3:x + 1].any(axis=1))[0] + (rows.min() + rows.max()) // 2
    return x - 4, int(ys.mean())


def hang_hand(path):
    """Grip of the raised fist in `hang`: the figures hang by their right hand, so the rightmost
    opaque column of the upper half of the pose, a fist's half-width inside it."""
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 128
    rows = np.where(a.any(axis=1))[0]
    mid = (rows.min() + rows.max()) // 2
    up = a[:mid]
    x = int(np.where(up.any(axis=0))[0].max())
    ys = np.where(up[:, x - 3:x + 1].any(axis=1))[0]
    return x - 10, int(ys.mean())


def _find(img, tpl):
    """Top-left of tpl inside img, by squared difference over the template's opaque pixels."""
    a, t = np.asarray(img, np.float32), np.asarray(tpl, np.float32)
    mask = t[..., 3] > 200
    th, tw = mask.shape
    best = None
    for y in range(a.shape[0] - th + 1):
        for x in range(a.shape[1] - tw + 1):
            d = ((a[y:y + th, x:x + tw, :3] - t[..., :3])[mask] ** 2).mean()
            if best is None or d < best[0]:
                best = (d, x, y)
    return best[1], best[2]


def figure_rig(limbs, idle_path):
    """Platformer Characters 1 ships each figure's limbs: rebuild the idle pose without its arms
    (legs from the idle pose inside the body's columns, then the body, then the aiming head)."""
    def rig():
        idle = Image.open(idle_path).convert('RGBA')
        head, focus, body, arm, hand = (Image.open(os.path.join(limbs, f)).convert('RGBA') for f in
                                        ('head.png', 'head_focus.png', 'body_front.png', 'arm.png', 'hand.png'))
        hx, hy = _find(idle, head)
        bx, by = _find(idle, body)
        out = Image.new('RGBA', idle.size)
        top = by + body.height - 2
        out.alpha_composite(idle.crop((bx, top, bx + body.width, idle.height)), (bx, top))
        out.alpha_composite(body, (bx, by))
        out.alpha_composite(focus, (hx, hy))
        return out, arm, hand, [(bx + 5, by + 6), (bx + body.width - 5, by + 6)]
    return rig


def derive(cid):
    """Writes the DERIVED poses of one character from its imported `front` and `back`."""
    for name, (src_pose, legs, body_dy, top) in DERIVED.items():
        src = Image.open(os.path.join(OUT, cid, f'{src_pose}.png')).convert('RGBA')
        body = src.crop((0, 0, W, LEG_Y))

        def leg(side):
            x0, x1 = LEG_L if side == 'l' else LEG_R
            dx, dy, rot, sy = legs[side]
            part = src.crop((x0, LEG_Y, x1, H))
            part = part.resize((part.width, max(1, round(part.height * sy))), Image.LANCZOS)
            layer = Image.new('RGBA', (W, H))
            layer.alpha_composite(part, (x0 + dx, LEG_Y + dy))
            if rot:
                layer = layer.rotate(rot, resample=Image.BICUBIC, center=((x0 + x1) / 2 + dx, LEG_Y + dy))
            return layer

        out = Image.new('RGBA', (W, H))
        for side in legs:
            if side != top:
                out.alpha_composite(leg(side))
        lifted = Image.new('RGBA', (W, H))
        lifted.paste(body, (0, body_dy))
        out.alpha_composite(lifted)
        if top:
            out.alpha_composite(leg(top))
        out.save(os.path.join(OUT, cid, f'{name}.png'), optimize=True)


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    ids, rigs = [], {}
    for cid, files, rig in sources(sys.argv[1]):
        rigs[cid] = build(cid, files, rig)
        derive(cid)
        ids.append(cid)
    with open(os.path.join(ROOT, 'src', 'core', 'character-rig.json'), 'w') as f:
        json.dump(rigs, f, indent=2)
        f.write('\n')
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'size': [W, H], 'poses': POSES + list(DERIVED), 'characters': ids}, f, indent=2)
        f.write('\n')
    print(f'{len(ids)} characters x {len(POSES) + len(DERIVED)} poses -> {OUT}')


if __name__ == '__main__':
    main()
