"""Build the ten player characters (public/assets/characters/<id>/<pose>.png) from two Kenney CC0
packs: the aliens of Platformer Pack Redux (already in public/assets/kenney/platformer) and the five
figures of Platformer Characters 1 (from a checkout of the ETdoFresh/kenney.nl mirror).

Every pose lands on the same 144x176 canvas: the character is scaled so its standing pose is 150 px
tall, its feet sit 2 px above the bottom edge and its standing pose is centred, so games can swap
characters without touching sizes or offsets.

Usage: python3 tools/import-characters.py <kenney.nl mirror dir>
"""
import json
import os
import sys

from PIL import Image

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
        yield cid, {p: os.path.join(ALIEN_DIR, f'{stem}_{p}.png') for p in POSES}
    base = os.path.join(mirror, 'kenney_platformercharacters', 'PNG')
    for cid, stem in FIGURES.items():
        yield cid, {p: os.path.join(base, f'{stem}_{FIGURE_POSE.get(p, p)}.png') for p in POSES}


def build(cid, files):
    stand = Image.open(files['stand']).convert('RGBA')
    sx0, sy0, sx1, sy1 = stand.getbbox()
    scale = TARGET / (sy1 - sy0)
    # Offsets that put the standing pose's box centred with its feet at the bottom; every pose of
    # this character uses the same offsets, so its motion between frames is kept.
    ox = W / 2 - (sx0 + sx1) / 2 * scale
    oy = H - FOOT - sy1 * scale
    os.makedirs(os.path.join(OUT, cid), exist_ok=True)
    for pose, path in files.items():
        img = Image.open(path).convert('RGBA')
        big = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        canvas = Image.new('RGBA', (W, H))
        canvas.alpha_composite(big, (round(ox), round(oy))) if ox >= 0 and oy >= 0 else canvas.paste(big, (round(ox), round(oy)), big)
        if canvas.getbbox() is None:
            raise SystemExit(f'{cid} {pose}: empty frame')
        canvas.save(os.path.join(OUT, cid, f'{pose}.png'), optimize=True)


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    ids = []
    for cid, files in sources(sys.argv[1]):
        build(cid, files)
        ids.append(cid)
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'size': [W, H], 'poses': POSES, 'characters': ids}, f, indent=2)
        f.write('\n')
    print(f'{len(ids)} characters x {len(POSES)} poses -> {OUT}')


if __name__ == '__main__':
    main()
