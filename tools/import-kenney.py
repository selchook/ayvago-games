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
  python3 tools/import-kenney.py <jam-ready-assets-dir> food-kit furniture-kit
  python3 tools/import-kenney.py <jam-ready-assets-dir> mini-dungeon graveyard-kit
  python3 tools/import-kenney.py <jam-ready-assets-dir> city-kit-commercial city-kit-roads
  python3 tools/import-kenney.py <jam-ready-assets-dir> space-kit planets sfx-sci-fi
  python3 tools/import-kenney.py <jam-ready-assets-dir> mini-skate city-kit-suburban city-kit-industrial sfx-foley
  python3 tools/import-kenney.py <jam-ready-assets-dir> holiday-kit train-kit
  python3 tools/import-kenney.py <jam-ready-assets-dir> road-pack

Mini Forest 1.0 and Mini Characters 2.0 came as zips uploaded by the project owner (kenney.nl
is not reachable from the build machines). Unzip each into one folder, named as below, and pass
that folder (nothing in the zips is run, only the listed files are copied):
  unzip kenney_mini-forest.zip -d <dir>/kenney_mini-forest
  unzip kenney_mini-characters.zip -d <dir>/kenney_mini-characters
  python3 tools/import-kenney.py <dir> mini-forest mini-characters"""
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
    # Mini Dungeon 1.6 and Graveyard Kit 5.0 (jam-ready-assets mirror, Git LFS, commit 397bf9e;
    # pack roots are the mirror's own folders: License.txt + Models/GLB format/)
    'kenney-mini-dungeon/3D/dungeon': 'mini-dungeon',
    'kenney-graveyard-kit/3D/seasonal-holiday': 'graveyard-kit',
    # City Kit Commercial 2.1 and City Kit Roads 2.0 (jam-ready-assets mirror, Git LFS, commit
    # 397bf9e; pack roots are the mirror's own folders: License.txt + Models/GLB format/)
    'kenney-city-kit-commercial/3D/city': 'city-kit-commercial',
    'kenney-city-kit-roads/3D/city': 'city-kit-roads',
    # Space Kit 2.0, Planets 1.0 and Sci-Fi Sounds 1.0 (jam-ready-assets mirror, Git LFS, commit
    # 397bf9e; pack roots are the mirror's own folders: License.txt + Models/GLTF format/, Planets/, Audio/)
    'kenney-space-kit/3D/space-scifi': 'space-kit',
    'kenney-planets/2D/space-scifi': 'planets',
    'kenney-sci-fi-sounds/audio': 'sfx-sci-fi',
    # Mini Skate 1.2, City Kit Suburban 2.0, City Kit Industrial 1.0 and Foley Sounds 1.0
    # (jam-ready-assets mirror, Git LFS, commit 397bf9e; pack roots are the mirror's own folders:
    # License.txt + Models/GLB format/ or Audio/)
    'kenney-mini-skate/3D/sports': 'mini-skate',
    'kenney-city-kit-suburban/3D/city': 'city-kit-suburban',
    'kenney-city-kit-industrial/3D/city': 'city-kit-industrial',
    'kenney-foley-sounds/audio': 'sfx-foley',
    # Holiday Kit 2.0 and Train Kit 1.1 (jam-ready-assets mirror, Git LFS, commit 397bf9e; pack
    # roots are the mirror's own folders: License.txt + Models/GLB format/)
    'kenney-holiday-kit/3D/seasonal-holiday': 'holiday-kit',
    'kenney-train-kit/3D/vehicles-racing': 'train-kit',
    # Road Pack 1.0, the "3D Road Tiles" (jam-ready-assets mirror, Git LFS, commit 397bf9e; pack
    # root is the mirror's own folder: License.txt + Models/GLTF format/tileNNN.glb)
    'kenney-road-pack/3D/city': 'road-pack',
    # Mini Forest 1.0 and Mini Characters 2.0: the owner's uploaded zips, unpacked as
    # <dir>/kenney_mini-forest/ and <dir>/kenney_mini-characters/ (License.txt + Models/GLB format/)
    'kenney_mini-forest': 'mini-forest',
    'kenney_mini-characters': 'mini-characters',
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

# Crypt Crawler (games/crypt-crawler/kit.ts DUNGEON_MODELS / GRAVE_MODELS)
MINI_DUNGEON = [
    'floor', 'floor-detail', 'wall', 'wall-half', 'wall-opening', 'gate', 'chest', 'coin', 'trap', 'barrel',
    'banner', 'column', 'stairs', 'rocks', 'stones', 'weapon-sword', 'weapon-spear', 'shield-round',
    'wood-structure', 'character-orc',
]
GRAVEYARD_KIT = [
    'character-skeleton', 'character-ghost', 'character-zombie', 'character-vampire', 'candle',
    'candle-multiple', 'fire-basket', 'urn-round', 'urn-square', 'altar-stone', 'lantern-candle',
    'pillar-large', 'debris', 'coffin', 'gravestone-cross',
]
FILES['mini-dungeon'] = ['License.txt', 'Models/GLB format/Textures/colormap.png', 'Models/Textures/variation-a.png'] + [f'Models/GLB format/{n}.glb' for n in MINI_DUNGEON]
# Blacktop Kings (games/blacktop-kings/kit.ts CITY_MODELS / ROAD_MODELS): the skyline behind the court,
# street lights, the street and cones
CITY_KIT_COMMERCIAL = [
    'building-a', 'building-c', 'building-e', 'building-g', 'building-h', 'building-k',
    'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c',
    'low-detail-building-a', 'low-detail-building-c', 'low-detail-building-wide-a', 'detail-parasol-a',
]
CITY_KIT_ROADS = ['light-square', 'light-curved', 'road-straight', 'construction-cone']
FILES['city-kit-commercial'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in CITY_KIT_COMMERCIAL]
FILES['city-kit-roads'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in CITY_KIT_ROADS]
FILES['graveyard-kit'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in GRAVEYARD_KIT]

# Star Squadron (games/star-squadron/kit.ts SPACE_MODELS, PLANETS, main.ts sounds): the ships, rocks,
# boss parts and scenery it loads, four planets for the sky and a few sci-fi effects
SPACE_KIT = [
    'craft_speederA', 'craft_speederB', 'craft_speederC', 'craft_speederD', 'craft_racer', 'craft_miner',
    'craft_cargoA', 'craft_cargoB', 'meteor', 'meteor_detailed', 'rock_largeA', 'rock_crystalsLargeA',
    'rock_crystals', 'turret_double', 'turret_single', 'machine_generatorLarge', 'hangar_roundGlass',
    'hangar_roundA', 'hangar_largeA', 'satelliteDish_large', 'satelliteDish_detailed',
    'structure_detailed', 'pipe_straight', 'pipe_ring', 'platform_large', 'rocket_baseA', 'rocket_fuelA',
    'rocket_topA', 'rocket_finsA', 'rocket_sidesA', 'craterLarge', 'crater', 'gate_complex',
    'machine_wireless', 'corridor',
]
PLANETS = ['planet02', 'planet03', 'planet07', 'planet09']
SCI_FI_SOUNDS = [
    'laserSmall_001', 'laserRetro_000', 'laserLarge_000', 'forceField_000', 'lowFrequency_explosion_000',
    'explosionCrunch_000', 'explosionCrunch_002', 'impactMetal_001',
]
FILES['space-kit'] = ['License.txt'] + [f'Models/GLTF format/{n}.glb' for n in SPACE_KIT]
FILES['planets'] = ['License.txt'] + [f'Planets/{n}.png' for n in PLANETS]
FILES['sfx-sci-fi'] = ['License.txt'] + [f'Audio/{n}.ogg' for n in SCI_FI_SOUNDS]

# Kickflip Park (games/kickflip-park/kit.ts SKATE_MODELS / SUBURBAN_MODELS / INDUSTRIAL_MODELS,
# main.ts sounds): every skate piece, the two skaters (their skate clips drive the player's own
# Mini Character), houses, fences and trees around the plaza, warehouses and chimneys around the
# wooden park, and the foley loops for wheels and grinds
MINI_SKATE = [
    'bowl-corner-inner', 'bowl-corner-outer', 'bowl-side', 'floor-concrete', 'floor-wood', 'half-pipe',
    'obstacle-box', 'obstacle-end', 'obstacle-middle', 'pallet', 'rail-curve', 'rail-high', 'rail-low',
    'rail-slope', 'skateboard', 'steps', 'structure-platform', 'structure-wood', 'character-skate-boy',
    'character-skate-girl',
]
CITY_KIT_SUBURBAN = [
    'building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-f',
    'building-type-k', 'building-type-m', 'building-type-o', 'fence-1x4', 'planter', 'tree-large', 'tree-small',
]
CITY_KIT_INDUSTRIAL = [
    'building-a', 'building-b', 'building-g', 'building-h', 'building-k', 'building-p', 'building-s',
    'chimney-large', 'chimney-medium', 'detail-tank',
]
FOLEY_SOUNDS = [
    'Rocks/stoneDrag1', 'Rocks/stoneDrag3', 'Rocks/stoneHit2', 'Swords/swordSlide1', 'Plating/platesSlide3',
    'Plating/platesHit4', 'Woosh/woosh2', 'Woosh/woosh4', 'Woosh/woosh6', 'Woosh/woosh7',
]
FILES['mini-skate'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in MINI_SKATE]
FILES['city-kit-suburban'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in CITY_KIT_SUBURBAN]
FILES['city-kit-industrial'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in CITY_KIT_INDUSTRIAL]
FILES['sfx-foley'] = ['License.txt'] + [f'Audio/{n}.ogg' for n in FOLEY_SOUNDS]

# Snow Express (games/snow-express/kit.ts HOLIDAY / TRAINS): log-cabin modules for the stops,
# presents for the wagons, trees, rocks, snow drifts and village props; the Train Kit's bendable
# `track` piece, a steam locomotive, the express, the diesel that becomes the snowplow and the
# flatbed wagon
HOLIDAY_KIT = [
    'cabin-doorway', 'cabin-window-a', 'cabin-window-b', 'cabin-wall', 'cabin-wall-roof-center', 'cabin-roof-snow-point',
    'cabin-corner-logs', 'present-a-cube', 'present-b-round', 'present-a-rectangle', 'tree-snow-a', 'tree-snow-b',
    'tree-snow-c', 'tree-decorated-snow', 'rocks-large', 'rocks-medium', 'rocks-small', 'snow-pile', 'snow-bunker',
    'snow-flat', 'snowman-hat', 'lantern', 'lights-colored', 'reindeer', 'sled', 'bench', 'candy-cane-red',
    'wreath-decorated', 'gingerbread-man', 'nutcracker',
]
TRAIN_KIT = ['track', 'train-locomotive-a', 'train-electric-bullet-a', 'train-diesel-a', 'train-carriage-flatbed']
FILES['holiday-kit'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in HOLIDAY_KIT]
FILES['train-kit'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in TRAIN_KIT]

# Delivery Dash (games/delivery-dash/tiles.ts ROAD_TILES): the numbered road tiles the towns are
# built from. The full catalogue of all 294 tiles (what each one is) is the table in tiles.ts
ROAD_TILES = [5, 11, 17, 21, 26, 27, 29, 34, 41, 47, 53, 59, 78, 84, 85, 92, 103, 119, 157, 169, 203]
FILES['road-pack'] = ['License.txt'] + [f'Models/GLTF format/tile{n:03d}.glb' for n in ROAD_TILES]
# Zombie Grove (games/zombie-grove/kit.ts): the whole Mini Forest (camp, trees, rocks, the archer
# hero, bow and arrow); from Mini Characters 2.0 the models the platform characters and the games
# load: the first eleven (golden-podium, kickflip-park, CHARACTER_MODELS in @core/three) and the
# zombie roster, heroes, robot helper, weapons and shield of Zombie Grove
MINI_FOREST = [
    'bridge', 'building-platform', 'building-roof', 'building-structure', 'character-archer', 'fence', 'flag',
    'ladder', 'patch-dirt', 'patch-grass', 'plant', 'platform', 'rocks-high', 'rocks-low', 'rocks-ramp', 'stones',
    'target', 'tent', 'tree-high', 'tree', 'weapon-arrow', 'weapon-bow',
]
MINI_CHARACTERS = [
    'character-male-a', 'character-male-b', 'character-male-c', 'character-male-d', 'character-male-e',
    'character-male-f', 'character-male-g', 'character-female-f', 'character-soldier', 'character-zombie', 'weapon-bow',
    'character-raider', 'character-alien', 'character-robot', 'character-knight', 'character-worker',
    'weapon-sword', 'weapon-spear', 'weapon-shooter', 'weapon-arrow', 'shield-round',
]
FILES['mini-forest'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in MINI_FOREST]
FILES['mini-characters'] = ['License.txt', 'Models/GLB format/Textures/colormap.png'] + [f'Models/GLB format/{n}.glb' for n in MINI_CHARACTERS]

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
            if out.endswith('.ogg'):
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', out, '-b:a', '96k', out[:-4] + '.mp3'], check=True)
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
