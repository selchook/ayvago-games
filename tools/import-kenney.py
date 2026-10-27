"""Copy curated Kenney CC0 packs from a local checkout of the ETdoFresh/kenney.nl mirror
into public/assets/kenney/<short>/, normalising paths (lowercase, no spaces) and
adding .mp3 twins for every .ogg (Safari). Usage: python3 tools/import-kenney.py <mirror-dir>"""
import os, re, shutil, subprocess, sys

SRC = sys.argv[1]
DST = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'kenney')

PACKS = {
    'spaceshooter': 'space-shooter', 'puzzlepack': 'puzzle', 'puzzle-pack-ii': 'puzzle2',
    'tappyplane': 'tappy-plane', 'jumperpack_kenney': 'jumper', 'kenney_sokobanpack': 'sokoban',
    'topdowntanks': 'tanks', 'topdown-shooter': 'topdown-shooter', 'kenney_fishpack': 'fish',
    'boardgamepack': 'boardgame', 'kenney_digitalaudio': 'sfx-digital', 'kenney_fontpackage': 'fonts',
    'kenney_interfacesounds': 'sfx-interface', 'kenney_impactsounds': 'sfx-impact',
    'kenney_musicjingles': 'jingles', 'platformerart_pixelredux_2': 'pixel-platformer',
    'kenney_microroguelike_1.2': 'micro-roguelike', '1bitpack_kenney_1.1': 'onebit',
    'shooting-gallery-pack': 'shooting-gallery', 'kenney_racingpack_updated': 'racing',
    'alien-ufo-pack': 'alien-ufo', 'kenney_animalpackredux': 'animals', 'kenney_sportspack': 'sports',
    'tower-defense-top-down': 'tower-defense', 'assets-lettertiles-0': 'letter-tiles',
    'physicspack': 'physics', 'particlePack_1.1': 'particles', 'kenney_simplifiedplatformer': 'simple-platformer',
    'pixeluipack': 'pixel-ui', 'uipack_fixed': 'ui', 'kenney_casinoaudio': 'sfx-casino',
    'kenney_uiaudio': 'sfx-ui', 'onscreencontrols': 'onscreen-controls', 'hexagon-pack': 'hexagon',
    'platformer-pack-redux-360-assets': 'platformer', 'gameicons': 'game-icons',
    'kenney_emotespack': 'emotes', 'kenneymedals': 'medals', 'kenney_foliagepack': 'foliage',
}
KEEP = {'.png', '.ogg', '.ttf', '.xml', '.json', '.txt', '.tsx'}
SKIP = re.compile(r'(^|/)(preview|sample|information|instructions?)[^/]*$|desktop\.ini|/vector/|/spritesheets?/.*\.(swf)$', re.I)

def norm(p):
    p = p.replace('(', '').replace(')', '').replace('&', 'and')
    p = re.sub(r'\s+', '_', p.strip()).lower()
    return p

count = 0
for pack, short in PACKS.items():
    root = os.path.join(SRC, pack)
    for dp, _, files in os.walk(root):
        for f in files:
            rel = os.path.relpath(os.path.join(dp, f), root)
            ext = os.path.splitext(f)[1].lower()
            if ext not in KEEP or SKIP.search('/' + rel.replace(os.sep, '/')):
                continue
            if ext == '.txt' and 'license' not in f.lower():
                continue
            out = os.path.join(DST, short, norm(rel))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copyfile(os.path.join(dp, f), out)
            count += 1
            if ext == '.ogg':
                mp3 = out[:-4] + '.mp3'
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', out, '-b:a', '96k', mp3], check=True)
print('copied', count)
