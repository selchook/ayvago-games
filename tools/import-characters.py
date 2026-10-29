"""Build the ten player characters (public/assets/characters/<id>/<pose>.png) from two Kenney CC0
packs: the aliens of Platformer Pack Redux (already in public/assets/kenney/platformer) and the five
figures of Platformer Characters 1 (from a checkout of the ETdoFresh/kenney.nl mirror).

It also builds an armless `archer` body with separate `arm` and `hand` parts and writes their
shoulder points to src/core/character-rig.json, for games that pose the arms themselves (Archery).

Every pose lands on the same 144x176 canvas: the character is scaled so its standing pose is 150 px
tall, its feet sit 2 px above the bottom edge and its standing pose is centred, so games can swap
characters without touching sizes or offsets.

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

POSES = ['stand', 'front', 'walk1', 'walk2', 'jump', 'hit', 'duck', 'climb1', 'climb2', 'swim1', 'swim2']

ALIEN_DIR = os.path.join(ROOT, 'public', 'assets', 'kenney', 'platformer', 'png', 'players', '128x256')
ALIENS = {'alien-green': 'green/aliengreen', 'alien-blue': 'blue/alienblue', 'alien-pink': 'pink/alienpink',
          'alien-yellow': 'yellow/alienyellow', 'alien-beige': 'beige/alienbeige'}
FIGURES = {'adventurer': 'Adventurer/Poses/adventurer', 'explorer': 'Female/Poses/female',
           'rookie': 'Player/Poses/player', 'soldier': 'Soldier/Poses/soldier', 'zombie': 'Zombie/Poses/zombie'}
FIGURE_POSE = {'front': 'idle', 'hit': 'hurt'}


def sources(mirror):
    for cid, stem in ALIENS.items():
        files = {p: os.path.join(ALIEN_DIR, f'{stem}_{p}.png') for p in POSES}
        yield cid, files, alien_rig(files['front'])
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
    body, arm, hand, shoulders = rig_source()
    place(body, scale, ox, oy).save(os.path.join(OUT, cid, 'archer.png'), optimize=True)
    for name, part in (('arm', arm), ('hand', hand)):
        part.resize((round(part.width * scale), round(part.height * scale)), Image.LANCZOS) \
            .save(os.path.join(OUT, cid, f'{name}.png'), optimize=True)
    return {
        'shoulders': [[round(ox + x * scale), round(oy + y * scale)] for x, y in shoulders],
        'arm': [round(arm.width * scale), round(arm.height * scale)],
    }


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


def alien_rig(front_path):
    """The aliens have no separate limbs: erase the arms beside the torso (keeping the white
    helmet ring) and draw capsule arms in the body colour."""
    def rig():
        im = Image.open(front_path).convert('RGBA')
        a = np.asarray(im).copy()
        solid = a[..., 3] > 40
        cx = solid.shape[1] // 2
        hip = np.where(solid[:, cx])[0].max() - 6
        left = right = cx
        while left > 0 and solid[hip, left - 1]:
            left -= 1
        while right < solid.shape[1] - 1 and solid[hip, right + 1]:
            right += 1
        rgb = a[..., :3].astype(int)
        white = (rgb.min(axis=2) > 200) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 30)
        top = np.where(solid.any(axis=1))[0].min()
        erase = np.zeros_like(solid)
        erase[top:hip + 1, :left - 1] = True
        erase[top:hip + 1, right + 2:] = True
        erase &= ~white & solid
        # Shoulders: on the torso edges just below the helmet ring, where the arms hang from.
        ring_bottom = int(np.where((white & solid).any(axis=1))[0].max())
        shoulders = [(left + 5, ring_bottom - 6), (right - 5, ring_bottom - 6)]
        torso = a[hip - 30:hip, left + 6:right - 6]
        keep = (torso[..., 3] > 200) & ~white[hip - 30:hip, left + 6:right - 6]
        colour = tuple(int(v) for v in np.median(torso[keep][:, :3], axis=0))
        a[erase, 3] = 0
        dark = tuple(max(0, c - 45) for c in colour)
        arm = Image.new('RGBA', (17, 58))
        d = ImageDraw.Draw(arm)
        d.rounded_rectangle((0, 0, 16, 57), radius=8, fill=dark + (255,))
        d.rounded_rectangle((2, 2, 14, 55), radius=6, fill=colour + (255,))
        hand = Image.new('RGBA', (22, 22))
        d = ImageDraw.Draw(hand)
        d.ellipse((0, 0, 21, 21), fill=dark + (255,))
        d.ellipse((2, 2, 19, 19), fill=colour + (255,))
        return Image.fromarray(a), arm, hand, shoulders
    return rig


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    ids, rigs = [], {}
    for cid, files, rig in sources(sys.argv[1]):
        rigs[cid] = build(cid, files, rig)
        ids.append(cid)
    with open(os.path.join(ROOT, 'src', 'core', 'character-rig.json'), 'w') as f:
        json.dump(rigs, f, indent=2)
        f.write('\n')
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'size': [W, H], 'poses': POSES, 'characters': ids}, f, indent=2)
        f.write('\n')
    print(f'{len(ids)} characters x {len(POSES)} poses -> {OUT}')


if __name__ == '__main__':
    main()
