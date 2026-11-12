"""Copy curated Kenney CC0 packs from a local checkout of the ETdoFresh/kenney.nl mirror
into public/assets/kenney/<short>/, normalising paths (lowercase, no spaces) and
adding .mp3 twins for every .ogg (Safari). 3D kits keep only their GLB models.
Usage: python3 tools/import-kenney.py <mirror-dir> [short-name ...]   (names limit the run to those packs)

Kenney's newer 3D kits are not in that mirror; they come from a checkout of
github.com/series-ai/jam-ready-assets (Git LFS: fetch the listed files first), whose packs sit
under <pack>/3D/vehicles-racing/. Those kits keep only the files a game uses (FILES), store
their GLBs under models/gltf_format/ like the older kits, and keep the external texture folder
`Textures/` as the GLBs reference it (case matters on the server).
  python3 tools/import-kenney.py <jam-ready-assets-dir> toy-car-kit racing-kit-ea
  python3 tools/import-kenney.py <jam-ready-assets-dir> food-kit furniture-kit"""
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
    # 3D kits (GLB only)
    'carkit_v1.4': 'car-kit', 'kenney_platformerkit': 'platformer-kit', 'kenney_natureKit_2.1': 'nature-kit',
    'kenney_racingkit2': 'racing-kit', 'minigolf-kit-2.0': 'minigolf-kit',
    # newer textured 3D kits (jam-ready-assets mirror, see above)
    'kenney-toy-car-kit/3D/vehicles-racing': 'toy-car-kit',
    'kenney-racing-kit-early-access/3D/vehicles-racing': 'racing-kit-ea',
    # Pirate Kit 2.1 (not in the ETdoFresh mirror; any checkout with the zip's layout works)
    'kenney_pirate-kit': 'pirate-kit',
    # Tower Defense Kit 2.0 (jam-ready-assets mirror, Git LFS; laid out as the zip:
    # kenney_tower-defense-kit/License.txt + Models/GLB format/)
    'kenney_tower-defense-kit': 'tower-defense-kit',
    # Food Kit 2.0 and Furniture Kit 2.1 (jam-ready-assets mirror, Git LFS, commit 397bf9e; the
    # pack roots below are the mirror's own folders: License.txt + Models/GLB|GLTF format/)
    'kenney-food-kit/3D/food': 'food-kit',
    'kenney-furniture-kit/3D/interior-furniture': 'furniture-kit',
}
# Kits imported only in part: the models the games load (plus the shared texture and the license).
PICK = {
    'pirate-kit': {
        'ship-pirate-medium', 'ship-small', 'ship-medium', 'ship-large', 'ship-ghost', 'ship-pirate-small', 'ship-wreck',
        'barrel', 'chest', 'bottle-large', 'cannon-ball', 'cannon', 'crate',
        'patch-sand', 'patch-sand-foliage', 'patch-grass-foliage', 'palm-bend', 'palm-straight', 'palm-detailed-bend',
        'rocks-a', 'rocks-b', 'rocks-c', 'rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c',
        'tower-complete-small', 'tower-watch', 'castle-wall', 'castle-gate',
        'structure', 'structure-roof', 'structure-platform-dock', 'flag-pirate-high',
    },
    # Crystal Keep: the tiles, towers, weapons, ammo and UFOs it loads (games/crystal-keep/kit.ts KIT_MODELS)
    'tower-defense-kit': {
        'tile', 'tile-straight', 'tile-corner-round', 'tile-end-round', 'tile-spawn-end-round', 'tile-split',
        'tile-tree', 'tile-tree-double', 'tile-tree-quad', 'tile-rock', 'tile-crystal', 'tile-hill',
        'tile-river-straight', 'tile-river-bridge', 'snow-tile', 'snow-tile-straight',
        'snow-tile-corner-round', 'snow-tile-end-round', 'snow-tile-spawn-end-round', 'snow-tile-split',
        'snow-tile-tree', 'snow-tile-tree-double', 'snow-tile-tree-quad', 'snow-tile-rock',
        'snow-tile-crystal', 'snow-tile-hill', 'detail-tree', 'detail-tree-large', 'detail-rocks',
        'detail-crystal', 'detail-crystal-large', 'snow-detail-tree', 'snow-detail-tree-large',
        'snow-detail-rocks', 'snow-detail-crystal', 'tower-round-bottom-a', 'tower-round-bottom-c',
        'tower-round-middle-a', 'tower-round-middle-c', 'tower-round-top-b', 'tower-round-crystals',
        'tower-square-bottom-a', 'tower-square-bottom-b', 'tower-square-bottom-c', 'tower-square-middle-a',
        'tower-square-middle-b', 'tower-square-top-a', 'weapon-ballista', 'weapon-cannon', 'weapon-catapult',
        'weapon-turret', 'weapon-ammo-arrow', 'weapon-ammo-cannonball', 'weapon-ammo-boulder',
        'weapon-ammo-bullet', 'enemy-ufo-a', 'enemy-ufo-b-weapon', 'enemy-ufo-d-weapon', 'selection-a',
    },
}
# Kits imported file by file (paths relative to the pack root): only what the games load.
FILES = {
    'toy-car-kit': ['License.txt', 'Models/GLB format/Textures/colormap.png',
                    'Models/GLB format/vehicle-monster-truck.glb', 'Models/GLB format/vehicle-suv.glb'],
    'racing-kit-ea': ['License.txt', 'Models/GLB format/Textures/colormap.png',
                      'Models/GLB format/overhead-arch-striped.glb', 'Models/GLB format/barrels.glb',
                      'Models/GLB format/tent-roof-large.glb', 'Models/GLB format/tent-open-wide.glb',
                      'Models/GLB format/flag-green-tall.glb', 'Models/GLB format/flag-yellow-tall.glb'],
}

# Snack Shack (games/snack-shack/kit.ts FOOD_MODELS / FURNITURE_MODELS)
FOOD_KIT = [
    'burger', 'burger-cheese', 'meat-patty', 'meat-sausage', 'hot-dog', 'fries', 'soda',
    'ice-cream', 'ice-cream-cne', 'cabbage', 'tomato', 'plate', 'pot', 'bread', 'bottle-ketchup',
    'bottle-musterd', 'cupcake', 'shaker-salt', 'shaker-pepper',
]
FURNITURE_KIT = [
    'kitchenBar', 'kitchenBarEnd', 'kitchenCabinet', 'kitchenStove', 'kitchenStoveElectric',
    'kitchenCoffeeMachine', 'kitchenFridgeLarge', 'kitchenMicrowave',
    'stoolBar', 'wall', 'wallWindow', 'wallDoorway', 'pottedPlant', 'plantSmall1', 'trashcan', 'radio',
    'televisionModern', 'rugRectangle', 'tableRound', 'chair',
]
FILES['food-kit'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in FOOD_KIT]
FILES['furniture-kit'] = ['License.txt'] + [f'Models/GLTF format/{n}.glb' for n in FURNITURE_KIT]

def norm_file(rel):
    """FILES kits: GLBs in models/gltf_format/ (what kenney3d() expects), Textures/ kept as named."""
    out = norm(rel).replace('models/glb_format/', 'models/gltf_format/')
    return out.replace('/textures/', '/Textures/')
ONLY = set(sys.argv[2:])
KEEP = {'.png', '.ogg', '.ttf', '.xml', '.json', '.txt', '.tsx', '.glb'}
SKIP = re.compile(r'(^|/)(preview|sample|information|instructions?)[^/]*$|desktop\.ini|/vector/|/spritesheets?/.*\.(swf)$'
                  r'|^/(isometric|side|topdown)/|/models/(fbx|obj|dae) format/', re.I)

def norm(p):
    p = p.replace('(', '').replace(')', '').replace('&', 'and')
    p = re.sub(r'\s+', '_', p.strip()).lower()
    # newer kits ship 'Models/GLB format'; the runtime reads every kit from models/gltf_format
    p = p.replace('models/glb_format/', 'models/gltf_format/')
    # GLBs that share an external texture name it 'Textures/colormap.png' (case matters on the web)
    p = p.replace('models/gltf_format/textures/', 'models/gltf_format/Textures/')
    return p

count = 0
for pack, short in PACKS.items():
    if ONLY and short not in ONLY:
        continue
    root = os.path.join(SRC, pack)
    if short in FILES:
        for rel in FILES[short]:
            src = os.path.join(root, rel)
            with open(src, 'rb') as fh:
                if fh.read(40).startswith(b'version https://git-lfs'):
                    sys.exit(f'{src} is a Git LFS pointer: fetch the file first')
            out = os.path.join(DST, short, norm_file(rel))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copyfile(src, out)
            count += 1
        continue
    for dp, _, files in os.walk(root):
        for f in files:
            rel = os.path.relpath(os.path.join(dp, f), root)
            ext = os.path.splitext(f)[1].lower()
            if ext not in KEEP or SKIP.search('/' + rel.replace(os.sep, '/')):
                continue
            if ext == '.txt' and 'license' not in f.lower():
                continue
            if short in PICK and ext == '.glb' and os.path.splitext(f)[0].lower() not in PICK[short]:
                continue
            out = os.path.join(DST, short, norm(rel))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copyfile(os.path.join(dp, f), out)
            count += 1
            if ext == '.ogg':
                mp3 = out[:-4] + '.mp3'
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', out, '-b:a', '96k', mp3], check=True)
print('copied', count)
